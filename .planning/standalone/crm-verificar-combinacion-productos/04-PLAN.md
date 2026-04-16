---
phase: crm-verificar-combinacion-productos
plan: 04
type: execute
wave: 3
depends_on: ["01", "02", "03"]
files_modified:
  - src/lib/pdf/types.ts
  - src/lib/pdf/generate-guide-pdf.ts
  - src/inngest/functions/robot-orchestrator.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "`NormalizedOrder` tiene 2 campos opcionales nuevos: `isMixed?: boolean` y `productLabels?: string`"
    - "`generateGuidesPdf` renderiza una caja destacada (rect + text) ENTRE el logo y el primer `drawSeparator` SOLO cuando `order.isMixed === true`"
    - "La caja usa borde `#ff751f` (naranja Ashwagandha), fill `#FFF4E5`, texto `#B45309` bold 11pt centrado con copy `COMBINACIÓN: {labels}`"
    - "`doc.fillColor('#000000')` se resetea DESPUES de renderizar la caja (RESEARCH Pitfall 2 — fillAndStroke deja el fillColor en el color del box y text subsequente saldria invisible)"
    - "Ordenes safe (Elixir puro) NO ven la caja — el PDF queda pixel-identico al comportamiento actual"
    - "El orchestrator PDF (`robot-orchestrator.ts` ~linea 704-857) enriquece `NormalizedOrder` con `isMixed` y `productLabels` DESPUES de fetch + normalize, usando los productos ya cargados con sku/title de Wave 1"
    - "El evento `robot/pdf-guide.submitted` NO cambia de shape (RESEARCH Pitfall 4)"
    - "Ambos carrier types (`inter` y `bogota`) reciben el mismo enrichment — comparten el `pdfGuideOrchestrator`"
  artifacts:
    - path: "src/lib/pdf/types.ts"
      provides: "NormalizedOrder con isMixed + productLabels opcionales"
      contains: "isMixed?: boolean"
    - path: "src/lib/pdf/generate-guide-pdf.ts"
      provides: "Apartado visual condicional entre logo y separador"
      contains: "order.isMixed"
    - path: "src/inngest/functions/robot-orchestrator.ts"
      provides: "Enriquecimiento post-normalize del NormalizedOrder con isMixed + productLabels en el PDF orchestrator"
      contains: "detectOrderProductTypes"
  key_links:
    - from: "getOrdersForGuideGeneration (Wave 1)"
      to: "pdf orchestrator step.run 'generate-and-upload'"
      via: "productos con sku+title -> detectOrderProductTypes -> enrich NormalizedOrder"
      pattern: "detectOrderProductTypes"
    - from: "NormalizedOrder.isMixed"
      to: "generateGuidesPdf conditional section"
      via: "if (order.isMixed && order.productLabels) -> draw rect + text"
      pattern: "order.isMixed"
    - from: "doc.rect(...).fillAndStroke('#FFF4E5', '#ff751f')"
      to: "doc.fillColor('#000000') reset"
      via: "Pitfall 2 mitigation — fillColor leak prevention"
      pattern: "fillColor\\('#000000'\\)"
---

<objective>
Agregar un apartado visual destacado entre el logo y el primer separador del PDF de guias (Inter + Bogota usan el mismo generador `generateGuidesPdf`) que se muestra SOLO cuando la orden contiene productos que NO son Elixir puro. Safe orders quedan pixel-identicas al comportamiento actual.

Purpose: El agente Inter/Bogota que imprime las guias ve inmediatamente cual guia corresponde a una orden con combinacion especial — evita error de despacho donde una guia Inter/Bogota se imprime para una orden que deberia ir por bodega diferente. El apartado actua como alerta fisica en el documento impreso.

Output: 3 archivos modificados. `types.ts` extiende `NormalizedOrder` con 2 opcionales. `generate-guide-pdf.ts` agrega la caja condicional. `robot-orchestrator.ts` enriquece `NormalizedOrder[]` post-normalize. `normalize-order-data.ts` NO se modifica (se lee como referencia para confirmar que `buildFallbackOrder` no necesita saber de `isMixed` — el enrichment vive 100% en el orchestrator per RESEARCH Pitfall 5). Event shape Inngest intacto.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-verificar-combinacion-productos/CONTEXT.md
@.planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md
@.planning/standalone/crm-verificar-combinacion-productos/01-PLAN.md
@.planning/standalone/crm-verificar-combinacion-productos/03-PLAN.md
@CLAUDE.md
@src/lib/pdf/types.ts
@src/lib/pdf/generate-guide-pdf.ts
@src/lib/pdf/normalize-order-data.ts

