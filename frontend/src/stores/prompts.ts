import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Prompt, PromptCreate, PromptUpdate } from '@/types'

export const usePromptsStore = defineStore('prompts', () => {
  // State
  const prompts = ref<Prompt[]>([])
  const selectedPromptId = ref<number | null>(null)
  const isEditingPrompt = ref(false)
  const editingPromptId = ref<number | null>(null)
  const showModal = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const selectedPrompt = computed(() => 
    prompts.value.find(p => p.id === selectedPromptId.value) || null
  )
  
  const editingPrompt = computed(() => 
    prompts.value.find(p => p.id === editingPromptId.value) || null
  )

  const hasPrompts = computed(() => prompts.value.length > 0)
  
  const promptsCount = computed(() => prompts.value.length)

  // Actions
  async function loadPrompts() {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch('/api/prompts')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      prompts.value = await response.json()
      
      // Select first prompt by default if none selected
      if (prompts.value.length > 0 && !selectedPromptId.value) {
        selectedPromptId.value = prompts.value[0].id
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load prompts'
      console.error('Failed to load prompts:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function createPrompt(promptData: PromptCreate) {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(promptData),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }
      
      const newPrompt = await response.json()
      prompts.value.push(newPrompt)
      
      // Select the newly created prompt
      selectedPromptId.value = newPrompt.id
      
      return newPrompt
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create prompt'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updatePrompt(id: number, promptData: PromptUpdate) {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch(`/api/prompts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(promptData),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }
      
      const updatedPrompt = await response.json()
      const index = prompts.value.findIndex(p => p.id === id)
      if (index !== -1) {
        prompts.value[index] = updatedPrompt
      }
      
      return updatedPrompt
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update prompt'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function deletePrompt(id: number) {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch(`/api/prompts/${id}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      prompts.value = prompts.value.filter(p => p.id !== id)
      
      // Clear selection if deleted prompt was selected
      if (selectedPromptId.value === id) {
        selectedPromptId.value = prompts.value.length > 0 ? prompts.value[0].id : null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete prompt'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function selectPrompt(id: number | null) {
    selectedPromptId.value = id
  }

  function startEditing(id: number) {
    const prompt = prompts.value.find(p => p.id === id)
    if (!prompt) {
      error.value = 'Prompt not found'
      return
    }
    
    isEditingPrompt.value = true
    editingPromptId.value = id
    showModal.value = true
  }

  function startCreating() {
    isEditingPrompt.value = false
    editingPromptId.value = null
    showModal.value = true
  }

  function cancelEditing() {
    isEditingPrompt.value = false
    editingPromptId.value = null
    showModal.value = false
    error.value = null
  }

  function clearError() {
    error.value = null
  }

  // Form helper functions
  async function savePrompt(name: string, content: string) {
    if (!name.trim()) {
      throw new Error('Please enter a prompt name')
    }
    
    if (!content.trim()) {
      throw new Error('Please enter prompt content')
    }
    
    const promptData = { name: name.trim(), content: content.trim() }
    
    if (isEditingPrompt.value && editingPromptId.value) {
      await updatePrompt(editingPromptId.value, promptData)
    } else {
      await createPrompt(promptData)
    }
    
    cancelEditing()
  }

  async function confirmDelete(id: number) {
    const prompt = prompts.value.find(p => p.id === id)
    if (!prompt) return false
    
    const confirmed = confirm(`Are you sure you want to delete "${prompt.name}"?`)
    if (confirmed) {
      await deletePrompt(id)
      return true
    }
    return false
  }

  return {
    // State
    prompts,
    selectedPromptId,
    isEditingPrompt,
    editingPromptId,
    showModal,
    isLoading,
    error,
    
    // Getters
    selectedPrompt,
    editingPrompt,
    hasPrompts,
    promptsCount,
    
    // Actions
    loadPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    selectPrompt,
    startEditing,
    startCreating,
    cancelEditing,
    clearError,
    savePrompt,
    confirmDelete
  }
})