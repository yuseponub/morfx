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
  - `somnio-sales-v3-pw-confirmation` (Phase standalone `somnio-sales-v3-pw-confirmation`, shipped 2026-04-28 con activación diferida — sin regla en `routing_rules` = sin tráfico):
    - Invoca `processReaderMessage(...)` desde la funcion Inngest `pw-confirmation-preload-and-invoke` (`src/inngest/functions/pw-confirmation-preload-and-invoke.ts`) al crear sesion — **BLOQUEANTE** (a diferencia de recompra non-blocking): el webhook responde 200 inmediato pero el dispatch corre primero el reader y luego invoca al agente con contexto ya en sesion (sin polling).
    - Invoker propagado: el dispatch + function pasan `invoker: 'somnio-sales-v3-pw-confirmation'` → reader loggea este valor.
    - Workspace isolation: `workspaceId` del event validado contra el workspace del session_state; reader filtra queries por workspace (Regla 3).
    - Feature flag: NO HAY feature flag — la activacion del agente `somnio-sales-v3-pw-confirmation` se controla 100% via routing rules (D-02). Sin regla activa en `routing_rules` que mencione el agent_id = sin trafico = aislamiento total (Regla 6 satisfecha sin flag).
    - Escribe `_v3:crm_context` + `_v3:crm_context_status` + `_v3:active_order` (JSON estructurado del pedido en NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR) a `session_state.datos_capturados` via `SessionManager.updateCapturedData`.
    - Observability: emite eventos `pipeline_decision:crm_reader_dispatched` (webhook), `crm_reader_completed` / `crm_reader_failed` (Inngest function), `crm_context_used` / `crm_context_missing_proceeding_blind` (agente).
    - Timeout: 25s inner AbortController (mas amplio que recompra) — D-05 bloqueante asume latencia 5-30s aceptable post-purchase.
    - Retries: 1; concurrency: 1 por `event.data.sessionId`.
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

### Somnio Recompra Agent (`somnio-recompra-v1` — webhook WhatsApp inbound)
- **PUEDE:**
  - Responder a clientes que reagendan/recompran ELIXIR DEL SUEÑO via WhatsApp.
  - Emitir templates del catalogo propio bajo `agent_id='somnio-recompra-v1'` (`INFORMATIONAL_INTENTS`: saludo, precio, promociones, pago, envio, ubicacion, contraindicaciones, dependencia, tiempo_entrega, registro_sanitario) + sales actions templates (resumen_*, confirmacion_orden_*, preguntar_direccion_recompra, pendiente_*, no_interesa, rechazar, retoma_inicial).
  - Crear pedido en CRM Somnio via `crear_orden` sales action (call a domain `orders.createOrder`).
  - Preguntar confirmacion de direccion antes de promos cuando el cliente dice "quiero comprar" (D-04 somnio-recompra-template-catalog).
- **NO PUEDE:**
  - Compartir catalogo con `somnio-sales-v3` — catalogo independiente bajo `agent_id='somnio-recompra-v1'` desde 2026-04-23 (phase `somnio-recompra-template-catalog`). Fix provisional commit `cdc06d9` revertido.
  - Auto-disparar promos en saludo inicial (D-05): `saludo` cae al fallback null de `resolveTransition` y response-track lo maneja como informational (texto CORE + imagen ELIXIR COMPLEMENTARIA). NO genera accion `ofrecer_promos`.
  - Acceder a templates de otros agentes (sales-v3, godentist, etc.).
  - Escribir en tablas fuera del scope Somnio workspace (`a3843b3f-c337-4836-92b5-89c58bb98490`).
- **Validacion:**
  - `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` en `src/lib/agents/somnio-recompra/response-track.ts:36` (locked post phase 2026-04-23).
  - `{{direccion_completa}}` = `[direccion, ciudad, departamento].filter(Boolean).join(', ')` (D-12).
  - 4 test suites (32 tests) en `src/lib/agents/somnio-recompra/__tests__/` — transitions.test.ts + response-track.test.ts cubren D-03/D-04/D-05/D-06/D-12.
  - Agent ID registrado: `'somnio-recompra-v1'` (sessions, observability, rate-limit, templates).
- **Consumidor upstream:** Inngest function `recompra-preload-context` (`crm-reader` via agent-to-agent in-process) — ver seccion CRM Reader Bot §Consumidores.

