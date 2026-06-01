---
phase: v4-media-audio-image
plan: "04"
subsystem: somnio-v4-agent + engine-threading + sandbox-parity
tags: [vision, v4-only, regla6, tdd, parity, rag-grounded, dedicated-branch]
dependency_graph:
  requires: [03]   # MediaGateResult.vision_respond + ProcessMessageInput.visionContext stub (Wave 2)
  provides:
    - V4AgentInput.visionContext (additive optional field)
    - EngineInput.visionContext (additive optional field)
    - V4EngineInput.visionContext (additive optional field, engine-v4.ts)
    - dedicated vision branch in processUserMessage (somnio-v4-agent.ts:181)
    - rag:<sourceTopic> delivery via existing runner 5h-main send loop
    - sandbox parity: visionContext threaded through engine-v4 + route
    - INTERRUPTION-PARITY.md vision addendum
  affects:
    - src/lib/agents/somnio-v4/types.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/engine/types.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/engine-v4.ts
    - src/app/api/sandbox/process/route.ts
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md
tech_stack:
  added: []  # no new deps — reuse runSubLoop + existing rag: send path
  patterns:
    - "early-return branch in processUserMessage before comprehend() (D-05 dedicated)"
    - "runSubLoop(reason:'razonamiento_libre') reuse for KB grounding (RQ-1, A3)"
    - "rag:<sourceTopic> ProcessedMessage emission to output.templates (mirror resolveLowSlot:576-589)"
    - "optional additive field threading: engine/types → runner → agent (Regla 6)"
    - "sandbox parity via shared processMessage + V4EngineInput.visionContext"
    - "TDD: RED commit then GREEN commit per task (2 RED + 2 GREEN commits)"
key_files:
  created:
    - src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts   # 5 cases incl. D-05 proof
    - src/lib/agents/somnio-v4/__tests__/engine-v4-vision.test.ts # 2 parity cases
  modified:
    - src/lib/agents/somnio-v4/types.ts                # V4AgentInput.visionContext?
    - src/lib/agents/engine/types.ts                   # EngineInput.visionContext?
    - src/lib/agents/production/webhook-processor.ts   # v4 runner call threads visionContext
    - src/lib/agents/engine/v4-production-runner.ts    # v4Input.visionContext = input.visionContext
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts      # early dedicated vision branch
    - src/lib/agents/somnio-v4/engine-v4.ts            # V4EngineInput.visionContext? + thread
    - src/app/api/sandbox/process/route.ts             # body destructure + v4 call
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md  # vision branch parity addendum
decisions:
  - "Task 1 wired-reuse: rag: send path confirmed present (B1:751, B2:796, B3:839, B4:577, B5 no diff)"
  - "runSubLoop reuse chosen over direct primitives (A3 — single-sources threshold/backstop, interrupt handling automatic)"
  - "recentBotMessages hoisted above vision branch (safe: derived from input.history only)"
  - "TurnLedger.comprehension.intent='imagen' — accepted as string by TurnLedger interface"
  - "Delivery via output.templates rag: entry (not output.messages standalone) — runner delivers automatically"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-01T17:39:11Z"
  tasks_completed: 4
  files_changed: 8
  commits: 5
---

# Phase v4-media-audio-image Plan 04: Dedicated Vision Branch (Engine) Summary

Dedicated KB-grounded vision response path inside the engine: engine emits `rag:<sourceTopic>`
ProcessedMessage → runner's proven 5h-main send loop delivers it automatically.

## Task 1 Decision: `wired-reuse`

**Decision:** `wired-reuse` (proceed with Tasks 2-4 as written).

**Driving check:** B1 + B2 + B3 together confirm the delivery model:
- **B1** (`:751`) — `if (output.templates && output.templates.length > 0)` — runner sends `output.templates` in 5h-main loop.
- **B2** (`:796`) — `templatesToSend.filter(t => t.templateId.startsWith('rag:') || survivingIds.has(t.templateId))` — `rag:*` always survive no-repetition filtering.
- **B3** (`:839`) — `.filter((id): id is string => ... && !id.startsWith('rag:'))` — `rag:*` excluded from `templates_enviados`.
- **B4** (`:577`) — existing `rag:${outcome.sourceTopic}` push in `resolveLowSlot` — shape to mirror exactly.
- **B5** — `git diff 85092058` vs both files: empty (0 diff vs baseline — wiring unchanged since planning).

