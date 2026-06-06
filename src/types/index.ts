export type Plan = 'free' | 'payg'
export type RoundType = 'tech_l1' | 'tech_l2' | 'managerial' | 'hr' | 'full_loop'
export type SessionStatus = 'setup' | 'in_progress' | 'completed' | 'abandoned'
export type TransactionType = 'signup' | 'purchase' | 'referral' | 'session_use'

export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  credit_balance: number
  plan: Plan
  referral_code: string
  created_at: string
  current_streak: number
  longest_streak: number
  last_session_date: string | null
}

export interface CreditTransaction {
  id: string
  user_id: string
  amount: number
  type: TransactionType
  session_id: string | null
  created_at: string
}

export interface InterviewSession {
  id: string
  user_id: string
  company: string
  role: string
  jd_text: string
  experience_years: number
  round_type: RoundType
  status: SessionStatus
  started_at: string | null
  ended_at: string | null
}

export interface Question {
  id: string
  session_id: string
  text: string
  round_type: RoundType
  difficulty: number
  topic_tag: string
  expected_keywords?: string[]
  order_index: number
  asked: boolean
}

export interface Answer {
  id: string
  session_id: string
  question_id: string
  transcript_text: string
  duration_seconds: number
  score: number | null
  recorded_at: string
}

export interface StrengthItem {
  title: string
  example: string
  advice: string
}

export interface GapItem {
  title: string
  example: string
  advice: string
}

export interface PerQuestionFeedback {
  question_id: string
  score: number
  feedback: string
  ideal_answer_hint?: string
}

export interface CommunicationFeedback {
  score: number
  clarity: number
  clarity_note?: string
  pacing: number
  pacing_note?: string
  confidence: number
  confidence_note?: string
  filler_words: number
  filler_note?: string
}

export interface FeedbackReport {
  id: string
  session_id: string
  overall_score: number
  selection_probability: number
  strengths_json: StrengthItem[]
  gaps_json: GapItem[]
  per_question_json: PerQuestionFeedback[]
  communication_score: number
  communication_json: CommunicationFeedback | null
  report_text: string
  share_token: string
  emailed_at: string | null
}

export interface FeedbackJSON {
  overall_score: number
  selection_probability: number
  strengths: StrengthItem[]
  gaps: GapItem[]
  per_question: PerQuestionFeedback[]
  communication: CommunicationFeedback
  summary: string
}

export interface InterviewerPersona {
  roundType: RoundType
  maleName: string
  femaleName: string
  appearance: string
  style: string
  voiceId: string
  femaleVoiceId?: string
  difficulty: string
}

export type AudioState = 'IDLE' | 'AI_SPEAKING' | 'LISTENING' | 'USER_SPEAKING' | 'PROCESSING'

export interface SetupFormData {
  jd_text: string
  company: string
  role: string
  experience_years: number
  round_type: RoundType
}

export interface GenerateQuestionsResponse {
  session_id: string
  questions: Question[]
}
