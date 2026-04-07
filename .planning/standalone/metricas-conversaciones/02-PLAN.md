---
phase: standalone/metricas-conversaciones
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/metricas-conversaciones/types.ts
  - src/app/actions/metricas-conversaciones.ts
  - src/app/(dashboard)/metricas/page.tsx
  - src/app/(dashboard)/metricas/components/metricas-view.tsx
  - src/app/(dashboard)/metricas/components/metric-cards.tsx
  - src/app/(dashboard)/metricas/components/period-selector.tsx
autonomous: true
must_haves:
  truths:
    - "User can navigate to /metricas in a workspace where conversation_metrics.enabled=true and see 3 cards with totals for today"
    - "Switching period (today/yesterday/7d/30d) updates the cards via server action"
    - "Workspace whose flag is false redirects out of /metricas"
    - "Server action calls the RPC and respects per-workspace settings (reopen_window_days, scheduled_tag_name)"
  artifacts:
    - path: "src/lib/metricas-conversaciones/types.ts"
      provides: "Period, DailyMetric, MetricTotals, MetricsPayload, MetricsSettings types"
      exports: ["Period", "DailyMetric", "MetricTotals", "MetricsPayload"]
    - path: "src/app/actions/metricas-conversaciones.ts"
      provides: "getConversationMetrics server action wrapping the RPC"
      exports: ["getConversationMetrics"]
    - path: "src/app/(dashboard)/metricas/page.tsx"
      provides: "Server component with auth + settings gate + initial load"
    - path: "src/app/(dashboard)/metricas/components/metricas-view.tsx"
      provides: "Client view with period state + useTransition refresh"
    - path: "src/app/(dashboard)/metricas/components/metric-cards.tsx"
      provides: "3 cards displaying totals"
    - path: "src/app/(dashboard)/metricas/components/period-selector.tsx"
      provides: "Period selection buttons"
  key_links:
    - from: "src/app/(dashboard)/metricas/page.tsx"
      to: "src/app/actions/metricas-conversaciones.ts::getConversationMetrics"
      via: "direct import + initial call with 'today'"
      pattern: "getConversationMetrics\\('today'\\)"
    - from: "src/app/actions/metricas-conversaciones.ts"
      to: "supabase.rpc('get_conversation_metrics', ...)"
      via: "Supabase server client"
      pattern: "rpc\\('get_conversation_metrics'"
    - from: "src/app/(dashboard)/metricas/components/metricas-view.tsx"
      to: "getConversationMetrics"
      via: "useTransition + server action call on period change"
      pattern: "startTransition"
---

<objective>
Build the basic working dashboard at `/metricas`: types, server action calling the RPC from Plan 01, page with auth+settings gate, client view with period selector and 3 metric cards. NO chart yet, NO custom date range, NO realtime — those are Plans 03 and 04.

Purpose: Land a vertical slice end-to-end so the rest of the work (chart, realtime, settings UI) is purely additive on a working foundation.

Output: Navigating to `/metricas` in GoDentist Valoraciones shows 3 cards with today's totals; clicking period buttons refreshes them.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/metricas-conversaciones/CONTEXT.md
@.planning/standalone/metricas-conversaciones/RESEARCH.md
@.planning/standalone/metricas-conversaciones/01-SUMMARY.md
@src/app/(dashboard)/analytics/page.tsx
@src/app/(dashboard)/analytics/components/analytics-view.tsx
@src/app/(dashboard)/analytics/components/period-selector.tsx
@src/app/(dashboard)/analytics/components/metric-cards.tsx
@src/app/actions/analytics.ts
@src/lib/supabase/server.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Types + server action wrapping the RPC</name>
  <files>
src/lib/metricas-conversaciones/types.ts
src/app/actions/metricas-conversaciones.ts
  </files>
  <action>
**1. Create `src/lib/metricas-conversaciones/types.ts`:**

