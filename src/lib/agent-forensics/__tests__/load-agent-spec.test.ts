import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}))

import { loadAgentSpec } from '../load-agent-spec'

describe('loadAgentSpec — whitelist + no cache (D-07, Pitfall 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves somnio-recompra-v1 spec content', async () => {
    mockReadFile.mockResolvedValue('# Somnio Recompra v1\n...')
    const content = await loadAgentSpec('somnio-recompra-v1')
    expect(content).toBe('# Somnio Recompra v1\n...')
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('src/lib/agent-specs/somnio-recompra-v1.md'),
      'utf-8',
    )
  })

  it('resolves somnio-sales-v3 spec content', async () => {
    mockReadFile.mockResolvedValue('# Somnio Sales v3\n...')
    const content = await loadAgentSpec('somnio-sales-v3')
    expect(content).toBe('# Somnio Sales v3\n...')
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('src/lib/agent-specs/somnio-sales-v3.md'),
      'utf-8',
    )
  })

  it('resolves godentist spec content', async () => {
    mockReadFile.mockResolvedValue('# GoDentist\n...')
    const content = await loadAgentSpec('godentist')
    expect(content).toBe('# GoDentist\n...')
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('src/lib/agent-specs/godentist.md'),
      'utf-8',
    )
  })

  it('throws for unknown agent ID', async () => {
    await expect(loadAgentSpec('unknown-bot')).rejects.toThrow(
      /Unknown agent spec.*unknown-bot/,
    )
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('has no module-scope cache (Pitfall 3 — Vercel cold-start friendly)', async () => {
    mockReadFile.mockResolvedValue('content')
    await loadAgentSpec('godentist')
    await loadAgentSpec('godentist')
    expect(mockReadFile).toHaveBeenCalledTimes(2)
  })
})
