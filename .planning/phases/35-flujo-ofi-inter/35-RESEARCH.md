# Phase 35: Flujo Ofi Inter - Research

**Researched:** 2026-03-04
**Domain:** Somnio agent conversational flow / state machine modification
**Confidence:** HIGH

## Summary

This phase adds an office pickup (ofi inter = Interrapidisimo office) detection and bifurcated data flow to the existing Somnio sales agent. The implementation is entirely within the existing codebase -- no new libraries, no external APIs, no database schema changes beyond storing metadata in existing fields.

The standard approach involves:
1. Adding ofi inter intent detection via three routes (direct mention, municipio-only ingest, remote municipality list)
2. Adding a new `collecting_data_inter` session state with appropriate transitions
3. Modifying the data extraction and completion checks to support the bifurcated field sets (7 fields for ofi inter vs 8 fields for normal)
4. Storing cedula + ofi_inter flag in the order's `description` field (TEXT column, already exists)
5. Adapting the OrderCreator to handle the ofi inter flow (no direccion/barrio, add cedula)

**Primary recommendation:** Implement as a layer on top of the existing ingest/orchestration system. The key architectural insight is that ofi inter is fundamentally a mode switch that changes which fields are "complete" -- most of the existing pipeline (intent detection, ingest, extraction, ordering) needs only minor adaptations, not rewrites.

## Standard Stack

No new libraries needed. This phase operates entirely within the existing Somnio agent architecture.

### Core (existing, no changes)
| Component | Location | Purpose | Impact |
|-----------|----------|---------|--------|
| SomnioAgent | `src/lib/agents/somnio/somnio-agent.ts` | Business logic core | Add ofi inter detection routes |
| SomnioOrchestrator | `src/lib/agents/somnio/somnio-orchestrator.ts` | Flow decisions | Add `collecting_data_inter` handling |
| IngestManager | `src/lib/agents/somnio/ingest-manager.ts` | Silent accumulation | Add municipio-only detection (Route 2) |
| DataExtractor | `src/lib/agents/somnio/data-extractor.ts` | Field extraction | Add cedula extraction capability |
| MessageClassifier | `src/lib/agents/somnio/message-classifier.ts` | Message classification | No changes needed |
| OrderCreator | `src/lib/agents/somnio/order-creator.ts` | Contact + order creation | Adapt for ofi inter (no direccion, add cedula) |
| config.ts | `src/lib/agents/somnio/config.ts` | States + transitions | Add `collecting_data_inter` state |
| constants.ts | `src/lib/agents/somnio/constants.ts` | Field definitions | Add OFI_INTER_FIELDS constant |

### Supporting (existing, minor adaptations)
| Component | Location | Purpose | Change Needed |
|-----------|----------|---------|---------------|
| normalizers.ts | `src/lib/agents/somnio/normalizers.ts` | City/phone normalization | Add remote municipality list |
| transition-validator.ts | `src/lib/agents/somnio/transition-validator.ts` | Transition rules | Add `collecting_data_inter` rules |
| prompts.ts | `src/lib/agents/somnio/prompts.ts` | Claude prompts | Update data extractor prompt for cedula |
| variable-substitutor.ts | `src/lib/agents/somnio/variable-substitutor.ts` | Template variables | No changes needed |

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes modify existing files:

```
src/lib/agents/somnio/
  config.ts              # ADD: collecting_data_inter state + transitions
  constants.ts           # ADD: OFI_INTER_FIELDS, OFI_INTER_CRITICAL_FIELDS, REMOTE_MUNICIPALITIES
  data-extractor.ts      # ADD: cedula field, hasCriticalDataInter(), OFI_INTER field constants
  ingest-manager.ts      # ADD: municipio-only detection logic (Route 2)
  normalizers.ts         # ADD: isRemoteMunicipality() helper
  order-creator.ts       # ADD: ofi inter order creation (no direccion, add cedula to description)
  prompts.ts             # UPDATE: data extractor prompt to include cedula field
  somnio-agent.ts        # ADD: ofi inter detection (Route 1 + Route 3), state transitions
  somnio-orchestrator.ts # ADD: collecting_data_inter mode handling
  transition-validator.ts # ADD: collecting_data_inter transition rules
```

### Pattern 1: Mode-Based Field Set Switching

