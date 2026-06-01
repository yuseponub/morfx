---
phase: ui-agent-content-editor
plan: 04
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/lib/domain/agent-knowledge-base.ts
  - src/lib/domain/__tests__/agent-knowledge-base.test.ts
autonomous: true
requirements: [D-01b, D-02, D-06, D-09, D-10]

must_haves:
  truths:
    - "Reads filter every KB query by .eq('workspace_id').eq('agent_id') — the only guard since the table has NO RLS (Pitfall 2)"
    - "createKbTopic / updateKbTopic / restoreKbVersion compute contentToEmbed via the canonical serializer, embed BEFORE the DB write, and write nothing on OpenAI failure (D-06)"
    - "updateKbTopic and restoreKbVersion snapshot the current row into agent_knowledge_base_versions before overwriting (D-01b)"
    - "Mutations reject agent_id !== 'somnio-sales-v4' (D-02)"
    - "UI-created topics supply synthetic NOT-NULL values (source_md_path, last_reviewed_at, reviewed_by) (Pitfall 5)"
  artifacts:
    - path: "src/lib/domain/agent-knowledge-base.ts"
      provides: "Domain CRUD + versioning + synchronous re-embed for agent_knowledge_base"
      contains: "buildContentToEmbed"
      min_lines: 180
    - path: "src/lib/domain/__tests__/agent-knowledge-base.test.ts"
      provides: "GREEN tests for D-01b/D-06/D-09/D-10/D-02/Pitfall 2"
  key_links:
    - from: "src/lib/domain/agent-knowledge-base.ts"
      to: "src/lib/agents/somnio-v4/knowledge-base/serialize.ts"
      via: "import buildContentToEmbed — same form as migration re-embed (Plan 02)"
      pattern: "buildContentToEmbed"
    - from: "src/lib/domain/agent-knowledge-base.ts"
      to: "src/lib/agents/somnio-v4/knowledge-base/embed.ts"
      via: "import generateEmbedding (reuse env fallback)"
      pattern: "generateEmbedding"
---

<objective>
Create the `agent_knowledge_base` domain layer (Regla 3): CRUD of topics, synchronous re-embed on create/edit/restore (D-06, D-09), DB versioning snapshot/list/search/restore (D-01b), exposing scope_summary + keywords (D-10), v4-only mutations (D-02), and mandatory workspace+agent filtering (Pitfall 2 — the table has NO RLS). Convert the Plan 01 stub test to GREEN.

Purpose: After D-01 the DB is the KB source of truth and the UI re-embeds on save. This domain re-targets the existing sync stack (`generateEmbedding` + sha256 hash-guard) from `.md`-driven to DB-column-driven via the canonical serializer locked in Plan 01.

Output: `src/lib/domain/agent-knowledge-base.ts` + green domain tests.
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
From src/lib/domain/types.ts: DomainContext { workspaceId; source; actorId?; actorLabel? }, DomainResult<T>.

From src/lib/agents/somnio-v4/knowledge-base/serialize.ts (Plan 01):
```typescript
export interface KbContentColumns { scope_summary: string|null; hechos_del_producto: string|null; posicion_del_negocio: string|null; debe_contener: string[]; nunca_decir: string[]; cuando_escalar: string[] }
export function buildContentToEmbed(row: KbContentColumns): string
```

From src/lib/agents/somnio-v4/knowledge-base/embed.ts:
```typescript
export async function generateEmbedding(text: string): Promise<number[]>  // throws on OpenAI failure
```

agent_knowledge_base schema (RESEARCH §Domain Layer Shape — VERIFIED). NOT-NULL: workspace_id, agent_id, topic, keywords TEXT[] DEFAULT {}, category CHECK IN ('product','policies','edge-cases','faqs-no-templated'), embedding vector(1536), source_md_path, body_hash, last_reviewed_at DATE, reviewed_by. Nullable: scope_summary (NEW, Plan 02), hechos_del_producto, posicion_del_negocio, tone_override, canonical_response (DEPRECATED). debe_contener/nunca_decir/cuando_escalar/escalate_triggers/related_topics TEXT[] DEFAULT {}. UNIQUE(topic, agent_id, workspace_id). NO RLS — GRANTs only.

