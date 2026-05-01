import { describe, it, expect } from 'vitest'
import { coherenceCheck } from '../coherence-check'

describe('coherenceCheck', () => {
  it('passes when folder matches category', () => {
    expect(() =>
      coherenceCheck('src/lib/agents/somnio-v4/knowledge/product/x.md', 'product')
    ).not.toThrow()
  })

  it('throws when folder does not match category', () => {
    expect(() =>
      coherenceCheck('src/lib/agents/somnio-v4/knowledge/policies/x.md', 'product')
    ).toThrow(/Coherence fail/)
  })

  it('handles backslash paths (Windows) same as forward-slash', () => {
    expect(() =>
      coherenceCheck('src\\lib\\agents\\somnio-v4\\knowledge\\product\\x.md', 'product')
    ).not.toThrow()
  })
})
