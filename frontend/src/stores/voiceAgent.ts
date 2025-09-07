import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VoiceAgentSession, RealtimeMessage, SceneDescription, ChatMessage } from '@/types'
import {useAppStore} from "@/stores/app.ts";

export const useVoiceAgentStore = defineStore('voiceAgent', () => {
  // State
  const session = ref<VoiceAgentSession>({
    ephemeralKey: '',
    peerConnection: null,
    dataChannel: null,
    audioStream: null,
    isConnected: false
  })

  const appStore = useAppStore()

  const isConnecting = ref(false)
  const sessionUpdated = ref(false)
  const pendingInstructions = ref<string | null>(null)
  const lastScreenImage = ref<string | null>(null)
  const error = ref<string | null>(null)
  
  // Scene analysis
  const sceneDescriptions = ref<SceneDescription[]>([])
  const descriptionsCount = ref(0)
  const maxDescriptions = ref(10)
  
  // Chat messages
  const chatMessages = ref<ChatMessage[]>([])
  const chatMessagesCount = ref(0)
  
  // Important text messages from assistant
  const importantTextMessage = ref('Short text messages for glasses will be displayed here')

  // Getters
  const isConnected = computed(() => session.value.isConnected)
  const connectionStatus = computed(() => {
    if (isConnecting.value) return 'connecting'
    if (session.value.isConnected) return 'connected'
    return 'disconnected'
  })
  
  const hasSceneDescriptions = computed(() => sceneDescriptions.value.length > 0)
  const latestSceneDescription = computed(() => sceneDescriptions.value[0] || null)

  const hasChatMessages = computed(() => chatMessages.value.length > 0)
  const latestChatMessage = computed(() => chatMessages.value[0] || null)

  // Actions
  async function createSession(apiKey?: string) {
    if (isConnecting.value) return
    
    isConnecting.value = true
    error.value = null
    
    try {
      // Get ephemeral key from server
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
      
      const tokenResponse = await fetch('/realtime/token', {
        method: 'GET',
        headers
      })

      if (!tokenResponse.ok) {
        throw new Error(`Session creation failed: ${tokenResponse.status}`)
      }

      const tokenData = await tokenResponse.json()
      session.value.ephemeralKey = tokenData.ephemeral_key

      // Initialize WebRTC connection
      await initializeWebRTC()
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create voice session'
      session.value.isConnected = false
      throw err
    } finally {
      isConnecting.value = false
    }
  }

  async function initializeWebRTC() {
    try {
      // Create peer connection
      session.value.peerConnection = new RTCPeerConnection()
      
      // Get user microphone
      session.value.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
      
      // Add audio track
      session.value.audioStream.getTracks().forEach(track => {
        session.value.peerConnection?.addTrack(track, session.value.audioStream!)
      })

      // Handle remote audio - create audio element dynamically
      session.value.peerConnection.ontrack = (event) => {
        const audioElement = document.createElement('audio')
        audioElement.autoplay = true
        audioElement.srcObject = event.streams[0]
        audioElement.style.display = 'none'
        document.body.appendChild(audioElement)
      }

      // Create data channel for function calls
      session.value.dataChannel = session.value.peerConnection.createDataChannel('oai-events', {
        ordered: true
      })

      setupDataChannelHandlers()

      // Start the session using SDP
      const offer = await session.value.peerConnection.createOffer()
      await session.value.peerConnection.setLocalDescription(offer)

      const baseUrl = "https://api.openai.com/v1/realtime/calls"
      const model = "gpt-realtime"
      const response = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.value.ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      })

      if (!response.ok) {
        throw new Error(`WebRTC connection failed: ${response.status}`)
      }

      const answer = {
        type: "answer" as const,
        sdp: await response.text(),
      }
      await session.value.peerConnection.setRemoteDescription(answer)

        appStore.updateConnectionStatus('voiceAgent', 'connected')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'WebRTC initialization failed'
      throw err
    }
  }

  function setupDataChannelHandlers() {
    if (!session.value.dataChannel) return

    session.value.dataChannel.onopen = () => {
      console.log('Data channel opened')
      session.value.isConnected = true
      
      // Wait for connection to stabilize before sending instructions
      setTimeout(() => {
        // We'll update instructions when prompts are ready
        console.log('Voice agent data channel ready - waiting for prompts')
      }, 1500)
    }

    session.value.dataChannel.onmessage = (event) => {
      try {
        const message: RealtimeMessage = JSON.parse(event.data)
        handleRealtimeMessage(message)
      } catch (err) {
        console.error('Error parsing data channel message:', err)
      }
    }

    session.value.dataChannel.onclose = () => {
      console.log('Data channel closed')
      session.value.isConnected = false
    }
  }

  function updateSessionInstructions(prompt?: string, detectionObjects?: string) {
    if (!session.value.dataChannel || session.value.dataChannel.readyState !== "open") {
      console.warn("Data channel is not open yet. Retrying in 2 seconds...")
      setTimeout(() => updateSessionInstructions(prompt, detectionObjects), 2000)
      return
    }

    if (!prompt) {
      console.error('No prompt provided')
      return
    }

    console.log('Sending session.update with instructions:', prompt.substring(0, 100) + '...')
    
    pendingInstructions.value = prompt
    sessionUpdated.value = false

    // Send session update with tools
    const event = {
      type: "session.update",
      session: {
          type: "realtime",
          instructions: prompt,
          tools: [
          {
            type: "function",
            name: "get_screenshot",
            description: "Get screenshot from the user's camera.",
          },
          {
            type: "function",
            name: "highlight_objects",
            description: "Return the list of objects that need to be highlighted for the user. Available objects: " + (detectionObjects || ''),
            parameters: {
              type: "object",
              properties: {
                list_of_objects: {
                  type: "string",
                  description: "The list of objects to highlight, separated by commas. Example: \"car,truck,bicycle\".",
                }
              },
              required: ["list_of_objects"]
            }
          },
          {
            type: "function",
            name: "send_short_text_message",
            description: "Send short text message (one sentence) to the user to highlight what is important to pay attention to.",
            parameters: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "The message to send.",
                }
              },
              required: ["message"]
            }
          }
        ],
        tool_choice: "auto",
      },
    }

    session.value.dataChannel.send(JSON.stringify(event))
  }

  function createInitialResponse() {
    if (session.value.dataChannel?.readyState === "open" && sessionUpdated.value) {
      console.log('Creating initial response after session update confirmed')
      
      // session.value.dataChannel.send(JSON.stringify({
      //   type: "response.create",
      // }))
      
      pendingInstructions.value = null
    }
  }

  function handleRealtimeMessage(message: RealtimeMessage) {
    // Handle session updates
    if (message.type === 'session.updated') {
      console.log('Session updated successfully')
      sessionUpdated.value = true

      if (pendingInstructions.value) {
        setTimeout(() => createInitialResponse(), 2000)
      }
    }
    
    // Handle function calls
    if (message.type === 'response.done') {
      message.response?.output?.forEach((output: any) => {
        if (output.type === "function_call") {
          handleFunctionCall(output, message)
        }

        if (output.type === "message") {
            output.content?.forEach((content: any) => {
                if (content?.transcript) {
                    const chatMessage: ChatMessage = {
                        role: "assistant",
                        text: content.transcript,
                        timestamp: new Date(),
                    }

                    addChatMessage(chatMessage)
                }
            })
        }
      })
    }

    if (message.type === 'conversation.item.input_audio_transcription.completed') {
        if ( message.transcript) {
            const chatMessage: ChatMessage = {
                role: "user",
                text: message.transcript,
                timestamp: new Date(),
            }

            addChatMessage(chatMessage)
        }
    }

    // Handle errors
    if (message.type === 'error') {
      console.error('Realtime API error:', message)
      error.value = `Realtime API error: ${message.error?.message || 'Unknown error'}`
    }
  }

  function handleFunctionCall(output: any, message: RealtimeMessage) {
    console.log('Function call received:', output.name)

    try {
      const args = JSON.parse(output.arguments || '{}')

      switch (output.name) {
        case 'get_screenshot':
          if (lastScreenImage.value) {
            sendScreenshotToAgent(message.id)
          }
          break
          
        case 'send_short_text_message':
          importantTextMessage.value = args.message || ''
          break
          
        case 'highlight_objects':
          // This will be handled by the detection store
          // We'll emit an event or use a callback
          if (args.list_of_objects) {
            // Emit event or call callback to update filtered objects
            document.dispatchEvent(new CustomEvent('highlight-objects', { 
              detail: args.list_of_objects 
            }))
          }
          break
      }
    } catch (err) {
      console.error('Error parsing function arguments:', err)
    }
  }

  function sendScreenshotToAgent(previousItemId?: string) {
    if (!session.value.dataChannel || !lastScreenImage.value) return

    const event = {
      type: "conversation.item.create",
      previous_item_id: previousItemId,
      item: {
        type: "message",
        role: "user" as const,
        content: [{
          type: "input_image" as const,
          image_url: "data:image/jpeg;base64," + lastScreenImage.value,
        }]
      },
    }

    session.value.dataChannel.send(JSON.stringify(event))
    session.value.dataChannel.send(JSON.stringify({ type: "response.create" }))
  }

  function addSceneDescription(description: SceneDescription) {
    // Send to voice agent if connected
    if (session.value.dataChannel?.readyState === 'open') {
      const event = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system" as const,
          content: [{
            type: "input_text" as const,
            text: description.text,
          }]
        },
      }
      session.value.dataChannel.send(JSON.stringify(event))
    }

    // Add to local descriptions
    sceneDescriptions.value.unshift(description)
    
    if (sceneDescriptions.value.length > maxDescriptions.value) {
      sceneDescriptions.value = sceneDescriptions.value.slice(0, maxDescriptions.value)
    }
    
    descriptionsCount.value++
  }

  function addChatMessage(description: ChatMessage) {
    chatMessages.value.unshift(description)

    chatMessagesCount.value++
  }

  function updateScreenshot(imageBase64: string) {
    lastScreenImage.value = imageBase64
  }

  function disconnect() {
    try {
      if (session.value.dataChannel) {
        session.value.dataChannel.close()
        session.value.dataChannel = null
      }
      
      if (session.value.peerConnection) {
        session.value.peerConnection.close()
        session.value.peerConnection = null
      }

      if (session.value.audioStream) {
        session.value.audioStream.getTracks().forEach(track => track.stop())
        session.value.audioStream = null
      }

      session.value.isConnected = false
      sessionUpdated.value = false
      pendingInstructions.value = null

      appStore.updateConnectionStatus('voiceAgent', 'disconnected')
    } catch (err) {
      console.error('Error disconnecting voice agent:', err)
    }
  }

  function clearDescriptions() {
    sceneDescriptions.value = []
    descriptionsCount.value = 0
  }

  function clearChatMessages() {
      chatMessages.value = []
      chatMessagesCount.value = 0
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    session,
    isConnecting,
    sessionUpdated,
    pendingInstructions,
    lastScreenImage,
    error,
    sceneDescriptions,
    descriptionsCount,
    maxDescriptions,
    chatMessages,
    chatMessagesCount,
    importantTextMessage,
    
    // Getters
    isConnected,
    connectionStatus,
    hasSceneDescriptions,
    latestSceneDescription,
    hasChatMessages,
    latestChatMessage,
    
    // Actions
    createSession,
    updateSessionInstructions,
    handleRealtimeMessage,
    addSceneDescription,
    addChatMessage,
    updateScreenshot,
    disconnect,
    clearDescriptions,
    clearChatMessages,
    clearError
  }
})