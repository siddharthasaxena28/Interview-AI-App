import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

// Static instructions in the system block so they're cache-eligible across calls.
const SYSTEM = `You are an expert interview preparation coach.

When given a candidate's context, generate a day-by-day study plan.
Each day should be achievable in 30-45 minutes.

Return ONLY a JSON array (no markdown, no extra text) with this structure:
[
  {
    "day": 1,
    "focus": "System Design",
    "action": "Do a full Technical L2 mock interview focusing on distributed systems",
    "link": "/interview/setup?round_type=tech_l2",
    "why": "Your system_design score is 2.1/5 — this is your biggest gap to close",
    "roundType": "tech_l2"
  }
]

Rules:
- Day 1 must target the weakest topic
- At most 2 mock interviews in the plan (they cost credits); use round types: tech_l1, tech_l2, managerial, hr, or full_loop
- Other days: "Review X concept", "Practice explaining Y aloud", "Do today's free drill" — link to /drill for drill days
- Last day before interview (if known): "Light warm-up — 3-question drill only", link to /drill
- If target role and company are known, reference them in "action" and "why"
- Keep "why" to 1 sentence, "action" to 1 sentence`

interface StudyDay {
  day: number
  focus: string
  action: string
  link: string
  why: string
  roundType: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!await checkRateLimit(`study-plan:${user.id}`, 10, 3_600_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const { interview_date } = await request.json() as { interview_date?: string }

    // Load context
    const [
      { data: weakAreas },
      { data: recentSessions },
      { data: userData },
      { data: latestSession },
    ] = await Promise.all([
      supabase.from('weak_areas').select('topic_tag, avg_score').eq('user_id', user.id).order('avg_score', { ascending: true }).limit(5),
      supabase.from('interview_sessions').select('round_type, ended_at').eq('user_id', user.id).eq('status', 'completed').order('ended_at', { ascending: false }).limit(5),
      supabase.from('users').select('name, current_streak').eq('id', user.id).single(),
      supabase.from('interview_sessions').select('role, company, experience_years, round_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const parsedDate = interview_date ? new Date(interview_date) : null
    const daysUntil = parsedDate && !isNaN(parsedDate.getTime())
      ? Math.max(1, Math.ceil((parsedDate.getTime() - Date.now()) / 86400000))
      : 7
    const planDays = Math.min(daysUntil, 7)

    const weakContext = (weakAreas ?? []).map(w =>
      `- ${w.topic_tag.replace(/_/g, ' ')} (avg score ${(w.avg_score ?? 0).toFixed(1)}/5)`
    ).join('\n') || '- No weak areas identified yet'

    const recentContext = Array.from(new Set((recentSessions ?? []).map(s => s.round_type))).join(', ') || 'none yet'

    const roleContext = latestSession?.role && latestSession?.company
      ? `- Target role: ${latestSession.role} at ${latestSession.company}${latestSession.experience_years ? ` (${latestSession.experience_years} years experience)` : ''}
- Primary round to prepare for: ${latestSession.round_type}`
      : '- Target role: Not specified (general software engineering prep)'

    const prompt = `Create a ${planDays}-day study plan for this candidate.

Candidate context:
${roleContext}
- Weak areas:
${weakContext}
- Recent practice rounds: ${recentContext}
- Current streak: ${userData?.current_streak ?? 0} days
- Days until interview: ${daysUntil}`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0]
    if (text.type !== 'text') throw new Error('Unexpected response')

    let days: StudyDay[]
    try {
      const m = text.text.match(/\[[\s\S]*\]/)
      days = JSON.parse(m ? m[0] : text.text)
      if (!Array.isArray(days) || days.length === 0) throw new Error('Empty plan')
    } catch {
      return NextResponse.json({ error: 'Failed to parse plan' }, { status: 500 })
    }

    return NextResponse.json({
      days,
      generated_at: new Date().toISOString(),
      context: latestSession?.role && latestSession?.company
        ? { role: latestSession.role, company: latestSession.company }
        : undefined,
    })
  } catch (error) {
    console.error('study-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
