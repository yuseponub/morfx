# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos, automatizaciones inteligentes y agentes IA.
**Current focus:** Standalone: action-fields-audit (COMPLETE)

## Current Position

Phase: standalone/action-fields-audit (COMPLETE)
Plan: 04 of 04
Status: Phase complete
Last activity: 2026-02-17 — Completed action-fields-audit Plan 04 (AI Builder system prompt)

Progress: [##########] 100% MVP v1 | [##########] 100% MVP v2 | [##########] 100% WA perf | [######----] 67% CRM perf | [##########] 100% real-fields | [##########] 100% action-fields

### Standalone: Action Fields Audit (2026-02-17) — COMPLETE

4 plans total:
- Plan 01: Executor field pass-through fixes (COMPLETE + SUMMARY)
- Plan 02: Duplicate order toggle fixes (COMPLETE + SUMMARY)
- Plan 03: UI catalog + wizard — "Agregar campo" dropdown + field_select (COMPLETE + SUMMARY)
- Plan 04: AI Builder system prompt — dynamic param reference + usage notes (COMPLETE + SUMMARY)

### Standalone: Real Fields Fix (2026-02-17) — COMPLETE

3 plans total:
- Plan 01: Database migrations + TypeScript types (COMPLETE)
- Plan 02: Backend pipeline — Shopify, server actions, enrichment (COMPLETE)
- Plan 03: CRM UI — show and edit real fields (COMPLETE)

### Standalone: CRM Orders Performance (2026-02-17) — IN PROGRESS

3 plans total:
- Plan 01: Kanban scroll fix + paginated server actions (COMPLETE)
- Plan 02: Infinite scroll with IntersectionObserver (COMPLETE)
- Plan 03: Virtualization and final optimization (pending)

### Standalone: WhatsApp Performance (2026-02-17) — COMPLETE

4 plans executed:
- Plan 01: Realtime consolidation (4 channels → 1, surgical updates)
- Plan 02: Panel lazy-loading (closed by default, 2 channels → 1)
- Plan 03: User verification (approved)
- Plan 04: Infrastructure (Medium compute, spend cap off, Sao Paulo region)

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Complete (2026-02-16)

All 9 phases + 5 inserted phases completed:
- 83 plans executed across 14 phases
- 441 commits, 454 files, 121K lines added

## Performance Metrics

**Overall:**
- Total phases completed: 32 (29 milestone + 3 standalone)
- Total plans completed: 147
- Total execution time: ~22 days (2026-01-26 to 2026-02-17)

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.

- Added name and shipping_department to updateOrder automation fieldMappings (critical for field.changed triggers)
- Enrichment orderName fallback chain: order.name -> order.description -> truncated UUID (backward compat)
- Department auto-derived from city selection (not shown as separate input in forms)
- Order name labeled "Referencia" — users think of order refs as codes
- Contact detail prefers stored department over city-derived (Shopify compat)
- duplicate_order copy flags default to true via `!== false` for backward compat
- copyProducts toggle in create_order is opt-in only (prevents unintended product duplication)
- carrier/trackingNumber in create_order fall back to trigger context values if not set explicitly
- optional: true flag pattern for "Agregar campo" dropdown grouping in wizard UI
- Generic OPTION_LABELS handler replaces per-param entityType select; works for priority, language too
- field_select type with __custom fallback for update_field entity-aware field picker
- Dynamic formatParamQuickReference() replaces hardcoded param list in AI builder system prompt (prevents drift)

### Project Rules

Established in `CLAUDE.md`:
1. ALWAYS use America/Bogota timezone for dates
2. ALWAYS follow GSD workflow completely
3. ALL mutations through src/lib/domain/ (Regla 3)
4. ALWAYS push to Vercel before asking user to test

### Pending Todos

- Configure SMTP in Supabase for production email sending
- Mobile nav workspace switcher
- Apply migrations to Supabase (all pending, including 20260217000000_real_fields.sql)
- Configure 360dialog webhook URL and env vars
- Set WHATSAPP_WEBHOOK_SECRET env var in Vercel
- Configure Inngest env vars (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY)
- Delete deprecated files (SomnioEngine, SandboxEngine, /api/agents/somnio)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-17 18:42 COT
Stopped at: Completed action-fields-audit Plan 04 (AI Builder system prompt) — phase complete
Resume file: None
Next: New standalone task or CRM orders performance Plan 03
