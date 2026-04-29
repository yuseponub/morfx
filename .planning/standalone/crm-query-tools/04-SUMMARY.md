---
phase: standalone-crm-query-tools
plan: 04
subsystem: agent-tools
tags: [agent-tools, ai-sdk-v6, vitest, observability, workspace-isolation, order-lookup, active-order, config-driven, pii-redaction]

# Dependency graph
requires:
  - phase: standalone-crm-query-tools-02
    provides: OrderDetail extendido con shippingAddress/shippingCity/shippingDepartment + getCrmQueryToolsConfig domain function (consumido por findActiveOrderForContact)
  - phase: standalone-crm-query-tools-03
    provides: Modulo skeleton — types.ts + index.ts factory + contacts.ts pattern espejado en orders.ts; CrmQueryLookupResult / CrmQueryListResult discriminated unions; phoneSuffix PII redaction pattern; vi.hoisted + vi.mock test pattern
provides:
  - "4 order tools `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById` — AI SDK v6 tool() listas para spread"
  - "Helper `findActiveOrderForContact(domainCtx, contactId, pipelineIdOverride?)` encapsula D-15/D-16/D-17/D-27 — single source of truth"
  - "Helper `resolveContactByPhone(domainCtx, rawPhone)` extrae phone normalize + duplicates resolution (reusable cross-tool)"
  - "Discriminated union extendida con `config_not_set` status (D-27) — agente distingue `operador no configuro` vs `cliente sin pedido activo`"
  - "Factory `createCrmQueryTools(ctx)` ahora retorna 5 tools (1 contacts + 4 orders) — modulo feature-complete"
  - "27 unit tests verdes (9 helpers + 18 orders) cubriendo D-10/D-15/D-16/D-17/D-23/D-27"
  - "BLOCKER invariant verificado por grep: cero `createAdminClient` y cero `@supabase/supabase-js` imports en orders.ts y helpers.ts (solo doc-comment header los menciona)"
affects:
  - standalone-crm-query-tools-05  # Plan 05 UI editorial: guardara config que el helper lee fresco cada call
  - standalone-crm-query-tools-06  # Plan 06 integration tests: invocara las 5 tools con ctx real contra DB
  - standalone-crm-query-tools-07  # Plan 07 INTEGRATION-HANDOFF: documentara las 4 nuevas tools + ejemplo de findActiveOrderForContact

# Tech tracking
tech-stack:
  added: []  # Plan 04 es feature-complete del modulo Plan 03 — no introduce libs nuevas
  patterns:
    - "Helper extraction pattern: logica D-15/D-16/D-17/D-27 vive en `helpers.findActiveOrderForContact` — orders tool hace solo orchestration + observability shell. Aisla logica de partition de la capa de tool/observability — testeable independiente"
    - "Mock-at-helper-boundary pattern: orders.test.ts mockea `../helpers` para no duplicar cobertura de findActiveOrderForContact (ya cubierto en helpers.test.ts) — separacion limpia de unidades"
    - "Discriminated union extendida con `config_not_set`: TS exhaustiveness checking ayuda a futuros consumidores a manejar todos los statuses sin olvidar el caso de config vacia"
    - "Multi-active resolution con `Math.max(0, actives.length - 1)`: defensive programming para no retornar negativo si actives vacio"
    - "Sort DESC por `createdAt` con `localeCompare` (lexical sort sobre ISO 8601 strings) — Pitfall 3 mitigado, no Date parsing innecesario"

key-files:
  created:
    - "src/lib/agents/shared/crm-query-tools/helpers.ts (129 lineas)"
    - "src/lib/agents/shared/crm-query-tools/orders.ts (410 lineas)"
    - "src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts (137 lineas)"
    - "src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts (218 lineas)"
  modified:
    - "src/lib/agents/shared/crm-query-tools/index.ts (28 lineas — spread makeOrderQueryTools)"

