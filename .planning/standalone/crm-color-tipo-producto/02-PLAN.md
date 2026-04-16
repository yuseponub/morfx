---
phase: crm-color-tipo-producto
plan: 02
type: execute
wave: 2
depends_on:
  - 01
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
autonomous: true
requirements:
  - PT-02
  - PT-05

must_haves:
  truths:
    - "En la card Kanban de /crm/pedidos, cuando una orden tiene productos clasificables, aparecen dots de color (h-2 w-2) ANTES del texto del primer producto"
    - "Si la orden lleva melatonina -> dot verde. Si lleva ash -> dot naranja. Si lleva magnesio forte -> dot morado."
    - "Si la orden lleva mas de un tipo, aparecen multiples dots en orden estable: melatonina -> ash -> magnesio_forte"
    - "Si ningun producto de la orden matchea, la card renderiza como antes (sin dots), sin crashear"
    - "Cada dot tiene atributos title + aria-label + role='img' (WCAG 1.4.1)"
    - "La deteccion se memoiza por card via useMemo con dependencia order.products"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      provides: "Card Kanban con dots de color derivados de detectOrderProductTypes"
      contains: "detectOrderProductTypes"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      to: "src/lib/orders/product-types.ts"
      via: "import { detectOrderProductTypes, PRODUCT_TYPE_COLORS } from '@/lib/orders/product-types'"
      pattern: "from '@/lib/orders/product-types'"
    - from: "productTypes (useMemo)"
      to: "JSX dots en bloque Products summary (lineas 132-141)"
      via: "productTypes.map((type) => <span className={cn('h-2 w-2 rounded-full shrink-0', PRODUCT_TYPE_COLORS[type].dotClass)} ... />)"
      pattern: "productTypes.map"
---

<objective>
Integrar los dots de tipo de producto en la card Kanban del CRM (`kanban-card.tsx`), consumiendo el modulo `product-types.ts` creado en Plan 01.

Purpose: Que el operador de Somnio pueda distinguir a simple vista qué producto(s) lleva cada orden en el tablero Kanban, reduciendo errores al despachar.

Output: `kanban-card.tsx` modificado con imports del nuevo modulo, un `useMemo` para computar los tipos por card, y los dots renderizados en el bloque "Products summary" (lineas 132-141).
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
<!-- Exports del Plan 01 que este plan consume. NO explorar el codebase — usar estos directamente. -->

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
// PRODUCT_TYPE_COLORS.melatonina.label === 'Melatonina'
// PRODUCT_TYPE_COLORS.ash.label === 'Ash'
// PRODUCT_TYPE_COLORS.magnesio_forte.label === 'Magnesio Forte'

