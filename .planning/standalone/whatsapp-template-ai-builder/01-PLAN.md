---
phase: whatsapp-template-ai-builder
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .claude/rules/agent-scope.md
  - supabase/migrations/20260421000000_builder_sessions_kind.sql
  - src/lib/builder/session-store.ts
  - src/lib/builder/types.ts
  - src/lib/whatsapp/templates-api.ts
autonomous: false  # Contains [BLOCKING] migration pause (Regla 5)
requirements: [D-09, D-10, D-11, D-15]
user_setup: []

must_haves:
  truths:
    - "Agent scope 'config-builder-whatsapp-templates' is registered in .claude/rules/agent-scope.md BEFORE any tool handler code exists (mandate from .claude/rules/agent-scope.md)"
    - "builder_sessions table has a 'kind' column (TEXT NOT NULL DEFAULT 'automation' CHECK IN ('automation','template'))"
    - "User has applied the migration in production BEFORE any code referencing 'kind' is pushed (Regla 5)"
    - "session-store.ts accepts optional kind param and defaults to 'automation' so the automation builder keeps working unchanged (Regla 6)"
    - "uploadHeaderImage360() is exported from src/lib/whatsapp/templates-api.ts using D360-API-KEY auth (NOT OAuth) and returning { handle }"
  artifacts:
    - path: ".claude/rules/agent-scope.md"
      provides: "Agent scope for config-builder-whatsapp-templates"
      contains: "config-builder-whatsapp-templates"
    - path: "supabase/migrations/20260421000000_builder_sessions_kind.sql"
      provides: "ALTER TABLE migration adding kind column + index"
      contains: "ALTER TABLE builder_sessions"
    - path: "src/lib/builder/session-store.ts"
      provides: "createSession/getSessions with optional kind param"
      contains: "kind"
    - path: "src/lib/whatsapp/templates-api.ts"
      provides: "uploadHeaderImage360 resumable upload helper"
      contains: "export async function uploadHeaderImage360"
  key_links:
    - from: "src/lib/whatsapp/templates-api.ts:uploadHeaderImage360"
      to: "360 Dialog /uploads + /{session_id}"
      via: "D360-API-KEY header"
      pattern: "D360-API-KEY"
    - from: "src/lib/builder/session-store.ts"
      to: "builder_sessions.kind column"
      via: "INSERT/SELECT with kind filter"
      pattern: "kind"
---

<objective>
Foundation wave: (1) register the new AI agent scope per the mandatory scope-registration-before-code rule, (2) extend `builder_sessions` with a `kind` column so template-builder sessions can coexist with automation-builder sessions in the same table, (3) PAUSE for the user to apply the migration in production (Regla 5), (4) update `session-store.ts` so it can route by `kind` while remaining backward-compatible with the automation builder (Regla 6), and (5) add the `uploadHeaderImage360` helper that uses the 360 Dialog resumable `/uploads` endpoint to obtain permanent Meta handles for IMAGE headers in templates.

Purpose: This is the load-bearing substrate for every subsequent plan. Without the scope entry, agent code cannot be merged. Without the migration applied in prod, pushing any code that reads/writes `kind` will crash prod (the incident we protect against with Regla 5). Without `uploadHeaderImage360`, the domain layer in Plan 02 cannot populate `header_handle` and IMAGE templates cannot be created (D-10, D-11).

Output: Governance doc updated, migration file created + applied in prod, session-store extended, upload helper exported.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/agent-scope.md
@.claude/rules/code-changes.md
@.claude/rules/gsd-workflow.md
@.planning/standalone/whatsapp-template-ai-builder/CONTEXT.md
@.planning/standalone/whatsapp-template-ai-builder/RESEARCH.md
@.planning/standalone/whatsapp-template-ai-builder/PATTERNS.md

<interfaces>
From src/lib/builder/types.ts (relevant exports):
```typescript
export interface BuilderSession {
  id: string
  workspace_id: string
  user_id: string
  title: string | null
  messages: unknown[]
  automations_created: string[]
  created_at: string
  updated_at: string
  // kind will be added below
}
```

From src/lib/whatsapp/templates-api.ts (existing, lines 47-75, DO NOT MODIFY):
```typescript
const BASE_URL = 'https://waba-v2.360dialog.io'

export async function createTemplate360(
  apiKey: string,
  params: CreateTemplateParams
): Promise<CreateTemplateResponse>  // uses 'D360-API-KEY' header
```

