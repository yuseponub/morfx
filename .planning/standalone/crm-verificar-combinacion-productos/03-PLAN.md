---
phase: crm-verificar-combinacion-productos
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/pdf/types.ts
  - src/lib/pdf/generate-envia-excel.ts
  - src/inngest/functions/robot-orchestrator.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "`EnviaOrderData` tiene 2 campos opcionales nuevos: `isMixed?: boolean` y `combinacion?: string`"
    - "`generateEnviaExcel` agrega una columna `COMBINACION` al FINAL (despues de `Departamento`), preservando el prefijo portal-import"
    - "Las filas de ordenes flag (`isMixed === true`) tienen fondo amarillo `ARGB FFFFF59D` via `sheet.getRow(idx).fill = ...` (8 digitos, RESEARCH Pitfall 3)"
    - "El header row mantiene estilo per-cell existente — NO se sobrescribe con row-level fill (RESEARCH Pitfall 6)"
    - "Las filas safe (Elixir puro) no tienen fill adicional y la celda `combinacion` queda vacia — cero regresion visual"
    - "El orchestrator Excel (`robot-orchestrator.ts` ~linea 876-966) enriquece `EnviaOrderData` con `isMixed` y `combinacion` DESPUES del fetch + normalize, usando los productos ya cargados con sku/title de Wave 1"
    - "El evento `robot/excel-guide.submitted` NO cambia de shape — `productTypes` se derivan dentro del step.run del orchestrator (RESEARCH Pitfall 4)"
    - "El normalizer Claude no sabe de `isMixed` — es enrichment post-normalize (RESEARCH Pitfall 5)"
  artifacts:
    - path: "src/lib/pdf/types.ts"
      provides: "EnviaOrderData con isMixed + combinacion opcionales"
      contains: "isMixed?: boolean"
    - path: "src/lib/pdf/generate-envia-excel.ts"
      provides: "Columna COMBINACION al final + row.fill amarillo para ordenes mixed"
      contains: "COMBINACION"
    - path: "src/inngest/functions/robot-orchestrator.ts"
      provides: "Enriquecimiento post-normalize del EnviaOrderData con productTypes y isMixed"
      contains: "detectOrderProductTypes"
  key_links:
    - from: "getOrdersForGuideGeneration (Wave 1)"
      to: "excel orchestrator step.run 'generate-and-upload'"
      via: "productos ya tienen sku+title -> detectOrderProductTypes funciona -> enrich EnviaOrderData"
      pattern: "detectOrderProductTypes"
    - from: "EnviaOrderData.isMixed"
      to: "sheet.getRow(idx).fill amarillo"
      via: "condicion en loop de addRow dentro de generateEnviaExcel"
      pattern: "FFFFF59D"
    - from: "EnviaOrderData.combinacion"
      to: "Columna COMBINACION"
      via: "sheet.columns tiene key='combinacion' y addRow lo popula"
      pattern: "combinacion"
---

<objective>
Agregar highlight visual amarillo a las filas de ordenes flag en el Excel Envia + nueva columna `COMBINACION` al final. TODAS las ordenes siguen yendo al Excel (no se filtran, a diferencia del flujo Coord) — solo se marcan visualmente para que el agente decida manualmente si separa esas ordenes.

Purpose: Permite al agente Envia detectar rapidamente las ordenes con productos que no son Elixir puro sin tener que inspeccionar manualmente cada linea. Preserva el formato portal-import de Envia (la columna extra va al final, el portal la ignora).

Output: 3 archivos modificados. `types.ts` agrega 2 campos opcionales a `EnviaOrderData`. `generate-envia-excel.ts` agrega columna + row fill. `robot-orchestrator.ts` (branch Excel) enriquece los datos post-normalize antes de llamar al generador. `normalize-order-data.ts` NO se modifica (se lee como referencia para confirmar que `normalizedToEnvia` sigue igual) — el enrichment vive 100% en el orchestrator (RESEARCH Pitfall 5). Event shape Inngest intacto.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-verificar-combinacion-productos/CONTEXT.md
@.planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md
@.planning/standalone/crm-verificar-combinacion-productos/01-PLAN.md
@CLAUDE.md
@src/lib/pdf/types.ts
@src/lib/pdf/generate-envia-excel.ts
@src/lib/pdf/normalize-order-data.ts

