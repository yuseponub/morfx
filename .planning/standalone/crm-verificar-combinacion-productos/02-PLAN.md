---
phase: crm-verificar-combinacion-productos
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/app/actions/comandos.ts
  - src/app/(dashboard)/comandos/components/comandos-layout.tsx
  - src/app/(dashboard)/comandos/components/command-output.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "`executeSubirOrdenesCoord` filtra las ordenes por combinacion INMEDIATAMENTE despues del fetch (antes de validateCities) — evita costo de Claude AI en ordenes rechazadas"
    - "Solo las ordenes `isSafeForCoord` llegan a `createRobotJob` y al evento `robot/job.submitted`"
    - "La respuesta de `executeSubirOrdenesCoord` incluye un nuevo campo `rejectedByCombination: Array<{ orderId, orderName, products, reason }>`"
    - "El mensaje de rechazo incluye el nombre de la orden, los productos (ej 'ASHWAGANDHA' o 'ELIXIR + MAGNESIO FORTE') y razon informativa con 'Usa Envía/Inter/Bogotá'"
    - "El UI `comandos-layout.tsx` renderiza un mensaje `type: 'warning'` extra cuando `rejectedByCombination.length > 0`, separado del warning existente de ciudades corregidas por IA"
    - "El renderer `command-output.tsx` muestra el campo `products` cuando esta presente (union extendida con `products?: string` opcional; los campos `originalCity?`/`resolvedCity?`/`department?` pasan a ser opcionales para evitar strings vacios fragiles en el warning de combinacion)"
    - "El evento `robot/job.submitted` NO cambia de shape — productos rechazados nunca llegan al evento"
  artifacts:
    - path: "src/app/actions/comandos.ts"
      provides: "Filtro de combinacion en executeSubirOrdenesCoord + campo rejectedByCombination en SubirOrdenesResult"
      contains: "rejectedByCombination"
    - path: "src/app/(dashboard)/comandos/components/comandos-layout.tsx"
      provides: "CommandMessage union con products?: string opcional + render de warning para rechazos por combinacion"
      contains: "products?: string"
    - path: "src/app/(dashboard)/comandos/components/command-output.tsx"
      provides: "Render opcional del campo products en warnings"
      contains: "item.products"
  key_links:
    - from: "executeSubirOrdenesCoord"
      to: "createRobotJob + inngest.send('robot/job.submitted')"
      via: "Solo `validForCoord` (ordenes safe) llega a estas llamadas"
      pattern: "validForCoord"
    - from: "SubirOrdenesResult.rejectedByCombination"
      to: "CommandMessage type='warning' con products"
      via: "comandos-layout.tsx mapea el array al shape del warning con product labels"
      pattern: "rejectedByCombination"
    - from: "formatProductLabels(types)"
      to: "rejectedByCombination[].products (string UPPERCASE)"
      via: "import desde @/lib/orders/product-types"
      pattern: "formatProductLabels\\("
---

<objective>
Aplicar filtro server-side en `executeSubirOrdenesCoord` que separa las ordenes en `validForCoord` y `rejectedByCombination`, enviando SOLO las safe al robot Coordinadora (via Inngest `robot/job.submitted`) y retornando la lista de rechazadas al UI `/comandos` como un nuevo mensaje tipo `warning` con copy explicativo.

Purpose: Cerrar el hueco operacional donde el agente podia mandar ordenes con Ashwagandha/Magnesio Forte al robot Coordinadora (bodega no tiene stock). Filtro silencioso + mensaje informativo en chat. Shape del evento Inngest INTACTO (RESEARCH Pitfall 4) — solo pasan las ordenes validas.

Output: 3 archivos modificados. `comandos.ts` con el filtro y el nuevo campo en la respuesta. `comandos-layout.tsx` con la union `CommandMessage` extendida (field opcional `products?: string`) y render del warning. `command-output.tsx` con display opcional del campo `products`. Cero cambios al robot Railway, cero cambios al event schema de Inngest.
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
@.claude/rules/code-changes.md

<interfaces>
<!-- Contratos que este plan consume (de Wave 1) y crea (para comandos-layout). -->

