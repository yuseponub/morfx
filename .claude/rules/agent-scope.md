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

### Module Scope: crm-query-tools (`src/lib/agents/shared/crm-query-tools/`)
Shared read-only query tools any conversational agent can register. NOT an agent itself.
Full PUEDE / NO PUEDE / Validation / Consumers in `.claude/skills/crm-query-tools.md`.
UI de configuracion: `/agentes/crm-tools`.
Standalone: `.planning/standalone/crm-query-tools/` (shipped 2026-04-29).

### Module Scope: crm-mutation-tools (`src/lib/agents/shared/crm-mutation-tools/`)
Shared mutation tools any conversational agent can register. NOT an agent itself.
Full PUEDE / NO PUEDE / Validation / Consumers / Idempotency / Coexistence with crm-writer in `.claude/skills/crm-mutation-tools.md`.
Standalone: `.planning/standalone/crm-mutation-tools/` (shipped 2026-04-29).

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

### Godentist FB/IG Sibling Agent (`godentist-fb-ig` — webhook FB/IG inbound)
- **PUEDE:**
  - Atender mensajes inbound de Facebook Messenger (`channel='facebook'`) e Instagram Direct (`channel='instagram'`) en el workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` ("GoDentist Valoraciones") (D-01 + D-02).
  - Emitir templates del catalogo propio bajo `agent_id='godentist-fb-ig'` (79 rows en `agent_templates`, locked Plan 07 APPLY-EVIDENCE 2026-05-05):
    - Saludo D-05 lead-capture (pide nombre+celular upfront + disclaimer Habeas Data inline conforme Ley 1581/2011) — UNICO cambio vs godentist.
    - ~78 templates clonados verbatim del godentist (precios, sedes, escape, follow-ups, english_response, etc.).
  - Procesar primer mensaje del cliente (turn 1) con LEAD CAPTURE (D-09):
    - Si Haiku clasifica `intent='datos'` + datos parciales → directo a `pedir_datos_parcial` con `{{campos_faltantes}}` (via helper puro `lead-capture.ts`).
    - Si datos criticos completos (nombre + celular + sede) → directo a `pedir_fecha`.
    - Si turn 1 + intent informational (ej: "cuanto cuestan los brackets?") → sales-track normal (D-07 reusa logica retomas existentes).
  - Consultar disponibilidad real en Dentos via robot Railway compartido — `dentos-availability.ts` clonado verbatim (mismo robot `godentist-production.up.railway.app`, mismas credenciales, mismo workspace string `'godentist-valoraciones'` literal hardcoded — Q3 RESUELTA Wave 0).
  - Recibir tag `VAL` automaticamente al completar datos criticos (Pitfall 6 mitigated en `v3-production-runner.ts:597` — extension del check `agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'`). Los leads FB/IG cuentan en metricas igual que los WhatsApp.
- **NO PUEDE:**
  - Atender otros canales (web chat, WhatsApp del workspace target, etc.) — D-01; si surgen requieren standalone separado.
  - Operar fuera del workspace target `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` — D-02; routing rule del usuario lo acota.
  - Compartir catalog con godentist — D-08; tiene su propio `TEMPLATE_LOOKUP_AGENT_ID` constant en `response-track.ts`. Anti-regresion del fix provisional `cdc06d9` revertido en somnio-recompra (Pitfall 1).
  - Detectar nuevo intent `consentimiento_habeas` — D-10; el consentimiento es implicito al enviar datos (D-06).
  - Cambiar modelo de comprehension — D-12; siempre Haiku (variable confusa para debug).
  - Modificar el state machine de godentist — D-13; reusa `validTransitions` verbatim (cero deuda de schema).
  - Activarse automaticamente — D-14; SIN feature flag, requiere routing rule manual del usuario en `/agentes/routing/editor` (D-15).
  - Auto-crear su routing rule — D-15; el operador la crea con priority slot libre (Pitfall 4 — UNIQUE INDEX `uq_routing_rules_priority WHERE active=true`).
  - Acceder a templates de otros agentes — D-08.
  - Modificar agente godentist original — D-04; el sibling es ADITIVO. Cualquier cambio que se "filtre" al godentist viola Regla 6.
  - Importar `createAdminClient` o `@supabase/supabase-js` directamente — Regla 3 CLAUDE.md; toda mutacion via `@/lib/domain/*`.
