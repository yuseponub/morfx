---
phase: somnio-sales-v4
plan: 10
subsystem: ui-admin (review humano de unknown_cases — Next.js App Router server component)
tags: [ui, admin, server-component, server-actions, unknown-cases, somnio-scope, regla-3, regla-6, d-05, d-12, d-13, d-23, d-52, d-58, w-05]

# Dependency graph
requires:
  - phase: somnio-sales-v4
    provides: "Plan 02 — agent_unknown_cases table (cluster_id UUID + status enum 'pending'|'ready_for_promotion'|'promoted'|'dismissed')"
  - phase: somnio-sales-v4
    provides: "Plan 06 — SOMNIO_V4_AGENT_ID + SOMNIO_WORKSPACE_ID constants en src/lib/agents/somnio-v4/config.ts"
  - phase: somnio-sales-v4
    provides: "Plan 09 — captureUnknownCase + cluster.ts (rows con cluster_id + status='ready_for_promotion' fluyen hacia esta UI cuando el cron está habilitado)"

provides:
  - "src/lib/domain/unknown-cases.ts (4 funciones: listClusters, listUnclustered, dismissCluster, markPromoted; toda query filtra por workspace_id + agent_id=SOMNIO_V4_AGENT_ID)"
  - "Ruta UI /agentes/somnio-v4/unknown-cases (server component App Router)"
  - "Server actions dismissClusterAction + markPromotedAction (Zod-validated, revalidatePath, auth-gated Somnio-only)"
  - "3 client components: ClusterCard ('use client', invoca dismiss), UnclusteredList (server-renderable), PromoteDialog ('use client', invoca markPromoted)"

affects:
  - "Plan 11 (corpus + CLI) — independiente; la UI puede coexistir sin corpus seedeado (estado vacío explicativo cuando 0 clusters maduros)"
  - "Plan 13 (flip + activación) — post-flip + flag flip, las nuevas sesiones v4 producen rows que el cron de Plan 09 agrupa, y esta UI los expone al operador"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: Triple auth gate en server component admin UI — (1) cookie morfx_workspace, (2) supabase.auth.getUser + workspace_members membership con role != 'agent' (mismo patrón que /agentes/page.tsx), (3) workspaceId === SOMNIO_WORKSPACE_ID (D-23 / Regla 6 — v4 SOLO opera en Somnio)."
    - "Pattern: Server actions mutación-via-domain (Regla 3 estricta) — _actions.ts importa SOLO desde @/lib/domain/unknown-cases. Cero `createAdminClient` en el archivo (verificable via `grep -rc 'createAdminClient' 'src/app/(dashboard)/agentes/somnio-v4/'` → 0)."
    - "Pattern: revalidatePath('/agentes/somnio-v4/unknown-cases') tras cada mutación exitosa — refresca server component sin client-side state machinery."
    - "Pattern: helper authorizeSomnioWorkspace() compartido por las 2 server actions — single source of truth para auth + scope check, devuelve discriminated union { ok: true, workspaceId } | { ok: false, error }."
    - "Pattern: client component disabled-while-pending con useTransition + error state local — ClusterCard maneja errores en estado local sin alert(), UX limpia."
    - "Pattern: TZ='America/Bogota' en TODA presentación de fechas (toLocaleDateString + toLocaleString) — coherente con Regla 2."

key-files:
  created:
    - "src/lib/domain/unknown-cases.ts (135 lines — 4 funciones de domain layer + 2 tipos: ClusterSummary, UnknownCaseRow)"
    - "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx (112 lines — server component con triple auth gate + 2 secciones)"
    - "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts (121 lines — 'use server' + 2 mutations + helper auth)"
    - "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx (78 lines — 'use client' tarjeta cluster con dismiss inline + abre PromoteDialog)"
    - "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx (47 lines — tabla server-renderable de casos pending)"
    - "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx (88 lines — 'use client' modal de confirmación con guidance D-52)"
  modified: []

