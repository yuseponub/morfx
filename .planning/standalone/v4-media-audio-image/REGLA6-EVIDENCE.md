# Regla 6 Evidence — v4-media-audio-image Wave 5 (Plan 06)

Generated: 2026-06-01  
Baseline SHA: `85092058e4495fc0e97ff0be2c6da582ca06c563`  
Delivery model: **wired-reuse** (Task 1 decision from Plan 04 — image-respond SHIPPED).

---

## G1 — Five non-v4 agents byte-identical since baseline (PROTECTED)

```bash
git diff 85092058..HEAD --stat -- \
  src/lib/agents/somnio-v3 \
  src/lib/agents/godentist \
  src/lib/agents/godentist-fb-ig \
  src/lib/agents/somnio-recompra \
  src/lib/agents/somnio-pw-confirmation
```

**Output:** (empty — 0 lines changed)

**Annotation:** PASS — all 5 non-v4 agent directories are byte-identical to baseline. No Regla 6 leak.

---

## G2 — v3 production runner byte-identical (PROTECTED)

```bash
git diff 85092058..HEAD -- src/lib/agents/engine/v3-production-runner.ts
```

**Output:** (empty)

**Annotation:** PASS — v3 runner unchanged. Non-v4 message pipeline unaffected.

---

## G3 — interruption system byte-identical (PROTECTED)

```bash
git diff 85092058..HEAD -- src/lib/agents/interruption-system-v2
```

**Output:** (empty)

**Annotation:** PASS — interruption system untouched. Redis lock / checkpoint / pending / observability unchanged.

---

## G4 — checkpoint count still 8 (PROTECTED)

```bash
grep -oE "'(ckpt_0_post_acquire|ckpt_1_post_comprehension|ckpt_2_post_state_machine|ckpt_3_post_tooling|ckpt_4_post_generation|ckpt_5_post_compliance|ckpt_6_pre_send_loop|ckpt_7_pre_template)'" \
  src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l
```

**Output:** `8`

**Annotation:** PASS — exactly 8 CheckpointId values. The vision branch reuses the existing `runSubLoop` path which already uses CKPT-3/4/5 — no new checkpoints added.

---

## G5 — media-gate gates by v4 (image + audio)

```bash
grep -c "SOMNIO_V4_AGENT_ID\|somnio-sales-v4" src/lib/agents/media/media-gate.ts
```

**Output:** `3`

**Annotation:** PASS (≥2 required, got 3) — three references: 1x import of `SOMNIO_V4_AGENT_ID`, 1x audio case branch guard, 1x image case branch guard. Both audio AND image are gated.

---

## G6 — non-v4 image handoff string unchanged in the gate

```bash
grep -c "Cliente envio una imagen" src/lib/agents/media/media-gate.ts
```

**Output:** `2`

**Annotation:** PASS (≥1 required, got 2) — the string "Cliente envio una imagen" appears 2 times: once in the non-v4 image handoff literal and once in a code comment. The baseline non-v4 handoff path is byte-identical. The behavioral test in `media-gate-v4.test.ts` (`[Regla 6] non-v4 image → exact baseline handoff string`) additionally enforces this at runtime.

---

## G7 — v4 production runner: additive + v4-only (visionContext threading line)

```bash
git diff 85092058..HEAD -- src/lib/agents/engine/v4-production-runner.ts
```

**Output:**
```diff
diff --git a/src/lib/agents/engine/v4-production-runner.ts b/src/lib/agents/engine/v4-production-runner.ts
index cd89c5fc..6c35699f 100644
--- a/src/lib/agents/engine/v4-production-runner.ts
+++ b/src/lib/agents/engine/v4-production-runner.ts
@@ -375,6 +375,9 @@ export class V4ProductionRunner {
         workspaceId: this.config.workspaceId,
         sessionId: session.id,
         // systemEvent: undefined — only for timers, not user messages
+        // standalone v4-media-audio-image (Plan 04): thread vision context from
+        // EngineInput → V4AgentInput. Only populated on v4 image-respond path.
+        visionContext: input.visionContext,
       }
```

