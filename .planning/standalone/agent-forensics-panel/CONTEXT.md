# Agent Forensics Panel (Standalone) — Context

**Gathered:** 2026-04-23
**Status:** Discussion complete (see DISCUSSION-LOG.md, D-01..D-13). Ready for `/gsd-research-phase`.

<domain>
## Phase Boundary

Construir una capa de **análisis forense acotada** sobre el debug panel de producción de agentes (hoy `src/app/(dashboard)/whatsapp/components/debug-panel-production/`, que sirve la lista de `agent_observability_turns`). El objetivo es pasar del volcado crudo actual (19 eventos / 22 queries SQL / raw timeline) a una vista que permita diagnosticar rápidamente "por qué este bot respondió mal" y generar contexto pegable a Claude Code para arreglarlo.

Dos piezas acopladas pero independientes:

1. **Panel forensics por sesión** — timeline condensado (solo eventos que cambian estado: `salesAction`, template enviado, `pipeline_decision`, tool call, transition), snapshot del estado actual (intent activo, datos capturados, última transition, flags), y botón "Ver timeline completo" que expande la vista raw actual (no se elimina, solo se esconde por default).

2. **Agente auditor con spec por bot** — un agente AI que lee (a) la spec de comportamiento del bot específico y (b) el timeline condensado de la sesión, y emite un diagnóstico tipo "esto está dentro/fuera de lo esperado, probable falla aquí por X" con pointers a archivos/líneas pegables a Claude Code.

**Piloto propuesto:** `somnio-recompra-v1` (recién shippeado, alta actividad productiva, spec ya razonablemente consolidada en `CLAUDE.md` + `.claude/rules/agent-scope.md` + catálogo de templates en phase `somnio-recompra-template-catalog`).

**NO incluye** (en este standalone):
- Cambios al comportamiento de los agentes (sales-v3, recompra-v1, godentist, crm-reader/writer).
- Extender a todos los bots del sistema — solo piloto con recompra.
- Panel del sandbox (`/sandbox`) — ese ya lo cubre `debug-panel-v4`. Este es el panel de **producción**.
- Retroalimentación automática del auditor al código (no hace PRs, no escribe; solo produce contexto pegable).

</domain>

<background>
## Problema actual

El usuario describe el panel actual como demasiado extenso para diagnosticar. El dump crudo de un turn típico de somnio-recompra se ve así:

```
somnio-v3 · user_message
31ms · 6029tok · $0.0085
19ev · 22q · 1ai

0  SQL   select workspace_agent_config
1  SQL   select conversations
... (30+ filas entre SQL/EVT/AI)
```

Esto funciona para debugging profundo pero es ruido cuando quieres entender el flujo de decisión del bot. El usuario quiere:

- **Lo relevante arriba** (salesAction, qué template se mandó, qué decisión tomó el pipeline, qué intent detectó).
- **El resto escondido detrás de un toggle** — no eliminarlo, sigue siendo valioso cuando el auditor AI necesita acceso programático completo.
- **Un auditor con contexto completo** del bot específico que pueda razonar sobre la discrepancia entre "qué debería haber pasado" vs "qué pasó".

</background>

<sub-bug discovered>
## Bug #1 (descubierto durante discovery): Agent label mislabeling

**Síntoma reportado por el usuario:**
En la lista de turns del panel de debug, TODOS los turns de una conversación de recompra se etiquetan como `somnio-v3` aunque el agente que efectivamente respondió fue `somnio-recompra-v1`. Ejemplo:

```
Debug bot e5cf0938
23/4, 04:46:46 p.m. — somnio-v3 · user_message   ← respondió recompra
23/4, 04:40:26 p.m. — somnio-v3 · user_message   ← respondió recompra
...
```

**Root cause (investigado read-only, 2026-04-23):**

El `ObservabilityCollector` se inicializa UNA sola vez al arrancar la función Inngest en `src/inngest/functions/agent-production.ts:106-115`, usando `resolveAgentIdForWorkspace()` que lee `conversational_agent_id` del workspace config (→ devuelve `'somnio-v3'` para Somnio).

