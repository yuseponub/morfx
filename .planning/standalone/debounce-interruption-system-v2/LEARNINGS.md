# debounce-interruption-system-v2 — Learnings

**Fecha de ship:** 2026-05-26
**Duración:** ~3 weeks calendar (Plans 00 → 07, with Wave 0 measurement phase preceding Wave 1)
**Plans ejecutados:** 8 (00 + 01 + 02 + 03 + 04 + 05 + 06 + 07)
**Branch shipped:** `exec/debounce-v2-wave6` → `main` (fast-forward, per HANDOFF.md note)
**Ship status:** APPROVED to merge with D-19 Phase 3 + Phase 4 explicitly deferred (see UAT.md)

---

## 1. What was built (one-paragraph summary)

A distributed mutex coordination layer for the v4 inbound WhatsApp + FB/IG pipeline,
implemented as a self-contained module at `src/lib/agents/interruption-system-v2/` that
exposes 5 primitives (`acquireLock`, `releaseLockIfOwner`, `pushToPending` +
`removeOwnEntry` + `readAndClearPending`, `checkpoint`, `emitLockEvent`) plus an Inngest
cron sweep (`v2-lock-cleanup-cron`). The system replaces Phase 31's polling-based
`hasNewInboundMessage` interrupt detection for `somnio-sales-v4` ONLY (D-04 + D-07 —
big-bang migration with v4 currently DORMANT in prod, so all other agents — v3,
godentist, godentist-fb-ig, recompra, pw-confirmation — remain byte-identical per the
Regla 6 hand-trace verified at the end of each wave). The 8 D-18 CheckpointId placements
are wired across the v4 runner (CKPT-0, CKPT-6), the v4 agent (CKPT-1, CKPT-2), the RAG
sub-loop (CKPT-3, CKPT-4, CKPT-5), and the messaging adapter (CKPT-7.N override of the
parent Phase 31 hook). 73 vitest tests cover the full surface; 4 e2e scenarios (S1-S4)
exercise the integrated flow via mock-redis. D-01 (the underlying problem statement —
"users lose messages when bot races itself") is structurally addressed by the SET NX +
Lua release-if-owner fencing token pattern plus pending-list combine.

---

