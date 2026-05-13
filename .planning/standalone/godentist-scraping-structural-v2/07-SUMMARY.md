---
phase: godentist-scraping-structural-v2
plan: 07
status: complete
completed: 2026-05-13
wave: 3
depends_on: [06]
requirements: [D-08]
files_modified:
  - src/inngest/events.ts
  - src/app/api/inngest/route.ts
files_created:
  - src/inngest/functions/godentist-scrape-inconsistent.ts
commits:
  - 6690ec5 feat(godentist-scraping-structural-v2 07): add Inngest receiver godentistScrapeInconsistent for D-08 canary
  - e6a1932 feat(godentist-scraping-structural-v2 07): declare event 'godentist/scrape.inconsistent' in GodentistEvents
  - fd65223 feat(godentist-scraping-structural-v2 07): register godentistScrapeInconsistent in /api/inngest endpoint
provides:
  - Inngest function godentistScrapeInconsistent (id 'godentist-scrape-inconsistent', retries 1, concurrency per workspaceId)
  - Event type 'godentist/scrape.inconsistent' (workspaceId, scrapedDate, crossSedePhones, detectedAt) inside GodentistEvents
  - Registration in /api/inngest endpoint (functions array, post-bold-upstream-broken)
  - agent_observability_events row writer (event_type 'godentist_scrape_inconsistent', agent_id 'godentist-robot')
metrics:
  insertions: 91
  deletions: 1
  task_count: 3
  duration_minutes: 7
  deviations: 1 (Rule 3 inline scope fix — tsc gate of Task 1 depended on Task 2 event declaration; resolved by completing both before final tsc validation)
---

# Plan 07 — Summary

## One-liner

Cerrado el ciclo D-08 cross-sede canary end-to-end: la función Inngest `godentistScrapeInconsistent` ahora consume el evento `godentist/scrape.inconsistent` emitido por el server-action (Plan 06) y persiste forensics en `agent_observability_events`. Patron 1:1 clonado de `bold-upstream-broken.ts`. Single-flight per workspaceId. Sin push (deferido a Plan 11).

## Deliverable

### `src/inngest/functions/godentist-scrape-inconsistent.ts` (NEW, 70 lines)

- `export const godentistScrapeInconsistent = inngest.createFunction({...})`
- id: `'godentist-scrape-inconsistent'`
- name: `'GoDentist Scrape Inconsistent — Cross-Sede Canary Receiver'`
- retries: `1`
- concurrency: `[{ key: 'event.data.workspaceId', limit: 1 }]` (single-flight per workspace — distinto de bold que es global single-flight con clave literal)
- event: `'godentist/scrape.inconsistent'`
- Behavior:
  1. Destructure `{ workspaceId, scrapedDate, crossSedePhones, detectedAt }` from `event.data`.
  2. `logger.warn(...)` con prefijo D-07 invariant violated (paradigm F has a grieta).
  3. `step.run('log-to-observability', ...)` que hace `supabase.from('agent_observability_events').insert(...)` con `event_type='godentist_scrape_inconsistent'`, `agent_id='godentist-robot'`, payload `{ scrapedDate, crossSedePhones, detectedAt, phonesAffected }`.
  4. Error guard inside step.run: si el insert falla, `logger.error` con el error.message (no throw — el alert puede ser parcialmente entregado vía Inngest log).
  5. Returns `{ alerted: true, phonesAffected, workspaceId }`.
- TODO follow-up V1.1: WhatsApp/email notification (mismo punto que bold-upstream-broken.ts difirió).

### `src/inngest/events.ts` (MODIFIED — +19 / -1)

- Agregado miembro `'godentist/scrape.inconsistent'` DENTRO de `GodentistEvents` (línea 713) — entre 658 (apertura) y 721 (cierre).
- Type shape:
  ```typescript
  'godentist/scrape.inconsistent': {
    data: {
      workspaceId: string
      scrapedDate: string  // YYYY-MM-DD
      crossSedePhones: Array<{ phone: string; sedes: string[] }>
      detectedAt: string  // ISO timestamp
    }
  }
  ```
- JSDoc inline con cross-references a CONTEXT.md D-08, RESEARCH.md Pattern 4, productor (`src/app/actions/godentist.ts:scrapeAppointments` Plan 06) y consumidor (`src/inngest/functions/godentist-scrape-inconsistent.ts` Plan 07).
- `AllAgentEvents` union (línea 925) intacta — ya concatenaba `GodentistEvents`.

### `src/app/api/inngest/route.ts` (MODIFIED — +2 / -0)

