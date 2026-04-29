---
phase: standalone-crm-mutation-tools
plan: 02
subsystem: agents/shared
tags: [module-skeleton, factory, idempotency-helper, observability, pii-redaction, tdd]
dependency_graph:
  requires:
    - 01 (Wave 0 — DB migrations applied + domain idempotency helpers + closeOrder + getXxxById)
  provides:
    - createCrmMutationTools(ctx) factory aggregator (1 tool registered: createContact)
    - withIdempotency<T> helper (re-usable by Plans 03/04)
    - emitInvoked / emitCompleted / emitFailed observability emitters
    - phoneSuffix / bodyTruncate / emailRedact / idSuffix PII redactors
    - mapDomainError Spanish-error-string → status mapper
    - MutationResult<T> discriminated union (7 statuses)
    - ResourceType union (9 resources)
    - CrmMutationToolsContext interface
  affects:
    - (none — module is brand new, no producer code touched outside the new directory)
tech_stack:
  added: []
  patterns:
    - Factory pattern espejo crm-query-tools (D-pre-01)
    - Discriminated union return shape (D-07 / Pattern 2)
    - Domain-only data access (Regla 3 / D-pre-02): tools wrap @/lib/domain/contacts (createContact, getContactById)
    - Re-hydration post-mutación vía getContactById (D-09 Pitfall 6 — NUNCA fabricar snapshot)
    - Observability con PII redaction (Pattern 5 + D-23)
    - Idempotency-Key opcional con table-backed dedup + race-detect re-fetch (D-03 Pattern 4)
    - Two-step cast `as unknown as { execute }` para AI SDK v6 strict types (Pitfall 3)
    - vi.hoisted mock pattern (sibling crm-query-tools convention)
key_files:
  created:
    - src/lib/agents/shared/crm-mutation-tools/types.ts
    - src/lib/agents/shared/crm-mutation-tools/helpers.ts
    - src/lib/agents/shared/crm-mutation-tools/contacts.ts
    - src/lib/agents/shared/crm-mutation-tools/index.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/helpers.test.ts
    - src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts
    - .planning/standalone/crm-mutation-tools/02-SUMMARY.md
  modified: []
decisions:
  - D-pre-01 factory mirror crm-query-tools (file structure + observability shape)
  - D-pre-02 zero createAdminClient en módulo (Regla 3) — verificado per-file
  - D-pre-03 ctx.workspaceId nunca del input — zod schema sin workspaceId
  - D-pre-04 zero deleteContact — soft-delete only (Plan 03 agregará archiveContact tool)
  - D-03 idempotency opcional via withIdempotency wrapper (re-usable Plans 03/04)
  - D-07 7-status discriminated union locked
  - D-09 re-hydrate fresh via rehydrate(resultId) ANTES de fallback a result_payload
  - Pitfall 7 mapDomainError regex map (4 branches)
  - Pitfall 10 ResourceType duplicado en este módulo (NO importa de crm-writer)
  - Adaptación domain → tool documentada en contacts.ts doc-comment para Plans 03/04
metrics:
  completed: 2026-04-29
  duration_minutes: ~22
  tasks_total: 5
  tasks_completed: 5
  files_created: 6
  files_modified: 0
  commits: 4 (task-level) + 1 (this SUMMARY) = 5
  tests_passing: 15 (9 helpers + 6 contacts)
---

# Standalone CRM Mutation Tools — Plan 02: Wave 1 Module Skeleton + createContact Summary

Wave 1 entregada: módulo `src/lib/agents/shared/crm-mutation-tools/` creado desde cero con la triada (1) factory + types + helpers + idempotency wrapper, (2) observability emit con PII redaction, (3) `createContact` como tool de prueba que demuestra el patrón end-to-end. Plans 03 + 04 desbloqueados — pueden replicar en paralelo.

## Tasks Completadas