```typescript
export type Period = 'today' | 'yesterday' | '7days' | '30days' | { start: string; end: string }

export interface DailyMetric {
  date: string         // ISO date YYYY-MM-DD
  label: string        // e.g. "lun 6"
  nuevas: number
  reabiertas: number
  agendadas: number
}

export interface MetricTotals {
  nuevas: number
  reabiertas: number
  agendadas: number
}

export interface MetricsPayload {
  totals: MetricTotals
  daily: DailyMetric[]
}

export interface MetricsSettings {
  enabled: boolean
  reopen_window_days: number
  scheduled_tag_name: string
}

export const DEFAULT_METRICS_SETTINGS: MetricsSettings = {
  enabled: false,
  reopen_window_days: 7,
  scheduled_tag_name: 'VAL',
}
```

**2. Create `src/app/actions/metricas-conversaciones.ts`** following the blueprint of `src/app/actions/analytics.ts` (read it first to copy the auth pattern, cookie reads, error handling, and date-fns usage).

Critical implementation details:
- `'use server'` at the top
- Import `createClient` from `@/lib/supabase/server`, `cookies` from `next/headers`, `startOfDay`, `endOfDay`, `subDays`, `addDays`, `format`, `parseISO` from `date-fns`, `es` from `date-fns/locale`
- Import types from `@/lib/metricas-conversaciones/types`

- `getRange(period: Period): { start: Date; endExclusive: Date }`:
  - For period objects `{start, end}`: `start = startOfDay(parseISO(p.start))`, `endExclusive = addDays(startOfDay(parseISO(p.end)), 1)`
  - `today`: `[startOfDay(now), addDays(startOfDay(now),1))`
  - `yesterday`: `[startOfDay(subDays(now,1)), startOfDay(now))`
  - `7days`: `[startOfDay(subDays(now,6)), addDays(startOfDay(now),1))` (last 7 days inclusive)
  - `30days`: `[startOfDay(subDays(now,29)), addDays(startOfDay(now),1))`

  TIMEZONE NOTE: We must compute "today in Bogota" not "today in UTC" (Vercel runs in UTC). Use:
  ```typescript
  const nowBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  ```
  Then base all `startOfDay` calls on `nowBogota`. This is the documented morfx pattern (CLAUDE.md Rule 2).

- `export async function getConversationMetrics(period: Period): Promise<MetricsPayload>`:
  1. `const supabase = await createClient()`
  2. Read cookie `morfx_workspace`. If missing return empty `{ totals: zeros, daily: [] }`
  3. Auth: `const { data: { user } } = await supabase.auth.getUser()`. If no user, return empty.
  4. Read workspace settings:
     ```typescript
     const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
     const cfg = (ws?.settings as any)?.conversation_metrics ?? {}
     const reopenDays = typeof cfg.reopen_window_days === 'number' ? cfg.reopen_window_days : 7
     const tagName = typeof cfg.scheduled_tag_name === 'string' ? cfg.scheduled_tag_name : 'VAL'
     ```
  5. `const { start, endExclusive } = getRange(period)`
  6. Call RPC:
     ```typescript
     const { data, error } = await supabase.rpc('get_conversation_metrics', {
       p_workspace_id: workspaceId,
       p_start: start.toISOString(),
       p_end: endExclusive.toISOString(),
       p_reopen_days: reopenDays,
       p_tag_name: tagName,
     })
     if (error) {
       console.error('[metricas-conversaciones] RPC error:', error)
       return { totals: { nuevas: 0, reabiertas: 0, agendadas: 0 }, daily: [] }
     }
     ```
  7. Map result to `DailyMetric[]`:
     ```typescript
     const daily: DailyMetric[] = (data ?? []).map((r: any) => ({
       date: r.day,
       label: format(parseISO(r.day), 'EEE d', { locale: es }),
       nuevas: Number(r.nuevas) || 0,
       reabiertas: Number(r.reabiertas) || 0,
       agendadas: Number(r.agendadas) || 0,
     }))
     ```
  8. Compute totals via reduce, return `{ totals, daily }`

