---
phase: ui-redesign-editorial-core
plan: 01
type: execute
wave: 2
depends_on: [00]
files_modified:
  - src/app/(dashboard)/whatsapp/page.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
  - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
  - src/app/(dashboard)/whatsapp/components/message-input.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/whatsapp/components/day-separator.tsx
  - src/app/(dashboard)/whatsapp/components/filters
autonomous: true
requirements: [D-08, D-09]

must_haves:
  truths:
    - "With the v3 flag on, /whatsapp renders the editorial 3-column inbox (340px / 1fr / 300px) matching ui_kits/conversaciones/index.html"
    - "Chat bubbles render in Helvetica Neue (NOT serif); .msg.in is paper-0 + border, .msg.out is ink-1 fill"
    - "The contact card renders the order as a card (.ped-card) with src pill + mono value + footer tags"
    - "All existing data wiring (Supabase, server actions, realtime, event handlers) is preserved unchanged — only markup + classes changed"
    - "Tags use the official mx-tag--* system (via MxTag), not legacy .tg.* and not shadcn Badge"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      provides: "Editorial .conv row (grid 40px/1fr/auto, .av initials, name/preview/meta, .conv.on active spine)"
      contains: "conv"
    - path: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      provides: ".msg bubble in Helvetica Neue with in/out/agent variants + mono timestamp"
      contains: "msg"
    - path: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      provides: ".ficha contact card with .ped-card order card + sections"
      contains: "ficha"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      to: ".theme-editorial-v3 .conv in globals.css"
      via: "className 'conv' + 'on' for active row"
      pattern: "conv"
    - from: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      to: "MxTag mx-tag--* classes"
      via: "import MxTag, render tag cloud"
      pattern: "MxTag|mx-tag"
---

<objective>
Verbatim-port the WhatsApp · Conversaciones content area markup + classes onto the REAL components so it renders identical to `ui_kits/conversaciones/index.html` under the `.theme-editorial-v3` scope, while preserving ALL existing data wiring (Supabase queries, server actions, realtime subscriptions, event handlers).

Purpose: Conversaciones is the most distinctive of the 3 screens (3-column inbox, Helvetica-Neue bubbles, order card). It is also the screen whose LEGACY editorial v2 is LIVE in Somnio — this port operates on the SAME real components but under the NEW v3 scope class wired in Plan 00 at the `<main>` wrapper; the legacy `.theme-editorial` path at `inbox-layout.tsx:154` (gated by ui_inbox_v2) is NOT touched. When the v3 flag is OFF (default), the components render exactly as today.

Output: the Conversaciones screen ported to the editorial v3 markup, verified against the canonical mock in Wave 3.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-core/UI-SPEC.md
@.planning/standalone/ui-redesign-editorial-core/RESEARCH.md

<canonical-mock>
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html  <!-- VISUAL SOURCE OF TRUTH: copy semantic HTML + class strings 1:1 -->
.planning/standalone/ui-redesign-editorial-core/handoff/src/app/(dashboard)/whatsapp/components/  <!-- 7 reference TSX (VISUAL only, NOT drop-in — D-08) -->
</canonical-mock>

