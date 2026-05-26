'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Play, CheckCircle, ChevronRight, Volume2, AlertTriangle } from 'lucide-react'

type Status = 'idle' | 'requesting' | 'recording' | 'playing' | 'done' | 'error'

export default function MicCheckGate({ sessionUrl }: { sessionUrl: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [levels, setLevels] = useState<number[]>(Array(12).fill(4))
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const animRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  function startCheck() {
    setStatus('requesting')
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        streamRef.current = stream

        // Audio level analyser for the waveform display
        const ctx = new AudioContext()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        analyserRef.current = analyser

        chunksRef.current = []
        const mr = new MediaRecorder(stream)
        recorderRef.current = mr
        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        mr.onstop = () => {
          stream.getTracks().forEach(t => t.stop())
          if (animRef.current) cancelAnimationFrame(animRef.current)
          playback()
        }
        mr.start()
        setStatus('recording')

        // Animate bars using frequency data
        const bars = 12
        function tick() {
          const data = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(data)
          // Sample evenly across frequency bins
          const step = Math.floor(data.length / bars)
          setLevels(Array.from({ length: bars }, (_, i) => data[i * step] ?? 0))
          animRef.current = requestAnimationFrame(tick)
        }
        tick()

        // Record for 3 seconds then stop
        setTimeout(() => {
          if (mr.state === 'recording') mr.stop()
        }, 3000)
      })
      .catch(() => setStatus('error'))
  }

  function playback() {
    if (chunksRef.current.length === 0) { setStatus('done'); return }
    setStatus('playing')
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => { URL.revokeObjectURL(url); setStatus('done') }
    audio.onerror = () => { URL.revokeObjectURL(url); setStatus('done') }
    audio.play().catch(() => { URL.revokeObjectURL(url); setStatus('done') })
  }

  function proceed() {
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
          Test your microphone first (3 seconds)
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
        <p className="text-sm font-semibold text-blue-700">Recording… say a few words</p>
        <p className="text-xs text-blue-400 mt-0.5">Stops automatically after 3 seconds</p>
      </div>
    )
  }

  if (status === 'playing') {
    return (
      <div className="border-2 border-green-200 bg-green-50 rounded-xl p-5 text-center">
        <Volume2 className="w-6 h-6 text-green-500 mx-auto mb-2 animate-pulse" />
        <p className="text-sm font-semibold text-green-700">Playing back your audio…</p>
        <p className="text-xs text-gray-400 mt-0.5">Can you hear yourself clearly?</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2 text-green-600 py-2">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">Microphone is working!</span>
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
