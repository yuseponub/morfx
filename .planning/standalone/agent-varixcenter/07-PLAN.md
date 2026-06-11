---
phase: agent-varixcenter
plan: 07
type: execute
wave: 3
depends_on: [02, 06]
files_modified:
  - src/lib/agents/agent-catalog.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/engine/v3-production-runner.ts
autonomous: true
requirements: [VARIX-REGISTER, VARIX-VAL]

must_haves:
  truths:
    - "varixcenter aparece en AGENT_CATALOG (dropdown del routing-editor)"
    - "webhook-processor pre-warmea import('../varixcenter') (anti-cold-lambda B-001)"
    - "webhook-processor tiene branch dispatch para agentId === 'varixcenter'"
    - "v3-production-runner importa processMessage cuando agentModule === 'varixcenter'"
    - "el VAL guard del runner incluye varixcenter Y usa CRITICAL_FIELDS por agente (cedula, no sede_preferida)"
    - "godentist + godentist-fb-ig siguen verdes (cero regresión — Regla 6)"
  artifacts:
    - path: "src/lib/agents/agent-catalog.ts"
      provides: "entry id:'varixcenter'"
      contains: "varixcenter"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "pre-warm + dispatch branch varixcenter"
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "agentModule branch + VAL guard parametrizado"
  key_links:
    - from: "v3-production-runner VAL guard"
      to: "constants.ts VARIX_CRITICAL_FIELDS"
      via: "import o selección por agentModule = ['nombre','telefono','cedula']"
      pattern: "varixcenter"
    - from: "webhook-processor dispatch"
      to: "V3ProductionRunner agentModule:'varixcenter'"
      via: "branch agentId === 'varixcenter'"
      pattern: "agentModule: 'varixcenter'"
---

<objective>
Wave 3 — Registrar el agente en los 6 sitios sin los cuales NO funciona end-to-end (LEARNINGS godentist-fb-ig: falta uno = agente roto silenciosamente). Incluye el riesgo CRÍTICO identificado en PATTERNS.md: el VAL guard hardcodea `sede_preferida`, pero varixcenter usa `cedula` (D-05) — hay que parametrizar CRITICAL_FIELDS por agentModule SIN alterar el comportamiento de godentist/godentist-fb-ig (Regla 6).

Purpose: Conectar el agente al pipeline de producción (catálogo, dispatch, runner, tag VAL) de forma ADITIVA. Cero cambios de comportamiento a agentes existentes.
Output: 3 archivos compartidos modificados (aditivos).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/PATTERNS.md
@.planning/standalone/agent-varixcenter/RESEARCH.md
@.planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md
@src/lib/agents/agent-catalog.ts
@src/lib/agents/production/webhook-processor.ts
@src/lib/agents/engine/v3-production-runner.ts
@src/lib/agents/varixcenter/constants.ts

