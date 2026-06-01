# Standalone: UI Agent Content Editor - Research

**Researched:** 2026-06-01
**Domain:** Next.js 15 App Router admin UI + Supabase domain layer + pgvector re-embed + DB versioning
**Confidence:** HIGH (all claims grounded in actual code read this session; cited file:line)

## Summary

This standalone builds an admin UI under `/agentes` to edit two content domains — `agent_templates` (the per-intent template sequence each agent sends) and `agent_knowledge_base` (the RAG-generative KB for `somnio-sales-v4`) — without touching SQL in Supabase Studio. It requires creating two NEW domain-layer files (neither exists today; Regla 3 mandates them), a migration to add `scope_summary` to the KB table + backfill, a KB versioning schema, synchronous re-embed in server actions, image upload reuse, admin gating, and protecting the `knowledge:sync` paths so they cannot overwrite UI edits.

The single highest-risk finding is **embedding byte-equivalence (D-10)**. Today `sync.ts` computes `contentToEmbed = scope_summary + "\n\n" + body`, where `body` is the **raw markdown text after the frontmatter** (verified `parser.ts:77` returns `body: content` from gray-matter — NOT a reconstruction of the parsed sections). The DB stores only the *parsed* sections (`hechos_del_producto`, `posicion_del_negocio`, `debe_contener[]`, `nunca_decir[]`, `cuando_escalar[]`) — it does NOT store the raw body. Therefore reconstructing a byte-identical `contentToEmbed` from DB columns is impossible to guarantee for the *legacy* embeddings. The correct, honest design is: **on the UI's first save of any topic, re-embed from a canonical reconstruction and accept that legacy embeddings are replaced** — but do this deliberately, with a documented canonical serialization, NOT by trying to match the old byte stream exactly. See Pitfall 1 and §scope_summary Migration for the full analysis.

**Primary recommendation:** Build `src/lib/domain/agent-templates.ts` + `src/lib/domain/agent-knowledge-base.ts` mirroring the `whatsapp-templates.ts` + `agent-config.ts` patterns (DomainContext/DomainResult, `createAdminClient` ONLY inside domain, explicit `workspace_id`+`agent_id` filtering). Add `scope_summary TEXT` to `agent_knowledge_base` + a dedicated `agent_knowledge_base_versions` table (simpler than JSONB for search/restore). Re-embed synchronously via the existing `generateEmbedding`. Gate edits to `somnio-sales-v4` rows + admin role. Flag-protect `knowledge-sync-v4.ts` + `scripts/knowledge-sync.ts` so the DB stays source of truth.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| List templates/KB by agent | API/Backend (server action → domain) | — | Reads bypass RLS via admin client inside domain; filter by workspace+agent (Regla 3) |
| Edit/add/delete/reorder templates | API/Backend (server action → domain) | DB (unique constraint on `orden`) | Mutations must pass domain (Regla 3); reorder collides with UNIQUE key (Pitfall 3) |
| CRUD KB topics + re-embed | API/Backend (server action → domain) | External (OpenAI embeddings) | Re-embed is a server-side OpenAI call; sync per D-06 |
| KB versioning (snapshot/search/restore) | DB (versions table) + Backend | — | Snapshot-on-save in same domain mutation transaction-ish sequence |
| Image upload (`content_type='imagen'`) | API/Backend (route handler) | CDN/Storage (`whatsapp-media` bucket) | Reuse existing `/api/config-builder/templates/upload` pattern |
| Agent selector + read-only marking | Frontend Server (RSC) + Client | — | `AGENT_CATALOG` is static; editability gate is a pure constant check (`=== 'somnio-sales-v4'`) |
| Admin permission | API/Backend (server action) | — | `workspace_members.role IN ('owner','admin')` check, same as `agent-config.ts:54` |

## Standard Stack

