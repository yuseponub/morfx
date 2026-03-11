---
phase: quick-021
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/state.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
autonomous: true

must_haves:
  truths:
    - "gates.datosCriticos refleja solo los 6 campos minimos viables"
    - "gates.datosCompletos incluye criticos + correo + barrio (o negaciones)"
    - "datosCriticosJustCompleted dispara L2 timer, datosCompletosJustCompleted dispara auto:datos_completos"
    - "No queda referencia a datosOk, datosExtrasOk, ni criticalComplete en el codebase v3"
  artifacts:
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "Gates interface con datosCriticos"
      contains: "datosCriticos: boolean"
    - path: "src/lib/agents/somnio-v3/state.ts"
      provides: "computeGates, extrasOk, mergeAnalysis con nuevos StateChanges"
      exports: ["computeGates", "datosCriticosOk", "mergeAnalysis"]
    - path: "src/lib/agents/somnio-v3/sales-track.ts"
      provides: "Auto-triggers usando datosCriticosJustCompleted y datosCompletosJustCompleted"
  key_links:
    - from: "state.ts mergeAnalysis"
      to: "sales-track.ts resolveSalesTrack"
      via: "StateChanges.datosCriticosJustCompleted + datosCompletosJustCompleted"
      pattern: "changes\\.datosCriticosJustCompleted|changes\\.datosCompletosJustCompleted"
    - from: "state.ts computeGates"
      to: "transitions.ts conditions"
      via: "gates.datosCriticos"
      pattern: "gates\\.datosCriticos"
---

<objective>
Rename y corregir la semantica de gates de datos en el agente v3 para tener dos niveles claros:
- `datosCriticos`: 6 campos minimos viables (rename de datosOk)
- `datosCompletos`: criticos + correo + barrio (ahora incluye correo, antes no)

Split `criticalComplete` en dos señales: `datosCriticosJustCompleted` (start L2 timer) y `datosCompletosJustCompleted` (auto:datos_completos). Eliminar `datosExtrasOk` como export.

