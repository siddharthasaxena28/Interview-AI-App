import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PERSONA_SPEECH_STYLE } from '@/lib/personas'
import type { RoundType } from '@/types'

const client = new Anthropic()

const INTRO_SYSTEM_PROMPT = `You are a warm, human interviewer making small talk at the very start of a live voice interview, BEFORE the real questions begin. You speak out loud — your reply will be read aloud by a text-to-speech voice, so it must sound like natural spoken conversation, never written text.

Hard rules:
- Speak in 1-2 short sentences. Conversational, never scripted.
- React GENUINELY to what the candidate actually just said. Reference something specific. Never use empty filler like "Good to know" or "That's great to hear" that ignores their actual words.
- Match your persona's speaking style (given in the user message).
- Do NOT evaluate, judge, or give feedback. This is friendly small talk.
- Do NOT use markdown, emojis, bullet points, or stage directions. Plain spoken words only.

Return ONLY a JSON object: { "spoken": "<your spoken reply>" }`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { step, transcript, round_type, role, company } = await request.json() as {
      step: 1 | 3
      transcript: string
      round_type: RoundType
      role: string
      company: string
    }

    if (step !== 1 && step !== 3) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    const personaStyle = PERSONA_SPEECH_STYLE[round_type] ?? 'Professional and conversational.'

    const userPrompt = step === 1
      ? `Your speaking style: ${personaStyle}

You just asked the candidate "How are you feeling today?" and they replied:
"${transcript || '[no clear reply]'}"

Reply out loud:
1. React genuinely to how they're feeling — reassure them if they sound nervous, share their energy if they're excited, acknowledge warmly otherwise. Respond to what they ACTUALLY said.
2. Then, in the same breath, ask them for a brief introduction: their background, experience, and what drew them to apply for the ${role} role at ${company}.`
      : `Your speaking style: ${personaStyle}

The candidate just gave their self-introduction:
"${transcript || '[no clear reply]'}"

Reply out loud:
1. React genuinely to something SPECIFIC they just mentioned (a skill, a past company, their years of experience, their motivation) so they can tell you were actually listening.
2. Then add a short, natural bridge into the interview (e.g. "let's dive in" / "let's get started"). Do NOT ask an interview question yourself — another question will follow immediately after you speak.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{ type: 'text', text: INTRO_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let spoken = ''
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content.text) as { spoken?: string }
      spoken = (parsed.spoken ?? '').trim()
    } catch {
      spoken = ''
    }

    return NextResponse.json({ spoken })
  } catch (error) {
    console.error('interview-intro error:', error)
    // Non-fatal: the client falls back to a scripted line so the interview never stalls.
    return NextResponse.json({ spoken: '' })
  }
}
