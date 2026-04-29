---
plan: 02
wave: 1
phase: standalone-crm-query-tools
depends_on: [01]
files_modified:
  - supabase/migrations/2026MMDDHHMMSS_crm_query_tools_config.sql
  - src/lib/domain/crm-query-tools-config.ts
  - src/lib/domain/contacts.ts
  - src/lib/domain/orders.ts
autonomous: false  # Regla 5 — DB migration MUST be applied to prod by user before code that uses it is pushed
requirements:
  - D-11  # Active stages + pipeline scope persisted in DB (workspace-scoped config)
  - D-12  # One config shared per workspace
  - D-13  # Stages by UUID; FK behavior on stage deletion
  - D-16  # Pipeline scope optional (null = all), override allowed
  - D-18  # Extend ContactDetail (department) + OrderDetail (shipping*) — never duplicate types
---

<objective>
Create the persistent storage + domain layer for crm-query-tools workspace config (singleton row + active-stages junction), and extend `ContactDetail`/`OrderDetail` interfaces to surface columns that already exist in DB but are not on the read interfaces (`department` for contacts, `shipping_address/city/department` for orders). This plan applies Regla 5 strictly: migration is created → executor PAUSES for user to apply via Supabase Dashboard → only after explicit confirmation are domain code changes committed and pushed.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/code-changes.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@src/lib/domain/contacts.ts
@src/lib/domain/orders.ts
@src/lib/domain/types.ts
@src/lib/domain/pipelines.ts
@src/lib/audit/logger.ts

<interfaces>
<!-- Contracts other plans depend on. Extracted from PATTERNS.md File 25 + 26 + RESEARCH Example 4. -->

From src/lib/domain/types.ts (existing — DO NOT modify):
```typescript
export interface DomainContext {
  workspaceId: string
  source: 'webhook' | 'tool-handler' | 'server-action' | 'cron' | 'inngest' | string
  // ... other fields preserved as-is
}

export type DomainResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

From src/lib/domain/contacts.ts BEFORE this plan (lines 592-603):
```typescript
export interface ContactDetail {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  createdAt: string
  archivedAt: string | null
  tags: Array<{ id: string; name: string }>
  customFields: Record<string, unknown>
}
```

From src/lib/domain/orders.ts BEFORE this plan (lines 1736-1753):
```typescript
export interface OrderDetail {
  id: string
  contactId: string | null
  pipelineId: string
  stageId: string
  totalValue: number
  description: string | null
  createdAt: string
  archivedAt: string | null
  items: Array<{ id: string; sku: string; title: string; unitPrice: number; quantity: number; subtotal: number }>
}
```

NEW interface (this plan creates) — `src/lib/domain/crm-query-tools-config.ts`:
```typescript
export interface CrmQueryToolsConfig {
  pipelineId: string | null
  activeStageIds: string[]
}

export interface UpdateCrmQueryToolsConfigParams {
  pipelineId?: string | null
  activeStageIds?: string[]
}

export async function getCrmQueryToolsConfig(ctx: DomainContext): Promise<CrmQueryToolsConfig>
export async function updateCrmQueryToolsConfig(
  ctx: DomainContext,
  params: UpdateCrmQueryToolsConfigParams,
): Promise<DomainResult<CrmQueryToolsConfig>>
```

EXTENDED interfaces (this plan adds fields):
```typescript
// ContactDetail gains:
department: string | null

