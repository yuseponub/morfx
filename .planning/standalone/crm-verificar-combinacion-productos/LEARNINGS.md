# LEARNINGS — Fase Standalone `crm-verificar-combinacion-productos`

**Fecha cierre (codigo):** 2026-04-17
**Planes completados:** 01 (Wave 1), 02 (Wave 2a), 03 (Wave 2b), 04 (Wave 3)
**Checkpoint humano del cierre:** pendiente de QA post-deploy (Task 4 del Plan 04)
**Scope:** anti-error en despacho — 4 flujos de generacion de guias (Coord + Envia + Inter + Bogota)

Este archivo consolida bugs, decisiones sutiles, patterns exitosos y gotchas de runtime descubiertos al ejecutar los 4 planes de la fase. Proposito: entrenar agentes futuros + guia para planners que trabajen en areas adyacentes.

---

## 1. Pitfalls resueltos por RESEARCH vs los que emergieron en runtime

### Pitfalls que RESEARCH predijo y que se mitigaron limpiamente

| # | Pitfall | Donde se mitigo | Estado |
| - | ------- | --------------- | ------ |
| 1 | `getOrdersByStage` y `getOrdersForGuideGeneration` seleccionaban solo `order_products(quantity)` — `detectOrderProductTypes` retornaba `[]` para TODO | Plan 01 Tasks 2-3 widen del SELECT + lockstep de 3 tipos (OrderForDispatch/OrderForGuideGen/GuideGenOrder) | RESUELTO — es lo primero que se ejecuto, desbloqueo todo lo demas |
| 2 | PDFKit: `fillAndStroke(fill, stroke)` deja el `fillColor` interno en `fill`; si despues llamas `.text(...)` sin `fillColor` explicito, el texto sale del color del box (invisible) | Plan 04 Task 2: `doc.fillColor('#B45309')` antes de `.text(...)` + `doc.fillColor('#000000')` DESPUES | RESUELTO — sin el reset, el texto siguiente (ENVIAR A:, direccion) saldria naranja |
| 3 | ExcelJS ARGB de 6 digitos (`'FFFF00'`) renderiza inconsistente entre versiones. Debe ser 8 digitos (alpha + RGB) | Plan 03 Task 2: constante `MIXED_ROW_FILL_ARGB = 'FFFFF59D'` | RESUELTO |
| 4 | Modificar shape del evento Inngest (`robot/pdf-guide.submitted` o `robot/excel-guide.submitted`) invalida jobs encolados al deploy | Plans 02, 03, 04: `productTypes` derivados DENTRO del step.run, nunca viajan en el evento | RESUELTO |
| 5 | `normalize-order-data.ts`'s `buildFallbackOrder` no sabe de `isMixed` — si Claude falla, flag orders renderizarian sin la marca visual | Plans 03, 04: enrichment 100% en orchestrator, `orders` (del fetch step) es independiente del fallback | RESUELTO |
| 6 | Header row existente en Excel usa per-cell `.fill`; si se migra a row-level, colisiona | Plan 03 Task 2: header preservado per-cell, row-level solo aplica a data rows | RESUELTO |

### Pitfalls que NO estaban en RESEARCH pero aparecieron en runtime

**Ninguno critico.** Pero si aparecieron estos matices menores:

**A) Conteos raw de `grep` vs "usos semanticos".** El planner de Plans 03 y 04 escribio acceptance criteria como `grep -c "typesByOrderId" == 1` (o `== 2` global). El conteo real es `== 3` por orchestrator (declaracion + `.set(...)` + `.get(...)`). No es un bug — el agente ejecutor lo reinterpreto como "1 BLOQUE de enrichment por orchestrator", consistente con las 2 ocurrencias esperadas por el planner. **Gotcha para planners futuros:** escribir acceptance criteria que mire el grep real de greps que entienden bloques, no menciones aisladas (ej: `grep -c "const typesByOrderId = new Map"` seria mas preciso que `grep -c "typesByOrderId"`).

