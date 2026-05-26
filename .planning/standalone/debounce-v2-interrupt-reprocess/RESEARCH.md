# Standalone: debounce-v2-interrupt-reprocess — RESEARCH.md

**Researched:** 2026-05-26
**Domain:** v4 runtime control-flow refactor — convert silent-persist-on-interrupt into in-lambda restart loop
**Confidence:** HIGH (the lock primitives + 8 checkpoint sites are already shipped & tested; this standalone restructures the CALLERS of `checkpoint()` only — zero changes to primitive contracts)
**Mode:** implementation (no new architectural decisions; 9 D-XX in DISCUSSION-LOG.md are locked)

---

## Summary

The parent standalone `debounce-interruption-system-v2` shipped the lock + 14-label observability + 8 checkpoint sites correctly, but inherited Phase 31's "silent mute" semantics at each interrupt-detection site. Today, when CKPT-0/1/2/3/4/5/6a/6b detects `interrupted=true` AND `actuallySentIds.length === 0`, the holder persists the combined message to `_v3:pendingUserMessage` and returns `{ success: true/false, messages: [], messagesSent: 0 }` — the bot stays mute until a 3rd inbound message (or L1/L2 timer) drains the pending. This is wrong by design: the lambda is still alive, the lock is still held, the lock heartbeat is still renewing — the lambda should drain pending + combine + re-process IN THE SAME LAMBDA.

This standalone implements the restart loop at the RUNNER level (D-04) — wrapping `V4ProductionRunner.processMessage`'s main body in a `while (shouldRestart)` outer loop. The agent + sub-loop continue to return their existing `errorMessage: 'interrupted_at_ckpt_N'` discriminator (zero change to their signal contract); the runner adds a discriminator detector that translates "agent returned interrupted_at_ckpt" into "drain pending + combine + continue outer loop". The runner's existing in-line CKPT-0/6a/6b sites are also restructured to `continue` instead of `return`.

Path B (already-sent ≥1 template) is preserved verbatim from current behavior (D-01 + D-05) — the send loop CKPT-7.N + the CKPT-6b sentCount>0 branch still abort silently, save pending_templates if mid-template, and exit. Restart loop does NOT activate inside the send loop because rebooting after a partial send would re-send templates the customer already saw.

**Primary recommendation:** Plan 1 (runner restart loop scaffolding + CKPT-0/6a/6b restart wiring + Regla 6 grep gates), Plan 2 (agent + sub-loop discriminator typing — additive Path A interrupted return shape, zero behavioral change), Plan 3 (vitest S1..S5 scenarios + Regla 6 byte-identity test for v3 path), Plan 4 (LEARNINGS.md + executable diff verification).

---

## User Constraints (from DISCUSSION-LOG.md)

### Locked Decisions (D-01..D-09)

- **D-01 Path B scope:** When `actuallySentIds.length > 0` and interrupt detected with pending non-empty → restart processes `pending` ONLY (msg2+msg3+...), NOT msg1. msg1 stays "closed partial" because its templates were already sent.
- **D-02 Re-comprehension always fresh:** Each restart iteration runs a NEW Haiku/comprehension call with the combined `effectiveMessage`. Never reuse comprehension from prior iteration.
- **D-03 No restart cap, no timeout:** Trust natural quiescence (when customer stops typing, next CKPT shows no interrupt → lambda completes). Lock TTL 45s + heartbeat 5s keeps the lambda alive indefinitely (Inngest step.run cap is 15min — well within tolerance). If runaway cases happen in prod, re-evaluate cap in v2.1.
- **D-04 Same lambda, same lock:** Restart loop runs INSIDE the holder's current lambda. NO Inngest re-dispatch. Lock + heartbeat already provide exclusion.
- **D-05 Triggers = all CKPTs 0..6:** CKPT-0/1/2/3/4/5/6a/6b on interrupt → restart. CKPT-7.N (send loop, per-template) does NOT trigger restart (D-01 reason: would re-send sent templates).
- **D-06 Scope = v4 only:** Identical gate as parent standalone — `if (input.lockHandle && input.lockChannel && input.lockIdentifier)`. v3/godentist/recompra/pw-confirmation runners stay byte-identical (Regla 6).
- **D-07 No feature flag:** Default behavior when v4 path is active (v4 dormant in prod = zero rollout risk).
- **D-08 No DB migration:** Pure control-flow change. `_v3:pendingUserMessage` key stays in datos_capturados for v3 compat but its semantics in v4 change (only legacy v3 sessions migrated to v4 would still see it; new v4 sessions effectively never write it).
- **D-09 Tests:** 5 vitest scenarios (S1 happy, S2 Path A restart 1x, S3 Path A restart 2x, S4 Path B no-restart, S5 Regla 6 v3 byte-identity).

### Claude's Discretion (resolved by this research)
- Boundary of the restart loop: **runner-level outer `while`** (Q1 below — locked here as **research conclusion R-01**).
- State reset semantics on restart: **resnap the runner's input snapshot** (Q2/Q3 — locked here as **R-02, R-03**).
- Discriminator contract: **reuse existing `errorMessage: 'interrupted_at_ckpt_*'` from agent + extend with sub-loop's `reason: 'interrupted_at_ckpt_*'` LoopOutcome shape that the agent already maps to `errorMessage`** (Q4 — locked as **R-04**).

### Deferred Ideas (OUT OF SCOPE)
- Sandbox UI integration (deferred to sibling `debounce-v2-sandbox-integration` per DISCUSSION-LOG.md "Out of scope" section).
- v2.1 restart cap (D-03 explicitly: re-evaluate if runaway prod cases).
- AbortController-style mid-LLM-call cancellation (D-13 parent — discrete checkpoints only).
- v3/godentist/recompra/pw-confirmation migration (D-06 — per-agent follow-up standalones).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Restart loop control flow | **V4ProductionRunner.processMessage** | — | Owns the `lockHandle` lifecycle (acquire→heartbeat→release in `finally`) and the I/O boundaries. The agent + sub-loop should remain pure(-ish) processors that return discriminator outcomes; the runner is the one place where "drain pending + re-prepare V4AgentInput + restart" is coherent. |
| Interrupt signal emission | `checkpoint()` helper (interruption-system-v2) | — | UNTOUCHED. Returns `{ proceed: false, interrupted: {...} }` exactly as today. |
| Path A discriminator from agent | `somnio-v4-agent.ts` `processUserMessage` | — | Already returns `errorMessage: 'interrupted_at_ckpt_N_*'` — runner needs to start CONSUMING this signal (today runner ignores it). |
| Path A discriminator from sub-loop | `sub-loop/index.ts` `runRagSubLoop` / `runLegacySubLoop` | — | Already returns LoopOutcome with `reason: 'interrupted_at_ckpt_*'`. Agent's `mapOutcomeToAgentOutput` needs a thin extension to propagate this as `errorMessage` upward (today the LoopOutcome with that reason becomes a `no_match` handoff, which silently mute-handoffs — a SECOND bug surfaced by this research). |
| Pending list drain + combine | `readAndClearPending()` (interruption-system-v2) called from runner | — | UNTOUCHED helper. Runner calls it once per restart iteration. |
| State snapshot for restart | Runner local vars `inputIntentsVistos / inputTemplatesEnviados / inputDatosCapturados` | — | Already snapshotted at runner step 3 BEFORE any pipeline mutation. Restart iteration consumes the snapshot, not the post-iteration accumulated state (R-02). |
| Token accounting | `output.totalTokens` accumulated across iterations | — | Per-iteration agent calls each report their own tokens; runner sums them into an outer counter (R-05 below). |
| Observability per restart | `emitLockEvent('msg_aborted_path_a_combined', { restart_iteration: N, ... })` | — | Same 14-label union. Payload gets a new `restart_iteration` field (Record<string, unknown> allows extension; no LockEventLabel union change needed). |
| Lock lifecycle (acquire / heartbeat / release) | V4ProductionRunner outer scope (UNCHANGED) | — | The restart loop nests INSIDE the existing try/finally. Heartbeat keeps running; release happens once at finally regardless of iteration count. |

---