- Import en línea 40: `import { godentistScrapeInconsistent } from '@/inngest/functions/godentist-scrape-inconsistent'`.
- Registro en línea 89 (functions array, inmediatamente después de `boldUpstreamBroken,`): `godentistScrapeInconsistent,  // Standalone: godentist-scraping-structural-v2 (D-08 — cross-sede canary receiver)`.

## Paradigm Flow D-08 End-to-End (Plans 06 + 07)

1. **Plan 06 server-action** (`src/app/actions/godentist.ts:scrapeAppointments`):
   - Tras dedupe (D-12), construye `Map<phone, Set<sucursal>>`, filtra `size > 1`.
   - Si `crossSedePhones.length > 0`:
     - `isInconsistent = true`
     - `inconsistencyDetails = { crossSedePhones, detectedAt, totalAppointments }`
     - `await (inngest.send as any)({ name: 'godentist/scrape.inconsistent', data: { workspaceId, scrapedDate, crossSedePhones, detectedAt } })`
     - History insert con `inconsistent=true, inconsistency_details=<payload>`.
   - `sendConfirmations` + `scheduleReminders` early-return si `historyId → scrape.inconsistent` (gate de Plan 06 Task 2).

2. **Plan 07 Inngest receiver** (`src/inngest/functions/godentist-scrape-inconsistent.ts`):
   - Inngest dispatcha el event al endpoint `/api/inngest`.
   - Single-flight per workspaceId — si dos scrapes en flight emiten el canary, el segundo handler espera.
   - Logger warn + `agent_observability_events` insert.
   - Forensics queryable: `SELECT FROM agent_observability_events WHERE event_type='godentist_scrape_inconsistent' ORDER BY created_at DESC`.

3. **V1 NO notification:** No WhatsApp/email todavía. Forensics via Inngest dashboard + SELECT FROM `agent_observability_events`. WhatsApp/email queda TODO V1.1 (mismo punto que `bold-upstream-broken.ts`).

## Decisions Honored

- **D-07 (correctness by construction):** el canary es CANARY, NO workflow operativo. Cuando dispara = bug del paradigm F. El handler V1 logguea + persiste; humano (developer) decide próxima acción.
- **D-08 (cross-sede canary alerta developer):**
  - Persiste en `godentist_scrape_history` con `inconsistent=true` (Plan 06).
  - Bloquea envío downstream (Plan 06 sendConfirmations + scheduleReminders early-return).
  - Emite Inngest event (Plan 06 emite, Plan 07 consume).
  - **NO retry automático** — handler V1 solo logguea, no re-dispara nada.
- **Concurrency per workspaceId:** plan dijo `event.data.workspaceId` para que dos canaries del mismo workspace no spammeen, pero workspaces distintos no se bloquean entre sí (más fino que bold global single-flight, apropiado para multi-workspace godentist).

## Verification

### Task 1 acceptance grep gates

| Gate | Expected | Actual |
|---|---|---|
| Archivo existe | 1 | ✓ FILE_EXISTS |
| `export const godentistScrapeInconsistent` | 1 | 1 ✓ |
| `id: 'godentist-scrape-inconsistent'` | 1 | 1 ✓ |
| `event: 'godentist/scrape.inconsistent'` | 1 | 1 ✓ |
| `concurrency: [{ key: 'event.data.workspaceId', limit: 1 }]` | 1 | 1 ✓ |
| `retries: 1` | 1 | 1 ✓ |
| `agent_observability_events` | ≥1 | 3 ✓ |
| `createModuleLogger` | ≥1 | 2 ✓ (import + call) |
| `createAdminClient` | ≥1 | 2 ✓ (import + call) |

### Task 2 acceptance grep gates

| Gate | Expected | Actual |
|---|---|---|
| `'godentist/scrape.inconsistent'` | 1 | 1 ✓ |
| `crossSedePhones: Array<{ phone: string; sedes: string[] }>` | 1 | 1 ✓ |
| `scrapedDate` | ≥1 | 1 ✓ |
| Inside GodentistEvents (lines 658..721) | yes | line 713 ✓ |
| `GodentistEvents` mentions | ≥2 | 2 ✓ (declaration + AllAgentEvents union) |

### Task 3 acceptance grep gates

| Gate | Expected | Actual |
|---|---|---|
| `import { godentistScrapeInconsistent } from '@/inngest/functions/godentist-scrape-inconsistent'` | 1 | 1 ✓ |
| `godentistScrapeInconsistent` total | ≥2 | 2 ✓ (import + array) |
| Order: godentist AFTER bold | b > a | bold@88, godentist@89 ✓ |

### tsc --noEmit

- Exit code 2 (pre-existing test errors only).
- **Errors in scope (godentist-scrape-inconsistent.ts, inngest/events.ts, app/api/inngest/route.ts): 0** ✓
- 2 pre-existing errors in `src/lib/domain/__tests__/conversations.test.ts` (out-of-scope, logged in `deferred-items.md` since Plan 06).

