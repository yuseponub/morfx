---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 04
type: execute
wave: 4
depends_on: [01, 02, 03]
files_modified:
  - .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md
  - .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md
  - .claude/rules/agent-scope.md
autonomous: true
requirements:
  - D-01  # Path B scope ack
  - D-02  # Fresh comprehension per restart ack
  - D-03  # No cap, no timeout ack
  - D-04  # Same lambda ack
  - D-05  # Triggers = CKPTs 0..6 ack
  - D-06  # v4-only Regla 6 ack
  - D-07  # No feature flag ack
  - D-08  # No DB migration ack
  - D-09  # Tests S1..S5 ack

must_haves:
  truths:
    - "LEARNINGS.md captures: the restart-loop pattern, the Pitfall 7 second-bug discovery + fix, the `effectiveMessage` accumulator pattern as reusable for migrating v3/godentist/recompra/pw-confirmation to v4, the Regla 6 byte-identity grep gates pattern, the no-DB-write-during-restart pattern (Pitfall 8)."
    - "UAT.md captures the user's accept-or-reject checklist: 5 vitest scenarios green; Regla 6 grep gates clean; production code only modifies v4-production-runner.ts + somnio-v4-agent.ts; sub-loop + types.ts zero-touch; legacy `wasInterruptedWithZeroSends` block preserved; no feature flag introduced; no DB migration; v4 still dormant in prod (zero customer impact). Manual smoke is DEFERRED to sibling standalone `debounce-v2-sandbox-integration` (per DISCUSSION-LOG.md scope note)."
    - "`.claude/rules/agent-scope.md` has the existing `### Module Scope: interruption-system-v2` block UPDATED with a brief note that the standalone `debounce-v2-interrupt-reprocess` (shipped <date>) added in-lambda restart semantics for Path A interrupts (CKPTs 0..6) — sub-loop & module-internal contracts unchanged."
    - "Memory file note added for the orchestrator to merge into `~/.claude/projects/.../MEMORY.md` after this plan ships (the orchestrator handles the memory append, not this plan)."
  artifacts:
    - path: ".planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md"
      provides: "Reusable patterns + bugs encountered + anti-patterns avoided + deferred follow-ups"
      contains: "Patterns established\\|Anti-patterns\\|Bugs encountered"
    - path: ".planning/standalone/debounce-v2-interrupt-reprocess/UAT.md"
      provides: "User acceptance checklist + sign-off block"
      contains: "approved"
    - path: ".claude/rules/agent-scope.md"
      provides: "Update to existing interruption-system-v2 Module Scope referencing this standalone"
      contains: "debounce-v2-interrupt-reprocess"
  key_links:
    - from: ".planning/standalone/debounce-v2-interrupt-reprocess/UAT.md"
      to: "Plans 01..03 verification commands"
      via: "Checklist items reference greps + vitest commands from Plans 01/02/03 verification sections"
      pattern: "vitest\\|grep"
---

<objective>
Wave 4 — Closure plan. Document what shipped, ratify acceptance, update the project skill / module scope, prepare orchestrator handoff. No production code changes — only `.planning/` + `.claude/rules/`.

Purpose: the parent standalone established a 4-phase D-19 gate (unit / e2e / preview / sandbox). This standalone is a focused control-flow fix — manual WhatsApp smoke is deferred to the sibling `debounce-v2-sandbox-integration` (per DISCUSSION-LOG.md "Out of scope" note that the sandbox integration is paused pending this ship). The closure here is therefore lighter: vitest gates + Regla 6 diff gates + LEARNINGS + UAT sign-off.

