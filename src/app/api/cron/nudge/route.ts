import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  // Streak at risk: last practiced yesterday, active streak
  const { data: streakUsers } = await supabase
    .from('users')
    .select('email, name, current_streak')
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
  }

  // Re-engagement: last practiced 3 days ago
  const { data: nudgeUsers } = await supabase
    .from('users')
    .select('email, name')
    .eq('last_session_date', toDate(3))

  for (const u of nudgeUsers ?? []) {
    try {
      await resend.emails.send({
        from,
        to: u.email,
        subject: `Ready for your next practice interview?`,
        html: reEngageHtml({ name: u.name, appUrl }),
      })
      sent++
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ sent, timestamp: new Date().toISOString() })
}

function streakAtRiskHtml({ name, streak, appUrl }: { name: string; streak: number; appUrl: string }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1d4ed8;padding:32px;text-align:center;">
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
        <a href="${appUrl}/interview/setup" style="background:#1d4ed8;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
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

function reEngageHtml({ name, appUrl }: { name: string; appUrl: string }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1d4ed8;padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;">InterviewAI</h1>
      <p style="color:#93c5fd;margin:8px 0 0;">Miss you! Time for a quick practice?</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin-bottom:16px;">Hi ${name},</p>
      <p style="color:#374151;margin-bottom:16px;">
        It's been a few days since your last practice interview. The best time to sharpen your skills is before you need them — not after.
      </p>
      <p style="color:#374151;margin-bottom:24px;">
        Pick a round and get 20 minutes of focused practice today. Your future self will thank you.
      </p>
      <div style="text-align:center;">
        <a href="${appUrl}/interview/setup" style="background:#1d4ed8;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
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
