# Standalone: agent-lifecycle-router — Context

**Gathered:** 2026-04-25
**Status:** Ready for research
**Type:** Standalone phase (no roadmap entry)

<domain>
## Phase Boundary

Construir un sistema de **routing de agentes basado en lifecycle del cliente** que decida — en el momento del webhook inbound de WhatsApp — qué agente AI atiende a un contacto, basándose en el estado de su(s) pedido(s), tags, y momento del journey.

**Reemplaza** la lógica binaria actual hardcoded en `webhook-processor.ts:174-188` (`if (is_client && recompra_enabled) → recompra-v1, else → workspace.conversational_agent_id`) por una **decision engine declarativa** editable sin redeploy, que puede crecer a 5-10+ agentes por workspace con criterios complejos.

**Lo que esta fase entrega (v1):**
1. Catálogo declarativo de **facts** disponibles para reglas (qué se puede preguntar sobre el cliente).
2. **Lifecycle classifier** — decision engine que computa `lifecycle_state` desde facts (FIRST hit policy con prioridad explícita).
3. **Agent router** — decision engine que mapea `lifecycle_state + tags + workspace` → `agent_id`.
4. **Override tags** — kill-switch tags (forzar_humano, pausar_agente, forzar_sales_v3, forzar_recompra, vip) integrados como inputs de las reglas.
5. **Dry-run simulator** — antes de aplicar cualquier cambio de regla, correr contra mensajes históricos y mostrar qué decisiones cambiarían.
6. **Admin form simple** — UI básica (no SQL Studio) para editar reglas sin deploy.
7. **Audit log** — cada decisión de routing registra qué regla disparó + facts evaluados.
8. **Integración en `webhook-processor.ts`** — reemplazar el if/else actual por llamada al router; backwards-compatible vía feature flag.

**Lo que NO entrega esta fase (deferido a v2):**
- `routing-builder` agent conversacional (cliente le habla a un agente para editar reglas) — v2.
- Editor visual avanzado tipo dmn-js — v2 si se justifica.
- Migración a DMN si crece a 25+ reglas — v2 trigger explícito.
- Re-routing mid-sesión (sigue siendo "agent_id congelado al crear sesión", limitación del session model actual).

</domain>

<decisions>
## Implementation Decisions

### Stack y Engine

- **D-01 (resuelta antes de discusión):** Phase 42 (session-lifecycle fix) ya está SHIPPED (5/5 plans + VERIFICATION.md presente en `.planning/phases/42-session-lifecycle/`). No es bloqueante. El router puede asumir que las sesiones cierran correctamente y por tanto un cliente que regresa días después arranca sesión nueva donde el routing se re-evalúa.
- **D-02:** **`json-rules-engine`** (npm, ~275k DL/sem) como engine de reglas. Razones permanentes (no solo time-to-ship): bus factor superior vs `dmn-engine` (cientos DL/sem), TypeScript-nativo, fit con Supabase JSONB, expresividad cross-cutting con árboles `all`/`any` anidados, ecosistema activo. Trigger explícito de migración a DMN futuro: 25+ reglas activas O admin externo no-técnico edita reglas O compliance externo lo exige.
- **D-07:** **Computar lifecycle_state SÍNCRONAMENTE** en webhook al crear sesión (no async). El `agent_id` debe estar resuelto antes de `SessionManager.createSession`. Async preload de contexto adicional (CRM context, historia de pedidos detallada) sigue patrón ya probado de `recompra-preload-context` Inngest function — esa parte queda fuera de scope de esta fase.

### Lifecycle States v1

- **D-03:** Arrancar con **8 estados** (granularidad amplia desde inicio, "quitamos los que no necesitemos" según el usuario):
  1. `new_prospect` — sin pedidos previos, primera interacción
  2. `order_in_progress` — pedido activo en stage de preparación/despacho (NO en tránsito todavía)
  3. `in_transit` — pedido activo en stage de tránsito (carrier ya tiene el paquete)
  4. `just_received` — pedido entregado hace <7 días (ventana post-venta)
  5. `dormant_buyer` — cliente con pedido(s) entregado(s), última entrega hace >30 días, sin pedido activo
  6. `abandoned_cart` — interactuó hace >7 días sin generar pedido (lead frío)
  7. `reactivation_window` — recompró por primera vez después de >X meses sin compra (cliente recuperado)
  8. `blocked` — cualquier tag de bloqueo activo (forzar_humano, pausar_agente, en disputa, etc.)

  **Nota:** "X meses" en `reactivation_window` queda como parámetro configurable en la regla, no hardcoded. Default sugerido: 90 días.

