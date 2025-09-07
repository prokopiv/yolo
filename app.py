import os, io, time, base64, json, asyncio, logging
from typing import Optional, List, Dict, Any
import numpy as np
from PIL import Image, ImageDraw
import requests
from collections import deque
from datetime import datetime
import openai

import torch
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl
from pydantic_settings import BaseSettings

from ultralytics import YOLO
from threading import Lock
import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import init_database, get_async_session
from models import Prompt

class Settings(BaseSettings):
    YOLO_MODEL: str = "yolo11n.pt"
    API_KEY: Optional[str] = None
    DEFAULT_IMGSZ: int = 640
    DEFAULT_CONF: float = 0.25
    DEFAULT_IOU: float = 0.45
    MAX_FRAME_QUEUE: int = 30
    MAX_FPS_SAMPLES: int = 30
    FRAME_SKIP_THRESHOLD: float = 100.0
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o"
    SCENE_ANALYSIS_ENABLED: bool = True
    COLLAGE_SIZE: int = 8
    FRAME_SAMPLING_INTERVAL: float = 1.0
    REALTIME_MODEL: str = "gpt-realtime"
    REALTIME_VOICE: str = "cedar"

settings = Settings()

# Pydantic models for API
class PromptCreate(BaseModel):
    name: str
    content: str

class PromptUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None

class PromptResponse(BaseModel):
    id: int
    name: str
    content: str
    created_at: str
    updated_at: str

app = FastAPI(title="YOLO11 Inference API", version="1.0.0")

# Initialize OpenAI client
openai_client = None
if settings.OPENAI_API_KEY and settings.SCENE_ANALYSIS_ENABLED:
    openai_client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

_device = "cuda" if torch.cuda.is_available() else "cpu"
_model = YOLO(settings.YOLO_MODEL)
_model.to(_device)

try:
    _model.fuse()
except Exception:
    pass
torch.set_grad_enabled(False)
try:
    torch.set_float32_matmul_precision("high")
except Exception:
    pass

with torch.inference_mode():
    dummy = np.zeros((settings.DEFAULT_IMGSZ, settings.DEFAULT_IMGSZ, 3), dtype=np.uint8)
    _ = _model.predict(source=dummy, imgsz=settings.DEFAULT_IMGSZ, conf=settings.DEFAULT_CONF, iou=settings.DEFAULT_IOU, verbose=False, device=_device)

_names = _model.model.names if hasattr(_model, "model") else _model.names
_lock = Lock()
_executor = ThreadPoolExecutor(max_workers=2)
_frame_queue = asyncio.Queue(maxsize=settings.MAX_FRAME_QUEUE)
_active_connections = set()
_performance_stats = {"total_frames": 0, "dropped_frames": 0, "avg_latency": 0.0}

# Scene analysis components
class FrameSampler:
    def __init__(self, interval: float = 1.0):
        self.interval = interval
        self.last_sample_time = 0
        self.collected_frames = []
        
    def should_sample(self, current_time: float) -> bool:
        return current_time - self.last_sample_time >= self.interval
    
    def add_frame(self, image: Image.Image, timestamp: float) -> bool:
        if self.should_sample(timestamp):
            self.collected_frames.append({
                'image': image.copy(),
                'timestamp': timestamp
            })
            self.last_sample_time = timestamp
            return True
        return False
    
    def get_frames_for_collage(self, count: int) -> List[Dict]:
        if len(self.collected_frames) >= count:
            frames = self.collected_frames[:count]
            self.collected_frames = self.collected_frames[count:]
            return frames
        return []

_frame_sampler = FrameSampler(settings.FRAME_SAMPLING_INTERVAL)
_scene_analysis_queue = asyncio.Queue(maxsize=10)

