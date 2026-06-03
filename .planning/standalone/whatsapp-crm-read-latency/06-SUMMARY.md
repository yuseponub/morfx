---
phase: whatsapp-crm-read-latency
plan: 06
subsystem: auth / server-actions
tags: [perf, auth, getRequestAuth, latency, regla-3]
requires:
  - "src/lib/auth/request-auth.ts (getRequestAuth — Plan 01)"
provides:
  - "23 archivos drop-in SEGUROS de src/app/actions/** resuelven auth via getRequestAuth() (verify JWT local ES256, sin round-trip GoTrue)"
affects:
  - "src/app/actions/** (lectura de identidad por-request)"
tech-stack:
  added: []
  patterns:
    - "drop-in auth: getRequestAuth() reemplaza el bloque supabase.auth.getUser() + cookie morfx_workspace"
    - "helper local getAuthUserId (getClaims sin cookie) cuando workspaceId llega por parametro (invitations.ts — Rule 1)"
key-files:
  created: []
  modified:
    - src/app/actions/contacts.ts
    - src/app/actions/custom-fields.ts
    - src/app/actions/notes.ts
    - src/app/actions/tasks.ts
    - src/app/actions/task-notes.ts
    - src/app/actions/task-activity.ts
    - src/app/actions/activity.ts
    - src/app/actions/quick-replies.ts
    - src/app/actions/order-states.ts
    - src/app/actions/order-tracking.ts
    - src/app/actions/templates.ts
    - src/app/actions/search.ts
    - src/app/actions/assignment.ts
    - src/app/actions/teams.ts
    - src/app/actions/invitations.ts
    - src/app/actions/agent-metrics.ts
    - src/app/actions/logistics-config.ts
    - src/app/actions/meta-onboarding.ts
    - src/app/actions/metricas-conversaciones-settings.ts
    - src/app/actions/metricas-conversaciones.ts
    - src/app/actions/shopify-oauth.ts
    - src/app/actions/shopify.ts
    - src/app/actions/usage.ts
decisions:
  - "invitations.ts NO usa getRequestAuth() (Rule 1): workspaceId llega por parametro y acceptInvitation corre sin cookie de workspace — helper local getAuthUserId (getClaims, sin dependencia de cookie), mismo patron que workspace.ts del Plan 05"
  - "metricas-conversaciones-settings.ts: el mensaje 'no hay workspace activo' colapsa a 'no autenticado' (getRequestAuth no distingue cookie-ausente vs claims-ausente — mismo trade-off documentado en Plan 02 order-notes)"
  - "usage.recordMessageCost (webhook-internal, sin auth) NO se toca"
metrics:
  duration: "~30 min"
  tasks_completed: 3
  files_modified: 23
  commits: 3
  completed: 2026-06-03
---

# Phase whatsapp-crm-read-latency Plan 06: Ola 2 Barrido Drop-In Seguro Summary

Migrados los 23 archivos drop-in SEGUROS de `src/app/actions/**` de `auth.getUser()` (round-trip GoTrue ~150-300ms/action) a `getRequestAuth()` (verificacion JWT local ES256 cacheada por-request del Plan 01), cerrando la mayor parte de la deuda estructural de latencia con swaps de bajo riesgo. TypeScript fue la red de seguridad (D-09); typecheck verde tras cada commit.

## What Was Built

- **Task 1 — Grupo A (10 archivos):** contacts, custom-fields, notes, tasks, task-notes, task-activity, activity, quick-replies, order-states, order-tracking. Commit `fb9612a9`.
  - `notes.ts` y `task-notes.ts` preservan el fallback de display name `user.email` → `auth.email` (idem order-notes del Plan 02).
  - Helpers internos (`getWorkspaceContext` en contacts, `checkAdminOrOwner` en custom-fields, `getWorkspaceId` eliminado en tasks) re-cableados a `getRequestAuth()`.
- **Task 2 — Grupo B (5 archivos):** templates, search, assignment, teams, invitations. Commit `8982346a`.
  - `assignment.ts`: gate de self-availability (`userId !== auth.userId`) preservado.
  - `teams.ts` / `templates.ts`: role de membership desde la query a `workspace_members` (NO del JWT).
  - `invitations.ts`: ver Deviation Rule 1 abajo.
- **Task 3 — Grupo C (8 archivos):** agent-metrics, logistics-config, meta-onboarding, metricas-conversaciones, metricas-conversaciones-settings, shopify-oauth, shopify, usage. Commit `03c9561b`.
  - `shopify-oauth.ts`: `user.id` del state JWT (`signStateJwt({ userId })`) → `auth.userId`; logica OAuth + credenciales platform_config intactas.
  - `shopify.ts`: las 3 mutaciones owner-only (toggle/delete/updateConfig) preservan `actorId`/`actorLabel` de `user.id` → `auth.userId`; `domainUpdateShopifyConfig` / `domainDeleteShopifyIntegration` (Regla 3) intactos.
  - `meta-onboarding.ts`: auth gate (Phase 38) migrado; `upsertMetaAccount` (domain) + `exchangeCodeForBisuat` + `subscribeWaba` sin cambios; `workspaceId` session-derived (NUNCA del body — T-38-13).
  - `usage.ts`: gate super-admin (`auth.userId === MORFX_OWNER_ID`) preservado en `getAllWorkspacesUsage` / `setWorkspaceLimit`; `recordMessageCost` (webhook-internal, sin auth) NO tocado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] invitations.ts usa helper local getAuthUserId en vez de getRequestAuth**
