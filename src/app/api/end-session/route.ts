import { NextResponse } from 'next/server'
import { withAuth, apiError } from '@/lib/api-handler'

export const POST = withAuth('end-session', async ({ request, user, supabase }) => {
  const { session_id } = await request.json() as { session_id: string }

  const { data } = await supabase
    .from('interview_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .select('id')

  if (!data?.length) {
    return apiError('Session not found or already ended', 404)
  }

  return NextResponse.json({ success: true })
})
