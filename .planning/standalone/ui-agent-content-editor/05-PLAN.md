---
phase: ui-agent-content-editor
plan: 05
type: execute
wave: 3
depends_on: [03, 04]
files_modified:
  - src/app/actions/agent-content-editor.ts
  - scripts/knowledge-sync.ts
  - scripts/__tests__/knowledge-sync-guard.test.ts
  - src/inngest/functions/knowledge-sync-v4.ts
autonomous: true
requirements: [D-01, D-02, D-06, D-07, D-08, D-09, D-10]

must_haves:
  truths:
    - "Every mutating server action validates auth (supabase.auth.getUser) + admin role (isWorkspaceAdmin) before delegating to domain (D-07)"
    - "Server actions contain ZERO createAdminClient — all DB access via domain (Regla 3)"
    - "Server action inputs validated with zod before domain delegation (V5)"
    - "pnpm knowledge:sync aborts when agent_knowledge_base has somnio-sales-v4 rows unless --force (D-01 / Pitfall 4)"
    - "knowledge-sync-v4 Inngest function remains flag-gated on platform_config.somnio_v4_kb_sync_enabled with a D-01 guard comment"
  artifacts:
    - path: "src/app/actions/agent-content-editor.ts"
      provides: "Server actions for templates + KB CRUD/versioning, admin-gated, zod-validated"
      contains: "isWorkspaceAdmin"
    - path: "scripts/knowledge-sync.ts"
      provides: "Guarded manual sync (refuses to clobber DB unless --force)"
      contains: "--force"
  key_links:
    - from: "src/app/actions/agent-content-editor.ts"
      to: "src/lib/domain/agent-templates.ts + agent-knowledge-base.ts"
      via: "domain delegation only (no createAdminClient)"
      pattern: "from '@/lib/domain/agent-"
---

<objective>
Create the server-action layer (admin-gated, zod-validated, domain-only — Regla 3) that the UI calls, and protect the `knowledge:sync` paths so they cannot silently revert UI edits (D-01 / Pitfall 4).

Purpose: D-07 restricts edits to workspace admins (owner/admin). Regla 3 forbids createAdminClient outside domain — the actions delegate to Plans 03/04. D-01 makes the DB the KB source of truth; `scripts/knowledge-sync.ts` is currently UNGUARDED and would overwrite DB content with stale `.md` on the next run — that must be blocked.

Output: `src/app/actions/agent-content-editor.ts`, a guarded `scripts/knowledge-sync.ts`, a D-01 guard comment on the Inngest function, and the green sync-guard test.
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
Admin gate (src/app/actions/agent-config.ts:22-55):
```typescript
async function getAuthContext() { /* supabase.auth.getUser() + morfx_workspace cookie → { user, workspaceId, supabase } | null */ }
async function isWorkspaceAdmin(supabase, workspaceId, userId): Promise<boolean> {
  const { data } = await supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).single()
  return data?.role === 'owner' || data?.role === 'admin'
}
```

Domain functions to delegate to:
- Plan 03 agent-templates.ts: listTemplatesByAgent, listIntents, updateTemplateContent, addTemplate, deleteTemplate, reorderTemplates.
- Plan 04 agent-knowledge-base.ts: listKbByAgent, getKbTopic, createKbTopic, updateKbTopic, deleteKbTopic, listKbVersions, searchKbVersions, restoreKbVersion.

DomainContext: { workspaceId, source: 'server-action', actorLabel: 'user:'+userId }.

Current sync guard analog (knowledge-sync-v4.ts:57-83): reads platform_config.somnio_v4_kb_sync_enabled, no-op when off.
Current danger (scripts/knowledge-sync.ts:30-54): NO flag, unconditional sync.
From config: SOMNIO_V4_AGENT_ID='somnio-sales-v4', SOMNIO_WORKSPACE_ID='a3843b3f-...'.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server actions — templates (read + mutate), admin-gated, zod, domain-only</name>
  <read_first>
    - src/app/actions/agent-config.ts (lines 1-55, 125-135 — getAuthContext + isWorkspaceAdmin + admin-reject pattern)
    - src/app/(dashboard)/agentes/crm-tools/_actions.ts (zod safeParse + getActiveWorkspaceId + revalidatePath, zero createAdminClient)
    - src/lib/domain/agent-templates.ts (Plan 03 signatures)
  </read_first>
  <action>
