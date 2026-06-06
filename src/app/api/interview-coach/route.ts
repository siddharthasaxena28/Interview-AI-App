import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

// Static coaching instructions — cached so follow-up messages don't re-pay
// full input tokens for the instruction block on every turn.
const COACH_INSTRUCTIONS = `You are a warm, encouraging interview coach reviewing a candidate's mock interview.

Your role:
- Answer the candidate's questions about their performance honestly but kindly
- Explain WHY they scored what they did on specific questions
- Give concrete, actionable improvement tips
- If asked how they should have answered a question, provide a model answer
- Keep responses concise (3-5 sentences max unless explaining an ideal answer)
- Never be harsh — frame everything as coaching, not criticism`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!await checkRateLimit(`coach:${user.id}`, 50, 3_600_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const { session_id, message, history } = await request.json() as {
      session_id: string
      message: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    if (!session_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: 'Message too long (max 1000 characters)' }, { status: 400 })
    }

    // Sanitize history — reject any item with an invalid role to prevent prompt injection
    const safeHistory = (Array.isArray(history) ? history : [])
      .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
        (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
      )
      .slice(-6)

    // Load session context — verify ownership
    const [
      { data: session },
      { data: questions },
      { data: answers },
      { data: report },
    ] = await Promise.all([
      supabase.from('interview_sessions').select('company, role, round_type').eq('id', session_id).eq('user_id', user.id).single(),
      supabase.from('questions').select('id, text, topic_tag, difficulty').eq('session_id', session_id).eq('asked', true).order('order_index').limit(15),
      supabase.from('answers').select('question_id, transcript_text, score').eq('session_id', session_id),
      supabase.from('feedback_reports').select('overall_score, selection_probability, report_text').eq('session_id', session_id).maybeSingle(),
    ])

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const answerMap = new Map((answers ?? []).map(a => [a.question_id, a]))

    // Build interview transcript for context
    const transcript = (questions ?? []).map((q, i) => {
      const a = answerMap.get(q.id)
      return `Q${i + 1} [${q.topic_tag}, diff ${q.difficulty}/5]: ${q.text}\nAnswer: ${a?.transcript_text || '[no answer]'}\nScore: ${a?.score ?? '?'}/5`
    }).join('\n\n')

    // Session-specific context goes in the user turn so the static system block
    // is cache-eligible across all coach conversations.
    const contextBlock = `Interview context:
- Company: ${session.company}
- Role: ${session.role}
- Overall Score: ${report?.overall_score ?? '?'}/100
- Selection Probability: ${report?.selection_probability ?? '?'}%

Summary feedback:
${report?.report_text ?? 'No summary available.'}

Full interview transcript:
${transcript}`

    // Build messages — inject context as the first user message so it benefits
    // from prompt caching on follow-up turns.
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: contextBlock },
      { role: 'assistant', content: 'Got it — I\'ve reviewed the interview. What would you like to explore?' },
      ...safeHistory,
      { role: 'user', content: message },
    ]

    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: [{ type: 'text', text: COACH_INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
      messages,
    })

    // Return as SSE stream
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (err) {
          console.error('interview-coach stream error:', err)
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('interview-coach error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
