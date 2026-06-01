# RESEARCH — v4-media-audio-image (#3 del roadmap v4)

**Researched:** 2026-06-01 · **Rama:** `exec/debounce-v2-wave6`
**Baseline SHA (para diffs Regla 6):** `85092058e4495fc0e97ff0be2c6da582ca06c563` (HEAD de `exec/debounce-v2-wave6`)
**Domain:** WhatsApp media processing (image vision + audio transcription) para `somnio-sales-v4` ONLY
**Confidence:** **HIGH** (todo code-grounded; las únicas decisiones MEDIUM son la elección de modelo de visión y el threshold de confidence del path dedicado, ambas confirmables en plan)

---

## Summary

El cambio es **quirúrgicamente aislable a v4** porque (1) el agente resuelto (`agentId`) ya está disponible en `agent-production.ts:150` ANTES del media-gate en L202, y (2) el media-gate es la única bifurcación compartida. El gating v4-only se hace pasando `resolvedAgentId` a `processMediaGate` y bifurcando *dentro* del switch — todos los demás agentes caen al `default` byte-idéntico (handoff inmediato de imagen, audio actual).

Para **audio**: la transcripción ya funciona (`audio-transcriber.ts`, Whisper `whisper-1`). El gap es persistencia + UI. El mensaje YA está insertado en DB (`domain/messages.ts:receiveMessage`) ANTES de que el media-gate corra — por eso `messages.transcription` es un **UPDATE keyed by wamid**, NO un insert. Hay que (a) migración `transcription TEXT NULL` (Regla 5), (b) nueva función `domain/messages.ts:setMessageTranscription()` (Regla 3 — hoy NO existe función de update de mensaje), (c) renderizar bajo el `<audio>` player en `media-preview.tsx`. El fetch usa `select('*')` así que la columna fluye sola al tipo `Message` (solo hay que agregar el campo al interface).

Para **imagen**: hoy `media-gate.ts:46` hace handoff inmediato. La rama v4 hace: Gemini Vision clasifica+describe → si producto/página, un **path de visión dedicado** redacta la respuesta *grounded en el KB de v4* (reusando `kbSearchTool` + `buildGenerationPrompt`); si comprobante/cédula/ambiguo, handoff informado con la descripción.

**Recomendación primaria:** Una sola llamada Gemini Vision (clasificar+describir+decidir, RQ-4 = single-call), modelo **`gemini-2.5-flash`** (RQ-2 — consistencia con v4, 10x más barato que Claude, multimodal nativo vía AI SDK). El path dedicado de respuesta NO es free-form: reusa el pipeline RAG de v4 (kb_search → `buildGenerationPrompt`) con la descripción de la imagen como query, manteniendo grounding y posicionamiento (RQ-1).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audio transcripción | Inngest (media-gate) | OpenAI Whisper | Ya existe; solo agrega persistencia |
| Persistencia transcript | Domain layer | DB (UPDATE messages) | Regla 3 — toda mutación vía domain |
| Render transcript | Frontend (inbox UI) | — | `media-preview.tsx` / `message-bubble.tsx` |
| Imagen clasificar+describir | Inngest (media-gate v4 branch) | Gemini Vision | Pre-engine, igual que sticker hoy |
| Imagen respuesta grounded | Sub-loop RAG de v4 (reuso) | kb_search + Gemini Flash | Grounding obligatorio (RQ-1) |
| Gating v4-only | Inngest (agent-production.ts) | — | `resolvedAgentId` disponible en L150 |

---

## RQ-1 (CRÍTICA) — Grounding del path de visión dedicado

**Recomendación:** El path dedicado **NO debe ser un system prompt free-form de "contexto general"**. Debe **reusar la infraestructura RAG existente de v4** para garantizar grounding y consistencia de posicionamiento. Contrato concreto:

