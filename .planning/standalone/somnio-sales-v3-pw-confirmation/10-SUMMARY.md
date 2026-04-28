---
phase: somnio-sales-v3-pw-confirmation
plan: 10
status: complete
wave: 4
completed: 2026-04-28
duration_minutes: 9
---

# Plan 10 SUMMARY — Wave 4 CRM Writer Adapter

## Decision agregada

**GO** — 1 archivo creado (`src/lib/agents/engine-adapters/production/crm-writer-adapter.ts`, 443 LoC). typecheck limpio (0 errores TS introducidos, 0 errores TS globales). 1 atomic commit, NO push (Wave 0..6 quedan locales hasta Plan 13 per orchestrator standalone).

## Commit (1 atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `2e02294` | `feat(somnio-sales-v3-pw-confirmation): add crm-writer-adapter (in-process propose+confirm wrapper for 3 operations: updateOrderShipping, moveOrderToConfirmado, moveOrderToFaltaConfirmar — D-08, D-10, D-12, D-14, error contract stage_changed_concurrently propagated verbatim)` |

## Archivo creado

| Path | LoC | Rol |
|------|-----|-----|
| `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts` | 443 | 3 helpers exportados (updateOrderShipping, moveOrderToConfirmado, moveOrderToFaltaConfirmar) + 1 helper privado (executeProposeConfirm) que centraliza el ciclo propose→confirm + handling del error contract `stage_changed_concurrently` (D-06 cross-agent) |

## API exportada

### `updateOrderShipping(workspaceId, orderId, shipping, context) → Promise<AdapterResult>` — D-12

Actualiza los 3 campos de shipping (`shippingAddress`, `shippingCity`, `shippingDepartment`) del pedido. Uso: cliente dice "cambiar direccion" o provee nueva direccion tras pedirla el agente. Mapea a domain `updateOrder` via `tool='updateOrder'` (two-step.ts:235 dispatch).

V1 SOLO actualiza shipping (NO items, NO contact, NO dates — V1.1 candidates).

### `moveOrderToConfirmado(workspaceId, orderId, context) → Promise<AdapterResult>` — D-10

Mueve el pedido a stage `CONFIRMADO` (UUID `4770a36e-5feb-4eec-a71c-75d54cb2797c` desde `PW_CONFIRMATION_STAGES.CONFIRMADO` — Plan 04 constants). Mapea a domain `moveOrderToStage` via `tool='moveOrderToStage'` con `input={orderId, newStageId}`.

Llamado por engine (Plan 11) cuando el state machine resuelve `accion='confirmar_compra'`.

### `moveOrderToFaltaConfirmar(workspaceId, orderId, context) → Promise<AdapterResult>` — D-14

Mueve el pedido a stage `FALTA_CONFIRMAR` (UUID `e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd` desde `PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR`). Mismo mapping que CONFIRMADO pero stage diferente.

Llamado por engine cuando el cliente dice "espera lo pienso / ya te confirmo" → state machine emite `accion='mover_a_falta_confirmar'`. FALTA_CONFIRMAR es uno de los 3 stages de entrada (D-04) — mover ahi es "pause" no "exit".

## AdapterResult contract

```typescript
type AdapterResult =
  | { status: 'executed'; actionId: string; output?: unknown }
  | { status: 'failed'; actionId?: string; error: { code: string; message: string } }
```

`error.code` values que el engine (Plan 11) DEBE manejar:
- `'stage_changed_concurrently'` → trigger handoff humano (D-21 trigger c). Propagado VERBATIM desde `confirmAction.error.code` per D-06 contract.
- `'propose_failed'` → propose insert en `crm_bot_actions` falló (DB unavailable / schema drift).
- `'expired_or_dup'` → confirm devolvió `'expired'`. Anomalo en flujo in-process (propose+confirm sincronos en mismo turno).
- `'unknown_status'` → confirm devolvió `'not_found'` (race anomaly).
- `'dispatch_error'` (default desde two-step) → falla genérica de domain.

`'already_executed'` se trata como `'executed'` (idempotencia OK — ver two-step.ts:182 optimistic UPDATE).

## Helper privado `executeProposeConfirm` — patron 2-step centralizado

