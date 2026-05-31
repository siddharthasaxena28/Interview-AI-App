import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Quick diagnostic — returns which voice IDs are configured server-side.
// Accessible only to authenticated users. Remove this route after debugging.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    tech_l1:    { male: process.env.ELEVENLABS_VOICE_TECH_L1    ?? '(not set)', female: process.env.ELEVENLABS_VOICE_TECH_L1_F    ?? '(not set)' },
    tech_l2:    { male: process.env.ELEVENLABS_VOICE_TECH_L2    ?? '(not set)', female: process.env.ELEVENLABS_VOICE_TECH_L2_F    ?? '(not set)' },
    managerial: { male: process.env.ELEVENLABS_VOICE_MANAGERIAL ?? '(not set)', female: process.env.ELEVENLABS_VOICE_MANAGERIAL_F ?? '(not set)' },
    hr:         { male: process.env.ELEVENLABS_VOICE_HR         ?? '(not set)', female: process.env.ELEVENLABS_VOICE_HR_F         ?? '(not set)' },
    api_key_set: !!process.env.ELEVENLABS_API_KEY,
  })
}
