# Phase 15: Agent Sandbox - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

UI de pruebas para simular conversaciones de agente sin afectar WhatsApp real. Usuario puede probar agentes, ver debugging info, y guardar sesiones para revisión posterior.

</domain>

<decisions>
## Implementation Decisions

### Layout del chat
- Estilo de burbujas igual al chat de MorfX pero con tema INVERTIDO (si sistema está en tema claro, el sandbox chat se ve oscuro y viceversa)
- Input fijo en la parte inferior
- Timestamps visibles siempre (HH:MM:SS) en cada mensaje
- Delays REALES entre mensajes de secuencia (2-6 segundos como en producción)
- Indicador de "escribiendo..." idéntico a cómo lo vería el cliente real
- Header muestra nombre del agente + estado (ej: "Somnio Sales Agent • Activo")
- Layout split horizontal: chat 60% izquierda, panel debug 40% derecha
- Split redimensionable con drag

### Panel de debugging
- Organizado en TABS: Tools | Estado | Intent | Tokens
- Tab Tools: Lista expandible - nombre + badge de estado, click para ver inputs/outputs en JSON
- Tab Estado: JSON viewer del session state EDITABLE (para predisponer estados específicos durante debugging)
- Tab Intent: Intent detectado + confidence score por mensaje
- Tab Tokens: Contador por turno y acumulado

### Controles de sesión
- Ubicados en toolbar superior
- Acciones disponibles: Nueva sesión, Resetear sesión, Guardar sesión, Cargar sesión
- Confirmación SIEMPRE antes de resetear o crear nueva sesión
- Sesiones guardadas: lista simple con opción de nombre personalizado para identificar

### Selección de agente
- Dropdown en toolbar junto a controles
- Muestra solo nombre del agente
- Cambiar agente durante sesión activa: permitido con confirmación
- Agente por defecto: último usado (recordar preferencia)

### Claude's Discretion
- Exact styling del tema invertido
- Animación del typing indicator
- Diseño específico del JSON viewer editable
- Iconografía de los botones de toolbar

</decisions>

<specifics>
## Specific Ideas

- "Quiero que simule EXACTAMENTE cómo respondería a clientes reales" - delays, typing indicator, comportamiento idéntico a producción
- "El JSON editable es para que Claude me ayude a predisponer estados específicos durante debugging"
- Tema invertido para diferenciar visualmente el sandbox del inbox real

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-agent-sandbox*
*Context gathered: 2026-02-06*