def create_collage(frames: List[Dict], target_size: tuple = (800, 600)) -> Image.Image:
    """Create a collage from 8 frames arranged in 2x4 grid"""
    # if len(frames) != 8:
    #     raise ValueError(f"Expected 8 frames, got {len(frames)}")
    
    # Calculate grid dimensions and individual frame size
    rows, cols = 2, 4
    frame_width = target_size[0] // cols
    frame_height = target_size[1] // rows
    
    # Create blank collage
    collage = Image.new('RGB', target_size, (0, 0, 0))
    draw = ImageDraw.Draw(collage)
    
    for i, frame_data in enumerate(frames):
        # Calculate position in grid
        row = i // cols
        col = i % cols
        x = col * frame_width
        y = row * frame_height
        
        # Resize frame to fit grid cell
        frame = frame_data['image'].resize((frame_width, frame_height), Image.LANCZOS)
        collage.paste(frame, (x, y))
        
        # Add timestamp text (optional)
        timestamp_str = datetime.fromtimestamp(frame_data['timestamp']).strftime('%H:%M:%S')
        try:
            draw.text((x + 5, y + 5), timestamp_str, fill=(255, 255, 255))
        except:
            pass  # Skip if drawing text fails
    
    return collage

def collage_to_base64(collage: Image.Image) -> str:
    """Convert collage image to base64 string for OpenAI API"""
    buffer = io.BytesIO()
    collage.save(buffer, format='JPEG', quality=85)
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

