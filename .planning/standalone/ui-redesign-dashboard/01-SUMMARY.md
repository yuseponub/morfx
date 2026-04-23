---
phase: ui-redesign-dashboard
plan: 01
subsystem: dashboard-chrome-infrastructure
tags:
  - editorial
  - feature-flag
  - per-workspace-gate
  - regla-6
  - ui-only
  - wave-0
requirements:
  - D-DASH-01
  - D-DASH-04
  - D-DASH-05
  - D-DASH-06
  - D-DASH-07
  - D-DASH-09
  - D-DASH-10
  - D-DASH-17
dependency_graph:
  requires:
    - ui-redesign-conversaciones (shipped 2026-04-22) — aporta `.theme-editorial` tokens + `.mx-*` utilities en globals.css linea 134
    - ui-redesign-conversaciones (shipped 2026-04-22) — aporta patterns `InboxV2Provider` + `inbox-v2.ts` + `whatsapp/fonts.ts` clonados shape-for-shape
  provides:
    - getIsDashboardV2Enabled(workspaceId) — flag resolver fail-closed server-side
    - DashboardV2Provider + useDashboardV2() hook — gating client components sin prop drilling
    - src/app/(dashboard)/fonts.ts — per-segment fuentes EB Garamond + Inter + JetBrains Mono
    - .theme-editorial className wrapped conditionally en dashboard root (wave 1-4 heredan cascade)
    - Sidebar v2 prop — editorial re-skin paper-1 + ink-1 + rubric-2 + wordmark morf·x
  affects:
    - Waves 1-4 (Plans 02-08): modulos del dashboard consumen `useDashboardV2()` y heredan `.theme-editorial` cascade
    - Wave 5 (Plan 09): DoD + LEARNINGS + activación SQL snippet para Somnio
tech_stack:
  added: []
  patterns:
    - Per-segment next/font loader (mirrors whatsapp/fonts.ts — Next dedupes por hash)
    - Feature flag fail-closed via JSONB path (mirrors inbox-v2 + super-user)
    - Context + hook para propagar flag cliente sin prop drilling (mirrors InboxV2Provider)
    - cn() ternary gating — branches v2=false preservan classNames originales verbatim
key_files:
  created:
    - src/lib/auth/dashboard-v2.ts
    - src/components/layout/dashboard-v2-context.tsx
    - src/app/(dashboard)/fonts.ts
  modified:
    - src/app/(dashboard)/layout.tsx
    - src/components/layout/sidebar.tsx
decisions:
  - D-DASH-01 locked — flag path `workspaces.settings.ui_dashboard_v2.enabled`
  - D-DASH-05 locked — per-segment fonts (Next/font dedupe, no double bundle)
  - D-DASH-06 locked — sidebar editorial gated conditional, byte-identical OFF
  - D-DASH-07 observed — cero cambios a domain/hooks/agents/inngest/actions
  - D-DASH-17 observed — header.tsx NO wired a dashboard layout (no se modifica)
metrics:
  duration: ~25min
  completed_date: 2026-04-23
  tasks_completed: 4
  files_created: 3
  files_modified: 2
  lines_added: 271
  lines_removed: 23
---

# Phase ui-redesign-dashboard Plan 01: Wave 0 Infrastructure Summary

Planta infra editorial gated por flag `ui_dashboard_v2.enabled`: resolver server-side + context cliente + per-segment fonts + layout wrapper conditional `.theme-editorial` + sidebar re-skin gated. Wave 1-4 heredan cascade sin re-aplicar per módulo.

## Objective (from plan)

Wave 0 — Infrastructure foundation for the dashboard editorial re-skin (mega-fase). Plant the entire scaffolding necessary to gate 7 downstream module re-skins (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics+Métricas, Configuración) BEFORE touching any module-specific component.

## Tasks Completed

| Task | Name                                                                                                   | Commit   | Files                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------- |
| 1    | Server-side flag helper + DashboardV2 React Context provider/hook                                      | d91ca2a  | src/lib/auth/dashboard-v2.ts, src/components/layout/dashboard-v2-context.tsx |
| 2    | Per-segment fonts loader for the dashboard segment                                                     | c5183b1  | src/app/(dashboard)/fonts.ts                                          |
| 3    | Wire dashboard layout — fonts + flag resolver + conditional .theme-editorial className + DashboardV2Provider | ab6c53a  | src/app/(dashboard)/layout.tsx                                        |
| 4    | Sidebar editorial re-skin (gated by v2 prop) — paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state, serif wordmark | 7abd347  | src/components/layout/sidebar.tsx                                     |

