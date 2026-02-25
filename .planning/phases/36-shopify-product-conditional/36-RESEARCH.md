# Phase 36: Shopify Product Conditional Assignment - Research

**Researched:** 2026-02-25
**Domain:** Automation action params extension + conditional product mapping
**Confidence:** HIGH

## Summary

This phase adds a new product assignment mode to the existing `create_order` automation action. Instead of blindly copying Shopify line items (with ugly decimal prices from discount division), users can define conditional mappings that map a trigger variable value to a specific CRM catalog product with clean CRM pricing.

The codebase already has all the foundational patterns needed:
- **Conditional mapping pattern** exists in template variable resolution (WhatsApp template vars support `type: 'conditional'` with `source`, `mappings`, and `default`)
- **CRM product catalog** exists in `products` table with `id`, `sku`, `title`, `price`, `is_active`
- **Domain `createOrder()`** already accepts a `products[]` array with `productId`, `sku`, `title`, `unitPrice`, `quantity`
- **Variable resolution** already resolves `{{shopify.total}}` and other trigger variables before action execution

The work is primarily: (1) define a new param type for conditional product mapping in `ACTION_CATALOG`, (2) build the UI component for configuring it, (3) resolve the mapping in `executeCreateOrder()` by fetching the CRM product and passing it to domain.

**Primary recommendation:** Reuse the existing `ConditionalData` UI pattern from template variables but adapt it for product selection (dropdown from CRM catalog instead of free-text "then" field). The action executor resolves the mapping at runtime by fetching the matched product from the `products` table.

## Standard Stack

No new libraries needed. This feature is built entirely with existing project stack:

### Core (already in project)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Next.js 15 + React 19 | App framework | Existing |
| Supabase | DB access for products table | Existing |
| Tailwind CSS | UI styling | Existing |
| shadcn/ui (Select, Input, Button, Switch, Label) | UI components | Existing |

### No new dependencies needed
This is a pure feature extension using existing patterns. No additional packages required.

## Architecture Patterns

### Data Flow Overview

```
1. USER CONFIGURES (UI):
   Automation wizard → create_order action params → stored in DB as JSONB

2. TRIGGER FIRES (Runtime):
   Shopify webhook → Inngest event → automation runner → executeAction()

3. VARIABLE RESOLUTION (Already exists):
   executeAction() → resolveVariablesInObject(params, context)
   → {{shopify.total}} becomes "109994.80"

4. PRODUCT MAPPING (NEW):
   executeCreateOrder() reads productMappings param
   → resolves source variable against variableContext
   → matches value against mappings
   → fetches CRM product by ID from products table
   → passes product array to domainCreateOrder()
```

### Pattern 1: Three Product Modes in create_order

The `create_order` action params will support three mutually exclusive modes:

```typescript
// Mode 1: No products (existing - default)
{ copyProducts: false, productMappings: undefined }

// Mode 2: Copy from Shopify (existing)
{ copyProducts: true, productMappings: undefined }

// Mode 3: Conditional mapping (NEW)
{ copyProducts: false, productMappings: ProductMappingConfig }
```

**Data structure for `productMappings` param:**

```typescript
interface ProductMappingConfig {
  source: string           // Variable path, e.g., "{{shopify.total}}"
  mappings: Array<{
    when: string           // Value to match (string comparison)
    productId: string      // CRM product UUID from products table
    quantity: number       // Default: 1
  }>
  defaultProductId?: string  // Optional fallback product
  defaultQuantity?: number   // Default: 1
}
```

This mirrors the existing `ConditionalData` pattern but:
- `then` (free text) becomes `productId` (UUID from catalog)
- Adds `quantity` field per mapping (starts at 1, expandable later)
- Product title, SKU, and price are NOT stored in the mapping -- they are fetched at runtime from the `products` table

### Pattern 2: Runtime Resolution in executeCreateOrder

```typescript
// In executeCreateOrder(), AFTER variable resolution:
async function resolveProductMappings(
  config: ProductMappingConfig,
  variableContext: Record<string, unknown>,
  workspaceId: string
): Promise<Array<{ productId: string; sku: string; title: string; unitPrice: number; quantity: number }>> {

  // 1. Resolve the source variable
  const resolvedSource = resolveVariables(config.source, variableContext)

  // 2. Find matching mapping (string comparison - existing pattern)
  const match = config.mappings.find(m => String(m.when) === String(resolvedSource))

  // 3. Determine product IDs to fetch
  const productId = match?.productId ?? config.defaultProductId
  if (!productId) return [] // No match, no default = no products

  const quantity = match?.quantity ?? config.defaultQuantity ?? 1

  // 4. Fetch product from CRM catalog
  const supabase = createAdminClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, sku, title, price')
    .eq('id', productId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single()

  if (!product) return [] // Product not found or inactive

  return [{
    productId: product.id,
    sku: product.sku,
    title: product.title,
    unitPrice: product.price, // CRM price, NOT Shopify price
    quantity,
  }]
}
```