**B) `grep -B 3 "generateGuidesPdf(enriched" | grep -q "normalized.map"` falla.** Porque el bloque de enrichment ocupa ~10 lineas entre el `normalized.map` y el `generateGuidesPdf(enriched, ...)` — la distancia es 10, no 3. **Gotcha:** `-B 3` asume que el codigo es compacto. Mejor usar `grep -B 10` o, mejor aun, un grep semantico como `grep -A 20 "const enriched = normalized.map" | grep -q "generateGuidesPdf(enriched"`.

**C) Git status muy ruidoso impide `git add -A`.** El repositorio tiene ~100 archivos untracked/modified pre-existentes a la sesion (drafts de planning, voice-app, scripts, docx). Cualquier `git add .` o `-A` metia basura. **Solucion aplicada en los 4 planes:** `git add <path1> <path2> ...` explicitamente. **Regla consolidada:** NUNCA usar `-A`/`.` en este repo.

**D) Hook `PreToolUse:Edit` emite falso READ-BEFORE-EDIT despues de un Read exitoso.** Aparentemente el hook es sensible a secuencias rapidas Read → multiples Edits sin Read intermedio. Los edits funcionan correctamente — el hook solo es warning ruidoso. **Gotcha:** no re-Read despues del warning, el Edit ya aplico.

---

## 2. Patrones exitosos — replicables en otras fases

### Pattern 1: Helpers puros centralizados (Plan 01)

**Ubicacion:** `src/lib/orders/product-types.ts`

**Principio:** una logica cross-flow (aqui: clasificar productos) no se re-implementa en cada flujo. Se centraliza como helpers **puros** (sin side effects, sin fetch, sin I/O) de modo que multiples callers los reusen. Los 4 flujos (Coord filter, Excel highlight, PDF Inter, PDF Bogota) consumen las MISMAS 3 funciones:

```ts
isSafeForCoord(types: ProductType[]): boolean
isMixedOrder(types: ProductType[]): boolean
formatProductLabels(types: ProductType[]): string
```

**Por que funciona:** cambios futuros de copy/logica (ej: agregar un nuevo SKU, cambiar el label "ASHWAGANDHA" a otra cosa) solo requieren editar 1 archivo. Cero riesgo de drift.

**Replicable en:** cualquier logica cross-flow — normalizacion de telefonos, validacion de direcciones, deteccion de COD, etc.

### Pattern 2: Lockstep de types consumidos por multiples capas (Plan 01)

**Problema:** `getOrdersByStage` (domain) retorna `OrderForDispatch`; `getOrdersForGuideGeneration` (domain) retorna `OrderForGuideGen`; el PDF/Excel normalizer consume `GuideGenOrder`. Los 3 tipos tienen que mantener identica estructura de `products`.

**Solucion:** ampliar los 3 tipos en lockstep en el MISMO commit:
```ts
products: Array<{ sku: string | null; title: string | null; quantity: number }>
```

**Gotcha:** el tercer tipo (`GuideGenOrder`) vive en un archivo distinto (`src/lib/pdf/types.ts`) pero el consumidor downstream (`robot-orchestrator.ts` linea 738-745) hace spread `products: o.products`. Sin lockstep, TypeScript rompe en el consumidor.

**Replicable en:** cualquier cadena domain → normalizer → generator que pase DTOs.

### Pattern 3: Filtro server-side con early-return shape replicante (Plan 02)

**Contexto:** `executeSubirOrdenesCoord` ya tenia 2 precedentes de "filtrar + devolver lista de rechazados": city validation (invalidCityResults) y COD (codRejected). Plan 02 agrego un tercero (rejectedByCombination) siguiendo el MISMO shape exacto.

**Por que funciona:** el UI renderer ya consume ese shape. Agregar un tercer filtro no requirio nuevos renderers — solo extender el discriminator del mensaje con un campo opcional.

**Principio generalizable:** cuando agregues un nuevo filtro, busca si YA existe un precedente de filtro en el mismo archivo. Si existe, copia su shape exacto (mismos campos, mismos nombres, misma forma de return) — el sistema ya sabe consumirlo.

### Pattern 4: Post-normalize enrichment (Plans 03 + 04)

**Contexto:** los orchestrators tienen 3 steps clave:
1. `fetch-orders` — retorna `orders` con productos ricos.
2. `normalize-data` — retorna `normalized` (Claude AI, puede fallar → fallback).
3. `generate-and-upload` — genera xlsx/pdf y sube a Storage.

