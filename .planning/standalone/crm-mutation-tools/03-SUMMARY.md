---
phase: standalone-crm-mutation-tools
plan: 03
subsystem: agents/shared
tags: [contacts-mutation, orders-mutation, cas-propagation, idempotency, domain-only, tdd]
dependency_graph:
  requires:
    - 01 (Wave 0 — domain closeOrder + idempotency helpers + getOrderById with closed_at)
    - 02 (Wave 1 — withIdempotency, mapDomainError, MutationResult<T>, factory pattern)
  provides:
    - 8/15 tools (3 contacts + 5 orders) accessible via createCrmMutationTools(ctx)
    - updateContact tool (pre-check + re-hydrate; resource_not_found short-circuit)
    - archiveContact tool (idempotent soft-delete via archived_at)
    - createOrder tool (idempotency-eligible, pipeline/stage disambiguation)
    - updateOrder tool (NO products field — V1.1 deferred)
    - moveOrderToStage tool (Pitfall 1 CAS propagation — actualStageId verbatim, no retry)
    - archiveOrder tool (idempotent soft-delete)
    - closeOrder tool (wraps Plan 01 domain, distinct from archive — D-11)
  affects:
    - (none — module continues to be brand new; no producer code touched outside the directory)
tech_stack:
  added: []
  patterns:
    - Pre-check via getXxxById → resource_not_found short-circuit (Pattern 3 / RESEARCH.md:357-376)
    - CAS propagation contract: stage_changed_concurrently verbatim, NEVER retry (Pitfall 1 / D-06)
    - Spanish-error disambiguation for createOrder via regex priority (stage/etapa BEFORE pipeline because "etapas en el pipeline" mentions both)
    - includeArchived=true on archive flow re-hydration (so archived row surfaces post-mutation)
    - Two-step cast pattern (`as unknown as { execute }`) — Pitfall 3 from Plan 02
    - vi.hoisted mock pattern (sibling crm-query-tools convention)
    - Caller-friendly schema mapping: tool input `stageId` → domain.newStageId
key_files:
  created:
    - src/lib/agents/shared/crm-mutation-tools/orders.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts
    - .planning/standalone/crm-mutation-tools/03-SUMMARY.md
  modified:
    - src/lib/agents/shared/crm-mutation-tools/contacts.ts
    - src/lib/agents/shared/crm-mutation-tools/index.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts
decisions:
  - Pitfall 1 enforced: 2 CAS-reject tests assert `domain.moveOrderToStage` invoked EXACTLY 1 time (no retry)
  - createOrder Spanish-error disambiguation: stage regex BEFORE pipeline regex (because "etapas en el pipeline" matches both — D-domain-error-priority)
  - moveOrderToStage tool exposes caller-friendly `stageId`; maps to domain `newStageId` internally (D-tool-name-mapping)
  - archiveOrder pre-check uses includeArchived=true (else already-archived rows would 404); re-hydrate also uses includeArchived=true
  - closeOrder does NOT call getOrderById post-domain-call — domain.closeOrder already re-hydrates internally (Plan 01 contract)
metrics:
  completed: 2026-04-29
  duration_minutes: ~10
  tasks_total: 3
  tasks_completed: 3
  files_created: 2
  files_modified: 3
  commits: 2 (task-level) + 1 (this SUMMARY) = 3
  tests_passing: 43 (9 helpers + 12 contacts + 22 orders)
---

# Standalone CRM Mutation Tools — Plan 03: Wave 2 (Contacts + Orders fan-out) Summary

Wave 2 entregada: 8/15 tools shipped accumulated (createContact + updateContact + archiveContact + createOrder + updateOrder + moveOrderToStage + archiveOrder + closeOrder). Pitfall 1 (CAS propagation) blindado con 2 tests + 1 textbook gate. Plan 04 (notes + tasks) consumirá los mismos helpers.

## Tasks Completadas

| #   | Task                                                                  | Commit    | Archivos                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Extend contacts.ts con updateContact + archiveContact (+6 tests)      | `66de656` | `src/lib/agents/shared/crm-mutation-tools/contacts.ts`, `__tests__/contacts.test.ts`                                                                                                                        |
| 3.2 | Crear orders.ts con 5 tools + wire en index.ts (+22 tests)            | `f948bdb` | `src/lib/agents/shared/crm-mutation-tools/orders.ts`, `index.ts`, `__tests__/orders.test.ts`                                                                                                                 |
| 3.3 | SUMMARY + push origin main                                            | (este)    | `.planning/standalone/crm-mutation-tools/03-SUMMARY.md`                                                                                                                                                     |

