---
phase: crm-verificar-combinacion-productos
plan: 02
subsystem: logistics
tags: [typescript, server-action, inngest, ui, coordinadora, product-filtering]

# Dependency graph
requires:
  - phase: crm-verificar-combinacion-productos
    plan: 01
    provides: isSafeForCoord, formatProductLabels, detectOrderProductTypes, OrderForDispatch.products con shape rico
provides:
  - Filtro server-side en executeSubirOrdenesCoord (pre-validateCities, pre-createRobotJob)
  - SubirOrdenesResult.rejectedByCombination campo siempre presente (array vacio si no hay rechazos)
  - Early-return shape para "todas rechazadas" replicando precedente validCityResults.length === 0
  - CommandMessage warning variant extendido con products?:string + originalCity?/resolvedCity?/department? opcionales
  - Render condicional item.products ? ... : ... en command-output.tsx case 'warning'
affects:
  - crm-verificar-combinacion-productos plan 03 (Excel Envia — corre en paralelo, sin conflicto de archivos)
  - crm-verificar-combinacion-productos plan 04 (PDFs Inter + Bogota — Wave 3)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filtro input-side en server action ANTES de llamadas costosas (Claude AI city validation)"
    - "Early-return replicando forma de precedente en el mismo archivo (success:false + error + data poblado)"
    - "Union discriminada por presencia de campo opcional (item.products ? ... : ...) en renderer — sin variant separado"
    - "Campos opcionales en lugar de strings vacios '' para evitar render legacy garbage"

key-files:
  created: []
  modified:
    - src/app/actions/comandos.ts
    - src/app/(dashboard)/comandos/components/comandos-layout.tsx
    - src/app/(dashboard)/comandos/components/command-output.tsx

key-decisions:
  - "Filtro ANTES de validateCities (RESEARCH Open Q #1) — ahorra costo Claude AI en ordenes destinadas a rechazo"
  - "Rename const orders -> const allOrders solo en seccion del filtro; downstream sigue usando 'orders' (safe) sin cambios"
  - "Early-return 'todas rechazadas' usa invalidCount: rejectedByCombination.length (NO 0) — las rechazadas cuentan como invalidas conceptualmente"
  - "Extender CommandMessage warning variant existente (no crear 'combination_warning') — RESEARCH Open Q #4"
  - "originalCity/resolvedCity/department pasan a opcionales; warning de combinacion los OMITE (undefined) en lugar de ''"
  - "Evento Inngest robot/job.submitted shape INTACTO — solo ordenes safe llegan al evento (RESEARCH Pitfall 4)"
  - "REGLA 3 OK: filtro es input-side, no mutacion — no requiere nuevo dominio"
  - "REGLA 6 OK: robot Railway no tocado; cambio 100% Next.js server-side"

patterns-established:
  - "Filtro server-side por combinacion de productos (pattern replicable para otros flujos logisticos)"
  - "Discriminacion por presencia de campo opcional en renderer compartido — zero-regression para legacy consumers"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-04-17
---

# Phase crm-verificar-combinacion-productos Plan 02: Filtro de Combinacion en Coord + UI Warning Summary

**Filtro server-side en executeSubirOrdenesCoord (pre-validateCities, pre-createRobotJob) que separa ordenes en validForCoord (Elixir puro) vs rejectedByCombination (Ashwagandha/Magnesio Forte/mix), retorna la lista de rechazadas al UI /comandos como warning amarillo con labels UPPERCASE y razon accionable, y deja intacto el evento Inngest robot/job.submitted.**

## Performance

- **Duration:** ~9 min (527s)
- **Started:** 2026-04-17T03:39:34Z
- **Completed:** 2026-04-17T03:48:21Z
- **Tasks:** 3 (Task 1: filtro comandos.ts, Task 2: union + render layout, Task 3: renderer condicional output)
- **Commit:** `306d7a7` (atomico — Tasks 1+2+3 en un solo commit per plan instructions)
- **Files modified:** 3

## Accomplishments