**Problema:** queremos enriquecer cada orden con `isMixed` + labels. Donde poner la logica?

**Opciones evaluadas:**
- A) En el prompt de Claude → invasivo, Claude puede fallar, Claude prompt no es lugar para logica deterministica.
- B) Dentro de `normalize-data` step → problematico para el fallback path (`buildFallbackOrder` no sabria del enrichment).
- C) Dentro de `generate-and-upload` step → **ELEGIDO**. `orders` (ricos) y `normalized` (output de step 2) estan ambos disponibles en el closure del handler.

**Implementacion:**
```ts
const typesByOrderId = new Map<string, ProductType[]>()
for (const o of orders) {
  typesByOrderId.set(o.id, detectOrderProductTypes(o.products))
}
const enriched = normalized.map(n => {
  const types = typesByOrderId.get(n.orderId) ?? []
  const mixed = isMixedOrder(types)
  return { ...n, isMixed: mixed, productLabels: mixed ? formatProductLabels(types) : undefined }
})
```

**Ventajas:**
- Event shape INTACTO → cero riesgo jobs encolados (Pitfall 4).
- Claude prompt INTACTO → sin cambio al modelo entrenado (Pitfall 5).
- Fallback funciona identico → `orderId` sigue siendo la key de match.
- Zero cost: re-derivar `productTypes` en un Map es O(n), negligeable.

**Replicable en:** cualquier DTO enrichment que dependa de campos que ya fueron fetched pero que el normalizer no captura. Guardalo como pattern nombrado: **"post-normalize enrichment en orchestrator step, usando el fetch step como fuente de verdad"**.

### Pattern 5: Union discriminada via presencia de campo opcional (Plan 02)

**Contexto:** existia `CommandMessage type: 'warning'` con campos `originalCity`, `resolvedCity`, `department` requeridos. Queriamos agregar una variante con `products` en vez de campos de ciudad.

**Opciones:**
- A) Crear variant nuevo `type: 'combination_warning'` → RESEARCH lo llamo anti-pattern porque requiere 2 renderers + 2 ramas switch.
- B) Extender la variant existente con `products?` + pasar campos de ciudad a opcionales → **ELEGIDO**.

**Implementacion:**
```ts
items: Array<{
  orderName: string | null
  originalCity?: string     // antes: requerido
  resolvedCity?: string     // antes: requerido
  department?: string       // antes: requerido
  reason: string
  products?: string         // NUEVO
}>
```

**Renderer:** discrimina por presencia:
```tsx
{item.products ? <ProductsBlock /> : <CityResolveBlock />}
```

**Principio generalizable:** cuando quieras agregar una variante, pregunta si "hacer opcionales + discriminar por presencia" es equivalente a "crear un discriminated tag". Para UIs simples, opcional + presencia gana (menos codigo, menos switch branches).

### Pattern 6: Defensive double-check en renderer (Plan 04)

**Codigo:**
```typescript
if (order.isMixed && order.productLabels) {
  // render caja
}
```

**Por que double check:** `isMixed` puede venir `true` pero `productLabels` llegar `undefined` si un bug upstream (Map miss, enrichment omitido, spread perdido) rompio la consistencia. Renderizar una caja con `"COMBINACIÓN: "` vacio seria peor que no renderizarla. El AND gap-gate ambas condiciones.

**Replicable en:** cualquier render condicional dependiente de 2+ flags. Pagate el "&& X.y" — 1 LoC, cero costo, defense-in-depth.

### Pattern 7: Const-exact para colores brand (Plan 04)

**Plan 04 decision:** el borde de la caja usa `#ff751f` que es **exactamente** `PRODUCT_TYPE_COLORS.ash.dotColor` (el color del dot de Ashwagandha en el Kanban).

**Por que funciona:** cross-surface consistency. El mismo naranja en (1) dots del Kanban, (2) borde del apartado PDF. El agente humano/operador ya reconoce ese naranja como "Ashwagandha" — no hay que ensenarle un nuevo codigo visual.

**Replicable en:** cualquier codigo visual cross-surface. Reusar constantes existentes, NO hardcodear colores nuevos de la misma familia.

