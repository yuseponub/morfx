---
phase: ui-redesign-dashboard
plan: 07
type: execute
wave: 3
depends_on: ['01']
files_modified:
  - src/app/(dashboard)/analytics/components/analytics-view.tsx
  - src/app/(dashboard)/analytics/components/metric-cards.tsx
  - src/app/(dashboard)/analytics/components/period-selector.tsx
  - src/app/(dashboard)/analytics/components/sales-chart.tsx
  - src/app/(dashboard)/metricas/components/metricas-view.tsx
  - src/app/(dashboard)/metricas/components/metric-cards.tsx
  - src/app/(dashboard)/metricas/components/period-selector.tsx
  - src/app/(dashboard)/metricas/components/evolution-chart.tsx
  - src/app/(dashboard)/metricas/components/date-range-popover.tsx
autonomous: true
requirements:
  - D-DASH-08
  - D-DASH-11
  - D-DASH-13
  - D-DASH-14
  - D-DASH-15
  - D-DASH-07

must_haves:
  truths:
    - "Cuando `useDashboardV2()===true`, `analytics/components/metric-cards.tsx` y `metricas/components/metric-cards.tsx` renderean cards `paper-0` + `border ink-1` + `shadow-stamp` con label `mx-smallcaps` color `var(--rubric-2)` (10-11px tracking 0.12-0.14em uppercase weight 700), value en font-display serif 28-32px ink-1 con `font-variant-numeric: tabular-nums`, y descripcion/delta en `var(--font-mono)` 11px color ink-3 (D-DASH-11 dictionary-table + analytics.html `.kpi`)"
    - "Cuando `useDashboardV2()===false`, ambos `MetricCards` rendean byte-identical al actual (shadcn Card + bg-muted skeleton) — verificable por git diff con flag OFF cookie override"
    - "Cuando v2, `analytics/components/sales-chart.tsx` (Recharts AreaChart) usa: `CartesianGrid stroke=\"var(--ink-4)\" strokeOpacity={0.2}` (NO clase tailwind stroke-muted), `XAxis`/`YAxis` con `tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}`, gradient `linearGradient` con stops `var(--rubric-2)` (NO `hsl(var(--primary))`), `Area stroke=\"var(--rubric-2)\"`, container `paper-0` + `border ink-1` + `shadow-stamp`, header con eyebrow `mx-smallcaps rubric-2` `'Tendencia'` + h3 display 20px `'Tendencia de Ventas'` (D-DASH-13 + analytics.html `.section.chart-main` + `.sh`)"
    - "Cuando v2, `metricas/components/evolution-chart.tsx` (Recharts LineChart) usa la misma serie de tokens editorial: grid `var(--ink-4)/0.2`, axes `var(--ink-3)` + mono 11px, lineas en order `var(--rubric-2)` (Nuevas) → `var(--accent-gold)` (Reabiertas) → `var(--accent-verdigris)` (Agendadas) reemplazando los hex `#6366f1`/`#f59e0b`/`#10b981`, tooltip con `backgroundColor: 'var(--paper-0)'` + `border: 1px solid var(--ink-1)' + `borderRadius: var(--radius-3)` (NO `hsl(var(--background))`), legend wrapper sans 11px ink-2, container paper-0 + border ink-1 + shadow-stamp, header eyebrow + h3 (D-DASH-13)"
    - "Cuando v2, ambos `period-selector.tsx` (analytics + metricas) renderean grupo de buttons unidos estilo `.period` del mock: container `inline-flex border ink-1 rounded-[3px] overflow-hidden shadow-stamp`, cada button `font-sans 12px weight 600 px-3 py-1.5 paper-0 ink-2 border-r ink-1` (last:border-r-0), active button `bg-ink-1 text-paper-0`. Reemplaza el grupo shadcn `bg-muted rounded-lg` (D-DASH-14 forms editorial)"
    - "Cuando v2 + metricas date-range, el trigger button del `date-range-popover.tsx` usa `border ink-1 paper-0 text-ink-1` (no shadcn `variant='default'/'outline'` defaults); el popover content trasero a `.theme-editorial` via `portalContainer` prop al wrapper `[data-theme-editorial]` (D-DASH-09 + D-DASH-10)"
    - "Cuando v2 + loading, los skeletons usan `bg-[var(--paper-2)]` + `border border-[var(--border)]` + `animate-[mx-pulse_1.5s_ease-in-out_infinite]` reemplazando `bg-muted animate-pulse rounded` (D-DASH-15)"
    - "Cuando v2 + empty (sales-chart o evolution-chart sin data), renderea `mx-h4 'Sin datos en este periodo'` (analytics) o `mx-h4 'Sin datos en el periodo seleccionado.'` (metricas) + `mx-rule-ornament '· · ·'` dentro del container editorial — NO el shadcn `text-muted-foreground` actual"
    - "Cero cambios funcionales: `getOrderMetrics`, `getSalesTrend`, `getConversationMetrics`, `useMetricasRealtime`, `setPeriod`, `startTransition`, `handlePeriodChange`, `DateRangeValue`, `parseISO`/`format` flow, recharts `data` shape, props de cada componente y su tipado (`OrderMetrics`, `SalesTrend`, `MetricTotals`, `DailyMetric`, `Period`) intactos (D-DASH-07)"
    - "Build pasa: `npx tsc --noEmit` clean en los 9 archivos modificados; con flag OFF git diff de la rama vs base commit muestra cambios SOLO en estos archivos in-scope — no en `actions/analytics`, `actions/metricas-conversaciones`, `lib/analytics/types`, `lib/metricas-conversaciones/types`, `hooks/use-metricas-realtime`, `metricas/settings/**`, `metricas/page.tsx`, `analytics/page.tsx`"
  artifacts:
    - path: "src/app/(dashboard)/analytics/components/metric-cards.tsx"
      provides: "Editorial KPI cards (paper-0 + ink-1 border + shadow-stamp + smallcaps rubric-2 label + serif display value + mono delta) gated by useDashboardV2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/analytics/components/sales-chart.tsx"
      provides: "Recharts AreaChart re-themed editorial (axes/grid/series tokens) + section chrome editorial gated"
      contains: "var(--rubric-2)"
    - path: "src/app/(dashboard)/analytics/components/period-selector.tsx"
      provides: "Editorial period switch grupo de buttons unidos border ink-1 active ink-1/paper-0"
      contains: "border-[var(--ink-1)]"
    - path: "src/app/(dashboard)/analytics/components/analytics-view.tsx"
      provides: "Wrapper editorial pasa flag a hijos sin alterar transition/state — solo class swap del flex container"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/metricas/components/metric-cards.tsx"
      provides: "Editorial KPI cards (3-col) con label smallcaps rubric-2 + value display serif + descripcion mono ink-3"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/metricas/components/evolution-chart.tsx"
      provides: "Recharts LineChart re-themed con series order rubric-2/accent-gold/accent-verdigris + section chrome editorial"
      contains: "var(--accent-gold)"
    - path: "src/app/(dashboard)/metricas/components/period-selector.tsx"
      provides: "Editorial period selector unificado preserva DateRangePopover compostado"
      contains: "border-[var(--ink-1)]"
    - path: "src/app/(dashboard)/metricas/components/date-range-popover.tsx"
      provides: "Trigger editorial border ink-1 + popover content portal-container respetuoso del tema (D-DASH-10)"
      contains: "border-[var(--ink-1)]"
    - path: "src/app/(dashboard)/metricas/components/metricas-view.tsx"
      provides: "Wrapper editorial preserva refresh + useMetricasRealtime intactos"
      contains: "useDashboardV2"
  key_links:
    - from: "src/app/(dashboard)/analytics/components/metric-cards.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/analytics/components/sales-chart.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/analytics/components/period-selector.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/metricas/components/metric-cards.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/metricas/components/evolution-chart.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/metricas/components/period-selector.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/metricas/components/date-range-popover.tsx"
      to: "src/components/ui/popover.tsx"
      via: "PopoverContent portalContainer prop (D-DASH-10)"
      pattern: "portalContainer"
