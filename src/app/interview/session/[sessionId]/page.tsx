'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mic, MicOff, PhoneOff, Volume2, CheckCircle2, SkipForward } from 'lucide-react'
import { useAudioStateMachine } from '@/hooks/useAudioStateMachine'
import { useAnalytics } from '@/hooks/useAnalytics'
import { formatDuration } from '@/lib/utils'
import type { Question, RoundType } from '@/types'
import { PERSONAS } from '@/lib/personas'
import { saveAnswerAudio, clearOldAudio } from '@/lib/audio-storage'

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
  const [deepgramRetry, setDeepgramRetry] = useState(0)
  const [micPermission, setMicPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [loadingSession, setLoadingSession] = useState(true)
  const [phase, setPhase] = useState<'intro' | 'interview'>('intro')
  const [started, setStarted] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [resumeInfo, setResumeInfo] = useState<{ questionIndex: number; currentQuestionId: string } | null>(null)
  const [resumeDismissed, setResumeDismissed] = useState(false)
  const [ttsFallback, setTtsFallback] = useState(false)
  const [evalError, setEvalError] = useState<{ msg: string; retry: () => void } | null>(null)

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
  // Holds a resolve() callback for the currently-playing speakText promise so
  // stopAllAudio() can resolve it immediately from outside the function.
  const cancelSpeakRef = useRef<(() => void) | null>(null)
  // Mirrors `state` in a ref so timeout callbacks can read the current audio state
  // without capturing a stale closure value.
  const audioStateRef = useRef(state)
  // Throttle thinking-time prompts — only one per 30 s so we don't nag the candidate.
  const lastThinkingPromptRef = useRef(0)
  // Answer audio recording (stored locally in IndexedDB, never uploaded)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingQuestionIdRef = useRef<string | null>(null)
  const evalAutoRetriedRef = useRef(false)
  // Waveform visualizer — AnalyserNode taps the mic source in parallel; bars
  // are updated via direct DOM manipulation to avoid 60fps React re-renders.
  const analyserRef = useRef<AnalyserNode | null>(null)
  const waveformRef = useRef<HTMLDivElement | null>(null)
  const waveformRafRef = useRef<number | null>(null)

  // Keep isMountedRef true for the lifetime of this mount. Without this dedicated
  // effect the ref stays false after any remount (StrictMode or client-side
  // re-navigation), silently killing all ws.onmessage / reconnect processing.
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => { currentQuestionRef.current = currentQuestion }, [currentQuestion])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { endingRef.current = ending }, [ending])
  useEffect(() => { audioStateRef.current = state }, [state])

  useEffect(() => {
    if ((state === 'LISTENING' || state === 'USER_SPEAKING') && phase === 'interview') {
      startWaveform()
    } else {
      stopWaveform()
    }
    return stopWaveform
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, phase])

  // Persist progress so the user can resume if they accidentally navigate away
  useEffect(() => {
    if (phase !== 'interview' || !currentQuestion || ending) return
    try {
      localStorage.setItem(`iai_progress_${sessionId}`, JSON.stringify({
        questionIndex,
        currentQuestionId: currentQuestion.id,
        savedAt: Date.now(),
      }))
    } catch { /* storage full — silently skip */ }
  }, [currentQuestion, questionIndex, phase, ending, sessionId])

  // Thinking-time prompt — if the candidate is silent for 9 s after the AI asks a
  // question, the interviewer gently acknowledges it. Mirrors what a real interviewer
  // would do: they don't just stare in silence.
  useEffect(() => {
    if (state !== 'LISTENING' || phase !== 'interview' || ending) return
    const PROMPTS = [
      'Take your time, there\'s no rush.',
      'No hurry at all — whenever you\'re ready.',
      'Feel free to take a moment.',
      'Whenever you\'re ready.',
    ]
    const timer = setTimeout(() => {
      if (
        audioStateRef.current !== 'LISTENING' ||
        endingRef.current ||
        phaseRef.current !== 'interview'
      ) return
      const now = Date.now()
      if (now - lastThinkingPromptRef.current < 30_000) return // max once per 30 s
      lastThinkingPromptRef.current = now
      const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
      speakText(prompt)
    }, 9000)
    return () => clearTimeout(timer)
    // speakText is stable within a render cycle; deps cover all guards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, phase, ending])

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
        // Evict audio from previous sessions so IndexedDB doesn't grow unboundedly
        clearOldAudio(sessionId).catch(() => {})
        // Check for saved progress from a previous incomplete attempt
        try {
          const saved = localStorage.getItem(`iai_progress_${sessionId}`)
          if (saved) {
            const p = JSON.parse(saved) as { questionIndex: number; currentQuestionId: string; savedAt: number }
            const age = Date.now() - p.savedAt
            // Only offer to resume if less than 2 hours old and they made it past Q1
            if (age < 7200000 && p.questionIndex > 0) {
              setResumeInfo({ questionIndex: p.questionIndex, currentQuestionId: p.currentQuestionId })
            }
          }
        } catch { /* ignore */ }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setLoadingSession(false)
      }
    }
    loadSession()

    return () => {
      // Stop the mic if the user navigates away without ending the interview —
      // otherwise the captured stream stays live until garbage collection.
      // isMountedRef is managed by its own dedicated effect above — don't touch it here.
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
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
  // deepgramRetry is incremented to re-trigger this effect after a failed token fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!started || micPermission !== 'granted' || !sessionData) return

    const sd = sessionData

    async function setupDeepgram() {
      try {
        const res = await fetch('/api/deepgram-token')
        const tokenData = await res.json()
        if (!res.ok || !tokenData.key) {
          setError(tokenData.error ?? 'Speech recognition unavailable. Please try again.')
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
          `wss://api.deepgram.com/v1/listen?model=nova-2-general&language=en-IN&punctuate=true&interim_results=true&vad_events=true&endpointing=2000&utterance_end_ms=2000&encoding=linear16&sample_rate=${sampleRate}&channels=1`,
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
                  setProcessing()
                  const fallback = `Good to know! Before we get started, could you give me a brief introduction — your background, your experience, and what drew you to apply for this ${sd.session.role} role at ${sd.session.company}?`
                  ;(async () => {
                    const spoken = await fetchIntroSpoken(1, full, fallback, sd)
                    await speakText(spoken)
                  })()
                } else if (step === 3) {
                  phaseRef.current = 'interview'
                  setPhase('interview')
                  setProcessing()
                  const q = currentQuestionRef.current
                  const fallback = `Thanks for sharing that! Alright, let's get into it`
                  ;(async () => {
                    const spoken = await fetchIntroSpoken(3, full, fallback, sd)
                    await speakText(q ? `${spoken}... ${q.text}` : spoken)
                  })()
                }
              } else {
                evalAutoRetriedRef.current = false
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
      // Null the ref so a later setup doesn't reuse a closed context (which would
      // throw on createMediaStreamSource and silently kill transcription).
      audioContextRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, micPermission, sessionData, deepgramRetry])

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

    // Read-only tap for waveform — parallel connection, cannot affect pipeline
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.85
    source.connect(analyser)
    analyserRef.current = analyser

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

  function startAnswerRecording() {
    const stream = mediaStreamRef.current
    const qId = currentQuestionRef.current?.id
    if (!stream || !qId || phaseRef.current !== 'interview') return
    // Stop any previous recording cleanly
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    recordingQuestionIdRef.current = qId
    recordedChunksRef.current = []
    try {
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      mr.start(500)
      mediaRecorderRef.current = mr
    } catch {
      // MediaRecorder or codec not supported — silently skip recording
    }
  }

  function stopAnswerRecording(questionId: string) {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') return
    mr.onstop = () => {
      if (recordedChunksRef.current.length === 0) return
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
      recordedChunksRef.current = []
      mediaRecorderRef.current = null
      saveAnswerAudio(sessionId, questionId, blob).catch(() => {})
    }
    mr.stop()
  }

  function startWaveform() {
    const container = waveformRef.current
    const analyser = analyserRef.current
    if (!container || !analyser) return
    const bars = container.querySelectorAll<HTMLDivElement>('[data-bar]')
    if (bars.length === 0) return
    const liveAnalyser: AnalyserNode = analyser
    const dataArray = new Uint8Array(liveAnalyser.frequencyBinCount)
    const COUNT = bars.length
    function tick() {
      waveformRafRef.current = requestAnimationFrame(tick)
      liveAnalyser.getByteFrequencyData(dataArray)
      bars.forEach((bar, i) => {
        const v = dataArray[Math.floor(i * dataArray.length / COUNT)] / 255
        bar.style.height = `${Math.max(12, v * 100)}%`
        bar.style.opacity = String(Math.max(0.2, v * 0.85 + 0.15))
      })
    }
    tick()
  }

  function stopWaveform() {
    if (waveformRafRef.current !== null) {
      cancelAnimationFrame(waveformRafRef.current)
      waveformRafRef.current = null
    }
    const container = waveformRef.current
    container?.querySelectorAll<HTMLDivElement>('[data-bar]').forEach(bar => {
      bar.style.height = '12%'
      bar.style.opacity = '0.2'
    })
  }

  // Immediately silences the AI: stops the <audio> element, cancels browser
  // speech synthesis, and resolves the pending speakText promise so callers
  // awaiting it unblock right away.
  function stopAllAudio() {
    cancelSpeakRef.current?.()
    cancelSpeakRef.current = null
    if (audioRef.current) {
      // Clear handlers BEFORE nulling src so setting src='' doesn't trigger onerror,
      // which would fire browser TTS fallback after the interview has already ended.
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  // Generates the interviewer's spoken intro reaction (in persona, reacting to
  // what the candidate actually said). Falls back to a scripted line if the
  // call fails, so the conversation never stalls.
  async function fetchIntroSpoken(step: 1 | 3, transcript: string, fallback: string, sd: SessionData): Promise<string> {
    try {
      const res = await fetch('/api/interview-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          transcript,
          round_type: sd.session.round_type,
          role: sd.session.role,
          company: sd.session.company,
        }),
      })
      if (!res.ok) return fallback
      const data = await res.json()
      return data.spoken && data.spoken.trim() ? data.spoken.trim() : fallback
    } catch {
      return fallback
    }
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

    let ttsSucceeded = false

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          round_type: sessionData.session.round_type,
          gender: genderParam,
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'unknown' })) as { detail?: string; error?: string }
        throw new Error(`TTS ${res.status}: ${errBody.detail ?? errBody.error ?? 'unknown error'}`)
      }

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      const estDurationMs = Math.max(5000, text.length * 65)
      await new Promise<void>((resolve, reject) => {
        if (!audioRef.current) {
          URL.revokeObjectURL(audioUrl)
          reject(new Error('audio element not mounted'))
          return
        }
        let done = false
        // finish: normal end (audio ended or timed out) — resolves
        const finish = () => { if (!done) { done = true; URL.revokeObjectURL(audioUrl); resolve() } }
        // fail: audio error or play() blocked — rejects so browser speech triggers
        const fail = (err?: unknown) => {
          if (!done) {
            done = true
            URL.revokeObjectURL(audioUrl)
            reject(err instanceof Error ? err : new Error('audio playback failed'))
          }
        }
        // cancelSpeakRef lets stopAllAudio() resolve this immediately (not reject)
        cancelSpeakRef.current = finish
        audioRef.current.src = audioUrl
        audioRef.current.onended = finish
        audioRef.current.onerror = fail  // audio decode/load error → browser speech
        audioRef.current.play().catch(fail)  // autoplay block → browser speech
        setTimeout(finish, estDurationMs + 3000)  // timeout resolves, not fails
      })
      cancelSpeakRef.current = null
      ttsSucceeded = true
    } catch (err) {
      cancelSpeakRef.current = null
      console.error('[speakText] ElevenLabs TTS failed — using browser speech:', err)
      // Browser speech as absolute last resort so the interview never goes silent
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        setTtsFallback(true)
        // Wait for voices to load (Chrome loads them asynchronously; speak() silently
        // does nothing if called before getVoices() returns a non-empty list)
        if (window.speechSynthesis.getVoices().length === 0) {
          await new Promise<void>((r) => {
            window.speechSynthesis.addEventListener('voiceschanged', () => r(), { once: true })
            setTimeout(r, 1500)
          })
        }
        await new Promise<void>((resolve) => {
          const utter = new SpeechSynthesisUtterance(text)
          utter.rate = 0.95
          utter.onend = () => resolve()
          utter.onerror = () => resolve()
          window.speechSynthesis.speak(utter)
          cancelSpeakRef.current = () => { window.speechSynthesis.cancel(); resolve() }
          setTimeout(resolve, text.length * 80 + 5000)
        })
        cancelSpeakRef.current = null
        ttsSucceeded = true
      }
    }

    clearInterval(keepAliveInterval)
    // Don't transition to LISTENING if the interview has already ended.
    if (endingRef.current) return
    systemMutedRef.current = false
    isProcessingRef.current = false
    if (startListening) {
      setListening()
      answerStartRef.current = Date.now()
      startAnswerRecording()
    }
  }

  const handleAnswerComplete = useCallback(async (transcript: string) => {
    if (!currentQuestion || !sessionData) return
    setEvalError(null)
    setProcessing()
    setFinalTranscript('')
    stopAnswerRecording(currentQuestion.id)

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
      if (!res.ok) throw new Error(data.error ?? 'Evaluation failed')

      if (data.next_question && data.questions_remaining > 0) {
        setCurrentQuestion(data.next_question)
        // A probe stays on the same logical question — don't advance the counter.
        if (!data.is_probe) setQuestionIndex((i) => i + 1)

        const spoken: string = data.spoken_response ?? ''
        let ackText: string

        if (data.is_probe) {
          // Interviewer pushing back — spoken_response leads directly into the probe.
          // No "..." pause: the probe is a tight follow-up, not a new question.
          ackText = spoken
            ? `${spoken} ${data.next_question.text}`
            : data.next_question.text
        } else {
          // Normal next question or skip: spoken_response reacts to this answer,
          // then "..." creates a natural breath before the next question begins.
          ackText = spoken
            ? `${spoken}... ${data.next_question.text}`
            : data.next_question.text
        }

        await speakText(ackText)
      } else {
        await endInterview()
      }
    } catch {
      if (!evalAutoRetriedRef.current) {
        // First failure: retry silently after a brief pause.
        evalAutoRetriedRef.current = true
        setTimeout(() => handleAnswerCompleteRef.current(transcript), 1500)
      } else {
        // Second failure: show a non-fatal in-interview banner with a manual retry button.
        // This keeps the session alive — no hard refresh required.
        isProcessingRef.current = false
        setListening()
        setEvalError({
          msg: 'Could not submit your answer. Check your connection and try again.',
          retry: () => {
            setEvalError(null)
            evalAutoRetriedRef.current = false
            handleAnswerCompleteRef.current(transcript)
          },
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, sessionData, sessionId])

  useEffect(() => { handleAnswerCompleteRef.current = handleAnswerComplete }, [handleAnswerComplete])

  async function handleSkip() {
    if (isProcessingRef.current || !currentQuestion || !sessionData || ending) return
    if (phase !== 'interview') return
    isProcessingRef.current = true
    setEvalError(null)
    setProcessing()
    finalTranscriptRef.current = ''
    liveTranscriptRef.current = ''
    setFinalTranscript('')
    setLiveTranscript('')
    evalAutoRetriedRef.current = false
    stopAnswerRecording(currentQuestion.id)

    const nextIndex = questionIndex + 1
    try {
      if (nextIndex < sessionData.questions.length) {
        const nextQ = sessionData.questions[nextIndex]
        setCurrentQuestion(nextQ)
        setQuestionIndex(nextIndex)
        await speakText(`No worries, let's move on. ${nextQ.text}`)
      } else {
        await endInterview()
      }
    } catch {
      isProcessingRef.current = false
      setListening()
    }
  }

  function handleResume() {
    if (!resumeInfo || !sessionData) return
    // Find the saved question in the loaded question list
    const savedQ = sessionData.questions.find(q => q.id === resumeInfo.currentQuestionId)
    if (savedQ) {
      setCurrentQuestion(savedQ)
      setQuestionIndex(resumeInfo.questionIndex)
      // Mark that we've already greeted so the intro is skipped
      hasGreetedRef.current = true
      phaseRef.current = 'interview'
      setPhase('interview')
    }
    setResumeInfo(null)
    localStorage.removeItem(`iai_progress_${sessionId}`)
  }

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

  function endInterview(abandoned = false) {
    // Guard against double-calls (e.g. auto-end races with manual click).
    if (endingRef.current) return
    endingRef.current = true
    // Clear saved progress — the interview is over
    try { localStorage.removeItem(`iai_progress_${sessionId}`) } catch { /* ignore */ }

    // Step 1 — silence the AI immediately, regardless of what it's saying.
    stopAllAudio()
    systemMutedRef.current = false
    isProcessingRef.current = false

    // Step 2 — show the "generating report" screen right away so the user
    //           gets instant feedback that the call has ended.
    setEnding(true)

    // Step 3 — tear down mic / WebSocket.
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    wsRef.current?.close(1000)
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())

    // Step 4 — analytics + fire-and-forget API calls (non-blocking).
    analytics.capture(abandoned ? 'interview_abandoned' : 'interview_completed', {
      session_id: sessionId,
      round_type: sessionData?.session.round_type,
      questions_answered: questionIndex,
      total_questions: totalQuestions,
      duration_seconds: elapsed,
    })

    fetch('/api/end-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})

    // charge: true — credit is only deducted when the user ends the call or
    // all questions are answered. Browser crashes / network drops never reach here.
    fetch('/api/generate-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, charge: true }),
    }).catch(console.error)

    // Step 5 — navigate to the feedback page.
    router.push(`/interview/feedback/${sessionId}`)
  }

  const persona = sessionData ? PERSONAS[sessionData.session.round_type] : null
  const personaName = persona
    ? (genderParam === 'female' ? persona.femaleName : persona.maleName)
    : 'AI Interviewer'

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-8 h-8 border-2 border-white/10 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading your interview...</p>
        </div>
      </div>
    )
  }

  if (error) {
    const noCredits = error.toLowerCase().includes('credit')
    const isSpeechError = error.toLowerCase().includes('speech') || error.toLowerCase().includes('recognition')
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-400 mb-4 text-sm leading-relaxed">{error}</p>
          {noCredits && (
            <p className="text-gray-400 text-sm mb-4">
              You need credits to start an interview. Pick up a plan on the pricing page.
            </p>
          )}
          <div className="flex gap-3 justify-center">
            {noCredits && (
              <button
                onClick={() => router.push('/pricing')}
                className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-medium text-sm hover:bg-indigo-500 transition-colors"
              >
                View Pricing
              </button>
            )}
            {isSpeechError && (
              <button
                onClick={() => { setError(''); setDeepgramRetry(n => n + 1) }}
                className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-medium text-sm hover:bg-indigo-500 transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-white/[0.06] text-gray-300 border border-white/[0.08] px-5 py-2 rounded-xl font-medium text-sm hover:bg-white/[0.10] transition-colors"
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
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 max-w-md text-center">
          <MicOff className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-2">Microphone Access Required</h2>
          <p className="text-amber-400 text-sm mb-4">
            Please allow microphone access in your browser settings and refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-6 py-2 rounded-xl font-medium text-sm hover:bg-amber-500/20 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  if (ending) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{animationDuration:'2s'}} />
            <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/20">
              <Volume2 className="w-9 h-9 text-white" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Interview Complete!</h2>
          <p className="text-gray-400 text-sm mb-5">Generating your feedback report...</p>
          <div className="w-6 h-6 border-2 border-white/10 border-t-indigo-500 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-md w-full">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-ping" style={{animationDuration:'3s'}} />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/20">
              <span className="text-white text-2xl sm:text-3xl font-bold">{personaName.charAt(0)}</span>
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            {personaName} is ready
          </h1>
          <p className="text-indigo-400 text-sm mb-2 font-medium">
            {sessionData?.session.company} — {sessionData?.session.role}
          </p>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed px-2">
            Pop on your headphones and find a quiet spot. When you click below, {personaName} will
            greet you and the conversation will begin.
          </p>
          {/* Resume from previous session */}
          {resumeInfo && !resumeDismissed && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-5 text-left max-w-md w-full">
              <p className="text-amber-400 text-sm font-medium mb-1.5">
                You were on Question {resumeInfo.questionIndex + 1} when you left.
              </p>
              <p className="text-amber-500 text-xs mb-3">Resume from where you left off, or start fresh from Q1.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { handleResume(); handleBegin() }}
                  className="flex-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 py-2 rounded-xl text-sm font-semibold hover:bg-amber-500/20 transition-colors"
                >
                  Resume from Q{resumeInfo.questionIndex + 1}
                </button>
                <button
                  onClick={() => { setResumeDismissed(true); localStorage.removeItem(`iai_progress_${sessionId}`) }}
                  className="flex-1 bg-white/[0.06] text-gray-400 border border-white/[0.08] py-2 rounded-xl text-sm hover:bg-white/[0.10] transition-colors"
                >
                  Start from Q1
                </button>
              </div>
            </div>
          )}
          <button
            onClick={handleBegin}
            disabled={micPermission !== 'granted'}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3.5 rounded-2xl font-semibold text-sm hover:bg-indigo-500 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto shadow-lg shadow-indigo-500/20"
          >
            {micPermission === 'granted' ? (
              <>
                <Mic className="w-4 h-4" /> Begin Interview
              </>
            ) : (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
    IDLE: 'bg-gray-600',
    AI_SPEAKING: 'bg-indigo-500',
    LISTENING: 'bg-emerald-500',
    USER_SPEAKING: 'bg-emerald-400',
    PROCESSING: 'bg-amber-500',
  }

  // Time limit warning (show at 25 min for 30-min sessions, 50 min for full_loop)
  const sessionLimit = sessionData?.session.round_type === 'full_loop' ? 3600 : 1800
  const timeWarning = elapsed >= sessionLimit - 300 && elapsed < sessionLimit

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-[#0f0f1a]/90 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
            <span className="font-bold text-xs sm:text-sm">{personaName.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate text-white">{personaName}</div>
            <div className="text-xs text-gray-400 truncate">
              {sessionData?.session.company} — {sessionData?.session.role}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {reconnecting && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Reconnecting…</span>
            </div>
          )}
          {ttsFallback && (
            <div className="flex items-center gap-1 text-xs text-amber-400" title="ElevenLabs TTS unavailable — using browser voice">
              <span>⚠</span>
              <span className="hidden sm:inline">Browser voice (TTS error)</span>
            </div>
          )}
          <div className={`text-xs sm:text-sm font-mono tabular-nums ${timeWarning ? 'text-amber-400' : 'text-gray-400'}`}>
            {formatDuration(elapsed)}
            {timeWarning && <span className="ml-1 text-xs hidden sm:inline">⚠ wrapping up</span>}
          </div>
          {phase === 'interview' ? (
            <div className="text-xs sm:text-sm text-gray-400 tabular-nums bg-white/[0.06] px-2.5 py-1 rounded-full">
              Q{questionIndex + 1}/{totalQuestions}
            </div>
          ) : (
            <div className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full font-medium">
              Intro
            </div>
          )}
        </div>
      </div>

      {/* Non-fatal answer evaluation error banner */}
      {evalError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-center gap-3">
          <span className="text-red-400 text-xs">{evalError.msg}</span>
          <button
            onClick={evalError.retry}
            className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 sm:px-6 py-5 sm:py-8 gap-6 sm:gap-10 overflow-y-auto">
        {/* Status indicator */}
        <div className="flex items-center gap-2 sm:gap-3 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-2">
          <div className={`w-2 h-2 rounded-full ${stateColor[state]} ${state !== 'IDLE' ? 'animate-pulse' : ''}`} />
          <span className="text-gray-300 text-xs sm:text-sm font-medium">{stateLabel[state]}</span>
        </div>

        {/* AI speaking animation */}
        {state === 'AI_SPEAKING' && (
          <div className="relative flex items-center justify-center">
            <div className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-indigo-500/10 animate-ping" style={{animationDuration:'2s'}} />
            <div className="absolute w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-indigo-500/15 animate-ping" style={{animationDuration:'1.5s',animationDelay:'0.3s'}} />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/30">
              <Volume2 className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
          </div>
        )}

        {/* Mic animation */}
        {(state === 'LISTENING' || state === 'USER_SPEAKING') && (
          <div className="relative flex items-center justify-center">
            {state === 'USER_SPEAKING' && !muted && (
              <>
                <div className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-emerald-500/10 animate-ping" style={{animationDuration:'1.8s'}} />
                <div className="absolute w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-emerald-500/15 animate-ping" style={{animationDuration:'1.3s',animationDelay:'0.2s'}} />
              </>
            )}
            <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              state === 'USER_SPEAKING'
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-2xl shadow-emerald-500/30'
                : 'bg-white/[0.06] border border-white/[0.10]'
            }`}>
              {muted ? (
                <MicOff className="w-8 h-8 sm:w-10 sm:h-10 text-gray-500" />
              ) : (
                <Mic className={`w-8 h-8 sm:w-10 sm:h-10 ${state === 'USER_SPEAKING' ? 'text-white' : 'text-gray-400'}`} />
              )}
            </div>
          </div>
        )}

        {/* Processing */}
        {state === 'PROCESSING' && (
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center">
            <div className="w-7 h-7 sm:w-8 sm:h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}

        {/* Context card */}
        {phase === 'intro' ? (
          <div className="bg-[#111118] border border-white/[0.06] rounded-2xl p-4 sm:p-6 max-w-2xl w-full text-center">
            <div className="text-xs text-indigo-400 mb-3 uppercase tracking-widest font-medium">
              Introductory Conversation
            </div>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              {state === 'LISTENING' || state === 'USER_SPEAKING'
                ? introStepRef.current === 1
                  ? 'How are you feeling today?'
                  : 'Tell me about yourself and your background.'
                : 'Getting to know you before the interview begins...'}
            </p>
          </div>
        ) : currentQuestion ? (
          <div className="bg-[#111118] border border-white/[0.06] rounded-2xl p-4 sm:p-6 max-w-2xl w-full text-center">
            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-widest capitalize">
                Q{questionIndex + 1} · {currentQuestion.topic_tag.replace(/_/g, ' ')} · Difficulty {currentQuestion.difficulty}/5
              </span>
              {currentQuestion.expected_keywords?.includes('__resume') && (
                <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full normal-case tracking-normal">
                  From your résumé
                </span>
              )}
            </div>
            <p className="text-white text-sm sm:text-base lg:text-lg leading-relaxed font-medium">{currentQuestion.text}</p>
          </div>
        ) : null}

        {/* Waveform visualizer */}
        {(state === 'LISTENING' || state === 'USER_SPEAKING') && phase === 'interview' && (
          <div ref={waveformRef} className="flex items-end gap-[2px] h-10 max-w-xs w-full">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                data-bar
                className="flex-1 rounded-sm bg-indigo-400"
                style={{ height: '12%', opacity: 0.2 }}
              />
            ))}
          </div>
        )}

        {/* Live transcript */}
        {(liveTranscript || finalTranscript) && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 sm:p-4 max-w-2xl w-full max-h-28 sm:max-h-none overflow-y-auto">
            <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Live transcript</div>
            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
              {finalTranscript}
              <span className="text-gray-500">{liveTranscript}</span>
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-white/[0.06] flex items-center justify-center gap-2 sm:gap-4">
        <button
          onClick={() => setMuted((m) => { mutedRef.current = !m; return !m })}
          className={`flex flex-col items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl transition-all duration-200 ${
            muted
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
              : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.10] border border-white/[0.08] hover:text-gray-200'
          }`}
        >
          {muted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
          <span className="text-[10px] sm:text-xs font-medium">{muted ? 'Unmute' : 'Mute'}</span>
        </button>

        {/* Manual submit — lets users trigger answer submission without waiting for
            Deepgram's VAD silence detection. Critical for accents and trailing-off speech. */}
        {(state === 'LISTENING' || state === 'USER_SPEAKING') && phase === 'interview' && (
          <button
            onClick={() => {
              if (isProcessingRef.current) return
              const full = (finalTranscriptRef.current + ' ' + liveTranscriptRef.current).trim()
              isProcessingRef.current = true
              finalTranscriptRef.current = ''
              liveTranscriptRef.current = ''
              setFinalTranscript('')
              setLiveTranscript('')
              evalAutoRetriedRef.current = false
              handleAnswerCompleteRef.current(full || '[No answer provided]')
            }}
            className="flex flex-col items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all duration-200 hover:border-emerald-500/40"
          >
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[10px] sm:text-xs font-medium">Done</span>
          </button>
        )}

        {(state === 'LISTENING' || state === 'USER_SPEAKING') && phase === 'interview' && (
          <button
            onClick={handleSkip}
            className="flex flex-col items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-white/[0.06] text-gray-400 hover:bg-white/[0.10] border border-white/[0.08] hover:text-gray-200 transition-all duration-200"
          >
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[10px] sm:text-xs font-medium">Skip</span>
          </button>
        )}

        <button
          onClick={() => endInterview(true)}
          className="flex flex-col items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all duration-200 hover:border-red-500/40"
        >
          <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-[10px] sm:text-xs font-medium">End Interview</span>
        </button>
      </div>
    </div>
  )
}

export default function SessionPage({ params }: SessionPageProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    }>
      <SessionPageInner params={params} />
    </Suspense>
  )
}