Output: 3 files modified — LEARNINGS, UAT, agent-scope. Then orchestrator triggers commit + push.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/debounce-v2-interrupt-reprocess/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md
@.planning/standalone/debounce-v2-interrupt-reprocess/01-SUMMARY.md
@.planning/standalone/debounce-v2-interrupt-reprocess/02-SUMMARY.md
@.planning/standalone/debounce-v2-interrupt-reprocess/03-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/LEARNINGS.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 4.1: Write LEARNINGS.md</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md (parent standalone — template reference for shape/sections)
    - .planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md (Pitfalls 1-9 — translate to "anti-patterns avoided" section)
    - 01-SUMMARY.md / 02-SUMMARY.md / 03-SUMMARY.md (any unexpected issues encountered during execution)
  </read_first>
  <action>
    Create `.planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` covering:

    ```markdown
    # LEARNINGS — debounce-v2-interrupt-reprocess

    Shipped: <date>
    Plans: 4 (01 runner+agent refactor, 02 unit tests S1-S5, 03 integration test, 04 closure)
    Production code delta: ~+70/-8 LOC across 2 files (v4-production-runner.ts + somnio-v4-agent.ts)
    Test code delta: ~+450 LOC across 2 new test files

    ## What was built (1-paragraph summary)

    Converted the v4 inbound-message pipeline from "silent persist + return on interrupt"
    semantics to "restart in-lambda" semantics. When a Path A interrupt fires at CKPT-0
    through CKPT-6, the runner now drains the pending list, combines those messages with
    the current `effectiveMessage`, and re-runs the turn pipeline within the SAME lambda
    invocation under the SAME lock (heartbeat keeps the lock alive). Bot now responds in
    ~2 seconds after customer stops typing instead of staying mute until a 3rd message
    or L1/L2 timer (D-01..D-08 of `debounce-v2-interrupt-reprocess` DISCUSSION-LOG).
    Path B (post-send) preserved verbatim. CKPT-7.N (per-template send loop) NOT in scope.

    ## Bugs encountered during execution

    1. **<list any bugs found while implementing Plans 01..03; if none, write "None — research was prescriptive enough">**
    2. **<e.g., line numbers from RESEARCH 2026-05-26 snapshot drifted because prior PR landed; resolved via structural grep anchors>**
    3. **<e.g., test S3 needed a side-effect hook on the agent mock to mutate mock-redis state between iterations; documented pattern below>**

    ## Patterns established (reusable for future migrations)

    1. **Restart-loop-in-orchestrator pattern.** When a stateful primitive (lock, transaction,
       session) wraps a complex async pipeline and a "retry with combined input" semantic is
       needed, put the restart loop in the ORCHESTRATOR (runner), not the pipeline (agent).
       The orchestrator owns: state snapshot ("what was the input?"), primitive lifecycle
       (acquire / heartbeat / release), and side-channel access (pending list drain). The
       pipeline returns a discriminator outcome; the orchestrator decides whether to retry.

    2. **String-prefix discriminator (vs typed boolean).** When propagating "interrupt detected
       at point N" signals upward through 3 layers (sub-loop → agent → runner), reusing the
       existing `errorMessage?: string` field with a prefix protocol (`interrupted_at_ckpt_*`)
       is preferable to introducing a typed boolean (e.g., `restart: true`). Rationale: the
       prefix is greppable in Vercel logs, type field already exists, no contract churn.
       (See R-04 in RESEARCH.md.)

    3. **In-memory accumulator vs DB-write per iteration.** During restart-loop iterations,
       keep the combined message in an in-memory `effectiveMessage: string | null` variable.
       NEVER write to DB between iterations. Lock + heartbeat already provides exclusion;
       DB writes inside the loop are pure overhead. Pitfall 8 in RESEARCH.md.

    4. **Legacy block preservation as "known-reachable-rare-case" comment.** When a refactor
       replaces 3 of 4 paths to a piece of code, ADD A COMMENT to the 4th (now isolated)
       path documenting which edge case keeps it live. The `wasInterruptedWithZeroSends`
       block stayed for the CKPT-7.1 first-byte abort case; the comment cross-references
       D-05 + Pitfall 5 so a future refactor doesn't delete it as "dead code."

    5. **Multi-modal Regla 6 verification: static + behavioral + diff.** Three independent
       gates prove a refactor doesn't leak into protected paths:
       - Static (grep): no imports of the new module in protected paths.
       - Behavioral (vitest): instantiate the protected runner and assert zero emit calls.
       - Diff (git): `git diff --stat main -- <protected paths> | wc -l === 0`.
       Each modality catches a different class of mistake (typo in import, runtime side-effect,
       silent edit). Document these together as a reusable Regla 6 contract template.

    6. **Token accumulation across restart iterations.** When the same outer function calls
       a token-consuming child multiple times within a single invocation, surface the TOTAL
       cost at the outer return — not just the final child's cost. `totalTokensAcrossRestarts`
       pattern. Without this, cost dashboards underreport restart-heavy turns by 50-66%.

    ## Second bug surfaced during research (Pitfall 7)

    `mapOutcomeToAgentOutput` was silently converting sub-loop CKPT-3/4/5 interrupts
    (`outcome.reason: 'interrupted_at_ckpt_3_post_tooling'` etc.) into `{ newMode: 'handoff',
    requiresHuman: true }` — meaning a customer typing fast during the sub-loop would have
    their session converted to "handoff to human agent" mode without ever reaching a human.
    This was a hidden second bug that the discuss-phase did not foresee; research surfaced
    it by reading `mapOutcomeToAgentOutput` and noticing the no_match branch wasn't
    discriminating between "real KB miss" vs "interrupt-mid-processing".

    **Fix:** 10-line prefix check at the top of the no_match branch. If `outcome.reason`
    starts with `interrupted_at_ckpt_`, return `{ success: false, errorMessage: outcome.reason,
    messages: [] }` (matches the agent's in-agent CKPT-1/CKPT-2 interrupt return shape).
    Else fall through to the existing handoff path.

    **Pattern reminder:** when adding a new exit reason to a sum-type (here: LoopOutcome.reason
    string), audit every consumer that pattern-matches on the OLD reasons to ensure they
    correctly route the new reason.

    ## Anti-patterns avoided

    - **Did NOT** put the restart loop in the agent. Agent's job is "given THIS message,
      what's the output?" — a pure function. Loop is an orchestration concern (R-01).
    - **Did NOT** introduce a typed `restart: true` boolean. Reused `errorMessage` field
      with prefix protocol (R-04).
    - **Did NOT** modify `sub-loop/index.ts`. Sub-loop already emitted the correct shape;
      only the consuming mapper needed fixing (R-04 + Pitfall 7 isolation).
    - **Did NOT** modify `types.ts`. Existing `errorMessage?: string` field supports the
      prefix protocol via convention, not via type system.
    - **Did NOT** add a feature flag. v4 is dormant in prod (D-07); flag would be pure
      ceremony.
    - **Did NOT** add a DB migration. Pure control-flow change (D-08).
    - **Did NOT** add a restart cap or timeout. Trust natural quiescence; lock TTL +
      heartbeat keep lambda alive (D-03). If runaway scenarios appear in prod, revisit
      in v2.1.
    - **Did NOT** persist `_v3:pendingUserMessage` during restart iterations. In-memory
      `effectiveMessage` only. Legacy `wasInterruptedWithZeroSends` block (CKPT-7.1 edge
      case) is the ONLY remaining DB-persist site (Pitfall 8).
    - **Did NOT** restart the heartbeat per iteration. `startHeartbeat()` runs once
      OUTSIDE the while loop; `stopHeartbeat()` runs once in finally (Pitfall 6).

    ## Things deferred to follow-up

    - **Sandbox visual smoke** — deferred to sibling standalone `debounce-v2-sandbox-integration`
      (per DISCUSSION-LOG.md "Out of scope" section). That sibling consumes the same
      observability events (`msg_aborted_path_a_combined` + `pending_list_combined` with
      `restart_iteration` field) and renders them in the sandbox `/sandbox` Interruption tab.
    - **Real WhatsApp smoke** — deferred. v4 is dormant in prod (zero workspaces have
      `conversational_agent_id='somnio-sales-v4'`). The fix activates only when v4 is
      enabled per-workspace via SQL flip (same migration path as parent standalone).
    - **Restart cap / runaway-troll protection** — D-03 explicit: re-evaluate if prod
      shows pathological restart counts. Default position: trust quiescence.
    - **Semantic synthesis of combined message** — currently `\n`-concat. Could be smarter
      (e.g., "user typed: msg1. then added: msg2. final: msg3") for better LLM comprehension.
      Defer to v2.1 if observed.
    - **Migration to v3/godentist/recompra/pw-confirmation** — per-agent follow-up standalones
      (per parent D-06 + this standalone D-06).
    - **`mapOutcomeToAgentOutput` exported for direct testing** — currently private to the
      agent module. Plan 03 had to go through `processMessage` to test it. If future
      refactors need direct testing, consider exporting via a `__test__` re-export.

    ## Verification evidence

    - Plan 01 SUMMARY: confirms restart-loop scaffolding + Pitfall 7 fix + Regla 6 + sub-loop
      zero-touch + types.ts zero-touch gates all green.
    - Plan 02 SUMMARY: confirms 5 vitest scenarios pass + full module suite green.
    - Plan 03 SUMMARY: confirms integration test via real `mapOutcomeToAgentOutput` mapper
      pass (or documents scope reduction if applied).

    ## Cost telemetry estimate

    - Plan + execute token cost: ~<TBD — fill from orchestrator>.
    - Per-restart customer cost: ~$0.001 USD (Haiku recomprehension) per D-02.
    - Worst-case troll scenario (50 msgs / 30s): ~$0.05 USD/turn — trivial vs handoff-to-human cost.

    ## Future migration playbook (for v3/godentist/recompra/pw-confirmation → v4 restart)

    1. Audit the target agent's checkpoint surface — does it use `interruption-system-v2`?
       If not, FIRST run the parent-standalone migration (`debounce-interruption-system-v2`
       per-agent variant) to install the lock + checkpoint sites.
    2. Apply this standalone's pattern: wrap target runner's body in `while (shouldRestart)`,
       convert Path A return-with-saveState to `shouldRestart=true; continue`, add agent
       discriminator detector, add token accumulator, preserve any equivalent of the
       `wasInterruptedWithZeroSends` block for the per-template-send edge case.
    3. Apply the 3-fold Regla 6 verification template against ALL OTHER agents (i.e., when
       migrating v3, the gate is "godentist + godentist-fb-ig + recompra + pw-confirmation
       paths byte-identical"; when migrating godentist, the gate is "v3 + the rest").
    4. Write 5 vitest scenarios matching S1..S5 of this standalone, adapting names for the
       new agent.
    ```

    Use real dates and fill placeholders. Don't worry about polishing — this is a working
    doc, not a release announcement.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md && grep -c "Patterns established\|Anti-patterns avoided\|Bugs encountered\|Pitfall 7" .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` succeeds.
    - `grep -c "Patterns established" .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` ≥ 1.
    - `grep -c "Anti-patterns avoided" .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` ≥ 1.
    - `grep -c "Pitfall 7\|second bug" .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` ≥ 1.
    - `grep -c "Future migration playbook" .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` ≥ 1.
    - `grep -c "Regla 6\|byte-identity" .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md` ≥ 1.
  </acceptance_criteria>
  <done>LEARNINGS.md committed — 6+ reusable patterns + Pitfall 7 + anti-pattern list + future migration playbook documented.</done>
  <atomic_commit>docs(debounce-v2-interrupt-reprocess): LEARNINGS.md — restart loop pattern + Pitfall 7 + Regla 6 gates</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 4.2: Write UAT.md with verification checklist</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/UAT.md (parent — template/reference for UAT shape)
    - 01-SUMMARY.md / 02-SUMMARY.md / 03-SUMMARY.md (status of plans for ACTUAL vs expected results)
  </read_first>
  <action>
    Create `.planning/standalone/debounce-v2-interrupt-reprocess/UAT.md`:

    ```markdown
    # UAT — debounce-v2-interrupt-reprocess

    Date: <fill on completion>
    Approver: <user email>

    ## Scope

    This standalone converts the v4 inbound-message pipeline from "silent persist + return
    on interrupt" to "restart in-lambda" semantics for Path A interrupts at CKPTs 0..6.
    Path B (post-send) preserves current behavior verbatim per D-01 + D-05. Sub-loop and
    types.ts are ZERO TOUCH (R-04).

    v4 is DORMANT in prod (zero workspaces have `conversational_agent_id='somnio-sales-v4'`).
    Manual WhatsApp smoke is DEFERRED to sibling standalone `debounce-v2-sandbox-integration`
    (per DISCUSSION-LOG.md "Out of scope" section).

    ## Plan 01 — Runner refactor + Pitfall 7 fix
    - [ ] `git diff main -- src/lib/agents/engine/v4-production-runner.ts | wc -l` shows the expected ~+60/-8 LOC delta.
    - [ ] `git diff main -- src/lib/agents/somnio-v4/somnio-v4-agent.ts | wc -l` shows the expected ~+10 LOC delta (Pitfall 7 mapper fix).
    - [ ] `grep -c "while (shouldRestart)" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - [ ] `grep -c "restart_iteration:" src/lib/agents/engine/v4-production-runner.ts` ≥ 8 (Pitfall 3 — 4 sites × 2 events each).
    - [ ] `grep -c "totalTokensAcrossRestarts" src/lib/agents/engine/v4-production-runner.ts` ≥ 4 (declaration + accumulator + ≥ 2 return-site references — Pitfall 2).
    - [ ] `grep -c "tokensUsed: output.totalTokens" src/lib/agents/engine/v4-production-runner.ts` == 0 (no leftover non-accumulator references).
    - [ ] `grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (R-04 detector).
    - [ ] `grep -c "outcome.reason.startsWith('interrupted_at_ckpt_')" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 1 (Pitfall 7 fix in mapper).
    - Result: <pass / fail>

    ## Plan 02 — Unit tests S1..S5
    - [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exits 0 with ≥ 5 passing tests.
    - [ ] S1 (happy path) green.
    - [ ] S2 (Path A restart 1x) green — asserts `tokensUsed === sum of iters` + iter 2 input.message combined.
    - [ ] S3 (Path A restart 2x cascading) green — asserts TWO `restart_iteration` events + final 3-part combined message.
    - [ ] S4 (Path B no-restart) green — `msg_aborted_path_b_solo` emitted, pending list NOT drained.
    - [ ] S5a (Regla 6 static gate) green — zero `interruption-system-v2` imports in non-v4 paths.
    - [ ] S5b (Regla 6 behavioral) green or gracefully fell back to static-only with documented reason.
    - [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (no regression — 6 suites green).
    - Result: <pass / fail>

    ## Plan 03 — Integration test (real `mapOutcomeToAgentOutput`)
    - [ ] `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exits 0 with ≥ 2 passing tests.
    - [ ] Pitfall 7 integration test asserts `output.requiresHuman ?? false === false` AND `output.errorMessage === 'interrupted_at_ckpt_3_post_tooling'`.
    - [ ] Regression-guard test asserts genuine `no_match` (NOT interrupt) still produces `newMode: 'handoff'` + `requiresHuman: true`.
    - [ ] Scope reduction (if applied) documented in 03-SUMMARY.md.
    - Result: <pass / fail>

    ## Regla 6 byte-identity gates (CRITICAL — global)
    - [ ] `git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts | wc -l` == 0
    - [ ] `git diff --stat main -- src/lib/agents/somnio-v3/ | wc -l` == 0
    - [ ] `git diff --stat main -- src/lib/agents/godentist/ | wc -l` == 0
    - [ ] `git diff --stat main -- src/lib/agents/godentist-fb-ig/ | wc -l` == 0
    - [ ] `git diff --stat main -- src/lib/agents/somnio-recompra/ | wc -l` == 0
    - [ ] `git diff --stat main -- src/lib/agents/somnio-pw-confirmation/ | wc -l` == 0
    - [ ] `grep -rn "while.*shouldRestart\|restart_iteration\|interrupted_at_ckpt_" src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ | wc -l` == 0
    - Result: <pass / fail>

    ## Sub-loop + types.ts zero-touch gates (R-04)
    - [ ] `git diff --stat main -- src/lib/agents/somnio-v4/sub-loop/index.ts | wc -l` == 0
    - [ ] `git diff --stat main -- src/lib/agents/somnio-v4/types.ts | wc -l` == 0
    - Result: <pass / fail>

    ## Module Scope doc updated (.claude/rules/agent-scope.md)
    - [ ] `### Module Scope: interruption-system-v2` block contains a note referencing this standalone shipping the in-lambda restart semantics for Path A.
    - Result: <pass / fail>

    ## Production safety (Regla 6 + D-06 + D-07)
    - [ ] v4 still DORMANT in prod (zero workspaces flipped to `conversational_agent_id='somnio-sales-v4'`).
    - [ ] No feature flag introduced (D-07 — v4 dormant, flag would be ceremony).
    - [ ] No DB migration (D-08).
    - [ ] All 5 non-v4 agents byte-identical to main.
    - [ ] `wasInterruptedWithZeroSends` legacy block preserved for CKPT-7.1 edge case (Pitfall 5).
    - Result: <pass / fail>

    ## Manual smoke deferral acknowledgment
    - [ ] User acknowledges manual WhatsApp smoke is DEFERRED to sibling standalone
          `debounce-v2-sandbox-integration` (per DISCUSSION-LOG.md "Out of scope" section).
          Confidence is HIGH that the fix works (covered by 5 unit + 2-3 integration vitest
          scenarios + Regla 6 multi-modal gates). Manual reproduction will happen when
          the sibling reanudes after this ship.
    - Result: <ack / not-ack>

    ## Sign-off
    <user types "approved" + date here>
    ```

    Replace placeholders with actual data when this task runs. The `<pass/fail>` and
    `<ack/not-ack>` markers wait for orchestrator-time fill-in.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md && grep -c "Regla 6 byte-identity gates\|approved\|Plan 0[1-3]\|Manual smoke deferral" .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md` succeeds.
    - `grep -c "Plan 01\|Plan 02\|Plan 03" .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md` ≥ 3 (each plan has a checklist section).
    - `grep -c "Regla 6 byte-identity\|byte-identical" .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md` ≥ 1.
    - `grep -c "Manual smoke deferral\|Out of scope" .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md` ≥ 1.
    - `grep -c "approved" .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md` ≥ 1 (sign-off placeholder present).
  </acceptance_criteria>
  <done>UAT.md committed — user has a single doc to check off before approving the merge.</done>
  <atomic_commit>docs(debounce-v2-interrupt-reprocess): UAT.md — verification checklist + deferral ack</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 4.3: Update `.claude/rules/agent-scope.md` — reference this standalone in the existing interruption-system-v2 Module Scope block</name>
  <read_first>
    - .claude/rules/agent-scope.md (full file — locate the existing `### Module Scope: interruption-system-v2 (...)` heading)
  </read_first>
  <action>
    1. Open `.claude/rules/agent-scope.md`. Find the existing `### Module Scope: interruption-system-v2 (\`src/lib/agents/interruption-system-v2/\`)` block. Inside that block (likely near the bottom or under the **Coexistencia** subsection), add a new bullet:

       ```markdown
       - **Follow-up shipped — `debounce-v2-interrupt-reprocess` (<date>):** Added in-lambda restart loop semantics for Path A interrupts (CKPT-0 through CKPT-6). When any of those checkpoints detects `interrupted=true` AND `actuallySentIds.length === 0`, the runner now drains the pending list, combines messages into an in-memory `effectiveMessage`, and re-runs the turn in the SAME lambda under the SAME lock (heartbeat keeps the lock alive). Sub-loop / module-internal contracts UNCHANGED — only the CONSUMERS in `v4-production-runner.ts` + `somnio-v4-agent.ts` mapper extended. Also fixed Pitfall 7 (silent handoff bug in `mapOutcomeToAgentOutput` consuming sub-loop CKPT-3/4/5 interrupts). Path B (post-send) preserved verbatim per D-01 of this follow-up. Standalone: `.planning/standalone/debounce-v2-interrupt-reprocess/`.
       ```

    2. Use the Edit tool with a unique anchor (e.g., the line `- **Coexistencia con Phase 31`) — the insertion point can be RIGHT BEFORE that bullet, so the follow-up is documented under the same Module Scope block. If a `**Coexistencia** ` line doesn't exist, place the new bullet at the end of the block (right before the next `###` heading).

    3. **Verify the agent-scope.md block is still well-formed** — open in editor mentally and check that the new bullet is grammatically a sibling of the surrounding `PUEDE` / `NO PUEDE` / `Validación` / `Consumidores documentados` items (it is — a top-level bullet of the Module Scope entry).

    4. **Do NOT** add a NEW top-level heading. The standalone is a follow-up to the parent module, not a new module — keep the doc tree clean.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "debounce-v2-interrupt-reprocess" .claude/rules/agent-scope.md && grep -c "Module Scope: interruption-system-v2" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "debounce-v2-interrupt-reprocess" .claude/rules/agent-scope.md` ≥ 1 (new bullet present).
    - `grep -c "Module Scope: interruption-system-v2" .claude/rules/agent-scope.md` == 1 (no duplicate Module Scope heading introduced).
    - `grep -c "in-lambda restart\|effectiveMessage\|Pitfall 7" .claude/rules/agent-scope.md` ≥ 1 (substantive content, not just a placeholder).
    - Surrounding sibling bullets (PUEDE / NO PUEDE / Validación) still intact.
  </acceptance_criteria>
  <done>Project skill doc reflects the follow-up — future devs reading agent-scope.md will see this standalone in the Module Scope history.</done>
  <atomic_commit>docs(agent-scope): note debounce-v2-interrupt-reprocess follow-up in interruption-system-v2 Module Scope</atomic_commit>
</task>

</tasks>

<verification>
1. All 3 new/modified docs exist:
   - `test -f .planning/standalone/debounce-v2-interrupt-reprocess/LEARNINGS.md`
   - `test -f .planning/standalone/debounce-v2-interrupt-reprocess/UAT.md`
   - `grep -c "debounce-v2-interrupt-reprocess" .claude/rules/agent-scope.md` ≥ 1
2. End-to-end full standalone verification (run all gates from prior plans one more time):
   ```bash
   # Plan 01 production code gates
   grep -c "while (shouldRestart)" src/lib/agents/engine/v4-production-runner.ts                       # ≥ 1
   grep -c "outcome.reason.startsWith('interrupted_at_ckpt_')" src/lib/agents/somnio-v4/somnio-v4-agent.ts  # ≥ 1
   # Plan 02 + 03 test gates
   npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -5                     # exits 0
   npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts 2>&1 | tail -5 # exits 0
   # Regla 6 + zero-touch gates
   git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ src/lib/agents/somnio-v4/sub-loop/index.ts src/lib/agents/somnio-v4/types.ts | wc -l  # == 0
   # Typecheck
   npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | wc -l                                   # baseline (no new errors)
   ```
3. UAT.md sign-off LINE present (text "approved" appears, indicating the slot for user signature).
</verification>

<success_criteria>
- LEARNINGS.md documents 6+ reusable patterns + Pitfall 7 + anti-patterns + future migration playbook.
- UAT.md provides a self-contained verification checklist the user can tick before approving merge.
- `.claude/rules/agent-scope.md` references this standalone in the existing interruption-system-v2 Module Scope (no new top-level heading).
- All Plan 01..03 gates verifiable end-to-end via the verification commands listed.
- Ready for orchestrator to commit + push to Vercel.
</success_criteria>

<push_to_vercel>
After all 3 atomic commits land (LEARNINGS / UAT / agent-scope), push the full standalone to Vercel (Regla 1):
```bash
git push origin HEAD:main
```

Since `.planning/` and `.claude/` are doc-only paths, this push triggers a Vercel build that succeeds without behavioral change (no new code shipped in this plan). The behavioral changes shipped in Plan 01.
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-interrupt-reprocess/04-SUMMARY.md` documenting:
- Final state of all 3 docs (file sizes, line counts).
- Confirmation that all UAT checklist items are tickable (user can mentally verify each).
- Suggested next step for the orchestrator: notify the user that `debounce-v2-sandbox-integration` (paused sibling) is now unblocked.
- Memory file append text — a 1-2 sentence summary the orchestrator should add to `~/.claude/projects/.../MEMORY.md` (e.g., "Debounce v2 interrupt-reprocess shipped 2026-05-26 — restart loop semantics for Path A in v4 runner + agent mapper; Pitfall 7 silent-handoff bug fixed; 5+ vitest scenarios green; sub-loop & types.ts byte-identical; sibling `debounce-v2-sandbox-integration` now unblocked.").
</output>
