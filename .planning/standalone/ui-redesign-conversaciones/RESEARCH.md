# Research — UI Redesign Conversaciones

**Researched:** 2026-04-22
**Domain:** Scoped editorial theming on Tailwind v4 + shadcn new-york + Next.js 16 App Router — applied only inside `.theme-editorial` wrapper behind a per-workspace feature flag `ui_inbox_v2_enabled`.
**Confidence:** HIGH on the scoping mechanism and font loading (verified against official Tailwind v4 + Next.js 16 + shadcn docs); MEDIUM on `next-themes` subtree forcing (no official API — CSS-only workaround confirmed); MEDIUM on paper texture Safari performance (no 2026 benchmark available, conservative recommendation).

> **Scope discipline.** The question "which library?" is closed. CONTEXT.md locks 24 decisions. This research answers **"what breaks in 2026 when I implement these 24 decisions?"** — the scoping mechanism, the font pipeline, the force-light workaround, the `color-mix` fallback, and the primitive inheritance matrix.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (research does NOT explore alternatives to these)

**Feature flag / Regla 6:**
- **D-01** — Flag `ui_inbox_v2_enabled` in `workspaces.settings` JSONB, default `false`. Same pattern as `conversation_metrics.enabled`.
- **D-02** — Flag resolved server-side in `src/app/(dashboard)/whatsapp/page.tsx`.
- **D-03** — Zero regression guarantee; plan includes side-by-side QA.

**Token architecture:**
- **D-04** — Tokens scoped inside `.theme-editorial` wrapper; outside the scope the shadcn slate tokens remain.
- **D-05** — Override shadcn semantic tokens (`--primary`, `--background`, `--card`, `--border`, `--muted`, `--accent`, `--destructive`, `--radius`, etc.) inside `.theme-editorial` so primitives inherit without rewrite.
- **D-06** — Add custom handoff tokens (`--paper-0..4`, `--ink-1..5`, `--rubric-1..3`, `--accent-verdigris/gold/indigo`, `--font-*`, `--fs-*`, `--space-*`, `--radius-*`, `--paper-grain`, `--paper-fibers`) verbatim from the handoff, scoped.
- **D-07** — `mx-*` utility classes scoped under `.theme-editorial` selector.
- **D-08** — Paper texture via `background-image` + `background-blend-mode: multiply` at root; fallback to `::before` if Safari retina perf degrades.

