---
phase: standalone-crm-query-tools
plan: 02
subsystem: database
tags: [supabase, postgres, rls, domain-layer, workspace-config, typescript]

# Dependency graph
requires:
  - phase: standalone-crm-query-tools-01
    provides: Playwright bootstrap (no schema dependencies; pre-existing domain layer + Supabase admin client)
provides:
  - "Tabla `crm_query_tools_config` (singleton per workspace) en prod con 4 RLS policies + GRANTs"
  - "Tabla `crm_query_tools_active_stages` (junction) en prod con 3 RLS policies + GRANTs + indice por workspace_id"
  - "Trigger BEFORE UPDATE `trg_crm_query_tools_config_updated_at` (Bogota timezone, Regla 2)"
  - "Domain CRUD `getCrmQueryToolsConfig` (fail-open) + `updateCrmQueryToolsConfig` (DomainResult-wrapped)"
  - "ContactDetail extendido con `department: string | null` (D-18)"
  - "OrderDetail extendido con `shippingAddress`, `shippingCity`, `shippingDepartment` (Pitfall 9)"
affects:
  - standalone-crm-query-tools-03  # tools/active-order — consume getCrmQueryToolsConfig + activeStageIds
  - standalone-crm-query-tools-04  # tools/get-contact-by-phone, get-orders-by-phone — usan ContactDetail/OrderDetail extendidos
  - standalone-crm-query-tools-05  # UI editorial — consume updateCrmQueryToolsConfig via server action
  - standalone-crm-query-tools-recompra-integration   # follow-up
  - standalone-crm-query-tools-pw-confirmation-integration  # follow-up

# Tech tracking
tech-stack:
  added:
    - "Tabla `crm_query_tools_config` (singleton per-workspace UUID PK)"
    - "Tabla `crm_query_tools_active_stages` (junction PK compuesto)"
    - "Trigger plpgsql `bump_crm_query_tools_config_updated_at` (Regla 2 — Bogota TZ)"
  patterns:
    - "Workspace-scoped singleton config (pattern de `platform_config` migration 20260420000443)"
    - "Junction con FK CASCADE (stage deletion auto-limpia config — D-13)"
    - "FK SET NULL en pipeline_id (pipeline deletion vuelve al default 'all pipelines' — D-16)"
    - "GRANTs explicitos service_role+authenticated en cada nueva tabla (LEARNING heredado)"
    - "Domain fail-open en read (logged error → empty default) vs DomainResult en write (caller surface error)"
    - "Two-step propose+confirm NO aplica aqui — admin UI write usa upsert + delete-then-insert (last-write-wins acceptable)"

key-files:
  created:
    - "supabase/migrations/20260429172905_crm_query_tools_config.sql (Task 2.1, commit 8e2fefd, ya en main)"
    - "src/lib/domain/crm-query-tools-config.ts (Task 2.3, commit 87f7d5b)"
  modified:
    - "src/lib/domain/contacts.ts (Task 2.4, commit 87f7d5b — ContactDetail.department)"
    - "src/lib/domain/orders.ts (Task 2.4, commit 87f7d5b — OrderDetail shipping*)"

key-decisions:
  - "Migration aplicada en prod por usuario (Regla 5) con verification output: cfg_table=1, junction_table=1, cfg_policies=4, junction_policies=3"
  - "Fail-open en `getCrmQueryToolsConfig` — read errors solo loggean, devuelven default `{ pipelineId: null, activeStageIds: [] }` (D-27 distingue 'config_not_set' por activeStageIds.length===0)"
  - "Write usa upsert para singleton + delete-then-insert para junction (sin transaccion explicita; last-write-wins admisible para admin UI per RESEARCH Open Q5)"
  - "`updated_at` NUNCA seteado client-side — solo via DB trigger plpgsql (garantiza Bogota TZ, Regla 2)"
  - "Cambios a ContactDetail/OrderDetail son puramente aditivos (nuevos campos nullable) — Regla 6 satisfecha (zero breakage en agentes en prod)"

