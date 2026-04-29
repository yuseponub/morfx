---
plan: 07
wave: 6
phase: standalone-crm-query-tools
depends_on: [02, 04, 05, 06]
files_modified:
  - .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md
  - .claude/skills/crm-query-tools.md
  - .claude/rules/agent-scope.md
  - CLAUDE.md
  - .planning/standalone/crm-query-tools/LEARNINGS.md
autonomous: true
requirements:
  - D-06  # Add "Module Scope: crm-query-tools" section to CLAUDE.md
  - D-26  # INTEGRATION-HANDOFF.md + project skill descubrible
---

<objective>
Ship the documentation + handoff layer that closes the standalone:
1. Create `.claude/skills/` directory (does NOT exist yet — confirmed by ls in planning).
2. Author `INTEGRATION-HANDOFF.md` with full tool inventory, JSON examples, divergences from crm-reader, env requirements, and step-by-step migration recipes for the two follow-up Somnio integrations.
3. Author the discoverable project skill `.claude/skills/crm-query-tools.md` (PUEDE/NO PUEDE template).
4. Cross-reference from `.claude/rules/agent-scope.md` so the skill is reachable from rules-aware tooling.
5. Add `### Module Scope: crm-query-tools` section to `CLAUDE.md` (D-06).
6. Author `LEARNINGS.md` capturing what shipped + bug log + patterns for next standalones.

