---
phase: quick
plan: 006
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/shopify/order-mapper.ts
  - src/lib/shopify/webhook-handler.ts
autonomous: true

must_haves:
  truths:
    - "Shopify orders with discounts produce correct unit_price (price - total_discount/quantity)"
    - "Order total_value reflects discounted prices, not pre-discount prices"
    - "Automation trigger product data includes discount info for downstream actions"
    - "Orders without discounts (total_discount=0) are unaffected"
  artifacts:
    - path: "src/lib/shopify/order-mapper.ts"
      provides: "Discount-aware unit_price calculation"
      contains: "total_discount"
    - path: "src/lib/shopify/webhook-handler.ts"
      provides: "Discount info in trigger product data"
      contains: "total_discount"
  key_links:
    - from: "src/lib/shopify/order-mapper.ts"
      to: "src/lib/domain/orders.ts"
      via: "unit_price flows to domain createOrder which sums total_value"
      pattern: "unitPrice.*unit_price"
---

<objective>
Fix Shopify discount handling so order products use post-discount prices.

Purpose: Shopify sends `line_item.price` (pre-discount) and `line_item.total_discount` (discount amount for the line). Currently `order-mapper.ts` ignores `total_discount` entirely, causing `unit_price` and consequently `total_value` to be inflated. Example: price=155800, total_discount=45900, qty=1 -> current unit_price=155800 (wrong), expected=109900 (correct).

Output: Corrected order-mapper.ts with discount-aware pricing + webhook-handler.ts with discount info in trigger payloads.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/shopify/order-mapper.ts
@src/lib/shopify/webhook-handler.ts
@src/lib/shopify/types.ts
@src/lib/domain/orders.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply discount to unit_price in order-mapper.ts</name>
  <files>src/lib/shopify/order-mapper.ts</files>
  <action>
    In the `matchProducts()` function, change both `unit_price` assignments (lines 111 and 120) from:
    ```
    unit_price: parseFloat(item.price)
    ```
    to:
    ```
    unit_price: parseFloat(item.price) - (parseFloat(item.total_discount || '0') / item.quantity)
    ```

    This applies to BOTH the matched product case (line 111) and the unmatched product case (line 120).

    The formula: `effective_unit_price = price - (total_discount / quantity)` because Shopify's `total_discount` is the TOTAL discount for the entire line item (already factored by quantity).

    Guard against missing `total_discount` with `|| '0'` fallback so orders without discounts are unaffected.

    Add a brief comment above each calculation: `// Apply line item discount (Shopify total_discount is for entire line)`
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors. Manually verify the formula:
    - price="155800", total_discount="45900", quantity=1 -> 155800 - (45900/1) = 109900
    - price="50000", total_discount="10000", quantity=2 -> 50000 - (10000/2) = 45000
    - price="30000", total_discount="0", quantity=3 -> 30000 - (0/3) = 30000 (no change)
    - price="25000", total_discount=undefined, quantity=1 -> 25000 - (0/1) = 25000 (safe fallback)
  </verify>
  <done>
    Both matched and unmatched product entries in matchProducts() calculate unit_price with discount applied. The `total_discount` field from ShopifyLineItem (already typed in types.ts) is consumed. Orders without discounts produce identical results to before.
  </done>
</task>

<task type="auto">
  <name>Task 2: Include discount info in trigger product payloads</name>
  <files>src/lib/shopify/webhook-handler.ts</files>
  <action>
    In webhook-handler.ts, the `products` array in trigger payloads currently maps line items as:
    ```
    products: order.line_items.map(li => ({ sku: li.sku, title: li.title, quantity: li.quantity, price: li.price }))
    ```

    Update ALL four occurrences of this pattern (lines 138, 184, 287, 365) to include `total_discount` and a computed `discounted_price`:
    ```
    products: order.line_items.map(li => ({
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      price: li.price,
      total_discount: li.total_discount || '0',
      discounted_price: String(parseFloat(li.price) - (parseFloat(li.total_discount || '0') / li.quantity)),
    }))
    ```

    The four locations are:
    1. `processShopifyWebhook` auto-sync mode (line ~138)
    2. `processShopifyWebhook` trigger-only mode (line ~184)
    3. `processShopifyOrderUpdated` (line ~287)
    4. `processShopifyDraftOrder` (line ~365) — use `draftOrder.line_items` here

    This ensures automation triggers have access to both the original price and the discounted price for conditional logic.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors. Search for all `.map(li =>` patterns in webhook-handler.ts and confirm each includes `total_discount` and `discounted_price`.
  </verify>
  <done>
    All four trigger payload product arrays include discount information. Downstream automations can access both original and discounted prices.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Grep `total_discount` in order-mapper.ts confirms it appears in both unit_price calculations
3. Grep `discounted_price` in webhook-handler.ts confirms it appears in all four trigger payloads
4. No other files need changes — domain/orders.ts already computes total_value from the unit_price it receives
</verification>

<success_criteria>
- Shopify orders with discounts produce correct unit_price = price - (total_discount / quantity)
- Order total_value (computed by domain layer) is correct because it sums from corrected unit_prices
- Automation trigger payloads include total_discount and discounted_price per product
- Orders without discounts produce identical results to before (zero discount = no change)
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/006-fix-shopify-discount-handling/006-SUMMARY.md`
</output>