From src/lib/builder/session-store.ts (existing functions to extend, all use createAdminClient):
- createSession(workspaceId, userId, title?) — must stay backward-compatible
- getSession(sessionId, workspaceId)
- getSessions(workspaceId, userId, limit)
- updateSession(sessionId, workspaceId, patch)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1.1: Register 'config-builder-whatsapp-templates' scope in agent-scope.md</name>
  <files>.claude/rules/agent-scope.md</files>
  <read_first>
    - .claude/rules/agent-scope.md (existing — you MUST read the CRM Reader Bot + CRM Writer Bot entries to match the prose/structure)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-15 is the LOCKED source of truth for this scope)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `.claude/rules/agent-scope.md` — has the exact markdown block to append, verbatim)
  </read_first>
  <action>
    Append a new H3 entry under the existing "## Scopes por Agente" section (after the CRM Writer Bot entry), using this exact content:

    ```markdown
    ### Config Builder: WhatsApp Templates (`config-builder-whatsapp-templates` — UI `/configuracion/whatsapp/templates/builder`)
    - **PUEDE:**
      - Crear templates de WhatsApp (SOLO via domain `createTemplate` en `src/lib/domain/whatsapp-templates.ts`)
      - Subir imagenes de header al bucket `whatsapp-media` path `templates/{workspaceId}/{timestamp}_{safeName}`
      - Consultar templates existentes (solo lectura, para detectar duplicados y cooldown de 30 dias)
      - Sugerir categoria (MARKETING / UTILITY / AUTHENTICATION), idioma (es / es_CO / en_US) y mapping de variables
    - **NO PUEDE:**
      - Editar o eliminar templates ya creados (limitacion Meta: solo se elimina y recrea)
      - Crear/editar tags, pipelines, etapas, contactos, pedidos, tareas, usuarios, templates de otro modulo
      - Enviar mensajes de WhatsApp directamente (SEND no se toca — D-16/D-17)
      - Ejecutar `createTemplate360()` o `supabase.from('whatsapp_templates').insert()` sin pasar por domain (Regla 3)
      - Acceder a otros workspaces (workspace_id viene del cookie `morfx_workspace` validado en route handler, nunca del body)
    - **Validacion:**
      - Tool `submitTemplate.execute` llama EXCLUSIVAMENTE a `createTemplate` del domain; CERO `createAdminClient` + `insert` directo en `src/lib/config-builder/templates/tools.ts` (verificable con grep)
      - System prompt `buildTemplatesSystemPrompt` incluye lista textual de PUEDE / NO PUEDE y prohibicion explicita de crear recursos fuera del scope
      - Agent ID registrado: `'config-builder-whatsapp-templates'`
      - stopWhen: `stepCountIs(6)` — ciclo maximo list -> draft -> preview -> validate -> upload -> submit
    ```

    CRITICAL: this entry MUST exist BEFORE any file under `src/lib/config-builder/templates/` or `src/app/api/config-builder/` is created. `.claude/rules/agent-scope.md` line 60 says "BLOQUEANTE: No se puede mergear un agente nuevo sin scope definido en este archivo." Do not skip this step.

    Do not touch the existing CRM Reader Bot or CRM Writer Bot entries.
  </action>
  <verify>
    <automated>grep -q "config-builder-whatsapp-templates" .claude/rules/agent-scope.md &amp;&amp; grep -q "stepCountIs(6)" .claude/rules/agent-scope.md &amp;&amp; grep -q "templates/{workspaceId}" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `.claude/rules/agent-scope.md` contains `config-builder-whatsapp-templates`
    - `.claude/rules/agent-scope.md` contains `Config Builder: WhatsApp Templates`
    - `.claude/rules/agent-scope.md` contains `stepCountIs(6)`
    - `.claude/rules/agent-scope.md` contains `createTemplate` and references `src/lib/domain/whatsapp-templates.ts`
    - Existing `crm-reader` and `crm-writer` sections remain unchanged (grep finds them exactly as before)
  </acceptance_criteria>
  <done>The new scope entry exists with PUEDE / NO PUEDE / Validacion subsections matching the reference markdown above.</done>
</task>

