/**
 * Drill page tests — fully public, no auth.
 *
 * Covers the complete drill loop: intro → answering → scored → done.
 * All AI calls are mocked so tests are fast and deterministic.
 */

import { test, expect } from '@playwright/test'
import { mockDrillQuestions, mockDrillEvaluate } from './helpers/mock-routes'

test.describe('Daily Drill', () => {
  test.beforeEach(async ({ page }) => {
    await mockDrillQuestions(page)
    await mockDrillEvaluate(page)
  })

  test('intro screen renders with filter pills and start button', async ({ page }) => {
    await page.goto('/drill')
    await expect(page.getByRole('heading', { name: /daily drill/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /mixed/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /start drill/i })).toBeVisible()
    // Free badge is visible
    await expect(page.getByText(/free/i).first()).toBeVisible()
  })

  test('filter pills change the active selection', async ({ page }) => {
    await page.goto('/drill')
    const techL1 = page.getByRole('button', { name: /tech l1/i })
    await techL1.click()
    await expect(techL1).toHaveClass(/bg-indigo-600/)
  })

  test('pre-selects filter from URL param', async ({ page }) => {
    await page.goto('/drill?filter=tech_l2')
    // The Tech L2 pill should be active (indigo bg)
    const techL2 = page.getByRole('button', { name: /tech l2/i })
    await expect(techL2).toHaveClass(/bg-indigo-600/)
  })

  test('start drill shows first question', async ({ page }) => {
    await page.goto('/drill')
    await page.getByRole('button', { name: /start drill/i }).click()
    // Q1/3 progress indicator
    await expect(page.getByText(/q1\s*\/\s*3/i)).toBeVisible()
    // Question card with text
    await expect(page.getByText(/stack.*queue|binary search|database/i)).toBeVisible()
    // Answer textarea
    await expect(page.getByRole('textbox')).toBeVisible()
    // Submit button (disabled until text entered)
    await expect(page.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  test('typing an answer enables the submit button', async ({ page }) => {
    await page.goto('/drill')
    await page.getByRole('button', { name: /start drill/i }).click()
    const textarea = page.getByRole('textbox')
    await textarea.fill('A stack is LIFO while a queue is FIFO.')
    await expect(page.getByRole('button', { name: /submit/i })).toBeEnabled()
  })

  test('submitting shows score and feedback', async ({ page }) => {
    await page.goto('/drill')
    await page.getByRole('button', { name: /start drill/i }).click()
    await page.getByRole('textbox').fill('A stack is LIFO while a queue is FIFO data structure.')
    await page.getByRole('button', { name: /submit/i }).click()
    // Score badge (1-5 range)
    await expect(page.getByText(/4\s*\/\s*5|good|excellent/i)).toBeVisible({ timeout: 10_000 })
    // Feedback text
    await expect(page.getByText(/good answer/i)).toBeVisible()
    // "Next Question" button
    await expect(page.getByRole('button', { name: /next question|see results/i })).toBeVisible()
  })

  test('completing all 3 questions shows done screen', async ({ page }) => {
    await page.goto('/drill')
    await page.getByRole('button', { name: /start drill/i }).click()

    for (let i = 0; i < 3; i++) {
      await page.getByRole('textbox').fill(`My answer to question ${i + 1}`)
      await page.getByRole('button', { name: /submit/i }).click()
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: /next question|see results/i }).click()
    }

    // Done screen
    await expect(page.getByText(/drill complete/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /start full interview/i })).toBeVisible()
  })

  test('skip moves to next question without submitting', async ({ page }) => {
    await page.goto('/drill')
    await page.getByRole('button', { name: /start drill/i }).click()
    // Skip first question
    await page.getByRole('button', { name: /skip this question/i }).click()
    // Should now be on Q2
    await expect(page.getByText(/q2\s*\/\s*3/i)).toBeVisible()
  })

  test('drill page mobile layout fits 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/drill')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(380)
    await expect(page.getByRole('button', { name: /start drill/i })).toBeVisible()
  })
})
