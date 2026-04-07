---
phase: standalone/metricas-conversaciones
verified: 2026-04-06T00:00:00Z
status: passed
score: 18/18 must-haves verified
gaps: []
---

# Metricas de Conversaciones — Verification Report

**Phase Goal:** Build a "Métricas de Conversaciones" module that shows daily counts of nuevas conversaciones (strict: requires inbound message), reabiertas (after configurable window of inactivity), and agendadas (contacts tagged with VAL or configured tag), via a dashboard with cards, evolution chart, custom date range, realtime updates, sidebar entry gated by workspace setting, and settings UI to toggle/configure — all within the existing morfx workspace + RLS model, without adminOnly (all workspace users access; only owner/admin edit settings).

**Verified:** 2026-04-06
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RPC `get_conversation_metrics` exists with correct signature | VERIFIED | `supabase/migrations/20260406000000_conversation_metrics_module.sql` line 41 |
| 2 | Strict-inbound nueva: MIN(timestamp) WHERE direction='inbound' | VERIFIED | Migration lines 76–88: `MIN(m.timestamp) AS first_in` + `m.direction = 'inbound'` |
| 3 | LAG-based reabiertas with prev_in IS NOT NULL guard | VERIFIED | Migration lines 93–122: `LAG(m.timestamp)` + `prev_in IS NOT NULL` + distance check |
| 4 | America/Bogota throughout migration | VERIFIED | Migration lines 61, 72, 113, 128, 129: `AT TIME ZONE 'America/Bogota'` in every date_trunc |
| 5 | Server action calls `rpc('get_conversation_metrics'` | VERIFIED | `src/app/actions/metricas-conversaciones.ts` line 87 |
| 6 | Server action computes "today in Bogota" not UTC | VERIFIED | `metricas-conversaciones.ts` lines 32–35: `toLocaleString('en-US', { timeZone: 'America/Bogota' })` |
| 7 | Page redirects when settings.conversation_metrics.enabled is false | VERIFIED | `src/app/(dashboard)/metricas/page.tsx` lines 33–37 |
| 8 | NO adminOnly checks in /metricas/ dashboard | VERIFIED | Zero matches for `adminOnly` in page.tsx and all components/*.tsx; line 39 has explicit comment |
| 9 | 3 metric cards with totals | VERIFIED | `metric-cards.tsx`: Nuevas / Reabiertas / Agendadas cards in 3-column grid, lines 11–30 |
| 10 | Period selector with today/yesterday/7days/30days | VERIFIED | `period-selector.tsx` lines 14–18: all 4 presets defined and rendered |
| 11 | Evolution chart (recharts) with 3 lines | VERIFIED | `evolution-chart.tsx` lines 81–107: Line components for nuevas/reabiertas/agendadas with ResponsiveContainer |
| 12 | Date range popover (react-day-picker) with custom range | VERIFIED | `date-range-popover.tsx`: uses morfx Calendar wrapper with `mode="range"` (line 100), apply/cancel guards |
| 13 | Realtime hook subscribing to messages + contact_tags with cleanup | VERIFIED | `hooks/use-metricas-realtime.ts` lines 53–98: 3 subscriptions (messages INSERT, contact_tags INSERT+DELETE), removeChannel + removeEventListener + clearTimeout on cleanup |
| 14 | Sidebar shows Métricas entry conditionally on settings, NO adminOnly | VERIFIED | `sidebar.tsx` lines 92–95: entry with `settingsKey: 'conversation_metrics.enabled'`, NO adminOnly on the entry; filter logic at lines 143–147 |
| 15 | Settings page owner/admin gated | VERIFIED | `settings/page.tsx` lines 37–40: `role === 'owner' \|\| role === 'admin'` gate, redirects non-admins to /metricas |
| 16 | Settings server action calls domain layer | VERIFIED | `metricas-conversaciones-settings.ts` line 56: `await updateConversationMetricsSettings(workspaceId, partial)` |
| 17 | Domain workspace-settings.ts exists with createAdminClient + workspace_id filter | VERIFIED | `src/lib/domain/workspace-settings.ts` line 46: `createAdminClient()`, line 53: `.eq('id', workspaceId)` |
| 18 | docs/analysis/04-estado-actual-plataforma.md updated | VERIFIED | Lines 280–309: full module entry with state=✅ Funcional, GoDentist Valoraciones, all key files listed |

**Score:** 18/18 truths verified

---

## Required Artifacts

| Artifact | Status | Lines | Notes |
|----------|--------|-------|-------|
| `supabase/migrations/20260406000000_conversation_metrics_module.sql` | VERIFIED | 162 | RPC + index, applied in prod (user confirmed) |
| `src/lib/metricas-conversaciones/types.ts` | VERIFIED | present | Period, DailyMetric, MetricTotals, MetricsPayload, MetricsSettings, DEFAULT_METRICS_SETTINGS exported |
| `src/app/actions/metricas-conversaciones.ts` | VERIFIED | 126 | `'use server'`, calls RPC, Bogota TZ, typed MetricsPayload |
| `src/app/(dashboard)/metricas/page.tsx` | VERIFIED | 57 | Server component, settings gate, no adminOnly, passes workspaceId to view |
| `src/app/(dashboard)/metricas/components/metricas-view.tsx` | VERIFIED | 57 | Client, useTransition, useMetricasRealtime wired, EvolutionChart rendered |
| `src/app/(dashboard)/metricas/components/metric-cards.tsx` | VERIFIED | 72 | 3 cards, animate-pulse skeleton, no adminOnly |
| `src/app/(dashboard)/metricas/components/period-selector.tsx` | VERIFIED | 51 | 4 presets + DateRangePopover integrated |
| `src/app/(dashboard)/metricas/components/evolution-chart.tsx` | VERIFIED | 114 | ResponsiveContainer, 3 Line components, empty state |
| `src/app/(dashboard)/metricas/components/date-range-popover.tsx` | VERIFIED | 128 | morfx Calendar wrapper, mode="range", end>=start guard, apply/cancel |
| `src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts` | VERIFIED | 100 | Only in hooks/ (not duplicated in components/), 3 subscriptions, debounce 400ms, full cleanup |
| `src/app/(dashboard)/metricas/settings/page.tsx` | VERIFIED | 71 | owner/admin gate, loads current settings, no adminOnly |
| `src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx` | VERIFIED | 118 | Switch/Input/Label, calls updateMetricsSettings, toast feedback |
| `src/app/actions/metricas-conversaciones-settings.ts` | VERIFIED | 68 | `'use server'`, owner/admin check, domain call, revalidatePath x3 |
| `src/lib/domain/workspace-settings.ts` | VERIFIED | 117 | createAdminClient, workspace_id eq filter, merge without clobbering siblings, validation |
| `src/components/layout/sidebar.tsx` | VERIFIED | present | settingsKey type added (line 36), Métricas entry at lines 92–95, filter logic at 143–147 |
| `docs/analysis/04-estado-actual-plataforma.md` | VERIFIED | present | Lines 280–309: complete module entry |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `metricas-conversaciones.ts` | `supabase.rpc('get_conversation_metrics', ...)` | createClient().rpc() | WIRED — line 87 |
| `metricas-conversaciones.ts` | America/Bogota "today" | `toLocaleString('en-US', { timeZone: 'America/Bogota' })` | WIRED — lines 32–35 |
| `page.tsx` | `getConversationMetrics('today')` | direct import + call | WIRED — line 42 |
| `metricas-view.tsx` | `getConversationMetrics(target)` | useTransition + server action | WIRED — line 31 |
| `metricas-view.tsx` | `useMetricasRealtime(workspaceId, ...)` | import from ../hooks | WIRED — line 46 |
| `metricas-view.tsx` | `EvolutionChart` | props pass-through of data.daily | WIRED — line 54 |
| `period-selector.tsx` | `DateRangePopover` | import + render | WIRED — lines 6, 44 |
| `sidebar.tsx::filteredNavItems` | `settings.conversation_metrics.enabled` | settingsKey split + nsObj lookup | WIRED — lines 143–147 |
| `metrics-settings-form.tsx` | `updateMetricsSettings` | useTransition + server action | WIRED — line 30 |
| `metricas-conversaciones-settings.ts` | `updateConversationMetricsSettings` | domain import + await | WIRED — lines 6, 56 |
| `workspace-settings.ts` | `workspaces` table | createAdminClient + .eq('id', workspaceId) | WIRED — lines 46, 53 |

---

## Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Strict inbound nueva | SATISFIED | `direction = 'inbound'` + `MIN(m.timestamp)` in migration nuevas_q CTE |
| LAG-based reabiertas | SATISFIED | `LAG()` window + `prev_in IS NOT NULL` + distance >= p_reopen_days |
| Agendadas by tag | SATISFIED | contact_tags CTE keyed to configurable p_tag_name (default 'VAL') |
| America/Bogota timezone | SATISFIED | Every date_trunc in migration; nowBogota in server action |
| Cards with totals | SATISFIED | 3-column grid in metric-cards.tsx |
| Evolution chart | SATISFIED | recharts LineChart with 3 lines |
| Custom date range | SATISFIED | react-day-picker via morfx Calendar wrapper, mode="range", end>=start guard |
| Realtime updates | SATISFIED | Supabase Realtime on messages + contact_tags, debounced 400ms re-fetch |
| Sidebar gated by setting | SATISFIED | settingsKey mechanism, NO adminOnly |
| All users access dashboard | SATISFIED | No role check on /metricas page; sidebar entry without adminOnly |
| Owner/admin edit settings | SATISFIED | Settings page and server action both gate on role === 'owner' \|\| 'admin' |
| CLAUDE.md Rule 3 (domain layer) | SATISFIED | updateConversationMetricsSettings in src/lib/domain/workspace-settings.ts |
| CLAUDE.md Rule 4 (docs updated) | SATISFIED | 04-estado-actual-plataforma.md lines 280–309 |
| messages already in supabase_realtime | SATISFIED | migration 20260130000002 line 280: `ALTER PUBLICATION supabase_realtime ADD TABLE messages` — no extra migration needed |

---

## Anti-Patterns Found

None found. Scanned all 16 modified files for TODO/FIXME/placeholder/empty returns/stub handlers. No blockers or warnings.

Notable positive patterns:
- `metricas-view.tsx`: explicit `periodRef` to avoid stale closures in realtime callback
- `workspace-settings.ts`: non-destructive JSONB merge preserves sibling keys
- `date-range-popover.tsx`: `canApply` guard disables Aplicar when end < start
- `sidebar.tsx` comment at line 90–91 explicitly documents the no-adminOnly decision

---

## Human Verification Required

The following items need human confirmation but are not expected to block:

### 1. End-to-end realtime latency
**Test:** Open `/metricas` in GoDentist Valoraciones and send an inbound WhatsApp test message.
**Expected:** Cards and chart refresh within ~1s without manual reload.
**Why human:** Can't simulate a real Supabase Realtime INSERT from a static code check.

### 2. Date range calendar UI renders correctly
**Test:** Click "Rango personalizado" button, select two dates spanning different months, click Aplicar.
**Expected:** Both months visible (numberOfMonths=2), cards + chart update, button label shows selected range.
**Why human:** Visual rendering and react-day-picker Calendar wrapper behavior.

### 3. Settings flag bootstrap for GoDentist Valoraciones
**Test:** Navigate to `/metricas/settings` as owner in GoDentist Valoraciones workspace and confirm the enabled toggle is ON.
**Expected:** Module is active; Métricas entry visible in sidebar for all workspace users.
**Why human:** Requires confirming the SQL bootstrap was applied in production.

---

## Summary

All 18 must-haves across plans 01–05 are verified in the codebase. The module is structurally complete and correctly wired:

- **Plan 01 (migration):** RPC exists at correct path with strict-inbound nueva, LAG reabiertas, Bogota timezone throughout, SECURITY INVOKER, GRANT to authenticated. Applied in production per user confirmation.
- **Plan 02 (dashboard base):** Server action wraps RPC with correct Bogota "today" computation. Page redirects on disabled flag with no adminOnly. View uses useTransition. 3 cards render totals.
- **Plan 03 (chart + date range):** EvolutionChart with 3 recharts lines wired to data.daily. DateRangePopover uses morfx Calendar wrapper (mode="range") with end>=start guard. Period selector integrates both presets and custom range.
- **Plan 04 (realtime):** Hook in correct `/hooks/` directory. Subscribes to messages (workspace_id filtered) and contact_tags (INSERT+DELETE). 400ms debounce, document.hidden guard, visibilitychange listener, full cleanup (removeChannel + removeEventListener + clearTimeout). No extra publication migration needed (messages already in supabase_realtime from migration 20260130000002).
- **Plan 05 (sidebar + settings):** Sidebar has settingsKey mechanism with Métricas entry having no adminOnly. Settings page is owner/admin gated. Server action validates role and delegates to domain layer. Domain function uses createAdminClient + non-destructive JSONB merge. Docs updated with full module entry.

The only items that cannot be verified programmatically are the three human checks above (realtime latency, calendar visual, production flag state), none of which indicate a structural gap.

---

_Verified: 2026-04-06_
_Verifier: Claude (gsd-verifier)_
