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

      console.warn('Deepgram temp key creation failed (%s), falling back to master key', res.status)
    } catch (err) {
      console.warn('Deepgram temp key error, falling back to master key:', err)
    }

    // Fallback: return master key so the interview still works if Deepgram's
    // key-management API is unavailable. Log a warning so it gets noticed.
    console.warn('[security] Returning Deepgram master key — temp key creation failed')
    return NextResponse.json({ key: apiKey })
  } catch {
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 })
  }
}