## Highlights

### 1. Pitfall 1 (CAS propagation) — blindado con 2 tests + textbook gate

`moveOrderToStage` propaga `stage_changed_concurrently` verbatim del domain SIN retry:

```typescript
if (!moved.success && moved.error === 'stage_changed_concurrently') {
  const widened = moved as unknown as {
    success: false
    error: 'stage_changed_concurrently'
    data?: { currentStageId: string | null }
  }
  const actualStageId = widened.data?.currentStageId ?? null
  return {
    status: 'stage_changed_concurrently',
    error: { code: 'stage_changed_concurrently', expectedStageId: input.stageId, actualStageId },
  }
}
```

**Test 13** asserta `actualStageId === STAGE_ACTUAL_ID` cuando domain refetch éxitoso, y `expect(moveOrderToStageDomainMock).toHaveBeenCalledTimes(1)` (no retry).

**Test 14** asserta `actualStageId === null` cuando domain refetch falla (`data: { currentStageId: null }`), y de nuevo `toHaveBeenCalledTimes(1)`.

**Textbook grep gate** (acceptance): `grep -E 'while.*stage_changed_concurrently|for.*stage_changed_concurrently|retry.*moveOrderToStage|moveOrderToStage.*retry' src/lib/agents/shared/crm-mutation-tools/orders.ts | wc -l == 0` → PASS.

### 2. Spanish-error disambiguation para createOrder (D-domain-error-priority)

Domain `createOrder` retorna 3 mensajes distintos para missing-resource:

| Mensaje del domain                                  | resource | code                |
| --------------------------------------------------- | -------- | ------------------- |
| "Pipeline no encontrado en este workspace"          | pipeline | pipeline_not_found  |
| "No hay etapas configuradas en el pipeline"         | stage    | stage_not_found     |
| "Pedido no encontrado tras crear" (rehydrate)       | order    | order_not_found     |

**Bug discovered en TDD:** El plan original verificaba `if (/pipeline/i.test(message))` PRIMERO. Pero el mensaje "No hay etapas configuradas en el pipeline" matches AMBOS regexes — y pipeline matcheaba primero, retornando `pipeline_not_found` cuando el resource real es `stage`.

**Fix (Rule 1 - bug):** invertí el orden — `stage|etapa` regex SE EVALÚA PRIMERO. Test 4 ahora pasa con `code: 'stage_not_found', missing.resource: 'stage'`.

### 3. archiveOrder pre-check con includeArchived=true

`getOrderById` por default excluye archivados (`!params.includeArchived && data.archived_at` → null). Si el caller llama `archiveOrder` sobre un pedido ya archivado, el pre-check normal devolvería null → `resource_not_found` en lugar del comportamiento idempotent esperado.

**Fix:** `archiveOrder.execute` llama `getOrderById({ orderId, includeArchived: true })` tanto en pre-check como en re-hydration. Plan original NO especificaba esto; lo descubrí escribiendo test 19 (idempotent already-archived).

### 4. Tool input `stageId` → domain `newStageId` mapping

Domain `MoveOrderToStageParams` usa `newStageId: string` (legacy nombre). El tool expone el más-natural `stageId` para el agente. El mapping ocurre en `execute`:

```typescript
const moved = await domainMoveOrderToStage(domainCtx, {
  orderId: input.orderId,
  newStageId: input.stageId,  // ← mapping aquí
})
```

Test 12 asserta `domainMoveOrderToStage` recibe `{ orderId, newStageId: STAGE_EXPECTED_ID }`.

### 5. closeOrder distinto de archiveOrder (D-11)

Domain `closeOrder` ya re-hidrata internamente y retorna `OrderDetail` directamente — el tool NO llama `getOrderById` extra. Plan 01 documentó esto: `closeOrder` es soft-close (visible en histórico), `archiveOrder` es soft-delete (oculto del UI). Tool docs explícito en description: "distinto de archiveOrder (que oculta del UI)".

### 6. Tests cubren 22 escenarios de orders + 12 de contacts (43 totales con helpers)

