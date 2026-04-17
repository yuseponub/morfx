---
phase: crm-verificar-combinacion-productos
plan: 03
subsystem: logistics
tags: [exceljs, excel, envia, row-fill, post-normalize-enrichment, inngest-event-shape]

# Dependency graph
requires:
  - plan: 01
    provides: detectOrderProductTypes, isMixedOrder, formatProductLabels, GuideGenOrder.products {sku,title,quantity}
provides:
  - EnviaOrderData.isMixed (opcional, boolean)
  - EnviaOrderData.combinacion (opcional, string)
  - COMBINACION column al final del Excel Envia (preserva prefijo portal-import)
  - Row-level fill amarillo ARGB FFFFF59D para filas con isMixed === true
  - Post-normalize enrichment pattern en excelGuideOrchestrator step 'generate-and-upload'
affects:
  - crm-verificar-combinacion-productos plan 04 (Wave 3 — PDFs Inter + Bogota consumen patron similar)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-normalize enrichment en orchestrator: productTypes se derivan de orders (fetch step), no de normalized (normalize step), evitando dependencia con Claude AI"
    - "typesByOrderId pre-computado como Map<string, ProductType[]> para lookup O(1) evitando O(n*m) al mergear con normalized"
    - "Row-level fill ExcelJS con ARGB 8-digit (alpha+RGB) — no 6-digit, evita inconsistencia entre versiones"
    - "Columna informativa al FINAL del worksheet para preservar prefijo portal-import (portal ignora columnas trailing)"
    - "Campos opcionales en DTO (isMixed?, combinacion?) para no romper caching step.run de Inngest en jobs encolados"

key-files:
  created:
    - .planning/standalone/crm-verificar-combinacion-productos/03-SUMMARY.md
  modified:
    - src/lib/pdf/types.ts
    - src/lib/pdf/generate-envia-excel.ts
    - src/inngest/functions/robot-orchestrator.ts

key-decisions:
  - "Columna COMBINACION al FINAL (no insertada en medio) para preservar prefijo portal-import Envia"
  - "ARGB 8-digit obligatorio (FFFFF59D) por estabilidad entre versiones ExcelJS — RESEARCH Pitfall 3"
  - "Header row mantiene per-cell fill existente (NO se migra a row-level) — RESEARCH Pitfall 6"
  - "Enrichment post-normalize en orchestrator, NO en normalize-order-data.ts — Claude no sabe de isMixed (RESEARCH Pitfall 5)"
  - "Event shape robot/excel-guide.submitted intacto — productTypes se derivan DENTRO del step.run (RESEARCH Pitfall 4)"
  - "Default types=[] -> isMixedOrder([])=true -> falla segura (errar a marcar, no a ocultar)"
  - "Campos opcionales EnviaOrderData.isMixed/combinacion (con ?) — compat con call-sites basicos + caching Inngest"

patterns-established:
  - "Post-normalize enrichment end-to-end: domain layer retorna productos ricos -> fetch step los cachea -> orchestrator construye Map -> map enriquecen DTO downstream. Patron listo para replicar en Plan 04 (PDF flow) con NormalizedOrder."

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-04-17
---

# Phase crm-verificar-combinacion-productos Plan 03: Excel Envia — Columna COMBINACION + Fila Amarilla Summary

**Highlight visual amarillo (ARGB FFFFF59D) + columna COMBINACION al final del Excel Envia, con enrichment 100% en el orchestrator (post-normalize) preservando event shape Inngest y Claude prompt intactos.**

## Performance

- **Duration:** 9 min (525s)
- **Started:** 2026-04-17T03:40:28Z
- **Completed:** 2026-04-17T03:49:13Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `EnviaOrderData` (src/lib/pdf/types.ts) extendido con 2 campos OPCIONALES: `isMixed?: boolean` y `combinacion?: string`. Campos opcionales deliberadamente para evitar romper el caching de step.run de Inngest en jobs ya encolados + mantener compat con call-sites basicos que construyen el shape core.
- `generateEnviaExcel` (src/lib/pdf/generate-envia-excel.ts) ahora:
  - Define 7 columnas (antes 6): `Valor, Nombre, Telefono, Direccion, Municipio, Departamento, COMBINACION`.
  - COMBINACION se agrega AL FINAL — preserva prefijo portal-import (portal Envia ignora columnas trailing).
  - Aplica row-level fill amarillo ARGB `FFFFF59D` (8-digit obligatorio) SOLO a filas con `order.isMixed === true`.
  - Mantiene el header row con per-cell fill existente (`FFE0E0E0`) — NO se migra a row-level, previene colision Pitfall 6.
  - Celda COMBINACION: `order.isMixed ? (order.combinacion ?? '') : ''` — nunca escribe `undefined` literal en xlsx.
