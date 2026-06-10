---
phase: somnio-v4-consolidation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/standalone/somnio-v4-consolidation/BASELINE.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
autonomous: true
requirements: [D-08]
must_haves:
  truths:
    - "Existe BASELINE.md con el resultado canónico de la suite v4 completa (conteo exacto de tests passed) PRE-cambios"
    - "Existe snapshot verbatim de los resultados Smoke A/B previos ANTES de re-correr los smokes (Pitfall 11: los smokes sobrescriben sus archivos de resultados)"
    - "El estado git sucio de SMOKE-A/B-RESULTS.md quedó resuelto (commiteado) para que el baseline sea reproducible"
    - "BASELINE.md registra el comando canónico de suite (SUITE_CMD) que todos los planes posteriores usan como gate D-09"
  artifacts:
    - path: ".planning/standalone/somnio-v4-consolidation/BASELINE.md"
      provides: "Baseline lock D-08: snapshot pre-run + suite canónica + decisiones Smoke A/B frescas"
      contains: "SUITE_CMD"
  key_links:
    - from: "BASELINE.md"
      to: "todos los gates D-09/D-10 de planes 02..12"
      via: "comparación contra conteo de tests y decisiones PASS/FAIL registradas"
      pattern: "Smoke A|Smoke B|SUITE_CMD"
---

<objective>
Baseline lock (D-08): congelar el estado de validación del sistema v4 ANTES de tocar una sola línea de código. Correr suite completa + Smoke A + Smoke B y registrar resultados en BASELINE.md. Todo gate posterior (D-09 por commit, D-10 por wave) compara contra este baseline.

Purpose: un refactor de equivalencia conductual sin baseline no tiene criterio de regresión. Este plan ES el criterio.
Output: `.planning/standalone/somnio-v4-consolidation/BASELINE.md` + estado git limpio de los archivos de smoke.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (secciones: Validation Architecture, Pitfall 11, Pitfall 12, Open Question 3)
@.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
@.planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Resolver estado git sucio + snapshot pre-run de Smoke A/B</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md (estado actual en working tree — está MODIFICADO sin commitear)
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md (ídem)
    - Salida de `git diff .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` y `git diff .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md` (qué cambió vs lo commiteado)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 11 + §Open Question 3
  </read_first>
  <files>.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md, .planning/standalone/somnio-v4-consolidation/BASELINE.md</files>
  <action>
    1. Inspeccionar el diff sucio de SMOKE-A-RESULTS.md y SMOKE-B-RESULTS.md. Commitearlos AS-IS con mensaje: `docs(somnio-v4-consolidation): congela estado pre-baseline de SMOKE-A/B-RESULTS (working tree sucio resuelto — Open Question 3)`. Esto hace reproducible el punto de partida. NO editarlos antes de commitear.
    2. Crear `.planning/standalone/somnio-v4-consolidation/BASELINE.md` con la sección `## Snapshot pre-run (estado al 2026-06-10, último run documentado 2026-06-05)` que copia VERBATIM las tablas de decisiones de ambos archivos: para cada caso de Smoke A (17 casos) y Smoke B (10 casos): id del caso, PASS/FAIL/SKIP, templates deterministas emitidos, outcome del sub-loop (generated/no_match/handoff) y decisiones de gates si están registradas. Anotar la procedencia: "copiado de SMOKE-A/B-RESULTS.md tal como estaban antes de cualquier cambio de este standalone (commit <sha del paso 1>)".
    3. Anotar también la referencia D-10 del CONTEXT: baseline documental 2026-06-05 = Smoke A 15/17, Smoke B 1/3 + 7 SKIP. Si los archivos actuales muestran números distintos (ej. commit a9afcae0 menciona 14/17), registrar AMBOS números y dejar explícito que el baseline OPERATIVO será la corrida fresca del Task 3 (D-08: "todo gate posterior compara contra ese baseline").
  </action>
  <verify>
    <automated>git status --porcelain .planning/standalone/somnio-v4-rag-generative/ | wc -l  # debe ser 0 tras el commit</automated>
  </verify>
  <acceptance_criteria>
    - `git status --porcelain .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md` retorna vacío
    - `grep -c "Snapshot pre-run" .planning/standalone/somnio-v4-consolidation/BASELINE.md` ≥ 1
    - BASELINE.md contiene una fila/entrada por cada uno de los 17 casos de Smoke A y 10 de Smoke B (verificable: `grep -cE "PASS|FAIL|SKIP" BASELINE.md` ≥ 27)
    - BASELINE.md menciona el sha del commit de congelado (`grep -E "[0-9a-f]{7,}" BASELINE.md`)
  </acceptance_criteria>
  <done>Estado git limpio en somnio-v4-rag-generative/ y snapshot pre-run verbatim en BASELINE.md.</done>
</task>

