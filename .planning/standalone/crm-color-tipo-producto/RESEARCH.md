# Standalone: CRM Color por Tipo de Producto — Research

**Researched:** 2026-04-16
**Domain:** React/Next.js 15 UI — derived visual classification in list views (Tailwind v4)
**Confidence:** HIGH

## Summary

Esta fase es de alcance minimo: un archivo puro nuevo (~80 LOC) y dos inserciones quirurgicas en componentes existentes. El stack ya tiene TODO lo necesario (cva, clsx/tailwind-merge via `cn()`, Radix Tooltip, Tailwind v4 en modo CSS-first). **No se requiere ninguna dependencia nueva.**

La discusion de "que libreria usar" es irrelevante para este scope — la decision correcta es hand-roll el archivo `product-types.ts` con constantes tipadas y un map estatico de SKU->tipo. Lo que si importa son 5 riesgos tecnicos concretos documentados en `## Common Pitfalls`:

1. **Tailwind v4 JIT + clases dinamicas** — concatenar strings como `` `bg-${color}-500` `` produce clases que el compilador NO detecta. El proyecto usa Tailwind v4 CSS-first (sin `tailwind.config.js`, sin `safelist`). Unica solucion valida: strings literales completos en un lookup object.
2. **SKU matching robusto** — Shopify SKUs pueden tener trailing whitespace, mayusculas, ser null, o tener sufijos de variante. El codigo debe normalizar antes de comparar contra el map.
3. **Accesibilidad** — dots de color solos fallan WCAG 1.4.1 (Use of Color). Obligatorio agregar `title` nativo + `aria-label` para screen readers y daltonicos.
4. **Memoizacion** — `detectOrderProductTypes` corre una vez por card por render. Con ~50 cards en un Kanban y 1-3 productos por orden, son ~150 ops de string matching por render. Es barato, pero `useMemo` por card es buena higiene y trivial de agregar.
5. **"ash" como palabra completa** — fallback `title.includes('ash')` capturaria "dash", "crash", "smash". Usar `\bash\b` con regex, no `.includes()`.

**Primary recommendation:** Escribir `src/lib/orders/product-types.ts` como modulo puro con `as const` maps + `ProductType` como literal union. En las cards, usar `<span className={PRODUCT_TYPE_COLORS[type].dotClass} title={label} aria-label={...} />` envuelto opcionalmente en `<Tooltip>` de Radix. No crear componente `<ProductTypeDot>` abstracto (YAGNI para 3 tipos hardcoded) — un helper inline es suficiente.

## User Constraints (from CONTEXT.md)

### Decisiones Bloqueadas (del usuario)

1. **Deteccion hibrida** — Prioridad: (1) SKU exacto, (2) texto en titulo case-insensitive como fallback, (3) null (sin color). No invertir el orden.
2. **Sin cambios de schema de DB** — Nada de columna `product_type` en `order_products`. Nada de backfill. Deteccion 100% en render.
3. **Nuevo archivo obligatorio:** `src/lib/orders/product-types.ts` con las exports especificas listadas en CONTEXT.md seccion 2.
4. **Multiples tipos = multiples dots** — orden estable: melatonina -> ash -> magnesio_forte. Sin badge "MIXTO". Sin colapsar.
5. **Formato visual:** dots de ~8-10px (`h-2.5 w-2.5` o `h-2 w-2`) en la zona de summary de productos. Tooltip opcional.
6. **Colores Tailwind exactos:** `bg-green-500` (o `bg-emerald-500`) / `bg-orange-500` / `bg-purple-500`.
7. **Scope UI:** Solo `kanban-card.tsx` + `orders-table.tsx`. OUT: widget card, conversacion WhatsApp, contact-panel, view-order-sheet.
8. **"ash" como palabra completa** — no capturar "dash", "crash" en el fallback por titulo.

### Discrecion de Claude

- Eleccion de `green-500` vs `emerald-500` para melatonina (ambos aprobados).
- Implementacion exacta del tooltip: Radix `<Tooltip>` (disponible en el stack) vs `title` HTML nativo. Recomendacion abajo.
- Estructura interna de `PRODUCT_TYPE_COLORS` (ej: campos `dotClass`, `label`, `order`) — libertad total siempre que exporte lo listado en CONTEXT.md.
- Memoizacion: si usar `useMemo` por card o dejar computado inline (recomendacion abajo).
- Nombres de variables internas.

### Deferred Ideas (OUT OF SCOPE)

- Migracion de DB para columna `product_type`.
- Backfill de ordenes historicas.
- Widget card / vista de detalle.
- Vistas WhatsApp (`contact-panel.tsx`, `view-order-sheet.tsx`).
- UI para configurar tipos/colores (hardcoded por ahora).
- Aplicar colores a tags, filtros, reportes.
- Icono adicional por tipo.
- Modificar flujos de creacion de ordenes (Shopify webhook, action executor).
- Tests automatizados (stack no tiene Vitest/Jest instalado; Playwright inactivo en CRM).

## Project Constraints (from CLAUDE.md)