async def analyze_scene_with_openai(collage_b64: str) -> Optional[str]:
    """Analyze collage using OpenAI Vision API"""
    if not openai_client:
        logger.warning("OpenAI client not configured")
        return None
    
    try:
        prompt = """
You are analyzing a sequence of 8 consecutive video frames arranged in a 2x4 grid, captured from a camera. 
Each frame was taken 1 second apart and shows the progression of events over 8 seconds.

Please provide a concise description of what is happening in this sequence. Focus on:
1. Main subjects/objects and their movements
2. Any significant events or changes between frames
3. Overall scene context and activity patterns
4. Any notable interactions or behaviors

Respond with 2-3 sentences maximum, describing the key events and movements you observe across the sequence.
"""
        
        response = await asyncio.get_event_loop().run_in_executor(
            _executor,
            lambda: openai_client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{collage_b64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=300,
                temperature=0.3
            )
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return None

async def scene_analysis_worker():
    """Background task for processing scene analysis"""
    logger.info("Scene analysis worker started")
    
    while True:
        try:
            # Check if we have enough frames for a collage
            frames = _frame_sampler.get_frames_for_collage(settings.COLLAGE_SIZE)
            if not frames:
                await asyncio.sleep(0.5)  # Wait a bit before checking again
                continue
            
            logger.info(f"Processing collage with {len(frames)} frames")
            
            # Create collage
            collage = create_collage(frames)
            collage_b64 = collage_to_base64(collage)

            collage_thumb = collage.resize((200, 100), Image.Resampling.LANCZOS)
            collage_thumb_b64 = collage_to_base64(collage_thumb)

            # Analyze with OpenAI
            description = await analyze_scene_with_openai(collage_b64)

            if description:
                # Put result in queue for WebSocket broadcasting
                analysis_result = {
                    "type": "scene_description",
                    "img": collage_thumb_b64,
                    "timestamp": time.time(),
                    "description": description,
                    "frame_count": len(frames),
                    "time_span": f"{len(frames)} seconds"
                }
                
                try:
                    _scene_analysis_queue.put_nowait(analysis_result)
                    logger.info(f"Scene analysis completed: {description[:50]}...")
                except asyncio.QueueFull:
                    logger.warning("Scene analysis queue full, dropping result")
            
        except Exception as e:
            logger.error(f"Scene analysis worker error: {e}")
            await asyncio.sleep(1)  # Wait before retrying

# Global variable for the background task
_scene_analysis_task = None

def _require_auth(authorization: Optional[str]):
    if settings.API_KEY:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Bearer token")
        token = authorization.split(" ", 1)[1].strip()
        if token != settings.API_KEY:
            raise HTTPException(status_code=403, detail="Invalid token")

def _validate_websocket_auth(token: Optional[str]) -> bool:
    if not settings.API_KEY:
        return True
    return token == settings.API_KEY

async def _async_predict(img: Image.Image, conf: float, iou: float, imgsz: int, max_det: Optional[int] = None) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    
    def _sync_predict():
        with _lock, torch.inference_mode():
            results = _model.predict(source=img, imgsz=imgsz, conf=conf, iou=iou,
                                   max_det=max_det, device=_device, verbose=False)
        return results[0]
    
    result = await loop.run_in_executor(_executor, _sync_predict)
    return _result_to_dict(result, normalize=False)

async def _should_skip_frame(current_latency: float, queue_size: int) -> bool:
    logger.info("queue_size:" + str(queue_size) + " > MAX_FRAME_QUEUE:" + str(settings.MAX_FRAME_QUEUE * 0.8))
    logger.info("current_latency:" + str(current_latency) + " > FRAME_SKIP_THRESHOLD:" + str(settings.FRAME_SKIP_THRESHOLD))

    if queue_size > settings.MAX_FRAME_QUEUE * 0.8:
        return True
    if current_latency > settings.FRAME_SKIP_THRESHOLD:
        return True
    return False

def _update_performance_stats(latency: float, dropped: bool = False):
    _performance_stats["total_frames"] += 1
    if dropped:
        _performance_stats["dropped_frames"] += 1
    else:
        current_avg = _performance_stats["avg_latency"]
        total = _performance_stats["total_frames"]
        _performance_stats["avg_latency"] = (current_avg * (total - 1) + latency) / total


def _load_image_from_base64(b64: str) -> Image.Image:
    try:
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")

def _load_image_from_url(url: str, timeout=8) -> Image.Image:
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch image: {e}")

def _result_to_dict_normalized(payload: Dict[str, Any]) -> Dict[str, Any]:
    detections = payload.get("detections", [])
    w, h = payload["image"]["width"], payload["image"]["height"]
    
    for det in detections:
        if "box_xyxy" in det:
            x1, y1, x2, y2 = det["box_xyxy"]["x1"], det["box_xyxy"]["y1"], det["box_xyxy"]["x2"], det["box_xyxy"]["y2"]
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            width, height = x2 - x1, y2 - y1
            det["box_norm_xywh"] = {
                "x": cx / w, "y": cy / h,
                "w": width / w, "h": height / h
            }
    return payload

def numpy_image_to_base64(arr: np.ndarray, fmt: str = "JPEG", size=(100, 100)) -> str:
    """
    arr: numpy array з формою HxW (L), HxWx3 (RGB) або HxWx4 (RGBA)
         dtype бажано uint8. Для float [0,1] — див. нижче.
    fmt: "PNG" (без втрат, підтримує прозорість) або "JPEG" (з втратами)
    """
    # Якщо масив у float [0,1] або [0,255], приведемо до uint8
    if arr.dtype != np.uint8:
        if arr.dtype.kind == "f":  # float
            arr = np.clip(arr * (255 if arr.max() <= 1.0 else 1.0), 0, 255).astype(np.uint8)
        else:
            arr = np.clip(arr, 0, 255).astype(np.uint8)

    img = Image.fromarray(arr)  # сам визначить L/RGB/RGBA по формі

    img = img.resize(size, Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    save_kwargs = {}
    if fmt.upper() == "JPEG":
        # Налаштування якості для JPEG (за потреби)
        save_kwargs.update({"quality": 90, "optimize": True})

    img.save(buf, format=fmt.upper(), **save_kwargs)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/{fmt.lower()};base64,{b64}"

def _result_to_dict(res, normalize: bool):
    # res: ultralytics.engine.results.Results
    h, w = res.orig_shape
    boxes = res.boxes
    if boxes is None or boxes.shape[0] == 0:
        return {"image": {"width": w, "height": h}, "detections": [], "speed_ms": res.speed if hasattr(res, "speed") else {}}

    xyxy = boxes.xyxy.cpu().numpy()       # [N,4]
    conf = boxes.conf.cpu().numpy()       # [N]
    cls  = boxes.cls.cpu().numpy().astype(int)  # [N]

    if normalize:
        xywhn = boxes.xywhn.cpu().numpy()  # normalized [0..1]
        dets = []
        for i in range(xyxy.shape[0]):
            dets.append({
                "class_id": int(cls[i]),
                "class_name": _names.get(int(cls[i]), str(int(cls[i]))),
                "confidence": float(conf[i]),
                "box_norm_xywh": {
                    "x": float(xywhn[i][0]),
                    "y": float(xywhn[i][1]),
                    "w": float(xywhn[i][2]),
                    "h": float(xywhn[i][3]),
                }
            })
    else:
        dets = []
        for i in range(xyxy.shape[0]):
            x1, y1, x2, y2 = xyxy[i].tolist()
            dets.append({
                "class_id": int(cls[i]),
                "class_name": _names.get(int(cls[i]), str(int(cls[i]))),
                "confidence": float(conf[i]),
                "box_xyxy": {"x1": float(x1), "y1": float(y1), "x2": float(x2), "y2": float(y2)},
                "box_xywh": {
                    "x": float(x1),
                    "y": float(y1),
                    "w": float(x2 - x1),
                    "h": float(y2 - y1),
                }
            })

    return {
        "image": {"width": w, "height": h},
        "detections": dets,
        "speed_ms": res.speed if hasattr(res, "speed") else {}
    }

class DetectJSON(BaseModel):
    image_base64: Optional[str] = None
    image_url:    Optional[HttpUrl] = None
    conf:   Optional[float] = None
    iou:    Optional[float] = None
    imgsz:  Optional[int]   = None
    max_det: Optional[int]  = None
    normalize: bool = False
    return_image: bool = False

class RealtimeSessionRequest(BaseModel):
    instructions: Optional[str] = None
    voice: Optional[str] = None
    modalities: List[str] = ["text", "audio"]


@app.get("/")
async def root():
    return {"message": "YOLO11 WebSocket API", "docs_url": "/docs", "websocket_url": "/ws/detect", "demo_url": "/static/index.html"}

@app.get("/health")
def health():
    return {"status": "ok", "device": _device, "model": settings.YOLO_MODEL}

@app.get("/realtime/token")
async def realtime_token():
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    session_config = {
        "session": {
            "type": "realtime",
            "model": settings.REALTIME_MODEL,
            "audio": {
                "input": {
                    "transcription": {
                        "model": "whisper-1",
                    }
                },
                "output": {
                    "voice": settings.REALTIME_VOICE,
                },
            },
        },
    }
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=session_config,
            timeout=10
        )
        response.raise_for_status()

        return {"status": "ok", "ephemeral_key": response.json()["value"]}

    except requests.exceptions.RequestException as e:
        logger.error(f"Token generation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate token")


@app.post("/detect")
async def detect_json(req: DetectJSON, authorization: Optional[str] = Header(default=None)):
    _require_auth(authorization)

    if not req.image_base64 and not req.image_url:
        raise HTTPException(status_code=400, detail="Provide image_base64 or image_url")

    if req.image_base64:
        img = _load_image_from_base64(req.image_base64)
    else:
        img = _load_image_from_url(str(req.image_url))

    conf  = req.conf  if req.conf  is not None else settings.DEFAULT_CONF
    iou   = req.iou   if req.iou   is not None else settings.DEFAULT_IOU
    imgsz = req.imgsz if req.imgsz is not None else settings.DEFAULT_IMGSZ

    t0 = time.perf_counter()
    payload = await _async_predict(img, conf, iou, imgsz, req.max_det)
    dt = (time.perf_counter() - t0) * 1000.0
    payload["latency_ms_total"] = dt
    
    if req.normalize:
        payload = _result_to_dict_normalized(payload)
    
    if req.return_image:
        with _lock, torch.inference_mode():
            results = _model.predict(source=img, imgsz=imgsz, conf=conf, iou=iou,
                                   max_det=req.max_det, device=_device, verbose=False)
        res = results[0]
        annotated = res.plot()
        annotated = annotated[:, :, ::-1]
        im = Image.fromarray(annotated)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
        payload["image_annotated_base64"] = base64.b64encode(buf.getvalue()).decode("utf-8")

    return JSONResponse(payload)

@app.post("/detect-file")
def detect_file(file: UploadFile = File(...), authorization: Optional[str] = Header(default=None),
                conf: Optional[float] = None, iou: Optional[float] = None,
                imgsz: Optional[int] = None, max_det: Optional[int] = None,
                normalize: bool = False):
    _require_auth(authorization)

    try:
        img = Image.open(io.BytesIO(file.file.read())).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

    conf  = conf  if conf  is not None else settings.DEFAULT_CONF
    iou   = iou   if iou   is not None else settings.DEFAULT_IOU
    imgsz = imgsz if imgsz is not None else settings.DEFAULT_IMGSZ

    t0 = time.perf_counter()
    with _lock, torch.inference_mode():
        results = _model.predict(source=img, imgsz=imgsz, conf=conf, iou=iou,
                                 max_det=max_det, device=_device, verbose=False)
    dt = (time.perf_counter() - t0) * 1000.0

    res = results[0]
    payload = _result_to_dict(res, normalize=normalize)
    payload["latency_ms_total"] = dt
    return JSONResponse(payload)

@app.post("/detect-image")
def detect_image(file: UploadFile = File(...), authorization: Optional[str] = Header(default=None),
                 conf: Optional[float] = None, iou: Optional[float] = None,
                 imgsz: Optional[int] = None, max_det: Optional[int] = None):
    _require_auth(authorization)

    try:
        img = Image.open(io.BytesIO(file.file.read())).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

    conf  = conf  if conf  is not None else settings.DEFAULT_CONF
    iou   = iou   if iou   is not None else settings.DEFAULT_IOU
    imgsz = imgsz if imgsz is not None else settings.DEFAULT_IMGSZ

    with _lock, torch.inference_mode():
        results = _model.predict(source=img, imgsz=imgsz, conf=conf, iou=iou,
                                 max_det=max_det, device=_device, verbose=False)
    res = results[0]
    annotated = res.plot()  # numpy BGR
    annotated = annotated[:, :, ::-1]  # -> RGB
    im = Image.fromarray(annotated)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")

@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    await websocket.accept()
    _active_connections.add(websocket)
    
    authenticated = False
    fps_times = deque(maxlen=settings.MAX_FPS_SAMPLES)
    
    try:
        while True:
            message = await websocket.receive_text()
            
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON format"
                }))
                continue
            
            if data.get("type") == "auth" and not authenticated:
                token = data.get("token")
                if _validate_websocket_auth(token):
                    authenticated = True
                    await websocket.send_text(json.dumps({
                        "type": "auth_success",
                        "message": "Authentication successful"
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "auth_error",
                        "message": "Authentication failed"
                    }))
                continue
            
            if settings.API_KEY and not authenticated:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Authentication required"
                }))
                continue
            
            if data.get("type") == "frame":
                frame_start = time.perf_counter()
                
                try:
                    frame_b64 = data.get("frame")
                    if not frame_b64:
                        raise ValueError("No frame data provided")
                    
                    queue_size = _frame_queue.qsize()
                    avg_latency = sum(fps_times) / len(fps_times) if fps_times else 0
                    
                    if await _should_skip_frame(avg_latency, queue_size):
                        _update_performance_stats(0, dropped=True)
                        await websocket.send_text(json.dumps({
                            "type": "frame_skipped",
                            "reason": "performance_optimization",
                            "queue_size": queue_size,
                            "avg_latency": round(avg_latency, 2)
                        }))
                        continue
                    
                    img = _load_image_from_base64(frame_b64)
                    params = data.get("params", {})
                    
                    conf = params.get("conf", settings.DEFAULT_CONF)
                    iou = params.get("iou", settings.DEFAULT_IOU)
                    imgsz = params.get("imgsz", settings.DEFAULT_IMGSZ)
                    max_det = params.get("max_det")
                    
                    payload = await _async_predict(img, conf, iou, imgsz, max_det)
                    
                    # Add frame to scene analysis sampler if enabled
                    if settings.SCENE_ANALYSIS_ENABLED and openai_client:
                        current_timestamp = time.time()
                        _frame_sampler.add_frame(img, current_timestamp)
                    
                    frame_time = (time.perf_counter() - frame_start) * 1000.0
                    fps_times.append(frame_time)
                    _update_performance_stats(frame_time)
                    
                    current_fps = 1000.0 / (sum(fps_times) / len(fps_times)) if fps_times else 0
                    
                    response = {
                        "type": "detection",
                        "timestamp": data.get("timestamp", time.time()),
                        "detections": payload["detections"],
                        "image": payload["image"],
                        "latency_ms": round(frame_time, 2),
                        "fps": round(current_fps, 1),
                        "queue_size": queue_size,
                        "performance": {
                            "total_frames": _performance_stats["total_frames"],
                            "dropped_frames": _performance_stats["dropped_frames"],
                            "drop_rate": round(_performance_stats["dropped_frames"] / _performance_stats["total_frames"] * 100, 1) if _performance_stats["total_frames"] > 0 else 0
                        }
                    }
                    
                    await websocket.send_text(json.dumps(response))
                    
                    # Check for scene analysis results and send them
                    try:
                        while not _scene_analysis_queue.empty():
                            scene_result = _scene_analysis_queue.get_nowait()
                            await websocket.send_text(json.dumps(scene_result))
                    except asyncio.QueueEmpty:
                        pass
                    except Exception as scene_error:
                        logger.error(f"Error sending scene analysis: {scene_error}")
                    
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"Processing error: {str(e)}"
                    }))
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Connection error: {str(e)}"
            }))
        except:
            pass
    finally:
        _active_connections.discard(websocket)

