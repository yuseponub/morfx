// Wave 0 stub (Plan 01). Plan 05 adds the guard to scripts/knowledge-sync.ts and converts
// these it.todo → real assertions.
//
// RED targets for the knowledge:sync guard (D-01 / Pitfall 4):
//   Since D-01 makes the DB the source of truth, `pnpm knowledge:sync` (today UNGUARDED at
//   scripts/knowledge-sync.ts:30-54) must NOT clobber UI edits with stale .md. Plan 05 makes
//   it initial-import-only: abort when agent_knowledge_base already has rows for
//   somnio-sales-v4 unless --force is passed (loud D-01 warning). The Inngest function
//   (knowledge-sync-v4.ts) stays flag-`false` by default.
//
// These are it.todo until the guard exists (Plan 05). Un-skip + wire the count-rows mock in
// Plan 05.

import { describe, it } from 'vitest'

describe('knowledge:sync guard (Wave 0 stub — implemented in Plan 05)', () => {
  it.todo('D-01/Pitfall 4: sync aborts when agent_knowledge_base has rows for somnio-sales-v4 and --force absent')
  it.todo('D-01: sync proceeds when --force passed')
})
