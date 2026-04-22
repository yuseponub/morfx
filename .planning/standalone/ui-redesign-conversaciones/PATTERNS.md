# PATTERNS — UI Redesign Conversaciones

**Mapped:** 2026-04-22
**Files analyzed:** 16 (5 new, 11 modified)
**Analogs found:** 16 / 16 (1 partial)

Maps each new/modified file to its closest analog in the codebase with concrete code excerpts. Gated behind the per-workspace flag `ui_inbox_v2.enabled` (Regla 6 — agent in production stays untouched when flag is off).

---

## Conventions

| Concern | Canonical analog | Notes |
|---------|------------------|-------|
| Server-side flag helper | `src/lib/auth/super-user.ts` → `getIsSuperUser()` | Fail-closed, awaits `createClient()` from `@/lib/supabase/server`, catches any Supabase error and returns `false`. Our helper takes an explicit `workspaceId` because the flag lives in `workspaces.settings` JSONB, not in env vars. |
| Workspace settings JSONB read (client side — already filtered) | `src/components/layout/sidebar.tsx` lines 138–149 | `settings?.[ns]?.[key]` (two-level access). Server-side read uses `supabase.from('workspaces').select('settings').eq('id', workspaceId).single()` — see `src/lib/domain/workspace-settings.ts:48–62`. |
| `next/font/google` loading | `src/app/layout.tsx` lines 2–15 | Per-route preload: import in `app/(dashboard)/whatsapp/layout.tsx` — Next.js preloads only on `/whatsapp/**`. |
| Conditional className | `cn('base', condition && 'extra')` from `@/lib/utils` | Already imported in every component in scope. |
| Tailwind v4 tokens | `bg-primary`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-background`, `bg-accent`, `hover:bg-accent`, `bg-destructive`, `text-primary`, `bg-primary/10`, `bg-primary/20`, `text-primary-foreground` — all already present in the 8 components | Inside `.theme-editorial` these resolve to editorial tokens via cascade; NEVER hardcode OKLCH in TSX. |
| Parallel server fetch in `page.tsx` | `Promise.all([...])` in `src/app/(dashboard)/whatsapp/page.tsx` line 29 | Add `getIsInboxV2Enabled(workspaceId)` as a 4th awaited call. |
| Portal container re-root for Radix dropdowns inside `.theme-editorial` | No existing analog — new pattern | `ref` on theme-editorial wrapper + `DropdownMenuPortal container={ref.current}` (RESEARCH §Pattern 4). |
| Date formatting es-CO | `src/app/(dashboard)/whatsapp/components/chat-view.tsx:232` → `format(messageDate, "d 'de' MMMM, yyyy", { locale: es })` | Reuse verbatim for day separator. `America/Bogota` is already the app-wide default (CLAUDE.md Regla 2) — no `date-fns-tz` needed because `new Date(message.timestamp)` is rendered in the user's locale, which on CO devices is `America/Bogota`. |

---

## NEW FILES

### 1. `src/lib/auth/inbox-v2.ts`

**Role:** Server-side flag resolver
**Data flow:** request-response (Supabase → boolean)
**Pattern analog (exact):** `src/lib/auth/super-user.ts` (full file, 80 LOC)
**Match quality:** exact (role + data flow identical)

**Verbatim skeleton to copy from `super-user.ts` lines 23–68 and adapt:**

```typescript
// src/lib/auth/super-user.ts (lines 23–68) — ANALOG
import { createClient } from '@/lib/supabase/server'

export const SUPER_USER_ID_ENV = 'MORFX_OWNER_USER_ID' as const

export function getSuperUserId(): string | null {
  const raw = process.env[SUPER_USER_ID_ENV]
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function getIsSuperUser(): Promise<boolean> {
  const expected = getSuperUserId()
  if (!expected) return false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return false
    return user.id === expected
  } catch {
    return false
  }
}
```

**Adaptation for `inbox-v2.ts`:**
- Takes `workspaceId: string` parameter (not env var).
- Reads `workspaces.settings` JSONB (not `auth.users.id`).
- Namespace: `ui_inbox_v2`, key: `enabled` (RESEARCH §Pattern 3).
- Same fail-closed try/catch behavior.
- Same `createClient()` from `@/lib/supabase/server` (authenticated client, not admin).

**Target shape:**
```typescript
// src/lib/auth/inbox-v2.ts (NEW — to create)
import { createClient } from '@/lib/supabase/server'

/**
 * Returns true if the workspace has `settings.ui_inbox_v2.enabled === true`.
 * Fails closed on any error (missing workspace, Supabase error, malformed JSONB).
 * Same pattern as `getIsSuperUser()` (src/lib/auth/super-user.ts).
 */
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

**JSONB path read pattern** (cross-reference — `sidebar.tsx` lines 138–147 shows the nested two-level access convention that matches `settingsKey: '<namespace>.<key>'`):
```tsx
const settings = currentWorkspace?.settings as Record<string, unknown> | null | undefined
// ...
const [ns, key] = item.settingsKey.split('.')
const nsObj = settings?.[ns] as Record<string, unknown> | undefined
if (!nsObj?.[key]) return false
```

**Imports to replicate verbatim:** `import { createClient } from '@/lib/supabase/server'`.

---

### 2. `src/app/(dashboard)/whatsapp/fonts.ts`

**Role:** Font CSS-variable definitions (module-scoped preload)
**Data flow:** build-time (next/font)
**Pattern analog:** `src/app/layout.tsx` lines 2–15 (Geist setup)
**Match quality:** exact (same API, different family list)

**Verbatim excerpt from `app/layout.tsx`:**
```tsx
// src/app/layout.tsx lines 2, 7–15 — ANALOG
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

**Adaptation for `fonts.ts` (recommended by RESEARCH §Standard Stack):**
```tsx
// src/app/(dashboard)/whatsapp/fonts.ts (NEW)
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

export const ebGaramond = EB_Garamond({
  variable: '--font-ebgaramond',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  // Variable font — no weight array needed; defaults to full range 100–900
})

export const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})
```

**Key convention to replicate:** `variable: '--font-<family>'` exposes the font as a CSS custom property that the `.theme-editorial` scope consumes via `--font-display: var(--font-ebgaramond), ...` (RESEARCH Token Architecture lines 281–285).

**Why NOT in root `app/layout.tsx`:** RESEARCH §Pattern 2 / §Alternatives Considered — per-route preload saves ~200–300KB on every other dashboard route.

---

### 3. `src/app/(dashboard)/whatsapp/components/mx-tag.tsx` (OPTIONAL thin wrapper)

**Role:** Presentational tag pill (per editorial variant)
**Data flow:** pure render (no state, no effects)
**Pattern analog:** `src/components/ui/badge.tsx` (entire file, 48 LOC) — shape only
**Match quality:** role-match (structural only; CVA bypassed per RESEARCH §Alternatives Considered)

**Analog — shape to mimic WITHOUT cva:**
```tsx
// src/components/ui/badge.tsx lines 29–46 — ANALOG shape (ignore cva)
function Badge({ className, variant = "default", asChild = false, ...props }: …) {
  const Comp = asChild ? Slot : "span"
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}
```

**Adaptation — plain CSS classes (RESEARCH §Alternatives: "CVA adds runtime cost for zero benefit"):**
```tsx
// src/app/(dashboard)/whatsapp/components/mx-tag.tsx (NEW — OPTIONAL)
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type MxTagVariant = 'rubric' | 'gold' | 'indigo' | 'verdigris' | 'ink'