## Standard Stack

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/redis` | shipped already | Lock + pending list ops | UNCHANGED. Restart loop consumes existing primitives. |
| vitest | shipped already | Unit + e2e scenario tests | UNCHANGED. Add 5 new tests to existing suites; same mock-redis helper pattern. |

**No new dependencies. No new env vars. No new migrations.**

---

## Architecture Patterns

### Pattern R-01 (locked here): Runner-level outer `while` loop

**What:** Wrap `V4ProductionRunner.processMessage`'s body (from step 1 "Get session" through "Return EngineOutput") in a `while (shouldRestart)` loop. Initialize `shouldRestart = true` to enter once; set `shouldRestart = false` at top of each iteration. Each CKPT detection site (CKPT-0 inline + CKPT-6a inline + CKPT-6b inline + agent return-discriminator + sub-loop return-discriminator surfaced via agent) sets `shouldRestart = true; continue` on interrupt.

**When to use:** ANY Path A interrupt (CKPT-0..6 with `actuallySentIds.length === 0`, OR CKPT-6b with `sentCount > 0` but per D-01 this is Path B — handled distinctly).

**Why runner-level (vs agent-level loop):**
1. Runner owns `readAndClearPending` calls (already in CKPT-0/6a/6b sites today) — agent doesn't have direct access to Redis primitives via its inputs (agent only has `lockHandle`/`lockChannel`/`lockIdentifier`, not the helper imports — and exposing those would couple the agent module to interruption-system-v2 beyond what's already there).
2. Runner owns the session state snapshot vars (`inputIntentsVistos`, `inputTemplatesEnviados`, `inputDatosCapturados`) needed for R-02 reset semantics. Resetting state mid-agent would require threading these through V4AgentInput, which is plumbing churn for no benefit.
3. Runner owns the `try/finally` for lock release. Restart inside the agent would have to plumb the finally back to the runner, which is needlessly complex.
4. The agent + sub-loop's job is "given THIS message, what's the output?" — a pure-ish function. Restart is an orchestration concern, which belongs to the orchestrator (the runner).

**Code shape (excerpt — full diff in Code Examples):**
```typescript
async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
  // ... existing lockCtx + stopHeartbeat setup (UNCHANGED) ...
  let templatesSentCount = 0
  let totalTokensAcrossRestarts = 0  // R-05: accumulate
  let restartIteration = 0           // observability

  try {
    let shouldRestart = true
    let effectiveMessage: string | null = null  // null = use input.message + existing pendingUserMessage (turn 1)

    while (shouldRestart) {
      shouldRestart = false

      // ============ existing steps 1..3 (session fetch, history, snapshot) ============
      const session = input.sessionId
        ? await this.adapters.storage.getSession(input.sessionId)
        : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      // ... setSessionId on timer ...

      // CKPT-0 site (EXISTING — modified to continue instead of return)
      if (input.lockHandle && lockCtx) {
        const ck0 = await checkpoint('ckpt_0_post_acquire', input.lockHandle, this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
        if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
        if (!ck0.proceed && ck0.interrupted) {
          const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
          restartIteration++
          emitLockEvent('msg_aborted_path_a_combined', {
            at_step: 'ckpt_0_post_acquire',
            combined_msg_count: pending.length + 1,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0) + (effectiveMessage ?? input.message).length,
            restart_iteration: restartIteration,
          })
          emitLockEvent('pending_list_combined', {
            at_step: 'ckpt_0_post_acquire',
            entries_count: pending.length,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0),
            restart_iteration: restartIteration,
          })
          effectiveMessage = [...pending.map(p => p.content), effectiveMessage ?? input.message].join('\n')
          shouldRestart = true
          continue
        }
      }

      // ============ existing steps 3..5 (pendingUserMessage accumulation, build V4AgentInput) ============
      // Snapshot is RECOMPUTED each iteration from `session.state` (which was refetched at top of iteration)
      const currentDatos = session.state.datos_capturados ?? {}
      const pendingUserMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined
      const turnEffectiveMessage = effectiveMessage
        ?? (pendingUserMessage ? `${pendingUserMessage}\n${input.message}` : input.message)
      // R-03: snapshot vars resnap each iteration (same code that already exists)
      const inputIntentsVistos = [...(session.state.intents_vistos ?? [])]
      const inputTemplatesEnviados = session.state.templates_enviados ?? []
      const inputDatosCapturados = { ...currentDatos }
      delete inputDatosCapturados['_v3:pendingUserMessage']
      // ... build v4Input as today, with .message = turnEffectiveMessage ...

      // ============ call agent ============
      const output: V4AgentOutput = await processMessage(v4Input)
      totalTokensAcrossRestarts += (output.totalTokens ?? 0)  // R-05

      // === NEW: detect agent's Path A interrupted discriminator ===
      if (
        output.success === false &&
        typeof output.errorMessage === 'string' &&
        output.errorMessage.startsWith('interrupted_at_ckpt_')
      ) {
        // Agent (or sub-loop via agent) returned a Path A interrupt.
        // Drain pending, combine, restart.
        const pending = await readAndClearPending(this.config.workspaceId, lockCtx!.channel, lockCtx!.identifier)
        restartIteration++
        emitLockEvent('msg_aborted_path_a_combined', {
          at_step: output.errorMessage,
          combined_msg_count: pending.length + 1,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
          restart_iteration: restartIteration,
        })
        emitLockEvent('pending_list_combined', {
          at_step: output.errorMessage,
          entries_count: pending.length,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0),
          restart_iteration: restartIteration,
        })
        effectiveMessage = [...pending.map(p => p.content), turnEffectiveMessage].join('\n')
        shouldRestart = true
        continue
      }

      // ============ existing steps 5h-pre / CKPT-6a / pending templates send / CKPT-6b ============
      // CKPT-6a site (Path A → restart; pre-pending-template-send) — modified to continue
      // CKPT-6b site:
      //   - sentCount === 0 → Path A → restart (continue)
      //   - sentCount > 0 → Path B → break out of while (preserve current return-with-pending behavior, D-01)

      // ============ send loop, state save, etc. (UNCHANGED) ============
      // ... existing code returns EngineOutput at end ...
      return {
        success: output.success,
        // ... existing fields, but tokensUsed: totalTokensAcrossRestarts ...
      }
    }  // end while

    // Defensive: should never reach here (while always returns or restarts), but TS exhaustiveness
    throw new Error('[V4-RUNNER] restart loop exited without return — invariant violation')
  } catch (error) {
    // ... existing LostLockError + VersionConflictError + generic catch (UNCHANGED) ...
  } finally {
    // ... existing heartbeat stop + lock release (UNCHANGED) ...
  }
}
```

### Pattern R-02 (locked here): State snapshot resnap each iteration

**What:** Each iteration of the `while` loop re-fetches `session` via storage adapter and re-computes `inputIntentsVistos / inputTemplatesEnviados / inputDatosCapturados` from the freshly-fetched `session.state`. These snapshot vars are local to the iteration scope; they're NOT carried across iterations.

**Why:** Avoids cross-iteration contamination. The agent's previous iteration may have:
- Called Gemini Flash (tokens spent — accounted in `totalTokensAcrossRestarts`).
- Called `kb_search` tool (no DB writes; safe to re-run).
- Modified its INTERNAL `mergedState` and `accionesEjecutadas` working copy — but it returned with `success: false + errorMessage`, so NO `await this.adapters.storage.saveState(...)` ran in the runner (the runner's state-save is in the post-agent block AFTER the discriminator check).

Therefore the session row in DB is byte-identical between iterations (until the final successful iteration runs the state-save). Resnapping from `session.state` is correct + cheap (one DB read per iteration; same as turn 1 today).

**Subtle correctness note:** Today the runner pre-mutates `_v3:preloaded` and `_v3:agent_module` in `session.state` BEFORE calling the agent (lines 262-278 v4-production-runner.ts). On restart, the preload+agent_module write is idempotent (line 262 guards by `alreadyPreloaded` and `agentModuleAlreadyStored`) — so resnap is safe even though we re-fetch from DB after the first iteration already wrote `_v3:preloaded='true'`.

**Source:** [src/lib/agents/engine/v4-production-runner.ts:111-118 (session fetch), :207-212 (snapshot), :258-278 (preload idempotency guard)]

### Pattern R-03 (locked here): Effective message accumulator across iterations

**What:** Maintain an `effectiveMessage: string | null` outer-scope variable initialized to `null`. On the first iteration, it stays null and the iteration uses `input.message` (plus any pre-existing `_v3:pendingUserMessage` accumulation from a prior turn — unchanged behavior). On any restart, it gets set to `[...pending.map(p => p.content), priorEffectiveMessage].join('\n')` (Path A) or `pending.map(p => p.content).join('\n')` (Path B — but Path B doesn't restart per D-01, so this case is dead code in practice).

**Why:** Decouples the combined-message accumulator from `input.message` (which is immutable — it's the function param). The first iteration preserves today's behavior verbatim (uses turn's input + persisted `_v3:pendingUserMessage`); subsequent iterations layer on freshly-drained pending entries.

**Subtle Path-A `pendingUserMessage` interaction:** Today's runner reads `_v3:pendingUserMessage` from session and combines with `input.message` at line 187-190. Post-restart-loop fix, this behavior remains for the FIRST iteration (legacy v3 sessions migrating to v4 may have non-empty `_v3:pendingUserMessage` from before the fix). On restart iterations, `effectiveMessage` is non-null so the pendingUserMessage from DB is ignored (it would have been already consumed in iteration 1).

### Pattern R-04 (locked here): Discriminator contract — reuse existing `errorMessage` string

**What:** Agent and sub-loop already return Path A interrupted as:
- Agent: `{ success: false, messages: [], errorMessage: 'interrupted_at_ckpt_N_*', ... }` (lines 137-156, 335-355 of somnio-v4-agent.ts)
- Sub-loop: `LoopOutcome { status: 'no_match', reason: 'interrupted_at_ckpt_N_*', requiresHuman: true, ... }` (lines 293-305, 396-410, 454-468, 772-788 of sub-loop/index.ts)

These shapes do NOT change. What changes:
1. **Agent's `mapOutcomeToAgentOutput`** (lines 844-957 of somnio-v4-agent.ts) — when LoopOutcome.reason matches `^interrupted_at_ckpt_`, the mapper must convert this to the agent's own discriminator shape (`{ success: false, errorMessage: outcome.reason, ... }`) INSTEAD of mapping to `{ success: true, requiresHuman: true, newMode: 'handoff' }`. Today the sub-loop's interrupt produces a silent-handoff-to-human (the no_match branch in mapOutcomeToAgentOutput, lines 892-902) — that's a hidden SECOND bug this standalone fixes.
2. **Runner** — checks `output.errorMessage?.startsWith('interrupted_at_ckpt_')` after each `processMessage(v4Input)` call.

**No new types in V4AgentOutput.** No new field. The existing `errorMessage?: string` field already supports this; we're just defining a string-prefix protocol.

**Why not a typed `restart: true` boolean?** Three reasons:
1. `errorMessage` is already in the type, already populated by 2 of the 7 sites, already documented as the path-A surface. Adding a parallel boolean creates two sources of truth.
2. The string prefix `interrupted_at_ckpt_` is greppable in Vercel logs (Vercel function logs are the primary debug surface for v4 today). A boolean would not show up in logs.
3. Sub-loop's LoopOutcome.reason is ALSO a string in the same prefix family. Keeping the discriminator unified across both layers is cleaner.

### Pattern R-05 (locked here): Token accounting across restart iterations

**What:** Maintain `totalTokensAcrossRestarts: number` in runner outer scope. Each iteration adds `output.totalTokens ?? 0`. The runner returns `tokensUsed: totalTokensAcrossRestarts` (not the last iteration's tokens).

**Why:** The cost of each iteration is real (Haiku + Gemini + KB embeddings + potential GPT-4o-mini). The customer-facing turn cost should reflect total spend, not just the final iteration. Surfaced in observability and in `agent_observability_events` row payloads (downstream of `runner` → unchanged collector wiring).

---

### Anti-Patterns to Avoid

- **DO NOT put the loop in the agent.** The agent doesn't own pending-list drain semantics, doesn't own state snapshot, doesn't own the lock release boundary. Loop belongs in the runner (R-01 rationale).
- **DO NOT save state between iterations.** Only save state on the FINAL successful iteration (the existing Path B / Normal branch at line 642-740). Intermediate iterations have `success: false + errorMessage` → state save block is naturally skipped (the existing `if (wasInterruptedWithZeroSends)` branch handles legacy Path A persist behavior, which we WILL change — see Pitfalls).
- **DO NOT re-acquire the lock between iterations.** Same lock, same holder_uuid, same heartbeat. The `if (input.lockHandle) startHeartbeat(...)` line is outside the while loop in `try` — it stays.
- **DO NOT skip resnap of `session.state`.** The session row in DB may have been modified by parallel writers (recompra preload, n8n automations writing to `datos_capturados`, etc.). Refetching per iteration is the only safe read pattern. (Even though we believe the lock blocks parallel v4 writes, the session row is shared with the agent's other write paths — best to refetch.)
- **DO NOT change LockEventLabel union.** Add `restart_iteration` to existing event payloads only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pending list drain + clear atomically | New Redis multi() in runner | `readAndClearPending()` from `interruption-system-v2/pending.ts` | Already used at 3 sites in runner today (lines 145, 349, 465). Atomic LRANGE+DEL via Upstash multi. Byte-exact JSON contract documented in module. |
| Interrupt detection + fencing token check | New Redis GET pair | `checkpoint()` from `interruption-system-v2/checkpoints.ts` | Already used at 8 sites. Fail-open wrapper, emits `interrupt_detected_at_ckpt_N` automatically. |
| Lock release | New Redis Lua | `releaseLockIfOwner()` from `interruption-system-v2/lock.ts` | Lua-atomic GET+compare+DEL. Already called in finally. |
| LostLockError plumbing | New error type | Re-use `LostLockError` from `engine-adapters/production/v4-messaging-adapter.ts` | Already thrown by checkpoint sites + caught by runner's outer catch. |
| Observability event emit | console.log + DB insert by hand | `emitLockEvent('label', payload)` from `interruption-system-v2/observability.ts` | Dual emission (collector + console.log) + typed union enforcement. |
| Token accumulation across calls | None — just `+=` | Plain numeric accumulator | Trivial; no library needed. |

**Key insight:** This standalone is structurally a 4-file refactor that wraps existing primitives in a `while` loop. ZERO new modules, ZERO new types, ZERO new env vars, ZERO new DB columns. If a plan introduces a new module, that's a red flag the design is wrong.

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `_v3:pendingUserMessage` in `session_state.datos_capturados` may have stale values from pre-fix v3 sessions migrated to v4. After fix, NEW v4 sessions effectively never write this key during the lambda lifetime (restart loop drains pending in-memory, only persists pending if the lambda crashes mid-loop before save). Stale rows: harmless — they accumulate to `effectiveMessage` on iteration 1, just as today. | None — backward-compat preserved by Pattern R-03 (iteration 1 reads existing pendingUserMessage). |
| Live service config | None — no Upstash / Redis config changes. Heartbeat interval, lock TTL, cron sweep schedule all unchanged. | None. |
| OS-registered state | None — Inngest functions, cron jobs all untouched. | None. |
| Secrets/env vars | None — no new env vars. | None. |
| Build artifacts | None — TypeScript-only, Vercel autobuild. | None — `pnpm install` not required. |

**Verified by:** grep `pendingUserMessage` across `src/lib/agents/` (only v3/v4 runners + 2 reads in adapters), grep `interruption-system-v2` across `src/lib/agents/engine/` (only v4-production-runner.ts imports it).

---

## Common Pitfalls

### Pitfall 1 — Regla 6 violation: restart loop leaks into v3 path
**What goes wrong:** A refactor adds `while (shouldRestart)` into a shared helper that v3 and v4 both call, OR removes the `if (input.lockHandle && lockCtx)` gate around a CKPT site.

**Why it happens:** v4 runner is a "mechanical clone" of v3 runner per D-13 of the parent standalone. They share zero code intentionally. A developer may try to DRY this and break the parent's Regla 6 invariant.

**How to avoid:**
- Plan tasks MUST edit ONLY `v4-production-runner.ts` + `somnio-v4-agent.ts` + `sub-loop/index.ts`. Touching `v3-production-runner.ts` is forbidden in this standalone.
- Verification gate: `git diff main -- src/lib/agents/engine/v3-production-runner.ts` returns ZERO bytes diff. (Plan should include this as an explicit task verification step.)
- Verification gate: `git diff main -- src/lib/agents/somnio-v3/` returns ZERO bytes diff.
- Verification gate: `grep -rn "interruption-system-v2" src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` returns ZERO matches.

**Warning signs:**
- Test `S5 (Regla 6)` failing — see Test Strategy below.
- Any TypeScript file outside the 4 expected (runner, agent, sub-loop, debug-payload type) appearing in `git status`.

### Pitfall 2 — Double-count tokens
**What goes wrong:** Runner adds `output.totalTokens` per iteration BUT also reads `output.totalTokens` for the final return — accidentally counting the final iteration twice OR forgetting to accumulate intermediate iterations.

**Why it happens:** The existing code returns `tokensUsed: output.totalTokens` (line 761). If a developer only adds the accumulator INSIDE the loop without changing the return statement, the return value is the last iteration only.

**How to avoid:**
- Rename `totalTokens` in V4AgentOutput type to be unambiguous in scope (PER-CALL only, never accumulated by the agent itself). Document in JSDoc.
- Runner returns `tokensUsed: totalTokensAcrossRestarts` (explicit outer var) — NOT `output.totalTokens`.
- Test S3 (Path A restart 2x) asserts `engineOutput.tokensUsed >= 3 × per-iteration-baseline`.

**Warning signs:** Test S3 token count too low.

### Pitfall 3 — Observability event duplication
**What goes wrong:** Each restart iteration emits `msg_aborted_path_a_combined` and `pending_list_combined`. Without `restart_iteration` in payload, downstream observability dashboards can't distinguish "1 abort" from "5 aborts in one turn."

**Why it happens:** The 14-label union doesn't carry per-event sequence info; payloads are `Record<string, unknown>`.

**How to avoid:**
- Always add `restart_iteration: number` to the payload of `msg_aborted_path_a_combined` + `pending_list_combined` emitted from restart sites (the FIRST emission has `restart_iteration: 1`, the SECOND restart has `2`, etc.).
- Sandbox UI consumer (sibling standalone `debounce-v2-sandbox-integration`) will read this field to render a restart timeline.

**Warning signs:** Sandbox UI tab "Interruption" shows duplicate events with identical timestamps.

### Pitfall 4 — Side-effect leak between iterations (KB writes, kb_search tool calls)
**What goes wrong:** Sub-loop's `kb_search` tool call (lines 154-225 sub-loop/index.ts) runs on every restart. KB is read-only (Supabase RPC), so no data corruption — but unnecessary token spend.

**Why it happens:** D-02 mandates fresh comprehension per iteration. The sub-loop is invoked downstream of comprehension via `runSubLoop` if escalated. Each iteration runs the FULL pipeline (comprehension → state machine → invocations → response track → potentially sub-loop).

**Mitigation:** Accept the cost (per D-02 ~$0.001/restart trivial). KB is read-only so no integrity risk. Document in LEARNINGS that high-volume troll scenarios may want a per-restart sub-loop cache (v2.1 opt-in).

**Warning signs:** Production cost dashboards show per-turn $$$ spike from a single conversation. Surface as observability concern in v2.1.

### Pitfall 5 — `wasInterruptedWithZeroSends` dead code post-fix
**What goes wrong:** The existing block at v4-production-runner.ts:623-640 (Path A rollback persisting `_v3:pendingUserMessage = input.message`) becomes UNREACHABLE post-fix because the restart loop intercepts BEFORE the agent's `output.errorMessage` causes the runner to fall through to this block.

**Why it happens:** Today's runner has TWO Path A persist sites:
1. CKPT-0 / CKPT-6a / CKPT-6b inline sites (drain pending + persist combined) — lines 165-181, 359-371, 475-481. THESE are converted to `continue`.
2. The legacy `wasInterruptedWithZeroSends` block (lines 623-640) — triggered by `messaging.send(...)` returning `interrupted: true, messagesSent: 0`. This is INSIDE the send loop (CKPT-7.N internal), which per D-05 does NOT restart.

The legacy block remains live for the CKPT-7.N → Path A edge case (template_1 send aborted at first byte by CKPT-7.1). On restart-fix introduction, this should keep its current behavior (silent persist) per D-05 explicit statement that send-loop interrupts do NOT restart.

**How to avoid:**
- DO NOT remove the `wasInterruptedWithZeroSends` block.
- Add a comment noting it's reachable only via CKPT-7.N Path A (template aborted at template_1 first byte) — which can happen if the first template's send call returns `interrupted: true, messagesSent: 0`. Cross-reference D-05.

**Warning signs:** Removing this block breaks Path A behavior for the rare CKPT-7.1 abort case.

### Pitfall 6 — Heartbeat leak across iterations
**What goes wrong:** Restart loop iterations are slow (~1-2s each). Heartbeat runs at HEARTBEAT_MS=5000. If the runner mistakenly calls `startHeartbeat()` INSIDE the while loop, multiple heartbeat intervals stack up — each iteration's heartbeat persists past the iteration's lifetime, eventually piling up dozens of intervals.

**Why it happens:** Developer reads "each iteration is a fresh attempt" and thinks heartbeat needs to be restarted.

**How to avoid:**
- `startHeartbeat()` call MUST stay OUTSIDE the while loop (currently at v4-production-runner.ts:100-102). The lock is the SAME across iterations; the same heartbeat keeps renewing.
- `stopHeartbeat` cleanup stays in finally (line 831). One heartbeat lifetime per lambda invocation.

**Warning signs:** Tests show `heartbeat_renewed` event count growing unboundedly with restart count. Or: Vercel logs show stacking `[interruption-v2] heartbeat_renewed` lines.

### Pitfall 7 — Agent's `mapOutcomeToAgentOutput` swallows sub-loop interrupts as silent handoffs (SECOND BUG)
**What goes wrong:** Today, when sub-loop returns `LoopOutcome { status: 'no_match', reason: 'interrupted_at_ckpt_N', requiresHuman: true, ... }`, the agent's `mapOutcomeToAgentOutput` (lines 892-902) maps this to `{ success: true, messages: [], newMode: 'handoff', requiresHuman: true, ... }`. The runner sees this as a SUCCESSFUL handoff and writes `requires_human=true` to the session — silently converting an interrupt into a "send to human agent" mode change WITHOUT actually combining the next message.

**Why it happens:** The sub-loop CKPT sites were added in Plan 05 of the parent standalone, but the agent's mapper wasn't extended to recognize the `interrupted_at_ckpt_` prefix as a special case — it lumped it with all other no_match handoffs.

**How to avoid:**
- Modify `mapOutcomeToAgentOutput` to check if `outcome.reason.startsWith('interrupted_at_ckpt_')`. If yes, return `{ success: false, messages: [], errorMessage: outcome.reason, ... }` (same shape as the agent's own CKPT-1/CKPT-2 interrupted returns). This propagates upward to the runner's discriminator detector.
- This is a 1-block addition in agent's mapper — see Code Examples.

**Warning signs:** Tests today would show: sub-loop CKPT-3/4/5 interrupt → session ends with `requires_human=true` AND `mode='handoff'` (a real handoff, not a restart). After fix: same scenario → runner restarts with combined message.

### Pitfall 8 — Multi-write to `_v3:pendingUserMessage` racing the saveState
**What goes wrong:** Runner persists `_v3:pendingUserMessage` in the legacy `wasInterruptedWithZeroSends` block AND elsewhere in the new restart logic. If both paths write in different iterations, the LAST write wins — could lose data.

**Why it happens:** Mixing the new restart-loop semantics with the legacy single-iteration persist semantics.

**How to avoid:**
- New restart code path does NOT write `_v3:pendingUserMessage` to DB during iterations — it accumulates in the in-memory `effectiveMessage` var.
- Only the LEGACY `wasInterruptedWithZeroSends` block (CKPT-7.N Path A edge case) still writes `_v3:pendingUserMessage` to DB — for the rare case where the lambda exits via the send-loop Path A branch with no restart.
- If the lambda crashes mid-restart-loop (e.g., LostLockError), the lock release runs in finally and the next inbound message will see EMPTY `_v3:pendingUserMessage` (because we never persisted) — meaning the next message will be processed alone, without prior accumulated context. THIS IS ACCEPTED DEGRADATION for the rare crash case. Document in LEARNINGS.

**Warning signs:** Production observability shows `_v3:pendingUserMessage` populated post-restart-fix on v4 sessions — flag as a regression.

### Pitfall 9 — Inngest step.run + restart loop = replay madness
**What goes wrong:** The runner is invoked via Inngest `step.run` in `webhook-handler.ts`. Inngest replays step boundaries on retry. If the restart loop runs INSIDE a step.run, the entire loop replays from scratch (because Inngest caches only the step's RETURN value, not intermediate iteration state).

**Why it happens:** Default thinking: "Inngest steps for resilience." But the parent standalone explicitly puts the entire lock+heartbeat lifecycle OUTSIDE step.run (see runner lines 76-79 docs: "Runs in the main async flow, NOT inside step.run").

**How to avoid:**
- Restart loop sits in the same async scope as the lock setup (already outside step.run).
- Confirm no plan task wraps `processMessage` call sites in `step.run` for "resilience" — that would break the lock contract.

**Warning signs:** Restart count higher than expected; lambda durations >2x baseline; Inngest replay logs showing the same processMessage call multiple times.

---

## Code Examples

### Example 1 — Runner restart loop (high-level shape)

**Source:** [src/lib/agents/engine/v4-production-runner.ts:108-772 — modified body]

```typescript
async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
  const startMs = Date.now()
  const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
    ? { channel: input.lockChannel, identifier: input.lockIdentifier }
    : null

  if (input.lockHandle && !lockCtx) {
    throw new Error('[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated')
  }

  let stopHeartbeat: (() => void) | null = null
  if (input.lockHandle) {
    stopHeartbeat = startHeartbeat(input.lockHandle)
  }

  let templatesSentCount = 0
  // === NEW: restart-loop accumulators ===
  let totalTokensAcrossRestarts = 0
  let restartIteration = 0
  let effectiveMessage: string | null = null  // null = use input.message + persisted pendingUserMessage

  try {
    try {
      // === NEW: outer restart loop ===
      let shouldRestart = true
      while (shouldRestart) {
        shouldRestart = false

        // 1. Get session (RE-FETCH each iteration — R-02)
        const session = input.sessionId
          ? await this.adapters.storage.getSession(input.sessionId)
          : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

        // 1b. setSessionId on timer (UNCHANGED)
        if ('setSessionId' in this.adapters.timer && typeof (this.adapters.timer as any).setSessionId === 'function') {
          (this.adapters.timer as any).setSessionId(session.id)
        }

        // === CKPT-0 site — MODIFIED: continue instead of return ===
        if (input.lockHandle && lockCtx) {
          const ck0 = await checkpoint('ckpt_0_post_acquire', input.lockHandle, this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
          if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
          if (!ck0.proceed && ck0.interrupted) {
            const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
            restartIteration++
            const priorMsg = effectiveMessage ?? input.message
            emitLockEvent('msg_aborted_path_a_combined', {
              at_step: 'ckpt_0_post_acquire',
              combined_msg_count: pending.length + 1,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0) + priorMsg.length,
              restart_iteration: restartIteration,
            })
            emitLockEvent('pending_list_combined', {
              at_step: 'ckpt_0_post_acquire',
              entries_count: pending.length,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0),
              restart_iteration: restartIteration,
            })
            effectiveMessage = [...pending.map(p => p.content), priorMsg].join('\n')
            // === NEW: no DB persist; no early return ===
            shouldRestart = true
            continue
          }
        }

        // 1c. Path A accumulation from prior turn (UNCHANGED for iter 1; bypassed on restart)
        const currentDatos = session.state.datos_capturados ?? {}
        const pendingUserMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined
        const turnEffectiveMessage = effectiveMessage
          ?? (pendingUserMessage ? `${pendingUserMessage}\n${input.message}` : input.message)

        // 2. Get history (UNCHANGED)
        const history = input.history.length > 0
          ? input.history
          : await this.adapters.storage.getHistory(session.id)

        // 3. Build V4AgentInput (UNCHANGED snapshot — R-02)
        const turnNumber = input.turnNumber ?? (history.length + 1)
        const inputIntentsVistos = [...(session.state.intents_vistos ?? [])]
        const inputTemplatesEnviados = session.state.templates_enviados ?? []
        const inputDatosCapturados = { ...currentDatos }
        delete inputDatosCapturados['_v3:pendingUserMessage']
        // ... (accionesEjecutadas read, intentsVistos extract — UNCHANGED)
        const v4Input: V4AgentInput = {
          message: turnEffectiveMessage,
          // ... (history, currentMode, etc. UNCHANGED)
          lockHandle: input.lockHandle,
          lockChannel: input.lockChannel,
          lockIdentifier: input.lockIdentifier,
          ownPendingEntryJson: input.ownPendingEntryJson,
        }

        // 3b. Preload + agent_module write (UNCHANGED — idempotent guard)

        // 4. Call agent
        const { processMessage } = await import('../somnio-v4')
        const output = await processMessage(v4Input)
        totalTokensAcrossRestarts += (output.totalTokens ?? 0)  // R-05

        // === NEW: detect agent / sub-loop Path A interrupt ===
        if (
          output.success === false &&
          typeof output.errorMessage === 'string' &&
          output.errorMessage.startsWith('interrupted_at_ckpt_')
        ) {
          const pending = await readAndClearPending(this.config.workspaceId, lockCtx!.channel, lockCtx!.identifier)
          restartIteration++
          emitLockEvent('msg_aborted_path_a_combined', {
            at_step: output.errorMessage,
            combined_msg_count: pending.length + 1,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
            restart_iteration: restartIteration,
          })
          emitLockEvent('pending_list_combined', {
            at_step: output.errorMessage,
            entries_count: pending.length,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0),
            restart_iteration: restartIteration,
          })
          effectiveMessage = [...pending.map(p => p.content), turnEffectiveMessage].join('\n')
          shouldRestart = true
          continue
        }

        // 5. Route output (UNCHANGED collector record)
        getCollector()?.recordEvent('pipeline_decision', 'agent_routed', { /* UNCHANGED */ })

        // 5f. Timer cancel (UNCHANGED)
        if (this.adapters.timer.onCustomerMessage) {
          await this.adapters.timer.onCustomerMessage(session.id, input.conversationId, input.message)
        }

        // === CKPT-6a site — MODIFIED: continue instead of return ===
        let messagesSent = 0
        let sentMessageContents: string[] = []
        const actuallySentIds: string[] = []
        let wasInterruptedWithZeroSends = false

        if (input.lockHandle && lockCtx) {
          const ck6a = await checkpoint('ckpt_6_pre_send_loop', input.lockHandle, this.config.workspaceId, lockCtx.channel, lockCtx.identifier, { hasSentAnything: false })
          if (ck6a.lostLock) throw new LostLockError('ckpt_6_pre_send_loop_pending_templates')
          if (!ck6a.proceed && ck6a.interrupted) {
            const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
            restartIteration++
            emitLockEvent('msg_aborted_path_a_combined', { at_step: 'ckpt_6_pre_send_loop_pending_templates', templates_sent_before_abort: 0, restart_iteration: restartIteration })
            emitLockEvent('pending_list_combined', { at_step: 'ckpt_6_pre_send_loop_pending_templates', entries_count: pending.length, total_chars: pending.reduce((s, p) => s + p.content.length, 0), restart_iteration: restartIteration })
            effectiveMessage = [...pending.map(p => p.content), turnEffectiveMessage].join('\n')
            shouldRestart = true
            continue
          }
        }

        // 5h-pre. Send pending templates from prior interrupt (UNCHANGED)
        // ... pending templates send block ...

        // === CKPT-6b site — MODIFIED ===
        if (input.lockHandle && lockCtx) {
          const ck6b = await checkpoint('ckpt_6_pre_send_loop', input.lockHandle, this.config.workspaceId, lockCtx.channel, lockCtx.identifier, { hasSentAnything: actuallySentIds.length > 0 })
          if (ck6b.lostLock) throw new LostLockError('ckpt_6_pre_send_loop_main')
          if (!ck6b.proceed && ck6b.interrupted) {
            const sentCount = actuallySentIds.length
            if (sentCount === 0) {
              // Path A — restart
              const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
              restartIteration++
              emitLockEvent('msg_aborted_path_a_combined', { at_step: 'ckpt_6_pre_send_loop_main', templates_sent_before_abort: 0, restart_iteration: restartIteration })
              emitLockEvent('pending_list_combined', { at_step: 'ckpt_6_pre_send_loop_main', entries_count: pending.length, total_chars: pending.reduce((s, p) => s + p.content.length, 0), restart_iteration: restartIteration })
              effectiveMessage = [...pending.map(p => p.content), turnEffectiveMessage].join('\n')
              shouldRestart = true
              continue
            } else {
              // Path B — D-01: NO restart. Preserve current behavior verbatim:
              // emit Path B event, set templatesSentCount, return.
              emitLockEvent('msg_aborted_path_b_solo', { at_step: 'ckpt_6_pre_send_loop_main', templates_sent_before_abort: sentCount })
              templatesSentCount = sentCount
              return {
                success: true,
                messages: [],
                sessionId: session.id,
                messagesSent: sentCount,
                tokensUsed: totalTokensAcrossRestarts,
              }
            }
          }
        }

        // 5h-main. Main send loop (UNCHANGED — CKPT-7.N is inside V4MessagingAdapter, D-05)

        // 5-post. State save + turns (UNCHANGED — Path A rollback for CKPT-7.1 edge case is the legacy block)

        // Update outer counter for finally
        templatesSentCount = actuallySentIds.length

        return {
          success: output.success,
          messages: output.messages,
          newMode: wasInterruptedWithZeroSends ? undefined : output.newMode,
          tokensUsed: totalTokensAcrossRestarts,  // CHANGED — use accumulator
          sessionId: session.id,
          messagesSent,
          response: sentMessageContents.join('\n'),
          orderCreated: orderResult?.success,
          orderId: orderResult?.orderId,
          contactId: orderResult?.contactId ?? input.contactId,
          error: output.success ? undefined : {
            code: 'V4_AGENT_ERROR',
            message: 'V4 agent processing failed',
          },
        }
      }  // === end while ===

      // Defensive: should be unreachable
      throw new Error('[V4-RUNNER] restart loop exited without return — invariant violation')
    } catch (error) {
      // UNCHANGED LostLockError, VersionConflictError, generic catch
    }
  } finally {
    // UNCHANGED heartbeat stop + lock release
  }
}
```

### Example 2 — Agent's `mapOutcomeToAgentOutput` extension (Pitfall 7 fix)

**Source:** [src/lib/agents/somnio-v4/somnio-v4-agent.ts:892-902 — modified `no_match` branch]

```typescript
function mapOutcomeToAgentOutput(args: {
  outcome: LoopOutcome
  // ... other args UNCHANGED
}): V4AgentOutput {
  // ... baseOutput build UNCHANGED ...

  if (outcome.status === 'no_match') {
    // === NEW: detect sub-loop CKPT interrupt and propagate as runner-discriminator ===
    if (typeof outcome.reason === 'string' && outcome.reason.startsWith('interrupted_at_ckpt_')) {
      return {
        ...baseOutput,
        success: false,                       // CHANGED from true
        errorMessage: outcome.reason,         // NEW
        messages: [],
        // DO NOT set newMode='handoff' or requiresHuman=true — those would have
        // user-facing side-effects when the customer's intent was just to interrupt.
      }
    }
    // Existing handoff path (REAL no_match handoff — not interrupt)
    return {
      ...baseOutput,
      messages: [],
      newMode: 'handoff',
      requiresHuman: true,
      decisionInfo: {
        action: 'handoff',
        reason: outcome.reason,
      },
    }
  }

  // ... existing 'generated' and 'template' branches UNCHANGED ...
}
```

### Example 3 — Sub-loop interrupt returns (UNCHANGED — already correct)

**Source:** [src/lib/agents/somnio-v4/sub-loop/index.ts:293-305, :396-410, :454-468, :772-788]

Sub-loop returns are already correctly shaped — they emit `LoopOutcome { status: 'no_match', reason: 'interrupted_at_ckpt_*', ... }`. NO CHANGES needed. The only change is in the agent's mapper (Example 2 above) which now recognizes the prefix and propagates upward as runner-discriminator.

### Example 4 — Regla 6 verification grep (test gate)

```bash
# Plan task should run these and assert empty output:
git diff main -- src/lib/agents/engine/v3-production-runner.ts | wc -l            # MUST be 0
git diff main -- src/lib/agents/somnio-v3/ | wc -l                                # MUST be 0
git diff main -- src/lib/agents/godentist/ | wc -l                                # MUST be 0
git diff main -- src/lib/agents/godentist-fb-ig/ | wc -l                          # MUST be 0
git diff main -- src/lib/agents/somnio-recompra/ | wc -l                          # MUST be 0
git diff main -- src/lib/agents/somnio-pw-confirmation/ | wc -l                   # MUST be 0
grep -rn "while.*shouldRestart\|restart_iteration" src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/  # MUST return 0 matches
```

---

## File Touch List

| File | Type | LOC delta | Notes |
|------|------|-----------|-------|
| `src/lib/agents/engine/v4-production-runner.ts` | MODIFY | +60 / -8 net | Wrap `processMessage` body in `while (shouldRestart)`; convert CKPT-0/6a/6b Path A `return` → `continue`; add agent-discriminator detector after `processMessage(v4Input)` call; add `totalTokensAcrossRestarts` + `restartIteration` + `effectiveMessage` outer-scope vars; change `tokensUsed: output.totalTokens` → `tokensUsed: totalTokensAcrossRestarts` at return. Existing `wasInterruptedWithZeroSends` block STAYS (Pitfall 5). |
| `src/lib/agents/somnio-v4/somnio-v4-agent.ts` | MODIFY | +10 / 0 net | In `mapOutcomeToAgentOutput`, add prefix check for `outcome.reason.startsWith('interrupted_at_ckpt_')` in the `no_match` branch and return `{ success: false, errorMessage: outcome.reason, ... }` (Pitfall 7 fix). NO changes to CKPT-1 / CKPT-2 in-agent interrupt returns (already correct). |
| `src/lib/agents/somnio-v4/sub-loop/index.ts` | UNCHANGED | 0 / 0 | Sub-loop already returns correct shape. ZERO TOUCH. Verify with `git diff`. |
| `src/lib/agents/somnio-v4/types.ts` | UNCHANGED | 0 / 0 | `errorMessage?: string` field already exists. Optional: tighten JSDoc on `errorMessage` to document the `interrupted_at_ckpt_*` prefix protocol (additive comment-only diff, +3 LOC if added). |
| `src/lib/agents/interruption-system-v2/observability.ts` | UNCHANGED | 0 / 0 | 14-label union unchanged. `restart_iteration` is just a payload field (Record<string, unknown> allows it). ZERO TOUCH. |
| `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` | NEW | +250 | 5 scenarios S1..S5 — see Test Strategy. Mirrors `e2e-scenarios.test.ts` pattern (vi.mock factory + shared mock-redis + emittedEvents tracking). |
| `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` | NEW (or extend existing if present) | +200 | Integration test exercising the runner's restart loop end-to-end with mocked adapters + lock primitives. Mocks `import('../somnio-v4')` to return canned outputs that simulate CKPT-1/CKPT-2/CKPT-3 interrupt signals. Verifies token accumulation, restart_iteration payloads, terminal success after natural quiescence. |
| `LEARNINGS.md` (this standalone) | NEW | +100 | Document the restart loop pattern, the Pitfall 7 SECOND-BUG fix, the byte-identity verification gate as a reusable Regla 6 pattern, the `effectiveMessage` accumulator pattern as reusable for other agents migrating to v4. |

**Total estimated LOC delta:** ~+620 / -8 net, almost entirely net-new test code (+450 LOC). Production code delta is ~+70 LOC in 2 files. **One zero-touch file is critical: `sub-loop/index.ts` MUST be untouched.**

---

## Test Strategy

5 scenarios per DISCUSSION-LOG.md D-09. All scenarios use vitest with the shared mock-redis helper pattern from `e2e-scenarios.test.ts`. Test file: `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (new).

