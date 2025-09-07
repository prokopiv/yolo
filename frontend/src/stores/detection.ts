import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Detection, BoundingBox, PerformanceMetrics, DetectionParams } from '@/types'

export const useDetectionStore = defineStore('detection', () => {
  // State
  const currentDetections = ref<Detection[]>([])
  const previousDetections = ref<Detection[]>([])
  const smoothedDetections = ref<Detection[]>([])
  const performance = ref<PerformanceMetrics>({
    fps: 0,
    latency_ms: 0,
    queue_size: 0,
    drop_rate: 0
  })
  
  const filterObjects = ref('phone, cell phone, remote')
  const filteredObjects = ref('')
  const detectionParams = ref<DetectionParams>({
    conf: 0.25,
    iou: 0.45,
    imgsz: 640
  })

  // Getters
  const hasDetections = computed(() => currentDetections.value.length > 0)
  const detectionCount = computed(() => currentDetections.value.length)
  const isHighLatency = computed(() => performance.value.latency_ms > 200)

  // Actions
  function updateDetections(newDetections: Detection[]) {
    previousDetections.value = [...currentDetections.value]
    currentDetections.value = newDetections || []

    // Apply filtering
    let filterName = filteredObjects.value.trim()
    if (!filterName) {
      filterName = filterObjects.value.trim()
    }

    if (filterName) {
      const filterNames = filterName.split(',').map(name => name.trim())
      currentDetections.value = currentDetections.value.filter(det => 
        filterNames.includes(det.class_name)
      )
    }

    // Match and smooth detections
    smoothedDetections.value = matchAndSmoothDetections(
      previousDetections.value, 
      currentDetections.value
    )
  }

  function updatePerformance(metrics: Partial<PerformanceMetrics>) {
    performance.value = { ...performance.value, ...metrics }
  }

  function updateDetectionParams(params: Partial<DetectionParams>) {
    detectionParams.value = { ...detectionParams.value, ...params }
  }

  function setFilterObjects(filter: string) {
    filterObjects.value = filter
  }

  function setFilteredObjects(filtered: string) {
    filteredObjects.value = filtered
  }

  function clearDetections() {
    currentDetections.value = []
    previousDetections.value = []
    smoothedDetections.value = []
  }

  // Helper functions
  function matchAndSmoothDetections(prev: Detection[], curr: Detection[]): Detection[] {
    if (!prev.length) return curr

    const matched: Detection[] = []
    const used = new Set<number>()

    curr.forEach((currDet) => {
      let bestMatch: Detection | null = null
      let bestIoU = 0
      let bestPrevIdx = -1

      prev.forEach((prevDet, prevIdx) => {
        if (used.has(prevIdx)) return
        if (currDet.class_name !== prevDet.class_name) return

        const iou = calculateIoU(currDet.box_xyxy, prevDet.box_xyxy)
        if (iou > bestIoU && iou > 0.3) {
          bestIoU = iou
          bestMatch = prevDet
          bestPrevIdx = prevIdx
        }
      })

      if (bestMatch) {
        used.add(bestPrevIdx)
        matched.push({
          ...currDet,
          smoothed_box: smoothBoxTransition(
            (bestMatch as Detection).box_xyxy || (bestMatch as Detection).smoothed_box!,
            currDet.box_xyxy,
            0.3
          ),
          isTracked: true
        })
      } else {
        matched.push({
          ...currDet,
          smoothed_box: currDet.box_xyxy,
          isTracked: false,
          opacity: 0.5
        })
      }
    })

    return matched
  }

  function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    if (!box1 || !box2) return 0

    const x1 = Math.max(box1.x1, box2.x1)
    const y1 = Math.max(box1.y1, box2.y1)
    const x2 = Math.min(box1.x2, box2.x2)
    const y2 = Math.min(box1.y2, box2.y2)

    if (x2 <= x1 || y2 <= y1) return 0

    const intersection = (x2 - x1) * (y2 - y1)
    const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1)
    const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1)
    const union = area1 + area2 - intersection

    return intersection / union
  }

  function smoothBoxTransition(
    prevBox: BoundingBox,
    currBox: BoundingBox,
    alpha: number
  ): BoundingBox {
    return {
      x1: prevBox.x1 + (currBox.x1 - prevBox.x1) * alpha,
      y1: prevBox.y1 + (currBox.y1 - prevBox.y1) * alpha,
      x2: prevBox.x2 + (currBox.x2 - prevBox.x2) * alpha,
      y2: prevBox.y2 + (currBox.y2 - prevBox.y2) * alpha
    }
  }

  return {
    // State
    currentDetections,
    previousDetections,
    smoothedDetections,
    performance,
    filterObjects,
    filteredObjects,
    detectionParams,
    
    // Getters
    hasDetections,
    detectionCount,
    isHighLatency,
    
    // Actions
    updateDetections,
    updatePerformance,
    updateDetectionParams,
    setFilterObjects,
    setFilteredObjects,
    clearDetections
  }
})