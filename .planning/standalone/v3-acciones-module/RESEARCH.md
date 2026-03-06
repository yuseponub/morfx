# Standalone: Bot v3 State Machine Migration - Research

**Researched:** 2026-03-06
**Domain:** Internal refactor of Somnio v3 decision engine (waterfall -> state machine)
**Confidence:** HIGH (all source code read directly)

## Summary

This research covers the complete codebase analysis needed to migrate the Somnio v3 bot from a priority-ordered waterfall decision engine (R0-R9) to a state machine based on actions and system events. All decisions (D1-D8) are resolved in ANALYSIS.md.

The current codebase has 14 files in `src/lib/agents/somnio-v3/`, with the decision engine in `decision.ts`, state management in `state.ts`, ingest logic in `ingest.ts`, and the main pipeline in `somnio-v3-agent.ts`. The v3 agent runs in sandbox via `SomnioV3Engine` (engine-v3.ts) and does NOT run in production yet (no path through UnifiedEngine for v3). Production still uses v1 via `SomnioAgent` + `UnifiedEngine`.

The migration is internal to the v3 module. Since v3 is sandbox-only, changes do not affect production. However, the architecture must remain compatible with the `V3AgentInput`/`V3AgentOutput` interface so that the sandbox API route and the future production adapter continue to work.

**Primary recommendation:** Refactor incrementally within the v3 module boundary. Since v3 is sandbox-only, no feature flag is needed for the state machine migration itself. The existing `agentId === 'somnio-sales-v3'` check in the sandbox API route already isolates v3 from production.

## Standard Stack

No new libraries needed. This is a pure internal refactor using TypeScript.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | strict | Type-safe state machine types | Already in use |
| None (custom) | N/A | State machine is hand-built with typed transition table | Simple enough (6 phases, ~10 transitions) that XState or similar would be overkill |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-built transition table | XState | XState adds dependency + learning curve for a simple 6-phase machine. The transition table is ~30 lines of declarative config |

## Architecture Patterns

### Current File Structure (somnio-v3/)
```
src/lib/agents/somnio-v3/
  comprehension.ts        # C2: Claude Haiku call (unchanged)
  comprehension-prompt.ts # System prompt for Haiku (unchanged)
  comprehension-schema.ts # Zod schema for analysis (unchanged)
  config.ts               # Agent registry config (update states)
  constants.ts            # Intent categories, fields, prices (add action types)
  decision.ts             # C6: R0-R9 waterfall (REWRITE -> transition table lookup)
  engine-adapter.ts       # V3 -> UnifiedEngine adapter (unchanged)
  engine-v3.ts            # Sandbox engine wrapper (update forceIntent -> systemEvent)
  index.ts                # Module entry point (unchanged)
  ingest.ts               # C4: Silent accumulation + auto-triggers (refactor: emit system events)
  response.ts             # C7: Template composition (remove mostradoUpdates)
  somnio-v3-agent.ts      # Main pipeline orchestrator (refactor: single action registration)
  state.ts                # C3+C5: State merge + gates (add phase derivation)
  types.ts                # Type definitions (add AccionRegistrada, Phase, SystemEvent)
```

### New Files
```
src/lib/agents/somnio-v3/
  guards.ts               # Cross-cutting guards (R0 low confidence, R1 escape)
  transitions.ts          # Declarative transition table
  phase.ts                # derivePhase() from accionesEjecutadas
```

### Pattern 1: Declarative Transition Table
**What:** Replace 13 if/else rules with a lookup table of (phase, intent/event) -> action
**When to use:** When the decision logic is deterministic and based on discrete states

```typescript
// transitions.ts
interface TransitionEntry {
  phase: Phase | '*'        // '*' = any phase
  on: string                // intent name or system event type
  action: TipoAccion
  condition?: (state: AgentState, gates: Gates) => boolean  // optional guard within transition
}

const TRANSITIONS: TransitionEntry[] = [
  // ANY-phase transitions (guards handle escape/lowconf separately)
  { phase: '*', on: 'no_interesa',   action: 'no_interesa' },
  { phase: '*', on: 'rechazar',      action: 'rechazar' },
  { phase: '*', on: 'acknowledgment', action: 'silence' },

  // Phase-specific
  { phase: 'initial',        on: 'quiero_comprar',  action: 'pedir_datos' },
  { phase: 'capturing_data', on: 'ingest_complete',  action: 'ofrecer_promos' },  // condition: !pack
  { phase: 'capturing_data', on: 'ingest_complete',  action: 'mostrar_confirmacion' },  // condition: +pack
  { phase: 'promos_shown',   on: 'seleccion_pack',   action: 'mostrar_confirmacion' },
  { phase: 'confirming',     on: 'confirmar',        action: 'crear_orden' },
  // ... etc
]
```