1. La llamada de visión (RQ-4) produce una **`descripcion`** textual de la imagen (ej: *"foto del frasco de ELIXIR DEL SUEÑO, pregunta visual sobre presentación"*) + categoría.
2. Si categoría = producto/página → usar `descripcion` (+ caption del cliente si hay) como **query** a `kbSearchTool(ctx)` — exactamente el mismo tool que el sub-loop RAG (`src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts:67`), que pega a la RPC `match_knowledge_base` con el embedding y devuelve hits con `hechosDelProducto`, `posicionDelNegocio`, `debeContener`, `nuncaDecirRules`, `cuandoEscalar`.
3. Redactar la respuesta con **`buildGenerationPrompt(material, TONE_BASE, FEW_SHOTS, stateContext)`** (`src/lib/agents/somnio-v4/sub-loop/prompt.ts:332`) + `runGenerationCall(...)` (`generation-call.ts:49`). Esto hereda automáticamente: tono Somnio (`TONE_BASE`), reglas anti-invención duras, calibración de `responseConfidence` (5 buckets), backstop binario, y las reglas `NUNCA decir` / `Cuándo escalar` del topic ganador.
4. Aplicar el **mismo threshold** `RESPONSE_CONFIDENCE_THRESHOLD` que el sub-loop (`sub-loop/index.ts:149`): si `responseConfidence < threshold` o `binary ∈ {FALTA_INFO, FUERA_SCOPE}` → **handoff silente/informado** en vez de responder. Esto reusa el mecanismo probado de v4 — la imagen no inventa nada que el resto del agente no diría.

**Por qué NO un prompt curado aparte:** Mantener un "resumen del KB" duplicado o un system prompt curado a mano (a) se desincroniza del KB real (18 topics en `agent_knowledge_base`), (b) reintroduce el riesgo de invención que el RAG-generative justamente eliminó, (c) viola el espíritu de la arquitectura v4 (KB = single source of truth). Reusar kb_search + `buildGenerationPrompt` es **cero deuda de grounding**.

**Matiz D-05 (path dedicado ≠ inyectar texto al pipeline normal):** Se honra — NO se inyecta la descripción como un "mensaje de texto" que pase por comprehension → state-machine → templates. En cambio, el path dedicado **salta directo** a la capa RAG (kb_search + generation) con la descripción como query. Es dedicado (bypasea comprehension/templates) PERO grounded (usa el mismo KB + reglas). Esta es la diferencia exacta que D-05 pedía resolver.

**Evidencia:** `kb-search-tool.ts:67-139` · `prompt.ts:332-423` · `generation-call.ts:49-84` · `sub-loop/index.ts:149-175` · KB ejemplo `knowledge/product/contenido.md` (estructura Hechos/Posición/Debe contener/NUNCA/Escalar).

**Confidence:** HIGH para el mecanismo (reuso directo). MEDIUM para si conviene pasar la imagen *también* a la generation-call (multimodal) o solo la descripción textual — recomiendo **solo descripción textual** en V1 (más simple, evita doble costo de visión, el KB ya tiene el material). La imagen cruda solo va a la llamada clasificadora.

---

## RQ-2 — Modelo de visión: Gemini vs Claude

**Recomendación: `gemini-2.5-flash`** (mismo modelo que comprehension/generation de v4).

| Criterio | Gemini 2.5 Flash | Claude Sonnet 4.x (prior art) |
|----------|------------------|-------------------------------|
| Input pricing | $0.30/M tokens · **~$0.0004/imagen** (1024×1024 ≈ 1290 tok) | $3.00/M tokens · **~$0.0048/imagen** (~10x más caro) |
| Output pricing | $2.50/M | $15.00/M |
| Consistencia con v4 | **Nativo** — v4 ya usa `google('gemini-2.5-flash')` en comprehension (`comprehension.ts:86`) + generation (`generation-call.ts:57`) | Provider separado (`@anthropic-ai/sdk`), key distinta |
| Multimodal en AI SDK | Sí — mismo `messages` content array (image part) | Sí (prior art `sticker-interpreter.ts`, `extract-guide-data.ts`) |
| Calidad clasificación producto/página/comprobante | Alta (vision benchmark competitivo) | Alta (probada en OCR de guías) |

