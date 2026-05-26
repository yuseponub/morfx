---
phase: crm-duplicate-order-products-integrity
plan: "02"
subsystem: testing
tags: [unit-tests, vitest, mock-chain, domain-layer, jsonb-marker]
one_liner: "11 unit tests para duplicateOrder error capture (4 failure modes + happy path no-marker) + clearOrderDuplicateError idempotency, usando S-4 mock chain extendido con thenable insertMock"
status: complete
completed_at: 2026-05-26
duration_minutes: 20
tasks_completed: 4
tasks_total: 4
files_created: 1
files_modified: 0
commits: [753d9f0f]

dependency_graph:
  requires:
    - phase: crm-duplicate-order-products-integrity-01
      provides: "duplicateOrder fail-fast con marker + clearOrderDuplicateError helper + DuplicateError type"
  provides:
    - "11 unit tests cubriendo REQ-01..REQ-06 + REQ-08..REQ-10"
    - "Thenable insertMock pattern reusable para tests futuros de domain layer que llamen tanto `await insert([...])` como `insert({}).select().single()`"
    - "Test contract baseline para Plan 04 integration test (cuando se ejecute Plan 04 ya hubo verification que la unidad funciona)"
  affects:
    - "Plan 04: integration test puede asumir comportamiento unitario validado y solo verificar DB round-trip"
    - "Future domain layer tests que necesiten mockear `from('X').insert([...])` y `from('Y').insert({}).select().single()` en el mismo flow"

tech_stack:
  added: []
  patterns:
    - "S-4 Vitest mock chain (extension de conversations.test.ts canonical)"
    - "Thenable insertMock con dual-mode: lazy queue.shift() en .then + chain .select().single() via singleMock"
    - "vi.clearAllMocks() + insertResultQueue.length=0 reset entre tests"
    - "primeDuplicateOrderChain helper para stacking de mockResolvedValueOnce en orden EXACTO del flow real (P-7)"

key_files:
  created:
    - path: src/lib/domain/__tests__/orders-duplicate-products.test.ts
      change: "555 lineas — 11 tests, 9 describe blocks, 1 helper function (primeDuplicateOrderChain), 1 source fixture (SOURCE_ORDER)"
  modified: []

decisions:
  - "Thenable insertMock (custom pattern, no se en conversations.test.ts) — necesario porque duplicateOrder llama tanto `await supabase.from('order_products').insert([...])` (path con error) como `await supabase.from('orders').insert({...}).select('id').single()` (path para newOrder.id). El mismo `insertMock` debe satisfacer ambos sin colision de mockResolvedValueOnce."
  - "Lazy shift en `.then` (no en insertMock call) — clave para que el insert de orders (que va por .select().single()) no consuma queue items destinados al insert de order_products."
  - "Stub `@/lib/automations/trigger-emitter` (no `@/lib/automations/triggers`) — el path real importado por orders.ts. Sin este stub el test emite 401 a Inngest aunque pase."
  - "primeDuplicateOrderChain helper documenta el orden EXACTO de single() calls — anti-Pitfall P-7 (mockReturnValueOnce stacking)."
  - "TS7022 self-referential eqMock workaround: explicit `EqChain` type + cast — no es ideal pero el codebase ya tiene el mismo TS error en conversations.test.ts (NO regression, NO nuevo issue introducido por este commit)."

requirements-completed: []
---

# Plan 02 (Standalone crm-duplicate-order-products-integrity): Unit tests para duplicateOrder error capture + clearOrderDuplicateError

**11 unit tests cubriendo 4 failure modes (FK product_id 23503, FK order_id race 23503, CHECK quantity 23514, NOT NULL sku 23502) + happy path no-marker + clearOrderDuplicateError remove + 2 idempotent variants + not-found + Regla 3 workspace filter, usando S-4 mock chain extendido con thenable insertMock dual-mode.**

## Performance

- **Duration:** ~20 min (incluye debug del worktree drift incident)
- **Started:** 2026-05-26T17:24:00Z (approx)
- **Completed:** 2026-05-26T17:48:00Z (approx)
- **Tasks:** 4
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- 11 tests passing (4 failure modes + 1 happy + 4 clearOrderDuplicateError + 1 not-found + 1 workspace filter)
- 0 tests failing, 0 skipped
- 0 nuevos errores en `npx tsc --noEmit` (pre-existing TS7022 en conversations.test.ts no son de este commit)
- `npx vitest run src/lib/domain/__tests__/conversations.test.ts` sigue verde (no regression)
- Thenable insertMock pattern documentado + reusable