```typescript
// Importados de Wave 1 (src/lib/orders/product-types.ts):
import {
  detectOrderProductTypes,
  isSafeForCoord,
  formatProductLabels,
} from '@/lib/orders/product-types'

// NUEVO en este plan — shape de rejectedByCombination en SubirOrdenesResult:
interface RejectedByCombination {
  orderId: string
  orderName: string | null
  products: string   // formato UPPERCASE "ASHWAGANDHA" o "ELIXIR + MAGNESIO FORTE"
  reason: string     // razon canned con recomendacion Envia/Inter/Bogota
}

// NUEVO en este plan — extension de CommandMessage warning variant.
// CAMBIO IMPORTANTE (revision): originalCity, resolvedCity, department pasan
// a ser OPCIONALES para evitar que el warning de combinacion use strings
// vacios ('') que el renderer legacy mostraria como garbage (" → ").
type CommandMessage =
  | /* ...variantes existentes... */
  | {
      type: 'warning'
      title: string
      items: Array<{
        orderName: string | null
        originalCity?: string    // CAMBIO: ahora opcional (warning de combinacion no lo pobla)
        resolvedCity?: string    // CAMBIO: ahora opcional
        department?: string      // CAMBIO: ahora opcional
        reason: string
        products?: string        // NUEVO — opcional para warnings de combinacion
      }>
      timestamp: string
    }
  /* ...el resto sin cambio... */
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar filtro de combinacion en executeSubirOrdenesCoord</name>
  <files>src/app/actions/comandos.ts</files>

  <read_first>
    - **src/app/actions/comandos.ts lineas 40-100** (type definitions — `CommandResult<T>` en linea 43-47 y `SubirOrdenesResult` en linea 72-86 — para ver el shape exacto que hay que extender).
    - **src/app/actions/comandos.ts lineas 300-330** (precedente existente de "todas rechazadas": bloque `if (validCityResults.length === 0) { return { success: false, error: '...', data: { ... } } }` en linea 309-322. El early-return del nuevo filtro debe REPLICAR esta forma exacta — `success: false`, con `error` string explicativo y `data` poblado con los conteos correctos).
    - src/app/actions/comandos.ts lineas 1-80 (imports + type definitions — para localizar donde extender `SubirOrdenesResult` si esta local al archivo, o donde importarlo si viene de otro modulo)
    - src/app/actions/comandos.ts lineas 160-405 completo (`executeSubirOrdenesCoord` completo — entender el flujo: auth -> creds -> stage -> active job -> fetch orders -> validate cities -> COD filter -> createRobotJob -> inngest.send)
    - src/app/actions/comandos.ts linea 269 (patron de `codRejected` — el filtro nuevo sigue este patron exactamente)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Architecture Patterns -> Pattern 1: Filter rejected orders with informative chat message" y "Open Questions #1" — RESEARCH recomienda filtrar INMEDIATAMENTE despues del fetch)
    - src/lib/orders/product-types.ts (para confirmar que Wave 1 ya exporta `isSafeForCoord` y `formatProductLabels`)
  </read_first>

  <action>
Hacer 3 cambios en `src/app/actions/comandos.ts`:

**Cambio 1 — Agregar import (al tope del archivo, donde esten los otros imports de `@/lib/orders/...` o agregar el bloque si no existe):**

```typescript
import {
  detectOrderProductTypes,
  isSafeForCoord,
  formatProductLabels,
} from '@/lib/orders/product-types'
```

Verificar si ya existe un import de `@/lib/orders/product-types` (fase anterior `crm-color-tipo-producto` pudo haberlo creado); si existe, agregar las 3 funciones al mismo import statement. Si no existe, agregar el bloque limpio.

**Cambio 2 — Extender el tipo de retorno `SubirOrdenesResult`:**

Localizar la declaracion de `SubirOrdenesResult` (linea 72-86 per `<read_first>`). Agregar el campo opcional:

```typescript
// Agregar a SubirOrdenesResult:
rejectedByCombination: Array<{
  orderId: string
  orderName: string | null
  products: string
  reason: string
}>
```

Reglas: NO hacer el campo opcional con `?` — siempre se retorna (array vacio cuando no hay rechazos). Esto simplifica el render en UI.

**Cambio 3 — Insertar filtro INMEDIATAMENTE despues del fetch de ordenes (entre linea ~216 y ~218, DESPUES de `const orders = ordersResult.data!` y del check `if (orders.length === 0)`, ANTES de `// 6. Validate cities`):**

Reemplazar el bloque (orientativo — ajustar a estructura actual exacta):

