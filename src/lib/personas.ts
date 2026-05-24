import type { InterviewerPersona, RoundType } from '@/types'

export const PERSONAS: Record<RoundType, InterviewerPersona> = {
  tech_l1: {
    roundType: 'tech_l1',
    maleName: 'Arjun',
    femaleName: 'Priya',
    appearance: 'Casual, 28–32',
    style: 'Friendly, encouraging, fundamentals-focused. Difficulty 1–3.',
    voiceId: process.env.ELEVENLABS_VOICE_TECH_L1 || 'default',
    difficulty: '1-3',
  },
  tech_l2: {
    roundType: 'tech_l2',
    maleName: 'Rahul',
    femaleName: 'Sneha',
    appearance: 'Smart casual, 34–40',
    style: 'Direct, probing, system design and architecture. Difficulty 3–5.',
    voiceId: process.env.ELEVENLABS_VOICE_TECH_L2 || 'default',
    difficulty: '3-5',
  },
  managerial: {
    roundType: 'managerial',
    maleName: 'Vikram',
    femaleName: 'Ananya',
    appearance: 'Formal blazer, 42–50',
    style: 'Authoritative, strategic, STAR method, leadership scenarios.',
    voiceId: process.env.ELEVENLABS_VOICE_MANAGERIAL || 'default',
    difficulty: '3-5',
  },
  hr: {
    roundType: 'hr',
    maleName: 'Rohan',
    femaleName: 'Kavya',
    appearance: 'Business casual, 30–38',
    style: 'Warm, conversational, culture fit, CTC, notice period.',
    voiceId: process.env.ELEVENLABS_VOICE_HR || 'default',
    difficulty: '1-3',
  },
  full_loop: {
    roundType: 'full_loop',
    maleName: 'Arjun',
    femaleName: 'Priya',
    appearance: 'Various',
    style: 'Full interview loop covering all rounds in sequence.',
    voiceId: process.env.ELEVENLABS_VOICE_TECH_L1 || 'default',
    difficulty: '1-5',
  },
}

export function getPersona(roundType: RoundType, gender: 'male' | 'female' = 'male') {
  const persona = PERSONAS[roundType]
  return {
    ...persona,
    name: gender === 'male' ? persona.maleName : persona.femaleName,
  }
}

export function getRoundLabel(roundType: RoundType): string {
  const labels: Record<RoundType, string> = {
    tech_l1: 'Technical Round 1',
    tech_l2: 'Technical Round 2',
    managerial: 'Managerial Round',
    hr: 'HR Round',
    full_loop: 'Full Interview Loop',
  }
  return labels[roundType]
}

export function getRoundDuration(roundType: RoundType): number {
  if (roundType === 'full_loop') return 60
  return 30
}