<interfaces>
<!-- Contratos consumidos (Waves 1 + 3) y producidos por este plan. -->

```typescript
// CONSUMIDOS:
import {
  detectOrderProductTypes,
  isMixedOrder,
  formatProductLabels,
} from '@/lib/orders/product-types'

// `OrderForGuideGen.products` con { sku, title, quantity } (Wave 1).

// PRODUCIDOS:
export interface NormalizedOrder {
  orderId: string
  numero: string
  nombre: string
  apellido: string
  direccion: string
  barrio: string
  ciudad: string
  telefono: string
  valorCobrar: string
  valorNumerico: number
  pagoAnticipado: boolean
  unidades: number
  isMixed?: boolean        // NUEVO — opcional
  productLabels?: string   // NUEVO — opcional (ej "ELIXIR + ASHWAGANDHA")
}
```

Flujo de datos (espejo del Plan 03 Excel):
1. `getOrdersForGuideGeneration` retorna `OrderForGuideGen[]` con productos completos (Wave 1).
2. Orchestrator step `fetch-orders` retorna `orders`.
3. Orchestrator step `normalize-data` retorna `normalized: NormalizedOrder[]` (Claude no sabe de isMixed).
4. Orchestrator step `generate-and-upload`:
   a. Build `typesByOrderId = Map<orderId, ProductType[]>` desde `orders`.
   b. Enrich `normalized.map(n => ({ ...n, isMixed, productLabels }))`.
   c. Llama `generateGuidesPdf(enriched, logoBuffer)` que renderiza la caja condicional.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extender NormalizedOrder con isMixed y productLabels opcionales</name>
  <files>src/lib/pdf/types.ts</files>

  <read_first>
    - src/lib/pdf/types.ts completo (NormalizedOrder en lineas 17-30)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Anti-Patterns to Avoid" — campos opcionales, no requeridos)
  </read_first>

  <action>
Modificar unicamente la interface `NormalizedOrder` en `src/lib/pdf/types.ts`. `GuideGenOrder` (ya de Wave 1) y `EnviaOrderData` (ya de Plan 03) NO se tocan.

Reemplazar el bloque:

```typescript
// ANTES:
/** Normalized order data (output of Claude AI) */
export interface NormalizedOrder {
  orderId: string       // Original order ID for mapping
  numero: string        // Shipping number (order name)
  nombre: string        // First name UPPERCASE
  apellido: string      // Last name UPPERCASE
  direccion: string     // Full address
  barrio: string        // Neighborhood
  ciudad: string        // "BUCARAMANGA (STDER)"
  telefono: string      // 10-digit phone
  valorCobrar: string   // "$77.900"
  valorNumerico: number // Raw numeric value for Excel
  pagoAnticipado: boolean
  unidades: number
}

// DESPUES:
/** Normalized order data (output of Claude AI) */
export interface NormalizedOrder {
  orderId: string       // Original order ID for mapping
  numero: string        // Shipping number (order name)
  nombre: string        // First name UPPERCASE
  apellido: string      // Last name UPPERCASE
  direccion: string     // Full address
  barrio: string        // Neighborhood
  ciudad: string        // "BUCARAMANGA (STDER)"
  telefono: string      // 10-digit phone
  valorCobrar: string   // "$77.900"
  valorNumerico: number // Raw numeric value for Excel
  pagoAnticipado: boolean
  unidades: number
  /** Opcional: true si la orden contiene productos que NO son Elixir puro.
   *  Se derivan en el orchestrator (post-normalize) — Claude no lo popula. */
  isMixed?: boolean
  /** Opcional: labels UPPERCASE (ej "ELIXIR + ASHWAGANDHA") para renderizar
   *  en la caja destacada del PDF cuando isMixed es true. */
  productLabels?: string
}
```

Puntos criticos:

1. **Campos OPCIONALES** (con `?`) — RESEARCH Anti-Pattern. Evita invalidar caches Inngest y mantiene compat con `buildFallbackOrder` que puede no poblarlos.

2. **Claude NO popula estos campos** — el prompt de `normalize-order-data.ts` sigue sin mencionarlos. Son post-normalize enrichment en el orchestrator.