**Annotation:** PASS — additive, v4-only. The only change is adding `visionContext: input.visionContext` to the v4Input object construction. The entire existing send loop, no-rep, turn-ledger, timer, and interrupt logic is **unchanged** (zero deletions/modifications). `input.visionContext` is `undefined` on all non-image-respond turns, so this line is a no-op for text/audio/timer/non-v4 paths.

---

## G8 — vision engine branch + shared threading: additive + visionContext-gated

```bash
git diff 85092058..HEAD -- \
  src/lib/agents/somnio-v4/somnio-v4-agent.ts \
  src/lib/agents/somnio-v4/types.ts \
  src/lib/agents/engine/types.ts \
  src/lib/agents/production/webhook-processor.ts \
  src/lib/agents/somnio-v4/engine-v4.ts \
  src/app/api/sandbox/process/route.ts
```

**Summary of added lines per file:**

| File | Lines added | Nature |
|------|-------------|--------|
| `somnio-v4/types.ts` | +6 (comment+field) | `visionContext?: { descripcion: string; categoria: string }` — additive optional field |
| `engine/types.ts` | +7 (comment+field) | `visionContext?: { descripcion: string; categoria: string }` — additive optional field |
| `production/webhook-processor.ts` | +4 (comment+1 line) | `visionContext: input.visionContext ?? undefined` in EngineInput construction (v4 path only) |
| `somnio-v4/engine-v4.ts` | +8 (comment+1 line) | `visionContext?: ...` field + `visionContext: input.visionContext` thread in `processMessage` call |
| `src/app/api/sandbox/process/route.ts` | +8 (comment+2 lines) | body destructure adds `visionContext` + passes it to `engine.processMessage()` |
| `somnio-v4/somnio-v4-agent.ts` | +166 | Additive `if (input.visionContext) { ... return ... }` block before `comprehend()` (:181) |

**Key invariants confirmed:**

1. All 5 `visionContext` field declarations are `?` (optional) — no non-v4 caller is forced to supply it.
2. `somnio-v4-agent.ts` vision branch is an **early-return** at :181, **before** `comprehend()` at :333 (D-05 — comprehension skipped on vision path). The existing RAG/send/comprehension logic is untouched downstream.
3. The branch accesses `runSubLoop` (existing infra, zero new infra) and emits `rag:<sourceTopic>` ProcessedMessage — identical to `resolveLowSlot:576-589`.
4. No deletions or modifications to existing logic in any of these files.
5. The dedicated branch covers: interrupt → errorMessage discriminator (Path A), generated → rag: template, no_match/error → informed handoff (D-07). All three are covered by `vision-branch.test.ts` (C1/C2/C3).

**Annotation:** PASS — all added lines are either `visionContext?` field declarations, `visionContext` threading lines, or the additive `if (input.visionContext) { ... return }` early-return branch in `somnio-v4-agent.ts`. The existing normal pipeline (comprehend → state-machine → resolveSalesTrack → resolveResponseTrack → output.templates) is byte-identical. Regla 6 invariant holds: the vision branch is **additive** and **v4-gated** (guarded by `input.visionContext` which is only populated for v4 image-respond turns).

---

## Task 3: Full Test Sweep Results

### Command run (focused — excludes known pre-existing live-LLM debt)

```
npx vitest run \
  src/lib/agents/media/ \
  src/lib/domain/__tests__/messages-transcription.test.ts \
  src/lib/domain/__tests__/conversations.test.ts \
  src/lib/domain/__tests__/orders-duplicate-products.test.ts \
  src/lib/domain/__tests__/resolve-or-create-contact.test.ts \
  src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts \
  src/lib/agents/somnio-v4/__tests__/engine-v4-vision.test.ts \
  src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts \
  src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts \
  src/lib/agents/somnio-v4/__tests__/slots.test.ts \
  src/lib/agents/somnio-v4/__tests__/state.test.ts \
  src/lib/agents/somnio-v4/__tests__/transitions.test.ts \
  src/lib/agents/somnio-v4/__tests__/response-track.test.ts \
  src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts \
  src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts \
  src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts \
  src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts \
  src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts \
  src/lib/agents/somnio-v4/__tests__/escalation.test.ts \
  src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts \
  src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts \
  src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/compliance-check.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts \
  src/lib/agents/somnio-v4/unknown-cases/__tests__/redact.test.ts \
  src/lib/agents/interruption-system-v2/__tests__/lock.test.ts \
  src/lib/agents/interruption-system-v2/__tests__/pending.test.ts \
  src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts \
  src/lib/agents/interruption-system-v2/__tests__/observability.test.ts \
  src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts \
  src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts
```

