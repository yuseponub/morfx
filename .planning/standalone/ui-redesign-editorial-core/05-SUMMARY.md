---
phase: ui-redesign-editorial-core
plan: 05
subsystem: editorial-v3-gap-closure
tags: [reskin, editorial-v3, gap-closure, regla-6, mx-tag, css-grid, paper-texture]
gap_closure: true
requires:
  - ".theme-editorial-v3 scoped CSS + flag + inbox/contactos/pedidos ports (Plans 00-03)"
  - "Plan 04 human-verify checkpoint UAT (operator QA on Varixcenter, flag ON)"
provides:
  - "GAP-01: inbox v3 scroll restored — grid-template-rows:minmax(0,1fr) on .inbox; composer pinned (flex:none)"
  - "GAP-02: ficha hidden by default + explicit toggle in .th-head; 2-col collapse via .inbox.no-ficha; 'Asignar' un-wired"
  - "GAP-03: pure tagColorToVariant(hex) helper (hue→editorial variant) wired into the 3 editorial screens"
  - "GAP-04: faithful paper texture (grain+fibers) over neutral white in v3 light; dark stays flat"
affects:
  - "src/app/globals.css (.theme-editorial-v3 scope only — legacy 1..1012 byte-frozen)"
  - "src/app/(dashboard)/whatsapp/components/{inbox-layout,chat-view,chat-header,contact-panel}.tsx (v3 branches)"
  - "src/app/(dashboard)/crm/contactos/components/columns.tsx + crm/pedidos/components/{columns,kanban-card}.tsx (v3 tag renders)"
tech-stack:
  added: []
  patterns:
    - "Pure framework-free color→variant helper (hex→HSL→hue bucket), unit-tested, never throws"
    - "CSS grid row track (minmax(0,1fr)) to engage children min-height:0 + overflow:auto scroll"
    - "Conditional 3rd grid column + collapse class (.no-ficha) for show/hide panel"
    - "background-image:var(--paper-grain),var(--paper-fibers) under scope; dark overrides to none"
key-files:
  created:
    - src/lib/editorial/tag-variant.ts
    - src/lib/editorial/__tests__/tag-variant.test.ts
  modified:
    - src/app/globals.css
    - "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
    - "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
    - "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
    - "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
    - "src/app/(dashboard)/crm/contactos/components/columns.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/columns.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
decisions:
  - "GAP-02: removed the topbar 'Asignar' button entirely (no topbar-level assignment flow exists; assignment lives per-conversation in the AssignDropdown of the .th-head). It was mis-wired to the ficha toggle."
  - "GAP-02: gated the ficha render on isPanelOpen — covers agent-config too (handleOpenAgentConfig already sets isPanelOpen=true), so a single gate handles both panels."
  - "GAP-03: grey/slate cutoff at s<0.20 (tailwind slate-500 s≈0.16 must read as ink); verdigris/indigo boundary at 195° so sky-blues (#0ea5e9, 199°) map to indigo and teal (#14b8a6, 173°) stays verdigris."
  - "GAP-03: kept status-by-stage-name mapping (mapStatusVariant / mapOrderStageToMxTagVariant) untouched — status pills are not DB tags carrying a real color; only color-carrying tags use the helper."
  - "GAP-04: grain alpha 0.06 (between the prior commented v3 0.035 and the design-system 0.09) — perceptible but subtle over neutral white; no beige."
metrics:
  duration: ~40min
  completed: 2026-06-05
  tasks: 5
  files: 10
  commits: 5
---

# Phase ui-redesign-editorial-core Plan 05: Gap Closure Summary

Closed the 4 gaps the operator reported during Plan 04 QA on Varixcenter (flag
ON). The overall editorial direction was approved; these are refinements of the
existing v3 work. Every fix lives entirely under the `.theme-editorial-v3` scope
/ the v3 component branches. The legacy `.theme-editorial` block (globals.css
lines 1..1012) is byte-frozen and the `ui_editorial_v3` flag stays default-OFF —
no production workspace is touched (Regla 6).

## What Was Fixed (per GAP)

### GAP-01 — inbox scroll + composer (CSS only)
Root cause: `.theme-editorial-v3 .inbox` was a grid with `grid-template-columns`
but **no** `grid-template-rows`, so the single implicit row was `auto`; the
`.thread` column grew to its content height, the `.th-body` never overflowed (no
scroll) and the `.composer` was pushed past the `overflow:hidden` clip (textbox
invisible).
- Added `grid-template-rows: minmax(0, 1fr)` to `.theme-editorial-v3 .inbox` so
  the row is constrained to the container and the children's existing
  `min-height:0` + `overflow:auto` engage.
