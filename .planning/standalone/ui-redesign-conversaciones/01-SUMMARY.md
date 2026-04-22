---
phase: ui-redesign-conversaciones
plan: 01
subsystem: /whatsapp module UI infrastructure
tags:
  - ui
  - re-skin
  - feature-flag
  - scoped-tokens
  - editorial-design
  - regla-6

dependency_graph:
  requires:
    - src/lib/auth/super-user.ts (analog for fail-closed flag helper)
    - src/app/layout.tsx (analog for next/font/google variable wiring)
    - src/components/ui/badge.tsx (analog for MxTag shape — cva skipped)
    - src/components/ui/button.tsx (analog for IconButton forwardRef shape)
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx:225-234 (analog for DaySeparator)
  provides:
    - getIsInboxV2Enabled server-side flag resolver
    - .theme-editorial CSS scope (tokens + shadcn overrides + mx-* utilities)
    - 3 shared client components (MxTag, IconButton, DaySeparator)
    - InboxV2Provider + useInboxV2 hook
    - v2 prop on <InboxLayout> + conditional className + data-module attr
  affects:
    - /whatsapp route (Wave 0 scaffolding — inert until flag flipped per workspace)

tech_stack:
  added:
    - EB_Garamond / Inter / JetBrains_Mono via next/font/google (per-route)
    - color-mix(in oklch, ...) for editorial pill construction
  patterns:
    - Fail-closed server-side flag resolver (mirror src/lib/auth/super-user.ts)
    - Scoped CSS custom property override via .theme-editorial selector
    - Context-over-prop-drilling for flag access in client subtree (Option B)
    - Per-route font preload instead of root layout (saves bundle on other routes)

key_files:
  created:
    - src/lib/auth/inbox-v2.ts
    - src/app/(dashboard)/whatsapp/fonts.ts
    - src/app/(dashboard)/whatsapp/components/mx-tag.tsx
    - src/app/(dashboard)/whatsapp/components/icon-button.tsx
    - src/app/(dashboard)/whatsapp/components/day-separator.tsx
    - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
  modified:
    - src/app/globals.css
    - src/app/(dashboard)/whatsapp/layout.tsx
    - src/app/(dashboard)/whatsapp/page.tsx
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx

decisions:
  - "D-01/D-02 enforced: flag lives in workspaces.settings.ui_inbox_v2.enabled JSONB (namespace + key, not flat 'ui_inbox_v2_enabled'), default false. Resolved server-side in page.tsx via Promise.all with getActiveWorkspaceId() result"
  - "D-04 enforced: .theme-editorial is a local selector scope. Outside the scope, :root + .dark shadcn-slate tokens are byte-identical to prior state (verified by diff)"
  - "D-05 enforced: shadcn semantic tokens (--background, --foreground, --primary, --accent, --destructive, --border, --input, --ring, --radius) are overridden inside .theme-editorial to editorial values, letting all shadcn primitives inherit the new look without rewriting components"
  - "D-07 enforced: mx-* utilities (display/h1..h4/body/body-long/caption/smallcaps/rubric/marginalia/ui/mono/rule*/tag/tag--*/skeleton) all gated by the .theme-editorial ancestor selector — zero pollution of other dashboard routes"
  - "D-09/D-10 enforced: EB Garamond (400/500/600/700/800 + italic), Inter (variable axis), JetBrains Mono (400/500) loaded per-route via next/font/google. Cormorant Garamond NOT loaded (UI-SPEC §6.3 cascade-fallback decision)"
  - "D-19/D-20 enforced: zero logic changes. Regla 6 NO-TOUCH guard verified — useConversations, useMessages, markAsRead, getConversation, realtime subscriptions, webhook handlers, DebugPanelProduction, AgentConfigSlider, chat-view/chat-header/conversation-list/conversation-item/message-bubble/message-input/contact-panel byte-identical to base 7a076c3"
  - "D-21 enforced: lucide-react @ existing version in deps. LucideIcon type accepted as optional slot in MxTag. No package.json change"
  - "D-24 enforced: IconButton TypeScript interface makes 'aria-label': string REQUIRED — omitting it is a compile error"
  - "Critical UI-SPEC §4 mapping preserved: --primary maps to --ink-1 (ink), NOT to --rubric-2 (the reserved accent). Confused mapping would flood the UI with accent color and break the 60/30/10 color contract"
  - "Anti-pattern avoided: NO @theme block inside .theme-editorial (Tailwind v4 rejects nested @theme — RESEARCH Pitfall 1). Scope uses only plain CSS variable declarations"