**What:** The agent uses the session mode (`collecting_data` vs `collecting_data_inter`) to determine which fields constitute "complete" data. The `hasCriticalData()` function and `CRITICAL_FIELDS` constant are the single source of truth for this.

**When to use:** Every time the system checks "are all fields complete?" -- ingest completion, timer promo trigger, auto-trigger ofrecer_promos.

**Implementation approach:**
```typescript
// constants.ts - Add alongside existing CRITICAL_FIELDS
export const OFI_INTER_CRITICAL_FIELDS = [
  'nombre',
  'telefono',
  'municipio',     // maps to ciudad internally
  'departamento',
] as const

export const OFI_INTER_ADDITIONAL_FIELDS = [
  'apellido',
  'cedula_recoge',  // NEW: cedula de quien recoge (OPTIONAL)
  'correo',
] as const

// data-extractor.ts - Add mode-aware completion check
export function hasCriticalDataForMode(
  data: Record<string, string>,
  isOfiInter: boolean
): boolean {
  if (isOfiInter) {
    return hasCriticalDataInter(data)
  }
  return hasCriticalData(data)
}
```

**Key insight:** The ofi inter flow requires 7 fields total but cedula is OPTIONAL, so completion is: 4 critical (nombre, telefono, municipio, departamento) + at least 2 of 3 additional (apellido, correo, cedula_recoge). This makes the minimum effectively 6 mandatory fields.

### Pattern 2: Three-Route Detection with Priority

**What:** Ofi inter detection uses three independent routes with clear priority:
- Route 1 (Direct mention) - highest priority, triggers immediately
- Route 2 (Municipio-only ingest) - triggers when asking for direccion
- Route 3 (Remote municipality) - triggers when customer asks about shipping to remote area

**When to use:** Each route fires at a different point in the processing pipeline.

**Implementation approach:**
```typescript
// Route 1: In somnio-agent.ts processMessage(), BEFORE intent detection
// Check raw message for ofi inter phrases
const ofiInterMention = detectOfiInterMention(input.message)
if (ofiInterMention) {
  // Immediately ask confirmation: "Deseas recibir en oficina de Interrapidisimo?"
  // Transition to a confirmation sub-state
}

// Route 2: In ingest-manager.ts, when municipio arrives without direccion
// During ingest completion check, if only municipio present (no direccion/barrio)
// Instead of asking for direccion, ask: "Deseas envio a domicilio o recoger en oficina?"

// Route 3: In somnio-agent.ts or orchestrator, when intent is 'envio'
// and message mentions a municipality in REMOTE_MUNICIPALITIES list
```

### Pattern 3: State Preservation on Mode Switch

**What:** When switching between `collecting_data` and `collecting_data_inter`, all compatible fields (nombre, apellido, telefono, municipio, departamento, correo) are preserved. Only mode-specific fields change.

**When to use:** When customer confirms or denies ofi inter, or changes their mind mid-flow.

**Implementation approach:**
```typescript
// Compatible fields (shared between both modes)
const COMPATIBLE_FIELDS = ['nombre', 'apellido', 'telefono', 'ciudad', 'departamento', 'correo']

// When switching to ofi inter:
// - Keep all COMPATIBLE_FIELDS values
// - Drop: direccion, barrio
// - Add to required: cedula_recoge (optional)

// When switching from ofi inter to normal:
// - Keep all COMPATIBLE_FIELDS values
// - Add to required: direccion, barrio
// - Drop: cedula_recoge
```

### Pattern 4: Storing Ofi Inter Metadata in Order

**What:** The `description` TEXT column on the `orders` table stores the ofi inter flag and cedula. The `custom_fields` JSONB column could also be used, but `description` is simpler and already has domain functions for reading/writing.

**When to use:** At order creation time via OrderCreator.

**Recommended storage format:**
```typescript
// Option A: Use description field (simpler, matches CONTEXT.md decision)
const description = isOfiInter
  ? `OFI INTER | Cedula recoge: ${cedulaRecoge || 'No proporcionada'}`
  : datosCapturados.indicaciones_extra || null

// Option B: Use custom_fields JSONB (more structured, better for queries)
const customFields = {
  ofi_inter: true,
  cedula_recoge: cedulaRecoge || null,
}
```

**Recommendation:** Use `description` field as stated in CONTEXT.md. It's visible in the pipeline board UI and immediately tells the logistics team "this is an ofi inter order." If we later need programmatic querying, we can migrate to custom_fields.

### Anti-Patterns to Avoid

