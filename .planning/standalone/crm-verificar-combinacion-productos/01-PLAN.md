---
phase: crm-verificar-combinacion-productos
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/orders/product-types.ts
  - src/lib/domain/orders.ts
  - src/lib/pdf/types.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "`src/lib/orders/product-types.ts` exporta `isSafeForCoord`, `isMixedOrder`, `formatProductLabels` y un mapa `DISPLAY_LABELS` en MAYUSCULAS (ELIXIR / ASHWAGANDHA / MAGNESIO FORTE)"
    - "`isSafeForCoord(['melatonina']) === true` y `isSafeForCoord([]) === false` (las ordenes sin clasificar se tratan como mixed/flag)"
    - "`formatProductLabels([])` retorna 'SIN CLASIFICAR'; `formatProductLabels(['melatonina','ash'])` retorna 'ELIXIR + ASHWAGANDHA' (orden estable per `PRODUCT_TYPE_ORDER`)"
    - "`getOrdersByStage` selecciona `order_products(sku, title, quantity)` y el `.map()` retorna productos con `{ sku, title, quantity }`"
    - "`getOrdersForGuideGeneration` selecciona `order_products(sku, title, quantity)` y el `.map()` retorna productos con `{ sku, title, quantity }`"
    - "`OrderForDispatch.products`, `OrderForGuideGen.products` y `GuideGenOrder.products` tienen shape `Array<{ sku: string | null; title: string | null; quantity: number }>`"
    - "`npx tsc --noEmit` pasa sin errores nuevos — todos los call-sites consumidores siguen compilando"
  artifacts:
    - path: "src/lib/orders/product-types.ts"
      provides: "Helpers de clasificacion central: isSafeForCoord, isMixedOrder, formatProductLabels + DISPLAY_LABELS"
      exports:
        - "isSafeForCoord"
        - "isMixedOrder"
        - "formatProductLabels"
      contains: "export function isSafeForCoord"
    - path: "src/lib/domain/orders.ts"
      provides: "Queries Supabase con sku+title incluidos para soportar detectOrderProductTypes"
      contains: "order_products(sku, title, quantity)"
    - path: "src/lib/pdf/types.ts"
      provides: "GuideGenOrder con products ricos (sku/title/quantity)"
      contains: "products: Array<{ sku: string | null; title: string | null; quantity: number }>"
  key_links:
    - from: "src/lib/orders/product-types.ts"
      to: "src/lib/domain/orders.ts"
      via: "detectOrderProductTypes consume {sku, title, quantity} que ahora si se selecciona en las 2 queries"
      pattern: "order_products\\(sku, title, quantity\\)"
    - from: "src/lib/domain/orders.ts"
      to: "src/lib/pdf/types.ts"
      via: "GuideGenOrder.products shape en lockstep con OrderForGuideGen.products"
      pattern: "sku: string \\| null; title: string \\| null; quantity: number"
---

<objective>
Unblock el pipeline de clasificacion de productos extendiendo `src/lib/orders/product-types.ts` con los helpers centrales (`isSafeForCoord`, `isMixedOrder`, `formatProductLabels`, `DISPLAY_LABELS`) Y ampliando las 2 queries del domain layer para que carguen `sku, title` (no solo `quantity`).

Purpose: Sin este plan, `detectOrderProductTypes(order.products)` retorna `[]` para TODA orden en los 4 flujos de generacion de guias (RESEARCH Pitfall 1). Este plan es prerequisito bloqueante de los Waves 2 y 3. Tambien crea la fuente de verdad unica para labels/reglas que los 3 planes siguientes consumen.

Output: 3 archivos modificados. Helpers puros + 2 SELECT statements ampliados + actualizacion en lockstep de `GuideGenOrder.products` en `src/lib/pdf/types.ts`. Cero cambios de schema. Cero dependencias nuevas. Todo el codebase compila sin regresion.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-verificar-combinacion-productos/CONTEXT.md
@.planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md
@CLAUDE.md
@.claude/rules/code-changes.md
@.claude/rules/gsd-workflow.md
@src/lib/orders/product-types.ts

