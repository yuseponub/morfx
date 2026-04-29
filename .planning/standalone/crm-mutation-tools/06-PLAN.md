---
plan: 06
wave: 5
phase: standalone-crm-mutation-tools
depends_on:
  - 05
files_modified:
  - .claude/skills/crm-mutation-tools.md
  - .claude/rules/agent-scope.md
  - CLAUDE.md
  - .planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md
  - .planning/standalone/crm-mutation-tools/LEARNINGS.md
  - .planning/standalone/crm-mutation-tools/SUMMARY.md
autonomous: false  # Pre-write checkpoint required for .claude/skills/ sandbox restriction
requirements: []  # Documentation plan — no new requirement IDs
---

<objective>
Wave 5 — Documentation + handoff. Materializa todo el contrato del módulo en assets descubribles:

1. **Project skill** `.claude/skills/crm-mutation-tools.md` (PUEDE / NO PUEDE / Validation / Consumers — espejo de `.claude/skills/crm-query-tools.md`).
2. **CLAUDE.md** — agrega la sección `### Module Scope: crm-mutation-tools` mirroring la sección `crm-query-tools`.
3. **`.claude/rules/agent-scope.md`** — añade pointer cross-ref de una línea.
4. **`INTEGRATION-HANDOFF.md`** — full handoff with registration example, observability query, error contract table, Pitfall 11 coexistence note, polymorphic result_id rationale.
5. **`LEARNINGS.md`** — skeleton para que executors agreguen post-mortems durante ejecución (waves 0-4).
6. **`SUMMARY.md`** — phase-close summary.

**CRITICAL:** Sandbox blocks subagents from writing under `.claude/skills/`. Per LEARNINGS Plan 07 of crm-query-tools sibling, este plan requiere checkpoint de orchestrator-action ANTES de la edit task para crear stub vacío (mismo issue es esperado).

Output: 6 archivos. Tras este plan, cualquier desarrollador (humano o Claude) descubre cómo usar mutation-tools sin abrir el código.
</objective>

<context>
@./CLAUDE.md
@.claude/skills/crm-query-tools.md
@.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md
@.planning/standalone/crm-mutation-tools/CONTEXT.md
@.planning/standalone/crm-mutation-tools/RESEARCH.md
</context>

<tasks>

