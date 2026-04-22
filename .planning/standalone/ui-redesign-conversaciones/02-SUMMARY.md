---
phase: ui-redesign-conversaciones
plan: 02
subsystem: whatsapp-inbox
tags: [ui, editorial, re-skin, wave-1, list-panel]

requires:
  - 01-PLAN (useInboxV2 context, MxTag, IconButton, theme-editorial CSS scope, mx-pulse keyframes)
provides:
  - Editorial list-panel header (eyebrow + h1 + 4 underlined tabs)
  - Editorial search input with "/" keyboard shortcut scoped to [data-module="whatsapp"]
  - Editorial conversation-item (paper-3 avatar, rubric-2 selected rail, unread dot/pill, mono timestamp)
  - Empty-bandeja state (D-15)
  - Empty-filter state (D-16)
  - Interim loading skeleton (D-14 early coverage)
affects:
  - none outside 2 in-scope files

tech-stack:
  added: []
  patterns:
    - "useInboxV2()-gated JSX for NEW editorial markup"
    - "Flag-OFF preservation via {!v2 && (<legacy/>)} branches for byte-identical fallback"
    - "Mapping editorial tabs to existing ConversationFilter union (no hook mutation — D-19)"
    - "Scoped keydown listener using target.closest('[data-module=\"whatsapp\"]') guard"

key-files:
  modified:
    - path: src/app/(dashboard)/whatsapp/components/conversation-list.tsx
      role: List header + search + empty states (D-15/D-16) + interim skeleton
    - path: src/app/(dashboard)/whatsapp/components/conversation-item.tsx
      role: Item card editorial skin + universal a11y attrs (listitem/aria-selected/aria-current)
  created: []

decisions:
  - "Mapped editorial tab 'Cerradas' to existing filter value 'archived' (closed = archivada in this CRM's semantics — no new filter added, hook untouched)"
  - "Kept secondary filter row (sort-mode, agent-filter, tag-filter) intact under v2 in its own border-bottom block, so advanced features (Bot filter + Tag popover) remain reachable without breaking the editorial aesthetic"
  - "Wrapped <RelativeTime> in a <span> for the v2 mono timestamp styling, since <RelativeTime> does not accept a style prop (would have been a TS error otherwise)"
  - "Both name variants (hasUnread true and false) render font-semibold under v2 — UI-SPEC §7.1 does not differentiate name weight on unread; unread state is communicated via the preview color/weight + the unread dot/pill only"

metrics:
  duration: ~45 minutes
  completed: 2026-04-22T21:29:21Z
  tasks_total: 2
  tasks_completed: 2
  files_changed: 2
  commits: 2
---

# Plan 02 — List Panel Editorial Re-skin — Summary

**One-liner:** Re-skinned the leftmost conversation-list column to editorial paper aesthetic (eyebrow + display title + underlined tabs + paper search with `/` shortcut, avatar paper-3 + rubric-2 selected rail + mono timestamp + unread dot/pill), all gated by `useInboxV2()` so flag-OFF users see byte-identical legacy UI.

## Commits

| Hash | Task | Message |
| ---- | ---- | ------- |
| `dee0521` | Task 1 | `feat(ui-redesign-conversaciones-02): list header editorial + tabs + search '/' + empty states` |
| `d782624` | Task 2 | `feat(ui-redesign-conversaciones-02): item editorial — avatar paper-3, rubric-2 rail, unread dot, mono timestamp` |

## What Shipped

### conversation-list.tsx (Task 1)

When `useInboxV2() === true`:
- **Utility row** (pt-3 px-4): `+` Nueva conversación button (variant="ghost", h-7 w-7, aria-label) + `<AvailabilityToggle>`.
- **Editorial header** (px-4 pt-2 pb-2, `border-b border-[var(--ink-1)]` hard rule):
  - Eyebrow `block text-[10px] uppercase tracking-[0.12em] font-semibold` color `var(--rubric-2)` → `"Módulo · whatsapp"` (U+00B7 medium dot).
  - `<h1>` `text-[26px] font-semibold tracking-[-0.015em]` color `var(--ink-1)` font-family `var(--font-display)` → `"Conversaciones"`.
  - 4 tabs (`role="tablist"`) mapped `{ all: 'Todas', unassigned: 'Sin asignar', mine: 'Mías', archived: 'Cerradas' }` — active: `font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]`; inactive: `font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent`. Focus-visible outline `ink-1` offset 4.
