---
phase: somnio-recompra-crm-reader
plan: 05
wave: 4
status: complete
completed_at: 2026-04-21T17:36:00Z
---

# Plan 05 — Poll helper + sessionId pass-through (Wave 4)

## Commits

- **Task 1:** `354f441` — `feat(somnio-recompra-crm-reader-05-T1): thread sessionId into V3AgentInput for crm_context poll`
- **Task 2:** `d7ab29f` — `feat(somnio-recompra-crm-reader-05-T2): add pollCrmContext helper + wire into processUserMessage pre-comprehend`
- **Task 3:** `b5d0020` — `test(somnio-recompra-crm-reader-05-T3): add crm-context-poll unit test with fake timers`

## Files Changed

| File | Task | Change |
|------|------|--------|
| `src/lib/agents/somnio-recompra/types.ts` | 1 | `V3AgentInput.sessionId?: string` added |
| `src/lib/agents/somnio-v3/types.ts` | 1 | `V3AgentInput.sessionId?: string` added (plan omission fix — runner imports from here) |
| `src/lib/agents/engine/v3-production-runner.ts` | 1 | `sessionId: session.id` added to v3Input construction |
| `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` | 2 | +111 lines — `pollCrmContext` export + wire at `processUserMessage` top |
| `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` | 3 | New — 7 fake-timer unit tests |

## Key Line Numbers (post-edit)

- `pollCrmContext` export: `somnio-recompra-agent.ts:55`
- `if (input.sessionId)` wire in `processUserMessage`: `somnio-recompra-agent.ts:252`

## Locked Decisions Applied

| Decision | Value | Code |
|----------|-------|------|
| Poll timeout | `3000ms` | default arg line 60 |
| Poll interval | `500ms` | default arg line 61 |
| Max iterations | `6` (3000/500) | derived from deadline |
| Fast-path short-circuit | status in `['ok','empty','error']` → no DB hit | lines 66-76 |
| Status markers | `'ok' | 'empty' | 'error' | 'timeout'` | lines 64, 92 |
| Fast-path is silent | NO events emitted when marker was already in snapshot | `fastPathHit` guards in agent lines 253, 265, 275 |
| DB poll emits observability | `crm_context_used` (ok) / `crm_context_missing_after_wait` (timeout/error/empty) | D-16 |

## Sub-deviation — Plan 05 Task 1

Plan 05 Task 1 instructed `V3AgentInput` edit only in `src/lib/agents/somnio-recompra/types.ts`, but `v3-production-runner.ts:29` imports `V3AgentInput` from `../somnio-v3/types` (NOT `somnio-recompra/types`). Adding `sessionId: session.id` to the v3Input literal failed tsc:

```
src/lib/agents/engine/v3-production-runner.ts(116,9): error TS2353: Object literal may only specify known properties, and 'sessionId' does not exist in type 'V3AgentInput'.
```

Fix: added the same optional `sessionId?: string` to `src/lib/agents/somnio-v3/types.ts` `V3AgentInput`. Both interfaces now stay structurally aligned; the runner and each agent module (somnio-recompra, godentist) agree on the shape. godentist/types.ts `V3AgentInput` intentionally left alone — it compiles, and godentist doesn't consume sessionId yet.

## Test Run (Task 3)

```
$ npm run test -- src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts

 RUN  v1.6.1 /mnt/c/Users/Usuario/Proyectos/morfx-new

 ✓ src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts  (7 tests) 31ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  27.82s
```

Test branches:
1. fast-path ok
2. fast-path error
3. fast-path empty
4. poll-path: status=ok on 2nd iteration
5. poll-path: timeout after 3000ms (>=6 iterations)
6. poll-path: status=error on 1st iteration → short-circuit
7. poll-path: swallow transient getState errors until timeout

## Verification — success_criteria

- [x] Sandbox / tests without sessionId: guard skips poll → behavior identical to pre-phase.
- [x] Production with flag=false: poll will always time out (Inngest function never writes marker because defense-in-depth check early-returns) → emits `crm_context_missing_after_wait` once per turn. No functional impact — comprehension (Plan 06) still gated by status=ok.
- [x] Production with flag=true (Plan 07): dispatch + function typically complete before turn 1+ → fast-path wins → zero DB polls.
- [x] Regla 6: zero observable change in production until Plan 06 injects crm_context into the prompt AND Plan 07 flips flag.

## Push Status

Not pushed yet — batched with Plan 06 (comprehension inject) so both ship together. Plan 06 is small (2 files); push happens at end of Wave 4.

## Next

Proceed to **Plan 06** — inject `_v3:crm_context` into `buildSystemPrompt` of `comprehension-prompt.ts` conditional on `status === 'ok'`, and filter `_v3:*` keys from the `DATOS YA CAPTURADOS` JSON dump.