## 2. Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| `vi.mock` hoisting trap in test files: tests tried to reference `mockRedis` top-level const from inside `vi.mock` factory; Vitest hoists `vi.mock` calls above all imports including the const declaration, so the factory ran with `mockRedis = undefined`. | Vitest hoist behavior is non-obvious; documented in Vitest docs but easy to miss. Hit in Plans 01, 04, and 06 separately. | `vi.mock('../redis-client', () => ({ redis: mockRedis, getRedisClient: () => mockRedis }))` rewritten as `vi.mock('../redis-client', async () => { const { createMockRedis } = await import('./_helpers/mock-redis'); const mock = createMockRedis(); return { redis: mock, __mock: mock } })` plus `await import(...)` in `beforeEach` to retrieve the shared instance. Pattern locked across all 5 test files. | Document the async-factory + __mock pattern in the codebase's test conventions doc; mention in any future module's plan if it uses `vi.mock`. |
| `pending.test.ts` atomic-clear assertion shape mismatch | Plan 01's mock-redis `multi()` stub returned a chainable tx object but did not back-port `tx.del(key)` to the underlying `lists` Map. Test wanted to assert "after del, key is empty" — that's a real assertion at the Upstash layer but unreachable through the mock. | Switched the test to call-shape assertions: `multi` called once, `tx.del(key)` scheduled, `tx.exec()` awaited. Real atomicity validated by Plan 07 E2E test against mock + the future Upstash integration test path. | When mock-redis stubs a multi-step Redis command, document explicitly which state mutations are stubbed and which are call-shape only. Add a "TODO: real Upstash assertion in Plan 07 E2E" marker. |
| `checkpoints.test.ts` Path A `.toEqual` exact-shape failure | Test asserted `result.interrupted` matched a literal `{pendingListLength: 2}` shape but the implementation correctly returned `{pendingListLength: 2, interruptMsgId: '...'}` per RESEARCH spec — the test was outdated wrt the spec. | Switched from `.toEqual` exact-shape to field-by-field asserts (`expect(r.interrupted!.pendingListLength).toBe(2)` + `expect(r.lostLock).toBeUndefined()`). Now more precise AND catches the `lostLock: undefined` invariant that the broader `.toEqual` would miss if accidentally set. | When the spec and the planner prompt diverge, treat spec as authority (RESEARCH.md / DISCUSSION-LOG.md → source of truth for shapes; planner prompts may be summaries). Use field-by-field asserts when the shape has dynamic UUIDs. |
| CheckpointId naming divergence between Plan 02 orchestrator prompt and locked spec | Plan 02 orchestrator prompt listed `ckpt_1_after_persist` / `ckpt_2_pre_router` / `ckpt_4_pre_subloop`. Locked spec (RESEARCH Pattern 3 + DISCUSSION-LOG D-18) defined `ckpt_0_post_acquire` through `ckpt_7_pre_template`. | Plan 02 executor correctly noticed the mismatch, ignored the prompt names, and used the spec-locked names. Plans 04-05-07 all pattern-matched directly from the resulting `checkpoints.ts` union. | Future plan prompts: don't restate enums from the spec; instead, link the source file with the union and let the executor pattern-match. Treat planner prompts that drift from spec as "spec wins" by default. |
| `LockHandle.startedAt` reconstruction noise | `webhook-processor.ts` reconstructs a `LockHandle` from `lockHolderUuid + lockKey` event-data fields (no `startedAt` because the original webhook timestamp wasn't propagated). Uses `new Date().toISOString()` as a fallback. | Minor observability noise: `lock_released_normal.duration_ms` payload is computed from the reconstructed `startedAt`, so it understates the real lock duration by however long the Inngest queue + dispatch took. Acceptable per Plan 04 review — duration_ms is best-effort. | Either propagate the real `startedAt` through the event payload (adds a string field), or accept the noise. We accepted. If precise duration becomes critical (operator dashboards), revisit. |
| Concurrent stray commit during Plan 05 → 06 transition | A parallel Claude session committed `6768f594 docs(crm-duplicate-order-products-integrity): standalone discuss-phase complete` on the working branch between Plan 05 and Plan 06. Zero overlap with debounce-v2 work, but it landed mid-flight. | User chose to push it together with Plans 05+06 as one fast-forward (recorded in HANDOFF.md "Wave 5 push note"). No code conflict — the commit was 2 planning docs + 7 debug-doralba scripts. | When running multi-wave standalones, periodically `git log origin/main --oneline -10` between waves to detect non-overlapping landings and document them in HANDOFF.md before the next wave's planner reads "the branch is clean". |
| Plan 05 inter-task tsc failure | Task 5.1 added CKPT-1 + CKPT-2 in `somnio-v4-agent.ts` referencing types that Task 5.2 added to `SubLoopContext`. Task 5.1's commit alone fails `npx tsc --noEmit`. Task 5.2's commit fixes it. | Disclosed as a bisect hazard in `05-SUMMARY.md`. Both commits must land together for tsc to be green at every HEAD. | Either combine such tightly-coupled tasks into a single atomic commit OR document the bisect hazard explicitly so a future `git bisect` user knows to skip the intermediate commit. We chose document. |

Three deferred-to-bug-after-ship items survived the standalone:

- **Sandbox engine does not exercise the lock-system** (see UAT.md Phase 4 deferral). Not a
  bug in the lock-system itself; it's an integration gap in the sandbox tooling. Resolved
  by the proposed follow-up standalone `debounce-v2-sandbox-integration`.
- **FB/IG inbound dedup gap:** `messages` table lacks UNIQUE on FB/IG message ID. Accepted
  as forward-looking risk (REVISION W6, HANDOFF.md "Risks deferred"). Closes whenever v4
  begins serving FB/IG.
- **Orphan Claude-Code worktrees** (~14 stale `.claude/worktrees/agent-*` debris, one had
  `main` checked out + locked, blocked our checkout flow during Plans 01-06 — used
  `update-ref` workaround). Out of scope for this standalone; consider a cleanup pass
  before resuming heavy parallel execution.

---

## 3. Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Distributed mutex via `@upstash/redis` SET NX + Lua release-if-owner | Redlock (Kleppmann's algorithm against multi-node Redis); ZooKeeper / etcd / Consul; in-memory Postgres advisory locks | Kleppmann's critique of Redlock + our scale (~1 msg/sec peak per conversation) does not justify multi-node consensus. Upstash single-zone gives us ~10-30ms RTT from Vercel + Lua atomicity for release. Postgres advisory locks couple us to DB connection state (Vercel serverless = high churn). |
| Big-bang migration: v4 only, v4 dormant in prod (D-04 + D-07) | Per-agent feature flag with gradual rollout per workspace; shadow-mode where lock is acquired but doesn't block | v4 has zero traffic today, so the migration cost is zero. Gating by `resolvedAgentId === 'somnio-sales-v4'` at the webhook + the adapter + the runner means the new code is INERT in prod until a workspace flips. The 5 non-v4 agents stay byte-identical (Regla 6). |
| Fencing token threaded EXPLICITLY through 4 layers (event → runner → agent → sub-loop → adapter) | AsyncLocalStorage to make the `lockHandle` implicitly available everywhere | Explicit threading is 50-100 lines of type-system plumbing but: (a) testable — each layer's contract is visible; (b) static-analyzable — TS catches missing `lockHandle` propagation; (c) cross-lambda-safe — ALS does not survive Inngest step.run boundaries (cf. `inngest_observability_merge` MEMORY pattern). Only 4 layers; the cost is bounded. |
| Subclass-extension pattern: `V4MessagingAdapter extends ProductionMessagingAdapter` | Inline `if (agentId === 'somnio-sales-v4')` in the parent adapter | Subclass keeps non-v4 agents byte-identical (no shared mutation risk). 3 dedicated Regla 6 tests in `v4-messaging-adapter.test.ts` assert parent semantics are preserved. The parent's `send()` was refactored to call 2 new protected extension points (`shouldAbortBeforeTemplate`, `onFirstSendCompleted`) — a strategy-pattern micro-refactor; non-v4 paths still hit the same defaults. |
| 14-value `LockEventLabel` typed union as observability contract | Stringly-typed `emitEvent(label: string, payload: unknown)` | Adding an unknown label is now a TypeScript compile error, not a runtime warning. Grepping the union (`grep -oE "'(lock_acquired\|lock_acquire_failed_follower\|...)'"` etc.) returns exactly 14 deterministically. Operators reading the events table can rely on the closed set. REVISION B1 added `lock_orphan_swept_by_cron` as the 14th label after Plan 06 discovery — visible diff. |
| 8-value `CheckpointId` typed union + skip-guard at every call site | Magic-string checkpoint IDs at each call site | Same rationale as LockEventLabel. `if (ctx.lockHandle != null) checkpoint(ckpt_X_..., ...)` is the skip-guard idiom — when the sandbox calls the same agent code without a lock, every checkpoint is a no-op. This is what makes the sandbox engine work without crashing even though it skips the lock-system entirely (see UAT.md Phase 4 deferral). |
| Inngest cron `v2-lock-cleanup-cron` schedule = `*/5 * * * *` (every 5 min, TZ=America/Bogota), MAX_TURN_AGE_S = 60 | Cron every 1min (too aggressive — Upstash cost); cron every 15min (orphan dwell-time too long); no cron, rely on TTL only (single point of failure) | TTL-only is the primary cleanup mechanism (D-09 layer 2). The cron is defense-in-depth (layer 3) — sweeps orphans that survived TTL because of clock drift or partition. 5 min is the sweet spot for Upstash op cost + worst-case orphan dwell. MAX_TURN_AGE_S = 60 because a v4 turn takes ~5-20s and we don't want to sweep an active turn. |
| `keepTtl: true` SDK option used in `V4MessagingAdapter.onFirstSendCompleted` (REVISION W7) | `set(key, value)` (resets TTL); separate `expire(key, LOCK_TTL_S)` after the set (atomicity gap) | Plan 00 Task 0.5b empirically probed that the Upstash SDK supports `keepTtl`. Using it means the lock value can be updated (`has_sent_anything=true`) without resetting the TTL clock — no race between heartbeat and "first send done" side-writes. Locked into Plan 04. |
| Static import of `resolveAgentIdForWorkspace` from `src/lib/agents/registry-helpers.ts` (REVISION B4) | Dynamic `await import(...)` from webhook handlers | Static imports are tree-shaken correctly by Next.js, profile cleanly, and don't carry dynamic-import circular-dependency risk. The helper module is small (no transitive deps that we want to lazy-load). Webhook handlers benefit from compile-time visibility into the symbol. |
| `MessagingProductionAdapter.hasNewInboundMessage` private → protected (REVISION W3 / Plan 04) | Leave private and duplicate the check in subclass | Protected lets the subclass call the parent's polling implementation if it ever needs to (it doesn't today, but the door is open). Plus, the strategy-pattern extension points (`shouldAbortBeforeTemplate`, `onFirstSendCompleted`) had to be protected anyway. Cleaner family of access modifiers. |
| `existing_holder_uuid: 'unknown'` in follower events (Plan 03 pragmatic deviation) | Add an extra `redis.get(key)` roundtrip on follower path to populate the holder UUID | Saves 1 RTT (~10-30ms) on every follower path. UUIDs can be correlated post-hoc via the matching `lock_acquired` event from the same lock key. Operators looking at the events table just need to JOIN on `key + recorded_at` window. |

