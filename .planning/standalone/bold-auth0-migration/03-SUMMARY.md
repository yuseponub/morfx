---
phase: bold-auth0-migration
plan: 03
subsystem: bold-payment-link
tags: [bold, telemetry, inngest, observability, auth0]
requires:
  - "src/lib/bold/client.ts existente (Plan padre bold-payment-link)"
  - "src/inngest/client.ts existente"
  - "src/app/api/inngest/route.ts existente con array `functions`"
  - "Tabla `platform_config` existente en Supabase (singleton key-value JSONB)"
  - "Tabla `agent_observability_events` existente con columnas workspace_id, event_type, agent_id, payload"
provides:
  - "Telemetría reactiva D-07: 3+ fallos consecutivos matching REGRESSION_SIGNATURES → evento Inngest 'bold-robot/upstream-broken' + insert en agent_observability_events"
  - "Counter persistido en platform_config.bold_robot_failure_count (singleton, global across workspaces)"
  - "Handler Inngest boldUpstreamBroken con concurrency single-flight (limit: 1)"
  - "Event 'bold-robot/upstream-broken' tipado en src/inngest/events.ts (BoldRobotEvents) — discoverable y typesafe"
affects:
  - "callBoldRobot signature: ahora requiere workspaceId en input (breaking change interno — único call site actualizado)"
  - "createPaymentLinkAction pasa ctx.workspaceId al callBoldRobot"
tech-stack:
  added:
    - "Inngest event 'bold-robot/upstream-broken' con payload tipado"
  patterns:
    - "Singleton counter en platform_config (mismo patrón que knowledge-sync-v4 — somnio_v4_kb_sync_enabled)"
    - "Single-flight Inngest concurrency con expression key '\"bold-upstream-broken\"' (mismo patrón que crm-bot-expire-proposals)"
    - "await (inngest.send as any) cast establecido para custom event names (Pitfall 8 — Vercel serverless drops unawaited)"
    - "Defensive .catch(() => {}) en telemetry path para nunca enmascarar el error original de BOLD"
key-files:
  created:
    - "src/inngest/functions/bold-upstream-broken.ts"
  modified:
    - "src/lib/bold/client.ts"
    - "src/app/actions/bold.ts"
    - "src/inngest/events.ts"
    - "src/app/api/inngest/route.ts"
decisions:
  - "D-07 implementado: 3+ fallos consecutivos con REGRESSION_SIGNATURES match → fire event + reset counter"
  - "Counter global (no workspace-scoped) — single-tenant BOLD setup, tech debt aceptado per RESEARCH §Open Questions Q3"
  - "Event 'bold-robot/upstream-broken' agregado a AllAgentEvents (sin esto, createFunction({ event }) rechaza el literal por typing estricto del schema)"
  - "TODO follow-up: enviar template WhatsApp 'bold_robot_alert' al operator post-alert — out of scope, observability log es suficiente por ahora"
metrics:
  duration: "~25 minutes wall clock"
  completed: "2026-05-11"
  tasks: 4
  files: 5
---

# Plan 03: Telemetría Reactiva (D-07) Summary

Implementación de detección temprana de regresiones upstream de BOLD: cuando el robot Playwright falla 3+ veces consecutivas con error matching `REGRESSION_SIGNATURES` (locator timeout / login falló / MFA requerido / sigue en auth.bold.co), se dispara un evento Inngest que se persiste en `agent_observability_events`. Convierte "enterarse 24h después por reporte de cliente" en "enterarse <5min después del primer fallo".

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Extend callBoldRobot con failure counter + inngest fire | `7316838` | src/lib/bold/client.ts |
| 2 | Thread workspaceId a createPaymentLinkAction call site | `d019eed` | src/app/actions/bold.ts |
| 3 | Create inngest function boldUpstreamBroken + event type | `f64ff9b` | src/inngest/functions/bold-upstream-broken.ts (new), src/inngest/events.ts |
| 4 | Register boldUpstreamBroken en serve route | `8ea5926` | src/app/api/inngest/route.ts |

