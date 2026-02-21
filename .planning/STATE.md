# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos, automatizaciones inteligentes y agentes IA.
**Current focus:** Milestone v3.0 Logistica — Phase 24 In Progress (2/3 plans)

## Current Position

Phase: 24 — Chat de Comandos UI
Plan: 02 of 03
Status: In progress
Last activity: 2026-02-21 — Completed 24-02-PLAN.md (Server Actions + Realtime Hook)

Progress: [##########] 100% MVP v1 | [##########] 100% MVP v2 | [########--] 72% v3.0

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Complete (2026-02-16)

All 9 phases + 5 inserted phases completed:
- 83 plans executed across 14 phases
- 441 commits, 454 files, 121K lines added

### v3.0 Logistica (In Progress)

| Phase | Name | Status |
|-------|------|--------|
| 21 | DB + Domain Foundation | COMPLETE (4/4 plans) |
| 22 | Robot Coordinadora Service | COMPLETE (3/3 plans) |
| 23 | Inngest Orchestrator + Callback API | COMPLETE (3/3 plans) |
| 24 | Chat de Comandos UI | IN PROGRESS (2/3 plans) |
| 25 | Pipeline Integration + Docs | Not started |

### Standalone Work (between v2.0 and v3.0)

- WhatsApp Performance (4 plans) — COMPLETE
- Real Fields Fix (3 plans) — COMPLETE
- Action Fields Audit (4 plans) — COMPLETE
- CRM Orders Performance (2/3 plans) — IN PROGRESS
- WhatsApp Phone Resilience (2 plans) — COMPLETE
- Bulk Actions for Orders (1/2 plans) — IN PROGRESS
- Quick fixes: 5 completed (optimistic send, media null URL, workspace_id, task overdue, carrier-tracking-order-triggers)

## Performance Metrics

**Overall:**
- Total phases completed: 33 (29 milestone + 4 standalone)
- Total plans completed: 164
- Total execution time: ~26 days (2026-01-26 to 2026-02-21)

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

#### v3.0 Decisions
- Playwright CANNOT run on Vercel — must be separate Docker service on Railway
- Robot communicates with MorfX via Inngest events + HTTP callbacks
- Domain layer MUST handle all robot result updates (triggers automation)
- Anti-duplicate protection: workspace lock + per-order lock + batch idempotency
- Chat de Comandos is pure React+Tailwind, fixed commands, Supabase Realtime for progress
- DANE code database is foundational — blocks all carrier integrations
- Zero new deps in MorfX for chat UI (no xterm.js, no WebSocket, no Redis/BullMQ)
- DANE municipalities: 1,122 rows across 33 departments with normalized names for accent-insensitive lookup
- Coordinadora coverage: 1,489 cities with nullable FK to DANE, supports_cod defaults false until COD list provided
- Global reference tables pattern: NO workspace_id, NO RLS, SELECT-only grants
- Portal password stored plaintext in v3.0 (not payment data, encryption deferred to v4.0+)
- tracking_number is Coordinadora pedido number (not guia)
- error_type enum: validation, portal, timeout, unknown (covers all robot failure modes)
- robot_job_items uses parent-join RLS (no workspace_id column on child table)
- Supabase Realtime on robot_job_items only (not robot_jobs) for Chat de Comandos progress
- 45 department abbreviation entries covering all Bogota/San Andres variants + Mexican cross-border
- Batch validateCities uses single query + Map lookup (not N+1)
- getCarrierCredentials validates enabled + complete before returning credentials
- Job auto-completes when success_count + error_count >= total_items
- Idempotency check rejects only against active jobs (pending/processing), not completed/failed
- retryFailedItems resets job status to pending if job was completed/failed
- robot-coordinadora is standalone project at repo root (not inside src/), own package.json/tsconfig
- In-memory locks (Map + Set) for workspace mutex and per-order skip -- no Redis for single-instance
- Playwright ^1.52.0 version range (resolves to 1.58.2 latest stable)
- fillField helper: clear-then-fill pattern for React SPA form fields with 200ms state sync delay
- MUI Autocomplete city: locator('input[id^="mui-"]').first() for dynamic MUI IDs
- COD toggle: multi-selector fallback (checkbox, label) for portal resilience
- Pedido number extraction: cascading regex (Pedido N -> No. N -> 5+ digit number)
- Fire-and-forget batch: processBatch().catch(log) after 200 ack (background Playwright processing)
- Idempotency cache: Map keyed by jobId, set BEFORE res.json() to prevent retry races
- City pre-validation: reject empty ciudad via callback before wasting browser session
- Callback trackingNumber field maps to result.numeroPedido (not numeroGuia)
- robot/job.batch_completed separate from robot/job.completed -- batch_completed for orchestrator step.waitForEvent signaling
- robot.coord.completed fires per-order so automations run individually per order
- Order enrichment enabled for robot.coord.completed so full order+contact data is available to actions
- retries: 0 on robot-orchestrator (fail-fast) to prevent duplicate Coordinadora portal submissions
- onFailure handler for guaranteed job failure marking (avoids try/catch around step.run anti-pattern)
- Dynamic orchestrator timeout: (N orders x 30s) + 5 min margin for batch size scaling
- 2s settle sleep before waitForEvent to handle tiny batches where callback arrives before event listener
- callbackSecret passed in HTTP payload so robot service can forward it in callback headers for HMAC verification
- Batch completion check reads job.status='completed' (domain atomically set) rather than counter arithmetic (prevents spurious duplicate events)
- Callback trigger emission errors caught and logged, never fail the callback (domain update already succeeded)
- Supabase Realtime on robot_jobs (job status) + robot_job_items (item progress) for Chat de Comandos
- 2-query batch-fetch for getJobItemsWithOrderInfo (items then orders+contacts Map lookup)
- getActiveJob delegates to getJobWithItems for full data reuse (DRY)
- OrderForDispatch flattens contact fields for direct server action consumption
- buildPedidoInputFromOrder defaults: peso=1, dimensions=10x10x10, COD=false (configurable later)
- CommandResult<T> pattern for all command server actions: { success, data?, error? }
- Realtime hook uses dual listeners on single channel: items for per-order progress, job for status
- getJobStatus returns full GetJobWithItemsResult | null for reconnect scenario initial fetch

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
- Set ROBOT_CALLBACK_SECRET env var in Vercel and Railway (shared secret for callback auth)
- Delete deprecated files (SomnioEngine, SandboxEngine, /api/agents/somnio)
- Complete bulk-actions-orders-002 (integration into table/kanban)
- Complete CRM Orders Performance plan 003 (virtualization)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 005 | Add carrier/tracking variables to order triggers | 2026-02-21 | bfcf6bf | [005-add-carrier-tracking-to-order-triggers](./quick/005-add-carrier-tracking-to-order-triggers/) |

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-21 COT
Stopped at: Completed 24-02-PLAN.md (Server Actions + Realtime Hook)
Resume file: None
Next: /gsd:execute-phase 24-03 (Chat UI Components)
