---
phase: crm-verificar-combinacion-productos
plan: 01
subsystem: logistics
tags: [typescript, supabase, product-classification, guide-generation, domain-layer]

# Dependency graph
requires:
  - phase: crm-color-tipo-producto
    provides: detectOrderProductTypes, ProductType, SKU_TO_PRODUCT_TYPE, PRODUCT_TYPE_COLORS, PRODUCT_TYPE_ORDER
provides:
  - isSafeForCoord(types) helper (pure function in product-types.ts)
  - isMixedOrder(types) helper (pure function in product-types.ts)
  - formatProductLabels(types) helper — UPPERCASE labels joined by " + "
  - DISPLAY_LABELS module-scoped map (ELIXIR / ASHWAGANDHA / MAGNESIO FORTE)
  - OrderForDispatch.products con shape {sku, title, quantity}
  - OrderForGuideGen.products con shape {sku, title, quantity}
  - GuideGenOrder.products con shape {sku, title, quantity} (lockstep)
  - getOrdersByStage SELECT ampliado a order_products(sku, title, quantity)
  - getOrdersForGuideGeneration SELECT ampliado a order_products(sku, title, quantity)
affects:
  - crm-verificar-combinacion-productos plan 02 (Coord filter)
  - crm-verificar-combinacion-productos plan 03 (Excel Envia)
  - crm-verificar-combinacion-productos plan 04 (PDFs Inter + Bogota)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helpers puros module-level para clasificacion (sin side effects)"
    - "DISPLAY_LABELS separado de PRODUCT_TYPE_COLORS.label — UPPERCASE para UI de guias, title-case para dots del Kanban"
    - "Widening de SELECT en domain layer para propagar sku/title sin cambio de schema"
    - "Lockstep OrderForGuideGen.products <-> GuideGenOrder.products via spread en robot-orchestrator"

key-files:
  created: []
  modified:
    - src/lib/orders/product-types.ts
    - src/lib/domain/orders.ts
    - src/lib/pdf/types.ts

key-decisions:
  - "DISPLAY_LABELS module-scoped (no exportado) — solo se expone formatProductLabels como API publica"
  - "isSafeForCoord([]) retorna false — sin clasificar se trata como mixed/flag por precaucion"
  - "formatProductLabels([]) retorna 'SIN CLASIFICAR' — string sentinel para UI"
  - "PRODUCT_TYPE_COLORS.label (title-case) preservado intacto para dots Kanban; DISPLAY_LABELS (UPPERCASE) para UI de guias — convivencia intencional"
  - "Sin migracion de DB — order_products.sku y .title ya existen, solo se widens el SELECT"
  - "NormalizedOrder y EnviaOrderData NO tocados en Wave 1 — scope minimo, se tocan en Waves 2/3"

patterns-established:
  - "Helper central puro para clasificacion de combinaciones (consumible por todos los flujos de generacion de guias)"
  - "Propagacion sku/title/quantity end-to-end desde DB hasta normalizer input sin cambios de event shape Inngest"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-04-17
---

# Phase crm-verificar-combinacion-productos Plan 01: Helpers de Clasificacion + Propagacion sku/title en Domain Summary

**Unblock del pipeline de clasificacion de combinaciones de productos: 3 helpers puros nuevos (isSafeForCoord / isMixedOrder / formatProductLabels) + DISPLAY_LABELS UPPERCASE + widening de 2 SELECTs domain para propagar sku/title/quantity hasta GuideGenOrder en lockstep.**

## Performance

- **Duration:** 20 min (1250s)
- **Started:** 2026-04-17T03:12:38Z
- **Completed:** 2026-04-17T03:33:28Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- 3 helpers puros nuevos en `src/lib/orders/product-types.ts` — `isSafeForCoord`, `isMixedOrder`, `formatProductLabels` — con comportamiento verificado por 15 one-liners tsx (todos OK, 0 FAIL).
- Mapa `DISPLAY_LABELS` module-scoped con mapeo ProductType → UPPERCASE label (ELIXIR / ASHWAGANDHA / MAGNESIO FORTE), separado del existente `PRODUCT_TYPE_COLORS.label` usado en dots del Kanban.
- Queries `getOrdersByStage` y `getOrdersForGuideGeneration` ahora seleccionan `order_products(sku, title, quantity)` en vez de solo `quantity` — resuelve Pitfall 1 de RESEARCH.md (anteriormente `detectOrderProductTypes` retornaba `[]` para TODAS las ordenes porque no tenia sku/title disponible).
- Tipos `OrderForDispatch.products`, `OrderForGuideGen.products` y `GuideGenOrder.products` alineados en lockstep al nuevo shape `Array<{ sku: string | null; title: string | null; quantity: number }>`.
- Consumidor downstream (`src/inngest/functions/robot-orchestrator.ts:738, 934` — spread `products: o.products`) sigue compilando sin cambios gracias al lockstep.

