---
phase: somnio-v4-consolidation
plan: 05
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/ARCHITECTURE.md
  - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md
  - .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md
autonomous: true
requirements: [D-17]
must_haves:
  truths:
    - "runLegacySubLoop ya no existe — se llama runCrmMutationSubLoop (está VIVO: es el motor del crm-gate; el nombre 'legacy' invitaba a borrarlo por error)"
    - "El export público runSubLoop y el export runCrmSubLoop NO cambiaron de nombre — crm-gate.ts compila sin tocar su import"
    - "ARCHITECTURE.md ya no menciona invocations.ts (archivo inexistente), G-1/G-2/G-3 figuran cerrados y el pipeline §2.0 refleja el flujo real post-híbrido (slot resolver + crm-gate)"
    - "AUDIT-2026-06-10.md tiene la corrección de los claims que el research refutó (Pitfalls 1, 3, 4)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "rename runLegacySubLoop→runCrmMutationSubLoop + runLegacySubLoopRaw→runCrmMutationSubLoopRaw"
      contains: "runCrmMutationSubLoop"
  key_links:
    - from: "src/lib/agents/somnio-v4/crm-gate.ts"
      to: "sub-loop/index.ts"
      via: "import { runCrmSubLoop } from './sub-loop' — INTACTO"
      pattern: "runCrmSubLoop"
---

<objective>
Wave 1 — D-17: rename del sub-loop CRM (M-6) + sincronización de docs con la realidad del código (M-7). El nombre "legacy" en una función VIVA es una trampa; los docs desactualizados son deuda que el W2 agravaría.