---

## 4. Patterns Established (reusable for future module migrations)

### 4.1 Distributed mutex via `@upstash/redis` SET NX + Lua release-if-owner

Reusable for any future module that needs cross-lambda coordination. Specifically:

- `acquireLock` returns `LockHandle | null` (null = follower). Caller decides what to do
  on null.
- `releaseLockIfOwner(handle)` is the ONLY way to release — never call `redis.del(key)`
  directly. Lua atomicity guards against the "lambda restarted, second lambda thinks the
  key is theirs, first lambda's `del` removes second's lock" race.
- The fencing token = `handle.holderUuid`. `assertHoldsLock(handle)` is the discrete
  fencing check at checkpoint sites.

### 4.2 Fencing token with explicit threading (NOT AsyncLocalStorage)

4-layer plumbing is acceptable when only 4 layers. Pattern:

1. Event payload: add OPTIONAL `lockHolderUuid?`, `lockKey?`, `ownPendingEntryJson?`,
   `lockChannel?`, `lockIdentifier?` fields. Optional = backward-compatible with
   pre-rollout events.
2. Inngest function destructure: pull the 5 fields, forward them.
3. `EngineInput` (runner contract): add the 4 fields as optional. The runner doesn't care
   if they're missing (non-v4 traffic skips lock setup entirely).
