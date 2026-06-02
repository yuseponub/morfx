---
phase: somnio-sales-v3-pw-confirmation
plan: 07
type: execute
wave: 3
depends_on: [03, 04, 05, 06]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/response-track.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "response-track.ts exporta `resolveResponseTrack({salesAction, intent, state, workspaceId})` (clonar signature de recompra) + `resolveSalesActionTemplates(salesAction, state)` (helper interno expuesto para tests)"
    - "Usa `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3-pw-confirmation'` (constants.ts) cuando consulta TemplateManager"
    - "Cuando `intent in INFORMATIONAL_INTENTS`, dispatcha al template correspondiente (e.g. intent='precio' → emit 'precio' templates CORE+COMP+OPC). Mismo patron que recompra/v3."
    - "Cuando `salesAction='confirmar_compra'`, llama `lookupDeliveryZone(state.datos.ciudad)` (importado de `@/lib/agents/somnio-v3/delivery-zones`) + selecciona template `confirmacion_orden_same_day` vs `confirmacion_orden_transportadora` segun `zoneResult.zone` (RESEARCH §A.2 pattern). Pasa `extraContext.tiempo_estimado = formatDeliveryTime(zoneResult)` + `extraContext.items` + `extraContext.total`"
    - "Cuando `salesAction='pedir_datos_envio'`, emite template `pedir_datos_post_compra` con `extraContext.campos_faltantes = formatMissingFields(state)` (lista bullet de campos faltantes per shippingComplete result)"
    - "Cuando `salesAction='actualizar_direccion'`, emite template `confirmar_direccion_post_compra` con `extraContext.direccion_completa = [direccion, ciudad, departamento].filter(Boolean).join(', ')`"
    - "Cuando `salesAction='cancelar_con_agendar_pregunta'`, emite template `agendar_pregunta`"
    - "Cuando `salesAction='cancelar_definitivo'` O `salesAction='handoff'`, emite template `cancelado_handoff`"
    - "Cuando `salesAction='mover_a_falta_confirmar'`, emite template `claro_que_si_esperamos`"
    - "Cuando `salesAction='noop'` AND `intent='fallback'`, emite template `fallback`"
    - "Reusa `composeBlock` / `processTemplates` / `getGreeting` helpers de `@/lib/agents/somnio/template-manager` (NO duplicar logica)"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/response-track.ts"
      provides: "Selector de templates por (salesAction, intent, state) — invoca TemplateManager + composeBlock"
      contains: "resolveResponseTrack"
      min_lines: 200
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/response-track.ts"
      to: "src/lib/agents/somnio-v3/delivery-zones.ts"
      via: "importar lookupDeliveryZone + formatDeliveryTime (NO duplicar logica)"
      pattern: "from '@/lib/agents/somnio-v3/delivery-zones'"
    - from: "src/lib/agents/somnio-pw-confirmation/response-track.ts"
      to: "src/lib/agents/somnio/template-manager.ts"
      via: "TemplateManager.getTemplatesForIntents + composeBlock + processTemplates"
      pattern: "TemplateManager\\.getTemplatesForIntents"
    - from: "src/lib/agents/somnio-pw-confirmation/response-track.ts"
      to: "src/lib/agents/somnio-pw-confirmation/constants.ts (TEMPLATE_LOOKUP_AGENT_ID, ACTION_TEMPLATE_MAP, INFORMATIONAL_INTENTS)"
      via: "imports"
      pattern: "TEMPLATE_LOOKUP_AGENT_ID"
---

<objective>
Wave 3 — Crear `response-track.ts` (selector de templates). Mapea `(salesAction, intent, state)` a un set de templates a emitir, con extraContext (variables substituidas en runtime).

Purpose: D-15 lockea catalogo propio. D-16 lockea variacion municipal via delivery-zones (reusable de sales-v3). D-12 requiere `direccion_completa` con departamento. D-10 requiere selector de `confirmacion_orden_same_day` vs `_transportadora` por zona.

Output: 1 archivo `response-track.ts` (~200-300 lineas).

Dependencias: Plans 03, 04 (constants), 05 (MessageAnalysis), 06 (state.ts shippingComplete + helpers).

