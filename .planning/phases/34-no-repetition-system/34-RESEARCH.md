# Phase 34: No-Repetition System - Research

**Researched:** 2026-03-03
**Domain:** Template deduplication, semantic comparison, LLM-based content filtering
**Confidence:** HIGH (all findings from codebase investigation, established patterns)

## Summary

This phase adds an intelligent no-repetition filter to prevent the bot from sending the same information twice. The filter operates at 3 escalating levels: ID lookup (free), minifrase comparison via Haiku (~$0.0003), and full-context analysis (only for PARTIAL cases). It integrates between BlockComposer (Layer 6) and the MessagingAdapter send loop (Layer 8) in the existing pipeline.

The research focused on: (1) understanding the exact code paths where no-rep checks integrate, (2) the templates_enviados over-count bug that must be fixed first, (3) how to make lightweight Haiku calls following existing patterns, (4) the DB migration needed for the `minifrase` column, and (5) the paraphrasing integration for repeated intents.

**Primary recommendation:** Build a `NoRepetitionFilter` class in `src/lib/agents/somnio/` that takes a composed block + outbound registry and returns a filtered block. Integrate it in `unified-engine.ts` between block composition (line ~275) and messaging adapter send (line ~286). Fix the over-count bug by deferring `templates_enviados` updates to AFTER the send result.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.73.0 | Haiku calls for Level 2/3 comparison | Already in project, proven pattern in MessageClassifier |
| Supabase (admin client) | existing | DB queries for outbound registry + minifrase column | All domain queries use createAdminClient() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Module logger (`createModuleLogger`) | existing | Structured logging for filter decisions | Every filter decision needs audit trail |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Anthropic SDK direct | AI SDK v6 generateText | Direct SDK is simpler for single-shot classification; AI SDK adds unnecessary abstraction for non-streaming JSON responses |
| DB-stored minifrases for human/AI msgs | In-memory only | DB persistence allows cross-request access; in-memory loses data on serverless cold start |

**Installation:**
No new packages needed. All dependencies already exist in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/lib/agents/somnio/
├── no-repetition-filter.ts    # Core filter class (Level 1, 2, 3)
├── outbound-registry.ts       # Reconstructs sent message history
├── minifrase-generator.ts     # Generates minifrases for human/AI messages
└── template-paraphraser.ts    # Paraphrases templates for repeated intents
```

### Pattern 1: Escalating Filter Pipeline
**What:** Each template candidate passes through increasingly expensive checks. Short-circuit at earliest possible level.
**When to use:** Every template in a composed block before sending.
**Example:**
```typescript
// Source: Codebase pattern from block-composer.ts (pure function approach)
export interface NoRepFilterResult {
  surviving: PrioritizedTemplate[]   // Templates that passed all checks
  filtered: Array<{
    template: PrioritizedTemplate
    level: 1 | 2 | 3
    reason: string
  }>
}

async function filterBlock(
  block: PrioritizedTemplate[],
  outboundRegistry: OutboundEntry[],
  templatesEnviados: string[]
): Promise<NoRepFilterResult> {
  const surviving: PrioritizedTemplate[] = []
  const filtered: Array<{ template: PrioritizedTemplate; level: 1 | 2 | 3; reason: string }> = []

  for (const template of block) {
    // Level 1: ID lookup (0ms, $0)
    if (templatesEnviados.includes(template.templateId)) {
      filtered.push({ template, level: 1, reason: 'ID already in templates_enviados' })
      continue
    }

    // Level 2: Minifrase comparison (~200ms, ~$0.0003)
    const level2Result = await checkMinifrase(template, outboundRegistry)
    if (level2Result === 'NO_ENVIAR') {
      filtered.push({ template, level: 2, reason: 'Content covered by previous messages' })
      continue
    }

    // Level 3: Full context (only for PARCIAL, ~1-3s)
    if (level2Result === 'PARCIAL') {
      const level3Result = await checkFullContext(template, outboundRegistry)
      if (level3Result === 'NO_ENVIAR') {
        filtered.push({ template, level: 3, reason: 'Full context confirms coverage' })
        continue
      }
    }

    surviving.push(template)
  }

  return { surviving, filtered }
}
```

### Pattern 2: Outbound Registry Reconstruction
**What:** Reconstruct the full list of outbound messages (templates, human, AI) from existing DB tables without adding new tables.
**When to use:** Before running no-rep checks, once per engine invocation.
**Example:**
```typescript
// Source: Codebase pattern — messages table has direction='outbound', agent_turns has role='assistant'
interface OutboundEntry {
  tipo: 'plantilla' | 'humano' | 'ia'
  id: string | null          // template ID or null for human/AI
  tema: string               // minifrase (from DB field or generated)
  fullContent?: string       // Only loaded for Level 3 checks
}

