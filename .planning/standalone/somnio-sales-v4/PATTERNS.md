# Standalone: somnio-sales-v4 — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 28 (19 new code + 5 migrations + 4 mods to existing)
**Analogs found:** 24 / 28 (4 NEW with no in-repo precedent — flagged below)

## Summary

v4 is a **clone-and-adapt** standalone (D-24). 17 of the 19 new code files have a direct v3 (or pw-confirmation) analog that the planner can reference verbatim with mechanical transformations. The genuinely net-new surfaces are:

1. The AI SDK v6 sub-loop (`sub-loop/*.ts`) — no in-repo precedent for `generateText + Output.object()` with bounded toolset. Pattern source = RESEARCH.md §Pattern 2 + AI SDK v6 docs.
2. The pgvector knowledge base (`knowledge-base/*.ts` + 1536-dim embedding migration) — repo has zero pgvector usage and zero OpenAI embedding usage. Pattern source = RESEARCH.md §Pattern 4.
3. The `agent_unknown_cases` table + clustering + UI — no admin/clustering UX exists in the codebase today. Pattern source = `crm-tools` UI shape (basic) + RESEARCH.md §Example 3 (SQL).
4. `gray-matter` integration — net-new dependency, zero in-repo use.

Every other file is a **mechanical rename + literal substitution** of an existing v3 (or pw-confirmation) file.

## File Classification

### New code under `src/lib/agents/somnio-v4/`

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `config.ts` | constants/registry-config | static | `src/lib/agents/somnio-v3/config.ts` | exact |
| `index.ts` | module entrypoint (self-register) | side-effect | `src/lib/agents/somnio-v3/index.ts` | exact |
| `constants.ts` | constants | static | `src/lib/agents/somnio-v3/constants.ts` | exact |
| `types.ts` | typescript types | static | `src/lib/agents/somnio-v3/types.ts` + extension for `Invocation`/`LoopOutcome` | role-match |
| `state.ts` | state-machine (mergeAnalysis, computeGates) | sync transform | `src/lib/agents/somnio-v3/state.ts` | exact |
| `phase.ts` | derived-phase pure fn | sync transform | `src/lib/agents/somnio-v3/phase.ts` | exact |
| `guards.ts` | R0/R1 guards | sync transform | `src/lib/agents/somnio-v3/guards.ts` | exact |
| `transitions.ts` | state-machine transition table | sync transform | `src/lib/agents/somnio-v3/transitions.ts` | exact |
| `comprehension-schema.ts` | Zod schema | static | `src/lib/agents/somnio-v3/comprehension-schema.ts` | exact + extend |
| `comprehension-prompt.ts` | system prompt builder | sync transform | `src/lib/agents/somnio-v3/comprehension-prompt.ts` | exact + extend |
| `comprehension.ts` | LLM single-call (Anthropic SDK + zodOutputFormat) | request-response (LLM) | `src/lib/agents/somnio-v3/comprehension.ts` | exact + extend |
| `sales-track.ts` | state-machine action selection | sync transform | `src/lib/agents/somnio-v3/sales-track.ts` | exact |
| `response-track.ts` | template engine | sync transform + DB read | `src/lib/agents/somnio-v3/response-track.ts` | exact |
| `delivery-zones.ts` | static lookup | static | `src/lib/agents/somnio-v3/delivery-zones.ts` | exact (verbatim copy) |
| `somnio-v4-agent.ts` | orchestrator (processMessage + processSystemEvent) | request-response | `src/lib/agents/somnio-v3/somnio-v3-agent.ts` | exact + extend (sub-loop branch) |
| `sub-loop/index.ts` | AI SDK v6 generateText + Output.object | request-response (LLM, multi-step tool-call) | **NO IN-REPO ANALOG** | new (RESEARCH §Pattern 2) |
| `sub-loop/output-schema.ts` | Zod discriminated union | static | `src/lib/agents/shared/crm-mutation-tools/types.ts:58-82` (`MutationResult` discriminated union) | role-match |
| `sub-loop/tools.ts` | AI SDK tool dict factory | static factory | `src/lib/agents/shared/crm-mutation-tools/index.ts:34-41` (factory aggregator pattern) | role-match |
| `sub-loop/kb-search-tool.ts` | AI SDK `tool()` wrapping pgvector search | request-response (DB) | **NO IN-REPO ANALOG** for `tool()` wrapping pgvector; `tool({ description, inputSchema, execute })` shape exists in shared/crm-mutation-tools/contacts.ts | partial |
| `sub-loop/nunca-decir-check.ts` | post-gen LLM compliance check | request-response (LLM) | **NO IN-REPO ANALOG** (the closest pattern of "second LLM call to validate output" is novel) | new (RESEARCH §Example 5) |
| `knowledge-base/parser.ts` | gray-matter + Zod frontmatter validator | sync transform (file → struct) | **NO IN-REPO ANALOG** (zero gray-matter usage in repo today) | new |
| `knowledge-base/sync.ts` | embed + upsert | request-response (OpenAI) + DB | **NO IN-REPO ANALOG** (zero OpenAI embedding usage) | new (RESEARCH §Pattern 4) |
| `knowledge-base/coherence-check.ts` | folder vs frontmatter validator | sync | net-new (utility, trivial) | new |
| `unknown-cases/capture.ts` | DB insert with embedding | DB write | partial: any domain insert function (e.g. `src/lib/domain/messages.ts`) | partial |
| `unknown-cases/cluster.ts` | pgvector cosine SQL query worker | DB read | **NO IN-REPO ANALOG** (no pgvector usage today) | new (RESEARCH §Example 3) |
| `knowledge/**/*.md` | curated content | data | net-new corpus | new |

### Inngest functions (new)

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/inngest/functions/agent-timers-v4.ts` | Inngest timer (settle 5s + waitForEvent + processMessage) | event-driven | `src/inngest/functions/agent-timers-v3.ts` | exact |
| `src/inngest/functions/knowledge-sync-v4.ts` | Inngest post-deploy hook | event-driven (cron + webhook) | `src/inngest/functions/agent-timers-v3.ts` (only as Inngest function shape reference); semantic analog is none in repo | partial |
| `src/inngest/functions/unknown-cases-cluster.ts` | Inngest nightly cron | event-driven (cron) | partial: any cron function in `src/inngest/functions/` (e.g. `crm-mutation-idempotency-cleanup` per CLAUDE.md skill — confirmed by name reference) | partial |

### Dashboard UI (new)

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx` | server component (admin list/promotion UI) | DB read + render | `src/app/(dashboard)/agentes/crm-tools/page.tsx` | role-match (config UI; not list/cluster) |
| `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts` | server actions (promote / dismiss) | DB write | `src/app/(dashboard)/agentes/crm-tools/_actions.ts` | exact (server action skeleton) |
| `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/*.tsx` | client components (table, dialog) | UI | partial: `src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx` | partial (different shape) |

### CLI script

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `scripts/knowledge-sync.ts` | tsx CLI entry | file-I/O + LLM | net-new — repo has `scripts/voice-app/` etc. but no analog of "import lib/* + execute" entrypoint of this shape | new |

### Migrations

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `YYYYMMDD_somnio_v4_agent_knowledge_base.sql` | DDL + pgvector ext + HNSW idx | schema | **NO IN-REPO ANALOG** for pgvector | new |
| `YYYYMMDD_somnio_v4_agent_unknown_cases.sql` | DDL with embedding column | schema | **NO IN-REPO ANALOG** for vector column | new |
| `YYYYMMDD_somnio_v4_platform_config.sql` | seed key-value | INSERT | `supabase/migrations/20260420000443_platform_config.sql` | exact |
| `YYYYMMDD_somnio_v4_template_clone.sql` | INSERT … SELECT clone of agent_templates | INSERT-from-SELECT | `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` | exact |
| `YYYYMMDD_somnio_v4_flip.sql` | atomic UPDATE+INSERT (run manually) | DML transaction | partial: any 2-statement migration in repo (no exact precedent — flag as new shape but with RESEARCH §Example 4 SQL provided) | partial |

### Modifications to existing files

| Existing file | Change | Pattern source |
|---------------|--------|----------------|
| `src/app/(dashboard)/agentes/routing/editor/page.tsx` | add `import '@/lib/agents/somnio-v4'` line + ensure registry side-effect runs | exact pattern at lines 25-29 |
| `src/lib/agents/production/webhook-processor.ts` | add `import('../somnio-v4')` to the `Promise.all` pre-warm block at line 225-231 | exact pattern at lines 225-231 (verify routing dispatches via routing_rules — usually no extra branch needed since routing engine is generic; only add a custom branch if a 2-step Inngest preload is required, which v4 does NOT — D-16 says no preload) |
| `package.json` | add `gray-matter` dep + `"knowledge:sync": "tsx scripts/knowledge-sync.ts"` script | exact (deps already include `tsx`-equivalent toolchain — Plan-phase verifies tsx is installed) |

---

## Pattern Assignments

### `src/lib/agents/somnio-v4/config.ts` (constants/registry-config, static)

**Analog:** `src/lib/agents/somnio-v3/config.ts` (full file, 76 lines)

**Imports pattern** (lines 1-9):
```typescript
import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_V3_AGENT_ID = 'somnio-sales-v3'
```

**Core pattern** (lines 11-76): single exported `AgentConfig` object with `id`, `name`, `description`, `intentDetector`, `orchestrator`, `tools`, `states`, `initialState`, `validTransitions`, `confidenceThresholds`, `tokenBudget`.

**Adaptations:**
1. Rename literal `SOMNIO_V3_AGENT_ID = 'somnio-sales-v3'` → `SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'` (D-13).
2. Update `name` and `description` strings to mention "v4 hibrido + sub-loop".
3. Optionally extend `tools[]` to include the broader v4 tool set (the field is descriptive metadata for the registry, not the actual sub-loop tool registration — D-19 set lives in `sub-loop/tools.ts`).

**Anti-patterns (RESEARCH Pitfall, Anti-Patterns):**
- DO NOT `export { SOMNIO_V3_AGENT_ID }` from anywhere; v4 owns its own literal (D-24 isolation).

---

### `src/lib/agents/somnio-v4/index.ts` (module entrypoint, side-effect)

**Analog:** `src/lib/agents/somnio-v3/index.ts` (full file, 17 lines)

**Full file:**
```typescript
import { agentRegistry } from '../registry'
import { somnioV3Config, SOMNIO_V3_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(somnioV3Config)

// Re-export public API
export { SOMNIO_V3_AGENT_ID } from './config'
export { processMessage } from './somnio-v3-agent'
export type { V3AgentInput, V3AgentOutput } from './types'
```