@app.on_event("startup")
async def startup_event():
    global _scene_analysis_task
    # Initialize database
    await init_database()
    logger.info("Database initialized")
    
    if settings.SCENE_ANALYSIS_ENABLED and openai_client:
        _scene_analysis_task = asyncio.create_task(scene_analysis_worker())
        logger.info("Scene analysis background task started")

@app.on_event("shutdown")
async def shutdown_event():
    global _scene_analysis_task
    if _scene_analysis_task:
        _scene_analysis_task.cancel()
        try:
            await _scene_analysis_task
        except asyncio.CancelledError:
            pass
        logger.info("Scene analysis background task stopped")

@app.get("/stats")
async def get_performance_stats():
    return {
        "performance": _performance_stats,
        "active_connections": len(_active_connections),
        "device": _device,
        "model": settings.YOLO_MODEL,
        "frame_queue_size": _frame_queue.qsize() if hasattr(_frame_queue, 'qsize') else 0,
        "scene_analysis": {
            "enabled": settings.SCENE_ANALYSIS_ENABLED,
            "openai_configured": openai_client is not None,
            "collected_frames": len(_frame_sampler.collected_frames) if _frame_sampler else 0,
            "analysis_queue_size": _scene_analysis_queue.qsize() if hasattr(_scene_analysis_queue, 'qsize') else 0,
            "task_running": _scene_analysis_task is not None and not _scene_analysis_task.done() if _scene_analysis_task else False
        }
    }


