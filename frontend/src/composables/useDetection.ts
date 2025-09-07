import { computed } from 'vue'
import { useDetectionStore } from '@/stores/detection'
import { useAppStore } from '@/stores/app'
import type { Detection } from '@/types'

export function useDetection() {
  const detectionStore = useDetectionStore()
  const appStore = useAppStore()

  // Computed properties for UI display
  const detectionList = computed(() => 
    detectionStore.currentDetections.map(det => ({
      label: det.class_name,
      confidence: Math.round(det.confidence * 100),
      isTracked: det.isTracked || false
    }))
  )

  const performanceStats = computed(() => ({
    fps: detectionStore.performance.fps,
    latency: `${detectionStore.performance.latency_ms} ms`,
    queueSize: detectionStore.performance.queue_size,
    dropRate: `${detectionStore.performance.drop_rate || 0}%`
  }))

  const isPerformanceGood = computed(() => 
    detectionStore.performance.fps > 5 && 
    detectionStore.performance.latency_ms < 200 &&
    (detectionStore.performance.drop_rate || 0) < 10
  )

  const detectionStatusMessage = computed(() => {
    if (!appStore.isRunning) return 'Camera stopped'
    if (!detectionStore.hasDetections) return 'No objects detected'
    return `${detectionStore.detectionCount} object(s) detected`
  })

  // Configuration functions
  function updateConfidence(value: number) {
    detectionStore.updateDetectionParams({ conf: value })
  }

  function updateIoU(value: number) {
    detectionStore.updateDetectionParams({ iou: value })
  }

  function updateImageSize(value: number) {
    detectionStore.updateDetectionParams({ imgsz: value })
  }

  function updateFilterObjects(objects: string) {
    detectionStore.setFilterObjects(objects)
  }

  // Filter management
  function getFilteredObjectsList(): string[] {
    const filter = detectionStore.filteredObjects || detectionStore.filterObjects
    return filter.split(',').map(obj => obj.trim()).filter(obj => obj.length > 0)
  }

  function isObjectInFilter(className: string): boolean {
    const filterList = getFilteredObjectsList()
    return filterList.length === 0 || filterList.includes(className)
  }

  // Detection analysis
  function getDetectionSummary() {
    const detections = detectionStore.currentDetections
    const summary = new Map<string, number>()

    detections.forEach(det => {
      summary.set(det.class_name, (summary.get(det.class_name) || 0) + 1)
    })

    return Array.from(summary.entries()).map(([className, count]) => ({
      className,
      count
    }))
  }

  function getTopConfidenceDetection(): Detection | null {
    if (detectionStore.currentDetections.length === 0) return null
    
    return detectionStore.currentDetections.reduce((prev, current) => 
      current.confidence > prev.confidence ? current : prev
    )
  }

  // Tracking analysis
  function getTrackingStats() {
    const detections = detectionStore.smoothedDetections
    const tracked = detections.filter(det => det.isTracked).length
    const total = detections.length
    
    return {
      tracked,
      total,
      trackingRate: total > 0 ? (tracked / total) * 100 : 0
    }
  }

  // Export functions for external use
  function exportDetections() {
    return {
      timestamp: new Date().toISOString(),
      detections: detectionStore.currentDetections,
      performance: detectionStore.performance,
      parameters: detectionStore.detectionParams
    }
  }

  // Clear all detection data
  function clearAllDetections() {
    detectionStore.clearDetections()
  }

  // Real-time detection processing
  function processDetectionFrame(detections: Detection[]) {
    detectionStore.updateDetections(detections)
  }

  // Handle highlight objects from voice agent
  function handleHighlightObjects(objectsList: string) {
    detectionStore.setFilteredObjects(objectsList)
  }

  return {
    // Computed properties
    detectionList,
    performanceStats,
    isPerformanceGood,
    detectionStatusMessage,
    
    // Store getters
    currentDetections: computed(() => detectionStore.currentDetections),
    smoothedDetections: computed(() => detectionStore.smoothedDetections),
    hasDetections: computed(() => detectionStore.hasDetections),
    detectionCount: computed(() => detectionStore.detectionCount),
    performance: computed(() => detectionStore.performance),
    detectionParams: computed(() => detectionStore.detectionParams),
    filterObjects: computed(() => detectionStore.filterObjects),
    filteredObjects: computed(() => detectionStore.filteredObjects),
    
    // Configuration functions
    updateConfidence,
    updateIoU,
    updateImageSize,
    updateFilterObjects,
    
    // Filter functions
    getFilteredObjectsList,
    isObjectInFilter,
    handleHighlightObjects,
    
    // Analysis functions
    getDetectionSummary,
    getTopConfidenceDetection,
    getTrackingStats,
    
    // Utility functions
    exportDetections,
    clearAllDetections,
    processDetectionFrame
  }
}