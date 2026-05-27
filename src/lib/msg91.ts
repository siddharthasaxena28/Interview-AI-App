// Thin wrapper over MSG91's v5 OTP API. MSG91 owns OTP generation, delivery,
// expiry and retry limits — we only kick off a send and ask it to verify, so we
// never store or compare OTPs ourselves.
//
// Required env:
//   MSG91_AUTH_KEY          — account auth key
//   MSG91_OTP_TEMPLATE_ID   — DLT-approved OTP template id (defines the SMS text + sender)

const BASE = 'https://control.msg91.com/api/v5/otp'

export function msg91Configured(): boolean {
  return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID)
}

type Msg91Response = { type?: string; message?: string }

async function parse(res: Response): Promise<Msg91Response> {
  try {
    return (await res.json()) as Msg91Response
  } catch {
    return {}
  }
}

// Triggers an OTP SMS to the given mobile (MSG91 format, e.g. "919876543210").
export async function sendOtp(mobile: string): Promise<{ ok: boolean; error?: string }> {
  const authkey = process.env.MSG91_AUTH_KEY!
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID!
  const url = `${BASE}?template_id=${encodeURIComponent(templateId)}&mobile=${encodeURIComponent(mobile)}&otp_length=6&otp_expiry=5`

  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey, 'Content-Type': 'application/json' },
  })
  const body = await parse(res)
  if (res.ok && body.type === 'success') return { ok: true }
  return { ok: false, error: body.message || 'Failed to send OTP' }
}

// Asks MSG91 to verify the OTP the user entered for this mobile.
export async function verifyOtp(mobile: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const authkey = process.env.MSG91_AUTH_KEY!
  const url = `${BASE}/verify?mobile=${encodeURIComponent(mobile)}&otp=${encodeURIComponent(otp)}`

  const res = await fetch(url, { method: 'GET', headers: { authkey } })
  const body = await parse(res)
  if (res.ok && body.type === 'success') return { ok: true }
  return { ok: false, error: body.message || 'Incorrect or expired code' }
}
