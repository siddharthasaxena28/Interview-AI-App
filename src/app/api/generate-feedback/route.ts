import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { generateShareToken } from '@/lib/utils'
import type { Question, Answer, FeedbackJSON } from '@/types'

export const dynamic = 'force-dynamic'
// Raised from 60 → 120 so cold-start + two parallel Haiku calls never race the wall clock
export const maxDuration = 120

const client = new Anthropic()

// Adaptive answer truncation: scores are already in the DB from evaluate-answer, so
// we only need enough text for Claude to write specific feedback. Shorter answers =
// smaller prompts = faster generation. Long interviews get the most aggressive cut.
function answerMaxChars(questionCount: number): number {
  if (questionCount > 15) return 500   // full_loop (~26 q) — be aggressive
  if (questionCount >= 10) return 750   // individual rounds (15 q) and medium sessions
  return 1200                           // short interview — keep most detail
}

// ── System prompts (cached on Anthropic's side via cache_control) ────────────

const PER_QUESTION_SYSTEM_PROMPT = `You are an expert interview coach providing question-by-question feedback.

The score (1-5) for each answer has ALREADY been computed by a real-time evaluator — do NOT change it.
Your job: write specific feedback text referencing what the candidate actually said, and for weak answers (scores 1-3) provide a hint showing what a strong answer covers.

Return ONLY a valid JSON array — no wrapper object, just the array:
[
  {
    "question_id": "the exact uuid provided",
    "score": <copy the pre_scored value unchanged>,
    "feedback": "2-3 sentences specific to this answer. Reference actual words, concepts, or gaps from what they said. No generic observations.",
    "ideal_answer_hint": "For scores 1-3 ONLY: 2-3 bullet points starting with • covering key elements a strong answer must include. OMIT this field entirely for scores 4 and 5."
  }
]

Rules:
- Copy each score exactly as provided — never modify it
- Reference actual phrases or specific things the candidate said (or conspicuously failed to say)
- For [No answer provided] responses: note the skip gracefully and give brief encouragement
- Return one entry per question in the exact same order as input
- Keep feedback concise and actionable`

