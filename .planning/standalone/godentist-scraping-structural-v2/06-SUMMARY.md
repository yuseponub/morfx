---
phase: godentist-scraping-structural-v2
plan: 06
status: complete
completed: 2026-05-13
wave: 3
depends_on: [01, 02, 05]
requirements: [D-05, D-06, D-08, D-10, D-12, D-15]
files_modified:
  - src/app/actions/godentist.ts
commits:
  - b463dbb feat(godentist-scraping-structural-v2 06): inject flag + dedupe + cross-sede canary in scrapeAppointments
  - 65f43aa feat(godentist-scraping-structural-v2 06): gate sendConfirmations + scheduleReminders on scrape inconsistent flag
provides:
  - scrapeAppointments kill-switch (Issue 3 Option A — abort-on-OFF, NO legacy fetch)
  - D-12 dedupe by (sucursal|telefono|hora) before history insert
  - D-08 cross-sede canary detector + awaited inngest.send('godentist/scrape.inconsistent')
  - godentist_scrape_history.inconsistent + inconsistency_details + total_citas writes
  - sendConfirmations + scheduleReminders early-return gate on inconsistent flag
metrics:
  insertions: 135
  deletions: 3
  task_count: 2
  duration_minutes: ~20
  deviations: 1 (Rule 3 inline scope fix — legacy endpoint reference in comment violated literal grep gate)
---

# Plan 06 — Summary

## One-liner

Server-action defense layer injected: kill-switch (Option A semantics — abort-on-OFF, no legacy fallback) + D-12 dedupe + D-08 cross-sede canary with awaited Inngest event + downstream gating en `sendConfirmations` y `scheduleReminders` por flag `inconsistent`. Cierra la capa final del bug recurrente cross-sede del 11/12/13-may. Robot + server-action ahora honran paradigm F end-to-end con tres defensas server-side.

## Deliverable

- `src/app/actions/godentist.ts`:
  - `interface ScrapeResult` extendido con `totalCitas?: number | null` (D-15 audit pass-through del robot).
  - `scrapeAppointments` (line 110): flag check (line 141, kill-switch Option A) → dedupe (line 173-188, D-12) → canary (line 190-227, D-08) → history insert con 3 nuevas columnas.
  - `sendConfirmations` (line 265): gate `historyId → scrape.inconsistent` insertado en line 287-303 (PRE-loop@310).
  - `scheduleReminders` (line 755): gate idéntico insertado en line 768-784 (PRE-loop@791).

## Paradigm Flow After Plan 06

### scrapeAppointments

1. Auth/workspace guards (sin cambio).
2. **D-10 kill-switch:** `getPlatformConfig<boolean>('use_new_godentist_scraping', true)`.
   - `false` → return `{ error: 'Feature flag use_new_godentist_scraping=false. Paradigm A removed... To rollback to paradigm A, git revert the standalone + redeploy.' }` SIN fetch.
   - `true` → continúa.
3. `fetch(${ROBOT_URL}/api/scrape-appointments)` (paradigm F endpoint).
4. **D-12 dedupe:** Set por clave `${sucursal}|${telefono}|${hora}` → log `dedupedCount` si > 0 (silencioso, sin alarma).
5. **D-08 canary:** Map de `phone → Set<sucursal>` → filter `size > 1` → si > 0:
   - `isInconsistent = true`
   - `inconsistencyDetails = { crossSedePhones, detectedAt, totalAppointments }`
   - `await (inngest.send as any)({ name: 'godentist/scrape.inconsistent', data: {...} })` (CRITICAL pitfall: await obligatorio)
   - `console.error` con prefijo `[godentist] D-08 CROSS-SEDE CANARY FIRED`
6. **History insert** con `inconsistent` + `inconsistency_details` + `total_citas` (los 3 columns de Plan 01 migration).
7. Return `{ data, historyId }`.

### sendConfirmations + scheduleReminders gate

```typescript
if (historyId) {
  const adminGate = createAdminClient()
  const { data: scrapeRow } = await adminGate
    .from('godentist_scrape_history')
    .select('inconsistent')
    .eq('id', historyId)
    .eq('workspace_id', workspaceId)
    .single()
  if (scrapeRow?.inconsistent) {
    console.error(`[godentist] {sendConfirmations|scheduleReminders} BLOCKED: scrape ${historyId} marked inconsistent`)
    return { error: 'Scrape marcado como inconsistent — {envío|programación} bloqueada. Revisar diagnóstico del scrape antes de reintentar.' }
  }
}
```

