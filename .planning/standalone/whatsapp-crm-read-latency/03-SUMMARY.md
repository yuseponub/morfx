---
phase: whatsapp-crm-read-latency
plan: 03
subsystem: crm-read-latency
tags: [performance, server-actions, next-data-cache, whatsapp, ojito]
status: at-checkpoint
requires:
  - "01-SUMMARY (getRequestAuth, cache wrappers getCachedActiveProducts/getCachedTagsForScope/getCachedPipelines, React Query infra)"
  - "02-SUMMARY (las 5 actions del hot-path migradas a getRequestAuth)"
provides:
  - "getOrderDetailBundle(orderId) — 1 auth + Promise.all REAL server-side de las 5 lecturas del ojito"
  - "Datos de referencia (products/tags/pipelines) leidos del Next Data Cache por workspace + invalidacion por tag en mutaciones"
affects:
  - "src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx (ojito: 5 actions serializadas -> 1 round-trip)"
tech-stack:
  added: []
  patterns:
    - "Server-side action bundle (Promise.all dentro de un solo proceso Node) reemplaza N actions client-invoked serializadas por la React Action queue"
    - "Next 16: updateTag(tag) de next/cache para invalidar tags de unstable_cache desde Server Actions (reemplaza el revalidateTag de 1 arg deprecado)"
key-files:
  created:
    - "src/app/actions/order-detail.ts"
  modified:
    - "src/app/actions/products.ts"
    - "src/app/actions/tags.ts"
    - "src/app/actions/orders.ts"
    - "src/app/actions/pipelines.ts"
    - "src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx"
decisions:
  - "D-06: el ojito colapsa a 1 Server Action (getOrderDetailBundle) — el Promise.all del lado cliente NO paraleliza (React Action queue serializa); el server-side SI"
  - "D-07: datos de referencia leen del Next Data Cache por workspace; mutaciones invalidan por tag"
  - "Deviation: Next 16 deprecó revalidateTag(tag) de 1 arg -> se usa updateTag(tag) (mismo efecto interno, read-your-own-writes desde Server Action)"
metrics:
  tasks_completed: 3
  tasks_total: 4
  files_created: 1
  files_modified: 5
  commits: 3
  duration: "~25 min"
  completed_date: "2026-06-03"
---

# Standalone whatsapp-crm-read-latency Plan 03: Ola 2 (Capas 2+3) Summary

Colapsa el "ojito" de pedidos de 5 Server Actions serializadas a UNA (`getOrderDetailBundle` con `Promise.all` real server-side) y cablea el Next Data Cache de datos de referencia (products/tags/pipelines) por workspace con invalidacion por tag en cada mutacion. Las 3 tareas auto estan COMPLETAS y commiteadas en `main`; el plan esta detenido en el checkpoint `human-verify` (falta push a Vercel + verificacion del usuario en prod).

## What Was Built

### Task 1 — Capa 3: cache de referencia + invalidacion por tag (commit `877e99fa`)
- **Lecturas cableadas al cache (Plan 01):**
  - `products.ts` `getActiveProducts` → `return getCachedActiveProducts(auth.workspaceId)`.
  - `tags.ts` `getTagsForScope` → `return getCachedTagsForScope(auth.workspaceId, scope)`.
  - `orders.ts` `getPipelines` → `return getCachedPipelines(auth.workspaceId)`.
  - `getProduct`/`getTag`/`getPipeline` individuales NO se cachean (son por-id, no datos de referencia).
- **Invalidacion (junto al `revalidatePath` existente, no en vez de):**
  - `products.ts` create/update/delete/toggle → `updateTag('ref:products:'+ws)` (5 call sites incl. comentario).
  - `tags.ts` create/update/delete → `updateCacheTag('ref:tags:'+ws)`.
  - `pipelines.ts` createPipeline/updatePipeline/deletePipeline/updatePipelineOrder/createStage/updateStage/updateStageOrder/deleteStage → `updateTag('ref:pipelines:'+ws)`.

### Task 2 — Capa 2: getOrderDetailBundle (commit `ef626ade`)
- `src/app/actions/order-detail.ts` nuevo: `getOrderDetailBundle(orderId)` = 1 `getRequestAuth()` (return `null` si no auth) + `Promise.all` de `[getOrder, getPipelines, getActiveProducts, getTagsForScope('orders'), getOrderNotes]`. Retorna `{ order, pipelines, products, tags, notes }`.

