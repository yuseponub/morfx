# Standalone: v3-tiempo-entrega - Research

**Researched:** 2026-03-17
**Domain:** Colombian delivery zones + Somnio v3 agent informational intent
**Confidence:** HIGH (codebase patterns), MEDIUM (municipality classification)

## Summary

This research covers two domains: (1) how to classify Colombian municipalities into delivery time zones for Somnio's logistics, and (2) how to integrate the `tiempo_entrega` informational intent into the existing v3 agent architecture.

The v3 agent has a well-established pattern for informational intents. Adding `tiempo_entrega` follows the same path as `envio`, `precio`, etc. -- add to `V3_INTENTS`, add to `INFORMATIONAL_INTENTS`, create templates in `agent_templates`, and let the response track handle it. The novel part is the delivery zone lookup, which requires a new `delivery_zones` table and a lookup function that the response track calls to inject `tiempo_entrega` as extra context into templates.

The municipality classification is the core research challenge. Colombian transport companies (Coordinadora, Interrapidisimo) classify destinations into LOCAL/REGIONAL/NACIONAL tiers with 1-5 day delivery windows. For Somnio's simplified 4-zone model, the classification maps to: same_day (BGA metro), next_day (big 4 metros), 1_3_days (capitals + metros + major towns), 2_4_days (everything else).

**Primary recommendation:** Create a `delivery_zones` table with ~200 municipalities mapped to zones. Use the dane_municipalities table for lookup normalization. The zone classification uses population, capital status, metropolitan membership, and transport connectivity as criteria.

## Standard Stack

No new libraries needed. This feature uses existing infrastructure:

### Core
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| agent_templates table | Supabase | Store tiempo_entrega response templates | Existing template system |
| delivery_zones table | Supabase (new) | Municipality-to-zone mapping | Needs DB lookup |
| dane_municipalities table | Supabase (existing) | Normalize city names for lookup | Already has 1,122+ municipalities |
| constants.ts | somnio-v3/ | Add intent to V3_INTENTS + INFORMATIONAL_INTENTS | Single source of truth |
| response-track.ts | somnio-v3/ | Handle tiempo_entrega with extra context | Template engine |

### Supporting
| Component | Location | Purpose |
|-----------|----------|---------|
| normalizers.ts | somnio/ | normalizeCity() for fuzzy matching |
| comprehension-prompt.ts | somnio-v3/ | Add tiempo_entrega to intent list |

## Architecture Patterns

### Pattern 1: Informational Intent Flow (existing)
**What:** How informational intents flow through the v3 pipeline
**When:** User asks about delivery time

The flow is:
1. **Comprehension** (comprehension-prompt.ts): Claude Haiku classifies intent as `tiempo_entrega`
2. **State merge** (state.ts): Intent pushed to `intentsVistos`, ciudad extracted if present
3. **Sales track** (sales-track.ts): No match for informational intents -> falls through to step 4
4. **Response track** (response-track.ts): `INFORMATIONAL_INTENTS.has('tiempo_entrega')` -> true -> loads templates for `tiempo_entrega`
5. **Template manager**: Loads templates from `agent_templates` with variable substitution

**Key insight:** The response track already supports `extraContext` for variable substitution in templates (see `resolveSalesActionTemplates` pattern). For `tiempo_entrega`, we need a similar mechanism but for informational intents -- this is NEW and needs a small extension to the response track.

### Pattern 2: Dynamic Informational Intent (new pattern needed)
**What:** `tiempo_entrega` is the first informational intent that needs dynamic data lookup before template rendering
**Why new:** Existing informational intents (precio, envio, etc.) use static templates. `tiempo_entrega` needs to:
1. Check if `state.datos.ciudad` is available
2. If no ciudad -> use `tiempo_entrega_sin_ciudad` template (static)
3. If ciudad available -> look up delivery zone -> use zone-specific template

