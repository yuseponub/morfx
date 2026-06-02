---
phase: ui-redesign-dashboard
plan: 05
type: execute
wave: 2
depends_on: ['01']
files_modified:
  - src/app/(dashboard)/agentes/layout.tsx
  - src/app/(dashboard)/agentes/components/metrics-dashboard.tsx
  - src/app/(dashboard)/agentes/components/config-panel.tsx
autonomous: true
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-11
  - D-DASH-14
  - D-DASH-15
  - D-DASH-16

must_haves:
  truths:
    - "Cuando `useDashboardV2()===true`, `agentes/layout.tsx` renderiza un header editorial con: eyebrow `mx-smallcaps` color `var(--rubric-2)` texto `'Módulo · Automatización'` (con medium-dot U+00B7), h1 `mx-display`-style 30px serif `'Agentes'` + meta inline em sans 16px ink-3 (mock `agentes.html` topbar líneas 26-30), y dos tabs underlined ('Dashboard' / 'Configuracion') con border-bottom 2px ink-1 cuando active + smallcaps rubric-2 hover (D-DASH-16, mock líneas 42-44). El `<Bot>` icon avatar circle se elimina cuando v2 (no aparece en mock topbar)."
    - "Cuando `useDashboardV2()===false`, el header actual de `agentes/layout.tsx` (avatar Bot icon + h1 'Agentes' + p subtitle + tabs con `border-primary text-primary bg-background` shadcn) se preserva byte-identical."
    - "Cuando v2 + `metrics-dashboard.tsx`: las 9 metric cards (3 grupos × 3) renderan como `<Card>` editorial con bg `var(--paper-0)` + border 1px `var(--ink-1)` + box-shadow `0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)` (mock `.agent-card` líneas 57-61, copiado verbatim per D-DASH-08). Headers smallcaps rubric-2 10px tracking-0.14em uppercase (mock `.agent-stats .l` patrón). Number serif `var(--font-display)` weight 700 size 30px tabular-nums color ink-1 (mock `.stat .n` línea 80). Description font-serif 12px italic color ink-3."
    - "Cuando v2 + group title de `MetricGroup`: usa `mx-smallcaps` rubric-2 11px tracking-0.14em uppercase (NO `text-sm font-medium text-muted-foreground uppercase tracking-wide`). Mock equivalente: `.cat` sidebar líneas 22-23."
    - "Cuando v2 + period selector (Hoy / 7 dias / 30 dias): renderea como chips editorial pattern del mock líneas 53-54 (`.chip` + `.chip.on`). Chip activo bg `var(--ink-1)` color `var(--paper-0)` border ink-1 font-weight 600; chip inactivo bg `var(--paper-0)` border `var(--border)` color `var(--ink-2)`. NO usar `bg-muted rounded-lg` ni `bg-background shadow-sm` shadcn variant."
    - "Cuando v2 + loading skeleton de cada card: usa `bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]` (keyframe ya existe desde fase ui-redesign-conversaciones — verificable en globals.css). NO `bg-muted animate-pulse rounded`."
    - "Cuando v2 + `config-panel.tsx` Section 1 (agent_enabled toggle): se re-skinea como `<Card>` editorial paper-2 + border ink-1 con `<Switch>` shadcn intacto + status pill editorial `mx-tag mx-tag--verdigris` ('● Activo') o `mx-tag mx-tag--ink` ('Pausado') al lado del switch (D-DASH-15, mock `.agent-status` líneas 67-71). Avatar Bot circle se preserva pero re-styleado paper-2 + border ink-1 + serif (mock `.agent-avatar` líneas 62-63)."
    - "Cuando v2 + Sections 2-3 (Select conversational + CRM agents): los `<Card>` headers usan smallcaps rubric-2 10px tracking-0.14em uppercase para CardTitle (D-DASH-14 forms editorial labels). El `<Select>` shadcn trigger se re-skinea con paper-0 bg + border ink-1 + rounded-[3px] + focus ring ink-1 (NO `border-input bg-background ring-ring`). Las descripciones (`CardDescription`) usan `var(--font-serif)` 13px italic ink-3 (mock `.agent-desc` líneas 72-73)."
    - "Cuando v2 + Section 4 (handoff_message Textarea): el textarea usa `font-family: var(--font-mono)` (D-DASH-08 spec mock prompt-preview pattern adaptado a editor activo) o alternativamente `var(--font-serif)` 14px line-height 1.55 — usar mono para handoff porque es texto sin formato editable; paper-0 bg + border ink-1 + rounded-[3px] + 12px padding (mock `.composer textarea` líneas 168-172). Label CardTitle smallcaps rubric-2."
    - "Cuando v2 + Sections 5-6 (timer preset + response speed): los button cards de presets renderean como editorial selectable cards: bg `var(--paper-0)` border 1px `var(--border)` cuando inactive; bg `var(--paper-0)` border 1px `var(--ink-1)` + shadow `0 1px 0 var(--ink-1)` + color ink-1 cuando active (NO `border-primary bg-primary/5 text-primary` shadcn). Label preset font-display serif 14px weight 600; description font-mono 11px ink-3."
    - "Cuando v2 + saving indicator: usa `mx-mono` 11px ink-3 con texto 'Guardando…' (U+2026 ellipsis NO three dots) en lugar de `text-sm text-muted-foreground` con `Save` icon animate-pulse. Preserva el icono `Save` lucide pero coloreado ink-3."
    - "Cuando v2 + loading state inicial (config null): renderea 6 skeleton cards (uno por sección) cada uno bg `var(--paper-2)` border `var(--border)` h-[120px] animate-[mx-pulse_1.5s_ease-in-out_infinite]. NO `<Loader2 spin>`."
    - "Cero cambios funcionales en server actions, hooks, fetchAgentMetrics, getAgentConfig, updateAgentConfig, AGENT_CATALOG, TIMER_PRESETS/SPEED_PRESETS values, debounce timers, optimistic state updates, toast.error handling, Switch/Select primitives shadcn, MetricsPeriod / AgentMetrics / AgentConfig types (D-DASH-07)."
    - "NO se toca `src/lib/agents/**`, `src/app/actions/agent-config.ts`, `src/app/actions/agent-metrics.ts`, `src/lib/agents/production/metrics.ts`, `src/lib/agents/production/agent-config.ts`, `src/lib/agents/agent-catalog.ts` — verificable con git diff (Regla 6 + D-DASH-07)."
    - "NO se crea agent cards listing, prompt editor, guardrails section, knowledge base section, sandbox/inspector — el módulo `/agentes` actual es admin de UN solo agente conversacional con metrics + config; el mock `agentes.html` representa estado futuro con catálogo multi-agente. La adaptación pixel-perfect aplica los patrones del mock (paper-0/ink-1/serif numbers/smallcaps eyebrows) a las superficies que SÍ existen (per D-DASH-08 'features no representadas en el mock se preservan como están con adaptación mínima de tokens')."
    - "Cross-link a Plan 07: las 9 metric cards de este módulo son preview del pattern de cards que Plan 07 (Analytics) refinará — si Plan 07 introduce sub-componente `<EditorialMetricCard>` compartido, se hace refactor en milestone post-cierre. Esta fase mantiene las cards inline en metrics-dashboard.tsx."
    - "Build pasa: `npx tsc --noEmit` clean en los 3 archivos modificados; con flag OFF git diff de la rama main muestra cambios SOLO en estos 3 archivos in-scope."
  artifacts:
    - path: "src/app/(dashboard)/agentes/layout.tsx"
      provides: "Header editorial gated (eyebrow Módulo · Automatización + h1 display + tabs underlined)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx"
      provides: "9 metric cards editorial paper-0/ink-1 + period selector chips + group titles smallcaps + serif numbers grandes"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/agentes/components/config-panel.tsx"
      provides: "6 config sections editorial: agent toggle + status pill, conversational select, CRM switches, handoff mono textarea, timer/speed preset cards, editorial saving indicator"
      contains: "useDashboardV2"
  key_links:
    - from: "src/app/(dashboard)/agentes/layout.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook (Plan 01 output)"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/agentes/components/config-panel.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx"
      to: "src/app/actions/agent-metrics.ts"
      via: "fetchAgentMetrics call (UNCHANGED, Regla 6 NO-TOUCH)"
      pattern: "fetchAgentMetrics\\("
    - from: "src/app/(dashboard)/agentes/components/config-panel.tsx"
      to: "src/app/actions/agent-config.ts"
      via: "getAgentConfig + updateAgentConfig calls (UNCHANGED, Regla 6 NO-TOUCH)"
      pattern: "(getAgentConfig|updateAgentConfig)\\("