key-decisions:
  - "Patron `collector = () => getCollector()` en orders.ts: getCollector se llama en cada emit (no se cachea). Garantiza que si el ALS context cambia mid-execution (ej. tool re-invocado en otro pipeline_decision scope), el evento llega al collector correcto. Costo: 1 lookup ALS por evento (~negligible)."
  - "`baseEvt(toolName)` factory dentro de makeOrderQueryTools: evita repetir `{ tool, workspaceId, invoker }` en cada `recordEvent` (~30+ callsites). Closure captura `ctx`, recibe `toolName` por param."
  - "4 commits atomicos en lugar de uno consolidado del Task 4.5: task_commit_protocol manda commit per task. Task 4.5 fue solo verificacion + push (no agrega archivos), siguiendo precedente de Plan 03 Task 3.4."
  - "Skip de `getOrderByPhone` directo en favor de `resolveContactByPhone` -> `listOrders(contactId)` -> `getOrderById`: domain `listOrders` no acepta filtro por phone, solo por contactId. La doble call (phone -> contactId -> orders) es el path canonico documentado en RESEARCH.md."
  - "OrderListItem mock incluye `archivedAt: null`: el plan original omitia el campo, pero `OrderListItem` lo declara en `src/lib/domain/orders.ts:1681`. Lo agregue en buildOrderListItem helper para que el tipo siempre se satisfaga estructuralmente — esto fue auto-fix Rule 1 (TS strict). Plan 04 instrucciones literales lo omitian; verificacion manual del shape en domain confirmo el campo."

requirements-completed: [D-02, D-07, D-10, D-15, D-16, D-17, D-18, D-19, D-20, D-23, D-27]

# Metrics
duration: ~10min
completed: 2026-04-29
---

# Standalone crm-query-tools Plan 04: 4 Order Tools + helpers.findActiveOrderForContact + Unit Tests

**El modulo `src/lib/agents/shared/crm-query-tools/` queda feature-complete con 5 tools deterministas (1 contact + 4 orders), 35 unit tests verdes y BLOCKER invariant cero. La logica de `pedido activo` (D-15 multi-active / D-17 last_terminal / D-27 config_not_set / D-16 pipelineId override) vive aislada en `helpers.findActiveOrderForContact`, testeable independiente, y consumida por `getActiveOrderByPhone` como orchestration shell con observability**

## Performance

- **Duration:** ~10 min (start 18:18:09Z, end 18:28:08Z UTC)
- **Tasks:** 5/5
- **Files created:** 4 (helpers.ts, orders.ts, 2 test suites)
- **Files modified:** 1 (index.ts — agrego spread makeOrderQueryTools, removio comentarios placeholder)
- **Lines added:** ~922 (922 lineas totales en los 5 archivos)
- **Commits:** 4 atomic feat/test commits (`ad4fda4`, `c8763c8`, `5e25d60`, `b9e570d`)
- **Tests added:** 27 unit (9 helpers + 18 orders) — todos verdes en ~60ms combinados
- **Module test count:** 35 (8 contacts del Plan 03 + 27 del Plan 04)
- **tsc:** exit 0 (zero errors en todo el repo, no solo en el modulo)
- **Anti-pattern greps:** 0 matches en los 4 checks (BLOCKER 1, hardcoded stages, session writes, module-scope cache)

## Accomplishments

- `helpers.ts` extrae 2 funciones reusables:
  - `resolveContactByPhone(domainCtx, rawPhone)` — phone normalize + searchContacts ILIKE + filter exacto + getContactById newest. Usado por las 3 tools por-telefono (getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone) en lugar de duplicar el flow.
  - `findActiveOrderForContact(domainCtx, contactId, pipelineIdOverride?)` — single source of truth para D-15/D-16/D-17/D-27. Lee config fresca (D-19), partition orders en active vs terminal, retorna `ActiveOrderResolution` typed.
- `orders.ts` (410 lineas) implementa 4 tools AI SDK v6 con observability shell consistente:
  - `getLastOrderByPhone` — resolve -> listOrders(limit:1) -> getOrderById -> found/no_orders/not_found/error.
  - `getOrdersByPhone` — resolve -> listOrders(limit, offset) -> ok/no_orders/not_found/error. Lista paginada (zod default limit=20, max=50).
  - `getActiveOrderByPhone` — resolve -> findActiveOrderForContact -> ramas D-27 (config_not_set), D-17 (no_active_order + last_terminal_order detail), D-15 (found + other_active_orders_count), error. UNICO tool con `pipelineId?` override.
  - `getOrderById` — getOrderById domain directo -> found/not_found/error. Espejo de `crm-reader.ordersGet` segun D-02.
- `index.ts` actualizado: `createCrmQueryTools(ctx)` ahora retorna 5 tools (`getContactByPhone` + 4 nuevas) via spread `{ ...makeContactQueryTools(ctx), ...makeOrderQueryTools(ctx) }`.
- Discriminated union de `types.ts` (Plan 03) extendida — los 4 nuevos tool returns usan `config_not_set` (Plan 03 ya lo tenia en el union por D-27, ahora finalmente consumido).
- 27 unit tests cubriendo:
  - **helpers.test.ts (9 tests):** D-27 configWasEmpty con/sin override, D-15 multi-active resolution + otherActiveCount, D-17 last_terminal cuando no hay active, D-16 pipelineId priority (3 cases: override beats config, falls back to config, undefined when both null), error path (throws on listOrders fail), resolveContactByPhone invalid_phone sanity.
  - **orders.test.ts (18 tests):** Por tool — getLastOrderByPhone (5: invalid/not_found/no_orders/found/db_error), getOrdersByPhone (4: ok/no_orders/limit+offset threading/not_found), getActiveOrderByPhone (6: D-27 config_not_set, D-17 con/sin last_terminal, D-15 found+other_active_orders_count, D-16 pipelineId threading, invalid_phone), getOrderById (3: found/not_found/db_error).