**Adaptations:**
1. Rename `somnioV3Config` → `somnioV4Config`.
2. Rename `SOMNIO_V3_AGENT_ID` → `SOMNIO_V4_AGENT_ID` (both export name and literal).
3. Re-export from `./somnio-v4-agent` (file name change).
4. Look at `src/lib/agents/somnio-pw-confirmation/index.ts` for the augmented header comment pattern (lines 1-17 there) listing every consumer that imports the module — v4 should declare consumers (routing-editor, webhook-processor pre-warm, agent-timers-v4) for parity.

**Anti-patterns:**
- Do NOT skip the `agentRegistry.register(...)` side-effect — without it, the routing engine's `route.ts:138` will throw "unregistered agent_id" → fallback_legacy (RESEARCH cites this as the LEARNING B-001 lambda-cold-start risk).

---

### `src/lib/agents/somnio-v4/constants.ts` (constants, static)

**Analog:** `src/lib/agents/somnio-v3/constants.ts` (218 lines, full file)

**Imports pattern:** Zero imports (project rule — line 5 of v3 file: "Single source of truth. ZERO imports from other project files. Prevents circular dependencies."). Preserve.

**Core pattern excerpts:**
- `V3_INTENTS` array (lines 12-47) — 22 intents.
- `INFORMATIONAL_INTENTS` set (lines 64-68) — 13 intents.
- `ACTION_TEMPLATE_MAP` (lines 71+) — accion → template intents.
- `CRM_ACTIONS` set (lines 184-186) — `crear_orden*` actions.
- `CREATE_ORDER_ACTIONS` set (lines 189-191) — same 3 entries.
- `V3_TIMER_DURATIONS` (lines 213-217) — 3 presets × 9 levels.
- `V3_META_PREFIX` (cited in state.ts:21).

**Adaptations:**
1. Rename `V3_INTENTS` → `V4_INTENTS`.
2. Rename `V3_TIMER_DURATIONS` → `V4_TIMER_DURATIONS`.
3. Rename `V3_META_PREFIX` → `V4_META_PREFIX` (the SessionManager keys like `_v4:agent_module`, `_v4:accionesEjecutadas`, etc.). **CRITICAL:** if v3 sessions write `_v3:*` and v4 writes `_v4:*`, there's no key collision in `session_state.datos_capturados` — both can theoretically coexist. CONTEXT D-30 says v4 reuses the same `session_state` table; the prefix isolation is what makes it safe.
4. Keep timer values identical (D-21).
5. If v4 adds new intents (per the 12-20 KB seed corpus categories — D-12), enumerate them in `V4_INTENTS` (e.g., a `razonamiento_libre` intent might be net-new; verify against v3 list).

**Anti-patterns:**
- Do NOT `import { V3_INTENTS } from '../somnio-v3/constants'` (D-24 violation).

---

### `src/lib/agents/somnio-v4/types.ts` (typescript types, static)

**Analog:** `src/lib/agents/somnio-v3/types.ts` (≈190 lines, exports `AgentState`, `Phase`, `Gates`, `TipoAccion`, `TimerSignal`, `V3AgentInput`, `V3AgentOutput`, `AccionRegistrada`, etc.)

**Adaptations:**
1. Verbatim copy of all v3 types.
2. Rename `V3AgentInput` → `V4AgentInput`, `V3AgentOutput` → `V4AgentOutput` (and in re-exports across the module).
3. **NEW types** (RESEARCH §Pattern 3 — Invocation discriminated union; §Pattern 2 — LoopOutcome):
```typescript
// NEW v4 — D-15 Invocation contract
export type Invocation =
  | {
      kind: 'come_back'
      tool: string
      input: unknown
      onSuccess: (result: unknown) => StateChanges
      onError: (err: ToolError) => StateChanges
      timeoutMs: number
    }
  | {
      kind: 'execute'
      tool: string
      input: unknown
      idempotencyKey: string
      onError: 'log' | 'observability' | 'silent'
    }

// NEW v4 — sub-loop reason discriminator
export type SubLoopReason = 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
```
4. `LoopOutcome` lives in `sub-loop/output-schema.ts` (Zod), not here — keeps types.ts pure to state-machine concerns.

**Anti-patterns:**
- Do NOT export `Invocation` from `somnio-v3/` and import here.

---

### `src/lib/agents/somnio-v4/state.ts` (state-machine pure fns, sync transform)

**Analog:** `src/lib/agents/somnio-v3/state.ts` (lines 1-200+, exports `createInitialState`, `mergeAnalysis`, `computeGates`, `serializeState`, `deserializeState`, `hasAction`, `camposFaltantes`, `buildResumenContext`)

**Imports pattern** (lines 10-24):
```typescript
import {
  normalizePhone,
  normalizeCity,
  inferDepartamento,
} from '@/lib/agents/somnio/normalizers'
import {
  CRITICAL_FIELDS_NORMAL,
  CRITICAL_FIELDS_OFI_INTER,
  EXTRAS_NORMAL,
  EXTRAS_OFI_INTER,
  PACK_PRICES,
  V3_META_PREFIX,
} from './constants'
import type { AccionRegistrada, AgentState, DatosCliente, Gates, TipoAccion } from './types'
import type { MessageAnalysis } from './comprehension-schema'
```

**Adaptations:**
1. Replace `V3_META_PREFIX` → `V4_META_PREFIX` (constant rename — already covered in constants.ts).
2. **Note:** the import from `@/lib/agents/somnio/normalizers` is shared utility code — this is OK per RESEARCH "no import from v3" rule (D-24 is about not importing from `somnio-v3/`, the shared `somnio/` namespace is fine — pw-confirmation also imports from there: `src/lib/agents/somnio/template-manager`, `src/lib/agents/somnio/block-composer`, `src/lib/agents/somnio/normalizers`).
3. Keep `MessageAnalysis` import pointing to v4's local schema (which extends the shape).

**Anti-patterns:**
- Do NOT import `MessageAnalysis` from `somnio-v3/comprehension-schema` (D-24).
- Do NOT use the `_v3:*` keys when serializing — use `_v4:*` (so v3 sessions remain untouched in `session_state.datos_capturados`).

---

### `src/lib/agents/somnio-v4/phase.ts` (derive-phase pure fn, sync)

**Analog:** `src/lib/agents/somnio-v3/phase.ts` (51 lines)

**Adaptations:** verbatim copy. Phases (`initial`, `promos_shown`, `confirming`, etc.) are part of the state-machine vocabulary — same set as v3.

---

### `src/lib/agents/somnio-v4/guards.ts` (R0/R1 guards, sync)

**Analog:** `src/lib/agents/somnio-v3/guards.ts` (≈50 lines)

**Adaptations:**
1. Verbatim copy.
2. NOTE: v4 ADDS a different "low-confidence guard" semantics — the new `intent_confidence < threshold` check is an ESCALATION guard (sub-loop trigger), NOT a state-machine guard. Implement that branch in `somnio-v4-agent.ts` (orchestrator), not in `guards.ts` (R0/R1 only).

---

### `src/lib/agents/somnio-v4/transitions.ts` (transition table, sync)

**Analog:** `src/lib/agents/somnio-v3/transitions.ts` (478 lines)

**Imports pattern** (lines 10-13):
```typescript
import type { AgentState, Gates, Phase, TipoAccion, TimerSignal } from './types'
import type { StateChanges } from './state'
import { camposFaltantes } from './state'
import { CAPITAL_CITIES } from './constants'
```

**Core type exports** (lines 15-28):
```typescript
export interface TransitionEntry {
  phase: Phase | '*'
  on: string
  action: TipoAccion
  condition?: (state: AgentState, gates: Gates, changes?: StateChanges) => boolean
  resolve: (state: AgentState, gates: Gates) => TransitionOutput
  description?: string
}

export interface TransitionOutput {
  timerSignal?: TimerSignal
  enterCaptura?: boolean
  reason: string
}
```

**Core pattern: TRANSITIONS array** (lines 30-427) — declarative table of `{ phase, on, action, condition?, resolve }` entries. ~50 entries.

**Resolver function** (lines 438-462):
```typescript
export function resolveTransition(
  phase: Phase, on: string, state: AgentState, gates: Gates, changes?: StateChanges,
): { action: TipoAccion; output: TransitionOutput } | null {
  for (const entry of TRANSITIONS) {
    if (entry.phase !== '*' && entry.phase !== phase) continue
    if (entry.on !== '*' && entry.on !== on) continue
    if (entry.condition && !entry.condition(state, gates, changes)) continue
    return { action: entry.action, output: entry.resolve(state, gates) }
  }
  return null
}
```

**System-event keying** (lines 467-477):
```typescript
export function systemEventToKey(event: { type: string; [k: string]: unknown }): string {
  switch (event.type) {
    case 'timer_expired':
      return `timer_expired:${event.level}`
    // ...
  }
}
```

**Adaptations:**
1. Verbatim copy of TRANSITIONS array, then **layer in invocation triggers** for the 5 mutations (D-19) — e.g., the `crear_orden` family transitions need to emit `Invocation { kind: 'come_back', tool: 'createOrder', ... }` rather than the current pattern of `salesResult.shouldCreateOrder = true`.
2. Plan-phase decides where the Invocation shape attaches — recommend adding an optional `invocations?: Invocation[]` field to `TransitionOutput` (the interface declared at lines 24-28).

**Anti-patterns:**
- Do NOT couple this file to AI SDK or to the sub-loop. Transitions remain pure (deterministic, sync, testable in isolation).

---

### `src/lib/agents/somnio-v4/comprehension-schema.ts` (Zod schema, static — EXTEND)

**Analog:** `src/lib/agents/somnio-v3/comprehension-schema.ts` (full file, 84 lines — see above-extracted excerpt)

**Adaptations (D-10, D-63, RESEARCH §Example 1):**
1. Rename `V3_INTENTS` import → `V4_INTENTS`; rename `MessageAnalysisSchema` → `MessageAnalysisSchemaV4` (or keep same name within the v4 namespace).
2. **Extend `intent` object with NEW fields:**
```typescript
intent: z.object({
  primary: z.enum(V4_INTENTS),
  secondary: z.enum([...V4_INTENTS, 'ninguno'] as const),
  confidence: z.number().describe('0-100 — existing v3 field, preserved.'),
  reasoning: z.string(),

  // NEW v4 (D-63) — self-reported per-message confidence on the primary intent
  intent_confidence: z.number().min(0).max(1).describe(
    '0..1 self-reported confidence in the PRIMARY intent classification. ' +
    '0.85+ = universal-clear (e.g., "cuanto cuesta"), ' +
    '0.50-0.70 = context-dependent (e.g., "ok"), ' +
    '<0.40 = sumidero / fallback / razonamiento_libre. ' +
    'Reflect ambiguity at this turn IN ISOLATION — do NOT use prior conversation phase to resolve.'
  ),
  intent_confidence_reasoning: z.string().optional().describe(
    'Brief explanation of confidence value. Used for observability + iterative few-shot tuning post-launch.'
  ),
}),
```
3. Keep `extracted_fields`, `classification`, `negations` verbatim.
4. **Threshold validation:** the threshold itself is read from `platform_config` at runtime (D-11) — do NOT hardcode in the schema or prompt.

