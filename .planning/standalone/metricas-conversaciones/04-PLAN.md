---
phase: standalone/metricas-conversaciones
plan: 04
type: execute
wave: 4
depends_on: [03]
files_modified:
  - src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts
  - src/app/(dashboard)/metricas/components/metricas-view.tsx
  - supabase/migrations/20260406000001_messages_realtime.sql  # conditional: only if messages not already in supabase_realtime publication
autonomous: false
must_haves:
  truths:
    - "When a new INSERT happens on `messages` for the current workspace, the dashboard re-fetches the RPC within ~1s"
    - "When a contact_tag INSERT or DELETE happens for the current workspace, the dashboard re-fetches"
    - "Subscription unsubscribes cleanly on component unmount (no leaks)"
    - "Re-fetch is debounced/coalesced to avoid hammering the RPC under burst inserts"
  artifacts:
    - path: "src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts"
      provides: "useMetricasRealtime hook subscribing to messages + contact_tags"
      exports: ["useMetricasRealtime"]
  key_links:
    - from: "use-metricas-realtime.ts"
      to: "supabase.channel(...).on('postgres_changes', ...)"
      via: "Realtime postgres_changes filtered by workspace_id"
      pattern: "postgres_changes"
    - from: "metricas-view.tsx"
      to: "use-metricas-realtime.ts"
      via: "useMetricasRealtime(workspaceId, () => refresh(period))"
      pattern: "useMetricasRealtime"
---

## NOTE: Supersedes RESEARCH.md anti-pattern

RESEARCH.md lists "no realtime subscriptions" under anti-patterns and recommends polling.
This was superseded by the final design decision in CONTEXT.md (refresh model: "Realtime
Híbrido"). This plan implements Supabase Realtime subscriptions per CONTEXT.md, NOT polling.
If the executor reads conflicting guidance in RESEARCH.md, CONTEXT.md and this plan win.

<objective>
Add the realtime hybrid refresh: subscribe to Supabase Realtime on `messages` (INSERT) and `contact_tags` (INSERT, DELETE) filtered by workspace_id. On any event, re-execute the server action (NOT incremental updates — re-pregunta la verdad al backend).

Purpose: Sub-second freshness without polling, without realtime SDK reinventing aggregation. The full RPC is the source of truth.

Output: Cards and chart update within ~1s of any inbound message or tag change.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/metricas-conversaciones/CONTEXT.md
@.planning/standalone/metricas-conversaciones/RESEARCH.md
@.planning/standalone/metricas-conversaciones/03-SUMMARY.md
@src/app/(dashboard)/metricas/components/metricas-view.tsx
@src/lib/supabase/client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Realtime hook with debounced re-fetch</name>
  <files>src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts</files>
  <action>
**1. Find the morfx Supabase browser client first:**

Run `grep -rn "createClient" src/lib/supabase/` to confirm the export name. Likely `src/lib/supabase/client.ts` exports `createClient` for browser use. If a different name (e.g. `createBrowserClient`), use that.

**2. Confirm `messages` and `contact_tags` are in the Realtime publication:**

Migration `20260317100000_contact_tags_realtime.sql` confirms `contact_tags`. For `messages`, check `supabase/migrations/` for any `ALTER PUBLICATION supabase_realtime ADD TABLE messages`. If not present, this hook will silently fail. Document in the SUMMARY if a follow-up migration is needed.

```bash
grep -rn "ADD TABLE messages" supabase/migrations/
grep -rn "publication supabase_realtime" supabase/migrations/
```

If `messages` is NOT in the publication, add a one-line migration `supabase/migrations/20260406000001_messages_realtime.sql`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```
And include the same PAUSE-for-user pattern as Plan 01 Task 2 — pause and ask user to apply in production. (If `messages` IS already in the publication, skip this side migration.)

**IMPORTANT — Track whether the side migration was created:** Record this decision explicitly (e.g., write a note, or simply remember for Task 3). Task 3's commit step MUST include this file in `git add` if and only if it exists. Do NOT rely on silent `2>/dev/null || true` — be explicit.

**3. Create `src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts`:**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to Realtime events that affect conversation metrics:
 *  - messages INSERT (filtered by workspace_id) → may change nuevas / reabiertas
 *  - contact_tags INSERT and DELETE → may change agendadas
 * On any event, calls onChange() with debounce so bursts coalesce.
 */
export function useMetricasRealtime(
  workspaceId: string | null,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!workspaceId) return
    const supabase = createClient()

    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (!document.hidden) onChangeRef.current()
      }, 400)  // coalesce bursts within 400ms
    }

    const channel = supabase
      .channel(`metricas:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        debounced,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contact_tags',
          // contact_tags has no workspace_id column directly — filter at handler level
        },
        debounced,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'contact_tags',
        },
        debounced,
      )
      .subscribe()

    // Re-fetch when tab becomes visible again (caught up missed events)
    const onVis = () => { if (!document.hidden) onChangeRef.current() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
      supabase.removeChannel(channel)
    }
  }, [workspaceId])
}
```

NOTES:
- `contact_tags` does NOT have a `workspace_id` column (it's normalized through `contact_id` → `contacts.workspace_id`). Realtime filters cannot do joins, so we accept events from all workspaces and rely on the next RPC call to recompute the truth scoped to the user's workspace. The 400ms debounce + RPC scoping makes this safe.
- Debounce 400ms: bursts (e.g., 5 messages in 1 second) collapse to one re-fetch.
- `document.hidden` check: don't waste queries when tab is in background.
- `visibilitychange` listener: re-fetch on focus to catch up missed events while hidden.
- Cleanup: clearTimeout, removeEventListener, removeChannel — no leaks.
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `grep -n "removeChannel" src/app/\\(dashboard\\)/metricas/hooks/use-metricas-realtime.ts` returns 1 match (cleanup)
- `grep -n "document.hidden" src/app/\\(dashboard\\)/metricas/hooks/use-metricas-realtime.ts` returns at least 1 match
  </verify>
  <done>Hook compiles, subscribes to 3 channels, debounces, cleans up properly.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: PAUSE if messages publication migration was created</name>
  <what-built>If the hook task discovered that `messages` is NOT in the `supabase_realtime` publication and a side migration was created (`supabase/migrations/20260406000001_messages_realtime.sql`), it must be applied to production before pushing.</what-built>
  <how-to-verify>
**ONLY if Task 1 created the side migration.** Otherwise skip and resume immediately.

If created:
1. Open Supabase Dashboard → SQL Editor for production
2. Run:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE messages;
   ```