// Reconstruct from:
// 1. session_state.templates_enviados + agent_templates.minifrase -> plantilla entries
// 2. messages WHERE direction='outbound' AND conversation_id=X AND NOT sent_by_agent -> humano entries
// 3. agent_turns WHERE role='assistant' -> ia entries
```

### Pattern 3: Lightweight Haiku Calls (Existing Pattern)
**What:** Direct Anthropic SDK calls with short system prompts and JSON responses, following the MessageClassifier pattern.
**When to use:** Level 2 minifrase comparison and Level 3 full context check.
**Example:**
```typescript
// Source: src/lib/agents/somnio/message-classifier.ts (lines 168-177)
// This is the EXACT pattern used in the codebase for cheap Haiku calls
const response = await this.client.messages.create({
  model: 'claude-sonnet-4-20250514', // NOTE: Using Sonnet 4 until Haiku 4 available
  max_tokens: 256,
  system: COMPARISON_PROMPT,
  messages: [{ role: 'user', content: comparisonPayload }],
})
```

### Pattern 4: Integration Point in UnifiedEngine
**What:** The no-rep filter runs AFTER block composition but BEFORE messaging adapter send.
**When to use:** In the `useBlockComposition` branch of `unified-engine.ts`.
**Example:**
```typescript
// Source: src/lib/agents/engine/unified-engine.ts lines 245-332
// Current flow: compose block -> send -> handle interruption
// New flow:     compose block -> NO-REP FILTER -> send -> handle interruption

