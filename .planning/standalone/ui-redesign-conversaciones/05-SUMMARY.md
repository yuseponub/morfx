---
phase: ui-redesign-conversaciones
plan: 05
subsystem: /whatsapp module — polish states + a11y + portal sweep (Wave 2)
tags:
  - ui
  - re-skin
  - editorial-design
  - a11y
  - keyboard-shortcuts
  - aria-roles
  - portal-sweep
  - feature-flag
  - regla-6
  - wave-2

dependency_graph:
  requires:
    - .planning/standalone/ui-redesign-conversaciones/01-PLAN.md (Wave 0 — .mx-skeleton utility + mx-pulse keyframes + prefers-reduced-motion)
    - .planning/standalone/ui-redesign-conversaciones/02-PLAN.md (Wave 1 — conversation-list v2 branch + '/' shortcut scoping pattern)
    - .planning/standalone/ui-redesign-conversaciones/03-PLAN.md (Wave 1 — chat-view v2 branch + mx-h4/mx-caption empty state)
    - .planning/standalone/ui-redesign-conversaciones/04-PLAN.md (Wave 1 — chat-header themeContainerRef + dropdown-menu.tsx portalContainer extension pattern)
    - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx (useInboxV2 hook — Plan 01)
    - src/app/globals.css (.theme-editorial scope with .mx-skeleton + prefers-reduced-motion — Plan 01)
  provides:
    - Editorial loading skeletons (6 list items + 3 thread bubbles) — D-14 fully coverage
    - Keyboard shortcuts '[' / ']' (conversation navigation) + 'Esc' (drawer close <1280px) — D-23
    - Universal ARIA roles (role=list, role=log, aria-live=polite) — UI-SPEC §12.2 + D-24
    - Radix Popover portal re-rooting capability (portalContainer prop on shadcn wrapper)
    - Portal sweep across 8 in-scope editorial components (re-rooted 3 Popovers in v2 scope; documented 2 intentional-slate exclusions)
    - DEFERRED-D18.md artifact with un-defer plumbing checklist for snoozed state
  affects:
    - /whatsapp loading UX (editorial skeletons when v2, Loader2/spinner when !v2)
    - /whatsapp keyboard UX (scoped '['/']'/'Esc' shortcuts only inside data-module=whatsapp + only when v2)
    - /whatsapp assistive tech UX (screen readers announce list + thread structure + new messages via aria-live polite)
    - Radix Popover portal default body portal preserved byte-identical when portalContainer omitted (all existing callsites unaffected)

tech_stack:
  added: []
  patterns:
    - Loading skeletons via reusable .mx-skeleton utility (paper-2 bg + border + mx-pulse animation — auto-disabled by prefers-reduced-motion)
    - Scoped keyboard shortcuts using target.closest('[data-module="whatsapp"]') + input/textarea/contenteditable guard (mirrors '/' handler from Plan 02)
    - TDZ-safe useEffect placement AFTER useMemo dependency declarations
    - Universal ARIA roles applied unconditionally (flag-agnostic — D-24 semantics)
    - Optional portalContainer prop on shadcn Popover wrapper (aditive; default body portal = byte-identical for existing consumers; mirrors dropdown-menu.tsx extension from Plan 04)
    - themeContainerRef lazy-resolved via document.querySelector('[data-module="whatsapp"]') in useEffect

key_files:
  created:
    - path: .planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md
      role: Deferred-state artifact for D-18 snoozed conversation — captures discovery grep evidence + 7-step un-defer plumbing checklist
  modified:
    - path: src/app/(dashboard)/whatsapp/components/conversation-list.tsx
      role: Skeletons (Task 1) + '['/']' shortcuts (Task 3) + role=list + tagFilter Popover portalContainer (Task 4)
    - path: src/app/(dashboard)/whatsapp/components/chat-view.tsx
      role: Thread bubble skeletons (Task 1) + role=log/aria-live/aria-label on messages container (Task 4)
    - path: src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
      role: 'Esc' keyboard shortcut for contact-panel drawer close at <1280px (Task 3)
    - path: src/app/(dashboard)/whatsapp/components/contact-panel.tsx
      role: RecentOrdersList themeContainerRef + portalContainer on stage picker + tag picker Popovers (Task 4)
    - path: src/components/ui/popover.tsx
      role: PopoverContent extended with optional portalContainer?: HTMLElement | null (infra for Task 4 — aditive, byte-identical default)

