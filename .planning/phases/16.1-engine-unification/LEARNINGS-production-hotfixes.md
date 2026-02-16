# Production Hotfixes — Learnings (10 feb 2026)

Session de testing en produccion del agente Somnio via WhatsApp.
Todos los bugs encontrados y corregidos como hotfixes directos (sin GSD workflow por urgencia).

---

## Bug 1: WhatsApp mensajes no se enviaban via adapter

### Sintoma
El engine procesaba correctamente pero los mensajes nunca llegaban al cliente por WhatsApp.

### Causa Raiz
El `ProductionMessagingAdapter` delegaba el envio a un sistema de colas/templates que no funcionaba correctamente en el contexto de produccion. El mensaje pasaba por multiples capas de abstraccion innecesarias.

### Solucion
Reemplazar el envio con llamada directa a la API de 360dialog:
```typescript
// Envio directo via sendTextMessage() de whatsapp/sender.ts
await sendTextMessage(phoneNumber, message, workspaceId)
```

### Commit
`36109b4` fix: enviar mensajes WhatsApp directamente via API 360dialog

### Leccion
En produccion, menos capas = menos puntos de fallo. Para messaging critico, la ruta mas directa es la mejor.

---

## Bug 2: "si" no funcionaba — implicit yes earlyReturn

### Sintoma
Cuando el cliente respondia "si" para confirmar la compra, el agente no detectaba la confirmacion y respondia como si fuera un mensaje normal.

### Causa Raiz
`checkImplicitYes()` tenia un `earlyReturn` que se activaba incorrectamente cuando no habia datos reales capturados, saltando la deteccion de confirmacion.

### Investigacion
Se paso por 4 iteraciones de fix:
1. `f6c0592` - No activar earlyReturn sin datos reales
2. `cb02233` - Eliminar earlyReturn completamente, usar modeChanged
3. `9d25816` - Skip checkImplicitYes para mensajes cortos + maxDuration 60s
4. `b710403` - Revertir skip + agregar diagnostico visible

### Solucion Final
Eliminar el patron `earlyReturn` de `checkImplicitYes` y usar `modeChanged` como senal de transicion. Los mensajes cortos como "si", "ok", "dale" ahora pasan por la deteccion normal de intents.

### Leccion
- `earlyReturn` en funciones de deteccion es peligroso — puede silenciar casos validos
- Los mensajes mas cortos son los mas importantes para el flujo de ventas
- Cuando un bug tiene 4+ intentos de fix, el patron subyacente esta mal (no el caso especifico)

---

## Bug 3: Turnos assistant no se guardaban en DB

### Sintoma
El agente repetia contexto o perdia hilo de conversacion porque no tenia sus propias respuestas en el historial.

### Causa Raiz
El `UnifiedEngine` solo guardaba turnos `user` pero nunca `assistant`. En el sandbox esto no importaba (historial en memoria), pero en produccion el historial se lee de `agent_turns` en DB.

### Solucion
Agregar grabacion de turno assistant despues del envio de mensajes:
```typescript
// Record assistant turn (critical for intent detection context)
const assistantContent = agentOutput.messages
  .filter(m => !m.startsWith('[SANDBOX:'))
  .join('\n')
if (assistantContent.trim()) {
  await this.adapters.storage.addTurn({
    sessionId: session.id,
    turnNumber: (input.turnNumber ?? (history.length + 1)) + 1,
    role: 'assistant',
    content: assistantContent,
  })
}
```

### Commit
`6312316` fix: guardar turnos assistant en agent_turns

### Leccion
- Lo que funciona en sandbox (historial in-memory) puede fallar en produccion (historial DB)
- El historial del assistant es CRITICO para deteccion de intents — sin contexto de lo que el bot dijo, Claude no puede interpretar respuestas como "si"

---

## Bug 4: Inngest Cloud no podia acceder a /api/inngest

### Sintoma
Inngest mostraba "Error — Could not reach your URL" al intentar sincronizar funciones. Las funciones de timer nunca se registraban.

