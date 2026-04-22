---
phase: ui-redesign-conversaciones
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
autonomous: true
requirements:
  - D-04
  - D-05
  - D-07
  - D-13
  - D-15
  - D-16
  - D-19
  - D-22
  - D-23
  - D-24

must_haves:
  truths:
    - "Cuando `useInboxV2()===true`, `conversation-list.tsx` renderiza un header editorial con: eyebrow `mx-smallcaps` color `var(--rubric-2)` texto `'Módulo · whatsapp'` (con medium-dot U+00B7), h1 `mx-display`-style 26px serif (text-[26px]) texto `'Conversaciones'`, tabs subrayadas (4 tabs: 'Todas' / 'Sin asignar' / 'Mías' / 'Cerradas'), y search input con border editorial + ícono Search lucide left-positioned + placeholder `'Buscar por nombre, teléfono o etiqueta…'` (UI-SPEC §7.2, §7.3)"
    - "Cuando `useInboxV2()===false`, el header actual de `conversation-list.tsx` (h2 'Conversaciones' + InboxFilters + Sort/Agent/Tag buttons) se preserva byte-identical"
    - "Tab activa muestra `border-bottom: 2px solid var(--ink-1)` + `font-weight: 600` + color ink-1; tabs inactivas color ink-3 (UI-SPEC §7.2)"
    - "Search input cuando v2: bg `var(--paper-0)`, border `var(--border)`, padding `8px 12px 8px 28px` (28px left para acomodar ícono — UI-SPEC §5.1 excepción justificada), border-radius `var(--radius-3)`, font-sans 13px text ink-1, ícono Search lucide 14x14 absolute left-22px color ink-3"
    - "Keyboard shortcut `/` enfoca el search input cuando focus esta dentro de `[data-module=\"whatsapp\"]` y NO esta en input/textarea/contenteditable; verificado que GlobalSearch usa Cmd+K (no conflict con `/`) — D-23"
    - "`conversation-item.tsx` cuando `useInboxV2()===true`: avatar 40x40 circle bg `var(--paper-3)` + border 1px `var(--ink-1)` + font-sans 700 13px color ink-1 letter-spacing 0.02em (UI-SPEC §7.1)"
    - "Estado seleccionado del item cuando v2: `bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] pl-[13px]` (los 13px compensan el border-left de 3px — UI-SPEC §5.1 excepción CRITICA)"
    - "Cuando v2 + unread_count entre 1 y 9: render dot 8x8 (h-2 w-2) rounded-full bg `var(--rubric-2)` con aria-label `'{N} sin leer'`; cuando unread_count > 9: pill h-[22px] min-w-[22px] rounded-full bg ink-1 text paper-0 font-mono 700 11px (mostrar '99+' si > 99)"
    - "Cuando v2: timestamp del item usa `mx-mono text-[var(--ink-3)] text-[11px]`; nombre usa font-sans 600 14px color ink-1 letter-spacing -0.005em; preview usa font-sans 400 13px color ink-2 (color ink-1 + font-weight 500 cuando unread)"
    - "Tags overflow del item siguen renderizando via TagBadge actual (out-of-scope) PERO el contador overflow `+N` se renderiza con className `mx-tag mx-tag--ink` cuando v2"
    - "Aria attributes: container del item tiene `role='listitem'` + `aria-selected={isSelected}` + `aria-current={isSelected || undefined}` (UI-SPEC §12.2 belt-and-suspenders)"
    - "Cuando v2 + empty bandeja (D-15): `conversation-list.tsx` renderiza `mx-h3 'La bandeja está limpia.'` + `mx-caption 'Cuando llegue un mensaje nuevo aparecerá aquí.'` + `mx-rule-ornament '· · ·'` (UI-SPEC §9.1)"
    - "Cuando v2 + empty filter (D-16): `conversation-list.tsx` renderiza `mx-h4 'Nada coincide con los filtros activos.'` + botón `'Limpiar filtros'` estilo link con borde inferior 1px que resetea `filter` + `searchQuery`"
    - "Cero cambios funcionales en `useConversations`, `getTagsForScope`, `refresh`, `refreshOrders`, `markAsReadLocally`, `setSortMode`, `onSelect`, `RelativeTime`, `getStageEmoji`, `getInitials`, channel icons (D-19, D-20)"
    - "Build pasa: `npx tsc --noEmit` clean en ambos archivos; con flag OFF git diff de la rama main muestra cambios SOLO en estos 2 archivos in-scope, no en hooks/actions/types"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "List header editorial + tabs underlined + search '/' shortcut + empty bandeja (D-15) + empty filter (D-16)"
      contains: "useInboxV2"
    - path: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      provides: "Item editorial: avatar paper-3, selected rail rubric-2, unread dot, mx-mono timestamp"
      contains: "border-l-[3px] border-l-[var(--rubric-2)]"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 hook"
      pattern: "useInboxV2()"
    - from: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 hook"
      pattern: "useInboxV2()"
    - from: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      via: "data-module attribute closest() check for / shortcut"
      pattern: "[data-module=\"whatsapp\"]"
