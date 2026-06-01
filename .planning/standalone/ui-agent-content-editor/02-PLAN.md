---
phase: ui-agent-content-editor
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - supabase/migrations/20260601100000_kb_scope_summary.sql
  - supabase/migrations/20260601100100_kb_versions_table.sql
  - scripts/reembed-kb-v4.ts
autonomous: false
requirements: [D-01b, D-10]

must_haves:
  truths:
    - "agent_knowledge_base has a scope_summary TEXT column (NULL allowed)"
    - "All 18 v4 KB topics have scope_summary backfilled from their .md frontmatter"
    - "agent_knowledge_base_versions table exists with the full editable-field snapshot shape"
    - "All 18 v4 topics are re-embedded once via buildContentToEmbed (legacy + future use the same function)"
    - "Migrations are applied to PROD by the user BEFORE any code referencing the new schema deploys (Regla 5)"
  artifacts:
    - path: "supabase/migrations/20260601100000_kb_scope_summary.sql"
      provides: "ADD COLUMN scope_summary + per-topic UPDATE backfill"
      contains: "ADD COLUMN IF NOT EXISTS scope_summary"
    - path: "supabase/migrations/20260601100100_kb_versions_table.sql"
      provides: "agent_knowledge_base_versions table + grants"
      contains: "CREATE TABLE public.agent_knowledge_base_versions"
    - path: "scripts/reembed-kb-v4.ts"
      provides: "One-time re-embed of all 18 topics via buildContentToEmbed (run AFTER column exists)"
      contains: "buildContentToEmbed"
  key_links:
    - from: "scripts/reembed-kb-v4.ts"
      to: "src/lib/agents/somnio-v4/knowledge-base/serialize.ts"
      via: "import buildContentToEmbed — same form as UI domain re-embed"
      pattern: "buildContentToEmbed"
    - from: "agent_knowledge_base_versions.kb_id"
      to: "agent_knowledge_base.id"
      via: "FK ON DELETE CASCADE"
      pattern: "REFERENCES public.agent_knowledge_base"
---

<objective>
Ship the two Regla-5 migrations (scope_summary column + backfill; KB versions table) and the one-time re-embed script, then PAUSE for the user to apply them to PROD before any dependent code deploys.

Purpose: D-10 makes scope_summary a DB column (it lives only in `.md` frontmatter today — `grep -rln scope_summary supabase/migrations/` = 0). D-01b requires a versions table for ver/buscar/restaurar. Per CLAUDE.md Regla 5, migrations MUST be applied to PROD (Supabase Studio) by the user and confirmed BEFORE deploying code that references the new schema (Pitfall 6 — this is the exact failure mode Regla 5 was written for). The re-embed pass (OpenAI call — not pure SQL) runs AFTER the column exists, using the locked serializer from Plan 01 so legacy + future embeddings come from the same function (Pitfall 1 resolution).

Output: two migration files, one re-embed script, and a hard PAUSE checkpoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-agent-content-editor/CONTEXT.md
@.planning/standalone/ui-agent-content-editor/RESEARCH.md
@.planning/standalone/ui-agent-content-editor/PATTERNS.md
@CLAUDE.md

<interfaces>
From src/lib/agents/somnio-v4/config.ts:
```typescript
export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const
export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' as const
```

From src/lib/agents/somnio-v4/knowledge-base/serialize.ts (Plan 01):
```typescript
export interface KbContentColumns { scope_summary: string | null; hechos_del_producto: string | null; posicion_del_negocio: string | null; debe_contener: string[]; nunca_decir: string[]; cuando_escalar: string[] }
export function buildContentToEmbed(row: KbContentColumns): string
```

From src/lib/agents/somnio-v4/knowledge-base/embed.ts:
```typescript
export async function generateEmbedding(text: string): Promise<number[]> // text-embedding-3-small 1536; env OPENAI_API_KEY_SALESV4 ?? OPENAI_API_KEY
```

agent_knowledge_base NOT-NULL columns (RESEARCH §Domain Layer Shape): embedding, source_md_path, body_hash, last_reviewed_at, reviewed_by. UNIQUE(topic, agent_id, workspace_id). NO RLS — GRANTs only.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration — add scope_summary column + per-topic backfill SQL</name>
  <read_first>
    - supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql (ALTER ADD COLUMN IF NOT EXISTS pattern + Regla 5/6 header comment + ROLLBACK block)
    - src/lib/agents/somnio-v4/knowledge/product/formula.md (and the other 17 .md) — the scope_summary YAML block scalar values to copy verbatim
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§scope_summary Migration — Approach 1 SQL UPDATE backfill, A2)
  </read_first>
  <action>