**Anti-patterns (RESEARCH Pitfall 4):**
- Do NOT add a `confidence_calibration: z.enum([...])` field — that is Plan B (D-67), only activated as future contingency standalone.
- Do NOT use temperature > 0 for the comprehension call (RESEARCH Pitfall 4). v3 default is 0; preserve.

---

### `src/lib/agents/somnio-v4/comprehension-prompt.ts` (system prompt builder, sync)

**Analog:** `src/lib/agents/somnio-v3/comprehension-prompt.ts` (≈220 lines)

**Adaptations (D-66, D-72, D-79, RESEARCH §Example 2):**
1. Verbatim copy of v3 prompt structure (`buildSystemPrompt(existingData, recentBotMessages)`).
2. **Append a `## EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE` block** with 6-8 few-shot examples (research extracts these from real Somnio messages — Plan-phase Task: query `agent_observability_events` + `messages` for last 30 days; user-curate to: 2-3 universal-claros (0.85-0.95), 2-3 context-dependientes (0.50-0.70), 1-2 sumidero (<0.40)).
3. **Append explicit instruction (D-74):**
   > "Tu output es sobre este mensaje individual y su match con un intent universal. NO uses contexto de fase previa para resolver ambiguedad — reporta ambigüedad como confianza baja."

**Anti-patterns (RESEARCH Pitfall 4):**
- Do NOT paraphrase the few-shot examples for "smoothness" — calibration depends on exact distribution.
- Do NOT skip the sumidero examples (the model defaults to high confidence without them — mode collapse).

---

### `src/lib/agents/somnio-v4/comprehension.ts` (LLM single-call, request-response)

**Analog:** `src/lib/agents/somnio-v3/comprehension.ts` (full file, 142 lines — see above-extracted excerpt)

**Imports pattern** (lines 11-17):
```typescript
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createInstrumentedAnthropic } from '@/lib/observability/anthropic-instrumented'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { buildSystemPrompt } from './comprehension-prompt'
import { V3_INTENTS } from './constants'
```

**Core pattern** (lines 51-101): `comprehend(message, history, existingData, recentBotMessages)` →
1. Get singleton instrumented Anthropic client
2. Build messages array (last 6 history turns + current user message)
3. `runWithPurpose('comprehension', () => anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: [{ type: 'text', text: buildSystemPrompt(...), cache_control: { type: 'ephemeral' } }], messages, output_config: { format: zodOutputFormat(MessageAnalysisSchema) } }))`
4. Extract text block, `parseAnalysis()` with sanitization fallback (lines 108-142 — handles unknown intent values by mapping to `'otro'`).
5. `getCollector()?.recordEvent('comprehension', 'result', {...})` — emit observability with intent + confidence + tokens.

**Adaptations (D-68 observability):**
1. Rename `V3_INTENTS` → `V4_INTENTS`; `MessageAnalysisSchema` reused (now with v4 extended fields).
2. **Extend the observability emit** with new fields:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
  agent: 'somnio-sales-v4',
  intent: analysis.intent.primary,
  intent_confidence: analysis.intent.intent_confidence,           // NEW
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning,  // NEW
  threshold,                                                      // NEW (read from platform_config)
  scaledToSubLoop: analysis.intent.intent_confidence < threshold, // NEW
  // ... existing fields
})
```
3. Keep `claude-haiku-4-5-20251001` model and temperature defaults.
4. Keep `runWithPurpose` wrap (RESEARCH "Deprecated/outdated: Custom Anthropic client construction without `runWithPurpose` wrap (observability requires it)").

**Anti-patterns:**
- Do NOT migrate this call to AI SDK v6 `generateText` (RESEARCH Standard Stack: "stay raw for comprehension (zero risk, identical to v3)"). Save AI SDK v6 for the sub-loop.
- Do NOT skip the `parseAnalysis()` sanitization fallback — Haiku occasionally emits intents outside the enum; v3 falls back to `'otro'`. Preserve.

---

### `src/lib/agents/somnio-v4/sales-track.ts` (action selection, sync)

**Analog:** `src/lib/agents/somnio-v3/sales-track.ts` (full file, ≈250 lines)

**Adaptations:** verbatim copy (relies on transitions.ts + state.ts which are already cloned).

---

### `src/lib/agents/somnio-v4/response-track.ts` (template engine, sync + DB read)

**Analog:** `src/lib/agents/somnio-v3/response-track.ts` (414 lines)

**Imports pattern** (lines 13-24):
```typescript
import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import { getCollector } from '@/lib/observability'
import { INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP } from './constants'
import { SOMNIO_V3_AGENT_ID } from './config'
import { buildResumenContext, camposFaltantes } from './state'
import { lookupDeliveryZone, formatDeliveryTime } from './delivery-zones'
import type { AgentState, ProcessedMessage, ResponseTrackOutput, TipoAccion } from './types'
```

**Adaptations:**
1. Replace `SOMNIO_V3_AGENT_ID` → `SOMNIO_V4_AGENT_ID`. **CRITICAL** — TemplateManager filters templates by `agent_id`, so this is what makes v4 query its OWN catalog (D-26). Same pattern as `somnio-recompra/response-track.ts:36` (per CLAUDE.md `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'`).
2. Look at `src/lib/agents/somnio-pw-confirmation/response-track.ts` (700+ lines) for reference of pw-confirmation's renaming approach — same pattern.
3. Keep imports from `somnio/template-manager`, `somnio/block-composer`, `somnio/normalizers` (shared utilities — D-24 only forbids importing from `somnio-v3/`).

**Anti-patterns (RESEARCH Pitfall 1):**
- Do NOT assume cloning templates requires Meta re-approval — the table is INTERNAL Postgres content storage. Template clone migration (Plan 01) is pure SQL, no Meta involvement.

---

### `src/lib/agents/somnio-v4/delivery-zones.ts` (static lookup)

**Analog:** `src/lib/agents/somnio-v3/delivery-zones.ts` (≈180 lines)

**Adaptations:** verbatim copy. Same Somnio data; v4 doesn't reduce/expand zone coverage.

---

### `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (orchestrator, request-response)

**Analog:** `src/lib/agents/somnio-v3/somnio-v3-agent.ts` (full file, 469 lines)

**Imports pattern** (lines 15-23):
```typescript
import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { CRM_ACTIONS, CREATE_ORDER_ACTIONS } from './constants'
import { getCollector } from '@/lib/observability'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal, TipoAccion, AccionRegistrada } from './types'
```

**Top-level dispatch** (lines 35-40):
```typescript
export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  if (input.systemEvent && input.systemEvent.type === 'timer_expired') {
    return processSystemEvent(input, input.systemEvent)
  }
  return processUserMessage(input)
}
```

**Core pipeline (processUserMessage)** at lines 245-403:
1. `comprehend(...)` — single Haiku call.
2. `mergeAnalysis` → `mergedState`, `changes`.
3. `getCollector().recordEvent('pipeline_decision', 'comprehension_result', {...})` (line 239-243).
4. `derivePhase(accionesEjecutadas)`, `resolveSalesTrack({phase, state, gates, event})`.
5. `getCollector().recordEvent('pipeline_decision', 'sales_track_result', {...})` (lines 259-268).
6. Order-decision check (lines 279-287): `CREATE_ORDER_ACTIONS.has(action) && !hasPriorOrder`.
7. `resolveResponseTrack(...)` (lines 290-297).
8. Order creation deferred (orderData attached to output for the engine adapter to fulfill — pattern at v3-production-runner.ts:475-493; v4 REPLACES this with direct `crm-mutation-tools.createOrder` call — D-07/D-19/D-20).

**Adaptations (D-01 hybrid orchestration):**
1. Verbatim copy of v3 happy path.
2. **Add sub-loop escalation branch** after `comprehend()` returns:
```typescript
const threshold = await getThreshold()  // platform_config lookup
const subLoopReason: SubLoopReason | null = decideSubLoopReason({
  confidence: analysis.intent.intent_confidence,
  threshold,
  intent: analysis.intent.primary,
  isCrmMutation: false,  // updated after transition resolves
})

if (subLoopReason !== null) {
  const outcome = await runSubLoop({ reason: subLoopReason, ctx })
  return mapOutcomeToAgentOutput(outcome, mergedState)
}
// else: existing v3 happy-path code unchanged
```
3. **Replace `output.shouldCreateOrder + output.orderData` deferral** (lines 475-493 of `v3-production-runner.ts`) with **direct call to `crm-mutation-tools`**:
```typescript
// v4 — D-07/D-19/D-20: createOrder happens HERE (synchronously in agent), template sent only on success
if (CREATE_ORDER_ACTIONS.has(salesResult.accion)) {
  const tools = createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })
  const result = await tools.createOrder.execute({
    /* fields from mergedState */,
    idempotencyKey: `somnio-v4-createOrder-${sessionId}-happy`,  // Pitfall 5
  })
  if (result.status !== 'success') {
    // escalate: don't send pendiente_*; send error template or trigger sub-loop CAS path
    return mapErrorToAgentOutput(result, mergedState)
  }
}
```
4. **Reuse the v3 timer-path orchestration** (lines 46-156) — but in `agent-timers-v4.ts` the same `crm-mutation-tools.createOrder.execute({...idempotencyKey: 'somnio-v4-createOrder-...-timer_L3' (or timer_L4)})` pattern applies (D-22 + Pitfall 5).

