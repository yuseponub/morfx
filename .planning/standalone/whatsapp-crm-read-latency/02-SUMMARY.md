---
phase: whatsapp-crm-read-latency
plan: 02
subsystem: read-path auth migration (hot-path)
tags: [auth, perf, server-actions, hot-path, wave-1]
requires:
  - "getRequestAuth() — per-request cached auth helper (Plan 01, Capa 1)"
provides:
  - "5 actions del hot-path (conversations, orders, products, tags, order-notes) resuelven auth via getRequestAuth() — 0 auth.getUser()"
  - "AMBOS timers [perf] de conversations.ts (getConversations + getConversationMessages) envuelven el auth (D-10) — instrumentacion ya no es ciega"
  - "getAuthContext de orders.ts delega a getRequestAuth preservando contract { workspaceId, userId }"
affects:
  - "src/app/actions/conversations.ts"
  - "src/app/actions/orders.ts"
  - "src/app/actions/products.ts"
  - "src/app/actions/tags.ts"
  - "src/app/actions/order-notes.ts"
tech-stack:
  added: []
  patterns:
    - "Drop-in auth migration: getRequestAuth() reemplaza auth.getUser() + cookie morfx_workspace en un solo call cacheado por request"
    - "D-10: startTime como PRIMERA linea del cuerpo (antes del auth) para que el warn [perf] mida auth + query"
key-files:
  created: []
  modified:
    - "src/app/actions/conversations.ts"
    - "src/app/actions/orders.ts"
    - "src/app/actions/products.ts"
    - "src/app/actions/tags.ts"
    - "src/app/actions/order-notes.ts"
decisions:
  - "getAuthContext de orders.ts: el mensaje de error colapsa a 'No autenticado' para ambos casos (no-auth / no-workspace) — los callers solo chequean presencia de `error`, no el texto (audit confirmado)"
  - "Eliminados imports de cookies + getActiveWorkspaceId donde el helper ya resuelve workspaceId"
metrics:
  duration: "~30 min"
  completed: "2026-06-03"
  tasks: 3
  files: 5
---

# Phase whatsapp-crm-read-latency Plan 02: Hot-Path Auth Migration Summary

Migrados los 5 archivos del HOT-PATH (el flujo lento que reporta el usuario) de `auth.getUser()` (round-trip de red a GoTrue ~150-300ms por action) a `getRequestAuth()` (verificacion JWT local ES256 cacheada por-request). 43 `auth.getUser()` eliminados en total, comportamiento not-authed + RLS + filtrado por workspace preservados identicos, y arreglada la instrumentacion ciega (D-10) en LOS DOS timers de conversations.ts.

## What Was Built

**conversations.ts (17 getUser → 0):** todas las read+mutation migradas a `getRequestAuth()`. Eliminados los imports `cookies` y `getActiveWorkspaceId` (el helper resuelve `workspaceId` de la cookie `morfx_workspace`). **D-10:** en `getConversations` y `getConversationMessages` el `const startTime = Date.now()` quedo como PRIMERA linea del cuerpo, ANTES de `await getRequestAuth()`, asi que el `console.warn('[perf]')` ahora mide auth + query juntos (antes el startTime caia despues del auth → instrumentacion ciega). El `Promise.race` con timeout 15s y el `.reverse()` final de `getConversationMessages` quedaron intactos. Mutaciones (markAsRead, archive/unarchive, link/unlink, updateProfileName, assign, startNewConversation, tag ops) solo cambiaron el bloque auth — la logica via domain layer (Regla 3) sin tocar.

**orders.ts (9 getUser → 0):** `getAuthContext()` ahora delega a `getRequestAuth()` preservando el contract `{ workspaceId, userId } | { error }`. El resto de las read inline (getPipelines, getOrCreateDefaultPipeline, getOrders, getOrdersForStage, getStageOrderCounts, getOrder, exportOrdersToCSV, getRelatedOrders) migradas al patron drop-in. Eliminado import `cookies`. Mutaciones via domain (`@/lib/domain/orders`) intactas; el cache de referencia NO se cableo aqui (Plan 03).

**products.ts (7 getUser → 0):** getProducts, getActiveProducts, getProduct + mutaciones (create/update/delete/toggle) migradas. `workspaceId` server-derivado via helper. Cache NO cableado (Plan 03).

**tags.ts (6 getUser → 0):** getTags, getTag, getTagsForScope + mutaciones (create/update/delete) migradas. Cache NO cableado (Plan 03).

