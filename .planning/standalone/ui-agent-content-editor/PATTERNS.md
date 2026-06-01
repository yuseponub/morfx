# Standalone: UI Agent Content Editor - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 19 new/modified files
**Analogs found:** 19 / 19 (all have a concrete codebase analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/domain/agent-templates.ts` | domain layer | CRUD (request→DB) | `src/lib/domain/whatsapp-templates.ts` + `crm-query-tools-config.ts` | role + flow match |
| `src/lib/domain/agent-knowledge-base.ts` | domain layer | CRUD + transform (re-embed) | `src/lib/domain/whatsapp-templates.ts` + reuse `knowledge-base/sync.ts`+`embed.ts` | role + flow match |
| `src/lib/agents/somnio-v4/knowledge-base/serialize.ts` | shared util (serializer) | transform (columns→text) | `knowledge-base/sync.ts:42-44` + `parser.ts:108-174` | exact (extracted core) |
| `supabase/migrations/XXXX_kb_scope_summary.sql` | migration | DDL + backfill | `20260516193830_somnio_v4_kb_schema_rag_generative.sql` | exact |
| `supabase/migrations/XXXX_kb_versions_table.sql` | migration | DDL (table+grants) | `20260204000001_task_notes_history.sql` (task_activity snapshot/audit) | role match |
| `src/app/actions/agent-templates.ts` (or `_actions.ts`) | server action | request-response | `src/app/actions/agent-config.ts` + `crm-tools/_actions.ts` | exact |
| `src/app/actions/agent-knowledge-base.ts` (or `_actions.ts`) | server action | request-response | `src/app/actions/agent-config.ts` (admin gate) | exact |
| `/agentes/content-editor/layout` tab entry | UI config | — | `src/app/(dashboard)/agentes/layout.tsx:8-14` (tabs array) | exact |
| `/agentes/content-editor/page.tsx` | UI page (RSC) | render | `agentes/crm-tools/page.tsx` + `configuracion/whatsapp/templates/page.tsx` | role match |
| template list component | UI component | render | `configuracion/whatsapp/templates/components/template-list.tsx` | role match |
| template form component | UI component | form→action | `configuracion/whatsapp/templates/components/template-form.tsx` | role match |
| KB list/form components | UI component | form→action | `agentes/crm-tools/_components/ConfigEditor.tsx` | role match |
| image upload client component | UI component | file-I/O | `configuracion/whatsapp/templates/builder/components/image-uploader.tsx` | exact |
| image upload route (reuse or clone) | route handler | file-I/O | `src/app/api/config-builder/templates/upload/route.ts` | exact (reuse) |
| agent selector | UI component | render | `src/lib/agents/agent-catalog.ts` (`AGENT_CATALOG`) | exact |
| `scripts/knowledge-sync.ts` (MODIFY) | guard (CLI) | batch | `src/inngest/functions/knowledge-sync-v4.ts:57-83` (flag-gate pattern) | role match |
| `src/inngest/functions/knowledge-sync-v4.ts` (verify/comment) | Inngest guard | batch | self (already flag-gated `:57-83`) | exact |
| `src/lib/domain/__tests__/agent-templates.test.ts` | test | — | `src/lib/domain/__tests__/resolve-or-create-contact.test.ts` | exact |
| `src/lib/domain/__tests__/agent-knowledge-base.test.ts` + `serialize.test.ts` | test | — | `src/lib/domain/__tests__/resolve-or-create-contact.test.ts` (S-4 mock pattern) | exact |

---

## Pattern Assignments

### `src/lib/domain/agent-templates.ts` (domain layer, CRUD)

**Analog:** `src/lib/domain/whatsapp-templates.ts` (orchestration + DomainResult) + `src/lib/domain/crm-query-tools-config.ts` (read/write split + explicit workspace filter).

**Shared contract** — import the exact DomainContext/DomainResult types (`src/lib/domain/types.ts:15-40`):
```typescript
export interface DomainContext { workspaceId: string; source: string; cascadeDepth?: number; /* ... */ }
export interface DomainResult<T = void> { success: boolean; data?: T; error?: string }
```

**`createAdminClient` ONLY inside domain + explicit workspace filter** (`whatsapp-templates.ts:75-83`):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

export async function createTemplate(ctx: DomainContext, params: CreateTemplateParams): Promise<DomainResult<Template>> {
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)   // <-- explicit filter (Regla 3)
    .eq('name', params.name)
    .maybeSingle()
  if (existing) return { success: false, error: `Ya existe...` }
  // ... insert with .eq('workspace_id', ctx.workspaceId) on every mutation
}
```

**Runtime lookup the new domain must stay consistent with** — `agent_templates` is read by `TemplateManager.loadTemplates` (`template-manager.ts:272-294`), which merges global + workspace rows ordered by `intent, visit_type, orden`:
```typescript
let query = supabase.from('agent_templates').select('*')
  .eq('agent_id', agentId).order('intent').order('visit_type').order('orden')
if (this.workspaceId) query = query.or(`workspace_id.is.null,workspace_id.eq.${this.workspaceId}`)
else query = query.is('workspace_id', null)
```
→ D-03: the new domain edits these exact rows in place. Functions to expose (RESEARCH §Domain Layer Shape): `listTemplatesByAgent`, `listIntents`, `updateTemplateContent`, `addTemplate` (existing-intent-only, D-08), `deleteTemplate`, `reorderTemplates` (Pitfall 3 temp-offset).

**D-02 mutation gate (LOCKED constant check):** all mutation functions must reject `agentId !== 'somnio-sales-v4'`; reads allow any agent (D-04).

**Pitfall 3 (reorder UNIQUE collision):** `UNIQUE(agent_id, intent, visit_type, orden, workspace_id)` (`20260206000000_agent_templates.sql:39`). Shift to a non-colliding temp range before final assignment, or delete+reinsert the intent group.

---

### `src/lib/domain/agent-knowledge-base.ts` (domain layer, CRUD + re-embed transform)

**Analog:** `whatsapp-templates.ts` shape + **reuse** `generateEmbedding` (`knowledge-base/embed.ts:36`) and the hash/skip logic of `syncKbDoc` (`sync.ts:42-64`) — but operating on DB columns, NOT `.md` files (RESEARCH §Reusing syncKbDoc without coupling to `.md`).

**Re-embed core to replicate** (`sync.ts:42-64`):
```typescript
import { createHash } from 'node:crypto'
const contentToEmbed = parsed.frontmatter.scope_summary
  ? `${parsed.frontmatter.scope_summary}\n\n${parsed.body}` : parsed.body
const bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')
// ...
if (existing && existing.body_hash === bodyHash) { embedding = existing.embedding /* skip OpenAI */ }
else { embedding = await generateEmbedding(contentToEmbed) }
```
→ In the new domain, `contentToEmbed = buildContentToEmbed(row)` (the NEW shared serializer, not `.md`). Embedding call happens BEFORE the DB write so a failure leaves the row untouched (D-06 "no intermediate new-text/old-embedding state").

**`generateEmbedding` reuse — already has env fallback** (`embed.ts:21,36`):
```typescript
const apiKey = process.env.OPENAI_API_KEY_SALESV4 ?? process.env.OPENAI_API_KEY
export async function generateEmbedding(text: string): Promise<number[]> { /* text-embedding-3-small, 1536 */ }
```

**Pitfall 2 (KB has NO RLS):** `agent_knowledge_base` has only GRANTs, no row policies. EVERY query MUST `.eq('workspace_id', ctx.workspaceId).eq('agent_id', agentId)` — the domain filter is the only guard.

**Pitfall 5 (NOT-NULL on create):** `embedding`, `source_md_path`, `body_hash`, `last_reviewed_at`, `reviewed_by` are NOT NULL. UI-created topics supply synthetic values (`source_md_path='ui://somnio-v4/{topic}'`, `last_reviewed_at`=today America/Bogota, `reviewed_by`=user label).

**Versioning semantics (D-01b):** inside `updateKbTopic`/`restoreKbVersion`, BEFORE writing new values, INSERT the current row's editable fields into `agent_knowledge_base_versions` with `version_num = max+1`. Functions: `listKbByAgent`, `getKbTopic`, `createKbTopic`, `updateKbTopic`, `deleteKbTopic`, `listKbVersions`, `searchKbVersions`, `restoreKbVersion`.

---

### `src/lib/agents/somnio-v4/knowledge-base/serialize.ts` (shared util — A1 / Pitfall 1)

**Analog:** extracted from `sync.ts:42-44` (the `contentToEmbed` assembly) + `parser.ts:108-174` (`parseSections`, which is the LOSSY inverse — proves you cannot reconstruct the legacy byte stream).

**Why a new file:** today `contentToEmbed = scope_summary + "\n\n" + body` where `body` is the **raw markdown** (`parser.ts:77 body: content`). The DB stores only the *parsed* sections. `parseSections` (`parser.ts:127-167`) trims, strips `- ` bullet prefixes, lowercases headers for matching, and silently discards unknown headers — **lossy, one-way**. Byte-equivalence with legacy `.md` embeddings is impossible (Pitfall 1). The honest design: ONE canonical serializer used by BOTH the migration re-embed pass AND the UI domain, re-embedding all 18 topics once.

**Proposed form to lock (RESEARCH §scope_summary Migration, A1 — planner finalizes exact header strings/spacing):**
```
scope_summary + "\n\n" +
"## Hechos del producto\n" + hechos_del_producto + "\n\n" +
"## Posición del negocio\n" + posicion_del_negocio + "\n\n" +
"## Debe contener la respuesta\n" + debe_contener.map(b => "- " + b).join("\n") + "\n\n" +
"## NUNCA decir\n" + nunca_decir.map(b => "- " + b).join("\n") + "\n\n" +
"## Cuándo escalar a humano\n" + cuando_escalar.map(b => "- " + b).join("\n")
```
Header strings mirror `parser.ts:151-161` recognized headers. Import this helper from BOTH `agent-knowledge-base.ts` (domain re-embed) and the migration re-embed pass.

---

### `supabase/migrations/XXXX_kb_scope_summary.sql` (migration — DDL + backfill, Regla 5)

**Analog:** `supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql` (same table, ALTER ADD COLUMN IF NOT EXISTS + header comment documenting Regla 5/6 + rollback block).

**Pattern to replicate** (`20260516193830:18-23`):
```sql
ALTER TABLE public.agent_knowledge_base
  ADD COLUMN IF NOT EXISTS scope_summary TEXT;   -- NULL allowed (parser.ts:24 .optional())
```
Then SQL `UPDATE` backfill per `(topic, agent_id, workspace_id)` from the 18 `.md` frontmatters (Approach 1, A2). Re-embed pass (OpenAI — not pure SQL) runs AFTER the column exists via the canonical serializer (Pitfall 6 ordering). Include the Regla 5/Regla 6 header comment + a manual `-- ROLLBACK` block like `20260516193830:74-82`.

---

### `supabase/migrations/XXXX_kb_versions_table.sql` (migration — versions table)

**Analog:** `supabase/migrations/20260204000001_task_notes_history.sql` (the `task_activity` snapshot/audit table — FK ON DELETE CASCADE, workspace_id, America/Bogota timestamp, immutable design).

**Pattern to replicate** (`20260204000001:46-64` shape; RESEARCH §KB Versioning gives the exact column list):
```sql
CREATE TABLE public.agent_knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES public.agent_knowledge_base(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  -- full snapshot of editable fields (no embedding — restore re-embeds)
  version_num INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE (kb_id, version_num)
);
GRANT ALL ON TABLE public.agent_knowledge_base_versions TO service_role;
GRANT SELECT ON TABLE public.agent_knowledge_base_versions TO authenticated;
```
Note: do NOT store `embedding` in versions (1536 floats × N = waste). Use `timezone('America/Bogota', NOW())` for `created_at` (Regla 2, matching `20260204000001:26`).

---

### `src/app/actions/agent-templates.ts` + `agent-knowledge-base.ts` (server actions, request-response)

**Analog:** `src/app/actions/agent-config.ts` (admin gate) + `src/app/(dashboard)/agentes/crm-tools/_actions.ts` (zod validation + `getActiveWorkspaceId` + `revalidatePath`, zero `createAdminClient`).

**Admin gate to replicate** (`agent-config.ts:22-55,125-135` — D-07):
```typescript
async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const workspaceId = (await cookies()).get('morfx_workspace')?.value
  if (!workspaceId) return null
  return { user, workspaceId, supabase }
}
async function isWorkspaceAdmin(supabase, workspaceId, userId): Promise<boolean> {
  const { data } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', userId).single()
  return data?.role === 'owner' || data?.role === 'admin'
}
// in mutation action:
const isAdmin = await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)
if (!isAdmin) return { error: 'Solo el propietario o administrador puede ...' }
```

**Zod validation + domain delegation + revalidate** (`crm-tools/_actions.ts:21-65`):
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
const SaveInputSchema = z.object({ /* ... */ })
export async function saveX(input) {
  const v = SaveInputSchema.safeParse(input)
  if (!v.success) return { success: false, error: `Validacion fallida: ...` }
  const result = await updateXDomain({ workspaceId, source: 'server-action' as const }, v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Unknown error' }
  revalidatePath('/agentes/content-editor')
  return { success: true, data: result.data }
}
```
**Regla 3 gate:** these server-action files must NOT import `createAdminClient` (verifiable via grep). All DB access through the new domain.

---

### UI page + tab + components (RSC + client)

**Tab entry analog** (`src/app/(dashboard)/agentes/layout.tsx:8-14`) — add to the `tabs` array (additive):
```typescript
const tabs = [
  { href: '/agentes', label: 'Dashboard', icon: BarChart3, exact: true },
  { href: '/agentes/crm-tools', label: 'Herramientas CRM', icon: Wrench, exact: false },
  // + { href: '/agentes/content-editor', label: 'Contenido', icon: FileText, exact: false },
]
```

**Page/list/form structure analog:** `src/app/(dashboard)/agentes/crm-tools/` (co-located `_actions.ts` + `_components/`) and `src/app/(dashboard)/configuracion/whatsapp/templates/` (`page.tsx` + `components/template-list.tsx` + `components/template-form.tsx`). Recommended layout: `/agentes/content-editor/page.tsx` + agent selector + two sub-tabs (Templates | Conocimiento), `_components/` + `_actions.ts`.

**Agent selector analog** (`src/lib/agents/agent-catalog.ts:19-45`): feed the selector from `AGENT_CATALOG`. Editability gate is a pure constant `editable = (agentId === 'somnio-sales-v4')` (D-02); all others render a "PRODUCCIÓN — solo lectura" badge + disabled inputs (D-04). A3: catalog has 5 entries but D-04 lists 7 — planner decides whether to extend `AGENT_CATALOG` additively (add `somnio-recompra-v1` + `somnio-sales-v3-pw-confirmation`) or build a content-editor-local list.

---

### Image upload (file-I/O) — D-05

**Route analog (reuse as-is):** `src/app/api/config-builder/templates/upload/route.ts` — auth → `morfx_workspace` cookie → `workspace_members` membership → MIME allowlist (`image/jpeg`,`image/png`) ≤5MB → upload to bucket `whatsapp-media` path `templates/{workspaceId}/{timestamp}_{safeName}` → returns `{ storagePath, publicUrl, mimeType }`.

**Public URL** (`whatsapp-templates.ts:113-115`):
```typescript
const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(storagePath)
```

**Client component analog** (`builder/components/image-uploader.tsx:30-68`): file input + client-side validation + `URL.createObjectURL` preview + multipart POST + `sonner` toast on error. For D-05: when `content_type='imagen'`, autofill the returned `publicUrl` into the template's `content` field. Bucket already public — no new bucket.

---

### `scripts/knowledge-sync.ts` (MODIFY — guard, D-01 / Pitfall 4)

**Analog:** the flag-gate pattern in `src/inngest/functions/knowledge-sync-v4.ts:57-83` (reads `platform_config.somnio_v4_kb_sync_enabled`, no-op when off).

**Current danger** (`scripts/knowledge-sync.ts:30-54`): NO flag — always syncs every `.md`→DB unconditionally. A dev running it after UI edits overwrites DB with stale `.md`.

**Recommended guard (smallest safe change):** abort if `SELECT count(*) FROM agent_knowledge_base WHERE agent_id='somnio-sales-v4'` > 0 unless `--force`/`--seed`, with a loud D-01 warning. Inngest function stays flag-`false` (already the default); add a guard comment documenting that flipping it ON clobbers UI edits.

---

### Tests (vitest)

**Analog:** `src/lib/domain/__tests__/resolve-or-create-contact.test.ts` (S-4 mock pattern — chain `createAdminClient → from → select/eq/or/limit/is` thenable builder + `singleMock` for insert, no real DB). Same mock harness for `agent-templates.test.ts` (D-02 reject non-v4, D-08 reject unknown intent, Regla 3) and `agent-knowledge-base.test.ts` (D-01b two-edits→2 version rows, D-06 mock `generateEmbedding` throw→row unchanged, D-09 create embeds+inserts, D-10 edit changes `body_hash`).

**`serialize.test.ts`:** pure-function test of `buildContentToEmbed` — assert exact output string for a fixture row (locks A1). No mocks needed.

---

## Shared Patterns

### DomainContext / DomainResult
**Source:** `src/lib/domain/types.ts:15-40`
**Apply to:** both new domain files — `ctx: DomainContext` in, `Promise<DomainResult<T>>` out, `source: 'server-action'`.

### createAdminClient ONLY inside domain + explicit workspace filter
**Source:** `whatsapp-templates.ts:75-83`, `crm-query-tools-config.ts:50-62`
**Apply to:** every query in both domain files — `.eq('workspace_id', ctx.workspaceId)` (mandatory for KB since it has NO RLS — Pitfall 2). Regla 3: zero `createAdminClient` in server-action / UI / route files (grep gate).

### Admin gate
**Source:** `src/app/actions/agent-config.ts:22-55`
**Apply to:** every mutation server action (D-07). Reads allowed to any member; mutations require `owner`/`admin`.

### Re-embed (hash-guard + generateEmbedding reuse)
**Source:** `sync.ts:42-64` + `embed.ts:36`
**Apply to:** `agent-knowledge-base.ts` create/update/restore — compute hash from the canonical serializer, skip OpenAI when unchanged, embed BEFORE DB write (D-06).

### America/Bogota timestamps
**Source:** `20260204000001_task_notes_history.sql:26` (`timezone('America/Bogota', NOW())`); Regla 2
**Apply to:** versions table `created_at`, KB `last_reviewed_at`.

---

## No Analog Found

None. Every file maps to an existing codebase pattern. The only genuinely NEW logic is the canonical serializer (`serialize.ts`), and even that is the extraction/inversion of `sync.ts:42-44` + `parser.ts:108-174` (analog present, transform direction reversed).

## Metadata

**Analog search scope:** `src/lib/domain/`, `src/lib/domain/__tests__/`, `src/lib/agents/somnio-v4/knowledge-base/`, `src/lib/agents/somnio/`, `src/lib/agents/agent-catalog.ts`, `src/app/actions/`, `src/app/(dashboard)/agentes/`, `src/app/(dashboard)/configuracion/whatsapp/templates/`, `src/app/api/config-builder/templates/upload/`, `src/inngest/functions/`, `scripts/`, `supabase/migrations/`
**Files scanned/read:** 14 (whatsapp-templates, types, sync, embed, parser, agent-config, knowledge-sync script + Inngest, agentes layout, crm-tools _actions, agent-catalog, upload route + image-uploader, crm-query-tools-config, template-manager, RAG migration, task_notes_history migration, resolve-or-create-contact test)
**Pattern extraction date:** 2026-06-01

## PATTERN MAPPING COMPLETE
