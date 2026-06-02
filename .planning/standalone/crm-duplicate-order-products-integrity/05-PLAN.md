---
plan: 05
title: "UI: badge + Popover + AlertDialog 'Marcar resuelto' en Kanban card"
phase: crm-duplicate-order-products-integrity
wave: 2
depends_on: [03]
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
autonomous: true
requirements: []
estimated_duration: 45m

must_haves:
  truths:
    - "Cuando order.custom_fields.duplicate_error es truthy, la card renderiza un badge rojo '⚠ Sin productos'"
    - "Cuando es falsy, NO se renderiza el badge (no regresion visual en orders normales)"
    - "Click en el badge abre un Popover con: titulo, timestamp relativo, errorCode + errorMessage truncado, lista de attemptedProducts, link al source order"
    - "El boton 'Marcar resuelto' dentro del Popover abre AlertDialog con confirm/cancel"
    - "Confirmar invoca el server action clearOrderDuplicateError + toast success + router.refresh()"
    - "TODOS los elementos interactivos del badge (wrapper, Popover trigger, Link, AlertDialog trigger, AlertDialogAction) usan onClick stopPropagation (P-8/P-9)"
    - "El badge es permanentemente visible (sin opacity-0 group-hover) — D-05"
    - "El badge sigue convenciones shadcn standard (text-destructive, bg-destructive/10, AlertTriangle icon)"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      provides: "Badge condicional + Popover + AlertDialog + handleResolve"
      contains: "getDuplicateError"
      contains: "clearOrderDuplicateError"
      contains: "AlertTriangle"
  key_links:
    - from: "kanban-card.tsx (badge render)"
      to: "src/lib/orders/types.ts (getDuplicateError accessor)"
      via: "import { getDuplicateError } from '@/lib/orders/types'"
      pattern: "getDuplicateError\\(order\\)"
    - from: "kanban-card.tsx (handleResolve)"
      to: "src/app/actions/orders.ts (server action)"
      via: "import { clearOrderDuplicateError } from '@/app/actions/orders'"
      pattern: "await clearOrderDuplicateError\\(order\\.id\\)"
    - from: "kanban-card.tsx (handleResolve success)"
      to: "Sonner + Next router"
      via: "toast.success + router.refresh()"
      pattern: "toast\\.success.*router\\.refresh"
---

# Plan 05: UI - badge en Kanban card + Popover + AlertDialog 'Marcar resuelto'

## Goal

Modificar `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` para renderizar un badge rojo permanente `⚠ Sin productos` cuando `order.custom_fields.duplicate_error` esta presente. Click en el badge abre un Radix `Popover` con detalles del error (timestamp relativo, error code, mensaje truncado, lista de productos del source, link al pedido origen) y un boton "Marcar resuelto" guarded por `AlertDialog` que confirma antes de invocar el server action `clearOrderDuplicateError` (Plan 03) + `toast.success` + `router.refresh()`. Todos los elementos interactivos usan `onClick stopPropagation` para no entrar drag mode (P-8/P-9). Sigue los patrones existentes del codebase: Popover de `variable-picker.tsx`, AlertDialog de `quick-reply-list.tsx`, stopPropagation del propio `kanban-card.tsx` (lineas 117, 211, 223).

## Out of scope

- NO crear sub-componente separado (`DuplicateErrorBadge.tsx`) — el badge vive inline en kanban-card.tsx. Razon: scope acotado, evita 2do archivo nuevo, sigue el estilo del archivo (Checkbox, Recompra button y WhatsApp Link tambien estan inline).
- NO tocar `kanban-board.tsx`, `kanban-column.tsx`, ni ningun otro componente del modulo Kanban.
- NO modificar el query `getOrders()` — el campo `custom_fields` ya viene en el `SELECT *` (verificado en RESEARCH).
- NO agregar badge al source order (open question Q1 en RESEARCH — out of scope, se decide NO).
- NO toast.success en lenguaje technical — usar wording operator-friendly en espanol Colombia.
- NO `useState` para Popover open state (uncontrolled — Radix auto-closes on outside click).

## Tasks

<task id="t1" parallel="false" type="auto">
<name>Task 1: Imports + handleResolve + badge inline con Popover + AlertDialog</name>
<files>src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx</files>
<read_first>
- src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx (full file, 237 lineas — entender estructura, ya leida en planning)
- src/app/(dashboard)/automatizaciones/components/variable-picker.tsx lineas 40-80 (Popover analog)
- src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx lineas 1-30 + 53-69 + 97-117 (imports + handler + AlertDialog analog)
- src/lib/orders/types.ts (post Plan 01) — DuplicateError + getDuplicateError exports
- src/app/actions/orders.ts (post Plan 03) — clearOrderDuplicateError server action
- .planning/standalone/crm-duplicate-order-products-integrity/PATTERNS.md §"src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx (MODIFY)"
- .planning/standalone/crm-duplicate-order-products-integrity/RESEARCH.md §"UI integration points"
</read_first>
<action>
1. Abrir `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`.

2. REEMPLAZAR el import block actual (lineas 1-14):

