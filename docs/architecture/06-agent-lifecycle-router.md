# Agent Lifecycle Router — Architecture

**Status:** SHIPPED v1 — 2026-04-27 (Somnio rollout)
**Standalone phase:** `.planning/standalone/agent-lifecycle-router/`
**Pending v1.1:** cleanup standalone (~1-2 semanas post-rollout exitoso)

## What it solves

Reemplaza el `if/else` binario hardcoded en `webhook-processor.ts:174-188` (`is_client+recompra_enabled vs default`) por un **decision engine declarativo** editable sin redeploy. Habilita la visión de v2 — agentes especializados por momento del journey del cliente (post-venta vs reactivación vs prospección) — y permite que el cliente final eventualmente edite reglas vía un agente conversacional `routing-builder` (v2 deferred).

## 3-layer model

```
inbound webhook (POST /api/webhooks/whatsapp)
    ↓
webhook-handler.ts → webhook-processor.ts:processIncomingMessage
    ↓
feature flag check (workspace_agent_config.lifecycle_routing_enabled)
    ├── OFF → legacy if/else (preserved inline per D-15, hasta v1.1 cleanup)
    └── ON  → router pipeline:
              [pre-warm agentRegistry: import somnio-recompra/v3/somnio/godentist]
              ↓
              Layer 1 — lifecycle_classifier rules → emits lifecycle_state
              Layer 2 — agent_router rules → emits agent_id (or null = human_handoff)
              ↓
              audit log row (routing_audit_log)
              ↓
              webhook-processor downstream branch (líneas 443-511, sin cambios — el agent_id emitido por el router se inyecta al construir el branch)
```

## Stack

| Componente | Versión | Razón |
|------------|---------|-------|
| `json-rules-engine` | `7.3.1` | Decision engine declarativo. Bus factor mayor que `dmn-engine`, TypeScript-nativo, fit con Supabase JSONB. (D-02) |
| `lru-cache` | `11` | TTL 10s, max 100 workspaces por lambda, expiración lazy. Balance entre escalabilidad (queries DB planas) y staleness aceptable. (D-13) |
| `ajv@8` | (existente) | JSON Schema validation rule-v1.schema.json. `ajv/dist/2020.js` (Draft 2020-12). |

## Database schema

3 tablas nuevas + 1 columna agregada:

| Tabla | Propósito |
|-------|-----------|
| `routing_rules` | Reglas declarativas por workspace. UNIQUE INDEX `uq_routing_rules_priority WHERE active=true` (Pitfall 1: same-priority parallel firing) |
| `routing_facts_catalog` | Vocabulario de facts disponibles. Seedeado con 11 facts. Columna `valid_in_rule_types` filtra qué facts aplican a cada layer (W-3) |
| `routing_audit_log` | Cada decisión del router. `reason CHECK (matched, human_handoff, no_rule_matched, fallback_legacy)` (D-16). Retention 30d para `matched` only via Inngest cron `routing-audit-cleanup` (W-7) |
| `workspace_agent_config.lifecycle_routing_enabled` | Feature flag per-workspace, default `false` (Regla 6) |

## File structure

