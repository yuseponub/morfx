# DISCUSSION-LOG — v4-media-audio-image (#3 del roadmap v4)

**Fecha:** 2026-06-01 · **Rama:** `exec/debounce-v2-wave6` · **Tipo:** standalone (GSD a mano)
**Predecesores:** #1 (prompt UI editor templates/KB — entregado), #2 (v4-subloop-context-pass — SHIPPED `8c19ee61`)
**Estado:** discuss-phase ✅ → siguiente: `research-phase`

---

## Objetivo

Que el agente **somnio-sales-v4** maneje correctamente mensajes de **imagen** y **audio** end-to-end:

- **Audio:** Whisper ya transcribe (`audio-transcriber.ts`) y el transcript se le pasa al agente como texto. PERO no se persiste, no se muestra en el inbox UI, y en la práctica "no está sirviendo" (palabras del usuario). Hacerlo funcionar E2E: transcribir → **persistir** → **mostrar en UI** → el agente responde vía su pipeline normal.
- **Imagen:** hoy `media-gate.ts:46` hace **handoff inmediato** para toda imagen. El usuario quiere que el agente pueda responder imágenes con "contexto general" (fotos del producto, de la página, etc.), bifurcando a handoff los casos sensibles.

**Motivación del usuario (verbatim original):**
- Imágenes: "podemos tener un contexto general (por lo general las personas envían fotos del producto, o de la pág o algo así)".
- Audio: "agregar una herramienta que transcriba el audio correctamente a la UI del chat y que el agente también pueda responder a esto (muchas veces es bueno simplificar lo que dice la persona en un par de intents)".
- Aclaración: el audio "aún no está sirviendo" — técnicamente transcribe pero no entrega valor (transcript invisible en UI).

---

## Hechos verificados en código (esta sesión — NO re-investigar)

| Hecho | Evidencia |
|-------|-----------|
| `processMediaGate` = **UN solo call site compartido** por TODOS los agentes | `src/inngest/functions/agent-production.ts:202` (Step 1, corre ANTES del engine) |
| Imagen → handoff inmediato hoy | `src/lib/agents/media/media-gate.ts:46` |
| Video → handoff inmediato hoy | `media-gate.ts:49` |
| Audio → Whisper transcribe → **passthrough text** en éxito / handoff en fallo | `media-gate.ts:69-100` + `audio-transcriber.ts` (`whisper-1`, es) |
| Sticker → **Claude Vision** interpreta gesto → passthrough o ignore (PRIOR ART de visión) | `media-gate.ts:105-134` + `sticker-interpreter.ts` |
| Patrón canónico de visión (image+pdf, base64) | `src/lib/ocr/extract-guide-data.ts` |
| El agente resuelto YA se conoce antes del media gate (gating v4-only es factible) | `agent-production.ts:193` (`agentIdFromWebhook` / `agentIdSource` en `turn_started`, emitido en L183 ANTES del gate en L202) |
| Tabla `messages` tiene `media_url` / `media_mime_type` / `media_filename` pero **NO `transcription`** | `supabase/migrations/20260130000002_whatsapp_conversations.sql:71-73` (grep `transcription` en migrations = 0) |
| UI inbox del mensaje | `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` + `media-preview.tsx` + `template-preview.tsx` |
| Comprehension (v3 y v4) recibe `message: string` → la conversión media→texto pasa ANTES del agente | (ya pasa hoy en media-gate para audio/sticker) |
| Inbound media provider hoy = **360dialog** | `src/lib/whatsapp/api.ts:263` (downloadMedia) |
| Keys: Whisper = `OPENAI_API_KEY`; Visión Anthropic = Claude | (audio-transcriber + sticker-interpreter) |

---

## Decisiones LOCKED

### D-01 — Scope: SOLO v4 primero (gating por agente) 🔒
Los cambios de media (imagen-visión-bifurcación + audio-E2E) se **aíslan a `somnio-sales-v4`** vía gate por agente resuelto, mismo patrón que debounce-interruption-system-v2 (`resolvedAgentId === 'somnio-sales-v4'`). v3 / godentist / godentist-fb-ig / recompra / pw-confirmation quedan **byte-idénticos** (Regla 6). Migrar otros agentes = standalone follow-up por agente.
**Razón:** v3 atiende clientes reales AHORA. El media-gate es compartido (un solo call site). Cambiar imagen→handoff por imagen→visión, o el flujo de audio, afectaría producción sin esto.

