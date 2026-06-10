---
phase: somnio-v4-consolidation
plan: 12
type: execute
wave: 9
depends_on: ["11"]
files_modified:
  - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md
  - src/lib/agents/somnio-v4/ARCHITECTURE.md
  - .claude/rules/agent-scope.md
  - .planning/standalone/somnio-v4-consolidation/GATE-W2.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
autonomous: true
requirements: [D-07, D-10, D-11]
must_haves:
  truths:
    - "INTERRUPTION-PARITY.md ya no es contrato de paridad de mecanismo (el mecanismo es código único en core/) — documenta SOLO las diferencias legítimas de adapters"
    - "Smoke A y Smoke B post-Wave-2 con MISMAS decisiones que el baseline operativo (D-10)"
    - "Gate Regla 6 final verde: diff-cero fuera de la lista permitida extendida en TODO el standalone, 3 tests dedicados verdes"
    - "Todo pusheado a origin/main; el flip RAG (Plan 08 de somnio-v4-rag-generative) correrá sus smokes sobre código ya consolidado (D-02)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md"
      provides: "doc reducido y re-titulado: diferencias de adapters prod↔sandbox"
      contains: "adapters"
    - path: ".planning/standalone/somnio-v4-consolidation/GATE-W2.md"
      provides: "evidencia del gate final: smokes vs baseline + Regla 6 + aritmética de suite"
  key_links:
    - from: "INTERRUPTION-PARITY.md"
      to: "src/lib/agents/somnio-v4/core/"
      via: "referencia al mecanismo único (turn-orchestrator/drain/checkpoint-gate/restart-context)"
      pattern: "core/"
---

<objective>
Cierre del standalone: D-07 (reducir y re-titular INTERRUPTION-PARITY.md — la paridad ahora es por construcción) + gate de fin de Wave 2 (D-10 smokes + D-11 Regla 6) + docs finales + push.

Purpose: dejar el sistema documentado como ES, verificado como EQUIVALENTE, y desplegado — listo para el flip RAG (D-02).
Output: PARITY reducido, ARCHITECTURE con la sección core/, GATE-W2.md, push.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-07, D-10, D-11, D-02)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (baseline operativo + criterio D-10)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (Pitfalls 9, 12)
</context>

<tasks>

<task type="auto">
  <name>Task 1: D-07 — reducir y re-titular INTERRUPTION-PARITY.md + sección core/ en ARCHITECTURE.md</name>
  <read_first>
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md (COMPLETO — qué secciones describen mecanismo (ahora código único → fuera) y cuáles describen diferencias de adapters (se quedan))
    - src/lib/agents/somnio-v4/core/ (los 5 archivos finales: types, turn-orchestrator, drain, restart-context, checkpoint-gate — y sandbox-adapters.ts) — el doc nuevo referencia esto
    - src/lib/agents/somnio-v4/ARCHITECTURE.md (tabla de archivos actualizada en Plan 05 — ahora se añade core/)
    - .claude/rules/agent-scope.md §interruption-system-v2 (bullet "Contrato de paridad producción ↔ sandbox" que cita INTERRUPTION-PARITY.md y la "regla de oro" de código duplicado — quedó obsoleto)
  </read_first>
  <files>src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md, src/lib/agents/somnio-v4/ARCHITECTURE.md, .claude/rules/agent-scope.md</files>
  <action>
    1. Reescribir INTERRUPTION-PARITY.md (D-07): nuevo título tipo "Diferencias de adapters prod ↔ sandbox (somnio-v4)". Contenido:
       - Preámbulo: el mecanismo de interrupción/restart es CÓDIGO ÚNICO en `src/lib/agents/somnio-v4/core/` desde somnio-v4-consolidation (2026-06) — la paridad es por construcción; ya NO existe la regla de "mantener dos copias alineadas a mano" (el bug del 2026-05-28 con fix doble es la clase de error eliminada).
       - Tabla de diferencias LEGÍTIMAS de adapters: envío real WhatsApp (V4MessagingAdapter CKPT-7.N) vs stream NDJSON sintético (sandbox-adapters); persistencia DB/sesión (commitTurn B7) vs memoria; timing real vs simulateProdTimingMs; CKPT-6a pending-templates + crash-recovery `_v3:pendingUserMessage` + no-repetición = capabilities prod-only que el sandbox NO implementa (métodos opcionales ausentes); contrato de error success:false+code (prod) vs success:true+'[Error v4]' (sandbox, UX intencional); sandbox-result write vía onResultReady.
       - Regla de mantenimiento nueva: cambios al mecanismo → SOLO en core/; cambios a un lado → solo en su adapter/wrapper.
    2. ARCHITECTURE.md: añadir sección "core/ — orquestación de turno unificada" con la tabla de los archivos core (nombre, rol, líneas via wc -l) y actualizar la tabla de archivos §1 (runner y engine con sus nuevos conteos como wrappers); actualizar el diagrama §2.0 si menciona el restart loop como parte del runner.
    3. `.claude/rules/agent-scope.md`: actualizar el bullet "Contrato de paridad producción ↔ sandbox" — ahora referencia el doc reducido y la regla nueva (prod y sandbox COMPARTEN el core; los adapters son lo único que difiere). Mantener la instrucción de leerlo antes de tocar la lógica de interrupción.
    4. Commit: `docs(somnio-v4-consolidation 12): D-07 PARITY reducido a diferencias de adapters + ARCHITECTURE con core/`.
  </action>
  <verify>
    <automated>grep -ci "adapters" src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md && grep -c "core/" src/lib/agents/somnio-v4/ARCHITECTURE.md</automated>
  </verify>
  <acceptance_criteria>
    - INTERRUPTION-PARITY.md menciona `core/` y "por construcción" (`grep -c "por construcción" ...` ≥ 1)
    - El doc ya NO contiene instrucciones de mantener dos implementaciones alineadas (`grep -ci "NO comparten código" src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` = 0)
    - ARCHITECTURE.md lista los archivos de core/ (`grep -c "turn-orchestrator" src/lib/agents/somnio-v4/ARCHITECTURE.md` ≥ 1)
    - agent-scope.md actualizado (`grep -c "core" .claude/rules/agent-scope.md` aumenta en la sección interruption-system-v2)
  </acceptance_criteria>
  <done>Los docs describen el sistema consolidado, no el histórico.</done>
