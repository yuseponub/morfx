---
phase: v4-media-audio-image
plan: 04
type: execute
wave: 3
depends_on: [03]
baseline_sha: "85092058e4495fc0e97ff0be2c6da582ca06c563"
files_modified:
  - src/lib/agents/somnio-v4/types.ts                       # V4AgentInput.visionContext (additive)
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts             # dedicated vision branch → rag: ProcessedMessage
  - src/lib/agents/engine/v4-production-runner.ts           # thread visionContext into V4AgentInput
  - src/lib/agents/engine/types.ts                          # EngineInput.visionContext (additive)
  - src/lib/agents/production/webhook-processor.ts          # thread visionContext: ProcessMessageInput → EngineInput
  - src/lib/agents/somnio-v4/engine-v4.ts                   # sandbox parity: V4EngineInput.visionContext → processMessage
  - src/app/api/sandbox/process/route.ts                    # sandbox parity: accept visionContext in body
autonomous: false
requirements:
  - D-02   # Imagen: responder cuando producto/página
  - D-05   # Path de visión DEDICADO (bypassa comprehension/state-machine/templates, pero KB-grounded)
  - D-06   # Taxonomía responde producto+página
  - D-07   # Fail-safe → handoff
must_haves:
  truths:
    - "V4AgentInput gains an OPTIONAL visionContext: { descripcion: string; categoria: string }; populated only on the v4 image-respond path (additive, non-breaking; sandbox/tests/non-vision turns omit it)"
    - "somnio-v4-agent.ts processUserMessage has an EARLY dedicated branch: when input.visionContext is present it SKIPS comprehension/state-machine/templates and runs the RQ-1 grounded path (kbSearchTool → buildGenerationPrompt → runGenerationCall → RESPONSE_CONFIDENCE_THRESHOLD + binary backstop) — D-05 dedicated AND grounded"
    - "On confidence OK → emits output.templates = [{ templateId: 'rag:<sourceTopic>', content, contentType:'texto', priority:'CORE' }] (the SAME synthetic ProcessedMessage shape the existing RAG path uses at somnio-v4-agent.ts:576) + a commitTurn — the runner's EXISTING send loop delivers it (v4-production-runner.ts:751 send, :796 rag:* no-rep, :839 excluded from templates_enviados) automatically"
    - "On confidence < threshold OR binary ∈ {FALTA_INFO, FUERA_SCOPE} OR empty KB OR error → handoff (informed, with descripcion) — no blind response (D-07)"
    - "visionContext is threaded shared-code: agent-production → ProcessMessageInput → EngineInput → V4AgentInput (prod) AND V4EngineInput → V4AgentInput (sandbox), so prod + sandbox exercise the SAME engine branch (parity contract)"
    - "Regla 6: V4AgentInput/EngineInput/V4EngineInput visionContext fields are additive + only populated for v4; the 5 non-v4 agents + v3-production-runner + interruption-system-v2 stay 0-line diff; CheckpointId count still 8"
  artifacts:
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "early dedicated vision branch emitting rag: ProcessedMessage via the existing send path"
      contains: "input.visionContext"
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "V4AgentInput.visionContext optional field"
      contains: "visionContext"
  key_links:
    - from: "somnio-v4-agent.ts vision branch"
      to: "production send (runner 5h-main)"
      via: "output.templates = [{ templateId: 'rag:<sourceTopic>', ... }] → runner sends rag: with no-rep + ledger"
      pattern: "rag:"
    - from: "agent-production vision_respond"
      to: "V4AgentInput.visionContext"
      via: "ProcessMessageInput.visionContext → EngineInput.visionContext → runner builds v4Input.visionContext"
      pattern: "visionContext"
    - from: "engine-v4.ts (sandbox) processMessage"
      to: "V4AgentInput.visionContext"
      via: "V4EngineInput.visionContext → processMessage({ ..., visionContext })"
      pattern: "visionContext"
---