| Regla | Aplica | Comentario |
|-------|--------|------------|
| REGLA 1 (Push a Vercel) | SI | Commit atomico + push antes de pedir verificacion al usuario. |
| REGLA 2 (Zona horaria Colombia) | NO | No hay logica de fechas en este fix. |
| REGLA 3 (Domain layer) | NO | Fix 100% UI derivada, sin mutaciones. No se toca `src/lib/domain/`. |
| REGLA 4 (Docs actualizados) | SI | Al cerrar, actualizar `docs/analysis/04-estado-actual-plataforma.md` seccion Pedidos si aplica; dejar LEARNINGS en el standalone dir. |
| REGLA 5 (Migracion antes de deploy) | NO | Sin cambios de schema. |
| REGLA 6 (Proteger agente en prod) | NO | Este fix no toca comportamiento del agente Somnio. |
| Agent scope | NO | No es un agente; es UI derivada. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SKU/title -> ProductType clasificacion | Browser (pure function) | — | Deteccion barata derivada de datos ya cargados; no hay razon para poner esto en API/DB. |
| Renderizado de dots de color | Browser (React component) | — | Puro CSS + DOM; Tailwind classes estaticas. |
| Mapeo SKU -> tipo (tabla de verdad) | Shared client module (`src/lib/orders/`) | — | Co-localizado con otros utils de orders (`constants.ts`, `types.ts`); importable desde cualquier componente. |
| Accesibilidad (aria-label, title) | Browser (JSX attributes) | — | Propiedades nativas de DOM, no requieren tier backend. |

**Nota importante:** Este fix NO cruza boundaries de tier. Todo vive en el cliente porque los datos (`order.products[]`) ya estan hidratados via server component que pasa props a client components. Cualquier intento de mover esto a backend (ej: un campo computado en API) seria mover complejidad sin beneficio — y viola la decision #3 del CONTEXT.md.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PT-01 | Crear `src/lib/orders/product-types.ts` con `ProductType` type, `PRODUCT_TYPE_COLORS` map, `SKU_TO_PRODUCT_TYPE` map, y funciones `detectProductType` / `detectOrderProductTypes`. | Standard Stack y Code Examples documentan el patron exacto `as const` + literal union. |
| PT-02 | Modificar `kanban-card.tsx` entre lineas 132-141 para renderizar dots antes del texto del primer producto. | Insertion point exacto citado en Code Examples seccion "Kanban card integration". |
| PT-03 | Modificar `orders-table.tsx` columna 'Productos' (`columns.tsx:134-155`) para renderizar los mismos dots despues del contador. | Insertion point exacto citado en Code Examples seccion "Orders table integration". |
| PT-04 | Matching de SKU robusto (trim + toLowerCase) y fallback por titulo con regex para "ash" palabra completa. | Common Pitfalls seccion "SKU normalization" y "Word boundary matching". |
| PT-05 | Accesibilidad: cada dot debe tener `title` nativo y `aria-label`. | Common Pitfalls seccion "Color-only indicators fail WCAG". |
| PT-06 | El mapa `SKU_TO_PRODUCT_TYPE` debe llenarse con SKUs reales. En plan: query a `products` table (workspace Somnio) + revisar ultimas ordenes Shopify. | Open Questions seccion. |

## Standard Stack

### Core (already installed — NO new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.3 | Componentes cliente + `useMemo` | Ya en uso. |
| Tailwind CSS | 4.x | Clases utility (`bg-green-500`, `h-2.5 w-2.5`, `rounded-full`) | Tailwind v4 CSS-first via `@tailwindcss/postcss`. Config en `src/app/globals.css` (no hay `tailwind.config.ts`). |
| `clsx` + `tailwind-merge` via `cn()` | 2.1.1 / 3.4.0 | Composicion condicional de clases | Ya usado en todo el proyecto, re-exportado de `@/lib/utils`. |
| `class-variance-authority` (cva) | 0.7.1 | Sistema de variantes tipado | **Disponible pero innecesario para este scope.** Ver "Don't Hand-Roll" para razon. |
| `@radix-ui/react-tooltip` via `@/components/ui/tooltip` | 1.2.8 | Tooltip accesible (opcional) | Ya en el proyecto. Alternativa ligera: atributo HTML `title=""`. |
| `lucide-react` | 0.563.0 | Iconos (ya usado en `kanban-card.tsx`) | Ya en el componente. No requiere iconos adicionales para este fix. |

### No se necesita

| Paquete | Por que NO |
|---------|-----------|
| Nuevo paquete de color utility | Los 3 colores son Tailwind base classes — `bg-green-500`, `bg-orange-500`, `bg-purple-500`. |
| Libreria de tipos/estados | `type ProductType = 'melatonina' \| 'ash' \| 'magnesio_forte'` es TS nativo, zero deps. |
| Vitest/Jest | Stack no lo tiene instalado. CONTEXT.md confirma: sin tests automatizados, verificacion manual. |
| Fuse.js para fuzzy matching | Matching requerido es exact-SKU + substring-in-title. No es fuzzy. Agregar fuzzy introduce bugs (matchear "ashwagandha" con "ash" seria un falso positivo mas probable, no menos). |

### Version Verification

No se agregan dependencias nuevas. Todas las versiones listadas son las actuales de `package.json` al 2026-04-16 [VERIFIED: package.json].

**Installation:**
```bash
# No hay instalacion — todas las deps ya existen.
```

## Architecture Patterns

### System Architecture Diagram

