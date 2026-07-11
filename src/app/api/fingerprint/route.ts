import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { withAuth } from '@/lib/api-handler'

export const POST = withAuth('fingerprint', async ({ request, user }) => {
  const { visitorId } = await request.json() as { visitorId?: string }
  if (!visitorId) return NextResponse.json({ ok: false }, { status: 400 })

  const svc = await createServiceClient()
  await svc
    .from('users')
    .update({ device_fingerprint: visitorId })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
})
