---
phase: standalone-crm-mutation-tools
plan: 04
subsystem: agents/shared
tags: [notes-mutation, tasks-mutation, exclusive-arc, idempotency, body-truncate-pii, domain-only, tdd, suite-complete-15-tools]
dependency_graph:
  requires:
    - 01 (Wave 0 — domain getContactNoteById, getOrderNoteById, getTaskById getters via A11 gap closure)
    - 02 (Wave 1 — withIdempotency, mapDomainError, MutationResult<T>, bodyTruncate helper, factory pattern)
  provides:
    - 7 additional tools (4 notes + 3 tasks) → 15/15 final closed list per CONTEXT D-02
    - addContactNote / addOrderNote tools (idempotency-eligible, body-truncate PII redaction in observability)
    - archiveContactNote / archiveOrderNote tools (idempotent at domain via archived_at)
    - createTask tool (idempotency + exclusive-arc validation via zod refine + defense-in-depth in domain)
    - updateTask tool (re-hydrate via getTaskById; resource_not_found / validation_error mapping)
    - completeTask tool (idempotent — already-completed = no-op; emite trigger task.completed)
    - createCrmMutationTools(ctx) factory shape: 15/15 tools (3 contacts + 5 orders + 4 notes + 3 tasks)
  affects:
    - (none — module continues to be brand new; no producer code touched outside the directory)
tech_stack:
  added: []
  patterns:
    - bodyTruncate(s, 200) PII redaction reused from helpers.ts (Plan 02 pre-staged) for note body fields
    - Exclusive arc validation via zod refine (defense-in-depth — domain also validates)
    - Best-effort body rehydrate post-archive (try/catch wrapped — non-fatal)
    - Domain field-name adaptation: `body` (tool surface) ↔ `content` (DB column) for notes
    - Domain field-name alignment: `dueDate` (NOT `dueAt`) per actual schema
    - createdBy injection from ctx.invoker for note activity-log identity
    - Factory aggregator final shape with all 4 sub-factories spread (D-02 closed list)
    - Index smoke test enumerates expected 15 tools — scope creep guard
key_files:
  created:
    - src/lib/agents/shared/crm-mutation-tools/notes.ts
    - src/lib/agents/shared/crm-mutation-tools/tasks.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/notes.test.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/tasks.test.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/index.test.ts
    - .planning/standalone/crm-mutation-tools/04-SUMMARY.md
  modified:
    - src/lib/agents/shared/crm-mutation-tools/index.ts
decisions:
  - D-09 / Pitfall 6 enforced: every withIdempotency rehydrate callback in notes.ts + tasks.ts calls a domain getter (getContactNoteById / getOrderNoteById / getTaskById) — never fabricated from input
  - bodyTruncate applied at observability (NOT at storage) — full body lands in DB, only the redacted preview ships in the event payload (T-04-01 mitigation)
  - createdBy inyectado from ctx.invoker (fallback 'agent') — surfaces agent identity in contact_activity / task_activity audit log
  - Test 3 (exclusive arc) split en 3a + 3b (Rule 1 fix): AI SDK v6 tool.execute does NOT auto-run zod parse — verificado via schema.safeParse directo (3a) y defense-in-depth en domain (3b)
  - Best-effort body rehydrate post-archive wrapped in try/catch (Rule 1 — bug discovered when getter mock returned undefined): non-fatal getter failures should not fail the archive
  - Index smoke test added (Task 4.3) — 15/15 closed list enforcement at test time
metrics:
  completed: 2026-04-29
  duration_minutes: ~25
  tasks_total: 4
  tasks_completed: 4
  files_created: 5
  files_modified: 1
  commits: 5 (task-level: 4.1-RED, 4.1-GREEN, 4.2-RED, 4.2-GREEN, 4.3) + 1 (this SUMMARY) = 6
  tests_passing: 67 (9 helpers + 12 contacts + 22 orders + 11 notes + 10 tasks + 3 index)
---

# Standalone CRM Mutation Tools — Plan 04: Wave 3 (Notes + Tasks fan-out, 15/15 final) Summary

Wave 3 entregada: 7 tools adicionales (4 notes + 3 tasks) cierran la suite **15/15 final**. La factory `createCrmMutationTools(ctx)` ahora expone la lista cerrada completa por D-02 (3 contacts + 5 orders + 4 notes + 3 tasks). 67 tests passing (43 baseline Plan 02+03 + 11 notes + 10 tasks + 3 index smoke). Cero `createAdminClient` en el módulo — Regla 3 absoluta verificada per-archivo.

