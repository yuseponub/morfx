# Inngest 2-step BLOCKING pattern — Pre-load context before invoking agent

**Status:** SHIPPED — 2026-04-28 (somnio-sales-v3-pw-confirmation)
**First implementation:** `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` (539 LoC)
**Standalone:** `.planning/standalone/somnio-sales-v3-pw-confirmation/`

## What it solves

Algunos agentes necesitan **contexto del CRM cargado en sesión ANTES** de procesar el primer mensaje del cliente. El patrón existente de la mayoría de agentes (recompra, godentist, sales-v3) responde inmediato y deja que el siguiente turn del cliente vea el contexto via session enrichment async — pero eso falla cuando:

- El primer mensaje del cliente requiere decisión inmediata basada en estado del pedido (e.g. "¿confirmas el pedido?")
- El agente no puede degradar a una respuesta genérica sin perder la oportunidad de venta
- Polling agrega latencia + race conditions

**Solución:** dispatch Inngest 2-step donde step 1 carga el contexto SÍNCRONO (con timeout) y step 2 invoca al agente con la sesión ya populada — sin que el cliente perciba la latencia porque el webhook ya respondió 200 inmediato.

## Comparison: BLOCKING vs non-blocking

| Aspecto | Non-blocking (recompra pattern) | BLOCKING (PW-confirmation pattern) |
|---------|--------------------------------|-------------------------------------|
| Webhook response | 200 inmediato + dispatch fire-and-forget | 200 inmediato + dispatch (mismo) |
| Reader execution | Inngest function paralela; agente NO espera | Inngest step 1 antes que step 2 |
| Agent context | Vacío en primer turn; cargado para turns 2+ via session | Cargado para turn 1 (BLOCKING wait) |
| Degradation if reader fails | Agente responde sin contexto (saludo genérico) | Agente recibe `crm_context_status='error'` + emite `error_carga_pedido` |
| Latency vs. cliente | Mínima (webhook 200 < 100ms; agente responde en paralelo ~2-5s) | Misma percibida — el cliente ve respuesta cuando step 2 emite (5-30s post-webhook) pero NO percibe el split |
| Use case | Agente puede degradar gracefully al primer turn | Agente requiere contexto para tomar decisión correcta |

## When to use BLOCKING

- Agente toma decisión que depende del estado del pedido (confirmar/cancelar/cambiar dirección)
- Cliente espera respuesta dentro de 30s (no hay percepción de latencia anormal en WhatsApp business)
- Reader es estable (timeout 25s aceptable, sin retries que amplifiquen costos)
- El primer mensaje del cliente es disparador del flow completo (no hay opportunity cost de responder rápido con saludo genérico)

## When NOT to use BLOCKING (use non-blocking)

- Agente puede saludar y diferir la decisión a turns posteriores
- Reader es flaky (alto rate de timeouts) — non-blocking + degradation por turns es más resiliente
- Cliente espera respuesta en <5s (e.g. agente conversacional informal) — non-blocking + agente respondes con contexto vacío en turn 1

## Architecture

```
inbound webhook (POST /api/webhooks/whatsapp)
    ↓
webhook-handler.ts → webhook-processor.ts:processIncomingMessage
    ↓
router decide agent_id = 'somnio-sales-v3-pw-confirmation'
    ↓
markMessageProcessed(messageId)  ← anti retry-loop guarantee
    ↓
await inngest.send({ name: 'pw-confirmation/preload-and-invoke', data: {...} })
    ↓
respond 200 to webhook (cliente percibe entrega del mensaje)

──── Inngest function pw-confirmation-preload-and-invoke ────

step 1: 'call-reader-and-persist'
    ├── new AbortController + setTimeout 25s
    ├── processReaderMessage(buildPwReaderPrompt(contactId, conversationId), { signal, invoker, workspaceId })
    ├── extractActiveOrderJson(reader.toolCalls) → JSON estructurado del pedido
    ├── SessionManager.updateCapturedData(sessionId, {
    │     '_v3:crm_context': reader.text,
    │     '_v3:crm_context_status': 'success' | 'error' | 'timeout',
    │     '_v3:active_order': '{json}' | '{}'
    │   })
    └── recordPipelineDecision('crm_reader_completed' | '_failed' | '_timeout')

step 2: 'invoke-agent'
    ├── const adapters = createProductionAdapters({ ... })
    ├── const runner = new V3ProductionRunner({ agentModule: 'somnio-pw-confirmation', adapters })
    ├── await runner.processMessage({ sessionId, contactId, ... })
    │      └── el agente lee `_v3:crm_context` + `_v3:active_order` de sesión (ya populado por step 1)
    │      └── decide acción + emite respuesta
    └── recordPipelineDecision('agent_responded')
```

