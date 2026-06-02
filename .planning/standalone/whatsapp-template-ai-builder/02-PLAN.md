---
phase: whatsapp-template-ai-builder
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/domain/whatsapp-templates.ts
  - src/app/actions/templates.ts
autonomous: true
requirements: [D-02, D-05, D-06, D-07, D-09, D-10, D-11, D-14, D-16, D-17]
user_setup: []

must_haves:
  truths:
    - "All mutations to whatsapp_templates go through src/lib/domain/whatsapp-templates.ts (Regla 3, D-14)"
    - "Creating a template with headerImage uploads to 360 Dialog via uploadHeaderImage360 and populates components[HEADER].example.header_handle[0] (D-10, D-11)"
    - "Creating a template with TEXT-only header (no image) works exactly as before — existing form at /configuracion/whatsapp/templates/nuevo continues to function (D-02 coexistence)"
    - "Server action src/app/actions/templates.ts:createTemplate delegates to domain (no direct INSERT, no direct createTemplate360 call)"
    - "A failed 360 Dialog submission leaves a row with status='REJECTED' + rejected_reason for diagnostic (D-16, D-17 — CREATE gap closed but observable)"
    - "Name uniqueness within workspace is enforced (duplicate returns clear error)"
    - "Body is required; footer is optional; header is optional — matches D-06 / D-05"
  artifacts:
    - path: "src/lib/domain/whatsapp-templates.ts"
      provides: "createTemplate domain function (single source of truth)"
      contains: "export async function createTemplate"
      min_lines: 80
    - path: "src/app/actions/templates.ts"
      provides: "Refactored createTemplate server action (thin wrapper over domain)"
      contains: "createTemplate as createTemplateDomain"
  key_links:
    - from: "src/lib/domain/whatsapp-templates.ts:createTemplate"
      to: "src/lib/whatsapp/templates-api.ts:createTemplate360"
      via: "direct call after DB insert"
      pattern: "createTemplate360"
    - from: "src/lib/domain/whatsapp-templates.ts:createTemplate"
      to: "src/lib/whatsapp/templates-api.ts:uploadHeaderImage360"
      via: "conditional call when params.headerImage present"
      pattern: "uploadHeaderImage360"
    - from: "src/app/actions/templates.ts:createTemplate"
      to: "src/lib/domain/whatsapp-templates.ts:createTemplate"
      via: "import alias + delegate"
      pattern: "createTemplateDomain"
---

<objective>
Unify the mutation pipeline for `whatsapp_templates` behind a single domain module, and refactor the existing server action to delegate to it. This closes the CREATE gap for IMAGE-header templates (D-16, D-17) while keeping the manual form at `/configuracion/whatsapp/templates/nuevo` fully functional (D-02 coexistence).

Purpose: Regla 3 mandates all mutations go through `src/lib/domain/`. Today, `src/app/actions/templates.ts:129` writes directly to the DB and calls `createTemplate360` directly — this is the existing debt. This plan fixes it AND adds the IMAGE branch (upload to 360 + patch `header_handle`) so that Plan 03's AI tool (`submitTemplate`) and the existing manual form both produce templates through the exact same code path. One entry, one set of invariants.

Output: New `src/lib/domain/whatsapp-templates.ts` implementing the full orchestration (uniqueness check → optional IMAGE upload → DB insert PENDING → createTemplate360 → mark submitted or mark rejected). Refactored server action that accepts an optional `headerImage` param and delegates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/agent-scope.md
@.planning/standalone/whatsapp-template-ai-builder/CONTEXT.md
@.planning/standalone/whatsapp-template-ai-builder/RESEARCH.md
@.planning/standalone/whatsapp-template-ai-builder/PATTERNS.md
@.planning/standalone/whatsapp-template-ai-builder/01-SUMMARY.md

<interfaces>
From src/lib/domain/types.ts (DomainContext + DomainResult — use these, do not reinvent):
```typescript
export interface DomainContext {
  workspaceId: string
  source: string  // 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter'
  cascadeDepth?: number
}
export type DomainResult<T> = { success: true; data: T } | { success: false; error: string }
```

From src/lib/whatsapp/types.ts (existing — read before using):
- TemplateComponent (with HEADER/BODY/FOOTER discriminator, `format` on header, optional `example`)
- TemplateCategory ('MARKETING' | 'UTILITY' | 'AUTHENTICATION')
- Template (the row shape)