agent_knowledge_base_versions schema (Plan 02): id, kb_id FK CASCADE, workspace_id, agent_id, topic, + all editable fields, version_num INT, edited_by, created_at Bogota. UNIQUE(kb_id, version_num). NO embedding column.

From src/lib/agents/somnio-v4/config.ts: SOMNIO_V4_AGENT_ID='somnio-sales-v4', SOMNIO_WORKSPACE_ID='a3843b3f-c337-4836-92b5-89c58bb98490'.

Re-embed pattern to mirror (sync.ts:42-64): hash contentToEmbed → if body_hash unchanged, keep embedding (skip OpenAI) → else generateEmbedding.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: KB read functions with mandatory workspace+agent filter (Pitfall 2)</name>
  <read_first>
    - src/lib/domain/whatsapp-templates.ts (createAdminClient inside domain + DomainResult)
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (lines 48-54 — the .eq(topic).eq(agent_id).eq(workspace_id) read shape)
    - src/lib/domain/types.ts
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§Domain Layer Shape function list; Pitfall 2)
  </read_first>
  <behavior>
    - `listKbByAgent(ctx, agentId)` returns all KB rows for (workspace_id, agent_id), excluding the embedding vector from the payload (large; not needed in list UI) — select explicit columns.
    - `getKbTopic(ctx, kbId)` returns one row by id, scoped by workspace_id + agent_id.
    - EVERY query carries `.eq('workspace_id', ctx.workspaceId).eq('agent_id', agentId)` — the table has no RLS.
  </behavior>
  <action>
Create `src/lib/domain/agent-knowledge-base.ts`. Import `createAdminClient`, `DomainContext`/`DomainResult`, `buildContentToEmbed` + `KbContentColumns` from the serializer, `generateEmbedding` from embed.ts, and `createHash` from `node:crypto`. Define `const EDITABLE_AGENT_ID = 'somnio-sales-v4'` and an `AgentKbRow` interface for the editable + bookkeeping fields.

`listKbByAgent(ctx, agentId): Promise<DomainResult<AgentKbRow[]>>`:
```typescript
const supabase = createAdminClient()
const { data, error } = await supabase
  .from('agent_knowledge_base')
  .select('id, topic, category, keywords, scope_summary, hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar, tone_override, escalate_triggers, related_topics, body_hash, last_reviewed_at, reviewed_by, source_md_path, updated_at')
  .eq('workspace_id', ctx.workspaceId)   // MANDATORY — no RLS (Pitfall 2)
  .eq('agent_id', agentId)               // MANDATORY
  .order('category').order('topic')
```
(Do NOT select `embedding` — 1536 floats per row.)

`getKbTopic(ctx, kbId): Promise<DomainResult<AgentKbRow>>`: select the same columns `.eq('id', kbId).eq('workspace_id', ctx.workspaceId).maybeSingle()`. Return error if not found.

Reads allowed for any agent (D-04). Add a private `assertEditable(agentId)` returning a DomainResult error for non-v4 (reuse the exact message form from Plan 03).
  </action>
  <acceptance_criteria>
    - `test -f src/lib/domain/agent-knowledge-base.ts`
    - `grep -c "export async function listKbByAgent\|export async function getKbTopic" src/lib/domain/agent-knowledge-base.ts` == 2
    - EVERY `.from('agent_knowledge_base')` query is followed by both `.eq('workspace_id'` and `.eq('agent_id'` in source — verify manually + `grep -c ".eq('workspace_id', ctx.workspaceId)" src/lib/domain/agent-knowledge-base.ts` >= count of queries
    - `grep -c "select('id, topic" src/lib/domain/agent-knowledge-base.ts` >= 1 and `grep -c "embedding" ...` in the list select == 0 (embedding excluded from list payload)
    - `npx tsc --noEmit` clean for this file
  </acceptance_criteria>
  <verify>
    <automated>grep -c "export async function listKbByAgent" src/lib/domain/agent-knowledge-base.ts</automated>
  </verify>
  <done>KB reads always workspace+agent scoped (Pitfall 2); list excludes embedding.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: createKbTopic + updateKbTopic — re-embed (D-06) + versioning snapshot (D-01b)</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (lines 42-99 — hash, skip-when-unchanged, upsert payload)
    - src/lib/domain/agent-knowledge-base.ts (Task 1)
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§Synchronous Re-embed; §KB Versioning Semantics; Pitfall 5 NOT-NULL)
    - .planning/standalone/ui-agent-content-editor/PATTERNS.md (Re-embed core lines 82-92)
  </read_first>
  <behavior>
    - `createKbTopic` (D-09): rejects non-v4; rejects duplicate (topic, agent, workspace); builds contentToEmbed via serializer; calls generateEmbedding; on throw returns `{success:false}` with NO insert; on success inserts with synthetic NOT-NULL values (Pitfall 5) + body_hash + version baseline (version_num 1 snapshot of the just-created row).
    - `updateKbTopic` (D-01b + D-06 + D-10): rejects non-v4; snapshots the CURRENT row into versions (version_num = max+1) BEFORE writing; recomputes contentToEmbed + body_hash; if hash unchanged keeps embedding (skip OpenAI), else re-embeds; embed BEFORE DB write so a failure leaves the row untouched; updates editable fields incl. scope_summary + keywords.
  </behavior>
  <action>
