---
phase: standalone
slug: gemini-fallback-haiku
plan: 05
type: execute
wave: 3
depends_on: [01, 02, 03, 04]
files_modified:
  - docs/analysis/04-estado-actual-plataforma.md
  - .planning/standalone/gemini-fallback-haiku/REGLA6-GATE.md
  - .planning/standalone/gemini-fallback-haiku/LEARNINGS.md
autonomous: false
requirements: [D-01, D-04, D-09, D-10]
user_setup: []

must_haves:
  truths:
    - "La suite canonica v4 (358 passed | 7 skipped baseline) sigue verde + las nuevas suites del fallback pasan — cero regresion (Regla 6)"
    - "El git diff de la fase toca SOLO los 4 call-sites + el modulo llm-fallback/ + sus tests + docs — v3/godentist/recompra/pw-confirmation byte-identicos"
    - "npx tsc --noEmit da 0 errores nuevos antes de cualquier push (memoria: sub-proyectos rompen next build)"
    - "La deuda P1-3 (saturacion Gemini sin fallback) queda documentada como resuelta para v4 en docs/analysis/04-estado-actual-plataforma.md (Regla 4)"
  artifacts:
    - path: ".planning/standalone/gemini-fallback-haiku/REGLA6-GATE.md"
      provides: "evidencia de los greps de no-regresion Regla 6 + resultado de la suite canonica"
    - path: ".planning/standalone/gemini-fallback-haiku/LEARNINGS.md"
      provides: "bugs, decisiones y patrones reusables (MockLanguageModelV3 primer uso, schema saneado Anthropic, predicado maxRetries:0)"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "P1-3 marcada resuelta para v4 (Regla 4)"
  key_links:
    - from: ".planning/standalone/gemini-fallback-haiku/REGLA6-GATE.md"
      to: "los 4 call-sites + modulo llm-fallback"
      via: "git diff --stat verifica paths permitidos"
      pattern: "llm-fallback"
---

<objective>
Gate final de la fase: correr la suite canonica v4 completa + las nuevas suites, verificar Regla 6 (diff acotado a paths permitidos) con greps nominales, `npx tsc --noEmit` 0 errores, actualizar docs (P1-3 resuelta para v4, Regla 4), y dejar el placeholder de LEARNINGS. El push final lo coordina el orquestador/usuario (otra sesion Claude puede estar en main — NO pushear sin confirmar).

Purpose: La leccion central de la fase de consolidacion ("el punto ciego de los mocks") exige un gate que lea el diff con ojos de contrato, no solo asserts. Este plan es ese gate. Tambien cierra la deuda P1-3 documentalmente.
Output: REGLA6-GATE.md con evidencia + docs actualizado + LEARNINGS hook + checkpoint de push.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/gemini-fallback-haiku/CONTEXT.md
@.planning/standalone/somnio-v4-consolidation/LEARNINGS.md
@.planning/standalone/gemini-fallback-haiku/VALIDATION.md

<interfaces>
<!-- Comandos VERBATIM de la suite canonica + gate Regla 6 (LEARNINGS consolidacion, leido). -->

Suite canonica v4 (baseline post-consolidacion: 358 passed | 7 skipped):
```
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
```
(Las nuevas suites del fallback caen dentro de `src/lib/agents/somnio-v4` y `src/lib/agents/media` → ya incluidas en el primer y el media path. Tras esta fase el baseline sube: 358 + nuevos passed | 7 skipped.)

