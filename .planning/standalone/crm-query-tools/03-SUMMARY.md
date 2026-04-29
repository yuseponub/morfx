---
phase: standalone-crm-query-tools
plan: 03
subsystem: agent-tools
tags: [agent-tools, ai-sdk-v6, vitest, observability, workspace-isolation, contact-lookup, phone-normalization]

# Dependency graph
requires:
  - phase: standalone-crm-query-tools-02
    provides: ContactDetail extendido con `department: string | null`; getContactByPhone consume getContactById que ya devuelve ese campo aditivo
provides:
  - "Modulo `src/lib/agents/shared/crm-query-tools/` (NUEVO en `src/lib/agents/`)"
  - "Factory `createCrmQueryTools(ctx)` exportado desde `index.ts` — spread-friendly hacia AI SDK v6 tools"
  - "Discriminated union `CrmQueryLookupResult<T>` / `CrmQueryListResult<T>` con statuses found / not_found / no_orders / no_active_order / config_not_set / error (D-07, D-10, D-17, D-27)"
  - "Convenience type `ContactWithDuplicates = ContactDetail & { duplicates_count, duplicates: string[] }` (D-08)"
  - "Tool deterministica `getContactByPhone({ phone })` AI SDK v6 tool() — phone normalization E.164 + duplicate detection + observability"
  - "8 unit tests verdes cubriendo D-05 / D-07 / D-08 / D-09 / D-10 / D-23"
  - "BLOCKER invariant verificado por grep: cero `createAdminClient` y cero `@supabase/supabase-js` imports en el modulo (solo doc-comment header los menciona)"
affects:
  - standalone-crm-query-tools-04  # Plan 04 agrega los 4 order tools usando los mismos types + factory pattern
  - standalone-crm-query-tools-05  # Plan 05 UI editorial — no consume directamente este modulo, pero reusa CrmQueryToolsContext shape mentalmente
  - standalone-crm-query-tools-06  # Plan 06 integration tests — invocara createCrmQueryTools con ctx real
  - standalone-crm-query-tools-07  # Plan 07 INTEGRATION-HANDOFF.md — documentara getContactByPhone como primera tool integrable

# Tech tracking
tech-stack:
  added:
    - "`src/lib/agents/shared/` directorio nuevo (no existia bajo `src/lib/agents/` — solo `_shared/` con underscore)"
    - "Modulo `src/lib/agents/shared/crm-query-tools/` con index.ts, types.ts, contacts.ts, __tests__/"
  patterns:
    - "Factory + ctx-closure (mismo patron que `createReaderTools(ctx)` en crm-reader)"
    - "Two-layer strict: tool -> domain (zero `createAdminClient` en tool layer — Regla 3 + BLOCKER 1 invariant heredado de Phase 44)"
    - "Phone normalize twice (entrada + filtro post-search) para casar E.164 exacto y evitar falsos positivos por substring ILIKE (Pitfall 4)"
    - "Discriminated-union returns con `status` field — exhaustivos en switch (TS exhaustiveness aprovechable downstream)"
    - "PII redaction en observability: `phoneSuffix(raw).slice(-4)` UNICA forma del telefono enviada a `pipeline_decision:*` events"
    - "vi.hoisted + vi.mock pattern para mockear domain + observability sin coupling a implementacion (mismo patron que crm-writer-adapter.test.ts)"

key-files:
  created:
    - "src/lib/agents/shared/crm-query-tools/types.ts (52 lineas)"
    - "src/lib/agents/shared/crm-query-tools/index.ts (28 lineas)"
    - "src/lib/agents/shared/crm-query-tools/contacts.ts (168 lineas)"
    - "src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts (224 lineas)"
  modified: []

key-decisions:
  - "Renombrar `not_found_in_workspace` -> `not_found` (Open Q7): workspace es implicito en ctx, no hay otro tipo de not_found. Doc-comment en types.ts explica la divergencia frente a crm-reader sin usar el termino prohibido."
  - "Cast tests `Tool -> { execute }` via `as unknown as` (TS strict): el cast directo no satisface compatibilidad estructural por las propiedades opcionales del Tool de AI SDK v6. Esto es solo en tests; el runtime es correcto."
  - "Plan 03 logra **2 commits feat + 1 test commit + cero refactor** = 3 commits Plan-03 atomicos en main (`2a88ef2`, `15d62c8`, `08ad329`). NO se hizo commit consolidado del Task 3.4 porque el working tree quedo limpio tras 3.3."
  - "Skip integration test failures pre-existentes (ver Issues Encountered) — out-of-scope del plan, no son regresiones."