metrics:
  duration: ~45 minutes
  completed_date: 2026-04-22T21:11:24Z
  tasks: 4
  commits: 4
  files_created: 6
  files_modified: 4
  lines_added: ~735
---

# Standalone ui-redesign-conversaciones Plan 01: Wave 0 Editorial Infrastructure Summary

**One-liner:** Plantea toda la infraestructura del re-skin editorial (flag helper, CSS scope con 310 lineas de tokens editoriales + utilities mx-*, fuentes EB Garamond/Inter/JetBrains Mono via next/font/google per-route, 4 componentes cliente nuevos, wrapper condicional en InboxLayout) sin aplicar ningun cambio visible al usuario — todo gated por `workspaces.settings.ui_inbox_v2.enabled`, default `false`.

## Scope

Wave 0 del standalone `ui-redesign-conversaciones` — **infrastructure only**. Zero visible UI change for any user; zero package.json change; zero migration. Post-wave state:

- Server-side flag resolver `getIsInboxV2Enabled(workspaceId)` exists and fails closed on any error.
- `.theme-editorial` CSS scope exists in `globals.css` with paper/ink/rubric/accent tokens, shadcn semantic token overrides (D-05), and `mx-*` typography/tag/skeleton utilities. Inert until className applied.
- EB Garamond (+ italic), Inter, JetBrains Mono preload **only on `/whatsapp/**`** routes via per-route `fonts.ts` + layout wrapper. Other dashboard routes (`/crm`, `/tareas`, etc.) unaffected.
- Four optional shared client components (`<MxTag>`, `<IconButton>`, `<DaySeparator>`, `<InboxV2Provider>` + `useInboxV2()` hook) are available for Waves 1-5 to consume.
- `<InboxLayout>` accepts `v2?: boolean` prop (default `false`). When `true`, root div gets `.theme-editorial` class + `data-module="whatsapp"` attribute, and children are wrapped with `<InboxV2Provider>`. When `false` (today's state for all workspaces), className is exactly `flex h-full` — byte-identical to main, guaranteeing Regla 6 zero-regression.

## Tasks

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Server-side flag helper + page.tsx Promise.all threading | `1d72504` | `src/lib/auth/inbox-v2.ts` (new), `src/app/(dashboard)/whatsapp/page.tsx` |
| 2 | .theme-editorial CSS scope (~310 lines) + per-route fonts + layout wrapper | `b674c2b` | `src/app/globals.css`, `src/app/(dashboard)/whatsapp/fonts.ts` (new), `src/app/(dashboard)/whatsapp/layout.tsx` |
| 3 | Shared editorial client components + InboxV2 context | `e05f39d` | `mx-tag.tsx`, `icon-button.tsx`, `day-separator.tsx`, `inbox-v2-context.tsx` (all new) |
| 4 | Wire InboxLayout — v2 prop + conditional .theme-editorial className + InboxV2Provider | `70357ea` | `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` |

## Acceptance Criteria — all 4 Tasks PASSED

### Task 1 (commit `1d72504`)

- [x] `src/lib/auth/inbox-v2.ts` exists with `export async function getIsInboxV2Enabled`
- [x] Namespace `ui_inbox_v2` (not `ui_inbox_v2_enabled`) — leaves room for retention_days, etc.
- [x] Fail-closed comparison `ns?.enabled === true` (missing key → false)
- [x] Correct import `createClient from '@/lib/supabase/server'` (authenticated, not admin)
- [x] `page.tsx` Promise.all destructures `[initialConversations, clientConfig, isSuperUser, isInboxV2]`
- [x] `v2={isInboxV2}` forwarded to `<InboxLayout>` as 6th prop (after `isSuperUser`)
- [x] Early-return branch, `findConversationByPhone` fallback UNCHANGED (D-19)

### Task 2 (commit `b674c2b`)

- [x] `fonts.ts` exports `ebGaramond`, `inter`, `jetbrainsMono` from `next/font/google`
- [x] EB Garamond loads 400/500/600/700/800 + italic (D-10 `mx-caption`/`mx-marginalia` italic need)
- [x] Cormorant Garamond NOT loaded (UI-SPEC §6.3 cascade decision — saves ~40KB)
- [x] `layout.tsx` wrapper div receives `${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} h-full` (preserves existing `h-full`)
- [x] `globals.css` contains `.theme-editorial { color-scheme: light; ... }` block with all paper-0..4 / ink-1..5 / rubric-1..3 / accent-verdigris/gold/indigo tokens, shadcn overrides per UI-SPEC §4 mapping (critical: `--primary: var(--ink-1)` NOT rubric-2), paper-grain + paper-fibers SVG textures, mx-* utilities, color-mix(in oklch) pill construction, @keyframes mx-pulse skeleton animation, prefers-reduced-motion a11y guard
- [x] Defensive `.dark .theme-editorial { ... }` block present to win specificity when next-themes applies `.dark` globally (UI-SPEC §12.4)
- [x] Commented-out `/* PAPER TEXTURE FALLBACK */` block present for one-commit rollback (Pitfall 6)
- [x] NO `@theme` inside `.theme-editorial` — Tailwind v4 rejects nested (Pitfall 1)
- [x] Original `:root` (32 tokens) and `.dark` (31 tokens — note: plan said "32", actual count in main is 31 and matches exactly) blocks byte-identical (verified by git diff)

### Task 3 (commit `e05f39d`)

- [x] `<MxTag variant>` — variant template literal `mx-tag--${variant}`, no class-variance-authority, optional `LucideIcon` slot
- [x] `<IconButton>` — `forwardRef`, mandatory `'aria-label': string` (D-24 → TS compile error if missing), 32×32 (`h-8 w-8`), hover paper-3, active `translate-y-px`, focus-visible outline ink-1
- [x] `<DaySeparator>` — `format(date, "EEEE d 'de' MMMM", { locale: es })`, capitalize weekday (es locale lowercases by default), em-dash U+2014 wrapping, `mx-smallcaps` class
- [x] `<InboxV2Provider>` + `useInboxV2()` — `createContext<boolean>(false)` default, `'use client'` directive

### Task 4 (commit `70357ea`)

- [x] `v2?: boolean` prop declared on `InboxLayoutProps` with analog JSDoc to `isSuperUser`
- [x] Default `v2 = false` in destructure
- [x] Root render: `<InboxV2Provider v2={v2}><div className={cn('flex h-full', v2 && 'theme-editorial')} data-module="whatsapp">` — exact shape per plan
- [x] Regla 6 NO-TOUCH guard: `useState`, `useCallback`, `useEffect`, `Allotment`, `markAsRead`, `getConversation`, `DebugPanelProduction`, `AgentConfigSlider`, `ChatView`, `ContactPanel`, `ConversationList` all still present (grep)
- [x] Existing `debugPanelOpen && isSuperUser && selectedConversationId` conditional branch byte-identical
- [x] Diff shows ONLY: 2 import additions (cn + InboxV2Provider), 1 prop+JSDoc addition, 1 destructure default addition, 1 wrapper wrap + className+attribute change on the outer div. No deletions of behavioral code.

## Regla 6 — Zero Regression Verification

Git diff vs base commit `7a076c3` confirms **byte-identical** state for all NO-TOUCH files (D-19 + D-20 requirement):

- `src/lib/whatsapp/useConversations.ts` — unchanged
- `src/app/actions/conversations.ts` — unchanged
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/` — unchanged
- `src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` — unchanged
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` — unchanged

Total changed files: exactly 10 — matches `files_modified` frontmatter of 01-PLAN.md.

## Flag-OFF Byte-Identical Guarantee

When `workspaces.settings.ui_inbox_v2.enabled` is absent or `false` (which is true for every workspace today, since the flag is not yet set anywhere):

- `getIsInboxV2Enabled()` returns `false` (fail-closed by missing JSONB key).
- `page.tsx` passes `v2={false}` to `<InboxLayout>`.
- `cn('flex h-full', false && 'theme-editorial')` → evaluates to `'flex h-full'` (the `false && ...` short-circuits). Root div className is exactly the original string.
- CSS tokens inside `.theme-editorial { ... }` never apply because no element has that class.
- Font variables (`--font-ebgaramond`, etc.) are present on the wrapper div but no selector reads them (`--font-display`, `--font-serif` are defined only inside `.theme-editorial`). Zero visual effect.
- `<InboxV2Provider v2={false}>` is inert — no child component consumes `useInboxV2()` yet (Waves 1-5 will).
- `data-module="whatsapp"` attribute is present but no CSS rule or JS handler reads it yet.

Observable flag-OFF delta in DOM vs base `7a076c3`:
1. One React.Context provider wrapping the root (no visible effect).
2. One `data-module="whatsapp"` attribute on the outer div (no visible effect).

Both are additive, inert, and verifiable. Build is clean.

## Build Verification

```
npx tsc --noEmit 2>&1 | grep -E "inbox-v2|fonts\.ts|mx-tag|icon-button|day-separator|inbox-v2-context|inbox-layout|whatsapp/page|whatsapp/layout"
```

Result: empty output. Zero TypeScript errors in any of the 10 Plan 01 files. Pre-existing vitest/somnio errors elsewhere in the repo are out-of-scope per plan.

## Deviations from Plan

**None functional** — plan executed exactly as written across all 4 tasks.

Two minor non-functional notes for traceability:

1. **Task 2 acceptance criterion `:root` and `.dark` block token counts:** Plan acceptance said "verify their lines stay constant — `:root` has 32 token lines, `.dark` has 32 token lines". Verified `:root` = 32 tokens (matches plan). Verified `.dark` = 31 tokens (the plan said 32 but `git show` of the base commit confirms the original file has exactly 31 tokens in `.dark`, missing the `--radius` line which is defined only in `:root`). The `.dark` block is byte-identical to main — the "stay constant" contract is satisfied (31 → 31). Plan figure of 32 was a count-off-by-one; not a deviation.

2. **Grep-based acceptance check `! grep -q "Cormorant"`:** `fonts.ts` contains two comment lines explaining that Cormorant Garamond is intentionally NOT loaded (UI-SPEC §6.3 decision documentation). There is NO import of `Cormorant_Garamond` from `next/font/google` (verified). The intent of the criterion (Cormorant not actually loaded) is fully satisfied — the literal `! grep` false-positives against the documentation comment, but the semantic check passes.

## Authentication Gates

None encountered. All code paths are local (no external auth required for implementation or testing).

## Handoff Note to Wave 1

Scaffold is ready. Downstream plans (02-06) can now:

- Import `<MxTag>`, `<IconButton>`, `<DaySeparator>` from `./components/` as editorial primitives.
- Call `useInboxV2()` in any client component inside `<InboxLayout>`'s subtree to gate NEW JSX conditional on the flag, without prop-drilling.
- Apply Tailwind utility classes like `bg-primary`, `text-foreground`, `bg-muted`, `border-border` etc. in any child component — they will resolve to editorial tokens (ink/paper/rubric) automatically inside `.theme-editorial` and remain shadcn-slate outside. The CSS cascade does the work for free.
- Use custom editorial classes like `text-[var(--ink-1)]`, `bg-[var(--paper-0)]`, `border-l-[3px] border-l-[var(--rubric-2)]` for UI-SPEC pixel-specific cases that don't map cleanly to shadcn tokens.

No workspace has the flag enabled yet. To manually enable for a test workspace:

```sql
UPDATE workspaces
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_inbox_v2,enabled}', 'true'::jsonb, true)
WHERE id = '<test-workspace-uuid>';
```

Then reload `/whatsapp` — the InboxLayout root div should have `class="flex h-full theme-editorial"` and DevTools inspector should show `--background` resolving to `oklch(0.985 0.012 82)` (paper-1) instead of `oklch(1 0 0)`.

## Self-Check: PASSED

All 10 files exist on disk:
- FOUND: src/lib/auth/inbox-v2.ts
- FOUND: src/app/(dashboard)/whatsapp/fonts.ts
- FOUND: src/app/(dashboard)/whatsapp/layout.tsx
- FOUND: src/app/(dashboard)/whatsapp/page.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/mx-tag.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/icon-button.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/day-separator.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
- FOUND: src/app/globals.css

All 4 commits exist in git log:
- FOUND: 1d72504 (Task 1 — flag helper + page.tsx threading)
- FOUND: b674c2b (Task 2 — CSS scope + fonts + layout wrapper)
- FOUND: e05f39d (Task 3 — 4 shared editorial components)
- FOUND: 70357ea (Task 4 — InboxLayout wiring + conditional className)
