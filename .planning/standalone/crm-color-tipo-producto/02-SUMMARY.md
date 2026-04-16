---
phase: crm-color-tipo-producto
plan: 02
status: complete
commit: ebbd654
---

# Plan 02 — Dots en card Kanban — SUMMARY

## Archivo modificado

`src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (+25 LOC, 0 eliminadas)

## Cambios aplicados

### 1. Imports (despues de `cn`, antes de `OrderWithDetails`)

```tsx
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
```

### 2. `useMemo` dentro de `KanbanCard`, despues de `useDraggable`

```tsx
const productTypes = React.useMemo(
  () => detectOrderProductTypes(order.products),
  [order.products]
)
```

### 3. Bloque "Products summary" actualizado

Se inserto un `<div className="flex items-center gap-1 shrink-0">` con los dots JUSTO despues del `<PackageIcon>` y antes del `<span className="truncate">` del nombre del producto. El texto del producto y el contador `+N` se preservan sin cambios.

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

- **`useMemo` con `[order.products]`:** el Kanban puede tener 50-100 cards. Memoizar evita recomputes en cada render si la orden no cambia.
- **Guard doble:** se mantuvo el guard exterior `{order.products.length > 0 && ...}` y se agrego el guard interior `{productTypes.length > 0 && ...}` para NO renderizar un `<div>` vacio cuando ningun producto matchea.
- **`shrink-0` en el contenedor de dots:** evita que el contenedor se comprima cuando el titulo del producto es largo.
- **Sin clases dinamicas:** `dotClass` viene de `PRODUCT_TYPE_COLORS[type].dotClass` — string literal desde Plan 01. Tailwind JIT lo detecta estatico.

## Verificacion automatica

| Criterio | Status |
|---|---|
| Import de `product-types` | OK |
| `detectOrderProductTypes` + `PRODUCT_TYPE_COLORS` referenciados | OK |
| `React.useMemo` presente | OK |
| Llamada `detectOrderProductTypes(order.products)` | OK |
| `productTypes.map` render | OK |
| `role="img"`, `aria-label`, `title` presentes en cada dot | OK |
| Clases `h-2 w-2 rounded-full shrink-0` | OK |
| Fallback de texto (`order.products[0].title`) preservado | OK |
| `npx tsc --noEmit` sin errores nuevos en el archivo | OK |

## Verificacion visual (pendiente — requiere Vercel deploy)

Post-push a Vercel (se hara al final de Wave 2 con los 2 cambios juntos):
1. Abrir `/crm/pedidos` en pipeline Ventas Somnio Standard
2. Card con orden de melatonina -> dot verde
3. Card con orden ash/ASWAGHANDA -> dot naranja
4. Card con magnesio forte -> dot morado
5. Card con 2 tipos -> ambos dots en orden estable
6. Card sin productos clasificables -> sin dots (sin crashear)

## Deuda tecnica

Ninguna.

## Commit

- `ebbd654` — `feat(crm-color-tipo-producto): mostrar dots de tipo en card Kanban`