Total: 4 atomic commits, 3 new files, 2 modified files, 271 insertions / 23 deletions.

## Verification

### Per-task acceptance criteria

**Task 1 — Flag helper + context provider**
- [x] `src/lib/auth/dashboard-v2.ts` exists
- [x] `getIsDashboardV2Enabled` exported with `workspaceId: string): Promise<boolean>` signature
- [x] Reads `workspaces.settings.ui_dashboard_v2.enabled` via `createClient()` from `@/lib/supabase/server`
- [x] Fail-closed: returns `false` on error, null settings, or missing key
- [x] Uses `ns?.enabled === true` strict boolean comparison
- [x] `src/components/layout/dashboard-v2-context.tsx` exists with `'use client'`
- [x] `DashboardV2Provider` + `useDashboardV2()` exported
- [x] `createContext<boolean>(false)` default fail-closed (Regla 6)
- [x] `npx tsc --noEmit` zero errors in new files
- [x] Inbox v2 analogs untouched (`git diff src/lib/auth/inbox-v2.ts src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` = empty)

Note: plan acceptance check `! grep -q "ui_inbox_v2" src/lib/auth/dashboard-v2.ts` is trivially unsatisfiable because the plan's specified doc comment (action block lines 279-280) intentionally references `ui_inbox_v2.enabled` when documenting D-DASH-03 "INDEPENDENT FROM ui_inbox_v2". Code lookups use only `settings.ui_dashboard_v2` (verified with `grep -n "ui_inbox_v2\|ui_dashboard_v2" src/lib/auth/dashboard-v2.ts | grep -v "^[0-9]*: \*"` → only the single correct code line). Documented as plan self-consistency (comment per spec), NOT a deviation.