---

<objective>
Wave 2 — Re-skin del módulo `/agentes`: layout (header editorial + tabs underlined), metrics dashboard (9 cards paper-0/ink-1 + period chips + serif numbers grandes), y config panel (6 sections con toggle+pill, select editorial, mono textarea handoff, preset cards selectables). Todo gated por `useDashboardV2()` (de Plan 01) — flag-OFF byte-identical.

**Purpose:** Llevar el módulo de agentes al lenguaje editorial del handoff v2.1. El módulo actual es un admin compacto de UN agente conversacional (no el catálogo multi-agente del mock `agentes.html`); la adaptación aplica los patrones del mock (paper-0/ink-1, serif display numbers, smallcaps eyebrows, mx-tag status pills, font-mono editor surfaces) a las superficies que SÍ existen — per D-DASH-08, features no representadas en el mock se preservan con adaptación mínima de tokens. UI-only puro per D-DASH-07: cero cambios a server actions, hooks, agent registry, AI SDK, prompt builders.

**Output:** 3 archivos re-skineados (layout + 2 components). Header eyebrow + h1 + tabs underlined renderean SOLO cuando flag ON. Metric cards usan box-shadow editorial + serif numbers grandes SOLO cuando flag ON. Config sections usan smallcaps labels + mono textarea + preset cards editorial SOLO cuando flag ON. Cuando flag OFF, todo render byte-identical a hoy. Build clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md

# Mock fuente de verdad (D-DASH-08):
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/agentes.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css

# Plan 01 outputs (asumidos shipped en Wave 0 — verificar antes de empezar):
@src/components/layout/dashboard-v2-context.tsx
@src/lib/auth/dashboard-v2.ts

# Reference pattern (ya shipped — replicar gating + structure):
@src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx

# Source files in scope:
@src/app/(dashboard)/agentes/layout.tsx
@src/app/(dashboard)/agentes/components/metrics-dashboard.tsx
@src/app/(dashboard)/agentes/components/config-panel.tsx

# Server actions UNCHANGED (read-only refs):
@src/app/actions/agent-metrics.ts
@src/app/actions/agent-config.ts

<interfaces>
<!-- From Plan 01 (Wave 0) — assumed shipped. Verify hook signature before consuming: -->

`useDashboardV2()` hook (analogue to `useInboxV2()`):
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider (fail-closed per D-DASH-01)
```

`.theme-editorial` CSS scope (already in globals.css from ui-redesign-conversaciones Wave 0) provides:
- `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament` utilities
- `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}` utilities
- `@keyframes mx-pulse` (used for skeletons)
- All shadcn token overrides under `.theme-editorial` wrapper (--background → paper-1, --primary → ink-1, etc.)

<!-- Existing types (preserve, do NOT modify): -->
```typescript
// from src/lib/agents/production/metrics.ts (NO TOUCH)
export type MetricsPeriod = 'today' | '7d' | '30d'
export interface AgentMetrics {
  totalConversations: number
  ordersCreated: number
  conversionRate: number
  handoffsCount: number
  resolvedWithoutHumanPct: number
  avgResponseTimeMs: number
  totalTokens: number
  costPerConversation: number
  totalCost: number
}

// from src/lib/agents/production/agent-config.ts (NO TOUCH)
export interface AgentConfig {
  workspace_id: string
  agent_enabled: boolean
  conversational_agent_id: string
  crm_agents_enabled: Record<string, boolean>
  handoff_message: string
  timer_preset: 'real' | 'rapido' | 'instantaneo'
  response_speed: number  // 1.0 | 0.2 | 0.0
  created_at: string
  updated_at: string
}

