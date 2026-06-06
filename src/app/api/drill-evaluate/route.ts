import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!await checkRateLimit(`drill-eval:${user.id}`, 30, 3_600_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const { transcript, question, topic_tag, difficulty } = await request.json() as {
      transcript: string
      question: string
      topic_tag: string
      difficulty: number
    }

    if (!transcript || !question) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const message = await client.messages.create({
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
    try {
      const m = text.text.match(/\{[\s\S]*\}/)
      result = JSON.parse(m ? m[0] : text.text)
    } catch {
      result = { score: 3, one_line: 'Keep practicing!', missing: '' }
    }

    const score = Math.min(5, Math.max(1, result.score ?? 3))

    // Feed drill scores into weak_areas so personalization improves over time
    const normalizedTag = normalizeTopic(topic_tag ?? '')
    if (normalizedTag) {
      const { data: existing } = await supabase
        .from('weak_areas')
        .select('avg_score, session_count')
        .eq('user_id', user.id)
        .eq('topic_tag', normalizedTag)
        .maybeSingle()

      const existingCount = existing?.session_count ?? 0
      const newCount = existingCount + 1
      const newAvg = ((existing?.avg_score ?? 0) * existingCount + score) / newCount
      await supabase.from('weak_areas').upsert(
        {
          user_id: user.id,
          topic_tag: normalizedTag,
          avg_score: Math.round(newAvg * 100) / 100,
          session_count: newCount,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'user_id,topic_tag' },
      )
    }

    return NextResponse.json({
      score,
      one_line: result.one_line ?? '',
      missing: result.missing ?? '',
    })
  } catch (error) {
    console.error('drill-evaluate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