```typescript
'use client'

import * as React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { PackageIcon, TruckIcon, MessageCircleIcon, Link2Icon, RefreshCwIcon } from 'lucide-react'
import Link from 'next/link'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
import type { OrderWithDetails } from '@/lib/orders/types'
```

CON el nuevo bloque (agrega `AlertTriangleIcon`, useRouter, toast, Popover, AlertDialog, getDuplicateError, clearOrderDuplicateError server action; mantiene los existentes):

```typescript
'use client'

import * as React from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  PackageIcon,
  TruckIcon,
  MessageCircleIcon,
  Link2Icon,
  RefreshCwIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
import {
  type OrderWithDetails,
  getDuplicateError,
} from '@/lib/orders/types'
import { clearOrderDuplicateError } from '@/app/actions/orders'
```

3. INSERTAR dentro del componente `KanbanCard` (despues del block `productTypes` que termina ~linea 84 y antes del `handleClick` que empieza ~linea 86) el siguiente bloque:

```typescript
  // Standalone crm-duplicate-order-products-integrity — D-05 + D-06 badge state
  const duplicateError = React.useMemo(() => getDuplicateError(order), [order])
  const router = useRouter()
  const [isClearing, setIsClearing] = React.useState(false)

  async function handleResolveDuplicateError() {
    setIsClearing(true)
    try {
      const result = await clearOrderDuplicateError(order.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Marca de error eliminada')
      router.refresh()
    } catch (err) {
      toast.error('Error al limpiar la marca de error')
    } finally {
      setIsClearing(false)
    }
  }
```

4. INSERTAR el JSX del badge dentro del componente. Locacion: justo despues del bloque "Header: Order name + value" (que termina ~linea 158 con `</div>` de la div padre del header) y ANTES del bloque "Products summary" (que arranca ~linea 161 con `{order.products.length > 0 && (`). Wrapper en `<div onClick={(e) => e.stopPropagation()}>` no-negociable (P-8/P-9).

   El bloque a insertar:

```typescript
      {/* Duplicate error badge — Standalone crm-duplicate-order-products-integrity */}
      {/* D-05 + D-06: badge permanente + Popover con productos + link source + AlertDialog */}
      {/* P-8/P-9: stopPropagation en TODOS los interactives para no entrar drag mode */}
      {duplicateError && (
        <div
          className="mb-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
                  'text-[10px] font-medium',
                  'bg-destructive/10 text-destructive border border-destructive/30',
                  'hover:bg-destructive/15 transition-colors'
                )}
                aria-label="Pedido sin productos — error al duplicar"
              >
                <AlertTriangleIcon className="h-3 w-3" />
                <span>Sin productos</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-80 p-0"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="p-3 border-b">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangleIcon className="h-4 w-4 text-destructive" />
                  Productos no se copiaron al duplicar
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatRelativeTime(duplicateError.failedAt)}
                </p>
              </div>
              <div className="p-3 border-b space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                    {duplicateError.errorCode}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {duplicateError.errorMessage.length > 80
                    ? duplicateError.errorMessage.slice(0, 80) + '…'
                    : duplicateError.errorMessage}
                </p>
              </div>
              <div className="p-3 border-b">
                <p className="text-xs font-medium mb-1.5">
                  Productos que el origen tenia:
                </p>
                <ul className="space-y-1">
                  {duplicateError.attemptedProducts.map((p, i) => (
                    <li
                      key={`${p.sku}-${i}`}
                      className="text-xs text-muted-foreground flex justify-between gap-2"
                    >
                      <span className="truncate">
                        {p.quantity}× {p.title}
                      </span>
                      <span className="shrink-0 font-mono">
                        {formatCurrency(p.unit_price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 border-b">
                <Link
                  href={`/crm/pedidos/${duplicateError.sourceOrderId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Ver pedido origen →
                </Link>
              </div>
              <div className="p-3 flex justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      disabled={isClearing}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Marcar resuelto
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Marcar como resuelto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esto eliminara la marca de error del pedido. Asegurate de
                        haber agregado los productos correctos antes de continuar.
                        La accion no se puede deshacer (pero puedes volver a
                        editar productos del pedido normalmente).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                        Cancelar
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.stopPropagation()
                          handleResolveDuplicateError()
                        }}
                        disabled={isClearing}
                      >
                        Marcar resuelto
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
```

5. Verificar visualmente la estructura del componente — los otros bloques (Products summary, Tracking info, Tags, Footer) deben permanecer intactos.

6. NO tocar nada mas. NO cambiar el orden de los otros bloques.
</action>
<acceptance_criteria>
- `grep -c "import { AlertTriangleIcon" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 0 (AlertTriangleIcon esta dentro del bloque lucide-react, no en import separado).
- `grep -c "AlertTriangleIcon" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns >=2 (en lucide import + en JSX uso al menos 2 veces: trigger y popover header).
- `grep -c "getDuplicateError" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns >=1.
- `grep -c "clearOrderDuplicateError" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns >=1.
- `grep -c "from '@/components/ui/popover'" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 1.
- `grep -c "from '@/components/ui/alert-dialog'" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 1.
- `grep -c "stopPropagation" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns >=8 (badge wrapper, popover content, link, alertdialog trigger, alertdialogcontent, cancel, action, plus existing 3 — total >= 10 idealmente).
- `grep -c "handleResolveDuplicateError" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 2 (definition + onClick).
- `grep -c "Sin productos" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns >=1.
- `grep -c "Productos no se copiaron al duplicar" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 1.
- `grep -c "router.refresh" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 1.
- `grep -c "opacity-0 group-hover" src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` returns 1 (UNICAMENTE el Checkbox existente, NO el badge — el badge es permanente).
- `npx tsc --noEmit` exits 0.
- NO `window.confirm` (anti-pattern AlertDialog locked).
- NO Tooltip (anti-pattern — Popover required para hostear interactive children).
</acceptance_criteria>
<done>
Badge inline + Popover + AlertDialog implementados con stopPropagation. Imports correctos. Typecheck pasa.
</done>
</task>