### Pattern 2: Phase Derivation from Action History
**What:** Derive current phase from the last significant action instead of storing mode separately
**When to use:** When phase is a function of action history, not an independent variable

```typescript
// phase.ts
const SIGNIFICANT_ACTIONS: Set<TipoAccion> = new Set([
  'pedir_datos', 'ofrecer_promos', 'mostrar_confirmacion',
  'crear_orden', 'handoff', 'rechazar', 'no_interesa'
])

function derivePhase(acciones: AccionRegistrada[]): Phase {
  // Walk backwards through actions to find last significant one
  for (let i = acciones.length - 1; i >= 0; i--) {
    const a = acciones[i]
    if (!SIGNIFICANT_ACTIONS.has(a.tipo)) continue
    switch (a.tipo) {
      case 'pedir_datos':            return 'capturing_data'
      case 'ofrecer_promos':         return 'promos_shown'
      case 'mostrar_confirmacion':   return 'confirming'
      case 'crear_orden':            return 'order_created'
      case 'handoff':
      case 'rechazar':
      case 'no_interesa':            return 'closed'
    }
  }
  return 'initial'
}
```

### Pattern 3: System Events Replace forceIntent
**What:** Timer and ingest emit typed system events instead of fake intents
**When to use:** When external signals need to trigger the same decision engine as client messages

```typescript
// types.ts additions
type SystemEvent =
  | { type: 'timer_expired'; level: 2 | 3 | 4 }
  | { type: 'ingest_complete'; result: 'datos_completos' | 'ciudad_sin_direccion' }
  | { type: 'readiness_check'; ready_for: 'promos' | 'confirmacion' }

// The pipeline checks: is this a SystemEvent or a client message?
// Both go through the same transition table
```

### Pattern 4: Single Action Registration Point
**What:** All action writes happen in ONE place after response composition succeeds
**When to use:** Always (replaces current 3 write points)

Currently there are 3 write points:
1. **somnio-v3-agent.ts lines 148-155**: Pre-compose, writes `ofrecer_promos` / `mostrar_confirmacion` based on templateIntents
2. **response.ts lines 138-149**: `mostradoUpdates` array returned from composeResponse
3. **somnio-v3-agent.ts lines 234-237**: Post-compose, pushes mostradoUpdates into accionesEjecutadas

New pattern: decision engine returns the action type. After successful response composition, the pipeline registers exactly that action with metadata.

### Anti-Patterns to Avoid
- **Storing phase as separate field:** Phase MUST be derived from actions. Storing it creates sync issues.
- **Guards inside transition table entries:** Keep guards (R0, R1) separate from the table. They run BEFORE phase derivation.
- **Multiple action registration points:** The entire point of D3 is ONE write point. Never add "convenience" writes elsewhere.
- **Mixing intent names with system event names:** Use a discriminated union. Never use string `'ofrecer_promos'` as both an intent and a system event.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State machine library | XState integration | Simple typed transition table | Only 6 phases, ~15 transitions. Library is overkill |
| Action deduplication | Custom dedup logic | `AccionRegistrada[]` is append-only, helpers check existence | Append-only is simpler to reason about |
| Phase persistence | Storing phase in DB | `derivePhase(acciones)` every turn | Derived data should not be stored |

## Common Pitfalls

### Pitfall 1: Breaking the V3AgentOutput Interface
**What goes wrong:** Changing internal types breaks the sandbox API route or engine-v3.ts
**Why it happens:** V3AgentOutput is the contract between v3 internals and external consumers
**How to avoid:** V3AgentInput and V3AgentOutput interfaces must remain backward-compatible. Internal changes (AccionRegistrada, Phase, SystemEvent) are internal to the pipeline. The serialization in `serializeState()` must produce the same `datosCapturados` format so existing sandbox sessions don't break.
**Warning signs:** TypeScript errors in engine-v3.ts, engine-adapter.ts, or sandbox API route

