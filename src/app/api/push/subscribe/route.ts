import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sub = await request.json().catch(() => null) as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | null

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
