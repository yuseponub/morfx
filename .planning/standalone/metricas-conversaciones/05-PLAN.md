---
phase: standalone/metricas-conversaciones
plan: 05
type: execute
wave: 4
depends_on: [02]
files_modified:
  - src/components/layout/sidebar.tsx
  - src/app/(dashboard)/metricas/settings/page.tsx
  - src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx
  - src/app/actions/metricas-conversaciones-settings.ts
  - src/lib/domain/workspace-settings.ts
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: true
must_haves:
  truths:
    - "Sidebar shows the 'Métricas' entry only in workspaces where settings.conversation_metrics.enabled === true"
    - "Sidebar entry is visible to ALL workspace users (no adminOnly)"
    - "User with manager role can edit reopen_window_days, scheduled_tag_name, and enabled flag from a settings UI"
    - "Settings writes go through src/lib/domain/ (not direct to Supabase from server action)"
    - "GoDentist Valoraciones workspace has the flag enabled after this plan completes"
  artifacts:
    - path: "src/components/layout/sidebar.tsx"
      provides: "Extended NavItem with settingsKey filter"
      contains: "settingsKey"
    - path: "src/app/(dashboard)/metricas/settings/page.tsx"
      provides: "Settings page server component"
    - path: "src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx"
      provides: "Form with enabled toggle, reopen window input, tag name input"
    - path: "src/app/actions/metricas-conversaciones-settings.ts"
      provides: "updateMetricsSettings server action"
      exports: ["updateMetricsSettings"]
    - path: "src/lib/domain/workspace-settings.ts"
      provides: "Domain function to merge settings.conversation_metrics into workspaces.settings JSONB"
      exports: ["updateConversationMetricsSettings"]
  key_links:
    - from: "sidebar.tsx::filteredNavItems"
      to: "currentWorkspace.settings.conversation_metrics.enabled"
      via: "settingsKey filter"
      pattern: "settingsKey"
    - from: "metrics-settings-form.tsx"
      to: "updateMetricsSettings server action"
      via: "form action / onSubmit"
      pattern: "updateMetricsSettings"
    - from: "updateMetricsSettings"
      to: "src/lib/domain/workspace-settings.ts::updateConversationMetricsSettings"
      via: "domain function call"
      pattern: "updateConversationMetricsSettings"
---

<objective>
Make the module gateable from the UI: extend the sidebar with a `settingsKey` mechanism, build a settings page where managers can toggle the flag and edit `reopen_window_days` / `scheduled_tag_name`, and route writes through the domain layer per CLAUDE.md Rule 3.

