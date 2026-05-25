import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const key = process.env.DEEPGRAM_API_KEY
    if (!key) {
      console.error('DEEPGRAM_API_KEY is not set')
      return NextResponse.json({ error: 'Speech recognition not configured' }, { status: 503 })
    }

    return NextResponse.json({ key })
  } catch {
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 })
  }
}
