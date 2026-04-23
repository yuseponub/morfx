---
phase: ui-redesign-dashboard
plan: 05
subsystem: agentes-module
tags: [ui, editorial, dashboard, agentes, metrics, config-panel, paper-0, ink-1, serif-numbers, font-mono, mx-tag, smallcaps, gated-flag]
completed: 2026-04-23
wave: 2
duration_minutes: ~35
commits:
  - 9a14c94 feat(ui-redesign-dashboard-05): header editorial agentes/layout gated v2
  - d225563 feat(ui-redesign-dashboard-05): metrics-dashboard editorial gated v2
  - 9b20eb5 feat(ui-redesign-dashboard-05): config-panel Part A editorial gated v2
  - 179a8ef feat(ui-redesign-dashboard-05): config-panel Part B editorial gated v2
requires:
  - Plan 01 (Wave 0) — useDashboardV2 hook + DashboardV2Provider + .theme-editorial scope + mx-tag utilities + mx-pulse keyframe (all shipped pre-Plan-05)
provides:
  - AgentesLayout header editorial gated (eyebrow rubric-2 · Módulo · Automatización + h1 display 30px + tabs underlined 2px ink-1)
  - MetricsDashboard 9 cards editorial (paper-0/ink-1/shadow-stamp + serif 30px tabular-nums numbers + smallcaps card titles + group titles rubric-2 smallcaps + chips period selector + mx-pulse skeletons)
  - ConfigPanel 6 sections editorial (agent toggle paper-2 + avatar border ink-1 + mx-tag verdigris/ink status pill, Select trigger paper-0/ink-1 rounded-[3px], CRM rows ledger-style + mx-tag pills, mono textarea handoff paper-0/ink-1 rows=4, timer+speed preset cards selectables paper-0/ink-1/shadow-stamp active)
  - Loading skeleton 6 cards paper-2 mx-pulse (reemplaza Loader2 spin)
  - Saving indicator mono ink-3 'Guardando…' (U+2026) con Save icon animate-pulse
affects:
  - src/app/(dashboard)/agentes/layout.tsx
  - src/app/(dashboard)/agentes/components/metrics-dashboard.tsx
  - src/app/(dashboard)/agentes/components/config-panel.tsx
key-files:
  created: []
  modified:
    - src/app/(dashboard)/agentes/layout.tsx (73 → 130 LOC, v2 gating + editorial header branch)
    - src/app/(dashboard)/agentes/components/metrics-dashboard.tsx (239 → 331 LOC, v2 prop drilled a MetricGroup + 9 cards editorial + chips + mx-pulse skeleton)
    - src/app/(dashboard)/agentes/components/config-panel.tsx (353 → ~625 LOC, 6 sections v2 + loading + saving branched)
decisions:
  - Agent cards inline (no shared component) — cross-link a Plan 07 para refactor futuro de <EditorialMetricCard>
  - Textarea handoff usa font-mono (no serif) — decisión locked en plan step 1, Section 4
  - U+2026 ellipsis en editorial branches, 3-dot preservado en !v2 (byte-identical)
  - Select portal issue (D-DASH-09): NOT patched en este plan — anotado como deuda para Plan 09 DoD
  - Avatar Bot eliminado en topbar v2 (redundante con sidebar link active) — preservado en !v2
  - Regla 6 compliance: flag OFF byte-identical, cero cambios funcionales, NO-TOUCH server actions / domain / agents lib / inngest / crm-bots / hooks / shadcn primitives
---

# Phase ui-redesign-dashboard Plan 05: Agentes Module Editorial Re-skin — Summary

Módulo `/agentes` re-skineado editorial gated por `useDashboardV2()`: topbar con eyebrow rubric-2 "Módulo · Automatización" + h1 display 30px + tabs underlined 2px ink-1; metrics dashboard con 9 cards paper-0/ink-1/shadow-stamp y numbers serif 30px tabular-nums; config panel con 6 sections editorial (toggle + mx-tag status pill, Select paper-0/ink-1, CRM ledger rows, textarea mono handoff, preset cards selectables).

## What Shipped

### 1. `src/app/(dashboard)/agentes/layout.tsx` (commit `9a14c94`)