```typescript
// ANTES (linea ~210-218):
    // 5. Fetch orders from dispatch stage
    const ordersResult = await getOrdersByStage(ctx, dispatchStage.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const orders = ordersResult.data!

    if (orders.length === 0) {
      return { success: false, error: 'No hay pedidos en la etapa de despacho' }
    }

    // 6. Validate cities
```

POR (insertando el nuevo bloque 5b entre ordersResult check y validateCities):

```typescript
    // 5. Fetch orders from dispatch stage
    const ordersResult = await getOrdersByStage(ctx, dispatchStage.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const allOrders = ordersResult.data!

    if (allOrders.length === 0) {
      return { success: false, error: 'No hay pedidos en la etapa de despacho' }
    }

    // 5b. Filtro de combinacion de productos — solo ordenes puras Elixir pasan al robot.
    // Ordenes con Ashwagandha o Magnesio Forte se rechazan aqui ANTES de validateCities
    // para evitar costo de Claude AI en ordenes que nunca llegaran al robot
    // (ver RESEARCH Open Question #1 — filtrar inmediatamente despues del fetch).
    const rejectedByCombination: Array<{
      orderId: string
      orderName: string | null
      products: string
      reason: string
    }> = []

    const orders: typeof allOrders = []
    for (const order of allOrders) {
      const types = detectOrderProductTypes(order.products)
      if (isSafeForCoord(types)) {
        orders.push(order)
      } else {
        const productLabels = formatProductLabels(types)
        rejectedByCombination.push({
          orderId: order.id,
          orderName: order.name ?? null,
          products: productLabels,
          reason: `Contiene ${productLabels} y no hay stock de esos productos en la bodega de Coord. Usa Envía/Inter/Bogotá para esta orden.`,
        })
      }
    }

    // Early return cuando TODAS las ordenes fueron rechazadas por combinacion.
    // REPLICA EXACTA del precedente "todas rechazadas" de linea 309-322
    // (validCityResults.length === 0): success: false + error string + data con conteos.
    // - invalidCount: rejectedByCombination.length (son "invalidas" conceptualmente — no llegan al robot).
    // - totalOrders: allOrders.length (el total real fetcheado).
    // - invalidOrders: [] (estas no son city-invalid; el detalle vive en rejectedByCombination).
    // - rejectedByCombination: poblado para que el UI muestre el warning con los detalles.
    if (rejectedByCombination.length === allOrders.length) {
      return {
        success: false,
        error: `Las ${allOrders.length} orden${allOrders.length === 1 ? '' : 'es'} en la etapa contienen productos que no se despachan por Coordinadora. Usa Envía/Inter/Bogotá.`,
        data: {
          jobId: '',
          totalOrders: allOrders.length,
          validCount: 0,
          invalidCount: rejectedByCombination.length,
          invalidOrders: [],
          aiResolvedOrders: [],
          rejectedByCombination,
        },
      }
    }

    // 6. Validate cities (only on orders that passed combination filter)
```

Puntos criticos de este cambio:

1. **Rename de variable:** `const orders` se convierte en `const allOrders` en el fetch, y se crea un NUEVO `const orders` filtrado. Todo el resto del flujo (validateCities al resto, codRejected, createRobotJob, inngest.send, build invalidOrders) sigue usando `orders` — el rename solo afecta la seccion donde se hace el filtro. Sin cambios downstream.

2. **Early return cuando NINGUNA orden pasa el filtro (REVISADO):** retornamos con la MISMA forma exacta del precedente en linea 309-322 — `success: false`, `error` string explicativo, y `data` poblado con los conteos reales. Esto garantiza que el UI branch legacy (`if (!result.success)` que lee `result.error`) funciona sin cambios y el UI ve los conteos correctos.
   - `invalidCount: rejectedByCombination.length` — NO `0`. Las rechazadas CUENTAN como invalidas operacionalmente.
   - `totalOrders: allOrders.length` — el total fetcheado antes del filtro.
   - `invalidOrders: []` — estas rechazadas NO son city-invalid (el campo existe para fallas de ciudad/COD); los detalles viven en `rejectedByCombination`.

3. **Actualizar el `return success: true` del final (linea ~388-398)** para incluir `rejectedByCombination` en el data:

```typescript
    // 10. Return result
    return {
      success: true,
      data: {
        jobId: jobResult.data.jobId,
        totalOrders: allOrders.length,   // ← CAMBIO: usar allOrders (incluye las filtradas por combinacion)
        validCount: validCityResults.length,
        invalidCount: invalidOrders.length,
        invalidOrders,
        aiResolvedOrders,
        rejectedByCombination,            // ← NUEVO
      },
    }
```