patterns-established:
  - "Pattern: workspace-scoped config como tabla dedicada (no JSONB) con junction para multi-select — plantilla para futuras configs de modulos compartidos"
  - "Pattern: domain fail-open vs fail-closed seleccionado por uso (read=fail-open, write=DomainResult)"
  - "Pattern: extender interfaces existentes (ContactDetail/OrderDetail) en vez de duplicarlas (D-18) — evita drift entre crm-reader y crm-query-tools"

requirements-completed: [D-11, D-12, D-13, D-16, D-18]

# Metrics
duration: ~25min (continuation agent — Tasks 2.3-2.5 + SUMMARY)
completed: 2026-04-29
---

# Standalone crm-query-tools Plan 02: Schema + Domain Layer Summary

**Persistencia workspace-scoped (2 tablas + 7 RLS + trigger Bogota TZ) + domain CRUD fail-open en read y DomainResult-wrapped en write + extensiones aditivas a ContactDetail/OrderDetail listas para que Plans 03/04/05 importen sin duplicar tipos**

## Performance

- **Duration:** ~25 min (continuation segment Tasks 2.3-2.5 + SUMMARY)
- **Started:** 2026-04-29T17:32:00Z (approx — orchestrator spawn this continuation agent)
- **Completed:** 2026-04-29T17:56:57Z
- **Tasks:** 5/5 (incluye Tasks 2.1+2.2 ejecutados por el agente previo)
- **Files modified:** 3 nuevos commits + 1 ya en main desde el agente previo

## Accomplishments

- Migration `20260429172905_crm_query_tools_config.sql` aplicada en prod por el usuario con verificacion explicita (cfg_table=1, junction_table=1, cfg_policies=4, junction_policies=3) — Regla 5 cumplida estrictamente
- Domain CRUD nuevo en `src/lib/domain/crm-query-tools-config.ts` exportando 2 funciones (`getCrmQueryToolsConfig`, `updateCrmQueryToolsConfig`) y 2 interfaces (`CrmQueryToolsConfig`, `UpdateCrmQueryToolsConfigParams`)
- `ContactDetail` ahora surface `department: string | null` (columna ya existia en DB; era invisible al typed read)
- `OrderDetail` ahora surface `shippingAddress | shippingCity | shippingDepartment: string | null` (Pitfall 9 — escritura existia desde Phase 9, lectura faltaba)
- Type-check completo (`npx tsc --noEmit -p .`) returns exit 0 — zero errores en todo el repo
- Push a `origin/main` exitoso: `60abcdb..87f7d5b` (Vercel deploy disparado)

## Task Commits

Cada task committed atomicamente. Tasks 2.1 y 2.2 (migracion + checkpoint Regla 5) las ejecuto el agente previo. Tasks 2.3-2.5 son los nuevos commits de este continuation agent:

1. **Task 2.1: Author migration** — `8e2fefd` (feat) [agente previo, ya en origin/main]
2. **Task 2.2: PAUSE — User applies migration to PROD** — n/a (resolved by user con verification output verbatim)
3. **Task 2.3: Create domain `crm-query-tools-config.ts`** — `87f7d5b` (feat, agrupado con 2.4)
4. **Task 2.4: Extend ContactDetail + OrderDetail** — `87f7d5b` (feat, mismo commit que 2.3 — los 3 archivos van juntos por scope cohesivo del wave)
5. **Task 2.5: Push migration + domain code** — `87f7d5b` push a origin/main exitoso

**Plan metadata:** SUMMARY commit pendiente en `git add` final tras este archivo.

_Note: el plan 2.3 + 2.4 se agrupo en un solo commit `87f7d5b` porque los 3 archivos forman una unidad atomica (domain layer del Wave 1). La migracion ya estaba aislada en `8e2fefd`. La estructura final en main es 2 commits `8e2fefd` (migracion) + `87f7d5b` (domain code), que coincide exactamente con la intent del Task 2.5 (`Last 2 commits on origin/main are: migration commit + domain commit`)._