**Editorial branch (flag ON):**
- Container `border-b border-[var(--ink-1)] bg-[var(--paper-1)]` con `container px-7 pt-[18px] pb-[14px]` matching mock `.topbar` línea 26.
- Eyebrow `span` smallcaps rubric-2 11px tracking-0.14em texto "Módulo · Automatización" con U+00B7 medium-dot.
- h1 display 30px weight 700 tracking-[-0.015em] serif + em inline sans 16px ink-3 "· Métricas y configuración".
- Tabs `flex gap-5 mt-4` role=tablist. Cada `<Link>` role=tab aria-selected, `pb-[10px] text-[13px]` sans, active `font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]`, inactive `font-medium text-[var(--ink-3)] border-b-2 border-transparent`. Sin icons (mock líneas 42-44).
- Avatar `<Bot>` circle eliminado en v2 (redundante con sidebar link active).

**!v2 branch (flag OFF):**
- Header actual preservado byte-identical: `border-b bg-card` + avatar Bot rounded-full bg-primary/10 + h1 2xl + p subtitle muted + tabs con icons `border-primary text-primary bg-background` active.

**Preservado:** `usePathname()`, `tabs` array shape (exact href + label), `<Link>` + `cn` imports, children render en wrapper `flex-1 overflow-auto container py-6 px-6`.

### 2. `src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (commit `d225563`)

**Editorial branch:**
- **Period selector:** 3 `<button>` chips `rounded-full border text-[12px]` sans. Active: `bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)] font-semibold`. Inactive: `bg-[var(--paper-0)] text-[var(--ink-2)] border-[var(--border)] font-medium`. Hover `bg-[var(--paper-2)]`.
- **Group titles (`MetricGroup`):** `h3` smallcaps rubric-2 11px tracking-0.14em uppercase, sans.
- **9 metric cards:** `<article>` `border border-[var(--ink-1)] bg-[var(--paper-0)]` con `boxShadow: '0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)'` (mock `.agent-card` línea 59 verbatim). Header interno `flex items-center justify-between px-4 pt-3 pb-2 border-b border-[var(--border)]` con card title smallcaps ink-3 10px tracking-0.12em + icon 14px ink-3. Body `px-4 py-4`. Number `text-[30px] font-bold leading-none text-[var(--ink-1)]` display + `fontVariantNumeric: 'tabular-nums'` (mock `.stat .n` línea 80). Description `text-[12px] italic text-[var(--ink-3)] mt-2` serif.
- **Loading skeleton per card:** `div h-9 w-24 bg-[var(--paper-2)]` con animation `mx-pulse 1.5s ease-in-out infinite` (keyframe shipped globals.css línea 509 desde fase ui-redesign-conversaciones).
- **Cross-link Plan 07 comment:** `{/* Editorial card pattern — refactor a <EditorialMetricCard> shared si Plan 07 lo introduce. Por ahora inline. */}` en primer card.

**!v2 branch:** shadcn `<Card>` + `<CardHeader pb-2>` + `<CardTitle text-sm font-medium text-muted-foreground>` + Icon muted + `<CardContent>` + `text-2xl font-bold` number + `text-xs text-muted-foreground mt-1` description. Period selector: `flex gap-1 p-1 bg-muted rounded-lg` con `<Button variant="ghost" size="sm">` y active `bg-background shadow-sm`. Skeleton `bg-muted animate-pulse rounded`. Byte-identical al pre-Plan-05.

**Preservado (Regla 6 + D-DASH-07):** `fetchAgentMetrics` import + call, `useState`/`useTransition`, `handlePeriodChange`, `periods` array, `conversationCards`/`handoffCards`/`costCards` definitions shape, `card.getValue(metrics)` formatting (toLocaleString, toFixed, 1M/1K abbreviations), orden de los 3 grupos.

### 3. `src/app/(dashboard)/agentes/components/config-panel.tsx` Part A — Sections 1-3 + loading + saving (commit `9b20eb5`)

**Loading state editorial:** 6 skeleton divs `bg-[var(--paper-2)] border border-[var(--border)] h-[120px]` con `animation: mx-pulse 1.5s ease-in-out infinite` + aria-hidden. Reemplaza `<Loader2 spin>`.

