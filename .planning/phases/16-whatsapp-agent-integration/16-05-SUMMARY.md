---
phase: 16-whatsapp-agent-integration
plan: 05
subsystem: agent-dashboard
tags: [metrics, dashboard, config, agentes-module, shadcn-cards]
dependency-graph:
  requires: ["16-01", "16-04"]
  provides: ["agentes-module", "agent-metrics", "agent-config-page"]
  affects: ["16-06"]
tech-stack:
  added: []
  patterns: ["server-component-with-client-hydration", "period-selector-pattern", "metric-card-groups"]
key-files:
  created:
    - src/lib/agents/production/metrics.ts
    - src/app/actions/agent-metrics.ts
    - src/app/(dashboard)/agentes/layout.tsx
    - src/app/(dashboard)/agentes/page.tsx
    - src/app/(dashboard)/agentes/config/page.tsx
    - src/app/(dashboard)/agentes/components/metrics-dashboard.tsx
    - src/app/(dashboard)/agentes/components/config-panel.tsx
  modified: []
decisions:
  - id: "16-05-01"
    decision: "Blended token cost rate at $3/1M"
    reason: "Approximate mix of Haiku ($1/1M) and Sonnet ($15/1M) weighted ~80/20"
  - id: "16-05-02"
    decision: "avgResponseTimeMs returns 0 for MVP"
    reason: "Response time tracking requires additional instrumentation deferred post-MVP"
  - id: "16-05-03"
    decision: "3 metric card groups (Conversations, Handoffs, Costs) with 3 cards each"
    reason: "Clean visual grouping maps to the 3 key concerns: engagement, automation rate, cost"
  - id: "16-05-04"
    decision: "ConfigPanel is full-page version of AgentConfigSlider with descriptions"
    reason: "Same data model and server actions; more space for explanatory text and better UX"
metrics:
  duration: "~10min"
  completed: "2026-02-10"
---

# Phase 16 Plan 05: Agentes Module Summary

**Agentes dashboard with 9 metric cards (3 groups), period selector, and full config page reusing 16-01 actions.**

## What Was Built

### Task 1: Metrics queries and server actions

**`src/lib/agents/production/metrics.ts`**
- `AgentMetrics` interface: totalConversations, ordersCreated, conversionRate, handoffsCount, resolvedWithoutHumanPct, avgResponseTimeMs, totalTokens, costPerConversation, costPerOrder, totalCost
- `getAgentMetrics(workspaceId, startDate, endDate)`: queries agent_sessions (count, handoffs by status), tool_executions (orders by crm.order.create with agent_session_id), agent_turns (token sum)
- `getMetricsByPeriod(workspaceId, period, customStart?, customEnd?)`: calculates date range using America/Bogota timezone
- `getDateRange()`: helper for period-to-date conversion
- Blended cost rate: $3/1M tokens (Haiku/Sonnet ~80/20 mix)

**`src/app/actions/agent-metrics.ts`**
- `fetchAgentMetrics(period, customStart?, customEnd?)`: server action with auth, workspace cookie, membership check, agent role exclusion

### Task 2: Agentes module pages and components

**`src/app/(dashboard)/agentes/layout.tsx`**
- Client component with Bot icon header and two tab links (Dashboard, Configuracion)
- Pathname-based active tab highlighting with border-bottom indicator

**`src/app/(dashboard)/agentes/page.tsx`**
- Server component with auth/role check (agents redirected to /crm/pedidos)
- Fetches initial metrics for "today" period
- Passes to MetricsDashboard client component

**`src/app/(dashboard)/agentes/components/metrics-dashboard.tsx`**
- Period selector: 3 buttons (Hoy, 7d, 30d) matching existing analytics pattern
- 3 metric groups with 3 cards each (9 total):
  - Conversaciones: atendidas, ordenes creadas, tasa conversion
  - Handoffs: count, % sin humano, tiempo promedio (-- for MVP)
  - Costos: tokens usados (K/M format), costo/conversacion, costo total
- useTransition for non-blocking period change loading
- Skeleton loading states per card

**`src/app/(dashboard)/agentes/config/page.tsx`**
- Server component with admin-only access (agents redirected to /agentes)

**`src/app/(dashboard)/agentes/components/config-panel.tsx`**
- Full-page config form (same fields as AgentConfigSlider from 16-04)
- Card layout with full descriptions for each setting section
- 6 sections: global toggle, conversational agent, CRM agents, handoff message, timer preset (with detail text), response speed
- Debounced saves for textarea/slider, immediate for toggles/selects

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 16-05-01 | Blended token cost rate $3/1M | Approximate Haiku/Sonnet 80/20 mix |
| 16-05-02 | avgResponseTimeMs = 0 for MVP | Needs instrumentation deferred post-MVP |
| 16-05-03 | 3 groups x 3 cards = 9 metric cards | Maps to engagement, automation, cost concerns |
| 16-05-04 | ConfigPanel reuses AgentConfigSlider logic | Same data model/actions, more descriptive layout |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 8dd5f3c | feat | Agent metrics queries and server action |
| e471d96 | feat | Agentes module with dashboard and config pages |

## Next Phase Readiness

Plan 16-06 (E2E Testing) can proceed. The Agentes module is fully functional:
- Dashboard tab with metrics cards and period selector
- Config tab with full agent configuration form
- All queries, server actions, and components in place
- Sidebar link to /agentes already exists from previous plan