<task type="auto">
  <name>Task 1.2: Create migration file adding 'kind' column to builder_sessions</name>
  <files>supabase/migrations/20260421000000_builder_sessions_kind.sql</files>
  <read_first>
    - supabase/migrations/20260214000000_builder_sessions.sql (existing CREATE TABLE to alter)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `supabase/migrations/20260421XXXXXX_builder_sessions_kind.sql` — exact SQL)
    - CLAUDE.md (Regla 5)
  </read_first>
  <action>
    Create a new migration file at `supabase/migrations/20260421000000_builder_sessions_kind.sql` with EXACTLY this content:

    ```sql
    -- ============================================================================
    -- Standalone: whatsapp-template-ai-builder
    -- Adds a 'kind' column to builder_sessions so the table can host multiple
    -- builder flavors (automation / template / future config builders).
    --
    -- Existing rows default to 'automation' so the automation builder keeps
    -- working without any code change. The CHECK constraint pins the allowed
    -- values for this standalone; extending it later is a new ALTER.
    -- ============================================================================

    ALTER TABLE builder_sessions
      ADD COLUMN kind TEXT NOT NULL DEFAULT 'automation'
        CHECK (kind IN ('automation', 'template'));

    CREATE INDEX idx_builder_sessions_workspace_kind
      ON builder_sessions(workspace_id, kind, updated_at DESC);

    COMMENT ON COLUMN builder_sessions.kind IS
      'Builder flavor: automation (Phase 19) or template (standalone whatsapp-template-ai-builder). Extend CHECK constraint when adding new flavors.';
    ```

    Use the exact timestamp `20260421000000` for the filename. Filename prefix sorts after the latest existing migration (latest is `20260420...` era — confirm by `ls supabase/migrations/` if unsure; if a later file exists, bump to `20260421XXXXXX` where X > existing).

    After creating the file, STOP. The next task is the migration application pause — do NOT proceed to code changes that depend on this column in this task.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260421000000_builder_sessions_kind.sql &amp;&amp; grep -q "ALTER TABLE builder_sessions" supabase/migrations/20260421000000_builder_sessions_kind.sql &amp;&amp; grep -q "kind IN ('automation', 'template')" supabase/migrations/20260421000000_builder_sessions_kind.sql &amp;&amp; grep -q "idx_builder_sessions_workspace_kind" supabase/migrations/20260421000000_builder_sessions_kind.sql</automated>
  </verify>
  <acceptance_criteria>
    - File exists at `supabase/migrations/20260421000000_builder_sessions_kind.sql`
    - Contains `ALTER TABLE builder_sessions`
    - Contains `ADD COLUMN kind TEXT NOT NULL DEFAULT 'automation'`
    - Contains `CHECK (kind IN ('automation', 'template'))`
    - Contains `CREATE INDEX idx_builder_sessions_workspace_kind`
  </acceptance_criteria>
  <done>Migration file created and syntactically correct. No code uses `kind` yet.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1.3: [BLOCKING] Apply migration in Supabase production (Regla 5)</name>
  <what-built>
    Migration file `supabase/migrations/20260421000000_builder_sessions_kind.sql` has been created. It has NOT been applied in production.

    Per CLAUDE.md Regla 5 ("TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa"), the user must apply this migration BEFORE Task 1.4 (which modifies session-store.ts to reference the `kind` column) and all subsequent plans can run.

    This is the same pattern that caused the 20h incident in the project history — code referencing columns that did not exist in production.
  </what-built>
  <how-to-verify>
    1. Open the Supabase dashboard for the production project (morfx-new)
    2. Go to: Database → SQL Editor
    3. Copy-paste the contents of `supabase/migrations/20260421000000_builder_sessions_kind.sql` into a new query
    4. Run the query. Expected output: "Success. No rows returned."
    5. Verify the column exists by running: `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'builder_sessions' AND column_name = 'kind';`
    6. Expected: one row returned with `data_type = 'text'` and `column_default = "'automation'::text"`
    7. Optionally run: `SELECT COUNT(*) FROM builder_sessions WHERE kind = 'automation';` — should equal the total row count (all existing rows backfilled to 'automation')
    8. Reply "migration applied" or "listo" to resume.

    If the migration fails (e.g., constraint conflict), copy the error message back to the conversation — do NOT proceed to Task 1.4.
  </how-to-verify>
  <resume-signal>Type "migration applied" or "listo" when the migration has been successfully applied in Supabase production.</resume-signal>
