# InterviewAI — Complete Technical Guide

> This document is the single source of truth for the InterviewAI app. It contains enough detail to recreate the app from scratch.

---

## 1. App Overview

| Field | Value |
|---|---|
| **Product name** | InterviewAI |
| **Purpose** | AI-powered voice mock interview platform for the Indian job market |
| **Target users** | Indian software engineers preparing for tech, managerial, and HR rounds |
| **Monetisation** | Pay-as-you-go credits + Razorpay subscriptions; 1 free credit on signup via phone verification |
| **Production URL** | interview-ai-app-one.vercel.app |
| **Repository** | siddharthasaxena28/Interview-AI-App (GitHub) |

---

## 2. User Journey

```
Landing (/)
  └─ Google OAuth sign-in (/auth/login)
       └─ Dashboard (/dashboard)
            ├─ Free Daily Drill (/drill) — 3 questions, 5 min, no credits
            └─ Start Interview
                 └─ Setup (/interview/setup)
                      Paste JD + company + role + round type + optional resume
                      └─ Briefing (/interview/briefing/[sessionId])
                           Choose interviewer gender (male/female), mic check
                           └─ Live Session (/interview/session/[sessionId])
                                Deepgram WebSocket STT → Claude AI → ElevenLabs TTS
                                └─ Feedback (/interview/feedback/[sessionId])
                                     Score rings · Strengths/Gaps · Per-question breakdown
                                     AI coach chat · Shareable report link
                                          └─ Dashboard (weak areas + streak updated)
```

**Round types:** `tech_l1` · `tech_l2` · `managerial` · `hr` · `full_loop`

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 14.2.18 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^3.4.1 |
| UI Components | Radix UI (10 primitives) + lucide-react | — |
| Database + Auth | Supabase (PostgreSQL + RLS + Google OAuth) | @supabase/supabase-js ^2.47.2 |
| AI / LLM | Anthropic Claude (claude-sonnet-4-6) | @anthropic-ai/sdk ^0.36.3 |
| Speech-to-Text | Deepgram WebSocket API (Nova-2 model) | token-based, no SDK |
| Text-to-Speech | ElevenLabs REST API | direct fetch, no SDK |
| Payment | Razorpay (INR, UPI, cards) | razorpay ^2.9.5 |
| Email | Resend | resend ^4.0.1 |
| Analytics | PostHog | posthog-js ^1.376.0 |
| Error Tracking | Sentry | @sentry/nextjs ^10.53.1 |
| Push Notifications | Web Push API (VAPID) | web-push ^3.6.7 |
| Anti-abuse | FingerprintJS + phone OTP | @fingerprintjs/fingerprintjs ^5.2.0 |
| Resume Parsing | pdf-parse + mammoth | ^2.4.5 / ^1.12.0 |
| Deployment | Vercel (GitHub auto-deploy) | — |
| PWA | Service Worker (public/sw.js) | — |

**Radix UI primitives used:** accordion, avatar, dialog, dropdown-menu, label, progress, select, separator, slot, tabs, toast