const OVERALL_SYSTEM_PROMPT = `You are an expert interview coach generating an overall interview performance assessment.

--- SCORING ANCHOR (read before assigning overall_score) ---
You will be given both the simple average and the difficulty-weighted average of per-question
scores (each already graded 1-5 by a real-time evaluator). Use the WEIGHTED average as your
primary anchor — it credits candidates who performed well on harder questions. Convert to
overall_score using this baseline band, then adjust by at most ±8 points for communication
quality, depth/specificity beyond the raw number, and consistency:
  weighted avg 4.5-5.0 → baseline ~88-96
  weighted avg 4.0-4.4 → baseline ~78-87
  weighted avg 3.5-3.9 → baseline ~68-77
  weighted avg 3.0-3.4 → baseline ~58-67
  weighted avg 2.5-2.9 → baseline ~46-57
  weighted avg 2.0-2.4 → baseline ~34-45
  weighted avg below 2.0 → baseline ~15-33
The candidate can see their individual question scores, so overall_score must stay inside (or
very close to) the band implied by the weighted average — a number that contradicts the visible
per-question scores will feel arbitrary and erode trust.

--- SELECTION PROBABILITY ANCHOR ---
Use overall_score as your starting point for selection_probability, then adjust using the
specific selection_factors you identify (a single standout strength or dealbreaker can shift it
meaningfully):
  overall_score 85+  → roughly 60-85%
  overall_score 70-84 → roughly 35-60%
  overall_score 50-69 → roughly 15-35%
  overall_score below 50 → roughly 2-15%
These bands are loose guides, not hard rules — but stay broadly consistent with them so the
number feels principled rather than arbitrary across different candidates and sessions.

Return ONLY a valid JSON object (no per_question array):
{
  "overall_score": <0-100, derived from the scoring anchor above — see rules>,
  "selection_probability": <0-100, derived from the selection probability anchor above — see rules>,
  "selection_factors": [
    "the single biggest thing that helped or hurt their chances, stated concretely — e.g. 'Strong, structured answer on the system design question' or 'Vague on conflict-resolution — no concrete example given'",
    "second most influential factor, equally concrete",
    "optional third factor if there's a clear one — omit rather than pad to 3"
  ],
  "strengths": [
    {"title": "strength name", "example": "quote or specific reference from their answers", "advice": "how to leverage this in future interviews"}
  ],
  "gaps": [
    {"title": "gap name", "example": "specific instance from answers or a key concept they missed", "advice": "concrete 1-2 sentence improvement action"}
  ],
  "communication": {
    "score": <0-100, overall communication quality>,
    "clarity": <0-100, how clearly ideas were expressed>,
    "clarity_note": "one concise sentence assessment",
    "pacing": <0-100, appropriate speed and rhythm — 100=perfect>,
    "pacing_note": "one concise sentence assessment",
    "confidence": <0-100, assertiveness and conviction in delivery>,
    "confidence_note": "one concise sentence assessment",
    "filler_words": <0-100, where 100=no fillers at all>,
    "filler_note": "one concise sentence assessment"
  },
  "red_flags": [
    {"signal": "brief label for the disqualifying pattern", "detail": "specific evidence from the interview — exact question or quote"}
  ],
  "standout_moments": [
    {"signal": "brief label for the impressive moment", "detail": "specific evidence — exact question or quote that demonstrated it"}
  ],
  "summary": "2-3 paragraph honest narrative assessment of the overall interview performance"
}

Rules:
- strengths: exactly 3, grounded in actual things they demonstrated
- gaps: exactly 3, grounded in what was weak or missing
- selection_factors: 2-3 concrete factors that explain WHY you landed on that probability — these are shown to the candidate so they can see your reasoning, not just a bare number. Each must trace to something specific in the transcript.
- red_flags: 0-3 items. Include ONLY genuine disqualifying or seriously concerning patterns — e.g. "Cannot explain items on own resume", "Zero concrete examples across all behavioral questions", "Fundamental error on a core concept for this role". Empty array if nothing is disqualifying. Do NOT pad.
- standout_moments: 0-2 items. Include ONLY genuinely impressive moments worth calling out — e.g. correctly naming and justifying a non-obvious trade-off, depth well beyond what the question required. Empty array if nothing stands out. Do NOT pad.
- Be honest and constructive — generic praise hurts candidates
- Use topic performance patterns to identify themes
- overall_score must reflect true performance, not a confidence boost

--- MEASURED DELIVERY SIGNAL (ground truth — do not contradict) ---
You will be given a measured delivery signal computed directly from each answer's actual
filler-word density (not inferred from a text impression): how many answers came across as
"confident" vs "hesitant/filler-heavy". Treat this as ground truth for "confidence" and
"filler_words" — set those two sub-scores so they are consistent with the measured ratio
(e.g. if most answers measured hesitant/filler-heavy, "filler_words" and "confidence" must be
on the lower end, regardless of how polished the transcript text reads). You may still use the
transcript content to inform "clarity" and "pacing" and to write the *_note explanations —
just make sure confidence_note/filler_note reference what was actually measured.

--- FULL_LOOP SESSIONS ---
When round_type is full_loop: your "summary" must include one sentence per domain covered
(Technical L1 fundamentals, Technical L2 system design, Managerial/leadership, HR/behavioral)
noting the candidate's relative strength or weakness in that domain. This gives the candidate
a clear cross-domain picture of where to focus next.`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { session_id, charge } = await request.json() as { session_id: string; charge?: boolean }

    // Fetch session, questions, answers, existing report, and user plan in parallel.
    const [
      { data: session },
      { data: questions },
      { data: answers },
      { data: existingReport },
      { data: userData },
    ] = await Promise.all([
      supabase.from('interview_sessions').select('*').eq('id', session_id).eq('user_id', user.id).single(),
      supabase.from('questions').select('*').eq('session_id', session_id).eq('asked', true).order('order_index'),
      supabase.from('answers').select('*').eq('session_id', session_id).order('recorded_at'),
      supabase.from('feedback_reports').select('*').eq('session_id', session_id).maybeSingle(),
      supabase.from('users').select('plan, credit_balance').eq('id', user.id).single(),
    ])

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Dedup: if a report already exists (e.g. from background pre-generation that fires
    // in evaluate-answer when the last question is answered), return it immediately.
    // If this is a charge request, still deduct — the pre-gen doesn't charge.
    if (existingReport) {
      if (charge === true) {
        await chargeSessionCredit(supabase, user.id, session_id, userData?.plan)
      }
      return NextResponse.json({ report: existingReport, cached: true })
    }

    const answerMap = new Map(
      (answers as Answer[] ?? []).map((a) => [a.question_id, a])
    )

    let feedback: FeedbackJSON

    if (!questions || questions.length === 0) {
      feedback = {
        overall_score: 0,
        selection_probability: 0,
        selection_factors: [],
        strengths: [
          { title: 'Showed up', example: 'Candidate initiated an interview session', advice: 'Complete the full interview to receive meaningful strengths feedback' },
          { title: 'N/A', example: '', advice: '' },
          { title: 'N/A', example: '', advice: '' },
        ],
        gaps: [
          { title: 'Interview not completed', example: 'No questions were answered in this session', advice: 'Try again and complete at least a few questions to get actionable feedback' },
          { title: 'N/A', example: '', advice: '' },
          { title: 'N/A', example: '', advice: '' },
        ],
        per_question: [],
        communication: {
          score: 0, clarity: 0, pacing: 0, confidence: 0, filler_words: 0,
          clarity_note: 'Interview not completed.',
          pacing_note: 'Interview not completed.',
          confidence_note: 'Interview not completed.',
          filler_note: 'Interview not completed.',
        },
        summary: 'This interview session ended before any questions were answered. No scored feedback can be generated. Start a new session and try to answer at least a few questions to receive a detailed report.',
      }
    } else {
      const orderedQuestions = questions as Question[]
      const qCount = orderedQuestions.length
      const maxChars = answerMaxChars(qCount)

      // ── Build two separate transcripts ─────────────────────────────────────
      // Per-question call: full answer text (adaptively truncated) so feedback
      // is grounded in exactly what the candidate said.
      const perQTranscript = orderedQuestions.map((q, i) => {
        const answer = answerMap.get(q.id)
        let answerText = answer?.transcript_text ?? '[No answer provided]'
        if (answerText.length > maxChars) answerText = answerText.slice(0, maxChars) + '… [truncated]'
        return `Q${i + 1} [question_id:${q.id}, topic:${q.topic_tag}, difficulty:${q.difficulty}/5, pre_scored:${answer?.score ?? 'N/A'}/5]:\n"${q.text}"\nAnswer: "${answerText}"`
      }).join('\n---\n\n')

      // Overall call: condensed answers (250 chars) — enough for quotes and theme
      // detection without blowing up the input token count for the second call.
      const condensedTranscript = orderedQuestions.map((q, i) => {
        const answer = answerMap.get(q.id)
        const text = (answer?.transcript_text ?? '[No answer]').slice(0, 250)
        return `Q${i + 1} [${q.topic_tag}, score:${answer?.score ?? 'N/A'}/5]: "${text}"`
      }).join('\n')

      // Topic performance summary for the overall call
      const topicMap = new Map<string, number[]>()
      for (const q of orderedQuestions) {
        const score = answerMap.get(q.id)?.score
        if (score != null) {
          const arr = topicMap.get(q.topic_tag) ?? []
          arr.push(score)
          topicMap.set(q.topic_tag, arr)
        }
      }
      const topicSummary = Array.from(topicMap.entries())
        .map(([tag, scores]) => {
          const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
          return `${tag}: ${avg}/5 (${scores.length} question${scores.length > 1 ? 's' : ''})`
        })
        .join('\n')

      const avgScore = (
        orderedQuestions
          .map(q => answerMap.get(q.id)?.score ?? 0)
          .reduce((a, b) => a + b, 0) / qCount
      ).toFixed(1)

      // Average difficulty — context for the overall-assessment call.
      const avgDifficulty = (
        orderedQuestions.reduce((a, q) => a + q.difficulty, 0) / qCount
      ).toFixed(1)

      // Difficulty-weighted average score: Σ(score × difficulty) / Σ(difficulty).
      // Questions where the candidate scored well on hard content count more than
      // the same score on easy questions, making the anchor fairer across sessions
      // where the adaptive engine pushed to harder or easier questions.
      const totalDifficultyWeight = orderedQuestions.reduce((a, q) => a + q.difficulty, 0)
      const weightedAvgScore = (
        orderedQuestions
          .map(q => (answerMap.get(q.id)?.score ?? 0) * q.difficulty)
          .reduce((a, b) => a + b, 0) / Math.max(1, totalDifficultyWeight)
      ).toFixed(2)

      // Measured delivery signal — aggregates the real per-answer filler-word-density
      // classification (persisted from analyzeAnswerConfidence on the client) so the
      // communication sub-scores are grounded in actual measurement rather than an
      // LLM's text impression of tone from truncated transcript snippets.
      const confidenceCounts = orderedQuestions.reduce(
        (acc, q) => {
          const c = answerMap.get(q.id)?.confidence
          if (c === 'confident') acc.confident++
          else if (c === 'hesitant') acc.hesitant++
          return acc
        },
        { confident: 0, hesitant: 0 }
      )
      const measuredCount = confidenceCounts.confident + confidenceCounts.hesitant
      const unmeasuredCount = qCount - measuredCount
      const confidenceSummary = measuredCount > 0
        ? `Of ${qCount} total answers, ${measuredCount} have measured delivery data: ${confidenceCounts.confident} measured "confident" (low filler-word density); ${confidenceCounts.hesitant} measured "hesitant" (filler-word density above 12%). ${unmeasuredCount > 0 ? `${unmeasuredCount} answer${unmeasuredCount > 1 ? 's have' : ' has'} no measurement — do not assume unmeasured answers match the measured distribution.` : 'All answers have measured data.'}`
        : 'No measured delivery data available for this session — base communication sub-scores on transcript content alone.'

      // ── Two parallel Claude calls — wall-clock ≈ max(A, B) instead of A + B ──
      const [perQMessage, overallMessage] = await Promise.all([
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          // Per-question: worst case ~220 tokens × 26 questions (score + feedback + ideal_answer_hint
          // bullets for low-scoring answers) ≈ 5700 tokens. 6144 gives comfortable headroom.
          max_tokens: 6144,
          system: [{ type: 'text', text: PER_QUESTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{
            role: 'user',
            content: `Interview: ${session.company} — ${session.role} (${session.round_type}), ${session.experience_years} yrs experience\nQuestions: ${qCount}\n\n${perQTranscript}\n\nGenerate per-question feedback. Use each pre_scored value unchanged.`,
          }],
        }),
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          // Overall: ~1800 tokens (no per_question array). 2048 has comfortable headroom.
          max_tokens: 2048,
          system: [{ type: 'text', text: OVERALL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{
            role: 'user',
            content: `Interview: ${session.company} — ${session.role} (${session.round_type}), ${session.experience_years} yrs experience\nQuestions answered: ${qCount}, Simple avg score: ${avgScore}/5, Difficulty-weighted avg score: ${weightedAvgScore}/5 (use this as primary anchor), Average question difficulty: ${avgDifficulty}/5\n\nMeasured delivery signal: ${confidenceSummary}\n\nTopic performance:\n${topicSummary}\n\nInterview highlights:\n${condensedTranscript}\n\nGenerate the overall assessment.`,
          }],
        }),
      ])

      // ── Parse per-question result ───────────────────────────────────────────
      const perQContent = perQMessage.content[0]
      if (perQContent.type !== 'text') throw new Error('Unexpected per-question response type')

      if (perQMessage.stop_reason === 'max_tokens') {
        console.error('Per-question Haiku call hit max_tokens — increase max_tokens if this recurs')
      }

      let perQuestionFeedback: FeedbackJSON['per_question'] = []
      try {
        const arrMatch = perQContent.text.match(/\[[\s\S]*\]/)
        perQuestionFeedback = JSON.parse(arrMatch ? arrMatch[0] : perQContent.text)
        // Re-assign question_ids by position — safety net if Claude echoed IDs incorrectly
        perQuestionFeedback = perQuestionFeedback.map((pq, i) => ({
          ...pq,
          question_id: orderedQuestions[i]?.id ?? pq.question_id,
        }))
      } catch {
        console.error('Per-question parse failed. stop_reason:', perQMessage.stop_reason, '— output length:', perQContent.text.length)
        // Fall back: build minimal per-question from DB scores
        perQuestionFeedback = orderedQuestions.map(q => ({
          question_id: q.id,
          score: answerMap.get(q.id)?.score ?? 3,
          feedback: 'Feedback generation encountered an issue for this question.',
        }))
      }

      // ── Parse overall result ────────────────────────────────────────────────
      const overallContent = overallMessage.content[0]
      if (overallContent.type !== 'text') throw new Error('Unexpected overall response type')

      let overallFeedback: Omit<FeedbackJSON, 'per_question'>
      try {
        const objMatch = overallContent.text.match(/\{[\s\S]*\}/)
        overallFeedback = JSON.parse(objMatch ? objMatch[0] : overallContent.text)
      } catch {
        console.error('Overall parse failed. stop_reason:', overallMessage.stop_reason, '— output length:', overallContent.text.length)
        throw new Error('Failed to parse overall feedback from AI')
      }

      if (overallMessage.stop_reason === 'max_tokens') {
        console.error('Overall Haiku call hit max_tokens — increase max_tokens if this recurs')
      }

      // ── Merge both call results into the final feedback object ──────────────
      feedback = {
        ...overallFeedback,
        per_question: perQuestionFeedback,
      } as FeedbackJSON

      // Safety net — older prompt versions / odd Haiku output might omit this field
      if (!Array.isArray(feedback.selection_factors)) feedback.selection_factors = []
    }

    const shareToken = generateShareToken()

    // Save report + mark session completed — do these before responding.
    const [{ data: report, error: reportError }] = await Promise.all([
      supabase.from('feedback_reports').upsert({
        session_id,
        overall_score: Math.min(100, Math.max(0, Math.round(feedback.overall_score ?? 0))),
        selection_probability: Math.min(100, Math.max(0, Math.round(feedback.selection_probability ?? 0))),
        selection_factors_json: feedback.selection_factors,
        strengths_json: feedback.strengths,
        gaps_json: feedback.gaps,
        // Clamp every per-question score to 1-5. The per-question call is instructed
        // to copy pre-scored values unchanged, but we validate defensively here.
        per_question_json: (feedback.per_question ?? []).map(pq => ({
          ...pq,
          score: Math.min(5, Math.max(1, Math.round(pq.score ?? 3))),
        })),
        // All communication sub-scores must be 0-100. Clamp here because only
        // overall_score and selection_probability were previously guarded — the
        // communication object was written raw, allowing out-of-range values.
        communication_score: Math.min(100, Math.max(0, Math.round(feedback.communication?.score ?? 0))),
        communication_json: {
          score:       Math.min(100, Math.max(0, Math.round(feedback.communication?.score       ?? 0))),
          clarity:     Math.min(100, Math.max(0, Math.round(feedback.communication?.clarity     ?? 0))),
          pacing:      Math.min(100, Math.max(0, Math.round(feedback.communication?.pacing      ?? 0))),
          confidence:  Math.min(100, Math.max(0, Math.round(feedback.communication?.confidence  ?? 0))),
          filler_words:Math.min(100, Math.max(0, Math.round(feedback.communication?.filler_words?? 0))),
          clarity_note:      feedback.communication?.clarity_note      ?? '',
          pacing_note:       feedback.communication?.pacing_note       ?? '',
          confidence_note:   feedback.communication?.confidence_note   ?? '',
          filler_note:       feedback.communication?.filler_note       ?? '',
        },
        red_flags_json: feedback.red_flags ?? [],
        standout_moments_json: feedback.standout_moments ?? [],
        report_text: feedback.summary,
        share_token: shareToken,
      }, { onConflict: 'session_id' }).select().single(),
      supabase.from('interview_sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', session_id),
    ])

    if (reportError) {
      console.error('Report save error:', reportError)
      // Do not charge credits when the report failed to save — the user would
      // lose a credit without getting a readable report.
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
    }

    // Credit deduction is fast (~300 ms) and must be reliable — keep it before response.
    if (charge === true) {
      await chargeSessionCredit(supabase, user.id, session_id, userData?.plan)
    }

    // Streak, weak areas, referral credit, and email are all non-critical for the
    // user to see their report. Defer them with waitUntil so they complete after the
    // response is sent — removes ~4-5 s of blocking from the critical path.
    waitUntil(
      Promise.allSettled([
        updateStreak(supabase, user.id),
        updateWeakAreas(supabase, user.id, questions as Question[] ?? [], answerMap),
        completeReferral(supabase, user.id),
        sendFeedbackEmail(supabase, user.id, session, feedback, session_id, shareToken),
      ])
    )

    return NextResponse.json({ report, feedback })
  } catch (error) {
    console.error('generate-feedback error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// ── Side-effect helpers ────────────────────────────────────────────────────

async function chargeSessionCredit(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>>,
  userId: string,
  sessionId: string,
  plan?: string | null,
) {
  if (plan === 'unlimited') return

  const { createServiceClient } = await import('@/lib/supabase-server')
  const svc = await createServiceClient()

  // Insert the debit transaction first. The unique partial index on
  // credit_transactions(session_id) WHERE type='session_use' causes this INSERT
  // to fail with a unique violation if the session was already charged (e.g. on a
  // retry). We catch that and skip the balance update — idempotent by design.
  const { error: txError } = await svc.from('credit_transactions').insert({
    user_id: userId,
    amount: -1,
    type: 'session_use',
    session_id: sessionId,
  })

  if (txError) {
    if (txError.code !== '23505') console.error('chargeSessionCredit tx error:', txError)
    return
  }

  const { error: balErr } = await svc.rpc('increment_user_credits', { p_user_id: userId, p_amount: -1 })
  if (balErr) console.error('chargeSessionCredit balance update error:', balErr)
}

async function updateStreak(supabase: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>>, userId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: currentUser } = await supabase
    .from('users')
    .select('current_streak, longest_streak, last_session_date')
    .eq('id', userId)
    .single()

  let newStreak = 1
  if (currentUser?.last_session_date) {
    const lastDate = new Date(currentUser.last_session_date + 'T00:00:00Z')
    const todayDate = new Date(today + 'T00:00:00Z')
    const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000)
    if (diffDays === 0) newStreak = currentUser.current_streak
    else if (diffDays === 1) newStreak = currentUser.current_streak + 1
  }
  const newLongest = Math.max(newStreak, currentUser?.longest_streak ?? 0)
  const { createServiceClient } = await import('@/lib/supabase-server')
  const svc = await createServiceClient()
  await svc
    .from('users')
    .update({ current_streak: newStreak, longest_streak: newLongest, last_session_date: today })
    .eq('id', userId)
}