<interfaces>
<!-- Este plan ESTABLECE los contratos que Waves 2 y 3 consumen. -->

```typescript
// src/lib/orders/product-types.ts — EXPORTS NUEVOS

const DISPLAY_LABELS: Record<ProductType, string> = {
  melatonina: 'ELIXIR',
  ash: 'ASHWAGANDHA',
  magnesio_forte: 'MAGNESIO FORTE',
}

export function isSafeForCoord(types: ProductType[]): boolean
// true SOLO si types.length === 1 && types[0] === 'melatonina'

export function isMixedOrder(types: ProductType[]): boolean
// !isSafeForCoord(types) — [] se trata como mixed/flag

export function formatProductLabels(types: ProductType[]): string
// [] -> 'SIN CLASIFICAR'
// ['melatonina'] -> 'ELIXIR'
// ['melatonina','ash'] -> 'ELIXIR + ASHWAGANDHA'
// orden estable per PRODUCT_TYPE_ORDER (ya garantizado por detectOrderProductTypes)
```

```typescript
// src/lib/domain/orders.ts — SHAPES ACTUALIZADOS

export interface OrderForDispatch {
  // ...campos existentes sin cambio
  products: Array<{ sku: string | null; title: string | null; quantity: number }> // CAMBIO
  // ...
}

export interface OrderForGuideGen {
  // ...campos existentes sin cambio
  products: Array<{ sku: string | null; title: string | null; quantity: number }> // CAMBIO
  // ...
}
```

```typescript
// src/lib/pdf/types.ts — GuideGenOrder en lockstep

export interface GuideGenOrder {
  // ...campos existentes
  products: Array<{ sku: string | null; title: string | null; quantity: number }> // CAMBIO
  // ...
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extender product-types.ts con helpers centrales y DISPLAY_LABELS</name>
  <files>src/lib/orders/product-types.ts</files>

  <read_first>
    - src/lib/orders/product-types.ts (archivo COMPLETO — para no duplicar imports, mantener estilo, y respetar `PRODUCT_TYPE_ORDER` existente)
    - .planning/standalone/crm-verificar-combinacion-productos/CONTEXT.md (Decision #4 "Helper central de deteccion")
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Code Examples -> Example 6: Helpers to add to `product-types.ts`")
  </read_first>

  <behavior>
    - Test 1: `isSafeForCoord(['melatonina'])` === true
    - Test 2: `isSafeForCoord(['ash'])` === false
    - Test 3: `isSafeForCoord(['magnesio_forte'])` === false
    - Test 4: `isSafeForCoord(['melatonina','ash'])` === false
    - Test 5: `isSafeForCoord(['melatonina','magnesio_forte'])` === false
    - Test 6: `isSafeForCoord([])` === false (sin clasificar = flag)
    - Test 7: `isMixedOrder([])` === true (sin clasificar = mixed)
    - Test 8: `isMixedOrder(['melatonina'])` === false
    - Test 9: `isMixedOrder(['ash'])` === true
    - Test 10: `formatProductLabels([])` === 'SIN CLASIFICAR'
    - Test 11: `formatProductLabels(['melatonina'])` === 'ELIXIR'
    - Test 12: `formatProductLabels(['ash'])` === 'ASHWAGANDHA'
    - Test 13: `formatProductLabels(['magnesio_forte'])` === 'MAGNESIO FORTE'
    - Test 14: `formatProductLabels(['melatonina','ash'])` === 'ELIXIR + ASHWAGANDHA'
    - Test 15: `formatProductLabels(['melatonina','ash','magnesio_forte'])` === 'ELIXIR + ASHWAGANDHA + MAGNESIO FORTE'
  </behavior>

  <action>
APPEND (al final del archivo, DESPUES de la funcion `detectOrderProductTypes` ya existente) exactamente este bloque. NO tocar el codigo existente del archivo. NO renombrar `PRODUCT_TYPE_COLORS.label` (sigue siendo 'Melatonina'/'Ash'/'Magnesio Forte' para los dots del Kanban — eso es fase anterior). El nuevo mapa `DISPLAY_LABELS` es SEPARADO, con labels en MAYUSCULAS unicamente para UI de guias/mensajes Coord/Excel/PDF.

```typescript
// ============================================================================
// Helpers para deteccion de combinaciones en generacion de guias
// Agregados en standalone/crm-verificar-combinacion-productos Wave 1.
// ============================================================================

