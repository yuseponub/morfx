---
phase: v3-tiempo-entrega
plan: 03
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - src/lib/agents/somnio-v3/response-track.ts
autonomous: false

must_haves:
  truths:
    - "Customer asks 'cuanto se demora?' with city in state -> agent responds with zone-specific delivery time"
    - "Customer asks 'cuanto se demora?' without city -> agent asks for municipality"
    - "Customer asks 'cuanto tarda a Pasto?' -> city saved + zone lookup + response"
    - "Same-day zone respects cutoff hours with correct day logic"
    - "crear_orden action returns personalized templates: same_day without guide mention, transportadora with guide + time"
    - "Both confirmacion_orden templates always sent (CORE + COMPLEMENTARIA with 3s delay)"
  artifacts:
    - path: "src/lib/agents/somnio-v3/response-track.ts"
      provides: "Dynamic informational intent handling + personalized order confirmation"
      contains: "lookupDeliveryZone"
  key_links:
    - from: "response-track.ts"
      to: "delivery-zones.ts"
      via: "lookupDeliveryZone + formatDeliveryTime imports"
      pattern: "import.*lookupDeliveryZone"
    - from: "response-track.ts (informational section)"
      to: "agent_templates (tiempo_entrega_*)"
      via: "templateManager.getTemplatesForIntents"
      pattern: "tiempo_entrega"
    - from: "response-track.ts (crear_orden case)"
      to: "agent_templates (confirmacion_orden_*)"
      via: "resolveSalesActionTemplates returning zone-specific intent"
      pattern: "confirmacion_orden_same_day|confirmacion_orden_transportadora"
---

<objective>
Wire the delivery zone lookup into the response track for both informational tiempo_entrega responses and personalized confirmacion_orden templates.

Purpose: This is the final integration that makes the feature work end-to-end. The response track must dynamically select templates based on city + zone for both use cases.
Output: Updated response-track.ts with two new dynamic behaviors.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-tiempo-entrega/CONTEXT.md
@.planning/standalone/v3-tiempo-entrega/RESEARCH.md
@.planning/standalone/v3-tiempo-entrega/01-SUMMARY.md
@.planning/standalone/v3-tiempo-entrega/02-SUMMARY.md
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio-v3/delivery-zones.ts
@src/lib/agents/somnio-v3/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add dynamic informational intent handling for tiempo_entrega</name>
  <files>src/lib/agents/somnio-v3/response-track.ts</files>
  <action>
The response track currently handles informational intents statically -- it just loads templates matching the intent name. For `tiempo_entrega`, we need dynamic behavior: check if ciudad exists, look up zone, select the right template variant.

**Step 1: Import delivery zone functions**
```typescript
import { lookupDeliveryZone, formatDeliveryTime } from './delivery-zones'
```

**Step 2: Add a pre-processing step for dynamic informational intents**

In section 2 (Informational intent templates), BEFORE pushing to infoTemplateIntents, check if the intent is `tiempo_entrega` and resolve it to the correct template variant:

```typescript
// Section 2: Informational intent templates
const infoTemplateIntents: string[] = []
let infoExtraContext: Record<string, string> | undefined

if (intent && INFORMATIONAL_INTENTS.has(intent)) {
  if (intent === 'tiempo_entrega') {
    // Dynamic: resolve to zone-specific template
    const resolved = await resolveDeliveryTimeTemplates(state)
    infoTemplateIntents.push(resolved.templateIntent)
    infoExtraContext = resolved.extraContext
  } else {
    infoTemplateIntents.push(intent)
  }
}
if (secondaryIntent && INFORMATIONAL_INTENTS.has(secondaryIntent)) {
  if (secondaryIntent === 'tiempo_entrega' && !infoTemplateIntents.some(i => i.startsWith('tiempo_entrega'))) {
    const resolved = await resolveDeliveryTimeTemplates(state)
    infoTemplateIntents.push(resolved.templateIntent)
    infoExtraContext = { ...infoExtraContext, ...resolved.extraContext }
  } else if (secondaryIntent !== 'tiempo_entrega' && !infoTemplateIntents.includes(secondaryIntent)) {
    infoTemplateIntents.push(secondaryIntent)
  }
}
```

**Step 3: Merge infoExtraContext into variableContext**

In section 4 (Load and process templates), merge infoExtraContext:
```typescript
const variableContext: Record<string, string | undefined> = {
  ...Object.fromEntries(
    Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
  ),
  ...extraContext,
  ...infoExtraContext,
  pack: state.pack ?? undefined,
}
```

**Step 4: Create the resolver helper function** (add at bottom of file, above emptyResult):

```typescript
async function resolveDeliveryTimeTemplates(state: AgentState): Promise<{
  templateIntent: string
  extraContext?: Record<string, string>
}> {
  const ciudad = state.datos.ciudad
  if (!ciudad) {
    return { templateIntent: 'tiempo_entrega_sin_ciudad' }
  }

  const zoneResult = await lookupDeliveryZone(ciudad)
  const tiempoEstimado = formatDeliveryTime(zoneResult)

  return {
    templateIntent: `tiempo_entrega_${zoneResult.zone}`,
    extraContext: { ciudad, tiempo_estimado: tiempoEstimado },
  }
}
```

**Step 5: Make resolveSalesActionTemplates async for crear_orden personalization**