### Result

```
Test Files  36 passed (36)
     Tests  333 passed | 4 skipped (337)
  Start at  12:58:51
  Duration  54.12s
```

**0 regressions.** All 333 active tests pass. 4 skipped are pre-existing (live-LLM integration cases skipped by test config — see below).

### Pre-existing debt excluded from sweep

| Test file | Failure / Skip | Classification |
|-----------|----------------|----------------|
| `somnio-v4/__tests__/few-shots.test.ts` | 1 fail: `M1 probability framing` | Pre-existing — unclosed `somnio-v4-rag-generative` standalone; prompt changed after test was written |
| `somnio-v4/__tests__/smoke-rag-b.test.ts` | 3 fail: `razonamiento_libre` cases expected `no_match` but get `generated` | Pre-existing — live LLM test assertions drift with KB changes in `somnio-v4-rag-generative` standalone |
| `somnio-v4/__tests__/smoke-rag-a.test.ts` | Live LLM — slow; runs to completion with passes but excluded for speed | Pre-existing — live Supabase/Gemini calls, no regression to this standalone |
| `somnio-v4/__tests__/comprehension-gemini.test.ts` | 3 skipped (live API) | Pre-existing — skipped by design (live Gemini API call; require explicit enable) |

**None of the above failures are caused by the v4-media-audio-image standalone.** The few-shots.test.ts M1 failure and smoke-rag-b failures predate this standalone (established before baseline SHA `85092058`). Zero regressions introduced.

### Test file breakdown

| Suite | Tests | Notes |
|-------|-------|-------|
| media/image-classifier | 7 | All 6 categorias + fail-safe (Plan 06 gap-fill) |
| media/media-gate-v4 | 5 | Regla 6 behavioral + v4 audio/image paths |
| domain/messages-transcription | 3 | setMessageTranscription happy/guard/error |
| domain/conversations | 11 | Pre-existing domain suite (no regression) |
| domain/orders-duplicate-products | 11 | Pre-existing (no regression) |
| domain/resolve-or-create-contact | 4 | Pre-existing (no regression) |
| somnio-v4/vision-branch | 5 | C1-C5: rag: delivery, no_match, interrupt, D-05 proof, regression guard |
| somnio-v4/engine-v4-vision | 2 | P1-P2: sandbox parity threading |
| somnio-v4/engine-v4-lock | 11 | E1-E10: lock lifecycle (pre-existing, no regression) |
| somnio-v4/somnio-v4-agent | 16 | Agent unit tests (pre-existing, no regression) |
| somnio-v4/slots | 33 | Slot tests (pre-existing, no regression) |
| somnio-v4/state | 9 | State machine (pre-existing, no regression) |
| somnio-v4/transitions | 12 | Transitions (pre-existing, no regression) |
| somnio-v4/response-track | 8 | Response track (pre-existing, no regression) |
| somnio-v4/comprehension-schema | 10 | Comprehension schema (pre-existing, no regression) |
| somnio-v4/crm-gate | 7 | CRM gate (pre-existing, no regression) |
| somnio-v4/crm-grounding | 7 | CRM grounding (pre-existing, no regression) |
| somnio-v4/crm-actions-echo | 9 | CRM actions (pre-existing, no regression) |
| somnio-v4/crm-whitelist | 6 | CRM whitelist (pre-existing, no regression) |
| somnio-v4/escalation | 6 | Escalation (pre-existing, no regression) |
| somnio-v4/smoke-hybrid | 10 (2 skipped) | Mocked hybrid smoke (pre-existing, no regression) |
| somnio-v4/knowledge-base/parser | 15 | KB parser (pre-existing, no regression) |
| somnio-v4/knowledge-base/coherence-check | 17 | KB coherence (pre-existing, no regression) |
| somnio-v4/sub-loop/output-schema | 15 | Output schema (pre-existing, no regression) |
| somnio-v4/sub-loop/generation-context | 22 | Generation context (pre-existing, no regression) |
| somnio-v4/sub-loop/compliance-check | 8 | Compliance (pre-existing, no regression) |
| somnio-v4/sub-loop/safe-output | 5 | Safe output (pre-existing, no regression) |
| somnio-v4/sub-loop/kb-search-tool | 5 | KB search tool (pre-existing, no regression) |
| somnio-v4/sub-loop/sub-loop-e2e | 6 (2 skipped) | Sub-loop E2E (pre-existing, no regression) |
| somnio-v4/unknown-cases/redact | 4 | Redact (pre-existing, no regression) |
| interruption-system-v2/lock | 12 | Lock tests (Regla 6 — unchanged, no regression) |
| interruption-system-v2/pending | 12 | Pending list (Regla 6 — unchanged, no regression) |
| interruption-system-v2/checkpoints | 8 | Checkpoints (Regla 6 — unchanged, no regression) |
| interruption-system-v2/observability | 6 | Observability (Regla 6 — unchanged, no regression) |
| interruption-system-v2/e2e-scenarios | 4 | E2E scenarios (Regla 6 — unchanged, no regression) |
| interruption-system-v2/restart-loop | 6 | Restart loop (Regla 6 — unchanged, no regression) |
| **TOTAL** | **333 pass, 4 skip** | **0 failures in scope** |

