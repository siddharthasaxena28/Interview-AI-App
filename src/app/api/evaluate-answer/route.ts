import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { withAuth, apiError } from '@/lib/api-handler'
import { PERSONA_SPEECH_STYLE } from '@/lib/personas'
import type { Question, RoundType } from '@/types'

const client = new Anthropic()

const EVAL_SYSTEM_PROMPT = `You are a sharp, fair human interviewer conducting a live voice interview. You score the candidate's answer and decide how to react in the moment — exactly as a real person would.

--- SCORING RUBRIC ---
Universal baseline (1-5):
  1 = Very poor — no real understanding; off-topic or essentially no answer
  2 = Basic / Incomplete — surface-level; key elements missing or incorrect
  3 = Adequate — mostly correct; demonstrates understanding but lacks depth or specificity
  4 = Good — well-explained with specifics; covers important dimensions
  5 = Excellent — deep expertise; handles trade-offs, edge cases, and nuance fluently

Apply these round-type refinements ON TOP of the universal baseline (round type is given in the user message):

tech_l1 (Fundamentals):
  5 = correct + clear complexity/edge-case reasoning + clean logic
  4 = correct and explained; minor gap in edge cases or complexity
  3 = correct but vague, OR partially correct with reasonable explanation
  2 = basic awareness but core concept is wrong or too thin to be useful
  1 = clearly wrong, confused, or no attempt

tech_l2 (System Design / Architecture):
  5 = structured breakdown, explicit assumptions, scalability + trade-offs named and justified, NFRs considered
  4 = good structure and trade-offs; may miss one NFR or not fully justify a choice
  3 = main design idea present but high-level; no real trade-off reasoning
  2 = vague buzzwords ("use microservices", "add a cache") with no substance — polished delivery does NOT save this
  1 = off-topic, fundamentally wrong design, or no attempt

managerial (STAR Method — Situation, Task, Action, Result):
  5 = all four STAR elements present, concrete metrics or named outcomes, genuine reflection
  4 = clear S+T+A+R, good specificity; may lack measurable result or reflection
  3 = partial STAR — story is clear but 1-2 elements are thin or vague
  2 = vague or generic — not grounded in a real situation; STAR structure missing. Confident delivery of a vague answer still scores 2
  1 = theoretical ("I would...") with no real example, or no attempt

hr (Culture Fit / Behavioral / Motivation):
  5 = authentic, specific narrative; genuine self-awareness or concrete company/role research
  4 = specific and honest; good alignment; minor lack of depth
  3 = reasonable but somewhat generic or surface-level; not formulaic
  2 = clearly scripted/formulaic with no personal specificity, OR evasive on a direct question
  1 = inappropriate, hostile, highly evasive, or no real answer
  NOTE: Do NOT penalise naming actual salary expectations or notice periods — that is what HR rounds are for

full_loop: infer the rubric from the topic_tag — tech_l1 tags → tech_l1 rubric; tech_l2 tags → tech_l2 rubric; managerial tags → managerial rubric; hr tags → hr rubric

--- EXPERIENCE & DURATION CALIBRATION ---
You will be told the candidate's years of experience and how long they spent on this answer.

Experience calibration — hold senior candidates to a higher bar:
  <2 years: lenient — give benefit of the doubt for decent attempts; depth is not yet expected
  2-6 years: default rubric as written above
  7+ years: stricter — expect depth, trade-offs, and domain fluency; "basically correct" earns 3 not 4

Duration signal (do NOT make this the main driver — use it as supporting context):
  <15 s for a complex question → check whether the answer was genuinely complete or just superficial
  >180 s for a simple question → watch for signal-to-noise; verbosity is not depth
  Do not penalise well-paced, thorough answers even if they are long

--- SKIP DETECTION (check this FIRST) ---
Set "candidate_wants_to_skip": true whenever the candidate signals — explicitly or implicitly — that they want to move on:

Explicit signals: "pass", "skip", "next question", "move on", "I don't know", "I have no idea", "I'm not sure about this one", "I'll pass"

Implicit signals:
  - Candidate expresses discomfort or unwillingness ("I'm blanking", "I'd rather not")
  - Candidate trails off with no real attempt and the words make clear they are giving up

When candidate_wants_to_skip is true:
  - ALWAYS set "needs_clarification": false, "probe": false and "probe_question": ""
  - Score by difficulty: question difficulty 1-2 → score 1; difficulty 3-5 → score 2
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

--- ENCOURAGE CONTINUATION (check AFTER skip detection, BEFORE clarification) ---
Set "encourage_continuation": true when the candidate clearly started answering but trailed off before finishing — they have begun but the response is obviously incomplete and they are not signaling a skip.

Set encourage_continuation: true when:
  - Transcript has real content (> 5 words) but reads as unfinished or trailing off mid-thought
  - Candidate used filler-heavy openers with no follow-through ("So basically...", "I mean, it's like...", "Yeah, it stores...")
  - The answer started coherently but stopped abruptly mid-explanation
  - A one-sentence answer to a deep technical question where more is clearly expected

Do NOT set encourage_continuation if:
  - candidate_wants_to_skip is true (skip always takes priority)
  - needs_clarification is true (clarification takes priority over encouragement)
  - The answer is short but genuinely complete ("REST is stateless", "O of N log N", "it prevents SQL injection")
  - The answer is complete but shallow — use probe for that, not encouragement

When encourage_continuation is true:
  - Set score: 0 (will not be saved — placeholder only)
  - Set probe: false, probe_question: "", candidate_wants_to_skip: false, needs_clarification: false
  - "spoken_response" must be a single warm, brief prompt (< 8 words). Vary naturally:
    "Go on, I'm listening."
    "Tell me more about that."
    "Continue — I'd like to hear more."
    "Keep going."
    "What else can you add?"
    "Say more about that."
    "I'm following — go ahead."

--- CLARIFICATION (check AFTER skip and encouragement detection, BEFORE probing) ---
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

--- DYNAMIC QUESTION SUGGESTION ---
After evaluating the answer, you may suggest a different question to ask next — one that's more targeted to what this specific candidate revealed.

Set "suggested_next_question" to a non-empty string ONLY when ALL of the following are true:
- You have at least one prior exchange in conversation history OR the intro mentioned something specific
- Score is 3–5 (candidate is engaged and giving substantive answers worth pursuing)
- The answer mentioned a specific technology, system, failure, project, or experience by name that the generic question plan almost certainly doesn't cover
- A targeted follow-up on that specific thing would clearly yield more signal than continuing with whatever comes next
- probe, candidate_wants_to_skip, needs_clarification, and encourage_continuation are all false

Do NOT suggest when:
- Score is 1–2 (candidate is struggling — don't add new pressure with novel directions)
- The answer was vague without any nameable specifics
- You'd just be rephrasing the same question differently
- There's nothing in the conversation to build on yet

Specificity is mandatory. Reference something the candidate actually said by name or detail:
  BAD: "Tell me more about your distributed systems experience."
  GOOD: "You mentioned your Kafka consumers hit 2-minute lag under peak — how did you root-cause that?"
  BAD: "Can you talk about a time you improved performance?"
  GOOD: "You said the Redis cluster migration cut your p99 from 400ms to 40ms — what was the biggest technical risk during that cutover?"

If no compelling specific insight warrants a pivot: return "suggested_next_question": ""


--- CONVERSATION HISTORY ---
You will receive the recent conversation history (last few Q&A exchanges) and the candidate's self-introduction. Use this to:
- Make transitions feel natural and connected ("You mentioned X earlier — that actually leads into my next question...")
- Spot contradictions or undersell ("Earlier you said you led the team, but just now you said you were a contributor — can you clarify?")
- Calibrate difficulty expectations based on what they've already revealed
- Reference specific projects, skills, or experiences the candidate mentioned

Only reference previous answers when it genuinely improves the response — don't force it.

--- PROBE DEPTH ---
If the user message contains "Already on a follow-up question: yes" — do NOT probe again. Score and move on. A candidate should never face more than two consecutive follow-ups on the same topic.

--- CONFIDENCE SIGNAL ---
The user message may include a speech-pattern note ("hesitant" or "confident"). Adjust your spoken_response tone accordingly:
- Hesitant: be more encouraging in tone (still honest about the score — just warmer delivery)
- Confident: can be more direct and push harder on gaps

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
- When you have conversation history: you may weave in a brief reference to a prior answer in your spoken_response if it fits naturally

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
  "needs_clarification": <true|false>,
  "encourage_continuation": <true|false>,
  "suggested_next_question": "<specific contextual question referencing what the candidate said, e.g. 'You mentioned X — walk me through Y', or empty string if no specific insight warrants a pivot>"
}`

