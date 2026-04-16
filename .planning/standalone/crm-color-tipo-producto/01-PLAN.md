---
phase: crm-color-tipo-producto
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/orders/product-types.ts
autonomous: true
requirements:
  - PT-01
  - PT-04
  - PT-06

must_haves:
  truths:
    - "Existe un modulo puro (sin JSX, sin React) que clasifica productos en 3 tipos: melatonina, ash, magnesio_forte"
    - "La deteccion prioriza SKU exacto y cae a substring del titulo como fallback"
    - "La funcion retorna null cuando el producto no matchea ningun tipo (safety net)"
    - "El orden de los tipos devueltos por detectOrderProductTypes es estable (melatonina -> ash -> magnesio_forte) y deduplicado"
    - "Los 10 SKUs confirmados por el usuario matchean correctamente (melatonina 8, ash 1, magnesio_forte 1)"
    - "El fallback por titulo captura 'magnesio forte', 'wagand', 'waghan', 'elixir' y 'melatonina' (case-insensitive)"
  artifacts:
    - path: "src/lib/orders/product-types.ts"
      provides: "ProductType type + PRODUCT_TYPE_COLORS map + SKU_TO_PRODUCT_TYPE map + detectProductType + detectOrderProductTypes"
      exports:
        - "ProductType"
        - "PRODUCT_TYPE_COLORS"
        - "SKU_TO_PRODUCT_TYPE"
        - "detectProductType"
        - "detectOrderProductTypes"
      contains: "export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'"
  key_links:
    - from: "src/lib/orders/product-types.ts"
      to: "Tailwind JIT scanner"
      via: "Strings literales completos ('bg-green-500', 'bg-orange-500', 'bg-purple-500') en PRODUCT_TYPE_COLORS"
      pattern: "bg-(green|orange|purple)-500"
    - from: "SKU_TO_PRODUCT_TYPE"
      to: "NORMALIZED_SKU_MAP (modulo-nivel)"
      via: "Object.fromEntries con .trim().toLowerCase() una sola vez al cargar el modulo"
      pattern: "NORMALIZED_SKU_MAP"
---

<objective>
Crear el modulo puro `src/lib/orders/product-types.ts` que es fuente de verdad para la clasificacion visual de productos en las cards de orden del CRM Somnio.

Purpose: Centralizar (a) los tipos de producto, (b) el mapeo SKU -> tipo con los 10 SKUs reales confirmados por el usuario, (c) las clases Tailwind literales por tipo, y (d) las funciones puras `detectProductType` y `detectOrderProductTypes`. Sin React. Sin JSX. Sin mutaciones. Sin cambios de DB.

Output: Un archivo TypeScript de ~90-110 LOC con 5 exports listos para consumir desde `kanban-card.tsx` (Plan 02) y `columns.tsx` (Plan 03).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-color-tipo-producto/CONTEXT.md
@.planning/standalone/crm-color-tipo-producto/RESEARCH.md
@CLAUDE.md
@.claude/rules/code-changes.md

<interfaces>
<!-- Este plan CREA el contrato. Los planes 02 y 03 lo consumen. Estas son las exports que DEBEN existir al final. -->

