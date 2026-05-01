---
plan: 02
phase: somnio-sales-v4
status: complete-pending-prod-apply
completed: 2026-05-01
---

# Plan 02: agent_unknown_cases + platform_config + match_knowledge_base RPC — SUMMARY

## What was built

3 migration files:
- `supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql`
- `supabase/migrations/20260501100200_somnio_v4_platform_config.sql`
- `supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql`

Schema:
- Table `agent_unknown_cases` con embedding(1536), 4 estados CHECK (`pending`/`ready_for_promotion`/`promoted`/`dismissed`), HNSW + cluster_id partial + workspace_agent_status indexes
- Function `cluster_unknown_cases(workspace_id, agent_id, similarity_threshold, min_cluster_size, window_days)` — pgvector cosine neighborhood (RESEARCH §Example 3)
- platform_config seeds: `somnio_v4_low_confidence_threshold=0.70` (D-03) + `somnio_v4_kb_sync_enabled=true`
- Function `match_knowledge_base(workspace_id, agent_id, query_embedding, category, limit)` — RETURNS includes `nunca_decir TEXT[]` (W-09 — alimenta post-gen check D-51)
- All functions SECURITY DEFINER + GRANT EXECUTE service_role

Revision fixes incorporated:
- B-01: RPC `match_knowledge_base` movida de Plan 05 → Wave 0 (Plan 05 queda autónomo, sin migration)
- W-09: `nunca_decir TEXT[]` en RETURNS (post-gen NUNCA-decir check funcional desde día 1)
- W-07: HDBSCAN downgradeado a pgvector cosine neighborhood (no hay extensión HDBSCAN en Supabase managed)

## Deviation from plan

Tasks 5 (HALT) y 6 (push) **deferred** — aplicación en prod y push batched antes de Plan 11.

## Commit

- `34782d7` feat(somnio-v4): plan-02 — migrations agent_unknown_cases + platform_config + match_knowledge_base RPC

## Key files

- key-files.created:
  - supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql
  - supabase/migrations/20260501100200_somnio_v4_platform_config.sql
  - supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql

## Self-Check: PASSED

- 3 files created ✓
- agent_unknown_cases con vector(1536) + HNSW + 4-state CHECK ✓
- cluster_unknown_cases function (5 params, SECURITY DEFINER, GRANT EXECUTE) ✓
- platform_config keys con `::jsonb` casts y ON CONFLICT DO NOTHING ✓
- match_knowledge_base RETURNS incluye `nunca_decir TEXT[]` (W-09) ✓