/**
 * Labels en MAYUSCULAS usados en UI de guias (Excel columna, mensaje Coord,
 * apartado PDF). Separado de `PRODUCT_TYPE_COLORS.label` que se usa en los
 * dots del Kanban (title-case).
 *
 * Fuente: decision del usuario en CONTEXT.md seccion "Decisions" #2.
 */
const DISPLAY_LABELS: Record<ProductType, string> = {
  melatonina: 'ELIXIR',
  ash: 'ASHWAGANDHA',
  magnesio_forte: 'MAGNESIO FORTE',
}

/**
 * true SOLO si la orden tiene unicamente Elixir (type 'melatonina').
 * Usado por el flujo Coordinadora para filtrar ordenes que pueden ir al robot.
 *
 * IMPORTANTE: `types === []` -> false (sin clasificar se trata como mixed por
 * precaucion — ver CONTEXT.md "Decisions" #1).
 */
export function isSafeForCoord(types: ProductType[]): boolean {
  return types.length === 1 && types[0] === 'melatonina'
}

/**
 * true si la orden es "mezcla problematica" (cualquier cosa distinta a Elixir puro).
 * Incluye `[]` (orden sin clasificar = flag).
 *
 * Simetrico con `isSafeForCoord`: `isMixedOrder = !isSafeForCoord`.
 */
export function isMixedOrder(types: ProductType[]): boolean {
  return !isSafeForCoord(types)
}

/**
 * Formatea los tipos presentes en una orden como string legible en MAYUSCULAS.
 *
 * Orden de labels: sigue `PRODUCT_TYPE_ORDER` (melatonina -> ash -> magnesio_forte)
 * lo cual esta garantizado por `detectOrderProductTypes` que ya filtra en ese orden.
 *
 * @example
 *   formatProductLabels([])                          -> 'SIN CLASIFICAR'
 *   formatProductLabels(['melatonina'])              -> 'ELIXIR'
 *   formatProductLabels(['melatonina','ash'])        -> 'ELIXIR + ASHWAGANDHA'
 *   formatProductLabels(['ash','magnesio_forte'])    -> 'ASHWAGANDHA + MAGNESIO FORTE'
 */