**Implementation approach:** Add a pre-processing step in `resolveResponseTrack` specifically for `tiempo_entrega` that:
- Checks state.datos.ciudad
- If present, calls `lookupDeliveryZone(ciudad)`
- Injects `zona`, `tiempo_estimado`, `ciudad` into variableContext
- Selects the appropriate template variant (sin_ciudad vs con_ciudad)

### Pattern 3: Template Variable Substitution (existing)
**What:** Templates use `{{variable_name}}` syntax for dynamic content
**Where:** Template manager processes variables via `processTemplates(templates, variableContext)`
**Example from codebase:**
```
'Perfecto! Despacharemos tu pedido lo antes posible...'  -- confirmacion_orden CORE
```

For tiempo_entrega, templates would use:
```
'Tu pedido estaria llegando a {{ciudad}} en {{tiempo_estimado}}'
```

### Pattern 4: Same-Day Cutoff Time Logic
**What:** same_day zone has time-dependent responses
**Implementation:** At response time (America/Bogota timezone):
- Before cutoff (2:30PM BGA, 9AM BOG): "HOY mismo"
- After cutoff, tomorrow not Sunday: "MANANA MISMO"
- After cutoff, tomorrow is Sunday: "el LUNES"

This logic goes in the delivery zone lookup function, not in templates. The function returns the appropriate `tiempo_estimado` string.

### Anti-Patterns to Avoid
- **Do NOT add ciudad to comprehension schema**: Ciudad is already extracted by comprehension. The intent `tiempo_entrega` just uses whatever ciudad is in state.datos.ciudad.
- **Do NOT make tiempo_entrega affect the sales state machine**: It is purely informational, like `envio` or `precio`.
- **Do NOT create a separate API route for zone lookup**: Keep it as a simple function call within the response track.

## Municipality Classification: Delivery Zones

### Zone Definitions

Based on the CONTEXT.md decisions and logistics research:

| Zone | Delivery Time | Carrier | Criteria |
|------|--------------|---------|----------|
| `same_day` | HOY (antes corte) / MANANA | Domiciliario propio | BGA metro (4 muni) + BOG (solo ciudad) |
| `next_day` | Al dia siguiente | Transportadora | Big 4 metros (antes 3PM) |
| `1_3_days` | 1-3 dias habiles | Transportadora | Capitales + metros + ciudades intermedias |
| `2_4_days` | 2-4 dias habiles | Transportadora | Resto del pais |

### Zone: same_day (4+1 municipalities)

Per CONTEXT.md decision:
- **Bucaramanga** (cutoff 2:30PM)
- **Giron** (cutoff 2:30PM)
- **Piedecuesta** (cutoff 2:30PM)
- **Floridablanca** (cutoff 2:30PM)
- **Bogota** (cutoff 9AM) -- solo Bogota ciudad, no Sabana

### Zone: next_day (approximately 25 municipalities)

Medellin + area metropolitana, Barranquilla + area metropolitana, Cali + area metropolitana, Bogota area metropolitana (Soacha, Chia, etc.)

**Area Metropolitana del Valle de Aburra (Medellin):**
Medellin, Bello, Barbosa (Antioquia), Copacabana, La Estrella, Girardota, Itagui, Caldas (Antioquia), Sabaneta, Envigado

**Area Metropolitana de Barranquilla:**
Barranquilla, Soledad, Malambo, Puerto Colombia, Galapa

**Area Metropolitana de Cali / Suroccidente:**
Cali, Jamundi, Yumbo, Palmira, Candelaria

**Bogota area metropolitana (Sabana):**
Soacha, Chia, Cajica, Zipaquira, Facatativa, Funza, Mosquera, Madrid, Cota

### Zone: 1_3_days (approximately 150 municipalities)

This is the CRITICAL classification. Based on research:

**Criteria for 1-3 days:**
1. ALL 32 capitales departamentales (not already in same_day or next_day)
2. ALL municipalities in official metropolitan areas (not already listed)
3. Ciudades intermedias: municipalities with >50,000 urban population and good transport connectivity
4. Major towns on primary transport corridors

**32 Capitales Departamentales (those not in same_day or next_day zones):**

