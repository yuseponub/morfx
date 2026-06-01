// GREEN test (Plan 05) for the knowledge:sync guard (D-01 / Pitfall 4).
//
// Since D-01 makes the DB the source of truth, `pnpm knowledge:sync` must NOT
// clobber UI edits with stale .md. The guard is initial-import-only: abort when
// agent_knowledge_base already has rows for somnio-sales-v4 unless --force.
//
// `shouldAbortSync` is the pure decision extracted into scripts/knowledge-sync.ts.
// Importing it does NOT run the CLI main() (guarded by process.argv[1] check).

import { describe, it, expect } from 'vitest'
import { shouldAbortSync } from '../knowledge-sync'

describe('knowledge:sync guard (D-01 / Pitfall 4)', () => {
  it('aborts when agent_knowledge_base has rows for somnio-sales-v4 and --force absent', () => {
    expect(shouldAbortSync(18, false)).toBe(true)
  })

  it('proceeds when --force passed (intentional re-seed)', () => {
    expect(shouldAbortSync(18, true)).toBe(false)
  })

  it('proceeds when DB empty (initial import)', () => {
    expect(shouldAbortSync(0, false)).toBe(false)
  })
})
