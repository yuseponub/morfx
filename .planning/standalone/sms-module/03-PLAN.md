---
phase: sms-module
plan: 03
type: execute
wave: 2
depends_on: ["sms-module-01"]
files_modified:
  - src/components/layout/sidebar.tsx
  - src/app/(dashboard)/sms/page.tsx
  - src/app/(dashboard)/sms/components/sms-dashboard.tsx
  - src/app/(dashboard)/sms/components/sms-balance-card.tsx
  - src/app/(dashboard)/sms/components/sms-metrics-cards.tsx
  - src/app/(dashboard)/sms/components/sms-usage-chart.tsx
  - src/app/(dashboard)/sms/components/sms-history-table.tsx
  - src/app/(dashboard)/sms/components/sms-settings.tsx
  - src/app/actions/sms.ts
autonomous: true

must_haves:
  truths:
    - "SMS entry visible in sidebar between WhatsApp and Tareas"
    - "SMS page shows current balance in COP"
    - "SMS page shows metrics: sent today/week/month, delivery rate %, accumulated cost"
    - "SMS page shows usage chart over time"
    - "SMS page shows paginated history table with date, recipient, message, status, cost, source"
    - "SMS settings toggle for block-on-zero balance"
    - "SMS page shows 'Servicio no activado' state when workspace SMS is inactive"
  artifacts:
    - path: "src/app/(dashboard)/sms/page.tsx"
      provides: "SMS dashboard server page"
      min_lines: 20
    - path: "src/app/(dashboard)/sms/components/sms-dashboard.tsx"
      provides: "Main SMS client component"
      min_lines: 30
    - path: "src/app/actions/sms.ts"
      provides: "Server actions for SMS data"
      exports: ["getSMSMetrics", "getSMSConfig", "getSMSHistory", "updateSMSConfig"]
  key_links:
    - from: "src/app/(dashboard)/sms/page.tsx"
      to: "src/app/actions/sms.ts"
      via: "server action calls"
      pattern: "getSMSMetrics|getSMSConfig"
    - from: "src/components/layout/sidebar.tsx"
      to: "/sms"
      via: "navItems href"
      pattern: "href.*sms"
---

<objective>
Build the SMS dashboard page with sidebar navigation, balance display, metrics cards, usage chart, history table, and settings panel.

Purpose: Users can monitor their SMS usage, see delivery stats, and configure their SMS service.
Output: Complete /sms page with all components, server actions for data fetching
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-module/CONTEXT.md
@.planning/standalone/sms-module/RESEARCH.md
@.planning/standalone/sms-module/01-SUMMARY.md
@src/components/layout/sidebar.tsx
@src/app/(dashboard)/analytics/page.tsx
@src/app/actions/analytics.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server actions for SMS data</name>
  <files>src/app/actions/sms.ts</files>
  <action>
Create server actions file following existing patterns (see src/app/actions/analytics.ts for style).

All actions use 'use server', call getAuthContext() for workspace_id, use createAdminClient().

**getSMSConfig():**
- Query sms_workspace_config where workspace_id matches
- Return { isActive, balanceCop, allowNegativeBalance, totalSmsSent, totalCreditsUsed } or null if not configured

**getSMSMetrics():**
- Query sms_messages for the workspace with date filters:
  - sentToday: count where created_at >= start of today (Colombia time)
  - sentThisWeek: count where created_at >= start of this week (Monday, Colombia time)
  - sentThisMonth: count where created_at >= start of this month (Colombia time)
  - deliveredCount: count where status = 'delivered'
  - failedCount: count where status = 'failed'
  - totalCount: count all
  - deliveryRate: deliveredCount / (deliveredCount + failedCount) * 100 (avoid division by zero)
  - totalCostCop: sum of cost_cop
- Return all metrics as an object

**getSMSHistory(page: number, pageSize: number = 20):**
- Query sms_messages for workspace, ordered by created_at DESC
- Use Supabase .range() for pagination with count: 'exact'
- Return { data: messages[], total: number, page, pageSize }

**getSMSUsageData(days: number = 30):**
- Query sms_messages grouped by date (created_at::date) for last N days
- Return array of { date: string, count: number, cost: number } for chart

**updateSMSConfig(updates: { allowNegativeBalance?: boolean }):**
- Update sms_workspace_config for workspace
- revalidatePath('/sms')
- Return success/error

Use Colombia timezone for all date calculations: compute start-of-day/week/month in America/Bogota.
  </action>
  <verify>TypeScript compiles. All 5 server actions exported. Each uses getAuthContext() for auth. Date calculations use Colombia timezone.</verify>
  <done>Server actions file with getSMSConfig, getSMSMetrics, getSMSHistory, getSMSUsageData, updateSMSConfig — all workspace-scoped and auth-protected.</done>