decisions:
  - "D-14 loading skeletons: consumen la utility .mx-skeleton ya shipped en globals.css Wave 0 (paper-2 bg + 1px border + mx-pulse 1.5s ease-in-out) en lugar de inline styles. La utility cae bajo el media query prefers-reduced-motion que desactiva la animación y fija opacity 1 automáticamente (UI-SPEC §12.3)."
  - "D-23 keyboard shortcut placement: '[' y ']' viven EXCLUSIVAMENTE en conversation-list.tsx (tiene acceso directo a filteredConversations + selectedId + onSelect — cero prop threading), 'Esc' vive EXCLUSIVAMENTE en inbox-layout.tsx (owns isPanelOpen state). Composer textarea (message-input.tsx) NO tocado — el onKeyDown existente maneja Shift+Enter vs Enter."
  - "D-23 scope isolation: ambos handlers usan target.closest('[data-module=whatsapp]') + guardia tag !== input/textarea/contenteditable. No hijack global, no hijack de composer, no bloquea Radix Esc-to-close nativo en dropdowns/modales."
  - "D-23 wrap behavior: '[' en primer item → salta al último; ']' en último item → vuelve al primero. Operación sobre filteredConversations (lo que el usuario VE post-filtros) — coherente con semántica del foco y del '/' shortcut de Plan 02."
  - "D-17 connection error banner DIFERIDO: useConversations() y useMessages() NO exponen signal de conexión (verified via grep — ninguno retorna error/isError/isConnected/connectionError). Añadir el banner requeriría extender los hooks, lo cual viola D-19 (no tocar hooks/realtime). Follow-up: standalone o plan futuro extiende los hooks con `isConnected: boolean` + `onRetry` callback, luego wire el banner."
  - "D-24 universal a11y: role=list (conversation-list) + role=log + aria-live=polite + aria-label=Hilo de mensajes (chat-view) aplican SIN gate de v2 — son semánticas correctas independientemente del flag y mejoran screen reader UX para TODOS los usuarios (Regla 6 zero-regression respetada: no cambian comportamiento visible)."
  - "Portal sweep Rule 3 deviation: popover.tsx extendido con prop opcional portalContainer para permitir re-rooting del portal Radix. El archivo NO está en scope_boundaries list (los 7 archivos editorial), pero sin esta extensión, Task 4 Step 4 no se puede completar para los 3 Popovers in-scope (1 en conversation-list + 2 en contact-panel order cards). Patrón idéntico al adoptado por Plan 04 para dropdown-menu.tsx. Zero cambios para consumidores existentes (portalContainer es opcional; por default el Portal renderea a document.body)."
  - "Portal intentional-slate exclusions: (1) message-input.tsx emoji-picker Popover línea 416 — excluido per CONTEXT + PATTERNS §14 (`emoji-picker` en intentional-slate list). (2) contact-panel.tsx recompra stage Select línea 1089 — dentro de AlertDialogContent (modal exclusion per CONTEXT deferred modals)."
  - "D-19 NO-TOUCH verified: zero cambios en useConversations, useMessages, useVirtualizer, realtime channels, markAsRead, getConversation, sendMessage, addOptimisticMessage, scheduleSafetyRefetch, agent typing broadcast, scrolledToBottomRef logic."

metrics:
  duration: ~50 minutes
  completed_date: 2026-04-22T23:30:00Z
  tasks: 4
  tasks_completed: 4
  commits: 4
  files_created: 1
  files_modified: 5
---

# Plan 05 — Polish states + a11y + portal sweep — Summary

**One-liner:** Wave 2 cierra UI-SPEC §10 state matrix (loading skeletons editorial 6-list + 3-bubble via `.mx-skeleton`) + §12 a11y contract (role=list/log + aria-live + keyboard shortcuts `[`/`]`/`Esc` con scope-guard a `[data-module="whatsapp"]`) + portal sweep (Popover wrapper extendido con `portalContainer` opcional; 3 Popovers in-scope re-rooteados dentro de `.theme-editorial`, 2 exclusiones intentional-slate documentadas); D-18 snoozed state diferido via `DEFERRED-D18.md` con checklist de 7-pasos porque el schema no expone field `bot_mute_until`.