## Tasks Completadas

| #   | Task                                                                  | Commit    | Archivos                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1-RED   | failing notes.test.ts (11 tests)                                | `2ac54b4` | `src/lib/agents/shared/crm-mutation-tools/__tests__/notes.test.ts`                                                                                                                                                                        |
| 4.1-GREEN | notes.ts (4 tools) + index.ts wired                             | `f680851` | `src/lib/agents/shared/crm-mutation-tools/notes.ts`, `index.ts`                                                                                                                                                                            |
| 4.2-RED   | failing tasks.test.ts (9 tests)                                 | `8ebe803` | `src/lib/agents/shared/crm-mutation-tools/__tests__/tasks.test.ts`                                                                                                                                                                        |
| 4.2-GREEN | tasks.ts (3 tools) + index.ts wired (15/15 final)               | `afc4b70` | `src/lib/agents/shared/crm-mutation-tools/tasks.ts`, `index.ts`, `__tests__/tasks.test.ts` (Test 3 ajuste)                                                                                                                                  |
| 4.3       | index smoke test — 15/15 closed list enforcement                | `3407c85` | `src/lib/agents/shared/crm-mutation-tools/__tests__/index.test.ts`                                                                                                                                                                          |
| 4.4       | SUMMARY + push origin main                                      | (este)    | `.planning/standalone/crm-mutation-tools/04-SUMMARY.md`                                                                                                                                                                                     |

## Highlights

### 1. Pitfall 6 (D-09) blindado en 6 rehydrate callbacks distintos

Cada tool de creación con idempotency usa el callback `rehydrate(id)` para volver a leer la entity desde el domain en vez de devolver un snapshot fabricado del input. En este plan se agregaron 3 callbacks nuevos:

- `addContactNote.rehydrate` → llama `getContactNoteById(domainCtx, { noteId: id })`
- `addOrderNote.rehydrate` → llama `getOrderNoteById(domainCtx, { noteId: id })`
- `createTask.rehydrate` → llama `getTaskById(domainCtx, { taskId: id })`

Test crítico — **Test 3 de notes.test.ts**:

```typescript
const second = await exec({
  contactId: CONTACT_ID,
  body: 'caller-input-body-IGNORED',  // ← input distinto de la primera llamada
  idempotencyKey: 'idem-1',
})
expect(second).toMatchObject({
  status: 'duplicate',
  data: { noteId: NOTE_ID, body: 'fresh-from-db body' },  // ← DB body, NO input body
})
```

Si el código fabricara `{ noteId: id, body: input.body }` (la trampa Pitfall 6), el test fallaría — el body retornado vendría del input "caller-input-body-IGNORED", no del DB "fresh-from-db body". Test 2 de tasks.test.ts hace el mismo ejercicio con `title`.

### 2. bodyTruncate aplicado para PII redaction (T-04-01 mitigation)

Las tools `addContactNote` y `addOrderNote` reciben texto libre del agente (que puede contener PII del cliente). En observability `crm_mutation_invoked.inputRedacted.body` el body se trunca a 200 chars + ellipsis (helper `bodyTruncate(s, 200)` ya estaba en `helpers.ts` desde Plan 02). El body completo SÍ se persiste en DB (eso es scope del operador, no del observability sink).

Tests 4 + 7 (notes.test.ts) verifican que un body de 500 chars termina con length ≤ 201 en `inputRedacted.body`, y que el body completo (500 As) NO aparece en el JSON serializado del payload.

### 3. Exclusive arc — defense in depth (T-04-02 mitigation)

`createTask.inputSchema` usa `.refine()` para rechazar inputs con más de uno de `contactId/orderId/conversationId`:

```typescript
.refine(
  (i) => [i.contactId, i.orderId, i.conversationId].filter(Boolean).length <= 1,
  { message: 'createTask: at most one of contactId/orderId/conversationId may be provided', path: ['contactId'] },
)
```

Pero en AI SDK v6, `tool.execute()` **NO ejecuta zod parse** — eso pasa en el LLM tool-call boundary. Por eso Test 3 se split en 3a + 3b:

