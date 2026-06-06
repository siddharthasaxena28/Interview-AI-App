import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an expert technical interviewer with 15 years of hiring experience at top tech companies across India and globally.

Given a job description, company name, role, candidate experience level, round type, and optionally the candidate's résumé, generate exactly 15 interview questions.

Requirements:
- Questions must reference the actual JD skills and technologies
- If a résumé is provided, ground several questions in the candidate's ACTUAL projects, skills and experience — name their specific projects/technologies, just like a real interviewer who has read their CV. Mix these with JD-driven questions.
- Research what the specified company typically asks — reference their known interview culture
- Start at difficulty level 2, escalate to level 4-5 by question 12
- Match the round type persona:
  - tech_l1: Friendly, fundamentals-focused, difficulty 1-3
  - tech_l2: Direct, probing, system design and architecture, difficulty 3-5
  - managerial: Authoritative, STAR method, leadership scenarios, difficulty 3-5
  - hr: Warm, conversational, culture fit, CTC, notice period, difficulty 1-3

TOPIC TAG RULES — you MUST use ONLY the tags from the list for the given round type. Do not invent new tags.

tech_l1 allowed tags:
  fundamentals | data_structures | algorithms | databases | networking
  code_quality | debugging | language_concepts | problem_solving | system_basics

tech_l2 allowed tags:
  system_design | architecture | scalability | distributed_systems | performance
  databases | security | trade_offs | data_modeling | technical_depth

managerial allowed tags:
  leadership | team_management | conflict_resolution | stakeholder_management | decision_making
  project_delivery | mentoring | strategy | ownership | cross_functional

hr allowed tags:
  motivation | culture_fit | career_goals | salary_negotiation | notice_period
  work_style | company_research | role_clarity | strengths_weaknesses | behavioral

full_loop: use tags from all four lists above as appropriate for each question's nature.

- Return ONLY a valid JSON array — no preamble, no markdown, no explanation

Return format:
[
  {
    "text": "Question text here",
    "difficulty": 2,
    "topic_tag": "fundamentals",
    "expected_keywords": ["keyword1", "keyword2"],
    "is_resume_based": false
  }
]

is_resume_based: Set to true ONLY when the question directly references content from the candidate's résumé — their specific projects, companies, technologies, or roles they mentioned. Set to false for all JD-only or general questions.`

// Valid tag sets per round — used server-side to normalise any tag the model invents.
const VALID_TAGS: Record<string, string[]> = {
  tech_l1: ['fundamentals', 'data_structures', 'algorithms', 'databases', 'networking', 'code_quality', 'debugging', 'language_concepts', 'problem_solving', 'system_basics'],
  tech_l2: ['system_design', 'architecture', 'scalability', 'distributed_systems', 'performance', 'databases', 'security', 'trade_offs', 'data_modeling', 'technical_depth'],
  managerial: ['leadership', 'team_management', 'conflict_resolution', 'stakeholder_management', 'decision_making', 'project_delivery', 'mentoring', 'strategy', 'ownership', 'cross_functional'],
  hr: ['motivation', 'culture_fit', 'career_goals', 'salary_negotiation', 'notice_period', 'work_style', 'company_research', 'role_clarity', 'strengths_weaknesses', 'behavioral'],
}
VALID_TAGS.full_loop = [
  ...VALID_TAGS.tech_l1,
  ...VALID_TAGS.tech_l2,
  ...VALID_TAGS.managerial,
  ...VALID_TAGS.hr,
]