key-decisions:
  - "D-05: tabla agent_unknown_cases con UI clustering — UI muestra rows con status='ready_for_promotion' agrupadas por cluster_id"
  - "D-12: infra observation loop completa día 1 — la UI cierra el ciclo capture → cluster → review humano"
  - "D-13: SOMNIO_V4_AGENT_ID literal — domain layer hardcodea agent_id en cada query (filter explícito)"
  - "D-23: scope = exclusivamente Somnio — page.tsx renderiza banner 403-style si workspaceId !== SOMNIO_WORKSPACE_ID; _actions.ts retorna error si el cookie no es Somnio"
  - "D-24: cero imports somnio-v3 en domain layer — verificado via grep (0 matches)"
  - "D-52: PR review obligatorio para KB docs — PromoteDialog instruye explícitamente al operador a crear KB doc en src/lib/agents/somnio-v4/knowledge/ con PR review antes de marcar promovido"
  - "D-58: status enum ('pending', 'ready_for_promotion', 'promoted', 'dismissed') — domain layer respeta los 4 valores; dismissCluster usa 'dismissed', markPromoted usa 'promoted' + promoted_at"
  - "Regla 3: domain layer es ÚNICO punto de mutación — server actions delegan 100% en src/lib/domain/unknown-cases.ts; cero `createAdminClient` en app dir (verificable via grep -rc → 0)"
  - "Regla 6: aislamiento total por scope — UI bloquea a workspaces no-Somnio antes de tocar la DB"

patterns-established:
  - "Pattern: triple auth gate en admin UI v4 — (1) cookie, (2) membership + role, (3) workspace literal match. Reusable por futuras páginas /agentes/somnio-v4/* que se construyan en Wave 5+."
  - "Pattern: domain wrappers para tablas v4 nuevas — la convención ahora es `src/lib/domain/<table-name>.ts` con factory de funciones que aceptan ctx={workspaceId} + filtran por agent_id literal. Reusable cuando se construya UI para agent_knowledge_base."
  - "Pattern: server actions Somnio-only via helper authorizeSomnioWorkspace — el helper resuelve cookie → matching → membership → role en una sola función reusable. Modelo para futuras actions v4."

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-05-01
---

# Plan 10: UI /agentes/somnio-v4/unknown-cases (review humano) Summary

**6 archivos nuevos completan el cierre del observation loop UI del standalone somnio-sales-v4 (D-12): domain layer (4 funciones), server component admin con triple auth gate (cookie + membership + Somnio-only), 2 server actions Zod-validated que delegan en domain (Regla 3 estricta), 3 components (ClusterCard cliente con dismiss inline, UnclusteredList server-renderable, PromoteDialog cliente con guidance D-52). 4 commits atómicos task-level + 1 commit chore de gate cleanup. TS clean (`npx tsc --noEmit -p tsconfig.json` exit 0).**

## Performance

- **Duration:** ~20min
- **Started:** 2026-05-01 (post Plan 09 commit `071ff52`)
- **Completed:** 2026-05-01
- **Tasks:** 4/4 ejecutados (Task 4 sin push diferido por constraint del prompt — pushes hasta antes de Plan 11)
- **Files created:** 6 (1 domain + 1 page.tsx + 1 _actions.ts + 3 components)
- **Files modified:** 0
- **Commits atómicos:** 5 (4 task-level + 1 chore comment cleanup; ver §Deviations)
- **TypeScript:** clean (`npx tsc --noEmit -p tsconfig.json` exit 0)

## Accomplishments

### Task 1: Domain layer `src/lib/domain/unknown-cases.ts`

**Plan asignó la responsabilidad de mutación / lectura de `agent_unknown_cases` a un único domain wrapper (Regla 3):**

- `listClusters(ctx)`: SELECT rows con `status='ready_for_promotion'` + `cluster_id IS NOT NULL`, agrupa en memoria por `cluster_id`, calcula `size`, `dominantIntent` (intent más frecuente), `exampleMessages` (3 oldest-first), `oldestCaseAt`, `newestCaseAt`. Ordena por `created_at` ASC para el example slice.
- `listUnclustered(ctx)`: SELECT rows con `status='pending'` + `cluster_id IS NULL`, ordenado DESC, limit 100. Devuelve campos completos (intent, confidence, reason, knowledge_queried, conversationId).
- `dismissCluster(ctx, clusterId)`: UPDATE `status='dismissed'` WHERE `cluster_id = ?`. Marca todas las rows del cluster.
- `markPromoted(ctx, clusterId)`: UPDATE `status='promoted'`, `promoted_at = NOW()` WHERE `cluster_id = ?`.

**Filtros explícitos en TODA query:**
- `.eq('workspace_id', ctx.workspaceId)` (Regla 3)
- `.eq('agent_id', SOMNIO_V4_AGENT_ID)` (D-13)

