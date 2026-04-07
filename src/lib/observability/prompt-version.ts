/**
 * Prompt version hashing + batch upsert against `agent_prompt_versions`.
 *
 * The production observability module deduplicates the (often huge) system
 * prompts of each agent into a separate table so a single turn row only
 * carries a foreign key to the prompt content. This file owns:
 *
 *   - `hashPrompt(systemPrompt, model, params)` — deterministic SHA-256
 *     hash used both as the dedup key in `agent_prompt_versions` and as
 *     the in-memory `promptHash` field on `ObservabilityAiCall`.
 *
 *   - `resolvePromptVersions(supabase, prompts)` — batch upsert helper
 *     that returns a `Map<promptHash, id>`. Used by `flush()` in Plan 07.
 *
 * Determinism rules (Pitfall 4 of 42.1-RESEARCH.md):
 *
 *   1. The system prompt is normalized before hashing: `.trim()` then
 *      collapse runs of whitespace into a single space. This means a
 *      cosmetic re-indent of the same prompt does NOT generate a new
 *      version row.
 *   2. The hashed payload uses a FIXED key order `{p, m, t, x}` so the
 *      same params object — regardless of the caller's key order — maps
 *      to the same hash. JSON.stringify alone is not enough because
 *      callers can construct the params object in any order.
 *   3. Missing optional params hash as `null`, never `undefined`. The
 *      JSON encoder elides `undefined`, which would silently produce a
 *      different hash for `{temperature: 0.5}` vs
 *      `{temperature: 0.5, maxTokens: undefined}`.
 *
 * NOTE: this module has zero runtime imports from other observability
 * files (only a `type` import from `@supabase/supabase-js`). It is a
 * leaf so the collector and the fetch wrapper can both depend on it
 * without creating a cycle.
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface HashPromptParams {
  temperature?: number
  maxTokens?: number
}

/**
 * SHA-256 hash of the (normalized prompt, model, params) tuple.
 *
 * Stable across:
 *   - Param key order (`{t, x}` === `{x, t}`)
 *   - Cosmetic whitespace differences in the prompt body
 *
 * NOT stable across:
 *   - Different model ids (a prompt version is per-model by design)
 *   - Different temperature / maxTokens values
 */
export function hashPrompt(
  systemPrompt: string,
  model: string,
  params: HashPromptParams,
): string {
  const normalized = JSON.stringify({
    p: systemPrompt.trim().replace(/\s+/g, ' '),
    m: model,
    t: params.temperature ?? null,
    x: params.maxTokens ?? null,
  })
  return createHash('sha256').update(normalized).digest('hex')
}

export interface PromptVersionInput {
  systemPrompt: string
  model: string
  temperature?: number
  maxTokens?: number
  provider: string
}

/**
 * Batch upsert prompt versions and return a `Map<promptHash, id>`.
 *
 * Uses `INSERT ... ON CONFLICT (prompt_hash) DO UPDATE` (via supabase-js
 * `.upsert(rows, { onConflict, ignoreDuplicates: false })`) so that the
 * returning row set contains BOTH freshly inserted and pre-existing
 * rows. Plan 07 wires this into `ObservabilityCollector.flush()`.
 *
 * The caller is expected to pass a `createRawAdminClient()` instance so
 * the call does not recurse through the instrumented admin wrapper.
 *
 * Fallback note: if a future supabase-js release stops returning
 * conflicted rows from `.select()` we will switch to a follow-up
 * `SELECT id, prompt_hash WHERE prompt_hash IN (...)`. Plan 07 owns
 * that decision based on real driver behaviour.
 */
export async function resolvePromptVersions(
  supabase: SupabaseClient,
  prompts: Map<string, PromptVersionInput>,
): Promise<Map<string, string>> {
  if (prompts.size === 0) return new Map()

  const rows = Array.from(prompts.entries()).map(([hash, p]) => ({
    prompt_hash: hash,
    system_prompt: p.systemPrompt,
    model: p.model,
    temperature: p.temperature ?? null,
    max_tokens: p.maxTokens ?? null,
    provider: p.provider,
  }))

  const { data, error } = await supabase
    .from('agent_prompt_versions')
    .upsert(rows, { onConflict: 'prompt_hash', ignoreDuplicates: false })
    .select('id, prompt_hash')

  if (error) throw error

  const result = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ id: string; prompt_hash: string }>) {
    result.set(row.prompt_hash, row.id)
  }
  return result
}
