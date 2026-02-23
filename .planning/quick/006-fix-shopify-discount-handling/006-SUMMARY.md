---
phase: quick
plan: 006
subsystem: shopify-integration
tags: [shopify, discount, pricing, webhook, order-mapper]
dependency-graph:
  requires: []
  provides: ["discount-aware-shopify-pricing"]
  affects: ["automation-triggers", "order-total-value"]
tech-stack:
  added: []
  patterns: ["discount-formula: price - (total_discount / quantity)"]
key-files:
  created: []
  modified:
    - src/lib/shopify/order-mapper.ts
    - src/lib/shopify/webhook-handler.ts
decisions:
  - id: "006-01"
    decision: "unit_price = price - (total_discount / quantity) with '0' fallback for missing total_discount"
    rationale: "Shopify total_discount is per-line (already factored by quantity), so divide by quantity to get per-unit discount"
metrics:
  duration: "7m"
  completed: "2026-02-23"
---

# Quick Task 006: Fix Shopify Discount Handling Summary

Shopify discount-aware unit_price calculation and trigger payload enrichment with total_discount and discounted_price fields.

## What Was Done

### Task 1: Apply discount to unit_price in order-mapper.ts (aa7dc30)

Changed both `unit_price` assignments in `matchProducts()` from `parseFloat(item.price)` to `parseFloat(item.price) - (parseFloat(item.total_discount || '0') / item.quantity)`.

This applies to both the matched product case (catalog link) and the unmatched product case (no catalog link). The `|| '0'` fallback ensures orders without discounts produce identical results to before.

**Formula verification:**
- price="155800", total_discount="45900", qty=1 -> 155800 - (45900/1) = 109900 (correct)
- price="50000", total_discount="10000", qty=2 -> 50000 - (10000/2) = 45000 (correct)
- price="30000", total_discount="0", qty=3 -> 30000 - (0/3) = 30000 (no change)
- price="25000", total_discount=undefined, qty=1 -> 25000 - (0/1) = 25000 (safe fallback)

### Task 2: Include discount info in trigger product payloads (ed24ad0)

Updated all four trigger payload product arrays in webhook-handler.ts to include `total_discount` and `discounted_price`:

1. `processShopifyWebhook` auto-sync mode (line ~138)
2. `processShopifyWebhook` trigger-only mode (line ~190)
3. `processShopifyOrderUpdated` (line ~300)
4. `processShopifyDraftOrder` (line ~385)

Each product in the trigger payload now has:
- `price` - original pre-discount price (unchanged)
- `total_discount` - discount amount for the line item
- `discounted_price` - computed effective unit price after discount

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- TypeScript compiles without new errors (only pre-existing .next/types/validator.ts errors)
- `total_discount` appears in both unit_price calculations in order-mapper.ts
- `discounted_price` appears in all four trigger payloads in webhook-handler.ts
- No other files needed changes -- domain/orders.ts computes total_value from the unit_price it receives

## Impact

- **Order total_value**: Now correctly reflects discounted prices since domain layer sums from corrected unit_prices
- **Automation triggers**: Can use `discounted_price` for conditional logic (e.g., "if discounted_price < X, apply tag")
- **Backward compatibility**: Orders without discounts (total_discount=0 or undefined) produce identical results