| Capital | Department | Notes |
|---------|------------|-------|
| Cucuta | Norte de Santander | Capital |
| Pereira | Risaralda | Capital |
| Manizales | Caldas | Capital |
| Ibague | Tolima | Capital |
| Santa Marta | Magdalena | Capital |
| Villavicencio | Meta | Capital |
| Pasto | Narino | Capital |
| Monteria | Cordoba | Capital |
| Neiva | Huila | Capital |
| Armenia | Quindio | Capital |
| Popayan | Cauca | Capital |
| Valledupar | Cesar | Capital |
| Sincelejo | Sucre | Capital |
| Tunja | Boyaca | Capital |
| Cartagena | Bolivar | Capital |
| Riohacha | La Guajira | Capital |
| Florencia | Caqueta | Capital |
| Quibdo | Choco | Capital (remote but capital) |
| Yopal | Casanare | Capital |
| Arauca | Arauca | Capital |
| Mocoa | Putumayo | Capital |
| Leticia | Amazonas | Capital (remote but capital) |
| Inirida | Guainia | Capital (very remote) |
| San Jose del Guaviare | Guaviare | Capital (remote) |
| Mitu | Vaupes | Capital (very remote) |
| Puerto Carreno | Vichada | Capital (very remote) |
| San Andres | San Andres | Island (special shipping) |

**NOTE on remote capitals:** Leticia, Mitu, Inirida, Puerto Carreno, San Jose del Guaviare -- these are departmental capitals but VERY remote. The transport companies classify them as 3-5+ days. **Recommendation:** Keep them in 1_3_days since they ARE capitals, but acknowledge delivery may take the full 3 days. The alternative is moving them to 2_4_days, which the user should decide.

**Metropolitan Areas (members not already listed):**

Area Metropolitana de Bucaramanga: already in same_day

Area Metropolitana de Cucuta:
- Villa del Rosario, Los Patios, El Zulia, San Cayetano, Puerto Santander (N. Santander)

Area Metropolitana Centro Occidente (Pereira):
- Dosquebradas, La Virginia

Area Metropolitana de Valledupar:
- Agustin Codazzi, La Paz (Cesar), Manaure Balcon del Cesar, San Diego (Cesar)

**Ciudades Intermedias (non-capital municipalities with significant urban population):**

Confidence: MEDIUM -- based on population data, transport corridor knowledge, and logistics industry patterns.

| Municipality | Department | Why Included |
|-------------|------------|-------------|
| Barrancabermeja | Santander | District, major oil city, >200K |
| Tulua | Valle del Cauca | Major intermediate city, >200K |
| Buga (Guadalajara de Buga) | Valle del Cauca | Important city, ~130K |
| Cartago | Valle del Cauca | Major city, ~140K |
| Turbo | Antioquia | District, port city, >170K |
| Apartado | Antioquia | Uraba hub, ~200K |
| Sogamoso | Boyaca | Major industrial city, ~110K |
| Duitama | Boyaca | Major city, ~120K |
| Girardot | Cundinamarca | Major transport hub, ~110K |
| Fusagasuga | Cundinamarca | Growing city, ~140K |
| Magangue | Bolivar | River port city, ~130K |
| Aguachica | Cesar | Transport hub, ~100K |
| Ocana | Norte de Santander | Important city, ~100K |
| Buenaventura | Valle del Cauca | Major port, district, >400K |
| Tumaco | Narino | District, port city, >200K |
| Lorica | Cordoba | Important town, ~120K |
| Cereté | Cordoba | Important town, ~100K |
| Sahagún | Cordoba | Important town, ~90K |
| Ciénaga | Magdalena | Major city, ~110K |
| Fundación | Magdalena | Transport hub, ~60K |
| Maicao | La Guajira | Commercial hub, ~180K |
| Caucasia | Antioquia | Regional hub, ~120K |
| Chigorodó | Antioquia | Urabá corridor, ~80K |
| Carepa | Antioquia | Urabá corridor, ~60K |
| Espinal | Tolima | Important town, ~80K |
| Honda | Tolima | Historic transport hub, ~30K |
| La Dorada | Caldas | River port, ~80K |
| Pitalito | Huila | Major intermediate city, ~130K |
| Garzon | Huila | Important town, ~90K |
| Ipiales | Narino | Border city, ~110K |
| Tuquerres | Narino | Important town, ~40K |
| Chiquinquira | Boyaca | Religious/commercial center, ~65K |
| Pamplona | Norte de Santander | University city, ~60K |
| San Gil | Santander | Tourism/adventure hub, ~50K |
| Socorro | Santander | Historic city, ~30K |
| Marinilla | Antioquia | Growing city near Medellin, ~60K |
| Rionegro | Antioquia | Airport city, ~125K |
| La Ceja | Antioquia | Growing city, ~55K |
| El Carmen de Viboral | Antioquia | Near Medellin, ~50K |
| Yarumal | Antioquia | Northern Antioquia hub, ~50K |
| Puerto Berrio | Antioquia | River port, ~50K |
| Acacias | Meta | Near Villavicencio, ~75K |
| Granada (Meta) | Meta | Important town, ~65K |
| Sabanalarga | Atlantico | Important town, ~100K |
| Turbaco | Bolivar | Near Cartagena, ~75K |
| Arjona | Bolivar | Near Cartagena, ~75K |
| El Carmen de Bolivar | Bolivar | Major town, ~80K |
| San Marcos | Sucre | Important town, ~55K |
| Corozal | Sucre | Near Sincelejo, ~65K |
| Sampués | Sucre | Important town, ~40K |
| Ciénaga de Oro | Córdoba | Important town, ~65K |

