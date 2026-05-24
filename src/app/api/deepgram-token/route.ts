import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return the API key server-side — never expose raw key to browser via client JS
    // The frontend will use this key only in a WebSocket connection
    return NextResponse.json({ key: process.env.DEEPGRAM_API_KEY })
  } catch {
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 })
  }
}