All 5 checks confirmed. No fallback needed.

## visionContext Threading Chain (prod + sandbox)

**Production:**
```
media-gate (vision_respond) → agent-production.ts (visionContext={descripcion,categoria})
  → processMessageWithAgent(input: ProcessMessageInput)  [webhook-processor.ts]
    ProcessMessageInput.visionContext? (Plan 03 stub, consumed here)
  → runner.processMessage(EngineInput)  [webhook-processor.ts:919]
    EngineInput.visionContext? (engine/types.ts, Plan 04)
  → v4Input: V4AgentInput = { ..., visionContext: input.visionContext }  [v4-production-runner.ts:378]
    V4AgentInput.visionContext? (somnio-v4/types.ts, Plan 04)
  → processMessage(v4Input)  → processUserMessage  → if (input.visionContext) EARLY BRANCH
```

**Sandbox:**
```
sandbox request body { visionContext: { descripcion, categoria } }
  → route.ts body destructure (src/app/api/sandbox/process/route.ts:43)
  → v4Engine.processMessage({ ..., visionContext })  [route.ts:281]
    V4EngineInput.visionContext? (engine-v4.ts, Plan 04)
  → processMessage({ ..., visionContext: input.visionContext })  [engine-v4.ts:297]
    V4AgentInput.visionContext?
  → processMessage  → processUserMessage  → if (input.visionContext) SAME EARLY BRANCH
```

Both prod and sandbox exercise the **identical branch** in `processUserMessage`.

## Vision Branch Contract

**Location:** `somnio-v4-agent.ts:181` — BEFORE `comprehend()` at `:333` (D-05).

**Decision: `runSubLoop` reuse** (not direct primitives).

**Rationale:**
- `runSubLoop(reason:'razonamiento_libre')` already applies `kb_search` + `buildGenerationPrompt` + `runGenerationCall` + `RESPONSE_CONFIDENCE_THRESHOLD` (0.70) + binary backstop — all of RQ-1 for free.
- The `interrupted_at_ckpt_` discriminator is handled inside `runSubLoop` automatically — no manual interrupt detection needed.
- Single-sources the threshold and backstop logic — no drift risk (A3).
- `ctx.userMessage = descripcion + caption` is a natural fit (same pattern as low-confidence slots).
- The sub-loop ctx is not too coupled: the fields needed (`workspaceId`, `conversationId`, `sessionId`, `userMessage`, `recentMessages`, `lockHandle/Channel/Identifier`, `stateContext`) are all available from `input`.

**Branch logic:**
1. `runSubLoop(reason:'razonamiento_libre', ctx.userMessage=descripcion+caption, onDebug)`.
2. `outcome.status === 'generated' && responseText && sourceTopic` → emit `rag:<sourceTopic>` ProcessedMessage into `output.templates` (mirror `resolveLowSlot:576-589` exactly).
3. `outcome.reason.startsWith('interrupted_at_ckpt_')` → return `success:false, errorMessage` (Path A discriminator — mirror CKPT-1 return at `:195-210`).
4. `no_match / null / error` → return `success:true, newMode:'handoff', requiresHuman:true` (D-07 informed).
5. `comprehend() / mergeAnalysis() / resolveSalesTrack() / resolveResponseTrack()` — **NEVER called** on this path (D-05 dedicated).

**Delivery:** `output.templates = [{ templateId: 'rag:<sourceTopic>', ... }]` → runner's 5h-main loop at `:751` sends it. No-rep at `:796` (rag:* always survive). Ledger exclusion at `:839` (rag:* never enter `templates_enviados`). Zero new send wiring.

## rag: Delivery Confirmation

| Check | Location | Result |
|-------|----------|--------|
| B1 send loop | v4-production-runner.ts:751 | `if (output.templates && output.templates.length > 0)` CONFIRMED |
| B2 rag:* no-rep | v4-production-runner.ts:796 | `t.templateId.startsWith('rag:')` always-survive CONFIRMED |
| B3 rag:* ledger exclusion | v4-production-runner.ts:839 | `!id.startsWith('rag:')` CONFIRMED |
| B4 existing push shape | somnio-v4-agent.ts:577 | `templateId: \`rag:${outcome.sourceTopic}\`` CONFIRMED |
| B5 no baseline drift | git diff 85092058 | empty (0 diff for both files) CONFIRMED |

