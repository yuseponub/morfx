// playwright.config.ts
// Bootstrapped in standalone crm-query-tools Wave 0 (Plan 01).
// Reason: D-24 demands UI ↔ DB ↔ tool E2E coverage; @playwright/test was not installed.
// Pin matches existing `playwright@1.58.2` library used by Railway robots
// (MEMORY: "Docker image version MUST match playwright npm package exactly").

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,         // serial — tests share test workspace fixtures
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                   // single worker — Supabase test data isolation (RESEARCH Open Q5)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3020',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    // /login responde 200 estable; la raíz '/' puede dar 404 en dev (next-intl
    // marketing rewrite) y Playwright exige <400 para reusar el server existente.
    url: 'http://localhost:3020/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
