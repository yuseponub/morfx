---
phase: somnio-recompra-crm-reader
plan: 02
wave: 1
status: complete
completed_at: 2026-04-21T11:15:00Z
---

# Plan 02 — Type foundations (Wave 1)

## Commits

- **Task 1:** `47c0e33` — `feat(somnio-recompra-crm-reader-02-T1): register 'recompra/preload-context' event in inngest schema`
- **Task 2:** `1403aa4` — `feat(somnio-recompra-crm-reader-02-T2): extend ReaderInput with optional abortSignal for upstream timeout control`

## Files Changed

| File | Task | Change |
|------|------|--------|
| `src/inngest/events.ts` | 1 | Added `RecompraPreloadEvents` type (+34/-2 lines) and extended `AllAgentEvents` union |
| `src/lib/agents/crm-reader/types.ts` | 2 | Added `abortSignal?: AbortSignal` to `ReaderInput` interface |
| `src/lib/agents/crm-reader/index.ts` | 2 | Passes `input.abortSignal` into `generateText({ ... })` options |

## `RecompraPreloadEvents` literal (Task 1)

```typescript
export type RecompraPreloadEvents = {
  'recompra/preload-context': {
    data: {
      sessionId: string
      contactId: string
      workspaceId: string
      invoker: 'somnio-recompra-v1'
    }
  }
}

export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents & RecompraPreloadEvents
```

- Event name: `'recompra/preload-context'` (literal, matches CONTEXT.md D-04).
- `invoker` is literal string type `'somnio-recompra-v1'` (not generic `string`) — prevents accidental cross-bot dispatch.

## `ReaderInput` final shape (Task 2)

```typescript
export interface ReaderInput {
  workspaceId: string
  messages: ReaderMessage[]
  invoker?: string
  /** Optional abort signal for upstream timeouts (e.g. 12s budget in Inngest preload function). Pitfall 5 mitigation — AI SDK v6 generateText supports abortSignal nativo. */
  abortSignal?: AbortSignal
}
```

`processReaderMessage` call site:
```typescript
const result = await generateText({
  model: anthropic(MODEL_ID),
  system: systemPrompt,
  messages,
  tools,
  stopWhen: stepCountIs(MAX_STEPS),
  temperature: 0,
  abortSignal: input.abortSignal,   // ← new, undefined for existing callers
})
```

## Type Check

```
$ npx tsc --noEmit 2>&1 | grep -E "(events\.ts|crm-reader|reader/route)"
(no output — all three touched files clean)
```

## Caller Compatibility Check

```
$ grep -rn "processReaderMessage(" src/ --include="*.ts" | grep -v "crm-reader/"
src/app/api/v1/crm-bots/reader/route.ts:169: const output = await processReaderMessage({ workspaceId, messages, invoker })
```

Existing caller at `src/app/api/v1/crm-bots/reader/route.ts:169` passes no `abortSignal` — still compiles, still runs identically. Backward compat: 100%.

## Verification — success_criteria

- [x] Plan 03 can `inngest.send({ name: 'recompra/preload-context', data: {...} })` with real type safety.
- [x] Plan 03 can instantiate `AbortController` + pass `signal` to `processReaderMessage` without Promise.race.
- [x] Event schema canonically registered (union member alongside `V3TimerEvents`, `GodentistEvents`, etc.).
- [x] **Regla 6 preserved**: zero behavior change for crm-reader in production — feature flag still `false`, no caller passes `abortSignal`, production lambdas are byte-identical.

## Next

Proceed to Wave 2 (Plan 03 — Inngest function `recompra-preload-context`: observability merge pattern, feature-flag gate, idempotency check, SessionManager write, unit tests).