- Anti-pattern greps verificados:
  - Imports `createAdminClient` o `@supabase/supabase-js` en orders.ts/helpers.ts: **0**
  - Hardcoded stage names (`'CONFIRMADO'`, `'ENTREGADO'`, `'FALTA INFO'`, `'NUEVO PAG WEB'`, `is_closed`) excluyendo tests: **0**
  - SessionManager / datos_capturados writes (D-21): **0**
  - Module-scope cache (Map / LRU / `^const cache`) excluyendo tests (D-19): **0**
- Push a `origin/main` exitoso: `6cfe631..b9e570d` (4 commits new).

## Task Commits

Cada task committed atomicamente con conventional-commit format:

1. **Task 4.1 — helpers.ts** — `ad4fda4` (`feat(crm-query-tools): plan-04 task 4.1 — helpers.ts (resolveContactByPhone + findActiveOrderForContact)`)
2. **Task 4.2 — orders.ts + index.ts wiring** — `c8763c8` (`feat(crm-query-tools): plan-04 task 4.2 — 4 order tools wired into factory`)
3. **Task 4.3 — helpers.test.ts** — `5e25d60` (`test(crm-query-tools): plan-04 task 4.3 — unit tests helpers (D-15/16/17/27)`)
4. **Task 4.4 — orders.test.ts** — `b9e570d` (`test(crm-query-tools): plan-04 task 4.4 — unit tests 4 order tools (D-10/15/16/17/27)`)
5. **Task 4.5 — Anti-pattern grep + push** — n/a (no archivos nuevos; solo verificacion + push de los 4 commits anteriores; precedente de Plan 03 Task 3.4)

## Files Created/Modified

### Created (este agente)

- **`src/lib/agents/shared/crm-query-tools/helpers.ts`** (129 lineas) — 2 helpers + `ActiveOrderResolution` interface + `ResolveContactByPhoneResult` type. Imports SOLO `@/lib/domain/contacts` (`searchContacts`, `getContactById`, `ContactDetail`), `@/lib/domain/orders` (`listOrders`, `OrderListItem`), `@/lib/domain/crm-query-tools-config` (`getCrmQueryToolsConfig`), `@/lib/utils/phone` (`normalizePhone`), `@/lib/domain/types` (`DomainContext`). Cero DB direct.
- **`src/lib/agents/shared/crm-query-tools/orders.ts`** (410 lineas) — `makeOrderQueryTools(ctx)` factory + 4 tools. Imports SOLO `@/lib/domain/orders`, `@/lib/domain/types`, `@/lib/audit/logger`, `@/lib/observability`, `./helpers`, `./types`, `ai`/`zod`. Cero DB direct.
- **`src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts`** (137 lineas) — 9 tests, 6 describe blocks. Mock pattern: `vi.hoisted` + `vi.mock('@/lib/domain/...')`.
- **`src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts`** (218 lineas) — 18 tests, 4 describe blocks (uno por tool). Mock pattern: incluye mock de `../helpers` para aislamiento.

### Modified

- **`src/lib/agents/shared/crm-query-tools/index.ts`** (28 lineas) — agregue import de `makeOrderQueryTools`, removio comentarios placeholder `Plan 04 adds:` / `Plan 04: ...makeOrderQueryTools(ctx),`, agregue spread en `createCrmQueryTools`.

## Decisions Made

