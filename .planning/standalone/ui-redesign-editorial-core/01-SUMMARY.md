---
phase: ui-redesign-editorial-core
plan: 01
subsystem: whatsapp-inbox-reskin
tags: [reskin, editorial-v3, conversaciones, verbatim-port, regla-6, mx-tag]
requires:
  - ".theme-editorial-v3 scoped CSS (light + dark) — Plan 00"
  - "getIsEditorialV3Enabled per-workspace flag — Plan 00"
  - ".theme-editorial-v3 wired on dashboard <main> wrapper — Plan 00"
provides:
  - "Conversaciones (/whatsapp) ported to editorial v3: .inbox 3-col grid, .conv rows, .msg Helvetica-Neue bubbles, .ficha contact card with .ped-card"
  - "InboxV3Provider/useInboxV3 context (mirror of inbox-v2-context) gating the v3 markup"
  - "Topbar (.topbar) eyebrow + h1 + Asignar/Nueva conversación actions"
affects:
  - "src/app/(dashboard)/whatsapp/page.tsx (resolves + threads v3 flag)"
  - "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (additive v3 branch — legacy v2 path untouched)"
tech-stack:
  added: []
  patterns:
    - "Additive v3 render branch gated by useInboxV3() — legacy + v2 paths byte-identical (Regla 6)"
    - "Verbatim port: copy mock semantic HTML + class strings 1:1, rewire data only (D-08)"
    - "Tags via MxTag (mx-tag--*), never legacy .tg.* nor shadcn Badge (D-09)"
    - "Distinct scope class isolation: .theme-editorial-v3 vs LIVE .theme-editorial (D-05)"
key-files:
  created:
    - src/app/(dashboard)/whatsapp/components/inbox-v3-context.tsx
  modified:
    - "src/app/(dashboard)/whatsapp/page.tsx"
    - "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
    - "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
    - "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
    - "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
    - "src/app/(dashboard)/whatsapp/components/day-separator.tsx"
    - "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
    - "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
    - "src/app/(dashboard)/whatsapp/components/message-input.tsx"
    - "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
decisions:
  - "Added inbox-v3-context + threaded v3 through page → inbox-layout (Rule 3 blocking — the .inbox container + v3 gating must live somewhere; inbox-layout was the only site that holds the real 3-col layout, and the plan says 'apply on the inbox container that already holds the real layout'). All v3 branches are ADDITIVE; the legacy v2/.theme-editorial path is byte-identical (Regla 6)."
  - "In v3 the .ficha (ContactPanel) is rendered always-visible as the 3rd grid column to match the mock; the agent-config slider replaces it when opened, and the debug panel still splits the thread via Allotment — preserving every existing affordance."
  - "Used pnpm exec tsc --noEmit for typecheck (no `typecheck` npm script exists — same as Plan 00)."
metrics:
  duration: ~20min
  completed: 2026-06-05
  tasks: 3
  files: 11
  commits: 3
---

# Phase ui-redesign-editorial-core Plan 01: Conversaciones Editorial Port Summary

Ported the WhatsApp · Conversaciones screen (`/whatsapp`) to the editorial v3 design — the verbatim `ui_kits/conversaciones/index.html` 3-column inbox (`.inbox` 340px / 1fr / 300px), `.conv` rows, Helvetica-Neue `.msg` bubbles, day-separator `.daysep` pill, editorial `.composer`, and the `.ficha` contact card with the order rendered as a `.ped-card` — all gated behind the new `ui_editorial_v3` flag so production renders byte-identical until an explicit flip. Every Supabase query, server action, realtime subscription, and event handler is preserved; only markup + class strings changed (D-08). Tags use the official `MxTag` / `mx-tag--*` system throughout (D-09), never legacy `.tg.*` nor shadcn `Badge`.

## What Was Built

