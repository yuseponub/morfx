---
phase: crm-color-tipo-producto
plan: 03
type: execute
wave: 2
depends_on:
  - 01
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/columns.tsx
autonomous: true
requirements:
  - PT-03
  - PT-05

must_haves:
  truths:
    - "En la tabla de /crm/pedidos (vista tabla), la columna 'Productos' muestra dots de color a la derecha del contador de productos"
    - "Los dots son consistentes con el Kanban: verde=melatonina, naranja=ash, morado=magnesio_forte"
    - "Orden estable: melatonina -> ash -> magnesio_forte cuando hay multiples tipos"
    - "Si ningun producto de la fila matchea, la celda renderiza como antes (icono + contador sin dots), sin crashear"
    - "Filas sin productos (`products.length === 0`) siguen renderizando '-' como antes"
    - "Cada dot tiene title + aria-label + role='img' (WCAG 1.4.1)"
    - "NOTA: se modifica columns.tsx (donde vive la cell de la columna), NO orders-table.tsx (que solo orquesta)"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/columns.tsx"
      provides: "Columna 'Productos' con dots de color derivados de detectOrderProductTypes"
      contains: "detectOrderProductTypes"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/columns.tsx"
      to: "src/lib/orders/product-types.ts"
      via: "import { detectOrderProductTypes, PRODUCT_TYPE_COLORS } from '@/lib/orders/product-types'"
      pattern: "from '@/lib/orders/product-types'"
    - from: "cell de columna 'products' (lineas 134-155)"
      to: "JSX dots"
      via: "productTypes.map((type) => <span className={cn('h-2 w-2 rounded-full shrink-0', PRODUCT_TYPE_COLORS[type].dotClass)} ... />)"
      pattern: "productTypes.map"
---

<objective>
Integrar los dots de tipo de producto en la vista tabla de `/crm/pedidos`, modificando la columna `products` en `columns.tsx` (NO `orders-table.tsx` — ese solo orquesta el DataTable).

Purpose: Paridad visual entre Kanban y Tabla. Operador obtiene la misma senalizacion de tipo de producto sin importar la vista que use.

Output: `columns.tsx` modificado con imports del nuevo modulo y los dots renderizados en la celda de la columna 'Productos' (lineas ~134-155).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-color-tipo-producto/CONTEXT.md
@.planning/standalone/crm-color-tipo-producto/RESEARCH.md
@.planning/standalone/crm-color-tipo-producto/01-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Exports del Plan 01 que este plan consume. -->

From src/lib/orders/product-types.ts (Plan 01):
```typescript
export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'

export const PRODUCT_TYPE_COLORS: Record<
  ProductType,
  { label: string; dotClass: string; bgClass: string; textClass: string }
>
// PRODUCT_TYPE_COLORS.melatonina.dotClass === 'bg-green-500'
// PRODUCT_TYPE_COLORS.ash.dotClass === 'bg-orange-500'
// PRODUCT_TYPE_COLORS.magnesio_forte.dotClass === 'bg-purple-500'

export function detectOrderProductTypes(
  products: Array<{ sku?: string | null; title?: string | null }>
): ProductType[]
```

Nota importante: `columns.tsx` actualmente NO importa `cn` de `@/lib/utils`. Opciones:
(A) Agregar import de `cn` (1 linea extra, consistente con kanban-card.tsx).
(B) Usar template literal simple `` `h-2 w-2 rounded-full shrink-0 ${dotClass}` `` — las clases son estaticas, sin conflicto con twMerge.

El RESEARCH.md sugiere (B) como aceptable. Este plan usa (A) por consistencia con kanban-card.tsx y para prevenir conflictos futuros si alguien agrega classes condicionales.
</interfaces>