## Task Commits

Each task was committed atomically:

1. **Tasks 1-4 (combined per plan instructions):** Crear archivo de tests + 4 failure modes + happy path + clearOrderDuplicateError suite + commit final — `753d9f0f` (test)

Notable: el plan especifica que solo el commit final (Task 4) sucede después de validar la suite completa. Tasks 1/2/3 son etapas de construcción del archivo, no commits independientes. Esto se sigue al pie de la letra.

## Files Created/Modified

- `src/lib/domain/__tests__/orders-duplicate-products.test.ts` (CREATED, 555 lineas) — Suite completa de unit tests

## Decisions Made

### D-thenable-insert: Dual-mode insertMock

`duplicateOrder` llama a Supabase insert de DOS maneras distintas:

```typescript
// Path 1 — INSERT con returning (newOrder.id):
const { data: newOrder } = await supabase.from('orders').insert({...}).select('id').single()

// Path 2 — INSERT sin returning (order_products):
const { error } = await supabase.from('order_products').insert(productsToInsert)
```

Un solo `insertMock` debe satisfacer ambos shapes. Solución:

- `insertMock(payload)` retorna un objeto que tiene **ambos** `.then(...)` (thenable, soporta `await`) y `.select(cols)` (chain).
- En el `.then`, hace `insertResultQueue.shift()` solo cuando alguien hace `await` (path 2).
- En el `.select`, retorna `{ single: singleMock }` (path 1).

Esto evita el bug clásico de "mockResolvedValueOnce stacked en orden incorrecto" (P-7 del PATTERNS.md).

### D-trigger-emitter-stub: Mock del path correcto

El RESEARCH/PATTERNS preliminar sugería `vi.mock('@/lib/automations/triggers', ...)`. Sin embargo, `orders.ts` línea 17-20 importa de `@/lib/automations/trigger-emitter` (singular, sin "s"). El mock al path incorrecto pasaba los tests pero generaba stderr `401 Event key not found`. Corregido para que el stub coincida con el import real.

### D-eqMock-explicit-type: TS7022 workaround

`conversations.test.ts` (canonical) tiene un TS7022 self-referential implicit-any sobre `eqMock`. Para no propagar el mismo bug a mi archivo, anoté explícitamente el type:

```typescript
type EqChain = { eq: typeof eqMock; single: typeof singleMock }
const eqMock: ReturnType<typeof vi.fn> & ((...args: unknown[]) => EqChain) = vi.fn(
  (): EqChain => ({ eq: eqMock, single: singleMock })
) as ReturnType<typeof vi.fn> & ((...args: unknown[]) => EqChain)
```

No es ideal — un cast explícito siempre indica un sello en la type system — pero permite que `npx tsc --noEmit` no reporte errores en este archivo nuevo.

## Deviations from Plan

### Plan-vs-realidad fixes (sin auto-fix Rule)

**1. [N/A — diseño] Mock path correction**
- **Plan asumía:** `vi.mock('@/lib/automations/triggers', ...)`
- **Realidad:** `orders.ts` importa de `@/lib/automations/trigger-emitter`
- **Fix:** Stub al path correcto + 3 exports (emitOrderCreated, emitOrderStageChanged, emitFieldChanged)
- **Verificación:** stderr de vitest limpio (sin 401 Inngest)
- **Commit:** parte de `753d9f0f`

**2. [N/A — diseño] Thenable insertMock no documentado en PATTERNS**
- **Plan asumía:** `insertMock.mockResolvedValueOnce(...)` directo (estilo conversations.test.ts)
- **Realidad:** duplicateOrder hace tanto `await insert([...])` (resolve value) como `insert({}).select().single()` (chain). El `mockResolvedValueOnce` solo soporta el primero.
- **Fix:** Custom thenable que internamente usa `insertResultQueue` (FIFO) en path `.then` y `singleMock` en path `.select().single()`.
- **Verificación:** 11/11 tests pasan, ambos paths cubiertos (happy path test hits .select().single(), failure tests hit .then).
- **Commit:** parte de `753d9f0f`