Purpose: nombres y docs honestos antes de la reestructuración del core.
Output: rename interno sin cambio de API pública + ARCHITECTURE.md/PARITY §6/AUDIT corregidos.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-17)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (§State of the Art — lista exacta de lo desactualizado en docs; Pitfalls 1, 3, 4, 5)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§sub-loop/index.ts — sites :265, :746, :949-954, :980)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename runLegacySubLoop → runCrmMutationSubLoop (interno, sin cambio de API)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (sites verificados: comentario :29, call :265, def runLegacySubLoopRaw :746, comentarios :740-742 y :949, def runLegacySubLoop :953, call :954, call :980 dentro de runCrmSubLoop)
    - src/lib/agents/somnio-v4/crm-gate.ts (:42 import + :338 call de runCrmSubLoop — SOLO LECTURA, no debe necesitar cambios)
  </read_first>
  <files>src/lib/agents/somnio-v4/sub-loop/index.ts</files>
  <action>
    1. En `sub-loop/index.ts`, rename mecánico en TODO el archivo:
       - `runLegacySubLoop` → `runCrmMutationSubLoop` (definición ~:953, call site ~:265, comentarios ~:29/:949)
       - `runLegacySubLoopRaw` → `runCrmMutationSubLoopRaw` (definición ~:746, calls ~:954/:980, comentarios ~:740-742)
    2. Ambas funciones son INTERNAS al archivo (verificado: cero refs en tests, cero imports externos — `grep -rn "runLegacySubLoop" src/ --include="*.ts" | grep -v "sub-loop/index.ts"` debe dar 0 ANTES del rename). Los exports públicos `runSubLoop` y `runCrmSubLoop` NO cambian.
    3. Añadir una línea al comentario de la definición: `// Renombrada de runLegacySubLoop (D-17): está VIVA — es el motor del crm-gate vía runCrmSubLoop. "Legacy" invitaba a borrarla por error.`
    4. Cero cambios de lógica (diff = renames + comentario).
    5. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes (las 7 suites del sub-loop ~80 its no deben requerir ni un cambio — las funciones son internas). Commit: `refactor(somnio-v4-consolidation 05): D-17 rename runLegacySubLoop→runCrmMutationSubLoop (función viva, motor del crm-gate)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -rn "runLegacySubLoop" src/ --include="*.ts" | wc -l  # debe ser 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "runLegacySubLoop" src/ --include="*.ts"` retorna 0 matches
    - `grep -c "runCrmMutationSubLoop" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 4 (def + raw def + calls)
    - `git diff --name-only` para este task = solo `src/lib/agents/somnio-v4/sub-loop/index.ts` (crm-gate.ts NO necesitó cambios)
    - SUITE_CMD verde con cero asserts cambiados; `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/` verde sin tocar esos tests
  </acceptance_criteria>
  <done>Nombre honesto; API pública intacta; suite del sub-loop sin un cambio.</done>
</task>

<task type="auto">
  <name>Task 2: Sincronizar ARCHITECTURE.md + PARITY §6 + corrección del AUDIT</name>
  <read_first>
    - src/lib/agents/somnio-v4/ARCHITECTURE.md (completo: §0 tabla con "Mutations CRM: invocations.ts", §1 tabla de archivos con line counts, §2.0 diagrama de pipeline con pasos executeInvocations/createOrder inline, §4.2 con G-1/G-2/G-3)
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md (§6 — caveat RAG-send)
    - .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md (claims M-2 "nadie lo consume" y M-4)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §State of the Art (párrafo "Deprecated/outdated tras este standalone" — es la checklist de este task)
  </read_first>
  <files>src/lib/agents/somnio-v4/ARCHITECTURE.md, src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md, .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md</files>
  <action>
    Aplicar la checklist exacta del RESEARCH §State of the Art:
    1. ARCHITECTURE.md §0: quitar la fila/mención "Mutations CRM: invocations.ts" (el archivo NO existe — el CRM real corre vía crm-gate + runCrmSubLoop desde el big-bang D-06 del crm-subloop).
    2. ARCHITECTURE.md §2.0: actualizar el diagrama del pipeline al flujo real post-híbrido: el paso 9/10 (executeInvocations / createOrder inline) se reemplaza por: comprehension → guards → state machine → slot resolver (escalación a sub-loop RAG por low_confidence/razonamiento_libre) → sales/response track → crm-gate (post-sales-track, invoca runCrmSubLoop grounded) → return al runner (envío post-return).
    3. ARCHITECTURE.md §4.2: marcar G-1 y G-2 como cerrados (con una línea de cómo) y G-3 como cerrado por D-14 de este standalone (branch fallback borrado + warning v4_messages_without_templates).
    4. ARCHITECTURE.md §1 tabla de archivos: eliminar la fila invocations.ts; actualizar line counts gruesos (somnio-v4-agent.ts ya no es 1008 — usar `wc -l` real post-Plan 02; engine-v4.ts ídem) y añadir nota "counts al 2026-06-10, cambiarán en W2 (core/)".
    5. ARCHITECTURE.md: actualizar toda mención de `runLegacySubLoop` → `runCrmMutationSubLoop` (`grep -n "runLegacySubLoop" src/lib/agents/somnio-v4/ARCHITECTURE.md`).
    6. INTERRUPTION-PARITY.md §6: marcar el caveat RAG-send como OBSOLETO con nota: "desde el híbrido, el slot resolver emite pseudo-templates rag:* por el path de templates — el caveat ya no aplica". NO reducir el doc entero todavía (eso es D-07, Plan 12 — solo esta corrección factual).
    7. AUDIT-2026-06-10.md: añadir sección `## Correcciones post-research (2026-06-10, somnio-v4-consolidation)`: (a) M-2/D-13: el claim "nadie lo consume" era incorrecto — 3 consumidores type-coupled (agent-timers-v4, engine-v4 DebugTurn, sandbox/types) resueltos en Plan 02 per Pitfall 1; (b) descubrimiento: mapOutcomeToAgentOutput (~233 líneas) estaba entera muerta — borrada en Plan 02 (Pitfall 3); (c) M-4/D-15: confidence legacy resultó load-bearing (guard R0) — resuelto a deprecación, no borrado (Pitfall 4); (d) nota: interruption-tab.tsx conserva 3 labels stale en su array local (inofensivo — string-compare sobre eventos que jamás llegan; fuera de scope D-11, limpiable cuando se toque ese tab).
    8. Commit: `docs(somnio-v4-consolidation 05): D-17 sincroniza ARCHITECTURE/PARITY§6/AUDIT con la realidad del código`.
  </action>
  <verify>
    <automated>grep -c "invocations.ts" src/lib/agents/somnio-v4/ARCHITECTURE.md; grep -c "Correcciones post-research" .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "invocations.ts" src/lib/agents/somnio-v4/ARCHITECTURE.md` = 0 (o solo en nota histórica que diga "eliminado")
    - `grep -n "runLegacySubLoop" src/lib/agents/somnio-v4/ARCHITECTURE.md` = 0 matches
    - `grep -c "crm-gate" src/lib/agents/somnio-v4/ARCHITECTURE.md` ≥ 1 (pipeline actualizado)
    - `grep -ci "obsolet" src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` ≥ 1 (caveat §6 marcado)
    - `grep -c "Correcciones post-research" .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md` = 1
    - `grep -c "interruption-tab" .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md` ≥ 1 (labels stale documentados)
  </acceptance_criteria>
  <done>Docs cuentan la verdad del código tal como queda al cierre de Wave 1.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Ninguna nueva | Rename interno + docs |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-06 | T (Tampering) | rename accidental del export público | mitigate | Acceptance criteria verifica que crm-gate.ts no aparece en el diff y que runCrmSubLoop/runSubLoop conservan nombre |
</threat_model>

<verification>
- `npx tsc --noEmit` + SUITE_CMD verdes, cero asserts cambiados.
- Gate D-11: diff = {sub-loop/index.ts, ARCHITECTURE.md, INTERRUPTION-PARITY.md, AUDIT-2026-06-10.md} y nada más.
</verification>

<success_criteria>
- D-17 completo: rename M-6 + docs-sync M-7 según la checklist del RESEARCH §State of the Art.
- PARITY.md solo recibió la corrección §6 (la reducción D-07 es del Plan 12).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/05-SUMMARY.md`.
</output>