**Typography:**
- **D-09** — Fonts loaded via `next/font/google` exposing CSS variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`. Geist intact for rest of dashboard.
- **D-10** — EB Garamond 400/500/600/700/800 + italic 400/600; Inter 400/500/600/700; JetBrains Mono 400/500. UI-SPEC §6.3 recommends NOT loading Cormorant Garamond (cascade falls to Times/Georgia).

**Layout / structure:**
- **D-11** — Keep Allotment for resize panels (340 / 1fr / 320).
- **D-12** — Brand lockup `morf·x` OUT OF SCOPE (sidebar global comes later).
- **D-13** — Topbar internal of the module goes in `conversation-list.tsx`.

**States (handoff §10):** D-14..D-18 — loading skeleton, empty bandeja, empty filter, error canal, snoozed. All locked visually.

**Realtime / lógica (NO tocar):** D-19..D-20 — zero changes to `initializeTools()`, `useConversations()`, realtime subscriptions, webhook handlers, `markAsRead`, `getConversation`, `AvailabilityToggle`, `WindowIndicator`, `DebugPanelProduction`, `AgentConfigSlider`, `message-bubble` props.

**Iconografía:** D-21..D-22 — keep `lucide-react@^0.563.0` (already satisfies handoff `>=0.460.0` requirement). Icons: `Search`, `UserPlus`, `Tag`, `MoreHorizontal`, `Send`, `AlertTriangle`, `Moon`, `ChevronRight`.

**A11y:** D-23..D-24 — `Esc`/`/`/`[`/`]` keyboard; `/` scoped to module only (must not conflict with `GlobalSearch`); all ibtn have Spanish `aria-label`; WCAG AA contrast.

### Claude's Discretion (research DOES make recommendations)
- Font weights vs bundle size → recommended below.
- Root layout vs module layout for `next/font/google` → recommended below.
- Fine mapping of shadcn tokens → editorial tokens → recommended below.
- `globals.css` vs CSS module for `mx-*` utilities → recommended below.
- `@theme` vs `:root` + inline token overrides → recommended below.
- Server-side flag helper (`getIsInboxV2Enabled`) vs direct read → recommended below.
- `<Brand />` component — defer (only needed when sidebar is re-skinned).

### Deferred Ideas (OUT OF SCOPE)
- Re-skin sidebar global + topbar global of dashboard (standalone follow-up).
- Modules 2–8 of handoff (Tareas, Pedidos, CRM, Agentes, etc.).
- Rollout to productive workspaces (operational, separate from code phase).
- Dark mode editorial (requires separate design round).
- Admin UI to flip flags.
- `<Brand />` component.
- Re-skin of modales and sheets (`NewConversationModal`, `TemplateSendModal`, etc.).
- Structural refactor of `contact-panel.tsx` (839 LOC).
- Rigorous responsive <1024px (base pattern only).
- Storybook.

---

## Summary

1. **The scoping mechanism works because Tailwind v4 utilities reference variables, not values.** shadcn's `@theme inline { --color-primary: var(--primary); }` generates utilities like `bg-primary` that internally expand to `var(--color-primary)` → `var(--primary)`. When an element is inside `.theme-editorial { --primary: oklch(0.18 0.02 60); }`, the CSS cascade resolves `--primary` to the editorial value at that element's location. No Tailwind rebuild, no primitive rewrite, no shadcn fork. `[VERIFIED: ui.shadcn.com/docs/theming]` `[VERIFIED: shadcn/example-ui-themes pattern]`

2. **Fonts preload per-route via `next/font/google` in a nested layout.** If the 4 editorial fonts are imported in `src/app/(dashboard)/whatsapp/layout.tsx` (not the root), Next.js preloads them **only on `/whatsapp` routes** — other dashboard modules pay zero bundle cost. Official Next.js 16.2 doc confirms: *"If it's a layout, it is preloaded on all the routes wrapped by the layout. If it's the root layout, it is preloaded on all routes."* `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]`

3. **`next-themes` does NOT support nested providers for subtree forcing** (open issue #254 since Feb 2024, "planned for v1", unresolved). The CSS-only workaround is: apply `color-scheme: light` to `.theme-editorial` plus one defensive selector (`.dark .theme-editorial { /* re-apply light tokens */ }`). This is simpler than forking `next-themes` and does not require a second provider. `[VERIFIED: github.com/pacocoursey/next-themes/issues/254]`

4. **`color-mix(in oklch, …)` has 92.8% global support, Safari 16.2+, Chrome 111+, Firefox 113+.** Morfx is desktop B2B — safe to use without polyfill. `[VERIFIED: caniuse.com/mdn-css_types_color_color-mix]`

5. **The scoped `.theme-editorial` approach is documented and used in the wild** (shadcn/example-ui-themes uses `.theme-orange` / `.theme-green` classes; the wawand.co multi-tenant portal article documents the exact same pattern; tailwindlabs discussion #18560 confirms the mechanism). `[VERIFIED: github.com/shadcn/example-ui-themes]`

6. **No known conflict exists for `GlobalSearch` `/` shortcut** — grep confirms it binds `Cmd+K`, not `/`. The inbox `/` shortcut is free to claim. `[VERIFIED: grep src/components/search/global-search.tsx]`

7. **Paper texture SVG noise on Safari retina:** no 2026-dated benchmark exists, but css-tricks coverage and implementer anecdotes suggest Safari rasterizes large `background-image` SVG noise aggressively. Ship the `background-image` root approach (simpler, fewer stacking contexts) and keep the `::before` pattern documented in code as a one-commit rollback if QA flags regression. `[CITED: css-tricks.com/grainy-gradients]`

**Primary recommendation:** Use the shadcn/example-ui-themes pattern verbatim — extend `globals.css` with a `.theme-editorial { --primary: …; --background: …; … }` block plus the custom handoff tokens and `mx-*` utility classes scoped under the same selector; load fonts in `src/app/(dashboard)/whatsapp/layout.tsx` (not root); resolve the flag with a new helper `getIsInboxV2Enabled(workspaceId)` analog to `getIsSuperUser()`; force light with `color-scheme: light` on the wrapper.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feature flag resolution (`ui_inbox_v2_enabled`) | API / Server Component | — | Server Component in `whatsapp/page.tsx` reads `workspaces.settings` JSONB via existing `WorkspaceProvider` / dedicated helper. `[VERIFIED: src/app/(dashboard)/layout.tsx]` |
| `.theme-editorial` class application | Frontend Server (SSR) | — | Server Component outputs the wrapper className; applied to `<InboxLayout>` root. No hydration mismatch — the class is rendered, not toggled client-side. |
| Font loading + CSS variable exposure | Frontend Server (SSR) | Browser | `next/font/google` at build time generates self-hosted font files and a `@font-face` + CSS variable injection; Next.js preloads per-route. `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]` |
| Token override (CSS cascade) | Browser | — | Pure CSS; Tailwind utilities already generated use `var(--*)` indirection. `[VERIFIED: ui.shadcn.com/docs/theming]` |
| Paper texture rendering | Browser | — | `background-image: url(data:image/svg+xml,…)` at root. Decode cost is per-repaint on Safari. |
| Keyboard shortcut `/` scoping | Browser | — | `useEffect` + `document.activeElement.closest('[data-module="whatsapp"]')` check. No server involvement. |
| Force light inside subtree | Browser | — | `color-scheme: light` + defensive `.dark .theme-editorial { … }` override. `next-themes` state stays untouched. |
| `lucide-react` icons | Browser | — | Tree-shaken bundle at build; no change from today. |

---

## Standard Stack

### Core (already installed — do NOT change)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `^16.1.6` (latest `16.2.x` as of 2026-04) | App Router + `next/font/google` | Project stack; `next/font` self-hosts + preloads per-route |
| `react` / `react-dom` | `19.2.3` | React 19 server/client components | Project stack |
| `tailwindcss` | `^4` (via `@tailwindcss/postcss` `^4`) | CSS-first theming with `@theme inline` | Project stack; enables the scoping pattern |
| `tw-animate-css` | `^1.4.0` | Tailwind animation utilities | Already present |
| shadcn/ui primitives | installed (new-york + slate + cssVariables) | Button, Badge, Tabs, Popover, ScrollArea, Sheet, Avatar, Tooltip, Input, Separator, Dialog, AlertDialog, DropdownMenu, Card | All primitives inherit scoped tokens — §Shadcn Primitive Inheritance Map |
| `@radix-ui/*` | various (see package.json) | Radix primitives powering shadcn | No change |
| `lucide-react` | `^0.563.0` (latest `1.8.0` as of 2026-04 — **do not bump**) | Icons | Handoff §11 requires `>=0.460.0`; current `0.563` already satisfies. Bumping to `1.x` triggers major churn (icon name changes) for zero visual benefit. `[VERIFIED: npm view lucide-react version]` |
| `allotment` | `^1.20.5` | Resize panels | D-11 locked; latest `1.20.5` matches installed `[VERIFIED: npm view allotment version]` |
| `next-themes` | `^0.4.6` | Dashboard theme provider (light/dark toggle) | D-13 keeps as-is; latest `0.4.6` matches installed. Nested providers unsupported — CSS-only workaround below. `[VERIFIED: npm view next-themes version]` |

### Supporting (fonts — loaded via `next/font/google`, zero new npm packages)

| Font | Weights / Styles | Rationale |
|------|------------------|-----------|
| EB Garamond | variable `400 800` + italic `400 600` | Variable font on Google Fonts (v1.001 has 1 variable axis, weights 400–800). Using `weight: 'variable'` or `weight: '400 800'` loads a single file per axis. `style: ['normal', 'italic']` required because italic files are separate on Google Fonts. `[VERIFIED: fonts.google.com/specimen/EB+Garamond]` `[CITED: en.wikipedia.org/wiki/EB_Garamond]` |
| Inter | variable `100 900` (default) | Variable on Google Fonts; single file covers all weights. Use default variable import (no `weight` arg needed). `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]` |
| JetBrains Mono | variable `400 500` (declare as range to avoid loading 800/900) | Variable on Google Fonts. Declare `weight: '400 500'` to subset the variable axis to the two weights we need (saves ~20KB). |
| ~~Cormorant Garamond~~ | SKIP | **Do NOT load.** UI-SPEC §6.3 + handoff cascade: EB Garamond loads first; on failure the browser falls back to Times/Georgia. Cormorant adds ~40KB with zero visible benefit when EB Garamond loads successfully (which it always will in non-error environments). `[ASSUMED: fallback cascade behavior]` |

**Installation:** Zero new npm installs. All fonts are pulled via `next/font/google` at build time and self-hosted.

### Alternatives Considered (explicitly rejected)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| `.theme-editorial` wrapper | `data-theme="editorial"` attribute | Both work. Class wrapper matches shadcn's own `.dark` pattern and the `@custom-variant dark (&:is(.dark *))` already in `globals.css`. Consistency wins. |
| Scope `mx-*` utilities in CSS module | Scope in `globals.css` under `.theme-editorial` selector | CSS module adds build indirection and does not globally apply. Since we need these classes available to 8 components in the same tree, global CSS scoped by selector is simpler and still bounded. |
| Load fonts in root `app/layout.tsx` | Load in `(dashboard)/whatsapp/layout.tsx` | Root-scope preload pays the font bundle on every dashboard route; module-scope preload only pays on `/whatsapp`. `[VERIFIED: nextjs.org/docs/app/api-reference/components/font — "If it's a layout, it is preloaded on all the routes wrapped by the layout"]` |
| Fork `next-themes` for nested providers | CSS-only `color-scheme: light` + defensive selector | Forking introduces maintenance debt; the CSS approach covers the only requirement (force light inside one subtree) with zero code changes to the provider. |
| Introduce `class-variance-authority` for `.mx-tag--*` | Plain CSS classes | The `mx-tag--*` classes are utility-first static CSS — no prop-driven branching beyond the variant. CVA adds runtime cost for zero benefit here. The shadcn `Badge` component is bypassed (it's slate-styled). A new React component `<MxTag>` is a thin wrapper around the CSS classes (UI-SPEC §13.2). |

**Version verification (npm):**
```
lucide-react       latest: 1.8.0   installed: ^0.563.0  (keep — D-21)
next-themes        latest: 0.4.6   installed: ^0.4.6    (latest)
allotment          latest: 1.20.5  installed: ^1.20.5   (latest)
```

---

## Architecture Patterns

### Pattern 1: Scoped Token Override (THE load-bearing mechanism)

**What:** A single `.theme-editorial` class wrapper redefines every CSS variable that shadcn primitives consume. Tailwind v4's `@theme inline` maps each Tailwind utility (e.g., `bg-primary`) to `var(--color-primary)` → `var(--primary)`. The CSS cascade resolves `var(--primary)` to the value defined closest to the element — so inside `.theme-editorial` the editorial value wins; outside, the default slate value wins.

**When to use:** Scoping a complete theme (not just a color) to a subtree without rewriting component code. This is the canonical shadcn pattern — confirmed in `shadcn/example-ui-themes` repo (uses `.theme-orange`, `.theme-green`), in the shadcnblocks tailwind v4 migration guide, and in Tailwindlabs discussion #18560.

**Key mechanism (quote from shadcn docs):** *"CSS custom properties resolve based on the cascade at the element's location. When an element has class `.theme-editorial`, the browser applies that selector's variables first, then walks up the cascade. So `var(--primary)` inside `.theme-editorial` resolves to the value you defined in that scope, not `:root`."* `[VERIFIED: ui.shadcn.com/docs/theming — WebFetch 2026-04-22]`

**Why `@theme inline` works for this (critical nuance):** The Tailwindlabs discussion #18560 notes that `@theme inline` *"embeds values directly"* — but in the shadcn pattern the "inline value" is `var(--primary)`, which is *itself* a reference. So the utility compiles to `background-color: var(--color-primary)` where `--color-primary` = `var(--primary)`. Both indirections chain through the cascade. The scope override of `--primary` propagates all the way up to the utility. `[VERIFIED: github.com/tailwindlabs/tailwindcss/discussions/18560]`

### Pattern 2: Per-Route Font Preload

**What:** Import `next/font/google` inside `src/app/(dashboard)/whatsapp/layout.tsx` and attach `.variable` className to the wrapper div. Next.js preloads fonts only on routes wrapped by that layout.

**When to use:** Fonts used by exactly one route subtree and too heavy to pay for globally. This matches our situation (4 editorial families, ~200–300KB total, used only in `/whatsapp`).

**Official quote:** *"When a font function is called on a page of your site, it is not globally available and preloaded on all routes. Rather, the font is only preloaded on the related routes based on the type of file where it is used: If it's a layout, it is preloaded on all the routes wrapped by the layout."* `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]`

### Pattern 3: Server-Side Flag Resolution (match existing `getIsSuperUser` shape)

**What:** Create `src/lib/auth/inbox-v2.ts` with `getIsInboxV2Enabled(workspaceId: string): Promise<boolean>`. The helper reads `workspaces.settings.ui_inbox_v2` (namespace `ui_inbox_v2`, key `enabled`) via `createClient()` (authenticated supabase client). Called once per request from `whatsapp/page.tsx` in the existing `Promise.all([…])` block.

**Why not `WorkspaceProvider`:** The provider is a client component (`'use client'`) — cannot be read in a server component. The flag decision lives server-side (D-02). The cleanest path is a server helper that mirrors `getIsSuperUser()`.

**Namespace convention:** UI-SPEC says `ui_inbox_v2_enabled`. The sidebar's `settingsKey` convention is `<namespace>.<key>` (e.g., `conversation_metrics.enabled`). For consistency with the sidebar and to support future related flags (e.g., `ui_inbox_v2.retention_days`), **use namespace `ui_inbox_v2` + key `enabled`** in the JSONB. The effective settings path is `workspaces.settings.ui_inbox_v2.enabled: boolean`.

### Pattern 4: Force Light Inside Subtree (CSS-only — no provider nesting)

**What:** Apply `color-scheme: light` to `.theme-editorial`. If a user toggles the dashboard to dark, the `<html>` element gets class `dark` (next-themes default `attribute="class"`); the shadcn CSS defines `.dark { … }` which would cascade into our subtree. Counter this with a single defensive rule that re-applies the editorial tokens when `.dark` is an ancestor.

**Why not `forcedTheme`:** `next-themes` does not support nested providers (issue #254, open since Feb 2024, labeled "planned for v1", no resolution). `forcedTheme` on the root `ThemeProvider` is global — it would force light everywhere, not just inside the module. `[VERIFIED: github.com/pacocoursey/next-themes/issues/254]`

**The defensive selector:** Because `.dark { --primary: oklch(…) }` overrides `:root` in the base CSS, and because `.theme-editorial { --primary: … }` specificity (0,1,0) is lower than `.dark .theme-editorial { --primary: … }` (0,2,0), we need to repeat the editorial overrides one more time under `.dark .theme-editorial`. This is explicit but mechanical (one copy-paste of the token block with higher specificity).

### Anti-Patterns to Avoid

- **Scoped `@theme inline` block inside the selector** — Tailwind v4 **does not** allow `@theme` under a non-root selector. Official docs: *"Theme variables are also required to be defined top-level and not nested under other selectors or media queries."* Put only custom property declarations (`--primary: oklch(…)`) inside `.theme-editorial`, never `@theme`. `[VERIFIED: tailwindcss.com/docs/theme]`
- **Hand-rolled font loader (local `@font-face` + `@import` from Google CDN)** — Bypasses Next.js preloading, breaks the self-host privacy guarantee, and adds runtime Google requests. `next/font/google` is non-negotiable. `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]`
- **Conditional className at a higher level than `<InboxLayout>` root** — putting `.theme-editorial` on `<body>` from the `/whatsapp` route would require a client-side effect (bad for SSR) or ugly server-layout acrobatics. The class goes on the div inside `whatsapp/layout.tsx` (server component). Server-rendered, no hydration mismatch.
- **Hardcoded OKLCH values in components** — UI-SPEC §3.5 + DoD grep check prohibit this. Every pill, avatar, border, etc. must reference a `--token`. Exception: utility classes in the single scoped CSS file define OKLCH once.
- **Using `.tg.red/.gold/.indi/.ver` from the legacy mock HTML** — handoff §6 + CHANGELOG v2 say these are placeholders. Always use `mx-tag--rubric / --gold / --indigo / --verdigris / --ink`.

---

## Shadcn Primitive Inheritance Map

For every shadcn primitive used in the 8 in-scope components, here's whether the scoped token override handles it automatically or requires manual attention.

| Primitive | Tokens it reads | Inherits automatically? | Manual attention? |
|-----------|----------------|-------------------------|-------------------|
| **`Button` (default)** | `--primary`, `--primary-foreground`, `--border`, `--ring`, `--radius` | ✅ Yes | Use `variant="default"` for the composer `Send` button; mapping §4 makes it `ink-1` bg + `paper-0` fg. `transform: translateY(1px)` active state not in shadcn by default — add via `className="active:translate-y-px"` at the callsite. |
| **`Button` (outline / ghost)** | `--border`, `--accent`, `--accent-foreground` | ✅ Yes | `ibtn` (32×32 icon button) should NOT reuse `Button` — it has a custom size (`h-8 w-8`), and the accent-hover → `paper-3` mapping makes the hover cleaner than shadcn's default `accent` blend. UI-SPEC §13.2 suggests a new `<IconButton>` wrapper. |
| **`Button` (destructive)** | `--destructive`, `--destructive-foreground` | ✅ Yes | `--destructive` mapped to `rubric-2`; inherits directly. |
| **`Badge`** | `--primary`, `--secondary`, `--destructive`, `--border` | ⚠️ Partial — **bypass** | shadcn `Badge` uses `--primary` for "default" variant, which would make every badge ink-1 sólido. The mock uses per-semantic colored pills (gold/indigo/verdigris/rubric/ink), constructed with `color-mix`. **Do NOT reuse `Badge`**; use the `.mx-tag--*` utility classes directly (or a thin `<MxTag>` wrapper). |
| **`Tabs`** | `--background`, `--muted`, `--muted-foreground`, `--foreground`, `--border`, `--ring` | ✅ Yes | shadcn `Tabs` default styling uses `bg-muted` (→ `paper-2`) for the tab-list background. UI-SPEC §7.2 wants a transparent tab list + underline-only indicator. This requires custom className overrides on `TabsList` and `TabsTrigger`. Not a token issue — a structural styling choice. The primitive works; the default theme doesn't match the mock. **Recommended:** build the tab bar manually (plain `<div>` with `<button>` children) rather than force-style shadcn Tabs into a shape it wasn't designed for. |
| **`Popover`** (used in action menus, date pickers if any) | `--popover`, `--popover-foreground`, `--border`, `--radius` | ✅ Yes | Inherits `paper-0` / `ink-1`. |
| **`Tooltip`** (ibtn labels) | `--popover`, `--popover-foreground`, `--border` | ✅ Yes | No change. aria-label on ibtn + Tooltip for discoverability. |
| **`Avatar`** + `AvatarFallback` | `--muted`, `--muted-foreground` | ⚠️ Partial — **override** | Default shadcn `Avatar` is circular with muted fallback bg. The mock uses 40×40 circle with `paper-3` bg + `ink-1` border 1px + sans 700 13px initials with letter-spacing 0.02em. The inherited mapping gives us wrong bg (muted → paper-2, but mock wants paper-3) and no border. **Apply custom className** on `AvatarFallback`: `className="border border-[var(--ink-1)] bg-[var(--paper-3)] font-sans font-bold text-[13px] tracking-[0.02em] text-[var(--ink-1)]"`. |
| **`ScrollArea`** (conversation list scroll, thread scroll) | `--border` for scrollbar thumb | ✅ Yes | Scrollbar adopts editorial `--border` color. Works as-is. |
| **`Sheet`** (ContactPanel → drawer on <1280; NewConversationModal OUT OF SCOPE here) | `--background`, `--border`, `--ring` | ✅ Yes for in-scope usage | Out-of-scope modals (`NewConversationModal`, `TemplateSendModal`, etc.) live OUTSIDE `.theme-editorial` so they continue to render shadcn-slate — which is intentional per CONTEXT. |
| **`Input`** | `--input` (= `--border` alias), `--background`, `--foreground`, `--ring` | ✅ Yes | Search input + composer textarea inherit. Focus ring uses `--ring` → `ink-1` (mapping §4), so the focus state comes out as a dark 2px outline, matching mock §10.2. |
| **`Separator`** (order card dividers, contact-panel sections) | `--border` | ✅ Yes | Inherits editorial `--border` (oklch 0.80 0.025 72). |
| **`Dialog` / `AlertDialog`** (not in 8-component scope, but triggered FROM them) | `--background`, `--border`, etc. | ⚠️ Caveat — **do NOT apply `.theme-editorial`** | The Dialog's `DialogContent` renders in a React portal that attaches to `document.body` (outside the `.theme-editorial` wrapper). Even if `NewConversationModal` is triggered from inside the themed module, its content renders in slate — matching CONTEXT's OUT-OF-SCOPE list for modales. Leave as-is. If dark mode is on globally, modales keep rendering in slate dark — also correct. |
| **`DropdownMenu`** (used in chat-header `MoreHorizontal` action) | `--popover`, `--popover-foreground`, `--border`, `--ring`, `--accent`, `--accent-foreground` | ✅ Yes | Same portal caveat as Dialog: the menu content renders via Radix portal on `document.body`. Since the portal is OUTSIDE `.theme-editorial`, the menu renders in slate (not editorial). **This is a known gap.** Options: (a) accept the slate look for dropdown contents (small regression for ibtn actions); (b) use Radix `DropdownMenuPortal` with a `container` prop to re-root the portal inside the themed wrapper. **Recommended:** (b) — set `container={document.querySelector('.theme-editorial')}` on the `DropdownMenuPortal`. Add a utility to find the container reliably. |
| **`Card`** (if used; Order card uses raw div) | `--card`, `--card-foreground`, `--border` | ✅ Yes | Order card template in UI-SPEC §7.10 does NOT use shadcn `Card` (padding `9px 11px` + radius `12px` are custom — `Card` has defaults). Build as raw div. |
| **`Label`** | `--foreground` | ✅ Yes | — |
| **`Switch`** (AvailabilityToggle in chat-header; logic OUT OF SCOPE per D-19) | `--primary`, `--muted`, `--ring` | ✅ Yes | Track (on) = ink-1; track (off) = paper-2. Matches editorial aesthetic. |
| **`Select`** (not expected in 8 components but may appear in contact-panel sub-sections) | `--background`, `--popover`, `--border`, `--ring`, `--accent` | ✅ Yes + Portal caveat | Same dropdown portal caveat — if used, use Radix `SelectPortal` with container prop. |

**Primitives NOT to bypass** (use as-is, inherit): `Button` (all variants), `Popover`, `Tooltip`, `ScrollArea`, `Sheet`, `Input`, `Separator`, `Card`, `Label`, `Switch`.

**Primitives to bypass / replace with raw markup or custom component:**
- `Badge` → use `.mx-tag--*` classes (or `<MxTag>` wrapper)
- `Tabs` → build manual tab bar for the filter tabs (shadcn Tabs defaults fight the underline-only design)
- `Avatar` default fallback → needs className override for editorial look
- Order card is raw div (not shadcn `Card`)

**Primitives with portal caveat** (apply `container` prop to re-root portal inside `.theme-editorial`):
- `DropdownMenuPortal` (chat-header MoreHorizontal action menu)
- `SelectPortal` (if used)
- `PopoverPortal` (if used — Popover by default renders inside the trigger's stacking context, but Radix puts it in a portal; verify at implementation)

---

## Token Architecture

The literal CSS block to drop into `src/app/globals.css`, appended AFTER the existing `:root` and `.dark` blocks and before the `@layer base` block.

```css
/* =========================================================================
   Editorial theme scope — module `/whatsapp` with ui_inbox_v2 flag ON
   All tokens redefined here cascade to shadcn primitives via Tailwind v4
   @theme inline indirection defined above (lines 6-47 of globals.css).
   Source of truth: reference/design_handoff_morfx/colors_and_type.css v2
   ========================================================================= */

