<template>
  <div class="controls">
    <p id="importantTextMessage" class="important-text">
      {{ voiceAgentStore.importantTextMessage }}
    </p>

    <!-- API Key (hidden by default) -->
    <div class="control-group" style="display: none">
      <label for="apiKey">API Key (optional):</label>
      <input 
        type="password" 
        id="apiKey" 
        placeholder="Enter API key if required" 
        v-model="appStore.apiKey"
      >
    </div>
    
    <!-- Camera Controls -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="control-group">
        <button 
          id="startBtn" 
          @click="startCamera"
          :disabled="appStore.isRunning"
          class="btn-primary"
        >
          📹 Start Call
        </button>
      </div>
      <div class="control-group">
        <button 
          id="stopBtn" 
          @click="stopCamera"
          :disabled="!appStore.isRunning"
          class="btn-secondary"
        >
          ⏹️ Stop Call
        </button>
      </div>
    </div>

    <!-- Connection Status -->
    <h4>Connection Status</h4>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
      <div class="control-group">
        <span>WebSocket:</span>
        <span :class="`status ${appStore.connectionStatus.webSocket}`">
          {{ formatStatus(appStore.connectionStatus.webSocket) }}
        </span>
      </div>
      <div class="control-group" style="display: none">
        <span>Camera:</span>
        <span :class="`status ${appStore.connectionStatus.camera}`">
          {{ formatStatus(appStore.connectionStatus.camera) }}
        </span>
      </div>
      <div class="control-group">
        <span>Realtime Assistant:</span>
        <span :class="`status ${appStore.connectionStatus.voiceAgent}`">
          {{ formatStatus(appStore.connectionStatus.voiceAgent) }}
        </span>
      </div>
    </div>

    <!-- Detection Parameters -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
      <div class="control-group">
        <label for="confSlider">Confidence:</label>
        <input 
          type="range" 
          id="confSlider" 
          min="0.1" 
          max="1" 
          step="0.05" 
          v-model.number="confidence"
          @input="updateConfidence"
        >
        <span class="slider-value">{{ confidence.toFixed(2) }}</span>
      </div>
      <div class="control-group">
        <label for="iouSlider">Accuracy of the object position (IoU):</label>
        <input 
          type="range" 
          id="iouSlider" 
          min="0.1" 
          max="1" 
          step="0.05" 
          v-model.number="iou"
          @input="updateIoU"
        >
        <span class="slider-value">{{ iou.toFixed(2) }}</span>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="control-group">
        <label for="imgsizeSlider">Image Size:</label>
        <input 
          type="range" 
          id="imgsizeSlider" 
          min="320" 
          max="1280" 
          step="32" 
          v-model.number="imageSize"
          @input="updateImageSize"
        >
        <span class="slider-value">{{ imageSize }}</span>
      </div>
      <div class="control-group">
        <label for="fpsSlider">Frames per second (yolo):</label>
        <input 
          type="range" 
          id="fpsSlider" 
          min="1" 
          max="30" 
          step="1" 
          v-model.number="fps"
          @input="updateFPS"
        >
        <span class="slider-value">{{ fps }}</span>
      </div>
    </div>

    <!-- Object Filter -->
    <div class="control-group" style="margin-top: 10px;">
      <label for="detectionObjects">List of Objects:</label>
      <textarea 
        id="detectionObjects"
        v-model="filterObjects"
        placeholder="Enter instructions for the realtime assistant..."
        rows="1"
        class="textarea-input"
        @input="updateFilterObjects"
      />
      <div class="filter-status">
        Objects selected by Realtime Assistant: 
        <span class="filter-objects">{{ detectionStore.filteredObjects || 'None' }}</span>
      </div>
    </div>

    <!-- Recent Detections -->
    <div class="control-group">
      <h4 style="margin-bottom: 5px;">Recent Detections:</h4>
      <DetectionsList />
    </div>

    <!-- Scene Analysis Prompt -->
    <div class="control-group" style="margin-top: 10px;">
      <label for="sceneAnalysisPrompt">Scene Analysis Prompt:</label>
      <textarea 
        id="sceneAnalysisPrompt"
        v-model="sceneAnalysisPrompt"
        placeholder="Enter instructions for the vision assistant..."
        rows="4"
        class="textarea-input textarea-large"
        @input="updateScenePrompt"
      />
    </div>

    <!-- Prompt Manager -->
    <PromptManager />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDetection } from '@/composables/useDetection'
