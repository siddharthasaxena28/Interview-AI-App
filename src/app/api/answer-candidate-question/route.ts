import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { PERSONA_SPEECH_STYLE } from '@/lib/personas'
import type { RoundType } from '@/types'

const client = new Anthropic()

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { question, session_id, round_type, company, role } = await request.json() as {
      question: string
      session_id: string
      round_type: RoundType
      company: string
      role: string
    }

    if (!question || !session_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Candidates ask a handful of questions per interview at most.
    if (!await checkRateLimit(`candidate-q:${user.id}`, 30, 3_600_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const { data: session } = await supabase
      .from('interview_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const personaStyle = PERSONA_SPEECH_STYLE[round_type] ?? 'Professional and conversational.'

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are a human interviewer who just finished interviewing a candidate for the ${role} role at ${company}.

Your speech style: ${personaStyle}

The candidate has asked you: "${question.slice(0, 500)}"

Answer their question naturally and genuinely, as a real interviewer would. Be warm, specific, and honest.
- 2–3 sentences maximum
- Sound human — no corporate filler
- If you can't answer something specific (like exact salary ranges), acknowledge it naturally and pivot to what you can share
- Do NOT start with "Great question" or sycophantic openers

Return ONLY a JSON object: { "answer": "<your spoken reply>" }`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let result: { answer: string }
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      result = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
    } catch {
      return NextResponse.json({ error: 'Failed to parse response' }, { status: 502 })
    }

    return NextResponse.json({ answer: result.answer ?? '' })
  } catch (error) {
    console.error('answer-candidate-question error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