export function formatProductLabels(types: ProductType[]): string {
  if (types.length === 0) return 'SIN CLASIFICAR'
  return types.map((t) => DISPLAY_LABELS[t]).join(' + ')
}
```

Puntos criticos:

1. **NO reemplazar `PRODUCT_TYPE_COLORS.label`.** El campo `label` del mapa existente se usa en los dots/cards del Kanban (title-case: 'Ash', 'Melatonina', 'Magnesio Forte'). `DISPLAY_LABELS` es un mapa PARALELO con UPPERCASE para UI de guias — convivencia intencional, no redundancia.

2. **`DISPLAY_LABELS` es module-scoped (const, no export).** Solo se exporta `formatProductLabels` como API publica. Si algun dia otro consumidor necesita el mapa crudo, entonces se exporta — ahora no.

3. **El orden en `formatProductLabels` se respeta automaticamente** porque `detectOrderProductTypes` ya retorna los tipos filtrados por `PRODUCT_TYPE_ORDER`. No hay que re-ordenar. El test 15 confirma.

4. **Sin tests automatizados** (stack sin Vitest/Jest — RESEARCH seccion "Validation Architecture"). Los `<behavior>` de arriba son verificables via el one-liner `tsx` en acceptance_criteria.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "src/lib/orders/product-types\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - `grep -q "export function isSafeForCoord" src/lib/orders/product-types.ts`
    - `grep -q "export function isMixedOrder" src/lib/orders/product-types.ts`
    - `grep -q "export function formatProductLabels" src/lib/orders/product-types.ts`
    - `grep -q "const DISPLAY_LABELS" src/lib/orders/product-types.ts`
    - `grep -q "melatonina: 'ELIXIR'" src/lib/orders/product-types.ts`
    - `grep -q "ash: 'ASHWAGANDHA'" src/lib/orders/product-types.ts`
    - `grep -q "magnesio_forte: 'MAGNESIO FORTE'" src/lib/orders/product-types.ts`
    - `grep -q "'SIN CLASIFICAR'" src/lib/orders/product-types.ts`
    - **Assertion estructural del body de `isSafeForCoord`** (garantiza la semantica exacta, no solo la presencia del export):
      ```bash
      grep -q "return types.length === 1 && types\[0\] === 'melatonina'" src/lib/orders/product-types.ts
      ```
    - El archivo NO pierde los exports previos: `grep -c "^export" src/lib/orders/product-types.ts` >= 8 (ProductType + PRODUCT_TYPE_COLORS + SKU_TO_PRODUCT_TYPE + detectProductType + detectOrderProductTypes + isSafeForCoord + isMixedOrder + formatProductLabels)
    - `npx tsc --noEmit` no reporta errores nuevos mencionando `product-types.ts`
    - **Verificacion funcional exhaustiva via tsx one-liners** (cubre los 15 behaviors — cada assertion imprime `OK` o `FAIL: <caso>`):
      ```bash
      # Bloque 1 — isSafeForCoord (6 casos)
      npx tsx -e "import { isSafeForCoord } from './src/lib/orders/product-types'; console.log(isSafeForCoord(['melatonina']) === true ? 'OK isSafeForCoord[melatonina]=true' : 'FAIL isSafeForCoord[melatonina]');"
      npx tsx -e "import { isSafeForCoord } from './src/lib/orders/product-types'; console.log(isSafeForCoord(['ash']) === false ? 'OK isSafeForCoord[ash]=false' : 'FAIL isSafeForCoord[ash]');"
      npx tsx -e "import { isSafeForCoord } from './src/lib/orders/product-types'; console.log(isSafeForCoord(['magnesio_forte']) === false ? 'OK isSafeForCoord[magnesio_forte]=false' : 'FAIL isSafeForCoord[magnesio_forte]');"
      npx tsx -e "import { isSafeForCoord } from './src/lib/orders/product-types'; console.log(isSafeForCoord(['melatonina','ash']) === false ? 'OK isSafeForCoord[mel+ash]=false' : 'FAIL isSafeForCoord[mel+ash]');"
      npx tsx -e "import { isSafeForCoord } from './src/lib/orders/product-types'; console.log(isSafeForCoord(['melatonina','magnesio_forte']) === false ? 'OK isSafeForCoord[mel+mag]=false' : 'FAIL isSafeForCoord[mel+mag]');"
      npx tsx -e "import { isSafeForCoord } from './src/lib/orders/product-types'; console.log(isSafeForCoord([]) === false ? 'OK isSafeForCoord[]=false' : 'FAIL isSafeForCoord[]');"

      # Bloque 2 — isMixedOrder (3 casos)
      npx tsx -e "import { isMixedOrder } from './src/lib/orders/product-types'; console.log(isMixedOrder([]) === true ? 'OK isMixedOrder[]=true' : 'FAIL isMixedOrder[]');"
      npx tsx -e "import { isMixedOrder } from './src/lib/orders/product-types'; console.log(isMixedOrder(['melatonina']) === false ? 'OK isMixedOrder[melatonina]=false' : 'FAIL isMixedOrder[melatonina]');"
      npx tsx -e "import { isMixedOrder } from './src/lib/orders/product-types'; console.log(isMixedOrder(['ash']) === true ? 'OK isMixedOrder[ash]=true' : 'FAIL isMixedOrder[ash]');"

      # Bloque 3 — formatProductLabels (6 casos)
      npx tsx -e "import { formatProductLabels } from './src/lib/orders/product-types'; console.log(formatProductLabels([]) === 'SIN CLASIFICAR' ? 'OK fmt[]=SIN CLASIFICAR' : 'FAIL fmt[]');"
      npx tsx -e "import { formatProductLabels } from './src/lib/orders/product-types'; console.log(formatProductLabels(['melatonina']) === 'ELIXIR' ? 'OK fmt[mel]=ELIXIR' : 'FAIL fmt[mel]');"
      npx tsx -e "import { formatProductLabels } from './src/lib/orders/product-types'; console.log(formatProductLabels(['ash']) === 'ASHWAGANDHA' ? 'OK fmt[ash]=ASHWAGANDHA' : 'FAIL fmt[ash]');"
      npx tsx -e "import { formatProductLabels } from './src/lib/orders/product-types'; console.log(formatProductLabels(['magnesio_forte']) === 'MAGNESIO FORTE' ? 'OK fmt[mag]=MAGNESIO FORTE' : 'FAIL fmt[mag]');"
      npx tsx -e "import { formatProductLabels } from './src/lib/orders/product-types'; console.log(formatProductLabels(['melatonina','ash']) === 'ELIXIR + ASHWAGANDHA' ? 'OK fmt[mel+ash]=ELIXIR + ASHWAGANDHA' : 'FAIL fmt[mel+ash]');"
      npx tsx -e "import { formatProductLabels } from './src/lib/orders/product-types'; console.log(formatProductLabels(['ash','magnesio_forte']) === 'ASHWAGANDHA + MAGNESIO FORTE' ? 'OK fmt[ash+mag]=ASHWAGANDHA + MAGNESIO FORTE' : 'FAIL fmt[ash+mag]');"
      ```
      Los 15 comandos deben imprimir `OK ...` (ninguno debe imprimir `FAIL ...`). Si algun `FAIL` aparece, el caso especifico indica cual behavior esta roto.
  </acceptance_criteria>

  <done>
    - 3 helpers nuevos exportados + 1 mapa `DISPLAY_LABELS` module-scoped.
    - `PRODUCT_TYPE_COLORS` y `detectOrderProductTypes` existentes sin modificar.
    - `npx tsc --noEmit` pasa sin errores nuevos.
    - Los 15 one-liners tsx imprimen `OK ...` (cero `FAIL`).
    - Commit atomico pendiente (se hace al final del plan junto con tasks 2 y 3).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Ampliar SELECT statements en src/lib/domain/orders.ts para incluir sku + title</name>
  <files>src/lib/domain/orders.ts</files>

  <read_first>
    - src/lib/domain/orders.ts (lineas 1240-1310 = getOrdersByStage completa; lineas 1360-1462 = OrderForGuideGen interface + getOrdersForGuideGeneration completa)
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Common Pitfalls -> Pitfall 1" y "Code Examples -> Example 2")
    - .planning/standalone/crm-verificar-combinacion-productos/CONTEXT.md (seccion "Technical Scope" para confirmar que este es REGLA 3 compliant — es domain layer)
  </read_first>

  <action>
Hacer 4 cambios coordinados en `src/lib/domain/orders.ts`. NO tocar nada mas del archivo.

**Cambio 1 — Linea ~1254 (dentro de `getOrdersByStage`):**

Reemplazar el string de SELECT:
```typescript
// ANTES:
.select(
  'id, name, contact_id, shipping_address, shipping_city, shipping_department, total_value, custom_fields, contacts(name, phone, email), order_products(quantity)'
)
// DESPUES:
.select(
  'id, name, contact_id, shipping_address, shipping_city, shipping_department, total_value, custom_fields, contacts(name, phone, email), order_products(sku, title, quantity)'
)
```

**Cambio 2 — Linea ~1284-1297 (dentro de `getOrdersByStage`, dentro del `.map()`):**

Reemplazar el bloque:
```typescript
// ANTES:
const products = (row.order_products as unknown as Array<{ quantity: number }>) ?? []
// ...
products: products.map((p) => ({ quantity: p.quantity })),
// DESPUES:
const products = (row.order_products as unknown as Array<{
  sku: string | null
  title: string | null
  quantity: number
}>) ?? []
// ...
products: products.map((p) => ({
  sku: p.sku ?? null,
  title: p.title ?? null,
  quantity: p.quantity,
})),
```

**Cambio 3 — Interface `OrderForDispatch`:**

Localizar la declaracion de `OrderForDispatch` en el archivo (es la interface que `getOrdersByStage` retorna; usar `grep -n "interface OrderForDispatch" src/lib/domain/orders.ts` para encontrar la linea exacta) y cambiar:
```typescript
// ANTES:
products: Array<{ quantity: number }>
// DESPUES:
products: Array<{ sku: string | null; title: string | null; quantity: number }>
```

**Cambio 4 — Linea ~1399 (dentro de `getOrdersForGuideGeneration`):**

Reemplazar el string de SELECT:
```typescript
// ANTES:
.select(
  'id, name, shipping_address, shipping_city, shipping_department, total_value, custom_fields, contacts(name, phone), order_products(quantity)'
)
// DESPUES:
.select(
  'id, name, shipping_address, shipping_city, shipping_department, total_value, custom_fields, contacts(name, phone), order_products(sku, title, quantity)'
)
```

**Cambio 5 — Linea ~1439-1450 (dentro de `getOrdersForGuideGeneration`, dentro del `.map()`):**

Reemplazar el bloque:
```typescript
// ANTES:
const products = (row.order_products as unknown as Array<{ quantity: number }>) ?? []
// ...
products: products.map((p) => ({ quantity: p.quantity })),
// DESPUES:
const products = (row.order_products as unknown as Array<{
  sku: string | null
  title: string | null
  quantity: number
}>) ?? []
// ...
products: products.map((p) => ({
  sku: p.sku ?? null,
  title: p.title ?? null,
  quantity: p.quantity,
})),
```

**Cambio 6 — Interface `OrderForGuideGen` (linea ~1371):**

Cambiar:
```typescript
// ANTES:
products: Array<{ quantity: number }>
// DESPUES:
products: Array<{ sku: string | null; title: string | null; quantity: number }>
```

Puntos criticos:

1. **Schema de `order_products`** ya tiene columnas `sku text` y `title text` (confirmado en RESEARCH seccion "Runtime State Inventory" + domain/orders.ts:830-834). NO se requiere migracion — solo widen SELECT. REGLA 5 (migracion antes de deploy) NO aplica.

2. **REGLA 3 (Domain layer):** este es precisamente el patron domain-layer — la mutacion es conceptual (widening del read) pero se hace en `src/lib/domain/orders.ts` que es el lugar correcto. RESEARCH confirma.

3. **Backwards-compat:** cualquier consumidor que hoy solo lee `product.quantity` seguira funcionando — solo se AGREGAN campos nuevos opcionales (`sku | null`, `title | null`). No se rompe codigo existente.

4. **Impacto downstream:** hay un call-site en `src/inngest/functions/robot-orchestrator.ts:738` y `:934` que hace `products: o.products` pasando al normalizer. Ese se trata en Task 3 (ajuste de `GuideGenOrder.products`) — el shape debe quedar en lockstep.

5. **No tocar** `getOrdersPendingGuide` (linea ~1325). Esa funcion NO selecciona productos — no necesita cambios.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -E "src/lib/domain/orders\.ts" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - `grep -c "order_products(sku, title, quantity)" src/lib/domain/orders.ts` retorna `2` (uno por cada query modificada).
    - `grep -c "order_products(quantity)" src/lib/domain/orders.ts` retorna `0` (los strings viejos estan reemplazados).
    - `grep -c "Array<{ sku: string | null; title: string | null; quantity: number }>" src/lib/domain/orders.ts` retorna >= 2 (uno en cada interface).
    - `grep -q "sku: p.sku ?? null" src/lib/domain/orders.ts`
    - `grep -q "title: p.title ?? null" src/lib/domain/orders.ts`
    - `grep -c "Array<{ quantity: number }>" src/lib/domain/orders.ts` retorna `0` (NO quedan shapes viejos).
    - `npx tsc --noEmit` no reporta errores nuevos mencionando `orders.ts` (pueden existir errores en call-sites como robot-orchestrator.ts — eso se corrige en Task 3).
  </acceptance_criteria>

  <done>
    - 2 SELECT statements ampliados (getOrdersByStage + getOrdersForGuideGeneration).
    - 2 interfaces actualizadas (OrderForDispatch + OrderForGuideGen).
    - 2 `.map()` blocks actualizados para propagar sku/title.
    - Shape antiguo `Array<{ quantity: number }>` eliminado de este archivo.
    - Task 3 debe completarse ANTES de compilar limpio (robot-orchestrator.ts:738,934 usa `o.products` via spread; ajuste requerido en `GuideGenOrder.products`).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Actualizar GuideGenOrder.products en src/lib/pdf/types.ts en lockstep</name>
  <files>src/lib/pdf/types.ts</files>

  <read_first>
    - src/lib/pdf/types.ts (archivo completo — solo 40 lineas)
    - src/inngest/functions/robot-orchestrator.ts lineas 720-745 + 915-940 (2 call-sites donde `guideOrders` se construye con spread `products: o.products`) — para entender el flujo de datos y confirmar que el lockstep es suficiente
    - .planning/standalone/crm-verificar-combinacion-productos/RESEARCH.md (seccion "Common Pitfalls -> Pitfall 1" final, menciona el lockstep requerido)
  </read_first>

  <action>
Modificar unicamente la interface `GuideGenOrder` en `src/lib/pdf/types.ts`. `NormalizedOrder` y `EnviaOrderData` NO se tocan en Wave 1 (se tocan en Waves 2/3).

Reemplazar linea 11:

```typescript
// ANTES:
  products: Array<{ quantity: number }>