### S1 — Happy path (no interrupt, no regression)
**Setup:**
- Holder acquires lock, processes 1 msg with no interrupt, normal send completes, lock released.

**Assertions:**
- `emittedEvents` contains `lock_acquired` + `lock_released_normal` (no path-A/path-B labels).
- `engineOutput.success === true`.
- `engineOutput.tokensUsed > 0` (1 iteration's worth).
- Restart count = 0 (no `restart_iteration` field in any event).
- Lock store entry removed after release.

**Source:** [e2e-scenarios.test.ts:88-129 — S1 baseline pattern].

### S2 — Path A restart, 1 iteration
**Setup:**
- Holder acquires lock for msg1.
- Holder reaches CKPT-1 (post-comprehension). MEANWHILE: simulate interrupt by writing `interrupt:*` key + pushing msg2 to pending.
- Mock agent returns `{ success: false, errorMessage: 'interrupted_at_ckpt_1_post_comprehension', totalTokens: 100, ... }`.
- On second iteration (with `effectiveMessage = 'msg2\nmsg1'`), mock agent returns `{ success: true, messages: ['response'], totalTokens: 120, ... }`.

**Assertions:**
- `emittedEvents` contains exactly ONE `msg_aborted_path_a_combined` with `restart_iteration: 1` + matching `pending_list_combined` with same iteration.
- `emittedEvents` contains `lock_acquired` + `lock_released_normal` (one of each).
- `engineOutput.success === true`.
- `engineOutput.tokensUsed === 220` (100 + 120 — accumulated).
- Iteration 2's `v4Input.message` === `'msg2\nmsg1'` (assert via spy on the mocked agent's invocation args).

