'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react'
import { useAudioStateMachine } from '@/hooks/useAudioStateMachine'
import { useAnalytics } from '@/hooks/useAnalytics'
import { formatDuration } from '@/lib/utils'
import type { Question, RoundType } from '@/types'
import { PERSONAS } from '@/lib/personas'

interface SessionPageProps {
  params: { sessionId: string }
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

function SessionPageInner({ params }: SessionPageProps) {
  const { sessionId } = params
  const router = useRouter()
  const searchParams = useSearchParams()
  const genderParam = (searchParams.get('gender') ?? 'male') as 'male' | 'female'
  const analytics = useAnalytics()
  const { state, setAiSpeaking, setListening, setUserSpeaking, setProcessing } = useAudioStateMachine()

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
  const [phase, setPhase] = useState<'intro' | 'interview'>('intro')
  const [started, setStarted] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const answerStartRef = useRef<number>(0)
  const isMountedRef = useRef(true)
  const finalTranscriptRef = useRef('')
  const liveTranscriptRef = useRef('')
  const currentQuestionRef = useRef<Question | null>(null)
  const mutedRef = useRef(false)
  const systemMutedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const handleAnswerCompleteRef = useRef<(t: string) => Promise<void>>(async () => {})
  const phaseRef = useRef<'intro' | 'interview'>('intro')
  const introStepRef = useRef(1)
  // Reconnect state
  const endingRef = useRef(false)
  const autoEndedRef = useRef(false)
  const hasGreetedRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { currentQuestionRef.current = currentQuestion }, [currentQuestion])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { endingRef.current = ending }, [ending])

  // Load session data
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch(`/api/session-data/${sessionId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? 'Session not found')
        }
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

  // 30-min auto-end (60 min for full_loop)
  useEffect(() => {
    if (!sessionData || !started || autoEndedRef.current || ending) return
    const limit = sessionData.session.round_type === 'full_loop' ? 3600 : 1800
    if (elapsed >= limit) {
      autoEndedRef.current = true
      endInterview(false)
    }
    // endInterview intentionally omitted — it's stable within the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, started, sessionData, ending])

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

  // Connect Deepgram WebSocket after the user clicks "Begin"
  useEffect(() => {
    if (!started || micPermission !== 'granted' || !sessionData) return

    const sd = sessionData

    async function setupDeepgram() {
      try {
        const res = await fetch('/api/deepgram-token')
        const tokenData = await res.json()
        if (!res.ok || !tokenData.key) {
          setError('Speech recognition is not configured. Please contact support.')
          return
        }
        const { key } = tokenData

        let audioContext = audioContextRef.current
        if (!audioContext) {
          audioContext = new AudioContext()
          audioContextRef.current = audioContext
        }
        if (audioContext.state === 'suspended') await audioContext.resume().catch(() => {})
        const sampleRate = Math.round(audioContext.sampleRate)

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-2-general&language=en-IN&punctuate=true&interim_results=true&vad_events=true&endpointing=1500&utterance_end_ms=1500&encoding=linear16&sample_rate=${sampleRate}&channels=1`,
          ['token', key]
        )

        ws.onopen = () => {
          wsRef.current = ws
          reconnectAttemptsRef.current = 0
          setReconnecting(false)
          setupAudioStreaming(ws)

          if (!hasGreetedRef.current) {
            // First connection — greet the candidate
            hasGreetedRef.current = true
            const persona = PERSONAS[sd.session.round_type]
            const interviewerName = genderParam === 'female' ? persona.femaleName : persona.maleName
            analytics.capture('interview_started', {
              session_id: sessionId,
              round_type: sd.session.round_type,
              company: sd.session.company,
            })
            introStepRef.current = 1
            speakText(
              `Hi there! Welcome, and thanks for joining us today. I'm ${interviewerName}, and I'll be conducting your interview for the ${sd.session.role} position at ${sd.session.company}. It's great to have you here! How are you feeling today?`
            )
          } else {
            // Reconnected mid-interview — resume listening state immediately
            setListening()
          }
        }

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return
          try {
            const msg = JSON.parse(event.data)

            if (systemMutedRef.current) return

            if (msg.type === 'SpeechStarted') {
              setUserSpeaking()
            }

            if (msg.type === 'Results') {
              const transcript = msg.channel?.alternatives?.[0]?.transcript ?? ''
              if (transcript) {
                if (msg.is_final) {
                  finalTranscriptRef.current = (finalTranscriptRef.current + ' ' + transcript).trimStart()
                  liveTranscriptRef.current = ''
                  setFinalTranscript(finalTranscriptRef.current)
                  setLiveTranscript('')
                } else {
                  liveTranscriptRef.current = transcript
                  setLiveTranscript(transcript)
                }
              }
            }

            if (msg.type === 'UtteranceEnd' || (msg.type === 'Results' && msg.speech_final)) {
              if (isProcessingRef.current) return

              const full = (finalTranscriptRef.current + ' ' + liveTranscriptRef.current).trim()
              if (!full) return

              isProcessingRef.current = true
              finalTranscriptRef.current = ''
              liveTranscriptRef.current = ''

              if (phaseRef.current === 'intro') {
                const step = introStepRef.current
                if (step === 1) {
                  introStepRef.current = 3
                  speakText(
                    `That's great to hear! Before we dive in, I'd love to know a bit more about you. Could you give me a quick introduction — your background, experience, and what drew you to apply for this ${sd.session.role} role at ${sd.session.company}?`
                  )
                } else if (step === 3) {
                  phaseRef.current = 'interview'
                  setPhase('interview')
                  const q = currentQuestionRef.current
                  if (q) {
                    speakText(
                      `That's a great background — thank you for sharing! Alright, let's get into the interview. Here's the first question: ${q.text}`
                    )
                  }
                }
              } else {
                handleAnswerCompleteRef.current(full)
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onerror = () => {
          // onclose will fire after onerror and handle reconnect
        }

        ws.onclose = (event) => {
          wsRef.current = null
          // 1000 = normal close, 1001 = going away — don't reconnect
          if (event.code === 1000 || event.code === 1001 || endingRef.current || !isMountedRef.current) return
          if (reconnectAttemptsRef.current >= 3) {
            if (isMountedRef.current) setError('Connection lost. Please refresh to continue.')
            return
          }
          reconnectAttemptsRef.current++
          setReconnecting(true)
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000 // 2s, 4s, 8s
          reconnectTimerRef.current = setTimeout(() => {
            if (!endingRef.current && isMountedRef.current) {
              setupDeepgram()
            }
          }, delay)
        }
      } catch {
        setError('Failed to connect to speech recognition.')
      }
    }

    setupDeepgram()

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close(1000)
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
        processorRef.current.disconnect()
      }
      sourceNodeRef.current?.disconnect()
      audioContextRef.current?.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, micPermission, sessionData])

  function setupAudioStreaming(ws: WebSocket) {
    const stream = mediaStreamRef.current
    const audioContext = audioContextRef.current
    if (!stream || !audioContext) return
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})

    // Tear down any previous nodes — on reconnect this runs again and the old
    // source/processor would otherwise leak and keep firing onaudioprocess.
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }

    const source = audioContext.createMediaStreamSource(stream)
    sourceNodeRef.current = source
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN || mutedRef.current || systemMutedRef.current) return
      const pcm = convertFloat32ToInt16(e.inputBuffer.getChannelData(0))
      ws.send(pcm.buffer)
    }

    source.connect(processor)
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    processor.connect(silentGain)
    silentGain.connect(audioContext.destination)
  }

  function convertFloat32ToInt16(buffer: Float32Array): Int16Array {
    const out = new Int16Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }

  async function speakText(text: string, startListening = true): Promise<void> {
    if (!sessionData) return
    setAiSpeaking()
    systemMutedRef.current = true
    setFinalTranscript('')
    setLiveTranscript('')
    finalTranscriptRef.current = ''
    liveTranscriptRef.current = ''

    const keepAliveInterval = setInterval(() => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'KeepAlive' }))
      }
    }, 8000)

    const persona = PERSONAS[sessionData.session.round_type]
    // Use gender-appropriate voice if available
    const voiceId = genderParam === 'female' && persona.femaleVoiceId
      ? persona.femaleVoiceId
      : persona.voiceId
    let ttsSucceeded = false

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId }),
      })
      if (!res.ok) throw new Error('TTS failed')

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      const estDurationMs = Math.max(5000, text.length * 65)
      await new Promise<void>((resolve) => {
        if (!audioRef.current) { resolve(); return }
        let done = false
        const finish = () => { if (!done) { done = true; URL.revokeObjectURL(audioUrl); resolve() } }
        audioRef.current.src = audioUrl
        audioRef.current.onended = finish
        audioRef.current.onerror = finish
        audioRef.current.play().catch(finish)
        setTimeout(finish, estDurationMs + 3000)
      })
      ttsSucceeded = true
    } catch {
      // Fall through to browser synthesis
    }

    if (!ttsSucceeded && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const estDurationMs = Math.max(4000, text.length * 65)
      await new Promise<void>((resolve) => {
        let done = false
        const finish = () => { if (!done) { done = true; resolve() } }

        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.92
        utterance.pitch = 1.0
        utterance.onend = finish
        utterance.onerror = finish
        window.speechSynthesis.speak(utterance)
        setTimeout(finish, estDurationMs + 2000)
      })
    }

    clearInterval(keepAliveInterval)
    systemMutedRef.current = false
    isProcessingRef.current = false
    if (startListening) {
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
        // A probe stays on the same logical question — don't advance the counter.
        if (!data.is_probe) setQuestionIndex((i) => i + 1)
        let ackText: string
        if (data.is_probe) {
          // Interviewer pushing back — flow straight into the follow-up, no "moving on".
          ackText = data.brief_feedback
            ? `${data.brief_feedback} ${data.next_question.text}`
            : data.next_question.text
        } else {
          ackText = data.brief_feedback
            ? `${data.brief_feedback} Let's move on. ${data.next_question.text}`
            : data.next_question.text
        }
        await speakText(ackText)
      } else {
        await endInterview()
      }
    } catch {
      setError('Failed to evaluate answer. Please refresh.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, sessionData, sessionId])

  useEffect(() => { handleAnswerCompleteRef.current = handleAnswerComplete }, [handleAnswerComplete])

  async function handleBegin() {
    try {
      const ctx = new AudioContext({ sampleRate: 16000 })
      if (ctx.state === 'suspended') await ctx.resume()
      audioContextRef.current = ctx
    } catch {
      // setupAudioStreaming creates one as fallback
    }
    setStarted(true)
  }

  async function endInterview(abandoned = false) {
    analytics.capture(abandoned ? 'interview_abandoned' : 'interview_completed', {
      session_id: sessionId,
      round_type: sessionData?.session.round_type,
      questions_answered: questionIndex,
      total_questions: totalQuestions,
      duration_seconds: elapsed,
    })

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    wsRef.current?.close(1000)
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())

    fetch('/api/end-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})

    fetch('/api/generate-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(console.error)

    if (!abandoned && sessionData) {
      await speakText(
        `That brings us to the end of the interview. Thank you so much for your time today — it was a pleasure speaking with you. I'll review your answers and have your detailed feedback report ready shortly. Best of luck, and we'll be in touch!`,
        false
      ).catch(() => {})
    }

    setEnding(true)
    router.push(`/interview/feedback/${sessionId}`)
  }

  const persona = sessionData ? PERSONAS[sessionData.session.round_type] : null
  const personaName = persona
    ? (genderParam === 'female' ? persona.femaleName : persona.maleName)
    : 'AI Interviewer'

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
    const noCredits = error.toLowerCase().includes('credit')
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-red-900/30 border border-red-500 rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-400 mb-4">{error}</p>
          {noCredits && (
            <p className="text-gray-400 text-sm mb-4">
              You need credits to start an interview. Pick up a plan on the pricing page.
            </p>
          )}
          <div className="flex gap-3 justify-center">
            {noCredits && (
              <button
                onClick={() => router.push('/pricing')}
                className="bg-blue-600 text-white px-6 py-2 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                View Pricing
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-white text-gray-900 px-6 py-2 rounded-xl font-medium text-sm"
            >
              Back to Dashboard
            </button>
          </div>
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

  if (!started) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-3xl font-bold">{personaName.charAt(0)}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {personaName} is ready
          </h1>
          <p className="text-gray-400 text-sm mb-2">
            {sessionData?.session.company} — {sessionData?.session.role}
          </p>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            Pop on your headphones and find a quiet spot. When you click below, {personaName} will
            greet you and the conversation will begin.
          </p>
          <button
            onClick={handleBegin}
            disabled={micPermission !== 'granted'}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {micPermission === 'granted' ? (
              <>
                <Mic className="w-4 h-4" /> Begin Interview
              </>
            ) : (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Requesting microphone…
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  const stateLabel: Record<string, string> = {
    IDLE: 'Connecting...',
    AI_SPEAKING: `${personaName} is speaking`,
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

  // Time limit warning (show at 25 min for 30-min sessions, 50 min for full_loop)
  const sessionLimit = sessionData?.session.round_type === 'full_loop' ? 3600 : 1800
  const timeWarning = elapsed >= sessionLimit - 300 && elapsed < sessionLimit

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center">
            <span className="font-bold text-sm">{personaName.charAt(0)}</span>
          </div>
          <div>
            <div className="font-semibold text-sm">{personaName}</div>
            <div className="text-xs text-gray-400">
              {sessionData?.session.company} — {sessionData?.session.role}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {reconnecting && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
              Reconnecting…
            </div>
          )}
          <div className={`text-sm font-mono ${timeWarning ? 'text-amber-400' : 'text-gray-400'}`}>
            {formatDuration(elapsed)}
            {timeWarning && <span className="ml-1 text-xs">⚠ wrapping up</span>}
          </div>
          {phase === 'interview' ? (
            <div className="text-sm text-gray-400">
              Q{questionIndex + 1}/{totalQuestions}
            </div>
          ) : (
            <div className="text-xs text-blue-400 bg-blue-900/30 px-2.5 py-1 rounded-full font-medium">
              Intro
            </div>
          )}
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

        {/* Context card */}
        {phase === 'intro' ? (
          <div className="bg-gray-800 rounded-2xl p-6 max-w-2xl w-full text-center">
            <div className="text-xs text-blue-400 mb-2 uppercase tracking-wide font-medium">
              Introductory Conversation
            </div>
            <p className="text-gray-300 text-base leading-relaxed">
              {state === 'LISTENING' || state === 'USER_SPEAKING'
                ? introStepRef.current === 1
                  ? 'How are you feeling today?'
                  : 'Tell me about yourself and your background.'
                : 'Getting to know you before the interview begins...'}
            </p>
          </div>
        ) : currentQuestion ? (
          <div className="bg-gray-800 rounded-2xl p-6 max-w-2xl w-full text-center">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
              Q{questionIndex + 1} · {currentQuestion.topic_tag.replace(/_/g, ' ')} · Difficulty {currentQuestion.difficulty}/5
            </div>
            <p className="text-white text-lg leading-relaxed">{currentQuestion.text}</p>
          </div>
        ) : null}

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
          onClick={() => setMuted((m) => { mutedRef.current = !m; return !m })}
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

export default function SessionPage({ params }: SessionPageProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <SessionPageInner params={params} />
    </Suspense>
  )
}
