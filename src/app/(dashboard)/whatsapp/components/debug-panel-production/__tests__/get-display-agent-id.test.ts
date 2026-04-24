import { describe, it, expect } from 'vitest'
import { getDisplayAgentId } from '../get-display-agent-id'

describe('getDisplayAgentId — bug visual resuelto D-10/D-12', () => {
  it('uses agentId when respondingAgentId is null (non-routed turn)', () => {
    expect(getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: null })).toBe('somnio-v3')
  })

  it('uses respondingAgentId when different (client recompra turn — BUG FIXED)', () => {
    expect(
      getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: 'somnio-recompra-v1' }),
    ).toBe('somnio-recompra-v1')
  })

  it('returns same value when entry==responding (godentist, no routing)', () => {
    expect(getDisplayAgentId({ agentId: 'godentist', respondingAgentId: 'godentist' })).toBe('godentist')
  })

  it('falls back to agentId when respondingAgentId is undefined (robust to optional field)', () => {
    expect(getDisplayAgentId({ agentId: 'somnio-v3' })).toBe('somnio-v3')
  })
})