Create `supabase/migrations/20260601100000_kb_scope_summary.sql`.

Header comment must state: standalone ui-agent-content-editor; Regla 5 (apply in Studio before code deploy); Regla 6 (touches ONLY agent_id='somnio-sales-v4', workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490').

DDL:
```sql
ALTER TABLE public.agent_knowledge_base
  ADD COLUMN IF NOT EXISTS scope_summary TEXT;   -- NULL allowed (parser.ts:24 .optional())
```

Backfill: ONE `UPDATE` per topic, copying the `scope_summary:` block-scalar value verbatim from each of the 18 `.md` frontmatters. Read each `.md`, extract the `scope_summary: |` multi-line value, and write it as a SQL string literal (escape single quotes by doubling). Scope every UPDATE explicitly:
```sql
UPDATE public.agent_knowledge_base
   SET scope_summary = '<verbatim scope_summary text>'
 WHERE topic = '<topic>'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
```
The 18 topics (one UPDATE each): formula, contenido, contraindicaciones, dependencia, efectividad, registro_sanitario, como_se_toma (product/7); devoluciones, envio, pago (policies/3); insomnio_largo_plazo, interaccion_alcohol, interaccion_medicamentos, uso_en_embarazo, uso_en_ninos (edge-cases/5); alternativas_naturales, duracion_efecto, precio_comparativo (faqs-no-templated/3). The `topic` value is the frontmatter `topic:` field of each file (NOT necessarily the filename) — read the frontmatter to get the exact topic string.

Append a manual `-- ROLLBACK` block (commented) mirroring 20260516193830:74-82: `-- ALTER TABLE public.agent_knowledge_base DROP COLUMN IF EXISTS scope_summary;`

Do NOT attempt the re-embed in SQL (impossible — OpenAI call). The re-embed is Task 3.
  </action>
  <acceptance_criteria>
    - `test -f supabase/migrations/20260601100000_kb_scope_summary.sql`
    - `grep -c "ADD COLUMN IF NOT EXISTS scope_summary" supabase/migrations/20260601100000_kb_scope_summary.sql` == 1
    - `grep -c "UPDATE public.agent_knowledge_base" supabase/migrations/20260601100000_kb_scope_summary.sql` == 18 (one backfill per topic)
    - Every UPDATE includes `agent_id = 'somnio-sales-v4'` AND `workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'`: `grep -c "agent_id = 'somnio-sales-v4'" supabase/migrations/20260601100000_kb_scope_summary.sql` == 18
    - `grep -ci "regla 5" supabase/migrations/20260601100000_kb_scope_summary.sql` >= 1 and `grep -ci "rollback" ...` >= 1
    - `grep -c "DROP TABLE\|DELETE FROM\|TRUNCATE" supabase/migrations/20260601100000_kb_scope_summary.sql` == 0 (Regla 6 — no destructive ops on other agents)
  </acceptance_criteria>
  <verify>
    <automated>grep -c "ADD COLUMN IF NOT EXISTS scope_summary" supabase/migrations/20260601100000_kb_scope_summary.sql; grep -c "agent_id = 'somnio-sales-v4'" supabase/migrations/20260601100000_kb_scope_summary.sql</automated>
  </verify>
  <done>Migration adds scope_summary + 18 workspace+agent-scoped backfill UPDATEs with Regla 5/6 header and rollback.</done>
</task>

<task type="auto">
  <name>Task 2: Migration — agent_knowledge_base_versions table</name>
  <read_first>
    - supabase/migrations/20260204000001_task_notes_history.sql (snapshot/audit table pattern: FK ON DELETE CASCADE, workspace_id, America/Bogota timestamp, grants)
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§KB Versioning — exact column list)
    - supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql (the parent table grants pattern, lines 41-42)
  </read_first>
  <action>
Create `supabase/migrations/20260601100100_kb_versions_table.sql` with the Regla 5/6 header comment.

