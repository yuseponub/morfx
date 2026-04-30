# REGLAS CRITICAS - MORFX

## REGLA 0: SIEMPRE GSD COMPLETO

Este es tu PROYECTO DE VIDA. Calidad sobre eficiencia. SIN ATAJOS.

**WORKFLOW OBLIGATORIO:**
1. `/gsd:progress` - Ver estado actual
2. `/gsd:discuss-phase` - Capturar decisiones del usuario
3. `/gsd:research-phase` - Investigar SIEMPRE antes de planificar
4. `/gsd:plan-phase` - Crear plan detallado
5. `/gsd:execute-phase` - Ejecutar con commits atomicos
6. `/gsd:verify-work` - Verificar criterios de exito
7. `LEARNINGS.md` - Documentar al completar fase

**BLOQUEANTE:** No se puede hacer cambios de codigo sin plan GSD aprobado.

**PROHIBIDO:**
- Saltar pasos para "ahorrar tokens"
- Implementar sin `/gsd:plan-phase`
- Omitir `/gsd:research-phase` porque "ya se como hacerlo"
- Priorizar velocidad sobre calidad

Cuando tengas duda: PARA y sigue el proceso completo.

---

## REGLA 1: Push a Vercel

SIEMPRE pushear a Vercel despues de cambios de codigo antes de pedir pruebas al usuario:
```bash
git add <archivos> && git commit && git push origin main
```

## REGLA 2: Zona Horaria Colombia

TODA la logica de fechas usa **America/Bogota (UTC-5)**:
- DB: `timezone('America/Bogota', NOW())`
- Frontend: `toLocaleString('es-CO', { timeZone: 'America/Bogota' })`

## Regla 3: Domain Layer

TODA mutacion de datos DEBE pasar por `src/lib/domain/`.
Nunca escribir directo a Supabase desde server actions, tool handlers, action executor o webhooks.

Patron obligatorio:
- Server Action → valida auth → llama domain → revalidatePath
- Tool Handler → llama domain → retorna ToolResult
- Action Executor → llama domain con cascadeDepth
- Webhook → llama domain con source: 'webhook'

Domain SIEMPRE:
- Usa `createAdminClient()` (bypass RLS)
- Filtra por `workspace_id` en cada query
- Emite trigger de automatizacion correspondiente

---

## Comandos Esenciales

- `/gsd:progress` - Estado del proyecto y siguiente accion
- `/gsd:help` - Todos los comandos GSD disponibles
- `/gsd:plan-phase N` - Planificar fase N

## Regla 4: Documentacion Siempre Actualizada

Cada vez que hagas un cambio de codigo (feature, fix, refactor), DEBES actualizar la documentacion relevante:

1. **`docs/analysis/04-estado-actual-plataforma.md`** — Si el cambio afecta el estado de un modulo, actualiza su seccion (status, bugs, deuda tecnica)
2. **`docs/architecture/`** — Si cambias arquitectura de agentes, schema DB, o sistema retroactivo
3. **`docs/roadmap/features-por-fase.md`** — Si completas una fase o feature
4. **LEARNINGS del phase actual** — Siempre documentar bugs encontrados y patterns aprendidos
5. **Deuda Tecnica** — Si resuelves un item P0/P1/P2/P3, eliminalo de la lista. Si creas deuda nueva, agregala.

**PROHIBIDO:** Hacer merge/push sin actualizar docs afectados. El codigo y la documentacion SIEMPRE deben estar sincronizados.

---

## Regla 6: Proteger Agente en Produccion

Cuando se desarrolla un agente NUEVO o un milestone que modifica el comportamiento de un agente existente:

1. **NO desconectar el agente actual** — el agente en produccion debe seguir funcionando sin cambios
2. **Puede hacerse push a Vercel** — pero el nuevo codigo NO debe afectar el agente que ya esta activo
3. **Usar feature flags** para aislar el nuevo comportamiento (ej: `USE_INNGEST_PROCESSING`, `USE_NO_REPETITION`)
4. **El cambio se activa solo cuando el usuario lo decida** — despues de pruebas completas