4. **NO tocar el evento `robot/job.submitted`.** Solo las ordenes de `orders` (filtradas) llegan a `createRobotJob` y al evento. Event shape intacto. Robot Railway no se toca. RESEARCH Pitfall 4 respetado.

5. **Orden: antes de validateCities.** Justificacion en RESEARCH Open Question #1 — ahorra costo de Claude AI city resolution en ordenes que de todas formas iban a rechazarse.

6. **REGLA 3 (Domain layer):** este filtro es input-filtering, NO mutacion — no necesita nuevo dominio. Acceptable outside domain layer. RESEARCH lo confirma.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "src/app/actions/comandos\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Imports presentes: `grep -q "isSafeForCoord" src/app/actions/comandos.ts` y `grep -q "formatProductLabels" src/app/actions/comandos.ts` y `grep -q "detectOrderProductTypes" src/app/actions/comandos.ts`
    - Rename aplicado: `grep -c "const allOrders" src/app/actions/comandos.ts` retorna `1`
    - Filtro implementado: `grep -q "rejectedByCombination" src/app/actions/comandos.ts` y `grep -q "isSafeForCoord(types)" src/app/actions/comandos.ts`
    - Mensaje correcto: `grep -q "bodega de Coord" src/app/actions/comandos.ts` y `grep -q "Usa Envía/Inter/Bogotá" src/app/actions/comandos.ts`
    - Return incluye el nuevo campo: `grep -q "rejectedByCombination," src/app/actions/comandos.ts` (con coma — ambos returns: el early-empty y el final success)
    - Early return cuando todas se rechazan presente: `grep -q "contienen productos que no se despachan por Coordinadora" src/app/actions/comandos.ts`
    - **El early-return usa el mismo shape que el precedente (success:false + error + data):**
      ```bash
      # Inspeccion visual del bloque early-return (debe replicar el shape de linea ~309-322).
      grep -B 2 -A 12 "rejectedByCombination.length === allOrders.length" src/app/actions/comandos.ts
      ```
      El output debe contener: `success: false`, `error:`, `data:`, `invalidCount: rejectedByCombination.length`, `totalOrders: allOrders.length`, `invalidOrders: []`.
    - **El early-return NO usa `invalidCount: 0`** (seria incorrecto conceptualmente — las rechazadas cuentan como invalidas):
      ```bash
      grep -A 12 "rejectedByCombination.length === allOrders.length" src/app/actions/comandos.ts | grep -c "invalidCount: 0"
      ```
      retorna `0`.
    - **El early-return usa `invalidCount: rejectedByCombination.length`:**
      ```bash
      grep -A 12 "rejectedByCombination.length === allOrders.length" src/app/actions/comandos.ts | grep -q "invalidCount: rejectedByCombination.length"
      ```
    - El evento Inngest NO cambio: `grep -A 15 "robot/job.submitted" src/app/actions/comandos.ts | grep -q "rejectedByCombination"` NO debe matchear (retorna exit != 0). Verificar manualmente que el objeto `data:` dentro de `inngest.send` NO contiene `rejectedByCombination`.
    - `npx tsc --noEmit` pasa limpio (0 errores nuevos en comandos.ts). El archivo `comandos-layout.tsx` puede tener error temporal hasta Task 2 — no es bloqueante.
  </acceptance_criteria>

  <done>
    - Filtro inserto como "5b" entre fetch y validateCities.
    - `rejectedByCombination` poblado con `{orderId, orderName, products, reason}` por cada orden rechazada.
    - SubirOrdenesResult.rejectedByCombination siempre retornado (array vacio si no hay rechazos).
    - Early-return en caso "todas rechazadas" replica shape exacto del precedente de linea 309-322 (success:false + error + data con conteos reales).
    - Event `robot/job.submitted` shape intacto — solo ordenes safe llegan.
    - Commit atomico pendiente (se hace al final del plan con Task 2 y 3).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Extender CommandMessage union y agregar render del warning de combinacion</name>
  <files>src/app/(dashboard)/comandos/components/comandos-layout.tsx</files>

  <read_first>
    - src/app/(dashboard)/comandos/components/comandos-layout.tsx lineas 44-143 completo (CommandMessage union — localizar el variant `type: 'warning'` en linea 130-141)
    - src/app/(dashboard)/comandos/components/comandos-layout.tsx lineas 505-562 (`if (normalized === 'subir ordenes coord')` — donde se renderiza el result y donde hay que agregar el nuevo warning)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Open Questions #4" — extender la union con `products?: string` opcional, no crear variant nuevo)
  </read_first>

  <atomic_commit_note>
    **IMPORTANTE:** Tasks 2 y 3 DEBEN commitearse atomicamente — NO commitear Task 2 sin Task 3 en el mismo commit. La extension de la union (Task 2) y la actualizacion del renderer (Task 3) son interdependientes: si se commitea solo Task 2, los warnings de combinacion llegan al renderer legacy (que espera `originalCity`/`resolvedCity` siempre presentes) y el usuario ve un render roto. Si se commitea solo Task 3, TypeScript fallara porque el campo `products?` no existe aun en la union.
  </atomic_commit_note>

  <action>
