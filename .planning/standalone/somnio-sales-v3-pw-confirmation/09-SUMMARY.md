---
phase: somnio-sales-v3-pw-confirmation
plan: 09
status: complete
wave: 4
completed: 2026-04-28
duration_minutes: 18
---

# Plan 09 SUMMARY — Wave 4 Inngest dispatcher 2-step BLOCKING (reader -> agent)

## Decision agregada

**GO** — 1 archivo nuevo + 2 archivos modificados, 1 commit atomico (Plan 09 es single-task). typecheck limpio (0 errores TS, npx tsc --noEmit exit=0). NO push (Plans 07-12 quedan locales hasta Plan 13 per orchestrator standalone).

Patron NUEVO en codebase: **2-step Inngest function BLOQUEANTE** (D-05). Diferencia clave vs `recompra-preload-context.ts` (precedente non-blocking): aqui el reader corre PRIMERO (step 1) y luego el agente arranca con contexto YA persistido en sesion (step 2) — sin polling, sin race entre dispatcher y agent runtime.

## Commit (1 atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `a92b917` | `feat(somnio-sales-v3-pw-confirmation): add Inngest function pw-confirmation-preload-and-invoke (2-step reader BLOCKING + invoke agent — D-05)` |

## Archivos creados / modificados

| Path | Status | LoC | Rol |
|------|--------|-----|-----|
| `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` | NEW | 539 | 2-step Inngest function: step 1 `call-reader-and-persist` (BLOQUEANTE, AbortController 25s) + step 2 `invoke-agent` (V3ProductionRunner + agentModule='somnio-pw-confirmation') + final `observability-flush` |
| `src/inngest/events.ts` | MOD | +45 | Type def `PwConfirmationPreloadAndInvokeEvents` con event name literal + AllAgentEvents union extendida |
| `src/app/api/inngest/route.ts` | MOD | +3 | Import + spread `...pwConfirmationPreloadAndInvokeFunctions` + JSDoc entry |

**Total commit: +587 / -2 lineas (3 archivos).**

## Diff de events.ts

Agregada nueva exportacion (verbatim signature lockeada por plan §interfaces):

```typescript
export type PwConfirmationPreloadAndInvokeEvents = {
  'pw-confirmation/preload-and-invoke': {
    data: {
      sessionId: string
      contactId: string
      conversationId: string
      workspaceId: string
      messageContent: string
      messageId: string
      messageTimestamp: string
      phone: string
      invoker: 'somnio-sales-v3-pw-confirmation'
    }
  }
}
```

Y extendida `AllAgentEvents`:
```typescript
export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents & RecompraPreloadEvents & PwConfirmationPreloadAndInvokeEvents
```

## Diff de route.ts

```diff
+import { pwConfirmationPreloadAndInvokeFunctions } from '@/inngest/functions/pw-confirmation-preload-and-invoke'

  functions: [
    ...
    ...recompraPreloadContextFunctions,
+    ...pwConfirmationPreloadAndInvokeFunctions,  // Standalone: somnio-sales-v3-pw-confirmation (D-05 BLOQUEANTE)
    taskOverdueCron,
```

JSDoc bloque "Functions served" tambien extendido con la nueva entry.

## Pattern 2-step (reader → agent) — implementado

```
┌──────────────────────────────────────────────────────────────────┐
│ Inngest function 'pw-confirmation-preload-and-invoke'            │
│   id: 'pw-confirmation-preload-and-invoke'                       │
│   trigger: { event: 'pw-confirmation/preload-and-invoke' }       │
│   retries: 1                                                     │
│   concurrency: [{ key: 'event.data.sessionId', limit: 1 }]       │
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1 — call-reader-and-persist                                 │
│   AbortController(25_000)                                        │
│   processReaderMessage({ workspaceId, invoker, messages, signal })│
│   ─ buildPwReaderPrompt(contactId, conversationId)               │
│   ─ extractActiveOrderJson(reader) → JSON estructurado           │
│   SessionManager.updateCapturedData(sessionId, {                 │
│     '_v3:crm_context': text,                                     │
│     '_v3:crm_context_status': 'ok' | 'empty' | 'error',          │
│     '_v3:active_order': activeOrderJson,                         │
│   })                                                             │
│   error path → escribe marker 'error' + '{}' antes de continuar  │
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2 — invoke-agent                                            │
│   pre-warm: import('@/lib/agents/somnio-pw-confirmation')        │
│   createProductionAdapters({ workspaceId, conversationId, ... }) │
│   new V3ProductionRunner(adapters, {                             │
│     workspaceId,                                                 │
│     agentModule: 'somnio-pw-confirmation',  // Plan 11 union     │
│   }).processMessage({ sessionId, message, ..., messageTimestamp })│
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│ FINAL — observability-flush                                      │
│   collector.flush() (after mergeFrom step1.__obs + step2.__obs)  │
└──────────────────────────────────────────────────────────────────┘
```

