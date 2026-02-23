# Project Research Summary

**Project:** MorfX v4.0 — Human Behavior System (Somnio Agent)
**Domain:** WhatsApp conversational AI with human-like behavior patterns
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

The Human Behavior System (v4.0) transforms the MorfX Somnio agent from a robotic sequential responder into a WhatsApp sales agent that feels human. The core architectural insight is a single foundational shift: move from inline synchronous webhook processing to Inngest-queued async processing with concurrency 1 per conversation. This one change unlocks every subsequent behavior feature — character-based typing delays, interruption detection via pre-send DB checks, silence classification, and media processing all depend on the Inngest boundary. The good news: the `whatsappAgentProcessor` Inngest function already exists in the codebase with the correct `concurrency: { key: conversationId, limit: 1 }` configuration. It just needs to be activated.

The recommended approach is to build in layers, from infrastructure to intelligence. The first phase must be the Inngest migration (webhook emits event, async function processes it) paired with character-based typing delays — both low-risk and immediately visible improvements. Subsequent layers add silence classification with retake timers, pre-send interruption checks, media processing (Whisper for audio, Vision for stickers), and finally the no-repetition system with minifrase semantic matching. Only one new npm dependency is required: `openai` for Whisper audio transcription. Everything else leverages the existing stack: Inngest for durable execution, `@anthropic-ai/sdk` for Vision and Haiku minifrase generation, and Supabase for DB queries.

The single largest risk is the Inngest migration itself — a window exists during deployment where messages can be lost if the webhook emits events before the Inngest function is registered. This is mitigated via a feature flag (`USE_INNGEST_PROCESSING` env var) that allows instant rollback without a code deploy. The second critical risk is Inngest function restructuring: if all template sends live inside a single `step.run()`, a retry will resend already-delivered WhatsApp messages. Each template send must be its own idempotent step. These two architecture decisions must be locked in before writing any code for Phase 1.

---

## Key Findings

### Recommended Stack