3. **No tocar `EnviaOrderData` ni `GuideGenOrder`** — ya estan actualizados por Waves anteriores.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "src/lib/pdf/types\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - `grep -A 20 "interface NormalizedOrder" src/lib/pdf/types.ts | grep -q "isMixed?: boolean"`
    - `grep -A 20 "interface NormalizedOrder" src/lib/pdf/types.ts | grep -q "productLabels?: string"`
    - `EnviaOrderData` sigue con los opcionales de Plan 03: `grep -A 12 "interface EnviaOrderData" src/lib/pdf/types.ts | grep -q "isMixed?: boolean"` y `grep -A 12 "interface EnviaOrderData" src/lib/pdf/types.ts | grep -q "combinacion?: string"`
    - `GuideGenOrder.products` sigue con shape de Wave 1: `grep -q "products: Array<{ sku: string | null; title: string | null; quantity: number }>" src/lib/pdf/types.ts`
    - `npx tsc --noEmit` pasa sin errores nuevos.
  </acceptance_criteria>

  <done>
    - `NormalizedOrder` extendida con 2 opcionales.
    - Otras 2 interfaces sin cambios.
    - `npx tsc --noEmit` limpio.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Agregar caja destacada condicional en generate-guide-pdf.ts entre logo y primer separador</name>
  <files>src/lib/pdf/generate-guide-pdf.ts</files>

  <read_first>
    - src/lib/pdf/generate-guide-pdf.ts lineas 1-120 (hasta primer separador + inicio del bloque "ENVIAR A:" — entender la estructura del layout y las constantes MARGIN/WIDTH/CONTENT_W)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Architecture Patterns -> Pattern 3: Conditional section between logo and address in PDFKit", "Common Pitfalls -> Pitfall 2: PDFKit fill color state leak after fillAndStroke", "Code Examples -> Example 5: PDFKit existing logo+separator idiom")
    - src/lib/orders/product-types.ts (para confirmar PRODUCT_TYPE_COLORS.ash.dotColor = '#ff751f' — el naranja Ashwagandha que reutilizamos para el borde de la caja, consistencia con los dots del Kanban)
  </read_first>

  <action>
Modificar `src/lib/pdf/generate-guide-pdf.ts`. Insertar el bloque condicional entre el logo (lineas 76-86) y el primer `drawSeparator(doc, y)` (linea 89).

Localizar el bloque actual:

```typescript
    // --- Logo (centered) ---
    if (logoBuffer) {
      try {
        const logoW = 160
        const logoX = (WIDTH - logoW) / 2
        doc.image(logoBuffer, logoX, y, { width: logoW })
        y += 52
      } catch (logoErr) {
        console.warn('[pdf/generate] Failed to render logo, skipping:', logoErr)
        y += 10
      }
    }

    // --- Separator 1 ---
    drawSeparator(doc, y)
    y += 8
```

Insertar el bloque nuevo ENTRE el cierre del `if (logoBuffer)` y `// --- Separator 1 ---`:

```typescript
    // --- Logo (centered) ---
    if (logoBuffer) {
      try {
        const logoW = 160
        const logoX = (WIDTH - logoW) / 2
        doc.image(logoBuffer, logoX, y, { width: logoW })
        y += 52
      } catch (logoErr) {
        console.warn('[pdf/generate] Failed to render logo, skipping:', logoErr)
        y += 10
      }
    }

    // --- Combinacion de productos (condicional) ---
    // Se renderiza SOLO si la orden es mixed (contiene productos distintos a Elixir puro).
    // Safe orders (Elixir puro) saltan este bloque y el layout queda identico al actual.
    //
    // Colores:
    //   - Borde: #ff751f (mismo naranja de PRODUCT_TYPE_COLORS.ash.dotColor — consistencia con dots Kanban)
    //   - Fill: #FFF4E5 (naranja claro para contraste suave)
    //   - Texto: #B45309 (naranja oscuro legible sobre fill claro)
    //
    // PITFALL 2 (RESEARCH): fillAndStroke deja el fillColor interno en el color del box;
    // hay que llamar fillColor() ANTES del text() y resetear a '#000000' DESPUES para no
    // contaminar el render posterior (ENVIAR A:, direccion, etc.).
    if (order.isMixed && order.productLabels) {
      const boxH = 28
      const boxY = y
      doc
        .save()
        .rect(MARGIN, boxY, CONTENT_W, boxH)
        .fillAndStroke('#FFF4E5', '#ff751f')
        .restore()

      doc
        .fillColor('#B45309')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`COMBINACIÓN: ${order.productLabels}`, MARGIN, boxY + 9, {
          align: 'center',
          width: CONTENT_W,
        })

      // Reset state (Pitfall 2 — evita que el fillColor naranja contamine el resto del render)
      doc.fillColor('#000000')

      y += boxH + 6
    }

    // --- Separator 1 ---
    drawSeparator(doc, y)
    y += 8
```