### Zone: 2_4_days (everything else)

All ~900+ remaining municipalities in the dane_municipalities table. These are:
- Small towns (<30K population)
- Rural municipalities
- Geographically isolated areas
- Municipalities without direct transport routes

### Implementation Approach for delivery_zones Table

**Option A (recommended): Explicit mapping table for zones 1-3, default 2_4_days**

```sql
CREATE TABLE delivery_zones (
  id SERIAL PRIMARY KEY,
  municipality_name_normalized TEXT NOT NULL,
  department_name_normalized TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('same_day', 'next_day', '1_3_days', '2_4_days')),
  cutoff_hour INTEGER, -- NULL for non-same_day, 14 for BGA (2:30PM), 9 for BOG
  carrier TEXT NOT NULL DEFAULT 'transportadora',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(municipality_name_normalized, department_name_normalized)
);
```

Only insert rows for same_day (~5), next_day (~25), and 1_3_days (~150) municipalities. Any city NOT found in delivery_zones defaults to `2_4_days`. This avoids maintaining 900+ rows.

**Lookup function:**
```typescript
async function lookupDeliveryZone(ciudad: string, workspaceId: string): Promise<{
  zone: 'same_day' | 'next_day' | '1_3_days' | '2_4_days'
  cutoffHour: number | null
  carrier: string
}> {
  const normalized = ciudad.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()

  // Query delivery_zones table
  const { data } = await supabase
    .from('delivery_zones')
    .select('zone, cutoff_hour, carrier')
    .eq('municipality_name_normalized', normalized)
    .maybeSingle()

  if (data) return { zone: data.zone, cutoffHour: data.cutoff_hour, carrier: data.carrier }

  // Default: 2_4_days
  return { zone: '2_4_days', cutoffHour: null, carrier: 'transportadora' }
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| City name normalization | Custom normalizer | Existing `normalizeCity()` in normalizers.ts | Already handles accents, abbreviations, proper case |
| Template rendering | Custom string replacer | Existing `TemplateManager.processTemplates()` | Already handles `{{variable}}` substitution |
| Department inference | New lookup | Existing `inferDepartamento()` | Already maps 40+ cities to departments |
| Municipality validation | Custom validation | `dane_municipalities` table lookup | Already has 1,122+ normalized entries |

## Common Pitfalls

### Pitfall 1: City Normalization Mismatch
**What goes wrong:** Customer types "bga" or "bmanga" and the delivery zone lookup fails because it searches for the abbreviation, not "BUCARAMANGA"
**Why it happens:** The delivery_zones table uses normalized names but the raw city from state might be an abbreviation
**How to avoid:** Always normalize city through `normalizeCity()` BEFORE looking up delivery_zones. The normalizer already converts "bga" -> "Bucaramanga", "bquilla" -> "Barranquilla", etc.
**Warning signs:** Zone lookup returns 2_4_days for major cities

### Pitfall 2: Same-Day Cutoff Timezone
**What goes wrong:** Cutoff evaluated in UTC instead of America/Bogota, causing wrong same_day/next_day responses
**Why it happens:** Server runs in UTC, developer forgets timezone conversion
**How to avoid:** Always use `new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })` or similar to get Colombian time before evaluating cutoff
**Warning signs:** 2:30PM cutoff triggers at 7:30PM or 9:30AM Colombian time

### Pitfall 3: Sunday Logic Off-by-One
**What goes wrong:** "MANANA" says Monday when it should say Tuesday, or says "el LUNES" on Friday
**Why it happens:** JavaScript Date.getDay() returns 0 for Sunday, logic doesn't account for all day combinations
**How to avoid:** Test cases: Saturday after cutoff -> "el LUNES"; Sunday after cutoff -> "MANANA LUNES"; Friday after cutoff -> "MANANA SABADO" (Saturday IS a delivery day for domiciliario)
**Warning signs:** Wrong day names in responses

### Pitfall 4: datosCompletosJustCompleted Auto-Trigger Fires for Informational Intent
**What goes wrong:** Customer sends "quiero comprar, enviar a Bogota, cuanto se demora?" -- the ciudad extraction completes critical fields, triggering `ofrecer_promos` auto-trigger instead of answering the delivery time question
**Why it happens:** The `datosCompletosJustCompleted` auto-trigger in sales-track fires BEFORE intent resolution, swallowing the informational intent
**How to avoid:** The CONTEXT.md mentions "1 guard in sales-track: skip auto-trigger when intent is informational". This guard checks if the current intent is in INFORMATIONAL_INTENTS and skips the `datosCompletosJustCompleted` auto-trigger if so. The response track will still answer the informational question.
**Warning signs:** Agent responds with promos instead of delivery time when asked

### Pitfall 5: No Ciudad in State
**What goes wrong:** Customer asks "cuanto se demora el envio?" without ever mentioning a city
**Why it happens:** `state.datos.ciudad` is null
**How to avoid:** The `tiempo_entrega` handler must check for ciudad before zone lookup. If null, use the `tiempo_entrega_sin_ciudad` template that asks for the city.

## Code Examples

### Example 1: Adding to Constants
```typescript
// In constants.ts - add to V3_INTENTS array (informational section)
'tiempo_entrega',