export function MxTag({
  variant,
  className,
  ...props
}: ComponentProps<'span'> & { variant: MxTagVariant }) {
  return (
    <span
      data-variant={variant}
      className={cn(`mx-tag--${variant}`, className)}
      {...props}
    />
  )
}
```

**Imports to replicate:** `import { cn } from '@/lib/utils'` (same as every component in the module).
**CSS classes `.mx-tag--*` come from the `globals.css` block (file 6).** This React wrapper exists only so callers don't repeat `className="mx-tag--rubric"` everywhere.

---

### 4. `src/app/(dashboard)/whatsapp/components/icon-button.tsx` (OPTIONAL wrapper)

**Role:** 32×32 icon button with mandatory `aria-label`
**Data flow:** pure render
**Pattern analog:** `src/components/ui/button.tsx` (the `Button` `forwardRef` + cva shape) + existing `size="icon"` callsites in `chat-header.tsx` lines 316–323
**Match quality:** role-match

**Analog — existing 32×32 icon button pattern used ~12 times in `chat-header.tsx`:**
```tsx
// src/app/(dashboard)/whatsapp/components/chat-header.tsx lines 315–324 — ANALOG
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8"
  onClick={handleMarkAsRead}
  title="Marcar como leido"
>
  <Check className="h-4 w-4" />
</Button>
```

**Shape from `Button` to mimic (signature, asChild, cn):**
```tsx
// src/components/ui/button.tsx lines 37–56 — ANALOG shape
function Button({ className, variant, size, asChild = false, ...props }: …) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

**Adaptation (RESEARCH §Shadcn Primitive Inheritance Map — row "`Button` (outline / ghost)"):**
```tsx
// src/app/(dashboard)/whatsapp/components/icon-button.tsx (NEW — OPTIONAL)
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** REQUIRED — a11y (D-24). */
  'aria-label': string
  children: ReactNode
  /** Optional active state (e.g. Debug bot toggle). */
  pressed?: boolean
}

export function IconButton({ className, pressed, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      data-pressed={pressed || undefined}
      className={cn(
        'ibtn inline-flex h-8 w-8 items-center justify-center rounded-md',
        'text-[var(--ink-2)] transition-colors',
        'hover:bg-[var(--paper-3)] active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        pressed && 'bg-[var(--paper-3)] text-[var(--ink-1)]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
```

**Why NOT reuse `Button` (from RESEARCH Primitive Map):**
> *"`ibtn` (32×32 icon button) should NOT reuse `Button` — it has a custom size (h-8 w-8), and the accent-hover → paper-3 mapping makes the hover cleaner than shadcn's default `accent` blend."*

---

### 5. `src/app/(dashboard)/whatsapp/components/day-separator.tsx` (OPTIONAL helper)

**Role:** Day-separator rule (`— Martes 21 de abril —`)
**Data flow:** pure render
**Pattern analog:** `src/app/(dashboard)/whatsapp/components/chat-view.tsx` lines 12, 225–234 (current day separator) + `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx:61` (date formatter)
**Match quality:** exact

**Analog — current inline day separator in `chat-view.tsx`:**
```tsx
// chat-view.tsx lines 12, 225–234 — ANALOG
import { differenceInHours, isSameDay, format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'

// ...
{showDateSeparator && (
  <div className="flex justify-center py-3">
    <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
      {isToday(messageDate)
        ? 'Hoy'
        : isYesterday(messageDate)
          ? 'Ayer'
          : format(messageDate, "d 'de' MMMM, yyyy", { locale: es })}
    </span>
  </div>
)}
```

**Analog — capitalize-friendly formatter in `order-sheet.tsx`:**
```tsx
// src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx line 61 — ANALOG
return format(new Date(date), "d 'de' MMMM, yyyy", { locale: es })
```

**Adaptation (UI-SPEC §7.5 editorial day separator: `— Martes 21 de abril —`):**
```tsx
// src/app/(dashboard)/whatsapp/components/day-separator.tsx (NEW — OPTIONAL)
'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Editorial day separator: `— Martes 21 de abril —` (smallcaps ink-3).
 * Timezone: America/Bogota is the app default (CLAUDE.md Regla 2);
 * `new Date(ts)` inherits the CO locale and needs no date-fns-tz wrapper.
 */
export function DaySeparator({ date }: { date: Date }) {
  // e.g. "Martes 21 de abril"
  const label = format(date, "EEEE d 'de' MMMM", { locale: es })
  // Capitalize first char (es locale lowercases weekday name).
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

**Imports verbatim from analog:** `import { format } from 'date-fns'` + `import { es } from 'date-fns/locale'`.

**Integration point (in `chat-view.tsx`):** the existing inline block at lines 225–234 is replaced by `<DaySeparator date={messageDate} />` ONLY inside `.theme-editorial`. Outside the scope, the current rounded-pill separator stays intact (the CSS cascade handles it via token override for the simpler case; helper usage is an explicit visual replacement).

---

## MODIFIED FILES

### 6. `src/app/globals.css` — APPEND editorial scope

**Current state:** 126 lines (Tailwind v4 `@theme inline` + `:root` + `.dark` + minimal `@layer base`). See Read output lines 1–126.

**Insertion point:** After existing `.dark { … }` block (line 116), BEFORE `@layer base { … }` (line 118).

**Pattern analog (in the SAME file):** `:root { --primary: oklch(...); --background: oklch(...); ... }` at lines 49–82, plus `.dark { --primary: ...; ... }` at lines 84–116.

**Modification type:** PURELY ADDITIVE — `~170` lines of CSS. The existing `:root` and `.dark` blocks are UNTOUCHED.

**Concrete addition (verbatim from RESEARCH §Token Architecture lines 238–500+):**
- `.theme-editorial { color-scheme: light; --paper-0..4, --ink-1..5, --rubric-1..3, --accent-*, --font-display/serif/sans/mono, --fs-*, --space-*, --radius-*, --paper-grain, --paper-fibers, + shadcn token overrides (--background, --foreground, --primary, --accent, --ring, --radius, etc.), + root background-image, font-family, font-feature-settings }`
- `.dark .theme-editorial { /* repeat shadcn overrides to win specificity */ }`
- `.theme-editorial .mx-display { ... }`, `.mx-h1..h4`, `.mx-body`, `.mx-body-long`, `.mx-caption`, `.mx-smallcaps`, `.mx-rubric`, `.mx-marginalia`, `.mx-ui`, `.mx-mono`
- `.theme-editorial .mx-rule` / `.mx-rule-double` / `.mx-rule-thick` / `.mx-rule-ornament`
- `.theme-editorial .mx-tag--rubric / --gold / --indigo / --verdigris / --ink` (constructed with `color-mix(in oklch, ...)`)
- `.theme-editorial ::placeholder { color: var(--ink-3); }` (and similar defensive selectors per UI-SPEC state matrix)

**Conflict check:** None.
- The existing `:root` OKLCH values are NOT touched.
- `.dark` block is NOT touched (only extended via the higher-specificity `.dark .theme-editorial` selector).
- Tailwind v4 `@theme inline` at lines 6–47 remains the source for utilities; our scope just redefines the variables they reference. RESEARCH §Pattern 1 confirms this is the canonical mechanism.

**Anti-pattern to avoid:** NEVER put `@theme` inside `.theme-editorial` — Tailwind v4 rejects nested `@theme` (RESEARCH §Anti-Patterns).

---

### 7. `src/app/(dashboard)/whatsapp/layout.tsx` (current 11 LOC — minimal diff)

**Current state (verbatim):**
```tsx
export default function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-full">
      {children}
    </div>
  )
}
```

**Pattern analog:** `src/app/layout.tsx` lines 29–30 (applying font `.variable` classes to a wrapper + `suppressHydrationWarning`).

**Excerpt from analog:**
```tsx
// src/app/layout.tsx line 30 — ANALOG
<body
  className={`${geistSans.variable} ${geistMono.variable} antialiased`}
  suppressHydrationWarning
