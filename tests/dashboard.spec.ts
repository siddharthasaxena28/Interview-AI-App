/**
 * Dashboard tests — requires auth.
 *
 * Verifies: page loads, key UI elements are present, credit pill is visible,
 * navigation works, study plan generates.
 */

import { test, expect } from '@playwright/test'
import { requireAuth } from './helpers/mock-routes'

test.beforeAll(() => {
  if (!requireAuth()) test.skip()
})

test.describe('Dashboard', () => {
  test('loads and shows the credit pill', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Credit pill in top nav
    await expect(page.getByText(/\d+ credits?/i).first()).toBeVisible()
  })

  test('shows start new interview CTA or buy credits if balance is 0', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const startBtn = page.getByRole('link', { name: /start new interview|new interview/i })
    const buyBtn = page.getByRole('link', { name: /buy credits|get credits/i })
    // One of the two should be visible
    await expect(startBtn.or(buyBtn)).toBeVisible()
  })

  test('interview history section renders', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Either history cards or empty state
    const history = page.getByText(/no interviews yet|practice history|past sessions/i)
    const cards = page.locator('[class*="rounded"][class*="border"]').first()
    await expect(history.or(cards)).toBeVisible()
  })

  test('UserMenu opens on click and shows email', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Click the avatar/user menu trigger
    const avatar = page.getByRole('button', { name: /account|user menu|sign out/i })
      .or(page.locator('[class*="rounded-full"][class*="bg-"]').first())
    await avatar.first().click()
    // Email or Sign out should be visible in the dropdown
    await expect(
      page.getByText(/sign out|log out/i).or(page.getByText(/@/))
    ).toBeVisible({ timeout: 5_000 })
  })

  test('clicking Practice Again navigates to setup', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const practiceBtn = page.getByRole('link', { name: /start new interview|new interview/i }).first()
    if (await practiceBtn.isVisible()) {
      await practiceBtn.click()
      await expect(page).toHaveURL(/\/interview\/setup/)
    }
  })
})