Purpose: Without this, the module is invisible (sidebar doesn't show it) and settings can only be changed via raw SQL. This plan makes the module discoverable and configurable.

Output: Manager goes to `/metricas/settings`, toggles enabled, and the sidebar entry appears for all users in the workspace.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/metricas-conversaciones/CONTEXT.md
@.planning/standalone/metricas-conversaciones/RESEARCH.md
@.planning/standalone/metricas-conversaciones/02-SUMMARY.md
@src/components/layout/sidebar.tsx
@src/lib/metricas-conversaciones/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend sidebar with settingsKey gating</name>
  <files>src/components/layout/sidebar.tsx</files>
  <action>
**1. Read the current sidebar fully** to understand:
- The `NavItem` type
- The `navItems` array
- The `filteredNavItems` computation (look for `adminOnly` and `hidden_modules` filters)
- How `currentWorkspace` is loaded

**2. Extend the `NavItem` type** to add an optional `settingsKey?: string` field. The format is `'<namespace>.<key>'` (e.g., `'conversation_metrics.enabled'`).

**3. Add a new entry to `navItems`:**

```typescript
{
  href: '/metricas',
  label: 'Métricas',
  icon: TrendingUp,             // import from 'lucide-react'
  settingsKey: 'conversation_metrics.enabled',
}
```

Place it in a sensible location (e.g., after analytics or in the analytics section).

**4. Extend the filter logic** in `filteredNavItems` (or wherever the existing `hiddenModules` filter lives):

```typescript
const settings = (currentWorkspace?.settings as Record<string, any> | null | undefined)
const filteredNavItems = navItems.filter(item => {
  if (item.adminOnly && !isManager) return false
  if (hiddenModules?.includes(item.href)) return false
  if (item.settingsKey) {
    const [ns, key] = item.settingsKey.split('.')
    if (!settings?.[ns]?.[key]) return false
  }
  return true
})
```

CRITICAL: The new `metricas` item MUST NOT have `adminOnly: true`. CONTEXT.md is explicit: ALL workspace users have access. This is the explicit exception versus `analytics` (which IS admin-only).

**5. Verify icon import:** if `TrendingUp` is not already imported from `lucide-react` in this file, add it to the existing import. Alternative icons: `BarChart3`, `Activity`, `LineChart`.
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `grep -n "settingsKey" src/components/layout/sidebar.tsx` returns at least 3 matches (type def, navItem entry, filter logic)
- `grep -n "'/metricas'" src/components/layout/sidebar.tsx` returns 1 match
- `grep -n "adminOnly" src/components/layout/sidebar.tsx` does NOT have `adminOnly: true` near the metricas entry
  </verify>
  <done>Sidebar shows the Métricas entry only when the flag is enabled, and shows it to all users (no role gate).</done>
</task>

<task type="auto">
  <name>Task 2: Domain function for settings writes (CLAUDE.md Rule 3)</name>
  <files>
src/lib/domain/workspace-settings.ts
src/app/actions/metricas-conversaciones-settings.ts
  </files>
  <action>
**1. Check if `src/lib/domain/workspace-settings.ts` already exists.** If yes, append to it. If no, create it.

```bash
ls src/lib/domain/workspace-settings.ts 2>/dev/null
ls src/lib/domain/ | grep -i workspace
```

**2. Create or extend `src/lib/domain/workspace-settings.ts`:**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { MetricsSettings } from '@/lib/metricas-conversaciones/types'
import { DEFAULT_METRICS_SETTINGS } from '@/lib/metricas-conversaciones/types'

/**
 * Merges conversation_metrics settings into workspaces.settings JSONB.
 * Per CLAUDE.md Rule 3: all mutations go through domain layer.
 */
export async function updateConversationMetricsSettings(
  workspaceId: string,
  partial: Partial<MetricsSettings>,
): Promise<{ ok: true; settings: MetricsSettings } | { ok: false; error: string }> {
  const admin = createAdminClient()

  // Read current
  const { data: ws, error: readErr } = await admin
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  if (readErr || !ws) return { ok: false, error: readErr?.message ?? 'workspace not found' }

  const current = ((ws.settings as any)?.conversation_metrics ?? {}) as Partial<MetricsSettings>
  const merged: MetricsSettings = {
    enabled:            partial.enabled            ?? current.enabled            ?? DEFAULT_METRICS_SETTINGS.enabled,
    reopen_window_days: partial.reopen_window_days ?? current.reopen_window_days ?? DEFAULT_METRICS_SETTINGS.reopen_window_days,
    scheduled_tag_name: partial.scheduled_tag_name ?? current.scheduled_tag_name ?? DEFAULT_METRICS_SETTINGS.scheduled_tag_name,
  }

  // Validate
  if (!Number.isInteger(merged.reopen_window_days) || merged.reopen_window_days < 1 || merged.reopen_window_days > 90) {
    return { ok: false, error: 'reopen_window_days debe ser entre 1 y 90' }
  }
  if (typeof merged.scheduled_tag_name !== 'string' || merged.scheduled_tag_name.trim() === '') {
    return { ok: false, error: 'scheduled_tag_name es requerido' }
  }

  // Merge into JSONB without clobbering other keys
  const newSettings = { ...((ws.settings as any) ?? {}), conversation_metrics: merged }

  const { error: writeErr } = await admin
    .from('workspaces')
    .update({ settings: newSettings })
    .eq('id', workspaceId)
  if (writeErr) return { ok: false, error: writeErr.message }

  return { ok: true, settings: merged }
}
```

**3. Create `src/app/actions/metricas-conversaciones-settings.ts`:**

```typescript
'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateConversationMetricsSettings } from '@/lib/domain/workspace-settings'
import type { MetricsSettings } from '@/lib/metricas-conversaciones/types'

export async function updateMetricsSettings(partial: Partial<MetricsSettings>) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { ok: false as const, error: 'no workspace' }

  // Auth: check user is a manager of this workspace (settings is admin-restricted)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'no auth' }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!member || (member.role !== 'manager' && member.role !== 'owner' && member.role !== 'admin')) {
    return { ok: false as const, error: 'permiso denegado' }
  }

  const result = await updateConversationMetricsSettings(workspaceId, partial)
  if (result.ok) {
    revalidatePath('/metricas')
    revalidatePath('/metricas/settings')
    // also revalidate root for sidebar refresh
    revalidatePath('/', 'layout')
  }
  return result
}
```

NOTES:
- The settings UI IS admin-restricted (only managers can change settings) — this is a different concern from the dashboard view itself which is open to all users.
- Verify the actual role values used in `workspace_members.role` by grepping: `grep -rn "role.*manager\|role.*admin\|role.*owner" src/lib/domain/ src/app/actions/` and adapt to morfx's exact values.
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `grep -n "updateConversationMetricsSettings" src/lib/domain/workspace-settings.ts` returns 1+ matches
- `grep -n "updateConversationMetricsSettings" src/app/actions/metricas-conversaciones-settings.ts` returns 1 match
- `grep -n "createAdminClient" src/lib/domain/workspace-settings.ts` returns 1 match (domain uses admin client per pattern)
  </verify>
  <done>Domain function merges settings safely without clobbering other JSONB keys; server action checks manager role and revalidates paths.</done>
</task>

<task type="auto">
  <name>Task 3: Settings page + form UI + commit + push + enable for GoDentist</name>
  <files>
src/app/(dashboard)/metricas/settings/page.tsx
src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx
  </files>
  <action>
**1. Create `src/app/(dashboard)/metricas/settings/page.tsx` (server component):**

```typescript
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MetricsSettingsForm } from './components/metrics-settings-form'
import type { MetricsSettings } from '@/lib/metricas-conversaciones/types'
import { DEFAULT_METRICS_SETTINGS } from '@/lib/metricas-conversaciones/types'

