'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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

export default function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = params
  const router = useRouter()
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
  // intro → interviewer warm-up; interview → scored questions
  const [phase, setPhase] = useState<'intro' | 'interview'>('intro')
  // Gate the audio pipeline behind an explicit click on THIS page so the browser
  // grants sticky activation (autoplay) and lets us resume the AudioContext.
  const [started, setStarted] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const answerStartRef = useRef<number>(0)
  const isMountedRef = useRef(true)
  // Refs that must be read inside WebSocket callbacks (stale-closure-safe)
  const finalTranscriptRef = useRef('')
  const liveTranscriptRef = useRef('')
  const currentQuestionRef = useRef<Question | null>(null)
  const mutedRef = useRef(false)
  // True while AI is speaking — prevents streaming mic audio to Deepgram during that time
  const systemMutedRef = useRef(false)
  const handleAnswerCompleteRef = useRef<(t: string) => Promise<void>>(async () => {})
  const phaseRef = useRef<'intro' | 'interview'>('intro')
  // introStep: 1 = listening for greeting reply, 3 = listening for self-intro
  const introStepRef = useRef(1)

  useEffect(() => { currentQuestionRef.current = currentQuestion }, [currentQuestion])
  useEffect(() => { phaseRef.current = phase }, [phase])

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

  // Connect Deepgram WebSocket after the user clicks "Begin", mic is granted, and session is loaded
  useEffect(() => {
    if (!started || micPermission !== 'granted' || !sessionData) return

    async function setupDeepgram() {
      if (!sessionData) return
      const sd = sessionData // narrowed, non-null reference safe to use in closures below
      try {
        const res = await fetch('/api/deepgram-token')
        const tokenData = await res.json()
        if (!res.ok || !tokenData.key) {
          setError('Speech recognition is not configured. Please contact support.')
          return
        }
        const { key } = tokenData

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-2-general&language=en-IN&punctuate=true&interim_results=true&vad_events=true&endpointing=1500&utterance_end_ms=1500`,
          ['token', key]
        )

        ws.onopen = () => {
          wsRef.current = ws
          setupAudioStreaming(ws)
          analytics.capture('interview_started', {
            session_id: sessionId,
            round_type: sd.session.round_type,
            company: sd.session.company,
          })
          // Start with a natural greeting before the first question
          const persona = PERSONAS[sd.session.round_type]
          introStepRef.current = 1
          speakText(
            `Hi there! Welcome, and thanks for joining us today. I'm ${persona.maleName}, and I'll be conducting your interview for the ${sd.session.role} position at ${sd.session.company}. It's great to have you here! How are you feeling today?`
          )
        }

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return
          try {
            const msg = JSON.parse(event.data)

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
              const full = (finalTranscriptRef.current + ' ' + liveTranscriptRef.current).trim()
              if (!full) return

              finalTranscriptRef.current = ''
              liveTranscriptRef.current = ''

              if (phaseRef.current === 'intro') {
                const step = introStepRef.current
                if (step === 1) {
                  // Candidate replied to "how are you" → ask for self-intro
                  introStepRef.current = 3
                  speakText(
                    `That's great to hear! Before we dive in, I'd love to know a bit more about you. Could you give me a quick introduction — your background, experience, and what drew you to apply for this ${sd.session.role} role?`
                  )
                } else if (step === 3) {
                  // Candidate gave self-intro → transition to first interview question
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
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, micPermission, sessionData])

  function setupAudioStreaming(ws: WebSocket) {
    const stream = mediaStreamRef.current
    if (!stream) return

    // Pick the best supported MIME type; Deepgram auto-detects opus/webm containers
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (
        event.data.size > 0 &&
        ws.readyState === WebSocket.OPEN &&
        !mutedRef.current &&
        !systemMutedRef.current
      ) {
        ws.send(event.data)
      }
    }

    recorder.start(250) // 250ms chunks — low latency without excessive overhead
  }

  // Core TTS helper — speaks text and resolves when audio finishes playing
  async function speakText(text: string, startListening = true): Promise<void> {
    if (!sessionData) return
    setAiSpeaking()
    // Mute mic while AI speaks so Deepgram doesn't transcribe the AI's own voice
    systemMutedRef.current = true
    setFinalTranscript('')
    setLiveTranscript('')
    finalTranscriptRef.current = ''
    liveTranscriptRef.current = ''

    const persona = PERSONAS[sessionData.session.round_type]
    let ttsSucceeded = false

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: persona.voiceId }),
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
      // ElevenLabs unavailable — fall back to browser speech synthesis
    }

    // Browser speechSynthesis fallback so the user always hears the interviewer.
    // Chrome bug: onend may never fire if voices haven't loaded — guard with a timeout.
    if (!ttsSucceeded && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const estDurationMs = Math.max(4000, text.length * 65) // ~65ms per char at 0.92x rate
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
        // Safety timeout: if onend never fires (Chrome voices-not-loaded bug), unblock
        setTimeout(finish, estDurationMs + 2000)
      })
    }

    // Unmute mic before switching to listening so we don't drop the first words
    systemMutedRef.current = false
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
        setQuestionIndex((i) => i + 1)
        // Natural acknowledgment of the answer before asking the next question
        const ackText = data.brief_feedback
          ? `${data.brief_feedback} Let's move on to the next one. ${data.next_question.text}`
          : data.next_question.text
        await speakText(ackText)
      } else {
        await endInterview()
      }
    } catch {
      setError('Failed to evaluate answer. Please refresh.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, sessionData, sessionId])

  // Keep ref in sync so WebSocket callbacks always call the latest version
  useEffect(() => { handleAnswerCompleteRef.current = handleAnswerComplete }, [handleAnswerComplete])

  // The click on this button grants sticky activation so audio.play() is
  // allowed later in async TTS callbacks (browser autoplay policy).
  function handleBegin() {
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

    wsRef.current?.close()
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())

    if (!abandoned && sessionData) {
      // Speak a natural closing before showing the ending screen
      const persona = PERSONAS[sessionData.session.round_type]
      await speakText(
        `That brings us to the end of the interview. Thank you so much for your time today — it was a pleasure speaking with you. I'll review your answers and have your detailed feedback report ready shortly. Best of luck, and we'll be in touch!`,
        false // don't flip to listening state after closing
      ).catch(() => {})
    }

    setEnding(true)

    try {
      await fetch('/api/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch {
      // non-fatal
    }

    // Fire-and-forget — the feedback page shows a loading state and polls every 5s
    fetch('/api/generate-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(console.error)

    router.push(`/interview/feedback/${sessionId}`)
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

  // Explicit "Begin" gesture — required to unlock audio playback and the mic AudioContext
  if (!started) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-3xl font-bold">{persona?.maleName.charAt(0) ?? 'A'}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {persona?.maleName ?? 'Your interviewer'} is ready
          </h1>
          <p className="text-gray-400 text-sm mb-2">
            {sessionData?.session.company} — {sessionData?.session.role}
          </p>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            Pop on your headphones and find a quiet spot. When you click below, {persona?.maleName ?? 'your interviewer'} will
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

        {/* Context card — intro warm-up or interview question */}
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
