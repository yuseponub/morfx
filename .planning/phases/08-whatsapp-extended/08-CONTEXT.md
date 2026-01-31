# Phase 8: WhatsApp Extended - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Gestión avanzada de WhatsApp: templates con aprobación de Meta, asignación de conversaciones a agentes organizados en equipos, quick replies para respuestas frecuentes, y tracking de costos por categoría para billing. Incluye Super Admin panel para configuraciones a nivel plataforma.

**NO incluye:** Sincronización CRM-WhatsApp (Fase 9), bots/automatización, integraciones con otros canales.

</domain>

<decisions>
## Implementation Decisions

### Template Builder

- Solo Owner/Admin pueden crear y gestionar templates (Agentes solo usan)
- Mapeo flexible de variables: admin conecta cualquier campo de contacto/pedido a variables {{1}}, {{2}}, etc.
- Estado de aprobación Meta mostrado con badges de color en listado (pending=amarillo, approved=verde, rejected=rojo)
- Ubicación: Configuración > WhatsApp > Templates
- Las 4 categorías de Meta disponibles (Marketing, Utility, Authentication, Service)
- Categorías habilitadas/deshabilitadas por workspace desde Super Admin panel
- Botón dedicado "Enviar Template" en chat cuando ventana 24h cerrada
- Preview obligatorio antes de enviar: modal muestra mensaje con variables sustituidas

### Asignación de Agentes

- Agentes organizados en equipos (ej: Ventas, Soporte, Cobros)
- Conversaciones nuevas van al equipo por defecto, cambio manual para reasignar
- Toggle manual de disponibilidad (online/offline) por agente
- Reasignación automática al siguiente agente disponible del mismo equipo cuando el asignado está offline
- Comportamiento de reasignación configurable por workspace
- Panel de configuración para gestionar equipos, reglas de asignación, y disponibilidad

### Quick Replies

- Scope: solo a nivel workspace (todos los agentes comparten las mismas)
- Por defecto texto fijo, sin variables
- Variables dinámicas habilitables por workspace desde Super Admin panel
- Acceso via atajo de teclado: escribir '/' en el input muestra lista
- Por defecto lista plana con búsqueda, categorías habilitables desde Super Admin panel

### Costos y Usage

- Tracking por workspace + categoría (Marketing, Utility, Authentication, Service)
- Dashboard en dos niveles:
  - Super Admin: ve costos de todos los workspaces
  - Workspace owner: ve solo su propio consumo
- Selector de período flexible: hoy, 7 días, 30 días, mes, rango personalizado
- Sistema de límites de gasto: por defecto sin límite
- Alertas configurables al 80% y 100% del límite (cuando se defina)
- Infraestructura lista para membresías futuras

### Super Admin Panel (nuevo)

- Panel exclusivo para owner de MorfX (tú)
- Configuraciones por workspace:
  - Categorías de templates habilitadas
  - Variables dinámicas en quick replies
  - Categorías en quick replies
  - Límites de gasto
- Dashboard consolidado de costos de todos los workspaces

### Claude's Discretion

- Estructura de la tabla de templates (campos exactos)
- UI del template builder (formulario de creación)
- Algoritmo de round-robin para asignación en equipo
- Diseño del panel de configuración de equipos
- Formato exacto del dashboard de costos
- Implementación técnica de límites y alertas

</decisions>

<specifics>
## Specific Ideas

- El flujo de template debe ser familiar: lista → crear → enviar a Meta → esperar aprobación → usar
- Los equipos funcionan como "departamentos" — un agente puede estar en varios equipos
- El atajo '/' para quick replies es estilo Slack/Discord — muy conocido
- Los costos deben ser claros para hacer pass-through billing a clientes

</specifics>

<deferred>
## Deferred Ideas

- Horarios de disponibilidad por agente (por ahora solo toggle manual)
- Quick replies personales por agente (por ahora solo workspace)
- Bots y automatización (no es parte de esta fase ni del MVP)
- Múltiples números de WhatsApp con ruteo por número (futuro)

</deferred>

---

*Phase: 08-whatsapp-extended*
*Context gathered: 2026-01-31*
