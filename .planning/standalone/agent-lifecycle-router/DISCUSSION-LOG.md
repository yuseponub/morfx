# Standalone: agent-lifecycle-router — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** standalone/agent-lifecycle-router
**Areas discussed:** Architecture (3-layer vs flat), Engine choice (DMN vs json-rules-engine), Lifecycle states v1, Scope v1, Dry-run

---

## Architecture: enum dict vs predicate-ordered classifier vs scoring vs LLM

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded if/else (status quo) | Lo que existe hoy en webhook-processor.ts:174-188 | |
| Pure state machine (enum + dict) | Compute lifecycle_state, dict-lookup state→agent. Mutually exclusive states. | |
| Predicate-ordered (FIRST hit) | Reglas ordenadas por prioridad, primera matchea gana. Output → state | ✓ |
| Pure scoring (each agent declares fit) | Cada agent emite fitScore(context), gana mayor | |
| LangGraph supervisor / OpenAI Swarm / LLM router | LLM decide routing en cada mensaje | |
| Hierarchical / behavior tree | Árbol de decisión jerárquico | |

**User's choice:** Predicate-ordered FIRST hit (DMN-style), which research confirmed is the universal pattern (HubSpot, Salesforce, Intercom, Customer.io, Dialogflow CX all use this).
**Notes:** User pushed back on "lifecycle state machine" being too rigid; investigation revealed states are NOT mutually exclusive in real life (cliente antiguo can have pedido activo). Predicate-ordered with priority resolves this naturally.

---

## Engine choice: DMN vs json-rules-engine

| Option | Description | Selected |
|--------|-------------|----------|
| DMN (dmn-engine + dmn-js) | Estándar OMG, editor visual gratis, audit nativo, FEEL expression language | |
| json-rules-engine | JSON puro, 275k DL/sem, TypeScript fit, composable all/any, custom operators triviales | ✓ |
| Custom 100-line evaluator | Cero deps, control total, semántica FIRST trivial | |
| JSON Logic | Más simple aún, pero menos features (no priority, no event semantics) | |

**User's choice:** json-rules-engine.
**Notes:** Decision NOT driven by setup time alone. Permanent reasons: bus factor (DMN Node ecosystem ~hundreds DL/sem vs 275k), TypeScript type-safety, Supabase JSONB fit, expressiveness for cross-cutting predicates (overlapping tag exclusions). Critically, **user's vision of agents that help clients edit routing structures** strongly favored JSON over DMN-XML — LLMs trained on trillions of JSON tokens, structured outputs natively work with JSON Schema. DMN-XML token cost ~2x, error recovery worse. Migration triggers explicit if needed: 25+ rules / non-tech editors / compliance.

---

## Lifecycle States v1

| Option | Description | Selected |
|--------|-------------|----------|
| 6 estados (recommended) | new_prospect, order_in_progress, in_transit, just_received, dormant_buyer, blocked | |
| 5 estados (mínimo) | new_prospect, active_order, recently_delivered, dormant_buyer, blocked | |
| 8 estados (granular) | Los 6 + abandoned_cart + reactivation_window | ✓ |
| Tú decides exacta | Free text | |

**User's choice:** 8 estados granulares.
**User notes:** "la opcion 3, si acaso quitamos los que no necesitemos" — preferencia por arrancar amplio, recortar después si algunos no se usan. Adding states is trivial; removing in-production states is what breaks consumers.
**Note on first attempt:** Initial question framing was confusing ("removerlos rompe consumidores" hizo dudar al usuario si se podían modificar). Re-asked with clarification that states are mutable, only removal in production has consumer impact.

---

## Scope v1

| Option | Description | Selected |
|--------|-------------|----------|
| Core router + edición SQL (recommended) | v1 mínimo, tú editas via Supabase Studio | |
| Core + admin form simple | v1 + UI básica para CRUD reglas (~2 días extra) | ✓ |
| Core + admin + routing-builder agent | v1 completa con agente conversacional editor (~1 sem extra) | |

**User's choice:** Core + admin form simple.
**Notes:** Equilibrio entre shipping rápido y autonomía operacional. routing-builder agent queda explícitamente para v2 (deferido a CONTEXT.md `<deferred>` section).

---

## Dry-run simulator

| Option | Description | Selected |
|--------|-------------|----------|
| v1 mandatorio (recommended) | Simular cambios contra mensajes históricos antes de aplicar | ✓ |
| v2 | v1 sin simulator, agregar después | |
| Solo logging post-aplicación | Reactive vs preventive | |

**User's choice:** v1 mandatorio.
**Notes:** Critical safety net cuando entre routing-builder agent en v2. Sin simulator, agentes editores son riesgo alto. Default sugerido: simular contra últimos 7 días de mensajes, mostrar before/after distribution + lista de mensajes específicos afectados.

---

## Claude's Discretion (no preguntado al usuario)

- **D-04 (Override tags v1):** Aceptado el set sugerido de 5 (forzar_humano, pausar_agente, forzar_sales_v3, forzar_recompra, vip). Más tags se pueden agregar sin migración (son strings).
- **D-05 (Cache TTL):** 60s + pub/sub invalidation. Implementación queda al planner.
- **D-08 (Vocabulario declarativo):** Mandatorio — consecuencia obligatoria de D-09 v2 (agente editor necesita leer catálogo). En v1 también beneficia editor humano.
- **D-12 (JSON Schema versionado):** Mandatorio — contract crítico para validación on-write y on-load.

## Deferred Ideas

- routing-builder agent conversacional (v2)
- Editor visual avanzado / dmn-js style (v2 si se justifica)
- Migración a DMN (v2 con triggers explícitos)
- Re-routing mid-sesión (requiere refactor session model — fuera de scope)
- Sub-personalidades en un agente (alternative architecture, no descartado)
- ML/LLM-based router para texto libre (hybrid Anthropic-style cuando aparezca caso)
- Portabilidad cross-stack (5+ años, vía export DMN si necesario)

## Investigations leveraged for decisions

1. **Codebase Explore agent** (1 invocación) — mapeó: webhook entry, agentRegistry, current routing logic en webhook-processor.ts:174-188, agent_sessions.agent_id inmutability, recompra-preload-context Inngest pattern, no existing lifecycle_state concept.

2. **Web research agent** (1 invocación) — investigó: LangGraph supervisor/swarm/hierarchical, OpenAI Agents SDK handoffs, Anthropic "Building effective agents" routing pattern, AutoGen SelectorGroupChat, DMN hit policies (FIRST/PRIORITY/COLLECT/ANY/UNIQUE), json-rules-engine, HubSpot/Salesforce/Intercom/Customer.io routing mechanics, Rasa rule policies, Dialogflow CX transition routes.

Key findings cited in conversation:
- Anthropic: "classification can be handled accurately, either by an LLM or a more traditional classification model/algorithm" → endorses deterministic router for structured CRM state
- Universal CRM pattern: ordered FIRST-match rule list (HubSpot, Salesforce, Intercom, Customer.io)
- LLM routing loses on this case: 300-900ms latency, non-deterministic, requires deploy to edit rules
