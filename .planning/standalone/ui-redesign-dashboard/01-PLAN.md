---
phase: ui-redesign-dashboard
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - src/lib/auth/dashboard-v2.ts
  - src/app/(dashboard)/fonts.ts
  - src/components/layout/dashboard-v2-context.tsx
  - src/app/(dashboard)/layout.tsx
  - src/components/layout/sidebar.tsx
autonomous: true
requirements:
  - D-DASH-01
  - D-DASH-04
  - D-DASH-05
  - D-DASH-06
  - D-DASH-07
  - D-DASH-09
  - D-DASH-10
  - D-DASH-17

must_haves:
  truths:
    - "Helper `getIsDashboardV2Enabled(workspaceId: string): Promise<boolean>` existe en `src/lib/auth/dashboard-v2.ts`, lee `workspaces.settings.ui_dashboard_v2.enabled` via `createClient()` de `@/lib/supabase/server`, fail-closed (returns false on error) — mirror byte-pattern de `getIsInboxV2Enabled` (D-DASH-01)"
    - "Archivo `src/app/(dashboard)/fonts.ts` exporta `ebGaramond`, `inter`, `jetbrainsMono` desde `next/font/google` con variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono` — clon byte-equivalente de `src/app/(dashboard)/whatsapp/fonts.ts` (D-DASH-05)"
    - "Componente `<DashboardV2Provider>` + hook `useDashboardV2(): boolean` existen en `src/components/layout/dashboard-v2-context.tsx` con default `false` para fail-closed (mirror del `InboxV2Provider` ya shipped)"
    - "`src/app/(dashboard)/layout.tsx` aplica las 3 variables de fuente al wrapper `<div className=\"flex h-screen\">` y conditionally agrega `theme-editorial` className via `cn(...)` cuando `getIsDashboardV2Enabled(activeWorkspaceId)` retorna true (D-DASH-04, D-DASH-05)"
    - "`src/app/(dashboard)/layout.tsx` invoca `getIsDashboardV2Enabled(activeWorkspaceId)` como entrada adicional en el `Promise.all` existente — el `activeWorkspaceId` ya esta disponible via `getActiveWorkspaceId()`"
    - "`src/app/(dashboard)/layout.tsx` envuelve `<Sidebar>` + `<main>` con `<DashboardV2Provider v2={isDashboardV2}>` para que componentes downstream (sidebar, módulos) consulten el flag sin prop drilling"
    - "`src/components/layout/sidebar.tsx` recibe `v2?: boolean` prop (default `false`) desde el dashboard layout y aplica re-skin editorial gated: cuando `v2=true`, sidebar usa paper-1 bg + ink-1 border + smallcaps section labels + rubric-2 active state + wordmark `morf·x` serif; cuando `v2=false`, render byte-identical al actual (D-DASH-06)"
    - "`.theme-editorial` block en `src/app/globals.css` NO se modifica — ya existe desde `ui-redesign-conversaciones` Plan 01 (shipped 2026-04-22), verificable con `grep -n '^\\.theme-editorial' src/app/globals.css` que devuelve linea 134"
    - "Cero cambios en hooks, agents, inngest, webhooks, action handlers, domain layer (D-DASH-07) — verificable por git diff"
    - "Build pasa: `npx tsc --noEmit` clean en todos los archivos nuevos/modificados (errores pre-existentes vitest/somnio quedan out-of-scope)"
    - "Comportamiento con flag OFF byte-identical al actual: con `ui_dashboard_v2.enabled` ausente o `false`, el dashboard renderiza el UI shadcn-slate exacto que tiene hoy (Regla 6 garantizada)"
    - "Header (`src/components/layout/header.tsx`) NO se modifica en este plan — verificacion: ningun import en `src/app/(dashboard)/layout.tsx` referencia `<Header />`. El componente existe pero no esta wired al chrome global del dashboard. Si en una fase futura se conecta, se re-skinea ahi (D-DASH-17)"
  artifacts:
    - path: "src/lib/auth/dashboard-v2.ts"
      provides: "Server-side flag resolver getIsDashboardV2Enabled(workspaceId)"
      exports: ["getIsDashboardV2Enabled"]
      contains: "workspaces.settings.ui_dashboard_v2.enabled"
    - path: "src/app/(dashboard)/fonts.ts"
      provides: "EB Garamond + Inter + JetBrains Mono via next/font/google (per-segment preload)"
      exports: ["ebGaramond", "inter", "jetbrainsMono"]
    - path: "src/components/layout/dashboard-v2-context.tsx"
      provides: "DashboardV2Provider + useDashboardV2 hook (avoid prop drilling for v2 gate across modules)"
      exports: ["DashboardV2Provider", "useDashboardV2"]
    - path: "src/app/(dashboard)/layout.tsx"
      provides: "Per-segment font wrapper + conditional .theme-editorial className gated by flag + DashboardV2Provider context"
      contains: "getIsDashboardV2Enabled"
    - path: "src/components/layout/sidebar.tsx"
      provides: "v2?: boolean prop + conditional editorial re-skin (paper-1 bg, smallcaps labels, ink-1 border, rubric-2 active, serif wordmark)"
      contains: "v2 && 'theme-editorial'"
  key_links:
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/lib/auth/dashboard-v2.ts"
      via: "import + Promise.all entry"
      pattern: "getIsDashboardV2Enabled"
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/app/(dashboard)/fonts.ts"
      via: "next/font variable classNames"
      pattern: "ebGaramond.variable"
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/app/globals.css .theme-editorial"
      via: "cn(..., isDashboardV2 && 'theme-editorial')"
      pattern: "theme-editorial"
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "<DashboardV2Provider v2={isDashboardV2}>"
      pattern: "DashboardV2Provider"
    - from: "src/components/layout/sidebar.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "v2 prop forwarded from layout (sidebar is client component already)"
      pattern: "v2?: boolean"
---

<objective>
Wave 0 — Infrastructure foundation for the dashboard editorial re-skin (mega-fase). Plant the entire scaffolding necessary to gate 7 downstream module re-skins (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics+Métricas, Configuración) BEFORE touching any module-specific component. After this plan ships:

- The flag `workspaces.settings.ui_dashboard_v2.enabled` resolves server-side via `getIsDashboardV2Enabled(workspaceId)` and threads through to the `(dashboard)/layout.tsx` root.
- The `.theme-editorial` className wraps the dashboard root div conditionally (when flag ON), cascading all editorial tokens to every dashboard subroute.
- Editorial fonts (EB Garamond, Inter, JetBrains Mono) preload per-segment on `/(dashboard)/**` routes via `src/app/(dashboard)/fonts.ts`.
- A React Context `<DashboardV2Provider>` exposes `useDashboardV2()` so child components (including the sidebar and downstream module components in Waves 1-3) can gate NEW JSX without prop drilling.
- The global sidebar (`src/components/layout/sidebar.tsx`) receives a `v2` prop and re-skins editorially when ON (paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state, wordmark serif), while remaining byte-identical to today when OFF.

**Purpose:** This plan ships zero visible change for any user with `ui_dashboard_v2.enabled` not set (default false). Everything is gated. This is the safest way to land the chrome-level scaffold (Regla 6 strict — agente productivo intacto + Somnio inbox v2 actual no se altera).

**Output:** All scaffolding for Waves 1-4 to consume. Downstream plans reference `useDashboardV2()` to gate new markup; module-level re-skins (Waves 1-4) inherit the `.theme-editorial` cascade from the layout root. The `.theme-editorial` CSS scope itself is NOT created here — already shipped in `ui-redesign-conversaciones` Plan 01 (line 134 of `globals.css`); this plan only WIRES it to the dashboard root conditionally.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@CLAUDE.md
@.claude/rules/code-changes.md
@.claude/rules/gsd-workflow.md

# Analog code (already shipped in ui-redesign-conversaciones Plan 01) — clone shape verbatim:
@src/lib/auth/inbox-v2.ts
@src/app/(dashboard)/whatsapp/fonts.ts
@src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
@src/app/(dashboard)/whatsapp/layout.tsx

# Files to MODIFY (read first, never overwrite blindly):
@src/app/(dashboard)/layout.tsx
@src/components/layout/sidebar.tsx

# Existing infrastructure to consume:
@src/lib/utils.ts
@src/app/actions/workspace.ts

<interfaces>
<!-- Existing contracts the executor must preserve. -->

From src/lib/auth/inbox-v2.ts (analog — shipped 2026-04-22, mirror EXACTLY for dashboard-v2.ts):
```typescript
import { createClient } from '@/lib/supabase/server'

export async function getIsInboxV2Enabled(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()
    if (error || !data) return false
    const settings = (data.settings as Record<string, unknown> | null) ?? {}
    const ns = settings.ui_inbox_v2 as Record<string, unknown> | undefined
    return ns?.enabled === true
  } catch {
    return false
  }
}
```

From src/app/(dashboard)/whatsapp/fonts.ts (analog — clone verbatim, only change comment header):
```typescript
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

export const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ebgaramond',
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  adjustFontFallback: true,
})

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
  adjustFontFallback: true,
})
```

From src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx (analog — same shape for DashboardV2):
```typescript
'use client'
import { createContext, useContext, type ReactNode } from 'react'
const InboxV2Context = createContext<boolean>(false)
export function InboxV2Provider({ v2, children }: { v2: boolean; children: ReactNode }) {
  return <InboxV2Context.Provider value={v2}>{children}</InboxV2Context.Provider>
}
export function useInboxV2(): boolean { return useContext(InboxV2Context) }
```

From src/app/(dashboard)/layout.tsx (current state — Server Component, lines 1-41):
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { WorkspaceProvider } from '@/components/providers/workspace-provider'
import { getUserWorkspaces, getActiveWorkspaceId } from '@/app/actions/workspace'

