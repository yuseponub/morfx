---
plan: 03
phase: somnio-sales-v4
status: complete-pending-prod-apply
completed: 2026-05-01
---

# Plan 03: Template clone v3→v4 — SUMMARY

## What was built

1 migration file:
- `supabase/migrations/20260501100300_somnio_v4_template_clone.sql`

Logic:
- `INSERT … SELECT` clone de `agent_templates` desde `agent_id='somnio-sales-v3'` a `'somnio-sales-v4'` con contenido idéntico (D-26)
- Guard `NOT EXISTS` con composite key `(intent, visit_type, orden, workspace_id)` usando `IS NOT DISTINCT FROM` para NULLs — idempotente
- Pre/post `RAISE NOTICE` para diagnostics + `RAISE EXCEPTION` si el conteo v4 < v3
- `DO $$` block crea explícitamente `handoff_humano` (D-59) si v3 no lo tiene — fallback con texto seguro
- Pitfall 1: zero involvement Meta — `agent_templates` es Postgres internal, NO Meta HSM templates

## Deviation from plan

Tasks 3 (HALT) y 4 (push) **deferred** — aplicación en prod y push batched antes de Plan 11.

## Commit

- `1a4dd49` feat(somnio-v4): plan-03 — template clone v3→v4 con handoff_humano fallback

## Key files

- key-files.created:
  - supabase/migrations/20260501100300_somnio_v4_template_clone.sql

## Self-Check: PASSED

- File exists ✓
- INSERT INTO agent_templates con SELECT FROM v3 ✓
- Filter `WHERE v3.agent_id = 'somnio-sales-v3'` + INSERT `'somnio-sales-v4'` ✓
- NOT EXISTS guard ✓
- DO $$ block ensures handoff_humano (D-59) ✓
- RAISE NOTICE diagnostics + RAISE EXCEPTION on count mismatch ✓