- **Test 3a**: verifica el refine via `schema.safeParse({...})` directamente — confirma que el LLM boundary lo rechazará.
- **Test 3b**: verifica defense-in-depth — si zod se bypassa (caller llama execute directo con input ya parseado), el domain también valida y retorna "Una tarea solo puede estar vinculada a un contacto, pedido o conversacion" → tool surfacea como `status: 'error'`.

### 4. Domain field-name adaptations (Rule 1 plan ↔ realidad)

Plan template asumía signatures que no coincidían con la realidad del domain:

| Concepto                  | Plan template     | Domain real            | Resolución                                                                |
| ------------------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------- |
| createContactNote name    | `createContactNote`  | `createNote`        | Alias en import: `createNote as domainCreateContactNote`                  |
| archiveContactNote name   | `archiveContactNote` | `archiveNote`       | Alias en import: `archiveNote as domainArchiveContactNote`                |
| Note body field           | `body` everywhere | DB col `content`       | Tool surface = `body`, mapeo `body → content` en domain call             |
| createNote createdBy      | (no specifica)    | `createdBy: string` requerido | Inyectado desde `ctx.invoker ?? 'agent'`                              |
| Task due field            | `dueAt`           | `dueDate` (col `due_date`) | Tool surface alineado a `dueDate` (no usar `dueAt`)                  |

Ninguno de estos ajustes cambia la API exterior del módulo (los agentes consumen `addContactNote({ contactId, body })`, no se enteran del mapping interno).

### 5. Best-effort body rehydrate post-archive (Rule 1 — bug)

El plan template hacía `getContactNoteById(...)` después de `archiveNote` para hidratar el body en el snapshot retornado. Pero descubrí en el GREEN cycle que si el getter mock no estaba configurado (test 8/10 archive happy path NO esperaba body en el snapshot), el `await getContactNoteById(...)` retornaba undefined y el subsiguiente `fetched.success` lanzaba TypeError → tool retornaba `status: 'error'` cuando debería retornar `executed`.

**Fix:** envuelvo el rehydrate en try/catch — non-fatal:

```typescript
try {
  const fetched = await getContactNoteById(domainCtx, { noteId: input.noteId })
  if (fetched && fetched.success && fetched.data) {
    snapshot.body = fetched.data.body
    snapshot.archivedAt = fetched.data.archivedAt ?? snapshot.archivedAt
  }
} catch {
  // ignored — snapshot already has noteId + archivedAt from domain
}
```

Pattern: el archive es la fuente de verdad para `archivedAt`; el body es nice-to-have. Si el getter falla (concurrent delete, transient DB hiccup), no rompemos la operación principal.

### 6. Index smoke test — scope creep guard (Task 4.3)

Tres tests en `index.test.ts`:

1. `Object.keys(tools).length === 15` — protege contra factory drops.
2. Cada tool esperado existe por nombre — protege contra renames silenciosos.
3. **No hay tools inesperadas** — protege contra scope creep que debería ir a un standalone follow-up.

```typescript
const unexpected = keys.filter((k) => !EXPECTED_TOOLS.includes(k))
expect(unexpected).toEqual([])
```

Si en el futuro alguien agrega `bulkArchiveOrders` sin actualizar el list (que está en deferred ideas — CONTEXT.md "bulk operations"), este test falla.

### 7. Tests cubren 67 escenarios totales

```
Test Files  6 passed (6)
     Tests  67 passed (67)
```

- 9 helpers tests (Plan 02)
- 12 contacts tests (Plan 02 + 03)
- 22 orders tests (Plan 03)
- 11 notes tests (Plan 04)
- 10 tasks tests (Plan 04)
- 3 index smoke tests (Plan 04)

## Deviations from Plan

### Auto-fixed Issues (Rule 1 - Bug)

**1. [Rule 1 - Bug] Plan code para notes.ts importaba `domainCreateContactNote`, `domainArchiveContactNote` directos pero domain usa nombres `createNote`, `archiveNote`**