Luego, en `src/lib/agents/production/webhook-processor.ts:161-398`, si el contacto es cliente (`contactData?.is_client`), se emite el evento `pipeline_decision · recompra_routed` (línea ~192) y se invoca un `V3ProductionRunner` **completamente separado** con `agentId: 'somnio-recompra-v1'` (líneas 220-238). Este runner procesa el mensaje pero **nunca actualiza el collector original**.

Al final del turno, `src/lib/observability/flush.ts:110-133` persiste `agent_observability_turns.agent_id = collector.agentId` — o sea, el valor inicial `'somnio-v3'`. La UI lee este campo en `src/lib/observability/repository.ts:63-98` (`listTurnsForConversation`) y lo renderiza en `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx:156` como `{turn.agentId}`.

**El esquema tampoco tiene distinción semántica:**
- Migración `supabase/migrations/20260205000000_agent_sessions.sql:41-65` define `agent_turns` sin `agent_id` directo (linkea vía `session_id` → `agent_sessions.agent_id`).
- La tabla paralela `agent_observability_turns` SÍ tiene un campo `agent_id` plano, pero no distingue `entry_agent_id` vs `responding_agent_id`.

**Opciones de fix (a decidir en `/gsd-discuss-phase`):**

| # | Opción | Archivo(s) | Trade-off |
|---|--------|-----------|-----------|
| A | **Mutar collector al rutear** — exponer setter en `ObservabilityCollector` y llamarlo desde el branch de recompra | `src/lib/agents/production/webhook-processor.ts:190-240` + `src/lib/observability/collector.ts` | Menos invasivo en schema. Rompe inmutabilidad del collector durante un turn. |
| B | **Schema change** — agregar `responding_agent_id` a `agent_observability_turns`, persistirlo desde el runner de recompra, y hacer que la UI muestre `responding_agent_id ?? agent_id` | Migración + `flush.ts` + `repository.ts` + `turn-list.tsx:156` | Más limpio semánticamente. Requiere Regla 5 (migración antes de push). Deja el `agent_id` de entrada intacto para auditoría. |
| C | **Query-time join** — computar el agentId correcto en el SELECT joineando con `agent_sessions` (que sí tiene el agent real) | `src/lib/observability/repository.ts:69-75` | Sin cambios de schema ni runtime. Pero asume que existe una sesión de recompra correctamente etiquetada, hay que verificarlo. |
| D | **Resolver antes de crear collector** — detectar `is_client` ANTES de `agent-production.ts:110` y crear el collector con el agentId correcto de una | `agent-production.ts` + posiblemente reubicar la detección de cliente | Más invasivo en flujo. Rompe separación de responsabilidades actual. |

**Recomendación preliminar:** Opción B (schema change con `responding_agent_id`) — alinea con el goal más amplio del panel forensics (mostrar el agente que *respondió*) y preserva info de routing para debugging futuro. Confirmar en discuss-phase.

**Impacto en el panel forensics:** El timeline condensado debe mostrar claramente "entró a X → ruteó a Y → Y respondió" cuando aplica, así el auditor AI no se confunde.

</sub-bug>

<open-questions>
## Preguntas abiertas para `/gsd-discuss-phase`

### Scope y alcance
- **Q1.** ¿Piloto con `somnio-recompra-v1` únicamente, o incluimos también `somnio-sales-v3` desde el inicio (dado que están acoplados vía el routing bug)?
- **Q2.** ¿El panel forensics vive en la misma ruta que el actual (`debug-panel-production` en `/whatsapp/...`) o ruta nueva (ej. `/debug/forensics/:sessionId`)?
- **Q3.** ¿El auditor AI es invocado manualmente (botón "Auditar esta sesión") o automáticamente cuando se abre un turn? Considerar costo en tokens.

### Forma del timeline condensado
- **Q4.** ¿Qué eventos cuentan como "relevantes" exactamente? Draft: `pipeline_decision`, `salesAction` emitida, template enviado, intent detectado, `mode_transition`, `session_lifecycle` (start/close), tool calls de CRM. A validar.
- **Q5.** ¿Los SQL queries se ocultan TODOS en el timeline condensado, o solo los repetitivos (selects de `workspace_agent_config`, `conversations`, etc.)?
- **Q6.** Snapshot del estado: ¿mostramos `session_state.datos_capturados` completo, o solo campos clave (intent, promo ofrecida, cliente vs no-cliente, última decisión)?

