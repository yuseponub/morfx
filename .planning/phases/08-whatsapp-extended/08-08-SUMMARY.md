---
phase: 08-whatsapp-extended
plan: 08
subsystem: usage-tracking
tags: [webhook, cost-tracking, recharts, dashboard, usage]

dependency-graph:
  requires: ["08-01", "08-02"]
  provides: ["usage-dashboard", "cost-recording"]
  affects: ["billing", "super-admin"]

tech-stack:
  added: ["recharts@3.7.0"]
  patterns: ["webhook-cost-extraction", "area-chart", "donut-chart"]

file-tracking:
  key-files:
    created:
      - src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
      - src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx
      - src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx
      - src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-chart.tsx
      - src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx
    modified:
      - src/lib/whatsapp/webhook-handler.ts
      - package.json

decisions:
  - id: cost-on-sent-only
    choice: "Record cost only on 'sent' status"
    reason: "Avoids duplicates from delivered/read webhooks that also include pricing"
  - id: country-code-mapping
    choice: "Map phone country codes to ISO codes for rate lookup"
    reason: "Cost rates vary by recipient country (CO, US, MX, etc.)"
  - id: recharts-for-charts
    choice: "Use recharts library for charts"
    reason: "Well-maintained, React-compatible, supports area and pie charts"
  - id: hardcoded-colors
    choice: "Hardcoded category colors instead of CSS variables for pie chart"
    reason: "Recharts doesn't support CSS variables in Cell fill prop"

metrics:
  duration: "~12 minutes"
  completed: "2026-01-31"
---

# Phase 8 Plan 08: Usage Tracking Dashboard Summary

**One-liner:** Webhook cost recording with recharts-powered usage dashboard showing daily trends and category breakdown.

## What Was Built

### 1. Webhook Cost Recording Integration
Extended `processStatusUpdate` in webhook handler to:
- Accept workspaceId parameter for cost association
- Extract billable messages from 360dialog pricing field
- Map recipient phone country codes to ISO codes (CO, US, MX, etc.)
- Call `recordMessageCost` server action on 'sent' status only

### 2. Usage Dashboard Page
Created `/configuracion/whatsapp/costos` with:
- Period selector (today, 7 days, 30 days, this month)
- Three summary cards (total messages, total cost, limit status)
- Limit progress bar with color indicators
- Loading state with spinner

### 3. Usage Charts
Added two Recharts-powered visualizations:
- **UsageChart**: Area chart showing daily message count trend
- **CategoryBreakdown**: Donut chart with legend and cost breakdown table

## Key Technical Decisions

1. **Cost Recording on 'sent' Only**: To prevent duplicate cost entries, we only record when status is 'sent' (not on subsequent delivered/read webhooks)

2. **Country Code Extraction**: Parse phone number to extract country code for rate lookup. Maps to ISO codes: 57->CO, 1->US, 52->MX, etc.

3. **Hardcoded Chart Colors**: Recharts Cell components don't support CSS variables, so we use hardcoded hex colors for the pie chart

## Files Changed

| File | Change |
|------|--------|
| `src/lib/whatsapp/webhook-handler.ts` | Added cost recording on billable sent status |
| `src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx` | Main dashboard page |
| `.../components/period-selector.tsx` | Period toggle buttons |
| `.../components/usage-summary.tsx` | Three summary cards |
| `.../components/usage-chart.tsx` | Daily area chart |
| `.../components/category-breakdown.tsx` | Category donut chart |
| `package.json` | Added recharts@3.7.0 |

## Commits

1. `c02b2e7`: feat(08-08): integrate cost recording in webhook handler
2. `845ccb7`: feat(08-08): create usage dashboard page and summary cards
3. `7249889`: feat(08-08): add usage charts with recharts
4. `e961b67`: chore(08-08): add recharts dependency for usage charts

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] Webhook handler records cost on billable sent status
- [x] Cost recording uses upsert to prevent duplicates (via usage.ts)
- [x] Usage dashboard loads summary data
- [x] Period selector changes date range
- [x] Summary cards show total messages, costs, and limit
- [x] Area chart shows daily trend
- [x] Pie chart shows category breakdown
- [x] Costs displayed in USD with proper formatting

## Next Phase Readiness

Plan 08-08 complete. The usage tracking infrastructure is now in place:
- Webhook records costs automatically
- Dashboard shows usage metrics
- Ready for Super Admin panel integration

No blockers for subsequent plans.
