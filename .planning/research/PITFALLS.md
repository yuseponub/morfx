# Domain Pitfalls: Human Behavior System (v4.0)

**Domain:** Adding human-like conversation behavior to WhatsApp sales agent
**Researched:** 2026-02-23
**Confidence:** HIGH (based on codebase analysis + production learnings + Inngest docs + known issues)
**Context:** Vercel serverless + Inngest durable execution + Supabase + 360dialog WhatsApp API

---

## Critical Pitfalls

Mistakes that cause message loss, duplicate messages, or require architectural rework.

---

### Pitfall 1: Race Condition — Customer Sends 3 Messages Fast, All 3 Trigger Separate Agent Runs

**What goes wrong:** Customer sends "Hola", "cuanto vale?", "y como se toma?" within 2 seconds. Today (inline processing), each webhook invocation calls `processMessageWithAgent()` synchronously — so the first one blocks the webhook handler for 5-15 seconds, and the second/third messages queue behind it at the HTTP level. With the migration to Inngest, all 3 messages arrive as 3 separate Inngest events within milliseconds. With `concurrency: { key: conversationId, limit: 1 }`, only the first executes immediately — the other two queue. But the second message starts processing the instant the first finishes, before the first response's templates are even fully sent to the customer.

**Why it happens:** The current inline approach has an accidental benefit: the webhook handler holds the HTTP connection while processing, so subsequent webhook calls from 360dialog stack naturally. Inngest's concurrency queue is FIFO but has no "cooldown" between runs.

**Consequences:**
- Bot responds to each message separately instead of treating them as a block
- 3 separate Claude calls ($0.009 instead of $0.003)
- Bot may send 9 templates (3 per message) flooding the customer
- Template repetition across responses

**Prevention:**
- The check pre-envio design (Etapa 3A) addresses this: each Inngest run checks for newer inbound messages BEFORE sending each template. If a newer message exists, the run stops and defers to the next queued run.
- The `processed_by_agent` field on `messages` table is critical — each run marks messages it processes, and the next run picks up ALL unprocessed messages since the last processing timestamp.
- The concurrency 1 guarantee from Inngest prevents true parallelism but does NOT prevent rapid sequential processing. The check pre-envio is the actual defense.

**Detection:** Monitor for conversations where bot sends 6+ templates within 30 seconds. That means the batching/check mechanism failed.

**Phase:** Phase where Inngest migration + check pre-envio is implemented (Etapa 3A)

---

### Pitfall 2: step.waitForEvent Race Condition — Timer Events Arrive Before Listener Registers