</task>

<task type="auto">
  <name>Task 1.4: Extend session-store.ts + types to accept optional 'kind' param (backward-compatible)</name>
  <files>src/lib/builder/types.ts, src/lib/builder/session-store.ts</files>
  <read_first>
    - src/lib/builder/types.ts (the `BuilderSession` type to extend)
    - src/lib/builder/session-store.ts (full file — ALL exported CRUD functions)
    - src/app/api/builder/chat/route.ts (caller — so you can verify nothing breaks)
    - src/app/api/builder/sessions/route.ts (caller — so you can verify nothing breaks)
    - CLAUDE.md (Regla 6 — automation builder MUST keep working)
  </read_first>
  <action>
    Make TWO surgical edits. Do NOT break any existing caller.

    **Edit 1 — `src/lib/builder/types.ts`:** Add the `kind` field to the `BuilderSession` interface:

    ```typescript
    export interface BuilderSession {
      id: string
      workspace_id: string
      user_id: string
      title: string | null
      messages: unknown[]
      automations_created: string[]
      kind: 'automation' | 'template'  // ADD THIS LINE
      created_at: string
      updated_at: string
    }
    ```

    **Edit 2 — `src/lib/builder/session-store.ts`:** Extend the four CRUD functions to accept/filter by `kind`. Default `'automation'` EVERYWHERE so existing callers (automation builder routes) keep working unchanged.

    2a. Update `createSession` signature + body:

    ```typescript
    export async function createSession(
      workspaceId: string,
      userId: string,
      title?: string,
      kind: 'automation' | 'template' = 'automation'  // NEW optional param, defaults 'automation'
    ): Promise<BuilderSession | null> {
      // ... existing try block, but add kind to insert payload:
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        title: title || null,
        messages: [],
        automations_created: [],
        kind,  // ADD
      })
      // ... rest unchanged
    }
    ```

    2b. Update `getSessions` (list function) to accept optional `kind` filter. Current signature: `getSessions(workspaceId, userId, limit)`. New signature: `getSessions(workspaceId, userId, limit, kind?: 'automation' | 'template')`. In the body, add a `.eq('kind', kind)` clause ONLY when `kind !== undefined`:

    ```typescript
    let query = supabase.from('builder_sessions').select(...)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (kind !== undefined) {
      query = query.eq('kind', kind)
    }

    const { data, error } = await query
    ```

    Note: this means calls WITHOUT `kind` return all kinds (preserves automation-builder's existing list behavior UNLESS you verify it breaks — in that case, default to `'automation'` instead). Preferred behavior: explicit callers pass the filter, undefined means "no filter" for backward compat. Verify by reading `src/app/api/builder/sessions/route.ts` what it currently expects.

    2c. `getSession(sessionId, workspaceId)` — DO NOT add `kind` filter here. Fetching by primary key is already secure; callers that need kind-isolation can check `.kind` on the returned object.

    2d. `updateSession(sessionId, workspaceId, patch)` — DO NOT add `kind` to patch (kind is immutable after creation).

    **Regla 6 sanity check:** After these edits, the automation builder's routes at `/api/builder/chat` and `/api/builder/sessions` MUST continue to work. Their existing calls `createSession(ws, uid, title)` (no kind) will default to `'automation'`; their list call will return all kinds (which for existing workspaces means only automations exist so far). This is backward-compatible.

    Do NOT modify `src/app/api/builder/chat/route.ts` or `src/app/api/builder/sessions/route.ts` — those stay as-is (Regla 6: protect production agent).
  </action>
  <verify>
    <automated>grep -q "kind: 'automation' | 'template'" src/lib/builder/types.ts &amp;&amp; grep -q "kind: 'automation' | 'template' = 'automation'" src/lib/builder/session-store.ts &amp;&amp; grep -q "kind," src/lib/builder/session-store.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep -v "node_modules" | head -20 | grep -qv "error TS" || echo "TS OK"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/builder/types.ts` contains `kind: 'automation' | 'template'`
    - `src/lib/builder/session-store.ts` signature of `createSession` contains `kind: 'automation' | 'template' = 'automation'`
    - `src/lib/builder/session-store.ts` insert payload contains a `kind` field
    - `src/lib/builder/session-store.ts` `getSessions` accepts optional `kind` param
    - `src/app/api/builder/chat/route.ts` and `src/app/api/builder/sessions/route.ts` remain UNMODIFIED (grep -L or git diff confirms)
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>session-store compiles with the new column references, all existing automation-builder call sites still compile unchanged.</done>
</task>

<task type="auto">
  <name>Task 1.5: Add uploadHeaderImage360() resumable-upload helper</name>
  <files>src/lib/whatsapp/templates-api.ts</files>
  <read_first>
    - src/lib/whatsapp/templates-api.ts (full file — you will APPEND to it; do NOT touch existing createTemplate360, listTemplates360, deleteTemplate360)
    - .planning/standalone/whatsapp-template-ai-builder/RESEARCH.md (Example 1, lines 479-568 — has the exact function body to copy verbatim)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/lib/whatsapp/templates-api.ts` (EXTEND))
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-10, D-11 — resumable /uploads, NOT /media; D360-API-KEY NOT OAuth)
  </read_first>
  <action>
    APPEND to `src/lib/whatsapp/templates-api.ts` (do NOT modify existing content). Add the `UploadHeaderImageResult` interface and the `uploadHeaderImage360` function at the bottom of the file, BEFORE any default export if present (file currently has only named exports; append at end is fine).

    Copy VERBATIM from RESEARCH.md Example 1 (lines 497-567). Exact code to append:

    ```typescript

    // ============================================================================
    // RESUMABLE UPLOAD (for template IMAGE headers)
    // Meta requires a permanent file handle (not URL, not temporary media ID) in
    // example.header_handle[0] when creating a template with an IMAGE header.
    // 360 Dialog proxies Meta's Resumable Upload API with D360-API-KEY auth.
    //
    // Two-step flow:
    //   1. POST /uploads?file_length=X&file_type=image/jpeg  -> { id: "upload:MTphd..." }
    //   2. POST /{session_id}   headers file_offset: 0       -> { h: "4::aW..." }
    // ============================================================================

    export interface UploadHeaderImageResult {
      handle: string  // "4::aW..."
    }

    /**
     * Upload an image to 360 Dialog and obtain a permanent file handle suitable
     * for use in example.header_handle[0] at template creation time.
     *
     * @param apiKey - Workspace D360-API-KEY
     * @param bytes - Raw image bytes (Uint8Array / Buffer / ArrayBuffer)
     * @param mimeType - 'image/jpeg' | 'image/png'
     * @param fileName - Informational only (360 stores it; Meta uses it in the UI)
     * @returns { handle } - the "h" value from Meta
     */
    export async function uploadHeaderImage360(
      apiKey: string,
      bytes: ArrayBuffer | Uint8Array,
      mimeType: 'image/jpeg' | 'image/png',
      fileName: string
    ): Promise<UploadHeaderImageResult> {
      const fileLength =
        bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length

      // ---- Step 1: create upload session ----
      const sessionUrl = new URL(`${BASE_URL}/uploads`)
      sessionUrl.searchParams.set('file_length', String(fileLength))
      sessionUrl.searchParams.set('file_type', mimeType)
      sessionUrl.searchParams.set('file_name', fileName)

      const sessionRes = await fetch(sessionUrl.toString(), {
        method: 'POST',
        headers: { 'D360-API-KEY': apiKey },
      })

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}))
        throw new Error(
          err.error?.message || `Upload session failed: ${sessionRes.status}`
        )
      }

      const { id: sessionId } = (await sessionRes.json()) as { id: string }
      if (!sessionId || !sessionId.startsWith('upload:')) {
        throw new Error(`Unexpected session id format: ${sessionId}`)
      }

      // ---- Step 2: upload bytes ----
      // The session id already contains the "upload:" prefix - the endpoint path
      // uses it as-is per docs.360dialog.com's example.
      const uploadRes = await fetch(`${BASE_URL}/${sessionId}`, {
        method: 'POST',
        headers: {
          'D360-API-KEY': apiKey,
          'file_offset': '0',
          'Content-Type': mimeType,
        },
        body: bytes as BodyInit,
      })

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}))
        throw new Error(
          err.error?.message || `Upload bytes failed: ${uploadRes.status}`
        )
      }

      const { h } = (await uploadRes.json()) as { h: string }
      if (!h) throw new Error('Upload response missing handle "h"')

      return { handle: h }
    }
    ```

    Critical invariants (anti-Pitfall 2 from RESEARCH.md):
    - Use `'D360-API-KEY': apiKey` header, NEVER `Authorization: OAuth ...`
    - `BASE_URL` is already declared at line 17 (`https://waba-v2.360dialog.io`) — reuse it, do NOT redeclare
    - Use existing `fetch` — no new HTTP client libs
  </action>
  <verify>
    <automated>grep -q "export async function uploadHeaderImage360" src/lib/whatsapp/templates-api.ts &amp;&amp; grep -q "export interface UploadHeaderImageResult" src/lib/whatsapp/templates-api.ts &amp;&amp; grep -q "'D360-API-KEY': apiKey" src/lib/whatsapp/templates-api.ts &amp;&amp; ! grep -q "Authorization: OAuth" src/lib/whatsapp/templates-api.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "templates-api.ts" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/whatsapp/templates-api.ts` contains `export async function uploadHeaderImage360`
    - `src/lib/whatsapp/templates-api.ts` contains `export interface UploadHeaderImageResult`
    - `src/lib/whatsapp/templates-api.ts` contains `'D360-API-KEY': apiKey` (the header)
    - `src/lib/whatsapp/templates-api.ts` does NOT contain `Authorization: OAuth` anywhere
    - `src/lib/whatsapp/templates-api.ts` contains `${BASE_URL}/uploads` (step 1 endpoint)
    - `src/lib/whatsapp/templates-api.ts` contains `${BASE_URL}/${sessionId}` (step 2 endpoint)
    - Existing `createTemplate360` function is unchanged (line-for-line diff shows only additions at file tail)
    - `npx tsc --noEmit` reports zero errors in `templates-api.ts`
  </acceptance_criteria>
  <done>Helper is exported and uses the correct auth header + resumable two-step flow. Downstream plans can import it from `@/lib/whatsapp/templates-api`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| builder → 360 Dialog API | Workspace API key crosses network; resumable upload handles binary bytes |
| supabase migration → production DB | DDL applied by human via SQL Editor; no code executes it |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | Migration file | mitigate | Filename timestamp sorts correctly; CHECK constraint enforces enum at DB level; DEFAULT backfills existing rows safely |
| T-01-02 | Information Disclosure | `uploadHeaderImage360` | mitigate | API key passed only in `D360-API-KEY` header (never query string); no logging of the key in errors (we throw `err.error?.message`) |
| T-01-03 | Denial of Service | `uploadHeaderImage360` | accept | Input size validation happens in Plan 03 upload route (5 MB cap). This helper is trusted because callers are server-side only. |
| T-01-04 | Elevation of Privilege | Agent scope doc | mitigate | Scope registered BEFORE any tool handler exists; code in Plan 03 MUST reference the agent ID declared here. Governance enforced by `.claude/rules/agent-scope.md` line 60. |
| T-01-05 | Repudiation | session-store `kind` | accept | `kind` is immutable post-insert (not in updateSession patch); audit trail via created_at + workspace_id + user_id |
| T-01-06 | Spoofing | session-store.getSessions | mitigate | Still filters by `workspace_id` AND `user_id` (unchanged from automation builder); `kind` is an additive filter, not a replacement for authz |
</threat_model>

<verification>
End-of-plan checks:

1. `npx tsc --noEmit -p .` — zero new errors introduced
2. `.claude/rules/agent-scope.md` has the new scope entry
3. Migration file exists and is applied in production (user confirmation received in Task 1.3)
4. `grep -R 'createSession(' src/app/api/builder/` shows no compile-broken callers (all still pass 3 args — `kind` defaults)
5. `src/lib/whatsapp/templates-api.ts` has the new helper alongside the untouched existing `createTemplate360`
</verification>

<success_criteria>
- Agent scope registered per `.claude/rules/agent-scope.md` mandate
- Migration applied in prod (Regla 5)
- session-store backward-compatible; automation builder is NOT broken (Regla 6)
- `uploadHeaderImage360` exported using D360-API-KEY and resumable /uploads endpoint
- All verify checks pass
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-template-ai-builder/01-SUMMARY.md` documenting:
- Exact migration filename + timestamp
- User's confirmation that the migration is applied in prod
- The exact signature of `uploadHeaderImage360`
- Any deviation from the plan
- Git commit SHAs for the scope change, migration file, session-store edit, and templates-api helper
</output>
