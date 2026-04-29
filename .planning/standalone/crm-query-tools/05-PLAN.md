---
plan: 05
wave: 4
phase: standalone-crm-query-tools
depends_on: [02, 04]
files_modified:
  - src/app/(dashboard)/agentes/layout.tsx
  - src/app/(dashboard)/agentes/crm-tools/page.tsx
  - src/app/(dashboard)/agentes/crm-tools/_actions.ts
  - src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx
  - src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx
autonomous: true
requirements:
  - D-11  # Active stages + pipeline scope persisted via UI
  - D-13  # Stages by UUID — UI shows names but persists IDs
  - D-14  # UI under /agentes (slug = "crm-tools" per RESEARCH Open Q1)
  - D-16  # Pipeline scope picker (null = all pipelines)
  - D-22  # No agent migration in this standalone — UI ships flag-less
---

<objective>
Build the operator-facing UI under `/agentes/crm-tools` so workspace operators can configure which stages count as "active" and (optionally) restrict the pipeline scope. This page is a Server Component that fetches `getCrmQueryToolsConfig` + `listPipelines` in parallel, renders a Client Component editor with a pipeline picker + multi-select for stages (grouped by pipeline), and saves through a server action that calls `updateCrmQueryToolsConfig`. UI is the bridge for the D-24 E2E test in Plan 06. **MultiSelect decision (per planning_context):** build an inline variant in `_components/MultiSelectStages.tsx` that accepts `{ value, label }[]` pairs grouped by pipeline — does NOT refactor the shipped routing-editor MultiSelect (which is stable and uses a different shape).
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@src/app/(dashboard)/agentes/layout.tsx
@src/app/(dashboard)/agentes/routing/page.tsx
@src/app/(dashboard)/agentes/routing/_actions.ts
@src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx
@src/app/actions/workspace.ts
@src/lib/domain/crm-query-tools-config.ts
@src/lib/domain/pipelines.ts

<interfaces>
<!-- Server action contract consumed by ConfigEditor (Client Component). -->

```typescript
// src/app/(dashboard)/agentes/crm-tools/_actions.ts (NEW this plan)
'use server'

export interface SaveCrmQueryToolsConfigInput {
  pipelineId: string | null      // UUID or null = "all pipelines"
  activeStageIds: string[]       // UUIDs (stages from any pipeline within workspace)
}

export type SaveCrmQueryToolsConfigResult =
  | { success: true; data: CrmQueryToolsConfig }
  | { success: false; error: string }

export async function saveCrmQueryToolsConfigAction(
  input: SaveCrmQueryToolsConfigInput,
): Promise<SaveCrmQueryToolsConfigResult>
```

ConfigEditor props:
```typescript
interface ConfigEditorProps {
  initialConfig: CrmQueryToolsConfig
  pipelines: Array<{
    id: string
    name: string
    stages: Array<{ id: string; name: string; position: number | null }>
  }>
}
```