**Tipos exportados:**
- `ClusterSummary { clusterId, size, exampleMessages: string[], dominantIntent: string|null, oldestCaseAt, newestCaseAt }`
- `UnknownCaseRow { id, conversationId, message, intent, confidence, reason, knowledgeQueried: string[], createdAt }`

### Task 2: page.tsx (Task 2b commit) + _actions.ts (Task 2a commit)

**`page.tsx`** (server component, 112 lines):

Triple auth gate antes de fetchear data:

1. **Cookie morfx_workspace** → si missing, `redirect('/crm/pedidos')`
2. **supabase.auth.getUser()** → si missing, `redirect('/login')`
3. **workspace_members membership** → si missing → redirect; si `role === 'agent'` → redirect (mismo patrón que `/agentes/page.tsx:30-32`)
4. **Somnio scope literal match** → `workspaceId !== SOMNIO_WORKSPACE_ID` → render banner "Esta página solo está disponible en el workspace Somnio" (D-23, Regla 6) — NO redirect porque el operador tal vez está consciente y solo necesita feedback.

**Render** (`flex-1 overflow-y-auto p-6` wrapper, project pattern):
- H1 "Casos sin resolver — Somnio v4" + descripción
- Sección "Clusters listos para revisión" con grid 2-col responsivo (md:grid-cols-2). Estado vacío explicativo mencionando el cron diario 4am Bogotá (Plan 09).
- Sección "Casos sin cluster — recientes" con `<UnclusteredList>` server-renderable.

**`_actions.ts`** ('use server', 121 lines):

- Helper `authorizeSomnioWorkspace()`: replica el triple gate del page.tsx para mutaciones (defense-in-depth — un atacante con cookie pero sin membership recibiría error textual). Devuelve discriminated union `{ ok: true, workspaceId } | { ok: false, error: string }`.
- `dismissClusterAction({ clusterId })`: auth → Zod validate → `dismissCluster()` → `revalidatePath`. Result type `{ success: true } | { success: false, error: string }`.
- `markPromotedAction({ clusterId })`: misma forma, llama `markPromoted()`.

**Regla 3 estricta:** cero imports de `@/lib/supabase/admin` en `_actions.ts`. El archivo SOLO usa `@/lib/supabase/server` (anon-key client) para resolver `auth.getUser()` y `workspace_members`. Las mutaciones reales pasan SIEMPRE por `@/lib/domain/unknown-cases`.

### Task 3: Components

**`ClusterCard.tsx`** ('use client', 78 lines):
- Tarjeta con header (size + dominantIntent), rango de fechas (TZ Bogotá), 3 ejemplos, 2 botones.
- "Marcar como promovido" → abre `PromoteDialog`.
- "Descartar" → `confirm()` browser → `dismissClusterAction` via `useTransition` (disabled-while-pending).
- Errores se muestran en estado local (no `alert()`), UX limpia.

**`UnclusteredList.tsx`** (sin `'use client'`, 47 lines):
- Tabla server-rendered: Mensaje, Intent, Confianza (toFixed 2), Razón, Fecha (Bogotá local).
- Estado vacío inline cuando `rows.length === 0`.

**`PromoteDialog.tsx`** ('use client', 88 lines):
- Modal full-screen (fixed inset-0 + bg-black/50) con click-outside-to-close.
- Lista los pasos previos requeridos al operador: KB doc en `src/lib/agents/somnio-v4/knowledge/` con **PR review obligatorio (D-52)** O entrada en `transitions.ts`.
- Confirma cuántos casos se marcarán como `status='promoted'`.
- Errores en estado local + botón confirm con `useTransition` (disabled-while-pending).

### Task 4: Smoke + verification + commits

- **TS clean:** `npx tsc --noEmit -p tsconfig.json` exit 0 (no output) tras todos los cambios.
- **Gate verificación:** ver §Self-Check — todos los gates `test -f`, `grep -q`, `grep -c` PASAN.
- **Push diferido:** por constraint del prompt, los commits se quedan locales hasta antes del Plan 11.

## Task Commits

1. **Task 1: domain layer** — `312fda6` (feat) — 1 archivo, 135 inserciones
2. **Task 2a: _actions.ts** — `af2070b` (feat) — 1 archivo, 121 inserciones
3. **Task 3: _components** — `7973886` (feat) — 3 archivos, 213 inserciones
4. **Task 2b: page.tsx** — `6abbc40` (feat) — 1 archivo, 112 inserciones
5. **Comment cleanup** — `6f5dd37` (chore) — 1 archivo, +2/-2 (gate textual `createAdminClient` fix)

