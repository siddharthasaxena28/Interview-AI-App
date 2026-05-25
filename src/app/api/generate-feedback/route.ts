import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { generateShareToken } from '@/lib/utils'
import type { Question, Answer, FeedbackJSON } from '@/types'

const client = new Anthropic()

const FEEDBACK_SYSTEM_PROMPT = `You are an expert interview coach who provides detailed, specific feedback.
Analyse the complete interview transcript and generate a structured feedback report.

Return ONLY a valid JSON object with this exact structure:
{
  "overall_score": <0-100>,
  "selection_probability": <0-100>,
  "strengths": [
    {"title": "strength name", "example": "quote from their answer", "advice": "how to leverage this"}
  ],
  "gaps": [
    {"title": "gap name", "example": "specific instance from answers", "advice": "how to improve"}
  ],
  "per_question": [
    {"question_id": "uuid", "score": <1-5>, "feedback": "specific feedback on this answer"}
  ],
  "communication": {
    "score": <0-100>,
    "clarity": "assessment of clarity",
    "pacing": "assessment of pacing",
    "confidence": "assessment of confidence",
    "filler_words": "assessment of filler words"
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
- Be honest but constructive — this helps candidates improve`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { session_id } = await request.json() as { session_id: string }

    // Get session details
    const { data: session } = await supabase
      .from('interview_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get all questions for this session
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('session_id', session_id)
      .eq('asked', true)
      .order('order_index')

    // Get all answers
    const { data: answers } = await supabase
      .from('answers')
      .select('*')
      .eq('session_id', session_id)
      .order('recorded_at')

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found for session' }, { status: 400 })
    }

    const answerMap = new Map(
      (answers as Answer[] ?? []).map((a) => [a.question_id, a])
    )

    // Build transcript for Claude
    const transcript = (questions as Question[]).map((q, i) => {
      const answer = answerMap.get(q.id)
      return `Q${i + 1} [${q.topic_tag}, difficulty ${q.difficulty}/5]:
"${q.text}"

Candidate's answer:
"${answer?.transcript_text ?? '[No answer provided]'}"
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
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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

    let feedback: FeedbackJSON
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      feedback = JSON.parse(jsonMatch ? jsonMatch[0] : content.text)
    } catch {
      throw new Error('Failed to parse feedback from AI')
    }

    const shareToken = generateShareToken()

    // Save to Supabase
    const { data: report, error: reportError } = await supabase
      .from('feedback_reports')
      .upsert({
        session_id,
        overall_score: Math.min(100, Math.max(0, feedback.overall_score)),
        selection_probability: Math.min(100, Math.max(0, feedback.selection_probability)),
        strengths_json: feedback.strengths,
        gaps_json: feedback.gaps,
        per_question_json: feedback.per_question,
        communication_score: feedback.communication.score,
        report_text: feedback.summary,
        share_token: shareToken,
      })
      .select()
      .single()

    if (reportError) {
      console.error('Report save error:', reportError)
    }

    // Mark session as completed
    await supabase
      .from('interview_sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', session_id)

    // Complete referral reward on user's first completed session
    try {
      const { count: completedCount } = await supabase
        .from('interview_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')
      if (completedCount === 1) {
        const { data: referral } = await supabase
          .from('referrals')
          .select('id, referrer_id')
          .eq('referee_id', user.id)
          .eq('status', 'pending')
          .single()
        if (referral) {
          await supabase.from('referrals')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', referral.id)
          const { data: referrerUser } = await supabase
            .from('users').select('credit_balance').eq('id', referral.referrer_id).single()
          await supabase.from('users')
            .update({ credit_balance: (referrerUser?.credit_balance ?? 0) + 1 })
            .eq('id', referral.referrer_id)
          await supabase.from('credit_transactions')
            .insert({ user_id: referral.referrer_id, amount: 1, type: 'referral_bonus' })
          const { data: refereeUser } = await supabase
            .from('users').select('credit_balance').eq('id', user.id).single()
          await supabase.from('users')
            .update({ credit_balance: (refereeUser?.credit_balance ?? 0) + 1 })
            .eq('id', user.id)
          await supabase.from('credit_transactions')
            .insert({ user_id: user.id, amount: 1, type: 'referral_bonus' })
        }
      }
    } catch (referralError) {
      console.error('Referral completion error:', referralError)
    }

    // Update streak
    const today = new Date().toISOString().slice(0, 10)
    const { data: currentUser } = await supabase
      .from('users')
      .select('current_streak, longest_streak, last_session_date')
      .eq('id', user.id)
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
    await supabase
      .from('users')
      .update({ current_streak: newStreak, longest_streak: newLongest, last_session_date: today })
      .eq('id', user.id)

    // Update weak areas with running average per topic
    const topicGroups = new Map<string, number[]>()
    for (const q of questions as Question[]) {
      const answer = answerMap.get(q.id)
      if (answer?.score != null) {
        const arr = topicGroups.get(q.topic_tag) ?? []
        arr.push(answer.score)
        topicGroups.set(q.topic_tag, arr)
      }
    }
    for (const [topicTag, scores] of Array.from(topicGroups.entries())) {
      const sessionAvg = scores.reduce((a, b) => a + b, 0) / scores.length
      const { data: existing } = await supabase
        .from('weak_areas')
        .select('avg_score, session_count')
        .eq('user_id', user.id)
        .eq('topic_tag', topicTag)
        .single()
      const existingCount = existing?.session_count ?? 0
      const newCount = existingCount + 1
      const newAvg = ((existing?.avg_score ?? 0) * existingCount + sessionAvg) / newCount
      await supabase
        .from('weak_areas')
        .upsert(
          { user_id: user.id, topic_tag: topicTag, avg_score: Math.round(newAvg * 100) / 100, session_count: newCount, last_updated: new Date().toISOString() },
          { onConflict: 'user_id,topic_tag' }
        )
    }

    // Send email report via Resend
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', user.id)
        .single()

      if (userData?.email && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

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
            reportUrl: `${appUrl}/interview/feedback/${session_id}`,
          }),
        })

        if (report) {
          await supabase
            .from('feedback_reports')
            .update({ emailed_at: new Date().toISOString() })
            .eq('session_id', session_id)
        }
      }
    } catch (emailError) {
      console.error('Email send error:', emailError)
    }

    return NextResponse.json({ report, feedback })
  } catch (error) {
    console.error('generate-feedback error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

function buildEmailHtml({
  name, company, role, score, probability, summary, reportUrl,
}: {
  name: string
  company: string
  role: string
  score: number
  probability: number
  summary: string
  reportUrl: string
}) {
  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background: #1d4ed8; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">InterviewAI</h1>
      <p style="color: #93c5fd; margin: 8px 0 0;">Your Interview Report is Ready</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #374151; margin-bottom: 24px;">Hi ${name},</p>
      <p style="color: #374151; margin-bottom: 24px;">
        Your mock interview for <strong>${role} at ${company}</strong> is complete. Here's your summary:
      </p>
      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 48px; font-weight: bold; color: ${scoreColor};">${score}</div>
        <div style="color: #6b7280; font-size: 14px;">Overall Score / 100</div>
        <div style="margin-top: 12px; font-size: 18px; font-weight: 600; color: #374151;">${probability}% chance of selection</div>
      </div>
      <p style="color: #374151; line-height: 1.6; margin-bottom: 24px;">${summary.split('\n')[0]}</p>
      <div style="text-align: center;">
        <a href="${reportUrl}" style="background: #1d4ed8; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; display: inline-block;">
          View Full Report →
        </a>
      </div>
    </div>
    <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">InterviewAI · Practice like it's real. Perform when it matters.</p>
    </div>
  </div>
</body>
</html>`
}
