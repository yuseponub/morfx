---
phase: somnio-v4-consolidation
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/agents/engine/v4-production-runner.ts
autonomous: true
requirements: [D-14, D-18]
must_haves:
  truths:
    - "El branch fallback de envío de output.messages sin templates ya no existe — fue reemplazado por warning a observability (D-14)"
    - "El bug G-3 está muerto: ningún texto jamás enviado se registra en sentMessageContents"
    - "El crash-recovery _v3:pendingUserMessage sigue funcionando IDÉNTICO y ahora tiene comentario explicativo (D-18)"
    - "messaging.ts (parent adapter compartido v3/godentist/recompra/pw) NO fue tocado"
  artifacts:
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "warning v4_messages_without_templates en lugar del branch fallback; comentarios D-18"
      contains: "v4_messages_without_templates"
  key_links:
    - from: "src/lib/agents/engine/v4-production-runner.ts"
      to: "observability collector"
      via: "getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', ...)"
      pattern: "v4_messages_without_templates"
---

<objective>
Wave 1 — limpieza del lado del RUNNER: D-14 (borrar branch fallback :949-961 que el adapter dropea de todos modos + reemplazo por warning observable, matando de paso el bug G-3) y D-18 (CONSERVAR el crash-recovery `_v3:pendingUserMessage` añadiendo el comentario de por qué existe).

Purpose: el runner queda limpio antes de la extracción del core (W2) — el core nunca contendrá la rama muerta.
Output: runner sin envío silenciosamente fallido; crash-recovery documentado in-situ.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-14, D-18)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (Pitfall 10, Pitfall 7, §Code Examples — Warning D-14)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)

NOTA: line refs son pistas del 2026-06-10 — localizar por patrón con grep.
</context>

<tasks>

<task type="auto">
  <name>Task 1: D-14 — borrar branch fallback messages-sin-templates y emitir warning observable</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (branch ~:949-961: envío de output.messages cuando no hay templates; el push a sentMessageContents ~:960 que constituye el bug G-3; cómo importa/usa getCollector el archivo — buscar `agent_routed` ~:480 como precedente del patrón recordEvent)
    - src/lib/agents/engine-adapters/production/messaging.ts (~:169-172 — SOLO LECTURA: el gate del parent que dropea sends sin templates; PROHIBIDO tocarlo)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 10 + §Code Examples "Warning D-14"
  </read_first>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <action>
    1. Localizar el branch fallback con `grep -n "output.messages" src/lib/agents/engine/v4-production-runner.ts` cerca de ~:949-961: es el bloque que intenta enviar `output.messages` cuando `output.templates` está vacío (el adapter lo dropea — desde el pseudo-template `rag:*` ningún caso llega ahí).
    2. BORRAR el bloque completo, incluyendo el `sentMessageContents.push(...output.messages)` (~:960) — eso mata G-3 (log de texto jamás enviado).
    3. Insertar en su lugar el warning EXACTO del RESEARCH (detalle de payload resuelto a discreción ejercida — usar este):
    ```typescript
    if (output.messages.length > 0 && (!output.templates || output.templates.length === 0)) {
      getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {
        sessionId: session.id,
        messageCount: output.messages.length,
        preview: output.messages[0]?.slice(0, 120) ?? '',
      })
      console.warn('[V4-RUNNER] output.messages sin templates — nunca debería ocurrir (post rag:* passthrough)')
    }
    ```
    NO añadir label nuevo a `LockEventLabel` (es evento del pipeline, no del lock — Pitfall 10). Verificar que `getCollector` ya está importado en el archivo (lo usa `agent_routed`); si el import es distinto, replicar el patrón exacto del site `agent_routed`.
    4. Mientras el archivo está abierto: actualizar el comentario (~:435) que aún menciona `mapOutcomeToAgentOutput` (borrada en Plan 02) — reescribirlo indicando que el discriminator `interrupted_at_ckpt_*` lo produce hoy el path del slot resolver (`resolveLowSlot`).
    5. PROHIBIDO: tocar `src/lib/agents/engine-adapters/production/messaging.ts` (Regla 6 — compartido con v3/godentist/recompra/pw).
    6. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes, asserts intactos. Commit: `refactor(somnio-v4-consolidation 03): D-14 borra branch fallback messages-sin-templates + warning observable (mata G-3)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "v4_messages_without_templates" src/lib/agents/engine/v4-production-runner.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "v4_messages_without_templates" src/lib/agents/engine/v4-production-runner.ts` = 1
    - El bloque borrado no dejó rastro: no existe ningún `send` de `output.messages` sin templates (`grep -n "output.messages" src/lib/agents/engine/v4-production-runner.ts` no muestra ningún site que los pase a messaging.send)
    - `grep -n "mapOutcomeToAgentOutput" src/lib/agents/engine/v4-production-runner.ts` retorna 0 matches
    - `git diff --name-only` NO incluye `src/lib/agents/engine-adapters/production/messaging.ts`
    - SUITE_CMD verde
  </acceptance_criteria>
  <done>Branch fallback fuera; warning observable en su lugar; G-3 muerto; parent adapter intacto.</done>
