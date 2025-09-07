<template>
  <div class="info-section" style="min-height: 800px;">
    <h3>Scene Analysis</h3>
    <div class="stat-item">
      <span>Vision AI Status:</span>
      <span :class="`status ${appStore.connectionStatus.aiStatus}`">
        {{ formatStatus(appStore.connectionStatus.aiStatus) }}
      </span>
    </div>
    <div class="stat-item">
      <span>Descriptions:</span>
      <span class="stat-value">{{ voiceAgentStore.descriptionsCount }}</span>
    </div>
    <div class="scene-descriptions">
      <div v-if="!hasSceneDescriptions" class="no-descriptions">
        {{ statusMessage }}
      </div>
      
      <div 
        v-for="(description, index) in voiceAgentStore.sceneDescriptions" 
        :key="`description-${index}-${description.timestamp.getTime()}`"
        class="description-item"
        :class="{ 'latest': index === 0 }"
      >
        <span class="description-timestamp">{{ formatTimestamp(description.timestamp) }}</span>
        <img class="description-image" :src="`data:image/jpeg;base64,${description.img}`" alt="collage">
        <p class="description-text">
          {{ description.text }}
        </p>
        <div class="description-meta">
          <span>Frames: {{ description.frameCount }}</span>
          <span>Duration: {{ description.timeSpan }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVoiceAgentStore } from '@/stores/voiceAgent'
import { useAppStore } from '@/stores/app'

const voiceAgentStore = useVoiceAgentStore()
const appStore = useAppStore()

const hasSceneDescriptions = computed(() => voiceAgentStore.hasSceneDescriptions)

const statusMessage = computed(() => {
  if (!appStore.isRunning) return 'Start the camera to see scene analysis'
  if (appStore.connectionStatus.aiStatus === 'waiting') return 'Waiting for analysis...'
  if (appStore.connectionStatus.aiStatus === 'connecting') return 'Starting AI analysis...'
  if (appStore.connectionStatus.aiStatus === 'disconnected') return 'AI analysis disconnected'
  return 'No scene descriptions yet'
})

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString('uk-UA', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<style scoped>
.scene-descriptions {
  max-height: 700px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 6px;
  padding: 10px;
}

.no-descriptions {
  text-align: center;
  color: #999;
  font-style: italic;
  padding: 50px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.description-item {
  padding: 12px;
  margin-bottom: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #28a745;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0;
  transform: translateY(-10px);
  animation: fadeInUp 0.5s ease-out forwards;
}

.description-item:last-child {
  margin-bottom: 0;
}

.description-item.latest {
  border-left-color: #007bff;
  background: #e7f3ff;
  box-shadow: 0 2px 4px rgba(0,123,255,0.1);
}

.description-timestamp {
  display: block;
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
  font-weight: 600;
}

.description-text {
  color: #333;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.description-meta {
  font-size: 10px;
  color: #888;
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scrollbar styling */
.scene-descriptions::-webkit-scrollbar {
  width: 6px;
}

.scene-descriptions::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.scene-descriptions::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.scene-descriptions::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>