## Commits (4)

| Hash | Task | Message |
| ---- | ---- | ------- |
| `b4067a1` | 1 | `feat(ui-redesign-conversaciones-05): loading skeletons editoriales — 6 items en lista + 3 burbujas alternando en thread (D-14)` |
| `21f3704` | 2 | `docs(ui-redesign-conversaciones-05): DEFERRED-D18 — snoozed state diferido, schema sin campo bot_mute_until` |
| `27e5e3a` | 3 | `feat(ui-redesign-conversaciones-05): keyboard shortcuts '['/']' navegación lista + 'Esc' cierra drawer contacto (D-23)` |
| `ff80d14` | 4 | `feat(ui-redesign-conversaciones-05): ARIA roles list/log + portal sweep (Popover re-rooting) para surface editorial (D-24 + UI-SPEC §12.2)` |

## What Shipped

### Task 1 — Loading skeletons (D-14 — UI-SPEC §10.4)

**conversation-list.tsx** — cuando `isLoading && !initialConversations.length && v2`:
- Contenedor `<div role="list" aria-busy="true" aria-label="Cargando conversaciones">` (announces loading state to AT).
- 6 items replicando shape de `<ConversationItem>`:
  - Avatar skeleton `h-10 w-10 rounded-full`
  - Name skeleton `h-[14px] w-[120px] rounded-[2px]`
  - Preview skeleton `h-[12px] w-[180px] rounded-[2px]`
  - Timestamp skeleton `h-[10px] w-[40px] rounded-[2px]`
- Todas las piezas llevan la utility `mx-skeleton` (de `globals.css` Wave 0: `background: var(--paper-2); border: 1px solid var(--border); animation: mx-pulse 1.5s ease-in-out infinite; border-radius: var(--radius-3)`).
- `aria-hidden` en cada child wrapper (el contenedor lleva `aria-busy`).
- Media query `prefers-reduced-motion` en `globals.css` desactiva la animación y fija opacity 1 para los skeletons automáticamente.

Flag-OFF (`!v2`): `<Loader2>` spinner preservado byte-identical (la interim skeleton de Plan 02 se reemplaza porque Plan 02 fue explícito: "full polished mx-skeleton utility comes in Plan 05").

**chat-view.tsx** — cuando `isLoading && messages.length === 0 && v2`:
- Contenedor `<div role="log" aria-busy="true" aria-label="Cargando mensajes">` con padding `px-6 py-[22px]` + gap-2.
- 3 bubble skeletons alternando `justify-start` / `justify-end`:
  - Bubble 1 (inbound): `h-[56px] w-[45%] max-w-[62%] rounded-[10px] rounded-bl-[2px]`
  - Bubble 2 (outbound): `h-[42px] w-[35%] max-w-[62%] rounded-[10px] rounded-br-[2px]`
  - Bubble 3 (inbound): `h-[72px] w-[58%] max-w-[62%] rounded-[10px] rounded-bl-[2px]`
- Letter-note shape (10px radius con 2px en esquina opuesta) matching el shape editorial de `<MessageBubble>` que el componente va a renderear una vez cargados.

Flag-OFF (`!v2`): `<Loader2>` + texto "Cargando mensajes..." preservado byte-identical.

### Task 2 — Snoozed state (D-18) — **DEFERRED**

**Branch applied:** 2b (deferred with artifact).

**Discovery grep evidence (Step 1 verbatim):**
```bash
grep -rnE 'bot_mute_until|muted_until|snoozed_until|snooze_until|mute_until' \
  src/lib/whatsapp/types.ts \
  src/hooks/ \
  src/app/actions/conversations* \
  2>/dev/null
```
Output: zero hits.

Defensive follow-up grep:
```bash
grep -rnE 'bot_mute|muted|snoozed|snooze' src/lib/whatsapp/types.ts src/hooks/use-conversations.ts
```
Output: zero hits.

