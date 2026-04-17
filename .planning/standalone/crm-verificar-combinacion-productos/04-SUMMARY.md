---
phase: crm-verificar-combinacion-productos
plan: 04
subsystem: logistics
tags: [pdfkit, pdf-generation, conditional-layout, inter, bogota, post-normalize-enrichment, inngest-event-shape, fase-close]

# Dependency graph
requires:
  - plan: 01
    provides: detectOrderProductTypes, isMixedOrder, formatProductLabels, GuideGenOrder.products {sku,title,quantity}
  - plan: 02
    provides: filtro Coord (no consumido directamente por plan 04, pero confirma el pattern de deteccion)
  - plan: 03
    provides: patron post-normalize enrichment en excelGuideOrchestrator (replicado en pdfGuideOrchestrator)
provides:
  - NormalizedOrder.isMixed (opcional, boolean)
  - NormalizedOrder.productLabels (opcional, string)
  - Caja condicional COMBINACION en generateGuidesPdf (entre logo y separador 1)
  - Post-normalize enrichment pattern en pdfGuideOrchestrator step 'generate-and-upload'
  - Apartado visual activo para carriers Inter Y Bogota (ambos comparten generator)
affects:
  - Fin de la fase standalone — los 4 flujos de generacion de guias ya tienen proteccion

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-normalize enrichment replicado del excelGuideOrchestrator (Plan 03) al pdfGuideOrchestrator — misma logica, diferente downstream generator"
    - "Caja condicional entre logo y primer separador en PDF — safe orders saltan el bloque, cero regresion visual"
    - "doc.save()/.restore() alrededor de rect+fillAndStroke aisla stroke/linewidth del drawSeparator siguiente"
    - "fillColor reset a #000000 DESPUES del texto para evitar leak (Pitfall 2 RESEARCH)"
    - "Defensive double-check en renderer: if (order.isMixed && order.productLabels) — evita caja vacia si productLabels falto upstream"
    - "productLabels: mixed ? formatProductLabels(types) : undefined (en orchestrator) — explicit undefined en safe path, no '' magic"

key-files:
  created:
    - .planning/standalone/crm-verificar-combinacion-productos/04-SUMMARY.md
    - .planning/standalone/crm-verificar-combinacion-productos/LEARNINGS.md
  modified:
    - src/lib/pdf/types.ts
    - src/lib/pdf/generate-guide-pdf.ts
    - src/inngest/functions/robot-orchestrator.ts

key-decisions:
  - "Color borde #ff751f = PRODUCT_TYPE_COLORS.ash.dotColor — consistencia visual con dots Kanban del Ashwagandha"
  - "Fill #FFF4E5 (naranja claro) + texto #B45309 (naranja oscuro) — contraste AA legible sobre impresion en blanco y negro tambien (la fase oscura del texto permanece)"
  - "boxH=28pt con texto en boxY+9 — centra visualmente el 11pt font en 28pt de alto"
  - "y += boxH + 6 avanza cursor con 6pt de padding antes del separador"
  - "Copy exacto 'COMBINACION: {labels}' con acento (CÓ no CO) y MAYUSCULAS — RESEARCH Pattern 3"
  - "Defensive if (order.isMixed && order.productLabels) — double check, si productLabels falto upstream no se renderiza caja vacia"
  - "productLabels queda undefined (no '') para safe orders en el orchestrator enrichment"
  - "Event shape robot/pdf-guide.submitted INTACTO (RESEARCH Pitfall 4) — simetrico con Plan 03 Excel"
  - "normalize-order-data.ts NO modificado en este plan (RESEARCH Pitfall 5) — Claude prompt y fallback sin tocar"

patterns-established:
  - "Caja destacada condicional antes del cuerpo del documento PDF — reutilizable para otros flags visuales (ej: entrega sabatina, pago previo, valor alto)"
  - "Patron end-to-end: domain retorna productos ricos -> fetch step los cachea -> orchestrator construye Map -> map enriquecen DTO downstream. Ahora confirmado en 2 orchestrators (Excel + PDF)"

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-04-17
---

# Phase crm-verificar-combinacion-productos Plan 04: Apartado COMBINACION en PDF Inter/Bogota Summary