---

<objective>
Wave 3 — Re-skin Analytics + Métricas modules: KPI cards (editorial paper-0/ink-1/shadow-stamp + smallcaps rubric-2 label + display serif value + mono delta), Recharts charts re-themed via props (axes ink-3, grid ink-4/0.2, series rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2), period selectors estilo `.period` del mock (button group unido border ink-1, active ink-1/paper-0), date-range popover con trigger editorial + portal respetuoso del tema, empty/loading states editorial. Todo gated por `useDashboardV2()` con flag OFF byte-identical al actual.

**Purpose:** Convertir los dos módulos de análisis al lenguaje editorial sin tocar las queries/server actions/realtime hooks (D-DASH-07). El reto principal es Recharts: la libreria YA está aceptando theming via props (`stroke`, `fill`, `tick.fill`, `tick.fontFamily`), entonces NO se migra ni se re-escribe la chart logic — solo se reemplazan tokens. La regla absoluta es "no `hsl(var(--*))` antipattern" y reemplazar por `var(--*)` directo. Charts container, header (eyebrow + display title), KPI cards, period selector y date-range popover son los 5 patterns que se introducen — todos gated por el flag para preservar flag-OFF byte-identical (D-DASH-07).

**Output:** 9 archivos modificados (4 analytics + 5 metricas). Build clean. Con flag ON, ambos dashboards muestran cards editorial con números grandes serif + charts editorial con axes/grid/series re-tematizadas + period selector unificado + date-range popover con trigger editorial. Con flag OFF, idénticos a hoy. CERO cambios a `getOrderMetrics`, `getSalesTrend`, `getConversationMetrics`, `useMetricasRealtime`, `Period`/`OrderMetrics`/`SalesTrend`/`MetricTotals`/`DailyMetric` types, `analytics/page.tsx`, `metricas/page.tsx`, ni `metricas/settings/**`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/analytics.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css

# Source files in scope (analytics):
@src/app/(dashboard)/analytics/components/analytics-view.tsx
@src/app/(dashboard)/analytics/components/metric-cards.tsx
@src/app/(dashboard)/analytics/components/period-selector.tsx
@src/app/(dashboard)/analytics/components/sales-chart.tsx

# Source files in scope (métricas):
@src/app/(dashboard)/metricas/components/metricas-view.tsx
@src/app/(dashboard)/metricas/components/metric-cards.tsx
@src/app/(dashboard)/metricas/components/period-selector.tsx
@src/app/(dashboard)/metricas/components/evolution-chart.tsx
@src/app/(dashboard)/metricas/components/date-range-popover.tsx

# NOT IN SCOPE — DO NOT MODIFY (verify via git diff at end):
# - src/app/(dashboard)/analytics/page.tsx (server component, role check, fetches initial data)
# - src/app/(dashboard)/metricas/page.tsx (server component, settings gate, fetches initial data)
# - src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts (realtime hook — D-DASH-07)
# - src/app/(dashboard)/metricas/settings/** (separate flow)
# - src/app/actions/analytics.ts (server actions — D-DASH-07)
# - src/app/actions/metricas-conversaciones.ts (server actions — D-DASH-07)
# - src/lib/analytics/types.ts, src/lib/metricas-conversaciones/types.ts (types — D-DASH-07)
# - src/components/ui/card.tsx, src/components/ui/popover.tsx, src/components/ui/calendar.tsx (shadcn primitives — solo additive prop si hace falta para portal, D-DASH-09)

<interfaces>
<!-- Wave 0 outputs (Plan 01 — to be shipped before this Plan 07 starts): -->

`useDashboardV2` hook (from `src/components/layout/dashboard-v2-context.tsx`):
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider (fail-closed)
```

`.theme-editorial` CSS scope (already in `globals.css` from `ui-redesign-conversaciones` Plan 01):
- Utilities: `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament`
- Tag utilities: `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}`
- Tokens (vars): `--paper-0`, `--paper-1`, `--paper-2`, `--paper-3`, `--ink-1`, `--ink-2`, `--ink-3`, `--ink-4`, `--ink-5`, `--rubric-1`, `--rubric-2`, `--accent-gold`, `--accent-verdigris`, `--accent-indigo`, `--semantic-success`, `--border`, `--font-display`, `--font-sans`, `--font-mono`, `--font-serif`, `--radius-3`
- Animation: `@keyframes mx-pulse` (for skeletons — same as inbox v2 Plan 02)
- Shadow: `shadow-stamp` utility = `0 1px 0 var(--ink-1)`

Existing types to preserve verbatim:
```typescript
// src/lib/analytics/types.ts
export type Period = 'today' | '7days' | '30days' | 'month'
export interface OrderMetrics { totalOrders: number; totalValue: number; conversionRate: number; avgTicket: number }
export interface TrendDataPoint { label: string; value: number; orders: number }
export interface SalesTrend { data: TrendDataPoint[] }

// src/lib/metricas-conversaciones/types.ts
export type Period = 'today' | 'yesterday' | '7days' | '30days' | { start: string; end: string }
export interface MetricTotals { nuevas: number; reabiertas: number; agendadas: number }
export interface DailyMetric { label: string; nuevas: number; reabiertas: number; agendadas: number }
export interface MetricsPayload { totals: MetricTotals; daily: DailyMetric[] }
```

Existing component prop signatures (preserve EXACTLY — D-DASH-07):
```typescript
// analytics
interface AnalyticsViewProps { initialMetrics: OrderMetrics; initialTrend: SalesTrend }
interface MetricCardsProps { metrics: OrderMetrics; loading?: boolean } // analytics
interface PeriodSelectorProps { value: Period; onChange: (period: Period) => void; disabled?: boolean } // analytics
interface SalesChartProps { data: TrendDataPoint[]; loading?: boolean }