Create `src/app/actions/agent-content-editor.ts` with `'use server'`. Copy the `getAuthContext` + `isWorkspaceAdmin` helpers from agent-config.ts (or import if exported; they are module-private there, so re-declare them locally — same code). Define zod schemas for each input.

Read actions (any member — no admin gate, but require auth + workspace):
- `getTemplatesAction(agentId: string)` → ctx via getAuthContext (null → `{ error:'No autenticado' }`); delegate `listTemplatesByAgent({ workspaceId: ctx.workspaceId, source:'server-action' }, agentId)`.
- `getIntentsAction(agentId: string)` → `listIntents(...)`.

Mutating actions (admin only — every one: `if (!await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)) return { error:'Solo el propietario o administrador puede editar el contenido del agente.' }`):
- `updateTemplateAction(input)` — zod: `{ id: z.string().uuid(), agentId: z.string(), content: z.string(), content_type: z.enum(['texto','template','imagen']), delay_s: z.number().int().min(0), priority: z.enum(['CORE','COMPLEMENTARIA','OPCIONAL']), minifrase: z.string().nullable() }` → delegate updateTemplateContent → `revalidatePath('/agentes/content-editor')`.
- `addTemplateAction(input)` — zod incl intent + visit_type enum + orden → delegate addTemplate.
- `deleteTemplateAction(input: { id, agentId })` → delegate deleteTemplate.
- `reorderTemplatesAction(input: { agentId, intent, visit_type, orderedIds: string[] })` → delegate reorderTemplates.

All actions return `{ success, data?, error? }`. NO `createAdminClient` import. Pass `actorLabel: 'user:'+ctx.user.id` in the DomainContext.
  </action>
  <acceptance_criteria>
    - `test -f src/app/actions/agent-content-editor.ts` and first line is `'use server'`
    - `grep -c "isWorkspaceAdmin" src/app/actions/agent-content-editor.ts` >= 5 (one per mutating action)
    - `grep -c "createAdminClient" src/app/actions/agent-content-editor.ts` == 0 (Regla 3)
    - `grep -c "from '@/lib/domain/agent-templates'" src/app/actions/agent-content-editor.ts` >= 1
    - `grep -c "z.object\|safeParse" src/app/actions/agent-content-editor.ts` >= 4 (zod on mutating inputs, V5)
    - `grep -c "revalidatePath" src/app/actions/agent-content-editor.ts` >= 4
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "createAdminClient" src/app/actions/agent-content-editor.ts; grep -c "isWorkspaceAdmin" src/app/actions/agent-content-editor.ts</automated>
  </verify>
  <done>Template server actions admin-gated, zod-validated, domain-only.</done>
</task>

<task type="auto">
  <name>Task 2: Server actions — KB CRUD + versioning, admin-gated</name>
  <read_first>
    - src/app/actions/agent-content-editor.ts (Task 1 helpers)
    - src/lib/domain/agent-knowledge-base.ts (Plan 04 signatures)
  </read_first>
  <action>
Add KB actions to `src/app/actions/agent-content-editor.ts`. Reads (member): `getKbListAction(agentId)`, `getKbTopicAction(kbId)`, `listKbVersionsAction(kbId)`, `searchKbVersionsAction({ agentId, topic })`. Mutating (admin only): `createKbTopicAction(input)`, `updateKbTopicAction(input)`, `deleteKbTopicAction({ kbId, agentId })`, `restoreKbVersionAction({ kbId, versionId, agentId })`.

