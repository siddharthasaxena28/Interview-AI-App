import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withAuth, apiError } from '@/lib/api-handler'
import { tracedMessage } from '@/lib/llm-metrics'
import { PERSONA_SPEECH_STYLE } from '@/lib/personas'
import type { RoundType } from '@/types'

const client = new Anthropic()

export const POST = withAuth('answer-candidate-question', async ({ request, user, supabase }) => {
  const { question, session_id, round_type, company, role } = await request.json() as {
    question: string
    session_id: string
    round_type: RoundType
    company: string
    role: string
  }

  if (!question || !session_id) {
    return apiError('Missing required fields', 400)
  }

  const { data: session } = await supabase
    .from('interview_sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return apiError('Session not found', 404)
  }

  const personaStyle = PERSONA_SPEECH_STYLE[round_type] ?? 'Professional and conversational.'

  const message = await tracedMessage('answer-candidate-question', client, {
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
    return apiError('Failed to parse response', 502)
  }

  return NextResponse.json({ answer: result.answer ?? '' })
}, {
  // Candidates ask a handful of questions per interview at most.
  rateLimit: { prefix: 'candidate-q', max: 30, windowMs: 3_600_000 },
})
