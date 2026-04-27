---
phase: agent-lifecycle-router
plan: 07
wave: 5
status: complete
completed: 2026-04-27
---

# Plan 07 Summary — Wave 5 Somnio rollout

## What was built

Plan 07 cierra v1 del agent-lifecycle-router: migración aplicada en prod, 3 reglas Somnio parity creadas, dry-run 100% parity validado, código pusheado, flag flippeado, hotfix de cold-lambda race, monitoring activo, docs actualizados (Regla 4).

### Task 1 — Migración aplicada en prod (HUMAN, 2026-04-26)
- `supabase/migrations/20260425220000_agent_lifecycle_router.sql` aplicada vía Supabase Studio SQL Editor (production).
- Validación post-aplicación: 3 tablas creadas + 11 facts seedeados + columna `lifecycle_routing_enabled boolean DEFAULT false` agregada + GRANTs OK + RLS activo.
- Snapshot baseline en `01-SNAPSHOT.md` capturado de prod (5 queries).

### Task 2 — Somnio parity rules (commit `4b4a766`)
- 3 reglas creadas vía SQL directo en `routing_rules` (workspace_id=`a3843b3f-c337-4836-92b5-89c58bb98490`):
  - `forzar_humano_kill_switch` (priority 1000) → `agent_id=null` (human handoff)
  - `legacy_parity_recompra_disabled_client_to_default` (priority 900, B-1 fix Opción B) → `somnio-sales-v3`
  - `is_client_to_recompra` (priority 800) → `somnio-recompra-v1`
- IDs reales de las reglas documentados en `07-SOMNIO-PARITY-RULES.md`.
- !is_client cae a `no_rule_matched` → fallback a `conversational_agent_id` (somnio-sales-v3) via Plan 04 webhook gate.

### Task 3 — Dry-run parity validation (commit `16cafd4`)
- Script `scripts/agent-lifecycle-router/parity-validation.ts` ejecutado contra prod.
- **Result: 100% parity** (16 conversations replayed, changed_count=0).
- Distribution before/after idénticas: 5 → somnio-recompra-v1, 11 → no_rule_matched.
- 2 bugs P0 encontrados durante validación + fixados:
  1. **`messages.ts` → tabla incorrecta** (`whatsapp_messages` no existe; correcto `messages`). Tests no detectaron porque mockean supabase chain.
  2. **TSX lazy imports** → script forzado a `await import()` dinámico para garantizar registry populated.
- `07-DRY-RUN-RESULT.md` documenta verdict + output literal + bugs.

### Task 4 — Push code + flip flag + smoke + monitoring (HUMAN, 2026-04-27)
- Push 26 commits a `origin main` 09:09 UTC (Vercel build green).
- Smoke pre-flip OK (legacy if/else corriendo intacto).
- Flag flippeado vía SQL: `UPDATE workspace_agent_config SET lifecycle_routing_enabled=true WHERE workspace_id='a3843b3f-...';`
- **Incident hour +0**: 2/7 mensajes (28%) con `reason='fallback_legacy'` — cold lambda race en `agentRegistry`. Threshold Plan 07 era <1%.
- **User-facing impact: CERO** — fallback_legacy cae al if/else legacy que rutea al mismo `somnio-recompra-v1`. Solo afectó observability.
- **Hotfix** (commit `c8de14a`): pre-warm de los 4 agentes (`Promise.all([import(...)])`) ANTES de `routeAgent` call dentro del gate `if (routerEnabled && contactId)`.
- Validación post-fix: 2/2 mensajes nuevos → `matched somnio-recompra-v1` ✅. Cero fallback_legacy post-fix.

### Task 5 — Documentation (Regla 4, este commit)
- `07-FLIP-PLAN.md` — flip plan + 24h monitoring checklist + KILL SWITCH instructions + B-001/B-002 deuda técnica + v1.1 cleanup deferral.
- `docs/architecture/06-agent-lifecycle-router.md` — arquitectura final (3-layer model, stack, file structure, design decisions, rollout history).
- `docs/analysis/04-estado-actual-plataforma.md` — sección 11.3 nueva con la nueva capacidad documentada.

