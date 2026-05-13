# godentist-scraping-structural-v2 — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 9 (5 modified + 3 new + 1 migration)
**Analogs found:** 9 / 9 (100% in-repo coverage)

This PATTERNS.md is consumed by `gsd-planner` to anchor each plan's action section in concrete existing-code excerpts. Where a pattern is being intentionally **replaced** (not extended), the analog is annotated `LEGACY-DELETE` so the planner knows the snippet is reference-only.

---

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality | New/Modified |
|------|------|-----------|----------------|---------------|--------------|
| `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (rewrite §240-1900) | Robot adapter (Playwright) | request-response (sync browser-automation, returns JSON) | self (current adapter — analog for primitives + `[GoDentist]` log convention + `SedeRefreshFailedError` Error class pattern) | exact (same file, partial rewrite) | **MODIFIED — partial rewrite** |
| `godentist/robot-godentist/src/api/server.ts` (§70-98 handler error mapping) | Express route handler | request-response (HTTP) | self §74-88 (`SedeRefreshFailedError → 502` mapping shipped 12-may) | exact | **MODIFIED — add 2 error mappings** |
| `godentist/robot-godentist/src/types/index.ts` | Type contract | n/a (declaration only) | self lines 7-30 (`Appointment`, `ScrapeAppointmentsRequest`, `ScrapeAppointmentsResponse`) | exact | **MODIFIED — optional, only if response shape changes** |
| `src/app/actions/godentist.ts` §108-167 (`scrapeAppointments`) | Server action | request-response (HTTP → DB insert) | self §170-310 (`sendConfirmations` for cookie/auth/admin pattern) + `src/lib/agents/production/webhook-processor.ts` §572-577 (`getPlatformConfig` flag pattern) | exact + role-match | **MODIFIED — inject flag/dedupe/canary** |
| `src/app/actions/godentist.ts` §641-790 (`scheduleReminders`) + §170-310 (`sendConfirmations`) | Server actions | CRUD (read + write) | self (already authored) | exact | **MODIFIED — block on `inconsistent` flag** |
| `src/app/actions/godentist.ts` `getScheduledRemindersGroupedByScrape` (NEW) | Server action (query) | CRUD (joined read) | self §835-880 (`getFollowupPreview` for JOIN pattern) + §782-808 (`getScheduledReminders` for cookie/workspace gate) | role-match | **NEW** |
| `src/inngest/functions/godentist-scrape-inconsistent.ts` (NEW) | Inngest event handler | event-driven (single-flight alert) | `src/inngest/functions/bold-upstream-broken.ts` (whole file — alert handler pattern) | exact (same shape: event receiver writes observability row) | **NEW** |
| `src/inngest/events.ts` (add `godentist/scrape.inconsistent` to `GodentistEvents`) | Type declaration | n/a | self §663-674 (`godentist/reminder.send` event shape) + §911-920 (`bold-robot/upstream-broken`) | exact | **MODIFIED — single union member added** |
| `src/app/api/inngest/route.ts` (register new function) | Inngest serve registration | n/a | self §39 + §87 (boldUpstreamBroken registration line) | exact | **MODIFIED — 2-line addition** |
| `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` §798-940 (programacion tab) | UI client component | event-driven (React state + server action) | self §672-792 (`history` tab — cards pattern to REPLICATE per CONTEXT.md D-04 verbatim mandate) | exact (mandated mirror) | **MODIFIED — redesign tab** |
| `supabase/migrations/20260513XXXXXX_godentist_scrape_inconsistent_flag.sql` (NEW) | DB migration | n/a | `supabase/migrations/20260311100000_godentist_scrape_history.sql` (original schema + index pattern) + `supabase/migrations/20260312100000_godentist_scheduled_reminders.sql` (timestamp convention `timezone('America/Bogota', NOW())`) | exact (same table family) | **NEW** |
| `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` (NEW) | Smoke test validator | batch (file-I/O) | `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` (2-invariant base — extend to 3 per D-15) | exact | **NEW (rewrites old validator)** |

---

## Pattern Assignments

### 1. Robot adapter rewrite — `godentist/robot-godentist/src/adapters/godentist-adapter.ts`

**Analog (self, partial reuse):** Keep imports, `BASE_URL`/`APPOINTMENTS_URL` constants, `Credentials`/`Sucursal` interfaces, `[GoDentist]` log convention, custom Error class pattern. **DELETE** `Fingerprint` interface, `fingerprintsEqual`, `captureFingerprint`, `waitForSucursalRefresh`, `discoverSucursales` (replaced by hardcoded `SEDE_ID_MAP`), and the `for sucursal of sucursales` loop in `scrapeAppointments`. Replace with `page.goto(APPOINTMENTS_URL)` per sede + `assertFilterIs` postcondition + `clickNextPageWithGuard`.

**Imports pattern to KEEP** (`godentist-adapter.ts` lines 1-12):

```typescript
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import type { Credentials, Appointment, ConfirmAppointmentResponse, CheckAvailabilityResponse, AvailabilitySlot } from '../types/index.js'
import { DOCTOR_PRIORITY } from '../constants/doctors.js'

const STORAGE_DIR = path.resolve('storage')
const SESSIONS_DIR = path.join(STORAGE_DIR, 'sessions')
const ARTIFACTS_DIR = path.join(STORAGE_DIR, 'artifacts')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
```

**Custom Error class pattern to REPLICATE** (`godentist-adapter.ts` lines 47-68 — `SedeRefreshFailedError`):

Use this shape for **two new Error classes** (per RESEARCH.md Implementation Roadmap Wave 1 + CONTEXT.md cross-references):

```typescript
/**
 * Per CONTEXT.md D-07: filter drift detected — `#idsucursalgrid.value !== expectedId`
 * after selectSucursal or clickBuscar. Thrown by `assertFilterIs` helper.
 * Propagates without try/catch to Express handler in server.ts (Plan TBD),
 * which maps to HTTP 502 with body `{ status: 'error', code: 'filter_drift', when, expected, actual }`.
 */
