'use client'

import { useState, useCallback } from 'react'
import type { AudioState } from '@/types'

interface AudioStateMachineResult {
  state: AudioState
  setIdle: () => void
  setAiSpeaking: () => void
  setListening: () => void
  setUserSpeaking: () => void
  setProcessing: () => void
  canListen: boolean
  isAiSpeaking: boolean
  isProcessing: boolean
}

export function useAudioStateMachine(): AudioStateMachineResult {
  const [state, setState] = useState<AudioState>('IDLE')

  const setIdle = useCallback(() => setState('IDLE'), [])
  const setAiSpeaking = useCallback(() => setState('AI_SPEAKING'), [])
  const setListening = useCallback(() => setState('LISTENING'), [])
  const setUserSpeaking = useCallback(() => setState('USER_SPEAKING'), [])
  const setProcessing = useCallback(() => setState('PROCESSING'), [])

  return {
    state,
    setIdle,
    setAiSpeaking,
    setListening,
    setUserSpeaking,
    setProcessing,
    canListen: state === 'LISTENING' || state === 'USER_SPEAKING',
    isAiSpeaking: state === 'AI_SPEAKING',
    isProcessing: state === 'PROCESSING',
  }
}
