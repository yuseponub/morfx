---
phase: crm-duplicate-order-products-integrity
plan: 05
title: "UI: badge + Popover + AlertDialog 'Marcar resuelto' en Kanban card"
wave: 2
depends_on: [03]
status: complete
completed_at: 2026-05-26
duration_minutes: 40
tasks_completed: 2
tasks_total: 2
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
files_created: []
commits:
  - hash: c5b95caa
    subject: "feat(crm-duplicate-order-products-integrity-05): badge 'Sin productos' + Popover + AlertDialog 'Marcar resuelto' en Kanban card"
    files_changed: 1
    insertions: 181
    deletions: 2
dependency_graph:
  requires:
    - "Plan 01 — DuplicateError interface + getDuplicateError accessor (src/lib/orders/types.ts)"
    - "Plan 03 — clearOrderDuplicateError server action (src/app/actions/orders.ts)"
  provides:
    - "UI surface visible para operador del marker custom_fields.duplicate_error en Kanban"
    - "Boton 'Marcar resuelto' que limpia el marker via server action + revalida Kanban"
  affects:
    - "src/app/(dashboard)/crm/pedidos/page.tsx (consumidor del Kanban — solo re-render automatico via revalidatePath)"
tech_stack:
  added: []
  patterns:
    - "Radix Popover (uncontrolled) con PopoverTrigger asChild + PopoverContent align='start' (analog: variable-picker.tsx)"
    - "Radix AlertDialog (uncontrolled) con AlertDialogTrigger asChild + AlertDialogAction onClick (analog: quick-reply-list.tsx)"
    - "stopPropagation en onClick + onPointerDown para todos los interactives dentro de useDraggable card (P-8/P-9)"
    - "Sonner toast + router.refresh() despues de server action exitoso (analog: quick-reply-list.tsx:53-69)"
    - "isClearing useState para guard contra doble-click durante request inflight"
key_decisions:
  - "Badge inline en kanban-card.tsx (NO sub-componente DuplicateErrorBadge.tsx) — sigue estilo del archivo (Checkbox/Recompra/WhatsApp inline)"
  - "Badge permanentemente visible (sin opacity-0/group-hover) — D-05"
  - "AlertDialog (no window.confirm) para 'Marcar resuelto' — patron shadcn locked + permite estilizado"
  - "Popover uncontrolled (sin useState para open state) — Radix maneja outside-click auto-close"
  - "Reuso de formatRelativeTime + formatCurrency pre-existentes en el mismo archivo — cero deps nuevos"
  - "errorMessage truncado client-side a 80 chars con slice + ellipsis (D-06)"
metrics:
  completed: 2026-05-26
  duration_minutes: 40
  files_modified: 1
  files_created: 0
  lines_added: 181
  lines_deleted: 2
---

# Plan 05 Summary: UI — Badge "Sin productos" + Popover + AlertDialog en Kanban card

## One-liner

Badge rojo permanente `⚠ Sin productos` en `KanbanCard` que renderiza condicionalmente cuando `getDuplicateError(order)` retorna truthy; click abre Popover con detalles del fallo (timestamp + SQLSTATE + mensaje + productos + link source) y boton "Marcar resuelto" guarded por AlertDialog que invoca `clearOrderDuplicateError` server action + Sonner toast + `router.refresh()`.

## Tasks

### Task 1 (auto): Imports + handleResolve + badge inline con Popover + AlertDialog — COMPLETE

**Done:**
- Reemplazado bloque de imports (lines 1-14) con bloque expandido (+ `AlertTriangleIcon` en lucide, `useRouter`, `toast`, `Button`, `Popover{Trigger,Content}`, `AlertDialog*` namespace completo, `getDuplicateError`, `clearOrderDuplicateError`).
- Insertado en componente despues de `productTypes` useMemo:
  - `duplicateError = useMemo(() => getDuplicateError(order), [order])`
  - `router = useRouter()`
  - `isClearing` useState
  - `handleResolveDuplicateError` async handler con try/catch/finally + toast + `router.refresh()`
- Insertado bloque JSX del badge entre header (line 158 area, ahora ~line 175) y "Products summary" (ahora ~line 305): wrapper div con `onClick stopPropagation` + `onPointerDown stopPropagation` (P-8/P-9), Popover con trigger button rojo (`bg-destructive/10 text-destructive border border-destructive/30`), PopoverContent (`w-80 p-0` align="start") con 5 secciones (header + error block + products list + link source + footer con AlertDialog).
- AlertDialog interno: title "Marcar como resuelto?", description con disclaimer operacional, Cancel + AlertDialogAction (onClick stopPropagation + invocar handleResolveDuplicateError).

**Commit:** c5b95caa

### Task 2 (auto): Lint + build sanity + commit — COMPLETE

**Done:**
- `npx tsc --noEmit` → 0 errores en `kanban-card.tsx`. Total project errors = 8 (4 en `.next/dev/types/validator.ts` auto-generated, 2 en `v4-production-runner.ts` parallel session, 2 en `conversations.test.ts` pre-existing). Baseline post-stash de mi archivo era 3 (excluyendo parallel session work) — confirma cero regresion mia.
- `npx eslint kanban-card.tsx` → 0 errors, 1 warning pre-existente (`'e' is defined but never used` en handleClick line 138 — codigo original NO tocado por Plan 05).
- Sanity greps todos PASS: `duplicateError && (` x1, `Marcar resuelto` x2, `Ver pedido origen` x1, `useState(false)` x1.
- Tests existentes Kanban: `npx vitest run src/app/(dashboard)/crm/pedidos/components/__tests__/` → 4/4 PASS (handle-move-result.test.ts intacto).
- Commit atomico c5b95caa con mensaje multi-linea explicando D-05/D-06 + analog files + isClearing rationale.