export class FilterDriftError extends Error {
  constructor(
    public readonly sede: string,
    public readonly expectedId: string,
    public readonly actualId: string,
    public readonly when: string,
  ) {
    super(`Filter drift in ${sede} at ${when}: expected idsucursalgrid=${expectedId}, got ${actualId}`)
    this.name = 'FilterDriftError'
  }
}

/**
 * Per CONTEXT.md D-11: pagination postcondition failed — pageInput.value did not
 * increment AND first row did not change after clickNextPage + 1 retry.
 * Maps to HTTP 502.
 */
export class PaginationStuckError extends Error {
  constructor(
    public readonly sede: string,
    public readonly currentPage: number,
    public readonly totalPages: number,
    public readonly pageInputBefore: string,
    public readonly pageInputAfter: string,
  ) {
    super(`Pagination stuck in ${sede} at page ${currentPage}/${totalPages}: pageInput ${pageInputBefore} → ${pageInputAfter}`)
    this.name = 'PaginationStuckError'
  }
}
```

**Core pattern (paradigm F) to COPY from RESEARCH.md** (RESEARCH.md §"Fresh-state-per-sede scraping"):

```typescript
const SEDE_ID_MAP: Record<string, string> = {
  'CABECERA': '1',
  'FLORIDABLANCA': '3',
  'JUMBO EL BOSQUE': '5',
  'MEJORAS PUBLICAS': '4',
}