### D-02 — Imagen: Visión clasifica y bifurca 🔒
Claude Vision describe/clasifica la imagen → si es sobre producto/página, el agente **responde**; si es comprobante/documento/ambiguo, **handoff informado** (con la descripción para el humano).
**Razón:** equilibra autonomía con seguridad. Responder automáticamente a un comprobante de pago o cédula es riesgoso.

### D-03 — Audio→intents: transcript completo a comprehension 🔒
NO se agrega capa LLM extra de "simplificar a intents". El transcript completo entra al comprehension de v4 (Gemini), que **ya extrae intents** de texto. La intención del usuario ("simplificar en un par de intents") la cubre el comprehension existente.
**Razón:** menos superficie, menos costo, menos latencia. El comprehension es bueno extrayendo intents.

### D-04 — Persistencia: solo transcript de audio 🔒
Migración `messages.transcription` (Regla 5, aplicar ANTES del código). Se guarda **el transcript del audio** y se muestra bajo el player en el inbox. **La imagen NO persiste descripción** (efímera, solo para que el agente responda/decida en el turno).
**Razón:** el operador necesita ver qué dijo el cliente en audio (debug/auditoría). La descripción de imagen es transitoria; persistirla es alcance futuro si se necesita.

### D-05 — Imagen→respuesta: PATH DE VISIÓN DEDICADO 🔒
Cuando D-02 decide "responder", la respuesta se genera por un **flujo dedicado de visión** (NO se inyecta la descripción como texto al pipeline normal comprehension→templates/RAG de v4).
**Razón (decisión del usuario):** respuesta más directa para "contexto general" de imágenes.
**⚠️ MATIZ A RESOLVER EN RESEARCH (RQ-1):** un path que bypasea templates/RAG puede **contradecir el KB/posicionamiento de v4**. Research debe definir cómo el path dedicado se mantiene *grounded* (ej. system prompt de contexto general curado del producto, o un resumen del KB de v4) para que no diga algo que el resto del agente nunca diría. Sin esto, riesgo de respuestas inconsistentes.
**Asimetría intencional con D-03:** audio reusa el cerebro de v4 (transcript→comprehension); imagen usa path dedicado. Justificado: el audio ES habla que mapea a intents de texto; la imagen es visual y el usuario quiere respuestas de "contexto general" que no necesariamente caben en la taxonomía de intents.

### D-06 — Taxonomía imagen: responde producto+página, handoff el resto 🔒
- **RESPONDE:** foto del producto, screenshot de la página/web, pregunta visual sobre el producto.
- **HANDOFF informado:** comprobante de pago, cédula/documento de identidad, captura de otra conversación, o cualquier cosa ambigua/no reconocida.
**Razón:** conservador y seguro. No confirmar pagos no verificados ni manejar documentos sensibles autónomamente.

---

## Decisiones secundarias (defaults locked, confirmables en plan)

### D-07 — Fail-safe: cualquier fallo de media → handoff 🔒
Si Whisper falla (ya hoy) o si Visión falla/timeout → **handoff** (acción segura actual). Nunca responder a ciegas sobre media no procesada.

### D-08 — Modelo de visión: decidir en research (RQ-2)
Prior art usa **Claude Vision** (`sticker-interpreter.ts`, `extract-guide-data.ts`). Alternativa: Gemini (v4 ya lo usa para comprehension/generation → consistencia + posible ahorro). Research compara costo/latencia/calidad y la confirma el plan. Default tentativo: Claude Vision (prior art probado).

### D-09 — Migración `messages.transcription` (Regla 5) 🔒
Columna nueva `transcription TEXT NULL` en `messages`. **Aplicar en prod ANTES de pushear el código que la use** (Regla 5 — incidente de 20h). Solo audio la escribe (D-04).

### D-10 — Sin feature flag (aislamiento por gating de agente) 🔒
v4 está DORMANT (0 workspaces con `conversational_agent_id='somnio-sales-v4'`). El gate por agente (D-01) ya aísla — no se requiere flag adicional, mismo razonamiento que debounce-v2/godentist-fb-ig (Regla 6 satisfecha sin flag).

