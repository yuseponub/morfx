/**
 * Ajv-compiled validator for rule-v1.schema.json.
 * Phase: agent-lifecycle-router (standalone) — Plan 02 Task 1.
 *
 * Used by:
 *   - src/lib/domain/routing.ts (write-time validation in upsertRule — Plan 02 Task 2)
 *   - src/lib/agents/routing/cache.ts (on-load validation per Pitfall 5 — Plan 03)
 *
 * Schema source: src/lib/agents/routing/schema/rule-v1.schema.json (created in Plan 01)
 * Pitfall 2 mitigation: schema's leafCondition has `additionalProperties:false` →
 * rejects `path` field (jsonpath-plus CVE-2025-1302 RCE surface).
 */

// Use Ajv2020 because rule-v1.schema.json declares
// $schema: "https://json-schema.org/draft/2020-12/schema". The default
// `import Ajv from 'ajv'` only knows draft-07 and would throw
// "no schema with key or ref ...draft/2020-12/schema" at compile time.
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import ruleV1Schema from './rule-v1.schema.json'

// Compiled at module import (not lazy) so first call is hot.
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

const validateV1 = ajv.compile(ruleV1Schema as object)

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] }

/**
 * Validates a routing rule against rule-v1.schema.json.
 * Returns ok:true if valid, ok:false with human-readable errors otherwise.
 */
export function validateRule(rule: unknown): ValidationResult {
  const valid = validateV1(rule)
  if (valid) return { ok: true }
  const errors = (validateV1.errors ?? []).map((e) => {
    const path = e.instancePath || '<root>'
    return `${path} ${e.message ?? 'invalid'} ${JSON.stringify(e.params ?? {})}`
  })
  return { ok: false, errors }
}

/**
 * Re-compile schema. Only useful for tests that mutate the schema or for hot-reload.
 * Returns a fresh validator function.
 */
export function compileSchema() {
  return ajv.compile(ruleV1Schema as object)
}