The stack footprint is minimal by design. The project already has `@anthropic-ai/sdk` (Claude Vision, Haiku), `inngest` with proven concurrency patterns, and Supabase. The only addition is `openai` for Whisper transcription — OGG audio (WhatsApp's native format) is supported natively with no transcoding required.

**Core technologies:**
- `inngest` ^3.51.0 (existing): Concurrency 1 per conversation, durable step execution, `step.sleep()` for char delays — already proven in `agent-production.ts` and `agent-timers.ts`
- `@anthropic-ai/sdk` ^0.73.0 (existing): Haiku 3.5 for minifrase generation (~$0.0003/call) and sticker interpretation via Vision (~$0.0005/sticker) — same SDK used for Phase 27 OCR
- `openai` ^6.22.0 (NEW — only new dependency): Whisper-1 for Spanish audio transcription (~$0.001/audio note) — OGG format supported natively
- Supabase (existing): DB queries for pre-send interruption check — read-only `EXISTS` query, no new connection pool concerns

**What NOT to add:** ffmpeg/transcoding (OGG works natively), Redis/BullMQ (Inngest already handles queuing), random delay jitter libraries (deterministic character-based curve is better), separate Haiku 4.5 model (3.5 is sufficient for classification tasks at 25% lower cost).

**Total new monthly AI cost at 50 conversations/day:** ~$1.55–3.08 — roughly 10-15% on top of existing Claude costs.

### Expected Features

The features divide cleanly between table stakes (what makes the bot stop feeling robotic) and differentiators (what makes it feel genuinely human). Both layers are essential for the stated goal of a WhatsApp agent that sells like a real salesperson.

**Must have — table stakes (T1–T7):**
- T1: Character-based typing delays (2s min, 12s cap, logarithmic curve) — instant responses are the #1 bot tell
- T2: Message grouping via check-pre-envio — humans wait for customers to finish, then respond to the whole block
- T3: Interruption detection — stop sending mid-sequence when customer replies
- T4: Silence classification for acknowledgments (Ok/jaja/sticker) — real sellers don't reply to every noise signal
- T5: Handoff to human for complex/negative intents — 6 HANDOFF intents already defined but need activation
- T6: Audio message processing via Whisper — 30-40% of LA WhatsApp messages are voice notes; ignoring them is broken
- T7: Non-text media handling (image/video handoff, sticker Vision, reaction mapping)

**Should have — differentiators (D1–D5):**
- D1: No-repetition system with 3 escalation levels — single biggest differentiator; most bots repeat themselves constantly
- D2: Priority-based pending merge (CORE/COMPLEMENTARIA/OPCIONAL) — nothing critical lost on interrupt
- D3: 90s retake timer for silence — proactive re-engagement without being pushy
- D4: Confidence-based routing with disambiguation log — data-first approach to learning edge cases
- D5: Paraphrasing for repeated intents — no duplicate template variants needed

**Defer to v2+:**
- WhatsApp typing indicator API (user explicitly deferred — typing delays alone are sufficient)
- V2 disambiguator with 3-band confidence (needs 20-50 real reviewed cases first)
- Sentiment analysis for tone matching (dangerous without proper training data, HANDOFF handles negatives)
- Multi-language detection (Colombian Spanish is the only realistic use case)

**Critical anti-features (explicitly avoid):**
- Artificial keystroke-by-keystroke simulation — overkill, users only see "typing..." bubble
- Explicit debounce with waiting message — dead giveaway it's a bot
- Over-aggressive proactive messaging — one retake timer at 90s is the limit
- Random delay variance — deterministic curve already provides natural variation via message length

**MVP feature order:** Inngest migration → T1 char delays → T4+D3 silence/retake → T2+T3 check pre-envio → T6+T7 media → D4 confidence routing → D1+D2+D5 no-repetition system.

### Architecture Approach

The architecture is a layered processing pipeline inside Inngest's durable execution model. The webhook becomes a thin ingestion layer (~200ms) that saves messages to DB and emits an Inngest event. The Inngest function runs with concurrency 1 per conversation and processes messages through 8 sequential layers: Media Gate (resolve audio/sticker to text) → Message Classifier (RESPONDIBLE/SILENCIOSO/HANDOFF) → Confidence Routing → Orchestration (existing, unchanged) → Pending Merge → No-Repetition → Send with Pre-Check. The send loop uses regular `setTimeout` sleeps (not `step.sleep()`) inside a single step, which means no Inngest memoization overhead between templates.

**Major components:**
1. `webhook-handler.ts` (MODIFIED) — Remove inline `processMessageWithAgent()` call, emit `agent/whatsapp.message_received` for all eligible message types (text/audio/sticker/reaction/image/video), return 200 in ~200ms
2. `agent-production.ts` (MODIFIED) — Activate the existing but unused `whatsappAgentProcessor` function, add media gate and per-template step structure
3. `media-gate.ts` (NEW) — Route by media type: audio→Whisper, sticker→Vision, image/video→handoff, reaction→emoji mapping, text→passthrough
4. `message-classifier-v2.ts` (NEW) — Post-IntentDetector RESPONDIBLE/SILENCIOSO/HANDOFF classification; MUST be state-aware (confirmatory modes treat "Ok" as RESPONDIBLE)
5. `silence-timer.ts` (NEW) — 90s `step.waitForEvent` pattern, identical to existing 4 timer functions
6. `messaging.ts` (MODIFIED) — Replace fixed `delaySeconds` with `calculateCharDelay()`, add DB check before each template send
7. `pending-merge.ts` (NEW) — Priority-based merge of interrupted templates; clear on HANDOFF and session reset
8. `no-repeat.ts` (NEW) — Level 1 (ID lookup, $0), Level 2 (minifrase Haiku, ~$0.0003), Level 3 (full context Haiku, ~$0.001)
9. `disambiguation-log.ts` (NEW) — Log low-confidence interactions for human review

**Deprecated (not deleted):** `message-sequencer.ts` and `interruption-handler.ts` — replaced by the pre-send DB check approach (no stale-cache bug, no WebSocket requirement).

**DB changes required (4 total):**
- `messages.processed_by_agent BOOLEAN DEFAULT true` — enables interruption detection
- `agent_templates.priority TEXT CHECK ('CORE','COMPLEMENTARIA','OPCIONAL')` — pending merge ordering
- `agent_templates.minifrase TEXT` — ~30 rows to populate manually for no-repeat Level 2
- New table `disambiguation_log` — logs ambiguous intent cases for human review

### Critical Pitfalls

1. **Inngest migration message loss (Pitfall 3)** — Deploy with `USE_INNGEST_PROCESSING=false` env flag, verify function registered in Inngest dashboard, then flip flag. Never deploy webhook change and Inngest function change as separate deploys.

2. **Duplicate sends on retry (Pitfall 5)** — NEVER put multiple template sends in a single `step.run()`. Structure the send loop as `step.run('process')` → `step.sleep('delay-N')` → `step.run('check-N')` → `step.run('send-N')` for each template. Each send must be independently memoized so retries don't re-deliver.

3. **Handoff state corruption with queued Inngest runs (Pitfall 6)** — After HANDOFF, the `isAgentEnabledForConversation()` check at the start of each run is the primary defense. Ensure handoff flag writes to DB BEFORE the current Inngest run completes. Consider adding `conversation.agent_handoff_at` timestamp.

4. **Timer race conditions and conflicts (Pitfalls 2 + 9)** — The silence timer MUST use the proven 5-second `step.sleep('settle', '5s')` before `step.waitForEvent()`. All 4 existing timers already do this. The silence timer must also cancel via the existing `agent/customer.message` event. Before starting any timer, emit cancellation events for all other active timer types (cancel-before-start pattern from Bug #7).

5. **SILENCIOSO classification in confirmatory modes (Pitfall 14)** — "Ok" in `resumen` mode confirms the order; classifying it as SILENCIOSO loses the sale. The classifier MUST read session mode from DB before classifying. Whitelist `resumen`, `collecting_data`, `confirmado` as always-RESPONDIBLE modes. Unit test the full [message × mode] matrix.

---

## Implications for Roadmap

Based on research, the natural phase structure follows the dependency graph in ARCHITECTURE.md. Every feature depends on the Inngest migration. After that, features split into independent tracks that can be developed in parallel.

### Phase 1: Foundation — Inngest Migration + Character Delays

**Rationale:** Everything depends on Inngest concurrency-1. This is the prerequisite. Character delays can be developed in parallel (isolated change in MessagingAdapter) and deployed together.

**Delivers:** Webhook returns in ~200ms; messages processed asynchronously with concurrency guarantee; typing delays replace instant responses (immediately visible human-like behavior).

**Addresses:** T1 (char delays), critical path for T2/T3/T4/T6/T7/D3.

**Avoids:** Pitfalls 3 (migration message loss via feature flag), 16 (missing await on `inngest.send`).

**Research flag:** Standard patterns — Inngest migration is documented, feature flag pattern is established in codebase. `step.sleep` char delay is pure math. Skip research-phase, go straight to plan.

---

### Phase 2: Message Classification + Silence Timer

**Rationale:** Classification determines which messages the bot should respond to at all. Must come before the pre-send check (Phase 3) so the concurrency queue isn't wasted on messages that should be silent. The silence timer follows the exact same pattern as the 4 existing timers.

**Delivers:** Bot no longer responds to "ok", "jaja", thumbs-up. 90-second retake timer re-engages silenced customers. HANDOFF intents properly route to human without queued Inngest runs interfering.

**Addresses:** T4 (silence), T5 (handoff enhancement), D3 (retake timer).

**Avoids:** Pitfalls 2 (timer settle race — 5s sleep), 9 (timer conflicts — cancel-before-start), 14 (confirmatory mode classification).

**Research flag:** Standard patterns — all timer logic copies existing patterns verbatim. Classification logic is new but pure TypeScript (no external APIs). Skip research-phase.

---

### Phase 3: Pre-Send Check + Interruption Handling

**Rationale:** The core "human conversation block" behavior. After classification ensures we're responding to the right messages, this phase ensures we don't talk over the customer mid-sequence. Also handles the pending-merge problem (what to do with unsent templates when interrupted).

**Delivers:** Bot stops sending when customer replies mid-sequence; unsent templates are saved with priority; next message picks up pending templates via priority-based merge.

**Addresses:** T2 (message grouping), T3 (interruption), D2 (priority merge).

**Avoids:** Pitfalls 1 (rapid message race — check pre-envio IS the fix), 4 (queue backlog — interruption allows quick completion), 6 (handoff with pending templates — clear on handoff), 8 (connection pool — lightweight EXISTS query), 15 (stale pendientes — TTL on pending templates).

**Research flag:** Standard patterns — DB query pattern is simple. Needs careful testing of merge edge cases (CORE never dropped). Skip research-phase but plan thorough test scenarios.

---

### Phase 4: Confidence Routing + Disambiguation Log

**Rationale:** Low-effort, high-value safety valve. Prevents the bot from confidently answering ambiguous questions. The data-first approach (log cases, review later) is the right call for V1 before building a sophisticated disambiguator.

**Delivers:** Low-confidence intent detection routes to HANDOFF + logs full context to `disambiguation_log` table. After 20-50 real cases, build V2 disambiguator.

**Addresses:** D4 (confidence routing).

**Avoids:** Pitfall 17 (threshold too aggressive — start at 60% or 0%, configurable per workspace).

**Research flag:** Standard patterns — small code change in `somnio-agent.ts` + new DB table. Skip research-phase.

---

### Phase 5: Media Processing

**Rationale:** Independent of Phases 2-4 (only depends on Phase 1 Inngest migration). Can be developed in parallel. Addresses 30-40% of WhatsApp messages currently being silently ignored.

**Delivers:** Voice notes transcribed via Whisper and processed as text; images/videos routed to HANDOFF; stickers treated as SILENCIOSO (simpler than Vision) or interpreted via Claude Vision; reactions mapped to text equivalents.

**Addresses:** T6 (audio), T7 (non-text media).

**Uses:** `openai` SDK (only new dependency), `@anthropic-ai/sdk` Vision (existing).

**Avoids:** Pitfalls 7 (Whisper OGG format — pass `language: 'es'`, rename to `.ogg` if needed), 10 (sticker hallucination — recommend treating ALL stickers as SILENCIOSO for V1), 19 (media download timeout — fallback to HANDOFF on null media URL).

**Research flag:** Needs light research on Whisper OGG format behavior in production (community reports of issues). Test with real WhatsApp audio samples before declaring complete. Flag for plan-phase validation.

---

### Phase 6: No-Repetition System

**Rationale:** Most complex feature, highest development risk. Depends on all previous phases being stable (especially pre-send check from Phase 3 which provides the `templates_enviados` registry). Correct to defer until infrastructure is solid.

**Delivers:** Level 1 (exact template ID check, $0, ~0ms), Level 2 (minifrase semantic match via Haiku, ~$0.0003, ~200ms), Level 3 (full context Haiku check, ~$0.001, ~1-3s). D5 paraphrasing for repeated intents falls naturally from Level 1 detection.

**Addresses:** D1 (no-repetition), D5 (paraphrasing).

**Uses:** Claude Haiku 3.5 directly (bypass MODEL_MAP), `agent_templates.minifrase` column (populated manually for ~30 templates).

**Avoids:** Pitfall 11 (Haiku false positives — bias toward ENVIAR, skip Level 2 for CORE templates, specific minifrases, log all decisions).

**Research flag:** Consider `/gsd:research-phase` for the minifrase comparison approach — specifically testing Haiku's accuracy at semantic deduplication with real template examples before committing to the 3-level architecture. Level 3 can be deferred to V2 if Level 1+2 prove sufficient.

---

### Phase Ordering Rationale

- Phase 1 must come first: `whatsappAgentProcessor` Inngest function already exists but is not connected to the webhook. This single wire-up unlocks all subsequent async behavior.
- Phase 2 before Phase 3: classification determines which messages enter the processing pipeline at all. Pre-send check is only valuable for RESPONDIBLE messages.
- Phase 3 before Phase 6: no-repetition needs `templates_enviados` reliably populated, which requires the send loop to complete correctly with check pre-envio.
- Phase 4 is low-risk and small: can be slotted between any phases.
- Phase 5 is independent: only depends on Phase 1. Can be developed in parallel with Phases 2-4 if desired.
- Phase 6 last: most complex, benefits from all other systems being stable and battle-tested.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 5 (Media Processing):** Whisper OGG behavior in production has community-reported issues. Test with real 360dialog audio samples before finalizing the approach. Decision on sticker strategy (all-SILENCIOSO vs Vision) may shift based on client conversation volume data.
- **Phase 6 (No-Repetition):** The 3-level minifrase system is sophisticated. Validate Haiku 3.5 accuracy on Spanish template comparison with concrete examples before committing. Level 3 (full context analysis) may have unacceptable latency for the check-pre-envio loop.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Inngest Migration + Char Delays):** `whatsappAgentProcessor` exists, feature flag pattern is established, char delay is pure math.
- **Phase 2 (Classification + Silence Timer):** Copies exact pattern from 4 existing timer functions. Classification is pure TypeScript logic.
- **Phase 3 (Pre-Send Check):** DB EXISTS query, session state write, merge algorithm. Well-understood patterns.
- **Phase 4 (Confidence Routing):** Small `somnio-agent.ts` modification + DB table.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new dep (openai). Everything else proven in production. Pricing verified from official docs. |
| Features | HIGH | Table stakes verified by industry research + existing design docs. Anti-features well-argued. MVP order matches dependency graph. |
| Architecture | HIGH | Based on full codebase analysis of 15+ source files. `whatsappAgentProcessor` existence confirmed. All integration points documented with file:line references. |
| Pitfalls | HIGH | Grounded in 14 documented production bugs from `LEARNINGS-production-hotfixes.md`. Inngest behavior verified from official docs. Known GitHub issues cited. |

**Overall confidence:** HIGH

### Gaps to Address

- **Whisper + 360dialog OGG compatibility in practice:** Research found community reports of OGG format issues with Whisper. Must test with real WhatsApp audio from 360dialog before Phase 5 implementation. Fallback: rename to `.ogg` with explicit MIME type.
- **Sticker handling strategy:** Research recommends "all stickers = SILENCIOSO" over Vision interpretation (to avoid hallucination risk). Validate this decision with product owner before Phase 5. If Vision is used, cache interpretations by image hash.
- **Confidence threshold starting point:** Research recommends starting at 60% or even 0% (log everything, threshold later). Align with product owner before Phase 4. Starting too aggressive (80%) will overwhelm the human agent.
- **No-repetition Level 3 latency:** Full context Haiku call takes 1-3 seconds. This runs inside the pre-send check loop, adding delay before each template send. If latency is unacceptable, defer Level 3 to V2 and use Level 1+2 only.
- **Sandbox parity for new features:** Character delays and no-repetition should work in both sandbox and production environments (W2 warning). Plan how SandboxMessagingAdapter will simulate delays without actually sleeping 12 seconds during testing.

---

## Sources

### Primary — HIGH Confidence

- MorfX codebase analysis (full read of 15+ source files, DISCUSSION.md, ARCHITECTURE-ANALYSIS.md design docs)
- [Inngest Concurrency Documentation](https://www.inngest.com/docs/functions/concurrency) — concurrency key CEL syntax, step vs run limits
- [Inngest Sleeps Documentation](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps) — confirmed sleep does not hold compute
- [Inngest Durable Execution](https://www.inngest.com/docs/learn/how-functions-are-executed) — step memoization behavior on retry
- [OpenAI Whisper API Reference](https://platform.openai.com/docs/api-reference/audio/) — OGG in supported formats list
- [OpenAI Pricing](https://platform.openai.com/docs/pricing) — Whisper-1: $0.006/min verified
- [Anthropic Claude Vision Documentation](https://platform.claude.com/docs/en/docs/build-with-claude/vision) — WebP supported, token formula (width×height)/750
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — Haiku 3.5: $0.80/$4.00 per 1M tokens
- [Inngest GitHub Issue #1433](https://github.com/inngest/inngest/issues/1433) — step.waitForEvent race condition (known bug, 5s settle is the mitigation)
- `.planning/phases/16.1-engine-unification/LEARNINGS-production-hotfixes.md` — 14 production bugs, proven patterns

### Secondary — MEDIUM Confidence

- [n8n WhatsApp Debounce Flow](https://community.n8n.io/t/whatsapp-debounce-flow-combine-multiple-rapid-messages-into-one-ai-response-using-redis-n8n/225494) — 8-10s industry standard debounce window
- [arXiv: Beyond Words — Human-like Typing Behaviors](https://arxiv.org/abs/2510.08912) — hesitation + self-editing increases trust
- [Chatbot-to-Human Handoff Guide](https://www.spurnow.com/en/blogs/chatbot-to-human-handoff) — 70-80% confidence threshold is industry standard
- [Claude Vision Hallucinations](https://medium.com/cyberark-engineering/beware-of-llm-vision-hallucinations-a657fa15d340) — multimodal LLMs frequently hallucinate in ambiguous images
- [OpenAI Community — Whisper OGG issues](https://community.openai.com/t/whisper-api-fails-on-large-ogg-files-still-below-25mb/717932) — known format edge cases
- [Webhook async migration best practices](https://hookdeck.com/webhooks/guides/why-you-should-stop-processing-your-webhooks-synchronously) — async pattern rationale

### Tertiary — LOW Confidence

- Latin American WhatsApp voice note usage (30-40%) — general industry estimate, no specific data source
- Gnewuch et al. ECIS 2018 "Faster Is Not Always Better" — cited in FEATURES.md, paper not directly verified
- 360dialog typing indicator support — assumed from Meta Cloud API compatibility

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
