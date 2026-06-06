/**
 * Interview session page tests — requires auth.
 *
 * Deepgram WebSocket and ElevenLabs TTS are mocked so tests never touch
 * real external services. getUserMedia is shimmed to return a silent stream.
 *
 * Covers: page load, intro phase, begin interview, listening controls
 * (Mute / Done / Skip / End), question display, résumé badge, waveform.
 */

import { test, expect } from '@playwright/test'
import {
  mockSessionData,
  mockEvaluateAnswer,
  mockTTS,
  mockDeepgram,
  mockUserMedia,
  TEST_SESSION_ID,
  requireAuth,
} from './helpers/mock-routes'

test.beforeAll(() => {
  if (!requireAuth()) test.skip()
})

test.describe('Interview Session', () => {
  async function gotoSession(page: Parameters<typeof mockSessionData>[0]) {
    await mockSessionData(page)
    await mockEvaluateAnswer(page)
    await mockTTS(page)
    await mockDeepgram(page)
    await mockUserMedia(page)
    // Also mock the interview-intro endpoint
    await page.route('**/api/interview-intro', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spoken: 'Hello, welcome.' }) })
    )
    await page.goto(`/interview/session/${TEST_SESSION_ID}`)
    await page.waitForLoadState('networkidle')
  }

  test('page loads with dark background and intro state', async ({ page }) => {
    await gotoSession(page)
    // Session page should have dark background (bg-[#0f0f1a])
    const bg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    )
    // Not white — should be dark
    expect(bg).not.toBe('rgb(255, 255, 255)')
    // "Begin Interview" button should be visible in intro phase
    await expect(
      page.getByRole('button', { name: /begin|start interview|ready/i })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('shows question counter in header', async ({ page }) => {
    await gotoSession(page)
    // Q counter or "Intro" badge should be visible
    await expect(
      page.getByText(/Q\d+\/\d+|intro/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('shows company and role in header', async ({ page }) => {
    await gotoSession(page)
    await expect(page.getByText(/Google/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Senior Software Engineer/i)).toBeVisible()
  })

  test('Begin Interview button starts the interview', async ({ page }) => {
    await gotoSession(page)
    const beginBtn = page.getByRole('button', { name: /begin|start interview|ready/i })
    await beginBtn.click()
    // After beginning, interview controls should appear (Mute, End Interview)
    await expect(
      page.getByRole('button', { name: /mute|unmute/i })
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /end interview/i })
    ).toBeVisible()
  })

  test('Done and Skip buttons visible during listening phase', async ({ page }) => {
    await gotoSession(page)
    await page.getByRole('button', { name: /begin|start interview|ready/i }).click()

    // Wait for interview phase to begin (controls appear)
    await expect(
      page.getByRole('button', { name: /end interview/i })
    ).toBeVisible({ timeout: 15_000 })

    // The session page transitions to LISTENING after the AI speaks (mocked).
    // Since TTS is mocked with empty response, it should transition quickly.
    // Done and Skip appear in LISTENING/USER_SPEAKING states.
    await expect(
      page.getByRole('button', { name: /done/i })
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByRole('button', { name: /skip/i })
    ).toBeVisible()
  })

  test('Mute toggles to Unmute', async ({ page }) => {
    await gotoSession(page)
    await page.getByRole('button', { name: /begin|start interview|ready/i }).click()
    const muteBtn = page.getByRole('button', { name: /mute/i })
    await muteBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await muteBtn.click()
    await expect(
      page.getByRole('button', { name: /unmute/i })
    ).toBeVisible({ timeout: 5_000 })
  })

  test('current question text is displayed in the card', async ({ page }) => {
    await gotoSession(page)
    await page.getByRole('button', { name: /begin|start interview|ready/i }).click()
    // After the intro, a question card with text should appear
    await expect(
      page.getByText(/test question \d+|describe your experience/i)
    ).toBeVisible({ timeout: 20_000 })
  })

  test('résumé badge shows on resume-based question', async ({ page }) => {
    await gotoSession(page)
    await page.getByRole('button', { name: /begin|start interview|ready/i }).click()
    // Question 1 has __resume in expected_keywords
    await expect(
      page.getByText(/from your résumé|from your resume/i)
    ).toBeVisible({ timeout: 20_000 })
  })

  test('waveform bars render in interview phase', async ({ page }) => {
    await gotoSession(page)
    await page.getByRole('button', { name: /begin|start interview|ready/i }).click()
    // Wait for listening state
    await expect(
      page.getByRole('button', { name: /done/i })
    ).toBeVisible({ timeout: 20_000 })
    // Waveform bars exist (data-bar attribute)
    const bars = page.locator('[data-bar]')
    await expect(bars.first()).toBeVisible()
    expect(await bars.count()).toBeGreaterThanOrEqual(20)
  })

  test('End Interview button shows confirmation and ends session', async ({ page }) => {
    await mockSessionData(page)
    await mockEvaluateAnswer(page)
    await mockTTS(page)
    await mockDeepgram(page)
    await mockUserMedia(page)
    // Mock the end-interview API
    await page.route('**/api/end-interview', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    )
    await page.route('**/api/generate-feedback', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    )
    await page.goto(`/interview/session/${TEST_SESSION_ID}`)

    // Navigate to feedback or confirm end — depends on whether session has questions answered
    await page.getByRole('button', { name: /end interview/i }).waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('button', { name: /end interview/i }).click()
    // Should eventually navigate away from the session page
    await expect(page).not.toHaveURL(
      new RegExp(`/interview/session/${TEST_SESSION_ID}`),
      { timeout: 15_000 }
    )
  })

  test('session controls fit on 375px mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoSession(page)
    await page.getByRole('button', { name: /begin|start interview|ready/i }).click()
    await expect(page.getByRole('button', { name: /end interview/i })).toBeVisible({ timeout: 15_000 })
    // Check controls row doesn't overflow
    const controlsWidth = await page.locator('[class*="border-t"]').last().evaluate(el => el.scrollWidth)
    expect(controlsWidth).toBeLessThanOrEqual(390)
  })
})
