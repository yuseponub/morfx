---
phase: agent-godentist-fb-ig
plan: 06
subsystem: agents/godentist-fb-ig
tags: [tests, vitest, sibling-agent, anti-regression, lead-capture, godentist-fb-ig]

dependency_graph:
  requires:
    - "src/lib/agents/godentist-fb-ig/* (Plans 02-05 — sibling module shipped)"
    - "vitest 1.6.x ya configurado en vitest.config.ts"
    - "Mock pattern de somnio-pw-confirmation/__tests__/ (vi.hoisted + vi.mock)"
  provides:
    - "Suite automatizada (6 archivos, 93 tests) blindando el sibling contra regresiones"
    - "Anti-regresion D-08 explicita en CI: cualquier filtracion de TEMPLATE_LOOKUP_AGENT_ID a 'godentist' rompe build"
    - "Pitfall 5 boundary protection (turnCount 0/1/2/5) — off-by-one en lead-capture detectable en CI"
  affects:
    - "Plan 09 verification puede correr `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` y confirmar 0 fallos"
    - "Futuros refactors al sibling tienen safety net antes de merge"

tech_stack:
  added:
    - "Test framework: vitest 1.6.x (ya instalado, sin dependencias nuevas)"
    - "Mock libraries: builtin vi.mock + vi.hoisted"
  patterns:
    - "vi.hoisted para mock fns visibles a vi.mock factories"
    - "TemplateManager mock via vi.mock('@/lib/agents/somnio/template-manager')"
    - "Anthropic SDK mock via vi.mock('@/lib/observability/anthropic-instrumented') — patron NEW en codebase para godentist-fb-ig (no existe en somnio-pw-confirmation)"
    - "createInitialState helper para fixtures sin propiedades faltantes"
    - "type StateOverrides = Omit<Partial<AgentState>,'datos'> & { datos?: Partial<...> } para evitar intersection collision en datos"

key_files:
  created:
    - path: "src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts"
      tests: 16
      coverage: "Pitfall 5 boundary turnCount 0/1/2/5 + intent gating + gates passthrough + camposFaltantes content + timer signal"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts"
      tests: 34
      coverage: "State machine: initial / capturing_data / capturing_fecha / showing_availability / confirming / appointment_registered / closed / wildcard rules + first-match wins (Rule 42 BEFORE Rule 54) + systemEventToKey"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts"
      tests: 15
      coverage: "D-09 lead-capture hook (trigger + passthrough + boundary) + non-data intents + timer_expired path + auto-trigger datos_criticos + informational defer (Rule 29) + partial data timer fallback"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts"
      tests: 9
      coverage: "Mock Anthropic SDK + parsing intent=datos / quiero_agendar / saludo+precio_servicio mixed / idioma=en / malformed sanitization (otro/ninguno) / invalid JSON + missing text content errors"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts"
      tests: 13
      coverage: "Anti-regresion D-08 (3 positive + 3 negative asserts) + English short-circuit lookup + pedir_datos_parcial campos_faltantes + first-turn auto-saludo injection + empty selection fallback + informational mappings (precio_servicio + ubicacion) + sales action mappings (pedir_fecha + mostrar_confirmacion + invitar_agendar + mostrar_disponibilidad)"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts"
      tests: 6
      coverage: "E2E pipeline: lead-capture turn 1 happy path / saludo turn 0 / English short-circuit / escape intent (asesor) -> guards.ts R1 handoff / system event timer_expired:0 retoma_inicial / comprehension error -> success=false safe state"
  modified: []

decisions:
  - "Test fixtures usan datos sinteticos (Juan Perez, 3001234567, Maria Lopez) — cero datos productivos."
  - "Mock Anthropic via @/lib/observability/anthropic-instrumented (no @anthropic-ai/sdk directo) porque el sibling usa createInstrumentedAnthropic — alineado con plan deviation."
  - "Type alias StateOverrides agregado a los 5 test files con makeState helper para typecheck limpio (TypeScript intersection rule)."
  - "Test budget excedido: 93 tests vs target 50-80 — granularidad mas fina en el state machine (34 tests transiciones) y mas casos boundary en lead-capture (16 tests)."
  - "Anti-regresion D-08 cubierta en TRES suites (response-track + agent E2E + verificable via grep) — defense in depth contra Pitfall 1."

metrics:
  duration: "~25 min (Tasks 1-3 sequential, sin restart)"
  completed_date: "2026-05-04"
  test_count_total: 93
  test_count_target: "50-80 (PLAN budget)"
  test_count_per_suite:
    transitions: 34
    lead-capture: 16
    sales-track: 15
    response-track: 13
    comprehension: 9
    agent: 6
  vitest_runtime_seconds: "~19s (Duration 18.90s, transform 5.87s, prepare 22.67s, tests 113ms)"
  commits: 3
---

# Phase agent-godentist-fb-ig Plan 06 Summary: Wave 4 — Tests

## One-liner