// In constants.ts - add to INFORMATIONAL_INTENTS set
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones', 'contenido', 'formula', 'como_se_toma',
  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'contraindicaciones',
  'dependencia', 'efectividad', 'tiempo_entrega',
])
```

### Example 2: Response Track Extension for Dynamic Informational Intent
```typescript
// In response-track.ts - new helper for tiempo_entrega
// Called when intent is 'tiempo_entrega' to inject zone-specific context

async function resolveDeliveryTimeContext(state: AgentState, workspaceId: string): Promise<{
  templateIntent: string  // 'tiempo_entrega' or 'tiempo_entrega_sin_ciudad'
  extraContext?: Record<string, string>
}> {
  const ciudad = state.datos.ciudad
  if (!ciudad) {
    return { templateIntent: 'tiempo_entrega_sin_ciudad' }
  }

  const zone = await lookupDeliveryZone(ciudad)
  const tiempoEstimado = formatDeliveryTime(zone)

  return {
    templateIntent: `tiempo_entrega_${zone.zone}`,
    extraContext: { ciudad, tiempo_estimado: tiempoEstimado },
  }
}
```

### Example 3: Same-Day Cutoff Logic
```typescript
function formatSameDayDelivery(cutoffHour: number): string {
  const now = new Date()
  const colombianTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const currentHour = colombianTime.getHours()
  const currentMinutes = colombianTime.getMinutes()

  // cutoffHour 14 means 2:30PM (14:30), cutoffHour 9 means 9:00AM
  const cutoffMinutes = cutoffHour === 14 ? 30 : 0
  const beforeCutoff = currentHour < cutoffHour ||
    (currentHour === cutoffHour && currentMinutes < cutoffMinutes)

  if (beforeCutoff) {
    return 'HOY mismo'
  }

  // After cutoff: check if tomorrow is Sunday
  const tomorrow = new Date(colombianTime)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDay = tomorrow.getDay() // 0 = Sunday

  if (tomorrowDay === 0) {
    return 'el LUNES'
  }
  return 'MANANA MISMO'
}
```

### Example 4: Comprehension Prompt Addition
```typescript
// Add to comprehension-prompt.ts intent list
'- tiempo_entrega: pregunta sobre tiempos de entrega ("cuanto se demora?", "cuando llega?", "en cuantos dias llega?")'
```

### Example 5: Template SQL Migration
```sql
-- tiempo_entrega templates
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s) VALUES
  -- sin_ciudad
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_sin_ciudad', 'primera_vez', 'CORE', 0, 'texto',
   'En que municipio te encuentras? El tiempo de entrega depende de tu ubicacion.', 0),
  -- same_day (dynamic via extraContext)
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_same_day', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} {{tiempo_estimado}}. Nuestro domiciliario se comunicara contigo para la entrega', 0),
  -- next_day
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_next_day', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} al dia siguiente de ser despachado', 0),
  -- 1_3_days
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_1_3_days', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} en 1-3 dias habiles', 0),
  -- 2_4_days
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_2_4_days', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} en 2-4 dias habiles', 0);
```

### Example 6: Personalized confirmacion_orden Template
```sql
-- Update existing confirmacion_orden CORE template to include delivery time
-- Option A: Single template with {{tiempo_entrega_info}} variable
-- Option B: Multiple templates per zone (confirmacion_orden_same_day, etc.)
-- Recommendation: Option B is cleaner, avoids complex conditional logic in templates
```

## Sales Track Guard: Skip Auto-Trigger for Informational Intents

The `datosCompletosJustCompleted` auto-trigger in sales-track.ts (line ~93) fires when all critical fields are just completed. If the message that completed the fields also has an informational intent (like `tiempo_entrega`), the auto-trigger swallows it.

**Fix location:** sales-track.ts, section 2 (auto-triggers)

```typescript
// Before auto-trigger, check if intent is informational
if (changes.datosCompletosJustCompleted && !promosMostradas(state)) {
  // NEW GUARD: Skip if intent is informational (let response track handle both)
  if (event.type === 'user_message' && INFORMATIONAL_INTENTS.has(event.intent)) {
    // Don't auto-trigger — response track will handle informational +
    // the auto-trigger will fire on the NEXT non-informational message
    // (datosCompletosJustCompleted is a one-time flag per turn)
  } else {
    // existing auto-trigger logic
  }
}
```

**IMPORTANT NOTE:** This guard means that if a customer completes datos AND asks about delivery time in the same message, the auto-trigger (ofrecer_promos) is deferred. It will fire next turn. This is the correct behavior -- answer the customer's question first, then proceed with the sales flow.

## Confirmacion Orden Personalization

When an order is created (`crear_orden` action), the response track loads `confirmacion_orden` templates. The CONTEXT.md specifies:

- **same_day (domiciliario propio):** "Perfecto! Tu pedido llega HOY mismo. Nuestro domiciliario se comunicara contigo para la entrega" -- no tracking guide mention
- **transportadora (next_day, 1_3_days, 2_4_days):** Current template + "Tu pedido estaria llegando en {{tiempo_estimado}}"

**Implementation:** The `resolveSalesActionTemplates` function for `crear_orden` currently returns `intents: ['confirmacion_orden']`. Modify it to:
1. Look up delivery zone from `state.datos.ciudad`
2. Return `intents: ['confirmacion_orden_same_day']` or `intents: ['confirmacion_orden_transportadora']`
3. Add `tiempo_estimado` to extraContext

This requires making `resolveSalesActionTemplates` async (it currently is sync).

## Open Questions

1. **Remote capitals classification**
   - What we know: Leticia, Mitu, Inirida, Puerto Carreno, San Jose del Guaviare are departmental capitals but VERY remote (accessible mainly by air)
   - What's unclear: Should they be 1_3_days (because they're capitals) or 2_4_days (because they're realistically 4-5+ days)?
   - Recommendation: Put them in `2_4_days` since the delivery promise should be realistic. The user already has them in REMOTE_MUNICIPALITIES in normalizers.ts. Ask user for final decision.

2. **San Andres island**
   - What we know: It's a department capital but requires air freight shipping
   - What's unclear: Does Somnio even ship there? What zone should it be?
   - Recommendation: Put in `2_4_days` or exclude entirely. Ask user.

3. **Sabana de Bogota next_day boundary**
   - What we know: Soacha, Chia, Cajica etc. are in the Bogota conurbation
   - What's unclear: Exactly which Cundinamarca municipalities qualify as next_day vs 1_3_days?
   - Recommendation: Include the 9 major Sabana municipalities in next_day (listed above). Everything else in Cundinamarca goes to 1_3_days or 2_4_days based on population.

4. **Should confirmacion_orden become async?**
   - What we know: `resolveSalesActionTemplates` is currently synchronous
   - What's unclear: Making it async has ripple effects on response-track.ts
   - Recommendation: Either make it async or pre-compute the delivery zone in the main agent pipeline and pass it through state/extraContext

## Sources

### Primary (HIGH confidence)
- Codebase files: constants.ts, response-track.ts, sales-track.ts, state.ts, somnio-v3-agent.ts, types.ts, normalizers.ts, comprehension-prompt.ts
- dane_municipalities migration (20260222000000) -- 1,122+ municipalities with normalized names
- agent_templates migration (20260206000000) -- table schema and template format

### Secondary (MEDIUM confidence)
- [Wikipedia: Areas Metropolitanas de Colombia](https://es.wikipedia.org/wiki/%C3%81reas_metropolitanas_de_Colombia) -- metro area member lists
- [Wikipedia: Area Metropolitana de Barranquilla](https://es.wikipedia.org/wiki/%C3%81rea_Metropolitana_de_Barranquilla) -- 5 municipalities
- [Wikipedia: Area Metropolitana de Cucuta](https://es.wikipedia.org/wiki/%C3%81rea_metropolitana_de_C%C3%BAcuta) -- 6 municipalities
- [AMCO oficial](https://www.amco.gov.co/) -- Pereira, Dosquebradas, La Virginia
- [Area Metropolitana de Valledupar](http://www.areametrovalledupar.gov.co/) -- 5 municipalities
- [Coordinadora tiempos de entrega](https://coordinadora.com/envios/tiempos-de-entrega/) -- general delivery tiers
- [ANIF: Convergencia urbana](https://www.anif.com.co/informe-semanal/convergencia-urbana-en-colombia-y-el-ascenso-de-las-ciudades-intermedias/) -- intermediate cities list

### Tertiary (LOW confidence)
- Population figures for intermediate cities -- based on general DANE projections cited in multiple sources, not directly verified from official DANE data portal
- Transport corridor connectivity -- based on general logistics knowledge, not carrier-specific route data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all patterns verified against existing codebase
- Architecture (intent integration): HIGH -- follows well-established informational intent pattern
- Municipality classification (same_day, next_day): HIGH -- explicitly decided in CONTEXT.md
- Municipality classification (1_3_days vs 2_4_days): MEDIUM -- based on multiple sources (population, metro areas, transport knowledge) but not verified against carrier-specific zone data
- Pitfalls: HIGH -- identified from codebase analysis

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (municipality data is stable; codebase patterns may evolve)
