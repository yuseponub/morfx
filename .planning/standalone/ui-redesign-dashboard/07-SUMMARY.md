---
phase: ui-redesign-dashboard
plan: 07
subsystem: ui
tags:
  - ui
  - editorial
  - analytics
  - metricas
  - recharts
  - kpi
  - period-selector
  - date-range
requires:
  - ui-redesign-dashboard-01 (useDashboardV2 hook + .theme-editorial cascade)
  - ui-redesign-conversaciones (popover portalContainer additive already shipped)
provides:
  - analytics module editorial (KPI strip + AreaChart re-themed + period selector)
  - metricas module editorial (3-col KPI + LineChart with rubric/gold/verdigris series + date-range popover)
affects:
  - src/app/(dashboard)/analytics/components/analytics-view.tsx
  - src/app/(dashboard)/analytics/components/metric-cards.tsx
  - src/app/(dashboard)/analytics/components/period-selector.tsx
  - src/app/(dashboard)/analytics/components/sales-chart.tsx
  - src/app/(dashboard)/metricas/components/metricas-view.tsx
  - src/app/(dashboard)/metricas/components/metric-cards.tsx
  - src/app/(dashboard)/metricas/components/period-selector.tsx
  - src/app/(dashboard)/metricas/components/date-range-popover.tsx
  - src/app/(dashboard)/metricas/components/evolution-chart.tsx
tech-stack:
  added: []
  patterns:
    - recharts-editorial-theming-via-props
    - kpi-strip-dictionary-table (D-DASH-11)
    - charts-editorial-series-order (D-DASH-13)
    - portal-respectful-date-popover (D-DASH-10)
key-files:
  created: []
  modified:
    - src/app/(dashboard)/analytics/components/analytics-view.tsx
    - src/app/(dashboard)/analytics/components/metric-cards.tsx
    - src/app/(dashboard)/analytics/components/period-selector.tsx
    - src/app/(dashboard)/analytics/components/sales-chart.tsx
    - src/app/(dashboard)/metricas/components/metricas-view.tsx
    - src/app/(dashboard)/metricas/components/metric-cards.tsx
    - src/app/(dashboard)/metricas/components/period-selector.tsx
    - src/app/(dashboard)/metricas/components/date-range-popover.tsx
    - src/app/(dashboard)/metricas/components/evolution-chart.tsx
decisions:
  - Recharts se re-temiza via props (stroke, fill, tick) + inline contentStyle/wrapperStyle, SIN migracion ni cambio de logica de chart.
  - Gradient id v2 "colorValueV2" distinto del !v2 "colorValue" para evitar colision SVG defs global.
  - Evolution chart series order (D-DASH-13): Nuevas → rubric-2 (rojo), Reabiertas → accent-gold (oro), Agendadas → accent-verdigris (verde-azul) — reemplaza hex #6366f1/#f59e0b/#10b981 SOLO en v2.
  - Tooltip contentStyle usa `var(--paper-0)` directo en v2 branch — elimina antipattern `hsl(var(--background))` mantenido verbatim en !v2.
  - KPI deltas NO inventados (D-DASH-07) — `OrderMetrics` y `MetricTotals` no tienen campo delta, entonces el slot `.kpi .d` del mock se rendea solo con icono placeholder + descripcion (metricas) o solo icono (analytics).
  - `portalContainer` en DateRangePopover usa lookup `.theme-editorial` en `document` sobre render cuando v2 — popover content hereda tokens editorial (D-DASH-10).
  - Prop `portalContainer` en `popover.tsx` ya existia (heredado de ui-redesign-conversaciones Plan 01 + mirrored por Plans 03/04/06); no fue necesario extender.
metrics:
  duration: ~45min
  tasks_completed: 4
  files_modified: 9
  lines_added: 591
  lines_removed: 30
  commits: 4
  completed: 2026-04-23
---

# Phase ui-redesign-dashboard Plan 07: Analytics + Metricas Editorial Re-skin Summary