Change `resolveSalesActionTemplates` from sync to async:
```typescript
async function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): Promise<{ intents: string[]; extraContext?: Record<string, string> }>
```

Update the `crear_orden` case to look up delivery zone:
```typescript
case 'crear_orden': {
  const ciudad = state.datos.ciudad
  if (ciudad) {
    const zoneResult = await lookupDeliveryZone(ciudad)
    const tiempoEstimado = formatDeliveryTime(zoneResult)
    const templateIntent = zoneResult.zone === 'same_day'
      ? 'confirmacion_orden_same_day'
      : 'confirmacion_orden_transportadora'
    return {
      intents: [templateIntent],
      extraContext: {
        ...buildResumenContext(state),
        tiempo_estimado: tiempoEstimado,
      },
    }
  }
  // Fallback if no city (shouldn't happen for crear_orden, but defensive)
  return {
    intents: ['confirmacion_orden_transportadora'],
    extraContext: {
      ...buildResumenContext(state),
      tiempo_estimado: 'en 2-4 dias habiles',
    },
  }
}
```

**Step 6: Update callers of resolveSalesActionTemplates to await**

In section 1 (Sales action templates), the two calls need `await`:
```typescript
if (salesAction) {
  const resolved = await resolveSalesActionTemplates(salesAction, state)
  ...
}
if (secondarySalesAction) {
  const secondaryResolved = await resolveSalesActionTemplates(secondarySalesAction, state)
  ...
}
```

This is safe because `resolveResponseTrack` is already async.

IMPORTANT: Do NOT change the response track output structure. Only the template intent names and extraContext change. The block composer, message building, and return structure remain identical.
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `grep 'lookupDeliveryZone' src/lib/agents/somnio-v3/response-track.ts` shows import + usage
- `grep 'tiempo_entrega' src/lib/agents/somnio-v3/response-track.ts` shows the resolver
- `grep 'confirmacion_orden_same_day\|confirmacion_orden_transportadora' src/lib/agents/somnio-v3/response-track.ts` shows personalized intent selection
- `grep 'async function resolveSalesActionTemplates' src/lib/agents/somnio-v3/response-track.ts` confirms async conversion
  </verify>
  <done>Response track dynamically resolves tiempo_entrega to zone-specific templates and personalizes confirmacion_orden by delivery zone. Both use cases wired through lookupDeliveryZone.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Complete tiempo_entrega feature:
1. delivery_zones table with ~120+ municipalities
2. Agent templates for 5 tiempo_entrega variants + 2 personalized confirmacion_orden variants
3. tiempo_entrega recognized as informational intent
4. Sales track guard prevents auto-trigger swallowing informational intents
5. Response track dynamically resolves zone-specific templates
6. Same-day cutoff logic with timezone-aware day calculation
  </what-built>
  <how-to-verify>
Test in sandbox with Somnio Sales v3 agent:

1. **tiempo_entrega sin ciudad:**
   - Send: "cuanto se demora el envio?"
   - Expected: "En que municipio te encuentras? El tiempo de entrega depende de tu ubicacion"

2. **tiempo_entrega con ciudad en mensaje:**
   - Send: "cuanto tarda a Pasto?"
   - Expected: ciudad saved as Pasto + "Tu pedido estaria llegando a Pasto en 1-3 dias habiles"

3. **tiempo_entrega con ciudad ya en state:**
   - First give address with city (e.g., "Calle 1 #2-3, Bucaramanga")
   - Then send: "cuanto se demora?"
   - Expected: zone lookup for Bucaramanga -> same_day -> "HOY mismo" or "MANANA MISMO" depending on time

4. **Informational guard test:**
   - Start new conversation, give all datos in one message + ask delivery time: "Jose Romero, 3001234567, Calle 1, Bucaramanga, quiero el de 2, cuanto se demora?"
   - Expected: should answer delivery time question, NOT trigger ofrecer_promos auto-trigger

5. **Personalized confirmacion_orden (same_day):**
   - Complete full flow for Bucaramanga address (before 2:30PM)
   - When order is created, expected CORE: "Tu pedido llega HOY mismo" + no guide mention
   - Expected COMPLEMENTARIA (3s later): "Recuerda tener el efectivo listo..."

6. **Personalized confirmacion_orden (transportadora):**
   - Complete full flow for Pasto address
   - When order is created, expected CORE: "Tu pedido estaria llegando en 1-3 dias habiles" + guide mention
   - Expected COMPLEMENTARIA (3s later): "Recuerda tener el efectivo listo..."
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found during testing</resume-signal>
</task>

</tasks>

<verification>
- Full feature works end-to-end in sandbox
- TypeScript compiles without errors: `npx tsc --noEmit`
- All 7 success criteria from phase goal are met
</verification>

<success_criteria>
1. tiempo_entrega sin ciudad -> asks for municipality
2. tiempo_entrega con ciudad -> zone-specific response
3. Same-day cutoff logic works (HOY/MANANA/LUNES)
4. Informational intent doesn't trigger datosCompletosJustCompleted auto-trigger
5. confirmacion_orden personalized by zone (same_day vs transportadora)
6. Both CORE + COMPLEMENTARIA templates sent with delay
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-tiempo-entrega/03-SUMMARY.md`
</output>
