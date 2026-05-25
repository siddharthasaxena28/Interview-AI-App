'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react'
import { useAudioStateMachine } from '@/hooks/useAudioStateMachine'
import { useAnalytics } from '@/hooks/useAnalytics'
import { formatDuration } from '@/lib/utils'
import type { Question, RoundType } from '@/types'
import { PERSONAS } from '@/lib/personas'
import { use } from 'react'

interface SessionPageProps {
  params: Promise<{ sessionId: string }>
}

interface SessionData {
  session: {
    id: string
    company: string
    role: string
    round_type: RoundType
    user_id: string
    status: string
  }
  questions: Question[]
}

export default function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = use(params)
  const router = useRouter()
  const analytics = useAnalytics()
  const { state, setAiSpeaking, setListening, setUserSpeaking, setProcessing, setIdle } = useAudioStateMachine()

  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [muted, setMuted] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState('')
  const [micPermission, setMicPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [loadingSession, setLoadingSession] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const answerStartRef = useRef<number>(0)
  const isMountedRef = useRef(true)

  // Load session data
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch(`/api/session-data/${sessionId}`)
        if (!res.ok) throw new Error('Session not found')
        const data = await res.json()
        setSessionData(data)
        setCurrentQuestion(data.questions[0] ?? null)
        setTotalQuestions(data.questions.length)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setLoadingSession(false)
      }
    }
    loadSession()

    return () => {
      isMountedRef.current = false
    }
  }, [sessionId])

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((e) => e + 1)
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Request mic permission
  useEffect(() => {
    async function requestMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        mediaStreamRef.current = stream
        setMicPermission('granted')
      } catch {
        setMicPermission('denied')
        setError('Microphone access denied. Please allow microphone access and refresh.')
      }
    }
    requestMic()
  }, [])

  // Connect Deepgram WebSocket after mic granted
  useEffect(() => {
    if (micPermission !== 'granted' || !sessionData) return

    async function setupDeepgram() {
      try {
        const res = await fetch('/api/deepgram-token')
        const { key } = await res.json()

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-3&language=en-IN&punctuate=true&interim_results=true&vad_events=true&endpointing=3000`,
          ['token', key]
        )

        ws.onopen = () => {
          wsRef.current = ws
          setupAudioStreaming(ws)
          analytics.capture('interview_started', {
            session_id: sessionId,
            round_type: sessionData?.session.round_type,
            company: sessionData?.session.company,
          })
          if (currentQuestion) {
            speakQuestion(currentQuestion.text)
          }
        }

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return
          try {
            const data = JSON.parse(event.data)

            if (data.type === 'SpeechStarted') {
              if (isMountedRef.current) setUserSpeaking()
            }

            if (data.type === 'Results') {
              const transcript = data.channel?.alternatives?.[0]?.transcript ?? ''
              if (transcript) {
                if (data.is_final) {
                  setFinalTranscript((prev) => prev + ' ' + transcript)
                  setLiveTranscript('')
                } else {
                  setLiveTranscript(transcript)
                }
              }
            }

            // VAD silence detected — user finished speaking
            if (data.type === 'UtteranceEnd' || (data.type === 'Results' && data.speech_final)) {
              const fullTranscript = (finalTranscript + ' ' + liveTranscript).trim()
              if (fullTranscript && currentQuestion) {
                handleAnswerComplete(fullTranscript)
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onerror = () => {
          if (isMountedRef.current) setError('Connection error. Please refresh and try again.')
        }

        ws.onclose = () => {
          wsRef.current = null
        }
      } catch {
        setError('Failed to connect to speech recognition.')
      }
    }

    setupDeepgram()

    return () => {
      wsRef.current?.close()
      audioContextRef.current?.close()
      processorRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micPermission, sessionData])

  function setupAudioStreaming(ws: WebSocket) {
    const stream = mediaStreamRef.current
    if (!stream) return

    const audioContext = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = audioContext

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN || muted) return
      const inputData = e.inputBuffer.getChannelData(0)
      const pcmData = convertFloat32ToInt16(inputData)
      ws.send(pcmData.buffer)
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  function convertFloat32ToInt16(buffer: Float32Array): Int16Array {
    const l = buffer.length
    const output = new Int16Array(l)
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]))
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return output
  }

  async function speakQuestion(text: string) {
    if (!sessionData) return
    setAiSpeaking()
    setFinalTranscript('')
    setLiveTranscript('')

    const persona = PERSONAS[sessionData.session.round_type]

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: persona.voiceId }),
      })

      if (!res.ok) throw new Error('TTS failed')

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl)
          setListening()
          answerStartRef.current = Date.now()
        }
        await audioRef.current.play()
      }
    } catch {
      // Fallback: use browser TTS
      setListening()
      answerStartRef.current = Date.now()
    }
  }

  const handleAnswerComplete = useCallback(async (transcript: string) => {
    if (!currentQuestion || !sessionData) return
    setProcessing()
    setFinalTranscript('')

    try {
      const res = await fetch('/api/evaluate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          question_id: currentQuestion.id,
          session_id: sessionId,
          start_time: answerStartRef.current,
        }),
      })

      const data = await res.json()

      if (data.next_question && data.questions_remaining > 0) {
        setCurrentQuestion(data.next_question)
        setQuestionIndex((i) => i + 1)
        await speakQuestion(data.next_question.text)
      } else {
        // Interview complete
        await endInterview()
      }
    } catch {
      setError('Failed to evaluate answer. Please refresh.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, sessionData, sessionId])

  async function endInterview(abandoned = false) {
    analytics.capture(abandoned ? 'interview_abandoned' : 'interview_completed', {
      session_id: sessionId,
      round_type: sessionData?.session.round_type,
      questions_answered: questionIndex,
      total_questions: totalQuestions,
      duration_seconds: elapsed,
    })
    setEnding(true)
    wsRef.current?.close()
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())

    try {
      // Mark session as completed
      await fetch(`/api/end-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })

      // Generate feedback
      const res = await fetch('/api/generate-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })

      if (res.ok) {
        router.push(`/interview/feedback/${sessionId}`)
      } else {
        router.push(`/interview/feedback/${sessionId}`)
      }
    } catch {
      router.push(`/interview/feedback/${sessionId}`)
    }
  }

  const persona = sessionData ? PERSONAS[sessionData.session.round_type] : null

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-8 h-8 border-2 border-white border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p>Loading your interview...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-red-900/30 border border-red-500 rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-white text-gray-900 px-6 py-2 rounded-xl font-medium text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (micPermission === 'denied') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-amber-900/30 border border-amber-500 rounded-2xl p-8 max-w-md text-center">
          <MicOff className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-2">Microphone Access Required</h2>
          <p className="text-amber-200 text-sm mb-4">
            Please allow microphone access in your browser settings and refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-amber-500 text-white px-6 py-2 rounded-xl font-medium text-sm"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  if (ending) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Volume2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Interview Complete!</h2>
          <p className="text-gray-400">Generating your feedback report...</p>
          <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mt-4" />
        </div>
      </div>
    )
  }

  const stateLabel: Record<string, string> = {
    IDLE: 'Connecting...',
    AI_SPEAKING: `${persona?.maleName ?? 'AI'} is speaking`,
    LISTENING: 'Your turn — speak now',
    USER_SPEAKING: 'Listening...',
    PROCESSING: 'Processing your answer...',
  }

  const stateColor: Record<string, string> = {
    IDLE: 'bg-gray-500',
    AI_SPEAKING: 'bg-blue-500',
    LISTENING: 'bg-green-500',
    USER_SPEAKING: 'bg-green-600',
    PROCESSING: 'bg-amber-500',
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center">
            <span className="font-bold text-sm">{persona?.maleName.charAt(0) ?? 'A'}</span>
          </div>
          <div>
            <div className="font-semibold text-sm">{persona?.maleName ?? 'AI Interviewer'}</div>
            <div className="text-xs text-gray-400">
              {sessionData?.session.company} — {sessionData?.session.role}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400 font-mono">{formatDuration(elapsed)}</div>
          <div className="text-sm text-gray-400">
            Q{questionIndex + 1}/{totalQuestions}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">
        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${stateColor[state]} ${state !== 'IDLE' ? 'animate-pulse' : ''}`} />
          <span className="text-gray-300 text-sm">{stateLabel[state]}</span>
        </div>

        {/* AI speaking animation */}
        {state === 'AI_SPEAKING' && (
          <div className="relative">
            <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center">
              <Volume2 className="w-10 h-10 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full bg-blue-500 animate-pulse-ring opacity-50" />
          </div>
        )}

        {/* Mic animation */}
        {(state === 'LISTENING' || state === 'USER_SPEAKING') && (
          <div className="relative">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
              state === 'USER_SPEAKING' ? 'bg-green-600' : 'bg-gray-700'
            }`}>
              {muted ? (
                <MicOff className="w-10 h-10 text-gray-400" />
              ) : (
                <Mic className={`w-10 h-10 ${state === 'USER_SPEAKING' ? 'text-white' : 'text-gray-400'}`} />
              )}
            </div>
            {state === 'USER_SPEAKING' && !muted && (
              <div className="absolute inset-0 rounded-full bg-green-500 animate-pulse-ring opacity-40" />
            )}
          </div>
        )}

        {/* Processing */}
        {state === 'PROCESSING' && (
          <div className="w-24 h-24 bg-amber-600/20 border-2 border-amber-500 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Current question */}
        {currentQuestion && (
          <div className="bg-gray-800 rounded-2xl p-6 max-w-2xl w-full text-center">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
              Q{questionIndex + 1} · {currentQuestion.topic_tag.replace(/_/g, ' ')} · Difficulty {currentQuestion.difficulty}/5
            </div>
            <p className="text-white text-lg leading-relaxed">{currentQuestion.text}</p>
          </div>
        )}

        {/* Live transcript */}
        {(liveTranscript || finalTranscript) && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 max-w-2xl w-full">
            <div className="text-xs text-gray-500 mb-1.5">Live transcript</div>
            <p className="text-gray-200 text-sm">
              {finalTranscript}
              <span className="text-gray-400">{liveTranscript}</span>
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-6 border-t border-gray-800 flex items-center justify-center gap-6">
        <button
          onClick={() => setMuted((m) => !m)}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
            muted
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="text-xs">{muted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          onClick={() => endInterview(true)}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="text-xs">End Interview</span>
        </button>
      </div>
    </div>
  )
}
