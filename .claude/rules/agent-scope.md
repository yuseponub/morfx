# REGLA DE SCOPE DE AGENTES

## Principio

Cada agente AI (builder, sandbox, etc.) SOLO puede operar dentro de su modulo asignado.
Un agente NO puede crear, modificar ni eliminar recursos fuera de su scope.

## Regla General

Cuando un agente necesita un recurso que NO existe (tag, pipeline, etapa, template, contacto, pedido, etc.):
1. **ADVERTIR** al usuario que el recurso no existe
2. **NUNCA** crearlo automaticamente
3. **SUGERIR** que el usuario lo cree manualmente desde el modulo correspondiente
4. **BLOQUEAR** la operacion hasta que el recurso exista

## Scopes por Agente

### AI Automation Builder (`/automatizaciones/builder`)
- **PUEDE:** Crear, modificar, clonar y explicar automatizaciones
- **NO PUEDE:** Crear tags, pipelines, etapas, templates de WhatsApp, contactos, pedidos, tareas, usuarios
- **Validacion:** Antes de referenciar un recurso en una automatizacion, verificar que existe en el workspace

### Sandbox / Agentes CRM (`/sandbox`, `/agentes`)
- **PUEDE:** Ejecutar herramientas definidas en su tool set
- **NO PUEDE:** Salirse de las herramientas asignadas ni crear recursos de otros modulos

### CRM Reader Bot (`crm-reader` — API `/api/v1/crm-bots/reader`)
- **PUEDE (solo lectura):**
  - `contacts_search` / `contacts_get` — buscar y leer contactos (tags, custom fields, archivados via flag)
  - `orders_list` / `orders_get` — listar y leer pedidos con items
  - `pipelines_list` / `stages_list` — listar pipelines y etapas del workspace
  - `tags_list` — listar tags y entidades asociadas
