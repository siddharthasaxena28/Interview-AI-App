import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withAuth } from '@/lib/api-handler'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

// Rate limiting and errors are handled inline (not via withAuth opts) because this
// route fails SOFT: it returns a 200 with { should_interrupt: false } instead of
// 429/500 so the interview keeps flowing no matter what goes wrong here.
export const POST = withAuth('mid-answer-check', async ({ request, user, supabase }) => {
  try {
    // Fires during long answers — a full interview triggers at most a few dozen.
    // Failing quietly (no interrupt) keeps the interview flowing.
    if (!await checkRateLimit(`mid-check:${user.id}`, 120, 3_600_000)) {
      return NextResponse.json({ should_interrupt: false })
    }

    const { partial_transcript, question, session_id } = await request.json() as {
      partial_transcript: string
      question: string
      session_id: string
    }

    if (!partial_transcript || !question || !session_id) {
      return NextResponse.json({ should_interrupt: false })
    }

    // Verify session ownership
    const { data: session } = await supabase
      .from('interview_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) return NextResponse.json({ should_interrupt: false })

    const wordCount = partial_transcript.trim().split(/\s+/).filter(Boolean).length

    // Only consider interrupting on longer answers
    if (wordCount < 40) return NextResponse.json({ should_interrupt: false })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: `You are a human interviewer listening to a candidate answer this question:
"${question.slice(0, 200)}"

The candidate has said so far (${wordCount} words):
"${partial_transcript.slice(0, 600)}"

Decide if you should interrupt RIGHT NOW with a brief clarifying question. Only interrupt if:
1. The candidate used a specific technical term without explaining it AND the explanation is central to the answer, OR
2. The answer has gone on for 100+ words and there's a natural checkpoint where a quick "hold on" would sharpen focus

Do NOT interrupt for:
- Normal conversational pacing
- Long answers that are still on-topic and progressing
- Answers that are almost complete
- Simple topics that don't need clarification

If you interrupt, keep it extremely brief (under 10 words): "Hold on — what do you mean by X?" or "Quick clarification — X?"

Return ONLY valid JSON: { "should_interrupt": false } or { "should_interrupt": true, "interruption": "your brief interjection" }`,
      }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return NextResponse.json({ should_interrupt: false })

    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
      if (result.should_interrupt && result.interruption) {
        return NextResponse.json({ should_interrupt: true, interruption: result.interruption })
      }
    } catch { /* fall through */ }

    return NextResponse.json({ should_interrupt: false })
  } catch (error) {
    console.error('mid-answer-check error:', error)
    return NextResponse.json({ should_interrupt: false })
  }
})
