---
phase: crm-color-tipo-producto
plan: 03
status: complete
commit: 2399b5d
---

# Plan 03 — Dots en columna Productos (tabla) — SUMMARY

## Archivo modificado

`src/app/(dashboard)/crm/pedidos/components/columns.tsx` (+24 / -2 LOC)

## Archivo NO modificado (confirmado)

`src/app/(dashboard)/crm/pedidos/components/orders-table.tsx` — el render de la columna vive en `columns.tsx`, NO en `orders-table.tsx`. El CONTEXT.md mencionaba `orders-table.tsx` pero el RESEARCH.md corrigio la ruta (seccion "Component Responsibilities — CORRECCION a CONTEXT.md"). Este plan respeta la correccion.

Verificado con `git diff --name-only`: solo `columns.tsx` esta en el diff de este plan.

## Cambios aplicados

### 1. Imports (despues de `TagBadge`, antes de `OrderWithDetails`)

```tsx
import { cn } from '@/lib/utils'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
```

### 2. Cell de la columna `products` actualizada

La cell ahora llama `detectOrderProductTypes(products)` despues del early return de productos vacios, y renderiza los dots a la derecha del texto 'producto'/'productos'. Se cambio el `<div>` interno de contenedor plano a `flex items-center gap-2` para alinear correctamente contador + texto + dots.

Cambios incrementales:
- `<div>` → `<div className="flex items-center gap-2">`
- `<span className="ml-1">` → `<span>` (el `ml-1` ya no hace falta con `gap-2`)
- Bloque `{productTypes.length > 0 && ...}` inserto despues del texto 'producto(s)'

Cada dot:
```tsx
<span
  key={type}
  className={cn('h-2 w-2 rounded-full shrink-0', dotClass)}
  title={label}
  aria-label={`Tipo de producto: ${label}`}
  role="img"
/>
```

## Decisiones tecnicas

- **Sin `useMemo`:** las cells de TanStack Table se renderizan como funciones puras del row. `useMemo` dentro de la cell function no es idiomatico y podria generar warnings de hooks fuera de orden. `detectOrderProductTypes` es O(n) con n pequeno — sin costo perceptible por row.
- **Paridad con Kanban:** mismo helper, mismo mapa, mismas clases, mismos atributos de accesibilidad.
- **Guard doble preservado:** el early return `if (!products || products.length === 0)` mantiene el `-` para filas vacias. El guard interior evita renderizar el `<div>` de dots cuando ningun producto matchea.
- **`ml-1` en el contenedor de dots:** un poco mas de aire entre el texto 'productos' y el primer dot.

## Verificacion automatica

| Criterio | Status |
|---|---|
| Import de `product-types` | OK |
| Import de `cn` | OK |
| `detectOrderProductTypes(products)` llamado en cell | OK |
| `productTypes.map` render | OK |
| `role="img"`, `aria-label`, `title` presentes | OK |
| Clases `h-2 w-2 rounded-full shrink-0` | OK |
| Fallback `-` preservado | OK |
| Texto 'producto'/'productos' preservado | OK |
| `orders-table.tsx` NO en diff | OK |
| `npx tsc --noEmit` sin errores nuevos | OK |

## Verificacion visual (pendiente — post push a Vercel)

Se haran con los 2 cambios de Wave 2 juntos (cambios consecutivos al mismo feature):
1. `/crm/pedidos` vista tabla en pipeline Ventas Somnio Standard
2. Fila con melatonina -> dot verde al lado de 'producto'
3. Fila con ash/ASWAGHANDA -> dot naranja
4. Fila con magnesio forte -> dot morado
5. Fila con varios tipos -> orden verde > naranja > morado
6. Fila sin productos -> muestra `-` (sin regresion)

## Deuda tecnica

Ninguna.

## Commit

- `2399b5d` — `feat(crm-color-tipo-producto): mostrar dots de tipo en columna Productos de tabla`