1. **`inbox-v3-context.tsx`** — `InboxV3Provider` / `useInboxV3()`, a structural mirror of `inbox-v2-context`. Default `false` (fail-closed, Regla 6). Gates the NEW editorial-v3 markup, distinct from the LIVE `.theme-editorial` (`ui_inbox_v2`) path.
2. **`page.tsx`** — resolves `getIsEditorialV3Enabled(workspaceId)` in the existing `Promise.all`, threads `v3` into `InboxLayout`.
3. **`inbox-layout.tsx`** — additive `if (v3)` render branch: the `.topbar` (eyebrow "Agentes · Bandeja" + h1 "Conversaciones" + `<em>` count + "Asignar" / `.btn.pri` "Nueva conversación") plus the `.inbox` 3-column grid (ConversationList | ChatView | ContactPanel/AgentConfigSlider). Debug panel still splits the thread via Allotment. The legacy `InboxV2Provider` + `v2 && 'theme-editorial'` path is **untouched**.
4. **`conversation-item.tsx`** — `.conv` verbatim row (grid 40px/1fr/auto): `.av` initials, `.mid` (`.nm` + `.pv`), `.meta` (mono `.tm` + rubric `.badge`), `.row3` (agent pill + MxTag tags). `on` for active, `unread` for unread. Channel icons (FB/IG) + order emoji + bot/client overlays preserved.
5. **`conversation-list.tsx`** — `.conv-col` (`.conv-head` search + `.conv-filters` chips Todas/Sin leer/Mías/Agente IA/Cerradas wired to the existing filter/agentFilter state + `.conv-list`). The keyboard shortcuts (`/`, `[`, `]`) and Radix portal re-rooting now also fire under v3. Exposes the new-conversation modal trigger to the topbar.
6. **`message-bubble.tsx`** — `.msg` verbatim bubble (Helvetica Neue via CSS): `in`/`out`/`out.agent` variants wired to direction/sender, `.agent-mark` label, mono `.tm` timestamp, `.tmpl` template marker. Status icon preserved; media/location/interactive/template content render unchanged.
7. **`day-separator.tsx`** — `.daysep` pill (Hoy/Ayer/fecha) under v3; date-grouping logic unchanged.
8. **`chat-view.tsx`** — `.thread` column wrapper + paper background; virtualizer/auto-follow/realtime-typing all intact; day-sep uses the v3 `DaySeparator`.
9. **`chat-header.tsx`** — `.th-head` verbatim (`.av` + `.who` `.nm`/`.ph` + `.th-actions`). All actions kept: agent toggles, BOLD button, GoDentist confirm, AssignDropdown, mark-read, archive/"Cerrar chat", CRM link, agent-config, debug, panel toggle, tag input. Edit-name + confirm-appointment dialogs shared across branches.
10. **`message-input.tsx`** — `.composer` with serif `.field` placeholder + `.btn.pri send`. Send/media/template/quick-reply/interactive flows untouched.
11. **`contact-panel.tsx`** — `.ficha` verbatim: `.av-lg` (64px), centered name/phone, `.ficha-actions` (Ver en CRM / Tarea), `.sect` sections (Etiquetas via MxTag cloud, Datos `dl/dt/dd`, Pedidos recientes), `.ped-card` order card (`.src` pill + mono `.val` + `.foot` MxTag tags), `.ped-vertodos` "Ver todos", `.btn.pri` "Crear pedido". Stage popover, view-order, recompra, create-order/contact sheets all preserved.

## Key Decisions

- **v3 flag plumbing via inbox-layout (Rule 3 — blocking).** The plan's `files_modified` listed `page.tsx` + the components but not `inbox-layout.tsx`; however the `.inbox` 3-col grid container and the v3 gating must physically exist somewhere, and the plan's action text says "Apply on the page/inbox container that already holds the real layout" — that is `inbox-layout.tsx`. The change is purely **additive** (a new `if (v3)` branch + a new `InboxV3Provider`); the legacy v2/`.theme-editorial` rendering is byte-identical (verified). Tracked as `[Rule 3 - blocking] add v3 context + inbox-layout v3 branch`.
- **Ficha always-visible in v3** to match the mock's fixed 3-column grid; the agent-config slider replaces it when opened, debug panel splits the thread.
- **Tag-name → MxTag-variant mapping** (small heuristic) since the real tags carry color, not editorial variant; falls back to `mx-tag--ink` (neutral).

## Deviations from Plan

