# Phase 30: Message Classification + Silence Timer - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Clasificar cada mensaje entrante DESPUES del IntentDetector como RESPONDIBLE, SILENCIOSO o HANDOFF, y activar un timer de retoma de 90 segundos cuando el mensaje es SILENCIOSO. No cambia QUE dice Somnio -- solo decide SI responder y CUANDO re-engancharse.

Prerequisito: Phase 29 (Inngest async processing) ya completada.

</domain>

<decisions>
## Implementation Decisions

### Clasificacion post-IntentDetector
- La clasificacion ocurre DESPUES de IntentDetector.detect(), no antes
- No hay gate de regex pre-IntentDetector -- todo pasa por Claude
- Se usa el intent detectado + el estado actual de la sesion para clasificar
- El ahorro viene de NO ejecutar Orchestrator + templates para SILENCIOSO/HANDOFF

### Tres categorias
- **RESPONDIBLE**: Todos los intents informativos y de flujo de compra -- procesar normalmente con orchestrator
- **SILENCIOSO**: Intent "otro" con confidence baja, acknowledgments puros ("ok", "jaja", thumbs-up) en estados no-confirmatorios -- NO responder, activar timer retoma
- **HANDOFF**: 6 intents definidos (asesor, queja, cancelar, no_gracias, no_interesa, fallback) -- bot se apaga, envia "Regalame 1 min", notifica host

### Matiz estado-dependiente
- "Si", "Ok", thumbs-up son RESPONDIBLE en estados confirmatorios: `resumen`, `collecting_data`, `confirmado`
- Los mismos mensajes son SILENCIOSO en estados no-confirmatorios: `conversacion`, `bienvenida`
- La clasificacion DEPENDE del session_state.current_mode

### Comportamiento HANDOFF
- Bot se apaga para esa conversacion (is_agent_enabled = false)
- Envia "Regalame 1 min" al cliente
- Notifica al host humano (mecanismo existente)
- Pendientes de bloques interrumpidos (Phase 31) se GUARDAN (no se pierden)
- Timer de retoma (si estaba activo) se CANCELA explicitamente via evento Inngest

### Timer de retoma (90 segundos)
- Patron identico a timers existentes: `step.waitForEvent()` + timeout
- Cuando mensaje clasificado SILENCIOSO: emitir evento `agent/silence.detected`
- Inngest function espera `agent/customer.message` con timeout 90s
- Si cliente escribe antes de 90s: timer se cancela (evento match)
- Si timeout expira: bot envia mensaje de retoma redirigiendo a la venta
- Ejemplo retoma: "Por cierto, te cuento sobre las promociones? :)"

### Claude's Discretion
- Texto exacto del mensaje de retoma (debe sonar natural, redirigir a venta)
- Estructura interna de la funcion clasificadora (tabla de mapeo, switch, etc.)
- Donde colocar la logica dentro del pipeline de SomnioAgent (paso 5.x vs nuevo layer)

</decisions>

<specifics>
## Specific Ideas

- El patron de timer es identico a `dataCollectionTimer`, `promosTimer` en `agent-timers.ts` -- usar misma mecanica: `step.waitForEvent()` + timeout + accion proactiva
- Evento `agent/customer.message` ya existe para cancelacion de timers -- reutilizar
- La clasificacion debe ser pura TypeScript (mapeo intent+estado → categoria), no necesita Claude
- ARCHITECTURE-ANALYSIS.md documenta que ConfidenceThresholds existen en tipos pero no se usan -- Phase 33 los hara vinculantes, Phase 30 solo clasifica por intent/estado

</specifics>

<deferred>
## Deferred Ideas

- Confidence routing (< 80% → handoff + log) -- Phase 33
- Pre-send check + interruption + pending merge -- Phase 31
- Media gate (audio/imagen/sticker) -- Phase 32
- No-repeticion escalonada (3 niveles) -- Phase 34

</deferred>

---

*Phase: 30-message-classification-silence-timer*
*Context gathered: 2026-02-25*