- **Validacion (gates verificables):**
  - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` retorna 0 matches no-comentario.
  - `grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` retorna 0 matches (anti-regresion D-08, Pitfall 1 — el sibling NUNCA referencia la constante del godentist original).
  - `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna >=2 (pre-warm + dispatch — anti-Pitfall 2 / B-001 cold-lambda race).
  - `grep -E "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts` retorna match (anti-Pitfall 6 — VAL tag side-effect cubre ambos agentes).
  - Suite tests: `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` 6 suites + 93/93 tests passed (lock baseline post-Plan 06).
  - DB sanity: `SELECT COUNT(*) FROM agent_templates WHERE agent_id='godentist-fb-ig'` retorna 79 (matches godentist baseline locked Wave 0).
  - DB sanity: saludo D-05 verbatim — `SELECT content FROM agent_templates WHERE agent_id='godentist-fb-ig' AND intent='saludo' AND priority='CORE'` contiene "goBot" + "Habeas Data" + "Ley 1581" (Plan 07 APPLY-EVIDENCE).
  - Project skill descubrible: `src/lib/agent-specs/godentist-fb-ig.md`.
  - Standalone shipped: `.planning/standalone/agent-godentist-fb-ig/` (2026-05-05).
- **Coexistencia con godentist original (D-04):** El agente `godentist` queda **intacto y funcionando** como default para WhatsApp del workspace original. El sibling es ADITIVO. Patron identico a `somnio-sales-v3-pw-confirmation` vs `somnio-sales-v3` (shipped 2026-04-28). Cuando usar cada uno:
  - **godentist:** WhatsApp inbound al workspace original. Saludo conversacional clasico.
  - **godentist-fb-ig:** FB Messenger / Instagram Direct inbound al workspace `f0241182-...` ("GoDentist Valoraciones"). Saludo lead-capture (asegura contacto WhatsApp post-FB/IG donde el cliente puede perderse si no responde despues).
- **Activacion (D-15 manual) — SQL pre-formado:**

  Post-deploy, el operador va a `/agentes/routing/editor` y crea la regla. SQL pre-formado para evitar Pitfall 3 (workspace mismatch) + Pitfall 4 (priority collision):

  ```sql
  -- Pre-check 1: verificar feature flag del lifecycle router activo en el workspace target
  SELECT lifecycle_routing_enabled
  FROM workspace_agent_config
  WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
  -- Esperado: true. Si false:
  -- UPDATE workspace_agent_config SET lifecycle_routing_enabled=true WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514';

  -- Pre-check 2: verificar priority libres
  SELECT priority, name FROM routing_rules
  WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514' AND active=true
  ORDER BY priority;
  -- Wave 0 audit confirmo: 0 active rules en el workspace target → priority 100 libre.

  -- Crear la rule:
  INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
  VALUES (
    'f0241182-f79b-4bc6-b0ed-b5f6eb20c514',
    'GoDentist FB/IG sibling routing',
    'router',
    100,
    jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object('fact', 'channel', 'operator', 'in', 'value', ARRAY['facebook', 'instagram'])
      )
    ),
    jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'godentist-fb-ig')),
    true
  );

  -- Para desactivar (rollback rapido — recovery time <10s tras cache TTL):
  -- UPDATE routing_rules SET active=false
  -- WHERE name='GoDentist FB/IG sibling routing'
  --   AND workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
  ```
- **Consumidores upstream:** webhook FB/IG inbound — `webhook-processor.ts` branch `agentId === 'godentist-fb-ig'` (paralelo al branch `'godentist'` linea 765, dispatch in-process).
- **Consumidores downstream:** TemplateManager (cache propio agent_id) + Anthropic Haiku (comprehension via `runWithPurpose('godentist_fb_ig_comprehension', ...)`) + robot Railway Dentos (compartido con godentist) + VAL tag side-effect runner (`v3-production-runner.ts:597`).

