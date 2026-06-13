# v4-gate-confidence-fixes — Research

**Researched:** 2026-06-13
**Domain:** somnio-sales-v4 — CRM gate trigger logic, comprehension observability, sub-loop threshold parametrization
**Confidence:** HIGH — all claims verified against live source files in this session

---

## Summary

Three additive fixes to `somnio-sales-v4` (DORMANT in prod), diagnosed using the observability shipped in `v4-observability-completeness`. All code was read in full; every line number below was verified against the live files. No new dependencies required. Regla 6 holds: zero behavior change for v3/godentist/recompra/pw-confirmation.

**Fix #1 (gate door):** Replace trigger `(b) newFields ∩ SHIPPING_FIELDS` in `crmGateFired` with `changes.datosCriticosJustCompleted`. The signal is already present in `RunCrmGateArgs.changes` and is in scope at the call site inside `runCrmGate`. The replacement is a one-line change in `crmGateFired` + one arg addition to the call site inside `runCrmGate`. Trigger (c) `category === 'datos'` is safe to keep: it covers pure-data messages that fail field extraction; it does NOT produce false positives for `category='pregunta'` (the Bucaramanga case that caused the crash).

**Fix #2 (secondary_confidence logging):** The fields `secondary_confidence`, `secondary_confidence_reasoning`, and optionally `secondary` + `secondary_query` already exist on `analysis.intent` (typed in `comprehension-schema.ts`). They are in scope at both emit sites. Each site needs 2-4 new key-value pairs added to an existing `recordEvent` call. Pure additive — no consumer parses these events positionally.

**Fix #3 (threshold to platform_config):** The constant `RESPONSE_CONFIDENCE_THRESHOLD = 0.70` at `sub-loop/index.ts:48` is consumed at exactly two sites inside `runRagSubLoop` (lines 420 and 447). Both `runSubLoop` and `runRagSubLoop` are `async` functions, so `await` is safe. The cleanest wiring is: read the threshold at the top of `runRagSubLoop` (before CALL 1) and use the local `const` for both sites — mirrors the pattern used in `somnio-v4-agent.ts:400` where `getLowConfidenceThreshold()` is awaited once per turn before it's used. New module `sub-loop/response-confidence-threshold.ts` clones `threshold.ts` exactly with key `somnio_v4_response_confidence_threshold` and default `0.70`. Tests mock `'../sub-loop'` wholesale at the agent level, so no new test mocks are needed for sub-loop internals; the sub-loop unit tests (output-schema.test.ts, sub-loop-e2e.test.ts) do not reference `RESPONSE_CONFIDENCE_THRESHOLD` and are unaffected.

**Primary recommendation:** Implement all three fixes in a single wave, in this order: Fix #2 (zero risk, pure logging), Fix #3 (new module + sub-loop wiring, additive), Fix #1 (one-line predicate change + call-site arg). Commit atomically per fix.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Gate door (Fix #1.a):** Replace trigger `(b) newFields ∩ SHIPPING_FIELDS` with `changes.datosCriticosJustCompleted`. Keep triggers (a) and (c). `changes.datosCriticosJustCompleted` is already in scope inside `runCrmGate` via `args.changes`.