Hacer 2 cambios en `src/app/(dashboard)/comandos/components/comandos-layout.tsx`:

**Cambio 1 — Extender el variant `type: 'warning'` (linea ~130-141).**

ANTES:
```typescript
  | {
      type: 'warning'
      title: string
      items: Array<{
        orderName: string | null
        originalCity: string
        resolvedCity: string
        department: string
        reason: string
      }>
      timestamp: string
    }
```

DESPUES (REVISADO — hacer `originalCity`/`resolvedCity`/`department` opcionales para que el warning de combinacion NO tenga que poblarlos con strings vacios):
```typescript
  | {
      type: 'warning'
      title: string
      items: Array<{
        orderName: string | null
        originalCity?: string     // CAMBIO: opcional (warning de combinacion no lo pobla)
        resolvedCity?: string     // CAMBIO: opcional
        department?: string       // CAMBIO: opcional
        reason: string
        products?: string         // NUEVO — opcional, usado por rechazos de combinacion de productos
      }>
      timestamp: string
    }
```

NO crear un variant separado — esto seria un anti-pattern (RESEARCH Open Q #4 explicito). Extender el existente con opcionales mantiene el renderer simple.

**Por que hacemos originalCity/resolvedCity/department opcionales (revision):** el warning existente de "Ciudades corregidas por IA" poblaba estos 3 campos siempre. El nuevo warning de combinacion NO tiene info de ciudad — si los poblamos con `''` (string vacio), el renderer legacy (`command-output.tsx`) muestra `" → "` con comillas vacias alrededor que se ve como garbage visual. Haciendolos opcionales y usando `undefined` en el warning de combinacion, Task 3 puede discriminar por `item.products` presente sin riesgo de fallback accidental al render legacy.

**Cambio 2 — Agregar render del nuevo warning dentro de `if (normalized === 'subir ordenes coord')`**.

Localizar el bloque actual (linea ~526-557 aproximadamente):

```typescript
        const data = result.data!
        addMessage({
          type: 'system',
          text: `Job creado: ${data.validCount} ordenes validas de ${data.totalOrders} total.${data.invalidCount > 0 ? ` ${data.invalidCount} invalidas.` : ''}`,
          timestamp: now(),
        })

        if (data.aiResolvedOrders && data.aiResolvedOrders.length > 0) {
          addMessage({
            type: 'warning',
            title: 'Ciudades corregidas por IA — Corregir en el CRM para la proxima vez:',
            items: data.aiResolvedOrders.map(o => ({
              orderName: o.orderName,
              originalCity: o.originalCity,
              resolvedCity: o.resolvedCity,
              department: o.department,
              reason: o.reason,
            })),
            timestamp: now(),
          })
        }

        if (data.invalidOrders.length > 0) {
          // ...
        }
```

Agregar un NUEVO bloque `if` INMEDIATAMENTE DESPUES del `system` message inicial y ANTES del warning de `aiResolvedOrders`. REVISADO: usar `undefined` (omitir los campos) para `originalCity`/`resolvedCity`/`department` en lugar de strings vacios:

```typescript
        const data = result.data!
        addMessage({
          type: 'system',
          text: `Job creado: ${data.validCount} ordenes validas de ${data.totalOrders} total.${data.invalidCount > 0 ? ` ${data.invalidCount} invalidas.` : ''}`,
          timestamp: now(),
        })

        // Warning: ordenes filtradas por combinacion de productos (Ashwagandha, Magnesio Forte, etc.)
        // NOTA (revision): NO poblar originalCity/resolvedCity/department — omitirlos
        // (quedan undefined). El renderer en Task 3 discrimina por `item.products` presente
        // vs `item.originalCity` presente. Strings vacios '' serian fragiles y renderizarian
        // garbage si se llega al branch legacy por algun bug.
        if (data.rejectedByCombination && data.rejectedByCombination.length > 0) {
          const n = data.rejectedByCombination.length
          addMessage({
            type: 'warning',
            title: `${n} orden${n === 1 ? '' : 'es'} NO se enviaron a Coordinadora (productos fuera de stock en bodega Coord):`,
            items: data.rejectedByCombination.map(r => ({
              orderName: r.orderName,
              // originalCity, resolvedCity, department: NO se pueblan (quedan undefined)
              reason: r.reason,
              products: r.products,     // campo opcional poblado
            })),
            timestamp: now(),
          })
        }

        if (data.aiResolvedOrders && data.aiResolvedOrders.length > 0) {
          // ...existente sin cambios...
        }
```

Puntos criticos:

1. **Orden del warning:** primero `rejectedByCombination` (mas importante operacionalmente — son ordenes que no se despacharan), luego `aiResolvedOrders` (ciudades corregidas por IA), luego `invalidOrders` (validacion fallida). El agente ve primero lo mas accionable.

2. **Campos omitidos en items (REVISADO):** `originalCity`, `resolvedCity`, `department` se OMITEN (quedan `undefined`) porque el warning de combinacion no tiene nada que decir sobre ciudad. Strings vacios `''` serian fragiles — si por algun bug el renderer cae al branch legacy, veriamos `" → "` vacio. Con `undefined`, el renderer discrimina limpiamente via `item.products ? ... : ...`.

3. **Plural correcto:** `${n === 1 ? '' : 'es'}` para `orden/ordenes`. Detalle menor pero matters para legibilidad.

4. **Early return path:** si el backend retorna `success: false` porque TODAS las ordenes se filtraron, el codigo actual ya entra al branch `if (!result.success)` (linea ~516-523) y muestra `result.error` como type `error`. El mensaje de error ya explica la razon ("Las N ordenes contienen productos que no se despachan por Coordinadora..."). No se necesita render adicional aqui — el error path ya cubre ese caso.

5. **NO tocar los otros 3 branches de comandos** (buscar guias coord, leer guias, generar guias inter/bogota/envia) — este plan es solo Coord.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "comandos-layout\.tsx" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Union extendida: `grep -q "products?: string" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx`
    - **Campos city-related ahora opcionales:**
      `grep -q "originalCity?: string" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx` y
      `grep -q "resolvedCity?: string" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx` y
      `grep -q "department?: string" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx`
    - Render del warning: `grep -q "rejectedByCombination" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx`
    - Titulo correcto: `grep -q "NO se enviaron a Coordinadora" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx`
    - Mapping correcto: `grep -q "products: r.products" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx`
    - **El mapping del warning de combinacion NO usa strings vacios para campos de ciudad** (revision):
      ```bash
      grep -A 10 "rejectedByCombination.map" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx | grep -vE "originalCity: ''|resolvedCity: ''|department: ''" | head -1 > /dev/null && echo OK || echo FAIL
      ```
      Alternativa mas directa:
      ```bash
      grep -A 10 "rejectedByCombination.map" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx | grep -c "originalCity: ''"
      ```
      debe retornar `0`.
    - NO hay variant nuevo tipo `'combination_warning'`: `grep -c "combination_warning" src/app/\(dashboard\)/comandos/components/comandos-layout.tsx` retorna `0`
    - `npx tsc --noEmit` pasa limpio en este archivo. Si el file `command-output.tsx` tiene error temporal hasta Task 3, es aceptable antes de commit final pero no despues.
  </acceptance_criteria>

  <done>
    - `CommandMessage` union extendida con `products?: string` opcional + `originalCity?`/`resolvedCity?`/`department?` pasados a opcionales (revision).
    - Render del nuevo warning agregado antes del warning de `aiResolvedOrders`, usando `undefined` (no `''`) para los campos de ciudad.
    - Titulo y copy en espanol siguiendo convencion del proyecto.
    - Ningun otro branch de comandos tocado.
    - **ESTE task NO se commitea solo — va en el mismo commit atomico que Task 3 (ver `<atomic_commit_note>`).**
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Renderizar el campo products en command-output.tsx cuando esta presente</name>
  <files>src/app/(dashboard)/comandos/components/command-output.tsx</files>

  <read_first>
    - src/app/(dashboard)/comandos/components/command-output.tsx lineas 349-377 completo (el case `'warning'` del switch)
    - src/app/(dashboard)/comandos/components/comandos-layout.tsx lineas 130-141 (el type actualizado — ya con `products?: string` + `originalCity?`/`resolvedCity?`/`department?` opcionales)
  </read_first>

  <atomic_commit_note>
    **IMPORTANTE:** Este task DEBE commitearse atomicamente con Task 2 — NO commitear Task 3 sin Task 2 en el mismo commit. La union extendida (Task 2) y el renderer condicional (Task 3) son interdependientes. Ver nota en Task 2. El commit atomico final del plan cubre los 3 tasks (1, 2, 3) en un solo commit.
  </atomic_commit_note>

  <action>
Modificar el case `'warning'` en `src/app/(dashboard)/comandos/components/command-output.tsx` para renderizar el campo `products` cuando esta presente Y para manejar el caso donde los campos de ciudad (`originalCity`/`resolvedCity`/`department`) son `undefined` (warning de combinacion no es sobre ciudad).

ANTES (lineas 349-377):
```tsx
    case 'warning':
      return (
        <div className="pl-6">
          <div className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 rounded-r-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {message.title}
            </div>
            <div className="space-y-2">
              {message.items.map((item, idx) => (
                <div key={idx} className="text-xs space-y-0.5">
                  <div>
                    <span className="font-semibold text-yellow-800 dark:text-yellow-300">
                      {item.orderName || 'Sin nombre'}
                    </span>
                    <span className="text-muted-foreground">{' — '}</span>
                    <span className="text-muted-foreground">&quot;{item.originalCity}&quot;</span>
                    <span className="text-muted-foreground">{' → '}</span>
                    <span className="font-bold text-yellow-700 dark:text-yellow-300">{item.resolvedCity}</span>
                  </div>
                  <div className="text-muted-foreground pl-4 italic">
                    {item.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
```

DESPUES (extender el render del item para soportar ambos tipos de warning):

```tsx
    case 'warning':
      return (
        <div className="pl-6">
          <div className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 rounded-r-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {message.title}
            </div>
            <div className="space-y-2">
              {message.items.map((item, idx) => (
                <div key={idx} className="text-xs space-y-0.5">
                  <div>
                    <span className="font-semibold text-yellow-800 dark:text-yellow-300">
                      {item.orderName || 'Sin nombre'}
                    </span>
                    {item.products ? (
                      // Warning de combinacion de productos
                      <>
                        <span className="text-muted-foreground">{' — '}</span>
                        <span className="font-bold text-yellow-700 dark:text-yellow-300">
                          {item.products}
                        </span>
                      </>
                    ) : (
                      // Warning de correccion de ciudad por IA (legacy — mantener render)
                      <>
                        <span className="text-muted-foreground">{' — '}</span>
                        <span className="text-muted-foreground">&quot;{item.originalCity}&quot;</span>
                        <span className="text-muted-foreground">{' → '}</span>
                        <span className="font-bold text-yellow-700 dark:text-yellow-300">
                          {item.resolvedCity}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-muted-foreground pl-4 italic">
                    {item.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
```

Puntos criticos:

1. **Check condicional `item.products ? ... : ...`** — TypeScript distingue el caso por la presencia del campo opcional. Sin cambios en la union discriminada; es discriminacion por valor (presencia del opcional).

2. **Legacy path preservado:** el branch existente (`originalCity -> resolvedCity`) se mantiene EXACTAMENTE igual para no romper el warning de ciudades corregidas por IA. Solo se agrega el branch nuevo `item.products`.

3. **`item.reason` se muestra igual en ambos casos** (linea `text-muted-foreground pl-4 italic`). El texto de razon del warning de combinacion termina siendo: "Contiene ASHWAGANDHA y no hay stock de esos productos en la bodega de Coord. Usa Envía/Inter/Bogotá para esta orden." — legible y accionable.

4. **NO tocar los imports del archivo.** `AlertTriangle`, los icons, etc — todos ya estan.

5. **Visual consistency:** el warning amarillo de combinacion usa el mismo estilo (border-l-4 border-yellow-500, bg-yellow-50) que el warning de ciudad — un usuario veterano del comando las reconoce. No es un color diferente porque no es un "error" — es info operacional.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -vE "^\s*$" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - Render condicional agregado: `grep -q "item.products ?" src/app/\(dashboard\)/comandos/components/command-output.tsx`
    - Legacy path preservado: `grep -q "&quot;{item.originalCity}&quot;" src/app/\(dashboard\)/comandos/components/command-output.tsx`
    - `npx tsc --noEmit` pasa sin errores (exit 0): `npx tsc --noEmit && echo OK_TYPECHECK || echo FAIL_TYPECHECK`
    - Especificamente NO hay error en command-output.tsx o comandos-layout.tsx relacionado con `products`:
      - `npx tsc --noEmit 2>&1 | grep -E "(command-output|comandos-layout)\.tsx.*products" | wc -l | tr -d ' '` retorna `0`
  </acceptance_criteria>

  <done>
    - Branch condicional `item.products ? ... : ...` renderiza bien ambos tipos de warning.
    - Legacy (ciudades IA) intacto — regresion cero.
    - `npx tsc --noEmit` global limpio.
    - **Commit atomico OBLIGATORIO que incluye Task 1 + Task 2 + Task 3 en UN solo commit** (no separarlos — ver `<atomic_commit_note>` de Tasks 2 y 3):
      `feat(crm-verificar-combinacion-productos): filtro de combinacion en flujo Coord + UI warning`.
    - Push a Vercel (REGLA 1): `git add src/app/actions/comandos.ts src/app/\(dashboard\)/comandos/components/comandos-layout.tsx src/app/\(dashboard\)/comandos/components/command-output.tsx && git commit -m "..." && git push origin main`.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` pasa sin errores (exit 0).
- El evento Inngest `robot/job.submitted` NO ha cambiado de shape — verificable grepeando el bloque `inngest.send({ name: 'robot/job.submitted'...`) en `src/app/actions/comandos.ts` y confirmando que el `data` sigue teniendo `jobId, workspaceId, carrier, credentials, orders` y NADA mas.
- El renderer `command-output.tsx` maneja ambos casos (warning de ciudad y warning de combinacion) sin crashear.
- Verificacion manual post-deploy (del agente, despues de merge):
  - Ejecutar `subir ordenes coord` con 3 ordenes en staging: 1 Elixir pura, 1 con Ashwagandha, 1 con Magnesio Forte.
  - Resultado esperado: solo la Elixir pura llega al robot (verificar logs Inngest); UI muestra mensaje system + warning amarillo con las 2 rechazadas con sus labels.
- Safe path: ejecutar con 100% ordenes Elixir pura -> comportamiento identico al actual (sin warning extra).
</verification>

<success_criteria>
- Filtro server-side implementado y solo `validForCoord` llega al robot.
- Warning UI muestra las ordenes rechazadas con labels UPPERCASE y razon accionable.
- Event shape `robot/job.submitted` intacto (RESEARCH Pitfall 4 respetado).
- Robot Railway no tocado (REGLA 6 — el filtro es 100% server-side Next.js).
- `npx tsc --noEmit` global limpio.
- Push a `origin main` realizado (REGLA 1).
- Plan 03 (Wave 2, paralelo) puede correr concurrentemente — no hay conflicto de archivos (este plan toca `comandos.ts` + `comandos-layout.tsx` + `command-output.tsx`; plan 03 toca `normalize-order-data.ts` + `generate-envia-excel.ts` + `robot-orchestrator.ts`).
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-verificar-combinacion-productos/02-SUMMARY.md` con:
- Resumen del filtro implementado + ubicacion (linea post-fetch, pre-validateCities).
- Lista de campos nuevos en SubirOrdenesResult.
- Union `CommandMessage` extendida con field opcional `products?: string` + `originalCity?/resolvedCity?/department?` pasados a opcionales.
- Shape del early-return en "todas rechazadas" (confirmar que replica el precedente linea 309-322).
- Commit SHA del push a main.
- Confirmacion de que `npx tsc --noEmit` pasa.
- Deuda tecnica: ninguna esperada (si aparece algun `as any` o shape-mismatch documentarlo aqui).
- Nota para Wave 3 (Plan 04): el patron de filtro en comandos.ts es solo para Coord — los otros 3 flujos (Inter/Bogota/Envia) NO filtran; el flag se aplica visualmente.
</output>
</output>