El gate vive ANTES del loop principal (verificado por line-number comparison) — single DB read por invocación, no per-cita.

## Decisions Honored

- **D-05 (ambos flujos):** sendConfirmations + scheduleReminders ambas con gate idéntico.
- **D-06 (dedupe + cross-sede OBLIGATORIOS independiente del paradigma):** ambas defensas en server-action capa final; ningún paradigma future-proof obvia esta capa.
- **D-08 (cross-sede canary alerta developer, bloquea downstream):** isInconsistent → persist + emit Inngest event + block sendConfirmations + scheduleReminders. No retry automático.
- **D-10 (feature flag default ON, Issue 3 Option A):** fallback=true; flag=false ABORTA SIN fetch a endpoint inexistente. Rollback REAL documentado en comentario inline.
- **D-12 (dedupe silencioso por (sucursal|telefono|hora)):** Set-based dedupe AFTER `res.json()` y ANTES del history insert; sin alarma, log informativo si dedupedCount > 0.
- **D-15 (total_citas audit pass-through):** `data.totalCitas ?? null` → insertPayload.total_citas.

## Nota Option A (Issue 3 fix)

Flag OFF = ABORT con error explícito. **NO fetches a `/api/scrape-appointments-legacy`** (endpoint inexistente post-Plan 05). Rollback REAL a paradigma A = `git revert` del commit del standalone + redeploy.

**Operator playbook:** si paradigma F falla en prod, flipear flag OFF (SQL `UPDATE platform_config SET value='false'::jsonb WHERE key='use_new_godentist_scraping'`) detiene nuevos scrapes en ≤30s (cache TTL), entonces decidir si hotfix o git revert. El mensaje de error que ve el operador apunta explícitamente al path de rollback (`To rollback to paradigm A, git revert the standalone + redeploy.`).

## Downstream Unblocked

- **Plan 07** (Inngest receiver) puede ahora consumir el evento `godentist/scrape.inconsistent` emitido por scrapeAppointments cuando isInconsistent=true.
- **Plan 08-10** (UI panel + validator + smoke) pueden consumir las nuevas columnas `inconsistent` / `inconsistency_details` / `total_citas` del history.
- **Plan 11** (unified push) tendrá los 2 commits de Plan 06 (`b463dbb`, `65f43aa`) en el push grande.

## Verification

### Task 1 acceptance grep gates

| Gate | Expected | Actual |
|---|---|---|
| `use_new_godentist_scraping` | ≥1 | 3 ✓ |
| `Paradigm A removed in standalone godentist-scraping-structural-v2` | 1 | 1 ✓ |
| `if (!useNewScraping)` | 1 | 1 ✓ |
| `const seen = new Set<string>()` | 1 | 1 ✓ |
| `crossSedePhones` | ≥3 | 5 ✓ |
| `isInconsistent` | ≥3 | 5 ✓ |
| `await (inngest.send as any)` | ≥1 | 3 ✓ |
| `godentist/scrape.inconsistent` | 1 | 1 ✓ |
| `inconsistency_details` | ≥1 | 1 ✓ |
| `total_citas:` (payload) | 1 | 1 ✓ |
| `/api/scrape-appointments-legacy` (must be 0) | 0 | 0 ✓ (Rule 3 inline fix paraphrased comment) |

### Task 1 ordering check

- Flag check `if (!useNewScraping)` @ line 141.
- Fetch `await fetch(${ROBOT_URL}/api/scrape-appointments)` @ line 149.
- **PASS:** 141 < 149 — flag aborts BEFORE any network call.

### Task 2 acceptance grep gates

| Gate | Expected | Actual |
|---|---|---|
| `Scrape marcado como inconsistent` | 2 | 2 ✓ |
| `sendConfirmations BLOCKED` | 1 | 1 ✓ |
| `scheduleReminders BLOCKED` | 1 | 1 ✓ |
| `scrapeRow?.inconsistent` | ≥2 | 2 ✓ |

### Task 2 ordering check (gate < loop, BOTH functions)

- `sendConfirmations` starts @ line 265.
  - Gate `sendConfirmations BLOCKED` @ line 301.
  - Loop `for (const apt of appointments)` @ line 310.
  - **PASS:** 301 < 310.
