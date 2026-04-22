---
phase: ui-redesign-conversaciones
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - src/lib/auth/inbox-v2.ts
  - src/app/(dashboard)/whatsapp/fonts.ts
  - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
  - src/app/(dashboard)/whatsapp/components/mx-tag.tsx
  - src/app/(dashboard)/whatsapp/components/icon-button.tsx
  - src/app/(dashboard)/whatsapp/components/day-separator.tsx
  - src/app/globals.css
  - src/app/(dashboard)/whatsapp/layout.tsx
  - src/app/(dashboard)/whatsapp/page.tsx
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
autonomous: true
requirements:
  - D-01
  - D-02
  - D-03
  - D-04
  - D-05
  - D-06
  - D-07
  - D-08
  - D-09
  - D-10
  - D-11
  - D-19
  - D-21

must_haves:
  truths:
    - "Helper `getIsInboxV2Enabled(workspaceId: string): Promise<boolean>` existe en `src/lib/auth/inbox-v2.ts`, lee `workspaces.settings.ui_inbox_v2.enabled` via `createClient()` de `@/lib/supabase/server`, fail-closed (returns false on error) — mirror byte-pattern de `getIsSuperUser()`"
    - "Archivo `src/app/(dashboard)/whatsapp/fonts.ts` exporta `ebGaramond`, `inter`, `jetbrainsMono` desde `next/font/google` con variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono` (D-09, D-10) — Cormorant Garamond NO se carga (UI-SPEC §6.3)"
    - "`src/app/globals.css` contiene un bloque `.theme-editorial { ... }` (~170 lineas) APPENDED despues de `.dark { ... }` y ANTES de `@layer base { ... }` con: tokens custom (paper/ink/rubric/accent/font/fs/space/radius/paper-grain/paper-fibers), shadcn token overrides (D-05), aliases internos, root background-image + font-family, defensive `.dark .theme-editorial { ... }` block, y utilities `.mx-display/h1..h4/body/body-long/caption/smallcaps/rubric/marginalia/ui/mono/rule*/tag/tag--*/skeleton` todas prefijadas con `.theme-editorial` selector (D-07)"
    - "`src/app/(dashboard)/whatsapp/layout.tsx` aplica las 3 variables de fuente al wrapper div (`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`) — preserva `h-full` actual"
    - "`src/app/(dashboard)/whatsapp/page.tsx` agrega `getIsInboxV2Enabled(workspaceId)` como 4to await en el `Promise.all` existente (despues de `getIsSuperUser()`) y forwards `v2={isInboxV2}` prop a `<InboxLayout>` (D-02)"
    - "`InboxLayoutProps` declara `v2?: boolean` con default `false` (D-19) y JSDoc analogo a `isSuperUser?: boolean` existente"
    - "`InboxLayout` root div aplica `cn('flex h-full', v2 && 'theme-editorial')` + `data-module=\"whatsapp\"` attribute (para scoping del `/` shortcut Wave 1) — cuando `v2=false`, className y DOM son byte-identical al actual"
    - "Componente nuevo `<InboxV2Provider>` en `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` envuelve a los children del root del InboxLayout y expone hook `useInboxV2(): boolean` para que componentes downstream consulten el flag sin prop drilling (RESEARCH Open Question 2 — Option B)"
    - "Componente compartido `<MxTag variant='rubric|gold|indigo|verdigris|ink'>` existe en `src/app/(dashboard)/whatsapp/components/mx-tag.tsx` — render `<span className={'mx-tag mx-tag--${variant}'}>` con `cn` util (RESEARCH Example 4)"
    - "Componente compartido `<IconButton aria-label=... children=...>` existe en `src/app/(dashboard)/whatsapp/components/icon-button.tsx` — 32x32 button con clases `inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--ink-1)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)] disabled:opacity-50 disabled:cursor-not-allowed`, aria-label REQUERIDO (D-24), forwardRef (RESEARCH Example 5)"
    - "Componente compartido `<DaySeparator date={Date}>` existe en `src/app/(dashboard)/whatsapp/components/day-separator.tsx` — usa `format(date, \"EEEE d 'de' MMMM\", { locale: es })` + capitalize first char + render `<div className='flex justify-center py-3'><span className='mx-smallcaps text-[var(--ink-3)] text-[11px] tracking-[0.06em]'>— {capitalized} —</span></div>` (UI-SPEC §7.5, Regla 2 timezone)"
    - "Cero cambios funcionales en `useConversations`, `markAsRead`, `getConversation`, realtime, webhooks, action handlers (D-19) — verificable por git diff"
    - "Build pasa: `npx tsc --noEmit` clean en todos los archivos nuevos/modificados (errores pre-existentes vitest/somnio quedan out-of-scope)"
    - "Comportamiento con flag OFF byte-identical al actual: con `ui_inbox_v2.enabled` ausente o `false`, el modulo `/whatsapp` renderiza el UI shadcn-slate exacto que tiene hoy (Regla 6 garantizada para D-03 QA lado a lado)"
  artifacts:
    - path: "src/lib/auth/inbox-v2.ts"
      provides: "Server-side flag resolver getIsInboxV2Enabled(workspaceId)"
      exports: ["getIsInboxV2Enabled"]
      contains: "workspaces.settings.ui_inbox_v2.enabled"
    - path: "src/app/(dashboard)/whatsapp/fonts.ts"
      provides: "EB Garamond + Inter + JetBrains Mono via next/font/google"
      exports: ["ebGaramond", "inter", "jetbrainsMono"]
    - path: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      provides: "InboxV2Provider + useInboxV2 hook (avoid prop drilling for v2 gate)"
      exports: ["InboxV2Provider", "useInboxV2"]
    - path: "src/app/(dashboard)/whatsapp/components/mx-tag.tsx"
      provides: "Editorial pill wrapper"
      exports: ["MxTag"]
    - path: "src/app/(dashboard)/whatsapp/components/icon-button.tsx"
      provides: "32x32 ibtn with mandatory aria-label"
      exports: ["IconButton"]
    - path: "src/app/(dashboard)/whatsapp/components/day-separator.tsx"
      provides: "Editorial day separator '— Martes 21 de abril —'"
      exports: ["DaySeparator"]
    - path: "src/app/globals.css"
      provides: ".theme-editorial scope block + mx-* utilities"
      contains: ".theme-editorial"
    - path: "src/app/(dashboard)/whatsapp/layout.tsx"
      provides: "Per-route font variable wrapper (RESEARCH Pattern 2)"
      contains: "ebGaramond.variable"
    - path: "src/app/(dashboard)/whatsapp/page.tsx"
      provides: "Flag threading via Promise.all + v2 prop"
      contains: "getIsInboxV2Enabled"
    - path: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      provides: "v2?: boolean prop + conditional .theme-editorial className"
      contains: "v2 && 'theme-editorial'"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/page.tsx"
      to: "src/lib/auth/inbox-v2.ts"
      via: "import + Promise.all entry"
      pattern: "getIsInboxV2Enabled"
    - from: "src/app/(dashboard)/whatsapp/page.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      via: "v2 prop"
      pattern: "v2={isInboxV2}"
    - from: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      to: "src/app/globals.css .theme-editorial"
      via: "className"
      pattern: "theme-editorial"
    - from: "src/app/(dashboard)/whatsapp/layout.tsx"
      to: "src/app/(dashboard)/whatsapp/fonts.ts"
      via: "next/font variable classNames"
      pattern: "ebGaramond.variable"
