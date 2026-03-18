---
phase: v3-tiempo-entrega
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/comprehension-prompt.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/delivery-zones.ts
autonomous: true

must_haves:
  truths:
    - "tiempo_entrega is in V3_INTENTS and INFORMATIONAL_INTENTS"
    - "Comprehension prompt includes tiempo_entrega intent with examples"
    - "datosCompletosJustCompleted auto-trigger is skipped when intent is informational"
    - "lookupDeliveryZone normalizes city and returns zone + formatted time string"
    - "Same-day cutoff logic uses America/Bogota timezone"
    - "Sunday logic returns 'el LUNES' when tomorrow is Sunday"
  artifacts:
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "tiempo_entrega in V3_INTENTS + INFORMATIONAL_INTENTS"
      contains: "tiempo_entrega"
    - path: "src/lib/agents/somnio-v3/comprehension-prompt.ts"
      provides: "Intent classification for delivery time questions"
      contains: "tiempo_entrega"
    - path: "src/lib/agents/somnio-v3/sales-track.ts"
      provides: "Guard to skip auto-trigger for informational intents"
      contains: "INFORMATIONAL_INTENTS"
    - path: "src/lib/agents/somnio-v3/delivery-zones.ts"
      provides: "Zone lookup function + time formatting"
      exports: ["lookupDeliveryZone", "formatDeliveryTime"]
  key_links:
    - from: "sales-track.ts"
      to: "constants.ts"
      via: "INFORMATIONAL_INTENTS import"
      pattern: "INFORMATIONAL_INTENTS\\.has"
    - from: "delivery-zones.ts"
      to: "normalizers.ts"
      via: "normalizeCity import"
      pattern: "normalizeCity"
---

<objective>
Add tiempo_entrega as informational intent (constants, comprehension, sales guard) and create the delivery zone lookup function with same-day cutoff logic.

Purpose: The agent needs to recognize delivery time questions, not trigger sales auto-actions for informational intents, and have a function to look up delivery zones with time-aware responses.
Output: Updated constants + comprehension, guarded sales track, new delivery-zones.ts module.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-tiempo-entrega/CONTEXT.md
@.planning/standalone/v3-tiempo-entrega/RESEARCH.md
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/comprehension-prompt.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio/normalizers.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add tiempo_entrega to constants + comprehension + sales guard</name>
  <files>
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/comprehension-prompt.ts
    src/lib/agents/somnio-v3/sales-track.ts
  </files>
  <action>
**constants.ts:**
1. Add `'tiempo_entrega'` to V3_INTENTS array in the Informational section (making it 13 informational intents). Place it after `'efectividad'`.
2. Add `'tiempo_entrega'` to INFORMATIONAL_INTENTS set. Update the comment to reflect the new count.

**comprehension-prompt.ts:**
3. Add tiempo_entrega to the CONTEXTO DE INTENTS section:
```
- tiempo_entrega: pregunta sobre tiempos de entrega ("cuanto se demora?", "cuando llega?", "en cuantos dias llega?", "cuanto tarda el envio?")
```
Place it after the `envio` entry. This is important: `envio` is about shipping info generally, `tiempo_entrega` is specifically about delivery TIME. Add a disambiguation note:
```
- REGLA envio vs tiempo_entrega: Si el cliente pregunta sobre tiempos/dias/demora de entrega, usar tiempo_entrega. Si pregunta sobre logistica general (hacen envios?, envian a X?, por donde envian?), usar envio.
```

**sales-track.ts:**
4. Import INFORMATIONAL_INTENTS from constants.
5. In the datosCompletosJustCompleted auto-trigger section (around line 93), add a guard:
```typescript
if (changes.datosCompletosJustCompleted && !promosMostradas(state)) {
  // Guard: skip auto-trigger if intent is informational (let response track answer first)
  const isInformational = event.type === 'user_message' &&
    event.intent && INFORMATIONAL_INTENTS.has(event.intent)

  if (!isInformational) {
    const ev: SystemEvent = { type: 'auto', result: 'datos_completos' }
    const key = systemEventToKey(ev)
    const match = resolveTransition(phase, key, state, gates, changes)
    if (match) {
      return {
        accion: match.action,
        enterCaptura: match.output.enterCaptura,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
  }
  // If informational: datosCompletosJustCompleted is consumed this turn,
  // auto-trigger deferred to next non-informational message
}
```

WHY the guard: Without it, a message like "enviar a Bogota, cuanto se demora?" would complete datos AND trigger ofrecer_promos, swallowing the delivery time question. The guard lets response track answer the informational question first. The auto-trigger fires next turn.
  </action>
  <verify>
- `grep 'tiempo_entrega' src/lib/agents/somnio-v3/constants.ts` shows it in both V3_INTENTS and INFORMATIONAL_INTENTS
- `grep 'tiempo_entrega' src/lib/agents/somnio-v3/comprehension-prompt.ts` shows intent definition
- `grep 'INFORMATIONAL_INTENTS' src/lib/agents/somnio-v3/sales-track.ts` shows the import and guard usage
- `npx tsc --noEmit` passes (no type errors)
  </verify>
  <done>tiempo_entrega recognized as informational intent, comprehension can classify it, and sales track skips auto-trigger for informational intents.</done>