// After line 275 (composeBlock), before line 286 (adapters.messaging.send):
const filterResult = await noRepFilter.filterBlock(
  composed.block,
  outboundRegistry,
  agentOutput.stateUpdates.newTemplatesEnviados
)
// Replace composed.block with filterResult.surviving for the send call
```

### Anti-Patterns to Avoid
- **Filtering inside BlockComposer:** BlockComposer is a pure function for merge/priority logic. No-rep is a separate concern with I/O (DB + LLM calls). Keep them separate.
- **Generating minifrases during template loading:** Minifrases for templates are static DB fields. Only human/AI message minifrases are generated dynamically.
- **Modifying templates_enviados before send:** This is the existing over-count bug. Fix by updating AFTER send confirms.
- **Running Level 3 for all templates:** Level 3 is expensive (~1-3s). Only run when Level 2 returns PARCIAL.
- **Batch Haiku calls:** Each template comparison is independent and short. Sequential is fine; parallel is premature optimization that complicates error handling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Semantic similarity | Custom embedding + cosine similarity | Haiku prompt comparison | Embeddings require infrastructure, model, index; Haiku with minifrases is simpler and accurate enough for ~30 templates |
| JSON response parsing | Custom parser | Same jsonMatch pattern from MessageClassifier | Already proven in codebase, handles edge cases |
| Outbound message query | Custom SQL | Supabase query builder (createAdminClient) | Consistent with all other domain queries |

**Key insight:** The "AI as judge" pattern (Haiku comparing minifrases) is cheaper and more accurate for this domain than embedding-based similarity. With ~30 templates and short minifrases, a single Haiku call per template is ~$0.0003 and ~200ms.

## Common Pitfalls

### Pitfall 1: templates_enviados Over-Count Bug
**What goes wrong:** Current code (somnio-agent.ts line 467) adds ALL orchestrator templates to templates_enviados BEFORE they are actually sent. If a send is interrupted, templates that were never sent are still marked as sent — making Level 1 filter them out permanently.
**Why it happens:** State updates are computed in SomnioAgent (pure logic) and persisted by UnifiedEngine before messaging. The send result comes too late.
**How to avoid:** Move `templates_enviados` update to AFTER the send result in unified-engine.ts. Only add template IDs from `sentMessageContents` (line 300-302 already slices to `sendResult.messagesSent`). The SomnioAgent should NOT include templatesSent in stateUpdates — the engine handles it post-send.
**Warning signs:** Templates that a customer asks about again are never re-sent because they're in templates_enviados despite never reaching WhatsApp.

### Pitfall 2: Minifrase Prompt Must Be Deterministic
**What goes wrong:** Haiku returns inconsistent ENVIAR/NO_ENVIAR for the same pair if the prompt is vague.
**Why it happens:** Ambiguous prompts like "are these similar?" lead to probabilistic answers.
**How to avoid:** Use explicit structured prompts: "Given template minifrase X and these previous minifrases [Y1, Y2, ...], respond with ENVIAR, NO_ENVIAR, or PARCIAL. ENVIAR = adds new info not covered. NO_ENVIAR = already fully covered. PARCIAL = partially covered, needs deeper check."
**Warning signs:** Same template getting different filter results across conversations with similar history.

### Pitfall 3: Human Messages Lack Minifrases
**What goes wrong:** The outbound registry has no minifrases for human-typed messages, so Level 2 can't compare against them.
**Why it happens:** Human messages come through the webhook as raw text without any semantic tagging.
**How to avoid:** Generate minifrase on-the-fly when building the outbound registry. Call Haiku once to generate a minifrase for each human/AI outbound message. Cache the result (consider storing in messages table metadata or a simple KV pattern).
**Warning signs:** Bot repeats information that a human agent already communicated.

### Pitfall 4: Edge Case — 0 Templates Survive Filter
**What goes wrong:** All templates in a block get filtered out, leaving nothing to send.
**Why it happens:** Customer asks about something the bot (or human) already covered comprehensively.
**How to avoid:** This is actually CORRECT behavior — don't send redundant info. But log it clearly for debugging. If the intent was a direct question (e.g., "cuanto cuesta?"), the appropriate response is silence (the info was already given). Consider an optional acknowledgment message: "Ya te comparti esa informacion anteriormente."
**Warning signs:** Bot goes silent on repeated questions with no indication of why.

### Pitfall 5: Paraphrased Templates Must Not Lose Core Information
**What goes wrong:** Claude paraphrases a template and accidentally drops a critical detail (e.g., exact price, phone number).
**Why it happens:** Paraphrasing by default prioritizes rewording over accuracy.
**How to avoid:** Prompt must specify: "Parafrasea manteniendo TODOS los datos facticos (precios, numeros, tiempos, cantidades). Solo cambia la estructura y expresiones."
**Warning signs:** Paraphrased /precio says "tiene un buen precio" instead of "$77,900 con envio gratis."

### Pitfall 6: Serverless Cold Starts + Multiple Haiku Calls
**What goes wrong:** Multiple sequential Haiku calls in a single request add latency (200ms x N templates).
**Why it happens:** Each Haiku call is an HTTP roundtrip to Anthropic API.
**How to avoid:** Level 1 eliminates ~60% of templates for free. Level 2 calls should be parallelized with `Promise.all()` since they're independent. Level 3 is rare (only PARCIAL cases). Total: 1-2 Haiku calls per block on average.
**Warning signs:** Response time jumps from ~2s to ~5s per message.

### Pitfall 7: visit_type='siguientes' Templates Still in DB
**What goes wrong:** TemplateManager falls back to 'primera_vez' templates when no 'siguientes' exist (line 117-120 of template-manager.ts), but if 'siguientes' rows exist in DB they'll be used — contradicting the Phase 34 paraphrasing approach.
**Why it happens:** Phase 34 replaces 'siguientes' with paraphrased 'primera_vez' templates, but the old 'siguientes' rows may still exist.
**How to avoid:** Either (a) delete 'siguientes' rows from DB as part of migration, or (b) modify TemplateManager to ignore 'siguientes' when Phase 34 is active. Option (a) is cleaner.
**Warning signs:** Bot sends pre-written 'siguientes' templates instead of paraphrased versions.

## Code Examples

### Example 1: Level 2 Haiku Prompt (Minifrase Comparison)
```typescript
// Source: Pattern from message-classifier.ts adapted for comparison
const LEVEL2_PROMPT = `Eres un detector de repeticion para un bot de ventas de WhatsApp.

Te doy la MINIFRASE de una plantilla que el bot quiere enviar, y las MINIFRASES de todo lo que ya se envio en esta conversacion (por bot, humano, o IA).

Tu tarea: determinar si la plantilla agrega informacion NUEVA o si ya fue cubierta.

Responde SOLO con un JSON:
{
  "decision": "ENVIAR" | "NO_ENVIAR" | "PARCIAL",
  "razon": "breve explicacion"
}

Reglas:
- ENVIAR: La plantilla tiene informacion que NO aparece en ningun mensaje previo
- NO_ENVIAR: La informacion de la plantilla ya fue cubierta completamente
- PARCIAL: Parte de la informacion fue cubierta, parte es nueva (necesita check mas profundo)
- Compara TEMAS, no palabras exactas. "precio 77900 con envio gratis" y "el costo es 77900 envio incluido" son el MISMO tema.
- Si la plantilla agrega un ANGULO DIFERENTE del mismo tema (ej: plantilla habla de severidad del insomnio, previo habla de efectividad general), es PARCIAL.`
```

### Example 2: Outbound Registry Query
```typescript
// Source: Codebase patterns from production-storage.ts and domain/messages.ts
async function buildOutboundRegistry(
  conversationId: string,
  sessionId: string,
  templatesEnviados: string[]
): Promise<OutboundEntry[]> {
  const supabase = createAdminClient()
  const entries: OutboundEntry[] = []

  // 1. Templates enviados: get minifrases from agent_templates
  if (templatesEnviados.length > 0) {
    const { data: templates } = await supabase
      .from('agent_templates')
      .select('id, minifrase')
      .in('id', templatesEnviados)

    for (const t of templates ?? []) {
      entries.push({
        tipo: 'plantilla',
        id: t.id,
        tema: t.minifrase ?? '',  // minifrase field from DB
      })
    }
  }

  // 2. Human outbound messages (not sent by agent)
  const { data: humanMsgs } = await supabase
    .from('messages')
    .select('id, content, timestamp')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .order('timestamp', { ascending: true })
  // Filter: messages NOT matching agent turn timestamps = human messages
  // TODO: Determine best heuristic for human vs bot messages

  // 3. AI assistant turns
  const { data: aiTurns } = await supabase
    .from('agent_turns')
    .select('id, content, created_at')
    .eq('session_id', sessionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: true })

  // Human + AI entries need minifrase generation (see minifrase-generator.ts)

  return entries
}
```

### Example 3: Fixing the Over-Count Bug
```typescript
// Source: unified-engine.ts lines 82-88 (current problematic pattern)
// BEFORE (bug): saves ALL templates to templates_enviados before send
await this.adapters.storage.saveState(session.id, {
  datos_capturados: agentOutput.stateUpdates.newDatosCapturados,
  templates_enviados: agentOutput.stateUpdates.newTemplatesEnviados, // BUG: includes unsent
  pack_seleccionado: agentOutput.stateUpdates.newPackSeleccionado,
})