**Razón decisiva:** consistencia de stack (un solo provider para todo v4), 10x menor costo, y el AI SDK ya está cableado con `google()`. El prior art Claude (`sticker-interpreter.ts`, `extract-guide-data.ts`) sirve como **patrón de código** (base64 fetch + JSON parse + fail-safe) pero el modelo recomendado es Gemini.

**Patrón de código a seguir:** `extract-guide-data.ts:35-142` (fetch→base64→content block→parse JSON con regex `/\{[\s\S]*\}/`→fail-safe EMPTY_RESULT). Trasladar a AI SDK `generateText({ model: google('gemini-2.5-flash'), messages: [{ role:'user', content: [{ type:'image', image: <base64 o URL> }, { type:'text', text: PROMPT }] }], output: Output.object({ schema }) })`.

**Sources:**
- [Gemini API Pricing — ai.google.dev](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 2.5 Flash pricing — pricepertoken.com](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash)
- [Claude Vision docs — platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Claude pricing — platform.claude.com](https://platform.claude.com/docs/en/about-claude/pricing)

**Confidence:** HIGH (pricing verificado; multimodal capability verificada en código v4).

---

## RQ-3 — Punto exacto de gating v4-only

**Recomendación: pasar `resolvedAgentId` a `processMediaGate` y bifurcar DENTRO del switch.**

El `agentId` ya está completamente resuelto en `agent-production.ts:150-151`:
```ts
const agentId: AgentId = agentIdFromWebhook ?? (await resolveAgentIdForWorkspace(workspaceId))
```
Esto corre **52 líneas ANTES** del call site del media-gate (L202). `agentIdFromWebhook` viene de `event.data.agentId` (poblado por el webhook handler en `webhook-handler.ts:451` = `resolvedAgentId`), con fallback a resolución local. **Es confiable y disponible.**

**Threading:** Agregar `resolvedAgentId: AgentId` a `MediaGateInput` (`media/types.ts:13`) y pasarlo en la llamada (`agent-production.ts:204`):
```ts
return processMediaGate({
  ...,
  resolvedAgentId: agentId,  // NUEVO
})
```

**Bifurcación dentro de `processMediaGate` (`media-gate.ts:38`):**
```ts
case 'image':
  return input.resolvedAgentId === 'somnio-sales-v4'
    ? handleImageV4(input)        // NUEVO: vision classify + dedicated path
    : { action: 'handoff', reason: 'Cliente envio una imagen' }  // byte-idéntico
case 'audio':
  return input.resolvedAgentId === 'somnio-sales-v4'
    ? handleAudioV4(input)        // NUEVO: transcribe + persist
    : handleAudio(input)          // byte-idéntico (función actual intacta)
```

**Por qué dentro del gate (no en agent-production.ts):** mantiene `agent-production.ts` con un cambio mínimo (solo pasar el param), concentra toda la lógica de media en el módulo `media/`, y hace el grep de Regla 6 trivial (`grep "somnio-sales-v4" src/lib/agents/media/`). El `default` y los demás casos quedan byte-idénticos.

**Constante:** usar `SOMNIO_V4_AGENT_ID` de `src/lib/agents/somnio-v4/config.ts:9` (`'somnio-sales-v4' as const`) para evitar string literal suelto.

**Evidencia:** `agent-production.ts:150-151` (resolución), `:193` (`agentIdSource`), `:202-213` (call site) · `webhook-handler.ts:338` + `:451` (resolvedAgentId threading) · `media-gate.ts:38-59`.

**Confidence:** HIGH.

---

## RQ-4 — Clasificador de imagen: single-call vs two-step

**Recomendación: UNA sola llamada Gemini Vision** que devuelve un objeto estructurado:
```ts
{
  categoria: 'producto' | 'pagina' | 'comprobante_pago' | 'documento_identidad' | 'captura_conversacion' | 'ambiguo',
  descripcion: string,        // descripción de lo que se ve (insumo del path dedicado RQ-1)
  decision: 'responder' | 'handoff',  // derivada de categoria por regla (D-06)
}
```
`decision` se computa **determinísticamente** en código a partir de `categoria` (NO la decide el LLM): `producto`/`pagina` → `responder`; todo lo demás → `handoff`. Esto evita que el modelo "se confíe" y responda a un comprobante.

**Por qué single-call (no two-step classify→answer):**
- El path de respuesta (RQ-1) NO es una segunda llamada de visión — es el pipeline RAG textual (kb_search + generation) que usa la `descripcion`. Así que ya hay como máximo 2 llamadas (1 visión + N del RAG), pero la visión es 1 sola.
- Latencia: 1 llamada visión (~1-2s) + RAG (~2-4s). Two-step de visión duplicaría el costo de visión sin ganancia (el material de respuesta viene del KB, no de re-mirar la imagen).
- Costo: ~$0.0004 por imagen (single Gemini Flash call) + costo RAG estándar de v4.

**Fail-safe (D-07):** si la llamada de visión falla/timeout o el JSON no parsea → `{ action: 'handoff', reason: 'Cliente envió una imagen (no se pudo analizar)' }`. Mismo patrón que `extract-guide-data.ts` EMPTY_RESULT y `sticker-interpreter.ts` catch.

**Confidence:** HIGH para single-call de visión. La taxonomía exacta de categorías la confirma el plan (D-06 ya la fija a alto nivel).

---

## RQ-5 — UI: renderizar transcript bajo el player

**Dónde se lee `messages.transcription`:** El fetch principal es `src/app/actions/messages.ts:getMessages()` (L31) que usa `.select('*')` (L64) y castea `as Message[]` (L82). **`select('*')` incluye la columna nueva automáticamente** — solo hay que agregar `transcription: string | null` al interface `Message` (`src/lib/whatsapp/types.ts:69-88`).

**Render (sin romper audio actual):** El audio renderiza en `media-preview.tsx:151-167` (`<audio controls>`). El componente `MediaPreview` NO recibe hoy la transcription — hay que **threadearla**:
1. `MediaPreviewProps` (`media-preview.tsx:9-15`): agregar `transcription?: string | null`.
2. `message-bubble.tsx:69-77` (`MessageContent`): pasar `transcription={message.transcription}` al `<MediaPreview>` para el case `audio`.
3. En el bloque audio (`media-preview.tsx:152-167`), agregar bajo el `<audio>`:
```tsx
{type === 'audio' && transcription && (
  <p className="text-sm text-muted-foreground italic mt-1 whitespace-pre-wrap">{transcription}</p>
)}
```
Esto es aditivo — no toca el render de image/video/document/sticker.

**Realtime:** Los componentes de inbox (`chat-view.tsx`, `inbox-layout.tsx`) usan Supabase realtime. El transcript se escribe como UPDATE *después* de la transcripción (en el Inngest function), así que el cliente verá primero el audio sin transcript y luego un UPDATE event con el transcript (postgres_changes UPDATE). Verificar que el handler de realtime para mensajes maneje UPDATE (no solo INSERT) — **esto es un punto a validar en plan** (no se encontró el mapping exacto de realtime de mensajes en este research; `chat-view.tsx` tiene `.channel(` pero no se inspeccionó el evento UPDATE).

**Evidencia:** `actions/messages.ts:31-83` · `types.ts:69-88` · `media-preview.tsx:9-15,151-167` · `message-bubble.tsx:53,63-78`.

**Confidence:** HIGH para el read path (`select('*')`) y el render estático. MEDIUM para realtime UPDATE propagation (validar en plan).

---

## RQ-6 — Dónde se escribe `messages.transcription` (ordering insert vs update)

**Hallazgo CRÍTICO confirmado: el mensaje se INSERTA ANTES de que el media-gate corra → transcription es un UPDATE.**

Flujo trazado:
1. `webhook-handler.ts:267` llama `domainReceiveMessage(ctx, {...})` → `domain/messages.ts:receiveMessage()` (L391) hace el **INSERT** del row en `messages` (L399-413) con `wamid = params.waMessageId = msg.id`.
2. `webhook-handler.ts:425-453` emite el evento Inngest `agent/whatsapp.message_received` con `messageId: msg.id` (L433) — **el mismo wamid del row ya insertado**.
3. El Inngest function `agent-production.ts` corre el media-gate (L202) — el row YA existe en DB.

→ Por tanto la transcripción se escribe con **`UPDATE messages SET transcription = $1 WHERE wamid = $2` (scoped por workspace_id)**.

**Dónde escribir (Regla 3):** El media-gate (`media-gate.ts`) es **puro** (retorna `MediaGateResult`, no escribe DB). NO debe hacerse el UPDATE adentro del gate (rompería su pureza y testabilidad). En cambio:
- **Opción recomendada:** `handleAudioV4` retorna el transcript en el result (ya lo hace como `text`), y el **Inngest function** (`agent-production.ts`, rama passthrough ~L364) hace el UPDATE vía un nuevo `step.run('persist-transcription', ...)` que llama una **nueva función domain** `setMessageTranscription(ctx, { messageId/wamid, transcription })`.
- **Regla 3 — función domain NUEVA requerida:** `domain/messages.ts` hoy NO tiene ninguna función de UPDATE de un mensaje existente (solo send* que insertan, y receiveMessage). Hay que **agregar** `setMessageTranscription()` que use `createAdminClient()` + filtre por `workspace_id` + UPDATE por `wamid`. Verificado: grep de funciones en `domain/messages.ts` = solo `sendText/sendMedia/sendTemplate/receiveMessage/getLastInbound/getInboundConversations`.

**Detalle de threading:** `MediaGateResult` para audio v4 podría extenderse a `{ action: 'passthrough', text, transcription: text }` o el function reusa `gateResult.text` cuando `messageType==='audio'`. Recomiendo que el gate retorne el transcript explícito y el function lo persista — mantiene el gate puro y el side-effect (DB) en la capa Inngest+domain donde corresponde.

**Evidencia:** `webhook-handler.ts:267-291` (insert) · `:425-453` (event con messageId) · `domain/messages.ts:391-466` (receiveMessage insert) · `agent-production.ts:202,364` · grep funciones domain (sin update).

**Confidence:** HIGH.

---

## RQ-7 — Paridad sandbox

**Hallazgo: el sandbox v4 NO ejercita el media-gate. El media-gate vive SOLO en producción (`agent-production.ts`).**

- `engine-v4.ts` toma `V4EngineInput { message: string, ... }` (`engine-v4.ts:55-56`) — **solo texto**, sin `messageType`/`mediaUrl`/visión/transcripción. No hay ninguna referencia a `processMediaGate`, `transcrib`, `image`, ni `vision` en `engine-v4.ts`.
- El media-gate (transcripción + visión) corre en `agent-production.ts:202` (Inngest, producción). El sandbox entra al engine *después* de que el mensaje ya es texto.

**Implicación de paridad (siguiendo `INTERRUPTION-PARITY.md`):** El media-gate es una etapa de **pre-procesamiento** que convierte media→texto/decisión ANTES del engine. Según el doc de paridad (§4.4), las diferencias permitidas son "envío real vs stream, persistencia DB vs memoria, timing real vs simulado". El media-gate cae en la categoría de "entrada/pre-proceso" que difiere entre prod (webhook+Inngest) y sandbox (route NDJSON).

**Cómo probar imagen/audio en sandbox (recomendación):**
- **Audio:** el sandbox ya acepta texto. Para probar el flujo de audio v4, el operador puede pegar el transcript como texto (el comportamiento post-transcripción es idéntico — D-03 reusa el pipeline normal). NO se requiere paridad de media-gate para audio porque post-transcripción es texto puro.
- **Imagen (path dedicado):** Esto SÍ es un gap de paridad real — el path de visión dedicado (RQ-1: kb_search + generation con descripción) NO es ejercitable hoy en sandbox. **Recomendación V1:** documentar el gap explícitamente (igual que el doc de paridad documenta el caveat RAG-send y CRM). El path de visión es testeable vía **unit tests** del clasificador + del path RAG (mockeando la `descripcion`). Smoke E2E de imagen se hace en WhatsApp real al activar v4 (igual que D-19 Phase 3 de debounce difería el smoke WhatsApp a activación).
- **Opción futura (no V1):** agregar a la route del sandbox (`app/api/sandbox/process/route.ts`) un campo opcional `imageUrl` que corra el clasificador + path dedicado, igual que se hizo con `debounce-v2-sandbox-integration` para cablear el lock al engine. Esto sería un follow-up standalone si se necesita probar visión visualmente en sandbox.

**No viola paridad de interrupción:** el media-gate corre ANTES del lock/engine, así que no toca Path A/B ni checkpoints. El contrato de `INTERRUPTION-PARITY.md` queda intacto.

**Evidencia:** `engine-v4.ts:55-56` (input solo texto), grep media/vision en engine-v4 = 0 matches · `INTERRUPTION-PARITY.md` §3-4 · `agent-production.ts:202` (gate solo en prod).

**Confidence:** HIGH para el diagnóstico (sandbox no toca media-gate). MEDIUM para la estrategia de testing de imagen (unit + WhatsApp smoke recomendado; sandbox visual = follow-up opcional).

---

## Implementation Approach / Wave Breakdown Sketch

> Para que `plan-phase` lo convierta en PLANs. Respeta Regla 5 (migración primero) y Regla 6 (gating v4).

**Wave 0 — Migración + baseline (Regla 5):**
- Migración `supabase/migrations/<ts>_messages_transcription.sql`: `ALTER TABLE messages ADD COLUMN transcription TEXT NULL;`
- **PAUSAR — aplicar en prod ANTES de pushear código que la use** (D-09 / Regla 5; incidente 20h).
- Atestiguar baseline SHA `85092058…` + grep baseline de los 5 agentes no-v4.

**Wave 1 — Domain write (Regla 3):**
- Agregar `setMessageTranscription(ctx, { wamid, transcription })` a `domain/messages.ts` (createAdminClient + UPDATE WHERE wamid + workspace_id).
- Agregar `transcription: string | null` al interface `Message` (`types.ts:69-88`).

**Wave 2 — Media-gate v4 branch (gating + audio persist + vision classify):**
- `media/types.ts`: agregar `resolvedAgentId` a `MediaGateInput`.
- `agent-production.ts:204`: pasar `resolvedAgentId: agentId`.
- `media-gate.ts`: bifurcar `image`/`audio` por `resolvedAgentId === SOMNIO_V4_AGENT_ID`. `default`/otros agentes byte-idénticos.
- `handleAudioV4`: transcribe (reusa `transcribeAudioFromUrl`) + retorna transcript para persistir.
- `agent-production.ts` rama passthrough: `step.run('persist-transcription', ...)` → `setMessageTranscription` cuando `messageType==='audio'` y v4.
- Nuevo `media/image-classifier.ts`: Gemini Vision single-call (patrón `extract-guide-data.ts` adaptado a AI SDK `google('gemini-2.5-flash')` + `Output.object`).

**Wave 3 — Path de visión dedicado + grounding (RQ-1):**
- Nuevo `media/image-vision-path.ts` (o dentro de somnio-v4): cuando `decision==='responder'`, llamar `kbSearchTool(ctx)` con `descripcion` → `buildGenerationPrompt` → `runGenerationCall` → aplicar `RESPONSE_CONFIDENCE_THRESHOLD` + binary backstop → responder o handoff informado.
- Wiring del envío de la respuesta de visión (cuidado con el caveat RAG-send de `INTERRUPTION-PARITY.md` §6 — la respuesta suelta no-template puede no enviarse hoy; coordinar).

**Wave 4 — UI transcript:**
- `media-preview.tsx`: prop `transcription` + render bajo `<audio>`.
- `message-bubble.tsx`: threadear `message.transcription` al `MediaPreview`.
- Validar realtime UPDATE propaga el transcript (RQ-5 punto abierto).

**Wave 5 — Tests + Regla 6 greps:**
- Unit: clasificador (categorías + fail-safe), path RAG de visión (mock descripción), `setMessageTranscription`.
- Regla 6 grep gates (ver Pitfalls).
- Smoke: WhatsApp real con v4 activado (audio→transcript en UI; imagen producto→respuesta; comprobante→handoff).

---

## Common Pitfalls

### Pitfall 1 — Leakage de Regla 6 (el más crítico)
**Qué sale mal:** El media-gate es un call site compartido por los 6 agentes. Cambiar `case 'image'` o `case 'audio'` sin gate afectaría a v3 (clientes reales AHORA).
**Cómo evitar:** TODA rama nueva gated por `resolvedAgentId === SOMNIO_V4_AGENT_ID`. La función `handleAudio` actual queda intacta (renombrar a nada — el path no-v4 la sigue llamando). Gate verificable:
```bash
# Greps de Regla 6 (deben pasar):
git diff 85092058 -- src/lib/agents/media/media-gate.ts   # las ramas no-v4 byte-idénticas
grep -c "somnio-sales-v4\|SOMNIO_V4_AGENT_ID" src/lib/agents/media/media-gate.ts  # >=2 (image+audio)
# Behavioral: un test que pase resolvedAgentId='somnio-sales-v3' a image → action:'handoff' (idéntico hoy)
```

### Pitfall 2 — Insert-vs-update ordering del transcript
**Qué sale mal:** Asumir que la transcripción es parte del INSERT del mensaje. El INSERT ya ocurrió en `receiveMessage` ANTES del gate; un segundo insert duplicaría (y violaría el unique `wamid`).
**Cómo evitar:** Es un UPDATE keyed by `wamid`. La función domain `setMessageTranscription` hace UPDATE, nunca insert. Confirmado en RQ-6.

### Pitfall 3 — Regla 5 (migración antes de deploy)
**Qué sale mal:** Pushear código que lee/escribe `messages.transcription` antes de aplicar la migración → el mecanismo de resiliencia tampoco funciona (incidente 20h citado en CLAUDE.md Regla 5).
**Cómo evitar:** Wave 0 aplica migración en prod + confirmación explícita del usuario ANTES de cualquier push de Waves 1-5.

### Pitfall 4 — Alucinación de visión en comprobantes (D-06)
**Qué sale mal:** El modelo clasifica un comprobante de pago como "producto" y el agente confirma un pago no verificado.
**Cómo evitar:** `decision` se computa en código (no la decide el LLM): solo `producto`/`pagina` → responder. Default conservador = handoff. Además el path RAG aplica el threshold de confidence + `Cuándo escalar` del KB → doble red. En duda → handoff (D-07 fail-safe).

### Pitfall 5 — Gap de paridad sandbox para imagen
**Qué sale mal:** Esperar probar el path de visión en sandbox y descubrir que el sandbox no pasa por media-gate.
**Cómo evitar:** Documentar el gap (RQ-7). Imagen se valida con unit tests + WhatsApp smoke. Audio sí es probable en sandbox pegando el transcript como texto.

### Pitfall 6 — Gemini SAFETY blocking (heredado de v4)
**Qué sale mal:** Gemini bloquea silenciosamente menciones de "alcohol/embarazo/anticoagulantes" → `NoOutputGeneratedError finishReason='SAFETY'`.
**Cómo evitar:** Reusar los `safetySettings: BLOCK_NONE x4` ya presentes en `generation-call.ts:69-78`. Si el clasificador de visión usa `Output.object`, aplicar los mismos safety settings.

### Pitfall 7 — Caveat RAG-send (envío de respuesta no-template)
**Qué sale mal:** La respuesta del path de visión es un mensaje suelto (no-template). Según `INTERRUPTION-PARITY.md` §6, el runner de producción "todavía no envía" respuestas RAG sueltas (gap del standalone `somnio-v4-rag-generative` en progreso).
**Cómo evitar:** Coordinar con ese standalone. Si el wiring de envío RAG no está listo al ejecutar este, la respuesta de visión tampoco se enviaría. Validar el estado del send-path RAG en plan-phase. (No bloquea audio, que solo persiste + UI.)

---

## Runtime State Inventory

| Categoría | Items | Acción |
|-----------|-------|--------|
| Stored data | `messages` table — nueva columna `transcription TEXT NULL` | Migración (Wave 0). NO backfill (audios viejos quedan sin transcript — aceptable, D-04 es forward-looking) |
| Live service config | Ninguno — sin workflows/dashboards externos afectados | None — verificado (cambio interno de pipeline) |
| OS-registered state | Ninguno | None |
| Secrets/env vars | `OPENAI_API_KEY` (Whisper, ya existe) + `GOOGLE_*`/Gemini key (ya usado por v4) | None — keys ya presentes |
| Build artifacts | Ninguno | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenAI Whisper (`whisper-1`) | Audio transcription | ✓ (ya en prod) | API | — (handoff on fail, D-07) |
| Gemini 2.5 Flash (`@ai-sdk/google`) | Image vision + RAG generation | ✓ (ya en v4) | API | — (handoff on fail, D-07) |
| 360dialog inbound media | Image/audio delivery | ✓ (`api.ts:263`) | — | Meta Direct/Onurix NO sirven inbound media (D-11 — nota de activación, no bloquea) |
| Supabase Storage | Media re-hosting | ✓ (webhook re-hosts) | — | — |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El realtime de inbox propaga UPDATE events de `messages` (no solo INSERT) para que el transcript aparezca sin refresh | RQ-5 | MEDIUM — si solo escucha INSERT, el operador no ve el transcript hasta recargar. Validar `chat-view.tsx` postgres_changes en plan. |
| A2 | Pasar solo la descripción textual (no la imagen cruda) a la generation-call es suficiente para grounding | RQ-1 | LOW — si la descripción pierde matices, se puede pasar la imagen multimodal a la generation-call (más costo). Confirmable en plan. |
| A3 | El threshold de confidence del sub-loop (`RESPONSE_CONFIDENCE_THRESHOLD`) es el valor correcto para el path de visión | RQ-1 | LOW — reuso del mismo umbral probado; ajustable. |

---

## Sources

### Primary (HIGH — código del repo)
- `agent-production.ts:150-213` — resolución de agentId + call site media-gate
- `media/media-gate.ts`, `media/types.ts`, `media/index.ts`, `audio-transcriber.ts`, `sticker-interpreter.ts` — pipeline de media
- `ocr/extract-guide-data.ts` — patrón canónico de visión base64 (Claude prior art)
- `domain/messages.ts` — insert flow (receiveMessage) + ausencia de función update
- `webhook-handler.ts:240-460` — orden insert→event, threading de resolvedAgentId
- `somnio-v4/sub-loop/kb-search-tool.ts`, `prompt.ts`, `generation-call.ts`, `tone-base.ts` — infra RAG reusable (RQ-1)
- `somnio-v4/engine-v4.ts:55-56`, `INTERRUPTION-PARITY.md` — paridad sandbox (RQ-7)
- `supabase/migrations/20260130000002_whatsapp_conversations.sql:46-82` — schema messages (sin transcription)
- `app/.../whatsapp/components/message-bubble.tsx`, `media-preview.tsx`, `actions/messages.ts:31-83`, `whatsapp/types.ts:69-88` — UI + fetch (RQ-5)
- `somnio-v4/config.ts:9` — `SOMNIO_V4_AGENT_ID`

### Secondary (MEDIUM — web, pricing)
- [Gemini API Pricing — ai.google.dev](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 2.5 Flash pricing — pricepertoken.com](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash)
- [Claude Vision docs — platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Claude pricing — platform.claude.com](https://platform.claude.com/docs/en/about-claude/pricing)

## Metadata
- **Standard stack:** HIGH — reuso de infra existente (Whisper, Gemini, kb_search, domain layer)
- **Architecture/gating:** HIGH — agentId resuelto pre-gate confirmado en código
- **RQ-6 ordering:** HIGH — insert→event→gate trazado end-to-end
- **Vision model:** HIGH — pricing verificado + multimodal capability en código
- **Sandbox parity testing:** MEDIUM — diagnóstico HIGH, estrategia de test confirmable en plan
- **Research date:** 2026-06-01 · **Valid until:** ~2026-07-01 (pricing puede cambiar; código estable)