## Files Created/Modified

### Created (este continuation agent)
- **`src/lib/domain/crm-query-tools-config.ts`** (172 lineas) — domain layer del modulo crm-query-tools. Patterns: `createAdminClient` (Regla 3), filter por `ctx.workspaceId` en cada query (12 ocurrencias), structured logging via `createModuleLogger('domain.crm-query-tools-config')`, fail-open en read + DomainResult en write, NO setea `updated_at` client-side (DB trigger lo maneja).

### Modified (este continuation agent)
- **`src/lib/domain/contacts.ts`** (+2 lineas) — `ContactDetail.department: string | null` agregado entre `city` y `createdAt`. SELECT en `getContactById` ahora incluye `department`. Mapping agrega `department: data.department`. Otros constructores literales de `ContactDetail` no existen (verificado con grep — solo `getContactById` lo construye).
- **`src/lib/domain/orders.ts`** (+6 lineas) — `OrderDetail.shippingAddress | shippingCity | shippingDepartment: string | null` agregados entre `description` y `createdAt`. SELECT en `getOrderById` ahora incluye las 3 columnas. Mapping agrega los 3 campos. Otros constructores literales de `OrderDetail` no existen (verificado con grep — solo `getOrderById` lo construye).

### Created (agente previo, ya en main)
- **`supabase/migrations/20260429172905_crm_query_tools_config.sql`** (~135 lineas) — DDL completo: 2 CREATE TABLE, 7 CREATE POLICY (4 cfg + 3 junction), 4 GRANT (2 service_role ALL + 2 authenticated SELECT), 1 CREATE INDEX, 1 CREATE OR REPLACE FUNCTION + 1 CREATE TRIGGER (Bogota TZ bump), 3 COMMENT ON.

## Decisions Made

- **Agrupacion de Tasks 2.3 + 2.4 en un solo commit:** los 3 archivos (`crm-query-tools-config.ts`, `contacts.ts`, `orders.ts`) son cohesivos como entrega del Wave 1 domain layer. El plan en su Task 2.5 instruia commit + push juntos. Mantener un solo commit para domain code (`87f7d5b`) facilita revert atomic si se descubre regresion. La migracion sigue en su propio commit `8e2fefd`.
- **Agente previo dejo `60abcdb` (lockfile fix) entre los dos commits del Wave 1:** documentado en el prompt de continuation. No se toca.
- Resto: seguir el plan al pie de la letra. Sin desviaciones.

## Deviations from Plan

None — plan ejecutado exactamente como esta escrito. Las unicas micro-decisiones cosmeticas:
1. Orden de imports en `crm-query-tools-config.ts` — `import { createModuleLogger }` antes de `import type { DomainContext, DomainResult }` (sigue convencion type-imports al final, igual que `contacts.ts`).
2. JSDoc de `getCrmQueryToolsConfig` y `updateCrmQueryToolsConfig` ampliado con explicacion de fail-open vs DomainResult (no estaba estrictamente en el plan pero el plan tenia comentarios in-line equivalentes).

## Issues Encountered

- **Multiples PreToolUse:Edit hook reminders** (~5 en total) — el ambiente reenvio `READ-BEFORE-EDIT REMINDER` despues de aplicar edits exitosamente. Los edits se aplicaron correctamente (verificado por re-read). No bloqueante. Comportamiento ya documentado en otros standalones recientes.
- **Otros archivos modificados en working tree no relacionados al plan** — el repo trae estado dirty heredado de sesiones previas del usuario (modificaciones a `.planning/...`, `scripts/voice-app/...`, etc.). Se respeto strictly — solo `git add` explicito de los 3 archivos del plan, NUNCA `git add .` o `git add -A`. Rule de `<sequential_execution>` cumplida.

## Verificacion Regla 5 (verbatim user output)

User confirmo migration apply con la query de verificacion del Task 2.2:
```
cfg_table = 1
junction_table = 1
cfg_policies = 4
junction_policies = 3
```
Match exacto al expected output del plan. Ningun error reportado. Codigo de domain layer pushed solo despues de esta confirmacion (Regla 5 strict).