### Pattern 3: UI Component Reuse

The existing `TemplateVarRow` component (lines 202-361 of actions-step.tsx) provides the conditional mapping UX pattern:
- Source variable input with VariablePicker
- "When X -> Then Y" rows with add/remove
- Default fallback value

For this phase, adapt it to:
- Source variable input with VariablePicker (IDENTICAL)
- "When X -> Product Y (from dropdown)" rows with add/remove (ADAPT: replace text input with product Select)
- Default fallback product (ADAPT: replace text input with product Select)

### Pattern 4: Products Data Flow to Wizard

Currently the automation wizard does NOT receive products. The data flow needs:

```
1. nueva/page.tsx: getActiveProducts() + pass to wizard
2. AutomationWizard: Accept products prop + pass to ActionsStep
3. ActionsStep: Accept products prop + pass to ActionCard
4. ActionCard: Pass to ActionParamField or custom ProductMappingEditor
```

### Anti-Patterns to Avoid

- **Storing product data in the mapping:** Do NOT store title/price/SKU in the mapping config. Always fetch fresh from the products table at execution time. This ensures price changes in the catalog are reflected immediately.
- **Using float comparison for `when` values:** Use `String(value) === String(when)` (existing pattern). Float equality is unreliable.
- **Creating a new action type:** This is NOT a new action. It is a new param on the existing `create_order` action.
- **Modifying `domain/orders.ts`:** The domain layer already accepts the right product format. No changes needed there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conditional matching logic | Custom matching algorithm | `String(a) === String(b)` pattern from template vars | Consistency with existing codebase; user expects same behavior |
| Product selector UI | Custom dropdown | shadcn `Select` component already used throughout | Consistent UX |
| Variable resolution | Custom parsing | Existing `resolveVariables()` from variable-resolver.ts | Already handles all variable paths |
| Admin DB access | Custom auth flow | `createAdminClient()` | Standard pattern for automation executor (runs from Inngest, no user session) |

## Common Pitfalls

### Pitfall 1: Variable Resolution Timing
**What goes wrong:** The `productMappings.source` field contains `{{shopify.total}}` but the variable resolution in `executeAction()` (line 98-101) already resolves ALL string values in params BEFORE calling `executeCreateOrder()`. So by the time `executeCreateOrder()` sees the source field, it's already resolved to `"109994.80"`.

**Why it happens:** `resolveVariablesInObject()` recursively resolves all strings in the params object.

**How to avoid:** Two options:
1. Let it resolve naturally (source becomes the resolved value) and match against it directly -- this is the simplest approach since the mapping comparison is `String(resolved) === String(when)`.
2. If nested objects (like `productMappings`) should NOT be pre-resolved, handle them specially.

**Recommendation:** Option 1 is correct. After `resolveVariablesInObject()`, `params.productMappings.source` will be the resolved value (e.g., `"109994.80"`). The `when` values are plain strings. Match them directly with `String() === String()`. This is exactly how template variable conditionals work (see action-executor.ts lines 698-699 where `String(m.when) === String(cond.source)` uses the already-resolved source).

### Pitfall 2: Decimal String Comparison
**What goes wrong:** Shopify total is `"109994.80"` but user types `109994.8` as the "when" value. `"109994.80" !== "109994.8"`.

**Why it happens:** Shopify sends trailing zeros, users omit them.

**How to avoid:** Normalize both sides: try `parseFloat(a) === parseFloat(b)` when both are numeric, fall back to string comparison. OR document to users that they must enter the exact value (including decimals).

**Recommendation:** Add normalization: if both values parse as valid numbers, compare as numbers. Otherwise compare as strings. This is a small enhancement over the template variable pattern but necessary for the Shopify price use case.

### Pitfall 3: Product Deleted or Deactivated Between Configuration and Execution
**What goes wrong:** User configures mapping to product X. Later, product X is deleted or deactivated. Automation runs and can't find the product.