---

<objective>
Wave 0 — Infrastructure foundation. Plant the entire scaffolding necessary for the editorial re-skin BEFORE touching any visible component. After this plan ships:

- The flag `workspaces.settings.ui_inbox_v2.enabled` resolves server-side and threads through to InboxLayout as `v2` prop.
- The `.theme-editorial` CSS scope exists in `globals.css` with all custom tokens, shadcn token overrides (D-05), and `mx-*` utility classes (D-07) — but is NOT applied anywhere because no workspace has the flag set yet.
- Editorial fonts (EB Garamond, Inter, JetBrains Mono) preload per-route on `/whatsapp` only.
- Three optional shared components (`<MxTag>`, `<IconButton>`, `<DaySeparator>`) are available for downstream waves.
- A React Context `<InboxV2Provider>` exposes `useInboxV2()` so child components can gate NEW JSX (eyebrows, day separators, bot ornaments) without prop drilling (RESEARCH Open Question 2 — Option B).

**Purpose:** This plan ships zero visible change for any user. Everything is gated behind the flag, which defaults to `false`. This is the safest way to land ~170 lines of CSS + 5 new files + 4 modified files (Regla 6 strict — agent productivo intacto).

**Output:** All scaffolding for Waves 1–5 to consume. Downstream plans reference `useInboxV2()`, `<MxTag>`, `<IconButton>`, `<DaySeparator>`, and assume the `.theme-editorial` className wraps their root.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/standalone/ui-redesign-conversaciones/CONTEXT.md
@.planning/standalone/ui-redesign-conversaciones/RESEARCH.md
@.planning/standalone/ui-redesign-conversaciones/UI-SPEC.md
@.planning/standalone/ui-redesign-conversaciones/PATTERNS.md
@CLAUDE.md
@.claude/rules/code-changes.md
@.claude/rules/gsd-workflow.md

# Analog code for direct copy:
@src/lib/auth/super-user.ts
@src/app/layout.tsx
@src/components/ui/button.tsx
@src/components/ui/badge.tsx
@src/app/(dashboard)/whatsapp/page.tsx
@src/app/(dashboard)/whatsapp/layout.tsx
@src/app/(dashboard)/whatsapp/components/inbox-layout.tsx

<interfaces>
<!-- Existing contracts the executor must preserve. -->

From src/lib/auth/super-user.ts (analog for inbox-v2.ts):
```typescript
export const SUPER_USER_ID_ENV = 'MORFX_OWNER_USER_ID' as const
export function getSuperUserId(): string | null
export async function getIsSuperUser(): Promise<boolean>  // fail-closed try/catch
export async function assertSuperUser(): Promise<void>
```

From src/app/layout.tsx (font loading analog):
```typescript
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// applied as: <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
```

From src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (existing prop pattern):
```typescript
interface InboxLayoutProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  initialSelectedId?: string
  clientConfig?: ClientActivationConfig | null
  isSuperUser?: boolean   // <-- existing optional flag prop pattern; mirror for v2
}
```

From src/app/(dashboard)/whatsapp/page.tsx (current Promise.all):
```typescript
const [initialConversations, clientConfig, isSuperUser] = await Promise.all([
  getConversations({ status: 'active', sortBy: 'last_customer_message' }),
  getClientActivationSettings(),
  getIsSuperUser(),
])
```

