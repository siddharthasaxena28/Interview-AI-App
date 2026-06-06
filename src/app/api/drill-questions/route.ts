import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getDailyDrillQuestions, type DrillRoundFilter } from '@/lib/drill-questions'
import { checkRateLimit } from '@/lib/rate-limit'
import type { RoundType } from '@/types'

const client = new Anthropic()

const SYSTEM = `You are an interview question generator. Generate exactly 3 interview practice drill questions tailored to the candidate's profile.

Return ONLY a JSON array with exactly 3 objects, no markdown, no extra text:
[
  {
    "text": "<the full question text — specific and realistic, not generic>",
    "roundType": "<tech_l1|tech_l2|managerial|hr>",
    "topicTag": "<snake_case_topic>",
    "difficulty": <1-5>
  }
]

Each question should take 2-3 minutes to answer verbally. Make them feel like real interview questions, not textbook problems.`

export async function POST(request: NextRequest) {
  let filter: DrillRoundFilter = 'mixed'
  const today = new Date().toISOString().split('T')[0]

  try {
    const body = await request.json() as { filter?: DrillRoundFilter }
    filter = body.filter ?? 'mixed'

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!await checkRateLimit(`drill-questions:${user.id}`, 10, 3_600_000)) {
      return NextResponse.json({
        questions: getDailyDrillQuestions(today, filter),
        personalized: false,
      })
    }

    const [{ data: latestSession }, { data: weakAreas }] = await Promise.all([
      supabase
        .from('interview_sessions')
        .select('role, company, experience_years, round_type, jd_text')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('weak_areas')
        .select('topic_tag, avg_score')
        .eq('user_id', user.id)
        .order('avg_score', { ascending: true })
        .limit(3),
    ])

    const role = latestSession?.role ?? null
    const company = latestSession?.company ?? null
    const experienceYears = latestSession?.experience_years ?? null
    // Truncate JD to 800 chars — enough for key skills/technologies without bloating the prompt
    const jdSnippet = latestSession?.jd_text
      ? latestSession.jd_text.trim().slice(0, 800)
      : null

    const roleContext = role && company
      ? `The candidate is preparing for a ${role} role at ${company}${experienceYears ? ` with ${experienceYears} years of experience` : ''}.`
      : 'The candidate is a software professional preparing for tech interviews in India.'

    const jdContext = jdSnippet
      ? `Job Description (key requirements):\n${jdSnippet}`
      : ''

    const weakContext = (weakAreas ?? []).length > 0
      ? `Weak areas to target (lowest scores first): ${(weakAreas ?? []).map(w => w.topic_tag.replace(/_/g, ' ')).join(', ')}.`
      : ''

    const roundInstruction = filter === 'mixed'
      ? 'Spread the 3 questions across different round types (tech_l1, tech_l2, managerial, or hr) based on what is most relevant for the candidate.'
      : `All 3 questions must be for round type: ${filter}. Set roundType to "${filter}" for all.`

    const prompt = `${roleContext}
${jdContext ? jdContext + '\n' : ''}${weakContext}
${roundInstruction}

Generate 3 targeted practice questions grounded in the role and JD above.
If weak areas are listed, at least one question must directly address them.
Questions must feel specific to this role — not generic textbook problems.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content[0]
    if (textBlock.type !== 'text') throw new Error('Unexpected response type')

    let raw: Array<{ text: string; roundType: string; topicTag: string; difficulty: number }>
    try {
      const m = textBlock.text.match(/\[[\s\S]*\]/)
      raw = JSON.parse(m ? m[0] : textBlock.text)
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Empty array')
    } catch {
      return NextResponse.json({
        questions: getDailyDrillQuestions(today, filter),
        personalized: false,
      })
    }

    const questions = raw.slice(0, 3).map((q, i) => ({
      id: 1000 + i,
      text: String(q.text ?? '').trim(),
      roundType: (q.roundType as RoundType) || (filter !== 'mixed' ? filter as RoundType : 'tech_l1'),
      topicTag: String(q.topicTag ?? 'general').trim(),
      difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
    }))

    return NextResponse.json({
      questions,
      personalized: !!(role && company),
      context: role && company ? { role, company } : undefined,
    })
  } catch (error) {
    console.error('drill-questions error:', error)
    return NextResponse.json({
      questions: getDailyDrillQuestions(today, filter),
      personalized: false,
    })
  }
}