```
                    ORDENES YA CARGADAS EN CLIENTE
                               |
                               v
                    +----------------------+
                    |  kanban-card.tsx     |       <-- componente cliente
                    |  orders-table.tsx    |           recibe OrderWithDetails
                    |  (map over cards)    |
                    +----------------------+
                               |
                               | order.products[]
                               v
                    +----------------------+
                    |  detectOrderProduct  |       <-- funcion pura (sync)
                    |  Types(products)     |           src/lib/orders/
                    |                      |           product-types.ts
                    |  para cada producto: |
                    |   1. SKU exacto      |
                    |   2. title substring |
                    |   3. null            |
                    |                      |
                    |  dedupe + sort       |
                    +----------------------+
                               |
                               | ProductType[]
                               v
                    +----------------------+
                    |  Render:             |       <-- JSX inline
                    |  types.map(t =>      |           dots con clase
                    |    <span ...         |           estatica del map
                    |      className=      |           PRODUCT_TYPE_COLORS
                    |      {COLORS[t]}/>)  |
                    +----------------------+
                               |
                               v
                       DOTS DE COLOR EN DOM
                       (con title / aria-label)
```

### Component Responsibilities

| File | Responsabilidad |
|------|-----------------|
| `src/lib/orders/product-types.ts` (NEW) | Tipos + mapas + funciones puras. Cero JSX. Cero React. |
| `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (MODIFY) | Llama `detectOrderProductTypes(order.products)` y renderiza dots en la seccion "Products summary" (linea 132-141 actual). |
| `src/app/(dashboard)/crm/pedidos/components/columns.tsx` (MODIFY) | Columna `products` (linea 134-155) llama la misma funcion y renderiza dots junto al contador. Nota: el archivo a modificar para la tabla es `columns.tsx`, NO `orders-table.tsx` — la tabla renderiza via `DataTable` con `createColumns(...)`. |

**CORRECCION a CONTEXT.md:** El CONTEXT menciona `orders-table.tsx` como archivo a modificar para la tabla, pero el renderizado de la columna de productos vive en `columns.tsx:134-155` (verificado via Read). `orders-table.tsx` solo ensambla filters, sheet, DataTable. El planner debe modificar `columns.tsx` para la fila de la tabla [VERIFIED: reading of both files].

### Pattern 1: `as const` Literal Union + Static Lookup Map

**What:** TypeScript idiom para enum-like strings con 100% type safety y cero runtime overhead.

**When to use:** Cuando hay un set cerrado conocido de strings (3 aqui) y se necesita un lookup rapido de metadata asociada.

**Example:**
```typescript
// src/lib/orders/product-types.ts

export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'

// Orden estable para renderizado de multiples dots en una card
const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  'melatonina',
  'ash',
  'magnesio_forte',
] as const

// Tailwind classes COMPLETAS y LITERALES (ver Common Pitfalls: JIT)
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

// Mapa explicito: SKU normalizado -> tipo
// Usuario debera llenar con SKUs reales (Shopify + tabla `products` interna)
export const SKU_TO_PRODUCT_TYPE: Record<string, ProductType> = {
  // TODO-llenar en planning: 'SOMNIO-MELA-30': 'melatonina',
  // TODO-llenar en planning: 'SOMNIO-ASH-60': 'ash',
  // TODO-llenar en planning: 'SOMNIO-MAG-60': 'magnesio_forte',
}

function normalizeSku(sku: string | null | undefined): string {
  return (sku ?? '').trim().toLowerCase()
}

// Regex de titulo — "ash" como palabra completa, resto como substring simple
const TITLE_PATTERNS: Array<{ type: ProductType; pattern: RegExp }> = [
  { type: 'melatonina', pattern: /melatonina/i },
  { type: 'ash', pattern: /\bash\b/i }, // evita 'dash', 'crash', 'ashwagandha'
  { type: 'magnesio_forte', pattern: /magnesio/i },
]

export function detectProductType(product: {
  sku?: string | null
  title?: string | null
}): ProductType | null {
  // Paso 1: SKU exacto normalizado
  const sku = normalizeSku(product.sku)
  if (sku) {
    const normalizedMap = Object.fromEntries(
      Object.entries(SKU_TO_PRODUCT_TYPE).map(([k, v]) => [normalizeSku(k), v])
    )
    if (normalizedMap[sku]) return normalizedMap[sku]
  }

  // Paso 2: Fallback por titulo
  const title = product.title ?? ''
  for (const { type, pattern } of TITLE_PATTERNS) {
    if (pattern.test(title)) return type
  }

  return null
}