---

## 3. Decisiones sutiles que podrian no ser obvias en re-lectura

### 3a. Plan 01: DISPLAY_LABELS module-scoped (NO exportado)

**Decision:** el mapa `{ melatonina: 'ELIXIR', ash: 'ASHWAGANDHA', magnesio_forte: 'MAGNESIO FORTE' }` vive como `const` no-exportada. Solo `formatProductLabels` se expone como API publica.

**Por que:** force-contain el consumo. Si el mapa fuera public, callers podrian hacer `DISPLAY_LABELS['ash']` bypaseando `formatProductLabels`, perdiendo el ordering deterministico (`PRODUCT_TYPE_ORDER`). Con encapsulacion, el ordering y el sentinel `'SIN CLASIFICAR'` siempre se respetan.

### 3b. Plan 02: `invalidCount: rejectedByCombination.length` (NO `0`) en early-return

**Decision:** cuando TODAS las ordenes fueron rechazadas por combinacion, el early-return popula `invalidCount: rejectedByCombination.length` — NO `0`.

**Por que:** las rechazadas cuentan como invalidas OPERACIONALMENTE. El UI ya tiene el habito de mostrar "N invalidas" cuando `invalidCount > 0`. Poner `0` ahi seria enganoso para el operador (pensaria que todo fue exito).

### 3c. Plan 03: columna COMBINACION al FINAL (no en medio)

**Decision:** la columna 7 (COMBINACION) va al final del worksheet — despues de Departamento.

**Por que:** el portal de Envia ingiere el xlsx con un mapeo posicional de las primeras 6 columnas. Insertar la nueva en medio rompe ese mapeo. Al final, el portal simplemente ignora la columna 7 — cero riesgo de import-break.

### 3d. Plan 03: header row preservado per-cell fill, NO migrado a row-level

**Decision:** el header row mantiene su `headerRow.eachCell((cell) => { cell.fill = ... })` existente.

**Por que:** si migras a row-level, ExcelJS aplica la regla "per-cell wins" — las 6 celdas originales mantendrian su per-cell fill, pero la NUEVA columna 7 heredaria el row-level (probablemente distinto, ya que el row-level seria gris distinto). Resultado visual inconsistente. Mantener per-cell + agregar la 7ma celda manualmente es mas seguro.

### 3e. Plan 03: `isMixed: mixed` para SAFE path tambien, combinacion = ''

**Decision:** en el Excel orchestrator enrichment, ambas ordenes (safe y mixed) reciben `isMixed: boolean` (no `undefined`) — safe obtiene `isMixed: false, combinacion: ''`.

**Por que:** asi el generator Excel tiene un input uniforme — siempre hay `isMixed` boolean. Si fuera opcional + `undefined`, el generator tendria que hacer `order.isMixed === true` en vez de `order.isMixed`, agregando fragility.

### 3f. Plan 04: `productLabels: undefined` (NO `''`) para SAFE path en PDF

**Decision:** en el PDF orchestrator enrichment, `productLabels: mixed ? formatProductLabels(types) : undefined`.

**Por que diferente de Plan 03:** el generator PDF usa `if (order.isMixed && order.productLabels)` como **doble check** (defensive). `undefined` falla el check cleanly. Si fuera `''`, el check pasaria el boolean pero fallaria el string truthy — funciona identico, pero `undefined` hace el intent mas explicito.

### 3g. Plan 04: `boxH = 28`, `boxY + 9` para el texto

**Decision:** la caja es de 28pt de alto; el texto se renderiza en offset +9pt.

**Por que exacto esos valores:** el font es 11pt Helvetica-Bold. PDFKit renderiza el glyph desde la baseline; un offset de +9 deja ~8pt de padding arriba y ~8pt abajo (28 - 9 - 11 = 8). Visualmente centra el texto.

### 3h. Plan 04: `y += boxH + 6` para avanzar cursor

**Decision:** despues de la caja, el cursor avanza `boxH + 6`. El `+6` es padding entre la caja y el siguiente `drawSeparator`.