DO NOT pass through `src/lib/domain/` — this is read-only aggregation. Precedent: `analytics.ts` lives directly in `src/app/actions/`.

DO NOT use `createAdminClient` — use `createClient` so RLS applies (defense in depth alongside SECURITY INVOKER).
  </action>
  <verify>
- `npx tsc --noEmit` passes for both files
- Files exist at the correct paths
- `grep -n "rpc('get_conversation_metrics'" src/app/actions/metricas-conversaciones.ts` returns one match
- `grep -n "America/Bogota" src/app/actions/metricas-conversaciones.ts` returns at least one match
  </verify>
  <done>Server action compiles, calls the RPC with workspace settings, returns typed `MetricsPayload`, and computes "today in Bogota" not in UTC.</done>
</task>

<task type="auto">
  <name>Task 2: Page (server) + view (client) + period selector + metric cards</name>
  <files>
src/app/(dashboard)/metricas/page.tsx
src/app/(dashboard)/metricas/components/metricas-view.tsx
src/app/(dashboard)/metricas/components/metric-cards.tsx
src/app/(dashboard)/metricas/components/period-selector.tsx
  </files>
  <action>
Read `src/app/(dashboard)/analytics/page.tsx`, `analytics-view.tsx`, `period-selector.tsx`, and `metric-cards.tsx` first — these are your blueprint. Adapt structure and styling, replace data shape and metric labels.

**1. `src/app/(dashboard)/metricas/page.tsx` (Server Component):**

```typescript
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getConversationMetrics } from '@/app/actions/metricas-conversaciones'
import { MetricasView } from './components/metricas-view'

export const dynamic = 'force-dynamic'

export default async function MetricasPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) redirect('/crm/pedidos')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Settings gate — module is only accessible if enabled
  const { data: ws } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const enabled = (ws?.settings as any)?.conversation_metrics?.enabled === true
  if (!enabled) redirect('/crm/pedidos')

  // NOTE: NO adminOnly check — explicit exception. ALL workspace users can access this module.

  const initial = await getConversationMetrics('today')

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container py-6 px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Métricas de conversaciones</h1>
          <p className="text-sm text-muted-foreground">Nuevas, reabiertas y valoraciones agendadas por día.</p>
        </div>
        <MetricasView initial={initial} />
      </div>
    </div>
  )
}
```

**2. `src/app/(dashboard)/metricas/components/metricas-view.tsx` (Client):**

```typescript
'use client'

import { useCallback, useState, useTransition } from 'react'
import type { Period, MetricsPayload } from '@/lib/metricas-conversaciones/types'
import { getConversationMetrics } from '@/app/actions/metricas-conversaciones'
import { PeriodSelector } from './period-selector'
import { MetricCards } from './metric-cards'

export function MetricasView({ initial }: { initial: MetricsPayload }) {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState<MetricsPayload>(initial)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback((p: Period) => {
    startTransition(async () => {
      const next = await getConversationMetrics(p)
      setData(next)
    })
  }, [])

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p)
    refresh(p)
  }, [refresh])

  return (
    <div className="space-y-6">
      <PeriodSelector value={period} onChange={handlePeriodChange} disabled={isPending} />
      <MetricCards data={data.totals} loading={isPending} />
      {/* EvolutionChart added in Plan 03 */}
    </div>
  )
}
```

**3. `src/app/(dashboard)/metricas/components/period-selector.tsx`:**

Adapt from `analytics/components/period-selector.tsx`. Buttons for: Hoy, Ayer, Últimos 7 días, Últimos 30 días. Custom range button is added in Plan 03 — leave a placeholder slot but do not implement the popover here.

Type signature:
```typescript
export function PeriodSelector({
  value,
  onChange,
  disabled,
}: {
  value: Period
  onChange: (p: Period) => void
  disabled?: boolean
}) { ... }
```

Use shadcn `Button` with `variant={value === 'today' ? 'default' : 'outline'}` etc. Do NOT show the date range picker UI yet.

**4. `src/app/(dashboard)/metricas/components/metric-cards.tsx`:**

