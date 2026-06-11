---
phase: agent-varixcenter
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/lib/agents/varixcenter/config.ts
  - src/lib/agents/varixcenter/types.ts
  - src/lib/agents/varixcenter/constants.ts
  - src/lib/agents/varixcenter/guards.ts
  - src/lib/agents/varixcenter/phase.ts
  - src/lib/agents/varixcenter/comprehension-schema.ts
  - src/lib/agents/varixcenter/comprehension-prompt.ts
  - src/lib/agents/varixcenter/comprehension.ts
  - src/lib/agents/varixcenter/state.ts
  - src/lib/agents/varixcenter/transitions.ts
  - src/lib/agents/varixcenter/sales-track.ts
  - src/lib/agents/varixcenter/response-track.ts
  - src/lib/agents/varixcenter/varixcenter-agent.ts
  - src/lib/agents/varixcenter/index.ts
  - src/lib/domain/varix-clinic/client.ts
  - src/lib/domain/varix-clinic/constants.ts
  - src/lib/domain/varix-clinic/availability.ts
  - src/lib/domain/varix-clinic/booking.ts
  - src/lib/agents/agent-catalog.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/engine/v3-production-runner.ts
  - supabase/migrations/20260611165220_varixcenter_template_catalog.sql
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: fixed
---

# agent-varixcenter: Code Review Report

**Revisado:** 2026-06-11
**Profundidad:** standard (análisis por archivo con checks específicos de TypeScript)
**Archivos revisados:** 23
**Estado:** issues_found

## Resumen

El agente está bien estructurado. El patrón de clonación desde godentist-fb-ig es limpio: todos los imports apuntan al módulo propio, TEMPLATE_LOOKUP_AGENT_ID está bloqueado en `'varixcenter'`, la Regla 6 se respeta (los cambios en archivos compartidos son aditivos), la Regla 3 se respeta (cero `createAdminClient` en el módulo del agente, solo en `domain/varix-clinic/`), y el fail-open del write-path (booking error → handoff) está correctamente implementado. La redacción PII es correcta.

Se encontró **1 bug crítico** de formato en el write-path de booking que causa una inserción con timestamp inválido cada vez que el bot intenta agendar una cita. Los 3 warnings son: error silencioso en la query de availability, potencial TypeError en `parseSlotToISO` cuando el formato del slot es inesperado, y una transición faltante para `otro` con confianza alta. Los 2 infos son código muerto en el SQL y la ausencia de la transición 10 como fila explícita en la tabla.

---

## Critical Issues

### CR-01: parseSlotToISO recibe formato incorrecto desde horario_seleccionado — booking siempre falla

**Archivo:** `src/lib/agents/varixcenter/varixcenter-agent.ts:367-369` + `src/lib/domain/varix-clinic/availability.ts:76-78`

**Issue:**

`parseSlotToISO` espera un string con formato `"H:MM AM - H:MM AM"` (rango de inicio-fin) — tal como lo generan los slots de `buildSlotGrid`. Sin embargo, `horario_seleccionado` capturado por la comprehension tiene formato `"H:MM AM"` (solo la hora de inicio). El schema lo documenta explícitamente: `"el de las 10" -> "10:00 AM"`.

Cuando el agente hace:
```typescript
const { inicio: fechaHoraInicio, fin: fechaHoraFin } = parseSlotToISO(
  fecha_preferida,
  horario_seleccionado,   // "10:00 AM"
)
```

Dentro de `parseSlotToISO`:
```typescript
const [startStr, endStr] = slotStr.split(' - ')
// startStr = "10:00 AM", endStr = undefined
const endMin = parseTimeToMinutes(endStr)
// parseTimeToMinutes(undefined) -> undefined.trim() -> TypeError
```

El `try/catch` en el agente captura el error y degrada a `handoff`, así que el turno no crashea. Pero **ninguna cita puede agendarse** — el agente siempre degrada a handoff en la acción `agendar_cita`, lo que equivale a que el feature de booking no funciona en producción.

**Fix:**

Opción A (recomendada): reconstruir el slot completo desde `horario_seleccionado` antes de llamar `parseSlotToISO`, usando `SLOT_MINUTES`:

```typescript
// En varixcenter-agent.ts, antes de llamar parseSlotToISO:
import { SLOT_MINUTES } from '@/lib/domain/varix-clinic/constants'

function buildSlotRangeString(startTimeStr: string): string {
  // "10:00 AM" -> "10:00 AM - 10:20 AM"
  const startMin = parseTimeToMinutes(startTimeStr)  // necesita ser exportada
  if (startMin === -1) return startTimeStr  // fallback si parse falla
  const endMin = startMin + SLOT_MINUTES
  return `${startTimeStr} - ${minutesToTime(endMin)}`  // necesita ser exportada
}

const slotRange = buildSlotRangeString(horario_seleccionado)
const { inicio: fechaHoraInicio, fin: fechaHoraFin } = parseSlotToISO(fecha_preferida, slotRange)
```