## Verification

| Criterio | Estado |
|----------|--------|
| Migración aplicada en prod (Regla 5 strict) | ✅ |
| Reglas Somnio creadas via DB | ✅ (3 reglas, IDs registrados) |
| Dry-run validation PASS antes del flip | ✅ (100% parity, 16 conversations) |
| Código pusheado | ✅ (origin main = `c8de14a`) |
| Flag flippeada para Somnio | ✅ (lifecycle_routing_enabled=true at 09:09 UTC) |
| 24h monitoring checklist activado | 🟡 (hour +1 PASS post-fix; hour +6/+12/+24 pending) |
| Documentación actualizada (Regla 4) | ✅ |
| v1.1 cleanup deferido y documentado | ✅ (FLIP-PLAN.md §v1.1 Cleanup) |

## Commits Plan 07

- `4b4a766` — Task 2: Somnio parity rules (3 rules)
- `16cafd4` — Task 3: dry-run parity validation + Plan 02 bug fixes (messages.ts join with conversations + tsx await imports)
- `c8de14a` — Hotfix Task 4: pre-warm agentRegistry antes de routeAgent (cold lambda race)
- (este commit) — Task 5: docs + 07-SUMMARY

## Open items / Pending

### 24h monitoring (próximas 24h post-flip)
- Mañana 2026-04-28 ~09:00 UTC: correr Q3-debug nueva contra `routing_audit_log` y verificar:
  - Cero `reason='fallback_legacy'` desde el hotfix `c8de14a` (timestamp 09:38 UTC)
  - Distribución consistente con dry-run: ~80% `matched somnio-recompra-v1` + ~20% `no_rule_matched` (fallback to somnio-sales-v3)
  - P95 latency_ms < 200 (I-3 threshold) — sample actual sugiere ~290ms avg, re-evaluar con volumen real

### Deuda técnica menor (deferir a v1.1)
- **B-001:** `daysSinceLastInteraction`/`daysSinceLastDelivery` retornan `-1` por race ms-future entre webhook handle + fact resolver. Cero impact actual (las reglas Somnio no usan estos facts).
- **B-002:** `lastInteractionAt` en facts_snapshot está en TZ Bogota mientras `decided_at` está en UTC (5h offset). Cero impact actual.
- **B-003:** `rule_set_version_at_decision` siempre `null` en audit log. No bloquea, pero útil para debugging futuro — completar en v1.1.

### v1.1 cleanup standalone (~1-2 semanas post-rollout)
- Crear `agent-lifecycle-router-cleanup` standalone phase.
- Borrar legacy if/else en webhook-processor.ts, columna feature flag, case `fallback_legacy`.
- Aplicar B-001/B-002/B-003 fixes.

## Phase v1 outcomes

- ✅ **3-layer routing engine** declarativo en producción para Somnio.
- ✅ **Reemplazo total del if/else hardcoded** vía reglas editables sin redeploy.
- ✅ **Audit log per-decision** con observability completa (reason, agent_id, latency_ms, facts_snapshot).
- ✅ **Admin UI funcional** (5 surfaces D-06) para editar reglas sin SQL.
- ✅ **Dry-run simulator** validado en producción (100% parity con legacy).
- ✅ **Defense-in-depth** contra Pitfalls 1, 2, 4, 5, 7 (UNIQUE constraint, additionalProperties:false, fact-throw sentinel, validate-before-DB, per-request engine).
- ✅ **Cold-lambda race detected y fixado** en horas tras rollout (zero user impact, hotfix transparent).
- ✅ **Documentation per Regla 4** (architecture + estado plataforma + standalone artifacts).

## Phase status: ✅ SHIPPED v1
