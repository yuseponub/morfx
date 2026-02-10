# Phase 16: WhatsApp Agent Integration - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Conectar agentes (conversacional Somnio + CRM agents) con inbox de WhatsApp real. Incluye activacion/desactivacion, handoff humano-robot, UX en inbox, y modulo de metricas/configuracion. Los agentes ya funcionan en sandbox — esta fase los conecta con WhatsApp real usando los mismos agentes (plug in/out).

</domain>

<decisions>
## Implementation Decisions

### Activacion del agente

- **Toggle general** en panel de configuracion: activa el agente para TODAS las conversaciones
- **Toggle per-chat** en el header de cada conversacion, al lado del nombre/numero: dos toggles separados (conversacional + CRM)
- Toggle general ON = agente responde todas las conversaciones, EXCEPTO las que tengan su toggle interno OFF
- Humano y agente **coexisten** — el agente no se pausa ni se desactiva cuando un humano escribe. Solo se apaga con toggle OFF (per-chat o general)
- **Mismos agentes que sandbox** — plug in/out, lo que funciona en sandbox funciona igual en produccion

### Config general (slider lateral en inbox)

- Slider que se sobrepone sobre el area de info contacto/pedidos en el panel lateral del inbox
- Se puede encoger/colapsar si se desea
- Contiene: toggle global ON/OFF, selector de agente conversacional, toggles por cada CRM agent, presets de timer y velocidad de respuesta
- NO incluye metricas — esas van en el modulo dedicado

### Config per-chat (header del chat)

- En el header del chat, al lado del nombre y numero del contacto
- Dos toggles: uno para agente conversacional, otro para CRM agents
- Sin panel adicional, solo los toggles

### Handoff humano-robot

- Cuando el agente detecta handoff (intent 'asesor', queja, etc.):
  1. Envia mensaje configurable al cliente (texto fijo editable en config, default: "Regalame 1 min")
  2. Se togglea OFF el agente CONVERSACIONAL (CRM sigue activo)
  3. Crea **tarea** asignada a un agente humano disponible (round-robin, si hay solo 1 va a ese)
- Si no hay humanos disponibles: se crea la tarea sin asignar, queda pendiente
- Reactivacion del agente despues de handoff: **manual** — el humano debe dar toggle ON de nuevo
- CRM agent **sigue activo** durante handoff — puede crear ordenes, tags, etc.

### Experiencia en el inbox

- Mensajes del agente tienen **badge/icono de robot** (estilo Apple/iPhone, NO Android)
- En la lista de conversaciones: icono de robot como overlay en el avatar cuando agente esta activo
- NO se necesita filtro separado para conversaciones por agente
- Mientras el agente procesa: indicador **"Bot escribiendo..."** visible en el chat
- Iconos en TODA la configuracion deben ser estilo Apple/iPhone

### Modulo dedicado de Agentes

- **Nueva seccion en nav principal**: "Agentes" al nivel de CRM, WhatsApp, Settings
- Dos tabs: **Dashboard** (metricas) + **Config** (configuracion avanzada)
- Dashboard con metricas por periodo (selector: Hoy, 7 dias, 30 dias, custom):
  - Conversaciones y ordenes: total atendidas, ordenes creadas, tasa de conversion
  - Handoffs y resolucion: cantidad de handoffs, motivos, % resuelto sin humano, tiempo promedio
  - Costos de IA: tokens usados, costo por conversacion, costo por orden
- Config: toda la configuracion del agente (misma que slider pero con mas detalle)

### Claude's Discretion

- Diseno exacto del slider lateral (animaciones, colapso)
- Layout del dashboard de metricas (graficas, cards, tablas)
- Estructura de la pagina de config avanzada
- Formato exacto de los iconos de robot (emoji Apple vs SVG custom)
- Implementacion del round-robin para asignacion de tareas

</decisions>

<specifics>
## Specific Ideas

- "Los mismos agentes de sandbox deben funcionar en produccion — plug in/out"
- "Iconos estilo Apple/iPhone en TODA la configuracion, no Android"
- "Bot escribiendo..." como indicador de procesamiento
- "Regalame 1 min" como texto default de handoff (configurable)
- Slider de config se sobrepone sobre el panel de info contacto/pedidos y se puede encoger

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-whatsapp-agent-integration*
*Context gathered: 2026-02-09*
