---
phase: standalone/metricas-conversaciones
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/app/(dashboard)/metricas/components/evolution-chart.tsx
  - src/app/(dashboard)/metricas/components/date-range-popover.tsx
  - src/app/(dashboard)/metricas/components/period-selector.tsx
  - src/app/(dashboard)/metricas/components/metricas-view.tsx
autonomous: true
must_haves:
  truths:
    - "User sees an evolution chart with 3 lines (nuevas, reabiertas, agendadas) under the cards"
    - "Custom date range picker (react-day-picker) lets the user select a start and end date"
    - "Custom range request triggers the server action with `{start, end}` shape and refreshes both cards and chart"
    - "Range with end < start is rejected (button disabled or end clamped)"
  artifacts:
    - path: "src/app/(dashboard)/metricas/components/evolution-chart.tsx"
      provides: "Recharts LineChart with 3 series"
      contains: "ResponsiveContainer"
    - path: "src/app/(dashboard)/metricas/components/date-range-popover.tsx"
      provides: "react-day-picker mode='range' inside a popover"
      contains: "DayPicker"
  key_links:
    - from: "metricas-view.tsx"
      to: "evolution-chart.tsx"
      via: "props pass-through of data.daily"
      pattern: "EvolutionChart"
    - from: "period-selector.tsx"
      to: "date-range-popover.tsx"
      via: "Popover trigger button"
      pattern: "DateRangePopover"
---

<objective>
Add the per-day evolution chart (recharts) and the custom date range picker (react-day-picker) to the dashboard built in Plan 02. After this plan, the dashboard has full visualization and arbitrary range selection.

Purpose: Cards alone don't show trends. The chart is the second deliverable from CONTEXT.md. Custom range is required from v1 per phase summary.

Output: `/metricas` displays cards + line chart + period selector with custom range option.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/metricas-conversaciones/CONTEXT.md
@.planning/standalone/metricas-conversaciones/RESEARCH.md
@.planning/standalone/metricas-conversaciones/02-SUMMARY.md
@src/app/(dashboard)/analytics/components/sales-chart.tsx
@src/app/(dashboard)/metricas/components/metricas-view.tsx
@src/app/(dashboard)/metricas/components/period-selector.tsx
@src/lib/metricas-conversaciones/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Evolution chart component (recharts, 3 lines)</name>
  <files>
src/app/(dashboard)/metricas/components/evolution-chart.tsx
src/app/(dashboard)/metricas/components/metricas-view.tsx
  </files>
  <action>
**1. Read `src/app/(dashboard)/analytics/components/sales-chart.tsx`** as the blueprint for chart styling.

**2. Create `src/app/(dashboard)/metricas/components/evolution-chart.tsx`:**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { DailyMetric } from '@/lib/metricas-conversaciones/types'

interface Props {
  data: DailyMetric[]
  loading?: boolean
}

