/**
 * E2E — Auth hardening: sesión, onboarding, open redirect, recovery, invitaciones.
 *
 * Standalone auth-hardening — Wave 0 (T0.1).
 * Migración del harness scratch scripts/_audit-*.mjs (auditoría 2026-06-10) a
 * suite permanente. Es el gate de éxito global del standalone:
 * "suite e2e/auth.spec.ts 100% verde".
 *
 * ESTADO ESPERADO EN WAVE 0 (pre-fix):
 *   - C-1 (3 intentos): ROJO — crear el primer workspace expulsa la sesión (AUDIT C-1)
 *   - C-2 / H-9: ROJO — open redirect en login + next sin validar en /auth/confirm
 *   - El resto: VERDE — baseline Regla 6 (login, confirmación, recovery, invitaciones)
 *
 * Usuarios de prueba: morfx.audit.*@grr.la — creados vía service-role y borrados
 * en afterAll (incluye workspaces que posean). Corre contra dev local 3020
 * (playwright.config.ts webServer) + el Supabase de .env.local.
 */

import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AUDIT_PASSWORD,
  AUDIT_PASSWORD_2,
  adminClient,
  authCookieNames,
  cleanupAuditUsers,
  createAuditUser,
  expectSessionAlive,
  hasRequiredEnv,
  loginViaUI,
  workspacesOwnedBy,
  type AuditUser,
} from './fixtures/auth-users'

const envOk = hasRequiredEnv()

// Default mode (NO serial) a nivel de archivo: un fallo en C-1 no debe saltar
// los demás tests independientes (queremos ver los 3 intentos + C-2 + H-9 +
// baseline en una sola corrida de Wave 0). workers:1 + fullyParallel:false en
// playwright.config.ts ya garantizan ejecución secuencial sin races de fixtures.
// Los grupos con dependencia real entre tests (recovery, invitaciones) usan su
// propio describe en modo serial.

let admin: SupabaseClient

