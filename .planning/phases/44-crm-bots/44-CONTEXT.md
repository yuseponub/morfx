# Phase 44: CRM Bots (Read + Write) — Context

**Gathered:** 2026-04-15
**Status:** Ready for research

<domain>
## Phase Boundary

Dos agentes AI independientes expuestos como API interna para ser invocados por otros agentes (tool providers):

- **crm-reader** — solo lectura sobre contactos, pedidos, pipelines/stages, tags
- **crm-writer** — solo escritura (create/update/archive) sobre contactos, pedidos, notas, tareas

Aislamiento estricto por construcción: son dos codebases separados con tool registries separados. El reader jamás puede mutar; el writer tiene su propio endpoint, auth y audit log.

**NO entra en esta fase (explícito):**
- UI humana (chat para que personas los usen directamente). Solo API.
- Tools de WhatsApp (enviar mensajes, leer conversaciones).
- Toggle de bots agente (Somnio/GoDentist/Recompra) por conversación.
- Disparar robots de logística (Coordinadora/OCR/Guias PDF).
- Crear/editar automatizaciones ni ejecutarlas manualmente.
- Crear recursos base nuevos (tags, pipelines, stages, templates, users) — respeto estricto de `agent-scope.md`.
- Borrado real de entidades — solo archivar/cerrar.

</domain>

<decisions>
## Implementation Decisions

### Arquitectura — separación física
- **Dos carpetas separadas:** `src/lib/agents/crm-reader/` y `src/lib/agents/crm-writer/`
- Cada carpeta con su propio system prompt, tool registry, config y entry point
- Aislamiento por construcción: el reader literalmente no importa los tool handlers de escritura — imposible que los ejecute
- Consistente con patrón existente del repo (Somnio V3, GoDentist, Recompra viven en carpetas independientes)
- No se usa "un agente con modo toggled" — descartado explícitamente por el riesgo de que un filtro runtime falle

### Agent IDs y sesiones
- Dos `agent_id` distintos: `crm-reader` y `crm-writer`
- `agent_sessions` separadas por bot → métricas, observability turns y prompt_versions aisladas por bot
- Cada uno registra su propio flujo independiente en observability (Phase 42.1)

### Modelo LLM
- Ambos bots usan **Claude Sonnet 4.5** (`claude-sonnet-4-5`)
- Sin diferenciación por costo — se prioriza calidad uniforme sobre ahorro en el reader

### Reader — superficie de lectura
Scope acotado a "core CRM" — explícitamente excluye WhatsApp, logística, automatizaciones y analytics:
- **Contactos:** search (por teléfono, email, nombre), get by id, listar tags y custom fields, historial
- **Pedidos:** list (filtros: pipeline, stage, status, fechas, cliente), get by id, ver items y totales
- **Pipelines & stages:** listar pipelines del workspace, listar stages de cada pipeline
- **Tags:** listar tags disponibles, obtener entidades con un tag

### Writer — superficie de escritura
Scope acotado a "data entry puro" sobre las 4 entidades core:
- **Contactos:** crear, editar campos (incluyendo asignar tags existentes y custom fields), archivar
- **Pedidos:** crear, editar, mover stage (dentro de un pipeline), actualizar items, archivar/cerrar
- **Notas:** crear, editar (no borrar real; marcar archivada)
- **Tareas:** crear, editar, completar, archivar

**Explícitamente NO hace:**
- Enviar mensajes WhatsApp (ni libres ni templates)
- Prender/apagar bots agente en conversaciones
- Disparar robots de Coordinadora/OCR/Guias
- Crear/editar/ejecutar automatizaciones
- DELETE real en ninguna entidad

### Scope estricto — agent-scope.md
El writer **NUNCA** crea recursos base:
- No crea tags nuevos (solo asigna existentes)
- No crea pipelines ni stages nuevos (solo mueve a existentes)
- No crea templates, users ni automatizaciones
- Si falta un recurso requerido, el tool retorna un error estructurado: `{ error: 'resource_not_found', resource_type, suggested_action: 'create manually in UI' }` para que el caller (agente externo) lo reporte
- Este comportamiento debe aparecer explícitamente en el system prompt del writer

### Delete policy
- El writer NO ejecuta DELETE real en contactos ni pedidos
- Puede mover pedidos a stage "cerrado/archivado" según convención del workspace
- Puede marcar notas/tareas como completadas/archivadas
- Borrados reales quedan exclusivos de la UI humana del CRM

### Invocación — API-only en V1
- **Sin UI humana** (no hay chat propio, no se expone en sandbox, no hay páginas nuevas)
- Ambos bots se exponen como endpoints HTTP — un endpoint por bot
- Pattern coherente con `/api/v1/tools` existente en el repo (si aplica reutilizar esa infra)
- Callers esperados V1: otros agentes AI externos / internos que necesiten consultar o mutar datos del CRM
- UI humana diferida a fase futura — se diseñará con casos de uso reales una vez los agentes callers estén integrados

### Persistencia — acciones, no conversaciones
- **NO se guardan las conversaciones** entre el caller y el bot (no hay "historial de chat")
- **SÍ se guarda un historial completo de ACCIONES ejecutadas por el writer**
- Cada tool call de escritura queda registrado con: `agent_id`, `invoker` (caller), `workspace_id`, `tool_name`, `input_params`, `output`, `success/error`, `timestamp`, `action_id`
- Lectura pura del reader también se registra para observability (para medir uso), pero con menor granularidad