- **Creating a separate pipeline for ofi inter:** This would fragment order management. Keep all orders in the same pipeline; the description field distinguishes them.
- **Adding new DB columns for ofi inter:** The `description` and `custom_fields` columns already exist. No migration needed.
- **Duplicating the entire data extraction pipeline:** The same DataExtractor works for both modes -- just change which fields are considered "critical."
- **Making cedula a blocking field:** CONTEXT.md explicitly says cedula is optional. If customer refuses, flow continues.
- **Sending address-related prompts in ofi inter mode:** The agent's collecting_data templates may reference direccion. In `collecting_data_inter` mode, these must be suppressed or replaced.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ofi inter phrase detection | Custom NLP classifier | RegExp pattern matching on known phrases | The list of phrases is finite and well-defined. Claude's intent detector already handles the conversational context. |
| Remote municipality detection | API call to geographic service | Static curated list in `constants.ts` | The business maintains this list manually. A static list is instantly checkable with zero latency. |
| Cedula validation | Colombian cedula validator | Simple numeric string check (8-10 digits) | The cedula field is optional and used only as reference for logistics. Full validation would add complexity for zero business value. |
| Field completion logic | Separate completion checker per mode | Mode-aware `hasCriticalDataForMode()` function | Reuses existing infrastructure with a mode parameter. |

**Key insight:** This phase is about conversational flow changes, not infrastructure. Every technical building block already exists in the codebase. The challenge is wiring them together correctly.

## Common Pitfalls

### Pitfall 1: Breaking the Normal Flow

**What goes wrong:** Adding ofi inter detection breaks the normal (non-ofi-inter) data collection flow. The most likely bug: all customers get asked about ofi inter even when they provided a full address.

**Why it happens:** Route 2 (municipio-only) fires when it shouldn't, or the mode check fails to distinguish between modes.

**How to avoid:**
- Route 2 ONLY fires when municipio arrives WITHOUT direccion/barrio. If both arrive together, assume domicilio.
- Guard every ofi inter code path with `if (currentMode === 'collecting_data_inter')` checks.
- Test the normal flow (with address) end-to-end after changes.

**Warning signs:** Normal orders start getting "Deseas ofi inter?" prompts when customers have already provided their full address.

### Pitfall 2: hasCriticalData() Breaking Existing Flow

**What goes wrong:** Modifying `hasCriticalData()` to be mode-aware inadvertently breaks the non-ofi-inter path. This function is called in 3+ places (ingest-manager, somnio-agent, somnio-engine).

**Why it happens:** The function signature changes, or the mode parameter is not passed correctly through the call chain.

**How to avoid:**
- Create a NEW function `hasCriticalDataForMode(data, isOfiInter)` instead of modifying the existing one.
- Update callsites incrementally, passing mode from session state.
- Keep the original `hasCriticalData()` working for backward compatibility.

**Warning signs:** Normal 8-field completion stops auto-triggering ofrecer_promos.

### Pitfall 3: Timer System Confusion with New State

**What goes wrong:** The timer system (Inngest) doesn't recognize `collecting_data_inter` as a valid data-collection state, causing timers to not start or not cancel properly.

**Why it happens:** Timer workflows check for `currentMode === 'collecting_data'` hardcoded.

**How to avoid:**
- Create a helper: `isCollectingData(mode) => mode === 'collecting_data' || mode === 'collecting_data_inter'`
- Replace all hardcoded `=== 'collecting_data'` checks with this helper.
- The SOMNIO_TRANSITIONS config already controls which states can transition where; just add the new state.

**Warning signs:** Timer never fires for ofi inter orders, or fires when it shouldn't.

### Pitfall 4: OrderCreator Expecting direccion

**What goes wrong:** The `hasRequiredContactData()` check in somnio-engine.ts line 504 requires 'direccion' and 'ciudad' and 'departamento'. For ofi inter, direccion is not collected, so order creation fails.

**Why it happens:** The check is hardcoded: `['nombre', 'telefono', 'direccion', 'ciudad', 'departamento']`.

**How to avoid:**
- Make `hasRequiredContactData()` mode-aware, or create a parallel check for ofi inter.
- For ofi inter: required = `['nombre', 'telefono', 'ciudad', 'departamento']` (no direccion).
- The OrderCreator's `buildShippingAddress()` must handle missing direccion gracefully.