### Pitfall 2: Losing the 3 forceIntent Values
**What goes wrong:** Timer calls fail because the new engine doesn't understand old forceIntent strings
**Why it happens:** sandbox-layout.tsx sends `forceIntent: 'ofrecer_promos'`, `'timer_sinpack'`, `'timer_pendiente'` directly
**How to avoid:** Two options: (a) Add a translation layer in V3AgentInput that maps old forceIntent strings to SystemEvent objects, or (b) Update sandbox-layout.tsx and engine-v3.ts simultaneously to send SystemEvent instead.
**Warning signs:** Timer levels 2/3/4 stop working in sandbox

### Pitfall 3: Ingest Auto-Triggers Conflicting with Transition Table
**What goes wrong:** Ingest emits `ofrecer_promos` auto-trigger AND the transition table also matches, causing double action registration
**Why it happens:** Currently ingest returns `autoTrigger` which decision.ts checks BEFORE R0-R9. In the new model, ingest emits a system event that goes through the transition table.
**How to avoid:** Ingest MUST NOT return `autoTrigger` anymore. It must emit a system event (`readiness_check` or `ingest_complete`) that the transition table handles like any other input.
**Warning signs:** Duplicate entries in accionesEjecutadas

### Pitfall 4: Acknowledgment Exception Logic
**What goes wrong:** R3 (acknowledgment -> silence) has TWO exceptions that are context-dependent:
1. Positive ack after promos shown + no pack -> fall through to R9
2. Positive ack after resumen shown -> treat as confirmation
**Why it happens:** These are phase-dependent behaviors disguised as a single rule
**How to avoid:** In the transition table, handle ack differently per phase:
- `{ phase: 'promos_shown', on: 'acknowledgment', action: 'fallback' }` (keep conversation going)
- `{ phase: 'confirming', on: 'acknowledgment_positive', action: 'crear_orden' }`
- `{ phase: '*', on: 'acknowledgment', action: 'silence' }` (default)
**Warning signs:** Bot goes silent after customer says "ok" to the resumen

### Pitfall 5: computeMode Removal Breaking State Persistence
**What goes wrong:** Removing computeMode() breaks the `newMode` field in V3AgentOutput, which sandbox-layout.tsx uses for timer level management
**Why it happens:** computeMode maps internal state to string modes. Sandbox timer simulator reads `currentMode` to know which timer level to start.
**How to avoid:** Keep computeMode() as a compatibility layer that maps the new Phase to old mode strings. Or update sandbox-layout.tsx to read phase directly. Phased approach: first migration keeps computeMode(), second migration removes it after sandbox-layout is updated.
**Warning signs:** Sandbox timer stops chaining levels correctly

### Pitfall 6: Serialization Format Change Breaking Existing Sessions
**What goes wrong:** Changing `accionesEjecutadas` from `string[]` to `AccionRegistrada[]` breaks deserialization of existing sessions
**Why it happens:** State is JSON-stringified in `_v3:accionesEjecutadas` within datosCapturados
**How to avoid:** Deserialize must handle BOTH formats: if the parsed value is a string array (old format), convert each string to `{ tipo: string, turno: 0, origen: 'bot' }`. If it's an object array (new format), use as-is.
**Warning signs:** Agent crashes on first message of an existing conversation

## Code Examples

### Example 1: Current 3 Write Points for accionesEjecutadas

**Write point 1 - somnio-v3-agent.ts lines 147-156 (pre-compose):**
```typescript
// Track action
if (decision.action === 'respond' && decision.templateIntents) {
  for (const ti of decision.templateIntents) {
    if (ti === 'promociones' || ti === 'quiero_comprar') {
      mergedState.accionesEjecutadas.push('ofrecer_promos')
    }
    if (ti.startsWith('resumen')) {
      mergedState.accionesEjecutadas.push('mostrar_confirmacion')
    }
  }
}
```

**Write point 2 - response.ts lines 138-149 (mostradoUpdates returned):**
```typescript
const mostradoUpdates: string[] = []
for (const v3Intent of templateIntents) {
  if (v3Intent === 'promociones' || v3Intent === 'quiero_comprar') {
    mostradoUpdates.push('ofrecer_promos')
  }
  if (v3Intent.startsWith('resumen')) {
    mostradoUpdates.push('mostrar_confirmacion')
  }
  if (v3Intent === 'pedir_datos') {
    mostradoUpdates.push('pedir_datos')
  }
}
```