### Audit log — tabla nueva dedicada
- **Tabla nueva:** `crm_bot_actions` (nombre final a decidir en research/plan)
- Alimentada por el collector de Phase 42.1 (reusar infraestructura de observability existente)
- Queries separadas de los turns de Somnio/GoDentist — no se mezcla a nivel de DB
- Debe permitir consultar retroactivamente qué hizo el bot en un workspace (filtro por tiempo, tool, caller)
- Incluir campo `status`: `proposed | confirmed | executed | failed | expired` para soportar two-step flow (ver abajo)

### Autenticación
- **API key per-workspace** — cada workspace genera/rota sus propias keys
- Headers esperados: `x-api-key` (auth) + `x-workspace-id` (scope)
- Coherente con patrón `/api/v1/tools` ya existente en el repo
- Key tiene scope limitado al workspace que la emite — una key no puede operar en otro workspace

### Two-step write flow — propose + confirm
Todas las mutaciones del writer siguen este patrón en dos pasos:

1. **Propose:** caller llama al tool con sus parámetros → bot valida + computa el efecto (qué se va a crear/modificar/archivar) y **retorna `action_id` + preview del efecto SIN ejecutar la mutación**. La fila se inserta en `crm_bot_actions` con `status='proposed'`.
2. **Confirm:** caller revisa el preview (si quiere) y llama `confirmAction(action_id)` en un request separado → bot ejecuta la mutación real (vía domain layer) y cambia `status='executed'`.

Reglas adicionales:
- Acciones `proposed` expiran automáticamente (ej: TTL de 5 min) → `status='expired'`, no se pueden confirmar después
- El `action_id` es único e idempotente — reintentar confirmAction sobre uno ya ejecutado retorna el resultado anterior, no re-ejecuta
- Si la validación del propose falla (recurso no existe, permisos, etc.) retorna error directo sin crear fila en la tabla (o con `status='failed'`)
- Las lecturas del reader NO usan two-step — son directas

### Rate limits y kill-switch
- **Rate limit corto:** 50 calls/minuto por workspace (configurable via env var, subir en el futuro sin redeploy)
  - Objetivo: detectar runaway loops rápido (agente caller en bucle) antes de que acumule daño
  - No hay cap diario en V1 — el objetivo es detectar loops, no limitar volumen legítimo
- **Kill-switch global:** env var tipo `CRM_BOT_ENABLED=false` apaga ambos bots instantáneamente sin redeploy
- **Alerta por email:** cuando un workspace se aproxime al rate limit (ej: >80% del cap en una ventana) → email a `joseromerorincon041100@gmail.com` con workspace, caller, tool, volumen
- También alerta cuando se hit el cap
- Alertas via Supabase Edge Function / Resend / SendGrid (definir en research)

### Claude's Discretion
- **Nombre exacto de la tabla de audit log** (`crm_bot_actions` vs `bot_actions` vs otro)
- **Schema exacto del endpoint HTTP** (REST vs RPC-style, estructura de request/response)
- **Formato exacto del preview que retorna `propose`** (JSON plano vs diff vs before/after)
- **TTL exacto de acciones proposed** (sugerencia: 5 min)
- **Mecanismo de envío de email de alerta** (servicio, template, frecuencia de deduplicación)
- **Reuso vs extensión de `/api/v1/tools`** existente — Claude evalúa en research si ya tiene la infra o hay que crear /api/v1/crm-bots/{reader,writer}
- **Tool list exacta** — se deriva del scope declarado; Claude identifica en research qué funciones del domain layer existen y cuáles requieren crear como helpers

</decisions>

<specifics>
## Specific Ideas

- El patrón "separar agentes en carpetas propias" ya se usa en Somnio V3, GoDentist y Recompra — seguir ese molde al pie de la letra para consistencia del repo
- El two-step flow (propose/confirm) es el mecanismo de seguridad principal — es más seguro que confiar en el caller ya que cualquier bug del caller igual tiene que pasar dos requests distintos para mutar
- El rate limit de 50/min es deliberadamente bajo para V1 — filosofía: empezar estricto, relajar con datos reales
- El bot NUNCA crea recursos base (tags, pipelines, etc.) — respeto a `agent-scope.md`. Si un tool necesita un tag inexistente, falla con mensaje claro para que el caller escale al humano

</specifics>

<deferred>
## Deferred Ideas

- **UI humana (chat)** para que personas usen los bots directamente — fase futura una vez validada la API
- **Tools de WhatsApp** (enviar mensajes, leer conversaciones) en el writer — fase futura dedicada a "bot de conversación"
- **Toggle de bots agente** (prender/apagar Somnio/GoDentist por conversación) — fase futura
- **Tools de logística** (disparar robots, consultar jobs) en ambos bots — fase futura
- **Tools de automatizaciones** (crear/editar/ejecutar) — fase futura
- **DELETE real** de entidades — por ahora solo archivar. Si surge necesidad real, fase futura con safeguards
- **Analytics agregados** en el reader (counts, conversiones, tiempos) — fase futura una vez definidas métricas clave
- **Cap diario de acciones** — V1 sin cap diario; agregarlo si aparece abuso
- **Per-tool granular permissions** (qué caller puede llamar qué tool) — V1 usa una sola API key con todo el scope; granularidad fina queda para fase futura

</deferred>

---

*Phase: 44-crm-bots*
*Context gathered: 2026-04-15*