<interfaces>
<!-- Reuse as-is; the component is scope-agnostic and already emits mx-tag--{variant} classes. -->
From src/app/(dashboard)/whatsapp/components/mx-tag.tsx:

    export function MxTag({ variant, icon, children, className, ...rest }):
      variant: 'rubric'|'gold'|'indigo'|'verdigris'|'ink'; icon?: LucideIcon; children: ReactNode
    // renders <span class="mx-tag mx-tag--{variant}">. Resolves under .theme-editorial-v3
    // (Plan 00 authored the v3-scoped CSS). No CVA — keep static classes.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Port the inbox shell + conversation list/row (.inbox / .conv / .chip filters)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html (the inbox grid `.inbox` 340px/1fr/300px, `.conv-col`, `.conv` row anatomy, `.chip` filter row, topbar — copy class strings VERBATIM)
    - src/app/(dashboard)/whatsapp/page.tsx + components/conversation-list.tsx + conversation-item.tsx + filters/ (the REAL components — preserve every prop, server action, realtime handler)
    - src/app/globals.css block authored in Plan 00 (the `.theme-editorial-v3 .inbox/.conv/.chip` rules these classes resolve against)
    - UI-SPEC §6.1 (Conversaciones per-screen contract) + §0 golden rule (port verbatim, NOT reinterpret onto shadcn — Pitfall 3, the 35% failure mode)
    - RESEARCH §Pattern 4 (verbatim-port loop)
  </read_first>
  <action>
    Port the inbox shell and conversation list per UI-SPEC §6.1. Copy the mock's semantic HTML structure and class strings 1:1 into the real JSX; do NOT translate to shadcn `<Card>/<Badge>` primitives (Pitfall 3 — that produced 35% fidelity; verbatim port produced 89%). Rewire ONLY data — keep existing props, server actions, realtime subscriptions, event handlers (D-08).
    - Inbox grid `.inbox`: 3 columns `340px 1fr 300px` — `.conv-col` (list) | `.thread` (chat) | `.ficha` (contact). Apply on the page/inbox container that already holds the real layout.
    - Conversation row `.conv`: grid `40px 1fr auto`, 40px circular `.av` (EB Garamond initials from the real contact name), name (Inter 13/600; unread → 700), preview `.pv` (ink-3; unread → ink-2/500), right meta column (mono `.tm` timestamp + rubric `.badge` unread count), `.row3` for agent pill + tags. Active row: `.conv.on` (paper-3 bg + 2px rubric left spine). Bind `on` to the existing selected-conversation state.
    - Filter chips `.chip` row (Todas / Sin leer / Mías / Agente IA / Cerradas); active `.chip.on` = ink-1 fill — wire to the existing filter state in `filters/`.
    - Topbar: eyebrow "Agentes · Bandeja", `h1` "Conversaciones" + `<em>` count subtitle; actions "Asignar" + `.btn.pri` "Nueva conversación" (preserve existing handlers / modal triggers).
    - Tags in the row use MxTag (`mx-tag--*`), NOT legacy `.tg.*`, NOT Badge (D-09).
    Preserve all realtime/optimistic-update logic untouched.
  </action>
  <verify>
    <automated>grep -Eq "['\"]conv['\" ]" "src/app/(dashboard)/whatsapp/components/conversation-item.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `conversation-item.tsx` JSX uses the mock's `conv` row class (and `on` for active) — NOT a shadcn `<Card>` for the row
    - The inbox container expresses the 3-column `340px 1fr 300px` structure (`.inbox` class or equivalent grid wired to the v3 CSS)
    - Filter chips use `chip` / `chip.on` classes wired to the existing filter state
    - The row uses `MxTag` (or `mx-tag--*` classes) for tags — `grep` shows NO `<Badge` import used for conversation-row tags
    - No data wiring removed: existing props, server-action imports, realtime subscription, and selection handlers remain (git diff shows markup/className changes, not logic deletions)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Inbox shell + conversation rows + filter chips render the editorial markup; data wiring intact; tags via MxTag; typecheck green.</done>
</task>

<task type="auto">
  <name>Task 2: Port the chat thread (bubbles in Helvetica Neue, day-sep, composer)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html (the `.thread` column: `.msg.in/.out/.out.agent`, `.tm`/`.tmpl` markers, `.daysep`, `.composer`/`.field`/`.btn.pri` — copy verbatim)
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx + chat-header.tsx + message-bubble.tsx + message-input.tsx + day-separator.tsx (REAL components — preserve send action, optimistic update, media rendering, template flow)
    - UI-SPEC §6.1 (bubbles MUST be Helvetica Neue 14px/1.45; out.agent uppercase agent-mark; mono 9px timestamp) + §9 (copy contract)
  </read_first>
  <action>
    Port the chat thread per UI-SPEC §6.1, verbatim from the mock:
    - Bubbles `.msg` MUST use `font-family:'Helvetica Neue', Helvetica, Arial, var(--font-sans)`, 14px/1.45 (verification checklist §5 — bubbles are Helvetica Neue, NOT serif). `.msg.in` = paper-0 + border, left-aligned, `border-bottom-left-radius:1px`; `.msg.out` = ink-1 fill / paper-0 text, right-aligned, `border-bottom-right-radius:1px`; `.msg.out.agent` = ink-2 bg + uppercase `.agent-mark` label. Wire in/out/agent to the existing message direction/sender fields. Mono timestamp `.tm` 9px opacity .65; template marker `.tmpl` mono 9px opacity .5 — bind to existing message metadata.
    - Day separator `.daysep` pill — apply to the existing day-separator component (preserve its date-grouping logic).
    - Composer `.composer`: serif `.field` placeholder + ink `.btn.pri` "Enviar" — preserve the existing send server action, optimistic insert, quick-reply autocomplete, media/template/interactive-composer buttons and their handlers.
    - chat-header: keep existing actions (assign, close chat, window indicator) — restyle to editorial chrome (`.btn`, `.icon-btn`).
    Do NOT touch message-send logic, media preview, or template send modal behavior — markup/className only.
  </action>
  <verify>
    <automated>grep -Eq "Helvetica Neue|['\"]msg['\" ]" "src/app/(dashboard)/whatsapp/components/message-bubble.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `message-bubble.tsx` renders the `msg` class with `in`/`out`/`out agent` variants wired to message direction/sender (NOT shadcn primitives for the bubble)
    - Bubble typography resolves to Helvetica Neue (either the className relies on the v3 `.msg` rule authored in Plan 00, or the component sets the family) — verifiable in Wave 3 dark/light shots
    - The composer keeps the existing send server action + quick-reply + media/template buttons (no handler removed)
    - `day-separator.tsx` uses the `daysep` pill markup; its date-grouping logic is unchanged
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Chat thread ported: Helvetica-Neue bubbles, day-sep pill, editorial composer; send/media/template logic intact; typecheck green.</done>
</task>