>
```

**Modification (additive, preserves existing behavior):**
```tsx
// src/app/(dashboard)/whatsapp/layout.tsx (TARGET)
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

**Diff intent:** Add the 3 CSS-variable classes to the wrapper. This exposes `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono` to the subtree unconditionally; `.theme-editorial` then wires them up to `--font-display/serif/sans/mono`. When flag is OFF, the variables are present but no one reads them (zero regression).

**Why NOT gate fonts on flag:** The font `.variable` declarations are pure CSS (no runtime cost beyond a `style=""` attribute); gating adds complexity for no bundle win. The preload cost is per-route (only on `/whatsapp`), already optimal.

---

### 8. `src/app/(dashboard)/whatsapp/page.tsx`

**Pattern analog (in the same file):** existing `getIsSuperUser()` call inside `Promise.all` at lines 29–33.

**Current state of `Promise.all` (verbatim, lines 28–33):**
```tsx
// Fetch initial conversations, client config, and super-user flag in parallel
const [initialConversations, clientConfig, isSuperUser] = await Promise.all([
  getConversations({ status: 'active', sortBy: 'last_customer_message' }),
  getClientActivationSettings(),
  getIsSuperUser(),
])
```

**Modification:**
```tsx
// TARGET
import { getIsSuperUser } from '@/lib/auth/super-user'
import { getIsInboxV2Enabled } from '@/lib/auth/inbox-v2'  // NEW

// ...
const [initialConversations, clientConfig, isSuperUser, isInboxV2] = await Promise.all([
  getConversations({ status: 'active', sortBy: 'last_customer_message' }),
  getClientActivationSettings(),
  getIsSuperUser(),
  getIsInboxV2Enabled(workspaceId),  // NEW — takes workspaceId from line 15
])
```

**Pass to `<InboxLayout>` (lines 53–61):**
```tsx
<InboxLayout
  workspaceId={workspaceId}
  initialConversations={initialConversations}
  initialSelectedId={initialSelectedId}
  clientConfig={clientConfig}
  isSuperUser={isSuperUser}
  v2={isInboxV2}  // NEW
/>
```

**Diff intent:** Add one flag read + one prop pass. No changes to the early-return branch (line 17–26) or the `findConversationByPhone` fallback (lines 36–51).

---

### 9. `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` (183 LOC)

**Pattern analog (in same file):** existing optional `isSuperUser?: boolean` prop pattern (lines 27–33, 42, 47).

**Analog excerpt:**
```tsx
// inbox-layout.tsx lines 27–33 — ANALOG prop shape
/**
 * Super-user flag (Phase 42.1, Decision #6). Resolved server-side via `getIsSuperUser()`.
 * When false, the production debug panel button is not rendered and the layout
 * behaves identically to before (Regla 6 — zero regression for regular users).
 */
isSuperUser?: boolean
```

**Also analog (conditional className in components elsewhere):** `cn('base', condition && 'extra')` — used in `conversation-item.tsx:68–71`:
```tsx
className={cn(
  'w-full text-left p-3 border-b transition-colors hover:bg-muted/50',
  isSelected && 'bg-muted'
)}
```

**Modification plan:**
1. Add `cn` import: `import { cn } from '@/lib/utils'` (currently not imported).
2. Add optional prop `v2?: boolean` with identical JSDoc pattern to `isSuperUser`.
3. Apply `.theme-editorial` conditionally to the root `<div className="flex h-full">` at line 116:
   ```tsx
   // TARGET line 116
   <div className={cn('flex h-full', v2 && 'theme-editorial')} data-module="whatsapp">
   ```
4. Optional `data-module="whatsapp"` attribute to support RESEARCH §Architectural Responsibility Map row "Keyboard shortcut `/` scoping" (`useEffect` check for `document.activeElement.closest('[data-module="whatsapp"]')`).

**Zero-touch constraints (D-19):**
- NO changes to `useState`, `useCallback`, `useEffect`, realtime subscriptions, `markAsRead`, `getConversation`.
- NO changes to `Allotment` usage (line 133–147) — it already works; its internal classes (`.sash-module_sash__K-9lB`, etc. — obfuscated CSS modules) cascade the token overrides for free because they reference `--border` and friends. **Confirmed:** `node_modules/allotment/dist/style.css` uses locally-scoped class names; no visible global class to style. The sash color will auto-follow `--border` via the `border-r`/`border-l` Tailwind classes on surrounding `<div>`s.
- NO changes to `ChatView` / `ContactPanel` / `AgentConfigSlider` props.

**Conflict check:** Existing classes `bg-background`, `border-r`, `border-l`, `w-80`, `flex-shrink-0` at lines 118, 164 — ALL token-based, inherit cleanly. No hardcoded colors.

---

### 10. `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` (302 LOC)

**Pattern analog:** existing header/filter block at lines 132–233 (for structural re-skin); `SearchInput` and `InboxFilters` sub-components for the `/` shortcut candidate.

**Re-skin targets (per UI-SPEC §7.2, §7.3):**

**A. NEW markup — Eyebrow + Display h1 (gated with `v2 &&` per RESEARCH Open Question 2 — v2 receives the prop explicitly):**
```tsx
// Insert at top of the return, before the existing header div at line 134
{v2 ? (
  <div className="px-4 pt-5 pb-2">
    <span className="mx-smallcaps text-[var(--rubric-2)] text-[11px] tracking-[0.08em]">
      Módulo · whatsapp
    </span>
    <h1 className="mx-display text-[44px] leading-[1.05] mt-1">Conversaciones</h1>
  </div>
) : null}
```
This requires adding `v2?: boolean` to `ConversationListProps` (pass from `inbox-layout.tsx`).

**B. RE-SKIN of existing header (unconditional when inside `.theme-editorial` — cascade handles it):**
```tsx
// conversation-list.tsx lines 134 — CURRENT
<div className="px-3 py-2 border-b flex items-center justify-between">
  <div className="flex items-center gap-2">
    <h2 className="font-semibold">Conversaciones</h2>
```
Inside `.theme-editorial`, `border-b` → `border-border` → `var(--ink-1-ish)`, `font-semibold` + `.theme-editorial` body font-family makes it serif. No JSX change needed for the existing `<h2>` — but UI-SPEC §7.2 replaces this h2 with the new h1 from block A; gate the old `<div className="px-3 py-2 border-b ...">` with `{!v2 && …}` or refactor to merge.