**D-02 — secondary_confidence logging (Fix #2):** Add `secondary_confidence` + `secondary_confidence_reasoning` (+ optionally `secondary` + `secondary_query`) to the payload of two events:
- `comprehension_completed` (`comprehension.ts` emit site)
- `comprehension_completed_v4` (`somnio-v4-agent.ts` emit site)

**D-03 — RESPONSE_CONFIDENCE_THRESHOLD to platform_config (Fix #3):** Move hardcoded `0.70` to `platform_config` key `somnio_v4_response_confidence_threshold`, default `0.70`. Clone `threshold.ts` pattern (cache 60s + fallback). Consumer in `sub-loop/index.ts`.

### Claude's Discretion
- Exact key name for platform_config (suggested: `somnio_v4_response_confidence_threshold`).
- Whether `comprehension_completed_v4` also adds `secondary` + `secondary_query` (beyond confidence + reasoning).
- How the async threshold is wired in `sub-loop/index.ts` (hoist-once at top of `runRagSubLoop` vs inline before check — research recommends hoist-once, see Fix #3 section).
- Whether trigger (c) `category==='datos'` stays as-is or gets an additional guard (research confirms: keep as-is, no false positive risk from trigger (c) alone).

### Deferred (OUT OF SCOPE)
- Blindaje del crash `AI_NoObjectGeneratedError` en el sub-loop CRM (try/catch around `runCrmSubLoop` at `crm-gate.ts:358`).
- Zombie 70s (gap de 31.8s sin heartbeat post-handoff).
- KB enrichment for `interaccion_alcohol`/`interaccion_medicamentos` (the real fix for the flip).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fix #1: gate trigger predicate | API / Backend | — | Pure predicate function in `crm-gate.ts`; no DB, no external call |
| Fix #2: event payload enrichment | API / Backend | — | Additive fields in two `recordEvent` calls; no schema change needed |
| Fix #3: threshold lookup | API / Backend | Database / Storage | Module clones `threshold.ts` pattern; read-only from `platform_config` |

---

## Standard Stack

No new dependencies. Existing stack used:

| Module | Purpose | Note |
|--------|---------|------|
| `src/lib/agents/somnio-v4/threshold.ts` | Pattern to clone for Fix #3 | Read fully; verified |
| `src/lib/supabase/admin.ts` `createAdminClient` | platform_config read | Exception authorized for `platform_config` (same as threshold.ts comment block) |
| `src/lib/observability` `getCollector` | Event emit for Fix #2 | Already used at both sites |
| `src/lib/agents/somnio-v4/observability.ts` `recordV4Event` | Optional for Fix #2 (crm-gate already uses it) | `comprehension.ts` uses `getCollector()?.recordEvent` directly |

---

## Architecture Patterns

### Pattern 1: `threshold.ts` clone (Fix #3)

The full pattern, verified by reading `threshold.ts` end to end:

```typescript
// src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_THRESHOLD = 0.70  // D-03 fallback — preserves current behavior exactly
const CACHE_TTL_MS = 60_000     // 60s — tunable via SQL UPDATE without deploy

let cachedAt = 0
let cachedValue = DEFAULT_THRESHOLD

export async function getResponseConfidenceThreshold(): Promise<number> {
  const now = Date.now()
  if (now - cachedAt < CACHE_TTL_MS) return cachedValue

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', 'somnio_v4_response_confidence_threshold')
      .maybeSingle()

    if (error || !data) {
      cachedValue = DEFAULT_THRESHOLD
    } else {
      const raw = data.value as unknown
      const v = typeof raw === 'number' ? raw : Number(raw)
      cachedValue = Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_THRESHOLD
    }
    cachedAt = now
    return cachedValue
  } catch {
    cachedValue = DEFAULT_THRESHOLD
    cachedAt = now
    return cachedValue
  }
}

/** Test helper — clears cache. DO NOT use in runtime. */
export function __clearResponseConfidenceThresholdCache(): void {
  cachedAt = 0
  cachedValue = DEFAULT_THRESHOLD
}
```

`createAdminClient` is authorized here — same exception as `threshold.ts` comment: "`platform_config` es tabla utilitaria sin domain layer dedicado". [VERIFIED: threshold.ts:16-18]

### Pattern 2: threshold wiring in `sub-loop/index.ts`

The threshold is consumed at TWO sites inside `runRagSubLoop`:
- Line 420: `threshold: RESPONSE_CONFIDENCE_THRESHOLD` in the `recordV4Event('subloop_generation_completed', ...)` call
- Line 447: `if (generation.responseConfidence < RESPONSE_CONFIDENCE_THRESHOLD)`

Both sites are inside `runRagSubLoop`, which is an `async` function [VERIFIED: line 271]. The lookup goes at the top of `runRagSubLoop` before CALL 1 (tooling), where the latency is invisible (the call costs ~10-20ms cold, ~0ms cached, vs the tooling call that costs ~2-5s). This mirrors exactly how `getLowConfidenceThreshold()` is called at `somnio-v4-agent.ts:400` — awaited once, used as a local `const` throughout the rest of the function.

```typescript
// Inside runRagSubLoop, BEFORE "// CALL 1 — Tooling":
const RESPONSE_CONFIDENCE_THRESHOLD = await getResponseConfidenceThreshold()
```

The module-level `const RESPONSE_CONFIDENCE_THRESHOLD = 0.70` at line 48 is then either removed entirely, or the local `const` in `runRagSubLoop` shadows it. The cleaner option is to remove the module-level const and replace it with the import + local await.

The `runCrmMutationSubLoopRaw` path (lines 780+) does NOT use `RESPONSE_CONFIDENCE_THRESHOLD` — it is only in `runRagSubLoop`. [VERIFIED: grep shows 3 occurrences in the file, all inside `runRagSubLoop`]

### Pattern 3: `crmGateFired` predicate change (Fix #1)

**Current predicate** (crm-gate.ts:87-97, VERIFIED):
```typescript
export function crmGateFired(args: {
  accion?: string | null
  newFields: string[]
  category: string
}): boolean {
  const { accion, newFields, category } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true    // trigger (a)
  if (newFields.some((f) => SHIPPING_FIELDS.has(f))) return true  // trigger (b) — REMOVE
  if (category === 'datos') return true                        // trigger (c) — KEEP
  return false
}
```

**After Fix #1 — two changes:**

Step A: Change the function signature to accept `datosCriticosJustCompleted`:
```typescript
export function crmGateFired(args: {
  accion?: string | null
  newFields: string[]      // kept in args for the call site (changes.newFields still passed)
  category: string
  datosCriticosJustCompleted: boolean  // NEW
}): boolean {
  const { accion, category, datosCriticosJustCompleted } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true                 // trigger (a) — KEEP
  if (datosCriticosJustCompleted) return true                              // trigger (b) — REPLACE
  if (category === 'datos') return true                                     // trigger (c) — KEEP
  return false
}
```

Step B: Update the call site inside `runCrmGate` (line 330-334, VERIFIED):
```typescript
if (
  !crmGateFired({
    accion: args.accion ?? null,
    newFields: args.changes.newFields,         // can be removed if no longer read
    category: args.category,
    datosCriticosJustCompleted: args.changes.datosCriticosJustCompleted,  // NEW
  })
)
```

`args.changes` is already in scope at that line — `RunCrmGateArgs` includes `changes: StateChanges` [VERIFIED: crm-gate.ts:141] and `StateChanges.datosCriticosJustCompleted` is computed at `state.ts:201` [VERIFIED]. No additional threading needed.

The `SHIPPING_FIELDS` set (lines 69-75) can be removed entirely after the change since it becomes unused.

### Pattern 4: secondary_confidence event enrichment (Fix #2)

**Event site 1 — `comprehension.ts` (current emit, lines 227-242, VERIFIED):**
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
  agent: 'somnio-sales-v4',
  intent: analysis.intent.primary,
  secondary: analysis.intent.secondary,       // already present
  confidence: analysis.intent.confidence,
  intent_confidence: analysis.intent.intent_confidence,
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
  threshold: null,
  scaledToSubLoop: null,
  category: analysis.classification.category,
  sentiment: analysis.classification.sentiment,
  fieldsExtracted: [...],
  tokensUsed,
  // ADD THESE:
  secondary_confidence: analysis.intent.secondary_confidence ?? null,
  secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
  secondary_query: analysis.intent.secondary_query ?? null,   // optional per D-02
})
```

**Event site 2 — `somnio-v4-agent.ts` (current emit, lines 435-446, VERIFIED):**
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed_v4', {
  agent: SOMNIO_V4_AGENT_ID,
  sessionId: input.sessionId ?? null,
  intent: analysis.intent.primary,
  intent_confidence: analysis.intent.intent_confidence,
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
  threshold,
  scaledToSubLoop: anyLowSlot,
  earlyReason: earlyReason ?? null,
  tokensUsed,
  restart_iteration: restartIteration,
  // ADD THESE:
  secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : null,
  secondary_confidence: analysis.intent.secondary_confidence ?? null,
  secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
  secondary_query: analysis.intent.secondary_query ?? null,    // optional per D-02
})
```

All field names verified against `comprehension-schema.ts`:
- `secondary_confidence`: z.number().min(0).max(1).nullable() at schema line 61 [VERIFIED]
- `secondary_confidence_reasoning`: z.string().nullable() at schema line 67 [VERIFIED]
- `secondary_query`: z.string().nullable() at schema line 70 [VERIFIED]
- `secondary` (the label string): `intent.secondary` at schema line 31 [VERIFIED]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| platform_config cached lookup | New caching infrastructure | Clone `threshold.ts` exactly | Pattern already proven, tested, and authorized for createAdminClient exception |
| Async threshold in sub-loop | Passing threshold as an arg through RunSubLoopArgs | Local `await` at top of `runRagSubLoop` | Simpler, same latency profile, does not change any public interface |
| Event enrichment | New event types or new observability hooks | Add fields to existing `recordEvent` calls | Positional consumers don't exist; additive fields are safe |

---

## Common Pitfalls

### Pitfall 1: Trigger (c) false positive (Fix #1)
**What goes wrong:** Assuming `category === 'datos'` can open the gate for pure informational messages and cause the same crash as trigger (b) did.
**Why it matters:** If trigger (c) produces false positives too, the fix is incomplete.
**Why it is safe (VERIFIED):** The Bucaramanga case that caused the crash was `category='pregunta'`, not `category='datos'`. Trigger (c) fires only when the comprehension model classified the message as PURELY data (no question). A message like "Cuanto demora en llegar a Bucaramanga" is classified as `category='pregunta'` by the comprehension schema (the enum description: `'pregunta: question or request that needs a response'`). [VERIFIED: comprehension-schema.ts:109-114]. Trigger (c) would only fire for a message like "Me llamo Juan apellido Perez telefono 3001234567" — a pure data message — which is exactly the case where the gate SHOULD fire (to attempt createOrder if all critical fields just completed).
**Residual risk:** A pure-data message where `datosCriticosJustCompleted=false` AND `category='datos'` fires the gate. This was the pre-existing behavior for trigger (c) and is intentional. The gate's grounded sub-loop handles this safely (it will decide `no_match` if critical fields are not complete, and the deferred try/catch (#1.b) would prevent any crash from the schema parse). This is noted in the CONTEXT.md as deferred rework.

### Pitfall 2: Module-level const shadow (Fix #3)
**What goes wrong:** The local `const RESPONSE_CONFIDENCE_THRESHOLD = await getResponseConfidenceThreshold()` inside `runRagSubLoop` shadows the module-level `const RESPONSE_CONFIDENCE_THRESHOLD = 0.70`. TypeScript will compile this fine (inner scope shadows outer), but it leaves dead code.
**How to avoid:** Remove the module-level `const` at line 48 entirely and replace with the import. The only consumers are inside `runRagSubLoop` (verified by grep — 3 occurrences, all in that function). If left in place, TypeScript may emit a shadowing warning with `no-shadow` ESLint rule.

### Pitfall 3: Async threshold adds latency to every sub-loop call (Fix #3)
**What goes wrong:** Assuming the async lookup adds ~60ms DB round-trip to every turn.
**Why it is safe:** The 60s module-level cache means the DB is hit at most once per 60 seconds across ALL calls within the same lambda process. After the first call, `return cachedValue` resolves synchronously (< 1ms). The first call per process adds ~20-50ms before CALL 1 (tooling), which itself takes ~2-5s. Net impact: negligible. [VERIFIED: threshold.ts:23-24 cache pattern, identical behavior]

### Pitfall 4: `datosCriticosJustCompleted` is `false` for the turn when the LAST field arrives (Fix #1)
**What goes wrong:** Assuming `datosCriticosJustCompleted` could miss a real order-creation turn if the customer sends the last field in the same turn as a question.
**Why it is safe:** `datosCriticosJustCompleted` is computed in `mergeAnalysis` as `!criticosBefore && criticosAfter` [VERIFIED: state.ts:201]. If `criticosBefore=false` and the message fills the last critical field → `criticosAfter=true` → `datosCriticosJustCompleted=true`. This fires regardless of what else is in the message. The only case where it does NOT fire is when critical fields were already complete before this turn (in that case trigger (a) or trigger (c) cover the case). Separately, `buildCrmHint` also guards on `datosCriticosJustCompleted` at line 188 — if the gate fires via trigger (c) alone, `buildCrmHint` will fall through to the "rescate" hint which handles partial data gracefully.

### Pitfall 5: Event consumers parse payload positionally (Fix #2)
**What goes wrong:** A downstream consumer of `comprehension_completed` or `comprehension_completed_v4` breaks because the new fields appear at unexpected positions.
**Why it is safe:** Both events are stored as JSONB in `agent_observability_events.payload`. Consumers query specific keys. The observability scripts (`_v4-drill-turn.mjs`, `_v4-probe-comprehension.ts`) read named fields. No consumer iterates positional keys. Adding new keys to the payload is additive. [ASSUMED — no test reads these event payloads positionally; consistent with how v4-observability-completeness added fields to these events without breaking consumers]

### Pitfall 6: SHIPPING_FIELDS left as dead code (Fix #1)
**What goes wrong:** The `SHIPPING_FIELDS` set (lines 69-75) becomes unused but is left in the file, confusing future readers about whether it has other consumers.
**How to avoid:** Search for `SHIPPING_FIELDS` usages and confirm it is only referenced in `crmGateFired` before deleting. [VERIFIED by grep: only referenced in crmGateFired at line 94]

---

## Code Examples

### Fix #1: Complete before/after

**Before (`crm-gate.ts` lines 68-97):**
```typescript
/** Campos de envio que, recien capturados, disparan el gate (D-02). */
const SHIPPING_FIELDS: ReadonlySet<string> = new Set([
  'direccion', 'ciudad', 'departamento', 'barrio', 'correo',
])

export function crmGateFired(args: {
  accion?: string | null
  newFields: string[]
  category: string
}): boolean {
  const { accion, newFields, category } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true
  if (newFields.some((f) => SHIPPING_FIELDS.has(f))) return true  // ← REMOVE
  if (category === 'datos') return true
  return false
}
```

**After (`crm-gate.ts`):**
```typescript
// SHIPPING_FIELDS block deleted entirely (no longer referenced)

export function crmGateFired(args: {
  accion?: string | null
  category: string
  datosCriticosJustCompleted: boolean  // ← NEW
}): boolean {
  const { accion, category, datosCriticosJustCompleted } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true                // (a) — unchanged
  if (datosCriticosJustCompleted) return true                            // (b) — replaced
  if (category === 'datos') return true                                   // (c) — unchanged
  return false
}
```

**Call site in `runCrmGate` (current lines 330-334):**
```typescript
// Before:
if (!crmGateFired({
  accion: args.accion ?? null,
  newFields: args.changes.newFields,
  category: args.category,
}))

// After:
if (!crmGateFired({
  accion: args.accion ?? null,
  category: args.category,
  datosCriticosJustCompleted: args.changes.datosCriticosJustCompleted,
}))
```

The `newFields` param is removed from the signature and call site. `RunCrmGateArgs` does not need to change (it already carries `changes: StateChanges` which has `datosCriticosJustCompleted`).

### Fix #2: comprehension_completed payload addition (comprehension.ts ~line 228)

Add after `intent_confidence_reasoning`:
```typescript
secondary_confidence: analysis.intent.secondary_confidence ?? null,
secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
secondary_query: analysis.intent.secondary_query ?? null,
```

### Fix #2: comprehension_completed_v4 payload addition (somnio-v4-agent.ts ~line 437)

Add after `restart_iteration`:
```typescript
secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : null,
secondary_confidence: analysis.intent.secondary_confidence ?? null,
secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
secondary_query: analysis.intent.secondary_query ?? null,
```

Note: `secondary` is already logged in `comprehension_completed` (comprehension.ts:230) but NOT in `comprehension_completed_v4` (somnio-v4-agent.ts). Adding it to `comprehension_completed_v4` improves completeness.

### Fix #3: sub-loop/index.ts wiring

```typescript
// 1. Add import at top of sub-loop/index.ts:
import { getResponseConfidenceThreshold } from './response-confidence-threshold'

// 2. Remove line 48:
// const RESPONSE_CONFIDENCE_THRESHOLD = 0.70  ← DELETE

// 3. Inside runRagSubLoop, BEFORE "// CALL 1 — Tooling":
async function runRagSubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  const t0 = performance.now()

  // Fix #3 (v4-gate-confidence-fixes): load threshold from platform_config (cached 60s).
  // Default 0.70 if key absent — Regla 6, zero behavior change.
  const RESPONSE_CONFIDENCE_THRESHOLD = await getResponseConfidenceThreshold()

  // CALL 1 — Tooling ...
```

The two existing reference sites (lines 420 and 447) remain unchanged syntactically — they still read `RESPONSE_CONFIDENCE_THRESHOLD`, now the local `const` from the `await`.

---

## Line Number Verification (Drift Report)

All CONTEXT.md line numbers verified against live files. Summary of findings:

| Reference | CONTEXT.md Says | Actual Location | Status |
|-----------|----------------|-----------------|--------|
| `crmGateFired` | crm-gate.ts:87-97 | crm-gate.ts:87-97 | EXACT |
| `SHIPPING_FIELDS` | crm-gate.ts:69-75 | crm-gate.ts:69-75 | EXACT |
| `buildCrmHint` datosCriticosJustCompleted | crm-gate.ts:188 | crm-gate.ts:188 | EXACT |
| `runCrmSubLoop` call | crm-gate.ts:358 | crm-gate.ts:358 | EXACT |
| `datosCriticosJustCompleted` computed | state.ts:201 | state.ts:201 | EXACT |
| `datosCriticosOk` | state.ts:225 | state.ts:225 | EXACT |
| `CRITICAL_FIELDS_NORMAL` | constants.ts:94 | constants.ts:94 | EXACT |
| `CRITICAL_FIELDS_OFI_INTER` | constants.ts:104 | constants.ts:104 | EXACT |
| `runCrmGate` call site | somnio-v4-agent.ts:616 | somnio-v4-agent.ts:616 | EXACT |
| `comprehension_completed_v4` event | somnio-v4-agent.ts:437 | somnio-v4-agent.ts:435-446 | NEAR-EXACT (event at 435) |
| `secondary slot resolution` | somnio-v4-agent.ts:818-822 | somnio-v4-agent.ts:817-822 | NEAR-EXACT |
| `comprehension_completed` event | comprehension.ts:227 | comprehension.ts:227 | EXACT |
| `comprehend()` signature | comprehension.ts:118 | comprehension.ts:118 | EXACT |
| `secondary_confidence` | comprehension-schema.ts:61 | comprehension-schema.ts:61 | EXACT |
| `secondary_confidence_reasoning` | comprehension-schema.ts:67 | comprehension-schema.ts:67 | EXACT |
| `secondary_query` | comprehension-schema.ts:70 | comprehension-schema.ts:70 | EXACT |
| `computeSlots` | slots.ts:102-158 | slots.ts:102-158 | EXACT |
| `RESPONSE_CONFIDENCE_THRESHOLD` | sub-loop/index.ts:48 | sub-loop/index.ts:48 | EXACT |
| threshold check | sub-loop/index.ts:447 | sub-loop/index.ts:447 | EXACT |
| `responseConfidence` schema | sub-loop/output-schema.ts:53 | sub-loop/output-schema.ts:54 | OFF BY 1 (describe wrapper pushes it) |
| threshold lookup in agent | NOT in CONTEXT.md | somnio-v4-agent.ts:400 | DISCOVERED — key precedent for Fix #3 wiring |
| `recordV4Event` signature | observability.ts (inferred) | observability.ts:24-36 | VERIFIED |

---

## Fix #1 Deep Analysis: Gate Coverage

**What trigger (b) covered that `datosCriticosJustCompleted` might miss:**

Trigger (b) fired whenever ANY of {direccion, ciudad, departamento, barrio, correo} was newly captured, regardless of whether all critical fields were complete. Use case: customer sends `ciudad` for the first time when the agent is filling in remaining fields one by one.

With Fix #1, the gate fires (for createOrder) only when ALL 6 critical fields (or 5 for ofiInter) transition from incomplete to complete in a single turn. If the customer sends the last field (completing the set), `datosCriticosJustCompleted=true` and the gate fires correctly.

**Scenario: customer sends only `ciudad` with 5/6 fields already set, leaving 1 still missing:**
- Before fix: trigger (b) fires → sub-loop runs → grounded sub-loop checks fields → sub-loop decides `no_match` (not enough data) → handoff. Wasteful but harmless.
- After fix: `datosCriticosJustCompleted=false` (critical fields not yet complete) → trigger (b) doesn't fire → trigger (c) might fire IF `category='datos'` → same grounded sub-loop → same `no_match`. Net result: same outcome, via trigger (c) if the model classified as `'datos'`.

**Scenario: customer sends the last missing field (completing all 6), and also includes a question:**
- `datosCriticosJustCompleted=true` → gate fires via trigger (b) replacement → createOrder cascarón hint → sub-loop tries createOrder.
- The `category` is likely `'mixto'` or `'datos'` — both are safe. The gate fires correctly.

**Scenario that caused the crash (Bucaramanga):** Customer sends a question about delivery time mentioning a city. Comprehension extracts `ciudad='Bucaramanga'`. `datosCriticosJustCompleted=false` (other 5 fields are NOT set). `category='pregunta'`. With Fix #1: trigger (b) does NOT fire (`datosCriticosJustCompleted=false`). Trigger (a) does NOT fire (no CRM_GATE_ACTION). Trigger (c) does NOT fire (`category='pregunta'`). Gate stays closed. Sub-loop CRM never runs. Crash eliminated. [VERIFIED: consistent with FINDINGS.md evidence, category='pregunta' confirmed in comprehension-schema.ts:109]

**Trigger (c) false positive analysis:** Trigger (c) fires only for `category='datos'`. The model classifies `'datos'` only when "only personal info (name, phone, address)" is in the message [VERIFIED: comprehension-schema.ts:109]. A pure-data message with partial fields triggers the gate — the grounded sub-loop handles it via the "rescate" hint [VERIFIED: crm-gate.ts:280-292]. This was always the case and is correct behavior. The fix does NOT change trigger (c) behavior.

---

## Fix #3 Deep Analysis: Async Wiring

**Is `runRagSubLoop` hot-path sensitive?**

`runRagSubLoop` runs at most once or twice per turn (once per low-confidence slot). Each invocation includes:
- CALL 1 (tooling): ~2-5s (GPT-4o mini with tool use)
- CALL 2 (generation): ~3-8s (Gemini Flash)
- CALL 3 (compliance): ~150-500ms (Gemini Flash)

A cached threshold lookup (~0-1ms) before CALL 1 is completely invisible. Even a cold cache hit (~20-50ms DB round-trip) is invisible next to CALL 1's 2-5s. [ASSUMED: DB latency estimate; verified by analogy with threshold.ts which was shipped exactly this way]

**Why NOT pass the threshold as an arg through `RunSubLoopArgs`:**
- Would change a public interface used by multiple callers (somnio-v4-agent.ts at line 724/201, crm-gate.ts at line 358).
- Those callers would need to each await the threshold before constructing args.
- The current `getLowConfidenceThreshold()` is called once in `somnio-v4-agent.ts:400` for THAT threshold; a separate call in `runRagSubLoop` for the RESPONSE threshold is cleaner separation.
- The local `const` approach (shadowing the module-level one) is the minimal-surface change.

**Why NOT hoist to `runSubLoop` entry:**
- `runSubLoop` dispatches to either `runCrmMutationSubLoop` (which doesn't use the threshold) or `runRagSubLoop`. Awaiting a threshold lookup even for CRM mutation paths wastes a cache lookup.
- Hoisting to `runRagSubLoop` is the minimal correct scope.

---

## Open Questions

1. **Should `newFields` be kept in `crmGateFired` args?**
   - What we know: `newFields` is no longer used by any trigger after Fix #1.
   - What's unclear: Whether the caller (inside `runCrmGate`) should still pass it for logging/debugging.
   - Recommendation: Remove `newFields` from the `crmGateFired` signature entirely. The call site already logs the gate outcome via `recordV4Event('crm_gate_skipped')` which can include `newFields` independently if needed. Clean removal avoids confusion.

2. **Should the `secondary` field in `comprehension_completed_v4` be null when secondary is 'ninguno'?**
   - What we know: `comprehension_completed` (first event) already logs `secondary: analysis.intent.secondary` verbatim (including the string `'ninguno'`).
   - What's unclear: Whether `'ninguno'` is more useful than `null` in the DB for filtering.
   - Recommendation: Log `null` when `secondary === 'ninguno'` (consistent with how `secondary_confidence` is `null` when secondary is ninguno, per the schema). This makes DB queries cleaner (`IS NOT NULL` finds turns with a real secondary intent).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run src/lib/agents/somnio-v4/__tests__/` |
| Sub-loop tests | `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/` |
| Full agent suite | `npx vitest run src/lib/agents/somnio-v4/` |

### Test Impact Per Fix

**Fix #1 — crmGateFired predicate change:**
- Existing tests mock `runCrmGate` wholesale at agent level (`vi.mock('../crm-gate', () => ({ runCrmGate: async () => ... }))`). These tests are NOT affected by the predicate change.
- `crmGateFired` is a pure exported function. If it has unit tests in the crm-gate test file, those tests need updating. Verify with: `grep -n "crmGateFired\|SHIPPING_FIELDS" src/lib/agents/somnio-v4/__tests__/*.test.ts 2>/dev/null`
- Wave 0 action: check for existing crm-gate unit tests and update them. If none exist, add a simple unit test for the new predicate (3 assertions: trigger a, trigger b with datosCriticosJustCompleted, trigger c).

**Fix #2 — event payload enrichment:**
- Pure additive. No existing test asserts the exact set of keys in `comprehension_completed` or `comprehension_completed_v4`. No test changes required.

**Fix #3 — threshold module:**
- `sub-loop/index.ts` tests (`sub-loop/__tests__/sub-loop-e2e.test.ts`) do NOT reference `RESPONSE_CONFIDENCE_THRESHOLD` [VERIFIED by grep]. They mock the sub-loop at a higher level.
- New module `response-confidence-threshold.ts` can have a simple unit test (pattern identical to threshold.ts tests if any exist).
- The agent-level tests mock `'../sub-loop'` wholesale — not affected.

### Wave 0 Gaps
- [ ] `src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` — new module (clone of threshold.ts with different key name and default)
- [ ] Check for crm-gate unit tests that may test `crmGateFired` with `newFields` — update or add

---

## Security Domain

Not applicable — no new endpoints, no auth changes, no new user input surfaces. All changes are internal to the agent pipeline (backend only, v4 DORMANT in prod).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DB latency for platform_config cold lookup is ~20-50ms | Fix #3 Deep Analysis | Low — even at 200ms it's invisible vs tooling call latency |
| A2 | No consumer of `comprehension_completed` or `comprehension_completed_v4` parses payload positionally | Pitfall 5 | Low — events stored as JSONB, all consumers use named access |
| A3 | No crm-gate unit tests currently test `crmGateFired` with `newFields` | Validation Architecture | Low — if they exist, they need updating (straightforward) |

**All code claims verified against live source files. No CONTEXT.md claims contradicted by live code.**

---

## Sources

### Primary (HIGH confidence — verified by reading live source)
- `src/lib/agents/somnio-v4/crm-gate.ts` — crmGateFired predicate, SHIPPING_FIELDS, buildCrmHint, runCrmGate call site, RunCrmGateArgs
- `src/lib/agents/somnio-v4/state.ts` — StateChanges interface, datosCriticosJustCompleted computation, datosCriticosOk
- `src/lib/agents/somnio-v4/constants.ts` — CRITICAL_FIELDS_NORMAL (6 fields), CRITICAL_FIELDS_OFI_INTER (5 fields)
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — secondary_confidence (:61), secondary_confidence_reasoning (:67), secondary_query (:70)
- `src/lib/agents/somnio-v4/comprehension.ts` — comprehension_completed event payload (:227-242), comprehend() signature
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — comprehension_completed_v4 event (:435-446), runCrmGate call site (:616), slot resolution (:817-822), getLowConfidenceThreshold usage (:400)
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — RESPONSE_CONFIDENCE_THRESHOLD (:48), threshold check (:447), event emit (:420), runRagSubLoop is async (:271)
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` — responseConfidence field description, LoopOutcome type
- `src/lib/agents/somnio-v4/threshold.ts` — complete pattern for Fix #3 clone
- `src/lib/agents/somnio-v4/observability.ts` — recordV4Event helper signature

### Contextual
- `.planning/standalone/v4-gate-confidence-fixes/CONTEXT.md` — decisions D-01/D-02/D-03, scope
- `.planning/standalone/v4-gate-confidence-fixes/FINDINGS.md` — diagnosis, real turn evidence, mechanisms verified in prior session

---

## Metadata

**Confidence breakdown:**
- Fix #1 predicate analysis: HIGH — all triggers, all call sites, all data flows verified against live code
- Fix #2 field names: HIGH — verified field names and types against comprehension-schema.ts
- Fix #3 async wiring: HIGH — runRagSubLoop is async, threshold.ts pattern fully read, both consumer sites located exactly
- False positive analysis for trigger (c): HIGH — verified comprehension-schema.ts enum description for category

**Research date:** 2026-06-13
**Valid until:** Until any of the 8 verified source files change substantially. The line numbers should be re-verified if significant refactoring occurs in the agent between now and execution.