- `.composer` → `flex:none` (non-shrinking footer of `.thread`, always pinned).
- `.ficha` → added `min-height:0` (grid child with `overflow:auto`).
- `.conv-col` / `.thread` / `.th-body` / `.conv-list` already had the right
  `min-height:0` / `overflow` — verified, no change needed.

### GAP-02 — ficha hidden by default + toggle + 2-col collapse
- `inbox-layout.tsx` (v3 branch): the `.ficha` column (ContactPanel /
  AgentConfigSlider) now renders **only when `isPanelOpen`**; the third grid
  cell is empty when closed.
- Added `.inbox.no-ficha{grid-template-columns:340px 1fr}` (v3 scope) and the
  `no-ficha` class is applied to the `.inbox` div when the panel is closed → the
  grid collapses 3-col ↔ 2-col.
- Removed the topbar **'Asignar'** button: it was mis-wired to
  `setIsPanelOpen` (toggled the ficha). No topbar-level assignment flow exists —
  per-conversation assignment is the `AssignDropdown` already present in the
  `.th-head`. The button is gone; "Nueva conversación" remains.
- Real ficha toggle in the v3 `.th-head` (`chat-header.tsx`): the existing
  contact-panel `icon-btn` now reflects open/closed state
  (`PanelRightOpen`/`PanelRightClose` + active background + `aria-pressed`) via a
  new optional `isPanelOpen` prop threaded `inbox-layout → chat-view →
  chat-header` (default false; legacy/v2 untouched).