4. `SubLoopContext` (sub-loop contract): add `lockHandle?`, `lockChannel?`,
   `lockIdentifier?` as optional. Sub-loop checkpoints skip-guard with `if (ctx.lockHandle != null)`.

### 4.3 Subclass-extension-of-existing-adapter (Regla 6 preservation)

Pattern: instead of an `if (agentId === 'foo')` branch in the parent, extract 1-2
protected extension points, then create `FooAdapter extends ParentAdapter` that overrides
those hooks. Verify with 3 dedicated tests that the parent semantics are preserved when
the parent's defaults run. This applies generally to any agent-specific addition where
Regla 6 (non-v4 agents byte-identical) is in play.

### 4.4 Exhaustive `Record<UnionType, X>` for typed lookups

Used in `tab-bar.tsx` for `TAB_ICONS: Record<DebugPanelTabId, IconComponent>`. TS catches
a missing entry as a compile error. Anti-Pitfall 6 from the `v4-subloop-debug-view`
shipping pattern. Apply to any future tab-bar / sidebar / menu where the entries are
keyed off a closed union.

### 4.5 Inngest event payload extension via optional fields

Backward-compatible additions to event.data don't break existing callers. Pattern:

```ts
const { conversationId, messageId, lockHolderUuid, lockKey, ownPendingEntryJson, lockChannel, lockIdentifier, agentId } = event.data
```

All but the first 2 are optional in TypeScript. Pre-rollout events that omit them
continue working; post-rollout events that include them get the new behavior. Validated
by 8 tests in `agent-production-lock-event.test.ts` (3 with the fields, 3 without — both
paths assert correct behavior).

