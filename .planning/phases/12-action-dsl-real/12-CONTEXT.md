# Phase 12: Action DSL Real - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Conectar los handlers placeholder del Action DSL (Phase 3) con operaciones reales de CRM y WhatsApp. Los tools pasan de retornar `{ success: true, data: "placeholder" }` a ejecutar operaciones reales en Supabase y 360dialog. No se agregan tools nuevos ni se modifica la UI — esta fase es puramente backend/infraestructura.

</domain>

<decisions>
## Implementation Decisions

### Contrato de respuesta
- Respuesta exitosa incluye recurso completo (contacto creado con todos los campos, pedido con productos, etc.) — el agente puede usar los datos sin query adicional
- Errores incluyen tipo + codigo + mensaje humano + sugerencia de accion (ej: "telefono duplicado, use crm.find_contact primero")
- Estructura base comun para todos los tools, pero cada dominio puede agregar campos especificos (ej: WhatsApp incluye `message_id` de 360dialog, CRM incluye `resource_url`)
- API externa vs invocacion interna: Claude's discretion

### Manejo de errores
- Fallo inmediato: el handler NO reintenta. Retorna error al agente y el agente decide si reintentar
- Rollback automatico: si una operacion compuesta falla a mitad (ej: create_order falla despues de crear contacto), se revierte todo. Operacion atomica con transacciones
- Clasificacion de errores: tipo (`validation_error`, `not_found`, `external_api_error`, `permission_denied`, etc.) + flag `retryable` (boolean). El agente tiene maximo contexto
- Servicio externo caido (360dialog): fallo claro e inmediato. Error: "WhatsApp no disponible". Sin cola diferida

### Logging forense
- Detalle completo: input completo, output completo, duracion, errores, stack trace, metadata del caller (agente, sesion, usuario)
- Por ahora solo en DB (Supabase) — no hay UI de logs en esta fase. Pero se estructura para que sea facil construir UI despues (canvas de robots, sandbox en Phase 15)
- Retencion indefinida — todo se guarda siempre para auditoria a largo plazo
- Trazabilidad obligatoria: cada log tiene `agent_session_id` (NOT NULL cuando lo invoca un agente). Permite reconstruir toda la conversacion del agente con sus tool calls

### Comportamiento de ejecucion
- Timeouts por dominio: CRM tools timeout corto (operaciones DB), WhatsApp tools timeout mas largo (API externa). Configurable
- Rate limiting basico: limite de tool calls por minuto por workspace, configurable por workspace. Un negocio grande puede tener limite mas alto. Proteccion contra loops infinitos de agentes con bugs
- Tools atomicos: un tool NO puede invocar otro tool internamente. El agente es quien orquesta la secuencia. Cada tool hace UNA cosa
- Sync vs async: Claude's discretion

### Claude's Discretion
- Formato exacto del wrapper de respuesta (API externa vs interna)
- Sync vs async para la ejecucion de tools
- Valores default de timeout por dominio
- Valor default de rate limit por workspace
- Estructura exacta de la tabla de logs (columnas, indices)

</decisions>

<specifics>
## Specific Ideas

- "Que se guarde todo para que luego si creamos algun tipo de canvas para los robots sea facil de ver" — logs estructurados pensando en visualizacion futura
- Rate limit configurable por workspace porque "en el futuro podemos tener negocios que hagan muchas acciones por minuto"
- Tools atomicos para mantener orquestacion en el agente, no en los tools

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-action-dsl-real*
*Context gathered: 2026-02-05*