**Anti-patterns (RESEARCH):**
- Do NOT call `createProductionAdapters({ ..., agentId: 'somnio-sales-v3' })` (existing v3 timer pattern at line 418 of agent-timers-v3.ts) — v4 uses `crm-mutation-tools` direct (D-07).
- Do NOT use `crm-writer-adapter` (D-07 — that's for pw-confirmation).
- Do NOT omit the `idempotencyKey` on `createOrder` / `addOrderNote` come-back paths (Pitfall 5).

---

### `src/lib/agents/somnio-v4/sub-loop/index.ts` (AI SDK v6, request-response — NEW)

**Analog:** **NO IN-REPO PRECEDENT.** Closest reference patterns:
- `src/app/api/builder/chat/route.ts` and `src/app/api/config-builder/templates/chat/route.ts` use `streamText`/`generateText` from AI SDK — but neither uses `Output.object()` or `toolChoice: 'required'` (search confirmed). v4's sub-loop is the FIRST `generateText + Output.object()` consumer in the repo.
- `src/lib/agents/shared/crm-mutation-tools/types.ts:58-82` (`MutationResult` discriminated union) is the structural analog for the LoopOutcome shape.

**Pattern source:** RESEARCH.md §Pattern 2 (the full sketch is in RESEARCH lines 350-413) + AI SDK v6 docs.

**Imports pattern (proposed):**
```typescript
import { generateText, Output, stepCountIs, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { LoopOutcomeSchema, type LoopOutcome } from './output-schema'
import { buildSubLoopTools } from './tools'
import { buildSubLoopPrompt } from './prompt'
import { checkNuncaDecir } from './nunca-decir-check'
```

**Core pattern (proposed — RESEARCH §Pattern 2):**
```typescript
export async function runSubLoop(args: {
  reason: SubLoopReason,
  ctx: SubLoopContext,
}): Promise<LoopOutcome> {
  const tools = buildSubLoopTools(args.reason, args.ctx)

  const { output } = await runWithPurpose('subloop', () =>
    generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: buildSubLoopPrompt(args.reason),
      messages: buildContextMessages(args.ctx),
      tools,
      toolChoice: 'auto',                 // 'required' would prevent the structured final output; use 'auto' so the model can search KB then return Output.object()
      stopWhen: stepCountIs(4),
      output: Output.object({ schema: LoopOutcomeSchema }),
    })
  )

  // D-51: post-gen NUNCA decir check (only on canonical outcomes)
  if (output.status === 'canonical') {
    const check = await checkNuncaDecir({
      candidateText: output.canonicalText,
      nuncaDecirRules: output.nuncaDecirRules ?? [],
    })
    if (!check.ok) {
      return {
        status: 'no_match',
        responseTemplate: 'handoff_humano',
        requiresHuman: true,
        reason: `nunca_decir_violation: ${check.violation}`,
        knowledgeQueried: [output.sourceTopic],
      }
    }
  }

  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: 'somnio-sales-v4',
    reason: args.reason,
    outcome: output.status,
    knowledgeQueried: output.status !== 'template' ? output.sourceTopic ?? null : null,
  })

  return output
}
```

**Anti-patterns (RESEARCH Pitfall 2 + Anti-Patterns):**
- Do NOT use `generateObject` (deprecated AI SDK v6).
- Do NOT skip `Output.object({ schema: LoopOutcomeSchema })` — without it, model can emit raw text → hallucination (D-62).
- Do NOT use `toolChoice: 'required'` — it prevents the final structured-output step. Use `'auto'` per RESEARCH.
- Do NOT cap `stopWhen` higher than 4 — sub-loop scope is intentionally tight (~600ms-1.5s per D-09).
- Do NOT put `workspaceId` in any tool inputSchema (Pitfall 2 of crm-mutation-tools — workspaceId always from ctx).

---

### `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` (Zod discriminated union, static)

**Role-match analog:** `src/lib/agents/shared/crm-mutation-tools/types.ts:58-82` (`MutationResult` discriminated union)

**Pattern reference (RESEARCH §Pattern 2):**
```typescript
import { z } from 'zod'

export const LoopOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('template'),
    responseTemplate: z.string(),
    extraContext: z.record(z.string()).optional(),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('canonical'),
    canonicalText: z.string(),
    sourceTopic: z.string(),
    nuncaDecirRules: z.array(z.string()).optional(),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('no_match'),
    responseTemplate: z.literal('handoff_humano'),
    requiresHuman: z.literal(true),
    reason: z.string(),
    knowledgeQueried: z.array(z.string()),
  }),
])
export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>
```

**Anti-patterns:**
- Do NOT add a `freeText: z.string()` variant — D-62 forbids freeText. The schema STRUCTURALLY prevents hallucination.

---

### `src/lib/agents/somnio-v4/sub-loop/tools.ts` (AI SDK tool dict factory, static)

**Role-match analog:** `src/lib/agents/shared/crm-mutation-tools/index.ts:34-41` (the factory aggregator pattern — spread component tool dicts)

**Pattern (proposed):**
```typescript
import { kbSearchTool } from './kb-search-tool'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import type { SubLoopContext, SubLoopReason } from '../types'

export function buildSubLoopTools(reason: SubLoopReason, ctx: SubLoopContext) {
  const queryTools = createCrmQueryTools({ workspaceId: ctx.workspaceId, invoker: 'somnio-sales-v4' })
  const mutationTools = createCrmMutationTools({ workspaceId: ctx.workspaceId, invoker: 'somnio-sales-v4' })

  switch (reason) {
    case 'low_confidence':
    case 'razonamiento_libre':
      return { kb_search: kbSearchTool(ctx) }  // KB only

    case 'crm_mutation':
      // Subset relevant for mutations — D-19's 5 mutations
      return {
        kb_search: kbSearchTool(ctx),
        getActiveOrderByPhone: queryTools.getActiveOrderByPhone,
        createOrder: mutationTools.createOrder,
        updateOrder: mutationTools.updateOrder,
        moveOrderToStage: mutationTools.moveOrderToStage,
        addOrderNote: mutationTools.addOrderNote,
        updateContact: mutationTools.updateContact,
      }

    case 'cas_reject':
      return {
        kb_search: kbSearchTool(ctx),
        getActiveOrderByPhone: queryTools.getActiveOrderByPhone,
        moveOrderToStage: mutationTools.moveOrderToStage,
      }
  }
}
```

**Adaptations:**
- Use `invoker: 'somnio-sales-v4'` as the literal (D-13).
- Per-reason tool subsetting keeps Haiku focused (D-09: 3-5 tools per scope, not 20 simultaneously).

**Anti-patterns:**
- Do NOT spread `{...mutationTools}` wholesale — that gives Haiku 15 tools and degrades focus.
- Do NOT instantiate the factory at module scope — RESEARCH Pitfall 6 of crm-query-tools (D-04: per-call factory; no module-scope state).

---

### `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` (AI SDK tool wrapping pgvector, request-response — partial NEW)

**Role-match analog:** any `tool({ description, inputSchema, execute })` definition in `src/lib/agents/shared/crm-mutation-tools/contacts.ts` (the AI SDK `tool()` shape) — but the `execute` body wrapping pgvector is NEW (no in-repo pgvector usage).

**Pattern (proposed — RESEARCH §Pattern 2 + Pitfall 8):**
```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '../knowledge-base/embed'

export function kbSearchTool(ctx: { workspaceId: string }) {
  return tool({
    description: 'Search the curated knowledge base. Returns up to 3 hits with topic, canonical_response, NUNCA decir rules, and similarity score.',
    inputSchema: z.object({
      query: z.string().describe('User message or sub-question to look up'),
      category: z.enum(['product', 'policies', 'edge-cases', 'faqs-no-templated']).optional(),
    }),
    async execute({ query, category }) {
      const queryEmbedding = await generateEmbedding(query)
      const supabase = createAdminClient()
      let qb = supabase
        .from('agent_knowledge_base')
        .select('topic, canonical_response, escalate_triggers, related_topics, embedding <=> :q AS distance')
        // pgvector <=> operator — needs raw SQL or supabase rpc; planner picks final mechanism
        .eq('workspace_id', ctx.workspaceId)
        .eq('agent_id', 'somnio-sales-v4')
      if (category) qb = qb.eq('category', category)
      const { data } = await qb.limit(3)
      return data ?? []
    },
  })
}
```

**Anti-patterns (RESEARCH Pitfall 7 + Anti-Patterns):**
- Do NOT cache KB results in module scope — pgvector queries are sub-100ms; cache becomes stale on sync.
- Do NOT generate embeddings at sync time and re-generate at query time differently — use the same OpenAI `text-embedding-3-small` model with the same dim (1536).
- Do NOT include `workspaceId` in the inputSchema (Pitfall 2 — comes from ctx).
- Do NOT search across workspaces — `.eq('workspace_id', ctx.workspaceId)` is mandatory (Regla 3).

---

### `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (post-gen LLM compliance, request-response — NEW)

**Analog:** **NO IN-REPO PRECEDENT** for "second LLM call to validate first LLM output". Closest pattern is `comprehend()` itself (single Haiku structured-output call) — same client/observability shape.

**Pattern (RESEARCH §Example 5 — full sketch in RESEARCH lines 833-865):**

```typescript
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'

const CheckSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

export async function checkNuncaDecir(args: {
  candidateText: string
  nuncaDecirRules: string[]
}): Promise<{ ok: boolean; violation?: string }> {
  if (args.nuncaDecirRules.length === 0) return { ok: true }
  const { output } = await runWithPurpose('subloop_nunca_decir', () =>
    generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: 'You are a content compliance checker. Return whether the candidate text violates any of the given rules.',
      messages: [{ role: 'user', content: `Candidate: """${args.candidateText}"""\n\nForbidden rules:\n${args.nuncaDecirRules.map((r,i)=>`${i+1}. ${r}`).join('\n')}` }],
      output: Output.object({ schema: CheckSchema }),
    })
  )
  return output.violates ? { ok: false, violation: output.violatedRule } : { ok: true }
}
```

**Adaptations:** verbatim from RESEARCH. Wrap in `runWithPurpose('subloop_nunca_decir', ...)` for observability.

**Anti-patterns:**
- Do NOT skip the `args.nuncaDecirRules.length === 0` early return — running an LLM call with empty rules wastes tokens.
- Do NOT call this on `template` or `no_match` outcomes (only on `canonical` per D-50/D-51 — verbatim KB Respuesta canónica is the only thing that needs compliance check).

---

### `src/lib/agents/somnio-v4/knowledge-base/parser.ts` (frontmatter validator — NEW)

**Analog:** **NO IN-REPO PRECEDENT.** `gray-matter` is a net-new dependency.

**Pattern (RESEARCH §Pattern 4 — sketch lines 461-490):**

```typescript
import matter from 'gray-matter'
import { z } from 'zod'

export const FrontmatterSchema = z.object({
  topic: z.string().min(1),
  keywords: z.array(z.string()),
  category: z.enum(['product', 'policies', 'edge-cases', 'faqs-no-templated']),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviewed_by: z.string(),
  escalate_if: z.array(z.string()).optional(),
  related_topics: z.array(z.string()).optional(),
})
export type Frontmatter = z.infer<typeof FrontmatterSchema>

export interface ParsedKbDoc {
  frontmatter: Frontmatter
  body: string
  sections: { canonica?: string; alternativa?: string; nuncaDecir?: string[]; sources?: string }
}

export function parseKbDoc(raw: string, filePath: string): ParsedKbDoc {
  const { data, content } = matter(raw)
  const fm = FrontmatterSchema.parse(data)  // throws on invalid
  // Section parser: split body by `## ` headers (D-49 structure)
  // ... extracts: 'Respuesta canónica' / 'Si el cliente insiste' / 'NUNCA decir' / 'Sources'
  return { frontmatter: fm, body: content, sections: parseSections(content) }
}
```

**Anti-patterns:**
- Do NOT custom-parse YAML (RESEARCH Don't Hand-Roll: gray-matter handles edge cases — escapes, multiline strings, BOMs).
- Do NOT skip the section parser — sub-loop needs `nuncaDecir` rules to wire the post-gen check.

---

### `src/lib/agents/somnio-v4/knowledge-base/sync.ts` (embed + upsert — NEW)

**Analog:** **NO IN-REPO PRECEDENT** for OpenAI embedding. The `openai` package IS in `package.json` (RESEARCH verified) and used by data-extractor for non-embedding calls — search the data-extractor module for `OpenAI` client init pattern.

**Pattern (RESEARCH §Pattern 4):**

```typescript
import OpenAI from 'openai'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseKbDoc } from './parser'
import { coherenceCheck } from './coherence-check'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateEmbedding(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  return r.data[0].embedding
}

