# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos, automatizaciones inteligentes y agentes IA.
**Current focus:** Phase 30 Message Classification + Silence Timer (v4.0 Comportamiento Humano)

## Current Position

Phase: 30 of 35 (Message Classification + Silence Timer)
Plan: 1 of 3 complete
Status: In progress
Last activity: 2026-02-24 — Completed 30-01-PLAN.md (Foundation Definitions)

Progress: [##########] 100% MVP v1 | [##########] 100% MVP v2 | [##########] 100% v3.0 | [####░░░░░░] 19% v4.0

### MVP v1.0 Complete (2026-02-04)

All 11 phases + 4 inserted phases completed:
- 51 plans executed across 15 phases
- Core value delivered: CRM + WhatsApp sync

### MVP v2.0 Complete (2026-02-16)

All 9 phases + 5 inserted phases completed:
- 83 plans executed across 14 phases
- 441 commits, 454 files, 121K lines added

### v3.0 Logistica (7/8 phases complete, Phase 28 in progress)

| Phase | Name | Status |
|-------|------|--------|
| 21 | DB + Domain Foundation | COMPLETE (4/4 plans) |
| 22 | Robot Coordinadora Service | COMPLETE (3/3 plans) |
| 23 | Inngest Orchestrator + Callback API | COMPLETE (3/3 plans) |
| 24 | Chat de Comandos UI | COMPLETE (3/3 plans) |
| 25 | Pipeline Config UI + Docs | COMPLETE (2/2 plans) |
| 26 | Robot Lector de Guias Coordinadora | COMPLETE (3/3 plans) |
| 27 | Robot OCR de Guias | COMPLETE (4/4 plans) |
| 28 | Robot Creador de Guias PDF | IN PROGRESS (5/5 plans, checkpoint pending) |

### v4.0 Comportamiento Humano (Planned)

| Phase | Name | Status |
|-------|------|--------|
| 29 | Inngest Migration + Character Delays | COMPLETE (4/4 plans) |
| 30 | Message Classification + Silence Timer | IN PROGRESS (1/3 plans) |
| 31 | Pre-Send Check + Interruption + Pending Merge | Not started |
| 32 | Media Processing | Not started |
| 33 | Confidence Routing + Disambiguation Log | Not started |
| 34 | No-Repetition System | Not started |
| 35 | Flujo Ofi Inter | Not started |

### Standalone Work (between v2.0 and v3.0)

- WhatsApp Performance (4 plans) — COMPLETE
- Real Fields Fix (3 plans) — COMPLETE
- Action Fields Audit (4 plans) — COMPLETE
- CRM Orders Performance (2/3 plans) — IN PROGRESS
- WhatsApp Phone Resilience (2 plans) — COMPLETE
- Bulk Actions for Orders (1/2 plans) — IN PROGRESS
- Order Notes System (2/2 plans) — COMPLETE
- Quick fixes: 6 completed

## Performance Metrics

**Overall:**
- Total phases completed: 37 (33 milestone + 4 standalone)
- Total plans completed: 192
- Total execution time: ~29 days (2026-01-26 to 2026-02-24)

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.

Phase 28 decisions:
- Guide gen config stored on same carrier_configs row (carrier='coordinadora') alongside dispatch/OCR config
- Non-fatal tag fetch: getOrdersForGuideGeneration proceeds without tags on error
- destStageId nullable (optional post-generation stage move)
- bwip-js imported via 'bwip-js/node' subpath (bundler moduleResolution cannot resolve root conditional exports)
- Claude AI normalization fallback: buildFallbackOrder() returns usable defaults instead of throwing
- valorCobrar set to "$0" when pagoAnticipado is true (prepaid = nothing to collect)
- Per-order barcode try/catch: failed barcode skips without crashing the entire PDF
- GuideGenCard sub-component for DRY carrier config cards (pipeline + source stage + dest stage)
- Pipeline change resets both source and dest stage selections
- Generate + upload in same Inngest step.run to avoid 4MB step output limit
- Stage move errors non-fatal: logged but don't fail the job

Order notes system decisions:
- No activity logging for order notes (no order_activity table exists)
- Extended existing domain/notes.ts rather than creating new file
- Notes loaded via useEffect on sheet open, not in initial page query
- WhatsApp view shows notes read-only (no CRUD buttons)
- 'Notas' label reserved exclusively for notes entity; 'Descripcion' for order.description

Phase 29 decisions:
- processAgentInline helper: DRY extraction for shared inline/fallback path
- processed_by_agent marks ALL unprocessed inbound messages (batch case)
- Inngest send failure falls back to inline processing (safety net)

Phase 30 decisions:
- no_gracias intent NOT created: existing no_interesa covers polite refusals
- fallback triggers emptied: overlapping keywords moved to dedicated asesor intent
- bienvenida state added to SOMNIO_STATES for explicit state machine correctness
- ACKNOWLEDGMENT_PATTERNS uses regex array (not Set) for pattern matching flexibility

Recent decisions affecting v4.0:
- Inngest migration with USE_INNGEST_PROCESSING feature flag for instant rollback
- Character delay curve: min 2s, cap 12s at 250 chars, logarithmic
- Classification post-IntentDetector (not pre-gate regex)
- SILENCIOSO only in non-confirmatory states (resumen/collecting_data/confirmado are always RESPONDIBLE)
- Debounce eliminated -- check pre-envio + char delay is the natural window
- Priorities CORE/COMP/OPC per template per intent (not global)
- No-repetition: 3 escalating levels (ID lookup, minifrase Haiku, full context)
- Confidence V1: 2 bands (80%+ respond, <80% handoff+log), disambiguator built later with real data
- Ofi Inter: always confirm, never assume; 3 detection paths

### Pending Todos

- Configure SMTP in Supabase for production email sending
- Apply migrations to Supabase (all pending)
- Configure 360dialog webhook URL and env vars
- Set WHATSAPP_WEBHOOK_SECRET env var in Vercel
- Configure Inngest env vars (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY)
- Set USE_INNGEST_PROCESSING=true in Vercel to enable async agent processing
- Set ROBOT_CALLBACK_SECRET env var in Vercel and Railway
- Delete deprecated files (SomnioEngine, SandboxEngine, /api/agents/somnio)
- Complete bulk-actions-orders-002 (integration into table/kanban)
- Complete CRM Orders Performance plan 003 (virtualization)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-24 COT
Stopped at: Completed 30-01-PLAN.md (Foundation Definitions)
Resume file: None
Next: /gsd:execute-phase 30-02 (Message Category Classifier)