- **Found during:** Task 4.1 implementación
- **Issue:** El plan template tenía `import { createContactNote as domainCreateContactNote, archiveContactNote as domainArchiveContactNote, ... }`. El domain real exporta `createNote` (para contact notes) y `archiveNote` (para contact notes), no las funciones nombradas como en el plan.
- **Fix:** Aliasing en el import — `import { createNote as domainCreateContactNote, archiveNote as domainArchiveContactNote, ... } from '@/lib/domain/notes'`. Esto preserva la legibilidad interna del tool (los handlers internos hablan en términos de "contactNote" / "orderNote") sin romper el contrato del domain.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/notes.ts`

**2. [Rule 1 - Bug] Plan code para notes asumía que domain `createNote` aceptaba `{ contactId, body }`, pero domain requiere `{ contactId, content, createdBy }`**

- **Found during:** Task 4.1 implementación
- **Issue:** El domain `CreateNoteParams` tiene `content: string` (NOT `body`) y `createdBy: string` requerido (para activity log). El plan template no manejaba ninguno de los dos.
- **Fix:**
  - Tool surface mantiene `body` (más natural para el agente).
  - Mapeo `body → content` ocurre en el domain call.
  - `createdBy = ctx.invoker ?? 'agent'` — el ctx ya trae el agent ID del invoker, lo reutilizamos como identidad para activity log.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/notes.ts`

**3. [Rule 1 - Bug] archive happy path tests fallaban con `status: 'error'` por getter mock undefined**

- **Found during:** Task 4.1 GREEN cycle (Tests 8 + 10)
- **Issue:** El plan template hacía un getter call sin try/catch después de domain.archiveNote — si el getter mock retornaba undefined (porque el test no lo configuró), el `fetched.success` lanzaba TypeError y el catch de fuera mapeaba a `status: 'error'`. Tests 8 y 10 esperaban `executed`.
- **Fix:** envolver el body rehydrate en try/catch (non-fatal). El snapshot mantiene noteId + archivedAt del domain mismo.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/notes.ts`

**4. [Rule 1 - Bug] Plan code para tasks.ts usaba `dueAt` pero domain `CreateTaskParams` usa `dueDate`**

- **Found during:** Task 4.2 implementación
- **Issue:** Plan template tenía `dueAt: z.string().optional()` y mapeo a `dueAt: input.dueAt` en domain call. El domain real tiene `dueDate: string | null` (col `due_date`).
- **Fix:** tool input alineado a `dueDate`. Mapping a domain también `dueDate`. Snapshot retorna `dueDate` (no `dueAt`).
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/tasks.ts`

**5. [Rule 1 - Bug] Test 3 (exclusive arc) plan template asumía AI SDK v6 ejecutaba zod parse en `tool.execute()` — no lo hace**

- **Found during:** Task 4.2 GREEN cycle (Test 3 falló — `createTaskDomainMock` SÍ se llamó porque execute bypasea el schema)
- **Issue:** AI SDK v6 zod parsing happens en el LLM tool-call boundary, NO en `tool.execute(input)` directo. Por eso al pasar input con violación de exclusive arc directo a execute, el domain SÍ se invocó.
- **Fix:** Test 3 split en:
  - **Test 3a:** `schema.safeParse({...})` directamente — verifica que el LLM boundary lo rechazará.
  - **Test 3b:** defense-in-depth — si zod se bypassa, el domain también valida y retorna error.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/__tests__/tasks.test.ts`

### Auto-added Critical Functionality (Rule 2)

**6. [Rule 2 - Correctness] createdBy inyectado desde ctx.invoker para activity-log identity**

- **Found during:** Task 4.1 implementación
- **Issue:** Plan template no especificaba `createdBy` en el input ni en la inyección. Domain require `createdBy: string` para `contact_activity` rows (audit trail).
- **Fix:** `const createdBy = ctx.invoker ?? 'agent'` se computa una vez al inicio de `makeNoteMutationTools` y se pasa al domain en cada tool. Pattern simétrico con cómo crm-writer thread the agent identity.
- **Rationale:** Sin esto, el row de activity sería null/blank en el log — pérdida de forensics. El default 'agent' es defensive (los callers responsables siempre pasan un invoker).
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/notes.ts`

### Architectural Changes (Rule 4)

**Ninguna.** Plan ejecutado sin cambios estructurales. Todas las desviaciones fueron correcciones a desfases plan↔domain (signature mismatches) — naturaleza idéntica a las reportadas en Plans 02+03 SUMMARYs.

## Authentication Gates

**Ninguna.** No hay flows que requieran auth manual del usuario en este plan (creación de archivos + tests unitarios, ningún side effect en producción).

## Acceptance Criteria — Verification

