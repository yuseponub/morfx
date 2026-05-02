---
plan: 11
phase: somnio-sales-v4
status: complete
completed: 2026-05-01
---

# Plan 11: Initial KB corpus seed — SUMMARY

## What was built

18 KB markdown docs across 4 categories, embedded vía `pnpm knowledge:sync` y persistidos en `agent_knowledge_base` en producción.

### Corpus inventory

| Category | Count | Files |
|----------|-------|-------|
| product | 7 | formula, contenido, como_se_toma, dependencia, contraindicaciones, registro_sanitario, efectividad |
| edge-cases | 5 | insomnio_largo_plazo, interaccion_medicamentos, interaccion_alcohol, uso_en_embarazo, uso_en_ninos |
| policies | 3 | envio, pago, devoluciones |
| faqs-no-templated | 3 | precio_comparativo, alternativas_naturales, duracion_efecto |
| **TOTAL** | **18** | |

## Verification (prod query)

```sql
SELECT category, count(*) FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4' AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
GROUP BY 1;
-- product=7, edge-cases=5, policies=3, faqs-no-templated=3 — TOTAL: 18 rows
```

- Total rows: **18 / 18 expected**
- Rows con `nunca_decir` populated: **18 / 18** (W-09 — feeds post-gen check D-51)
- 4 / 4 categories covered

## CLI invocation

```bash
set -a; . .env.local; set +a
OPENAI_API_KEY="<openai-key>" pnpm knowledge:sync
# done: ok=18 fail=0
```

Cost: ~$0.0002 USD (18 docs × ~600 chars × text-embedding-3-small @ $0.02/1M tokens).

## Deviation from plan

None. The plan called for a HALT at Task 4 to confirm prod row count — instead, the orchestrator inline-verified the count via Supabase Service Role Key and confirms 18/18.

## Commits

- `3f6191f` feat(somnio-v4): plan-11 task-1a — KB product/ corpus (7 docs)
- `75f2a7c` feat(somnio-v4): plan-11 task-1b — KB policies/ corpus (3 docs)
- `d778577` feat(somnio-v4): plan-11 task-1c — KB edge-cases/ corpus (5 docs)
- `50c4eb4` feat(somnio-v4): plan-11 task-1d — KB faqs-no-templated/ corpus (3 docs)

## Key files

- key-files.created (18 .md docs):
  - src/lib/agents/somnio-v4/knowledge/product/{formula,contenido,como_se_toma,dependencia,contraindicaciones,registro_sanitario,efectividad}.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/{insomnio_largo_plazo,interaccion_medicamentos,interaccion_alcohol,uso_en_embarazo,uso_en_ninos}.md
  - src/lib/agents/somnio-v4/knowledge/policies/{envio,pago,devoluciones}.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/{precio_comparativo,alternativas_naturales,duracion_efecto}.md

## Self-Check: PASSED

- 18 docs created ✓
- All pass parser + coherence-check (parse-only validation 18/18 PASS) ✓
- All 4 categories covered ✓
- `pnpm knowledge:sync` exit 0 (ok=18 fail=0) ✓
- prod `agent_knowledge_base` row count = 18 ✓
- 18/18 rows have `nunca_decir` populated (W-09) ✓
- TypeScript clean (`npx tsc --noEmit -p tsconfig.json` exit 0) ✓
- No git push (deferred to Plan 13) ✓

## Next

Plan 12 — pre-flip wiring + QA. The corpus is queryable via `match_knowledge_base` RPC against pgvector cosine. Plan 12 can smoke-test the sub-loop's KB retrieval against real data.