### S3 — Path A restart, 2 iterations (cascading)
**Setup:**
- Holder acquires lock for msg1.
- Iter 1: interrupt at CKPT-1 with msg2 in pending. Mock returns `errorMessage: 'interrupted_at_ckpt_1_post_comprehension'`.
- Iter 2: BEFORE the iteration's CKPT-0 succeeds, push msg3 to pending + set interrupt key. CKPT-0 detects interrupt; combined message becomes `'msg3\nmsg2\nmsg1'`.
- Iter 3: clean run, agent returns success with response.

**Assertions:**
- `emittedEvents` contains TWO `msg_aborted_path_a_combined` (with `restart_iteration: 1` then `restart_iteration: 2`).
- Iter 3 `v4Input.message` === `'msg3\nmsg2\nmsg1'`.
- `engineOutput.tokensUsed === sum of all 3 iterations' tokens`.
- One `lock_acquired` + one `lock_released_normal` (single lock lifetime).
- Heartbeat events count is approximately `floor(total_duration_ms / HEARTBEAT_MS)` — no stacking (Pitfall 6).

### S4 — Path B post-send (NO restart, current behavior preserved)
**Setup:**
- Holder acquires lock for msg1.
- Agent processes msg1 successfully, returns 2 templates.
- Send loop sends template_1, then CKPT-7.1 detects interrupt before template_2.
- V4MessagingAdapter returns `{ messagesSent: 1, interrupted: true }`.
- Per current code: `actuallySentIds.length === 1` → existing Path B branch saves unsent template_2 to `pending_templates` and exits.
- msg2 stays in pending list, NOT drained.