### Causa Raiz (3 problemas simultaneos)

**4a. Middleware bloqueando Inngest:**
`middleware.ts` solo tenia excepciones para `/api/webhooks` y `/api/v1/tools`. Las requests de Inngest Cloud a `/api/inngest` pasaban por autenticacion de Supabase y fallaban.

```typescript
// FALTABA esto:
if (pathname.startsWith('/api/inngest')) {
  return NextResponse.next()
}
```

**4b. Vercel Deployment Protection:**
Vercel tenia habilitada la proteccion de deployment que bloqueaba requests externas no autenticadas (como las de Inngest Cloud).

**4c. Custom Production Domain no configurado:**
Inngest no sabia cual era la URL de produccion para sincronizar.

### Solucion
1. Agregar excepcion en middleware (`b4439f8`)
2. Desactivar Deployment Protection en Vercel
3. Configurar Custom Production Domain en Inngest: `morfx-sandy.vercel.app`

### Leccion
- Inngest necesita 3 cosas: middleware bypass + sin deployment protection + URL correcta
- Los errores 405 en logs de Vercel fueron red herring — el problema real era el middleware
- Siempre verificar que servicios externos pueden llegar a tus endpoints

---

## Bug 5: Timer enviaba mensaje doble

### Sintoma
Al expirar el timer de ingest (datos parciales), el mensaje de "campos faltantes" se enviaba 2 veces al cliente.

### Causa Raiz
Dos eventos Inngest se emitian para el mismo escenario:
1. `agent/collecting_data.started` — desde `onModeTransition`
2. `agent/ingest.started` — desde `onIngestStarted`

Ambos creaban funciones Inngest independientes que al expirar enviaban el mismo mensaje.

### Solucion
Reestructurar la logica de timer lifecycle en `unified-engine.ts`:
- `onModeTransition` ya NO maneja `collecting_data` (skip si `newMode === 'collecting_data'`)
- `onIngestStarted` es el UNICO responsable de timers durante recoleccion de datos
- `onModeTransition` solo maneja transiciones a `ofrecer_promos`, `resumen`, etc.

```typescript
// Mode transition → only for non-collecting_data modes
if (this.adapters.timer.onModeTransition && modeChanged && newMode !== 'collecting_data') {
  await this.adapters.timer.onModeTransition(...)
}
```

### Commit
`bd3b3b5` fix: evitar timer doble

### Leccion
- Dos hooks que cubren el mismo caso = mensaje doble garantizado
- Regla: cada escenario de timer debe tener UN SOLO punto de emision de evento
- Separar responsabilidades: ingest hooks para collecting_data, mode transition hooks para todo lo demas

---

## Bug 6: forceIntent 'ofrecer_promos' creaba timer de ingest

### Sintoma
Cuando el timer L2 expiraba y forzaba transicion a `ofrecer_promos`, se emitia un evento `agent/ingest.started` incorrecto (creando un timer de recoleccion de datos en modo promos).

### Causa Raiz
`hasIngestStart` se evaluaba como `true` para CUALQUIER signal de start, sin verificar si el modo actual era `collecting_data`. El forceIntent `ofrecer_promos` generaba un signal start (para el timer de promos) que activaba incorrectamente `onIngestStarted`.

### Solucion
Agregar verificacion de modo:
```typescript
const effectiveMode = newMode || session.current_mode
if (hasIngestStart && !hasIngestCancel && effectiveMode === 'collecting_data' && ...) {
  await this.adapters.timer.onIngestStarted(session, hasPartialData)
}
```

### Commit
`b681101` (parte 1) fix: prevenir timers duplicados

### Leccion
- Siempre verificar el CONTEXTO del signal, no solo su existencia
- `effectiveMode` (newMode || current_mode) captura correctamente la transicion

---

## Bug 7: Datos adicionales durante timer activo = timer duplicado