```sql
CREATE TABLE IF NOT EXISTS public.agent_knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES public.agent_knowledge_base(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL,
  scope_summary TEXT,
  hechos_del_producto TEXT,
  posicion_del_negocio TEXT,
  debe_contener TEXT[] NOT NULL DEFAULT '{}',
  nunca_decir TEXT[] NOT NULL DEFAULT '{}',
  cuando_escalar TEXT[] NOT NULL DEFAULT '{}',
  tone_override TEXT,
  escalate_triggers TEXT[] NOT NULL DEFAULT '{}',
  related_topics TEXT[] NOT NULL DEFAULT '{}',
  body_hash TEXT,
  version_num INT NOT NULL,
  edited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE (kb_id, version_num)
);

CREATE INDEX IF NOT EXISTS idx_kb_versions_kb_id ON public.agent_knowledge_base_versions (kb_id, version_num DESC);
CREATE INDEX IF NOT EXISTS idx_kb_versions_topic ON public.agent_knowledge_base_versions (workspace_id, agent_id, topic);

GRANT ALL ON TABLE public.agent_knowledge_base_versions TO service_role;
GRANT SELECT ON TABLE public.agent_knowledge_base_versions TO authenticated;
```

Do NOT store `embedding` (1536 floats × N versions = waste; restore re-embeds). `created_at` uses `timezone('America/Bogota', NOW())` (Regla 2). Append a commented `-- ROLLBACK: DROP TABLE IF EXISTS public.agent_knowledge_base_versions;` block.
  </action>
  <acceptance_criteria>
    - `test -f supabase/migrations/20260601100100_kb_versions_table.sql`
    - `grep -c "CREATE TABLE IF NOT EXISTS public.agent_knowledge_base_versions" supabase/migrations/20260601100100_kb_versions_table.sql` == 1
    - `grep -c "REFERENCES public.agent_knowledge_base(id) ON DELETE CASCADE" ...` == 1
    - `grep -c "UNIQUE (kb_id, version_num)" ...` == 1
    - `grep -c "timezone('America/Bogota', NOW())" ...` >= 1 (Regla 2)
    - `grep -ci "embedding" supabase/migrations/20260601100100_kb_versions_table.sql` == 0 (no embedding column)
    - `grep -c "GRANT SELECT ON TABLE public.agent_knowledge_base_versions TO authenticated" ...` == 1
  </acceptance_criteria>
  <verify>
    <automated>grep -c "CREATE TABLE IF NOT EXISTS public.agent_knowledge_base_versions" supabase/migrations/20260601100100_kb_versions_table.sql && grep -c "timezone('America/Bogota', NOW())" supabase/migrations/20260601100100_kb_versions_table.sql</automated>
  </verify>
  <done>Versions table migration matches the locked schema with Bogota timestamp, no embedding, FK cascade.</done>
</task>

<task type="auto">
  <name>Task 3: One-time re-embed script using the canonical serializer</name>
  <read_first>
    - scripts/knowledge-sync.ts (CLI structure / tsx shebang / @/ import style)
    - src/lib/agents/somnio-v4/knowledge-base/serialize.ts (Plan 01 buildContentToEmbed)
    - src/lib/agents/somnio-v4/knowledge-base/embed.ts (generateEmbedding signature + env)
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (lines 45-64 — hash + skip logic to mirror)
  </read_first>
  <action>