## Architecture

```
createPaymentLinkAction (src/app/actions/bold.ts)
  └─ callBoldRobot({ ...input, workspaceId: ctx.workspaceId })
       ├─ happy path → recordSuccess() → platform_config.bold_robot_failure_count = 0
       └─ catch path → recordFailureAndMaybeAlert(message, workspaceId)
                          ├─ if !looksLikeUpstreamRegression(msg) → no-op (deja contar otros bugs)
                          ├─ increment platform_config.bold_robot_failure_count
                          └─ if newCount >= 3:
                                ├─ await (inngest.send as any)({ name: 'bold-robot/upstream-broken', data: {...} })
                                └─ reset counter a 0 (anti-spam)
                                       │
                                       ▼
                          boldUpstreamBroken (src/inngest/functions/bold-upstream-broken.ts)
                            concurrency: [{ key: '"bold-upstream-broken"', limit: 1 }]
                            └─ step.run('log-to-observability', ...)
                                  └─ insert agent_observability_events
                                       { workspace_id, event_type: 'bold_robot_upstream_broken',
                                         agent_id: 'bold-robot', payload: { ... } }
```

## Key Decisions Applied

### D-07 Strategy: regex match → counter → event

REGRESSION_SIGNATURES (4 patterns):
- `/Timeout.*waiting for locator/i` — Playwright locator timeout (síntoma directo del Auth0 widget change)
- `/Login falló/i` — Robot raise explícito post-cascade de selectores
- `/BOLD ahora requiere MFA/i` — Si Auth0 activa MFA obligatorio
- `/Playwright sigue en auth\.bold\.co/i` — Si el robot detecta que la navegación post-login no llegó a `panel.bold.co`

### Pitfall 8 Mitigation
`await (inngest.send as any)` — el cast es el patrón establecido del codebase (memory `inngest_observability_merge.md`) porque el schema strict de Inngest no permite custom event names sin registro previo. SIN await, Vercel serverless termina la lambda antes de que el evento se envíe a Inngest Cloud.

### Counter Reset Anti-Spam
Tras disparar el evento, se resetea el counter a 0 INMEDIATAMENTE (no esperando recordSuccess). Sin esto, los próximos 3 fallos en 5min spamean events al dashboard. El operator se entera una vez, decide acción, los próximos 3 fallos vuelven a notificar (esperado — si el problema persiste y nadie actuó).

### `.catch(() => {})` Defensive Pattern
La llamada `await recordFailureAndMaybeAlert(...).catch(() => {})` envuelve el side-effect de telemetría con un catch absorbente. Razón: si Supabase está caído o el insert falla, **no queremos enmascarar el error original de BOLD** — el cliente del callBoldRobot ya recibió un error legítimo, no debemos cambiar el mensaje por un error de DB. La telemetría es best-effort.

### Event Type Registration in events.ts
Agregado `BoldRobotEvents` type y unión a `AllAgentEvents` porque el typesafe schema strict de Inngest rechaza `createFunction({ event: 'bold-robot/upstream-broken' }, ...)` con literal no-conocido. El patrón es consistente con `RecompraPreloadEvents`, `PwConfirmationPreloadAndInvokeEvents`, etc. Discoverable via TS LSP "go to definition".

## Verification