patterns-established:
  - "Pattern: factory `createCrmQueryTools(ctx)` listo para spread `tools: { ...createCrmQueryTools(ctx) }` en futuros agentes — DRY entre consumidores."
  - "Pattern: `phoneSuffix()` helper privado para PII redaction — replicable en futuras tools que reciban telefono."
  - "Pattern: tests con `vi.mock('@/lib/observability', () => ({ getCollector: () => ({ recordEvent: mock }) }))` — verifica eventos sin acoplar a implementacion del collector."

requirements-completed: [D-04, D-05, D-07, D-08, D-09, D-10, D-18, D-19, D-20, D-23]

# Metrics
duration: ~30min
completed: 2026-04-29
---

# Standalone crm-query-tools Plan 03: Module Skeleton + getContactByPhone + Unit Tests

**Vertical slice end-to-end de la primera tool deterministica: factory aggregator + discriminated-union types + getContactByPhone con phone normalization, duplicate detection y observability — todo verificado por 8 unit tests verdes y BLOCKER invariant grep cero**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-29T18:00:00Z (approx)
- **Completed:** 2026-04-29T18:14:00Z (approx)
- **Tasks:** 4/4
- **Files created:** 4 (1 types, 1 factory, 1 tool, 1 test suite)
- **Commits:** 3 atomic feat/test commits (`2a88ef2`, `15d62c8`, `08ad329`)
- **Tests added:** 8 unit (todos verdes en 31ms)
- **tsc:** exit 0 (zero errors en todo el repo)

## Accomplishments

- Modulo `src/lib/agents/shared/crm-query-tools/` creado desde cero (primera entrada bajo `src/lib/agents/shared/` — no existia, solo el legacy `_shared/`)
- Factory `createCrmQueryTools(ctx: CrmQueryToolsContext)` listo para que Plan 04 agregue los 4 order tools sin tocar consumidores
- Discriminated union exhaustiva: 6 statuses (`found`, `not_found`, `no_orders`, `no_active_order`, `config_not_set`, `error`) — futuras tools respetan este shape
- `ContactWithDuplicates = ContactDetail & { duplicates_count, duplicates: string[] }` — convenience type para D-08, no fork de ContactDetail
- `getContactByPhone({ phone })`: tool AI SDK v6 con AI-friendly description + zod inputSchema + execute async retornando `CrmQueryLookupResult<ContactWithDuplicates>`
- Phone normalization via `normalizePhone` de `@/lib/utils/phone` (mismo helper que webhook-processor.ts) — D-09 garantizado
- Duplicate detection: search ILIKE (substring) -> filtro post-query con `normalizePhone(c.phone) === e164` (Pitfall 4 — evita falsos positivos por substring) -> sort DESC createdAt -> primary newest + duplicates older
- Observability: 3 events emitidos a `pipeline_decision:*` (`crm_query_invoked`, `crm_query_completed`, `crm_query_failed`) con phoneSuffix (last-4-digits) PII redactado y latencyMs
- 8 unit tests cubriendo: D-09 invalid_phone, D-10 not_found, D-08 duplicates (newest first + count + list), happy path single contact, db_error desde searchContacts, detail_fetch_failed desde getContactById, D-23 PII redaction (no '+57', no '3001234567' en payload), D-05 workspace isolation
- Push a `origin/main` exitoso: `68f34b5..08ad329`

## Task Commits

Cada task committed atomicamente:

1. **Task 3.1 — types.ts + index.ts** — `2a88ef2` (`feat(crm-query-tools): plan-03 task 3.1 — types + factory aggregator skeleton`)
2. **Task 3.2 — contacts.ts (getContactByPhone)** — `15d62c8` (`feat(crm-query-tools): plan-03 task 3.2 — getContactByPhone implementation`)
3. **Task 3.3 — __tests__/contacts.test.ts** — `08ad329` (`test(crm-query-tools): plan-03 task 3.3 — unit tests getContactByPhone`)
4. **Task 3.4 — Anti-pattern grep verification + push** — n/a (no archivos nuevos; verificacion + push de los 3 commits anteriores)

## Files Created/Modified

### Created (este agente)

