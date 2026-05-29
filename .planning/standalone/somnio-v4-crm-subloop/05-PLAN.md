---
phase: somnio-v4-crm-subloop
plan: 05
type: execute
wave: 2
depends_on: [02, 04]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/crm-echo.ts
  - src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts
requirements: [D-04, D-14, D-22, D-23]
autonomous: true
must_haves:
  truths:
    - "El sub-loop crm_mutation recibe el CrmGrounding tipado via SubLoopContext"
    - "El orquestador deriva crmActions[] de rawResult.steps[].toolResults (ground-truth, NO auto-reporte del LLM) con origen:'rag'"
    - "MutationResult.status mapea a result: executed/duplicate->success, stage_changed_concurrently->cas_reject, else->failed"
    - "El crm_mutation prompt incluye el grounding + el hint determinista + reglas de guard"
    - "El sub-loop expone simulate por contexto: prod usa mutation-tools reales, sandbox inyecta simulados (no DB write)"
    - "runSubLoop devuelve los crmActions derivados al caller (para que el gate del Plan 06 los pase al ledger)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/crm-echo.ts"
      provides: "deriveCrmActions(rawResult) + MUTATION_TOOL_NAMES + simulated mutation-tools factory"
      contains: "export function deriveCrmActions"
    - path: "src/lib/agents/somnio-v4/sub-loop/tools.ts"
      provides: "SubLoopToolsContext += grounding? + simulate?; buildSubLoopTools usa tools reales o simulados"
      contains: "simulate"
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "runSubLoop devuelve crmActions derivados del rawResult"
      contains: "deriveCrmActions"
    - path: "src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts"
      provides: "tests deriveCrmActions mapeo de status + simulate no-op"
      contains: "deriveCrmActions"
  key_links:
    - from: "runLegacySubLoop rawResult.steps[].toolResults"
      to: "crmActions[] origen:'rag'"
      via: "deriveCrmActions ground-truth mapping"
      pattern: "deriveCrmActions"
    - from: "buildSubLoopTools simulate flag"
      to: "simulated vs real createCrmMutationTools"
      via: "context-scoped seam"
      pattern: "simulate"
---

<objective>
Capa 3 (parte sub-loop) + el contrato de salida CRM + paridad sandbox (D-04/D-14/D-22/D-23).

Resuelve el BLOCKER de Pitfall 1 / D-23: el sub-loop `crm_mutation` puede CALL las mutation-tools
(ya cableadas en tools.ts:52-62) pero el `LoopOutcomeSchema` NO tiene campos para reportar lo que
mutó, asi que el orquestador no tiene contrato para poblar `crmActions[]` (D-14). Solucion adoptada
(D-23, opcion B RECOMENDADA del RESEARCH): **el orquestador DERIVA `crmActions[]` de los tool-results
reales del AI SDK** (`rawResult.steps[].toolResults`) — ground-truth, NO auto-reporte del LLM (que
podria mentir). El parsing ya existe para el debug (index.ts:163-177); aqui se promueve a output.