### Core (already in repo — reuse, do NOT add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15 (App Router) | RSC pages + server actions | [VERIFIED: CLAUDE.md stack] project standard |
| React | 19 | UI | project standard |
| `@supabase/supabase-js` | (admin client) | DB access inside domain only | [VERIFIED: `src/lib/supabase/admin.ts` used by `template-manager.ts:9`] |
| `openai` | (installed) | `generateEmbedding` text-embedding-3-small 1536 | [VERIFIED: `knowledge-base/embed.ts:1,37`] |
| `gray-matter` | ^4.0.3 | `.md` frontmatter parse (sync path only) | [VERIFIED: package.json:67, `parser.ts:1`] |
| `zod` | (installed) | server-action input validation | [VERIFIED: `crm-tools/_actions.ts:2`] |
| `sonner` | (installed) | toast notifications | [VERIFIED: `image-uploader.tsx:19`] |
| `lucide-react` | (installed) | icons | [VERIFIED: `agentes/layout.tsx:3`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^1.6.1 | unit tests | [VERIFIED: package.json:117] — Validation Architecture tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `agent_knowledge_base_versions` table | JSONB `version_history[]` column on the KB row | JSONB is simpler to write but worse for "search a prior version" (D-01b explicit requirement) and bloats the hot row + its embedding. Table wins. |
| Synchronous re-embed | Async via Inngest | D-06 LOCKED synchronous. Async is explicitly deferred. |

**Installation:** No new packages required. Everything is already in `package.json`. [VERIFIED]

## scope_summary Migration (D-10) — the byte-equivalence analysis

### Current state (VERIFIED)
- `scope_summary` is **NOT a DB column** anywhere. `grep -rln "scope_summary" supabase/migrations/` returns zero matches. [VERIFIED: this session]
- `scope_summary` lives only in `.md` frontmatter as a YAML block scalar `scope_summary: |` (multi-line). [VERIFIED: `knowledge/product/formula.md:9`]
- `keywords` **IS** already a DB column: `keywords TEXT[] NOT NULL DEFAULT '{}'`. [CITED: `20260501100000_somnio_v4_agent_knowledge_base.sql:14`] → D-10's "confirm keywords column status": it exists, no migration needed for keywords; just expose it in the UI.
- `sync.ts:42-44`: `contentToEmbed = parsed.frontmatter.scope_summary ? scope_summary + "\n\n" + parsed.body : parsed.body`. [CITED]
- `parser.ts:77`: `body: content` — `content` is gray-matter's raw markdown after frontmatter. The `body` is **the verbatim markdown**, including the leading `\n`, all `## Header` lines, bullet `- ` lines, and any blank lines. The parsed `sections.*` are a SEPARATE derivation; **the body fed to the embedding is the raw text, not the sections**. [CITED: `parser.ts:62-79`]
- `body_hash = sha256(contentToEmbed)`. Re-embed only fires when the hash changes (`sync.ts:45,58`). [CITED]

### The hard truth about byte-equivalence
The DB stores `hechos_del_producto`, `posicion_del_negocio`, `debe_contener[]`, `nunca_decir[]`, `cuando_escalar[]` — the *parsed* outputs of `parseSections` (`parser.ts:108-174`). The parser **discards** unknown/deprecated headers silently (`parser.ts:163-167`), trims section text (`flush()` calls `.trim()`), splits bullets and strips the `- ` prefix. This is a **lossy, one-way** transform: you cannot reconstruct the original raw `body` (exact whitespace, header casing, blank-line count, bullet indentation, any deprecated sections) from those columns. [CITED: `parser.ts:127-144`]

**Conclusion:** There is no way to make a DB-reconstructed `contentToEmbed` byte-identical to the legacy `.md`-derived one in the general case. Attempting it is a trap (Pitfall 1).

### Recommended design (honest + safe)
Define ONE canonical serializer used by BOTH the migration backfill AND the UI re-embed, so the DB becomes internally self-consistent. Re-embed every topic ONCE during migration using this serializer, replacing the legacy embeddings deliberately.

Proposed canonical `buildContentToEmbed(row)`:
```
scope_summary + "\n\n" +
"## Hechos del producto\n" + hechos_del_producto + "\n\n" +
"## Posición del negocio\n" + posicion_del_negocio + "\n\n" +
"## Debe contener la respuesta\n" + debe_contener.map(b => "- " + b).join("\n") + "\n\n" +
"## NUNCA decir\n" + nunca_decir.map(b => "- " + b).join("\n") + "\n\n" +
"## Cuándo escalar a humano\n" + cuando_escalar.map(b => "- " + b).join("\n")
```
This is a `[ASSUMED]` exact form — the planner must finalize header strings and spacing, then lock it in a shared helper (e.g. `src/lib/agents/somnio-v4/knowledge-base/serialize.ts`) imported by both the migration backfill script and the domain re-embed. Whatever form is chosen, the rule is: **migration re-embeds all 18 topics with the new serializer in the same pass that backfills `scope_summary`**, so legacy and future embeddings are produced by the identical function. This eliminates the "silent stale embedding" risk by making the transition explicit and one-time, rather than pretending nothing changed.

Why this is acceptable: v4 is DORMANT in prod (no traffic) [VERIFIED: CLAUDE.md interruption-system-v2 scope + CONTEXT D-02], so re-embedding all 18 topics has zero customer impact. The semantic ranking shifts slightly but the corpus is internally consistent afterward.

### Migration shape (Regla 5)
```sql
ALTER TABLE public.agent_knowledge_base
  ADD COLUMN IF NOT EXISTS scope_summary TEXT;
```
Then a one-time backfill: read the 18 `.md` frontmatters, write `scope_summary` per `(topic, agent_id, workspace_id)`. Two viable approaches:
1. **SQL `UPDATE` statements** (one per topic, values copied from the `.md`) bundled in the migration file. Simplest; auditable; matches the project's manual-apply SQL convention (Regla 5).
2. **A `tsx` script** that reads the `.md` files and updates rows. Less aligned with "apply SQL in Studio before deploy" (Regla 5).
Recommendation: **Approach 1** (SQL `UPDATE`s in the migration) for backfilling `scope_summary`, because Regla 5 requires the user to apply migrations in Studio before code deploy and SQL is self-contained. The re-embed pass (which calls OpenAI) cannot be pure SQL — handle it as a **one-time invocation of `knowledge:sync` AFTER the migration**, OR a one-time admin action, using the new canonical serializer. The planner decides; document the ordering in the plan (Pitfall 6).

`scope_summary` should be `TEXT` NULL (not NOT NULL) — `parser.ts:24` marks it `.optional()`, and `sync.ts:42` handles the null case. [CITED]

## KB Versioning (D-01b)

### Recommendation: dedicated table (NOT JSONB)
```sql
CREATE TABLE public.agent_knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES public.agent_knowledge_base(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  -- full snapshot of editable content at the moment BEFORE the save:
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
  body_hash TEXT,            -- hash at snapshot time (diagnostic)
  version_num INT NOT NULL,  -- monotonic per kb_id
  edited_by TEXT,            -- user id / label
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE (kb_id, version_num)
);
GRANT ALL ON TABLE public.agent_knowledge_base_versions TO service_role;
GRANT SELECT ON TABLE public.agent_knowledge_base_versions TO authenticated;
```
Rationale (Claude's discretion → table wins):
- **D-01b requires "ver / buscar / restaurar"** — searching prior versions is trivial with `WHERE topic ILIKE ... ORDER BY version_num DESC` on a table; painful inside a JSONB array. [CITED: CONTEXT D-01b line 44]
- Keeping snapshots out of the hot KB row avoids bloating the row that carries the `vector(1536)` embedding (read on every `kb_search`).
- Do NOT store the `embedding` in the versions table (1536 floats × N versions = waste). Restore re-embeds (see semantics).

### Semantics
- **Snapshot-on-save:** Inside the KB update domain function, BEFORE writing the new values, INSERT the *current* row's editable fields into `agent_knowledge_base_versions` with `version_num = max(existing)+1`. (First-ever edit snapshots the migrated baseline.)
- **List/search:** domain `listKbVersions(ctx, kbId)` + `searchKbVersions(ctx, {topic})`.
- **Restore:** copy a version's fields back onto the live row, then **re-embed** (a restore changes content → embedding must regenerate via the canonical serializer + `body_hash` update). The restore itself ALSO snapshots the pre-restore state (so restore is reversible). [Design per D-01b "restaurar" + D-06 re-embed coupling]

## Synchronous Re-embed (D-06)

### How to call from a server action
`generateEmbedding(text)` is already importable and reusable. [CITED: `embed.ts:36`, re-exported by `sync.ts:9`]. The env-key fallback is already built in: `process.env.OPENAI_API_KEY_SALESV4 ?? process.env.OPENAI_API_KEY`. [CITED: `embed.ts:21`] The UI re-embed inherits this for free.

Flow inside the KB save domain function (`updateKbTopic` / `createKbTopic`):
1. Build `contentToEmbed = buildContentToEmbed(newValues)` (shared serializer).
2. `bodyHash = sha256(contentToEmbed)` (mirror `sync.ts:45`, `createHash('sha256')`). [CITED]
3. If `bodyHash` unchanged vs existing row → skip OpenAI, keep embedding (mirror `sync.ts:58`). Otherwise `embedding = await generateEmbedding(contentToEmbed)`.
4. Snapshot prior version (versioning).
5. `upsert` / `update` row with new fields + `embedding` + `body_hash` + `updated_at`.
6. On OpenAI failure: domain returns `{ success:false, error }`; server action surfaces it; the user retries (D-06 LOCKED behavior). NO partial write — do the embedding call BEFORE the DB write so a failure leaves the row untouched ("no intermediate new-text/old-embedding state" — D-06 line 58). [CITED]

### Reusing syncKbDoc without coupling to `.md`
Do NOT call `syncKbDoc(filePath, raw)` from the UI — it reads a file path and re-parses markdown (`sync.ts:31-33`). Instead extract the shared core into the new serializer + reuse `generateEmbedding` + the hash logic. The UI path operates on DB column values directly (DB is source of truth, D-01). Keep `syncKbDoc` for the initial-import/seed path only.

## Protect knowledge:sync (D-01)

### Current gating (VERIFIED)
- Inngest `knowledge-sync-v4.ts` already checks `platform_config.somnio_v4_kb_sync_enabled` (default `false`) and is a no-op when off. [CITED: `knowledge-sync-v4.ts:57-83`]
- `scripts/knowledge-sync.ts` (`pnpm knowledge:sync`) has **NO flag** — it always syncs every `.md` → DB unconditionally. [CITED: `scripts/knowledge-sync.ts:30-54`] This is the dangerous path: a developer running it after UI edits would overwrite DB content with stale `.md`.

### Recommendation
The mechanism `syncKbDoc` is hash-guarded (skips if `body_hash` matches) but a UI edit changes the DB content WITHOUT changing the `.md`, so on next sync the `.md`-derived hash differs from the DB hash → it re-embeds and **overwrites the UI edit with the stale `.md`**. This is exactly the silent-revert D-01 warns about. [Analysis grounded in `sync.ts:48-64`]

Two-layer protection:
1. **Inngest function:** already gated; KEEP the flag `false` in prod (it is by default). Document in the plan that flipping it ON would clobber UI edits. Optionally add a guard comment + observability note.
2. **`scripts/knowledge-sync.ts`:** add a guard that makes it **initial-import-only** — e.g. refuse to run unless an explicit `--seed` / `--force` flag is passed, OR check the same `platform_config.somnio_v4_kb_sync_enabled` flag and abort if the table already has rows for the agent (treat non-empty DB as "DB is source of truth, refuse to overwrite"). Recommended: **abort if `SELECT count(*) FROM agent_knowledge_base WHERE agent_id='somnio-sales-v4'` > 0 unless `--force`.** Print a loud warning explaining D-01. This is the smallest safe change.

The flag is `platform_config.somnio_v4_kb_sync_enabled`. [VERIFIED: `knowledge-sync-v4.ts:62`]

## Image Upload (D-05)

Reuse the EXACT existing pattern — there is a working endpoint and client component:
- **Endpoint:** `src/app/api/config-builder/templates/upload/route.ts` — auth → workspace cookie → `workspace_members` membership → MIME/size validation (jpeg/png ≤5MB) → upload to bucket `whatsapp-media` at path `templates/{workspaceId}/{timestamp}_{safeName}` → returns `{ storagePath, publicUrl, mimeType }`. [CITED: route.ts read this session]
- **Client:** `builder/components/image-uploader.tsx` — file input, client-side validation, `URL.createObjectURL` preview, POST multipart, store `storagePath`. [CITED]
- **Public URL:** `supabase.storage.from('whatsapp-media').getPublicUrl(storagePath)` returns `pub.publicUrl`. [CITED: `whatsapp-templates.ts:113-115`]

For D-05: when `content_type='imagen'`, the UI uploads via this endpoint (or a clone of it) and **autofills the returned `publicUrl` into the template's `content` field**. The bucket is already public (required by 360dialog, noted `whatsapp-templates.ts:98-100`). No new bucket needed. The planner can reuse the endpoint as-is or clone it to a content-editor route; reuse is simpler.

## Domain Layer Shape

### `agent_templates` row (VERIFIED full schema)
| Column | Type | Null | Notes |
|--------|------|------|-------|
| id | UUID PK | no | gen_random_uuid() |
| agent_id | TEXT | no | e.g. `somnio-sales-v4` |
| intent | TEXT | no | |
| visit_type | TEXT | no | CHECK `IN ('primera_vez','siguientes')` — note: v4 `siguientes` rows deleted Phase 34 [CITED: 20260303 migration:294] |
| orden | INTEGER | no | DEFAULT 0; part of UNIQUE key |
| content_type | TEXT | no | CHECK `IN ('texto','template','imagen')` |
| content | TEXT | no | |
| delay_s | INTEGER | no | DEFAULT 0 |
| workspace_id | UUID | yes | NULL = global; FK workspaces ON DELETE CASCADE |
| priority | TEXT | no | DEFAULT 'CORE'; CHECK `IN ('CORE','COMPLEMENTARIA','OPCIONAL')` [CITED: 20260226 migration:8] |
| minifrase | TEXT | yes | no-repetition filter [CITED: 20260303 migration:19] |
| created_at | TIMESTAMPTZ | yes | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | yes | DEFAULT NOW(); trigger `update_agent_templates_updated_at` |

- **UNIQUE:** `(agent_id, intent, visit_type, orden, workspace_id)`. [CITED: 20260206 migration:39] — critical for reorder (Pitfall 3).
- **RLS:** enabled. Policy `FOR ALL USING (workspace_id IS NULL OR is_workspace_member(workspace_id))`. [CITED: 20260206 migration:58-62] Domain uses `createAdminClient` (bypasses RLS) but MUST still filter by workspace/agent explicitly (Regla 3).
- **v4 rows' workspace_id:** the clone preserved v3's `workspace_id` (mostly NULL/global) and added `handoff_humano` with Somnio workspace UUID. [CITED: 20260501100300 migration:30,58] → D-03: the UI edits these rows in place; the `loadTemplates` lookup merges `workspace_id IS NULL` + workspace-specific (`template-manager.ts:288`). [CITED]

### `agent_knowledge_base` row (VERIFIED full schema, post-RAG migration)
| Column | Type | Null | Notes |
|--------|------|------|-------|
| id | UUID PK | no | |
| workspace_id | UUID | no | NOT NULL (no global rows) [CITED: 20260501100000:11] |
| agent_id | TEXT | no | |
| topic | TEXT | no | |
| keywords | TEXT[] | no | DEFAULT '{}' — editable (D-10) |
| category | TEXT | no | CHECK `IN ('product','policies','edge-cases','faqs-no-templated')` |
| embedding | vector(1536) | **no** | NOT NULL — every write needs an embedding (Pitfall for create) |
| canonical_response | TEXT | yes | DEPRECATED for v4 [CITED: 20260516 migration:25] |
| nunca_decir | TEXT[] | no | DEFAULT '{}' |
| escalate_triggers | TEXT[] | no | DEFAULT '{}' (frontmatter `escalate_if`) |
| related_topics | TEXT[] | no | DEFAULT '{}' |
| source_md_path | TEXT | no | NOT NULL — UI-created topics need a value (use synthetic path or relax) |
| body_hash | TEXT | no | NOT NULL — sha256(contentToEmbed) |
| last_reviewed_at | DATE | no | NOT NULL |
| reviewed_by | TEXT | no | NOT NULL |
| hechos_del_producto | TEXT | yes | RAG source [CITED: 20260516:19] |
| posicion_del_negocio | TEXT | yes | RAG source |
| debe_contener | TEXT[] | no | DEFAULT '{}' |
| cuando_escalar | TEXT[] | no | DEFAULT '{}' |
| tone_override | TEXT | yes | |
| hit_count, promoted_to_transition, last_seen_at, created_at, updated_at | | | bookkeeping |
| scope_summary | TEXT | yes | **NEW — added by this standalone's migration (D-10)** |

- **UNIQUE:** `(topic, agent_id, workspace_id)`. [CITED: 20260501100000:30]
- **RLS: NONE.** The table has only GRANTs (`SELECT` to `authenticated`, `ALL` to `service_role`). [CITED: 20260501100000:41-42] → There is NO row-level workspace isolation; the domain MUST filter by `workspace_id` + `agent_id` on EVERY query (Regla 3 is the only guard). This is a notable difference from `agent_templates`.
- **Retrieval:** `kb_search` calls RPC `match_knowledge_base(p_workspace_id, p_agent_id, p_query_embedding, p_category=null, p_limit=3)` cosine top-3. [CITED: `kb-search-tool.ts:88-94`]
- **NOT-NULL gotchas for UI-created topics:** `embedding`, `source_md_path`, `body_hash`, `last_reviewed_at`, `reviewed_by` are NOT NULL. The create path must supply: a generated embedding, a synthetic `source_md_path` (e.g. `ui://somnio-v4/{topic}` — or the planner relaxes the column to NULL via migration), `body_hash`, `last_reviewed_at = today` (America/Bogota), `reviewed_by = <user label>`.

### Functions the two new domain files must expose
`src/lib/domain/agent-templates.ts`:
- `listTemplatesByAgent(ctx, agentId)` → all rows for agent (read).
- `listIntents(ctx, agentId)` → distinct intents (for the "existing intents only" guard, D-08).
- `updateTemplateContent(ctx, { id, content, content_type, delay_s, priority, minifrase })`.
- `addTemplate(ctx, { agentId, intent, visit_type, orden, content_type, content, ... })` — into an EXISTING intent only (validate intent exists; D-08).
- `deleteTemplate(ctx, id)`.
- `reorderTemplates(ctx, { agentId, intent, visit_type, orderedIds })` — Pitfall 3 (UNIQUE collision).
All gated to `agent_id === 'somnio-sales-v4'` for mutations (D-02); reads allow any agent (D-04).

`src/lib/domain/agent-knowledge-base.ts`:
- `listKbByAgent(ctx, agentId)` (read; filter workspace+agent).
- `getKbTopic(ctx, kbId)`.
- `createKbTopic(ctx, {...})` → re-embed + insert + version baseline.
- `updateKbTopic(ctx, {...})` → snapshot prior version + re-embed if hash changed + update.
- `deleteKbTopic(ctx, kbId)`.
- `listKbVersions(ctx, kbId)` / `searchKbVersions(ctx, {topic})`.
- `restoreKbVersion(ctx, { kbId, versionId })` → snapshot current + copy version fields + re-embed.

Mirror `whatsapp-templates.ts` (DomainContext/DomainResult, `createAdminClient` inside, explicit `.eq('workspace_id', ctx.workspaceId)`). [CITED: `whatsapp-templates.ts:71-82`]

## UI Structure + Permissions

### Route (Claude's discretion)
Recommend `/agentes/content-editor` as a new tab in the existing `agentes/layout.tsx` tab bar (add to the `tabs` array, `layout.tsx:7-13`). [CITED] Sub-structure:
- `/agentes/content-editor` — agent selector + two sub-tabs (Templates | Conocimiento).
- Mirror the `/configuracion/whatsapp/templates/` list+form pattern (`page.tsx` + `components/template-list.tsx` + `components/template-form.tsx`). [CITED: file listing this session]
- Co-locate server actions in `_actions.ts` and components in `_components/` like `agentes/crm-tools/` and `agentes/somnio-v4/unknown-cases/`. [CITED: file listing]

### Permissions (D-07)
The established admin gate is in `agent-config.ts`: `getAuthContext()` (user + `morfx_workspace` cookie) + `isWorkspaceAdmin()` = `workspace_members.role === 'owner' || === 'admin'`. [CITED: `agent-config.ts:22-55`] Also used in `client-activation.ts:54`. Reuse this exact pattern in the content-editor server actions: reads allowed for any member; mutations require owner/admin else return `{ error: 'Solo administradores...' }`. Workspace resolved via `getActiveWorkspaceId()` (`workspace.ts:24`) or the cookie directly. [CITED]

### Agent selector + read-only marking (D-02/D-04)
- `AGENT_CATALOG` (5 entries) feeds the selector. [CITED: `agent-catalog.ts:19-45`] Note it lists `somnio-sales-v1/v3/v4`, `godentist`, `godentist-fb-ig` but NOT `somnio-recompra-v1` / `somnio-sales-v3-pw-confirmation` — D-04 lists 7 agents. The planner should decide whether to extend `AGENT_CATALOG` (additive, safe) or build a content-editor-specific list. Extending the shared catalog is cleaner but touches shared code — additive only.
- Editability gate is a pure constant: `editable = (agentId === 'somnio-sales-v4')` [VERIFIED: matches D-02]. All others render with a "PRODUCCIÓN — solo lectura" badge and disabled inputs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embedding generation | Custom OpenAI client | `generateEmbedding` (`embed.ts:36`) | Already has env-key fallback + correct model/dims |
| Hash for change-detection | Ad-hoc | `createHash('sha256').update(contentToEmbed)` | Must match sync's behavior (`sync.ts:45`) |
| Image upload | New bucket/endpoint | `/api/config-builder/templates/upload` + `whatsapp-media` bucket | Already validated, public bucket, working |
| Admin check | New role logic | `isWorkspaceAdmin` pattern (`agent-config.ts:42-55`) | Project-consistent (Regla 7-equivalent) |
| Workspace resolution | New cookie parse | `getActiveWorkspaceId()` / `morfx_workspace` cookie | Established |
| DomainResult/Context shape | New types | `src/lib/domain/types.ts` | Shared contract |

**Key insight:** The entire re-embed + hash + storage stack already exists for the sync path. The standalone's job is to *re-target* it from `.md`-driven to DB-driven, not to reinvent it.

## Common Pitfalls

### Pitfall 1: Pursuing exact embedding byte-equivalence
**What goes wrong:** Trying to reconstruct the legacy `.md` `contentToEmbed` byte-for-byte from DB columns to "not invalidate embeddings."
**Why it happens:** CONTEXT D-10 says "byte-equivalente". But `parseSections` is lossy (`parser.ts:127-167`) — the raw body is discarded.
**How to avoid:** Define a single canonical serializer; re-embed ALL 18 topics once during migration with it. Accept the deliberate one-time re-embed. v4 is dormant → zero impact. Make the transition explicit, not silent.
**Warning signs:** Code that tries to re-derive `## Header` text + exact whitespace to match old bytes.

### Pitfall 2: KB table has no RLS
**What goes wrong:** Forgetting that `agent_knowledge_base` has no row-level workspace isolation (`authenticated` can SELECT all rows). [CITED: 20260501100000:42]
**How to avoid:** Domain MUST `.eq('workspace_id', ctx.workspaceId).eq('agent_id', agentId)` on every query. Never trust RLS here.
**Warning signs:** A KB query without an explicit workspace filter.

### Pitfall 3: Reorder collides with UNIQUE constraint
**What goes wrong:** Updating `orden` values to reorder templates hits `UNIQUE(agent_id, intent, visit_type, orden, workspace_id)` mid-update (e.g. swapping 0↔1 transiently duplicates). [CITED: 20260206:39]
**How to avoid:** Reorder in a transaction-like sequence: first shift all affected rows to a non-colliding temp range (e.g. negative `orden` or +1000 offset), then set final values. Or delete+reinsert the whole intent group atomically. Document the chosen strategy.
**Warning signs:** `23505` unique-violation errors during reorder.

### Pitfall 4: knowledge:sync silently reverts UI edits
**What goes wrong:** `pnpm knowledge:sync` (no flag) overwrites DB with stale `.md`. [CITED: `scripts/knowledge-sync.ts:30`]
**How to avoid:** Guard the script (abort if DB non-empty unless `--force`); keep Inngest flag `false`. See §Protect knowledge:sync.

### Pitfall 5: NOT-NULL columns block UI-created KB topics
**What goes wrong:** Insert fails because `embedding`, `source_md_path`, `body_hash`, `last_reviewed_at`, `reviewed_by` are NOT NULL. [CITED: 20260501100000:21-24]
**How to avoid:** Supply synthetic values (`source_md_path='ui://...'`, `last_reviewed_at=today`, `reviewed_by=<user>`) or relax columns to NULL in the migration. Decide in plan.

### Pitfall 6: Migration ordering (Regla 5)
**What goes wrong:** Code referencing `scope_summary` or the versions table deploys before the migration is applied → runtime error (the exact failure mode CLAUDE.md Regla 5 was written for).
**How to avoid:** Apply `ALTER TABLE ... ADD scope_summary` + create versions table in Studio FIRST, confirm, THEN deploy code. The re-embed/backfill happens after the column exists.

### Pitfall 7: TemplateManager 5-min cache (D-03b)
**What goes wrong:** User edits a template, doesn't see the change in runtime for up to 5 min and reports a "bug."
**Why:** `TemplateManager` caches per `agentId:workspaceId` for 5 min. [CITED: `template-manager.ts:90,258-263`]
**How to avoid:** Set UI expectation ("cambios visibles en runtime en ≤5 min"). There IS an `invalidateCache()` method (`template-manager.ts:215`) but it's per-instance/per-lambda — calling it from a server action won't clear other lambdas' caches. Don't promise instant propagation. (KB has no equivalent cache; `kb_search` reads fresh each call.)

## Code Examples

### Re-embed inside a domain mutation (pattern)
```typescript
// Source: derived from sync.ts:42-64 + embed.ts:36 (this session)
import { createHash } from 'node:crypto'
import { generateEmbedding } from '@/lib/agents/somnio-v4/knowledge-base/embed'
import { buildContentToEmbed } from '@/lib/agents/somnio-v4/knowledge-base/serialize' // NEW shared helper

const contentToEmbed = buildContentToEmbed(newValues)         // scope_summary + serialized sections
const bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')
let embedding = existing.embedding
if (existing.body_hash !== bodyHash) {
  embedding = await generateEmbedding(contentToEmbed)         // throws → action returns error (D-06)
}
// snapshot prior version, then upsert row with { ...newValues, embedding, body_hash: bodyHash }
```

### Admin gate in a server action
```typescript
// Source: agent-config.ts:22-55 (this session)
const ctx = await getAuthContext()                  // { user, workspaceId, supabase } | null
if (!ctx) return { error: 'No autenticado' }
const isAdmin = await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)
if (!isAdmin) return { error: 'Solo administradores pueden editar el contenido del agente' }
// ... delegate to domain with { workspaceId: ctx.workspaceId, source: 'server-action' }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| KB source of truth = `.md` files synced to DB | DB is source of truth (D-01) | This standalone | `knowledge:sync` must be protected; UI re-embeds |
| `scope_summary` in `.md` frontmatter only | `scope_summary` as DB column (D-10) | This standalone | Migration + backfill + canonical serializer |
| KB content edited in Supabase Studio (raw SQL, stale embedding risk) | UI re-embeds + versions on save | This standalone | Safe edit path |

**Deprecated/outdated:** `canonical_response` (deprecated for v4, `20260516:25`); `visit_type='siguientes'` rows (deleted Phase 34, `20260303:294`) — the UI should treat templates as `primera_vez` for v4.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact `buildContentToEmbed` serialization form (header strings/spacing) | scope_summary Migration | Embeddings differ from intent; mitigated because re-embed is one-time + internally consistent. Planner must lock the helper. |
| A2 | SQL `UPDATE` backfill (Approach 1) preferred over tsx script | scope_summary Migration | If `.md` scope_summary has tricky multi-line YAML, hand-copying to SQL is error-prone; could instead script it. |
| A3 | Extending `AGENT_CATALOG` to include recompra + pw-confirmation is desired for D-04's 7-agent list | UI Structure | D-04 lists 7 agents; catalog has 5. Need user/planner confirm whether to add the 2 missing or keep read-only list separate. |
| A4 | `reviewed_by` / `source_md_path` synthetic values acceptable for UI-created topics (vs relaxing NOT NULL) | Domain Layer / Pitfall 5 | Either works; planner decides migration vs synthetic. |
| A5 | Reorder strategy = temp-offset within UNIQUE key | Pitfall 3 | Need to validate the exact offset approach against the constraint; alternative is delete+reinsert. |

## Open Questions

1. **Canonical serializer exact form (A1)** — What header strings/spacing make `buildContentToEmbed` the locked standard? Recommendation: planner picks one, puts it in a shared helper, re-embeds all 18 topics in the migration pass.
2. **AGENT_CATALOG completeness (A3)** — Add `somnio-recompra-v1` + `somnio-sales-v3-pw-confirmation` to the catalog (additive) or keep a content-editor-local agent list? Recommendation: additive extension of the shared catalog (safe, single source of truth).
3. **UI-created topic required fields (A4/Pitfall 5)** — Synthetic `source_md_path`/`reviewed_by` vs relaxing NOT NULL? Recommendation: synthetic values (no schema change to existing columns beyond `scope_summary`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenAI API key | re-embed (D-06) | ✓ (prod) | `OPENAI_API_KEY_SALESV4` → `OPENAI_API_KEY` | none — action errors, user retries (D-06) |
| Supabase Storage `whatsapp-media` bucket | image upload (D-05) | ✓ | public | none needed |
| pgvector + `match_knowledge_base` RPC | KB retrieval (read-back) | ✓ | vector(1536) HNSW | none |
| vitest | tests | ✓ | ^1.6.1 | none |

**Missing dependencies with no fallback:** none — all infra exists (v4 already shipped its KB + template stack).

## Validation Architecture

> nyquist_validation not explicitly disabled in `.planning/config.json` → treated as ENABLED. [VERIFIED: grep found no key]

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^1.6.1 [VERIFIED: package.json:117] |
| Config file | repo root (`vitest run` script package.json:10) |
| Quick run command | `npx vitest run <path> -t <name>` |
| Full suite command | `pnpm test` (`vitest run`) |

### Phase Requirements (Decisions) → Test Map
| Decision | Observable behavior proving it | Test Type | How |
|----------|-------------------------------|-----------|-----|
| D-01 (DB source of truth + sync protected) | `knowledge:sync` aborts/no-ops when DB non-empty; Inngest flag off | unit + grep | unit on the guard; `grep -n "somnio_v4_kb_sync_enabled" scripts/knowledge-sync.ts` returns match |
| D-01b (versioning) | save snapshots prior version; restore re-embeds | unit/integration | domain test: edit twice → 2 version rows; restore → embedding regenerated |
| D-02 (only v4 editable) | mutation on non-v4 agent rejected | unit | domain returns error for `agent_id !== 'somnio-sales-v4'` |
| D-03 (edits the rows v4 uses, no overrides) | no `workspace_id`-override branch in UI mutations | grep/code review | inspect domain — single row update, no override insert |
| D-04 (all agents read-only visible) | selector lists all; non-v4 disabled + "PRODUCCIÓN" badge | manual UI smoke | open editor, switch agents |
| D-05 (image upload → content) | upload returns publicUrl autofilled into `content` for `imagen` | manual UI smoke + unit on endpoint reuse |
| D-06 (sync re-embed; error→retry) | OpenAI failure → action error, no partial write | unit | mock `generateEmbedding` throw → row unchanged |
| D-07 (admin only) | non-admin mutation rejected | unit | mock `isWorkspaceAdmin=false` → error |
| D-08 (templates: existing intents only) | add into new intent rejected | unit | `addTemplate` with unknown intent → error |
| D-09 (KB full CRUD + re-embed on create) | create topic embeds + inserts | unit | mock embed, assert insert called with embedding |
| D-10 (scope_summary editable + migrated) | column exists; edit re-embeds | grep + unit | `grep scope_summary` in migration; edit changes body_hash |
| Regla 3 | zero `createAdminClient` outside domain | grep gate | `grep -rn "createAdminClient" src/app/.../content-editor/` = 0; only domain files import it |
| Regla 6 | production agent rows untouched | grep + manual | only `somnio-sales-v4` mutated; v3/godentist rows unchanged |

### Sampling Rate
- **Per task commit:** `npx vitest run` on the touched domain test file.
- **Per wave merge:** `pnpm test` (full suite).
- **Phase gate:** full suite green + grep gates pass before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/lib/domain/__tests__/agent-templates.test.ts` — D-02/D-08/Regla3.
- [ ] `src/lib/domain/__tests__/agent-knowledge-base.test.ts` — D-01b/D-06/D-09/D-10.
- [ ] Shared serializer + its unit test (`serialize.test.ts`) — A1/Pitfall 1.
- [ ] Guard test for `scripts/knowledge-sync.ts` — D-01/Pitfall 4.
- (Framework already installed — no install gap.)

## Security Domain

> security_enforcement not set to false → treated as ENABLED.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser()` in every server action [CITED: agent-config.ts:25] |
| V4 Access Control | yes | admin role gate (`workspace_members.role`) + workspace scoping; KB has NO RLS so workspace filter is mandatory (Pitfall 2) |
| V5 Input Validation | yes | zod on server action inputs (pattern `crm-tools/_actions.ts:21`); MIME/size on upload |
| V6 Cryptography | n/a | sha256 only for change-detection hash (not security) — reuse `node:crypto` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace KB read/write (no RLS) | Information disclosure / Tampering | Explicit `.eq('workspace_id').eq('agent_id')` in domain (Pitfall 2) |
| Non-admin edits agent behavior | Elevation of privilege | `isWorkspaceAdmin` gate (D-07) |
| Production agent content tampering | Tampering | v4-only mutation gate (D-02/Regla 6) |
| Malicious image upload | Tampering | MIME allowlist + 5MB cap (existing endpoint) |
| SQL injection via reorder/topic strings | Tampering | Parameterized Supabase queries (no string interpolation) |

## Sources

### Primary (HIGH confidence — read this session)
- `supabase/migrations/20260206000000_agent_templates.sql` — templates schema, UNIQUE, RLS
- `supabase/migrations/20260226000000_block_priorities.sql` — priority column
- `supabase/migrations/20260303000000_no_repetition_minifrases.sql` — minifrase + siguientes delete
- `supabase/migrations/20260501100300_somnio_v4_template_clone.sql` — v4 clone, workspace_id preservation
- `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql` — KB base schema, GRANTs, NO RLS
- `supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql` — RAG columns, match RPC
- `src/lib/agents/somnio/template-manager.ts` — runtime lookup, 5-min cache, createAdminClient
- `src/lib/agents/somnio-v4/knowledge-base/sync.ts` — contentToEmbed, hash, upsert (no scope_summary persisted)
- `src/lib/agents/somnio-v4/knowledge-base/embed.ts` — generateEmbedding, env fallback
- `src/lib/agents/somnio-v4/knowledge-base/parser.ts` — body=raw content, lossy parseSections
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` — match_knowledge_base RPC usage
- `src/inngest/functions/knowledge-sync-v4.ts` — flag-gated sync
- `scripts/knowledge-sync.ts` — UNGUARDED manual sync
- `src/lib/agents/somnio-v4/knowledge/product/formula.md` — scope_summary YAML block scalar + body structure
- `src/lib/domain/whatsapp-templates.ts` + `src/lib/domain/types.ts` — domain pattern
- `src/app/actions/templates.ts` + `src/app/actions/agent-config.ts` — server action + admin gate
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx` + `src/app/api/config-builder/templates/upload/route.ts` — D-05 pattern
- `src/lib/agents/agent-catalog.ts`, `src/app/(dashboard)/agentes/layout.tsx`, `src/app/(dashboard)/agentes/crm-tools/_actions.ts` — UI structure
- `src/lib/agents/types.ts:644-677` — AgentTemplate row types

### Secondary
- CONTEXT.md (D-01..D-10 decisions) — authoritative scope
- CLAUDE.md (Regla 3/5/6/7) — project constraints

## Project Constraints (from CLAUDE.md)
- **Regla 3:** ALL mutations through `src/lib/domain/*`; zero `createAdminClient` outside domain. Verifiable via grep.
- **Regla 5:** migration applied to prod (Studio) BEFORE deploying code that uses it. `scope_summary` column + versions table FIRST.
- **Regla 6:** never alter production-agent behavior; only `somnio-sales-v4` (dormant) is editable. v3/godentist/recompra/pw-confirmation rows untouched.
- **Admin gate:** edits restricted to `workspace_members.role IN ('owner','admin')` (D-07, project-consistent).
- **Timezone:** America/Bogota for any timestamps (`last_reviewed_at`, version `created_at`).
- **GSD workflow:** plan must be approved before code changes; push to Vercel after changes.

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH — everything already in repo, versions verified in package.json.
- Schema/domain shape: HIGH — every column/constraint/RLS read from actual migrations this session.
- Byte-equivalence analysis (D-10): HIGH on the *problem* (parser is provably lossy); MEDIUM on the *exact serializer* (A1, planner must lock).
- Versioning/sync protection: HIGH — current flag + script behavior read directly.
- Pitfalls: HIGH — grounded in cited code.

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (stable internal codebase; re-verify if v4 ships to prod traffic, which changes the re-embed risk profile)
