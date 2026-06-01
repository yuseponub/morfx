// Wave 0 stub (Plan 01). Plan 03 implements src/lib/domain/agent-templates.ts and converts
// these it.todo → real assertions using the resolve-or-create-contact.test.ts mock harness
// (S-4: chain createAdminClient → from → select/eq/or/maybeSingle thenable builder).
//
// RED targets for the templates domain layer:
//   - D-02: only somnio-sales-v4 is mutable (production agents read-only).
//   - D-08: B-acotado — add/edit/delete/reorder WITHIN existing intents only (no new intents).
//   - Regla 3: every query filters by agent_id (and workspace where applicable);
//     createAdminClient lives ONLY inside the domain file.
//
// These are it.todo until src/lib/domain/agent-templates.ts exists (Plan 03). Do NOT import
// the not-yet-existing module here — that would break the Wave 0 suite. Un-skip in Plan 03.

import { describe, it } from 'vitest'

describe('agent-templates domain (Wave 0 stub — implemented in Plan 03)', () => {
  it.todo('D-02: updateTemplateContent rejects agent_id !== somnio-sales-v4')
  it.todo('D-02: reorderTemplates rejects non-v4 agent')
  it.todo('D-08: addTemplate into an unknown intent returns error')
  it.todo('D-08: addTemplate into an existing intent succeeds')
  it.todo('Regla 3: every query filters by agent_id (and workspace where applicable)')
})