export default async function DashboardLayout({ children }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [workspaces, activeWorkspaceId] = await Promise.all([
    getUserWorkspaces(),
    getActiveWorkspaceId(),
  ])

  let currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null
  if (!currentWorkspace && workspaces.length > 0) currentWorkspace = workspaces[0]

  return (
    <WorkspaceProvider workspace={currentWorkspace} workspaces={workspaces}>
      <div className="flex h-screen">
        <Sidebar workspaces={workspaces} currentWorkspace={currentWorkspace} user={user} />
        <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      </div>
    </WorkspaceProvider>
  )
}
```

From src/components/layout/sidebar.tsx (current — Client Component, 272 LOC):
- Already `'use client'` directive at line 1.
- `SidebarProps` interface at lines 124-128: `workspaces?, currentWorkspace?, user?`. ADD `v2?: boolean`.
- Root `<aside className="hidden md:flex flex-col w-64 border-r bg-card">` at line 152.
- Logo block at lines 155-160 (Image with light/dark variants — leave shadcn version intact when v2=false; render serif wordmark `morf·x` when v2=true).
- Navigation `<ul>` at lines 177-231 — when v2=true, swap shadcn-slate active classes (`bg-accent text-accent-foreground`) for editorial (`bg-[var(--paper-3)] text-[var(--ink-1)]` with optional left-border rubric-2 accent).
- Footer at lines 234-268 — apply ink-1 border-top + serif text on user info + smallcaps `cerrar sesión` tooltip when v2=true.

From src/lib/utils.ts:
```typescript
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
```

From src/app/actions/workspace.ts (line 26):
```typescript
export async function getActiveWorkspaceId(): Promise<string | null>
```

CRITICAL: `.theme-editorial` block in `src/app/globals.css` is ALREADY PRESENT (line 134, ~170 LOC, shipped in `ui-redesign-conversaciones` Plan 01 commit). DO NOT duplicate, DO NOT modify globals.css in this plan. Verify with: `grep -n '^\.theme-editorial' src/app/globals.css` returns line 134.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Server-side flag helper + DashboardV2 React Context provider/hook</name>
  <files>src/lib/auth/dashboard-v2.ts, src/components/layout/dashboard-v2-context.tsx</files>
  <read_first>
    - src/lib/auth/inbox-v2.ts (full 45 LOC — clone shape verbatim, only swap namespace)
    - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx (full 34 LOC — clone shape verbatim, only swap names)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md `D-DASH-01` (flag namespace) and `D-DASH-04` (path-based scope)
  </read_first>
  <action>
    **Step 1 — Create `src/lib/auth/dashboard-v2.ts`** with the EXACT shape below. This is a byte-equivalent clone of `getIsInboxV2Enabled` with the namespace swapped to `ui_dashboard_v2` per D-DASH-01. Same fail-closed try/catch pattern (Regla 6 — if the check breaks, user sees current slate dashboard, never half-rendered editorial).

    ```typescript
    /**
     * UI Dashboard v2 flag resolver.
     *
     * Decision D-DASH-01 in
     * .planning/standalone/ui-redesign-dashboard/CONTEXT.md:
     * the editorial re-skin of the dashboard chrome + 7 modules
     * (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics+Métricas,
     * Configuración) is gated per-workspace via
     * `workspaces.settings.ui_dashboard_v2.enabled: boolean`, default false.
     *
     * Pattern mirrors:
     * - src/lib/auth/inbox-v2.ts (getIsInboxV2Enabled — shipped
     *   ui-redesign-conversaciones Plan 01)
     * - src/lib/auth/super-user.ts (getIsSuperUser — original analog)
     *
     * Namespace: 'ui_dashboard_v2' (NOT 'ui_dashboard_v2_enabled' — leaves
     * room for future sub-keys). Key: 'enabled'. Full JSONB path:
     * workspaces.settings.ui_dashboard_v2.enabled.
     *
     * Scope (D-DASH-04): when true, the className `.theme-editorial` is
     * applied at the (dashboard)/layout.tsx wrapper, cascading to ALL
     * subroutes — including out-of-scope ones (super-admin, sandbox,
     * onboarding, etc.). Those routes can be visually broken under flag ON
     * — documented as known deuda in D-DASH-04 mitigation.
     *
     * INDEPENDENT FROM `ui_inbox_v2.enabled` (D-DASH-03): a workspace can
     * have one without the other. Somnio today: ui_inbox_v2=true,
     * ui_dashboard_v2=false. Post-QA of this fase: prend ambos.
     *
     * Usage: call from Server Components only (e.g., (dashboard)/layout.tsx).
     * Caller must already have the active workspaceId
     * (via getActiveWorkspaceId()).
     *
     * Fails closed: any error, null settings, or missing key returns false.
     */

    import { createClient } from '@/lib/supabase/server'

    export async function getIsDashboardV2Enabled(workspaceId: string): Promise<boolean> {
      if (!workspaceId) return false
      try {
        const supabase = await createClient()
        const { data, error } = await supabase
          .from('workspaces')
          .select('settings')
          .eq('id', workspaceId)
          .single()
        if (error || !data) return false
        const settings = (data.settings as Record<string, unknown> | null) ?? {}
        const ns = settings.ui_dashboard_v2 as Record<string, unknown> | undefined
        return ns?.enabled === true
      } catch {
        return false
      }
    }
    ```

    **Step 2 — Create `src/components/layout/dashboard-v2-context.tsx`** as a byte-equivalent clone of `inbox-v2-context.tsx` with names swapped. Default value `false` so any component rendered outside the provider sees flag-off (Regla 6 fail-closed).

    ```tsx
    // src/components/layout/dashboard-v2-context.tsx
    'use client'

    import { createContext, useContext, type ReactNode } from 'react'

    /**
     * Dashboard v2 context.
     *
     * The `v2` flag controls whether NEW JSX renders in dashboard chrome +
     * the 7 module re-skins (eyebrows above titles, editorial badges,
     * smallcaps section headers, etc.). Re-skin-only changes (className
     * swaps gated by .theme-editorial CSS scope) do NOT need this context
     * — they happen automatically via the cascade.
     *
     * Use ONLY in client components that need to gate NEW markup based on
     * the flag. Default value is `false` so any component rendered outside
     * the DashboardV2Provider sees flag-off behavior (Regla 6 fail-closed).
     *
     * Pattern mirrors `InboxV2Provider` / `useInboxV2()` from
     * `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx`
     * (shipped ui-redesign-conversaciones Plan 01).
     *
     * Lives in `src/components/layout/` (not under a route segment) because
     * it wraps the entire dashboard chrome at `(dashboard)/layout.tsx` and
     * is consumed by sidebar + downstream module components in Waves 1-4.
     */

    const DashboardV2Context = createContext<boolean>(false)

    export function DashboardV2Provider({
      v2,
      children,
    }: {
      v2: boolean
      children: ReactNode
    }) {
      return <DashboardV2Context.Provider value={v2}>{children}</DashboardV2Context.Provider>
    }

    export function useDashboardV2(): boolean {
      return useContext(DashboardV2Context)
    }
    ```

    **DO NOT MODIFY:** `src/lib/auth/inbox-v2.ts`, `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx`, `src/lib/auth/super-user.ts`, or any existing flag resolver. These are 2 NEW files only.
  </action>
  <verify>
    <automated>test -f src/lib/auth/dashboard-v2.ts && test -f src/components/layout/dashboard-v2-context.tsx && grep -q "export async function getIsDashboardV2Enabled" src/lib/auth/dashboard-v2.ts && grep -q "ui_dashboard_v2" src/lib/auth/dashboard-v2.ts && grep -q "ns?.enabled === true" src/lib/auth/dashboard-v2.ts && grep -q "DashboardV2Provider" src/components/layout/dashboard-v2-context.tsx && grep -q "useDashboardV2" src/components/layout/dashboard-v2-context.tsx && grep -q "createContext<boolean>(false)" src/components/layout/dashboard-v2-context.tsx && npx tsc --noEmit 2>&1 | grep -E "dashboard-v2" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/auth/dashboard-v2.ts` exists.
    - `grep -q "export async function getIsDashboardV2Enabled" src/lib/auth/dashboard-v2.ts` returns 0.
    - `grep -q "ui_dashboard_v2" src/lib/auth/dashboard-v2.ts` returns 0 (namespace per D-DASH-01).
    - `grep -q "ns?.enabled === true" src/lib/auth/dashboard-v2.ts` returns 0 (fail-closed comparison).
    - `grep -q "createClient } from '@/lib/supabase/server'" src/lib/auth/dashboard-v2.ts` returns 0 (correct import).
    - `! grep -q "ui_inbox_v2" src/lib/auth/dashboard-v2.ts` (NOT same namespace as inbox).
    - File `src/components/layout/dashboard-v2-context.tsx` exists.
    - `grep -q "'use client'" src/components/layout/dashboard-v2-context.tsx`.
    - `grep -q "export function DashboardV2Provider" src/components/layout/dashboard-v2-context.tsx`.
    - `grep -q "export function useDashboardV2" src/components/layout/dashboard-v2-context.tsx`.
    - `grep -q "createContext<boolean>(false)" src/components/layout/dashboard-v2-context.tsx` (fail-closed default).
    - `npx tsc --noEmit` reports zero errors in both new files.
    - `src/lib/auth/inbox-v2.ts` and `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` are UNCHANGED (verify with `git diff src/lib/auth/inbox-v2.ts src/app/\(dashboard\)/whatsapp/components/inbox-v2-context.tsx` returns empty).
  </acceptance_criteria>
  <done>Helper exists, fails closed on missing/error settings. React Context provider + hook expose v2 flag to descendants without prop drilling. Both files compile clean. Inbox v2 analogs are untouched (Regla 6 — Somnio inbox keeps working).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Per-segment fonts loader for the dashboard segment</name>
  <files>src/app/(dashboard)/fonts.ts</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/fonts.ts (full 37 LOC — clone verbatim, only update header comment to reflect dashboard segment scope)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md `D-DASH-05` (per-segment loader, Next next/font dedupes bundle)
  </read_first>
  <action>
    Create `src/app/(dashboard)/fonts.ts` with EXACT content below. This is a byte-equivalent clone of `src/app/(dashboard)/whatsapp/fonts.ts` (already shipped in `ui-redesign-conversaciones` Plan 01) — only the header comment changes to reflect the broader segment scope.

    Per D-DASH-05 confirmed: declaring fonts in TWO segments (`(dashboard)/fonts.ts` and `(dashboard)/whatsapp/fonts.ts`) does NOT duplicate the bundle — Next.js `next/font/google` deduplicates identical font configs by hash. The two declarations exist because:
    - `(dashboard)/whatsapp/fonts.ts` shipped first (inbox v2) and is referenced by `(dashboard)/whatsapp/layout.tsx`.
    - `(dashboard)/fonts.ts` (NEW) is referenced by `(dashboard)/layout.tsx` and applies to ALL dashboard subroutes.
    - When the user navigates `/whatsapp` → `/crm`, Next reuses the same preloaded fonts; no double request.

    Cormorant Garamond is intentionally NOT loaded (UI-SPEC §6.3 — same decision as inbox v2).

    ```typescript
    // src/app/(dashboard)/fonts.ts
    //
    // Per-segment font preload for the editorial re-skin of the dashboard
    // chrome + 7 modules (CRM, Pedidos, Tareas, Agentes, Automatizaciones,
    // Analytics+Métricas, Configuración).
    //
    // Per D-DASH-05 + Next.js 16 docs: declaring fonts here makes Next
    // preload them on ALL `/(dashboard)/**` routes. The whatsapp segment
    // has its own `(dashboard)/whatsapp/fonts.ts` (shipped earlier in
    // ui-redesign-conversaciones Plan 01) — Next next/font dedupes by hash,
    // no double bundle.
    //
    // Cormorant Garamond is intentionally NOT loaded (UI-SPEC §6.3) —
    // the cascade `'EB Garamond', 'Cormorant Garamond', Times, Georgia, serif`
    // falls to Times/Georgia if EB Garamond fails (it never will, self-hosted).
    // Avoids ~40KB unnecessary bundle.

    import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

    export const ebGaramond = EB_Garamond({
      subsets: ['latin'],
      display: 'swap',
      variable: '--font-ebgaramond',
      weight: ['400', '500', '600', '700', '800'],
      style: ['normal', 'italic'],
      adjustFontFallback: true,
    })

    export const inter = Inter({
      subsets: ['latin'],
      display: 'swap',
      variable: '--font-inter',
      adjustFontFallback: true,
    })

    export const jetbrainsMono = JetBrains_Mono({
      subsets: ['latin'],
      display: 'swap',
      variable: '--font-jetbrains-mono',
      weight: ['400', '500'],
      adjustFontFallback: true,
    })
    ```

    **DO NOT MODIFY:** `src/app/(dashboard)/whatsapp/fonts.ts` (shipped, do not touch). This is 1 NEW file only.
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/fonts.ts && grep -q "EB_Garamond" src/app/\(dashboard\)/fonts.ts && grep -q "Inter" src/app/\(dashboard\)/fonts.ts && grep -q "JetBrains_Mono" src/app/\(dashboard\)/fonts.ts && (! grep -q "Cormorant" src/app/\(dashboard\)/fonts.ts) && grep -q "style: \['normal', 'italic'\]" src/app/\(dashboard\)/fonts.ts && grep -q "variable: '--font-ebgaramond'" src/app/\(dashboard\)/fonts.ts && grep -q "variable: '--font-inter'" src/app/\(dashboard\)/fonts.ts && grep -q "variable: '--font-jetbrains-mono'" src/app/\(dashboard\)/fonts.ts && npx tsc --noEmit 2>&1 | grep -E "\(dashboard\)/fonts" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/(dashboard)/fonts.ts` exists with 3 named exports: `ebGaramond`, `inter`, `jetbrainsMono`.
    - `grep -q "EB_Garamond" src/app/\(dashboard\)/fonts.ts` returns 0.
    - `grep -q "Inter" src/app/\(dashboard\)/fonts.ts` returns 0.
    - `grep -q "JetBrains_Mono" src/app/\(dashboard\)/fonts.ts` returns 0.
    - `! grep -q "Cormorant" src/app/\(dashboard\)/fonts.ts` (NOT loaded per UI-SPEC §6.3).
    - `grep -q "style: \['normal', 'italic'\]" src/app/\(dashboard\)/fonts.ts` (italic loaded for `mx-caption` / `mx-marginalia`).
    - `grep -q "variable: '--font-ebgaramond'" src/app/\(dashboard\)/fonts.ts` AND `variable: '--font-inter'` AND `variable: '--font-jetbrains-mono'`.
    - `src/app/(dashboard)/whatsapp/fonts.ts` is UNCHANGED (verify with `git diff src/app/\(dashboard\)/whatsapp/fonts.ts` returns empty).
    - `npx tsc --noEmit` reports zero errors in `src/app/(dashboard)/fonts.ts`.
  </acceptance_criteria>
  <done>Per-segment font loader exists, exports same 3 named fonts as inbox v2 analog. Next.js dedupes the bundle. Whatsapp inbox v2 fonts file untouched.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Wire dashboard layout — fonts + flag resolver + conditional .theme-editorial className + DashboardV2Provider</name>
  <files>src/app/(dashboard)/layout.tsx</files>
  <read_first>
    - src/app/(dashboard)/layout.tsx (full 41 LOC — current state, Server Component)
    - src/lib/auth/dashboard-v2.ts (created in T1)
    - src/app/(dashboard)/fonts.ts (created in T2)
    - src/components/layout/dashboard-v2-context.tsx (created in T1)
    - src/lib/utils.ts (cn util — verify import path)
    - src/app/actions/workspace.ts line 26 (`getActiveWorkspaceId(): Promise<string | null>` — confirm signature)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/layout.tsx` with FIVE additive changes. The file is currently a Server Component with `Promise.all([getUserWorkspaces(), getActiveWorkspaceId()])` at lines 20-23 and a render tree `<WorkspaceProvider><div className="flex h-screen"><Sidebar /><main>{children}</main></div></WorkspaceProvider>` at lines 31-40.

    **Change 1 — Add new imports** at the top of the imports block:
    ```typescript
    import { cn } from '@/lib/utils'
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    import { DashboardV2Provider } from '@/components/layout/dashboard-v2-context'
    import { ebGaramond, inter, jetbrainsMono } from './fonts'
    ```

    **Change 2 — Extend the Promise.all** at lines 20-23 to add the flag resolver as the 3rd entry. The flag resolver depends on `activeWorkspaceId` — but since `Promise.all` evaluates all entries in parallel, we cannot use the result of `getActiveWorkspaceId()` inside another Promise.all entry. So we keep the existing Promise.all unchanged and add a SECOND `await` for the flag AFTER `activeWorkspaceId` resolves:

    ```typescript
    const [workspaces, activeWorkspaceId] = await Promise.all([
      getUserWorkspaces(),
      getActiveWorkspaceId(),
    ])

    // Resolve flag using the active workspace (if any). Fails closed to false.
    const isDashboardV2 = activeWorkspaceId
      ? await getIsDashboardV2Enabled(activeWorkspaceId)
      : false
    ```

    Place this block immediately AFTER the existing Promise.all (between current lines 23 and 25). The currentWorkspace resolution (lines 25-29) stays unchanged.

    **Change 3 — Apply font variables to the wrapper div + conditional `.theme-editorial` className.** Current root div at line 33 is:
    ```tsx
    <div className="flex h-screen">
    ```

    Change to:
    ```tsx
    <div
      className={cn(
        ebGaramond.variable,
        inter.variable,
        jetbrainsMono.variable,
        'flex h-screen',
        isDashboardV2 && 'theme-editorial',
      )}
    >
    ```

    The font variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono` are now exposed in the dashboard subtree unconditionally. When flag is OFF, those CSS variables are present in the DOM but no one reads them (zero regression — `--font-display/serif/sans/mono` only resolve inside `.theme-editorial`).

    The `isDashboardV2 && 'theme-editorial'` guard adds the className ONLY when the flag is true, cascading editorial tokens to ALL dashboard subroutes (D-DASH-04).

    **Change 4 — Wrap the inner contents with `<DashboardV2Provider v2={isDashboardV2}>`.** The render block becomes:

    ```tsx
    return (
      <WorkspaceProvider workspace={currentWorkspace} workspaces={workspaces}>
        <DashboardV2Provider v2={isDashboardV2}>
          <div
            className={cn(
              ebGaramond.variable,
              inter.variable,
              jetbrainsMono.variable,
              'flex h-screen',
              isDashboardV2 && 'theme-editorial',
            )}
          >
            <Sidebar
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              user={user}
              v2={isDashboardV2}
            />
            <main className="flex-1 flex flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </DashboardV2Provider>
      </WorkspaceProvider>
    )
    ```

    **Change 5 — Forward `v2={isDashboardV2}` to `<Sidebar>`** so the Client Component sidebar can apply its editorial gated re-skin (consumed by Task 4). The other Sidebar props (`workspaces`, `currentWorkspace`, `user`) stay byte-identical.

    **DO NOT MODIFY (D-DASH-07, Regla 6):**
    - `createClient` / `supabase.auth.getUser` / `redirect('/login')` auth flow at lines 12-17.
    - `getUserWorkspaces`, `getActiveWorkspaceId`, `WorkspaceProvider`, `Sidebar`, `<main>` element shape, `{children}` placement.
    - The `currentWorkspace` resolution logic at lines 25-29 (find by id, fallback to first).
    - The `import` of any of those — preserved as-is, additive imports only.

    The change is FIVE additive things only: 4 new imports, 1 new `await getIsDashboardV2Enabled(...)` block, 1 className change with cn(...), 1 provider wrapper, 1 prop forward to Sidebar.

    **Hydration note:** `cn(ebGaramond.variable, ...)` produces deterministic SSR output (next/font generates stable class names). No `'use client'` needed; layout stays Server Component.
  </action>
  <verify>
    <automated>grep -q "import { cn } from '@/lib/utils'" src/app/\(dashboard\)/layout.tsx && grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/layout.tsx && grep -q "DashboardV2Provider" src/app/\(dashboard\)/layout.tsx && grep -q "from './fonts'" src/app/\(dashboard\)/layout.tsx && grep -q "ebGaramond.variable" src/app/\(dashboard\)/layout.tsx && grep -q "isDashboardV2 && 'theme-editorial'" src/app/\(dashboard\)/layout.tsx && grep -q "v2={isDashboardV2}" src/app/\(dashboard\)/layout.tsx && grep -q "WorkspaceProvider" src/app/\(dashboard\)/layout.tsx && grep -q "redirect('/login')" src/app/\(dashboard\)/layout.tsx && npx tsc --noEmit 2>&1 | grep -E "\(dashboard\)/layout\.tsx" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "import { cn } from '@/lib/utils'" src/app/\(dashboard\)/layout.tsx` (cn imported).
    - `grep -q "import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'" src/app/\(dashboard\)/layout.tsx`.
    - `grep -q "import { DashboardV2Provider } from '@/components/layout/dashboard-v2-context'" src/app/\(dashboard\)/layout.tsx`.
    - `grep -q "import { ebGaramond, inter, jetbrainsMono } from './fonts'" src/app/\(dashboard\)/layout.tsx`.
    - `grep -q "const isDashboardV2 = activeWorkspaceId" src/app/\(dashboard\)/layout.tsx` (flag resolved after workspace).
    - `grep -q "await getIsDashboardV2Enabled(activeWorkspaceId)" src/app/\(dashboard\)/layout.tsx`.
    - `grep -q "ebGaramond.variable" src/app/\(dashboard\)/layout.tsx` AND `inter.variable` AND `jetbrainsMono.variable` AND `'flex h-screen'` AND `isDashboardV2 && 'theme-editorial'` ALL present in the same `cn(...)` call.
    - `grep -q "<DashboardV2Provider v2={isDashboardV2}>" src/app/\(dashboard\)/layout.tsx`.
    - `grep -q "v2={isDashboardV2}" src/app/\(dashboard\)/layout.tsx` appears at least 2 times (Provider + Sidebar prop).
    - The file still references `WorkspaceProvider`, `Sidebar`, `<main>`, `{children}`, `getUserWorkspaces`, `getActiveWorkspaceId`, `createClient`, `supabase.auth.getUser`, `redirect('/login')`, `currentWorkspace` — verify each with grep (Regla 6 NO-TOUCH guard).
    - `npx tsc --noEmit` reports zero errors in `src/app/(dashboard)/layout.tsx`.
    - `git diff src/app/(dashboard)/layout.tsx` shows ONLY: 4 import additions, 1 isDashboardV2 const block, 1 className cn(...) change, 1 DashboardV2Provider wrapper insertion, 1 v2 prop forward to Sidebar. NO deletions, NO changes to auth flow or workspace resolution.
  </acceptance_criteria>
  <done>Dashboard layout resolves the flag, applies font variables unconditionally, applies `.theme-editorial` className conditionally, wraps children with DashboardV2Provider, forwards v2 to Sidebar. With flag OFF, runtime DOM differs from current ONLY by: 3 inert font CSS variable classes (no consumers in scope when OFF) + 1 inert provider with default-false context. Build clean. Auth flow byte-identical.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Sidebar editorial re-skin (gated by v2 prop) — paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state, serif wordmark</name>
  <files>src/components/layout/sidebar.tsx</files>
  <read_first>
    - src/components/layout/sidebar.tsx (full 272 LOC — pay attention to: line 1 `'use client'`, lines 124-128 SidebarProps interface, lines 130-149 props destructure + filtering, line 152 root `<aside>`, lines 155-160 logo block, lines 177-231 navigation `<ul>`, lines 234-268 footer)
    - src/components/layout/dashboard-v2-context.tsx (created in T1 — alternative to prop drilling, BUT the layout already passes `v2` as prop in T3)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md `D-DASH-06` (sidebar editorial gated spec) and the mocks `crm.html` / `tareas.html` for sidebar visual reference (left rail in those HTMLs)
    - .planning/standalone/ui-redesign-dashboard/PLAN.md Wave 0 success criteria
  </read_first>
  <action>
    Modify `src/components/layout/sidebar.tsx` with FOUR additive, gated changes. The file is already a Client Component (`'use client'` at line 1). All current shadcn-slate behavior must be preserved when `v2={false}`.

    **Change 1 — Extend `SidebarProps` interface** at lines 124-128 to add the `v2` prop:
    ```typescript
    interface SidebarProps {
      workspaces?: WorkspaceWithRole[]
      currentWorkspace?: WorkspaceWithRole | null
      user?: User | null
      /**
       * UI Dashboard v2 flag (Standalone ui-redesign-dashboard, D-DASH-01/D-DASH-06).
       * Resolved server-side via `getIsDashboardV2Enabled(workspaceId)` in
       * `src/lib/auth/dashboard-v2.ts`. When false, the sidebar renders
       * byte-identical to today (Regla 6 zero regression). When true, the
       * editorial re-skin applies: paper-1 bg, ink-1 border, smallcaps
       * section labels, rubric-2 active state, serif wordmark `morf·x`.
       * The parent `(dashboard)/layout.tsx` adds `.theme-editorial` to the
       * outer wrapper so the `var(--paper-*)` / `var(--ink-*)` / etc.
       * tokens resolve correctly when v2=true.
       */
      v2?: boolean
    }
    ```

    Add `v2 = false` to the destructure at line 130:
    ```typescript
    export function Sidebar({ workspaces = [], currentWorkspace, user, v2 = false }: SidebarProps) {
    ```

    **Change 2 — Re-skin the root `<aside>` element** at line 152 with conditional editorial classes. Current:
    ```tsx
    <aside className="hidden md:flex flex-col w-64 border-r bg-card">
    ```

    Change to:
    ```tsx
    <aside
      className={cn(
        'hidden md:flex flex-col w-64 border-r',
        v2
          ? 'bg-[var(--paper-1)] border-[var(--ink-1)]'
          : 'bg-card',
      )}
    >
    ```

    **Change 3 — Re-skin the logo block** at lines 155-160. Current:
    ```tsx
    <div className="h-16 flex items-center px-6 border-b">
      <Link href="/crm">
        <Image src="/logo-light.png" className="block dark:hidden h-8 w-auto" alt="morfx" width={85} height={32} />
        <Image src="/logo-dark.png" className="hidden dark:block h-8 w-auto" alt="morfx" width={135} height={32} />
      </Link>
    </div>
    ```

    Change to (preserving shadcn behavior when v2=false):
    ```tsx
    <div
      className={cn(
        'h-16 flex items-center px-6 border-b',
        v2 && 'border-[var(--ink-1)]',
      )}
    >
      <Link href="/crm" aria-label="morfx — inicio">
        {v2 ? (
          <span className="font-serif text-[22px] tracking-[0.02em] text-[var(--ink-1)]">
            morf<span className="text-[var(--rubric-2)]">·</span>x
          </span>
        ) : (
          <>
            <Image src="/logo-light.png" className="block dark:hidden h-8 w-auto" alt="morfx" width={85} height={32} />
            <Image src="/logo-dark.png" className="hidden dark:block h-8 w-auto" alt="morfx" width={135} height={32} />
          </>
        )}
      </Link>
    </div>
    ```

    **Change 4 — Re-skin the navigation `<Link>` items** at lines 190-206 with editorial active/hover states gated by v2. Current Link className:
    ```tsx
    className={cn(
      'flex flex-1 items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
      isActive
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    )}
    ```

    Change to:
    ```tsx
    className={cn(
      'flex flex-1 items-center gap-3 px-3 py-2 transition-colors',
      v2
        ? cn(
            'rounded-[3px] text-[13px] tracking-[0.02em]',
            isActive
              ? 'bg-[var(--paper-3)] text-[var(--ink-1)] border-l-2 border-[var(--rubric-2)] -ml-[2px] pl-[14px] font-serif'
              : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]',
          )
        : cn(
            'rounded-md text-sm font-medium',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          ),
    )}
    ```

    Also re-skin the section borders (footer `border-t` at line 235 + workspace switcher `border-b` at line 163) with `v2 && 'border-[var(--ink-1)]'` — wrap their classNames in `cn(...)`.

    For the badge counter at lines 201-205 (`bg-destructive text-destructive-foreground`), wrap with `cn(... v2 && 'bg-[var(--rubric-2)] text-[var(--paper-0)] font-mono')` to keep the dot visually consistent under editorial.

    For the footer user info block at lines 234-268: wrap the `<div className="p-4 border-t">` with conditional border editorial. The `Avatar`, `AvatarFallback`, and `<form action={logout}>` button — when v2=true, change avatar bg to `bg-[var(--ink-1)] text-[var(--paper-0)]` and email text to `font-serif text-[13px]` (`<p className="text-sm font-medium truncate">` becomes `cn('truncate', v2 ? 'font-serif text-[13px] text-[var(--ink-1)]' : 'text-sm font-medium')`).

    **DO NOT MODIFY (D-DASH-07, D-DASH-17, Regla 6):**
    - `'use client'` directive (line 1).
    - The `navItems` array (lines 44-122) — labels, hrefs, icons, adminOnly, settingsKey, subLink, badgeType all preserved.
    - `useTaskBadge`, `useAutomationBadge`, `usePathname` hooks usage (lines 131-133) — no changes.
    - `filteredNavItems` filtering logic (lines 140-149) — no changes.
    - `WorkspaceSwitcher`, `GlobalSearch`, `Tooltip*`, `Avatar*`, `Badge`, `logout` action — no changes to props or behavior.
    - The mobile responsive `hidden md:flex` (line 152) — preserved.
    - The dark mode `Image` swapping on logo (lines 157-158) — preserved EXACTLY when v2=false.
    - Sublink (`item.subLink`) styling at lines 207-225 — preserved as shadcn (deuda conocida; mock no muestra sublink, deferir refinement a fase posterior).
    - `<form action={logout}>` button shape — only its surrounding text/icon classNames swap.

    The change is FOUR additive things gated by `v2`: prop addition, root bg/border swap, logo wordmark swap, nav active/hover swap. Every change is wrapped in `v2 ? editorial : current` — flag OFF path is byte-identical (verifiable by `git diff` showing the OLD className appears intact in the falsy branch of every cn(...) ternary).
  </action>
  <verify>
    <automated>grep -q "v2?: boolean" src/components/layout/sidebar.tsx && grep -q "v2 = false" src/components/layout/sidebar.tsx && grep -q "v2 && 'border-\[var(--ink-1)\]'\|v2 ? 'bg-\[var(--paper-1)\]" src/components/layout/sidebar.tsx && grep -q "morf<span className=\"text-\[var(--rubric-2)\]\">·</span>x" src/components/layout/sidebar.tsx && grep -q "var(--rubric-2)" src/components/layout/sidebar.tsx && grep -q "filteredNavItems" src/components/layout/sidebar.tsx && grep -q "useTaskBadge" src/components/layout/sidebar.tsx && grep -q "WorkspaceSwitcher" src/components/layout/sidebar.tsx && grep -q "logout" src/components/layout/sidebar.tsx && grep -q "bg-card" src/components/layout/sidebar.tsx && grep -q "bg-accent text-accent-foreground" src/components/layout/sidebar.tsx && npx tsc --noEmit 2>&1 | grep "sidebar\.tsx" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "v2?: boolean" src/components/layout/sidebar.tsx` (prop declared in interface).
    - `grep -q "v2 = false" src/components/layout/sidebar.tsx` (default false in destructure).
    - `grep -q "bg-\[var(--paper-1)\]" src/components/layout/sidebar.tsx` (editorial root bg).
    - `grep -q "border-\[var(--ink-1)\]" src/components/layout/sidebar.tsx` (editorial borders).
    - `grep -q "morf<span" src/components/layout/sidebar.tsx` (serif wordmark with rubric-2 dot).
    - `grep -q "var(--rubric-2)" src/components/layout/sidebar.tsx` (active state + wordmark dot).
    - `grep -q "var(--ink-2)" src/components/layout/sidebar.tsx` (nav idle text).
    - `grep -q "var(--paper-3)" src/components/layout/sidebar.tsx` (active nav bg).
    - The OLD className strings still appear in the file (Regla 6 — falsy branch of ternary preserves them):
      - `grep -q "bg-card" src/components/layout/sidebar.tsx` (root v2=false branch).
      - `grep -q "bg-accent text-accent-foreground" src/components/layout/sidebar.tsx` (nav active v2=false branch).
      - `grep -q "logo-light.png" src/components/layout/sidebar.tsx` AND `grep -q "logo-dark.png" src/components/layout/sidebar.tsx` (logo v2=false branch).
      - `grep -q "bg-destructive text-destructive-foreground" src/components/layout/sidebar.tsx` (badge v2=false branch).
    - `grep -q "filteredNavItems" src/components/layout/sidebar.tsx` (filtering logic preserved).
    - `grep -q "useTaskBadge\|useAutomationBadge" src/components/layout/sidebar.tsx` (badge hooks preserved).
    - `grep -q "WorkspaceSwitcher\|GlobalSearch\|TooltipProvider\|Avatar\|logout" src/components/layout/sidebar.tsx` (all preserved).
    - `npx tsc --noEmit` reports zero errors in `src/components/layout/sidebar.tsx`.
    - `git diff src/components/layout/sidebar.tsx` shows: 1 prop addition (interface + destructure), classes wrapped in cn(... v2 ? editorial : current ...) ternaries on root + logo container + nav links + section borders + footer text. NO deletions of existing classNames — the OLD strings appear in the v2-false branches.
    - When `v2={false}` is passed (or omitted), the rendered sidebar produces the SAME DOM as before (verifiable via React DevTools or visual diff in dev server).
  </acceptance_criteria>
  <done>Sidebar accepts `v2` prop, conditionally applies editorial re-skin (paper-1 bg, ink-1 borders, smallcaps section, rubric-2 active state, serif wordmark `morf·x`) when ON. With v2=false, sidebar is byte-identical to current. All shadcn props, hooks, navItems, filtering, tooltips, workspace switcher, badge counters, logout flow preserved exactly. Wave 1+ modules render under the cascading `.theme-editorial` className from the layout root.</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. `npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "dashboard-v2|\(dashboard\)/fonts|\(dashboard\)/layout|sidebar\.tsx"` returns NO error/Error lines.
