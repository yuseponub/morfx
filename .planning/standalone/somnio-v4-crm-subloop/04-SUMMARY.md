---
phase: somnio-v4-crm-subloop
plan: 04
subsystem: crm-mutation-tools (shared module)
tags: [crm, mutation-tools, updateOrder, D-25, regla-6-safe, additive]
requires:
  - "domain.updateOrder ya soporta products (replace-all) — sin cambios"
provides:
  - "crm-mutation-tools.updateOrder acepta items[] OPCIONAL mapeado a domain.products"
affects:
  - "src/lib/agents/shared/crm-mutation-tools/orders.ts (updateOrder tool)"
tech-stack:
  added: []
  patterns:
    - "Campo opcional aditivo Regla-6-safe (omitir = comportamiento previo idéntico)"
    - "Distinción undefined vs [] para preservar semántica del domain replace-all"
key-files:
  created: []
  modified:
    - "src/lib/agents/shared/crm-mutation-tools/orders.ts"
    - "src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts"
decisions:
  - "items mapeado a products SOLO si presente; undefined cuando se omite (no [])"
  - "items:[] vacía el cascarón explícitamente (replace-all con 0 productos)"
metrics:
  duration: "~6 min"
  completed: "2026-05-29"
  tasks: 1
  files: 2
---

# Phase somnio-v4-crm-subloop Plan 04: updateOrder += items[] opcional Summary

D-25 (SUP-1): `crm-mutation-tools.updateOrder` ahora acepta un campo `items[]` OPCIONAL que se mapea a `domain.updateOrder.products` (replace-all), desbloqueando el enriquecimiento tardío del cascarón con el pack (D-17) sin recrear el pedido.

## Qué se hizo

- **Header grep-gate (orders.ts:7-8):** reemplazado el bullet "NO products field in updateOrder.inputSchema (V1.1 deferred)" por la nota de que `items[]` ahora es soportado (standalone somnio-v4-crm-subloop D-25, V1.1 unblocked, maps to domain products replace-all, opcional).
- **updateOrder.description:** actualizada para describir que `items[]` es opcional y reemplaza todos los productos (replace-all) recalculando el total; si se omite, los productos no se tocan.
- **updateOrder.inputSchema:** agregado `items` con la MISMA forma exacta que `createOrder` (`productId?` uuid, `sku` min(1), `title` min(1), `unitPrice` nonnegative, `quantity` int positive), `.optional()`.
- **execute:** mapea `input.items -> products` SOLO si presente. Punto crítico: cuando `input.items` es `undefined`, `products` queda `undefined` (no `[]`) para preservar el comportamiento previo (el domain solo reemplaza productos cuando `products !== undefined`). `items:[]` sí llega como `[]` y vacía el cascarón.

## Tests (TDD)

Ciclo RED -> GREEN ejecutado:
- RED (commit `4bba3528`): 3 tests nuevos, 2 fallando como esperado (10a, 10c), 10b ya pasaba al ser un escenario de no-regresión.
- GREEN (commit `e572dcdf`): implementación; suite del módulo completa en verde.

Tests agregados a `orders.test.ts`:
- **Test 10a:** `updateOrder({ items:[...] })` -> `domain.updateOrder` recibe `products` con la misma forma + `OrderDetail` re-hidratado con nuevo `totalValue`.
- **Test 10b (no-regresión):** `updateOrder({ shippingCity })` sin items -> `products` undefined en la llamada al domain; comportamiento idéntico al previo.
- **Test 10c:** `updateOrder({ items:[] })` -> `products:[]` (vacía el cascarón).

## Verificación

- `npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts` -> 25/25 verde.
- `npx vitest run src/lib/agents/shared/crm-mutation-tools/` (suite completa del módulo) -> 70/70 verde (67 previos + 3 nuevos, sin regresión en createOrder/moveOrderToStage/archive/close).
- Greps de acceptance: `items:` presente en schema de updateOrder; `input.items` passthrough condicional presente; "NO products field in updateOrder" VACIO; sin imports reales de `createAdminClient`/`@supabase/supabase-js` (única coincidencia = comentario doc del gate); sin `workspaceId` zod validation.
- `npx tsc --noEmit` -> 0 errores nuevos en archivos tocados (solo pre-existentes ignorados: conversations.test, validator.ts).

## Regla 6 / Regla 3

- **Regla 6 (módulo compartido):** cambio aditivo/opcional aprobado por usuario (D-25). `items` es `.optional()`; llamadas existentes que no lo pasan se comportan EXACTAMENTE igual. `crm-mutation-tools` tiene 0 consumidores en prod (D-08) -> blast radius nulo. crm-writer no se toca.
- **Regla 3:** sin imports de `createAdminClient`/`@supabase/supabase-js` reales; toda mutación pasa por domain layer. Intacta.
- **Regla 5:** sin nuevas migraciones DB (domain ya soportaba products).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `src/lib/agents/shared/crm-mutation-tools/orders.ts` (modificado, contiene `items` en updateOrder).
- FOUND: `src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts` (modificado, contiene los 3 tests `updateOrder` items).
- FOUND commit `4bba3528` (RED).
- FOUND commit `e572dcdf` (GREEN).

## TDD Gate Compliance

- RED gate: `test(...)` commit `4bba3528` presente.
- GREEN gate: `feat(...)` commit `e572dcdf` posterior presente.
- REFACTOR: no necesario (no se hizo commit refactor).