Puntos criticos:

1. **`if (order.isMixed && order.productLabels)`** — doble check: `isMixed` puede ser true pero si `productLabels` falto por un bug upstream, no renderizamos una caja vacia con "COMBINACIÓN: " sin nada. Defensive.

2. **Pitfall 2 mitigation (CRITICO):** DESPUES de `fillAndStroke('#FFF4E5', '#ff751f')`, el estado interno de PDFKit tiene `fillColor = '#FFF4E5'` (el color del box). Si llamamos `doc.text(...)` sin un `fillColor` explicito, el texto sale del color del box (invisible). Por eso:
   - `doc.fillColor('#B45309')` antes de `.text(...)` — texto visible.
   - `doc.fillColor('#000000')` despues — restaura para el resto del documento (ENVIAR A:, direccion, etc. no renderizan en negro si no reseteamos).

3. **`doc.save() / .restore()` alrededor del rect+fillAndStroke** — aisla el `lineWidth`/`strokeColor` del `drawSeparator` siguiente. Sin el save/restore, el strokeColor naranja contaminaria el separator.

4. **Dimensiones:**
   - `boxH = 28` pt (alto de la caja).
   - `boxY + 9` = offset vertical del texto dentro de la caja (centra visualmente 11pt font en 28pt alto, dejando ~8pt arriba y ~9pt abajo).
   - `y += boxH + 6` = avanzar cursor para el siguiente separador, con 6pt de padding.

5. **`MARGIN` y `CONTENT_W` ya son constantes existentes del archivo** (linea 30-31). NO redefinir.

6. **`drawSeparator(doc, y)` llamada existente NO se toca.** El separator usa `strokeColor('#000000')` explicito (linea 41), asi que incluso si el reset fallara, el separator seguiria negro. Pero el reset es igual necesario porque el bloque de texto `ENVIO PRIORIDAD` (linea 92-100) usa `fillColor('#000000')` explicito que OK, pero `ENVIAR A:` (linea 107-113) NO llama a fillColor explicito — hereda del estado. De ahi el reset es obligatorio.

7. **Copy exacto:** `COMBINACIÓN: {productLabels}` con acento en la O, MAYUSCULAS, sin emoji/icono. El RESEARCH Pattern 3 propuso este texto, CONTEXT.md Decision #3c lo valida.

8. **Safe orders saltan el bloque entero** — no hay else, no se avanza `y` — el layout queda pixel-identico al actual. Cero regresion visual.

9. **Aplica a INTER y BOGOTA igual** — ambos carriers llaman a `generateGuidesPdf` (el orchestrator solo cambia el `carrierType` del evento; el generator PDF no distingue). Una sola implementacion cubre los 2 carriers.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "generate-guide-pdf\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Condicional agregado: `grep -q "if (order.isMixed && order.productLabels)" src/lib/pdf/generate-guide-pdf.ts`
    - Rect + fillAndStroke con colores exactos: `grep -q "fillAndStroke('#FFF4E5', '#ff751f')" src/lib/pdf/generate-guide-pdf.ts`
    - Text fillColor correcto: `grep -q "fillColor('#B45309')" src/lib/pdf/generate-guide-pdf.ts`
    - Reset fillColor a negro: `grep -q "fillColor('#000000')" src/lib/pdf/generate-guide-pdf.ts` (este grep tambien matchea linea 96 que ya usa fillColor negro — OK, solo importa que EXISTE al menos uno)
    - Copy exacto con acento: `grep -q "COMBINACIÓN: " src/lib/pdf/generate-guide-pdf.ts`
    - `doc.save()` y `.restore()` usados alrededor del rect: `grep -B 1 "rect(MARGIN, boxY" src/lib/pdf/generate-guide-pdf.ts | grep -q "\.save()"`
    - El bloque va ENTRE el logo block y el separator — verificable con grep context:
      ```bash
      grep -n "Combinacion de productos" src/lib/pdf/generate-guide-pdf.ts   # encuentra el comentario nuevo
      grep -n "Separator 1" src/lib/pdf/generate-guide-pdf.ts                  # encuentra el separator existente
      # El primer numero debe ser MENOR que el segundo
      ```
    - `npx tsc --noEmit` pasa sin errores nuevos.
  </acceptance_criteria>

  <done>
    - Caja condicional agregada entre logo y separator 1.
    - Colores: borde `#ff751f`, fill `#FFF4E5`, texto `#B45309`.
    - fillColor reseteado a `#000000` DESPUES del render.
    - save/restore aislan el stroke/linewidth.
    - Safe orders: sin caja, layout identico al actual.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Enriquecer NormalizedOrder con isMixed + productLabels en el PDF orchestrator</name>
  <files>src/inngest/functions/robot-orchestrator.ts</files>

  <read_first>
    - src/inngest/functions/robot-orchestrator.ts lineas 700-860 (`pdfGuideOrchestrator` completo — desde la declaracion de `{ event: 'robot/pdf-guide.submitted' as any }` hasta el final del handler)
    - src/inngest/functions/robot-orchestrator.ts (revisar que los imports ya traen `detectOrderProductTypes`, `isMixedOrder`, `formatProductLabels` de Plan 03 — Task 3)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (Pitfalls 4 + 5 nuevamente — post-normalize enrichment, event shape intacto)
  </read_first>

  <action>
