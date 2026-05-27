// OTP generation, signing, and verification helpers.
// Delivery is via Resend email (already in the stack, free tier, no registration needed).
//
// Required env:
//   RESEND_API_KEY      — already set (used for welcome emails)
//   RESEND_FROM_EMAIL   — already set (e.g. "InterviewAI <noreply@interviewai.in>")
//   PHONE_HASH_SECRET   — peppers both phone hashes and OTP token signatures

import crypto from 'crypto'
import { Resend } from 'resend'

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

export function otpConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.PHONE_HASH_SECRET)
}

// Cryptographically random 6-digit OTP.
export function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999))
}

// Signs {email, otp, exp} into a tamper-proof token — no DB row needed.
// Token = base64url(payload) + "." + HMAC-SHA256(base64url(payload), secret)
export function signOtpToken(email: string, otp: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, otp, exp: Date.now() + OTP_TTL_MS })
  ).toString('base64url')
  const secret = process.env.PHONE_HASH_SECRET!
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyOtpToken(
  token: string,
  email: string,
  otp: string
): { ok: true } | { ok: false; error: string } {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return { ok: false, error: 'Invalid verification session' }

    const secret = process.env.PHONE_HASH_SECRET!
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, error: 'Invalid verification session' }
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      email: string; otp: string; exp: number
    }

    if (Date.now() > data.exp) return { ok: false, error: 'Code has expired. Request a new one.' }
    if (data.email !== email) return { ok: false, error: 'Email mismatch' }
    if (data.otp !== otp) return { ok: false, error: 'Incorrect code' }

    return { ok: true }
  } catch {
    return { ok: false, error: 'Invalid verification session' }
  }
}

// Sends the OTP to the user's email via Resend.
export async function sendOtpEmail(
  toEmail: string,
  otp: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const from = process.env.RESEND_FROM_EMAIL ?? 'InterviewAI <noreply@interviewai.in>'
    const { error } = await resend.emails.send({
      from,
      to: toEmail,
      subject: `${otp} — your InterviewAI verification code`,
      html: buildOtpHtml(otp),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    console.error('sendOtpEmail error:', err)
    return { ok: false, error: 'Failed to send verification email' }
  }
}

function buildOtpHtml(otp: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#1d4ed8;padding:24px 32px;">
      <h1 style="color:white;margin:0;font-size:20px;">InterviewAI</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin:0 0 8px;">Your verification code is:</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1d4ed8;margin:16px 0 24px;">${otp}</div>
      <p style="color:#6b7280;font-size:14px;margin:0;">This code expires in 10 minutes. Do not share it with anyone.</p>
    </div>
  </div>
</body>
</html>`
}
