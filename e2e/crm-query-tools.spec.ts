/**
 * E2E — UI ↔ DB ↔ tool runner integration.
 *
 * Standalone crm-query-tools Wave 5 (Plan 06).
 *
 * Required env (set in .env.local or CI):
 *   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   - TEST_WORKSPACE_ID
 *   - TEST_USER_EMAIL, TEST_USER_PASSWORD (workspace member)
 *   - PLAYWRIGHT_TEST_SECRET (matches server-side env)
 *
 * If any required env is missing, the test is skipped (CI-safe).
 */

import { test, expect } from '@playwright/test'
import { authenticateAsTestUser } from './fixtures/auth'
import { seedTestFixture, cleanupTestFixture, type SeededData } from './fixtures/seed'

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_WORKSPACE_ID',
  'TEST_USER_EMAIL',
  'TEST_USER_PASSWORD',
  'PLAYWRIGHT_TEST_SECRET',
]
const missing = required.filter((k) => !process.env[k])

test.describe.configure({ mode: 'serial' })

test.describe('crm-query-tools E2E (UI ↔ DB ↔ tool)', () => {
  test.skip(missing.length > 0, `missing env: ${missing.join(', ')}`)

  let seeded: SeededData

  test.beforeAll(async () => {
    seeded = await seedTestFixture()
  })

  test.afterAll(async () => {
    if (seeded) await cleanupTestFixture(seeded)
  })

  test('configure active stages via UI then tool returns the active order', async ({ page, request }) => {
    await authenticateAsTestUser(page)
    await page.goto('/agentes/crm-tools')

    // Wait for the page to render
    await expect(page.getByRole('heading', { name: 'Herramientas CRM' })).toBeVisible()

    // 1. Pick the X-E2E-Pipeline (native <select>, accessible via aria-label="Pipeline")
    const pipelineSelect = page.getByRole('combobox', { name: 'Pipeline' })
    await pipelineSelect.selectOption({ label: 'X-E2E-Pipeline crm-query-tools' })

    // 2. Open multi-select stages
    const stagesTrigger = page.getByRole('combobox', { name: 'Stages activos' })
    await stagesTrigger.click()

    // 3. Check the two ACTIVO stages
    await page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-1' }).check()
    await page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-2' }).check()
    await page.getByRole('button', { name: 'Cerrar' }).click()

    // 4. Save — wait for the toast or revalidation
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Configuracion guardada')).toBeVisible({ timeout: 5000 })

    // 5. Invoke getActiveOrderByPhone via the test runner endpoint
    const resp = await request.post('/api/test/crm-query-tools/runner', {
      headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET ?? '' },
      data: {
        tool: 'getActiveOrderByPhone',
        input: { phone: '+573009998888' },
      },
    })
    expect(resp.status()).toBe(200)
    const json = await resp.json() as { status: string; data?: { id: string; stageId: string } }

    // 6. Assert tool returned the active order (the newer one, in stage activo1)
    expect(json.status).toBe('found')
    expect(seeded.stageIds.slice(0, 2)).toContain(json.data?.stageId)
  })

  test('without active stages config, getActiveOrderByPhone returns config_not_set', async ({ page, request }) => {
    await authenticateAsTestUser(page)
    await page.goto('/agentes/crm-tools')

    // Open stages multi-select and uncheck both
    const stagesTrigger = page.getByRole('combobox', { name: 'Stages activos' })
    await stagesTrigger.click()
    const a1 = page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-1' })
    const a2 = page.getByRole('checkbox', { name: 'X-E2E-ACTIVO-2' })
    if (await a1.isChecked()) await a1.uncheck()
    if (await a2.isChecked()) await a2.uncheck()
    await page.getByRole('button', { name: 'Cerrar' }).click()

    // Reset pipeline scope to "all"
    await page.getByRole('combobox', { name: 'Pipeline' }).selectOption({ value: '' })

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Configuracion guardada')).toBeVisible({ timeout: 5000 })

    const resp = await request.post('/api/test/crm-query-tools/runner', {
      headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET ?? '' },
      data: {
        tool: 'getActiveOrderByPhone',
        input: { phone: '+573009998888' },
      },
    })
    expect(resp.status()).toBe(200)
    const json = await resp.json() as { status: string }
    expect(json.status).toBe('config_not_set')
  })
})
