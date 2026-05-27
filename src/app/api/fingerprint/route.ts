import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const { visitorId } = await request.json() as { visitorId?: string }
    if (!visitorId) return NextResponse.json({ ok: false }, { status: 400 })

    const svc = await createServiceClient()
    await svc
      .from('users')
      .update({ device_fingerprint: visitorId })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
