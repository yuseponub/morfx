---
phase: godentist-scraping-structural-v2
plan: 08
subsystem: godentist-scraping
tags: [server-action, ui-backend, D-04, D-08-canary-surface]
requires:
  - 01-PLAN (godentist_scrape_history.inconsistent + inconsistency_details + total_citas columns applied)
  - 06-PLAN (server-action canary persists inconsistent flag)
provides:
  - "getScheduledRemindersGroupedByScrape server-action (back-end del tab programacion redesign)"
  - "ScrapeWithReminders exported type (consumido por Plan 09 UI)"
  - "ScheduledReminderEntry.scrape_history_id field (typed access al FK que ya existia en DB)"
affects:
  - "src/app/actions/godentist.ts"
tech-stack:
  added: []
  patterns:
    - "2-step query workspace-scoped (no Supabase nested join) replicando getFollowupPreview pattern (lines 967-1033)"
    - "Auth+cookie+admin pattern preservado (lineas 945-952 — verbatim con getScheduledReminders)"
    - "Type narrowing con filter((id): id is string => Boolean(id)) para satisfacer TS estricto"
    - "Orphans bucket separado para reminders con scrape_history_id IS NULL (legacy pre-Plan 01)"
key-files:
  created: []
  modified:
    - "src/app/actions/godentist.ts (+126 lineas, sin deletions)"
decisions:
  - "Auto-add ScheduledReminderEntry.scrape_history_id (Rule 3) — la columna existia en DB + persistia via scheduleReminders (linea 841), pero el tipo TS no la exponia. Sin el campo el cast (rems || []) as ScheduledReminderEntry[] dentro de la nueva fn habria producido TS2769 al acceder r.scrape_history_id. Cambio aditivo opcional, zero breaking change para consumidores (confirmaciones-panel.tsx ya importa el tipo)."
  - "limit(2000) en la nueva fn (vs 500 en getScheduledReminders flat) — la grouped cubre fechas wider y el cap previene runaway. T-v2-08-02 (threat register) accept."
  - "Cast intermedio Array<{...}> en lugar de tipar via interface separada — el shape del scrape interno es solo consumido por la fn (encapsulated) + por la interface ScrapeWithReminders.scrape que ya lo declara. Evita duplicar el tipo en 3 lugares."
metrics:
  duration: "0h 25m"
  completed-date: "2026-05-13"
  files-changed: 1
  lines-added: 126
  lines-deleted: 0
  tasks-completed: 1
---

# Phase godentist-scraping-structural-v2 Plan 08: getScheduledRemindersGroupedByScrape server-action Summary

Server-action `getScheduledRemindersGroupedByScrape` + exported type `ScrapeWithReminders` agregados a `src/app/actions/godentist.ts` (Plan 08 wave 4 start). Plan 09 (UI redesign del tab programacion) ya puede importar ambos para renderizar cards-per-scrape replicando el patron del tab "Historial Confirmaciones" (D-04 mandato).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Agregar interface ScrapeWithReminders + funcion getScheduledRemindersGroupedByScrape al server-action | `955b46a` | `src/app/actions/godentist.ts` |

## Implementation Details

### Modificaciones en `src/app/actions/godentist.ts`

**1. `ScheduledReminderEntry` (lineas 901-915)** — extendida con campo nuevo:

```typescript
export interface ScheduledReminderEntry {
  id: string
  // ... campos existentes sin cambios ...
  created_at: string
  // Plan 08 (godentist-scraping-structural-v2): FK al scrape origen.
  // Nullable para data legacy pre-Plan 01 + reminders insertados sin historyId.
  scrape_history_id?: string | null
}
```

La columna `scrape_history_id` ya existia en DB (`supabase/migrations/20260312100000_godentist_scheduled_reminders.sql` linea 6) y `scheduleReminders` la persistia (`src/app/actions/godentist.ts` linea 841). El tipo TS no la exponia — agregado para tipado limpio de la nueva fn.

