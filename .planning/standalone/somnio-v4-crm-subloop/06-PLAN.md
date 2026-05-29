---
phase: somnio-v4-crm-subloop
plan: 06
type: execute
wave: 3
depends_on: [01, 02, 03, 05]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/invocations.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
  - src/lib/agents/somnio-v4/crm-gate.ts
  - src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts
  - src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts
requirements: [D-01, D-02, D-03, D-05, D-06, D-07, D-12, D-13, D-15, D-16, D-17, D-18, D-20, D-26]
autonomous: true
must_haves:
  truths:
    - "Existe un gate CRM determinista amplio post-sales-track (accion in CRM-gate-set | newFields shipping | category='datos')"
    - "El gate NO hace early-return: response-track sigue corriendo el mismo turno (D-05 aditivo)"
    - "createOrder-cascaron se dispara temprano en datosCriticosJustCompleted && !hasPriorOrder con triple idempotencia (S1)"
    - "Guard createOrder: re-query fresco + idempotency key somnio-v4-createOrder-{sessionId} -> already_exists si ya hay pedido activo (D-12)"
    - "Guard moveOrderToStage: whitelist SOLO ->CONFIRMADO desde stages pre-confirmacion (D-13)"
    - "El pipelineId del createOrder-cascaron se resuelve via getPipelineUuid() de config.ts (sin runtime pipelines_list)"
    - "invocations.ts ELIMINADO + el bloque createOrder del runner ELIMINADO (D-06 big-bang)"
    - "Los consumidores de orderResult del runner (orderCreated/orderId/contactId/state_committed) se re-cablean al resultado del sub-loop (Pitfall 6)"
    - "El sub-loop CRM en sandbox corre con simulate:true (D-22)"
    - "Los 5 agentes no-v4 quedan byte-identicos (Regla 6)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/crm-gate.ts"
      provides: "crmGateFired predicate + runCrmGate orchestrator (grounding + sub-loop + guards + crmActions) + whitelist"
      contains: "export function crmGateFired"
      min_lines: 120
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "gate insertado reemplazando executeInvocations; inline createOrder decision removido; crmActions al ledger"
      contains: "crmGateFired"
    - path: "src/lib/agents/somnio-v4/invocations.ts"
      provides: "ELIMINADO (D-06)"
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "bloque createOrder removido; orderResult re-cableado al sub-loop result"
      contains: "orderCreated"
  key_links:
    - from: "somnio-v4-agent.ts post-sales-track"
      to: "crm-gate.ts runCrmGate"
      via: "replaces executeInvocations call site (:467)"
      pattern: "runCrmGate|crmGateFired"
    - from: "crm-gate.ts createOrder"
      to: "idempotency key + re-query"
      via: "D-12 anti-duplicate"
      pattern: "somnio-v4-createOrder"
    - from: "crm-gate.ts createOrder"
      to: "config.ts getPipelineUuid"
      via: "pipelineId resolution (no runtime pipelines_list)"
      pattern: "getPipelineUuid"
    - from: "sub-loop crmActions"
      to: "EngineOutput orderCreated/orderId/contactId"
      via: "Pitfall 6 rewire"
      pattern: "orderId"
---

<objective>
EL CORAZON del standalone: el gate CRM + el big-bang + las guards (D-01..D-18). Reemplaza el camino
determinista inline (`executeInvocations` + `createOrder` del runner) por el sub-loop grounded.

1. **Gate (D-01/D-02/D-03):** determinista PERO amplio (alto recall), post-sales-track (el unico
   punto con `salesResult.accion` + `changes.newFields` + `analysis.classification.category`):
   `accion ∈ CRM-gate-set` ∨ `newFields ∩ {direccion,ciudad,departamento,barrio,correo}` ∨
   `category==='datos'`. Filosofia D-03: gate preciso (recall) + sub-loop grounded que rescata la
   extraccion fallida (precision) + guards como red final.