3 cards using `@/components/ui/card`. Each shows:
- Title (Nuevas / Reabiertas / Agendadas)
- Big number (totals.nuevas etc.)
- Small description (e.g., "Primer mensaje del cliente", "Volvieron tras 7+ días", "Tag VAL aplicado")
- Icon from lucide-react: `MessageSquarePlus`, `RefreshCcw`, `CalendarCheck`

Loading state: render skeleton with `animate-pulse` like `analytics/metric-cards.tsx`.

Layout: `<div className="grid gap-4 md:grid-cols-3">`.

CRITICAL: Do NOT use `adminOnly` checks anywhere. Per CONTEXT.md, ALL workspace users can access this module.
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `npm run build` does not break (or at minimum, the new files compile)
- Files exist at all 4 paths
- `grep -n "redirect('/crm/pedidos')" src/app/\\(dashboard\\)/metricas/page.tsx` returns matches for both gates (no workspace, not enabled)
- `grep -n "adminOnly" src/app/\\(dashboard\\)/metricas/` returns NOTHING (this module is for all users)
  </verify>
  <done>Page renders, settings gate enforced, period selector switches data via useTransition, 3 cards display totals.</done>
</task>

<task type="auto">
  <name>Task 3: Commit and push (Plan 01 migration + Plan 02 code together)</name>
  <files>
src/lib/metricas-conversaciones/types.ts
src/app/actions/metricas-conversaciones.ts
src/app/(dashboard)/metricas/page.tsx
src/app/(dashboard)/metricas/components/metricas-view.tsx
src/app/(dashboard)/metricas/components/metric-cards.tsx
src/app/(dashboard)/metricas/components/period-selector.tsx
  </files>
  <action>
Per CLAUDE.md Rule 1, push to Vercel after code changes before asking user to test.

```bash
git add src/lib/metricas-conversaciones/types.ts \
        src/app/actions/metricas-conversaciones.ts \
        src/app/\(dashboard\)/metricas/page.tsx \
        src/app/\(dashboard\)/metricas/components/metricas-view.tsx \
        src/app/\(dashboard\)/metricas/components/metric-cards.tsx \
        src/app/\(dashboard\)/metricas/components/period-selector.tsx

git commit -m "feat(metricas): dashboard base con cards y period selector

- Server action getConversationMetrics envuelve RPC get_conversation_metrics
- Page server component con gate por workspaces.settings.conversation_metrics.enabled
- View client con useTransition para refresh sin bloqueo
- 3 cards: Nuevas, Reabiertas, Agendadas (totales del periodo)
- Period selector: Hoy / Ayer / Ultimos 7 / Ultimos 30
- Sin adminOnly: todos los usuarios del workspace tienen acceso (excepcion explicita vs analytics)
- Timezone Bogota en getRange (CLAUDE.md Rule 2)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```

Confirm push succeeded.
  </action>
  <verify>`git log -1 --name-only` shows the 6 files. `git status` is clean.</verify>
  <done>Code pushed to main. Vercel deploy in progress.</done>
</task>

</tasks>

<verification>
- Server action returns shape `{ totals, daily }`
- Page redirects when settings flag is false
- Period selector triggers a re-call of the action
- 3 cards render with the totals
- No `adminOnly` anywhere
- TypeScript compiles
- Pushed to main
</verification>

<success_criteria>
- User can navigate to `/metricas` in GoDentist Valoraciones (after Plan 05 enables the flag — temporarily user can manually `UPDATE workspaces SET settings = jsonb_set(...)` for testing this plan)
- 3 cards render with real numbers from the RPC for "today"
- Clicking "Ayer" / "7 días" / "30 días" updates the cards
- Workspace without flag is redirected
</success_criteria>

<output>
After completion, create `.planning/standalone/metricas-conversaciones/02-SUMMARY.md` with:
- File paths created
- Vercel deploy URL
- Manual SQL command to enable flag for testing if needed
- Open issues for Plan 03/04/05
</output>
