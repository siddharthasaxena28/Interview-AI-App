import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-server'
import { sendPushToUser } from '@/lib/push-server'

function isAuthorized(authHeader: string | null): boolean {
  if (!process.env.CRON_SECRET || !authHeader) return false
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`)
  const actual = Buffer.from(authHeader)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ skipped: 'no resend key' })
  }

  const supabase = await createServiceClient()
  const resend = new Resend(process.env.RESEND_API_KEY)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://interviewai.in'
  const from = process.env.RESEND_FROM_EMAIL ?? 'InterviewAI <noreply@interviewai.in>'

  const toDate = (offset: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - offset)
    return d.toISOString().slice(0, 10)
  }

  let sent = 0
  let pushed = 0

  // Streak at risk: last practiced yesterday, active streak
  const { data: streakUsers } = await supabase
    .from('users')
    .select('id, email, name, current_streak')
    .eq('last_session_date', toDate(1))
    .gte('current_streak', 2)

  for (const u of streakUsers ?? []) {
    try {
      await resend.emails.send({
        from,
        to: u.email,
        subject: `Your ${u.current_streak}-day streak is at risk today`,
        html: streakAtRiskHtml({ name: u.name, streak: u.current_streak, appUrl }),
      })
      sent++
    } catch { /* non-fatal */ }
    // Push notification (no-ops if VAPID keys aren't configured)
    pushed += await sendPushToUser(supabase, u.id, {
      title: `🔥 ${u.current_streak}-day streak at risk`,
      body: 'Practise one interview today to keep your streak alive.',
      url: '/interview/setup',
    }).catch(() => 0)
  }

  // Re-engagement tiers: each fires exactly once as the user's last-practice
  // date crosses the mark. Day 3 = gentle nudge, day 7 = week-out win-back,
  // day 14 = last-call pointing at the free drill (lowest-friction return).
  // Without the later tiers, anyone who missed the day-3 email never heard
  // from us again.
  const REENGAGE_TIERS = [
    { offset: 3, tone: 'nudge' as const },
    { offset: 7, tone: 'winback' as const },
    { offset: 14, tone: 'lastcall' as const },
  ]
  const tierDates = REENGAGE_TIERS.map(t => toDate(t.offset))
  const toneByDate = new Map(REENGAGE_TIERS.map(t => [toDate(t.offset), t.tone]))

  const { data: nudgeUsers } = await supabase
    .from('users')
    .select('id, email, name, last_session_date')
    .in('last_session_date', tierDates)

  // Batch-fetch weak areas for all nudge users in one query (was N+1 — one
  // query per user) and pick each user's single weakest topic client-side.
  const nudgeUserIds = (nudgeUsers ?? []).map(u => u.id)
  const weakestByUser = new Map<string, { topic_tag: string; avg_score: number }>()
  if (nudgeUserIds.length > 0) {
    const { data: allWeakAreas } = await supabase
      .from('weak_areas')
      .select('user_id, topic_tag, avg_score')
      .in('user_id', nudgeUserIds)
      .order('avg_score', { ascending: true })
    for (const wa of allWeakAreas ?? []) {
      if (!weakestByUser.has(wa.user_id)) {
        weakestByUser.set(wa.user_id, { topic_tag: wa.topic_tag, avg_score: wa.avg_score })
      }
    }
  }

  for (const u of nudgeUsers ?? []) {
    const tone = toneByDate.get(u.last_session_date ?? '') ?? 'nudge'
    const topWeak = weakestByUser.get(u.id) ?? null
    const weakTopic = topWeak
      ? topWeak.topic_tag.replace(/_/g, ' ')
      : null
    const weakScore = topWeak ? topWeak.avg_score.toFixed(1) : null

    const subject =
      tone === 'lastcall'
        ? 'Two weeks out — try a free 5-minute drill'
        : tone === 'winback'
          ? `It's been a week — your interview skills fade fast`
          : weakTopic
            ? `Time to work on your ${weakTopic} skills`
            : `Ready for your next practice interview?`

    try {
      await resend.emails.send({
        from,
        to: u.email,
        subject,
        html: reEngageHtml({ name: u.name, appUrl, weakTopic, weakScore, tone }),
      })
      sent++
    } catch { /* non-fatal */ }
    pushed += await sendPushToUser(supabase, u.id, {
      title:
        tone === 'lastcall'
          ? 'Free 5-minute drill — no credits needed'
          : tone === 'winback'
            ? 'A week without practice — jump back in'
            : weakTopic ? `Work on ${weakTopic} today` : 'Ready for your next mock interview?',
      body: weakTopic
        ? `You scored ${weakScore}/5 on ${weakTopic} — a targeted practice session today will help.`
        : 'A quick 20-minute practice session keeps you sharp.',
      url: tone === 'lastcall' ? '/drill' : '/interview/setup',
    }).catch(() => 0)
  }

  return NextResponse.json({ sent, pushed, timestamp: new Date().toISOString() })
}