Patron obligatorio:
- Nuevo agente: registrar con ID diferente, no reemplazar el actual
- Modificar agente existente: feature flag que desactive los cambios por defecto
- El agente viejo permanece funcional hasta activacion explicita del nuevo

**PROHIBIDO:** Pushear cambios que alteren el comportamiento del agente en produccion sin feature flag o sin confirmacion explicita del usuario.

Razon: El agente en produccion esta atendiendo clientes reales. Cambiar su comportamiento sin pruebas previas puede causar respuestas incorrectas, perdida de ventas, o confusion en los clientes.

---

## Regla 5: Migracion Antes de Deploy

TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa.

Workflow obligatorio:
1. Crear archivo de migracion en `supabase/migrations/`
2. **PAUSAR** -- pedir al usuario que aplique la migracion en produccion
3. **ESPERAR** confirmacion explicita del usuario
4. Solo entonces pushear el codigo que depende del nuevo schema

**PROHIBIDO:** Pushear codigo que referencia columnas, tablas o constraints que no existen en produccion.

Razon: El incidente de 20h de mensajes perdidos fue causado por codigo desplegado que referenciaba una columna inexistente, y el mecanismo de resiliencia tampoco funciono porque su tabla tampoco existia.

---

## Scopes por Agente

### Module Scope: crm-query-tools (`src/lib/agents/shared/crm-query-tools/`)
- **PUEDE (solo lectura):**
  - `getContactByPhone(phone)` — contacto + tags + custom_fields + duplicates flag
  - `getLastOrderByPhone(phone)` — ultimo pedido del contacto + items + direccion
  - `getOrdersByPhone(phone, { limit?, offset? })` — historial paginado (lista de OrderListItem)
  - `getActiveOrderByPhone(phone, { pipelineId? })` — pedido en stage activo (config-driven; retorna `config_not_set` si workspace nunca configuro stages — D-27)
  - `getOrderById(orderId)` — pedido especifico con items + shipping
