# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos, automatizaciones inteligentes y agentes IA.
**Current focus:** Milestone v3.0 Logística

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-20 — Milestone v3.0 Logística started

Progress: [##########] 100% MVP v1 | [##########] 100% MVP v2 | [----------] 0% v3.0

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Complete (2026-02-16)

All 9 phases + 5 inserted phases completed:
- 83 plans executed across 14 phases
- 441 commits, 454 files, 121K lines added

### Standalone Work (between v2.0 and v3.0)

- WhatsApp Performance (4 plans) — COMPLETE
- Real Fields Fix (3 plans) — COMPLETE
- Action Fields Audit (4 plans) — COMPLETE
- CRM Orders Performance (2/3 plans) — IN PROGRESS
- WhatsApp Phone Resilience (2 plans) — COMPLETE
- Bulk Actions for Orders (1/2 plans) — IN PROGRESS
- Quick fixes: 4 completed (optimistic send, media null URL, workspace_id, task overdue)

## Performance Metrics

**Overall:**
- Total phases completed: 33 (29 milestone + 4 standalone)
- Total plans completed: 153
- Total execution time: ~25 days (2026-01-26 to 2026-02-20)

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
- Secondary phone stored in custom_fields JSONB (not new column) -- plugin-specific metadata from Releasit/CodMonster
- Extract-at-ingestion pattern: capture Shopify note_attributes at webhook time, not at action execution time
- Secondary phone fallback does NOT auto-link contact to secondary conversation (v1 safety)
- Phone fallback chain is purely additive -- contacts without secondary_phone follow unchanged path
- 'sending' status is client-only sentinel (not in MessageStatus union) — replaced by Realtime INSERT with real status
- Inbound media re-hosting: download from 360dialog ephemeral URL, upload to Supabase Storage under inbound/ prefix, pass permanent public URL to domain
- Pipeline stages scoping via parent pipeline workspace check (pipeline_stages has no workspace_id column)
- Defense-in-depth: all contacts enrichment queries filter by workspace_id even when parent entity already verified
- Batch-fetch contact names in dedicated Inngest step.run for N+1 avoidance in task-overdue-cron
- Bulk operations use per-order domain loop (not batch SQL) to ensure automation triggers fire per order
- DB field names mapped to domain param names in server action (adapter concern, not domain)

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
- Complete bulk-actions-orders-002 (integration into table/kanban)
- Complete CRM Orders Performance plan 003 (virtualization)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20 COT
Stopped at: Starting milestone v3.0 Logística
Resume file: None
Next: Define requirements and roadmap for v3.0