2. **Aditivo, NO early-return (D-05):** cuando el gate prende, carga grounding (lazy, Plan 02), corre
   el sub-loop CRM (Plan 05, con simulate en sandbox), deriva crmActions, actualiza el snapshot _v4 —
   y CAE a response-track (que sigue enviando templates). NUNCA `return` desde el gate (a diferencia
   de las escalaciones que si early-return).
3. **createOrder-cascaron temprano (D-15/D-17/S1):** hook en `changes.datosCriticosJustCompleted &&
   !hasPriorOrder`. El cascaron nace en NUEVO PEDIDO (env-bridge Plan 02, NO NUEVO PAG WEB — evita la
   automation). Triple idempotencia: edge `datosCriticosJustCompleted` + `hasPriorOrder` (View B) +
   re-query DB fresco + idempotency key `somnio-v4-createOrder-{sessionId}` (D-12). El hint determinista
   al sub-loop incluye contactId (via resolveOrCreateContact Plan 03) + pipelineId (via getPipelineUuid
   del Plan 02) + stageId NUEVO PEDIDO.
   updateOrder enriquece con pack cuando `accion==='mostrar_confirmacion'` (D-17, items[] Plan 04).
4. **Guards (D-12/D-13):** createOrder already_exists (re-query + idempotency key); moveOrderToStage
   whitelist (SOLO ->CONFIRMADO desde PRE_CONFIRMATION_STAGE_UUIDS) + CAS existente del domain.
5. **Big-bang (D-06):** ELIMINAR `invocations.ts` (archivo entero) + el bloque createOrder del runner
   (`v4-production-runner.ts:1126-1143`) + la decision inline createOrder del agente (:571-603) + la
   rama CAS-reject que dependia de invOutcome (:484-569). Re-cablear los consumidores de `orderResult`
   (Pitfall 6): `state_committed.orderCreated`, `EngineOutput.orderCreated/orderId/contactId`.
6. **confirmar_orden -> moveOrderToStage(CONFIRMADO) (D-18):** cuando `accion==='confirmar_orden'`
   (Plan 01), el sub-loop (via hint) mueve el pedido activo a CONFIRMADO.

Purpose: consolidar TODO el CRM v4 en el sub-loop grounded, con las 3 capas de seguridad. Output: el
gate + guards + big-bang + tests. v4 DORMANT -> Regla 6 satisfecha; greps lo prueban.

NO toca los 5 agentes no-v4. NO usa feature flag (D-16). Rollback = no activar v4.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md
@.planning/standalone/somnio-v4-crm-subloop/02-PLAN.md
@.planning/standalone/somnio-v4-crm-subloop/05-PLAN.md

<interfaces>
<!-- Contratos verbatim. NO explorar. -->

Gate call-site (somnio-v4-agent.ts): hoy `:461-481` instancia invCtx + llama `executeInvocations(...)`,
luego `:483-549` rama CAS-reject (invOutcome.cancelarFailed?.cas -> runSubLoop), `:551-569` audit note,
`:571-603` decision inline createOrder (hasPriorOrder + isCreateOrder + comentarios), `:605-614`
resolveResponseTrack. El gate nuevo REEMPLAZA :461-603 (todo el bloque invocations+createOrder-decision);
response-track (:605+) se conserva intacto.

Contexto disponible en el gate (verificado :435-452): `salesResult.accion` (TipoAccion|undefined),
`changes` (StateChanges con `.newFields: string[]`, `.datosCriticosJustCompleted: boolean`),
`analysis.classification.category` (string), `mergedState` (AgentState con accionesEjecutadas, pack,
datos), `input.datosCapturados.telefono`, `input.sessionId`, `input.workspaceId`.

hasPriorOrder (verbatim :572-574): `mergedState.accionesEjecutadas.some((a) => typeof a !== 'string'
&& a.crmAction)`.

CRM-gate-set (D-02/D-15): NUEVO set (NO reusar CRM_ACTIONS) que incluye las acciones que disparan el
gate: `mostrar_confirmacion` (updateOrder pack D-17), `confirmar_orden` (move CONFIRMADO D-18), y
cualquier accion que indique mutacion. Definir `CRM_GATE_ACTIONS` en crm-gate.ts (NO en constants.ts
para mantener el set v4-gate aislado). SHIPPING_FIELDS = Set(['direccion','ciudad','departamento',
'barrio','correo']).

