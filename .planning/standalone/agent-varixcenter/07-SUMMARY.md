---
phase: agent-varixcenter
plan: 07
subsystem: agents-pipeline-registration
tags: [varixcenter, registration, val-guard, regla-6, additive]
requires:
  - "src/lib/agents/varixcenter/index.ts (self-register + processMessage export — Waves 1-3a)"
  - "src/lib/agents/varixcenter/constants.ts (VARIX_CRITICAL_FIELDS — Wave 1)"
provides:
  - "varixcenter registrado en los 6 sitios del pipeline de producción"
  - "VAL guard parametrizado por agentModule (CRITICAL_FIELDS_BY_AGENT)"
  - "agentModule union + observability AgentId incluyen 'varixcenter'"
affects:
  - "src/lib/agents/agent-catalog.ts"
  - "src/lib/agents/production/webhook-processor.ts"
  - "src/lib/agents/engine/v3-production-runner.ts"
  - "src/lib/agents/engine/types.ts"
  - "src/lib/observability/types.ts"
tech-stack:
  added: []
  patterns:
    - "Los 6 sitios de registro (clon godentist-fb-ig) — additive-only para Regla 6"
    - "CRITICAL_FIELDS_BY_AGENT: Record<string, readonly string[]> — divergencia de campos críticos por agente sin romper agentes existentes"
key-files:
  created:
    - ".planning/standalone/agent-varixcenter/07-SUMMARY.md"
  modified:
    - "src/lib/agents/agent-catalog.ts (entry id:'varixcenter')"
    - "src/lib/agents/production/webhook-processor.ts (pre-warm + dispatch branch)"
    - "src/lib/agents/engine/v3-production-runner.ts (agentModule branch + VAL guard parametrizado)"
    - "src/lib/agents/engine/types.ts (agentModule union += 'varixcenter')"
    - "src/lib/observability/types.ts (AgentId union += 'varixcenter')"
decisions:
  - "VAL guard usa CRITICAL_FIELDS_BY_AGENT con fallback a sede_preferida; godentist/godentist-fb-ig intactos (D-05, Regla 6)"
  - "agentModule + AgentId union ampliados aditivamente (no había forma de pasar tsc sin esto — Rule 3 blocking)"
  - "log VAL parametrizado por agentModule + criticalFields reales (accuracy de observabilidad)"
metrics:
  duration: "~25 min"
  tasks: 3
  files-modified: 5
  completed: 2026-06-11
---

# Phase agent-varixcenter Plan 07: 6 sitios de registro + VAL guard parametrizado Summary

Registró el agente `varixcenter` en los 6 sitios del pipeline de producción de forma 100% aditiva (catálogo, pre-warm, dispatch branch, agentModule branch, VAL guard) y parametrizó el VAL guard por agente (`cedula` para varixcenter, `sede_preferida` intacto para godentist/godentist-fb-ig) sin tocar el comportamiento de ningún agente existente — Regla 6 probada con la suite de regresión verde en su baseline exacto (9 suites / 103 tests).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | agent-catalog + pre-warm + dispatch branch (4 de 6 sitios) | c4f7fe7d | agent-catalog.ts, webhook-processor.ts |
| 2 | agentModule branch + VAL guard parametrizado (2 sitios) | 81b43d34 | v3-production-runner.ts, engine/types.ts, observability/types.ts |
| 3 | Verificación de los 6 sitios + regresión Regla 6 | (este SUMMARY) | 07-SUMMARY.md |

## Los 6 sitios — verificación final (grep gates)

| # | Sitio | Gate | Resultado |
| - | ----- | ---- | --------- |
| 1 | AgentRegistry self-register | `grep -c "agentRegistry.register" varixcenter/index.ts` = 1 | ✅ 1 |
| 2 | AGENT_CATALOG | `grep -c "id: 'varixcenter'" agent-catalog.ts` = 1 | ✅ 1 |
| 3 | Pre-warm + dispatch import | `grep -c "import('../varixcenter')" webhook-processor.ts` ≥ 2 | ✅ 2 |
| 4 | Dispatch branch | `grep -c "agentId === 'varixcenter'" webhook-processor.ts` = 1 | ✅ 1 |
| 5 | agentModule branch | `grep -c "agentModule === 'varixcenter'" v3-production-runner.ts` = 1 | ✅ 1 |
| 6 | VAL guard | `grep -cE "agentModule.*!== 'varixcenter'" v3-production-runner.ts` = 1 | ✅ 1 |

Sitio 1 ya existía (Wave 1-3a). Sitios 2-6 agregados en este plan.

## Regla 6 — cero regresión

- **CRITICAL_FIELDS_BY_AGENT** preserva `['nombre','telefono','sede_preferida']` para `godentist` y `godentist-fb-ig`; solo `varixcenter` usa `['nombre','telefono','cedula']` (D-05). Fallback a `sede_preferida` para cualquier agentModule no mapeado.
- **Suite de regresión:** `npx vitest run src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/` → **9 suites passed / 103 tests passed** — idéntico al baseline de `00-WAVE0-AUDIT.md` (9/103).
- **`npx tsc --noEmit` → exit 0** (0 errores), predice deploy Vercel verde.
- Todos los diffs a archivos compartidos son aditivos (solo se reemplazaron líneas para parametrizar el VAL guard; godentist/godentist-fb-ig conservan su comportamiento exacto).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ampliar el type union de `agentModule` + observability `AgentId`**
- **Found during:** Task 2 (tsc tras agregar el branch y el VAL guard)
- **Issue:** `agentModule?` (engine/types.ts:193) y `AgentId` (observability/types.ts:33) no incluían `'varixcenter'` → 4 errores TS2367/TS2322/TS2345 (comparaciones "sin overlap" + asignación de `agentModule: 'varixcenter'` al config del runner + `setRespondingAgentId('varixcenter')`). El plan no listaba estos dos archivos pero sin ellos tsc no pasa.
- **Fix:** agregar `| 'varixcenter'` (aditivo) a ambas uniones. Cero impacto en agentes existentes.
- **Files modified:** src/lib/agents/engine/types.ts, src/lib/observability/types.ts
- **Commit:** 81b43d34

**2. [Rule 2 - Correctness/Observability] Log del VAL tag parametrizado por agente**
- **Found during:** Task 2
- **Issue:** El `console.log` del VAL tag hardcodeaba `[V3-RUNNER][godentist]` + `(nombre+telefono+sede)`, que sería engañoso para varixcenter (usa cedula).
- **Fix:** usar `this.config.agentModule` y `criticalFields.join('+')` en el mensaje. No cambia comportamiento, solo accuracy del log.
- **Files modified:** src/lib/agents/engine/v3-production-runner.ts
- **Commit:** 81b43d34

## Threat Model Coverage

- **T-varix-09 (Tampering — VAL guard rompe godentist):** mitigado. `CRITICAL_FIELDS_BY_AGENT` preserva `sede_preferida` para godentist/godentist-fb-ig; suite de regresión 9/103 verde vs baseline.
- **T-varix-10 (DoS — cold-lambda race):** mitigado. `import('../varixcenter')` agregado al `Promise.all` de pre-warm (Pitfall 2).

## Known Stubs

Ninguno. Todos los sitios de registro están cableados a código real (varixcenter module shipped en Waves 1-3a).

## Self-Check: PASSED

- Archivos modificados existen y contienen los cambios (verificado vía grep gates de los 6 sitios).
- Commits existen:
  - c4f7fe7d (Task 1)
  - 81b43d34 (Task 2)
- tsc=0; regresión godentist+godentist-fb-ig 9 suites/103 tests verde.
