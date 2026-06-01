// Wave 0 stub (Plan 01). Plan 04 implements src/lib/domain/agent-knowledge-base.ts and
// converts these it.todo → real assertions using the resolve-or-create-contact.test.ts mock
// harness (S-4) + a mocked generateEmbedding (vi.mock the embed module).
//
// RED targets for the KB domain layer:
//   - D-09: createKbTopic embeds (buildContentToEmbed) then inserts the row.
//   - D-06: synchronous re-embed; OpenAI throw → NO DB write (embed BEFORE write, D-06 line 58).
//   - D-01b: versioning — each save snapshots the prior version; restore re-embeds.
//   - D-10: editing scope_summary changes body_hash → triggers re-embed (scope is prepended).
//   - D-02: KB mutations reject agent_id !== somnio-sales-v4 (Regla 6).
//   - Pitfall 2: agent_knowledge_base has NO RLS → every query MUST .eq(workspace_id).eq(agent_id).
//
// These are it.todo until src/lib/domain/agent-knowledge-base.ts exists (Plan 04). Do NOT
// import the not-yet-existing module here. Un-skip + wire mocks in Plan 04.

import { describe, it } from 'vitest'

describe('agent-knowledge-base domain (Wave 0 stub — implemented in Plan 04)', () => {
  it.todo('D-09: createKbTopic calls generateEmbedding then inserts row with embedding + body_hash')
  it.todo('D-06: generateEmbedding throw → no DB write (row untouched, returns success:false)')
  it.todo('D-01b: two updateKbTopic calls produce two version rows (version_num 1,2)')
  it.todo('D-01b: restoreKbVersion snapshots current then copies version fields then re-embeds')
  it.todo('D-10: editing scope_summary changes body_hash and triggers re-embed')
  it.todo('D-02: KB mutations reject agent_id !== somnio-sales-v4')
  it.todo('Pitfall 2: every KB query filters .eq(workspace_id).eq(agent_id)')
})