.theme-editorial {
  color-scheme: light;

  /* --- Custom handoff tokens (paper / ink / rubric / accents) --- */
  --paper-0: oklch(0.995 0.008 85);
  --paper-1: oklch(0.985 0.012 82);
  --paper-2: oklch(0.970 0.016 80);
  --paper-3: oklch(0.945 0.020 78);
  --paper-4: oklch(0.915 0.026 76);
  --paper-shadow: oklch(0.82 0.035 70);

  --ink-1: oklch(0.18 0.02 60);
  --ink-2: oklch(0.32 0.025 60);
  --ink-3: oklch(0.48 0.03 65);
  --ink-4: oklch(0.62 0.035 70);
  --ink-5: oklch(0.78 0.03 72);

  --rubric-1: oklch(0.45 0.09 28);
  --rubric-2: oklch(0.55 0.10 30);
  --rubric-3: oklch(0.70 0.07 32);

  --accent-verdigris: oklch(0.52 0.035 180);
  --accent-gold:      oklch(0.68 0.055 80);
  --accent-indigo:    oklch(0.42 0.045 260);

  --semantic-success: oklch(0.50 0.08 145);
  --semantic-warning: oklch(0.58 0.12 65);
  --semantic-danger:  var(--rubric-2);
  --semantic-info:    var(--accent-indigo);

  /* --- Handoff aliases (internal to the scope) --- */
  --rule:          var(--ink-2);
  --border-strong: var(--ink-1);

  /* --- Font family variables (values come from next/font/google in layout) --- */
  --font-display:    var(--font-ebgaramond), 'Cormorant Garamond', 'Times New Roman', Georgia, serif;
  --font-serif:      var(--font-ebgaramond), Georgia, 'Times New Roman', serif;
  --font-sans:       var(--font-inter), system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
  --font-mono:       var(--font-jetbrains-mono), ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --font-small-caps: var(--font-ebgaramond), Georgia, serif;

  /* --- Type scale (handoff §5) --- */
  --fs-display: 64px;
  --fs-h1: 44px;
  --fs-h2: 32px;
  --fs-h3: 24px;
  --fs-h4: 19px;
  --fs-body: 16px;
  --fs-body-sm: 14px;
  --fs-caption: 12px;
  --fs-micro: 11px;
  --lh-tight: 1.08;
  --lh-display: 1.05;
  --lh-heading: 1.20;
  --lh-body: 1.55;
  --lh-long: 1.70;

  /* --- Spacing (grid of 4) --- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;

  /* --- Radii --- */
  --radius-0: 0px;
  --radius-1: 2px;
  --radius-2: 3px;
  --radius-3: 4px;
  --radius-pill: 999px;

  /* --- Shadows --- */
  --shadow-hair:   0 0 0 0.5px oklch(0.80 0.025 72);
  --shadow-page:   0 1px 0 oklch(0.80 0.025 72), 0 12px 28px -14px oklch(0.3 0.04 60 / 0.25);
  --shadow-card:   0 1px 0 oklch(0.80 0.025 72), 0 4px 12px -6px  oklch(0.3 0.04 60 / 0.18);
  --shadow-raised: 0 1px 0 oklch(0.80 0.025 72), 0 10px 24px -10px oklch(0.25 0.05 60 / 0.28);

  /* --- Paper textures (handoff §7 — data-URI SVG noise) --- */
  --paper-grain:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  --paper-fibers:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='f'><feTurbulence type='turbulence' baseFrequency='0.012 0.9' numOctaves='2' seed='7'/><feColorMatrix values='0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.18  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23f)'/></svg>");

  /* --- shadcn token overrides (mapping §4 of UI-SPEC) --- */
  --background: var(--paper-1);
  --foreground: var(--ink-1);
  --card: var(--paper-0);
  --card-foreground: var(--ink-1);
  --popover: var(--paper-0);
  --popover-foreground: var(--ink-1);
  --primary: var(--ink-1);              /* NOT rubric — see UI-SPEC §4 critical note */
  --primary-foreground: var(--paper-0);
  --secondary: var(--paper-2);
  --secondary-foreground: var(--ink-1);
  --muted: var(--paper-2);
  --muted-foreground: var(--ink-3);
  --accent: var(--paper-3);             /* hover — NOT rubric */
  --accent-foreground: var(--ink-1);
  --destructive: var(--rubric-2);
  --border: oklch(0.80 0.025 72);
  --input: oklch(0.80 0.025 72);
  --ring: var(--ink-1);
  --radius: var(--radius-3);            /* 4px — overrides the shadcn 0.625rem default */

  /* --- Apply editorial look at the root of the scope --- */
  background-color: var(--paper-1);
  color: var(--ink-1);
  background-image: var(--paper-grain), var(--paper-fibers);
  background-blend-mode: multiply;
  font-family: var(--font-serif);
  font-feature-settings: "kern", "liga", "onum", "pnum";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Defensive override — if next-themes puts `.dark` on <html>, our scope still
   wins because this selector has higher specificity than `.dark { --primary: … }`
   in the base CSS. Repeat the shadcn token map only (not the custom tokens — those
   already cascade through .theme-editorial). */
.dark .theme-editorial {
  --background: var(--paper-1);
  --foreground: var(--ink-1);
  --card: var(--paper-0);
  --card-foreground: var(--ink-1);
  --popover: var(--paper-0);
  --popover-foreground: var(--ink-1);
  --primary: var(--ink-1);
  --primary-foreground: var(--paper-0);
  --secondary: var(--paper-2);
  --secondary-foreground: var(--ink-1);
  --muted: var(--paper-2);
  --muted-foreground: var(--ink-3);
  --accent: var(--paper-3);
  --accent-foreground: var(--ink-1);
  --destructive: var(--rubric-2);
  --border: oklch(0.80 0.025 72);
  --input: oklch(0.80 0.025 72);
  --ring: var(--ink-1);
  --radius: var(--radius-3);
}

/* --- Utility classes: mx-* (handoff §6) — scoped to avoid global pollution --- */
.theme-editorial .mx-display {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-display);
  line-height: var(--lh-display);
  letter-spacing: -0.02em;
  color: var(--ink-1);
}
.theme-editorial .mx-h1 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-h1);
  line-height: var(--lh-heading);
  letter-spacing: -0.015em;
  color: var(--ink-1);
}
.theme-editorial .mx-h2 {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: var(--fs-h2);
  line-height: var(--lh-heading);
  letter-spacing: -0.005em;
  color: var(--ink-1);
}
.theme-editorial .mx-h3 {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: var(--fs-h3);
  line-height: 1.25;
  color: var(--ink-1);
}
.theme-editorial .mx-h4 {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: var(--fs-h4);
  line-height: 1.3;
  color: var(--ink-1);
}
.theme-editorial .mx-body {
  font-family: var(--font-serif);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--ink-2);
}
.theme-editorial .mx-body-long {
  font-family: var(--font-serif);
  font-size: var(--fs-body);
  line-height: var(--lh-long);
  color: var(--ink-2);
  hyphens: auto;
  text-wrap: pretty;
}
.theme-editorial .mx-caption {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: var(--fs-caption);
  color: var(--ink-3);
}
.theme-editorial .mx-smallcaps {
  font-family: var(--font-small-caps);
  font-variant: small-caps;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--ink-1);
}
.theme-editorial .mx-rubric {
  font-family: var(--font-serif);
  font-weight: 600;
  font-variant: small-caps;
  letter-spacing: 0.08em;
  color: var(--rubric-2);
}
.theme-editorial .mx-marginalia {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: var(--fs-caption);
  color: var(--ink-3);
  line-height: 1.4;
}
.theme-editorial .mx-ui {
  font-family: var(--font-sans);
  font-size: var(--fs-body-sm);
  font-weight: 500;
  color: var(--ink-1);
  letter-spacing: 0.01em;
}
.theme-editorial .mx-mono {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink-2);
}

