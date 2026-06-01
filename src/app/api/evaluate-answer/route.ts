import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PERSONA_SPEECH_STYLE } from '@/lib/personas'
import type { Question, RoundType } from '@/types'

const client = new Anthropic()

const EVAL_SYSTEM_PROMPT = `You are a sharp, fair human interviewer conducting a live voice interview. You score the candidate's answer and decide how to react in the moment — exactly as a real person would.

Score the answer on a scale of 1-5:
1 = Very poor / No understanding
2 = Basic / Incomplete
3 = Adequate / Mostly correct
4 = Good / Well-explained
5 = Excellent / Demonstrates deep expertise

--- SKIP DETECTION (check this FIRST) ---
Set "candidate_wants_to_skip": true whenever the candidate signals — explicitly or implicitly — that they want to move on:

Explicit signals: "pass", "skip", "next question", "move on", "I don't know", "I have no idea", "I'm not sure about this one", "I'll pass"

Implicit signals:
  - Candidate expresses discomfort or unwillingness ("I'm blanking", "I'd rather not")
  - Candidate trails off with no real attempt and the words make clear they are giving up

When candidate_wants_to_skip is true:
  - ALWAYS set "needs_clarification": false, "probe": false and "probe_question": ""
  - Score honestly, lean towards 2 if no real attempt
  - "spoken_response" must be brief, gracious, and FEEL DIFFERENT every time.
    React to the specific words the candidate used — if they said "I'll pass" react differently than if they said "I'm blanking on this one."
    NEVER use the same phrase twice in a conversation. Rotate naturally through responses like a real person would.

    Varied examples to draw from (pick whichever fits the moment, or invent a similar one):
    "Sure, no problem — let's move on."
    "Of course, that's completely fine."
    "Understood, we'll skip that one."
    "Fair enough, these can be tricky."
    "Not a problem at all."
    "Alright, let's keep going."
    "Okay, no pressure on that one."
    "Got it — totally fine."
    "Sure thing, moving on."
    "That's okay, we've got more to cover."
    "Happy to move on."
    "Noted — no worries."
    "Absolutely, let's continue."
    "No pressure — let's go to the next one."
    "That's fine, happens to everyone."

    IMPORTANT: Do NOT always default to "No worries at all" — vary naturally based on what was said.

--- CLARIFICATION (check AFTER skip detection, BEFORE probing) ---
Set "needs_clarification": true when the transcript appears incomplete or garbled — meaning you genuinely could not hear or understand the candidate, NOT when they chose not to answer.

Set needs_clarification: true when:
  - Transcript is 1-5 words AND contains no skip signal (e.g. "I think", "so basically", "the uh", "yeah well", or pure phonetic noise)
  - Answer appears cut off mid-sentence (starts coherently but ends abruptly with no conclusion)
  - Transcript is only filler sounds with no semantic content ("um", "uh uh uh", "hmm hmm", "er er")

Do NOT set needs_clarification if:
  - The candidate clearly signalled skip (see SKIP DETECTION above — candidate_wants_to_skip takes priority)
  - The answer is short but semantically complete ("REST is stateless", "O of N log N", "it prevents SQL injection")
  - The answer is vague — use probing for that, not clarification

When needs_clarification is true:
  - Set score: 1 (will not be saved — placeholder only)
  - Set probe: false, probe_question: ""
  - Set candidate_wants_to_skip: false
  - "spoken_response" must sound like a natural human who missed something — brief, warm, not robotic.
    Vary these naturally — never repeat the same phrasing twice:
    "Sorry, I didn't quite catch that — could you say it again?"
    "I think your audio cut out — could you repeat that?"
    "I missed that — mind saying it again?"
    "Could you repeat that? I didn't get the full answer."
    "I didn't catch all of that — could you say it once more?"
    "Sorry about that — could you run through that again?"

--- PROBING (only when candidate has NOT signalled skip AND needs_clarification is false) ---
Probe when:
- The answer is vague, uses buzzwords without substance, or is clearly a guess
- The candidate gave a correct but shallow answer and an obvious deeper question exists
Do NOT probe when the answer was thorough and confident (score 4-5 with specifics).
Do NOT probe more than once per topic.

When you probe, "probe_question" is a single specific follow-up — phrased conversationally, as you'd say it aloud.

--- spoken_response RULES ---
"spoken_response" is what you say out loud immediately after the candidate finishes. It must:
- Be EXACTLY ONE sentence (10 words maximum)
- Sound completely natural — never robotic or formulaic
- Match your persona's style (provided in the user message)
- React genuinely to what was actually said — if they gave a strong answer, acknowledge it specifically; if weak, be neutral
- NEVER be sycophantic for weak answers ("Wonderful!" for a score-2 answer is dishonest)
- NEVER include "Let's move on" or "Here's the next question" — only react to this answer
- For probes: lead naturally into the follow-up ("Hmm, let me push on that a bit —")
- For skips: brief and gracious — vary the phrasing every time (see SKIP DETECTION section for examples)
- For clarification: brief and natural — sound like a human who missed something

Examples by score:
  Score 5: "Excellent — I really liked how you tied in the trade-offs."
  Score 4: "Good, you covered the key points well."
  Score 3: "Okay, that gives me a sense of where you're at."
  Score 2: "Fair enough, I appreciate the honesty."
  Score 1: "Alright, no worries."

Return ONLY a JSON object with this exact structure:
{
  "score": <number 1-5>,
  "spoken_response": "<one natural sentence — your immediate spoken reaction, in your persona's voice>",
  "probe": <true|false>,
  "probe_question": "<specific follow-up question phrased conversationally, or empty string>",
  "candidate_wants_to_skip": <true|false>,
  "needs_clarification": <true|false>
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

    // Scope question fetch to this session — prevents cross-session score tampering
    const { data: question } = await supabase
      .from('questions')
      .select('*')
      .eq('id', question_id)
      .eq('session_id', session_id)
      .single()

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const q = question as Question
    const durationSeconds = start_time ? Math.round((Date.now() - start_time) / 1000) : 0

    const personaStyle = PERSONA_SPEECH_STYLE[session.round_type as RoundType] ?? 'Professional and conversational.'

    // Score the answer with Claude Haiku
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
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
          content: `Your interviewer persona: ${personaStyle}