After this plan ships, the standalone is COMPLETE and the two Somnio follow-up integration standalones are unblocked.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@src/lib/agents/shared/crm-query-tools/index.ts
@src/lib/agents/shared/crm-query-tools/types.ts
@src/lib/agents/shared/crm-query-tools/contacts.ts
@src/lib/agents/shared/crm-query-tools/orders.ts
@src/lib/domain/crm-query-tools-config.ts
@src/inngest/functions/recompra-preload-context.ts
@src/inngest/functions/pw-confirmation-preload-and-invoke.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 7.1: Create .claude/skills/ directory + project skill file</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 23 — placement decision Option A recommended; lines ~1086-1104)
    - .claude/rules/agent-scope.md (PUEDE/NO PUEDE template — full file; CRM Reader Bot section as analog)
    - PATTERNS.md File 27 — exact PUEDE/NO PUEDE block (lines 1262-1284) to mirror in the skill
  </read_first>
  <action>
    1. Create the directory: run `mkdir -p .claude/skills/`. Verify with `ls .claude/skills`.

    2. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/.claude/skills/crm-query-tools.md` with the full PUEDE / NO PUEDE / Wiring / Configuration / Observability / Validation / Consumers / References content following the agent-scope.md template style. Use heading `# Project Skill: crm-query-tools`. Body MUST include:

       - Section "Tools (PUEDE — solo lectura)" with a 5-row table covering each tool's input, return type, and notes (D-08 duplicates, D-27 config_not_set).
       - Section "NO PUEDE" with bullets covering: no mutations (route to crm-writer), no cross-workspace (D-05), no cache (D-19), no legacy keys (D-21), no hardcoded stage names (D-11/D-13), no `createAdminClient`/`@supabase/supabase-js` direct imports (BLOCKER invariant) — include the exact grep verification command.
       - Section "Wiring" with the `createCrmQueryTools({ workspaceId, invoker })` snippet.
       - Section "Configuration prerequisite" explaining `/agentes/crm-tools` operator setup + `config_not_set` status.
       - Section "Observability" listing the three event labels (`crm_query_invoked` / `_completed` / `_failed`) and PII redaction (last-4 phone digits only).
       - Section "Validation" mirroring the agent-scope.md style validation block.
       - Section "Consumers" listing pending integrations (`crm-query-tools-recompra-integration`, `crm-query-tools-pw-confirmation-integration`) and noting "ninguno activo hasta que los standalones follow-up se ejecuten".
       - Section "References" linking to standalone dir, INTEGRATION-HANDOFF.md, LEARNINGS.md, CLAUDE.md scope section.

    3. Verify with `cat .claude/skills/crm-query-tools.md | head -20` to confirm structure.
  </action>
  <verify>
    <automated>test -d .claude/skills && test -f .claude/skills/crm-query-tools.md && grep -c "PUEDE" .claude/skills/crm-query-tools.md && grep -c "NO PUEDE" .claude/skills/crm-query-tools.md && grep -q "createCrmQueryTools" .claude/skills/crm-query-tools.md</automated>
  </verify>
  <acceptance_criteria>
    - `.claude/skills/` directory exists.
    - `.claude/skills/crm-query-tools.md` exists with ≥80 lines.
    - `grep -c "PUEDE" .claude/skills/crm-query-tools.md` returns ≥2.
    - `grep -c "NO PUEDE" .claude/skills/crm-query-tools.md` returns ≥1.
    - `grep -c "config_not_set" .claude/skills/crm-query-tools.md` returns ≥1 (D-27).
    - `grep -c "createCrmQueryTools" .claude/skills/crm-query-tools.md` returns ≥1 (wiring snippet).
    - `grep -c "createAdminClient" .claude/skills/crm-query-tools.md` returns ≥1 (BLOCKER invariant grep documented).
  </acceptance_criteria>
  <done>Project skill discoverable.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 7.2: Add cross-reference link in .claude/rules/agent-scope.md</name>
  <read_first>
    - .claude/rules/agent-scope.md (full file — find logical insertion point near CRM Reader Bot / CRM Writer Bot blocks)
  </read_first>
  <action>
    1. Read the full file `.claude/rules/agent-scope.md`.

    2. After the `### CRM Writer Bot` block (which is the last "agent" block before the Config Builder section), insert a NEW section:

    ```markdown
    ### Module Scope: crm-query-tools (`src/lib/agents/shared/crm-query-tools/`)
    Shared read-only query tools any conversational agent can register. NOT an agent itself.
    Full PUEDE / NO PUEDE / Validation / Consumers in `.claude/skills/crm-query-tools.md`.
    UI de configuracion: `/agentes/crm-tools`.
    Standalone: `.planning/standalone/crm-query-tools/` (shipped 2026-04-29).
    ```

    Place it BEFORE the "Config Builder: WhatsApp Templates" section (which is currently the next section).

    3. DO NOT duplicate the full PUEDE / NO PUEDE list — that lives in the skill file. This is just a cross-reference pointer.

    4. Verify the file is still valid markdown and other sections are unchanged.
  </action>
  <verify>
    <automated>grep -q "Module Scope: crm-query-tools" .claude/rules/agent-scope.md && grep -q "/.claude/skills/crm-query-tools.md\|.claude/skills/crm-query-tools.md" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "Module Scope: crm-query-tools" .claude/rules/agent-scope.md` returns 1 match.
    - `grep ".claude/skills/crm-query-tools.md" .claude/rules/agent-scope.md` returns 1 match.
    - Existing CRM Reader Bot / CRM Writer Bot / Config Builder sections unchanged: re-grep their identifying lines to confirm.
  </acceptance_criteria>
  <done>agent-scope.md cross-references the new skill.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 7.3: Add "Module Scope: crm-query-tools" section to CLAUDE.md</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 27 — full PUEDE/NO PUEDE block to mirror, lines 1262-1284)
    - CLAUDE.md (full file — find existing "Scopes por Agente" / Module Scope sections to align placement)
  </read_first>
  <action>
    1. Read CLAUDE.md fully and locate the existing "Scopes por Agente" / per-module scope section. The natural insertion point is AFTER the existing module/agent scope blocks (after Somnio Sales v3 PW Confirmation Agent block) and BEFORE "OBLIGATORIO al Crear un Agente Nuevo".

    2. Insert the EXACT block below at the located point:

    ```markdown
    ### Module Scope: crm-query-tools (`src/lib/agents/shared/crm-query-tools/`)
    - **PUEDE (solo lectura):**
      - `getContactByPhone(phone)` — contacto + tags + custom_fields + duplicates flag
      - `getLastOrderByPhone(phone)` — ultimo pedido del contacto + items + direccion
      - `getOrdersByPhone(phone, { limit?, offset? })` — historial paginado (lista de OrderListItem)
      - `getActiveOrderByPhone(phone, { pipelineId? })` — pedido en stage activo (config-driven; retorna `config_not_set` si workspace nunca configuro stages — D-27)
      - `getOrderById(orderId)` — pedido especifico con items + shipping
    - **NO PUEDE:**
      - Mutar NADA (crear/editar/archivar contactos, pedidos, notas, tareas — esas operaciones son scope crm-writer)
      - Acceder a otros workspaces (workspace_id viene del execution context del agente, NUNCA del input — D-05)
      - Cachear resultados (cada tool-call llega a domain layer fresh — D-19)
      - Escribir keys legacy `_v3:crm_context*` o `_v3:active_order` en session_state (D-21 — el caller decide persistencia)
      - Hardcodear nombres de stages — la lista de stages "activos" se lee de `crm_query_tools_config` + `crm_query_tools_active_stages` (D-11/D-13 config-driven UUID)
    - **Validacion:**
      - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/shared/crm-query-tools/**` (verificable via grep)
      - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
      - Configuracion persistente por workspace en tabla `crm_query_tools_config` (singleton) + `crm_query_tools_active_stages` (junction)
      - UI de configuracion en `/agentes/crm-tools` (operador escoge stages activos + pipeline scope)
      - Project skill descubrible: `.claude/skills/crm-query-tools.md`
      - Standalone shipped: `.planning/standalone/crm-query-tools/` (2026-04-29)
    - **Consumidores documentados:**
      - (Pendientes — los agentes Somnio se migraran en standalones follow-up: `crm-query-tools-recompra-integration` y `crm-query-tools-pw-confirmation-integration`. Hasta entonces, el modulo esta listo pero sin consumidores en produccion.)
    ```

    3. Verify CLAUDE.md is still valid markdown — re-read the file and confirm other sections remain intact.
  </action>
  <verify>
    <automated>grep -q "Module Scope: crm-query-tools" CLAUDE.md && grep -q "getContactByPhone\|getLastOrderByPhone" CLAUDE.md && grep -q "config_not_set" CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "Module Scope: crm-query-tools" CLAUDE.md` returns 1 match.
    - `grep -c "getContactByPhone\\|getActiveOrderByPhone" CLAUDE.md` returns ≥1.
    - `grep -c "config_not_set" CLAUDE.md` returns ≥1 (D-27 documented).
    - `grep -c "src/lib/agents/shared/crm-query-tools" CLAUDE.md` returns ≥1.
    - Existing rules (Regla 0/1/2/3/5/6) intact: `grep -c "## REGLA" CLAUDE.md` unchanged from pre-edit count.
  </acceptance_criteria>
  <done>CLAUDE.md updated with module scope per D-06.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 7.4: Author INTEGRATION-HANDOFF.md (the snapshot)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 22 — required sections list; Open Pattern Question 4 — cookie name verification)
    - src/lib/agents/shared/crm-query-tools/index.ts (final state after Plans 03/04)
    - src/lib/agents/shared/crm-query-tools/types.ts (final type shapes)
    - src/inngest/functions/recompra-preload-context.ts (the file that the recompra-integration follow-up will delete — read to write accurate cleanup recipe)
    - src/inngest/functions/pw-confirmation-preload-and-invoke.ts (the file the pw-confirmation-integration follow-up will simplify)
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` with these required sections:

    1. **Header** — module path, ship date (2026-04-29), summary of what changed.

    2. **Tool inventory** — for each of the 5 tools:
       - Description.
       - Zod inputSchema (verbatim from source).
       - All possible status enum values.
       - JSON example response per status (at least: `found`, `not_found`, `error`; for `getActiveOrderByPhone` additionally `no_active_order`, `config_not_set`).

    3. **Wiring example**:
       ```typescript
       import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
       const tools = {
         ...createCrmQueryTools({ workspaceId: ctx.workspaceId, invoker: 'agent-id' }),
         // ...other tools
       }
       ```

    4. **Divergences from crm-reader** — explicitly call out:
       - `not_found` (not `not_found_in_workspace`) — workspace is implicit.
       - Error shape `{ error: { code, message? } }` (nested) vs crm-reader's `{ message }` (flat).
       - Tools NEVER throw for expected outcomes (D-07).

    5. **Configuration prerequisite** — operator must visit `/agentes/crm-tools` and configure active stages before `getActiveOrderByPhone` returns `'found'`. Until then, returns `config_not_set` (D-27).

    6. **Observability emit contract** — three event labels with payload schemas.

    7. **Test runner endpoint env requirements** — `PLAYWRIGHT_TEST_SECRET`, `TEST_WORKSPACE_ID`, `TEST_WORKSPACE_ID_2`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`. Document gating (NODE_ENV + secret + workspace from env).

    8. **Migration recipe — `crm-query-tools-recompra-integration`** — step-by-step (~10-15 numbered steps):
       - Identify points in `recompra-preload-context.ts` that build `_v3:crm_context*` keys.
       - Replace with on-demand tool calls inside the agent's response loop (`somnio-recompra-v1` agent file).
       - Update agent's tool registration to spread `createCrmQueryTools(...)`.
       - Remove the keys from `session_state.datos_capturados` migration.
       - Delete `recompra-preload-context.ts` Inngest function.
       - Remove dispatch in `webhook-processor.ts` for the recompra preload event.
       - Update CLAUDE.md scope of `somnio-recompra-v1` to reflect new tool consumption.

    9. **Migration recipe — `crm-query-tools-pw-confirmation-integration`** — analogous step-by-step:
       - Identify `extractActiveOrderJson` (lines ~118-150 in `pw-confirmation-preload-and-invoke.ts`).
       - Determine: keep step 2 (the agent invoke) blocking; either remove step 1 entirely OR keep just for crm reader synth (we recommend remove step 1 since the new tools cover the same ground).
       - Migrate agent state machine to call `getActiveOrderByPhone` on demand.
       - Remove `_v3:active_order`, `_v3:crm_context*` from session_state.
       - Update CLAUDE.md scope.

    10. **Backlog items recorded** —
       - Optional optimistic-concurrency on `updateCrmQueryToolsConfig` (current: last-write-wins).
       - Optional `is_workspace_admin` server-side check in server action body (current: defense-in-depth via UI session).
       - Optional `activeStageIds.max(500)` zod cap.
       - Optional cross-workspace stage-id validation in server action.
       - Optional 5-30s LRU cache for config reads if performance becomes a concern.
       - Optional refactor: hoist crm-reader's types to use shared module (D-18 implication for future).

    11. **Known divergences from RESEARCH.md** — list any deviations a planner made (e.g., MultiSelect inline variant chosen over routing-editor refactor).

    12. **References** — links to PLAN files, LEARNINGS.md, MEMORY entry.

    Aim for a comprehensive document (≥250 lines). This is the PRIMARY artifact a follow-up planner reads.
  </action>
  <verify>
    <automated>test -f .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md && wc -l .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md && grep -c "getContactByPhone\|getLastOrderByPhone\|getOrdersByPhone\|getActiveOrderByPhone\|getOrderById" .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md && grep -q "recompra-integration" .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md && grep -q "pw-confirmation-integration" .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists.
    - `wc -l INTEGRATION-HANDOFF.md` returns ≥250 lines.
    - All 5 tool names referenced ≥3 times each.
    - `grep -c "config_not_set" INTEGRATION-HANDOFF.md` returns ≥3 (D-27 explicit).
    - `grep -c "recompra-integration" INTEGRATION-HANDOFF.md` returns ≥1.
    - `grep -c "pw-confirmation-integration" INTEGRATION-HANDOFF.md` returns ≥1.
    - `grep -c "PLAYWRIGHT_TEST_SECRET" INTEGRATION-HANDOFF.md` returns ≥1.
    - `grep -c "Backlog\|backlog" INTEGRATION-HANDOFF.md` returns ≥1.
  </acceptance_criteria>
  <done>Handoff snapshot complete and self-contained.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 7.5: Author LEARNINGS.md</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 24 — required sections per Regla 4)
    - Recent shipped standalone LEARNINGS for tone/format reference (e.g., `.planning/standalone/client-activation-auto-revoke/LEARNINGS.md` if present in the repo)
    - All 6 prior PLAN files in this standalone (01-06) — to capture what shipped end-to-end
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/crm-query-tools/LEARNINGS.md` with these sections:

    1. **Header** — date (2026-04-29), commits range (will be filled in Task 7.6 after final push), waves shipped (W0–W6), tools shipped count (5).

    2. **What Shipped** — by wave:
       - W0: `@playwright/test` bootstrap, `playwright.config.ts`, `e2e/fixtures/{auth,seed}.ts` skeletons, `test:e2e` scripts.
       - W1: 2-table migration + domain `crm-query-tools-config.ts` + extended `ContactDetail.department` and `OrderDetail.shipping*`.
       - W2: module skeleton + `getContactByPhone` + 7+ unit tests.
       - W3: 4 order tools + helpers + 16+/9+ tests.
       - W4: UI `/agentes/crm-tools` (Server Component + server action + Client editor + inline MultiSelectStages variant).
       - W5: 3 integration tests + Playwright E2E spec + env-gated test runner endpoint.
       - W6: this plan — handoff + skill + scope + LEARNINGS.

    3. **Bugs encountered & resolved** — leave as a stub if no bugs were encountered. Otherwise capture each bug with: symptom → root cause → fix → file changed.

    4. **Patterns established** —
       - `createCrmQueryTools(ctx)` factory pattern (vs per-tool exports) for shared modules.
       - Discriminated union with status enum + nested `error: { code, message? }` shape — divergence from crm-reader's flat `{ message }` is intentional and documented.
       - Phone PII redaction: only last-4 in observability events, full E.164 only in pino logger payloads.
       - Two-table workspace config (singleton + junction) with FK CASCADE on stage delete + FK SET NULL on pipeline delete — recommended over JSONB for any future workspace-scoped config that has multi-value FK semantics.
       - Inline MultiSelect variant in feature dir (not refactoring shipped routing-editor component) — keep cross-feature refactors as separate standalones.
       - Env-gated test runner API endpoint (`NODE_ENV` + header secret) for Playwright tool invocation — replicable pattern for any future module that needs UI-driven E2E.

    5. **Cost / context patterns** — qualitative notes:
       - Plans 03 + 04 (the heaviest — module + tools) each completed within targeted ~50% context.
       - Plan 02 PAUSE for Regla 5 was the longest blocking event; user applied migration in <5 min via Supabase Dashboard.
       - Plan 01 npm install confirmation gate worked smoothly (single user prompt).

    6. **Patterns to follow next time** —
       - Keep migrations + DOMAIN code split: migration commit local-only first, push with domain code after Regla 5 PAUSE confirmation. (Did this in Plan 02; worked well.)
       - Always extract analog file:line references in PATTERNS.md before writing code — drastically reduced executor exploration time.
       - Plan 06's `describe.skipIf` pattern for env-gated integration tests is CI-safe and should be the default for any test that needs `SUPABASE_SERVICE_ROLE_KEY`.

    7. **Patterns to avoid** —
       - DO NOT cache tool query results (D-19 firm — caching is a stale-data minefield as documented in Pitfall 5 + crm-stage-integrity standalone).
       - DO NOT hardcode stage names — config-driven UUID is the only correct path.
       - DO NOT add `workspaceId` to a tool's `inputSchema` — workspace ALWAYS from execution context.

    8. **Followup tasks** — both follow-up integration standalones (recompra + pw-confirmation) along with their backlog items:
       - `crm-query-tools-recompra-integration` — discuss → research → plan → execute. Will delete `recompra-preload-context.ts`.
       - `crm-query-tools-pw-confirmation-integration` — same. Will simplify `pw-confirmation-preload-and-invoke.ts`.
       - Optional refactor: hoist crm-reader types to shared module (deferred — only if/when convergence becomes painful).

    9. **Performance notes (placeholder)** — TBD post-integration; once recompra/pw-confirmation are migrated, capture latency per tool from observability (`agent_observability_events`).

    10. **Open questions resolved** — list each Open Question from RESEARCH.md (1-10) with the resolved decision (e.g., Q1 omit `options` until first concrete need; Q5 use `not_found` not `not_found_in_workspace`; Q10 LOCKED via D-27).

    Aim for ≥150 lines.
  </action>
  <verify>
    <automated>test -f .planning/standalone/crm-query-tools/LEARNINGS.md && wc -l .planning/standalone/crm-query-tools/LEARNINGS.md && grep -c "Wave\|Plan" .planning/standalone/crm-query-tools/LEARNINGS.md && grep -q "Followup\|follow-up" .planning/standalone/crm-query-tools/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists.
    - `wc -l LEARNINGS.md` returns ≥150 lines.
    - `grep -c "Wave\\|Plan" LEARNINGS.md` returns ≥6 (one per plan/wave).
    - `grep -c "follow-up\\|Followup" LEARNINGS.md` returns ≥1 (recompra + pw-confirmation noted).
    - `grep -c "config_not_set\\|D-27" LEARNINGS.md` returns ≥1.
    - `grep -c "Bug\\|bug" LEARNINGS.md` returns ≥1 (section heading even if no bugs).
  </acceptance_criteria>
  <done>LEARNINGS captured. Standalone history is recoverable.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 7.6: Final smoke check + commit + push + close-out summary</name>
  <read_first>
    - All artifacts created in tasks 7.1-7.5 (verify via Read or grep)
    - CLAUDE.md (Regla 1)
    - .claude/rules/code-changes.md
  </read_first>
  <action>
    1. Final verification:
       - Module BLOCKER 1 grep:
         ```
         grep -E "^import" src/lib/agents/shared/crm-query-tools/*.ts src/lib/agents/shared/crm-query-tools/__tests__/*.ts | grep -E "createAdminClient|@supabase/supabase-js"
         ```
         Expected: 0.
       - Tools work end-to-end: full Vitest suite green: `npm run test -- --run` exit 0.
       - Type-check: `npx tsc --noEmit -p .` exit 0.
       - Skill discoverable: `test -f .claude/skills/crm-query-tools.md`.
       - CLAUDE.md updated: `grep -q "Module Scope: crm-query-tools" CLAUDE.md`.

    2. Stage + commit:
       ```
       git add .claude/skills/crm-query-tools.md .claude/rules/agent-scope.md CLAUDE.md .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md .planning/standalone/crm-query-tools/LEARNINGS.md
       git commit -m "$(cat <<'EOF'
       docs(crm-query-tools): handoff + skill + CLAUDE.md scope + LEARNINGS

       - .claude/skills/crm-query-tools.md (NEW dir): project skill descubrible (PUEDE/NO PUEDE).
       - .claude/rules/agent-scope.md: cross-reference al skill.
       - CLAUDE.md: nueva seccion "Module Scope: crm-query-tools" (D-06).
       - INTEGRATION-HANDOFF.md: tool inventory + migration recipes para los 2 standalones follow-up.
       - LEARNINGS.md: bug log + patrones + open questions resueltas.

       Standalone: crm-query-tools Plan 07 (Wave 6) — STANDALONE COMPLETE.
       Refs D-06, D-26.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```

    3. Push: `git push origin main`.

    4. Print a final close-out summary to stdout:
       ```
       echo "================================================================"
       echo "STANDALONE crm-query-tools COMPLETE — 2026-04-29"
       echo "================================================================"
       echo "Plans shipped: 7 (Waves 0-6)"
       echo "Tools live:    5 (getContactByPhone, getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById)"
       echo "UI live:       /agentes/crm-tools"
       echo "Tests:         Unit + Integration + Playwright E2E"
       echo ""
       echo "Next standalones (unblocked):"
       echo "  - crm-query-tools-recompra-integration"
       echo "  - crm-query-tools-pw-confirmation-integration"
       echo ""
       echo "Read INTEGRATION-HANDOFF.md before starting either follow-up."
       echo "================================================================"
       ```

    5. Update LEARNINGS.md commits range — re-edit the header to fill in actual commit SHAs (e.g., `git log --oneline | head -10`). Commit + push as a small follow-up:
       ```
       git add .planning/standalone/crm-query-tools/LEARNINGS.md
       git commit -m "docs(crm-query-tools): backfill commit range in LEARNINGS

       Standalone: crm-query-tools Plan 07 cleanup.

       Co-authored-by: Claude <noreply@anthropic.com>"
       git push origin main
       ```
  </action>
  <verify>
    <automated>npm run test -- --run 2>&1 | tail -3 && grep -q "Module Scope: crm-query-tools" CLAUDE.md && test -f .claude/skills/crm-query-tools.md && test -f .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md && test -f .planning/standalone/crm-query-tools/LEARNINGS.md && git log -2 --oneline</automated>
  </verify>
  <acceptance_criteria>
    - All 5 documentation files exist (skill, agent-scope edit, CLAUDE.md edit, INTEGRATION-HANDOFF.md, LEARNINGS.md).
    - `npx tsc --noEmit -p .` exits 0.
    - `npm run test -- --run` exits 0 (full suite green).
    - `git log -2 --oneline` shows the docs commit (and optionally the LEARNINGS backfill commit).
    - `git log @{u}..HEAD` is empty (push succeeded).
    - `git status` shows clean working tree.
  </acceptance_criteria>
  <done>Standalone crm-query-tools is COMPLETE. Two follow-up integration standalones unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Documentation files → tooling discovery | Project skill discovery via `.claude/skills/` |
| CLAUDE.md scope section → future agents | Defines guardrails read by all future builders |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W6-01 | Tampering | Skill file content drifts from actual module behavior | LOW | mitigate | INTEGRATION-HANDOFF.md is a snapshot at ship time (D-26 explicit). Skill is the "living" doc — update on any future module change. Cross-reference link in agent-scope.md helps tooling find the latest version. |
| T-W6-02 | Information Disclosure | Sensitive data in handoff (env names, secret names) | INFO | accept | We document `PLAYWRIGHT_TEST_SECRET` env name (NOT value), `TEST_WORKSPACE_ID` env name, and other test infrastructure. No secrets or workspace IDs leaked in docs. |
| T-W6-03 | Repudiation | Future builder skips reading the skill | INFO | accept | Documentation cannot enforce reading. CLAUDE.md scope section + agent-scope.md cross-reference + skill file + INTEGRATION-HANDOFF.md provide three discovery paths; future builder pattern of `/gsd:research-phase` should surface them. |
</threat_model>

<verification>
- All five doc artifacts exist.
- `grep -q "Module Scope: crm-query-tools" CLAUDE.md` succeeds.
- `grep -q "/agentes/crm-tools" .claude/skills/crm-query-tools.md` confirms the UI path is referenced for operators.
- `git log -1 --oneline` shows the docs commit.
- Standalone commit history (Plans 01–07) is fully shipped to origin/main.
</verification>

<must_haves>
truths:
  - "Future agent builders can discover crm-query-tools via .claude/skills/, .claude/rules/agent-scope.md, AND CLAUDE.md."
  - "INTEGRATION-HANDOFF.md contains step-by-step recipes for the two Somnio follow-up standalones."
  - "LEARNINGS.md captures bugs/patterns/open questions resolved."
  - "Standalone is closed: 7 plans shipped, all commits pushed."
artifacts:
  - path: ".claude/skills/crm-query-tools.md"
    provides: "Discoverable project skill (PUEDE/NO PUEDE)"
    min_lines: 80
  - path: ".claude/rules/agent-scope.md"
    provides: "Cross-reference link to .claude/skills/crm-query-tools.md"
    contains: "Module Scope: crm-query-tools"
  - path: "CLAUDE.md"
    provides: "Module Scope: crm-query-tools section per D-06"
    contains: "Module Scope: crm-query-tools"
  - path: ".planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md"
    provides: "Snapshot handoff: tool inventory + migration recipes for 2 follow-ups"
    min_lines: 250
  - path: ".planning/standalone/crm-query-tools/LEARNINGS.md"
    provides: "Bug log + patterns + open questions resolved + followup tasks"
    min_lines: 150
key_links:
  - from: ".claude/rules/agent-scope.md"
    to: ".claude/skills/crm-query-tools.md"
    via: "explicit reference link"
    pattern: ".claude/skills/crm-query-tools.md"
  - from: "CLAUDE.md Module Scope section"
    to: "src/lib/agents/shared/crm-query-tools/"
    via: "explicit path reference"
    pattern: "src/lib/agents/shared/crm-query-tools"
  - from: "Future follow-up planners"
    to: "INTEGRATION-HANDOFF.md migration recipes"
    via: "documented in LEARNINGS.md and CLAUDE.md scope Consumidores section"
    pattern: "INTEGRATION-HANDOFF\\.md"
</must_haves>
