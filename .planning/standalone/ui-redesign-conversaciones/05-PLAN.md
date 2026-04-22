---
phase: ui-redesign-conversaciones
plan: 05
type: execute
wave: 2
depends_on: [02, 03, 04]
files_modified:
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
  - src/app/(dashboard)/whatsapp/components/message-input.tsx
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
autonomous: true
requirements:
  - D-14
  - D-17
  - D-18
  - D-23
  - D-24

must_haves:
  truths:
    - "`conversation-list.tsx` cuando v2 + isLoading: renderiza 6 skeletons conversation-item (bg paper-2 + border + mx-pulse animation) en lugar del spinner Loader2 (D-14, UI-SPEC §10.4)"
    - "`chat-view.tsx` cuando v2 + isLoadingMessages: renderiza 3 bubble skeletons alternando in/own (bg paper-2 + border + mx-pulse + max-width 62%) (D-14, UI-SPEC §10.4)"
    - "`conversation-item.tsx` cuando v2 + snooze field activo (ver Task 2 discovery-first flow): item renderiza con opacity-60 + ícono `<Moon/>` lucide 12x12 al lado del timestamp + `<MxTag variant='ink'>snoozed hasta {fecha}</MxTag>` (D-18, UI-SPEC §11 state matrix). Si NO existe field de snooze en el schema, DEFERRED.md creado + LEARNING note."
    - "Keyboard shortcuts `[` y `]` (D-23): implementados en `conversation-list.tsx` (tiene acceso directo a la lista de conversaciones + onSelect callback). Scoped a `[data-module=\"whatsapp\"]` + no hijack cuando target es input/textarea/contenteditable."
    - "Keyboard shortcut `Esc` (D-23): implementado en `inbox-layout.tsx` para cerrar drawer del contact-panel a anchos <1280px (UI-SPEC §10.1 row 1). El blur del textarea del composer NO se toca — el onKeyDown existente en message-input.tsx ya maneja Shift+Enter vs Enter."
    - "Banner de error 'canal caído' (D-17, UI-SPEC §9.1): cuando v2 + error state detectado (ej: connection error en useConversations o en chat realtime), renderiza banner top en chat-view con `bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border-l-[3px] border-l-[var(--rubric-2)]` + `<AlertTriangle>` rubric-2 + texto `'No pudimos conectar con WhatsApp Business.'` + sub-caption + botón 'Reintentar' (D-17) — si no existe lógica de connection-state en el hook actual, este banner se condiciona a un flag opcional `connectionError?: boolean` propagado desde el useConversations/useMessages sin modificar la lógica del hook (solo consumir flag si existe hoy, sino skip task y documentar en SUMMARY como deferred)"
    - "`role=\"list\"` en `conversation-list` items container + `role=\"log\"` + `aria-live=\"polite\"` en `chat-view` thread container (UI-SPEC §12.2 — aplica a TODOS los users cuando v2 para universal a11y, skip si componente no tiene rol claro de \"list\")"
    - "`focus-visible` styling consistente: botones y links dentro de `.theme-editorial` muestran outline 2px ink-1 offset 2px vía token override en globals.css (ya shipped en Wave 0) — NO se requiere cambio en este plan salvo verificación"
    - "Inputs editoriales (search + composer) cuando v2: focus-visible muestra outline 2px ink-1 + offset 2px (ya implementado en Wave 1 y 3, verificar universal)"
    - "Portal sweep in-scope (extensión a Plan 04 Task 3): para CADA componente in-scope (inbox-layout, conversation-list, conversation-item, chat-view, chat-header, contact-panel, message-bubble, message-input) que use `DropdownMenu | Popover | Select | HoverCard` en superficie editorial, o recibe el `containerRef` (Plan 04 Task 1/3 patrón) o es documentado como deferred en el SUMMARY con justificación. Componentes intencionalmente slate (excluidos): `new-conversation-modal`, `template-send-modal`, `view-order-sheet`, `create-*-sheet`, `agent-config-slider`, `emoji-picker`, `quick-reply-autocomplete` (per CONTEXT + PATTERNS §14 intentional-slate list)."
    - "Verificación axe-core: `npx @axe-core/cli http://localhost:3020/whatsapp --tags wcag2a,wcag2aa` retorna 0 serious/critical violations NUEVAS (diff vs baseline sin flag)"
    - "`prefers-reduced-motion` ya cubierto en globals.css Wave 0 — verificar que ningún componente añada `animation`/`transition` custom que evada el media query"
    - "Cero cambios funcionales en hooks, realtime, server actions, domain calls (D-19)"
    - "Build pasa: `npx tsc --noEmit` clean en los archivos modificados"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "Loading skeletons 6x conversation-item when v2 + [/] keyboard shortcuts"
      contains: "mx-skeleton"
    - path: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      provides: "Thread loading skeletons + error banner + role=log"
      contains: "aria-live=\"polite\""
    - path: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      provides: "Snoozed state with Moon icon + MxTag (or deferred note)"
      contains: "Moon"
    - path: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      provides: "Esc keyboard shortcut for contact-panel drawer close at <1280px"
      contains: "key === 'Escape'"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 + existing onSelect callback"
      pattern: "onSelect"
    - from: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      to: "editorial CSS scope"
      via: "mx-skeleton + error banner classes"
      pattern: "mx-skeleton"
