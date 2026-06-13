# v4-observability-completeness — Research

**Researched:** 2026-06-13
**Domain:** Internal codebase instrumentation (somnio-sales-v4 pipeline observability)
**Confidence:** HIGH (all claims backed by file:line evidence read this session)

## Summary

Esta fase es **instrumentación aditiva** (Regla 6) sobre la infra de observabilidad que YA existe (`src/lib/observability` + tabla `agent_observability_events`). No se introduce librería nueva ni se cambia comportamiento del agente. El emisor canónico es `getCollector()?.recordEvent(category, label, payload)` — `recordEvent` ya está envuelto en try/catch interno (no-throw, `collector.ts:159-170`) y `getCollector()` retorna `null` fuera de turno (no-throw vía `?.`). El patrón de emisión dual (DB + `console.log` con prefijo) es `emitLockEvent` (`interruption-system-v2/observability.ts:77-86`).

Las 4 zonas ciegas confirmadas con evidencia: (1) **el `errorMessage` REAL se descarta** en `v4-production-runner.ts:599` (hardcodea `'V4 agent processing failed'`) y NUNCA llega a observabilidad ni al chat; (2) **el CRM gate (`runCrmGate`, `crm-gate.ts:312`) es totalmente mudo** — cero `recordEvent`; (3) **ningún evento del pipeline lleva `restartIteration`** — `V4AgentInput` (`types.ts:142`) ni siquiera tiene el campo, hay que añadirlo y threadearlo desde el v4Input builder (`turn-orchestrator.ts:158`); (4) **el sub-loop solo emite `subloop_completed` en los terminales** — no hay evento de tooling (topic+similarity+kbHits) ni de generation (confidence), que es justo lo que explica el flip `generated`↔`no_match`.

**Primary recommendation:** Crear un helper `recordStage()` dual-emission (modelo `emitLockEvent`) que añada `restart_iteration` uniforme al payload; añadir campo `restartIteration?: number` a `V4AgentInput` + pasar `ctx.restartIteration` en el builder; reescribir `v4-production-runner.ts:597-600` para propagar `output.errorMessage` redactado+truncado (sin stack) al `error.message`, y emitir además un evento `engine_error` con stack truncado (3-5 frames) a observabilidad; instrumentar `runCrmGate` + cada paso del sub-loop con eventos nuevos. NINGÚN label nuevo toca el union tipado `LockEventLabel` → cero riesgo de romper el test `toHaveLength(11)`.

## Architecture Patterns

### El idioma no-throw (OBLIGATORIO — Regla 6)

`recordEvent` ya es no-throw por dentro (`collector.ts:159-170` envuelve el push en try/catch). `getCollector()` puede ser `null` (fuera de turno: cron, smoke) → el `?.` lo hace no-op. **Por eso `getCollector()?.recordEvent(...)` es seguro tal cual** — es el idioma usado en TODO v4 (ej. `somnio-v4-agent.ts:566`, `:420`, `:630`).

```typescript
// El único riesgo residual de throw es el console.log con payload circular.
// Por eso el helper del spine debe envolver SU PROPIO cuerpo en try/catch
// (no por recordEvent, sino por el console.log + cualquier cómputo del payload).
```

### Patrón de emisión dual (modelo a replicar: `emitLockEvent`)

`src/lib/agents/interruption-system-v2/observability.ts:77-86`:
```typescript
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void {
  const collector = getCollector()
  if (collector) {
    collector.recordEvent('pipeline_decision', label, payload)
  }
  console.log(`[interruption-v2] ${label}`, payload)
}
```
**El spine helper (`recordStage`) debe seguir este patrón pero con try/catch global** (porque `console.log` de un payload con referencia circular SÍ podría tirar, y eso violaría Regla 6). Decisión de Claude's Discretion: prefijo `[v4-spine]`, category `pipeline_decision`.

### Categoría del evento

`EventCategory` (`types.ts:62-86`) es un union cerrado. `'pipeline_decision'` y `'error'` ya están. **Usar `'pipeline_decision'` para todos los eventos nuevos del spine/gate/sub-loop** (consistente con lo existente; CONTEXT dice `pipeline_decision` como default). El evento del error-path puede usar `'error'` si se quiere filtrarlo aparte, pero `pipeline_decision` con label `engine_error` es suficiente y más consistente con el resto de v4. **No añadir categorías nuevas** (rompería filtros UI downstream).