Tailwind v4 `@theme inline` block at globals.css lines 6–47 maps `--color-primary: var(--primary)` etc. — NEVER add `@theme` inside `.theme-editorial` (RESEARCH Anti-Patterns).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Server-side flag helper + page.tsx threading</name>
  <files>src/lib/auth/inbox-v2.ts, src/app/(dashboard)/whatsapp/page.tsx</files>
  <read_first>
    - src/lib/auth/super-user.ts (full file — copy shape verbatim)
    - src/app/(dashboard)/whatsapp/page.tsx (full file — current Promise.all is at lines 28–33)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `## Feature Flag Resolution Pattern` section (lines ~645–740)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 1. src/lib/auth/inbox-v2.ts` (lines 28–112)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 8. src/app/(dashboard)/whatsapp/page.tsx` (lines 448–490)
  </read_first>
  <action>
    **Step 1 — Create `src/lib/auth/inbox-v2.ts`** with the EXACT shape below. Mirror the fail-closed try/catch pattern of `getIsSuperUser`. Namespace is `ui_inbox_v2` (NOT `ui_inbox_v2_enabled`) per RESEARCH Pattern 3 — leaves room for future sub-keys like retention_days. Key is `enabled`. Full JSONB path: `workspaces.settings.ui_inbox_v2.enabled` (per D-01).

    ```typescript
    /**
     * UI Inbox v2 flag resolver.
     *
     * Decision D-01 / D-02 in
     * .planning/standalone/ui-redesign-conversaciones/CONTEXT.md:
     * the editorial re-skin of /whatsapp is gated per-workspace via
     * `workspaces.settings.ui_inbox_v2.enabled: boolean`, default false.
     *
     * Pattern mirrors:
     * - src/lib/auth/super-user.ts (getIsSuperUser for /super-admin gating)
     * - src/components/layout/sidebar.tsx settingsKey convention
     *   (e.g., 'conversation_metrics.enabled')
     *
     * Namespace: 'ui_inbox_v2' (NOT 'ui_inbox_v2_enabled' — the latter
     * leaves no room for future sub-keys like retention_days). Key: 'enabled'.
     * Full JSONB path: workspaces.settings.ui_inbox_v2.enabled.
     *
     * Usage: call from Server Components only. Caller must already have the
     * active workspaceId (via getActiveWorkspaceId()).
     *
     * Fails closed: any error, null settings, or missing key returns false.
     * Guarantees Regla 6 — if the flag check itself breaks, the user sees
     * the current (slate) inbox, never a half-rendered editorial one.
     */

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

    **Step 2 — Modify `src/app/(dashboard)/whatsapp/page.tsx`** to add the helper as the 4th entry in the existing `Promise.all` and forward as `v2` prop. The current `Promise.all` at lines 28–33 destructures `[initialConversations, clientConfig, isSuperUser]`; extend to `[..., isInboxV2]`. Add the import at the top. Update the `<InboxLayout>` props block at lines 53–60 to include `v2={isInboxV2}`. **DO NOT** touch the `findConversationByPhone` fallback (lines 36–51), the early-return null branch (lines 17–26), or any other logic.

    Specifically, change the import block to add:
    ```typescript
    import { getIsInboxV2Enabled } from '@/lib/auth/inbox-v2'
    ```

    Change the Promise.all to:
    ```typescript
    const [initialConversations, clientConfig, isSuperUser, isInboxV2] = await Promise.all([
      getConversations({ status: 'active', sortBy: 'last_customer_message' }),
      getClientActivationSettings(),
      getIsSuperUser(),
      getIsInboxV2Enabled(workspaceId),
    ])
    ```

    Change the `<InboxLayout>` JSX to add the `v2` prop AFTER `isSuperUser={isSuperUser}` (D-19 NO-TOUCH list applies to all OTHER props):
    ```tsx
    <InboxLayout
      workspaceId={workspaceId}
      initialConversations={initialConversations}
      initialSelectedId={initialSelectedId}
      clientConfig={clientConfig}
      isSuperUser={isSuperUser}
      v2={isInboxV2}
    />
    ```

    **DO NOT MODIFY (D-19, D-20):** `findConversationByPhone`, `getConversations`, `getClientActivationSettings`, `getIsSuperUser`, `getActiveWorkspaceId`, the no-workspace fallback. Cero cambios funcionales — solo additive prop threading.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "src/lib/auth/inbox-v2|src/app/\(dashboard\)/whatsapp/page" | grep -v "node_modules" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/auth/inbox-v2.ts` exists.
    - `grep -q "export async function getIsInboxV2Enabled" src/lib/auth/inbox-v2.ts` returns 0.
    - `grep -q "ui_inbox_v2" src/lib/auth/inbox-v2.ts` returns 0 (namespace).
    - `grep -q "ns?.enabled === true" src/lib/auth/inbox-v2.ts` returns 0 (fail-closed comparison).
    - `grep -q "createClient } from '@/lib/supabase/server'" src/lib/auth/inbox-v2.ts` returns 0 (correct import).
    - `grep -q "getIsInboxV2Enabled" src/app/\(dashboard\)/whatsapp/page.tsx` returns 0 (helper imported and called).
    - `grep -q "v2={isInboxV2}" src/app/\(dashboard\)/whatsapp/page.tsx` returns 0 (prop threaded).
    - The Promise.all destructure includes `isInboxV2` (verify with grep `\[initialConversations, clientConfig, isSuperUser, isInboxV2\]`).
    - `npx tsc --noEmit` reports zero errors in `src/lib/auth/inbox-v2.ts` and `src/app/(dashboard)/whatsapp/page.tsx` (pre-existing vitest/somnio errors are out-of-scope and tolerated).
    - Git diff shows page.tsx changes are PURELY ADDITIVE: existing lines preserved, only new import + new Promise.all entry + new prop pass.
  </acceptance_criteria>
  <done>Helper exists, fails closed, threaded into Promise.all, forwarded to InboxLayout as `v2` prop. Zero behavioral change when DB has no flag set (default false).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Editorial CSS scope block in globals.css + per-route fonts.ts + layout font wrapper</name>
  <files>src/app/(dashboard)/whatsapp/fonts.ts, src/app/(dashboard)/whatsapp/layout.tsx, src/app/globals.css</files>
  <read_first>
    - src/app/globals.css (full file, 126 lines — CRITICAL: identify the exact insertion point AFTER `.dark { ... }` block ending line 116 and BEFORE `@layer base { ... }` starting line 118)
    - src/app/layout.tsx lines 1–35 (Geist font loader analog)
    - src/app/(dashboard)/whatsapp/layout.tsx (full 11 LOC — current state)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `## Token Architecture` section, lines 234–560 (~170 lines of CSS to copy verbatim)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `## Font Loading Strategy` section, lines 563–642
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `## Force-Light Theme Inside Subtree` lines 743–776 (explains the .dark .theme-editorial defensive block)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `### Pitfall 1` (anti-pattern: NEVER nest @theme inside .theme-editorial)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 2. fonts.ts` and `### 6. globals.css` and `### 7. layout.tsx`
  </read_first>
  <action>
    **Step 1 — Create `src/app/(dashboard)/whatsapp/fonts.ts`** with EXACT content below. EB Garamond loads with full weight range AND italic style (`mx-caption` and `mx-marginalia` use italic per UI-SPEC §6). Inter and JetBrains Mono use variable axis. Cormorant Garamond is NOT loaded (UI-SPEC §6.3 — cascade falls to Times/Georgia, saves ~40KB).

    ```typescript
    // src/app/(dashboard)/whatsapp/fonts.ts
    //
    // Per-route font preload for the editorial re-skin of /whatsapp.
    // Per RESEARCH Pattern 2 + Next.js 16 docs: declaring fonts here makes
    // Next preload them ONLY on /whatsapp/** routes (not on /crm, /tareas, etc.).
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

    **Step 2 — Modify `src/app/(dashboard)/whatsapp/layout.tsx`** to attach the 3 font CSS variables to the existing wrapper div. The current file is 11 LOC (`<div className="h-full">{children}</div>`). Modify to:

    ```tsx
    import { ebGaramond, inter, jetbrainsMono } from './fonts'

    export default function WhatsAppLayout({
      children,
    }: {
      children: React.ReactNode
    }) {
      return (
        <div className={`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}>
          {children}
        </div>
      )
    }
    ```

    The variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono` are now exposed in the subtree unconditionally. When flag is OFF the variables are present but no one reads them (zero regression — `--font-display/serif/sans/mono` only resolve inside `.theme-editorial`).

    **Step 3 — Modify `src/app/globals.css`** to APPEND the editorial scope block. The insertion point is AFTER the existing `.dark { ... }` block (which ends around line 116) and BEFORE `@layer base { ... }` (which starts around line 118). Read the file first to confirm exact line numbers; the exact location matters because Tailwind v4 evaluates `@theme inline` at the top, then `:root` and `.dark` define base tokens, and our scope must layer on top.

    The full CSS block to append is documented verbatim in `RESEARCH.md` `## Token Architecture` section starting at the `.theme-editorial { ... }` declaration on line ~246 and ending at the closing `}` of the `prefers-reduced-motion` block on line ~554. **Copy that ENTIRE block (~170 lines, ~310 lines counting the `.dark .theme-editorial` defensive block + all `mx-*` utilities) verbatim into globals.css** between `.dark { ... }` and `@layer base { ... }`.

    The block contains, in order:
    1. `.theme-editorial { color-scheme: light; --paper-0..4, --paper-shadow, --ink-1..5, --rubric-1..3, --accent-verdigris/gold/indigo, --semantic-success/warning/danger/info, --rule, --border-strong, --font-display/serif/sans/mono/small-caps, --fs-display/h1/h2/h3/h4/body/body-sm/caption/micro, --lh-tight/display/heading/body/long, --space-1..9, --radius-0..3/pill, --shadow-hair/page/card/raised, --paper-grain (data:image/svg+xml...), --paper-fibers (data:image/svg+xml...), shadcn token overrides per UI-SPEC §4 mapping (--background → paper-1, --foreground → ink-1, --primary → ink-1 NOT rubric, --accent → paper-3, --destructive → rubric-2, --border, --input, --ring → ink-1, --radius → radius-3), root background-color/image/blend-mode/font-family/font-feature-settings/-webkit-font-smoothing/text-rendering }`
    2. `.dark .theme-editorial { /* repeat shadcn token overrides only (NOT custom tokens — those cascade) */ }` defensive block to win specificity over `.dark` selector when next-themes applies dark mode globally.
    3. `.theme-editorial .mx-display`, `.mx-h1`, `.mx-h2`, `.mx-h3`, `.mx-h4`, `.mx-body`, `.mx-body-long`, `.mx-caption`, `.mx-smallcaps`, `.mx-rubric`, `.mx-marginalia`, `.mx-ui`, `.mx-mono`
    4. `.theme-editorial .mx-rule`, `.mx-rule-double`, `.mx-rule-thick`, `.mx-rule-ornament`
    5. `.theme-editorial .mx-tag`, `.mx-tag--rubric`, `.mx-tag--gold`, `.mx-tag--indigo`, `.mx-tag--verdigris`, `.mx-tag--ink` (using `color-mix(in oklch, ...)`)
    6. `@keyframes mx-pulse` + `.theme-editorial .mx-skeleton`
    7. `@media (prefers-reduced-motion: reduce) { .theme-editorial * { animation-duration: 0.01ms !important; ... } }`

    Plus add a `/* PAPER TEXTURE FALLBACK — uncomment if Safari retina QA flags regression */` commented-out block with the Pattern B `::before` pseudo-element fallback (RESEARCH `## Paper Texture Performance` lines 793–809) so it's a one-commit rollback if needed.

    **CRITICAL anti-pattern (RESEARCH Pitfall 1):** NEVER put `@theme { ... }` inside `.theme-editorial { ... }`. Tailwind v4 only allows `@theme` at top level. Inside `.theme-editorial` use ONLY plain CSS variable declarations.

    **DO NOT MODIFY:** the existing `:root { ... }`, `.dark { ... }`, `@theme inline { ... }`, `@import "tailwindcss"`, `@import "tw-animate-css"`, `@custom-variant dark (...)`, or `@layer base { ... }` blocks. Strictly additive.
  </action>
  <verify>
    <automated>grep -q "\.theme-editorial" src/app/globals.css && grep -q "\.theme-editorial \.mx-tag--rubric" src/app/globals.css && grep -q "\.dark \.theme-editorial" src/app/globals.css && grep -q "ebGaramond" src/app/\(dashboard\)/whatsapp/fonts.ts && grep -q "ebGaramond.variable" src/app/\(dashboard\)/whatsapp/layout.tsx && npx tsc --noEmit 2>&1 | grep -E "fonts\.ts|whatsapp/layout\.tsx" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/(dashboard)/whatsapp/fonts.ts` exists with 3 named exports: `ebGaramond`, `inter`, `jetbrainsMono`.
    - `grep -q "EB_Garamond" src/app/\(dashboard\)/whatsapp/fonts.ts` returns 0.
    - `grep -q "Inter" src/app/\(dashboard\)/whatsapp/fonts.ts` returns 0.
    - `grep -q "JetBrains_Mono" src/app/\(dashboard\)/whatsapp/fonts.ts` returns 0.
    - `! grep -q "Cormorant" src/app/\(dashboard\)/whatsapp/fonts.ts` (NOT loaded per UI-SPEC §6.3).
    - `grep -q "style: \['normal', 'italic'\]" src/app/\(dashboard\)/whatsapp/fonts.ts` (italic loaded for `mx-caption` / `mx-marginalia`).
    - `grep -q "ebGaramond.variable" src/app/\(dashboard\)/whatsapp/layout.tsx` AND `grep -q "inter.variable" src/app/\(dashboard\)/whatsapp/layout.tsx` AND `grep -q "jetbrainsMono.variable" src/app/\(dashboard\)/whatsapp/layout.tsx`.
    - `grep -q "h-full" src/app/\(dashboard\)/whatsapp/layout.tsx` (existing class preserved).
    - `grep -c "^\.theme-editorial" src/app/globals.css` returns ≥ 1 (the main block) — and specifically the bare `.theme-editorial {` selector line.
    - `grep -q "color-scheme: light" src/app/globals.css` (Pitfall 3 mitigation).
    - `grep -q "\.dark \.theme-editorial" src/app/globals.css` (defensive override block).
    - `grep -q "\-\-paper-grain" src/app/globals.css` AND `grep -q "\-\-paper-fibers" src/app/globals.css`.
    - `grep -q "\-\-primary: var(--ink-1)" src/app/globals.css` (CRITICAL: --primary maps to ink-1, NOT rubric — UI-SPEC §4 critical note).
    - `grep -q "\.theme-editorial \.mx-tag--rubric" src/app/globals.css` (utility scoped, not bare `.mx-tag--rubric`).
    - `grep -q "color-mix(in oklch" src/app/globals.css` (pills constructed via color-mix).
    - `grep -q "@keyframes mx-pulse" src/app/globals.css` (skeleton animation defined).
    - `grep -q "prefers-reduced-motion" src/app/globals.css` (a11y handled).
    - `! grep -E "@theme[^a-z]" src/app/globals.css | grep -A 1 "theme-editorial"` (NEVER `@theme` inside `.theme-editorial` — anti-pattern).
    - The existing `:root { ... }`, `.dark { ... }` (lines ~84–116), and `@layer base { ... }` blocks are unchanged (verify by counting their lines stay constant — `:root` has 32 token lines, `.dark` has 32 token lines).
    - `npx tsc --noEmit` clean for `fonts.ts` and `layout.tsx`.
    - Comment block `/* PAPER TEXTURE FALLBACK */` present in globals.css (one-commit rollback prep — Pitfall 6).
  </acceptance_criteria>
  <done>Editorial CSS scope exists in globals.css (~170+ lines), fonts preload only on /whatsapp routes, layout wrapper exposes font variables. CSS scope is INERT (not applied anywhere yet — that happens in Task 4 via the InboxLayout className). Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Shared editorial components (MxTag, IconButton, DaySeparator) + InboxV2 Context</name>
  <files>src/app/(dashboard)/whatsapp/components/mx-tag.tsx, src/app/(dashboard)/whatsapp/components/icon-button.tsx, src/app/(dashboard)/whatsapp/components/day-separator.tsx, src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx</files>
  <read_first>
    - src/components/ui/badge.tsx (MxTag analog — shape only, ignore cva)
    - src/components/ui/button.tsx (IconButton shape analog)
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx lines 12, 225–234 (existing inline day separator)
    - src/lib/utils.ts (cn util)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md Examples 4 (MxTag), 5 (IconButton) at lines 962–1026
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 3, 4, 5` (analog patterns)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.5 (DaySeparator), §7.7 (ibtn), §7.12 (mx-tag)
  </read_first>
  <action>
    **Step 1 — Create `src/app/(dashboard)/whatsapp/components/mx-tag.tsx`** as a thin wrapper around `.mx-tag--*` CSS classes (defined in Task 2 globals.css). Per RESEARCH Alternatives Considered: do NOT use `class-variance-authority` — adds runtime cost for zero benefit on static utility classes.

    ```tsx
    // src/app/(dashboard)/whatsapp/components/mx-tag.tsx
    import type { ComponentProps, ReactNode } from 'react'
    import type { LucideIcon } from 'lucide-react'
    import { cn } from '@/lib/utils'

    type MxTagVariant = 'rubric' | 'gold' | 'indigo' | 'verdigris' | 'ink'

    interface MxTagProps extends Omit<ComponentProps<'span'>, 'children'> {
      variant: MxTagVariant
      icon?: LucideIcon
      children: ReactNode
    }

    /**
     * Editorial pill (UI-SPEC §7.12). Wraps the `.mx-tag` + `.mx-tag--{variant}`
     * CSS classes defined in `src/app/globals.css` under `.theme-editorial` scope.
     *
     * Outside `.theme-editorial`, the classes have no effect (Pitfall 8 — scoped
     * by selector). Renders a plain unstyled <span>.
     *
     * Use INSTEAD OF shadcn `<Badge>` (RESEARCH Primitive Map row "Badge" — bypass).
     */
    export function MxTag({ variant, icon: Icon, children, className, ...rest }: MxTagProps) {
      return (
        <span
          data-variant={variant}
          className={cn('mx-tag', `mx-tag--${variant}`, className)}
          {...rest}
        >
          {Icon ? <Icon className="h-[10px] w-[10px]" aria-hidden /> : null}
          {children}
        </span>
      )
    }
    ```

    **Step 2 — Create `src/app/(dashboard)/whatsapp/components/icon-button.tsx`** as the editorial 32x32 icon button with mandatory `aria-label`. Per RESEARCH Primitive Map "Button (outline/ghost)" row: do NOT reuse shadcn `Button` for `ibtn` because it has custom size and the editorial hover (paper-3) is cleaner than shadcn's default accent blend.

    ```tsx
    // src/app/(dashboard)/whatsapp/components/icon-button.tsx
    import { forwardRef, type ComponentProps, type ReactNode } from 'react'
    import { cn } from '@/lib/utils'

    interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
      /** REQUIRED — Spanish aria-label per D-24. */
      'aria-label': string
      children: ReactNode
      /** Optional pressed state (e.g. toggle buttons). */
      pressed?: boolean
    }

    /**
     * Editorial 32x32 icon button (UI-SPEC §7.7). Mandatory `aria-label` (D-24).
     * Used in chat-header actions, conversation-list filters, etc.
     *
     * Outside `.theme-editorial`, the `var(--*)` references resolve to the
     * shadcn-slate tokens (which is fine for SSR safety — but this component
     * is intended to be used INSIDE the scope only).
     */
    export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
      function IconButton({ className, pressed, children, ...rest }, ref) {
        return (
          <button
            ref={ref}
            type="button"
            data-pressed={pressed || undefined}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center',
              'rounded-[4px] border border-[var(--border)]',
              'bg-[var(--paper-0)] text-[var(--ink-2)]',
              'transition-colors',
              'hover:bg-[var(--paper-3)] hover:text-[var(--ink-1)]',
              'active:translate-y-px',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              pressed && 'bg-[var(--paper-3)] text-[var(--ink-1)]',
              className,
            )}
            {...rest}
          >
            {children}
          </button>
        )
      },
    )
    ```

    **Step 3 — Create `src/app/(dashboard)/whatsapp/components/day-separator.tsx`** with EXACT content. Mirrors the existing `format(messageDate, "d 'de' MMMM, yyyy", { locale: es })` pattern from chat-view.tsx line 232. America/Bogota timezone is the device default for CO users (Regla 2) — no `date-fns-tz` needed.

    ```tsx
    // src/app/(dashboard)/whatsapp/components/day-separator.tsx
    'use client'

    import { format } from 'date-fns'
    import { es } from 'date-fns/locale'

    /**
     * Editorial day separator (UI-SPEC §7.5):
     *   `— Martes 21 de abril —` (smallcaps ink-3)
     *
     * Timezone: America/Bogota is the app default (CLAUDE.md Regla 2);
     * `new Date(timestamp)` inherits the CO locale and needs no
     * date-fns-tz wrapper.
     *
     * Em-dashes (U+2014) wrap the label; weekday name capitalized
     * (date-fns es locale lowercases it by default).
     */
    export function DaySeparator({ date }: { date: Date }) {
      const label = format(date, "EEEE d 'de' MMMM", { locale: es })
      const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
      return (
        <div className="flex justify-center py-3">
          <span className="mx-smallcaps text-[var(--ink-3)] text-[11px] tracking-[0.06em]">
            — {capitalized} —
          </span>
        </div>
      )
    }
    ```

    **Step 4 — Create `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx`** to expose the v2 flag to descendants without prop drilling (RESEARCH Open Question 2 — Option B recommended).

    ```tsx
    // src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
    'use client'

    import { createContext, useContext, type ReactNode } from 'react'

    /**
     * Inbox v2 context (RESEARCH Open Question 2 — Option B: context vs prop drilling).
     *
     * The `v2` flag controls whether NEW JSX renders (eyebrows above titles,
     * editorial day separators, bot ornaments, etc.). Re-skin-only changes
     * (className swaps gated by .theme-editorial CSS scope) do NOT need this
     * context — they happen automatically via the cascade.
     *
     * Use ONLY in client components that need to gate NEW markup based on
     * the flag. Default value is `false` so any component rendered outside
     * the InboxV2Provider sees flag-off behavior (Regla 6 fail-closed).
     */

    const InboxV2Context = createContext<boolean>(false)

    export function InboxV2Provider({
      v2,
      children,
    }: {
      v2: boolean
      children: ReactNode
    }) {
      return <InboxV2Context.Provider value={v2}>{children}</InboxV2Context.Provider>
    }

    export function useInboxV2(): boolean {
      return useContext(InboxV2Context)
    }
    ```

    **DO NOT MODIFY:** any existing component, hook, or server action. These are 4 NEW files only.
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/whatsapp/components/mx-tag.tsx && test -f src/app/\(dashboard\)/whatsapp/components/icon-button.tsx && test -f src/app/\(dashboard\)/whatsapp/components/day-separator.tsx && test -f src/app/\(dashboard\)/whatsapp/components/inbox-v2-context.tsx && npx tsc --noEmit 2>&1 | grep -E "mx-tag|icon-button|day-separator|inbox-v2-context" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/(dashboard)/whatsapp/components/mx-tag.tsx` exports named `MxTag`.
    - `grep -q "mx-tag--\${variant}" src/app/\(dashboard\)/whatsapp/components/mx-tag.tsx` returns 0 (variant template literal).
    - `! grep -q "class-variance-authority\|cva" src/app/\(dashboard\)/whatsapp/components/mx-tag.tsx` (NOT using cva — RESEARCH alternatives).
    - File `src/app/(dashboard)/whatsapp/components/icon-button.tsx` exports named `IconButton`.
    - `grep -q "forwardRef" src/app/\(dashboard\)/whatsapp/components/icon-button.tsx`.
    - `grep -q "'aria-label': string" src/app/\(dashboard\)/whatsapp/components/icon-button.tsx` (mandatory aria-label per D-24).
    - `grep -q "h-8 w-8" src/app/\(dashboard\)/whatsapp/components/icon-button.tsx` (32x32 size).
    - `grep -q "active:translate-y-px" src/app/\(dashboard\)/whatsapp/components/icon-button.tsx`.
    - File `src/app/(dashboard)/whatsapp/components/day-separator.tsx` exports named `DaySeparator`.
    - `grep -q "EEEE d 'de' MMMM" src/app/\(dashboard\)/whatsapp/components/day-separator.tsx` (date-fns format string).
    - `grep -q "from 'date-fns'" src/app/\(dashboard\)/whatsapp/components/day-separator.tsx` AND `grep -q "from 'date-fns/locale'" src/app/\(dashboard\)/whatsapp/components/day-separator.tsx`.
    - `grep -q "mx-smallcaps" src/app/\(dashboard\)/whatsapp/components/day-separator.tsx` (uses scoped utility).
    - `grep -q "— " src/app/\(dashboard\)/whatsapp/components/day-separator.tsx` (em-dash wrappers).
    - File `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` exports `InboxV2Provider` and `useInboxV2`.
    - `grep -q "createContext<boolean>(false)" src/app/\(dashboard\)/whatsapp/components/inbox-v2-context.tsx` (default false — fail-closed).
    - `grep -q "'use client'" src/app/\(dashboard\)/whatsapp/components/inbox-v2-context.tsx`.
    - `npx tsc --noEmit` reports zero errors in all 4 new files.
  </acceptance_criteria>
  <done>Four shared editorial components exist and compile clean. `<MxTag>`, `<IconButton>`, `<DaySeparator>` are imported by Waves 1-4. `useInboxV2()` provides the gate for NEW markup without prop drilling.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Wire InboxLayout — apply .theme-editorial className conditionally + provide InboxV2 context</name>
  <files>src/app/(dashboard)/whatsapp/components/inbox-layout.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (full 183 LOC — pay attention to lines 27–47 for the `isSuperUser` analog prop, line 116 for the root div, and lines 110+ for the Allotment usage which must NOT be touched)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 9. inbox-layout.tsx` lines 493–533
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `### Example 1 — Applying the scoped wrapper` lines 845–865
    - src/lib/utils.ts (cn util — verify import path)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` with THREE additive changes:

    **Change 1 — Add `cn` import.** The file currently does NOT import `cn`. Add at the top of the imports section (after `import 'allotment/dist/style.css'`):
    ```typescript
    import { cn } from '@/lib/utils'
    import { InboxV2Provider } from './inbox-v2-context'
    ```

    **Change 2 — Add `v2?: boolean` prop to `InboxLayoutProps`.** Add the new prop AFTER the existing `isSuperUser?: boolean` (lines 27–33). Use the IDENTICAL JSDoc shape:
    ```typescript
    /**
     * UI Inbox v2 flag (Standalone ui-redesign-conversaciones, D-01/D-02).
     * Resolved server-side via `getIsInboxV2Enabled(workspaceId)` in
     * `src/lib/auth/inbox-v2.ts`. When false, the editorial re-skin is OFF
     * and the layout renders byte-identical to today (Regla 6 zero
     * regression). When true, the root div gets `.theme-editorial` class
     * which cascades all shadcn token overrides + custom paper/ink/rubric
     * tokens to the entire subtree.
     */
    v2?: boolean
    ```

    Add `v2 = false` to the destructured props at line 47 (after `isSuperUser = false`).

    **Change 3 — Apply `.theme-editorial` className conditionally + add `data-module="whatsapp"` attribute + wrap children with `InboxV2Provider`.** The current root div at line 116 is:
    ```tsx
    <div className="flex h-full">
    ```

    Change to:
    ```tsx
    <InboxV2Provider v2={v2}>
      <div className={cn('flex h-full', v2 && 'theme-editorial')} data-module="whatsapp">
        {/* ... existing children unchanged ... */}
      </div>
    </InboxV2Provider>
    ```

    The `data-module="whatsapp"` attribute is used by the Wave 1 keyboard shortcut to scope `/` to this module (RESEARCH Example 6). It's a harmless data attribute when flag is OFF.

    **DO NOT MODIFY (D-19, D-20):**
    - `useState`, `useCallback`, `useEffect` hooks
    - `markAsRead`, `getConversation` calls
    - Allotment usage (lines 133–147)
    - `<ChatView>`, `<ContactPanel>`, `<AgentConfigSlider>`, `<DebugPanelProduction>` props
    - The `debugPanelOpen && isSuperUser && selectedConversationId` conditional branch (must remain byte-identical for non-super-users — already preserved by Phase 42.1 Regla 6 work)
    - Any handler logic, state initialization, refresh logic, realtime side-effects
    - The `noopRefreshOrders`, `RightPanel`, `InboxLayoutProps` types

    The change is THREE additive things only: an import, a prop, and a className+attribute+wrapper change on the outermost div.
  </action>
  <verify>
    <automated>grep -q "v2?: boolean" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && grep -q "v2 && 'theme-editorial'" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && grep -q "data-module=\"whatsapp\"" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && grep -q "InboxV2Provider" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && grep -q "import { cn } from '@/lib/utils'" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && npx tsc --noEmit 2>&1 | grep "inbox-layout" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "v2?: boolean" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` (prop declared in interface).
    - `grep -q "v2 = false," src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` OR `grep -q "v2 = false$" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` (default false in destructure).
    - `grep -q "cn('flex h-full', v2 && 'theme-editorial')" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` (conditional className).
    - `grep -q 'data-module="whatsapp"' src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` (module scope attribute).
    - `grep -q "import { cn } from '@/lib/utils'" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx`.
    - `grep -q "import { InboxV2Provider } from './inbox-v2-context'" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx`.
    - `grep -q "<InboxV2Provider v2={v2}>" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx`.
    - The file still references `useState`, `useCallback`, `useEffect`, `Allotment`, `markAsRead`, `getConversation`, `DebugPanelProduction`, `AgentConfigSlider`, `ChatView`, `ContactPanel`, `ConversationList` — verify with grep each is still present (Regla 6 NO-TOUCH guard).
    - `npx tsc --noEmit` reports zero errors in `inbox-layout.tsx`.
    - `git diff src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` shows ONLY: 2 import additions, 1 JSDoc + prop addition, 1 destructure default addition, 1 wrapper change on the root div (InboxV2Provider + data-module + cn className). No deletions.
  </acceptance_criteria>
  <done>InboxLayout accepts `v2` prop, conditionally applies `.theme-editorial` className + `data-module` attribute, and wraps children with `InboxV2Provider`. With flag OFF, runtime DOM is byte-identical to today (only diff: 1 inert data attribute and 1 inert provider with no consumers in scope yet). Wave 1+ depends on this scope being active.</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. `npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "inbox-v2|fonts\.ts|globals\.css|mx-tag|icon-button|day-separator|inbox-layout|whatsapp/page|whatsapp/layout"` returns NO error/Error lines.
2. With flag OFF (default DB state), `/whatsapp` renders identically to before — manual smoke: open dev server, navigate to /whatsapp, observe slate UI, no editorial styling.
3. Set the flag manually for a test workspace via SQL:
   ```sql
   UPDATE workspaces SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_inbox_v2,enabled}', 'true'::jsonb, true) WHERE id = '<test-workspace-uuid>';
   ```
   Then reload `/whatsapp` — observe that `<body>` has the same slate look (because no components have been re-skinned yet) BUT DevTools inspector on the InboxLayout root div shows `class="flex h-full theme-editorial"` and `--background` resolves to `oklch(0.985 0.012 82)` (paper-1) instead of `oklch(1 0 0)`.
4. DevTools Network tab on `/whatsapp` shows 4 woff2 fonts preloaded (EB Garamond roman + italic, Inter, JetBrains Mono).
5. DevTools Network tab on `/crm` shows ZERO editorial font preloads — only Geist (per-route preload working correctly).
6. Git diff against `main` for the in-scope NO-TOUCH files (`useConversations.ts`, `markAsRead`, `getConversation`, action handlers, hooks, webhooks, `DebugPanelProduction`, `AgentConfigSlider`) shows ZERO changes — Regla 6 guarantee.
</verification>

<success_criteria>
- All 4 tasks pass automated verify commands.
- Build is clean (`npx tsc --noEmit` zero new errors).
- With flag OFF, behavior is byte-identical to current /whatsapp (verifiable via DevTools + git diff of NO-TOUCH files).
- With flag ON (manual SQL), the `.theme-editorial` className is applied to the inbox root div and tokens cascade (verifiable via DevTools).
- Fonts preload only on /whatsapp (verifiable via Network tab).
- Wave 1+ plans can consume `<MxTag>`, `<IconButton>`, `<DaySeparator>`, and `useInboxV2()`.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-conversaciones/01-SUMMARY.md` with:
- Commits SHAs (one per task)
- Verification of all acceptance criteria
- Explicit confirmation that flag OFF behavior is byte-identical (via git diff of NO-TOUCH files)
- Note any deviations from the plan (e.g., if `--paper-grain` SVG syntax needed escaping in CSS, or if a font weight had to change)
- Handoff note to Wave 1: scaffold ready, downstream plans can apply editorial classes and gate NEW JSX with `useInboxV2()`.
</output>