export function detectOrderProductTypes(
  products: Array<{ sku?: string | null; title?: string | null }>
): ProductType[] {
  const found = new Set<ProductType>()
  for (const p of products) {
    const t = detectProductType(p)
    if (t) found.add(t)
  }
  // Retorna en orden estable definido
  return PRODUCT_TYPE_ORDER.filter((t) => found.has(t))
}
```

**Nota de optimizacion:** El `Object.fromEntries` dentro de `detectProductType` se ejecuta en cada llamada. Si el planner lo considera relevante, se puede pre-computar una vez como constante modulo-nivel. Para 3 SKUs no importa; si llega a 20+ SKUs si. Recomendacion: pre-computar desde el inicio, es una linea extra.

### Pattern 2: Componente inline con accessibility built-in

**What:** En lugar de crear un componente `<ProductTypeDot />` reusable, renderizar inline en cada call-site. Razon: solo 2 call-sites, 3 tipos hardcoded, abstraccion prematura.

**Example (inline render):**
```tsx
{types.map((type) => {
  const { label, dotClass } = PRODUCT_TYPE_COLORS[type]
  return (
    <span
      key={type}
      className={cn('h-2 w-2 rounded-full shrink-0', dotClass)}
      title={label}
      aria-label={`Tipo de producto: ${label}`}
      role="img"
    />
  )
})}
```

**Why inline, not `<ProductTypeDot>` component:**
- Scope es de 2 usos. Abstraer cuesta mas que repetir.
- El codebase ya tiene este patron (ver `src/components/tasks/create-task-button.tsx:395-401` con dots de prioridad inline).
- Si mas adelante se usa en un tercer lugar, refactor trivial.

### Anti-Patterns to Avoid

- **Dynamic Tailwind class building** (ver Common Pitfalls #1): NUNCA `` `bg-${color}-500` ``.
- **Componente abstracto `<ProductTypeBadge>`** con muchas props (`size`, `variant`, `withLabel`, `withIcon`): YAGNI. 3 tipos, 2 call-sites, hardcoded colores.
- **Backend computation del tipo**: viola decision #3 de CONTEXT.md. No hay razon tecnica para cruzar el boundary cliente/server para string matching trivial.
- **Re-exportar desde `src/lib/domain/`**: `product-types.ts` es UI-derived, no es una mutacion. Poner en `src/lib/orders/` (co-located con `constants.ts`, `types.ts`), NO en `src/lib/domain/`.
- **Tests de Vitest/Jest**: el stack no los tiene instalados. Instalar vitest solo por esta fase es scope creep.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Composicion condicional de classNames | String concat manual | `cn()` de `@/lib/utils` | Ya existe, usa `clsx + twMerge` correctamente. |
| Tooltip accesible (si se implementa) | `<div>` posicionado con CSS manual | `<Tooltip>` de `@/components/ui/tooltip` (Radix wrapper) | Maneja keyboard, portal, z-index, ARIA. Ya en el stack. |
| Literal type para enum | Enum de TypeScript (`enum ProductType`) | `type ProductType = 'a' \| 'b'` con `as const` | Enums de TS generan runtime code, son mal practicados en proyectos modernos. Literal unions son zero-cost y mas strict. |

## SHOULD Hand-Roll (this phase)

Esta es una seccion deliberada para contrabalancear "Don't Hand-Roll". Dado el scope minimo:

| Problem | Hand-Roll | Why |
|---------|-----------|-----|
| Mapa SKU->tipo | Objeto TS literal (`Record<string, ProductType>`) | 3 entradas esperadas, lookups O(1), zero runtime deps. |
| Funciones `detectProductType` / `detectOrderProductTypes` | ~30 LOC de logica pura en el archivo | Scope diminuto, cero dependencias externas justificadas. |
| Renderizado inline de dots | JSX inline en cada call-site | 2 call-sites, componente abstracto seria sobre-ingenieria. |
| Normalizacion de SKU | `(sku ?? '').trim().toLowerCase()` | Primitiva; no justifica libreria. |
| `class-variance-authority` para las variantes de color | NO usar cva aqui | cva brilla con 5+ variantes y estados (hover/disabled/size). Aqui hay un lookup plano de 3 claves. Map literal es mas legible. |

## Common Pitfalls

### Pitfall 1: Tailwind v4 JIT + clases dinamicas (CRITICAL)

**What goes wrong:** Codigo como `` <span className={`bg-${color}-500`} /> `` falla silenciosamente en produccion. El dot aparece transparente.

**Why it happens:** Tailwind (v3 JIT y v4 CSS-first igualmente) escanea codigo FUENTE para detectar strings literales de clases. No ejecuta JS. `bg-${color}-500` no existe como string literal en ningun archivo, por lo tanto el compilador no genera la regla CSS correspondiente.

**Context especifico al proyecto:**
- Este repo usa Tailwind v4 con config CSS-first en `src/app/globals.css` (verificado: `@import "tailwindcss"` con `@theme inline { ... }`) [VERIFIED: src/app/globals.css lines 1-47].
- **No existe `tailwind.config.ts` ni `tailwind.config.js`** [VERIFIED: Glob pattern `tailwind.config.*` returned no files].
- En Tailwind v4 la directiva para safelist explicito es `@source inline("bg-green-500")`, pero **no se esta usando en este proyecto** [VERIFIED: grep for `@source` in globals.css returned nothing].
- Las clases `bg-green-500`, `bg-orange-500`, `bg-purple-500`, `bg-emerald-500` YA se usan como strings literales en otros componentes del proyecto [VERIFIED: 10 occurrences across 9 files].

**How to avoid:**
1. Escribir la clase Tailwind COMPLETA como string literal en el codigo fuente. Si esta en un map object como `PRODUCT_TYPE_COLORS.melatonina.dotClass = 'bg-green-500'`, Tailwind lo detecta correctamente.
2. `cn('h-2 w-2 rounded-full', PRODUCT_TYPE_COLORS[type].dotClass)` funciona porque `'bg-green-500'` existe literal en el source.
3. NO hacer `` `bg-${PRODUCT_TYPE_COLORS[type].color}-500` `` — esto rompe el detector.

**Warning signs:** Un dot aparece con el tamano correcto pero transparente/sin color de fondo. Inspector de Chrome muestra `background-color: <empty>`.

**Defensive measure (opcional):** Si hay duda, agregar un comentario "cookie" al archivo:
```typescript
// Tailwind static classes used by PRODUCT_TYPE_COLORS (do NOT remove):
// bg-green-500 bg-orange-500 bg-purple-500
// bg-green-500/10 bg-orange-500/10 bg-purple-500/10
// text-green-600 text-orange-600 text-purple-600
```
Este comentario es redundante si las classes ya estan como strings literales en el map. Pero algunos linters pueden moverlos. Es cheap insurance.

### Pitfall 2: Color-only indicators fail WCAG 1.4.1

**What goes wrong:** Operadores daltonicos (rojo-verde, ~8% hombres) no distinguen verde/naranja. Operadores con monitores mal calibrados tampoco.

**Why it happens:** WCAG 1.4.1 (Use of Color) prohibe comunicar informacion SOLO via color.

**How to avoid:**
- Atributo `title="Melatonina"` en el span — muestra tooltip nativo en hover.
- Atributo `aria-label="Tipo de producto: Melatonina"` — para screen readers.
- `role="img"` en el span — indica que es contenido semantico, no decoracion.
- (Opcional stretch) Usar `<Tooltip>` de Radix para tooltip visual mas rico.

**Context especifico al proyecto:** Los tags actuales (`<TagBadge>`) tienen texto + color, asi que ya cumplen WCAG. Los dots solo tienen color — requieren aria/title.

**Warning signs:** Ninguno visible — es un bug de accesibilidad silencioso. Testear con modo daltonismo del DevTools de Chrome (Rendering > Emulate vision deficiencies > Protanopia/Deuteranopia).

### Pitfall 3: "ash" como substring captura falsos positivos

**What goes wrong:** `title.toLowerCase().includes('ash')` retorna `true` para:
- "Polvo dash energetico" (marca ficticia pero posible)
- "Ashwagandha 500mg" (MUY comun en suplementos de sueno — producto cercano semanticamente a melatonina, alta probabilidad de coexistir en el catalogo)
- "Smash protein bar"

**Why it happens:** String matching naive no respeta word boundaries.

**How to avoid:** Usar regex con `\b` (word boundary):
```typescript
/\bash\b/i.test(title)
```
Esto matchea "Ash 30 caps" pero NO "Ashwagandha" ni "Crash".

**Validation:** En planning, listar los titulos reales de productos Somnio para confirmar que el regex captura los deseados y rechaza los no deseados. Si Somnio vende ambos "Ash" y "Ashwagandha", el regex correcto ya los distingue — pero si vende "Ashwagandha Forte" y quiere clasificarlo como ash, esto cambia el requirement y debe re-discutirse.

**Warning signs:** Produccion muestra un dot naranja (ash) en ordenes que claramente son de otro producto. Log temporal de matches durante verificacion manual.

### Pitfall 4: SKU normalization

**What goes wrong:** Shopify SKUs tienen peculiaridades:
- Pueden ser `null` o `""` (producto sin SKU)
- Pueden tener trailing/leading whitespace (copiar-pegar de proveedores)
- Pueden variar en mayusculas (`"SOM-MELA-30"` vs `"som-mela-30"`)
- Pueden tener sufijos de variante (`"SOM-MELA-30-LARGE"`)

**How to avoid:**
- `normalizeSku(sku)` que hace `.trim().toLowerCase()` antes de comparar.
- El map `SKU_TO_PRODUCT_TYPE` tambien se normaliza al consultarlo.
- Para sufijos de variante: si Somnio NO usa variantes (el stack es por-producto), no se maneja. Si SI, el map debe listar cada variante explicitamente, o usar `startsWith` — decision del usuario en planning.

**Warning signs:** Ordenes de Shopify pasan por el path de fallback-por-titulo en lugar del path de SKU, funciona pero es fragil. Log de path usado durante verificacion.

### Pitfall 5: Memoizacion vs render cost

**What goes wrong:** No es un bug funcional — es overhead innecesario en Kanbans grandes.

**Why it happens:** `detectOrderProductTypes` corre en cada render del card. Si el Kanban tiene ~100 cards, son 100 ops por re-render. Cada op es O(P) donde P = productos por orden (~1-3). Total: ~100-300 string matches + 3 regex tests cada uno.

**Benchmark aproximado:** <1ms total en maquinas modernas. No es un bottleneck.

**How to avoid:** Si se quiere evitar completamente:
```tsx
const productTypes = React.useMemo(
  () => detectOrderProductTypes(order.products),
  [order.products]
)
```
Barato de agregar, imposible que empeore performance. Recomendacion: agregarlo por higiene, no por necesidad medida.

**Warning signs:** React DevTools Profiler muestra renders de cards > 2ms. Si sube, hay otros bugs mas grandes (el detect es ~100us). No perseguir esta optimizacion sin medir primero.

## Code Examples

### Full `product-types.ts` (template)

```typescript
// src/lib/orders/product-types.ts
/**
 * Clasificacion visual de tipos de producto para cards de CRM.
 *
 * Deteccion derivada en render (sin cambios de schema de DB).
 * Workspace objetivo: Somnio. Tipos: melatonina, ash, magnesio_forte.
 */