## extractActiveOrderJson — Open Q3 resuelto

Helper local del archivo Inngest function (NO exportado). Recorre `reader.toolCalls` (flat shape de processReaderMessage: `{ name, input, output }`) buscando el ULTIMO `ordersGet` call y serializa los campos esperados por `extractActiveOrder()` de state.ts (Plan 06).

Defensivo:
- Si reader no produjo `ordersGet` → retorna `'{}'`.
- Si shape no coincide / parse falla / acceso a propiedades throwa → log warn + retorna `'{}'`.
- NO throws — degradacion graceful (agente vera `_v3:active_order='{}'` y `extractActiveOrder()` retorna null, lo que en transitions table dispara handoff humano via D-21 trigger).

Campos serializados (mapping defensivo a multiples shape variants — snake_case + camelCase):
`orderId`, `stageId`, `stageName`, `pipelineId`, `totalValue`, `items[]` (titulo/cantidad/unitPrice), `shippingAddress`, `shippingCity`, `shippingDepartment`, `customerName`, `customerPhone`, `customerEmail`, `tags[]` (filtra strings o objetos `{name | tag_name}`).

Acepta tambien `reader.steps` como array (step.toolCalls + step.toolResults) por futurabilidad — la implementacion actual de processReaderMessage devuelve `steps: number` (count) pero el helper se mantiene defensivo si la shape evoluciona.

## Pitfalls mitigados (RESEARCH §J)

| # | Pitfall | Mitigacion |
|---|---------|------------|
| 3 | Cold lambda — agentRegistry no tiene config | `await import('@/lib/agents/somnio-pw-confirmation')` dentro del step 2 antes de instanciar el runner (side-effect import auto-registra el config en agentRegistry) — anti-B-001 LEARNING agent-lifecycle-router |
| 5 | AbortSignal propagation | `AbortController` local en step 1 con `setTimeout(abort, READER_TIMEOUT_MS)` + `clearTimeout` en finally; pasa `abortController.signal` a processReaderMessage NO el signal directo |
| 9 | Concurrency per-sessionId | `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]` — segundo mensaje del cliente en <5s queda deduplicado (Inngest espera al primero, NO arranca instancia paralela) |
| 10 | Idempotency via step.run | `step.run('call-reader-and-persist', ...)` y `step.run('invoke-agent', ...)` — Inngest serializa el return value y NO re-llama el callback en replay; segundo retry NO re-invoca reader ni agent |

## Observability merge pattern (RESEARCH §A.5 — Phase 42.1 canon)

3 collectors:
1. **outer collector** — instanciado al entrar a la function. Identidad `'crm-reader'` (clonado del precedente recompra; el dispatcher es funcionalmente "el reader que invoca al agente").
2. **step 1 stepCollector** — clonado dentro de step 1 con identidad `'crm-reader'`, wrapped con `runWithCollector(stepCollector, run)` para capturar AI calls del crm-reader. Return shape: `{ readerResult, __obs: { events, queries, aiCalls } }`.
3. **step 2 stepCollector** — clonado dentro de step 2 con identidad `AGENT_ID` (cast). Return shape: `{ agentResult, __obs }`.

Merge:
- Tras step 1: `outer.mergeFrom(step1.__obs)`.
- Tras step 2: `outer.mergeFrom(step2.__obs)`.
- Eventos `pipeline_decision:crm_reader_completed | crm_reader_failed` se emiten en outer scope (NO dentro de step.run, para evitar perderse al replay).
- Final: `step.run('observability-flush', () => collector.flush())` — flush en su propio step.run para idempotencia ante retry.

## Type-cast notes (typecheck-clean)

Dos casts intencionales documentados in-file por gaps de tipos pendientes en otros modules:

1. **`agentId: AGENT_ID as unknown as AgentId`** — el literal `'somnio-sales-v3-pw-confirmation'` aun no esta en la union `AgentId` de `src/lib/observability/types.ts`. Cast hasta que un Plan futuro extienda la union (no critico — el id se persiste como string en debug DB).
2. **`agentModule: AGENT_ID as unknown as 'somnio-v3'`** — el literal aun no esta en la union `EngineConfig.agentModule = 'somnio-v3' | 'godentist' | 'somnio-recompra'`. Plan 11 amplia la union AGREGANDO `'somnio-pw-confirmation'` Y agrega el branch `if (agentModule === 'somnio-pw-confirmation')` en `v3-production-runner.ts` para que el runner sepa que processMessage importar. Hasta que Plan 11 se complete, este Inngest function compila pero el runtime fallaria (NO hay branch — se caeria al else default `somnio-v3`). Aceptable: la function Inngest no se invoca en produccion hasta que webhook-processor.ts (Plan 11) dispatcha el evento, y eso solo pasa cuando routing rules tienen el agent_id activo (D-02 — sin regla = sin trafico = sin invocacion).