export async function syncKbDoc(filePath: string, raw: string) {
  const parsed = parseKbDoc(raw, filePath)
  coherenceCheck(filePath, parsed.frontmatter.category)  // D-48: throws on mismatch
  const bodyHash = createHash('sha256').update(parsed.body).digest('hex')
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('agent_knowledge_base')
    .select('id, body_hash, embedding')
    .eq('topic', parsed.frontmatter.topic)
    .eq('agent_id', 'somnio-sales-v4')
    .eq('workspace_id', SOMNIO_WORKSPACE_ID)
    .maybeSingle()

  let embedding: number[]
  if (existing && existing.body_hash === bodyHash) {
    embedding = existing.embedding  // skip regeneration (Pitfall 7)
  } else {
    embedding = await generateEmbedding(parsed.body)
  }

  await supabase.from('agent_knowledge_base').upsert({
    workspace_id: SOMNIO_WORKSPACE_ID,
    agent_id: 'somnio-sales-v4',
    topic: parsed.frontmatter.topic,
    keywords: parsed.frontmatter.keywords,
    category: parsed.frontmatter.category,
    embedding,
    canonical_response: parsed.sections.canonica,
    escalate_triggers: parsed.frontmatter.escalate_if ?? [],
    related_topics: parsed.frontmatter.related_topics ?? [],
    source_md_path: filePath,
    last_reviewed_at: parsed.frontmatter.last_reviewed,
    reviewed_by: parsed.frontmatter.reviewed_by,
    body_hash: bodyHash,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'topic,agent_id,workspace_id' })
}
```

**Anti-patterns (RESEARCH Pitfall 7):**
- Do NOT regenerate embedding on every sync — hash the body and skip when unchanged.
- Do NOT `await openai.embeddings.create(...)` without dim parameter — OpenAI accepts 1536/3072 but the column is fixed at 1536.
- Do NOT auto-delete orphaned KB rows when a `.md` is removed (RESEARCH Pattern 4 sync semantics: "flag with `last_seen_at < now() - 1 day` for human review").

---

### `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` (folder vs frontmatter validator — NEW)

**Analog:** trivial; no in-repo precedent needed.

**Pattern (D-48):**
```typescript
export function coherenceCheck(filePath: string, frontmatterCategory: string): void {
  const folderCategory = filePath.split('/').at(-2)
  if (frontmatterCategory !== folderCategory) {
    throw new Error(`Coherence fail: ${filePath} folder=${folderCategory} frontmatter=${frontmatterCategory}`)
  }
}
```

---

### `src/lib/agents/somnio-v4/unknown-cases/capture.ts` (DB insert + embedding — partial NEW)

**Partial analog:** any domain function that inserts into a table — e.g., the structure of `crm-mutation-tools/notes.ts:addOrderNote.execute` (Supabase admin insert with workspace_id filter).

**Pattern (D-05/D-12, D-58):**
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '../knowledge-base/sync'
import { phoneSuffix, emailRedact } from '@/lib/agents/shared/crm-mutation-tools/helpers'  // PII redaction (RESEARCH Security)

export async function captureUnknownCase(args: {
  workspaceId: string
  conversationId: string
  message: string
  intent: string
  intentConfidence: number
  knowledgeQueried: string[]
  reason: string
}) {
  // PII redaction before embedding (RESEARCH Security recommendation)
  const redacted = redactPii(args.message)
  const embedding = await generateEmbedding(redacted)

  const supabase = createAdminClient()
  await supabase.from('agent_unknown_cases').insert({
    workspace_id: args.workspaceId,
    agent_id: 'somnio-sales-v4',
    conversation_id: args.conversationId,
    message: redacted,  // store redacted version
    embedding,
    intent: args.intent,
    confidence: args.intentConfidence,
    knowledge_queried: args.knowledgeQueried,
    reason: args.reason,
    status: 'pending',
    cluster_id: null,
  })
}
```

**Anti-patterns:**
- Do NOT store raw message with PII in the embedding vector (RESEARCH Security: "Redact phone+email in customer message body BEFORE embedding").
- Do NOT skip `agent_id='somnio-sales-v4'` filter — multi-agent UI later might query this table with `WHERE agent_id=...`.

---

### `src/lib/agents/somnio-v4/unknown-cases/cluster.ts` (pgvector cosine SQL worker — NEW)

**Analog:** **NO IN-REPO PRECEDENT** for pgvector. Pattern source = RESEARCH §Example 3 (full SQL excerpt in RESEARCH lines 753-781).

**Pattern (D-05, D-06):**
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export async function clusterUnknownCases(workspaceId: string) {
  const supabase = createAdminClient()
  // Run the cosine-neighborhood query via Postgres RPC or raw SQL
  const { data } = await supabase.rpc('cluster_unknown_cases', {
    p_workspace_id: workspaceId,
    p_agent_id: 'somnio-sales-v4',
    p_similarity_threshold: 0.7,    // cosine distance < 0.3
    p_min_cluster_size: 10,         // D-06
    p_window_days: 30,
  })
  // RPC returns rows with case_id + cluster_id assignments → mark status='ready_for_promotion'
  for (const row of data ?? []) {
    await supabase
      .from('agent_unknown_cases')
      .update({ cluster_id: row.cluster_id, status: 'ready_for_promotion' })
      .eq('id', row.case_id)
  }
}
```

**Note:** the SQL function `cluster_unknown_cases` is defined in the W0 migration (the RESEARCH §Example 3 query, wrapped in a Postgres function that returns case_id/cluster_id pairs).

**Anti-patterns (RESEARCH Don't Hand-Roll, Pitfall 8):**
- Do NOT use HDBSCAN or external clustering library — pgvector cosine neighborhood is sufficient at this scale (RESEARCH §Don't Hand-Roll).
- Do NOT run the query without the HNSW index (Pitfall 8 — sequential scan at >1k rows is slow).

---

### `src/lib/agents/somnio-v4/knowledge/**/*.md` (12-20 seed docs — NEW corpus)

**Analog:** none in code; pattern from CONTEXT D-49 + D-47.

**Folder structure (D-47):**
```
src/lib/agents/somnio-v4/knowledge/
  product/
  policies/
  edge-cases/
  faqs-no-templated/
```

**Pattern (D-49 body):**
```markdown
---
topic: precio_comparativo
keywords: [comparar, mas barato, alternativa, melatonina farmacia]
category: faqs-no-templated
last_reviewed: 2026-05-01
reviewed_by: jose
escalate_if: [pregunta sobre marcas competidoras especificas]
related_topics: [precio, formula]
---

## Respuesta canónica
Nuestro ELIXIR DEL SUEÑO combina melatonina + magnesio en formulación 90 días, ...

## Si el cliente insiste
Si pregunta por marca específica de farmacia, mantener foco en formulación propia.

## NUNCA decir
- comparativas peyorativas a otras marcas
- afirmar que somos "los mejores"
- mencionar precios de competencia

