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
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Nav */}
      <nav className="bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">InterviewAI</span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </nav>

      {/* Dark hero with indigo radial glow */}
      <div className="relative bg-gradient-to-b from-[#0d0d1a] to-[#0a0a0f] px-6 pt-12 pb-24 text-center overflow-hidden">
        {/* Subtle indigo radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-2xl mx-auto">
          {/* Session info chips */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-5">
            <span className="inline-flex items-center bg-indigo-500/10 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-500/20">
              {roundLabel}
            </span>
            <span className="inline-flex items-center bg-white/[0.05] text-gray-400 text-xs px-3 py-1 rounded-full border border-white/[0.06]">
              {interviewSession.company}
            </span>
            <span className="inline-flex items-center bg-white/[0.05] text-gray-400 text-xs px-3 py-1 rounded-full border border-white/[0.06]">
              ~{duration} min
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {interviewSession.company} — {interviewSession.role}
          </h1>
          <p className="text-gray-500 text-sm">
            {questions?.length ?? 15} questions · Adaptive difficulty
          </p>
        </div>
      </div>

      {/* Main card — overlaps hero */}
      <div className="max-w-lg mx-auto px-4 -mt-12 pb-16 relative">
        <div className="bg-[#111118] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden">

          {/* Interviewer section */}
          <div className="p-7 text-center border-b border-white/[0.06]">
            {/* Avatar with animated pulse ring */}
            <div className="relative inline-flex items-center justify-center mb-4">
              <div className="absolute w-24 h-24 rounded-full bg-indigo-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
              <div className="relative w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-full flex items-center justify-center shadow-lg shadow-indigo-900/40">
                <span className="text-white text-3xl font-bold">{personaName.charAt(0)}</span>
              </div>
              <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-2 border-[#111118] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-0.5">Hi, I&apos;m {personaName}</h2>
            <p className="text-gray-500 text-sm mb-4">Your interviewer for today</p>

            {/* Gender toggle — pill style */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Users className="w-3 h-3" /> Interviewer voice:
              </span>
              <div className="flex items-center bg-white/[0.05] rounded-full p-1 gap-1">
                <Link
                  href={`/interview/briefing/${sessionId}`}
                  className={`text-xs px-3 py-1 rounded-full transition-all ${
                    gender === 'male'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {persona.maleName}
                </Link>
                <Link
                  href={`/interview/briefing/${sessionId}?gender=female`}
                  className={`text-xs px-3 py-1 rounded-full transition-all ${
                    gender === 'female'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {persona.femaleName}
                </Link>
              </div>
            </div>

            <p className="text-gray-500 text-sm leading-relaxed text-center max-w-xs mx-auto">{persona.style}</p>
          </div>

          {/* Session details */}
          <div className="p-6 space-y-2.5">
            {[
              {
                icon: Shield,
                iconBg: 'bg-indigo-500/10',
                iconColor: 'text-indigo-400',
                title: `${interviewSession.company} — ${interviewSession.role}`,
                sub: `${interviewSession.experience_years} years experience level`,
              },
              {
                icon: Clock,
                iconBg: 'bg-violet-500/10',
                iconColor: 'text-violet-400',
                title: `~${duration} minute session`,
                sub: `${questions?.length ?? 15} questions, adaptive difficulty`,
              },
              {
                icon: Mic,
                iconBg: 'bg-green-500/10',
                iconColor: 'text-green-400',
                title: 'Voice interview — speak your answers',
                sub: 'Allow microphone access when prompted',
              },
            ].map(({ icon: Icon, iconBg, iconColor, title, sub }) => (
              <div key={title} className="flex items-center gap-3.5 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tip */}
          <div className="px-6 pb-2">
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3.5">
              <p className="text-xs text-amber-400/80 leading-relaxed">
                <span className="font-semibold text-amber-400">Tip:</span> Speak clearly and take your time. When you finish answering, pause briefly — the interviewer will respond.
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
