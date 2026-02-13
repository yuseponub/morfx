# Phase 17 LEARNINGS: CRM Automations Engine

## Phase Overview
- **Goal**: Motor de automatizaciones configurable con triggers y acciones entre CRM, tareas y WhatsApp
- **Plans**: 10 plans across 6 waves
- **Commits**: 29 (27 code + 2 hotfixes)
- **Duration**: 1 session (~2026-02-13)
- **Result**: Approved with known gap (bot triggers → Phase 18)

## Architecture Decisions

### Trigger → Condition → Action Pattern
- **10 trigger types**, **11 action types**, **12 condition operators**
- Recursive AND/OR condition groups with 1-level nesting
- Sequential action execution with mid-execution disable check
- Cascade protection: MAX_CASCADE_DEPTH = 3

### Inngest Factory Pattern
- Single `createAutomationRunner()` factory creates 10 runner functions
- Each runner: load automations → filter by trigger config → evaluate conditions → execute actions
- `step.run()` for each action enables durable execution with retries

### Fire-and-Forget Trigger Emission
- Emitters never block the calling server action
- `(inngest.send as any)` type assertion needed for custom event types
- Dynamic import in webhook-handler.ts to avoid circular deps

### Variable Resolution
- Mustache-style `{{contacto.nombre}}` templates
- English camelCase event data mapped to Spanish dot-path namespaces
- 8 namespaces: contacto, orden, tag, mensaje, conversacion, tarea, campo, entidad

### Constants with Zero Imports
- `constants.ts` has NO imports from project files
- Prevents circular dependency chains
- All catalogs (triggers, actions, variables) self-contained

## Bugs Found & Fixed

### 1. Scroll Overflow (Hotfix)
- **Problem**: Dashboard layout has `overflow-hidden` on `<main>`, automation pages couldn't scroll
- **Fix**: Wrapped each page in `<div className="flex-1 overflow-y-auto">`
- **Pattern**: All new pages inside `(dashboard)/` need this wrapper

### 2. Timezone Inconsistency (Hotfix)
- **Problem**: `started_at` uses DB default `timezone('America/Bogota', NOW())` (Colombia time), but `completed_at` used `new Date().toISOString()` (UTC) — 5 hour gap
- **Fix**: Changed `completed_at` to `new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' })`
- **Pattern**: When storing timestamps from JS into TIMESTAMPTZ columns that use `timezone('America/Bogota', NOW())` as default, always use Colombia-localized time to match convention

### 3. URL Structure Deviation (Adapted)
- **Problem**: Plan 17-09 referenced `/crm/orders/[id]/` but project uses `/crm/pedidos/`
- **Fix**: Adapted to use existing `OrderSheet` component under `/crm/pedidos/`
- **Pattern**: Always check actual URL structure before planning UI integration

## Critical Discovery: Domain Layer Gap

### The Problem
During verification, user discovered that automations fired from CRM UI but NOT from WhatsApp bot. Root cause investigation revealed:

- **Server actions** (CRM UI) → call `emitX()` triggers ✅
- **Tool handlers** (Bot) → NO trigger emissions ❌
- **Action executor** (Automations) → call `emitX()` with cascade ✅

Tool handlers were built in Phase 14, before the automation system existed (Phase 17). They were never retrofitted.

### Full Audit Results
- **94 mutation functions** across 32 server action files
- **16 tool handlers** — NONE emit triggers
- **12+ missing tool handlers** (tasks, order CRUD, notes, custom fields)
- **2 dead triggers**: `emitWhatsAppKeywordMatch`, `emitTaskOverdue`
- **Action executor duplicates CRM logic** instead of using tool handlers
- **3 separate code paths** for sending WhatsApp messages

### Resolution
Created Phase 18: Domain Layer Foundation — `src/lib/domain/` as single source of truth for all mutations. This is the foundation for distributed AI.

## Patterns for Future Phases

### Dashboard Page Template
```tsx
// Every page inside (dashboard)/ needs this pattern:
<div className="flex-1 overflow-y-auto">
  <div className="container py-6 space-y-6">
    {/* page content */}
  </div>
</div>
```

### Timestamp Convention
- DB defaults: `timezone('America/Bogota', NOW())`
- JS code: `new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' })`
- Frontend display: `toLocaleString('es-CO', { timeZone: 'America/Bogota' })`

### Automation Trigger Wiring
- When adding a new mutation path, ALWAYS add corresponding `emitX()` call
- After Phase 18: use domain/ functions instead of direct DB + manual emit

## Files Created/Modified

### New Files (~30)
- `src/lib/automations/` — types, constants, condition-evaluator, variable-resolver, action-executor, trigger-emitter
- `src/app/actions/automations.ts` — 11 CRUD functions
- `src/inngest/functions/automation-runner.ts` — 10 runners via factory
- `src/app/(dashboard)/automatizaciones/` — 4 pages + 8 components
- `src/hooks/use-automation-badge.ts` — failure polling
- `supabase/migrations/20260213_automations.sql` — 2 tables + RLS + indexes

### Modified Files (~10)
- `src/inngest/events.ts` — AutomationEvents type
- `src/app/api/inngest/route.ts` — registered automation functions
- `src/app/actions/orders.ts` — 5 trigger emissions
- `src/app/actions/contacts.ts` — 4 trigger emissions
- `src/app/actions/tasks.ts` — 1 trigger emission
- `src/lib/whatsapp/webhook-handler.ts` — 1 trigger emission
- `src/components/layout/sidebar.tsx` — Automatizaciones nav
- `src/components/layout/mobile-nav.tsx` — Automatizaciones nav
- `src/lib/orders/types.ts` — source_order_id, RelatedOrder