<interfaces>
agent-catalog godentist-fb-ig entry: líneas 41-44 (id, name, description)
webhook-processor pre-warm: línea 260 dentro de Promise.all (líneas 253-261)
webhook-processor dispatch branch godentist-fb-ig: líneas 820-846
v3-production-runner agentModule branch: líneas 153-161 (if godentist / else if godentist-fb-ig)
v3-production-runner VAL guard: línea 605 (`if (agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig') return`) + línea 609 (`GODENTIST_CRITICAL_FIELDS = ['nombre','telefono','sede_preferida']`)
varixcenter CRITICAL_FIELDS: VARIX_CRITICAL_FIELDS = ['nombre','telefono','cedula'] exportado de src/lib/agents/varixcenter/constants.ts (Wave 1)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: agent-catalog + pre-warm + dispatch branch (4 de los 6 sitios)</name>
  <read_first>
    - src/lib/agents/agent-catalog.ts (entry godentist-fb-ig líneas 41-44)
    - src/lib/agents/production/webhook-processor.ts (Promise.all líneas 253-261 + dispatch branch líneas 820-846)
    - .planning/standalone/agent-varixcenter/PATTERNS.md "Shared Patterns / Los 6 sitios de registro"
  </read_first>
  <files>src/lib/agents/agent-catalog.ts, src/lib/agents/production/webhook-processor.ts</files>
  <action>
    **Sitio 2 — AGENT_CATALOG** (src/lib/agents/agent-catalog.ts): agregar entry copiando el shape de la entry godentist-fb-ig (líneas 41-44):
    ```typescript
    {
      id: 'varixcenter',
      name: 'Varixcenter Valoraciones',
      description: 'Agente de agendamiento de valoraciones flebológicas. Slots reales vs varix-clinic. WA + FB + IG.',
    },
    ```

    **Sitio 3 — Pre-warm** (webhook-processor.ts línea 260, dentro del `Promise.all` líneas 253-261): agregar `import('../varixcenter'),` en el array (anti-Pitfall 2 / B-001 cold-lambda race). Comentario: `// Standalone: agent-varixcenter (D-01, Pitfall 2 cold-lambda)`.

    **Sitio 4 — Dispatch branch** (webhook-processor.ts después del branch godentist-fb-ig línea 846): copiar el branch `else if (agentId === 'godentist-fb-ig')` adaptado:
    ```typescript
    } else if (agentId === 'varixcenter') {
      // Standalone: agent-varixcenter (D-01)
      // Agente nuevo (NO sibling) para valoraciones flebologicas — coexiste con godentist (Regla 6).
      await import('../varixcenter')
      const { V3ProductionRunner } = await import('../engine/v3-production-runner')
      const runner = new V3ProductionRunner(adapters, { workspaceId, agentModule: 'varixcenter' })
      getCollector()?.setRespondingAgentId('varixcenter')
      engineOutput = await runner.processMessage({
        sessionId: '', conversationId, contactId: contactId!, message: messageContent,
        workspaceId, history: [], phoneNumber: phone, messageTimestamp: input.messageTimestamp,
      })
      getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', { agentId, conversationId, contactId })
      logger.info({ conversationId, agentId }, 'Varixcenter agent processing complete')
    }
    ```
    Mantener el shape EXACTO del branch godentist-fb-ig (mismo input a processMessage).
  </action>
  <verify>
    <automated>grep -c "id: 'varixcenter'" src/lib/agents/agent-catalog.ts; grep -c "import('../varixcenter')" src/lib/agents/production/webhook-processor.ts; grep -c "agentId === 'varixcenter'" src/lib/agents/production/webhook-processor.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "id: 'varixcenter'" src/lib/agents/agent-catalog.ts` = 1
    - `grep -c "import('../varixcenter')" src/lib/agents/production/webhook-processor.ts` >= 2 (pre-warm + dispatch)
    - `grep -c "agentId === 'varixcenter'" src/lib/agents/production/webhook-processor.ts` = 1
    - `grep -c "agentModule: 'varixcenter'" src/lib/agents/production/webhook-processor.ts` = 1
    - Los branches de godentist y godentist-fb-ig NO fueron modificados (diff solo agrega, no cambia líneas existentes)
  </acceptance_criteria>
  <done>4 sitios de registro: catálogo + pre-warm + dispatch branch, aditivos.</done>
</task>

<task type="auto">
  <name>Task 2: v3-production-runner — agentModule branch + VAL guard parametrizado (CRÍTICO)</name>
  <read_first>
    - src/lib/agents/engine/v3-production-runner.ts líneas 153-161 (agentModule branch) + líneas 597-647 (applyGodentistValTagIfNeeded — guard + CRITICAL_FIELDS)
    - src/lib/agents/varixcenter/constants.ts (VARIX_CRITICAL_FIELDS = ['nombre','telefono','cedula'])
    - .planning/standalone/agent-varixcenter/PATTERNS.md "Shared Patterns / VAL tag side-effect" (los DOS cambios obligatorios)
    - .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md (baseline tests godentist para verificar cero regresión)
  </read_first>
  <files>src/lib/agents/engine/v3-production-runner.ts</files>
  <action>
    **Sitio 5 — agentModule branch** (líneas 153-161): después del branch `else if (this.config.agentModule === 'godentist-fb-ig')`, agregar:
    ```typescript
    } else if (this.config.agentModule === 'varixcenter') {
      const { processMessage } = await import('../varixcenter')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    }
    ```
    Copiar el shape EXACTO del branch godentist-fb-ig.

    **Sitio 6 — VAL guard parametrizado (CRÍTICO — el riesgo de PATTERNS.md):**
    DOS cambios obligatorios en `applyGodentistValTagIfNeeded` (líneas 597-647):

    1. **Extender el compound check (línea 605):** actualmente:
       ```typescript
       if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return
       ```
       cambiar a:
       ```typescript
       if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig' && this.config.agentModule !== 'varixcenter') return
       ```

    2. **Parametrizar CRITICAL_FIELDS por agentModule (línea 609):** actualmente hardcodea `['nombre','telefono','sede_preferida']`. Reemplazar por una selección por agentModule:
       ```typescript
       // CRITICAL_FIELDS divergen por agente: godentist usa sede_preferida, varixcenter usa cedula (D-05).
       // Must stay in sync con cada constants.ts::CRITICAL_FIELDS.
       const CRITICAL_FIELDS_BY_AGENT: Record<string, readonly string[]> = {
         'godentist': ['nombre', 'telefono', 'sede_preferida'],
         'godentist-fb-ig': ['nombre', 'telefono', 'sede_preferida'],
         'varixcenter': ['nombre', 'telefono', 'cedula'],
       }
       const criticalFields = CRITICAL_FIELDS_BY_AGENT[this.config.agentModule] ?? ['nombre', 'telefono', 'sede_preferida']
       ```
       Y usar `criticalFields` (en vez de `GODENTIST_CRITICAL_FIELDS`) en `hasAllCriticalFields`. CRÍTICO: godentist/godentist-fb-ig DEBEN seguir usando `sede_preferida` (cero regresión — Regla 6). Solo varixcenter usa `cedula`.

    Actualizar el comentario del docblock (líneas 588-590) para reflejar que los campos ahora se seleccionan por agente.
  </action>
  <verify>
    <automated>grep -cE "agentModule.*!== 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts; grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts; grep -c "'varixcenter': \['nombre', 'telefono', 'cedula'\]" src/lib/agents/engine/v3-production-runner.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "agentModule.*!== 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts` = 1 (VAL guard incluye varixcenter)
    - `grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts` = 1 (agentModule branch)
    - CRITICAL_FIELDS_BY_AGENT mapea godentist->sede_preferida y varixcenter->cedula
    - `grep -c "'godentist': \['nombre', 'telefono', 'sede_preferida'\]" src/lib/agents/engine/v3-production-runner.ts` = 1 (godentist intacto)
    - REGRESIÓN: `npx vitest run src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/` sigue verde (mismo count que baseline 00-WAVE0-AUDIT)
    - `npx tsc --noEmit 2>&1 | grep "v3-production-runner"` no muestra errores
  </acceptance_criteria>
  <done>agentModule branch + VAL guard parametrizado (cedula para varixcenter, sede_preferida intacto para godentist); cero regresión.</done>