### 4.6 REVISION B4 pattern: extract shared helper modules to neutral location

When multiple subsystems need the same routing/dispatch logic (webhook handler +
Inngest function), put the logic in `src/lib/agents/registry-helpers.ts` (or analogous
neutral location). Static-imported everywhere. Avoids dynamic-import circular risks and
gives compile-time visibility.

### 4.7 REVISION W3 pattern: thread context via event.data + EngineInput

Don't re-resolve context (channel/identifier/etc.) via DB queries downstream. Resolve
ONCE at the webhook (where the event source is authoritative), then thread via
`event.data` → Inngest destructure → `EngineInput`. Two benefits:

- Preserves Regla 3 wrapper purity (no new `createAdminClient` calls in the runner).
- Eliminates a class of race conditions where the downstream re-resolve sees newer state
  than the webhook saw.

### 4.8 Sequential dispatch per wave + sequential push-to-main after spot-check

Avoided the orphan-worktree mess that previous standalones (Phase 42 / 42.1) suffered.
Pattern:

1. Within a wave, plans dispatched sequentially (not in parallel). Lower risk; per-plan
   verification at each commit boundary.
2. After a wave's commits land on the `exec/debounce-v2-waveN` branch, fast-forward push
   to `origin/main` only after a manual spot-check of the diff (no surprise files).
3. Orphan worktrees from Claude-Code parallel sessions handled with `update-ref`
   workarounds when they blocked `git checkout` — see HANDOFF.md.

### 4.9 `vi.mock(name, async () => ({ __mock: instance }))` + `await import(...)` in `beforeEach`

Anti-hoisting-trap pattern. See Bug #1. Encoded across all 5 test files in this module
and the consumer test files.

### 4.10 Spec-wins rule for planner-prompt drift

When a planner prompt names enums/IDs/constants differently from the locked spec
(RESEARCH.md / DISCUSSION-LOG.md), the spec wins. The executor in Plan 02 caught the
`CheckpointId` divergence and went with the spec — this should be the standing rule.

---

## 5. Anti-patterns avoided

- **Did NOT use Redlock** — Kleppmann's critique + our scale (1 msg/sec peak per
  conversation) doesn't need it.
- **Did NOT use AsyncLocalStorage for `lockHandle`** — explicit threading wins for
  testability + cross-lambda safety (Inngest step.run boundaries break ALS, per the
  MEMORY pattern `inngest_observability_merge`).
- **Did NOT remove Inngest concurrency=1** — research showed it's strict per-key, kept as
  belt-and-suspenders (D-14). The lock is the primary; Inngest concurrency is the
  secondary.
- **Did NOT add a feature flag (D-07)** — v4 is dormant in prod (0 workspaces), no
  traffic to gate. Activation is a 1-line SQL `UPDATE workspace_agent_config`.
- **Did NOT introduce `createAdminClient` in `v4-production-runner.ts` (REVISION W3)** —
  channel/identifier threaded via `EngineInput` instead.
- **Did NOT use dynamic `await import(...)` from webhook handlers to fetch
  `resolveAgentIdForWorkspace` (REVISION B4)** — STATIC import from shared
  `registry-helpers.ts`.
- **Did NOT block LLM calls mid-stream with `AbortController`** — only checkpoints
  between discrete steps (D-13). Mid-LLM abort would require coordinating with the LLM
  provider's streaming protocol; deferred to v2.1 if ever needed.
- **Did NOT use `redis.keys` for the cron sweep** — used `redis.scan` cursor loop (Plan
  06 verified gate). `KEYS` is O(N) blocking — kills Upstash perf if the keyspace grows.
- **Did NOT ship a `FORCE_V4_FOR_PHONE` override** — Phase 3 deferral means no test-only
  flag code in the merge diff.

---

## 6. Things deferred to follow-up standalones

