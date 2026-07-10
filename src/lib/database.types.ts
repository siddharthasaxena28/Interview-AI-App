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
          phone_number: string | null
          phone_number_hash: string | null
          phone_verified: boolean
          device_fingerprint: string | null
          free_credit_claimed: boolean
          last_otp_sent_at: string | null
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
          phone_number?: string | null
          phone_number_hash?: string | null
          phone_verified?: boolean
          device_fingerprint?: string | null
          free_credit_claimed?: boolean
          last_otp_sent_at?: string | null
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
          phone_number?: string | null
          phone_number_hash?: string | null
          phone_verified?: boolean
          device_fingerprint?: string | null
          free_credit_claimed?: boolean
          last_otp_sent_at?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
          expected_keywords: string[]
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
          expected_keywords?: string[]
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
          expected_keywords?: string[]
        }
        Relationships: []
      }
      answers: {
        Row: {
          id: string
          session_id: string
          question_id: string
          transcript_text: string
          duration_seconds: number
          score: number | null
          confidence: string | null
          recorded_at: string
        }
        Insert: {
          id?: string
          session_id: string
          question_id: string
          transcript_text: string
          duration_seconds?: number
          score?: number | null
          confidence?: string | null
          recorded_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          question_id?: string
          transcript_text?: string
          duration_seconds?: number
          score?: number | null
          confidence?: string | null
          recorded_at?: string
        }
        Relationships: []
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
          communication_json: Json | null
          red_flags_json: Json | null
          standout_moments_json: Json | null
          selection_factors_json: Json | null
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
          communication_json?: Json | null
          red_flags_json?: Json | null
          standout_moments_json?: Json | null
          selection_factors_json?: Json | null
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
          communication_json?: Json | null
          red_flags_json?: Json | null
          standout_moments_json?: Json | null
          selection_factors_json?: Json | null
          report_text?: string
          share_token?: string
          emailed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'feedback_reports_session_id_fkey'
            columns: ['session_id']
            isOneToOne: true
            referencedRelation: 'interview_sessions'
            referencedColumns: ['id']
          },
        ]
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
        Relationships: []
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
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          type?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          created_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          id: string
          user_id: string | null
          session_id: string | null
          overall_rating: number
          improvement_areas: string | null
          feature_suggestions: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          session_id?: string | null
          overall_rating: number
          improvement_areas?: string | null
          feature_suggestions?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          session_id?: string | null
          overall_rating?: number
          improvement_areas?: string | null
          feature_suggestions?: string | null
          created_at?: string
        }
        Relationships: []
      }
      phone_claims: {
        Row: {
          phone_number_hash: string
          first_claimed_by: string
          device_fingerprint: string | null
          claimed_at: string
        }
        Insert: {
          phone_number_hash: string
          first_claimed_by: string
          device_fingerprint?: string | null
          claimed_at?: string
        }
        Update: {
          phone_number_hash?: string
          first_claimed_by?: string
          device_fingerprint?: string | null
          claimed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_user_credits: {
        Args: { p_user_id: string; p_amount: number }
        Returns: undefined
      }
      upsert_weak_area: {
        Args: { p_user_id: string; p_topic_tag: string; p_session_avg: number }
        Returns: undefined
      }
      complete_referral: {
        Args: { p_referee_id: string }
        Returns: undefined
      }
      get_selection_probability_benchmark: {
        Args: { p_round_type: string }
        Returns: { avg_probability: number; sample_size: number }[]
      }
      start_interview_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
