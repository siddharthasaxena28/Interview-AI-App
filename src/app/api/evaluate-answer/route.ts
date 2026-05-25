import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Question } from '@/types'

const client = new Anthropic()

const EVAL_SYSTEM_PROMPT = `You are an expert interviewer scoring candidate answers.
Score the answer on a scale of 1-5:
1 = Very poor / No understanding
2 = Basic / Incomplete
3 = Adequate / Mostly correct
4 = Good / Well-explained
5 = Excellent / Demonstrates deep expertise

Return ONLY a JSON object with this exact structure:
{
  "score": <number 1-5>,
  "brief_feedback": "<one sentence feedback>",
  "generate_followup": <true if score ≤ 2, false otherwise>
}`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { transcript, question_id, session_id, start_time } = await request.json() as {
      transcript: string
      question_id: string
      session_id: string
      start_time?: number
    }

    if (!transcript || !question_id || !session_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify session belongs to this user
    const { data: session } = await supabase
      .from('interview_sessions')
      .select('id, round_type')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get the current question
    const { data: question } = await supabase
      .from('questions')
      .select('*')
      .eq('id', question_id)
      .single()

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const q = question as Question
    const durationSeconds = start_time ? Math.round((Date.now() - start_time) / 1000) : 0

    // Score the answer with Claude Haiku
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: EVAL_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Question (difficulty ${q.difficulty}/5, topic: ${q.topic_tag}):
"${q.text}"

Candidate's answer:
"${transcript || '[No answer — candidate was silent]'}"`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let evaluation: { score: number; brief_feedback: string; generate_followup: boolean }
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      evaluation = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
    } catch {
      evaluation = { score: 3, brief_feedback: '', generate_followup: false }
    }

    const score = Math.min(5, Math.max(1, evaluation.score ?? 3))

    // Save answer to Supabase
    await supabase.from('answers').insert({
      session_id,
      question_id,
      transcript_text: transcript,
      duration_seconds: durationSeconds,
      score,
    })

    // Mark question as asked
    await supabase.from('questions').update({ asked: true }).eq('id', question_id)

    // Select next question using adaptive difficulty
    const { data: remainingQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('session_id', session_id)
      .eq('asked', false)
      .order('order_index')

    let nextQuestion: Question | null = null

    if (remainingQuestions && remainingQuestions.length > 0) {
      const remaining = remainingQuestions as Question[]

      if (score >= 4) {
        // Good answer — pick harder question
        const harder = remaining.filter((q) => q.difficulty > question.difficulty)
        nextQuestion = harder.length > 0 ? harder[0] : remaining[0]
      } else if (score <= 2) {
        // Poor answer — pick easier or same difficulty
        const easier = remaining.filter((q) => q.difficulty <= question.difficulty)
        nextQuestion = easier.length > 0 ? easier[0] : remaining[0]
      } else {
        // Average — pick in sequence
        nextQuestion = remaining[0]
      }
    }

    // Generate a follow-up probe question when the candidate struggles
    if (evaluation.generate_followup) {
      try {
        const followUpMsg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 128,
          messages: [{
            role: 'user',
            content: `The candidate struggled to answer this interview question:\n"${q.text}"\n\nTheir answer: "${transcript || '[no answer]'}"\n\nWrite one short follow-up question to probe their basic understanding of the underlying concept. Return only the question text, nothing else.`,
          }],
        })
        const followUpText = followUpMsg.content[0].type === 'text' ? followUpMsg.content[0].text.trim() : null
        if (followUpText) {
          const { data: fq } = await supabase.from('questions').insert({
            session_id,
            text: followUpText,
            topic_tag: q.topic_tag,
            difficulty: Math.max(1, (q.difficulty as number) - 1),
            order_index: 999,
            asked: false,
          }).select().single()
          if (fq) nextQuestion = fq as Question
        }
      } catch {
        // non-fatal — continue without follow-up if generation fails
      }
    }

    return NextResponse.json({
      score,
      brief_feedback: evaluation.brief_feedback,
      next_question: nextQuestion,
      questions_remaining: remainingQuestions?.length ?? 0,
    })
  } catch (error) {
    console.error('evaluate-answer error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