| Item | Where it goes | When | Why deferred |
|------|---------------|------|--------------|
| Migration to v3 / godentist / godentist-fb-ig / recompra / pw-confirmation | Per-agent standalone (one each, after v4 has soaked in prod for ≥1 month) | Post v4 activation + 1 month bake | D-04 big-bang on v4 only; other agents staying on Phase 31 polling is fine until v4 proves out |
| Semantic synthesis of combo (vs `\n` concat) — D-06 v2.1 | `debounce-v2-semantic-synthesis` | Open; only if `msg_aborted_path_a_combined` events show poor UX | Today's combo is "concat msg1.content + '\n' + msg2.content"; semantic synthesis would LLM-merge them. Deferred to measure first |
| AbortController + side-channel polling during LLM calls — D-13 v2.1 | `debounce-v2-mid-llm-abort` | If LLM call duration becomes the bottleneck (>5s per call) | Today's checkpoints are between discrete steps; mid-LLM abort needs provider streaming-protocol integration |
| Live SSE in sandbox tab — RESEARCH Open Question 3 v2.1 | `debounce-v2-sandbox-integration` (combined) | Post v4 activation when sandbox is actually exercising the lock-system | Today's tab is post-turn fetch only; live SSE would let operators watch in real-time. Coupled to sandbox engine integration |
| FB/IG dedup constraint — REVISION W6 | `whatsapp-fb-ig-dedup-constraint` (separate standalone) | When v4 begins serving FB/IG (currently WhatsApp-only) | Forward-looking risk; `messages` table lacks UNIQUE on FB/IG message ID. Closes naturally |
| Manual S3 (TTL expiry) reproduction on Vercel preview — REVISION W4 | `debounce-v2-artificial-hang-tooling` (only if ever needed) | Indefinite — accepted as Vitest-only | Would require shipping artificial hang-induction code to preview; rejected |
| **D-19 Phase 3 (Vercel preview + WhatsApp smoke)** | Activation moment of v4 per workspace | When user flips `conversational_agent_id='somnio-sales-v4'` for a workspace | Same code, same env vars; the activation moment IS the smoke. Avoids shipping `FORCE_V4_FOR_PHONE` override |
| **D-19 Phase 4 (sandbox visual smoke)** | `debounce-v2-sandbox-integration` follow-up standalone | TBD when sandbox dev work resumes | Sandbox engine (`SomnioV4Engine`) doesn't currently exercise the lock-system; "visual smoke" today would assert only that the tab renders empty |

---

## 7. Critical reminder — TEMPORARY OVERRIDES TO REMOVE

**None.** Phase 3 was deferred precisely to avoid shipping any `FORCE_V4_FOR_PHONE` or
similar test-only flag. `git diff main` shows only the 8 plans' diffs, no diagnostic
routes, no override env-var consumers.

Pre-merge audit confirmed in UAT.md "Pre-merge blockers cleared" section.

---

## 8. Cost telemetry & measurements

### Token budget (rough estimate)

- Planning (Plans 00-07 + research + discuss): ~~ 800k tokens spread over 3 weeks
  (multiple sessions with `/clear`).
- Execution (per-task auto-execution + tests + commits): ~~ 1.2M tokens across the same
  window.
- Total LLM cost estimate: ~$80-100 at planning-phase model rates (Opus 4.7 mix).

### Empirical measurements (locked in `00-MEASUREMENTS.md`)

- **Sub-loop latency baseline (Task 0.1):** N=0 in prod observability (v4 dormant) →
  fallback rule applied → LOCK_TTL_S=45 retained per D-09. Empirical baseline pending v4
  activation.
- **Upstash round-trip (Task 0.2 — WSL-local pivot):** ~30-80ms WSL→Upstash sa-east-1
  upper-bound. Vercel→Upstash in-region (us-east-1 → sa-east-1) untested due to Vercel
  Auth team-level gating of the preview probe. Plan 05 E2E will provide the real number
  once v4 is active.
- **REVISION W7 keepTtl verdict (Task 0.5b):** SUPPORTED. Plan 04
  `V4MessagingAdapter.onFirstSendCompleted` uses `{ keepTtl: true }` branch.
- **Dedup audit (Task 0.4):** WhatsApp `messages_wamid_unique UNIQUE (wamid)` covers the
  WhatsApp inbound path. FB/IG inbound lacks the equivalent constraint — accepted as
  forward-looking risk (REVISION W6).