## Code structure

```
src/inngest/
├── events.ts                                       ← type def 'pw-confirmation/preload-and-invoke'
├── functions/
│   └── pw-confirmation-preload-and-invoke.ts       ← 2-step function (THIS pattern)
└── functions/recompra-preload-context.ts           ← non-blocking pattern (contrast)

src/app/api/inngest/route.ts                        ← register function in serve array

src/lib/agents/production/webhook-processor.ts      ← branch que dispatcha el event
```

## Key invariants

1. **`markMessageProcessed` ANTES del dispatch** — anti retry-loop. Si el dispatch falla, el message NO se reprocesa indefinidamente.
2. **Fail-closed dispatch** — si `inngest.send` lanza, el branch retorna error explícito. NO ejecuta el agente downstream con contexto inconsistente.
3. **AbortController inner** en step 1 — Inngest tiene timeout de step propio (~30s), pero el AbortController de 25s nos da margen para escribir status='timeout' en sesión + retornar gracefully.
4. **Retries: 1** — reader cuesta tokens, NO amplificar fallos. Si falla 1 retry, agente degrada con `error_carga_pedido`.
5. **Concurrency: 1 por sessionId** — serializa turns por sesión. Evita que segundo mensaje del cliente race contra primero.
6. **Step 2 instancia V3ProductionRunner por step run** — NO reusar runners entre steps. Inngest replays = lambda fresca.
7. **Observability events emitidos por step** — `crm_reader_dispatched` (webhook), `crm_reader_completed/failed/timeout` (step 1), `crm_context_used/missing_proceeding_blind` (step 2 / agente).

## Trade-offs documented

- **Latency 5-30s percibida**: aceptable post-purchase (cliente ya pagó, espera confirmación). NO usar para flows pre-purchase donde cada segundo cuenta.
- **Reader cost duplicado**: cada turn invoca reader. Mitigación: el agente SOLO debe disparar reader-blocking en stages específicos (agent_lifecycle_router decide). Para clientes recurrentes con pedido ya confirmado, usar un agente con catálogo informativo + non-blocking.
- **No retry agresivo**: reader puede fallar transient (Anthropic 529 overload). Si reader falla, agente degrada con `error_carga_pedido` y deja el cliente esperando que un humano lo retome — peor UX que retry. **TODO V1.1**: investigar retry exponencial con backoff capped a 3 attempts.

## Migrate from non-blocking to BLOCKING (checklist)

Si tienes un agente con patrón non-blocking y quieres migrarlo:

- [ ] Reescribir Inngest function de 1-step (call-reader) a 2-step (call-reader + invoke-agent)
- [ ] Mover dispatch de `inngest.send` desde el agente loop al webhook-processor branch
- [ ] Agregar `markMessageProcessed` en webhook-processor ANTES del dispatch (si no existía)
- [ ] Agregar event type definition en `src/inngest/events.ts`
- [ ] Agregar function al serve array en `src/app/api/inngest/route.ts`
- [ ] Eliminar polling de `_v3:crm_context_status='pending'` del agente (ya no aplica)
- [ ] Agregar template `error_carga_pedido` (o equivalente) al catálogo del agente
- [ ] Tests: mockear `processReaderMessage` con happy/timeout/error paths

## See also

- `docs/architecture/06-agent-lifecycle-router.md` — quien decide qué agente recibe el mensaje
- `.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md` §B.1 — pattern derivation
- `.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md` §B.2 — buildPwReaderPrompt locked verbatim
- `.planning/standalone/somnio-sales-v3-pw-confirmation/LEARNINGS.md` — lecciones del primer ejemplo en codebase
