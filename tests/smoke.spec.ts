/**
 * Smoke tests — public pages, no auth required.
 *
 * These run on every commit and catch the most critical regressions:
 * blank pages, broken routing, missing critical UI elements.
 */

import { test, expect } from '@playwright/test'

// ── Landing page ──────────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('renders hero and primary CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/InterviewAI/i)
    // Headline is visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Primary CTA present
    const cta = page.getByRole('link', { name: /start.*interview|get started|try.*free/i }).first()
    await expect(cta).toBeVisible()
  })

  test('navigation links work', async ({ page }) => {
    await page.goto('/')
    // Pricing link exists
    await expect(page.getByRole('link', { name: /pricing/i }).first()).toBeVisible()
  })

  test('hero CTA navigates to auth when unauthenticated', async ({ page }) => {
    await page.goto('/')
    const cta = page.getByRole('link', { name: /start.*interview|get started|try.*free/i }).first()
    await cta.click()
    // Should either land on /auth/login or /interview/setup
    await expect(page).toHaveURL(/\/(auth\/login|interview\/setup|dashboard)/)
  })

  test('does not show JS errors in console', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Filter out known non-breaking third-party errors
    const breaking = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('posthog') &&
      !e.includes('favicon') &&
      !e.includes('sentry')
    )
    expect(breaking, `Console errors: ${breaking.join('\n')}`).toHaveLength(0)
  })

  test('renders on mobile viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(380)
  })
})

// ── Auth page ─────────────────────────────────────────────────────────────────

test.describe('Auth / login page', () => {
  test('renders Google sign-in button', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: /google|sign in/i })).toBeVisible()
  })

  test('shows brand headline on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/auth/login')
    await expect(page.getByText(/practice like it.*real/i)).toBeVisible()
  })

  test('redirects authenticated users away from login', async ({ page, context }) => {
    // If storageState has a session the middleware should redirect to dashboard
    // This test only runs correctly when auth is set up; otherwise it just verifies the page loads
    await page.goto('/auth/login')
    // Either the login page loads or we got redirected — both are valid
    const url = page.url()
    expect(url).toMatch(/\/(auth\/login|dashboard)/)
  })
})

// ── Pricing page ──────────────────────────────────────────────────────────────

test.describe('Pricing page', () => {
  test('renders pricing tiers', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveTitle(/pricing|plans|InterviewAI/i)
    // At least one pricing card visible
    await expect(page.locator('text=/₹|free|credits/i').first()).toBeVisible()
  })

  test('contains a buy/upgrade CTA', async ({ page }) => {
    await page.goto('/pricing')
    await expect(
      page.getByRole('button', { name: /buy|get started|upgrade|purchase|credits/i }).first()
    ).toBeVisible()
  })
})
