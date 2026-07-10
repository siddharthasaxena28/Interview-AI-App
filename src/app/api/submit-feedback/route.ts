import { NextResponse } from 'next/server'
import { withAuth, apiError } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export const POST = withAuth('submit-feedback', async ({ request, user, supabase }) => {
  const body = await request.json() as {
    session_id: string
    overall_rating: number
    improvement_areas?: string
    feature_suggestions?: string
  }

  const { session_id, overall_rating, improvement_areas, feature_suggestions } = body

  if (!session_id || typeof overall_rating !== 'number' || overall_rating < 1 || overall_rating > 5) {
    return apiError('Invalid payload', 400)
  }

  // Cap free-text fields so a client can't store multi-MB blobs (DB-bloat abuse).
  const MAX_LEN = 2000
  const improvement = improvement_areas?.trim().slice(0, MAX_LEN) || null
  const suggestions = feature_suggestions?.trim().slice(0, MAX_LEN) || null

  // Verify the session belongs to this user
  const { data: session } = await supabase
    .from('interview_sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return apiError('Session not found', 404)

  // Upsert so re-submission updates rather than duplicates
  const { error } = await supabase
    .from('user_feedback')
    .upsert(
      {
        user_id: user.id,
        session_id,
        overall_rating,
        improvement_areas: improvement,
        feature_suggestions: suggestions,
      },
      { onConflict: 'session_id' }
    )

  if (error) {
    // Gracefully handle missing unique constraint (migration not yet run)
    if (error.code === '42P01') {
      return apiError('Feedback table not set up yet', 503)
    }
    console.error('submit-feedback error:', error)
    return apiError('Failed to save feedback', 500)
  }

  return NextResponse.json({ success: true })
})
