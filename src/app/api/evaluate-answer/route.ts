import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Question } from '@/types'

const client = new Anthropic()

const EVAL_SYSTEM_PROMPT = `You are a sharp, fair human interviewer conducting a live voice interview. You are scoring the candidate's most recent answer and deciding how to react in the moment, the way a real interviewer would.

Score the answer on a scale of 1-5:
1 = Very poor / No understanding
2 = Basic / Incomplete
3 = Adequate / Mostly correct
4 = Good / Well-explained
5 = Excellent / Demonstrates deep expertise

--- SKIP DETECTION (check this FIRST) ---
Set "candidate_wants_to_skip": true whenever the candidate signals — explicitly or implicitly — that they want to move on:

Explicit signals (any of these phrases or close variants):
  "pass", "skip", "next question", "move on", "can we move on", "let's move on",
  "I'd like to skip", "I want to skip", "I don't know", "I have no idea",
  "I'm not sure about this one", "I'll pass on this"

Implicit signals (read tone and content, not just keywords):
  - Answer is 1-3 words with no substance (e.g. "hmm", "not sure", "uh", "yeah")
  - Candidate explicitly expresses discomfort or unwillingness ("I'd rather not", "I'm blanking")
  - Candidate has already given a weak or incomplete answer AND is now asking to move forward
  - Candidate trails off with no attempt at the question

When candidate_wants_to_skip is true:
  - ALWAYS set "probe": false and "probe_question": ""
  - Score the answer honestly but lean towards 2 if there was no real attempt
  - "brief_feedback" must be gracious and non-pressuring — acknowledge and let go.
    Examples: "No worries at all, let's move on." / "That's fine, we'll come back to it if needed." / "Sure, let's skip that one."

--- PROBING (only when candidate has NOT signalled skip) ---
A real interviewer probes when:
- the answer is vague, hand-wavy, or uses buzzwords without substance
- the candidate gave a correct but shallow answer and there is an obvious deeper follow-up
- the answer is incomplete or the candidate clearly guessed
Do NOT probe when the answer was thorough and confident (score 4-5 with specifics).
Do NOT probe more than once on the same topic — if this is already a probe follow-up, do not probe again.

"brief_feedback" must sound like a real interviewer speaking out loud — natural, warm but honest, ONE short sentence. Never robotic. Examples: "Okay, that gives me a rough idea." / "Good — I like that you mentioned trade-offs." / "Hmm, let's dig into that a bit."

When you probe, "probe_question" is a single, specific follow-up question that challenges or deepens the answer — phrased conversationally, as you would say it aloud.

Return ONLY a JSON object with this exact structure:
{
  "score": <number 1-5>,
  "brief_feedback": "<one natural spoken sentence>",
  "probe": <true|false>,
  "probe_question": "<the follow-up question to ask aloud, or empty string if probe is false>",
  "candidate_wants_to_skip": <true|false>
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

    let evaluation: { score: number; brief_feedback: string; probe: boolean; probe_question: string; candidate_wants_to_skip: boolean }
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      evaluation = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
    } catch {
      evaluation = { score: 3, brief_feedback: '', probe: false, probe_question: '', candidate_wants_to_skip: false }
    }

    // Safety net: never probe a candidate who wants to skip regardless of what the model returned.
    if (evaluation.candidate_wants_to_skip) {
      evaluation.probe = false
      evaluation.probe_question = ''
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

    // The interviewer decided to push back — the probe came from the same scoring
    // call (no extra LLM round-trip). Insert it and make it the next question so
    // the AI challenges the candidate before moving on.
    let isProbe = false
    const probeText = (evaluation.probe_question ?? '').trim()
    if (evaluation.probe && probeText) {
      const { data: fq } = await supabase.from('questions').insert({
        session_id,
        text: probeText,
        round_type: session.round_type,
        topic_tag: q.topic_tag,
        // Probes don't escalate difficulty — they dig into the same topic.
        difficulty: q.difficulty,
        order_index: 999,
        asked: false,
      }).select().single()
      if (fq) {
        nextQuestion = fq as Question
        isProbe = true
      }
    }

    return NextResponse.json({
      score,
      brief_feedback: evaluation.brief_feedback,
      next_question: nextQuestion,
      is_probe: isProbe,
      candidate_wants_to_skip: evaluation.candidate_wants_to_skip ?? false,
      // Count the freshly-inserted probe so the client doesn't end the interview
      // prematurely when the candidate is probed on the last scripted question.
      questions_remaining: (remainingQuestions?.length ?? 0) + (isProbe ? 1 : 0),
    })
  } catch (error) {
    console.error('evaluate-answer error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