**Recommended approach per UI-SPEC:** when `v2=true`, the whole "Conversaciones header + tabs + search" block is redesigned as a single editorial header (eyebrow + display title + underlined tabs + editorial search). When `v2=false`, render the current markup unchanged. This is cleanest as an `if (v2) return <EditorialHeader …/> ; else return <CurrentHeader …/>` split inside the component, OR gate each block with `v2 &&` / `!v2 &&`.

**C. Tabs block (lines 158–233) — redesign per UI-SPEC §7.2 underline-only:**
- Current: `<InboxFilters value={filter} onChange={setFilter} />` + 3 `<Button size="icon">` (Sort / Agent / Tag filter popover).
- Per RESEARCH §Shadcn Primitive Inheritance Map row "`Tabs`": "build the tab bar manually (plain `<div>` with `<button>` children) rather than force-style shadcn Tabs". The existing `InboxFilters` component IS already a plain button bar (not shadcn `Tabs`) — confirm its internals.
- Re-skin the trigger buttons (Sort icon, Agent icon, Tag popover): currently `variant={active ? 'default' : 'ghost'}` + `h-8 w-8` — under `.theme-editorial`, "ghost" becomes paper-2 hover, "default" becomes ink-1 solid. Works via cascade. Replace `h-8 w-8` with the `ibtn` class from the optional `<IconButton>` wrapper (file 4) for consistency.

**D. Keyboard shortcut `/` (D-23):**
Add a scoped `useEffect` (RESEARCH §Architectural Responsibility Map):
```tsx
// NEW useEffect in conversation-list.tsx (gated with v2)
useEffect(() => {
  if (!v2) return
  function handler(e: KeyboardEvent) {
    // Only fire when focus is inside the /whatsapp module and not already in an input
    const inInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
    if (inInput) return
    const inModule = (e.target as HTMLElement).closest('[data-module="whatsapp"]')
    if (!inModule) return
    if (e.key === '/') {
      e.preventDefault()
      searchInputRef.current?.focus()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [v2])
```
Requires a `searchInputRef` forwarded from `<SearchInput>`. RESEARCH verified GlobalSearch uses `Cmd+K` not `/`, so no conflict.

**E. Empty states (lines 237–263) — replace strings with UI-SPEC §10 copy:**
- Loading (D-14): keep the spinner BUT replace with 3 skeleton items (`bg-[var(--paper-2)] border`) when `v2 && isLoading`.
- Empty bandeja (D-15): `<p className="mx-h3">La bandeja está limpia.</p><p className="mx-caption">Cuando llegue un mensaje nuevo aparecerá aquí.</p><p className="mx-rule-ornament">· · ·</p>`
- Empty filter (D-16): `<p className="mx-h4">Nada coincide con los filtros activos.</p>` + link-style "Limpiar filtros" button.

**Zero-touch constraints (D-19):** `useConversations` hook, `getTagsForScope`, `refresh`, `refreshOrders`, `markAsReadLocally`, `setSortMode` — ALL preserved.

---

### 11. `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` (190 LOC)

**Pattern analog (in same file):** existing `cn(...)` + `isSelected` conditional (lines 68–71); Avatar + unread dot pattern (lines 77–101, 136–140).

**Analog excerpt (lines 66–72):**
```tsx
<button
  onClick={() => onSelect(conversation.id)}
  className={cn(
    'w-full text-left p-3 border-b transition-colors hover:bg-muted/50',
    isSelected && 'bg-muted'
  )}
>
```

