---
phase: agent-godentist-fb-ig
plan: 05
subsystem: agent-routing-registration
tags: [sibling-agent, multi-agent-registration, cold-lambda-prewarm, val-tag-side-effect]
requirements: [GFB-02, GFB-07, GFB-08]
dependency_graph:
  requires:
    - "Plan 02 (verbatim cloned files)"
    - "Plan 03 (adapted module files: config, comprehension, response-track, agent, index)"
    - "Plan 04 (lead-capture helper + sales-track adapted)"
  provides:
    - "Wiring del sibling 'godentist-fb-ig' en los 6 sitios canonicos del codebase"
    - "AgentId / agentModule unions extendidas para reconocer el sibling en el TypeScript layer"
    - "VAL tag side-effect cubre ambos agentes (godentist + godentist-fb-ig) — metricas FB/IG correctas"
  affects:
    - "Plan 06 (tests pueden importar el sibling sin errores TS)"
    - "Plan 07 (migracion templates) habilita activacion via routing rule"
    - "Plan 09 (smoke test del dropdown routing-editor)"
tech-stack:
  added: []
  patterns:
    - "Multi-agent registration pattern (Sites 1-6 — agent-catalog + webhook pre-warm + dispatch branch + types union + runner branch + side-effect import)"
    - "Sibling agent coexistence (D-04 — godentist intact, godentist-fb-ig aditivo)"
    - "Cold-lambda pre-warm via Promise.all gate (Pitfall 2 mitigation)"
    - "VAL tag compound check (Pitfall 6 — extension de condicion runner.ts:597)"
key-files:
  created: []
  modified:
    - "src/lib/agents/agent-catalog.ts (Site 1 — entry godentist-fb-ig)"
    - "src/app/(dashboard)/agentes/routing/editor/page.tsx (Site 6 — side-effect import)"
    - "src/lib/agents/production/webhook-processor.ts (Site 2 + Site 3 — pre-warm + dispatch branch)"
    - "src/lib/agents/engine/types.ts (Site 4 — agentModule union)"
    - "src/lib/agents/engine/v3-production-runner.ts (Site 5 — branch + VAL tag check)"
    - "src/lib/observability/types.ts (Rule 3 deviation — AgentId union extension)"
decisions:
  - "Rule 3 deviation: extend AgentId union in observability/types.ts to unblock setRespondingAgentId('godentist-fb-ig') TS check"
metrics:
  duration: "~30min"
  completed: "2026-05-04"
  tasks: 3
  files: 6
  commits: 3
---

# Phase agent-godentist-fb-ig Plan 05: Wiring del Sibling — Summary

Wave 3 — Registracion del sibling `godentist-fb-ig` en los 6 sitios canonicos del codebase (multi-agent registration pattern). El modulo del sibling (creado en Waves 1-2 por Plans 02-04) ya existia como codigo standalone en `src/lib/agents/godentist-fb-ig/` pero era **codigo muerto** sin las extensiones realizadas en este plan: el agentRegistry no lo conocia en cold lambdas, el webhook no sabia a que processMessage llamar, el routing-editor no ofrecia la opcion en el dropdown, y los leads capturados no recibirian tag VAL (rompiendo metricas).

## Tasks Completed

| Task | Commit | Files | Sites |
|------|--------|-------|-------|
| 1 — Catalog entry + routing-editor side-effect import | `55de892` | `agent-catalog.ts`, `routing/editor/page.tsx` | Site 1 + Site 6 |
| 2 — Pre-warm cold-lambda + dispatch branch | `6b84b23` | `webhook-processor.ts` | Site 2 + Site 3 |
| 3 — agentModule union + runner branch + VAL tag check | `2e0466b` | `engine/types.ts`, `engine/v3-production-runner.ts`, `observability/types.ts` | Site 4 + Site 5 + Rule 3 deviation |

## Sitios Extendidos — Confirmacion grep

| Site | Archivo | Pattern | Esperado | Real |
|------|---------|---------|----------|------|
| 1 | `src/lib/agents/agent-catalog.ts` | `id: 'godentist-fb-ig'` | =1 | ✅ 1 |
| 2 | `src/lib/agents/production/webhook-processor.ts` | `import('../godentist-fb-ig')` | ≥2 | ✅ 2 (pre-warm + dispatch) |
| 3 | `src/lib/agents/production/webhook-processor.ts` | `agentId === 'godentist-fb-ig'` | =1 | ✅ 1 |
| 4 | `src/lib/agents/engine/types.ts` | `godentist-fb-ig` (en union) | ≥1 | ✅ 1 |
| 5 | `src/lib/agents/engine/v3-production-runner.ts` | `godentist-fb-ig` | ≥2 | ✅ 6 (branch + VAL tag + comments) |
| 5b | `src/lib/agents/engine/v3-production-runner.ts` | VAL tag compound check | =1 match | ✅ `if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return` |
| 6 | `src/app/(dashboard)/agentes/routing/editor/page.tsx` | `import '@/lib/agents/godentist-fb-ig'` | =1 | ✅ 1 |

## Anti-Pitfall Verifications