```
Test Files  3 passed (3)
     Tests  43 passed (43)
```

- 9 helpers tests (Plan 02)
- 12 contacts tests (6 Plan 02 + 6 Plan 03)
- 22 orders tests (Plan 03)

## Deviations from Plan

### Auto-fixed Issues (Rule 1 - Bug)

**1. [Rule 1 - Bug] Plan code para createOrder usaba `pipelineId ?? null` pero domain CreateOrderParams.pipelineId es REQUIRED (string, not nullable)**

- **Found during:** Task 3.2 implementación
- **Issue:** El plan especificó `pipelineId: z.string().uuid().optional()` y `pipelineId: input.pipelineId ?? null`. El domain `CreateOrderParams.pipelineId: string` es required.
- **Fix:** Tool input schema: `pipelineId: z.string().uuid()` (sin `.optional()`). Domain call directo: `pipelineId: input.pipelineId`. Si el agent necesita auto-resolver pipeline, debe usar `crm-query-tools.list_pipelines` primero.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/orders.ts`

**2. [Rule 1 - Bug] Plan code para moveOrderToStage usaba `stageId` para el domain, pero domain expects `newStageId`**

- **Found during:** Task 3.2 implementación
- **Issue:** Plan code: `await domainMoveOrderToStage(domainCtx, { orderId, stageId: input.stageId })`. Domain `MoveOrderToStageParams.newStageId` (legacy nombre).
- **Fix:** mapping explícito en execute: `{ orderId, newStageId: input.stageId }`. Test 12 valida el mapping.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/orders.ts`, `__tests__/orders.test.ts`

**3. [Rule 1 - Bug] Disambiguation regex en createOrder fallaba en "No hay etapas configuradas en el pipeline"**

- **Found during:** Task 3.2 RED→GREEN cycle (Test 4 falló)
- **Issue:** El plan code chequeaba `/pipeline/i.test(message)` PRIMERO. Pero el mensaje del domain "No hay etapas configuradas en el pipeline" matches ambos regexes — pipeline matcheaba primero retornando incorrectamente `pipeline_not_found`. El resource real missing es `stage`.
- **Fix:** Invertí el orden de evaluación — `/etapa|stage/i` ahora se evalúa PRIMERO. Test 4 pasa con `code: 'stage_not_found', missing.resource: 'stage'`.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/orders.ts`

### Auto-added Critical Functionality (Rule 2)

**4. [Rule 2 - Correctness] archiveOrder pre-check + re-hydrate necesitan includeArchived=true**

- **Found during:** Task 3.2 RED→GREEN cycle (Test 19 idempotent already-archived requería esto)
- **Issue:** Plan code llamaba `getOrderById({ orderId })` para pre-check. Default behavior de `getOrderById` es excluir archivados — si el caller llama `archiveOrder` sobre un pedido ya archivado, el pre-check devuelve null → `resource_not_found` en lugar del comportamiento idempotent esperado.
- **Fix:** Pasar `includeArchived: true` tanto en pre-check como en re-hydration. Test 19 (idempotent) ahora pasa.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/orders.ts`
- **Rationale:** Idempotent semantics requieren acceso al row archivado; sin `includeArchived: true` el comportamiento es bug-prone para callers que retry.

**5. [Rule 2 - Correctness] closeOrder pre-check con includeArchived=true (paralelo a archiveOrder)**

- **Found during:** Task 3.2 implementación
- **Issue:** Domain D-11 dice closed_at y archived_at son INDEPENDIENTES — un pedido puede estar archivado Y luego cerrado. Si el caller llama `closeOrder` sobre un pedido archivado, sin `includeArchived: true` el pre-check fallaría incorrectamente.
- **Fix:** `getOrderById({ orderId, includeArchived: true })` también en closeOrder pre-check.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/orders.ts`

### Auto-fixed (Rule 1) — del plan original que no anticipé en RED

**6. [Rule 1 - Bug] Plan code para createOrder usaba `items.map(...)` pero domain `products` schema requiere `sku: string` (no opcional)**

- **Found during:** Task 3.2 implementación
- **Issue:** Plan especificaba `items: z.array(z.object({ productId, name, quantity, unitPrice }))` — sin `sku`. Domain `CreateOrderParams.products` requiere `sku: string` (NOT NULL).
- **Fix:** Input schema: `items: z.array(z.object({ productId?, sku: string, title: string, unitPrice, quantity }))`. Mapping a domain incluye sku + title.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/orders.ts`

