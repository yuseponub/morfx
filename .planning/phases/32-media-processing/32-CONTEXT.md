# Phase 32: Media Processing - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Bot handles all WhatsApp media types intelligently -- transcribing voice notes, interpreting stickers, and routing images/videos to human agents -- instead of silently ignoring non-text messages. Media gate runs before intent detection in the existing Inngest pipeline.

</domain>

<decisions>
## Implementation Decisions

### Audio transcription flow
- Use **OpenAI Whisper API** for transcription ($0.006/min)
- Transcribed text goes **directly into the normal pipeline** (no pre-check for intent count) -- treated as if the customer typed it
- If transcription fails (corrupted audio, API error, unsupported format) → **handoff silencioso** ("Regalame 1 min" + notificacion al host)
- Multiple consecutive audios → **concatenar transcripciones** en un solo texto antes de procesar (similar to ingest batching)

### Sticker interpretation
- Use **Claude Vision on every sticker** -- no pre-mapped sticker ID list
- Prompt Vision for **sentimiento general** (not just specific gestures) -- "Que expresa este sticker?"
- Only **gestos basicos** (thumbs up, ok, saludo, aplausos, corazon) are considered "recognizable" and converted to text equivalents
- Stickers Vision cannot interpret clearly → **SILENCIOSO** (ignore, don't handoff) -- assumes most unrecognizable stickers are casual

### Reaction mapping
- **Mapeo extendido:**
  - 👍 → "ok"
  - ❤️ → "ok"
  - 😂 → "jaja"
  - 🙏 → "gracias"
  - 😢 → notificar host (no handoff)
  - 😡 → notificar host (no handoff)
- Reacciones no mapeadas (🎉, 🔥, 🤔, custom) → **SILENCIOSO** (ignorar)
- Reacciones mapeadas a texto ("ok", "jaja", "gracias") → **pasan por el clasificador** (RESPONDIBLE/SILENCIOSO depende del estado de sesion, igual que si escribieran el texto)
- Reacciones negativas (😢, 😡) → **solo notifican al host**, bot sigue activo (no hacen handoff real)

### Media gate placement
- Media check runs **antes de intent detection** en el pipeline Inngest
- Flujo: webhook guarda mensaje → Inngest recibe → **MEDIA GATE** → si audio, transcribir y reemplazar texto → intent detection normal
- Handoff por media (imagen/video) → **cancela silence timer activo**
- Images/videos → handoff inmediato con "Regalame 1 min" + notificacion al host

### Claude's Discretion
- Estrategia de retry para descarga de media de 360dialog
- Prompt exacto de Vision para stickers
- Formato de notificacion al host para media recibido
- Manejo de audio OGG → formato compatible con Whisper
- Ventana de concatenacion de audios consecutivos (timing)

</decisions>

<specifics>
## Specific Ideas

- Audios consecutivos se concatenan como el ingest batching existente -- acumular transcripciones antes de procesar
- Reacciones negativas notifican pero no interrumpen -- el bot sigue vendiendo, el host tiene contexto
- Stickers no reconocibles se ignoran silenciosamente -- la mayoria son casuales y no requieren accion

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 32-media-processing*
*Context gathered: 2026-02-24*
