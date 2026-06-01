---
phase: ui-agent-content-editor
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/lib/domain/agent-templates.ts
  - src/lib/domain/__tests__/agent-templates.test.ts
autonomous: true
requirements: [D-02, D-03, D-08]

must_haves:
  truths:
    - "Reads return all agent_templates rows for any agent (read-only visibility, D-04 enabler)"
    - "Mutations (update/add/delete/reorder) are rejected for any agent_id !== 'somnio-sales-v4' (D-02)"
    - "addTemplate into an intent that does not already exist for the agent is rejected (D-08)"
    - "Reorder never violates the UNIQUE(agent_id,intent,visit_type,orden,workspace_id) constraint (Pitfall 3)"
    - "No createAdminClient anywhere outside this domain file (Regla 3)"
  artifacts:
    - path: "src/lib/domain/agent-templates.ts"
      provides: "Domain CRUD + reorder for agent_templates"
      contains: "createAdminClient"
      min_lines: 120
    - path: "src/lib/domain/__tests__/agent-templates.test.ts"
      provides: "GREEN tests for D-02/D-08/Regla 3/reorder"
  key_links:
    - from: "src/lib/domain/agent-templates.ts"
      to: "agent_templates table"
      via: "createAdminClient().from('agent_templates') with explicit .eq filters"
      pattern: "from\\('agent_templates'\\)"
---

<objective>
Create the `agent_templates` domain layer (Regla 3) with read-all + v4-only mutations, existing-intent-only add (D-08), and a collision-safe reorder (Pitfall 3). Convert the Plan 01 stub test to GREEN.

Purpose: `agent_templates` has NO domain layer today — `TemplateManager` hits `createAdminClient` directly (`template-manager.ts:9`). Regla 3 mandates a domain file before any UI mutation. D-03: the UI edits the exact rows v4 uses in place (global + v4 scope), no workspace overrides. D-02/Regla 6: only `somnio-sales-v4` is mutable; all other agents are read-only.

Output: `src/lib/domain/agent-templates.ts` + green domain tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-agent-content-editor/CONTEXT.md
@.planning/standalone/ui-agent-content-editor/RESEARCH.md
@.planning/standalone/ui-agent-content-editor/PATTERNS.md

<interfaces>
From src/lib/domain/types.ts:
```typescript
export interface DomainContext { workspaceId: string; source: string; actorId?: string | null; actorLabel?: string | null }
export interface DomainResult<T = void> { success: boolean; data?: T; error?: string }
```

agent_templates schema (RESEARCH §Domain Layer Shape — VERIFIED):
- id UUID PK; agent_id TEXT; intent TEXT; visit_type TEXT CHECK IN ('primera_vez','siguientes'); orden INTEGER (part of UNIQUE); content_type TEXT CHECK IN ('texto','template','imagen'); content TEXT; delay_s INTEGER; workspace_id UUID NULL (NULL=global); priority TEXT CHECK IN ('CORE','COMPLEMENTARIA','OPCIONAL'); minifrase TEXT NULL; created_at; updated_at (trigger).
- UNIQUE(agent_id, intent, visit_type, orden, workspace_id). RLS enabled (domain uses admin client, still filters explicitly).
- v4 uses visit_type='primera_vez' (siguientes rows deleted Phase 34).

Runtime lookup the domain must stay consistent with (template-manager.ts:272-294): selects by agent_id, ordered intent→visit_type→orden, merges workspace_id IS NULL + workspace match.

From src/lib/agents/somnio-v4/config.ts: SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'.

Mock harness analog: src/lib/domain/__tests__/resolve-or-create-contact.test.ts (S-4 thenable builder).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement agent-templates.ts read functions + types</name>
  <read_first>
    - src/lib/domain/whatsapp-templates.ts (lines 71-90 — createAdminClient inside domain + explicit .eq filter + DomainResult)
    - src/lib/domain/crm-query-tools-config.ts (read/write split, explicit workspace filter)
    - src/lib/agents/somnio/template-manager.ts (lines 257-314 — the runtime read shape this must mirror)
    - src/lib/domain/types.ts
  </read_first>
  <behavior>
    - `listTemplatesByAgent(ctx, agentId)` returns all rows for that agent_id, ordered intent→visit_type→orden, scoped to global+workspace (workspace_id IS NULL OR = ctx.workspaceId), for ANY agent (read allowed, D-04).
    - `listIntents(ctx, agentId)` returns the distinct set of intents present for that agent (used by D-08 guard + UI grouping).
  </behavior>
  <action>
