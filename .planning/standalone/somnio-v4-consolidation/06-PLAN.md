---
phase: somnio-v4-consolidation
plan: 06
type: execute
wave: 3
depends_on: ["02", "03", "04", "05"]
files_modified:
  - .planning/standalone/somnio-v4-consolidation/GATE-W1.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
autonomous: true
requirements: [D-10, D-11]
must_haves:
  truths:
    - "Smoke A y Smoke B re-corridos post-Wave-1 con MISMAS decisiones que el baseline operativo (criterio D-10 escrito en BASELINE.md)"
    - "Gate Regla 6 verde: 3 tests dedicados de no-regresión + grep-gates documentales + diff-cero fuera de la lista permitida extendida"
    - "Todo el trabajo de Wave 1 pusheado a origin/main (Regla 1) — v4 DORMANT, deploy sin riesgo"
  artifacts:
    - path: ".planning/standalone/somnio-v4-consolidation/GATE-W1.md"
      provides: "evidencia del gate de fin de Wave 1: tabla comparativa smokes vs baseline + resultado Regla 6"
      contains: "Smoke A"
  key_links:
    - from: "GATE-W1.md"
      to: "BASELINE.md"
      via: "comparación caso a caso contra el baseline operativo"
      pattern: "baseline"
---

<objective>
Gate de fin de Wave 1 (D-10 + D-11): demostrar que la limpieza de código muerto NO cambió ninguna decisión observable del sistema, que v3/godentist/recompra/pw están byte-idénticos, y pushear.

Purpose: punto de no-retorno verificado antes de empezar la extracción del core (W2). Si algo regresó, se detecta AQUÍ con blast radius de 4 planes, no enredado con la extracción.
Output: GATE-W1.md con evidencia + push a origin/main.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (baseline operativo + criterio de equivalencia D-10)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (Pitfall 9 — leak vectors; Pitfall 12 — política flaky)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-correr suite + Smoke A/B y comparar decisiones vs baseline (D-10)</name>
  <read_first>
    - .planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD + sección "Criterio de equivalencia D-10" + tabla del baseline operativo)
  </read_first>
  <files>.planning/standalone/somnio-v4-consolidation/GATE-W1.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md</files>
  <action>
    1. Correr `npx tsc --noEmit` + SUITE_CMD. Conteo esperado vs baseline: mismo total MENOS los deltas sancionados (−2 escalation.test.ts por D-12/Pitfall 13; ajustes observability/e2e-scenarios por D-16/Pitfall 5). Documentar la aritmética exacta en GATE-W1.md.
    2. Correr Smoke A (`npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts`) y Smoke B (`npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts`).
    3. Crear `GATE-W1.md` con tabla comparativa caso a caso contra el baseline operativo de BASELINE.md: PASS/FAIL/SKIP, templates deterministas, outcome del sub-loop, decisiones de gates. Criterio: MISMAS decisiones; NO byte-equality de texto generativo.
    4. Política flaky (Pitfall 12): si un caso difiere, 1 (un) re-run de ESE caso; si el re-run coincide con el baseline → registrar como flaky, PASS del gate; si persiste la diferencia → REGRESIÓN: parar, no avanzar a W2, reportar con el diff de decisiones.
    5. Commitear GATE-W1.md + SMOKE-*-RESULTS.md frescos: `docs(somnio-v4-consolidation 06): gate fin de Wave 1 — smokes equivalentes al baseline (D-10)`.
  </action>
  <verify>
    <automated>grep -c "Smoke A" .planning/standalone/somnio-v4-consolidation/GATE-W1.md && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - GATE-W1.md existe con tabla de 17 casos Smoke A + 10 casos Smoke B comparados contra baseline
    - GATE-W1.md contiene la aritmética del conteo de suite (baseline − deltas sancionados = actual)
    - Veredicto explícito por smoke: `grep -cE "EQUIVALENTE|REGRESIÓN" GATE-W1.md` ≥ 2
    - Si veredicto = REGRESIÓN en cualquier caso no-flaky: el task TERMINA en estado bloqueado y lo reporta (no se avanza)
  </acceptance_criteria>
  <done>Equivalencia conductual de Wave 1 demostrada y documentada.</done>