**REUSE de delivery-zones:** RESEARCH §A.2 confirma que `lookupDeliveryZone` y `formatDeliveryTime` son agnostic del agente — recompra ya los reusa. PW hace lo mismo (NO duplicar codigo).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-10, §D-12, §D-15, §D-16
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.2 (delivery-zones reuse pattern), §I.1 (template list)
@src/lib/agents/somnio-recompra/response-track.ts LINEAS COMPLETAS (~408 lineas — patron exacto a clonar)
@src/lib/agents/somnio-v3/response-track.ts LINEAS COMPLETAS (~404 lineas — referencia)
@src/lib/agents/somnio-v3/delivery-zones.ts LINEAS COMPLETAS (~134 lineas — funciones a IMPORTAR, no clonar)
@src/lib/agents/somnio/template-manager.ts (TemplateManager + composeBlock)
@src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04)
@src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06)
@src/lib/agents/somnio-pw-confirmation/types.ts (Plan 03)

<interfaces>
<!-- Signature canonical (clonar de recompra) -->
async function resolveResponseTrack(input: {
  salesAction: TipoAccion
  intent: string  // del comprehension
  state: AgentState
  workspaceId: string
}): Promise<{
  messages: ResponseMessage[]
  templateIdsSent: string[]
  intent_emitted: string | null
  emptyReason?: string
}>