### Somnio Sales v3 PW-Confirmation Agent (`somnio-sales-v3-pw-confirmation` — webhook WhatsApp inbound, post-purchase)
- **PUEDE:**
  - Responder a clientes Somnio con pedido activo en stages `NUEVO PAG WEB` / `FALTA INFO` / `FALTA CONFIRMAR` (D-04, pipeline `Ventas Somnio Standard`). Workspace target: Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`).
  - Emitir templates del catalogo propio bajo `agent_id='somnio-sales-v3-pw-confirmation'` (D-15): informacionales clonados verbatim de sales-v3 (saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario, tiempo_entrega_*) + sales reestructurados post-compra (confirmacion_orden_*, pedir_datos_post_compra, confirmar_direccion_post_compra, agendar_pregunta, claro_que_si_esperamos, cancelado_handoff, fallback, error_carga_pedido).
  - Invocar **CRM reader** al crear sesion de forma **BLOQUEANTE** (D-05) — patron NUEVO en codebase: webhook responde 200 inmediato, dispatch Inngest 2-step (`pw-confirmation/preload-and-invoke`) primero corre el reader y luego invoca al agente con contexto ya en sesion (sin polling). Diferencia clave vs recompra que es non-blocking.
  - Invocar **CRM writer** (`crm-writer.proposeAction + confirmAction` via adapter `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts`) para:
    - `updateOrder({ shippingAddress, shippingCity, shippingDepartment })` — actualizar direccion del pedido (D-12).
    - `moveOrderToStage(orderId, CONFIRMADO_UUID)` — confirmar pedido (D-10).
    - `moveOrderToStage(orderId, FALTA_CONFIRMAR_UUID)` — cliente pide tiempo (D-14).
  - Detectar handoff a humano (D-21 stub) — NO mutacion CRM, solo emite evento `pipeline_decision:handoff_triggered` + flag `requires_human=true` en sesion (no hay tool real `handoff_human` todavia, se construye en standalone futuro).
- **NO PUEDE:**
  - Operar fuera del workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) (D-19).
  - Compartir catalogo de templates con `somnio-sales-v3` u otros agentes — catalogo independiente bajo `agent_id='somnio-sales-v3-pw-confirmation'` desde shipped (D-15, leccion recompra-template-catalog 2026-04-23).
  - Crear pedidos nuevos (`crm.order.create` excluido del set de tools del agente `somnio-sales-v3-pw-confirmation` — scope sales-v3) (D-18, D-20).
  - Mutar pedidos directamente sin pasar por crm-writer (Regla 3 — toda mutacion via `proposeAction + confirmAction` → domain layer).
  - Crear/editar tags, pipelines, stages, templates, usuarios (recursos base — D-18).
  - Acceder a templates de otros agentes (D-18).
  - Mover pedidos a stages fuera de los 4 contemplados (`NUEVO PAG WEB`, `FALTA INFO`, `FALTA CONFIRMAR`, `CONFIRMADO`) — explicitamente prohibido alcanzar `REPARTO` / `ENTREGADO` / `DEVOLUCION` / etc. (D-18).
  - Editar items del pedido (`updateOrder.products`) en V1 — D-13 deferred a V1.1, en V1 escala a handoff humano si cliente pide.
  - Auto-crear regla en `routing_rules` — la activacion del agente la hace el usuario manualmente desde `/agentes/routing-editor` (D-02).
- **Validacion:**
  - `SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const` literal en `src/lib/agents/somnio-pw-confirmation/config.ts` (LOCKED por D-01).
  - Tool handlers del agente (cuando existan tools AI SDK en V1.1) importaran EXCLUSIVAMENTE desde `@/lib/agents/crm-writer/two-step.ts` (`proposeAction + confirmAction`) y `@/lib/agents/crm-reader` (`processReaderMessage`) — CERO `createAdminClient` directo en `src/lib/agents/somnio-pw-confirmation/**` (Regla 3).
  - Adapter `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts` (creado en standalone Plan 10) es el UNICO archivo del agente `somnio-sales-v3-pw-confirmation` que invoca `proposeAction + confirmAction` — wraps con scope acotado a las 3 operaciones (updateOrder shipping, moveOrderToStage CONFIRMADO/FALTA_CONFIRMAR).
  - State-machine pura (D-25) — sin AI SDK loop / generateText / streamText / tool-calling. Comprehension via single Haiku call (clonado de recompra/v3 pattern).
  - Estado inicial de la maquina = `'awaiting_confirmation'` tras CRM reader (D-26) — el guard de "si" del cliente NO consulta `messages.template_name` sino el estado de la maquina.
  - Agent ID registrado: `'somnio-sales-v3-pw-confirmation'` en `agentRegistry`; observability agentId mismo valor; rate-limit bucket compartido con recompra/v3 si aplica. El `agent_id='somnio-sales-v3-pw-confirmation'` aparece como opcion en el dropdown del routing-editor (D-02).
  - **Error contract `stage_changed_concurrently` (Standalone `crm-stage-integrity`, D-06):** cuando el adapter recibe este error de `confirmAction`, propaga al agent loop que decide handoff humano (D-21 trigger c) — NO reintenta automaticamente.
- **Consumidor upstream:** Inngest function `pw-confirmation-preload-and-invoke` (`crm-reader` + agente PW via agent-to-agent in-process) — ver seccion CRM Reader Bot §Consumidores. Webhook `webhook-processor.ts` dispatcha el event `pw-confirmation/preload-and-invoke` cuando el routing decide `agent_id='somnio-sales-v3-pw-confirmation'`.
- **Consumidor downstream:** CRM Writer Bot — el agente invoca `proposeAction + confirmAction` directo (in-process). Workspace isolation via headers no aplica (in-process); el adapter pasa `workspaceId` explicitamente al domain layer.

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