</task>

<task type="auto">
  <name>Task 2: Gate Regla 6 (D-11) + push a origin/main</name>
  <read_first>
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 9 (gate de diff con la lista permitida extendida)
    - .claude/rules/agent-scope.md §interruption-system-v2 (los grep-gates actualizados en Plan 04 — ejecutarlos tal como quedaron escritos)
  </read_first>
  <files>.planning/standalone/somnio-v4-consolidation/GATE-W1.md</files>
  <action>
    1. Tests dedicados de no-regresión v3: `npx vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts` + el test recompra-flag (localizar con `ls src/lib/agents/production/__tests__/ | grep recompra`). Los 3 verdes SIN tocar.
    2. Grep-gates documentales: ejecutar los gates de `.claude/rules/agent-scope.md` §interruption-system-v2 tal como quedaron tras Plan 04 (labels = 11, checkpoints = 8, createAdminClient = 0 en interruption-system-v2/).
    3. Gate de diff D-11 EXTENDIDO (Pitfall 2 declarado en Plan 02): contra el commit de baseline (sha registrado en BASELINE.md / fin del Plan 01):
    ```bash
    git diff --name-only <sha_baseline>..HEAD -- src/ \
      ':!src/lib/agents/somnio-v4' \
      ':!src/lib/agents/engine/v4-production-runner.ts' \
      ':!src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts' \
      ':!src/lib/agents/interruption-system-v2' \
      ':!src/inngest/functions/agent-timers-v4.ts'
    ```
    Resultado esperado: VACÍO. Cualquier archivo listado = violación Regla 6 → parar y reportar.
    4. Registrar los 3 resultados en GATE-W1.md sección `## Gate Regla 6 (D-11)`.
    5. Push (Regla 1): `git push origin main`. v4 está DORMANT (0 workspaces) — el deploy no afecta tráfico; el typecheck por commit (D-09) predice el verde de Vercel.
    6. Commit final si hubo cambios al GATE: `docs(somnio-v4-consolidation 06): gate Regla 6 verde + push Wave 1`.
  </action>
  <verify>
    <automated>git diff --name-only $(git merge-base HEAD origin/main)..HEAD 2>/dev/null | head -1; grep -c "Gate Regla 6" .planning/standalone/somnio-v4-consolidation/GATE-W1.md</automated>
  </verify>
  <acceptance_criteria>
    - El comando de diff D-11 extendido retorna 0 líneas (registrado en GATE-W1.md)
    - Los 3 tests Regla 6 verdes (output registrado)
    - Los grep-gates de agent-scope.md ejecutados con resultado esperado (11 labels, 8 ckpts, 0 createAdminClient)
    - `git status` limpio y `git log origin/main..HEAD` vacío tras el push (todo en remoto)
  </acceptance_criteria>
  <done>Wave 1 cerrada, verificada y desplegada; luz verde para la extracción del core.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Deploy a Vercel | v4 DORMANT — el código desplegado no recibe tráfico v4; paths v3/godentist/recompra/pw verificados byte-idénticos antes del push |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-07 | T (Tampering) | agentes en producción (Regla 6) | mitigate | Gate de diff-cero D-11 + 3 tests dedicados ANTES del push; bloqueo duro si falla |
</threat_model>

<verification>
- Smokes equivalentes al baseline per criterio D-10 escrito.
- D-11 diff-cero + tests Regla 6 + grep-gates verdes.
- Push completado.
</verification>

<success_criteria>
- GATE-W1.md con veredicto EQUIVALENTE en ambos smokes (o bloqueo documentado).
- origin/main contiene toda la Wave 1.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/06-SUMMARY.md`.
</output>
