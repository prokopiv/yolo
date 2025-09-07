// Core types for the application

export interface Detection {
  class_name: string
  confidence: number
  box_xyxy: BoundingBox
  smoothed_box?: BoundingBox
  isTracked?: boolean
  opacity?: number
}

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface SceneDescription {
  text: string
  img: string
  timestamp: Date
  frameCount: number
  timeSpan: string
}

export interface ChatMessage {
  role: string
  text: string
  timestamp: Date
}

export interface Prompt {
  id: number
  name: string
  content: string
  created_at?: string
  updated_at?: string
}

export interface PromptCreate {
  name: string
  content: string
}

export interface PromptUpdate {
  name?: string
  content?: string
}

export interface RealtimeMessage {
  type: string
  [key: string]: any
}

export interface WebSocketMessage {
  type: 'detection' | 'frame_skipped' | 'error' | 'auth_success' | 'auth_error' | 'scene_description'
  [key: string]: any
}

export interface DetectionParams {
  conf: number
  iou: number
  imgsz: number
}

export interface CameraConstraints {
  video: {
    width: { ideal: number }
    height: { ideal: number }
    facingMode: 'user' | 'environment'
  }
}

export interface PerformanceMetrics {
  fps: number
  latency_ms: number
  queue_size: number
  drop_rate?: number
}

export interface ConnectionStatus {
  webSocket: 'connected' | 'connecting' | 'disconnected'
  camera: 'connected' | 'disconnected'
  voiceAgent: 'connected' | 'connecting' | 'disconnected'
  aiStatus: 'connected' | 'connecting' | 'disconnected' | 'waiting'
}

export interface VoiceAgentSession {
  ephemeralKey: string
  peerConnection: RTCPeerConnection | null
  dataChannel: RTCDataChannel | null
  audioStream: MediaStream | null
  isConnected: boolean
}

export interface ToolCall {
  name: string
  description: string
  parameters?: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
}

// App state interfaces
export interface AppState {
  isRunning: boolean
  targetFPS: number
  frameInterval: number
  lastScreenImage: string | null
  animationId: number | null
}

export interface UIState {
  selectedPromptId: number | null
  isEditingPrompt: boolean
  editingPromptId: number | null
  showModal: boolean
}