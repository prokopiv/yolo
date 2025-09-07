import { ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useDetectionStore } from '@/stores/detection'
import { useVoiceAgentStore } from '@/stores/voiceAgent'
import type { WebSocketMessage, SceneDescription } from '@/types'

export function useWebSocket() {
  const ws = ref<WebSocket | null>(null)
  const reconnectTimer = ref<number | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = ref(5)
  const reconnectDelay = ref(3000)

  const appStore = useAppStore()
  const detectionStore = useDetectionStore()
  const voiceAgentStore = useVoiceAgentStore()

  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/detect`
    
    appStore.updateConnectionStatus('webSocket', 'connecting')
    
    ws.value = new WebSocket(wsUrl)
    
    ws.value.onopen = () => {
      console.log('WebSocket connected')
      appStore.updateConnectionStatus('webSocket', 'connected')
      reconnectAttempts.value = 0
      
      // Authenticate if API key provided
      if (appStore.apiKey) {
        send({
          type: 'auth',
          token: appStore.apiKey
        })
      }
    }
    
    ws.value.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data)
        handleMessage(data)
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }
    
    ws.value.onclose = () => {
      console.log('WebSocket disconnected')
      appStore.updateConnectionStatus('webSocket', 'disconnected')
      
      // Auto-reconnect with exponential backoff
      if (reconnectAttempts.value < maxReconnectAttempts.value) {
        const delay = reconnectDelay.value * Math.pow(2, reconnectAttempts.value)
        reconnectTimer.value = window.setTimeout(() => {
          reconnectAttempts.value++
          connect()
        }, delay)
      }
    }
    
    ws.value.onerror = (error) => {
      console.error('WebSocket error:', error)
      appStore.updateConnectionStatus('webSocket', 'disconnected')
    }
  }

  function disconnect() {
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }
    
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    
    appStore.updateConnectionStatus('webSocket', 'disconnected')
  }

  function send(data: any) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(data))
    } else {
      console.warn('WebSocket is not connected')
    }
  }

  function sendFrame(imageBase64: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      return
    }

    const params = detectionStore.detectionParams
    
    send({
      type: 'frame',
      timestamp: Date.now(),
      frame: imageBase64,
      params: params
    })
  }

  function handleMessage(data: WebSocketMessage) {
    switch (data.type) {
      case 'detection':
        handleDetectionResult(data)
        break
        
      case 'frame_skipped':
        console.log('Frame skipped:', data.reason)
        break
        
      case 'error':
        console.error('Server error:', data.message)
        break
        
      case 'auth_success':
        console.log('Authentication successful')
        break
        
      case 'auth_error':
        console.error('Authentication failed')
        break
        
      case 'scene_description':
        handleSceneDescription(data)
        break
        
      default:
        console.log('Unknown message type:', data.type)
    }
  }

  function handleDetectionResult(data: any) {
    // Update performance metrics
    detectionStore.updatePerformance({
      fps: data.fps || 0,
      latency_ms: data.latency_ms || 0,
      queue_size: data.queue_size || 0,
      drop_rate: data.performance?.drop_rate || 0
    })

    // Update detections
    detectionStore.updateDetections(data.detections)
  }

  function handleSceneDescription(data: any) {
    appStore.updateConnectionStatus('aiStatus', 'connected')

    const description: SceneDescription = {
      text: data.description,
      img: data.img,
      timestamp: new Date(data.timestamp * 1000),
      frameCount: data.frame_count,
      timeSpan: data.time_span
    }

    voiceAgentStore.addSceneDescription(description)
  }

  // Auto-connect on mount
  onMounted(() => {
    connect()
  })

  // Disconnect on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    ws,
    connect,
    disconnect,
    send,
    sendFrame,
    reconnectAttempts,
    maxReconnectAttempts
  }
}