</task>

<task type="auto">
  <name>Task 3: Verificación de los 6 sitios + regresión Regla 6</name>
  <read_first>
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Pattern 2 (los 6 grep gates)
    - .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md (baseline tests)
  </read_first>
  <files>.planning/standalone/agent-varixcenter/07-SUMMARY.md</files>
  <action>
    Tarea de VERIFICACIÓN pura — el output es el registro de resultados en 07-SUMMARY.md. Solo se modifica código fuente si un gate falla y requiere fix (en ese caso el archivo tocado se documenta como deviation en el SUMMARY).

    Correr los 6 grep gates de RESEARCH §Pattern 2 y confirmar que todos pasan (NO editar código en este task salvo para fixear un gate que falle):
    ```bash
    grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts                  # = 1
    grep -c "id: 'varixcenter'" src/lib/agents/agent-catalog.ts                            # = 1
    grep -c "import('../varixcenter')" src/lib/agents/production/webhook-processor.ts      # >= 2
    grep -c "agentId === 'varixcenter'" src/lib/agents/production/webhook-processor.ts     # = 1
    grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts  # = 1
    grep -cE "agentModule.*!== 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts # = 1
    ```
    Luego correr la suite de regresión de los clones existentes (Regla 6) y comparar con el baseline de 00-WAVE0-AUDIT:
    ```bash
    npx vitest run src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/ 2>&1 | tail -10
    npx tsc --noEmit 2>&1 | tail -5
    ```
    Registrar el resultado en el SUMMARY.
  </action>
  <verify>
    <automated>test "$(grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts)" = "1"</automated>
  </verify>
  <acceptance_criteria>
    - Los 6 grep gates pasan con los counts esperados
    - La suite godentist + godentist-fb-ig pasa con el MISMO count que el baseline (cero regresión — Regla 6)
    - `tsc --noEmit` = 0 errores (o solo los pre-existentes del baseline)
  </acceptance_criteria>
  <done>6 sitios verificados; godentist/godentist-fb-ig intactos (Regla 6 probada).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| webhook inbound -> dispatch branch | routing decide agent_id; branch debe aislar varixcenter de otros agentes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-varix-09 | Tampering | VAL guard rompe godentist al parametrizar CRITICAL_FIELDS | mitigate | CRITICAL_FIELDS_BY_AGENT preserva sede_preferida para godentist; suite de regresión verde vs baseline |
| T-varix-10 | DoS | cold-lambda race pierde el primer mensaje | mitigate | pre-warm import('../varixcenter') en Promise.all (Pitfall 2) |
</threat_model>

<verification>
- 6 sitios de registro presentes (grep gates pasan)
- VAL guard usa cedula para varixcenter, sede_preferida para godentist
- godentist + godentist-fb-ig suite verde vs baseline (Regla 6)
</verification>

<success_criteria>
- Los 6 sitios de registro completos
- VAL guard parametrizado por agente (D-05 cedula sin romper godentist)
- Cero regresión en agentes existentes (Regla 6)
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/07-SUMMARY.md`
</output>