### Tags consumidas por el router v1

- **D-04:** Tags son rows normales en `contact_tags` (sin migración para crear tags nuevos — ya existe la plomería). Lo que las hace "consumidas por el router" es que las reglas las referencian como inputs. Dos categorías conceptuales (técnicamente idénticas en DB):

  **Hard override** — bypasean lifecycle logic, fuerzan resultado:
  - `forzar_humano` — escala a operador, no atiende ningún agente
  - `pausar_agente` — desactiva todo agente para este contacto temporalmente
  - `forzar_sales_v3` — bypassa lifecycle, rutea siempre a sales-v3
  - `forzar_recompra` — bypassa lifecycle, rutea siempre a recompra-v1

  **Soft attribute** — disponibles como inputs combinables, las reglas deciden cómo usarlas:
  - `vip` — cliente prioritario (regla puede mandarlo a concierge, dar prioridad de respuesta, etc.)
  - `pago_anticipado` — cliente que paga antes de despacho (regla puede skipear flow de confirmación de pago, mandarlo a agente que sabe del esquema, etc.)

  Tags adicionales (`mayorista`, `no_recompra`, `prioritario`, etc.) se pueden crear desde la UI de tags actual de Morfx en cualquier momento — sin migración, sin deploy. El router solo "los conoce" cuando agregas una regla que los referencia.

### Scope v1

- **D-06:** **Core router + admin form simple.** Incluye:
  - Engine + reglas en Supabase JSONB
  - Admin form web básico para CRUD de reglas (sin SQL Studio dependency)
  - Observability completa
  - Dry-run simulator integrado en el form (D-10)

  **NO incluye:** `routing-builder` agent conversacional (deferido a v2).

### Safety y Observabilidad

- **D-10:** **Dry-run simulator es v1 mandatorio.** Antes de aplicar cualquier cambio de regla, el form admin corre las reglas modificadas contra los últimos N días de mensajes (default sugerido: 7 días) y muestra:
  - Cuántos mensajes habrían cambiado de routing
  - Distribución before/after por agente
  - Lista de mensajes específicos afectados (con conversation_id linkable)

  Esto es el safety net crítico para cuando entre el routing-builder agent en v2.

- **D-08 (consecuencia de D-09 v2):** **Vocabulario declarativo desde v1.** Tabla nueva `routing_facts_catalog` con `{name, type, description, examples}` documenta qué facts existen y cómo usarse. Crítico cuando el agente editor de v2 necesite leer el catálogo. En v1 también sirve para que tú (editor humano) sepas qué tienes disponible sin leer código.

- **D-12:** **JSON Schema del rule format versionado en repo** en `src/lib/agents/routing/schema/rule-v1.schema.json`. Validación en write (form admin) y on-load (cuando engine arranca). Schema migration story: bump a `rule-v2.schema.json` cuando cambien shapes; engine soporta múltiples versions vía field `schema_version` en cada row.

### v2 Roadmap (NO en scope de esta fase pero contexto)

- **D-09 (deferido):** `routing-builder` agent conversacional — v2. Reutiliza patrón two-step propose→confirm de `crm-writer` (documentado en `.claude/rules/agent-scope.md`). Scope: PUEDE leer catálogo, listar reglas actuales, proponer cambios via tabla `routing_proposals`, simular dry-run, confirmar aplicación. NO PUEDE mutar sin propose→confirm, editar facts/operators (eso requiere deploy), editar reglas de otro workspace.
- **D-11 (deferido):** Tabla `routing_proposals` separada de `crm_bot_actions` (scope distinto, evita acoplamiento).

### Cache y Performance