For create/update, the zod schema covers: `topic, category (enum product/policies/edge-cases/faqs-no-templated), keywords: z.array(z.string()), scope_summary: z.string().nullable(), hechos_del_producto: z.string().nullable(), posicion_del_negocio: z.string().nullable(), debe_contener: z.array(z.string()), nunca_decir: z.array(z.string()), cuando_escalar: z.array(z.string()), tone_override: z.string().nullable(), escalate_triggers: z.array(z.string()), related_topics: z.array(z.string())`. Pass `reviewedBy: 'user:'+ctx.user.id` to the domain create/update/restore. Delegate to the domain; revalidatePath('/agentes/content-editor'). Surface domain `{success:false,error}` (incl. the D-06 OpenAI-failure error) to the caller verbatim so the UI can show "reintenta".
  </action>
  <acceptance_criteria>
    - `grep -c "export async function createKbTopicAction\|export async function updateKbTopicAction\|export async function deleteKbTopicAction\|export async function restoreKbVersionAction" src/app/actions/agent-content-editor.ts` == 4
    - `grep -c "from '@/lib/domain/agent-knowledge-base'" src/app/actions/agent-content-editor.ts` >= 1
    - `grep -c "createAdminClient" src/app/actions/agent-content-editor.ts` still == 0
    - KB mutating actions admin-gated: `grep -c "isWorkspaceAdmin" src/app/actions/agent-content-editor.ts` >= 9 (5 template + 4 KB mutating)
    - `grep -c "reviewedBy" src/app/actions/agent-content-editor.ts` >= 1
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "export async function restoreKbVersionAction" src/app/actions/agent-content-editor.ts; grep -c "createAdminClient" src/app/actions/agent-content-editor.ts</automated>
  </verify>
  <done>KB server actions admin-gated, zod-validated, domain-only; D-06 error surfaced.</done>
</task>

<task type="auto">
  <name>Task 3: Guard scripts/knowledge-sync.ts (D-01 / Pitfall 4) + Inngest guard comment</name>
  <read_first>
    - scripts/knowledge-sync.ts (current unguarded main, lines 30-54)
    - src/inngest/functions/knowledge-sync-v4.ts (lines 57-83 — flag-gate pattern + the platform_config key)
    - scripts/__tests__/knowledge-sync-guard.test.ts (Plan 01 stub)
    - src/lib/agents/somnio-v4/config.ts (SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID)
  </read_first>
  <action>
Modify `scripts/knowledge-sync.ts`:
- Parse `const force = process.argv.includes('--force') || process.argv.includes('--seed')`.
- BEFORE walking the `.md`: query the DB for existing v4 rows via a small inline `createAdminClient()` (allowed — this is a `scripts/` CLI, same exception class as the rest of this file): `SELECT count(*) FROM agent_knowledge_base WHERE agent_id='somnio-sales-v4' AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'` (use the imported config constants).
- If count > 0 AND NOT force: print a LOUD multi-line warning explaining D-01 (the DB is the source of truth; running this would overwrite UI edits with stale `.md`; pass `--force` only for an intentional re-seed) and `process.exit(1)` WITHOUT syncing.
- If count === 0 OR force: proceed with the existing sync loop. When force is used with non-empty DB, print "[knowledge:sync] --force: overwriting DB from .md (D-01 override)".
- Keep the existing per-file sync behavior unchanged otherwise.

Modify `src/inngest/functions/knowledge-sync-v4.ts`: add a prominent comment block above the flag check documenting D-01 — "FLIPPING somnio_v4_kb_sync_enabled ON will OVERWRITE UI edits with stale .md (standalone ui-agent-content-editor, D-01). Keep FALSE in prod once the UI is live." Do NOT change the gating logic (it already no-ops when off); only add the comment. Verify the flag key is `somnio_v4_kb_sync_enabled`.
  </action>
  <acceptance_criteria>
    - `grep -c "\-\-force" scripts/knowledge-sync.ts` >= 1 and `grep -c "process.exit(1)" scripts/knowledge-sync.ts` >= 1
    - `grep -ci "D-01\|source of truth\|fuente de verdad" scripts/knowledge-sync.ts` >= 1 (loud warning)
    - `grep -c "agent_id" scripts/knowledge-sync.ts` >= 1 (count query scoped to somnio-sales-v4)
    - `grep -ci "D-01\|OVERWRITE\|sobrescrib" src/inngest/functions/knowledge-sync-v4.ts` >= 1 (guard comment added)
    - `grep -c "somnio_v4_kb_sync_enabled" src/inngest/functions/knowledge-sync-v4.ts` >= 1 (flag intact)
  </acceptance_criteria>
  <verify>
    <automated>grep -c "\-\-force" scripts/knowledge-sync.ts && grep -ci "fuente de verdad\|source of truth" scripts/knowledge-sync.ts</automated>
  </verify>
  <done>knowledge:sync refuses to clobber a non-empty DB unless --force; Inngest function carries the D-01 guard comment.</done>