Add to `agent-knowledge-base.ts`:

`createKbTopic(ctx, params: { agentId; topic; category; keywords: string[]; scope_summary: string|null; hechos_del_producto: string|null; posicion_del_negocio: string|null; debe_contener: string[]; nunca_decir: string[]; cuando_escalar: string[]; tone_override: string|null; escalate_triggers: string[]; related_topics: string[]; reviewedBy: string }): Promise<DomainResult<AgentKbRow>>`:
1. `const gate = assertEditable(params.agentId); if (gate) return gate`
2. Duplicate check: select id where topic+agent+workspace; if exists → error.
3. `const cols: KbContentColumns = { scope_summary, hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar }`
4. `const contentToEmbed = buildContentToEmbed(cols); const bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')`
5. `let embedding; try { embedding = await generateEmbedding(contentToEmbed) } catch (e) { return { success:false, error: 'Re-embed falló (OpenAI). Reintenta. ' + (e as Error).message } }` — NO write happened.
6. INSERT row with synthetic NOT-NULL values (Pitfall 5): `source_md_path: 'ui://somnio-v4/' + params.topic`, `last_reviewed_at`: today in America/Bogota (`new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })` → YYYY-MM-DD), `reviewed_by: params.reviewedBy`, plus all editable fields + embedding + body_hash + `canonical_response: null`. Scope insert with workspace_id=ctx.workspaceId, agent_id=params.agentId.
7. Snapshot version baseline: INSERT into agent_knowledge_base_versions with version_num=1 + the inserted row's editable fields + edited_by=params.reviewedBy.
8. Return inserted row.