**How to avoid:** Handle gracefully in the executor -- if product lookup returns null, log a warning and either skip (no products) or use default. Don't throw an error that kills the entire automation execution.

### Pitfall 4: UI Needs Products Data But Wizard Doesn't Pass It
**What goes wrong:** The `ActionCard` component needs the list of active products to render the product selector dropdown, but the automation wizard currently only receives pipelines, tags, and templates.

**How to avoid:** Add `products` to the data flow: page.tsx -> AutomationWizard -> ActionsStep -> ActionCard. Use existing `getActiveProducts()` server action.

### Pitfall 5: copyProducts and productMappings Conflict
**What goes wrong:** If both `copyProducts: true` AND `productMappings` are set, the executor would create duplicate products.

**How to avoid:** Make them mutually exclusive in the UI (radio/select for product mode). In the executor, `productMappings` takes precedence over `copyProducts` if both are somehow set.

## Code Examples

### Example 1: Updated executeCreateOrder with productMappings

```typescript
// In action-executor.ts, inside executeCreateOrder():
async function executeCreateOrder(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const pipelineId = String(params.pipelineId || '')
  const stageId = params.stageId ? String(params.stageId) : undefined
  const contactId = context.contactId

  if (!pipelineId) throw new Error('pipelineId is required for create_order')
  if (!contactId) throw new Error('No contactId available in trigger context')

  // Product resolution: 3 modes
  let products: Array<{ productId?: string | null; sku: string; title: string; unitPrice: number; quantity: number }> | undefined

  if (params.productMappings && typeof params.productMappings === 'object') {
    // Mode 3: Conditional product mapping
    const config = params.productMappings as {
      source: string  // Already resolved by resolveVariablesInObject
      mappings: Array<{ when: string; productId: string; quantity?: number }>
      defaultProductId?: string
      defaultQuantity?: number
    }

    products = await resolveConditionalProducts(config, workspaceId)
  } else if (params.copyProducts && Array.isArray(context.products)) {
    // Mode 2: Copy from trigger (existing)
    products = (context.products as Array<{ sku: string; title: string; quantity: number; price: string; discounted_price?: string }>).map(p => ({
      sku: p.sku || '',
      title: p.title,
      unitPrice: parseFloat(p.discounted_price || p.price) || 0,
      quantity: p.quantity,
    }))
  }
  // Mode 1: No products (products remains undefined)

  // ... rest of the function unchanged ...
}
```

### Example 2: Product Mapping Resolution Function

```typescript
async function resolveConditionalProducts(
  config: {
    source: string  // Already resolved to actual value
    mappings: Array<{ when: string; productId: string; quantity?: number }>
    defaultProductId?: string
    defaultQuantity?: number
  },
  workspaceId: string
): Promise<Array<{ productId: string; sku: string; title: string; unitPrice: number; quantity: number }>> {

  // Find matching mapping
  // Normalize: if both are valid numbers, compare as numbers; else string comparison
  const sourceNum = parseFloat(config.source)
  const match = config.mappings.find(m => {
    const whenNum = parseFloat(m.when)
    if (!isNaN(sourceNum) && !isNaN(whenNum)) {
      return sourceNum === whenNum
    }
    return String(config.source) === String(m.when)
  })

  const productId = match?.productId ?? config.defaultProductId
  if (!productId) return []

  const quantity = match?.quantity ?? config.defaultQuantity ?? 1

  // Fetch product from CRM catalog
  const supabase = createAdminClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, sku, title, price')
    .eq('id', productId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single()

  if (!product) {
    console.warn(`[action-executor] Conditional product mapping: product ${productId} not found or inactive`)
    return []
  }

  return [{
    productId: product.id,
    sku: product.sku,
    title: product.title,
    unitPrice: product.price,  // CRM price, NOT Shopify
    quantity,
  }]
}
```

### Example 3: Stored Params Format (in DB JSONB)

```json
{
  "pipelineId": "uuid-pipeline",
  "stageId": "uuid-stage",
  "productMappings": {
    "source": "{{shopify.total}}",
    "mappings": [
      { "when": "77900", "productId": "uuid-product-1x", "quantity": 1 },
      { "when": "109994.8", "productId": "uuid-product-2x", "quantity": 1 },
      { "when": "139986.3", "productId": "uuid-product-3x", "quantity": 1 }
    ],
    "defaultProductId": null,
    "defaultQuantity": 1
  }
}
```

### Example 4: UI Mode Selector (Radio-style)