</task>

<task type="auto">
  <name>Task 2: D-18 — comentar (NO tocar) el crash-recovery _v3:pendingUserMessage</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (los 3 sitios `_v3:pendingUserMessage`: lectura+combine iter-1 ~:280-287, `wasInterruptedWithZeroSends` ~:916-924, rollback+save ~:989-1007 — localizar con `grep -n "pendingUserMessage" ...`)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 7 (ordering: CKPT-0 drena ANTES del combine legacy — el comentario debe documentarlo)
  </read_first>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <action>
    1. `grep -n "pendingUserMessage" src/lib/agents/engine/v4-production-runner.ts` — localizar los 3 sitios.
    2. Añadir un comentario bloque encima del PRIMER sitio (lectura/combine) con este contenido (adaptar redacción, conservar los 4 puntos):
    ```typescript
    // CRASH-RECOVERY LEGACY `_v3:pendingUserMessage` (D-18 somnio-v4-consolidation — CONSERVAR):
    // - Por qué existe: cubre el edge de interrupt con pending-list de Redis VACÍA y 0 sends
    //   (lambda murió tras consumir el mensaje pero antes de enviar nada) — el mensaje del usuario
    //   se persiste en session_state y se re-combina en la siguiente iteración.
    // - ORDEN CRÍTICO (Pitfall 7): el drain de CKPT-0 usa `effectiveMessage ?? input.message` ANTES
    //   de este combine. Reordenar causaría combine doble en interrupt-en-CKPT-0 con pending presente.
    // - Es funcional, NO código muerto. Borrable cuando v3 muera (D-38 / cosecha S-7).
    ```
    3. En los otros 2 sitios (`wasInterruptedWithZeroSends` y rollback/save), añadir comentario de una línea: `// D-18: parte del crash-recovery _v3:pendingUserMessage — ver comentario en el site de lectura/combine`.
    4. CERO cambios de lógica — diff debe ser 100% comentarios (verificar con `git diff -w` que solo hay líneas añadidas que empiezan con `//`).
    5. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes. Commit: `docs(somnio-v4-consolidation 03): D-18 documenta in-situ el crash-recovery _v3:pendingUserMessage (conservar hasta muerte de v3)`.
  </action>
  <verify>
    <automated>grep -c "D-18" src/lib/agents/engine/v4-production-runner.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "D-18" src/lib/agents/engine/v4-production-runner.ts` ≥ 3
    - `grep -c "Pitfall 7" src/lib/agents/engine/v4-production-runner.ts` ≥ 1
    - `git diff` del task contiene SOLO líneas de comentario añadidas (ninguna línea de código eliminada o modificada)
    - SUITE_CMD verde con asserts intactos
  </acceptance_criteria>
  <done>Crash-recovery documentado donde vive; nadie lo borrará "por legacy" sin leer el porqué.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Ninguna nueva | Borra una rama de envío inerte y añade telemetría/comentarios |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-03 | I (Information Disclosure) | evento v4_messages_without_templates | mitigate | `preview` truncado a 120 chars (patrón de redaction del proyecto); sin teléfonos ni datos de contacto en el payload |
| T-cons-04 | D (DoS lógico) | pérdida del fallback de envío | accept | El fallback ya era inerte (el adapter dropea sends sin templates desde rag:* passthrough) — el warning hace VISIBLE lo que antes fallaba en silencio |
</threat_model>

<verification>
- `npx tsc --noEmit` + SUITE_CMD verdes tras cada task, asserts intactos.
- Gate D-11: `git diff --name-only <baseline>..HEAD -- src/` para este plan = solo `src/lib/agents/engine/v4-production-runner.ts`.
- Regla 6: messaging.ts y v3-production-runner.ts ausentes del diff.
</verification>

<success_criteria>
- D-14 implementado con el warning exacto (canal pipeline_decision, NO LockEventLabel) y G-3 muerto.
- D-18 implementado como comentarios puros — cero cambio de lógica.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/03-SUMMARY.md`.
</output>