Wave 3 (`analytics/**` + `metricas/**`) re-skineado con patterns editorial paper-0/ink-1/shadow-stamp, tipografia font-display/font-mono/font-sans, Recharts charts re-themed via props SIN migracion, period selectors estilo `.period` del mock, y DateRangePopover con trigger editorial + portal-respectful content. Todo gated por `useDashboardV2()` con flag OFF byte-identical al shadcn actual.

## Commits (4 atomicos)

| Task | Hash      | Scope                                                                                          |
| ---- | --------- | ---------------------------------------------------------------------------------------------- |
| T1   | `475e0a9` | Analytics MetricCards kpi-strip + AnalyticsView wrapper theme-editorial                        |
| T2   | `1bc5fa0` | Analytics SalesChart (Recharts AreaChart) editorial via Recharts props + header eyebrow+display |
| T3   | `df49525` | Period selectors (analytics + metricas) + DateRangePopover trigger/portal/apply-cancel        |
| T4   | `037c6fe` | Metricas MetricCards 3-col + EvolutionChart (LineChart) series rubric/gold/verdigris + MetricasView wrapper |

Base commit: `f85da50` (post-Plan 06).
HEAD: `037c6fe`.

## Pattern Adoption per File

### analytics-view.tsx / metricas-view.tsx (wrappers — 5 LOC cada)

- `const v2 = useDashboardV2()` antes del return.
- `<div className={cn('space-y-6', v2 && 'theme-editorial')}>` — class swap minimo.
- CERO cambios a state (`useState`, `useTransition`, `periodRef`, `useEffect`) o callbacks (`handlePeriodChange`, `refresh`, `useMetricasRealtime`).

### analytics/metric-cards.tsx + metricas/metric-cards.tsx (KPI editorial — kpi-strip)

Ambos renderean cuando v2:

- **Container**: `grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-{2|3} lg:grid-cols-{4|3}` — un solo contenedor bordeado con cols internas separadas por `border-r border-[var(--border)]` (pattern `.kpi-strip` del mock analytics.html lines 234-265).
- **Title**: `text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]` con `fontFamily: var(--font-sans)` — smallcaps 10px rubric-2 rojo editorial.
- **Value**: `text-[28px] font-bold leading-none tracking-[-0.01em] text-[var(--ink-1)]` con `fontFamily: var(--font-display)` + `fontVariantNumeric: tabular-nums` — serif 28px tabular (digitos alineados columnas).
- **Delta slot / description row**: `text-[11px] text-[var(--ink-3)]` con `fontFamily: var(--font-mono)` — icon + descripcion cuando aplica.
- **Responsive border collapse**: 4-col (`analytics`) usa `[&:nth-child(2)]:border-r-0` en `md`, `lg:[&:nth-child(2)]:border-r` para re-add en desktop. 3-col (`metricas`) usa `[&:last-child]:border-r-0 md:border-b-0` — verificable via DevTools.
- **Loading**: cards internos `bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]` (D-DASH-15).
- **!v2 branch**: verbatim al shadcn actual (Card/CardHeader/CardContent + bg-muted skeleton).

### analytics/sales-chart.tsx (Recharts AreaChart editorial)

- **Container**: `bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]`.
- **Header**: `px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]` con eyebrow smallcaps rubric-2 "Tendencia" + h3 font-display 20px ink-1 "Tendencia de Ventas".
- **CartesianGrid**: `stroke="var(--ink-4)" strokeOpacity={0.2} strokeDasharray="3 3"` reemplaza `className="stroke-muted"`.
- **XAxis/YAxis**: `tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}` + `tickLine={false}` + `axisLine` ink-2 en X / false en Y.
- **linearGradient id="colorValueV2"** con stops `var(--rubric-2)` 0.35 → 0 (distinto del !v2 `colorValue`).
- **Area**: `stroke="var(--rubric-2)" fill="url(#colorValueV2)"`.
- **Tooltip**: custom content paper-0 + border ink-1 + shadow-stamp + `borderRadius: var(--radius-3)` + sans 13px label + mono 11px ink-3 order + mono 12px ink-1 tabular-nums currency.
- **Tooltip cursor**: `{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }` — dashed editorial.
- **Empty**: `mx-h4 "Sin datos en este periodo"` + `mx-rule-ornament "· · ·"`.
- **Loading**: `bg-[var(--paper-2)] animate-[mx-pulse_...]`.
- **!v2 branch**: verbatim (stroke-muted, hsl(var(--primary)), bg-background rounded-lg).