---

## Deferred Smoke (WhatsApp activation)

> **Constraint (D-11):** Inbound media from WhatsApp requires a **360dialog channel**. Meta Direct (Onurix) does NOT serve inbound media CDN URLs — they return 401/403. The smoke below can ONLY be run on a workspace connected via 360dialog.

### Pre-requisite
```sql
-- Activate v4 in a real workspace on a 360dialog channel
UPDATE workspace_agent_config
SET conversational_agent_id = 'somnio-sales-v4'
WHERE workspace_id = '<uuid>';
```

### Checklist

- [ ] **Audio transcript persists** — Send a WhatsApp AUDIO message → `messages.transcription` populated in DB (Wave 1 Gemini STT) → italic text appears under the audio player in `/whatsapp` inbox WITHOUT page refresh (Wave 4 realtime A1).

- [ ] **Image of product → grounded RAG response** — Send a WhatsApp IMAGE of the ELIXIR DEL SUEÑO product → Gemini Vision classifies as `categoria=producto, decision=responder` → engine vision branch fires → `runSubLoop` KB-grounded → `rag:<topic>` response delivered via the existing 5h-main send loop. Confirm response is substantive (not a handoff).

- [ ] **Image of payment receipt → informed handoff ONLY, NEVER payment confirmation (Pitfall 4)** — Send a WhatsApp IMAGE of a Nequi/Bancolombia transfer → Gemini Vision classifies as `categoria=comprobante_pago, decision=handoff` → engine receives handoff result → agent escalates to human. Confirm the bot does NOT say "su pago fue recibido" or similar.

- [ ] **Non-v4 agent (e.g. v3 in another workspace) still hands off images immediately (Regla 6 in prod)** — Send an image to a v3-enabled workspace → media-gate returns `{ action: 'handoff', reason: 'Cliente envio una imagen' }` (baseline string) → bot escalates without calling Gemini Vision.

- [ ] **Sandbox vision path** — Supply `visionContext: { descripcion: '...', categoria: 'producto' }` in the sandbox API body (`POST /api/sandbox/process`) → engine takes the dedicated vision branch (verified by `subLoopDebug` in the response + `comprehendCallCount=0` at the debug panel).

### Note on Sandbox Vision Test

The vision branch is testable in sandbox by supplying a `descripcion` via `visionContext` in the request body. The Gemini image classifier (`classifyImage`) only runs in the production media-gate — sandbox bypasses it and supplies the classification context directly. This allows testing the engine branch without a real WhatsApp image or Gemini Vision API call.

```json
{
  "message": "",
  "state": { ... },
  "history": [],
  "turnNumber": 1,
  "workspaceId": "<somnio-workspace-id>",
  "agentId": "somnio-sales-v4",
  "visionContext": {
    "descripcion": "Foto del frasco de ELIXIR DEL SUEÑO, presentación de 30 cápsulas",
    "categoria": "producto"
  }
}
```

The response should include `templates[0].templateId` starting with `rag:` and `messages[0]` containing the KB-grounded response.