### Architectural Changes (Rule 4)

**Ninguna.** Plan ejecutado sin cambios estructurales. Todas las desviaciones fueron correcciones a desfases plan↔domain (signature mismatches), idénticas en naturaleza a las que Plan 02 reportó (Plan 02 deviation #1: domain createContact ≠ plan zod schema).

## Authentication Gates

**Ninguna.** No hay flows que requieran auth manual del usuario en este plan (solo creación de archivos + tests unitarios).

## Acceptance Criteria — Verification

| Plan acceptance                                                                          | Resultado                                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Task 3.1: 3 tools exported (createContact, updateContact, archiveContact)                | OK (verificable en `Object.keys(tools)`)        |
| Task 3.1: 0 deleteContact (excluding doc-comments)                                       | OK (2 mentions, ambas en doc-comments)          |
| Task 3.1: 0 workspaceId zod en input schema                                              | OK (0)                                           |
| Task 3.1: ≥ 12 tests passing en contacts.test.ts                                         | OK (12 passing)                                  |
| Task 3.2: 5 tools en orders.ts (create/update/move/archive/close)                        | OK (5 `xxx: tool(` matches)                      |
| Task 3.2: 0 products en updateOrder.inputSchema                                          | OK (0)                                           |
| Task 3.2: 0 deleteOrder                                                                  | OK (0)                                           |
| Task 3.2: 0 workspaceId zod                                                              | OK (0)                                           |
| Task 3.2: 0 imports cross-module crm-writer                                              | OK (0)                                           |
| Task 3.2: 0 createAdminClient/@supabase imports (excluding doc-comments)                 | OK (0 per-file; 1 mention en doc-comment)        |
| Task 3.2: Pitfall 1 textbook gate (no retry/while/for around stage_changed_concurrently) | OK (0 matches)                                   |
| Task 3.2: TypeScript clean — `tsc --noEmit -p .` zero module errors                      | OK (0 errors)                                    |
| Task 3.2: actualStageId widened como `string \| null` en types.ts                         | OK (1 match — Plan 02 ya tenía la widening)      |
| Task 3.2: ≥ 20 tests passing en orders.test.ts incluyendo TWO CAS-reject tests           | OK (22 passing; Test 13 + Test 14 cubren CAS)    |
| Task 3.2: index.ts exporta 8 tools                                                       | OK (8 `xxx: tool(` matches across los 2 files)   |
| Task 3.3: commit + push origin/main + clean tree                                         | (verificable tras push final)                    |

## Self-Check: PASSED

- All 3 created files exist on disk:
  - `src/lib/agents/shared/crm-mutation-tools/orders.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts` FOUND
  - `.planning/standalone/crm-mutation-tools/03-SUMMARY.md` FOUND
- All 3 modified files updated:
  - `src/lib/agents/shared/crm-mutation-tools/contacts.ts` MODIFIED
  - `src/lib/agents/shared/crm-mutation-tools/index.ts` MODIFIED
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts` MODIFIED
- 2 task commits exist locally:
  - `66de656` (Task 3.1) FOUND
  - `f948bdb` (Task 3.2) FOUND
- Final commit (Task 3.3 with this SUMMARY) será creado abajo + pushed.
- 43/43 vitest tests pasan (9 helpers + 12 contacts + 22 orders).
- `npx tsc --noEmit -p .` returns zero errors module-wide.
- Push to `origin/main` será ejecutado en commit final.

## Next

- **Plan 04 (Wave 2 — Notes + Tasks mutation tools, paralelo a este Plan 03):** consumirá los mismos helpers + `getContactNoteById` / `getOrderNoteById` / `getTaskById` de Plan 01 para rehydrate verídico. 7 tools: `addContactNote`, `addOrderNote`, `archiveContactNote`, `archiveOrderNote`, `createTask`, `updateTask`, `completeTask`.
- **Plan 05+:** runner endpoint hardened, integration tests env-gated, E2E Playwright Kanban verification, project skill `.claude/skills/crm-mutation-tools.md`, scope rule en `CLAUDE.md` + `.claude/rules/agent-scope.md`.

---

*Standalone: crm-mutation-tools — Plan 03 (Wave 2)*
*Completed 2026-04-29.*