function streakAtRiskHtml({ name, streak, appUrl }: { name: string; streak: number; appUrl: string }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#4f46e5;padding:32px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">🔥</div>
      <h1 style="color:white;margin:0;font-size:22px;">Your streak is at risk!</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin-bottom:16px;">Hi ${name},</p>
      <p style="color:#374151;margin-bottom:16px;">
        You're on a <strong>${streak}-day practice streak</strong> — keep it going!
        Practice one interview today to maintain your momentum.
      </p>
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
        <div style="font-size:32px;font-weight:bold;color:#92400e;">${streak} days</div>
        <div style="color:#92400e;font-size:14px;">current streak — don't break it!</div>
      </div>
      <div style="text-align:center;">
        <a href="${appUrl}/interview/setup" style="background:#4f46e5;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
          Start Today's Interview →
        </a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">InterviewAI · Practice like it's real. Perform when it matters.</p>
    </div>
  </div>
</body>
</html>`
}

function reEngageHtml({ name, appUrl, weakTopic, weakScore, tone }: {
  name: string
  appUrl: string
  weakTopic: string | null
  weakScore: string | null
  tone: 'nudge' | 'winback' | 'lastcall'
}) {
  const headline =
    tone === 'lastcall'
      ? 'Start small — a free 5-minute drill'
      : tone === 'winback'
        ? 'A week already — let\'s get you back'
        : 'Miss you! Time for a quick practice?'

  const bodyIntro =
    tone === 'lastcall'
      ? `<p style="color:#374151;margin-bottom:16px;">
  It's been two weeks since your last practice. No pressure — the Daily Drill is 3 questions,
  5 minutes, and completely free. It's the easiest way to get back into rhythm.
</p>`
      : tone === 'winback'
        ? `<p style="color:#374151;margin-bottom:16px;">
  It's been a week since your last practice interview. Interview skills are perishable —
  a single session now beats three sessions the night before the real thing.
</p>`
        : ''

  const ctaUrl = tone === 'lastcall' ? `${appUrl}/drill` : `${appUrl}/interview/setup`
  const ctaLabel = tone === 'lastcall' ? 'Try the Free Drill →' : 'Start a Practice Interview →'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#4f46e5;padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;">InterviewAI</h1>
      <p style="color:#a5b4fc;margin:8px 0 0;">${headline}</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin-bottom:16px;">Hi ${name},</p>
      ${bodyIntro}
      ${weakTopic ? `
<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin-bottom:16px;">
  <div style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:4px;">Your focus area: ${weakTopic}</div>
  <div style="font-size:13px;color:#92400e;">You scored ${weakScore}/5 on ${weakTopic} in your last session — a targeted practice today will make a real difference.</div>
</div>
` : tone === 'nudge' ? `
<p style="color:#374151;margin-bottom:16px;">
  It's been a few days since your last practice interview. The best time to sharpen your skills is before you need them — not after.
</p>
` : ''}
      <p style="color:#374151;margin-bottom:24px;">
        ${tone === 'lastcall' ? 'Five minutes. Three questions. Zero credits.' : 'Get 20 minutes of focused practice today. Your future self will thank you.'}
      </p>
      <div style="text-align:center;">
        <a href="${ctaUrl}" style="background:#4f46e5;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
          ${ctaLabel}
        </a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">InterviewAI · Practice like it's real. Perform when it matters.</p>
    </div>
  </div>
</body>
</html>`
}