**Re-skin targets (UI-SPEC §7.1):**
- Selected state: change `isSelected && 'bg-muted'` → `isSelected && 'bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] pl-[13px]'` (the `pl-[13px]` compensates for the 3px border so content doesn't shift).
- Avatar (lines 79–82): `bg-primary/20 … text-primary` → when inside `.theme-editorial`, `primary` is already `ink-1`, so `bg-primary/20` → ink-1 at 20% — close enough. But UI-SPEC §7.1 specifies `bg-[var(--paper-3)] border border-[var(--ink-1)] font-sans font-bold text-[13px] tracking-[0.02em] text-[var(--ink-1)]` (RESEARCH §Shadcn Primitive Inheritance Map row "Avatar" confirms manual override).
- Unread dot (lines 136–140): current pill shows unread count `>= 1`. UI-SPEC §7.1 wants a simple 8×8 dot at rubric-2 for "unread" + keep the numeric badge only when `> 9`. Replace with:
  ```tsx
  {conversation.unread_count > 0 && conversation.unread_count <= 9 && (
    <span className="h-2 w-2 rounded-full bg-[var(--rubric-2)] flex-shrink-0" aria-label={`${conversation.unread_count} sin leer`} />
  )}
  {conversation.unread_count > 9 && (
    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--ink-1)] px-1.5 text-[11px] font-semibold text-[var(--paper-0)]">
      {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
    </span>
  )}
  ```
- Tags (lines 177–186): `<TagBadge>` (external component from `@/components/contacts/tag-badge`) — OUT OF SCOPE to modify. Instead, when `.theme-editorial` is active, the `Badge` shadcn primitive it wraps will inherit tokens → rendering acceptable. Optionally replace with `<MxTag variant={mapColorToVariant(tag.color)}>{tag.name}</MxTag>` (file 3). Decision: keep `TagBadge` unchanged (it's a shared `/crm` component too); just add `.mx-tag--*` classes to tag overflow indicators (line 184).

**Gating strategy:** Since this component has no `v2` prop today, add optional `v2?: boolean` prop OR rely entirely on CSS cascade. RESEARCH Open Question 2: "Claude prefers CSS-only when possible". Here the selected state has structural changes (border-left + padding) that require different Tailwind classes — must gate with `v2 &&` OR use a pure-CSS rule scoped to `.theme-editorial button[data-selected='true']`. **Recommendation:** add `v2?: boolean` prop, pass from `ConversationList` which already knows the flag.

**Zero-touch constraints (D-19):** `onSelect`, `markAsReadLocally`, `getStageEmoji`, `getInitials`, `RelativeTime`, channel icons (SVGs for FB/IG) — untouched.

---

### 12. `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (293 LOC)

**Pattern analog (in same file):** existing day-separator block at lines 225–234 (replace with `<DaySeparator>` from file 5); `chat-background` style jsx block at lines 284–290 (replace pattern for ruled paper background).

**Re-skin targets (UI-SPEC §7.5):**

**A. Day separator (lines 225–234):**
Replace the `<div className="flex justify-center py-3"><span className="bg-muted text-muted-foreground ...">…</span></div>` with `<DaySeparator date={messageDate} />` (gated `v2 ?`). Isolated change — no other effect.

**B. Ruled paper background (lines 170–174, 286–289):**
Current:
```tsx
<div
  ref={parentRef}
  className="flex-1 overflow-auto chat-background"
  style={{ contain: 'strict' }}
>
// ...
<style jsx>{`
  .chat-background {
    background-color: hsl(var(--background));
    background-image: url("data:image/svg+xml,...");
  }
`}</style>
```
Under `.theme-editorial`, `hsl(var(--background))` resolves to an HSL-wrapped OKLCH value — invalid CSS. **This is a bug introduced by the scope** (the current code assumes shadcn's old `hsl()` wrapper; the v4 tokens are bare OKLCH values). Mitigation: replace `background-color: hsl(var(--background))` with `background-color: var(--background)` (works for BOTH themes — OKLCH in both). Also replace the SVG with the editorial `--paper-grain` texture when `v2`:
```tsx
<style jsx>{`
  .chat-background {
    background-color: var(--background);
    background-image: var(--paper-grain);
    background-blend-mode: multiply;
  }
`}</style>
```
Note: UI-SPEC §7.5 suggests "optional ruled paper" — if the `--paper-grain` + `--paper-fibers` from root `.theme-editorial` (CSS block 6) are sufficient, this local override can be removed entirely when `v2`.

**C. Empty state (lines 144–154):**
Current: `<div className="flex-1 flex items-center justify-center bg-muted/10">...<div className="mb-4 text-6xl opacity-20">💬</div>...`
Re-skin per UI-SPEC (handoff §10): emoji removed, `mx-h3` "Selecciona una conversación" + `mx-caption` "Elige una conversación del panel izquierdo". Gate with `v2 &&`.

**D. ChatHeader props (lines 159–165):**
NO change — passes through.

**Zero-touch constraints (D-19):** `useMessages`, `useVirtualizer`, realtime typing channel, `scrolledToBottomRef` tracking, `scheduleSafetyRefetch`, `isWindowOpen` calculation, virtual list measurement — ALL preserved.

---

### 13. `src/app/(dashboard)/whatsapp/components/chat-header.tsx` (471 LOC)

**Pattern analog (in same file):** existing 32×32 icon button pattern repeated ~12 times (lines 315–401).

**Analog excerpt (lines 315–324):**
```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8"
  onClick={handleMarkAsRead}
  title="Marcar como leido"
>
  <Check className="h-4 w-4" />
</Button>
```

**Re-skin targets (UI-SPEC §7.4):**

**A. Avatar (lines 207–211):**
Current `w-10 h-10 rounded-full bg-primary/10 … text-primary`. Per UI-SPEC: `bg-[var(--ink-1)] text-[var(--paper-0)]` when `v2`. Swap via gating.

**B. Contact info block (lines 214–239):**
Add NEW eyebrow `<span className="mx-smallcaps text-[var(--rubric-2)] text-[11px]">Contacto · activo</span>` above the `<p>` / `<button>` with `displayName`. Gate with `{v2 && …}`.
Re-skin `displayName` from `font-medium` → `mx-h4 text-[20px]` when `v2`.
Phone line (line 228): `text-xs text-muted-foreground` → `mx-mono text-[var(--ink-3)]` when `v2` (monospace serif hybrid).

**C. IconButtons (lines 314–400):**
All `<Button variant="ghost" size="icon" className="h-8 w-8">` instances — ADD `aria-label="..."` (D-24 mandate; current uses `title` only — keep both for tooltip + a11y). When `v2`, they inherit editorial styling via cascade. Optional: swap for `<IconButton>` wrapper (file 4) for cleaner markup.

**D. DropdownMenu portal (RESEARCH §Shadcn Primitive Inheritance Map row "`DropdownMenu`"):**
Chat-header itself does NOT render a `DropdownMenu` directly — it renders `<AssignDropdown>` (line 307) which does (per grep: `DropdownMenu` imported at `assign-dropdown.tsx:7`).
**Action:** `assign-dropdown.tsx` requires the portal container prop. Two options:
  1. Modify `assign-dropdown.tsx` to accept a `containerRef` prop and pass `<DropdownMenuPortal container={containerRef.current}>` internally.
  2. Forward a context from `inbox-layout.tsx` root that all dropdowns subscribe to.

**Recommendation (planner decision):** Option 1 (explicit prop passing). Requires adding `<DropdownMenuPortal>` wrapper inside `assign-dropdown.tsx:93–166` (currently `<DropdownMenu><DropdownMenuTrigger>…<DropdownMenuContent>…</DropdownMenuContent></DropdownMenu>` — shadcn's `DropdownMenuContent` auto-wraps in a portal). To re-root, switch to explicit `<DropdownMenuPortal container={container}>`.

**Zero-touch constraints (D-19):** `WindowIndicator`, `AssignDropdown` internal logic, `markAsRead`, `archiveConversation`, `toggleConversationAgent`, `getAppointmentForContact`, `confirmAppointment`, `BoldPaymentLinkButton`, GoDentist appointment dialog — ALL preserved. Only visual/className tweaks and optional portal prop on `AssignDropdown`.

---

### 14. `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` (839 LOC — RE-SKIN ONLY, NO refactor)

**Pattern analog (in same file):** existing section structure (imports already include `Button`, `Input`, `Separator`, `Select`, `TagBadge`, `WindowIndicator`, `OrderStageBadge`, `CreateTaskButton`) — lines 7–36.

**Confirmed (via grep at lines 3–36):** `contact-panel.tsx` does NOT import `conversation-tag-input.tsx`. The `ConversationTagInput` component is ONLY used in `chat-header.tsx:20, 244`. Therefore `conversation-tag-input.tsx` is OUT-OF-SCOPE for re-skin (it's only used inside the chat-header inline tag editor — its visual appearance is governed by the cascade when `.theme-editorial` is applied at the `inbox-layout` root).

**Re-skin targets (UI-SPEC §7.9–7.11 — NO structural changes per D-20):**

**A. Root container** (presumably wrapped in `<div className="...">` somewhere; needs verification by Read of line 120+):
Apply `bg-[var(--paper-2)]` + `border-l border-[var(--border)]` when `v2` — already comes for free via cascade (`bg-background` → `paper-1`, `border-l` → editorial border).

**B. Section headings (`Ficha` / `Pedidos` / `Historial`):**
Wherever current markup uses `<h3 className="font-semibold">`, swap to `<h3 className="mx-smallcaps text-[var(--ink-1)] text-[11px] tracking-[0.08em]">`. Gate with `v2 &&` or just inject `className={cn('font-semibold', v2 && 'mx-smallcaps ...')}`.

**C. Order card (UI-SPEC §7.10, `rounded-[12px] px-[11px] py-[9px]` + `shadow-card`):**
UI-SPEC §7.10 wants custom radius 12px. Existing order rows likely use shadcn `Card` or a plain `<div>`. Per RESEARCH Primitive Map row "`Card`": *"does NOT use shadcn `Card` — build as raw div"*. Check current markup and apply `rounded-xl border border-[var(--border)] bg-[var(--paper-0)] p-3 shadow-card` (where `shadow-card` is defined in the editorial token block).

**D. Definition list (`<dl>`) — 1fr/1.4fr grid (UI-SPEC §7.11):**
Wherever current markup uses `<div><span className="label">…</span><span>…</span></div>` for contact fields (nombre, teléfono, ciudad), re-skin as:
```tsx
<dl className={cn('grid gap-x-3 gap-y-1', v2 && 'grid-cols-[1fr_1.4fr] items-baseline')}>
  <dt className={cn(v2 && 'mx-smallcaps text-[var(--ink-3)]')}>Teléfono</dt>
  <dd className={cn(v2 && 'mx-mono text-[var(--ink-2)]')}>{contact.phone}</dd>
  ...
</dl>
```

**E. Timeline (if present) — UI-SPEC §7.11:**
Re-skin vertical timeline with `border-l border-[var(--ink-1)]` + dots at `bg-[var(--rubric-2)]`.

**Hard constraint (D-20 — NO structural refactor):**
The file is 839 LOC — re-skin is LOCAL className adjustments per block. Do NOT split into subcomponents in this phase. Preserve ALL hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useRouter`), `createClient` realtime subscriptions (lines 94–120+), domain action calls (`updateContactName`, `getRecentOrders`, `addOrderTag`, `moveOrderToStage`, `recompraOrder`, `getPipelines`, `getActiveProducts`), all sheets (`CreateOrderSheet`, `CreateContactSheet`, `ViewOrderSheet`), AlertDialog, Select.

**Conflict check:** existing classes `bg-primary`, `bg-primary/10`, `text-primary`, `bg-muted`, `text-muted-foreground`, `border-b` — all token-based, inherit cleanly.

---

### 15. `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` (226 LOC)

**Pattern analog (in same file):** existing `cn(…, isOwn ? '…' : '…')` alternation at lines 169–174, 184–192, 199–209.

**Analog excerpt (lines 184–192):**
```tsx
<div
  className={cn(
    'relative rounded-lg px-3 py-2 shadow-sm',
    isOwn
      ? 'bg-primary text-primary-foreground rounded-br-none'
      : 'bg-muted rounded-bl-none',
    message.status === ('sending' as any) && 'opacity-70'
  )}
>
```

**Re-skin targets (UI-SPEC §7.6):**

**A. Bubble container (lines 184–192):**
Inside `.theme-editorial`, `bg-primary` → `ink-1`, `text-primary-foreground` → `paper-0`, `bg-muted` → `paper-2` — already close. UI-SPEC refines:
- `isOwn=true`: `bg-[var(--ink-1)] text-[var(--paper-0)]` + radius `10px` with `rounded-br-[2px]` (corner on bottom-right).
- `isOwn=false`: `bg-[var(--paper-0)] border border-[var(--ink-2)] text-[var(--ink-1)]` + radius `10px` with `rounded-bl-[2px]` (corner on bottom-left).

Replace `rounded-lg` (8px) → `rounded-[10px]`; replace `rounded-br-none` → `rounded-br-[2px]`; replace `rounded-bl-none` → `rounded-bl-[2px]`. Gate with `v2 &&` OR rely on CSS (since class swap is needed for the specific corner, gating is required).

**B. Bot eyebrow (lines 177–182):**
Current:
```tsx
{isAgentMessage && (
  <div className="flex items-center gap-1 mb-0.5 mr-1">
    <Bot className="h-3 w-3 text-muted-foreground" />
    <span className="text-[10px] text-muted-foreground">Bot</span>
  </div>
)}
```
Per UI-SPEC §7.6 (sugerido state label):
```tsx
{isAgentMessage && v2 && (
  <span className="mx-rubric text-[11px] tracking-[0.08em] mb-1">
    ❦ bot · respuesta sugerida
  </span>
)}
```
Gate with `v2 &&` because the ornament character `❦` and smallcaps styling is editorial-specific.

**C. Timestamp + status (lines 199–214):**
Current: `text-[10px]` + `text-primary-foreground/70` / `text-muted-foreground`.
Per UI-SPEC §7.6: `font-mono text-[11px]` (use `--font-mono` i.e. `mx-mono` class). Color: `var(--paper-0)/70` (own) or `var(--ink-3)` (in). Checkmarks stay as `StatusIcon` unchanged.

**Zero-touch constraints (D-20 — "Bubbles del thread: solo cambian estilos visuales. Propiedades `direction`, `status`, `mediaPreview`, `templateMetadata`, `quickReplyButtons` se respetan"):**
- `MessageContent` dispatcher (lines 45–157) — NO changes. Internal media rendering, template body rendering, interactive messages, reactions, location maps — all preserved.
- `StatusIcon` (lines 18–40) — NO changes.
- `MediaPreview` import & usage (line 7, 69–76) — preserved. (media-preview.tsx is explicitly OUT-OF-SCOPE per D-20.)

---

### 16. `src/app/(dashboard)/whatsapp/components/message-input.tsx` (441 LOC)

**Pattern analog (in same file):** existing composer structure (lines 288–438 for the open-window branch; 264–286 for closed-window branch).

**Analog excerpt (lines 427–436 — Send button):**
```tsx
<Button
  size="icon"
  className="h-10 w-10 flex-shrink-0"
  onClick={handleSend}
  disabled={(!text.trim() && !attachedFile && !pendingQuickReplyMedia) || isLoading}
  title="Enviar mensaje"
>
  <Send className="h-5 w-5" />
</Button>
```

**Re-skin targets (UI-SPEC §7.8):**

**A. Container (line 289):**
Current: `<div className="flex-shrink-0 border-t bg-background">`.
Under `.theme-editorial`: `border-t` → `border-[var(--ink-1)]`, `bg-background` → `paper-0`. Cascade handles it. Consider explicit `border-t border-[var(--ink-1)]` for emphasis when `v2`.

**B. Input interior (lines 409–424 — `<QuickReplyAutocomplete>`):**
Current: `min-h-[40px] max-h-[120px] py-2`. UI-SPEC §7.8: add `bg-[var(--paper-1)]` (paper-1 interior inside paper-0 container) + `rounded-[3px]` when `v2`.

**C. Send button (lines 427–436):**
Under `.theme-editorial`, `variant="default"` (implicit — no variant = `default`) → `bg-primary` → `var(--ink-1)`, `text-primary-foreground` → `var(--paper-0)`. Already correct. Per UI-SPEC: add `active:translate-y-px` for the "pressed" affordance. Also add `aria-label="Enviar mensaje"`.

**D. Window-closed branch (lines 264–286):**
Current: `bg-yellow-50/50` + yellow text. Per UI-SPEC §10 (error/warning banner pattern — D-17): use `color-mix` over paper:
```tsx
<div className={cn(
  'flex-shrink-0 px-4 py-3 border-t',
  v2
    ? 'bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border-l-[3px] border-l-[var(--rubric-2)]'
    : 'bg-yellow-50/50 dark:bg-yellow-900/10'
)}>
```
Gate with `v2 &&` / ternary.

**E. `emoji-picker.tsx` content (opened from line 405):**
Per CONTEXT CRM-decisions + D-19: modals/popovers rendered via Radix portals stay OUTSIDE `.theme-editorial` (RESEARCH §Shadcn Primitive Inheritance Map, portal caveat). `EmojiPicker` renders inside `PopoverContent` → by default inherits editorial tokens ONLY if the Radix portal root is inside `.theme-editorial`. Since `PopoverContent` renders via Radix portal attached to `document.body`, it renders slate (intentional — matches the "modales out-of-scope" decision in CONTEXT). NO changes to `emoji-picker.tsx`.

**Zero-touch constraints (D-19):** `sendMessage`, `sendMediaMessage` server actions, `addOptimisticMessage`, `QuickReplyAutocomplete`, `TemplateButton`, file upload flow, base64 conversion, quick reply media flow, optimistic send retry toast — ALL preserved. Only className tweaks + `aria-label` additions.

---

## SHADCN PRIMITIVES — INHERITANCE PLAN (LIFT FROM RESEARCH)

Consolidated decision matrix per primitive used in the 8 in-scope components:

| Primitive | Used in | Plan | Manual override needed? |
|-----------|---------|------|-------------------------|
| `Button` (default) | chat-header (GoDentist confirm), message-input (Send) | **INHERIT** | Add `active:translate-y-px` className for editorial press affordance (UI-SPEC §13.2). |
| `Button` (ghost, size=icon, h-8 w-8) | chat-header (~10 uses), conversation-list (Sort/Agent/Tag filters) | **INHERIT** with optional `<IconButton>` wrapper swap (file 4) | Add `aria-label` everywhere (D-24). Hover auto → `paper-3`. |
| `Button` (variant=outline, in dialogs) | chat-header edit-name dialog, GoDentist dialog | **INHERIT** — but dialogs live outside scope (slate) | None. |
| `Badge` | conversation-item (Sin asignar), chat-header (FB/IG channel pills) | **BYPASS** — use `.mx-tag--*` or `<MxTag>` (file 3) when `v2` | Yes — replace `<Badge variant="outline">` with `<MxTag variant="ink">`. |
| `Popover` + `PopoverContent` | conversation-list (tag filter), message-input (emoji picker) | **INHERIT** (but portal attaches to body — renders in slate by default) | For tag-filter popover: pass `container` prop referencing `.theme-editorial` root ref if editorial look needed. For emoji picker: intentional slate (modal/popover exclusion — CONTEXT). |
| `Tooltip` | nowhere in 8 components (uses `title=` attr) | **N/A** | N/A. |
| `Avatar` / `AvatarFallback` | NOT used (both conversation-item and chat-header use raw `<div>` avatars) | **RAW DIV — override manually** | `className="w-10 h-10 rounded-full bg-[var(--ink-1)] text-[var(--paper-0)] font-sans font-bold text-[13px] tracking-[0.02em]"` |
| `ScrollArea` | conversation-list, contact-panel (indirectly) | **INHERIT** | Scrollbar color follows `--border` — works. |
| `Sheet` | CreateContactSheet, CreateOrderSheet, ViewOrderSheet | **OUT OF SCOPE per CONTEXT** | None (stays slate). |
| `Input` | chat-header (edit-name dialog), conversation-list (search via SearchInput sub-component), message-input (not used — uses `QuickReplyAutocomplete`) | **INHERIT** | None — focus-ring auto becomes ink-1. |
| `Separator` | contact-panel | **INHERIT** | None — `bg-border` → editorial border. |
| `Dialog` / `AlertDialog` | chat-header edit-name + GoDentist confirm, contact-panel AlertDialog | **INHERIT via portal — BUT portal outside scope renders slate** | Intentional slate (dialogs OUT OF SCOPE per CONTEXT). |
| `DropdownMenu` | assign-dropdown.tsx (chat-header imports `<AssignDropdown>`) | **PORTAL CAVEAT — needs `container` prop** | Modify `assign-dropdown.tsx:93–166` to accept `containerRef` prop and wrap with `<DropdownMenuPortal container={containerRef.current}>`. |
| `Card` | NOT used in 8 components (order card is raw div today) | **N/A** | Build order card markup as raw div with editorial `rounded-xl` + `shadow-card`. |
| `Label` | chat-header dialogs | **INHERIT** | None. |
| `Switch` | chat-header agent toggles | **INHERIT** | None — track (on) = ink-1, (off) = paper-2. |
| `Select` (Radix portal) | contact-panel | **PORTAL CAVEAT** | Use `SelectPortal` with container prop if editorial look needed; otherwise intentional slate. |

---

## OUT-OF-SCOPE FILES (do NOT touch)

| File | Reason |
|------|--------|
| `src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx` | Sub-component used ONLY in `chat-header.tsx:20, 244` (NOT in `contact-panel.tsx` — confirmed by grep). Cascade of `.theme-editorial` from `inbox-layout` root will re-theme it for free. Logic untouched per D-20. Do NOT modify. |
| `src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx` | D-19 — logic/UI preserved. |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/**` | D-19 — Phase 42.1 out-of-scope. |
| `src/app/(dashboard)/whatsapp/components/new-conversation-modal.tsx` | CONTEXT — modals OUT-OF-SCOPE (fase futura). |
| `src/app/(dashboard)/whatsapp/components/template-send-modal.tsx` | CONTEXT — modals OUT-OF-SCOPE. |
| `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` | CONTEXT — sheets OUT-OF-SCOPE. |
| `src/app/(dashboard)/whatsapp/components/create-contact-sheet.tsx` | CONTEXT — sheets OUT-OF-SCOPE. |
| `src/app/(dashboard)/whatsapp/components/create-order-sheet.tsx` | CONTEXT — sheets OUT-OF-SCOPE. |
| `src/app/(dashboard)/whatsapp/components/media-preview.tsx` | D-20 — no logic/visual changes inside bubbles. |
| `src/app/(dashboard)/whatsapp/components/window-indicator.tsx` | D-19 — logic preserved. Cascade inheritance should suffice; if the band visually clashes with editorial, defer minor className tweaks to planner (consider `bg-[var(--paper-2)]` + `text-[var(--ink-2)]` if necessary). |
| `src/app/(dashboard)/whatsapp/components/emoji-picker.tsx` | Popover contents via Radix portal — intentionally slate (modal exclusion). |
| `src/app/(dashboard)/whatsapp/components/availability-toggle.tsx` | D-19 — logic preserved. Visual via cascade (`Switch` inherits). |
| `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx` | D-19 — logic preserved. Visual via cascade. |
| `src/app/(dashboard)/whatsapp/components/template-button.tsx` | Opens a modal — OUT-OF-SCOPE. |
| `src/app/(dashboard)/whatsapp/components/template-preview.tsx` | Modal-adjacent — OUT-OF-SCOPE. |
| `src/app/(dashboard)/whatsapp/components/quick-reply-autocomplete.tsx` | Dropdown via Radix portal — intentional slate. Input container inherits via cascade. |
| `src/app/(dashboard)/whatsapp/components/order-status-indicator.tsx` | Shared `OrderStageBadge` — visuals via cascade. |
| `src/app/(dashboard)/whatsapp/components/filters/**` | `InboxFilters` + `SearchInput` — visual via cascade; the pattern grep (at most) adds `mx-ui` / `mx-smallcaps` classes to filter labels. Treat re-skin as in-scope ONLY if `conversation-list.tsx` refactor requires extracting new markup; otherwise leave intact. |
| `src/components/layout/sidebar.tsx` | Global sidebar — OUT-OF-SCOPE (D-12). The `.theme-editorial` wrapper lives BELOW it in the tree. |
| Hooks: `useConversations`, `useMessages`, `useTaskBadge`, `useAutomationBadge` | D-19 — zero touch. |
| `src/lib/supabase/**`, server actions under `src/app/actions/` | D-19 — zero touch except `page.tsx` (adds one `Promise.all` entry). |

**Special note — `assign-dropdown.tsx`:**
Technically NOT listed in the 8 in-scope components, BUT the DropdownMenu portal fix (RESEARCH §Shadcn Primitive Inheritance Map "DropdownMenu" row) requires either:
(a) Modifying `assign-dropdown.tsx` to accept a `containerRef` prop (tiny additive change — no logic impact), OR
(b) Accepting that the assign menu renders slate by default inside `.theme-editorial`.
**Planner decision required:** either add `assign-dropdown.tsx` to scope as a minor additive change (add one prop, wrap content in `<DropdownMenuPortal container={…}>`), or explicitly defer the visual fix and document it as known gap. Recommendation: (a) — the fix is additive and isolated.

---

## Coverage map

| File to modify | Analog | How to apply |
|---------------|--------|--------------|
| **NEW** `src/lib/auth/inbox-v2.ts` | `src/lib/auth/super-user.ts` (lines 23–68) | Copy shape verbatim; swap `process.env[SUPER_USER_ID_ENV]` read for `supabase.from('workspaces').select('settings').eq('id', workspaceId).single()` + JSONB path `settings.ui_inbox_v2.enabled`. |
| **NEW** `src/app/(dashboard)/whatsapp/fonts.ts` | `src/app/layout.tsx` (lines 2, 7–15) | Copy `next/font/google` import + factory call pattern; replace `Geist/Geist_Mono` with `EB_Garamond/Inter/JetBrains_Mono` per RESEARCH §Standard Stack. |
| **NEW** `mx-tag.tsx` | `src/components/ui/badge.tsx` (lines 29–46) — structure only | Mimic functional shape (`ComponentProps<'span'>` + `data-variant` + `cn`). SKIP cva. Apply `mx-tag--${variant}` class. |
| **NEW** `icon-button.tsx` | `src/components/ui/button.tsx` (lines 37–56) + `chat-header.tsx:315–324` | Build 32×32 button with mandatory `aria-label`, `rounded-md`, paper-3 hover, active `translate-y-px`. |
| **NEW** `day-separator.tsx` | `chat-view.tsx:225–234` + `order-sheet.tsx:61` | `format(date, "EEEE d 'de' MMMM", { locale: es })` + capitalize + editorial `—` rule + `mx-smallcaps`. |
| `src/app/globals.css` | Same-file `:root` (lines 49–82) + `.dark` (lines 84–116) | APPEND `.theme-editorial` block + `.dark .theme-editorial` + `mx-*` utilities — BEFORE `@layer base` (line 118). |
| `src/app/(dashboard)/whatsapp/layout.tsx` | `src/app/layout.tsx:30` (font `.variable` className pattern) | Add 3 CSS-variable classes to wrapper div. |
| `src/app/(dashboard)/whatsapp/page.tsx` | Same-file `Promise.all` at lines 29–33 | Add `getIsInboxV2Enabled(workspaceId)` as 4th awaited call; pass `v2={isInboxV2}` prop. |
| `inbox-layout.tsx` | Same-file `isSuperUser?: boolean` optional prop pattern (lines 27–47) | Mirror the prop shape; apply `cn('flex h-full', v2 && 'theme-editorial')` + `data-module="whatsapp"` on root div line 116. Add `cn` import. |
| `conversation-list.tsx` | Same-file header/filter structure (lines 132–233) + `cn` usages | Add `v2?: boolean` prop; gate editorial header (eyebrow + `mx-display`) with `v2 &&`; scope `/` keyboard shortcut via `data-module="whatsapp"` closest-ancestor check. |
| `conversation-item.tsx` | Same-file `cn()` + `isSelected` (lines 68–71); avatar block (lines 77–101) | Add `v2?: boolean` prop; swap selected state to `border-l-[3px] border-l-[var(--rubric-2)] pl-[13px]`; override avatar with explicit editorial classes; replace unread pill with dot when count ≤ 9. |
| `chat-view.tsx` | Same-file day separator (lines 225–234); `chat-background` style (lines 284–290) | Gate `<DaySeparator>` for `v2`; replace `hsl(var(--background))` with `var(--background)` (also fixes cross-theme bug); optional removal of local chat-background when editorial `--paper-grain` inherits from root. |
| `chat-header.tsx` | Same-file 32×32 `<Button variant="ghost" size="icon">` pattern (~10 instances) | Add eyebrow `Contacto · activo`; swap avatar bg to `var(--ink-1)`; add `aria-label` to every ibtn (D-24); gate `mx-h4`/`mx-mono` classes with `v2 &&`; request `AssignDropdown` portal container prop (see special note). |
| `contact-panel.tsx` | Same-file imports & structure (lines 7–36); section patterns | RE-SKIN ONLY: `mx-smallcaps` for section headings, `grid-cols-[1fr_1.4fr]` for `<dl>`, order-card `rounded-xl` + `shadow-card`. NO structural refactor (839 LOC preserved). |
| `message-bubble.tsx` | Same-file bubble `cn()` alternation (lines 184–192) | Swap `rounded-lg rounded-b{l|r}-none` → `rounded-[10px] rounded-b{l|r}-[2px]`; add editorial classes (`bg-[var(--ink-1)]` / `bg-[var(--paper-0)] border`); swap bot-badge for `mx-rubric` eyebrow `❦ bot · respuesta sugerida` when `v2`. |
| `message-input.tsx` | Same-file Send button + composer (lines 289–438) | Container `border-t-[var(--ink-1)]`; input interior `bg-[var(--paper-1)]`; Send button `active:translate-y-px`; re-skin closed-window banner with `color-mix` over paper + rubric-2 left border; add `aria-label`. |

---

## Key patterns identified

1. **All components already use Tailwind v4 token-based classes** (`bg-primary`, `text-muted-foreground`, `border-b`, `bg-background`, `hover:bg-accent`) — the `.theme-editorial` scope override mechanism handles them for free. Explicit `var(--ink-1)` / `var(--paper-0)` / `var(--rubric-2)` arbitrary-value classes are only required for UI-SPEC-specific pixel cases (border-left selected state, bubble corners, eyebrow color, etc.).
2. **The feature-flag resolver pattern is already established** — `getIsSuperUser()` at `src/lib/auth/super-user.ts` is the exact analog for `getIsInboxV2Enabled()`.
3. **The optional-prop gating pattern is already established** — `isSuperUser?: boolean` on `InboxLayout` mirrors exactly how we'll add `v2?: boolean`.
4. **Server-side `workspaces.settings` JSONB read is used in the domain layer** — `src/lib/domain/workspace-settings.ts:48–62` shows the exact Supabase query shape for reading; sidebar.tsx:138–147 shows the two-level JSONB access convention.
5. **DropdownMenu portal container prop** is the ONE genuinely new pattern (RESEARCH Pitfall 2) — it requires a minor additive change to `assign-dropdown.tsx` that is NOT in the original 8-component scope; planner must decide whether to include it.
6. **`date-fns` + `es` locale** is the universal date formatter in the repo (~20 callsites). No `date-fns-tz` needed for the day separator.
7. **Allotment sash classes are obfuscated CSS modules** (`sash-module_sash__K-9lB` etc.) — the executor does NOT need to override them; cascading `--border` / `--ring` tokens through Tailwind utility classes on surrounding divs is sufficient.

---

## PATTERN MAPPING COMPLETE