2. `grep -n '^\.theme-editorial' src/app/globals.css` returns line 134 (existing, NOT modified by this plan).
3. `git diff src/app/globals.css src/lib/auth/inbox-v2.ts src/app/\(dashboard\)/whatsapp/fonts.ts src/app/\(dashboard\)/whatsapp/components/inbox-v2-context.tsx` returns EMPTY (Regla 6 — Somnio inbox v2 untouched, globals.css untouched).
4. `git diff src/components/layout/header.tsx src/components/layout/mobile-nav.tsx src/components/layout/theme-toggle.tsx src/components/layout/user-menu.tsx` returns EMPTY (D-DASH-17 — chrome outside layout+sidebar untouched).
5. With flag OFF (default DB state), `/crm`, `/tareas`, `/agentes`, `/automatizaciones`, `/analytics`, `/metricas`, `/configuracion` render identically to before — manual smoke: open dev server, navigate to each, observe slate UI, no editorial styling. Same for `/whatsapp` (which uses its own independent flag `ui_inbox_v2.enabled`).
6. Set the dashboard flag manually for a test workspace via SQL:
   ```sql
   UPDATE workspaces SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_dashboard_v2,enabled}', 'true'::jsonb, true) WHERE id = '<test-workspace-uuid>';
   ```
   Then reload `/crm` — DevTools inspector on the layout root div shows `class="...font-ebgaramond... font-inter... font-jetbrains-mono... flex h-screen theme-editorial"` and `--background` resolves to `oklch(0.985 0.012 82)` (paper-1) instead of `oklch(1 0 0)`. Sidebar shows wordmark `morf·x` serif + paper-1 bg + ink-1 border. Module content (CRM list) still looks shadcn (Waves 1-3 will re-skin).