async function updateWeakAreas(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>>,
  userId: string,
  questions: Question[],
  answerMap: Map<string, Answer>,
) {
  const topicGroups = new Map<string, number[]>()
  for (const q of questions) {
    const answer = answerMap.get(q.id)
    if (answer?.score != null) {
      const arr = topicGroups.get(q.topic_tag) ?? []
      arr.push(answer.score)
      topicGroups.set(q.topic_tag, arr)
    }
  }
  // Atomic upsert via RPC (see upsert_weak_area_migration.sql) — folds the
  // read-modify-write of the rolling average into a single DB statement so
  // concurrent session completions for the same topic can't clobber each other.
  await Promise.all(Array.from(topicGroups.entries()).map(async ([topicTag, scores]) => {
    const sessionAvg = scores.reduce((a, b) => a + b, 0) / scores.length
    const { error: upsertErr } = await supabase.rpc('upsert_weak_area', {
      p_user_id: userId,
      p_topic_tag: topicTag,
      p_session_avg: sessionAvg,
    })
    if (upsertErr) console.error('weak_areas upsert error:', topicTag, upsertErr)
  }))
}

async function completeReferral(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>>,
  userId: string,
) {
  const { createServiceClient } = await import('@/lib/supabase-server')
  const svc = await createServiceClient()

  // Atomic claim + crediting (see complete_referral_migration.sql) — the
  // referral status flip and both credit grants happen in a single
  // transaction, so a partial failure can't mark the referral completed
  // without paying out the bonus.
  const { error } = await svc.rpc('complete_referral', { p_referee_id: userId })
  if (error) console.error('complete_referral error:', error)
}