| #   | Task                                                  | Commit    | Archivos                                                                                                                                              |
| --- | ----------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | types.ts (MutationResult<T> + ResourceType + Context) | `0343e07` | `src/lib/agents/shared/crm-mutation-tools/types.ts`                                                                                                   |
| 2.2 | helpers.ts (withIdempotency + obs + redaction)        | `71d1512` | `src/lib/agents/shared/crm-mutation-tools/helpers.ts`                                                                                                 |
| 2.3 | helpers.test.ts (9 tests, GREEN)                      | `5bd7aed` | `src/lib/agents/shared/crm-mutation-tools/__tests__/helpers.test.ts`                                                                                  |
| 2.4 | contacts.ts createContact + index.ts + 6 tests        | `3670355` | `src/lib/agents/shared/crm-mutation-tools/contacts.ts`, `src/lib/agents/shared/crm-mutation-tools/index.ts`, `__tests__/contacts.test.ts`             |
| 2.5 | SUMMARY + push origin main                            | (este)    | `.planning/standalone/crm-mutation-tools/02-SUMMARY.md`                                                                                               |

## Highlights

### 1. MutationResult<T> 7-status discriminated union (D-07 locked)

`types.ts` exporta el contract público que Plans 03/04 reutilizarán para todos los demás tools:

```typescript
export type MutationResult<T> =
  | { status: 'executed'; data: T }
  | { status: 'duplicate'; data: T }
  | { status: 'resource_not_found'; error: { code; message?; missing: { resource: ResourceType; id } } }
  | { status: 'stage_changed_concurrently'; error: { code: 'stage_changed_concurrently'; expectedStageId; actualStageId } }
  | { status: 'validation_error'; error: { code; message; field? } }
  | { status: 'workspace_mismatch'; error: { code: 'workspace_mismatch' } }
  | { status: 'error'; error: { code; message? } }
```

Pitfall 10 respetado: `ResourceType` está duplicado en este módulo (NO importa de `@/lib/agents/crm-writer/types`) para mantener independencia per D-01 (coexistencia con crm-writer). Verificado vía `grep -E "from '@/lib/agents/crm-writer" types.ts` → 0 matches.

### 2. withIdempotency wrapper (Pattern 4) — la pieza más complicada del módulo

`helpers.ts:withIdempotency<T>(domainCtx, ctx, toolName, key?, doMutate, rehydrate)` cubre los 4 paths críticos:

1. **No key** → `doMutate()` directo, sin tocar la tabla idempotency.
2. **Key + lookup hit** → `rehydrate(resultId)` retorna entity fresh; fallback a `result_payload` solo si rehydrate=null (entity orphan tras TTL sweep).
3. **Key + lookup miss + clean insert** (`inserted=true`) → `executed`, `idempotencyKeyHit=false`.
4. **Key + lookup miss + race lost** (`inserted=false`) → re-fetch winner via `getIdempotencyRow` → `rehydrate(winner.resultId)` → `duplicate`, `idempotencyKeyHit=true`.

D-09 enforced: re-hidratación SIEMPRE preferida sobre `result_payload` cacheado. La razón está documentada en doc-comment: "el payload es un tombstone para crash-recovery; el live state debe ser fresh".

Tests cubren los 4 paths + el clean insert path (5 tests `withIdempotency`).

### 3. PII redaction inline en observability (D-23 / Pattern 5)

4 helpers en `helpers.ts`:

- `phoneSuffix(raw)` → últimos 4 dígitos. Test 6 contacts.test.ts verifica que `inputRedacted.phoneSuffix === '4567'` para input `'+57 300 123 4567'` y que la serialización JSON del payload **no contiene** ni `'+57 300 123 4567'` ni `'3001234567'`.
- `emailRedact(raw)` → `'ali…@example.com'` para `'alice@example.com'` (primeros 3 chars + `…@dominio`). Retorna `'<invalid-email>'` para inputs sin `@`.
- `bodyTruncate(s, max=200)` → para `addContactNote`/`addOrderNote` en Plan 04.
- `idSuffix(uuid)` → últimos 8 chars para log readability.

### 4. mapDomainError 4 branches (Pitfall 7)

Mapping regex de strings de error en español del domain layer a `MutationResult.status`:

| Patrón regex                                              | → Status                       |
| --------------------------------------------------------- | ------------------------------ |
| `^stage_changed_concurrently$` (verbatim, case-insens)   | `stage_changed_concurrently`   |
| `/no encontrad[oa]/i`                                     | `resource_not_found`           |
| `/requerido\|obligatori[oa]\|invalid\|inválid[oa]/i`      | `validation_error`             |
| (fallback)                                                | `error`                        |

Tests 6-9 cubren cada branch.

### 5. createContact tool — proof-of-pattern (Task 2.4)

`contacts.ts:makeContactMutationTools(ctx)` exporta `{ createContact }` con todas las piezas conectadas:

- **Input schema** zod con refine "al menos uno de name/phone/email" (domain requiere `name` pero permitimos creación desde solo phone — sintetizamos `name = phone ?? email`).
- **PII-redacted observability emit** al inicio (Test 6 verifica).
- **withIdempotency wrapper** opcional via `idempotencyKey?: string`.
- **Re-hidratación verídica** vía `getContactById` tanto en path executed como en path duplicate (D-09).
- **Error mapping** vía `mapDomainError` → `validation_error` / `resource_not_found` / `error`.
- **3 events** emitidos: `crm_mutation_invoked` (siempre), `crm_mutation_completed` (success), `crm_mutation_failed` (catch).

Test 2 (idempotency replay) verifica que segundo call con misma key retorna `duplicate` con el mismo `id` y que `createContactDomainMock` se llamó solo UNA vez (segundo path corta en lookup hit).

### 6. Adaptaciones domain → tool documentadas (para Plans 03/04)

Hallazgos durante implementación, documentados en doc-comment de `contacts.ts` para que Plans 03/04 los consuman sin sorpresas:

1. **Domain `createContact` requiere `name: string`** (no opcional). Tool acepta `name?` + refine pero sintetiza `name = phone ?? email` cuando no viene. Esto matches el flujo UI existente donde se crean contactos desde solo phone.
2. **Domain `createContact` toma tag NAMES (no UUIDs)** en `tags: string[]`. Plan original especificaba `z.array(z.string().uuid())` pero el domain trabaja con nombres. Tool expone `tags: z.array(z.string().min(1))`. UUID-only tag refs son scope creep.
3. **Domain `createContact` NO acepta `customFields`** en creación (solo `updateContact` lo hace). Tool input schema mirrors esa restricción — omite `customFields`.

## Deviations from Plan

**Adaptaciones a la realidad del domain layer (todas pre-aprobadas implícitamente por el patrón Plan 01: "el plan es prescriptivo pero adapta a la realidad del domain").**

### Auto-fixed Issues (Rule 1 — Bug)

**1. [Rule 1 - Mismatch] Domain createContact signature ≠ plan zod schema**

- **Found during:** Task 2.4
- **Issue:** El plan especificaba `name: z.string().min(1).optional()` y `tags: z.array(z.string().uuid()).optional()` y `customFields: z.record(...)`. El domain `CreateContactParams` requiere `name: string` (no opcional), trabaja con tag NAMES (no UUIDs), y NO acepta `customFields` en creación.
- **Fix:** Tool input schema acepta `name?` + refine "al menos uno de name/phone/email" + sintetiza `name = phone ?? email` cuando falta. Tags expuestos como `z.array(z.string().min(1))` (nombres). customFields omitido del schema (sólo aplicable a updateContact en Plan 03).
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/contacts.ts`
- **Commit:** `3670355`

**2. [Rule 1 - Bug] withIdempotency unused-parameter TS error con strict mode**

- **Found during:** Task 2.2
- **Issue:** El plan firmaba `withIdempotency(domainCtx, ctx, toolName, ...)` pero `ctx` no se usa internamente (reservado para invoker logging futuro).
- **Fix:** Renombré parámetro a `_ctx` con prefix underscore para silenciar el warning sin romper la firma pública. Doc-comment explícito sobre el reserved usage.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/helpers.ts`
- **Commit:** `71d1512`

**3. [Rule 1 - Bug] Domain `getContactById` retorna `data: ContactDetail | null` (no `data: ContactDetail`)**