- No auto-open-on-select: `handleSelectConversation` never opened the ficha (it
  already didn't call `setIsPanelOpen(true)` — verified). Narrow-screen
  auto-close effect preserved.

### GAP-03 — real tag color → nearest editorial variant
- New **pure** helper `src/lib/editorial/tag-variant.ts` exporting
  `tagColorToVariant(hex): MxTagVariant`. Parses `#rrggbb` / `#rgb` / no-`#` /
  whitespace / uppercase → RGB → HSL → hue bucket → nearest editorial accent
  (`rubric`/`gold`/`indigo`/`verdigris`/`success`/`ink`). Greys/slate (s<0.20)
  and near-black/near-white fall to `ink`. Never throws; null/invalid → `ink`.
- 26-case unit test (`__tests__/tag-variant.test.ts`) covering every bucket +
  fail-safe + format tolerance — **26/26 green** via
  `pnpm exec vitest run src/lib/editorial/`.
- Wired into the editorial tag renders, replacing the hardcoded name→variant
  tables:
  - `whatsapp/components/contact-panel.tsx` — `mapContactTagToMxVariant` now
    delegates to the helper (ficha tag cloud + recent-order footer pills; both
    tag shapes carry `color`).
  - `crm/contactos/components/columns.tsx` — `mapTagVariant(tag)` →
    `tagColorToVariant(tag.color)`.
  - `crm/pedidos/components/columns.tsx` — `mapOrderTagVariant` →
    `tagColorToVariant(tag.color)`; `renderEditorialOrderTags` widened to accept
    `color`. `kanban-card.tsx` consumes it via `order.tags` (carries color).
  - Status-by-stage-name pills (`mapStatusVariant`,
    `mapOrderStageToMxTagVariant`) kept as-is — status is not a DB tag with a
    color. Tags still render via `MxTag` / `mx-tag--*` (no Badge, no inline
    arbitrary colors) — only the variant SELECTION changed.

### GAP-04 — faithful paper texture in v3
- `.theme-editorial-v3` (light): re-enabled `--paper-grain` (fractalNoise
  `baseFrequency 0.85`, 2 octaves, warm-grey tint, **alpha 0.06**) +
  `--paper-fibers`, mirroring the design-system base (globals.css ~lines
  223-224 / `handoff/colors_and_type.css`), and applied
  `background-image: var(--paper-grain), var(--paper-fibers)` alongside the
  existing `background-color: var(--bg-app)`.
- `--bg-app` kept neutral white (`oklch(0.996 0.0008 95)`) — **no beige**
  (`#fcf7f0` not reintroduced).
- `.dark .theme-editorial-v3`: texture OFF — `--paper-grain:none` +
  `--paper-fibers:none` + `background-image:none` (charcoal-warm flat as before).
- The scope is on the dashboard `<main>` wrapper (Plan 00), so the texture
  applies to the v3 content area.

## Key Decisions

- **'Asignar' removed, not re-pointed** (GAP-02): there is no topbar-scoped
  assignment action to wire it to; per-conversation assignment is the
  `AssignDropdown` in the thread head. Re-using it as a ficha toggle (the bug)
  was wrong; the real toggle lives in `.th-head`.
- **Single `isPanelOpen` gate for ficha** (GAP-02): `handleOpenAgentConfig`
  already sets `isPanelOpen=true`, so gating the whole 3rd cell on `isPanelOpen`
  covers both ContactPanel and AgentConfigSlider.
- **Grey cutoff s<0.20 + verdigris/indigo split at 195°** (GAP-03): tuned so
  tailwind slate reads as `ink`, sky-blue → `indigo`, teal → `verdigris`,
  saturated true-green → `success` (kanban "C" parity).
- **Grain alpha 0.06** (GAP-04): between the prior commented v3 token (0.035,
  too faint) and the design-system base (0.09) — perceptible without dirtying the
  neutral white.

## Deviations from Plan

### Auto-fixed / blocking
- **[Rule 3 - blocking] `pnpm exec tsc --noEmit` for typecheck** — no
  `typecheck` npm script exists (only dev/build/lint/test), same as Plans 00/01.
- **[Rule 3 - blocking] `isPanelOpen` prop threaded through ChatView**
  (GAP-02): the th-head toggle must reflect open/closed state, but `chat-header`
  had no way to know it. Added an optional `isPanelOpen?: boolean` (default
  false) to `ChatViewProps` + `ChatHeaderProps`, threaded from `inbox-layout`.
  Legacy/v2 paths don't pass it → byte-identical behavior.
- **[Rule 1 - bug] GAP-03 helper bucket tuning**: initial thresholds put
  tailwind slate (`#64748b`, s≈0.16) into `indigo` and sky-blue (`#0ea5e9`,
  199°) into `verdigris` (two RED test cases). Fixed: grey cutoff `s<0.20` and
  verdigris/indigo boundary `195°`. Re-ran → 26/26 green.

## Authentication Gates

None.

## Verification Results

- **GAP-01:** CSS row track + composer `flex:none` + ficha `min-height:0`
  applied under v3 scope. (Live visual re-check of scroll/composer is the
  operator's browser pass on Varixcenter; the structural cause is fixed.)
- **GAP-02:** ficha gated on `isPanelOpen`; `.inbox.no-ficha` 2-col rule
  present; 'Asignar' removed; th-head toggle reflects state; no auto-open.
- **GAP-03:** `pnpm exec vitest run src/lib/editorial/` → **26/26 pass**. Helper
  wired into all 3 editorial screens; tags still via `MxTag`.
- **GAP-04:** v3 light sets `background-image: var(--paper-grain),
  var(--paper-fibers)` over neutral white; dark sets `background-image:none`.
- **Regla 6 (legacy byte-frozen):** all globals.css edits are at line 1127+; the
  legacy slice lines 1..1012 is byte-identical
  (`sha256 de29ca45…` before == after). The regla6 regression spec's
  `LEGACY_BLOCK_SHA256 = b0dfd8c1663c4b9f5e029b3f4485cb54c048c85377b75c7648cd4ff2acae5875`
  matches the current LF-normalized slice and line 1013 still starts with the v3
  comment header (`/* =`) — **the spec still passes unchanged, no re-baseline
  needed**. (The Playwright STATIC GATE is a pure file-hash check; verified via
  the identical node-side computation since the shared playwright config forces a
  webServer start that timed out in this headless env — the assertion itself
  passes deterministically.)
- **Typecheck:** `pnpm exec tsc --noEmit` → **0 new errors**; exactly the 4
  pre-existing baseline errors remain (`conversations.test.ts`,
  `instagram/__tests__/webhook-handler.test.ts`,
  `messenger/__tests__/webhook-handler.test.ts`) — out of scope.

## Known Stubs

None. All renders feed real data through the same wiring (Supabase / server
actions / realtime preserved). Tag variants now derive from the real
`tags.color` column.

## Commits

- `426d1152` fix(ui-redesign-editorial-core-05): restaurar scroll del inbox v3 + composer visible (GAP-01)
- `274f84e3` feat(ui-redesign-editorial-core-05): ficha oculta por default + toggle en th-head (GAP-02)
- `f69fab86` feat(ui-redesign-editorial-core-05): variant de etiqueta desde color real del tag (GAP-03)
- `d8ce5256` feat(ui-redesign-editorial-core-05): textura de papel fiel al design-system en v3 (GAP-04)
- (this) docs(ui-redesign-editorial-core-05): completar gap closure (GAP-01..04) + SUMMARY

## Self-Check: PASSED

Created files verified present:
- FOUND: src/lib/editorial/tag-variant.ts
- FOUND: src/lib/editorial/__tests__/tag-variant.test.ts
- FOUND: .planning/standalone/ui-redesign-editorial-core/05-SUMMARY.md

Commits verified in git log:
- FOUND: 426d1152, 274f84e3, f69fab86, d8ce5256