<objective>
Build the dedicated vision response path for v4 images classified as `producto`/`pagina` INSIDE THE
ENGINE, so delivery reuses the proven `rag:` send machinery automatically. When `input.visionContext`
is present, `somnio-v4-agent.ts` takes an EARLY dedicated branch that SKIPS comprehension /
state-machine / templates (D-05 dedicated) but is KB-grounded (D-05 grounded): query the v4 knowledge
base with the image `descripcion`, draft a grounded response with the existing generation infra, apply
the SAME confidence threshold + binary backstop as the sub-loop, and emit a synthetic
`rag:<sourceTopic>` ProcessedMessage into `output.templates`. The runner's existing 5h-main send loop
delivers it with no-repetition (rag:* special-cased), interruption Path A/B, and turn-ledger exclusion —
no new send wiring anywhere.

This REPLACES the old plan's false premise (there is no send primitive in the media-gate /
agent-production layer; producing + sending the vision answer there was wrong). The new delivery is:
engine emits `rag:` template → runner sends. Plan 03 already routes `vision_respond` INTO the engine via
`visionContext`; this plan threads that field shared-code (prod + sandbox) and adds the engine branch.

Purpose: D-02/D-05/D-06 — respond to product/page images directly but grounded (RQ-1), never blind (D-07).
Output: `V4AgentInput.visionContext`, the dedicated engine branch, full threading (prod runner +
webhook-processor + EngineInput) AND sandbox parity (engine-v4.ts + sandbox route), with the response
delivered via the verified `rag:` send path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-media-audio-image/RESEARCH.md
@.planning/standalone/v4-media-audio-image/03-SUMMARY.md
@src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md

<interfaces>
<!-- Extracted from codebase — use directly. -->

The EXISTING RAG send path (REUSE this exact shape — somnio-v4-agent.ts:512-589):
```ts
const ragMessages: ProcessedMessage[] = []
// ...resolveLowSlot runs runSubLoop, then on generated:
ragMessages.push({
  templateId: `rag:${outcome.sourceTopic}`,   // pseudo-id
  content: outcome.responseText,
  contentType: 'texto',
  delayMs: 0,
  priority: 'CORE',
})
ragAtendido.push({ kind: 'kb_topic', topic: outcome.sourceTopic, confidence, texto, turno })
// ...merged into combinedMessages → output.templates (:660-662, :793-794) → commitTurn
```
Runner sends `output.templates` in 5h-main: v4-production-runner.ts:751 (send loop), :796
(`templatesToSend.filter(t => t.templateId.startsWith('rag:') || survivingIds.has(...))` — rag:* always
survive no-rep), :839 (`.filter(... !id.startsWith('rag:'))` — rag:* never enter templates_enviados).
CONFIRMED present at baseline; Task 1 re-verifies before relying on it.

RAG grounding primitives to REUSE (RQ-1) — same ones resolveLowSlot uses:
- runSubLoop (src/lib/agents/somnio-v4/sub-loop/index.ts) — `runSubLoop({ reason, ctx, onDebug })` returns
  an outcome `{ status: 'generated'|'no_match', responseText?, sourceTopic?, responseConfidence?, knowledgeQueried?, reason? }`.
  ctx = { workspaceId, conversationId, sessionId, userMessage, recentMessages, lockHandle, lockChannel,
  lockIdentifier, stateContext }. The sub-loop ALREADY applies kb_search + buildGenerationPrompt +
  runGenerationCall + RESPONSE_CONFIDENCE_THRESHOLD (0.70, index.ts:44) + binary backstop
  (index.ts:427/440). REUSING runSubLoop gives the entire RQ-1 grounding contract for free + keeps
  the threshold/backstop single-sourced (no drift — A3).
- DECISION (executor): prefer calling `runSubLoop` with `reason:'razonamiento_libre'` and
  `ctx.userMessage = descripcion (+ caption)` over hand-reassembling kb_search/buildGenerationPrompt/
  runGenerationCall, because runSubLoop already does exactly that AND already special-cases the
  interrupt path (`outcome.reason.startsWith('interrupted_at_ckpt_')`). This is the closest faithful
  reuse and matches resolveLowSlot. If runSubLoop's ctx is too coupled to slot state, fall back to the
  direct primitives (kbSearchTool + buildGenerationPrompt + runGenerationCall + threshold/backstop) —
  but document the choice in the SUMMARY.