## INTERRUPTION-PARITY.md Note Added

**Section added:** "Parity addendum — dedicated vision branch" (before Referencias section).

**Key points documented:**
- Vision branch lives in **shared `processMessage`** — prod and sandbox exercise identical code.
- Classifier differs (Gemini Vision in prod media-gate vs sandbox-supplied `descripcion`) — this is an allowed difference per §4 Rule 4 of INTERRUPTION-PARITY.md.
- `runSubLoop` with `simulate:true` in sandbox (D-22 parity rule — DB vs memory allowed).
- Regla 6 confirmation: all 3 visionContext fields (`?` optional), 5 non-v4 agents + interruption-system-v2 0-line-diff, CheckpointId count stays 8.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `4ec32d4b` | feat (Task 2) | Thread V4AgentInput.visionContext shared-code (prod) |
| 2 | `958eadaa` | test (RED) | Failing tests for vision branch (5 cases, RED gate) |
| 3 | `d3c9e739` | feat (GREEN) | Dedicated vision branch in somnio-v4-agent.ts |
| 4 | `a0803f9a` | test (RED) | Failing test for engine-v4 vision parity (RED gate) |
| 5 | `08f649d4` | feat (GREEN) | Sandbox parity — visionContext in engine-v4 + route + PARITY.md |

## TDD Gate Compliance

- RED gate (test): `958eadaa` (vision-branch 5 cases) + `a0803f9a` (engine-v4 parity 2 cases)
- GREEN gate (feat): `d3c9e739` (vision branch implementation) + `08f649d4` (sandbox parity)
- REFACTOR: none needed — implementation was clean on first pass

## Deviations from Plan

None — plan executed exactly as written.

**Implementation choices (within plan guidance):**
1. `runSubLoop` reuse chosen (preferred by plan, documented as the reason in SUMMARY).
2. `recentBotMessages` hoisted above the vision branch — the plan noted this explicitly ("move its computation above the branch if needed") and it was needed.
3. `TurnLedger.comprehension.intent = 'imagen'` accepted as a string — the interface is `{ intent: string; ... }` so no literal union constraint.

## Known Stubs

None. The vision branch is fully wired: media-gate classifies → `vision_respond` → `agent-production.ts` builds `visionContext` → webhook-processor threads it → engine runner threads it → `V4AgentInput.visionContext` → `processUserMessage` early branch → `runSubLoop` → `rag:` delivery.

## Threat Flags

None. No new network endpoints. The vision branch calls `runSubLoop` which calls `kbSearchTool` (existing Supabase RPC, same trust boundary as RAG path). No new trust boundaries.

## Self-Check: PASSED

- `src/lib/agents/somnio-v4/types.ts` contains `visionContext?` — FOUND
- `src/lib/agents/engine/types.ts` contains `visionContext?` — FOUND
- `src/lib/agents/production/webhook-processor.ts` contains `visionContext` (2 occurrences) — FOUND
- `src/lib/agents/engine/v4-production-runner.ts` contains `visionContext: input.visionContext` — FOUND
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` contains `if (input.visionContext)` at :181, BEFORE `comprehend()` at :333 — FOUND
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` has 2 `rag:` templateId pushes (resolveLowSlot + vision branch) — FOUND
- `src/lib/agents/somnio-v4/engine-v4.ts` contains `visionContext` (2 occurrences) — FOUND
- `src/app/api/sandbox/process/route.ts` contains `visionContext` (4 occurrences) — FOUND
- `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` has vision addendum — FOUND
- `src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts` — FOUND (5/5 tests pass)
- `src/lib/agents/somnio-v4/__tests__/engine-v4-vision.test.ts` — FOUND (2/2 tests pass)
- Commits `4ec32d4b`, `958eadaa`, `d3c9e739`, `a0803f9a`, `08f649d4` verified in git log
- `npx tsc --noEmit` — CLEAN (only 2 pre-existing errors excluded)