<interfaces>
<!-- Contratos consumidos (de Wave 1) y producidos por este plan. -->

```typescript
// CONSUMIDOS (Wave 1 ya los exporta):
import {
  detectOrderProductTypes,
  isMixedOrder,
  formatProductLabels,
} from '@/lib/orders/product-types'

// `OrderForGuideGen.products` ya viene con { sku, title, quantity }.

// PRODUCIDOS — EnviaOrderData extendido:
export interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
  isMixed?: boolean        // NUEVO — opcional; true = fila amarilla
  combinacion?: string     // NUEVO — opcional; labels UPPERCASE o '' si safe
}
```

Flujo de datos:
1. `getOrdersForGuideGeneration` retorna `OrderForGuideGen[]` con productos completos.
2. Orchestrator fetch step retorna esos `orders` (step return value).
3. Orchestrator normalize step (Claude AI) retorna `NormalizedOrder[]`.
4. Orchestrator generate-and-upload step:
   a. Convierte `normalized[]` -> `enviaData[]` via `normalizedToEnvia(n)`.
   b. **NUEVO:** por cada orden, mira `orders.find(o => o.id === n.orderId).products` y calcula `types = detectOrderProductTypes(products)`.
   c. Enriquece `enviaData[i]` con `isMixed: isMixedOrder(types)` y `combinacion: isMixedOrder(types) ? formatProductLabels(types) : ''`.
   d. Llama `generateEnviaExcel(enviaData)` que ya sabe pintar amarillo + columna.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extender EnviaOrderData con isMixed y combinacion opcionales</name>
  <files>src/lib/pdf/types.ts</files>

  <read_first>
    - src/lib/pdf/types.ts (archivo completo — solo ~40 lineas; `EnviaOrderData` en linea 33-40)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Anti-Patterns to Avoid" — `isMixed` debe ser OPCIONAL, no requerido, para no invalidar caches Inngest)
  </read_first>

  <action>
Modificar unicamente la interface `EnviaOrderData` en `src/lib/pdf/types.ts`. `GuideGenOrder` y `NormalizedOrder` NO se tocan aqui (GuideGenOrder ya se extendio en Wave 1, NormalizedOrder se toca en Plan 04/Wave 3).

Reemplazar el bloque:

```typescript
// ANTES:
/** Envia Excel row data */
export interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
}

// DESPUES:
/** Envia Excel row data */
export interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
  /** Opcional: true si la orden contiene productos que NO son Elixir puro.
   *  Usado por generateEnviaExcel para pintar la fila en amarillo. */
  isMixed?: boolean
  /** Opcional: labels UPPERCASE de los productos (ej "ELIXIR + ASHWAGANDHA")
   *  o string vacio si la orden es safe. Renderizado en la columna COMBINACION. */
  combinacion?: string
}
```

Puntos criticos:

1. **Campos OPCIONALES** (con `?`) — RESEARCH Anti-Pattern lo exige. Evita romper el caching de step.run de Inngest en jobs ya encolados y mantiene compat con call-sites que solo construyen el shape basico.

2. **No tocar `GuideGenOrder`** — ya se extendio en Wave 1.

3. **No tocar `NormalizedOrder`** — se toca en Plan 04 (Wave 3) para agregar `isMixed?` y `productLabels?` para los PDFs.