- **D-05 (Claude's Discretion):** Cache de reglas en memoria con TTL 60s + invalidación pub/sub al editar. Implementación detallada queda para `gsd-planner`.

### Claude's Discretion

- Implementación específica del JSON Schema (nested structure, custom operators) — planner decide.
- Estructura exacta de tablas Supabase (`routing_rules`, `routing_facts_catalog`, `routing_audit_log`) — planner decide siguiendo patrones existentes.
- UI design del admin form — sigue patrón de otras admin pages del proyecto.
- Operadores custom necesarios para los facts (`daysSince`, `tagMatchesPattern`, etc.) — researcher identifica + planner especifica.
- Naming exacto del agent vs registry entry para el router — planner decide.

### Folded Todos
[None — no hay todos pendientes específicos sobre este tema]

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reglas del proyecto
- `CLAUDE.md` — Reglas 0 (GSD obligatorio), 1 (push Vercel), 2 (timezone Bogotá), 3 (Domain Layer), 4 (docs siempre actualizadas), 5 (migración antes de deploy), 6 (proteger agente en producción)
- `.claude/rules/agent-scope.md` — Patrón obligatorio de scope por agente (PUEDE/NO PUEDE), referencia para definir scope del futuro `routing-builder` v2 y para el agent registry entry del router en sí
- `.claude/rules/code-changes.md` — Reglas de cambios de código (commits atómicos)
- `.claude/rules/gsd-workflow.md` — Workflow GSD obligatorio

### Código existente que el router debe modificar/integrar
- `src/app/api/webhooks/whatsapp/route.ts` — Entry point del webhook, contiene resolución de workspace por phone_number_id
- `src/lib/whatsapp/webhook-handler.ts:45-343` — `processWebhook()` y `processIncomingMessage()`. Línea 91 contiene el patrón actual de skip-tags (`conversationHasAnyTag(['WPP', 'P/W', 'RECO'])`) — el router lo absorbe/reemplaza
- `src/lib/agents/production/webhook-processor.ts:174-188` — **PUNTO EXACTO DE INTEGRACIÓN** del router. Reemplaza el if/else binario actual con call al router engine
- `src/lib/agents/production/webhook-processor.ts:443-511` — Branch por agent_id post-routing (sales-v3 vs godentist vs unified) — el router emite agent_id, este branch sigue funcionando
- `src/lib/agents/registry.ts` — `agentRegistry`, donde se registra cada agent_id válido. El router debe validar que el agent_id que emite está registrado
- `src/lib/agents/types.ts` — Interface `AgentConfig` con id, name, intentDetector, tools, etc.
- `src/lib/agents/production/agent-config.ts` — Tabla `workspace_agent_config` (workspace_id, agent_enabled, recompra_enabled, conversational_agent_id, etc.). El router agrega rules/config aquí o en tabla nueva
- `src/lib/agents/session-manager.ts:124-128, 236-238` — `agent_sessions.agent_id` se setea al crear sesión y es **inmutable post-create**. Router emite agent_id ANTES de createSession

### Domain layer (Regla 3)
- `src/lib/domain/orders.ts` — Lectura de pedidos por contacto, stages
- `src/lib/domain/pipelines.ts` — Pipelines (incluye RECOMPRA_PIPELINE_NAME)
- `src/lib/domain/stages.ts` — Stages catalog
- `src/lib/domain/tags.ts` — Tags y `contact_tags` join
- `src/lib/domain/contacts.ts` — Contactos, `is_client` flag
- Cualquier nueva mutación del router (write a `routing_rules`, `routing_audit_log`) DEBE ir vía nueva función en `src/lib/domain/routing.ts`

### Patrón de agentes editores (futuro v2)
- `src/lib/agents/crm-writer/two-step.ts` — Patrón two-step propose→confirm. Reutilizable en v2 para `routing-builder`
- `.planning/phases/44-*/` (si existe) — Phase del crm-writer con BLOCKERS y patterns
- `src/lib/config-builder/templates/tools.ts` — Otro ejemplo de "agente editor de configuración" con scope acotado

### Inngest async pattern (no en scope v1, pero referencia para context enrichment)
- `src/inngest/functions/recompra-preload-context.ts` — Patrón validado de "sesión creada → Inngest async carga contexto → escribe a `session_state.datos_capturados`". El router NO lo usa para decidir agent_id (que es sync), pero el async enrichment downstream lo seguirá usando

### External (lib oficial)
- `https://www.npmjs.com/package/json-rules-engine` — Docs oficiales de la lib elegida (D-02). Researcher debe leer Conditions, Operators custom, Priority, Events, y la sección de Performance/Caching
- `https://www.anthropic.com/research/building-effective-agents` — Routing pattern endorsado por Anthropic (deterministic classifier para inputs estructurados)

### Memory referenciado
- `~/.claude/.../memory/agent_sessions_lifecycle.md` — Bug original que motivó Phase 42 (relevante para entender por qué session.agent_id es immutable y por qué el router opera al inicio de sesión)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`agentRegistry` (`src/lib/agents/registry.ts`)** — registra cada agent disponible. Router lee de aquí para validar que el agent_id que emite está registrado en el workspace. No reemplazar, integrar.
- **`workspace_agent_config` table + helper** — ya existe con campos `recompra_enabled`, `conversational_agent_id`. El router puede:
  - Opción A: agregar columna `lifecycle_routing_enabled` + JSONB `routing_config` aquí
  - Opción B: tabla nueva `workspace_routing_config` con FK a workspace
  - Planner decide. Recomendación inicial: Opción A (menos churn, JSONB ya en uso)
- **Pattern de skip-tags en `webhook-handler.ts:91`** (`conversationHasAnyTag(['WPP','P/W','RECO'])`) — patrón validado de "tag-as-pre-filter". Router lo **absorbe**: las override tags D-04 entran como inputs del decision table, los WPP/P/W/RECO actuales pueden migrar a tag `pausar_agente` o quedar como caso legacy
- **`crm-writer` two-step pattern** — completo, productivo, con TTL/idempotencia. Modelo a copiar para v2 routing-builder agent
- **`recompra-preload-context` Inngest pattern** — para el context enrichment async post-routing (no scope v1 pero patrón confirmado)

### Established Patterns
- **Domain layer obligatorio (Regla 3)** — todas las mutaciones (writes a `routing_rules`, `routing_audit_log`, `routing_facts_catalog`) DEBEN ir vía `src/lib/domain/routing.ts` con `createAdminClient()` + filtro `workspace_id`. Tool handlers (futuro routing-builder agent) NUNCA tocan Supabase directo.
- **Agent scope explícito en `.claude/rules/agent-scope.md`** — bloqueante. El router engine en sí NO es agent (es servicio determinístico), pero el `routing-builder` v2 SÍ lo es y debe tener entry de scope.
- **Feature flags en `platform_config`** — patrón `usar_X_enabled` con default false (Regla 6). Router se rolloutea con `lifecycle_routing_enabled` per-workspace, default false. El if/else actual sigue activo cuando flag está OFF.
- **Sessions con `agent_id` inmutable** — constraint del session model. Router emite agent_id sync ANTES de `createSession`. Sticky-per-session viene gratis. No-rerouting-mid-conversation es limitación documentada (no defecto del router).

### Integration Points
- **Punto de inserción del router:** `src/lib/agents/production/webhook-processor.ts` línea 174-188. El router se llama ANTES del `is_client && recompra_enabled` check actual. Si `lifecycle_routing_enabled === false` para el workspace → caer al if/else legacy. Si `=== true` → usar resultado del router.
- **Contacto + workspace_id ya disponibles** en webhook-processor antes de la decisión.
- **`contact_id` y `workspace_id`** son los inputs primarios al router; las queries de domain layer se ejecutan desde el router engine.

</code_context>

<specifics>
## Specific Ideas

### Ejemplo de regla v1 (formato propuesto, planner refina)

```json
{
  "schema_version": "v1",
  "id": "uuid",
  "workspace_id": "a3843b3f-c337-4836-92b5-89c58bb98490",
  "rule_type": "lifecycle_classifier",
  "name": "in_transit_active_order",
  "priority": 100,
  "conditions": {
    "all": [
      { "fact": "activeOrderStage", "operator": "equal", "value": "transit" }
    ]
  },
  "output": { "lifecycle_state": "in_transit" },
  "active": true,
  "created_at": "2026-04-25T...",
  "created_by_user_id": "...",
  "created_by_agent_id": null
}
```

```json
{
  "schema_version": "v1",
  "id": "uuid",
  "workspace_id": "a3843b3f-c337-4836-92b5-89c58bb98490",
  "rule_type": "agent_router",
  "name": "in_transit_to_postsale",
  "priority": 100,
  "conditions": {
    "all": [
      { "fact": "lifecycle_state", "operator": "equal", "value": "in_transit" },
      { "fact": "tags", "operator": "doesNotContain", "value": "forzar_humano" }
    ]
  },
  "output": { "agent_id": "somnio-postsale-v1" },
  "active": true
}
```

### Visión a 6-12 meses
El usuario expresó visión de **agentes que ayuden a clientes a editar estas estructuras** — no solo UI visual. Esto refuerza json-rules-engine sobre DMN (formato JSON es nativo para LLMs en structured outputs). v2 incluirá `routing-builder` agent. v1 deja la base preparada (vocabulario declarativo D-08, JSON Schema D-12, dry-run D-10).

### Casos de uso reales mencionados (para informar facts a exponer)
- Persona totalmente nueva (sin pedidos)
- Persona con pedido en despacho
- Persona con pedido en tránsito
- Cliente con paquete recién recibido
- Cliente antiguo (probablemente quiera volver a comprar)
- Override por tags (vip, no_contactar, forzar_humano)

### Modalidades futuras de agentes que esto habilita
- Agentes diferentes por brand pero del mismo negocio (ya existen: somnio-sales-v3 + somnio-recompra-v1)
- Agentes especializados por momento del journey (post-venta vs reactivación vs prospección)
- Agentes especializados por tipo de cliente (VIP, mayorista, retail)

</specifics>

<deferred>
## Deferred Ideas

### Para v2 (después de v1 estable)
- **`routing-builder` agent conversacional** — el cliente le habla a un agente para editar reglas. Reutiliza patrón two-step propose→confirm de `crm-writer`. Tabla `routing_proposals` separada. (D-09, D-11)
- **Editor visual avanzado** — actualmente admin form simple en v1. Si crece a 25+ reglas o entra editor no-técnico, evaluar `dmn-js` o equivalente.
- **Migración a DMN** — si se cumplen triggers explícitos (25+ reglas activas, admin externo no-técnico, compliance externo). No antes.

### Para futuras fases independientes
- **Re-routing mid-sesión** — requiere refactor del session model (agent_id inmutable hoy). Out of scope. Workaround: agresivamente cerrar sesiones cuando lifecycle_state cambia significativamente (depende de Phase 42 cleanup ya shipped).
- **Sub-personalidades dentro de un agente** (alternative architecture) — un solo agent runtime con system prompts dinámicos según context, en vez de N agents distintos. No descartado pero no v1 (rompe abstracción actual de agentRegistry).
- **ML/LLM-based router** — para casos de routing semántico (intent en texto libre que no encaja en CRM state). Hybrid recomendado por Anthropic. Considerar cuando aparezcan casos donde reglas determinísticas no cubren.
- **Portabilidad cross-stack** — si en 5+ años se considera portar Morfx fuera de Node, evaluar export de reglas a formato DMN para portabilidad.

### Reviewed Todos (not folded)
[None — no se cruzaron todos relevantes]

</deferred>

---

*Standalone: agent-lifecycle-router*
*Context gathered: 2026-04-25*
*Conversación discusión: ~7 turnos investigando architecture (state machine vs predicates vs DMN), ecosystems (LangGraph, OpenAI Agents, AutoGen, json-rules-engine, DMN), 1 explore agent en codebase actual + 1 research agent web. Lecciones clave: agent_id inmutable post-session-create constrains routing al inicio de sesión; json-rules-engine wins sobre DMN por bus factor + TS fit + agent-editor friendliness; 3-layer model (facts → classifier → router) con tags absorbed en condiciones del classifier/router.*
