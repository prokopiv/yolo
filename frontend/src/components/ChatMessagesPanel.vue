<template>
  <div class="info-section" style="min-height: 400px;">
    <h3>Chat Messages</h3>
    <div class="stat-item">
      <span>Messages:</span>
      <span class="stat-value">{{ voiceAgentStore.chatMessagesCount }}</span>
    </div>
    <div class="chat-messages">
      <div v-if="!hasChatMessages" class="no-messages">
        {{ statusMessage }}
      </div>
      
      <div 
        v-for="(message, index) in voiceAgentStore.chatMessages" 
        :key="`message-${index}`"
        class="message-item"
        :class="{ 'latest': message.role === 'user' }"
      >
        <span class="message-timestamp">{{ message.role }}: {{ formatTimestamp(message.timestamp) }}</span>
        <p class="message-text">{{ message.text }}</p>
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

const hasChatMessages = computed(() => voiceAgentStore.chatMessages.length > 0)

const statusMessage = computed(() => {
  if (!appStore.isRunning) return 'Start the camera to see the messages'
  if (!voiceAgentStore.isConnected) return 'Voice agent disconnected'
  return 'No messages yet'
})

function formatTimestamp(timestamp: Date | string | number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('uk-UA', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<style scoped>
.chat-messages {
  max-height: 350px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 6px;
  padding: 10px;
}

.no-messages {
  text-align: center;
  color: #999;
  font-style: italic;
  padding: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.message-item {
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

.message-item:last-child {
  margin-bottom: 0;
}

.message-item.latest {
  border-left-color: #007bff;
  background: #e7f3ff;
  box-shadow: 0 2px 4px rgba(0,123,255,0.1);
}

.message-timestamp {
  display: block;
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
  font-weight: 600;
}

.message-text {
  color: #333;
  margin: 0;
}

.message-meta {
  font-size: 10px;
  color: #888;
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.message-meta span {
  white-space: nowrap;
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
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>