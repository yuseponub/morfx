---
phase: somnio-v4-crm-subloop
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/crm-grounding.ts
  - src/lib/agents/somnio-v4/config.ts
  - src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts
requirements: [D-08, D-09, D-10, D-11, D-21]
autonomous: true
must_haves:
  truths:
    - "Existe crm-grounding.ts que ensambla un CrmGrounding tipado fuerte (Vista A DB + Vista B ledger + mensaje crudo)"
    - "Vista A no depende SOLO de getActiveOrderByPhone: tiene fallback a getLastOrderByPhone/getOrdersByPhone cuando config_not_set (Pitfall 3)"
    - "El snapshot Vista A se lee/escribe en session_state bajo clave propia _v4 (NO _v3:*)"
    - "Stage UUID->name se resuelve via env-bridge fail-closed (CONFIRMADO + NUEVO PEDIDO)"
    - "pipelineId default Somnio se resuelve via env-bridge fail-closed getPipelineUuid() (mismo patron que los stages)"
    - "El grounding es lazy (funcion pura que el gate del Plan 06 invoca solo cuando prende)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/crm-grounding.ts"
      provides: "interface CrmGrounding + buildCrmGrounding() + read/write snapshot _v4 + stage name lookup"
      contains: "export interface CrmGrounding"
      min_lines: 80
    - path: "src/lib/agents/somnio-v4/config.ts"
      provides: "env-bridge getConfirmadoStageUuid/getNuevoPedidoStageUuid/getPipelineUuid + STAGE_NAME_BY_UUID map"
      contains: "SOMNIO_CONFIRMADO_STAGE_UUID"
    - path: "src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts"
      provides: "tests View A+B assembly + config_not_set fallback + snapshot roundtrip"
      contains: "config_not_set"
  key_links:
    - from: "crm-grounding.ts buildCrmGrounding"
      to: "crm-query-tools getActiveOrderByPhone/getLastOrderByPhone"
      via: "domain-backed read with fallback"
      pattern: "getActiveOrderByPhone|getLastOrderByPhone"
    - from: "crm-grounding.ts"
      to: "session_state _v4 snapshot"
      via: "V4_META_PREFIX key read/write"
      pattern: "_v4"
---

<objective>
Capa 1 — GROUNDING (D-08/D-09/D-10/D-11/D-21). Modulo NUEVO `crm-grounding.ts` que ensambla las
dos vistas de verdad que el sub-loop necesita para decidir crear-vs-actualizar:

- **Vista A (verdad DB):** pedido activo (id, stageId, stageName, createdAt, totalValue, items,
  shippingAddress/city/department) + contacto (id, phone, email/tags) via crm-query-tools. CON
  fallback robusto: si `getActiveOrderByPhone` retorna `config_not_set` (caso Somnio HOY — tablas
  `crm_query_tools_config`/`crm_query_tools_active_stages` vacias, Pitfall 3), caer a
  `getLastOrderByPhone`/`getOrdersByPhone` (que funcionan sin config) + razonar el stage via
  OrderDetail.stageId contra un set v4-local de stages pre-confirmacion.