---

<objective>
Wave 4 — Polish states (loading skeletons, snoozed, error banner), a11y (ARIA roles + keyboard shortcuts `[`, `]`, `Esc`), and portal coverage sweep. This is the "glue" plan that makes the re-skin feel complete — everything a user can do in the inbox has a matching editorial look in every state.

**Purpose:** Close the UI-SPEC §10 state matrix and UI-SPEC §12 a11y contract for D-03 side-by-side QA. Without this wave, the flag-on version has editorial styles but still shows shadcn spinners, yellow error banners, and missing keyboard shortcuts — obvious regressions. Also sweeps the in-scope components for Radix portal primitives that were not covered by Plan 04's explicit `assign-dropdown.tsx` wiring.

**Output:** Five polished areas.
1. Loading skeletons (list + thread) per UI-SPEC §10.4.
2. Snoozed conversation item state per D-18 (discovery-first; may defer with explicit artifact).
3. Keyboard shortcuts `[` / `]` (conversation-list) / `Esc` (inbox-layout, drawer close at <1280px) per D-23.
4. ARIA roles (`role="list"` / `role="log"` / `aria-live="polite"`) per UI-SPEC §12.2 + connection error banner (D-17, conditional on hook signal).
5. Portal sweep — ensure any `DropdownMenu | Popover | Select | HoverCard` inside in-scope editorial surfaces either re-roots via `containerRef` or is documented as deferred.
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
@.planning/standalone/ui-redesign-conversaciones/02-PLAN.md
@.planning/standalone/ui-redesign-conversaciones/03-PLAN.md
@.planning/standalone/ui-redesign-conversaciones/04-PLAN.md

# Source files in scope (already modified by Waves 1-3):
@src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
@src/app/(dashboard)/whatsapp/components/conversation-list.tsx
@src/app/(dashboard)/whatsapp/components/conversation-item.tsx
@src/app/(dashboard)/whatsapp/components/chat-view.tsx
@src/app/(dashboard)/whatsapp/components/chat-header.tsx
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
@src/app/(dashboard)/whatsapp/components/message-input.tsx

<interfaces>
<!-- Wave 0 CSS utilities available: -->
- `.theme-editorial .mx-skeleton { background: var(--paper-2); border: 1px solid var(--border); animation: mx-pulse 1.5s ease-in-out infinite; }`
- `@keyframes mx-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`
- `@media (prefers-reduced-motion: reduce) { ... }` disables animations inside `.theme-editorial`.