- **Found during:** Task 2
- **Issue:** El plan listaba `invitations.ts` como drop-in directo. Pero `getRequestAuth()` EXIGE la cookie `morfx_workspace` y retorna null cuando esta ausente. Las funciones de invitations (`inviteMember`, `cancelInvitation`, `acceptInvitation`, `removeMember`, `updateMemberRole`) reciben `workspaceId` como PARAMETRO (no de la cookie), y `acceptInvitation` corre para usuarios que aun NO han seleccionado el workspace destino (cookie ausente por diseno). Usar getRequestAuth habria roto el flujo de aceptar invitacion.
- **Fix:** Helper local `getAuthUserId(supabase)` con `supabase.auth.getClaims()` (mismo verify ES256 local, sin round-trip GoTrue, sin dependencia de la cookie de workspace). Mismo patron que `workspace.ts` del Plan 05 (Warning 1). Los `user.id` de los role checks y de `invited_by` se mapean a `userId`; las queries a `workspace_members` (role) se preservan verbatim.
- **Files modified:** src/app/actions/invitations.ts
- **Commit:** `8982346a`

**2. [Rule 3 - Blocking] Reescritura de comentarios de cabecera para pasar gate grep**
- **Found during:** Task 3
- **Issue:** `meta-onboarding.ts` y `shopify-oauth.ts` tenian en sus comentarios de cabecera el literal `supabase.auth.getUser()` describiendo el viejo auth gate. El gate de aceptacion del plan exige `grep -c "auth.getUser()" == 0`; los comentarios stale lo hacian fallar (1 match cada uno) pese a que el codigo real tenia 0.
- **Fix:** Reescritos los 2 comentarios a `getRequestAuth()` (describiendo el flujo nuevo). El comportamiento de seguridad es identico; solo cambio la prosa.
- **Files modified:** src/app/actions/meta-onboarding.ts, src/app/actions/shopify-oauth.ts
- **Commit:** `03c9561b`

### Decisión menor (no deviation)

- `metricas-conversaciones-settings.ts` devolvia 'no hay workspace activo' (sin cookie) vs 'no autenticado' (sin user). Con `getRequestAuth()` ambos colapsan a null → se preserva 'no autenticado'. Trade-off de texto UX menor, mismo que el documentado en Plan 02 (order-notes colapsa a 'No autenticado'). El comportamiento not-authed (rechazo de la mutacion) es identico.

## Verification

- **23 archivos: `grep -c "auth.getUser()"` == 0 cada uno** ✓
- **notes.ts / task-notes.ts: `auth.email` en el fallback** == 1 cada uno ✓
- **4 archivos sensibles (whatsapp/messages/godentist/client-activation) + pipelines.ts NO tocados** ✓ (`git status --short` confirma: no modificados; los matches `godentist` en status son scripts pre-existentes untracked `??`)
- **Pitfall 8: `grep -rln getRequestAuth src/` solo bajo `src/lib/auth/` + `src/app/actions/**`** ✓ (sin paths de agente/webhook)
- **middleware.ts byte-identico (D-04)** ✓ (sin diff)
- **`npx tsc --noEmit`: 0 errores nuevos** ✓ — solo 6 PRE-EXISTENTES ajenos (`.next/dev/types/validator.ts` x4 + `conversations.test.ts` x2), idénticos al baseline de STATE.md.
- **Suite vitest: 1107 passed / 3 failed / 42 skipped** — los 3 fallos son PRE-EXISTENTES y ajenos (somnio-v4 `smoke-rag-b.test.ts` x2 + `few-shots.test.ts` x1, wording). Las suites crm-bots integration fallan por DB connection refused (environmental, requieren DB live). NINGUN test importa los 23 archivos migrados.

## Notes

- El barrido GLOBAL a 0 `auth.getUser()` en TODO `src/app/actions/` se cierra en Plan 07 (los 5 archivos sensibles restantes: whatsapp/messages/godentist/client-activation/pipelines — con verificacion de caller por Pitfall 8 + double-touch con Plan 03 en pipelines).
- Regla 6: el agente en produccion no se ve afectado — estos son Server Actions del dashboard; los paths de agente/webhook no importan getRequestAuth.
- NO pusheado — orchestrator/user controla pushes.

## Self-Check: PASSED
