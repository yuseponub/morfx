---
phase: 42.1-observabilidad-bots-produccion
plan: 05
type: execute
wave: 3
depends_on: [03, 04]
files_modified:
  - src/lib/agents/claude-client.ts
  - src/lib/agents/media/sticker-interpreter.ts
  - src/lib/agents/somnio/minifrase-generator.ts
  - src/lib/agents/somnio/message-classifier.ts
  - src/lib/agents/somnio/template-paraphraser.ts
  - src/lib/agents/somnio/no-repetition-filter.ts
  - src/lib/agents/somnio-v3/comprehension.ts
  - src/inngest/functions/agent-production.ts
  - src/lib/agents/engine/unified-engine.ts
  - src/lib/agents/engine-adapters/production/timer.ts
  - src/lib/agents/somnio/interruption-handler.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/response-track.ts
  - src/lib/agents/somnio-v3/transitions.ts
autonomous: true

must_haves:
  truths:
    - "Las 7 call sites de Anthropic relacionadas con Somnio V3 usan createInstrumentedAnthropic en vez de new Anthropic directo"
    - "El handler Inngest agent-production wrappea el cuerpo del turno en runWithCollector() cuando feature flag ON"
    - "Cuando flag OFF, el comportamiento es IDENTICO al actual (zero diff funcional)"
    - "Cada llamada a Claude del pipeline lleva un purpose asignado via runWithPurpose (classifier, comprehension, minifrase, no_rep_l2, no_rep_l3, paraphraser, sticker)"
    - "Eventos del pipeline del agente (classifier result, intent, mode transition, block composition, etc.) se registran via collector.recordEvent en los puntos clave del pipeline"
    - "Los 5 mecanismos restantes del pipeline registran recordEvent en sus categorias dedicadas: silence_timer (start/cancel/fire), retake (retoma message), ofi_inter (Route 1/2/3 routing), interruption_handling (cliente escribio durante delay), pending_pool (que queda, que se descarta)" 
  artifacts:
    - path: "src/inngest/functions/agent-production.ts"
      provides: "Handler del agente wrappeado en runWithCollector + flush step"
      contains: "runWithCollector"
  key_links:
    - from: "src/inngest/functions/agent-production.ts"
      to: "src/lib/observability/collector.ts"
      via: "new ObservabilityCollector + runWithCollector"
      pattern: "new ObservabilityCollector"
    - from: "src/lib/agents/somnio-v3/comprehension.ts"
      to: "src/lib/observability/anthropic-instrumented.ts"
      via: "createInstrumentedAnthropic"
      pattern: "createInstrumentedAnthropic"
---

<objective>
Instrumentar el pipeline de Somnio V3 (el mas complejo de los 3 bots) + infraestructura compartida (claude-client, sticker-interpreter, helpers de somnio comunes). Esto activa la captura automatica de queries SQL y llamadas Claude para Somnio V3, Y añade recordEvent en los puntos clave del pipeline para timeline rico.

Purpose: Bot mas complejo primero porque tiene el pipeline mas rico (classifier, intent, no-rep, templates, etc.) — si esto funciona, GoDentist y Recompra (Plan 06) son triviales.
Output: Turnos de Somnio V3 capturan todo cuando feature flag ON.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-04-SUMMARY.md
@src/inngest/functions/agent-production.ts
@src/lib/agents/claude-client.ts
@src/lib/agents/somnio-v3/comprehension.ts
@src/lib/agents/somnio/message-classifier.ts
@src/lib/observability/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrar 7 call sites de Anthropic + setear purpose via runWithPurpose</name>
  <files>
src/lib/agents/claude-client.ts
src/lib/agents/media/sticker-interpreter.ts
src/lib/agents/somnio/minifrase-generator.ts
src/lib/agents/somnio/message-classifier.ts
src/lib/agents/somnio/template-paraphraser.ts
src/lib/agents/somnio/no-repetition-filter.ts
src/lib/agents/somnio-v3/comprehension.ts
  </files>
  <action>
Para cada archivo de la lista:

1. Primero LEER el archivo para entender el patron actual (singleton lazy vs construccion inline, posicion del `new Anthropic(`).

2. Reemplazar `new Anthropic({ apiKey: ... })` por `createInstrumentedAnthropic({ apiKey: ... })` importando de `@/lib/observability/anthropic-instrumented`. Preservar otros options (baseURL, etc).