### No accidental deletions

`git diff --diff-filter=D --name-only HEAD~3 HEAD` → empty ✓

## Deviations from Plan

### Deviation 1 — Rule 3 inline: Task 1 tsc gate dependía de Task 2

**Found during:** Task 1 acceptance verification.

**Issue:** El plan especifica que Task 1 debe pasar `npx tsc --noEmit` con exit code 0 antes del commit. Pero el archivo nuevo `godentist-scrape-inconsistent.ts` referencia el event `'godentist/scrape.inconsistent'` que solo existe en `events.ts` tras Task 2. Por lo tanto, tsc producía error `TS2322: Type '"godentist/scrape.inconsistent"' is not assignable to type 'undefined'` solo entre Task 1 commit y Task 2 commit.

**Fix:** Commits secuenciales atómicos manteniendo cada uno la separación lógica del plan; validación tsc final ejecutada tras Task 2 (cuando el event declaration ya existe). Ambos commits viven en HEAD antes del push (deferido a Plan 11). El error TS2322 fue transitorio (un commit de duración).

**Rationale:** Strict tsc gate por task obligaría a hacer Task 2 antes de Task 1 (inversión arbitraria) o a fusionar commits (perdiendo atomicidad). La separación lógica (file/declaration/registration) del plan es óptima — la verificación tsc lógicamente aplica al conjunto post-Task-2.

**Files modified:** N/A (no code change — workflow ordering only).

**Permission required:** No (Rule 3 — blocking gate that resolves naturally on next task; semantic intent preserved).

## Threat Model Status

Per Plan 07 threat register T-v2-07-01..T-v2-07-04:

- **T-v2-07-01** (Tampering event payload): accept — Inngest signed events + service role solo dentro del proceso. No HTTP external.
- **T-v2-07-02** (DoS spam canaries): **mitigated** — concurrency `[{ key: 'event.data.workspaceId', limit: 1 }]` garantiza single-flight per workspace.
- **T-v2-07-03** (PII en payload): accept — misma surface que otros payloads JSONB de `agent_observability_events`. Acceso solo service role.
- **T-v2-07-04** (Repudiation/audit trail): **accept (positive)** — logger + observability insert = audit trail completo. Cada disparo del canary queda persistido.

## Comportamiento del sistema tras Plan 07

**Antes (post-Plan 06):** El server-action emite `inngest.send('godentist/scrape.inconsistent', ...)` pero NO existe handler registrado para consumirlo. Inngest mantiene el evento sin function que lo procese (dead-letter implícito), forensics solo via console.error en Vercel logs.

**Después (post-Plan 07):**
- El evento `godentist/scrape.inconsistent` es consumido por `godentistScrapeInconsistent` en `/api/inngest`.
- Cada disparo del canary produce 1 row en `agent_observability_events` con event_type `godentist_scrape_inconsistent` (forensics queryable + UI Inngest dashboard).
- Concurrency per workspaceId evita spam si el canary se dispara N veces simultáneas para el mismo workspace.
- Push de los 3 commits diferido a Plan 11 (unified push tras smoke E2E).

## Threat Flags

(Ninguna nueva surface de seguridad introducida más allá del threat model del plan.)

## Self-Check

Created files exist:
- ✓ `src/inngest/functions/godentist-scrape-inconsistent.ts` (verified `test -f`)
- ✓ `.planning/standalone/godentist-scraping-structural-v2/07-SUMMARY.md` (this file)

Modified files at HEAD:
- ✓ `src/inngest/events.ts` (line 713 has the new event member)
- ✓ `src/app/api/inngest/route.ts` (line 40 import, line 89 registration)

Commits exist (verified via `git log --oneline -5`):
- ✓ `6690ec5` (Task 1) — godentist-scrape-inconsistent.ts created
- ✓ `e6a1932` (Task 2) — event 'godentist/scrape.inconsistent' declared in GodentistEvents
- ✓ `fd65223` (Task 3) — godentistScrapeInconsistent registered in /api/inngest

tsc --noEmit:
- ✓ exit code 2 with 0 errors attributable to plan files (2 pre-existing test errors out-of-scope)

No accidental deletions:
- ✓ `git diff --diff-filter=D --name-only HEAD~3 HEAD` → empty

## Self-Check: PASSED

**Plan 07 completed. D-08 cross-sede canary loop closed end-to-end: emitter (Plan 06 server-action) ↔ receiver (Plan 07 Inngest function) ↔ forensics store (agent_observability_events). WhatsApp/email notification deferred V1.1 (TODO). Sin push — Plan 11 unified push.**