// AFTER (fix): save templates_enviados only with actually-sent template IDs
const baseTemplatesEnviados = input.session?.state?.templates_enviados ?? []
await this.adapters.storage.saveState(session.id, {
  datos_capturados: agentOutput.stateUpdates.newDatosCapturados,
  templates_enviados: baseTemplatesEnviados, // Don't save new yet — post-send update below
  pack_seleccionado: agentOutput.stateUpdates.newPackSeleccionado,
})
// ... after send ...
const sentTemplateIds = composed.block
  .slice(0, sendResult.messagesSent)
  .map(t => t.templateId)
// Now update with only actually-sent IDs
await this.adapters.storage.saveState(session.id, {
  templates_enviados: [...baseTemplatesEnviados, ...sentTemplateIds],
})
```

### Example 4: Repeated Intent Paraphrasing
```typescript
// Source: Pattern from template-manager.ts + block-composer.ts
const PARAPHRASE_PROMPT = `Eres un asistente de ventas de WhatsApp para Somnio (suplemento de melatonina).

El cliente ya recibio esta informacion antes. Necesitas PARAFRASEAR el siguiente mensaje para que suene fresco y natural, como si fuera la primera vez.

REGLAS CRITICAS:
1. MANTENER todos los datos facticos exactos (precios, numeros, tiempos, cantidades, ingredientes)
2. Solo cambiar estructura, orden de oracion, y expresiones
3. Tono amigable y colombiano (tutear, informal)
4. Maximo 20% mas corto que el original (nunca mas largo)
5. NO agregar informacion nueva
6. NO usar emojis a menos que el original los tenga

Mensaje original:
{originalContent}

Responde SOLO con el mensaje parafraseado, sin explicaciones.`
```

### Example 5: Minifrase Generation for Human/AI Messages
```typescript
// Source: Pattern adapted from message-classifier.ts
const MINIFRASE_PROMPT = `Genera una minifrase tematica (max 15 palabras) que capture la ESENCIA de este mensaje de WhatsApp.
La minifrase debe capturar los TEMAS cubiertos, no las palabras exactas.

Ejemplos:
"Veras los resultados desde los primeros 3-7 dias" -> "resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja"
"El pago lo haces cuando recibes el producto en efectivo" -> "pago contraentrega en efectivo al recibir"
"Tranquilo, veras cambios desde la primera semana. No es un somnifero." -> "efectividad rapida, no es somnifero, regula ciclo natural"

Mensaje:
{messageContent}

Responde SOLO con la minifrase, sin explicaciones.`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Template ID dedup only (Level 1) | 3-level escalating dedup | Phase 34 | Catches content overlap from human messages and AI responses |
| visit_type='siguientes' DB rows | Paraphrase primera_vez at runtime | Phase 34 | Eliminates maintaining duplicate template rows; always fresh wording |
| Register all selected templates | Register only sent templates | Phase 34 (bug fix) | Accurate dedup baseline; no false positives from interrupted sends |

