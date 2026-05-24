import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an expert technical interviewer with 15 years of hiring experience at top tech companies across India and globally.

Given a job description, company name, role, candidate experience level, and round type, generate exactly 15 interview questions.

Requirements:
- Questions must reference the actual JD skills and technologies
- Research what the specified company typically asks — reference their known interview culture
- Start at difficulty level 2, escalate to level 4-5 by question 12
- Match the round type persona:
  - tech_l1: Friendly, fundamentals-focused, difficulty 1-3
  - tech_l2: Direct, probing, system design and architecture, difficulty 3-5
  - managerial: Authoritative, STAR method, leadership scenarios, difficulty 3-5
  - hr: Warm, conversational, culture fit, CTC, notice period, difficulty 1-3
- Tag each question with: difficulty (1-5), topic_tag (e.g. "system_design", "leadership", "dsa", "fundamentals"), expected_keywords (array of terms a good answer would include)
- Return ONLY a valid JSON array — no preamble, no markdown, no explanation

Return format:
[
  {
    "text": "Question text here",
    "difficulty": 2,
    "topic_tag": "fundamentals",
    "expected_keywords": ["keyword1", "keyword2"]
  }
]`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { jd_text, company, role, experience_years, round_type } = body as {
      jd_text: string
      company: string
      role: string
      experience_years: number
      round_type: RoundType
    }

    if (!jd_text || !company || !role || !round_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create interview session first
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

    const userMessage = `Company: ${company}
Role: ${role}
Experience: ${experience_years} years
Round Type: ${round_type}

Job Description:
${jd_text}

Generate 15 interview questions for this ${round_type} round at ${company}.`

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

    // Save questions to Supabase
    const questionsToInsert = questions.slice(0, 15).map((q, index) => ({
      session_id: session.id,
      text: q.text,
      round_type,
      difficulty: Math.min(5, Math.max(1, q.difficulty ?? 2)),
      topic_tag: q.topic_tag ?? 'general',
      order_index: index,
      asked: false,
    }))

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsToInsert)

    if (questionsError) {
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