## Task Commits

Los 3 tasks se commitearon atomicamente en un solo commit (segun instruccion del Plan 01 Task 3 "done"):

1. **Task 1: Extender product-types.ts con helpers centrales y DISPLAY_LABELS** — `38722a3` (feat)
2. **Task 2: Ampliar SELECT statements en src/lib/domain/orders.ts para incluir sku + title** — `38722a3` (feat)
3. **Task 3: Actualizar GuideGenOrder.products en src/lib/pdf/types.ts en lockstep** — `38722a3` (feat)

_Worktree-mode: commit unico --no-verify por recomendacion de orchestrator paralelo._

## Files Created/Modified

- `src/lib/orders/product-types.ts` — +56 lineas. Agrego `DISPLAY_LABELS` (const module-scoped), `isSafeForCoord` (export), `isMixedOrder` (export), `formatProductLabels` (export). `PRODUCT_TYPE_COLORS`, `SKU_TO_PRODUCT_TYPE`, `detectProductType`, `detectOrderProductTypes`, `PRODUCT_TYPE_ORDER` intactos.
- `src/lib/domain/orders.ts` — +25/-7 lineas. 2 SELECTs ampliados (lineas ~1254 y ~1399). 2 interfaces actualizadas (`OrderForDispatch` linea 1235, `OrderForGuideGen` linea 1371). 2 bloques `.map()` propagan sku/title con fallback a null.
- `src/lib/pdf/types.ts` — +1/-1 linea. `GuideGenOrder.products` alineado en lockstep. `NormalizedOrder` y `EnviaOrderData` SIN cambios.

## Decisions Made

Todas las decisiones fueron heredadas del PLAN.md y CONTEXT.md — no hubo decisiones nuevas durante ejecucion. Destacadas:

