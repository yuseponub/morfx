---
phase: agent-varixcenter
plan: 11
subsystem: agent-scope-docs + activation
tags: [varixcenter, agent-scope, routing-rule, regla-5, regla-6, cierre]
requires: [07, 08, 09, 10]
provides:
  - "scope documentado de varixcenter en agent-scope.md (BLOQUEANTE Regla agent-scope.md)"
  - "entrada resumida en CLAUDE.md (Regla 4)"
  - "SQL pre-formado de routing rule (12-ROUTING-RULE-USER-ACTION.md)"
  - "código pusheado a Vercel (Regla 5 — migración ya en prod)"
affects:
  - .claude/rules/agent-scope.md
  - CLAUDE.md
  - .planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md
tech-stack:
  added: []
  patterns:
    - "agente sibling ADITIVO (Regla 6) — patrón godentist-fb-ig reusado"
    - "primer agente MorfX que ESCRIBE en DB externa (cross-project, service_role)"
    - "activación 100% manual via routing rule (D-02, sin feature flag)"
key-files:
  created:
    - .planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md
  modified:
    - .claude/rules/agent-scope.md
    - CLAUDE.md
decisions:
  - "rule_type correcto = 'agent_router' (NO 'router') — CHECK constraint + motor routing"
  - "workspace_agent_config sin row → INSERT con lifecycle_routing_enabled=true (ON CONFLICT DO UPDATE)"
  - "los 5 matches 'godentist' en varixcenter son aserciones anti-regresión en __tests__/ (intencionales)"
metrics:
  duration: "~12 min"
  completed: 2026-06-11
---

# Phase agent-varixcenter Plan 11: Cierre (scope + routing rule + push) Summary

Documentado el scope del agente `varixcenter` en `agent-scope.md` (BLOQUEANTE) + entrada resumida en `CLAUDE.md`, generado el SQL pre-formado de la routing rule multi-canal (WA+FB+IG) en `12-ROUTING-RULE-USER-ACTION.md`, verificado end-to-end (6 grep gates + 240/240 tests + tsc=0) y pusheado a Vercel (Regla 5 — la migración de templates ya estaba en prod desde Wave 5). La activación final (crear la routing rule) queda como acción manual del operador (D-02 / Regla 6).

## Tareas Completadas

| Task | Nombre | Commit | Archivos |
|------|--------|--------|----------|
| 1 | Documentar scope (agent-scope.md + CLAUDE.md) — BLOQUEANTE | `d8834f4d` | .claude/rules/agent-scope.md, CLAUDE.md |
| 2 | SQL routing rule + verificación final | `5f43ec38` | 12-ROUTING-RULE-USER-ACTION.md |

Push a origin/main: `2e899e82..5f43ec38` (incluye también el código del agente de waves previas ya committeado).

## Verificación End-to-End

| Check | Resultado |
|-------|-----------|
| G1 `agentRegistry.register` en index.ts | 1 ✓ |
| G2 `id: 'varixcenter'` en agent-catalog.ts | 1 ✓ |
| G3 `import('../varixcenter')` en webhook-processor.ts | 2 ✓ (pre-warm + dispatch) |
| G4 `agentId === 'varixcenter'` en webhook-processor.ts | 1 ✓ |
| G5 `agentModule === 'varixcenter'` en v3-production-runner.ts | 1 ✓ |
| G6 `agentModule.*!== 'varixcenter'` en v3-production-runner.ts | 1 ✓ (VAL guard) |
| ANTI createClient/admin/supabase-js en varixcenter/ | 0 ✓ (Regla 3) |
| ANTI 'godentist' en varixcenter NO-test | 0 ✓ (anti-cdc06d9) |
| Suites varixcenter + varix-clinic + godentist + godentist-fb-ig | 16 files / **240/240** verde ✓ |
| Baseline godentist (Regla 6) | 103/103 intacto dentro de los 240 ✓ |
| `tsc --noEmit` | exit 0 ✓ (deploy verde) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `rule_type` corregido de `'router'` a `'agent_router'`**
- **Found during:** Task 2 (al generar el SQL desde el template godentist-fb-ig)
- **Issue:** El template de la sección godentist-fb-ig en `agent-scope.md` usa `rule_type` `'router'`. La tabla `routing_rules` tiene `CHECK (rule_type IN ('lifecycle_classifier', 'agent_router'))` (migración `20260425220000_agent_lifecycle_router.sql`) y el motor de routing (`cache.ts:25`, `dry-run.ts:167`) sólo reconoce `'agent_router'`. Un INSERT con `'router'` fallaría la CHECK constraint.
- **Fix:** El SQL generado en `12-ROUTING-RULE-USER-ACTION.md` usa `'agent_router'` y documenta la corrección con una nota explícita.
- **Files modified:** `.planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md`
- **Commit:** `5f43ec38`
- **Nota:** la doc de godentist-fb-ig en `agent-scope.md` mantiene `'router'` (no la toqué — fuera del scope de este plan; es deuda doc pre-existente de ese agente, probablemente su rule real se creó manualmente con el valor correcto).

**2. [Rule 2 - Missing critical] INSERT de `workspace_agent_config` con ON CONFLICT**
- **Found during:** Task 2 (checkpoint_state advirtió que el workspace no tiene row)
- **Issue:** El workspace Varixcenter `c6621640-...` no tiene row en `workspace_agent_config` (Wave 0 audit). Un `UPDATE ... SET lifecycle_routing_enabled=true` no afectaría 0 filas y el lifecycle router no se activaría.
- **Fix:** El SQL usa `INSERT ... ON CONFLICT (workspace_id) DO UPDATE`, idempotente. Verifiqué el shape real de la tabla en la migración `20260209000000_agent_production.sql`: única columna NOT NULL sin default = `workspace_id` (PK); el resto tiene defaults (incl. `conversational_agent_id='somnio-sales-v1'`, irrelevante porque las routing rules deciden el agente por canal). Documentado en el doc.
- **Files modified:** `.planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md`
- **Commit:** `5f43ec38`

## Nota sobre el gate anti-godentist

El plan especifica `grep -rn "'godentist'" src/lib/agents/varixcenter/` = 0. El grep crudo retorna 5 matches, **todos en `__tests__/`** y todos son aserciones anti-regresión intencionales (`.not.toBe('godentist')`) que verifican que el agente NUNCA usa la constante de godentist (Pitfall 1 / anti-cdc06d9). El código NO-test tiene **0 matches** — que es la intención real del gate. Documentado en la sección de validación de agent-scope.md.

## Acción Manual Pendiente (human-action — Task 3)

La activación final NO la ejecuta Claude (es human-action). El operador debe seguir `12-ROUTING-RULE-USER-ACTION.md`:
1. Agregar env vars `VARIX_CLINIC_SUPABASE_URL` + `VARIX_CLINIC_SERVICE_ROLE_KEY` en Vercel (BLOQUEANTE — sin ellas el booking hace fail-open → handoff).
2. Verificar dropdown "Varixcenter Valoraciones" en `/agentes/routing/editor`.
3. Ejecutar el SQL (INSERT workspace_agent_config + INSERT routing_rules priority 100).
4. Smoke real: mensaje de prueba → bot responde con templates varixcenter + cita aparece en varix-clinic.
5. LEARNINGS.md + MEMORY del proyecto.

## Self-Check: PASSED