(Push diferido por constraint del prompt — pushes hasta antes de Plan 11.)

## Files Created/Modified

### Created (6)

- `src/lib/domain/unknown-cases.ts`
- `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx`
- `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts`
- `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx`
- `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx`
- `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx`

### Modified (0)

Cero archivos pre-existentes modificados (la UI nueva no toca nada del runtime existente).

## Decisions Made

- **D-05:** UI lee tabla `agent_unknown_cases` filtrando por `status='ready_for_promotion'` (clusters maduros) y `status='pending'` (no clusterizados aún).
- **D-12:** Loop de aprendizaje cerrado día 1 — capture (Plan 09) → cluster cron (Plan 09) → review humano (Plan 10) → promoción/dismiss (Plan 10).
- **D-13:** Domain layer hardcodea `agent_id='somnio-sales-v4'` literal en cada query (`SOMNIO_V4_AGENT_ID` constant).
- **D-23:** UI Somnio-only — page.tsx renderiza banner si workspaceId no es Somnio; _actions.ts retorna error.
- **D-24:** Cero imports somnio-v3 en domain layer (`grep somnio-v3 src/lib/domain/unknown-cases.ts` → 0).
- **D-52:** PromoteDialog instruye al operador que el KB doc requiere PR review obligatorio antes de marcar como promovido. Texto literal en el modal.
- **D-58:** Status enum respetado — `dismissCluster` setea `'dismissed'`, `markPromoted` setea `'promoted'` + `promoted_at`.
- **Regla 3:** Server actions delegan en domain layer; cero `createAdminClient` en `src/app/(dashboard)/agentes/somnio-v4/` (`grep -rc 'createAdminClient' src/app/(dashboard)/agentes/somnio-v4/` → 0 archivos matching).
- **Regla 6 (proteger agente):** UI no puede mutar datos de v3 ni de otros workspaces. El triple auth gate impide acceso desde fuera de Somnio.

## Deviations from Plan

### Rule 3 — Path realignment (commit ordering for TS-clean per commit)

**1. [Rule 3 — Build hygiene] Re-ordené el orden de commits para que cada commit deje TS verde**

- **Found during:** Task 2 (al ir a commitear).
- **Issue:** El plan agrupa "page.tsx + _actions.ts" en Task 2 y "_components/*" en Task 3. Si aplico ese orden, después del commit Task 2 el repo queda con TS errors (page.tsx importa `./_components/ClusterCard` y `./_components/UnclusteredList` que aún no existen). Eso rompe `tsc --noEmit` en HEAD intermedio entre Task 2 y Task 3 — incompatible con build hooks per-commit.
- **Fix:** Dividí Task 2 en 2 commits (Task 2a = `_actions.ts` solo, Task 2b = `page.tsx`) y los intercalé con Task 3 (`_components`). Orden final:
  1. Task 1 (domain) — `312fda6`
  2. Task 2a (_actions.ts) — `af2070b` (compila solo, no importa nada del UI)
  3. Task 3 (_components) — `7973886` (importa `_actions` que ya existe → compila)
  4. Task 2b (page.tsx) — `6abbc40` (importa _components que ya existen → compila)
  5. Chore (comment cleanup) — `6f5dd37`
- **Files modified:** Cero adicionales — los mismos 6 archivos del plan.
- **Verification:** `npx tsc --noEmit -p tsconfig.json` exit 0 después de cada commit (verificado en HEAD post-cada-commit durante la sesión).
- **Plan impact:** Cero — todos los archivos del `<files_modified>` del plan se entregaron. Solo se ajustó el agrupado de commits.

### Rule 2 — Auto-add critical functionality (auth defense-in-depth)

**2. [Rule 2 — Security] Triple auth gate en page.tsx + helper `authorizeSomnioWorkspace` en _actions.ts**