**Por que:** sin el `+6`, el separador quedaria pegado al borde inferior de la caja — visualmente apretado. 6pt es el espacio que otros separadores tienen en el layout actual (coherente con `y += 8` post-separador en otros puntos).

---

## 4. Cross-layer consistency: que funciono cross-plan

### Naming uppercase coherente

Los 4 planes usan identicos strings UPPERCASE:
- Type `'melatonina'` → `'ELIXIR'`
- Type `'ash'` → `'ASHWAGANDHA'`
- Type `'magnesio_forte'` → `'MAGNESIO FORTE'`
- `[]` → `'SIN CLASIFICAR'`

**Razon para UPPERCASE:** consistencia con otros strings del xlsx/PDF (ENVIAR A:, VALOR A COBRAR, etc.). El Kanban dots usan title-case (`'Ashwagandha'`) porque ahi hay mas texto a su alrededor y el visual weight diferente ayuda.

**Coexistencia intencional:** `PRODUCT_TYPE_COLORS.label` (title-case) se preservo intacto para el Kanban; `DISPLAY_LABELS` (UPPERCASE) es paralelo para las guias. Dos mapas, dos contextos, zero conflicto.

### Campos opcionales en DTOs para preservar step.run caching de Inngest

**Pattern:** los campos nuevos agregados a `NormalizedOrder`/`EnviaOrderData`/`OrderForDispatch` se agregan como **opcionales** (con `?`).

**Razon:** jobs encolados en Inngest al momento del deploy tienen el shape VIEJO cacheado por step.run. Si los nuevos campos fueran requeridos, los jobs encolados fallarian typecheck al consumerlos en el orchestrator. Con opcionales, el TypeScript tolera su ausencia y el generator downstream usa `undefined ?? default`.

### Event shape INTACTO en 3 eventos

Los 3 eventos Inngest involucrados (`robot/job.submitted`, `robot/excel-guide.submitted`, `robot/pdf-guide.submitted`) NO cambian de shape. El enrichment vive 100% dentro del `step.run` que re-fetchea el state desde DB — no viaja en el evento.

**Verificable:** `grep -A 3 "name: '<event>'" | grep -c "<nuevo_campo>"` debe ser 0 en los 3 casos.

---

## 5. Cosas que NO funcionaron / cosas que casi salen mal

### 5a. Plan 03 inicio con base de worktree equivocada

**Que paso:** el agente ejecutor de Plan 03 empezo en un worktree basado en commit `4db291b` cuando el prompt orchestrator requeria `f16c95b`. Tuvo que resetearse con `git reset --hard f16c95b`.

**Mitigacion:** el post-reset verifico con `git rev-parse HEAD` + `git merge-base HEAD f16c95b` que la cadena de commits compartia ancestro correcto. No hubo perdida de trabajo, pero aumento el riesgo de conflictos con otros worktrees paralelos.

**Aprendizaje:** los orchestradores multi-worktree DEBEN pasar el commit base explicitamente al ejecutor. El ejecutor debe verificar `git rev-parse HEAD == base` en el PRIMER step, antes de cualquier Edit.

### 5b. Noise en git status impidio scripts naive

**Que paso:** ~100 archivos pre-existentes en `git status` (drafts de planning, scripts, voice-app, docx). Cualquier `git add .` o `git add -A` hubiera metido basura.

**Mitigacion:** todos los 4 planes usaron `git add <path> [<path>...]` explicito. Ningun commit incluyo archivo unintended.

**Aprendizaje:** en repos con deuda de archivos untracked, `git add -A` es un footgun. Usar siempre paths explicitos.

### 5c. TypeScript strict + tipo inferido de `enriched`

**Que paso:** el PLAN de Plan 04 anticipo que TypeScript strict podria inferir `enriched` como `{ ..., isMixed: boolean, productLabels: string | undefined }[]` incompatible con `NormalizedOrder[]` (que espera `isMixed?: boolean` opcional).

**Resultado real:** TypeScript infirio cleanly. El Edit no requirio anotaciones de tipo explicitas. `npx tsc --noEmit` pasa sin errores nuevos.