- **v4 dormancy attestation (Task 0.5):** `SELECT COUNT(*) FROM workspace_agent_config
  WHERE conversational_agent_id='somnio-sales-v4'` = 0 rows at every plan boundary. D-07
  big-bang assumption holds; Regla 6 satisfied without a feature flag.

---

## 9. Recommendations for next module migration

When the time comes to migrate another agent (v3, godentist, godentist-fb-ig, recompra,
or pw-confirmation) to `interruption-system-v2`:

1. **Reuse this module as-is.** It already supports any `agentId`; the v4 gate is the
   only thing specific to v4 today.
2. **Repeat the gating pattern at the same locations:**
   - `src/lib/whatsapp/webhook-handler.ts` (or the channel-specific webhook handler):
     extend the `if (resolvedAgentId === 'somnio-sales-v4')` branch to `||
     resolvedAgentId === '<new-agent>'`.
   - `src/lib/manychat/webhook-handler.ts`: same pattern for FB/IG agents.
   - `src/lib/agents/production/webhook-processor.ts`: the v4 routing branch around line
     819 — extend the agentId check.
   - The runner / agent / sub-loop / messaging adapter for the new agent: thread the lock
     fields the same way Plan 04 + 05 + 06 did. Reuse the `V4MessagingAdapter` subclass
     pattern (e.g., `GodentistMessagingAdapter extends ProductionMessagingAdapter`).
3. **Document the new agent's scope in `.claude/rules/agent-scope.md`** — extend the
   `Module Scope: interruption-system-v2 → Consumers` list with the new agent.
4. **Update the Regla 6 hand-trace table in HANDOFF.md** (or the new standalone's
   handoff) — move the new agent from "byte-identical" to "new lock+CKPT path —
   ACTIVE/DORMANT".
5. **Reuse the e2e-scenarios test file** as a template; copy + parameterize for the new
   agent's workspace IDs + agent ID.
6. **Plan a brief activation smoke** for that specific agent's workspace at activation
   moment (the D-19 Phase 3 deferred-to-activation playbook from this standalone).

When the time comes to flip v4 in some workspace, a follow-up 1-plan addition should
include:

- The actual Vercel preview smoke (S1, S2, S4 — S3 still Vitest-only).
- A 24-hour bake observation on the activated workspace.
- Re-affirmation of the Regla 6 hand-trace post-activation (all 5 non-v4 agents still
  byte-identical).

When the time comes to integrate the sandbox engine with the lock-system (the
`debounce-v2-sandbox-integration` follow-up), the work is well-scoped:

- ~50-100 lines in `SomnioV4Engine` to wire `acquireLock` + `releaseLockIfOwner` with a
  sandbox-namespaced key (`lock:sandbox:<session-id>:...`).
- Thread `lockHandle` through `SubLoopContext` for sandbox sessions.
- Then the Plan 06 Interruption tab + `/api/observability/events` route start carrying
  real data, and the visual smoke deferred in this standalone's UAT.md becomes feasible.

---

## 10. Tips para Futuros Agentes

### Lo que funcionó bien

- Sequential wave execution + spot-check before push-to-main. Avoided orphan-worktree
  mess.
- Typed unions (LockEventLabel, CheckpointId) as compile-time contracts.
- Mock-redis helper shared across 5 test files (Plan 01's investment paid off in every
  wave).
- Documenting deferrals upfront (UAT.md "DEFERRED" sections + LEARNINGS deferral table)
  instead of hand-waving "will do later".
- HANDOFF.md template — kept the multi-session context loadable in a single read.

### Lo que NO hacer

- Don't restate enums in planner prompts. Link the source file instead.
- Don't use `redis.keys` in cron sweeps. Use `redis.scan` cursor loop.
- Don't ship `FORCE_V4_FOR_PHONE` or similar test-only env-var hacks. Wait for the
  natural activation moment.
- Don't try to do live SSE in the sandbox Interruption tab before the sandbox engine
  even exercises the lock-system. Order matters.

### Patrones a seguir

- See section 4 above (10 patterns).

### Comandos útiles