### Sintoma
Si el cliente enviaba datos parciales y luego mas datos antes de que el timer expirara, se creaba un segundo timer Inngest sin cancelar el primero. Resultado: dos mensajes al expirar.

### Causa Raiz
`onIngestStarted` emitia `agent/ingest.started` sin primero cancelar el timer anterior. Inngest ejecuta funciones independientes — no hay "reemplazo" automatico.

### Solucion
En `ProductionTimerAdapter.onIngestStarted()`, emitir cancelacion antes de iniciar:
```typescript
// Cancel any running ingest timer first (prevents duplicates)
await inngest.send({
  name: 'agent/ingest.completed',
  data: { sessionId: session.id, reason: 'cancelled' },
})
// THEN start new timer
await inngest.send({
  name: 'agent/ingest.started',
  data: { ... }
})
```

### Commit
`b681101` (parte 2) fix: prevenir timers duplicados

### Leccion
- Patron: SIEMPRE cancel-before-start para timers
- Inngest no tiene "upsert" de funciones — cada evento crea una nueva ejecucion
- El sandbox ya manejaba esto con `clearTimers()` en `start()`, pero produccion no tenia equivalente

---

## Bug 8: OrderCreator "Unknown tool: crm.contact.list"

### Sintoma
Cuando el cliente confirmaba la compra, la creacion de orden fallaba con: `"error":"Unknown tool: crm.contact.list"`.

### Causa Raiz
`OrderCreator` usa `executeToolFromAgent()` que requiere el tool registry inicializado. En el contexto normal (Next.js server), `instrumentation.ts` llama `initializeTools()` al inicio. Pero en funciones Inngest (serverless), `instrumentation.ts` puede no ejecutarse, dejando el registry vacio.

### Solucion
Agregar `initializeTools()` al inicio de `createContactAndOrder()`:
```typescript
async createContactAndOrder(data, pack, sessionId) {
  initializeTools() // Idempotent — safe to call multiple times
  // ... rest of method
}
```

### Commit
`b489527` fix: inicializar tool registry en OrderCreator

### Leccion
- En serverless/Inngest: NO asumir que el estado global existe
- `initializeTools()` es idempotente (tiene flag `initialized`) — llamarlo de mas no hace dano
- Regla: si un modulo depende de inicializacion global, llamarla al inicio del metodo

---

## Bug 9: Timer L1 no pedia correo ni barrio

### Sintoma
Cuando el timer L1 (datos parciales) expiraba, el mensaje de "campos faltantes" listaba solo 6 campos (nombre, apellido, telefono, direccion, ciudad, departamento) pero no pedia correo ni barrio.

### Causa Raiz
`TIMER_LEVELS[1].buildAction` usaba `TIMER_MINIMUM_FIELDS` (6 campos minimos para despacho) en vez de `TIMER_ALL_FIELDS` (8 campos totales incluyendo barrio y correo).

### Solucion
Cambiar a `TIMER_ALL_FIELDS` en el buildAction del nivel 1:
```typescript
buildAction: (ctx: TimerEvalContext): TimerAction => {
  const missing = TIMER_ALL_FIELDS.filter(  // Antes: TIMER_MINIMUM_FIELDS
    (f) => !ctx.fieldsCollected.includes(f)
  ).map((f) => `- ${FIELD_LABELS[f]}`)
  // ...
}
```

### Commit
`162b7ae` fix: incluir correo y barrio en lista de campos faltantes

### Leccion
- "Campos minimos" (para despachar) != "campos que queremos pedir" (todos)
- El timer debe pedir TODOS los campos faltantes, no solo los minimos

---

## Bug 10: agent-timers.ts no igualaba sandbox

### Sintoma
Los timers de produccion (Inngest) no evaluaban niveles como el sandbox. No usaban TIMER_LEVELS ni TIMER_PRESETS. Los tiempos estaban hardcodeados y no respetaban el preset del workspace.