4. **Comentarios JSDoc explicitos** — para que el consumer entienda la intencion sin leer este plan.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "src/lib/pdf/types\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - `grep -q "isMixed?: boolean" src/lib/pdf/types.ts`
    - `grep -q "combinacion?: string" src/lib/pdf/types.ts`
    - `NormalizedOrder` sigue SIN cambios — no tiene `isMixed?`: `grep -A 15 "interface NormalizedOrder" src/lib/pdf/types.ts | grep -c "isMixed" | tr -d ' '` retorna `0`
    - `GuideGenOrder.products` sigue con el shape de Wave 1: `grep -q "products: Array<{ sku: string | null; title: string | null; quantity: number }>" src/lib/pdf/types.ts`
    - `npx tsc --noEmit` no reporta errores nuevos en types.ts.
  </acceptance_criteria>

  <done>
    - `EnviaOrderData` extendido con 2 campos opcionales.
    - `GuideGenOrder` y `NormalizedOrder` sin cambios.
    - `npx tsc --noEmit` limpio.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Agregar columna COMBINACION + row fill amarillo en generate-envia-excel.ts</name>
  <files>src/lib/pdf/generate-envia-excel.ts</files>

  <read_first>
    - src/lib/pdf/generate-envia-excel.ts (archivo completo — solo 56 lineas)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Architecture Patterns -> Pattern 2: Yellow row fill + new column in ExcelJS", "Common Pitfalls -> Pitfall 3: ExcelJS ARGB string format" y "Pitfall 6: Per-cell fill overrides row fill", "Open Questions #3: append column at end")
  </read_first>

  <action>
Reemplazar el contenido del archivo `src/lib/pdf/generate-envia-excel.ts`. El archivo queda:

```typescript
/**
 * Phase 28: Robot Creador de Guias PDF — ExcelJS Spreadsheet Generator
 *
 * Generates an .xlsx file with order data formatted for Envia carrier
 * bulk upload. Columns match the Envia portal import format:
 *   Valor, Nombre, Telefono, Direccion, Municipio, Departamento
 *
 * Extension (crm-verificar-combinacion-productos):
 *   Adds an informational column "COMBINACION" at the END (preserves
 *   portal-import prefix; portal ignores trailing column). Rows of orders
 *   that are NOT pure Elixir (e.g. contain Ashwagandha or Magnesio Forte)
 *   get a soft-yellow row fill so the agent can spot them and decide
 *   manually whether to process/split them.
 *
 * Returns a Buffer for serverless compatibility (no filesystem).
 */

import ExcelJS from 'exceljs'
import type { EnviaOrderData } from './types'

/** Soft yellow ARGB (8-digit, alpha+RGB — see RESEARCH Pitfall 3). */
const MIXED_ROW_FILL_ARGB = 'FFFFF59D'

/** Header light gray fill (existente antes de este plan). */
const HEADER_FILL_ARGB = 'FFE0E0E0'

/**
 * Generate an Envia-format Excel spreadsheet from order data.
 *
 * @param orders - Order data already converted to Envia format (via normalizedToEnvia)
 *                 Opcionalmente enriquecido con isMixed + combinacion por el orchestrator.
 * @returns Excel .xlsx file as a Buffer ready for Supabase Storage upload
 */
export async function generateEnviaExcel(
  orders: EnviaOrderData[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Envios Envia')

  // Define columns matching Envia portal import format.
  // NOTA: COMBINACION se agrega AL FINAL para preservar el prefijo portal-import
  // (el portal Envia ignora columnas extra al final). Ver RESEARCH Open Q #3.
  sheet.columns = [
    { header: 'Valor', key: 'valor', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Telefono', key: 'telefono', width: 15 },
    { header: 'Direccion', key: 'direccion', width: 40 },
    { header: 'Municipio', key: 'municipio', width: 20 },
    { header: 'Departamento', key: 'departamento', width: 18 },
    { header: 'COMBINACION', key: 'combinacion', width: 32 },
  ]

  // Style header row: bold font, light gray background.
  // IMPORTANTE (RESEARCH Pitfall 6): MANTENER el per-cell fill en el header.
  // NO cambiar a row-level `sheet.getRow(1).fill` porque el per-cell fill
  // ya existente ganaria contra el row-level y quedaria inconsistente.
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL_ARGB },
    }
  })

  // Add data rows.
  // Para cada orden, agrega la fila con la celda COMBINACION llena (si isMixed)
  // o vacia (si safe). Aplica row-level fill amarillo SOLO cuando isMixed es true.
  // El row-level fill propaga a las 7 celdas incluyendo COMBINACION (las celdas
  // nuevas no tienen per-cell fill, asi que el row-level gana — Pitfall 6).
  orders.forEach((order, idx) => {
    const rowIdx = idx + 2 // header es row 1
    const row = sheet.addRow({
      valor: order.valor,
      nombre: order.nombre,
      telefono: order.telefono,
      direccion: order.direccion,
      municipio: order.municipio,
      departamento: order.departamento,
      combinacion: order.isMixed ? (order.combinacion ?? '') : '',
    })

    if (order.isMixed) {
      // Row-level fill: propaga a las 7 celdas (ninguna tiene per-cell fill).
      // ARGB 8-digit (Pitfall 3). FFFFF59D = amarillo soft opaco.
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: MIXED_ROW_FILL_ARGB },
      }
    }

    // Sanity-check: variable rowIdx disponible para debug si algun dia se
    // necesita per-cell override. Hoy no se usa pero se mantiene la lectura
    // coherente del loop.
    void rowIdx
  })

  // Write to buffer (serverless-compatible, no filesystem)
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
```