Modificar el `pdfGuideOrchestrator` en `src/inngest/functions/robot-orchestrator.ts`. 1 cambio principal.

**Imports:** YA agregados por Plan 03 Task 3 (`detectOrderProductTypes`, `isMixedOrder`, `formatProductLabels`). Si por alguna razon no estan, agregarlos ahora. Verificar con `grep -q "from '@/lib/orders/product-types'" src/inngest/functions/robot-orchestrator.ts`.

**Cambio principal — En el step `'generate-and-upload'` del `pdfGuideOrchestrator` (linea ~746-776).**

Localizar el bloque actual:

```typescript
    // Step 4: Generate PDF + upload to Storage (WITHIN SAME STEP to avoid Inngest 4MB limit)
    const downloadUrl = await step.run('generate-and-upload', async () => {
      // Read SOMNIO logo from public/somnio-logo.jpg with graceful fallback
      let logoBuffer: Buffer | undefined
      try {
        const fs = await import('fs')
        const path = await import('path')
        const logoPath = path.join(process.cwd(), 'public', 'somnio-logo.jpg')
        logoBuffer = fs.readFileSync(logoPath)
      } catch (err) {
        console.warn('[pdf-guide-orchestrator] Could not read logo file, generating PDF without logo:', err)
        logoBuffer = undefined
      }

      const pdfBuffer = await generateGuidesPdf(normalized, logoBuffer)

      // Upload to Supabase Storage
      // ...
    })
```

Reemplazar la linea `const pdfBuffer = await generateGuidesPdf(normalized, logoBuffer)` por el enrichment + call:

```typescript
    // Step 4: Generate PDF + upload to Storage (WITHIN SAME STEP to avoid Inngest 4MB limit)
    const downloadUrl = await step.run('generate-and-upload', async () => {
      // Read SOMNIO logo from public/somnio-logo.jpg with graceful fallback
      let logoBuffer: Buffer | undefined
      try {
        const fs = await import('fs')
        const path = await import('path')
        const logoPath = path.join(process.cwd(), 'public', 'somnio-logo.jpg')
        logoBuffer = fs.readFileSync(logoPath)
      } catch (err) {
        console.warn('[pdf-guide-orchestrator] Could not read logo file, generating PDF without logo:', err)
        logoBuffer = undefined
      }

      // Enriquecer NormalizedOrder[] con isMixed + productLabels usando los
      // productos ya cargados con sku/title en el step fetch-orders (Wave 1).
      // Post-normalize enrichment (RESEARCH Pitfall 5): Claude no sabe de isMixed,
      // se computa aqui directo desde `orders` — independiente del fallback path.
      // Event shape `robot/pdf-guide.submitted` INTACTO (Pitfall 4).
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

      // Upload to Supabase Storage
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `guias-${carrierType}-${timestamp}.pdf`
      const filePath = `guide-pdfs/${workspaceId}/${fileName}`

      const { error } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

      if (error) throw new Error(`Storage upload failed: ${error.message}`)

      const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath)
      return data.publicUrl
    })
```

**IMPORTANTE:** Solo cambia el step 4 del `pdfGuideOrchestrator`. Los otros steps (1 mark-processing, 2 fetch-orders, 3 normalize-data, 5 update-items, 6 emit-triggers) NO se tocan. Y el `excelGuideOrchestrator` (ya modificado en Plan 03) tampoco se toca aqui.

Puntos criticos:

1. **Event shape `robot/pdf-guide.submitted` intacto** (Pitfall 4). Los `productTypes` se derivan dentro del step — no viajan en el evento. Cero riesgo de romper jobs en flight.