Purpose: Consistencia semantica para que el flujo de captura silenciosa sea correcto y el correo se valide como parte de datos completos.
Output: 5 archivos modificados, cero referencias legacy, TypeScript compila limpio.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/021-consistencia-datos-criticos-completos/021-CONTEXT.md
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename types + rewrite state.ts (Gates, StateChanges, computeGates, mergeAnalysis)</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/state.ts
  </files>
  <action>
    **types.ts:**
    - Rename `Gates.datosOk` -> `Gates.datosCriticos` (line 56)
    - `Gates.datosCompletos` stays (same name, semantics change in state.ts)

    **state.ts:**

    1. Update file header comment (line 5): `compute datosCriticos/datosCompletos/packElegido`

    2. Replace `StateChanges` interface (lines 28-34):
    ```ts
    export interface StateChanges {
      newFields: string[]
      filled: number
      hasNewData: boolean
      ciudadJustArrived: boolean
      datosCriticosJustCompleted: boolean    // criticos: false->true this turn
      datosCompletosJustCompleted: boolean   // completos: false->true this turn
    }
    ```

    3. Replace `datosExtrasOk` function (lines 194-198) with private `extrasOk`:
    ```ts
    function extrasOk(state: AgentState): boolean {
      if (state.ofiInter) return true
      const correoOk = (state.datos.correo !== null && state.datos.correo.trim() !== '') || state.negaciones.correo
      const barrioOk = (state.datos.barrio !== null && state.datos.barrio.trim() !== '') || state.negaciones.barrio
      return correoOk && barrioOk
    }
    ```
    IMPORTANT: Remove `export` keyword — this is now private. Remove old `datosExtrasOk` entirely.

    4. Update `computeGates` (lines 171-177):
    ```ts
    export function computeGates(state: AgentState): Gates {
      return {
        datosCriticos: datosCriticosOk(state),
        datosCompletos: datosCriticosOk(state) && extrasOk(state),
        packElegido: state.pack !== null,
      }
    }
    ```

    5. Update `mergeAnalysis` return (lines 145-161). BEFORE the merge (before line 88), capture pre-merge state:
    ```ts
    const criticosBefore = datosCriticosOk(state)
    const completosBefore = datosCriticosOk(state) && extrasOk(state)
    ```
    After merge and normalize (after line 143), compute post-merge:
    ```ts
    const criticosAfter = datosCriticosOk(updated)
    const completosAfter = datosCriticosOk(updated) && extrasOk(updated)
    ```
    Replace the changes return:
    ```ts
    changes: {
      newFields,
      filled,
      hasNewData: newFields.length > 0,
      ciudadJustArrived: newFields.includes('ciudad'),
      datosCriticosJustCompleted: !criticosBefore && criticosAfter,
      datosCompletosJustCompleted: !completosBefore && completosAfter,
    }
    ```

    6. Update `camposFaltantes` comment (line 210): change "datosExtrasOk" to "datosCompletos". Also add correo to missing fields for consistency:
    ```ts
    // Include barrio if missing and not negated (required for datosCompletos)
    if (!state.ofiInter) {
      const barrioPresent = state.datos.barrio !== null && state.datos.barrio?.trim() !== ''
      if (!barrioPresent && !state.negaciones.barrio) {
        missing.push('barrio')
      }
      const correoPresent = state.datos.correo !== null && state.datos.correo?.trim() !== ''
      if (!correoPresent && !state.negaciones.correo) {
        missing.push('correo')
      }
    }
    ```
  </action>
  <verify>Run `npx tsc --noEmit` — expect errors ONLY in sales-track.ts and transitions.ts (will be fixed in Task 2). State.ts and types.ts should have no internal errors.</verify>
  <done>Gates interface uses datosCriticos, StateChanges has datosCriticosJustCompleted + datosCompletosJustCompleted, extrasOk includes correo, datosExtrasOk eliminated as export.</done>
</task>