- [x] `npx tsc --noEmit` exit 0 (post-Task 4) — 0 nuevos errores; solo los 2 pre-existentes en `src/lib/domain/__tests__/conversations.test.ts` (TS7022/TS7024 de commit `307aa8d` no relacionado).
- [x] Todos los acceptance_criteria de Tasks 1-4 pasan (grep counts verificados manualmente post-cada-task).
- [x] 4 commits atomicos creados, mensajes en español per Regla 4.
- [x] No push a origin main (Plan 04 lo maneja).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Event type missing from AllAgentEvents schema**
- **Found during:** Task 3
- **Issue:** `inngest.createFunction({...}, { event: 'bold-robot/upstream-broken' }, ...)` failed TS compile with `Type '"bold-robot/upstream-broken"' is not assignable to type 'undefined'`. The Inngest client uses `EventSchemas.fromRecord<AllAgentEvents>()` for strict typing — any unknown event name in createFunction is rejected.
- **Fix:** Added `BoldRobotEvents` type with the event signature and merged into `AllAgentEvents` union in `src/inngest/events.ts`. Established pattern — every standalone that introduces custom Inngest events does this (RecompraPreloadEvents, PwConfirmationPreloadAndInvokeEvents, V4KnowledgeSyncEvents).
- **Files modified:** `src/inngest/events.ts` (added type + extended union, ~30 LOC)
- **Commit:** `f64ff9b` (combined with Task 3 since it's directly required by the new function file)
- **Why not in plan:** RESEARCH Example 6 (lines 886-934) showed the function file verbatim but didn't include the events.ts registration step — the planner missed this. Pattern is so consistent across the codebase that it's a Rule 3 auto-fix (blocking the task otherwise).

## Authentication Gates

None — no auth interactions in this plan.

## Threat Surface Scan

No new threat surface introduced:
- No new network endpoints (Inngest internal event, not HTTP).
- No new auth paths.
- `platform_config` table access uses `createAdminClient()` (existing pattern, knowledge-sync-v4 precedent — singleton key-value).
- `agent_observability_events` insert via `step.run` is idempotent on Inngest retry.

## Known Stubs

**1. WhatsApp template send to operator (D-07 follow-up)**
- **File:** `src/inngest/functions/bold-upstream-broken.ts:55-57` (TODO comment)
- **Reason:** Intentional out-of-scope deferral per RESEARCH Example 6 final note: "WhatsApp template wire-up can be a follow-up." The observability log is sufficient as initial signal; sending a WhatsApp template requires identifying the operator's phone, choosing a template, and is non-trivial. Future plan (Plan 05+ if user requests) would handle this.
- **Mitigation:** Operator can poll `agent_observability_events WHERE event_type='bold_robot_upstream_broken'` from a dashboard query. The event still fires.

## Manual Smoke (Post-Deploy — Requires Plan 04 push)

1. Setear creds inválidas en `integrations` (workspace target). Intentar generar link 3 veces.
2. En el 3er fallo: verificar Inngest dashboard (https://app.inngest.com/) → run de `bold-upstream-broken` aparece.
3. SQL: `SELECT * FROM agent_observability_events WHERE event_type='bold_robot_upstream_broken' ORDER BY created_at DESC LIMIT 1;` retorna 1 fila con payload poblado.
4. SQL: `SELECT value FROM platform_config WHERE key='bold_robot_failure_count';` retorna 0 (reset post-fire).
5. Restaurar creds válidas + 1 call exitoso → counter sigue en 0 (recordSuccess no-op si ya está en 0).

## Self-Check: PASSED

- [x] `src/lib/bold/client.ts` exists with REGRESSION_SIGNATURES + recordFailureAndMaybeAlert + recordSuccess + extended signature (verified via grep counts).
- [x] `src/app/actions/bold.ts` invokes callBoldRobot with `workspaceId: ctx.workspaceId` (verified).
- [x] `src/inngest/functions/bold-upstream-broken.ts` exists with all required exports + concurrency + step.run insert (verified).
- [x] `src/inngest/events.ts` registers BoldRobotEvents + extends AllAgentEvents (verified).
- [x] `src/app/api/inngest/route.ts` imports + registers boldUpstreamBroken inside `functions:` array (verified).
- [x] Commits exist: 7316838, d019eed, f64ff9b, 8ea5926 (verified via `git log`).
- [x] tsc 0-new-errors (verified, only 2 pre-existing in conversations.test.ts).
