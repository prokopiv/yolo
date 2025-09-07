<template>
  <div class="container">
    <div class="header">
      <h1>🔍 TrainAR - POC and POT Core</h1>
    </div>
    
    <div class="content">
      <div class="video-section">
        <VideoCanvas 
          ref="videoCanvasRef"
          @frame-captured="onFrameCaptured"
        />
        <ControlPanel 
          @start-camera="onStartCamera"
          @stop-camera="onStopCamera"
        />
      </div>
      
      <div class="info-panel">
        <ChatMessagesPanel />
        <SceneAnalysisPanel />
        <PerformancePanel v-show="false" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import VideoCanvas from './components/VideoCanvas.vue'
import ControlPanel from './components/ControlPanel.vue'
import ChatMessagesPanel from './components/ChatMessagesPanel.vue'
import SceneAnalysisPanel from './components/SceneAnalysisPanel.vue'
import PerformancePanel from './components/PerformancePanel.vue'
import { useWebSocket } from './composables/useWebSocket'
import { usePromptsStore } from './stores/prompts'
import { useDetectionStore } from './stores/detection'

// Ref to VideoCanvas component
const videoCanvasRef = ref<InstanceType<typeof VideoCanvas> | null>(null)

const { sendFrame } = useWebSocket()
const promptsStore = usePromptsStore()
const detectionStore = useDetectionStore()

// Handle frame capture from VideoCanvas component
function onFrameCaptured(imageBase64: string) {
  sendFrame(imageBase64)
}

// Handle camera controls from ControlPanel
async function onStartCamera() {
  if (videoCanvasRef.value) {
    try {
      await videoCanvasRef.value.startCamera()
    } catch (error) {
      console.error('Failed to start camera:', error)
      alert('Could not access camera. Please check permissions.')
    }
  }
}

function onStopCamera() {
  if (videoCanvasRef.value) {
    videoCanvasRef.value.stopCamera()
  }
}

// Handle highlight objects event from voice agent
function onHighlightObjects(event: CustomEvent) {
  detectionStore.setFilteredObjects(event.detail)
}

// Load prompts on mount
onMounted(async () => {
  await promptsStore.loadPrompts()
  
  // Listen for highlight objects events
  document.addEventListener('highlight-objects', onHighlightObjects as EventListener)
  
  // Listen for frame captured events
  document.addEventListener('frame-captured', ((event: CustomEvent) => {
    onFrameCaptured(event.detail)
  }) as EventListener)
})

onUnmounted(() => {
  document.removeEventListener('highlight-objects', onHighlightObjects as EventListener)
  document.removeEventListener('frame-captured', ((event: CustomEvent) => {
    onFrameCaptured(event.detail)
  }) as EventListener)
})
</script>

<style scoped>
/* Component-specific styles can be added here if needed */
</style>