</task>

<task type="auto">
  <name>Task 2: Create delivery zone lookup function</name>
  <files>src/lib/agents/somnio-v3/delivery-zones.ts</files>
  <action>
Create a new module `delivery-zones.ts` with two exported functions:

**1. `lookupDeliveryZone(ciudad: string)`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCity } from '@/lib/agents/somnio/normalizers'

interface DeliveryZoneResult {
  zone: 'same_day' | 'next_day' | '1_3_days' | '2_4_days'
  cutoffHour: number | null
  cutoffMinutes: number
  carrier: string  // 'domiciliario propio' for same_day, 'transportadora' for rest
}

export async function lookupDeliveryZone(ciudad: string): Promise<DeliveryZoneResult> {
  // 1. Normalize through normalizeCity (handles "bga" -> "Bucaramanga", etc.)
  const normalized = normalizeCity(ciudad)

  // 2. Convert to DB format (upper case, no accents)
  const dbKey = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()

  // 3. Query delivery_zones
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('delivery_zones')
    .select('zone, cutoff_hour, cutoff_minutes')
    .eq('municipality_name_normalized', dbKey)
    .maybeSingle()

  if (data) {
    return {
      zone: data.zone as DeliveryZoneResult['zone'],
      cutoffHour: data.cutoff_hour,
      cutoffMinutes: data.cutoff_minutes ?? 0,
      carrier: data.zone === 'same_day' ? 'domiciliario propio' : 'transportadora',
    }
  }

  // Default: 2_4_days
  return { zone: '2_4_days', cutoffHour: null, cutoffMinutes: 0, carrier: 'transportadora' }
}
```

**2. `formatDeliveryTime(zoneResult: DeliveryZoneResult)`**

Returns the human-readable time string for templates. For same_day, evaluates cutoff in America/Bogota timezone.

```typescript
export function formatDeliveryTime(zoneResult: DeliveryZoneResult): string {
  switch (zoneResult.zone) {
    case 'same_day':
      return formatSameDayTime(zoneResult.cutoffHour!, zoneResult.cutoffMinutes)
    case 'next_day':
      return 'al dia siguiente de ser despachado'
    case '1_3_days':
      return 'en 1-3 dias habiles'
    case '2_4_days':
      return 'en 2-4 dias habiles'
  }
}

function formatSameDayTime(cutoffHour: number, cutoffMinutes: number): string {
  // Get current Colombian time
  const now = new Date()
  const colombianTimeStr = now.toLocaleString('en-US', { timeZone: 'America/Bogota' })
  const colombianTime = new Date(colombianTimeStr)
  const currentHour = colombianTime.getHours()
  const currentMinutes = colombianTime.getMinutes()

  const beforeCutoff = currentHour < cutoffHour ||
    (currentHour === cutoffHour && currentMinutes < cutoffMinutes)

  if (beforeCutoff) {
    return 'HOY mismo'
  }

  // After cutoff: check next delivery day
  const tomorrow = new Date(colombianTime)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDay = tomorrow.getDay() // 0 = Sunday

  if (tomorrowDay === 0) {
    return 'el LUNES'
  }
  return 'MANANA MISMO'
}
```

IMPORTANT edge cases tested by the logic:
- Saturday after cutoff -> tomorrow is Sunday -> "el LUNES"
- Sunday (any time) -> this function won't be called with beforeCutoff for Sunday since same_day deliveries are Mon-Sat
- Friday after cutoff -> tomorrow is Saturday -> "MANANA MISMO" (Saturday IS a delivery day for domiciliario propio)

Export both functions. The module has NO side effects -- pure functions + one DB call.
  </action>
  <verify>
- File exists at `src/lib/agents/somnio-v3/delivery-zones.ts`
- Exports: `lookupDeliveryZone`, `formatDeliveryTime`
- `npx tsc --noEmit` passes
- `grep 'normalizeCity' src/lib/agents/somnio-v3/delivery-zones.ts` confirms normalizer usage
- `grep 'America/Bogota' src/lib/agents/somnio-v3/delivery-zones.ts` confirms timezone usage
  </verify>
  <done>Delivery zone lookup function normalizes city, queries delivery_zones table, returns zone + formatted time string with correct same-day cutoff logic in Colombian timezone.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors across all modified files
- constants.ts has tiempo_entrega in both V3_INTENTS (now 22 intents) and INFORMATIONAL_INTENTS (now 14 intents)
- comprehension-prompt.ts has tiempo_entrega intent definition with disambiguation from envio
- sales-track.ts imports INFORMATIONAL_INTENTS and guards the datosCompletosJustCompleted auto-trigger
- delivery-zones.ts exists with lookupDeliveryZone + formatDeliveryTime exports
</verification>

<success_criteria>
Agent recognizes tiempo_entrega intent, sales track won't swallow informational intents with auto-triggers, and zone lookup function is ready for use by response track.
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-tiempo-entrega/02-SUMMARY.md`
</output>