- **Editorial search** (px-4 py-2, `border-b border-[var(--border)]`, `position: relative`):
  - `<SearchIcon>` lucide 14×14 absolute `left-[22px] top-1/2 -translate-y-1/2` color `var(--ink-3)` with `aria-hidden`.
  - `<input>` `bg-[var(--paper-0)] border border-[var(--border)] rounded-[4px] py-2 pr-3` + inline `paddingLeft: '28px'` (UI-SPEC §5.1 justified exception: base 12 + icon 14 + aire 2). Placeholder `"Buscar por nombre, teléfono o etiqueta…"` (U+2026). `aria-label="Buscar conversaciones"`.
- **Secondary filter row** (px-4 py-2, bordered): sort-mode + agent-filter + tag-filter popover — all existing buttons preserved, Bot filter + Tag popover still reachable.
- **`/` keyboard shortcut** (D-23): `useEffect` with document keydown listener registered only when `v2`:
  - Ignores `input`, `textarea`, `contenteditable` targets.
  - Requires `target.closest('[data-module="whatsapp"]')` — focus must be inside WhatsApp module.
  - Focuses `searchInputRef.current`. Does NOT fire outside `/whatsapp` even if some other module is mounted. Prevents the default `/` type when hijacked.
- **D-15 empty bandeja** (when `filteredConversations.length === 0` AND `!isFiltered`):
  - Centered flex column with `mx-h3 "La bandeja está limpia."` + `mx-caption "Cuando llegue un mensaje nuevo aparecerá aquí."` + `mx-rule-ornament "· · ·"`.
- **D-16 empty filter** (when `filteredConversations.length === 0` AND `isFiltered`):
  - Centered `mx-h4 "Nada coincide con los filtros activos."` + underline link `"Limpiar filtros"` that resets `filter='all'`, `query=''`, `agentFilter='all'`, `tagFilter=null`.
  - `isFiltered` = `filter !== 'all' || hasQuery || agentFilter === 'agent-attended' || !!tagFilter`.
- **Interim D-14 skeleton** (loading with no initial data): 6 blocks `h-[72px] mx-4 my-2 bg-[var(--paper-2)] border border-[var(--border)] rounded-[4px]` with inline `animation: mx-pulse 1.5s ease-in-out infinite` (keyframes already in globals.css from Wave 0). `aria-hidden`. Full polished `mx-skeleton` utility comes in Plan 05.

When `useInboxV2() === false`:
- Legacy UI preserved byte-identical (old h2 + Plus button + AvailabilityToggle header, `<InboxFilters>` pill tabs + `<SearchInput>`, sort/agent/tag buttons, original loader, original text-muted-foreground empty state with full switch case).

### conversation-item.tsx (Task 2)

When `useInboxV2() === true`:
- **Root button**:
  - Selected: `bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] py-3 pr-4 pl-[13px]` — the `pl-[13px]` (UI-SPEC §5.1 critical exception) compensates the 3px border-left so content does NOT shift horizontally vs. unselected items.
  - Unselected: `p-3 border-b border-[var(--border)] hover:bg-[var(--paper-2)]`.
  - ARIA: `role="listitem"`, `aria-selected={isSelected}`, `aria-current={isSelected || undefined}` — applied **unconditionally** (D-24 universal a11y, flag-agnostic).