async scrapeAppointments(filterSucursales: string[], targetDate: string) {
  const allRows: Appointment[] = []
  const errors: string[] = []
  const dateStr = this.formatDateDD_MM_YYYY(targetDate)

  for (const sede of (filterSucursales ?? Object.keys(SEDE_ID_MAP))) {
    const expectedId = SEDE_ID_MAP[sede]
    if (!expectedId) { errors.push(`Unknown sede: ${sede}`); continue }
    try {
      // FRESH NAVIGATION — eliminates ALL inter-sede state (paradigm F D-07)
      await this.page!.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await this.page!.waitForTimeout(2000)
      await this.setDate(dateStr)
      await this.setHour('6:00 am')

      const currentHidden = await this.readHidden()
      if (currentHidden !== expectedId) {
        await this.selectSucursal({ value: sede, label: sede })
      }
      await this.assertFilterIs(expectedId, `post-select-${sede}`)
      await this.clickBuscarAndWait()
      await this.assertFilterIs(expectedId, `post-buscar-${sede}`)

      const totalPages = (await this.getTotalPages()) || 1
      for (let p = 1; p <= totalPages; p++) {
        await this.assertFilterIs(expectedId, `page-${p}-${sede}`)
        const rows = await this.extractCurrentPageRows(sede)
        allRows.push(...rows)
        if (p < totalPages) await this.clickNextPageWithGuard(sede, p, totalPages)
      }
    } catch (err) {
      if (err instanceof FilterDriftError || err instanceof PaginationStuckError) throw err
      errors.push(`${sede}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { date: targetDate, appointments: allRows, errors }
}
```

**Pagination guard to ADD** — copy verbatim from RESEARCH.md §"Pagination guard" (already snippet-ready):

```typescript
private async clickNextPageWithGuard(sede: string, currentPage: number, totalPages: number) {
  const fpBefore = await this.readFirstRowFingerprint()
  const pageBefore = await this.readPageInputValue()
  const attemptClick = async () => {
    await this.page!.evaluate(() => {
      const btn = document.querySelector('button.x-tbar-page-next') as HTMLButtonElement
      btn?.click()
    })
    try {
      await this.page!.waitForFunction(({ pageBefore, fpBefore }) => {
        const pageInput = document.querySelector('input.x-tbar-page-number') as HTMLInputElement
        if (pageInput?.value === pageBefore) return false
        const rt = document.querySelector('table.x-grid3-row-table')
        if (!rt) return false
        const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
        return (cells[5] || '') !== fpBefore.phone || (cells[1] || '') !== fpBefore.hora
      }, { pageBefore, fpBefore }, { timeout: 5000, polling: 100 })
      return true
    } catch { return false }
  }
  let ok = await attemptClick()
  if (!ok) { await this.page!.waitForTimeout(500); ok = await attemptClick() }
  if (!ok) {
    const pageAfter = await this.readPageInputValue()
    throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter)
  }
  await this.page!.waitForTimeout(500)
}
```

**D-11 defensive `x-item-disabled` check** (CONTEXT.md mandates this redundantly even though paradigm F makes it theoretical). Old `clickNextPage` (LEGACY-DELETE — lines 1818-1836):

```typescript
// LEGACY-DELETE — current adapter §1818-1836 lacks the disabled-check D-11 mandates:
const clicked = await this.page.evaluate(() => {
  const nextBtn = document.querySelector('button.x-tbar-page-next') as HTMLElement
  if (nextBtn) { nextBtn.click(); return true }  // <-- no x-item-disabled guard
  return false
})
```

**Replace with** (in `clickNextPageWithGuard` `attemptClick` body, add ancestor check per RESEARCH §Common Pitfalls):

```typescript
await this.page!.evaluate(() => {
  const btn = document.querySelector('button.x-tbar-page-next') as HTMLButtonElement
  if (!btn) return false
  // D-11 defensive: x-item-disabled lives on <table> ancestor, not button
  const ancestor = btn.closest('table.x-btn')
  if (ancestor?.classList.contains('x-item-disabled')) return false
  btn.click()
  return true
})
```

**Logging convention to PRESERVE** — every console line in the new code starts with `[GoDentist]` (current adapter §260, §266, §270, §278, §286, §294, §1480, §1490, §1526, etc.). Maintain for Railway log grep consistency.

**LEGACY-DELETE list** (research confirmed these are dead with paradigm F — RESEARCH.md Implementation Roadmap Wave 1):
- `Fingerprint` interface + `fingerprintsEqual` (lines 29-45)
- `SUCURSAL_REFRESH_TIMEOUT_MS` + `SUCURSAL_REFRESH_POLL_MS` constants (lines 21-22)
- `captureFingerprint` private method (lines 1576-1620)
- `waitForSucursalRefresh` private method (lines 1640-1740)
- `discoverSucursales` (lines 1463-1511) — replaced by `SEDE_ID_MAP` constant lookup
- `extractAllPages` (lines 1749-1777) — replaced by `for p = 1..totalPages` inline in `scrapeAppointments`
- `clickNextPage` (lines 1818-1836) — replaced by `clickNextPageWithGuard`
- `extractAppointments(sucursal: string)` (line 1840+) — RENAME to `extractCurrentPageRows(sede: string)` and KEEP body (cell-heuristic phone/hora/nombre parsing is the same DOM contract; only the loop wrapping it changes)
- `SedeRefreshFailedError` class (lines 56-68) — keep file present if anything else imports, but **scrape flow no longer throws it**; safe to delete if no consumer

**Risks/landmines if pattern misapplied:**
- **Don't keep `discoverSucursales` AND add `SEDE_ID_MAP`**: dual source of truth invites drift when Godentist adds a new sede. Plan should explicitly delete `discoverSucursales` from scrape path; if Q4 confidence concern arises (MEDIUM confidence per RESEARCH.md), add a one-shot runtime-discovery fallback ONLY behind `SEDE_ID_MAP[sede] === undefined`.
- **Don't reuse `extractAppointments(sucursal)` name with new body**: the old name's signature implied `sucursal` is the LOOP label (the bug). Rename to `extractCurrentPageRows(sede)` so the contract is unambiguous (sede comes from the caller's verified-filter state).
- **Don't skip `assertFilterIs` calls**: RESEARCH.md Run 5 of paradigm E proved that `verifyFilter` post-buscar alone is insufficient if you don't ALSO call it pre-pagination per page. Plan must include `assertFilterIs(expectedId, \`page-${p}-${sede}\`)` inside the page loop.

---

### 2. Express handler error mapping — `godentist/robot-godentist/src/api/server.ts`

**Analog:** self §74-88 (current `SedeRefreshFailedError → 502` mapping, shipped 12-may).

**Pattern to COPY** (lines 74-88):

```typescript
// Per CONTEXT.md D-08: SedeRefreshFailedError (thrown by adapter when a sede exhausts
// 3 refresh attempts) maps to HTTP 502 — semantically correct because the portal Dentos
// (upstream of the robot) didn't respond as expected. Discriminator code allows
// forensics distinction from other 5xx responses.
if (err instanceof SedeRefreshFailedError) {
  res.status(502).json({
    success: false,
    status: 'error',
    code: 'sede_refresh_failed',
    sucursal: err.sucursal,
    attempts: err.attempts,
    error: err.message,
  })
  return
}
```

**Apply to NEW errors** (replace the `SedeRefreshFailedError` block or add ABOVE the generic 500 fallback at §90):

```typescript
if (err instanceof FilterDriftError) {
  res.status(502).json({
    success: false, status: 'error',
    code: 'filter_drift',
    sede: err.sede, expectedId: err.expectedId, actualId: err.actualId, when: err.when,
    error: err.message,
  })
  return
}
if (err instanceof PaginationStuckError) {
  res.status(502).json({
    success: false, status: 'error',
    code: 'pagination_stuck',
    sede: err.sede, currentPage: err.currentPage, totalPages: err.totalPages,
    pageInputBefore: err.pageInputBefore, pageInputAfter: err.pageInputAfter,
    error: err.message,
  })
  return
}
```

**Imports to ADD** at top of `server.ts` (line 4):

```typescript
import { GoDentistAdapter, FilterDriftError, PaginationStuckError } from '../adapters/godentist-adapter.js'
```

**Risks/landmines:**
- **Order matters**: `instanceof` checks must come BEFORE the generic `res.status(500)` catch-all at line 90.
- **If `SedeRefreshFailedError` is kept for safety**, leave its mapping block in place even though it should never be thrown by paradigm F (defense in depth).
- **Don't change HTTP status to 4xx for `FilterDriftError`**: per `<code_context>` Integration Points, the server-action `scrapeAppointments` line 129 (`if (!res.ok)`) gates downstream automatically on 5xx. 502 = upstream (Dentos portal) bug, semantically correct.

---

### 3. Server-action `scrapeAppointments` — `src/app/actions/godentist.ts` §108-167

**Analogs:**
- self §170-310 (`sendConfirmations`) for `'use server'` + `createClient` + cookie + `createAdminClient` pattern
- `src/lib/agents/production/webhook-processor.ts` §572-577 for `getPlatformConfig` feature flag pattern (D-10)
- self §835-880 (`getFollowupPreview`) for JOIN-shape reference for D-04 grouped query

**Auth + cookie + admin pattern to PRESERVE** (lines 108-115 — unchanged):

```typescript
export async function scrapeAppointments(sucursales?: string[], targetDate?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }
  // ...
}
```

**Feature flag pattern to INSERT** (D-10) — copy from `webhook-processor.ts` §573-577:

```typescript
// At top of function, after workspaceId check:
const { getPlatformConfig } = await import('@/lib/domain/platform-config')
const useNewScraping = await getPlatformConfig<boolean>('use_new_godentist_scraping', true)
const robotPath = useNewScraping ? '/api/scrape-appointments' : '/api/scrape-appointments-legacy'

// Then in fetch:
const res = await fetch(`${ROBOT_URL}${robotPath}`, { ... })
```

**Dedupe pattern to INSERT (D-12)** — copy from RESEARCH.md §"Server-action dedupe":

```typescript
// AFTER `const data: ScrapeResult = await res.json()` (line 134)
// BEFORE `admin.from('godentist_scrape_history').insert(...)` (line 148):
const seen = new Set<string>()
const dedupedAppointments: GodentistAppointment[] = []
for (const apt of data.appointments) {
  const key = `${apt.sucursal}|${apt.telefono}|${apt.hora}`
  if (seen.has(key)) continue
  seen.add(key)
  dedupedAppointments.push(apt)
}
data.appointments = dedupedAppointments
```

**Cross-sede canary pattern to INSERT (D-08)** — copy from RESEARCH.md §"Cross-sede canary":

```typescript
// AFTER dedupe, BEFORE history insert:
const phoneToSedes = new Map<string, Set<string>>()
for (const apt of data.appointments) {
  if (!phoneToSedes.has(apt.telefono)) phoneToSedes.set(apt.telefono, new Set())
  phoneToSedes.get(apt.telefono)!.add(apt.sucursal)
}
const crossSedePhones = [...phoneToSedes].filter(([, s]) => s.size > 1).map(([phone, sedes]) => ({
  phone, sedes: [...sedes],
}))
const isInconsistent = crossSedePhones.length > 0

let inconsistencyDetails: Record<string, unknown> | null = null
if (isInconsistent) {
  inconsistencyDetails = {
    crossSedePhones,
    detectedAt: new Date().toISOString(),
    totalAppointments: data.appointments.length,
  }
  // CRITICAL Pitfall 8: ALWAYS await inngest.send in serverless (Vercel terminates lambda)
  await (inngest.send as any)({
    name: 'godentist/scrape.inconsistent',
    data: {
      workspaceId,
      scrapedDate: data.date,
      crossSedePhones,
      detectedAt: new Date().toISOString(),
    },
  })
}
```

**Insert with new columns** — update insertPayload at lines 140-146:

```typescript
const insertPayload = {
  workspace_id: workspaceId,
  scraped_date: data.date,
  sucursales: sucursales || ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS'],
  appointments: JSON.parse(JSON.stringify(data.appointments)),
  total_appointments: data.appointments.length,
  inconsistent: isInconsistent,                   // NEW D-08
  inconsistency_details: inconsistencyDetails,    // NEW D-08
}
```

**`sendConfirmations` / `scheduleReminders` gating (D-08)** — insert at the top of EACH function (after workspaceId check, before main loop). The simplest gating reuses the existing `historyId` param:

```typescript
// In sendConfirmations (line ~190) AND scheduleReminders (line ~655):
if (historyId) {
  const admin = createAdminClient()
  const { data: scrapeRow } = await admin
    .from('godentist_scrape_history')
    .select('inconsistent')
    .eq('id', historyId)
    .eq('workspace_id', workspaceId)
    .single()
  if (scrapeRow?.inconsistent) {
    return { error: 'Scrape marcado como inconsistent — envío bloqueado. Revisar diagnóstico de scrape antes de reintentar.' }
  }
}
```

**Risks/landmines:**
- **Feature flag default ON (D-10)** means `getPlatformConfig` MUST receive `true` as fallback (not `false`). Wrong fallback ships the rollback path as default — destructive.
- **`platform_config` value is JSONB** — `webhook-processor.ts` reads as `<boolean>`, which works because `getPlatformConfig` handles type coercion (per `src/lib/domain/platform-config.ts` §96-134). Don't bypass via raw `supabase.from('platform_config').select('value')` for the new key — use the helper for cache TTL + type safety.
- **Inngest send fire-and-forget bug** (per MEMORY.md): Vercel serverless terminates the lambda right after `res.json()`; in-flight `inngest.send` Promises are dropped. The `await` is non-negotiable — copy verbatim from `bold/client.ts` §62.
- **Gate ordering inside `sendConfirmations`/`scheduleReminders`**: the check must come BEFORE the for-loop on appointments. If placed inside the loop, every individual cita does an extra DB read.
- **Don't gate on `crossSedePhones.length` directly in send fns**: use the persisted `inconsistent` column. The check happens in the server action; downstream fns should trust the audit-trail flag (single source of truth).

---

### 4. New server action: `getScheduledRemindersGroupedByScrape` — `src/app/actions/godentist.ts`

**Analog:**
- self §782-808 (`getScheduledReminders`) for cookie/workspaceId gate + admin client + query shape
- self §835-880 (`getFollowupPreview`) for joined query across `godentist_scrape_history` and downstream entity

**Pattern to COPY** (composite of the two):

```typescript
export interface ScrapeWithReminders {
  scrape: {
    id: string
    scraped_date: string
    sucursales: string[]
    total_appointments: number
    created_at: string
    inconsistent: boolean
    inconsistency_details: Record<string, unknown> | null
  }
  reminders: ScheduledReminderEntry[]
  stats: { pending: number; sent: number; failed: number; cancelled: number }
}

export async function getScheduledRemindersGroupedByScrape(
  dateFilter?: string,
): Promise<{ error?: string; data?: ScrapeWithReminders[]; orphans?: ScheduledReminderEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()

  // Step 1: fetch reminders for the date (or all if no filter), workspace-scoped
  let remQuery = admin
    .from('godentist_scheduled_reminders')
    .select('id, nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, status, error, sent_at, created_at, scrape_history_id')
    .eq('workspace_id', workspaceId)
  if (dateFilter) remQuery = remQuery.eq('fecha_cita', dateFilter)
  const { data: rems, error: remErr } = await remQuery.order('scheduled_at', { ascending: true }).limit(2000)
  if (remErr) return { error: remErr.message }

  // Step 2: collect distinct scrape_history_ids, fetch scrape rows
  const scrapeIds = [...new Set((rems || []).map(r => r.scrape_history_id).filter(Boolean))] as string[]
  const { data: scrapes } = await admin
    .from('godentist_scrape_history')
    .select('id, scraped_date, sucursales, total_appointments, created_at, inconsistent, inconsistency_details')
    .in('id', scrapeIds)
    .eq('workspace_id', workspaceId)

  // Step 3: group reminders by scrape_history_id (orphans collected separately)
  const grouped: ScrapeWithReminders[] = []
  const orphans: ScheduledReminderEntry[] = []
  const byScrapeId = new Map<string, ScheduledReminderEntry[]>()
  for (const r of rems || []) {
    if (!r.scrape_history_id) {
      orphans.push(r as ScheduledReminderEntry)
      continue
    }
    if (!byScrapeId.has(r.scrape_history_id)) byScrapeId.set(r.scrape_history_id, [])
    byScrapeId.get(r.scrape_history_id)!.push(r as ScheduledReminderEntry)
  }

  for (const scrape of scrapes || []) {
    const scrapeReminders = byScrapeId.get(scrape.id) || []
    const stats = { pending: 0, sent: 0, failed: 0, cancelled: 0 }
    for (const r of scrapeReminders) {
      if (r.status === 'pending') stats.pending++
      else if (r.status === 'sent') stats.sent++
      else if (r.status === 'failed') stats.failed++
      else if (r.status === 'cancelled') stats.cancelled++
    }
    grouped.push({ scrape: scrape as ScrapeWithReminders['scrape'], reminders: scrapeReminders, stats })
  }

  // Sort by scrape.created_at descending (most recent first)
  grouped.sort((a, b) => b.scrape.created_at.localeCompare(a.scrape.created_at))

  return { data: grouped, orphans }
}
```

**Risks/landmines:**
- **Don't drop the `orphans` bucket**: D-04 explicitly mentions "Sección Sin scrape origen para reminders huérfanos (si los hay por data legacy)". Pre-D-09 legacy data may have `scrape_history_id IS NULL`.
- **Don't use Supabase `.foreignTable()` joins** — current codebase prefers 2-step queries (`getFollowupPreview` proves the team's pattern). Joins via embedded select on Supabase JS client can return unexpected nested shapes and break when `scrape_history_id IS NULL`.
- **Limit defensively** (`.limit(2000)`) — flat `getScheduledReminders` uses 500. The grouped variant covers wider date range; cap at 2000 to avoid runaway query.

---

### 5. New Inngest function: `godentist-scrape-inconsistent` — `src/inngest/functions/godentist-scrape-inconsistent.ts`

**Analog:** `src/inngest/functions/bold-upstream-broken.ts` (entire file — exact shape match: receives alert event, writes observability row, single-flight concurrency).

**Pattern to COPY verbatim** (`bold-upstream-broken.ts` lines 1-62), substituting names and payload fields:

```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('godentist-scrape-inconsistent')

export const godentistScrapeInconsistent = inngest.createFunction(
  {
    id: 'godentist-scrape-inconsistent',
    name: 'GoDentist Scrape Inconsistent — Alert Developer',
    retries: 1,
    // Single-flight per workspace to avoid alert spam when multiple scrapes in flight
    concurrency: [{ key: 'event.data.workspaceId', limit: 1 }],
  },
  { event: 'godentist/scrape.inconsistent' },
  async ({ event, step }) => {
    const { workspaceId, scrapedDate, crossSedePhones, detectedAt } = event.data
    logger.warn(
      { workspaceId, scrapedDate, crossSedePhonesCount: crossSedePhones.length, detectedAt },
      'GoDentist scrape detected cross-sede contamination — D-07 invariant violated',
    )

    const supabase = createAdminClient()
    await step.run('log-to-observability', async () => {
      await supabase.from('agent_observability_events').insert({
        workspace_id: workspaceId,
        event_type: 'godentist_scrape_inconsistent',
        agent_id: 'godentist-robot',
        payload: { scrapedDate, crossSedePhones, detectedAt },
      })
    })

    // TODO follow-up: WhatsApp/email alert to developer when notification path stabilizes.
    return { alerted: true, phonesAffected: crossSedePhones.length }
  },
)
```

**Risks/landmines:**
- **Concurrency key**: `bold-upstream-broken.ts` uses `'"bold-upstream-broken"'` (global single-flight). For godentist, per-workspace makes more sense (`'event.data.workspaceId'`). Plan should pick one explicitly.
- **`retries: 1`** is right per Bold analog — alert receivers shouldn't loop on logger failure (would silently amplify spam).
- **No WhatsApp send in V1** — Bold analog explicitly punts to TODO; do the same.

---

### 6. Inngest event type + serve registration

**`src/inngest/events.ts` — add inside `GodentistEvents` (after line 701):**

**Analog:** `bold-robot/upstream-broken` event type (lines 911-920).

```typescript
/**
 * Per CONTEXT.md D-08: emitted when scrapeAppointments detects (phone, fecha) appearing
 * in more than one sede in the same scrape. Indicates D-07 invariant violation —
 * the new paradigm has a grieta. Handler logs to agent_observability_events;
 * sendConfirmations/scheduleReminders abort if the scrape row has inconsistent=true.
 */
'godentist/scrape.inconsistent': {
  data: {
    workspaceId: string
    scrapedDate: string  // YYYY-MM-DD
    crossSedePhones: Array<{ phone: string; sedes: string[] }>
    detectedAt: string  // ISO timestamp
  }
}
```

**`src/app/api/inngest/route.ts` — 2-line addition.** Analog: `bold-upstream-broken` registration (lines 39 + 87):

```typescript
// Add to imports (~line 40):
import { godentistScrapeInconsistent } from '@/inngest/functions/godentist-scrape-inconsistent'

// Add to functions array (~line 88, near boldUpstreamBroken):
godentistScrapeInconsistent,  // Standalone: godentist-scraping-structural-v2 (D-08 — cross-sede canary)
```

**Risks/landmines:**
- **`AllAgentEvents` union update**: line 925 of `events.ts` already concatenates `GodentistEvents` — adding inside the union member is enough, no union edit needed.
- **Don't forget the trailing union member registration**: if a new top-level type is added (instead of inside `GodentistEvents`), it must also be appended to `AllAgentEvents` at line 925. Recommend keeping it INSIDE `GodentistEvents` to avoid two-place edits.

---

### 7. UI redesign: `confirmaciones-panel.tsx` — programacion tab §798-940

**Analog (mandated by CONTEXT.md D-04 verbatim):** self §672-792 (`history` tab cards pattern).

**Imports to PRESERVE/EXTEND** (lines 1-23):

```typescript
import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Clock, Eye, RotateCcw, Calendar, AlertTriangle } from 'lucide-react'  // ADD AlertTriangle for D-08 badge
import {
  // ... existing imports
  getScheduledRemindersGroupedByScrape,  // NEW (server action D-04)
  type ScrapeWithReminders,              // NEW (type from server action)
} from '@/app/actions/godentist'
```

**State pattern to REPLICATE** (history tab state — lines 67-72) for programacion:

```typescript
// Programacion grouped state (replaces flat reminders[])
const [grouped, setGrouped] = useState<ScrapeWithReminders[]>([])
const [orphans, setOrphans] = useState<ScheduledReminderEntry[]>([])
const [progView, setProgView] = useState<'list' | 'detail'>('list')
const [selectedProgEntry, setSelectedProgEntry] = useState<ScrapeWithReminders | null>(null)
```

**Card-per-scrape pattern to COPY** — exact mirror of history tab §704-756 (mandated verbatim by D-04):

```tsx
{grouped.map(entry => (
  <Card key={entry.scrape.id} className="hover:bg-muted/30 transition-colors">
    <CardContent className="pt-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {new Date(entry.scrape.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
            </span>
          </div>
          <Badge variant="secondary">Fecha: {entry.scrape.scraped_date}</Badge>
          <Badge variant="outline">{entry.reminders.length} reminders</Badge>
          <div className="flex gap-1">
            {entry.scrape.sucursales.map(s => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
          </div>
          <Badge variant="default" className="bg-blue-600">{entry.stats.pending} pendientes</Badge>
          {entry.stats.sent > 0 && <Badge variant="default" className="bg-green-600">{entry.stats.sent} sent</Badge>}
          {entry.stats.failed > 0 && <Badge variant="destructive">{entry.stats.failed} failed</Badge>}
          {entry.stats.cancelled > 0 && <Badge variant="outline">{entry.stats.cancelled} cancelled</Badge>}
          {entry.scrape.inconsistent && (
            <Badge variant="destructive" className="bg-red-700">
              <AlertTriangle className="h-3 w-3 mr-1" />
              inconsistent
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setSelectedProgEntry(entry); setProgView('detail') }}>
            <Eye className="mr-1 h-3 w-3" />
            Ver detalle
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
))}
```

**Detail view (preserves current programacion tab table) — pattern to ADAPT from §761-791 (`<HistoryDetail>` pattern):**

```tsx
{progView === 'detail' && selectedProgEntry && (
  <ProgramacionDetail
    entry={selectedProgEntry}
    onBack={() => { setProgView('list'); setSelectedProgEntry(null) }}
    onCancelReminder={handleCancelReminder}
    cancellingId={cancellingId}
  />
)}
```

Where `<ProgramacionDetail>` wraps the EXISTING flat table from §842-899 (preserves D-04 "+ ui actual" mandate — cancelar por fila, scheduled_at column, etc.).

**Date-formatter timezone pattern to PRESERVE** (lines 712 + 863):

```typescript
new Date(entry.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
// CLAUDE.md REGLA 2 — TODA fecha en zona America/Bogota
```

**Orphans section pattern** (for legacy reminders without `scrape_history_id`):

```tsx
{orphans.length > 0 && (
  <>
    <div className="mt-6">
      <p className="text-sm font-medium text-muted-foreground">Sin scrape origen (legacy)</p>
    </div>
    <Card>
      {/* Reuse same flat-table layout as current §842-899 for these */}
    </Card>
  </>
)}
```

**Risks/landmines:**
- **Don't delete the date picker or `loadReminders`**: D-04 says "+ ui actual" — the date picker (line 807-812) is part of "actual" UI and must remain on the cards-list view. Move it next to the refresh button.
- **Don't lose pagination on the inner table**: §885-899 has pagination for the flat table — preserve inside `<ProgramacionDetail>` since per-scrape reminder lists can be 50+ rows.
- **`AlertTriangle` import** — Don't forget to add to the `lucide-react` import block; tree-shake won't catch it.
- **`status === 'cancelled'`** uses `.toLocaleLowerCase()` nowhere in current code — match raw status string ('cancelled') against DB enum from migration `20260312100000_godentist_scheduled_reminders.sql` line 17.
- **DON'T fetch `loadReminders` (flat) anymore on tab open** — replace with `getScheduledRemindersGroupedByScrape`. The flat fn stays for back-compat with anything else that calls it, but the tab uses grouped only.

---

### 8. DB migration: `godentist_scrape_history` columns + (optional) `total_citas`

**Analog:**
- Original schema: `supabase/migrations/20260311100000_godentist_scrape_history.sql` (entire file)
- Timezone-aware default: `supabase/migrations/20260312100000_godentist_scheduled_reminders.sql` line 21 (`timezone('America/Bogota', NOW())`)

**Pattern to COPY** (migration file format from `20260312100000_*`):

**File path:** `supabase/migrations/20260513XXXXXX_godentist_scrape_inconsistent_flag.sql` (timestamp TBD; planner picks).

```sql
-- godentist-scraping-structural-v2: add D-08 cross-sede canary columns to scrape_history
-- + optional D-15/RESEARCH-mentioned audit column total_citas (parsed from toolbar)
-- Per CLAUDE.md REGLA 5: apply to prod BEFORE pushing code that references these columns.

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS inconsistent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS inconsistency_details JSONB DEFAULT NULL;

-- Optional audit (per RESEARCH.md Wave 0): total citas parsed from "Total de citas: N" toolbar
ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS total_citas INTEGER DEFAULT NULL;

-- Index for D-08 canary list view (find recent inconsistent scrapes)
CREATE INDEX IF NOT EXISTS idx_godentist_history_inconsistent
  ON godentist_scrape_history(workspace_id, created_at DESC)
  WHERE inconsistent = true;
```

**Risks/landmines:**
- **`NOT NULL DEFAULT false`**: existing rows backfill to `false` automatically. Don't use `NULL`-allowed boolean — the UI uses `entry.scrape.inconsistent` as a truthy gate; `NULL` triples the state space.
- **`IF NOT EXISTS`** is mandatory because REGLA 5 mandates manual apply BEFORE push; if user re-applies the migration after rollback, idempotency saves them.
- **Partial index `WHERE inconsistent = true`** is the right shape (per the existing partial-index pattern in `20260312100000_*` line 26-27 `WHERE status = 'pending'`) — inconsistent scrapes are rare in prod, full index would waste space.
- **CLAUDE.md REGLA 5 BLOCKING**: planner MUST pause for user to apply before any code push references these columns. Wave 0 in RESEARCH.md is explicit about this.

---

### 9. Smoke E2E validator — `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs`

**Analog:** `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` (entire file — 2-invariant base to extend to 3 per D-15).

**Pattern to COPY** (existing file lines 21-86 for setup + invariant pattern) with **3rd invariant added**:

```javascript
#!/usr/bin/env node
// Smoke E2E validator for godentist-scraping-structural-v2 standalone (D-15).
// Usage:
//   node validate.cjs  (defaults to ./smoke_1.json ... ./smoke_5.json — D-14 mandates 5 runs)
//   node validate.cjs path1.json path2.json ...
//
// Pass criteria (per CONTEXT.md D-15):
//   (a) ratio (total / unique by phone+hora) === 1.0 per sede [conserved]
//   (b) overlap (phone+hora intersection) === 0 between every pair of sedes [conserved]
//   (c) NUEVO: ningún (phone, fecha) aparece en >1 sede globalmente
//
// Exit code 0 if pass, 1 if fail.

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const dir = __dirname
// D-14: default to 5 files (was 3 in old validator)
const files = args.length > 0
  ? args
  : [1,2,3,4,5].map(n => path.join(dir, `smoke_${n}.json`))

let allPassed = true

for (const file of files) {
  if (!fs.existsSync(file)) { console.log(`FAIL ${file}: file not found`); allPassed = false; continue }
  let data
  try { data = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch (err) { console.log(`FAIL ${file}: invalid JSON (${err.message})`); allPassed = false; continue }
  if (!data.success || !Array.isArray(data.appointments)) {
    console.log(`FAIL ${file}: not a success response (success=${data.success})`)
    if (data.error) console.log(`  error: ${data.error}`)
    allPassed = false; continue
  }
  const apps = data.appointments

  // ── Invariant (a): ratio per sede ──
  const bySede = {}
  for (const a of apps) {
    const key = a.sucursal || '<no-sede>'
    if (!bySede[key]) bySede[key] = []
    bySede[key].push(`${a.telefono}|${a.hora}`)
  }
  const ratios = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: keys.length / unique }
  }

  // ── Invariant (b): overlap pairwise ──
  const sedes = Object.keys(bySede)
  const overlaps = []
  for (let i = 0; i < sedes.length; i++) {
    for (let j = i + 1; j < sedes.length; j++) {
      const a = new Set(bySede[sedes[i]])
      const b = new Set(bySede[sedes[j]])
      const inter = [...a].filter(x => b.has(x))
      overlaps.push({ pair: `${sedes[i]} x ${sedes[j]}`, intersection: inter.length, samples: inter.slice(0, 3) })
    }
  }

  // ── NEW Invariant (c): no (phone, fecha) in >1 sede globally — D-15 ──
  const phoneFechaToSedes = new Map()  // phone|fecha → Set<sede>
  for (const a of apps) {
    const k = `${a.telefono}|${data.date}`
    if (!phoneFechaToSedes.has(k)) phoneFechaToSedes.set(k, new Set())
    phoneFechaToSedes.get(k).add(a.sucursal || '<no-sede>')
  }
  const crossSedeViolations = [...phoneFechaToSedes].filter(([, s]) => s.size > 1).map(([k, s]) => ({ key: k, sedes: [...s] }))

  // ── Verdict ──
  const ratiosBad = Object.entries(ratios).filter(([, r]) => r.ratio !== 1)
  const overlapsBad = overlaps.filter(o => o.intersection !== 0)
  const pass = ratiosBad.length === 0 && overlapsBad.length === 0 && crossSedeViolations.length === 0

  console.log(`${pass ? 'PASS' : 'FAIL'} ${path.basename(file)}`)
  console.log(`  date: ${data.date}, totalAppointments: ${apps.length}, sedes: ${sedes.join(', ')}`)
  console.log(`  ratios: ${JSON.stringify(ratios)}`)
  if (overlapsBad.length > 0) console.log(`  overlaps_bad: ${JSON.stringify(overlapsBad)}`)
  if (crossSedeViolations.length > 0) console.log(`  cross_sede_violations: ${JSON.stringify(crossSedeViolations)}`)

  if (!pass) allPassed = false
}

console.log('')
if (allPassed) { console.log('SMOKE PASS — 5/5 files clean (3 invariants: ratio=1.0, overlap=0, no cross-sede)'); process.exit(0) }
console.log('SMOKE FAIL — review JSON files above')
process.exit(1)
```

**Risks/landmines:**
- **Default file list is now 5, not 3** (D-14). Don't keep `[smoke_1, smoke_2, smoke_3]` default.
- **`crossSedeViolations` uses `data.date`** (single date per file). If a future smoke covers multiple dates per file, change the key to `${a.telefono}|${a.fecha || data.date}`. RESEARCH.md scope is single-date scrapes, so fine for now.
- **`<no-sede>` fallback**: if the new paradigm fully succeeds, no appointment should have empty sede. Keep the fallback for debug visibility but flag it as an invariant violation if it ever appears.
- **Old validator file location is reference-only** — Don't edit `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` (other standalone's artifact). Write to the new standalone's directory.

---

## Shared Patterns

### Authentication / Workspace Scoping

**Source:** `src/app/actions/godentist.ts` lines 108-115 (verbatim across every server action in the file).
**Apply to:** All new server actions in this standalone (`getScheduledRemindersGroupedByScrape` etc.).

```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function someAction(...) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }
  // ... then createAdminClient() for queries
}
```

CLAUDE.md REGLA 3 satisfied because every DB query filters `eq('workspace_id', workspaceId)`.

---

### Feature Flag Reading

**Source:** `src/app/api/inngest/route.ts` consumer at `webhook-processor.ts` §572-577 (canonical pattern); helper at `src/lib/domain/platform-config.ts` §96-134.
**Apply to:** D-10 `use_new_godentist_scraping` flag in `scrapeAppointments`.

```typescript
const { getPlatformConfig } = await import('@/lib/domain/platform-config')
const useNewScraping = await getPlatformConfig<boolean>('use_new_godentist_scraping', true)
// fallback=true means new paradigm is default ON (D-10 mandate)
```

**Cache TTL is 30s** (built into helper) — rollback via SQL `UPDATE platform_config SET value = 'false' WHERE key = 'use_new_godentist_scraping'` takes effect within 30s without redeploy.

---

### Inngest Event Emission (Serverless-Safe)

**Source:** `src/lib/bold/client.ts` §61-70 (the `await (inngest.send as any)(...)` pattern).
**Apply to:** D-08 `godentist/scrape.inconsistent` emission in `scrapeAppointments`.

```typescript
// CRITICAL Pitfall 8 (per MEMORY.md): ALWAYS await inngest.send in serverless
// — Vercel terminates lambda early after res.json(); in-flight unawaited
// inngest.send promises are dropped.
await (inngest.send as any)({
  name: 'godentist/scrape.inconsistent',
  data: { workspaceId, scrapedDate, crossSedePhones, detectedAt: new Date().toISOString() },
})
```

The `(inngest.send as any)` type-coercion pattern is documented in MEMORY.md as the project convention for custom event types.

---

### Error Class Pattern (Robot Adapter)

**Source:** `godentist/robot-godentist/src/adapters/godentist-adapter.ts` lines 47-68 (`SedeRefreshFailedError`).
**Apply to:** New `FilterDriftError` + `PaginationStuckError`.

```typescript
export class XxxError extends Error {
  constructor(
    public readonly fieldA: string,
    public readonly fieldB: number,
    // ...
  ) {
    super(`Human-readable: ${fieldA} ${fieldB}`)
    this.name = 'XxxError'
  }
}
```

**Why this pattern** (verbatim from adapter §52-55 comment):
> Primera clase Error custom del robot. Discriminador `instanceof` permite type-safety en server.ts sin recurrir a `.code` string-matching.

---

### Console Log Convention

**Source:** Every console line in the adapter prefixed `[GoDentist]` (47 occurrences in current file — `grep -c "\\[GoDentist\\]"` shows the convention is universal).
**Apply to:** All new code in `godentist-adapter.ts` (paradigm F primitives).

```typescript
console.log(`[GoDentist] Sucursal selected: ${sucursal.label}`)
console.log(`[GoDentist] Found ${sucursales.length} sucursales`)
console.error(`[GoDentist] Extraction error (${sucursal}):`, err)
```

Railway log filtering depends on this prefix — `railway logs -s Godentist <id> --since X | grep "\[GoDentist\]"` is the operator's primary forensics tool.

---

### Migration Timezone Default

**Source:** `supabase/migrations/20260312100000_godentist_scheduled_reminders.sql` line 21.
**Apply to:** Any future timestamp column in this standalone (not needed for current scope but documented for completeness).

```sql
created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
```

CLAUDE.md REGLA 2: TODA fecha en zona America/Bogota.

---

## No Analog Found

All files in scope have at least a role-match or exact analog in the repo. No file requires inventing a pattern from RESEARCH.md alone.

| Concern | Note |
|---------|------|
| (none) | Every file maps to an existing analog. RESEARCH.md provides paradigm F snippets that supplement (not replace) the in-repo patterns. |

---

## Metadata

**Analog search scope:**
- `godentist/robot-godentist/src/adapters/`
- `godentist/robot-godentist/src/api/`
- `godentist/robot-godentist/src/types/`
- `src/app/actions/`
- `src/app/(dashboard)/confirmaciones/`
- `src/app/api/inngest/`
- `src/inngest/`
- `src/lib/bold/`
- `src/lib/domain/`
- `src/lib/agents/production/`
- `src/lib/agents/somnio-v4/`
- `supabase/migrations/`
- `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/`

**Files scanned (read in full or via Grep+targeted Read):** 14
**Pattern extraction date:** 2026-05-13
**RESEARCH.md companion:** every code snippet in this PATTERNS.md is cross-referenced against the RESEARCH.md "Code Examples" section to avoid duplication. RESEARCH.md remains the source of truth for the paradigm F algorithm; PATTERNS.md is the source of truth for "how this codebase shapes its code" (auth, logging, error classes, migration format, UI cards).