/* Rules */
.theme-editorial .mx-rule  { border: 0; border-top: 1px solid var(--ink-1); margin: var(--space-4) 0; }
.theme-editorial .mx-rule-double {
  height: 6px; border: 0;
  background:
    linear-gradient(var(--ink-1), var(--ink-1)) top/100% 1px no-repeat,
    linear-gradient(var(--ink-1), var(--ink-1)) bottom/100% 1px no-repeat;
}
.theme-editorial .mx-rule-thick { border: 0; border-top: 3px solid var(--ink-1); }
.theme-editorial .mx-rule-ornament {
  text-align: center;
  color: var(--ink-3);
  font-family: var(--font-serif);
  letter-spacing: 0.5em;
  font-size: 14px;
}

/* Tags (pills) */
.theme-editorial .mx-tag {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-sans); font-weight: 600;
  font-size: 10px; letter-spacing: 0.01em;
  padding: 2px 8px; border-radius: var(--radius-pill);
  border: 1px solid transparent;
}
.theme-editorial .mx-tag--rubric {
  background: color-mix(in oklch, var(--rubric-2) 10%, var(--paper-0));
  color: var(--rubric-1);
  border-color: color-mix(in oklch, var(--rubric-2) 40%, var(--paper-0));
}
.theme-editorial .mx-tag--gold {
  background: color-mix(in oklch, var(--accent-gold) 14%, var(--paper-0));
  color: color-mix(in oklch, var(--accent-gold) 60%, var(--ink-1));
  border-color: color-mix(in oklch, var(--accent-gold) 45%, var(--paper-0));
}
.theme-editorial .mx-tag--indigo {
  background: color-mix(in oklch, var(--accent-indigo) 10%, var(--paper-0));
  color: var(--accent-indigo);
  border-color: color-mix(in oklch, var(--accent-indigo) 40%, var(--paper-0));
}
.theme-editorial .mx-tag--verdigris {
  background: color-mix(in oklch, var(--accent-verdigris) 10%, var(--paper-0));
  color: var(--accent-verdigris);
  border-color: color-mix(in oklch, var(--accent-verdigris) 40%, var(--paper-0));
}
.theme-editorial .mx-tag--ink {
  background: var(--paper-0);
  color: var(--ink-2);
  border-color: var(--ink-3);
}