# Prompt management API endpoints
@app.get("/api/prompts", response_model=List[PromptResponse])
async def get_prompts(session: AsyncSession = Depends(get_async_session)):
    """Get all prompts"""
    result = await session.execute(select(Prompt))
    prompts = result.scalars().all()
    return [PromptResponse(**prompt.to_dict()) for prompt in prompts]


@app.get("/api/prompts/{prompt_id}", response_model=PromptResponse)
async def get_prompt(prompt_id: int, session: AsyncSession = Depends(get_async_session)):
    """Get prompt by ID"""
    result = await session.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return PromptResponse(**prompt.to_dict())


@app.post("/api/prompts", response_model=PromptResponse)
async def create_prompt(prompt_data: PromptCreate, session: AsyncSession = Depends(get_async_session)):
    """Create new prompt"""
    # Check if name already exists
    result = await session.execute(select(Prompt).where(Prompt.name == prompt_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Prompt with this name already exists")
    
    prompt = Prompt(name=prompt_data.name, content=prompt_data.content)
    session.add(prompt)
    await session.commit()
    await session.refresh(prompt)
    return PromptResponse(**prompt.to_dict())


@app.put("/api/prompts/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: int, 
    prompt_data: PromptUpdate, 
    session: AsyncSession = Depends(get_async_session)
):
    """Update existing prompt"""
    result = await session.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Check if new name conflicts with existing names
    if prompt_data.name and prompt_data.name != prompt.name:
        name_check = await session.execute(select(Prompt).where(Prompt.name == prompt_data.name))
        if name_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Prompt with this name already exists")
        prompt.name = prompt_data.name
    
    if prompt_data.content is not None:
        prompt.content = prompt_data.content
    
    await session.commit()
    await session.refresh(prompt)
    return PromptResponse(**prompt.to_dict())


@app.delete("/api/prompts/{prompt_id}")
async def delete_prompt(prompt_id: int, session: AsyncSession = Depends(get_async_session)):
    """Delete prompt"""
    result = await session.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    await session.delete(prompt)
    await session.commit()
    return {"message": "Prompt deleted successfully"}