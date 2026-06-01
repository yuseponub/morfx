---
phase: v4-media-audio-image
plan: 06
type: execute
wave: 5
depends_on: [03, 04, 05]
baseline_sha: "85092058e4495fc0e97ff0be2c6da582ca06c563"
files_modified:
  - src/lib/agents/media/__tests__/   # any gaps in test coverage
  - .planning/standalone/v4-media-audio-image/REGLA6-EVIDENCE.md   # evidence doc (planning dir, not code)
autonomous: true
requirements:
  - D-01   # Scope SOLO v4 — Regla 6 proof
  - D-07   # fail-safe coverage
  - D-10   # sin feature flag (gating por agente suffices) — proven by the greps
must_haves:
  truths:
    - "git diff 85092058..HEAD for all 5 non-v4 agents + v3-production-runner + interruption-system-v2 = 0 lines (Regla 6 — protected list)"
    - "CheckpointId count in interruption-system-v2/checkpoints.ts is still 8 (interruption system untouched)"
    - "media-gate.ts references SOMNIO_V4_AGENT_ID/somnio-sales-v4 >= 2 times (image + audio gating)"
    - "A behavioral test proves non-v4 image → action:'handoff' with the exact baseline reason string"
    - "v4-production-runner.ts diff is additive + v4-only (a single visionContext threading line into V4AgentInput); somnio-v4-agent.ts diff is the additive dedicated vision branch (visionContext-gated) — the existing RAG/send logic is unchanged"
    - "the shared-code visionContext touches (somnio-v4/types.ts, engine/types.ts, webhook-processor.ts v4 branch, engine-v4.ts, sandbox route) are all additive OPTIONAL fields only populated for v4 — no non-v4 caller is forced to supply visionContext"
    - "Full media + domain + relevant v4 unit suites are green; smoke deferred to WhatsApp activation is documented"
  artifacts:
    - path: ".planning/standalone/v4-media-audio-image/REGLA6-EVIDENCE.md"
      provides: "captured grep/diff output proving Regla 6 + the deferred-smoke checklist"
      contains: "Regla 6"
  key_links:
    - from: "Regla 6 gates"
      to: "ship decision"
      via: "protected-list diffs empty + checkpoint count 8 + gating greps pass + v4 touches additive/v4-only"
      pattern: "0 lines"
---

<objective>
Close the standalone with the Regla 6 grep/diff gates, a full test sweep, and the documented smoke
deferral. This wave produces the evidence that all media + vision changes are isolated to v4 and that
the SHARED infrastructure that must be byte-identical (the 5 non-v4 agents, the v3 runner, the
interruption system) is unchanged.

NOTE (revised delivery model): the vision answer is produced INSIDE the engine (somnio-v4-agent.ts) and
delivered via the existing `rag:` send path in v4-production-runner.ts. This means v4-production-runner.ts
+ somnio-v4-agent.ts + a few shared type/threading files ARE touched — but only ADDITIVELY and only for
v4 (visionContext is an optional field populated solely on the v4 image-respond path). The Regla 6
invariant is therefore: the PROTECTED list (5 non-v4 agents + v3-production-runner + interruption-system-v2)
stays 0-line diff, AND every v4 touch is additive + v4-gated/optional.

Purpose: D-01/D-10 — gating by agent (no feature flag) is sufficient ONLY if the non-v4 paths are
provably untouched and the v4 touches are provably additive. This wave proves both.
Output: REGLA6-EVIDENCE.md with captured command output + a green test sweep + the deferred-smoke list.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-media-audio-image/RESEARCH.md
@.planning/standalone/v4-media-audio-image/03-SUMMARY.md
@.planning/standalone/v4-media-audio-image/04-SUMMARY.md
@.planning/standalone/v4-media-audio-image/05-SUMMARY.md

<facts>
- Pitfall 1 (most critical): the media-gate is shared by all 6 agents. The Regla 6 proof for the gate is the non-v4 diff being empty + the gating greps.
- Baseline SHA 85092058 = last code commit before this standalone (only .planning docs added since — verified at plan time). All diffs are taken against it.
- The interruption system must be byte-identical: the media-gate runs PRE-engine/PRE-lock, and the
  vision branch reuses the EXISTING rag: send path (no checkpoint changes). CheckpointId count must stay 8.
- D-10: no feature flag — gating by resolvedAgentId === SOMNIO_V4_AGENT_ID (media-gate) + the optional
  visionContext field (only populated for v4) is the isolation mechanism. v4 is DORMANT (0 workspaces).