## Error path — graceful degradation (D-05)

Si reader throws/timeout (AbortController dispara), el catch:
1. Captura `err.message`, calcula `durationMs`.
2. Loggea error con sessionId/contactId.
3. Llama `sm.updateCapturedData(sessionId, { _v3:crm_context: '', _v3:crm_context_status: 'error', _v3:active_order: '{}' })` ANTES de retornar.
4. Si el write tambien falla, log adicional + swallow (last-resort).
5. Retorna `{ status: 'error', durationMs, error: msg.slice(0, 500) }`.

Step 2 procede igualmente. El agente (Plan 11) lee `_v3:crm_context_status='error'` y degrada via template `error_carga_pedido` (per CONTEXT.md D-05) — handoff humano implicito por NO tener pedido activo.

## Verification

```bash
$ cd /mnt/c/Users/Usuario/Proyectos/morfx-new/.claude/worktrees/agent-ae5c7a3c71b15d6e6
$ # 22/22 grep assertions PASS (ver bloque "Verification" del plan §verify):
$ #   id literal, retries 1, concurrency, event trigger, READER_TIMEOUT_MS,
$ #   step1/step2/observability-flush names, AbortController, _v3 keys,
$ #   extractActiveOrderJson, agentModule literal, completed/failed events,
$ #   mergeFrom, function array export, events.ts entry, route import + spread.
$ npx tsc --noEmit
$ echo "exit: $?"
exit: 0
```

**0 errores TS** introducidos por los 3 archivos. typecheck global del repo OK.

## Imports — boundary check

| Archivo | Imports |
|---------|---------|
| `pw-confirmation-preload-and-invoke.ts` | `../client` (inngest), `@/lib/audit/logger`, `@/lib/observability` (collector + helpers), `@/lib/observability/types` (AgentId type-only). Dynamic imports dentro de step.run callbacks: `@/lib/agents/crm-reader`, `@/lib/agents/session-manager`, `@/lib/agents/engine/v3-production-runner`, `@/lib/agents/engine-adapters/production`, `@/lib/agents/somnio-pw-confirmation`. |

Pattern dynamic-import-inside-step.run clonado de `recompra-preload-context.ts` (mejor cold-start performance + Inngest serialization safety).

## Desviaciones del plan

**Ninguna desviación material.** El plan especifica un esqueleto detallado que se siguio verbatim. Notas menores:

1. **`adapters` import**: el plan usa `import { adapters } from '@/lib/agents/engine-adapters/production'`. La realidad: ese modulo NO exporta una constante `adapters` — exporta `createProductionAdapters({...})`. Implementado segun el patron real (clonado de `webhook-processor.ts` recompra branch que tambien usa `createProductionAdapters`).

2. **`messageId` propagation a runner.processMessage**: el plan no lo incluye en el shape pasado a `processMessage` porque `EngineInput` no tiene campo `messageId`. Lo capturo en el return del step 2 (`agentResult.messageId`) para observability/audit pero NO se pasa al runner (no romperia nada — el runner lo deduce del session/conversation).

3. **`buildPwReaderPrompt` parametro `conversationId`**: aceptado en el signature como pidio el plan. Lo incluyo al final del prompt como referencia comentario `(conversationId de referencia: X)` — el reader puede ignorarlo, NO afecta su comportamiento (no hay tool que use conversationId).

4. **Outer collector identidad**: el plan template literal usa `agentId: AGENT_ID`. Cambie a `'crm-reader'` (del precedente recompra-preload-context.ts) porque (a) el dispatcher arranca con la lectura, (b) `'somnio-sales-v3-pw-confirmation'` no esta aun en la union AgentId — el cast aplica solo en step 2 stepCollector. Decision documentada in-file.

5. **`extractActiveOrderJson` helper**: shape mas defensiva que el sketch del plan (acepta multiples variants snake_case/camelCase + tags como string[] o object[] + chaining a steps[].toolCalls/toolResults por futurabilidad). El comportamiento minimum viable es identico (extraer ordersGet output → JSON.stringify del ActiveOrderPayload shape esperado por state.ts).

## Implicancias para Plans subsiguientes

### Plan 10 (crm-writer-adapter)
- No interactua directamente con esta function. El adapter es invocado desde `processMessage` del agente (Plan 11) para `updateOrder` shipping + `moveOrderToStage` CONFIRMADO/FALTA_CONFIRMAR.