3. Envolver la llamada `.messages.create(...)` en `runWithPurpose('<purpose>', () => client.messages.create(...))` para que el fetch wrapper sepa el proposito. Mapeo exacto:

| Archivo | purpose |
|---------|---------|
| claude-client.ts | 'claude_client_generic' (lo usan varios; puede ser override via param) |
| media/sticker-interpreter.ts | 'sticker_vision' |
| somnio/minifrase-generator.ts | 'minifrase' |
| somnio/message-classifier.ts | 'classifier' |
| somnio/template-paraphraser.ts | 'paraphraser' |
| somnio/no-repetition-filter.ts | **Sensible al nivel:** Level 1 es lookup (no IA — no va aqui); Level 2 = 'no_rep_l2'; Level 3 = 'no_rep_l3'. Revisar el archivo para separar. |
| somnio-v3/comprehension.ts | 'comprehension' |

4. `claude-client.ts` — si es una clase generica que varios call sites reusan, exportar una opcion para aceptar un `purpose?: string` en el metodo que ejecuta; fallback a `'claude_client_generic'`. NO romper el API publica existente de la clase.

5. Imports a agregar:
   ```typescript
   import { createInstrumentedAnthropic } from '@/lib/observability/anthropic-instrumented'
   import { runWithPurpose } from '@/lib/observability'
   ```

6. Verificar que ningun archivo importa `Anthropic from '@anthropic-ai/sdk'` solo para el constructor — si el import de Anthropic queda solo para tipos, cambiar a `import type Anthropic from '@anthropic-ai/sdk'`.

**IMPORTANTE (Regla 6):** cuando flag OFF, `runWithPurpose` debe seguir ejecutandose sin efectos — y `createInstrumentedAnthropic` ya hace fast-path via el wrapper. Verificar que ninguno de estos cambios altera el resultado funcional de los calls.
  </action>
  <verify>
- `npx tsc --noEmit` pasa
- `grep -rn "new Anthropic(" src/lib/agents/ | grep -v somnio-v2 | grep -v godentist | grep -v somnio-recompra` → 0 matches (excepto v2/godentist/recompra que Plan 06 migrara)
- Build de Next pasa
- Smoke funcional: con flag OFF, correr un test de sandbox (o e2e simple del agente) → resultado identico al baseline
  </verify>
  <done>
Todos los call sites de Somnio V3 / compartidos usan el helper. Purpose se propaga via ALS. Con flag OFF, el comportamiento es idempotente.
  </done>
</task>

<task type="auto">
  <name>Task 2a: Wrap agent-production.ts handler en runWithCollector (structural)</name>
  <files>src/inngest/functions/agent-production.ts</files>
  <action>
1. LEER el archivo completo primero. Identificar la estructura: imports, la funcion Inngest exportada, los `step.run(...)` internos.

2. En el tope del handler, despues de destructurar `event.data`, agregar:

```typescript
import { runWithCollector, ObservabilityCollector, isObservabilityEnabled } from '@/lib/observability'

// ... dentro del handler:
const collector = isObservabilityEnabled()
  ? new ObservabilityCollector({
      conversationId,
      workspaceId,
      agentId: await resolveAgentIdForWorkspace(workspaceId), // helper existente o nuevo: retorna 'somnio-v3' | 'godentist' | 'somnio-recompra'
      turnStartedAt: new Date(),
      triggerMessageId: messageId ?? null,
      triggerKind: event.data.triggerKind ?? 'user_message',
    })
  : null
```

Si no existe un resolver de agentId por workspace, crear uno inline al tope del archivo que lea `agents` o config del workspace. Fallback: leer desde el config del bot que ya usa el handler.

3. Refactor el cuerpo del handler en una inner function (cambio ESTRUCTURAL puro — NO agregar recordEvent en este task; eso es Task 2b):

```typescript
const run = async () => {
  try {
    // ... TODO el codigo actual del handler, sin cambios funcionales ...
    return result
  } catch (err) {
    collector?.recordError({ name: (err as Error).name, message: (err as Error).message, stack: (err as Error).stack })
    throw err
  }
}

const result = collector
  ? await runWithCollector(collector, run)
  : await run()

// Plan 07 añade el flush step aqui.
if (collector) {
  // Placeholder: await step.run('observability-flush', () => collector.flush())
  // flush() todavia es no-op — Plan 07 lo implementa.
}

return result
```