export function EvolutionChart({ data, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Evolución por día</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[320px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  if (!data.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Evolución por día</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
            Sin datos en el período seleccionado.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Evolución por día</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="nuevas"     name="Nuevas"     stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reabiertas" name="Reabiertas" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="agendadas"  name="Agendadas"  stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
```

**3. Update `metricas-view.tsx` to render `<EvolutionChart data={data.daily} loading={isPending} />`** below `<MetricCards>`. Import the new component.
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `grep -n "EvolutionChart" src/app/\\(dashboard\\)/metricas/components/metricas-view.tsx` returns 2 matches (import + use)
- `grep -n "ResponsiveContainer" src/app/\\(dashboard\\)/metricas/components/evolution-chart.tsx` returns 1 match
  </verify>
  <done>Chart renders 3 lines under the cards. Empty state shown when daily array is empty.</done>
</task>

<task type="auto">
  <name>Task 2: Date range popover + integration into period selector</name>
  <files>
src/app/(dashboard)/metricas/components/date-range-popover.tsx
src/app/(dashboard)/metricas/components/period-selector.tsx
  </files>
  <action>
**1. Create `src/app/(dashboard)/metricas/components/date-range-popover.tsx`:**

Use existing shadcn `Popover` (`@/components/ui/popover`) and `react-day-picker` (already installed at v9.13.0). Check if morfx already has a wrapper at `@/components/ui/calendar` and if so use it; otherwise import `DayPicker` directly from `react-day-picker` and import `react-day-picker/dist/style.css` once globally OR use the local Tailwind theming if morfx already has it.

Search first: `grep -rn "react-day-picker" src/components/ src/app/` to find any existing usage and follow the same pattern.

Component contract:

```typescript
'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
// import the morfx calendar wrapper if it exists, else react-day-picker DayPicker

export interface DateRangeValue { start: string; end: string }   // ISO YYYY-MM-DD

interface Props {
  value: DateRangeValue | null
  onChange: (range: DateRangeValue) => void
  disabled?: boolean
}

export function DateRangePopover({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ from?: Date; to?: Date }>({})

  const label = value
    ? `${format(new Date(value.start), 'd MMM', { locale: es })} – ${format(new Date(value.end), 'd MMM', { locale: es })}`
    : 'Rango personalizado'

  const handleApply = () => {
    if (!draft.from || !draft.to) return
    if (draft.to < draft.from) return  // validation: end >= start
    onChange({
      start: format(draft.from, 'yyyy-MM-dd'),
      end:   format(draft.to,   'yyyy-MM-dd'),
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={value ? 'default' : 'outline'} size="sm" disabled={disabled}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* DayPicker mode="range" — adapt to morfx's existing wrapper */}
        <DayPicker
          mode="range"
          selected={draft.from || draft.to ? { from: draft.from, to: draft.to } : undefined}
          onSelect={(r) => setDraft({ from: r?.from, to: r?.to })}
          locale={es}
          numberOfMonths={2}
        />
        <div className="flex justify-end gap-2 p-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleApply} disabled={!draft.from || !draft.to || (draft.to && draft.from && draft.to < draft.from)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

If morfx already has `@/components/ui/calendar` (a styled DayPicker wrapper), USE that instead and adjust imports.

**2. Update `period-selector.tsx`** to add the date range button on the right side. When user picks a range, call `onChange({ start, end })` (the Period type already accepts the object form). Also, when value is an object form, the preset buttons must show as unselected.

Logic:
```typescript
const isPresetActive = (preset: 'today'|'yesterday'|'7days'|'30days') =>
  typeof value === 'string' && value === preset
const customRange = typeof value === 'object' ? value : null

// pass to popover:
<DateRangePopover
  value={customRange}
  onChange={(r) => onChange(r)}
  disabled={disabled}
/>
```
  </action>
  <verify>
- `npx tsc --noEmit` passes
- `grep -n "DateRangePopover" src/app/\\(dashboard\\)/metricas/components/period-selector.tsx` returns 2 matches (import + use)
- `grep -n "mode=\"range\"" src/app/\\(dashboard\\)/metricas/components/date-range-popover.tsx` returns 1 match
- Visit `/metricas` after deploy: clicking the range button opens a calendar; selecting two dates and clicking Apply triggers a refresh
  </verify>
  <done>Custom range button works end-to-end and triggers the server action with the object form of Period.</done>
</task>

<task type="auto">
  <name>Task 3: Commit and push</name>
  <files>
src/app/(dashboard)/metricas/components/evolution-chart.tsx
src/app/(dashboard)/metricas/components/date-range-popover.tsx
src/app/(dashboard)/metricas/components/period-selector.tsx
src/app/(dashboard)/metricas/components/metricas-view.tsx
  </files>
  <action>
```bash
git add src/app/\(dashboard\)/metricas/components/

git commit -m "feat(metricas): chart de evolucion + date range custom

- EvolutionChart con recharts (3 lineas: nuevas/reabiertas/agendadas)
- DateRangePopover con react-day-picker mode=range
- Period selector integra el rango custom
- Validacion end >= start

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```
  </action>
  <verify>`git log -1 --name-only` shows the 4 files. Push succeeds.</verify>
  <done>Pushed to main; Vercel deploys.</done>
</task>

</tasks>

<verification>
- Chart visible with 3 lines under cards
- Date range popover opens, allows selection, applies with refresh
- Empty state when no data
- TypeScript compiles
</verification>

<success_criteria>
- Visiting `/metricas` shows cards + chart
- Switching to "7 días" updates both
- Custom range with start=last Monday, end=this Friday returns expected data
- Range with end < start is rejected
</success_criteria>

<output>
After completion, create `.planning/standalone/metricas-conversaciones/03-SUMMARY.md` with:
- File paths
- Screenshot reference if user provides one
- Notes on whether morfx already had a calendar wrapper or we used DayPicker direct
</output>