async function sendFeedbackEmail(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>>,
  userId: string,
  session: { company: string; role: string; [key: string]: unknown },
  feedback: FeedbackJSON,
  sessionId: string,
  shareToken: string,
) {
  if (!process.env.RESEND_API_KEY) return

  const { data: userData } = await supabase.from('users').select('email, name').eq('id', userId).single()
  if (!userData?.email) return

  const resend = new Resend(process.env.RESEND_API_KEY)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://interviewai.in'

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'InterviewAI <noreply@interviewai.in>',
    to: userData.email,
    subject: `Your Interview Report — ${session.company} ${session.role} | Score: ${feedback.overall_score}/100`,
    html: buildEmailHtml({
      name: userData.name,
      company: session.company,
      role: session.role,
      score: feedback.overall_score,
      probability: feedback.selection_probability,
      summary: feedback.summary,
      reportUrl: `${appUrl}/interview/feedback/${sessionId}`,
    }),
  })

  await supabase.from('feedback_reports').update({ emailed_at: new Date().toISOString() }).eq('session_id', sessionId)
}

function buildEmailHtml({
  name, company, role, score, probability, summary, reportUrl,
}: {
  name: string; company: string; role: string; score: number; probability: number; summary: string; reportUrl: string
}) {
  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#4f46e5;padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:24px;">InterviewAI</h1>
      <p style="color:#c7d2fe;margin:8px 0 0;">Your Interview Report is Ready</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin-bottom:24px;">Hi ${name},</p>
      <p style="color:#374151;margin-bottom:24px;">Your mock interview for <strong>${role} at ${company}</strong> is complete.</p>
      <div style="background:#f9fafb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <div style="font-size:48px;font-weight:bold;color:${scoreColor};">${score}</div>
        <div style="color:#6b7280;font-size:14px;">Overall Score / 100</div>
        <div style="margin-top:12px;font-size:18px;font-weight:600;color:#374151;">${probability}% chance of selection</div>
      </div>
      <p style="color:#374151;line-height:1.6;margin-bottom:24px;">${summary.split('\n')[0]}</p>
      <div style="text-align:center;">
        <a href="${reportUrl}" style="background:#4f46e5;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;display:inline-block;">View Full Report →</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">InterviewAI · Practice like it's real. Perform when it matters.</p>
    </div>
  </div>
</body>
</html>`
}