```typescript
// src/lib/orders/product-types.ts

export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'

export const PRODUCT_TYPE_COLORS: Record<
  ProductType,
  { label: string; dotClass: string; bgClass: string; textClass: string }
>

export const SKU_TO_PRODUCT_TYPE: Record<string, ProductType>

export function detectProductType(product: {
  sku?: string | null
  title?: string | null
}): ProductType | null

export function detectOrderProductTypes(
  products: Array<{ sku?: string | null; title?: string | null }>
): ProductType[]
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear src/lib/orders/product-types.ts con tipos, mapas y funciones puras</name>
  <files>src/lib/orders/product-types.ts</files>

  <read_first>
    - .planning/standalone/crm-color-tipo-producto/CONTEXT.md (secciones "Decisions" #1, #2, #4, #5)
    - .planning/standalone/crm-color-tipo-producto/RESEARCH.md (secciones "Code Examples -> Full product-types.ts (template)" y "Common Pitfalls" #1, #3, #4)
    - src/lib/orders/types.ts (solo para ver que `OrderProduct` existe — NO es necesario importarlo, el tipo de entrada es estructural)
    - src/lib/orders/constants.ts (para confirmar convencion de archivos en esta carpeta)
  </read_first>

  <behavior>
    - Test 1: `detectProductType({ sku: '001' })` retorna 'melatonina'
    - Test 2: `detectProductType({ sku: 'SOMNIO-90-CAPS' })` retorna 'melatonina'
    - Test 3: `detectProductType({ sku: '007' })` retorna 'ash'
    - Test 4: `detectProductType({ sku: '008' })` retorna 'magnesio_forte'
    - Test 5: `detectProductType({ sku: '  001  ' })` retorna 'melatonina' (trim)
    - Test 6: `detectProductType({ sku: 'SOMNIO-90-caps' })` retorna 'melatonina' (case-insensitive)
    - Test 7: `detectProductType({ sku: null, title: 'Magnesio Forte 60 caps' })` retorna 'magnesio_forte' (fallback titulo — primera regla)
    - Test 8: `detectProductType({ sku: null, title: 'ASWAGHANDA premium' })` retorna 'ash' (captura 'waghan')
    - Test 9: `detectProductType({ sku: null, title: 'Ashwagandha 500mg' })` retorna 'ash' (captura 'wagand')
    - Test 10: `detectProductType({ sku: null, title: 'Elixir del sueno' })` retorna 'melatonina' (captura 'elixir')
    - Test 11: `detectProductType({ sku: null, title: 'Melatonina 3mg' })` retorna 'melatonina' (captura 'melatonina')
    - Test 12: `detectProductType({ sku: null, title: 'Producto random' })` retorna null
    - Test 13: `detectProductType({ sku: '', title: '' })` retorna null (no crashea)
    - Test 14: `detectProductType({})` retorna null (campos opcionales)
    - Test 15: `detectOrderProductTypes([{ sku: '001' }, { sku: '007' }])` retorna `['melatonina', 'ash']` (orden estable)
    - Test 16: `detectOrderProductTypes([{ sku: '007' }, { sku: '001' }])` retorna `['melatonina', 'ash']` (orden estable independiente del input)
    - Test 17: `detectOrderProductTypes([{ sku: '001' }, { sku: '001' }])` retorna `['melatonina']` (dedupe)
    - Test 18: `detectOrderProductTypes([])` retorna `[]` (array vacio)
    - Test 19: `detectOrderProductTypes([{ sku: null, title: null }])` retorna `[]` (sin match)
  </behavior>

  <action>
Crear el archivo `src/lib/orders/product-types.ts` con EXACTAMENTE esta estructura y estos valores. No inferir, no improvisar — los SKUs y las reglas de fallback vienen del usuario y deben ser literales.

```typescript
// src/lib/orders/product-types.ts
/**
 * Clasificacion visual de tipos de producto para cards de CRM.
 *
 * Deteccion derivada en render (sin cambios de schema de DB).
 * Workspace objetivo: Somnio. Tipos: melatonina, ash, magnesio_forte.
 *
 * Prioridad de deteccion:
 *   1. SKU exacto (normalizado: trim + lowercase) contra SKU_TO_PRODUCT_TYPE
 *   2. Fallback por substring en titulo (case-insensitive), orden:
 *      magnesio forte -> wagand/waghan -> elixir/melatonina
 *   3. null (sin match)
 */

// Tailwind static classes used by PRODUCT_TYPE_COLORS (do NOT remove):
// bg-green-500 bg-orange-500 bg-purple-500
// bg-green-500/10 bg-orange-500/10 bg-purple-500/10
// text-green-600 text-orange-600 text-purple-600

export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'

/** Orden estable para renderizado de multiples dots en una card. */
const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  'melatonina',
  'ash',
  'magnesio_forte',
] as const

/**
 * Clases Tailwind COMPLETAS (literales) por tipo.
 * IMPORTANTE (Tailwind v4 JIT): No construir dinamicamente — el scanner no las detectaria.
 */
export const PRODUCT_TYPE_COLORS: Record<
  ProductType,
  { label: string; dotClass: string; bgClass: string; textClass: string }
> = {
  melatonina: {
    label: 'Melatonina',
    dotClass: 'bg-green-500',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-600',
  },
  ash: {
    label: 'Ash',
    dotClass: 'bg-orange-500',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-600',
  },
  magnesio_forte: {
    label: 'Magnesio Forte',
    dotClass: 'bg-purple-500',
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-600',
  },
}

/**
 * Mapeo explicito SKU -> tipo (10 entradas confirmadas por el usuario).
 * Las keys se normalizan automaticamente (trim + lowercase) al hacer match.
 * Fuente: decision del usuario — capturada en CONTEXT de planning.
 */
export const SKU_TO_PRODUCT_TYPE: Record<string, ProductType> = {
  // Melatonina (Somnio)
  '001': 'melatonina',
  '002': 'melatonina',
  '003': 'melatonina',
  '010': 'melatonina',
  '011': 'melatonina',
  'SOMNIO-90-CAPS': 'melatonina',
  'SOMNIO-90-CAPS-X2': 'melatonina',
  'SOMNIO-90-CAPS-X3': 'melatonina',
  // Ash
  '007': 'ash',
  // Magnesio Forte
  '008': 'magnesio_forte',
}