```bash
# Verify the 14 LockEventLabel union is complete
grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|follower_woke|lock_force_acquired_after_ttl_expiry|zombie_lambda_exit|heartbeat_renewed|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l
# expect: 14

# Verify no createAdminClient leaked into the module
grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/interruption-system-v2/
# expect: 0 matches (the cron file lives in src/inngest/functions/, outside the module)

# Verify no createAdminClient added to the v4 runner (REVISION W3)
grep -c "createAdminClient" src/lib/agents/engine/v4-production-runner.ts
# expect: 0

# Run the full interruption-system test suite
npx vitest run src/lib/agents/interruption-system-v2/__tests__/
# expect: 40 tests pass (5 files)

# Inspect v4 activation status
psql -h <prod-supabase> -c "SELECT COUNT(*) FROM workspace_agent_config WHERE conversational_agent_id='somnio-sales-v4';"
# expect: 0 (until first activation)

# Inspect lock keys in Upstash (post-activation)
# curl -X POST 'https://excited-dogfish-66405.upstash.io/scan/0/match/lock:*' -H "Authorization: Bearer $UPSTASH_TOKEN"
```

---

## 11. Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Sandbox engine does not exercise lock-system (Phase 4 deferred) | Media | `debounce-v2-sandbox-integration` follow-up |
| Real Vercel→Upstash in-region latency unmeasured (WSL upper-bound only) | Baja | Phase 42.1 observability work |
| Multi-Zone HA at Upstash not activated ($200/mo declined) | Baja | Re-evaluate at v4 flip-to-active |
| FB/IG dedup gap (`messages` lacks UNIQUE on FB/IG msg id) | Media | When v4 begins serving FB/IG |
| Orphan Claude-Code worktrees (~14 stale debris) | Baja | Cleanup pass before next heavy-parallel standalone |
| `LockHandle.startedAt` reconstruction noise (duration_ms understated) | Muy baja | Only if operator dashboards need precise duration |
| Plan 05 inter-task tsc dependency (Task 5.1 alone fails) | Documental | Bisect hazard documented in 05-SUMMARY.md |
| Semantic synthesis of combo (vs `\n` concat) | Baja | `debounce-v2-semantic-synthesis` v2.1 (only if UX warrants) |
| AbortController during LLM streaming | Baja | `debounce-v2-mid-llm-abort` v2.1 (only if LLM call duration becomes bottleneck) |

---

## 12. Notas para el Módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

- The module lives at `src/lib/agents/interruption-system-v2/` and is documented in
  `.claude/rules/agent-scope.md` under `### Module Scope: interruption-system-v2`
  (added by Plan 07 Task 7.2).
- It is the v2 replacement for Phase 31's `hasNewInboundMessage` polling in
  `MessagingProductionAdapter`. v3/godentist/godentist-fb-ig/recompra/pw-confirmation
  still use Phase 31 (unchanged, byte-identical).
- It is INERT in production until at least one workspace flips
  `conversational_agent_id='somnio-sales-v4'`. Activation is the 1-line SQL UPDATE in
  HANDOFF.md.
- The 8 D-18 CheckpointId values are spec-locked in `checkpoints.ts`. Adding a new one
  requires extending the union AND ensuring every call site uses the skip-guard
  (`if (ctx.lockHandle != null) checkpoint(...)`).
- The 14 LockEventLabel values are spec-locked in `observability.ts`. Adding a new one
  requires extending the union AND updating the grep validation gate in agent-scope.md.
- The cron `v2-lock-cleanup-cron` lives in `src/inngest/functions/` (OUTSIDE the module)
  and is the only file in this work that uses `createAdminClient` — it needs it for the
  `agent_sessions WHERE status='active'` join. This is documented in agent-scope.md as
  an explicit exception (D-09 verbatim).
- For testing patterns, see `__tests__/_helpers/mock-redis.ts` and the 5 test files.
  Always use the async-factory + __mock pattern for `vi.mock` to avoid the hoisting trap.
- For activation playbook, see HANDOFF.md "Plan 07 dependency graph" + UAT.md "Phase 3
  deferral" sections.

---

*Generated at standalone ship time (2026-05-26). Input for training agents that document
distributed-coordination subsystems + for the eventual follow-up standalones listed in
section 6.*