### Anti-Pitfall 2 (B-001 cold-lambda race)
`grep -c "import('../godentist-fb-ig')" webhook-processor.ts` = **2** (≥2 ✅).
- 1 en pre-warm Promise.all (linea ~232) — antes de `routeAgent` para que `route.ts:138` no falle al validar `agent_id` contra registry vacio en cold start.
- 1 en dispatch branch (linea ~796) — lazy import dentro del branch `agentId === 'godentist-fb-ig'`.

### Anti-Pitfall 6 (VAL tag omitido en sibling)
Condicion compuesta presente: `if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return`. Sin esta extension, los leads FB/IG capturados por `godentist-fb-ig` NO recibirian tag VAL → metricas de "Conversation Tags to Contact" mostrarian valoraciones FB/IG = 0 falsamente. Mitigation aplicada en `v3-production-runner.ts:applyGodentistValTagIfNeeded`.

### Anti-Pitfall 8 (casing locked)
Todas las ocurrencias de `godentist-fb-ig` son lowercase con guion (verbatim D-03). 0 instancias de `GodentistFbIg`, `godentist_fb_ig`, ni `godentistFbIg` como string literal en los 6 sitios.

## Q1 RESUELTA — Confirmacion

`src/app/(dashboard)/agentes/routing/editor/page.tsx` solo agrega 1 linea de side-effect import en el bloque de imports (linea 31, despues del import de `somnio-v4`). El editor usa `agentRegistry.list()` directo (linea 65) — el side-effect import dispara `agentRegistry.register(godentistFbIgConfig)` que esta en `index.ts` del sibling, asi `agentRegistry.list()` retorna el sibling automaticamente. NO se modifica `getAgentsForWorkspace()` (esa ruta era para el sandbox, no el routing-editor).

## TypeScript Verification

`npx tsc --noEmit 2>&1 | grep godentist-fb-ig` → 0 errores.

Errores pre-existentes detectados (out-of-scope, NO causados por este plan):
- `src/lib/domain/__tests__/conversations.test.ts:16` — `eqMock` implicit any (TS7022/TS7024). Test file unrelated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AgentId union no contenia 'godentist-fb-ig'**

- **Found during:** Task 3 — TypeScript check after committing types.ts/v3-production-runner.ts changes.
- **Issue:** `getCollector()?.setRespondingAgentId('godentist-fb-ig')` en webhook-processor.ts:800 fallaba con `error TS2345: Argument of type '"godentist-fb-ig"' is not assignable to parameter of type 'AgentId'`. El `AgentId` type es un union diferente al `agentModule` union — vive en `src/lib/observability/types.ts:33` y NO estaba documentado en el plan.
- **Fix:** Extendi el `AgentId` union para incluir `'godentist-fb-ig'`. 1 linea agregada con comentario `// Standalone: agent-godentist-fb-ig (D-03)`.
- **Files modified:** `src/lib/observability/types.ts`
- **Commit:** `2e0466b` (incluido como parte de Task 3 — agrupado porque era el desbloqueo TS necesario para que el branch del sibling compile).
- **Justificacion:** Es un blocking issue causado directamente por las extensiones del plan (sin esto, `npx tsc --noEmit` falla y la tarea no se puede completar). Aplicacion de Regla 3 del executor (auto-fix blocking issues).

## Status del Modulo

- **Registracion completa** en los 6 sitios canonicos del codebase (Sites 1-6).
- **Sibling es funcional end-to-end** desde la perspectiva del codigo: cuando una routing rule emite `agent_id='godentist-fb-ig'`, el flujo completo se ejecuta (cold lambda pre-warm → dispatch → V3ProductionRunner branch → processMessage del sibling → VAL tag side-effect en datosCriticos completion).
- **Falta para activacion productiva:**
  - Plan 06: Tests automatizados (state machine, comprehension, response track, lead-capture E2E).
  - Plan 07: Migracion SQL que clona ~75 templates de godentist a `agent_id='godentist-fb-ig'` con saludo D-05 (sin esto, el TemplateManager devuelve 0 matches y el agente no responde).
  - Plan 08: Push remoto + Regla 5 (apply migracion en prod ANTES de push).
  - Plan 09: Routing rule manual + smoke tests (dropdown muestra "GoDentist Valoraciones — FB/IG", cold start no cae a fallback_legacy).

## Self-Check: PASSED

- `git log --oneline -3` confirma commits `55de892`, `6b84b23`, `2e0466b` ✅
- `git diff --name-only HEAD~3 HEAD` lists 6 files (5 planeados + observability/types.ts deviation) ✅
- `git diff HEAD~3 HEAD -- 'src/lib/agents/godentist/**'` retorna vacio (D-04 satisfecho — zero modifications a godentist original) ✅
- `git diff --diff-filter=D --name-only HEAD~3 HEAD` retorna vacio (zero deletions) ✅
- `npx tsc --noEmit 2>&1 | grep godentist-fb-ig` retorna 0 errores ✅
- Anti-Pitfall 2 grep ≥2 ✅
- Anti-Pitfall 6 compound check presente ✅
- Anti-Pitfall 8 casing lowercase verificado ✅
- Q1 resuelta con 1 linea de import side-effect (no modifica getAgentsForWorkspace) ✅
- 0 push remoto (Wave 3 stays local hasta Wave 6 Plan 08) ✅