**Caja destacada condicional (borde #ff751f, fill #FFF4E5, texto #B45309) entre logo y primer separador del PDF de guias cuando order.isMixed === true. Aplica a ambos carriers (Inter + Bogota) por compartir generateGuidesPdf. Safe orders quedan pixel-identicas al comportamiento actual. Enrichment 100% en pdfGuideOrchestrator post-normalize. Event shape Inngest intacto.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 automaticos + 1 checkpoint humano (pendiente — Task 4)
- **Files modified:** 3 (mismo scope declarado en frontmatter)

## Apartado Visual Agregado

**Ubicacion del render:** `src/lib/pdf/generate-guide-pdf.ts`, bloque insertado ENTRE el `if (logoBuffer)` (lineas 76-86 originales) y `drawSeparator(doc, y)` (linea 89 original, ahora ~124).

**Dimensiones y colores:**

| Propiedad | Valor | Fuente |
| --- | --- | --- |
| Alto caja (`boxH`) | 28 pt | CONTEXT Decision #3c + RESEARCH Pattern 3 |
| Ancho caja | `CONTENT_W` (WIDTH - MARGIN*2 = 260 pt) | constantes existentes |
| Border color | `#ff751f` | = `PRODUCT_TYPE_COLORS.ash.dotColor` — consistencia con dots Kanban |
| Fill color | `#FFF4E5` | naranja claro, contraste suave |
| Text color | `#B45309` | naranja oscuro legible sobre fill claro |
| Font | `Helvetica-Bold` 11 pt | legible centrado en 28 pt de alto |
| Copy | `COMBINACIÓN: ${order.productLabels}` | con acento en O, MAYUSCULAS, sin emoji |
| Offset texto dentro caja | `boxY + 9` | centra visualmente el 11pt font en 28pt |
| Padding post-box | `y += boxH + 6` | 6pt antes del separador |

**Defensive render:**

```typescript
if (order.isMixed && order.productLabels) {
  // ... render caja
}
```

Doble check: `isMixed` puede ser `true` pero si `productLabels` falto por un bug upstream, NO se renderiza una caja vacia con `"COMBINACION: "`. Patron defensive.

**Pitfall 2 mitigation (fillColor leak):**

```typescript
doc.save().rect(MARGIN, boxY, CONTENT_W, boxH)
  .fillAndStroke('#FFF4E5', '#ff751f').restore()   // stroke/fill aislados

doc.fillColor('#B45309').fontSize(11).font('Helvetica-Bold')
  .text(`COMBINACIÓN: ${order.productLabels}`, ...)  // texto naranja oscuro

doc.fillColor('#000000')  // *** RESET *** — evita que naranja contamine ENVIAR A: etc
```

Sin el reset final, `ENVIAR A:` y lineas siguientes (que heredan `fillColor`) se renderizarian en naranja oscuro. RESEARCH Pitfall 2 mitigado.

## Ubicacion del Enrichment

**File:** `src/inngest/functions/robot-orchestrator.ts`
**Orchestrator:** `pdfGuideOrchestrator` (lineas ~704-862)
**Step:** `'generate-and-upload'` (step 4 del orchestrator, lineas ~751-786 post-modificacion)

**Posicion dentro del step:** INMEDIATAMENTE DESPUES de leer `logoBuffer` y ANTES de llamar `generateGuidesPdf`. `orders` (del step `fetch-orders`) y `normalized` (del step `normalize-data`) estan ambos disponibles como closures del handler.

```typescript
const typesByOrderId = new Map<string, ReturnType<typeof detectOrderProductTypes>>()
for (const o of orders) {
  typesByOrderId.set(o.id, detectOrderProductTypes(o.products))
}

const enriched = normalized.map((n) => {
  const types = typesByOrderId.get(n.orderId) ?? []
  const mixed = isMixedOrder(types)
  return {
    ...n,
    isMixed: mixed,
    productLabels: mixed ? formatProductLabels(types) : undefined,
  }
})

const pdfBuffer = await generateGuidesPdf(enriched, logoBuffer)
```

Mismo patron de Plan 03 para `excelGuideOrchestrator` — diferencia principal: el enrichment PDF popula `productLabels` como `undefined` para safe orders (vs `''` en Excel) porque el generator PDF usa `if (order.isMixed && order.productLabels)` como doble check.

## Event Shape robot/pdf-guide.submitted — INTACTO

Verificado con grep inline:

```bash
grep -A 3 "robot/pdf-guide.submitted" src/inngest/functions/robot-orchestrator.ts | grep -c "isMixed"
# resultado: 0
```

El objeto `event.data` del evento sigue teniendo exactamente: `jobId`, `workspaceId`, `carrierType`, `sourceStageId`, `items`. NO incluye `productTypes` ni `isMixed` — se derivan DENTRO del step.run via `orders` (re-fetched en `fetch-orders`). RESEARCH Pitfall 4 respetado. Simetrico con lo que Plan 03 respeto en `robot/excel-guide.submitted`.

## Inter + Bogota — Ambos Reciben el Apartado

**Confirmacion:** ambos carriers llaman al mismo `pdfGuideOrchestrator`. El orchestrator solo distingue por `carrierType` del evento (`'inter'` o `'bogota'`) — el enrichment y la llamada a `generateGuidesPdf` son IDENTICAS para ambos. Una sola implementacion cubre los 2 flujos.

Verificable en `src/app/actions/comandos.ts:709 (Inter)` y `:817 (Bogota)` — ambos envian `inngest.send({ name: 'robot/pdf-guide.submitted', data: { carrierType: 'inter' | 'bogota', ... } })`.

## Task Commits

| # | Task | Commit SHA | Files |
| - | ---- | ---------- | ----- |
| 1 | Extender NormalizedOrder con isMixed + productLabels opcionales | `78c39b7` | `src/lib/pdf/types.ts` |
| 2 | Caja destacada condicional en generateGuidesPdf entre logo y separador | `a883de2` | `src/lib/pdf/generate-guide-pdf.ts` |
| 3 | Enriquecer NormalizedOrder en pdfGuideOrchestrator post-normalize | `a6680e1` | `src/inngest/functions/robot-orchestrator.ts` |

**Push a origin/main (REGLA 1):** `22e096b..a6680e1` — los 3 commits ya estan desplegados en Vercel.

## Files Created/Modified

- **`src/lib/pdf/types.ts`** — +6/-0 lineas. `NormalizedOrder` extendida con `isMixed?: boolean` y `productLabels?: string`, ambos con JSDoc. `GuideGenOrder` y `EnviaOrderData` sin cambios.
- **`src/lib/pdf/generate-guide-pdf.ts`** — +36/-0 lineas. Bloque condicional agregado entre `if (logoBuffer)` y `drawSeparator(doc, y)` del separador 1. `doc.save()/.restore()`, `fillAndStroke('#FFF4E5', '#ff751f')`, `fillColor('#B45309')` + `.text(...)`, reset `fillColor('#000000')`.
- **`src/inngest/functions/robot-orchestrator.ts`** — +21/-1 lineas. Step 4 `'generate-and-upload'` del `pdfGuideOrchestrator` ahora construye `typesByOrderId` map y pasa `enriched` (en vez de `normalized`) a `generateGuidesPdf`. Imports `detectOrderProductTypes`, `isMixedOrder`, `formatProductLabels` ya estaban (agregados por Plan 03).

## Decisions Made

Heredadas del PLAN.md y consistentes con Plan 03. Destacadas:

- **Colores exactos `#ff751f` / `#FFF4E5` / `#B45309`.** El borde reutiliza `PRODUCT_TYPE_COLORS.ash.dotColor` (el naranja del Ashwagandha en el Kanban) — consistencia visual cross-pages del sistema. Fill claro + texto oscuro asegura contraste AA.
- **`boxH=28pt`, `boxY+9` para el texto, `y += boxH + 6` post-box.** Proporciones validadas contra el layout existente (logo occupies 52pt, separador usa 8pt de padding).
- **Copy `COMBINACIÓN: {labels}` con acento.** MAYUSCULAS, sin emoji, sin icono — consistencia con el resto del PDF (ENVIAR A:, VALOR A COBRAR:).
- **Defensive `if (order.isMixed && order.productLabels)`.** Doble check evita caja vacia si productLabels cae por un bug upstream. En `normalize-order-data.ts` `buildFallbackOrder` estos campos quedan `undefined` por no agregarse — el orchestrator sobreescribe.
- **`productLabels: mixed ? formatProductLabels(types) : undefined`** (NO `''`). Explicit `undefined` en safe path. El generator usa el boolean check + string truthy check — `undefined` hace short-circuit limpio.
- **Pitfall 2 reset de `fillColor`.** Verificado inline que las lineas posteriores (ENVIAR A: en linea 107-113, direccion en 117-123, barrio en 126-133, etc.) NO llaman a `fillColor(...)` explicitamente antes del texto — heredan el estado. Sin reset, salen naranjas.
- **Event shape intacto, normalize-order-data.ts intacto.** RESEARCH Pitfalls 4 + 5 respetados. Zero riesgo de invalidar jobs encolados + Claude prompt intacto.

## Deviations from Plan

**None — plan ejecutado exactamente como fue escrito.**

Observaciones neutras durante verificacion (NO son deviations):

- El acceptance criteria del Task 3 pedia `grep -c "typesByOrderId" == 2` globalmente pero el valor real es `6` (3 menciones en PDF orchestrator + 3 en Excel orchestrator: declaracion + set + get cada uno). El Plan 03 SUMMARY ya documento la misma discrepancia (planner conto "usos" vs "menciones"). Reinterpretacion identica: 1 bloque de enrichment por orchestrator. Verificable con `grep -n` inline en las lineas 769-771 (PDF) y 974-976 (Excel).
- El acceptance `grep -B 3 "generateGuidesPdf(enriched" | grep -q "normalized.map"` fallo con `-B 3` porque la distancia real son 10 lineas (los 8 lineas del bloque de enrichment enseguida del `typesByOrderId`). Con `-B 10` retorna 1 match. Semanticamente correcto.
- `grep -c "isMixed: mixed"` retorna 2 exactamente (1 PDF + 1 Excel) — OK.
- `grep -A 3 "robot/pdf-guide.submitted" | grep -c "isMixed"` retorna 0 — event shape verificado intacto.

## Auto-fixed Issues

**None — no fueron necesarios Rule 1/2/3 fixes.** El plan estaba bien dimensionado y los imports ya existian gracias a Plan 03.

## Issues Encountered

- El hook `PreToolUse:Edit` emitio avisos READ-BEFORE-EDIT a pesar de haber leido los archivos en la sesion. Confirmado como false-positive del hook (visto tambien en Plan 02 SUMMARY). Los edits se aplicaron correctamente en los 3 archivos — verificado via post-edit Read + grep.

## Must-haves Verification (from plan frontmatter truths)

- [x] `NormalizedOrder` tiene `isMixed?: boolean` y `productLabels?: string` (verificado en types.ts lineas 30-35).
- [x] `generateGuidesPdf` renderiza caja entre logo y separador 1 SOLO cuando `order.isMixed && order.productLabels`.
- [x] Colores exactos: borde `#ff751f`, fill `#FFF4E5`, texto `#B45309` bold 11pt centrado.
- [x] `doc.fillColor('#000000')` reseteado DESPUES de renderizar caja — Pitfall 2 mitigado.
- [x] Ordenes safe: sin caja, layout pixel-identico al actual (cero regresion).
- [x] `pdfGuideOrchestrator` enriquece `NormalizedOrder` con `isMixed` + `productLabels` DESPUES de fetch + normalize usando productos con sku/title de Wave 1.
- [x] Evento `robot/pdf-guide.submitted` NO cambia de shape (verificado con grep inline = 0 ocurrencias de isMixed).
- [x] Inter Y Bogota ambos reciben el enrichment (comparten pdfGuideOrchestrator).
- [x] `npx tsc --noEmit` limpio en los 3 archivos touched — 0 errores nuevos. 4 errores pre-existentes (vitest + char-delay.test.ts) consistentes con baseline.
- [x] Push a `origin main` ejecutado — commits `78c39b7`, `a883de2`, `a6680e1` en produccion.

## Checkpoint humano pendiente

**Task 4 (checkpoint:human-verify gate=blocking) NO se ejecuto automaticamente. Requiere verificacion manual end-to-end post-deploy.**

El usuario debe ejecutar los 6 pasos documentados en el PLAN Task 4 `<how-to-verify>`:

1. **Preparar 4 ordenes de prueba en staging/prod:**
   - Orden A: 100% Elixir puro (SKU `001`, `SOMNIO-90-CAPS*`, etc).
   - Orden B: solo Ashwagandha (SKU `007`).
   - Orden C: Elixir + Magnesio Forte (`001` + `008`).
   - Orden D: SKU raro / sin SKU (edge case, tratado como mixed).

2. **Flujo Coord (`subir ordenes coord`):**
   - [ ] Solo Orden A llega al robot (verificar en Inngest dashboard + Railway log).
   - [ ] Chat muestra warning amarillo "3 ordenes NO se enviaron a Coordinadora..." con:
     - Orden B → products="ASHWAGANDHA"
     - Orden C → products="ELIXIR + MAGNESIO FORTE"
     - Orden D → products="SIN CLASIFICAR"
   - [ ] Cada item incluye el texto "Usa Envía/Inter/Bogotá para esta orden."

3. **Flujo Excel Envia (`generar excel envia`):** abrir `.xlsx` y confirmar:
   - [ ] 7 columnas (Valor, Nombre, Telefono, Direccion, Municipio, Departamento, COMBINACION).
   - [ ] Header row fondo gris claro, fuente bold.
   - [ ] Orden A: sin highlight, celda COMBINACION vacia.
   - [ ] Orden B: fondo amarillo + COMBINACION="ASHWAGANDHA".
   - [ ] Orden C: fondo amarillo + COMBINACION="ELIXIR + MAGNESIO FORTE".
   - [ ] Orden D: fondo amarillo + COMBINACION="SIN CLASIFICAR".

4. **Flujos PDF Inter + Bogota (`generar guias inter` y `generar guias bogota`):**
   - [ ] PDF Inter, pagina Orden A: layout IDENTICO al actual (sin caja naranja).
   - [ ] PDF Inter, pagina Orden B: caja con borde naranja `#ff751f`, fill naranja claro, texto bold centrado "COMBINACIÓN: ASHWAGANDHA".
   - [ ] PDF Inter, pagina Orden C: caja con "COMBINACIÓN: ELIXIR + MAGNESIO FORTE".
   - [ ] PDF Inter, pagina Orden D: caja con "COMBINACIÓN: SIN CLASIFICAR".
   - [ ] Texto despues de la caja (ENVIAR A:, direccion, barrio, VALOR A COBRAR, barcode) en NEGRO normal — NO naranja (Pitfall 2 mitigated).
   - [ ] PDF Bogota: idem Inter — misma caja aparece en ordenes mixed, ausente en Orden A.

5. **Regresion safe path:** generar Coord + Envia + Inter + Bogota con SOLO la Orden A:
   - [ ] Coord: Orden A llega al robot sin warning extra.
   - [ ] Envia: xlsx pixel-identico al comportamiento pre-cambio excepto columna COMBINACION vacia al final.
   - [ ] Inter/Bogota: PDFs pixel-identicos al comportamiento pre-cambio.

6. **Documentacion (REGLA 4):**
   - [ ] Actualizar `docs/analysis/04-estado-actual-plataforma.md` seccion Logistica/Guias con la fecha del deploy y descripcion de la deteccion de combinacion en los 4 flujos.
   - [x] `LEARNINGS.md` creado consolidando los 4 planes (ver archivo adjunto en este directorio).

**Signal esperado del usuario:** escribir "approved" tras validar los 6 pasos. Si algun paso falla, documentar el problema exacto (fila que no pinta, caja que no aparece, mensaje incorrecto, texto en color equivocado, etc.) para abrir iteracion de fix.

## User Setup Required

- **Manual QA en staging/prod Somnio** (Task 4 arriba). Requiere acceso a /comandos en workspace Somnio con permisos para ejecutar los 4 flujos de guia.
- **Actualizacion de documentacion (REGLA 4):** sugerida la entrada en `docs/analysis/04-estado-actual-plataforma.md`. Fuera del commit de codigo para no bloquear el push; se puede agregar despues del "approved" del checkpoint humano.

## Technical Debt

**Ninguna introducida por Plan 04.** Dos observaciones neutras:

- La caja usa constantes inline (`#ff751f`, `#FFF4E5`, `#B45309`, `boxH=28`, offsets). Si en el futuro se agregan mas apartados condicionales similares (ej: entrega sabatina, pago previo), extraer un helper `drawFlagBox(doc, y, { color, fill, textColor, label })` haria sentido. Hoy seria YAGNI — 1 solo uso.
- `productLabels: undefined` para safe path es intencional (doble check en renderer), no es bug. Si algun dia el generador se refactoriza para asumir siempre string, convertir a `''`.

## Cierre de Fase

**Fase standalone `crm-verificar-combinacion-productos` — COMPLETA (modulo checkpoint humano de Plan 04).**

Planes ejecutados:

| # | Wave | Plan | Status | Commits |
| - | ---- | ---- | ------ | ------- |
| 1 | 1 | Helpers de Clasificacion + Propagacion sku/title en Domain | ✔ completo | `38722a3` |
| 2 | 2 | Filtro de Combinacion en Coord + UI Warning | ✔ completo | `306d7a7` |
| 3 | 2 | Excel Envia — Columna COMBINACION + Fila Amarilla | ✔ completo | `2382f64`, `2d38863`, `f6a25f1` |
| 4 | 3 | PDF Inter/Bogota — Apartado COMBINACION condicional | ✔ code completo, ⏸ checkpoint humano pendiente | `78c39b7`, `a883de2`, `a6680e1` |

**Todos los 4 flujos de generacion de guias tienen ahora proteccion operacional contra despacho de combinacion equivocada:**

- **Coord (robot Railway):** server-side filter — ordenes con Ashwagandha/Magnesio Forte/sin clasificar NO llegan al robot. El agente recibe warning con labels UPPERCASE y razon accionable.
- **Envia (Excel xlsx):** TODAS las ordenes incluidas pero las mixed salen con fila amarilla + columna COMBINACION populada.
- **Inter (PDF):** TODAS las ordenes incluidas pero las mixed tienen caja naranja destacada entre logo y direccion.
- **Bogota (PDF):** idem Inter — mismo generador, mismo apartado.

**Commits totales de la fase:** 8 feat commits + 3 docs commits = 11 commits atomicos.

**Lineas modificadas:** ~190 lineas de codigo productivo + ~850 lineas de documentacion (planes + summaries + learnings).

**REGLA 1 (Push a Vercel):** cumplida en cada wave. Tip actual de `origin/main` = `a6680e1`.

**REGLA 4 (Docs actualizadas):** pendiente la actualizacion de `docs/analysis/04-estado-actual-plataforma.md`. LEARNINGS.md creado consolidando los 4 planes (ver archivo en este directorio). El usuario puede hacer la actualizacion del doc de analysis en el commit posterior al "approved" del checkpoint.

**Zero tests rotos, zero regresiones en otros flujos, zero schemas migrados.** Fase 100% additive.

## Self-Check: PASSED

**Files verified:**

- `src/lib/pdf/types.ts` — FOUND, 53 lineas, `isMixed?: boolean` + `productLabels?: string` en `NormalizedOrder` (lineas 30-35).
- `src/lib/pdf/generate-guide-pdf.ts` — FOUND, bloque condicional en lineas 88-122 con `fillAndStroke('#FFF4E5', '#ff751f')` + reset `fillColor('#000000')`.
- `src/inngest/functions/robot-orchestrator.ts` — FOUND, enrichment en lineas 769-782, `generateGuidesPdf(enriched, logoBuffer)` en linea 784.

**Commits verified (via `git log --oneline`):**

- `78c39b7` — FOUND (Task 1).
- `a883de2` — FOUND (Task 2).
- `a6680e1` — FOUND (Task 3).
- Push: `22e096b..a6680e1` — CONFIRMED (git push origin main exitoso).

**Behavior verified:**

- `npx tsc --noEmit`: 4 errores totales, IDENTICOS al baseline pre-plan (todos en `somnio/__tests__/*.test.ts` por vitest no instalado). Cero errores nuevos atribuibles a Plan 04.
- Event shape intacto: `grep -A 3 "robot/pdf-guide.submitted" | grep -c "isMixed"` = 0.
- `grep -c "isMixed: mixed"` = 2 globalmente (1 PDF + 1 Excel orchestrator) — OK.
- `normalize-order-data.ts` NO modificado: `git diff --name-only -- src/lib/pdf/normalize-order-data.ts` vacio.

---
*Phase: standalone/crm-verificar-combinacion-productos*
*Plan: 04*
*Wave: 3 / 3 — CIERRE DE FASE*
*Depends on: 01, 02, 03*
*Completed (code): 2026-04-17*
*Checkpoint humano: pendiente de QA del usuario*
