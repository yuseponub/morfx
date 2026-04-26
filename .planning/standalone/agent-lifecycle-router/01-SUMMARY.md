---
phase: agent-lifecycle-router
plan: 01
wave: 0
status: complete
completed: 2026-04-26
---

# Plan 01 Summary — Wave 0 Schema + Schema + Snapshot

## What was built

Wave 0 entrega la base infraestructural para que Waves 1–3 compilen y testeen sin tocar producción. Cero código ejecutado en prod (Regla 5).

### 1. SQL migration file
- `supabase/migrations/20260425220000_agent_lifecycle_router.sql` — 3 tablas nuevas + ALTER + RLS + GRANTs + seed catalog (commit `d276c01`)
- `routing_rules` con UNIQUE INDEX `uq_routing_rules_priority` WHERE active=true (Pitfall 1 — same-priority parallel firing)
- `routing_facts_catalog` con 11 facts iniciales seedeados (incluye `lifecycle_state` y `recompraEnabled` con `valid_in_rule_types=ARRAY['agent_router']` por W-3)
- `routing_audit_log` con `reason CHECK (matched | human_handoff | no_rule_matched | fallback_legacy)` (D-16)
- `workspace_agent_config.lifecycle_routing_enabled boolean NOT NULL DEFAULT false` (D-15 + Regla 6)
- 3 RLS policies (workspace_isolation pattern siguiendo agent_templates)
- 6 GRANTs explícitos (LEARNING 1 Phase 44.1)
- **NO aplicada en prod** — apply en Plan 07 Task 1 (Regla 5 strict)

### 2. JSON Schema
- `src/lib/agents/routing/schema/rule-v1.schema.json` (commit `4cc013b`)
- Draft 2020-12, `$id: "https://morfx.app/schemas/routing/rule-v1.json"`
- 8 `lifecycle_state` enum: new_prospect, order_in_progress, in_transit, just_received, dormant_buyer, abandoned_cart, reactivation_window, blocked (D-03)
- 15 operators: stock json-rules-engine + custom (daysSinceAtMost, daysSinceAtLeast, tagMatchesPattern, arrayContainsAny, arrayContainsAll)
- **`leafCondition.additionalProperties: false`** rechaza el campo `path` (Pitfall 2 mitigation — CVE-2025-1302 jsonpath-plus RCE surface)

### 3. Snapshot baseline
- `.planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md` (commit `40cdd85`)
- 5 queries ejecutadas en Supabase prod 2026-04-26
- Resumen baseline:
  - **2 workspaces** con `workspace_agent_config`: Somnio + GoDentist (ambos con `agent_enabled` y `recompra_enabled = true`)
  - **Tags productivas**: solo legacy skip-tags (RECO 2,600 / P/W 669 / WPP 152). Las 6 override D-04 NO existen aún (admin las crea bajo demanda)
  - **998 pedidos activos** en últimos 30d distribuidos en 3 pipelines (Logistica 437, Ventas Somnio Standard 498, ENVIOS SOMNIO 57). Mapping logical_kind: 524 preparation / 350 delivered / 57 transit / 67 terminal_closed
  - **Somnio**: 21,295 contactos (80.8% clients = 17,204 / 19.2% prospects = 4,091)
  - **Volumen mensajes inbound Somnio**: ~3,902 últimos 30d (~126/día, ~38 conversaciones/día)
- Decision = ✅ proceder a Wave 1

### 4. Inngest cron (W-7 retention)
- `src/inngest/functions/routing-audit-cleanup.ts` (commit `2182d48`)
- Daily 03:00 America/Bogota — borra `routing_audit_log` rows con `reason='matched'` AND `created_at < NOW() - 30d`
- Preserva indefinidamente: `human_handoff`, `no_rule_matched`, `fallback_legacy` (forensics)
- Pattern: copia de `observability-purge.ts` (Phase 42.1 Plan 08)
- Registrado en `src/app/api/inngest/route.ts` array de functions

## Verification

Todos los criterios de aceptación en VALIDATION.md → ✅:
- ✅ Migration file con timestamp posterior a `20260424141545`
- ✅ 3 CREATE TABLE + UNIQUE INDEX uq_routing_rules_priority + ADD COLUMN lifecycle_routing_enabled + 3 RLS + 6 GRANTs + 11 facts seed
- ✅ JSON Schema parseable, sin field `path`, 8 lifecycle states, custom operators presentes
- ✅ Snapshot capturado con outputs reales (no placeholders), Decision marcada
- ✅ Inngest cron registrado y compila (project tsc green)
- ✅ NADA aplicado en producción

## Wave 1 readiness

- ✅ Plan 02 puede arrancar — `rule-v1.schema.json` existe para Ajv compile, schemas conocidos para domain CRUD
- ✅ Plan 07 tiene baseline para parity validation Somnio
- ✅ El if/else legacy en `webhook-processor.ts:174-188` permanece intacto (Regla 6) — flag default false hasta Plan 07 Task 4

## Commits

- `d276c01` — migration SQL (Task 1)
- `4cc013b` — JSON Schema rule-v1 (Task 2)
- `40cdd85` — snapshot baseline (Task 3 + retention policy doc)
- `2182d48` — Inngest cron (Task 4)

## Notes for Wave 1+

- **Pipeline stage names** observados en producción Somnio (Q3) no son canónicos `preparation/transit/delivered`. El resolver `activeOrderStage` (Plan 03) debe mapear textualmente: ej. `CONFIRMADO|SOMNIO ENVIOS|AGENDADO|BOGOTA|FALTA *|NUEVO *` → `preparation`; `REPARTO|ENVIA|NOVEDAD|OFI INTER|COORDINADORA` → `transit`; `ENTREGADO|SOLUCIONADA` → `delivered`. Considerar si se prefiere mapping en código o vía nueva columna `pipeline_stages.kind` (esto último haría schema cleaner pero requiere migración adicional — discutir en Plan 02).
- **Override tags D-04 no existen** en Somnio aún. La regla legacy parity (priority 900, B-1) NO depende de ellas, así que esto NO bloquea Plan 07 dry-run. El admin (humano) puede crearlas vía UI normal de tags cuando desee usarlas en una regla.