| Plan acceptance                                                                          | Resultado                                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Task 4.1: 4 tools en notes.ts                                                            | OK (4 `tool({` matches)                          |
| Task 4.1: bodyTruncate uses ≥ 2                                                          | OK (3 matches)                                   |
| Task 4.1: 0 deleteNote/deleteOrderNote (excluyendo doc-comments)                         | OK (0 después de doc-comment refactor)           |
| Task 4.1: 0 createAdminClient/@supabase imports                                          | OK (0)                                           |
| Task 4.1: 0 workspaceId en input schema                                                  | OK (0)                                           |
| Task 4.1: getContactNoteById ≥ 1 (rehydrate D-09)                                        | OK (11 matches — usado en addContactNote + archive helpers) |
| Task 4.1: getOrderNoteById ≥ 1                                                           | OK (9 matches)                                   |
| Task 4.1: ≥ 10 tests passing en notes.test.ts                                            | OK (11 passing)                                  |
| Task 4.2: 3 tools en tasks.ts                                                            | OK (3 `tool({` matches)                          |
| Task 4.2: 0 deleteTask                                                                   | OK (0 después de doc-comment refactor)           |
| Task 4.2: 0 createAdminClient/@supabase imports                                          | OK (0)                                           |
| Task 4.2: arcCount <= 1 (zod refine)                                                     | OK (1 match)                                     |
| Task 4.2: getTaskById ≥ 1 (rehydrate D-09)                                               | OK (13 matches)                                  |
| Task 4.2: ≥ 9 tests passing en tasks.test.ts                                             | OK (10 passing)                                  |
| Task 4.3: Object.keys(createCrmMutationTools(...)).length === 15                         | OK (smoke test passes)                           |
| Task 4.3: TypeScript clean — `tsc --noEmit -p .` zero errors                             | OK (0 errors module-wide)                        |
| Task 4.4: commit + push origin/main + clean tree                                         | (verificable tras push final)                    |

## Self-Check: PASSED

- All 6 created files exist on disk:
  - `src/lib/agents/shared/crm-mutation-tools/notes.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/tasks.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/notes.test.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/tasks.test.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/index.test.ts` FOUND
  - `.planning/standalone/crm-mutation-tools/04-SUMMARY.md` FOUND
- Modified file:
  - `src/lib/agents/shared/crm-mutation-tools/index.ts` MODIFIED (15/15 final)
- 5 task commits exist locally:
  - `2ac54b4` (Task 4.1 RED) FOUND
  - `f680851` (Task 4.1 GREEN) FOUND
  - `8ebe803` (Task 4.2 RED) FOUND
  - `afc4b70` (Task 4.2 GREEN) FOUND
  - `3407c85` (Task 4.3 index smoke) FOUND
- Final commit (Task 4.4 con este SUMMARY) será creado abajo + pushed.
- 67/67 vitest tests pasan.
- `npx tsc --noEmit -p .` returns zero errors module-wide.
- Push to `origin/main` será ejecutado en commit final.

## Suite Status (post-Plan 04)

```
crm-mutation-tools/
├── types.ts           [Plan 02 — types + MutationResult<T>]
├── helpers.ts         [Plan 02 — withIdempotency, mapDomainError, bodyTruncate, observability]
├── contacts.ts        [Plans 02+03 — 3 tools]
├── orders.ts          [Plan 03 — 5 tools]
├── notes.ts           [Plan 04 — 4 tools NEW]
├── tasks.ts           [Plan 04 — 3 tools NEW]
├── index.ts           [Plan 04 — 15/15 final factory]
└── __tests__/         [67 tests total]

Total tools: 15/15 (closed list per CONTEXT D-02)
```

## Next

- **Plan 05:** runner endpoint hardened (`/api/test/crm-mutation-tools/runner/route.ts`) — 4-gate hardening (NODE_ENV + secret + env-workspace + tool-allowlist).
- **Plan 06:** integration tests env-gated (cross-workspace isolation, idempotency replay, soft-delete behavior, stage_changed_concurrently propagation).
- **Plan 07+:** E2E Playwright Kanban verification, project skill `.claude/skills/crm-mutation-tools.md`, scope rule en `CLAUDE.md` + `.claude/rules/agent-scope.md`, INTEGRATION-HANDOFF.md.

---

*Standalone: crm-mutation-tools — Plan 04 (Wave 3 — Notes + Tasks fan-out, 15/15 final)*
*Completed 2026-04-29.*
