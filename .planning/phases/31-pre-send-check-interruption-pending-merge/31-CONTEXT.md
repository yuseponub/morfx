# Phase 31: Pre-Send Check + Interruption + Pending Merge - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Bot sends responses in blocks instead of per-message. Before each template send, checks DB for new inbound messages. If interrupted, unsent templates are saved as pending and merged into the next response block by priority. This phase implements the send loop control, interruption detection, pending storage, and merge algorithm.

</domain>

<decisions>
## Implementation Decisions

### Send Loop Mechanics
- Pre-send check is the LAST action before each template send (check DB -> send). Applies to every template including the first
- Check = query for any inbound message with timestamp > the message that triggered this block
- If check finds new message AND at least 1 template was already sent: remaining templates saved as pending
- If check finds new message AND 0 templates sent: ALL templates discarded, new message processed fresh (intent recalculated from scratch -- could produce entirely different templates)
- Multiple rapid client messages: Inngest concurrency-1 enqueues them. The accumulated messages produce a sum of intents (e.g., hola + precio + envio_cali)

### Block Composition Rules (CRITICAL)
- **Max 3 intents per block**. If 4+ intents detected, excess intents (with all their templates) go to pending
- **Template selection per block:** First, take the CORE (first) template from each intent. If space remains in the 3-template cap, fill by priority
- If 3 intents = 3 CORE templates = cap reached. Secondary templates go to pending
- If 1 intent with 5 templates = CORE + 2 by priority = cap reached. Remaining go to pending

### Pending Templates Lifecycle
- Pending templates persist within the session only. Session expiry/timeout clears all pending
- OPC pending that don't fit in a block are discarded permanently
- CORE/COMP pending that don't fit remain as pending for the next cycle
- Pending only sent when triggered by a RESPONDIBLE message (never by SILENCIOSO alone)
- Deduplication: if same template_id appears in both pending and new, send only once (1 slot)

### Merge Algorithm
- **Order within a block:**
  1. CORE templates from NEW intents first (respond to what the client just asked)
  2. Fill remaining slots by priority (CORE > COMP > OPC)
  3. Tiebreaker: pending wins over new at same priority level
- Cap of 3 templates per block is absolute

### Interaction with Classification (Phase 30)
- Pre-send check detects ANY new inbound message and stops the block (check doesn't know classification yet -- classification happens after)
- **RESPONDIBLE interruption:** merge pending + new templates per merge algorithm, send new block
- **SILENCIOSO interruption:** block stops, pending saved, 90s silence timer starts. If timeout expires without RESPONDIBLE: send pending templates + retake message ("Deseas adquirir el tuyo?"). If client writes RESPONDIBLE before timeout: merge pending + new
- **HANDOFF interruption:** block stops immediately, ALL pending cleared, HANDOFF executes (bot off, "Regalame 1 min", notify host)
- HANDOFF clears pending but maintains session (historial, estado del flujo). Only pending templates are wiped
- When bot is reactivated after HANDOFF: session continues (conversation history preserved) but with zero pending

### Claude's Discretion
- Pending storage mechanism (session_state field, separate DB column, or in-memory during Inngest function)
- Pre-send check query optimization (index, polling interval)
- Exact implementation of the "sum of intents" accumulation during rapid messages
- Retake message content (suggestion: "Deseas adquirir el tuyo?" or similar sales-closing message)

</decisions>

<specifics>
## Specific Ideas

- "El precheck debe ser la ULTIMA accion antes de enviar cada template/mensaje" -- not a batch check, but per-template just-in-time
- "Los 3 primeros intents se responden, se deben sumar LOS PRIMEROS TEMPLATES y si queda espacio segun prioridad" -- CORE-first-per-intent is the foundational rule
- When 0 templates sent and interruption occurs, it's as if the block never existed -- complete fresh recalculation
- Pending + retake after 90s silence: the pending templates complete the info, the retake message pushes toward closing

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 31-pre-send-check-interruption-pending-merge*
*Context gathered: 2026-02-25*
