import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PERSONAS, getRoundLabel, getRoundDuration } from '@/lib/personas'
import { Mic, Clock, ChevronRight, Shield } from 'lucide-react'
import type { InterviewSession, Question, RoundType } from '@/types'

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

  // Session URL includes gender so the interview page uses the right name/voice
  const sessionUrl = `/interview/session/${sessionId}${gender === 'female' ? '?gender=female' : ''}`

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">InterviewAI</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          {/* Interviewer avatar */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl font-bold">
              {personaName.charAt(0)}
            </span>
          </div>

          <div className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full inline-block mb-3">
            {roundLabel}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Hi, I&apos;m {personaName}
          </h1>
          <p className="text-gray-500 text-sm mb-2">Your interviewer for today</p>

          {/* Gender toggle */}
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="text-xs text-gray-400">Interviewer:</span>
            <Link
              href={`/interview/briefing/${sessionId}`}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                gender === 'male'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {persona.maleName} (M)
            </Link>
            <Link
              href={`/interview/briefing/${sessionId}?gender=female`}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                gender === 'female'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {persona.femaleName} (F)
            </Link>
          </div>

          <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
            {persona.style}
          </p>

          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{interviewSession.company} — {interviewSession.role}</div>
                <div className="text-xs text-gray-500">{interviewSession.experience_years} years experience</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">~{duration} minutes</div>
                <div className="text-xs text-gray-500">{questions?.length ?? 15} questions, adaptive difficulty</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Mic className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Voice interview</div>
                <div className="text-xs text-gray-500">Allow microphone access when prompted</div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-left">
            <p className="text-xs text-amber-700">
              <strong>Tips:</strong> Speak clearly, take your time, and treat this like a real call.
              Pause for a moment when you&apos;ve finished answering and the interviewer will respond.
            </p>
          </div>

          <Link
            href={sessionUrl}
            className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            Start Interview
            <ChevronRight className="w-4 h-4" />
          </Link>

          <Link href="/dashboard" className="block text-sm text-gray-400 hover:text-gray-600 mt-4">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