import { useAppStore } from '@/stores/app'
import { useDetectionStore } from '@/stores/detection'
import { useVoiceAgentStore } from '@/stores/voiceAgent'
import { usePromptsStore } from '@/stores/prompts'
import DetectionsList from './DetectionsList.vue'
import PromptManager from './PromptManager.vue'

// We'll use the parent's camera controls instead
const emit = defineEmits<{
  'start-camera': []
  'stop-camera': []
}>()
const { updateConfidence: updateConf, updateIoU: updateIoUParam, updateImageSize: updateImgSize, updateFilterObjects: updateFilter } = useDetection()
const appStore = useAppStore()
const detectionStore = useDetectionStore()
const voiceAgentStore = useVoiceAgentStore()
const promptsStore = usePromptsStore()

// Reactive parameters
const confidence = ref(0.25)
const iou = ref(0.45)
const imageSize = ref(640)
const fps = ref(1)
const filterObjects = ref('phone, cell phone, remote')
const sceneAnalysisPrompt = ref(appStore.sceneAnalysisPrompt)

// Camera controls - emit to parent App component
async function startCamera() {
  try {
    emit('start-camera')
    // Also start voice agent session
    await voiceAgentStore.createSession(appStore.apiKey)
    
    // Wait a bit for voice agent to connect, then send instructions
    setTimeout(() => {
      sendVoiceAgentInstructions()
    }, 3000)
  } catch (error) {
    console.error('Failed to start voice agent:', error)
    alert('Could not start voice agent. Please check permissions.')
  }
}

function stopCamera() {
  emit('stop-camera')
  voiceAgentStore.disconnect()
}

// Parameter updates
function updateConfidence() {
  updateConf(confidence.value)
}

function updateIoU() {
  updateIoUParam(iou.value)
}

function updateImageSize() {
  updateImgSize(imageSize.value)
}

function updateFPS() {
  appStore.updateFrameRate(fps.value)
}

function updateFilterObjects() {
  updateFilter(filterObjects.value)
}

function updateScenePrompt() {
  appStore.updateSceneAnalysisPrompt(sceneAnalysisPrompt.value)
}

// Send voice agent instructions with retry logic
function sendVoiceAgentInstructions() {
  if (!voiceAgentStore.isConnected) {
    console.warn('Voice agent not connected yet, retrying in 2 seconds')
    setTimeout(sendVoiceAgentInstructions, 2000)
    return
  }
  
  if (!promptsStore.selectedPrompt) {
    console.warn('No prompt selected yet, retrying in 1 second')
    setTimeout(sendVoiceAgentInstructions, 1000)
    return
  }
  
  console.log('Sending voice agent instructions:', promptsStore.selectedPrompt.name)
  voiceAgentStore.updateSessionInstructions(
    promptsStore.selectedPrompt.content,
    filterObjects.value
  )
}

// Format connection status for display
function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// Initialize parameters from store
onMounted(() => {
  const params = detectionStore.detectionParams
  confidence.value = params.conf
  iou.value = params.iou
  imageSize.value = params.imgsz
  fps.value = appStore.targetFPS
  filterObjects.value = detectionStore.filterObjects
})
</script>

<style scoped>
.important-text {
  text-align: center;
  color: #333;
  font-style: italic;
  margin-bottom: 20px;
  font-weight: 600;
  min-height: 24px;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.slider-value {
  font-size: 12px;
  color: #666;
  display: block;
  text-align: center;
  margin-top: 4px;
}

.textarea-input {
  width: 100%;
  padding: 10px;
  border: 2px solid #e1e5e9;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.textarea-large {
  min-height: 200px;
}

.filter-status {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}

.filter-objects {
  font-weight: 600;
  color: #007bff;
}

h4 {
  margin: 15px 0 10px 0;
  color: #333;
  font-size: 16px;
}
</style>