**Aprendizaje:** el planner hizo bien en anticipar el riesgo con una mitigacion escrita (`as NormalizedOrder[]`), pero TypeScript resulto mas permisivo que el worst case. Escribir el fix anticipado en el plan es buena practica — cuesta 0 cuando no se usa, ahorra tiempo cuando si se necesita.

---

## 6. Metricas consolidadas de la fase

| Metric | Value |
| ------ | ----- |
| Total planes | 4 (Waves 1 + 2a + 2b + 3) |
| Duracion combinada (solo codigo) | ~55 min (20 + 9 + 9 + 15) |
| Commits feat atomicos | 8 (1 + 1 + 3 + 3) |
| Commits docs (SUMMARIES) | 3 + 1 pending |
| Archivos src modificados unicos | 7 (`product-types.ts`, `orders.ts` domain, `pdf/types.ts`, `comandos.ts`, `comandos-layout.tsx`, `command-output.tsx`, `generate-envia-excel.ts`, `generate-guide-pdf.ts`, `robot-orchestrator.ts`) — algunos touched por >1 plan |
| Archivos src NO modificados (scope discipline) | 3 clave (`normalize-order-data.ts`, `events.ts`, robot Railway) |
| Tests nuevos automatizados | 0 (stack sin framework activo) |
| Tests puros tsx runtime | 15 (plan 01, todos OK) |
| Schema migrations | 0 |
| npm packages nuevos | 0 |
| Errores tsc pre-existentes | 4 (todos vitest, out of scope) |
| Errores tsc nuevos introducidos | 0 |
| Push a origin/main | 4 (uno por plan) |
| Checkpoint humano pendiente | 1 (Task 4 del Plan 04, post-deploy QA) |

---

## 7. Recomendaciones para re-uso

### Para el proximo planner que toque los flujos logisticos

- **NO cambies event shape de `robot/*.submitted`.** Si necesitas un campo nuevo, derivarlo dentro del step.run desde el fetch step. Cambiar shape te obliga a bumpear version del evento + handler de compat + migrar jobs encolados.
- **Helpers puros en `src/lib/orders/`, no dispersos.** Si tu logica es cross-flow (Coord + Envia + Inter + Bogota), vivila ahi.
- **Widen SELECTs en `src/lib/domain/orders.ts` en lockstep con los 3 types DTO.** Si widening uno solo, el downstream rompe silenciosamente (tipo inferido vs tipo declarado).
- **ExcelJS:** preserva header per-cell, aplica row-level solo a data rows. ARGB 8 digitos siempre.
- **PDFKit:** `doc.save()/.restore()` alrededor de `rect().fillAndStroke(...)`. `fillColor` explicito antes de `.text(...)`. `fillColor('#000000')` reset DESPUES.

### Para el proximo agente ejecutor en este repo

- `git add .` / `-A` es FORBIDDEN — usa paths explicitos siempre.
- `npx tsc --noEmit` baseline = 4 errores vitest en `somnio/__tests__/*.test.ts`. Cualquier conteo `> 4` es regresion nueva.
- `npm run build` y `npm test` NO corren limpios por defecto en este repo (tests externos, build requiere env vars no disponibles). Usar tsc solo.
- Hook PreToolUse:Edit emite falso WARN post-Read — si ya leiste el archivo en la sesion, el edit aplica limpio aunque veas el warning.
- REGLA 1 de CLAUDE.md: PUSH a origin main despues de cada plan (no al final de la fase). No acumular commits unpushed.

### Para /gsd:plan-phase futuros

- Acceptance criteria basado en `grep -c` debe contar MENCIONES reales, no "bloques semanticos". Si quieres "1 bloque de enrichment", usa un grep mas especifico (`grep -c "const typesByOrderId = new Map"`).
- `grep -B N` subestima la distancia cuando hay bloques intermedios. Prefiere `grep -A N` con el anchor en la parte inicial del bloque, no al final.
- Anticipar `as TipoEsperado[]` como fallback defensivo en planes donde TypeScript strict podria complicarse NO es desperdicio. Cuesta 2 lineas en el plan; ahorra iteracion si aparece.

---

*Phase: standalone/crm-verificar-combinacion-productos*
*Learnings consolidated: 2026-04-17*
*Por: agente ejecutor de Plan 04 + consolidacion cross-plans 01/02/03*