### Plan 11 (engine + agent + webhook-processor + V3ProductionRunner branch)
- **CRITICO**: extender `EngineConfig.agentModule` union con `'somnio-pw-confirmation'` en `src/lib/agents/engine/types.ts`. Sin esto, el cast `as unknown as 'somnio-v3'` en step 2 hace que el runner caiga al else default `somnio-v3` y procese el mensaje con el agente equivocado.
- Agregar branch en `v3-production-runner.ts:151` (despues del `else if (this.config.agentModule === 'somnio-recompra')`):
  ```typescript
  } else if (this.config.agentModule === 'somnio-pw-confirmation') {
    const { processMessage } = await import('../somnio-pw-confirmation/somnio-pw-confirmation-agent')
    output = await processMessage(v3Input as any) as unknown as V3AgentOutput
  }
  ```
- Webhook-processor branch dispatcha el evento `pw-confirmation/preload-and-invoke` cuando `routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'` con `await inngest.send(...)` (NUNCA fire-and-forget per MEMORY.md). NO invoca runner inline — solo dispatch + responde 200.
- Considerar agregar `'somnio-sales-v3-pw-confirmation'` a la union `AgentId` en `src/lib/observability/types.ts` para limpiar los casts; la seccion `respondingAgentId` del collector tambien lo necesita.

### Plan 12 (tests)
- Test unitario del handler con mocks:
  - Mock `processReaderMessage` (3 casos: ok-with-active-order, empty, throws).
  - Mock `SessionManager.updateCapturedData` (assert called twice — 3 keys cada vez en step 1).
  - Mock `V3ProductionRunner.processMessage` (assert called once with correct sessionId/message).
  - Assert `extractActiveOrderJson` para 3 inputs (toolCalls vacio → '{}'; toolCalls con ordersGet output → JSON estructurado; toolCalls con shape malformado → '{}').
  - Assert observability events emitidos (`crm_reader_completed` o `crm_reader_failed` segun status).
  - Assert AbortController cancela el reader al llegar al timeout (use fake timers).

### Plan 13 (deploy + rollout)
- La function ya esta registrada en route.ts → al pushear, Inngest Cloud la registra.
- NO requiere SQL migration (esta function NO toca tablas nuevas — solo `session_state.datos_capturados` jsonb keys que ya existen del recompra precedent).
- Rollout 100% gated por routing rules (D-02): activacion = el usuario crea regla en `routing_rules` mencionando `'somnio-sales-v3-pw-confirmation'`. Sin regla = la function existe registrada en Inngest pero nadie la dispatcha = aislamiento total.

## Self-Check

```bash
=== Files exist (in worktree) ===
FOUND: src/inngest/functions/pw-confirmation-preload-and-invoke.ts (539 LoC)
FOUND: src/inngest/events.ts (modified, +45 lineas)
FOUND: src/app/api/inngest/route.ts (modified, +3 lineas)

=== Commit exists on worktree branch ===
FOUND: a92b917 (feat — add Inngest function pw-confirmation-preload-and-invoke...)
Branch: worktree-agent-ae5c7a3c71b15d6e6
Base: 068656c (Plan 07 SUMMARY commit)

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors)
```

- [x] 3 archivos editados/creados.
- [x] Function id literal `'pw-confirmation-preload-and-invoke'`.
- [x] Function trigger `{ event: 'pw-confirmation/preload-and-invoke' }`.
- [x] retries: 1, concurrency: [{ key: 'event.data.sessionId', limit: 1 }].
- [x] 2 step.run blocks: `'call-reader-and-persist'` + `'invoke-agent'` + final `'observability-flush'`.
- [x] Reader call con AbortController(25_000), clearTimeout en finally.
- [x] Persiste 3 keys en session via updateCapturedData: `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order`.
- [x] `extractActiveOrderJson` helper present (Open Q3 — text + JSON estructurado).
- [x] Error path escribe marker `error` + `{}` antes de proceder a step 2 (degradacion graceful).
- [x] Step 2 instancia V3ProductionRunner con `agentModule: 'somnio-pw-confirmation'` (cast typecheck-clean).
- [x] Pre-warm import de `'@/lib/agents/somnio-pw-confirmation'` dentro del step 2 (anti-B-001).
- [x] Observability merge pattern (outer collector + 2 stepCollectors + __obs returns + mergeFrom + final flush step).
- [x] Eventos: `pipeline_decision:crm_reader_completed` (status=ok/empty) o `pipeline_decision:crm_reader_failed` (status=error).
- [x] Function exportada como `pwConfirmationPreloadAndInvokeFunctions = [pwConfirmationPreloadAndInvoke]`.
- [x] Registrada en route.ts via spread.
- [x] Type def `PwConfirmationPreloadAndInvokeEvents` en events.ts + AllAgentEvents union extendida.
- [x] typecheck OK (0 errores TS).
- [x] 1 commit atomico (`a92b917`), NO pusheado.

**Self-Check: PASSED**