### Spec por bot (para el auditor)
- **Q7.** ¿Dónde vive la "spec de comportamiento" que lee el auditor? Opciones:
  - (a) Archivo nuevo por bot en `src/lib/agent-specs/{agent-id}.md` que consolide info hoy fragmentada.
  - (b) El auditor lee múltiples fuentes directamente (`CLAUDE.md`, `.claude/rules/agent-scope.md`, `somnio_recompra_template_catalog.md`, prompts del agente, catálogo de templates).
  - (c) Híbrido: archivo índice que apunta a las fuentes, y el auditor las lee on-demand.
- **Q8.** ¿Qué modelo usa el auditor? Claude Sonnet 4.6 vs Haiku 4.5 — trade-off calidad vs costo por análisis.
- **Q9.** Output del auditor: ¿markdown pegable a Claude Code, JSON estructurado con claims, o ambos?

### Bug de etiquetado (agent_id)
- **Q10.** Opciones A/B/C/D arriba — ¿cuál se implementa? Recomendación: B.
- **Q11.** Si opción B, ¿backfill de rows históricas en `agent_observability_turns`? ¿O solo prospectivo?
- **Q12.** ¿Este fix va como primer plan del standalone (pre-requisito del panel) o como plan independiente?

### Integración con Claude Code
- **Q13.** ¿El output del auditor incluye pointers file:line (mi preferencia, como en esta investigación), o solo prosa? Los file:line son accionables pero requieren que el auditor tenga lecturas de archivos.

</open-questions>

<pointers>
## Archivos clave identificados (para research-phase / plan-phase)

**Panel actual (a modificar/envolver):**
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx:156` — renderiza `{turn.agentId}` (fuente del bug visual).
- Resto de `src/app/(dashboard)/whatsapp/components/debug-panel-production/` — componentes de la vista raw actual.

**Observability pipeline:**
- `src/lib/observability/collector.ts` — ObservabilityCollector class.
- `src/lib/observability/flush.ts:110-133` — INSERT a `agent_observability_turns`.
- `src/lib/observability/repository.ts:63-98` — `listTurnsForConversation` (lectura para UI).

**Routing y creación de collector:**
- `src/inngest/functions/agent-production.ts:106-115` — donde se crea el collector con el agentId inicial.
- `src/inngest/functions/agent-production.ts:39-52` — `resolveAgentIdForWorkspace()`.
- `src/lib/agents/production/webhook-processor.ts:161-398` — pipeline de ruteo; líneas 190-240 es el branch de recompra.

**Schema:**
- `supabase/migrations/20260205000000_agent_sessions.sql:41-65` — `agent_turns` + `agent_sessions`.
- Migración a crear (si opción B): agregar `responding_agent_id NULL` a `agent_observability_turns`.

**Spec del bot recompra (fuentes fragmentadas a consolidar):**
- `CLAUDE.md` (sección "Somnio Recompra Agent" en `.claude/rules/agent-scope.md`).
- `.planning/standalone/somnio-recompra-template-catalog/` — catálogo de templates y transitions locked.
- `.planning/standalone/somnio-recompra-crm-reader/` — contrato con crm-reader.
- `src/lib/agents/somnio-recompra/response-track.ts` — transitions hardcoded, TEMPLATE_LOOKUP_AGENT_ID.
- `src/lib/agents/somnio-recompra/__tests__/` — 4 test suites (32 tests) que codifican comportamiento esperado.

</pointers>

<next-step>
## Siguiente paso GSD

```
/gsd-discuss-phase agent-forensics-panel
```

Cerrar las 13 preguntas abiertas antes de pasar a `/gsd-research-phase`. En particular:
- Q10 (opción de fix para el bug de etiquetado) → determina si hay migración → determina ordenamiento de plans bajo Regla 5.
- Q7 (dónde vive la spec del bot) → define surface del auditor.
- Q1 (scope del piloto) → define cuántos agent-specs hay que consolidar de arranque.

</next-step>