ProcessedMessage type: grep `interface ProcessedMessage` (templateId, content, contentType, priority,
delayMs/delaySeconds).

V4AgentInput (src/lib/agents/somnio-v4/types.ts:142-201) — add `visionContext?` after `simulate?`.
processMessage entry (somnio-v4-agent.ts:129) routes to processUserMessage (:140). The EARLY vision
branch goes near the TOP of processUserMessage, BEFORE comprehension (the comprehend() call is at :167),
so it skips comprehension/state-machine/templates (D-05). It still needs `commitTurn` + a serialized
state return — mirror the shape of the existing early-return blocks (e.g. the guard-blocked return at
:304-327) for the output fields (intentsVistos/templatesEnviados/datosCapturados/packSeleccionado/
accionesEjecutadas/turnLedgerDims), but with `templates` set to the rag: ProcessedMessage.

Threading chain for visionContext (prod):
- agent-production.ts (Plan 03) → `processMessageWithAgent({ ..., visionContext })`.
- webhook-processor.ts ProcessMessageInput (:46+) → add `visionContext?: { descripcion: string; categoria: string }`.
- webhook-processor v4 branch (:897-912) → `runner.processMessage({ ..., visionContext: input.visionContext ?? undefined })`.
- EngineInput (engine/types.ts:66+) → add `visionContext?: { descripcion: string; categoria: string }`.
- v4-production-runner.ts v4Input construction (:358-378) → add `visionContext: input.visionContext`.

Threading chain for visionContext (sandbox parity):
- sandbox route src/app/api/sandbox/process/route.ts:43 destructures body; v4 branch :281 calls
  `v4Engine.processMessage({ message, ... })`. Add `visionContext` to the body destructure + pass it.
- engine-v4.ts V4EngineInput (:56+) → add `visionContext?: { descripcion: string; categoria: string }`.
  engine-v4.ts builds `processMessage({ message, ..., simulate:true })` at :271-296 → add
  `visionContext: input.visionContext`.
  (The Gemini Vision classifier itself only runs in production media-gate. Sandbox supplies the
  `descripcion` directly via visionContext — this is how the engine branch becomes testable in sandbox.)
</interfaces>

<facts>
- RQ-1 (HIGH): grounding = reuse the sub-loop's kb_search + buildGenerationPrompt + runGenerationCall +
  threshold + binary backstop. NO free-form "contexto general" prompt. NO duplicated KB summary.
- D-05: dedicated path bypasses comprehension/state-machine/templates but stays grounded via the RAG
  infra (this is exactly the asymmetry D-05 asked to resolve). State this EXPLICITLY in the branch comments.
- A2 (LOW risk): pass ONLY the textual descripcion (+caption) to the grounded path in V1. The KB holds
  the product material; the image already produced the descripcion in Plan 03.
- D-07: below threshold / binary backstop / kb_search empty / generation error → informed handoff (with descripcion).
- DELIVERY (revised): the vision branch emits a `rag:<sourceTopic>` ProcessedMessage into output.templates;
  the runner's existing send loop delivers it. NO send is added in media-gate / agent-production / runner.
- PARITY: the branch lives in shared `processMessage` (somnio-v4-agent.ts), so the sandbox engine
  (engine-v4.ts) exercises the identical code. visionContext is threaded into BOTH input paths.