test.describe('auth-hardening E2E', () => {
  test.skip(!envOk, 'faltan env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')

  test.beforeAll(() => {
    admin = adminClient()
  })

  test.afterAll(async () => {
    if (admin) await cleanupAuditUsers(admin)
  })

  // ==================== BASELINE REGLA 6 ====================

  test('baseline: login de usuario confirmado entra al dashboard', async ({ page }) => {
    test.setTimeout(60_000)
    const user = await createAuditUser(admin, 'login')
    await loginViaUI(page, user.email, user.password)
    expect(page.url()).toContain('/crm')
    expect((await authCookieNames(page)).length).toBeGreaterThan(0)
  })

  test('baseline: ruta protegida sin sesión redirige a /login', async ({ page }) => {
    await page.goto('/crm/pedidos', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/)
  })

  // ==================== C-1 — CREAR PRIMER WORKSPACE ====================
  // AUDIT C-1: el POST del server action createWorkspace dispara la race de
  // refresh-token SSR → middleware getUser()=null → 303 /login + cookie wiped
  // + workspace NO creado. Reproducido 3/3 en dev y prod.

  for (const intento of [1, 2, 3]) {
    test(`C-1 intento ${intento}/3 — crear primer workspace mantiene sesión y crea el workspace`, async ({ page }) => {
      test.setTimeout(120_000)
      const user = await createAuditUser(admin, `c1x${intento}`)
      await loginViaUI(page, user.email, user.password)

      await page.goto('/create-workspace', { waitUntil: 'networkidle' })
      await page.fill('#name', `Audit WS ${intento} run`)
      await page.waitForTimeout(500)
      const slug = page.locator('#slug')
      if ((await slug.count()) && !(await slug.inputValue())) {
        await slug.fill(`audit-ws-${intento}-${Date.now()}`)
      }
      await page.click('button[type=submit]')
      // El fallo observado es un 303 POST → /login en ~2-4s; dar margen amplio
      await page.waitForTimeout(7_000)

      await expectSessionAlive(page)
      const owned = await workspacesOwnedBy(admin, user.id)
      expect(owned, 'el workspace debe existir en DB para el owner').toHaveLength(1)
    })
  }

  // ==================== C-2 / H-9 — OPEN REDIRECT ====================

  test('C-2 — /login?redirect=https://example.org/phish NO debe salir del origen', async ({ page }) => {
    test.setTimeout(60_000)
    const user = await createAuditUser(admin, 'c2')
    await page.goto(`/login?redirect=${encodeURIComponent('https://example.org/phish')}`, { waitUntil: 'networkidle' })
    await page.fill('#email', user.email)
    await page.fill('#password', user.password)
    await page.click('button[type=submit]')
    await page.waitForTimeout(6_000)
    const landed = new URL(page.url())
    expect(landed.host, 'tras login el usuario debe quedarse en MorfX').toContain('localhost:3020')
  })

  test('H-9 — /auth/confirm con next externo debe responder redirect interno', async ({ page }) => {
    test.setTimeout(60_000)
    const user = await createAuditUser(admin, 'h9')
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: user.email })
    expect(error, `generateLink recovery: ${error?.message}`).toBeNull()
    const tokenHash = data!.properties!.hashed_token

    const res = await page.request.get(
      `/auth/confirm?token_hash=${tokenHash}&type=recovery&next=${encodeURIComponent('https://example.org')}`,
      { maxRedirects: 0 },
    )
    expect(res.status(), 'debe responder 3xx (no 5xx por URL malformada)').toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)
    const location = res.headers()['location'] ?? ''
    expect(location, 'el Location no debe apuntar a un host externo').not.toMatch(/example\.org/)
    expect(new URL(location, 'http://localhost:3020').host).toContain('localhost:3020')
  })

  // ==================== CONFIRMACIÓN DE EMAIL (baseline) ====================

  test('confirmación: /auth/confirm?token_hash&type=email deja sesión activa', async ({ page }) => {
    test.setTimeout(60_000)
    // Usuario SIN confirmar vía admin (no envía email → evita el rate limit de
    // correo de Supabase que sí dispararía anon.signUp). generateLink type:signup
    // produce el token_hash de confirmación que verifica nuestro /auth/confirm.
    const user = await createAuditUser(admin, 'confirm', { confirmed: false })
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email: user.email,
      password: AUDIT_PASSWORD,
    })
    expect(error, `generateLink signup: ${error?.message}`).toBeNull()
    const tokenHash = data!.properties!.hashed_token

    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_500)
    expect(page.url()).not.toContain('/login?error')
    expect((await authCookieNames(page)).length, 'la confirmación debe dejar sesión').toBeGreaterThan(0)
  })

  // ==================== RECOVERY (baseline happy-path) ====================
  // Cadena dependiente: el 2º test re-loguea con la clave que cambió el 1º.

  test.describe('recovery (serial)', () => {
    test.describe.configure({ mode: 'serial' })

  let recoveryUser: AuditUser

  test('recovery: enlace → /reset-password → cambiar clave', async ({ page }) => {
    test.setTimeout(90_000)
    recoveryUser = await createAuditUser(admin, 'recovery')
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: recoveryUser.email })
    expect(error, `generateLink recovery: ${error?.message}`).toBeNull()
    const tokenHash = data!.properties!.hashed_token

    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery&next=/reset-password`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(2_500)
    await page.goto('/reset-password', { waitUntil: 'networkidle' })
    await expect(page.locator('#password')).toBeVisible()
    await page.fill('#password', AUDIT_PASSWORD_2)
    await page.fill('#confirmPassword', AUDIT_PASSWORD_2)
    await page.click('button[type=submit]')
    await page.waitForTimeout(4_000)
  })

  test('recovery: login con la clave nueva funciona', async ({ page }) => {
    test.setTimeout(60_000)
    expect(recoveryUser, 'depende del test anterior (serial)').toBeTruthy()
    await loginViaUI(page, recoveryUser.email, AUDIT_PASSWORD_2)
    expect(page.url()).toContain('/crm')
  })

  }) // describe recovery (serial)

  // ==================== INVITACIONES / EQUIPOS (baseline) ====================
  // Bootstrap del inviter + workspace vía admin (la UI de crear workspace está
  // bloqueada por C-1 — cuando Wave 1 lo arregle este bootstrap puede migrar a UI).
  // Cadena dependiente: token/workspace/usuarios creados en el 1er test.

  test.describe('invitaciones (serial)', () => {
    test.describe.configure({ mode: 'serial' })

  let inviteToken: string
  let inviteWorkspaceId: string
  let invitee: AuditUser
  let wrongUser: AuditUser

  test('invitaciones: /invite/[token] visible sin login', async ({ page }) => {
    test.setTimeout(90_000)
    const inviter = await createAuditUser(admin, 'inviter')
    const wsSlug = `audit-team-${Date.now()}`
    const { data: ws, error: wsErr } = await admin
      .from('workspaces')
      .insert({ name: `Audit Team WS`, slug: wsSlug, owner_id: inviter.id })
      .select('id')
      .single()
    expect(wsErr, `bootstrap workspace: ${wsErr?.message}`).toBeNull()
    inviteWorkspaceId = ws!.id
    const { error: memErr } = await admin
      .from('workspace_members')
      .insert({ workspace_id: inviteWorkspaceId, user_id: inviter.id, role: 'owner', permissions: { all: true } })
    expect(memErr, `bootstrap member: ${memErr?.message}`).toBeNull()

    const { data: token } = await admin.rpc('generate_invitation_token')
    inviteToken = token || `audit-tok-${Date.now()}`
    invitee = await createAuditUser(admin, 'invitee')
    wrongUser = await createAuditUser(admin, 'wrong')
    const { error: invErr } = await admin.from('workspace_invitations').insert({
      workspace_id: inviteWorkspaceId,
      email: invitee.email,
      role: 'agent',
      token: inviteToken,
      invited_by: inviter.id,
    })
    expect(invErr, `bootstrap invitation: ${invErr?.message}`).toBeNull()

    await page.goto(`/invite/${inviteToken}`, { waitUntil: 'networkidle' })
    const body = (await page.textContent('body')) ?? ''
    expect(body).toMatch(/Audit Team WS|invitad/i)
  })

  test('invitaciones: invitado con email correcto acepta y queda miembro', async ({ page }) => {
    test.setTimeout(90_000)
    await loginViaUI(page, invitee.email, invitee.password)
    await page.goto(`/invite/${inviteToken}`, { waitUntil: 'networkidle' })
    const btn = page.locator('button:has-text("Aceptar")')
    await expect(btn).toBeVisible()
    await btn.click()
    await page.waitForTimeout(5_000)
    expect(page.url(), 'aceptar la invitación NO debe expulsar a /login').not.toContain('/login')
    const { data: mem } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', inviteWorkspaceId)
      .eq('user_id', invitee.id)
      .maybeSingle()
    expect(mem?.role).toBe('agent')
  })

  test('invitaciones: email distinto queda bloqueado en UI y RPC', async ({ page }) => {
    test.setTimeout(90_000)
    await loginViaUI(page, wrongUser.email, wrongUser.password)
    await page.goto(`/invite/${inviteToken}`, { waitUntil: 'networkidle' })
    const enabledAccept = page.locator('button:has-text("Aceptar"):not([disabled])')
    expect(await enabledAccept.count(), 'botón Aceptar no debe estar habilitado para otro email').toBe(0)
    const { data: mem } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', inviteWorkspaceId)
      .eq('user_id', wrongUser.id)
      .maybeSingle()
    expect(mem, 'el RPC no debe dejar entrar a un email distinto').toBeNull()
  })

  test('invitaciones: token inexistente muestra mensaje claro', async ({ page }) => {
    await page.goto(`/invite/token-inexistente-${Date.now()}`, { waitUntil: 'networkidle' })
    const body = (await page.textContent('body')) ?? ''
    expect(body).toMatch(/no v[áa]lida|expirad/i)
  })

  }) // describe invitaciones (serial)
})