---

<objective>
Wave 1 — Re-skin the list panel: header (eyebrow + display title + underlined tabs + editorial search) and item card (avatar, selected rail, unread dot, mx-mono timestamp). All gated by `useInboxV2()` (NEW JSX) or by CSS cascade (className-only swaps). Also covers empty-bandeja (D-15) and empty-filter (D-16) states for the list panel.

**Purpose:** Convert the leftmost column into the editorial paper aesthetic. This is the most visible change for users — when they enable the flag, the first thing they see is the redesigned list. After this plan, the list looks editorial; the chat thread (Wave 2) and contact panel (Wave 3) still look slate-on-paper because their components haven't been re-skinned yet (acceptable transitional state — never merged this way; Wave 5 QA gates the full re-skin).

**Output:** Two re-skinned components. Header eyebrow + h1 + tabs + search render only when flag is ON. Item shows editorial styling (selected rail, unread dot, mono timestamp) only when flag is ON. Keyboard `/` works when focus is inside `[data-module="whatsapp"]`. Empty-bandeja + empty-filter states render editorial when flag is ON.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-conversaciones/CONTEXT.md
@.planning/standalone/ui-redesign-conversaciones/RESEARCH.md
@.planning/standalone/ui-redesign-conversaciones/UI-SPEC.md
@.planning/standalone/ui-redesign-conversaciones/PATTERNS.md
@.planning/standalone/ui-redesign-conversaciones/01-PLAN.md

# Source files in scope:
@src/app/(dashboard)/whatsapp/components/conversation-list.tsx
@src/app/(dashboard)/whatsapp/components/conversation-item.tsx

# Wave 0 outputs (already shipped):
@src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
@src/app/(dashboard)/whatsapp/components/icon-button.tsx
@src/app/(dashboard)/whatsapp/components/mx-tag.tsx

<interfaces>
<!-- From Wave 0 — already shipped: -->

useInboxV2 hook:
```typescript
import { useInboxV2 } from './inbox-v2-context'
const v2 = useInboxV2()  // boolean, default false outside provider
```

`<MxTag>` component:
```typescript
<MxTag variant="rubric|gold|indigo|verdigris|ink" icon={LucideIcon}>{children}</MxTag>
```

`<IconButton>` component (for ibtn):
```typescript
<IconButton aria-label="..." onClick={...} pressed?={boolean}>
  <Search className="h-[14px] w-[14px]" />
</IconButton>
```

`.theme-editorial` CSS scope (already in globals.css) provides:
- `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament` utilities
- `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}` utilities
- All shadcn token overrides (--background → paper-1, --primary → ink-1, etc.)

Existing `conversation-list.tsx` interface (preserve):
```typescript
interface ConversationListProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  selectedId?: string | null
  onSelect: (id: string) => void
  onSelectedUpdated: (...) => void
  onRefreshOrdersReady: (refresh: () => Promise<void>) => void
  clientConfig?: ClientActivationConfig | null
}
```

