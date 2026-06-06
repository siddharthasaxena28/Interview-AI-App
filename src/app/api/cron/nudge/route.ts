import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase-server'
import { sendPushToUser } from '@/lib/push-server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  // Re-engagement: last practiced 3 days ago
  const { data: nudgeUsers } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('last_session_date', toDate(3))

  for (const u of nudgeUsers ?? []) {
    // Fetch top weak area for personalised message
    const { data: topWeak } = await supabase
      .from('weak_areas')
      .select('topic_tag, avg_score')
      .eq('user_id', u.id)
      .order('avg_score', { ascending: true })
      .limit(1)
      .maybeSingle()

    const weakTopic = topWeak
      ? topWeak.topic_tag.replace(/_/g, ' ')
      : null
    const weakScore = topWeak ? topWeak.avg_score.toFixed(1) : null

    try {
      await resend.emails.send({
        from,
        to: u.email,
        subject: weakTopic
          ? `Time to work on your ${weakTopic} skills`
          : `Ready for your next practice interview?`,
        html: reEngageHtml({ name: u.name, appUrl, weakTopic, weakScore }),
      })
      sent++
    } catch { /* non-fatal */ }
    pushed += await sendPushToUser(supabase, u.id, {
      title: weakTopic ? `Work on ${weakTopic} today` : 'Ready for your next mock interview?',
      body: weakTopic
        ? `You scored ${weakScore}/5 on ${weakTopic} — a targeted practice session today will help.`
        : 'A quick 20-minute practice session keeps you sharp.',
      url: '/interview/setup',
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

function reEngageHtml({ name, appUrl, weakTopic, weakScore }: { name: string; appUrl: string; weakTopic: string | null; weakScore: string | null }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#4f46e5;padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;">InterviewAI</h1>
      <p style="color:#a5b4fc;margin:8px 0 0;">Miss you! Time for a quick practice?</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin-bottom:16px;">Hi ${name},</p>
      ${weakTopic ? `
<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin-bottom:16px;">
  <div style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:4px;">Your focus area: ${weakTopic}</div>
  <div style="font-size:13px;color:#92400e;">You scored ${weakScore}/5 on ${weakTopic} in your last session — a targeted practice today will make a real difference.</div>
</div>
` : `
<p style="color:#374151;margin-bottom:16px;">
  It's been a few days since your last practice interview. The best time to sharpen your skills is before you need them — not after.
</p>
`}
      <p style="color:#374151;margin-bottom:24px;">
        Get 20 minutes of focused practice today. Your future self will thank you.
      </p>
      <div style="text-align:center;">
        <a href="${appUrl}/interview/setup" style="background:#4f46e5;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
          Start a Practice Interview →
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