**What goes wrong:** Known Inngest bug ([GitHub issue #1433](https://github.com/inngest/inngest/issues/1433)). When events are sent in rapid succession, `step.waitForEvent()` may not catch the completion/cancellation event because the event arrives before the wait listener is registered. The function times out instead of being cancelled.

**Why it happens:** Inngest processes events asynchronously. If `inngest.send({ name: 'agent/silence.detected' })` and `inngest.send({ name: 'agent/customer.message' })` fire within the same request, the customer.message might be processed before the silence timer function reaches its `step.waitForEvent()` call.

**Consequences:**
- Silence timer (90s) fires even though customer already replied
- Bot sends inappropriate "retoma" message after customer already continued the conversation
- Duplicate timers from the existing `cancel-before-start` pattern may also race (already seen in production as Bug #7 in LEARNINGS)

**Prevention:**
- **The 5-second settle sleep** is already the proven mitigation in this codebase. All 4 existing timer functions use `await step.sleep('settle', '5s')` before `step.waitForEvent()`. The new silence timer MUST follow this pattern.
- For the new silence timer specifically: emit `agent/silence.detected` first, then wait 5s settle, then `step.waitForEvent('agent/customer.message')`. If customer replies during the 5s settle, the customer.message event will be in the buffer when waitForEvent starts.
- **Never emit timer-start and timer-cancel events from the same function call.** If you need to cancel-then-restart, add a small delay between the cancel event and the start event (existing pattern from Bug #7 fix).

**Detection:** Log when timers expire and compare with the last customer message timestamp. If the customer messaged within the timer window but the timer still fired, the settle sleep was insufficient.

**Phase:** Phase where silence timer is implemented (Etapa 2)

---

### Pitfall 3: Webhook-to-Inngest Migration — Message Loss During Transition

**What goes wrong:** The webhook currently processes messages inline (synchronous). The migration changes it to emit an Inngest event and return 200 immediately. During deployment, there is a window where:
- Old code (inline) deploys and processes messages
- New code (Inngest) deploys but Inngest functions are not yet registered
- Messages are "sent" to Inngest but nobody is listening

**Why it happens:** Vercel deployments are atomic per-request but the Inngest function registry is a separate sync process. The webhook handler may start emitting events before the Inngest Cloud has synced the new function definitions.

**Consequences:**
- Messages are saved in DB (the webhook still does that) but never reach the agent
- Customer writes but gets no response
- The `whatsapp_webhook_events` table shows "processed" but agent never ran

**Prevention:**
- **Phase this as a single atomic deployment.** The webhook change (emit event) and the Inngest function change (process event) must deploy in the same Vercel build.
- **Keep the inline fallback temporarily.** During migration, implement a feature flag: `if (USE_INNGEST_PROCESSING) { emit event } else { inline process }`. Turn on Inngest only after verifying the function is registered.
- **Verify Inngest sync before enabling.** After deploy, hit the Inngest dashboard and confirm the `whatsapp-agent-processor` function shows as active. Only then flip the flag.
- **The existing `whatsappAgentProcessor` in `agent-production.ts` already exists** with `concurrency: { key: conversationId, limit: 1 }`. It just needs to be activated by having the webhook emit `agent/whatsapp.message_received` events.
- **Resilience:** The `whatsapp_webhook_events` table already stores raw payloads with status. If messages are lost, they can be replayed from this table.

**Detection:** Compare count of inbound messages in `messages` table vs count of `agent/whatsapp.message_received` Inngest events. If messages > events, some were lost.

**Phase:** The FIRST phase of the entire milestone (Inngest migration prerequisite)

---

### Pitfall 4: Inngest Concurrency Queue Backlog — Messages Wait Too Long

**What goes wrong:** With `concurrency: { key: conversationId, limit: 1 }`, if message processing takes 10-15 seconds (Claude API calls + template delays), and 5 messages arrive in that window, the 5th message waits 40-60 seconds before being processed. Customer perception: "the bot is ignoring me."

**Why it happens:** Inngest FIFO queue is strictly ordered. The concurrency limit of 1 per conversation means each message must wait for all previous messages to complete. With the new char-delay system (2-12s per template), a single message processing could take 30+ seconds if it generates 3 templates.

**Consequences:**
- Severe response latency for rapid-fire customers
- Customer may send MORE messages while waiting, making the backlog worse
- Inngest has no built-in mechanism to "merge" queued events

**Prevention:**
- **This is exactly what check pre-envio solves.** The first message runs, but during its template-sending phase, it detects that messages 2-5 have arrived. It STOPS sending templates and completes quickly. Message 2 then runs, picks up the full context (messages 1-5), and generates a single comprehensive response.
- **Configure `timeouts.start`** on the Inngest function to prevent messages from waiting more than 60 seconds in the queue. If a message hasn't started processing in 60s, cancel it — the next run will pick up the unprocessed messages anyway.
- **Monitor queue depth.** Inngest doesn't expose this directly, but you can approximate by counting `processed_by_agent: false` messages per conversation.

**Detection:** Track time between message arrival (DB timestamp) and agent processing start. If > 30s consistently, the queue is backing up.

**Phase:** Phase where Inngest migration is implemented

---

### Pitfall 5: Duplicate Message Sending on Inngest Retry

**What goes wrong:** Inngest function sends 2 of 3 templates to 360dialog, then crashes (OOM, timeout, transient error). Inngest retries the function. Thanks to step memoization, the step that sent the first 2 templates... **re-runs if they were all in a single `step.run()`.** The customer receives the first 2 templates twice.

**Why it happens:** Inngest durable execution memoizes at the `step.run()` boundary. If sending 3 templates happens inside ONE `step.run()`, it is atomic from Inngest's perspective — either all succeed or all retry. But from the customer's perspective, the first 2 WhatsApp messages were already delivered by 360dialog.

**Consequences:**
- Customer receives duplicate messages
- Breaks the "human" illusion completely
- No way to un-send a WhatsApp message

**Prevention:**
- **Each template send MUST be its own `step.run()`.** This is the fundamental architectural decision. If `step.run('send-template-1')` succeeds and `step.run('send-template-2')` fails, only template-2 retries.
- **But wait — the check pre-envio runs between templates.** So the structure must be: `step.run('send-1')` -> `step.sleep('delay-2')` -> `step.run('check-2')` -> `step.run('send-2')`. Each send is independently memoized.
- **Alternative: keep the send loop inside `processMessageWithAgent()` (single step.run) but make it idempotent.** Check the `messages` table for each template before sending. If the message already exists (by content hash or sequence number), skip it.
- **The current `whatsappAgentProcessor` wraps everything in a single `step.run('process-message')`.** This means the ENTIRE agent processing (Claude call + all template sends) is one atomic step. If it fails after sending 2 templates, ALL of it retries — including the Claude call and the first 2 sends. This is the WRONG granularity for the new system.

**Detection:** Look for consecutive identical messages in `messages` table for the same conversation within 60 seconds.

**Phase:** Phase where Inngest function is restructured (Etapa 3A refactor)

---

### Pitfall 6: Handoff State Corruption — Bot Turns Off But Pending Messages Exist in Inngest Queue

**What goes wrong:** Customer sends "necesito hablar con un asesor." Bot detects HANDOFF intent, sends "Regalame 1 min", tags conversation, and disables agent. But there are 2 more messages already queued in Inngest (from rapid messaging before the handoff). Those queued runs execute AFTER the handoff, re-enabling the agent or sending bot responses to a conversation that is now human-managed.

**Why it happens:** The handoff disables the agent for the conversation, but Inngest events that were already queued don't know about the handoff. They execute sequentially — the handoff run finishes, then the queued runs start. The `isAgentEnabledForConversation()` check at the start of `processMessageWithAgent()` SHOULD catch this... but there is a race window.

**Consequences:**
- Customer asks for human, gets bot response instead
- Human agent and bot agent both respond to the same message
- Trust destruction — customer explicitly asked to talk to a human

**Prevention:**
- **The existing `isAgentEnabledForConversation()` check is the primary defense.** It runs at the START of every `processMessageWithAgent()`. After handoff disables the agent, subsequent queued runs will hit this check and exit early.
- **Also check `conversationHasAnyTag(['WPP', 'P/W'])`.** This is already implemented in `webhook-processor.ts`. After handoff tags the conversation, subsequent runs will skip.
- **But: ensure handoff writes to DB BEFORE the Inngest run completes.** If the handoff flag is written asynchronously or in a later step, the next queued run may start before the flag is visible.
- **Additional defense: the queued Inngest runs should also check for recent handoff events.** Query `messages` for a "Regalame 1 min" outbound message in the last 60 seconds.
- **Consider adding a `conversation.agent_handoff_at` timestamp** that subsequent runs check. More reliable than tag-based checks.

**Detection:** Look for bot messages sent AFTER a handoff message ("Regalame 1 min") in the same conversation within 5 minutes.

**Phase:** Phase where HANDOFF classification is implemented (Etapa 2)

---

## High Severity Pitfalls

Mistakes that cause incorrect behavior or significant technical debt.

---

### Pitfall 7: Whisper API Audio Format Rejection — WhatsApp OGG/Opus Not Directly Supported

**What goes wrong:** WhatsApp voice notes are encoded as Opus audio in an OGG container. The file extension from 360dialog is often `.opus` or `.ogg`. OpenAI Whisper API accepts `ogg` but has [known issues with large OGG files](https://community.openai.com/t/whisper-api-fails-on-large-ogg-files-still-below-25mb/717932) and does NOT accept raw `.opus` files. The upload fails silently or returns garbage transcription.

**Why it happens:** WhatsApp's Opus codec is efficient but the file container format from 360dialog may not match what Whisper expects. The 25MB file size limit is rarely hit (WhatsApp voice notes are typically <5MB), but the FORMAT is the real issue.

**Consequences:**
- Audio messages fail to transcribe
- Bot ignores voice notes entirely (falls back to handoff for every audio)
- Wasted API calls on malformed requests

**Prevention:**
- **Always re-encode to a Whisper-safe format before uploading.** Use `ffmpeg` (available as `@ffmpeg/ffmpeg` in Node.js) to convert from the downloaded media to `.mp3` or `.ogg` (proper container).
- **But: ffmpeg in serverless is problematic.** The `@ffmpeg/ffmpeg` WASM build works but is slow (~2-3s overhead). For Vercel serverless, consider a lightweight approach: download the media from 360dialog, check the MIME type, and if it is `audio/ogg; codecs=opus`, rename to `.ogg` (Whisper accepts this). Only re-encode if the format is truly incompatible.
- **File size check before upload.** WhatsApp voice notes up to 16 minutes are ~5MB in Opus. The 25MB Whisper limit should never be hit, but add a guard anyway.
- **Language parameter:** Pass `language: 'es'` to Whisper API for Spanish audio. Without it, Whisper may auto-detect wrong language for short audio clips (< 5 seconds), producing English or Portuguese transcriptions.
- **The download path already exists.** `webhook-handler.ts` calls `downloadAndUploadMedia()` which downloads from 360dialog and uploads to Supabase Storage. The Whisper transcription should happen AFTER download but BEFORE agent processing.

**Detection:** Log Whisper API response status and transcription length. If transcription is empty or suspiciously short for a long audio file, the format was wrong.

**Phase:** Phase where audio processing is implemented (Etapa 4)

---

### Pitfall 8: DB Queries Between Delays — Connection Pool Exhaustion in Serverless

**What goes wrong:** The new send loop does: `sleep(delay) -> check DB for new inbound -> send template -> repeat`. Each check opens a Supabase connection via `createAdminClient()`. With 3 templates per message and char delays of 2-12 seconds each, a single conversation processing holds a connection for 6-36 seconds across multiple DB queries. With multiple conversations processing simultaneously across Vercel functions, the connection pool saturates.

**Why it happens:** Supabase uses Supavisor (formerly PgBouncer) for connection pooling in transaction mode. Each Vercel serverless function gets its own connection from the pool. The pool has a limited size (default 15 for Supabase Pro plan). Long-running functions with intermittent queries keep connections alive without actively using them.

**Consequences:**
- New webhook requests fail to get a DB connection
- "Connection pool exhausted" errors in logs
- Message reception fails (cannot insert into `messages` table)
- Cascading failure across all workspace features

**Prevention:**
- **The check pre-envio query must be lightweight and fast.** Use a simple count query, not a full SELECT:
  ```sql
  SELECT EXISTS(
    SELECT 1 FROM messages
    WHERE conversation_id = X
    AND direction = 'inbound'
    AND created_at > processing_start
    LIMIT 1
  ) AS has_new
  ```
- **Do NOT hold the Supabase client across sleeps.** Create a new `createAdminClient()` for each check query. The Supabase JS client is lightweight and uses the connection pool — it does not hold a persistent connection.
- **This is actually not as bad as it sounds** because `createAdminClient()` in this codebase uses `@supabase/supabase-js` which makes HTTP requests to the PostgREST API (not direct Postgres connections). PostgREST manages its own pool. The risk is lower than with direct `pg` connections, but API rate limits still apply.
- **Monitor Supabase dashboard** for connection count and API request rate during load testing.

**Detection:** Supabase dashboard showing >80% connection utilization. Log `Error: too many connections` or `timeout exceeded when trying to connect`.

**Phase:** Phase where check pre-envio is implemented (Etapa 3A)

---

### Pitfall 9: Timer Conflicts — Multiple Timers for Same Conversation, Cancellation Races

**What goes wrong:** The system will have FOUR timer types that can be active for the same conversation:
1. Ingest timer (collecting data, 6min)
2. Promos timer (promos offered, 10min)
3. Resumen timer (pack selected, 10min)
4. **NEW: Silence timer (acknowledgment, 90s)**

If a customer sends "ok" (SILENCIOSO classification), then immediately sends "cuanto vale?" (RESPONDIBLE), the silence timer must be cancelled. But the silence timer's `step.waitForEvent()` may have already passed its settle period and be actively waiting. Meanwhile, the agent processes the second message and may trigger a mode transition that starts ANOTHER timer (data collection or promos).

**Why it happens:** Each timer is an independent Inngest function run. They coordinate only through `step.waitForEvent()` matching on `data.sessionId`. There is no central "timer manager" that prevents conflicts.

**Consequences:**
- Multiple timers fire for the same conversation, sending multiple unsolicited messages
- Customer receives "retoma" message AND a timer-level message within seconds
- The existing Bug #5 (timer double-send) pattern repeats with the new silence timer

**Prevention:**
- **Apply the proven cancel-before-start pattern from Bug #7.** Before starting ANY new timer, emit a cancellation event for ALL other timer types:
  ```typescript
  // Cancel all existing timers before starting new one
  await inngest.send([
    { name: 'agent/ingest.completed', data: { sessionId, reason: 'cancelled' } },
    { name: 'agent/customer.message', data: { sessionId, conversationId, messageId: 'cancel', content: '' } },
    // New silence cancellation event
    { name: 'agent/silence.cancelled', data: { sessionId } },
  ])
  ```
- **Single point of timer lifecycle management.** All timer start/cancel logic should go through ONE function (e.g., `TimerCoordinator`) that tracks which timer type is active and handles transitions.
- **Consider a `conversation_active_timer` field in DB** that records which timer type is currently running. Before starting a new timer, check and cancel the existing one.
- **The silence timer should use the existing `agent/customer.message` event for cancellation** (same as promos/resumen timers). This means the agent processing pipeline must emit `agent/customer.message` for EVERY message it processes, including SILENCIOSO ones (even though the agent doesn't respond).

**Detection:** Query Inngest for multiple active function runs with the same `sessionId` match key. If > 1 timer function is in "waiting" state for the same session, there is a conflict.

**Phase:** Phase where silence timer is implemented (Etapa 2), with ongoing vigilance in all timer phases

---

### Pitfall 10: Sticker Vision Hallucination — Claude Misinterprets Abstract Stickers

**What goes wrong:** Customer sends an animated sticker of a cat dancing. Claude Vision interprets it as a thumbs-up or "ok" gesture. The agent treats it as an acknowledgment and proceeds with the sales flow. Or worse: Claude interprets a random meme sticker as "the customer wants to buy" because it sees text in the image.

**Why it happens:** [Research shows](https://medium.com/cyberark-engineering/beware-of-llm-vision-hallucinations-a657fa15d340) that multimodal LLMs frequently hallucinate objects and text in ambiguous images. WhatsApp stickers are small (512x512), often heavily compressed, and can be abstract art, memes with text, or animated. Claude's vision may confidently assign meaning where none exists. The model tends to "read into" images based on its language priors.

**Consequences:**
- False positive: sticker treated as meaningful intent, triggering wrong response
- False negative: meaningful sticker (thumbs up) interpreted as abstract, triggering unnecessary handoff
- Inconsistent behavior: same sticker gets different interpretations across conversations

**Prevention:**
- **Conservative interpretation with explicit uncertainty handling.** The Vision prompt should instruct Claude to return `UNKNOWN` if confidence is below a threshold. Example:
  ```
  Analyze this WhatsApp sticker. What does it express?
  Respond with EXACTLY ONE of: OK, GREETING, THANKS, LAUGH, UNKNOWN
  If you are not at least 80% sure, respond UNKNOWN.
  UNKNOWN is the correct answer for abstract art, memes, or anything ambiguous.
  ```
- **UNKNOWN maps to SILENCIOSO (not HANDOFF).** If Vision cannot interpret the sticker, treat it as a non-response (like "ok" or "jaja"). The silence timer will handle it. Only handoff for stickers if explicitly requested by the design.
- **Actually, reconsider the whole sticker-via-Vision approach.** The cost (~$0.003 per sticker) is not the issue — the accuracy is. Most WhatsApp stickers are non-semantic (fun/decorative). A simpler heuristic: ALL stickers = SILENCIOSO. If the customer wants to communicate something meaningful, they will type it. This avoids all hallucination risk at zero cost.
- **If Vision is used:** cache sticker interpretations by image hash. The same sticker sent twice should get the same interpretation.

**Detection:** Log all sticker interpretations and periodically review the "confident" ones manually. Look for patterns of misinterpretation.

**Phase:** Phase where sticker processing is implemented (Etapa 4)

---

### Pitfall 11: No-Repetition False Positives — Haiku Marks Topic as "Covered" When It Was Not

**What goes wrong:** A human agent writes "Te cuento que el producto tiene muy buenos ingredientes naturales" (generic positive statement). Haiku generates minifrase: "ingredientes naturales, efectividad". The no-repeat system (Nivel 2) compares this against `/sisirve` minifrase ("severidad del insomnio, tiempo de efecto") and concludes: COVERED. The bot never sends `/sisirve` even though the human said nothing about efficacy timeline or insomnia severity.

**Why it happens:** Haiku is a fast but imprecise model. Its minifrases are approximate summaries, not exact topic labels. Semantic similarity between "ingredientes naturales" and "tiempo de efecto" may be scored as high by Haiku because both relate to "product benefits" broadly. The Nivel 2 comparison is a fuzzy match, and false positives are inherent.

**Consequences:**
- Customer never receives critical information (efficacy, dosage, price)
- Sales conversion drops because key selling points are skipped
- Difficult to debug — the no-repeat decision is buried in processing logs

**Prevention:**
- **Nivel 2 should be biased toward ENVIAR, not NO_ENVIAR.** When in doubt, send the template. Over-sending is better than under-sending for sales conversations. The threshold for "covered" should be very high.
- **Use PARCIAL aggressively.** If Nivel 2 is not 90%+ confident that the topic is fully covered, escalate to Nivel 3 (read the actual message content). PARCIAL should be the default for any semantic ambiguity.
- **Minifrases for templates should be SPECIFIC and include unique identifiers.** Not "precio y envio" but "precio $77,900, 90 comprimidos, envio gratis contraentrega". The more specific the minifrase, the harder it is to accidentally match a generic human message.
- **For V1, consider skipping Nivel 2 entirely for CORE templates.** CORE templates should ALWAYS go to Nivel 3 if they weren't caught by Nivel 1 (exact ID match). Only use Nivel 2 for COMPLEMENTARIA and OPCIONAL templates where false positives are acceptable losses.
- **Log every no-repeat decision** with the full reasoning chain (minifrase comparison, confidence score, final decision). Build a review dashboard early.

**Detection:** Track "templates skipped by no-repeat" per conversation. If a conversation has >50% of templates skipped, review the decisions.

**Phase:** Phase where no-repetition is implemented (Etapa 3C)

---

### Pitfall 12: Partial Batch Processing — Inngest Function Timeout Mid-Sequence

**What goes wrong:** The agent generates 3 templates for a response. The Inngest function sends template 1, sleeps for the char delay, then the Vercel function times out (60s limit on Pro plan). Inngest retries the function, step memoization kicks in, template 1 is skipped... but template 1's delay + check + send was all inside one `step.run()`. If the step completed, it is memoized. If it didn't complete (timeout happened during the sleep), the step re-runs and template 1 is sent again.

**Why it happens:** Inngest durable execution survives timeouts by retrying from the last completed step. But `step.sleep()` is a durable sleep (Inngest manages it, not the Vercel function). The Vercel function returns after calling `step.sleep()` and Inngest resumes it after the delay. The actual risk is not Vercel timeout during sleep, but Vercel timeout during a long `step.run()` that includes multiple DB queries + API calls.

**Consequences:**
- If the timeout happens during a `step.run()` (not during `step.sleep()`), that entire step retries
- Templates may be sent twice if the step included both the check AND the send
- The agent may run the same Claude API call twice ($0.003 wasted)

**Prevention:**
- **Understand how Inngest + Vercel interact.** `step.sleep()` does NOT hold the Vercel function — it returns control to Inngest which reschedules. The function only needs to be alive during `step.run()` execution. So char delays (2-12s) implemented as `step.sleep()` are FREE in terms of Vercel function time.
- **Keep each `step.run()` under 30 seconds.** A single Claude API call takes 2-5 seconds. Sending a template via 360dialog takes <1 second. The check pre-envio DB query takes <100ms. Total per step: ~5-6 seconds. Well within Vercel's 60s limit.
- **Structure the processing loop as separate steps:**
  ```typescript
  const templates = await step.run('process', () => processMessage(...))
  for (const [i, template] of templates.entries()) {
    await step.sleep(`delay-${i}`, calculateCharDelay(template))
    const hasNew = await step.run(`check-${i}`, () => checkForNewInbound(...))
    if (hasNew) break
    await step.run(`send-${i}`, () => sendTemplate(template))
  }
  ```
  Each send is independently memoized. If send-1 succeeds and send-2 fails, only send-2 retries.
- **Set `retries: 2` (not 3+).** Duplicate sends are worse than failed sends. For WhatsApp, it is better to miss a template than send it twice.

**Detection:** Compare Inngest function run duration with expected processing time. If a run takes >50s, it is close to the Vercel limit. Monitor retry counts — any function with retries > 0 should be investigated.

**Phase:** Phase where the Inngest function is restructured for per-template steps

---

## Moderate Pitfalls

Mistakes that cause delays, poor UX, or technical debt.

---

### Pitfall 13: Inline-to-Inngest Latency Increase — Customers Notice Slower First Response

**What goes wrong:** Today, the webhook processes the message inline and responds within 5-15 seconds. After migration to Inngest, there is additional latency: webhook -> Inngest event delivery (~200-500ms) -> Inngest function cold start (~500-2000ms) -> then the same 5-15s processing. Total: 6-17 seconds. The 1-2 second increase may be noticeable, especially for the first message.

**Why it happens:** Inngest adds overhead for event routing, function matching, and execution scheduling. Vercel serverless cold starts compound this.

**Prevention:**
- **The char delay system (Etapa 1) masks this latency.** The minimum delay is 2 seconds. So even if Inngest adds 1.5s, the total perceived response time is dominated by the intentional delay, not the processing latency.
- **Pre-warm the Inngest function** by keeping it registered and active. Inngest functions that process events regularly don't have cold start issues.
- **Monitor end-to-end latency:** timestamp in webhook (message arrival) vs timestamp of first outbound message. Compare before/after migration.

**Detection:** Track p50 and p95 of time-to-first-response. If p95 > 20s after migration, investigate.

**Phase:** Inngest migration phase

---

### Pitfall 14: Classification Logic Depends on Mode State — SILENCIOSO "Ok" in Wrong Mode

**What goes wrong:** The Etapa 2 classification says: "Ok" is SILENCIOSO in `conversacion` and `bienvenida` modes, but RESPONDIBLE in `resumen` and `collecting_data` modes (because "Ok" confirms the order or acknowledges data collection). If the classification logic doesn't correctly read the current session mode, "Ok" in `resumen` mode gets classified as SILENCIOSO — the bot stays silent instead of confirming the order.

**Why it happens:** Mode state lives in `session_state.current_mode` in the database. The classification logic runs BEFORE the IntentDetector (to save Claude API calls). But reading the session from DB adds latency and a potential race condition if the mode was just changed by a concurrent timer.

**Consequences:**
- Customer says "Ok" to confirm purchase, bot goes silent for 90 seconds
- Lost sale — the most damaging possible false classification
- Customer confusion and frustration

**Prevention:**
- **The session mode MUST be loaded before classification.** This is not optional. The ~50ms DB query is worth it to prevent this catastrophic failure.
- **For confirmatory modes (`resumen`, `collecting_data`, `confirmado`), ALWAYS classify as RESPONDIBLE.** The classification gate should have a whitelist of modes where acknowledgments are meaningful.
- **Consider the inverse: blacklist modes where SILENCIOSO applies** instead of whitelisting RESPONDIBLE modes. The safe default should be RESPONDIBLE (process the message). SILENCIOSO should only trigger in clearly non-confirmatory states.
- **Unit test matrix:** Create a test matrix of [message x mode] pairs and verify classification for ALL combinations. This is the #1 source of bugs for this feature.

**Detection:** Track handoffs and silence timer activations by mode. If silence timers fire in `resumen` or `collecting_data` modes, the classification is wrong.

**Phase:** Phase where classification is implemented (Etapa 2)

---

### Pitfall 15: Pending Templates Persist Across Handoff and Session Reset

**What goes wrong:** The bot is sending 3 templates. Customer interrupts after template 1. Templates 2-3 are saved as "pendientes." Customer then says "necesito un asesor" (HANDOFF). Human agent takes over. Later, human agent re-enables the bot. Customer sends a new message. The bot loads the old "pendientes" and sends templates 2-3 that are now completely irrelevant (they were from a conversation context 30 minutes ago).

**Why it happens:** Pending templates are stored in session state (or a separate field). If they are not cleared on handoff or session expiry, they persist indefinitely.

**Consequences:**
- Bot sends completely out-of-context templates
- Customer receives information about a product they asked about 30 minutes ago
- Human agent looks foolish if they enabled the bot and it starts sending random messages

**Prevention:**
- **Clear pending templates on HANDOFF.** When the bot hands off, explicitly clear the pending queue:
  ```typescript
  await sessionManager.updateState(sessionId, { pending_templates: [] })
  ```
- **Clear pending templates on session expiry/reset.** If a session is closed (timer timeout, manual closure) and a new session starts, pending templates from the old session must not carry over.
- **Pending templates should have a TTL.** If a pending template is older than 5 minutes, discard it. The conversation context has likely changed.
- **The DISCUSSION.md says "pendientes de 3B se GUARDAN" on handoff.** This is correct for audit/history purposes, but they should be marked as "expired" and NOT re-sent when the bot reactivates.

**Detection:** Log when pending templates are loaded and sent. Compare the pending template timestamp with the current time. If > 5 minutes old, something is wrong.

**Phase:** Phase where pending templates merge is implemented (Etapa 3B)

---

### Pitfall 16: Inngest Event Emission in Webhook — Forgetting to `await`

**What goes wrong:** The webhook emits an Inngest event with `inngest.send()` but forgets to `await` it. In Vercel serverless, the function terminates after returning the response. If `inngest.send()` hasn't completed, the event is lost.

**Why it happens:** This is a KNOWN pattern in this codebase (documented in MEMORY.md): "NEVER fire-and-forget inngest.send in webhooks/API routes. Always await." But during refactoring, it is easy to accidentally drop the `await`.

**Consequences:**
- Messages are saved in DB but the Inngest event never fires
- Agent never processes the message
- Customer gets no response
- Intermittent — depends on timing of Vercel function shutdown

**Prevention:**
- **Always `await inngest.send()` in API routes/webhook handlers.** This is non-negotiable.
- **The webhook currently returns 200 AFTER processing.** After migration, it should return 200 AFTER the Inngest event is confirmed sent:
  ```typescript
  await inngest.send({ name: 'agent/whatsapp.message_received', data: {...} })
  return NextResponse.json({ received: true }, { status: 200 })
  ```
- **Lint rule or code review check:** Any `inngest.send(` without `await` in `src/app/api/` or `src/lib/whatsapp/` should be flagged.
- **The existing Inngest events in the codebase already use `await`.** Follow the established pattern.

**Detection:** Compare count of inbound messages in `messages` table per hour vs Inngest events received per hour. Any divergence indicates lost events.

**Phase:** Inngest migration phase (every engineer must know this rule)

---

### Pitfall 17: Confidence Threshold Too Aggressive — High HANDOFF Rate Overwhelms Human Agent

**What goes wrong:** The Etapa 5 V1 design sets the threshold at 80%. In production, many legitimate customer messages score 70-79% confidence (short messages, slang, typos). With the 80% threshold, 20-30% of all messages trigger HANDOFF. The human agent is overwhelmed and stops responding.

**Why it happens:** The IntentDetector was trained/tuned for accuracy, not calibrated for real-world message distribution. Short Colombian Spanish messages with emojis, abbreviations ("q", "pq", "xq"), and typos naturally have lower confidence scores.

**Consequences:**
- Human agent receives 10-15 handoff notifications per hour
- Most are false alarms (the bot could have handled them)
- Human agent starts ignoring notifications
- Customer waits for human that never comes

**Prevention:**
- **Start with 60% threshold, not 80%.** It is safer to let the bot attempt a response (even imperfectly) than to hand off constantly. A somewhat-wrong response can be recovered; a non-response cannot.
- **Or: start with NO confidence gating (threshold: 0%).** Let the bot respond to everything. Log all confidence scores for 1-2 weeks. Then analyze the distribution and set the threshold based on real data. This is the "data-first" philosophy stated in the design.
- **The disambiguation_log table is the key.** Every low-confidence interaction is logged for review. Set the threshold conservatively (low) and raise it as you collect data about which cases truly need human intervention.
- **Make the threshold configurable per workspace.** Store in `workspace_agent_config`. Allow the workspace owner to adjust based on their experience.

**Detection:** Track handoff rate as a percentage of total messages. If > 15%, the threshold is too aggressive.

**Phase:** Phase where confidence thresholds are implemented (Etapa 5)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

---

### Pitfall 18: Char Delay Calculation Ignores Multi-Message Responses

**What goes wrong:** A response block has 3 templates: a short greeting (20 chars = 2s delay), a long product description (200 chars = 10s delay), and a medium CTA (100 chars = 6s delay). Total intentional delay: 18 seconds. The customer has already waited 3-5 seconds for processing. Total time before CTA: 23 seconds. That feels like an eternity in WhatsApp.

**Prevention:**
- **Apply diminishing delays for subsequent messages in a block.** First message: full delay. Second message: 70% delay. Third message: 50% delay. This simulates a human who types faster once they are "on a roll."
- **Or: cap total block delay at 15 seconds.** Distribute the available delay proportionally across templates.
- **The speed multiplier already exists** in workspace config (`real=1.0`, `rapido=0.2`, `instantaneo=0.0`). Consider making it auto-reduce for multi-template blocks.

**Phase:** Phase where char delays are implemented (Etapa 1)

---

### Pitfall 19: Media Download Timeout Blocks Agent Processing

**What goes wrong:** Customer sends a voice note. The webhook downloads the media from 360dialog, uploads to Supabase Storage. This takes 2-5 seconds. Then the Inngest event fires. If the download fails (360dialog timeout, network issue), the media URL is null. The agent function has no audio to transcribe.

**Prevention:**
- **Separate media download from agent processing.** The webhook should: (1) save the message with `media_pending: true`, (2) emit the Inngest event, (3) download media asynchronously. The Inngest function should retry the download if media is not yet available.
- **Or: keep the current approach** (download in webhook, before agent) but add a timeout guard. If download takes >5 seconds, save the message without media and emit the event anyway. The Inngest function falls back to HANDOFF for audio without transcription.
- **The existing `downloadAndUploadMedia()` already handles failure gracefully** — it returns null on error. The agent function just needs to handle the null case.

**Phase:** Phase where media processing is implemented (Etapa 4)

---

### Pitfall 20: Inngest Function Registration Exceeds Vercel Limit

**What goes wrong:** The `route.ts` file that serves Inngest functions currently registers ~20 functions (4 agent timers + 15 automation runners + 1 agent processor + robot functions). Adding the new silence timer, message processor restructured with per-template steps, and media processor could push toward Inngest's function limit or slow down the registration sync.

**Prevention:**
- **Inngest has no hard limit on function count** per app, but registration sync time increases with more functions. Keep functions focused and avoid creating one function per template type.
- **The silence timer should be ONE function** (not one per conversation). It follows the same pattern as existing timers.
- **Monitor Inngest dashboard** sync time. If it takes >30 seconds to sync, consider splitting into multiple Inngest apps.

**Phase:** All phases that add new Inngest functions

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| Inngest Migration (prerequisite) | #3 Message loss during transition, #16 Missing await | CRITICAL | Feature flag, atomic deployment, verify sync |
| Etapa 1: Char Delays | #18 Multi-message delay stacking | MINOR | Diminishing delays, total cap |
| Etapa 2: Classification | #2 Timer settle race, #9 Timer conflicts, #14 Mode-dependent classification | CRITICAL/HIGH | 5s settle, cancel-before-start, mode whitelist |
| Etapa 3A: Check Pre-Envio | #1 Rapid messages race, #4 Queue backlog, #8 Connection pool | CRITICAL/HIGH | processed_by_agent field, timeouts.start, lightweight queries |
| Etapa 3B: Pending Merge | #6 Handoff corruption, #15 Stale pendientes | CRITICAL/MOD | Clear on handoff, TTL on pendientes |
| Etapa 3C: No-Repetition | #11 Haiku false positives | HIGH | Bias toward ENVIAR, specific minifrases, skip Nivel 2 for CORE |
| Etapa 4: Media Processing | #7 Whisper format, #10 Sticker hallucination, #19 Download timeout | HIGH | Re-encode audio, conservative sticker interpretation, timeout guard |
| Etapa 5: Confidence | #17 Threshold too aggressive | MODERATE | Start at 60% or 0%, configurable per workspace |
| Inngest Restructure | #5 Duplicate sends on retry, #12 Partial batch | CRITICAL | Per-template step.run, retries: 2 |

---

## MorfX-Specific Integration Warnings

These are pitfalls specific to this codebase's patterns and history.

### W1: initializeTools() in New Entry Points
**Every new Inngest function that calls agent processing MUST call `initializeTools()`** at the start. This was Bug #8 in production. The tool registry is not automatically initialized in serverless cold starts.

### W2: Sandbox vs Production Divergence
**Any new behavior logic MUST work in both sandbox and production.** The existing codebase has separate paths (SomnioEngine for sandbox, UnifiedEngine for production). New features like char delays and no-repetition should be adapter-level (work in both) or engine-level (shared). Avoid adding logic only to production that cannot be tested in sandbox.

### W3: Domain Layer Compliance
**All message mutations MUST go through `src/lib/domain/messages.ts`.** The new check pre-envio query (read-only) does not need to go through domain, but any writes (marking `processed_by_agent`, saving pending templates) must use domain functions or session manager.

### W4: The (inngest.send as any) Pattern
**Events with custom types require type assertion.** The existing codebase uses `(inngest.send as any)` for events not in the AllAgentEvents type. New events (`agent/silence.detected`, `agent/silence.cancelled`) MUST be added to `src/inngest/events.ts` AllAgentEvents type to avoid this hack.

### W5: Timezone Consistency
**All timestamps must use America/Bogota.** The check pre-envio compares message timestamps. If one timestamp is UTC and another is Bogota time, the comparison fails. Use `timezone('America/Bogota', NOW())` in DB queries and `toLocaleString('sv-SE', { timeZone: 'America/Bogota' })` in JS.

---

## Sources

### Codebase Analysis (HIGH confidence)
- `src/inngest/functions/agent-timers.ts` — Proven settle pattern, cancel-before-start
- `src/inngest/functions/agent-production.ts` — Existing Inngest function with concurrency 1
- `src/app/api/webhooks/whatsapp/route.ts` — Current inline processing, maxDuration 60
- `src/lib/whatsapp/webhook-handler.ts` — Current message flow, media handling, dedup
- `src/lib/agents/production/webhook-processor.ts` — Agent routing, handoff, tag checks
- `.planning/phases/16.1-engine-unification/LEARNINGS-production-hotfixes.md` — 14 production bugs
- `.planning/standalone/human-behavior/DISCUSSION.md` — Full 5-stage design
- `.planning/standalone/human-behavior/ARCHITECTURE-ANALYSIS.md` — Integration map

### Inngest Documentation (HIGH confidence)
- [Concurrency management](https://www.inngest.com/docs/guides/concurrency) — FIFO queues, backlog behavior
- [Cancel on timeouts](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts) — timeouts.start, timeouts.finish
- [How functions are executed](https://www.inngest.com/docs/learn/how-functions-are-executed) — Step memoization, durable execution

### Known Issues (HIGH confidence)
- [step.waitForEvent race condition #1433](https://github.com/inngest/inngest/issues/1433) — Events in quick succession not caught

### External Research (MEDIUM confidence)
- [Whisper API OGG format issues](https://community.openai.com/t/whisper-api-fails-on-large-ogg-files-still-below-25mb/717932)
- [Whisper API file size limits](https://community.openai.com/t/whisper-api-increase-file-limit-25-mb/566754)
- [Claude Vision hallucinations](https://medium.com/cyberark-engineering/beware-of-llm-vision-hallucinations-a657fa15d340)
- [Supabase connection management](https://supabase.com/docs/guides/database/connection-management)
- [Webhook async migration best practices](https://hookdeck.com/webhooks/guides/why-you-should-stop-processing-your-webhooks-synchronously)

---
*Research completed: 2026-02-23*