### Causa Raiz
`agent-timers.ts` fue escrito antes de que existiera el sistema de 5 niveles del sandbox (`IngestTimerSimulator`). Tenia logica propia que no coincidia con los niveles L0-L4.

### Solucion
Reescritura completa de `agent-timers.ts` para:
1. Importar `TIMER_LEVELS` y `TIMER_PRESETS` del sandbox
2. Evaluar niveles exactamente igual que `IngestTimerSimulator`
3. Leer `timer_preset` del workspace para duraciones
4. Ejecutar `buildAction()` con contexto real de la sesion
5. Enviar mensajes via WhatsApp directamente

### Commits
`8dd2e0b` + `94b3f98` fix: reescribir timers Inngest para igualar sandbox

### Leccion
- Produccion y sandbox DEBEN compartir la misma logica de timer (single source of truth)
- Cuando sandbox evoluciona (niveles, presets), produccion debe actualizarse
- Importar definiciones del sandbox en produccion garantiza consistencia

---

## Bug 11: ingestStatus se intentaba guardar en DB

### Sintoma
Error al guardar estado: `column "ingest_status" does not exist`.

### Causa Raiz
`saveState()` intentaba guardar `ingestStatus` en `session_state`, pero esa columna solo existe conceptualmente en el sandbox (in-memory). La tabla de DB no la tiene.

### Solucion
Filtrar `ingestStatus` antes de enviar a `saveState()`:
```typescript
await this.adapters.storage.saveState(session.id, {
  datos_capturados: agentOutput.stateUpdates.newDatosCapturados,
  templates_enviados: agentOutput.stateUpdates.newTemplatesEnviados,
  pack_seleccionado: agentOutput.stateUpdates.newPackSeleccionado,
  // ingestStatus is sandbox-only, NOT a DB column
})
```

### Commit
`a833968` fix: no guardar ingestStatus en session_state

### Leccion
- Sandbox state != DB schema. No todos los campos del estado in-memory existen como columnas
- El adapter pattern deberia encapsular esto, pero en la transicion hay que ser explicito

---

## Bug 12: Inngest events faltaban conversationId y lifecycle hooks

### Sintoma
Eventos Inngest se emitian sin `conversationId` (necesario para enviar WhatsApp). Los hooks `onIngestStarted`/`onIngestCompleted` no estaban conectados en el engine.

### Causa Raiz
El wiring del engine a los timer adapter hooks estaba incompleto. Solo se conectaba `onModeTransition` y `onCustomerMessage`, faltaban los hooks de ingest.

### Solucion
Conectar todos los hooks en `unified-engine.ts` y pasar `conversationId` a los eventos Inngest.

### Commit
`315be9c` fix: wire onIngestStarted/onIngestCompleted + pass conversationId

### Leccion
- Al agregar un adapter interface, verificar que TODOS los metodos estan conectados en el engine
- Un hook declarado pero no llamado es invisible hasta que falla en produccion

---

## Resumen de Patrones

### Temas Recurrentes
1. **Sandbox vs Produccion**: 5 bugs por diferencias entre in-memory y DB/Inngest/WhatsApp
2. **Timer duplicados**: 3 bugs por multiple puntos de emision del mismo evento
3. **Inicializacion global**: 2 bugs por asumir que el estado global existe (tools, instrumentation)
4. **Wiring incompleto**: 2 bugs por hooks declarados pero no conectados

### Reglas Derivadas
- `cancel-before-start` para CUALQUIER timer en produccion
- UN SOLO punto de emision por escenario de timer
- `initializeTools()` en cualquier entry point que use CRM tools
- Produccion debe importar definiciones del sandbox (single source of truth)
- Middleware debe tener bypass explicito para cada servicio externo (Inngest, webhooks)
- Turnos assistant deben guardarse para mantener contexto de intent detection

### Archivos Clave Modificados
| Archivo | Bugs Relacionados |
|---------|-------------------|
| `unified-engine.ts` | 3, 5, 6, 11, 12 |
| `production/timer.ts` | 7 |
| `agent-timers.ts` | 10 |
| `order-creator.ts` | 8 |
| `ingest-timer.ts` | 9 |
| `middleware.ts` | 4 |
| `somnio-agent.ts` | 2 |
| `webhook-processor.ts` | 1 |