function normalizeTag(raw: string, roundType: string): string {
  const allowed = VALID_TAGS[roundType] ?? VALID_TAGS.tech_l1
  const cleaned = raw.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '')
  if (allowed.includes(cleaned)) return cleaned
  // Best-effort partial match: pick the first allowed tag that shares a word root
  const partial = allowed.find((t) => t.includes(cleaned) || cleaned.includes(t))
  if (partial) return partial
  return allowed[0]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { jd_text, company, role, experience_years, round_type, resume_text } = body as {
      jd_text: string
      company: string
      role: string
      experience_years: number
      round_type: RoundType
      resume_text?: string
    }

    if (!jd_text || !company || !role || !round_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Input length caps — server-side guards match client-side validation
    const VALID_ROUND_TYPES = ['tech_l1', 'tech_l2', 'managerial', 'hr', 'full_loop']
    if (!VALID_ROUND_TYPES.includes(round_type)) {
      return NextResponse.json({ error: 'Invalid round_type' }, { status: 400 })
    }
    if (typeof experience_years !== 'number' || isNaN(experience_years) || experience_years < 0 || experience_years > 50) {
      return NextResponse.json({ error: 'Invalid experience_years' }, { status: 400 })
    }
    if (jd_text.length > 6000) {
      return NextResponse.json({ error: 'Job description too long (max 6000 characters)' }, { status: 400 })
    }
    if (company.length > 200) {
      return NextResponse.json({ error: 'Company name too long' }, { status: 400 })
    }
    if (role.length > 200) {
      return NextResponse.json({ error: 'Role too long' }, { status: 400 })
    }

    // Gate the paid generation: a user with no credits can't run the interview anyway,
    // so don't pay for an LLM call they can't use. Also cap creation rate to stop a
    // runaway loop from racking up Claude spend (credits are the real abuse guard).
    const { data: gateUser } = await supabase
      .from('users')
      .select('credit_balance, plan')
      .eq('id', user.id)
      .single()
    if ((gateUser?.credit_balance ?? 0) <= 0) {
      return NextResponse.json({ error: 'No credits available' }, { status: 402 })
    }

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: recentSetups } = await supabase
      .from('interview_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo)
    if ((recentSetups ?? 0) >= 10) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a little while.' },
        { status: 429 }
      )
    }

    // Résumé is optional and used only to personalise question generation (not stored).
    const resume = (resume_text ?? '').trim().slice(0, 6000)

    // Generate questions BEFORE inserting the session row — this prevents orphaned
    // `setup` rows (and wasted rate-limit budget) when the LLM call fails.
    const userMessage = `Company: ${company}
Role: ${role}
Experience: ${experience_years} years
Round Type: ${round_type}

Job Description:
${jd_text}
${resume ? `\nCandidate Résumé:\n${resume}\n` : ''}
Generate 15 interview questions for this ${round_type} round at ${company}.${resume ? ' Ground several questions in the candidate\'s actual résumé projects and experience.' : ''}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    let questions: Array<{
      text: string
      difficulty: number
      topic_tag: string
      expected_keywords?: string[]
      is_resume_based?: boolean
    }>

    try {
      const jsonText = content.text.trim()
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/)
      questions = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText)
    } catch {
      throw new Error('Failed to parse questions from AI response')
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('AI returned no questions')
    }

    // Questions parsed — now safe to create the session row
    const { data: session, error: sessionError } = await supabase
      .from('interview_sessions')
      .insert({
        user_id: user.id,
        company,
        role,
        jd_text,
        experience_years,
        round_type,
        status: 'setup',
      })
      .select()
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    // Save questions to Supabase
    const questionsToInsert = questions.slice(0, 15).map((q, index) => {
      const keywords = Array.isArray(q.expected_keywords) ? q.expected_keywords : []
      // Tag resume-based questions with a special marker stored in expected_keywords.
      // The session UI and feedback UI read this to show "From your résumé" badges.
      if (q.is_resume_based) keywords.push('__resume')
      return {
        session_id: session.id,
        text: q.text,
        round_type,
        difficulty: Math.min(5, Math.max(1, q.difficulty ?? 2)),
        topic_tag: normalizeTag(q.topic_tag ?? '', round_type),
        expected_keywords: keywords,
        order_index: index,
        asked: false,
      }
    })

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsToInsert)

    if (questionsError) {
      // Roll back the session row so we don't leave an orphan
      await supabase.from('interview_sessions').delete().eq('id', session.id)
      throw new Error('Failed to save questions')
    }

    return NextResponse.json({ session_id: session.id, questions: questionsToInsert })
  } catch (error) {
    console.error('generate-questions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