// from src/lib/agents/agent-catalog.ts (NO TOUCH)
export const AGENT_CATALOG: Array<{ id: string; name: string; description: string }>
```

`MetricsDashboard` props (preserve):
```typescript
interface MetricsDashboardProps {
  initialMetrics: AgentMetrics
}
```

`ConfigPanel` is a no-props component (loads config on mount via getAgentConfig server action — UNCHANGED).
</interfaces>

<!-- Mock token reference (from agentes.html lines 56-83 + colors_and_type.css):
- agent-card box-shadow: `0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)`
- stat .n: font-display 22px weight 700 line-height 1 tabular-nums color ink-1 (use 30px for OUR cards — bigger surface, mock card is denser)
- stat .l: font-sans 9px weight 600 letter-spacing 0.1em uppercase color ink-3
- chip: font-sans 12px padding 4px 10px border-radius 999px border 1px var(--border) color ink-2 bg paper-0
- chip.on: bg ink-1 color paper-0 border ink-1 weight 600
- agent-status.on: color verdigris (use --semantic-success token mapped) border verdigris bg color-mix verdigris 8% paper-0
- composer textarea: border ink-1 paper-1 padding 10px 12px font-serif 14px line-height 1.5 rounded-[var(--radius-3)]
-->
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin agentes/layout.tsx — editorial header (eyebrow + h1 display + tabs underlined per D-DASH-16)</name>
  <files>src/app/(dashboard)/agentes/layout.tsx</files>
  <read_first>
    - src/app/(dashboard)/agentes/layout.tsx (full 73 LOC actual)
    - src/components/layout/dashboard-v2-context.tsx (Plan 01 output — verificar `useDashboardV2` signature)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/agentes.html líneas 26-44 (topbar + tabs)
    - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx (analogue para entender pattern de provider)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/agentes/layout.tsx`. Add `useDashboardV2` import + branch header rendering.

    **Step 1 — Add import:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```
    (Verifica el path exacto leyendo Plan 01 output. Si Plan 01 ubicó el hook en otro path — ej. `@/lib/dashboard-v2`, `@/components/dashboard-v2-context` — usa ese path. El nombre del hook DEBE ser `useDashboardV2`.)

    **Step 2 — Inside `AgentesLayout` component body, después del `usePathname()` call:**
    ```typescript
    const v2 = useDashboardV2()
    ```

    **Step 3 — Branch el header block (líneas 23-62 actuales).** Wrap con `{v2 ? (<EditorialHeader />) : (<CurrentHeader />)}` patrón. Para minimizar diff y evitar extracción de subcomponentes, usar dos branches inline gated con `{v2 && (...)}` y `{!v2 && (...)}`.

    **Editorial branch (cuando `v2 === true`)** — debe renderizar:
    ```tsx
    {v2 && (
      <div className="border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
        <div className="container px-7 pt-[18px] pb-[14px]">
          <span
            className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Módulo · Automatización
          </span>
          <h1
            className="mt-[2px] text-[30px] font-bold leading-[1.1] tracking-[-0.015em] text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Agentes
            <em
              className="not-italic ml-2 text-[16px] font-normal text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              · Métricas y configuración
            </em>
          </h1>

          {/* Tabs underlined per D-DASH-16 */}
          <div className="flex gap-5 mt-4" role="tablist">
            {tabs.map((tab) => {
              const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="tab"
                  aria-selected={isActive}
                  className={cn(
                    'pb-[10px] text-[13px] transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-1)]',
                    isActive
                      ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                      : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
                  )}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    )}
    ```

    **Notas críticas del editorial branch:**
    - U+00B7 medium dot (`·`) en eyebrow — NO normal period.
    - U+00B7 también en `· Métricas y configuración` inline em.
    - El icono `<Bot>` circle se ELIMINA en v2 (no aparece en mock topbar — sería redundante con la sidebar `Agentes` link active state).
    - Los tabs NO usan icons cuando v2 (mock líneas 42-44 muestran tabs sin icons — solo texto + underline). Si la versión actual del codebase muestra icons en tabs (`Icon` import), DESACOPLA solo cuando v2; preserva en `!v2`.
    - `gap-5` (20px) entre tabs según mock línea 42.
    - `pb-[10px]` para que el border-bottom 2px coincida con el border-bottom del container (no se duplique visualmente).

    **`!v2` branch** — preserva el header actual byte-identical envuelto en `{!v2 && (<div className="border-b bg-card">...</div>)}`. Cero cambios al markup existente.

    **Step 4 — Preserve content wrapper (líneas 65-71):** El `<div className="flex-1 overflow-auto"><div className="container py-6 px-6">{children}</div></div>` se preserva intacto en AMBOS branches. NO se gatea.

    **DO NOT MODIFY (D-DASH-07 + Regla 6):**
    - `tabs` array shape (preserve exact href values + labels — solo el rendering visual cambia)
    - `usePathname()` hook + active-tab logic
    - `<Link>` import + `cn` import
    - El children render
    - Cualquier server-side data fetching (este es 'use client' puro)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" "src/app/(dashboard)/agentes/layout.tsx" && grep -q "Módulo · Automatización" "src/app/(dashboard)/agentes/layout.tsx" && grep -q 'border-b border-\[var(--ink-1)\]' "src/app/(dashboard)/agentes/layout.tsx" && grep -q 'role="tab"' "src/app/(dashboard)/agentes/layout.tsx" && grep -q 'aria-selected' "src/app/(dashboard)/agentes/layout.tsx" && grep -q 'usePathname' "src/app/(dashboard)/agentes/layout.tsx" && ! grep -q 'oklch(' "src/app/(dashboard)/agentes/layout.tsx" && npx tsc --noEmit 2>&1 | grep "agentes/layout" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/(dashboard)/agentes/layout.tsx` (hook imported + invocado).
    - `grep -q "Módulo · Automatización" src/app/(dashboard)/agentes/layout.tsx` (eyebrow con U+00B7 medium-dot).
    - `grep -q "var(--font-display)" src/app/(dashboard)/agentes/layout.tsx` (h1 usa display font).
    - `grep -q "border-b border-\[var(--ink-1)\]" src/app/(dashboard)/agentes/layout.tsx` (header bottom hard rule per UI editorial).
    - `grep -q "border-b-2 border-\[var(--ink-1)\]" src/app/(dashboard)/agentes/layout.tsx` (tab activa underline 2px).
    - `grep -q 'role="tab"' src/app/(dashboard)/agentes/layout.tsx`.
    - El archivo STILL contiene `usePathname` + `tabs` array + `<Link>` + `cn` (Regla 6 — preservación de behavior).
    - `! grep -q "oklch(" src/app/(dashboard)/agentes/layout.tsx` (no hardcoded OKLCH — usar `var(--*)`).
    - `npx tsc --noEmit` reporta cero errores en `agentes/layout.tsx`.
  </acceptance_criteria>
  <done>Layout header editorial cuando flag ON: eyebrow rubric-2 + h1 display 30px + tabs underlined ink-1. Cuando flag OFF, header actual byte-identical (avatar Bot + h1 bold + p subtitle + tabs shadcn). Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin metrics-dashboard.tsx — 9 cards editorial (paper-0/ink-1/shadow-stamp/serif numbers) + chips period selector + smallcaps group titles + mx-pulse skeletons</name>
  <files>src/app/(dashboard)/agentes/components/metrics-dashboard.tsx</files>
  <read_first>
    - src/app/(dashboard)/agentes/components/metrics-dashboard.tsx (full 239 LOC)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/agentes.html líneas 56-85 (.agent-card + .agent-stats patterns) + 53-54 (.chip + .chip.on)
    - src/components/ui/card.tsx (verify Card/CardHeader/CardContent/CardTitle re-styling via .theme-editorial — NO modificar)
    - .planning/standalone/ui-redesign-conversaciones/02-PLAN.md líneas 256-262 (mx-pulse skeleton pattern)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/agentes/components/metrics-dashboard.tsx`. Tres cambios principales: (a) period selector chips, (b) `MetricGroup` títulos smallcaps + cards editorial + serif numbers, (c) loading skeletons mx-pulse.

    **Step 1 — Add import:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```

    **Step 2 — Inside `MetricsDashboard` component body, primer línea después de `useState`/`useTransition`:**
    ```typescript
    const v2 = useDashboardV2()
    ```

    **Step 3 — Branch period selector (líneas 196-214 actuales).** El bloque actual es:
    ```tsx
    <div className="flex justify-end">
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        {periods.map((p) => (<Button variant="ghost" ...>{p.label}</Button>))}
      </div>
    </div>
    ```

    Wrap con condicional. Editorial branch (v2):
    ```tsx
    {v2 ? (
      <div className="flex justify-end">
        <div className="flex gap-2">
          {periods.map((p) => {
            const isActive = period === p.value
            return (
              <button
                key={p.value}
                type="button"
                disabled={isPending}
                onClick={() => handlePeriodChange(p.value)}
                className={cn(
                  'px-[10px] py-1 rounded-full border text-[12px] transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isActive
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)] font-semibold'
                    : 'bg-[var(--paper-0)] text-[var(--ink-2)] border-[var(--border)] font-medium hover:bg-[var(--paper-2)]'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>
    ) : (
      // Preserve current shadcn pill bar verbatim
      <div className="flex justify-end">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {periods.map((p) => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => handlePeriodChange(p.value)}
              className={cn('rounded-md', period === p.value && 'bg-background shadow-sm')}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    )}
    ```

    **Step 4 — Refactor `MetricGroup` para aceptar `v2` prop.** Cambia signature:
    ```typescript
    function MetricGroup({
      title,
      cards,
      metrics,
      loading,
      v2,
    }: {
      title: string
      cards: MetricCardDef[]
      metrics: AgentMetrics
      loading: boolean
      v2: boolean
    }) { ... }
    ```

    Pasa `v2={v2}` desde los 3 sitios donde `<MetricGroup>` se invoca.

    **Step 5 — Inside MetricGroup, branch el group title (líneas 138-140 actuales):**
    ```tsx
    {v2 ? (
      <h3
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {title}
      </h3>
    ) : (
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
    )}
    ```

    **Step 6 — Branch cada Card render (líneas 142-167 actuales).** El refactor más extenso. Editorial branch:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-0)] flex flex-col"
        style={{
          boxShadow: '0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)',
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[var(--border)]">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {card.title}
          </span>
          <Icon className="h-[14px] w-[14px] text-[var(--ink-3)]" aria-hidden />
        </div>
        <div className="px-4 py-4 flex-1">
          {loading ? (
            <div
              className="h-9 w-24 bg-[var(--paper-2)]"
              style={{ animation: 'mx-pulse 1.5s ease-in-out infinite' }}
            />
          ) : (
            <>
              <div
                className="text-[30px] font-bold leading-none text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}
              >
                {card.getValue(metrics)}
              </div>
              {card.description && (
                <p
                  className="text-[12px] italic text-[var(--ink-3)] mt-2"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {card.description}
                </p>
              )}
            </>
          )}
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical
      <Card key={card.title}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {card.title}
          </CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-bold">{card.getValue(metrics)}</div>
              {card.description && (
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )}
    ```

    **CRÍTICO — el `key={card.title}` en `<article>` no aplica directamente porque el wrapping ternary no preserva el key del map. Solución: mantener el key en el contenedor del map (el ternary completo va dentro del `cards.map((card) => { ... return ( <Fragment key={card.title}>{ternary}</Fragment> ) })` o simplemente pasar key tanto al `<article>` como al `<Card>` y dejar que React resuelva el key del root element retornado).**

    Recommendation: refactor el map para que retorne directamente el ternary cuyo root tiene el key:
    ```tsx
    {cards.map((card) => {
      const Icon = card.icon
      return v2 ? (
        <article key={card.title} ...>...</article>
      ) : (
        <Card key={card.title}>...</Card>
      )
    })}
    ```

    **Step 7 — Verifica que `keyframes mx-pulse` exista en globals.css.** Si NO existe (por algún motivo no shipeó desde fase ui-redesign-conversaciones), add una tarea blocker: agregar a globals.css fuera del scope `.theme-editorial`:
    ```css
    @keyframes mx-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    ```
    (Verificar primero con `grep -q "@keyframes mx-pulse" src/app/globals.css`. Si existe — no tocar; si no existe — agregar al final del file. Cero impacto en flag-OFF — keyframes no aplicados sin la animation rule.)

    **DO NOT MODIFY (D-DASH-07 + Regla 6):**
    - `fetchAgentMetrics` import + invocación
    - `getMetricsByPeriod` server action (no se invoca aquí pero es la fuente de `initialMetrics`)
    - `AgentMetrics` / `MetricsPeriod` types
    - `periods` array, `conversationCards`, `handoffCards`, `costCards` definitions (cambiar el rendering pero NO el data)
    - `useState`/`useTransition` hooks
    - `handlePeriodChange` logic
    - `card.getValue(metrics)` formatting (toLocaleString, toFixed, 1M/1K abbreviations)
    - El order de los 3 grupos rendered
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'border border-\[var(--ink-1)\] bg-\[var(--paper-0)\]' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'var(--font-display)' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'tabular-nums' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'mx-pulse' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'rounded-full border' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'fetchAgentMetrics' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q 'useTransition' "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && grep -q '@keyframes mx-pulse' "src/app/globals.css" && npx tsc --noEmit 2>&1 | grep "metrics-dashboard" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/(dashboard)/agentes/components/metrics-dashboard.tsx`.
    - `grep -q 'border border-\[var(--ink-1)\] bg-\[var(--paper-0)\]' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (cards editorial container).
    - `grep -q 'boxShadow.*0 1px 0 var(--ink-1)' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (shadow-stamp del mock línea 59).
    - `grep -q 'var(--font-display)' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (number serif).
    - `grep -q 'fontVariantNumeric.*tabular-nums' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (numbers tabular per mock línea 80).
    - `grep -q 'tracking-\[0.12em\]' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (smallcaps card title).
    - `grep -q 'tracking-\[0.14em\]' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (smallcaps group title).
    - `grep -q 'mx-pulse' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (skeleton animation).
    - `grep -q 'rounded-full border' src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (period chips).
    - `grep -q '@keyframes mx-pulse' src/app/globals.css` (keyframe disponible — agregar si falta).
    - El archivo STILL contiene: `fetchAgentMetrics`, `useTransition`, `handlePeriodChange`, todas las 3 invocaciones de `<MetricGroup>` con sus 3 grupos, `card.getValue(metrics)` (Regla 6 NO-TOUCH).
    - `! grep -q "border-primary" src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` en branches editorial — el shadcn `border-primary` solo en `!v2`.
    - `npx tsc --noEmit` reporta cero errores en `metrics-dashboard.tsx`.
  </acceptance_criteria>
  <done>9 metric cards editorial cuando flag ON: paper-0 + ink-1 border + shadow-stamp + serif numbers grandes (30px tabular-nums) + smallcaps card titles + serif italic descriptions. Period selector usa chips paper-0/ink-1 fill activo. Group titles smallcaps rubric-2. Skeletons usan mx-pulse. Cuando flag OFF, todo render byte-identical (shadcn Card + bg-muted skeleton + Button variant=ghost chips). Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin config-panel.tsx Part A — agent toggle Card + status pill (D-DASH-15) + Sections 2-3 (Select editorial + CRM agents) + saving indicator</name>
  <files>src/app/(dashboard)/agentes/components/config-panel.tsx</files>
  <read_first>
    - src/app/(dashboard)/agentes/components/config-panel.tsx (full 353 LOC — focus en líneas 156-256: Sections 1, 2, 3 + saving indicator líneas 158-163)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/agentes.html líneas 62-71 (.agent-avatar + .agent-status pattern), 95-119 (.cfg-hd + .cfg-row + .cfg-sect summary patterns para CardHeader smallcaps)
    - src/components/ui/select.tsx (verify Select primitive, NO modificar — token override via .theme-editorial cascade)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/agentes/components/config-panel.tsx`. Re-skin las primeras 3 sections + saving indicator. Las Sections 4-6 quedan para Task 4.

    **Step 1 — Add import:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```

    **Step 2 — Inside `ConfigPanel` component body, primer línea después del último `useState`/`useEffect` del config loader:**
    ```typescript
    const v2 = useDashboardV2()
    ```

    **Step 3 — Branch loading state (líneas 147-153 actuales).** El `<Loader2 spin>` se reemplaza con 6 skeleton cards cuando v2:
    ```tsx
    if (isLoading || !config) {
      return v2 ? (
        <div className="max-w-3xl space-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--paper-2)] border border-[var(--border)] h-[120px]"
              style={{ animation: 'mx-pulse 1.5s ease-in-out infinite' }}
              aria-hidden
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )
    }
    ```

    **Step 4 — Branch saving indicator (líneas 158-163).** Editorial branch:
    ```tsx
    {isSaving && (
      v2 ? (
        <div
          className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <Save className="h-3 w-3 animate-pulse text-[var(--ink-3)]" aria-hidden />
          Guardando…
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Save className="h-3 w-3 animate-pulse" />
          Guardando...
        </div>
      )
    )}
    ```
    NOTA: editorial usa `Guardando…` (U+2026 ellipsis), shadcn preserva `Guardando...` (3 dots) byte-identical.

    **Step 5 — Branch Section 1 (líneas 166-192, agent_enabled toggle Card).** Para cada `<Card>` que se re-skinea, pattern: wrap con `{v2 ? (<EditorialCard>...</EditorialCard>) : (<Card>...</Card>)}` con el `<Card>` actual preservado byte-identical en `!v2`.

    Editorial branch para Section 1:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-2)] p-6"
        style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div
              className={cn(
                'h-10 w-10 grid place-items-center border flex-shrink-0',
                config.agent_enabled
                  ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--rubric-2)]'
                  : 'bg-[var(--paper-2)] border-[var(--ink-3)] text-[var(--ink-3)]'
              )}
            >
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="text-[16px] font-semibold leading-tight text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Agente activo
              </h3>
              <p
                className="mt-1 text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {config.agent_enabled
                  ? 'El agente esta procesando mensajes de WhatsApp'
                  : 'El agente esta desactivado. Los mensajes no seran procesados automaticamente.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span
              className={cn('mx-tag', config.agent_enabled ? 'mx-tag--verdigris' : 'mx-tag--ink')}
              aria-label={config.agent_enabled ? 'Estado activo' : 'Estado pausado'}
            >
              {config.agent_enabled ? '● Activo' : '◐ Pausado'}
            </span>
            <Switch checked={config.agent_enabled} onCheckedChange={handleToggleAgent} />
          </div>
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical
      <Card>
        <CardHeader>
          {/* ... líneas 167-191 actuales sin tocar ... */}
        </CardHeader>
      </Card>
    )}
    ```

    **Step 6 — Branch Section 2 (líneas 194-229, conversational agent Select Card).** Editorial branch:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
        style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
      >
        <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Agente Conversacional
            </h3>
          </div>
          <p
            className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            El agente que maneja las conversaciones de WhatsApp. Detecta intenciones, captura datos y ofrece promos.
          </p>
        </header>
        <div className="px-6 py-5">
          <Select value={config.conversational_agent_id} onValueChange={handleSelectAgent}>
            <SelectTrigger
              className="w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] rounded-[3px] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <SelectValue placeholder="Seleccionar agente" />
            </SelectTrigger>
            <SelectContent>
              {AGENT_CATALOG.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex flex-col">
                    <span>{agent.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {AGENT_CATALOG.find((a) => a.id === config.conversational_agent_id) && (
            <p
              className="text-[12px] italic text-[var(--ink-3)] mt-3"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {AGENT_CATALOG.find((a) => a.id === config.conversational_agent_id)?.description}
            </p>
          )}
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical
      <Card>...</Card>
    )}
    ```

    **NOTA SOBRE SELECT PORTAL (D-DASH-09 + D-DASH-10):** El `<SelectContent>` de shadcn renderiza via Radix Portal al `document.body` por default. El theme `.theme-editorial` está en el wrapper del `(dashboard)/layout.tsx` (Plan 01) — los portales SÍ heredan tokens via CSS variables propagadas si Plan 01 las define en `:root` o si shadcn token overrides están en globals.css scope global (NO sólo dentro de `.theme-editorial`).

    **VERIFICACIÓN PRE-EJECUCIÓN (T3):** Ejecutar `grep -A 5 "\.theme-editorial" src/app/globals.css | head -30` para confirmar dónde están los token overrides. Si están scoped a `.theme-editorial { --background: var(--paper-1); ... }`, el SelectContent NO heredará y aparecerá slate dentro del tema. Mitigación opcional: añadir `data-portal-container` prop o usar `portalContainer` prop si el primitive lo soporta (D-DASH-09 — extensión aditiva BC). Si no lo soporta, ANOTAR como deuda en Plan 09 DoD y dejar que el dropdown use bg shadcn default — el trigger SÍ se ve editorial, el dropdown momentáneamente slate. NO bloquea Plan 05.

    Si hay tiempo y `<SelectContent>` ya acepta `portalContainer` (verifica leyendo `src/components/ui/select.tsx`), pasa `portalContainer={portalRef.current}` con un ref al wrapper del tema. Si no acepta, ANOTAR en `<output>` summary.

    **Step 7 — Branch Section 3 (líneas 231-256, CRM agents Card).** Editorial branch:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
        style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
      >
        <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Agentes CRM
            </h3>
          </div>
          <p
            className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Agentes que ejecutan acciones en el CRM automaticamente cuando el agente conversacional lo solicita.
          </p>
        </header>
        <div className="px-6 py-4 space-y-3">
          {CRM_AGENTS.map((agent) => {
            const enabled = config.crm_agents_enabled[agent.id] ?? false
            return (
              <div
                key={agent.id}
                className="flex items-start justify-between gap-4 py-2 border-b border-dotted border-[var(--border)] last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[14px] font-semibold text-[var(--ink-1)]"
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      {agent.name}
                    </span>
                    <span
                      className={cn('mx-tag', enabled ? 'mx-tag--verdigris' : 'mx-tag--ink')}
                      aria-label={enabled ? 'Activo' : 'Inactivo'}
                    >
                      {enabled ? '● Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-[12px] italic text-[var(--ink-3)] leading-[1.5]"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {agent.description}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => handleToggleCrmAgent(agent.id, checked)}
                />
              </div>
            )
          })}
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical
      <Card>...</Card>
    )}
    ```

    **DO NOT MODIFY (D-DASH-07 + Regla 6):**
    - `getAgentConfig` / `updateAgentConfig` server actions
    - `AGENT_CATALOG`, `CRM_AGENTS` constants (preservar shape, solo cambiar rendering)
    - `useState`/`useEffect`/`useRef`/`useCallback` hooks
    - `saveConfig`, `handleToggleAgent`, `handleSelectAgent`, `handleToggleCrmAgent`, `handleHandoffChange`, `handleSelectPreset`, `handleSelectSpeed` — TODAS las callbacks intactas
    - Optimistic update logic (prev state + revert on error)
    - `toast.error` calls
    - Debounce timer logic (handoffTimerRef)
    - `<Switch>` y `<Select>` primitives (solo className override del trigger)
    - Sections 4, 5, 6 markup (Task 4)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'mx-tag mx-tag--verdigris' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'mx-tag mx-tag--ink' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'mx-pulse' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'getAgentConfig' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'updateAgentConfig' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'handleToggleAgent' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'handleToggleCrmAgent' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'AGENT_CATALOG' "src/app/(dashboard)/agentes/components/config-panel.tsx" && npx tsc --noEmit 2>&1 | grep "config-panel" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/(dashboard)/agentes/components/config-panel.tsx`.
    - `grep -q 'mx-tag mx-tag--verdigris' src/app/(dashboard)/agentes/components/config-panel.tsx` (status pill activo).
    - `grep -q 'mx-tag mx-tag--ink' src/app/(dashboard)/agentes/components/config-panel.tsx` (status pill inactivo/pausado).
    - `grep -q 'border border-\[var(--ink-1)\] bg-\[var(--paper-2)\]' src/app/(dashboard)/agentes/components/config-panel.tsx` (editorial card containers Sections 1-3).
    - `grep -q 'tracking-\[0.14em\]' src/app/(dashboard)/agentes/components/config-panel.tsx` (smallcaps section titles Sections 2-3).
    - `grep -q 'mx-pulse' src/app/(dashboard)/agentes/components/config-panel.tsx` (loading skeletons).
    - `grep -q 'Guardando…' src/app/(dashboard)/agentes/components/config-panel.tsx` (U+2026 ellipsis editorial).
    - `grep -q 'Guardando\.\.\.' src/app/(dashboard)/agentes/components/config-panel.tsx` (3-dot preserved en !v2).
    - El archivo STILL contiene: `getAgentConfig`, `updateAgentConfig`, `handleToggleAgent`, `handleSelectAgent`, `handleToggleCrmAgent`, `handleHandoffChange`, `handleSelectPreset`, `handleSelectSpeed`, `AGENT_CATALOG`, `CRM_AGENTS`, `TIMER_PRESETS`, `SPEED_PRESETS`, `Switch`, `Select`, `SelectContent`, `Textarea`, debounce ref logic (Regla 6 NO-TOUCH).
    - `npx tsc --noEmit` reporta cero errores en `config-panel.tsx`.
  </acceptance_criteria>
  <done>Sections 1-3 + saving indicator + loading state editorial cuando flag ON: agent toggle Card paper-2/ink-1 con avatar circle + status pill mx-tag, Select trigger paper-0/ink-1 rounded-[3px], CRM agents ledger-row con switches + status pills, saving indicator mono ink-3 'Guardando…', loading skeleton 6 cards mx-pulse. Cuando flag OFF, todo render byte-identical. Sections 4-6 pendientes Task 4.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin config-panel.tsx Part B — Section 4 (mono Textarea handoff D-DASH-08) + Sections 5-6 (preset cards selectable editorial)</name>
  <files>src/app/(dashboard)/agentes/components/config-panel.tsx</files>
  <read_first>
    - src/app/(dashboard)/agentes/components/config-panel.tsx (líneas 258-350 — Sections 4, 5, 6)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/agentes.html líneas 122-131 (.prompt-preview pattern para textarea), 209-214 (.knob para presets)
    - src/components/ui/textarea.tsx (verify Textarea primitive — NO modificar, sólo override className)
  </read_first>
  <action>
    Continuar el re-skin de `src/app/(dashboard)/agentes/components/config-panel.tsx`. Re-skin las Sections 4, 5, 6 con el mismo pattern `{v2 ? (...) : (<Card>...</Card>)}`.

    **Step 1 — Branch Section 4 (líneas 258-278, handoff message Card).** Editorial branch:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
        style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
      >
        <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Mensaje de handoff
            </h3>
          </div>
          <p
            className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Mensaje que se envia al cliente cuando el agente no puede resolver la consulta y transfiere a un humano.
          </p>
        </header>
        <div className="px-6 py-5">
          <Textarea
            value={config.handoff_message}
            onChange={(e) => handleHandoffChange(e.target.value)}
            placeholder="Mensaje cuando el agente transfiere a un humano…"
            className="resize-none w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] text-[14px] leading-[1.55] rounded-[3px] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0 placeholder:text-[var(--ink-3)] placeholder:italic"
            style={{ fontFamily: 'var(--font-mono)' }}
            rows={4}
          />
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical (líneas 259-278 originales)
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Mensaje de handoff</CardTitle>
          </div>
          <CardDescription>
            Mensaje que se envia al cliente cuando el agente no puede resolver la consulta y transfiere a un humano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.handoff_message}
            onChange={(e) => handleHandoffChange(e.target.value)}
            placeholder="Mensaje cuando el agente transfiere a un humano..."
            className="resize-none text-sm"
            rows={3}
          />
        </CardContent>
      </Card>
    )}
    ```

    **NOTAS Section 4:**
    - Editorial usa `font-family: var(--font-mono)` (JetBrains Mono) — la justificación es D-DASH-08 mock pattern del `.composer textarea` línea 168 + el contenido aquí es texto plano editable destinado a copy-paste técnico (mejor mono). Alternativa: `var(--font-serif)` 14px line-height 1.55. Decisión locked para esta plan: mono.
    - Editorial `placeholder` usa U+2026 (`…`) — preserva 3-dot en `!v2`.
    - Editorial `rows={4}` (vs 3 actual) — más respiro editorial.

    **Step 2 — Branch Section 5 (líneas 280-314, timer preset Card).** Editorial branch:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
        style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
      >
        <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Timer preset
            </h3>
          </div>
          <p
            className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Controla cuanto tiempo espera el agente antes de tomar acciones proactivas (ofrecer promos, pedir datos faltantes).
          </p>
        </header>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {TIMER_PRESETS.map((preset) => {
              const isActive = config.timer_preset === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleSelectPreset(preset.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-4 py-4 border text-center transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                    isActive
                      ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]'
                      : 'bg-[var(--paper-0)] border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--paper-1)]'
                  )}
                  style={isActive ? { boxShadow: '0 1px 0 var(--ink-1)' } : undefined}
                  aria-pressed={isActive}
                >
                  <span
                    className="text-[14px] font-semibold leading-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {preset.label}
                  </span>
                  <span
                    className="text-[11px] text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {preset.description}
                  </span>
                </button>
              )
            })}
          </div>
          {TIMER_PRESETS.find((p) => p.value === config.timer_preset) && (
            <p
              className="text-[12px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {TIMER_PRESETS.find((p) => p.value === config.timer_preset)?.detail}
            </p>
          )}
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical (líneas 281-314 originales)
      <Card>...</Card>
    )}
    ```

    **Step 3 — Branch Section 6 (líneas 316-350, response speed Card).** Mismo pattern que Section 5 — `<Zap>` icon, header smallcaps "Velocidad de respuesta", description, grid de 3 preset cards SPEED_PRESETS (label + description), detail paragraph. Re-usar el bloque editorial de Section 5 cambiando solo: icono `<Zap>` en lugar de `<Clock>`, título "Velocidad de respuesta", descriptions array `SPEED_PRESETS`, comparación `config.response_speed === preset.value`, callback `handleSelectSpeed(preset.value)`, key `preset.value` (es `number` no `string`).

    Editorial branch para Section 6:
    ```tsx
    {v2 ? (
      <article
        className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
        style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
      >
        <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Velocidad de respuesta
            </h3>
          </div>
          <p
            className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Controla los delays entre mensajes del agente. Real simula escritura humana, Instantaneo envia todo sin pausa.
          </p>
        </header>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {SPEED_PRESETS.map((preset) => {
              const isActive = config.response_speed === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleSelectSpeed(preset.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-4 py-4 border text-center transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                    isActive
                      ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]'
                      : 'bg-[var(--paper-0)] border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--paper-1)]'
                  )}
                  style={isActive ? { boxShadow: '0 1px 0 var(--ink-1)' } : undefined}
                  aria-pressed={isActive}
                >
                  <span
                    className="text-[14px] font-semibold leading-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {preset.label}
                  </span>
                  <span
                    className="text-[11px] text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {preset.description}
                  </span>
                </button>
              )
            })}
          </div>
          {SPEED_PRESETS.find((p) => p.value === config.response_speed) && (
            <p
              className="text-[12px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {SPEED_PRESETS.find((p) => p.value === config.response_speed)?.detail}
            </p>
          )}
        </div>
      </article>
    ) : (
      // Preserve current shadcn Card byte-identical
      <Card>...</Card>
    )}
    ```

    **DO NOT MODIFY (D-DASH-07 + Regla 6):**
    - `TIMER_PRESETS`, `SPEED_PRESETS` constants (shape preservado)
    - `handleSelectPreset`, `handleSelectSpeed`, `handleHandoffChange` callbacks
    - Debounce timer logic (handoffTimerRef + 300ms timeout)
    - `<Textarea>` primitive (solo className override + style)
    - `config.handoff_message`, `config.timer_preset`, `config.response_speed` reads/writes
    - Sections 1-3 (already done en Task 3)
    - Loading state, saving indicator (already done en Task 3)
  </action>
  <verify>
    <automated>grep -c "var(--font-mono)" "src/app/(dashboard)/agentes/components/config-panel.tsx" | awk '{ if ($1 < 3) exit 1 }' && grep -q 'placeholder="Mensaje cuando el agente transfiere a un humano…"' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'aria-pressed' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'TIMER_PRESETS' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'SPEED_PRESETS' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'handleSelectPreset' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'handleSelectSpeed' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'handleHandoffChange' "src/app/(dashboard)/agentes/components/config-panel.tsx" && grep -q 'handoffTimerRef' "src/app/(dashboard)/agentes/components/config-panel.tsx" && ! grep -q "border-primary bg-primary/5" "src/app/(dashboard)/agentes/components/config-panel.tsx" || grep -B 5 "border-primary bg-primary/5" "src/app/(dashboard)/agentes/components/config-panel.tsx" | grep -q '!v2' && npx tsc --noEmit 2>&1 | grep "config-panel" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "var(--font-mono)" src/app/(dashboard)/agentes/components/config-panel.tsx` ≥ 3 (mono usado en saving indicator + textarea handoff + preset descriptions Section 5/6).
    - `grep -q 'placeholder="Mensaje cuando el agente transfiere a un humano…"' src/app/(dashboard)/agentes/components/config-panel.tsx` (U+2026 ellipsis en editorial branch).
    - `grep -q 'aria-pressed' src/app/(dashboard)/agentes/components/config-panel.tsx` (preset buttons a11y).
    - `grep -q "Velocidad de respuesta" src/app/(dashboard)/agentes/components/config-panel.tsx`.
    - `grep -q "Timer preset" src/app/(dashboard)/agentes/components/config-panel.tsx`.
    - El archivo STILL contiene: `TIMER_PRESETS`, `SPEED_PRESETS`, `handleSelectPreset`, `handleSelectSpeed`, `handleHandoffChange`, `handoffTimerRef`, debounce 300ms, `Textarea` (Regla 6 NO-TOUCH).
    - El branch `!v2` de Sections 4-6 preserva el `border-primary bg-primary/5 text-primary` shadcn pattern byte-identical (preset active state) — verifica con grep que las `Card` originales sigan ahí en el branch `!v2`.
    - `! grep -q "oklch(" src/app/(dashboard)/agentes/components/config-panel.tsx` (no hardcoded OKLCH).
    - `npx tsc --noEmit` reporta cero errores.
  </acceptance_criteria>
  <done>Sections 4-6 editorial cuando flag ON: Textarea handoff mono paper-0/ink-1 + smallcaps label, preset cards (Timer + Speed) editorial selectable con border ink-1/shadow-stamp activo + label display serif + description mono ink-3 + detail paragraph serif italic. Cuando flag OFF, todo render byte-identical (shadcn Card + border-primary bg-primary/5 active state). ARIA attributes (aria-pressed) universales en preset buttons. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Cross-cutting verification — flag-OFF byte-identical diff + Regla 6 NO-TOUCH guards (agents/lib/server-actions) + Plan 07 cross-link note</name>
  <files>src/app/(dashboard)/agentes/layout.tsx, src/app/(dashboard)/agentes/components/metrics-dashboard.tsx, src/app/(dashboard)/agentes/components/config-panel.tsx</files>
  <read_first>
    - Re-leer los 3 archivos modificados en Tasks 1-4 después de aplicarlos
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md sección "Regla 6 compliance" + "OUT (NO TOUCH)"
    - .planning/standalone/ui-redesign-dashboard/PLAN.md sección "Wave 3 — Plan 07 Analytics"
  </read_first>
  <action>
    Esta task es verificación cross-cutting + cleanup. NO modifica funcionalidad — solo asegura compliance con D-DASH-07, Regla 6, y deja anotaciones para Plan 07.

    **Step 1 — Verificación NO-TOUCH (Regla 6 + D-DASH-07).** Ejecutar grep checks contra los 3 archivos modificados. Si CUALQUIERA falla, ABORTAR y revisar Tasks 1-4:

    ```bash
    # 1. Server actions UNCHANGED en este worktree:
    git diff --stat src/app/actions/agent-config.ts src/app/actions/agent-metrics.ts
    # Expected: empty output (files not modified)

    # 2. Agent registry / catalog / production lib UNCHANGED:
    git diff --stat src/lib/agents/
    # Expected: empty output

    # 3. Domain layer UNCHANGED:
    git diff --stat src/lib/domain/
    # Expected: empty output

    # 4. Inngest UNCHANGED:
    git diff --stat src/inngest/
    # Expected: empty output

    # 5. Webhooks/API routes UNCHANGED:
    git diff --stat src/app/api/v1/crm-bots/ src/app/api/webhooks/
    # Expected: empty output (NO touch CRM bots o webhooks per CONTEXT)

    # 6. Hooks UNCHANGED:
    git diff --stat src/hooks/
    # Expected: empty output

    # 7. Shadcn primitives UNCHANGED (D-DASH-09 — solo extensiones aditivas BC, no cambios destructivos):
    git diff --stat src/components/ui/
    # Expected: empty (este Plan no requiere agregar portalContainer prop a Select per Task 3 nota — si se agregó, debe ser BC con prop opcional)
    ```

    Si CUALQUIERA de estos diffs muestra cambios, REVISAR y revertir. Las verificaciones deben pasar antes de cerrar el plan.

    **Step 2 — Verificación flag-OFF byte-identical.** Conceptualmente: con `useDashboardV2() === false`, el árbol JSX renderizado por los 3 archivos modificados DEBE ser equivalente al árbol renderizado por el codebase pre-Plan-05.

    Verificación práctica vía code review (no automatable sin un visual regression suite):
    - Para cada `{v2 ? (<EditorialBranch />) : (<CurrentBranch />)}`, leer el `<CurrentBranch />` y compararlo línea-por-línea con el código original (pre-modification). Cualquier diferencia (espacios, classNames cambiados, props añadidos/quitados) en el branch `!v2` es un BUG y debe corregirse.

    Específicamente verificar:
    - `agentes/layout.tsx` `!v2`: el `<div className="border-b bg-card">` con avatar Bot circle + h1 'Agentes' + p subtitle + tabs con icons + `border-primary text-primary bg-background` ACTIVE state — TODO byte-identical al pre-modification.
    - `metrics-dashboard.tsx` `!v2`: las 9 `<Card>` shadcn con `<CardHeader pb-2><CardTitle text-sm font-medium text-muted-foreground>{title}</CardTitle><Icon h-4 w-4 text-muted-foreground /></CardHeader><CardContent><div text-2xl font-bold>{value}</div><p text-xs text-muted-foreground mt-1>{description}</p></CardContent>` + period selector con `<Button variant="ghost" size="sm">` y `bg-background shadow-sm` active state — TODO byte-identical.
    - `config-panel.tsx` `!v2`: las 6 `<Card>` con `<Loader2 spin>` loading + `<Save>` saving indicator + handoff `<Textarea rows={3}>` + preset buttons con `border-primary bg-primary/5 text-primary` active — TODO byte-identical.

    **Step 3 — Cross-link a Plan 07 (Analytics).** Plan 07 re-skineará `src/app/(dashboard)/analytics/**` + `metricas/**` con cards similares + charts editorial (D-DASH-13). Las 9 metric cards de este Plan 05 son preview del pattern. NO crear `<EditorialMetricCard>` shared component aquí — sería premature abstraction. Si Plan 07 introduce el shared component, post-cierre de la fase un small refactor extrae las 9 cards de metrics-dashboard.tsx a usar el shared. Anotar en `<output>` summary.

    Acción: agregar comentario inline al inicio del editorial branch del primer card en `metrics-dashboard.tsx`:
    ```tsx
    {/* Editorial card pattern — refactor a <EditorialMetricCard> shared si Plan 07 lo introduce. Por ahora inline. */}
    ```

    **Step 4 — Validación TypeScript estricta cross-archivos:**
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "agentes/(layout|components/(metrics-dashboard|config-panel))"
    # Expected: empty (zero errors en los 3 archivos)
    ```

    Si hay error en cualquiera, fix antes de cerrar.

    **Step 5 — Lint check (opcional pero recomendado):**
    ```bash
    npx eslint src/app/\(dashboard\)/agentes/ 2>&1 | tail -20
    # Expected: zero errors. Warnings ok si son pre-existentes.
    ```

    **Step 6 — Anti-patterns sweep (mismo pattern que ui-redesign-conversaciones DoD):**
    ```bash
    # No hardcoded OKLCH outside style attribute (style attr only allowed for box-shadow with oklch):
    grep -nE "oklch\(" "src/app/(dashboard)/agentes/" -r | grep -v "boxShadow\|box-shadow"
    # Expected: empty

    # No `dark:` classes (this phase is light-mode only, D-LND equivalent):
    grep -nE "\bdark:" "src/app/(dashboard)/agentes/" -r
    # Expected: empty

    # No `bg-slate-` direct usage:
    grep -nE "bg-slate-|text-slate-|border-slate-" "src/app/(dashboard)/agentes/" -r
    # Expected: empty
    ```

    Si cualquier sweep retorna resultados, fix antes de cerrar el plan.

    **NOTE — Esta task NO modifica los archivos JSX salvo el comentario del Step 3.** Si una verificación falla, revisitar la task correspondiente (1-4) y volver. Esta task es tabla de comprobación.
  </action>
  <verify>
    <automated>git diff --stat src/app/actions/agent-config.ts src/app/actions/agent-metrics.ts src/lib/agents/ src/lib/domain/ src/inngest/ src/app/api/v1/crm-bots/ src/hooks/ src/components/ui/ 2>&1 | (! grep -E "^[[:space:]]+[0-9]+ files? changed") && grep -q "Editorial card pattern" "src/app/(dashboard)/agentes/components/metrics-dashboard.tsx" && (! grep -rE "\bdark:" "src/app/(dashboard)/agentes/") && (! grep -rE "bg-slate-|text-slate-|border-slate-" "src/app/(dashboard)/agentes/") && npx tsc --noEmit 2>&1 | grep -E "agentes/(layout|components/(metrics-dashboard|config-panel))" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `git diff --stat` para `src/app/actions/agent-{config,metrics}.ts`, `src/lib/agents/`, `src/lib/domain/`, `src/inngest/`, `src/app/api/v1/crm-bots/`, `src/hooks/`, `src/components/ui/` retorna empty (cero archivos modificados — Regla 6 + D-DASH-07 NO-TOUCH compliance verificable).
    - `grep -q "Editorial card pattern" src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (cross-link comment a Plan 07).
    - `! grep -rE "\bdark:" src/app/(dashboard)/agentes/` (sin classes dark mode — fase light-only).
    - `! grep -rE "bg-slate-|text-slate-|border-slate-" src/app/(dashboard)/agentes/` (sin tailwind slate directo — usar var tokens).
    - `! grep -rE "oklch\(" src/app/(dashboard)/agentes/ | grep -v "boxShadow\|box-shadow"` (oklch sólo permitido dentro de boxShadow style strings).
    - `npx tsc --noEmit 2>&1 | grep "agentes/"` zero errors en los 3 archivos del scope.
    - Code review manual confirma `!v2` branches byte-identical al pre-Plan-05 código.
  </acceptance_criteria>
  <done>Cross-cutting verification PASS: NO-TOUCH guards confirmados (server actions / agents lib / domain / inngest / crm-bots / hooks / shadcn primitives all unchanged), anti-patterns sweep clean, TS clean, Plan 07 cross-link comment plantado. Plan 05 ready para commit.</done>
</task>

</tasks>

<verification>
After all 5 tasks:

1. `npx tsc --noEmit 2>&1 | grep -E "agentes/(layout|components/)" | (! grep -E "error|Error")` returns 0.
2. Manual smoke (with flag enabled in dev DB via `UPDATE workspaces SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'true') WHERE id = '<somnio-workspace-id>'`):
   - `/agentes` topbar muestra eyebrow "Módulo · Automatización" rubric-2 + h1 "Agentes" display 30px + tabs underlined Dashboard/Configuracion sin icons.
   - `/agentes` Dashboard tab: 3 grupos con título smallcaps rubric-2 + 9 cards paper-0/ink-1 con números display 30px tabular + descriptions serif italic ink-3.
   - Period selector: 3 chips paper-0/border `Hoy` / `7 dias` / `30 dias` con activo bg ink-1 color paper-0.
   - `/agentes/config` muestra 6 cards editorial paper-2/ink-1: agente activo (toggle + status pill verdigris/ink), conversational select (paper-0/ink-1 trigger), CRM agents (ledger rows + switches + status pills), handoff Textarea mono paper-0/ink-1 rows=4, timer preset (3 cards selectable), velocidad respuesta (3 cards selectable).
   - Saving indicator: `Guardando…` mono ink-3 con Save icon animate-pulse.
   - Loading skeletons: 6 cards paper-2 mx-pulse en lugar de Loader2 spin.
3. With flag OFF (revertir SQL): visual diff vs current main muestra ZERO change. layout, metrics-dashboard, config-panel renderean shadcn slate como hoy (avatar Bot + Card + Loader2 + Card + border-primary preset active).
4. Git diff para archivos fuera de scope: empty (Regla 6 + D-DASH-07 verificable).
5. axe-core scan en `/agentes` y `/agentes/config` (flag ON): no NEW serious/critical violations introduced (baseline diff).
</verification>

<success_criteria>
- 5 tasks pasan automated verify.
- Build clean (`npx tsc --noEmit`).
- Con flag ON, `/agentes` + `/agentes/config` matchean patterns mock `agentes.html` (paper-0/ink-1 cards, smallcaps eyebrows, serif numbers grandes, mx-tag status pills, mono textarea, preset cards selectables).
- Con flag OFF, ambas páginas byte-identical a hoy.
- Cero cambios funcionales — server actions, hooks, agent registry, AI SDK, prompt builders, schema DB intactos (D-DASH-07 + Regla 6).
- Plan 07 cross-link inline plantado para refactor futuro de `<EditorialMetricCard>` shared component (post-cierre de fase si Plan 07 lo introduce).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/05-SUMMARY.md` with:
- Commits (uno por task: T1 layout, T2 metrics-dashboard, T3 config-panel Part A, T4 config-panel Part B, T5 verification)
- Confirmation flag-OFF byte-identical para los 3 archivos (manual code review pass + git diff stats fuera de scope vacío)
- Confirmation D-DASH-07 NO-TOUCH compliance: server actions / agent lib / domain / inngest / crm-bots / hooks / shadcn primitives diff vacíos
- Note sobre Select portal (D-DASH-09 + D-DASH-10): si shadcn `<Select>` SelectContent NO heredó tokens del `.theme-editorial` wrapper, ANOTAR como deuda para Plan 09 DoD (probablemente el dropdown se ve slate momentáneamente — trigger ya editorial). Si SÍ se agregó `portalContainer` prop al primitive, documentar que es extensión BC + lista de consumers.
- Note sobre keyframe `mx-pulse`: confirmar que ya existía en `globals.css` (shipped desde fase ui-redesign-conversaciones) o anotar que se agregó al final del file (zero impact flag-OFF).
- Note sobre adaptación pixel-perfect (D-DASH-08): el módulo `/agentes` actual es admin compacto de UN agente; el mock `agentes.html` representa estado futuro multi-agente con sandbox. La adaptación aplicó patterns mock (paper-0/ink-1, serif numbers, smallcaps eyebrows, mx-tag pills, font-mono editor) a las superficies que SÍ existen. Features no representadas (agent cards listing, prompt editor, guardrails, KB, sandbox, inspector) NO se agregaron — preservadas como deuda para fase posterior `ui-redesign-agentes-extras` si se materializan.
- Cross-link a Plan 07 (Analytics): las 9 metric cards de metrics-dashboard.tsx son preview del pattern de cards editorial; si Plan 07 introduce `<EditorialMetricCard>` shared component, refactor extracts post-cierre.
- Handoff a Wave 3 (Plans 07 + 08): Wave 2 completo (Agentes + Automatizaciones), proceder con Analytics + Configuración.
</output>
</content>
</invoke>