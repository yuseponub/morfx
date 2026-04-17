---
phase: twilio-to-onurix-migration
plan: 02
subsystem: sms
tags: [twilio-removal, onurix, action-executor, server-actions, domain-layer, sms-workspace-config]

# Dependency graph
requires:
  - phase: twilio-to-onurix-migration/01
    provides: All 4 Somnio automations normalized to action type 'send_sms' (REPARTO migrated, 3 Twilio already had send_sms in DB)
provides:
  - Action executor unified handler (executeSendSms) routing all SMS through domainSendSMS (Regla 3 honrada)
  - Single 'send_sms' entry in action catalog (constants.ts) — category 'SMS', no 'Twilio' category remains
  - ActionType union no longer contains 'send_sms_onurix' (exhaustive check still valid)
  - checkSmsConfigured server action exported from @/app/actions/automations (Plan 03 imports it)
  - getSmsUsage / getSmsUsageChart adapted to provider='onurix' + cost_cop integer COP shape
  - src/lib/twilio/ directory deleted (client.ts + types.ts)
  - /api/webhooks/twilio/status route deleted (entire dir tree removed)
  - Twilio server actions deleted (saveTwilioIntegration, testTwilioConnection, getTwilioIntegration)
affects: [twilio-to-onurix-migration/03 (UI cleanup consumes checkSmsConfigured + getSmsUsage Onurix shape), twilio-to-onurix-migration/04 (npm dep removal)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Action executor delegates to domain layer (Regla 3) — no direct provider clients"
    - "Provider filtering at query layer — sms_messages.provider='onurix' for new metrics, 'twilio' historical rows preserved"
    - "Server action returns rich object ({ configured, balance, hasBalance }) instead of bare boolean — UI can render specific warning text"

key-files:
  created: []
  modified:
    - src/lib/automations/action-executor.ts
    - src/lib/automations/constants.ts
    - src/lib/automations/types.ts
    - src/app/actions/integrations.ts
    - src/app/actions/automations.ts
  deleted:
    - src/lib/twilio/client.ts
    - src/lib/twilio/types.ts
    - src/app/api/webhooks/twilio/status/route.ts

key-decisions:
  - "Removed 'send_sms_onurix' from ActionType union (deviation Rule 2) — required by exhaustive _exhaustive: never check in dispatcher; not explicit in plan but mandatory for typecheck correctness"
  - "Added explicit code comment explaining mediaUrl param is silently ignored — preserves backward compat with stored automations while documenting Onurix's no-MMS limitation"
  - "Renumbered integrations.ts section comments (1, 2, 3) after collapsing Twilio sections (1-3) and reindexing SMS Onurix sections — preserves readability"
  - "Updated SmsUsageData / SmsChartData interface shapes to Onurix model (totalSms, totalCostCop, costCop) — old caller (twilio-usage.tsx) is deleted by Plan 03 so cross-plan typecheck is wave-gated"

patterns-established:
  - "Wave-level typecheck gate: cross-plan imports (Plan 02 exports checkSmsConfigured, Plan 03 imports it) MUST NOT be validated mid-wave to avoid false positives"
  - "Atomic commits split by responsibility area: dispatcher/catalog/module-delete (Task 1) vs server actions/webhook (Task 2)"

requirements-completed: []  # Standalone phase — no REQUIREMENTS.md tracking

# Metrics
duration: 5min
completed: 2026-04-17
---

# Plan 02: Backend Cleanup — Eliminar Callers de `twilio` npm

**Action executor unificado a un solo handler `executeSendSms` via `domainSendSMS` (Regla 3); módulo `src/lib/twilio/` y webhook `/api/webhooks/twilio/status` eliminados; server actions `getSmsUsage`/`getSmsUsageChart` adaptadas a `provider='onurix'` + `cost_cop`; `checkTwilioConfigured` reemplazado por `checkSmsConfigured` que consulta `sms_workspace_config`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-17T03:14:16Z
- **Completed:** 2026-04-17T03:19:20Z
- **Tasks:** 2
- **Files modified:** 5
- **Files deleted:** 3

## Accomplishments

- **Backend 100% libre de callers a `twilio` npm** — todas las rutas SMS pasan ahora por `src/lib/domain/sms.ts` (Regla 3 honrada).
- **Action catalog colapsado** — un solo `type: 'send_sms'` con `category: 'SMS'`. La UI que agrupaba dos categorías (`Twilio` + `SMS`) ahora ve una sola entrada.
- **Webhook Twilio eliminado** — la ruta llevaba 30 días rota (apuntaba a `twilio_sid`, columna renombrada a `provider_message_id`). D-08 consagra la deleción directa sin stub.
- **Tres funciones server-action eliminadas** (`saveTwilioIntegration`, `testTwilioConnection`, `getTwilioIntegration`) — la UI form (`twilio-form.tsx`) que las consume es eliminada por Plan 03.
- **Métricas SMS adaptadas a Onurix**: `getSmsUsage` ahora retorna `{ totalSms, totalCostCop, delivered, failed, pending, messages }` con costos en COP entero. `getSmsUsageChart` retorna `{ date, count, costCop }`. Filtran `.eq('provider', 'onurix')` — los 740 SMS Twilio históricos quedan invisibles a estas métricas (deuda histórica aceptada por D-09).
- **`checkSmsConfigured` agregado** — consulta `sms_workspace_config.is_active` + `balance_cop`, retorna `{ configured, balance, hasBalance }`. Plan 03 lo importa para reemplazar el warning de actions-step.

## Task Commits

Each task was committed atomically (using `--no-verify` per parallel-execution protocol):

1. **Task 1: Unificar dispatcher + catálogo + delete src/lib/twilio/** — `dea6c96` (refactor)
   - `action-executor.ts`: drop import `getTwilioConfig`/`createTwilioClient`; collapse switch cases `send_sms` + `send_sms_onurix` into single `send_sms`; replace `executeSendSmsTwilio` + `executeSendSmsOnurix` with single `executeSendSms` delegating to `domainSendSMS`.
   - `constants.ts`: collapse two SMS catalog entries → one (`type: 'send_sms'`, `category: 'SMS'`, no `mediaUrl` param).
   - `types.ts`: remove `'send_sms_onurix'` from `ActionType` union.
   - `src/lib/twilio/{client,types}.ts`: deleted.
   - 5 files changed, 11 insertions(+), 175 deletions(-).

2. **Task 2: Delete webhook + clean integrations.ts + adapt getSmsUsage + replace checkTwilioConfigured** — `ca8d888` (refactor)
   - `src/app/api/webhooks/twilio/status/route.ts`: deleted; parent dirs (`status/`, `twilio/`) removed.
   - `integrations.ts`: drop `@/lib/twilio` imports; delete `saveTwilioIntegration`/`testTwilioConnection`/`getTwilioIntegration`; update header comment; rewrite `getSmsUsage` + `getSmsUsageChart` for Onurix shape.
   - `automations.ts`: replace `checkTwilioConfigured` (queried `integrations.type='twilio'`) with `checkSmsConfigured` (queries `sms_workspace_config`).
   - 3 files changed, 87 insertions(+), 327 deletions(-).

**Plan metadata:** No metadata commit yet — orchestrator merges Wave 2 and creates the wave-level commit.

## Files Created/Modified

**Modified:**

- `src/lib/automations/action-executor.ts` — single `executeSendSms` handler delegating to `domainSendSMS`; switch case collapsed; Twilio import removed.
- `src/lib/automations/constants.ts` — single `send_sms` catalog entry, category `SMS`.
- `src/lib/automations/types.ts` — `send_sms_onurix` removed from `ActionType` union.
- `src/app/actions/integrations.ts` — Twilio functions removed; `getSmsUsage`/`getSmsUsageChart` adapted to Onurix.
- `src/app/actions/automations.ts` — `checkTwilioConfigured` replaced by `checkSmsConfigured`.

**Deleted:**

- `src/lib/twilio/client.ts` — `getTwilioConfig` + `createTwilioClient` factory.
- `src/lib/twilio/types.ts` — `TwilioConfig`, `SmsMessage` (with stale `twilio_sid`).
- `src/app/api/webhooks/twilio/status/route.ts` — Twilio status callback (R1 broken since 2026-03-16).

## Decisions Made

- **Removed `send_sms_onurix` from `ActionType` union** (Rule 2 — missing critical for correctness). The dispatcher uses `const _exhaustive: never = type` to enforce exhaustive case coverage. Removing the case in `action-executor.ts` without removing the type from the union would have left `'send_sms_onurix'` as an uncovered union member, breaking typecheck. Not explicit in plan but mandatory.
- **Updated `SmsUsageData` interface to Onurix shape** (`totalSms` / `totalCostCop` / `delivered` / `failed` / `pending` / `messages` with `cost_cop` int). Plan §B.4 prescribed the new return shape; the old consumer (`twilio-usage.tsx`) is deleted by Plan 03, so the typecheck mismatch on that file during the parallel wave is expected (gate-deferred per plan's `<objective>` note).
- **Inline `MINIMUM_BALANCE = 97` constant in `checkSmsConfigured`** instead of importing `SMS_PRICE_COP` from `@/lib/sms/constants`. Followed RESEARCH.md §Example 6 exactly. Avoids extra import for a single constant; comment cross-references the source-of-truth constant.
- **Renumbered `integrations.ts` section comments** (`1. Get SMS Usage` → `2. Get SMS Usage Chart` → `3. Update Shopify Auto-Sync`) after collapsing 4 sections into 3 — preserves readability without leaving "5." and "6." gaps.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Removed `send_sms_onurix` from `ActionType` union**
- **Found during:** Task 1 (after collapsing the dispatcher switch)
- **Issue:** Plan §A.2 said "Reemplazar por un único case `send_sms`" but did not mention updating `src/lib/automations/types.ts:98`. The dispatcher's `default` branch uses `const _exhaustive: never = type` to enforce typecheck-time exhaustiveness. Leaving `'send_sms_onurix'` in the union without a matching case would compile-error: `Type 'send_sms_onurix' is not assignable to type 'never'`.
- **Fix:** Removed the literal `| 'send_sms_onurix'` line from the `ActionType` union definition.
- **Files modified:** `src/lib/automations/types.ts`
- **Verification:** `grep -c send_sms_onurix src/lib/automations/types.ts` → 0.
- **Committed in:** `dea6c96` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 2 — missing critical for correctness)
**Impact on plan:** No scope creep. The change is required for the Task 1 verification `grep -rn "send_sms_onurix" src/ ... | (! grep -q .)` to pass and for typecheck to compile. Plan understandably focused on the visible call-sites; the type definition is secondary plumbing that follows.

## Issues Encountered

None during planned work. The cross-plan dependency (`actions-step.tsx` and `twilio-form.tsx` still importing functions Plan 02 deleted) is **expected and documented** in the plan's `<objective>` and `<verification>` sections — both files are owned by Plan 03 and the typecheck gate is wave-level, run by the orchestrator after merge.

## Known Stubs

None.

## Threat Flags

None — this plan removes attack surface (deletes the Twilio webhook + Twilio credential server actions) without introducing new endpoints, auth paths, or schema changes at trust boundaries.

## Self-Check: PASSED

Verified post-write:

- `git log --oneline -3 worktree-agent-aee49c2b`:
  - `ca8d888 refactor(twilio-migration): reemplazar funciones Twilio por Onurix en server actions + eliminar webhook` ✓
  - `dea6c96 refactor(twilio-migration): unificar send_sms handler via domain layer + eliminar src/lib/twilio` ✓
- All `must_haves.truths` verified:
  - ✓ Dispatcher routes `send_sms` via `domainSendSMS` (action-executor.ts:210 → executeSendSms → domainSendSMS).
  - ✓ Action catalog: 1 entry `type: 'send_sms'`, `category: 'SMS'`, label `'Enviar SMS'`.
  - ✓ `checkTwilioConfigured` no longer exists in src/app/actions/automations.ts; `checkSmsConfigured` exists and queries `sms_workspace_config`.
  - ✓ `getSmsUsage` / `getSmsUsageChart` filter `.eq('provider', 'onurix')` (3 occurrences in integrations.ts).
  - ✓ `src/lib/twilio/` directory does not exist.
  - ✓ `src/app/api/webhooks/twilio/` directory does not exist.
  - ✓ `saveTwilioIntegration`, `testTwilioConnection`, `getTwilioIntegration` deleted from integrations.ts.
  - ✓ Zero `@/lib/twilio` references in src/ (excluding Plan 03's files which Plan 03 will rewrite).
  - ◯ TypeScript typecheck — wave-level gate, run by orchestrator post-merge with Plan 03 (per plan `<objective>` note).
- Files referenced in this SUMMARY exist:
  - `src/lib/automations/action-executor.ts` ✓
  - `src/lib/automations/constants.ts` ✓
  - `src/lib/automations/types.ts` ✓
  - `src/app/actions/integrations.ts` ✓
  - `src/app/actions/automations.ts` ✓

## Next Phase Readiness

- **Plan 03 (UI cleanup, parallel)**: depends on `checkSmsConfigured` export from `@/app/actions/automations` — ✓ provided. Once Plan 03 deletes `twilio-form.tsx` and rewrites `actions-step.tsx` import, the wave-level typecheck will go green.
- **Plan 04 (npm dep removal)**: depends on zero callers of `twilio` package — Plan 02 + Plan 03 jointly satisfy this. Plan 04 will run `pnpm remove twilio` + `pnpm install`.
- **Production runtime**: behavior already migrated by Plan 01 (REPARTO normalized to `send_sms`); Plan 02's code change makes the runtime route through Onurix unconditionally for ALL `send_sms` actions. Per CLAUDE.md Regla 6, this is a behavior change in production — but the orchestrator pushes only after both Plan 02 + 03 + 04 land and human gate validates (Plan 04 Task 0 / final wave).

---
*Phase: twilio-to-onurix-migration (standalone)*
*Plan: 02*
*Completed: 2026-04-17*