**Action:** `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` creado con:
- Evidencia del grep (verbatim).
- Contrato UI D-18 (opacity 0.6 + Moon icon + MxTag ink pill con `format(d, "d MMM HH:mm", { locale: es })` en zona `America/Bogota` per Regla 2).
- Checklist de 7 pasos para un-defer: migration → types → hook SELECT projection → domain mutation → server action → UI trigger → agent rule (Regla 6 considerada: cambia comportamiento productivo del agente, requiere opt-in).
- Code sketch completo listo para pegar una vez el field exista.
- Handoff explícito a **Plan 06 Task 4 LEARNINGS.md**.

**Code side-effect:** `conversation-item.tsx` NO se tocó. Cero `isSnoozed` branches emitidos. El componente compila clean y renderea byte-identical al estado post-Plan-02.

### Task 3 — Keyboard shortcuts (D-23 — UI-SPEC §10.1)

**conversation-list.tsx** — placement `[` / `]`:

```tsx
useEffect(() => {
  if (!v2) return
  function handleBracketKey(e: KeyboardEvent) {
    if (e.key !== '[' && e.key !== ']') return
    const target = e.target as HTMLElement | null
    if (!target) return
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
    if (!target.closest('[data-module="whatsapp"]')) return
    if (!filteredConversations.length) return

    const currentIdx = filteredConversations.findIndex((c) => c.id === selectedId)
    if (e.key === '[') {
      const prevIdx = currentIdx <= 0 ? filteredConversations.length - 1 : currentIdx - 1
      const prev = filteredConversations[prevIdx]
      if (prev) { e.preventDefault(); markAsReadLocally(prev.id); onSelect(prev.id, prev) }
      return
    }
    if (e.key === ']') {
      const nextIdx = currentIdx < 0 || currentIdx >= filteredConversations.length - 1 ? 0 : currentIdx + 1
      const next = filteredConversations[nextIdx]
      if (next) { e.preventDefault(); markAsReadLocally(next.id); onSelect(next.id, next) }
    }
  }
  document.addEventListener('keydown', handleBracketKey)
  return () => document.removeEventListener('keydown', handleBracketKey)
}, [v2, filteredConversations, selectedId, onSelect, markAsReadLocally])
```

**Placement note:** hook colocado DESPUÉS de `const filteredConversations = useMemo(...)` (línea 143) para evitar TDZ — la primera tentativa tuvo el hook antes del useMemo, lo que habría causado ReferenceError en el primer render porque `const` no se hoistea.

**Mirror commitment:** replica exactamente la selección que hace el click en `<ConversationItem>` (markAsReadLocally + onSelect con `(id, conversation)` firma completa).

**inbox-layout.tsx** — placement `Esc`:

```tsx
useEffect(() => {
  if (!v2) return
  function handleEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    const target = e.target as HTMLElement | null
    if (!target) return
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
    if (!target.closest('[data-module="whatsapp"]')) return
    if (typeof window !== 'undefined' && window.innerWidth < 1280 && isPanelOpen) {
      e.preventDefault()
      setIsPanelOpen(false)
    }
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
}, [v2, isPanelOpen])
```

**NO hijacks:**
- Radix `Esc`-to-close nativo en Dropdown/Popover/Dialog NO afectado (target de keydown está dentro de Radix portal, pero el handler solo actúa si `window.innerWidth < 1280 && isPanelOpen`, dejando a Radix procesar primero).
- Composer textarea NO tocado (guard `tag === 'textarea'` retorna antes de cualquier acción).
- `agent-config-slider` close NO manejado aquí (intentional-slate).

**message-input.tsx NO MODIFICADO** — confirmed via `git diff fb782e45..HEAD -- src/app/(dashboard)/whatsapp/components/message-input.tsx` → zero output.

### Task 4 — ARIA roles + connection banner (deferred) + portal sweep

**Step 1 — Universal ARIA on conversation-list items container (line 583):**
```tsx
<div role="list" aria-label="Lista de conversaciones">
  {filteredConversations.map((conversation) => (<ConversationItem ... />))}
</div>
```
Applied WITHOUT v2 gate — universal a11y improvement. `<ConversationItem>` already has `role="listitem"` from Plan 02, completing the semantic structure.

