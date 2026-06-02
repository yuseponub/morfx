# System Event Separation — Context Document

## Problem Statement

System events (timer expirations) are processed through the same pipeline as user messages, requiring a **fake analysis object** with `intent: 'otro'`. This causes:

1. `'otro'` pushed to `intentsVistos` (state.ts:137) — contaminates intent history
2. `turnCount++` executes (state.ts:143) — inflates turn count (timer is not a user turn)
3. `intentInfo` in output says `intent: 'otro'` — misleading debug data
4. `isFirstVisit('otro')` in template-manager changes template selection logic for subsequent events
5. In unified-engine.ts:106-107, `'otro'` gets stored in DB as a real intent via `addIntentSeen()`

### Root Cause

`processMessage()` in `somnio-v3-agent.ts` has a linear pipeline that requires an `analysis` object (from comprehension) to proceed. When a systemEvent arrives, it fabricates a fake analysis to satisfy the pipeline:

```ts
// somnio-v3-agent.ts:56-63
if (systemEvent) {
  analysis = {
    intent: { primary: 'otro', secondary: 'ninguno', confidence: 100, reasoning: `systemEvent: ${systemEvent.type}` },
    extracted_fields: { nombre: null, apellido: null, ... },
    classification: { category: 'irrelevante', sentiment: 'neutro' },
    negations: { correo: false, telefono: false, barrio: false },
  }
}
```

This fake analysis then flows through `mergeAnalysis()` which pushes the fake intent and increments turnCount.

### Bug discovered during investigation

`retoma_datos_parciales` (L1 timer) can fire when all critical fields are filled but `barrio` is missing:
- `camposFaltantes()` only checks critical fields → returns `[]`
- But `datosExtrasOk()` requires barrio → `criticalComplete = false` → L1 stays active
- Template renders: "Para poder despachar tu producto nos faltaria:\n\nQuedamos pendientes" (empty list)

This is a separate bug from the structural issue but was discovered alongside it.

---

## Three Execution Mechanisms in the Agent

| Type | Has message? | Has intent? | Needs comprehension? | Needs mergeAnalysis? | Is user turn? |
|------|-------------|-------------|---------------------|---------------------|---------------|
| User message | Yes | Yes (real) | Yes | Yes | Yes |
| Timer expired | No | No | No | No | **No** |
| Auto-trigger | Yes (from user) | Yes (real) | Already ran | Already ran | Yes (part of turn) |

- **User messages**: Normal path. Real intent from comprehension.
- **Timer expired**: External event from sandbox/inngest. No user message, no intent, no data extraction.
- **Auto-triggers**: Generated INSIDE sales-track from `changes` during a real user message turn. The real user intent is already recorded. Auto-triggers only change the ACTION, not the intent. These are fine structurally.

---

## Agreed Solution: Option C — Discriminated Union `SalesEvent`

### 1. New type: `SalesEvent` (in types.ts)

```ts
export type SalesEvent =
  | { type: 'user_message'; intent: string; category: string; changes: StateChanges }
  | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 }
```

TypeScript discriminated union — you can't access `intent` on a timer event, compiler prevents it.

### 2. Split `processMessage` into two paths (in somnio-v3-agent.ts)

```ts
export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  if (input.systemEvent) {
    return processSystemEvent(input, input.systemEvent)
  }
  return processUserMessage(input)
}
```

**`processSystemEvent`**:
1. `deserializeState()` — restore state
2. `derivePhase()` — compute phase
3. `computeGates()` — compute gates directly from state (no changes needed)
4. `resolveSalesTrack({ phase, state, gates, event: { type: 'timer_expired', level } })` — sales track handles it
5. `resolveResponseTrack({ salesAction, state, workspaceId })` — NO intent (optional)
6. Register action with `origen: 'timer'`
7. Update `templatesMostrados`
8. **DO NOT** touch `intentsVistos`, **DO NOT** increment `turnCount`, **DO NOT** set `intentInfo`
9. Serialize and return

**`processUserMessage`** — what exists today minus the systemEvent hack:
1. Comprehension (real)
2. `mergeAnalysis()` (intent push, turnCount++, data merge)
3. Guards
4. `resolveSalesTrack({ phase, state, gates, event: { type: 'user_message', intent, category, changes } })`
5. Response track
6. Serialize and return with `intentInfo`

### 3. Update `resolveSalesTrack` interface (in sales-track.ts)

Current:
```ts
resolveSalesTrack({
  phase, intent, state, gates, changes, category, systemEvent?
})
```

New:
```ts
resolveSalesTrack({
  phase, state, gates, event: SalesEvent
})
```

Inside sales-track:
```ts
if (event.type === 'timer_expired') {
  const key = `timer_expired:${event.level}`
  const match = resolveTransition(phase, key, state, gates)
  // return early
}

// TypeScript knows event.type === 'user_message' from here
const { intent, category, changes } = event
// dataTimerSignal, auto-triggers, intent lookup, fallback (same as today)
```