**Warning signs:** Ofi inter orders fail silently at creation time; no order is created but no error is visible.

### Pitfall 5: State Transitions Not Bidirectional

**What goes wrong:** Customer confirms ofi inter but then says "mejor a domicilio" -- the system can't switch back.

**Why it happens:** SOMNIO_TRANSITIONS doesn't include `collecting_data_inter -> collecting_data` transition.

**How to avoid:**
- Add bidirectional transitions: `collecting_data_inter <-> collecting_data`.
- When switching, preserve compatible fields and update the mode.
- Test the "change of mind" scenario in both directions.

**Warning signs:** Customer gets stuck in ofi inter mode with no way out except handoff.

### Pitfall 6: Ingest System Completing Too Early for Ofi Inter

**What goes wrong:** The ingest system considers data "complete" with 8 fields (normal mode), but ofi inter needs only 7. If we don't change the completion threshold, ofi inter never auto-triggers promos. Conversely, if we change it too broadly, normal mode triggers too early.

**Why it happens:** `hasCriticalData()` and `MIN_FIELDS_FOR_AUTO_PROMO = 8` are global constants.

**How to avoid:**
- The auto-promo trigger in TransitionValidator and IngestManager must check the current mode.
- For `collecting_data_inter`: complete at 6-7 fields (4 critical + 2-3 additional).
- For `collecting_data`: keep existing 8 fields (5 critical + 3 additional).

### Pitfall 7: System Prompt Not Updated

**What goes wrong:** Claude's intent detector or data extractor doesn't know about ofi inter, so it misclassifies ofi inter phrases or fails to extract cedula.

**Why it happens:** The system prompts in `prompts.ts` define the field list and classification rules. If not updated, Claude will try to extract direccion even in ofi inter mode.

**How to avoid:**
- Update `DATA_EXTRACTOR_PROMPT` to include cedula as an extractable field.
- Add ofi inter awareness to the intent detector prompt (Route 1 phrases).
- Add context about the current mode so Claude knows whether to ask for direccion or cedula.

## Code Examples

### Example 1: Ofi Inter Phrase Detection (Route 1)

```typescript
// Source: New function in somnio-agent.ts or separate ofi-inter-detector.ts

const OFI_INTER_PATTERNS = [
  // Direct mentions
  /\bofi\s*inter\b/i,
  /\boficina\s*(de\s+)?inter(rapidisimo)?\b/i,
  /\breco[gj]o?\s*en\s*inter\b/i,
  /\brecoger?\s*en\s*inter\b/i,

  // Variations (from CONTEXT.md Claude's discretion)
  /\bquiero\s+ir\s+a\s+recoger\b/i,
  /\bpuedo\s+pasar\s+a\s+buscar\b/i,
  /\bno\s+necesito\s+domicilio\b/i,
  /\benvi[ae]\s+a\s+la\s+oficina\b/i,
  /\brecoger\s+en\s+(la\s+)?oficina\b/i,
  /\brecojo\s+en\s+(la\s+)?oficina\b/i,
  /\brecoger\s+en\s+(la\s+)?transportadora\b/i,
]

export function detectOfiInterMention(message: string): boolean {
  const normalized = message.toLowerCase().trim()
  return OFI_INTER_PATTERNS.some(pattern => pattern.test(normalized))
}
```

### Example 2: Remote Municipality List (Route 3)

```typescript
// Source: constants.ts - curated list based on business experience

/**
 * Municipalities where office pickup (ofi inter) is common.
 * Maintained manually based on business experience.
 * When a customer mentions one of these, the agent asks about ofi inter.
 */
export const REMOTE_MUNICIPALITIES = new Set([
  // Examples - to be curated with business team
  'leticia',
  'mitu',
  'mitú',
  'inirida',
  'inírida',
  'puerto carreno',
  'puerto carreño',
  'san jose del guaviare',
  'san josé del guaviare',
  'mocoa',
  'quibdo',
  'quibdó',
  // Add more based on business data...
])

export function isRemoteMunicipality(city: string): boolean {
  if (!city) return false
  const normalized = city.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const withAccents = city.trim().toLowerCase()
  return REMOTE_MUNICIPALITIES.has(normalized) || REMOTE_MUNICIPALITIES.has(withAccents)
}
```

### Example 3: State Machine Addition

