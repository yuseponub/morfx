---
phase: quick-033
plan: 01
subsystem: orders-whatsapp
tags: [closure-tags, pipeline, order-filtering, whatsapp-indicators]
dependency-graph:
  requires: [phase-09-orders, phase-07-whatsapp]
  provides: [pipeline-closure-tag-rules, active-order-filtering-by-tag]
  affects: [whatsapp-conversation-list, order-indicators]
tech-stack:
  added: []
  patterns: [closure-tag-rules, pure-function-filtering]
key-files:
  created:
    - supabase/migrations/20260326_pipeline_closure_tags.sql
    - src/lib/orders/closure-tags.ts
    - src/app/(dashboard)/crm/configuracion/estados-pedido/components/closure-tag-config.tsx
  modified:
    - src/app/actions/order-states.ts
    - src/app/actions/whatsapp.ts
    - src/lib/whatsapp/types.ts
    - src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx
decisions:
  - "closure-tags uses admin client for server-side reads (bypass RLS)"
  - "isOrderClosedByTag is a pure function (no DB calls) for testability"
  - "getOrdersForContacts filters closure tags inline (not post-query) to avoid including closed orders in map"
  - "OrderSummary.tag_ids is optional for backward compat"
  - "Duplicate check 23505 returns user-friendly error"
metrics:
  duration: 6m
  completed: 2026-03-26
---

# Quick 033: Tag de Cierre por Pipeline - Estados de Pedido

Reglas configurables pipeline+tag que marcan pedidos como cerrados sin moverlos de etapa. Filtrado aplicado en getActiveContactOrders y getOrdersForContacts para excluir de indicadores WhatsApp.

## Tasks Completed

### Task 1: Migration + shared closure logic + server actions
- **Migration**: `pipeline_closure_tags` table con workspace_id FK, pipeline_id FK, tag_id FK, unique constraint, RLS policy, workspace index
- **Shared logic** (`closure-tags.ts`): `getClosureTagRules(workspaceId)` fetches rules via admin client; `isOrderClosedByTag(order, rules)` pure function checks pipeline+tag match
- **Server actions**: `getClosureTagConfigs()` with pipeline/tag name joins, `addClosureTagConfig()` with duplicate detection (23505), `removeClosureTagConfig()`
- **Commit**: `0a69fed`

### Task 2: UI config + active order filtering
- **ClosureTagConfigPanel**: Client component with existing rules list, pipeline+tag selects, add/remove with toast feedback, duplicate prevention
- **Page integration**: Added `getClosureTagConfigs()` and `getTagsForScope('orders')` to Promise.all, renders panel below OrderStateList
- **getContactOrders**: Now includes `order_tags(tag:tags(id))` in select, extracts `tag_ids` into OrderSummary
- **getActiveContactOrders**: Fetches closure rules, filters orders where `isOrderClosedByTag` returns true
- **getOrdersForContacts**: Same — fetches closure rules once, filters inline during batch processing
- **OrderSummary type**: Added optional `tag_ids?: string[]`
- **Commit**: `c5f9ec3`

## Deviations from Plan

None - plan executed exactly as written.

## Important Notes

**MIGRATION MUST BE APPLIED BEFORE DEPLOY**: The migration file `supabase/migrations/20260326_pipeline_closure_tags.sql` must be run in production Supabase before pushing code to Vercel. The code references the `pipeline_closure_tags` table which won't exist until the migration is applied.

## Verification

1. TypeScript compiles without errors for all modified files
2. Migration file creates proper table with constraints and RLS
3. UI renders in estados-pedido config page with add/remove
4. Active order filtering excludes orders matching closure tag rules
5. Batch order filtering (conversation list) excludes matching orders