Create `scripts/reembed-kb-v4.ts` (tsx, run ONCE after the migrations are applied in PROD). It reads all `somnio-sales-v4` rows from `agent_knowledge_base` (filtered by `agent_id='somnio-sales-v4'` AND `workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'`), and for each row:
1. `contentToEmbed = buildContentToEmbed({ scope_summary, hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar })` (columns from the row; scope_summary now populated by Task 1).
2. `bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')`.
3. `embedding = await generateEmbedding(contentToEmbed)` (always re-embed in this one-time pass — the whole point is to make ALL 18 embeddings come from the serializer).
4. `UPDATE agent_knowledge_base SET embedding = ..., body_hash = bodyHash, updated_at = now() WHERE id = row.id` (scope the UPDATE with agent_id + workspace_id too).
This script may use `createAdminClient` because it lives in `scripts/` (a CLI, not under `src/app/**` or domain) — it is the same exception class as `scripts/knowledge-sync.ts`. Log per-topic `topic → re-embedded (hash ...)`. Print a loud header: "[reembed-kb-v4] Run ONCE after migration 20260601100000 applied. v4 is DORMANT — safe."
Add a guard: abort with a clear message if any row's required content columns are entirely empty (would produce a degenerate embedding) — print the topic and continue with the rest (do not crash the whole run).
  </action>
  <acceptance_criteria>
    - `test -f scripts/reembed-kb-v4.ts`
    - `grep -c "buildContentToEmbed" scripts/reembed-kb-v4.ts` >= 1
    - `grep -c "generateEmbedding" scripts/reembed-kb-v4.ts` >= 1
    - `grep -c "agent_id" scripts/reembed-kb-v4.ts` >= 1 and `grep -c "a3843b3f-c337-4836-92b5-89c58bb98490\|SOMNIO_WORKSPACE_ID" scripts/reembed-kb-v4.ts` >= 1 (workspace-scoped)
    - `npx tsc --noEmit -p tsconfig.json` does not error on this file (typecheck), OR `npx tsx --check scripts/reembed-kb-v4.ts` if available
  </acceptance_criteria>
  <verify>
    <automated>grep -c "buildContentToEmbed" scripts/reembed-kb-v4.ts && grep -c "generateEmbedding" scripts/reembed-kb-v4.ts</automated>
  </verify>
  <done>Re-embed script imports the canonical serializer + generateEmbedding and updates only v4/Somnio rows.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Regla 5 PAUSE — apply migrations to PROD + run re-embed, confirm before any dependent code ships</name>
  <what-built>
    Two migration files (`20260601100000_kb_scope_summary.sql`, `20260601100100_kb_versions_table.sql`) and a one-time re-embed script (`scripts/reembed-kb-v4.ts`). None of this is applied to PROD yet — Claude cannot apply Supabase migrations (no Studio access).
  </what-built>
  <how-to-verify>
    Per CLAUDE.md Regla 5, the user MUST apply the migrations in Supabase Studio (PROD) and confirm BEFORE Waves 2-6 (which reference scope_summary + the versions table) deploy.
    1. Open Supabase Studio → SQL Editor for the PROD project.
    2. Run `supabase/migrations/20260601100000_kb_scope_summary.sql` (adds column + 18 backfills). Verify: `SELECT topic, scope_summary FROM agent_knowledge_base WHERE agent_id='somnio-sales-v4' AND scope_summary IS NULL;` returns 0 rows.
    3. Run `supabase/migrations/20260601100100_kb_versions_table.sql`. Verify: `SELECT count(*) FROM agent_knowledge_base_versions;` returns 0 (empty table created).
    4. From the repo, run the re-embed ONCE: `npx tsx scripts/reembed-kb-v4.ts` (requires OPENAI_API_KEY_SALESV4 or OPENAI_API_KEY in env). Verify it logs 18 topics re-embedded. Confirm: `SELECT count(*) FROM agent_knowledge_base WHERE agent_id='somnio-sales-v4' AND embedding IS NULL;` returns 0.
    5. Sanity (Regla 6): `SELECT agent_id, count(*) FROM agent_knowledge_base GROUP BY agent_id;` — only `somnio-sales-v4` rows should have changed updated_at; no other agent touched (KB table is v4-only anyway, but confirm).
  </how-to-verify>
  <resume-signal>Type "migraciones aplicadas + re-embed corrido" (or describe any error). Do NOT proceed to Wave 2 until confirmed.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| developer → PROD DB (Studio) | Manual SQL apply by the user; the migration is the trusted artifact. |
| re-embed script → OpenAI | Outbound embedding call for already-stored KB content. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE02-01 | Tampering | Backfill UPDATE missing workspace/agent scope could touch wrong rows | mitigate | Every UPDATE carries `agent_id='somnio-sales-v4' AND workspace_id='a3843b3f-...'`; acceptance grep enforces count==18 scoped UPDATEs. |
| T-UICE02-02 | Denial of service | Code deploys before migration applied → runtime errors (Pitfall 6) | mitigate | Blocking human-action checkpoint (Task 4) enforces Regla 5 ordering. |
| T-UICE02-03 | Tampering | Re-embed degrading other agents' content | mitigate | KB table is v4-only; script scopes UPDATE by agent_id+workspace_id; Regla 6 sanity query in checkpoint. |
| T-UICE02-04 | Repudiation | No record of who/when content was edited | mitigate | versions table records `edited_by` + Bogota `created_at` per snapshot (consumed in Wave 2/4). |
</threat_model>

<verification>
- Both migration files exist with the locked DDL and Regla 5/6 headers.
- Re-embed script imports buildContentToEmbed + generateEmbedding and is workspace/agent-scoped.
- Checkpoint confirmed: scope_summary non-null for all 18 topics, versions table present, all v4 embeddings non-null.
</verification>

<success_criteria>
- scope_summary column live in PROD with 18 backfilled values.
- agent_knowledge_base_versions table live in PROD.
- All 18 v4 topics re-embedded via the canonical serializer.
- User confirmation captured before Wave 2 starts (Regla 5).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/02-SUMMARY.md`.
</output>