## Sources
- D-04 standalone, formulación PHARMA SOLUTIONS SAS
```

**Initial corpus suggestions (RESEARCH §Open Questions item 5):**
- product/: formula, contenido, como_se_toma, dependencia, contraindicaciones, registro_sanitario, efectividad, tiempo_entrega per zone
- policies/: envio, pago, ubicacion, devoluciones
- edge-cases/: long-term insomnia complaints, drug interactions, child-use, pregnancy, alcohol interaction
- faqs-no-templated/: precio_comparativo, alternativas naturales, etc.

**Anti-patterns (D-50, D-52):**
- Do NOT include marketing copy or hyperbole — sub-loop will quote verbatim.
- Do NOT push directly to main — D-52 requires PR review with min 1 approver.

---

### `src/inngest/functions/agent-timers-v4.ts` (Inngest timer function)

**Analog:** `src/inngest/functions/agent-timers-v3.ts` (full file, 492 lines)

**Imports pattern** (lines 16-23):
```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { getWorkspaceAgentConfig } from '@/lib/agents/production/agent-config'
import { checkSessionActive } from '@/lib/agents/timer-guard'
import type { V3AgentInput, V3AgentOutput, AccionRegistrada } from '@/lib/agents/somnio-v3/types'
```

**Inngest function signature** (lines 204-213):
```typescript
export const v3Timer = inngest.createFunction(
  {
    id: 'v3-timer',
    name: 'V3 Agent Timer',
    retries: 3,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
  },
  { event: 'agent/v3.timer.started' },
  async ({ event, step }) => {
```

**Settle + waitForEvent pattern** (lines 228-243):
```typescript
// CRITICAL: Settle 5s — same pattern as ALL v1 timers.
await step.sleep('settle', '5s')
const reply = await step.waitForEvent('wait-for-reply', {
  event: 'agent/customer.message',
  timeout: `${timerDurationMs}ms`,
  match: 'data.sessionId',
})
if (reply) {
  return { status: 'responded', action: 'customer_replied' }
}
```

**Defensive guard** (lines 261-268, D-43):
```typescript
const guardResult = await checkSessionActive(sessionId)
if (!guardResult.ok) {
  return { status: 'skipped' as const, action: 'session_not_active' }
}
```

**Order creation** (lines 410-434) — uses `createProductionAdapters({ agentId: 'somnio-sales-v3' }).orders.createOrder`. **v4 REPLACES this with `crm-mutation-tools` direct call** (D-07/D-19/D-20).

**Adaptations (D-22, Pitfall 10):**
1. Rename function id: `'v3-timer'` → `'v4-timer'`.
2. Rename function name: `'V3 Agent Timer'` → `'V4 Agent Timer'`.
3. Rename event name: `'agent/v3.timer.started'` → `'agent/v4.timer.started'` (BOTH at the listen-on declaration AND at every `inngest.send({ name: ... })` site — RESEARCH Pitfall 10).
4. Update imports: `from '@/lib/agents/somnio-v3/types'` → `from '@/lib/agents/somnio-v4/types'`.
5. Replace agent-module routing branch (lines 308-330 — `agentModule = 'somnio-v3' | 'godentist' | 'somnio-recompra'`) with v4-only dispatch:
```typescript
const { processMessage } = await import('@/lib/agents/somnio-v4/somnio-v4-agent')
output = await processMessage(v4Input)
```
6. **Replace order creation block (lines 409-434)** with `crm-mutation-tools.createOrder.execute({...idempotencyKey: \`somnio-v4-createOrder-${sessionId}-timer_L${level}\`})` (Pitfall 5 — use distinct tag per timer level).
7. Update timer-signal chaining (lines 449-481) — `V3_TIMER_DURATIONS` import becomes `V4_TIMER_DURATIONS`; same logic.
8. Export name: `v3Timer` → `v4Timer`; `v3TimerFunctions` → `v4TimerFunctions`.

**Anti-patterns (RESEARCH Pitfall 10 + Pitfall 5):**
- Do NOT keep `id: 'v3-timer'` (Inngest collision — both functions register with same id).
- Do NOT omit idempotencyKey on createOrder/addOrderNote come-back paths (Pitfall 5).
- Do NOT use the same idempotencyKey across happy/timer_L3/timer_L4 paths — distinct tags so the same session can produce 3 distinct creates if user re-engages.

---

### `src/inngest/functions/knowledge-sync-v4.ts` (Inngest post-deploy hook — partial NEW)

**Partial analog:** `src/inngest/functions/agent-timers-v3.ts` (Inngest function shape only — `inngest.createFunction({ id, name, retries }, { event }, async ({event, step}) => {...})`); semantic analog (post-deploy hook) is none in repo.

**Pattern (RESEARCH §Pattern 4, D-53):**
```typescript
import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const logger = createModuleLogger('knowledge-sync-v4')

export const knowledgeSyncV4 = inngest.createFunction(
  { id: 'knowledge-sync-v4', name: 'Somnio v4 Knowledge Sync', retries: 1 },
  { event: 'somnio-v4/knowledge.sync' },  // dispatched by Vercel deploy webhook OR manual `pnpm knowledge:sync`
  async ({ event, step }) => {
    const KB_ROOT = path.resolve(process.cwd(), 'src/lib/agents/somnio-v4/knowledge')
    const files = await step.run('list-md-files', async () => walkMdFiles(KB_ROOT))

    for (const file of files) {
      try {
        await step.run(`sync-${file}`, async () => {
          const raw = await readFile(file, 'utf8')
          await syncKbDoc(file, raw)
        })
      } catch (err) {
        // D-54: sync fail does NOT block deploy
        logger.error({ err, file }, 'KB sync failed')
        // emit observability: pipeline_decision:knowledge_sync_failed
      }
    }
  }
)
```

**Anti-patterns (D-54, RESEARCH Pitfall 7):**
- Do NOT throw on per-file failure — log + continue (D-54).
- Do NOT regenerate embeddings every run — `syncKbDoc` hashes body and skips unchanged.
- Do NOT run as a Vercel build step (RESEARCH Anti-Patterns).

---

### `src/inngest/functions/unknown-cases-cluster.ts` (Inngest nightly cron — partial NEW)

**Partial analog:** Inngest function shape from `agent-timers-v3.ts`. The cron-trigger pattern (`{ cron: '...' }`) — CLAUDE.md mentions the existing cron `crm-mutation-idempotency-cleanup` (`TZ=America/Bogota 0 3 * * *`) shipped in crm-mutation-tools standalone — that's the structural reference for cron triggers.

**Pattern (D-05):**
```typescript
import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import { clusterUnknownCases } from '@/lib/agents/somnio-v4/unknown-cases/cluster'

const logger = createModuleLogger('unknown-cases-cluster')

export const unknownCasesCluster = inngest.createFunction(
  { id: 'somnio-v4-unknown-cases-cluster', name: 'Somnio v4 Unknown Cases Clustering', retries: 1 },
  { cron: 'TZ=America/Bogota 0 4 * * *' },  // 4am Bogota daily
  async ({ step }) => {
    const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    await step.run('cluster', () => clusterUnknownCases(SOMNIO_WORKSPACE_ID))
  }
)
```

**Anti-patterns:**
- Do NOT run more frequently than nightly — clustering is not real-time critical.
- Do NOT cluster across workspaces in a single call — keep per-workspace boundaries.

---

### `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx` (admin UI — partial NEW)

**Role-match analog:** `src/app/(dashboard)/agentes/crm-tools/page.tsx` (full file, 57 lines — see above-extracted excerpt). It's a server component that calls `getActiveWorkspaceId()` and renders a client component.

**Imports pattern** (lines 14-17):
```typescript
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'
import { listPipelines } from '@/lib/domain/pipelines'
import { ConfigEditor } from './_components/ConfigEditor'
```

**Page wrapper pattern** (lines 19-57):
```typescript
export default async function CrmToolsConfigPage() {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return <div className="flex-1 overflow-y-auto p-6">...</div>
  }
  const ctx = { workspaceId, source: 'server-action' as const }
  const [config, pipelinesResult] = await Promise.all([...])
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Herramientas CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">...</p>
      </div>
      <ConfigEditor initialConfig={config} pipelines={pipelines ?? []} />
    </div>
  )
}
```

**Adaptations:**
1. Replace data-loading: instead of `getCrmQueryToolsConfig + listPipelines`, fetch unknown_cases clusters from a domain function (e.g., `getUnknownCasesClusters({ workspaceId, agentId: 'somnio-sales-v4' })`). The domain function lives in `src/lib/domain/unknown-cases.ts` (NEW — Plan-phase decides exact API).
2. Replace `<ConfigEditor>` with `<ClustersList>` and `<UnclusteredCasesList>` client components.
3. Title: "Casos sin resolver — Somnio v4" or similar.
4. Reuse the `flex-1 overflow-y-auto p-6` outer wrapper (project pattern per MEMORY.md).

**Anti-patterns:**
- Do NOT use `createAdminClient()` directly in server components (Regla 3) — go through domain layer.

---

### `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts` (server actions)

**Analog:** `src/app/(dashboard)/agentes/crm-tools/_actions.ts` (full file, ~80 lines — first 50 lines extracted above)

**Imports pattern** (lines 11-19):
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { updateCrmQueryToolsConfig, type CrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'
```

**Action pattern** (lines 32-80):
```typescript
export async function saveCrmQueryToolsConfigAction(input: SaveInput): Promise<SaveResult> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) return { success: false, error: '...' }
  const v = SaveInputSchema.safeParse(input)
  if (!v.success) return { success: false, error: '...' }
  const result = await updateCrmQueryToolsConfig({ workspaceId, source: 'server-action' as const }, v.data)
  // ...revalidatePath
  return { success: true, data: result.data }
}
```

**Adaptations:**
1. Define new actions: `promoteClusterToKb(clusterId)`, `promoteClusterToTransition(clusterId)`, `dismissCluster(clusterId)`.
2. Each action: `'use server'`, validate workspaceId from `getActiveWorkspaceId()`, validate input via Zod, delegate to domain function (`src/lib/domain/unknown-cases.ts` — NEW), `revalidatePath('/agentes/somnio-v4/unknown-cases')`.

**Anti-patterns (Regla 3):**
- Do NOT `import { createAdminClient } from '@/lib/supabase/admin'` here — go through domain layer.

---

### `src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/*.tsx` (client components — partial NEW)

**Partial analog:** `src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx` (a client form component pattern). Shape differs — v4 needs list/table + dialog, not a form, but the `'use client'` directive + server-action invocation pattern is the same.

**Recommendations:**
- `<ClusterCard cluster={...}>` — shows cluster size, top messages, "Promote to KB" / "Promote to transition" / "Dismiss" buttons.
- `<CaseRow case={...}>` — row in unclustered list.
- `<PromoteToKbDialog>` — modal where operator drafts canonical response inline (or links to git PR creation).

---

### `scripts/knowledge-sync.ts` (CLI entry — NEW)

**Analog:** none in scripts/. Existing `scripts/voice-app/` is unrelated. Pattern is a standalone tsx file that imports the lib code and runs.

**Pattern (D-55, RESEARCH §Pattern 4):**
```typescript
#!/usr/bin/env tsx
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

async function walkMdFiles(dir: string): Promise<string[]> { /* recursive .md walk */ }

async function main() {
  const KB_ROOT = path.resolve('src/lib/agents/somnio-v4/knowledge')
  const files = await walkMdFiles(KB_ROOT)
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    try {
      await syncKbDoc(file, raw)
      console.log(`[sync] ✓ ${file}`)
    } catch (err) {
      console.error(`[sync] ✗ ${file}: ${err}`)
      process.exitCode = 1
    }
  }
}
main()
```

**Add to `package.json` `scripts` block:**
```json
"knowledge:sync": "tsx scripts/knowledge-sync.ts"
```

**Anti-patterns:**
- Do NOT hardcode `OPENAI_API_KEY` — read from env (already standard for this repo per `.env.local`).

---

## Migration Patterns

### `YYYYMMDD_somnio_v4_agent_knowledge_base.sql` (DDL + pgvector + HNSW)

**Analog:** **NO IN-REPO PRECEDENT** for pgvector. Pattern source = RESEARCH §Pitfall 8 + §Pitfall 9.

**Pattern:**
```sql
-- Phase: somnio-sales-v4 (standalone)
-- agent_knowledge_base — curated knowledge with 1536-dim embedding for KB search.

CREATE EXTENSION IF NOT EXISTS vector;  -- D-Pitfall 9

CREATE TABLE agent_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (category IN ('product', 'policies', 'edge-cases', 'faqs-no-templated')),
  embedding vector(1536) NOT NULL,
  canonical_response TEXT,
  escalate_triggers TEXT[] NOT NULL DEFAULT '{}',
  related_topics TEXT[] NOT NULL DEFAULT '{}',
  source_md_path TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  last_reviewed_at DATE NOT NULL,
  reviewed_by TEXT NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  promoted_to_transition BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  CONSTRAINT agent_knowledge_base_uniq UNIQUE (topic, agent_id, workspace_id)
);

