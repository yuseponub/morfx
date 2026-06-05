---
phase: ui-redesign-editorial-core
plan: 05
type: execute
wave: 4
gap_closure: true
depends_on: [00, 01, 02, 03]
files_modified:
  - src/app/globals.css
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
  - src/lib/editorial/tag-variant.ts
  - src/lib/editorial/__tests__/tag-variant.test.ts
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/crm/contactos/components/columns.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
  - src/app/(dashboard)/crm/pedidos/components/columns.tsx
autonomous: true
requirements: [GAP-01, GAP-02, GAP-03, GAP-04]

# GAP CLOSURE — UAT feedback from operator QA on Varixcenter (2026-06-05)
# Source: Plan 04 human-verify checkpoint. Operator approved the overall
# editorial direction ("en general el diseño sí es fiel") but reported 4 gaps.
# All fixes live ENTIRELY under the .theme-editorial-v3 scope / v3 component
# branches. The legacy .theme-editorial block + v2 paths stay byte-frozen
# (Regla 6). Flag still default-OFF; no production workspace is touched.

must_haves:
  truths:
    - "GAP-01 (scroll/textbox): With v3 on, /whatsapp scrolls correctly — the conversation list and chat thread scroll independently and the message composer (textbox) is always visible at the bottom of the thread. Root cause: `.theme-editorial-v3 .inbox` grid had no row track, so the thread column grew to content height and pushed the composer past the `overflow:hidden` clip. Fix: constrain the grid row to the container (`grid-template-rows: minmax(0, 1fr)`) so the children's existing `min-height:0` + `overflow:auto` engage."
    - "GAP-02 (ficha hidden by default): The contact/order panel (.ficha) is HIDDEN by default in v3. A visible toggle button in the chat header (.th-head) opens/closes it. When closed the `.inbox` grid collapses to 2 columns (340px / 1fr); when open it is the 3-column grid (340px / 1fr / 300px). Selecting a conversation does NOT auto-open the panel (operator chose explicit-toggle). The topbar 'Asignar' button is no longer mis-wired to the panel toggle."
    - "GAP-03 (real tag colors): Tags across the 3 editorial screens derive their `mx-tag--*` variant from the tag's REAL stored color (`tag.color` hex from DB) mapped to the nearest editorial variant (rubric/gold/indigo/verdigris/ink/success) by hue, instead of a hardcoded name→variant table. A pure helper `tagColorToVariant(hex)` performs the mapping and is unit-tested."
    - "GAP-04 (paper texture): The v3 background reads as textured white paper, not flat white. The `.theme-editorial-v3` scope re-enables `--paper-grain` + `--paper-fibers` (currently `none`) faithful to the design-system base (`handoff/colors_and_type.css`) and applies them as `background-image` over the neutral white `--bg-app` (NOT beige — operator explicitly rejected beige). Dark mode keeps texture OFF (`--paper-grain:none` under `.dark .theme-editorial-v3`)."
    - "Regla 6 intact: the legacy `.theme-editorial` block in globals.css (lines 1..1012) is byte-identical; v2 inbox path unchanged; a workspace with only `ui_inbox_v2` still renders the warm-cream legacy Conversaciones."
    - "Typecheck adds 0 new errors (the 4 pre-existing baseline errors in unrelated test files remain out of scope). The new tag-variant unit test passes."
  artifacts:
    - path: "src/app/globals.css"
      provides: "GAP-01 grid-template-rows fix on `.theme-editorial-v3 .inbox` + a 2-col collapse rule (e.g. `.theme-editorial-v3 .inbox.no-ficha{grid-template-columns:340px 1fr}`); GAP-04 re-enabled `--paper-grain`/`--paper-fibers` + `background-image` on `.theme-editorial-v3` (texture OFF in `.dark .theme-editorial-v3`)"
      contains: "grid-template-rows"
    - path: "src/lib/editorial/tag-variant.ts"
      provides: "Pure `tagColorToVariant(hex: string): MxTagVariant` — parses hex → HSL/oklch hue → nearest editorial variant; null/invalid hex falls back to 'ink'"
      exports: ["tagColorToVariant"]
    - path: "src/lib/editorial/__tests__/tag-variant.test.ts"
      provides: "Unit tests: red→rubric, amber/yellow→gold, blue/violet→indigo, teal/green→verdigris/success, grey/black→ink, invalid→ink"
      contains: "tagColorToVariant"
    - path: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      provides: "GAP-02: v3 ficha rendered only when `isPanelOpen`; `.inbox` gets `no-ficha` class when closed; remove auto-open-on-select; fix 'Asignar' topbar button (no longer toggles panel)"
      contains: "no-ficha"
    - path: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      provides: "GAP-02: visible ficha toggle button in the v3 `.th-head` wired to `onTogglePanel`"
      contains: "onTogglePanel"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      to: "src/lib/editorial/tag-variant.ts"
      via: "import tagColorToVariant + MxTag variant from tag.color"
      pattern: "tagColorToVariant"
    - from: "src/app/(dashboard)/crm/contactos/components/columns.tsx"
      to: "src/lib/editorial/tag-variant.ts"
      via: "import tagColorToVariant for the Tags column"
      pattern: "tagColorToVariant"
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      to: "src/lib/editorial/tag-variant.ts"
      via: "import tagColorToVariant for card tag pills"
      pattern: "tagColorToVariant"
    - from: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      to: ".theme-editorial-v3 .inbox.no-ficha in globals.css"
      via: "className 'no-ficha' on the .inbox grid when panel closed"
      pattern: "no-ficha"
