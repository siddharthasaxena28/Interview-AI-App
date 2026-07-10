import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withAuth, apiError } from '@/lib/api-handler'
import { tracedMessage } from '@/lib/llm-metrics'
import { normalizeTopic } from '@/lib/utils'

const client = new Anthropic()

const DRILL_SYSTEM = `You are a concise interview coach evaluating a practice drill answer. Score the candidate honestly.

Score 1-5:
1 = Very poor / No understanding
2 = Basic / Incomplete
3 = Adequate / Mostly correct
4 = Good / Well-explained
5 = Excellent / Deep expertise

Return ONLY this JSON:
{
  "score": <1-5>,
  "one_line": "<single sentence: the most important thing the candidate should know about their answer>",
  "missing": "<one key point they missed, or empty string if score >= 4>"
}`

export const POST = withAuth('drill-evaluate', async ({ request, user, supabase }) => {
  const { transcript, question, topic_tag, difficulty } = await request.json() as {
    transcript: string
    question: string
    topic_tag: string
    difficulty: number
  }

  if (!transcript || !question) {
    return apiError('Missing required fields', 400)
  }

  const message = await tracedMessage('drill-evaluate', client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    system: [{ type: 'text', text: DRILL_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Question (topic: ${topic_tag}, difficulty ${difficulty}/5):
"${question}"

Candidate's answer:
"${transcript || '[No answer]'}"`,
    }],
  })

  const text = message.content[0]
  if (text.type !== 'text') throw new Error('Unexpected response')

  let result: { score: number; one_line: string; missing: string }
  let parsedOk = true
  try {
    const m = text.text.match(/\{[\s\S]*\}/)
    result = JSON.parse(m ? m[0] : text.text)
  } catch {
    parsedOk = false
    console.error('drill-evaluate parse error — raw:', text.text.slice(0, 200))
    result = { score: 3, one_line: 'Feedback unavailable — please try again.', missing: '' }
  }

  const score = Math.min(5, Math.max(1, result.score ?? 3))

  // Only update weak_areas when we have a genuine LLM score. A fallback score
  // of 3 from a parse failure must not be written — it would corrupt the rolling
  // average with synthetic data that doesn't reflect the candidate's actual answer.
  if (parsedOk) {
    const normalizedTag = normalizeTopic(topic_tag ?? '')
    if (normalizedTag) {
      const { error: upsertErr } = await supabase.rpc('upsert_weak_area', {
        p_user_id: user.id,
        p_topic_tag: normalizedTag,
        p_session_avg: score,
      })
      if (upsertErr) console.error('drill weak_areas upsert error:', normalizedTag, upsertErr)
    }
  }

  return NextResponse.json({
    score,
    one_line: result.one_line ?? '',
    missing: result.missing ?? '',
  })
}, {
  rateLimit: { prefix: 'drill-eval', max: 30, windowMs: 3_600_000 },
})
