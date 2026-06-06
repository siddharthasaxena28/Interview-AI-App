/**
 * Reusable Playwright route mocking helpers.
 *
 * Each helper intercepts a specific API route and returns deterministic
 * fixture data so tests never hit real LLMs, Deepgram, ElevenLabs, or
 * Razorpay. Import and call these inside a test or beforeEach.
 */

import type { Page } from '@playwright/test'

// ── Fixtures ─────────────────────────────────────────────────────────────────

export const TEST_SESSION_ID = 'test-session-00000000-0000-0000-0000-000000000001'
export const TEST_QUESTION_ID = 'test-question-00000000-0000-0000-0000-000000000001'

export const FIXTURE_QUESTIONS = Array.from({ length: 5 }, (_, i) => ({
  id: `test-q-${i + 1}`,
  session_id: TEST_SESSION_ID,
  text: `Test question ${i + 1}: Describe your experience with system design.`,
  difficulty: i + 1,
  topic_tag: i % 2 === 0 ? 'system_design' : 'fundamentals',
  expected_keywords: i === 0 ? ['scalability', '__resume'] : ['performance'],
  order_index: i,
  asked: true,
  round_type: 'tech_l2',
}))

export const FIXTURE_ANSWERS = FIXTURE_QUESTIONS.map((q, i) => ({
  question_id: q.id,
  transcript_text: i === 0 ? '' : `I would approach this by first understanding the requirements and then designing for scalability. My experience at my previous role involved similar challenges.`,
  duration_seconds: i === 0 ? 0 : 45 + i * 10,
}))

export const FIXTURE_PER_QUESTION = FIXTURE_QUESTIONS.map((q, i) => ({
  question_id: q.id,
  score: [2, 4, 3, 5, 1][i] ?? 3,
  feedback: `Good explanation of the concept. Could elaborate more on trade-offs.`,
  ideal_answer_hint: `The ideal answer covers: scalability patterns, CAP theorem, and real-world examples.`,
}))

export const FIXTURE_REPORT = {
  id: 'test-report-1',
  session_id: TEST_SESSION_ID,
  overall_score: 72,
  selection_probability: 68,
  communication_score: 75,
  report_text: 'You demonstrated solid technical knowledge with good communication skills. Focus areas include system design depth and concise explanations.',
  strengths_json: [
    { title: 'Technical vocabulary', advice: 'Keep using precise terms.', example: 'Correctly mentioned CAP theorem.' },
    { title: 'Structured thinking', advice: 'Continue using frameworks.', example: null },
  ],
  gaps_json: [
    { title: 'System design depth', advice: 'Practice HLD diagrams.', example: 'Could have elaborated on sharding.' },
  ],
  per_question_json: FIXTURE_PER_QUESTION,
  communication_json: {
    clarity: 78, clarity_note: 'Clear and concise.',
    pacing: 72, pacing_note: 'Good pace overall.',
    confidence: 80, confidence_note: 'Confident delivery.',
    filler_words: 65, filler_note: 'Occasional "um" usage.',
  },
  share_token: 'test-share-token-abc123',
  created_at: new Date().toISOString(),
}

export const FIXTURE_SESSION = {
  id: TEST_SESSION_ID,
  user_id: 'test-user-id',
  company: 'Google',
  role: 'Senior Software Engineer',
  jd_text: 'We are looking for a Senior Software Engineer with experience in distributed systems...',
  experience_years: 5,
  round_type: 'tech_l2',
  status: 'active',
  started_at: new Date().toISOString(),
  ended_at: null,
}

// ── Route mockers ─────────────────────────────────────────────────────────────

/** Mocks POST /api/generate-questions → returns fixture questions */
export async function mockGenerateQuestions(page: Page) {
  await page.route('**/api/generate-questions', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session_id: TEST_SESSION_ID,
        questions: FIXTURE_QUESTIONS,
      }),
    })
  )
}

/** Mocks GET /api/session-data/[sessionId] → returns fixture session + questions */
export async function mockSessionData(page: Page) {
  await page.route(`**/api/session-data/${TEST_SESSION_ID}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: FIXTURE_SESSION,
        questions: FIXTURE_QUESTIONS,
      }),
    })
  )
}

/** Mocks POST /api/evaluate-answer → returns a fixed score + next question */
export async function mockEvaluateAnswer(page: Page) {
  let callCount = 0
  await page.route('**/api/evaluate-answer', route => {
    callCount++
    const nextQ = FIXTURE_QUESTIONS[callCount] ?? null
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 4,
        feedback: 'Good answer. You covered the main points clearly.',
        ideal_answer_hint: 'A strong answer also mentions trade-offs.',
        spoken_response: 'Good answer.',
        next_question: nextQ,
        questions_remaining: nextQ ? FIXTURE_QUESTIONS.length - callCount : 0,
        is_probe: false,
      }),
    })
  })
}

/** Mocks POST /api/generate-feedback → returns fixture report */
export async function mockGenerateFeedback(page: Page) {
  await page.route('**/api/generate-feedback', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ report: FIXTURE_REPORT }),
    })
  )
}

/** Mocks GET /api/feedback-report/[sessionId] → returns fixture report */
export async function mockFeedbackReport(page: Page) {
  await page.route(`**/api/feedback-report/${TEST_SESSION_ID}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_REPORT),
    })
  )
}

