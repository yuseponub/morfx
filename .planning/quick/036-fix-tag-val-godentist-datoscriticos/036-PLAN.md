---
phase: quick-036
plan: 036
type: execute
wave: 1
depends_on: [quick-035]
files_modified:
  - src/lib/agents/engine/v3-production-runner.ts
autonomous: true
---

<objective>
Fix quick-035 bug + cambiar el trigger del tag VAL de `pedir_fecha` a `datosCriticos just completed`.

**Bug raiz (quick-035):** En `deserializeState` (`src/lib/agents/godentist/state.ts:351`), el array `accionesEjecutadas` se asigna por REFERENCIA al state interno. El agente luego hace `state.accionesEjecutadas.push(...)` mutando el array in-place. Como el runner pasaba ese mismo array como `previousAcciones` al helper, por el momento en que se comparaba, `previousAcciones` y `output.accionesEjecutadas` apuntaban al MISMO array mutado — `wasAlreadyPresent` siempre era `true` y el tag jamas se aplicaba.

**Nuevo trigger:** comparar `datosCapturados` antes/despues. El runner YA snapshottea `inputDatosCapturados = { ...currentDatos }` (linea 83) — objeto distinto. `output.datosCapturados` es un objeto fresco de `serializeState`. No hay mutacion compartida.

**Campos criticos (de godentist/constants.ts:126):** `['nombre', 'telefono', 'sede_preferida']`. Inline hardcodeados en el runner para mantenerlo agnostico (no importar de godentist).
</objective>

<decisions>
1. **Comparar datos_capturados, no accionesEjecutadas** — evita el bug de referencia compartida y es el trigger semantico que el usuario pidio.
2. **Hardcodear los 3 campos criticos en el runner** — `['nombre', 'telefono', 'sede_preferida']`. Si en el futuro cambian en godentist, el tag dejaria de dispararse correctamente — aceptable porque el runner NO debe depender de internos del agente. Documentar como TODO si un dia se quiere exponer `datosCriticos` en `V3AgentOutput`.
3. **Criterio "campo completo":** valor presente, tipo string, trim no vacio (mismo check que `datosCriticosOk` en godentist).
4. **Fail-open, idempotencia por logica:** si un contacto ya tenia los 3 campos antes del turno, `hadCritical=true` → no re-dispara. Doble proteccion con `assignTag` que maneja 23505 como success.
5. **Actualizar comentario JSDoc del helper** para reflejar el nuevo trigger y mencionar quick-036 como fix.
6. **No feature flag** — mismo razonamiento que quick-035 (side-effect aditivo, cero impacto conversacional).
</decisions>

<tasks>

<task type="auto">
  <name>Task 1: Refactor applyGodentistValTagIfNeeded para usar datosCriticos</name>
  <files>src/lib/agents/engine/v3-production-runner.ts</files>
  <action>
1. Cambiar la llamada en linea ~153:
   DE: `await this.applyGodentistValTagIfNeeded(input, output, accionesEjecutadas)`
   A:  `await this.applyGodentistValTagIfNeeded(input, output, inputDatosCapturados)`

2. Refactorizar el helper privado `applyGodentistValTagIfNeeded`:
   - Cambiar firma: `previousAcciones: any[]` → `previousDatos: Record<string, string>`
   - Agregar constante local `GODENTIST_CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida'] as const`
   - Agregar helper local `hasAllCriticalFields(datos: Record<string, string>): boolean` que verifica que los 3 campos existen, son string, y trim no vacio
   - Logica nueva:
     ```ts
     const hadCritical = hasAllCriticalFields(previousDatos)
     const hasCritical = hasAllCriticalFields(output.datosCapturados)
     if (hadCritical || !hasCritical) return
     ```
   - Mantener el resto del helper igual (llamada a assignTag, fail-open, logs)

3. Actualizar el JSDoc del helper para documentar:
   - Quick-036: fix del bug de mutation + cambio de trigger
   - Trigger: NEW datosCriticos completion (previously: pedir_fecha action)
   - Por que se hardcodean los campos (runner agnostico)

4. Actualizar los logs para mencionar "datosCriticos transition" en vez de "pedir_fecha transition".

5. No modificar NADA MAS. NO tocar el agente godentist, NO tocar domain/tags.ts, NO tocar el robot Railway.
  </action>
  <verify>
1. `npx tsc --noEmit` sin errores nuevos
2. `grep -n "hasAllCriticalFields\|GODENTIST_CRITICAL_FIELDS\|datosCriticos" src/lib/agents/engine/v3-production-runner.ts` muestra el nuevo codigo
3. `grep -n "pedir_fecha\|previousAcciones" src/lib/agents/engine/v3-production-runner.ts` NO muestra nada (limpio)
4. `git diff --stat src/lib/agents/godentist/ src/lib/domain/tags.ts godentist/robot-godentist/` vacio
  </verify>
</task>

<task type="auto">
  <name>Task 2: Commit + push a Vercel</name>
  <action>
Commit atomico:
- Mensaje: explica el bug de quick-035 (referencia compartida en deserializeState) + el cambio de trigger a datosCriticos
- Co-author Claude Opus 4.6
- Push a origin main
  </action>
</task>

</tasks>

<success_criteria>
- Cliente real envia datos -> cuando completa nombre + telefono + sede_preferida -> contacto recibe tag VAL
- El tag se aplica UNA SOLA VEZ (no re-dispara si ya tenia los 3 campos)
- Cero regresion conversacional
- Zero cambios fuera de v3-production-runner.ts
- Fase 2 TODO sigue vigente: mover a 'cita confirmada' en el futuro
</success_criteria>
