// Thin wrapper over Fast2SMS bulk/OTP API.
// We generate the OTP ourselves (server-side), sign it into a short-lived HMAC
// token, and verify the token on the next call — no extra DB table needed.
//
// Required env:
//   FAST2SMS_API_KEY   — from fast2sms.com dashboard → Dev API

import crypto from 'crypto'

const BASE = 'https://www.fast2sms.com/dev/bulkV2'
const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function fast2smsConfigured(): boolean {
  return !!(process.env.FAST2SMS_API_KEY && process.env.PHONE_HASH_SECRET)
}

// Generates a cryptographically random 6-digit OTP string.
export function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999))
}

// Signs {e164, otp, exp} into a tamper-proof token so we don't need a DB row.
// Token = base64url(payload) + "." + HMAC-SHA256(base64url(payload), secret)
export function signOtpToken(e164: string, otp: string): string {
  const payload = Buffer.from(
    JSON.stringify({ phone: e164, otp, exp: Date.now() + OTP_TTL_MS })
  ).toString('base64url')
  const secret = process.env.PHONE_HASH_SECRET!
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// Verifies the token and returns the payload if valid, or null if tampered/expired.
export function verifyOtpToken(
  token: string,
  e164: string,
  otp: string
): { ok: true } | { ok: false; error: string } {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return { ok: false, error: 'Invalid code session' }

    const secret = process.env.PHONE_HASH_SECRET!
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, error: 'Invalid code session' }
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      phone: string; otp: string; exp: number
    }

    if (Date.now() > data.exp) return { ok: false, error: 'Code has expired. Request a new one.' }
    if (data.phone !== e164) return { ok: false, error: 'Phone number mismatch' }
    if (data.otp !== otp) return { ok: false, error: 'Incorrect code' }

    return { ok: true }
  } catch {
    return { ok: false, error: 'Invalid code session' }
  }
}

type F2SResponse = { return?: boolean; request_id?: string; message?: string | string[] }

// Sends the OTP SMS via Fast2SMS dedicated OTP route.
// This route uses Fast2SMS's pre-registered DLT template so delivery works
// without any DLT registration on your end. The message sent is:
// "Your OTP is {otp}. Please do not share this OTP with anyone. - FSTSMS"
// numbers: 10-digit Indian mobile (no country code).
export async function sendOtp(
  tenDigitNumber: string,
  otp: string
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({
    authorization: process.env.FAST2SMS_API_KEY!,
    route: 'otp',
    variables_values: otp,
    flash: '0',
    numbers: tenDigitNumber,
  })

  try {
    const res = await fetch(`${BASE}?${params}`, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    })
    const body = (await res.json()) as F2SResponse
    if (body.return === true) return { ok: true }
    const errMsg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Failed to send OTP')
    return { ok: false, error: errMsg }
  } catch {
    return { ok: false, error: 'SMS delivery failed. Please try again.' }
  }
}