**Utility libraries:** class-variance-authority, clsx, tailwind-merge, tailwindcss-animate

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / PWA                             │
│  Next.js App Router (React 18, TypeScript)                       │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────────┐   │
│  │ Landing      │  │ Dashboard   │  │ Interview Session    │   │
│  │ /pricing     │  │ /account    │  │ Deepgram WS (STT)    │   │
│  │ /drill       │  │ /org        │  │ ElevenLabs TTS       │   │
│  └──────────────┘  └─────────────┘  └──────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                   VERCEL SERVERLESS (Next.js API Routes)         │
│                                                                  │
│  /api/generate-questions  ──►  Anthropic Claude                 │
│  /api/evaluate-answer     ──►  Anthropic Claude                 │
│  /api/generate-feedback   ──►  Anthropic Claude                 │
│  /api/interview-intro     ──►  Anthropic Claude                 │
│  /api/study-plan          ──►  Anthropic Claude                 │
│  /api/interview-coach     ──►  Anthropic Claude                 │
│  /api/tts                 ──►  ElevenLabs REST API              │
│  /api/deepgram-token      ──►  Deepgram REST API                │
│  /api/create-order        ──►  Razorpay API                     │
│  /api/verify-payment      ──►  Razorpay API                     │
│  /api/webhook/razorpay    ◄──  Razorpay webhooks               │
│  /api/parse-resume        ──►  pdf-parse / mammoth              │
│  /api/push/*              ──►  Web Push API                     │
│  /api/cron/nudge          ◄──  Vercel Cron (daily)             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Supabase JS SDK
┌──────────────────────────▼──────────────────────────────────────┐
│                    SUPABASE (PostgreSQL + Auth)                   │
│                                                                  │
│  Tables: users · interview_sessions · questions · answers        │
│          feedback_reports · credit_transactions · weak_areas     │
│          referrals · subscriptions · phone_claims                │
│          push_subscriptions · organization_members               │
│                                                                  │
│  Auth: Google OAuth via Supabase Auth                            │
│  Security: Row Level Security (RLS) on all tables                │
└─────────────────────────────────────────────────────────────────┘
```

**External services summary:**

| Service | Purpose |
|---|---|
| Anthropic API | Question generation, answer scoring, feedback, coach, study plan |
| ElevenLabs API | Indian-accented TTS voices (paid plan required) |
| Deepgram API | Real-time speech-to-text via WebSocket |
| Razorpay API | INR payments, subscriptions, webhooks |
| PostHog Cloud | Event analytics |
| Sentry Cloud | Error + performance monitoring |
| Resend | Transactional email (feedback report delivery) |

---

## 5. Database Schema

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | FK → auth.users |
| email | text | |
| name | text | |
| avatar_url | text | Google profile photo |
| credit_balance | int | Default 1 (free signup credit) |
| plan | text | 'free' \| 'payg' |
| referral_code | text unique | Auto-generated on signup |
| current_streak | int | Days in a row |
| longest_streak | int | |
| last_session_date | date | For streak calculation |
| phone_verified | bool | Anti-abuse flag |
| device_fingerprint | text | FingerprintJS hash |
| created_at | timestamptz | |

### interview_sessions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | → users |
| company | text | |
| role | text | |
| jd_text | text | Job description pasted by user |
| experience_years | int | |
| round_type | text | tech_l1 \| tech_l2 \| managerial \| hr \| full_loop |
| status | text | setup \| in_progress \| completed \| abandoned |
| started_at | timestamptz | |
| ended_at | timestamptz | |
| created_at | timestamptz | |

### questions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | → interview_sessions |
| text | text | Question text |
| round_type | text | |
| difficulty | int | 1–5 |
| topic_tag | text | e.g. "system-design", "leadership" |
| order_index | int | Order within session |
| asked | bool | Default false |

### answers
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | |
| question_id | uuid FK | → questions |
| transcript_text | text | Deepgram transcript |
| duration_seconds | int | |
| score | int | 1–5 (Claude-scored) |
| recorded_at | timestamptz | |

### feedback_reports
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK unique | |
| overall_score | int | 0–100 |
| selection_probability | text | e.g. "High", "Medium" |
| strengths_json | jsonb | Array of {title, example, advice} |
| gaps_json | jsonb | Array of {title, example, advice} |
| per_question_json | jsonb | Array of {question_id, score, feedback, ideal_answer_hint} |
| communication_json | jsonb | {score, clarity, pacing, confidence, filler_words} |
| report_text | text | Full markdown report |
| share_token | text unique | For public /report/[token] page |
| emailed_at | timestamptz | Null until emailed |

### credit_transactions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| amount | int | Positive = credit, negative = debit |
| type | text | signup \| purchase \| referral \| session_use \| subscription |
| session_id | uuid FK nullable | |
| razorpay_payment_id | text nullable | |
| created_at | timestamptz | |

### weak_areas
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| topic_tag | text | |
| avg_score | float | Rolling average |
| session_count | int | |
| last_updated | timestamptz | |

### referrals
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| referrer_id | uuid FK | → users |
| referee_id | uuid FK | → users |
| status | text | pending \| completed |
| completed_at | timestamptz | |
| created_at | timestamptz | |

### subscriptions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| plan | text | Plan identifier |
| status | text | active \| cancelled \| expired |
| razorpay_sub_id | text | Razorpay subscription ID |
| current_period_end | timestamptz | |
| credits_per_cycle | int | Credits added each renewal |
| created_at | timestamptz | |

### phone_claims *(anti-abuse)*
| Column | Type | Notes |
|---|---|---|
| phone_hash | text PK | SHA-256 of phone number |
| user_id | uuid FK | |
| claimed_at | timestamptz | One free credit per phone |

### push_subscriptions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| endpoint | text | Push service URL |
| keys_p256dh | text | ECDH public key |
| keys_auth | text | Auth secret |
| created_at | timestamptz | |

### organization_members *(RLS-protected, admin only)*
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK | |
| org_id | uuid FK | |
| role | text | admin \| member |

---

## 6. All API Routes

| Method | Route | Purpose | Auth Required |
|---|---|---|---|
| GET | /api/account-data | User plan, credits, email | ✓ |
| POST | /api/delete-account | GDPR account deletion + cascade | ✓ |
| POST | /api/fingerprint | Store device fingerprint | ✓ |
| POST | /api/generate-questions | 15 JD-personalized questions via Claude | ✓ |
| POST | /api/evaluate-answer | Score answer, decide probe/advance via Claude | ✓ |
| POST | /api/generate-feedback | Full 7-section feedback report via Claude | ✓ |
| POST | /api/end-session | Mark session completed, trigger feedback | ✓ |
| POST | /api/interview-intro | Generate interviewer intro reaction via Claude | ✓ |
| POST | /api/tts | ElevenLabs TTS → audio/mpeg response | ✓ |
| GET | /api/deepgram-token | Short-lived Deepgram token for browser WebSocket | ✓ |
| GET | /api/drill-questions | 3 daily drill questions (no credit deducted) | ✓ |
| POST | /api/drill-evaluate | Score drill answer via Claude | ✓ |
| POST | /api/create-order | Create Razorpay order | ✓ |
| POST | /api/verify-payment | Verify Razorpay signature + top up credits | ✓ |
| POST | /api/webhook/razorpay | Razorpay subscription renewal webhook | public (signature-verified) |
| POST | /api/parse-resume | PDF/DOCX/Google Drive link → plain text | ✓ |
| GET | /api/session-data/[sessionId] | Questions + progress for live session | ✓ |
| POST | /api/submit-feedback | NPS/satisfaction survey submission | ✓ |
| POST | /api/study-plan | AI-personalized study plan via Claude | ✓ |
| POST | /api/interview-coach | AI coach follow-up Q&A in feedback page | ✓ |
| POST | /api/push/subscribe | Store browser Web Push subscription | ✓ |
| GET | /api/cron/nudge | Daily push notification cron job | CRON_SECRET header |
| GET | /api/test-tts | ElevenLabs diagnostic — key validity + model check | none |
| GET | /api/debug-voices | Voice list + model availability debug | none |

---

## 7. Environment Variables

Set all of these in Vercel → Settings → Environment Variables for Production + Preview.

### Supabase
```
NEXT_PUBLIC_SUPABASE_URL          # Project URL (safe for client)
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Anon/public key (safe for client)
SUPABASE_SERVICE_ROLE_KEY         # Service role key — server only, bypasses RLS
```

### Anthropic
```
ANTHROPIC_API_KEY                 # Claude API key from console.anthropic.com
```

### ElevenLabs *(paid plan required — Starter $5/mo+)*
```
ELEVENLABS_API_KEY                # API key — must be from paid account
ELEVENLABS_VOICE_TECH_L1          # Aarav J voice ID (Tech L1 — male)
ELEVENLABS_VOICE_TECH_L1_F        # Priya voice ID (Tech L1 — female)
ELEVENLABS_VOICE_TECH_L2          # Akshay voice ID (Tech L2 — male)
ELEVENLABS_VOICE_TECH_L2_F        # Riya Rao voice ID (Tech L2 — female)
ELEVENLABS_VOICE_MANAGERIAL       # Vikram voice ID (Managerial — male)
ELEVENLABS_VOICE_MANAGERIAL_F     # Shakuntala voice ID (Managerial — female)
ELEVENLABS_VOICE_HR               # Aakash Aryan voice ID (HR — male)
ELEVENLABS_VOICE_HR_F             # Ayesha voice ID (HR — female)
```

### Deepgram
```
DEEPGRAM_API_KEY                  # Speech-to-text API key from deepgram.com
```

### Razorpay
```
RAZORPAY_KEY_ID                   # Public key ID
RAZORPAY_KEY_SECRET               # Secret key — server only
NEXT_PUBLIC_RAZORPAY_KEY_ID       # Same as RAZORPAY_KEY_ID but exposed to browser
```

### Resend (email)
```
RESEND_API_KEY                    # From resend.com — used for feedback report emails
```

### PostHog (analytics)
```
NEXT_PUBLIC_POSTHOG_KEY           # PostHog project API key
NEXT_PUBLIC_POSTHOG_HOST          # https://app.posthog.com (or EU endpoint)
```

### Sentry (error tracking)
```
NEXT_PUBLIC_SENTRY_DSN            # DSN from sentry.io project
SENTRY_AUTH_TOKEN                 # For source map upload during build
```

### Web Push (push notifications)
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY      # Generate with: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY                 # Server only
VAPID_SUBJECT                     # mailto:your@email.com
```

### Cron
```
CRON_SECRET                       # Random secret to authenticate /api/cron/nudge
```

---

## 8. Key Implementation Details

### Live Interview Session Flow
1. Page loads → `GET /api/session-data/[sessionId]` fetches questions
2. Interviewer intro text → `POST /api/tts` → ElevenLabs audio plays
3. `GET /api/deepgram-token` → browser opens Deepgram WebSocket
4. User speaks → transcript streams in real-time
5. Silence detected → transcript sent to `POST /api/evaluate-answer` → Claude returns score + next action (probe / advance / end)
6. Next question text → `POST /api/tts` → audio plays → loop
7. All questions done → `POST /api/end-session` → feedback generated async via `waitUntil`
8. User redirected to `/interview/feedback/[sessionId]` → polls until report ready

### Audio State Machine (`src/hooks/useAudioStateMachine.ts`)
```
IDLE → AI_SPEAKING → LISTENING → USER_SPEAKING → PROCESSING → IDLE
```
Guards prevent simultaneous TTS playback and microphone recording.

### TTS Voice Selection (`src/app/api/tts/route.ts`)
- Reads voice ID directly from env var (`ELEVENLABS_VOICE_*`) — no account lookup
- Falls back to browser `window.speechSynthesis` if ElevenLabs returns any error
- **ElevenLabs free tier cannot use Voice Library voices via API** — Starter plan ($5/mo) minimum required

### Credit System
- 1 free credit on signup (enforced by `phone_claims` table — 1 per phone number)
- 1 credit deducted per completed interview session
- Referral bonus: both referrer and referee get credits when referee completes first interview
- `credit_transactions` table is the ledger; `users.credit_balance` is the running total
- Top-up via Razorpay → `/api/verify-payment` → atomic credit update

### Feedback Report Structure (7 sections, generated by Claude)
1. Overall score (0–100) + selection probability label
2. Top 3 strengths — title, example from transcript, reinforcement advice
3. Top 3 gaps — title, example from transcript, improvement advice
4. Communication quality — clarity, pacing, confidence, filler word count
5. Topic performance — scores per topic_tag
6. Per-question breakdown — score + feedback + ideal answer hint
7. Next steps — personalised study plan

### Interviewer Personas (`src/lib/personas.ts`)
Each round type has a named male and female interviewer with a distinct style:

| Round | Male | Female |
|---|---|---|
| tech_l1 | Aarav J | Priya |
| tech_l2 | Akshay | Riya Rao |
| managerial | Vikram | Shakuntala |
| hr | Aakash Aryan | Ayesha |
| full_loop | Aarav J | Priya |

---

## 9. File Structure

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                              # Landing page (hero, features, pricing CTA, stats)
│   │   ├── layout.tsx                            # Root layout — metadata, PWA, fonts, analytics
│   │   ├── globals.css                           # CSS variables, dark theme, scrollbar
│   │   ├── providers.tsx                         # PostHog + Sentry client-side wrapper
│   │   ├── PWARegister.tsx                       # Service worker registration component
│   │   ├── robots.ts                             # SEO robots.txt
│   │   ├── sitemap.ts                            # SEO sitemap
│   │   ├── auth/login/page.tsx                   # Google OAuth sign-in page
│   │   ├── pricing/page.tsx                      # Razorpay payment plans
│   │   ├── practice/page.tsx                     # SEO practice guide index
│   │   ├── practice/[slug]/page.tsx              # Individual practice guide
│   │   ├── privacy/page.tsx                      # Privacy policy
│   │   ├── terms/page.tsx                        # Terms of service
│   │   ├── report/[token]/page.tsx               # Public shareable feedback report
│   │   ├── report/[token]/opengraph-image.tsx    # Dynamic OG image for shared reports
│   │   ├── drill/page.tsx                        # Free daily drill (3 q, 5 min, no credits)
│   │   ├── dashboard/
│   │   │   ├── page.tsx                          # Main dashboard (stats, history, widgets)
│   │   │   ├── OnboardingModal.tsx               # First-time user welcome modal
│   │   │   ├── UserMenu.tsx                      # Profile dropdown (settings, logout)
│   │   │   ├── CopyReferral.tsx                  # Referral link copy widget
│   │   │   ├── EnableReminders.tsx               # Push notification opt-in
│   │   │   ├── FingerprintCapture.tsx            # Browser fingerprint collection
│   │   │   ├── InterviewCountdown.tsx            # Interview date countdown (localStorage)
│   │   │   └── StudyPlanWidget.tsx               # AI study plan based on weak areas
│   │   ├── interview/
│   │   │   ├── setup/page.tsx                    # 3-step setup (JD, company/role, round type)
│   │   │   ├── briefing/[sessionId]/
│   │   │   │   ├── page.tsx                      # Interviewer persona + gender selector
│   │   │   │   └── MicCheckGate.tsx              # Mic permission check before interview
│   │   │   └── session/[sessionId]/
│   │   │       └── page.tsx                      # Live voice interview (main session page)
│   │   ├── interview/feedback/[sessionId]/
│   │   │   ├── page.tsx                          # Feedback page (server component, data fetch)
│   │   │   ├── FeedbackClient.tsx                # Client polling + UI controller
│   │   │   ├── ScoreRing.tsx                     # Circular SVG score ring
│   │   │   ├── ScoreCard.tsx                     # Downloadable PNG scorecard
│   │   │   ├── FeedbackPerQuestion.tsx           # Per-question accordion breakdown
│   │   │   ├── CoachChat.tsx                     # AI coach chat widget
│   │   │   └── AppFeedbackWidget.tsx             # NPS/satisfaction survey
│   │   ├── account/page.tsx                      # Account (plan, credits, referral, delete)
│   │   ├── org/page.tsx                          # Org cohort analytics (admin only)
│   │   └── api/                                  # (see API Routes section)
│   │       └── ...
│   ├── hooks/
│   │   ├── useAudioStateMachine.ts               # Interview audio lifecycle state machine
│   │   └── useAnalytics.ts                       # PostHog event tracking wrapper
│   ├── lib/
│   │   ├── utils.ts                              # cn(), formatDuration(), getScoreColor(), generateShareToken()
│   │   ├── personas.ts                           # Interviewer persona definitions + speech styles
│   │   ├── audio-storage.ts                      # IndexedDB helpers for answer audio
│   │   ├── practice-content.ts                   # SEO practice guide content array
│   │   ├── drill-questions.ts                    # 60+ curated free drill questions
│   │   ├── supabase.ts                           # Client-side Supabase instance
│   │   ├── supabase-server.ts                    # Server-side Supabase instance (SSR)
│   │   ├── database.types.ts                     # Auto-generated from Supabase schema
│   │   ├── push-client.ts                        # Web Push subscribe (browser)
│   │   ├── push-server.ts                        # Web Push dispatch (server)
│   │   └── rate-limit.ts                         # Per-endpoint rate limiting
│   ├── types/
│   │   └── index.ts                              # All TypeScript interfaces and enums
│   └── middleware.ts                             # Auth guard — protects /dashboard /interview /account /org
├── supabase/
│   ├── schema.sql                                # Full database schema (run first)
│   └── migrations/                              # 14 incremental migration SQL files
│       ├── anti_abuse_migration.sql
│       ├── atomic_credits_and_subscriptions_migration.sql
│       ├── cleanup_weak_areas_tags.sql
│       ├── communication_json_migration.sql
│       ├── organizations_migration.sql
│       ├── payment_idempotency_migration.sql
│       ├── performance_and_security_migration.sql
│       ├── push_subscriptions_migration.sql
│       ├── referrals_migration.sql
│       ├── restore_signup_credit_migration.sql
│       ├── security_hardening_migration.sql
│       ├── streak_migration.sql
│       ├── user_feedback_migration.sql
│       └── (apply in chronological order)
├── public/
│   ├── icon.svg                                  # App icon (SVG)
│   ├── icon-192.png                              # PWA icon 192×192
│   ├── icon-maskable.svg                         # Adaptive icon for Android
│   ├── manifest.webmanifest                      # PWA manifest
│   └── sw.js                                     # Service worker (cache + push notifications)
├── next.config.ts                                # experimental.instrumentationHook, canvas alias
├── tailwind.config.ts                            # Custom colors, animations, border-radius
├── tsconfig.json
└── package.json
```

---

## 10. Styling Tokens (Tailwind)

**Custom Colors:**
- `surface` → `#111118` (card background)
- `surface-2` → `#13131f` (alternate surface)
- `surface-3` → `#1a1a2e` (deep surface)
- `indigo-accent` → `#6366f1` (primary CTA)
- `violet-accent` → `#8b5cf6` (secondary accent)
- `border-subtle` → `rgba(255,255,255,0.06)` (card borders)

**Page background:** `#0a0a0f` (near-black)

**Custom Animations:** pulse-ring, shimmer, fadeIn, slideUp, float, glow, gradient-shift

**CSS Variables (HSL):** background 240 10% 4%, primary 239 84% 67% (indigo), secondary 263 70% 65% (violet)

---

## 11. Third-Party Service Setup (from scratch)

| Service | Steps |
|---|---|
| **Supabase** | Create project → run `supabase/schema.sql` → run migrations in order → Auth → Google provider → copy URL + anon key + service role key |
| **Anthropic** | console.anthropic.com → API keys → create key |
| **ElevenLabs** | elevenlabs.io → **upgrade to Starter plan ($5/mo minimum)** → Voices → Voice Library → add: Aarav J, Priya, Akshay, Riya Rao, Vikram, Shakuntala, Aakash Aryan, Ayesha → copy API key + each voice ID |
| **Deepgram** | deepgram.com → create project → API keys → create key |
| **Razorpay** | razorpay.com → create account → Settings → API Keys → copy Key ID + Secret → Webhooks → add `https://your-domain/api/webhook/razorpay` |
| **Resend** | resend.com → create account → verify domain → API Keys → create key |
| **PostHog** | app.posthog.com → create project → copy API key |
| **Sentry** | sentry.io → new project → Next.js → copy DSN + auth token |
| **Web Push VAPID** | Run: `npx web-push generate-vapid-keys` → copy both keys + set VAPID_SUBJECT to `mailto:you@yourdomain.com` |
| **Google OAuth** | Supabase dashboard → Authentication → Providers → Google → enable → copy client ID/secret from Google Cloud Console → add redirect URI: `https://your-supabase-project.supabase.co/auth/v1/callback` |
| **Vercel** | Connect GitHub repo → add all env vars → deploy |

---

## 12. Deployment

- **Platform:** Vercel
- **Branch:** `main` → auto-deploys to production
- **Production URL:** interview-ai-app-one.vercel.app
- **Build command:** `next build` (default)
- **Node version:** 20
- **Cron job:** `/api/cron/nudge` runs daily — configure in Vercel dashboard under Cron Jobs with `CRON_SECRET` header

To deploy from scratch:
1. Push repo to GitHub
2. Import in Vercel → connect repo
3. Add all environment variables
4. Deploy

---

## 13. Pending Features Before Final Launch

### Critical — blocking launch

- [ ] **Email feedback report** — `Resend` is integrated and `emailed_at` column exists in `feedback_reports`, but the logic to send the email after report generation is not wired. Need to call Resend in `/api/generate-feedback` after saving the report.

- [ ] **Phone OTP verification** — `phone_claims` table and `phone_verified` field on `users` exist. Anti-abuse DB is ready. The UI form and `/api/verify-phone` endpoint (OTP send + verify) are not built. Required to gate the free signup credit to 1 per phone number.

- [ ] **Razorpay subscription auto-renewal** — `/api/webhook/razorpay` exists and `subscriptions` table has `credits_per_cycle`. The logic to top up `credit_balance` on each renewal event is not implemented in the webhook handler.

### Important — quality and growth

- [ ] **Onboarding modal persistence** — `OnboardingModal.tsx` exists but it's unclear whether the target interview date and target role fields write back to the database. Verify and wire up.

- [ ] **Push notification personalisation** — `/api/cron/nudge` exists and sends a generic nudge. It should read each user's `current_streak` and top `weak_areas` to send a personalised message.

- [ ] **Scorecard LinkedIn/WhatsApp share** — `ScoreCard.tsx` generates a downloadable PNG. The share buttons for LinkedIn and WhatsApp are UI-only; the actual `share_token` link needs to be embedded in the card image and share URLs wired up.

- [ ] **Organisation dashboard** — `/org/page.tsx` exists with RLS protection. Data aggregation queries for cohort-level analytics (average scores, completion rates, topic breakdowns) may not be complete.

- [ ] **Google Drive resume parsing** — `/api/parse-resume` has Drive URL detection code but the Google OAuth token flow to access private Drive files is not implemented. Currently only works for public Drive links or direct PDF upload.

- [ ] **Referral credit disbursement edge cases** — The referral flow should only disburse the referrer's bonus after the referee completes their first interview (not just on signup). Verify this gate is enforced.

### Nice to have — post-launch

- [ ] Video recording of interview session (MediaRecorder → store in Supabase Storage)
- [ ] Calendar/Google Calendar integration for interview date countdown
- [ ] Community leaderboard / score benchmarking
- [ ] Hindi UI language option
- [ ] Company-specific question banks (beyond JD parsing)
- [ ] Resume gap analysis section in feedback report
- [ ] Bulk interview invite for organisations (org admin sends link to candidates)

---

## 14. Key Files Quick Reference

| What you're looking for | File |
|---|---|
| Interview session (voice, STT, TTS, Claude) | `src/app/interview/session/[sessionId]/page.tsx` |
| TTS voice selection | `src/app/api/tts/route.ts` |
| Question generation prompt | `src/app/api/generate-questions/route.ts` |
| Answer evaluation + scoring | `src/app/api/evaluate-answer/route.ts` |
| Feedback report generation | `src/app/api/generate-feedback/route.ts` |
| Interviewer personas + voices | `src/lib/personas.ts` |
| All TypeScript types | `src/types/index.ts` |
| Database types (auto-generated) | `src/lib/database.types.ts` |
| Auth middleware | `src/middleware.ts` |
| Credit deduction logic | `src/app/api/end-session/route.ts` |
| Payment + credit top-up | `src/app/api/verify-payment/route.ts` |
| Full DB schema | `supabase/schema.sql` |