/** Pre-computado modulo-nivel: SKUs normalizados para lookup O(1). */
const NORMALIZED_SKU_MAP: Record<string, ProductType> = Object.fromEntries(
  Object.entries(SKU_TO_PRODUCT_TYPE).map(([k, v]) => [
    k.trim().toLowerCase(),
    v,
  ])
)

/**
 * Normaliza un SKU para lookup (trim + lowercase).
 * Tolera null/undefined -> retorna string vacio.
 */
function normalizeSku(sku: string | null | undefined): string {
  return (sku ?? '').trim().toLowerCase()
}

/**
 * Fallback por titulo: reglas del usuario (CONTEXT).
 * ORDEN IMPORTA — primer match gana.
 *
 * Reglas:
 *   1. 'magnesio forte' -> magnesio_forte
 *   2. 'wagand' OR 'waghan' -> ash (captura Ashwagandha y typo ASWAGHANDA)
 *   3. 'elixir' OR 'melatonina' -> melatonina
 *
 * Nota importante: esta regla se desvia deliberadamente del RESEARCH.md
 * (que proponia /\bash\b/i). El usuario eligio capturar 'wagand'/'waghan'
 * porque Somnio vende Ashwagandha y lo clasifica como tipo 'ash'.
 */
function detectByTitle(title: string): ProductType | null {
  const lower = title.toLowerCase()
  if (lower.includes('magnesio forte')) return 'magnesio_forte'
  if (lower.includes('wagand') || lower.includes('waghan')) return 'ash'
  if (lower.includes('elixir') || lower.includes('melatonina')) return 'melatonina'
  return null
}

/**
 * Clasifica UN producto por SKU exacto primero, titulo como fallback.
 * Retorna null si no hay match (el producto no tendra dot).
 */
export function detectProductType(product: {
  sku?: string | null
  title?: string | null
}): ProductType | null {
  // Paso 1: SKU exacto (normalizado)
  const sku = normalizeSku(product.sku)
  if (sku && NORMALIZED_SKU_MAP[sku]) {
    return NORMALIZED_SKU_MAP[sku]
  }

  // Paso 2: Fallback por titulo
  const title = product.title ?? ''
  if (title) {
    const byTitle = detectByTitle(title)
    if (byTitle) return byTitle
  }

  return null
}

/**
 * Dada una orden, retorna los tipos unicos presentes en orden estable.
 * Dedupea multiples productos del mismo tipo.
 *
 * @example
 *   detectOrderProductTypes([{ sku: '007' }, { sku: '001' }])
 *   // => ['melatonina', 'ash']  (orden estable definido en PRODUCT_TYPE_ORDER)
 */