2. **Post-normalize enrichment** (Pitfall 5). Si `normalize-data` step uso `buildFallbackOrder` (Claude fallo), el orderId sigue valido — `typesByOrderId.get(n.orderId)` funciona igual. Los PDF de fallback tambien recibiran el flag.

3. **`productLabels: mixed ? formatProductLabels(types) : undefined`** — si la orden es safe, `productLabels` queda `undefined`. El generador PDF usa `if (order.isMixed && order.productLabels)` como doble check, asi que undefined + isMixed:false -> no se renderiza la caja. Defensive.

4. **Ambos carriers (Inter y Bogota) beneficiados:** el `pdfGuideOrchestrator` maneja ambos via el campo `carrierType` del evento. Una sola modificacion cubre los 2 flujos.

5. **NO modificar `normalize-order-data.ts`:** el fallback no necesita saber de isMixed porque el enrichment es externo. El pass-through por `buildFallbackOrder` (lineas 112-126) sigue sin tocar `isMixed/productLabels` — quedan `undefined` tras el spread, y el orchestrator los sobreescribe. `normalize-order-data.ts` NO aparece en `files_modified` del frontmatter.

6. **Si el ESLint config alerta sobre la llamada a `generateGuidesPdf(enriched)`** porque el tipo inferido de `enriched` tiene `isMixed: boolean | undefined` en lugar de `isMixed?: boolean`, ajustar con `as NormalizedOrder[]` o usar un tipo explicito. TypeScript strict mode puede ser exigente — en ese caso:
   ```typescript
   const enriched: NormalizedOrder[] = normalized.map((n): NormalizedOrder => {
     // ... misma logica
   })
   ```
   Las anotaciones `: NormalizedOrder[]` y `: NormalizedOrder` forzan la estructura correcta.