6 archivos de test (93 tests, vitest 1.6.x) blindando el sibling contra regresion D-08 (Pitfall 1) y Pitfall 5 (turnCount boundary) — primera suite completa del subsistema godentist (el padre original NO tiene `__tests__/`).

## Commits

| Task | Hash      | Files                                                          | Tests |
| ---- | --------- | -------------------------------------------------------------- | ----- |
| 1    | `4d2a798` | lead-capture.test.ts + transitions.test.ts                     | 50    |
| 2    | `076286a` | sales-track.test.ts + comprehension.test.ts                    | 24    |
| 3    | `97eb40f` | response-track.test.ts + godentist-fb-ig-agent.test.ts (E2E)   | 19    |

**Total:** 3 commits, 6 archivos, 93 tests passed.

## Critical Assertions Verified

### D-08 Anti-Regression (Pitfall 1)

```bash
$ grep -E "expect.*'godentist-fb-ig'" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts
    expect(callArgs[0]).toBe('godentist-fb-ig')
      expect(call[0]).toBe('godentist-fb-ig')
    expect(callArgs[0]).toBe('godentist-fb-ig')
# 3 positive matches

$ grep -E "expect.*not\.toBe.*'godentist'" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts
    expect(callArgs[0]).not.toBe('godentist')
      expect(call[0]).not.toBe('godentist')
    expect(callArgs[0]).not.toBe('godentist')
# 3 negative matches
```

Adicionalmente, `godentist-fb-ig-agent.test.ts` ejecuta los mismos asserts en el flujo E2E (5 de 6 tests E2E asseran que el primer arg de `getTemplatesForIntents` es `'godentist-fb-ig'`).

**Cualquier refactor que filtre `GODENTIST_AGENT_ID` (en vez de `GODENTIST_FB_IG_AGENT_ID`) a `response-track.ts` o `godentist-fb-ig-agent.ts` sera detectado en CI antes de merge.**

### Pitfall 5 — turnCount boundary

```bash
$ grep -c "turnCount: 0" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts
2
$ grep -c "turnCount: 1" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts
26
$ grep -c "turnCount: 2" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts
2
```

Boundary cubierto: 0 (pre-merge), 1 (helper fires), 2 (subsequent turn — ignored), 5 (deep conversation — ignored). Matrix completa: turn x intent (datos / saludo / quiero_agendar / precio_servicio / otro) x gates (NONE / DATOS_OK / DATOS_FECHA_OK) x camposFaltantes (todos / solo_nombre / solo_telefono / nombre+telefono).

### Regla 3 — domain layer (no DB access in tests)

```bash
$ grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/__tests__/
# (vacio — 0 matches)
```

Cero acceso directo a Supabase desde los tests. Todos los mocks aislan dependencias externas (Anthropic SDK, TemplateManager, Dentos availability robot, observability collector).

## Test Suite Runtime

```
$ npx vitest run src/lib/agents/godentist-fb-ig/__tests__/

 ✓ lead-capture.test.ts        (16 tests)  10ms
 ✓ transitions.test.ts         (34 tests)  19ms
 ✓ response-track.test.ts      (13 tests)  38ms
 ✓ sales-track.test.ts         (15 tests)  17ms
 ✓ comprehension.test.ts       ( 9 tests)  18ms
 ✓ godentist-fb-ig-agent.test.ts (6 tests) 17ms

 Test Files  6 passed (6)
      Tests  93 passed (93)
   Duration  18.90s (transform 5.87s, prepare 22.67s, tests 113ms)
```

`tests 113ms` es el costo verdadero — el resto es overhead de transform y prepare (TypeScript compile + module resolution). En CI con caches calientes el ciclo total deberia mantenerse <30s.

## TypeScript Verification

`npx tsc --noEmit` sin errores nuevos en archivos del sibling. Errores pre-existentes en otros modulos (e.g., `src/lib/domain/__tests__/conversations.test.ts` `eqMock` implicit any) son fuera de scope (Rule 5 SCOPE BOUNDARY) — registrados como pre-existing y no introducidos por este plan.

## Mock Strategy