- **`src/lib/agents/shared/crm-query-tools/types.ts`** (52 lineas) — discriminated unions + `CrmQueryToolsContext` + `ContactWithDuplicates`. Importa `ContactDetail`, `OrderDetail` desde domain (D-18 — no fork).
- **`src/lib/agents/shared/crm-query-tools/index.ts`** (28 lineas) — factory `createCrmQueryTools(ctx)` con spread de `makeContactQueryTools`. Re-exporta los 4 types publicos.
- **`src/lib/agents/shared/crm-query-tools/contacts.ts`** (168 lineas) — `makeContactQueryTools(ctx)` factory + tool `getContactByPhone`. Imports SOLO `@/lib/domain/contacts` (`searchContacts`, `getContactById`), `@/lib/domain/types` (`DomainContext`), `@/lib/audit/logger`, `@/lib/observability`, `@/lib/utils/phone` y `ai`/`zod`. Cero DB direct.
- **`src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts`** (224 lineas) — 8 tests, 7 describe blocks. Mock pattern: `vi.hoisted` + `vi.mock('@/lib/domain/contacts')` + `vi.mock('@/lib/observability')`.

### Modified

Ninguno — Plan 03 es additive only.

## Decisions Made

- **Rename `not_found_in_workspace` -> `not_found`:** workspace es implicito en `ctx`, el termino largo de crm-reader era redundante. Doc-comment en `types.ts` documenta la divergencia (originalmente el plan instruia usar literalmente la palabra `'not_found_in_workspace'` en el comentario, pero eso fallaba el acceptance criterion `grep -c 'not_found_in_workspace' returns 0`. Reformule el comentario manteniendo la semantica).
- **Cast `Tool -> { execute }` via `as unknown as`:** TS strict requirement. El plan instruia cast directo, pero TS rechazaba la conversion. Aplique Rule 1 (auto-fix bug) — cast intermedio a `unknown` segun sugiere el propio mensaje del compilador. Funcionalmente equivalente al runtime (`execute` esta presente).
- **3 commits atomicos en lugar de 1 consolidado del Task 3.4:** task_commit_protocol manda commit per task. Task 3.4 fue solo verificacion + push (no requiere commit nuevo porque no agrega archivos).
- **Skip de `getContactById` directo en favor de search + filter + getContactById:** podriamos haber buscado directo por phone con `getContactByPhone` domain (no existe), pero `searchContacts` ILIKE es la API de domain disponible. El filtro post-query con `normalizePhone(c.phone) === e164` evita Pitfall 4 (substring matches falsos como '4567' matcheando '14567', '24567', etc).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS strict rechaza cast directo `Tool -> { execute }`**
- **Found during:** Task 3.3 verify (`npx tsc --noEmit -p .`)
- **Issue:** El plan instruia `tools.getContactByPhone as { execute: (i: unknown) => Promise<unknown> }`. TS protestaba: `Type 'Tool<{...}>' may not be comparable to '{ execute: ... }'. neither type sufficiently overlaps. Type 'undefined' is not comparable to type '(i: unknown) => Promise<unknown>'`.
- **Fix:** Cast intermedio a `unknown`: `tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }`. Sugerido por el mismo mensaje TS ("If this was intentional, convert the expression to 'unknown' first.").
- **Files modified:** `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` (8 ocurrencias via Edit replace_all).
- **Commit:** `08ad329`

**2. [Rule 1 - Bug] Acceptance criterion contradice doc-comment instructivo**
- **Found during:** Task 3.1 verify
- **Issue:** Plan instruia escribir literalmente `'not_found_in_workspace' per Open Q7` en el doc-comment, PERO el mismo plan tenia acceptance `grep -c "not_found_in_workspace" {file}` returns 0.
- **Fix:** Reformule el doc-comment para describir la divergencia sin usar el string literal `not_found_in_workspace`. Ahora dice: "renamed from the crm-reader equivalent ('not found in this workspace') per Open Q7 since workspace scoping is implicit in ctx". Mantiene el contexto historico, pasa el grep.
- **Files modified:** `src/lib/agents/shared/crm-query-tools/types.ts`
- **Commit:** `2a88ef2`

## Authentication Gates

Ninguno. Todos los tasks fueron `type: auto` autonomous, sin checkpoints, sin auth requerida.

## Issues Encountered

- **4 integration test files fallan en full test suite:** `src/__tests__/integration/crm-bots/{reader,security,ttl-cron,writer-two-step}.test.ts`. Todos requieren env vars `TEST_WORKSPACE_ID` y `TEST_API_KEY` no disponibles en el entorno local del executor. Pre-existentes — NO causados por este plan (el plan toca solo `src/lib/agents/shared/crm-query-tools/` y los tests que fallan son de `crm-bots`). Out-of-scope per scope_boundary del executor. Documentado aqui para que el orchestrator/verificador no investigue como regresion de Plan 03. Los 436 unit tests (incluyendo los 8 nuevos) pasan limpiamente.
- **Working tree dirty heredado:** el repo trae cambios sin staged en `.planning/...`, `scripts/voice-app/...`, `app.json`, etc. Se respeto strictly — solo `git add` explicito de los 4 archivos de Plan 03. NUNCA `git add .` o `git add -A`. Rule de `<sequential_execution>` cumplida.
- **PreToolUse:Edit reminders** (~2 en total) — el ambiente reenvio `READ-BEFORE-EDIT REMINDER` despues de aplicar edits. Los edits ya se habian aplicado correctamente. No bloqueante.