Question (difficulty ${q.difficulty}/5, topic: ${q.topic_tag}):
"${q.text}"

Candidate's answer:
"${transcript || '[No answer — candidate was silent]'}"`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let evaluation: { score: number; spoken_response: string; probe: boolean; probe_question: string; candidate_wants_to_skip: boolean; needs_clarification: boolean }
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      evaluation = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
    } catch {
      evaluation = { score: 3, spoken_response: '', probe: false, probe_question: '', candidate_wants_to_skip: false, needs_clarification: false }
    }

    // Safety nets: mutual exclusivity between the three decision branches.
    // skip takes priority, then clarification, then probe.
    if (evaluation.candidate_wants_to_skip) {
      evaluation.probe = false
      evaluation.probe_question = ''
      evaluation.needs_clarification = false
    } else if (evaluation.needs_clarification) {
      evaluation.probe = false
      evaluation.probe_question = ''
      evaluation.candidate_wants_to_skip = false
    }

    const score = Math.min(5, Math.max(1, evaluation.score ?? 3))

    // When the interviewer needs clarification the answer was not received — don't
    // save it to the DB and don't mark the question as asked so the candidate gets
    // a clean second attempt at the same question.
    if (evaluation.needs_clarification) {
      return NextResponse.json({
        score: null,
        spoken_response: evaluation.spoken_response ?? '',
        next_question: q,        // same question — not a new one
        is_probe: false,
        candidate_wants_to_skip: false,
        needs_clarification: true,
        questions_remaining: -1, // signal: don't use this to end the interview
      })
    }

    // Persist answer and mark question asked in parallel — both are independent writes
    const [{ error: answerError }, { error: askedError }] = await Promise.all([
      supabase.from('answers').insert({
        session_id,
        question_id,
        transcript_text: transcript,
        duration_seconds: durationSeconds,
        score,
      }),
      supabase.from('questions').update({ asked: true }).eq('id', question_id),
    ])

    if (answerError) console.error('Failed to save answer:', answerError)
    if (askedError) console.error('Failed to mark question asked:', askedError)

    // Select next question using adaptive difficulty — sort buckets so we step
    // through difficulties incrementally rather than jumping based on insert order
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
        const harder = remaining
          .filter((q) => q.difficulty > question.difficulty)
          .sort((a, b) => a.difficulty - b.difficulty) // nearest harder first
        nextQuestion = harder.length > 0 ? harder[0] : remaining[0]
      } else if (score <= 2) {
        const easier = remaining
          .filter((q) => q.difficulty <= question.difficulty)
          .sort((a, b) => b.difficulty - a.difficulty) // nearest easier first
        nextQuestion = easier.length > 0 ? easier[0] : remaining[0]
      } else {
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

    const questionsRemaining = (remainingQuestions?.length ?? 0) + (isProbe ? 1 : 0)

    // When the last question has been answered, kick off feedback generation in the
    // background immediately. The LLM call runs while the AI speaks its closing words
    // and the user navigates — so the report is ready (or nearly ready) by the time
    // the feedback page loads, instead of making the user stare at a spinner.
    // No charge here — credit deduction happens only via endInterview() on the client.
    if (questionsRemaining === 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const cookieHeader = request.headers.get('cookie') ?? ''
      waitUntil(
        fetch(`${appUrl}/api/generate-feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
          body: JSON.stringify({ session_id }),
        }).catch(() => {}) // silent — the feedback page retries if this fails
      )
    }

    return NextResponse.json({
      score,
      spoken_response: evaluation.spoken_response ?? '',
      next_question: nextQuestion,
      is_probe: isProbe,
      candidate_wants_to_skip: evaluation.candidate_wants_to_skip ?? false,
      needs_clarification: false,
      // Count the freshly-inserted probe so the client doesn't end the interview
      // prematurely when the candidate is probed on the last scripted question.
      questions_remaining: questionsRemaining,
    })
  } catch (error) {
    console.error('evaluate-answer error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