7. DevTools Network tab on `/crm` shows woff2 fonts preloaded (EB Garamond roman + italic, Inter, JetBrains Mono). Same fonts requested on `/whatsapp` should be DEDUPED (no double request).
8. Git diff against `main` for in-scope NO-TOUCH files (`useConversations.ts`, hooks, agents, inngest, webhooks, action handlers, domain layer, all module pages under `(dashboard)/{crm,tareas,agentes,automatizaciones,analytics,metricas,configuracion}/`) shows ZERO changes — D-DASH-07 + Regla 6 guarantee.
</verification>

<success_criteria>
- All 4 tasks pass automated verify commands.
- Build is clean (`npx tsc --noEmit` zero new errors in modified/new files).
- With flag OFF, dashboard behavior is byte-identical to current (verifiable via DevTools + git diff of NO-TOUCH files + sidebar v2-false branches preserve OLD classNames).
- With flag ON (manual SQL), the `.theme-editorial` className is applied to the dashboard root div, fonts are exposed, sidebar shows editorial re-skin, and tokens cascade to ALL subroutes (verifiable via DevTools).
- Wave 1+ plans (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics, Configuración) can consume `useDashboardV2()` for gating new markup AND inherit the `.theme-editorial` cascade automatically.
- No globals.css modification (existing block on line 134 untouched).
- No header.tsx, no mobile-nav.tsx, no theme-toggle.tsx, no user-menu.tsx modifications (D-DASH-17 — header is not even wired to dashboard layout currently; verified by `! grep -q 'Header' src/app/\(dashboard\)/layout.tsx`).
- No domain, hooks, agents, inngest, webhooks, action handlers modifications (D-DASH-07).
- `ui_inbox_v2` flag (`/whatsapp` editorial gate) and `ui_dashboard_v2` flag (this fase gate) are independent — Somnio's current `ui_inbox_v2=true, ui_dashboard_v2=false` config produces NO visible change after this plan ships.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/01-SUMMARY.md` with:
- Commit SHAs (one per task, atomic per CLAUDE.md REGLA 0).
- Verification of all acceptance criteria.
- Explicit confirmation that flag OFF behavior is byte-identical (via `git diff` of NO-TOUCH files showing empty AND sidebar v2-false branches preserving OLD classNames inline).
- Explicit confirmation that `.theme-editorial` block in globals.css was NOT modified (via `git diff src/app/globals.css` returning empty).
- Note any deviations from the plan (e.g., if a sidebar nav item needed an extra editorial tweak, if a sublink class needed wrap, if Next next/font dedup observed correctly in DevTools).
- Handoff note to Wave 1: scaffold ready. Plans 02 (CRM), 03 (Pedidos), 04 (Tareas) can apply editorial classes to module-level components (page.tsx + components/) and gate NEW JSX with `useDashboardV2()` from `'@/components/layout/dashboard-v2-context'`. The `.theme-editorial` cascade is active at the layout root — no need to re-apply per module.
- Activation snippet for Somnio QA at the end of fase: SQL `UPDATE workspaces SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_dashboard_v2,enabled}', 'true'::jsonb, true) WHERE id = '<somnio-uuid>';` (apply only AFTER all 7 modules ship + DoD passes per Plan 09).
</output>
