/**
 * Global auth setup for Playwright.
 *
 * Creates a test user via the Supabase admin API (using SERVICE_ROLE_KEY),
 * signs in to get a valid session, then saves browser storage state so
 * every authenticated test reuses it without re-authenticating.
 *
 * Required env vars (CI secrets):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_USER_EMAIL          (e.g. playwright-test@interviewai.in)
 *   TEST_USER_PASSWORD       (strong password for the test account)
 *   PLAYWRIGHT_BASE_URL      (defaults to http://localhost:3000)
 *
 * When env vars are absent (local dev without test credentials) the setup
 * writes an empty storageState and authenticated tests are automatically
 * skipped via the skipIfNoAuth fixture.
 */

import { chromium, FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const AUTH_FILE = path.join(__dirname, '../playwright/.auth/user.json')

export default async function globalSetup(_config: FullConfig) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

  if (!supabaseUrl || !serviceKey || !anonKey || !email || !password) {
    console.warn('[playwright] Auth env vars missing — authenticated tests will be skipped.')
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }))
    return
  }

  // Ensure the test user exists (idempotent — admin.createUser fails gracefully if exists)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Playwright Test' },
  })
  if (createErr && !createErr.message.includes('already')) {
    throw new Error(`Could not create test user: ${createErr.message}`)
  }

  // Ensure the test user row exists in the users table with some credits
  const { data: listData } = await admin.auth.admin.listUsers()
  const user = listData?.users.find(u => u.email === email)
  if (user) {
    await admin.from('users').upsert({
      id: user.id,
      email,
      name: 'Playwright Test',
      credit_balance: 10,
      plan: 'free',
      current_streak: 0,
    }, { onConflict: 'id' })
  }

  // Sign in with anon client (email+password) to get a real browser session
  const anon = createClient(supabaseUrl, anonKey)
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password })
  if (signInErr || !signIn.session) {
    throw new Error(`Could not sign in test user: ${signInErr?.message ?? 'no session'}`)
  }

  // Launch browser, navigate to app, inject the Supabase session via storage
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL: baseUrl })
  const page = await context.newPage()

  // Set the Supabase session in localStorage so the client-side SDK picks it up
  await page.goto('/')
  await page.evaluate(
    ({ url, session }) => {
      const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
      localStorage.setItem(key, JSON.stringify(session))
    },
    { url: supabaseUrl, session: signIn.session }
  )

  // Also navigate to a protected page to trigger cookie setup via SSR middleware
  await page.goto('/dashboard', { waitUntil: 'networkidle' })

  await context.storageState({ path: AUTH_FILE })
  await browser.close()
  console.log('[playwright] Auth state saved to', AUTH_FILE)
}