3. Verify:
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages';
   ```
   Returns one row.
  </how-to-verify>
  <resume-signal>Type "publication aplicada" or "no migration needed" if Task 1 found `messages` already in the publication.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Wire hook into MetricasView + commit + push</name>
  <files>
src/app/(dashboard)/metricas/components/metricas-view.tsx
src/app/(dashboard)/metricas/page.tsx
  </files>
  <action>
**1. Update `metricas-view.tsx`:**

Add a `workspaceId` prop (string). In the component, call `useMetricasRealtime(workspaceId, () => refresh(period))`. Use the latest `period` via a ref or include `period` in the dependency through `useCallback`.

```typescript
'use client'

import { useCallback, useState, useTransition, useRef, useEffect } from 'react'
import type { Period, MetricsPayload } from '@/lib/metricas-conversaciones/types'
import { getConversationMetrics } from '@/app/actions/metricas-conversaciones'
import { useMetricasRealtime } from '../hooks/use-metricas-realtime'
import { PeriodSelector } from './period-selector'
import { MetricCards } from './metric-cards'
import { EvolutionChart } from './evolution-chart'

export function MetricasView({ initial, workspaceId }: { initial: MetricsPayload; workspaceId: string }) {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState<MetricsPayload>(initial)
  const [isPending, startTransition] = useTransition()
  const periodRef = useRef<Period>('today')
  useEffect(() => { periodRef.current = period }, [period])

  const refresh = useCallback((p?: Period) => {
    const target = p ?? periodRef.current
    startTransition(async () => {
      setData(await getConversationMetrics(target))
    })
  }, [])

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p)
    refresh(p)
  }, [refresh])

  // Realtime: any change triggers re-fetch with the current period
  useMetricasRealtime(workspaceId, () => refresh())

  return (
    <div className="space-y-6">
      <PeriodSelector value={period} onChange={handlePeriodChange} disabled={isPending} />
      <MetricCards data={data.totals} loading={isPending} />
      <EvolutionChart data={data.daily} loading={isPending} />
    </div>
  )
}
```

**2. Update `page.tsx` to pass `workspaceId={workspaceId}`** to `<MetricasView>`. The variable already exists in the page from the cookie read.

**3. Commit and push:**

Explicitly check whether the conditional side migration from Task 1 exists and include it in the commit if and only if it is present. Do NOT use silent redirection — use an explicit `if [ -f ... ]` check so the decision is visible in the execution log.

```bash
# Base files (always present)
git add src/app/\(dashboard\)/metricas/hooks/use-metricas-realtime.ts \
        src/app/\(dashboard\)/metricas/components/metricas-view.tsx \
        src/app/\(dashboard\)/metricas/page.tsx

# Conditional side migration — include ONLY if Task 1 created it
MIGRATION_FILE="supabase/migrations/20260406000001_messages_realtime.sql"
if [ -f "$MIGRATION_FILE" ]; then
  echo "Including conditional migration: $MIGRATION_FILE"
  git add "$MIGRATION_FILE"
else
  echo "No side migration created (messages already in supabase_realtime publication)"
fi

git commit -m "feat(metricas): realtime hibrido (re-fetch RPC on change)

- Hook useMetricasRealtime suscribe a messages INSERT y contact_tags INSERT/DELETE
- Debounce 400ms para coalescer bursts
- Skip refetch cuando document.hidden
- Refetch on visibilitychange (recupera eventos perdidos en background)
- Cleanup completo: removeChannel + removeEventListener + clearTimeout
- contact_tags no tiene workspace_id directo: filtro se aplica en el RPC scope

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```
  </action>
  <verify>
- `git log -1 --name-only` shows the hook + view + page (and the migration file if it was created in Task 1)
- `grep -n "useMetricasRealtime" src/app/\\(dashboard\\)/metricas/components/metricas-view.tsx` returns 2 matches
- After deploy: open `/metricas` in two browser tabs in the GoDentist workspace. Send a WhatsApp message in tab 1 (or insert a test row), tab 2 should refresh within ~1s
  </verify>
  <done>Cards and chart auto-refresh on messages/contact_tags changes within 1s.</done>
</task>

</tasks>

<verification>
- Subscription created on mount, removed on unmount (no console warnings on navigation)
- Re-fetch happens within ~1s of a new message
- No re-fetch when tab is hidden
- Re-fetch happens when tab becomes visible again
</verification>

<success_criteria>
- User sees cards/chart update without manual refresh after a new conversation arrives
- Browser console shows no leaked subscriptions on navigation
- Network tab shows debounced calls (not one per insert during burst)
</success_criteria>

<output>
After completion, create `.planning/standalone/metricas-conversaciones/04-SUMMARY.md` with:
- Whether the messages publication migration was needed
- Latency observed in user testing
- Any debounce tuning needed
</output>