4. **Esto es un cambio puramente estructural.** Si el flag esta OFF, `collector` es null, no hay wrap, y el handler corre identico al baseline. Verificar con un smoke local que el comportamiento es idempotente ANTES de pasar a Task 2b.
  </action>
  <verify>
- Build de Next pasa
- `grep "runWithCollector" src/inngest/functions/agent-production.ts` → 1 match
- Con `OBSERVABILITY_ENABLED` unset: ejecutar manual un turno via /api/inngest trigger simulando el evento → resultado funcional identico al previo al cambio
- Tests existentes pasan
  </verify>
  <done>
Handler envuelto estructuralmente. Cero recordEvent agregados aun. Flag OFF = identico.
  </done>
</task>

<task type="auto">
  <name>Task 2b: Inyectar recordEvent additivos en agent-production.ts (12 puntos del pipeline)</name>
  <files>src/inngest/functions/agent-production.ts</files>
  <action>
DEPENDE de Task 2a — el handler ya esta wrappeado. Aqui solo agregamos llamadas `collector?.recordEvent(...)` ADDITIVAS — son no-ops si `collector` es null, asi que no pueden romper nada funcionalmente.

Agregar las siguientes llamadas en los puntos correspondientes del pipeline (usar nombres reales del codigo — adaptar segun lo que encuentres). Cada una va dentro de la inner `run()`:

- Despues del classifier rule-based: `collector?.recordEvent('classifier', 'rule-based classification', { result: classifierResult, confidence })`
- Despues del media gate: `collector?.recordEvent('media_gate', 'media gate decision', { kind, action, handoffTriggered })`
- Antes/despues del comprehension call de Somnio V3: el call mismo es capturado por el fetch wrapper — NO duplicar. Pero SI recordEvent del mode/intent resultado.
- Despues de detectar intent: `collector?.recordEvent('intent', label, { intent, confidence })`
- Mode transitions: `collector?.recordEvent('mode_transition', null, { from: currentMode, to: newMode })`
- Template selection: `collector?.recordEvent('template_selection', null, { candidates, selected })`
- No-repetition levels: `collector?.recordEvent('no_repetition', 'level-N', { level, decision, reason })`
- Block composition: `collector?.recordEvent('block_composition', null, { templateIds })`
- Pre-send check: `collector?.recordEvent('pre_send_check', 'client wrote during delay?', { clientWrote })`
- Handoff: `collector?.recordEvent('handoff', 'triggered', { reason, trigger })`
- Session lifecycle: `collector?.recordEvent('session_lifecycle', action, { action: 'open'|'close'|'reset' })`
- Char-delay calculo en agent-production: `collector?.recordEvent('char_delay', null, { calculatedMs, effectiveMs })` (los starts/cancels/fires de timers especificos van en Task 3)

CUIDADO: `collector?.recordEvent` debe estar en el codigo que corre DENTRO de `runWithCollector` — dado que ya wrappeamos `run()`, cualquier codigo dentro de `run()` tiene acceso. Los `step.run(...)` tambien heredan el ALS context (porque Inngest corre el step dentro del mismo tick del await, salvo retries en invocaciones separadas — ver Pitfall 2 del research, esto es aceptable).

NO intentar cubrir cada rama del pipeline en este plan — priorizar los hot paths listados.
  </action>
  <verify>
- Build pasa
- `grep -c "collector\?\.recordEvent" src/inngest/functions/agent-production.ts` ≥ 10
- Categorias presentes: `grep -oE "recordEvent\('[a-z_]+" src/inngest/functions/agent-production.ts | sort -u` debe incluir al menos: classifier, media_gate, intent, mode_transition, template_selection, no_repetition, block_composition, pre_send_check, handoff, session_lifecycle, char_delay
- Con flag OFF, smoke funcional: turno corre identico
  </verify>
  <done>
12+ recordEvent injetados en agent-production.ts. Eventos del hot path del pipeline registrados cuando flag ON, no-op cuando flag OFF.
  </done>
</task>

<task type="auto">
  <name>Task 3: Inyectar recordEvent en los 5 mecanismos restantes (silence_timer, retake, ofi_inter, interruption, pending_pool)</name>
  <files>
src/lib/agents/engine/unified-engine.ts
src/lib/agents/engine-adapters/production/timer.ts
src/lib/agents/somnio/interruption-handler.ts
src/lib/agents/somnio-v3/somnio-v3-agent.ts
src/lib/agents/somnio-v3/sales-track.ts
src/lib/agents/somnio-v3/response-track.ts
src/lib/agents/somnio-v3/transitions.ts
  </files>
  <action>