<task id="t2" parallel="false" type="auto">
<name>Task 2: Lint + build sanity + commit</name>
<files></files>
<read_first>
- (sin nuevos archivos)
</read_first>
<action>
1. Typecheck:

```bash
npx tsc --noEmit
```

   Esperado: exit 0.

2. Si hay un linter configurado, correrlo solo en el archivo modificado:

```bash
npx eslint src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx 2>&1 | head -30
```

   Esperado: 0 errors. Warnings de unused-vars o react-hooks/exhaustive-deps OK si no son nuevos del bloque agregado.

3. Sanity grep:

```bash
grep -c "duplicateError && (" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx     # esperado: 1 (condicional render)
grep -c "Marcar resuelto" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx          # esperado: 2 (button label + dialog title)
grep -c "Ver pedido origen" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx        # esperado: 1
grep -c "useState(false)" src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx          # esperado: 1 (isClearing)
```

4. Verificar que existing tests del modulo Kanban siguen verdes (si los hay):

```bash
ls src/app/\(dashboard\)/crm/pedidos/components/__tests__/ 2>/dev/null
```

   Si existen, correrlos:

```bash
npx vitest run "src/app/(dashboard)/crm/pedidos/components/__tests__/"
```

   Si no existen tests para el modulo, skip.

5. Commit atomico:

```bash
git add "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
git commit -m "$(cat <<'EOF'
feat(crm-duplicate-order-products-integrity-05): badge "Sin productos" + Popover + AlertDialog "Marcar resuelto" en Kanban card

Surface visual del marker custom_fields.duplicate_error escrito por duplicateOrder (Plan 01). Cuando la order destino esta vacia por silent INSERT failure, el operador ve:
- Badge rojo permanente "Sin productos" (no group-hover — D-05) con AlertTriangleIcon
- Click abre Radix Popover con:
  - Header: timestamp relativo del fallo
  - Error code (PG SQLSTATE) + mensaje truncado a 80 chars (D-06)
  - Lista attemptedProducts del source (sku, title, unit_price, quantity — D-06)
  - Link "Ver pedido origen ->" al source order (D-06)
  - Boton "Marcar resuelto" guarded por AlertDialog
- AlertDialog confirm pide verificacion explicita (P-4 anti-auto-clear) + llama server action clearOrderDuplicateError (Plan 03) + toast.success + router.refresh()

Implementacion:
- TODOS los interactives usan onClick + onPointerDown stopPropagation (P-8/P-9 — evita drag mode + open de order sheet)
- Sigue convenciones shadcn existentes: Popover de variable-picker.tsx, AlertDialog de quick-reply-list.tsx, stopPropagation del propio kanban-card.tsx lineas 117/211/223
- NO sub-componente separado (badge inline en kanban-card.tsx — mismo estilo que Checkbox, Recompra, WhatsApp Link)
- NO badge en source order (decision: out of scope per Q1 RESEARCH)
- NO useState para Popover/AlertDialog open (uncontrolled — Radix auto-cierra)

isClearing state evita doble-click durante request inflight.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

6. Verificar:

```bash
git log -1 --stat
```

   Esperado: 1 archivo modificado, ~120-150 lineas added (imports + handler + JSX block).
</action>
<acceptance_criteria>
- `npx tsc --noEmit` exits 0.
- `git log -1 --name-only` lista exactamente `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`.
- `git log -1 --pretty=%s` empieza con `feat(crm-duplicate-order-products-integrity-05):`.
- `git diff HEAD~1 HEAD --shortstat src/app/\(dashboard\)/crm/pedidos/components/kanban-card.tsx` muestra ~100-180 lineas added.
- Si hay tests pre-existentes del Kanban: siguen pasando.
</acceptance_criteria>
<done>
UI badge + Popover + AlertDialog shippeable. Typecheck verde. Commit atomico. Plan 05 listo para Wave 3 (Plan 06 smoke + LEARNINGS + push).
</done>
</task>

## Commit message

```
feat(crm-duplicate-order-products-integrity-05): badge "Sin productos" + Popover + AlertDialog "Marcar resuelto" en Kanban card

[ver Task 2 para mensaje completo]
```