`updateKbTopic(ctx, params: { kbId; agentId; ...same editable fields...; reviewedBy: string }): Promise<DomainResult<AgentKbRow>>`:
1. gate via assertEditable.
2. Load current row (getKbTopic). If missing → error.
3. Snapshot CURRENT row into versions: `version_num = (SELECT max(version_num) FROM ... WHERE kb_id) + 1`, copy current editable fields + body_hash + edited_by=params.reviewedBy. (Do this BEFORE the row is overwritten — D-01b.)
4. Build contentToEmbed + bodyHash from the NEW values. If `bodyHash === current.body_hash` keep current embedding (skip OpenAI, mirror sync.ts:58). Else `embedding = await generateEmbedding(...)` inside try/catch — on throw return error with NO update (D-06; note: the version snapshot already inserted is acceptable — it records the pre-edit state and is reversible; document this).
5. UPDATE the row by `.eq('id', kbId).eq('workspace_id', ctx.workspaceId).eq('agent_id', params.agentId)` with new editable fields + embedding + body_hash + updated_at.
6. Return updated row.
  </action>
  <acceptance_criteria>
    - `grep -c "export async function createKbTopic\|export async function updateKbTopic" src/lib/domain/agent-knowledge-base.ts` == 2
    - `grep -c "buildContentToEmbed" src/lib/domain/agent-knowledge-base.ts` >= 2 (create + update)
    - `grep -c "ui://somnio-v4/" src/lib/domain/agent-knowledge-base.ts` >= 1 (synthetic source_md_path, Pitfall 5)
    - `grep -c "America/Bogota" src/lib/domain/agent-knowledge-base.ts` >= 1 (last_reviewed_at, Regla 2)
    - `grep -c "agent_knowledge_base_versions" src/lib/domain/agent-knowledge-base.ts` >= 2 (snapshot inserts)
    - embed-before-write: generateEmbedding is `await`ed and wrapped in try/catch returning before any insert/update — verify via test in Task 4
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "buildContentToEmbed" src/lib/domain/agent-knowledge-base.ts && grep -c "agent_knowledge_base_versions" src/lib/domain/agent-knowledge-base.ts</automated>
  </verify>
  <done>create/update re-embed synchronously, snapshot versions, supply NOT-NULL synthetics, v4-gated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: deleteKbTopic + listKbVersions + searchKbVersions + restoreKbVersion</name>
  <read_first>
    - src/lib/domain/agent-knowledge-base.ts (Tasks 1-2)
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§KB Versioning Semantics — restore re-embeds + snapshots pre-restore)
  </read_first>
  <behavior>
    - `deleteKbTopic` rejects non-v4; deletes the row (versions cascade via FK).
    - `listKbVersions(ctx, kbId)` returns versions ordered version_num DESC, workspace+agent scoped.
    - `searchKbVersions(ctx, { agentId, topic })` returns versions matching topic ILIKE, scoped.
    - `restoreKbVersion(ctx, { kbId, versionId, agentId, reviewedBy })`: snapshots current (as a new version), copies the chosen version's editable fields back onto the live row, re-embeds via the canonical serializer (D-01b restore + D-06 coupling), updates body_hash. v4-gated.
  </behavior>
  <action>
Add to `agent-knowledge-base.ts`:
- `deleteKbTopic(ctx, { kbId, agentId })`: gate; DELETE `.eq('id', kbId).eq('workspace_id', ctx.workspaceId).eq('agent_id', agentId)`.
- `listKbVersions(ctx, kbId): Promise<DomainResult<KbVersionRow[]>>`: select from agent_knowledge_base_versions `.eq('kb_id', kbId).eq('workspace_id', ctx.workspaceId).order('version_num', { ascending: false })`.
- `searchKbVersions(ctx, { agentId, topic }): Promise<DomainResult<KbVersionRow[]>>`: select `.eq('workspace_id', ctx.workspaceId).eq('agent_id', agentId).ilike('topic', '%'+topic+'%').order('created_at', { ascending: false })`.
- `restoreKbVersion(ctx, { kbId, versionId, agentId, reviewedBy }): Promise<DomainResult<AgentKbRow>>`:
  1. gate via assertEditable.
  2. Load the version row by versionId (scoped); load current live row.
  3. Snapshot CURRENT live row as a new version (version_num=max+1, edited_by=reviewedBy) — so restore is itself reversible.
  4. Build contentToEmbed from the version's editable fields; bodyHash; `embedding = await generateEmbedding(...)` in try/catch (error → no write, version snapshot from step 3 is acceptable/reversible).
  5. UPDATE the live row with the version's editable fields + new embedding + body_hash + updated_at, scoped by id+workspace+agent.
  6. Return updated row.
  </action>
  <acceptance_criteria>
    - `grep -c "export async function deleteKbTopic\|export async function listKbVersions\|export async function searchKbVersions\|export async function restoreKbVersion" src/lib/domain/agent-knowledge-base.ts` == 4
    - `restoreKbVersion` re-embeds: `buildContentToEmbed` count now >= 3 (create + update + restore)
    - all four functions carry workspace+agent scoping in their queries (manual review + test)
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "export async function restoreKbVersion" src/lib/domain/agent-knowledge-base.ts && grep -c "buildContentToEmbed" src/lib/domain/agent-knowledge-base.ts</automated>
  </verify>
  <done>delete + version list/search/restore implemented; restore re-embeds; all v4-gated + scoped.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Convert Plan 01 stub to GREEN KB domain tests (D-09/D-06/D-01b/D-10/D-02/Pitfall 2)</name>
  <read_first>
    - src/lib/domain/__tests__/agent-knowledge-base.test.ts (Plan 01 it.todo stub)
    - src/lib/domain/__tests__/resolve-or-create-contact.test.ts (S-4 mock harness)
    - src/lib/domain/agent-knowledge-base.ts (Tasks 1-3)
  </read_first>
  <action>