### Module Scope: interruption-system-v2 (`src/lib/agents/interruption-system-v2/`)
Atomic distributed-mutex coordination for the v4 inbound message pipeline. Replaces Phase 31 `hasNewInboundMessage` polling for `somnio-sales-v4` ONLY (D-04 + D-07). v3/godentist/recompra/pw-confirmation paths UNTOUCHED (Regla 6). NOT an agent itself — shared infrastructure module any agent can opt into via the gating in webhook-handler.ts.
- **PUEDE:**
  - `acquireLock(workspaceId, channel, identifier)` — SET NX + holder_uuid (D-02 + D-15). Returns `LockHandle | null`; second concurrent caller gets null and follows the follower path.
  - `releaseLockIfOwner(handle)` — Lua-atomic GET+compare+DEL with `RELEASE_IF_OWNER_LUA` (D-15). Refuses to release if `handle.holderUuid` is not a valid UUID (Security V5 — Lua injection defense).
  - `renewLockTTL(handle)` / `startHeartbeat(handle)` — keep lock alive every `HEARTBEAT_MS=5000` (D-09 layer 2). Heartbeat returns a stop fn; caller MUST invoke in `finally` block (RESEARCH Pitfall 2 — never wrap heartbeat in Inngest step.run).
  - `assertHoldsLock(handle)` — fencing-token re-check at every checkpoint (D-15). Detects TTL-expired-then-stolen + Upstash failover split-brain.
  - `pushToPending` / `removeOwnEntry` / `readAndClearPending` — RPUSH/LREM-by-byte-exact-string/LRANGE+DEL atomic transaction (D-05 + D-16 + D-20 — alphabetical JSON key order is the byte-exact contract).
  - `checkpoint(ckptId, handle, workspaceId, channel, identifier, opts?)` — single-source-of-truth fencing-token check + interrupt detection at 8 D-18 placements. Fail-open on Redis error per Open Question 5 (accept double-response risk for liveness).
  - `emitLockEvent(label, payload)` — typed emitter for 14 D-17-extended labels (LOCK-07 + REVISION B1 `lock_orphan_swept_by_cron`). Dual emission: collector recordEvent + `console.log` with `[interruption-v2]` prefix (D-11).
  - `redis` singleton (Proxy over `@upstash/redis`) — lazy instantiation, fail-fast on missing env vars (D-01). Only `redis-client.ts` instantiates the SDK; the rest of the module consumes the proxy.
  - Inngest cron `v2-lock-cleanup-cron` sweeps orphaned locks every 5min by comparing against `agent_sessions.status='active'` (D-09 layer 3 + LOCK-06 + REVISION B1). Output shape: `{ swept: N, kept: M, active_sessions_checked: P }`.
- **NO PUEDE:**
  - Mutar tablas de negocio (`messages`, `conversations`, `agent_sessions`, `contacts`, `orders`, etc.) — coordina via Redis ONLY. La pipeline real escribe a DB; este módulo solo orquesta exclusión mutua.
  - Enviar mensajes de WhatsApp / FB / IG — el adapter (V4MessagingAdapter) hace el send; este módulo solo decide si el send procede via `shouldAbortBeforeTemplate` (CKPT-7.N).
  - Activarse en agentes ≠ `somnio-sales-v4` — el webhook handler en `src/lib/whatsapp/webhook-handler.ts` filtra por `resolveAgentIdForWorkspace === 'somnio-sales-v4'` (D-04). Aplicar a otro agente requiere standalone follow-up (D-04).
  - Bloquear LLM calls mid-stream con AbortController — solo checkpoints discretos entre steps (D-13). Aborting mid-stream is v2.1 work.
  - Confiar en Inngest concurrency como mecanismo de correctness — Redis SET NX es el único primario (D-14 + RESEARCH §Inngest); Inngest concurrency=1 queda como belt-and-suspenders por defensa en profundidad.
  - Cachear estado Redis (lock value, pending list, interrupt key) entre checkpoints — cada checkpoint re-lee fresco (D-15 fencing token requirement; stale cache defeats the whole purpose).
  - Acceder a workspaces fuera del scope de la lock key — el `key = lock:{workspaceId}:{channel}:{identifier}` literal aísla por workspace. Cross-workspace coordination would require a different keyspace + extra audit.
  - Bypasear el Lua release-if-owner — `redis.del(key)` directo (sin Lua) abriría una race entre nuestro GET y el DEL de otro holder (RESEARCH Pitfall 3).
  - Importar `createAdminClient` o `@supabase/supabase-js` directamente dentro de `src/lib/agents/interruption-system-v2/**` (Regla 3 wrapper). Solo `redis-client.ts` instancia `Redis`; el resto consume el proxy. (Excepción documentada: el cron `v2-lock-cleanup-cron.ts` vive en `src/inngest/functions/`, NO bajo `src/lib/agents/interruption-system-v2/**`, y necesita createAdminClient para la query a `agent_sessions` — D-09 verbatim.)