## Self-Check

**Files exist:**
- `[FOUND]` `src/lib/domain/crm-query-tools-config.ts` — `test -f` returns 0
- `[FOUND]` `src/lib/domain/contacts.ts` — modified (line 599 `department: string | null`)
- `[FOUND]` `src/lib/domain/orders.ts` — modified (lines 1743-1745 shipping fields)
- `[FOUND]` `supabase/migrations/20260429172905_crm_query_tools_config.sql` — already on main

**Commits exist on origin/main:**
- `[FOUND]` `8e2fefd` — `feat(crm-query-tools): add migration for workspace config (Regla 5 pause)`
- `[FOUND]` `60abcdb` — `fix(crm-query-tools): regenerate pnpm-lock.yaml after Playwright bootstrap` (orchestrator)
- `[FOUND]` `87f7d5b` — `feat(crm-query-tools): domain layer + extend ContactDetail/OrderDetail`

**Type check:** `npx tsc --noEmit -p .` exit 0 — zero errores en todo el repo.

**Acceptance criteria:**
- `[OK]` `grep -c "createAdminClient" src/lib/domain/crm-query-tools-config.ts` returns 3 (≥1)
- `[OK]` `grep -c "ctx.workspaceId" src/lib/domain/crm-query-tools-config.ts` returns 12 (≥4)
- `[OK]` Funciones exportadas: `getCrmQueryToolsConfig`, `updateCrmQueryToolsConfig`
- `[OK]` Interfaces exportadas: `CrmQueryToolsConfig`, `UpdateCrmQueryToolsConfigParams`
- `[OK]` `grep -c "department: string | null" src/lib/domain/contacts.ts` returns 1 (≥1)
- `[OK]` `grep "department" src/lib/domain/contacts.ts | grep -c "data\.department"` returns 1 (≥1)
- `[OK]` `grep -c "shippingAddress: string | null" src/lib/domain/orders.ts` returns 2 (existe en `OrderForOcrMatching` line 1286 + `OrderDetail` line 1743) — ≥1 OK
- `[OK]` `grep -c "shippingCity: string | null" src/lib/domain/orders.ts` returns 2 (mismo patron — `OrderForOcrMatching` + `OrderDetail`) — ≥1 OK
- `[OK]` `grep -c "shippingDepartment: string | null" src/lib/domain/orders.ts` returns 1 (solo en `OrderDetail`; `OrderForOcrMatching` no tenia este campo) — ≥1 OK
- `[OK]` `grep "shipping_address" src/lib/domain/orders.ts | grep -c "data\.shipping_address"` returns 1 (≥1)
- `[OK]` `git log @{u}..HEAD` empty — todo en sync con origin
- `[OK]` Domain test files no existen en `src/lib/domain/__tests__/` — criterio "no regression" trivialmente satisfecho

## Self-Check: PASSED

## Next Phase Readiness

- **Wave 2 unblocked:** Plan 03 (`getActiveOrderByPhone` tool) puede importar `getCrmQueryToolsConfig` desde `@/lib/domain/crm-query-tools-config` para leer `activeStageIds` + `pipelineId`. Si `activeStageIds` esta vacio el tool retorna `{ status: 'config_not_set' }` per D-27.
- **Wave 3 unblocked:** Plan 04 (otras 4 query tools) puede consumir `OrderDetail.shipping*` y `ContactDetail.department` para devolver shape completo al agente sin duplicar tipos.
- **Wave 4 unblocked:** Plan 05 (UI editorial /agentes/[slug]) puede invocar `updateCrmQueryToolsConfig` desde server action para persistir seleccion de pipeline + active stages.
- **No blockers.** El working tree del repo tiene archivos dirty heredados (no del plan), pero no afectan a Wave 2/3/4 — se respetaron strictly.

---
*Standalone: crm-query-tools*
*Plan: 02 — Schema + Domain Layer*
*Completed: 2026-04-29*