From src/lib/whatsapp/templates-api.ts (extended in Plan 01):
```typescript
export async function createTemplate360(apiKey: string, params: CreateTemplateParams): Promise<CreateTemplateResponse>
export async function uploadHeaderImage360(apiKey: string, bytes: ArrayBuffer | Uint8Array, mimeType: 'image/jpeg' | 'image/png', fileName: string): Promise<UploadHeaderImageResult>
```

From src/lib/domain/tags.ts (analog — read lines 1-130 for the `assignTag` orchestration shape):
- Uses `createAdminClient()` ONLY (never `createClient()`)
- Every query filters by `ctx.workspaceId`
- Returns `DomainResult<T>` — never throws for known errors
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 2.1: Create src/lib/domain/whatsapp-templates.ts with createTemplate orchestrator</name>
  <files>src/lib/domain/whatsapp-templates.ts</files>
  <read_first>
    - src/lib/domain/types.ts (DomainContext, DomainResult)
    - src/lib/domain/tags.ts (full file — analog for orchestration shape)
    - src/lib/whatsapp/templates-api.ts (after Plan 01 — you will call createTemplate360 and uploadHeaderImage360)
    - src/lib/whatsapp/types.ts (TemplateComponent, TemplateCategory, Template)
    - .planning/standalone/whatsapp-template-ai-builder/RESEARCH.md (Example 2, lines 570-712 — has the exact function body to adapt)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/lib/domain/whatsapp-templates.ts`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-10, D-11, D-14)
  </read_first>
  <behavior>
    - Uniqueness: createTemplate(ctx, { name: "existing" }) → { success: false, error: "Ya existe un template..." }
    - TEXT-only: createTemplate(ctx, { components: [{ type:'HEADER', format:'TEXT', text:'Hola' }, { type:'BODY', text:'x' }], ... no headerImage }) → succeeds, no 360 upload call, no header_handle mutation
    - IMAGE happy path: createTemplate(ctx, { components: [{ type:'HEADER', format:'IMAGE' }, { type:'BODY', text:'x' }], headerImage: { storagePath, mimeType } }) → downloads from Storage → calls uploadHeaderImage360 → patches components[0].example.header_handle = [handle] → INSERTs with status='PENDING' → calls createTemplate360 → UPDATEs submitted_at
    - Storage download fail: { success: false, error: "No se pudo descargar imagen: ..." }
    - 360 upload fail: { success: false, error: "Error subiendo imagen a 360 Dialog: ..." }
    - 360 createTemplate fail (AFTER successful insert): row remains with status='REJECTED' and rejected_reason populated; returns { success: false, error: "360 Dialog rechazo..." }
  </behavior>
  <action>
    Create `src/lib/domain/whatsapp-templates.ts` with EXACTLY the content from RESEARCH.md Example 2 (lines 574-711), copied verbatim. For clarity the key structure is:

    ```typescript
    import { createAdminClient } from '@/lib/supabase/admin'
    import { createTemplate360, uploadHeaderImage360 } from '@/lib/whatsapp/templates-api'
    import type { DomainContext, DomainResult } from './types'
    import type {
      Template,
      TemplateCategory,
      TemplateComponent,
    } from '@/lib/whatsapp/types'

    export interface CreateTemplateParams {
      name: string
      language: string
      category: TemplateCategory
      components: TemplateComponent[]
      variableMapping: Record<string, string>
      headerImage?: {
        storagePath: string
        mimeType: 'image/jpeg' | 'image/png'
      }
      apiKey: string
    }

    export async function createTemplate(
      ctx: DomainContext,
      params: CreateTemplateParams
    ): Promise<DomainResult<Template>> {
      const supabase = createAdminClient()

      // 1. Uniqueness check (workspace_id + name)
      const { data: existing } = await supabase
        .from('whatsapp_templates')
        .select('id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('name', params.name)
        .maybeSingle()

      if (existing) {
        return { success: false, error: `Ya existe un template con nombre "${params.name}"` }
      }

      // 2. Upload image + patch header component (if IMAGE)
      let components = params.components
      if (params.headerImage) {
        const headerIdx = components.findIndex((c) => c.type === 'HEADER')
        if (headerIdx === -1 || components[headerIdx].format !== 'IMAGE') {
          return { success: false, error: 'HEADER IMAGE requiere archivo pero no se encontro componente' }
        }

        // Download bytes from Supabase Storage
        const { data: blob, error: dlErr } = await supabase.storage
          .from('whatsapp-media')
          .download(params.headerImage.storagePath)
        if (dlErr || !blob) {
          return { success: false, error: `No se pudo descargar imagen: ${dlErr?.message || 'unknown'}` }
        }

        // Upload to 360 Dialog resumable API
        let handle: string
        try {
          const bytes = await blob.arrayBuffer()
          const result = await uploadHeaderImage360(
            params.apiKey,
            bytes,
            params.headerImage.mimeType,
            params.headerImage.storagePath.split('/').pop() || 'header.jpg'
          )
          handle = result.handle
        } catch (err) {
          return {
            success: false,
            error: `Error subiendo imagen a 360 Dialog: ${err instanceof Error ? err.message : String(err)}`,
          }
        }

        // Patch the HEADER component with the handle
        components = components.map((c, i) =>
          i === headerIdx
            ? { ...c, example: { ...c.example, header_handle: [handle] } }
            : c
        )
      }

      // 3. Insert local row (PENDING)
      const { data: inserted, error: insErr } = await supabase
        .from('whatsapp_templates')
        .insert({
          workspace_id: ctx.workspaceId,
          name: params.name,
          language: params.language,
          category: params.category,
          status: 'PENDING',
          components,
          variable_mapping: params.variableMapping,
        })
        .select()
        .single()

      if (insErr || !inserted) {
        if (insErr?.code === '23505') {
          return { success: false, error: 'Nombre duplicado' }
        }
        return { success: false, error: `Error al insertar: ${insErr?.message}` }
      }

      // 4. Submit to 360 Dialog
      try {
        await createTemplate360(params.apiKey, {
          name: params.name,
          language: params.language,
          category: params.category,
          components,
        })

        // Mark submitted_at
        await supabase
          .from('whatsapp_templates')
          .update({ submitted_at: new Date().toISOString() })
          .eq('id', inserted.id)
          .eq('workspace_id', ctx.workspaceId)

        return { success: true, data: inserted as Template }
      } catch (apiErr) {
        const msg = apiErr instanceof Error ? apiErr.message : 'Error desconocido'
        // Mark rejected + store reason; keep row for diagnostic
        await supabase
          .from('whatsapp_templates')
          .update({ status: 'REJECTED', rejected_reason: msg })
          .eq('id', inserted.id)
          .eq('workspace_id', ctx.workspaceId)

        return { success: false, error: `360 Dialog rechazo el template: ${msg}` }
      }
    }
    ```

    Invariants (verifiable by grep):
    - File imports ONLY from `@/lib/supabase/admin`, `@/lib/whatsapp/templates-api`, `./types`, `@/lib/whatsapp/types` — no other imports
    - Uses `createAdminClient()` (not `createClient()`)
    - Every DB query has `.eq('workspace_id', ctx.workspaceId)` (or a `.insert({ workspace_id: ctx.workspaceId, ... })`) — grep should find at least 4 occurrences of `workspace_id`
    - No `console.log`/`console.error` (domain layer stays silent; caller decides what to log)
    - No triggers emitted (templates do not fire automations — differs from tags.ts which emits triggers)

    Note on TypeScript: `TemplateComponent.example.header_handle` must be assignable. If the existing type in `src/lib/whatsapp/types.ts` does not have `header_handle?: string[]` on the `example` field, extend it there — but ONLY if strictly necessary and in a backward-compatible way (add optional field). Read the type first; most likely it already supports it because the SEND path in `src/app/actions/messages.ts:465` reads `header_handle`.
  </action>
  <verify>
    <automated>test -f src/lib/domain/whatsapp-templates.ts &amp;&amp; grep -q "export async function createTemplate" src/lib/domain/whatsapp-templates.ts &amp;&amp; grep -q "uploadHeaderImage360" src/lib/domain/whatsapp-templates.ts &amp;&amp; grep -q "createTemplate360" src/lib/domain/whatsapp-templates.ts &amp;&amp; grep -q "createAdminClient" src/lib/domain/whatsapp-templates.ts &amp;&amp; ! grep -q "createClient()" src/lib/domain/whatsapp-templates.ts &amp;&amp; [ $(grep -c "workspace_id" src/lib/domain/whatsapp-templates.ts) -ge 4 ] &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "whatsapp-templates.ts" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/domain/whatsapp-templates.ts` exists
    - Exports `createTemplate` function with signature `(ctx: DomainContext, params: CreateTemplateParams) => Promise<DomainResult<Template>>`
    - Imports `createAdminClient` from `@/lib/supabase/admin`
    - Imports `createTemplate360` and `uploadHeaderImage360` from `@/lib/whatsapp/templates-api`
    - Does NOT import `createClient` from `@/lib/supabase/server` (domain uses admin only)
    - At least 4 occurrences of `workspace_id` (uniqueness check + insert + 2 update-by-id guards)
    - Contains the storage download call: `supabase.storage.from('whatsapp-media').download`
    - Contains `status: 'PENDING'` on insert
    - Contains `status: 'REJECTED'` on 360 error handler
    - Contains `header_handle: [handle]` patch
    - `npx tsc --noEmit` reports zero errors in this file
  </acceptance_criteria>
  <done>Domain module compiles, orchestration is complete, TEXT-only path is a no-op on the IMAGE branch.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.2: Refactor src/app/actions/templates.ts:createTemplate to delegate to domain</name>
  <files>src/app/actions/templates.ts</files>
  <read_first>
    - src/app/actions/templates.ts (full file — specifically the current `createTemplate` at ~line 129)
    - src/lib/domain/whatsapp-templates.ts (created in Task 2.1 — you will call this)
    - src/app/(dashboard)/configuracion/whatsapp/templates/nuevo (the form route — verify it imports the action; you must NOT break the form)
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx (the manual form — confirm its call shape)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/app/actions/templates.ts` (REFACTOR))
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-02 — form MUST keep working)
    - CLAUDE.md (Regla 3 pattern: "Server Action -> valida auth -> llama domain -> revalidatePath")
  </read_first>
  <action>
    Refactor the existing `createTemplate` server action in `src/app/actions/templates.ts` so that:

    1. Its type signature adds an OPTIONAL `headerImage` field:
    ```typescript
    export async function createTemplate(params: {
      name: string
      language?: string
      category: TemplateCategory
      components: TemplateComponent[]
      variable_mapping?: Record<string, string>
      headerImage?: { storagePath: string; mimeType: 'image/jpeg' | 'image/png' }  // NEW
    }): Promise<ActionResult<Template>>
    ```

    2. The body becomes a thin wrapper that (a) validates auth via `createClient()` / `supabase.auth.getUser()` (KEEP EXISTING auth code verbatim), (b) resolves `workspaceId` from cookie (KEEP EXISTING), (c) cleans the name regex (KEEP EXISTING, lines ~149-167 — or inline the same logic), (d) fetches `apiKey` from workspace settings (KEEP EXISTING, lines ~195-200), (e) delegates to domain, (f) translates DomainResult to ActionResult.

    3. Import the domain function with an alias to avoid name collision:
    ```typescript
    import { createTemplate as createTemplateDomain } from '@/lib/domain/whatsapp-templates'
    ```

    4. Replace the existing direct INSERT block (lines ~172-184) AND the existing `createTemplate360()` call block (lines ~202-218) with a single delegation:
    ```typescript
    const result = await createTemplateDomain(
      { workspaceId, source: 'server-action' },
      {
        name: cleanName,
        language: params.language || 'es',
        category: params.category,
        components: params.components,
        variableMapping: params.variable_mapping || {},
        headerImage: params.headerImage,
        apiKey,
      }
    )

    if (!result.success) {
      return { error: result.error || 'Error desconocido al crear template' }
    }

    revalidatePath('/configuracion/whatsapp/templates')
    return { success: true, data: result.data }
    ```

    5. DELETE the now-unreachable inline INSERT and inline `createTemplate360` calls from the old action body. DO NOT DELETE the auth / workspace / apiKey lookup preamble.

    6. The existing manual form at `template-form.tsx` calls `createTemplate({ name, language, category, components, variable_mapping })` WITHOUT `headerImage`. That call MUST continue to compile and work (TEXT-only path — domain's IMAGE branch is a no-op when `headerImage` is undefined).

    7. `revalidatePath('/configuracion/whatsapp/templates')` — keep exactly one, on the success path. If there's any other path calling `revalidatePath` in the old body, audit and remove duplicates.

    Post-refactor the function should be <50 lines (down from ~85), purely auth + workspace + apiKey + delegate.

    DO NOT touch other exports in `templates.ts` (listTemplates, deleteTemplate, getTemplate, etc.) — only `createTemplate`.

    DO NOT modify `src/app/actions/messages.ts` or anything in the SEND path (D-16, D-17 — SEND is explicitly out of scope).
  </action>
  <verify>
    <automated>grep -q "import { createTemplate as createTemplateDomain }" src/app/actions/templates.ts &amp;&amp; grep -q "createTemplateDomain(" src/app/actions/templates.ts &amp;&amp; grep -q "source: 'server-action'" src/app/actions/templates.ts &amp;&amp; ! grep -q "await createTemplate360(" src/app/actions/templates.ts &amp;&amp; grep -q "headerImage" src/app/actions/templates.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep -E "(templates.ts|template-form.tsx)" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/actions/templates.ts` contains `import { createTemplate as createTemplateDomain } from '@/lib/domain/whatsapp-templates'`
    - `src/app/actions/templates.ts` calls `createTemplateDomain(...)` with `source: 'server-action'`
    - `src/app/actions/templates.ts` does NOT call `createTemplate360` directly (grep returns zero matches for `await createTemplate360(`)
    - `src/app/actions/templates.ts` does NOT directly INSERT into `whatsapp_templates` from the `createTemplate` function (grep for `.from('whatsapp_templates').insert` inside that function — should be zero)
    - The `createTemplate` function signature accepts optional `headerImage` field
    - The existing call site at `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx` still type-checks without modification
    - `npx tsc --noEmit` reports zero errors in both `templates.ts` and `template-form.tsx`
    - Manual smoke test possible: visiting `/configuracion/whatsapp/templates/nuevo` still renders the form (verified in Plan 05 regression task)
  </acceptance_criteria>
  <done>Server action is a thin delegation wrapper; manual form still compiles; no direct DB or 360 API calls remain in the action's `createTemplate`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server action → domain | Trusted intra-process call; `source: 'server-action'` tags audit |
| domain → Supabase Storage | Admin client bypasses RLS; workspace_id filter in path |
| domain → 360 Dialog | API key crosses network; D360-API-KEY auth |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | `createTemplate` IMAGE branch | mitigate | `headerImage.storagePath` must pass regex `templates/{workspaceId}/...` — Plan 03 upload route enforces; domain trusts but verifies via `.eq('workspace_id', ctx.workspaceId)` on the storage download (Supabase Storage respects bucket policies already) |
| T-02-02 | Information Disclosure | Error messages | mitigate | Errors surface 360 Dialog's message (`err.error?.message`) — never raw stack traces; API key never appears in error text |
| T-02-03 | Repudiation | Failed submissions | mitigate | On 360 error, row is preserved with status='REJECTED' + rejected_reason — audit trail survives |
| T-02-04 | Denial of Service | Repeated submissions | accept | Meta's own cooldown (30 days after rejection per RESEARCH.md C) provides rate limiting at the platform level; worth adding a prelim cooldown check in a later standalone |
| T-02-05 | Elevation of Privilege | Server action auth | mitigate | Auth check happens BEFORE domain call (`supabase.auth.getUser()` + workspace membership) — same gate as before refactor |
| T-02-06 | Spoofing | `source` field | accept | `source: 'server-action'` is set by the code itself; can't be spoofed by a client because clients never call the domain directly |
</threat_model>

<verification>
1. `npx tsc --noEmit -p .` — zero new errors
2. Visit `/configuracion/whatsapp/templates/nuevo`, submit a TEXT-only template (smoke, deferred to Plan 05)
3. Unit-style sanity: `grep -R "createTemplate360\|whatsapp_templates.*insert" src/` — should return ONLY hits inside `src/lib/domain/whatsapp-templates.ts` and `src/lib/whatsapp/templates-api.ts` (the helper itself). No other file mutates `whatsapp_templates` directly.
4. File count: `src/lib/domain/whatsapp-templates.ts` is the ONLY new file; `src/app/actions/templates.ts` is the ONLY modified file
</verification>

<success_criteria>
- Domain module exists and compiles
- Server action delegates to domain; manual form continues to work
- No direct `whatsapp_templates` INSERT remains outside domain
- No direct `createTemplate360` call remains outside domain and its own helper file
- Regla 3 satisfied
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-template-ai-builder/02-SUMMARY.md` documenting:
- Any deviations from the pasted Example 2 code
- Whether `TemplateComponent.example.header_handle` type needed extension (if so, note the file + diff)
- Grep evidence that no direct INSERT or `createTemplate360` remains outside domain
- Git commit SHA
</output>
