---
phase: quick-036
plan: 036
type: summary
status: complete
commits:
  - ab6c9f5 fix(godentist): tag VAL dispara en datosCriticos, no en pedir_fecha
files_modified:
  - src/lib/agents/engine/v3-production-runner.ts
---

# Quick 036 — Fix tag VAL godentist (trigger: datosCriticos)

## Contexto

Quick-035 desplego un helper en `v3-production-runner.ts` que debia aplicar
el tag `VAL` al contacto cuando el agente godentist ejecutaba la accion
`pedir_fecha` por primera vez en una sesion. En produccion **el tag nunca
aparecia**. El usuario pidio (1) arreglar el bug y (2) cambiar el trigger
a "cuando ya tiene los datosCriticos" en vez de "cuando pide la fecha".

## Diagnostico del bug (quick-035)

`src/lib/agents/godentist/state.ts:351`:
```ts
state.accionesEjecutadas = accionesEjecutadas  // <- misma referencia
```

`deserializeState` asigna el array `accionesEjecutadas` por REFERENCIA al
`state` interno del agente. Luego `processUserMessage` hace:
```ts
mergedState.accionesEjecutadas.push({ tipo: 'pedir_fecha', ... })
```
mutando el array in-place. Como el runner pasaba el mismo `accionesEjecutadas`
local como `previousAcciones` al helper, por el momento en que el helper
corria, **`previousAcciones` y `output.accionesEjecutadas` apuntaban al mismo
array mutado**. El check `wasAlreadyPresent === true` siempre era verdadero
y `return` disparaba → el tag jamas se aplicaba.

## Fix

Refactor del helper `applyGodentistValTagIfNeeded` para comparar
`datosCapturados` en lugar de `accionesEjecutadas`:

- `inputDatosCapturados` (v3-production-runner.ts:83) ya es un spread copy
  fresco (`{ ...currentDatos }`).
- `output.datosCapturados` viene de `serializeState` que crea un objeto nuevo.
- Sin mutacion compartida → sin bug.

Nueva firma del helper:
```ts
private async applyGodentistValTagIfNeeded(
  input: EngineInput,
  output: V3AgentOutput,
  previousDatos: Record<string, string>,
): Promise<void>
```

Nueva logica:
```ts
const GODENTIST_CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida'] as const

const hadCritical = hasAllCriticalFields(previousDatos)
const hasCritical = hasAllCriticalFields(output.datosCapturados)

if (hadCritical || !hasCritical) return
// ...aplicar tag VAL via assignTag
```

Donde `hasAllCriticalFields` verifica que los 3 campos existan, sean string,
y `trim()` no vacio (mismo criterio que `datosCriticosOk` en godentist/state.ts).

## Decisiones

1. **Comparar datosCapturados, no accionesEjecutadas** — arregla el bug de
   referencia compartida y es el trigger semantico que el usuario pidio.

2. **Campos criticos hardcodeados en el runner** — `['nombre', 'telefono',
   'sede_preferida']`. Mantiene el runner agnostico de internos del agente.
   DEBEN mantenerse en sync con `src/lib/agents/godentist/constants.ts:126`
   (CRITICAL_FIELDS). TODO futuro: exponer `datosCriticos` como flag en
   `V3AgentOutput` para eliminar la duplicacion.

3. **Llamada actualizada** (v3-production-runner.ts:153):
   DE: `this.applyGodentistValTagIfNeeded(input, output, accionesEjecutadas)`
   A:  `this.applyGodentistValTagIfNeeded(input, output, inputDatosCapturados)`

4. **Idempotencia reforzada** — si el contacto ya tenia los 3 campos antes
   del turno (cliente recurrente con datos pre-cargados), `hadCritical=true`
   corta temprano. Doble proteccion con `assignTag` que maneja `23505` como
   success.

5. **Logs actualizados** — "pedir_fecha transition" → "datosCriticos completion
   (nombre+telefono+sede)" para reflejar el nuevo trigger en Vercel logs.

6. **Sin feature flag** — igual que quick-035, cambio puramente aditivo, cero
   impacto conversacional.

7. **Scope intacto** — solo se toca `v3-production-runner.ts`. Cero cambios
   en `src/lib/agents/godentist/`, `src/lib/domain/tags.ts`, o
   `godentist/robot-godentist/`.

## Verificacion

- `npx tsc --noEmit`: solo errores pre-existentes de vitest (no nuevos en
  v3-production-runner.ts)
- `git diff --stat src/lib/agents/godentist/ src/lib/domain/tags.ts godentist/robot-godentist/`:
  vacio (sin cambios out-of-scope)
- `grep -n "hasAllCriticalFields\|GODENTIST_CRITICAL_FIELDS" v3-production-runner.ts`:
  muestra el nuevo codigo en el helper

## Verificacion en produccion (pendiente del usuario)

1. Esperar deploy de Vercel
2. En workspace "GoDentist Valoraciones", simular flujo de agendamiento con
   un contacto NUEVO:
   - "Hola, quiero agendar valoracion"
   - Dar nombre
   - Dar telefono
   - Dar sucursal → **en este momento exacto debe aparecer el tag VAL en el
     contacto**, antes incluso de que el bot pida la fecha
3. Verificar en CRM que el tag aparece
4. Verificar en Vercel logs: `[V3-RUNNER][godentist] Assigned VAL tag to
   contact ... on datosCriticos completion (nombre+telefono+sede)`
5. Verificar que el sistema de metricas incrementa el contador de valoraciones
   del dia

## Fase 2 TODO (futuro, NO en este quick task)

Mover el trigger a `cita_confirmada` (cuando el agendamiento realmente se
completa) para metricas mas precisas. El cambio actual sigue midiendo
"intent de agendar" mas que "valoraciones agendadas", pero es lo mas cercano
disponible sin exponer mas estado interno del agente.