## Self-Check

**Files exist:**
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/types.ts` (52 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/index.ts` (28 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/contacts.ts` (168 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` (224 lineas)

**Commits exist on origin/main:**
- `[FOUND]` `2a88ef2` — `feat(crm-query-tools): plan-03 task 3.1 — types + factory aggregator skeleton`
- `[FOUND]` `15d62c8` — `feat(crm-query-tools): plan-03 task 3.2 — getContactByPhone implementation`
- `[FOUND]` `08ad329` — `test(crm-query-tools): plan-03 task 3.3 — unit tests getContactByPhone`

**Acceptance criteria (Tasks 3.1 / 3.2 / 3.3 / 3.4):**
- `[OK]` Task 3.1: `grep -c 'config_not_set' types.ts` returns 3 (>=1)
- `[OK]` Task 3.1: `grep -c 'not_found_in_workspace' types.ts` returns 0
- `[OK]` Task 3.1: `grep -c 'ContactDetail' types.ts` returns 7 (>=1)
- `[OK]` Task 3.1: `grep -c 'createCrmQueryTools' index.ts` returns 1
- `[OK]` Task 3.2: `grep -c 'import.*normalizePhone' contacts.ts` returns 1 (>=1)
- `[OK]` Task 3.2: `grep -c '@/lib/domain/contacts' contacts.ts` returns 1 (>=1)
- `[OK]` Task 3.2: `grep -c 'tool(' contacts.ts` returns 1 (>=1)
- `[OK]` Task 3.2: `grep -E '^import.*createAdminClient' contacts.ts` returns 0
- `[OK]` Task 3.2: `grep -E '^import.*@supabase/supabase-js' contacts.ts` returns 0
- `[OK]` Task 3.2: `grep -c 'ctx.workspaceId' contacts.ts` returns 4 (>=3)
- `[OK]` Task 3.2: `grep -c 'phoneSuffix' contacts.ts` returns 3 (>=3)
- `[OK]` Task 3.2: `grep -c 'recordEvent' contacts.ts` returns 6 (>=4)
- `[OK]` Task 3.3: `grep -c 'describe(' contacts.test.ts` returns 7 (>=6)
- `[OK]` Task 3.3: `grep -c 'duplicates_count' contacts.test.ts` returns 4 (>=2)
- `[OK]` Task 3.3: `grep -c 'phoneSuffix' contacts.test.ts` returns 2 (>=1)
- `[OK]` Task 3.3: 8 tests passing in vitest
- `[OK]` Task 3.4: anti-pattern greps todos cero (BLOCKER 1 cumplido, hardcoded stages cero, SessionManager cero, workspaceId in inputSchema cero)
- `[OK]` `npx tsc --noEmit -p .` exit 0 (zero errors en todo el repo)
- `[OK]` `git log @{u}..HEAD` empty (push sincronizado)

**Threat surface:** Sin nuevas surfaces de seguridad fuera del threat model documentado en el PLAN. Workspace isolation cubierta por test D-05; PII redaction cubierta por test D-23. No surfaces nuevas que reportar.

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 04 unblocked:** puede importar `CrmQueryToolsContext`, `CrmQueryLookupResult`, `CrmQueryListResult` desde `./types` y agregar `makeOrderQueryTools(ctx)` a `index.ts` (4 order tools: `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`). Patron canonical: copy-and-adapt de `contacts.ts` reusando `phoneSuffix` helper (extraer a archivo helper si Plan 04 lo necesita en multiple tools).
- **Plan 06 unblocked:** integration tests pueden invocar `createCrmQueryTools({ workspaceId: TEST_WORKSPACE_ID })` con domain real para verificar workspace isolation cross-workspace.
- **Plan 07 INTEGRATION-HANDOFF:** documenta `getContactByPhone` como primera tool integrable. Los snippets de wiring `tools: { ...createCrmQueryTools(ctx) }` ya son validos para futuros agentes.
- **No blockers.** Working tree dirty heredado no afecta a Plan 04+. Tests integration pre-existentes que fallan por env vars son out-of-scope.

---
*Standalone: crm-query-tools*
*Plan: 03 — Module Skeleton + getContactByPhone + Unit Tests*
*Completed: 2026-04-29*