Rewrite `agent-knowledge-base.test.ts`. Mock `@/lib/supabase/admin` (createAdminClient chainable builder) AND `@/lib/agents/somnio-v4/knowledge-base/embed` (`generateEmbedding`). Real assertions (no it.todo):
- D-09: `createKbTopic(ctx, { agentId:'somnio-sales-v4', topic:'nuevo', ... })` with generateEmbedding mocked to resolve `[0.1,...]` → insert builder called with an `embedding` field + `body_hash` + `source_md_path` starting `ui://somnio-v4/`; `success===true`.
- D-06: generateEmbedding mocked to throw → `createKbTopic` returns `success===false` AND the insert builder was NEVER called (no partial write). Same for `updateKbTopic`.
- D-01b: call `updateKbTopic` twice → assert agent_knowledge_base_versions insert was called each time with incrementing version_num (mock max-version query to return 1 then 2).
- D-01b restore: `restoreKbVersion` → assert (a) a version snapshot insert of current state, (b) generateEmbedding called, (c) live-row update with the version's fields.
- D-10: changing `scope_summary` in updateKbTopic params (different from current) → body_hash differs → generateEmbedding IS called. Unchanged content → generateEmbedding NOT called (hash-skip).
- D-02: `updateKbTopic(ctx, { agentId:'godentist', ... })` → `success===false`, no DB write.
- Pitfall 2: assert `listKbByAgent` query chain includes `.eq('workspace_id', ...)` AND `.eq('agent_id', ...)` (inspect recorded calls).
  </action>
  <acceptance_criteria>
    - `npx vitest run src/lib/domain/__tests__/agent-knowledge-base.test.ts` passes with >= 7 real assertions
    - `grep -c "it.todo" src/lib/domain/__tests__/agent-knowledge-base.test.ts` == 0
    - Test mocks `generateEmbedding`: `grep -c "generateEmbedding" src/lib/domain/__tests__/agent-knowledge-base.test.ts` >= 2
    - D-06 no-partial-write asserted (insert/update NOT called on embed throw)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/domain/__tests__/agent-knowledge-base.test.ts</automated>
  </verify>
  <done>KB domain tests GREEN proving D-09/D-06/D-01b/D-10/D-02/Pitfall 2.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| server-action → domain | workspaceId trusted from caller; domain re-scopes. |
| domain → agent_knowledge_base (NO RLS) | Domain filter is the ONLY isolation guard (Pitfall 2). |
| domain → OpenAI | Outbound embedding for KB content on save. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE04-01 | Information disclosure | Cross-workspace KB read (no RLS) | mitigate | Every query `.eq('workspace_id').eq('agent_id')`; unit-tested (Pitfall 2). |
| T-UICE04-02 | Tampering | Partial write (new text, stale embedding) on OpenAI failure | mitigate | Embed BEFORE DB write; failure returns error with no write (D-06); unit-tested. |
| T-UICE04-03 | Elevation of privilege | Editing production-agent KB | mitigate | assertEditable rejects non-v4 (D-02); unit-tested. |
| T-UICE04-04 | Repudiation | Lost edit history | mitigate | Snapshot-on-save into versions table; restore reversible (D-01b). |
| T-UICE04-05 | Tampering | Embedding form drift between migration + UI | mitigate | Both import the SAME buildContentToEmbed (Plan 01); serialize.test locks it. |
</threat_model>

<verification>
- `npx vitest run src/lib/domain/__tests__/agent-knowledge-base.test.ts` green.
- `grep -c "buildContentToEmbed" src/lib/domain/agent-knowledge-base.ts` >= 3.
- Every KB query has explicit workspace+agent filter.
</verification>

<success_criteria>
- agent-knowledge-base.ts exposes listKbByAgent, getKbTopic, createKbTopic, updateKbTopic, deleteKbTopic, listKbVersions, searchKbVersions, restoreKbVersion.
- Synchronous re-embed (D-06), versioning (D-01b), scope_summary+keywords editable (D-10), v4-gated (D-02), no-RLS guarded (Pitfall 2), NOT-NULL synthetics (Pitfall 5).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/04-SUMMARY.md`.
</output>
