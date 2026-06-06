/**
 * Feedback / report page tests — requires auth.
 *
 * Verifies: score rings render, per-question breakdown works, full transcript
 * collapsible opens, AI coach chat sends a message, résumé badges show,
 * weak-topic drill CTA links to /drill, LinkedIn share URL is set.
 */

import { test, expect, Page } from '@playwright/test'
import {
  FIXTURE_QUESTIONS,
  FIXTURE_ANSWERS,
  FIXTURE_REPORT,
  TEST_SESSION_ID,
  mockCoachChat,
  requireAuth,
} from './helpers/mock-routes'

test.beforeAll(() => {
  if (!requireAuth()) test.skip()
})

async function mockFeedbackPage(page: Page) {
  // Mock session query
  await page.route(`**/rest/v1/interview_sessions*`, route => {
    const url = route.request().url()
    if (url.includes(TEST_SESSION_ID)) {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{
          id: TEST_SESSION_ID,
          user_id: 'test-user',
          company: 'Google',
          role: 'Senior Software Engineer',
          round_type: 'tech_l2',
          started_at: new Date().toISOString(),
          status: 'completed',
        }]),
      })
    } else {
      route.continue()
    }
  })

  // Mock questions
  await page.route('**/rest/v1/questions*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(FIXTURE_QUESTIONS),
    })
  )

  // Mock answers
  await page.route('**/rest/v1/answers*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(FIXTURE_ANSWERS),
    })
  )

  // Mock feedback_reports
  await page.route('**/rest/v1/feedback_reports*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([FIXTURE_REPORT]),
    })
  )
}

test.describe('Interview Feedback', () => {
  test('renders overall score, selection probability, and communication score', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')

    // The three score rings should show values
    await expect(page.getByText(/72|overall score/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/68%|selection/i)).toBeVisible()
    await expect(page.getByText(/75|communication/i)).toBeVisible()
  })

  test('shows benchmark comparison band', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/above average|below average|industry average/i)).toBeVisible({ timeout: 15_000 })
  })

  test('overall assessment text is displayed', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/solid technical knowledge/i)).toBeVisible({ timeout: 15_000 })
  })

  test('strengths and focus areas sections are visible', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/top strengths/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/focus areas/i)).toBeVisible()
    // Fixture strength title
    await expect(page.getByText(/technical vocabulary/i)).toBeVisible()
  })

  test('per-question breakdown expands to show feedback', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    // Expand first question
    await page.getByRole('button', { name: /Q1/i }).first().click()
    await expect(page.getByText(/good explanation|coach feedback/i)).toBeVisible({ timeout: 5_000 })
  })

  test('weak question (score ≤ 3) shows drill CTA linking to /drill', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    // Expand the question with score=1 (last fixture question) or score=2 (first)
    // First question has score 2 — find and expand it
    await page.getByRole('button', { name: /expand all/i }).click()
    // Drill CTA should be visible
    const drillLink = page.getByRole('link', { name: /drill.*free/i }).first()
    await expect(drillLink).toBeVisible({ timeout: 5_000 })
    const href = await drillLink.getAttribute('href')
    expect(href).toMatch(/\/drill\?filter=/)
  })

  test('résumé badge shows on resume-based question', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    // First fixture question has __resume keyword
    await expect(page.getByText(/from résumé/i)).toBeVisible({ timeout: 10_000 })
  })

  test('full transcript collapsible opens and shows Q&A', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    // Open the transcript collapsible
    const transcriptToggle = page.getByRole('button', { name: /full interview transcript/i })
    await transcriptToggle.click()
    // Question text should now be visible
    await expect(page.getByText(/test question 1/i)).toBeVisible({ timeout: 5_000 })
  })

  test('Share Report button contains correct share URL', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    const shareLink = page.getByRole('link', { name: /share report/i })
    await expect(shareLink).toBeVisible({ timeout: 10_000 })
    const href = await shareLink.getAttribute('href')
    expect(href).toMatch(/\/report\/test-share-token-abc123/)
  })

  test('Practice Again button links to /interview/setup', async ({ page }) => {
    await mockFeedbackPage(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
    const practiceBtn = page.getByRole('link', { name: /practice again/i })
    await expect(practiceBtn).toBeVisible({ timeout: 10_000 })
    await expect(practiceBtn).toHaveAttribute('href', '/interview/setup')
  })

  test('AI coach chat sends message and streams reply', async ({ page }) => {
    await mockFeedbackPage(page)
    await mockCoachChat(page)
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')

    // Find coach chat input
    const chatInput = page.getByRole('textbox', { name: /ask.*coach|message/i })
      .or(page.getByPlaceholder(/ask.*coach|message/i))
    await chatInput.waitFor({ state: 'visible', timeout: 15_000 })
    await chatInput.fill('Why did I score 2 on question 1?')

    const sendBtn = page.getByRole('button', { name: /send/i })
    await sendBtn.click()

    // Coach reply should appear
    await expect(page.getByText(/great question|your answer|focus on/i)).toBeVisible({ timeout: 15_000 })
  })

  test('feedback loading state shows skeleton while report is generating', async ({ page }) => {
    // Return no report initially
    await page.route('**/rest/v1/feedback_reports*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )
    await page.route('**/rest/v1/interview_sessions*', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{
          id: TEST_SESSION_ID,
          company: 'Google',
          role: 'Engineer',
          round_type: 'tech_l2',
          status: 'completed',
        }]),
      })
    )
    await page.goto(`/interview/feedback/${TEST_SESSION_ID}`)
    // Loading skeleton or spinner should be visible
    await expect(
      page.locator('[class*="animate-pulse"]').first()
        .or(page.locator('[class*="animate-spin"]').first())
    ).toBeVisible({ timeout: 10_000 })
  })
})