Puntos criticos:

1. **Columna COMBINACION al FINAL** — RESEARCH Open Q #3. El portal Envia ignora columnas extras al final; si la hubieramos insertado en medio, el import-portal se rompe.

2. **ARGB 8 digitos obligatorio** (Pitfall 3). `FFFFF59D` = alpha FF + RGB FFF59D (amarillo suave opaco). NO usar `FFF59D` (6 digitos) — comportamiento inconsistente entre versiones de ExcelJS.

3. **Header row intacto** (Pitfall 6). El `headerRow.eachCell((cell) => { cell.fill = ... })` existente se mantiene. NO reemplazar con `headerRow.fill = ...` porque el per-cell ya existente ganaria contra el row-level y la nueva columna COMBINACION quedaria sin header fill.

4. **`combinacion: order.isMixed ? (order.combinacion ?? '') : ''`** — seguro ante casos donde el orchestrator olvide poblar `combinacion`. Nunca escribe `undefined` en la celda (ExcelJS renderiza `undefined` como string "undefined" que seria feo).

5. **Safe orders:** row.fill no se toca (no se aplica). La celda `combinacion` queda vacia (`''`). La fila se ve identica al comportamiento actual excepto por la columna extra al final — cero regresion perceptible para ordenes safe.

6. **Performance:** el `.forEach` itera O(n) sobre las ordenes, una vez. Sin fetch, sin query. Cero impacto en tiempo de generacion del Excel.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "generate-envia-excel\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Columna agregada: `grep -q "header: 'COMBINACION', key: 'combinacion'" src/lib/pdf/generate-envia-excel.ts`
    - Row fill amarillo: `grep -q "FFFFF59D" src/lib/pdf/generate-envia-excel.ts`
    - ARGB 8-digit verificado: el literal `FFFFF59D` tiene exactamente 8 caracteres hex (alpha FF + RGB FFF59D).
    - Header row intacto (per-cell fill): `grep -q "headerRow.eachCell" src/lib/pdf/generate-envia-excel.ts`
    - Header NO usa row-level fill: `grep -c "headerRow.fill = {" src/lib/pdf/generate-envia-excel.ts` retorna `0`
    - Row-level fill SOLO para data rows con isMixed: `grep -B 2 "row.fill = {" src/lib/pdf/generate-envia-excel.ts | grep -q "isMixed"`
    - Condicional safe para combinacion: `grep -q "order.isMixed ? (order.combinacion" src/lib/pdf/generate-envia-excel.ts`
    - `npx tsc --noEmit` pasa sin errores nuevos en este archivo.
  </acceptance_criteria>

  <done>
    - Columna COMBINACION agregada al final.
    - Row fill amarillo `FFFFF59D` aplicado SOLO a filas con `isMixed === true`.
    - Header row preservado con per-cell fill.
    - Cero regresion visual para ordenes safe (columna extra vacia + sin fill).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Enriquecer EnviaOrderData con isMixed + combinacion en el orchestrator (post-normalize)</name>
  <files>src/inngest/functions/robot-orchestrator.ts</files>

  <read_first>
    - src/inngest/functions/robot-orchestrator.ts lineas 860-970 (`excelGuideOrchestrator` completo — desde la declaracion hasta el fin del handler `({event, step}) => {...}`)
    - src/lib/pdf/normalize-order-data.ts lineas 258-272 (`normalizedToEnvia` existente — lo reutilizamos, **NO lo modificamos**. El enrichment vive 100% en el orchestrator per RESEARCH Pitfall 5.)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Common Pitfalls -> Pitfall 4: Event shape changes" y "Pitfall 5: Normalize step fallback loses productTypes" — post-normalize enrichment en orchestrator es el patron recomendado)
    - src/lib/orders/product-types.ts (confirmar exports de Wave 1)
  </read_first>

  <action>