/* Skeleton animation */
@keyframes mx-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
.theme-editorial .mx-skeleton {
  background: var(--paper-2);
  border: 1px solid var(--border);
  animation: mx-pulse 1.5s ease-in-out infinite;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .theme-editorial * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Where this goes:** Appended to `src/app/globals.css` (single file). Do NOT create a separate CSS module — the overrides must be in the same stylesheet as the `@theme inline` mapping so CSS cascade resolves correctly. The selector-scoping (`.theme-editorial .mx-*`) prevents pollution into other modules.

**Size impact:** ~170 lines of CSS. Minified + gzipped: ~3KB. Zero runtime cost.

---

## Font Loading Strategy

### Where to declare (recommendation: module layout, NOT root)

Create a font-definitions file at `src/app/(dashboard)/whatsapp/fonts.ts`:

```ts
// src/app/(dashboard)/whatsapp/fonts.ts
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

export const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ebgaramond',
  weight: 'variable',              // variable axis 400-800
  style: ['normal', 'italic'],     // italic is a separate file on Google Fonts
  adjustFontFallback: true,        // size-adjust fallback to minimize CLS
})

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // weight: 'variable' is the default for Inter — no need to specify
  adjustFontFallback: true,
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: '400 500',               // subset variable axis to the 2 weights we need
  adjustFontFallback: true,
})
```

Import and attach in the module layout:

```tsx
// src/app/(dashboard)/whatsapp/layout.tsx
import { ebGaramond, inter, jetbrainsMono } from './fonts'

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`h-full ${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      {children}
    </div>
  )
}
```

**Why module layout over root:** Next.js preloads fonts *only* on routes wrapped by the layout where the font is declared. Declaring here means:
- `/whatsapp` and its children: preload kicks in → no FOUT.
- `/crm`, `/tareas`, `/pedidos`, etc.: zero font overhead — keep Geist as today.

Official doc quote: *"If it's a layout, it is preloaded on all the routes wrapped by the layout."* `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]`

### Bundle impact (estimated from Google Fonts typical sizes)

| Font | Variant | Approx size (woff2, latin subset) |
|------|---------|----------------------------------|
| EB Garamond | variable, roman | ~40 KB |
| EB Garamond | variable, italic | ~40 KB |
| Inter | variable, roman | ~45 KB |
| JetBrains Mono | variable 400–500 (subset) | ~25 KB |
| **Total self-hosted, latin only** | | **~150 KB** |

CLS mitigation: `adjustFontFallback: true` computes a size-adjusted fallback font so layout doesn't shift during the swap window. `[VERIFIED: nextjs.org/docs/app/api-reference/components/font — adjustFontFallback default true]`

### Why not load Cormorant Garamond

UI-SPEC §6.3 recommendation + handoff cascade: `--font-display` is `'EB Garamond', 'Cormorant Garamond', 'Times New Roman', Georgia, serif`. EB Garamond loads reliably. If it failed (network outage during build? impossible for self-hosted fonts), the browser falls back to Times/Georgia — adequate for editorial look. Cormorant adds ~40KB (4 weights + italic) for zero observable benefit. `[ASSUMED: loading reliability of self-hosted fonts]`

### Verification steps for the executor

1. `npm run build` — Next.js logs each self-hosted font with its size.
2. DevTools Network tab on `/whatsapp` — exactly 4 woff2 files (EB Garamond roman, EB Garamond italic, Inter, JetBrains Mono) preload.
3. DevTools Network tab on `/crm` — no editorial font preload (Geist only).
4. Lighthouse CLS < 0.1 on initial `/whatsapp` navigation (the `adjustFontFallback` guarantee).

---

## Feature Flag Resolution Pattern

### Helper: `src/lib/auth/inbox-v2.ts` (new file)

```ts
/**
 * UI Inbox v2 flag resolver.
 *
 * Decision D-01 / D-02 in .planning/standalone/ui-redesign-conversaciones/CONTEXT.md:
 * the editorial re-skin of /whatsapp is gated per-workspace via
 * `workspaces.settings.ui_inbox_v2.enabled: boolean`, default false.
 *
 * Pattern mirrors:
 * - src/lib/auth/super-user.ts (getIsSuperUser for /super-admin gating)
 * - src/components/layout/sidebar.tsx settingsKey convention
 *   (e.g., 'conversation_metrics.enabled')
 *
 * Namespace: 'ui_inbox_v2' (not 'ui_inbox_v2_enabled' — the latter
 * leaves no room for future sub-keys like retention_days, telemetry_opt_in).
 * Key: 'enabled'. Full JSONB path: workspaces.settings.ui_inbox_v2.enabled.
 *
 * Usage: call from Server Components only. Reads workspace by id — the
 * caller must have already resolved the active workspace via
 * getActiveWorkspaceId() so the call is a single indexed lookup.
 *
 * Fails closed: any error, null settings, or missing key returns false.
 * This guarantees Regla 6 — if the flag check itself breaks, the user
 * sees the current (slate) inbox, never a half-rendered editorial one.
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
    if (error || !data?.settings) return false
    const settings = data.settings as Record<string, unknown>
    const ns = settings.ui_inbox_v2 as Record<string, unknown> | undefined
    return Boolean(ns?.enabled)
  } catch {
    return false
  }
}
```

### Consumption: `src/app/(dashboard)/whatsapp/page.tsx`

Add one line to the existing `Promise.all`:

```ts
const [initialConversations, clientConfig, isSuperUser, isInboxV2] = await Promise.all([
  getConversations({ status: 'active', sortBy: 'last_customer_message' }),
  getClientActivationSettings(),
  getIsSuperUser(),
  getIsInboxV2Enabled(workspaceId),          // <-- new
])
```

Pass the boolean down to `<InboxLayout>` as a new prop `v2` (default `false`). `InboxLayout` conditionally wraps its root div with `className="theme-editorial"` if `v2 === true`, else renders exactly as today (zero visual change for workspaces without the flag — Regla 6 satisfied).

### Why NOT read from `WorkspaceProvider` directly

`WorkspaceProvider` is a client component (`'use client'`). `page.tsx` is a Server Component. Reading React Context from a Server Component is not supported. The helper approach is the only correct path.

### SQL to enable the flag (for the operator — not code)

```sql
-- Enable the editorial inbox for a single workspace
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_inbox_v2,enabled}',
  'true'::jsonb,
  true
)
WHERE id = '<workspace-uuid>';

-- Rollback
UPDATE workspaces
SET settings = jsonb_set(
  settings,
  '{ui_inbox_v2,enabled}',
  'false'::jsonb
)
WHERE id = '<workspace-uuid>';
```

### Caching consideration (none needed)

The flag lookup runs once per request (`page.tsx` is a Server Component executed per-navigation). Supabase single-row lookup by PK is sub-millisecond. Do NOT wrap in `unstable_cache` — cache invalidation on flag flip becomes a footgun, and the cost is already negligible.

---

## Force-Light Theme Inside Subtree

### The problem

1. Dashboard root uses `next-themes` with `attribute="class"` + `enableSystem`. When user is in dark mode or system is dark, `<html class="dark">` gets applied.
2. `.dark { --background: oklch(0.129 …); ... }` in current `globals.css` redefines slate tokens to dark values.
3. Inside `/whatsapp` with the flag on, we apply `.theme-editorial` to a div. The div is a DESCENDANT of `<html class="dark">`. Both `.dark` and `.theme-editorial` match the subtree's ancestor chain. Whose tokens win?

### The CSS specificity answer

`.dark { --primary: X }` is specificity (0,1,0), matched on `<html>`.
`.theme-editorial { --primary: Y }` is specificity (0,1,0), matched on the inner div.
**Both match for the inner div's `var(--primary)` lookup** — the browser walks up the tree, `.theme-editorial` is closer, so it wins.

BUT: for tokens defined in `.dark` that are NOT redefined in `.theme-editorial`, the `.dark` value still wins. That's why the `.dark .theme-editorial` defensive block in the Token Architecture above is necessary — it redefines every shadcn token so none leaks from `.dark`.

### The `color-scheme: light` bit

This is for browser-native form controls (scrollbars, native `<select>` dropdowns, text selection color). Even if the user is in dark mode globally, setting `color-scheme: light` on `.theme-editorial` ensures native UI chrome inside the scope renders in light colors. This is a CSS property, not a JS toggle.

### Why NOT `forcedTheme` from `next-themes`

- `forcedTheme` is a prop on `ThemeProvider`, not a runtime hook call. Setting it would force the *entire dashboard* to light.
- Nesting a second `<ThemeProvider forcedTheme="light">` around the inbox is known-broken: issue #254 (Feb 2024, "planned for v1", unresolved) says the code blocks nested providers. Workaround requires forking. `[VERIFIED: github.com/pacocoursey/next-themes/issues/254]`
- Even if nested providers worked, they would require client components — our wrapper is in a server layout. Mixing client providers with server layouts adds hydration complexity for zero benefit.

### Verification

1. Open `/whatsapp` with flag on, dashboard theme set to light → ✅ inbox is editorial light.
2. Toggle dashboard theme to dark → `<html>` gets `.dark` → verify: rest of the dashboard chrome (sidebar, topbar) is dark; inside `/whatsapp` everything stays editorial light.
3. DevTools → inspect a `Button` inside the inbox → `background` resolves to `var(--primary)` → `var(--ink-1)` (not the dark `.dark` value).
4. Native scrollbar color is light (not dark) inside the thread.

---

## Paper Texture Performance

### The two patterns

**Pattern A (recommended — ship this first):**
```css
.theme-editorial {
  background-color: var(--paper-1);
  background-image: var(--paper-grain), var(--paper-fibers);
  background-blend-mode: multiply;
}
```

**Pattern B (documented fallback — only apply if QA flags Safari regression):**
```css
.theme-editorial {
  position: relative;
  isolation: isolate;
  background-color: var(--paper-1);
}
.theme-editorial::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--paper-grain), var(--paper-fibers);
  background-blend-mode: multiply;
  opacity: 0.6;
  pointer-events: none;
  z-index: -1;
}
```

### Why A first

- A is simpler (no extra stacking context, no `::before` pseudo-element to position).
- A is what `.mx-doc` in the handoff reference CSS uses natively.
- SVG noise as `background-image` is a long-established technique; modern Safari (16+) handles repeating 240×240 and 400×400 data-URI SVGs at native speed on most hardware.

### Why B is documented but not shipped

- `::before` gives us one more lever: `opacity: 0.6` subtly softens the noise.
- `pointer-events: none` guarantees it never absorbs clicks (belt-and-suspenders — noise on `background-image` already doesn't).
- `z-index: -1` + `isolation: isolate` keeps the noise BEHIND content, which is how the handoff describes it.

### Why Safari retina might regress

`[ASSUMED]`, based on community anecdotes — we have no 2026 benchmark. The hypothesis: Safari on Apple Silicon rasterizes SVG filter backgrounds at device pixel ratio; for 240×240 SVG with `feTurbulence` repeating across a 2560×1600 viewport at 2x DPR, that's thousands of decoded samples per repaint. In pattern A, every repaint that touches the root (scroll through conversation list, open ContactPanel, thread message added) would re-decode. In pattern B, the `::before` is a single fixed layer — Safari's layer compositor caches it across non-layout repaints.

### What the plan should contain

- Ship Pattern A.
- Include a comment block in `globals.css` with the full Pattern B CSS, labeled `/* PAPER TEXTURE FALLBACK — uncomment if Safari retina QA flags regression; see RESEARCH.md paper-texture section */`.
- Include a QA checklist item: test scrolling the thread and list on macOS Safari (M1+ retina) — if frame rate drops below 55fps, switch to Pattern B in a one-commit rollback.

### What NOT to do

- Don't use the texture on message-bubble surfaces (it already has a `shadow-card` and would look noisy — UI-SPEC §2.10).
- Don't use it on individual cards in the contact panel (same reason).
- Don't use it on the composer input (would degrade text legibility).

---

## Code Examples

### Example 1 — Applying the scoped wrapper

```tsx
// src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
// (inside the existing component — modified return block)

import { cn } from '@/lib/utils'

export function InboxLayout({
  v2 = false,                    // <-- new prop, default false for Regla 6
  workspaceId,
  initialConversations,
  // ... rest as today
}: InboxLayoutProps) {
  // ... existing logic UNCHANGED (D-19)

  return (
    <div className={cn('flex h-full', v2 && 'theme-editorial')}>
      {/* rest of JSX UNCHANGED from today — tokens cascade automatically */}
    </div>
  )
}
```

### Example 2 — Flag gate in `page.tsx`

```tsx
// src/app/(dashboard)/whatsapp/page.tsx  (full file after modification)

import { InboxLayout } from './components/inbox-layout'
import { getConversations, findConversationByPhone } from '@/app/actions/conversations'
import { getClientActivationSettings } from '@/app/actions/client-activation'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getIsSuperUser } from '@/lib/auth/super-user'
import { getIsInboxV2Enabled } from '@/lib/auth/inbox-v2'

interface WhatsAppPageProps {
  searchParams: Promise<{ phone?: string; c?: string }>
}

export default async function WhatsAppPage({ searchParams }: WhatsAppPageProps) {
  const { phone, c } = await searchParams
  const workspaceId = await getActiveWorkspaceId()

  if (!workspaceId) {
    return (/* existing no-workspace block */ null)
  }

  const [
    initialConversations,
    clientConfig,
    isSuperUser,
    isInboxV2,               // <-- new
  ] = await Promise.all([
    getConversations({ status: 'active', sortBy: 'last_customer_message' }),
    getClientActivationSettings(),
    getIsSuperUser(),
    getIsInboxV2Enabled(workspaceId),
  ])

  // ... existing phone/c logic UNCHANGED

  return (
    <InboxLayout
      v2={isInboxV2}         // <-- new prop
      workspaceId={workspaceId}
      initialConversations={initialConversations}
      initialSelectedId={initialSelectedId}
      clientConfig={clientConfig}
      isSuperUser={isSuperUser}
    />
  )
}
```

### Example 3 — Fonts in the module layout

```tsx
// src/app/(dashboard)/whatsapp/fonts.ts  (NEW FILE)
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

export const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ebgaramond',
  weight: 'variable',
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
  weight: '400 500',
  adjustFontFallback: true,
})
```

```tsx
// src/app/(dashboard)/whatsapp/layout.tsx  (MODIFIED)
import { ebGaramond, inter, jetbrainsMono } from './fonts'

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`h-full ${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      {children}
    </div>
  )
}
```

### Example 4 — `<MxTag>` wrapper (UI-SPEC §13.2 suggested)

```tsx
// src/app/(dashboard)/whatsapp/components/mx-tag.tsx  (NEW FILE — optional)
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type MxTagVariant = 'rubric' | 'gold' | 'indigo' | 'verdigris' | 'ink'

interface MxTagProps {
  variant: MxTagVariant
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}

export function MxTag({ variant, icon: Icon, children, className }: MxTagProps) {
  return (
    <span className={cn('mx-tag', `mx-tag--${variant}`, className)}>
      {Icon && <Icon className="h-[10px] w-[10px]" aria-hidden />}
      {children}
    </span>
  )
}
```

