<template>
  <div class="detections">
    <div v-if="!hasDetections" class="no-detections">
      {{ statusMessage }}
    </div>
    
    <div 
      v-for="detection in detectionList" 
      :key="`${detection.label}-${detection.confidence}`"
      class="detection-item"
      :class="{ 'tracked': detection.isTracked }"
    >
      <strong>{{ detection.label }}</strong>
      <span class="confidence">{{ detection.confidence }}%</span>
      <span v-if="detection.isTracked" class="tracking-indicator">📍</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDetection } from '@/composables/useDetection'
import { useAppStore } from '@/stores/app'

const { detectionList, hasDetections, detectionStatusMessage } = useDetection()
const appStore = useAppStore()

const statusMessage = computed(() => {
  if (!appStore.isRunning) return 'Start camera to see detections'
  return detectionStatusMessage.value
})
</script>

<style scoped>
.detections {
  max-height: 200px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 6px;
  padding: 5px;
  min-height: 100px;
}

.no-detections {
  text-align: center;
  color: #999;
  font-style: italic;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
}

.detection-item {
  padding: 8px;
  margin-bottom: 8px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s ease;
}

.detection-item:last-child {
  margin-bottom: 0;
}

.detection-item.tracked {
  background: #e7f3ff;
  border-left: 3px solid #007bff;
}

.confidence {
  font-weight: 600;
  color: #007bff;
}

.tracking-indicator {
  font-size: 12px;
  margin-left: 5px;
  opacity: 0.7;
}

/* Scrollbar styling */
.detections::-webkit-scrollbar {
  width: 6px;
}

.detections::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.detections::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.detections::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>