**order-notes.ts (4 getUser → 0):** getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote migradas. `user.id` → `auth.userId` (createdBy del domain + checks de permiso author/admin). **`user.email` → `auth.email`** en el fallback de display name (`{ id: auth.userId, email: auth.email || 'Usuario' }`) — el helper expone `claims.email`, asi que el fallback cuando no hay profile row se preserva identico. Eliminado import `cookies`.

## Tasks Completed

| Task | Name | Commit | Status |
| ---- | ---- | ------ | ------ |
| 1 | conversations.ts (17 getUser) + AMBOS timers [perf] (D-10) | `f07b832e` | done |
| 2a | orders.ts (9 getUser, getAuthContext delega) | `defc33cc` | done |
| 2b | products.ts (7 getUser) | `e829587d` | done |
| 2c | tags.ts (6 getUser) | `7f289680` | done |
| 3 | order-notes.ts (4 getUser, user.email → auth.email) | `111ff042` | done |

## Verification

- `for f in conversations orders products tags order-notes; do grep -c "auth.getUser()" src/app/actions/$f.ts; done` → todos **0**.
- `grep -c "cookies"` → **0** en los 5 archivos (resolucion duplicada de workspace eliminada).
- D-10: en getConversations Y getConversationMessages, `startTime` (L32 y L221 respectivamente) aparece ANTES de `getRequestAuth`.
- orders.ts: `getAuthContext` delega a `getRequestAuth` y retorna `{ workspaceId, userId }`.
- order-notes.ts: `auth.email` usado en fallback de display name (L125); 0 referencias stray a `user.id`/`user.email`.
- `git diff --stat src/lib/supabase/middleware.ts`: **vacio** — middleware byte-identico (D-04).
- `grep -rln "getRequestAuth" src/`: SOLO bajo `src/lib/auth/` + `src/app/actions/**` — **sin paths de agente (Pitfall 8)**.
- `npx tsc --noEmit`: **0 errores nuevos** de los 5 archivos. Los unicos 2 errores son PRE-EXISTENTES (`.next/dev/types/validator.ts` generado + `src/lib/domain/__tests__/conversations.test.ts` TS7022/7024) — documentados en Plan 01.
- `npx vitest run src/lib/auth/__tests__/request-auth.test.ts`: **6/6 pass**.
- Suite completa: **1106 passed / 4 failed / 42 skipped**. Los 4 fallos son PRE-EXISTENTES en `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` (asserts de wording de prompt en espanol — PROBABILIDAD / "compañero experto") — el archivo NO esta en el rango de mis commits y NINGUN test importa los 5 archivos migrados. Sin relacion con auth.

### Acceptance criteria (todas verdes)
- Task 1: `auth.getUser()` == 0 ✓; `getRequestAuth` >= 1 (18: import + 17 usos) ✓; startTime antes de getRequestAuth en ambos timers ✓; tsc verde ✓.
- Task 2: `auth.getUser()` == 0 en orders/products/tags ✓; getAuthContext delega ✓; tsc verde ✓.
- Task 3: `auth.getUser()` == 0 ✓; `auth.email`/`auth.userId` en fallback ✓; tsc verde ✓.

## Deviations from Plan

None — plan ejecutado exactamente como fue escrito. El audit confirmo que ningun caller de `getAuthContext` discrimina por el TEXTO del error (solo chequea presencia de `error`), asi que el colapso del mensaje a 'No autenticado' es aceptable como estaba previsto en el plan.

## Deferred Issues (out-of-scope, pre-existing)

- `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` — 4 fallos por asserts de wording de prompt; PRE-EXISTENTES, ajenos a este plan (no toque ese archivo ni importa mis modulos). Mismo origen que los 3 fallos documentados en Plan 01.
- 2 errores tsc PRE-EXISTENTES (`.next/dev/types/validator.ts` generado + `domain/__tests__/conversations.test.ts`). Scope boundary: solo auto-fix de issues causados por el plan.

## Self-Check: PASSED

- FOUND: src/app/actions/conversations.ts (0 getUser, 18 getRequestAuth, ambos timers D-10)
- FOUND: src/app/actions/orders.ts (0 getUser, getAuthContext delega)
- FOUND: src/app/actions/products.ts (0 getUser)
- FOUND: src/app/actions/tags.ts (0 getUser)
- FOUND: src/app/actions/order-notes.ts (0 getUser, auth.email en fallback)
- FOUND: commit f07b832e (Task 1)
- FOUND: commit defc33cc (Task 2a orders)
- FOUND: commit e829587d (Task 2b products)
- FOUND: commit 7f289680 (Task 2c tags)
- FOUND: commit 111ff042 (Task 3 order-notes)