**Step 2 — Universal ARIA on chat-view messages container (line 179):**
```tsx
<div
  ref={parentRef}
  role="log"
  aria-live="polite"
  aria-label="Hilo de mensajes"
  className="flex-1 overflow-auto chat-background"
  style={{ contain: 'strict' }}
>
```
Applied WITHOUT v2 gate — universal a11y. Screen readers announce new messages as they arrive via realtime (polite politeness — won't interrupt ongoing speech).

**Step 3 — Connection error banner (D-17) — DEFERRED:**

Hooks inspected — neither `useConversations` nor `useMessages` expose connection signal:

```ts
// use-conversations.ts line 514-531 return shape:
return {
  conversations, ordersByContact, query, setQuery, filter, setFilter,
  isLoading, isLoadingOrders, hasQuery, refresh, refreshOrders,
  getConversationById, markAsReadLocally, sortMode, setSortMode,
  // NO error / NO isError / NO isConnected / NO connectionError
}

// use-messages.ts line 256-263 return shape:
return {
  messages, isLoading, loadMore, hasMore,
  addOptimisticMessage, scheduleSafetyRefetch,
  // NO error / NO isError / NO isConnected / NO connectionError
}
```

Extending these hooks to expose connection-state signal would violate D-19 (no hook mutation). The banner is deferred to a follow-up plan that extends `useMessages`/`useConversations` with a proper `isConnected: boolean` signal sourced from the Supabase Realtime channel state (which DOES expose `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` events — visible in `use-conversations.ts:450` debug log, but not surfaced to consumers).

**Step 4 — Portal sweep (closes ISS-04):**

Grep command:
```bash
grep -rnE 'DropdownMenu|Popover|Select|HoverCard' \
  src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx \
  src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx \
  src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx \
  src/app/\(dashboard\)/whatsapp/components/chat-view.tsx \
  src/app/\(dashboard\)/whatsapp/components/chat-header.tsx \
  src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx \
  src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx \
  src/app/\(dashboard\)/whatsapp/components/message-input.tsx
```

**Sweep Result table:**

| File | Primitive | Line(s) | Action | Notes |
|------|-----------|---------|--------|-------|
| `conversation-list.tsx` | Popover (tagFilter — v2 branch) | 328, 341 | **wired containerRef** | `portalContainer={v2 ? themeContainerRef.current : undefined}`. Re-roots into `.theme-editorial` when v2, body default otherwise. |
| `conversation-list.tsx` | Popover (tagFilter — legacy branch) | 372, 385 | **n/a** | Legacy flag-OFF branch — keeps default body portal (byte-identical with pre-Plan-05). |
| `contact-panel.tsx` | Popover (order stage picker) | 859, 888 | **wired containerRef** | `portalContainer={v2 ? themeContainerRef.current : undefined}`. |
| `contact-panel.tsx` | Popover (order tag picker) | 1012, 1037 | **wired containerRef** | Same pattern as stage picker. |
| `contact-panel.tsx` | Select (recompra stage) | 1089 | **intentional-slate** | Dentro de `<AlertDialogContent>` — modal exclusion per CONTEXT deferred modals list. |
| `message-input.tsx` | Popover (emoji picker) | 416 | **intentional-slate** | `emoji-picker` listed explicitly in CONTEXT + PATTERNS §14 intentional-slate exclusions. |
| `chat-header.tsx` | (import re-reference only) | 85 | **n/a** | Line 85 is `document.querySelector('[data-module="whatsapp"]')` for themeContainerRef — false positive in grep. Uses `AssignDropdown` which already re-rooted via Plan 04. |
| inbox-layout / conversation-item / chat-view / message-bubble | none | — | **n/a** | No Radix portal primitives render here. Grep hits were all identifier false positives (`initialSelectedId`, `onSelectedUpdated`, `isSelected`, `selectedId`, etc.). |

**Intentional-slate confirmations (documented, no action required):**
- `message-input.tsx` emoji-picker PopoverContent (CONTEXT + PATTERNS §14 row `emoji-picker`).
- `contact-panel.tsx` recompra `<Select>` within `<AlertDialog>` (CONTEXT deferred modals: "`CreateOrderSheet`-like dialogs for cloning/recompra" — the AlertDialog for recompra is part of this cohort).
- `new-conversation-modal.tsx`, `template-send-modal.tsx`, `view-order-sheet.tsx`, `create-contact-sheet.tsx`, `create-order-sheet.tsx`, `agent-config-slider.tsx`, `quick-reply-autocomplete.tsx` — OUT-OF-SCOPE files, NOT grepped; all slate per CONTEXT.

**Infrastructure — `src/components/ui/popover.tsx` extension (Rule 3 deviation — see Deviations):**

Added optional `portalContainer?: HTMLElement | null` prop to `PopoverContent`. Passed to `PopoverPrimitive.Portal container={portalContainer ?? undefined}`. When omitted (all existing consumers across the codebase), the portal falls through to `document.body` — **byte-identical** for non-editorial surfaces.

**Handoff to Plan 06 Task 2 DoD QA:** Update the intentional-slate documentation to include the sweep findings — specifically:
- `conversation-list.tsx` tagFilter Popover: re-rooted via `portalContainer` when v2 (stage: Wave 2 Plan 05).
- `contact-panel.tsx` order stage + tag Popovers: re-rooted via `portalContainer` when v2 (stage: Wave 2 Plan 05).
- `contact-panel.tsx` recompra Select: intentional-slate (modal — expected).
- `message-input.tsx` emoji-picker Popover: intentional-slate (PATTERNS §14).

## Verification

### Automated (grep + tsc)

All acceptance criteria from all 4 tasks pass:

```
✅ mx-skeleton in conversation-list: 5 usages (4 skeleton pieces × variation + container)
✅ mx-skeleton in chat-view: 4 usages (3 bubbles + comment reference)
✅ aria-busy="true" in conversation-list: present
✅ Array.from({ length: 6 }) in conversation-list: present
✅ DEFERRED-D18.md artifact exists
✅ e.key === '[' in conversation-list: 1 occurrence
✅ e.key === ']' in conversation-list: 1 occurrence
✅ e.key !== 'Escape' (guard form) in inbox-layout: 1 occurrence
✅ e.key === 'Escape' NOT in conversation-list: 0 (scope clarity enforced)
✅ e.key === '[' NOT in inbox-layout: 0 (scope clarity enforced)
✅ data-module="whatsapp" scope guard in conversation-list: 4 refs
✅ data-module="whatsapp" scope guard in inbox-layout: 3 refs
✅ role="list" in conversation-list: 2 (items container + aria-busy skeleton container)
✅ aria-label="Lista de conversaciones" in conversation-list: present
✅ role="log" in chat-view: 2 (thread container + aria-busy skeleton container)
✅ aria-live="polite" in chat-view: present
✅ aria-label="Hilo de mensajes" in chat-view: present
✅ portalContainer wired in conversation-list: 1 (tagFilter Popover v2 branch only)
✅ portalContainer wired in contact-panel: 2 (stage + tag order-card Popovers)
✅ portalContainer prop in popover.tsx shadcn wrapper: declared + destructured + consumed (3 refs)
```

### TypeScript

`npx tsc --noEmit` → exit 0, 0 errors across the entire project.

### Files NOT touched (plan-declared but no action needed)

`git diff fb782e45..HEAD -- <file>` returns empty for:
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` — Task 3 explicitly prohibited touching it; composer unchanged.
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` — Task 2 deferred (no snooze field).
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` — No in-scope portal primitive requiring re-rooting (AssignDropdown already re-rooted via Plan 04).

### Scope boundary — files changed (6 total):

```
.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md     [artifact — Task 2]
src/app/(dashboard)/whatsapp/components/chat-view.tsx               [Task 1 + Task 4]
src/app/(dashboard)/whatsapp/components/contact-panel.tsx           [Task 4 portal sweep]
src/app/(dashboard)/whatsapp/components/conversation-list.tsx       [Task 1 + Task 3 + Task 4]
src/app/(dashboard)/whatsapp/components/inbox-layout.tsx            [Task 3]
src/components/ui/popover.tsx                                       [Task 4 infra — Rule 3 deviation]
```

Of the 7 files in `files_modified` frontmatter, 3 are intentionally unchanged (documented above). Adds `src/components/ui/popover.tsx` as aditive infra via Rule 3.

## Flag-OFF byte-identity verification

`git diff fb782e45..HEAD` shows **zero changes to the flag-OFF rendering path** in every file:

- `conversation-list.tsx`: skeleton legacy branch = original Loader2 spinner (unchanged). Legacy Popover branch (line 372+) unchanged — default body portal preserved. `role="list"` + `aria-label` on items container are universal (apply also flag-OFF) but are semantic-only attributes with zero visual impact.
- `chat-view.tsx`: `role="log"` + `aria-live` + `aria-label` on messages container are universal semantic attrs with zero visual impact. Legacy loading Loader2 branch preserved.
- `inbox-layout.tsx`: Esc handler is `if (!v2) return` early — zero behavior change when flag OFF.
- `contact-panel.tsx`: `portalContainer={v2 ? themeContainerRef.current : undefined}` — when v2 is false, undefined passed → shadcn wrapper passes undefined to Radix Portal → default body portal (byte-identical pre-Plan-05 behavior).
- `popover.tsx`: all callsites that don't pass `portalContainer` get undefined → default Portal behavior (body) preserved for 100% of existing consumers.

## Deviations from Plan

### Rule 3 [Blocker] — Extended `src/components/ui/popover.tsx` outside scope_boundaries list

- **Found during:** Task 4 Step 4 (portal sweep — wiring up re-rooting for the 3 in-scope Popovers).
- **Issue:** Task 4 action explicitly instructs: "wrap `<XxxContent>` with `<XxxPortal container={themeContainerRef.current ?? undefined}>`. Use the same `themeContainerRef` pattern established in Plan 04 Task 1." But shadcn's `<PopoverContent>` does NOT expose a `portalContainer` prop — it hardcodes `<PopoverPrimitive.Portal>` without any container passthrough. Without extending the wrapper, there is no way to re-root the Radix portal from the caller site. This is a blocker preventing Task 4 acceptance criteria "For each sweep hit categorized as 'wired containerRef': the component file passes `container={<ref>.current ?? undefined}` on its Radix `*Portal` wrapper."
- **Fix:** Added optional `portalContainer?: HTMLElement | null` prop to `PopoverContent` and threaded it to `PopoverPrimitive.Portal container={portalContainer ?? undefined}`. Pattern is literally identical to what Plan 04 did for `src/components/ui/dropdown-menu.tsx` (which is also outside the editorial component scope).
- **Byte-identical guarantee:** all existing consumers in the codebase call `<PopoverContent>` WITHOUT `portalContainer` — the prop is optional, defaults to undefined, Radix falls through to default body portal. Verified by searching callsites: non-whatsapp Popovers are untouched.
- **Rationale:** PATTERNS §14 explicitly lists `Popover` in the portal-primitive re-rooting requirement table; the only way to honor the plan without this deviation would be to mark all 3 sweep hits as "deferred", which would be a silent failure of Task 4's core objective. This deviation is additive infrastructure with zero risk surface.
- **Files modified:** `src/components/ui/popover.tsx`.
- **Commit:** `ff80d14`.

### No other Rule 1 / Rule 2 / Rule 4 issues encountered

## TDZ Bug Caught Pre-Commit (Rule 1)

- **Found during:** Task 3 first-attempt authoring.
- **Issue:** Initial draft of the `[` / `]` useEffect was placed BEFORE the `filteredConversations = useMemo(...)` declaration in the component body. Since `const` declarations have Temporal Dead Zone (TDZ), the effect's deps array `[v2, filteredConversations, ...]` would have thrown `ReferenceError: Cannot access 'filteredConversations' before initialization` at first render.
- **Fix:** Moved the `[`/`]` useEffect to AFTER the `filteredConversations = useMemo(...)` line. Zero functional change to the handler code itself.
- **Commit:** `27e5e3a` (caught and fixed before the Task 3 commit, so the committed code is already correct).

## State-name discoveries

- `inbox-layout.tsx` drawer state: `isPanelOpen` / `setIsPanelOpen` (confirmed via grep before wiring Esc handler).
- `conversation-list.tsx` exposes `markAsReadLocally` from the hook — used by the `[`/`]` handler to mirror click-select behavior (otherwise arrow-key navigation would leave conversations unread when they shouldn't be).
- `useConversations` does NOT expose a `rawFilteredList` or equivalent — `filteredConversations` is computed locally in `ConversationList` via `useMemo` combining the hook's `conversations` (already search+filter-scoped) with local `agentFilter` + `tagFilter` state. The `[`/`]` handler uses this local `filteredConversations` so navigation honors ALL visible filters, not just the hook-level ones.

## Threat Flags

None. This plan introduces no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Purely cosmetic/a11y markup + conditional portal container + optional prop extension, all gated by an existing per-workspace feature flag. No new surface.

## Known Stubs

None. All rendered paths (skeletons, ARIA attrs, keyboard handlers, re-rooted portals) are wired to existing data sources (`isLoading`, `messages.length`, `filteredConversations`, `isPanelOpen`, `themeContainerRef`). The D-17 banner deferred is NOT a stub — no render path exists for it in this plan; it will be added by a follow-up that extends the hooks.

## Auto-Mode / Auth Gates

None triggered. Execution was fully autonomous — zero checkpoints reached, zero auth gates (no new API calls, no new credentials, no new CLI tools).

## Handoff to Wave 5 (Plan 06 DoD QA + docs)

**State after Plan 05:**

- ✅ Loading states editorial (list + thread skeletons via `.mx-skeleton`) — D-14 covered.
- ✅ Keyboard shortcuts `[` / `]` / `Esc` — D-23 covered (composer blur + agent-config-slider close OUT OF SCOPE per plan).
- ✅ Universal ARIA roles (list, log, aria-live) — D-24 contributory coverage.
- ✅ Portal sweep executed across 8 in-scope components — 3 Popovers re-rooted via portalContainer, 2 intentional-slate confirmed.
- ⚠️ D-17 connection banner **DEFERRED** — requires hook extension (documented above).
- ⚠️ D-18 snoozed state **DEFERRED** — requires schema/type/hook plumbing (see `DEFERRED-D18.md`).

**Plan 06 must:**
1. Update intentional-slate documentation with the sweep findings (see table above — Task 4 Step 4.3).
2. Include in LEARNINGS.md the D-18 defer note (see `DEFERRED-D18.md` Handoff to Plan 06).
3. Include in LEARNINGS.md the D-17 defer note (banner pending hook extension with `isConnected` signal).
4. Run axe-core scan as part of DoD QA: `npx @axe-core/cli http://localhost:3020/whatsapp --tags wcag2a,wcag2aa` against both flag-ON and flag-OFF states; expected zero NEW serious/critical violations compared to flag-OFF baseline.
5. Pixel-diff smoke: take screenshots of flag-ON list loading (6 skeleton items) + flag-ON thread loading (3 bubble skeletons) as baseline for visual regression catching.

## Self-Check: PASSED

- ✅ `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` exists.
- ✅ `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` exists (modified — skeletons + `[`/`]` + role=list + tagFilter portalContainer).
- ✅ `src/app/(dashboard)/whatsapp/components/chat-view.tsx` exists (modified — thread skeletons + role=log + aria-live).
- ✅ `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` exists (modified — Esc handler).
- ✅ `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` exists (modified — 2× portalContainer on order-card Popovers).
- ✅ `src/components/ui/popover.tsx` exists (modified — portalContainer prop extension, Rule 3 deviation).
- ✅ Commit `b4067a1` exists in git log (Task 1).
- ✅ Commit `21f3704` exists in git log (Task 2 artifact).
- ✅ Commit `27e5e3a` exists in git log (Task 3).
- ✅ Commit `ff80d14` exists in git log (Task 4).
- ✅ `npx tsc --noEmit` → exit 0, zero errors.
- ✅ Scope boundary: 6 files changed total (4 source + 1 shadcn infra + 1 planning artifact); 3 files declared but intentionally untouched; `message-input.tsx` explicitly preserved per plan.
- ✅ All must_haves.truths verified via grep + manual read; 2 truths explicitly deferred with documentation (D-17 banner; D-18 snoozed).
- ✅ D-19 NO-TOUCH verified: zero changes to hooks, realtime, actions, domain, webhooks, useMessages, useConversations, useVirtualizer, agent typing broadcast.
