import { ref, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useDetectionStore } from '@/stores/detection'
import { useVoiceAgentStore } from '@/stores/voiceAgent'
import type { CameraConstraints } from '@/types'

export function useCamera() {
  const video = ref<HTMLVideoElement | null>(null)
  const canvas = ref<HTMLCanvasElement | null>(null)
  const stream = ref<MediaStream | null>(null)
  const processTimer = ref<number | null>(null)
  const animationId = ref<number | null>(null)

  const appStore = useAppStore()
  const detectionStore = useDetectionStore()
  const voiceAgentStore = useVoiceAgentStore()

  const defaultConstraints: CameraConstraints = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    }
  }

  async function startCamera(constraints: CameraConstraints = defaultConstraints) {
    try {
      appStore.updateConnectionStatus('camera', 'connecting')
      
      // Wait for video element to be available
      if (!video.value) {
        console.error('Video element not available when starting camera')
        throw new Error('Video element not found')
      }
      
      stream.value = await navigator.mediaDevices.getUserMedia(constraints)

      video.value.srcObject = stream.value
      
      return new Promise<void>((resolve, reject) => {
        if (!video.value) {
          reject(new Error('Video element not found'))
          return
        }

        video.value.onloadedmetadata = () => {
          if (!video.value || !canvas.value) {
            reject(new Error('Video or canvas element not found'))
            return
          }

          // Set canvas size to match video
          canvas.value.width = video.value.videoWidth
          canvas.value.height = video.value.videoHeight

          appStore.updateConnectionStatus('camera', 'connected')
          appStore.setRunning(true)
          
          // Start processing and animation
          startFrameProcessing()
          startAnimationLoop()
          
          resolve()
        }

        video.value.onerror = (error) => {
          appStore.updateConnectionStatus('camera', 'disconnected')
          reject(error)
        }
      })
      
    } catch (error) {
      console.error('Error accessing camera:', error)
      appStore.updateConnectionStatus('camera', 'disconnected')
      throw error
    }
  }

  function stopCamera() {
    appStore.setRunning(false)

    // Stop frame processing
    if (processTimer.value) {
      clearTimeout(processTimer.value)
      processTimer.value = null
    }

    // Stop animation
    if (animationId.value) {
      cancelAnimationFrame(animationId.value)
      animationId.value = null
    }

    // Stop media tracks
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }

    // Clear video source
    if (video.value) {
      video.value.srcObject = null
    }

    // Clear canvas
    if (canvas.value) {
      const ctx = canvas.value.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
      }
    }

    // Clear detections
    detectionStore.clearDetections()
    
    appStore.updateConnectionStatus('camera', 'disconnected')
  }

  function captureFrame(): string | null {
    if (!video.value || !video.value.videoWidth || !video.value.videoHeight) {
      return null
    }

    // Create temporary canvas for capture
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')
    
    if (!tempCtx) return null

    tempCanvas.width = video.value.videoWidth
    tempCanvas.height = video.value.videoHeight
    tempCtx.drawImage(video.value, 0, 0)

    // Convert to base64 JPEG
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.8)
    return dataUrl.split(',')[1] // Remove data:image/jpeg;base64, prefix
  }

  function startFrameProcessing() {
    if (!appStore.isRunning) return

    const imageBase64 = captureFrame()
    if (imageBase64) {
      // Update screenshot for voice agent
      voiceAgentStore.updateScreenshot(imageBase64)
      
      // Send to WebSocket for detection (this will be handled by the component using useWebSocket)
      // We'll emit an event or use a callback
      document.dispatchEvent(new CustomEvent('frame-captured', {
        detail: imageBase64
      }))
    }

    // Schedule next frame
    processTimer.value = window.setTimeout(() => {
      startFrameProcessing()
    }, appStore.frameInterval)
  }

  function startAnimationLoop() {
    function animate() {
      if (appStore.isRunning) {
        drawDetections()
        animationId.value = requestAnimationFrame(animate)
      }
    }
    animate()
  }

  function drawDetections() {
    if (!canvas.value || !video.value || !video.value.videoWidth) return

    const ctx = canvas.value.getContext('2d')
    if (!ctx) return

    const smoothedDetections = detectionStore.smoothedDetections

    // Save context state
    ctx.save()
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
    
    // Apply mirroring transformation
    ctx.scale(-1, 1)
    ctx.translate(-canvas.value.width, 0)
    
    // Draw video frame (mirrored)
    if (video.value.videoWidth > 0 && video.value.videoHeight > 0) {
      ctx.drawImage(video.value, 0, 0, canvas.value.width, canvas.value.height)
    }
    
    if (!smoothedDetections.length) {
      ctx.restore()
      return
    }

    // Draw bounding boxes with smooth animation
    ctx.font = 'bold 16px Arial'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 3

    const scaleX = canvas.value.width / video.value.videoWidth
    const scaleY = canvas.value.height / video.value.videoHeight

    smoothedDetections.forEach((det, index) => {
      const box = det.smoothed_box || det.box_xyxy
      if (box) {
        const x1 = box.x1 * scaleX
        const y1 = box.y1 * scaleY
        const x2 = box.x2 * scaleX
        const y2 = box.y2 * scaleY

        // Use different colors for different classes
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD']
        const color = colors[index % colors.length]
        
        // Set opacity for fade effects
        const opacity = det.opacity || (det.isTracked ? 1.0 : 0.7)
        
        // Draw bounding box
        ctx.strokeStyle = color
        ctx.lineWidth = det.isTracked ? 3 : 2
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
        
        // Draw label background
        const label = `${det.class_name} ${Math.round(det.confidence * 100)}%`
        const textMetrics = ctx.measureText(label)
        const textWidth = textMetrics.width + 10
        const textHeight = 25
        
        ctx.fillStyle = color
        ctx.globalAlpha = opacity
        ctx.fillRect(x1, y1 - textHeight, textWidth, textHeight)
        
        // Save current state for text
        ctx.save()
        
        // Temporarily undo mirroring for text to make it readable
        ctx.scale(-1, 1)
        ctx.translate(-canvas.value!.width, 0)
        
        // Calculate text position in original coordinates (over the bounding box)
        const textX = canvas.value!.width - x1 - textWidth + 5
        const textY = y1 - 7
        
        // Draw label text (not mirrored)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(label, textX, textY)
        
        // Restore state after text
        ctx.restore()
        
        ctx.globalAlpha = 1.0
      }
    })
    
    // Reset shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    
    // Restore original context state
    ctx.restore()
  }

  function setVideoElement(element: HTMLVideoElement) {
    console.log('Setting video element in composable:', element)
    video.value = element
  }

  function setCanvasElement(element: HTMLCanvasElement) {
    console.log('Setting canvas element in composable:', element)
    canvas.value = element
  }

  // Check camera permissions
  async function checkPermissions() {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
      return result.state
    } catch (error) {
      console.warn('Camera permission check failed:', error)
      return 'prompt'
    }
  }

  // Get available camera devices
  async function getCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(device => device.kind === 'videoinput')
    } catch (error) {
      console.error('Failed to enumerate camera devices:', error)
      return []
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopCamera()
  })

  return {
    video,
    canvas,
    stream,
    startCamera,
    stopCamera,
    captureFrame,
    drawDetections,
    setVideoElement,
    setCanvasElement,
    checkPermissions,
    getCameraDevices
  }
}