```typescript
// Source: config.ts - add new state and transitions

export const SOMNIO_STATES = [
  'bienvenida',
  'conversacion',
  'collecting_data',
  'collecting_data_inter',  // NEW: ofi inter data collection mode
  'ofrecer_promos',
  'resumen',
  'confirmado',
  'pedido_sinpack',
  'pedido_pendiente',
  'handoff',
] as const

export const SOMNIO_TRANSITIONS: StateTransitions = {
  bienvenida: ['conversacion', 'collecting_data', 'collecting_data_inter', 'handoff'],
  conversacion: ['conversacion', 'collecting_data', 'collecting_data_inter', 'handoff'],

  // Bidirectional transitions between normal and ofi inter
  collecting_data: ['collecting_data', 'collecting_data_inter', 'ofrecer_promos', 'handoff'],
  collecting_data_inter: ['collecting_data_inter', 'collecting_data', 'ofrecer_promos', 'handoff'],

  ofrecer_promos: ['resumen', 'pedido_sinpack', 'handoff'],
  resumen: ['confirmado', 'pedido_pendiente', 'ofrecer_promos', 'handoff'],
  confirmado: ['conversacion', 'handoff'],
  pedido_sinpack: ['conversacion', 'handoff'],
  pedido_pendiente: ['conversacion', 'handoff'],
  handoff: [],
}
```

### Example 4: Mode-Aware Completion Check

```typescript
// Source: data-extractor.ts - add alongside existing functions

// Ofi inter critical fields (4: without direccion)
export const OFI_INTER_CRITICAL_FIELDS = [
  'nombre',
  'telefono',
  'ciudad',      // acts as "municipio"
  'departamento',
] as const

// Ofi inter additional fields (3: cedula optional)
export const OFI_INTER_ADDITIONAL_FIELDS = [
  'apellido',
  'cedula_recoge',
  'correo',
] as const

/**
 * Check if data is complete for ofi inter mode.
 * 4 critical fields required + at least 2 additional (cedula is optional).
 */
export function hasCriticalDataInter(data: Record<string, string>): boolean {
  for (const field of OFI_INTER_CRITICAL_FIELDS) {
    if (!data[field] || data[field].trim() === '') {
      return false
    }
  }

  let additionalCount = 0
  for (const field of OFI_INTER_ADDITIONAL_FIELDS) {
    if (data[field] && data[field].trim() !== '') {
      additionalCount++
    }
  }

  // Need at least 2 additional fields (7 total minimum = 4 critical + 2 additional + cedula optional)
  // Actually per CONTEXT: 7 fields = nombre, apellido, telefono, cedula, municipio, departamento, correo
  // But cedula is optional. So minimum is 6 (if no cedula) or 7 (with cedula).
  // To match the 8-field logic: require 4 critical + at least 2 additional = 6 fields minimum.
  return additionalCount >= 2
}

/**
 * Mode-aware wrapper. Use this everywhere instead of hasCriticalData directly.
 */
export function isDataComplete(data: Record<string, string>, mode: string): boolean {
  if (mode === 'collecting_data_inter') {
    return hasCriticalDataInter(data)
  }
  return hasCriticalData(data)
}
```

### Example 5: Collecting Data Helper

```typescript
// Source: constants.ts or new utility

/**
 * Check if a session mode is a data-collection mode.
 * Used by timer system and ingest logic.
 */
export function isCollectingDataMode(mode: string): boolean {
  return mode === 'collecting_data' || mode === 'collecting_data_inter'
}
```

### Example 6: OrderCreator Adaptation for Ofi Inter