Runner createOrder block (v4-production-runner.ts:1126-1143): `if (output.shouldCreateOrder &&
output.orderData) { ... orderResult = await this.adapters.orders.createOrder({...}) }`. orderResult
se consume en :1085 (state_committed.orderCreated: !!orderResult?.success) y :1195-1197
(EngineOutput.orderCreated/orderId/contactId). D-06 ELIMINA el bloque; re-cablear los 2 consumidores.

V4AgentOutput hoy (types.ts:284-289): shouldCreateOrder:boolean + orderData?{...}. D-06 los obsoleta.
Reemplazar/aumentar con el resultado real del sub-loop CRM: agregar campos `crmResult?: { orderId?:
string; contactId?: string; success: boolean }` que el agente puebla desde los crmActions del sub-loop
(extrayendo el createOrder exitoso). El runner lee crmResult en vez de ejecutar createOrder.

Plan 02 exports: buildCrmGrounding, writeCrmSnapshot/readCrmSnapshot, getConfirmadoStageUuid,
getNuevoPedidoStageUuid, getPipelineUuid, PRE_CONFIRMATION_STAGE_UUIDS, STAGE_NAME_BY_UUID.
Plan 03 export: resolveOrCreateContact (domain/contacts.ts).
Plan 05 exports: runCrmSubLoop -> { outcome, crmActions }, deriveCrmActions.
Plan 01: TipoAccion confirmar_orden/recordar_*; CREATE_ORDER_ACTIONS sin recordar_*.

idempotency key pattern (invocations.ts:271 / RESEARCH Pitfall 7): `somnio-v4-createOrder-{sessionId}`
pasado al tool createOrder (inputSchema acepta idempotencyKey, crm-mutation-tools/orders.ts:97).

pipelineId: el gate resuelve el pipelineId del createOrder-cascaron llamando a `getPipelineUuid()` de
config.ts (Plan 02) — pipeline default Somnio "Ventas Somnio Standard"
(a0ebcb1e-d79a-4588-a569-d2bcef23e6b8, RESEARCH §Pattern 2), con fallback verificado + override
opcional via SOMNIO_VENTAS_PIPELINE_UUID. NO hace runtime `pipelines_list` round-trip (mismo patron
fail-safe que los stage env-bridges). Para el cascaron, el hint pasa pipelineId=getPipelineUuid() +
stageId=NUEVO PEDIDO al sub-loop.