- **`collector = () => getCollector()` en cada emit:** lookup ALS por evento garantiza que cambios mid-execution del observability context lleguen al collector correcto. Costo despreciable (~ns por lookup).
- **`baseEvt(toolName)` factory closure:** evita repetir `{ tool, workspaceId, invoker }` en ~30 callsites del archivo. Captura `ctx` por closure, recibe toolName por param.
- **`OrderListItem.archivedAt: null` en mock helper:** el shape real del domain `OrderListItem` requiere `archivedAt: string | null` (verificado en `src/lib/domain/orders.ts:1681`). Plan 04 instructions originales omitian el campo, pero el TS strict del compilador exigia satisfacer la interface estructuralmente. Auto-fix Rule 1 — agregue `archivedAt: null` en `buildOrderListItem` y en el helper `order()` de helpers.test.ts. Documentado abajo en Deviations.
- **Skip Task 4.5 commit consolidado:** task_commit_protocol manda commit per task. Task 4.5 es verificacion + push (no agrega archivos). Precedente: Plan 03 Task 3.4 hizo lo mismo. El plan instruia un commit consolidado pero seria duplicar el contenido ya commiteado en 4.1/4.2/4.3/4.4 atomicamente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OrderListItem mock no incluia campo `archivedAt`**
- **Found during:** Task 4.4 (unit test setup)
- **Issue:** Plan 04 instrucciones literales en Task 4.4 definian `buildOrderListItem` retornando `{ id, contactId, pipelineId, stageId, totalValue, createdAt }` (6 campos). Pero `OrderListItem` real en `src/lib/domain/orders.ts:1674-1682` declara 7 campos — falta `archivedAt: string | null`. Si los mocks se hubieran tipado estricto contra `OrderListItem[]`, TS habria rechazado.
- **Fix:** Agregue `archivedAt: null` en el helper `buildOrderListItem` (orders.test.ts:50) y `order()` (helpers.test.ts:21). Mantiene shape estructuralmente compatible — los tests siguen funcionando con el orden tools real (que solo lee `id`, `stageId`, `createdAt`, `contactId`, `pipelineId`). No afecta la logica.
- **Files modified:** `src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts`, `src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts`
- **Commit:** `5e25d60` (helpers test) y `b9e570d` (orders test)

**2. [Rule 1 - Bug] Cast `Tool -> { execute }` requiere `as unknown as` (heredado de Plan 03)**
- **Found during:** Task 4.4 setup (al copiar el patron de tests del Plan 03)
- **Issue:** TS strict requiere doble cast a `unknown` para convertir el tipo `Tool` de AI SDK v6 a `{ execute: ... }`. Plan 03 ya documento este issue (LEARNINGS Plan 03 Deviation 1), Plan 04 lo replica.
- **Fix:** `(tools[toolName] as unknown as { execute: (i: unknown) => Promise<unknown> })` — exactamente el mismo patron de Plan 03 contacts.test.ts.
- **Files modified:** `src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts`
- **Commit:** `b9e570d`

### No Architectural Deviations

Ninguna deviacion Rule 4 (arquitectura). El plan se ejecuto al pie de la letra excepto los dos auto-fixes Rule 1 anteriores.

## Authentication Gates

Ninguno. Todos los tasks fueron `type: auto` autonomous, sin checkpoints, sin auth requerida.

## Issues Encountered

- **4 integration test files fallan en full test suite (PRE-EXISTENTE — heredado de Plan 03):** `src/__tests__/integration/crm-bots/{reader,security,ttl-cron,writer-two-step}.test.ts`. Todos requieren env vars `TEST_WORKSPACE_ID` y `TEST_API_KEY` no disponibles en el entorno local del executor. **NO causados por este plan** — el plan toca solo `src/lib/agents/shared/crm-query-tools/`. Out-of-scope per scope_boundary del executor (mismo treatment que Plan 03). Los **463 unit tests pasan limpiamente, incluyendo los 27 nuevos**. Plan 06 puede correr full integration con env vars seteadas.
- **Working tree dirty heredado:** el repo trae cambios sin staged en `.planning/...`, `scripts/...`, `app.json`, etc. (160+ entries). Se respeto strictly — solo `git add` explicito de los 5 archivos del Plan 04. NUNCA `git add .` o `git add -A`. Rule de `<sequential_execution>` cumplida.
- **PreToolUse:Edit reminder en index.ts:** despues del primer Edit del archivo, el ambiente envio `READ-BEFORE-EDIT REMINDER` aunque ya habia hecho Read inicial del file. Hice Read defensivo y verifique que el edit ya estaba aplicado. No-blocking.

## Self-Check