export function detectOrderProductTypes(
  products: Array<{ sku?: string | null; title?: string | null }>
): ProductType[] {
  const found = new Set<ProductType>()
  for (const p of products) {
    const t = detectProductType(p)
    if (t) found.add(t)
  }
  return PRODUCT_TYPE_ORDER.filter((t) => found.has(t))
}
```

Puntos criticos de implementacion:

1. **Tailwind JIT (CRITICO):** Las clases `bg-green-500`, `bg-orange-500`, `bg-purple-500`, `bg-green-500/10`, `bg-orange-500/10`, `bg-purple-500/10`, `text-green-600`, `text-orange-600`, `text-purple-600` DEBEN estar como strings literales completos en el archivo. Tailwind v4 escanea el fuente, no el runtime. El comentario "cookie" al tope del archivo las declara literalmente como safety net, aunque tambien viven literales en el map.

2. **Reglas de fallback — DIFERENTES del RESEARCH:** Seguir el orden y patterns del usuario (listados en `detectByTitle`), NO el regex `\bash\b` del research. El comentario en el codigo lo documenta para futuros lectores.

3. **Normalizacion SKU:** Usar `.trim().toLowerCase()` antes de comparar. El pre-compute `NORMALIZED_SKU_MAP` es modulo-nivel (fuera de la funcion) — se computa una sola vez.

4. **Sin React / sin JSX:** Este archivo es puro TypeScript. No importa nada de React. Se puede consumir desde server components tambien si algun dia se necesita.

5. **No agregar tests automatizados en este task:** El stack no tiene Vitest/Jest instalado (confirmado en RESEARCH.md seccion "Validation Architecture"). Verificacion es manual via los acceptance_criteria abajo y via integracion en Plans 02/03.
  </action>

  <verify>
    <automated>MISSING — stack sin Vitest/Jest. Verificacion via grep + dev server + node REPL one-liner.</automated>
  </verify>

  <acceptance_criteria>
    - Archivo existe: `test -f src/lib/orders/product-types.ts`
    - Exports correctos:
      - `grep -q "export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'" src/lib/orders/product-types.ts`
      - `grep -q "export const PRODUCT_TYPE_COLORS" src/lib/orders/product-types.ts`
      - `grep -q "export const SKU_TO_PRODUCT_TYPE" src/lib/orders/product-types.ts`
      - `grep -q "export function detectProductType" src/lib/orders/product-types.ts`
      - `grep -q "export function detectOrderProductTypes" src/lib/orders/product-types.ts`
    - Clases Tailwind literales presentes:
      - `grep -q "bg-green-500" src/lib/orders/product-types.ts`
      - `grep -q "bg-orange-500" src/lib/orders/product-types.ts`
      - `grep -q "bg-purple-500" src/lib/orders/product-types.ts`
    - Los 10 SKUs literales presentes:
      - `grep -q "'001': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'002': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'003': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'010': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'011': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'SOMNIO-90-CAPS': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'SOMNIO-90-CAPS-X2': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'SOMNIO-90-CAPS-X3': 'melatonina'" src/lib/orders/product-types.ts`
      - `grep -q "'007': 'ash'" src/lib/orders/product-types.ts`
      - `grep -q "'008': 'magnesio_forte'" src/lib/orders/product-types.ts`
    - Reglas de fallback por titulo presentes:
      - `grep -q "includes('magnesio forte')" src/lib/orders/product-types.ts`
      - `grep -q "includes('wagand')" src/lib/orders/product-types.ts`
      - `grep -q "includes('waghan')" src/lib/orders/product-types.ts`
      - `grep -q "includes('elixir')" src/lib/orders/product-types.ts`
      - `grep -q "includes('melatonina')" src/lib/orders/product-types.ts`
    - Pre-compute modulo-nivel presente:
      - `grep -q "NORMALIZED_SKU_MAP" src/lib/orders/product-types.ts`
    - Sin React ni JSX:
      - `grep -qv "from 'react'" src/lib/orders/product-types.ts` (NO debe importar React)
      - `grep -qv "jsx" src/lib/orders/product-types.ts`
    - Compila sin errores (dev server):
      - `npm run dev` inicia sin errores de TypeScript mencionando `product-types.ts`
      - `npx tsc --noEmit` no reporta errores en `src/lib/orders/product-types.ts`
    - Verificacion funcional via node (opcional pero recomendado):
      ```bash
      # Compilar y ejecutar tests behavior desde node REPL:
      npx tsx -e "import { detectProductType, detectOrderProductTypes } from './src/lib/orders/product-types'; console.log(detectProductType({ sku: '001' }) === 'melatonina' ? 'OK' : 'FAIL'); console.log(detectProductType({ sku: null, title: 'ASWAGHANDA' }) === 'ash' ? 'OK' : 'FAIL'); console.log(JSON.stringify(detectOrderProductTypes([{ sku: '007' }, { sku: '001' }])) === '[\"melatonina\",\"ash\"]' ? 'OK' : 'FAIL');"
      ```
  </acceptance_criteria>

  <done>
    - El archivo `src/lib/orders/product-types.ts` existe y exporta los 5 simbolos listados.
    - Los 10 SKUs del usuario estan literales en el mapa.
    - Las reglas de fallback por titulo son las del usuario (magnesio forte -> wagand/waghan -> elixir/melatonina), NO las del RESEARCH.
    - Las clases Tailwind (`bg-green-500`, `bg-orange-500`, `bg-purple-500`, y variantes `/10` + `text-*-600`) estan como strings literales completos.
    - `npx tsc --noEmit` pasa sin errores nuevos en este archivo.
    - Commit atomico: `feat(crm-color-tipo-producto): agregar modulo product-types con deteccion SKU + titulo`.
  </done>
</task>

</tasks>

<verification>
- Leer `src/lib/orders/product-types.ts` y verificar los 5 exports, los 10 SKUs literales, las 5 reglas de substring por titulo, y las 9 clases Tailwind literales.
- Correr `npx tsc --noEmit` — sin errores nuevos.
- Opcional: correr el one-liner `tsx` de acceptance_criteria para verificar behavior.
</verification>

<success_criteria>
- El modulo `product-types.ts` es fuente de verdad y puede consumirse desde cualquier componente cliente.
- Los 10 SKUs confirmados por el usuario son detectados correctamente (verificacion manual con el one-liner).
- El fallback por titulo clasifica correctamente: "Magnesio Forte 60 caps" -> magnesio_forte, "ASWAGHANDA premium" -> ash, "Elixir del sueno" -> melatonina.
- El archivo compila sin errores de TypeScript.
- No se agregaron dependencias nuevas (package.json sin cambios).
- Commit creado con mensaje descriptivo en espanol + Co-Authored-By.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-color-tipo-producto/01-SUMMARY.md` con:
- Resumen del archivo creado
- Los 10 SKUs mapeados (lista)
- Las 5 reglas de fallback por titulo
- Decisiones tecnicas (pre-compute modulo-nivel, orden de reglas, tailwind literals)
- Deuda tecnica abierta (ninguna esperada)
- Commit SHA
</output>