Opción B (más simple): cambiar `parseSlotToISO` para aceptar solo la hora de inicio y calcular el fin internamente:

```typescript
// En availability.ts:
export function parseSlotToISO(
  fecha: string,
  slotStr: string,  // "10:00 AM" o "10:00 AM - 10:20 AM"
): { inicio: string; fin: string } {
  const parts = slotStr.split(' - ')
  const startStr = parts[0].trim()
  const endStr = parts[1]?.trim()

  const startMin = parseTimeToMinutes(startStr)
  const endMin = endStr ? parseTimeToMinutes(endStr) : startMin + SLOT_MINUTES

  return {
    inicio: `${fecha}T${minutesToHHMMSS(startMin)}-05:00`,
    fin: `${fecha}T${minutesToHHMMSS(endMin)}-05:00`,
  }
}
```

Opción B requiere exportar `SLOT_MINUTES` desde constants.ts (ya está exportado) y es menos invasiva.

---

## Warnings

### WR-01: Query de availability ignora el error de Supabase — falla silenciosa muestra disponibilidad incorrecta

**Archivo:** `src/lib/domain/varix-clinic/availability.ts:157-164`

**Issue:**

La query de citas activas desestructura solo `data`, ignorando `error`:

```typescript
const { data: appts } = await sb
  .from('appointments')
  .select('doctor_id, fecha_hora_inicio, fecha_hora_fin, estado')
  .gte('fecha_hora_inicio', dayStart)
  .lte('fecha_hora_inicio', dayEnd)
  .not('estado', 'in', '(cancelada,no_asistio)')

const rows: VarixAppointmentRow[] = (appts as VarixAppointmentRow[]) ?? []
```

Si la query falla (red, RLS, permiso), `data` es `null` y `error` contiene el detalle. El `?? []` transforma el error silenciosamente en "no hay citas" — lo que hace que TODOS los slots aparezcan libres. El agente le muestra al paciente disponibilidad falsa; cuando intenta reservar, el constraint de Supabase rechaza el INSERT (23P01 o error) y el agente degrada a handoff. El paciente ve horarios disponibles pero la reserva falla.

**Fix:**

```typescript
const { data: appts, error: apptError } = await sb
  .from('appointments')
  .select('doctor_id, fecha_hora_inicio, fecha_hora_fin, estado')
  .gte('fecha_hora_inicio', dayStart)
  .lte('fecha_hora_inicio', dayEnd)
  .not('estado', 'in', '(cancelada,no_asistio)')

if (apptError) {
  // Propagar — el caller (varixcenter-agent.ts) ya tiene try/catch -> availabilityFallback = true
  throw new Error(`varix-clinic availability query failed: ${apptError.message}`)
}

const rows: VarixAppointmentRow[] = (appts as VarixAppointmentRow[]) ?? []
```

### WR-02: Transición 10 (initial + otto + conf >= 80) cae a silence — cliente sin respuesta

**Archivo:** `src/lib/agents/varixcenter/transitions.ts` + `src/lib/agents/varixcenter/guards.ts:18-28`

**Issue:**

El diseño §7 transición 10 define: `inicial + otro (conf < 80) → handoff`. El guard R0 en `guards.ts` implementa exactamente esto. Sin embargo, si el intent es `otro` con confianza >= 80 (caso inusual pero posible con un mensaje claramente no reconocido), el guard no actúa, y la tabla de transiciones no tiene una fila para `phase=initial, on=otro`. `resolveTransition` retorna `null`, el sales track no produce acción, y el response track no tiene nada que responder (ya que `otro` no está en `INFORMATIONAL_INTENTS`). El resultado es `natural_silence`: el bot no responde al cliente, lo cual es una mala experiencia sin ser un crash.

**Fix:**

Agregar una fila catch-all para `otro` en `initial` (o en `*`) como fallback a handoff o invitar_agendar:

```typescript
// En transitions.ts, antes del catch-all de `closed`:
{
  phase: '*', on: 'otro', action: 'handoff',
  resolve: () => ({
    timerSignal: { type: 'cancel', reason: 'intent otro sin match' },
    reason: 'Intent otro sin transicion especifica -> handoff',
  }),
  description: '10-fallback: * + otro -> handoff (cualquier confianza sin match de guard)',
},
```