CONTEXT: estos 5 mecanismos estan EXPLICITAMENTE en scope per `42.1-CONTEXT.md` ("cada paso del pipeline...cada mecanismo de seguridad activado"). NO son cubiertos por las inyecciones de Task 2b porque viven en archivos separados al handler. Cada uno ya tiene su `EventCategory` declarado en Plan 02 (`silence_timer`, `interruption_handling`, `pending_pool` agregados ahi; `retake` y `ofi_inter` ya existian).

Patron general: importar `getCollector` desde `@/lib/observability` y llamar `getCollector()?.recordEvent(...)` en los puntos clave. Esto funciona PORQUE el handler de Task 2a ya envolvio toda la ejecucion del turno en `runWithCollector`, asi que cualquier llamada nested dentro de la misma tick del event loop tiene acceso al collector via ALS.

**1. silence_timer (start/cancel/fire)**
- Archivo principal: `src/lib/agents/engine/unified-engine.ts` (linea ~173 — `agentOutput.silenceDetected → this.adapters.timer.onSilenceDetected`).
- Adapter: `src/lib/agents/engine-adapters/production/timer.ts` (linea ~226 — emit `agent/silence.detected` event para iniciar el retake timer).
- Inyecciones:
  - En unified-engine, justo antes de llamar `onSilenceDetected`: `getCollector()?.recordEvent('silence_timer', 'start', { reason: 'silence_detected', sessionId, intent })`
  - En timer.ts production adapter, dentro de `onSilenceDetected` (~linea 226-250): `getCollector()?.recordEvent('silence_timer', 'inngest_event_emitted', { sessionId, conversationId, intent })` despues del send del evento. Tambien instrumentar el catch (~linea 250) con `getCollector()?.recordEvent('silence_timer', 'emit_failed', { error })`.
  - Si existe un cancel path del silence timer (grep `silence` en `production/timer.ts`), agregar `getCollector()?.recordEvent('silence_timer', 'cancel', { reason })`.
- NOTA: el "fire" del silence timer ocurre en un Inngest cron/timer handler distinto (`agent-timers-v3.ts` — referenciado en grep), que NO esta en el scope de un turno del agente principal. Ese fire instanciara su PROPIO collector si esta dentro de un turno separado. Para Phase 42.1: documentar que el fire del silence timer es un turno con `trigger_kind = 'timer'` separado, capturado naturalmente cuando ese handler tambien sea wrappeado (verificar que `agent-timers-v3.ts` ESTA wrappeado por Task 2a si comparte el mismo handler; si no, descopear el fire a una fase futura y dejarlo anotado en SUMMARY).

**2. retake (retoma message)**
- Archivos principales (per grep): `src/lib/agents/somnio-v3/transitions.ts`, `src/lib/agents/somnio-v3/response-track.ts`, `src/lib/agents/somnio-v3/sales-track.ts` — buscar referencias a `retoma`/`retake`.
- Inyecciones: en cada punto donde se DECIDE generar un mensaje de retoma o se SELECCIONA un template de retoma:
  - `getCollector()?.recordEvent('retake', 'decision', { willRetake, reason, attemptNumber })`
  - `getCollector()?.recordEvent('retake', 'template_selected', { templateId, templateName })` cuando se selecciona el template de retoma.
- Si hay logica de "max retakes excedido → handoff", instrumentar: `getCollector()?.recordEvent('retake', 'max_exceeded', { count, action: 'handoff' })`.
- LEER los 3 archivos primero para entender donde EXACTO va la inyeccion. Si el patron de retake esta centralizado en un solo metodo, una sola inyeccion alcanza.

**3. ofi_inter (Route 1, 2, 3)**
- Archivos: buscar en `src/lib/agents/somnio-v3/sales-track.ts` y `transitions.ts` por logica de routing entre ofertas/intents (3 rutas distintas).
- Inyecciones: en cada decision de routing:
  - `getCollector()?.recordEvent('ofi_inter', 'route_selected', { route: 1|2|3, reason, context })`
- Si hay un fallback path: `getCollector()?.recordEvent('ofi_inter', 'fallback', { reason })`.
- Si no encuentras 3 rutas explicitas en el codigo (puede que sea conceptual del CONTEXT.md), inyectar al menos UNA categoria `ofi_inter` que registre cualquier decision de routing entre tracks (sales/response/etc) con `route` como label libre. Documentar en SUMMARY que la taxonomia exacta de Routes 1/2/3 puede refinarse en una fase futura.