**Assertions:**
- NO `restart_iteration` field in any event payload (no restart occurred).
- `emittedEvents` contains `msg_aborted_path_b_solo` (NOT `..._path_a_combined`).
- `engineOutput.messagesSent === 1`.
- Pending list in mock-redis still has msg2 (drains in next inbound's lambda).
- `lock_released_normal` fired (lock released normally despite Path B).

### S5 — Regla 6 (v3 path byte-identical)
**Setup:**
- Process a message via the v3 path (using `V3ProductionRunner` instead of `V4ProductionRunner`).
- The v3 path has ZERO `lockHandle` plumbing — `V3ProductionRunner.processMessage` does not even import `interruption-system-v2`.

**Assertions (multi-modal):**
1. **Static (compile-time / grep):**
   ```bash
   grep -c "interruption-system-v2" src/lib/agents/engine/v3-production-runner.ts  # === 0
   grep -c "lockHandle\|shouldRestart\|restart_iteration" src/lib/agents/engine/v3-production-runner.ts  # === 0
   ```
2. **Behavioral (vitest):**
   - Run V3ProductionRunner against a mocked storage adapter with `_v3:pendingUserMessage` non-empty.
   - Assert: agent receives `effectiveMessage = '${pending}\n${input.message}'` (existing v3 accumulation pattern).
   - Assert: NO `emitLockEvent` calls happened during the entire v3 turn (mock the emitter and verify 0 invocations).
   - Assert: V3 `processMessage` does NOT throw `LostLockError` ever (no checkpoint sites).
3. **Diff verification (CI gate):**
   ```bash
   git diff main -- src/lib/agents/engine/v3-production-runner.ts | wc -l   # === 0
   git diff main -- src/lib/agents/somnio-v3/ | wc -l                       # === 0
   ```

These three modalities together prove Regla 6: code-level (no import), behavior-level (no events emitted), and diff-level (no changes shipped).

### Test infrastructure reuse

- All 5 scenarios use the shared mock-redis helper at `__tests__/_helpers/mock-redis.ts` (already exists per parent standalone).
- `vi.mock('@/lib/observability', ...)` to capture `emittedEvents` (pattern from `e2e-scenarios.test.ts:45-51`).
- `vi.mock('../somnio-v4', ...)` to return canned `V4AgentOutput` for restart scenarios. Use `vi.fn()` for the import so each iteration's call args can be inspected via `mockFn.mock.calls[i]`.
- For S5, import `V3ProductionRunner` directly (no mocks for interruption-system-v2 — it's not imported by v3).

---

## Open Questions Resolved

### Q1 — Where does the loop live: runner, agent, or sub-loop?
**Resolution (R-01):** Runner. Justified by:
- Runner owns Redis primitives via direct import; agent/sub-loop access them indirectly via context fields.
- Runner owns the lock acquire/release lifecycle (the loop's natural boundary).
- Runner owns the state snapshot vars (R-02).
- Putting it elsewhere would require plumbing Redis ops or state snapshot through the agent interface — pointless complexity.

**Source:** [src/lib/agents/engine/v4-production-runner.ts:48-52 (import block — runner is the only file importing interruption-system-v2 primitives directly from this layer)], [src/lib/agents/somnio-v4/somnio-v4-agent.ts:62-64 (agent only imports checkpoint/emitLockEvent — not pending/lock; intentional minimization)].

### Q2 — State reset semantics for Path A restart: full reset vs preserve mid-iteration state?
**Resolution (R-02):** Full reset. Resnap `inputIntentsVistos / inputTemplatesEnviados / inputDatosCapturados` from re-fetched `session.state` each iteration. NEVER carry mid-iteration state across.

**Reasoning:**
- The agent returned with `success: false + errorMessage`. The runner's state-save block (lines 642-740) is GATED on the Normal/Path-B branch which is only taken when agent succeeded. So `session.state` in DB is byte-identical to what we read at iteration start. Resnapping is safe + correct.
- Agent's INTERNAL `mergedState` (the working copy inside `processUserMessage`) was discarded when the agent returned — it's local-scope only.
- D-02 (fresh comprehension per iteration) implies fresh state-machine derivation per iteration. If `intentsVistos` is carried over from a half-finished iteration, the comprehension result of `effectiveMessage` would be merged INTO a possibly-stale `intentsVistos`, which could blow up the state machine's transition decisions.

**Source:** [src/lib/agents/engine/v4-production-runner.ts:206-211 (snapshot is inside the body, will resnap each iteration of the while)], [src/lib/agents/engine/v4-production-runner.ts:642-740 (state save block — only runs on success, never on interrupted)].

### Q3 — State reset semantics for Path B restart?
**Resolution (R-03):** N/A — Path B does NOT restart per D-01 + D-05. The CKPT-6b branch with `sentCount > 0` returns immediately (preserving today's silent persist behavior). No state-reset semantics needed because there's no restart iteration for Path B.

Per D-01 verbatim: "msg1 NO se re-incluye porque ya tuvo respuesta parcial." The implication is that Path B is left as today's "send what we have, save remaining as pending_templates, return." Next inbound's lambda will drain the pending list naturally + see pending_templates from DB and send them first.

**Note on edge case:** The legacy `wasInterruptedWithZeroSends` block (CKPT-7.1 first-template Path A) is technically a third path that today writes `_v3:pendingUserMessage = input.message` and exits. Per D-05 explicit "CKPT-7.N NO dispara restart," this stays as-is. The next inbound will combine via the existing `_v3:pendingUserMessage` accumulator at iteration 1 of the next turn — same behavior as today.

### Q4 — Discriminator contract — typed boolean or string prefix?
**Resolution (R-04):** String prefix on `errorMessage: 'interrupted_at_ckpt_*'`. See Pattern R-04 rationale above.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silent persist + return on interrupt; bot stays mute until next inbound msg | Restart loop in-lambda; drain pending + combine + re-process | This standalone | Bot responds to combined message in <2s after customer stops typing (vs current "never" until 3rd msg / timer L1). |
| `_v3:pendingUserMessage` written on every Path A interrupt | `_v3:pendingUserMessage` only written by the rare CKPT-7.1 Path A edge case + legacy v3 sessions | This standalone | DB writes during interrupt scenarios reduced ~95%; in-memory accumulator replaces the persist step. |
| Sub-loop interrupt → silent handoff_to_human via `mapOutcomeToAgentOutput`'s no_match branch | Sub-loop interrupt → propagated upward as `errorMessage: 'interrupted_at_ckpt_*'` → runner restarts | This standalone | Fixes Pitfall 7 silent-handoff bug. Sub-loop interrupts no longer mistakenly mark sessions as `requires_human=true`. |

**Deprecated/outdated:**
- The phrase "Path A discard turn" in code comments (v4-production-runner.ts lines 30, 318, 588 etc.) becomes misleading post-fix. The turn is no longer "discarded" — it's restarted. Recommend updating comments in Plan tasks.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Inngest step.run wrapping is at webhook-handler level, NOT around `processMessage` itself. Runner runs in main async flow. | Pitfalls §9 | If processMessage IS wrapped in step.run, the restart loop will replay madly on retries. Verify in webhook-handler.ts. |
| A2 | `session.state` row in DB is unmodified by parallel writers during a restart loop iteration (i.e., the lock prevents other v4 lambdas from writing, and v3/recompra/etc. don't share this workspace's v4 sessions in practice). | Pattern R-02 | If false, resnap could pick up surprise mutations between iterations. Mitigation: lock blocks parallel v4 writes; cross-agent writes are out-of-scope per D-06. |
| A3 | The agent's `mapOutcomeToAgentOutput` no_match handoff was never a load-bearing UX requirement for the interrupt-during-sub-loop case (i.e., today's silent handoff was a hidden bug, not a feature). | Pitfall 7 | If true → fix is correct. If false (i.e., interrupt-during-sub-loop was deliberately a handoff for safety), need to preserve that behavior under a flag or different signal. Confidence: HIGH — discussion log and code comments don't mention this behavior anywhere as a deliberate choice. |
| A4 | `output.totalTokens` is per-call only (not accumulated within the agent across multiple internal calls). | Pattern R-05 | If false, runner's accumulator would double-count tokens from comprehension+sub-loop+etc. Verify: agent code at `processUserMessage` returns `totalTokens: tokensUsed` (line 297) where `tokensUsed` comes from a single comprehend() call — sub-loop tokens are NOT included today (gap in observability, but means accumulator is safe). |

**If user disagrees with A3 (interrupt-during-sub-loop should remain a handoff), the Pitfall 7 fix in Pattern R-04 / Example 2 needs to be reconsidered — but the user's verbatim design statement in DISCUSSION-LOG.md "Mecánica: al detectar interrupt en cualquier checkpoint, NO retornar silente. En su lugar..." strongly supports A3.**

---

## Open Questions

None remaining. All 4 design questions from `<additional_context>` resolved above.

---

## Sources

### Primary (HIGH confidence — direct source read this session)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-interrupt-reprocess/DISCUSSION-LOG.md` — 9 D-XX decisions verbatim
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine/v4-production-runner.ts` (854 lines, full read) — primary refactor target
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` (982 lines, full read) — agent discriminator emission sites
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` (914 lines, full read) — sub-loop interrupt return shapes
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/types.ts` (403 lines, full read) — V4AgentInput/V4AgentOutput shapes
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine/v3-production-runner.ts` (lines 1-120 read; grep verified no `interruption-system-v2` imports throughout) — Regla 6 baseline
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/checkpoints.ts` (155 lines, full read) — checkpoint helper contract
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/pending.ts` (182 lines, full read) — readAndClearPending contract
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/observability.ts` (86 lines, full read) — 14 LockEventLabel union (no new label needed)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` (351 lines, full read) — test pattern to mirror for S1..S5
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` (186 lines, full read) — CKPT-7.N boundary (D-05 untouched)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-interruption-system-v2/` — parent standalone context (referenced via file paths in code comments; not re-read this session)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md` Regla 6 + `.claude/rules/agent-scope.md` Module Scope `interruption-system-v2` block

### Secondary (MEDIUM confidence — referenced but not re-read this session)
- Parent standalone shipped artifacts (`05-PLAN.md`, `04-PLAN.md`, `07-PLAN.md`) — checkpoint placements + 14-label union locked therein.

### Tertiary (LOW — none used)

---

## Metadata

**Confidence breakdown:**
- Runner restart loop pattern (R-01): HIGH — direct read of all 7 interrupt sites confirms the refactor is mechanical wrapping.
- State reset semantics (R-02, R-03): HIGH — snapshot vars are already local to the body; refetching session per iteration is what the body already does for iteration 1.
- Discriminator contract (R-04): HIGH — agent + sub-loop ALREADY emit the `errorMessage / reason: 'interrupted_at_ckpt_*'` shape; only mapper needs to propagate it.
- Token accounting (R-05): MEDIUM-HIGH — depends on Assumption A4 (agent returns per-call tokens only). Cited code line confirms this.
- Pitfall 7 (silent handoff bug discovery): MEDIUM-HIGH — code confirms today's mapper converts no_match to handoff; whether this was deliberate or accidental is an assumption (A3). User's design verbatim in DISCUSSION-LOG strongly supports it was accidental.
- Regla 6 preservation: HIGH — v3 path has ZERO imports from interruption-system-v2 (verified via grep). Refactor is contained to 2 v4 files.

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days — stable codebase, no major v4 churn expected; the sibling `debounce-v2-sandbox-integration` consumes the events emitted by this standalone but is paused pending this ship).

---

## RESEARCH COMPLETE

**Phase:** standalone `debounce-v2-interrupt-reprocess`
**Confidence:** HIGH

### Key Findings

1. **The fix is a structural wrap, not a redesign.** Runner-level `while (shouldRestart)` outer loop wrapping the existing `processMessage` body. The agent + sub-loop already emit the right discriminator shape (`errorMessage / outcome.reason = 'interrupted_at_ckpt_*'`) — they just weren't being consumed by the runner.
2. **A SECOND bug surfaced during research (Pitfall 7):** `mapOutcomeToAgentOutput` was silently converting sub-loop CKPT interrupts into "handoff to human" mode changes. The fix is a 10-line addition in the no_match branch to recognize the `interrupted_at_ckpt_` prefix and propagate upward as a runner discriminator instead of as a user-facing handoff.
3. **State semantics are simpler than expected:** because the runner's state-save block is GATED on `output.success === true`, no DB state is written during interrupt iterations. Resnap from `session.state` at top of each iteration is correct + safe (R-02).
4. **Regla 6 is mechanically verifiable:** v3 runner + v3/godentist/recompra/pw-confirmation paths have ZERO `interruption-system-v2` imports today. The refactor is contained to 2 files (v4-production-runner.ts + somnio-v4-agent.ts). Sub-loop/index.ts is ZERO TOUCH. CI gate: `git diff main -- <v3 paths> | wc -l === 0`.
5. **Token accounting needs an outer accumulator** (`totalTokensAcrossRestarts += output.totalTokens`) — single line of plumbing per iteration; final return uses accumulator instead of `output.totalTokens`.

### File Created
`/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md`

### Recommended Next Step

`/gsd:plan-phase debounce-v2-interrupt-reprocess` — the research is prescriptive enough for 4 plans:

- **Plan 01:** Runner restart loop scaffolding + CKPT-0/6a/6b conversion + Pitfall 7 fix in agent mapper. Includes Regla 6 grep gates as task verifications.
- **Plan 02:** Vitest S1..S5 (5 scenarios, ~250 LOC test code in a new file mirroring `e2e-scenarios.test.ts` pattern).
- **Plan 03:** Integration test for full runner flow with mocked adapters exercising 2-iteration restart (~200 LOC).
- **Plan 04:** LEARNINGS.md + post-ship verification (Regla 6 diff gate + manual smoke note for the sibling sandbox standalone to consume).

Zero new modules. Zero new types. Zero migrations. Zero feature flags. Zero changes to v3/godentist/recompra/pw-confirmation paths.