</facts>
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: VERIFY the rag: template send-path exists in the runner (Pitfall 7 decision point)</name>
  <decision>
    Does the production runner currently SEND `output.templates` entries whose `templateId` starts with
    `rag:` (the existing RAG send path), with no-rep passthrough + templates_enviados exclusion? This
    determines whether the engine-emits-`rag:` delivery model is valid, or whether image-respond must
    ship audio-only.
  </decision>
  <context>
    The new delivery model REQUIRES the runner's 5h-main send loop to: (B1) send `output.templates`,
    (B2) special-case `rag:*` so they survive no-repetition, (B3) exclude `rag:*` from
    templates_enviados. Plan-phase investigation (against tree at baseline 85092058) found all three
    present (v4-production-runner.ts:751, :796, :839; emitted by somnio-v4-agent.ts:576-589 →
    output.templates). The executor MUST re-verify on the actual working tree before building the engine
    branch, because the engine emits `rag:` templates exactly like resolveLowSlot does.

    Run these checks and read the results:
    ```bash
    # B1 — runner sends output.templates (5h-main)
    grep -n "output.templates && output.templates.length\|this.adapters.messaging.send" src/lib/agents/engine/v4-production-runner.ts
    # B2 — rag:* survive no-repetition filtering
    grep -n "startsWith('rag:')" src/lib/agents/engine/v4-production-runner.ts
    # B3 — rag:* excluded from templates_enviados
    grep -n "!id.startsWith('rag:')\|!.*startsWith('rag:')" src/lib/agents/engine/v4-production-runner.ts
    # B4 — the agent's existing rag: ProcessedMessage push (the shape to mirror)
    grep -n "rag:\${outcome.sourceTopic}\|templateId: \`rag:" src/lib/agents/somnio-v4/somnio-v4-agent.ts
    # B5 — confirm no diff vs baseline for these two files (RAG-send wiring unchanged)
    git diff 85092058 --stat -- src/lib/agents/somnio-v4/somnio-v4-agent.ts src/lib/agents/engine/v4-production-runner.ts
    ```
    Acceptance for "wired-reuse": B1 shows the send loop; B2 shows rag:* surviving no-rep; B3 shows rag:*
    excluded from templates_enviados; B4 shows the existing `rag:` push (the shape to copy).
  </context>
  <action>
    Run checks B1-B5 above (grep + git diff against baseline 85092058), read the output, then select an
    option below. This is a verify-and-decide gate: the result dictates whether the engine-emits-rag:
    delivery model is valid (expected: wired-reuse) or image-respond ships audio-only.
  </action>
  <options>
    <option id="wired-reuse">
      <name>rag: SEND IS WIRED — engine emits rag: ProcessedMessage; runner delivers (expected)</name>
      <pros>Vision answer uses the exact, proven send path. Zero new send wiring. No-rep + interruption Path A/B + turn-ledger all reused automatically because the branch lives in the shared engine. Audio + image ship together.</pros>
      <cons>Must mirror the synthetic `rag:` ProcessedMessage shape and add an EARLY branch in processUserMessage. Must thread visionContext shared-code (prod + sandbox) for parity.</cons>
    </option>
    <option id="block-ship-audio-only">
      <name>rag: SEND NOT WIRED/broken — ship AUDIO only; defer image-respond (fallback)</name>
      <pros>Audio (persist + UI) ships now with zero send dependency. Image classify + handoff also ships (handoff path needs no send). Only the image *respond* branch is deferred.</pros>
      <cons>Image `responder` stays as `vision_respond` → engine, but with NO engine branch, so it would
      fall through. To stay safe, in this case Plan 03's `handleImageV4` responder must instead return an
      informed handoff (revert the vision_respond emission for producto/pagina) until the rag: path lands.
      Document the block explicitly. ONLY take this if B1/B2/B3 prove the rag: path absent/broken.</cons>
    </option>
  </options>
  <resume-signal>
    Run checks B1-B5, then select: `wired-reuse` (proceed with Tasks 2-4 as written) or
    `block-ship-audio-only` (skip Tasks 2-4; revert Plan 03 handleImageV4 responder to informed handoff,
    audio ships). State which check (B1/B2/B3/B4/B5) drove the decision. Expected: `wired-reuse`.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 2: Add V4AgentInput.visionContext + thread it shared-code (prod runner + webhook-processor + EngineInput)</name>
  <files>src/lib/agents/somnio-v4/types.ts, src/lib/agents/engine/types.ts, src/lib/agents/production/webhook-processor.ts, src/lib/agents/engine/v4-production-runner.ts</files>
  <read_first>
    - `src/lib/agents/somnio-v4/types.ts:142-201` (V4AgentInput — add visionContext after `simulate?`).
    - `src/lib/agents/engine/types.ts:66+` (EngineInput).
    - `src/lib/agents/production/webhook-processor.ts:46+` (ProcessMessageInput — Plan 03 may have added a stub field; reconcile) + `:897-912` (v4 runner call).
    - `src/lib/agents/engine/v4-production-runner.ts:358-378` (v4Input construction).
  </read_first>
  <action>
    Interface-first threading (additive everywhere — Regla 6):
    - `somnio-v4/types.ts`: add to V4AgentInput, after `simulate?: boolean`:
      ```ts
      /**
       * standalone v4-media-audio-image (Plan 04): vision context for the dedicated image-respond
       * branch. Present ONLY on the v4 image-respond path (decision='responder' in media-gate).
       * Absent on text/audio/timer turns + sandbox/tests that omit it. Additive — Regla 6.
       */
      visionContext?: { descripcion: string; categoria: string }
      ```
    - `engine/types.ts`: add the SAME optional field to EngineInput (same JSDoc, "threaded from
      agent-production → ProcessMessageInput → EngineInput → V4AgentInput").
    - `webhook-processor.ts`: ensure `ProcessMessageInput` declares
      `visionContext?: { descripcion: string; categoria: string }` (Plan 03 added a stub — keep ONE
      declaration). In the v4 branch `runner.processMessage({...})` (:897-912) add
      `visionContext: input.visionContext ?? undefined,`. Do NOT add it to non-v4 runner calls.
    - `v4-production-runner.ts`: in the `v4Input: V4AgentInput = {...}` object (:358-378) add
      `visionContext: input.visionContext,` (passes EngineInput → V4AgentInput).
    No behavior change yet — purely threading. The branch that consumes it is Task 3.
  </action>
  <acceptance_criteria>
    - `grep -c "visionContext" src/lib/agents/somnio-v4/types.ts` >= 1.
    - `grep -c "visionContext" src/lib/agents/engine/types.ts` >= 1.
    - `grep -c "visionContext" src/lib/agents/production/webhook-processor.ts` >= 1 (single ProcessMessageInput field + v4 runner call thread).
    - `grep -c "visionContext: input.visionContext" src/lib/agents/engine/v4-production-runner.ts` returns 1.
    - All visionContext fields are OPTIONAL (`?`) — no caller is forced to supply it (Regla 6 / backward compat).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Dedicated vision branch in somnio-v4-agent.ts (emits rag: ProcessedMessage)</name>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts</files>
  <read_first>
    - `src/lib/agents/somnio-v4/somnio-v4-agent.ts:140-167` (top of processUserMessage — the branch goes here, BEFORE comprehend()).
    - `:304-327` (guard-blocked early-return — mirror its output-field shape: serialized state via commitTurn + the V4AgentOutput fields).
    - `:512-591` (resolveLowSlot — the rag: ProcessedMessage push + ragAtendido shape to mirror exactly).
    - `sub-loop/index.ts` runSubLoop signature + outcome shape + RESPONSE_CONFIDENCE_THRESHOLD + the `interrupted_at_ckpt_` discriminator (:427/:440/the interrupt branch).
    - `commitTurn` + `buildLedgerSummary` usage in the guard-blocked block (:304-327).
  </read_first>
  <behavior>
    - When `input.visionContext` is present, processUserMessage takes an EARLY dedicated branch BEFORE
      comprehension/state-machine/templates (D-05 dedicated).
    - It restores state (deserializeState, like the normal path) then runs the grounded RAG path with
      `userMessage = descripcion (+ caption if any)`:
        prefer `runSubLoop({ reason:'razonamiento_libre', ctx:{...descripcion as userMessage...}, onDebug })`
        (reuses kb_search + buildGenerationPrompt + runGenerationCall + threshold + binary backstop — RQ-1, A3).
    - outcome.status==='generated' (+responseText+sourceTopic) → emit
      `output.templates = [{ templateId:'rag:'+sourceTopic, content:responseText, contentType:'texto', delayMs:0, priority:'CORE' }]`,
      add an `atendido` kb_topic entry, commitTurn, return success with serialized state + that single
      template. The runner sends it (no-rep + ledger automatic).
    - outcome interrupted (`outcome.reason.startsWith('interrupted_at_ckpt_')`) → return the interrupt
      discriminator the runner expects (mirror resolveLowSlot's interrupt handling — Path A restart).
    - outcome.status==='no_match' / generated-with-null / empty KB / thrown error → handoff:
      return success with `newMode:'handoff'`, `requiresHuman:true`, `messages:[]`, no templates,
      ledger atendido=[{kind:'handoff', reason: 'imagen producto/página — '+descripcion}] (D-07 informed).
    - The branch NEVER calls comprehend()/computeSlots()/sales-track/response-track (D-05).
  </behavior>
  <action>
    Add the early branch at the top of `processUserMessage` (after the `try {` + state restore, before
    the comprehend() call at :167):
    ```ts
    // ====================================================================
    // standalone v4-media-audio-image (Plan 04) — DEDICATED VISION BRANCH (D-05).
    // When the media-gate classified an image as producto/pagina, it routed the
    // turn here with visionContext.descripcion. This branch is DEDICATED: it
    // SKIPS comprehension / state-machine / templates entirely, but stays
    // KB-GROUNDED via the SAME RAG infra the low-confidence slot uses
    // (runSubLoop → kb_search + buildGenerationPrompt + runGenerationCall +
    // RESPONSE_CONFIDENCE_THRESHOLD + binary backstop). RQ-1 + D-05.
    // Delivery: emit a rag:<sourceTopic> ProcessedMessage into output.templates;
    // the runner's existing 5h-main send loop delivers it (no-rep rag:* + ledger).
    // ====================================================================
    if (input.visionContext) {
      const vquery = `${input.visionContext.descripcion}${input.message ? '\nTexto del cliente: ' + input.message : ''}`
      const outcome = await runSubLoop({
        reason: 'razonamiento_libre',
        ctx: {
          workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
          conversationId: input.sessionId ?? '',
          sessionId: input.sessionId ?? '',
          userMessage: vquery,
          recentMessages: input.history.slice(-4).map(m => ({ role: m.role, content: m.content })),
          lockHandle: input.lockHandle ?? null,
          lockChannel: input.lockChannel ?? null,
          lockIdentifier: input.lockIdentifier ?? null,
          stateContext: {
            datosCapturados: input.datosCapturados,
            atendidoPrevio: input.turnLedgerDims?.atendido ?? [],
            recentBotMessages,   // computed above near the comprehension prep — move that computation ABOVE this branch if needed
          },
        },
        onDebug: (p) => { capturedSubLoopDebug = p },
      })

      // interrupt → Path A discriminator (mirror resolveLowSlot interrupt handling)
      if (outcome.status === 'no_match' && typeof outcome.reason === 'string'
          && outcome.reason.startsWith('interrupted_at_ckpt_')) {
        return { success: false, messages: [], errorMessage: outcome.reason, /* + passthrough dims like the CKPT-1 interrupt return at :195-210 */ }
      }

      if (outcome.status === 'generated' && outcome.responseText && outcome.sourceTopic) {
        const ragMsg: ProcessedMessage = {
          templateId: `rag:${outcome.sourceTopic}`,
          content: outcome.responseText,
          contentType: 'texto',
          delayMs: 0,
          priority: 'CORE',
        }
        const ledger: TurnLedger = {
          comprehension: { intent: 'imagen', confidence: outcome.responseConfidence ?? 0 },
          atendido: [{ kind: 'kb_topic', topic: outcome.sourceTopic, confidence: outcome.responseConfidence ?? 0, texto: outcome.responseText, turno: state.turnCount }],
          crmActions: [],
          modeTransition: { from: computeMode(state), to: computeMode(state) },
          messagesSent: 1,
        }
        const serialized = commitTurn(state, ledger)
        return {
          success: true,
          messages: [outcome.responseText],
          templates: [ragMsg],
          /* serialized state fields + turnLedgerDims + turnLedgerSummary mirroring the guard-blocked return at :304-327 */
        }
      }

      // no_match / null / empty KB / error → informed handoff (D-07)
      const handoffLedger: TurnLedger = { /* atendido:[{kind:'handoff', reason: 'imagen producto/página — ' + input.visionContext.descripcion}], crmActions:[], modeTransition→handoff, messagesSent:0, comprehension:{intent:'imagen',confidence:0} */ }
      const serialized = commitTurn(state, handoffLedger)
      return { success: true, messages: [], newMode: 'handoff', requiresHuman: true, /* serialized fields */ }
    }
    ```
    - Fill in EVERY V4AgentOutput field by mirroring the guard-blocked early-return (:304-327) and the
      CKPT-1 interrupt return (:195-210) so the shape is complete and typecheck-clean. Use the SAME
      ProcessedMessage shape as resolveLowSlot (:576-582). Do NOT invent new output fields.
    - If `recentBotMessages` is currently computed below the branch insertion point, MOVE its computation
      above the branch (it is derived only from input.history — safe to hoist).
    - Adjust the `TurnLedger.comprehension.intent` value if 'imagen' is not an allowed intent literal —
      use the closest allowed value or a string the ledger accepts; keep it KB-grounded semantics.

    Unit test `__tests__/vision-branch.test.ts` (mock runSubLoop; assert NO comprehend call):
    - vi.mock the sub-loop module so runSubLoop is controllable; spy/mock comprehend to assert it is
      NEVER called when visionContext is present.
    - runSubLoop → generated (conf 0.9) → output.templates[0].templateId === 'rag:'+sourceTopic,
      content === responseText, messages length 1.
    - runSubLoop → no_match → newMode 'handoff', requiresHuman true, no templates (D-07).
    - runSubLoop → interrupt (`interrupted_at_ckpt_4_post_generation`) → success false + errorMessage
      starts with 'interrupted_at_ckpt_'.
    - visionContext present → comprehend NOT called (D-05 dedicated proof).
    - visionContext ABSENT → normal path runs (comprehend called) — regression guard.
  </action>
  <acceptance_criteria>
    - `grep -c "input.visionContext" src/lib/agents/somnio-v4/somnio-v4-agent.ts` >= 1.
    - The branch emits a `rag:` ProcessedMessage: `grep -c "templateId: \`rag:" src/lib/agents/somnio-v4/somnio-v4-agent.ts` >= 2 (the existing resolveLowSlot push + the new vision branch push).
    - The branch is BEFORE the comprehend() call (file:line of the branch < file:line of `await comprehend(`).
    - Test proves comprehend is NOT called when visionContext is present (D-05): the mock/spy assertion passes.
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts` passes (5 cases).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Sandbox parity — thread visionContext into engine-v4.ts + sandbox route</name>
  <files>src/lib/agents/somnio-v4/engine-v4.ts, src/app/api/sandbox/process/route.ts, src/lib/agents/somnio-v4/__tests__/engine-v4-vision.test.ts</files>
  <read_first>
    - `src/lib/agents/somnio-v4/engine-v4.ts:56+` (V4EngineInput) + `:271-296` (the `processMessage({...})` call it builds).
    - `src/app/api/sandbox/process/route.ts:42-44` (body destructure) + `:279-296` (v4 branch `v4Engine.processMessage({...})`).
    - `INTERRUPTION-PARITY.md` (the parity contract — prod runner + sandbox engine do NOT share code but MUST stay aligned in mechanism; document the new vision branch alignment).
  </read_first>
  <behavior>
    - The sandbox engine can exercise the SAME shared `processMessage` vision branch by supplying a
      `descripcion` directly (the Gemini Vision classifier itself only runs in production media-gate).
    - V4EngineInput gains `visionContext?: { descripcion: string; categoria: string }`; engine-v4.ts
      passes it into `processMessage({ ..., visionContext })`.
    - The sandbox route accepts `visionContext` in the request body and forwards it to v4Engine.processMessage.
  </behavior>
  <action>
    - `engine-v4.ts`: add `visionContext?: { descripcion: string; categoria: string }` to V4EngineInput
      (after the existing optional fields). In the `processMessage({...})` it builds (:271-296), add
      `visionContext: input.visionContext,`.
    - `sandbox/process/route.ts`: add `visionContext` to the body destructure (:43) typed as
      `{ descripcion: string; categoria: string } | undefined`, and pass `visionContext` into the v4
      branch `v4Engine.processMessage({...})` (:281).
    - `INTERRUPTION-PARITY.md`: append a short note documenting that the vision-respond branch lives in
      shared `processMessage` (somnio-v4-agent.ts), so prod (via runner→V4AgentInput.visionContext) and
      sandbox (via engine-v4→V4EngineInput.visionContext) exercise the identical branch. The classifier
      runs only in prod media-gate; sandbox supplies descripcion directly. This is the parity contract.

    Unit/integration test `__tests__/engine-v4-vision.test.ts` (or extend an existing engine-v4 test):
    - Construct a V4EngineInput with `visionContext: { descripcion:'foto del frasco ELIXIR', categoria:'producto' }`,
      mock the sub-loop runSubLoop → generated, and assert the engine output messages contain the
      responseText (i.e. the shared vision branch fired through the sandbox engine — parity proof).
    - visionContext absent → normal sandbox path (no vision branch).
  </action>
  <acceptance_criteria>
    - `grep -c "visionContext" src/lib/agents/somnio-v4/engine-v4.ts` >= 2 (V4EngineInput field + processMessage pass).
    - `grep -c "visionContext" src/app/api/sandbox/process/route.ts` >= 2 (body destructure + v4 call).
    - INTERRUPTION-PARITY.md contains a note referencing the vision branch + visionContext parity.
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-vision.test.ts` passes (parity case: visionContext → responseText in output).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- Pitfall 7 resolved via an explicit checked decision (Task 1) against the live tree — the runner's
  rag: send path is confirmed before relying on the engine-emits-rag: delivery model.
- Vision response is grounded (runSubLoop = kb_search + buildGenerationPrompt + threshold + binary
  backstop — RQ-1) and dedicated (early branch bypasses comprehension/state-machine/templates — D-05).
- Below-confidence / backstop / empty-KB / error → informed handoff (D-07), never blind.
- Delivery is automatic: engine emits `rag:<sourceTopic>` ProcessedMessage → runner's existing 5h-main
  send loop delivers it with no-rep (rag:* :796) + ledger exclusion (:839). NO new send wiring.
- Parity: the branch lives in shared processMessage; visionContext threaded into BOTH the prod runner
  input (EngineInput → V4AgentInput) and the sandbox engine input (V4EngineInput → V4AgentInput), so the
  sandbox exercises the identical branch (classifier-only differs: prod media-gate vs sandbox-supplied descripcion).
- Regla 6: all visionContext fields additive + optional + only populated for v4; the 5 non-v4 agents +
  v3-production-runner + interruption-system-v2 stay 0-line diff; CheckpointId count still 8.
</verification>

<success_criteria>
- v4 product/page images get a grounded, on-brand response delivered to the customer (or a safe informed
  handoff), produced INSIDE the engine and sent via the proven rag: path.
- The delivery mechanism is verified (Task 1), reused (no new send), and parity-aligned (prod + sandbox).
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-media-audio-image/04-SUMMARY.md` recording: the Task 1
decision (wired-reuse / block-ship-audio-only) and which check drove it, the V4AgentInput.visionContext
threading chain (prod + sandbox), the vision branch contract (runSubLoop reuse vs direct primitives —
which the executor chose and why), the rag: ProcessedMessage delivery confirmation (runner :751/:796/:839),
and the INTERRUPTION-PARITY note added. Plan 06 reads this for the Regla 6 file list + smoke checklist.
</output>