**Write point 3 - somnio-v3-agent.ts lines 234-237 (post-compose):**
```typescript
for (const action of responseResult.mostradoUpdates) {
  if (!mergedState.accionesEjecutadas.includes(action)) {
    mergedState.accionesEjecutadas.push(action)
  }
}
```

### Example 2: Current Read Points for accionesEjecutadas

| File | Function | What it reads | Line |
|------|----------|---------------|------|
| decision.ts | `hasShownPromos()` | `accionesEjecutadas.includes('ofrecer_promos')` | 278 |
| decision.ts | `hasShownResumen()` | `accionesEjecutadas.includes('mostrar_confirmacion')` | 283 |
| ingest.ts | `promosMostradas()` | `accionesEjecutadas.includes('ofrecer_promos')` | 177 |
| somnio-v3-agent.ts | `computeMode()` | `includes('crear_orden')`, `includes('mostrar_confirmacion')`, `includes('ofrecer_promos')` | 320-322 |

### Example 3: forceIntent Usage Map

| Source | Where | forceIntent value | Maps to SystemEvent |
|--------|-------|-------------------|---------------------|
| sandbox-layout.tsx L191 | Timer L2 expire | `'ofrecer_promos'` | `{ type: 'timer_expired', level: 2 }` |
| sandbox-layout.tsx L254 | Timer L3 expire | `'timer_sinpack'` | `{ type: 'timer_expired', level: 3 }` |
| sandbox-layout.tsx L254 | Timer L4 expire | `'timer_pendiente'` | `{ type: 'timer_expired', level: 4 }` |
| agent-timers.ts L207 | Production L2 | `action.targetMode` (= `'ofrecer_promos'`) | `{ type: 'timer_expired', level: 2 }` |
| agent-timers.ts L221 | Production L3 | `'timer_sinpack'` | `{ type: 'timer_expired', level: 3 }` |
| agent-timers.ts L221 | Production L4 | `'timer_pendiente'` | `{ type: 'timer_expired', level: 4 }` |
| somnio-v3-agent.ts L53-76 | Pipeline entry | Any forceIntent | Skips comprehension, creates synthetic analysis |

### Example 4: State Serialization Format

**Current format in datosCapturados:**
```json
{
  "nombre": "Juan",
  "ciudad": "Bogota",
  "_v3:ofiInter": "false",
  "_v3:enCaptura": "true",
  "_v3:turnCount": "5",
  "_v3:accionesEjecutadas": "[\"ofrecer_promos\",\"mostrar_confirmacion\"]",
  "_v3:templatesMostrados": "[\"tpl-1\",\"tpl-2\"]",
  "_v3:neg_correo": "true"
}
```

**New format (accionesEjecutadas only changes):**
```json
{
  "_v3:accionesEjecutadas": "[{\"tipo\":\"pedir_datos\",\"turno\":1,\"origen\":\"bot\"},{\"tipo\":\"ofrecer_promos\",\"turno\":3,\"origen\":\"ingest\"}]"
}
```

### Example 5: How Ingest Currently Communicates Auto-Triggers

```typescript
// ingest.ts returns IngestResult with autoTrigger
return {
  action: 'respond',
  autoTrigger: 'ofrecer_promos',  // <-- this field
  timerSignal: { type: 'cancel', reason: 'datos completos -> promos' },
}

// decision.ts checks autoTrigger BEFORE any rules
if (ingestResult.autoTrigger === 'ofrecer_promos') {
  return { action: 'respond', templateIntents: ['promociones'], ... }
}
```

**New model:** Ingest returns a SystemEvent. Pipeline routes it to transition table.

### Example 6: Feature Flag Pattern (existing)

```typescript
// Environment variable checked at runtime
const useInngest = process.env.USE_INNGEST_PROCESSING === 'true'
if (process.env.USE_NO_REPETITION === 'true') { ... }
```

No feature flag needed for this migration since v3 is sandbox-only. The `agentId === 'somnio-sales-v3'` check in `src/app/api/sandbox/process/route.ts` line 95 already isolates v3.

## Key Findings: Dependency Map