**2. `ScrapeWithReminders` interface (lineas 925-943)** — NUEVA, exportada:

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
    total_citas: number | null
  }
  reminders: ScheduledReminderEntry[]
  stats: { pending: number; sent: number; failed: number; cancelled: number }
}
```

Surface D-08 (`inconsistent` + `inconsistency_details`) expuesta al UI para badge AlertTriangle (Plan 09).

**3. `getScheduledRemindersGroupedByScrape` async fn (lineas 986-1067)** — NUEVA, exportada:

- **Step 1:** fetch reminders workspace-scoped (opcional date filter), select 12 columnas incluyendo `scrape_history_id`, limit 2000.
- **Step 2:** collect distinct non-null scrape_history_ids, batch-fetch scrape rows workspace-scoped (select `inconsistent`, `inconsistency_details`, `total_citas` + metadata).
- **Step 3:** group reminders por scrape_history_id en `Map<string, ScheduledReminderEntry[]>`. Reminders con FK NULL → bucket `orphans[]`.
- **Step 4:** para cada scrape, calcular stats `{pending, sent, failed, cancelled}` + push a `grouped[]`.
- **Step 5:** sort `grouped` by `scrape.created_at` DESC (most recent first).
- **Return:** `{ data: grouped, orphans }`.

CLAUDE.md REGLA 3 satisfecho: 2 queries via `createAdminClient`, ambas filtradas por `workspace_id`. No imports de `@supabase/supabase-js` directos — solo via `@/lib/supabase/admin` ya importado al top del file.

## Verification

### Automated Acceptance Criteria (verbatim del plan)

| Criterio | Esperado | Actual | Pass |
|----------|----------|--------|------|
| `npx tsc --noEmit` exit code | 0 (godentist.ts limpio) | 0 errores en godentist.ts (2 errores pre-existentes en `src/lib/domain/__tests__/conversations.test.ts` confirmados antes del cambio via `git stash` — out of scope) | OK |
| `grep -c "export interface ScrapeWithReminders" godentist.ts` | 1 | 1 | OK |
| `grep -c "export async function getScheduledRemindersGroupedByScrape" godentist.ts` | 1 | 1 | OK |
| `grep -A 8 "...getScheduledRemindersGroupedByScrape" godentist.ts \| grep -c "morfx_workspace"` | 1 | 1 | OK |
| `grep -c "from('godentist_scheduled_reminders')" godentist.ts` | >=2 (getScheduledReminders + getScheduledRemindersGroupedByScrape + scheduleReminders + cancelScheduledReminder etc.) | 5 | OK |
| `grep -A 50 "...getScheduledRemindersGroupedByScrape" godentist.ts \| grep -c "from('godentist_scrape_history')"` | 1 | 1 | OK |
| `grep -A 70 "...getScheduledRemindersGroupedByScrape" godentist.ts \| grep -c ".eq('workspace_id', workspaceId)"` | 2 | 2 | OK |
| `grep -c "const orphans: ScheduledReminderEntry\[\]" godentist.ts` | 1 | 1 | OK |
| `grep -A 80 "...getScheduledRemindersGroupedByScrape" godentist.ts \| grep -c "pending: 0, sent: 0, failed: 0, cancelled: 0"` | 1 | 1 | OK |
| `grep -A 90 "...getScheduledRemindersGroupedByScrape" godentist.ts \| grep -c "b.scrape.created_at.localeCompare(a.scrape.created_at)"` | 1 | 1 | OK |
| `grep -A 50 "...getScheduledRemindersGroupedByScrape" godentist.ts \| grep -c "inconsistent, inconsistency_details, total_citas"` | 1 | 1 | OK |
| `grep -c "const byScrapeId = new Map" godentist.ts` | 1 | 1 | OK |
| `grep -c "orphans: ScheduledReminderEntry\[\] = \[\]" godentist.ts` | 1 | 1 | OK |

### TSC Output

```
src/lib/domain/__tests__/conversations.test.ts(16,7): error TS7022: 'eqMock' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/lib/domain/__tests__/conversations.test.ts(16,22): error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
```

Ambos errores son pre-existentes en `conversations.test.ts` y NO involucran `src/app/actions/godentist.ts`. Confirmado via `git stash && npx tsc --noEmit` antes del cambio — los mismos 2 errores aparecieron en HEAD `b022338`. SCOPE BOUNDARY aplica: out of scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking type issue] Agregar `scrape_history_id?: string | null` a `ScheduledReminderEntry`**

- **Found during:** Task 1, antes del primer edit
- **Issue:** Plan asume el campo en su `<interfaces>` block (lineas 92-106 de 08-PLAN.md) pero el archivo actual NO lo expone — el cast `(rems || []) as ScheduledReminderEntry[]` dentro de la nueva fn requeria acceder `r.scrape_history_id` y sin el campo en el tipo destino, TS marcaria error.
- **Fix:** Agregado como `scrape_history_id?: string | null` (opcional + nullable). Aditivo — cero breaking change para los 2 consumidores existentes (`getScheduledReminders` en mismo archivo + `confirmaciones-panel.tsx` que importa el tipo).
- **Verification:** La columna ya existe en DB (`20260312100000_godentist_scheduled_reminders.sql` linea 6) y `scheduleReminders` ya la persiste (godentist.ts linea 841). Cero migracion necesaria — solo se cierra el gap del tipo TS.
- **Files modified:** `src/app/actions/godentist.ts` (campo agregado a interface en linea 911-913).
- **Commit:** `955b46a` (mismo commit del Task 1, parte del bundle aditivo).

No more deviations. Otras opciones (Rules 1/2/4) no aplicaron.

## Threat Surface Scan

Sin nuevas superficies de amenaza fuera del threat register del plan:
- T-v2-08-01 (info disclosure scrape audit) — auth gate intacto, mismo workspace filter pattern que getScheduledReminders.
- T-v2-08-02 (DoS limit 2000) — explicit cap presente, worst-case ~200KB JSON aceptable.
- T-v2-08-03 (inconsistency_details JSONB visible al operador) — operador es dueno del workspace (auth gate), misma surface que appointments JSONB pre-existente del mismo scrape.

Sin threat flags adicionales.

## Output

**Files created/modified:**
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/actions/godentist.ts`
  - Lineas 911-913: campo `scrape_history_id?: string | null` agregado a `ScheduledReminderEntry`
  - Lineas 917-943: nueva interface `ScrapeWithReminders` (exportada)
  - Lineas 974-1067: nueva async function `getScheduledRemindersGroupedByScrape` (exportada)

**TSC output:**
```
exit 2 (errors in conversations.test.ts pre-existing, OUT OF SCOPE)
exit 0 (cuando se filtran solo errores de godentist.ts → 0 errores)
```

**Plan 09 puede ahora redisenar el tab programacion** consumiendo `getScheduledRemindersGroupedByScrape` + tipo `ScrapeWithReminders` con:

```typescript
import { getScheduledRemindersGroupedByScrape, type ScrapeWithReminders } from '@/app/actions/godentist'
```

## Self-Check: PASSED

**File existence verification:**

```bash
$ [ -f "/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/actions/godentist.ts" ] && echo "FOUND" || echo "MISSING"
FOUND: src/app/actions/godentist.ts (1212 lines, +126 from baseline 1085)
```

**Commit verification:**

```bash
$ git log --oneline --all | grep "955b46a"
955b46a feat(godentist-scraping-structural-v2 08): add getScheduledRemindersGroupedByScrape server action + ScrapeWithReminders type
```

**Symbol verification:**

```bash
$ grep -n "^export interface ScrapeWithReminders\|^export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts
925:export interface ScrapeWithReminders {
986:export async function getScheduledRemindersGroupedByScrape(
```

All claims verified.