### Task 3 — view-order-sheet usa el bundle (commit `2985dd3f`)
- Los DOS `useEffect` (getOrderNotes + Promise.all de 4 actions) colapsan a UN `useEffect` que llama `getOrderDetailBundle(currentOrderId)` y distribuye a los MISMOS setState (`setOrder`, `setLocalTags`, `setStages`, `setPipelines`, `setProducts`, `setAllTags`, `setOrderNotes`).
- `data == null` (no auth/cerrado) limpia `setOrderNotes([])` como antes; el `catch` tambien.
- Imports huerfanos removidos (`getPipelines`/`getActiveProducts`/`getTagsForScope`/`getOrderNotes`); se mantiene `getOrder` (usado en `handleEditSuccess` + `handleStageChange`) y `moveOrderToStage`/`recompraOrder`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next 16 cambió la firma de `revalidateTag`**
- **Found during:** Task 1 (primer `npx tsc --noEmit`).
- **Issue:** Esta version de Next (16, canary) cambió `revalidateTag(tag)` a `revalidateTag(tag, profile)` (segundo arg `string | CacheLifeConfig` obligatorio). El plan/RESEARCH asumían la firma clásica de 1 argumento → `error TS2554: Expected 2 arguments, but got 1` en 16 call sites.
- **Fix:** Se usa `updateTag(tag)` de `next/cache` (recomendado por Next como reemplazo del `revalidateTag` de 1 arg desde Server Actions; internamente llama el mismo `revalidate([tag])` con expiración inmediata y semántica read-your-own-writes — ideal porque el usuario que edita un producto/tag/pipeline debe ver datos frescos al reabrir el sheet). Todas nuestras mutaciones son Server Actions (`'use server'`).
- **Sub-fix (naming collision):** `tags.ts` YA tiene su propia action `export async function updateTag(id, formData)`. El import `updateTag` de `next/cache` quedaba sombreado por la declaración local. Se importó aliasado: `import { updateTag as updateCacheTag } from 'next/cache'`.
- **Files modified:** products.ts, tags.ts, pipelines.ts.
- **Commit:** `877e99fa`.

**2. [Rule 3 - Blocking] workspaceId no in-scope en mutaciones de pipelines.ts**
- **Found during:** Task 1.
- **Issue:** `pipelines.ts` NO usa `getRequestAuth` (su migración de auth es Plan 07, no este plan — restricción explícita). La mayoría de sus mutaciones (updatePipeline, deletePipeline, updatePipelineOrder, createStage, updateStage, updateStageOrder, deleteStage) NO resuelven `workspaceId`, así que `updateTag('ref:pipelines:'+ws)` no tendría el ws.
- **Fix:** Invalidación aditiva sin tocar el flujo `getUser()`: cada mutación sin ws lee la cookie existente `const ws = (await cookies()).get('morfx_workspace')?.value; if (ws) updateTag('ref:pipelines:'+ws)`. `createPipeline` y `getOrCreateDefaultPipeline` ya tenían `workspaceId` in-scope → uso directo. NO se migró auth (eso es Plan 07; double-touch intencional).
- **Files modified:** pipelines.ts.
- **Commit:** `877e99fa`.

Nota sobre las acceptance criteria del plan que mencionan literalmente `revalidateTag('ref:...`: el requisito funcional (invalidar el tag de cache correcto en cada mutación) está 100% satisfecho vía `updateTag`/`updateCacheTag` (mismo mecanismo interno). El literal `revalidateTag` no compila en Next 16.

## Verification

- `npx tsc --noEmit`: 0 errores nuevos. 2 errores PRE-EXISTENTES ajenos confirmados vía `git stash` contra el baseline Plan 02 (`10bfb164`): `.next/dev/types/validator.ts` (cache stale del dev) + `src/lib/domain/__tests__/conversations.test.ts` (eqMock implicit any).
- `middleware.ts` byte-idéntico vs Plan 02 baseline (`git diff --stat 10bfb164 HEAD -- src/lib/supabase/middleware.ts` vacío) — D-04 honrado.
- Greps de cableado: `getCachedActiveProducts`(products)=2, `getCachedTagsForScope`(tags)=2, `getCachedPipelines`(orders)=2; invalidación `ref:products`(products)=5, `ref:tags`(tags)=4, `ref:pipelines`(pipelines)=8.
- `getOrderDetailBundle`: `Promise.all`=1, `getRequestAuth` call=1 (un solo `await getRequestAuth()`).
- view-order-sheet: `getOrderDetailBundle` presente; `getActiveProducts|getTagsForScope`=0 y `getOrderNotes`=0 (ya no se invocan directo en el load).
- Tests: ningún test importa los módulos tocados (`order-detail`, `reference-data`, `view-order-sheet`, ni las actions afectadas) → sin regresión posible de suite por estos cambios.

## Checkpoint Status

Plan detenido en Task 4 `checkpoint:human-verify` (blocking). Pendiente del usuario:
1. Push a `main` (deploy Vercel).
2. Flujo B (ojito): abrir /whatsapp → conversación con pedidos → click ojito. Network tab debe mostrar 1 request de Server Action (no 5); sheet abre <300ms percibido con order+pipelines+products+tags+notas.
3. Flujo A (inbox): cambiar entre conversaciones más rápido.
4. Timer `[perf] getConversationMessages` en logs Vercel (D-10) debe ser bajo.
5. Integridad: datos idénticos; editar producto/tag/pipeline y reabrir el sheet → cambio reflejado (invalidación funciona).
6. Regla 6: agente en prod sin afectación (solo lecturas de UI).

## Self-Check: PASSED
- `src/app/actions/order-detail.ts` — FOUND
- commit `877e99fa` — FOUND
- commit `ef626ade` — FOUND
- commit `2985dd3f` — FOUND