- **`PRODUCT_TYPE_COLORS.label` preservado intacto.** El campo `label` existente ('Melatonina' / 'Ash' / 'Magnesio Forte') se usa en los dots/cards del Kanban (title-case). `DISPLAY_LABELS` es un mapa PARALELO con UPPERCASE para UI de guias (Excel, mensaje Coord, apartado PDF). Convivencia intencional para separar contextos.
- **`DISPLAY_LABELS` module-scoped (no exportado).** Solo `formatProductLabels` se expone como API publica. Si algun dia otro consumidor necesita el mapa crudo, se exporta — ahora no.
- **`isSafeForCoord([])` → false.** Ordenes sin clasificar se tratan como mixed/flag por precaucion (locked en CONTEXT "Decisions" #1). `isMixedOrder([])` → true simetrico.
- **Sin migracion de schema.** `order_products.sku` y `.title` ya existen en DB (confirmado en RESEARCH.md "Runtime State Inventory"). Solo se widens el `SELECT` string.
- **REGLA 3 (Domain layer) compliant.** El widening de SELECT ocurre dentro de `src/lib/domain/orders.ts` — el lugar correcto del stack.

## Deviations from Plan

**None — plan ejecutado exactamente como fue escrito.**

Observaciones menores (NO son deviations, contexto de verificacion):
- Durante la verificacion `npx tsc --noEmit` se detecto `src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx(60,44)` con error TS2554 pre-existente (unrelated Twilio→Onurix migration shape mismatch en flight). Un cambio accidental a ese archivo se introdujo via stash pop durante comparacion de BASE vs HEAD; se reverteo con `git checkout --` antes del commit. No forma parte de Plan 01 scope. Loguearlo aqui para trazabilidad.
- 4 errores tsc remanentes en `src/lib/agents/somnio/__tests__/*.test.ts` (vitest no instalado) son pre-existentes, explicitamente documentados como out-of-scope en el `<project_specific_rules>` del prompt de ejecucion.

## Issues Encountered

- **tsc primera ejecucion reporto 12 errores, segunda ejecucion reporto 5.** La diferencia vino del ruido de un stash/pop temporal que modifico `sms-tab.tsx` (verificado con `git diff`). Tras revertir ese cambio accidental con `git checkout --`, tsc se estabiliza en los mismos 5 errores pre-existentes (4 vitest + 1 sms-tab pre-existente). Ningun error nuevo atribuible a Plan 01.

## SKUs Verificados (runtime)

15 one-liners tsx ejecutados via `npx tsx -e "..."` contra los helpers recien creados:

```
OK isSafeForCoord[melatonina]=true
OK isSafeForCoord[ash]=false
OK isSafeForCoord[magnesio_forte]=false
OK isSafeForCoord[mel+ash]=false
OK isSafeForCoord[mel+mag]=false
OK isSafeForCoord[]=false
OK isMixedOrder[]=true
OK isMixedOrder[melatonina]=false
OK isMixedOrder[ash]=true
OK fmt[]=SIN CLASIFICAR
OK fmt[mel]=ELIXIR
OK fmt[ash]=ASHWAGANDHA
OK fmt[mag]=MAGNESIO FORTE
OK fmt[mel+ash]=ELIXIR + ASHWAGANDHA
OK fmt[ash+mag]=ASHWAGANDHA + MAGNESIO FORTE
```

Cero `FAIL`. Los 15 behaviors del PLAN Task 1 `<behavior>` block estan verificados runtime.

## Must-haves Verification (from plan frontmatter truths)

- [x] `src/lib/orders/product-types.ts` exporta `isSafeForCoord`, `isMixedOrder`, `formatProductLabels` y DISPLAY_LABELS (verificado via grep + runtime).
- [x] `isSafeForCoord(['melatonina']) === true` y `isSafeForCoord([]) === false`.
- [x] `formatProductLabels([])` === 'SIN CLASIFICAR'; `formatProductLabels(['melatonina','ash'])` === 'ELIXIR + ASHWAGANDHA'.
- [x] `getOrdersByStage` selecciona `order_products(sku, title, quantity)` — count=1 en ese archivo.
- [x] `getOrdersForGuideGeneration` selecciona `order_products(sku, title, quantity)` — count=1 en ese archivo.
- [x] Total count de `order_products(sku, title, quantity)` en `src/lib/domain/orders.ts` == 2.
- [x] `OrderForDispatch.products`, `OrderForGuideGen.products`, `GuideGenOrder.products` con shape `Array<{ sku: string | null; title: string | null; quantity: number }>`.
- [x] `npx tsc --noEmit` sin errores nuevos — 0 errores en product-types.ts / domain/orders.ts / pdf/types.ts / robot-orchestrator.ts (errores remanentes son pre-existentes fuera de scope).

## User Setup Required

None — no external service configuration required. Cambios son solamente del codebase TypeScript y no requieren variables de entorno, permisos, ni cambios de schema DB.

## Next Phase Readiness

**Wave 2 (plans 02 y 03) puede arrancar en paralelo.**

- Plan 02 (Coord filter) puede importar `isSafeForCoord` y `formatProductLabels` desde `@/lib/orders/product-types` y llamar `detectOrderProductTypes(order.products)` sabiendo que ya recibe `{sku, title, quantity}` reales (no mas `[]` como Pitfall 1 documentaba).
- Plan 03 (Excel Envia) mismo — helpers listos, productos ricos disponibles.
- Plan 04 (PDFs Inter + Bogota) Wave 3 queda pendiente; consume output de Plan 03 si el planner asi lo decide.

**Puntos de atencion para Waves siguientes:**
- `NormalizedOrder` (src/lib/pdf/types.ts) aun tiene shape viejo — Wave 3 debera agregar campo para productTypes/isMixed siguiendo RESEARCH Pitfall 5 (post-normalize enrichment en orchestrator recomendado).
- `EnviaOrderData` aun tiene shape viejo — Wave 2b (Plan 03) debera agregar columna COMBINACION.
- El prompt Claude en `normalize-order-data.ts` ahora recibira `{sku, title, quantity}` en vez de solo `{quantity}` via JSON.stringify — data extra neutral, Claude lo ignora (el prompt no pide clasificar). Sin regresion.

## Self-Check: PASSED

**Files verified:**
- `src/lib/orders/product-types.ts` — FOUND (8 exports, 203 lineas)
- `src/lib/domain/orders.ts` — FOUND (2 SELECTs ampliados, 2 interfaces actualizadas, 2 .map() blocks actualizados)
- `src/lib/pdf/types.ts` — FOUND (1 shape change en GuideGenOrder)

**Commits verified:**
- `38722a3` — FOUND via `git log --oneline -1` = "feat(crm-verificar-combinacion-productos): helpers de clasificacion + ampliar SELECT sku/title en domain"

**Behavior verified:**
- 15/15 tsx one-liners imprimieron `OK` (0 FAIL)
- `npx tsc --noEmit` sobre archivos Plan 01: 0 errores
- `npx tsc --noEmit` global: 5 errores TODOS pre-existentes (4 vitest + 1 sms-tab pre-existente)

---
*Phase: standalone/crm-verificar-combinacion-productos*
*Plan: 01*
*Completed: 2026-04-17*