---

# Plan 05 — Gap closure: scroll/textbox, ficha toggle, real tag colors, paper texture

## Context

Operator QA on the Varixcenter workspace (flag ON) at the Plan 04 checkpoint
surfaced 4 gaps. The overall editorial direction was approved. Every fix is
confined to the `.theme-editorial-v3` scope and the v3 component branches.
The legacy `.theme-editorial` CSS block and the v2 inbox path MUST stay
byte-frozen (Regla 6). The `ui_editorial_v3` flag remains default-OFF; do not
enable it on any workspace.

Locked decisions from the discuss step:
- **GAP-02:** ficha hidden by default **+ explicit toggle button** (not
  open-on-select).
- **GAP-03:** map the tag's **real DB color → nearest editorial `mx-tag--*`
  variant** (keep the editorial palette, respect the configured hue).
- **GAP-04:** get the background **closer to the Claude design-system**
  reference — re-enable the paper grain/fibers texture over a **neutral white**
  (the operator rejected beige).

Project rules: pnpm-only (never npm); typecheck via `pnpm exec tsc --noEmit`
(4 pre-existing baseline errors are out of scope, add 0 new); commit each task
atomically in Spanish, Co-authored-by Claude; stage explicit paths only (a
concurrent session may commit on main).

## Tasks

### Task 1 — GAP-01: Fix inbox scroll + restore the composer (CSS only)

`.theme-editorial-v3 .inbox` is `display:grid; grid-template-columns:340px 1fr 300px;
flex:1; min-height:0; overflow:hidden` with **no** `grid-template-rows`. The single
implicit row is `auto`, so the `.thread` column sizes to its content; the
`.th-body` never overflows (no scroll) and the `.composer` is pushed below the
clipped box (textbox invisible).

- Add `grid-template-rows: minmax(0, 1fr)` to `.theme-editorial-v3 .inbox`.
- Verify the column children (`.conv-col`, `.thread`, `.ficha`) keep `min-height:0`
  and that `.conv-list` / `.th-body` keep `overflow-y:auto` so they scroll within
  the constrained row. Add `min-height:0` to any grid child still missing it.
- Verify `.composer` is a non-shrinking footer of `.thread` (e.g. `flex:none`) so
  it stays pinned at the bottom and visible.
- Manually re-check (or note for the operator) that the chat thread scrolls and
  the composer shows.

Commit: `fix(ui-redesign-editorial-core-05): restaurar scroll del inbox v3 + composer visible (GAP-01)`

### Task 2 — GAP-02: Ficha hidden by default + toggle + 2-col collapse

In `inbox-layout.tsx` v3 branch:
- Render the `.ficha` column (ContactPanel / AgentConfigSlider) **only when
  `isPanelOpen`** (or when `rightPanel === 'agent-config'`). When closed, render
  nothing in the third grid cell.
- Add a `no-ficha` class to the `.inbox` div when the panel is closed so the grid
  collapses to `340px 1fr` (add the CSS rule
  `.theme-editorial-v3 .inbox.no-ficha{grid-template-columns:340px 1fr}` in
  globals.css, under the v3 scope).
- Remove the auto-open behavior: `handleSelectConversation` must NOT call
  `setIsPanelOpen(true)` (operator chose explicit toggle). Keep the narrow-screen
  auto-close effect.
- Fix the topbar **'Asignar'** button: it currently calls `setIsPanelOpen` — that
  is wrong (Asignar should trigger the assignment flow, not the ficha). Wire it to
  the real assignment action if one exists, otherwise leave it as a no-op/remove
  the panel-toggle side effect. Do NOT use 'Asignar' as the ficha toggle.
- Add the real ficha toggle as a visible button in the v3 `.th-head`
  (`chat-header.tsx`) wired to `onTogglePanel` (e.g. an `.icon-btn` "Ver ficha" /
  contact icon), reflecting open/closed state. `ChatView` already threads
  `onTogglePanel`.

Preserve all assignment / contact / order wiring. Markup + state only.

Commit: `feat(ui-redesign-editorial-core-05): ficha oculta por default + toggle en th-head (GAP-02)`

### Task 3 — GAP-03: Real tag color → nearest editorial variant