Modificar el `excelGuideOrchestrator` en `src/inngest/functions/robot-orchestrator.ts`. 2 cambios:

**Cambio 1 — Agregar imports al tope del archivo.**

Localizar el bloque de imports de `@/lib/orders/...` si existe, o agregar el bloque limpio con el resto de imports:

```typescript
import {
  detectOrderProductTypes,
  isMixedOrder,
  formatProductLabels,
} from '@/lib/orders/product-types'
```

**Cambio 2 — Modificar el step `'generate-and-upload'` del `excelGuideOrchestrator`.**

Localizar el bloque (linea ~941-966 aproximadamente):

```typescript
    // Step 4: Generate Excel + upload to Storage (WITHIN SAME STEP to avoid Inngest 4MB limit)
    const downloadUrl = await step.run('generate-and-upload', async () => {
      // Convert NormalizedOrder[] to EnviaOrderData[] using helper
      const enviaData = normalized.map(normalizedToEnvia)

      const excelBuffer = await generateEnviaExcel(enviaData)
      // ... upload, return URL
    })
```

Reemplazar las lineas donde se construye `enviaData` para incluir el enrichment:

```typescript
    // Step 4: Generate Excel + upload to Storage (WITHIN SAME STEP to avoid Inngest 4MB limit)
    const downloadUrl = await step.run('generate-and-upload', async () => {
      // Build productTypes map by orderId using the already-fetched orders.
      // Los productos vienen con { sku, title, quantity } gracias a Wave 1.
      // Post-normalize enrichment es el patron correcto (RESEARCH Pitfall 5):
      // - Claude no sabe de isMixed; no necesita saber.
      // - Si normalize falla, el fallback construye NormalizedOrder -- productTypes
      //   se derivan de `orders` que es independiente del fallback.
      const typesByOrderId = new Map<string, ReturnType<typeof detectOrderProductTypes>>()
      for (const o of orders) {
        typesByOrderId.set(o.id, detectOrderProductTypes(o.products))
      }

      // Convert NormalizedOrder[] to EnviaOrderData[] using helper,
      // then enrich with isMixed + combinacion per order.
      const enviaData = normalized.map((n) => {
        const base = normalizedToEnvia(n)
        const types = typesByOrderId.get(n.orderId) ?? []
        const mixed = isMixedOrder(types)
        return {
          ...base,
          isMixed: mixed,
          combinacion: mixed ? formatProductLabels(types) : '',
        }
      })

      const excelBuffer = await generateEnviaExcel(enviaData)

      // ...continua identico: upload, return URL
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `guias-envia-${timestamp}.xlsx`
      const filePath = `guide-pdfs/${workspaceId}/${fileName}`

      const { error } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, excelBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: false,
        })

      if (error) throw new Error(`Storage upload failed: ${error.message}`)

      const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath)
      return data.publicUrl
    })
```

**IMPORTANTE:** El resto del handler (steps 1 mark-processing, 2 fetch-orders, 3 normalize-data, 5 update-items, 6 emit-triggers) NO se toca. Solo el step 4 se modifica.

Puntos criticos:

1. **Event shape intacto** (Pitfall 4): `robot/excel-guide.submitted` sigue teniendo el mismo `event.data`. Los `productTypes` se derivan DENTRO del step — no viajan en el evento.

2. **Post-normalize enrichment** (Pitfall 5): el enrichment ocurre DESPUES de que `normalize-data` step retorno `normalized`. Si el normalize fallo y `buildFallbackOrder` fue usado, el orderId sigue siendo valido y `typesByOrderId.get(n.orderId)` funciona igual. Safety garantizada.

3. **Products vienen de `orders`, no de `normalized`**: Claude no recibe/retorna `productTypes` — viajan directo de domain a enrichment. Cero cambios al prompt.

4. **Map pre-computado:** `typesByOrderId` se construye UNA vez fuera del `.map(normalized)`, evitando O(n*m) lookup. Barato pero correcto.

5. **Default `[]`:** si por alguna razon un `n.orderId` no esta en `orders` (edge case imposible pero defensivo), `types = []` -> `isMixedOrder([]) = true` -> la orden se marca como mixed. Falla segura (errar a marcar, no a ocultar).

6. **NO tocar `pdfGuideOrchestrator`** (linea ~703) — ese se trata en Plan 04 (Wave 3).

7. **NO tocar el step 'normalize-data'** — Claude prompt queda igual. RESEARCH Pitfall 5 lo indica explicitamente.