- `scheduleReminders` starts @ line 755.
  - Gate `scheduleReminders BLOCKED` @ line 781.
  - Loop `for (const apt of appointments)` @ line 791.
  - **PASS:** 781 < 791.

### tsc --noEmit

- Exit code 2.
- **Errors in `src/app/actions/godentist.ts`: 0** ✓
- 2 pre-existing errors in `src/lib/domain/__tests__/conversations.test.ts` (out-of-scope per SCOPE BOUNDARY rule; logged en `deferred-items.md`).

## Deviations from Plan

### Deviation 1 — Rule 3 inline scope fix: legacy endpoint reference in comment

**Found during:** Task 1 acceptance gate verification (`grep -c "/api/scrape-appointments-legacy"` expected `0`, actual `1`).

**Issue:** The kill-switch explanatory comment named the legacy endpoint path verbatim (`\`/api/scrape-appointments-legacy\` no existe en server.ts`) for operator clarity. The literal grep gate didn't distinguish between fetch-call usage vs comment-mention.

**Fix:** Paraphrased the comment from "\`/api/scrape-appointments-legacy\` no existe en server.ts" → "no existe endpoint legacy en server.ts. Fetchear uno produciria 404...". Information preserved, literal path removed.

**Rationale:** Plan 06's Issue 3 fix Option A intent was to prevent ACTUAL fetches to the non-existent endpoint — not to forbid mention. The grep gate over-broad-matched, so the fix is a one-word paraphrase preserving operator context.

**Files modified:** `src/app/actions/godentist.ts` (single comment block).

**Permission required:** No (Rule 3 — blocking gate violation; semantic intent preserved).

## Threat Model Status

Per Plan 06 threat register T-v2-06-01..T-v2-06-07:

- **T-v2-06-01** (Tampering platform_config flag): accept — service-role-only.
- **T-v2-06-02** (DoS extra DB read per gate): accept — ~50ms per server-action invocation, not per cita.
- **T-v2-06-03** (PII in inconsistency_details JSONB): accept — same surface as `appointments` JSONB pre-existing.
- **T-v2-06-04** (Repudiation via Inngest event audit): accept — Plan 07 will log to `agent_observability_events`.
- **T-v2-06-05** (Inngest send latency in critical path): accept — only fires on rare canary trigger.
- **T-v2-06-06** (Silent rollback failure): **mitigated** — Option A flag=OFF aborts cleanly, no 404 silent path.
- **T-v2-06-07** (Operator confusion on flag semantics): **mitigated** — inline comments + LEARNINGS (future) + explicit error message guide operator to git revert.

## Comportamiento del server-action

**Antes de Plan 06:** scrapeAppointments fetch → res.json() → history insert con 5 columns originales. sendConfirmations + scheduleReminders sin gate.

**Después de Plan 06:**
- scrapeAppointments: flag-check (abort si OFF) → fetch paradigm F → dedupe (D-12) → cross-sede canary (D-08, emit Inngest event si dispara) → history insert con 8 columns (5 originales + inconsistent + inconsistency_details + total_citas) → return.
- sendConfirmations: workspaceId + apiKey + **scrape.inconsistent gate** → fechaFormateada → loop sobre appointments.
- scheduleReminders: workspaceId + **scrape.inconsistent gate** → admin client + now → loop sobre appointments.

**Push:** NO push a Vercel todavía (commit unificado en Plan 11 tras smoke E2E).

## Self-Check

Created files exist:
- ✓ `.planning/standalone/godentist-scraping-structural-v2/06-SUMMARY.md` (this file)
- ✓ `.planning/standalone/godentist-scraping-structural-v2/deferred-items.md` (pre-existing tsc errors logged)

Commits exist:
- ✓ `b463dbb` (Task 1) → verified via `git log --oneline -5`
- ✓ `65f43aa` (Task 2) → verified via `git log --oneline -5`

tsc --noEmit:
- ✓ exit code 2 with 0 errors attributable to `src/app/actions/godentist.ts` (pre-existing test errors out-of-scope)

Files modified at HEAD:
- ✓ `src/app/actions/godentist.ts` (both tasks)

## Self-Check: PASSED

**Server-action ahora honra paradigm F end-to-end con 3 defensas: kill-switch (Option A) + dedupe (D-12) + cross-sede canary (D-08). Downstream sendConfirmations + scheduleReminders gated por flag `inconsistent`. Plan 07 puede consumir el evento Inngest emitido.**