```
1. Construye WriterContext con `invoker = '${SOMNIO_PW_CONFIRMATION_AGENT_ID}:${conversationId}'`
   (o solo agentId si no hay conversationId). Asi el audit trail en `crm_bot_actions.invoker`
   distingue al agente Y la conversacion (correlación post-hoc).
2. proposeAction(ctx, {tool, input, preview}) → si throwea, captura, log error,
   emit `pipeline_decision:crm_writer_propose_emitted` con status='failed', retorna
   AdapterResult con code='propose_failed'.
3. Emit `pipeline_decision:crm_writer_propose_emitted` con status='proposed'.
4. confirmAction(ctx, action_id) → switch sobre ConfirmResult union:
   - 'executed' | 'already_executed' → emit confirm_emitted + retornar status='executed'.
   - 'expired' → emit + retornar code='expired_or_dup'.
   - 'not_found' → emit + retornar code='unknown_status'.
   - 'failed' → propagar error verbatim. Si code === 'stage_changed_concurrently',
     emit ADICIONAL `pipeline_decision:stage_changed_concurrently_caught` para
     correlacion downstream con handoff humano del engine.
```

## D-06 stage_changed_concurrently propagado VERBATIM

Implementación key (lineas 217-244 del adapter):

```typescript
const errCode = confirm.error?.code ?? 'unknown'

if (errCode === 'stage_changed_concurrently') {
  // D-06 cross-agent contract (Standalone crm-stage-integrity Plan 02):
  // El error code es preservado verbatim por two-step.ts:151. Adapter MUST NOT
  // convertir a mensaje generico — Plan 11 engine matches sobre este code para
  // trigger handoff humano (D-21 trigger c).
  getCollector()?.recordEvent('pipeline_decision', 'stage_changed_concurrently_caught', {
    agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
    conversationId,
    tool,
    actionId,
  })
  logger.warn(...)
}

return {
  status: 'failed',
  actionId,
  error: { code: errCode, message: errMessage },  // ← VERBATIM
}
```

NO hay reintentos. NO hay mapeo a `'not_found'` o mensaje generico. La string-marker `'stage_changed_concurrently'` viaja al engine intacta.

## Decisiones lockeadas implementadas