// DESPUES:
  products: Array<{ sku: string | null; title: string | null; quantity: number }>
```

El archivo completo tras el cambio queda:

```typescript
/** Input order data from domain layer (OrderForGuideGen shape) */
export interface GuideGenOrder {
  id: string
  name: string | null
  contactName: string | null
  contactPhone: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  totalValue: number
  products: Array<{ sku: string | null; title: string | null; quantity: number }>
  customFields: Record<string, unknown>
  tags: string[]
}

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

/** Envia Excel row data */
export interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
}
```

Puntos criticos:

1. **Lockstep obligatorio:** `robot-orchestrator.ts` linea 729-741 y 925-937 hace `products: o.products` donde `o: OrderForGuideGen` (tipo con `{sku, title, quantity}` tras Task 2). El destino es `guideOrders: GuideGenOrder[]`. Si `GuideGenOrder.products` sigue como `{quantity}`, TypeScript falla. Este task alinea los tipos.

2. **No tocar el prompt de Claude** (`normalize-order-data.ts` `buildNormalizationPrompt`). El prompt ya serializa `o.products` con `JSON.stringify` — llegaran `{sku, title, quantity}` en vez de solo `{quantity}`, pero Claude lo ignora porque las reglas del prompt no piden clasificar. Es data extra neutral.

3. **NO modificar `NormalizedOrder` ni `EnviaOrderData` en este plan.** Esos se tocan en Wave 3 (PDF) y Wave 2b (Excel) respectivamente. Mantener scope minimo.

4. **Tras este task, `npx tsc --noEmit` DEBE pasar sin errores nuevos globalmente** — incluyendo robot-orchestrator.ts. Si hay un error en robot-orchestrator.ts mencionando `products`, Task 2 o 3 tienen un problema de shape y hay que revisarlo antes de commit.
  </action>

  <verify>
    <automated>npx tsc --noEmit 2&gt;&amp;1 | grep -vE "^\s*$" | wc -l | tr -d ' '</automated>
  </verify>

  <acceptance_criteria>
    - `grep -q "products: Array<{ sku: string | null; title: string | null; quantity: number }>" src/lib/pdf/types.ts`
    - `grep -c "products: Array<{ quantity: number }>" src/lib/pdf/types.ts` retorna `0`
    - `NormalizedOrder` sigue SIN cambios — `grep -c "orderId: string" src/lib/pdf/types.ts` retorna `1`
    - `EnviaOrderData` sigue SIN cambios — `grep -c "municipio: string" src/lib/pdf/types.ts` retorna `1`
    - `npx tsc --noEmit` sale con exit code 0 (sin errores) — verificar con: `npx tsc --noEmit && echo OK_TYPECHECK || echo FAIL_TYPECHECK`
    - Especificamente NO hay error en robot-orchestrator.ts relacionado con `products`:
      - `npx tsc --noEmit 2>&1 | grep -E "robot-orchestrator\.ts.*products" | wc -l | tr -d ' '` retorna `0`
  </acceptance_criteria>

  <done>
    - `GuideGenOrder.products` alineado con `OrderForGuideGen.products`.
    - `npx tsc --noEmit` global pasa sin errores.
    - `NormalizedOrder` y `EnviaOrderData` SIN cambios (scope minimo).
    - Wave 1 completa. Commit atomico final: `feat(crm-verificar-combinacion-productos): helpers de clasificacion + ampliar SELECT sku/title en domain`.
    - Push a Vercel (REGLA 1): `git add src/lib/orders/product-types.ts src/lib/domain/orders.ts src/lib/pdf/types.ts && git commit -m "..." && git push origin main`.
    - Wave 2 (plans 02 y 03) puede arrancar en paralelo tras este commit.
  </done>
</task>

</tasks>

<verification>
- Los 3 helpers nuevos (`isSafeForCoord`, `isMixedOrder`, `formatProductLabels`) se exportan desde `product-types.ts` y los 15 one-liners `tsx` imprimen `OK ...` (ninguno `FAIL`).
- Las 2 queries de domain (`getOrdersByStage`, `getOrdersForGuideGeneration`) ahora seleccionan `order_products(sku, title, quantity)` — verificable con `grep -c "order_products(sku, title, quantity)" src/lib/domain/orders.ts` == 2.
- `GuideGenOrder.products` en `src/lib/pdf/types.ts` esta alineado con el shape de domain.
- `npx tsc --noEmit` pasa sin errores nuevos en todo el proyecto.
- Verificacion de integracion manual (opcional): en dev server, poner un `console.log(JSON.stringify(guideOrders[0].products))` temporal dentro del orchestrator y confirmar que los productos llegan con `{sku, title, quantity}` en vez de solo `{quantity}`.
</verification>

<success_criteria>
- Wave 1 desbloquea el pipeline: `detectOrderProductTypes(order.products)` ya NO retorna `[]` para toda orden (Pitfall 1 resuelto).
- Helpers centralizados listos para ser consumidos en Waves 2 y 3 — single source of truth para `isSafeForCoord`, `isMixedOrder`, `formatProductLabels`.
- Cero dependencias nuevas en `package.json`.
- Cero cambios de schema de DB.
- Cero modificaciones de `NormalizedOrder` o `EnviaOrderData` (esas se tocan en Waves siguientes).
- Compilacion TypeScript global limpia.
- Push a `origin main` realizado (REGLA 1).
- Plans 02 y 03 (Wave 2) pueden arrancar en paralelo sin conflictos de archivos.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-verificar-combinacion-productos/01-SUMMARY.md` con:
- Resumen de los 3 cambios (helpers + domain + lockstep types).
- SKUs verificados en runtime (si se corrio el one-liner tsx).
- Commit SHA del push a main.
- Confirmacion de que `npx tsc --noEmit` pasa sin errores.
- Deuda tecnica abierta: ninguna esperada.
- Nota para Waves 2/3: los helpers `isSafeForCoord`, `isMixedOrder`, `formatProductLabels` ya son importables desde `@/lib/orders/product-types`.
</output>
</output>