| Mock                                            | Razon                                                                                          | Patron                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `@/lib/observability/anthropic-instrumented`    | Comprehension importa `createInstrumentedAnthropic` (no `Anthropic` directo)                   | vi.hoisted + vi.mock (factory retorna fake client)    |
| `@anthropic-ai/sdk/helpers/zod`                 | `zodOutputFormat` se invoca al armar el request — mock la convierte en no-op                   | vi.mock retorna `{ zodOutputFormat: vi.fn(() => {}) }`|
| `@/lib/agents/somnio/template-manager`          | `TemplateManager` lookups y processing — anti-regresion D-08 vive aqui                         | vi.mock con vi.fn().mockImplementation               |
| `@/lib/observability`                           | Collector silencioso (recordEvent no-op) + runWithPurpose pasa el callback directo            | importOriginal + override solo getCollector + runWith |
| `@/lib/agents/somnio/block-composer`            | `composeBlock` simplificado para no afectar tests del sibling                                  | vi.mock retorna mapa de templates flatten            |
| `../dentos-availability` (E2E only)             | Robot Railway — devolver slots fake                                                            | vi.mock retorna `{ success: true, slots: {...} }`    |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript helper type collision**
- **Found during:** Task 3 typecheck verification (`npx tsc --noEmit`)
- **Issue:** `Partial<AgentState> & { datos?: Partial<...> }` resulta en intersection donde `datos` debe satisfacer AMBOS `Partial<DatosCliente>` y un literal subset → TS rechaza fixtures `{ nombre: 'Juan' }` por faltarle `telefono`, `sede_preferida`, etc.
- **Fix:** Reemplace por `type StateOverrides = Omit<Partial<AgentState>, 'datos'> & { datos?: Partial<AgentState['datos']> }` — ahora el override de `datos` no choca con la firma de `Partial<AgentState>['datos']`.
- **Files modified:** `lead-capture.test.ts`, `transitions.test.ts`, `sales-track.test.ts`, `response-track.test.ts` (4 of 5 fixture-using files; `comprehension.test.ts` y `godentist-fb-ig-agent.test.ts` no usan makeState).
- **Commit:** Folded into Task 3 commit `97eb40f`.

**2. [Rule 1 - Bug] sales-track test assertion sobre `closed` phase + timer_expired**
- **Found during:** Task 2 first vitest run.
- **Issue:** Test esperaba que `timer_expired:0` en phase `closed` retornara reason describing "no transition". Pero `closed + *` es catch-all que matches cualquier `on` (incluso `timer_expired:0`) → retorna accion=`silence`.
- **Fix:** Reemplaze el caso por dos: (a) `closed + timer_expired:0` → silence (catch-all match); (b) `showing_availability + timer_expired:0` → reason "no transition" (no rule for timer:0 en showing_availability).
- **Files modified:** `sales-track.test.ts`
- **Commit:** Task 2 commit `076286a` includes the fix.

**3. [Rule 1 - Bug] E2E English short-circuit test assertion**
- **Found during:** Task 3 first vitest run for `godentist-fb-ig-agent.test.ts`.
- **Issue:** Test envio `intent: 'otro'` con `confidence: 70` para simular mensaje en ingles. Pero `guards.ts` R0 dispara con `confidence < 80 && intent === 'otro'` → bloquea con handoff antes de llegar al short-circuit `idioma=en`.
- **Fix:** Cambio a `intent: 'saludo'` con `confidence: 90` (high confidence + non-otro intent → guard passes → english short-circuit fires).
- **Files modified:** `godentist-fb-ig-agent.test.ts`
- **Commit:** Task 3 commit `97eb40f` includes the fix.

### Manual Decisions

- **Test budget excedido (93 vs 50-80):** Decision conservadora — granular coverage del transition table (34 tests) y boundary cases del lead-capture (16 tests) en vez de hits superficiales. Runtime sigue dentro del rango (~19s) — no impacta CI.
- **Mock TemplateSelection shape:** En lugar de Map<string, AgentTemplate[]> (como sugiere PLAN), usé Map<string, TemplateSelection> que es la firma real exportada de `template-manager.ts`. Tests son mas fieles al contract.

## Status

- Suite ready: 6 archivos, 93/93 tests passed.
- Anti-regresion D-08 (Pitfall 1) cubierta en CI con 6 asserts (3 positive + 3 negative en response-track.test.ts) + 5 asserts adicionales en E2E.
- Pitfall 5 boundary cubierto (turnCount 0/1/2/5 + matrix de intent x gates x camposFaltantes).
- TypeScript compila limpio.
- Cero acceso a Supabase real / Anthropic API real / Robot Railway en tests.
- 3 commits atomicos en git local. NO push (Wave 4 stays local hasta Wave 6 Plan 08).

**Gate Wave 5 (migration apply) puede proceder.**

## Self-Check: PASSED

Verified:
- [x] `src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts` exists (Task 1, commit 4d2a798)
- [x] `src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts` exists (Task 1, commit 4d2a798)
- [x] `src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts` exists (Task 2, commit 076286a)
- [x] `src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts` exists (Task 2, commit 076286a)
- [x] `src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts` exists (Task 3, commit 97eb40f)
- [x] `src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts` exists (Task 3, commit 97eb40f)
- [x] `git log --oneline | grep 4d2a798` → present
- [x] `git log --oneline | grep 076286a` → present
- [x] `git log --oneline | grep 97eb40f` → present
- [x] `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` → 6 suites, 93 tests passed
- [x] `npx tsc --noEmit` → 0 errors in godentist-fb-ig files
- [x] D-08 anti-regression grep → 3 positive + 3 negative
- [x] Pitfall 5 boundary grep → 2 / 26 / 2 (turnCount 0/1/2)
- [x] Regla 3 grep (createAdminClient / supabase-js) → 0 matches