- **Vista B (memoria del agente):** `crmActions[]` del ledger (`input.turnLedgerDims.crmActions`,
  persistido por standalone #1) + `accionesEjecutadas`. La discrepancia A↔B es senal (D-08).
- **Mensaje crudo (D-09):** el `userMessage` para que el LLM re-lea lo que la extraccion se perdio.

Mas la mecanica de snapshot (D-10, Claude's Discretion): leer/escribir la Vista A en
`session_state.datos_capturados` bajo clave propia `_v4` (NO `_v3:crm_context`/`_v3:active_order` —
CLAUDE.md D-21 prohibe a query-tools escribirlas). El grounding es LAZY (D-11): es una funcion pura
que el gate del Plan 06 llama SOLO cuando prende; nada de preload por-turno.

Purpose: dar al sub-loop una base de hechos confiable. Sin grounding solido, el LLM duplica pedidos
(clase Doralba) o decide a ciegas. Output: `CrmGrounding` tipado + `buildCrmGrounding()` + snapshot
helpers + env-bridge de stage UUIDs + env-bridge de pipelineId default Somnio.

NO ejecuta mutaciones (read-only). NO toca el gate (Plan 06). NO toca domain ni modulos compartidos
(solo CONSUME crm-query-tools). v4-specific -> Regla 6 satisfecha.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md

<interfaces>
<!-- Contratos verbatim. NO explorar el codebase. -->

crm-query-tools (src/lib/agents/shared/crm-query-tools/):
- `createCrmQueryTools({ workspaceId, invoker })` -> dict de tools (cada tool es un AI SDK `tool`
  con `.execute(input)`). Para uso programatico LLAMAR `.execute({...})`.
- `getActiveOrderByPhone.execute({ phone, pipelineId? })`: retorna `{ status: 'found'|'no_active_order'|'not_found'|'config_not_set'|'error', order?, ... }`. status='config_not_set' cuando tablas config vacias (crm-query-tools/orders.ts:303-310).
- `getLastOrderByPhone.execute({ phone })`: ultimo pedido del contacto (funciona SIN config).
- `getOrdersByPhone.execute({ phone, limit?, offset? })`: historial paginado (funciona SIN config).
- `getContactByPhone.execute({ phone })`: contacto + tags + custom_fields.
OrderDetail shape relevante (domain/orders.ts:1853+): { id, stageId (UUID, NO name), totalValue,
shippingAddress, shippingCity, shippingDepartment, items: [...], contactId, createdAt }.
NOTA Pitfall 4: OrderDetail NO trae stageName ni order_stage_history. Descope V1: id+stageId+items+
value+address+contact (la discrepancia A↔B da la senal de cambio externo sin historial completo).

Ledger Vista B (types.ts:374-392): `CrmActionRegistrada { tool, args, result:'success'|'failed'|
'cas_reject', code?, origen:'determinista'|'rag'|'timer', stageAtTime? }`; `TurnLedgerDims { atendido,
crmActions }`. Se accede via `input.turnLedgerDims?.crmActions ?? []`.

V4_META_PREFIX = '_v4:' (constants.ts:179). Las keys de snapshot deben usar este prefix, ej
`'_v4:crm_snapshot'`. Las keys viven en `session_state.datos_capturados` (Record<string,string> —
el snapshot se serializa con JSON.stringify).

Stage UUIDs verificados live (RESEARCH §Pattern 2, 2026-05-29, pipeline "Ventas Somnio Standard"):
- CONFIRMADO     = 4770a36e-5feb-4eec-a71c-75d54cb2797c
- NUEVO PEDIDO   = 6be952b0-0a95-4957-b5f7-62e8fd8eb815  (birth stage cascaron D-15)
- FALTA INFO     = 05c1f783-8d5a-492d-86c2-c660e8e23332
- FALTA CONFIRMAR= e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd
- NUEVO PAG WEB  = 42da9d61-6c00-4317-9fd9-2cec9113bd38  (EVITAR — dispara automation order.created)
Stages pre-confirmacion (set v4-local para Vista A fallback + whitelist Plan 06): { NUEVO PEDIDO,
FALTA INFO, FALTA CONFIRMAR }.

Pipeline default Somnio verificado live (RESEARCH §Pattern 2, 2026-05-29): "Ventas Somnio Standard"
id = a0ebcb1e-d79a-4588-a569-d2bcef23e6b8 (is_default=true). `createOrder` (crm-mutation-tools)
requiere un `pipelineId` UUID -> se pinea igual que los stages (env-bridge fail-closed).

Patron env-bridge (invocations.ts:64-66): `function getXxxStageUuid(): string | null { return
process.env.SOMNIO_XXX_STAGE_UUID ?? null }` — evaluacion lazy (no const top-level) para que tests
inyecten via process.env. fail-closed (null) si no esta seteado. EXCEPCION pipelineId: tiene fallback
verificado al UUID default Somnio (no fail-closed a null), porque el pipeline default es estable y
conocido (a diferencia de los stage UUIDs que se omiten si faltan).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Env-bridge de stage UUIDs + pipelineId + STAGE_NAME map en config.ts</name>
  <read_first>
    src/lib/agents/somnio-v4/config.ts (SOMNIO_WORKSPACE_ID, SOMNIO_V4_AGENT_ID — patron existente)
    src/lib/agents/somnio-v4/invocations.ts:55-66 (patron getCanceledStageUuid lazy + fail-closed)
    RESEARCH.md §Pattern 2 (UUIDs verificados live)
  </read_first>
  <action>
    En `src/lib/agents/somnio-v4/config.ts` agregar (aditivo, sin tocar lo existente):
    1. Funciones lazy env-bridge (espejar `getCanceledStageUuid` de invocations.ts:64-66):
       - `export function getConfirmadoStageUuid(): string | null { return process.env.SOMNIO_CONFIRMADO_STAGE_UUID ?? null }`
       - `export function getNuevoPedidoStageUuid(): string | null { return process.env.SOMNIO_NUEVO_PEDIDO_STAGE_UUID ?? null }`
       Comentar fail-closed: si null, el caller (Plan 06) OMITE la mutacion correspondiente + loggea
       observability (createOrder cascaron y moveOrderToStage CONFIRMADO no se disparan sin UUID).
    2. Env-bridge de pipelineId default Somnio (mismo patron lazy, PERO con fallback verificado — NO
       fail-closed a null porque el pipeline default es estable y conocido):
       - `export function getPipelineUuid(): string { return process.env.SOMNIO_VENTAS_PIPELINE_UUID ?? 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8' }`
       Comentar: pipeline "Ventas Somnio Standard" (is_default=true), live-verified 2026-05-29
       (RESEARCH §Pattern 2). `createOrder` requiere pipelineId UUID -> el gate del Plan 06 lo resuelve
       llamando a esta funcion (sin runtime pipelines_list round-trip). Override opcional via
       SOMNIO_VENTAS_PIPELINE_UUID en Vercel; el fallback hardcoded es el default verificado.
    3. `export const PRE_CONFIRMATION_STAGE_UUIDS: ReadonlySet<string> = new Set([` con los 3 UUIDs
       hardcoded verificados (NUEVO PEDIDO 6be952b0..., FALTA INFO 05c1f783..., FALTA CONFIRMAR
       e0cf8ecf...) `])`. Comentar: estos son los stages pre-confirmacion (origen whitelist Plan 06 +
       fallback Vista A). Hardcode aceptado per CONTEXT Deferred ("whitelist configurable = futuro").
    4. `export const STAGE_NAME_BY_UUID: Record<string,string> = {` mapeando los 5 UUIDs -> nombre
       legible (CONFIRMADO/NUEVO PEDIDO/FALTA INFO/FALTA CONFIRMAR/NUEVO PAG WEB) `}` — para resolver
       Pitfall 4 (OrderDetail no trae stageName) sin un domain read extra.
    Citar D-15/D-21 + RESEARCH §Pattern 2 en los comentarios.
  </action>
  <acceptance_criteria>
    - `grep -n "SOMNIO_CONFIRMADO_STAGE_UUID" src/lib/agents/somnio-v4/config.ts` retorna match dentro de una funcion lazy.
    - `grep -n "SOMNIO_NUEVO_PEDIDO_STAGE_UUID" src/lib/agents/somnio-v4/config.ts` retorna match.
    - `grep -n "export function getPipelineUuid" src/lib/agents/somnio-v4/config.ts` retorna match.
    - `grep -n "a0ebcb1e-d79a-4588-a569-d2bcef23e6b8" src/lib/agents/somnio-v4/config.ts` retorna match (UUID pipeline default verificado dentro de getPipelineUuid).
    - `grep -c "4770a36e-5feb-4eec-a71c-75d54cb2797c\|6be952b0-0a95-4957-b5f7-62e8fd8eb815\|05c1f783-8d5a-492d-86c2-c660e8e23332\|e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd" src/lib/agents/somnio-v4/config.ts` >= 4 (los UUIDs presentes en PRE_CONFIRMATION + STAGE_NAME).
    - `grep -n "PRE_CONFIRMATION_STAGE_UUIDS" src/lib/agents/somnio-v4/config.ts` retorna match.
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4/config.ts"` retorna VACIO.
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4/config.ts" || echo "ok"</automated>
  </verify>
  <done>Env-bridges fail-closed para CONFIRMADO + NUEVO PEDIDO; getPipelineUuid() con fallback default Somnio verificado; PRE_CONFIRMATION set + STAGE_NAME map con los UUIDs verificados; compila.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: crm-grounding.ts — CrmGrounding + buildCrmGrounding con fallback config_not_set</name>
  <files>src/lib/agents/somnio-v4/crm-grounding.ts, src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts</files>
  <read_first>
    src/lib/agents/shared/crm-query-tools/orders.ts (getActiveOrderByPhone :233-359, config_not_set :303-310; getLastOrderByPhone/getOrdersByPhone)
    src/lib/agents/somnio-v4/types.ts (CrmActionRegistrada :374-381, TurnLedgerDims :389-392)
    src/lib/agents/somnio-v4/config.ts (lo creado en Task 1: STAGE_NAME_BY_UUID, PRE_CONFIRMATION_STAGE_UUIDS)
    RESEARCH.md Pitfall 3 (config_not_set fallback) + Pitfall 4 (descope historial)
  </read_first>
  <behavior>
    - Test "View A found": mock getActiveOrderByPhone -> status:'found' con order -> grounding.activeOrder poblado con stageName resuelto via STAGE_NAME_BY_UUID; activeOrderQueryStatus='found'.
    - Test "config_not_set fallback": mock getActiveOrderByPhone -> status:'config_not_set' Y getLastOrderByPhone -> un pedido en stage NUEVO PEDIDO -> grounding usa el fallback, marca activeOrderQueryStatus='config_not_set' pero AUN expone el pedido si su stageId esta en PRE_CONFIRMATION_STAGE_UUIDS; si el ultimo pedido esta en CONFIRMADO/CANCELADO -> activeOrder=null (terminal).
    - Test "View B from ledger": grounding.ledgerCrmActions === input.turnLedgerDims.crmActions (passthrough).
    - Test "snapshot roundtrip": writeCrmSnapshot(datosCapturados, grounding) produce una key '_v4:crm_snapshot'; readCrmSnapshot(datosCapturados) la recupera; una sesion sin la key retorna null graceful.
    - Test "no _v3 keys": writeCrmSnapshot NUNCA escribe keys que empiecen con '_v3:'.
  </behavior>
  <action>
    CREAR `src/lib/agents/somnio-v4/crm-grounding.ts`:
    1. `export interface CrmGrounding {` con (shape de RESEARCH §Pattern 1, ajustado):
       `activeOrder: { id; stageId; stageName: string|null; createdAt; totalValue; shippingAddress;
       shippingCity; shippingDepartment; items: Array<{ sku; title; quantity; unitPrice }> } | null;
       contact: { id; phone: string|null; email: string|null } | null;
       activeOrderQueryStatus: 'found'|'no_active_order'|'not_found'|'config_not_set'|'error';
       ledgerCrmActions: CrmActionRegistrada[]; rawMessage: string }`.
    2. `export async function buildCrmGrounding(args: { workspaceId; phone: string|null; userMessage:
       string; ledgerCrmActions: CrmActionRegistrada[] }): Promise<CrmGrounding>`:
       - Instanciar `createCrmQueryTools({ workspaceId, invoker: SOMNIO_V4_AGENT_ID })`.
       - Si `phone` null -> retornar grounding con activeOrder=null, contact=null,
         activeOrderQueryStatus='not_found', ledgerCrmActions passthrough, rawMessage=userMessage.
       - Llamar `getActiveOrderByPhone.execute({ phone })`. Si status==='found' -> mapear order ->
         activeOrder con stageName=STAGE_NAME_BY_UUID[order.stageId] ?? null.
       - **Fallback (Pitfall 3):** si status==='config_not_set' (o 'error') -> llamar
         `getLastOrderByPhone.execute({ phone })`; si hay pedido Y su stageId ∈ PRE_CONFIRMATION_STAGE_UUIDS
         -> exponerlo como activeOrder (sigue siendo el pedido en curso). Si el ultimo pedido esta en
         stage terminal (no en PRE_CONFIRMATION) -> activeOrder=null. Conservar activeOrderQueryStatus
         con el status ORIGINAL ('config_not_set') como senal de observabilidad.
       - contact: derivar de la respuesta de getContactByPhone.execute({ phone }) (id, phone, email).
       - ledgerCrmActions: passthrough de args.ledgerCrmActions.
       - rawMessage: args.userMessage.
       Comentar el descope D-09/Pitfall 4 (no historial completo) y el fallback Pitfall 3.
    3. Snapshot helpers (D-10, Claude's Discretion):
       - `export const CRM_SNAPSHOT_KEY = \`${V4_META_PREFIX}crm_snapshot\`` (= '_v4:crm_snapshot').
       - `export function writeCrmSnapshot(datosCapturados: Record<string,string>, g: CrmGrounding):
         void` -> `datosCapturados[CRM_SNAPSHOT_KEY] = JSON.stringify({ activeOrder: g.activeOrder,
         contact: g.contact, activeOrderQueryStatus: g.activeOrderQueryStatus })`. NUNCA escribir keys
         `_v3:*`.
       - `export function readCrmSnapshot(datosCapturados: Record<string,string>): Pick<CrmGrounding,
         'activeOrder'|'contact'|'activeOrderQueryStatus'> | null` -> parsea CRM_SNAPSHOT_KEY con
         try/catch -> null graceful si ausente o JSON invalido.
    4. CREAR `src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts` con los 5 tests del bloque
       behavior. Mockear crm-query-tools con `vi.mock('@/lib/agents/shared/crm-query-tools', ...)`
       devolviendo un dict con `.execute` mockeable por test (espejar el patron de mocks de
       invocations.test.ts si aplica).
  </action>
  <acceptance_criteria>
    - `grep -n "export interface CrmGrounding" src/lib/agents/somnio-v4/crm-grounding.ts` retorna match.
    - `grep -n "export async function buildCrmGrounding" src/lib/agents/somnio-v4/crm-grounding.ts` retorna match.
    - `grep -E "getLastOrderByPhone|getOrdersByPhone" src/lib/agents/somnio-v4/crm-grounding.ts` retorna match (fallback presente).
    - `grep -n "'_v3:" src/lib/agents/somnio-v4/crm-grounding.ts` retorna VACIO (no escribe keys legacy).
    - `grep -n "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/crm-grounding.ts` retorna VACIO (Regla 3 — solo consume crm-query-tools).
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts` -> 5 tests verdes.
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>CrmGrounding tipado; buildCrmGrounding con fallback config_not_set; snapshot _v4 read/write graceful; cero createAdminClient; cero keys _v3; 5 tests verdes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| crm-query-tools → grounding | datos de DB cross-workspace si workspaceId mal propagado |
| snapshot _v4 ← DB read | datos cacheados pueden quedar stale (edicion humana — deferred) |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-grd-01 | Information Disclosure (cross-workspace) | buildCrmGrounding | mitigate | workspaceId del execution context (SOMNIO_WORKSPACE_ID), domain filtra por workspace (Regla 3 via crm-query-tools) |
| T-grd-02 | Tampering (snapshot stale -> decision errada) | _v4 snapshot | accept | re-query fresco antes de createOrder en Plan 06 (D-10); invalidacion por edicion humana DEFERRED (CONTEXT) |
| T-grd-03 | Spoofing (config vacia oculta pedido activo -> duplicado) | config_not_set | mitigate | fallback getLastOrderByPhone + PRE_CONFIRMATION set (Pitfall 3) |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts` verde.
- Greps Regla 3 (cero createAdminClient) + cero keys _v3 pasan.
- `npx tsc --noEmit` sin errores nuevos.
</verification>

<success_criteria>
crm-grounding.ts ensambla Vista A (con fallback config_not_set) + Vista B + mensaje crudo; snapshot
_v4 (no _v3); stage name via map; env-bridge fail-closed (stages) + getPipelineUuid() con fallback
default; cero mutacion; cero createAdminClient; tests verdes.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/02-SUMMARY.md`.
Commit: `feat(v4-crm-subloop): capa grounding (D-08/D-09/D-10/D-11/D-21) — Vista A+B + snapshot _v4 + env-bridge stages+pipeline`
</output>