</task>

<task type="auto">
  <name>Task 2: SMS dashboard page and all UI components</name>
  <files>
    src/components/layout/sidebar.tsx
    src/app/(dashboard)/sms/page.tsx
    src/app/(dashboard)/sms/components/sms-dashboard.tsx
    src/app/(dashboard)/sms/components/sms-balance-card.tsx
    src/app/(dashboard)/sms/components/sms-metrics-cards.tsx
    src/app/(dashboard)/sms/components/sms-usage-chart.tsx
    src/app/(dashboard)/sms/components/sms-history-table.tsx
    src/app/(dashboard)/sms/components/sms-settings.tsx
  </files>
  <action>
**sidebar.tsx:**
Add SMS nav item AFTER WhatsApp and BEFORE Tareas in the navItems array:
```
{ href: '/sms', label: 'SMS', icon: MessageSquareText }
```
Import MessageSquareText from lucide-react.

**page.tsx (server component):**
Follow analytics page pattern exactly. Get workspace from cookie, auth from Supabase, fetch initial data with getSMSConfig() and getSMSMetrics(). Pass as props to SMSDashboard.
Wrap in `<div className="flex-1 overflow-y-auto">` (per memory pattern).

**sms-dashboard.tsx (client component):**
'use client'. Main orchestrator component. Receives initialMetrics and initialConfig.
- If config is null or not active: show "Servicio SMS no activado" empty state with info message
- If active: render in order: SmsBalanceCard, SmsMetricsCards, SmsUsageChart, SmsHistoryTable, SmsSettings
- Use Tabs component (from shadcn/ui if available, or simple div sections) with two sections: "Dashboard" and "Configuracion"

**sms-balance-card.tsx:**
Large prominent card showing:
- Current balance formatted as COP: `$XX,XXX` using Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
- Subtitle: "Precio por SMS: $97 COP"
- Visual indicator: green if balance > 5000, yellow if 1000-5000, red if < 1000
- Total SMS sent count

**sms-metrics-cards.tsx:**
Grid of 4 metric cards (like analytics cards):
1. SMS Enviados Hoy (count)
2. SMS Esta Semana (count)
3. SMS Este Mes (count)
4. Tasa de Entrega (percentage with green/red color)

Use Tailwind grid: `grid grid-cols-2 lg:grid-cols-4 gap-4`

**sms-usage-chart.tsx:**
recharts AreaChart (match analytics page pattern):
- X axis: dates (last 30 days)
- Y axis: SMS count per day
- Area fill with gradient
- Fetch data via getSMSUsageData server action on mount

**sms-history-table.tsx:**
Paginated table showing SMS history:
- Columns: Fecha, Destinatario (name + phone), Mensaje (truncated to 50 chars), Estado (badge: verde=delivered, amarillo=sent/pending, rojo=failed), Costo, Fuente
- Pagination controls: Previous/Next with page indicator
- Fetch via getSMSHistory server action
- Empty state: "No hay mensajes SMS registrados"

**sms-settings.tsx:**
Simple settings panel:
- Toggle switch: "Bloquear envio cuando saldo es $0" (maps to NOT allow_negative_balance)
- Description text explaining the behavior
- Save button that calls updateSMSConfig
- Current status indicator (active/inactive)

Use existing UI components (Card, Badge, Button, Switch from shadcn/ui).
All Tailwind styling. Spanish labels throughout.
  </action>
  <verify>
    - `npm run build` or `npx next build` succeeds (no build errors)
    - Sidebar shows SMS item between WhatsApp and Tareas
    - /sms page renders without crash (even with empty data)
    - All 6 sub-components exist and are imported by sms-dashboard.tsx
  </verify>
  <done>
    - SMS visible in sidebar navigation
    - /sms page renders complete dashboard: balance, 4 metric cards, usage chart, history table, settings
    - Inactive state shows appropriate empty state
    - All components use Spanish labels and COP formatting
  </done>
</task>

</tasks>

<verification>
- Sidebar has SMS entry with MessageSquareText icon
- /sms page loads without errors
- Balance displays in COP format
- Metrics show today/week/month counts and delivery rate
- History table paginates correctly
- Settings toggle updates allow_negative_balance
- Inactive workspace shows empty state
</verification>

<success_criteria>
- Complete SMS dashboard accessible from sidebar
- All data flows through server actions (no client-side DB calls)
- Responsive layout (mobile + desktop)
- Spanish labels throughout
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-module/03-SUMMARY.md`
</output>