export const dynamic = 'force-dynamic'

export default async function MetricasSettingsPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) redirect('/crm/pedidos')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Settings page IS manager-only
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  const isManager = member && ['manager','owner','admin'].includes(member.role as string)
  if (!isManager) redirect('/metricas')

  const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
  const current: MetricsSettings = {
    ...DEFAULT_METRICS_SETTINGS,
    ...((ws?.settings as any)?.conversation_metrics ?? {}),
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container py-6 px-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Configuración — Métricas de conversaciones</h1>
          <p className="text-sm text-muted-foreground">Activa el módulo y ajusta los parámetros de cálculo.</p>
        </div>
        <MetricsSettingsForm initial={current} />
      </div>
    </div>
  )
}
```

**2. Create `src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx`:**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { updateMetricsSettings } from '@/app/actions/metricas-conversaciones-settings'
import type { MetricsSettings } from '@/lib/metricas-conversaciones/types'

export function MetricsSettingsForm({ initial }: { initial: MetricsSettings }) {
  const [enabled, setEnabled]       = useState(initial.enabled)
  const [reopenDays, setReopenDays] = useState(initial.reopen_window_days)
  const [tagName, setTagName]       = useState(initial.scheduled_tag_name)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateMetricsSettings({
        enabled,
        reopen_window_days: Number(reopenDays),
        scheduled_tag_name: tagName.trim(),
      })
      if (result.ok) {
        toast.success('Configuración guardada')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle>Parámetros del módulo</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="enabled">Módulo activo</Label>
            <p className="text-xs text-muted-foreground">Si está desactivado, el ítem no aparece en el sidebar.</p>
          </div>
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} disabled={isPending} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reopen">Días de silencio para "reabierta"</Label>
          <Input
            id="reopen"
            type="number"
            min={1}
            max={90}
            value={reopenDays}
            onChange={(e) => setReopenDays(Number(e.target.value))}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">Default: 7. Rango válido: 1–90 días.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tag">Tag de "valoración agendada"</Label>
          <Input
            id="tag"
            type="text"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">Default: VAL. Debe coincidir con el nombre exacto del tag en el workspace.</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

Verify shadcn `Switch`, `Input`, `Label` exist at `@/components/ui/`. If `Switch` does not exist, fall back to a checkbox.

**3. Commit and push:**

```bash
git add src/components/layout/sidebar.tsx \
        src/lib/domain/workspace-settings.ts \
        src/app/actions/metricas-conversaciones-settings.ts \
        src/app/\(dashboard\)/metricas/settings/page.tsx \
        src/app/\(dashboard\)/metricas/settings/components/metrics-settings-form.tsx

git commit -m "feat(metricas): sidebar gate por settings + UI de configuracion

- Sidebar: nuevo navItem 'Metricas' con settingsKey='conversation_metrics.enabled'
- NO adminOnly: todos los usuarios del workspace ven el item cuando esta activo
- /metricas/settings: pagina manager-only para editar enabled/reopen_window/tag_name
- Domain function updateConversationMetricsSettings en src/lib/domain/workspace-settings.ts
- Server action valida rol manager y revalida paths

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```

**4. Activate flag in GoDentist Valoraciones (one-time SQL via Supabase Dashboard):**

After the deploy succeeds, instruct the user (in the SUMMARY) to run this SQL ONCE in production to enable the module in GoDentist Valoraciones if they haven't already done so via the new settings UI:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{conversation_metrics}',
  '{"enabled": true, "reopen_window_days": 7, "scheduled_tag_name": "VAL"}'::jsonb
)
WHERE name = 'GoDentist Valoraciones';
```