<task type="auto">
  <name>Task 3: Port the contact card (.ficha) with order card (.ped-card)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html (the `.ficha` column: `.av-lg`, `.ficha-actions`, `.sect` with uppercase h3 eyebrows + hairline top border, `dl/dt/dd` grid, tag cloud, `.ped-card` order card, `.ped-vertodos`, `.btn.pri` "Crear pedido", `.note` — copy verbatim)
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx (REAL component — preserve Ver-en-CRM link, Tarea action, order data, create-order/view-order sheets, notes)
    - src/app/(dashboard)/whatsapp/components/mx-tag.tsx (reuse MxTag for the tag cloud + order footer tags)
    - UI-SPEC §6.1 (contact card contract — order rendered AS A CARD with border + shadow-card, src pill + mono val, footer tags)
  </read_first>
  <action>
    Port the contact card `.ficha` per UI-SPEC §6.1, verbatim:
    - 64px `.av-lg`, centered name/phone (mono phone), `.ficha-actions` (Ver en CRM / Tarea — preserve existing links/handlers).
    - Sections `.sect` with uppercase `h3` eyebrows + hairline top border; `dl/dt/dd` data grid (right-aligned `dd`) bound to the real custom fields / contact data.
    - Tag cloud via MxTag (`mx-tag--*`) bound to the real contact tags (D-09).
    - Order card `.ped-card` rendered AS A CARD (border + `--shadow-card`): `.src` pill + mono `.val` total, footer tags via MxTag — bind to the real last/active order. `.ped-vertodos` underlined "Ver todos" (preserve existing view-orders navigation). `.btn.pri` "Crear pedido" (preserve the create-order sheet trigger).
    - Internal `.note` with 2px ink left border — bind to the existing notes data.
    Preserve all sheet triggers (create-contact, create-order, view-order), CRM links, and task actions — markup/className only.
  </action>
  <verify>
    <automated>grep -Eq "ficha|ped-card" "src/app/(dashboard)/whatsapp/components/contact-panel.tsx" && grep -Eq "MxTag|mx-tag" "src/app/(dashboard)/whatsapp/components/contact-panel.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `contact-panel.tsx` renders the `ficha` container and the `ped-card` order card (order rendered AS A CARD — NOT a plain list row)
    - The tag cloud + order footer tags use `MxTag` / `mx-tag--*` (NOT legacy `.tg.*`, NOT Badge)
    - Existing sheet triggers (create-order, view-order), Ver-en-CRM link, and Tarea action are preserved (no handler removed)
    - `dl/dt/dd` data grid is bound to the real contact custom fields (not mock placeholder data)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Contact card ported with order-as-card + sections + MxTag tags; all sheet/link/task wiring intact; typecheck green.</done>
</task>

</tasks>

<verification>
- Visual fidelity vs `ui_kits/conversaciones/index.html` is gated in Wave 3 (Plan 04) at ≥95%, light + dark (D-10).
- This plan's per-commit gate: `pnpm typecheck` + no removed data wiring (git diff review).
- Regla 6: this plan touches whatsapp components but the legacy `inbox-layout.tsx:154` `.theme-editorial` path is NOT edited; v3 markup only renders under the v3 scope (flag OFF by default → unchanged render).
</verification>

<success_criteria>
- /whatsapp renders the editorial 3-column inbox, Helvetica-Neue bubbles, and order-as-card under the v3 scope
- All Supabase/server-action/realtime/handler wiring preserved
- Tags via MxTag (mx-tag--*), no legacy .tg.* or Badge for these elements
- typecheck green
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-core/01-SUMMARY.md`
</output>
