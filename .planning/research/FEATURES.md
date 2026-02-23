# Feature Landscape: Human-Like Conversation Behavior

**Domain:** Conversational AI / WhatsApp sales agent with human-like behavior
**Researched:** 2026-02-23
**System context:** MorfX Somnio agent -- WhatsApp bot selling sleep supplement, needs to feel like a real salesperson

---

## What Already Exists in MorfX

- **33 intents** with template-based responses via SomnioOrchestrator (deterministic)
- **IntentDetector** with Claude Sonnet (confidence score returned but action field ignored)
- **ConfidenceThresholds** defined in types.ts (4 bands: 85/60/40/0) but NOT enforced
- **MessageSequencer + InterruptionHandler** designed in Phase 14 but never connected to production
- **whatsappAgentProcessor** Inngest function with concurrency 1/conversation -- EXISTS but not in active flow
- **ProductionMessagingAdapter** with simple for-loop and fixed `delay_s` per template
- **Timer system** (Inngest): data collection timer, promo timer, resumen timer -- all using `step.waitForEvent()` pattern
- **Webhook handler** processes only `msg.type === 'text'` -- all media saved to DB but ignored by agent
- **Session state** tracks `templates_enviados` (array of template IDs already sent)

---

## Table Stakes

Features users (message recipients) expect from a human-like WhatsApp conversation. Missing = bot feels robotic and untrustworthy.