Cuatro piezas:
1. **Threading del grounding (D-04, Claude's Discretion):** `SubLoopToolsContext`/`SubLoopContext`
   reciben un campo nuevo tipado fuerte `grounding?: CrmGrounding` (del Plan 02) + el `hint`
   determinista (que mutacion sugiere el state-machine).
2. **deriveCrmActions (D-14/D-23):** funcion pura `rawResult -> CrmActionRegistrada[]` con
   `origen:'rag'`, mapeando `MutationResult.status`.
3. **prompt crm_mutation (D-04):** inyectar el grounding + el hint + reglas de guard al prompt para
   que el LLM grounded decida+ejecute (createOrder cascaron / updateOrder pack / moveOrderToStage
   CONFIRMADO / addOrderNote / updateContact).
4. **simulate flag (D-22/S5):** seam en `buildSubLoopTools` — prod usa `createCrmMutationTools` real;
   sandbox inyecta mutation-tools simulados que retornan `MutationResult` sintetico SIN tocar DB. El
   sub-loop ve "exito", puebla crmActions (View B), pero cero escritura.

Purpose: hacer que el camino CRM del sub-loop EJECUTE y REPORTE de verdad, y que el sandbox lo
reproduzca sin DB. Output: deriveCrmActions + grounding threading + prompt + simulate seam.

NO inserta el gate (Plan 06). NO borra invocations.ts (Plan 06). Mantiene los paths RAG
(low_confidence/razonamiento_libre) y cas_reject sin cambios de comportamiento. v4-specific -> Regla 6 ok.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md
@.planning/standalone/somnio-v4-crm-subloop/02-PLAN.md

<interfaces>
<!-- Contratos verbatim. NO explorar. -->

SubLoopToolsContext (tools.ts:8-12): { workspaceId, conversationId, sessionId }.
SubLoopContext extends SubLoopToolsContext (index.ts:77-84): + userMessage, recentMessages,
lockHandle?, lockChannel?, lockIdentifier?.

buildSubLoopTools(reason, ctx) (tools.ts:32-71): instancia createCrmQueryTools + createCrmMutationTools
CADA llamada (no module cache). case 'crm_mutation' (:52-62) expone kb_search + getActiveOrderByPhone
+ createOrder/updateOrder/moveOrderToStage/addOrderNote/updateContact.

createCrmMutationTools({ workspaceId, invoker }) -> dict de AI SDK tools. Cada tool.execute(input)
retorna MutationResult: status ∈ 'executed'|'duplicate'|'resource_not_found'|'validation_error'|
'stage_changed_concurrently'|'error'; data? (OrderDetail re-hidratado); error?{ code, message, missing? }.

runLegacySubLoop (index.ts:724-914): `const tools = buildSubLoopTools(args.reason, args.ctx)`;
`subLoopResult = await runWithPurpose('subloop', () => generateText({ ..., tools, output:
Output.object({ schema: LoopOutcomeSchema }) }))`; `output = safeAccessOutput(subLoopResult, ...)`.
El rawResult (`subLoopResult`) tiene `.steps[].toolResults[]` con { toolName, input, output }.

extractStepData (index.ts:144-225) YA parsea steps[].toolResults para el debug — reusar el MISMO
patron de acceso (`steps.flatMap(s => s.toolResults ?? [])`).

deriveCrmActions mapeo (RESEARCH §"Deriving crmActions" code example):
- status 'executed' || 'duplicate' -> result 'success'
- status 'stage_changed_concurrently' -> result 'cas_reject'
- else -> result 'failed'
- tool = tr.toolName; args = tr.input ?? {}; code = tr.output?.error?.code; origen 'rag'.
Filtrar solo los toolName que son mutaciones (MUTATION_TOOL_NAMES = {createOrder, updateOrder,
moveOrderToStage, addOrderNote, updateContact}).

CrmActionRegistrada (types.ts:374-381): { tool, args, result:'success'|'failed'|'cas_reject', code?,
origen:'determinista'|'rag'|'timer', stageAtTime? }.

CrmGrounding (Plan 02, crm-grounding.ts): { activeOrder, contact, activeOrderQueryStatus,
ledgerCrmActions, rawMessage }.

INTERRUPTION-PARITY.md §4.4: "persistencia DB vs memoria" es diferencia PERMITIDA -> sandbox-no-op
de CRM es valido (D-22).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: crm-echo.ts — deriveCrmActions + MUTATION_TOOL_NAMES + simulated mutation-tools</name>
  <files>src/lib/agents/somnio-v4/sub-loop/crm-echo.ts, src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts</files>
  <read_first>
    src/lib/agents/somnio-v4/sub-loop/index.ts (extractStepData :144-225 — patron de acceso a steps)
    src/lib/agents/somnio-v4/types.ts (CrmActionRegistrada :374-381)
    src/lib/agents/shared/crm-mutation-tools/orders.ts (MutationResult status enum)
    RESEARCH.md Pitfall 1 opcion B + Code Examples "Deriving crmActions"
  </read_first>
  <behavior>
    - Test "executed -> success": rawResult con un toolResult { toolName:'createOrder', input:{...}, output:{ status:'executed', data:{...} } } -> deriveCrmActions retorna [{ tool:'createOrder', args:{...}, result:'success', origen:'rag' }].
    - Test "stage_changed_concurrently -> cas_reject": toolResult moveOrderToStage status 'stage_changed_concurrently' -> result 'cas_reject', code presente.
    - Test "validation_error/error/resource_not_found -> failed": cada uno -> result 'failed' con code.
    - Test "duplicate -> success": status 'duplicate' (idempotency hit) -> success.
    - Test "filtra no-mutaciones": un toolResult kb_search/getActiveOrderByPhone NO aparece en el output.
    - Test "multi-step": varios steps con varios toolResults -> flatMap correcto, orden preservado.
    - Test "simulate factory": createSimulatedMutationTools() retorna un dict cuyo createOrder.execute({...}) devuelve { status:'executed', data: <fake> } SIN llamar a domain/createAdminClient.
  </behavior>
  <action>
    CREAR `src/lib/agents/somnio-v4/sub-loop/crm-echo.ts`:
    1. `export const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set(['createOrder','updateOrder',
       'moveOrderToStage','addOrderNote','updateContact'])`.
    2. `export function deriveCrmActions(rawResult: any): CrmActionRegistrada[]` — espejar el patron de
       extractStepData (steps.flatMap(s => s.toolResults ?? [])); filtrar por MUTATION_TOOL_NAMES;
       mapear status segun el bloque interfaces; `args: tr.input ?? {}`; `code: tr.output?.error?.code`;
       `origen: 'rag' as const`; `stageAtTime`: si tr.output?.data?.stageId existe, incluirlo. Defensivo
       ante rawResult null/sin steps -> []. Comentar D-14/D-23 (ground-truth, no auto-reporte).
    3. `export function createSimulatedMutationTools(): Record<string, any>` (D-22/S5) — dict con las 5
       mutation-tools (createOrder/updateOrder/moveOrderToStage/addOrderNote/updateContact) como AI SDK
       `tool({ inputSchema: <misma forma que la real o z.record passthrough>, execute: async (input) =>
       ({ status:'executed', data: { id: 'sim-'+<rand>, ...input } }) })`. CERO import de domain/supabase.
       Comentar: simula MutationResult exito sin DB write; el sub-loop puebla crmActions igual (View B),
       el debug panel los muestra; paridad §4.4 (DB vs memoria). Marcar el data con un flag `_simulated:true`.
    CREAR `src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts` con los 7 tests del behavior.
  </action>
  <acceptance_criteria>
    - `grep -n "export function deriveCrmActions" src/lib/agents/somnio-v4/sub-loop/crm-echo.ts` retorna match.
    - `grep -n "origen: 'rag'" src/lib/agents/somnio-v4/sub-loop/crm-echo.ts` retorna match.
    - `grep -n "stage_changed_concurrently" src/lib/agents/somnio-v4/sub-loop/crm-echo.ts` retorna match en el mapeo a cas_reject.
    - `grep -n "createAdminClient\|@supabase/supabase-js\|@/lib/domain" src/lib/agents/somnio-v4/sub-loop/crm-echo.ts` retorna VACIO (simulated tools no tocan domain; Regla 3).
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts` -> 7 tests verdes.
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>deriveCrmActions mapea status->result ground-truth con origen:'rag'; filtra no-mutaciones; simulated tools no tocan domain; 7 tests verdes.</done>
</task>

<task type="auto">
  <name>Task 2: Threading grounding+hint+simulate en SubLoopToolsContext/SubLoopContext + buildSubLoopTools</name>
  <read_first>
    src/lib/agents/somnio-v4/sub-loop/tools.ts (SubLoopToolsContext :8-12, buildSubLoopTools :32-71)
    src/lib/agents/somnio-v4/sub-loop/index.ts (SubLoopContext :77-84)
    src/lib/agents/somnio-v4/crm-grounding.ts (CrmGrounding — del Plan 02)
    src/lib/agents/somnio-v4/sub-loop/crm-echo.ts (createSimulatedMutationTools — Task 1)
  </read_first>
  <action>
    1. En `src/lib/agents/somnio-v4/sub-loop/tools.ts`:
       - Extender `SubLoopToolsContext` (:8-12): agregar `grounding?: import('../crm-grounding').CrmGrounding | null`,
         `crmHint?: string | null` (el hint determinista — que mutacion sugiere el state-machine; Claude's
         Discretion D-04), y `simulate?: boolean` (D-22).
       - En `buildSubLoopTools` (:32-71): cuando `ctx.simulate === true`, usar las tools simuladas para
         el toolset CRM en vez de `createCrmMutationTools(...)`. Concretamente: `const mutationTools =
         ctx.simulate ? createSimulatedMutationTools() : createCrmMutationTools({ workspaceId, invoker })`.
         El case 'crm_mutation' y 'cas_reject' toman las mutation-tools de esa variable. Las query-tools
         (read-only) NO se simulan (no escriben). Comentar D-22 + paridad §4.4.
    2. En `src/lib/agents/somnio-v4/sub-loop/index.ts`: `SubLoopContext extends SubLoopToolsContext`
       ya hereda los nuevos campos opcionales (grounding/crmHint/simulate) — verificar que no se rompe
       nada. No requiere cambios adicionales en la interface (herencia).
    Mantener backward-compat: todos los campos nuevos son OPCIONALES; callers existentes (RAG paths,
    cas_reject desde el CAS branch) no los pasan y siguen igual.
  </action>
  <acceptance_criteria>
    - `grep -n "simulate" src/lib/agents/somnio-v4/sub-loop/tools.ts` retorna match en SubLoopToolsContext y en buildSubLoopTools.
    - `grep -n "createSimulatedMutationTools" src/lib/agents/somnio-v4/sub-loop/tools.ts` retorna match (rama simulate).
    - `grep -n "grounding\b\|crmHint" src/lib/agents/somnio-v4/sub-loop/tools.ts` retorna match (campos nuevos).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "somnio-v4/sub-loop/(tools|index)\.ts"` retorna VACIO.
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/escalation.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` verde (RAG paths sin regresion).
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "somnio-v4/sub-loop/(tools|index)\.ts" || echo "ok"</automated>
  </verify>
  <done>SubLoopToolsContext tiene grounding?/crmHint?/simulate?; buildSubLoopTools usa simulated tools cuando simulate; campos opcionales backward-compat; RAG paths sin regresion.</done>
</task>

<task type="auto">
  <name>Task 3: runSubLoop devuelve crmActions derivados + prompt crm_mutation con grounding+hint</name>
  <read_first>
    src/lib/agents/somnio-v4/sub-loop/index.ts (runLegacySubLoop :724-914, return de LoopOutcome; runSubLoop dispatcher)
    src/lib/agents/somnio-v4/sub-loop/prompt.ts (buildToolingPrompt crm_mutation :58-66)
    src/lib/agents/somnio-v4/sub-loop/crm-echo.ts (deriveCrmActions — Task 1)
    RESEARCH.md Pitfall 1 (read-back) + Pitfall 6 (flujo de vuelta al runner)
  </read_first>
  <action>
    1. CONTRATO DE SALIDA CRM. El sub-loop debe devolver al caller los crmActions derivados sin romper
       el tipo LoopOutcome existente. Mecanica recomendada (Claude's Discretion, minima invasion):
       - Definir `export interface SubLoopResult { outcome: LoopOutcome; crmActions: CrmActionRegistrada[] }`
         en index.ts (o reusar el onDebug si el gate del Plan 06 prefiere leerlo de ahi). Preferir el
         retorno explicito: cambiar la firma publica que el gate del Plan 06 invoca para `crm_mutation`
         de modo que reciba `{ outcome, crmActions }`. PARA NO romper los callers RAG/cas_reject
         existentes: NO cambiar la firma de `runSubLoop` global; en su lugar exportar una funcion
         dedicada `export async function runCrmSubLoop(args: RunSubLoopArgs): Promise<SubLoopResult>`
         que internamente corre el mismo `runLegacySubLoop` PERO captura el `subLoopResult` (rawResult)
         y llama `deriveCrmActions(rawResult)` antes de retornar `{ outcome, crmActions }`.
       - Para capturar el rawResult: dado que `runLegacySubLoop` ya tiene `subLoopResult` en scope,
         exponerlo. Opcion limpia: refactor menor de `runLegacySubLoop` para que retorne tambien el
         rawResult internamente a `runCrmSubLoop` (ej. variante interna `runLegacySubLoopRaw` que
         devuelve `{ outcome, rawResult }`, y `runLegacySubLoop` la envuelve devolviendo solo outcome
         para preservar a los callers actuales). Documentar el refactor.
       - `runCrmSubLoop` = wrapper que llama la variante raw, deriva crmActions, y retorna SubLoopResult.
       - IMPORTANTE Pitfall 6: el caller (gate Plan 06) usa estos crmActions para (a) poblar el ledger
         (D-14 origen:'rag') y (b) extraer orderId/contactId/success para el flujo de vuelta a EngineOutput.
    2. PROMPT (prompt.ts buildToolingPrompt case 'crm_mutation' :60-66): extender la firma para aceptar
       un `grounding?: CrmGrounding` + `crmHint?: string` (o construir el contexto inyectado por el
       caller). Inyectar al prompt:
       - Resumen del grounding: pedido activo (id/stage/items/valor/direccion) o "no hay pedido activo";
         contacto (id/telefono/email); las crmActions previas del ledger (View B); el mensaje crudo.
       - El hint determinista (crmHint): ej "El state-machine sugiere: crear pedido cascaron en NUEVO
         PEDIDO" / "enriquecer pedido <id> con pack <X>" / "mover pedido <id> a CONFIRMADO".
       - Reglas de guard explicitas: NO crear si ya existe un pedido activo (usar updateOrder); para
         createOrder usar contactId+pipelineId provistos en el hint; moveOrderToStage SOLO -> CONFIRMADO;
         si una mutacion retorna stage_changed_concurrently -> no reintentar, status='template'/'no_match'.
       Preservar el comportamiento de salida (status='template'|'no_match' para crm_mutation, D-12).
    Comentar D-04/D-14/D-23 + Pitfall 1/6.
  </action>
  <acceptance_criteria>
    - `grep -n "deriveCrmActions" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna match (orquestador deriva del rawResult).
    - `grep -n "runCrmSubLoop\|SubLoopResult" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna match (contrato de salida CRM).
    - `grep -E "grounding|crmHint|hint" src/lib/agents/somnio-v4/sub-loop/prompt.ts` retorna match (prompt inyecta grounding+hint).
    - `grep -n "CONFIRMADO\|moveOrderToStage" src/lib/agents/somnio-v4/sub-loop/prompt.ts` retorna match (regla whitelist en el prompt).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4/sub-loop"` retorna VACIO.
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/escalation.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` verde (paths RAG/legacy sin regresion).
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/escalation.test.ts 2>&1 | tail -15 && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4/sub-loop" || echo "tsc ok"</automated>
  </verify>
  <done>runCrmSubLoop retorna { outcome, crmActions } derivados ground-truth; prompt crm_mutation inyecta grounding+hint+reglas de guard; callers RAG/cas_reject sin regresion; compila.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| LLM tool calls → DB mutations | el LLM elige args; los tool schemas (Zod) + guards (Plan 06) validan |
| LLM self-report vs tool ground-truth | el LLM podria mentir sobre lo que ejecuto |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sub-01 | Repudiation (ledger no refleja la realidad) | crmActions echo | mitigate | deriveCrmActions usa rawResult.steps[].toolResults (ground-truth), NO el self-report del LLM (D-23) |
| T-sub-02 | Tampering (prompt injection -> mutacion no deseada) | crm_mutation prompt | mitigate | guards Plan 06 (idempotency/CAS/whitelist) como red final (D-03); reglas explicitas en el prompt |
| T-sub-03 | Paridad rota (sandbox escribe DB) | simulate seam | mitigate | createSimulatedMutationTools cero import domain (acceptance grep); §4.4 DB-vs-memoria permitido |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts` verde.
- `npx vitest run src/lib/agents/somnio-v4/__tests__/escalation.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` verde (sin regresion RAG/legacy).
- `npx tsc --noEmit` sin errores nuevos en sub-loop.
- Greps Regla 3 (crm-echo simulated sin domain) pasan.
</verification>

<success_criteria>
Sub-loop CRM ejecuta+reporta: deriveCrmActions ground-truth origen:'rag'; grounding+hint threadeados;
prompt con reglas de guard; simulate seam para sandbox (no DB); runCrmSubLoop devuelve crmActions al
caller; paths RAG/cas_reject sin regresion; compila.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/05-SUMMARY.md`.
Commit: `feat(v4-crm-subloop): contrato salida CRM sub-loop (D-04/D-14/D-23) + simulate sandbox (D-22) — deriveCrmActions ground-truth`
</output>