- **Filtro server-side implementado** en `executeSubirOrdenesCoord` (src/app/actions/comandos.ts) como bloque "5b" entre el fetch de ordenes (linea ~210) y el validateCities (ahora linea ~275+). Ordenes con products NO-Elixir se apartan en `rejectedByCombination: Array<{orderId, orderName, products, reason}>`; solo las que pasan `isSafeForCoord(types)` avanzan al flujo existente (validateCities → AI resolve → COD filter → createRobotJob → inngest.send).
- **Rename `const orders` → `const allOrders`** en el fetch. Se crea un NUEVO `const orders` filtrado que el resto del flujo sigue usando sin cambios. El unico lugar que referencia `allOrders` es el `totalOrders` en los dos returns (success:false early y success:true final) — para preservar el total real fetcheado.
- **Early-return cuando TODAS las ordenes fueron rechazadas por combinacion** con shape EXACTO del precedente `validCityResults.length === 0` (linea ~370 del archivo post-cambios): `success:false + error + data`. `invalidCount: rejectedByCombination.length` (NO 0 — las rechazadas cuentan como invalidas operacionalmente). `totalOrders: allOrders.length`. `invalidOrders: []` (estas NO son city-invalid). `rejectedByCombination` poblado para el UI.
- **SubirOrdenesResult extendido** con el nuevo campo `rejectedByCombination` (sin `?` — siempre se retorna, array vacio cuando no hay rechazos). Ambos returns (early `validCityResults.length === 0` y final `success:true`) ahora incluyen el campo.
- **CommandMessage warning variant extendido** en `comandos-layout.tsx`: `originalCity`, `resolvedCity`, `department` pasan a **opcionales**; nuevo campo opcional `products?:string`. NO se crea un variant separado "combination_warning" (RESEARCH Open Q #4 — anti-pattern documentado).
- **Nuevo addMessage de tipo `'warning'`** insertado en el branch `normalized === 'subir ordenes coord'` INMEDIATAMENTE DESPUES del system message inicial y ANTES del warning existente de `aiResolvedOrders` (prioridad operacional — las ordenes no-enviadas son mas accionables que las corregidas por IA). Los campos de ciudad se **omiten** en el mapping (quedan undefined) — NO se poblan con `''`.
- **command-output.tsx `case 'warning'`** ahora renderiza condicionalmente por presencia de `item.products`: si esta presente → bloque combinacion (nombre + " — " + products UPPERCASE); si no → bloque legacy (nombre + " — " + "originalCity" + " → " + resolvedCity). `item.reason` se muestra igual en ambos casos (italic muted).

## Filtro — Shape del Early-Return "Todas Rechazadas" (verificable inline)

El early-return agregado replica el shape del precedente `validCityResults.length === 0` (mismo archivo, ahora linea ~370). Inspeccion:

```typescript
if (rejectedByCombination.length === allOrders.length) {
  return {
    success: false,
    error: `Las ${allOrders.length} orden${allOrders.length === 1 ? '' : 'es'} en la etapa contienen productos que no se despachan por Coordinadora. Usa Envía/Inter/Bogotá.`,
    data: {
      jobId: '',
      totalOrders: allOrders.length,          // ← total real fetcheado
      validCount: 0,                          // ← ninguna paso
      invalidCount: rejectedByCombination.length,  // ← rechazadas cuentan como invalidas
      invalidOrders: [],                      // ← no son city-invalid; detalle en rejectedByCombination
      aiResolvedOrders: [],                   // ← no se ejecuto resolveCitiesWithAI
      rejectedByCombination,                  // ← poblado para UI warning
    },
  }
}
```

Replica EXACTA (modulo el `error` string): el precedente usa `'Ninguna orden paso la validacion de ciudad/COD'` + `invalidCount: invalidOrders.length`; el nuevo usa el mensaje especifico de combinacion + `invalidCount: rejectedByCombination.length`. Mismos campos, mismo shape.

## Nuevos Campos en SubirOrdenesResult

```typescript
interface SubirOrdenesResult {
  jobId: string
  totalOrders: number
  validCount: number
  invalidCount: number
  invalidOrders: Array<{ orderId: string; orderName: string | null; reason: string }>
  aiResolvedOrders: Array<{ orderId; orderName; originalCity; resolvedCity; department; reason }>
  rejectedByCombination: Array<{           // ← NUEVO — siempre presente
    orderId: string
    orderName: string | null
    products: string                       // "ELIXIR + ASHWAGANDHA" / "MAGNESIO FORTE" / "SIN CLASIFICAR"
    reason: string                         // "Contiene X y no hay stock ... Usa Envía/Inter/Bogotá ..."
  }>
}
```

## CommandMessage Warning Variant — Cambio de Shape

```typescript
// ANTES
| {
    type: 'warning'
    title: string
    items: Array<{
      orderName: string | null
      originalCity: string       // requerido
      resolvedCity: string       // requerido
      department: string         // requerido
      reason: string
    }>
    timestamp: string
  }

// DESPUES
| {
    type: 'warning'
    title: string
    items: Array<{
      orderName: string | null
      originalCity?: string      // ← CAMBIO: opcional
      resolvedCity?: string      // ← CAMBIO: opcional
      department?: string        // ← CAMBIO: opcional
      reason: string
      products?: string          // ← NUEVO: opcional (warning de combinacion)
    }>
    timestamp: string
  }
```

El codigo existente que construye warning de `aiResolvedOrders` (en comandos-layout.tsx linea ~549) sigue poblando los 4 campos legacy — no cambia shape de uso. El nuevo warning de combinacion SOLO pobla `orderName + reason + products` (los 3 de ciudad quedan undefined por omision).

## Event Shape robot/job.submitted — INTACTO

Verificado inline: el objeto `data:` dentro de `inngest.send({ name: 'robot/job.submitted', data: { ... } })` sigue conteniendo exactamente:

- `jobId`
- `workspaceId`
- `carrier` (literal `'coordinadora'`)
- `credentials`
- `orders` (map con `itemId`, `orderId`, `pedidoInput`)

NO contiene `rejectedByCombination`. RESEARCH Pitfall 4 respetado. Robot Railway (Phase 27 Coordinadora service) NO se toca — REGLA 6 OK.

## Task Commits

Todos los tasks (1, 2, 3) se commitearon **atomicamente en un solo commit** segun la instruccion `<atomic_commit_note>` del plan. El plan explicitamente requiere commit atomico porque Task 2 (extension de union) y Task 3 (renderer condicional) son interdependientes — si se separan, uno compila con error hasta que llegue el otro.

1. **Task 1: Filtro de combinacion en executeSubirOrdenesCoord** — `306d7a7` (feat)
2. **Task 2: Extender CommandMessage union + render del warning** — `306d7a7` (feat)
3. **Task 3: Render condicional del campo products en command-output.tsx** — `306d7a7` (feat)

_Worktree-mode: commit unico --no-verify por recomendacion de orchestrator paralelo (plan 03 corre concurrentemente en otro worktree sin conflicto de archivos)._

## Files Created/Modified

- `src/app/actions/comandos.ts` — +55/-3 lineas. Import agregado (3 funciones de `@/lib/orders/product-types`). `SubirOrdenesResult` extendido con `rejectedByCombination`. Bloque "5b" inserto (filtro + early-return). Dos returns downstream actualizados (early `validCityResults.length === 0` + final `success:true`) — ambos ahora incluyen `rejectedByCombination` + `totalOrders: allOrders.length`. Evento Inngest intacto.
- `src/app/(dashboard)/comandos/components/comandos-layout.tsx` — +22/-3 lineas. Union `CommandMessage` variant `warning` extendido. Nuevo addMessage type:'warning' en branch `subir ordenes coord` antes del warning de `aiResolvedOrders`.
- `src/app/(dashboard)/comandos/components/command-output.tsx` — +13/-3 lineas. `case 'warning'` ahora usa render condicional `item.products ? ... : ...`. Legacy branch (`originalCity` → `resolvedCity`) intacto.

## Decisions Made

Todas las decisiones heredadas del PLAN — no hubo decisiones nuevas durante ejecucion. Destacadas:

- **Filtro ANTES de validateCities.** RESEARCH Open Question #1 lo justifica: ahorrar costo de Claude AI city resolution en ordenes destinadas a rechazo. La orden aparece en el warning con sus productos originales; si el usuario la cambia de etapa/arregla los productos, regresa al flujo.
- **Rename quirurgico de `orders` → `allOrders`.** Solo afecta la seccion del filtro + los dos `totalOrders` en los returns. Todo el downstream (`validateCities`, `codRejected`, `createRobotJob`, `inngest.send`, construccion de `invalidOrders`, `cityResultMap`, etc.) sigue usando `orders` (el nuevo filtrado). Cero refactor downstream.
- **Early-return replica del precedente.** El plan fue explicito: mismo shape que el `validCityResults.length === 0` que ya existia — `success:false + error string + data` con conteos reales. Esto garantiza que el branch legacy del UI (`if (!result.success)` que lee `result.error`) funciona sin cambios y el UI ve los conteos correctos.
- **`invalidCount: rejectedByCombination.length` (NO 0).** Las rechazadas cuentan como invalidas operacionalmente. El UI ya tiene el habito de mostrar `N invalidas` cuando `invalidCount > 0`; poner 0 ahi seria engañoso.
- **Campos de ciudad → opcionales + omision en el mapping.** Strings vacios `''` en los tres campos serian fragiles (el renderer legacy mostraria `" → "` garbage). Con opcionales + omision, el renderer discrimina limpiamente por presencia de `item.products`.
- **Extender variant existente (no crear 'combination_warning').** RESEARCH Open Q #4 lo llama explicitamente anti-pattern. Con campos opcionales + discriminacion en renderer, un solo variant soporta ambos casos sin branching explicito en el TypeScript del switch.
- **REGLA 3 OK.** El filtro es input-side (descarte pre-write), no mutacion de datos. Queda apropiadamente en server action sin pasar por domain/.
- **REGLA 6 OK.** El robot Railway Coordinadora (service externo) no se toca. El cambio es 100% Next.js server-side. Zero riesgo para el agente/robot en produccion.

## Deviations from Plan

**None — plan ejecutado exactamente como fue escrito.**

Observaciones menores (NO son deviations):
- `.planning/config.json` quedo como modified en git status antes y despues del commit — es propiedad del orchestrator (del parent `/gsd:execute-phase`), NO del plan 02. Se excluyo explicitamente del `git add`.
- Pre-existing tsc errors (5 total): 4 vitest + 1 sms-tab (Twilio→Onurix migration in flight). Mismos 5 errores reportados en Plan 01 SUMMARY — out-of-scope documentados.

## Issues Encountered

- Durante el primer `Edit` del archivo, el hook "READ-BEFORE-EDIT REMINDER" emitio avisos a pesar de que el archivo ya estaba leido en la sesion (lineas 1-1120). Los edits se aplicaron correctamente (confirmado con verificacion post-edit). El aviso aparentemente es un false-positive del hook cuando hay multiples tool calls en secuencia rapida — no afecta correctitud.

## Verificacion Runtime

Inspeccion inline post-edit:

```
=== Imports present ===
isSafeForCoord: 2  (1 en import, 1 en uso isSafeForCoord(types))
formatProductLabels: 2
detectOrderProductTypes: 2

=== allOrders count ===
const allOrders: 1

=== rejectedByCombination: 11 menciones en comandos.ts
   (declaracion, push, check length, tres apariciones en data objects, imports de UI, etc.)

=== isSafeForCoord(types): 1 call en el filtro
=== bodega de Coord: 1 (en el reason string)
=== Usa Envía/Inter/Bogotá: 2 (reason string + error early-return)
=== Early-return message: 1 ("contienen productos que no se despachan por Coordinadora")

=== Early-return shape: verified via grep -A 12
    success: false
    error: ... Usa Envía/Inter/Bogotá.
    data:
      jobId: ''
      totalOrders: allOrders.length
      validCount: 0
      invalidCount: rejectedByCombination.length  ← NO 0
      invalidOrders: []
      aiResolvedOrders: []
      rejectedByCombination,

=== NO "invalidCount: 0" en early-return: 0 occurrences ✓

=== Inngest event intact: grep -A 25 en 'robot/job.submitted' -> 0 ocurrencias de rejectedByCombination ✓
    Shape: jobId, workspaceId, carrier, credentials, orders (map con itemId, orderId, pedidoInput)
```

UI files:
```
=== products?: string en comandos-layout.tsx: 1 ✓
=== originalCity?: string: 1 ✓
=== resolvedCity?: string: 1 ✓
=== department?: string: 1 ✓
=== rejectedByCombination en layout: 3 (data.rejectedByCombination &&, data.rejectedByCombination.length, data.rejectedByCombination.map)
=== Titulo "NO se enviaron a Coordinadora": 1 ✓
=== products: r.products en mapping: 1 ✓
=== originalCity: '' en el mapping de rejectedByCombination: 0 ✓ (omitido, no vacio)
=== combination_warning variant: 0 ✓ (no se creo variant separado)

command-output.tsx:
=== item.products ? : 1 ✓
=== legacy &quot;{item.originalCity}&quot; preservado: 1 ✓
```

`npx tsc --noEmit`:
- Antes del commit: 5 errores totales (4 vitest pre-existentes + 1 sms-tab pre-existente).
- Post-edit: mismos 5 errores, 0 nuevos en archivos touched por Plan 02.
- Filtro especifico `grep -E "(command-output|comandos-layout|actions/comandos)"` en el output: 0 matches.

## Must-haves Verification (from plan frontmatter truths)

- [x] `executeSubirOrdenesCoord` filtra por combinacion INMEDIATAMENTE despues del fetch (antes de validateCities) — bloque "5b" inserto entre el check `allOrders.length === 0` y el comentario `// 6. Validate cities`.
- [x] Solo las ordenes `isSafeForCoord` llegan a `createRobotJob` y al evento `robot/job.submitted` — el `const orders` filtrado es lo que el resto del flujo usa para construir `validOrderIds` (que entra a createRobotJob) y los `pedidoInputs` (que van al evento).
- [x] `SubirOrdenesResult` incluye `rejectedByCombination: Array<{orderId, orderName, products, reason}>` — campo declarado en la interface.
- [x] Mensaje incluye nombre orden, productos (ej `ASHWAGANDHA` o `ELIXIR + ASHWAGANDHA` via `formatProductLabels`), razon con 'Usa Envía/Inter/Bogotá' — el reason string lo contiene literal.
- [x] UI `comandos-layout.tsx` renderiza mensaje `type: 'warning'` extra cuando `rejectedByCombination.length > 0`, separado del warning de `aiResolvedOrders` — el nuevo `addMessage` se inserta ANTES del warning legacy, con su propio titulo.
- [x] Renderer `command-output.tsx` muestra `products` cuando presente; campos `originalCity?`/`resolvedCity?`/`department?` pasan a opcionales — confirmado en el type + en el render condicional.
- [x] Evento `robot/job.submitted` NO cambia de shape — productos rechazados nunca llegan al evento (solo `orders` filtradas pasan).

## User Setup Required

**None** — no migracion DB, no env vars, no cambios externos. Cambios son 100% TypeScript del codebase.

## Next Phase Readiness

- **Plan 03 (Excel Envia, Wave 2 paralelo)** puede proceder sin conflicto — plan 03 toca `src/lib/pdf/normalize-order-data.ts`, `src/lib/pdf/generate-envia-excel.ts`, `src/inngest/functions/robot-orchestrator.ts`. Plan 02 toca `comandos.ts` + 2 componentes UI de /comandos. Cero overlap.
- **Plan 04 (PDFs Inter + Bogota, Wave 3)** — el patron de filtro en comandos.ts es SOLO para Coord. Los otros 3 flujos (Inter/Bogota/Envia) NO filtran por combinacion — en Plan 04 el flag de combinacion se aplicara **visualmente** (en el PDF/Excel del envio) para que el operador humano lo vea al momento de despachar, NO como filtro server-side. Razonamiento: para Envia/Inter/Bogota SI hay stock de todos los productos; Coord es el unico flujo donde la bodega no los tiene.

## Technical Debt

**None** — el codigo agregado sigue los patterns existentes del archivo (early-return shape, uso de helpers puros, replica exacta de precedentes). Cero `as any`, cero shape-mismatches, cero TODOs.

## Self-Check: PASSED

**Files verified (via `ls -la` y `git show --stat`):**
- `src/app/actions/comandos.ts` — FOUND, modificado (+55/-3 lineas en commit 306d7a7)
- `src/app/(dashboard)/comandos/components/comandos-layout.tsx` — FOUND, modificado (+22/-3 lineas)
- `src/app/(dashboard)/comandos/components/command-output.tsx` — FOUND, modificado (+13/-3 lineas)

**Commits verified:**
- `306d7a7` — FOUND via `git log --oneline -1` = "feat(crm-verificar-combinacion-productos): filtro de combinacion en flujo Coord + UI warning"

**Behavior verified:**
- `npx tsc --noEmit` sobre archivos Plan 02: 0 errores
- `npx tsc --noEmit` global: 5 errores TODOS pre-existentes (4 vitest + 1 sms-tab — mismos que Plan 01 reporto out-of-scope)
- Inngest event `robot/job.submitted` data shape: intacto (verificado inline con grep -A 25)
- Early-return shape replica precedente: verificado inline con grep -B 2 -A 12
- UI type union extendida correctamente: verificado con grep de todos los campos opcionales
- Render condicional item.products presente: verificado con grep -c

---

## Addendum 2026-04-17 — fix gap-closure post-QA Task 4

**Gap capturado por el checkpoint humano del Plan 04 (Paso 2 del QA):** cuando TODAS las ordenes son rechazadas por combinacion, el server retorna `success:false` con texto generico + `data.rejectedByCombination` poblado. La UI cortaba en el early-return de `!result.success` y mostraba solo el texto generico, sin orderName ni products ni reason.

**Causa:** `comandos-layout.tsx:517-525` trataba el branch `!success` como error puro sin inspeccionar `data.rejectedByCombination`. El must-have "warning cuando `rejectedByCombination.length > 0`" solo se implementaba en la rama success:true (parcial), no en el early-return "todas rechazadas".

**Fix:** Dentro del `if (!result.success)`, se inspecciona `result.data?.rejectedByCombination` y si tiene items se renderiza el mismo warning detallado (orderName + products + reason) que ya existia para el caso parcial. Si no hay rejectedByCombination (error real), cae al mensaje de error generico.

**Impacto:** Cuando 1 de 1 orden es rechazada, la UI ahora muestra:
> 1 orden NO se enviaron a Coordinadora (productos fuera de stock en bodega Coord):
> - Jose Romero — ASHWAGANDHA — Contiene ASHWAGANDHA y no hay stock de esos productos en la bodega de Coord. Usa Envia/Inter/Bogota para esta orden.

**Archivos modificados en el fix:** `src/app/(dashboard)/comandos/components/comandos-layout.tsx` (+17/-4 lineas aprox).
**Tratamiento GSD:** fix atomico dentro de la fase activa — Plan 02 scope, commit prefijo `fix(crm-verificar-combinacion-productos-02):`. No se abre plan nuevo: es exactamente lo que el gate bloqueante Task 4 existe para capturar.

---
*Phase: standalone/crm-verificar-combinacion-productos*
*Plan: 02*
*Wave: 2 / 3*
*Depends on: 01*
*Completed: 2026-04-17*