**3. [N/A — proceso] Worktree drift (descubierto pero corregido)**
- **Issue:** El primer `cd /mnt/c/Users/Usuario/Proyectos/morfx-new` me llevó al worktree principal del usuario en lugar del dedicado. Esto causó que escribiera el archivo de test en el path incorrecto y que `git stash pop` produjera conflictos no relacionados con mi trabajo.
- **Fix:** Copié el archivo al worktree correcto (`/mnt/c/Users/Usuario/Proyectos/morfx-new/.claude/worktrees/agent-ab8c78e66011f5bda/`), limpié los archivos del stash pop con `git reset HEAD <files>` + `git checkout -- <files>` (sin tocar los archivos pre-existentes del gitStatus original), eliminé el archivo del path equivocado, dropeé el stash. El worktree principal del usuario quedó en su estado original (solo los `M` pre-existentes del gitStatus inicial).
- **Verificación:** `git worktree list` confirma worktree dedicado activo en commit correcto `ce97c26c → 753d9f0f`. `git status --short` en el worktree principal muestra solo los 2 archivos modificados pre-existentes.
- **Lesson:** Avoid `cd` — usar absolute paths o `git -C <path>`.

---

**Total deviations:** 0 auto-fix (Rules 1-3 no aplicaron). 3 design adjustments documentados arriba — todos resueltos sin checkpoint al usuario.
**Impact on plan:** Cero scope creep. Plan ejecutado tal como especifica, con los 3 ajustes técnicos siendo refinamientos del mock setup que el plan dejó subdeterminado.

## Issues Encountered

- **Worktree drift** (ver Deviation #3 arriba) — corregido inline sin afectar al user.
- **Análisis paralelo** del mismo branch (`exec/debounce-v2-wave6`) corriendo Plan 03/04 en simultáneo: detectado via `git reflog HEAD` mostrando commits `46f893a7` (Plan 04 tests) y `6f4a3480` (Plan 04 SUMMARY) que ya estaban en el branch antes de yo terminar Plan 02. Esto es esperado en parallel execution waves — mi commit Plan 02 (`753d9f0f`) se basa en `ce97c26c` (Plan 01 SUMMARY) y NO incluye los Plan 03/04 commits del branch del usuario. La merge final del orchestrator (fuera del worktree) integrará todo.

## User Setup Required

None - no external service configuration required (this plan is pure unit-test additions, no DB / env / external services touched).

## Self-Check: PASSED

**File check:**
- `src/lib/domain/__tests__/orders-duplicate-products.test.ts` — FOUND (555 lineas, 11 tests passing)
- `.planning/standalone/crm-duplicate-order-products-integrity/02-SUMMARY.md` — FOUND (this file)

**Commit check:**
- `753d9f0f` — FOUND on branch worktree-agent-ab8c78e66011f5bda
- Commit message starts with `test(crm-duplicate-order-products-integrity-02):`
- Files in commit: exactly 1 (the new test file)

**Test check:**
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` → 11 passed (0 failing, 0 skipped)
- `npx vitest run src/lib/domain/__tests__/conversations.test.ts` → 11 passed (no regression)

**Typecheck:**
- `npx tsc --noEmit | grep orders-duplicate-products` → 0 matches (my file is clean)
- Pre-existing errors in `conversations.test.ts` (TS7022) and `.next/dev/types/validator.ts` (TS2304) are baseline, NOT introduced by this commit

## Next Plan Readiness

- Plan 03 (server action `clearOrderDuplicateError` wrapper) ya fue ejecutado por otro agente paralelo en el mismo branch — commit `160fb31a`. Mi commit `753d9f0f` se basa en Plan 01 (`ce97c26c`) y NO incluye Plan 03/04, pero el merge final del orchestrator integrará todo.
- Plan 04 (integration test real DB) también ya fue commiteado por otro agente paralelo — commit `46f893a7` + SUMMARY `6f4a3480`. Mi Plan 02 unit test es complementario, no se sobre-escribe con Plan 04 integration test (paths diferentes: `src/lib/domain/__tests__/` vs `src/__tests__/integration/`).

---

*Plan: crm-duplicate-order-products-integrity 02*
*Completed: 2026-05-26*