**4. interruption_handling (cliente escribio durante delay)**
- Archivo principal: `src/lib/agents/somnio/interruption-handler.ts`.
- Inyecciones (basado en grep — el archivo tiene `detect`, `markInterruption`, `getInterruptionTimestamp`, almacenamiento de pending messages):
  - En `detect()` (~linea 127): cuando retorna `wasInterrupted: true` → `getCollector()?.recordEvent('interruption_handling', 'detected', { sessionId, pendingCount, interruptedAt })`.
  - En `markInterruption()` (~linea 297): `getCollector()?.recordEvent('interruption_handling', 'marked', { sessionId, timestamp })`.
  - Cuando se almacena pending messages tras interruption (~linea 208): `getCollector()?.recordEvent('interruption_handling', 'pending_stored', { sequenceId, messageCount })`.
- Importar `getCollector` al top del archivo. NO usar `collector?.` porque el collector aqui llega via ALS (no por closure).

**5. pending_pool (que queda, que se descarta)**
- Archivo principal: `src/lib/agents/somnio/interruption-handler.ts` (relacionado con pending messages del interruption flow). Tambien revisar `src/lib/agents/somnio/message-sequencer.ts` que aparecio en grep de `interrupted`.
- Inyecciones:
  - Cuando se evalua el pending pool (decidir que mensajes mantener vs descartar): `getCollector()?.recordEvent('pending_pool', 'evaluated', { kept: kept.length, discarded: discarded.length, reason })`.
  - Cuando un pending pool se vacia/limpia: `getCollector()?.recordEvent('pending_pool', 'cleared', { reason: 'sent'|'expired'|'replaced' })`.
- Si no hay logica explicita de "pending pool" como estructura aparte, instrumentar las decisiones del `interruption-handler` que afectan el array de pending messages — eso ES el pending pool.

**Patron de import comun (todos los archivos):**
```typescript
import { getCollector } from '@/lib/observability'
```

**REGLA 6 compliance:** todos los `getCollector()?.recordEvent(...)` son no-ops cuando flag OFF (porque no hay collector en ALS). Cero impacto funcional. Verificar con smoke test al final del task.

**Si al leer los archivos descubres que un mecanismo no existe en el codigo actual** (p.ej. ofi_inter Routes 1/2/3 son conceptuales y no implementados), DOCUMENTAR en SUMMARY de Plan 05 con estructura: "Mechanism X — STATE: not_implemented_in_code | partial | full". NO inventar codigo nuevo. La fase 42.1 SOLO instrumenta lo que existe; si el mecanismo es teorico, queda anotado para una futura fase.
  </action>
  <verify>
- Build pasa
- `grep -rn "getCollector()?.recordEvent" src/lib/agents/ | wc -l` ≥ 8 (al menos 8 puntos de inyeccion entre los 5 mecanismos)
- Categorias presentes en el grep: `silence_timer`, `interruption_handling`, `pending_pool` (estas 3 son nuevas — verificar que aparecen). `retake` y `ofi_inter` aparecen si los archivos de Somnio V3 tenian la logica.
- Smoke con flag OFF: turno completo del agente corre identico al baseline
- Tests existentes pasan
  </verify>
  <done>
Los 5 mecanismos del scope CONTEXT.md tienen inyecciones de recordEvent en sus archivos respectivos. Los gaps conocidos (mechanisms parcial o no implementados) estan documentados en el SUMMARY del plan. Plan 11 ya no necesita "identificar gaps" para estos 5.
  </done>
</task>


</tasks>

<verification>
- Next build pasa
- Tests existentes pasan
- Con flag OFF, comportamiento del agente es idempotente
- Handler Inngest sigue respetando los concurrency keys y retries existentes
- Inner function `run()` no cambio logica, solo envolvio el cuerpo
</verification>

<success_criteria>
Turnos de Somnio V3 instrumentados end-to-end: queries via fetch wrapper (Plan 03), AI calls via fetch wrapper + helper (Plan 04 + este), eventos del pipeline via recordEvent. Todo queda en memoria hasta que Plan 07 implemente el flush.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-05-SUMMARY.md` con: lista de call sites migrados, eventos instrumentados con categoria y label, decision sobre resolveAgentIdForWorkspace.
</output>