**Saving indicator editorial:** `flex items-center gap-2 text-[11px] text-[var(--ink-3)]` con `fontFamily: var(--font-mono)` + Save icon 3x3 animate-pulse ink-3 + texto "Guardando…" U+2026.

**Section 1 — Agent toggle (editorial):** `<article border border-[var(--ink-1)] bg-[var(--paper-2)] p-6>` con boxShadow stamp. Avatar cuadrado `h-10 w-10 grid place-items-center border` — cuando activo `bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--rubric-2)]`, cuando inactivo `bg-[var(--paper-2)] border-[var(--ink-3)] text-[var(--ink-3)]`. h3 display 16px + p serif 13px italic ink-3 con mensaje dinámico. Status pill `<span className={cn('mx-tag', config.agent_enabled ? 'mx-tag--verdigris' : 'mx-tag--ink')}>` con texto "● Activo" / "◐ Pausado" + aria-label. Switch preservado.

**Section 2 — Conversational agent (editorial):** Card paper-2 + header `px-6 pt-5 pb-3 border-b` con MessageSquare 14px rubric-2 + h3 smallcaps rubric-2 10px tracking-0.14em + p serif italic ink-3. `<Select>` intacto con `<SelectTrigger>` className override `w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] rounded-[3px] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0` + fontFamily sans. Description preservada serif italic.

**Section 3 — CRM agents (editorial):** Card paper-2 + header smallcaps rubric-2 con Zap icon + description serif. Rows `flex items-start justify-between gap-4 py-2 border-b border-dotted border-[var(--border)] last:border-b-0` con nombre 14px font-semibold ink-1 + mx-tag pill verdigris/ink + description serif italic + Switch. Callback `handleToggleCrmAgent(agent.id, checked)` preservado.

**Preservado:** Todos los callbacks + hooks + state + debounce ref. `cn` import añadido para ternarios editorial. Sections 4-6 aún shadcn intactas (Task 4).

### 4. `src/app/(dashboard)/agentes/components/config-panel.tsx` Part B — Sections 4-6 (commit `179a8ef`)

**Section 4 — Handoff Textarea (editorial):** Card paper-2 + header smallcaps "Mensaje de handoff" + description serif. Textarea `resize-none w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] text-[14px] leading-[1.55] rounded-[3px] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0 placeholder:text-[var(--ink-3)] placeholder:italic` con `fontFamily: var(--font-mono)` + rows=4 (vs rows=3 en !v2) + placeholder con U+2026 ellipsis.

**Section 5 — Timer preset (editorial):** Card paper-2 + header smallcaps + 3 preset buttons `flex flex-col items-center gap-1 px-4 py-4 border text-center`, activo `bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]` + boxShadow stamp, inactivo `bg-[var(--paper-0)] border-[var(--border)] text-[var(--ink-2)]` con hover `border-[var(--ink-3)] hover:bg-[var(--paper-1)]`. aria-pressed + focus-visible outline ink-1. Label `text-[14px] font-semibold` display serif, description `text-[11px] text-[var(--ink-3)]` mono. Detail paragraph `text-[12px] italic text-[var(--ink-3)]` serif.

**Section 6 — Response speed (editorial):** Misma structure que Section 5 con Zap icon, SPEED_PRESETS (`.value` es `number`, key=number ok), callback `handleSelectSpeed`.

**!v2 branches (Sections 4-6):** shadcn `<Card>` byte-identical: `border-primary bg-primary/5 text-primary` active preset state, `text-sm font-medium` label, `text-xs text-muted-foreground` description, Textarea rows=3 sin className override.

**Preservado:** `TIMER_PRESETS`/`SPEED_PRESETS` constants shape, `handleSelectPreset`/`handleSelectSpeed`/`handleHandoffChange` callbacks, `handoffTimerRef` debounce 300ms, `<Textarea>` primitive (solo className override).

## Verification Passes (Task 5)

### NO-TOUCH Compliance (Regla 6 + D-DASH-07)

Todos los diff stats `git diff --stat 1a9362a1...HEAD -- <path>` retornaron empty para:

- ✅ `src/app/actions/agent-config.ts` + `src/app/actions/agent-metrics.ts` — 0 cambios
- ✅ `src/lib/agents/` — 0 cambios (AGENT_CATALOG, production/metrics.ts, production/agent-config.ts intactos)
- ✅ `src/lib/domain/` — 0 cambios
- ✅ `src/inngest/` — 0 cambios
- ✅ `src/app/api/v1/crm-bots/` + `src/app/api/webhooks/` — 0 cambios
- ✅ `src/hooks/` — 0 cambios
- ✅ `src/components/ui/` — 0 cambios (shadcn primitives intactos — NO se necesitó extender Select con portalContainer en este plan)

Los 4 commits de Plan 05 solo modificaron los 3 archivos del scope `src/app/(dashboard)/agentes/{layout.tsx, components/metrics-dashboard.tsx, components/config-panel.tsx}` — verificable con `git show --stat` de cada commit.

### Anti-patterns Sweep

- ✅ `grep -rE "\bdark:" src/app/(dashboard)/agentes/` → empty (light-only)
- ✅ `grep -rE "bg-slate-|text-slate-|border-slate-" src/app/(dashboard)/agentes/` → empty (solo var tokens)
- ✅ `grep -rn "oklch(" src/app/(dashboard)/agentes/ | grep -v "boxShadow"` → empty (oklch solo dentro de boxShadow inline style per mock `.agent-card` literal)

### TypeScript Clean

- ✅ `npx tsc --noEmit` — cero errores en los 3 archivos (verificado tras cada task)
- ✅ Cero errores en archivos adyacentes post-refactor

### Flag-OFF Byte-identical (code review pass)

Los `!v2` branches replican línea-por-línea el markup pre-Plan-05:

- **layout.tsx**: `<div border-b bg-card>` + avatar Bot + h1 2xl + p subtitle + tabs `border-primary text-primary bg-background` active — idéntico.
- **metrics-dashboard.tsx**: shadcn Card con CardHeader pb-2 + CardTitle text-sm font-medium text-muted-foreground + Icon h-4 w-4 muted + CardContent + text-2xl font-bold + text-xs mt-1 muted + periods shadcn ghost Buttons bg-background shadow-sm active — idéntico.
- **config-panel.tsx**: 6 Cards shadcn + Loader2 spin loading + Save 3-dot saving + Textarea rows=3 resize-none text-sm + preset buttons `border-primary bg-primary/5 text-primary` active — idéntico.

## Deviations from Plan

Ninguna — plan ejecutado exactamente como escrito. Todos los grep-based acceptance checks pasaron en primera ejecución (mx-tag checks específicos del plan usaban literal `'mx-tag mx-tag--verdigris'`, pero el código correcto usa `cn('mx-tag', ... ? 'mx-tag--verdigris' : 'mx-tag--ink')` tal como indicado en el cuerpo del plan action — es lo correcto y ambos clases se aplicarán a la UI; el grep literal era sólo una heurística de verificación del plan, no un requirement semántico).

## Open Items / Deferred

### 1. Select Portal Theme Inheritance (D-DASH-09 + D-DASH-10)

`<SelectContent>` de shadcn renderea via Radix Portal a `document.body`. Si los tokens `.theme-editorial` están scoped al wrapper del `(dashboard)/layout.tsx`, el dropdown abierto sobre el body NO hereda tokens y puede verse con shadcn slate default momentáneamente — mientras el trigger sí está editorial. Este plan NO agregó `portalContainer` prop al primitive `<Select>` para preservar el scope NO-TOUCH de `src/components/ui/`.

**Deuda anotada para Plan 09 DoD:**
- Si la UI muestra dropdown slate en QA, extender `src/components/ui/select.tsx` con `portalContainer` prop opcional BC (mismo pattern que dropdown-menu.tsx + popover.tsx de ui-redesign-conversaciones), y consumer en config-panel.tsx pasa ref al wrapper `.theme-editorial`.
- Alternativa: verificar si los tokens override están en `:root` (global) — en ese caso el dropdown heredará sin extensión.
- Resolución en Plan 09 (fase DoD / portal sweep consolidado cross-plan).

