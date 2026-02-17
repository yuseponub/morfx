# Fase Suelta: Optimización Rendimiento WhatsApp - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Optimizar el rendimiento del módulo de WhatsApp (inbox, chat, panel lateral) reduciendo queries innecesarias, canales realtime excesivos y cascade refetches. TODA la funcionalidad actual se preserva — cero regresiones.

4 problemas identificados:
1. Queries pesadas en getConversations() con datos anidados innecesarios
2. Cascade realtime refetches — 4 canales re-cargan toda la lista en cada evento
3. 8 canales realtime por conversación abierta (4 lista + 2 chat + 2 panel)
4. Panel lateral carga datos innecesariamente al entrar a una conversación

</domain>

<decisions>
## Implementation Decisions

### Panel lateral (decisión del usuario)
- Panel derecho (contacto + pedidos) **cerrado por defecto** al entrar a una conversación
- Esto evita: 2 canales realtime + fetch de órdenes + polling de 30s — hasta que el usuario lo necesite

### Claude's Discretion
El usuario delegó todas las decisiones técnicas de optimización. Claude tiene libertad total para:

- **Estrategia de carga del panel:** Lazy-load vs montar oculto vs desmontar. Elegir lo más eficiente.
- **Optimización de queries:** Qué datos quitar de getConversations(), cómo separar lista liviana vs detalle.
- **Consolidación realtime:** De 8 canales a lo mínimo necesario. Un canal vs varios reducidos, qué eventos escuchar dónde.
- **Refetch inteligente:** Refetch completo vs update quirúrgico cuando llega un evento realtime. Minimizar trabajo redundante.
- **Cualquier otra optimización** que mejore rendimiento sin romper funcionalidad.

**Restricción única del usuario:** No perder NINGUNA funcionalidad actual. Todo debe seguir funcionando igual, solo más rápido.

</decisions>

<specifics>
## Specific Ideas

- El usuario notó que el panel lateral es lo primero que se puede optimizar (carga innecesaria visible)
- Prioridad: impacto percibido por el usuario > optimización invisible
- Los 4 problemas están documentados en PHASE.md con archivos clave y líneas específicas

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: standalone/whatsapp-performance*
*Context gathered: 2026-02-16*
