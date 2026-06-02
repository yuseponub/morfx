# Somnio Sales Agent v2 — Investigacion de Herramientas y Patterns

## 1. Structured Outputs (UNA sola llamada Claude)

### Anthropic SDK — `output_config.format` + Zod (GA, no beta)

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MessageAnalysis = z.object({
  intent: z.object({
    type: z.enum(["greeting", "price_inquiry", "purchase_intent", ...]),
    confidence: z.number(),
  }),
  extracted_fields: z.object({
    nombre: z.string().nullable(),
    telefono: z.string().nullable(),
    ciudad: z.string().nullable(),
    pack: z.string().nullable(),
    // ...
  }),
  classification: z.object({
    sentiment: z.enum(["positive", "neutral", "negative"]),
    category: z.enum(["datos", "pregunta", "mixto", "irrelevante"]),
    requires_handoff: z.boolean(),
  }),
});

const response = await client.messages.parse({
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: message }],
  output_config: { format: zodOutputFormat(MessageAnalysis) },
});

const result = response.parsed_output!; // Fully typed
```

**Constrained decoding**: Claude literalmente NO PUEDE generar JSON invalido. El schema se compila en una gramatica que restringe la generacion de tokens.

### `client.messages.parse()` vs `client.messages.create()`
- `parse()` valida automaticamente y retorna `parsed_output` tipado
- `create()` retorna texto crudo que hay que parsear manualmente
- Usar `parse()` siempre con structured outputs

### Zod tips
- `.nullable()` no `.optional()` — structured outputs requiere todos los campos en `required`
- `.enum()` para clasificaciones — garantiza valores validos
- `.describe()` para campos ambiguos — guia la extraccion

---

## 2. Costos: 1 llamada vs 3 llamadas

### Haiku 4.5 ($1 input / $5 output per MTok)

| Approach | Cost/msg |
|----------|----------|
| 3 llamadas separadas | $0.00360 |
| 1 llamada combinada | $0.00220 (39% menos) |
| 1 llamada + prompt cache | $0.00175 (51% menos) |

### Sonnet ($3 input / $15 output per MTok)

| Approach | Cost/msg |
|----------|----------|
| 3 llamadas separadas | $0.01080 |
| 1 llamada combinada | $0.00660 (39% menos) |
| 1 llamada + prompt cache | $0.00525 (51% menos) |

### A escala (10,000 msgs/dia)
- Haiku: $17.50/dia (vs $36 con 3 llamadas) → $555/mes savings
- Sonnet: $52.50/dia (vs $108) → $1,665/mes savings

**Recomendacion**: Haiku 4.5 para Capa 1 (extraction). Si la calidad no alcanza, Sonnet.

---

## 3. Slot-Filling Pattern (sin modos rigidos)

### Pattern: Schema-Driven Slot Tracker

```typescript
interface SlotState {
  nombre: string | null;
  telefono: string | null;
  ciudad: string | null;
  pack: string | null;
  // ...
  slots_filled: string[];
  slots_missing: string[];
}
```

**El LLM maneja el LENGUAJE** (como preguntar), **el codigo maneja la LOGICA** (que preguntar).

### Merge deterministico (NO el LLM)

```typescript
function mergeExtractedData(current: SlotState, extracted: ExtractedData): SlotState {
  for (const [key, value] of Object.entries(extracted)) {
    if (value !== null && value !== undefined) {
      updated[key] = value;
    }
  }
  updated.slots_filled = // ...recompute
  updated.slots_missing = // ...recompute
  return updated;
}
```

No hay "collecting_data mode". El sistema SIEMPRE extrae datos + intent. Las decisiones se basan en el estado completo.

---

## 4. State-Driven Decision Engine

### Pattern: "LLM as Data Processor, Code as Router"

```typescript
function decideNextAction(state: BusinessState): AgentAction {
  // Priority-ordered rules — deterministico, testeable, auditable
  if (state.sentiment === 'frustrated') return { action: 'escalate' };
  if (state.buying_signals === 'high' && state.product_identified) {
    if (!state.has_phone) return { action: 'collect_data', field: 'phone' };
    return { action: 'close_sale' };
  }
  // ...
}
```

**El LLM NO decide acciones de negocio.** Solo procesa lenguaje. El codigo decide basado en estado.

---

## 5. Interrupcion y Acumulacion de Mensajes

### Inngest debounce (para produccion)

```typescript
inngest.createFunction({
  debounce: {
    key: "event.data.contact_phone",
    period: "3s",
    timeout: "15s",
  },
});
```

**Limitacion**: Solo da el ULTIMO evento, no todos. Necesita DB accumulation complementaria.

### DB Accumulation + Debounce

```
Webhook → store raw message → inngest.send (idempotent, debounced)
Debounce expira → fetch ALL unprocessed messages → combine → process as 1 turn
```

### Check-before-send (nuestro pattern, para sandbox y produccion)

```typescript
// Antes de enviar cada template
const newMessages = await checkInbox(lastMessageId);
if (newMessages.length > 0) {
  return { aborted: true, sent: [...alreadySent] };
}
await sendTemplate(template);
```

---

## 6. Idempotency (4 capas)

### Capa 1: Event-level (Inngest)
```typescript
await inngest.send({ id: `whatsapp-msg-${message.id}`, ... });
// Dedup 24h window
```

### Capa 2: Function-level (Inngest)
```typescript
{ idempotency: "event.data.order_id" }
// Una ejecucion por order
```

### Capa 3: DB-level (outbound messages)
```sql
CREATE TABLE outbound_message_log (
  idempotency_key TEXT UNIQUE NOT NULL,
  ...
);
-- INSERT fails on duplicate → skip send
```

### Capa 4: Step-level (Inngest steps)
```typescript
// step.run("name") is inherently idempotent on retries
```

---

## 7. AI SDK v6 — Tools + Structured Output Combinados

```typescript
import { generateText, Output } from 'ai';

const { output } = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    lookupProduct: tool({ ... }),
    lookupContact: tool({ ... }),
  },
  output: Output.object({ schema: AnalysisSchema }),
  stopWhen: stepCountIs(5),
  prompt: userMessage,
});
// El agente puede llamar tools Y retornar structured output en 1 sola llamada
```

**Nota**: Esto es para AI SDK v6. Verificar compatibilidad con nuestra version actual.

---

## Fuentes

- Anthropic Structured Outputs Docs (GA)
- AI SDK v6 Announcement (Vercel)
- Anthropic Cookbook: Extracting Structured JSON
- Inngest Debounce + Idempotency Docs
- LogRocket: Deterministic Agentic AI with State Machines
- COLING 2025: Zero-shot Slot Filling with LLMs