Create `src/lib/domain/agent-templates.ts`. Import `createAdminClient` from `@/lib/supabase/admin` and `DomainContext`/`DomainResult` from `./types`. Define an `AgentTemplateRow` interface mirroring the schema above (reuse the types from `src/lib/agents/types.ts:644-677` if a suitable `AgentTemplate` type exists — import it rather than redefine).

`listTemplatesByAgent(ctx: DomainContext, agentId: string): Promise<DomainResult<AgentTemplateRow[]>>`:
```typescript
const supabase = createAdminClient()
const { data, error } = await supabase
  .from('agent_templates')
  .select('*')
  .eq('agent_id', agentId)
  .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspaceId}`)
  .order('intent').order('visit_type').order('orden')
if (error) return { success: false, error: error.message }
return { success: true, data: data ?? [] }
```

`listIntents(ctx: DomainContext, agentId: string): Promise<DomainResult<string[]>>`: select distinct intents for the agent (same scoping), return sorted unique list.

Reads do NOT gate on agent (D-04 — all agents visible read-only).
  </action>
  <acceptance_criteria>
    - `test -f src/lib/domain/agent-templates.ts`
    - `grep -c "export async function listTemplatesByAgent" src/lib/domain/agent-templates.ts` == 1
    - `grep -c "export async function listIntents" src/lib/domain/agent-templates.ts` == 1
    - `grep -c "from('agent_templates')" src/lib/domain/agent-templates.ts` matches every query; each followed by `.eq('agent_id'` in source
    - `npx tsc --noEmit` does not error on this file
  </acceptance_criteria>
  <verify>
    <automated>grep -c "export async function listTemplatesByAgent" src/lib/domain/agent-templates.ts</automated>
  </verify>
  <done>Read functions return scoped rows for any agent; types compile.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Mutations — update/add/delete with D-02 v4-gate + D-08 existing-intent guard</name>
  <read_first>
    - src/lib/domain/agent-templates.ts (Task 1 reads)
    - src/lib/domain/whatsapp-templates.ts (uniqueness-check-then-insert pattern, DomainResult error shape)
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§Domain Layer Shape — function list; D-02/D-08)
  </read_first>
  <behavior>
    - `updateTemplateContent` / `addTemplate` / `deleteTemplate` return `{ success:false, error }` when `agentId !== 'somnio-sales-v4'` (D-02) BEFORE touching the DB.
    - `addTemplate` into an intent NOT present in `listIntents` returns error (D-08); into an existing intent inserts a row with the requested fields.
    - Every mutation query filters by `agent_id` (and `id` for update/delete) — no cross-agent write possible.
  </behavior>
  <action>
Add to `agent-templates.ts`. Define a module constant `const EDITABLE_AGENT_ID = 'somnio-sales-v4'` and a private helper `function assertEditable(agentId: string): DomainResult | null { return agentId === EDITABLE_AGENT_ID ? null : { success: false, error: 'Solo somnio-sales-v4 es editable (Regla 6 / D-02).' } }`.

`updateTemplateContent(ctx, params: { id: string; agentId: string; content: string; content_type: 'texto'|'template'|'imagen'; delay_s: number; priority: 'CORE'|'COMPLEMENTARIA'|'OPCIONAL'; minifrase: string | null }): Promise<DomainResult>`:
- `const gate = assertEditable(params.agentId); if (gate) return gate`
- UPDATE the row by `.eq('id', params.id).eq('agent_id', params.agentId)` setting content, content_type, delay_s, priority, minifrase, updated_at. Return DomainResult.

`addTemplate(ctx, params: { agentId: string; intent: string; visit_type: 'primera_vez'|'siguientes'; orden: number; content_type; content; delay_s; priority; minifrase: string | null }): Promise<DomainResult<AgentTemplateRow>>`:
- gate via assertEditable.
- D-08 guard: `const intents = await listIntents(ctx, params.agentId); if (!intents.data?.includes(params.intent)) return { success:false, error: 'Intent inexistente. Crear intents nuevos requiere código del agente (D-08).' }`
- INSERT row (workspace_id: NULL for global v4 rows per D-03 — match the row scope the agent uses; if existing v4 rows for this intent are global, insert global). Return inserted row.

`deleteTemplate(ctx, params: { id: string; agentId: string }): Promise<DomainResult>`:
- gate via assertEditable. DELETE by `.eq('id').eq('agent_id')`. Return DomainResult.
  </action>
  <acceptance_criteria>
    - `grep -c "EDITABLE_AGENT_ID = 'somnio-sales-v4'" src/lib/domain/agent-templates.ts` == 1
    - `grep -c "export async function updateTemplateContent\|export async function addTemplate\|export async function deleteTemplate" src/lib/domain/agent-templates.ts` == 3
    - `grep -c "assertEditable" src/lib/domain/agent-templates.ts` >= 4 (helper + 3 callers minimum)
    - D-08 guard present: `grep -c "listIntents" src/lib/domain/agent-templates.ts` >= 2 (defined + used in addTemplate)
    - `npx tsc --noEmit` clean for this file
  </acceptance_criteria>
  <verify>
    <automated>grep -c "assertEditable" src/lib/domain/agent-templates.ts</automated>
  </verify>
  <done>Mutations gated to v4 (D-02), addTemplate guards unknown intents (D-08), all queries agent-scoped.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: reorderTemplates with UNIQUE-collision-safe temp-offset (Pitfall 3)</name>
  <read_first>
    - src/lib/domain/agent-templates.ts (Tasks 1-2)
    - supabase/migrations/20260206000000_agent_templates.sql (line ~39 — UNIQUE(agent_id,intent,visit_type,orden,workspace_id))
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (Pitfall 3 — temp-offset strategy)
  </read_first>
  <behavior>
    - `reorderTemplates(ctx, { agentId, intent, visit_type, orderedIds })` assigns orden 0..N-1 in the order of `orderedIds` WITHOUT ever transiently duplicating an `orden` value within the (agent_id,intent,visit_type,workspace_id) group.
    - Rejected for non-v4 agent (D-02).
  </behavior>
  <action>
Add `reorderTemplates(ctx, params: { agentId: string; intent: string; visit_type: string; orderedIds: string[] }): Promise<DomainResult>`.
- gate via assertEditable.
- Two-phase temp-offset to dodge the UNIQUE constraint (Pitfall 3):
  - Phase 1: for each id in orderedIds at index i, UPDATE `orden = 1000 + i` WHERE `id = id AND agent_id = agentId`. (Offset 1000 chosen because real orden values are small single/double digits; no collision with the target range.)
  - Phase 2: for each id at index i, UPDATE `orden = i` WHERE `id = id AND agent_id = agentId`.
- Run sequentially (await each), abort + return error on first failure. Because phase 1 moves ALL rows out of the 0..N-1 range before phase 2 writes into it, no two rows ever share an orden mid-update.
- Document inline why the offset approach is used (cite Pitfall 3 + the UNIQUE key).
  </action>
  <acceptance_criteria>
    - `grep -c "export async function reorderTemplates" src/lib/domain/agent-templates.ts` == 1
    - `grep -c "1000" src/lib/domain/agent-templates.ts` >= 1 (temp offset) AND a comment citing the UNIQUE constraint: `grep -ci "unique\|pitfall 3" src/lib/domain/agent-templates.ts` >= 1
    - `grep -c "assertEditable" src/lib/domain/agent-templates.ts` increased (reorder gated too)
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "export async function reorderTemplates" src/lib/domain/agent-templates.ts</automated>
  </verify>
  <done>Reorder uses temp-offset; provably collision-free against the UNIQUE key; v4-gated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Convert Plan 01 stub to GREEN domain tests (D-02/D-08/Regla 3/reorder)</name>
  <read_first>
    - src/lib/domain/__tests__/agent-templates.test.ts (the Plan 01 it.todo stub)
    - src/lib/domain/__tests__/resolve-or-create-contact.test.ts (S-4 mock harness — chain createAdminClient→from→select/eq/or/order/maybeSingle/insert thenable)
    - src/lib/domain/agent-templates.ts (Tasks 1-3)
  </read_first>
  <action>
Rewrite `src/lib/domain/__tests__/agent-templates.test.ts`, replacing the `it.todo` stubs with real assertions using the resolve-or-create-contact mock harness (mock `@/lib/supabase/admin` → `createAdminClient` returning a chainable builder; assert on the captured query/calls, no real DB):
- D-02: `updateTemplateContent(ctx, { agentId: 'godentist', ... })` → `success === false` and error mentions v4; assert the DB update was NOT called.
- D-02: `reorderTemplates(ctx, { agentId: 'somnio-sales-v3', ... })` → `success === false`.
- D-08: with `listIntents` mocked/returning `['saludo','precio']`, `addTemplate(ctx, { agentId:'somnio-sales-v4', intent:'intent_que_no_existe', ... })` → `success === false`, error mentions intent.
- D-08: `addTemplate` with `intent:'saludo'` (existing) → insert builder called, `success === true`.
- Reorder collision-safe: assert phase-1 offset UPDATEs (orden 1000+i) all issue before any phase-2 (orden i) UPDATE (inspect the recorded call order on the mock).
- Regla 3 (test-encoded): assert the only import of createAdminClient in the module-under-test is the domain file (this is a code-review/grep item; add a comment pointing to the grep gate in Plan 07).
  </action>
  <acceptance_criteria>
    - `npx vitest run src/lib/domain/__tests__/agent-templates.test.ts` passes with >= 5 real (non-todo) assertions
    - `grep -c "it.todo" src/lib/domain/__tests__/agent-templates.test.ts` == 0 (all converted)
    - Regla 3 grep gate: `grep -rn "createAdminClient" src/lib/domain/agent-templates.ts | wc -l` >= 1 AND createAdminClient appears ONLY in the domain file (not in the test target's non-test imports)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/domain/__tests__/agent-templates.test.ts</automated>
  </verify>
  <done>Templates domain tests GREEN; D-02/D-08/reorder behaviors proven.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| server-action → domain | DomainContext.workspaceId is trusted (caller validated auth); domain re-scopes every query. |
| domain → agent_templates (RLS bypassed via admin client) | Domain is the ONLY guard; must filter by agent_id + workspace scope. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE03-01 | Elevation of privilege | Editing a production agent's templates | mitigate | `assertEditable` rejects any agent_id !== 'somnio-sales-v4' before DB (D-02/Regla 6); unit-tested. |
| T-UICE03-02 | Tampering | Reorder corrupting orden via UNIQUE violation / partial write | mitigate | Two-phase temp-offset (Pitfall 3); test asserts phase ordering. |
| T-UICE03-03 | Tampering | Creating a phantom intent the agent can't dispatch | mitigate | D-08 guard rejects unknown intents. |
| T-UICE03-04 | Information disclosure | Cross-workspace template read | mitigate | `.or(workspace_id.is.null,workspace_id.eq.{ctx.workspaceId})` on reads; RLS also active. |
</threat_model>

<verification>
- `npx vitest run src/lib/domain/__tests__/agent-templates.test.ts` green.
- `grep -rn "createAdminClient" src/lib/domain/agent-templates.ts` >= 1 (domain owns the client).
- Reorder temp-offset present and tested.
</verification>

<success_criteria>
- agent-templates.ts exposes listTemplatesByAgent, listIntents, updateTemplateContent, addTemplate, deleteTemplate, reorderTemplates.
- Mutations v4-gated (D-02), addTemplate existing-intent-only (D-08), reorder collision-safe (Pitfall 3), reads any-agent (D-04).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/03-SUMMARY.md`.
</output>