<task type="auto">
  <name>Task 2: Update sales-track.ts, transitions.ts, and debug-v3.tsx</name>
  <files>
    src/lib/agents/somnio-v3/sales-track.ts
    src/lib/agents/somnio-v3/transitions.ts
    src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
  </files>
  <action>
    **sales-track.ts** — Section 2 auto-triggers (lines 62-104):

    Replace data timer signal logic (lines 65-71):
    ```ts
    let dataTimerSignal: TimerSignal | undefined
    if (state.enCapturaSilenciosa && changes.hasNewData) {
      if (changes.datosCriticosJustCompleted && !changes.datosCompletosJustCompleted) {
        // Criticos completos, faltan extras -> L2 (2 min gracia para extras)
        dataTimerSignal = { type: 'start', level: 'L2', reason: 'criticos completos, esperando extras' }
      } else if (changes.filled > 0 && !changes.datosCriticosJustCompleted) {
        // Datos parciales -> L1
        dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
      }
    }
    ```

    Replace datos completos auto-trigger (lines 91-104):
    ```ts
    // Datos completos auto-trigger: completos just completed -> ofrecer_promos de una
    if (changes.datosCompletosJustCompleted && !promosMostradas(state)) {
      const ev: SystemEvent = { type: 'auto', result: 'datos_completos' }
      const key = systemEventToKey(ev)
      const match = resolveTransition(phase, key, state, gates)
      if (match) {
        return {
          accion: match.action,
          enterCaptura: match.output.enterCaptura,
          timerSignal: match.output.timerSignal,
          reason: match.output.reason,
        }
      }
    }
    ```

    **transitions.ts** — Rename ALL `gates.datosOk` -> `gates.datosCriticos`:

    Line 72: `condition: (_, gates) => !gates.datosCriticos,`
    Line 83: `condition: (_, gates) => gates.datosCriticos,`
    Line 86: `reason: 'Quiere comprar + datosCriticos -> promos',`
    Line 93: `condition: (_, gates) => gates.datosCriticos,`
    Line 96: `reason: 'Quiere comprar + datosCriticos -> promos',`
    Line 103: `condition: (_, gates) => !gates.datosCriticos,`
    Line 114: `condition: (_, gates) => gates.datosCriticos,`
    Line 117: `reason: \`Pack=\${state.pack} + datosCriticos -> resumen\`,`
    Line 124: `condition: (_, gates) => !gates.datosCriticos,`
    Line 135: `condition: (_, gates) => gates.datosCriticos && gates.packElegido,`
    Line 155: `condition: (_, gates) => !gates.datosCriticos,`

    Also update comments:
    Line 80: `// initial + quiero_comprar + datosCriticos -> ofrecer_promos`
    Line 90: `// capturing_data + quiero_comprar + datosCriticos -> ofrecer_promos`
    Line 100: `// capturing_data + quiero_comprar + !datosCriticos -> pedir_datos`
    Line 111: `// seleccion_pack + datosCriticos -> mostrar_confirmacion`
    Line 121: `// seleccion_pack + !datosCriticos -> pedir_datos`
    Line 132: `// confirmar + datosCriticos + packElegido -> crear_orden (R5)`
    Line 152: `// confirmar + !datosCriticos -> pedir_datos`
    Line 170: `reason: 'Auto-trigger: datosCriticos -> ofrecer promos',`
    Line 180: `reason: 'Auto-trigger: datosCriticos + pack -> confirmacion',`

    **debug-v3.tsx** — Update local variable and label (lines 274, 281-282):
    ```ts
    const datosCriticos = filledCount === fields.length
    ```
    ```tsx
    <Badge variant={datosCriticos ? 'default' : 'secondary'} className="text-xs">
      datosCriticos: {datosCriticos ? 'SI' : `NO (${filledCount}/${fields.length})`}
    </Badge>
    ```
  </action>
  <verify>
    1. `npx tsc --noEmit` — zero errors
    2. Search for dead references: `grep -r "datosOk\|datosExtrasOk\|criticalComplete" src/lib/agents/somnio-v3/` should return ZERO matches
    3. `grep -r "datosOk" src/app/(dashboard)/sandbox/` should return ZERO matches
  </verify>
  <done>All references to datosOk, datosExtrasOk, criticalComplete eliminated. datosCriticos used everywhere. sales-track uses split signals. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero errors across entire project
2. `grep -rn "datosOk\b" src/lib/agents/somnio-v3/` — zero matches
3. `grep -rn "datosExtrasOk" src/` — zero matches
4. `grep -rn "criticalComplete" src/` — zero matches
5. `grep -rn "datosCriticos" src/lib/agents/somnio-v3/` — multiple matches (confirming new name is used)
6. `grep -rn "datosCompletosJustCompleted" src/lib/agents/somnio-v3/` — matches in state.ts and sales-track.ts
</verification>

<success_criteria>
- Gates.datosCriticos = 6 campos minimos (rename de datosOk)
- Gates.datosCompletos = criticos + correo + barrio (ahora incluye correo)
- StateChanges tiene datosCriticosJustCompleted + datosCompletosJustCompleted (no criticalComplete)
- L2 timer se inicia con datosCriticosJustCompleted (sin completos)
- auto:datos_completos se dispara con datosCompletosJustCompleted
- datosExtrasOk eliminado como export, reemplazado por extrasOk privado
- camposFaltantes incluye correo para consistencia
- Debug panel muestra datosCriticos
- Zero references to datosOk, datosExtrasOk, criticalComplete in v3 code
- TypeScript compila sin errores
</success_criteria>

<output>
After completion, create `.planning/quick/021-consistencia-datos-criticos-completos/021-SUMMARY.md`
</output>