</task>

<task type="auto">
  <name>Task 4: Convert sync-guard stub to GREEN test (D-01 / Pitfall 4)</name>
  <read_first>
    - scripts/__tests__/knowledge-sync-guard.test.ts (Plan 01 stub)
    - scripts/knowledge-sync.ts (Task 3 guard)
  </read_first>
  <action>
Make the guard testable: extract the decision into a pure exported helper in `scripts/knowledge-sync.ts` (or a small co-located module it imports), e.g. `export function shouldAbortSync(existingCount: number, force: boolean): boolean { return existingCount > 0 && !force }`. Then rewrite `scripts/__tests__/knowledge-sync-guard.test.ts` to assert (no it.todo):
- `shouldAbortSync(18, false) === true` (DB non-empty, no force → abort).
- `shouldAbortSync(18, true) === false` (force → proceed).
- `shouldAbortSync(0, false) === false` (empty DB → proceed, initial seed).
If extracting the helper to a path importable without running the CLI main is awkward, place it in `scripts/knowledge-sync.ts` and guard the `main()` invocation behind `if (process.argv[1]?.endsWith('knowledge-sync.ts'))` so importing the module for the test does not execute the sync.
  </action>
  <acceptance_criteria>
    - `npx vitest run scripts/__tests__/knowledge-sync-guard.test.ts` passes (3 real assertions)
    - `grep -c "it.todo" scripts/__tests__/knowledge-sync-guard.test.ts` == 0
    - `grep -c "shouldAbortSync" scripts/knowledge-sync.ts` >= 1 (exported helper)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run scripts/__tests__/knowledge-sync-guard.test.ts</automated>
  </verify>
  <done>Sync guard logic proven by a green unit test.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| client → server action | Untrusted form input crosses here; zod + admin gate at entry. |
| server action → domain | Trusted DomainContext built from authenticated session. |
| developer → knowledge:sync CLI | Could clobber DB; guarded. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE05-01 | Elevation of privilege | Non-admin editing agent content | mitigate | isWorkspaceAdmin gate on every mutating action (D-07); grep enforces count. |
| T-UICE05-02 | Tampering | Malformed/oversized input reaching domain | mitigate | zod safeParse on every mutating action (V5); reject before delegation. |
| T-UICE05-03 | Tampering | knowledge:sync silently reverting UI edits | mitigate | shouldAbortSync guard (D-01/Pitfall 4); unit-tested; Inngest flag stays false + guard comment. |
| T-UICE05-04 | Spoofing | Action trusting client-supplied workspace/agent | mitigate | workspaceId from morfx_workspace cookie + session, never from input; domain re-scopes. |
| T-UICE05-05 | Tampering | createAdminClient leaking into app layer (Regla 3 breach) | mitigate | grep gate: 0 createAdminClient in the action file. |
</threat_model>

<verification>
- `npx vitest run scripts/__tests__/knowledge-sync-guard.test.ts` green.
- `grep -c "createAdminClient" src/app/actions/agent-content-editor.ts` == 0.
- `grep -c "isWorkspaceAdmin" src/app/actions/agent-content-editor.ts` >= 9.
- `grep -c "\-\-force" scripts/knowledge-sync.ts` >= 1.
</verification>

<success_criteria>
- Server actions for templates + KB exist, admin-gated, zod-validated, domain-only (Regla 3).
- knowledge:sync guarded against clobbering UI edits (D-01); Inngest function documented.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/05-SUMMARY.md`.
</output>
