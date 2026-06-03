import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Cached at module scope — project ID never changes per deployment
let cachedProjectId: string | null = null

async function getProjectId(apiKey: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId

  // Allow explicit override (useful for multi-project accounts)
  if (process.env.DEEPGRAM_PROJECT_ID) {
    cachedProjectId = process.env.DEEPGRAM_PROJECT_ID
    return cachedProjectId
  }

  const res = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Deepgram projects fetch failed: ${res.status}`)
  const data = await res.json() as { projects?: Array<{ project_id: string }> }
  const id = data.projects?.[0]?.project_id
  if (!id) throw new Error('No Deepgram projects found')
  cachedProjectId = id
  return id
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      console.error('DEEPGRAM_API_KEY is not set')
      return NextResponse.json({ error: 'Speech recognition not configured' }, { status: 503 })
    }

    try {
      const projectId = await getProjectId(apiKey)
      const res = await fetch(
        `https://api.deepgram.com/v1/projects/${projectId}/keys`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: 'interview-session',
            // usage:write is the only scope needed for live transcription.
            // Scoping prevents a leaked token from touching billing, keys, or project settings.
            scopes: ['usage:write'],
            // 2 hours covers the full interview + reconnects without needing a re-fetch
            time_to_live_in_seconds: 7200,
          }),
        }
      )

      if (res.ok) {
        const { key } = await res.json() as { key: string }
        return NextResponse.json({ key })
      }

      // Log the full Deepgram error so it's visible in server logs / Vercel Functions.
      const errBody = await res.text().catch(() => '(unreadable)')
      console.error('Deepgram key creation failed status=%s body=%s', res.status, errBody)

      // 403 means the master key lacks keys:write permission.
      // Do NOT fall back to the master key — it has full account access.
      // Fix: create a Deepgram API key with the "Member" or "Admin" role in the dashboard.
      if (res.status === 403) {
        console.error('Deepgram key lacks keys:write — create a Member/Admin API key in the Deepgram dashboard.')
      }
    } catch (err) {
      console.warn('Deepgram temp key error:', err)
    }

    return NextResponse.json(
      { error: 'Speech recognition temporarily unavailable. Please retry.' },
      { status: 503 },
    )
  } catch {
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 })
  }
}