### Esquema de persistencia (tabla `agent_observability_events`)

Confirmado vía `flush.ts:146-154` (mapeo collector→DB). Columnas por evento:
| Columna | Origen | Notas |
|---------|--------|-------|
| `turn_id` | FK al turno | asignado en flush |
| `recorded_at` | `e.recordedAt.toISOString()` | reloj del collector |
| `sequence` | `e.sequence` | monotónico per-turn (orden timeline) |
| `category` | `e.category` | `EventCategory` |
| `label` | `e.label ?? null` | string libre (NO el union tipado) |
| `payload` | `e.payload` | JSONB arbitrario |
| `duration_ms` | `Math.round(e.durationMs)` o null | opcional, 4º arg de `recordEvent` |

**`recordEvent` firma exacta** (`collector.ts:153-158`):
```typescript
recordEvent(
  category: EventCategory,
  label: string | undefined,
  payload: Record<string, unknown>,
  durationMs?: number,   // ← úsalo para latencia por stage (D-02 spine)
): void
```

### Placement: core (compartido) vs agente (compartido) vs runner (prod-only) — PARITY

`core/turn-orchestrator.ts` es COMPARTIDO por prod runner Y sandbox engine (`INTERRUPTION-PARITY.md`). Regla de placement:
- **Spine de stages que viven en `somnio-v4-agent.ts` / `sub-loop/index.ts` / `crm-gate.ts`** → instrumentar AHÍ. Son compartidos también (sandbox los reusa) → los eventos aparecen en ambos lados, lo cual es DESEABLE (paridad de observabilidad). Inofensivo: el sandbox mockea `getCollector` a no-op (`somnio-v4-agent.test.ts:96`).
- **Send-loop** vive en `core/turn-orchestrator.ts:452` → instrumentar en el core (ambos heredan).
- **Error-path fix (línea 599)** vive en `v4-production-runner.ts` → **runner-only**. El sandbox engine (`engine-v4.ts:224`) tiene su propio mapeo de error; si se quiere paridad de "error limpio" en sandbox, es un cambio análogo separado (Claude's Discretion / deferible).

## Injection Points

> Checklist per-stage. `[EXISTE]` = ya emite algo; `[MUDO]` = no emite nada hoy.

### A. Error path (D-01 — cierra el agujero negro)

| # | Qué | Dónde (file:line) | Acción |
|---|-----|-------------------|--------|
| A1 | El agente arma `errorMessage = errMsg :: errStack` (3-4 frames) en su catch externo, lo retorna en `V4AgentOutput.errorMessage`. NO emite evento. | `somnio-v4-agent.ts:1014-1036` | **Emitir** `engine_error` aquí con `{ stage, errorMessage, stackFrames, restartIteration }` (redactado). El `stage` se infiere por una var `currentStage` que se actualiza al entrar a cada stage (ver spine B). |
| A2 | El orchestrator solo desvía a drain si `errorMessage.startsWith('interrupted_at_ckpt_')` (`:203-219`). Un `success:false` con errorMessage NO-interrupt **cae a `agent_routed` (:221, loggea success:false sin el motivo) y completa normal** → `kind:'completed'`. | `turn-orchestrator.ts:203-228` | El errorMessage del output ESTÁ disponible aquí. **Opción**: propagarlo en el `TurnResult` completed para que el runner lo lea (ver A3). |
| A3 | **EL AGUJERO**: runner mapea `kind:'completed'` y hardcodea el error. `output.errorMessage` real se DESCARTA. | `v4-production-runner.ts:597-600` | **Reescribir**: `message: redactPII(truncate(output.errorMessage ?? 'V4 agent processing failed', 200))`. Formato sugerido D-01: `` `V4_AGENT_ERROR @ ${stage}: ${cleanReason}` `` **SIN stack** (el chat no quiere stack). El `output` aquí es `result.output` (`:574`) → necesita exponer `errorMessage` + `stage` (hoy `V4AgentOutput.errorMessage` ya existe, `types.ts:221`; falta `stage`). |
| A4 | El error llega al chat como `[ERROR AGENTE] {code}: {message}` (truncado a 500). | `webhook-handler.ts:552`, `agent-production.ts:591`, `webhook-processor.ts:665-668` | **NO tocar estos** — mejorar `error.message` en A3 mejora las 3 superficies de chat de un solo cambio (D-01 "una sola fuente"). |
| A5 | `engineOutput.error` se propaga a la respuesta del webhook PERO **no se emite ningún `recordEvent` con el error en el path v4**. `webhook_agent_routed` (`webhook-processor.ts:789-793`) NO lleva el error. | `webhook-processor.ts:789` | Confirmado: el errorMessage real NUNCA llega a `agent_observability_events`. El evento `engine_error` de A1 lo arregla. |

**`V4_ENGINE_ERROR` vs `V4_AGENT_ERROR` vs `V4_ZOMBIE_LAMBDA_EXIT` — cuándo dispara cada uno:**
- `V4_ZOMBIE_LAMBDA_EXIT` (`v4-production-runner.ts:552`, vía `result.kind==='zombie_exit'`): el send-adapter detectó pérdida de lock (lambda zombie). Emite también `emitLockEvent('zombie_lambda_exit', ...)` en `turn-orchestrator.ts:635`.
- `V4_ENGINE_ERROR` (`v4-production-runner.ts:128` y `:564`): un throw que ESCAPA del core (raro — el core captura casi todo) **o** `result.kind==='error'` (el core convirtió un throw de `loopBody` a `{kind:'error', message, cause}` en `turn-orchestrator.ts:642-646`). Este SÍ lleva `result.message` con stack (3 frames). Es el caso "crash duro".
- `V4_AGENT_ERROR` (`v4-production-runner.ts:598`): el agente NO tiró excepción — retornó `output.success===false` (su catch interno, `somnio-v4-agent.ts:1018`). **Este es el caso `1b561aaf`** y es el que descarta el motivo real. **Foco principal de D-01.**

### B. Spine uniforme (D-02) — `stage_entered` / `stage_completed` / `stage_errored`

Mantener una var local `currentStage: V4Stage` en `processUserMessage` que se actualice al entrar a cada stage (para que el catch A1 sepa dónde reventó). Emitir spine events en estos puntos:

| Stage | Entrada (file:line) | Evento existente hoy | Datos en scope para emitir |
|-------|---------------------|----------------------|----------------------------|
| comprehension | `somnio-v4-agent.ts` ~`:165` (deserialize) → `comprehend()` import `:32` | `comprehension_completed_v4` `[EXISTE]` `:420-430` | intent, confidence, threshold, scaledToSubLoop, tokensUsed |
| guards | `:440` `checkGuards(analysis)` | `guard blocked/passed` `[EXISTE]` `:442`, `:505` (category `'guard'`) | intent, confidence, reason |
| sales-track | `:520`-`:564` (resolveSalesTrack) | `sales_track_result` `[EXISTE]` `:566-575` | accion, reason, enterCaptura, timerSignal, phase |
| **CRM gate** | `:594` `runCrmGate(...)` | **`[MUDO]`** | ver sección C |
| response-track | `:618` `resolveResponseTrack(...)` | `response_track_result` `[EXISTE]` `:630-636` | salesTemplateIntents, infoTemplateIntents, messageCount |
| slot resolver / sub-loop | `:678` `resolveLowSlot` → `:697` `runSubLoop` | `subloop_low_confidence_invoked` `[EXISTE]` `:685`, luego sub-loop (sección D) | reason, confidence, threshold, intent |
| **send-loop** | `core/turn-orchestrator.ts:452` `adapters.send(block)` | `agent_routed` `[EXISTE]` `:221` (no es por-mensaje) | messagesSent, sentMessageContents, actuallySentIds |

**Estrategia mínima-invasiva (recomendada):** los stages que YA emiten un `*_result` event están cubiertos para "completed". Lo que falta uniformemente es: (a) `restart_iteration` en TODOS (D-03, sección E), (b) `stage_entered`/`stage_errored` para los que hoy no tienen (CRM gate, send), y (c) actualizar `currentStage` para el catch. **No es necesario duplicar `stage_completed` donde ya hay un `*_result`** — reusar esos como el "completed" del stage y solo añadir el campo `restart_iteration` (Regla 0 dice cobertura total, pero D-02 admite que el spine "+ eventos propios" cubra; el plan decide si añade `stage_entered` redundante o reusa los `*_result`).

### C. CRM gate (`runCrmGate`, `crm-gate.ts:312`) — HOY MUDO

`RunCrmGateResult` = `{ crmActions, crmResult? }`. Corre internamente `runCrmSubLoop` (`:338`). Puntos de emisión:

| Punto | file:line | Evento sugerido | Payload |
|-------|-----------|-----------------|---------|
| Gate NO prende (early `return { crmActions: [] }`) | `crm-gate.ts:316-324` | `crm_gate_skipped` | `{ accion, category, newFields, reason: 'not_fired' }` |
| Gate prende (post grounding+subloop) | `crm-gate.ts:338-369` (antes del return `:369`) | `crm_gate_completed` | `{ fired:true, crmActionsCount, crmActionTools: crmActions.map(a=>a.tool), success: crmResult?.success, orderId(idSuffix), snapshotWritten }` |
| Error dentro del gate | el gate NO tiene try/catch propio — un throw del sub-loop sube al catch del agente (`somnio-v4-agent.ts:1014`) con `currentStage='crm-gate'` | (cubierto por A1) | `engine_error` con `stage:'crm-gate'` |

**Nota:** el gate hoy NO está en try/catch propio → un fallo del sub-loop CRM se propaga al catch externo del agente. Eso es deseable (no tragar el error), solo hay que asegurar que `currentStage` esté en `'crm-gate'` cuando se invoca `:594` para que A1 lo etiquete bien.

### D. Sub-loop RAG (`sub-loop/index.ts`) — explica el flip `generated`↔`no_match`

`runRagSubLoop` (`:267`). Eventos existentes: `subloop_nunca_decir_violation` `[EXISTE]` `:476`, `subloop_escalation_trigger_match` `[EXISTE]` `:501`, `subloop_completed` `[EXISTE]` `:339`/`:549`/`:620` (solo outcome). **Faltan los pasos intermedios:**

| Paso | file:line | Vars en scope | Evento nuevo sugerido |
|------|-----------|---------------|------------------------|
| Tooling completado (CALL 1) | tras `:286` `const tooling = toolingResult.output` + `:287` `extractStepData` | `tooling.topic_seleccionado`, `tooling.material_del_topic`, `toolingStep.kbHits` (cada `{topic, similarity}` — `index.ts:182-224`), `toolingStep.finishReason`, `toolingResult.latencyMs`, `toolingResult.attempts` | `subloop_tooling_completed` con `{ topicSelected, kbHits:[{topic,similarity}], shouldHandoff, finishReason, latencyMs }` — **ESTO explica qué topic recuperó + similarity** |
| Tooling → handoff inmediato (no topic) | `:311-366` | `tooling.should_handoff`, `tooling.handoff_reason`, `tooling.topic_seleccionado` | reusar/extender el `subloop_completed` `:339` con `handoffReason` + `kbHits` |
| Generation completada (CALL 2) | tras `:393` `const generation = generationResult.output` | `generation.responseConfidence`, `generation.binary`, `generation.confidenceRationale`, `generationResult.latencyMs` | `subloop_generation_completed` con `{ responseConfidence, binary, threshold: RESPONSE_CONFIDENCE_THRESHOLD, latencyMs }` — **ESTO explica por qué cae a handoff (`low_response_confidence` / `binary_backstop_*`)** |
| Threshold/binary handoff | `:418`, `:431` (`emitRagHandoff`) | `generation.responseConfidence`, reason string | reason ya viaja al `subloop_completed` del handoff (`:620`); añadir `responseConfidence` al payload |
| Compliance → nunca_decir | `:475-485` | `compliance.nuncaDecirViolation` | `subloop_nunca_decir_violation` `[EXISTE]` |
| Compliance → escalation | `:499-510` | `compliance.escalationTrigger` | `subloop_escalation_trigger_match` `[EXISTE]` |
| Success final | `:525-555` | `outcome.status='generated'`, `sourceTopic`, `responseConfidence` | `subloop_completed` `[EXISTE]` `:549` — añadir `responseConfidence`, `sourceTopic` ya está |
| Error por paso | `emitRagError` (`:283`, `:330`, `:539`) — ya existe helper | tipo de error (`tooling_call_error`, `generation_call_error`, `invariant_violation`) | revisar que `emitRagError` emita evento (leer su cuerpo en plan) |

**Insight clave:** todos los datos del flip YA están calculados en runtime (`toolingStep.kbHits`, `generation.responseConfidence`) — solo NO se emiten a la DB; van al `args.onDebug?.()` (sandbox-only). El plan los expone también vía `recordEvent`.

### E. restartIteration threading (D-03) — ver sección dedicada abajo

## restartIteration Threading

**Estado actual (confirmado):**
- `RestartContext.restartIteration: number` existe (`core/restart-context.ts:46`), arranca en 0 (`:81`), se incrementa en cada drain Path A/B (`drain.ts:56`, `:88`).
- Los eventos de drain YA llevan `restart_iteration` en el payload (`drain.ts:62`, `:68`, `:93`) — **modelo a replicar**.
- **`V4AgentInput` NO tiene `restartIteration`** (verificado, `types.ts:142-207`). El agente y el sub-loop NO pueden etiquetar sus eventos hoy.

**Cambios exactos requeridos:**

1. **Añadir campo opcional a `V4AgentInput`** (`somnio-v4/types.ts`, dentro de `interface V4AgentInput`, ~tras `:200`):
   ```typescript
   /**
    * Standalone v4-observability-completeness (D-03): iteración del restart loop
    * (RestartContext.restartIteration). Threadeada por el core para que TODOS los
    * eventos del pipeline (agente + sub-loop + gate) la lleven uniforme en el payload.
    * Optional/default 0 — backward-compat con sandbox/tests que arman V4AgentInput a mano.
    */
   restartIteration?: number
   ```

2. **Pasarla en el v4Input builder** (`core/turn-orchestrator.ts:158-189`, añadir una línea al objeto `v4Input`):
   ```typescript
   restartIteration: ctx.restartIteration,   // D-03
   ```

3. **Consumirla en el agente y sub-loop**: en `processUserMessage` leer `const restartIteration = input.restartIteration ?? 0` y añadirlo al payload de cada `recordEvent` (vía el helper `recordStage` que lo inyecta uniforme). Para el sub-loop: `runCrmGate`/`runSubLoop` reciben sus args desde el agente — pasar `restartIteration` en `RunSubLoopArgs.ctx` / `RunCrmGateArgs` (Claude's Discretion: o threadearlo por args, o leerlo de una var de closure del agente si los eventos del sub-loop se emiten dentro del agente; dado que el sub-loop los emite internamente, hay que añadirlo a sus args).

**Campo del payload:** usar `restart_iteration` (snake_case) para consistencia con los eventos de drain existentes (`drain.ts:62`).

## Don't Hand-Roll

| Problema | NO construir | Usar | Por qué |
|----------|--------------|------|---------|
| Emitir evento a DB | Un logger/cliente nuevo | `getCollector()?.recordEvent('pipeline_decision', label, payload, durationMs?)` | Ya existe, no-throw, batch-flush al final del turno (`flush.ts`). Regla 3: el collector ya abstrae el admin client. |
| Emisión dual DB+console | `console.log` ad-hoc por todos lados | Helper `recordStage()` modelo `emitLockEvent` (`interruption-system-v2/observability.ts:77`) | Patrón establecido, prefijo greppable en Vercel logs. |
| Redacción PII | Regex inline por cada call | `phoneSuffix`, `bodyTruncate(s, max=200)`, `emailRedact`, `idSuffix` de `shared/crm-mutation-tools/helpers.ts:33-56` | Probadas, contrato documentado en CLAUDE.md. |
| No-throw safety | try/catch manual alrededor de cada `recordEvent` | `recordEvent` YA es no-throw (`collector.ts:159`); solo el helper del spine necesita 1 try/catch global por el `console.log` | No duplicar defensa. |
| `restartIteration` counter | Un contador nuevo | `RestartContext.restartIteration` (ya existe, `restart-context.ts:46`) | Solo hay que propagarlo, no crearlo. |

**Key insight:** Esta fase NO crea ningún subsistema de logging. Es 100% reuso de `recordEvent` + propagación de un campo + reescritura de UNA línea (599) para no descartar el error real.

## Code Examples

### Helper del spine (nuevo, modelo `emitLockEvent`)

```typescript
// src/lib/agents/somnio-v4/observability.ts (NUEVO — Claude's Discretion sobre ubicación)
import { getCollector } from '@/lib/observability'
import { bodyTruncate } from '@/lib/agents/shared/crm-mutation-tools/helpers'

type V4Stage = 'comprehension' | 'guards' | 'sales-track' | 'crm-gate'
  | 'response-track' | 'sub-loop-slot' | 'send'

/** Dual-emission no-throw. restart_iteration uniforme (D-03). */
export function recordV4Event(
  label: string,
  payload: Record<string, unknown>,
  opts: { restartIteration?: number; durationMs?: number } = {},
): void {
  try {
    const enriched = { ...payload, restart_iteration: opts.restartIteration ?? 0 }
    getCollector()?.recordEvent('pipeline_decision', label, enriched, opts.durationMs)
    console.log(`[v4-spine] ${label}`, enriched)
  } catch {
    // Regla 6: un fallo de observabilidad NUNCA tumba un turno productivo.
  }
}
```

### Evento del error path (D-01) — emitido en el catch del agente (`somnio-v4-agent.ts:1014`)

```typescript
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error)
  const errStack = error instanceof Error && error.stack
    ? error.stack.split('\n').slice(0, 5).join(' | ')   // 3-5 frames (D-01)
    : undefined
  console.error('[SomnioV4] Error processing message:', errMsg, errStack ?? '')
  // NUEVO: emitir a observabilidad con el motivo REAL + stage + iteración.
  recordV4Event('engine_error', {
    stage: currentStage,                              // var local actualizada por stage
    errorMessage: bodyTruncate(errMsg, 200),          // PII-safe truncate
    stackFrames: errStack ?? null,
    agent: SOMNIO_V4_AGENT_ID,
  }, { restartIteration: input.restartIteration ?? 0 })
  return {
    success: false, messages: [],
    errorMessage: errStack ? `${errMsg} :: ${errStack}` : errMsg,  // sin cambio
    errorStage: currentStage,                          // NUEVO campo en V4AgentOutput (para el runner)
    // ...resto igual
  }
}
```

### Fix del runner (D-01 "una sola fuente") — `v4-production-runner.ts:597-600`

```typescript
// ANTES (descarta el motivo real):
error: output.success ? undefined : {
  code: 'V4_AGENT_ERROR',
  message: 'V4 agent processing failed',
},

// DESPUÉS (propaga motivo limpio, SIN stack, a chat + webhook error event):
error: output.success ? undefined : {
  code: 'V4_AGENT_ERROR',
  message: buildCleanErrorMessage(output),   // `V4_AGENT_ERROR @ ${output.errorStage}: ${cleanReason}`
},
// donde cleanReason = bodyTruncate(primeraLínea(output.errorMessage), ~150), sin el `:: stack`.
```

### Evento de tooling del sub-loop (explica el flip) — `sub-loop/index.ts:287`

```typescript
const tooling = toolingResult.output
const toolingStep = extractStepData(toolingResult.rawResult)
recordV4Event('subloop_tooling_completed', {
  agent: SOMNIO_V4_AGENT_ID,
  reason: args.reason,
  topicSelected: tooling.topic_seleccionado ?? null,
  shouldHandoff: tooling.should_handoff ?? false,
  kbHits: (toolingStep.kbHits ?? []).map(h => ({ topic: h.topic, similarity: h.similarity })),
  finishReason: toolingStep.finishReason ?? null,
  latencyMs: toolingResult.latencyMs,
}, { restartIteration: args.ctx.restartIteration ?? 0 })
```

### Evento del CRM gate — `crm-gate.ts:369` (antes del return)

```typescript
const crmResult = extractCrmResult(crmActions)
// ... writeCrmSnapshot ...
recordV4Event('crm_gate_completed', {
  fired: true,
  crmActionsCount: crmActions.length,
  tools: crmActions.map(a => a.tool),
  success: crmResult?.success ?? false,
  orderId: crmResult?.orderId ? idSuffix(crmResult.orderId) : null,
}, { restartIteration: args.restartIteration ?? 0 })
return { crmActions, crmResult }
```

## Common Pitfalls

### Pitfall 1: Romper el `LockEventLabel` union test
**Qué sale mal:** Pensar que añadir labels rompe el assert `toHaveLength(11)`.
**Realidad (verificado):** `observability.test.ts:62-66` asserta el largo del **union tipado `LockEventLabel`** (`interruption-system-v2/observability.ts:37-62`), NO el total de eventos emitidos. Los eventos nuevos usan `recordEvent` con `label: string` libre — **no tocan ese union**. Cero riesgo MIENTRAS no añadas labels a `LockEventLabel`.
**Cómo evitar:** Usar labels string directos (`recordV4Event('engine_error', ...)`), NO extender `LockEventLabel`.

### Pitfall 2: Romper asserts de conteo en `engine-v4-lock.test.ts`
**Qué sale mal:** Temer que los nuevos eventos rompan el array `emittedEvents` del test de paridad.
**Realidad (verificado):** TODOS los asserts son `emittedEvents.filter(e => e.label === 'X').toHaveLength(N)` (`engine-v4-lock.test.ts:307`, `:363`, `:386`, `:482`...) — cuentan labels ESPECÍFICOS, nunca el total. Eventos nuevos con labels distintos los ignoran. **Seguro.**
**Cómo evitar:** No reusar un label existente (`lock_released_normal`, `msg_aborted_path_a_combined`, etc.) para algo nuevo.

### Pitfall 3: `vi.mock` specifier sensitivity (Pitfall 8 heredado)
**Qué sale mal:** Importar el helper de observabilidad con un specifier que rompa el mock de un test de paridad.
**Realidad:** `engine-v4-lock.test.ts:54` mockea `'@/lib/observability'` (absoluto). Si el helper nuevo importa `getCollector` de `'@/lib/observability'` (igual que `emitLockEvent`), el mock lo intercepta correctamente. **No usar rutas relativas** al observability module en el helper nuevo.
**Cómo evitar:** `import { getCollector } from '@/lib/observability'` — specifier idéntico al existente.

### Pitfall 4: Behavior change accidental (Regla 6)
**Qué sale mal:** El fix de la línea 599 cambia el `code` o suprime el error → cambia comportamiento downstream (webhook-processor, handoff).
**Cómo evitar:** Mantener `code: 'V4_AGENT_ERROR'` IDÉNTICO (solo cambia `message`). El chat ya muestra `{code}: {message}` → el operador sigue viendo `V4_AGENT_ERROR` + ahora el motivo. NO tocar `success`/`messages`/`newMode`.

### Pitfall 5: Stack en el chat del operador
**Qué sale mal:** Propagar `output.errorMessage` crudo (que es `errMsg :: errStack`) al chat → el operador ve frames de stack.
**Cómo evitar:** En el fix de 599, extraer SOLO la primera línea / `errMsg` antes del `::`. El stack va a observabilidad (evento `engine_error`), NUNCA al `error.message` del chat. D-01 explícito.

### Pitfall 6: Payload con referencia circular en el console.log
**Qué sale mal:** `console.log(label, payload)` con un objeto circular (ej. pasar `toolingResult.rawResult` completo) tira en serialización.
**Cómo evitar:** El helper envuelve en try/catch global. Además: emitir SOLO datos planos al payload (topic strings, números, ids redactados), nunca objetos crudos del SDK.

## Test Patterns

**Patrón a seguir** (sin romper paridad):
- Para eventos del agente/gate/sub-loop: el test mockea `getCollector` con un spy y asserta `recordEvent` fue llamado con `('pipeline_decision', 'engine_error', expect.objectContaining({ stage, restart_iteration }))`. Modelo: `interruption-system-v2/__tests__/observability.test.ts:69-76` (`toHaveBeenCalledWith('pipeline_decision', label, payload)`).
- Para no romper `engine-v4-lock.test.ts`: NO añadir asserts de largo total; si se quiere verificar un evento nuevo en ese suite, usar `emittedEvents.filter(e => e.label === 'engine_error')`.
- `somnio-v4-agent.test.ts:96` ya mockea `getCollector` a no-op → los nuevos `recordEvent` en el agente son inofensivos ahí; para TESTEARLOS, crear un test nuevo que mockee `getCollector` con un spy (no reutilizar el no-op).

**Riesgo de label-count:** NINGUNO confirmado en los suites leídos. La única assertion de largo (`toHaveLength(11)`) es sobre el union tipado, intocable.

## Project Constraints (from CLAUDE.md)

- **Regla 6 (proteger agente en prod):** esta fase es ADITIVA. Cero behavior change. El agente corre idéntico; solo "ilumina". Cada `recordEvent`/helper envuelto para no tirar al pipeline. El fix de 599 mantiene `code` idéntico (solo mejora `message`).
- **Regla 3 (no createAdminClient fuera de domain):** el collector ya abstrae la persistencia (batch INSERT en `flush.ts`). El código de instrumentación NO toca Supabase directo — solo `recordEvent`.
- **Regla 0 (GSD completo, calidad sobre eficiencia):** D-02 eligió spine COMPLETO uniforme (no dirigido-a-fallas) por esta regla.
- **Regla 1 (push a Vercel tras cambios):** aplica al ejecutar.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** — Error path: emitir evento NUEVO con `errorMessage` REAL + stack truncado (3-5 frames) + stage donde reventó. Chat del operador: `error.message` específico+limpio (ej. `V4_AGENT_ERROR @ crm-gate: <motivo>`) SIN stack, vía fix de `v4-production-runner.ts:599`. PII redactada. Una sola fuente alimenta chat + observabilidad.
- **D-02** — Spine COMPLETO UNIFORME: `stage_entered`/`stage_completed`/`stage_errored` en TODO el pipeline (comprehension→guards→sales-track→CRM gate→response-track→slot resolver→send). CRM gate y RAG sub-loop (hoy mudos) cubiertos por spine + eventos propios. RAG sub-loop por paso: tooling+resultado, KB retrieval (topic+similarity+confidence), generation, compliance, error.
- **D-03** — Threadear `restartIteration` a TODOS los eventos del pipeline (campo uniforme `restart_iteration` en payload), no solo drain.
- **D-04** — Solo capa de datos (emitir a `agent_observability_events`). Lectura vía scripts read-only existentes. Debug panel sandbox = follow-up deferido.

### Claude's Discretion
- Nombres exactos de los labels nuevos (convención `category::label`, `pipeline_decision` como category default).
- Forma exacta del helper del spine (`recordStage(...)` envuelto try/catch no-throw).
- Número de frames del stack truncado (3-5).

### Deferred Ideas (OUT OF SCOPE)
- UI del sandbox debug panel para trace v4 en vivo.
- Fix de los bugs de fondo (sub-loop lento, handoff silencioso, zombie por turno de 70s).
- Mejorar el render del error al operador más allá del reason limpio (botón "ver detalle").

## Sources

### Primary (HIGH confidence — leído this session, file:line)
- `v4-production-runner.ts:545-602` (mapResult, línea 599 hardcodeada), `:100-130` (catch escape→V4_ENGINE_ERROR)
- `somnio-v4-agent.ts:130-135` (processMessage), `:405-510` (comprehension/guards), `:566-636` (sales/CRM-gate/response), `:678-700` (slot resolver), `:1014-1036` (catch externo errorMessage)
- `crm-gate.ts:301-396` (runCrmGate — confirmado mudo)
- `sub-loop/index.ts:182-226` (extractStepData kbHits), `:267-586` (runRagSubLoop completo, eventos existentes y faltantes)
- `core/turn-orchestrator.ts:140-228` (v4Input builder, drain discriminator), `:452` (send-loop), `:629-668` (error result mapping)
- `core/restart-context.ts:41-90` (RestartContext.restartIteration)
- `observability/collector.ts:153-171` (recordEvent firma+no-throw), `flush.ts:146-154` (DB columnas)
- `observability/context.ts:82-84` (getCollector null semantics)
- `observability/types.ts:62-109` (EventCategory, ObservabilityEvent)
- `interruption-system-v2/observability.ts:37-86` (emitLockEvent, LockEventLabel union)
- `shared/crm-mutation-tools/helpers.ts:33-121` (PII helpers + emit pattern)
- `types.ts:142-207` (V4AgentInput — sin restartIteration), `:209-232` (V4AgentOutput.errorMessage)
- `drain.ts:56-93` (restart_iteration en payload — modelo)
- Tests: `interruption-system-v2/__tests__/observability.test.ts:62-76` (toHaveLength sobre union), `somnio-v4/__tests__/engine-v4-lock.test.ts:53-57,307-487` (filter-based asserts), `somnio-v4-agent.test.ts:95-96` (getCollector no-op mock)
- Chat surfaces: `webhook-handler.ts:552`, `agent-production.ts:591`, `webhook-processor.ts:665-668,789-793`

## Metadata

**Confidence breakdown:**
- Error chain (ambas superficies): HIGH — mapeado end-to-end con file:line, confirmado el drop en 599.
- recordEvent contrato + DB schema: HIGH — leído collector + flush.
- Spine injection points: HIGH — cada stage localizado con su evento existente/faltante.
- restartIteration threading: HIGH — confirmado que V4AgentInput NO lo tiene; cambios exactos spelled out.
- Parity/test risk: HIGH — leídos los asserts reales; riesgo NULO confirmado (filter-based, union intocable).
- PII helper: HIGH — firma capturada.

**Research date:** 2026-06-13
**Valid until:** ~2026-07-13 (código interno estable; revalidar si se refactoriza el core turn-orchestrator o el runner mapResult).
