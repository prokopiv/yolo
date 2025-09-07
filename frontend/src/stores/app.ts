import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectionStatus } from '@/types'

export const useAppStore = defineStore('app', () => {
  // State
  const isRunning = ref(false)
  const targetFPS = ref(1)
  const frameInterval = ref(1000)
  const animationId = ref<number | null>(null)
  
  const connectionStatus = ref<ConnectionStatus>({
    webSocket: 'disconnected',
    camera: 'disconnected', 
    voiceAgent: 'disconnected',
    aiStatus: 'waiting'
  })
  
  // Scene analysis prompt
  const sceneAnalysisPrompt = ref(`You are analyzing a sequence of 8 consecutive video frames arranged in a 2x4 grid, captured from a camera.
Each frame was taken 1 second apart and shows the progression of events over 8 seconds.

Please provide a concise description of what is happening in this sequence. Focus on:
1. Main subjects/objects and their movements
2. Any significant events or changes between frames
3. Overall scene context and activity patterns
4. Any notable interactions or behaviors

Respond with 2-3 sentences maximum, describing the key events and movements you observe across the sequence.`)

  // API key for optional authentication
  const apiKey = ref('')

  // Getters
  const isConnected = computed(() => 
    connectionStatus.value.webSocket === 'connected' && 
    connectionStatus.value.camera === 'connected'
  )
  
  const isFullyConnected = computed(() =>
    isConnected.value && connectionStatus.value.voiceAgent === 'connected'
  )
  
  const canStart = computed(() => 
    connectionStatus.value.webSocket === 'connected'
  )
  
  const statusSummary = computed(() => {
    const statuses = Object.values(connectionStatus.value)
    const connected = statuses.filter(s => s === 'connected').length
    const total = statuses.length
    return `${connected}/${total} connected`
  })

  // Actions
  function updateConnectionStatus(component: keyof ConnectionStatus, status: ConnectionStatus[keyof ConnectionStatus]) {
    (connectionStatus.value as any)[component] = status
  }
  
  function setRunning(running: boolean) {
    isRunning.value = running
  }
  
  function updateFrameRate(fps: number) {
    targetFPS.value = fps
    frameInterval.value = 1000 / fps
  }
  
  function setAnimationId(id: number | null) {
    animationId.value = id
  }
  
  function updateSceneAnalysisPrompt(prompt: string) {
    sceneAnalysisPrompt.value = prompt
  }
  
  function setApiKey(key: string) {
    apiKey.value = key
  }
  
  function resetConnectionStatus() {
    connectionStatus.value = {
      webSocket: 'disconnected',
      camera: 'disconnected',
      voiceAgent: 'disconnected', 
      aiStatus: 'waiting'
    }
  }
  
  function getAllStatus() {
    return {
      isRunning: isRunning.value,
      targetFPS: targetFPS.value,
      frameInterval: frameInterval.value,
      connectionStatus: { ...connectionStatus.value },
      isConnected: isConnected.value,
      isFullyConnected: isFullyConnected.value,
      canStart: canStart.value
    }
  }

  return {
    // State  
    isRunning,
    targetFPS,
    frameInterval,
    animationId,
    connectionStatus,
    sceneAnalysisPrompt,
    apiKey,
    
    // Getters
    isConnected,
    isFullyConnected,
    canStart,
    statusSummary,
    
    // Actions
    updateConnectionStatus,
    setRunning,
    updateFrameRate,
    setAnimationId,
    updateSceneAnalysisPrompt,
    setApiKey,
    resetConnectionStatus,
    getAllStatus
  }
})