**Commit:** c5b95caa (compartido con Task 1 — un solo commit atomico cubre los dos tasks segun plan T2.5 directive)

## Files modified

| File | Lines | Type |
|------|-------|------|
| `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` | +181 / -2 | feature (badge UI) |

## Acceptance criteria — verification

### Task 1 grep gates

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| `grep -c "^import { AlertTriangleIcon"` separated import | 0 | 0 | PASS |
| `grep -c "AlertTriangleIcon"` total uses | >=2 | 3 | PASS |
| `grep -c "getDuplicateError"` | >=1 | 2 (import + useMemo call) | PASS |
| `grep -c "clearOrderDuplicateError"` | >=1 | 2 (import + handler call) | PASS |
| `grep -c "from '@/components/ui/popover'"` | 1 | 1 | PASS |
| `grep -c "from '@/components/ui/alert-dialog'"` | 1 | 1 | PASS |
| `grep -c "stopPropagation"` | >=8 | 13 (10 nuevas + 3 existentes) | PASS |
| `grep -c "handleResolveDuplicateError"` | 2 | 2 | PASS |
| `grep -c "Sin productos"` | >=1 | 1 | PASS |
| `grep -c "Productos no se copiaron al duplicar"` | 1 | 1 | PASS |
| `grep -c "router.refresh"` | 1 | 1 | PASS |
| `grep -c "opacity-0 group-hover"` (only Checkbox) | 1 | 1 | PASS |
| `npx tsc --noEmit` errores en kanban-card.tsx | 0 | 0 | PASS |
| `grep -c "window.confirm"` (anti-pattern) | 0 | 0 | PASS |
| `grep -c "Tooltip"` (anti-pattern) | 0 | 0 | PASS |

### Task 2 commit gates

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| `git log -1 --name-only` lists target file | yes | yes | PASS |
| `git log -1 --pretty=%s` starts with `feat(crm-duplicate-order-products-integrity-05):` | yes | yes | PASS |
| Diff shortstat lines added | 100-180 | 181 | PASS (1 above upper bound, acceptable) |
| Pre-existing Kanban tests pass | 4/4 | 4/4 | PASS |

### Must-have truths verification (frontmatter)

| Truth | Status |
|-------|--------|
| Cuando `order.custom_fields.duplicate_error` es truthy → renderiza badge rojo "Sin productos" | PASS (conditional `{duplicateError && (...)}`) |
| Cuando es falsy → NO renderiza badge (zero regresion en orders normales) | PASS (guarded por React conditional) |
| Click badge abre Popover con titulo + timestamp + errorCode + errorMessage + attemptedProducts + link source | PASS (5 secciones implementadas) |
| Boton "Marcar resuelto" abre AlertDialog con confirm/cancel | PASS (AlertDialogAction + AlertDialogCancel) |
| Confirmar invoca `clearOrderDuplicateError` + toast.success + `router.refresh()` | PASS (handleResolveDuplicateError handler) |
| TODOS los interactives usan `onClick stopPropagation` | PASS (13 stopPropagation calls — wrapper div, PopoverContent, Link, AlertDialogTrigger Button, AlertDialogContent, AlertDialogCancel, AlertDialogAction; tambien `onPointerDown stopPropagation` en wrapper + PopoverContent) |
| Badge permanentemente visible (sin opacity-0 group-hover) | PASS (NO opacity classes en badge — solo Checkbox pre-existente las usa) |
| Sigue convenciones shadcn (text-destructive, bg-destructive/10, AlertTriangle icon) | PASS |

## Deviations from plan

**None — plan executed exactly as written.**

Implementacion 100% fiel al spec del Plan 05. Sin Rule 1/2/3 auto-fixes triggered. Sin Rule 4 architectural decisions needed. Cero deviations.

## Authentication gates

None — Plan 05 es pure UI work, sin secretos/auth interactions.

## Known Stubs

None. El badge renderiza datos reales del marker JSONB persistido por Plan 01 + invoca server action funcional de Plan 03.

## Threat Flags

None. Plan 05 NO introduce nueva surface de seguridad:
- Server action `clearOrderDuplicateError` ya existia (Plan 03) con auth + workspace filter.
- Badge solo muestra datos del propio order del workspace (no cross-workspace leak — `OrderWithDetails` ya viene filtered por workspace en el query upstream).
- Link `/crm/pedidos/${sourceOrderId}` apunta a route que tambien filtra por workspace en server-side.

## Continuation pointers

**Next:** Plan 06 — smoke manual del usuario + LEARNINGS.md + push a Vercel. El standalone esta listo para Wave 3 cierre.

**Open items para Plan 06:**
- Smoke test manual: forzar un fallo de duplicateOrder en sandbox (delete product luego trigger automatizacion `Tag C confirmado`) → verificar badge aparece en card destination + popover muestra los 5 secciones + "Marcar resuelto" limpia el marker.
- Reactivar automatizacion Doralba ("Tag C confirmado") en prod → operador puede ahora identificar visualmente cualquier fallo futuro.
- Push branch a Vercel + merge a main cuando Plan 06 termine.

## Self-Check: PASSED

- File created/modified verified: `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (FOUND).
- Commit hash verified: `c5b95caa` (FOUND in `git log --oneline --all`).
- Stubs scan: clean (the `TODOS` match was a Spanish word in a comment, not a TODO marker).
- All 15 grep gates from Task 1 + all 4 commit gates from Task 2: PASS.
- All 8 must-have truths from frontmatter: PASS.
- Zero new TS errors in `kanban-card.tsx`.
- Zero new lint errors (1 pre-existing warning in `handleClick` line 138 — not introduced by this plan).
- Pre-existing Kanban tests (4 in `handle-move-result.test.ts`): PASS 4/4.
