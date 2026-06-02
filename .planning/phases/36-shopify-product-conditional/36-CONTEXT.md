# Phase 36: Shopify Product Conditional Assignment

## Problem Statement

When a Shopify order triggers an automation that creates a CRM order, the current `copyProducts` option copies Shopify products as-is with their Shopify prices (which include ugly decimal values from discount division, e.g., 109994.8). The user wants to **map Shopify orders to CRM catalog products** using conditional logic, so the CRM order gets clean products with CRM prices.

## Current Behavior

The "Create Order" automation action has a `copyProducts` toggle:
- **ON**: Copies Shopify line items directly (title, sku, quantity, discounted_price)
- **OFF**: Creates order with no products

There is NO way to assign a specific CRM catalog product based on Shopify data.

## Desired Behavior

New product assignment mode in the "Create Order" action: **Conditional Product Mapping**

### How it works:
1. User selects a **variable source** (e.g., `{{shopify.total}}`, `{{shopify.productos}}`, or any trigger variable)
2. User defines **conditional mappings**:
   - When value is X → assign CRM Product A (from catalog)
   - When value is Y → assign CRM Product B (from catalog)
   - Default → (none or fallback product)
3. The matched CRM product is added to the order with:
   - **Price from CRM catalog** (NOT from Shopify)
   - **Quantity: 1** (for now)

### Example:
```
Variable source: {{shopify.total}}
  77900     → "1X Melatonina+Magnesio" ($77,900 from CRM)
  109994.8  → "2X Melatonina+Magnesio" ($109,900 from CRM)
  139986.3  → "3X Melatonina+Magnesio" ($139,900 from CRM)
  Default   → (none)
```

## Architecture Requirements

- **Start with 1 product per order**, but architecture MUST allow multiple products in the future (e.g., cart orders with 2-3 different products)
- **Quantity starts at 1**, but prepared to be configurable later
- **Price comes from CRM catalog** — the product's price in the `products` table, not from Shopify
- The conditional comparison uses `String(value) === String(when)` (existing pattern from template variable conditionals)

## Files Involved

### Core Logic
- `src/lib/automations/action-executor.ts` — `executeCreateOrder()` needs to handle new product mode
- `src/lib/automations/types.ts` — Action params type for create_order
- `src/lib/domain/orders.ts` — `createOrder()` already accepts products array, no changes needed

### UI (Automation Builder)
- The action configuration UI for "create_order" needs a new product assignment section
- Needs a product selector (dropdown from CRM catalog)
- Needs conditional mapping UI (similar to existing template variable conditionals)

### Variable System
- `src/lib/automations/variable-resolver.ts` — May need to expose product-related variables
- `src/lib/automations/constants.ts` — Available variables for Shopify triggers already include `shopify.total`, `shopify.productos`, etc.

## Available Shopify Variables for Conditions
- `shopify.total` — Total order price (string, e.g., "109994.80")
- `shopify.productos` — Product list as formatted string
- `orden.valor` — Order value as number (e.g., 109994.8)
- Individual product fields in trigger context: `sku`, `title`, `quantity`, `price`, `discounted_price`

## Key Decisions from User
1. Price always from CRM catalog, never from Shopify
2. Start with 1 product, architect for N
3. Start with quantity 1, architect for configurable
4. Conditional matching pattern already exists in template variables (reuse same UX)

## Related Hotfixes (same session)
- `3479dd7` — fix: use discount_allocations instead of unreliable total_discount
- `c318b00` — fix: use discounted_price for copyProducts in create_order action
- `d4763a1` — reverted rounding (user didn't want it)
