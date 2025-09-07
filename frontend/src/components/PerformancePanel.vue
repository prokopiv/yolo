<template>
  <div class="info-section">
    <h3>Performance Metrics</h3>
    <div class="stat-item">
      <span>FPS:</span>
      <span class="stat-value" :class="{ 'warning': performance.fps < 5 }">
        {{ performance.fps }}
      </span>
    </div>
    <div class="stat-item">
      <span>Latency:</span>
      <span class="stat-value" :class="{ 'warning': isHighLatency }">
        {{ performanceStats.latency }}
      </span>
    </div>
    <div class="stat-item">
      <span>Queue Size:</span>
      <span class="stat-value" :class="{ 'warning': performance.queue_size > 10 }">
        {{ performance.queue_size }}
      </span>
    </div>
    <div class="stat-item">
      <span>Drop Rate:</span>
      <span class="stat-value" :class="{ 'warning': (performance.drop_rate || 0) > 10 }">
        {{ performanceStats.dropRate }}
      </span>
    </div>
    
    <!-- Performance indicator -->
    <div class="performance-indicator" :class="performanceClass">
      <div class="indicator-dot"></div>
      <span>{{ performanceStatus }}</span>
    </div>
    
    <!-- Performance chart (placeholder for future implementation) -->
    <div class="performance-chart">
      <div class="chart-placeholder">
        <div class="chart-bars">
          <div 
            v-for="i in 10" 
            :key="i"
            class="chart-bar"
            :style="{ height: `${Math.random() * 80 + 10}%` }"
          ></div>
        </div>
        <small>FPS History (Last 10 frames)</small>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDetection } from '@/composables/useDetection'
import { useDetectionStore } from '@/stores/detection'

const { performanceStats, isPerformanceGood } = useDetection()
const detectionStore = useDetectionStore()

const performance = computed(() => detectionStore.performance)
const isHighLatency = computed(() => performance.value.latency_ms > 200)

const performanceClass = computed(() => {
  if (isPerformanceGood.value) return 'good'
  if (performance.value.fps > 2) return 'warning'
  return 'poor'
})

const performanceStatus = computed(() => {
  if (isPerformanceGood.value) return 'Excellent'
  if (performance.value.fps > 2) return 'Good'
  return 'Poor'
})
</script>

<style scoped>
.performance-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}

.performance-indicator.good {
  background: #d4edda;
  color: #155724;
}

.performance-indicator.warning {
  background: #fff3cd;
  color: #856404;
}

.performance-indicator.poor {
  background: #f8d7da;
  color: #721c24;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.stat-value.warning {
  color: #dc3545;
  font-weight: 700;
}

.performance-chart {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
}

.chart-placeholder {
  text-align: center;
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 60px;
  margin-bottom: 10px;
  gap: 2px;
}

.chart-bar {
  background: linear-gradient(to top, #007bff, #45B7D1);
  width: 100%;
  min-height: 5px;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
}

.chart-bars:hover .chart-bar {
  opacity: 0.8;
}

small {
  color: #666;
  font-size: 11px;
}
</style>