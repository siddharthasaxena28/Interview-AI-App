import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Global auth setup — runs once, saves storageState for authenticated tests
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    // Public pages — no auth required
    {
      name: 'public',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Drill — public page, full interactive flow
    {
      name: 'drill',
      testMatch: /drill\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Authenticated flows — depend on setup saving storageState
    {
      name: 'authenticated',
      testMatch: /(?:dashboard|setup|session|feedback|payment)\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
    },
    // Mobile smoke — catch layout regressions on 375px
    {
      name: 'mobile',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