/** Mocks ElevenLabs TTS → returns a tiny silent MP3 instead of real audio */
export async function mockTTS(page: Page) {
  // Silence the ElevenLabs endpoint
  await page.route('**/api.elevenlabs.io/**', route => route.fulfill({ status: 200, body: Buffer.alloc(0) }))
  // Also silence the Next.js TTS proxy if there is one
  await page.route('**/api/tts', route => route.fulfill({ status: 200, body: Buffer.alloc(0) }))
}

/** Mocks Deepgram WebSocket — page.evaluate shim so the session page never opens a real WS */
export async function mockDeepgram(page: Page) {
  await page.route('**/api.deepgram.com/**', route => route.abort())
  // Inject a WebSocket shim so the session page's wsRef setup doesn't throw
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket
    // @ts-ignore
    window.WebSocket = function (url: string, protocols?: string | string[]) {
      if (url.includes('deepgram')) {
        const mock = {
          readyState: 1, // OPEN
          send: () => {},
          close: () => {},
          addEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
          onopen: null as ((ev: Event) => void) | null,
          onclose: null as ((ev: CloseEvent) => void) | null,
          onmessage: null as ((ev: MessageEvent) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
          url,
          protocol: '',
          extensions: '',
          bufferedAmount: 0,
          binaryType: 'blob' as BinaryType,
        }
        // Trigger onopen asynchronously so the session page transitions to ready state
        setTimeout(() => { if (mock.onopen) mock.onopen(new Event('open')) }, 100)
        return mock
      }
      return new OriginalWebSocket(url, protocols)
    } as unknown as typeof WebSocket
  })
}

/** Mocks navigator.mediaDevices.getUserMedia → returns a silent audio track */
export async function mockUserMedia(page: Page) {
  await page.addInitScript(() => {
    const silence = () => {
      const ctx = new AudioContext()
      const dest = ctx.createMediaStreamDestination()
      const osc = ctx.createOscillator()
      osc.connect(dest)
      return dest.stream
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: async () => silence(),
        enumerateDevices: async () => [],
      },
    })
  })
}

/** Mocks POST /api/create-order (Razorpay) → returns a fake order */
export async function mockCreateOrder(page: Page) {
  await page.route('**/api/create-order', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'order_test123',
        amount: 49900,
        currency: 'INR',
        key: 'rzp_test_placeholder',
      }),
    })
  )
}

/** Mocks POST /api/drill-evaluate → returns a fixed drill score */
export async function mockDrillEvaluate(page: Page) {
  await page.route('**/api/drill-evaluate', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 4,
        one_line: 'Good answer covering the main concepts.',
        missing: 'Consider mentioning time complexity trade-offs.',
      }),
    })
  )
}

/** Mocks POST /api/drill-questions → returns 3 drill questions */
export async function mockDrillQuestions(page: Page) {
  await page.route('**/api/drill-questions', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        questions: [
          { id: 'dq1', text: 'Explain the difference between a stack and a queue.', topicTag: 'data_structures', difficulty: 2, roundType: 'tech_l1' },
          { id: 'dq2', text: 'What is the time complexity of binary search?', topicTag: 'algorithms', difficulty: 2, roundType: 'tech_l1' },
          { id: 'dq3', text: 'Describe a situation where you optimised a slow database query.', topicTag: 'databases', difficulty: 3, roundType: 'tech_l1' },
        ],
        personalized: false,
      }),
    })
  )
}

/** Mocks POST /api/interview-coach (SSE stream) → streams a one-line reply */
export async function mockCoachChat(page: Page) {
  await page.route('**/api/interview-coach', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"text":"Great question! "}',
        'data: {"text":"Your answer on Q1 was strong. "}',
        'data: {"text":"Focus on adding concrete examples."}',
        'data: [DONE]',
      ].join('\n\n') + '\n\n',
    })
  )
}

/** Skips the test if auth storage state is empty (no credentials in CI) */
export function requireAuth() {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const authFile = path.join(__dirname, '../../playwright/.auth/user.json')
  if (!fs.existsSync(authFile)) return false
  const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'))
  return Array.isArray(state.cookies) && state.cookies.length > 0
}