### D-11 — Provider inbound media: 360dialog (constraint para activación)
Hoy el inbound media llega por 360dialog (`api.ts:263 downloadMedia`). Meta Direct / Onurix **no sirven inbound media hoy**. Verificar al activar v4 en un workspace que su canal entregue media. (No bloquea este standalone; es nota de activación.)

---

## Scope del cambio (Regla agent-scope — modifica capacidades de v4, no es agente nuevo)

**PUEDE (tras este standalone, SOLO v4):**
- Recibir imagen → Visión clasifica → responder (producto/página) vía path dedicado, o handoff informado (sensibles/ambiguo).
- Recibir audio → transcribir (Whisper) → persistir transcript (`messages.transcription`) → mostrar en UI → responder vía pipeline normal v4.

**NO PUEDE:**
- Cambiar el comportamiento de media de v3/godentist/godentist-fb-ig/recompra/pw-confirmation (Regla 6 — quedan en handoff-inmediato-imagen + audio-actual).
- Responder autónomamente a comprobantes de pago / documentos de identidad (D-06 → handoff).
- Persistir/mostrar descripción de imagen (D-04 — efímera).
- Procesar video (sigue handoff inmediato — fuera de alcance).
- Pushear código que use `messages.transcription` antes de aplicar la migración (D-09 / Regla 5).

---

## Preguntas para RESEARCH-PHASE

- **RQ-1 (crítica):** ¿Cómo se mantiene *grounded* el path de visión dedicado (D-05) para no contradecir el KB/posicionamiento de v4? (system prompt de contexto general curado vs resumen del KB vs subset). Definir el contrato.
- **RQ-2:** Modelo de visión — Claude Vision (prior art) vs Gemini (consistencia v4). Costo/latencia/calidad para clasificar+describir imágenes de producto/página/comprobante.
- **RQ-3:** Punto exacto de gating v4-only. ¿Gate dentro de `processMediaGate` (recibe `resolvedAgentId`) o en `agent-production.ts` antes de llamarlo? ¿Cómo se threadea el agente resuelto al gate? (verificar que `agentIdFromWebhook`/resolución esté disponible y sea confiable en L202).
- **RQ-4:** Clasificador de imagen — ¿una sola llamada de Visión que devuelve {categoría + descripción + decisión responde/handoff + respuesta sugerida}, o dos pasos (clasificar → responder)? Latencia y costo.
- **RQ-5:** UI — cómo renderizar el transcript bajo el player en `message-bubble.tsx`/`media-preview.tsx` sin romper el render actual de audio. ¿El transcript se lee de `messages.transcription` en el fetch del inbox?
- **RQ-6:** ¿Dónde se escribe `messages.transcription`? El media-gate hoy es puro (retorna `MediaGateResult`); el insert del mensaje ocurre en el webhook/domain. Mapear el flujo media-gate → persistencia del transcript (¿en `domain/messages.ts`? ¿el webhook-handler ya insertó el mensaje antes del gate?).
- **RQ-7:** Paridad sandbox — ¿el sandbox v4 (`engine-v4.ts`) ejercita el media-gate, o solo producción (`agent-production.ts`)? Si el sandbox no pasa por media-gate, ¿cómo se prueba imagen/audio en sandbox?

## Anti-objetivos (NO en esta fase)
- Procesar video (sigue handoff).
- Persistir/mostrar descripción de imagen (efímera — D-04).
- Construir un sistema de no-repetición (es otro trabajo).
- Migrar el manejo de media a otros agentes (follow-up por agente — D-01).
- Tocar el provider de envío / `whatsapp_templates` / 360dialog SEND.

## Archivos clave (para research)
`agent-production.ts` (call site media-gate L202) · `media-gate.ts` · `audio-transcriber.ts` · `sticker-interpreter.ts` · `extract-guide-data.ts` (prior art visión) · `webhook-handler.ts` · `api.ts:263` (downloadMedia 360dialog) · `domain/messages.ts` · `messages` migration · `message-bubble.tsx` + `media-preview.tsx` (UI) · `engine-v4.ts` / `v4-production-runner.ts` (paridad) · `somnio-v4-agent.ts` (pipeline).