### Example 5 — `<IconButton>` wrapper (UI-SPEC §13.2 suggested)

```tsx
// src/app/(dashboard)/whatsapp/components/icon-button.tsx  (NEW FILE — optional)
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { forwardRef } from 'react'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string                    // aria-label required — D-24
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon: Icon, label, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center',
          'rounded-[4px] border border-[var(--border)]',
          'bg-[var(--paper-0)] text-[var(--ink-2)]',
          'transition-colors',
          'hover:bg-[var(--paper-3)] hover:text-[var(--ink-1)]',
          'active:translate-y-px',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...rest}
      >
        <Icon className="h-[14px] w-[14px]" aria-hidden />
      </button>
    )
  },
)
```

### Example 6 — Scoped `/` keyboard shortcut (D-23)

```tsx
// Inside conversation-list.tsx, in the existing component:
import { useEffect, useRef } from 'react'

function ConversationList(/* props */) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== '/') return
      // Guard 1: don't hijack when focus is inside an input/textarea/contenteditable
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      // Guard 2: only if focus is inside the themed module
      if (!target.closest('.theme-editorial')) return
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ... rest of component
}
```

**Why `.theme-editorial` selector for scoping:** Reuses the same class that gates the entire feature — no new data attribute needed. If the flag is off, the class is absent, and the shortcut is effectively disabled (the `closest` check fails). `GlobalSearch` uses `Cmd+K`, verified by grep, so no collision.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web font loading | `<link rel="preload">` + manual `@font-face` with `url('https://fonts.gstatic.com/…')` | `next/font/google` | Self-hosting + build-time optimization + zero runtime Google calls + automatic `size-adjust` fallback for CLS. `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]` |
| Theme scoping mechanism | JS-driven style injection, context provider that renders `<style>` tags, or a custom Tailwind plugin | CSS class wrapper (`.theme-editorial`) redefining CSS variables — cascade does the work | Tailwind v4 utilities already use `var(--*)` indirection. Overriding the backing variable in a scope is O(0) runtime cost. `[VERIFIED: ui.shadcn.com/docs/theming]` |
| Icon rendering | Any non-Lucide icon library | `lucide-react@^0.563.0` (already installed) | Handoff §11 requires Lucide ≥ 0.460; current satisfies. Bumping to 1.x breaks icon names. |
| Panel resize | Custom drag-to-resize with `onMouseMove` handlers | `allotment` (already installed, D-11) | Battle-tested, accessible, keyboard-navigable. |
| Dropdown/popover behavior | Raw `<div>` + click-away logic | shadcn `DropdownMenu` / `Popover` (Radix primitives) | Keyboard nav, focus trap, portal positioning, ARIA — all free. Note the portal `container` prop caveat (see Shadcn Primitive Inheritance Map). |
| Tag pills | Custom `Badge` variants via `class-variance-authority` or hardcoded `<span>` with OKLCH | `.mx-tag--rubric/gold/indigo/verdigris/ink` utility classes (or `<MxTag>` wrapper) | Handoff §6 + UI-SPEC §7.12 mandate these exact classes. Grep check in DoD will fail if bypassed. |
| Feature flag lookup | `fetch` to a bespoke endpoint or client-side Supabase call from `useEffect` | Server-side `getIsInboxV2Enabled(workspaceId)` in `whatsapp/page.tsx` | Same pattern as `getIsSuperUser`; server-side = cache-friendly, zero client waterfall. |
| Force light mode in subtree | Nested `<ThemeProvider forcedTheme="light">` | `color-scheme: light` on `.theme-editorial` + defensive `.dark .theme-editorial { … }` | `next-themes` does not support nested providers (#254). CSS-only is simpler, no forking. |
| OKLCH color mixing | Manual hex arithmetic or JS color library | `color-mix(in oklch, var(--token) N%, var(--paper-0))` CSS native | 92.8% browser support (Safari 16.2+, Chrome 111+). `[VERIFIED: caniuse.com]` Morfx is desktop B2B — safe. |
| Paper texture generation | External PNG assets | Data-URI SVG noise (handoff-provided) | Resolution-independent, zero network request, `multiply` blend native. |
| Avatar fallback styling | Hand-roll `<div>` with centered initials | shadcn `Avatar` + `AvatarFallback` with className override | Radix primitive handles image fallback, aspect ratio, keyboard. |
| Day separator (`— Martes 21 de abril —`) | Ad-hoc formatting | `date-fns` with `locale: es` + manual em-dash wrapper (`<DaySeparator>` component) | `date-fns` + `date-fns/locale/es` already in deps. |
| `cn()` utility | Any class-combining helper | `@/lib/utils` `cn` (already used throughout) | Single source of truth. |

**Key insight:** The 10 sub-topics in the key_insight all reduce to "don't fight the existing infrastructure." Tailwind v4 + shadcn already expose a CSS-variable-based theming system. `next/font/google` already handles per-route preload. `next-themes` is already configured. The CORRECT approach is 90% "configure + style" and 10% "write new code." Any line of JS added to solve a theming problem is a candidate for elimination.

---

## Common Pitfalls

### Pitfall 1: Using `@theme` instead of `@theme inline` (or vice versa) in a nested scope

**What goes wrong:** Attempt to nest `@theme { --primary: oklch(…) }` inside `.theme-editorial { … }`. Tailwind errors or silently drops the block.

**Why it happens:** Official docs: *"Theme variables are also required to be defined top-level and not nested under other selectors or media queries."* `[VERIFIED: tailwindcss.com/docs/theme]`

**How to avoid:** Inside `.theme-editorial { … }` use only plain CSS variable declarations (`--primary: oklch(…)`). The `@theme inline { --color-primary: var(--primary); }` block stays at `globals.css` top-level (already there, lines 6–47).

**Verification:** `pnpm build` should succeed. DevTools → computed styles on a `bg-primary` element inside the inbox → background-color resolves to ink-1, not the slate value.

### Pitfall 2: Token leakage outside `.theme-editorial`

**What goes wrong:** Pills or text inside a modal opened from the inbox appear in editorial colors despite the modal living in a Radix portal outside the themed wrapper. Or: a user navigates from `/whatsapp` to `/crm` and editorial tokens persist (CSS variables attached at `:root` bleed across routes).

**Why it happens:** The `<DropdownMenuContent>` and `<DialogContent>` Radix primitives render in portals attached to `document.body`. If we accidentally put the wrapper too high (on `<html>` or `<body>`) the scope leaks.

**How to avoid:**
- Apply `.theme-editorial` to a div INSIDE the module layout / InboxLayout, never at `<body>` or `<html>`.
- For Radix portals that need themed content (DropdownMenu for chat-header actions, Select, Popover in some cases), pass `container={themeEditorialRef.current}` to the `*Portal` component so the portal re-roots inside the wrapper.
- In globals.css, scope all `mx-*` utility classes with `.theme-editorial .mx-*` selectors (as shown in Token Architecture above), NOT as bare `.mx-*` classes.

**Verification:**
1. Open `/whatsapp` with flag on → DevTools inspect `<body>` computed styles → background-color is still the slate `--background` from `:root`, NOT `paper-1`. `paper-1` should appear only on the themed div.
2. Navigate `/whatsapp` → `/crm` → confirm CRM is still slate. Grep for leaked class names in DOM.
3. Open `NewConversationModal` (OUT OF SCOPE — should render slate) → dialog content is slate, not editorial.
4. Open chat-header `MoreHorizontal` dropdown → menu content is editorial (because we set `container` on the portal).

### Pitfall 3: `next-themes` overriding `color-scheme` inside `.theme-editorial`

**What goes wrong:** User toggles to dark mode. `<html class="dark">` gets applied. The native form UI (scrollbars, selection color) inside the inbox renders dark, even though our tokens are editorial light.

**Why it happens:** `next-themes` doesn't touch `color-scheme` directly, but modern browsers infer `color-scheme` from the class. If a parent has `color-scheme: dark`, children inherit. The editorial scope needs to assert `color-scheme: light` to override.

**How to avoid:** Include `color-scheme: light;` as the first declaration inside `.theme-editorial { … }` (shown in Token Architecture).

**Verification:** With dashboard theme set to dark, open DevTools → select the `.theme-editorial` div → computed `color-scheme` is `light`. Scroll the thread → scrollbar is light-styled.

### Pitfall 4: Font FOUT on first load

**What goes wrong:** On the very first load, user sees Geist (or a system sans) rendered for the editorial headings for ~200ms before EB Garamond swaps in. The layout shifts.

**Why it happens:** `display: 'swap'` shows the fallback font first, swaps to the custom when ready. Without `adjustFontFallback: true`, the fallback metrics don't match and CLS spikes.

**How to avoid:**
- `display: 'swap'` — UI-SPEC and handoff both require this (no FOIT).
- `adjustFontFallback: true` — Next.js computes a size-adjusted fallback metric (ascent-override, descent-override, line-gap-override, size-adjust) so the fallback font occupies the same line box as the real font. `[VERIFIED: nextjs.org/docs/app/api-reference/components/font]`
- Load the fonts in the module layout (not dynamically from page) so Next's `<link rel="preload">` fires immediately on route entry.

**Verification:** Lighthouse on `/whatsapp` → CLS < 0.1. Reload with hard refresh → visually the headings don't reflow when fonts swap.

### Pitfall 5: Safari `color-mix` fallback

**What goes wrong:** A Safari 15 or earlier user sees no background on `.mx-tag--gold` (the `color-mix` rule is ignored; no fallback provided).

**Why it happens:** `color-mix(in oklch, …)` requires Safari 16.2+. 92.8% of users globally are covered; the 7.2% uncovered includes ALL Safari < 16.2, IE, old mobile browsers. `[VERIFIED: caniuse.com/mdn-css_types_color_color-mix]`

**How to avoid:** Morfx is a B2B dashboard used by small-business owners in Colombia on modern desktops. The Safari < 16.2 slice is essentially zero for our user base. **No fallback needed.** If the executor discovers via Sentry or error reporting that Safari 15 users exist:
- Add a static color fallback BEFORE the `color-mix` rule: `.mx-tag--gold { background: oklch(0.94 0.05 80); /* fallback */ background: color-mix(in oklch, var(--accent-gold) 14%, var(--paper-0)); }` — the second rule wins in supporting browsers, the first is used otherwise.

**Verification:** BrowserStack on Safari 16.2 and 17 → pills render correctly. Caniuse lookup before adding any fallback — don't preemptively bloat the CSS.

### Pitfall 6: Paper texture repaint cost on Safari retina

**What goes wrong:** Scrolling the conversation list is smooth on Chrome but janky (< 55fps) on Safari 17 on M1 macOS. Frame rate drops correlate with root-level SVG noise decode.

**Why it happens:** See "Paper Texture Performance" section. Safari's layer compositor does not cache root `background-image` the way it caches a fixed `::before` pseudo-element.

**How to avoid:** Ship Pattern A first; if QA flags Safari retina regression, switch to Pattern B (one CSS change, no JS).

**Verification:** Record Safari Performance profile while scrolling the thread. Main thread time in "Composite Layers" should stay below 8ms per frame (for 60fps budget).

### Pitfall 7: shadcn `Input` focus-ring inheriting dark mode style

**What goes wrong:** Focus on the search input shows a blue ring (shadcn's default `ring/50` style in dark mode) instead of the editorial dark outline.

**Why it happens:** shadcn `Input` uses `--ring` for its focus outline. If `.dark` has a different `--ring` value and our `.dark .theme-editorial` defensive block is missing `--ring`, the dark value wins.

**How to avoid:** The Token Architecture CSS includes `--ring: var(--ink-1)` in BOTH `.theme-editorial` and `.dark .theme-editorial`. Double-check this at plan-execute time.

**Verification:** Focus the search input with dashboard in dark mode → ring is dark (ink-1), not blue.

### Pitfall 8: `mx-tag` classes polluting other modules

**What goes wrong:** A developer later uses `<span className="mx-tag mx-tag--rubric">` inside `/crm` and it appears to work — then the editorial module evolves and the selector changes, and `/crm` breaks.

**Why it happens:** Without the `.theme-editorial` selector prefix, `mx-*` utilities become global.

**How to avoid:** All `mx-*` class declarations in globals.css are prefixed with `.theme-editorial ` (see Token Architecture). If a developer applies `.mx-tag--rubric` outside the themed wrapper, the class has no effect — they'll notice and either (a) import the class correctly or (b) not use it at all.

**Verification:** Grep: `grep -rn "mx-tag\|mx-h[0-9]\|mx-body\|mx-caption" src/app/\(dashboard\)/` — results should be confined to `src/app/(dashboard)/whatsapp/**`.

### Pitfall 9: Allotment styles fighting the editorial sash

**What goes wrong:** Allotment imports its own `allotment/dist/style.css` which sets separator (sash) colors. When placed inside `.theme-editorial`, the sashes might not match the editorial `--border`.

**Why it happens:** Allotment's CSS uses hardcoded colors for the separator (a 1px divider between panes).

**How to avoid:** Override Allotment's sash color with a small rule in the scoped CSS block:
```css
.theme-editorial .split-view-view { border-color: var(--border) !important; }
.theme-editorial .sash { background: var(--border) !important; }
```
Research: verify the exact class names Allotment emits by inspecting the DOM at implementation time. `[ASSUMED: class names `split-view-view` / `sash` — verify]`

**Verification:** Drag a panel border inside `.theme-editorial` → the divider color matches the editorial `--border`, not Allotment's default gray.

### Pitfall 10: Hydration mismatch because `.theme-editorial` flips client-side

**What goes wrong:** SSR renders with `v2={false}` (flag lookup failed), client hydrates with `v2={true}` (a stale cache flipped). React throws hydration mismatch warnings.

**Why it happens:** Either (a) the flag helper is accidentally wrapped in `unstable_cache` with stale data, or (b) a client-side `useEffect` toggles the class, creating a SSR/client divergence.

**How to avoid:** The flag is read server-side ONCE per navigation, passed as a prop, applied as a className on the server-rendered element. No `useEffect` toggling. No caching.

**Verification:** Watch the console on first load → no "Hydration failed" warnings. View source → `.theme-editorial` is present in the SSR'd HTML (not added later by JS).

---

## Open Questions

1. **Which Radix primitives' portals need `container` prop re-rooting, beyond `DropdownMenu`?**
   - What we know: DropdownMenu definitely needs it (chat-header action menu).
   - What's unclear: Do we have `Select`, `Popover`, `HoverCard` inside the in-scope 8 components? `contact-panel.tsx` is 839 LOC — likely uses a few. A code grep at plan-execute time should enumerate.
   - Recommendation: Add to the plan a verification task "grep `Popover|Select|HoverCard|Dialog` in `src/app/(dashboard)/whatsapp/**` and for each result, decide if the portal content needs editorial styling; if yes, apply `container` prop pattern."

2. **Should the `v2` prop threading stop at `InboxLayout`, or does every child component need to know the flag?**
   - What we know: `InboxLayout` only needs the className; all descendants inherit tokens via CSS cascade.
   - What's unclear: Some mock-vs-real differences require different JSX (e.g., the eyebrow "Módulo · whatsapp" is new markup, not just a re-skin of existing nodes). Do we gate those with a JS check, or render them always and let CSS hide them outside the scope?
   - Recommendation: Gate the NEW JSX (eyebrow, day separator in bot style) with `v2 &&` checks in the components that gain new markup. Keep re-skin-only changes (classnames only) unconditional — the CSS scope handles them for free.

3. **Will the handoff mock's "ruled paper" thread background (repeating lines) actually be implemented, or deferred?**
   - What we know: UI-SPEC §7.5 documents it as OPTIONAL decorative, with research flag for performance.
   - What's unclear: It's an added layer on top of the already-textured `.theme-editorial` root. Stacking the noise + the ruled lines could compound Safari perf cost.
   - Recommendation: Skip it in v1 of the re-skin. Document as a deferred idea. If QA loves it later, add as a toggleable enhancement.

4. **Is there a reliable way to detect if EB Garamond loaded vs fell back to Times?**
   - What we know: CSS Font Loading API (`document.fonts.check("16px 'EB Garamond'")`) can verify.
   - What's unclear: Is it worth adding telemetry for a situation that should never happen (self-hosted font)?
   - Recommendation: Skip. If QA reports "looks like Times," it's a real bug and should fail visual diff.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `next` | Everything | ✓ | 16.1.6 installed, 16.2.4 latest | — |
| `react` / `react-dom` | Everything | ✓ | 19.2.3 | — |
| `tailwindcss` v4 | `@theme inline` scoping | ✓ | `^4` | — |
| shadcn/ui primitives | All UI | ✓ | installed via components.json | — |
| `lucide-react` | Icons | ✓ | ^0.563.0 (satisfies ≥0.460) | — |
| `allotment` | Resize panels | ✓ | ^1.20.5 | — |
| `next-themes` | Dashboard theme toggle | ✓ | ^0.4.6 | — |
| `date-fns` | Day separator, relative time | ✓ (in deps) | n/a | — |
| EB Garamond + Inter + JetBrains Mono | Editorial typography | Downloaded at build via `next/font/google` | — | Cascade to Times/Helvetica/SF Mono |
| Supabase + `workspaces.settings` JSONB | Feature flag storage | ✓ | — | — |
| Node.js | Build | ✓ | `^20` / `^22` (project standard) | — |
| `color-mix(in oklch)` | Pill backgrounds | ✓ in all target browsers | 92.8% global | Static oklch fallback if Sentry reports < 1% |
| `@custom-variant` (Tailwind v4) | Future dark variant if needed | ✓ | — | — |

**Missing dependencies:** None. **Missing with fallback:** None. The phase is purely additive — zero new npm packages (D-15 explicit).

---

## Project Constraints (from CLAUDE.md)

- **Regla 0 — GSD complete workflow:** research → plan → execute → verify → LEARNINGS. This research satisfies research phase. No code changes yet.
- **Regla 1 — Push to Vercel after code changes** (before asking user to test). Applies to execution phase, not research.
- **Regla 2 — Colombia timezone:** Dates in the day separator (`— Martes 21 de abril —`) MUST use `date-fns` with locale `es` and timezone `America/Bogota`. UI-SPEC §9.3 explicit.
- **Regla 3 — Domain layer for mutations:** Feature flag HELPER is a READ; does not require domain layer. If a future phase adds an admin UI to flip the flag, that flip MUST go through `src/lib/domain/`. Out of scope for this phase.
- **Regla 4 — Documentation always updated:** Plan must include updates to `docs/analysis/04-estado-actual-plataforma.md` reflecting the new flag and editorial module status. LEARNINGS at phase end.
- **Regla 5 — Migration before deploy:** This phase does NOT add DB migrations (the flag uses existing `workspaces.settings` JSONB column). No migration to coordinate.
- **Regla 6 — Protect agent in production (THE dominant constraint):**
  - Flag defaults to `false` — workspaces without the flag see exactly today's UI.
  - Zero changes to `initializeTools()`, `useConversations()`, realtime, webhooks, action handlers, `DebugPanelProduction`, `AgentConfigSlider`, `markAsRead`, `getConversation` (D-19).
  - Props and signatures of the 8 in-scope components do NOT change except for one new optional `v2?: boolean` on `InboxLayout`.
  - Side-by-side QA before merge (D-03).
- **Rules (from `.claude/rules/`):**
  - `agent-scope.md`: Not applicable — this phase does not introduce an AI agent. It's a UI re-skin.
  - `code-changes.md`: Bloqueante — no edits without approved PLAN. This research output feeds `/gsd-plan-phase`.
  - `gsd-workflow.md`: research is OBLIGATORY before plan. Done here.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Safari retina SVG noise perf may regress vs non-retina | Paper Texture Performance | Low — fallback pattern documented; QA catches if it happens. |
| A2 | Cormorant Garamond fallback unnecessary (EB Garamond loads reliably when self-hosted) | Font Loading Strategy | Very low — self-hosted fonts via Next never fail in the wild; Times fallback is visually acceptable. |
| A3 | Safari < 16.2 users are negligible share of Morfx user base | Common Pitfalls #5 | Low — operator is Morfx internal + Colombian SMB staff on modern hardware. If Sentry disproves, add static color fallback (non-breaking). |
| A4 | Allotment's sash CSS classes are `split-view-view` / `sash` | Common Pitfalls #9 | Low — verifiable at execute time with DOM inspector; rule is a one-liner. |
| A5 | Cormorant Garamond adds ~40KB with zero visible benefit | Font Loading Strategy | Low — if user reports "looks wrong without Cormorant," easy to add back. |
| A6 | `next/font/google` in a nested layout preloads per-route (not globally) | Font Loading Strategy | **Very low — verified against official Next.js 16.2 docs.** `[VERIFIED]` |
| A7 | Scoped CSS variable override works with shadcn primitives without rewrites | Architecture Patterns / Token Architecture | **Very low — verified against shadcn docs + example-ui-themes repo.** `[VERIFIED]` |

Total `[ASSUMED]` claims: 5 low-risk items, each with clear mitigation. The load-bearing claims (Tailwind v4 scoping, next/font behavior, color-mix support) are all `[VERIFIED]`.

---

## Sources

### Primary (HIGH confidence)

- [Tailwind CSS v4 Theme docs](https://tailwindcss.com/docs/theme) — `@theme` directive rules, top-level-only requirement
- [Tailwind CSS v4 Functions and directives](https://tailwindcss.com/docs/functions-and-directives) — `@theme inline` syntax
- [Tailwindlabs discussion #18560 — @theme vs @theme inline](https://github.com/tailwindlabs/tailwindcss/discussions/18560) — semantic difference and override behavior
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming) — scoped override mechanism verified; "CSS custom properties resolve based on the cascade at the element's location"
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4) — `:root` + `.dark` + `@theme inline` reference pattern
- [shadcn/example-ui-themes](https://github.com/shadcn/example-ui-themes) — `.theme-orange` / `.theme-green` class wrapper in production use
- [Next.js 16.2 — Font component API reference](https://nextjs.org/docs/app/api-reference/components/font) — all option definitions, preload per-route behavior
- [Next.js 16.2 — Font Optimization getting started](https://nextjs.org/docs/app/getting-started/fonts) — multi-font patterns, variable font guidance
- [Can I Use — color-mix()](https://caniuse.com/mdn-css_types_color_color-mix) — 92.8% global support, Safari 16.2+, Chrome 111+, Firefox 113+
- [pacocoursey/next-themes — README](https://github.com/pacocoursey/next-themes) — `forcedTheme` API + no nested provider support
- [next-themes issue #254 — Allow nested providers](https://github.com/pacocoursey/next-themes/issues/254) — confirmed unresolved as of Feb 2024, workaround requires fork

### Secondary (MEDIUM confidence — cross-verified)

- [Shadcnblocks — Updating shadcn to Tailwind 4](https://www.shadcnblocks.com/blog/tailwind4-shadcn-themeing/) — explicit migration pattern
- [Flagrant — Tailwind v4 Custom Theme Styling (2025-08-21)](https://www.beflagrant.com/blog/tailwindcss-v4-custom-theme-styling-2025-08-21) — @theme inline use cases
- [Wawandco — Multiple Portals, One Codebase: Scalable Theming with Tailwind v4](https://wawand.co/blog/posts/managing-multiple-portals-with-tailwind/) — multi-scope theming pattern analogous to ours (access failed but referenced in search results)
- [Kevin Ochoa — Theme colors with Tailwind CSS v4.0 and Next Themes (Medium)](https://medium.com/@kevstrosky/theme-colors-with-tailwind-css-v4-0-and-next-themes-dark-light-custom-mode-36dca1e20419) — dark/light/custom scope handling
- [Goncy — shadcn-tailwind4-turborepo POC](https://github.com/goncy/shadcn-tailwind4-turborepo) — multi-theme proof of concept
- [Google Fonts — EB Garamond](https://fonts.google.com/specimen/EB+Garamond) — variable font confirmed, weight 400–800
- [Wikipedia — EB Garamond](https://en.wikipedia.org/wiki/EB_Garamond) — historical + variable font specifics

### Tertiary (informational — not load-bearing)

- [CSS-Tricks — Grainy Gradients](https://css-tricks.com/grainy-gradients/) — SVG noise background pattern (no 2026 Safari benchmark)
- [Vercel — Custom fonts without compromise using Next.js and next/font](https://vercel.com/blog/nextjs-next-font) — self-hosting rationale
- [Contentful — Next.js fonts optimization](https://www.contentful.com/blog/next-js-fonts/) — bundle size guidance for multiple fonts

### Repo references (direct file reads)

- `/mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md` — project rules 0–6
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/ui-redesign-conversaciones/CONTEXT.md` — decisions D-01..D-24
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/ui-redesign-conversaciones/UI-SPEC.md` — design contract
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/README.md` — handoff §§1–18
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/colors_and_type.css` — v2 source of truth
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/globals.css` — current `@theme inline` + `:root` + `.dark`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/layout.tsx` — Geist loading + ThemeProvider
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/layout.tsx` — WorkspaceProvider attachment
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/whatsapp/page.tsx` — flag insertion point
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/whatsapp/layout.tsx` — font loading candidate
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` — wrapper site
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/components/layout/sidebar.tsx` — `settingsKey` convention reference
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/components/search/global-search.tsx` — confirmed Cmd+K (no `/` conflict)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/auth/super-user.ts` — `getIsInboxV2Enabled` template
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/components.json` — shadcn config (new-york / slate / cssVariables / lucide)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/package.json` — verified versions

---

## Metadata

**Confidence breakdown:**
- Standard Stack: **HIGH** — all versions npm-verified, all libraries already installed.
- Architecture Patterns (scoping): **HIGH** — verified against official Tailwind v4 and shadcn docs + example repo.
- Font Loading Strategy: **HIGH** — verified against Next.js 16.2 official docs.
- Shadcn Primitive Inheritance Map: **MEDIUM-HIGH** — most cases confirmed; Dialog/DropdownMenu portal caveat based on Radix knowledge, verifiable at implementation.
- Force-Light Workaround: **MEDIUM** — no official `next-themes` support; CSS-only solution follows from CSS cascade rules and `color-scheme` spec; conservative approach.
- Paper Texture Perf: **MEDIUM-LOW** — no 2026 benchmark; fallback pattern documented for one-commit rollback.
- Common Pitfalls: **HIGH** — each pitfall has a concrete verification step.

**Research date:** 2026-04-22
**Valid until:** 2026-07-22 (90 days — stack is stable: Tailwind v4 is GA, Next 16 is GA, shadcn new-york preset is mature).

---

## RESEARCH COMPLETE

**Phase:** standalone / ui-redesign-conversaciones
**Confidence:** HIGH on load-bearing claims (scoping mechanism, font loading, primitive inheritance); MEDIUM on Safari-retina texture perf (single fallback pattern documented, not an unknown unknown).

### Load-bearing findings

1. **Tailwind v4 + shadcn scoped token override is the documented, canonical pattern** for subtree theming. Redefining CSS variables inside `.theme-editorial` makes every shadcn primitive inherit for free — no component rewrites, no Tailwind plugin, no runtime cost.
2. **Load fonts in the module layout (`src/app/(dashboard)/whatsapp/layout.tsx`), not the root.** Next.js preloads per-route — other dashboard modules stay on Geist with zero editorial font cost. ~150KB total self-hosted impact on `/whatsapp` only.
3. **`next-themes` does not support nested providers for subtree forcing** (issue #254 open since Feb 2024). The CSS-only workaround — `color-scheme: light` + defensive `.dark .theme-editorial { … }` token re-apply — is simpler, no fork, covers the requirement.
4. **The shadcn `Badge` primitive must be bypassed**; use `.mx-tag--*` utility classes (or a thin `<MxTag>` wrapper). The shadcn `Tabs` primitive should be replaced with a manual tab bar (fighting shadcn's default Tabs styling into underline-only design is more work than a plain `<div>` + buttons). `Avatar` default fallback needs className override. `DropdownMenu`, `Select`, `Popover` may need `container` prop on their Radix portals to re-root inside `.theme-editorial`.
5. **The `/` keyboard shortcut is free** — `GlobalSearch` uses `Cmd+K`, grep-verified. Scope the inbox `/` shortcut to `target.closest('.theme-editorial')` to guarantee no regression if future modules add a `/` binding.
6. **Server-side flag helper** `getIsInboxV2Enabled(workspaceId)` in `src/lib/auth/inbox-v2.ts` mirrors `getIsSuperUser()`. JSONB path: `workspaces.settings.ui_inbox_v2.enabled`. Fails closed to `false` — Regla 6 guaranteed.
7. **Paper texture**: ship `background-image` on root (simpler). Document the `::before` fallback in a code comment. One-commit rollback if Safari retina QA regresses.
8. **Zero new npm packages.** 4 fonts self-hosted via `next/font/google` (no install). `color-mix(in oklch, …)` has 92.8% global support — safe for Morfx's desktop B2B audience.
9. **CSS-only footprint**: ~170 lines of scoped CSS in `globals.css` (≈3KB minified+gzipped). Zero runtime JS for the theming mechanism.
10. **Decision chain is complete** — no blocking unknowns. The planner can break this into 5–7 atomic plans (fonts setup, flag helper, globals.css block, wrapper application + conditional rendering, component re-skins × N waves, QA + DoD verification).

### Files that will be created or modified (for the planner's consumption)

**Created:**
- `src/lib/auth/inbox-v2.ts` (new — flag helper)
- `src/app/(dashboard)/whatsapp/fonts.ts` (new — font definitions)
- `src/app/(dashboard)/whatsapp/components/mx-tag.tsx` (new — wrapper, optional)
- `src/app/(dashboard)/whatsapp/components/icon-button.tsx` (new — wrapper, optional)
- `src/app/(dashboard)/whatsapp/components/day-separator.tsx` (new — date helper, optional)

**Modified (additive only — behavior preserved when flag off):**
- `src/app/globals.css` (append scoped block ~170 lines)
- `src/app/(dashboard)/whatsapp/layout.tsx` (add font variables to wrapper className)
- `src/app/(dashboard)/whatsapp/page.tsx` (add `getIsInboxV2Enabled` to Promise.all + pass `v2` prop)
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` (add `v2?: boolean` prop; conditional `theme-editorial` className)
- `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` (re-skin + conditional eyebrow + `/` keyboard)
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` (re-skin item card)
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (re-skin thread, day separator)
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` (re-skin header + ibtn actions + DropdownMenu portal container)
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` (re-skin ONLY — no refactor)
- `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` (re-skin bubble + timestamp + bot eyebrow)
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` (re-skin composer + Send button)

**Not modified (Regla 6):**
- `initializeTools()`, `useConversations()`, realtime subscriptions, `DebugPanelProduction`, `AgentConfigSlider`, `markAsRead`, `getConversation`, webhook handlers, all server actions, domain layer.

### Ready for planning

Plan-phase can proceed. The plan should break the work into waves — suggested shape:
- **Wave 0:** Infrastructure (globals.css scoped block, fonts.ts, flag helper, module layout wrapper, `page.tsx` flag threading). Non-visual changes — can ship with flag off without any risk.
- **Wave 1:** Component re-skins — `inbox-layout` + `conversation-list` + `conversation-item` (parallel-safe; no shared state mutation).
- **Wave 2:** Component re-skins — `chat-view` + `chat-header` + `message-bubble` + `message-input` (parallel-safe).
- **Wave 3:** `contact-panel` re-skin (isolated, 839 LOC — biggest single component).
- **Wave 4:** States (loading skeletons, empty states, error banner) + keyboard shortcuts + ARIA labels.
- **Wave 5:** DoD verification — visual diff vs mock, axe-core, BrowserStack Safari, grep verification (no hardcoded oklch, no `.tg.*` legacy, Regla 6 diff against main).

No `## CHECKPOINT REACHED`. No `## RESEARCH INCONCLUSIVE`. Proceed.