<!-- Existing state shapes (verify at implementation): -->
- Loading state in conversation-list: `isLoading` boolean (from `useConversations` or local state)
- Loading state in chat-view: `isLoadingMessages` boolean (from `useMessages`)
- Snoozed flag: DISCOVERY REQUIRED per Task 2 (no known field confirmed in ConversationWithDetails as of plan authorship)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Loading skeletons (conversation-list + chat-view) — D-14</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-list.tsx, src/app/(dashboard)/whatsapp/components/chat-view.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx (current loading state branch — look for `isLoading` or `<Loader2` usage)
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx (thread loading — look for messages loading state and render)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §10.4 (exact skeleton specs)
    - src/app/globals.css (verify `.mx-skeleton` + `@keyframes mx-pulse` present from Wave 0)
  </read_first>
  <action>
    **Step 1 — conversation-list.tsx loading skeleton:**

    Find the existing loading branch (typically `{isLoading ? <Loader2 className="animate-spin" /> : ...}` or similar). Add a v2-conditional branch rendering 6 skeleton items:

    ```tsx
    {isLoading ? (
      v2 ? (
        <div role="list" aria-busy="true" className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)]"
            >
              {/* Avatar skeleton */}
              <div className="mx-skeleton h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {/* Name skeleton */}
                <div className="mx-skeleton h-[14px] w-[120px] rounded-[2px]" />
                {/* Preview skeleton */}
                <div className="mx-skeleton h-[12px] w-[180px] rounded-[2px]" />
              </div>
              {/* Timestamp skeleton */}
              <div className="mx-skeleton h-[10px] w-[40px] rounded-[2px] mt-1" />
            </div>
          ))}
        </div>
      ) : (
        // Preserve current loading JSX (Loader2 spinner or equivalent)
      )
    ) : (
      // ... current loaded state rendering
    )}
    ```

    Replace the placeholder comments with the EXACT current loading markup so the !v2 branch is byte-identical. Preserve whatever key names the loading state currently uses (`isLoading`, `loading`, `isPending`).

    **Step 2 — chat-view.tsx thread loading skeleton:**

    Find the current messages loading state. Similar pattern:
    ```tsx
    {isLoadingMessages ? (
      v2 ? (
        <div role="log" aria-busy="true" className="flex flex-col gap-2 p-[22px_24px]">
          {/* 3 skeleton bubbles, alternating in/own */}
          <div className="flex justify-start">
            <div className="mx-skeleton h-[56px] w-[45%] rounded-[10px] rounded-bl-[2px]" />
          </div>
          <div className="flex justify-end">
            <div className="mx-skeleton h-[42px] w-[35%] rounded-[10px] rounded-br-[2px]" />
          </div>
          <div className="flex justify-start">
            <div className="mx-skeleton h-[72px] w-[58%] rounded-[10px] rounded-bl-[2px]" />
          </div>
        </div>
      ) : (
        // Preserve current loading JSX byte-identical
      )
    ) : (
      // ... current loaded state
    )}
    ```

    **DO NOT MODIFY (D-19):**
    - `useMessages`, `useConversations` hooks (just consume their existing loading signal)
    - virtualization, scroll tracking
    - Any realtime subscription
  </action>
  <verify>
    <automated>grep -q "mx-skeleton" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "mx-skeleton" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && grep -q "aria-busy=\"true\"" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && npx tsc --noEmit 2>&1 | grep -E "conversation-list|chat-view" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "mx-skeleton" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (skeleton utility from globals.css used).
    - `grep -c "mx-skeleton" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` returns ≥ 3 (avatar + name + preview + timestamp per item × 6 items = many; at minimum 3 distinct usages).
    - `grep -q "mx-skeleton" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (thread skeletons).
    - `grep -q "aria-busy=\"true\"" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (a11y signal).
    - `grep -q "Array.from({ length: 6 })" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (6 skeleton items per UI-SPEC §10.4).
    - The file STILL contains the current `isLoading` (or equivalent) branch for `!v2` — verify byte-identical preservation via grep of the original markup (e.g., `Loader2` if it was there).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>Loading skeletons render for v2: 6 items in list + 3 bubbles in thread. Non-v2 uses current spinner. D-14 covered.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Snoozed conversation state (conversation-item.tsx) — D-18 (discovery-first flow, deferred-with-artifact if field absent)</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-item.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx (current implementation, modified by Wave 1 Plan 02)
    - src/lib/whatsapp/types.ts (run the discovery grep in Step 1 below BEFORE coding anything)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md D-18 + §11 state matrix
    - .planning/standalone/ui-redesign-conversaciones/CONTEXT.md D-18 specification
  </read_first>
  <action>
    **CRITICAL — Discovery-first flow. Do NOT silently defer D-18.**

    **Step 1 — MANDATORY discovery grep (run this BEFORE touching any code):**
    ```bash
    grep -rnE 'bot_mute_until|muted_until|snoozed_until|snooze_until|mute_until' \
      src/lib/whatsapp/types.ts \
      src/hooks/ \
      src/app/actions/conversations* \
      2>/dev/null
    ```

    Capture the exact output. This determines which branch of the implementation applies.

    **Step 2a — Field FOUND (grep returned at least one hit):**

    Identify the actual field name from the grep output (e.g., `bot_mute_until`, `muted_until`, `snoozed_until`, etc.). Use that exact field name in the condition. Document the chosen field name + line reference in the SUMMARY.

    Detect snoozed state (replace `<FIELD>` with the discovered field name):
    ```typescript
    const isSnoozed = v2 && conversation.<FIELD> && new Date(conversation.<FIELD>) > new Date()
    ```

    Apply opacity + Moon icon + MxTag:

    **Step 2a.1 — Apply opacity to the item when snoozed:**
    ```tsx
    <button
      // ... existing className cn(...)
      className={cn(
        ...existingClasses,
        isSnoozed && 'opacity-60'
      )}
    >
    ```

    **Step 2a.2 — Render Moon icon next to timestamp + pill "snoozed hasta {fecha}":**
    ```tsx
    import { Moon } from 'lucide-react'
    import { format } from 'date-fns'
    import { es } from 'date-fns/locale'
    import { MxTag } from './mx-tag'

    // ... inside render, next to the timestamp <RelativeTime> usage:
    <div className="flex items-center gap-1">
      {isSnoozed && (
        <Moon className="h-3 w-3 text-[var(--ink-3)]" aria-label="Silenciada" />
      )}
      {/* existing timestamp span */}
    </div>

    {isSnoozed && (
      <MxTag variant="ink" className="mt-1">
        snoozed hasta {format(new Date(conversation.<FIELD>!), "d MMM HH:mm", { locale: es })}
      </MxTag>
    )}
    ```

    Place the pill after the tags block if one exists (so snooze indicator sits at the bottom of the item content). Adapt placement to the existing layout — the key requirement is: visible Moon icon + visible pill when snoozed + v2.

    **Step 2b — Field NOT FOUND (grep returned zero hits):**

    The plan MUST NOT silently defer. Execute this mandatory sequence:

    **Step 2b.1 — Create the DEFERRED artifact.** Write `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` with:
    ```markdown
    # DEFERRED — D-18 Snoozed Conversation State

    **Status:** Deferred from Phase `ui-redesign-conversaciones` Plan 05 Task 2.
    **Reason:** Discovery grep on `src/lib/whatsapp/types.ts` + `src/hooks/` + `src/app/actions/conversations*` returned zero hits for any of: `bot_mute_until`, `muted_until`, `snoozed_until`, `snooze_until`, `mute_until`. The `ConversationWithDetails` type does not currently expose a snooze-capable field.

    **D-18 UI contract (CONTEXT):**
    - Item in list con opacidad 0.6 + ícono `Moon` lucide junto al timestamp mono.
    - Pill `mx-tag--ink` con label `"snoozed hasta {fecha}"`.

    **Minimum plumbing required to un-defer:**
    1. Add `bot_mute_until: string | null` (ISO timestamp) to the `ConversationWithDetails` type in `src/lib/whatsapp/types.ts`.
    2. Add a corresponding column to the `conversations` table in a Supabase migration (`supabase/migrations/...-add-bot-mute-until.sql`).
    3. Expose the field in the `useConversations` hook's SELECT projection (or whichever server action hydrates the list).
    4. Add a mutation (domain layer per Regla 3) to SET/CLEAR the snooze timestamp — trigger from chat-header (new ibtn "Silenciar conversación") or conversation-item context menu.

    **UI to wire after field exists** (same code sketched in Plan 05 Task 2 Step 2a): opacity + Moon + MxTag ink variant with `format(new Date(conversation.bot_mute_until!), "d MMM HH:mm", { locale: es })`.

    **Captured on:** <date executor runs this>
    **Grep output evidence:** <paste grep output showing zero hits>
    ```

    **Step 2b.2 — Add LEARNING note for Plan 06.** Append to Plan 05's SUMMARY a note that Plan 06 Task 4's LEARNINGS.md MUST include:
    > "D-18 (snoozed conversation state) DEFERRED — no snooze field on `ConversationWithDetails`. See `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` for un-defer plumbing checklist."

    **Step 2b.3 — Skip rendering the snooze branch in this Plan.** The component compiles clean without the Moon icon / MxTag / opacity. Do NOT emit `isSnoozed` code paths. Add `import` stubs only if needed by other tasks.

    **DO NOT MODIFY (D-19):**
    - `onSelect` callback
    - Any other state/logic
    - Non-v2 rendering — if `!v2`, snooze state renders as current (not visible)
    - The schema / migrations / hooks / domain — plumbing is the un-defer scope, NOT this plan
  </action>
  <verify>
    <automated>( (grep -q "Moon" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "MxTag" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx && grep -q "opacity-60\|isSnoozed" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx) || test -f .planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md ) && npx tsc --noEmit 2>&1 | grep "conversation-item" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - EITHER: `grep -q "Moon" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` AND `grep -q "MxTag" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` AND `grep -q "opacity-60" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx` (field was found, UI wired).
    - OR: `test -f .planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` (field was NOT found, deferred artifact created with un-defer checklist).
    - Silent defer is REJECTED — if neither condition above is true, the task fails.
    - The SUMMARY documents: (a) which branch applied (2a vs 2b), (b) if 2a, the field name chosen, (c) if 2b, confirmation that DEFERRED-D18.md was created and Plan 06 LEARNINGS instructed.
    - Discovery grep evidence captured in the SUMMARY (paste grep command + output).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>Snoozed conversations render with opacity + Moon icon + "snoozed hasta {fecha}" pill when flag ON + snooze field populated (Step 2a). OR: DEFERRED-D18.md created with un-defer plumbing checklist + LEARNING flagged (Step 2b). Silent defer is NOT permitted.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Keyboard shortcuts — `[` / `]` in conversation-list.tsx, `Esc` for drawer in inbox-layout.tsx (D-23)</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-list.tsx, src/app/(dashboard)/whatsapp/components/inbox-layout.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx (modified by Wave 1 Plan 02 — has `/` handler already + direct access to conversations list + onSelect + searchInputRef)
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (modified by Wave 0 — has useInboxV2Provider + data-module + v2 + contact-panel drawer state at <1280px)
    - src/app/(dashboard)/whatsapp/components/message-input.tsx (verify textarea onKeyDown handles Shift+Enter vs Enter for send — NOT to be touched)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §10.1 (keyboard shortcuts table)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `### Example 6` (scoped keyboard pattern)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md (confirms conversation list state lives inside ConversationList, not InboxLayout)
  </read_first>
  <action>
    **Placement commitment (based on PATTERNS.md analysis — single file per shortcut, no ambiguity):**

    - `[` and `]` handlers → **`conversation-list.tsx`** (has the conversations array + onSelect callback + search focus ref already — minimal prop threading).
    - `Esc` handler → **`inbox-layout.tsx`** ONLY for the contact-panel drawer close at <1280px (per UI-SPEC §10.1 row 1).
    - Textarea blur / Enter-to-send behavior → **unchanged** (standard browser behavior + existing `message-input.tsx` onKeyDown remain intact; do NOT add an Esc handler that blurs the composer).

    ---

    **Step 1 — Add `[` / `]` handler to `conversation-list.tsx`** (next to the existing `/` handler already there from Plan 02):

    ```tsx
    useEffect(() => {
      if (!v2) return

      function handleKeyDown(e: KeyboardEvent) {
        // Only handle `[` and `]` here; `/` has its own effect from Plan 02.
        if (e.key !== '[' && e.key !== ']') return

        const target = e.target as HTMLElement | null
        if (!target) return

        // Guard: don't hijack when focus is inside input/textarea/contenteditable
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return

        // Scope: only fire when focus is inside the /whatsapp module
        if (!target.closest('[data-module="whatsapp"]')) return

        if (!conversations.length) return

        const currentIdx = conversations.findIndex((c) => c.id === selectedId)

        if (e.key === '[') {
          // previous (wraps to last)
          const prevIdx = currentIdx <= 0 ? conversations.length - 1 : currentIdx - 1
          const prev = conversations[prevIdx]
          if (prev) {
            e.preventDefault()
            onSelect(prev.id)
          }
          return
        }

        if (e.key === ']') {
          // next (wraps to first)
          const nextIdx = currentIdx < 0 || currentIdx >= conversations.length - 1 ? 0 : currentIdx + 1
          const next = conversations[nextIdx]
          if (next) {
            e.preventDefault()
            onSelect(next.id)
          }
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [v2, conversations, selectedId, onSelect])
    ```

    **Naming check:** ConversationList already exposes `conversations` (the filtered array actually rendered), `selectedId` (from props), and `onSelect` (from props). If the internal array variable is named differently (e.g., `filteredConversations`), use that — the point is to navigate through what the USER sees, not the unfiltered list. Read the file first.

    ---

    **Step 2 — Add `Esc` handler to `inbox-layout.tsx`** for contact-panel drawer close at <1280px. The drawer open/close state variable name will depend on current inbox-layout implementation (likely `isContactPanelOpen`, `rightPanelOpen`, or similar — read the file first). The handler:

    ```tsx
    useEffect(() => {
      if (!v2) return

      function handleKeyDown(e: KeyboardEvent) {
        if (e.key !== 'Escape') return

        const target = e.target as HTMLElement | null
        if (!target) return

        // Guard: don't hijack when focus is inside input/textarea/contenteditable
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return

        // Scope: only fire when focus is inside the /whatsapp module
        if (!target.closest('[data-module="whatsapp"]')) return

        // Only act when the viewport is narrow enough for the drawer mode (<1280px)
        // AND the drawer is currently open.
        if (typeof window !== 'undefined' && window.innerWidth < 1280 && <drawerOpenState>) {
          e.preventDefault()
          <closeDrawerHandler>()
        }
        // Otherwise: no-op. Do NOT blur textarea, do NOT close dropdowns (Radix handles Esc itself).
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [v2, <drawerOpenState>, <closeDrawerHandler>])
    ```

    Replace `<drawerOpenState>` and `<closeDrawerHandler>` with the actual state / setter names from the current `inbox-layout.tsx`. If no drawer-close handler exists, compose one inline (e.g., `setIsContactPanelOpen(false)`).

    **CRITICAL:**
    - Do NOT add any logic that closes `rightPanel === 'agent-config'` or any other panel inside this Esc handler — `agent-config-slider.tsx` is intentional-slate (CONTEXT + PATTERNS §14) and its close behavior is out-of-scope.
    - Do NOT add a textarea-blur fallback — message-input.tsx's existing onKeyDown handles composer behavior, and Esc in a textarea is standard browser behavior (does nothing by default, which is fine).

    ---

    **DO NOT MODIFY (D-19):**
    - `conversations` array, its order, or the way it's loaded
    - `onSelect` callback logic
    - Any realtime/mutation code
    - `message-input.tsx` (unchanged — composer blur is untouched)
    - `agent-config-slider` / any modal close machinery
  </action>
  <verify>
    <automated>grep -q "e.key === '\['" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "e.key === ']'" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "e.key === 'Escape'\|e.key !== 'Escape'" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && grep -q "data-module=\"whatsapp\"" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q "data-module=\"whatsapp\"" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx && npx tsc --noEmit 2>&1 | grep -E "inbox-layout|conversation-list" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "e.key === '\['" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (explicitly in conversation-list.tsx).
    - `grep -q "e.key === ']'" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (explicitly in conversation-list.tsx).
    - `grep -q "e.key === 'Escape'\|e.key !== 'Escape'" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` (explicitly in inbox-layout.tsx).
    - `!` `grep -q "e.key === 'Escape'" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (Esc NOT in conversation-list — scope clarity).
    - `!` `grep -q "e.key === '\['" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` (`[` NOT in inbox-layout — scope clarity).
    - Scope guard `target.closest('[data-module="whatsapp"]')` present in BOTH handlers.
    - Input-focus guard `tagName === 'input' | 'textarea'` present in BOTH handlers.
    - `npx tsc --noEmit` clean.
    - `useEffect` deps array includes `v2` + whatever state/callbacks are read inside (avoids stale closure).
    - `src/app/(dashboard)/whatsapp/components/message-input.tsx` was NOT modified by this task (composer behavior untouched).
  </acceptance_criteria>
  <done>Keyboard shortcuts committed to specific files: `[` / `]` in conversation-list.tsx, `Esc` for drawer in inbox-layout.tsx. Each file's handler is scoped + input-guarded. Composer textarea behavior unchanged.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: ARIA roles (role="list" / role="log" / aria-live) + connection error banner + portal sweep for in-scope components</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-list.tsx, src/app/(dashboard)/whatsapp/components/chat-view.tsx, src/app/(dashboard)/whatsapp/components/chat-header.tsx, src/app/(dashboard)/whatsapp/components/contact-panel.tsx, src/app/(dashboard)/whatsapp/components/inbox-layout.tsx, src/app/(dashboard)/whatsapp/components/conversation-item.tsx, src/app/(dashboard)/whatsapp/components/message-input.tsx</files>
  <read_first>
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §12.2 ARIA contract
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `## Shadcn Primitive Inheritance Map` (rows DropdownMenu / Popover / Select / HoverCard + Pitfall 2)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md §14 intentional-slate list + portal primitive table
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx (items container)
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx (thread container)
    - Check `useConversations` / `useMessages` return shape for any `error` or `connectionError` signal
  </read_first>
  <action>
    **Step 1 — conversation-list.tsx: add `role="list"` to the items container.** Find the scrollable container that wraps the `<ConversationItem>` map. Add:
    ```tsx
    <div
      role="list"
      aria-label="Lista de conversaciones"
      className="..."
    >
      {conversations.map(...)}
    </div>
    ```
    Apply UNCONDITIONALLY (universal a11y — these attributes don't visually affect anything).

    **Step 2 — chat-view.tsx: add `role="log"` + `aria-live="polite"` to the thread container.** Find the `.chat-background` div or the scrollable messages container. Add:
    ```tsx
    <div
      role="log"
      aria-live="polite"
      aria-label="Hilo de mensajes"
      ref={parentRef}
      className="... existing classes ..."
    >
      ...
    </div>
    ```
    Apply UNCONDITIONALLY.

    **Step 3 — Connection error banner (D-17) — CONDITIONAL on signal availability.**

    Check `useConversations` and `useMessages` hooks: do they expose any of `error`, `isError`, `connectionError`, `isConnected`? If YES, consume the signal and render the editorial banner at top of chat-view when v2:
    ```tsx
    import { AlertTriangle } from 'lucide-react'

    // If connectionError signal is exposed by useMessages or useConversations:
    {connectionError && v2 && (
      <div
        role="alert"
        aria-live="assertive"
        className="flex items-start gap-2 px-5 py-3 border-b-[var(--ink-1)] bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border-l-[3px] border-l-[var(--rubric-2)]"
      >
        <AlertTriangle className="h-5 w-5 text-[var(--rubric-2)] flex-shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            No pudimos conectar con WhatsApp Business.
          </p>
          <p className="text-[12px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
            Verifique la conexión con Meta o reintente en unos minutos.
          </p>
        </div>
        <button
          type="button"
          onClick={/* existing retry callback if any, else noop */}
          className="text-[13px] font-semibold text-[var(--ink-1)] border border-[var(--border)] bg-[var(--paper-0)] rounded-[4px] px-3 py-1 hover:bg-[var(--paper-3)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Reintentar
        </button>
      </div>
    )}
    ```

    If NO connection signal exists in the hooks, SKIP this substep and document in SUMMARY: "D-17 channel-down banner deferred — current hooks do not expose a connection-state signal. Adding it would require modifying `useConversations`/`useMessages` which is out-of-scope per D-19. Follow-up task: extend hooks with `isConnected` boolean."

    ---

    **Step 4 — Portal sweep for in-scope editorial components (extension to Plan 04 Task 3 — closes ISS-04).**

    **Step 4.1 — Run the sweep grep:**
    ```bash
    grep -rnE 'DropdownMenu|Popover|Select|HoverCard' \
      src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx \
      src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx \
      src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx \
      src/app/\(dashboard\)/whatsapp/components/chat-view.tsx \
      src/app/\(dashboard\)/whatsapp/components/chat-header.tsx \
      src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx \
      src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx \
      src/app/\(dashboard\)/whatsapp/components/message-input.tsx \
      2>/dev/null
    ```

    Capture the output. The sweep explicitly EXCLUDES intentional-slate files per CONTEXT + PATTERNS §14:
    - `new-conversation-modal.tsx`
    - `template-send-modal.tsx`
    - `view-order-sheet.tsx`
    - `create-contact-sheet.tsx`
    - `create-order-sheet.tsx`
    - `agent-config-slider.tsx`
    - `emoji-picker.tsx`
    - `quick-reply-autocomplete.tsx`

    (Match to `assign-dropdown.tsx` — already re-rooted in Plan 04 Task 3 — is expected; it's a confirming hit, not a new action item.)

    **Step 4.2 — For each remaining hit, categorize:**

    (a) **Hit inside an in-scope editorial component rendering a Radix portal** (DropdownMenu / Popover / Select / HoverCard — typically `<XxxContent>` somewhere in the JSX):
       - If the shadcn wrapper exposes a `*Portal` sub-component with `container` prop (Radix always does; shadcn re-exports are sometimes hidden — import `<XxxPortal>` from `@radix-ui/react-<xxx>` directly if the shadcn file doesn't re-export it), wrap `<XxxContent>` with `<XxxPortal container={themeContainerRef.current ?? undefined}>`.
       - Use the same `themeContainerRef` pattern established in Plan 04 Task 1 (chat-header sets the ref via `document.querySelector('[data-module="whatsapp"]')` in a `useEffect`). For components that don't already have a ref, create one using the same pattern.
       - The re-rooting is gated: only active when `v2 && containerRef.current` — when `!v2`, the default portal is used (current behavior preserved byte-identical).

    (b) **Hit is a mere import/type reference without rendering a Radix portal** (e.g., importing `DropdownMenuTrigger` type for prop typing): no action.

    (c) **Hit is in an intentional-slate component** (shouldn't match after the exclusion list above, but double-check): no action — slate is intentional.

    (d) **Hit is technically inside scope but the portal wrapping is out of this plan's reach** (e.g., requires invasive refactor of a 300+ LOC component): document as deferred in the SUMMARY with explicit justification (component name, portal primitive, reason — e.g., "contact-panel.tsx uses Radix Select for stage-picker at line X; re-rooting requires rewrapping at 4 callsites. Deferred to a follow-up — current slate look is acceptable per PATTERNS §14 row `Select`").

    **Step 4.3 — Document the sweep result in the SUMMARY + Plan 06 Task 2 intentional-slate list.**

    Append to `05-SUMMARY.md`:
    ```markdown
    ## Portal Sweep Result (Plan 05 Task 4 Step 4)

    **Grep command:** (see Step 4.1)

    **Hits in-scope:**
    | File | Primitive | Action | Notes |
    |------|-----------|--------|-------|
    | <file> | <DropdownMenu / Popover / ...> | wired containerRef / deferred / n/a | <justification> |
    ...

    **Intentional-slate confirmations (no action required):**
    - emoji-picker.tsx (PopoverContent — CONTEXT modal exclusion)
    - quick-reply-autocomplete.tsx (DropdownMenu — CONTEXT)
    - agent-config-slider.tsx (Sheet — CONTEXT)
    - new-conversation-modal.tsx / template-send-modal.tsx / view-order-sheet.tsx / create-*-sheet.tsx (Dialog/Sheet — CONTEXT)
    ```

    Also update Plan 06 Task 2 (DoD QA section's intentional-slate documentation) with the sweep findings so auditors see the full picture in the final QA step.

    ---

    **DO NOT MODIFY (D-19):** any hook internals. Only consume existing signals. Do NOT touch intentional-slate components.
  </action>
  <verify>
    <automated>grep -q 'role="list"' src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx && grep -q 'role="log"' src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && grep -q 'aria-live="polite"' src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && npx tsc --noEmit 2>&1 | grep -E "conversation-list|chat-view|chat-header|contact-panel|inbox-layout|conversation-item|message-input" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'role="list"' src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` (universal).
    - `grep -q 'aria-label="Lista de conversaciones"' src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx`.
    - `grep -q 'role="log"' src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (universal).
    - `grep -q 'aria-live="polite"' src/app/\(dashboard\)/whatsapp/components/chat-view.tsx`.
    - `grep -q 'aria-label="Hilo de mensajes"' src/app/\(dashboard\)/whatsapp/components/chat-view.tsx`.
    - Error banner: EITHER it's rendered with `role="alert"` + `aria-live="assertive"` + 'No pudimos conectar con WhatsApp Business' text (if connection signal available), OR the SUMMARY explicitly documents the deferral.
    - Portal sweep executed — grep output captured, table in SUMMARY filled with at least one row per hit (wired / deferred / n/a), intentional-slate confirmations listed.
    - For each sweep hit categorized as "wired containerRef": the component file passes `container={<ref>.current ?? undefined}` on its Radix `*Portal` wrapper, gated by `v2 && <ref>.current` so non-v2 behavior is byte-identical.
    - For each sweep hit categorized as "deferred": explicit written justification in SUMMARY (component + primitive + reason).
    - `npx tsc --noEmit` clean for all files listed in files_modified.
  </acceptance_criteria>
  <done>Universal ARIA roles added to list and thread containers. Error banner wired if signal available, otherwise deferred with note. Portal sweep executed across 8 in-scope components; each hit either re-rooted into theme-editorial or documented as deferred with justification. Plan 06 Task 2 intentional-slate list updated with sweep findings.</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. `npx tsc --noEmit 2>&1 | grep -E "conversation-list|conversation-item|chat-view|inbox-layout|message-input|contact-panel|chat-header" | (! grep -E "error|Error")` returns 0.
2. Manual smoke (flag ON):
   - Throttle network in DevTools → see 6 skeleton items in list, 3 skeleton bubbles in thread during load.
   - If snooze field exists: open a snoozed conversation in DB (manually `UPDATE conversations SET <field> = NOW() + INTERVAL '1 hour' WHERE id = '...'`) → item renders at opacity 0.6, Moon icon visible, "snoozed hasta 14:00" pill below.
   - If snooze field doesn't exist: confirm DEFERRED-D18.md exists + plan-06 LEARNINGS instructed.
   - Press `[` with focus in the inbox → previous conversation selected (wraps to last if at first).
   - Press `]` → next selected (wraps to first if at last).
   - Press `Esc` at <1280px with contact-panel drawer open → drawer closes.
   - Press `Esc` with focus in composer → composer behavior unchanged (default browser, textarea stays focused).
   - Press `/` with focus anywhere but input → focuses search (verified in Wave 1).
3. Screen reader test:
   - Focus list items → announced as "Lista de conversaciones, [1 de N], Juan Carlos, último mensaje hace 3 min".
   - Focus thread → "Hilo de mensajes".
   - New message arrives → thread announces it via aria-live polite.
4. Portal sweep verification: DevTools inspect — each re-rooted Radix portal's DOM node is a child of `.theme-editorial`, not `document.body`.
5. axe-core: `npx @axe-core/cli http://localhost:3020/whatsapp` → zero NEW serious/critical violations compared to flag-off baseline.
6. Git diff for D-19 targets: zero changes in hooks, actions, domain, webhooks.
</verification>

<success_criteria>
- All 4 tasks pass automated verify.
- Build clean.
- Loading skeletons per UI-SPEC §10.4 (D-14).
- Snoozed state per D-18 — either wired (Step 2a) OR DEFERRED-D18.md created + LEARNING flagged (Step 2b). Silent defer is rejected.
- Keyboard shortcuts committed: `[`/`]` in conversation-list.tsx, `Esc` in inbox-layout.tsx (drawer close at <1280px). Composer textarea unchanged.
- ARIA roles applied universally per UI-SPEC §12.2.
- Connection error banner per D-17 OR deferred with explicit note.
- Portal sweep executed across 8 in-scope components — each hit either re-rooted or explicitly deferred in SUMMARY.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-conversaciones/05-SUMMARY.md` with:
- Commits (one per task)
- Task 2 result: which branch applied (2a field-found-and-wired vs 2b deferred), discovery grep evidence, field name if 2a, confirmation of DEFERRED-D18.md if 2b
- Task 3 placement confirmations (`[`/`]` in conversation-list; `Esc` in inbox-layout)
- Task 4 portal sweep table (file / primitive / action / notes) — see Step 4.3 template
- Instruction for Plan 06 Task 2 to update its intentional-slate documentation with the sweep findings
- axe-core scan results (before/after diff)
- Handoff to Wave 5: everything functional + accessible; next is DoD QA + pixel-diff + docs.
</output>
</output>