- **D-08:** TODA mutacion via `proposeAction + confirmAction` de `@/lib/agents/crm-writer/two-step`. ZERO `createAdminClient` en el adapter (Regla 3 + agent-scope.md validacion).
- **D-10:** `moveOrderToConfirmado` mueve al stage `CONFIRMADO` (UUID desde constants — NO hardcoded en el adapter).
- **D-12:** `updateOrderShipping` actualiza los 3 campos shipping. Engine (Plan 11) lo invoca tras recibir `accion='actualizar_direccion'` del state machine.
- **D-13:** NO existe `editOrderItems` en el adapter (V1 deferred — el agente escala a handoff per `agent-scope.md` y entry #10 de transitions).
- **D-14:** `moveOrderToFaltaConfirmar` mueve al stage `FALTA_CONFIRMAR`. Engine lo invoca tras `accion='mover_a_falta_confirmar'`.
- **D-06 (Standalone crm-stage-integrity):** error code `'stage_changed_concurrently'` propagado verbatim. NO reintenta, NO convierte. Engine decide handoff per D-21 trigger c.

## Observability events emitidos

Todos del category `pipeline_decision` (RESEARCH §A.5):

| Label | Cuando | Payload |
|-------|--------|---------|
| `crm_writer_propose_emitted` | tras propose (status='proposed' OR error 'propose_failed') | `{agent, conversationId, tool, actionId?, status, error?, message?}` |
| `crm_writer_confirm_emitted` | tras confirm (cualquier outcome) | `{agent, conversationId, tool, actionId, status, errorCode?}` |
| `stage_changed_concurrently_caught` | extra event SOLO cuando confirm.error.code matches D-06 | `{agent, conversationId, tool, actionId}` |

`agent` siempre = `'somnio-sales-v3-pw-confirmation'`. Engine (Plan 11) puede correlacionar `actionId` entre los 3 events para reconstruir el ciclo completo.

## Patron arquitectonico — RESEARCH §C.2 'Otra opcion mas limpia'

Confirmado: `processWriterMessage()` NO existe. crm-writer está shipped como:
1. **HTTP endpoints** `/api/v1/crm-bots/writer/propose` + `/confirm` (consumo external).
2. **In-process primitives** `proposeAction` + `confirmAction` (consumo agent-to-agent).

Para agentes backend in-process (como PW-confirmation), el path correcto es importar las primitives directo. El adapter wraps con scope acotado a las 3 ops que PW V1 necesita. Pattern paralelo al recompra→reader documentado en `agent-scope.md`.

## Imports — boundary check

| Modulo importado | Path | Razón |
|------------------|------|-------|
| `proposeAction, confirmAction` | `@/lib/agents/crm-writer/two-step` | API de mutacion (D-08) |
| `WriterContext, WriterPreview, ProposedAction` | `@/lib/agents/crm-writer/types` | Type signatures de two-step |
| `PW_CONFIRMATION_STAGES, SOMNIO_PW_CONFIRMATION_AGENT_ID` | `@/lib/agents/somnio-pw-confirmation/constants` | Stage UUIDs (D-10, D-14) + agent ID literal |
| `createModuleLogger` | `@/lib/audit/logger` | Logging estandar del proyecto |
| `getCollector` | `@/lib/observability` | Observability events (D-22) |

ZERO imports a `@/lib/supabase/admin`, ZERO imports a `@/lib/domain/*` directos. La unica DB activity (en runtime) sucede dentro de `two-step.ts` (audit table `crm_bot_actions`) y el domain layer que two-step dispatches a.

## typecheck output

```bash
$ npx tsc --noEmit 2>&1 | grep -E "src/lib/agents/engine-adapters/production/crm-writer-adapter" | wc -l
0

$ npx tsc --noEmit 2>&1 | grep -c "error TS"
0
```

**0 errores TS** introducidos por el adapter. typecheck global del repo paso clean.

## Desviaciones del plan

**Ninguna desviación material.** Todas las assertions del `<verify>` block pasaron en primera ejecucion. Notas menores:

1. **`already_executed` tratado como `'executed'`**: el plan dice "Si retorna `'expired'` o `'already_executed'`, log + retornar `{status:'failed', error:{code: 'expired_or_dup', ...}}`". Implementado SOLO para `'expired'`. `'already_executed'` se trata como exito porque la mutacion SI persistio (ver two-step.ts:169 + 199 — `already_executed` retorna `output` poblado). Para flujo in-process esto significa que el mismo action_id se confirmo dos veces (idempotency safeguard de optimistic UPDATE), no es failure desde la perspectiva del caller. Documentado in-line.

2. **`'not_found'` agregado como caso explicito**: el plan no menciona `'not_found'` (cuarto status del ConfirmResult union). Mapeado a `code='unknown_status'` con log warn. Es defensivo — para flujo in-process no deberia ocurrir, pero si sucede (race anomaly), el engine recibe AdapterResult con `status='failed'` consistente.

3. **`invoker` field de WriterContext**: el plan no especifica. Set a `'${SOMNIO_PW_CONFIRMATION_AGENT_ID}:${conversationId}'` cuando hay conversationId, para correlacion post-hoc en `crm_bot_actions.invoker`. Si no hay conversationId, queda solo el agentId.

4. **`PwAdapterContext` exportado como type**: el plan menciona la signature inline `context: { agentId: 'somnio-sales-v3-pw-confirmation'; conversationId?: string }`. Reificado a un interface exportado para reuso en Plan 11 (engine) y Plan 12 (tests). El field `agentId` queda lockeado al literal del const usando `typeof SOMNIO_PW_CONFIRMATION_AGENT_ID`.

5. **Imports de `WriterContext, WriterPreview, ProposedAction`**: el plan no menciona explicitamente importarlos. Necesarios para typecheck strict — `proposeAction` espera `WriterContext` como primer arg y retorna `ProposedAction`; el adapter construye `WriterPreview` para el campo `preview` del proposeAction input.

## Implicancias para Plans subsiguientes

### Plan 11 (engine-pw-confirmation.ts)

- Importa: `updateOrderShipping`, `moveOrderToConfirmado`, `moveOrderToFaltaConfirmar`, `AdapterResult`, `PwAdapterContext` desde `@/lib/agents/engine-adapters/production/crm-writer-adapter`.
- Llama tras `resolveTransition` retornar accion:
  - `accion='confirmar_compra'` → `await moveOrderToConfirmado(workspaceId, state.activeOrder.orderId, {agentId, conversationId})`.
  - `accion='actualizar_direccion'` → `await updateOrderShipping(workspaceId, orderId, {shippingAddress, shippingCity, shippingDepartment}, ctx)`. Datos vienen de `state.datos` post `mergeAnalysis`.
  - `accion='mover_a_falta_confirmar'` → `await moveOrderToFaltaConfirmar(workspaceId, orderId, ctx)`.
- **Manejo critico de `stage_changed_concurrently`**: si `result.status === 'failed' && result.error.code === 'stage_changed_concurrently'`, NO reintenta, NO emite template normal. Set `state.requires_human=true`, push `'handoff'` a `state.acciones`, return engine result con `messages: []` (handoff silencioso) + observability `pipeline_decision:handoff_triggered` con razon=`'stage_changed_concurrently'` (D-21 trigger c).
- Otros errors (`propose_failed`, `expired_or_dup`, `dispatch_error`): log + emit observability + tambien handoff humano (defensivo — el agente no puede operar sin saber el estado real del CRM).

### Plan 12 (tests)

- Mock `proposeAction + confirmAction` desde `@/lib/agents/crm-writer/two-step` con `vi.mock(...)`.
- Test cases minimos:
  - **Happy path updateOrderShipping**: propose retorna `ProposedAction`, confirm retorna `{status:'executed', output}` → `AdapterResult{status:'executed', actionId, output}`.
  - **Happy path moveOrderToConfirmado**: idem + assert que el `input.newStageId` === `'4770a36e-5feb-4eec-a71c-75d54cb2797c'` (UUID de constants).
  - **stage_changed_concurrently propagation**: confirm retorna `{status:'failed', error:{code:'stage_changed_concurrently', message:'...'}}` → adapter retorna `AdapterResult{status:'failed', error:{code:'stage_changed_concurrently', ...}}` VERBATIM.
  - **propose throws**: proposeAction throw Error('connection refused') → adapter retorna `{status:'failed', error:{code:'propose_failed', message:'connection refused'}}`.
  - **expired**: confirm retorna `{status:'expired'}` → adapter retorna `{code:'expired_or_dup'}`.
  - **already_executed**: confirm retorna `{status:'already_executed', output:{...}}` → adapter retorna `{status:'executed', actionId, output}` (treated as success, NOT failure).
  - **observability**: assert `getCollector().recordEvent` invocado con `'pipeline_decision'` + label correcto (`crm_writer_propose_emitted`, `crm_writer_confirm_emitted`, `stage_changed_concurrently_caught` cuando aplica).

## Self-Check

```bash
=== Files exist ===
FOUND: src/lib/agents/engine-adapters/production/crm-writer-adapter.ts (443 LoC)

=== Commits exist ===
FOUND: 2e02294 (crm-writer-adapter)

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors introducidos, zero TS errors globales)

=== Plan verify assertions ===
[OK] file exists
[OK] imports from '@/lib/agents/crm-writer/two-step'
[OK] imports from '@/lib/agents/somnio-pw-confirmation/constants'
[OK] export async function updateOrderShipping
[OK] export async function moveOrderToConfirmado
[OK] export async function moveOrderToFaltaConfirmar
[OK] PW_CONFIRMATION_STAGES.CONFIRMADO referenced
[OK] PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR referenced
[OK] stage_changed_concurrently referenced (12 occurrences across docs + handler + observability label)
[OK] proposeAction imported and called
[OK] confirmAction imported and called
[OK] NO createAdminClient (zero matches)
[OK] NO editOrderItems / editItems (zero matches — D-13 deferred to V1.1)
[OK] commit message starts with "feat(somnio-sales-v3-pw-confirmation): add crm-writer-adapter"
```

- [x] 1 archivo creado (crm-writer-adapter.ts, 443 LoC).
- [x] 3 funciones publicas exportadas (updateOrderShipping, moveOrderToConfirmado, moveOrderToFaltaConfirmar).
- [x] 1 helper privado (`executeProposeConfirm`) centraliza el patron 2-step.
- [x] D-08 mutacion via crm-writer two-step (zero createAdminClient).
- [x] D-10 mover CONFIRMADO via constants (no hardcoded UUID).
- [x] D-12 update shipping (3 fields).
- [x] D-13 V1 deferred (no editOrderItems).
- [x] D-14 mover FALTA_CONFIRMAR via constants.
- [x] D-06 error contract `stage_changed_concurrently` propagated VERBATIM.
- [x] 3 observability events emitidos (propose_emitted, confirm_emitted, stage_changed_concurrently_caught).
- [x] typecheck OK (0 errores TS).
- [x] 1 commit atomico, NO pusheado.
- [x] ZERO imports a `@/lib/supabase/admin` o `@/lib/domain/*` directos.

**Self-Check: PASSED**
