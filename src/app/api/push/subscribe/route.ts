import { NextResponse } from 'next/server'
import { withAuth, apiError } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// Push endpoints are later POSTed to server-side by the cron sender. Restrict them
// to the real push-service hosts so a stored endpoint can't point at an internal
// address (SSRF) like 169.254.169.254 or localhost.
const EXACT_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])
function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return false
    return EXACT_PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith('.notify.windows.com')
  } catch {
    return false
  }
}

export const POST = withAuth('push-subscribe', async ({ request, user, supabase }) => {
  const sub = await request.json().catch(() => null) as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | null

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return apiError('Invalid subscription', 400)
  }

  if (!isAllowedPushEndpoint(sub.endpoint)) {
    return apiError('Invalid push endpoint', 400)
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      { onConflict: 'endpoint' }
    )

  if (error) {
    return apiError('Failed to save subscription', 500)
  }

  return NextResponse.json({ ok: true })
})
