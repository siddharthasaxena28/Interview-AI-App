import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      session_id: string
      overall_rating: number
      improvement_areas?: string
      feature_suggestions?: string
    }

    const { session_id, overall_rating, improvement_areas, feature_suggestions } = body

    if (!session_id || typeof overall_rating !== 'number' || overall_rating < 1 || overall_rating > 5) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
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

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

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
        return NextResponse.json({ error: 'Feedback table not set up yet' }, { status: 503 })
      }
      console.error('submit-feedback error:', error)
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('submit-feedback error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