</task>

<task type="auto">
  <name>Task 2: Gate fin de Wave 2 — Smoke A/B vs baseline (D-10) + Regla 6 total (D-11) + push</name>
  <read_first>
    - .planning/standalone/somnio-v4-consolidation/BASELINE.md (criterio D-10 + sha baseline)
    - .planning/standalone/somnio-v4-consolidation/GATE-W1.md (formato de evidencia a replicar)
  </read_first>
  <files>.planning/standalone/somnio-v4-consolidation/GATE-W2.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md, .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md</files>
  <action>
    1. `npx tsc --noEmit` + SUITE_CMD + `npx vitest run src/lib/agents/somnio-v4/core/__tests__/` — todo verde. Documentar la aritmética del conteo (baseline − 2 escalation + N drain.test nuevos ± carve-outs D-16).
    2. Smoke A + Smoke B (mismos comandos del Plan 01). Comparar decisiones caso a caso vs baseline operativo (política flaky Pitfall 12: 1 re-run por caso). Tabla en GATE-W2.md con veredicto EQUIVALENTE/REGRESIÓN por smoke. REGRESIÓN no-flaky → parar y reportar (no push).
    3. Regla 6 total (todo el standalone, desde el sha baseline del Plan 01):
    ```bash
    git diff --name-only <sha_baseline>..HEAD -- src/ \
      ':!src/lib/agents/somnio-v4' \
      ':!src/lib/agents/engine/v4-production-runner.ts' \
      ':!src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts' \
      ':!src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts' \
      ':!src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts' \
      ':!src/lib/agents/interruption-system-v2' \
      ':!src/inngest/functions/agent-timers-v4.ts'
    ```
    → debe ser VACÍO. + 3 tests dedicados Regla 6 verdes + grep-gates de agent-scope.md (11 labels, 8 ckpts, 0 createAdminClient en interruption-system-v2/ y en somnio-v4/core/).
    4. Registrar todo en GATE-W2.md + nota de cierre: el standalone deja v4 DORMANT consolidado; siguiente paso del rumbo = flip RAG (Plan 08 de somnio-v4-rag-generative) sobre este código (D-02).
    5. Commit + push: `docs(somnio-v4-consolidation 12): gate fin de Wave 2 — equivalencia D-10 + Regla 6 diff-cero` y `git push origin main` (Regla 1; v4 DORMANT — sin riesgo de tráfico).
  </action>
  <verify>
    <automated>grep -c "Smoke A" .planning/standalone/somnio-v4-consolidation/GATE-W2.md && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - GATE-W2.md con tabla 17+10 casos vs baseline y veredicto explícito por smoke
    - Comando diff D-11 retorna 0 líneas (output registrado en GATE-W2.md)
    - 3 tests Regla 6 + grep-gates verdes (registrados)
    - `git log origin/main..HEAD` vacío tras push (todo en remoto) y `git status` limpio
  </acceptance_criteria>
  <done>Standalone cerrado: 9 mecanismos equivalentes al baseline, Regla 6 intacta, código en remoto.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Deploy a Vercel | v4 DORMANT; equivalencia D-10 + Regla 6 verificadas ANTES del push |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-18 | T (Tampering) | agentes prod (Regla 6) en el diff acumulado del standalone | mitigate | Gate diff-cero sobre TODO el rango baseline..HEAD (no solo el último plan) antes del push |
</threat_model>

<verification>
- Suite + core tests + smokes equivalentes al baseline (criterio D-10 escrito en Plan 01).
- D-11 diff-cero acumulado + tests Regla 6 + grep-gates.
- Push completado.
</verification>

<success_criteria>
- D-07 implementado: PARITY reducido a diferencias de adapters.
- D-10/D-11 verificados sobre el estado final.
- origin/main contiene el standalone completo; v4 consolidado y DORMANT, listo para el flip RAG (D-02).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/12-SUMMARY.md`. Recordatorio para el cierre de fase: LEARNINGS.md es obligatorio (config del proyecto) — documentar especialmente Pitfalls 1/3/4 (claims del audit corregidos por research) y el patrón extracción-con-characterization-tests.
</output>
