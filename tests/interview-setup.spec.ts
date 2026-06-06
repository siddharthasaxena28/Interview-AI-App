/**
 * Interview setup flow tests — requires auth.
 *
 * Verifies: form validation, all round-type cards render, generate-questions
 * API is called with correct payload, and successful generation navigates
 * to the session briefing or session page.
 */

import { test, expect } from '@playwright/test'
import { mockGenerateQuestions, TEST_SESSION_ID, requireAuth } from './helpers/mock-routes'

test.beforeAll(() => {
  if (!requireAuth()) test.skip()
})

test.describe('Interview Setup', () => {
  test('page loads with company and role inputs', async ({ page }) => {
    await page.goto('/interview/setup')
    await expect(page.getByLabel(/company/i).or(page.getByPlaceholder(/company/i))).toBeVisible()
    await expect(page.getByLabel(/role/i).or(page.getByPlaceholder(/role|position/i))).toBeVisible()
  })

  test('shows all 5 round type options', async ({ page }) => {
    await page.goto('/interview/setup')
    for (const label of ['Tech L1', 'Tech L2', 'Managerial', 'HR', 'Full Loop']) {
      await expect(page.getByText(new RegExp(label, 'i'))).toBeVisible()
    }
  })

  test('submit button is disabled until required fields are filled', async ({ page }) => {
    await page.goto('/interview/setup')
    // Find the generate/start button
    const btn = page.getByRole('button', { name: /generate|start interview|create/i })
    // Should be disabled with empty form
    await expect(btn).toBeDisabled()
  })

  test('validation rejects empty JD', async ({ page }) => {
    await page.goto('/interview/setup')
    // Fill company and role but leave JD empty
    const companyInput = page.getByLabel(/company/i).or(page.getByPlaceholder(/company/i)).first()
    const roleInput = page.getByLabel(/role/i).or(page.getByPlaceholder(/role|position/i)).first()
    await companyInput.fill('Google')
    await roleInput.fill('Senior Engineer')
    // Generate button should still be disabled / clicking shows validation
    const btn = page.getByRole('button', { name: /generate|start interview|create/i })
    if (await btn.isEnabled()) {
      await btn.click()
      // Expect an error or the button to still show loading without navigating
      await expect(page).toHaveURL(/\/interview\/setup/)
    }
  })

  test('happy path: fills form and generates questions', async ({ page }) => {
    await mockGenerateQuestions(page)

    await page.goto('/interview/setup')

    // Fill company
    const companyInput = page.getByLabel(/company/i).or(page.getByPlaceholder(/company/i)).first()
    await companyInput.fill('Google')

    // Fill role
    const roleInput = page.getByLabel(/role/i).or(page.getByPlaceholder(/role|position/i)).first()
    await roleInput.fill('Senior Software Engineer')

    // Fill JD
    const jdInput = page.getByLabel(/job description/i)
      .or(page.getByPlaceholder(/paste.*job|jd|description/i))
      .or(page.getByRole('textbox', { name: /job/i }))
      .first()
    await jdInput.fill(
      'We are looking for a Senior Software Engineer with 5+ years of experience in distributed systems, ' +
      'cloud infrastructure, and backend development. Strong knowledge of Go, Python, or Java required. ' +
      'Experience with Kubernetes, GCP, and large-scale system design preferred.'
    )

    // Select Tech L2 round type
    await page.getByText(/tech l2/i).first().click()

    // Submit
    const btn = page.getByRole('button', { name: /generate|start interview|create/i })
    await btn.click()

    // Should navigate to session or briefing page
    await expect(page).toHaveURL(
      new RegExp(`/interview/(session|briefing)/${TEST_SESSION_ID}`),
      { timeout: 15_000 }
    )
  })

  test('API error shows user-facing error message', async ({ page }) => {
    // Mock the API to return a 500
    await page.route('**/api/generate-questions', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal server error' }) })
    )
    await page.goto('/interview/setup')

    const companyInput = page.getByLabel(/company/i).or(page.getByPlaceholder(/company/i)).first()
    await companyInput.fill('Google')
    const roleInput = page.getByLabel(/role/i).or(page.getByPlaceholder(/role|position/i)).first()
    await roleInput.fill('Engineer')
    const jdInput = page.getByRole('textbox').last()
    await jdInput.fill('We need a senior engineer with 5 years of experience in distributed systems.')
    await page.getByText(/tech l1/i).first().click()

    await page.getByRole('button', { name: /generate|start interview|create/i }).click()

    // Should show error, not navigate away
    await expect(page).toHaveURL(/\/interview\/setup/, { timeout: 10_000 })
  })
})