<current_code>
<!-- El bloque exacto a modificar en columns.tsx (lineas 134-155 verificadas): -->

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
</current_code>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar imports + renderizar dots en celda de columna 'Productos' en columns.tsx</name>
  <files>src/app/(dashboard)/crm/pedidos/components/columns.tsx</files>

  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/columns.tsx (archivo completo — ya leido lineas 1-50 y 125-165)
    - src/lib/orders/product-types.ts (creado en Plan 01)
    - src/lib/utils.ts (para confirmar export de `cn`)
    - .planning/standalone/crm-color-tipo-producto/RESEARCH.md (seccion "Code Examples -> Orders table integration")
    - .planning/standalone/crm-color-tipo-producto/CONTEXT.md (seccion "Decisions" #6 — in-scope incluye vista tabla)
  </read_first>

  <behavior>
    - Test 1 (visual, manual): Fila de tabla con orden de melatonina -> dot verde junto al contador
    - Test 2 (visual, manual): Fila con ash -> dot naranja
    - Test 3 (visual, manual): Fila con magnesio forte -> dot morado
    - Test 4 (visual, manual): Fila con melatonina + ash -> verde + naranja (ese orden)
    - Test 5 (visual, manual): Fila sin productos -> muestra '-' (sin regresion)
    - Test 6 (visual, manual): Fila con productos sin match -> icono + contador SIN dots (sin regresion)
    - Test 7 (DOM inspection): Cada dot tiene `title`, `aria-label="Tipo de producto: <Label>"`, `role="img"`
    - Test 8 (DOM inspection): Dot con clases `h-2 w-2 rounded-full shrink-0 <color>`
  </behavior>

  <action>
Aplicar DOS cambios quirurgicos al archivo `src/app/(dashboard)/crm/pedidos/components/columns.tsx`.

### Cambio 1: Agregar imports (despues del import existente de `TagBadge` en linea 14)

Agregar despues de la linea `import { TagBadge } from '@/components/contacts/tag-badge'`:

```tsx
import { cn } from '@/lib/utils'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
```

### Cambio 2: Modificar cell de columna 'products' (lineas ~134-155)

Reemplazar la definicion actual de la columna por:

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
                    className={cn('h-2 w-2 rounded-full shrink-0', dotClass)}
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

### Notas de implementacion criticas

1. **Paridad con kanban-card.tsx:** mismo helper (`detectOrderProductTypes`), mismo mapa (`PRODUCT_TYPE_COLORS`), mismas clases Tailwind (`h-2 w-2 rounded-full shrink-0` + dotClass literal), mismos atributos accesibilidad (`title`, `aria-label`, `role="img"`).

2. **NO memoizar aqui:** las cells de TanStack Table se renderizan segun el ciclo de la tabla. Agregar `useMemo` dentro de la cell function no es idiomatico y puede generar warnings de React (hooks fuera de orden). `detectOrderProductTypes` es O(n) con n pequeno — el costo por re-render es despreciable. Si surge problema de performance medido, el fix es memoizar en Plan 01 (nivel modulo), no aqui.

3. **NO tocar orders-table.tsx:** ese archivo solo ensambla filters, sheet y DataTable. La columna `products` se renderiza desde aqui. El CONTEXT.md menciona `orders-table.tsx` pero el RESEARCH.md corrige (seccion "Component Responsibilities", "CORRECCION a CONTEXT.md"): el archivo correcto es `columns.tsx`. Este plan respeta la correccion.

4. **Estructura del JSX preserva el original:** el icono `PackageIcon`, el contador `{products.length}` y el texto 'producto(s)' se mantienen sin cambios. Solo se anade el bloque de dots a la derecha. Se cambia `ml-1` del texto 'producto(s)' a `gap-2` en el `<div>` contenedor para espaciado consistente con dots (cambio menor y visible, no altera la jerarquia de informacion).

5. **Guard doble:** El retorno temprano `if (!products || products.length === 0)` se preserva. El guard interno `{productTypes.length > 0 && ...}` evita renderizar el `<div>` de dots si ningun producto matchea.

6. **Tailwind estatico:** `PRODUCT_TYPE_COLORS[type].dotClass` es string literal (`'bg-green-500'` etc.) desde Plan 01. NUNCA construir dinamicamente.
  </action>

  <verify>
    <automated>MISSING — stack sin tests automatizados para CRM UI. Verificacion via grep + dev server + inspeccion DOM manual.</automated>
  </verify>

  <acceptance_criteria>
    - Imports agregados:
      - `grep -q "from '@/lib/orders/product-types'" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
      - `grep -q "detectOrderProductTypes" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
      - `grep -q "PRODUCT_TYPE_COLORS" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
      - `grep -q "import { cn } from '@/lib/utils'" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - Llamada al helper dentro de la cell:
      - `grep -q "detectOrderProductTypes(products)" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - Render de dots con los 3 atributos de accesibilidad:
      - `grep -q "productTypes.map" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
      - `grep -q "role=\"img\"" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
      - `grep -q "aria-label={\`Tipo de producto: " src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
      - `grep -q "title={label}" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - Clases Tailwind estaticas correctas:
      - `grep -q "h-2 w-2 rounded-full shrink-0" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - Sin clases dinamicas prohibidas:
      - `grep -L "bg-\\\${" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - Fallback a '-' para filas sin productos preservado:
      - `grep -q "text-muted-foreground\">-" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - Texto 'producto'/'productos' preservado:
      - `grep -q "producto' : 'productos'" src/app/\(dashboard\)/crm/pedidos/components/columns.tsx`
    - `orders-table.tsx` NO fue modificado (solo columns.tsx):
      - `git diff --name-only | grep -v "orders-table.tsx"` confirma que orders-table.tsx no esta en el diff
    - Compila sin errores:
      - `npx tsc --noEmit` no reporta errores nuevos en columns.tsx
    - Dev server inicia sin errores:
      - `npm run dev` arranca, `/crm/pedidos?view=table` (o el toggle de vista) carga sin errores de consola
    - Verificacion manual visual (POST-push, antes de pedir OK al usuario — REGLA 1):
      1. Abrir `/crm/pedidos`, cambiar a vista tabla (si hay toggle) en pipeline Ventas Somnio Standard
      2. Fila con orden melatonina -> verificar dot verde
      3. Fila con orden ash (o titulo "ASWAGHANDA") -> dot naranja
      4. (Si existe) fila con magnesio forte -> dot morado
      5. (Si existe) fila con 2 tipos -> orden estable verde > naranja > morado
      6. Fila sin productos -> muestra '-' sin dots
      7. Inspeccionar DOM: spans tienen `title`, `aria-label`, `role="img"`
  </acceptance_criteria>

  <done>
    - `columns.tsx` importa `cn`, `detectOrderProductTypes` y `PRODUCT_TYPE_COLORS`.
    - La cell de la columna 'products' llama `detectOrderProductTypes(products)` y renderiza dots a la derecha del contador cuando hay matches.
    - Filas sin productos siguen mostrando '-'. Filas con productos sin match muestran icono + contador sin dots (comportamiento actual preservado).
    - Dots tienen `title`, `aria-label`, `role="img"`.
    - `orders-table.tsx` NO fue modificado.
    - `npx tsc --noEmit` pasa.
    - Commit atomico: `feat(crm-color-tipo-producto): mostrar dots de tipo en columna Productos de tabla`.
    - Push a Vercel ejecutado — REGLA 1.
  </done>
</task>

</tasks>

<verification>
- Grep confirma imports y render.
- `npx tsc --noEmit` sin errores nuevos.
- `npm run dev` arranca limpio.
- `git diff --name-only` solo incluye `columns.tsx` (no `orders-table.tsx`).
- Verificacion visual en vista tabla de `/crm/pedidos` (post-push a Vercel).
</verification>

<success_criteria>
- Vista tabla de /crm/pedidos muestra dots de color correctos por fila, a la derecha del contador de productos.
- Paridad visual con Kanban (Plan 02): mismos colores, mismo orden estable, mismas reglas de fallback.
- Filas sin productos / sin match no crashean (fallback preservado).
- Atributos de accesibilidad presentes en cada dot.
- `orders-table.tsx` no fue tocado — confirmando que el archivo correcto era `columns.tsx`.
- Commit y push ejecutados conforme a REGLA 1.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-color-tipo-producto/03-SUMMARY.md` con:
- Cambios aplicados (imports, cell modificada)
- Confirmacion de que `orders-table.tsx` NO fue modificado (con cita del RESEARCH seccion "CORRECCION a CONTEXT.md")
- Verificacion manual realizada (checklist marcada)
- Commit SHA y confirmacion de push a Vercel
- Deuda tecnica (ninguna esperada)
</output>