export const POST = withAuth('evaluate-answer', async ({ request, user, supabase }) => {
  const {
    transcript, question_id, session_id, start_time,
    conversation_history, intro_transcript, answer_confidence, is_already_probe,
  } = await request.json() as {
    transcript: string
    question_id: string
    session_id: string
    start_time?: number
    conversation_history?: { question: string; answer: string; score: number }[]
    intro_transcript?: string
    answer_confidence?: 'confident' | 'hesitant'
    is_already_probe?: boolean
  }

  if (!transcript || !question_id || !session_id) {
    return apiError('Missing required fields', 400)
  }

  // Cap what we send to the model to ~3 min of speech — prevents prompt
  // injection and token overuse. The full transcript is still persisted
  // below so long answers aren't silently clipped in the saved record/report.
  const cappedTranscript = transcript.slice(0, 3000)

  // Verify session belongs to this user
  const { data: session } = await supabase
    .from('interview_sessions')
    .select('id, round_type, experience_years')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return apiError('Session not found', 404)
  }

  // Scope question fetch to this session — prevents cross-session score tampering
  const { data: question } = await supabase
    .from('questions')
    .select('*')
    .eq('id', question_id)
    .eq('session_id', session_id)
    .single()

  if (!question) {
    return apiError('Question not found', 404)
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
        content: [
          `Your interviewer persona: ${personaStyle}`,
          intro_transcript ? `Candidate self-introduction: "${intro_transcript.slice(0, 500)}"` : '',
          (conversation_history && conversation_history.length > 0)
            ? `Recent conversation (${conversation_history.length} exchange${conversation_history.length > 1 ? 's' : ''}):\n${conversation_history.map(h => `Q: "${h.question}"\nA: "${h.answer.slice(0, 400)}" [Score: ${h.score}/5]`).join('\n\n')}`
            : '',
          `Round type: ${session.round_type} | Candidate experience: ${session.experience_years ?? 0} yrs | Answer duration: ${durationSeconds}s`,
          `Already on a follow-up question: ${is_already_probe ? 'yes — do NOT probe again' : 'no'}`,
          answer_confidence ? `Speech pattern: ${answer_confidence}` : '',
          `Question (difficulty ${q.difficulty}/5, topic: ${q.topic_tag}):\n"${q.text}"`,
          `Candidate's answer:\n"${cappedTranscript || '[No answer — candidate was silent]'}"`,
        ].filter(Boolean).join('\n\n'),
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  let evaluation: { score: number; spoken_response: string; probe: boolean; probe_question: string; candidate_wants_to_skip: boolean; needs_clarification: boolean; encourage_continuation: boolean; suggested_next_question: string }
  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    evaluation = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
  } catch {
    console.error('[evaluate-answer] Failed to parse Claude response:', content.text.slice(0, 200))
    return apiError('Failed to parse evaluation response', 502)
  }

  // If already on a probe, never insert another — force the interview forward.
  if (is_already_probe) {
    evaluation.probe = false
    evaluation.probe_question = ''
  }

  // Safety nets: mutual exclusivity — skip > encourage > clarification > probe.
  // Dynamic question is disabled on any special branch (no pivot when candidate struggles).
  if (evaluation.candidate_wants_to_skip) {
    evaluation.probe = false
    evaluation.probe_question = ''
    evaluation.needs_clarification = false
    evaluation.encourage_continuation = false
    evaluation.suggested_next_question = ''
  } else if (evaluation.encourage_continuation) {
    evaluation.probe = false
    evaluation.probe_question = ''
    evaluation.candidate_wants_to_skip = false
    evaluation.needs_clarification = false
    evaluation.suggested_next_question = ''
  } else if (evaluation.needs_clarification) {
    evaluation.probe = false
    evaluation.probe_question = ''
    evaluation.candidate_wants_to_skip = false
    evaluation.encourage_continuation = false
    evaluation.suggested_next_question = ''
  }
  // Also suppress dynamic question when probing (probe already handles the follow-up)
  if (evaluation.probe) evaluation.suggested_next_question = ''

  // Enforce skip scoring rule server-side regardless of what the LLM returned.
  // The rubric says difficulty 1-2 → score 1, difficulty 3-5 → score 2.
  if (evaluation.candidate_wants_to_skip) {
    evaluation.score = q.difficulty <= 2 ? 1 : 2
  }

  const score = Math.min(5, Math.max(1, evaluation.score ?? 3))

  // Candidate trailed off mid-answer — play a brief encouragement and stay on the
  // same question. No DB write, no question advancement. Client caps this at 1 per question.
  if (evaluation.encourage_continuation) {
    return NextResponse.json({
      score: null,
      spoken_response: evaluation.spoken_response ?? "Go on, I'm listening.",
      next_question: q,
      is_probe: false,
      candidate_wants_to_skip: false,
      needs_clarification: false,
      encourage_continuation: true,
      questions_remaining: -1,
    })
  }

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
      encourage_continuation: false,
      questions_remaining: -1, // signal: don't use this to end the interview
    })
  }

  // Persist answer and mark question asked in parallel — both are independent writes
  const [{ error: answerError }, { error: askedError }] = await Promise.all([
    supabase.from('answers').insert({
      session_id,
      question_id,
      transcript_text: transcript.slice(0, 10000),
      duration_seconds: durationSeconds,
      score,
      // Persist the measured filler-word-density signal (computed client-side
      // in analyzeAnswerConfidence) so generate-feedback can ground its
      // communication metrics in real data instead of re-guessing from text.
      confidence: answer_confidence ?? null,
    }),
    supabase.from('questions').update({ asked: true }).eq('id', question_id),
  ])

  if (answerError) {
    console.error('Failed to save answer:', answerError)
    return apiError('Failed to save answer — please retry', 500)
  }
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

  // Dynamic question: Claude spotted a specific insight from the conversation worth
  // exploring that the pre-planned queue wouldn't cover. Insert it as the immediate
  // next question (order_index -1 = before all existing planned questions). The
  // planned questions remain in the queue so the interview doesn't shorten.
  let isDynamic = false
  const dynText = (evaluation.suggested_next_question ?? '').trim()
  if (
    dynText &&
    !isProbe &&
    !is_already_probe &&
    nextQuestion &&
    remainingQuestions && remainingQuestions.length > 0
  ) {
    const { data: dynQ } = await supabase.from('questions').insert({
      session_id,
      text: dynText,
      round_type: session.round_type,
      topic_tag: q.topic_tag,
      difficulty: q.difficulty,
      order_index: -1,
      asked: false,
    }).select().single()
    if (dynQ) {
      nextQuestion = dynQ as Question
      isDynamic = true
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
    is_dynamic: isDynamic,
    candidate_wants_to_skip: evaluation.candidate_wants_to_skip ?? false,
    needs_clarification: false,
    encourage_continuation: false,
    questions_remaining: questionsRemaining,
  })
}, {
  // A full_loop interview is ~26 questions + probes + clarifications; 80/hr
  // covers two full sessions while capping replay abuse on this (expensive) route.
  rateLimit: { prefix: 'eval', max: 80, windowMs: 3_600_000 },
})