- **NO PUEDE:**
  - Mutar NADA (crear/editar/archivar/eliminar contactos, pedidos, notas, tareas, tags, pipelines, etapas, templates, usuarios)
  - Enviar mensajes de WhatsApp
  - Inventar recursos inexistentes (retorna `not_found_in_workspace`)
  - Acceder a otros workspaces (workspace_id viene del header `x-workspace-id` set por middleware — nunca del body)
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/crm-reader/tools/**` (BLOCKER 1 Phase 44)
  - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
  - Agent ID registrado: `'crm-reader'` en `agentRegistry`; observability agentId mismo valor; rate-limit bucket `'crm-bot'` compartido con writer
- **Consumidores in-process documentados:**
  - `somnio-recompra-v1` (Phase standalone `somnio-recompra-crm-reader`, shipped 2026-04-21):
    - Invoca `processReaderMessage(...)` desde la funcion Inngest `recompra-preload-context` (`src/inngest/functions/recompra-preload-context.ts`) al crear sesion nueva de recompra.
    - Invoker propagado: el dispatch webhook-processor + function pasan `invoker: 'somnio-recompra-v1'` → reader loggea este valor.
    - Workspace isolation: `workspaceId` del event validado contra el workspace del session_state; reader filtra queries por workspace como de costumbre (Regla 3).
    - Feature flag: `platform_config.somnio_recompra_crm_reader_enabled` (default `false`, flip manual via SQL — Regla 6).
    - Escribe `_v3:crm_context` + `_v3:crm_context_status` a `session_state.datos_capturados` via `SessionManager.updateCapturedData` (merge-safe).
    - Observability: emite 5 eventos `pipeline_decision:*` (`crm_reader_dispatched`, `crm_reader_completed`, `crm_reader_failed`, `crm_context_used`, `crm_context_missing_after_wait`).
    - Timeout: 12s inner AbortController; retries=1; concurrency=1 por `event.data.sessionId`.
    - Consumo HTTP: NO (invocacion in-process dentro del mismo Vercel deployment).

### CRM Writer Bot (`crm-writer` — API `/api/v1/crm-bots/writer/propose` + `/confirm`)
- **PUEDE (via two-step propose→confirm obligatorio):**
  - Contactos: crear, actualizar, archivar (soft-delete via `archived_at`)
  - Pedidos: crear, actualizar, archivar, cerrar (NO DELETE real)
  - Notas: crear, archivar (contact_notes + order_notes)
  - Tareas: crear, actualizar, completar (via updateTask con `completed_at`)
- **NO PUEDE:**
  - Crear/editar recursos base: tags, pipelines, stages, templates de WhatsApp, usuarios — retorna `resource_not_found` + sugiere al usuario crear manualmente
  - Ejecutar DELETE real contra ninguna tabla — solo soft-delete via campos `archived_at` / `completed_at`
  - Enviar mensajes de WhatsApp directamente
  - Mutar sin pasar por `proposeAction` — tools NUNCA llaman domain write funcs en `execute()`; solo llaman `proposeAction` que persiste en `crm_bot_actions` con status='proposed'
  - Mutar tras TTL de 5min (Inngest cron `crm-bot-expire-proposals` marca como 'expired' con 30s grace)
  - Acceder a otros workspaces (workspace_id SOLO del header `x-workspace-id`)
  - Retry implicito tras `stage_changed_concurrently` (Standalone `crm-stage-integrity`, D-06). La decision de re-proponer la mutacion es del agent loop / usuario — el writer mechanic (two-step propose → confirm) no intenta reintentos automaticos. Comportamiento esperado: el `confirm` devuelve `status: 'failed'` + `error: { code: 'stage_changed_concurrently' }`; el caller decide que hacer (propose de nuevo con fresh state via reader o escalar al usuario).
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` para existence pre-checks (getContactById, getOrderById, getTagById, getPipelineById, getStageById) — cero `createAdminClient` en `src/lib/agents/crm-writer/tools/**` (BLOCKER 1 Phase 44)
  - `src/lib/agents/crm-writer/two-step.ts` es el UNICO archivo del agent que usa `createAdminClient`, y solo contra tabla `crm_bot_actions` (propose insert + confirm optimistic UPDATE)
  - Idempotencia por `optimistic UPDATE WHERE status='proposed' AND id=?` — segundo confirm retorna `already_executed` sin re-mutar (Pitfall 3 Phase 44)
  - `ResourceNotFoundError.resource_type` cubre union completa: `tag | pipeline | stage | template | user | contact | order | note | task` (BLOCKER 4 Phase 44)
  - Agent ID registrado: `'crm-writer'`; rate-limit bucket `'crm-bot'` compartido con reader
  - **Error contract `stage_changed_concurrently` (Standalone `crm-stage-integrity`, D-06):** cuando `domain.moveOrderToStage` retorna este error (CAS reject — otra fuente movio el pedido entre el SELECT y el UPDATE serializado), el writer lo persiste verbatim en `crm_bot_actions.error.code`. La sandbox UI lo consume para mostrar toast "pedido stale / movido por otra fuente". NO convertir a mensaje generico; NO mapear a `not_found`. La integridad del error code es parte del contract con consumidores (UI + agent loop + observability).

### Config Builder: WhatsApp Templates (`config-builder-whatsapp-templates` — UI `/configuracion/whatsapp/templates/builder`)
- **PUEDE:**
  - Crear templates de WhatsApp (SOLO via domain `createTemplate` en `src/lib/domain/whatsapp-templates.ts`)
  - Subir imagenes de header al bucket `whatsapp-media` path `templates/{workspaceId}/{timestamp}_{safeName}`
  - Consultar templates existentes (solo lectura, para detectar duplicados y cooldown de 30 dias)
  - Sugerir categoria (MARKETING / UTILITY / AUTHENTICATION), idioma (es / es_CO / en_US) y mapping de variables
- **NO PUEDE:**
  - Editar o eliminar templates ya creados (limitacion Meta: solo se elimina y recrea)
  - Crear/editar tags, pipelines, etapas, contactos, pedidos, tareas, usuarios, templates de otro modulo
  - Enviar mensajes de WhatsApp directamente (SEND no se toca — D-16/D-17)
  - Ejecutar `createTemplate360()` o `supabase.from('whatsapp_templates').insert()` sin pasar por domain (Regla 3)
  - Acceder a otros workspaces (workspace_id viene del cookie `morfx_workspace` validado en route handler, nunca del body)
- **Validacion:**
  - Tool `submitTemplate.execute` llama EXCLUSIVAMENTE a `createTemplate` del domain; CERO `createAdminClient` + `insert` directo en `src/lib/config-builder/templates/tools.ts` (verificable con grep)
  - System prompt `buildTemplatesSystemPrompt` incluye lista textual de PUEDE / NO PUEDE y prohibicion explicita de crear recursos fuera del scope
  - Agent ID registrado: `'config-builder-whatsapp-templates'`
  - stopWhen: `stepCountIs(6)` — ciclo maximo list -> draft -> preview -> validate -> upload -> submit

## OBLIGATORIO al Crear un Agente Nuevo

Cuando se programe CUALQUIER agente nuevo en el sistema, se DEBE:

1. **Definir scope explicitamente** antes de escribir codigo:
   - Listar que modulos/tablas PUEDE tocar
   - Listar que modulos/tablas NO PUEDE tocar
   - Agregar el scope a esta seccion "Scopes por Agente"

2. **System prompt DEBE incluir**:
   - Scope explicito: "Tu scope es [modulo]. No operes fuera de el."
   - Instruccion: "Si un recurso no existe, avisa al usuario. NUNCA lo crees automaticamente."
   - Lista de PUEDE y NO PUEDE

3. **Tool definitions DEBEN**:
   - Solo exponer tools relevantes al scope del agente
   - No incluir herramientas de creacion de recursos externos
   - Validar workspace_id en CADA query

4. **Verificacion en code review**:
   - Confirmar que ningun tool handler escribe fuera del scope
   - Confirmar que las queries NO hacen INSERT/UPDATE en tablas fuera del modulo
   - Confirmar que el system prompt documenta las restricciones

**BLOQUEANTE:** No se puede mergear un agente nuevo sin scope definido en este archivo.