export function detectOrderProductTypes(
  products: Array<{ sku?: string | null; title?: string | null }>
): ProductType[]
```

From @/lib/utils (ya importado en kanban-card.tsx:9):
```typescript
export function cn(...inputs: ClassValue[]): string
```
</interfaces>

<current_code>
<!-- El bloque exacto a modificar en kanban-card.tsx (lineas 132-141 verificadas): -->

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
</current_code>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar imports + useMemo + dots en bloque Products summary de kanban-card.tsx</name>
  <files>src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx</files>

  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx (archivo completo — ~210 lineas, ya leido parcialmente)
    - src/lib/orders/product-types.ts (creado en Plan 01 — para confirmar exports disponibles)
    - .planning/standalone/crm-color-tipo-producto/RESEARCH.md (seccion "Code Examples -> Kanban card integration")
    - .planning/standalone/crm-color-tipo-producto/CONTEXT.md (seccion "Decisions" #5 para formato visual)
  </read_first>

  <behavior>
    - Test 1 (visual, manual): Card con orden de melatonina sola -> dot verde antes del texto
    - Test 2 (visual, manual): Card con orden de ash sola -> dot naranja
    - Test 3 (visual, manual): Card con orden de magnesio forte sola -> dot morado
    - Test 4 (visual, manual): Card con melatonina + ash -> dot verde + dot naranja (en ese orden)
    - Test 5 (visual, manual): Card con orden sin productos clasificables (p.ej. SKU desconocido y titulo sin patron) -> sin dots, renderiza como antes
    - Test 6 (DOM inspection): Cada dot tiene `title`, `aria-label="Tipo de producto: <Label>"`, `role="img"`
    - Test 7 (DOM inspection): El dot tiene clases `h-2 w-2 rounded-full shrink-0` + la clase de color del tipo
    - Test 8 (no regresion): Cards sin productos (`order.products.length === 0`) siguen sin renderizar el bloque
  </behavior>

  <action>
Aplicar DOS cambios quirurgicos al archivo `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`.

### Cambio 1: Agregar import del modulo product-types (despues del import de `cn`)

Ubicacion: despues de la linea 9 `import { cn } from '@/lib/utils'` y antes de `import type { OrderWithDetails } from '@/lib/orders/types'`.

Agregar:
```tsx
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
```

### Cambio 2: Dentro del componente `KanbanCard`, agregar useMemo + reemplazar bloque Products summary

Ubicacion del `useMemo`: dentro del componente `KanbanCard`, despues de `useDraggable` y antes del `return`. El componente ya usa `React.useMemo` en otros sitios del proyecto; React ya esta importado como `import * as React from 'react'` en linea 3.

Agregar (en la parte superior del cuerpo del componente, cerca de donde se declaran las variables derivadas):
```tsx
const productTypes = React.useMemo(
  () => detectOrderProductTypes(order.products),
  [order.products]
)
```

Reemplazar el bloque de lineas 132-141 (el `{/* Products summary */}`) por:
```tsx
{/* Products summary */}
{order.products.length > 0 && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
    <PackageIcon className="h-3.5 w-3.5" />
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

### Notas de implementacion criticas

1. **Accesibilidad (REGLA PT-05):** Cada `<span>` dot DEBE tener los 3 atributos (`title`, `aria-label`, `role="img"`). No omitir ninguno — es la unica garantia WCAG 1.4.1.

2. **Tailwind estatico (pitfall #1 del RESEARCH):** La clase de color viene de `PRODUCT_TYPE_COLORS[type].dotClass`, que es un string literal `'bg-green-500'` etc. NUNCA construir la clase con template literal como `` `bg-${x}-500` ``. El scanner no la detectaria.

3. **Guard doble:** El bloque exterior `{order.products.length > 0 && ...}` se mantiene. El bloque interior `{productTypes.length > 0 && ...}` es nuevo y permite que cards con productos sin match NO muestren el `<div>` vacio de dots. El texto del producto sigue renderizando normalmente (comportamiento actual preservado).

4. **`shrink-0` en el div contenedor:** Evita que los dots se comprisman si el titulo es muy largo.

5. **gap-1 entre dots:** Consistente con otros spots del proyecto que usan dots (task-form, task-filters).

6. **useMemo con dependencia correcta:** `[order.products]` — si la orden no cambia, no recomputar. Esto importa para un Kanban con ~50-100 cards.

7. **NO tocar otros bloques:** El resto del archivo (`Tracking info`, `Tags`, `Footer`) no se modifica.
  </action>

  <verify>
    <automated>MISSING — stack sin tests activos para CRM UI. Verificacion via grep + dev server + inspeccion DOM manual en /crm/pedidos.</automated>
  </verify>

  <acceptance_criteria>
    - Import agregado:
      - `grep -q "from '@/lib/orders/product-types'" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
      - `grep -q "detectOrderProductTypes" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
      - `grep -q "PRODUCT_TYPE_COLORS" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
    - useMemo presente:
      - `grep -q "React.useMemo" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
      - `grep -q "detectOrderProductTypes(order.products)" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
    - Render de dots presente con los 3 atributos de accesibilidad:
      - `grep -q "productTypes.map" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
      - `grep -q "role=\"img\"" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
      - `grep -q "aria-label={\`Tipo de producto: " src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
      - `grep -q "title={label}" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
    - Clases Tailwind correctas en el span:
      - `grep -q "h-2 w-2 rounded-full shrink-0" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
    - No se introdujeron classes dinamicas prohibidas:
      - `grep -L "bg-\\\${" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx` (NO debe contener template literals tipo `` bg-${...} ``)
    - El bloque Products summary mantiene el fallback de texto:
      - `grep -q "order.products\[0\].title" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx`
    - Compila sin errores:
      - `npx tsc --noEmit` no reporta errores nuevos en kanban-card.tsx
    - Dev server inicia sin errores:
      - `npm run dev` (puerto 3020) arranca, `/crm/pedidos` carga sin errores de consola
    - Verificacion manual visual (POST-push, antes de pedir OK al usuario — REGLA 1):
      1. Abrir `/crm/pedidos` en pipeline Ventas Somnio Standard
      2. Identificar card con orden de melatonina -> verificar dot verde
      3. Identificar card con orden de ash (o titulo "ASWAGHANDA") -> dot naranja
      4. (Si existe) card con magnesio forte -> dot morado
      5. (Si existe) card con 2 tipos -> ambos dots, orden: verde antes naranja antes morado
      6. Inspeccionar DOM: span tiene `title`, `aria-label`, `role="img"`
      7. DevTools > Rendering > Emulate Protanopia -> dots se distinguen por tooltip (hover)
  </acceptance_criteria>

  <done>
    - `kanban-card.tsx` importa `detectOrderProductTypes` y `PRODUCT_TYPE_COLORS` desde `@/lib/orders/product-types`.
    - Computa `productTypes` via `React.useMemo` con dependencia `[order.products]`.
    - El bloque "Products summary" (lineas ~132-141 originales) renderiza los dots con `title`, `aria-label`, `role="img"` cuando `productTypes.length > 0`.
    - Cards sin productos clasificables siguen renderizando el texto normalmente (sin dots).
    - `npx tsc --noEmit` pasa.
    - Commit atomico: `feat(crm-color-tipo-producto): mostrar dots de tipo en card Kanban`.
    - Push a Vercel (`git push origin main`) ejecutado — REGLA 1.
  </done>
</task>

</tasks>

<verification>
- Grep confirma imports y render.
- `npx tsc --noEmit` sin errores nuevos.
- `npm run dev` arranca limpio.
- Verificacion visual en `/crm/pedidos` con ordenes reales del workspace Somnio (post-push a Vercel).
</verification>

<success_criteria>
- Cards Kanban de Somnio muestran dots de color correctos por tipo de producto.
- Multiples tipos -> multiples dots en orden estable.
- Cards sin match no crashean y renderizan texto como antes.
- Atributos de accesibilidad presentes en cada dot.
- Sin regresion visual en otras partes de la card (nombre, total, tracking, tags, footer).
- Commit y push ejecutados conforme a REGLA 1.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-color-tipo-producto/02-SUMMARY.md` con:
- Cambios aplicados (imports, useMemo, bloque JSX)
- Screenshots esperados (o descripcion visual de cards de prueba)
- Verificacion manual realizada (checklist marcada)
- Commit SHA y confirmacion de push a Vercel
- Deuda tecnica (ninguna esperada)
</output>
