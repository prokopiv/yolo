<template>
  <div class="control-group" style="margin-top: 10px;">
    <label for="assistantPromptSelect">Realtime Assistant Prompt:</label>
    <div class="prompt-selector">
      <select 
        id="assistantPromptSelect" 
        v-model="selectedPromptId" 
        @change="onPromptSelect"
        :disabled="promptsStore.isLoading"
        class="prompt-select"
      >
        <option value="">
          {{ promptsStore.isLoading ? 'Loading...' : 'Select prompt...' }}
        </option>
        <option 
          v-for="prompt in promptsStore.prompts" 
          :key="prompt.id" 
          :value="prompt.id"
        >
          {{ prompt.name }}
        </option>
      </select>
      
      <button 
        @click="promptsStore.startEditing(selectedPromptId!)"
        :disabled="!selectedPromptId || promptsStore.isLoading"
        class="prompt-action-btn"
        title="Edit prompt"
      >
        ✏️
      </button>
      
      <button 
        @click="promptsStore.startCreating()"
        :disabled="promptsStore.isLoading"
        class="prompt-action-btn create-btn"
        title="Create prompt"
      >
        ➕
      </button>
      
      <button 
        @click="deletePrompt"
        :disabled="!selectedPromptId || promptsStore.isLoading"
        class="prompt-action-btn delete-btn"
        title="Delete prompt"
      >
        🗑️
      </button>
    </div>
    
    <div class="prompt-preview">
      <div v-if="promptsStore.error" class="error-message">
        {{ promptsStore.error }}
      </div>
      <div v-else-if="selectedPrompt" class="prompt-content">
        <pre>{{ truncatedContent }}</pre>
      </div>
      <div v-else class="no-selection">
        <em>{{ promptsStore.isLoading ? 'Loading prompts...' : 'Select a prompt to view...' }}</em>
      </div>
    </div>
  </div>

  <!-- Modal for prompt editing/creation -->
  <Teleport to="body">
    <div v-if="promptsStore.showModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ promptsStore.isEditingPrompt ? 'Edit Prompt' : 'Create New Prompt' }}</h3>
        
        <div class="form-group">
          <label for="promptName">Prompt Name:</label>
          <input 
            type="text" 
            id="promptName" 
            v-model="formData.name"
            placeholder="Enter prompt name"
            class="form-input"
            :disabled="promptsStore.isLoading"
          >
        </div>
        
        <div class="form-group">
          <label for="promptContent">Prompt Content:</label>
          <textarea 
            id="promptContent" 
            v-model="formData.content"
            placeholder="Enter prompt content"
            rows="15"
            class="form-textarea"
            :disabled="promptsStore.isLoading"
          />
        </div>
        
        <div class="modal-actions">
          <button 
            @click="closeModal"
            :disabled="promptsStore.isLoading"
            class="btn-cancel"
          >
            Cancel
          </button>
          <button 
            @click="savePrompt"
            :disabled="promptsStore.isLoading || !formData.name.trim() || !formData.content.trim()"
            class="btn-save"
          >
            {{ promptsStore.isLoading ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePromptsStore } from '@/stores/prompts'

const promptsStore = usePromptsStore()

// Local state
const selectedPromptId = ref<number | null>(null)
const formData = ref({
  name: '',
  content: ''
})

// Computed
const selectedPrompt = computed(() => promptsStore.selectedPrompt)

const truncatedContent = computed(() => {
  if (!selectedPrompt.value) return ''
  const content = selectedPrompt.value.content
  return content.length > 300 ? content.substring(0, 300) + '...' : content
})

// Watch for store changes
watch(() => promptsStore.selectedPromptId, (newId) => {
  selectedPromptId.value = newId
})

watch(() => promptsStore.showModal, (show) => {
  if (show) {
    // Populate form data when modal opens
    if (promptsStore.isEditingPrompt && promptsStore.editingPrompt) {
      formData.value.name = promptsStore.editingPrompt.name
      formData.value.content = promptsStore.editingPrompt.content
    } else {
      formData.value.name = ''
      formData.value.content = ''
    }
  }
})

// Methods
function onPromptSelect() {
  promptsStore.selectPrompt(selectedPromptId.value)
}

async function deletePrompt() {
  if (!selectedPromptId.value) return
  
  try {
    await promptsStore.confirmDelete(selectedPromptId.value)
  } catch (error) {
    console.error('Failed to delete prompt:', error)
  }
}

async function savePrompt() {
  try {
    await promptsStore.savePrompt(formData.value.name, formData.value.content)
  } catch (error) {
    console.error('Failed to save prompt:', error)
    // Error is handled by the store and displayed in the UI
  }
}

function closeModal() {
  promptsStore.cancelEditing()
}
</script>

<style scoped>
.prompt-selector {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.prompt-select {
  flex: 1;
  padding: 10px;
  border: 2px solid #e1e5e9;
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.prompt-action-btn {
  padding: 10px 15px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.prompt-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.prompt-action-btn {
  background: #007bff;
  color: white;
}

.prompt-action-btn:hover:not(:disabled) {
  background: #0056b3;
}

.create-btn {
  background: #28a745;
}

.create-btn:hover:not(:disabled) {
  background: #1e7e34;
}

.delete-btn {
  background: #dc3545;
}

.delete-btn:hover:not(:disabled) {
  background: #c82333;
}

.prompt-preview {
  max-height: 200px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid #e1e5e9;
  border-radius: 6px;
  background: #f8f9fa;
  font-size: 13px;
}

.prompt-content pre {
  white-space: pre-wrap;
  margin: 0;
  font-family: monospace;
  font-size: 12px;
}

.no-selection, .error-message {
  text-align: center;
  color: #666;
  font-style: italic;
  padding: 20px;
}

.error-message {
  color: #dc3545;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 12px;
  max-width: 800px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.modal-content h3 {
  margin-top: 0;
  color: #333;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 5px;
  color: #333;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 2px solid #e1e5e9;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-textarea {
  width: 100%;
  padding: 10px;
  border: 2px solid #e1e5e9;
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
  box-sizing: border-box;
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 20px;
  border: 2px solid #6c757d;
  background: white;
  color: #6c757d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel:hover:not(:disabled) {
  background: #6c757d;
  color: white;
}

.btn-save {
  padding: 10px 20px;
  border: none;
  background: #007bff;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-save:hover:not(:disabled) {
  background: #0056b3;
}

.btn-save:disabled, .btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>