```tsx
// In ActionCard, custom section for create_order product mode:
type ProductMode = 'none' | 'copy' | 'conditional'

function getProductMode(params: Record<string, unknown>): ProductMode {
  if (params.productMappings) return 'conditional'
  if (params.copyProducts) return 'copy'
  return 'none'
}

// Render 3 radio options:
// - "Sin productos" (none)
// - "Copiar del trigger" (copy) — existing copyProducts toggle
// - "Asignar por condicion" (conditional) — new productMappings
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| copyProducts boolean toggle | 3-mode selector (none/copy/conditional) | Phase 36 | Adds conditional mapping option |

**Key insight:** The conditional mapping pattern (`source` + `mappings[]` + `default`) is already established in the codebase for template variables. This phase applies the same pattern to product assignment, making it familiar to both the code and the user.

## Files That Need Changes

### Backend (Core Logic)
| File | Change | Scope |
|------|--------|-------|
| `src/lib/automations/action-executor.ts` | Add `resolveConditionalProducts()` helper + update `executeCreateOrder()` to handle Mode 3 | ~40 lines new |
| `src/lib/automations/constants.ts` | Update `ACTION_CATALOG` create_order params to add `productMappings` param definition | ~5 lines |

### Frontend (UI)
| File | Change | Scope |
|------|--------|-------|
| `src/app/(dashboard)/automatizaciones/nueva/page.tsx` | Add `getActiveProducts()` call + pass to wizard | ~5 lines |
| `src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx` | Add `getActiveProducts()` call + pass to wizard | ~5 lines |
| `src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx` | Add `products` prop to WizardProps + pass to ActionsStep | ~8 lines |
| `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` | Add `products` prop + custom product mapping UI section for create_order | ~100-150 lines |

### No Changes Needed
| File | Why |
|------|-----|
| `src/lib/domain/orders.ts` | Already accepts `products[]` with `productId`, `sku`, `title`, `unitPrice`, `quantity` |
| `src/lib/automations/variable-resolver.ts` | Already resolves `{{shopify.total}}` correctly |
| `src/lib/automations/types.ts` | Action params are `Record<string, unknown>` -- no type change needed |
| Database (migrations) | No schema changes -- product mappings stored in existing `actions` JSONB column |

## Open Questions

1. **Should `productMappings` support multiple independent mappings (N products)?**
   - What we know: CONTEXT says "start with 1 product, architect for N"
   - Recommendation: The data structure above (`mappings[]` returns 1 product per match) naturally extends to N products. For v1, each match returns 1 product. For v2, the config could have multiple source variables or match multiple products. No structural change needed later.

2. **What if the source variable resolves to empty string or undefined?**
   - Recommendation: Treat as "no match." If there's a defaultProductId, use it. Otherwise, create order with no products. Log a warning.

3. **AI Builder awareness:**
   - The AI Automation Builder (Phase 18) reads `ACTION_CATALOG` programmatically. Adding the new param to the catalog will make it available to the AI builder automatically. However, the AI may need prompt guidance to understand when to use conditional mapping vs copyProducts.
   - Recommendation: Not blocking for Phase 36. Can be refined later.

## Sources

### Primary (HIGH confidence)
- `src/lib/automations/action-executor.ts` — Current executeCreateOrder implementation, template variable conditional resolution pattern (lines 693-699)
- `src/lib/automations/constants.ts` — ACTION_CATALOG structure, VARIABLE_CATALOG for Shopify triggers
- `src/lib/automations/variable-resolver.ts` — resolveVariables, resolveVariablesInObject, buildTriggerContext
- `src/lib/domain/orders.ts` — createOrder accepts products array with productId field
- `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` — ConditionalData interface, TemplateVarRow component, ActionParamField routing
- `src/app/actions/products.ts` — getActiveProducts server action
- `src/lib/orders/types.ts` — Product interface (id, sku, title, price)
- `supabase/migrations/20260129000003_orders_foundation.sql` — products table schema, order_products table schema
- `src/lib/shopify/webhook-handler.ts` — How total and products flow into trigger context

### Secondary (MEDIUM confidence)
- `.planning/phases/36-shopify-product-conditional/36-CONTEXT.md` — User requirements and decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing code patterns
- Architecture: HIGH - Direct codebase analysis of all involved files
- Pitfalls: HIGH - Identified from actual code flow analysis (variable resolution timing, decimal comparison, data flow gaps)

**Research date:** 2026-02-25
**Valid until:** Indefinite (internal codebase patterns, no external library concerns)