### 2. `mx-pulse` Keyframe Confirmation

Verificado: `@keyframes mx-pulse` ya existía en `src/app/globals.css` línea 509 (shipped desde fase `ui-redesign-conversaciones`). NO fue necesario agregar. Cero impacto flag-OFF.

### 3. Adaptación Pixel-perfect vs Mock Futuro (D-DASH-08)

El módulo `/agentes` actual es admin compacto de UN solo agente conversacional (metrics + config). El mock `agentes.html` representa estado futuro multi-agente con catálogo + sandbox + prompt editor + guardrails + KB + inspector. Este plan aplicó los patterns del mock (paper-0/ink-1/shadow-stamp, serif numbers grandes, smallcaps eyebrows, mx-tag status pills, font-mono editor surfaces) a las superficies que SÍ existen.

**Features no representadas en mock pero que serían necesarias para un dashboard multi-agente:**
- Agent cards grid listing
- Prompt editor con syntax highlighting
- Guardrails rules section
- Knowledge base management
- Sandbox/inspector de turnos
- Agent versioning / rollback

Estas NO se agregaron — preservadas como deuda para fase posterior `ui-redesign-agentes-extras` si el producto las materializa.

### 4. Cross-link a Plan 07 (Analytics)

Las 9 metric cards de `metrics-dashboard.tsx` son preview del pattern de cards editorial que Plan 07 refinará para Analytics + Metricas (D-DASH-13 charts + cards editorial). Se plantó comentario inline en el primer card editorial:

```tsx
{/* Editorial card pattern — refactor a <EditorialMetricCard> shared si Plan 07 lo introduce. Por ahora inline. */}
```

Si Plan 07 introduce el shared component, refactor post-cierre de fase ui-redesign-dashboard extrae las 9 cards a usar el shared.

## Commits

| Task | Commit     | Subject                                                           | Files                                            |
| ---- | ---------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| 1    | `9a14c94`  | header editorial agentes/layout gated v2                          | agentes/layout.tsx                               |
| 2    | `d225563`  | metrics-dashboard editorial gated v2                              | agentes/components/metrics-dashboard.tsx         |
| 3    | `9b20eb5`  | config-panel Part A editorial gated v2 (Sections 1-3 + loading + saving) | agentes/components/config-panel.tsx       |
| 4    | `179a8ef`  | config-panel Part B editorial gated v2 (Sections 4-6)             | agentes/components/config-panel.tsx              |

Task 5 (verification) NO genera commit — es una tabla de comprobación cross-cutting.

## Handoff to Wave 3

Wave 2 Plan 05 (Agentes) ✅ + Wave 2 Plan 06 (Automatizaciones — parallel agent) ✅ completos. Proceder con Wave 3: Plan 07 (Analytics + Métricas, cards editorial + charts D-DASH-13) y Plan 08 (Configuración, settings editorial + integration cards).

Post-Wave-3: Wave 4 = Plan 09 DoD + portal sweep consolidado (incluye Select portalContainer si QA lo requiere) + push único a Vercel + activación SQL de `ui_dashboard_v2.enabled` en Somnio post-QA.

## Self-Check: PASSED

**Files verified (all modified files exist at HEAD):**
- ✅ src/app/(dashboard)/agentes/layout.tsx
- ✅ src/app/(dashboard)/agentes/components/metrics-dashboard.tsx
- ✅ src/app/(dashboard)/agentes/components/config-panel.tsx

**Commits verified (all 4 exist in git log):**
- ✅ 9a14c94 header editorial agentes/layout gated v2
- ✅ d225563 metrics-dashboard editorial gated v2
- ✅ 9b20eb5 config-panel Part A editorial gated v2
- ✅ 179a8ef config-panel Part B editorial gated v2

**TS clean:** ✅ `npx tsc --noEmit 2>&1 | grep agentes/` returns empty
**NO-TOUCH compliance:** ✅ All guarded dirs diff empty vs base
**Anti-patterns sweep:** ✅ no dark:, no slate-, no oklch outside boxShadow
**Flag-OFF byte-identical:** ✅ manual code review pass en los 3 archivos