// OrderDetail gains:
shippingAddress: string | null
shippingCity: string | null
shippingDepartment: string | null
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 2.1: Author the migration file (do NOT apply yet)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 1 — migration template, lines ~67-128)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section "Pattern 4" — workspace-scoped config table; Section "Common Pitfalls" Pitfall 7 — GRANTs)
    - supabase/migrations/20260209000000_agent_production.sql (lines 11-39 — workspace_agent_config RLS analog)
    - supabase/migrations/20260224000000_guide_gen_config.sql (lines 18-26 — FK SET NULL pattern)
    - supabase/migrations/20260420000443_platform_config.sql (lines 30-37 — mandatory GRANTs LEARNING)
    - supabase/migrations/20260129000003_orders_foundation.sql (line 57 — `pipeline_stages.is_closed` exists; D-11 says ignore it)
  </read_first>
  <action>
    1. Generate timestamp filename. Use `date -u +%Y%m%d%H%M%S` to get the UTC timestamp. The filename pattern is `{timestamp}_crm_query_tools_config.sql`. Example: `20260429143000_crm_query_tools_config.sql`. Run the date command and use its actual output — do NOT hardcode `2026MMDDHHMMSS`.

    2. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/supabase/migrations/{timestamp}_crm_query_tools_config.sql` with the EXACT contents below (substituting the actual timestamp into the file name only — SQL body is fixed):

    ```sql
    -- Standalone crm-query-tools — Wave 1 (Plan 02).
    -- Creates workspace-scoped config for crm-query-tools module:
    --   1. crm_query_tools_config (singleton per workspace, scalar pipeline_id).
    --   2. crm_query_tools_active_stages (junction for multi-select active stages).
    --
    -- D-11 / D-12: one config per workspace, NOT hardcoded, NOT JSONB.
    -- D-13: stages by UUID; FK CASCADE on junction so stage deletion auto-cleans config.
    -- D-16: pipeline_id NULL = all pipelines (default).
    -- Regla 2: timestamps use timezone('America/Bogota', NOW()).
    -- LEARNING (platform_config 20260420000443): mandatory GRANTs for service_role + authenticated.

    -- ─────────────────────────────────────────────────────────────────────
    -- Table 1: crm_query_tools_config (singleton per workspace)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS public.crm_query_tools_config (
      workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
      pipeline_id  UUID NULL REFERENCES public.pipelines(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
    );

    ALTER TABLE public.crm_query_tools_config ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "crm_query_tools_config_select"
      ON public.crm_query_tools_config FOR SELECT
      USING (is_workspace_member(workspace_id));

    CREATE POLICY "crm_query_tools_config_insert"
      ON public.crm_query_tools_config FOR INSERT
      WITH CHECK (is_workspace_admin(workspace_id));

    CREATE POLICY "crm_query_tools_config_update"
      ON public.crm_query_tools_config FOR UPDATE
      USING (is_workspace_admin(workspace_id));

    CREATE POLICY "crm_query_tools_config_delete"
      ON public.crm_query_tools_config FOR DELETE
      USING (is_workspace_admin(workspace_id));

    -- LEARNING propagado (platform_config 20260420000443): toda migración futura que crea
    -- una tabla debe incluir GRANTs explícitos — no asumir que tablas creadas en prod via
    -- SQL Editor hereden privileges que habrían tenido vía `supabase db push`.
    GRANT ALL    ON TABLE public.crm_query_tools_config TO service_role;
    GRANT SELECT ON TABLE public.crm_query_tools_config TO authenticated;

    -- ─────────────────────────────────────────────────────────────────────
    -- Table 2: crm_query_tools_active_stages (junction)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS public.crm_query_tools_active_stages (
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      stage_id     UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
      PRIMARY KEY (workspace_id, stage_id)
    );

    CREATE INDEX IF NOT EXISTS idx_crm_query_tools_active_stages_ws
      ON public.crm_query_tools_active_stages(workspace_id);

    ALTER TABLE public.crm_query_tools_active_stages ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "crm_query_tools_active_stages_select"
      ON public.crm_query_tools_active_stages FOR SELECT
      USING (is_workspace_member(workspace_id));

    CREATE POLICY "crm_query_tools_active_stages_insert"
      ON public.crm_query_tools_active_stages FOR INSERT
      WITH CHECK (is_workspace_admin(workspace_id));

    CREATE POLICY "crm_query_tools_active_stages_delete"
      ON public.crm_query_tools_active_stages FOR DELETE
      USING (is_workspace_admin(workspace_id));

    GRANT ALL    ON TABLE public.crm_query_tools_active_stages TO service_role;
    GRANT SELECT ON TABLE public.crm_query_tools_active_stages TO authenticated;

    -- ─────────────────────────────────────────────────────────────────────
    -- Trigger: bump updated_at on UPDATE (Regla 2 — Bogota timezone)
    -- ─────────────────────────────────────────────────────────────────────
    -- Rationale: Domain layer must NOT set updated_at client-side (would write UTC).
    -- DB trigger guarantees Bogota timezone on every mutation.
    CREATE OR REPLACE FUNCTION public.bump_crm_query_tools_config_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := timezone('America/Bogota', NOW());
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_crm_query_tools_config_updated_at
      BEFORE UPDATE ON public.crm_query_tools_config
      FOR EACH ROW EXECUTE FUNCTION public.bump_crm_query_tools_config_updated_at();

    -- ─────────────────────────────────────────────────────────────────────
    -- Comments (developer hint)
    -- ─────────────────────────────────────────────────────────────────────
    COMMENT ON TABLE public.crm_query_tools_config IS 'Singleton config per workspace for crm-query-tools shared module. NULL pipeline_id = all pipelines (D-16). See standalone crm-query-tools.';
    COMMENT ON TABLE public.crm_query_tools_active_stages IS 'Junction: stages considered "active" for getActiveOrderByPhone. Empty = config_not_set (D-27). FK CASCADE auto-cleans on stage deletion (D-13).';
    COMMENT ON FUNCTION public.bump_crm_query_tools_config_updated_at IS 'BEFORE UPDATE trigger function — bumps updated_at to timezone(America/Bogota, NOW()). Domain layer must NOT set updated_at in payload (Regla 2).';
    ```

    3. Verify the SQL by reading it back. NO `psql` execution from this task — application is the user's job (Task 2.2).

    4. Add and commit migration file SOLO (no domain code yet — gating on Regla 5):
       ```
       git add supabase/migrations/{timestamp}_crm_query_tools_config.sql
       git commit -m "$(cat <<'EOF'
       feat(crm-query-tools): add migration for workspace config (Regla 5 pause)

       - crm_query_tools_config: singleton per workspace, pipeline_id ON DELETE SET NULL.
       - crm_query_tools_active_stages: junction (workspace_id, stage_id) ON DELETE CASCADE.
       - 7 RLS policies (member SELECT, admin INSERT/UPDATE/DELETE).
       - Mandatory GRANTs (service_role ALL, authenticated SELECT) per platform_config LEARNING.
       - Timestamps use timezone('America/Bogota', NOW()) per Regla 2.

       Standalone: crm-query-tools Plan 02 (Wave 1).
       Refs D-11, D-12, D-13, D-16, D-27.

       NOT pushed yet — Task 2.2 pauses for user to apply migration in prod.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```
    DO NOT push yet. Push happens in Task 2.5 after migration is applied.
  </action>
  <verify>
    <automated>ls supabase/migrations/*_crm_query_tools_config.sql 2>&1 | head -1 && grep -c "crm_query_tools_config" supabase/migrations/*_crm_query_tools_config.sql && grep -c "GRANT ALL" supabase/migrations/*_crm_query_tools_config.sql && git log -1 --oneline | grep -q "crm-query-tools"</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/{timestamp}_crm_query_tools_config.sql` exists (timestamp matches `^[0-9]{14}$`).
    - `grep -c "CREATE TABLE" {file}` returns 2 (both tables).
    - `grep -c "ENABLE ROW LEVEL SECURITY" {file}` returns 2.
    - `grep -c "GRANT ALL" {file}` returns 2 (one per table).
    - `grep -c "GRANT SELECT" {file}` returns 2.
    - `grep "ON DELETE CASCADE" {file}` matches `pipeline_stages` reference (junction).
    - `grep "ON DELETE SET NULL" {file}` matches `pipelines` reference (config).
    - `grep "timezone('America/Bogota', NOW())" {file}` returns ≥5 matches (all timestamp defaults + trigger function).
    - `grep -c "CREATE TRIGGER trg_crm_query_tools_config_updated_at" {file}` returns 1 (Regla 2 — bump updated_at via DB trigger, not client).
    - `grep -c "CREATE OR REPLACE FUNCTION public.bump_crm_query_tools_config_updated_at" {file}` returns 1.
    - `git log -1 --pretty=%s` matches "feat(crm-query-tools)".
    - `git log @{u}..HEAD` shows 1 commit (NOT pushed yet — gates Regla 5).
  </acceptance_criteria>
  <done>Migration file authored + committed locally. Ready to PAUSE for user.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2.2: PAUSE — User applies migration to PROD via Supabase Dashboard (Regla 5)</name>
  <read_first>
    - CLAUDE.md (Regla 5 — migración antes de deploy; hard blocker)
    - The migration SQL file just created in Task 2.1
  </read_first>
  <what-built>
    A migration file at `supabase/migrations/{timestamp}_crm_query_tools_config.sql` is committed locally but NOT pushed. Per Regla 5 ("toda migración debe aplicarse en producción ANTES de pushear código que la usa"), we cannot continue until the user applies this SQL in production.

    The migration creates 2 tables + 7 RLS policies + 4 GRANTs + 1 index. It's pure additive DDL with `IF NOT EXISTS` guards — safe to run.
  </what-built>
  <how-to-verify>
    USER MUST:
    1. Open Supabase Dashboard for project `morfx-new`.
    2. Navigate to: SQL Editor → New query.
    3. Copy the entire SQL body from `supabase/migrations/{timestamp}_crm_query_tools_config.sql`.
    4. Paste and Run.
    5. Verify success in Table Editor: confirm tables `crm_query_tools_config` and `crm_query_tools_active_stages` appear under `public` schema.
    6. Run this verification query in the SQL Editor:
       ```sql
       SELECT
         (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='crm_query_tools_config') AS cfg_table,
         (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='crm_query_tools_active_stages') AS junction_table,
         (SELECT COUNT(*) FROM pg_policies WHERE tablename='crm_query_tools_config') AS cfg_policies,
         (SELECT COUNT(*) FROM pg_policies WHERE tablename='crm_query_tools_active_stages') AS junction_policies;
       ```
       Expected output: `cfg_table=1`, `junction_table=1`, `cfg_policies=4`, `junction_policies=3`.
    7. Reply with the query output OR type "applied" if you confirm tables + policies exist.

    DO NOT type "applied" if the SQL errored. Errors must be reported back so we can fix the migration before pushing.
  </how-to-verify>
  <action>STOP — wait for user confirmation. Do not run any further task until the user explicitly confirms the migration applied successfully.</action>
  <verify>
    <automated>echo "blocked-on-user-migration-apply"</automated>
  </verify>
  <acceptance_criteria>
    User has typed "applied" or pasted the verification query output showing all four counts match expectations. NO writes to domain code or push to remote until this signal.
  </acceptance_criteria>
  <done>User confirms migration applied successfully in production.</done>
  <resume-signal>Type "applied" with the verification query output, or describe the error encountered.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 2.3: Create domain `crm-query-tools-config.ts` (getCrmQueryToolsConfig + updateCrmQueryToolsConfig)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 2 — domain analog, lines ~138-175; Example 4 in RESEARCH ~lines 720-771)
    - src/lib/domain/contacts.ts (lines 539-580 — `searchContacts` shape; lines 610-658 — `getContactById` for parallel-query pattern)
    - src/lib/domain/pipelines.ts (lines 49-83 — `listPipelines` workspace-scoped read)
    - src/lib/domain/types.ts (DomainContext, DomainResult shapes)
    - src/lib/audit/logger.ts (line 86 — createModuleLogger factory)
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/domain/crm-query-tools-config.ts` with the EXACT shape below. Two exported functions:

    1. `getCrmQueryToolsConfig(ctx)` — fail-open: returns `{ pipelineId: null, activeStageIds: [] }` on read errors (logged) so a misconfigured workspace does not cascade tool failures. NOT wrapped in DomainResult.

    2. `updateCrmQueryToolsConfig(ctx, params)` — wrapped in DomainResult so the UI server action can surface errors. Uses upsert for the singleton + delete-then-insert for the junction (acceptable for an admin-UI write; full transactional atomicity deferred to backlog).

    ```typescript
    /**
     * Domain — CRM Query Tools workspace-scoped config.
     *
     * Standalone crm-query-tools Wave 1 (Plan 02).
     *
     * Tables:
     *   - crm_query_tools_config (singleton per workspace)
     *   - crm_query_tools_active_stages (junction)
     *
     * Read pattern: parallel queries via Promise.all; fail-open default
     * `{ pipelineId: null, activeStageIds: [] }` on read errors so tool callers
     * can distinguish "config_not_set" via empty `activeStageIds` (D-27) vs DB error
     * (logged but not surfaced — caller sees default).
     *
     * Write pattern: upsert config row + delete-then-insert junction. Admin UI write
     * tolerates brief inconsistency (last-write-wins acceptable per RESEARCH Open Q5).
     *
     * D-13 FK behavior:
     *   - junction.stage_id ON DELETE CASCADE (stage deleted → row gone, no stale UUIDs).
     *   - config.pipeline_id ON DELETE SET NULL (pipeline deleted → "all pipelines" default).
     */

    import { createAdminClient } from '@/lib/supabase/admin'
    import type { DomainContext, DomainResult } from './types'
    import { createModuleLogger } from '@/lib/audit/logger'

    const logger = createModuleLogger('domain.crm-query-tools-config')

    export interface CrmQueryToolsConfig {
      pipelineId: string | null
      activeStageIds: string[]
    }

    export interface UpdateCrmQueryToolsConfigParams {
      pipelineId?: string | null
      activeStageIds?: string[]
    }

    export async function getCrmQueryToolsConfig(
      ctx: DomainContext,
    ): Promise<CrmQueryToolsConfig> {
      const supabase = createAdminClient()

      const [cfgRes, stagesRes] = await Promise.all([
        supabase
          .from('crm_query_tools_config')
          .select('pipeline_id')
          .eq('workspace_id', ctx.workspaceId)
          .maybeSingle(),
        supabase
          .from('crm_query_tools_active_stages')
          .select('stage_id')
          .eq('workspace_id', ctx.workspaceId),
      ])

      if (cfgRes.error) {
        logger.error(
          { error: cfgRes.error, workspaceId: ctx.workspaceId },
          'getCrmQueryToolsConfig: config read error — defaulting to empty',
        )
        return { pipelineId: null, activeStageIds: [] }
      }
      if (stagesRes.error) {
        logger.error(
          { error: stagesRes.error, workspaceId: ctx.workspaceId },
          'getCrmQueryToolsConfig: junction read error — defaulting activeStageIds to []',
        )
        return {
          pipelineId: cfgRes.data?.pipeline_id ?? null,
          activeStageIds: [],
        }
      }

      return {
        pipelineId: cfgRes.data?.pipeline_id ?? null,
        activeStageIds: (stagesRes.data ?? []).map(
          (r: { stage_id: string }) => r.stage_id,
        ),
      }
    }

    export async function updateCrmQueryToolsConfig(
      ctx: DomainContext,
      params: UpdateCrmQueryToolsConfigParams,
    ): Promise<DomainResult<CrmQueryToolsConfig>> {
      const supabase = createAdminClient()

      try {
        // 1. Upsert config row (singleton).
        // Regla 2: updated_at intentionally NOT set in payload — DB trigger trg_crm_query_tools_config_updated_at
        // bumps it via timezone('America/Bogota', NOW()). Setting it client-side would write UTC and break Bogota invariant.
        if (params.pipelineId !== undefined) {
          const { error: upsertErr } = await supabase
            .from('crm_query_tools_config')
            .upsert(
              {
                workspace_id: ctx.workspaceId,
                pipeline_id: params.pipelineId,
              },
              { onConflict: 'workspace_id' },
            )
          if (upsertErr) {
            logger.error(
              { error: upsertErr, workspaceId: ctx.workspaceId },
              'updateCrmQueryToolsConfig: upsert config failed',
            )
            return { success: false, error: upsertErr.message }
          }
        }

        // 2. Sync junction (delete-then-insert) if activeStageIds provided.
        if (params.activeStageIds !== undefined) {
          const { error: delErr } = await supabase
            .from('crm_query_tools_active_stages')
            .delete()
            .eq('workspace_id', ctx.workspaceId)
          if (delErr) {
            logger.error(
              { error: delErr, workspaceId: ctx.workspaceId },
              'updateCrmQueryToolsConfig: delete junction failed',
            )
            return { success: false, error: delErr.message }
          }

          if (params.activeStageIds.length > 0) {
            const rows = params.activeStageIds.map((stageId) => ({
              workspace_id: ctx.workspaceId,
              stage_id: stageId,
            }))
            const { error: insErr } = await supabase
              .from('crm_query_tools_active_stages')
              .insert(rows)
            if (insErr) {
              logger.error(
                { error: insErr, workspaceId: ctx.workspaceId, stageCount: rows.length },
                'updateCrmQueryToolsConfig: insert junction failed',
              )
              return { success: false, error: insErr.message }
            }
          }
        }

        // 3. Return fresh state.
        const fresh = await getCrmQueryToolsConfig(ctx)
        return { success: true, data: fresh }
      } catch (err) {
        logger.error(
          { error: err, workspaceId: ctx.workspaceId },
          'updateCrmQueryToolsConfig: unexpected error',
        )
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    ```

    Run `npx tsc --noEmit -p .` — must report zero errors.
  </action>
  <verify>
    <automated>test -f src/lib/domain/crm-query-tools-config.ts && grep -q "export async function getCrmQueryToolsConfig" src/lib/domain/crm-query-tools-config.ts && grep -q "export async function updateCrmQueryToolsConfig" src/lib/domain/crm-query-tools-config.ts && npx tsc --noEmit -p . 2>&1 | grep -E "crm-query-tools-config\.ts" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/domain/crm-query-tools-config.ts` exists.
    - `grep -c "createAdminClient" src/lib/domain/crm-query-tools-config.ts` returns ≥1 (domain layer pattern; allowed here per Regla 3).
    - `grep -c "ctx.workspaceId" src/lib/domain/crm-query-tools-config.ts` returns ≥4 (workspace filter on every query).
    - Functions exported: `getCrmQueryToolsConfig`, `updateCrmQueryToolsConfig`.
    - Interfaces exported: `CrmQueryToolsConfig`, `UpdateCrmQueryToolsConfigParams`.
    - `npx tsc --noEmit -p .` reports zero errors related to this file.
  </acceptance_criteria>
  <done>Domain layer CRUD ready. Tools (Plan 03/04) and UI (Plan 05) can import.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.4: Extend ContactDetail (department) + OrderDetail (shipping*)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 25 — ContactDetail extend, lines 1126-1170; File 26 — OrderDetail extend, lines 1175-1235)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section "Common Pitfalls" — Pitfall 9 + Pitfall 10)
    - src/lib/domain/contacts.ts (lines 592-603 ContactDetail; line 619 SELECT inside getContactById; lines 642-653 mapping)
    - src/lib/domain/orders.ts (lines 1736-1753 OrderDetail; line 1764 SELECT inside getOrderById; lines 1789-1799 mapping; lines 442-444 confirm columns exist via updateOrder writes)
  </read_first>
  <action>
    1. Edit `src/lib/domain/contacts.ts` per PATTERNS File 25:
       - In `ContactDetail` interface (lines 592-603), add a single new field after `city: string | null`:
         ```typescript
         department: string | null
         ```
       - In `getContactById` SELECT (line ~619), the current text is:
         `'id, name, phone, email, address, city, custom_fields, created_at, archived_at, contact_tags(tag_id, tags(id, name))'`
         Change to:
         `'id, name, phone, email, address, city, department, custom_fields, created_at, archived_at, contact_tags(tag_id, tags(id, name))'`
         (insert `department,` between `city,` and `custom_fields,`).
       - In the mapping block (lines ~642-653), insert one line between `city: data.city,` and `createdAt: data.created_at,`:
         ```typescript
         department: data.department,
         ```
       - Verify there is no other place in `contacts.ts` that constructs a `ContactDetail` object — if any, add the same `department` field there too. Use `grep -n "createdAt:" src/lib/domain/contacts.ts` to find ContactDetail-shaped object constructions.

    2. Edit `src/lib/domain/orders.ts` per PATTERNS File 26:
       - In `OrderDetail` interface (lines 1736-1753), insert THREE new fields between `description: string | null` and `createdAt: string`:
         ```typescript
         shippingAddress: string | null
         shippingCity: string | null
         shippingDepartment: string | null
         ```
       - In `getOrderById` SELECT (line ~1764), the current text contains:
         `..., total_value, description, created_at, archived_at, order_products(...)`
         Change to:
         `..., total_value, description, shipping_address, shipping_city, shipping_department, created_at, archived_at, order_products(...)`
         (insert the three shipping columns between `description,` and `created_at,`).
       - In the mapping block (lines ~1789-1799), insert THREE lines between `description: data.description,` and `createdAt: data.created_at,`:
         ```typescript
         shippingAddress: data.shipping_address,
         shippingCity: data.shipping_city,
         shippingDepartment: data.shipping_department,
         ```
       - Verify NO OTHER place in `orders.ts` constructs an `OrderDetail` literal — search via `grep -n "items:" src/lib/domain/orders.ts | head -5`. If multiple places exist (e.g., another getter), add the same fields there too. (DO NOT extend `OrderListItem` — only `OrderDetail`.)

    3. Run `npx tsc --noEmit -p .` — MUST succeed with zero errors. If TS errors surface in callers (because they construct `ContactDetail` / `OrderDetail` literals without the new fields), fix those by adding the fields with `null` placeholder OR by switching the literal to use `getContactById` / `getOrderById` returns. The fields are additive nullable — backward compatible.
  </action>
  <verify>
    <automated>grep -n "department: string | null" src/lib/domain/contacts.ts && grep -n "shippingAddress: string | null" src/lib/domain/orders.ts && grep -n "shippingCity: string | null" src/lib/domain/orders.ts && grep -n "shippingDepartment: string | null" src/lib/domain/orders.ts && grep -n "department: data.department" src/lib/domain/contacts.ts && grep -n "shippingAddress: data.shipping_address" src/lib/domain/orders.ts && npx tsc --noEmit -p . 2>&1 | grep -cE "(contacts|orders)\.ts.*error" | head -1</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "department: string | null" src/lib/domain/contacts.ts` returns ≥1.
    - `grep -c "shippingAddress: string | null" src/lib/domain/orders.ts` returns ≥1.
    - `grep -c "shippingCity: string | null" src/lib/domain/orders.ts` returns ≥1.
    - `grep -c "shippingDepartment: string | null" src/lib/domain/orders.ts` returns ≥1.
    - `grep "department" src/lib/domain/contacts.ts | grep -c "data\\.department"` returns ≥1.
    - `grep "shipping_address" src/lib/domain/orders.ts | grep -c "data\\.shipping_address"` returns ≥1.
    - `npx tsc --noEmit -p .` returns exit 0 (zero TS errors anywhere).
    - `npm run test -- --run src/lib/domain` exits 0 (no regression in existing domain tests).
  </acceptance_criteria>
  <done>Both interfaces extended; SELECT and mapping include new fields; entire repo type-checks clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.5: Commit + push (migration + domain code together)</name>
  <read_first>
    - CLAUDE.md (Regla 1 — push a Vercel post-cambio)
    - .claude/rules/code-changes.md (atomic commits)
    - git status (verify all files from 2.3 + 2.4 are dirty + 2.1 commit is in HEAD)
  </read_first>
  <action>
    1. Verify the migration commit from Task 2.1 is local but not pushed: `git log @{u}..HEAD --oneline` should show the migration commit.
    2. Stage domain code:
       ```
       git add src/lib/domain/crm-query-tools-config.ts src/lib/domain/contacts.ts src/lib/domain/orders.ts
       ```
    3. Commit:
       ```
       git commit -m "$(cat <<'EOF'
       feat(crm-query-tools): domain layer + extend ContactDetail/OrderDetail

       - src/lib/domain/crm-query-tools-config.ts: getCrmQueryToolsConfig (fail-open),
         updateCrmQueryToolsConfig (upsert + delete-then-insert junction).
       - ContactDetail gains department: string | null (D-18 — extend, never duplicate).
       - OrderDetail gains shippingAddress/City/Department: string | null (Pitfall 9).
       - All filtered by ctx.workspaceId (Regla 3).

       Standalone: crm-query-tools Plan 02 (Wave 1).
       Refs D-11, D-12, D-13, D-16, D-18, D-27.

       Migration applied in prod; safe to push.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```
    4. Push: `git push origin main`. Both commits (migration + domain) ship together.
  </action>
  <verify>
    <automated>git log @{u}..HEAD --oneline | wc -l && git push origin main 2>&1 | tail -3 && git log -2 --oneline</automated>
  </verify>
  <acceptance_criteria>
    - Last 2 commits on origin/main are: migration commit + domain commit (both with "crm-query-tools" in subject).
    - `git log @{u}..HEAD` is empty after push.
    - `git status` shows clean working tree.
    - Vercel deploy triggered (verify via `gh run list -R Jose-Romero-Bedoya/morfx-new --limit 3` if `gh` is available; otherwise rely on `git push` exit 0).
  </acceptance_criteria>
  <done>Wave 1 shipped. Wave 2 (Plan 03) and Wave 3 (Plan 04) unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Server Action / tool-handler → Supabase admin client | Domain layer crosses this boundary on every read/write |
| Supabase Postgres → tenant data | RLS + workspace_id filter prevents cross-workspace leak |
| Migration script → production schema | One-shot DDL runs as service_role |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W1-01 | Information Disclosure | Cross-workspace read of `crm_query_tools_config` | HIGH | mitigate | Domain functions filter `eq('workspace_id', ctx.workspaceId)` on every query. RLS policies enforce `is_workspace_member` for SELECT. Verified by acceptance criterion `grep -c "ctx.workspaceId" >= 4`. |
| T-W1-02 | Tampering | Non-admin user updates active stages | HIGH | mitigate | RLS policies `is_workspace_admin(workspace_id)` for INSERT/UPDATE/DELETE on both tables. UI server action (Plan 05) ALSO validates via `getActiveWorkspaceId`. Defense in depth. |
| T-W1-03 | Denial of Service | Permission denied (42501) on first prod read | INFO | mitigate | Migration includes `GRANT ALL TO service_role; GRANT SELECT TO authenticated` per `platform_config` LEARNING (PATTERNS File 1). Verified via grep in acceptance. |
| T-W1-04 | Tampering | Stale stage_id in config after stage deletion | INFO | mitigate | FK `ON DELETE CASCADE` on junction → row auto-removed. Pitfall 2 is structurally prevented at DB layer. Plan 06 integration test verifies. |
| T-W1-05 | Tampering | Stale pipeline_id after pipeline deletion | INFO | mitigate | FK `ON DELETE SET NULL` on `pipeline_id` → reverts to "all pipelines" default (D-16 semantics). |
| T-W1-06 | Information Disclosure | Domain logs leak workspace_id or pipeline_id in error paths | LOW | accept | Pino logger at module logger level; workspace_id is not PII (already in many other logs). No phone or email in this file. |
| T-W1-07 | Tampering (race) | Concurrent UI saves overwrite each other | LOW | accept | `updateCrmQueryToolsConfig` uses delete-then-insert without transaction wrap. Acceptable for admin UI per RESEARCH Architecture (last-write-wins). Optimistic concurrency deferred to backlog. |
</threat_model>

<verification>
- Migration applied in prod (user confirms in Task 2.2 with verification query output).
- `npx tsc --noEmit -p .` returns zero errors.
- `npm run test -- --run src/lib/domain` returns zero failures.
- `git log -2 --oneline` shows migration + domain commits.
- `git log @{u}..HEAD` is empty (both pushed).
- Domain export `getCrmQueryToolsConfig` is importable: `node --eval 'console.log(Object.keys(require("./.next/server/chunks/...")))'` (skip — TS-only check via tsc is sufficient).
</verification>

<must_haves>
truths:
  - "Migration applied in prod (user-confirmed)."
  - "Domain function `getCrmQueryToolsConfig(ctx)` returns `{ pipelineId, activeStageIds }` filtered by ctx.workspaceId."
  - "Domain function `updateCrmQueryToolsConfig(ctx, params)` upserts config + syncs junction."
  - "ContactDetail surfaces `department`."
  - "OrderDetail surfaces `shippingAddress`, `shippingCity`, `shippingDepartment`."
  - "Stage deletion in DB CASCADEs into junction (no stale UUID)."
  - "Pipeline deletion in DB SETs config.pipeline_id NULL."
artifacts:
  - path: "supabase/migrations/{timestamp}_crm_query_tools_config.sql"
    provides: "Schema for crm_query_tools_config + crm_query_tools_active_stages"
    contains: "CREATE TABLE crm_query_tools_config"
    min_lines: 60
  - path: "src/lib/domain/crm-query-tools-config.ts"
    provides: "Workspace-scoped CRUD for crm-query-tools config"
    exports: ["getCrmQueryToolsConfig", "updateCrmQueryToolsConfig", "CrmQueryToolsConfig", "UpdateCrmQueryToolsConfigParams"]
  - path: "src/lib/domain/contacts.ts"
    provides: "ContactDetail.department field surfaced"
    contains: "department: string | null"
  - path: "src/lib/domain/orders.ts"
    provides: "OrderDetail shipping fields surfaced"
    contains: "shippingAddress: string | null"
key_links:
  - from: "src/lib/domain/crm-query-tools-config.ts"
    to: "Supabase tables (crm_query_tools_config + junction)"
    via: "createAdminClient + workspace_id filter"
    pattern: "from\\('crm_query_tools_(config|active_stages)'\\)"
  - from: "Plans 03 / 04 / 05 (downstream)"
    to: "domain.getCrmQueryToolsConfig + .updateCrmQueryToolsConfig"
    via: "import from '@/lib/domain/crm-query-tools-config'"
    pattern: "from '@/lib/domain/crm-query-tools-config'"
</must_haves>