- **Found during:** Task 2 (al revisar el constraint #5 del prompt: "page must validate the active workspace member belongs to Somnio workspace").
- **Issue:** El plan original solo mostraba un gate `if (!workspaceId)` en page.tsx. El prompt explícitamente pide validar membresía en Somnio. Además, _actions.ts en el plan SOLO valida el cookie, lo cual es insuficiente: un atacante con cookie del workspace correcto pero SIN membership real (cookie spoofeada en dev tools) podría disparar las mutaciones. Defense-in-depth obliga a re-checar membership en cada server action.
- **Fix:** En page.tsx, triple gate: (1) cookie, (2) supabase.auth.getUser + workspace_members + role check, (3) workspaceId === SOMNIO_WORKSPACE_ID literal match. En _actions.ts, helper compartido `authorizeSomnioWorkspace()` que replica el mismo triple gate para cada mutación (returnea discriminated union).
- **Files modified:** `page.tsx` (auth gate ampliado) + `_actions.ts` (helper authorizeSomnioWorkspace en lugar del simple `getActiveWorkspaceId`).
- **Verification:** `grep -q "workspace_members" page.tsx` PASS, `grep -q "SOMNIO_WORKSPACE_ID" page.tsx` PASS, helper exportado en _actions.ts cubre las 2 mutations.
- **Plan impact:** Las server actions del plan asumían `getActiveWorkspaceId()` simple (mismo patrón que crm-tools). v4 necesita una capa más estricta porque (a) D-23 limita scope a Somnio y (b) Regla 6 protege a otros workspaces de mutaciones accidentales. La interfaz pública (Zod input + result discriminated union) NO cambió.
- **Committed in:** `af2070b` (Task 2a) + `6abbc40` (Task 2b).

### Rule 1 — Bug fix (gate textual)

**3. [Rule 1 — Bug] Comentario en page.tsx contenía literal `createAdminClient` que rompía gate Regla 3**

- **Found during:** Task 4 (verificación final — `grep -rn 'createAdminClient' "src/app/(dashboard)/agentes/somnio-v4/"` retornó 1 match).
- **Issue:** El comentario JSDoc del page.tsx decía "cero `createAdminClient` directo aquí" (literal del nombre del helper) — semánticamente correcto pero rompe el grep textual del gate de Regla 3. Mismo problema en _actions.ts (ya lo había corregido inline durante Task 2).
- **Fix:** Reescribí el comentario a "cero uso del admin Supabase client aquí" — equivalencia semántica, gate textual ahora retorna 0 matches.
- **Files modified:** `page.tsx` (commit `6f5dd37`).
- **Verification:** `grep -rc 'createAdminClient' 'src/app/(dashboard)/agentes/somnio-v4/'` → 0 archivos matching.
- **Plan impact:** Cero funcional — solo limpieza textual.

---

**Total deviations:** 3 (1 Rule 3 build-hygiene commit ordering + 1 Rule 2 security auth defense-in-depth + 1 Rule 1 gate textual fix).

**Impact on plan:** Las 3 deviations refuerzan la implementación sin desviarse del scope del plan. La interfaz pública del domain layer (4 funciones), de las server actions (2 mutations + result discriminated union), y de los components (3 archivos) coinciden 1:1 con lo que el plan describe en `<interfaces>` y `<acceptance_criteria>`. Cero cambios a la arquitectura propuesta.

## TDD Gate Compliance

Plan 10 NO es plan-level TDD (frontmatter `type` no es `tdd`). Los archivos creados son: 1 domain layer (testeable con mocks pesados de Supabase, scope similar a `domain/orders.ts` que también NO tiene tests aislados en este standalone) + 5 archivos UI (server component + actions + 3 React components — testeables solo via E2E con Playwright en una tabla ya seedeada).

El plan no exige tests — el verify gate del plan es 100% gates de existencia + grep + tsc clean. Todos los gates PASAN. Tests E2E quedan implícitamente diferidos a Plan 13 (flip + activación) si el operador los exige antes de habilitar el cron.

Plan-level TDD no aplica.

## Issues Encountered

- **Working tree dirty pre-existing:** trabajado solo con `git add <archivos-específicos>` por commit; ningún commit incluyó archivos fuera del scope del plan.
- **Push diferido por constraint del prompt:** los 5 commits de Plan 10 se quedan locales hasta antes del Plan 11. Vercel deploy NO ocurrió.
- **TS-clean per commit requirió re-ordenar commits:** ver §Deviations Rule 3 — split de Task 2 en 2a+2b.

## User Setup Required

Ninguno para Plan 10 en sí. La UI es accesible inmediatamente al pushear, pero:

- **Estado vacío esperado al inicio:** la tabla `agent_unknown_cases` aún no existe en producción (Regla 5 — el plan 02 SQL se aplicará en Plan 13 antes del flip). Cuando el operador visite `/agentes/somnio-v4/unknown-cases` en producción ANTES del flip, verá un error de DB (tabla missing) o un estado vacío dependiendo de si la migración se aplicó. Plan 11 corpus + Plan 13 flip son los siguientes pasos del workflow.
- **Para verificar en preview Vercel post-Plan 11 push:** la ruta debe responder 200 con auth válida + cookie morfx_workspace = `a3843b3f-c337-4836-92b5-89c58bb98490`. Verificación visual: 2 secciones renderizan, estado vacío textual presente.
- **Permisos auth:** el usuario debe ser miembro del workspace Somnio con rol distinto a `'agent'` (admin / member). Agentes ven redirect a /crm/pedidos.

## Next Phase Readiness

**Listo para consumir desde:**

- **Plan 11 (corpus + CLI):** independiente — el corpus seedeado del KB no afecta UI de unknown_cases. Cuando Plan 11 cablea Vercel deploy webhook → `'somnio-v4/knowledge.sync'`, la UI sigue funcionando igual (KB es un módulo separado).
- **Plan 13 (flip + activación):** UI lista para recibir tráfico real post-flip. El cron de Plan 09 producirá `cluster_id` en filas `status='ready_for_promotion'` cuando el flag `somnio_v4_kb_sync_enabled=true`, y la UI los expondrá automáticamente.

**Sin blockers detectados.**

## Self-Check

Verificación post-write de claims del SUMMARY:

**Files (6 nuevos):**

```
[ -f src/lib/domain/unknown-cases.ts ]                                                          # FOUND
[ -f src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx ]                             # FOUND
[ -f src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts ]                          # FOUND
[ -f src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx ]          # FOUND
[ -f src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx ]      # FOUND
[ -f src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx ]        # FOUND
```

**Commits (5 commits):**

```
git log --oneline -5
6f5dd37 chore(somnio-v4): plan-10 — limpiar comentario en page.tsx (gate Regla 3)
6abbc40 feat(somnio-v4): plan-10 task-2b — page.tsx server component admin UI
7973886 feat(somnio-v4): plan-10 task-3 — _components ClusterCard + UnclusteredList + PromoteDialog
af2070b feat(somnio-v4): plan-10 task-2a — server actions /agentes/somnio-v4/unknown-cases
312fda6 feat(somnio-v4): plan-10 task-1 — domain layer src/lib/domain/unknown-cases.ts
```

**Gates:**

- `grep -q "listClusters\|listUnclustered\|dismissCluster\|markPromoted" src/lib/domain/unknown-cases.ts` — OK (4 funciones presentes)
- `grep -q ".eq('workspace_id', ctx.workspaceId)" src/lib/domain/unknown-cases.ts` — OK (Regla 3)
- `grep -q ".eq('agent_id', SOMNIO_V4_AGENT_ID)" src/lib/domain/unknown-cases.ts` — OK (D-13)
- `grep -c 'somnio-v3' src/lib/domain/unknown-cases.ts` → **0** (D-24 negative gate PASS)
- `grep -q "flex-1 overflow-y-auto p-6" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx"` — OK (project pattern)
- `grep -q "SOMNIO_WORKSPACE_ID" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx"` — OK (D-23 scope)
- `grep -q "workspace_members" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx"` — OK (membership gate)
- `grep -q "use server" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts"` — OK
- `grep -q "revalidatePath" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts"` — OK
- `grep -q "dismissClusterAction\|markPromotedAction" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts"` — OK
- `grep -rc 'createAdminClient' 'src/app/(dashboard)/agentes/somnio-v4/'` → **0 archivos matching** (Regla 3 negative gate PASS)
- `grep -c '@supabase/supabase-js' 'src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts'` → **0** (Regla 3)
- `grep -q "'use client'" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx"` — OK
- `grep -q "'use client'" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx"` — OK
- `grep -L "'use client'" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx"` — OK (server-renderable, sin 'use client')
- `grep -q "dismissClusterAction" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx"` — OK
- `grep -q "markPromotedAction" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx"` — OK
- `grep -q "PR review obligatorio" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx"` — OK (D-52 surface)
- `npx tsc --noEmit -p tsconfig.json` exit 0 — OK

## Self-Check: PASSED

---
*Phase: somnio-sales-v4*
*Plan: 10*
*Completed: 2026-05-01*
