export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          avatar_url: string | null
          credit_balance: number
          plan: string
          referral_code: string
          created_at: string
          current_streak: number
          longest_streak: number
          last_session_date: string | null
        }
        Insert: {
          id?: string
          email: string
          name: string
          avatar_url?: string | null
          credit_balance?: number
          plan?: string
          referral_code?: string
          created_at?: string
          current_streak?: number
          longest_streak?: number
          last_session_date?: string | null
        }
        Update: {
          id?: string
          email?: string
          name?: string
          avatar_url?: string | null
          credit_balance?: number
          plan?: string
          referral_code?: string
          created_at?: string
          current_streak?: number
          longest_streak?: number
          last_session_date?: string | null
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan: string
          status: string
          razorpay_sub_id: string
          current_period_end: string
          credits_per_cycle: number
        }
        Insert: {
          id?: string
          user_id: string
          plan: string
          status: string
          razorpay_sub_id: string
          current_period_end: string
          credits_per_cycle: number
        }
        Update: {
          id?: string
          user_id?: string
          plan?: string
          status?: string
          razorpay_sub_id?: string
          current_period_end?: string
          credits_per_cycle?: number
        }
      }
      credit_transactions: {
        Row: {
          id: string
          user_id: string
          amount: number
          type: string
          session_id: string | null
          razorpay_payment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          type: string
          session_id?: string | null
          razorpay_payment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          type?: string
          session_id?: string | null
          razorpay_payment_id?: string | null
          created_at?: string
        }
      }
      interview_sessions: {
        Row: {
          id: string
          user_id: string
          company: string
          role: string
          jd_text: string
          experience_years: number
          round_type: string
          status: string
          started_at: string | null
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company: string
          role: string
          jd_text: string
          experience_years: number
          round_type: string
          status?: string
          started_at?: string | null
          ended_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          company?: string
          role?: string
          jd_text?: string
          experience_years?: number
          round_type?: string
          status?: string
          started_at?: string | null
          ended_at?: string | null
        }
      }
      questions: {
        Row: {
          id: string
          session_id: string
          text: string
          round_type: string
          difficulty: number
          topic_tag: string
          order_index: number
          asked: boolean
        }
        Insert: {
          id?: string
          session_id: string
          text: string
          round_type: string
          difficulty: number
          topic_tag: string
          order_index: number
          asked?: boolean
        }
        Update: {
          id?: string
          session_id?: string
          text?: string
          round_type?: string
          difficulty?: number
          topic_tag?: string
          order_index?: number
          asked?: boolean
        }
      }
      answers: {
        Row: {
          id: string
          session_id: string
          question_id: string
          transcript_text: string
          duration_seconds: number
          score: number | null
          recorded_at: string
        }
        Insert: {
          id?: string
          session_id: string
          question_id: string
          transcript_text: string
          duration_seconds?: number
          score?: number | null
          recorded_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          question_id?: string
          transcript_text?: string
          duration_seconds?: number
          score?: number | null
          recorded_at?: string
        }
      }
      feedback_reports: {
        Row: {
          id: string
          session_id: string
          overall_score: number
          selection_probability: number
          strengths_json: Json
          gaps_json: Json
          per_question_json: Json
          communication_score: number
          report_text: string
          share_token: string
          emailed_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          overall_score: number
          selection_probability: number
          strengths_json: Json
          gaps_json: Json
          per_question_json: Json
          communication_score: number
          report_text: string
          share_token?: string
          emailed_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          overall_score?: number
          selection_probability?: number
          strengths_json?: Json
          gaps_json?: Json
          per_question_json?: Json
          communication_score?: number
          report_text?: string
          share_token?: string
          emailed_at?: string | null
        }
      }
      weak_areas: {
        Row: {
          id: string
          user_id: string
          topic_tag: string
          avg_score: number
          session_count: number
          last_updated: string
        }
        Insert: {
          id?: string
          user_id: string
          topic_tag: string
          avg_score: number
          session_count?: number
          last_updated?: string
        }
        Update: {
          id?: string
          user_id?: string
          topic_tag?: string
          avg_score?: number
          session_count?: number
          last_updated?: string
        }
      }
      referrals: {
        Row: {
          id: string
          referrer_id: string
          referee_id: string
          status: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          referrer_id: string
          referee_id: string
          status?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          referrer_id?: string
          referee_id?: string
          status?: string
          completed_at?: string | null
          created_at?: string
        }
      }
    }
  }
}