### 4. Make `intent` optional in `resolveResponseTrack` (in response-track.ts)

```ts
export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent?: string          // ← optional now
  secondaryIntent?: string
  state: AgentState
  workspaceId: string
})
```

When `intent` is undefined (system events):
- Sales action templates resolve normally (lines 44-48) — unaffected
- Informational intent section (lines 55-63) — skipped (no intent to check)

### 5. Make `intentInfo` optional in `V3AgentOutput` (in types.ts)

```ts
export interface V3AgentOutput {
  // ...
  intentInfo?: {           // ← optional now
    intent: string
    confidence: number
    secondary?: string
    reasoning?: string
    timestamp: string
  }
  // ...
}
```

`intentInfo` is debug/tracking metadata — no agent logic depends on it. It's consumed by:

- **debug-v3.tsx:100** — already handles undefined: `turn.intent ? 'ok' : 'skip'`
- **unified-engine.ts:100,106,563** — already uses `?.` optional chaining
- **engine-v3.ts:77-80** — NEEDS FIX: direct access without `?.`, must wrap in conditional

### 6. Fix `engine-v3.ts` debugTurn construction

Current (line 76-81):
```ts
intent: {
  intent: output.intentInfo.intent,        // breaks if undefined
  confidence: output.intentInfo.confidence,
  ...
}
```

New:
```ts
intent: output.intentInfo ? {
  intent: output.intentInfo.intent,
  confidence: output.intentInfo.confidence,
  reasoning: output.intentInfo.reasoning,
  timestamp: output.intentInfo.timestamp,
} : undefined,
```

### 7. Bug fix: `camposFaltantes()` must include extras (in state.ts)

Current `camposFaltantes()` only checks critical fields. But `datosExtrasOk()` also requires barrio (when not negated). This creates a mismatch where L1 timer fires `retoma_datos_parciales` with an empty list.

Fix: include barrio in the missing fields list when it's not present AND not negated:

```ts
export function camposFaltantes(state: AgentState): string[] {
  const fields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
  const missing = fields.filter(f => {
    const val = state.datos[f as keyof DatosCliente]
    return !val || val.trim() === ''
  })

  // Include barrio if missing and not negated (required for datosExtrasOk)
  if (!state.ofiInter) {
    const barrioPresent = state.datos.barrio !== null && state.datos.barrio.trim() !== ''
    if (!barrioPresent && !state.negaciones.barrio) {
      missing.push('barrio')
    }
  }

  return missing
}
```

---

## Files to Modify

| File | Change | Scope |
|------|--------|-------|
| `src/lib/agents/somnio-v3/types.ts` | Add `SalesEvent` type. Make `intentInfo` optional in `V3AgentOutput` | Type only |
| `src/lib/agents/somnio-v3/somnio-v3-agent.ts` | Split into `processSystemEvent()` + `processUserMessage()`. Remove fake analysis hack | Core restructure |
| `src/lib/agents/somnio-v3/sales-track.ts` | Change input to `event: SalesEvent`. Discriminated union switch replaces `intent` + `systemEvent` params | Interface change |
| `src/lib/agents/somnio-v3/response-track.ts` | Make `intent` optional | Minor |
| `src/lib/agents/somnio-v3/engine-v3.ts` | Conditional `debugTurn.intent` construction | Minor |
| `src/lib/agents/somnio-v3/state.ts` | `camposFaltantes()` include barrio when missing + not negated | Bug fix |

## Files NOT to Modify

- `transitions.ts` — transition table unchanged, timer_expired entries work as-is
- `guards.ts` — already skipped for system events, stays skipped
- `comprehension.ts` — only called for user messages, unchanged
- `unified-engine.ts` — already handles `intentInfo?.` with optional chaining
- `debug-v3.tsx` — already handles `turn.intent` being undefined
- `sandbox-layout.tsx` — sends systemEvent the same way, no change
- `sandbox/process/route.ts` — passes systemEvent through, no change

## Verification

After changes:
1. `npx tsc --noEmit` — zero errors
2. Sandbox: send user message → intent appears in debug panel, intentsVistos updated
3. Sandbox: let timer L0/L1 expire → NO 'otro' in intentsVistos, turnCount unchanged, debug panel shows no intent (or 'skip')
4. Sandbox: let timer L1 expire with barrio missing → template shows "- Barrio" in campos_faltantes
5. `grep -c "'otro'" src/lib/agents/somnio-v3/somnio-v3-agent.ts` → only in catch block (error fallback)

## Key Decisions

- **SalesEvent discriminated union** over optional params (Option C over A/B) — TypeScript enforces correctness at compile time
- **Sales track stays the single routing point** — all events pass through it for future extensibility
- **Auto-triggers stay internal to sales-track** — they're side-effects of user message processing, not external events
- **`intentInfo` is optional, not filled with fake data** — intent is a user-message concept, system events don't have intents
- **`camposFaltantes()` includes extras** — fixes empty template when critical fields are complete but barrio is missing
