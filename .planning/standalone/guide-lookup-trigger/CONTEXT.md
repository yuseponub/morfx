# Trigger de Automatizacion para guide_lookup — Contexto

## Problema
Cuando "buscar guias coord" encuentra la guia de una orden, actualiza la DB pero NO emite un trigger de automatizacion. El usuario quiere poder crear automatizaciones que se disparen cuando el robot encuentra una guia.

## Estado Actual de Triggers Robot

| Trigger existente | Evento Inngest | Emitido desde | Job type |
|---|---|---|---|
| `robot.coord.completed` | `automation/robot.coord.completed` | `/api/webhooks/robot-callback` (linea 164) | `create_shipment` |
| `robot.ocr.completed` | `automation/robot.ocr.completed` | `robot-orchestrator.ts` (linea 574) | `ocr_guide_read` |
| **FALTA** | — | — | `guide_lookup` |

## Lo que hay que hacer

### 1. Crear trigger type + variables en constants.ts
- Agregar `robot.guide_lookup.completed` al `TRIGGER_CATALOG` (src/lib/automations/constants.ts ~linea 155)
- Variables disponibles: orden.id, orden.nombre, orden.tracking_number (guia), orden.carrier, contacto.nombre, contacto.telefono
- Agregar variables al `VARIABLE_CATALOG` (~linea 488)

### 2. Agregar al TriggerType union en types.ts
- `src/lib/automations/types.ts` linea ~29: agregar `'robot.guide_lookup.completed'`

### 3. Crear emitter function en trigger-emitter.ts
- `src/lib/automations/trigger-emitter.ts`: crear `emitRobotGuideLookupCompleted()`
- Similar a `emitRobotCoordCompleted()` (linea 454)
- Emite evento `automation/robot.guide_lookup.completed`

### 4. Registrar evento Inngest en events.ts
- `src/inngest/events.ts` (~linea 440): agregar tipo `automation/robot.guide_lookup.completed`

### 5. Registrar runner en automation-runner.ts
- `src/inngest/functions/automation-runner.ts`:
  - Mapping evento→trigger (~linea 47): `'automation/robot.guide_lookup.completed': 'robot.guide_lookup.completed'`
  - Trigger matching (~linea 134): `case 'robot.guide_lookup.completed': return true`
  - Crear runner con factory (~linea 665): `createAutomationRunner('robot.guide_lookup.completed', ...)`
  - Exportar en `automationFunctions` array

### 6. Emitir trigger desde el callback
- `src/app/api/webhooks/robot-callback/route.ts` linea ~164:
  - Actualmente solo emite para `create_shipment`
  - Agregar: si `parentJob?.job_type === 'guide_lookup'` → emitir `emitRobotGuideLookupCompleted()`

### 7. Verificar en UI
- El trigger debe aparecer automaticamente en el wizard de automatizaciones (categoria "Logistica")
- Crear una automatizacion de prueba con este trigger

## Archivos a modificar (7)
1. `src/lib/automations/constants.ts` — TRIGGER_CATALOG + VARIABLE_CATALOG
2. `src/lib/automations/types.ts` — TriggerType union
3. `src/lib/automations/trigger-emitter.ts` — emitRobotGuideLookupCompleted()
4. `src/inngest/events.ts` — event type
5. `src/inngest/functions/automation-runner.ts` — runner registration
6. `src/app/api/webhooks/robot-callback/route.ts` — emit trigger
7. `src/inngest/client.ts` — (verificar si necesita event schema)

## Patron a seguir
Copiar exactamente el patron de `robot.coord.completed` que ya funciona. Los 6 puntos de registro son identicos, solo cambia el nombre del trigger, el evento Inngest, y la funcion emitter.