- Create `src/lib/editorial/tag-variant.ts` exporting a **pure**
  `tagColorToVariant(hex: string): 'rubric'|'gold'|'indigo'|'verdigris'|'ink'|'success'`.
  Parse the hex (`#rrggbb` / `#rgb`, tolerate missing `#`), compute hue +
  saturation/lightness, and map by hue bucket to the nearest editorial accent:
  - very low saturation OR near-black/near-white → `ink`
  - red/magenta hue (~330–20°) → `rubric`
  - amber/yellow (~20–70°) → `gold`
  - green (~90–160°) → `verdigris` (or `success` for a saturated true-green if you
    want parity with the kanban "C" tag — pick one deterministically)
  - cyan/teal nuance can fold into `verdigris`
  - blue/indigo/violet (~200–290°) → `indigo`
  - invalid/empty → `ink` (fail-safe, never throw)
- Unit test in `src/lib/editorial/__tests__/tag-variant.test.ts` covering each
  bucket + invalid input. Run `pnpm exec vitest run src/lib/editorial/`.
- Wire it into the editorial tag renders, replacing the name→variant tables:
  - `whatsapp/components/contact-panel.tsx` (ficha tag cloud, v3 path)
  - `crm/contactos/components/columns.tsx` (Tags column, v3 path)
  - `crm/pedidos/components/kanban-card.tsx` and `crm/pedidos/components/columns.tsx`
    (card + table tag/status pills, v3 path) — keep status-specific logic where the
    status is not a DB tag with a color; only tags carrying a real `color` use the
    helper.
  Keep using `MxTag` (no inline arbitrary colors, no shadcn Badge) — only the
  variant SELECTION changes.

Commit: `feat(ui-redesign-editorial-core-05): variant de etiqueta desde color real del tag (GAP-03)`

### Task 4 — GAP-04: Re-enable faithful paper texture in v3

Reference: `handoff/colors_and_type.css` defines `--paper-grain` (fractalNoise
baseFrequency 0.85, 2 octaves, warm-grey tint) + `--paper-fibers` and applies
`background-image: var(--paper-grain), var(--paper-fibers)` on the body. The v3
scope currently sets `--paper-grain:none` and paints a flat `background-color`
only.

- In `.theme-editorial-v3` (light), set `--paper-grain` + `--paper-fibers` to the
  SVG-noise data-URIs (mirror the design-system base already present higher in
  globals.css around lines 223–224; reuse those exact tokens so it matches the
  system) and apply
  `background-image: var(--paper-grain), var(--paper-fibers)` alongside the
  existing `background-color: var(--bg-app)`.
- Keep `--bg-app` a **neutral white** (current `oklch(0.996 0.0008 95)` — NOT
  beige). If the grain needs a touch more tooth, you may nudge `--bg-app` very
  slightly (e.g. `oklch(0.994 0.003 90)`) but stay neutral; do not reintroduce the
  beige `#fcf7f0`.
- Tune the noise alpha so the texture is **perceptible but subtle** (operator
  wants it to read as paper, not flat). The design-system uses alpha ~0.09 for
  grain; the current commented v3 token used ~0.035 — land somewhere that's
  visible on screen without looking dirty.
- In `.dark .theme-editorial-v3`, keep `--paper-grain:none` / no texture
  (charcoal-warm flat), as today.
- Confirm the texture applies to the v3 content area (the `<main>` carrying
  `.theme-editorial-v3`).

Commit: `feat(ui-redesign-editorial-core-05): textura de papel fiel al design-system en v3 (GAP-04)`

### Task 5 — Regla 6 verification + SUMMARY

- Verify the legacy block is byte-frozen: `git diff` on globals.css must show
  only insertions/edits **below** the legacy region (lines 1..1012 unchanged).
  The Regla 6 regression spec (`e2e/visual/regla6-regression.spec.ts`) hashes
  lines 1..1012 — if that boundary shifts because you inserted v3 rules, update
  the spec's expected line range/hash deliberately and note it (the legacy
  CONTENT must remain identical even if its line numbers move; prefer appending
  v3 rules so the legacy region stays at lines 1..1012).
- `pnpm exec tsc --noEmit` → 0 new errors. `pnpm exec vitest run src/lib/editorial/`
  → green.
- Write `05-SUMMARY.md` documenting each GAP fix, files touched, test results,
  and the Regla 6 confirmation.

Commit: `docs(ui-redesign-editorial-core-05): completar gap closure (GAP-01..04) + SUMMARY`

## Verification (must pass before SUMMARY)

- [ ] /whatsapp v3: conversation list scrolls; chat thread scrolls; composer
      (textbox) visible at all times.
- [ ] Ficha hidden by default; toggle button in th-head opens/closes it; grid
      collapses 3-col↔2-col; 'Asignar' no longer toggles the ficha; no
      auto-open on select.
- [ ] Tags on all 3 screens colored by real `tag.color`→editorial variant;
      `tagColorToVariant` unit test green.
- [ ] v3 background shows perceptible paper texture (light) over neutral white,
      no beige; dark mode flat charcoal (no texture).
- [ ] Legacy `.theme-editorial` byte-identical; v2 path unchanged (Regla 6).
- [ ] `pnpm exec tsc --noEmit` 0 new errors.
