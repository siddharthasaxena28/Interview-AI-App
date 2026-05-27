'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Play, CheckCircle, ChevronRight, Volume2, AlertTriangle, MicOff } from 'lucide-react'

type Status = 'idle' | 'requesting' | 'recording' | 'playing' | 'done' | 'silent' | 'error'

const RECORD_SECONDS = 3
// Frequency-bin amplitude (0-255) above which we treat input as real speech, not ambient noise.
const SOUND_THRESHOLD = 18

export default function MicCheckGate({ sessionUrl }: { sessionUrl: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [levels, setLevels] = useState<number[]>(Array(12).fill(4))
  const [countdown, setCountdown] = useState(RECORD_SECONDS)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const animRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const peakRef = useRef(0)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null)

  function cleanup() {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause()
      playbackAudioRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => cleanup, [])

  async function startCheck() {
    setStatus('requesting')
    peakRef.current = 0
    setCountdown(RECORD_SECONDS)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch {
      setStatus('error')
      return
    }
    streamRef.current = stream

    // Audio level analyser for the waveform display + sound detection
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    analyserRef.current = analyser

    chunksRef.current = []
    // Pick a mime type the browser actually supports so playback isn't silent.
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || ''
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recorderRef.current = mr
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
      }
      audioCtxRef.current = null
      // Verdict is based on whether the mic actually picked up sound — not on
      // mere completion. A muted/dead mic stays near zero and must NOT pass.
      if (peakRef.current < SOUND_THRESHOLD) {
        setStatus('silent')
      } else {
        playback()
      }
    }
    mr.start()
    setStatus('recording')

    // Visible countdown so the user knows it's actively listening, not stuck.
    countdownTimerRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1))
    }, 1000)

    // Animate bars + track the loudest input we see.
    const bars = 12
    function tick() {
      const a = analyserRef.current
      if (!a) return
      const data = new Uint8Array(a.frequencyBinCount)
      a.getByteFrequencyData(data)
      const step = Math.floor(data.length / bars)
      const sampled = Array.from({ length: bars }, (_, i) => data[i * step] ?? 0)
      const frameMax = Math.max(...sampled)
      if (frameMax > peakRef.current) peakRef.current = frameMax
      setLevels(sampled)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    // Record for a fixed window then stop.
    setTimeout(() => {
      if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }
      if (mr.state === 'recording') mr.stop()
    }, RECORD_SECONDS * 1000)
  }

  function playback() {
    if (chunksRef.current.length === 0) { setStatus('done'); return }
    setStatus('playing')
    const type = recorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    playbackAudioRef.current = audio
    const finish = () => { URL.revokeObjectURL(url); playbackAudioRef.current = null; setStatus('done') }
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
  }

  function proceed() {
    cleanup()
    router.push(sessionUrl)
  }

  if (status === 'idle') {
    return (
      <div className="space-y-3">
        <button
          onClick={startCheck}
          className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-blue-300 text-blue-600 py-3 rounded-xl font-medium text-sm hover:bg-blue-50 transition-colors"
        >
          <Mic className="w-4 h-4" />
          Test your microphone first ({RECORD_SECONDS} seconds)
        </button>
        <button
          onClick={proceed}
          className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
        >
          Start Interview
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  if (status === 'requesting') {
    return (
      <div className="w-full bg-gray-100 py-5 rounded-xl text-center text-sm text-gray-500">
        Requesting microphone access…
      </div>
    )
  }

  if (status === 'recording') {
    return (
      <div className="border-2 border-blue-300 bg-blue-50 rounded-xl p-5 text-center">
        <div className="flex items-end justify-center gap-1 mb-3 h-10">
          {levels.map((l, i) => (
            <div
              key={i}
              className="w-1.5 bg-blue-500 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(4, (l / 255) * 40)}px` }}
            />
          ))}
        </div>
        <p className="text-sm font-semibold text-blue-700">Speak now — say a few words ({countdown}s)</p>
        <p className="text-xs text-blue-400 mt-0.5">We&apos;re listening to check your mic picks up sound</p>
      </div>
    )
  }

  if (status === 'playing') {
    return (
      <div className="border-2 border-green-200 bg-green-50 rounded-xl p-5 text-center">
        <Volume2 className="w-6 h-6 text-green-500 mx-auto mb-2 animate-pulse" />
        <p className="text-sm font-semibold text-green-700">Playing back your recording…</p>
        <p className="text-xs text-gray-400 mt-0.5">Can you hear yourself clearly?</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2 text-green-600 py-2">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">Mic works — we heard you clearly!</span>
        </div>
        <button
          onClick={proceed}
          className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
        >
          Start Interview
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={startCheck} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
          Test again
        </button>
      </div>
    )
  }

  if (status === 'silent') {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <MicOff className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-amber-700">We didn&apos;t pick up any sound</p>
          <p className="text-xs text-amber-500 mt-1">
            Check that the right mic is selected and isn&apos;t muted, then try again. Speak a little louder.
          </p>
        </div>
        <button
          onClick={startCheck}
          className="flex items-center justify-center gap-2 w-full border border-gray-200 text-gray-700 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors"
        >
          <Play className="w-4 h-4" /> Test again
        </button>
        <button
          onClick={proceed}
          className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
        >
          Skip and start anyway
        </button>
      </div>
    )
  }

  // error
  return (
    <div className="space-y-3">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
        <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1.5" />
        <p className="text-sm font-semibold text-red-700">Microphone access denied</p>
        <p className="text-xs text-red-400 mt-0.5">
          Open browser settings → Site permissions → Microphone → Allow
        </p>
      </div>
      <button
        onClick={startCheck}
        className="flex items-center justify-center gap-2 w-full border border-gray-200 text-gray-700 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors"
      >
        <Play className="w-4 h-4" /> Try again
      </button>
      <button
        onClick={proceed}
        className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
      >
        Start anyway
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