CREATE INDEX agent_knowledge_base_embedding_hnsw_idx
  ON agent_knowledge_base USING hnsw (embedding vector_cosine_ops);  -- Pitfall 8

CREATE INDEX agent_knowledge_base_workspace_agent_idx
  ON agent_knowledge_base (workspace_id, agent_id);

GRANT ALL    ON TABLE public.agent_knowledge_base TO service_role;  -- LEARNING from 20260420000443
GRANT SELECT ON TABLE public.agent_knowledge_base TO authenticated;
```

**Anti-patterns (RESEARCH Pitfall 8, 9 + LEARNING from 20260420000443):**
- Do NOT skip `CREATE EXTENSION IF NOT EXISTS vector` (Pitfall 9).
- Do NOT skip the HNSW index (Pitfall 8 — sequential scan slow at >1k rows).
- Do NOT skip GRANTs (LEARNING from `20260420000443_platform_config.sql:23-37` — Supabase Studio creates without auto-grants; service_role gets `permission denied` without explicit GRANT).

---

### `YYYYMMDD_somnio_v4_agent_unknown_cases.sql` (DDL with embedding)

**Analog:** none for vector column; structural similar to `agent_knowledge_base`.

**Pattern:**
```sql
CREATE TABLE agent_unknown_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  message TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  intent TEXT,
  confidence NUMERIC(4,3),
  knowledge_queried TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready_for_promotion', 'promoted', 'dismissed')),
  cluster_id UUID,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX agent_unknown_cases_workspace_agent_status_idx
  ON agent_unknown_cases (workspace_id, agent_id, status);