7. **NO cambiar el order de steps.** `fetch-orders` retorna `orders`, `normalize-data` retorna `normalized`, `generate-and-upload` lee ambas (ambas ya son closures del handler, disponibles en el scope). Este orden se mantiene — solo se enriquece dentro del step 4.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -vE "^\s*$" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Enrichment presente en pdfGuideOrchestrator: `grep -B 3 "generateGuidesPdf(enriched" src/inngest/functions/robot-orchestrator.ts | grep -q "normalized.map"`
    - **`typesByOrderId` ocurre GLOBALMENTE 2 veces en el archivo** (1 de Plan 03 en el Excel orchestrator + 1 de este plan en el PDF orchestrator):
      ```bash
      grep -c "typesByOrderId" src/inngest/functions/robot-orchestrator.ts
      ```
      retorna exactamente `2`. Si retorna `>2`, el enrichment esta duplicado; si retorna `1`, Plan 03 no se completo o este plan no se aplico.
    - **Scope-limited verification: este plan contribuye EXACTAMENTE 1 ocurrencia de `typesByOrderId` dentro del bloque del PDF orchestrator:**
      ```bash
      # Scope al bloque pdfGuideOrchestrator: desde "pdf-guide.submitted" hasta el siguiente orchestrator ("excel-guide.submitted" o final).
      awk '/pdf-guide.submitted/,/excel-guide.submitted/' src/inngest/functions/robot-orchestrator.ts | grep -c "typesByOrderId"
      ```
      retorna `1`. (El bloque del Excel orchestrator queda fuera del rango capturado por awk.)
    - `productLabels: mixed ? formatProductLabels(types)` presente: `grep -q "productLabels: mixed" src/inngest/functions/robot-orchestrator.ts`
    - **`isMixed: mixed` aparece GLOBALMENTE 2 veces** (una de Plan 03 Excel, una nueva PDF):
      ```bash
      grep -c "isMixed: mixed" src/inngest/functions/robot-orchestrator.ts
      ```
      retorna exactamente `2`.
    - Event shape intacto — el bloque `event.data` del PDF orchestrator no menciona isMixed:
      ```bash
      grep -A 3 "robot/pdf-guide.submitted" src/inngest/functions/robot-orchestrator.ts | grep -c "isMixed" | tr -d ' '
      ```
      retorna `0`
    - Imports de product-types siguen ahi: `grep -q "from '@/lib/orders/product-types'" src/inngest/functions/robot-orchestrator.ts`
    - `normalize-order-data.ts` NO modificado en este plan: `git diff --name-only -- src/lib/pdf/normalize-order-data.ts` debe estar vacio.
    - `npx tsc --noEmit` pasa limpio (exit 0): `npx tsc --noEmit && echo OK_TYPECHECK || echo FAIL_TYPECHECK`
    - No hay errores de shape en el archivo:
      - `npx tsc --noEmit 2>&1 | grep -E "robot-orchestrator\.ts" | wc -l | tr -d ' '` retorna `0`
  </acceptance_criteria>

  <done>
    - PDF orchestrator enriquece `NormalizedOrder[]` con `isMixed` + `productLabels` post-normalize.
    - Event shape `robot/pdf-guide.submitted` intacto.
    - Claude prompt intacto.
    - Fallback path funciona igual.
    - `normalize-order-data.ts` NO se modifico (solo leido como referencia).
    - Ambos carrier types (inter y bogota) reciben el enrichment — 1 cambio cubre 2 flujos.
    - Commit atomico final: `feat(crm-verificar-combinacion-productos): apartado COMBINACION en PDFs Inter y Bogota`.
    - Push a Vercel (REGLA 1): `git add src/lib/pdf/types.ts src/lib/pdf/generate-guide-pdf.ts src/inngest/functions/robot-orchestrator.ts && git commit -m "..." && git push origin main`.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Verificacion manual end-to-end post-deploy de los 4 flujos</name>

  <what-built>
    Despues de los 3 waves, el sistema tiene deteccion de combinacion de productos operativa en los 4 flujos de creacion de guias:
    - Coord: filtro server-side + mensaje de rechazo en /comandos.
    - Envia: Excel con fila amarilla + columna COMBINACION para ordenes mixed.
    - Inter: PDF con caja naranja "COMBINACIÓN: ELIXIR + ASHWAGANDHA" entre logo y direccion para ordenes mixed.
    - Bogota: identico al Inter (mismo generador).

    Todo el codigo esta deployado a Vercel (REGLA 1 aplicada en cada wave).
  </what-built>

  <how-to-verify>
    **Paso 1 — Preparar ordenes de prueba en Somnio staging/prod:**

    Crear o localizar 4 ordenes en la etapa de despacho (pipeline Somnio):
    - Orden A: 100% Elixir puro (ej 1x SKU '001')
    - Orden B: solo Ashwagandha (ej 1x SKU '007')
    - Orden C: Elixir + Magnesio Forte (ej 1x '001' + 1x '008')
    - Orden D: orden sin productos clasificados (SKU raro o sin SKU y titulo sin match) — edge case tratado como mixed

    **Paso 2 — Flujo Coord (subir ordenes coord):**

    Ejecutar `subir ordenes coord` en /comandos. Confirmar:
    - [ ] Solo la Orden A llega al robot (verificar en Inngest dashboard o en la lista de items del job).
    - [ ] El chat muestra un mensaje system con conteo ("Job creado: 1 ordenes validas de 4 total").
    - [ ] El chat muestra un warning amarillo con titulo "3 ordenes NO se enviaron a Coordinadora...":
      - Orden B con products = "ASHWAGANDHA"
      - Orden C con products = "ELIXIR + MAGNESIO FORTE"
      - Orden D con products = "SIN CLASIFICAR"
    - [ ] Cada item muestra la razon con el texto "Usa Envía/Inter/Bogotá para esta orden."
    - [ ] El robot Railway procesa SOLO la Orden A (log en Railway dashboard).

    **Paso 3 — Flujo Excel Envia (generar excel envia):**

    Mover las 4 ordenes a la etapa configurada para Envia (si es distinta de la de despacho; si es la misma, pasar al siguiente paso directamente).
    Ejecutar `generar excel envia`. Descargar el .xlsx. Abrir en LibreOffice o Excel y confirmar:
    - [ ] 7 columnas: Valor, Nombre, Telefono, Direccion, Municipio, Departamento, COMBINACION.
    - [ ] Row 1 (header): fondo gris claro, fuente bold.
    - [ ] Fila de Orden A: sin highlight, celda COMBINACION vacia.
    - [ ] Fila de Orden B: fondo amarillo, celda COMBINACION = "ASHWAGANDHA".
    - [ ] Fila de Orden C: fondo amarillo, celda COMBINACION = "ELIXIR + MAGNESIO FORTE".
    - [ ] Fila de Orden D: fondo amarillo, celda COMBINACION = "SIN CLASIFICAR".
    - [ ] Las demas 6 columnas estan correctamente pobladas en las 4 filas (regresion cero).

    **Paso 4 — Flujos PDF Inter y Bogota:**

    Ejecutar `generar guias inter` y luego `generar guias bogota` (puede requerir configurar los carriers en staging). Descargar los PDFs. Abrir y confirmar:
    - [ ] PDF Inter — pagina de Orden A: layout identico al actual (sin caja naranja). Logo -> separador -> ENVIO PRIORIDAD -> etc.
    - [ ] PDF Inter — pagina de Orden B: entre el logo y el primer separador aparece una caja con borde naranja `#ff751f`, fill naranja claro, texto centrado bold "COMBINACIÓN: ASHWAGANDHA".
    - [ ] PDF Inter — pagina de Orden C: misma caja con texto "COMBINACIÓN: ELIXIR + MAGNESIO FORTE".
    - [ ] PDF Inter — pagina de Orden D: caja con texto "COMBINACIÓN: SIN CLASIFICAR".
    - [ ] El texto despues de la caja (ENVIAR A:, direccion, barrio, ciudad, telefono, VALOR A COBRAR, barcode) se renderiza en NEGRO normal — no naranja (Pitfall 2 mitigated correctamente).
    - [ ] PDF Bogota: idem Inter — la caja aparece igual en las 3 ordenes mixed y no aparece en la Orden A.

    **Paso 5 — Regresion safe path:**

    Generar Coord + Envia + Inter + Bogota con SOLO la Orden A (pura Elixir):
    - [ ] Coord: Orden A llega al robot, sin warning extra de combinacion en el chat.
    - [ ] Envia: xlsx identico al comportamiento pre-cambio (excepto columna COMBINACION vacia al final).
    - [ ] Inter/Bogota: PDFs pixel-identicos al comportamiento pre-cambio.

    **Paso 6 — Documentacion (REGLA 4):**

    - [ ] Actualizar `docs/analysis/04-estado-actual-plataforma.md` seccion Logistica/Guias: agregar linea "2026-04-X: Agregada deteccion de combinacion de productos en los 4 flujos de generacion de guias (filtro Coord + highlight Envia + caja PDF Inter/Bogota)."
    - [ ] Opcional: crear `.planning/standalone/crm-verificar-combinacion-productos/LEARNINGS.md` con los bugs/gotchas encontrados durante la verificacion.
  </how-to-verify>

  <resume-signal>
    Escribir "approved" si los 6 pasos pasaron. Si algun paso fallo, describir el problema exacto (fila que no se pinta, caja que no aparece, mensaje incorrecto, etc.) para abrir iteracion de fix.
  </resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` pasa sin errores (exit 0) al completar las 3 modificaciones de codigo.
- Event shape `robot/pdf-guide.submitted` intacto — verificable grepeando el bloque `inngest.send({ name: 'robot/pdf-guide.submitted'...`) en `src/app/actions/comandos.ts:709, 817` y confirmando que `data` no gano campos.
- Verificacion manual end-to-end cubierta en Task 4 (checkpoint).
</verification>

<success_criteria>
- `NormalizedOrder` tiene `isMixed?` y `productLabels?` opcionales.
- PDF guias muestra caja condicional `COMBINACIÓN: {labels}` solo para ordenes mixed, en Inter y Bogota ambos.
- Colores exactos: borde `#ff751f`, fill `#FFF4E5`, texto `#B45309`.
- `fillColor` reseteado a `#000000` despues del bloque (Pitfall 2).
- Ordenes safe: PDF pixel-identico al actual.
- Event shape `robot/pdf-guide.submitted` intacto.
- Ambos carriers (inter, bogota) cubiertos con 1 implementacion.
- Checkpoint manual (Task 4) pasa todos los 6 pasos.
- `docs/analysis/04-estado-actual-plataforma.md` actualizado (REGLA 4).
- Push a `origin main` realizado (REGLA 1).
- Fin de fase standalone — todos los 4 flujos protegidos contra despacho de combinacion equivocada.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-verificar-combinacion-productos/04-SUMMARY.md` con:
- Resumen del apartado PDF agregado + colores exactos.
- Ubicacion del enrichment (step 'generate-and-upload' del pdfGuideOrchestrator).
- Confirmacion de que `robot/pdf-guide.submitted` shape esta intacto.
- Confirmacion de que Inter y Bogota ambos reciben el apartado.
- Resultados del checkpoint manual (Task 4) — que fallos hubieron, si fueron resueltos antes de aprobar.
- Commit SHA del push a main.
- Deuda tecnica abierta.
- Cierre de fase: listar los 4 planes completados y confirmar que `docs/analysis/04-estado-actual-plataforma.md` se actualizo.

Y tambien crear/actualizar `.planning/standalone/crm-verificar-combinacion-productos/LEARNINGS.md` consolidando los 4 planes (patterns que funcionaron, pitfalls encontrados en runtime que no estaban en RESEARCH, decisiones sutiles como el color exacto del box, etc.).
</output>
</output>
