import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let configured: boolean | null = null

/** Configure web-push from env once. Returns false if VAPID keys are absent. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@interviewai.in'
  if (!pub || !priv) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

/**
 * Send a push notification to every subscription a user has.
 * No-ops (returns 0) when VAPID keys aren't configured. Prunes dead subscriptions.
 * Pass a service-role Supabase client so RLS doesn't hide other users' rows.
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!ensureConfigured()) return 0

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) return 0

  let sent = 0
  for (const s of subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
      sent++
    } catch (err) {
      // 404/410 mean the subscription is gone — clean it up.
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
  }
  return sent
}
