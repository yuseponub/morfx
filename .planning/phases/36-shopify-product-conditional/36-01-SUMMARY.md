---
phase: 36-shopify-product-conditional
plan: 01
subsystem: automations
tags: [action-executor, product-mapping, shopify, conditional-logic]
depends_on: []
provides: [resolveConditionalProducts, productMappings-param, 3-mode-product-resolution]
affects: [36-02]
tech-stack:
  added: []
  patterns: [numeric-normalization, conditional-mapping, graceful-degradation]
key-files:
  created: []
  modified:
    - src/lib/automations/action-executor.ts
    - src/lib/automations/constants.ts
decisions:
  - productMappings takes precedence over copyProducts when both present
  - Numeric normalization via parseFloat for decimal comparison (109994.80 vs 109994.8)
  - Product not found returns empty array (graceful degradation, no throw)
  - Empty match result treated as undefined (no products) for domain layer
  - product_mapping param type registered for custom UI in Plan 02
metrics:
  duration: ~4 minutes
  completed: 2026-02-25
---

# Phase 36 Plan 01: Conditional Product Mapping Backend Summary

**One-liner:** resolveConditionalProducts helper with numeric normalization + 3-mode executeCreateOrder (no products / copy trigger / conditional mapping) + ACTION_CATALOG productMappings param.

## What Was Done

### Task 1: resolveConditionalProducts helper + 3-mode executeCreateOrder
- Added `resolveConditionalProducts()` async helper function in the CRM Order Actions section
- Implements numeric normalization: `parseFloat(source) === parseFloat(when)` for decimal comparison, string fallback for non-numeric values
- Fetches CRM product by ID from products table using `createAdminClient()` (bypass RLS)
- Returns product with CRM catalog price (`product.price`), not Shopify's ugly decimal
- Graceful degradation: product not found logs warning and returns empty array
- Updated `executeCreateOrder` with 3 mutually exclusive modes:
  - Mode 3 (highest priority): `productMappings` - conditional mapping to CRM catalog product
  - Mode 2: `copyProducts` - existing copy-from-trigger behavior (preserved unchanged)
  - Mode 1 (default): no products - products remains undefined

### Task 2: ACTION_CATALOG productMappings param
- Added `productMappings` param to `create_order` entry in ACTION_CATALOG
- Type: `product_mapping` (new custom param type for Plan 02 UI)
- Positioned after `copyProducts`, before `copyTags`
- Zero-import rule preserved in constants.ts

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `24679ad` | feat(36-01): add resolveConditionalProducts helper + 3-mode product resolution |
| 2 | `0537b86` | feat(36-01): register productMappings param in ACTION_CATALOG |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `npx tsc --noEmit` - passes (only pre-existing vitest type errors)
2. `resolveConditionalProducts` function exists with numeric normalization
3. `executeCreateOrder` checks productMappings first, then copyProducts, then no products
4. `productMappings` param exists in ACTION_CATALOG create_order entry
5. Zero imports in constants.ts preserved

## Key Decisions

1. **Numeric normalization via parseFloat**: `parseFloat("109994.80") === parseFloat("109994.8")` returns `true`. Falls back to string comparison for non-numeric values.
2. **Precedence order**: productMappings > copyProducts > no products. If productMappings is set, copyProducts is ignored even if also set.
3. **Graceful degradation**: Product not found or no mapping match both result in order with no products (not an error).
4. **CRM catalog price**: The resolved product uses `product.price` from the CRM products table, not Shopify's decimal price.

## Next Phase Readiness

Plan 02 (UI) is unblocked:
- `product_mapping` param type exists in ACTION_CATALOG for the automation builder to discover
- `resolveConditionalProducts` is ready to receive the `productMappings` object structure from the UI
- Expected format: `{ source: "{{shopify.total}}", mappings: [{ when: "109994.8", productId: "uuid" }], defaultProductId?: "uuid" }`