INTERRUPTION-PARITY §4.4: sandbox CRM = simulate (D-22). engine-v4.ts hoy es no-op CRM (:570-575) —
debe pasar simulate:true al sub-loop. v4-production-runner pasa simulate:false (o ausente).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: crm-gate.ts — predicate + runCrmGate (grounding + sub-loop + guards + whitelist + crmActions)</name>
  <files>src/lib/agents/somnio-v4/crm-gate.ts, src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts, src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts</files>
  <read_first>
    .planning/standalone/somnio-v4-crm-subloop/02-PLAN.md (grounding + env-bridge + getPipelineUuid + PRE_CONFIRMATION)
    .planning/standalone/somnio-v4-crm-subloop/05-PLAN.md (runCrmSubLoop + simulate)
    src/lib/agents/somnio-v4/somnio-v4-agent.ts:435-603 (contexto del gate + hasPriorOrder)
    src/lib/agents/somnio-v4/constants.ts (PACK_PRICES_NUMERIC/PACK_PRODUCTS :154-168)
    RESEARCH.md §Code Examples (gate predicate) + Pitfall 3/5/7 + §S1/S2
  </read_first>
  <behavior>
    - Test crmGateFired "por accion": accion='mostrar_confirmacion' -> true; accion='confirmar_orden' -> true; accion='pedir_datos' -> false.
    - Test crmGateFired "por newFields": newFields incluye 'ciudad' -> true; newFields=['nombre'] -> false.
    - Test crmGateFired "por category": category='datos' -> true (red anti-falso-negativo D-02).
    - Test whitelist "->CONFIRMADO desde pre-confirmacion": isMoveAllowed(fromStage=NUEVO PEDIDO, toStage=CONFIRMADO) -> true; isMoveAllowed(FALTA INFO, CONFIRMADO) -> true.
    - Test whitelist "bloquea otros destinos": isMoveAllowed(NUEVO PEDIDO, NUEVO PAG WEB) -> false; isMoveAllowed(CONFIRMADO, anything) -> false (origen ya confirmado); isMoveAllowed(NUEVO PEDIDO, CANCELADO) -> false (D-07 cancelar fuera).
    - Test whitelist "fail-closed sin env CONFIRMADO": si getConfirmadoStageUuid()=null -> isMoveAllowed retorna false (no se mueve).
  </behavior>
  <action>
    CREAR `src/lib/agents/somnio-v4/crm-gate.ts`:
    1. `export const CRM_GATE_ACTIONS: ReadonlySet<string> = new Set(['mostrar_confirmacion',
       'confirmar_orden'])` (D-02/D-15/D-18 — set v4-gate aislado, NO reusar CRM_ACTIONS).
       `const SHIPPING_FIELDS = new Set(['direccion','ciudad','departamento','barrio','correo'])`.
    2. `export function crmGateFired(args: { accion?: string|null; newFields: string[]; category:
       string }): boolean` -> `(!!accion && CRM_GATE_ACTIONS.has(accion)) || newFields.some(f =>
       SHIPPING_FIELDS.has(f)) || category === 'datos'` (D-02 union amplia). Comentar D-03 filosofia.
    3. `export function isMoveAllowed(fromStageId: string|null, toStageId: string): boolean` (D-13
       whitelist) -> true SOLO si `toStageId === getConfirmadoStageUuid()` (no null) Y
       `fromStageId && PRE_CONFIRMATION_STAGE_UUIDS.has(fromStageId)`. fail-closed.
    4. `export async function runCrmGate(args: { workspaceId; sessionId; accion?: string|null; changes;
       mergedState; phone: string|null; userMessage; ledgerCrmActions; simulate?: boolean; lockHandle?;
       lockChannel?; lockIdentifier? }): Promise<{ crmActions: CrmActionRegistrada[]; crmResult?: {
       orderId?: string; contactId?: string; success: boolean } }>`:
       - Si !crmGateFired(...) -> retornar { crmActions: [] } (salida valida barata, D-02).
       - Cargar grounding LAZY: `const grounding = await buildCrmGrounding({ workspaceId, phone,
         userMessage, ledgerCrmActions })` (Plan 02).
       - Construir el HINT determinista (Claude's Discretion D-04) segun el estado:
         * Si `changes.datosCriticosJustCompleted && !hasPriorOrder(mergedState)` Y NO hay activeOrder
           en grounding -> hint createOrder-cascaron: resolver contactId via `resolveOrCreateContact`
           (Plan 03) con phone+datos; pipelineId via `getPipelineUuid()` de config.ts (Plan 02 — NO
           runtime pipelines_list); stageId=getNuevoPedidoStageUuid() (si null -> OMITIR createOrder +
           loggear observability fail-closed); pasar idempotencyKey `somnio-v4-createOrder-${sessionId}`.
           Hint: "crear pedido cascaron en NUEVO PEDIDO con contactId=<uuid> pipelineId=<uuid>
           stageId=<uuid> idempotencyKey=<...>". Items: si pack ya elegido (mergedState.pack), incluir
           items derivados de PACK_PRODUCTS/PACK_PRICES_NUMERIC.
         * Si `accion==='mostrar_confirmacion'` Y hay activeOrder -> hint updateOrder pack: "enriquecer
           pedido <activeOrder.id> con items <pack>" (D-17, items[] Plan 04).
         * Si `accion==='confirmar_orden'` Y hay activeOrder -> hint moveOrderToStage: validar
           isMoveAllowed(activeOrder.stageId, CONFIRMADO); si allowed hint "mover pedido <id> a
           CONFIRMADO"; si no -> NO mover + loggear.
         * Si solo newFields shipping/category datos sin pedido -> hint "rescatar extraccion: si falta
           direccion en el pedido activo, actualizarla; si no hay pedido y hay datos criticos, crear".
       - Correr `runCrmSubLoop({ reason:'crm_mutation', ctx: { workspaceId, conversationId: sessionId,
         sessionId, userMessage, recentMessages: [], grounding, crmHint: hint, simulate, lockHandle,
         lockChannel, lockIdentifier } })` (Plan 05).
       - crmActions = result.crmActions (origen:'rag'). Extraer crmResult: del primer createOrder
         exitoso tomar orderId/contactId; success = algun crmAction result==='success'.
       - Actualizar snapshot _v4: `writeCrmSnapshot(mergedState.datos /* o el record de datosCapturados
         */, freshGrounding)` tras mutacion exitosa (re-leer activeOrder del grounding o del crmResult).
       - Retornar { crmActions, crmResult }.
       Comentar D-01..D-18 + Pitfall 3/5/6/7. fail-closed en stage UUIDs ausentes.
    CREAR `crm-gate.test.ts` (predicate, 3 tests) + `crm-whitelist.test.ts` (whitelist, 4 tests).
  </action>
  <acceptance_criteria>
    - `grep -n "export function crmGateFired" src/lib/agents/somnio-v4/crm-gate.ts` retorna match.
    - `grep -n "export function isMoveAllowed" src/lib/agents/somnio-v4/crm-gate.ts` retorna match con check PRE_CONFIRMATION + getConfirmadoStageUuid.
    - `grep -n "somnio-v4-createOrder-" src/lib/agents/somnio-v4/crm-gate.ts` retorna match (idempotency key D-12).
    - `grep -n "getPipelineUuid" src/lib/agents/somnio-v4/crm-gate.ts` retorna match (pipelineId via config.ts, sin runtime pipelines_list).
    - `grep -n "pipelines_list" src/lib/agents/somnio-v4/crm-gate.ts` retorna VACIO (NO runtime pipeline round-trip).
    - `grep -n "getNuevoPedidoStageUuid\|NUEVO PEDIDO\|6be952b0" src/lib/agents/somnio-v4/crm-gate.ts` retorna match (birth stage; NUNCA NUEVO PAG WEB / 42da9d61).
    - `grep -n "42da9d61\|NUEVO PAG WEB" src/lib/agents/somnio-v4/crm-gate.ts` retorna VACIO (Pitfall 5 — nunca NUEVO PAG WEB).
    - `grep -n "resolveOrCreateContact" src/lib/agents/somnio-v4/crm-gate.ts` retorna match (D-24 contact resolution).
    - `grep -n "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/crm-gate.ts` retorna VACIO (Regla 3 — todo via grounding/sub-loop/domain helper).
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts` -> 7 tests verdes.
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>crmGateFired union amplia; isMoveAllowed whitelist fail-closed; runCrmGate carga grounding+hint+sub-loop+crmActions+snapshot; pipelineId via getPipelineUuid (sin pipelines_list); idempotency key; NUNCA NUEVO PAG WEB; cero createAdminClient; 7 tests verdes.</done>
</task>

<task type="auto">
  <name>Task 2: Insertar el gate en somnio-v4-agent + big-bang remove (invocations + inline createOrder)</name>
  <read_first>
    src/lib/agents/somnio-v4/somnio-v4-agent.ts:455-614 (executeInvocations call + CAS branch + inline createOrder + response-track)
    src/lib/agents/somnio-v4/crm-gate.ts (runCrmGate — Task 1)
    src/lib/agents/somnio-v4/invocations.ts (archivo entero — a ELIMINAR)
    src/lib/agents/somnio-v4/types.ts (V4AgentOutput shouldCreateOrder/orderData :284-289)
    RESEARCH.md D-06 + Pitfall 6 (consumidores de orderResult)
  </read_first>
  <action>
    1. En `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (user-message path processUserMessage):
       - REEMPLAZAR el bloque `:461-603` (invCtx + executeInvocations + rama CAS-reject invOutcome +
         audit note + decision inline createOrder) por:
         ```
         const crmGateOut = await runCrmGate({
           workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
           sessionId: input.sessionId ?? '',
           accion: salesResult.accion ?? null,
           changes,
           mergedState,
           phone: input.datosCapturados.telefono ?? null,
           userMessage: input.message,
           ledgerCrmActions: input.turnLedgerDims?.crmActions ?? [],
           simulate: input.simulate ?? false,   // sandbox pasa true (Task 4)
           lockHandle: input.lockHandle ?? null,
           lockChannel: input.lockChannel ?? null,
           lockIdentifier: input.lockIdentifier ?? null,
         })
         ```
         NO early-return (D-05). El bloque cae a `resolveResponseTrack` (:605+) sin cambios.
       - Construir el ledger del turno (donde hoy se hace el commitTurn del user path) usando
         `crmActions: crmGateOut.crmActions` (D-14 origen:'rag') en vez de buildCrmActionsFromAcciones
         para el user path. (El timer path R10 :951-961 conserva su buildCrmActionsFromAcciones origen
         'timer' — Plan 01 ya saco recordar_* de CREATE_ORDER_ACTIONS, asi que el timer ya no crea.)
       - REEMPLAZAR `shouldCreateOrder`/`orderData` en el V4AgentOutput retornado del user path por el
         nuevo `crmResult: crmGateOut.crmResult` (D-06 — el runner ya no crea). Mantener
         shouldCreateOrder:false en el output del user path (legacy field; el runner lo ignora tras Task 3).
       - ELIMINAR el import de `executeInvocations` y la decision inline createOrder (:571-603). Eliminar
         `buildCrmActionsFromAcciones` del user path si queda sin uso ahi (verificar que el timer path
         aun lo use; si no, podarlo de los imports tras Task 3).
    2. ELIMINAR el archivo `src/lib/agents/somnio-v4/invocations.ts` (D-06) — `git rm`. Eliminar su test
       `src/lib/agents/somnio-v4/__tests__/invocations.test.ts` tambien (cubre codigo borrado).
    3. En `src/lib/agents/somnio-v4/types.ts`: agregar a V4AgentOutput el campo `crmResult?: { orderId?:
       string; contactId?: string; success: boolean }` (Pitfall 6). Mantener shouldCreateOrder/orderData
       como deprecated (comentar // D-06: deprecated — el runner ya no crea; usar crmResult) para no
       romper el sandbox/timer path en esta iteracion; se podan al final si quedan sin lectura.
    Comentar cada cambio citando D-01/D-05/D-06/D-14.
  </action>
  <acceptance_criteria>
    - `test ! -f src/lib/agents/somnio-v4/invocations.ts` (archivo eliminado) — comando: `ls src/lib/agents/somnio-v4/invocations.ts 2>&1 | grep -q "No such file" && echo DELETED`.
    - `grep -rn "executeInvocations" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna VACIO (call site removido).
    - `grep -rn "from './invocations'\|from '../invocations'\|invocations'" src/lib/agents/somnio-v4/` retorna VACIO (sin imports colgantes).
    - `grep -n "runCrmGate" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna match (gate insertado).
    - `grep -n "crmResult" src/lib/agents/somnio-v4/types.ts` retorna match (Pitfall 6 field).
    - `grep -n "resolveResponseTrack" src/lib/agents/somnio-v4/somnio-v4-agent.ts` sigue presente DESPUES del gate (D-05 no early-return).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4/somnio-v4-agent.ts"` retorna VACIO.
  </acceptance_criteria>
  <verify>
    <automated>ls src/lib/agents/somnio-v4/invocations.ts 2>&1 | grep -q "No such" && echo DELETED; npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4-agent.ts" || echo "tsc ok"</automated>
  </verify>
  <done>Gate runCrmGate reemplaza executeInvocations; sin early-return (response-track corre); crmActions origen:'rag' al ledger; invocations.ts+test ELIMINADOS; crmResult en V4AgentOutput; compila.</done>
</task>

<task type="auto">
  <name>Task 3: Big-bang en el runner — remove createOrder block + rewire orderResult consumers (Pitfall 6)</name>
  <read_first>
    src/lib/agents/engine/v4-production-runner.ts:1080-1203 (createOrder block :1126-1143, state_committed :1085, EngineOutput :1184-1202)
    src/lib/agents/somnio-v4/types.ts (V4AgentOutput crmResult — Task 2)
    RESEARCH.md Pitfall 6 (orderResult consumers)
  </read_first>
  <action>
    En `src/lib/agents/engine/v4-production-runner.ts`:
    1. ELIMINAR el bloque `if (output.shouldCreateOrder && output.orderData) { ... orderResult = await
       this.adapters.orders.createOrder({...}) }` (:1126-1143). El sub-loop ya creo/mutos el pedido
       (Task 1/2). Eliminar la variable local `orderResult` y su `let` declaration si queda sin otro uso.
    2. RE-CABLEAR los 2 consumidores (Pitfall 6):
       - `:1085` `state_committed.orderCreated: !!orderResult?.success` -> `output.crmResult?.success ?? false`.
       - `:1195-1197` `orderCreated: orderResult?.success / orderId: orderResult?.orderId / contactId:
         orderResult?.contactId ?? input.contactId` -> `orderCreated: output.crmResult?.success,
         orderId: output.crmResult?.orderId, contactId: output.crmResult?.contactId ?? input.contactId`.
    3. Verificar que `this.adapters.orders.createOrder` ya NO se invoca en ninguna parte del runner v4
       para el user path (el timer path tampoco lo necesita — Plan 01 saco recordar_* de
       CREATE_ORDER_ACTIONS -> shouldCreateOrder=false en timer; el bloque eliminado cubria ambos).
       Si el adapter `orders` queda completamente sin uso en el v4 runner, dejarlo en la config de
       adapters (no romper el constructor) pero sin llamadas.
    Comentar D-06 + Pitfall 6 en cada cambio.
  </action>
  <acceptance_criteria>
    - `grep -n "adapters.orders.createOrder" src/lib/agents/engine/v4-production-runner.ts` retorna VACIO (bloque eliminado).
    - `grep -n "output.crmResult" src/lib/agents/engine/v4-production-runner.ts` retorna >=2 matches (state_committed + EngineOutput rewired).
    - `grep -n "orderResult" src/lib/agents/engine/v4-production-runner.ts` retorna VACIO o solo en comentarios (variable removida).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "v4-production-runner.ts"` retorna VACIO.
    - `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts` verde (interrupcion sin regresion).
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts 2>&1 | tail -15; npx tsc --noEmit -p tsconfig.json 2>&1 | grep "v4-production-runner.ts" || echo "tsc ok"</automated>
  </verify>
  <done>Bloque createOrder del runner eliminado; orderCreated/orderId/contactId + state_committed re-cableados a output.crmResult; tests de interrupcion verdes; compila.</done>
</task>

<task type="auto">
  <name>Task 4: Sandbox engine-v4 pasa simulate:true al gate CRM (D-22)</name>
  <read_first>
    src/lib/agents/somnio-v4/engine-v4.ts:555-594 (sandbox no-op CRM, shouldCreateOrder al debug)
    src/lib/agents/somnio-v4/types.ts (V4AgentInput — agregar simulate?)
    RESEARCH.md §S5 + INTERRUPTION-PARITY.md §4.4
  </read_first>
  <action>
    1. En `src/lib/agents/somnio-v4/types.ts` V4AgentInput (:142): agregar `simulate?: boolean`
       (opcional; default false). Comentar D-22: sandbox lo pasa true -> el gate CRM usa mutation-tools
       simuladas (Plan 05), cero DB write.
    2. En `src/lib/agents/somnio-v4/engine-v4.ts`: cuando el engine de sandbox llama al agente
       (processUserMessage), pasar `simulate: true` en el V4AgentInput. (Verificar el call site donde
       engine-v4 construye el input del agente; agregar el flag.) El runner de produccion NO pasa
       simulate (queda false) -> mutation-tools reales.
    3. Exponer en el debug payload de engine-v4 (:570-575) los crmActions del turno (del output) para
       que el debug panel los muestre (paridad: el sandbox simula la decision+registro sin DB). Si el
       output ya trae crmResult/crmActions, incluirlos en el orchestration debug.
    Comentar D-22 + §4.4 (DB vs memoria es diferencia permitida).
  </action>
  <acceptance_criteria>
    - `grep -n "simulate" src/lib/agents/somnio-v4/types.ts` retorna match en V4AgentInput.
    - `grep -n "simulate: true\|simulate:true" src/lib/agents/somnio-v4/engine-v4.ts` retorna match (sandbox).
    - `grep -n "adapters.orders.createOrder\|createCrmMutationTools\|createAdminClient" src/lib/agents/somnio-v4/engine-v4.ts` retorna VACIO (sandbox sigue sin tocar DB directamente).
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` verde (sandbox interrupcion sin regresion).
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts 2>&1 | tail -15</automated>
  </verify>
  <done>V4AgentInput.simulate opcional; sandbox pasa simulate:true; prod pasa false; crmActions expuestos al debug; sandbox sin DB; engine-v4-lock verde.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| client message → CRM mutation (via grounded LLM) | input no confiable cruza al sub-loop que ejecuta mutaciones |
| big-bang removal → runner consumers | borrar codigo puede dejar consumidores con datos null |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gate-01 | Tampering (pedido duplicado clase Doralba) | createOrder temprano | mitigate | triple idempotencia: edge datosCriticosJustCompleted + hasPriorOrder (View B) + re-query + idempotency key (D-10/D-12/S1) |
| T-gate-02 | Tampering (move a stage no permitido / cancelar) | moveOrderToStage | mitigate | whitelist isMoveAllowed SOLO ->CONFIRMADO desde pre-confirmacion + CAS domain (D-07/D-13) |
| T-gate-03 | Tampering (automation order.created dispara) | birth stage | mitigate | createOrder pin NUEVO PEDIDO (6be952b0); grep prueba NUNCA NUEVO PAG WEB (Pitfall 5) |
| T-gate-04 | Denial (interrupcion mid-mutation -> doble ejecucion) | sub-loop CKPT 3/4/5 | mitigate | idempotency key + CAS (Pitfall 7); restart loop re-usa misma key -> duplicate->success |
| T-gate-05 | Repudiation (orderCreated false aunque se creo) | Pitfall 6 rewire | mitigate | output.crmResult re-cableado a EngineOutput + state_committed (acceptance grep >=2) |
| T-gate-06 | Regresion 5 agentes no-v4 | big-bang | mitigate | greps Regla 6 (Plan 07); cambios solo en archivos somnio-v4 + v4-production-runner v4 path |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts` verde.
- `npx vitest run src/lib/agents/somnio-v4/ src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts` verde.
- invocations.ts ELIMINADO; sin imports colgantes; greps NUEVO PAG WEB / executeInvocations / adapters.orders.createOrder vacios.
- `npx tsc --noEmit` sin errores nuevos.
</verification>

<success_criteria>
Gate CRM amplio post-sales-track sin early-return; createOrder-cascaron temprano con triple
idempotencia + birth NUEVO PEDIDO + pipelineId via getPipelineUuid; updateOrder pack; confirmar_orden->CONFIRMADO con whitelist; CAS;
big-bang (invocations.ts + runner createOrder eliminados) con consumidores re-cableados a crmResult;
sandbox simulate; crmActions origen:'rag' al ledger; tests verdes; compila.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/06-SUMMARY.md`.
Commit: `feat(v4-crm-subloop): gate CRM + big-bang (D-01..D-18) — reemplaza executeInvocations/runner createOrder por sub-loop grounded + guards`
</output>
