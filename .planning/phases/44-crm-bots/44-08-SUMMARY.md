---
phase: 44-crm-bots
plan: 08
subsystem: crm-bots
status: complete
tags: [crm-writer, http-route, propose-confirm, two-step, rate-limit, kill-switch, observability, api-key]
dependency_graph:
  requires:
    - "44-01 (middleware branch for /api/v1/crm-bots/* + ToolModule 'crm-bot' + AgentId 'crm-writer' + TriggerKind 'api')"
    - "44-02 (sendRunawayAlert + maybeSendApproachingLimitAlert)"
    - "44-05 (propose + confirm entry points + CRM_WRITER_AGENT_ID + two-step optimistic UPDATE)"
  provides:
    - "POST /api/v1/crm-bots/writer/propose — LLM-driven, returns {text, proposedActions[], steps, agentId}, zero business-entity mutation"
    - "POST /api/v1/crm-bots/writer/confirm — idempotent action executor, returns {status: executed|already_executed|expired|not_found|failed}"
    - "Shared 'crm-bot' rate-limit budget across reader + writer (one counter, both routes share it)"
    - "Observability wrapping on both endpoints (agentId='crm-writer', triggerKind='api'); confirm correlates conversationId=actionId"
  affects:
    - "Plan 44-09 (integration tests) — unblocked; can exercise the full propose→confirm round-trip over HTTP"
    - "Plan 44-10 (docs + release) — unblocked; two endpoints ready to document"
    - "Production push — BLOCKED on Plan 01 Task 5 migration + Plan 03 archive migrations per CLAUDE.md Regla 5 (two-step.ts references crm_bot_actions and archived_at columns)"
tech_stack:
  added: []
  patterns:
    - "Four-gate stack on every request: kill-switch → x-workspace-id header → rate limit → observability wrap"
    - "Per-request env read of CRM_BOT_ENABLED (Pitfall 2) — env flips take effect without redeploy"
    - "x-workspace-id header as sole source of workspace scope (Pitfall 4) — body.workspaceId IGNORED even if sent"
    - "invoker fallback chain x-invoker → x-api-key-prefix (Warning #14) — audit always has a non-null identity"
    - "Shared rate-limit namespace 'crm-bot' across reader + writer (Plan 01 DEFAULTS) — prevents writer loops from dodging the reader's budget"
    - "conversationId=actionId correlation on confirm — reuses the uuid column, no new observability schema"
    - "Defense-in-depth UUID_REGEX validation on confirm body (400 INVALID_INPUT)"
    - "Delegate pattern: route handler is pure glue — auth + rate limit + observability + one call into src/lib/agents/crm-writer"
key_files:
  created:
    - path: "src/app/api/v1/crm-bots/writer/propose/route.ts"
      purpose: "POST propose handler — LLM-driven proposal phase; delegates to writerPropose; no business-entity mutation"
      lines: 136
    - path: "src/app/api/v1/crm-bots/writer/confirm/route.ts"
      purpose: "POST confirm handler — direct idempotent execution; delegates to writerConfirm; UUID_REGEX gate on actionId"
      lines: 135
  modified: []
decisions:
  - "Mirrored the reader (Plan 07) gate stack in BOTH writer endpoints so the three routes (reader, propose, confirm) share one auditable shape — cheaper to maintain and cheaper to threat-model than three bespoke flows"
  - "Used conversationId=actionId on confirm rather than randomUUID so observability traces are joinable to crm_bot_actions rows by id alone — zero new fields"
  - "Kept the kill-switch read inside each handler (not in a module-level const) — Pitfall 2 mandates per-request read so operators can flip CRM_BOT_ENABLED in Vercel env without redeploy"
  - "Forbade reading body.workspaceId even as a secondary source — only x-workspace-id from middleware is trusted. workspace scope enforced again inside writerConfirm via .eq('workspace_id', ctx.workspaceId) (T-44-08-01 defense-in-depth)"
  - "Added UUID_REGEX before calling writerConfirm — cheap 400 for garbage input prevents wasted SELECTs on crm_bot_actions. The agent also validates, but defense-in-depth is cheap here"