### Auto-fixed / blocking

**1. [Rule 3 - blocking] v3 context + inbox-layout v3 branch + page flag**
- **Found during:** Task 1.
- **Issue:** The `.inbox` 3-column grid container and a way for leaf components to know "is v3 on?" did not exist. The components had a `v2` context but no `v3` one.
- **Fix:** Created `inbox-v3-context.tsx`, resolved `getIsEditorialV3Enabled` in `page.tsx`, threaded `v3` into `inbox-layout.tsx` which renders an additive `.topbar` + `.inbox` grid branch. Legacy v2 path untouched (Regla 6).
- **Files:** inbox-v3-context.tsx (new), page.tsx, inbox-layout.tsx.
- **Commit:** 80e870a1.

**2. [Rule 3 - blocking] use `pnpm exec tsc --noEmit` for typecheck**
- The plan's verify steps reference `pnpm typecheck`, but no such npm script exists (only dev/build/lint/test). Used `pnpm exec tsc --noEmit` (same as Plan 00).

## Authentication Gates

None.

## Verification Results

- **Typecheck:** `pnpm exec tsc --noEmit` — my changed files are clean; exactly **4 pre-existing errors** remain (`conversations.test.ts`, `instagram/webhook-handler.test.ts`, `messenger/webhook-handler.test.ts`) — identical to the Plan 00 baseline (`deferred-items.md`), all in unrelated test files (out of scope).
- **Task 1 gate:** `grep -Eq "['\"]conv['\" ]" conversation-item.tsx` → PASS; `.conv` row class present, MxTag used (8 refs), no `<Badge>` in the v3 row.
- **Task 2 gate:** `grep -Eq "Helvetica Neue|['\"]msg['\" ]" message-bubble.tsx` → PASS; `daysep` present in day-separator.tsx.
- **Task 3 gate:** `grep -Eq "ficha|ped-card" contact-panel.tsx` → PASS; `grep -Eq "MxTag|mx-tag" contact-panel.tsx` → PASS.
- **D-09 (no legacy tags in v3):** `grep` for legacy `.tg.*` classes in the v3 paths of conversation-item / contact-panel / chat-header → **0 matches**.
- **Regla 6 / D-05 (isolation):** `git diff 505fcd37 HEAD -- src/app/globals.css` is **empty** (legacy `.theme-editorial` block byte-frozen). The legacy `InboxV2Provider v2={v2}` + `v2 && 'theme-editorial'` render path in inbox-layout.tsx is intact. v3 markup only renders when `ui_editorial_v3` is on (default OFF → byte-identical).
- **ESLint (touched files):** 0 new findings from the v3 code; the 2 `set-state-in-effect` errors + 3 unused-var warnings flagged are all **pre-existing** (original effect bodies / pre-existing imports I did not author), out of scope per the SCOPE BOUNDARY.

## Known Stubs

None. The v3 branches render real data through the same wiring as the v2/legacy paths. The topbar `<em>` count ("N abiertas · M sin leer") is derived from the server-provided `initialConversations` (presentational summary; the live list updates via realtime in ConversationList) — intentional, not a stub.

## Visual Fidelity Note

Per the plan, the ≥95% pixel-fidelity gate (light + dark, side-by-side vs the mock) is **deferred to Wave 3 (Plan 04)** with the Playwright + pixelmatch harness. This plan's gate was per-commit typecheck + preserved data wiring (git-diff review), both satisfied.

## Commits

- `80e870a1` feat(ui-redesign-editorial-core-01): portar shell inbox + lista/fila de conversaciones a editorial v3
- `12c3dc0f` feat(ui-redesign-editorial-core-01): portar hilo de chat a editorial v3
- `5e00486a` feat(ui-redesign-editorial-core-01): portar ficha de contacto con card de pedido a editorial v3

## Self-Check: PASSED

Created files verified present:
- FOUND: src/app/(dashboard)/whatsapp/components/inbox-v3-context.tsx
- FOUND: .planning/standalone/ui-redesign-editorial-core/01-SUMMARY.md

Commits verified in git log:
- FOUND: 80e870a1, 12c3dc0f, 5e00486a