- **Avatar** (40×40 circle): `bg-[var(--paper-3)] border border-[var(--ink-1)]`; text `color: var(--ink-1)` inline-styled `fontFamily: 'var(--font-sans)'` `fontWeight: 700` `fontSize: '13px'` `letterSpacing: '0.02em'`.
- **Name**: `text-[14px] tracking-[-0.005em] text-[var(--ink-1)] font-semibold` + inline `fontFamily: 'var(--font-sans)'`.
- **Preview**: `text-[13px] leading-[1.4]` — unread: `text-[var(--ink-1)] font-medium`; read: `text-[var(--ink-2)]`. Inline `fontFamily: 'var(--font-sans)'`.
- **Timestamp** (wrapped in `<span>` so mono style reaches `RelativeTime`'s inner span which accepts only className): outer span `text-[11px] text-[var(--ink-3)]` + inline `fontFamily: 'var(--font-mono)', fontWeight: 500, letterSpacing: '0.02em'`. User icon for customer timer uses `text-[var(--ink-3)]` under v2 (loses blue tint which belongs to the slate palette).
- **Unread indicator**:
  - `1 ≤ count ≤ 9`: 8×8 dot `h-2 w-2 rounded-full bg-[var(--rubric-2)]` + `aria-label="{N} sin leer"`.
  - `count > 9`: 22×22 pill `h-[22px] min-w-[22px] rounded-full bg-[var(--ink-1)] text-[var(--paper-0)] text-[11px]` + inline `fontFamily: 'var(--font-mono)', fontWeight: 700`. Shows `"99+"` when `count > 99`.
- **Unassigned badge** + **tag overflow indicator**: both swap to `<span className="mx-tag mx-tag--ink">` under v2 (editorial pill utility from Wave 0).

When `useInboxV2() === false`:
- Item renders byte-identical to HEAD: `p-3 border-b hover:bg-muted/50`, selected `bg-muted`, avatar `bg-primary/20` + `text-primary`, name `text-sm font-medium` + `font-semibold` when unread, preview `text-sm text-muted-foreground`/`text-foreground`, original `<RelativeTime>` with blue tint for customer timer, shadcn `<Badge>` for unassigned, plain `text-xs text-muted-foreground` for overflow.

### NO-TOUCH verified (D-19, D-20)

Intact in both files:
- `useConversations`, `markAsReadLocally`, `refreshOrders`, `refresh`, `getConversationById`, `sortMode`, `setSortMode`, `getTagsForScope` (conversation-list).
- `onSelect`, `getInitials`, `getStageEmoji`, `RelativeTime`, `TagBadge` imports, `conversation.*` prop shape (conversation-item).
- Channel icons (Facebook SVG / Instagram SVG with gradient), client-badge (`showClientBadge`), Bot overlay (`agent_conversational === true`), emoji indicator on avatar (`primaryEmoji` from `getStageEmoji`) — all preserved in both v2 and !v2 branches.
- No changes to `useConversations.ts`, `filters/inbox-filters.tsx`, `filters/search-input.tsx` (these sub-components still rendered verbatim on flag-OFF path).

### Scope boundary verification

`git diff --name-only 1978da0..HEAD`:
```
src/app/(dashboard)/whatsapp/components/conversation-item.tsx
src/app/(dashboard)/whatsapp/components/conversation-list.tsx
```
Exactly the 2 files declared in `files_modified`. Zero changes to hooks, actions, types, domain, globals.css, or sibling component files.

## Verification

### Automated (grep + tsc)

**conversation-list.tsx — acceptance criteria:**
- ✅ `useInboxV2` imported + used
- ✅ `Módulo · whatsapp` (U+00B7 medium dot literal)
- ✅ `border-b border-[var(--ink-1)]` hard rule under header
- ✅ `Buscar por nombre, teléfono o etiqueta…` (U+2026 ellipsis literal)
- ✅ `data-module="whatsapp"` referenced in keydown handler via `closest()`
- ✅ `if (e.key !== '/')` present in the shortcut handler
- ✅ `La bandeja está limpia` (D-15 copy)
- ✅ `Nada coincide con los filtros activos` (D-16 copy)
- ✅ `Limpiar filtros` CTA
- ✅ `mx-rule-ornament` for D-15 `· · ·`
- ✅ `useConversations`, `markAsReadLocally`, `onSelect` — all still present
- ✅ No `oklch(` hardcoded
- ✅ `npx tsc --noEmit` clean (0 errors in file; full project typecheck clean, exit 0)

**conversation-item.tsx — acceptance criteria:**
- ✅ `useInboxV2` imported + used
- ✅ `border-l-[3px] border-l-[var(--rubric-2)]` selected rail
- ✅ `pl-[13px]` compensation (UI-SPEC §5.1 critical exception)
- ✅ `bg-[var(--paper-0)]` for selected bg
- ✅ `bg-[var(--paper-3)]` for avatar bg
- ✅ `border border-[var(--ink-1)]` avatar border
- ✅ `h-2 w-2 rounded-full bg-[var(--rubric-2)]` unread dot (≤9)
- ✅ `h-[22px] min-w-[22px]` unread pill (>9)
- ✅ `role="listitem"`, `aria-selected` (universal a11y)
- ✅ `var(--font-mono)` timestamp family
- ✅ `onSelect`, `getInitials`, `RelativeTime`, `TagBadge` — all still present
- ✅ No `oklch(` hardcoded
- ✅ `npx tsc --noEmit` clean (0 errors in file; full project typecheck clean, exit 0)

### Full project typecheck

`npx tsc --noEmit` — exit code 0, 0 errors anywhere in the project.

## Manual smoke (requires browser + flag ON)

Pending orchestrator-level QA in Wave 5. The plan's `<verification>` block lists:
1. Eyebrow "Módulo · whatsapp" visible above h1.
2. 4 tabs underlined; active ink-1, inactive ink-3.
3. Search input paper-0 bg with lucide icon at left-22px.
4. `/` focuses search when focus is in module but not in input/textarea.
5. `/` types literal when focus is in composer textarea (Wave 2's territory — still flag-OFF for composer, but the focus-scope guard is agnostic to other modules' state).
6. Selected item shows rubric-2 rail without horizontal shift.
7. Unread counts render as dot (≤9), pill (>9), '99+' (>99).
8. Timestamp uses JetBrains Mono (visible via DevTools).
9. Avatar paper-3 + ink-1 border.
10. D-15 and D-16 empty states render correctly.
11. Flag-OFF: visual diff vs main shows zero change.

## Deviations from Plan

### Automatic adjustments (Rule 1-3)

**1. [Rule 1 — Bug] Tab values mapped to existing ConversationFilter union (not introduced as new state)**
- **Found during:** Task 1
- **Issue:** Plan's tab template used values `'active'|'unassigned'|'mine'|'closed'` but the existing `ConversationFilter` union in `@/hooks/use-conversations` is `'all'|'unread'|'mine'|'unassigned'|'unanswered'|'archived'`. Introducing the plan's literal values would either (a) require patching the hook (violates D-19 no-touch), or (b) send unrecognized values to `setFilter` (TypeScript error + runtime filter-miss).
- **Fix:** Mapped editorial labels to existing union: `'Todas' → 'all'`, `'Sin asignar' → 'unassigned'`, `'Mías' → 'mine'`, `'Cerradas' → 'archived'`. Declared `editorialTabs: Array<{ value: ConversationFilter; label: string }>` inside the component. Imported `ConversationFilter` type from the hook module.
- **Rationale:** The plan's `must_haves.truths` explicitly calls the tab labels `'Todas' / 'Sin asignar' / 'Mías' / 'Cerradas'` — the mapping preserves the user-visible labels while respecting D-19 (zero hook mutation).
- **Files modified:** `conversation-list.tsx`.
- **Commit:** `dee0521`.

**2. [Rule 3 — Blocker] `<RelativeTime>` does not accept a `style` prop**
- **Found during:** Task 2 (before commit, caught by reading the component source pre-emptively).
- **Issue:** Plan's Step 4 template passes `style={v2 ? { fontFamily: 'var(--font-mono)', ... } : undefined}` directly to `<RelativeTime>`. But `RelativeTimeProps` only declares `date`, `className`, `refreshInterval` — no `style`. TypeScript would have rejected the build.
- **Fix:** Wrapped `<RelativeTime>` inside an outer `<span>` that carries the v2 mono style, and passed only the existing `className` prop to `<RelativeTime>`. The inner `<span suppressHydrationWarning>` inside `RelativeTime` inherits the font-family/weight/letter-spacing from the outer span via CSS inheritance.
- **Files modified:** `conversation-item.tsx`.
- **Commit:** `d782624`.

**3. [Design clarification] Name weight under v2 is `font-semibold` regardless of `hasUnread`**
- **Found during:** Task 2 template review.
- **Issue:** Plan's Step 4 shows `font-semibold` in the v2 name branch without a ternary on `hasUnread`. UI-SPEC §7.1 specifies `.nm: font-sans 600 14px` for the item name — no "bumped weight when unread" rule. The unread state is instead communicated via the preview text weight (`font-medium` + `color: ink-1` when unread) plus the unread dot/pill.
- **Decision:** Kept both hasUnread branches at `font-semibold` under v2 (matches UI-SPEC). A subtle design intent: the editorial spec communicates unread via color contrast (preview goes from ink-2 to ink-1) + rubric-2 dot, not name-weight bump. Legacy flag-OFF path retains the name-weight bump (`text-sm font-medium` → `font-semibold`) per current behavior.
- **Files modified:** `conversation-item.tsx`.
- **Commit:** `d782624`.

**4. [Scope preservation] Kept the secondary filter row (sort-mode, agent-filter, tag-filter) under v2**
- **Found during:** Task 1.
- **Issue:** Plan's template reshapes the header to just `{eyebrow + h1 + tabs + search}`. But the existing list has three additional filter controls (sort-mode `UserRoundSearch`, agent-filter `Bot`, tag-filter `Tag` popover) that are essential functionality — removing them would lose features on flag-ON.
- **Decision:** Added a dedicated secondary row (px-4 py-2, border-bottom `var(--border)`) that preserves all three buttons with their existing variant/size shadcn styles. This does NOT conflict with the editorial aesthetic — the row sits below the search input with a standard rule, forming a fourth register (eyebrow | h1 | tabs | search | filters) that still reads as editorial.
- **Files modified:** `conversation-list.tsx`.
- **Commit:** `dee0521`.

None of these rose to Rule 4 (architectural) — all are tactical code-shape fixes that preserve the plan's intent.

## State-name discoveries

- The existing search state in the hook is `query` (setter `setQuery`) — not `searchQuery` / `setSearchQuery` as the plan hinted. Wire-up uses the real names.
- The existing filter state is `filter` / `setFilter` (matches the plan's hint).
- `hasQuery` is exposed by the hook as a derived boolean (useful for D-16 `isFiltered` detection).
- The "unread" notion inside the hook filter is `'unread'` (filter tab) — distinct from `conversation.is_read` (per-item flag). The plan's `hasUnread = !conversation.is_read` logic for item-level unread is correct; kept intact.

## Threat Flags

None. This re-skin introduces no new network endpoints, auth paths, file access, or schema changes. Purely cosmetic/markup changes gated by an existing feature flag. No new trust boundaries.

## Known Stubs

None. All rendered paths (header, tabs, search, empty states, skeleton, item states) are wired to existing data sources (`filter`, `query`, `filteredConversations`, `conversation.unread_count`, etc.). No hardcoded mock data or TODO placeholders that would ship to users.

## Handoff to Wave 2

- ✅ **List panel** is editorial when flag ON. Eyebrow + h1 + tabs + search + item skin + empty states all complete.
- ⏭ **Wave 2 (Plan 03)** takes over `chat-view.tsx` and `message-*` components (chat thread + composer + message bubbles). Running in parallel worktree — disjoint files.
- ⏭ **Wave 2 (Plan 04)** takes over `chat-header.tsx`, `contact-panel.tsx`, `assign-dropdown.tsx`. Running in parallel worktree — disjoint files.
- ⚠️ Transitional state when flag ON + only Plan 02 merged: list looks editorial; thread and contact panel still look slate-on-paper. Acceptable intermediate (never shipped to prod this way — Wave 5 QA gates the full re-skin before flag flip).

## Self-Check: PASSED

- ✅ `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` exists (modified)
- ✅ `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` exists (modified)
- ✅ Commit `dee0521` exists in git log
- ✅ Commit `d782624` exists in git log
- ✅ Full project typecheck clean (exit 0)
- ✅ Scope boundary verified: `git diff --name-only 1978da0..HEAD` shows only the 2 in-scope files
- ✅ All 11 conversation-list grep assertions pass
- ✅ All 15 conversation-item grep assertions pass
- ✅ No `oklch(` hardcoded in either file
- ✅ D-19 NO-TOUCH guards intact (hook usage, callbacks, imports, prop shape all verified by grep)