8. **`normalize-order-data.ts` NO se modifica en este plan.** Se lee como referencia (ver `<read_first>`) para confirmar que `normalizedToEnvia` sigue siendo usado tal cual. Por eso NO aparece en `files_modified` del frontmatter.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -vE "^\s*$" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Imports agregados: `grep -q "from '@/lib/orders/product-types'" src/inngest/functions/robot-orchestrator.ts` y `grep -q "isMixedOrder" src/inngest/functions/robot-orchestrator.ts` y `grep -q "formatProductLabels" src/inngest/functions/robot-orchestrator.ts`
    - Map pre-computado presente: `grep -q "typesByOrderId" src/inngest/functions/robot-orchestrator.ts`
    - **Este plan contribuye EXACTAMENTE 1 ocurrencia de `typesByOrderId`** (en el excel orchestrator). Plan 04 (Wave 3) agrega otra en el PDF orchestrator.
      - Verificacion scope-limited a este plan (Excel orchestrator):
        ```bash
        # Scope al bloque del excel orchestrator: busca desde "excel-guide.submitted" hasta el siguiente orchestrator.
        grep -A 200 "excel-guide.submitted" src/inngest/functions/robot-orchestrator.ts | sed -n '1,/pdf-guide.submitted\|excelGuideOrchestrator ended/p' | grep -c "typesByOrderId"
        ```
        Alternativa mas simple (post-plan-03 pre-plan-04 el conteo GLOBAL debe ser `1`):
        ```bash
        grep -c "typesByOrderId" src/inngest/functions/robot-orchestrator.ts
        ```
        Tras completar SOLO este plan 03 (antes de plan 04), el conteo global debe ser `1`. Plan 04 lo lleva a `2`.
    - Enrichment aplicado: `grep -q "isMixed: mixed" src/inngest/functions/robot-orchestrator.ts` y `grep -q "combinacion: mixed ? formatProductLabels" src/inngest/functions/robot-orchestrator.ts`
    - Event shape intacto — el bloque `event.data` del excel orchestrator no menciona productTypes: `grep -A 3 "robot/excel-guide.submitted" src/inngest/functions/robot-orchestrator.ts | grep -c "productTypes"` retorna `0`
    - `pdfGuideOrchestrator` NO tocado en este plan — solo 2 imports y el step de Excel. Verificar con diff que el diff cae SOLO en el excel orchestrator y en el import block.
    - `normalize-order-data.ts` NO modificado en este plan: `git diff --name-only -- src/lib/pdf/normalize-order-data.ts` debe estar vacio.
    - `npx tsc --noEmit` pasa limpio (exit 0).
  </acceptance_criteria>

  <done>
    - Imports agregados.
    - Step `'generate-and-upload'` del excel orchestrator enriquece `enviaData` con `isMixed` + `combinacion`.
    - Event shape `robot/excel-guide.submitted` intacto.
    - Claude prompt intacto.
    - Fallback path (buildFallbackOrder) sigue funcionando — productTypes se derivan de `orders`, independiente de `normalized`.
    - `normalize-order-data.ts` NO se modifico (solo leido como referencia).
    - Commit atomico final: `feat(crm-verificar-combinacion-productos): columna COMBINACION + fila amarilla en Excel Envia`.
    - Push a Vercel (REGLA 1): `git add src/lib/pdf/types.ts src/lib/pdf/generate-envia-excel.ts src/inngest/functions/robot-orchestrator.ts && git commit -m "..." && git push origin main`.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` pasa sin errores (exit 0).
- El evento `robot/excel-guide.submitted` NO cambio — grepear el objeto `data:` del `inngest.send` en `comandos.ts:925+` y confirmar shape identico al actual.
- Verificacion manual post-deploy:
  - Ejecutar `generar excel envia` con 3 ordenes: 1 Elixir pura, 1 solo Ashwagandha, 1 Elixir + Magnesio Forte.
  - Abrir el .xlsx descargado en LibreOffice / Excel.
  - Confirmar:
    - Row 1 (header): sigue con fondo gris claro, fuente bold, 7 columnas incluyendo COMBINACION.
    - Fila de Elixir puro: sin highlight, celda COMBINACION vacia.
    - Fila de Ashwagandha: fondo amarillo, celda COMBINACION = "ASHWAGANDHA".
    - Fila de Elixir + Magnesio Forte: fondo amarillo, celda COMBINACION = "ELIXIR + MAGNESIO FORTE".
  - Importar el .xlsx al portal Envia (si posible en staging) — el portal debe ignorar la columna COMBINACION y procesar las 6 columnas originales sin error.
- Safe path: todas las ordenes Elixir puro -> xlsx identico al actual excepto por 1 columna vacia extra al final.
</verification>

<success_criteria>
- Excel Envia tiene 7 columnas: Valor, Nombre, Telefono, Direccion, Municipio, Departamento, COMBINACION.
- Ordenes flag tienen fila amarilla `#FFF59D` + celda COMBINACION poblada con labels UPPERCASE.
- Ordenes safe tienen fila sin highlight + celda COMBINACION vacia.
- Portal-import prefix preservado (COMBINACION al final).
- Event shape `robot/excel-guide.submitted` intacto (RESEARCH Pitfall 4).
- Claude prompt de normalize NO tocado (RESEARCH Pitfall 5).
- `npx tsc --noEmit` global limpio.
- Push a `origin main` realizado (REGLA 1).
- Plan 04 (Wave 3) puede arrancar — este plan deja el orchestrator + types.ts + generate-envia-excel.ts listos sin conflicto con los archivos que Plan 04 necesita (Plan 04 toca generate-guide-pdf.ts + types.ts NormalizedOrder + el branch PDF del orchestrator).

**ATENCION:** Plan 04 tambien toca `src/lib/pdf/types.ts` y `src/inngest/functions/robot-orchestrator.ts`. Eso crea shared-file implicit dep. Plan 04 debe correr en Wave 3 (despues de 02 y 03), NO en paralelo.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-verificar-combinacion-productos/03-SUMMARY.md` con:
- Resumen de la columna nueva + highlight row.
- ARGB utilizado (`FFFFF59D`) + nota sobre el 8-digit requirement.
- Ubicacion del enrichment (step 'generate-and-upload' del excel orchestrator).
- Confirmacion de que el event shape Inngest esta intacto.
- Commit SHA del push a main.
- Deuda tecnica: ninguna esperada.
- Nota para Plan 04 (Wave 3): `NormalizedOrder` aun NO tiene `isMixed/productLabels` — Plan 04 los agrega. Event shape `robot/pdf-guide.submitted` tambien debe mantenerse intacto.
</output>
</output>