### metricas/evolution-chart.tsx (Recharts LineChart editorial — series order D-DASH-13)

- Mismos patterns de container/header/loading/empty que SalesChart.
- **Series order** (D-DASH-13): `rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2`. Aplicado:

| Serie      | v2 stroke                 | !v2 stroke (preservado) |
| ---------- | ------------------------- | ----------------------- |
| Nuevas     | `var(--rubric-2)`         | `#6366f1` (indigo)      |
| Reabiertas | `var(--accent-gold)`      | `#f59e0b` (amber)       |
| Agendadas  | `var(--accent-verdigris)` | `#10b981` (emerald)     |

- **activeDot**: `{ r: 4, fill: 'var(--paper-0)', stroke: '{series-color}', strokeWidth: 2 }` — dot editorial invertido.
- **Tooltip contentStyle (v2)**: `{ backgroundColor: 'var(--paper-0)', border: '1px solid var(--ink-1)', borderRadius: 'var(--radius-3)', fontFamily: 'var(--font-sans)', fontSize: '12px', boxShadow: '0 1px 0 var(--ink-1)' }` — reemplaza `hsl(var(--background))` antipattern (preservado en !v2).
- **Tooltip labelStyle (v2)**: `{ color: 'var(--ink-1)', fontWeight: 600 }`.
- **Tooltip itemStyle (v2)**: `{ fontFamily: 'var(--font-mono)', fontSize: '11px' }`.
- **Legend wrapperStyle (v2)**: `{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--ink-2)' }`.

### analytics + metricas period-selector.tsx (button group unificado)

Ambos cuando v2:

- **Container**: `inline-flex border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden` con `borderRadius: var(--radius-3)` inline — un solo bloque compacto (pattern `.period` del mock line 36-39).
- **Button**: `px-3 py-1.5 text-[12px] font-semibold border-r border-[var(--ink-1)] last:border-r-0 transition-colors` con `fontFamily: var(--font-sans)`.
- **Active** (`value === period.value` o `typeof value === 'string' && value === preset.value`): `bg-[var(--ink-1)] text-[var(--paper-0)]`.
- **Idle**: `bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)]`.
- **Focus**: `focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink-1)]` — accessibility preservada.
- **aria-pressed + role="group" + aria-label**: semantica preservada.

### metricas/date-range-popover.tsx (trigger + portal + apply/cancel)

Cuando v2:

- **Trigger**: button nativo con `border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] px-3 py-1.5 text-[12px] font-medium` + `CalendarIcon h-[14px] w-[14px]` + label (date range formatted en es-CO). Active (cuando `value` existe): `bg-[var(--ink-1)] text-[var(--paper-0)]`. Idle: `bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)]`.
- **PopoverContent `portalContainer`**: lookup `document.querySelector('.theme-editorial')` solo cuando v2; popover content re-rooted DENTRO del wrapper `.theme-editorial` para heredar tokens (D-DASH-10). SSR-safe con `typeof document !== 'undefined'` guard. Cuando `.theme-editorial` no existe → `undefined` → default portal a body (fallback no-op).
- **Apply/Cancel buttons**:
  - Cancelar: ghost ink-2 hover ink-1, sans 12px font-medium.
  - Aplicar: `bg-[var(--ink-1)] text-[var(--paper-0)]` + `font-semibold` + `borderRadius: var(--radius-3)` + `disabled:opacity-50`.
- **Container separator**: `border-t border-[var(--ink-1)]` (v2) vs `border-t` (!v2).