### Files that MUST change (internal v3 module)
| File | Change | Risk |
|------|--------|------|
| `types.ts` | Add `AccionRegistrada`, `TipoAccion`, `Phase`, `SystemEvent`. Change `accionesEjecutadas: string[]` to `AccionRegistrada[]` | LOW - additive |
| `decision.ts` | FULL REWRITE: transition table lookup replaces R0-R9 | MEDIUM - core logic |
| `somnio-v3-agent.ts` | Remove 2 write points, add single registration after compose, replace computeMode with derivePhase, handle SystemEvent input | MEDIUM - orchestrator |
| `response.ts` | Remove `mostradoUpdates` from `ResponseResult` | LOW - just removal |
| `ingest.ts` | Replace `autoTrigger` with SystemEvent emission, add readiness checks | MEDIUM - behavior change |
| `state.ts` | Update serialize/deserialize for AccionRegistrada[], add backward compat | LOW - serialization |
| `constants.ts` | Add `TIPO_ACCION` array, transition table entries | LOW - additive |

### New files
| File | Purpose |
|------|---------|
| `guards.ts` | R0 (low confidence + otro -> handoff) and R1 (escape intents -> handoff) |
| `transitions.ts` | Declarative transition table: `(phase, on) -> action` |
| `phase.ts` | `derivePhase(acciones: AccionRegistrada[]): Phase` |

### Files that MAY change (outside v3 module)
| File | Change | When |
|------|--------|------|
| `engine-v3.ts` | Map `forceIntent` string to `SystemEvent` before passing to processMessage | If V3AgentInput changes |
| `sandbox-layout.tsx` | Update forceIntent calls to use SystemEvent | Optional - can translate in engine-v3.ts |
| `agent-timers.ts` | Not needed now (production doesn't use v3 yet) | Future |

### Files that MUST NOT change
| File | Why |
|------|-----|
| `comprehension.ts`, `comprehension-prompt.ts`, `comprehension-schema.ts` | C2 layer is independent |
| `engine-adapter.ts` | Production adapter, v3 not in production yet |
| `config.ts` | States list can update later when v3 goes to production |

## Open Questions

1. **V3AgentInput.forceIntent backward compatibility**
   - What we know: sandbox-layout.tsx sends forceIntent as a string. engine-v3.ts passes it through.
   - What's unclear: Should we change V3AgentInput to accept `SystemEvent | undefined` instead of `forceIntent?: string`, or add a translation layer?
   - Recommendation: Add `systemEvent?: SystemEvent` to V3AgentInput, keep `forceIntent?: string` for backward compat, translate in processMessage(). Remove forceIntent in a later cleanup.

2. **Ingest "readiness_check" timing**
   - What we know: Currently ingest runs ONCE per turn, checks datosOk, and returns autoTrigger inline.
   - What's unclear: With the new model where ingest emits a SystemEvent, does the pipeline need a second pass through the transition table within the same turn?
   - Recommendation: Yes. After ingest evaluates, if it returns a SystemEvent, the pipeline runs the transition table AGAIN with that event as input. This replaces the current `autoTrigger` shortcut in decision.ts.

3. **Production deployment path**
   - What we know: v3 is sandbox-only. Production uses v1 through UnifiedEngine + SomnioAgent.
   - What's unclear: When v3 goes to production, will it use the existing UnifiedEngine or a new path?
   - Recommendation: Out of scope for this migration. The engine-adapter.ts already exists for future production use. Focus on getting the state machine right in sandbox first.

## Sources

### Primary (HIGH confidence)
- Direct codebase reading of all 14 files in `src/lib/agents/somnio-v3/`
- Direct codebase reading of `sandbox-layout.tsx`, `agent-timers.ts`, `unified-engine.ts`, `sandbox-engine.ts`
- `ANALYSIS.md` with all 8 decisions (D1-D8) resolved

### Secondary (MEDIUM confidence)
- N/A (no external sources needed - this is internal refactor research)

### Tertiary (LOW confidence)
- N/A

## Metadata

**Confidence breakdown:**
- Current code structure: HIGH - all source files read directly
- forceIntent usage: HIGH - all 10 files with forceIntent traced
- Action registration points: HIGH - all 3 write points and 4 read points identified
- Ingest flow: HIGH - evaluateIngest fully traced
- Serialization format: HIGH - serialize/deserialize functions fully analyzed
- Transition table design: HIGH - directly derived from existing R0-R9 rules
- Sandbox/production isolation: HIGH - confirmed v3 is sandbox-only

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable - internal code, no external dependencies)