// metricas
interface MetricasViewProps { initial: MetricsPayload; workspaceId: string }
interface MetricCardsProps { data: MetricTotals; loading?: boolean } // metricas
interface PeriodSelectorProps { value: Period; onChange: (period: Period) => void; disabled?: boolean } // metricas
interface EvolutionChartProps { data: DailyMetric[]; loading?: boolean }
interface DateRangePopoverProps { value: DateRangeValue | null; onChange: (range: DateRangeValue) => void; disabled?: boolean }
export interface DateRangeValue { start: string; end: string }
```

Recharts theming (CRITICAL — confirmed via mock + recharts API docs):
- `<CartesianGrid stroke="var(--ink-4)" strokeOpacity={0.2} strokeDasharray="3 3" />` — replaces `className="stroke-muted"`
- `<XAxis tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }} tickLine={false} axisLine={false} />`
- `<YAxis tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }} tickLine={false} axisLine={false} />`
- `<Area stroke="var(--rubric-2)" fill="url(#colorValueV2)" />` (NEW gradient id to avoid SSR collision with the !v2 path)
- `<linearGradient id="colorValueV2"><stop stopColor="var(--rubric-2)" stopOpacity={0.35}/><stop offset="100%" stopColor="var(--rubric-2)" stopOpacity={0}/></linearGradient>`
- `<Line stroke="var(--rubric-2|--accent-gold|--accent-verdigris)" />` — direct color tokens, NOT hex, NOT className
- `<Tooltip contentStyle={{ backgroundColor: 'var(--paper-0)', border: '1px solid var(--ink-1)', borderRadius: 'var(--radius-3)', fontFamily: 'var(--font-sans)', fontSize: '12px' }} />` — replaces `'hsl(var(--background))'` antipattern
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin analytics MetricCards + AnalyticsView wrapper (KPI editorial gated)</name>
  <files>src/app/(dashboard)/analytics/components/metric-cards.tsx, src/app/(dashboard)/analytics/components/analytics-view.tsx</files>
  <read_first>
    - src/app/(dashboard)/analytics/components/metric-cards.tsx (full 79 LOC — pay attention to the cards array at lines 18-39, loading skeleton at lines 41-57, and the grid render at lines 59-78)
    - src/app/(dashboard)/analytics/components/analytics-view.tsx (full 44 LOC — only `<div className="space-y-6">` wrapper at line 33 needs class swap, NO logic change)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/analytics.html lines 47-57 (`.kpi-strip`, `.kpi`, `.kpi .l`, `.kpi .v`, `.kpi .d`)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md D-DASH-11 (dictionary-table) + D-DASH-15 (loading) + D-DASH-07 (UI-only)
  </read_first>
  <action>
    Modify both files. Goal: when `useDashboardV2()===true`, render KPI cards editorial; when false, render byte-identical al actual shadcn Card grid.

    **Step 1 — `analytics-view.tsx`: minimal class swap on the wrapper div.**

    Add import at top:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    ```

    Inside the component body, before the return, add:
    ```typescript
    const v2 = useDashboardV2()
    ```

    Replace the outer `<div className="space-y-6">` with:
    ```tsx
    <div className={cn('space-y-6', v2 && 'theme-editorial')}>
    ```

    DO NOT change the period selector wrapper, MetricCards, SalesChart, or the `handlePeriodChange` flow. Just the wrapper class.

    **Step 2 — `metric-cards.tsx`: re-skin both loading + render branches gated by v2.**

    Add imports at top (preserve existing imports — Card primitives still used in !v2 branch):
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    ```

    Inside the component, before the `cards` const, add:
    ```typescript
    const v2 = useDashboardV2()
    ```

    For the loading branch (currently lines 41-57), wrap with v2 conditional. The editorial skeleton renders 4 cards with `bg-[var(--paper-2)]` borders + `mx-pulse` animation:
    ```tsx
    if (loading) {
      if (v2) {
        return (
          <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="border-b border-r border-[var(--border)] p-[16px_18px] last:border-r-0 lg:border-b-0"
              >
                <div className="h-[12px] w-24 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
                <div className="mt-2 h-[28px] w-32 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
              </div>
            ))}
          </div>
        )
      }
      // Preserve existing shadcn skeleton — verbatim
      return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )
    }
    ```

    For the render branch (currently lines 59-78), wrap with v2 conditional. Editorial estructura es la `kpi-strip` del mock — un solo container con borders internos en lugar de 4 cards separadas. Esto es lo correcto per analytics.html lines 234-265:
    ```tsx
    if (v2) {
      return (
        <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, idx) => {
            const Icon = card.icon
            return (
              <div
                key={card.title}
                className={cn(
                  'p-[16px_18px] border-b border-r border-[var(--border)]',
                  'last:border-r-0 md:[&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r lg:last:border-r-0',
                  'md:[&:nth-child(3)]:border-b-0 md:[&:nth-child(4)]:border-b-0 lg:border-b-0'
                )}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {card.title}
                </div>
                <div
                  className="mt-2 text-[28px] font-bold leading-none tracking-[-0.01em] text-[var(--ink-1)]"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {card.value}
                </div>
                <div
                  className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  aria-hidden
                >
                  <Icon className="h-[11px] w-[11px]" />
                </div>
              </div>
            )
          })}
        </div>
      )
    }
    // Preserve existing shadcn render — verbatim (lines 59-78 del original)
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
    ```

    **CRITICAL — D-DASH-11 dictionary-table excepciones:** the mock uses a single bordered container with internal border-right separators (NOT 4 separate cards). The Tailwind nth-child selectors handle the responsive border collapse. Numbers MUST use `font-variant-numeric: tabular-nums` (analytics.html line 52) so digits align column-wise. The icon currently shown to the right in shadcn is preserved as a small mono-style indicator at the bottom (mock has a delta indicator `.kpi .d` with arrow + percentage — current code has no delta data, so we render only the icon as a placeholder slot since `OrderMetrics` doesn't include deltas. NO inventar deltas — eso es D-DASH-07 violation).

    **DO NOT MODIFY (D-DASH-07):**
    - `formatCurrency` function logic
    - The `cards` array shape / keys (title, value, icon) — preserve exactly
    - Imports of `Card`, `CardContent`, `CardHeader`, `CardTitle` (still used in !v2 branch)
    - Imports of `ShoppingCart`, `DollarSign`, `TrendingUp`, `Receipt` from lucide
    - `MetricCardsProps` interface
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/analytics-view.tsx && grep -q "border-\[var(--ink-1)\]" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "var(--font-mono)" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "tabular-nums" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "mx-pulse" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && grep -q "theme-editorial" src/app/\(dashboard\)/analytics/components/analytics-view.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && ! grep -q "hsl(var" src/app/\(dashboard\)/analytics/components/metric-cards.tsx && npx tsc --noEmit 2>&1 | grep -E "analytics/components/(metric-cards|analytics-view)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (hook imported and used).
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/analytics-view.tsx` (wrapper class gated).
    - `grep -q "theme-editorial" src/app/\(dashboard\)/analytics/components/analytics-view.tsx` (class added when v2).
    - `grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (kpi-strip outer border).
    - `grep -q "bg-\[var(--paper-0)\]" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (kpi-strip bg).
    - `grep -q "var(--rubric-2)" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (label color).
    - `grep -q "var(--font-display)" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (value font).
    - `grep -q "var(--font-mono)" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (delta font).
    - `grep -q "tabular-nums" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (digit alignment per analytics.html line 52).
    - `grep -q "mx-pulse" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (editorial skeleton animation).
    - File STILL contains: `formatCurrency`, `metrics.totalOrders`, `metrics.totalValue`, `metrics.conversionRate`, `metrics.avgTicket`, `Card`, `CardContent`, `CardHeader`, `CardTitle` (D-DASH-07 — !v2 branch + cards array).
    - File STILL contains: `getOrderMetrics`, `getSalesTrend` import in analytics-view.tsx (no behavior changes).
    - `! grep -q "oklch(" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (no hardcoded oklch — must use vars).
    - `! grep -q "hsl(var" src/app/\(dashboard\)/analytics/components/metric-cards.tsx` (NO hsl(var(--*)) antipattern).
    - `npx tsc --noEmit` reports zero errors in either file.
  </acceptance_criteria>
  <done>Analytics KPI cards render editorial estilo `kpi-strip` (un container, 4 columnas con border interno, numbers serif tabular) cuando flag ON. AnalyticsView wrapper aplica `theme-editorial` class. Cuando flag OFF, render byte-identical al shadcn actual. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin analytics SalesChart (Recharts AreaChart re-themed editorial via props)</name>
  <files>src/app/(dashboard)/analytics/components/sales-chart.tsx</files>
  <read_first>
    - src/app/(dashboard)/analytics/components/sales-chart.tsx (full 115 LOC — pay attention to loading lines 29-40, empty lines 42-53, render lines 55-114, gradient lines 64-69, CartesianGrid line 70, XAxis 71-76, YAxis 77-83, Tooltip 84-100, Area 101-108)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/analytics.html lines 75-97 (`.chart-svg`, `.chart-svg .grid line`, `.chart-svg .axis text`, `.chart-svg .line-r`, `.chart-svg .area-r`) + lines 268-339 (chart section structure)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md D-DASH-13 (charts editorial)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/analytics/components/sales-chart.tsx`. The chart is Recharts `<AreaChart>`. Goal: re-theme via PROPS only — NO migration, NO logic change. Recharts accepts CSS vars in `stroke`, `fill`, and `tick.fill` properties.

    **Step 1 — Add imports + flag:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    // ... inside component body:
    const v2 = useDashboardV2()
    ```

    **Step 2 — Re-skin the loading branch.** Wrap with v2 conditional:
    ```tsx
    if (loading) {
      if (v2) {
        return (
          <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
            <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Tendencia
              </div>
              <h3
                className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Tendencia de Ventas
              </h3>
            </div>
            <div className="p-5">
              <div className="h-[300px] w-full bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
            </div>
          </section>
        )
      }
      // Preserve existing shadcn loading — verbatim
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendencia de Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      )
    }
    ```

    **Step 3 — Re-skin the empty branch.** Wrap with v2 conditional:
    ```tsx
    if (data.length === 0) {
      if (v2) {
        return (
          <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
            <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Tendencia
              </div>
              <h3
                className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Tendencia de Ventas
              </h3>
            </div>
            <div className="flex h-[300px] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="mx-h4">Sin datos en este periodo</p>
              <p className="mx-rule-ornament">· · ·</p>
            </div>
          </section>
        )
      }
      // Preserve existing — verbatim
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendencia de Ventas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[300px]">
            <p className="text-muted-foreground">Sin datos en este periodo</p>
          </CardContent>
        </Card>
      )
    }
    ```

    **Step 4 — Re-skin the main render: BIFURCATE entire return between v2 and !v2.** Two distinct chart configurations — preserve `data` shape, `formatCurrency` logic, `Tooltip content` data access pattern. Only swap container chrome + Recharts visual props:

    ```tsx
    if (v2) {
      return (
        <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Tendencia
            </div>
            <h3
              className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tendencia de Ventas
            </h3>
          </div>
          <div className="p-5">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValueV2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--rubric-2)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--rubric-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--ink-4)"
                    strokeOpacity={0.2}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ink-2)' }}
                  />
                  <YAxis
                    tickFormatter={formatCurrency}
                    tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const item = payload[0].payload as TrendDataPoint
                      return (
                        <div
                          className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] p-3"
                          style={{ borderRadius: 'var(--radius-3)' }}
                        >
                          <p
                            className="font-semibold text-[13px] text-[var(--ink-1)]"
                            style={{ fontFamily: 'var(--font-sans)' }}
                          >
                            {label}
                          </p>
                          <p
                            className="text-[11px] text-[var(--ink-3)] mt-1"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {item.orders} pedidos
                          </p>
                          <p
                            className="text-[12px] font-medium text-[var(--ink-1)] mt-0.5"
                            style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatCurrency(item.value)}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--rubric-2)"
                    fill="url(#colorValueV2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )
    }
    // Preserve existing shadcn render — verbatim (lines 56-113 del original)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia de Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const item = payload[0].payload as TrendDataPoint
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="font-medium">{label}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.orders} pedidos
                        </p>
                        <p className="text-sm font-medium">
                          {formatCurrency(item.value)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorValue)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
    ```

    **CRITICAL — gradient id collision avoidance:** the v2 branch uses `id="colorValueV2"` (NOT `colorValue`) so if both branches ever co-render in dev (impossible but defensive), gradients don't conflict. Recharts gradient ids are document-global SVG defs.

    **CRITICAL — Tooltip cursor:** add `cursor={{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }}` for v2 — this replaces the default solid cursor with an editorial dashed line consistent with the mock annotation style (`.chart-svg .annot-line` in analytics.html line 97).

    **DO NOT MODIFY (D-DASH-07):**
    - `formatCurrency` function (currency formatting per Colombia conventions)
    - `data: TrendDataPoint[]` shape
    - The Tooltip's `payload[0].payload as TrendDataPoint` access pattern
    - Imports of `Card`, `CardContent`, `CardHeader`, `CardTitle` (still used in !v2 branches)
    - Recharts imports (`ResponsiveContainer`, `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`)
    - Type import `TrendDataPoint`
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "var(--ink-4)" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "var(--font-mono)" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "colorValueV2" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "Tendencia de Ventas" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "Sin datos en este periodo" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "mx-rule-ornament" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "AreaChart" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && grep -q "ResponsiveContainer" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/analytics/components/sales-chart.tsx && npx tsc --noEmit 2>&1 | grep "sales-chart" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/sales-chart.tsx`.
    - `grep -q "stroke=\"var(--rubric-2)\"" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (Area stroke editorial).
    - `grep -q "stroke=\"var(--ink-4)\"" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (CartesianGrid stroke).
    - `grep -q "fill: 'var(--ink-3)'" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (XAxis/YAxis tick fill).
    - `grep -q "fontFamily: 'var(--font-mono)'" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (axis ticks mono).
    - `grep -q "var(--font-display)" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (h3 display).
    - `grep -q "colorValueV2" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (gradient id distinct from !v2 branch).
    - `grep -q "Tendencia" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (eyebrow rubric text).
    - `grep -q "mx-rule-ornament" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (empty state ornament).
    - `grep -q "stroke-muted" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (PRESERVED in !v2 branch — verifies !v2 byte-identical).
    - `grep -q "hsl(var(--primary))" src/app/\(dashboard\)/analytics/components/sales-chart.tsx` (PRESERVED in !v2 branch verbatim).
    - File STILL contains: `formatCurrency`, `TrendDataPoint`, `payload[0].payload as TrendDataPoint`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `ResponsiveContainer`, `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip` (D-DASH-07 — chart logic preserved).
    - `! grep -q "oklch(" src/app/\(dashboard\)/analytics/components/sales-chart.tsx`.
    - `npx tsc --noEmit` reports zero errors in sales-chart.tsx.
  </acceptance_criteria>
  <done>SalesChart renders editorial cuando flag ON: container paper-0/ink-1/shadow-stamp + header eyebrow+display title + Recharts AreaChart con axes ink-3 mono 11px + grid ink-4/0.2 + Area stroke rubric-2 con gradient propio + Tooltip editorial. Loading + empty states editorial. Cuando flag OFF, render byte-identical al shadcn actual. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin analytics + metricas PeriodSelector (button group unificado estilo `.period`) + metricas DateRangePopover (trigger editorial + portalContainer)</name>
  <files>src/app/(dashboard)/analytics/components/period-selector.tsx, src/app/(dashboard)/metricas/components/period-selector.tsx, src/app/(dashboard)/metricas/components/date-range-popover.tsx</files>
  <read_first>
    - src/app/(dashboard)/analytics/components/period-selector.tsx (full 41 LOC)
    - src/app/(dashboard)/metricas/components/period-selector.tsx (full 52 LOC — composes DateRangePopover)
    - src/app/(dashboard)/metricas/components/date-range-popover.tsx (full 129 LOC — Popover + Calendar)
    - src/components/ui/popover.tsx (verify if `portalContainer` prop exists from Wave 0 inbox v2 — should already exist since `ui-redesign-conversaciones` Plan 01)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/analytics.html lines 36-39 (`.period`, `.period button`, `.period button.on`)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md D-DASH-09 (additive shadcn extensions) + D-DASH-10 (portal-respectful modals)
  </read_first>
  <action>
    Three files. Each gets a v2 branch. The two `period-selector.tsx` files are nearly identical — apply the same pattern but be careful: `metricas/period-selector.tsx` composes `DateRangePopover` (extra child) and uses a different `presets` array.

    **Step 1 — `analytics/components/period-selector.tsx`:**

    Add imports + flag:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // existing: import { Button } from '@/components/ui/button'
    // existing: import { cn } from '@/lib/utils'
    // ... inside component:
    const v2 = useDashboardV2()
    ```

    Replace the existing return with a v2-gated render:
    ```tsx
    if (v2) {
      return (
        <div
          className="inline-flex border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden"
          style={{ borderRadius: 'var(--radius-3)' }}
          role="group"
          aria-label="Seleccionar periodo"
        >
          {periods.map((period, idx) => {
            const isActive = value === period.value
            return (
              <button
                key={period.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(period.value)}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-semibold border-r border-[var(--ink-1)] last:border-r-0 transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink-1)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isActive
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
                    : 'bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)]'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
                aria-pressed={isActive}
              >
                {period.label}
              </button>
            )
          })}
        </div>
      )
    }
    // Preserve existing — verbatim (lines 21-39)
    return (
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        {periods.map((period) => (
          <Button
            key={period.value}
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(period.value)}
            className={cn(
              'rounded-md',
              value === period.value && 'bg-background shadow-sm'
            )}
          >
            {period.label}
          </Button>
        ))}
      </div>
    )
    ```

    **Step 2 — `metricas/components/period-selector.tsx`:** misma estructura pero with `presets` array (in lugar de `periods`) y composes DateRangePopover. La detección de `isActive` is the same comparison `typeof value === 'string' && value === preset.value`.

    Add imports + flag:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // existing imports preserved
    // ... inside component:
    const v2 = useDashboardV2()
    ```

    Replace return:
    ```tsx
    if (v2) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden"
            style={{ borderRadius: 'var(--radius-3)' }}
            role="group"
            aria-label="Seleccionar periodo"
          >
            {presets.map((preset) => {
              const isActive = typeof value === 'string' && value === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(preset.value)}
                  className={cn(
                    'px-3 py-1.5 text-[12px] font-semibold border-r border-[var(--ink-1)] last:border-r-0 transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink-1)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isActive
                      ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
                      : 'bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)]'
                  )}
                  style={{ fontFamily: 'var(--font-sans)' }}
                  aria-pressed={isActive}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <DateRangePopover
            value={customRange}
            onChange={(range) => onChange(range)}
            disabled={disabled}
          />
        </div>
      )
    }
    // Preserve existing — verbatim (lines 25-50)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {presets.map((preset) => {
            const isActive = typeof value === 'string' && value === preset.value
            return (
              <Button
                key={preset.value}
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(preset.value)}
                className={cn('rounded-md', isActive && 'bg-background shadow-sm')}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
        <DateRangePopover
          value={customRange}
          onChange={(range) => onChange(range)}
          disabled={disabled}
        />
      </div>
    )
    ```

    **Step 3 — `metricas/components/date-range-popover.tsx`:** swap el trigger button cuando v2 + add portal escape para que el popover content quede dentro del wrapper `.theme-editorial` (D-DASH-10).

    Add imports + flag:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // existing imports preserved
    // ... inside component body, BEFORE the return:
    const v2 = useDashboardV2()
    ```

    **3a — Modify the `<PopoverTrigger>` button.** Currently uses `<Button variant={value ? 'default' : 'outline'} size="sm">`. Replace the entire `<Button>` element inside `<PopoverTrigger asChild>` with a v2-gated render:

    ```tsx
    <PopoverTrigger asChild>
      {v2 ? (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-start gap-2 px-3 py-1.5 text-[12px] font-medium transition-colors',
            'border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            value
              ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
              : 'bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)]'
          )}
          style={{ fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-3)' }}
        >
          <CalendarIcon className="h-[14px] w-[14px]" />
          {label}
        </button>
      ) : (
        <Button
          type="button"
          variant={value ? 'default' : 'outline'}
          size="sm"
          disabled={disabled}
          className={cn('rounded-md justify-start text-left font-normal')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      )}
    </PopoverTrigger>
    ```

    **3b — Add `portalContainer` to PopoverContent for v2 (D-DASH-10).** The `PopoverContent` primitive should already accept `portalContainer` from the inbox v2 Plan 01 work (verify via grep on `src/components/ui/popover.tsx`). If `portalContainer` prop EXISTS:

    ```tsx
    <PopoverContent
      className="w-auto p-0"
      align="end"
      portalContainer={v2 && typeof document !== 'undefined' ? (document.querySelector('.theme-editorial') as HTMLElement | null) ?? undefined : undefined}
    >
      {/* ... existing Calendar + apply/cancel buttons ... */}
    </PopoverContent>
    ```

    **If `portalContainer` prop DOES NOT EXIST in popover.tsx (verify with grep first):** add it additively per D-DASH-09. The change is a 4-line additive prop forward — same pattern as ui-redesign-conversaciones Wave 0 Plan 01. ONLY add this if grep confirms absence:

    ```typescript
    // src/components/ui/popover.tsx — additive, BC change
    function PopoverContent({
      className,
      align = "center",
      sideOffset = 4,
      portalContainer,  // NEW
      ...props
    }: React.ComponentProps<typeof PopoverPrimitive.Content> & {
      portalContainer?: HTMLElement | null  // NEW
    }) {
      return (
        <PopoverPrimitive.Portal container={portalContainer ?? undefined}>  {/* NEW container prop */}
          <PopoverPrimitive.Content ... />
        </PopoverPrimitive.Portal>
      )
    }
    ```

    **3c — Apply/Cancel buttons inside popover when v2.** Wrap the existing `<div className="flex justify-end gap-2 p-3 border-t">` block with a v2 conditional. The editorial buttons should match the period-selector pattern (border ink-1 paper-0):

    ```tsx
    <div className={cn(
      'flex justify-end gap-2 p-3',
      v2 ? 'border-t border-[var(--ink-1)]' : 'border-t'
    )}>
      {v2 ? (
        <>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 text-[12px] font-medium text-[var(--ink-2)] hover:text-[var(--ink-1)] transition-colors"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="px-3 py-1.5 text-[12px] font-semibold bg-[var(--ink-1)] text-[var(--paper-0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-3)' }}
          >
            Aplicar
          </button>
        </>
      ) : (
        <>
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleApply} disabled={!canApply}>
            Aplicar
          </Button>
        </>
      )}
    </div>
    ```

    **DO NOT MODIFY (D-DASH-07):**
    - `presets`/`periods` arrays
    - `onChange` callback signature/usage
    - `handleApply`, `handleCancel`, `canApply`, `setDraft`, `setOpen` logic
    - `parseISO`, `format`, `es` locale, `DateRange`, `Calendar` mode/props (`mode="range"`, `numberOfMonths={2}`, `initialFocus`)
    - `DateRangeValue` interface
    - `customRange` derivation in metricas period-selector
    - Imports of `Button`, `Popover`, `PopoverTrigger`, `PopoverContent`, `Calendar`, `CalendarIcon` (used in !v2 branches)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/analytics/components/period-selector.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/metricas/components/period-selector.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/metricas/components/date-range-popover.tsx && grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/analytics/components/period-selector.tsx && grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/analytics/components/period-selector.tsx && grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/metricas/components/period-selector.tsx && grep -q "DateRangePopover" src/app/\(dashboard\)/metricas/components/period-selector.tsx && grep -q "portalContainer" src/app/\(dashboard\)/metricas/components/date-range-popover.tsx && grep -q "var(--font-sans)" src/app/\(dashboard\)/metricas/components/date-range-popover.tsx && grep -q "Aplicar" src/app/\(dashboard\)/metricas/components/date-range-popover.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/analytics/components/period-selector.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/metricas/components/period-selector.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/metricas/components/date-range-popover.tsx && npx tsc --noEmit 2>&1 | grep -E "period-selector|date-range-popover" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - All three files: `grep -q "useDashboardV2" {file}`.
    - Both period-selectors: `grep -q "border border-\[var(--ink-1)\]" {file}` (button group container border).
    - Both period-selectors: `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" {file}` (active state).
    - Both period-selectors: `grep -q "border-r border-\[var(--ink-1)\]" {file}` (separators between buttons).
    - metricas period-selector STILL contains: `DateRangePopover`, `customRange`, `presets` (D-DASH-07).
    - date-range-popover: `grep -q "portalContainer" src/app/\(dashboard\)/metricas/components/date-range-popover.tsx` (D-DASH-10 portal escape).
    - date-range-popover: `grep -q "Aplicar" {file}` AND `grep -q "Cancelar" {file}` (copy preserved both branches).
    - date-range-popover: `grep -q "var(--font-sans)" {file}` (editorial typography on trigger).
    - date-range-popover STILL contains: `parseISO`, `format(.*locale: es)`, `Calendar`, `mode="range"`, `numberOfMonths={2}`, `handleApply`, `handleCancel`, `canApply`, `setDraft`, `setOpen` (D-DASH-07 — interaction logic preserved).
    - All three files: `grep -q "bg-muted" {file}` (PRESERVED in !v2 branch — verifies !v2 byte-identical).
    - All three files: `! grep -q "oklch(" {file}`.
    - `npx tsc --noEmit` reports zero errors in any of the 3 files.
    - If `src/components/ui/popover.tsx` was modified (only if `portalContainer` was missing per Step 3b), verify additive change is BC: `grep -q "portalContainer" src/components/ui/popover.tsx` AND `grep -q "container={portalContainer" src/components/ui/popover.tsx`.
  </acceptance_criteria>
  <done>Period selectors editorial cuando flag ON: button group unido border ink-1 con active ink-1/paper-0. DateRangePopover trigger editorial border ink-1 con icon calendar + label compacto. PopoverContent re-rooted dentro del tema via portalContainer. Apply/Cancel buttons editorial cuando v2. Cuando flag OFF, todos render byte-identical al actual. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin metricas MetricCards + EvolutionChart + MetricasView wrapper (KPI editorial 3-col + Recharts LineChart re-themed con series rubric/gold/verdigris)</name>
  <files>src/app/(dashboard)/metricas/components/metric-cards.tsx, src/app/(dashboard)/metricas/components/evolution-chart.tsx, src/app/(dashboard)/metricas/components/metricas-view.tsx</files>
  <read_first>
    - src/app/(dashboard)/metricas/components/metric-cards.tsx (full 72 LOC — 3 cards: nuevas/reabiertas/agendadas con `description` adicional vs analytics)
    - src/app/(dashboard)/metricas/components/evolution-chart.tsx (full 114 LOC — Recharts LineChart con 3 lineas + Legend, hex colors actuales: #6366f1/#f59e0b/#10b981)
    - src/app/(dashboard)/metricas/components/metricas-view.tsx (full 57 LOC — wrapper similar a analytics-view, pero con useMetricasRealtime — D-DASH-07 NO TOCAR el hook)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/analytics.html lines 47-57 (kpi pattern) + lines 75-97 (chart styling) + lines 80-84 (legend dot colors order)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md D-DASH-13 (charts editorial — series colors order)
  </read_first>
  <action>
    Three files. Same pattern as Tasks 1-2 but adapted to metricas data shapes (3 cards, 3 lineas).

    **Step 1 — `metricas-view.tsx`: minimal class swap.**

    Add imports:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    ```

    Inside component, before return:
    ```typescript
    const v2 = useDashboardV2()
    ```

    Replace `<div className="space-y-6">` with:
    ```tsx
    <div className={cn('space-y-6', v2 && 'theme-editorial')}>
    ```

    DO NOT touch `useMetricasRealtime`, `refresh`, `periodRef`, `handlePeriodChange`, or any state logic.

    **Step 2 — `metric-cards.tsx`: same pattern as Task 1 analytics MetricCards but 3 columns + extra `description` line.**

    Add imports + flag:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    // ... inside component:
    const v2 = useDashboardV2()
    ```

    Loading branch v2:
    ```tsx
    if (loading) {
      if (v2) {
        return (
          <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border-b border-r border-[var(--border)] p-[16px_18px] last:border-r-0 md:border-b-0 md:[&:last-child]:border-r-0"
              >
                <div className="h-[12px] w-24 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
                <div className="mt-2 h-[28px] w-20 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
                <div className="mt-2 h-[10px] w-32 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
              </div>
            ))}
          </div>
        )
      }
      // Preserve existing — verbatim (lines 33-49)
      return ( /* shadcn skeleton existing */ )
    }
    ```

    Render branch v2:
    ```tsx
    if (v2) {
      return (
        <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.title}
                className="p-[16px_18px] border-b border-r border-[var(--border)] last:border-r-0 md:border-b-0 md:[&:last-child]:border-r-0"
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {card.title}
                </div>
                <div
                  className="mt-2 text-[28px] font-bold leading-none tracking-[-0.01em] text-[var(--ink-1)]"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {card.value}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Icon className="h-[11px] w-[11px] text-[var(--ink-3)]" aria-hidden />
                  <p
                    className="text-[11px] text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {card.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )
    }
    // Preserve existing — verbatim (lines 51-71)
    return ( /* shadcn render existing */ )
    ```

    **Step 3 — `evolution-chart.tsx`: re-skin Recharts LineChart con series order rubric-2 → accent-gold → accent-verdigris (D-DASH-13).**

    Add imports:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    ```

    Inside component, before any branch:
    ```typescript
    const v2 = useDashboardV2()
    ```

    Loading branch v2:
    ```tsx
    if (loading) {
      if (v2) {
        return (
          <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
            <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Evolución
              </div>
              <h3
                className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Evolucion por dia
              </h3>
            </div>
            <div className="p-5">
              <div className="h-[320px] w-full bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
            </div>
          </section>
        )
      }
      // Preserve existing — verbatim
      return ( /* shadcn loading existing */ )
    }
    ```

    Empty branch v2:
    ```tsx
    if (!data.length) {
      if (v2) {
        return (
          <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
            <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Evolución
              </div>
              <h3
                className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Evolucion por dia
              </h3>
            </div>
            <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="mx-h4">Sin datos en el periodo seleccionado.</p>
              <p className="mx-rule-ornament">· · ·</p>
            </div>
          </section>
        )
      }
      // Preserve existing — verbatim
      return ( /* shadcn empty existing */ )
    }
    ```

    Main render branch v2:
    ```tsx
    if (v2) {
      return (
        <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Evolución
            </div>
            <h3
              className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Evolucion por dia
            </h3>
          </div>
          <div className="p-5">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    stroke="var(--ink-4)"
                    strokeOpacity={0.2}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ink-2)' }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }}
                    contentStyle={{
                      backgroundColor: 'var(--paper-0)',
                      border: '1px solid var(--ink-1)',
                      borderRadius: 'var(--radius-3)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      boxShadow: '0 1px 0 var(--ink-1)',
                    }}
                    labelStyle={{ color: 'var(--ink-1)', fontWeight: 600 }}
                    itemStyle={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      color: 'var(--ink-2)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="nuevas"
                    name="Nuevas"
                    stroke="var(--rubric-2)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--paper-0)', stroke: 'var(--rubric-2)', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reabiertas"
                    name="Reabiertas"
                    stroke="var(--accent-gold)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--paper-0)', stroke: 'var(--accent-gold)', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="agendadas"
                    name="Agendadas"
                    stroke="var(--accent-verdigris)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--paper-0)', stroke: 'var(--accent-verdigris)', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )
    }
    // Preserve existing — verbatim (lines 50-113 del original incluyendo hex colors #6366f1/#f59e0b/#10b981)
    return ( /* shadcn render existing — keep hex colors verbatim */ )
    ```

    **CRITICAL — series order (D-DASH-13):** the order is `rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2`. Mapping:
    - Nuevas (índice 0) → `var(--rubric-2)` (replaces `#6366f1` indigo)
    - Reabiertas (índice 1) → `var(--accent-gold)` (replaces `#f59e0b` amber — semantically aligned: warning/secondary)
    - Agendadas (índice 2) → `var(--accent-verdigris)` (replaces `#10b981` green — semantically aligned: success)

    **CRITICAL — Tooltip contentStyle:** the existing code uses `'hsl(var(--background))'` which is the antipattern this fase debe eliminar. The v2 branch uses `'var(--paper-0)'` directly — Recharts accepts CSS vars in inline styles via `contentStyle`.

    **DO NOT MODIFY (D-DASH-07):**
    - `data: DailyMetric[]` shape, `dataKey="nuevas"|"reabiertas"|"agendadas"`
    - The `cards` array in metric-cards.tsx (titles, values, descriptions, icons preserved)
    - `data.nuevas`, `data.reabiertas`, `data.agendadas` access patterns
    - Recharts imports
    - Card primitives imports (used in !v2 branches)
    - `useMetricasRealtime` invocation in metricas-view.tsx
    - `refresh`, `periodRef`, `useEffect`, `useTransition`, `useCallback` flow
    - The hex colors `#6366f1`, `#f59e0b`, `#10b981` IN THE !v2 BRANCH (preserve verbatim — they're for backward-compat with flag OFF)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/metricas/components/metric-cards.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/metricas/components/metricas-view.tsx && grep -q "theme-editorial" src/app/\(dashboard\)/metricas/components/metricas-view.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/metricas/components/metric-cards.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/metricas/components/metric-cards.tsx && grep -q "tabular-nums" src/app/\(dashboard\)/metricas/components/metric-cards.tsx && grep -q "stroke=\"var(--rubric-2)\"" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "stroke=\"var(--accent-gold)\"" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "stroke=\"var(--accent-verdigris)\"" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "var(--ink-4)" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "Sin datos en el periodo seleccionado" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && grep -q "useMetricasRealtime" src/app/\(dashboard\)/metricas/components/metricas-view.tsx && grep -q "#6366f1" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/metricas/components/metric-cards.tsx && ! grep -q "oklch(" src/app/\(dashboard\)/metricas/components/evolution-chart.tsx && npx tsc --noEmit 2>&1 | grep -E "metricas/components/(metric-cards|evolution-chart|metricas-view)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - All three files: `grep -q "useDashboardV2" {file}`.
    - metricas-view: `grep -q "theme-editorial" src/app/\(dashboard\)/metricas/components/metricas-view.tsx`.
    - metricas-view STILL contains: `useMetricasRealtime`, `refresh`, `periodRef`, `handlePeriodChange`, `getConversationMetrics`, `useTransition`, `useCallback`, `useEffect`, `useRef` (D-DASH-07 — realtime + state preserved).
    - metric-cards: `grep -q "border border-\[var(--ink-1)\]" {file}` AND `grep -q "var(--rubric-2)" {file}` AND `grep -q "var(--font-display)" {file}` AND `grep -q "tabular-nums" {file}` AND `grep -q "mx-pulse" {file}`.
    - metric-cards STILL contains: `MessageSquarePlus`, `RefreshCcw`, `CalendarCheck`, `data.nuevas`, `data.reabiertas`, `data.agendadas`, `card.description`, `Card`, `CardContent`, `CardHeader`, `CardTitle` (D-DASH-07).
    - evolution-chart: `grep -q "stroke=\"var(--rubric-2)\"" {file}` (Nuevas series).
    - evolution-chart: `grep -q "stroke=\"var(--accent-gold)\"" {file}` (Reabiertas series — D-DASH-13 series order).
    - evolution-chart: `grep -q "stroke=\"var(--accent-verdigris)\"" {file}` (Agendadas series — D-DASH-13 series order).
    - evolution-chart: `grep -q "var(--ink-4)" {file}` (CartesianGrid).
    - evolution-chart: `grep -q "var(--paper-0)" {file}` (Tooltip backgroundColor — replaces hsl antipattern in v2 branch).
    - evolution-chart: `grep -q "Sin datos en el periodo seleccionado" {file}` AND `grep -q "mx-rule-ornament" {file}` (empty state editorial).
    - evolution-chart STILL contains: `#6366f1`, `#f59e0b`, `#10b981` (PRESERVED in !v2 branch verbatim — flag OFF byte-identical).
    - evolution-chart STILL contains: `LineChart`, `Line`, `Legend`, `Tooltip`, `CartesianGrid`, `XAxis`, `YAxis`, `ResponsiveContainer`, `dataKey="nuevas"`, `dataKey="reabiertas"`, `dataKey="agendadas"` (D-DASH-07).
    - All three files: `! grep -q "oklch(" {file}`.
    - `npx tsc --noEmit` reports zero errors in any of the 3 files.
  </acceptance_criteria>
  <done>Metricas KPI cards (3-col) editorial cuando flag ON con label smallcaps rubric-2 + value display serif tabular + descripcion mono ink-3. EvolutionChart re-themed con axes/grid editorial + 3 series en order rubric-2/accent-gold/accent-verdigris reemplazando hex hardcodeados solo en v2 branch + tooltip paper-0/ink-1 reemplazando antipattern `hsl(var(--background))` solo en v2. MetricasView wrapper aplica `theme-editorial` class. useMetricasRealtime + refresh intactos. Cuando flag OFF, todo render byte-identical. Build clean.</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. **Build clean:** `npx tsc --noEmit 2>&1 | grep -E "(analytics|metricas)/components" | (! grep -E "error|Error")` returns 0.

2. **No-touch guard (D-DASH-07 — UI-ONLY):** verify NO changes to:
   ```bash
   git diff --name-only ${BASE_COMMIT}..HEAD | grep -E "(actions/(analytics|metricas-conversaciones)|lib/(analytics|metricas-conversaciones)|hooks/use-metricas-realtime|metricas/page.tsx|analytics/page.tsx|metricas/settings)"
   ```
   MUST return empty (zero matches).

3. **Antipattern guard:** zero new `hsl(var(--*))` in v2 branches:
   ```bash
   for f in src/app/\(dashboard\)/{analytics,metricas}/components/*.tsx; do
     # Existing hsl in !v2 branches is OK (preserved verbatim); but the v2 branch must use var() directly
     # Quick proxy: count v2-prefixed sections via "useDashboardV2" presence + "if (v2)" pattern
     grep -c "if (v2)" "$f" || true
   done
   # Manual: read each "if (v2)" block and confirm zero hsl(var(...)) in those blocks.
   ```

4. **Manual smoke (with flag enabled in dev DB on test workspace):**
   - `/analytics` page renders:
     - KPI strip con 4 columnas border interno + numbers serif grandes tabular-nums
     - Period selector unificado: 4 buttons unidos border ink-1, "7 dias" active = ink-1 bg + paper-0 text
     - SalesChart container paper-0 + border ink-1 + shadow-stamp
     - Header eyebrow "Tendencia" rubric-2 + h3 display "Tendencia de Ventas"
     - Chart axes ink-3 mono 11px + grid ink-4/0.2 + Area stroke rubric-2 con gradient propio
     - Hover sobre la area: tooltip paper-0 + border ink-1 + radius-3 + sans 12px
   - `/metricas` page renders:
     - 3 KPI cards editorial (Nuevas / Reabiertas / Agendadas)
     - Period selector + DateRangePopover trigger editorial border ink-1
     - Click on date range trigger: popover content rendered DENTRO del wrapper `.theme-editorial` (NOT escaped to body — visible via DevTools inspect: portal container = `[class*="theme-editorial"]`)
     - EvolutionChart con 3 lineas: Nuevas rubric-2 (rojo) / Reabiertas accent-gold (oro) / Agendadas accent-verdigris (verde-azul)
     - Legend sans 11px ink-2

5. **With flag OFF (Somnio + cualquier workspace sin `ui_dashboard_v2.enabled`):** visual diff vs current main shows ZERO change. KPI cards, charts, period selectors render IDÉNTICOS to current shadcn.

6. **Realtime preservation:** trigger un mensaje nuevo / reabierta / valoración en el workspace; verificar que `useMetricasRealtime` dispara `refresh()` y los KPI cards se actualizan. La actualización ocurre en AMBOS estados de flag (OFF y ON).

7. **Period change preservation:** hacer click en cada period preset (Hoy / 7 dias / 30 dias / Este mes / etc.); verificar que `getOrderMetrics(period)` y `getSalesTrend(period)` se llaman y los datos se re-renderean. Comportamiento idéntico en ambos estados de flag.

8. **DateRangePopover preservation:** abrir popover, seleccionar un rango, click "Aplicar" — verificar que `handleApply` dispara `onChange({ start, end })` y `getConversationMetrics({start, end})` se llama con el rango seleccionado.
</verification>

<success_criteria>
- All 4 tasks pass automated verify (grep + tsc).
- Build is clean: `npx tsc --noEmit` zero errors en los 9 archivos.
- Con flag ON, los dos modulos analytics + metricas matchean los patterns del mock `analytics.html`: kpi-strip pattern + chart container editorial + axes/grid/series tokens (rubric-2 → accent-gold → accent-verdigris) + period selector estilo `.period` + date-range trigger editorial + portal-respectful popover.
- Con flag OFF, render byte-identical al actual (verificable via cookie override + git diff).
- Cero cambios funcionales: D-DASH-07 verificable via `git diff --name-only` excluyendo cambios fuera de los 9 archivos in-scope.
- D-DASH-13 series order respetada: `rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2` (los 3 primeros usados en EvolutionChart).
- D-DASH-10 popover portal-respectful via `portalContainer` prop.
- D-DASH-15 status/badges no aplican en este plan (no hay status indicators en analytics/metricas).
- Antipattern `hsl(var(--*))` eliminado de los v2 branches; preservado verbatim en !v2 branches para BC.
- All Recharts components re-themed via PROPS only — chart logic + Recharts imports + data shape intactos (NO migration).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/07-SUMMARY.md` with:
- Commits (one per task: T1 analytics-cards+view / T2 sales-chart / T3 period-selectors+date-range / T4 metricas-cards+chart+view)
- Pixel-diff vs `analytics.html` mock (link to screenshots if produced for KPI strip + main chart + period selector)
- Confirmation D-DASH-07 (UI-only): output of `git diff --name-only ${BASE_COMMIT}..HEAD` showing ONLY 9 files (or 10 if `popover.tsx` was extended additively per D-DASH-09)
- Confirmation D-DASH-13: list of series → token mapping applied in EvolutionChart (Nuevas → rubric-2, Reabiertas → accent-gold, Agendadas → accent-verdigris)
- Confirmation D-DASH-10: `portalContainer` wired in DateRangePopover; verify via DevTools that popover content renders inside `.theme-editorial` wrapper
- Note any deviations: e.g., if `OrderMetrics` had no `delta` field, the kpi `.d` slot was rendered as icon-only placeholder (NOT inventar deltas — deuda known)
- Note any shadcn primitive extensions: if `popover.tsx` got `portalContainer` added (verify it was not already there from inbox v2 Plan 01)
- Handoff to Plan 08 (Configuración) + Plan 09 (close-out)
</output>