---

# Hotfixes Sesion 12 feb 2026

---

## Bug 13: Ordenes no se refrescaban automaticamente en UI

### Sintoma
Cuando el agente creaba una orden (por timer o conversacion normal), la lista de ordenes en el panel de contacto NUNCA se actualizaba. El usuario tenia que hacer F5 para ver la orden.

### Causa Raiz
**Supabase Realtime con filtro `contact_id=eq.X` en orders INSERT nunca dispara** porque `REPLICA IDENTITY` por defecto solo incluye PK (`id`). Supabase silenciosamente descarta el filtro y el evento nunca llega al frontend. Los 5+ intentos previos fallaron porque todos dependian de Supabase Realtime.

### Intentos Fallidos
| Commit | Enfoque | Por que fallo |
|--------|---------|---------------|
| `bd2898c` | Realtime directo orders | orders no estaba en publicacion |
| `18390b3` | Migracion para agregar orders a realtime | Filtro contact_id no funciona sin REPLICA IDENTITY FULL |
| `36a7e6e` | Polling cada 10s/15s | UX pobre, no realtime |
| `77bc24a` | Trigger por mensaje outbound | Race condition — orden se crea DESPUES del mensaje |
| `7c47df3` | 3 mecanismos en paralelo | Demasiado complejo, mismo problema de base |
| `1398b59` | Conversation UPDATE trigger | Funciona pero con race condition de 1s |

### Solucion Final
Polling cada 30s en `RecentOrdersList` que compara IDs por ref para evitar re-renders innecesarios. Solo corre mientras el panel de contacto esta montado (cleanup via `clearInterval`). Loading spinner solo en carga inicial, no en refreshes.

### Commits
- `df9b883` fix: auto-refresh ordenes con polling cada 30s
- `861e949` fix: quitar animacion de carga en refresh

### Leccion
- **Supabase Realtime NO soporta filtros en columnas no-PK** sin `REPLICA IDENTITY FULL`
- Cuando algo falla 5+ veces con el mismo patron (Realtime), cambiar de patron (polling)
- Polling con comparacion por ref es eficiente y confiable
- 30s es suficiente para UX aceptable sin desperdiciar computo

---

## Bug 14: Velocidad de respuesta no hacia nada

### Sintoma
El slider de "Velocidad de respuesta" en la config del agente guardaba un valor en DB pero el `ProductionMessagingAdapter` lo ignoraba. Todos los mensajes se enviaban con delays fijos.

### Causa Raiz
`response_speed` se guardaba en `workspace_agent_config` pero nunca se pasaba al adapter. El constructor del `ProductionMessagingAdapter` no tenia parametro de velocidad.

### Solucion
1. UI: Reemplazar slider por 3 presets (Real=1.0, Rapido=0.2, Instantaneo=0.0)
2. Backend: Agregar `responseSpeed` al constructor del messaging adapter
3. Wiring: `webhook-processor.ts` y `agent-timers.ts` cargan config y pasan `response_speed`
4. Delay: `delaySeconds * responseSpeed * 1000` (0 = sin delay)

### Commit
`7749f83` feat: reemplazar slider por presets y conectar al messaging adapter

### Leccion
- Config sin wiring = feature muerta
- Los presets son mejor UX que un slider continuo para este caso

---

## Feature: Auto-tag ordenes con "WPP"

### Descripcion
Toda orden creada por el agente de WhatsApp se etiqueta automaticamente con "WPP".

### Implementacion
`ProductionOrdersAdapter` busca el tag "WPP" (scope: orders) en el workspace despues de crear la orden y lo asigna via `order_tags`. Si no existe, lo omite silenciosamente.

### Commit
`702a661` feat: auto-tag ordenes con etiqueta "WPP"