<task type="auto">
  <name>Task 2: Fijar suite canónica v4 (SUITE_CMD) + correr typecheck y suite completa</name>
  <read_first>
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Validation Architecture (comando full suite + inventario de suites)
  </read_first>
  <files>.planning/standalone/somnio-v4-consolidation/BASELINE.md</files>
  <action>
    1. Correr `npx tsc --noEmit` — debe salir limpio (es el predictor del verde de Vercel; regla de memoria del proyecto).
    2. Establecer el comando canónico de suite v4 SIN smokes LLM (los smokes son gate de wave D-10, no gate por commit D-09). Punto de partida:
    ```
    npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
    ```
    Verificar empíricamente que `smoke-rag-a.test.ts` y `smoke-rag-b.test.ts` NO corren con ese comando (el output de vitest lista los archivos ejecutados). Si `--exclude` no funciona en vitest 1.6.1 con paths posicionales, sustituir el directorio `src/lib/agents/somnio-v4` por la lista explícita de los 16 archivos de test no-smoke de `src/lib/agents/somnio-v4/__tests__/` y registrar ESE comando.
    3. Correr el comando final. Registrar en BASELINE.md sección `## Suite canónica (D-09)`: el comando exacto bajo el encabezado `SUITE_CMD`, número de test files, número de tests passed/skipped, y duración. Este conteo es el número canónico que el audit estimaba en ~209 (RESEARCH A2: el número EXACTO lo fija este task).
    4. Si algún test sale rojo ANTES de tocar nada: PARAR y reportar — el baseline debe ser verde; un rojo pre-existente es un bloqueante que el usuario debe conocer.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "SUITE_CMD" .planning/standalone/somnio-v4-consolidation/BASELINE.md</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exit code 0
    - La corrida de SUITE_CMD termina con 0 failed
    - BASELINE.md contiene `SUITE_CMD` con el comando literal y la línea de conteo (`grep -E "[0-9]+ (passed|tests)" BASELINE.md` ≥ 1)
    - El output de vitest registrado NO incluye smoke-rag-a ni smoke-rag-b (`grep -c "smoke-rag" <sección suite de BASELINE.md>` = 0 en la lista de archivos ejecutados)
  </acceptance_criteria>
  <done>BASELINE.md fija SUITE_CMD + conteo canónico; suite verde pre-cambios.</done>
</task>

<task type="auto">
  <name>Task 3: Correr Smoke A + Smoke B frescos y registrar el baseline operativo</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts (header: a dónde persiste resultados y cómo decide skipIf)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 12 (no-determinismo LLM; política de 1 re-run)
  </read_first>
  <files>.planning/standalone/somnio-v4-consolidation/BASELINE.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md</files>
  <action>
    1. Verificar que `.env.local` tiene las keys LLM (los smokes hacen skipIf sin keys — un SKIP masivo invalidaría el baseline; si las keys faltan, PARAR y reportar).
    2. Correr `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` y luego `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts`. Estos runs SOBRESCRIBEN los SMOKE-*-RESULTS.md (esperado — el snapshot pre-run ya está protegido en Task 1).
    3. Registrar en BASELINE.md sección `## Baseline operativo (corrida fresca 2026-06-10)` por cada caso: PASS/FAIL/SKIP, templates deterministas emitidos, outcome del sub-loop, decisiones de gates. Comparar contra el snapshot pre-run: si un caso difiere del documentado 2026-06-05, anotarlo como flaky conocido con ambos valores (Pitfall 12 — el criterio D-10 permitirá 1 re-run de un caso flaky comparando la DECISIÓN, no el texto).
    4. Escribir en BASELINE.md la sección `## Criterio de equivalencia D-10 (fijado ANTES de tocar código)`: mismos PASS/FAIL que este baseline operativo, mismos templates deterministas, mismos outcomes del sub-loop (generated/no_match/handoff), mismas decisiones de gates; NO se exige byte-equality del texto generativo; 1 re-run permitido por caso flaky.
    5. Commitear BASELINE.md + los SMOKE-*-RESULTS.md frescos: `docs(somnio-v4-consolidation): baseline lock D-08 — suite canónica + Smoke A/B operativos`.
  </action>
  <verify>
    <automated>grep -c "Baseline operativo" .planning/standalone/somnio-v4-consolidation/BASELINE.md && grep -c "Criterio de equivalencia D-10" .planning/standalone/somnio-v4-consolidation/BASELINE.md</automated>
  </verify>
  <acceptance_criteria>
    - BASELINE.md contiene las 4 secciones: "Snapshot pre-run", "Suite canónica", "Baseline operativo", "Criterio de equivalencia D-10"
    - La sección de baseline operativo tiene 17 entradas Smoke A + 10 entradas Smoke B
    - `git status --porcelain .planning/standalone/` retorna vacío (todo commiteado)
  </acceptance_criteria>
  <done>BASELINE.md completo y commiteado; el sistema tiene su criterio de regresión congelado.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Ninguna nueva | Plan solo de documentación/medición; no toca código ni superficies de input |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-01 | I (Information Disclosure) | BASELINE.md | accept | Los resultados de smokes pueden contener texto generado con datos de prueba — son datos sintéticos del sandbox, sin PII real |
</threat_model>

<verification>
- `npx tsc --noEmit` verde.
- SUITE_CMD verde con conteo registrado.
- Smoke A/B corridos con keys reales (no skip masivo).
- git limpio en `.planning/standalone/`.
</verification>

<success_criteria>
- BASELINE.md existe con snapshot pre-run + suite canónica + baseline operativo + criterio D-10 escrito ANTES de cualquier cambio de código.
- Estado git de SMOKE-A/B-RESULTS.md resuelto (Open Question 3 cerrada).
- Cero cambios en `src/` (este plan no toca código — verificable: `git diff --name-only <inicio>..HEAD -- src/` vacío).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/01-SUMMARY.md` (incluye: SUITE_CMD final, conteo canónico, divergencias flaky detectadas vs 2026-06-05).
</output>