| # | Feature | Why Expected | Complexity | Depends On | Notes |
|---|---------|-------------|------------|------------|-------|
| T1 | **Character-based typing delays** | Humans don't type 200-char messages in 0ms. Instant responses are the #1 tell that it's a bot. Research (Gnewuch et al. ECIS 2018) confirms dynamic delays proportional to message length increase perceived humanness. | Low | Nothing | Curve: 2s min, ~12s cap at 250+ chars. Logarithmic with deceleration -- short messages have proportionally higher "thinking" overhead. Average human mobile typing ~30-40 WPM = ~150-200ms per character, but the delay curve simulates "read + think + type" not just raw typing speed. The designed curve (2s-12s) with configurable speed multiplier (0.7/1.0/1.3) is appropriate. Deterministic -- message length variation provides natural timing variation without needing random jitter. |
| T2 | **Message grouping via check-pre-envio** | Humans send 2-5 rapid messages ("Hola" / "cuanto vale?" / "el envio es gratis?"). A human seller waits for them to finish, then responds to everything at once. Bots that reply to each message separately feel robotic and spammy. | Medium | Inngest migration (async processing) | Industry standard debounce: 5-10 second window (n8n community: 8-10s, Clawdbot: 5s configurable, Redis-buffer approach). The designed check-pre-envio approach is MORE elegant: no explicit debounce window. Instead, the character delay between template sends acts as natural collection window. If a new inbound arrives during the delay, the sequence stops and the new message gets processed as a fresh block. Avoids the "artificial waiting" problem. |
| T3 | **Interruption detection** | When a seller is sending a multi-part response and the customer replies mid-sequence, the seller STOPS sending and addresses the new question. Bots that keep pushing messages after the customer replied feel aggressive and deaf. | Medium | T1, Inngest migration | Pattern: DB query (`SELECT count(*) FROM messages WHERE direction='inbound' AND created_at > processing_start`) before each send. Most reliable for serverless (WebSocket approaches don't work in Vercel). ~250ms blind window between check and actual send is acceptable. The existing InterruptionHandler/MessageSequencer will be replaced by this simpler, more reliable approach. |
| T4 | **Selective silence for acknowledgments** | When someone says "Ok" or sends a thumbs-up, a real person doesn't respond. Bots that reply to "ok" with a product pitch feel desperate and robotic. | Low | Intent detection | Three categories post-IntentDetector: RESPONDIBLE (process normally), SILENCIOSO (don't respond, start 90s retake timer), HANDOFF (escalate to human). Critical nuance: "Ok"/"Si" ARE significant in confirmatory states (resumen, collecting_data, confirmado). Classification MUST be state-aware. Regex/keyword gate is sufficient -- no LLM needed. |
| T5 | **Handoff to human for complex situations** | When the customer asks to speak to a person, complains, or sends something the bot can't handle, a real salesperson escalates. Bots that try to handle everything feel trapped. | Low | Nothing (partially exists) | 6 HANDOFF intents: asesor, queja, cancelar, no_gracias, no_interesa, fallback. On handoff: bot deactivates, sends "Regalame 1 min", notifies host, saves pending templates, cancels retake timer. Standard pattern verified across multiple chatbot platforms. |
| T6 | **Audio message processing** | 30-40% of WhatsApp messages in Latin America are voice notes. A bot that ignores voice messages loses a huge portion of customer input. | Medium | Whisper API, Media gate | OpenAI Whisper API supports OGG natively (WhatsApp's voice format) -- NO conversion needed. Models: `whisper-1` (V2), `gpt-4o-transcribe` (newer, better). Cost: ~$0.006/min. Spanish support strong. Key behavior: transcribe silently, respond as if you "heard" the audio -- never mention transcription. 1-2 intent limit sensible; 3+ intents in single audio = handoff (too complex for bot to address properly). |
| T7 | **Non-text media handling** | Complete silence on images, videos, stickers feels broken. Even if the bot can't process them, a human acknowledges receipt. | Low | Media type detection | Image/Video: handoff ("Regalame 1 min" + notify host). Sticker: Claude Vision interprets (~$0.003) -- if recognizable emotion/gesture, convert to text and process; if abstract, handoff. Reaction (emoji on message): arrives as text in webhook, no Vision needed -- map common reactions to text equivalents (thumbs_up = "ok", heart = positive ack, laugh = "jaja"). |

---

## Differentiators

Features that set this system apart from typical WhatsApp bots. Not expected but create the "this feels real" reaction.

| # | Feature | Value Proposition | Complexity | Depends On | Notes |
|---|---------|-------------------|------------|------------|-------|
| D1 | **No-repetition system (3 escalation levels)** | Most bots repeat themselves constantly -- sending the same product info multiple times in a conversation. A real seller never says "our product costs $77,900" twice. The 3-level escalated check is sophisticated and uncommon in the industry. | High | Message history, template tracking, Haiku API | **Single biggest differentiator.** Level 1: template ID lookup in session_state.templates_enviados (0ms, $0) catches exact repeats. Level 2: minifrase (theme tag) comparison via Haiku (~200ms, ~$0.0003) catches thematic repeats even across message types (template vs human vs AI). Level 3: full message context analysis via Haiku (~1-3s) handles partial overlaps ("human covered 60% of this template's content"). Most chatbot platforms only do Level 1 if anything. The minifrase system (manual tags for ~30 templates, Haiku-generated for human/AI messages) is pragmatic. |
| D2 | **Priority-based pending merge** | When interrupted mid-sequence, most bots either drop unsent messages or blindly resume. This system merges pending messages with new response using CORE/COMPLEMENTARIA/OPCIONAL priority, ensuring nothing critical is lost while avoiding overload. | Medium | T3 (interruption), template priority metadata | Max 3 templates per response block prevents overwhelming. Priority assignment is PER TEMPLATE PER INTENT (same template can be CORE in one intent, COMPLEMENTARIA in another). Pending CORE can displace new COMP/OPC. Example: /precio interrupted -> pending. Next intent generates /modouso (CORE) + /tiempoefecto1 (COMP). Merge: /modouso + /precio(pending,CORE) + /tiempoefecto1. Rare in commercial WhatsApp bots. |
| D3 | **Retake timer (proactive re-engagement)** | When the customer goes silent after a non-committal response ("ok"), a real seller circles back after ~90s with a gentle redirect. Most bots nag immediately or give up entirely. | Low | Inngest timer pattern | 90 seconds calibrated: short enough to re-engage, long enough to not feel pushy. Uses identical Inngest pattern as existing timers: `step.waitForEvent('agent/customer.message', timeout: '90s')`. Customer message before timeout cancels timer. New message = retake redirect toward sale. |
| D4 | **Confidence-based routing with learning loop** | Most bots respond to everything (even uncertain) or escalate too aggressively. The data-first approach collects real ambiguous cases before building disambiguation logic. | Medium | Disambiguation log table | V1: 2 bands (>=80% respond, <80% handoff + log to disambiguation_log with full context: customer_message, agent_state, intent_alternatives, templates_enviados, pending_templates). Human reviews each case, fills correct_intent + guidance_notes. After 20-50 cases: build V2 with 3 bands (>=80% respond, 60-79% auto-disambiguate using reviewed cases as few-shot, <60% handoff). Industry standard is 70-80% threshold boundary. |
| D5 | **Paraphrasing for repeated intents** | When a customer asks the same question twice, most bots send identical text. A real person rephrases: "Como te decia, cuesta $77,900 con envio gratis." | Medium | D1 (no-repetition), Claude API | Eliminates need for "first visit" vs "subsequent visit" template variants in DB. When intent repeats: take top-2 templates by priority (CORE > COMP > OPC), Claude Haiku paraphrases (~$0.001 per template). Keeps conversation fresh without maintaining duplicate template sets. |
| D6 | **Block-based conversation model** | The architectural paradigm of treating conversations as "blocks" (customer question block -> bot response block) rather than message-by-message. This single concept enables T1-T3 and D1-D2 to work together coherently. | Conceptual | Inngest migration | Not a user-visible feature -- it's the foundation. Key insight: the character delay between template sends doubles as the debounce window for incoming messages. No separate debounce timer needed. Process immediately, check before each send, stop if interrupted, merge pending into next block. |

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in the human-like chatbot domain.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|-------------|-----------|-------------------|
| A1 | **Artificial keystroke-by-keystroke simulation** | Research (arXiv 2510.08912) shows hesitation + self-editing improves naturalness, but on WhatsApp users only see "typing..." indicator -- never individual keystrokes. Simulating typo injection, correction sequences, variable per-character delays is extreme overkill. | Simple character-count-based delay curve + optional typing indicator API call. The "typing..." bubble is sufficient for perceived naturalness. |
| A2 | **Explicit debounce with waiting message** | Some bots send "Please wait while I read your messages..." during debounce. Dead giveaway it's a bot. No human says "hold on, I'm reading your messages." | Check-pre-envio pattern: process immediately, check for new messages before each send. Character delay = natural collection window. No waiting message needed. |
| A3 | **Over-aggressive proactive messaging** | Some bots send "Are you still there?" after 30 seconds, or push promos every few minutes. Feels spammy and desperate. Stacking multiple timers compounds the problem. | Single retake timer at 90s for SILENCIOSO only. Existing promo/data-collection timers handle other proactive outreach. One gentle nudge per silence period is the limit. |
| A4 | **Sentiment analysis for tone matching** | Building sentiment analysis to make bot match customer's emotional tone (happy/sad/frustrated) is dangerous. Misreading sentiment leads to inappropriate responses ("Que alegria!" when customer is angry). | Intent system handles tone indirectly. HANDOFF intents (queja, cancelar) catch negative sentiment cases. Bot personality stays consistently warm and professional, not reactive to mood. |
| A5 | **Image/video AI processing** | Building Vision analysis for customer photos ("Is this your product?" / "Look at this damage") requires visual context understanding that's hard to get right in sales context. Misinterpreting a complaint photo as product inquiry would be disastrous. | Handoff to human for all images/videos. Only process stickers (which are emotive/gestural, not informational). |
| A6 | **Multi-language detection** | For a Colombian sleep supplement sold in Spanish, language switching adds complexity with near-zero value. The rare English-speaking customer gets handoff. | Keep everything in Spanish. Non-Spanish messages naturally trigger low confidence (<80%) which routes to handoff. |
| A7 | **Random delay variance for "naturalness"** | Adding +/-20% random variance to delays seems natural but makes behavior unpredictable and harder to debug. Character-based curve already provides variation because message lengths vary. | Deterministic delay curve based on character count. Natural variation comes from different message lengths. Configurable speed multiplier (0.7/1.0/1.3) is better than randomness for tuning. |
| A8 | **Complex disambiguator before data collection** | Building sophisticated disambiguation for low-confidence intents before real-world data is premature. You don't know edge cases until real customers trigger them. | V1: 2-band system (>=80% respond, <80% handoff + log). Collect 20-50 cases with human review. Build V2 disambiguator only when pattern emerges from data. |
| A9 | **WhatsApp typing indicator API (for now)** | Technically possible (Cloud API supports it, lasts 25s), but user explicitly decided against it. Adds API calls and 360dialog compatibility uncertainty for marginal benefit. | Deferred by decision. Character delays + natural pacing are sufficient for V1. One-line enhancement possible later. |
| A10 | **Separate "following visit" template variants** | Maintaining duplicate template sets (primera_vez vs siguientes) doubles content management burden and templates still sound repetitive on third/fourth visit. | Paraphrasing via Claude Haiku (D5) handles repeated intents dynamically. Top-2 priority templates get paraphrased on repeat visits. No duplicate templates needed. |

---

## Feature Dependencies

```
                    INNGEST MIGRATION (prerequisite)
                    Move webhook from inline to async Inngest
                    Activate whatsappAgentProcessor (already exists)
                    |
            +-------+--------+------------------+
            |                |                  |
    +-------v------+  +-----v--------+  +------v-------+
    | T1: Char     |  | T4: Silence  |  | T6+T7: Media |
    | Delays       |  | Classification|  | Gate         |
    | (isolated)   |  | + D3: Retake |  | Audio/Sticker|
    +-------+------+  +--------------+  +--------------+
            |
    +-------v-----------+
    | T2+T3: Check      |
    | Pre-Envio +       |
    | Interruption      |
    | (requires         |
    |  processed_by_    |
    |  agent DB field)  |
    +-------+-----------+
            |
    +---+---+---+--------+
    |   |       |        |
    v   v       v        v
   D2  D1      D4       T5
   Merge No-Rep Confid.  Handoff
   Pend. System + Log   (enhance)
    |   |
    +---+
    |
    v
    D5: Paraphrasing
    (needs D1 to know when
     intent is repeated)
```

**Critical path:** Inngest Migration -> T1 -> T2/T3 -> D1/D2 -> D5

**Independent tracks (can run in parallel):**
- T4 + D3 (silence classification + retake timer) -- only needs Inngest events
- T6 + T7 (media processing) -- only needs media gate in webhook/Inngest function
- D4 (confidence routing) -- only needs IntentDetector modification + new DB table
- T5 (enhanced handoff) -- can improve incrementally

---

## MVP Recommendation

For MVP, prioritize in this order:

### Phase 1: Foundation (highest impact, enables everything)
1. **Inngest migration** -- Move from inline webhook processing to async Inngest with concurrency 1/conversation. Architectural prerequisite for all async features.
2. **T1: Character-based delays** -- Immediate dramatic improvement. Single function change in MessagingAdapter.

### Phase 2: Intelligent Processing
3. **T4: Silence classification** + **D3: Retake timer** -- Stop responding to "ok"/"jaja". Re-engage after 90s silence.
4. **T2+T3: Check pre-envio + interruption** -- Stop talking over the customer. Requires `processed_by_agent` DB field.

### Phase 3: Media and Confidence
5. **T6: Audio processing** -- Unlock 30-40% of messages being ignored. Whisper API integration.
6. **T7: Media handling** -- Image/video handoff, sticker interpretation, reaction mapping.
7. **D4: Confidence routing** + log -- Stop responding when unsure. Start collecting learning data.

### Phase 4: Advanced Intelligence
8. **D1: No-repetition system** -- Most complex feature. 3 levels, minifrases, Haiku integration.
9. **D2: Priority-based pending merge** -- Intelligent interrupted-sequence handling.
10. **D5: Paraphrasing for repeats** -- Dynamic freshness for repeated questions.

### Defer to post-MVP:
- **V2 disambiguator:** Needs 20-50 real reviewed cases. Build 2-4 weeks after production launch.
- **WhatsApp typing indicator (A9):** User deferred. Can add in ~1 hour when desired.

---

## Complexity Budget

| Feature | Est. Effort | New Files | Modified Files | DB Changes | External APIs |
|---------|------------|-----------|----------------|------------|---------------|
| Inngest migration | 1-2 days | 0 | 2 (webhook-handler, agent-production) | 0 | 0 |
| T1: Char delays | 0.5 days | 1 (char-delay.ts) | 1 (messaging.ts) | 0 | 0 |
| T4+D3: Silence + retake | 1 day | 2 (message-gate.ts, silence-timer.ts) | 1 (events.ts) | 0 | 0 |
| T2+T3: Check pre-envio | 1-2 days | 0 | 1 (messaging.ts) | 1 (processed_by_agent) | 0 |
| T6: Audio processing | 1-2 days | 1 (media-gate.ts) | 1 (webhook-handler.ts) | 0 | Whisper |
| T7: Media handling | 0.5 days | 0 (in media-gate.ts) | 0 | 0 | Vision (stickers) |
| D4: Confidence + log | 1 day | 1 (disambiguation-log.ts) | 1 (somnio-agent.ts) | 1 (table) | 0 |
| D1: No-repetition | 2-3 days | 1 (no-repeat.ts) | 1 (messaging.ts) | 1 (minifrase) | Haiku |
| D2: Pending merge | 1 day | 1 (pending-merge.ts) | 1 (messaging.ts) | 1 (priority) | 0 |
| D5: Paraphrasing | 0.5 days | 0 (in no-repeat.ts) | 0 | 0 | Haiku |
| **TOTAL** | **~10-14 days** | **~7 new** | **~5 modified** | **~3 migrations** | **Whisper + Haiku + Vision** |

---

## Sources

### HIGH Confidence (official docs, verified)
- [OpenAI Whisper API - Supported Formats](https://platform.openai.com/docs/api-reference/audio/) -- OGG natively supported, no conversion needed
- [OpenAI Speech-to-Text Guide](https://platform.openai.com/docs/guides/speech-to-text) -- Models: whisper-1, gpt-4o-transcribe
- [Twilio WhatsApp Typing Indicators](https://www.twilio.com/docs/whatsapp/api/typing-indicators-resource) -- Endpoint structure, 25s duration

### MEDIUM Confidence (multiple sources agree)
- [n8n WhatsApp Debounce Flow with Redis](https://community.n8n.io/t/whatsapp-debounce-flow-combine-multiple-rapid-messages-into-one-ai-response-using-redis-n8n/225494) -- 10s window, timestamp comparison, message concatenation
- [BotSailor: WhatsApp Cloud API Typing Indicators](https://botsailor.com/blog/new-typing-indicators-in-whatsapp-cloud-api) -- API payload structure, auto-read-receipt
- [arXiv: Beyond Words - Human-like Typing Behaviors](https://arxiv.org/abs/2510.08912) -- Hesitation + self-editing increases trust
- [Chatbot-to-Human Handoff Guide 2025](https://www.spurnow.com/en/blogs/chatbot-to-human-handoff) -- Confidence thresholds (70-80%), escalation triggers
- [AI Chatbot with Human Handoff 2026](https://www.socialintents.com/blog/ai-chatbot-with-human-handoff/) -- Consecutive failure escalation, sentiment triggers
- [Context Window Management for AI Agents](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) -- Memory hierarchy patterns
- [GeeLark: Human Typing Simulation](https://www.geelark.com/glossary/human-typing-simulation/) -- Per-keystroke delays 80-250ms, speed profiles
- [ChatBot.com: Conversation Delay](https://www.chatbot.com/blog/manage-the-speed-of-the-chat-with-the-conversation-delay/) -- 0.1s-10s range, 2s default

### LOW Confidence (single source or unverified)
- Gnewuch et al. ECIS 2018 "Faster Is Not Always Better" -- cited in original research, paper not re-verified directly
- 360dialog typing indicator support -- assumed from Meta Cloud API compatibility, not directly confirmed with 360dialog docs
- Latin American WhatsApp voice note usage (30-40%) -- general industry estimate, no specific data source

---
*Research completed: 2026-02-23*