Existing `conversation-item.tsx` interface (preserve):
```typescript
interface ConversationItemProps {
  conversation: ConversationWithDetails
  isSelected: boolean
  onSelect: (id: string) => void
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin conversation-list.tsx — editorial header + tabs + search + '/' keyboard + empty states (D-15, D-16)</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-list.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx (full 302 LOC — pay attention to header at lines 132–157, filters/tabs at lines 158–233, empty/loading states at lines 237–263)
    - src/components/search/global-search.tsx (verify uses Cmd+K not / — already grep-confirmed in RESEARCH but re-check)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.2 (header), §7.3 (search), §7.7 (ibtn), §9.1 (empty states D-15, D-16), §10.1 (keyboard)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `### Example 6 — Scoped / keyboard shortcut` lines 1028–1059
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 10. conversation-list.tsx` lines 535–599
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/conversation-list.tsx`. Add `useInboxV2` import and a `searchInputRef`. Branch the rendering of the header block on `v2`.

    **Step 1 — Add imports at the top of the file:**
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    import { Search as SearchIcon } from 'lucide-react'
    // (cn already imported; if not, add: import { cn } from '@/lib/utils')
    ```

    **Step 2 — Inside the component body, near the existing useState declarations, add:**
    ```typescript
    const v2 = useInboxV2()
    const searchInputRef = useRef<HTMLInputElement>(null)
    ```
    (Verify `useRef` is imported from 'react'; if not, add it.)

    **Step 3 — Add a `useEffect` for the `/` keyboard shortcut (D-23). It must be SCOPED to `[data-module="whatsapp"]` (set by InboxLayout in Wave 0 Plan 01) and NOT fire when focus is in an input/textarea/contenteditable element. Only registers when `v2` is true (no-op outside scope):**

    ```typescript
    useEffect(() => {
      if (!v2) return
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key !== '/') return
        const target = e.target as HTMLElement | null
        if (!target) return
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
        // Scope guard: only fire when focus is inside the /whatsapp module
        if (!target.closest('[data-module="whatsapp"]')) return
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [v2])
    ```

    **Step 4 — Branch the header rendering.** Identify the existing header block (currently the `<div className="px-3 py-2 border-b ...">` containing h2 'Conversaciones' + filter buttons + the InboxFilters component). Wrap it in a `{v2 ? <EditorialHeader /> : <CurrentHeader />}` ternary, OR use two separate JSX blocks gated with `{!v2 && (...)}` and `{v2 && (...)}` to keep the diff minimal and avoid extracting subcomponents.

    The editorial block (rendered when `v2 === true`) MUST contain:

    ```tsx
    {v2 && (
      <>
        {/* Editorial header: eyebrow + h1 + tabs */}
        <div className="px-4 pt-4 pb-2 border-b border-[var(--ink-1)]">
          <span className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
            Módulo · whatsapp
          </span>
          <h1 className="mt-1 mb-2 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Conversaciones
          </h1>
          {/* Tabs — underline-only style, replace shadcn Tabs (RESEARCH primitive map: bypass Tabs) */}
          <div className="flex gap-4 mt-2" role="tablist">
            {(['active','unassigned','mine','closed'] as const).map((value) => {
              const labels = { active: 'Todas', unassigned: 'Sin asignar', mine: 'Mías', closed: 'Cerradas' }
              const isActive = filter === value  // wire to existing `filter` state used by InboxFilters
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'pb-1 text-[13px] transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-1)]',
                    isActive
                      ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                      : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
                  )}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {labels[value]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Editorial search */}
        <div className="px-4 py-2 border-b border-[var(--border)] relative">
          <SearchIcon className="absolute left-[22px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[var(--ink-3)] pointer-events-none" aria-hidden />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery /* wire to existing search state */}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o etiqueta…"
            className="w-full bg-[var(--paper-0)] border border-[var(--border)] rounded-[4px] py-2 pr-3 pl-7 text-[13px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)', paddingLeft: '28px' }}
            aria-label="Buscar conversaciones"
          />
        </div>
      </>
    )}
    ```

    **CRITICAL — wire to existing state:** the `filter` state and `setFilter` setter, and `searchQuery` state and `setSearchQuery` setter, ALREADY EXIST in this component (currently consumed by `<InboxFilters>` and `<SearchInput>` sub-components). DO NOT create new state. Use whatever variable names the existing code uses (read the file first; common names are `filter`, `setFilter`, `searchQuery`/`setSearchQuery` or `query`/`setQuery`). If the filter values differ from `'active'|'unassigned'|'mine'|'closed'`, map them to the editorial labels accordingly while keeping the underlying state values intact.

    **Step 5 — Hide the OLD header when v2:** wrap the existing `<div className="px-3 py-2 border-b ...">` (and the legacy SearchInput / InboxFilters block) with `{!v2 && (...)}`. The InboxFilters component is internally tabs already (per PATTERNS.md) — when v2 we replace it with the inline tabs above; when !v2 we preserve current behavior.

    **Step 6 — Re-skin empty/loading/empty-filter states for v2 (UI-SPEC §9.1, D-15 + D-16):**

    For loading state when v2: replace the current `<Loader2>` spinner with 6 skeleton items styled `bg-[var(--paper-2)] border border-[var(--border)] h-[72px] animate-[mx-pulse_1.5s_ease-in-out_infinite]` (the `@keyframes mx-pulse` already exists in globals.css from Wave 0 — reference it via the inline animation string). **Note:** the polished skeleton version with `mx-skeleton` utility (D-14) is implemented in Plan 05; this Plan 02 provides an interim minimal skeleton to cover D-14 early for the list.

    For empty bandeja (D-15) when v2 — MUST render:
    ```tsx
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
      <p className="mx-h3">La bandeja está limpia.</p>
      <p className="mx-caption">Cuando llegue un mensaje nuevo aparecerá aquí.</p>
      <p className="mx-rule-ornament">· · ·</p>
    </div>
    ```

    For empty filter (D-16) when v2 — MUST render:
    ```tsx
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-2">
      <p className="mx-h4">Nada coincide con los filtros activos.</p>
      <button
        type="button"
        onClick={() => { setFilter('active'); setSearchQuery('') }}
        className="text-[13px] font-medium text-[var(--ink-2)] border-b border-[var(--ink-2)] hover:text-[var(--rubric-2)] hover:border-[var(--rubric-2)] transition-colors"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        Limpiar filtros
      </button>
    </div>
    ```

    Both gated with `{v2 && ...}` AND the existing empty/loading conditions; preserve the current versions for `!v2`.

    The detection logic for empty-bandeja vs empty-filter: if `conversations.length === 0` AND (`filter` is non-default OR `searchQuery` is non-empty) → render D-16; if `conversations.length === 0` AND filter/search are at defaults → render D-15.

    **DO NOT MODIFY (D-19):**
    - `useConversations()` hook usage and any of its returns
    - `getTagsForScope`, `refresh`, `refreshOrders`, `markAsReadLocally`, `setSortMode`
    - `<ConversationItem>` component usage / props passed to it
    - `onSelect`, `onSelectedUpdated`, `onRefreshOrdersReady` callbacks
    - Realtime side-effects, useEffect hooks for subscriptions
    - The InboxFilters / SearchInput sub-components themselves (only their callsite when v2)
    - The order of items, sorting logic, stage emoji logic
    - Tag filter popover logic (just CSS-cascade re-skin via .theme-editorial when active)
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "data-module=\"whatsapp\"" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "Módulo · whatsapp" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "Buscar por nombre, teléfono o etiqueta" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "Limpiar filtros" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "La bandeja está limpia" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "Nada coincide con los filtros activos" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "useConversations" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && npx tsc --noEmit 2>&1 | grep "conversation-list" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (hook imported and used).
    - `grep -q "Módulo · whatsapp" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (eyebrow text — uses U+00B7 medium dot, NOT a normal period).
    - `grep -q "border-b border-\[var(--ink-1)\]" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (header bottom border uses ink-1 hard rule per UI-SPEC §7.2).
    - `grep -q "Buscar por nombre, teléfono o etiqueta…" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (search placeholder — uses U+2026 ellipsis, NOT three dots).
    - `grep -q "data-module=\"whatsapp\"" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (the `closest` check in the keydown handler).
    - `grep -q "if (e.key !== '/')" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (the slash shortcut).
    - `grep -q "La bandeja está limpia" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (empty bandeja copy D-15 per UI-SPEC §9.1).
    - `grep -q "Nada coincide con los filtros activos" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (empty filter copy D-16).
    - `grep -q "Limpiar filtros" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx`.
    - `grep -q "mx-rule-ornament" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (decorative · · · separator).
    - The file STILL contains: `useConversations`, `markAsReadLocally`, `onSelect`, `onSelectedUpdated`, `getTagsForScope` (or whatever similar API names exist) — verify with grep that all D-19 hooks/callbacks remain.
    - `! grep "oklch(" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (no hardcoded OKLCH — must use `var(--*)`).
    - `npx tsc --noEmit` reports zero errors in `conversation-list.tsx`.
    - Manual: when `useInboxV2()===false`, `git diff` shows the rendered DOM is byte-identical to current via the `{!v2 && (oldHeader)}` gate.
  </acceptance_criteria>
  <done>List header is editorial when flag ON: eyebrow + display title + 4 underlined tabs + paper search input with `/` shortcut. Empty/loading states match UI-SPEC §9.1 (D-15 + D-16 covered). When flag OFF, current UI is preserved exactly. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin conversation-item.tsx — editorial item card (avatar paper-3, selected rail rubric-2, unread dot, mono timestamp)</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-item.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx (full 190 LOC — pay attention to button at line 66, avatar at lines 77–101, name at lines 116+, preview, timestamp at lines 134+, unread badge at lines 136–140, tags at lines 177–186)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.1 (item full layout)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 11. conversation-item.tsx` lines 603–637
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` with FOUR additive className changes, all gated by `useInboxV2()`:

    **Step 1 — Add `useInboxV2` import + call hook at top of component:**
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    // ... inside component:
    const v2 = useInboxV2()
    ```

    **Step 2 — Re-skin the root `<button>` (currently around line 66) selected/hover state.** The current line is:
    ```tsx
    className={cn(
      'w-full text-left p-3 border-b transition-colors hover:bg-muted/50',
      isSelected && 'bg-muted'
    )}
    ```
    Change to:
    ```tsx
    role="listitem"
    aria-selected={isSelected}
    aria-current={isSelected || undefined}
    className={cn(
      'w-full text-left transition-colors',
      v2
        ? cn(
            'border-b border-[var(--border)] hover:bg-[var(--paper-2)]',
            isSelected
              ? 'bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] py-3 pr-4 pl-[13px]'
              : 'p-3'
          )
        : cn(
            'p-3 border-b hover:bg-muted/50',
            isSelected && 'bg-muted'
          )
    )}
    ```

    **CRITICAL — UI-SPEC §5.1 excepción:** when v2 + selected, padding-left is exactly `13px` (NOT 12px, NOT 16px) to compensate for the `border-l-[3px]` so the content does not shift horizontally vs unselected items. The math is `16 - 3 = 13`.

    **Step 3 — Re-skin the avatar (currently at lines 77–101).** Find the avatar `<div>` (it likely uses classes like `bg-primary/20`, `text-primary`, `rounded-full`, `w-10 h-10`). Wrap its className in `cn(..., v2 && '...')` to override:

    ```tsx
    <div
      className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0',
        v2
          ? 'bg-[var(--paper-3)] border border-[var(--ink-1)] text-[var(--ink-1)] tracking-[0.02em]'
          : 'bg-primary/20 text-primary'  // current classes — preserve verbatim
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '13px' } : undefined}
    >
      {getInitials(displayName)}
    </div>
    ```

    Per UI-SPEC §7.1 the avatar font size is 13px (not 14), weight 700, letter-spacing 0.02em — distinct from the name (also sans 600 14px). The existing analog uses default theme fonts; under v2, force the editorial values explicitly.

    **Step 4 — Re-skin the name + preview text + timestamp (currently in the `.top` / `.nm` / `.pv` / `.tm` block).** The name typically renders as `<p className="font-medium">{displayName}</p>` and the timestamp as `<span className="text-xs text-muted-foreground">`. Wrap in conditionals:

    ```tsx
    {/* Name */}
    <p
      className={cn(
        'truncate',
        v2
          ? cn(
              'text-[14px] tracking-[-0.005em] text-[var(--ink-1)]',
              'font-semibold'
            )
          : 'font-medium'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {displayName}
    </p>
    ```

    ```tsx
    {/* Preview */}
    <p
      className={cn(
        'truncate',
        v2
          ? cn(
              'text-[13px] leading-[1.4]',
              hasUnread ? 'text-[var(--ink-1)] font-medium' : 'text-[var(--ink-2)]'
            )
          : 'text-sm text-muted-foreground'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {previewText}
    </p>
    ```

    ```tsx
    {/* Timestamp */}
    <span
      className={cn(
        v2
          ? 'text-[11px] text-[var(--ink-3)] ml-auto'
          : 'text-xs text-muted-foreground ml-auto'
      )}
      style={v2 ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : undefined}
    >
      <RelativeTime timestamp={...} />
    </span>
    ```

    Use whatever variable names the existing code uses (`displayName`, `previewText`, `hasUnread` etc.). Read the file first to identify them.

    **Step 5 — Replace the unread badge (currently around lines 136–140).** The current pill renders the count via shadcn Badge. Per UI-SPEC §7.1: when v2 + 1 ≤ count ≤ 9, render an 8x8 dot bg rubric-2; when v2 + count > 9, render a circular pill bg ink-1 text paper-0 mono 700:

    ```tsx
    {/* Unread indicator */}
    {conversation.unread_count > 0 && (
      v2 ? (
        conversation.unread_count <= 9 ? (
          <span
            className="h-2 w-2 rounded-full bg-[var(--rubric-2)] flex-shrink-0"
            aria-label={`${conversation.unread_count} sin leer`}
          />
        ) : (
          <span
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--ink-1)] px-1.5 text-[11px] text-[var(--paper-0)]"
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
            aria-label={`${conversation.unread_count} sin leer`}
          >
            {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
          </span>
        )
      ) : (
        // Preserve existing shadcn Badge / pill exactly
        <Badge variant="default" className="...current classes...">
          {conversation.unread_count}
        </Badge>
      )
    )}
    ```

    Replace the existing badge JSX inline; preserve the `!v2` branch byte-identical to current code.

    **Step 6 — Tag overflow indicator.** The tag pills themselves (`<TagBadge>`) are out-of-scope (shared component used in CRM). However, the overflow indicator `+N` (currently around line 184 if present) should swap to an editorial pill when v2:

    ```tsx
    {tagOverflowCount > 0 && (
      v2 ? (
        <span className="mx-tag mx-tag--ink">+{tagOverflowCount}</span>
      ) : (
        // current overflow span/badge — preserve verbatim
      )
    )}
    ```

    **DO NOT MODIFY (D-19, D-20):**
    - `onSelect` callback
    - `markAsReadLocally`, `getStageEmoji`, `getInitials`, `RelativeTime` imports/usages
    - Channel icons (FB/IG SVGs)
    - `<TagBadge>` import / usage for individual tags
    - `conversation` prop shape
    - Any side-effects / hooks (none should exist in this presentational component)
    - Border-bottom of the item (always present, just re-styled)

    Add `role="listitem"` + `aria-selected={isSelected}` + `aria-current={isSelected || undefined}` UNCONDITIONALLY (improves a11y for ALL users — D-24 universal a11y; UI-SPEC §12.2). These attributes are zero-impact for sighted users and add value for screen readers regardless of flag state.
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "border-l-\[3px\] border-l-\[var(--rubric-2)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "pl-\[13px\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "bg-\[var(--paper-3)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "bg-\[var(--rubric-2)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "role=\"listitem\"" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "aria-selected" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && npx tsc --noEmit 2>&1 | grep "conversation-item" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx`.
    - `grep -q "border-l-\[3px\] border-l-\[var(--rubric-2)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (selected rail per UI-SPEC §7.1).
    - `grep -q "pl-\[13px\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (CRITICAL UI-SPEC §5.1 excepción — compensates 3px border).
    - `grep -q "bg-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (selected bg).
    - `grep -q "bg-\[var(--paper-3)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (avatar bg).
    - `grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (avatar border).
    - `grep -q "h-2 w-2 rounded-full bg-\[var(--rubric-2)\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (unread dot ≤ 9).
    - `grep -q "h-\[22px\] min-w-\[22px\]" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (unread pill > 9).
    - `grep -q "role=\"listitem\"" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx`.
    - `grep -q "aria-selected" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx`.
    - `grep -q "var(--font-mono)" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (timestamp uses mono per UI-SPEC §7.1).
    - The file STILL contains: `onSelect`, `markAsReadLocally`, `getInitials`, `RelativeTime`, `TagBadge` (verify with grep — Regla 6 NO-TOUCH guards).
    - `! grep "oklch(" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (no hardcoded OKLCH).
    - `npx tsc --noEmit` reports zero errors in `conversation-item.tsx`.
  </acceptance_criteria>
  <done>Item card is editorial when flag ON: avatar paper-3 with ink-1 border, selected state has rubric-2 left rail with 13px padding compensation, unread dot or pill per count threshold, mono timestamp. When flag OFF, item renders byte-identical to today. ARIA attributes universally applied. Build clean.</done>
</task>

</tasks>

<verification>
After both tasks:

1. `npx tsc --noEmit 2>&1 | grep -E "conversation-list|conversation-item" | (! grep -E "error|Error")` returns 0.
2. Manual smoke (with flag enabled in dev DB):
   - Eyebrow "Módulo · whatsapp" visible above the h1 "Conversaciones" (display font).
   - 4 tabs render with active = ink-1 underline; inactive = ink-3 no underline.
   - Search input has paper-0 bg, border-color border, lucide Search icon at left-22px.
   - Press `/` while focus is anywhere in the inbox (but not in another input) — search input gets focus.
   - Press `/` while focus is in the composer textarea (Wave 2's territory) — `/` types as a literal character (not hijacked).
   - Selected item shows rubric-2 left rail; content does NOT shift horizontally compared to unselected items.
   - Unread items show 8x8 dot for counts ≤ 9, circular pill for >9, '99+' for >99.
   - Timestamp uses JetBrains Mono (visible via DevTools computed style).
   - Avatar uses paper-3 bg + ink-1 border.
   - Empty bandeja (D-15): message renders with mx-h3 + mx-caption + mx-rule-ornament.
   - Empty filter (D-16): message renders with mx-h4 + "Limpiar filtros" link button that resets filter + searchQuery.
3. With flag OFF: visual diff vs current main shows ZERO change. Tabs, header, items render identically.
4. Git diff for files outside scope (hooks, actions, types, useConversations.ts, markAsRead, getConversation): zero changes (Regla 6 verifiable).
5. axe-core scan on `/whatsapp` (flag ON): no NEW serious/critical violations introduced (baseline diff).
</verification>

<success_criteria>
- Both tasks pass automated verify.
- Build is clean.
- With flag ON, list panel matches UI-SPEC §7.1 (item) + §7.2 (header) + §7.3 (search) + §9.1 (D-15 empty bandeja + D-16 empty filter).
- With flag OFF, list panel is byte-identical to current.
- `/` keyboard works only inside `[data-module="whatsapp"]` and not when focus is in inputs.
- All D-19 NO-TOUCH targets verifiable unchanged via git diff.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-conversaciones/02-SUMMARY.md` with:
- Commits (one per task)
- Pixel-diff vs mock for the list column (link to screenshots if produced)
- Confirmation of `/` shortcut scope (flag ON inside module focuses input; flag OFF or outside module = no-op)
- Confirmation of D-15 + D-16 empty-state copy rendering correctly
- Note any state-name discoveries (e.g., if `searchQuery` was actually `query` in the existing code) and any small deviations
- Handoff to Wave 2: list re-skin done; chat thread + composer come next.
</output>
</output>