- **Found during:** Task 2.4
- **Issue:** El rehydrate callback `async (id) => detail.success ? detail.data : null` causaba TS error porque `detail.data` puede ser `undefined`. Plan asumía nunca undefined.
- **Fix:** `return detail.success ? (detail.data ?? null) : null` — coalesce explícito a null cuando data viene undefined.
- **Files modified:** `src/lib/agents/shared/crm-mutation-tools/contacts.ts`
- **Commit:** `3670355`

### Auto-added Critical Functionality (Rule 2)

**Ninguna.** El plan estaba completo en threat coverage. PII redaction, workspace isolation gate, deleteContact ban — todo cubierto por las acceptance criteria del plan.

### Architectural Changes (Rule 4)

**Ninguna.** Plan ejecutado sin cambios de estructura.

## Authentication Gates

**Ninguna.** No hay flows que requieran auth manual del usuario en este plan (solo creación de archivos + tests).

## Acceptance Criteria — Verification

| Plan acceptance                                                    | Resultado                                       |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Task 2.1: file exists + 5 named exports + tsc clean                | OK (5 exports: MutationResult, ResourceType, CrmMutationToolsContext, ContactDetail, OrderDetail re-export, 0 errors) |
| Task 2.1: ≥2 stage_changed_concurrently + ≥2 workspace_mismatch    | OK (3 + 2)                                       |
| Task 2.1: 0 imports from crm-writer/types                          | OK (0)                                           |
| Task 2.2: file exists + helper exports + tsc clean                 | OK (9 exports incl. types, 0 errors)            |
| Task 2.2: 0 createAdminClient/@supabase imports (per-file)         | OK (0 per-file; doc-comments excluded)          |
| Task 2.3: 9 tests passing                                          | OK (9 passed)                                    |
| Task 2.4: 3 source files + 6 tests passing                         | OK (3 + 6 passed)                                |
| Task 2.4: 0 createAdminClient en contacts.ts                       | OK (0 per-file)                                  |
| Task 2.4: 0 workspaceId zod en input schema                        | OK (0)                                           |
| Task 2.4: 0 deleteContact (excluding doc-comments)                 | OK (0 per-file)                                  |
| Task 2.4: ≥1 two-step cast `as unknown as { execute`               | OK (7 calls)                                     |
| Task 2.5: commit + push origin/main + clean tree                   | (verificado tras push final abajo)              |

## Self-Check: PASSED

- All 6 created files exist on disk:
  - `src/lib/agents/shared/crm-mutation-tools/types.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/helpers.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/contacts.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/index.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/helpers.test.ts` FOUND
  - `src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts` FOUND
- All 4 task commits exist locally:
  - `0343e07` (Task 2.1) FOUND
  - `71d1512` (Task 2.2) FOUND
  - `5bd7aed` (Task 2.3) FOUND
  - `3670355` (Task 2.4) FOUND
- Final commit (Task 2.5 with this SUMMARY) created below.
- 15/15 vitest tests pass (9 helpers + 6 contacts).
- `npx tsc --noEmit -p .` returns zero errors module-wide.
- Push to `origin/main` to be executed in next step (Task 2.5).

## Next

- **Plan 03 (Wave 2 — Orders mutation tools):** consumes `withIdempotency`, `mapDomainError`, `MutationResult<T>`, factory pattern para implementar 5 tools — `createOrder`, `updateOrder`, `moveOrderToStage` (con `stage_changed_concurrently` propagation), `archiveOrder`, `closeOrder` (consume `closeOrder` domain de Plan 01).
- **Plan 04 (Wave 2 — Notes + Tasks mutation tools, paralelo a Plan 03):** consumes mismos helpers + `getContactNoteById` / `getOrderNoteById` / `getTaskById` de Plan 01 (A11 gap closure) para rehydrate verídico. 7 tools: `addContactNote`, `addOrderNote`, `archiveContactNote`, `archiveOrderNote`, `createTask`, `updateTask`, `completeTask`.
- **Plan 05+:** runner endpoint hardened, integration tests env-gated, E2E Playwright Kanban verification, project skill `.claude/skills/crm-mutation-tools.md`, scope rule en `CLAUDE.md` + `.claude/rules/agent-scope.md`.

---

*Standalone: crm-mutation-tools — Plan 02 (Wave 1)*
*Completed 2026-04-29.*