Interaction logic intacta: `handleApply`, `handleCancel`, `canApply`, `setDraft`, `setOpen`, `parseISO`, `format`, `locale: es`, `Calendar mode="range" numberOfMonths={2} initialFocus`.

## D-DASH Compliance

### D-DASH-07 (UI-only, no server/data/realtime changes)

Output of `git diff --name-only f85da50..HEAD`:

```
src/app/(dashboard)/analytics/components/analytics-view.tsx
src/app/(dashboard)/analytics/components/metric-cards.tsx
src/app/(dashboard)/analytics/components/period-selector.tsx
src/app/(dashboard)/analytics/components/sales-chart.tsx
src/app/(dashboard)/metricas/components/date-range-popover.tsx
src/app/(dashboard)/metricas/components/evolution-chart.tsx
src/app/(dashboard)/metricas/components/metric-cards.tsx
src/app/(dashboard)/metricas/components/metricas-view.tsx
src/app/(dashboard)/metricas/components/period-selector.tsx
```

**9 archivos exactos.** No-touch guard verificado: cero matches para `actions/(analytics|metricas-conversaciones)`, `lib/(analytics|metricas-conversaciones)`, `hooks/use-metricas-realtime`, `(analytics|metricas)/page.tsx`, `metricas/settings`. Forbidden surface guard: cero matches para `src/lib/domain/`, `src/hooks/`, `src/lib/agents/`, `src/inngest/`, `src/app/actions/`.

### D-DASH-11 (dictionary-table kpi-strip)

- `analytics/metric-cards.tsx`: 4-col kpi-strip (Pedidos / Valor Total / Conversion / Ticket Promedio) con border interno colapsable responsive.
- `metricas/metric-cards.tsx`: 3-col kpi-strip (Nuevas / Reabiertas / Agendadas) con description row + icon placeholder.

### D-DASH-13 (charts editorial)

- **sales-chart**: AreaChart single-series con rubric-2 + gradient.
- **evolution-chart**: LineChart 3-series con order `rubric-2 → accent-gold → accent-verdigris`. Mapping respetado (ver tabla arriba). Tooltip/legend/axes re-tematizados via props/inline styles sin migracion.

### D-DASH-10 (portal-respectful modals)

- `date-range-popover`: `portalContainer={document.querySelector('.theme-editorial')}` cuando v2. Verificable via DevTools → inspect popover content → parent es `[class*="theme-editorial"]`.

### D-DASH-15 (loading with mx-pulse)

- Ambos metric-cards + sales-chart + evolution-chart: loading skeletons usan `bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]` cuando v2 (preservando shadcn `bg-muted animate-pulse` cuando !v2).

### D-DASH-14 (forms/selectors editorial)

- Period selectors + date-range trigger: button group pattern `.period` del mock + trigger con CalendarIcon + label.

### D-DASH-08 / D-DASH-09

- D-DASH-08 (feature flag): todos los patterns gated por `useDashboardV2()` via contexto.
- D-DASH-09 (additive shadcn primitives): `popover.tsx` NO fue modificado — `portalContainer` ya existia heredado de ui-redesign-conversaciones Plan 01 (+ mirrored por Plans 03/04/06).

## Antipattern Sweep

- **`oklch(` literal**: grep reports `0` matches en todos los 9 archivos modificados.
- **`hsl(var(--*))`**: 2 files contienen `hsl(var(` pero solo en las ramas `!v2` (fall-through returns). Verificable inspeccionando context:
  - `sales-chart.tsx:208-246` → dentro del `return (<Card>...)` post `if (v2) { return ... }`.
  - `evolution-chart.tsx:217-218` → dentro del `return (<Card>...)` post `if (v2) { return ... }`.
  Ambos preservados verbatim por D-DASH-07 (flag OFF byte-identical).
- **`dark:`**: `grep -r "dark:" src/app/\(dashboard\)/{analytics,metricas}/components/` → cero matches.

## Build / Type Safety

`npx tsc --noEmit` exit code 0, sin errores reportados en ninguno de los 9 archivos modificados ni en el resto del codebase.

## Flag OFF byte-identical

