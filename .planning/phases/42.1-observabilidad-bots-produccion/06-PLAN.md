---
phase: 42.1-observabilidad-bots-produccion
plan: 06
type: execute
wave: 3
depends_on: [03, 04]
files_modified:
  - src/lib/agents/godentist/comprehension.ts
  - src/lib/agents/somnio-recompra/comprehension.ts
  - src/lib/agents/somnio-v2/comprehension.ts
autonomous: true

must_haves:
  truths:
    - "Las 3 call sites restantes de Anthropic (godentist, somnio-recompra, somnio-v2) usan createInstrumentedAnthropic"
    - "Cada pipeline setea su purpose correspondiente ('godentist_comprehension', 'recompra_comprehension', 'v2_comprehension')"
    - "El handler agent-production.ts instrumentado en Plan 05 ya cubre godentist/recompra porque es el mismo handler multi-bot (verificar)"
    - "Grep confirma cero new Anthropic(...) fuera de createInstrumentedAnthropic en todo src/lib/agents/"
  artifacts:
    - path: "src/lib/agents/godentist/comprehension.ts"
      provides: "Instrumented Anthropic client"
    - path: "src/lib/agents/somnio-recompra/comprehension.ts"
      provides: "Instrumented Anthropic client"
  key_links:
    - from: "src/lib/agents/godentist/comprehension.ts"
      to: "src/lib/observability/anthropic-instrumented.ts"
      via: "createInstrumentedAnthropic"
      pattern: "createInstrumentedAnthropic"
---

<objective>
Completar la instrumentacion de los bots restantes (GoDentist, Somnio Recompra, y Somnio V2 por seguridad). Estos son mas simples porque su pipeline principal ya es cubierto por el handler Inngest comun que Plan 05 ya wrappeo — solo falta migrar sus call sites de Anthropic y verificar que estan en scope del handler instrumentado.

Purpose: Cubrir los 3 bots del scope de la fase 42.1 (y v2 por paranoia). Cerrar el inventario de 10 call sites.
Output: 0 matches de `new Anthropic(` fuera del helper.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-04-SUMMARY.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-05-SUMMARY.md
@src/lib/agents/godentist/comprehension.ts
@src/lib/agents/somnio-recompra/comprehension.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrar godentist, somnio-recompra y somnio-v2 comprehension</name>
  <files>
src/lib/agents/godentist/comprehension.ts
src/lib/agents/somnio-recompra/comprehension.ts
src/lib/agents/somnio-v2/comprehension.ts
  </files>
  <action>
Para cada uno de los 3 archivos:

1. LEER el archivo primero — probablemente son muy similares entre si y al de somnio-v3.

2. Reemplazar `new Anthropic({ apiKey: ... })` por `createInstrumentedAnthropic({ apiKey: ... })` (import de `@/lib/observability/anthropic-instrumented`).

3. Envolver la llamada `.messages.create(...)` en `runWithPurpose('<purpose>', () => ...)`:
   - godentist → `'godentist_comprehension'`
   - somnio-recompra → `'recompra_comprehension'`
   - somnio-v2 → `'v2_comprehension'`

4. Si cualquiera de estos archivos tiene mas de una llamada a Claude (p. ej. un fallback model), aplicar runWithPurpose a cada una con un sufijo (`_fallback`, etc).

5. Verificar tambien si los bots GoDentist y Recompra tienen handlers Inngest SEPARADOS del `agent-production.ts` que Plan 05 instrumento. Grep:
   ```
   grep -rn "inngest.createFunction" src/inngest/functions/ | grep -iE "godentist|recompra"
   ```
   Si existen handlers dedicados (ej. `src/inngest/functions/godentist-agent.ts`), aplicar el MISMO wrapping `runWithCollector` que Plan 05 hizo al agent-production. Reusar el patron exacto — copiar mentalmente desde Plan 05.

6. Si los 3 bots comparten el mismo `agent-production.ts` (likely), no hay handlers extras que instrumentar — Plan 05 ya los cubre.

7. AgentId resolution: verificar que `resolveAgentIdForWorkspace(workspaceId)` (helper agregado en Plan 05) retorna correctamente 'godentist' y 'somnio-recompra' para los workspaces respectivos. Si no, extender el helper.
  </action>
  <verify>
- `grep -rn "new Anthropic(" src/` → solo 1 match: dentro de `src/lib/observability/anthropic-instrumented.ts`
- Build de Next pasa
- Tests existentes pasan
- **Cobertura explicita de handlers Inngest GoDentist/Recompra:** correr `grep -rn "inngest.createFunction" src/inngest/functions/ | grep -iE "godentist|recompra"` y para CADA archivo retornado, abrirlo y confirmar que su handler esta envuelto en `runWithCollector` (mismo patron que Plan 05 Task 2a aplico a `agent-production.ts`). Si encuentras un handler que NO esta wrappeado, instrumentarlo en este task antes de cerrar — un handler sin wrap silenciosamente produce 0 eventos para ese bot.
- Verificar tambien `grep -l "runWithCollector" src/inngest/functions/` → debe listar agent-production.ts y CUALQUIER handler dedicado encontrado en el grep anterior.
  </verify>
  <done>
Los 10 call sites inventariados en RESEARCH.md estan migrados. Todos los 3 bots en scope de la fase 42.1 estan instrumentados.
  </done>
</task>

</tasks>

<verification>
- `grep -c "new Anthropic(" src/ -r` → exactamente 1 (el helper)
- Build pasa
- Tests pasan
- Feature flag OFF → comportamiento identico
</verification>

<success_criteria>
Los 3 bots (+ v2) completamente instrumentados. Wave 4 (flush + cron) puede proceder sabiendo que todo el flujo de captura en memoria ya funciona.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-06-SUMMARY.md` con: inventario final de call sites, verificacion de grep, confirmacion de cobertura de handlers Inngest.
</output>