export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'

/** Orden estable para renderizado de multiples dots en una card. */
const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  'melatonina',
  'ash',
  'magnesio_forte',
] as const

/**
 * Clases Tailwind COMPLETAS (literales) por tipo.
 * IMPORTANTE: No construir dinamicamente — Tailwind JIT no las detectaria.
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
 * Mapeo explicito SKU -> tipo.
 * TODO-planning: llenar con SKUs reales de Somnio.
 * - SKUs de Shopify: query Shopify Admin API o revisar ultimas ordenes de Shopify en DB.
 * - SKUs del catalogo interno: query `products` donde `workspace_id = <somnio_id>`.
 *
 * Las keys se normalizan automaticamente (trim + lowercase) al hacer match.
 */
export const SKU_TO_PRODUCT_TYPE: Record<string, ProductType> = {
  // Llenar durante planning
}

// Pre-computa el map normalizado una sola vez (modulo-nivel)
const NORMALIZED_SKU_MAP: Record<string, ProductType> = Object.fromEntries(
  Object.entries(SKU_TO_PRODUCT_TYPE).map(([k, v]) => [
    k.trim().toLowerCase(),
    v,
  ])
)

/** Regex patterns para fallback por titulo. Orden importa (primer match gana). */
const TITLE_PATTERNS: Array<{ type: ProductType; pattern: RegExp }> = [
  { type: 'melatonina', pattern: /melatonina/i },
  { type: 'ash', pattern: /\bash\b/i }, // word boundary: rechaza "dash", "ashwagandha"
  { type: 'magnesio_forte', pattern: /magnesio/i },
]