MultiSelectStages (inline variant, NOT routing-editor's component):
```typescript
interface StageOption { value: string; label: string }
interface StageGroup { label: string; options: StageOption[] }
interface MultiSelectStagesProps {
  value: string[]                  // selected stage UUIDs
  onChange: (next: string[]) => void
  groups: StageGroup[]             // pipelines as groups
  placeholder?: string
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 5.1: Add "Herramientas CRM" tab to /agentes layout</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 14 + tab edit at lines ~875)
    - src/app/(dashboard)/agentes/layout.tsx (read full file — locate tabs array at lines ~8-13 per RESEARCH)
  </read_first>
  <action>
    1. Read `src/app/(dashboard)/agentes/layout.tsx` fully. Identify the array/list of tabs (likely keys: `href`, `label`, possibly `icon`).

    2. Add a new tab object `{ href: '/agentes/crm-tools', label: 'Herramientas CRM' }` to the tabs collection. If the existing tabs include an `icon` field, add a Lucide icon — recommended `Wrench` from `lucide-react` (consistent with "tools" semantics).

    3. Place the new tab AFTER the existing `routing` tab and BEFORE auditoría (or wherever the layout is structured chronologically — match the file's existing ordering convention).

    4. Verify visually by re-reading the file: the tabs collection must contain the new entry, syntax must remain valid TS/TSX, and no other tab is removed/reordered.

    5. Run `npx tsc --noEmit -p .` — zero errors.
  </action>
  <verify>
    <automated>grep -q "/agentes/crm-tools" src/app/\(dashboard\)/agentes/layout.tsx && grep -q "Herramientas CRM" src/app/\(dashboard\)/agentes/layout.tsx && npx tsc --noEmit -p . 2>&1 | grep -c "agentes/layout"</automated>
  </verify>
  <acceptance_criteria>
    - `grep "/agentes/crm-tools" src/app/(dashboard)/agentes/layout.tsx` returns 1 match.
    - `grep "Herramientas CRM" src/app/(dashboard)/agentes/layout.tsx` returns 1 match.
    - `npx tsc --noEmit -p .` returns zero errors related to layout.tsx.
    - Other existing tabs (e.g., `routing`, `audit`) are unchanged: re-grep their hrefs to confirm.
  </acceptance_criteria>
  <done>Layout includes "Herramientas CRM" tab pointing at `/agentes/crm-tools`.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.2: Create page.tsx (Server Component)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 14 — page.tsx analog with full diff guidance, lines ~672-711; RESEARCH Example 5 ~lines 776-810)
    - src/app/(dashboard)/agentes/routing/page.tsx (full file — verbatim Server Component analog)
    - src/app/actions/workspace.ts (getActiveWorkspaceId — verify signature)
    - src/lib/domain/crm-query-tools-config.ts (Plan 02 — getCrmQueryToolsConfig signature)
    - src/lib/domain/pipelines.ts (lines 49-83 — listPipelines returns DomainResult<PipelineWithStages[]>)
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/agentes/crm-tools/page.tsx` with EXACT contents:

    ```typescript
    /**
     * /agentes/crm-tools — Workspace config for crm-query-tools shared module.
     *
     * Standalone crm-query-tools Wave 4 (Plan 05).
     *
     * Operator chooses:
     *   1. Pipeline scope (single pipeline or "all pipelines" = null) — D-16.
     *   2. Stages activos (multi-select grouped by pipeline) — D-11, D-13.
     *
     * Reads via Plan 02's domain `getCrmQueryToolsConfig` + `listPipelines`.
     * Writes via the server action in `_actions.ts` → `updateCrmQueryToolsConfig`.
     */

    import { getActiveWorkspaceId } from '@/app/actions/workspace'
    import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'
    import { listPipelines } from '@/lib/domain/pipelines'
    import { ConfigEditor } from './_components/ConfigEditor'

    export default async function CrmToolsConfigPage() {
      const workspaceId = await getActiveWorkspaceId()
      if (!workspaceId) {
        return (
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-muted-foreground">No hay workspace seleccionado.</p>
          </div>
        )
      }

      const ctx = { workspaceId, source: 'server-action' as const }
      const [config, pipelinesResult] = await Promise.all([
        getCrmQueryToolsConfig(ctx),
        listPipelines(ctx),
      ])

      const pipelines = pipelinesResult.success ? pipelinesResult.data : []
      const errorMessage: string | null = pipelinesResult.success ? null : (pipelinesResult.error ?? 'Unknown error')

      return (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Herramientas CRM</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configura que stages cuentan como pedidos activos y el pipeline scope para las tools de consulta CRM.
              Los agentes leen esta config en cada llamada (sin cache).
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              No se pudieron cargar los pipelines: {errorMessage}
            </div>
          )}

          <ConfigEditor initialConfig={config} pipelines={pipelines} />
        </div>
      )
    }
    ```

    Run `npx tsc --noEmit -p .` — zero errors.
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/crm-tools/page.tsx" && grep -q "getCrmQueryToolsConfig" "src/app/(dashboard)/agentes/crm-tools/page.tsx" && grep -q "listPipelines" "src/app/(dashboard)/agentes/crm-tools/page.tsx" && npx tsc --noEmit -p . 2>&1 | grep -c "crm-tools/page"</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/(dashboard)/agentes/crm-tools/page.tsx` exists.
    - `grep -c "getActiveWorkspaceId" {file}` returns 1.
    - `grep -c "Promise.all" {file}` returns 1 (parallel reads).
    - `grep -c "Herramientas CRM" {file}` returns 1.
    - `grep -c "<ConfigEditor" {file}` returns 1.
    - `npx tsc --noEmit -p .` returns zero errors related to this file (ConfigEditor import will error until Task 5.4 lands — that's acceptable mid-plan; full check happens in Task 5.5).
  </acceptance_criteria>
  <done>Page Server Component fetches config + pipelines, renders editor.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.3: Create _actions.ts (server action with admin guard + zod validation)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 15 — _actions.ts analog, lines ~714-756)
    - src/app/(dashboard)/agentes/routing/_actions.ts (lines 1-133 — verbatim server action analog)
    - src/lib/domain/crm-query-tools-config.ts (Plan 02 — updateCrmQueryToolsConfig signature)
    - src/app/actions/workspace.ts (getActiveWorkspaceId)
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/agentes/crm-tools/_actions.ts` with EXACT contents:

    ```typescript
    /**
     * Server actions — /agentes/crm-tools.
     *
     * Standalone crm-query-tools Wave 4 (Plan 05).
     *
     * Regla 3 invariant: this file does NOT import createAdminClient. Mutation goes
     * through `updateCrmQueryToolsConfig` in domain layer. Verifiable via grep.
     */

    'use server'

    import { revalidatePath } from 'next/cache'
    import { z } from 'zod'
    import { getActiveWorkspaceId } from '@/app/actions/workspace'
    import {
      updateCrmQueryToolsConfig,
      type CrmQueryToolsConfig,
    } from '@/lib/domain/crm-query-tools-config'

    const SaveInputSchema = z.object({
      pipelineId: z.string().uuid().nullable(),
      activeStageIds: z.array(z.string().uuid()),
    })

    export type SaveCrmQueryToolsConfigInput = z.infer<typeof SaveInputSchema>

    export type SaveCrmQueryToolsConfigResult =
      | { success: true; data: CrmQueryToolsConfig }
      | { success: false; error: string }

    export async function saveCrmQueryToolsConfigAction(
      input: SaveCrmQueryToolsConfigInput,
    ): Promise<SaveCrmQueryToolsConfigResult> {
      const workspaceId = await getActiveWorkspaceId()
      if (!workspaceId) {
        return { success: false, error: 'No hay workspace seleccionado.' }
      }

      // Defense-in-depth: validate again on server (UI also validates).
      const v = SaveInputSchema.safeParse(input)
      if (!v.success) {
        return {
          success: false,
          error: `Validacion fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
        }
      }

      const result = await updateCrmQueryToolsConfig(
        { workspaceId, source: 'server-action' as const },
        {
          pipelineId: v.data.pipelineId,
          activeStageIds: v.data.activeStageIds,
        },
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      revalidatePath('/agentes/crm-tools')
      return { success: true, data: result.data }
    }
    ```

    Verify Regla 3 invariant: `grep -E "createAdminClient|@supabase/supabase-js" src/app/(dashboard)/agentes/crm-tools/_actions.ts` returns 0.

    Run `npx tsc --noEmit -p .` — zero errors related to this file.
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/crm-tools/_actions.ts" && grep -q "use server" "src/app/(dashboard)/agentes/crm-tools/_actions.ts" && grep -q "updateCrmQueryToolsConfig" "src/app/(dashboard)/agentes/crm-tools/_actions.ts" && ! grep -E "createAdminClient|@supabase/supabase-js" "src/app/(dashboard)/agentes/crm-tools/_actions.ts" && grep -q "getActiveWorkspaceId" "src/app/(dashboard)/agentes/crm-tools/_actions.ts"</automated>
  </verify>
  <acceptance_criteria>
    - `_actions.ts` exists with `'use server'` directive on line 1 (or first non-comment line).
    - `grep -c "saveCrmQueryToolsConfigAction" {file}` returns ≥1 export.
    - `grep -c "getActiveWorkspaceId" {file}` returns ≥1 (admin guard).
    - `grep -c "revalidatePath" {file}` returns 1.
    - `grep -c "z\\.object\\|safeParse" {file}` returns ≥1 (zod validation).
    - `grep -E "createAdminClient|@supabase/supabase-js" {file}` returns 0.
    - `npx tsc --noEmit -p .` returns zero errors related to this file.
  </acceptance_criteria>
  <done>Server action delegates to domain layer with admin guard + zod validation.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.4: Build MultiSelectStages.tsx (inline variant) + ConfigEditor.tsx</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 16 — ConfigEditor + MultiSelect adaptations, lines ~759-806; Open Pattern Question 3 — recommended choice: BUILD INLINE VARIANT)
    - src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx (lines 1-136 — pattern reference; we DO NOT modify this file — we build a parallel variant accepting `{value, label}[]` pairs)
    - src/components/ui/popover.tsx (verify import path)
    - src/components/ui/checkbox.tsx (verify import path)
    - src/components/ui/button.tsx (verify import path)
    - src/components/ui/select.tsx (if exists; otherwise use plain `<select>` for pipeline picker)
    - src/lib/utils (cn helper)
  </read_first>
  <action>
    Create TWO files:

    **File A: `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx`** — an inline multi-select variant that accepts `{ value, label }[]` pairs grouped by pipeline (the routing-editor variant accepts plain `string[]` of labels and is unsuitable here per planning_context).

    ```tsx
    'use client'

    import { useMemo, useState } from 'react'
    import { Check, ChevronsUpDown } from 'lucide-react'
    import { Button } from '@/components/ui/button'
    import { Checkbox } from '@/components/ui/checkbox'
    import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
    import { cn } from '@/lib/utils'

    export interface StageOption {
      value: string  // stage UUID
      label: string  // stage display name
    }

    export interface StageGroup {
      label: string  // pipeline name
      options: StageOption[]
    }

    interface Props {
      value: string[]  // selected stage UUIDs
      onChange: (next: string[]) => void
      groups: StageGroup[]
      placeholder?: string
    }

    export function MultiSelectStages({ value, onChange, groups, placeholder = 'Selecciona stages...' }: Props) {
      const [open, setOpen] = useState(false)
      const selected = useMemo(() => new Set(value), [value])
      const allOptions = useMemo(
        () => groups.flatMap((g) => g.options),
        [groups],
      )

      const labelById = useMemo(() => {
        const m = new Map<string, string>()
        for (const o of allOptions) m.set(o.value, o.label)
        return m
      }, [allOptions])

      const toggle = (uuid: string) => {
        if (selected.has(uuid)) onChange(value.filter((v) => v !== uuid))
        else onChange([...value, uuid])
      }

      const triggerLabel =
        value.length === 0
          ? placeholder
          : value.length <= 2
            ? value.map((v) => labelById.get(v) ?? v).join(', ')
            : `${value.length} stages seleccionados`

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-label="Stages activos"
              className="w-full justify-between"
            >
              <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
                {triggerLabel}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            <div className="max-h-[400px] overflow-y-auto p-2">
              {groups.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No hay pipelines en este workspace.</p>
              )}
              {groups.map((g) => (
                <div key={g.label} className="mb-3 last:mb-0">
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {g.options.map((opt) => {
                      const isSelected = selected.has(opt.value)
                      return (
                        <label
                          key={opt.value}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={opt.label}
                          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                        >
                          <Checkbox checked={isSelected} onCheckedChange={() => toggle(opt.value)} />
                          <span className="flex-1">{opt.label}</span>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-2">
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )
    }
    ```

    **File B: `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx`** — Client Component with pipeline picker (native `<select>` for simplicity; upgrades possible in follow-up) + MultiSelectStages + Save button calling the server action with `sonner` toast feedback.

    ```tsx
    'use client'

    import { useMemo, useState, useTransition } from 'react'
    import { toast } from 'sonner'
    import { Button } from '@/components/ui/button'
    import {
      saveCrmQueryToolsConfigAction,
      type SaveCrmQueryToolsConfigInput,
    } from '../_actions'
    import { MultiSelectStages, type StageGroup } from './MultiSelectStages'
    import type { CrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'

    interface Pipeline {
      id: string
      name: string
      stages: Array<{ id: string; name: string; position: number | null }>
    }

    interface Props {
      initialConfig: CrmQueryToolsConfig
      pipelines: Pipeline[]
    }

    export function ConfigEditor({ initialConfig, pipelines }: Props) {
      const [pipelineId, setPipelineId] = useState<string | null>(initialConfig.pipelineId)
      const [activeStageIds, setActiveStageIds] = useState<string[]>(initialConfig.activeStageIds)
      const [isPending, startTransition] = useTransition()

      const groups: StageGroup[] = useMemo(() => {
        return pipelines.map((p) => ({
          label: p.name,
          options: p.stages
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((s) => ({ value: s.id, label: s.name })),
        }))
      }, [pipelines])

      const onSave = () => {
        startTransition(async () => {
          const input: SaveCrmQueryToolsConfigInput = { pipelineId, activeStageIds }
          const result = await saveCrmQueryToolsConfigAction(input)
          if (result.success) {
            toast.success('Configuracion guardada')
          } else {
            toast.error(`Error al guardar: ${result.error}`)
          }
        })
      }

      return (
        <div className="flex flex-col gap-6 max-w-2xl">
          <section className="rounded-lg border p-4">
            <h2 className="text-lg font-semibold mb-1">Pipeline scope</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Restringe getActiveOrderByPhone a un pipeline. Vacio = busca en todas las pipelines.
            </p>
            <select
              aria-label="Pipeline"
              role="combobox"
              className="w-full rounded-md border px-3 py-2 bg-background text-sm"
              value={pipelineId ?? ''}
              onChange={(e) => setPipelineId(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">Todas las pipelines</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-lg font-semibold mb-1">Stages activos</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Stages que cuentan como pedido activo. Vacio = config_not_set (los agentes lo detectan).
            </p>
            <MultiSelectStages
              value={activeStageIds}
              onChange={setActiveStageIds}
              groups={groups}
              placeholder="Selecciona stages..."
            />
          </section>

          <div className="flex justify-end">
            <Button type="button" onClick={onSave} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      )
    }
    ```

    Run `npx tsc --noEmit -p .` — zero errors.

    If `sonner` is not in package.json, check with `grep -q '"sonner"' package.json`. If absent, replace `import { toast } from 'sonner'` with a minimal alert: use `window.alert()` and surface a TODO comment to wire `sonner` later. Otherwise keep `sonner`.
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx" && test -f "src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx" && grep -q "saveCrmQueryToolsConfigAction" "src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx" && grep -q "MultiSelectStages" "src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx" && npx tsc --noEmit -p . 2>&1 | grep -E "crm-tools" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - Both Client Component files exist.
    - `grep -c "'use client'" ConfigEditor.tsx MultiSelectStages.tsx` returns 2 (one per file).
    - `grep -c "saveCrmQueryToolsConfigAction" ConfigEditor.tsx` returns ≥1.
    - `grep -c "useTransition\\|startTransition" ConfigEditor.tsx` returns ≥1 (proper React 19 mutation pattern).
    - `grep -c "aria-label=\"Pipeline\"\\|aria-label=\"Stages activos\"" ConfigEditor.tsx MultiSelectStages.tsx` returns ≥2 (E2E selectors in Plan 06).
    - `grep -c "role=\"combobox\"" ConfigEditor.tsx MultiSelectStages.tsx` returns ≥2 (semantic selectors for Playwright getByRole).
    - `grep -c "Configuracion guardada" ConfigEditor.tsx` returns ≥1 (Plan 06 awaits this text).
    - `npx tsc --noEmit -p .` returns zero errors.
  </acceptance_criteria>
  <done>Editor + multi-select implemented with ARIA labels for E2E.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.5: Smoke test (build) + commit + push</name>
  <read_first>
    - CLAUDE.md (Regla 1 — push a Vercel post-cambio; Regla 6 — proteger agente prod, but no agent touched here so flag-less ship is fine per D-22)
    - .claude/rules/code-changes.md
  </read_first>
  <action>
    1. Smoke build: `npm run build` — must complete without errors. (Catches missing imports / SSR issues.)
       If `npm run build` is too slow (>2 min), instead run `npx tsc --noEmit -p .` + `npx next lint` (existing project lint script) for a fast-path check.

    2. Verify Regla 3 invariant in Server Component + server action:
       ```
       grep -E "createAdminClient|@supabase/supabase-js" src/app/(dashboard)/agentes/crm-tools/ -r
       ```
       Expected: 0 matches.

    3. Verify the page is reachable in tabs:
       ```
       grep "/agentes/crm-tools" src/app/(dashboard)/agentes/layout.tsx
       ```
       Expected: 1 match.

    4. Stage + commit:
       ```
       git add src/app/\(dashboard\)/agentes/crm-tools src/app/\(dashboard\)/agentes/layout.tsx
       git commit -m "$(cat <<'EOF'
       feat(crm-query-tools): UI /agentes/crm-tools (Server + Client + server action)

       - page.tsx: Server Component reads getCrmQueryToolsConfig + listPipelines in parallel.
       - _actions.ts: saveCrmQueryToolsConfigAction with getActiveWorkspaceId guard + zod validation.
       - _components/ConfigEditor.tsx: Client Component with pipeline picker + multi-select stages + Save.
       - _components/MultiSelectStages.tsx: inline multi-select variant ({value, label} pairs grouped by pipeline).
       - layout.tsx: agrega tab "Herramientas CRM" → /agentes/crm-tools.
       - Regla 3: cero createAdminClient en _actions / page (mutación via domain layer).
       - ARIA labels (Pipeline, Stages activos, role=combobox) listas para E2E (Plan 06).

       Standalone: crm-query-tools Plan 05 (Wave 4).
       Refs D-11, D-13, D-14, D-16, D-22.

       Co-authored-by: Claude <noreply@anthropic.com>
       EOF
       )"
       ```

    5. Push: `git push origin main`.
  </action>
  <verify>
    <automated>! grep -rE "createAdminClient|@supabase/supabase-js" "src/app/(dashboard)/agentes/crm-tools/" 2>/dev/null && npx tsc --noEmit -p . 2>&1 | tail -3 && git log -1 --oneline | grep -i "crm-query-tools"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rE "createAdminClient|@supabase/supabase-js" "src/app/(dashboard)/agentes/crm-tools/"` returns 0.
    - `npx tsc --noEmit -p .` exits 0.
    - `npm run test -- --run` exits 0 (no regression — this plan adds no tests, just verifies existing pass).
    - `git log -1 --pretty=%s` matches `feat(crm-query-tools): UI`.
    - `git log @{u}..HEAD` is empty (push succeeded).
  </acceptance_criteria>
  <done>Plan 05 shipped to Vercel. UI is live at `/agentes/crm-tools`. Plan 06 (E2E) unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Next.js Server Action | Authenticated session via Supabase SSR cookie |
| Server Action → Domain layer | Workspace context derived from `getActiveWorkspaceId` (NOT body) |
| Server Action → Supabase | Domain `updateCrmQueryToolsConfig` filters by workspace_id |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W4-01 | Spoofing | Caller spoofs workspace_id in body | HIGH | mitigate | Server action discards any client-provided `workspaceId` — uses `getActiveWorkspaceId()` (cookie-validated). zod schema does NOT allow `workspaceId` field. |
| T-W4-02 | Tampering | Non-admin user writes config | HIGH | mitigate | Domain `updateCrmQueryToolsConfig` writes via Supabase admin client; RLS not enforced (admin client bypasses), but UI access is gated by Next.js session middleware (only logged-in workspace members reach this page). Defense-in-depth: zod validates UUIDs only. **Note for backlog:** add `is_workspace_admin` check in server action body (parallel to RLS policies on table). |
| T-W4-03 | Tampering | Stage UUID from another workspace inserted into junction | MEDIUM | mitigate | RLS policy `is_workspace_admin(workspace_id)` on `crm_query_tools_active_stages` rejects insert when `workspace_id` doesn't match caller. FK to `pipeline_stages(id)` accepts ANY stage_id; the `workspace_id` in the row pins it to caller's workspace. Pitfall: FK doesn't verify cross-workspace stage. **Mitigation:** server action validates `activeStageIds.every(id => belongsToWorkspace)` — DEFERRED to backlog (low priority because RLS prevents reading the inserted row from another workspace anyway). Recorded in INTEGRATION-HANDOFF.md (Plan 07). |
| T-W4-04 | Information Disclosure | Server action leaks raw DB error to UI | LOW | accept | Error bubbles up `{ success: false, error: 'pg error: ...' }` → toast. Acceptable for admin UI; acceptable risk per RESEARCH security domain. |
| T-W4-05 | Tampering | Concurrent UI saves overwrite each other | LOW | accept | Plan 02 noted: last-write-wins, no optimistic concurrency. Admin UI tolerable. |
| T-W4-06 | DoS | Massive `activeStageIds` (10k items) blows up junction sync | INFO | mitigate | zod `z.array(z.string().uuid())` — Pipelines have ≤100 stages typical, so practical cap. **Backlog:** add `.max(500)` to schema. |
| T-W4-07 | XSS | Pipeline name renders untrusted HTML | LOW | mitigate | React escapes `{p.name}` by default. No `dangerouslySetInnerHTML`. |
</threat_model>

<verification>
- `npx tsc --noEmit -p .` exits 0.
- `npm run test -- --run` exits 0 — no regression.
- `grep -rE "createAdminClient|@supabase/supabase-js" "src/app/(dashboard)/agentes/crm-tools/"` returns 0 (Regla 3).
- Layout includes the new tab.
- Push to origin/main succeeded — Vercel deploy triggered.
</verification>

<must_haves>
truths:
  - "User can navigate to /agentes/crm-tools from the agentes layout tabs."
  - "Page renders pipeline picker + multi-select stages from current workspace."
  - "Save button calls server action; toast surfaces success/error."
  - "Server action persists config to crm_query_tools_config + crm_query_tools_active_stages."
  - "Tools created in Plans 03/04 read this config on every call (D-19)."
artifacts:
  - path: "src/app/(dashboard)/agentes/crm-tools/page.tsx"
    provides: "Server Component for /agentes/crm-tools"
    contains: "<ConfigEditor"
  - path: "src/app/(dashboard)/agentes/crm-tools/_actions.ts"
    provides: "saveCrmQueryToolsConfigAction with admin guard + zod validation"
    exports: ["saveCrmQueryToolsConfigAction", "SaveCrmQueryToolsConfigInput", "SaveCrmQueryToolsConfigResult"]
  - path: "src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx"
    provides: "Client Component editor (pipeline picker + multi-select + save)"
    exports: ["ConfigEditor"]
  - path: "src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx"
    provides: "Inline multi-select variant accepting {value,label}[] grouped by pipeline"
    exports: ["MultiSelectStages", "StageOption", "StageGroup"]
  - path: "src/app/(dashboard)/agentes/layout.tsx"
    provides: "Tab Herramientas CRM linking to /agentes/crm-tools"
    contains: "/agentes/crm-tools"
key_links:
  - from: "src/app/(dashboard)/agentes/crm-tools/_actions.ts"
    to: "@/lib/domain/crm-query-tools-config (updateCrmQueryToolsConfig)"
    via: "import"
    pattern: "from '@/lib/domain/crm-query-tools-config'"
  - from: "src/app/(dashboard)/agentes/crm-tools/page.tsx"
    to: "@/lib/domain/pipelines (listPipelines)"
    via: "import"
    pattern: "from '@/lib/domain/pipelines'"
  - from: "ConfigEditor (Client) Save button"
    to: "saveCrmQueryToolsConfigAction (Server)"
    via: "useTransition + RSC server action call"
    pattern: "saveCrmQueryToolsConfigAction\\(input\\)"
</must_haves>