**Task 2 — Per-segment fonts**
- [x] `src/app/(dashboard)/fonts.ts` exists
- [x] `ebGaramond`, `inter`, `jetbrainsMono` exported
- [x] EB Garamond has `style: ['normal', 'italic']` (italic loaded for `.mx-caption` / `.mx-marginalia`)
- [x] Variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`
- [x] Cormorant Garamond NOT loaded (plan cites UI-SPEC §6.3); mentions only appear in explanatory doc comment (matches analog `whatsapp/fonts.ts` pattern — plan self-consistency).
- [x] `whatsapp/fonts.ts` untouched
- [x] Zero TS errors

**Task 3 — Layout wire-up**
- [x] 4 new imports (`cn`, `getIsDashboardV2Enabled`, `DashboardV2Provider`, fonts)
- [x] `isDashboardV2` resolved after `activeWorkspaceId` with `activeWorkspaceId ? await getIsDashboardV2Enabled(...) : false` fail-closed
- [x] `cn(ebGaramond.variable, inter.variable, jetbrainsMono.variable, 'flex h-screen', isDashboardV2 && 'theme-editorial')` on wrapper `<div>`
- [x] `<DashboardV2Provider v2={isDashboardV2}>` wraps inner content
- [x] `v2={isDashboardV2}` forwarded to `<Sidebar>` (verified: `v2={isDashboardV2}` appears 2x = Provider + Sidebar)
- [x] All Regla 6 pieces preserved: `WorkspaceProvider`, `Sidebar`, `<main>`, `{children}`, `getUserWorkspaces`, `getActiveWorkspaceId`, `createClient`, `supabase.auth.getUser`, `redirect('/login')`, `currentWorkspace` resolution
- [x] `git diff` = 4 additions only, no deletions of auth/workspace logic

**Task 4 — Sidebar editorial gated**
- [x] `v2?: boolean` added to `SidebarProps`, `v2 = false` destructure default
- [x] Root `<aside>` conditional: v2 → `bg-[var(--paper-1)] border-[var(--ink-1)]`; OFF → `bg-card` (preserved inline)
- [x] Logo: v2 → serif wordmark `morf<span text-rubric-2>·</span>x`; OFF → `logo-light.png` + `logo-dark.png` Image tags (preserved inline)
- [x] Nav links: v2 → `rounded-[3px] text-[13px]` + active `bg-paper-3 text-ink-1 border-l-2 border-rubric-2 font-serif` + idle `text-ink-2 hover:bg-paper-2`; OFF → `bg-accent text-accent-foreground` + `text-muted-foreground hover:bg-accent` (preserved)
- [x] Badges: v2 → `bg-rubric-2 text-paper-0 font-mono`; OFF → `bg-destructive text-destructive-foreground` (preserved)
- [x] Footer avatar/email/logout: tokens editoriales vs shadcn branches, both preserved
- [x] Section borders (logo, switcher, footer): `v2 && 'border-[var(--ink-1)]'` additive
- [x] `filteredNavItems`, `useTaskBadge`, `useAutomationBadge`, `WorkspaceSwitcher`, `GlobalSearch`, `TooltipProvider`, `Avatar`, `logout` form: all preserved byte-identical (verified by grep)
- [x] Sublink (`item.subLink`) unchanged — deuda conocida documentada (D-DASH-06 mock no muestra sublink)
- [x] Zero TS errors

### Overall plan verification

- [x] `npx tsc --noEmit` zero errors in all 5 files (verified after Task 4)
- [x] `grep -n '^\.theme-editorial' src/app/globals.css` returns line 134 (UNCHANGED)
- [x] `git diff HEAD~4 HEAD -- src/app/globals.css src/lib/auth/inbox-v2.ts src/app/(dashboard)/whatsapp/fonts.ts src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` = 0 lines (inbox v2 + globals.css untouched)
- [x] `git diff HEAD~4 HEAD -- src/components/layout/{header,mobile-nav,theme-toggle,user-menu}.tsx` = 0 lines (D-DASH-17)
- [x] `grep "Header" src/app/(dashboard)/layout.tsx` → no match (Header not wired to dashboard chrome — consistent with D-DASH-17)
- [x] `git diff HEAD~4 HEAD -- src/lib/domain/ src/hooks/ src/lib/agents/ src/inngest/ src/app/actions/` = 0 lines (D-DASH-07 + Regla 3)
- [x] `git diff HEAD~4 HEAD -- src/app/(dashboard)/{crm,tareas,agentes,automatizaciones,analytics,metricas,configuracion,whatsapp}/` = 0 lines (módulos intactos, Wave 1+ los re-skinea)
- [x] Flag OFF behavior byte-identical: cada ternary en sidebar preserva OLD className en branch v2=false (verificable por `grep -q "bg-card"`, `grep -q "bg-accent text-accent-foreground"`, `grep -q "logo-light.png"`, `grep -q "logo-dark.png"`, `grep -q "bg-destructive"` — todos PASS).
- [x] Con flag OFF (default DB state), el wrapper del layout expone 3 CSS variables font inertes (`--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`) + 1 DashboardV2Context con value=false. Ningún selector CSS fuera de `.theme-editorial` consume esas variables; zero regression visual.

## Flag OFF byte-identical proof

Branch `v2=false` de cada ternary en `sidebar.tsx` preserva literalmente los classNames originales previos al plan. Ejemplos verificados por `grep`:

| OLD className (sidebar pre-plan)                                              | Preservado en rama v2=false |
| ----------------------------------------------------------------------------- | --------------------------- |
| `bg-card` (root)                                                              | ✅ grep pass               |
| `bg-accent text-accent-foreground` (nav active)                               | ✅ grep pass               |
| `text-muted-foreground hover:bg-accent hover:text-accent-foreground` (idle)   | ✅ grep pass               |
| `rounded-md text-sm font-medium`                                              | ✅ grep pass               |
| `logo-light.png` / `logo-dark.png` Image tags                                 | ✅ grep pass               |
| `bg-destructive text-destructive-foreground` (badge)                          | ✅ grep pass               |
| `bg-primary text-primary-foreground` (avatar fallback)                        | ✅ grep pass               |
| `text-sm font-medium` (email name)                                            | ✅ grep pass               |
| `text-xs text-muted-foreground` (email full)                                  | ✅ grep pass               |
| `hover:bg-accent text-muted-foreground hover:text-foreground` (logout button) | ✅ grep pass               |

Con `ui_dashboard_v2.enabled` ausente o `false` en el DB settings, el helper retorna `false`, `DashboardV2Provider` contiene `false`, `<Sidebar v2={false}>` elige la rama OFF en cada ternary → DOM output equivalente al actual. La única diferencia en el DOM son 3 `className` de CSS variables font sin consumers fuera de `.theme-editorial` (inertes).

## globals.css UNCHANGED proof

```bash
$ git diff HEAD~4 HEAD -- src/app/globals.css | wc -l
0
$ grep -n '^\.theme-editorial' src/app/globals.css
134:.theme-editorial {
315:.theme-editorial .mx-display {
324:.theme-editorial .mx-h1 {
```

El bloque `.theme-editorial` sigue en línea 134 sin alteraciones. Plan 01 de `ui-redesign-dashboard` NO crea ni modifica tokens CSS — solo wire a código existente.

## Deviations from Plan

**None** — los 4 tasks ejecutaron exactamente como estaban escritos en 01-PLAN.md.

### Notas de plan self-consistency (NO son deviations)

Dos acceptance criteria del plan eran estrictos al punto de ser triviales:
- Task 1: `! grep -q "ui_inbox_v2" src/lib/auth/dashboard-v2.ts` — el plan mismo (action block líneas 279-280) requiere que el doc comment diga "INDEPENDENT FROM `ui_inbox_v2.enabled`". El código lookup usa únicamente `settings.ui_dashboard_v2` (verificado excluyendo comentarios). Los 2 matches en el archivo son ambos dentro del comment spec'd por el plan.
- Task 2: `! grep -q "Cormorant" src/app/(dashboard)/fonts.ts` — el plan mismo (action block líneas 411-412) requiere que el comment explique "Cormorant Garamond is intentionally NOT loaded". Mismo pattern que el analog `whatsapp/fonts.ts`. Los 2 matches son ambos en el comment.

Ambos se interpretaron como plan self-consistency (el spec dicta tanto el comment como el check exclusorio). Si el siguiente reviewer prefiere ser estricto, los comments se pueden acortar para remover las menciones literales. El comportamiento del código es correcto en ambos casos.

## Auth gates

None.

## Handoff note to Waves 1-4

**La scaffold está lista.** Plans 02 (CRM), 03 (Pedidos), 04 (Tareas), 05 (Agentes), 06 (Automatizaciones), 07 (Analytics/Métricas), 08 (Configuración) pueden:

1. **Gate NEW JSX** con `useDashboardV2()` de `@/components/layout/dashboard-v2-context` (import literal path).
2. **Re-skin classNames** sin wrapper — el `.theme-editorial` cascade está activo en el layout root cuando flag ON, cubriendo todas las subrutas del dashboard segment automáticamente. No re-declarar el wrapper por módulo.
3. **Leer tokens** via CSS variables: `var(--paper-0..5)`, `var(--ink-1..4)`, `var(--rubric-1..3)`, `var(--accent-gold|verdigris|indigo)`, `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`. Todos disponibles SOLO dentro de `.theme-editorial`; fuera se ignoran.
4. **Fuentes** heredan de `src/app/(dashboard)/fonts.ts` via `<html>` font variables aplicadas al wrapper. Cada módulo usa `font-serif` / `font-mono` / default Tailwind class, o `style={{ fontFamily: 'var(--font-display|serif|sans|mono)' }}` si necesita token específico.
5. **NO duplicar `.theme-editorial`** — el cascade single-source-of-truth está en el layout root. Wrappers internos son antipattern.

## Activación QA (Plan 09 — referencia, NO aplicar ahora)

Post-cierre de todos los módulos + DoD pass en Plan 09, activar en Somnio:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb,
  true
)
WHERE id = '<somnio-uuid>';
```

Antes de ese punto, ningún workspace debe tener el flag ON (Regla 6 — agente productivo intacto hasta activación explícita).

## Known deuda / deferrals

- **Sublink editorial** (D-DASH-06 mock no muestra sublink) — deferred. Si en Wave 1+ resulta visible en flag ON, apply `v2` gating.
- **Header.tsx / mobile-nav.tsx / theme-toggle.tsx / user-menu.tsx** (D-DASH-17) — no están wired al layout actual del dashboard; preservados. Si una fase futura los conecta, ahí se re-skinean.
- **Routes out-of-scope bajo `.theme-editorial` cascade con flag ON** (D-DASH-04) — `/super-admin`, `/sandbox`, `/onboarding` pueden romperse visualmente en flag ON. Mitigación documentada: agregar `[data-theme-override="slate"]` en layouts futuros si se detectan issues de QA.
- **Routes `/login`, `/create-workspace`, etc.** — viven fuera de `(dashboard)/` y NO reciben el cascade. No affectadas.

## Self-Check: PASSED

Files verificados existentes:
- `src/lib/auth/dashboard-v2.ts` ✅
- `src/components/layout/dashboard-v2-context.tsx` ✅
- `src/app/(dashboard)/fonts.ts` ✅
- `src/app/(dashboard)/layout.tsx` ✅ (modified)
- `src/components/layout/sidebar.tsx` ✅ (modified)

Commits verificados en git log:
- d91ca2a ✅
- c5183b1 ✅
- ab6c53a ✅
- 7abd347 ✅