Paths permitidos por la fase (Regla 6):
- src/lib/agents/somnio-v4/llm-fallback/** (nuevo modulo + tests)
- src/lib/agents/somnio-v4/sub-loop/generation-call.ts + compliance-check.ts (Plan 02)
- src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts (Plan 02)
- src/lib/agents/somnio-v4/comprehension.ts (Plan 03)
- src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts (Plan 03)
- src/lib/agents/media/image-classifier.ts (Plan 04)
- src/lib/agents/media/__tests__/image-classifier-fallback.test.ts (Plan 04)
- docs/ + .planning/ (este plan)

NO TOCADOS (byte-identicos): v3 (src/lib/agents/somnio-v3/**), godentist (src/lib/agents/godentist/**, godentist-fb-ig/**), recompra (somnio-recompra/**), pw-confirmation (somnio-pw-confirmation/**), tooling-call.ts (GPT-4.1-mini), core/ (turn-orchestrator/drain/checkpoint-gate/restart-context), claude-client.ts, comprehension-schema.ts.

docs/analysis/04-estado-actual-plataforma.md linea ~768: entrada "v4 comprehension sin fallback ante saturacion de Gemini (DIFERIDO — decision usuario 2026-05-28)" — actualizar a RESUELTA para v4.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gate Regla 6 + suite canonica + tsc --noEmit</name>
  <read_first>
    - .planning/standalone/somnio-v4-consolidation/LEARNINGS.md (comando suite canonica + gate Regla 6 nominal)
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q8 (Pitfall #9 — paths permitidos)
  </read_first>
  <action>
Determinar el commit base de la fase (el commit anterior al primero de esta fase). Como otra sesion puede estar en main, usar el SHA del ultimo commit ANTES de empezar gemini-fallback-haiku (registrar al inicio; si no se registro, usar el merge-base o el primer commit de la fase con `git log --oneline --grep="gemini-fallback"`).

Ejecutar y capturar en `.planning/standalone/gemini-fallback-haiku/REGLA6-GATE.md`:

1. **Suite canonica v4 + nuevas suites:**
```bash
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
```
Esperado: baseline previo (358 passed | 7 skipped) + las nuevas suites del fallback verdes. Documentar el nuevo conteo.

2. **tsc --noEmit:**
```bash
npx tsc --noEmit
```
Esperado: 0 errores nuevos atribuibles a archivos de la fase. (Pueden quedar pre-existentes test-only fuera de scope — documentar cuales son pre-existentes vs nuevos.)

3. **Gate Regla 6 — diff acotado** (`<BASE>` = commit base de la fase):
```bash
git diff --stat <BASE>..HEAD -- src/lib/
```
Esperado: SOLO los 8 paths permitidos de src/lib/ (4 call-sites + 5 archivos del modulo + 3 test files). Verificar que NO aparece ningun archivo de v3/godentist/recompra/pw-confirmation/core/tooling-call/claude-client/comprehension-schema.

4. **Greps nominales de no-regresion** (cada uno debe ser VACIO):
```bash
git diff <BASE>..HEAD -- src/lib/agents/somnio-v3/                    # vacio
git diff <BASE>..HEAD -- src/lib/agents/godentist/                   # vacio
git diff <BASE>..HEAD -- src/lib/agents/godentist-fb-ig/             # vacio
git diff <BASE>..HEAD -- src/lib/agents/somnio-recompra/             # vacio
git diff <BASE>..HEAD -- src/lib/agents/somnio-pw-confirmation/      # vacio
git diff <BASE>..HEAD -- src/lib/agents/somnio-v4/core/              # vacio (D-04 — sin tocar core)
git diff <BASE>..HEAD -- src/lib/agents/somnio-v4/sub-loop/tooling-call.ts  # vacio (GPT-4.1-mini, D-01 FUERA)
git diff <BASE>..HEAD -- src/lib/agents/claude-client.ts             # vacio (Pitfall #10 — no tocar el mapping stale)
git diff <BASE>..HEAD -- src/lib/agents/somnio-v4/comprehension-schema.ts   # vacio (D-25)
```

5. **Grep negativo de claude-client en el modulo + call-sites** (LANDMINE Pitfall #10):
```bash
grep -rn "claude-client" src/lib/agents/somnio-v4/llm-fallback/ src/lib/agents/somnio-v4/sub-loop/generation-call.ts src/lib/agents/somnio-v4/sub-loop/compliance-check.ts src/lib/agents/somnio-v4/comprehension.ts src/lib/agents/media/image-classifier.ts
# Esperado: 0 matches
```

6. **Grep positivo de fallback wiring en los 4 call-sites:**
```bash
grep -rl "callWithGeminiFallback" src/lib/agents/somnio-v4/sub-loop/generation-call.ts src/lib/agents/somnio-v4/sub-loop/compliance-check.ts src/lib/agents/somnio-v4/comprehension.ts src/lib/agents/media/image-classifier.ts | wc -l
# Esperado: 4
```

Escribir TODO el output (conteos + verdicto OK/FAIL por check) en `REGLA6-GATE.md`. Si CUALQUIER check falla → NO continuar a Task 2, reportar el fallo.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'</automated>
  </verify>
  <acceptance_criteria>
    - REGLA6-GATE.md existe con los 6 checks documentados y verdicto OK
    - Suite canonica verde: >= 358 passed (baseline) + nuevas suites del fallback, 7 skipped
    - `npx tsc --noEmit` 0 errores nuevos atribuibles a archivos de la fase
    - `grep -rn "claude-client" {modulo + 4 call-sites}` == 0 (Pitfall #10)
    - `grep -rl "callWithGeminiFallback" {4 call-sites} | wc -l` == 4
    - git diff de v3/godentist/recompra/pw-confirmation/core/tooling-call/claude-client/comprehension-schema VACIO (Regla 6)
  </acceptance_criteria>
  <done>REGLA6-GATE.md con evidencia de suite canonica verde, tsc limpio, diff acotado a paths permitidos, byte-identidad de los 5 agentes no-v4 + core + tooling-call + claude-client + comprehension-schema.</done>
</task>

<task type="auto">
  <name>Task 2: Actualizar docs P1-3 (Regla 4) + LEARNINGS hook</name>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (linea ~768 — entrada P1-3 v4 comprehension sin fallback)
    - .planning/templates/LEARNINGS-TEMPLATE.md (template del proyecto)
    - .planning/standalone/somnio-v4-consolidation/LEARNINGS.md (formato de referencia)
  </read_first>
  <action>
**Docs (Regla 4):** En `docs/analysis/04-estado-actual-plataforma.md`, actualizar la entrada de la linea ~768 ("v4 comprehension sin fallback ante saturacion de Gemini — DIFERIDO"). Marcarla RESUELTA para v4: el fallback Gemini→Haiku 4.5 con circuit-breaker cubre los 4 call-sites Gemini de v4 (comprehension, generation, compliance, vision) via el modulo `src/lib/agents/somnio-v4/llm-fallback/`. Detallar: deteccion N=1 (maxRetries:0 + predicado de saturacion), breaker in-memory cooldown 30s + probe half-open, paridad de shape (schema saneado para Anthropic en comprehension por Pitfall min/max), observability 6 labels pipeline_decision. Anotar la deuda que QUEDA: tooling-call (GPT-4.1-mini) NO entra (no es Gemini); generalizar a shared es standalone futuro; el mapping stale `claude-haiku-4-5`→Sonnet en claude-client.ts sigue vivo (no tocado por Regla 6 — deuda anotada).

Si el cambio toca el estado de modulos, revisar tambien si hay seccion de "Deuda Tecnica" que liste P1-3 para actualizarla.

**LEARNINGS hook:** Crear `.planning/standalone/gemini-fallback-haiku/LEARNINGS.md` siguiendo el template del proyecto. Dejar las secciones con los aprendizajes ya conocidos del proceso (se completaran al final con los del executor):
- **Decisiones tecnicas:** in-memory breaker (no Redis) por N=1; tiering colapsado a un solo modelo (claude-3-5-haiku retirado); maxRetries:0 cambia el error a APICallError crudo.
- **Patrones reusables:** predicado isGeminiSaturation; FSM breaker con __resetBreakers para tests; MockLanguageModelV3 (PRIMER USO en el proyecto — documentar como referencia); schema saneado para Anthropic (Pitfall min/max).
- **Pitfalls confirmados/refutados:** placeholder para que el executor anote cuales del RESEARCH (#1, #5, #7, #11) se confirmaron en runtime.
- **Deuda creada:** claude-client.ts mapping stale; P95 reales pendientes (defaults usados); smoke E2E real con saturacion inyectada (manual, diferido a activacion v4).
  </action>
  <verify>
    <automated>test -f .planning/standalone/gemini-fallback-haiku/LEARNINGS.md && grep -c "Haiku 4.5\|llm-fallback\|circuit" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - docs/analysis/04-estado-actual-plataforma.md menciona el fallback resuelto: `grep -c "llm-fallback\|Haiku 4.5\|circuit-breaker" docs/analysis/04-estado-actual-plataforma.md` >= 1
    - La entrada P1-3 ya NO dice solo "DIFERIDO" sin contexto de resolucion: el texto incluye "resuelt" o "RESUELTA" para v4
    - `.planning/standalone/gemini-fallback-haiku/LEARNINGS.md` existe con las secciones decisiones/patrones/pitfalls/deuda
    - LEARNINGS menciona MockLanguageModelV3 como primer uso: `grep -c "MockLanguageModelV3" .planning/standalone/gemini-fallback-haiku/LEARNINGS.md` >= 1
  </acceptance_criteria>
  <done>docs actualizado (P1-3 resuelta para v4, Regla 4); LEARNINGS.md creado con decisiones, patrones reusables y deuda.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Fallback Gemini→Haiku 4.5 completo en los 4 call-sites Gemini de v4 + modulo llm-fallback/ + suite canonica verde + Regla 6 gate (5 agentes no-v4 byte-identicos) + docs P1-3 resuelta. Todos los commits estan LOCAL (no pusheados).
  </what-built>
  <how-to-verify>
    1. Revisar `.planning/standalone/gemini-fallback-haiku/REGLA6-GATE.md` — confirmar suite canonica verde + diff acotado.
    2. Decidir el push: otra sesion Claude puede tener commits en main (HANDOFF: el push de auth-hardening estaba pendiente de decision). ANTES de pushear: `git pull --rebase origin main` + stage explicito por path (NUNCA `git add -A`). NO pushear si hay commits ajenos sin push pendientes de tu decision.
    3. Opcional pre-flip RAG: smoke v4 en /sandbox con Gemini saboteado (API key google invalida en local) → verificar respuesta via Haiku + eventos fallback_triggered/circuit_opened en el debug panel (Manual-Only de VALIDATION.md).
    4. v4 esta DORMANT en prod + sandbox = bajo riesgo; el push a Vercel (Regla 1) aplica cuando decidas.
  </how-to-verify>
  <resume-signal>Escribe "approved" + tu decision de push (pushear ahora / esperar / coordinar con la otra sesion), o describe issues encontrados.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Diff de la fase → agentes en produccion | Un edit accidental fuera de scope rompe la byte-identidad de v3/godentist/recompra/pw-confirmation (Regla 6) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-09 | Tampering | regresion silenciosa en agente no-v4 | mitigate | Gate Regla 6 nominal por archivo: git diff de cada agente no-v4 + core + tooling-call + claude-client + comprehension-schema debe ser VACIO; suite canonica 358 baseline verde |
| T-fb-10 | Information Disclosure | push con commits ajenos | accept | git pull --rebase + stage explicito por path; checkpoint humano decide el push (coordinacion con sesion concurrente) |
</threat_model>

<verification>
- Suite canonica v4 verde (>= 358 passed | 7 skipped) + nuevas suites.
- `npx tsc --noEmit` 0 errores nuevos.
- git diff acotado a los 8 paths de src/lib/ + docs/ + .planning/.
- 5 agentes no-v4 + core + tooling-call + claude-client + comprehension-schema byte-identicos.
- docs P1-3 resuelta para v4 (Regla 4).
</verification>

<success_criteria>
- REGLA6-GATE.md con evidencia completa y verdicto OK.
- docs/analysis/04-estado-actual-plataforma.md con P1-3 resuelta para v4.
- LEARNINGS.md creado.
- Checkpoint de push resuelto por el usuario (coordinacion sesion concurrente).
</success_criteria>

<output>
After completion, create `.planning/standalone/gemini-fallback-haiku/05-SUMMARY.md`
</output>