**Files exist:**
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/helpers.ts` (129 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/orders.ts` (410 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts` (137 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts` (218 lineas)
- `[FOUND]` `src/lib/agents/shared/crm-query-tools/index.ts` (28 lineas — modified)

**Commits exist on origin/main (verified `git log @{u}..HEAD` empty post-push):**
- `[FOUND]` `ad4fda4` — `feat(crm-query-tools): plan-04 task 4.1 — helpers.ts (resolveContactByPhone + findActiveOrderForContact)`
- `[FOUND]` `c8763c8` — `feat(crm-query-tools): plan-04 task 4.2 — 4 order tools wired into factory`
- `[FOUND]` `5e25d60` — `test(crm-query-tools): plan-04 task 4.3 — unit tests helpers (D-15/16/17/27)`
- `[FOUND]` `b9e570d` — `test(crm-query-tools): plan-04 task 4.4 — unit tests 4 order tools (D-10/15/16/17/27)`

**Acceptance criteria (Tasks 4.1 / 4.2 / 4.3 / 4.4 / 4.5):**
- `[OK]` Task 4.1: `grep -c 'resolveContactByPhone' helpers.ts` returns 2 (>=1)
- `[OK]` Task 4.1: `grep -c 'findActiveOrderForContact' helpers.ts` returns 2 (>=1)
- `[OK]` Task 4.1: `grep -c 'configWasEmpty' helpers.ts` returns 4 (>=3)
- `[OK]` Task 4.1: `grep -c '@/lib/domain/' helpers.ts` returns 4 (>=3)
- `[OK]` Task 4.1: createAdminClient imports = 0
- `[OK]` Task 4.1: `grep -c 'pipelineIdOverride === undefined' helpers.ts` returns 1
- `[OK]` Task 4.2: 4 tool entries (`getLastOrderByPhone:`, `getOrdersByPhone:`, `getActiveOrderByPhone:`, `getOrderById:`)
- `[OK]` Task 4.2: `grep -c 'config_not_set' orders.ts` returns 3 (>=1)
- `[OK]` Task 4.2: `grep -c 'other_active_orders_count' orders.ts` returns 4 (>=1)
- `[OK]` Task 4.2: `grep -c 'last_terminal_order' orders.ts` returns 2 (>=1)
- `[OK]` Task 4.2: `grep -c 'pipelineId' orders.ts` returns 6 (>=2)
- `[OK]` Task 4.2: createAdminClient/supabase IMPORTS in orders.ts = 0 (la unica linea matched es el doc-comment header `*  grep -rn ...` — no es un statement de import)
- `[OK]` Task 4.2: index.ts contains `makeOrderQueryTools` = 2 (import + spread)
- `[OK]` Task 4.3: 9 it() blocks (>=9)
- `[OK]` Task 4.3: `grep -c 'configWasEmpty' helpers.test.ts` returns 4 (>=3)
- `[OK]` Task 4.3: `grep -c 'otherActiveCount' helpers.test.ts` returns 3 (>=3)
- `[OK]` Task 4.3: `grep -c 'lastTerminal' helpers.test.ts` returns 4 (>=2)
- `[OK]` Task 4.3: `grep -c 'pipelineId' helpers.test.ts` returns 16 (>=3)
- `[OK]` Task 4.4: 18 it() blocks (>=16)
- `[OK]` Task 4.4: `grep -c 'config_not_set' orders.test.ts` returns 3 (>=1)
- `[OK]` Task 4.4: `grep -c 'other_active_orders_count' orders.test.ts` returns 2 (>=1)
- `[OK]` Task 4.4: `grep -c 'last_terminal_order' orders.test.ts` returns 5 (>=2)
- `[OK]` Task 4.4: `grep -c 'pipelineId' orders.test.ts` returns 4 (>=1)
- `[OK]` Task 4.5: BLOCKER 1 import grep returns 0
- `[OK]` Task 4.5: hardcoded stages grep returns 0
- `[OK]` Task 4.5: SessionManager/datos_capturados grep returns 0
- `[OK]` Task 4.5: Module-scope cache grep returns 0
- `[OK]` Task 4.5: `npx tsc --noEmit -p .` exit 0
- `[OK]` Task 4.5: scoped vitest `npm run test -- --run src/lib/agents/shared/crm-query-tools` returns 35 passed (8 + 9 + 18)
- `[DEFERRED]` Task 4.5: full vitest `npm run test -- --run` — 463 passed / 4 integration files failed por env vars TEST_WORKSPACE_ID + TEST_API_KEY missing (PRE-EXISTENTE Plan 03, out of scope)
- `[OK]` Task 4.5: `git log @{u}..HEAD` empty post-push (`6cfe631..b9e570d` aplicado)

## Self-Check: PASSED

Todos los archivos creados/modificados existen y todos los commits de Plan 04 estan en origin/main. Los 4 integration tests pre-existentes que fallan estan documentados como issue conocido (out-of-scope), idéntico al estado en que los dejó Plan 03.

## Threat Flags

Ninguno nuevo. El threat model del plan (T-W3-01..T-W3-08) cubre la superficie introducida; ninguna nueva ruta de red, auth path, file access, ni schema change a trust boundary mas alla de lo planificado.
