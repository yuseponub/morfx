// e2e/fixtures/auth-users.ts
// Standalone auth-hardening — Wave 0 (T0.1).
// Migración del harness scratch scripts/_audit-*.mjs a fixture permanente.
//
// Crea usuarios de prueba claramente marcados (morfx.audit.*@grr.la) vía
// service-role y los BORRA al final (incluyendo workspaces que posean).
// Corre contra el dev server local (3020) + el Supabase configurado en .env.local.
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY. Si faltan en process.env se cargan de .env.local
//   (Playwright no carga dotenv automáticamente en este repo).

import fs from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

/** Carga .env.local para las keys que falten en process.env (idempotente). */
export function loadEnvLocal(): void {
  if (ENV_KEYS.every((k) => process.env[k])) return
  const envPath = path.resolve('.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
    }
  }
}

export function hasRequiredEnv(): boolean {
  loadEnvLocal()
  return ENV_KEYS.every((k) => process.env[k])
}

export function adminClient(): SupabaseClient {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('auth-users fixture: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function anonClient(): SupabaseClient {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('auth-users fixture: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const AUDIT_PASSWORD = 'AuditPass!2026x'
export const AUDIT_PASSWORD_2 = 'AuditPass!2026y'

const runId = Math.floor(Math.random() * 1e9)

/** Email marcado para cleanup: morfx.audit.<prefix>.<runId>@grr.la */
export function auditEmail(prefix: string): string {
  return `morfx.audit.${prefix}.${runId}@grr.la`
}

export interface AuditUser {
  id: string
  email: string
  password: string
}

/** Crea un usuario de prueba vía admin API (sin enviar email). */
export async function createAuditUser(
  admin: SupabaseClient,
  prefix: string,
  opts: { confirmed?: boolean } = {},
): Promise<AuditUser> {
  const email = auditEmail(prefix)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: AUDIT_PASSWORD,
    email_confirm: opts.confirmed ?? true,
  })
  if (error || !data.user) throw new Error(`createAuditUser ${email}: ${error?.message}`)
  return { id: data.user.id, email, password: AUDIT_PASSWORD }
}

/** Login vía UI real (/login) — el camino que usan los usuarios. */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  // 'domcontentloaded' + wait explícito del form en vez de 'networkidle':
  // networkidle es antipatrón Playwright y en dev WSL los compiles fríos de
  // Turbopack (60-120s) + chunks lazy hacían timeout (Wave 1 run 1).
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await expect(page.locator('#email')).toBeVisible({ timeout: 30_000 })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  // login-form hace router.push client-side; esperar a salir de /login
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

/** Nombres de cookies de auth de Supabase presentes en el contexto (sb-*-auth-token[.N]). */
export async function authCookieNames(page: Page): Promise<string[]> {
  const cookies = await page.context().cookies()
  return cookies.filter((c) => /^sb-.*-auth-token/.test(c.name)).map((c) => c.name)
}

/** Workspaces en DB cuyo owner es el usuario dado. */
export async function workspacesOwnedBy(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from('workspaces').select('id,name,slug').eq('owner_id', userId)
  if (error) throw new Error(`workspacesOwnedBy: ${error.message}`)
  return data ?? []
}

/**
 * Borra TODOS los usuarios morfx.audit.* y sus workspaces (cascade members/data).
 * Idempotente — seguro de correr en afterAll aunque algún test haya fallado a medias.
 */
export async function cleanupAuditUsers(admin: SupabaseClient): Promise<void> {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
  const auditUsers = (list?.users ?? []).filter((u) => u.email?.includes('morfx.audit.'))
  for (const u of auditUsers) {
    const { data: ws } = await admin.from('workspaces').select('id').eq('owner_id', u.id)
    for (const w of ws ?? []) {
      await admin.from('workspaces').delete().eq('id', w.id)
    }
    await admin.auth.admin.deleteUser(u.id)
  }
}

/** Asserts compartidos del criterio C-1: sesión viva + workspace creado. */
export async function expectSessionAlive(page: Page): Promise<void> {
  expect(page.url(), 'la sesión NO debe ser expulsada a /login').not.toContain('/login')
  const names = await authCookieNames(page)
  expect(names.length, 'la cookie sb-*-auth-token debe seguir presente').toBeGreaterThan(0)
}