function normalizeSku(sku: string | null | undefined): string {
  return (sku ?? '').trim().toLowerCase()
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
  for (const { type, pattern } of TITLE_PATTERNS) {
    if (pattern.test(title)) return type
  }

  return null
}

/**
 * Dada una orden, retorna los tipos unicos presentes en orden estable.
 * Dedupea multiples productos del mismo tipo.
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

### Kanban card integration

Archivo: `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`

**Insertion point (verificado):** lineas 132-141 contienen el bloque actual de "Products summary":

```tsx
{/* Products summary */}
{order.products.length > 0 && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
    <PackageIcon className="h-3.5 w-3.5" />
    <span className="truncate">
      {order.products.length === 1
        ? order.products[0].title
        : `${order.products[0].title} +${order.products.length - 1}`}
    </span>
  </div>
)}
```

**Patch propuesto:**
```tsx
// En la parte superior del componente KanbanCard (despues de useDraggable):
const productTypes = React.useMemo(
  () => detectOrderProductTypes(order.products),
  [order.products]
)

// Reemplazar el bloque "Products summary":
{order.products.length > 0 && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
    <PackageIcon className="h-3.5 w-3.5" />
    {/* Dots de tipo de producto */}
    {productTypes.length > 0 && (
      <div className="flex items-center gap-1 shrink-0">
        {productTypes.map((type) => {
          const { label, dotClass } = PRODUCT_TYPE_COLORS[type]
          return (
            <span
              key={type}
              className={cn('h-2 w-2 rounded-full shrink-0', dotClass)}
              title={label}
              aria-label={`Tipo de producto: ${label}`}
              role="img"
            />
          )
        })}
      </div>
    )}
    <span className="truncate">
      {order.products.length === 1
        ? order.products[0].title
        : `${order.products[0].title} +${order.products.length - 1}`}
    </span>
  </div>
)}
```

**Imports a agregar:**
```tsx
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
```

### Orders table integration

**Archivo real a modificar:** `src/app/(dashboard)/crm/pedidos/components/columns.tsx` (NO `orders-table.tsx` — esa solo orquesta el DataTable).

**Insertion point (verificado):** `columns.tsx:134-155`, columna `products`:

```tsx
{
  accessorKey: 'products',
  header: 'Productos',
  cell: ({ row }) => {
    const products = row.original.products
    if (!products || products.length === 0) {
      return <span className="text-muted-foreground">-</span>
    }
    return (
      <div className="flex items-center gap-2">
        <PackageIcon className="h-4 w-4 text-muted-foreground" />
        <div>
          <span className="font-medium">{products.length}</span>
          <span className="text-muted-foreground text-sm ml-1">
            {products.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>
      </div>
    )
  },
  enableSorting: false,
},
```

**Patch propuesto:**
```tsx
{
  accessorKey: 'products',
  header: 'Productos',
  cell: ({ row }) => {
    const products = row.original.products
    if (!products || products.length === 0) {
      return <span className="text-muted-foreground">-</span>
    }
    const productTypes = detectOrderProductTypes(products)
    return (
      <div className="flex items-center gap-2">
        <PackageIcon className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <span className="font-medium">{products.length}</span>
          <span className="text-muted-foreground text-sm">
            {products.length === 1 ? 'producto' : 'productos'}
          </span>
          {productTypes.length > 0 && (
            <div className="flex items-center gap-1 ml-1">
              {productTypes.map((type) => {
                const { label, dotClass } = PRODUCT_TYPE_COLORS[type]
                return (
                  <span
                    key={type}
                    className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`}
                    title={label}
                    aria-label={`Tipo de producto: ${label}`}
                    role="img"
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  },
  enableSorting: false,
},
```

**Nota sobre `cn` vs template literal:** `columns.tsx` actualmente no importa `cn`. Agregarlo es una linea; o usar template literal simple ya que las clases estan estaticas y no hay conflicto. Ambas son aceptables.

**Imports a agregar:**
```tsx
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
```

### Opcional: Con Radix Tooltip (stretch)

Si se prefiere tooltip rico sobre el `title` nativo (mejor UX en desktop, pero requiere `<TooltipProvider>` en el arbol):

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span
      className={cn('h-2 w-2 rounded-full shrink-0', dotClass)}
      aria-label={`Tipo de producto: ${label}`}
      role="img"
    />
  </TooltipTrigger>
  <TooltipContent>{label}</TooltipContent>
</Tooltip>
```

**Recomendacion:** Empezar con `title` nativo (zero setup, cumple accesibilidad). Upgradar a Radix Tooltip solo si el usuario lo pide en verificacion. Cost-benefit no justifica hacerlo up-front.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TS `enum ProductType` | `type ProductType = 'a' \| 'b'` con `as const` | TS 4.x+ | Zero-cost, mejor tree-shaking, mas strict. |
| `tailwind.config.js` con `safelist: []` | Tailwind v4 CSS-first con `@source inline(...)` o strings literales | Tailwind v4 (2025) | Este proyecto no usa ni una ni otra — depende 100% de strings literales en el source. |
| `@radix-ui/react-tooltip` con setup manual | Wrapper `@/components/ui/tooltip` con Provider + Trigger + Content | shadcn/ui moderno | Ya existe en el proyecto. |
| CSS-in-JS o styled-components | Tailwind + cva + cn() | Establecido | Proyecto ya en esta onda. |

**Deprecated / outdated (no usar):**
- `tailwindcss@3` config file — proyecto es v4, ignorar tutoriales de v3 sobre `tailwind.config.js`.
- `classnames` package — reemplazado por `clsx`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Shopify SKUs en el workspace Somnio no tienen sufijos de variante (un SKU unico por producto). | Common Pitfalls #4 | Si tienen variantes, el map SKU->tipo necesita entradas por variante o logica `startsWith`. Mitigable en planning con query a DB. |
| A2 | Somnio no vende "Ashwagandha" (producto distinto a "Ash"). | Common Pitfalls #3 | Si si lo vende, el regex `\bash\b` correctamente lo rechaza, pero el usuario debe confirmar que es el comportamiento deseado. Si quiere clasificar Ashwagandha como ash, el regex debe cambiar. |
| A3 | `columns.tsx:134-155` (columna `products`) es donde el usuario quiere los dots en la vista tabla — no en `orders-table.tsx:306` que solo monta el `DataTable`. | Component Responsibilities | Confirmado por lectura del codigo, pero CONTEXT.md menciona `orders-table.tsx`. Planner debe confirmar con el usuario si quiere los dots en la columna de productos o en otra parte. |
| A4 | El usuario prefiere `bg-green-500` sobre `bg-emerald-500` para melatonina — es discrecional. | User Constraints | Bajo riesgo; cambio de una linea. |
| A5 | `title` HTML nativo es suficiente para accesibilidad; `<Tooltip>` Radix es opcional. | Code Examples | Bajo riesgo. Si el usuario quiere tooltip visual rico, se upgrada en 1 paso. |

**Si esta tabla se queda vacia:** N/A — hay 5 supuestos explicitos arriba.

## Open Questions

1. **SKUs reales para el map `SKU_TO_PRODUCT_TYPE`**
   - What we know: CONTEXT.md confirma que se llena en planning/execution.
   - What's unclear: Los valores exactos.
   - Recommendation: En el primer task del plan, hacer query a `products` table filtrando por workspace Somnio, y mostrar al usuario las ultimas ~10 ordenes de Shopify en DB con sus SKUs. Usuario confirma/rechaza/agrega cada linea del map.

2. **Archivo exacto para la tabla: `orders-table.tsx` o `columns.tsx`?**
   - What we know: CONTEXT.md menciona `orders-table.tsx`. Pero `orders-table.tsx` delega a `DataTable` + `createColumns(...)`. El renderizado real esta en `columns.tsx:134-155`.
   - What's unclear: Si el usuario quiere otro tipo de cambio en `orders-table.tsx` (ej: un summary arriba de la tabla) o solo en la columna.
   - Recommendation: Asumir columna en `columns.tsx` (coherente con el Kanban). Planner debe confirmar en `/gsd:plan-phase` antes de implementar.

3. **Tamano de los dots: 8px (`h-2 w-2`) o 10px (`h-2.5 w-2.5`)?**
   - What we know: CONTEXT.md dice "~8-10px".
   - What's unclear: Preferencia exacta del usuario.
   - Recommendation: Usar `h-2 w-2` (8px) — consistente con los dots existentes en `task-form.tsx`, `task-filters.tsx`, `pipeline-tab.tsx` del proyecto [VERIFIED via grep]. Si el usuario pide mas grandes, cambio trivial.

4. **Tooltip Radix vs title nativo — cual implementar?**
   - Recommendation: empezar con `title` nativo. Upgradar a Radix en un segundo commit si el usuario lo pide en verificacion manual.

## Environment Availability

> Fase de UI puro. Sin dependencias externas.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | SI | Managed by Vercel | — |
| Next.js 16 | Build/dev | SI | 16.1.6 | — |
| Tailwind CSS v4 | Estilos | SI | ^4 | — |
| React 19 | Rendering | SI | 19.2.3 | — |
| Radix Tooltip (opcional) | UI stretch | SI | 1.2.8 | Atributo `title=""` nativo |

**Missing dependencies:** Ninguna.

## Validation Architecture

> Nota: `workflow.nyquist_validation` no esta explicitamente configurado. CONTEXT.md confirma: "Sin tests automatizados (stack no tiene Playwright/Cypress activos en CRM)". Esta fase NO agrega infra de testing (seria scope creep).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Ninguno instalado en el proyecto (ni Vitest, ni Jest, ni Playwright activo para este modulo) |
| Config file | N/A |
| Quick run command | N/A — verificacion manual |
| Full suite command | N/A — verificacion manual |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PT-01 | `detectProductType` retorna tipo correcto por SKU | manual | N/A | — |
| PT-01 | `detectProductType` retorna tipo correcto por titulo (fallback) | manual | N/A | — |
| PT-01 | `detectProductType` retorna null si no hay match | manual | N/A | — |
| PT-01 | `detectOrderProductTypes` dedupea + ordena estable | manual | N/A | — |
| PT-02 | Card Kanban muestra dots correctos | manual (Chrome devtools) | N/A | — |
| PT-03 | Tabla muestra dots en columna productos | manual | N/A | — |
| PT-04 | "ash" matchea "Ash 60 caps" pero no "Ashwagandha" | manual | N/A | — |
| PT-05 | Atributos `title` y `aria-label` presentes en cada dot | manual (inspeccion DOM) | N/A | — |

### Sampling Rate

- **Por task commit:** verificacion visual en `/crm/pedidos` con ordenes de prueba.
- **Por wave merge:** N/A (fase de 3 tasks).
- **Phase gate:** checklist de verificacion manual en CONTEXT.md seccion "Tests / verificacion".

### Wave 0 Gaps

- Ninguno. CONTEXT.md explicitamente descarta tests automatizados. Si el planner quiere agregar Vitest SOLO para `detectProductType`, debe consultar al usuario primero (scope creep potencial).

**Recomendacion alterna (NO bloqueante):** Si en el futuro se quiere blindaje, agregar Vitest en una fase separada, test solo funciones puras de `src/lib/orders/product-types.ts`. Pero NO en esta fase.

## Security Domain

> `security_enforcement` absent = enabled por default. Aplicabilidad revisada abajo.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | NO | Fase 100% UI derivada. No toca auth. |
| V3 Session Management | NO | No toca sesiones. |
| V4 Access Control | NO | Datos ya filtrados por workspace en queries existentes. Este fix solo renderiza lo que ya recibe. |
| V5 Input Validation | **MINIMAL** | Inputs son `sku` y `title` ya persistidos en DB. Riesgo de XSS via `title` es manejado por React (auto-escape JSX). Riesgo de ReDoS via regex: regex son simples (`/melatonina/i`, `/\bash\b/i`, `/magnesio/i`), no usan backtracking catastrofico. Seguro. |
| V6 Cryptography | NO | N/A. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via `title` o `sku` del producto | Tampering | React auto-escape en JSX (aplicado automaticamente al renderizar `{product.title}`). NO usar `dangerouslySetInnerHTML`. |
| ReDoS via patterns regex mal disenados | Denial | Patterns usados son simples, sin alternancia ambigua ni anidamiento cuantificado. Seguros. |
| Filtrado cross-workspace accidental | Info Disclosure | N/A — `detectProductType` es pura y no hace queries a DB. No puede filtrar mal. |

**Resumen:** Fase de bajisimo riesgo. Sin superficie de ataque nueva.

## Sources

### Primary (HIGH confidence)

- [VERIFIED: local file] `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` — lineas 1-210, insertion point en 132-141.
- [VERIFIED: local file] `src/app/(dashboard)/crm/pedidos/components/orders-table.tsx` — lineas 1-429, no contiene renderizado de productos (delega a `columns.tsx`).
- [VERIFIED: local file] `src/app/(dashboard)/crm/pedidos/components/columns.tsx` — columna `products` en lineas 134-155.
- [VERIFIED: local file] `src/lib/orders/types.ts:220-229` — interfaz `OrderProduct`.
- [VERIFIED: local file] `package.json` — stack verificado: Tailwind v4, React 19, clsx 2.1.1, tailwind-merge 3.4.0, cva 0.7.1, Radix Tooltip 1.2.8, sin Vitest/Jest.
- [VERIFIED: local file] `src/app/globals.css:1-80` — Tailwind v4 CSS-first config, `@theme inline {}`, sin `@source`, sin `safelist`.
- [VERIFIED: local file] `src/lib/utils.ts` — `cn()` usa `clsx + twMerge`.
- [VERIFIED: local file] `src/components/ui/tooltip.tsx` — Radix Tooltip wrapper disponible.
- [VERIFIED: grep] Clases `bg-green-500`, `bg-orange-500`, `bg-purple-500` ya se usan como strings literales en 10 ubicaciones del codigo, confirma que Tailwind las incluye en el bundle.
- [VERIFIED: glob] No existe `tailwind.config.ts` ni `tailwind.config.js` — proyecto es 100% CSS-first Tailwind v4.

### Secondary (MEDIUM confidence)

- [CITED: tailwindcss.com/docs/content-configuration] Principio de detection de classes via source scanning — Tailwind necesita strings literales completos.
- [CITED: web.dev/articles/color-and-contrast-accessibility] WCAG 1.4.1 Use of Color requiere informacion no-color-dependiente.

### Tertiary (LOW confidence)

- Ninguno. Toda la guia tecnica esta basada en lectura directa del codigo o docs oficiales.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verificado contra `package.json` y `globals.css`.
- Architecture: HIGH — patrones idiomaticos TS/React, insertion points verificados en codigo real.
- Pitfalls: HIGH — Tailwind JIT y WCAG son riesgos conocidos con evidencia reproducible; "ash" substring issue verificado logicamente.
- Code examples: HIGH — basados en codigo actual del repo + convenciones ya presentes.

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 dias — stack estable, no hay major version de Tailwind/React/Next prevista). Si se actualiza a Tailwind 5 o React 20, revisar.