CREATE INDEX agent_unknown_cases_cluster_idx
  ON agent_unknown_cases (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX agent_unknown_cases_embedding_hnsw_idx
  ON agent_unknown_cases USING hnsw (embedding vector_cosine_ops);

-- Postgres function for clustering (called from Inngest cron)
CREATE OR REPLACE FUNCTION cluster_unknown_cases(
  p_workspace_id UUID, p_agent_id TEXT,
  p_similarity_threshold NUMERIC, p_min_cluster_size INT, p_window_days INT
) RETURNS TABLE(case_id UUID, cluster_id UUID) ...
-- (RESEARCH §Example 3 contains the SQL body)

GRANT ALL ON TABLE public.agent_unknown_cases TO service_role;
GRANT SELECT ON TABLE public.agent_unknown_cases TO authenticated;
```

---

### `YYYYMMDD_somnio_v4_platform_config.sql` (seed key-value)

**Analog:** `supabase/migrations/20260420000443_platform_config.sql` (full file, 37 lines — see above-extracted)

**Imports/structure verbatim from analog:**
```sql
INSERT INTO platform_config (key, value) VALUES
  ('somnio_v4_low_confidence_threshold', '0.70'::jsonb),  -- D-03/D-11
  ('somnio_v4_kb_sync_enabled',          'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

**Adaptations:** add v4-specific keys; reuse INSERT pattern + JSONB literal syntax (Pitfall 7 of Phase 44.1 — booleans/numbers without quotes).

**Anti-patterns (LEARNING from analog):**
- Do NOT use `'true'` (string-cast) instead of `true::jsonb` — JSONB literal syntax.
- Do NOT skip `ON CONFLICT (key) DO NOTHING` — idempotent re-runs.

---

### `YYYYMMDD_somnio_v4_template_clone.sql` (INSERT … SELECT clone of agent_templates)

**Analog:** `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` (1000+ lines — full pattern of `INSERT INTO agent_templates (...) SELECT ...` from existing rows, wrapped in `DO $$ IF NOT EXISTS ... INSERT ... END $$;` blocks per template intent).

**Header comment pattern** (lines 1-60 of pw analog):
- Document agent_id (D-13 = `'somnio-sales-v4'`).
- Document Regla 5 explicitly: "este SQL NO se aplica automaticamente. Plan XX Task 1 lo corre en prod ANTES del push de Plan XX Task 2 (que pushea todo el codigo del agente)."
- Document rollback: `DELETE FROM agent_templates WHERE agent_id = 'somnio-sales-v4';`

**Two viable patterns:**

**Pattern A — verbatim INSERT statements per template** (pw analog lines 61+):
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v4' AND intent = 'saludo' ...) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v4', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto', '...', 0),
           (gen_random_uuid(), 'somnio-sales-v4', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen', '...', 3);
  END IF;
END $$;
-- ... repeat per template
```

**Pattern B — INSERT … SELECT FROM existing v3 rows (more concise):**
```sql
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
SELECT gen_random_uuid(), 'somnio-sales-v4', workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
FROM agent_templates
WHERE agent_id = 'somnio-sales-v3'
  AND NOT EXISTS (
    SELECT 1 FROM agent_templates v4
    WHERE v4.agent_id = 'somnio-sales-v4'
      AND v4.intent = agent_templates.intent
      AND v4.visit_type = agent_templates.visit_type
      AND v4.orden = agent_templates.orden
      AND v4.workspace_id IS NOT DISTINCT FROM agent_templates.workspace_id
  );
```

**Recommendation:** Pattern B is cleaner and self-documenting (mirrors v3 verbatim). Pattern A is what pw-confirmation used (lines 60+) because pw needed to MODIFY some templates (D-11/D-12/D-14 — adapted post-purchase variants); v4 has zero modifications (D-26 = identical content), so Pattern B is appropriate. Plan-phase chooses based on auditing requirements.

**Anti-patterns (RESEARCH Pitfall 1 + lessons):**
- Do NOT panic about Meta re-approval — `agent_templates` is INTERNAL Postgres storage, not Meta HSM. Pure SQL operation (Pitfall 1).
- Do NOT skip the `IF NOT EXISTS` guard — idempotent re-runs needed for retry safety.

---

### `YYYYMMDD_somnio_v4_flip.sql` (atomic UPDATE+INSERT — partial NEW)

**Partial analog:** none for atomic flip; pattern source = RESEARCH §Example 4 (full SQL excerpt RESEARCH lines 786-828).

**Header pattern:**
```sql
-- Standalone: somnio-sales-v4
-- Run by user manually in Supabase SQL Editor when ready to flip (D-31, D-40).
-- Regla 5: this SQL does NOT auto-apply. User runs at flip-day.
-- Atomic: BEGIN/COMMIT; READ COMMITTED is sufficient (RESEARCH Pitfall 6).
```

**Pattern (D-40, RESEARCH §Example 4):**
```sql
BEGIN;

UPDATE agent_sessions
SET closed_at = timezone('America/Bogota', NOW()),
    close_reason = 'v4_flip',
    current_mode = 'closed'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;

INSERT INTO routing_rules (
  workspace_id, schema_version, rule_type, name, priority,
  conditions, event, active
) VALUES (
  'a3843b3f-c337-4836-92b5-89c58bb98490',
  'v1', 'agent_router', 'somnio-v4-flip', 1000,
  '{}'::jsonb,
  '{"agent_id": "somnio-sales-v4"}'::jsonb,
  true
);

COMMIT;
```

**Rollback (separate file or comment block):**
```sql
BEGIN;
DELETE FROM routing_rules
 WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
   AND name = 'somnio-v4-flip';
-- v3 sessions stay closed (D-39 inverse — clients on v3 again get NEW session).
COMMIT;
```

**Anti-patterns (RESEARCH Pitfall 6 + Anti-Patterns):**
- Do NOT use SERIALIZABLE — READ COMMITTED suffices because there's no read-after-write logic.
- Do NOT hard-DELETE sessions — only mark `closed_at` (consistent with project soft-delete philosophy).
- Do NOT skip the `WHERE closed_at IS NULL` filter on the UPDATE — would re-close already-closed v3 sessions and overwrite original close_reason.
- Do NOT include this SQL in the regular migration auto-apply (Regla 5 explicitly — flip is manual).
- Do NOT auto-commit in a deploy hook — user runs manually post-deploy when ready (D-31).

**Open question (RESEARCH §Open Questions item 1):** the routing rule's `priority` and `conditions` may need adjustment based on existing rules for Somnio. Plan-phase Task 1 of W7 first runs `SELECT * FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';` to inventory.

---

## Modifications to Existing Files

### `src/app/(dashboard)/agentes/routing/editor/page.tsx`

**Pattern source:** lines 25-30 of the file (current shape):
```typescript
import '@/lib/agents/somnio-recompra'
import '@/lib/agents/somnio-v3'
import '@/lib/agents/somnio'
import '@/lib/agents/godentist'
import '@/lib/agents/somnio-pw-confirmation' // Standalone: somnio-sales-v3-pw-confirmation (D-02)
```

**Adaptation:** add one line:
```typescript
import '@/lib/agents/somnio-v4' // Standalone: somnio-sales-v4 (D-13)
```

**Why:** the `agentRegistry.list()` at line 64 needs v4's config registered for the dropdown to show it.

---

### `src/lib/agents/production/webhook-processor.ts`

**Pattern source:** lines 225-231 (Promise.all pre-warm block):
```typescript
await Promise.all([
  import('../somnio-recompra'),
  import('../somnio-v3'),
  import('../somnio'),
  import('../godentist'),
  import('../somnio-pw-confirmation'), // Standalone: somnio-sales-v3-pw-confirmation (D-02)
])
```

**Adaptation:** add one line:
```typescript
import('../somnio-v4'),  // Standalone: somnio-sales-v4 (D-13)
```

**Why:** anti-B-001 cold-start LEARNING — if `routeAgent` validates `'somnio-sales-v4'` against the registry on a cold lambda, it must be already registered.

**No 2-step Inngest preload required for v4** (D-16: "Sin preload de CRM context al iniciar sesión en v4. v4 entra siempre por phase initial."). pw-confirmation has a special branch at lines 308+; v4 does NOT need that branch.

---

### `package.json`

**Adaptations:**
1. Add `"gray-matter": "^4.0.3"` to `dependencies` (RESEARCH Standard Stack — verify latest via `npm view gray-matter version` at plan-time).
2. Add `"knowledge:sync": "tsx scripts/knowledge-sync.ts"` to `scripts`.

**Anti-patterns:**
- Do NOT add additional new deps — RESEARCH Standard Stack confirms `openai`, `ai`, `@ai-sdk/anthropic`, `@anthropic-ai/sdk`, `zod` are already installed; v4 only needs gray-matter.

---

## Shared Patterns (cross-cutting)

### Self-register agent in registry

**Source:** `src/lib/agents/somnio-v3/index.ts` (full file, 17 lines) + `src/lib/agents/somnio-pw-confirmation/index.ts` (full file, 28 lines)

**Apply to:** `src/lib/agents/somnio-v4/index.ts`

**Pattern:** import `agentRegistry` + the config; call `agentRegistry.register(...)` at module scope; re-export public API.

```typescript
import { agentRegistry } from '../registry'
import { somnioV4Config } from './config'
agentRegistry.register(somnioV4Config)
export { SOMNIO_V4_AGENT_ID } from './config'
export { processMessage } from './somnio-v4-agent'
export type { V4AgentInput, V4AgentOutput } from './types'
```

---

### Observability emit pattern

**Source:** `src/lib/agents/somnio-v3/somnio-v3-agent.ts` lines 239-243, 259-268, 282-287, 299-303 (multiple `getCollector()?.recordEvent('pipeline_decision', '<phase>_<aspect>', {...})`)

**Apply to:** every major decision point in v4 — comprehension result, sub-loop trigger decision, sub-loop completion, CRM mutation invocation, CAS reject, no_match handoff.

**New event types v4 introduces (D-35, D-58, D-68):**
```typescript
'pipeline_decision:comprehension_completed'             // D-68
'pipeline_decision:subloop_low_confidence_invoked'      // D-35
'pipeline_decision:subloop_completed'                   // D-2 / D-58 family
'pipeline_decision:subloop_outcome_template'            // outcome=template
'pipeline_decision:subloop_outcome_canonical'           // outcome=canonical
'pipeline_decision:subloop_no_match_handoff'            // D-58
'pipeline_decision:handoff_low_confidence_fallback'     // D-58
'pipeline_decision:knowledge_sync_completed'            // D-53
'pipeline_decision:knowledge_sync_failed'               // D-54
'pipeline_decision:crm_mutation_*'                      // already shipped via mutation-tools (D-07)
```

**PII redaction:** every event payload that includes a message body must apply `phoneSuffix` / `emailRedact` / `bodyTruncate` from `src/lib/agents/shared/crm-mutation-tools/helpers.ts:33-55` (RESEARCH Security recommendation).

---

### Domain layer + workspace isolation

**Source:** Regla 3 (CLAUDE.md) + `src/lib/agents/shared/crm-mutation-tools/helpers.ts:33-55`

**Apply to:** every v4 file that touches DB.

**Rule:** all writes go through `@/lib/domain/*`; never `createAdminClient` directly in agent code (the only legitimate exception is `crm-writer/two-step.ts` which v4 does NOT use). For v4, the same applies — `unknown-cases/capture.ts` and `knowledge-base/sync.ts` may need to use `createAdminClient` as the LAST resort (since the table is new and no domain wrappers exist), but plan-phase should consider creating thin domain wrappers (`src/lib/domain/agent-knowledge-base.ts`, `src/lib/domain/unknown-cases.ts`) to preserve Regla 3.

**Verification command (Plan-phase test):**
```bash
grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/sub-loop/ src/lib/agents/somnio-v4/somnio-v4-agent.ts
# expect: 0 matches (only knowledge-base/sync.ts and unknown-cases/capture.ts may have direct admin client, and only if domain wrappers don't exist yet)
```

---

### Mutation idempotency (Pitfall 5)

**Source:** RESEARCH Pitfall 5 + `crm_mutation_idempotency_keys` table (shipped 2026-04-29)

**Apply to:** all `createOrder` / `addOrderNote` / `addContactNote` invocations in v4 (3 paths — happy + timer_L3 + timer_L4).

**Pattern:**
```typescript
await tools.createOrder.execute({
  /* fields */,
  idempotencyKey: `somnio-v4-createOrder-${sessionId}-${actionTag}`,  // actionTag ∈ {'happy', 'timer_L3', 'timer_L4'}
})
```

**Anti-pattern:** sharing the same `actionTag` across paths — same session can produce 3 distinct creates if user re-engages mid-flow.

---

### `stage_changed_concurrently` error contract

**Source:** crm-stage-integrity standalone (D-06 cross-agent) + `crm-mutation-tools` Pitfall 1 (CLAUDE.md)

**Apply to:** v4's `moveOrderToStage` invocation in `crm_mutation` and `cas_reject` sub-loop branches.

**Rule:** propagate verbatim; do NOT auto-retry. The sub-loop or human decides next step (D-21 trigger c — handoff humano on CAS reject).

---

## No Analog Found (genuinely new)

These files have no in-repo precedent. Planner should rely on RESEARCH.md sections cited:

| File | Pattern source |
|------|----------------|
| `sub-loop/index.ts` (AI SDK v6 generateText + Output.object) | RESEARCH §Pattern 2, §Example 2 |
| `sub-loop/nunca-decir-check.ts` (post-gen LLM compliance) | RESEARCH §Example 5 |
| `sub-loop/kb-search-tool.ts` (pgvector via tool wrapper) | RESEARCH §Pattern 2, Pitfall 8 |
| `knowledge-base/parser.ts` (gray-matter + Zod) | RESEARCH §Pattern 4, package docs |
| `knowledge-base/sync.ts` (OpenAI text-embedding-3-small + upsert) | RESEARCH §Pattern 4, OpenAI docs |
| `unknown-cases/cluster.ts` (pgvector cosine neighborhood SQL) | RESEARCH §Example 3 |
| `agent_knowledge_base` migration (pgvector + HNSW index) | RESEARCH §Pitfall 8, §Pitfall 9, Supabase pgvector docs |
| `agent_unknown_cases` migration | structurally similar to `agent_knowledge_base`; combined SQL function from RESEARCH §Example 3 |
| Atomic flip migration (UPDATE + INSERT in BEGIN/COMMIT) | RESEARCH §Example 4, §Pitfall 6 |
| `knowledge-sync-v4.ts` Inngest function | Inngest function shape from `agent-timers-v3.ts` (structural); semantic novelty |
| `unknown-cases-cluster.ts` Inngest cron | CLAUDE.md cite of `crm-mutation-idempotency-cleanup` cron pattern |
| `scripts/knowledge-sync.ts` CLI | trivial tsx wrapper |
| Knowledge `.md` corpus | net-new content; CONTEXT D-49 structure |

**For each net-new file, planner should:**
1. Cite RESEARCH section as the pattern source.
2. Add anti-pattern callouts from RESEARCH Pitfalls 1-10 + Anti-Patterns list.
3. Mark the task as "novel pattern; reviewer should validate against RESEARCH" rather than "clone of [existing file]".

---

## Key Patterns Identified

1. **Clone-and-rename mechanic** (D-24): every `somnio-v3/*.ts` file maps 1:1 to a `somnio-v4/*.ts` file via mechanical literal substitution (`SOMNIO_V3_AGENT_ID`, `V3_*` → `SOMNIO_V4_AGENT_ID`, `V4_*`). Imports from `@/lib/agents/somnio/*` (shared utilities) are preserved; imports from `@/lib/agents/somnio-v3/*` are forbidden.
2. **Hybrid orchestration**: v3's `processMessage` is preserved verbatim as the "happy path"; v4 adds a sub-loop escalation branch immediately after `comprehend()` based on `intent_confidence < threshold` (or 3 other triggers per D-02). The state-machine portions remain pure and testable in isolation.
3. **Mutations via shared modules** (D-07): v4 is the FIRST production consumer of `crm-mutation-tools` direct (not crm-writer-adapter). `createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })` factory + `idempotencyKey` per path.
4. **Self-register module pattern**: every agent has an `index.ts` that calls `agentRegistry.register(...)` at module scope; consumers (routing-editor, webhook-processor pre-warm) `import` for side-effect.
5. **Inngest function-per-agent**: `agent-timers-v4.ts` is a pure clone of `agent-timers-v3.ts` with rename of `id`, `name`, `event`, and replacement of order-creation block with `crm-mutation-tools` direct call.
6. **Migration patterns**: pre-existing `platform_config` (key/value seed), `pw-confirmation-template-catalog` (DO IF NOT EXISTS INSERT pattern). New migrations for pgvector tables introduce HNSW index + GRANTs (LEARNING from 20260420000443).
7. **AI SDK v6 sub-loop with structural anti-hallucination**: `generateText + Output.object({ schema: LoopOutcomeSchema }) + toolChoice: 'auto' + stopWhen: stepCountIs(4)`. The discriminated-union schema (with no freeText variant) STRUCTURALLY prevents hallucination (D-62).
8. **PII redaction in observability**: existing helpers (`phoneSuffix`, `emailRedact`, `bodyTruncate`) reused for new event types.
9. **Atomic flip via 2-statement BEGIN/COMMIT under READ COMMITTED**: novel pattern in repo for the routing change; safe because there's no read-after-write logic in the transaction.
10. **Knowledge stored in dual location**: `.md` in git as source of truth; `agent_knowledge_base` table with embedding generated post-deploy via Inngest. Embeddings cached by body SHA-256 hash to avoid OpenAI cost on no-change (RESEARCH Pitfall 7).

---

## Metadata

**Analog search scope:**
- `src/lib/agents/somnio-v3/` (full directory — 18 files)
- `src/lib/agents/somnio-pw-confirmation/` (full directory — 17 files; reference for "agent post-v3 patterns")
- `src/lib/agents/somnio-recompra/` (cross-reference for cited patterns in CLAUDE.md)
- `src/lib/agents/shared/crm-mutation-tools/` (factory + helpers + types)
- `src/lib/agents/shared/crm-query-tools/` (factory)
- `src/lib/agents/registry.ts` (registry singleton)
- `src/lib/agents/production/webhook-processor.ts` (routing dispatch)
- `src/inngest/functions/agent-timers-v3.ts` (timer pattern)
- `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` (Inngest 2-step pattern — referenced but not used by v4)
- `src/app/(dashboard)/agentes/crm-tools/` (UI pattern)
- `src/app/(dashboard)/agentes/routing/editor/` (modify target)
- `supabase/migrations/20260206000000_agent_templates.sql` (template schema)
- `supabase/migrations/20260420000443_platform_config.sql` (platform_config schema)
- `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` (template clone pattern)
- `supabase/migrations/20260425220000_agent_lifecycle_router.sql` (routing_rules schema, referenced)

**Files scanned:** ~80 (full reads on 12 critical analogs; targeted greps on the rest)

**Pattern extraction date:** 2026-05-01

**Status:** Ready for `/gsd-plan-phase somnio-sales-v4` — planner can write atomic tasks like "clone `somnio-v3/state.ts` to `somnio-v4/state.ts` and apply renames listed in PATTERNS.md row" without re-investigating.