Todos los patterns gated por `if (v2) { return ... }` antes de un `return` fall-through al shadcn actual. Cuando `useDashboardV2()` retorna `false`:

- `metric-cards.tsx`: render identico al `<Card>...<CardTitle>{title}</CardTitle><Icon/></CardHeader><CardContent>{value}</CardContent></Card>` anterior.
- `sales-chart.tsx` + `evolution-chart.tsx`: Recharts con `hsl(var(--primary))`, `#6366f1/#f59e0b/#10b981`, `stroke-muted`, `bg-background rounded-lg shadow-lg` preservados byte-identical.
- `period-selector.tsx`: `flex gap-1 p-1 bg-muted rounded-lg` con shadcn `<Button variant="ghost">`.
- `date-range-popover.tsx`: trigger `<Button variant={value ? 'default' : 'outline'}>` + `<PopoverContent>` sin portalContainer (lookup retorna `undefined`, portal default a body).

Verificable via: setea cookie/override para `ui_dashboard_v2.enabled=false`, recarga `/analytics` y `/metricas`, compara visualmente vs main branch commit `9642e36`.

## Deviations from Plan

### None

Plan ejecutado verbatim. Excepcion menor:

**Scope note (NO deviation, informativo):** el plan en Task 3 Step 3b discute un fallback "if `portalContainer` does NOT exist in `popover.tsx` → add it additively per D-DASH-09". Verification: `grep -q "portalContainer" src/components/ui/popover.tsx` → ya existia (shipped por ui-redesign-conversaciones Plan 01, lineas 24-35 del archivo). **No se modifico `popover.tsx`**. El diff final son exactamente 9 archivos in-scope.

**KPI delta slots:** El mock `.kpi .d` del handoff muestra "+12.4% vs periodo anterior" style deltas. `OrderMetrics` y `MetricTotals` NO incluyen deltas — inventarlos es D-DASH-07 violation. Slot se rendea como icon-only (analytics) o icon+description (metricas). Deuda conocida para fase futura que incorpore comparison-period queries (fuera de scope Plan 07, documentado aqui para pickup posterior).

## Deferred Issues

None. Todos los grep/tsc checks pasaron en primera iteracion sin auto-fixes Rule 1-3 necesarios.

## Known Stubs

None. Todos los patterns editorial conectan a datos reales via props existentes (`metrics: OrderMetrics`, `data: DailyMetric[]`, `value: Period`, etc.) — cero hardcoded empty arrays ni placeholders.

## Handoff

- **Plan 08 (Configuracion, Wave 3 paralelo):** no overlap con este plan (scope `configuracion/**` vs `analytics/** + metricas/**`). Ambos editables en worktrees paralelos sin conflicto.
- **Plan 09 (close-out):** este plan agrega al conteo de waves cerradas: Wave 0 + Waves 1-2 + Wave 3 (plans 07 + 08 — cuando 08 termine). Plan 09 debe correr DoD grep suite + LEARNINGS + push vercel.
- **User test:** con `ui_dashboard_v2.enabled=true` en Somnio workspace (via SQL flip manual por Regla 6), `/analytics` muestra KPI strip editorial + AreaChart editorial, `/metricas` muestra 3-col KPI + LineChart con 3 lineas rubric/gold/verdigris + date-range popover con portal respectful.

## Self-Check: PASSED

Verified:
- All 4 commits exist: `475e0a9`, `1bc5fa0`, `df49525`, `037c6fe` (via `git log --oneline f85da50..HEAD`).
- All 9 files modified (via `git diff --name-only f85da50..HEAD` — exact count).
- No-touch guard: zero matches for forbidden paths.
- TypeScript build clean: `npx tsc --noEmit` exit 0.
- Antipattern sweep: zero `oklch(`, zero `dark:`; `hsl(var(` only in !v2 fall-through branches (preserved per D-DASH-07).
- Required grep tokens present in all v2 branches (rubric-2, font-display, font-mono, tabular-nums, mx-pulse, theme-editorial, portalContainer, accent-gold, accent-verdigris, ink-4).