### WR-03: Singleton `_client` en `client.ts` persiste entre invocaciones lambda si las env vars faltan inicialmente

**Archivo:** `src/lib/domain/varix-clinic/client.ts:45-69`

**Issue:**

El singleton `_client` se inicializa solo si el getter no lanza. Si las env vars están presentes, el cliente se cachea correctamente. El problema es el patrón inverso: si las env vars se agregan después de un cold start donde el módulo ya fue cargado, el singleton permanece `null` y el getter re-evalúa las env vars en cada llamada (correcto). Sin embargo, si las env vars son inválidas (URL malformada o key incorrecta), el `createClient` de Supabase-js NO lanza al construir — lanza solo en la primera operación de red. El singleton se cachea con credenciales inválidas y todos los requests subsiguientes fallan en la primera operación de red (no en `getVarixClinicClient()`). Esto hace que el error ocurra en `availability.ts` o `booking.ts`, que sí tienen try/catch adecuado, así que el fail-open funciona. Es un warning porque puede dificultar el debugging: el error aparece en la query, no en la construcción del cliente.

**Fix:**

Agregar una validación mínima del formato de URL en `getVarixClinicClient()`:

```typescript
if (!url || !key) {
  throw new Error('VARIX_CLINIC_* env vars not set')
}
// Validación básica de formato
try { new URL(url) } catch {
  throw new Error(`VARIX_CLINIC_SUPABASE_URL inválida: ${url}`)
}
```

---

## Info

### IN-01: Template `precio_tratamiento` en SQL es código muerto (nunca seleccionado por response-track)

**Archivo:** `supabase/migrations/20260611165220_varixcenter_template_catalog.sql:95-96`

**Issue:**

El SQL inserta una fila con `intent='precio_tratamiento'`. Sin embargo, el response-track tiene `precio_tratamiento` en `TRIAGE_INTENTS` y siempre lo mapea via `resolveTriageTemplates()` a `'triage'`, `'info_vasitos'`, `'info_grandes'`, o `'info_ambas'` — nunca a `'precio_tratamiento'` directamente. El template nunca será seleccionado por `getTemplatesForIntents('varixcenter', ['precio_tratamiento'], ...)` porque ese intent nunca aparece en el array pasado al TemplateManager.

Consecuencia: el conteo de la sanity check espera 46 filas y hay exactamente 46, así que la migración es correcta en número. Pero 1 de las 46 filas es letra muerta desde el momento del insert.

**Fix:**

Eliminar la fila de `precio_tratamiento` del SQL (y ajustar el sanity check a 45), o mantenerla como "plantilla de fallback documental" y documentarla como tal. Si se mantiene, el sanity check debe actualizarse:

```sql
-- Cambiar:
IF vx_count != 46 THEN
-- Por:
IF vx_count != 45 THEN
```

O eliminar la fila del INSERT §4 (`precio_tratamiento`, `primera_vez`, `CORE`, `0`).

### IN-02: Transición 10 del diseño no tiene fila propia en `TRANSITIONS` — depende implícitamente del guard R0

**Archivo:** `src/lib/agents/varixcenter/transitions.ts` (ausencia de fila)

**Issue:**

El diseño §7 enumera 42 transiciones con números explícitos. La transición 10 (`initial + otro conf<80 → handoff`) está documentada en el comentario de `transitions.ts` como "los maneja guards.ts" junto a las transiciones 37-41 (escape intents). Esto es correcto funcionalmente: el guard R0 en `guards.ts` intercepta `otro + conf<80` antes de la tabla, produciendo el mismo resultado.

Sin embargo, a diferencia de las transiciones 37-41 (escape intents que sí requieren el guard porque deben ejecutarse desde cualquier fase), la transición 10 es específica de `initial` con una condición de confianza. Delegarla al guard implica que el guard R0 opera en TODAS las fases (no solo initial), lo que es un comportamiento más amplio que lo descrito en el diseño. Un `otro + conf<60` en `confirming` también dispara handoff (correcto funcionalmente, pero diferente al diseño §7 que solo especifica escape desde `*` para los intents de escape, no para `otro`).

No es un bug ya que el resultado (handoff) es el correcto. Es informacional para mantener el diseño sincronizado con el código.

**Sugerencia:**

Agregar en el comentario de la tabla de transiciones una nota explícita: "Transición 10 (otro + conf<80): delegada a guards.ts R0 (comportamiento extendido a todas las fases, no solo initial — aceptado por diseño simplificado del guard)."

---

_Revisado: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