```
src/lib/agents/routing/
├── schema/
│   ├── rule-v1.schema.json        # JSON Schema (Pitfall 2: leafCondition.additionalProperties:false rechaza `path` field — CVE-2025-1302 jsonpath-plus RCE)
│   └── validate.ts                 # Ajv compiled validator
├── operators.ts                    # 5 custom operators (daysSinceAtMost/AtLeast, tagMatchesPattern, arrayContainsAny/All) — todos honoran America/Bogota tz (Regla 2)
├── facts.ts                        # 10 fact resolvers (activeOrderStage, isClient, recompraEnabled, etc.) + 1 runtime fact (lifecycle_state)
├── engine.ts                       # buildEngine factory (per-request, Pitfall 7: no singleton)
├── cache.ts                        # LRU 10s + version-based revalidation via getMaxUpdatedAt
├── route.ts                        # routeAgent — orquesta Layer 1 → Layer 2 → audit log → output (D-16: 4 reasons)
├── dry-run.ts                      # simulateRules — replay AS-OF-NOW (D-14), NEVER writes audit log (D-10)
├── integrate.ts                    # applyRouterDecision helper (5 dispositions)
└── __tests__/                      # 105 vitest tests

src/lib/domain/
├── routing.ts                      # CRUD + recordAuditLog + getMaxUpdatedAt + listFactsCatalog (UNICO archivo con createAdminClient para routing tables)
├── workspace-agent-config.ts       # NEW — getWorkspaceRecompraEnabled (B-1)
├── orders.ts                       # +4 extensions (getActiveOrderForContact, getLastDeliveredOrderDate, etc.)
├── tags.ts                         # +2 extensions (getContactTags, listAllTags)
├── messages.ts                     # +2 extensions (getLastInboundMessageAt, getInboundConversationsLastNDays — joinean con conversations para contact_id)
└── contacts.ts                     # +1 extension (getContactIsClient)

src/app/(dashboard)/agentes/routing/   # Admin form D-06 (5 surfaces)
├── page.tsx                         # Surface 1: list rules (priority, name, type, output, active toggle)
├── audit/page.tsx                   # Surface 5: audit log viewer
├── editor/page.tsx                  # Surface 2-4: editor (entry)
├── editor/_components/              # editor-client, ConditionBuilder, FactPicker (W-3 filter), TagPicker, SimulateButton
└── _actions.ts                      # Server Actions (Regla 3: invocan domain layer, cero createAdminClient)

supabase/migrations/20260425220000_agent_lifecycle_router.sql   # Schema + RLS + GRANTs + seed catalog

src/inngest/functions/
└── routing-audit-cleanup.ts         # Daily 03:00 Bogota cron — borra rows con reason='matched' AND > 30d
```

## Key constraints + design decisions

- **Domain layer (Regla 3):** `src/lib/domain/routing.ts` es el ÚNICO archivo con `createAdminClient` para tablas routing. Tool handlers + UI Server Actions importan de `@/lib/domain/*` exclusivamente.
- **Timezone Bogota (Regla 2):** Operadores `daysSinceAtMost`/`daysSinceAtLeast` y facts `daysSinceLast*` honoran `America/Bogota` (UTC-5).
- **Default OFF (Regla 6):** Feature flag per-workspace, default `false`. El if/else legacy permanece inline e intacto durante v1 (D-15 strict).
- **Cold lambda race fix (post-rollout 2026-04-27):** Pre-import sincrónico de los 4 agentes (`somnio-recompra`, `somnio-v3`, `somnio`, `godentist`) via `Promise.all([import(...)])` ANTES de `routeAgent` call. Sin esto, lambdas frescas tiran `route.ts:138 → unregistered agent_id` (registry vacío) → fallback_legacy.
- **Pitfall 1 (UNIQUE constraint):** `(workspace_id, rule_type, priority) WHERE active=true` previene same-priority parallel firing en json-rules-engine.
- **Pitfall 2 (CVE-2025-1302):** `rule-v1.schema.json` `leafCondition.additionalProperties: false` rechaza el campo `path` (jsonpath-plus RCE surface).
- **D-16 (4 outputs):** `matched | human_handoff | no_rule_matched | fallback_legacy`. `no_rule_matched` cae a `conversational_agent_id` del workspace (preserva comportamiento legacy "siempre hay agente default").
- **D-10 (dry-run nunca escribe audit log):** Verificado por test + grep `! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts`.
- **D-14 (AS-OF-NOW evaluation):** Dry-run replay evalúa facts contra estado ACTUAL del contacto (no reconstruye estado histórico).

## Production rollout (2026-04-27)

- **Migration applied:** 2026-04-26 (Plan 07 Task 1, ANTES de push de código — Regla 5)
- **Code pushed:** 2026-04-27 (commit `c8de14a`, includes cold-lambda race hotfix)
- **Flag flipped for Somnio:** 2026-04-27 09:09:04 UTC (single SQL UPDATE)
- **Parity validation:** 100% (16 conversations dry-run, 0 changes)
- **Rollback path:** Single SQL UPDATE `lifecycle_routing_enabled=false`. Recovery time <10s (cache TTL).

## v2 roadmap (deferred)

- **`routing-builder` agent conversacional** — usuario habla a un agente para editar reglas. Reutiliza patrón two-step propose→confirm de `crm-writer`. Tabla `routing_proposals` separada.
- **Editor visual avanzado** (`dmn-js`) si crece a 25+ rules.
- **Migration a DMN** si compliance externo lo exige.
- **ML/LLM-based router** para casos de routing semántico (intent en texto libre).