**Deprecated/outdated:**
- `visit_type='siguientes'` rows in agent_templates: Replaced by runtime paraphrasing. Should be deleted in migration.
- `MessageSequencer` (Phase 14): Already deprecated per Phase 31. No-rep integrates with the new ProductionMessagingAdapter flow.

## Open Questions

1. **Human vs Bot message disambiguation in outbound registry**
   - What we know: `messages` table has `direction='outbound'` for all outbound messages. Bot messages are also recorded in `agent_turns`.
   - What's unclear: Is there a reliable way to distinguish human-typed outbound messages from bot-sent outbound messages? The `sent_by_agent` flag mentioned in webhook-processor.ts could help if it's consistently set.
   - Recommendation: Query `messages` WHERE `direction='outbound'` and LEFT JOIN `agent_turns` to identify which outbound messages were NOT from the agent. Or use the `sent_by_agent` flag if available in the messages table.

2. **Minifrase storage for human/AI messages**
   - What we know: Template minifrases go in `agent_templates.minifrase`. Human/AI message minifrases need somewhere to live.
   - What's unclear: Best storage location — messages.content JSONB metadata? Separate column? In-memory only?
   - Recommendation: Store as part of the outbound registry reconstruction (generate on-the-fly and cache in memory for the duration of the request). No need for persistent storage since they can be regenerated. This avoids another migration.

3. **Acknowledgment message when all templates are filtered**
   - What we know: If 0 templates survive, the bot would be silent.
   - What's unclear: Whether a generic acknowledgment ("Ya te comparti esa info") is desirable, or if silence is preferred.
   - Recommendation: Claude's Discretion per CONTEXT.md. Suggest: send a short acknowledgment only if the customer's message was a direct question. If it was a general statement, silence is appropriate.

4. **Concurrent Haiku calls for Level 2**
   - What we know: A block has max 3 templates (BLOCK_MAX_TEMPLATES). Each Level 2 check is independent.
   - What's unclear: Whether parallel Haiku calls cause rate limiting or ordering issues.
   - Recommendation: Use `Promise.all()` for Level 2 checks (3 parallel calls max). The Anthropic API handles this fine at low volume. Fall back to sequential if rate limited.

## Sources

### Primary (HIGH confidence)
- `src/lib/agents/somnio/block-composer.ts` — BlockComposer algorithm, PrioritizedTemplate type
- `src/lib/agents/engine/unified-engine.ts` — Integration point (lines 245-332), state save flow
- `src/lib/agents/somnio/somnio-agent.ts` — templates_enviados over-count (line 467-468), state update flow
- `src/lib/agents/somnio/template-manager.ts` — Template loading, primera_vez/siguientes logic, cache
- `src/lib/agents/engine-adapters/production/messaging.ts` — ProductionMessagingAdapter send loop, pre-send check
- `src/lib/agents/somnio/message-classifier.ts` — Pattern for lightweight Haiku calls (direct Anthropic SDK)
- `src/lib/agents/claude-client.ts` — MODEL_MAP (Haiku maps to Sonnet 4 until Haiku 4 available)
- `src/lib/agents/types.ts` — AgentTemplate, SessionState, AgentTemplateRow types
- `src/lib/agents/engine/types.ts` — MessagingAdapter, StorageAdapter interfaces
- `supabase/migrations/20260206000000_agent_templates.sql` — agent_templates schema
- `supabase/migrations/20260205000000_agent_sessions.sql` — session_state schema
- `supabase/migrations/20260226000000_block_priorities.sql` — priority column, pending_templates column

### Secondary (MEDIUM confidence)
- `src/lib/agents/somnio/data-extractor.ts` — Pattern for Claude extraction with JSON parsing
- `src/lib/agents/somnio/constants.ts` — BLOCK_MAX_TEMPLATES, BLOCK_MAX_INTENTS constants
- `src/lib/agents/engine-adapters/production/storage.ts` — ProductionStorageAdapter pending templates methods

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already exist in project; no new dependencies
- Architecture: HIGH — Integration points clearly identified in unified-engine.ts; patterns proven by BlockComposer
- Pitfalls: HIGH — Over-count bug traced to exact line; Haiku call patterns proven by MessageClassifier
- Prompts: MEDIUM — Prompt design is Claude's Discretion; examples provided but need validation in practice

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain, no external dependency changes expected)