- `excelGuideOrchestrator` (src/inngest/functions/robot-orchestrator.ts) enriquece `enviaData` post-normalize:
  - Nuevo import: `{ detectOrderProductTypes, isMixedOrder, formatProductLabels }` desde `@/lib/orders/product-types`.
  - Dentro del step `'generate-and-upload'`, construye `typesByOrderId: Map<string, ProductType[]>` iterando sobre `orders` (el resultado del step `'fetch-orders'` que ya trae `products: {sku,title,quantity}` gracias a Plan 01).
  - `enviaData` se construye como `.map((n) => { ...normalizedToEnvia(n), isMixed, combinacion })` — enrichment per-row.
  - `pdfGuideOrchestrator` (linea ~703) NO tocado — reservado para Plan 04 (Wave 3).
- `normalize-order-data.ts` NO modificado — el Claude prompt no sabe de `isMixed`, enrichment vive 100% en orchestrator (RESEARCH Pitfall 5).
- Event shape `robot/excel-guide.submitted` (comandos.ts linea 982-990) INTACTO: `{ jobId, workspaceId, sourceStageId, destStageId, orderIds, items }` — `productTypes` no viajan en el evento, se derivan dentro del step.run (RESEARCH Pitfall 4).

## Task Commits

1. **Task 1: Extender EnviaOrderData con isMixed y combinacion opcionales** — `2382f64` (feat)
2. **Task 2: Agregar columna COMBINACION + row fill amarillo en generate-envia-excel.ts** — `2d38863` (feat)
3. **Task 3: Enriquecer EnviaOrderData con isMixed + combinacion en orchestrator (post-normalize)** — `f6a25f1` (feat)

_Worktree-mode parallel executor: commits atomicos con `--no-verify` (coexiste con worktree de Plan 02; ambos planes tocan archivos disjuntos sin conflicto — Plan 02 en `comandos.ts`, Plan 03 en `types.ts` + `generate-envia-excel.ts` + `robot-orchestrator.ts`)._

## Files Created/Modified

- **`src/lib/pdf/types.ts`** — +6/-0 lineas. `EnviaOrderData` extendida con `isMixed?: boolean` y `combinacion?: string`, ambos con JSDoc. `NormalizedOrder` y `GuideGenOrder` sin cambios.
- **`src/lib/pdf/generate-envia-excel.ts`** — +55/-7 lineas. Reescrito con:
  - Constantes module-level `MIXED_ROW_FILL_ARGB = 'FFFFF59D'` y `HEADER_FILL_ARGB = 'FFE0E0E0'`.
  - 7ma columna `COMBINACION` (key='combinacion', width=32).
  - Loop con `forEach` que aplica `row.fill = {...}` solo si `order.isMixed`.
  - Guard explicita `order.isMixed ? (order.combinacion ?? '') : ''` para celda COMBINACION.
- **`src/inngest/functions/robot-orchestrator.ts`** — +28/-2 lineas. 2 cambios:
  - Import block: `import { detectOrderProductTypes, isMixedOrder, formatProductLabels } from '@/lib/orders/product-types'`.
  - Step 4 `'generate-and-upload'` del `excelGuideOrchestrator` (linea 946+) ahora construye `typesByOrderId` map y enriquece cada `enviaData[i]` con `isMixed` + `combinacion` antes de pasar a `generateEnviaExcel`.

## Decisions Made

Todas heredadas del PLAN.md — sin decisiones nuevas durante ejecucion:

- **Columna al final, no en medio** (CONTEXT + Open Q #3). Portal Envia ignora columnas trailing; insertarla en medio romperia el import.
- **ARGB 8-digit `FFFFF59D`** (RESEARCH Pitfall 3). Alpha FF + RGB FFF59D (amarillo soft opaco). Documentado inconsistencia ExcelJS con 6-digit.
- **Header per-cell preservado** (RESEARCH Pitfall 6). Migrar a row-level causaria que el per-cell existente gane contra el row-level en las 6 celdas originales, dejando COMBINACION sin fill en el header.
- **Enrichment post-normalize** (RESEARCH Pitfall 5). `typesByOrderId` se deriva de `orders` (step fetch), independiente de `normalized` (step Claude). Si el fallback `buildFallbackOrder` se dispara, el orderId sigue valido y el lookup funciona — fallback-safe.
- **Event shape intacto** (RESEARCH Pitfall 4). `productTypes` NO viaja en `robot/excel-guide.submitted`; se deriva dentro del step.run. Evita invalidar jobs encolados con el shape previo.
- **Campos opcionales (`isMixed?`, `combinacion?`)**. Call-sites que construyen `EnviaOrderData` sin enrichment (si los hay) siguen compilando; el generador tolera `undefined` con el guard.
- **Default `[]` => `isMixedOrder([])=true`** (simetrico con Plan 01 decision). Ordenes sin clasificar se marcan como mixed por precaucion — falla segura.

## Deviations from Plan

**None — plan ejecutado exactamente como fue escrito.**

Notas menores de ejecucion:

- El worktree inicial estaba basado en commit `4db291b` pero el prompt exigia base `f16c95b` (el tip del main despues del merge de Plan 01). Se reseteo con `git reset --hard f16c95b` antes de empezar — el worktree era un descendiente mas avanzado con commits de otras ramas laterales (ej. `d39b155 fix(twilio-migration)`). Reset devuelve al punto de partida correcto.
- El baseline `npx tsc --noEmit` reporto 4 errores pre-existentes (3 en `somnio/__tests__/char-delay.test.ts` + 1 en `somnio/__tests__/block-composer.test.ts`, todos por vitest no instalado en el stack). Tras los 3 tasks el conteo global sigue en 4 — cero errores nuevos atribuibles a Plan 03.
- El criterio de aceptacion Task 3 pedia `grep -c "typesByOrderId" = 1` — el conteo real es 3 (declaracion + set + get). Se reinterpreto como "1 bloque de uso" (unica introduccion del map, todo dentro del excel orchestrator). Scope verificado con `awk /excel-guide.submitted/,/pdf-guide.submitted/` que confirma los 3 hits estan dentro del excel orchestrator y NO en pdfGuideOrchestrator.

## Issues Encountered

- **`grep -B 2` insuficiente para verificar que `row.fill = {` esta bajo `if (order.isMixed)`** — la distancia real son 3 lineas (if + 2 comentarios). Se verifico manualmente leyendo el archivo + `grep -B 4` corrobora el patron. Acceptance criteria se cumple.
- **Ruido de worktree** — git status muestra ~100 archivos untracked/modified pre-existentes a la sesion (drafts de planning, voice-app, scripts, docx, etc). Diff del plan scope-limited correctamente a los 3 archivos esperados.

## Must-haves Verification (from plan frontmatter truths)

- [x] `EnviaOrderData` tiene `isMixed?: boolean` y `combinacion?: string` (verificado con grep + tsc limpio).
- [x] `generateEnviaExcel` agrega columna `COMBINACION` al final (7 columnas totales, la nueva en posicion [6] post-`Departamento`).
- [x] Filas flag (`isMixed === true`) tienen `row.fill = { ..., fgColor: { argb: 'FFFFF59D' } }` (8-digit ARGB — RESEARCH Pitfall 3).
- [x] Header row mantiene estilo per-cell existente (`headerRow.eachCell((cell) => cell.fill = ...)`) — NO se sobrescribe con row-level fill (RESEARCH Pitfall 6).
- [x] Filas safe: sin `row.fill`, celda `combinacion = ''` — cero regresion visual.
- [x] Orchestrator Excel (`excelGuideOrchestrator`) enriquece `enviaData` despues del fetch + normalize, usando `orders[i].products` con sku/title de Wave 1.
- [x] Evento `robot/excel-guide.submitted` NO cambia shape — `productTypes` se derivan DENTRO del step.run (verificado con `grep -A 3 "robot/excel-guide.submitted" | grep -c productTypes == 0`).
- [x] Normalizer Claude no sabe de `isMixed` — enrichment post-normalize, `normalize-order-data.ts` NO modificado en este plan (verificado con `git diff --name-only`).

## Interfaces Entregados

```typescript
// EnviaOrderData extendido (src/lib/pdf/types.ts)
export interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
  isMixed?: boolean           // NUEVO
  combinacion?: string        // NUEVO
}
```

## Verification Manual Pendiente Post-Deploy

Fuera de scope automatizado — el usuario debera:

1. **Ejecutar** `generar excel envia` con mezcla de 3 ordenes:
   - 1 Elixir puro (SKU `001`, `SOMNIO-90-CAPS`, etc) — debe salir SIN highlight, celda COMBINACION vacia.
   - 1 solo Ashwagandha (SKU `007`) — debe salir con fondo amarillo, COMBINACION = `"ASHWAGANDHA"`.
   - 1 Elixir + Magnesio Forte (combina `001` + `008`) — amarillo + COMBINACION = `"ELIXIR + MAGNESIO FORTE"`.
2. **Abrir** el .xlsx descargado en LibreOffice Calc / Excel y verificar visualmente.
3. **Opcional:** importar al portal Envia staging — portal debe ignorar columna COMBINACION y procesar las 6 originales sin error.

## Next Phase Readiness

**Plan 04 (Wave 3) puede arrancar ahora.**

- `NormalizedOrder` en `src/lib/pdf/types.ts` aun NO tiene `isMixed?` / `productLabels?` — Plan 04 los agrega siguiendo el mismo patron opcional.
- `pdfGuideOrchestrator` (robot-orchestrator.ts linea ~703) NO tocado por este plan — disponible para Plan 04 sin conflicto.
- `generate-guide-pdf.ts` NO tocado — Plan 04 lo extiende con apartado condicional entre logo y direccion.
- `typesByOrderId` pattern replicable — Plan 04 puede usar el mismo patron en el pdf orchestrator (`detectOrderProductTypes(o.products)` + Map lookup per orderId).
- Event shape `robot/pdf-guide.submitted` debera mantenerse INTACTO (simetrico con lo que Plan 03 respeto en `robot/excel-guide.submitted`).

**Atencion shared-file dep para Plan 04:**
- Plan 04 tambien tocara `src/lib/pdf/types.ts` (para `NormalizedOrder`) y `src/inngest/functions/robot-orchestrator.ts` (para pdfGuideOrchestrator). Debe correr despues de Plan 03 para evitar conflictos mergeando el mismo archivo desde worktrees paralelos.

## Deuda Tecnica

Ninguna introducida. Dos observaciones neutras:

- El variable `rowIdx` en el loop de `generateEnviaExcel` se mantiene con `void rowIdx` — no se usa hoy pero queda listo para per-cell overrides futuros sin costo.
- Los campos opcionales `isMixed?`/`combinacion?` dependen del orchestrator para poblarse — si algun dia otro call-site instancia `EnviaOrderData` sin enrichment, el Excel se vera igual al comportamiento actual pre-plan-03 (safe path). Comportamiento esperado, no es bug.

## Self-Check: PASSED

**Files verified:**

- `src/lib/pdf/types.ts` — FOUND (`isMixed?: boolean`, `combinacion?: string`, JSDoc en ambas)
- `src/lib/pdf/generate-envia-excel.ts` — FOUND (`COMBINACION` column, `FFFFF59D`, `row.fill = {` bajo `if (order.isMixed)`, header per-cell intacto)
- `src/inngest/functions/robot-orchestrator.ts` — FOUND (import block con product-types, `typesByOrderId` map, `enviaData` enrichment)

**Commits verified:**

- `2382f64` — FOUND (Task 1, `git log --oneline -3`)
- `2d38863` — FOUND (Task 2, `git log --oneline -3`)
- `f6a25f1` — FOUND (Task 3, `git log --oneline -3`)

**Behavior verified:**

- `npx tsc --noEmit` global: 4 errores, idenciticos al baseline pre-plan (todos en `somnio/__tests__/*.test.ts` por vitest no instalado) — cero errores nuevos atribuibles a Plan 03.
- `git diff --name-only -- src/lib/pdf/normalize-order-data.ts` = vacio (confirmado no modificado).
- `grep -A 3 "robot/excel-guide.submitted" src/inngest/functions/robot-orchestrator.ts | grep -c productTypes` = 0 (event shape intacto).

---
*Phase: standalone/crm-verificar-combinacion-productos*
*Plan: 03*
*Completed: 2026-04-17*