OR they can navigate to `/metricas/settings` once a manager has access (but the sidebar entry won't appear until enabled is true — bootstrap problem). Recommend running the SQL once for the bootstrap, then editing further from the UI.
  </action>
  <verify>
- `git log -1 --name-only` shows the 5 files
- After deploy: visit `/metricas/settings` as a manager in GoDentist — form loads with current values
- Toggle enabled, change reopen days to 5, save → toast appears, form reflects new values
- Sidebar item appears/disappears according to the flag (may need page reload)
  </verify>
  <done>Manager can configure the module from UI. Settings are persisted via domain layer. Sidebar gate works.</done>
</task>

<task type="auto">
  <name>Task 4: Update platform state docs (CLAUDE.md Rule 4)</name>
  <files>docs/analysis/04-estado-actual-plataforma.md</files>
  <action>
Per CLAUDE.md Rule 4, any new module MUST be reflected in `docs/analysis/04-estado-actual-plataforma.md`. This task adds an entry for the new "Métricas de Conversaciones" module.

**1. Read the current structure of the doc** to find the right place to add the new module entry:

```bash
cat docs/analysis/04-estado-actual-plataforma.md | head -200
grep -n "^##\|^###" docs/analysis/04-estado-actual-plataforma.md
```

Identify the section format used for other modules (look for similar read-only dashboard modules or analytics-style entries). Match the existing heading level, field naming, and tone. Do NOT invent a new format — mirror what's already there.

**2. Add a new module entry** following the existing format. The content to capture:

- **Module name:** Métricas de Conversaciones
- **Status:** active
- **Module type:** Dashboard read-only con actualización realtime híbrida (Supabase Realtime + re-fetch del RPC)
- **Workspace activation:** gated by `workspaces.settings.conversation_metrics.enabled` (JSONB flag)
- **Currently active in:** GoDentist Valoraciones
- **Permissions:**
  - Dashboard (`/metricas`): todos los usuarios del workspace
  - Settings (`/metricas/settings`): solo managers/owners/admins
- **Key files:**
  - `src/app/(dashboard)/metricas/` — página, componentes, hook realtime
  - `src/app/actions/metricas-conversaciones.ts` — server action que ejecuta el RPC
  - `src/lib/domain/workspace-settings.ts` — función de dominio para settings
  - `supabase/migrations/` — RPC `get_conversation_metrics` y migración de realtime
- **Métricas calculadas:** nuevas, reabiertas (después de N días de silencio, default 7), agendadas (por tag, default "VAL")
- **Bugs conocidos:** ninguno al cierre de esta fase
- **Deuda técnica:** ninguna al cierre de esta fase

**3. Adapt the entry to match existing format exactly.** If other modules use tables, use a table. If they use bullet lists, use bullets. If they have a "status badge" convention, follow it.

**4. Do NOT commit yet** — Task 3 already pushed the code changes. This doc update should be a separate commit:

```bash
git add docs/analysis/04-estado-actual-plataforma.md

git commit -m "docs(metricas): agregar modulo Metricas de Conversaciones a estado de plataforma

- Status: active
- Activacion gated por workspaces.settings.conversation_metrics.enabled
- Activo en: GoDentist Valoraciones
- Tipo: dashboard read-only con realtime hibrido
- Permisos: dashboard abierto a todos, settings manager-only

Cumple CLAUDE.md Regla 4 (documentacion siempre actualizada).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```
  </action>
  <verify>
- `grep -n "Métricas de Conversaciones\|Metricas de Conversaciones\|conversation_metrics" docs/analysis/04-estado-actual-plataforma.md` returns at least 1 match
- `grep -n "GoDentist Valoraciones" docs/analysis/04-estado-actual-plataforma.md` returns at least 1 match in the new section
- `git log -1 --name-only` shows `docs/analysis/04-estado-actual-plataforma.md`
  </verify>
  <done>Platform state doc includes an entry for the new module that matches the existing format, with status=active, activation flag documented, and GoDentist Valoraciones listed as active workspace.</done>
</task>

</tasks>

<verification>
- Sidebar entry only renders when settings flag is true
- Sidebar entry visible to all roles (not adminOnly)
- Settings page is manager-only
- Domain layer used for the write (CLAUDE.md Rule 3)
- TypeScript compiles
- Pushed to main
</verification>

<success_criteria>
- GoDentist Valoraciones workspace has the module enabled and visible in the sidebar
- A non-manager user in GoDentist can see the sidebar entry and access `/metricas`
- A non-manager user is redirected away from `/metricas/settings`
- A manager can change `reopen_window_days` from the UI and the next dashboard load uses the new value
</success_criteria>

<output>
After completion, create `.planning/standalone/metricas-conversaciones/05-SUMMARY.md` with:
- Files modified
- Whether bootstrap SQL was needed (or settings UI handled it)
- Final state of GoDentist Valoraciones settings JSONB
- Phase complete checklist (all 7 must-haves met)
</output>