- **Validación (gates verificables):**
  - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/interruption-system-v2/` retorna 0 matches no-comentario.
  - `grep -c "@upstash/redis" src/lib/agents/interruption-system-v2/redis-client.ts` ≥ 1.
  - `grep -c "RELEASE_IF_OWNER_LUA" src/lib/agents/interruption-system-v2/lua-scripts.ts` ≥ 1; cuerpo del script: `redis.call('GET', KEYS[1])` + `cjson.decode` + comparación holder_uuid + `redis.call('DEL', KEYS[1])` en un solo round-trip.
  - 14 D-17-extended event labels enforceable (REVISION B1): `grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|follower_woke|lock_force_acquired_after_ttl_expiry|zombie_lambda_exit|heartbeat_renewed|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l` returns 14.
  - 8 D-18 CheckpointId values exhaustive (LOCK-05): `grep -oE "'(ckpt_0_post_acquire|ckpt_1_post_comprehension|ckpt_2_post_state_machine|ckpt_3_post_tooling|ckpt_4_post_generation|ckpt_5_post_compliance|ckpt_6_pre_send_loop|ckpt_7_pre_template)'" src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l` returns 8. Distribution across runner + agent + sub-loop + adapter documented in `05-SUMMARY.md` coverage matrix.
  - Test suite: `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` 5 suites + 40/40 tests pass (lock 12 + pending 10 + checkpoints 8 + observability 6 + e2e-scenarios 4).
  - Project skill descubrible: standalone reference `.planning/standalone/debounce-interruption-system-v2/` (shipped 2026-05-26).
  - Follow-up standalone shipped: `.planning/standalone/debounce-v2-interrupt-reprocess/` (2026-05-26) — adds in-lambda restart semantics for Path A interrupts at CKPTs 0..6. Drains pending Redis list + combines into in-memory `effectiveMessage` + re-runs the turn in the SAME lambda under the SAME lock (no Inngest re-dispatch). Sub-loop CKPT-3/4/5 interrupts propagate via `errorMessage.startsWith('interrupted_at_ckpt_')` discriminator after Pitfall 7 fix in `mapOutcomeToAgentOutput` (silent handoff bug). v4-only; module-internal contracts (lock/pending/checkpoints/observability) UNCHANGED — only the CONSUMERS in `v4-production-runner.ts` + `somnio-v4-agent.ts` mapper extended.
- **Consumidores documentados:**
  - `somnio-sales-v4` (DORMANT en prod — D-04 + D-07; activación per-workspace via `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`):
    - Webhook handler `src/lib/whatsapp/webhook-handler.ts` adquiere lock cuando `resolveAgentIdForWorkspace === 'somnio-sales-v4'` (STATIC-imported from `src/lib/agents/registry-helpers.ts` per REVISION B4 — no `await import` dynamic resolution in webhook path to avoid B-001 cold-lambda race).
    - V4 production runner `src/lib/agents/engine/v4-production-runner.ts` ejecuta CKPT-0 (post-acquire) + CKPT-6 (pre-send-loop) + `finally` release (REVISION W3: consume `input.lockChannel` + `input.lockIdentifier` from EngineInput threaded by webhook handler — no createAdminClient introduced in runner).
    - Agente `src/lib/agents/somnio-v4/somnio-v4-agent.ts` ejecuta CKPT-1 (post-comprehension) + CKPT-2 (post-state-machine).
    - Sub-loop `src/lib/agents/somnio-v4/sub-loop/index.ts` ejecuta CKPT-3 (post-tooling) + CKPT-4 (post-generation) + CKPT-5 (post-compliance).
    - Messaging adapter `V4MessagingAdapter` (extends `MessagingProductionAdapter`) ejecuta CKPT-7.N (per-template) via `shouldAbortBeforeTemplate` override — reemplaza Phase 31 `hasNewInboundMessage` polling solo para v4 (D-08).
  - Inngest cron `v2-lock-cleanup-cron` (Plan 06): sweeper que cada 5min compara locks Redis contra `agent_sessions.status='active'` + workspace-scoped LIVE filter; emite `lock_orphan_swept_by_cron` per orphan removed (REVISION B1 — 14th label).
  - Sandbox debug-panel Interruption tab (Plan 06): UI consumer en `/sandbox` que lee `agent_observability_events` filtrado por los 14 lifecycle labels + renders timeline en `America/Bogota` timezone.
  - (FB/IG via ManyChat: webhook handler genéricamente listo per D-12 + `channel` LockChannel union accepts `'facebook' | 'instagram'`, pero solo activa el flujo cuando `agent_id` resuelto = `somnio-sales-v4` — actualmente sin tráfico FB/IG hacia v4. FB/IG dedup gap es forward-looking risk per REVISION W6.)
- **Coexistencia con Phase 31 (D-04):** Phase 31 (`hasNewInboundMessage` en `MessagingProductionAdapter.send` líneas 173-187) sigue VIVO para v3/godentist/recompra/pw-confirmation. Solo el path v4 lo reemplaza vía `V4MessagingAdapter extends MessagingProductionAdapter` que override `shouldAbortBeforeTemplate`. Migración a otros agentes = standalone follow-up por agente (idéntico patrón a `crm-mutation-tools` vs `crm-writer`: coexistencia no-breaking, opt-in per-agent). Cuándo usar cada uno:
  - **Phase 31 polling:** Default para v3/godentist/recompra/pw-confirmation. Bajo throughput, latencia OK, sin red distribuida (per-lambda DB query).
  - **interruption-system-v2:** Solo `somnio-sales-v4` por ahora. High-throughput inbound (multi-msg back-to-back desde misma conversación), cross-lambda exclusión mutua atómica, ~10-20ms checkpoint overhead vs 100-200ms DB polling.

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