- Revised delivery: v4-production-runner.ts is touched ADDITIVELY (one visionContext threading line);
  somnio-v4-agent.ts gains an additive visionContext-gated branch. These are v4-only by construction.
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fill any remaining unit-test gaps</name>
  <files>src/lib/agents/media/__tests__/</files>
  <read_first>
    - The test files created in Waves 1-4: messages-transcription.test.ts, image-classifier.test.ts, media-gate-v4.test.ts, somnio-v4/__tests__/vision-branch.test.ts, somnio-v4/__tests__/engine-v4-vision.test.ts.
    - 03/04-SUMMARY.md (what shipped vs deferred — e.g. if image-respond was block-ship-audio-only, skip its respond-path assertion).
  </read_first>
  <action>
    Ensure coverage for the locked behaviors, adding only what the Wave 1-4 tests did not already cover:
    - classifier: all 6 categorias map to the correct decision (producto/pagina→responder; rest→handoff) + fail-safe (D-07). (Should already be covered by Plan 03; add the missing categoria cases if absent.)
    - media-gate Regla 6 behavioral: non-v4 image → handoff with baseline string; non-v4 audio → handleAudio path (no transcription field); v4 image responder → action:'vision_respond'.
    - vision engine branch: visionContext present → comprehend NOT called (D-05) + generated → rag: template; no_match/null/empty KB/error → handoff (D-07); interrupt → errorMessage discriminator. (Plan 04 Task 3 — skip if block-ship-audio-only per 04-SUMMARY.)
    - sandbox parity: V4EngineInput.visionContext → responseText surfaces (Plan 04 Task 4 — skip if block-ship-audio-only).
    - setMessageTranscription: UPDATE by wamid+workspace_id; empty wamid → no-op fail; supabase error → fail. (Wave 1.)
    Do NOT duplicate existing assertions — only fill gaps.
  </action>
  <acceptance_criteria>
    - Every locked behavior above has at least one passing assertion across the media + domain + v4 test files.
    - `npx vitest run src/lib/agents/media/ src/lib/domain/__tests__/messages-transcription.test.ts src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts` passes (vision-branch skipped only if block-ship-audio-only).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Regla 6 grep/diff gates — capture evidence</name>
  <files>.planning/standalone/v4-media-audio-image/REGLA6-EVIDENCE.md</files>
  <read_first>
    - 04-SUMMARY.md (Task 1 decision: wired-reuse vs block-ship-audio-only; which shared files were touched).
  </read_first>
  <action>
    Run each gate and capture its exact output into `.planning/standalone/v4-media-audio-image/REGLA6-EVIDENCE.md`.
    Gates G1-G6 are HARD invariants (the PROTECTED list); G7-G8 verify the v4 touches are additive.

    ```bash
    # G1 — five non-v4 agents byte-identical since baseline (PROTECTED)
    git diff 85092058..HEAD --stat -- \
      src/lib/agents/somnio-v3 \
      src/lib/agents/godentist \
      src/lib/agents/godentist-fb-ig \
      src/lib/agents/somnio-recompra \
      src/lib/agents/somnio-pw-confirmation
    # Expected: NO output (0 lines changed).

    # G2 — v3 production runner byte-identical (PROTECTED)
    git diff 85092058..HEAD -- src/lib/agents/engine/v3-production-runner.ts
    # Expected: empty.

    # G3 — interruption system byte-identical (PROTECTED)
    git diff 85092058..HEAD -- src/lib/agents/interruption-system-v2
    # Expected: empty.

    # G4 — checkpoint count still 8 (PROTECTED)
    grep -oE "'(ckpt_0_post_acquire|ckpt_1_post_comprehension|ckpt_2_post_state_machine|ckpt_3_post_tooling|ckpt_4_post_generation|ckpt_5_post_compliance|ckpt_6_pre_send_loop|ckpt_7_pre_template)'" \
      src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l
    # Expected: 8.

    # G5 — media-gate gates by v4 (image + audio)
    grep -c "SOMNIO_V4_AGENT_ID\|somnio-sales-v4" src/lib/agents/media/media-gate.ts
    # Expected: >= 2.

    # G6 — non-v4 image handoff string unchanged in the gate
    grep -c "Cliente envio una imagen" src/lib/agents/media/media-gate.ts
    # Expected: >= 1 (the non-v4 branch keeps the baseline string).

    # G7 — v4 production runner: additive + v4-only (a single visionContext threading line)
    git diff 85092058..HEAD -- src/lib/agents/engine/v4-production-runner.ts
    # Expected (wired-reuse): ONLY an additive `visionContext: input.visionContext` line in the
    #   v4Input construction (and possibly the EngineInput type import) — NO change to existing
    #   send/no-rep/ledger logic. Confirm every added line is additive + visionContext-related.
    # Expected (block-ship-audio-only): empty.

    # G8 — the vision engine branch + shared threading are additive + visionContext-gated (v4-only)
    git diff 85092058..HEAD -- \
      src/lib/agents/somnio-v4/somnio-v4-agent.ts \
      src/lib/agents/somnio-v4/types.ts \
      src/lib/agents/engine/types.ts \
      src/lib/agents/production/webhook-processor.ts \
      src/lib/agents/somnio-v4/engine-v4.ts \
      src/app/api/sandbox/process/route.ts
    # Expected: ALL added lines are either (a) the optional `visionContext?` field declarations, (b) the
    #   `visionContext` threading lines, or (c) the additive `if (input.visionContext) { ... }` dedicated
    #   branch in somnio-v4-agent.ts. The EXISTING RAG/send/comprehension logic is unchanged (the branch
    #   returns early; it does not modify the normal-path code). Confirm by reviewing the diff: no edits
    #   to the existing rag: push / resolveLowSlot / output.templates assembly. (Skip if block-ship-audio-only.)
    ```

    If ANY of G1-G6 is non-empty/non-matching → STOP and fix the leak before shipping (Pitfall 1).
    For G7: confirm the diff is additive-only (visionContext threading) and the existing send logic is
    untouched. For G8: confirm every added line is visionContext-related and the dedicated branch is an
    early-return that does not alter the normal pipeline (D-05). Capture a one-line annotation per gate.
  </action>
  <acceptance_criteria>
    - REGLA6-EVIDENCE.md contains the captured output of G1-G8.
    - G1, G2, G3 empty; G4 == 8; G5 >= 2; G6 >= 1.
    - G7: additive visionContext-only line(s) (wired-reuse) OR empty (block-ship-audio-only) — annotated; existing send logic confirmed unchanged.
    - G8: all added lines are visionContext field/threading/branch (additive + v4-gated); existing normal-path logic unchanged — annotated (or skipped with note if block-ship-audio-only).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Full test sweep + document deferred smoke</name>
  <files>.planning/standalone/v4-media-audio-image/REGLA6-EVIDENCE.md</files>
  <read_first>
    - 04-SUMMARY.md (image-respond shipped vs blocked) + 05-SUMMARY.md (smoke deferral status).
  </read_first>
  <action>
    - Run the media + domain + v4 test suites and the interruption + sub-loop suites named in
      INTERRUPTION-PARITY.md §5 to confirm zero regressions (the sub-loop is REUSED read-only by the
      vision branch — it should be unaffected):
      `npx vitest run src/lib/agents/media/ src/lib/domain/ src/lib/agents/somnio-v4/ src/lib/agents/interruption-system-v2/`
      Capture the green counts.
    - Append a "Deferred Smoke (WhatsApp activation)" checklist to REGLA6-EVIDENCE.md, per RESEARCH Wave 5
      + D-11 (360dialog inbound media required; Meta Direct/Onurix do NOT serve inbound media):
      [ ] Activate v4 in a real workspace on a 360dialog channel: `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>';`
      [ ] Send a WhatsApp AUDIO → transcript persists (messages.transcription) → appears under the inbox player.
      [ ] Send a WhatsApp IMAGE of the product → grounded response delivered via the rag: path (or informed handoff if block-ship-audio-only per 04-SUMMARY).
      [ ] Send a WhatsApp IMAGE of a payment receipt → informed handoff with description (D-06), NEVER a payment confirmation (Pitfall 4).
      [ ] Confirm a non-v4 agent (e.g. v3 in another workspace) still hands off images immediately (Regla 6 in prod).
    - Also note the SANDBOX vision test path (Plan 04 Task 4): the vision branch is testable in sandbox by
      supplying a `descripcion` via visionContext (the classifier itself only runs in prod media-gate).
  </action>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/media/ src/lib/domain/ src/lib/agents/somnio-v4/ src/lib/agents/interruption-system-v2/` green; counts captured in REGLA6-EVIDENCE.md.
    - Interruption + sub-loop suites (per INTERRUPTION-PARITY §5) still green (zero regression — sub-loop reused read-only).
    - REGLA6-EVIDENCE.md has the deferred-smoke checklist with the 360dialog/D-11 note + the sandbox vision test note.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- All Regla 6 PROTECTED-list gates pass (5 agents + v3 runner + interruption system byte-identical; checkpoint count 8; media-gate v4-gated).
- v4 touches (v4-production-runner.ts, somnio-v4-agent.ts, shared type/threading files, sandbox) are additive + visionContext-gated/optional — proven by G7/G8 review.
- Test sweep green with zero regressions to shared/interruption/sub-loop suites.
- Smoke explicitly deferred to v4 activation with the 360dialog inbound-media constraint (D-11) documented.
- No feature flag added (D-10) — gating by agent (media-gate) + optional visionContext (engine) is the proven isolation.
</verification>

<success_criteria>
- Provable v4 isolation (protected list 0-diff; v4 touches additive); standalone ready for activation-time smoke.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-media-audio-image/06-SUMMARY.md` summarizing the
Regla 6 evidence (G1-G8), test counts, and the deferred-smoke checklist. This is the standalone's closing
evidence (alongside a LEARNINGS.md per Regla 0/CLAUDE.md workflow).
</output>
