import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PERSONAS, getRoundLabel, getRoundDuration } from '@/lib/personas'
import { Mic, Clock, Shield, ArrowLeft, Users } from 'lucide-react'
import type { InterviewSession, Question, RoundType } from '@/types'
import MicCheckGate from './MicCheckGate'

export default async function BriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ gender?: string }>
}) {
  const { sessionId } = await params
  const { gender: genderParam } = await searchParams
  const gender = genderParam === 'female' ? 'female' : 'male'

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: session } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) notFound()

  const { data: questionsData } = await supabase
    .from('questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('order_index')

  const questions = questionsData as Question[]
  const interviewSession = session as InterviewSession
  const persona = PERSONAS[interviewSession.round_type as RoundType]
  const personaName = gender === 'female' ? persona.femaleName : persona.maleName
  const duration = getRoundDuration(interviewSession.round_type as RoundType)
  const roundLabel = getRoundLabel(interviewSession.round_type as RoundType)
  const sessionUrl = `/interview/session/${sessionId}${gender === 'female' ? '?gender=female' : ''}`

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </nav>

      {/* Dark hero */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-6 pt-10 pb-20 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)',backgroundSize:'28px 28px'}} />
        <div className="relative z-10 max-w-2xl mx-auto">
          <span className="inline-flex items-center bg-blue-500/20 text-blue-300 text-xs font-semibold px-3 py-1 rounded-full border border-blue-500/30 mb-4">
            {roundLabel}
          </span>
          <h1 className="text-3xl font-bold text-white mb-1">
            {interviewSession.company} — {interviewSession.role}
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            ~{duration} minutes · {questions?.length ?? 15} questions · Adaptive difficulty
          </p>
        </div>
      </div>

      {/* Main card — overlaps hero */}
      <div className="max-w-lg mx-auto px-4 -mt-10 pb-16 relative">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">

          {/* Interviewer section */}
          <div className="p-7 text-center border-b border-gray-100">
            <div className="relative inline-block mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-blue-200">
                <span className="text-white text-3xl font-bold">{personaName.charAt(0)}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-0.5">Hi, I&apos;m {personaName}</h2>
            <p className="text-gray-500 text-sm mb-4">Your interviewer for today</p>

            {/* Gender toggle */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-xs text-gray-400 flex items-center gap-1"><Users className="w-3 h-3" /> Interviewer voice:</span>
              <Link
                href={`/interview/briefing/${sessionId}`}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  gender === 'male'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {persona.maleName}
              </Link>
              <Link
                href={`/interview/briefing/${sessionId}?gender=female`}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  gender === 'female'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {persona.femaleName}
              </Link>
            </div>

            <p className="text-gray-500 text-sm leading-relaxed text-center max-w-xs mx-auto">{persona.style}</p>
          </div>

          {/* Session details */}
          <div className="p-6 space-y-3">
            {[
              {
                icon: Shield,
                color: 'bg-blue-50 text-blue-600',
                title: `${interviewSession.company} — ${interviewSession.role}`,
                sub: `${interviewSession.experience_years} years experience level`,
              },
              {
                icon: Clock,
                color: 'bg-purple-50 text-purple-600',
                title: `~${duration} minute session`,
                sub: `${questions?.length ?? 15} questions, adaptive difficulty`,
              },
              {
                icon: Mic,
                color: 'bg-green-50 text-green-600',
                title: 'Voice interview — speak your answers',
                sub: 'Allow microphone access when prompted',
              },
            ].map(({ icon: Icon, color, title, sub }) => (
              <div key={title} className="flex items-center gap-3.5 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tip */}
          <div className="px-6 pb-2">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
              <p className="text-xs text-amber-700 leading-relaxed">
                <span className="font-semibold">Tip:</span> Speak clearly and take your time. When you finish answering, pause briefly — the interviewer will respond.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="p-6 pt-4">
            <MicCheckGate sessionUrl={sessionUrl} />
          </div>
        </div>
      </div>
    </div>
  )
}
