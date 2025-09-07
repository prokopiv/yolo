<template>
  <div class="video-canvas-container">
    <div style="position: relative; display: inline-block;">
      <video
        ref="videoElement"
        id="videoElement"
        autoplay
        muted
        playsinline
        @loadedmetadata="onVideoLoaded"
      />
      <canvas
        ref="canvasElement"
        id="canvas"
      />
      <div id="audioElement"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useCamera } from '@/composables/useCamera'

// Template refs
const videoElement = ref<HTMLVideoElement>()
const canvasElement = ref<HTMLCanvasElement>()

// Composables
const { setVideoElement, setCanvasElement, startCamera, stopCamera } = useCamera()

// Handle video metadata loaded
function onVideoLoaded() {
  console.log('Video metadata loaded')
}

// Set up video and canvas elements
onMounted(() => {
  console.log('VideoCanvas mounted, setting up elements')
  
  if (videoElement.value) {
    console.log('Setting video element:', videoElement.value)
    setVideoElement(videoElement.value)
  } else {
    console.error('Video element not found')
  }
  
  if (canvasElement.value) {
    console.log('Setting canvas element:', canvasElement.value)
    setCanvasElement(canvasElement.value)
  } else {
    console.error('Canvas element not found')
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopCamera()
})

// Expose camera controls to parent  
defineExpose({
  startCamera: () => {
    console.log('VideoCanvas: startCamera called')
    return startCamera()
  },
  stopCamera: () => {
    console.log('VideoCanvas: stopCamera called')
    return stopCamera()
  }
})
</script>

<style scoped>
.video-canvas-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
}

#videoElement, #canvas {
  max-width: 640px;
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  display: block;
  margin: 0 auto;
}

#videoElement {
  position: relative;
  z-index: 1;
  transform: scaleX(-1);
}

#canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
}

#audioElement {
  display: none;
}
</style>