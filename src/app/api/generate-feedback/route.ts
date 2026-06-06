import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { generateShareToken } from '@/lib/utils'
import type { Question, Answer, FeedbackJSON } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic()

// Max chars per answer in the LLM prompt. 1500 chars ≈ 250 spoken words — generous
// enough to capture any complete answer, while preventing a single rambling response
// from bloating the prompt. The score itself is never affected (it was set by
// evaluate-answer which saw the full transcript in real time).
const MAX_ANSWER_CHARS = 1500

const FEEDBACK_SYSTEM_PROMPT = `You are an expert interview coach who provides detailed, specific feedback.
Analyse the complete interview transcript and generate a structured feedback report.

Return ONLY a valid JSON object with this exact structure:
{
  "overall_score": <0-100>,
  "selection_probability": <0-100>,
  "strengths": [
    {"title": "strength name", "example": "quote from their answer", "advice": "how to leverage this in future interviews"}
  ],
  "gaps": [
    {"title": "gap name", "example": "specific instance from answers", "advice": "concrete 1-2 sentence improvement action"}
  ],
  "per_question": [
    {
      "question_id": "uuid",
      "score": <1-5>,
      "feedback": "specific feedback referencing what they actually said",
      "ideal_answer_hint": "For scores 1-3 only: 2-3 bullet points (use • character) covering what a strong answer must include. Omit this field entirely for scores 4-5."
    }
  ],
  "communication": {
    "score": <0-100, overall communication score>,
    "clarity": <0-100, how clearly ideas were expressed>,
    "clarity_note": "one concise sentence assessment",
    "pacing": <0-100, appropriate speed and rhythm — 100=perfect pacing>,
    "pacing_note": "one concise sentence assessment",
    "confidence": <0-100, assertiveness and conviction in delivery>,
    "confidence_note": "one concise sentence assessment",
    "filler_words": <0-100, where 100=no fillers at all, lower=more filler words>,
    "filler_note": "one concise sentence assessment"
  },
  "summary": "2-3 paragraph honest narrative assessment"
}

Rules:
- overall_score: weighted average considering depth, accuracy, communication
- selection_probability: realistic estimate of getting to next round
- strengths: exactly 3, based on actual things said
- gaps: exactly 3, specific to what was actually said (or not said)
- Be specific — reference actual words and phrases used
- No generic feedback — every point must trace back to something in the transcript
- Be honest but constructive — this helps candidates improve
- ideal_answer_hint: only include for per_question scores 1-3; use bullet points starting with •`

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

    // Dedup: if a report already exists (e.g. from the background pre-generation that
    // fires in evaluate-answer when the last question is answered), return it immediately.
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
      // Cap each answer at MAX_ANSWER_CHARS to keep prompt size bounded for long
      // interviews — a 15-question session with verbose answers can push input tokens
      // past 6 k, significantly slowing Haiku. 800 chars captures the full substance.
      const transcript = (questions as Question[]).map((q, i) => {
        const answer = answerMap.get(q.id)
        let answerText = answer?.transcript_text ?? '[No answer provided]'
        if (answerText.length > MAX_ANSWER_CHARS) {
          answerText = answerText.slice(0, MAX_ANSWER_CHARS) + '… [truncated]'
        }
        return `Q${i + 1} [question_id:${q.id}, topic:${q.topic_tag}, difficulty:${q.difficulty}/5]:
"${q.text}"

Candidate's answer:
"${answerText}"
Score given: ${answer?.score ?? 'N/A'}/5
`
      }).join('\n---\n\n')

      const userMessage = `Interview Details:
Company: ${session.company}
Role: ${session.role}
Round: ${session.round_type}
Experience: ${session.experience_years} years
Questions asked: ${questions.length}

Complete Interview Transcript:
${transcript}

Generate a comprehensive feedback report for this candidate.`

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        // 8192 is Haiku's ceiling. A 15-question full_loop with ideal_answer_hints on
        // every low-scoring answer easily exceeds 4096 output tokens — the old limit
        // silently truncated the JSON mid-string, causing JSON.parse to throw and the
        // report to never save, leaving the feedback page polling forever.
        max_tokens: 8192,
        system: [
          {
            type: 'text',
            text: FEEDBACK_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      })

      const content = message.content[0]
      if (content.type !== 'text') throw new Error('Unexpected response type')

      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/)
        feedback = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
      } catch {
        // Log the raw output so truncation is visible in Vercel logs
        console.error('Feedback parse failed. stop_reason:', message.stop_reason, '— output length:', content.text.length)
        throw new Error('Failed to parse feedback from AI')
      }

      // Haiku hit its token limit before closing the JSON — treat as a parse failure.
      // This is logged above; increasing max_tokens is the fix.
      if (message.stop_reason === 'max_tokens') {
        console.error('Haiku hit max_tokens limit during feedback generation — output truncated')
      }

      // Re-assign question_id by position — safety net in case Claude echoed the IDs
      // incorrectly. The transcript is ordered, Claude returns per_question in the same
      // order, so index 0 in per_question always corresponds to questions[0].
      const orderedQuestions = questions as Question[]
      feedback.per_question = feedback.per_question.map((pq, i) => ({
        ...pq,
        question_id: orderedQuestions[i]?.id ?? pq.question_id,
      }))
    }

    const shareToken = generateShareToken()

    // Save report + mark session completed — do these before responding.
    const [{ data: report, error: reportError }] = await Promise.all([
      supabase.from('feedback_reports').upsert({
        session_id,
        overall_score: Math.min(100, Math.max(0, feedback.overall_score)),
        selection_probability: Math.min(100, Math.max(0, feedback.selection_probability)),
        strengths_json: feedback.strengths,
        gaps_json: feedback.gaps,
        per_question_json: feedback.per_question,
        communication_score: feedback.communication.score,
        communication_json: feedback.communication,
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
  await Promise.all(Array.from(topicGroups.entries()).map(async ([topicTag, scores]) => {
    const sessionAvg = scores.reduce((a, b) => a + b, 0) / scores.length
    const { data: existing } = await supabase
      .from('weak_areas')
      .select('avg_score, session_count')
      .eq('user_id', userId)
      .eq('topic_tag', topicTag)
      .single()
    const existingCount = existing?.session_count ?? 0
    const newCount = existingCount + 1
    const newAvg = ((existing?.avg_score ?? 0) * existingCount + sessionAvg) / newCount
    const { error: upsertErr } = await supabase.from('weak_areas').upsert(
      { user_id: userId, topic_tag: topicTag, avg_score: Math.round(newAvg * 100) / 100, session_count: newCount, last_updated: new Date().toISOString() },
      { onConflict: 'user_id,topic_tag' }
    )
    if (upsertErr) console.error('weak_areas upsert error:', topicTag, upsertErr)
  }))
}

async function completeReferral(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>>,
  userId: string,
) {
  const { createServiceClient } = await import('@/lib/supabase-server')
  const svc = await createServiceClient()

  const { data: referral } = await svc
    .from('referrals')
    .select('id, referrer_id')
    .eq('referee_id', userId)
    .eq('status', 'pending')
    .single()
  if (!referral) return

  const { data: claimed } = await svc.from('referrals')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', referral.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!claimed) return

  await Promise.all([
    creditReferralBonus(svc, referral.referrer_id),
    creditReferralBonus(svc, userId),
  ])
}

async function creditReferralBonus(
  svc: Awaited<ReturnType<typeof import('@/lib/supabase-server').createServiceClient>>,
  id: string,
) {
  await svc.rpc('increment_user_credits', { p_user_id: id, p_amount: 1 })
  await svc.from('credit_transactions').insert({ user_id: id, amount: 1, type: 'referral' })
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
