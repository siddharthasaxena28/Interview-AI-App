import crypto from 'crypto'

export interface NormalizedPhone {
  // E.164, e.g. "+919876543210" — stored on the user row and shown back to them.
  e164: string
  // MSG91 format: country code + number, no "+", e.g. "919876543210".
  msg91: string
}

// Accepts the common ways an Indian mobile gets typed (+91…, 91…, 0…, bare
// 10-digit) and returns canonical forms, or null if it isn't a valid Indian
// mobile (10 digits starting 6-9).
export function normalizeIndianPhone(input: string): NormalizedPhone | null {
  if (!input) return null
  let digits = input.replace(/\D/g, '')

  // Strip country code / trunk prefixes down to the bare 10-digit subscriber number.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  if (!/^[6-9]\d{9}$/.test(digits)) return null

  return { e164: `+91${digits}`, msg91: `91${digits}` }
}

// Salted SHA-256 of the E.164 number. The pepper means a leak of phone_claims
// (hashes only) can't be reversed via a precomputed table of phone numbers.
export function hashPhone(e164: string): string {
  const pepper = process.env.PHONE_HASH_SECRET ?? ''
  return crypto.createHmac('sha256', pepper).update(e164).digest('hex')
}