```typescript
// Source: order-creator.ts - modify createContactAndOrder

// In createContactAndOrder(), determine if ofi inter from session state
async createContactAndOrder(
  data: ContactData,
  pack: PackSelection,
  sessionId: string,
  priceOverride?: number,
  isOfiInter?: boolean,       // NEW parameter
  cedulaRecoge?: string        // NEW parameter
): Promise<OrderCreationResult> {
  // ... existing code ...

  // Step 2: Create order with ofi inter metadata
  const description = isOfiInter
    ? `OFI INTER | Cedula recoge: ${cedulaRecoge || 'No proporcionada'}`
    : data.indicaciones_extra || undefined

  const shippingAddress = isOfiInter
    ? `OFICINA INTER - ${data.ciudad}, ${data.departamento}`
    : this.buildShippingAddress(data)

  // ... rest of order creation ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `collecting_data` mode | Mode-based field sets | Phase 35 | Enables bifurcated flows without duplicating pipeline |
| Fixed 8-field completion | Mode-aware completion checking | Phase 35 | Different field requirements per delivery type |
| Address always required | Address optional (ofi inter) | Phase 35 | Supports office pickup workflow |

**Nothing deprecated** -- this phase adds capability without removing any existing features.

## Critical Implementation Sequence

The following order of implementation minimizes risk of breaking the existing flow:

1. **Constants + types first** -- Add `collecting_data_inter` state, field definitions, remote municipalities list. No behavior change yet.
2. **State machine update** -- Add transitions in config.ts. No behavior change yet (state is never entered).
3. **Detection functions** -- Add `detectOfiInterMention()`, `isRemoteMunicipality()`, `isCollectingDataMode()`. Pure functions, no side effects.
4. **Data completion** -- Add `hasCriticalDataInter()` and `isDataComplete()`. Existing `hasCriticalData()` unchanged.
5. **Data extractor prompt** -- Update to include cedula field. Does not break normal flow.
6. **Ingest system** -- Add Route 2 (municipio-only detection). Guarded by mode check.
7. **SomnioAgent** -- Add Route 1 (direct mention) and Route 3 (remote municipality). Connect all routes.
8. **Orchestrator** -- Handle `collecting_data_inter` mode for template selection and transitions.
9. **OrderCreator** -- Adapt for ofi inter orders. New parameters, backward compatible.
10. **Integration testing** -- Test both normal and ofi inter flows end-to-end.

## Open Questions

1. **Exact remote municipality list**
   - What we know: CONTEXT.md says "lista curada basada en experiencia del negocio"
   - What's unclear: Which specific municipalities should be in the initial list
   - Recommendation: Start with departamento capitals of remote departments (Leticia, Mitu, Inirida, Puerto Carreno, San Jose del Guaviare, Mocoa, Quibdo) and expand based on business feedback. Store as a Set in constants.ts for O(1) lookup.

2. **Cedula validation depth**
   - What we know: Colombian cedulas are 8-10 digit numbers
   - What's unclear: Whether to validate format beyond "is numeric"
   - Recommendation: Simple regex check (`/^\d{6,10}$/`) -- the field is optional and used as reference only. Over-validation would frustrate customers.

3. **Ingest timer behavior for ofi inter**
   - What we know: Normal mode timer uses 6min (partial data) / 10min (no data)
   - What's unclear: Should ofi inter use the same durations?
   - Recommendation: Same durations. The timer logic is mode-agnostic -- it cares about "has data arrived?" not "which fields are we collecting."

4. **Template set for collecting_data_inter**
   - What we know: Templates are stored in DB and selected by intent + state
   - What's unclear: Do we need new templates, or can we reuse existing ones?
   - Recommendation: Create ofi inter-specific templates that DON'T mention direccion/barrio and DO mention cedula. The TemplateManager already supports mode-based template selection.

5. **municipio vs ciudad field name internally**
   - What we know: The system uses `ciudad` internally for the city field. CONTEXT.md says ofi inter collects "municipio."
   - What's unclear: Should we create a separate `municipio` field or reuse `ciudad`?
   - Recommendation: Reuse `ciudad` field. A "municipio" IS a city in the Colombian context. Creating a separate field would require changes to normalizers, contacts schema, and order creation -- all for zero functional benefit. The prompt can use "municipio" in conversation while storing in `ciudad`.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all 25+ files in `src/lib/agents/somnio/`
- Database schema from `supabase/migrations/` (orders table structure confirmed)
- Session state types from `src/lib/agents/types.ts`
- Domain layer from `src/lib/domain/orders.ts` (confirmed description and custom_fields columns)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions (user-provided, locked)
- Existing patterns from Phase 14, 15.5, 16.1, 30, 33, 34 (codebase history)

### Tertiary (LOW confidence)
- Remote municipality list (needs business validation)
- Exact ofi inter detection phrases beyond those in CONTEXT.md (needs real conversation data)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components are existing codebase, no new libraries
- Architecture: HIGH - patterns directly observable in code, well-documented
- Field definitions: HIGH - confirmed from schema + domain layer + data extractor
- Detection patterns: MEDIUM - CONTEXT.md provides core phrases, variations need testing
- Remote municipality list: LOW - needs business team input for initial curation
- Timer behavior: HIGH - existing timer system is well-documented and mode-agnostic

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, 30-day validity)