<!-- delivery-zones (importable as-is) -->
async function lookupDeliveryZone(ciudad: string | null): Promise<DeliveryZoneResult>
function formatDeliveryTime(zone: DeliveryZoneResult): string
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `response-track.ts` con resolveResponseTrack + resolveSalesActionTemplates</name>
  <read_first>
    - src/lib/agents/somnio-recompra/response-track.ts LINEAS COMPLETAS (~408 lineas — clonar pattern verbatim, adaptar names)
    - src/lib/agents/somnio-v3/response-track.ts (referencia adicional para sales action branches: case 'crear_orden' → adaptar a case 'confirmar_compra')
    - src/lib/agents/somnio-v3/delivery-zones.ts (importar lookupDeliveryZone + formatDeliveryTime)
    - src/lib/agents/somnio/template-manager.ts (TemplateManager.getTemplatesForIntents)
    - src/lib/agents/somnio/block-composer.ts (composeBlock)
    - src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04 — TEMPLATE_LOOKUP_AGENT_ID, INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP)
    - src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06 — shippingComplete, AgentState)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/response-track.ts` clonando la estructura de `recompra/response-track.ts` con estos diferenciadores:

    1. **TEMPLATE_LOOKUP_AGENT_ID** importado de `./constants` (literal `'somnio-sales-v3-pw-confirmation'`).

    2. **`resolveResponseTrack({salesAction, intent, state, workspaceId})`**:
       - Si `intent in INFORMATIONAL_INTENTS`: dispatcha al template informacional correspondiente (`intent` directamente como template intent name). E.g. intent='precio' → `infoTemplateIntents.push('precio')`.
       - Para `intent='tiempo_entrega'`: llama `lookupDeliveryZone(state.datos.ciudad)` y selecciona `tiempo_entrega_${zone}` (e.g. `tiempo_entrega_same_day`). Pasa `extraContext.ciudad = state.datos.ciudad` + `extraContext.tiempo_estimado = formatDeliveryTime(zoneResult)`.
       - Switch sobre `salesAction`:
         - **`confirmar_compra`**: llamar `lookupDeliveryZone(state.datos.ciudad)`. Si `zoneResult.zone === 'same_day'` → template `'confirmacion_orden_same_day'`. Else → `'confirmacion_orden_transportadora'`. Pasar `extraContext.tiempo_estimado = formatDeliveryTime(zoneResult)` + `extraContext.items = formatItemsList(state.active_order)` + `extraContext.total = formatPrice(state.active_order.totalValue)`.
         - **`pedir_datos_envio`**: template `'pedir_datos_post_compra'`. ExtraContext `campos_faltantes = formatMissingFields(state)` (helper que retorna bullet list "- Nombre completo\n- Telefono\n- Direccion completa" basado en shippingComplete().missing).
         - **`actualizar_direccion`**: template `'confirmar_direccion_post_compra'`. ExtraContext `direccion_completa = [state.datos.direccion, state.datos.ciudad, state.datos.departamento].filter(Boolean).join(', ')`.
         - **`cancelar_con_agendar_pregunta`**: template `'agendar_pregunta'`. Sin extraContext.
         - **`cancelar_definitivo`** | **`handoff`**: template `'cancelado_handoff'`. Sin extraContext.
         - **`mover_a_falta_confirmar`**: template `'claro_que_si_esperamos'`. Sin extraContext.
         - **`noop`**: si `intent === 'fallback'`, template `'fallback'`. Else: si tiene template informacional pendiente del intent, lo emite. Else: empty (return `{messages: [], emptyReason: 'noop_with_no_intent'}`).
         - **`editar_items`**: template `'cancelado_handoff'` (V1 D-13 → handoff). Misma logica que `handoff`.

    3. **Helpers privados:**
       - `formatMissingFields(state: AgentState): string` — itera `shippingComplete(state).missing` y mapea cada campo a etiqueta humana ("nombre" → "- Nombre", "shippingAddress" → "- Direccion completa", "telefono" → "- Telefono", etc.).
       - `formatItemsList(activeOrder: ActiveOrderPayload | null): string` — formatea items como bullet list "- 2 × ELIXIR DEL SUEÑO" (cantidad × titulo).
       - `formatPrice(value: number): string` — formato colombiano "$77,900".

    4. **Template lookup**: usar `TemplateManager.getTemplatesForIntents({agentId: TEMPLATE_LOOKUP_AGENT_ID, workspaceId, intents, visitType: 'primera_vez'})` exactamente como recompra.

    5. **composeBlock + processTemplates**: usar exactamente como recompra (mismo orchestrator de mensajes finales).

    6. **resolveSalesActionTemplates exportada** (no `private async function` — `export async function`) para que Plan 12 tests la pueda invocar directamente.

    Commit: `feat(somnio-sales-v3-pw-confirmation): add response-track.ts (template selector — D-10 zone-based confirmation, D-12 direccion_completa con departamento, D-15 catalog lookup, D-16 delivery-zones reuse)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "export async function resolveResponseTrack" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "export async function resolveSalesActionTemplates\\|export function resolveSalesActionTemplates" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "TEMPLATE_LOOKUP_AGENT_ID" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "lookupDeliveryZone" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "formatDeliveryTime" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "from '@/lib/agents/somnio-v3/delivery-zones'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'confirmacion_orden_same_day'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'confirmacion_orden_transportadora'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'pedir_datos_post_compra'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'confirmar_direccion_post_compra'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'agendar_pregunta'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'claro_que_si_esperamos'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "'cancelado_handoff'" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "direccion_completa" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "state.datos.departamento" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "campos_faltantes" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>grep -q "INFORMATIONAL_INTENTS" src/lib/agents/somnio-pw-confirmation/response-track.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/response-track\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add response-track.ts"</automated>
  </verify>
  <acceptance_criteria>
    - response-track.ts existe con resolveResponseTrack + resolveSalesActionTemplates exportadas.
    - TEMPLATE_LOOKUP_AGENT_ID importado de constants (NO hardcoded).
    - lookupDeliveryZone + formatDeliveryTime importados de somnio-v3/delivery-zones (REUSE).
    - Switch cubre los 9 salesAction values del TipoAccion union.
    - direccion_completa concat incluye state.datos.departamento (D-12).
    - confirmar_compra branch invoca delivery-zones para zone-based template selection (D-10, D-16).
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - response-track.ts listo para Plan 11 (engine).
    - Plan 12 puede testear `resolveSalesActionTemplates` directo (export para testeability).
  </done>
</task>

</tasks>

<verification>
- 1 archivo creado.
- Reuse de delivery-zones (NO duplicacion).
- D-10, D-12, D-15, D-16 implementados.
- typecheck OK.
- 1 commit atomico, NO pusheado.
</verification>

<success_criteria>
- Plan 11 (engine) puede llamar `resolveResponseTrack(...)` y obtener mensajes a enviar.
- Plan 12 puede testear (mock TemplateManager).
- Variacion municipal funciona via delivery-zones reuse.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/07-SUMMARY.md` documenting:
- Commit hash.
- LoC.
- Lista de templates referenciados (verificar todos los 28 del Plan 02 estan cubiertos en algun branch).
- typecheck output.
</output>
</content>
</invoke>