metrics:
  duration_min: 11
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  commits: 2
  completed_at: "2026-04-18T21:42:23Z"
---

# Phase 44 Plan 08: CRM Writer HTTP Routes Summary

Dos endpoints HTTP para el CRM Writer Bot — `POST /api/v1/crm-bots/writer/propose` (LLM con AI SDK v6 tools que genera filas propuestas en `crm_bot_actions` con TTL 5 min) y `POST /api/v1/crm-bots/writer/confirm` (sin LLM, idempotente por optimistic UPDATE). Ambos comparten el stack de 4 gates del reader (kill-switch, x-workspace-id, rate limit `'crm-bot'`, observabilidad), usan el fallback `x-invoker → x-api-key-prefix` para auditoría e importan desde el barrel `@/lib/observability` validado con el grep precheck del Warning #11.

## Objective Achieved

- [x] `POST /api/v1/crm-bots/writer/propose` creado — delega a `writerPropose({workspaceId, messages, invoker})` y devuelve `{status:'ok', output: {text, proposedActions[], steps, agentId:'crm-writer'}}` sin mutar entidades de negocio.
- [x] `POST /api/v1/crm-bots/writer/confirm` creado — delega a `writerConfirm({workspaceId, invoker}, actionId)` y devuelve `{status:'ok', result: {status: executed|already_executed|expired|not_found|failed, output?, error?}}`.
- [x] Ambos endpoints con el stack de 4 gates: kill-switch → x-workspace-id → rate limit → runWithCollector.
- [x] `x-workspace-id` es la ÚNICA fuente de scope de workspace; `body.workspaceId` jamás leído (Pitfall 4).
- [x] Double-confirm sobre el mismo `action_id` → primer llamado devuelve `executed`, segundo `already_executed` (Pitfall 3, ya implementado en Plan 05 two-step.ts).
- [x] `UUID_REGEX` valida `actionId` antes de la query (400 INVALID_INPUT si inválido).
- [x] `invoker` tiene fallback a `x-api-key-prefix` cuando no viene `x-invoker` (Warning #14).
- [x] Ambos endpoints envuelven su ejecución en `runWithCollector` con `agentId:'crm-writer'`, `triggerKind:'api'`.
- [x] Plan compila limpio (0 errores nuevos de `tsc --noEmit` en archivos creados; los 4 errores pre-existentes son en `src/lib/agents/somnio/__tests__/*` — fuera del scope de este plan).

## Tasks Completed

### Task 1: Propose endpoint (d9ec3d5)

**Archivo:** `src/app/api/v1/crm-bots/writer/propose/route.ts` (136 líneas).

Handler `POST` que:

1. **Kill-switch:** lee `process.env.CRM_BOT_ENABLED` en cada request — devuelve 503 `KILL_SWITCH` si está `'false'`. (Pitfall 2.)
2. **Header gate:** extrae `x-workspace-id` (middleware-injected) y calcula `invoker = x-invoker ?? x-api-key-prefix ?? undefined`. Si falta workspaceId → 401 `MISSING_CONTEXT`. (Pitfall 4 + Warning #14.)
3. **Rate limit:** `rateLimiter.check(workspaceId, 'crm-bot')` — mismo contador que reader. Si `!allowed` → 429 `RATE_LIMITED` con `Retry-After` + `void sendRunawayAlert(...)`. Si `remaining/limit < 0.2` → `void maybeSendApproachingLimitAlert(...)`.
4. **Body parse:** `JSON.parse` con try/catch → 400 `INVALID_JSON`. Exige `messages: []` no vacío → 400 `INVALID_INPUT` si no.
5. **Observabilidad:** si `isObservabilityEnabled()` envuelve con `runWithCollector(collector, exec)` usando `conversationId = randomUUID()`, `agentId = 'crm-writer'`, `triggerKind = 'api'`. Si no, ejecuta directo.
6. **Delegate:** llama `writerPropose({workspaceId, messages, invoker})`. Éxito → 200 `{status:'ok', output}`. Throw → 500 `INTERNAL` con `details`.

**Contract shape:** el body solo puede traer `messages`. `workspaceId` en body sería ignorado aunque viniese (tipo lo excluye y nunca se lee).

### Task 2: Confirm endpoint (d5de128)

**Archivo:** `src/app/api/v1/crm-bots/writer/confirm/route.ts` (135 líneas).

Handler `POST` simétrico al propose salvo dos diferencias deliberadas:

1. **Body shape:** `{actionId: uuid}`. Validado con `UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. `typeof actionId !== 'string' || !UUID_REGEX.test(actionId)` → 400 `INVALID_INPUT`. Defense-in-depth — el agente también valida al SELECT.
2. **conversationId:** se pasa `actionId` como `conversationId` (ambos son uuid, esto correlaciona la observabilidad de la turn con la fila `crm_bot_actions` sin requerir un schema nuevo).
3. **Delegate:** llama `writerConfirm({workspaceId, invoker}, actionId)`. Éxito → 200 `{status:'ok', result}`. Throw → 500 `INTERNAL`.

**Idempotencia (Pitfall 3):** ya implementada en `src/lib/agents/crm-writer/two-step.ts` (Plan 05) vía optimistic UPDATE `.eq('status','proposed')`. El route no la duplica — confía en el contrato del agente.

**Cross-workspace mitigation (T-44-08-01):** dentro de `writerConfirm`, el SELECT filtra por `workspace_id = ctx.workspaceId`; un `action_id` de otra workspace devuelve `not_found`. La route no necesita lógica adicional.

## Verification

| Check | Result |
|-------|--------|
| `test -f` propose route | OK |
| `test -f` confirm route | OK |
| `export async function POST` en ambos | 1+1 |
| `CRM_BOT_ENABLED` gate en ambos | 1+1 |
| `rateLimiter.check(workspaceId, 'crm-bot')` en ambos | 1+1 |
| `x-workspace-id` header read en ambos | 1+1 |
| `x-api-key-prefix` fallback en ambos | 2+1 (propose doc line + usage) |
| `runWithCollector` en ambos | 2+2 |
| `triggerKind: 'api'` en ambos | 1+1 |
| `CRM_WRITER_AGENT_ID` en ambos | 4+3 |
| `UUID_REGEX.test(actionId)` en confirm | 1 |
| `conversationId: actionId` en confirm | 1 |
| `body.workspaceId` READ en ninguno (solo comments) | 0 code / 1+2 doc lines |
| `tsc --noEmit` errores en archivos nuevos | 0 |
| Non-test regression en tsc total | 0 (4 errores pre-existentes en `somnio/__tests__` no relacionados) |

## Must-Haves (Truths)

| Truth | Status |
|-------|--------|
| Propose returns 200 with `{text, proposedActions[]}` without mutating business entities | OK — delegación pura a `writerPropose` + no-mutation contract en two-step.ts |
| Confirm returns 200 with `{status: executed\|already_executed\|expired\|not_found\|failed}` | OK — discriminated union `ConfirmResult` re-exportada en `{status:'ok', result}` |
| Both endpoints gate on kill-switch + rate limit + x-workspace-id | OK — verificado arriba |
| Confirm body validates `{actionId: uuid}` → 400 if invalid | OK — `UUID_REGEX` + 400 INVALID_INPUT |
| Double-confirm: first 'executed', second 'already_executed' (Pitfall 3) | OK — garantizado por optimistic UPDATE en Plan 05 two-step.ts |
| Forged body.workspaceId IGNORED | OK — `workspaceId` se lee SOLO de `request.headers.get('x-workspace-id')` |
| invoker falls back to x-api-key-prefix when x-invoker absent (Warning #14) | OK — `request.headers.get('x-invoker') ?? request.headers.get('x-api-key-prefix') ?? undefined` |
| Both wrap calls in `runWithCollector({agentId:'crm-writer', triggerKind:'api'})` | OK — con `isObservabilityEnabled()` guard |

## Key Artifacts Links

- `propose route.ts` → `propose as writerPropose` desde `@/lib/agents/crm-writer` (import directo)
- `confirm route.ts` → `confirm as writerConfirm` desde `@/lib/agents/crm-writer` (import directo)
- Ambos → `rateLimiter.check(workspaceId, 'crm-bot')` (namespace compartido con reader)
- Ambos → `sendRunawayAlert` + `maybeSendApproachingLimitAlert` desde `@/lib/agents/_shared/alerts`
- Ambos → `runWithCollector`, `ObservabilityCollector`, `isObservabilityEnabled` desde `@/lib/observability` (barrel grep-verified: las tres funciones están en `src/lib/observability/index.ts` líneas 22–51)

## Threat Model Mitigations (realized)

| Threat ID | Mitigation realized in this plan |
|-----------|----------------------------------|
| T-44-08-01 Spoofing cross-workspace action_id | `workspaceId` viene solo del header; `writerConfirm` filtra por `workspace_id` → not_found |
| T-44-08-02 Double-confirm race | Delegado a optimistic UPDATE en Plan 05 two-step.ts |
| T-44-08-03 DoS via rejecting LLM outputs | Rate limit 50/min compartido + `stepCountIs(5)` en Plan 05 |
| T-44-08-05 LLM fabricates action_id | `UUID_REGEX` filtra garbage; SELECT con workspaceId devuelve not_found para cualquier id no emitido por `randomUUID()` |
| T-44-08-06 Stale kill-switch | `process.env.CRM_BOT_ENABLED` leído per-request |
| T-44-08-07 Repudiation | `invoker` siempre presente (fallback a x-api-key-prefix), observabilidad captura la turn |

## Deviations from Plan

None — plan ejecutado exactamente como escrito. Los nombres de variables, el orden de los gates, los strings de error-code y los status-code coinciden uno a uno con el diseño del Plan 08. No hubo Rule 1/2/3 fixes ni Rule 4 architectural pauses.

## Deployment Blockers

Per CLAUDE.md Regla 5 (migración antes de deploy):

1. **Plan 01 Task 5:** migración `crm_bot_actions` DEBE aplicarse en producción ANTES del push. `writerPropose` inserta filas con status='proposed' en esa tabla.
2. **Plan 03 migrations:** columnas `archived_at` en `contacts`/`orders`/`notes`/`order_notes`. `dispatchToolExecution` enruta `archive*` a los domain helpers que escriben en estas columnas.

Si el push a Vercel ocurre antes de aplicar las migraciones, cualquier llamada al writer fallará con error Postgres (tabla/columna inexistente) — exactamente el incidente de 20h que Regla 5 evita.

**Coordinación recomendada para el push de Wave 3:** aplicar migraciones de Plan 01 + 02 + 03 en prod → confirmación del usuario → push de Plans 01/02/03/05 → push de Plans 06/07/08 → Plan 09 integration tests.

## Git Commits

- `d9ec3d5 feat(44-08): agregar POST /api/v1/crm-bots/writer/propose`
- `d5de128 feat(44-08): agregar POST /api/v1/crm-bots/writer/confirm`

## Self-Check: PASSED

- `src/app/api/v1/crm-bots/writer/propose/route.ts` — FOUND
- `src/app/api/v1/crm-bots/writer/confirm/route.ts` — FOUND
- Commit `d9ec3d5` — FOUND in git log
- Commit `d5de128` — FOUND in git log
- Both routes compile clean under `tsc --noEmit` (0 errors in new files)
- Warning #11 barrel grep precheck: `runWithCollector`, `ObservabilityCollector`, `isObservabilityEnabled` all present in `src/lib/observability/index.ts`
- Warning #14 x-api-key-prefix fallback: present in both routes
- Pitfall 2 (per-request kill-switch read): verified inline in both handlers
- Pitfall 3 (confirm idempotency): delegated to Plan 05 two-step.ts optimistic UPDATE
- Pitfall 4 (workspaceId only from header): `body.workspaceId` appears only in documentation comments, zero code reads