<task type="checkpoint:orchestrator-action" gate="blocking">
  <name>Task 6.0: Pre-create empty `.claude/skills/crm-mutation-tools.md` stub (sandbox workaround)</name>
  <reason>
    Sandbox blocks subagents from writing under `.claude/skills/` directly (LEARNINGS Plan 07 Bug 1 of crm-query-tools sibling). Orchestrator OR human must create empty stub file BEFORE Task 6.1's editor agent runs. Otherwise Task 6.1 fails with permission denied.
  </reason>
  <action>
    Orchestrator (or user) executes from project root:

    ```bash
    mkdir -p .claude/skills
    printf '%s\n' '<!-- placeholder, executor fills via Task 6.1 -->' > .claude/skills/crm-mutation-tools.md
    ```

    Then signal "approved" so Task 6.1 can proceed with the actual content edit.
  </action>
  <verify>
    <automated>test -f .claude/skills/crm-mutation-tools.md && echo "stub-exists"</automated>
  </verify>
  <acceptance_criteria>
    - File `.claude/skills/crm-mutation-tools.md` exists (may be empty or contain placeholder).
    - User has typed "approved".
  </acceptance_criteria>
  <done>Stub exists; executor unblocked.</done>
  <resume-signal>Type "approved" after creating the stub.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 6.1: Fill `.claude/skills/crm-mutation-tools.md` with full skill body</name>
  <read_first>
    - .claude/skills/crm-query-tools.md (mirror template)
    - .planning/standalone/crm-mutation-tools/CONTEXT.md (decision authority)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md (technical authority)
  </read_first>
  <action>
    Sobreescribir `.claude/skills/crm-mutation-tools.md` con un documento ~150-200 líneas mirroring la estructura del sibling `crm-query-tools.md`. Incluir las siguientes secciones obligatorias:

    1. **Title** + 1-line summary: "Shared mutation tools any conversational agent can register to mutate CRM data deterministically (no two-step propose+confirm). Coexists with crm-writer (D-01)."
    2. **PUEDE (15 tools enumeradas):** lista cada tool con signature corta de input.
    3. **NO PUEDE:** copia las 8 prohibitions del CONTEXT.md (no workspaceId in input, no hard delete, no base resource mutations, no retry on stage_changed_concurrently, no cross-workspace, no caching, no products field in updateOrder V1, no createAdminClient in module).
    4. **Validation gates (grep-verifiable):** lista los 12 grep gates de `<critical_constraints_grep_verifiable>` del planning context.
    5. **Configuration:** "no UI configuration today; activation is per-agent registration in tools={...}."
    6. **Consumers documentados:** "(Pendientes — los agentes que migren de crm-writer se documentarán en standalones follow-up: `crm-mutation-tools-pw-confirmation-integration` y otros por agente. Hasta entonces, módulo listo pero sin consumidores en producción — D-08 sin feature flag.)"
    7. **Coexistence with crm-writer:** breve sección sobre cuándo usar cada uno (mutation-tools = in-loop deterministic; crm-writer = sandbox UI con preview operador).
    8. **Idempotency contract:** explicación del `idempotencyKey` opcional + tabla `crm_mutation_idempotency_keys` + cron diario.
    9. **Error contract `stage_changed_concurrently`:** propaga verbatim — ver Standalone `crm-stage-integrity` D-06.
    10. **Project skill descubrible:** path `.claude/skills/crm-mutation-tools.md`.
    11. **Standalone shipped:** `.planning/standalone/crm-mutation-tools/` (date).

    Cada sección debe referenciar D-XX o RESEARCH section por trazabilidad.
  </action>
  <verify>
    <automated>wc -l .claude/skills/crm-mutation-tools.md && grep -c "PUEDE\|NO PUEDE\|Validation\|Consumers\|Coexistence\|Idempotency" .claude/skills/crm-mutation-tools.md</automated>
  </verify>
  <acceptance_criteria>
    - File ≥ 100 lines.
    - Headings include "PUEDE", "NO PUEDE", "Validation", "Consumers", "Coexistence", "Idempotency".
    - Lists all 15 tool names by name.
    - Reference to D-01, D-02, D-03, D-08 at minimum.
  </acceptance_criteria>
  <done>Project skill descubrible.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.2: Add `### Module Scope: crm-mutation-tools` to `CLAUDE.md`</name>
  <read_first>
    - CLAUDE.md (find existing `### Module Scope: crm-query-tools` section — mirror placement and format)
  </read_first>
  <action>
    Editar `CLAUDE.md`. Find the `### Module Scope: crm-query-tools` section. Immediately after that section (and before any subsequent `### Module Scope:` if any), add:

    ```markdown
    ### Module Scope: crm-mutation-tools (`src/lib/agents/shared/crm-mutation-tools/`)
    - **PUEDE (15 mutation tools deterministas, in-loop, latencia 50-150ms):**
      - **Contactos (3):** `createContact` (idempotency-eligible), `updateContact`, `archiveContact` (soft-delete via `archived_at`)
      - **Pedidos (5):** `createOrder` (idempotency-eligible), `updateOrder` (NO products en V1 — V1.1 deferred), `moveOrderToStage` (CAS-protected, propaga `stage_changed_concurrently` verbatim sin retry — Pitfall 1), `archiveOrder` (soft-delete via `archived_at`), `closeOrder` (soft-close via `closed_at` — D-11 Resolución A; distinto de archive)
      - **Notas (4):** `addContactNote` (idempotency-eligible), `addOrderNote` (idempotency-eligible), `archiveContactNote`, `archiveOrderNote`
      - **Tareas (3):** `createTask` (idempotency-eligible + exclusive arc contactId/orderId/conversationId), `updateTask`, `completeTask` (toggle `completed_at`)
    - **NO PUEDE:**
      - Mutar recursos base (tags/pipelines/stages/templates/usuarios) — D-pre-05; retorna `resource_not_found` con `missing.resource` discriminator
      - Hard-DELETE de NADA — soft-delete vía `archived_at` / `closed_at` / `completed_at` (D-pre-04)
      - Retry implícito en `stage_changed_concurrently` — propaga verbatim al agent loop (Pitfall 1, mismo contract que crm-writer)
      - Cachear resultados — cada tool-call llega a domain layer fresh + re-hidrata via `getXxxById` (D-09)
      - Editar items de un pedido (`updateOrder.products`) — V1.1 deferred; V1 escala a handoff humano
      - Acceder a otros workspaces — `ctx.workspaceId` viene del execution context, NUNCA del input (D-pre-03)
      - Importar `createAdminClient` o `@supabase/supabase-js` directamente — toda mutación pasa por `@/lib/domain/*` (Regla 3, D-pre-02; verificable via grep)
    - **Validación (gates verificables):**
      - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/` retorna 0 matches no-comentario
      - `grep -E "workspaceId.*z\.string|workspaceId.*\.uuid" src/lib/agents/shared/crm-mutation-tools/{contacts,orders,notes,tasks}.ts` retorna 0 matches (Pitfall 2)
      - `grep -E "deleteContact|deleteOrder|deleteTask|deleteNote\b" src/lib/agents/shared/crm-mutation-tools/` retorna 0 matches (Pitfall 4)
      - Idempotencia persistente en tabla `crm_mutation_idempotency_keys` (PK `workspace_id, tool_name, key`); TTL 30 días vía cron Inngest `crm-mutation-idempotency-cleanup` (TZ=America/Bogota 0 3 * * *)
      - Audit trail emite 3 eventos `pipeline_decision:crm_mutation_*` (`invoked` / `completed` / `failed`) a `agent_observability_events` con PII redaction (phone last 4, email local-part masked, body truncated 200 chars)
      - Project skill descubrible: `.claude/skills/crm-mutation-tools.md`
      - Standalone shipped: `.planning/standalone/crm-mutation-tools/` (2026-04-29)
    - **Coexistencia con crm-writer (D-01):** crm-writer (two-step propose+confirm + tabla `crm_bot_actions`) sigue VIVO sin cambios. mutation-tools es alternativa NUEVA, no reemplazo. Cuándo usar cada uno:
      - **mutation-tools:** in-loop tool calls deterministas, baja latencia (~50-150ms), audit en `agent_observability_events`. Default para agentes nuevos.
      - **crm-writer:** sandbox UI con preview operador antes de commit, audit trail estructurado en `crm_bot_actions`, two-step idempotencia + TTL. Default cuando el flujo requiere humano-en-el-loop.
    - **Consumidores documentados:** (pendientes — agentes que migren se documentarán en standalones follow-up por agente: `crm-mutation-tools-pw-confirmation-integration` y otros. Sin consumidores en prod al ship — D-08 sin feature flag).
    ```
  </action>
  <verify>
    <automated>grep -c "### Module Scope: crm-mutation-tools" CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "### Module Scope: crm-mutation-tools" CLAUDE.md` == 1.
    - Section appears AFTER the existing `### Module Scope: crm-query-tools` section.
    - References Reglas 3 + Pitfalls 1, 2, 4 + D-01, D-08, D-11.
  </acceptance_criteria>
  <done>CLAUDE.md sincronizado.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.3: Cross-ref pointer in `.claude/rules/agent-scope.md`</name>
  <read_first>
    - .claude/rules/agent-scope.md (find existing `### Module Scope: crm-query-tools` section — mirror)
  </read_first>
  <action>
    Editar `.claude/rules/agent-scope.md`. Find the existing block:

    ```
    ### Module Scope: crm-query-tools (`src/lib/agents/shared/crm-query-tools/`)
    Shared read-only query tools any conversational agent can register. NOT an agent itself.
    Full PUEDE / NO PUEDE / Validation / Consumers in `.claude/skills/crm-query-tools.md`.
    ...
    ```

    Inmediately after, add:

    ```markdown
    ### Module Scope: crm-mutation-tools (`src/lib/agents/shared/crm-mutation-tools/`)
    Shared mutation tools any conversational agent can register. NOT an agent itself.
    Full PUEDE / NO PUEDE / Validation / Consumers / Idempotency / Coexistence with crm-writer in `.claude/skills/crm-mutation-tools.md`.
    Standalone: `.planning/standalone/crm-mutation-tools/` (shipped 2026-04-29).
    ```
  </action>
  <verify>
    <automated>grep -c "### Module Scope: crm-mutation-tools" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "### Module Scope: crm-mutation-tools" .claude/rules/agent-scope.md` == 1.
    - References `.claude/skills/crm-mutation-tools.md`.
  </acceptance_criteria>
  <done>Cross-ref añadido.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.4: Write `INTEGRATION-HANDOFF.md`</name>
  <read_first>
    - .planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md (mirror template)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:765-820 (Observability section + forensics query)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:1060-1068 (Pitfall 11 — coexistence with crm-writer)
  </read_first>
  <action>
    Crear `.planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md` con secciones (~250-350 líneas):

    1. **Quick start** — registration snippet:
       ```typescript
       import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
       const mutationTools = createCrmMutationTools({ workspaceId, invoker: 'my-agent-v1' })
       const result = await generateText({
         model,
         tools: { ...mutationTools, ...otherTools },
         // ...
       })
       ```
    2. **15-tool inventory table** — name, kind (create/update/move/archive/close/complete), idempotency-eligible, expected status branches.
    3. **Error contract table** — for each tool, list possible MutationResult statuses + when each happens (executed / resource_not_found / stage_changed_concurrently / validation_error / duplicate / workspace_mismatch / error). Highlight that `workspace_mismatch` is currently dead-code in V1 (defensive only — A8).
    4. **Idempotency-key contract** — when to provide one (network-retry-prone create paths), when not to (update/archive/close/complete are idempotent at domain), TTL 30 days, race semantics (exactly-once across N concurrent calls with same key).
    5. **Observability forensics query** — copy verbatim from RESEARCH § Forensics Query (the SQL block).
    6. **Polymorphic `result_id` rationale (A10)** — why single table over per-tool tables (TTL cron sweeps everything; FK enforced via workspace_id CASCADE; UI forensics doesn't depend on FK).
    7. **Pitfall 11 — Coexistence with crm-writer (CRITICAL note)** — same workspace MUST NOT have agent-A using crm-writer + agent-B using mutation-tools mutating the same entity classes simultaneously, OR forensics needs both `crm_bot_actions` and `agent_observability_events` UNION'd. Document UNION view as future work if pain emerges.
    8. **CAS prerequisite for moveOrderToStage tests** — flag `platform_config.crm_stage_integrity_cas_enabled` must be `true` in production for CAS protection. Default `false` per `src/lib/domain/orders.ts:632`. Production deployment checklist.
    9. **CLAUDE.md sync confirmation** — module scope section added.
    10. **Project skill** — path + 1-line description.
    11. **Standalone status** — shipped date + commit range.
    12. **What's next (deferred standalones)** — list:
        - `crm-mutation-tools-pw-confirmation-integration` (migrate Somnio sales-v3 PW from crm-writer)
        - `crm-mutation-tools-sandbox-integration` (etc., per agent)
        - V1.1: `updateOrder.products`, optimistic concurrency on updateOrder.
  </action>
  <verify>
    <automated>wc -l .planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md && grep -c "Quick start\|Error contract\|Idempotency\|Observability\|Coexistence\|CAS" .planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md</automated>
  </verify>
  <acceptance_criteria>
    - File ≥ 200 lines.
    - Contains the 12 numbered sections listed.
    - Includes the SQL forensics query verbatim.
    - References Pitfall 11 explicitly.
    - References standalone follow-ups expected (no consumers in prod yet — D-08).
  </acceptance_criteria>
  <done>Handoff doc completo.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.5: Write `LEARNINGS.md` skeleton</name>
  <action>
    Crear `.planning/standalone/crm-mutation-tools/LEARNINGS.md` skeleton:

    ```markdown
    # LEARNINGS — Standalone crm-mutation-tools

    Bugs, gotchas, decisions revisitadas durante ejecución de Plans 01-06.
    Rellenar durante / después de cada plan execution.

    ## Plan 01 (Wave 0 — Foundation)
    _Ejemplos esperables:_
    - Bug X: …
    - Decisión: …

    ## Plan 02 (Wave 1 — Module skeleton + createContact)

    ## Plan 03 (Wave 2 — Contacts + Orders fan-out)
    - **CAS-reject test** — confirmar que el test mock para `moveOrderToStage` con `data.currentStageId` realmente fallaria si la implementación silenciara el error. Agregar comentario inline si es necesario.

    ## Plan 04 (Wave 3 — Notes + Tasks)
    - **archiveContactNote sin getNoteById** — relying on domain mapDomainError. Si Plan 05 integration test falla, considerar agregar `getNoteById` al domain.

    ## Plan 05 (Wave 4 — Test infrastructure)
    - **CAS flag flip race** — si stage-change-concurrent.test.ts deja flag flipped en caso de exception, otros tests fallan. afterAll en finally block.

    ## Plan 06 (Wave 5 — Documentation)
    - **Sandbox `.claude/skills/`** — confirmar que el pre-write checkpoint funcionó.

    ## Cross-plan patterns

    ## Deferred / V1.1 backlog
    - `updateOrder.products`
    - Optimistic concurrency on `updateOrder` (version column)
    - Bulk operations (`bulkArchiveOrders`, `bulkMoveOrdersToStage`)
    - Admin gate for destructive operations (per-agent opt-in)
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/crm-mutation-tools/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists with 6 plan sections + cross-plan + deferred list.
  </acceptance_criteria>
  <done>Skeleton listo para fill durante ejecución.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.6: Write `SUMMARY.md` + commit + push</name>
  <action>
    1. Crear `.planning/standalone/crm-mutation-tools/SUMMARY.md`:

    ```markdown
    # SUMMARY — Standalone crm-mutation-tools

    **Status:** Shipped 2026-04-29 (planned date)
    **Commit range:** (filled by execute-phase)
    **Plans:** 6 plans, 6 waves
    **Tools:** 15/15 (contacts 3 + orders 5 + notes 4 + tasks 3)

    ## What shipped

    Built `src/lib/agents/shared/crm-mutation-tools/` — 15 deterministic mutation tools mirroring `crm-query-tools` (shipped same day) but with opposite verb. Tools call domain layer directly (Regla 3) — no two-step propose+confirm. Coexists with `crm-writer` (D-01); no migration of existing agents in this standalone.

    Closed the gap of `closeOrder` per D-11 Resolution A: added `orders.closed_at TIMESTAMPTZ NULL` column + `closeOrder` domain function. Distinct semantics from `archiveOrder` (closed = "finalizado", archived = "soft-delete oculto").

    Added new dedup table `crm_mutation_idempotency_keys` (PK `workspace_id, tool_name, key`) with daily TTL cleanup cron via Inngest. 5 creation tools accept opt-in `idempotencyKey?` for retry-safety.

    ## Coverage

    - **Unit:** ~50 tests across helpers + 4 entity files. All 7 status branches covered per tool where applicable.
    - **Integration (env-gated):** 4 files — cross-workspace isolation, idempotency race, soft-delete invariant, CAS reject path.
    - **E2E (Playwright):** 4 scenarios via `/api/test/crm-mutation-tools/runner` 4-gate hardened endpoint — Kanban round-trip + Supabase round-trip.

    ## Constraints honored (grep gates)

    - Zero `createAdminClient` / `@supabase/supabase-js` imports in module (Regla 3 / D-pre-02).
    - Zero `workspaceId` fields in any inputSchema (Pitfall 2 / D-pre-03).
    - Zero hard-delete imports (Pitfall 4 / D-pre-04).
    - Zero retry on `stage_changed_concurrently` (Pitfall 1).
    - Zero cross-module imports from `@/lib/agents/crm-writer` (Pitfall 10).
    - `updateOrder` inputSchema does NOT contain `products` (V1.1 deferred).

    ## Audit trail

    All mutations emit 3 events `pipeline_decision:crm_mutation_*` (invoked / completed / failed) to `agent_observability_events` with PII-redacted payloads. SQL forensics query in `INTEGRATION-HANDOFF.md`.

    ## Open follow-ups

    - `crm-mutation-tools-pw-confirmation-integration` — migrate `somnio-sales-v3-pw-confirmation` from crm-writer.
    - Per-agent migration standalones for other crm-writer consumers.
    - V1.1: `updateOrder.products`, optimistic concurrency, bulk operations, admin gate.

    ## References

    - CONTEXT.md (16 decisions D-pre-01..D-11)
    - RESEARCH.md (1370 lines — full implementation map)
    - INTEGRATION-HANDOFF.md (consumer guide)
    - LEARNINGS.md (post-mortems)
    - `.claude/skills/crm-mutation-tools.md` (project skill)
    - `CLAUDE.md` § Module Scope: crm-mutation-tools
    - `.claude/rules/agent-scope.md` § Module Scope cross-ref
    ```

    2. Commit + push:
    ```
    git add .claude/skills/crm-mutation-tools.md \
            .claude/rules/agent-scope.md \
            CLAUDE.md \
            .planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md \
            .planning/standalone/crm-mutation-tools/LEARNINGS.md \
            .planning/standalone/crm-mutation-tools/SUMMARY.md
    git commit -m "$(cat <<'EOF'
    docs(crm-mutation-tools): wave 5 — project skill + CLAUDE.md scope + INTEGRATION-HANDOFF + LEARNINGS + SUMMARY

    - .claude/skills/crm-mutation-tools.md — project skill descubrible (PUEDE/NO PUEDE/Validation/Consumers/Coexistence/Idempotency).
    - CLAUDE.md — sección "### Module Scope: crm-mutation-tools" (espejo de crm-query-tools, con coexistencia D-01 + 12 grep gates).
    - .claude/rules/agent-scope.md — cross-ref pointer al skill.
    - INTEGRATION-HANDOFF.md — quick start + 15-tool inventory + error contract table + idempotency contract + observability forensics SQL + Pitfall 11 coexistence + CAS prerequisite + V1.1 backlog.
    - LEARNINGS.md skeleton — 6 plan sections + cross-plan + deferred.
    - SUMMARY.md — phase-close con coverage, constraints honored, follow-ups.

    Standalone: crm-mutation-tools Plan 06 (Wave 5) — final.
    Refs D-01..D-11.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "wave 5" && ls .planning/standalone/crm-mutation-tools/{INTEGRATION-HANDOFF,LEARNINGS,SUMMARY}.md</automated>
  </verify>
  <acceptance_criteria>
    - SUMMARY.md, INTEGRATION-HANDOFF.md, LEARNINGS.md all exist.
    - Commit pushed; tree clean.
    - `grep -c "### Module Scope: crm-mutation-tools" CLAUDE.md` == 1.
    - `grep -c "### Module Scope: crm-mutation-tools" .claude/rules/agent-scope.md` == 1.
    - Standalone directory has expected files: CONTEXT.md, RESEARCH.md, 01-PLAN..06-PLAN, INTEGRATION-HANDOFF.md, LEARNINGS.md, SUMMARY.md.
  </acceptance_criteria>
  <done>Standalone crm-mutation-tools shipped end-to-end.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Documentation → Future agent integrators | Discoverability via `.claude/skills/` + CLAUDE.md ensures correct usage |
| LEARNINGS.md → Future planners | Captures bugs / decisions to avoid repetition |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-01 | Repudiation | Documentation drift between code and skill files | LOW | mitigate | CLAUDE.md Regla 4 (Documentation always synced) — cross-references CONTEXT/RESEARCH/CLAUDE.md/skill in same commit. |
| T-06-02 | Information Disclosure | INTEGRATION-HANDOFF leaks secrets in SQL examples | LOW | mitigate | Forensics SQL uses placeholder `$1` for workspace_id parameter; no real workspace UUIDs in doc. |
| T-06-03 | Tampering | `.claude/skills/` sandbox restriction blocks edit | MED | mitigate | Pre-write checkpoint Task 6.0 creates stub before subagent edit (LEARNINGS Plan 07 sibling). |
</threat_model>

<must_haves>
truths:
  - "`.claude/skills/crm-mutation-tools.md` discoverable, lists all 15 tools + invariants."
  - "`CLAUDE.md` has `### Module Scope: crm-mutation-tools` section with grep-verifiable invariants and coexistence note."
  - "`.claude/rules/agent-scope.md` cross-references the skill."
  - "`INTEGRATION-HANDOFF.md` provides registration snippet, error contract table, observability SQL, Pitfall 11 coexistence note."
  - "`LEARNINGS.md` skeleton ready for execution-phase fill."
  - "`SUMMARY.md` reflects shipped state."
artifacts:
  - path: ".claude/skills/crm-mutation-tools.md"
    provides: "Project skill discoverable by all agents/devs"
    min_lines: 100
  - path: "CLAUDE.md"
    provides: "Module Scope section for mutation-tools"
    contains: "### Module Scope: crm-mutation-tools"
  - path: ".claude/rules/agent-scope.md"
    provides: "Cross-ref pointer"
    contains: "### Module Scope: crm-mutation-tools"
  - path: ".planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md"
    provides: "Consumer integration guide"
    min_lines: 200
  - path: ".planning/standalone/crm-mutation-tools/LEARNINGS.md"
    provides: "Post-mortem capture skeleton"
  - path: ".planning/standalone/crm-mutation-tools/SUMMARY.md"
    provides: "Phase-close summary"
key_links:
  - from: "CLAUDE.md"
    to: ".claude/skills/crm-mutation-tools.md"
    via: "Module Scope section references skill"
    pattern: ".claude/skills/crm-mutation-tools.md"
  - from: ".claude/rules/agent-scope.md"
    to: ".claude/skills/crm-mutation-tools.md"
    via: "cross-ref pointer"
    pattern: "crm-mutation-tools.md"
</must_haves>
</content>
</invoke>