- **NO PUEDE:**
  - Mutar NADA (crear/editar/archivar contactos, pedidos, notas, tareas — esas operaciones son scope crm-writer)
  - Acceder a otros workspaces (workspace_id viene del execution context del agente, NUNCA del input — D-05)
  - Cachear resultados (cada tool-call llega a domain layer fresh — D-19)
  - Escribir keys legacy `_v3:crm_context*` o `_v3:active_order` en session_state (D-21 — el caller decide persistencia)
  - Hardcodear nombres de stages — la lista de stages "activos" se lee de `crm_query_tools_config` + `crm_query_tools_active_stages` (D-11/D-13 config-driven UUID)
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/shared/crm-query-tools/**` (verificable via grep)
  - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
  - Configuracion persistente por workspace en tabla `crm_query_tools_config` (singleton) + `crm_query_tools_active_stages` (junction)
  - UI de configuracion en `/agentes/crm-tools` (operador escoge stages activos + pipeline scope)
  - Project skill descubrible: `.claude/skills/crm-query-tools.md`
  - Standalone shipped: `.planning/standalone/crm-query-tools/` (2026-04-29)
- **Consumidores documentados:**
  - (Pendientes — los agentes Somnio se migraran en standalones follow-up: `crm-query-tools-recompra-integration` y `crm-query-tools-pw-confirmation-integration`. Hasta entonces, el modulo esta listo pero sin consumidores en produccion.)

### Module Scope: crm-mutation-tools (`src/lib/agents/shared/crm-mutation-tools/`)
- **PUEDE (15 mutation tools deterministas, in-loop, latencia 50-150ms):**
  - **Contactos (3):** `createContact` (idempotency-eligible), `updateContact`, `archiveContact` (soft-delete via `archived_at`)
  - **Pedidos (5):** `createOrder` (idempotency-eligible), `updateOrder` (NO products en V1 — V1.1 deferred), `moveOrderToStage` (CAS-protected, propaga `stage_changed_concurrently` verbatim sin retry — Pitfall 1), `archiveOrder` (soft-delete via `archived_at`), `closeOrder` (soft-close via `closed_at` — D-11 Resolución A; distinto de archive)
  - **Notas (4):** `addContactNote` (idempotency-eligible), `addOrderNote` (idempotency-eligible), `archiveContactNote`, `archiveOrderNote`
  - **Tareas (3):** `createTask` (idempotency-eligible + exclusive arc contactId/orderId/conversationId), `updateTask`, `completeTask` (toggle `completed_at`)
- **NO PUEDE:**
  - Mutar recursos base (tags/pipelines/stages/templates/usuarios) — D-pre-05; retorna `resource_not_found` con `missing.resource` discriminator
  - Hard-DELETE de NADA — soft-delete vía `archived_at` / `closed_at` / `completed_at` (D-pre-04)
  - Retry implícito en `stage_changed_concurrently` — propaga verbatim al agent loop (Pitfall 1, mismo contract que crm-writer)
  - Cachear resultados — cada tool-call llega a domain layer fresh + re-hidrata via `getXxxById` (D-09)
  - Editar items de un pedido (`updateOrder.products`) — V1.1 deferred; V1 escala a handoff humano
  - Acceder a otros workspaces — `ctx.workspaceId` viene del execution context, NUNCA del input (D-pre-03)
  - Importar `createAdminClient` o `@supabase/supabase-js` directamente — toda mutación pasa por `@/lib/domain/*` (Regla 3, D-pre-02; verificable via grep)
- **Validación (gates verificables):**
  - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/` retorna 0 matches no-comentario
  - `grep -E "workspaceId.*z\.string|workspaceId.*\.uuid" src/lib/agents/shared/crm-mutation-tools/{contacts,orders,notes,tasks}.ts` retorna 0 matches (Pitfall 2)
  - `grep -E "deleteContact|deleteOrder|deleteTask|deleteNote\b" src/lib/agents/shared/crm-mutation-tools/` retorna 0 matches (Pitfall 4)
  - Idempotencia persistente en tabla `crm_mutation_idempotency_keys` (PK `workspace_id, tool_name, key`); TTL 30 días vía cron Inngest `crm-mutation-idempotency-cleanup` (TZ=America/Bogota 0 3 * * *)
  - Audit trail emite 3 eventos `pipeline_decision:crm_mutation_*` (`invoked` / `completed` / `failed`) a `agent_observability_events` con PII redaction (phone last 4, email local-part masked, body truncated 200 chars)
  - Project skill descubrible: `.claude/skills/crm-mutation-tools.md`
  - Standalone shipped: `.planning/standalone/crm-mutation-tools/` (2026-04-29)
- **Coexistencia con crm-writer (D-01):** crm-writer (two-step propose+confirm + tabla `crm_bot_actions`) sigue VIVO sin cambios. mutation-tools es alternativa NUEVA, no reemplazo. Cuándo usar cada uno:
  - **mutation-tools:** in-loop tool calls deterministas, baja latencia (~50-150ms), audit en `agent_observability_events`. Default para agentes nuevos.
  - **crm-writer:** sandbox UI con preview operador antes de commit, audit trail estructurado en `crm_bot_actions`, two-step idempotencia + TTL. Default cuando el flujo requiere humano-en-el-loop.
- **Consumidores documentados:** (pendientes — agentes que migren se documentarán en standalones follow-up por agente: `crm-mutation-tools-pw-confirmation-integration` y otros. Sin consumidores en prod al ship — D-08 sin feature flag).

---

## Stack Tecnologico

- Next.js 15 (App Router) + React 19
- TypeScript estricto
- Supabase (Auth, DB, RLS)
- Tailwind CSS
- Puerto dev: 3020
