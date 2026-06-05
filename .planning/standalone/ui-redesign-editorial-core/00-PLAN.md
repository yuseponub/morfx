---
phase: ui-redesign-editorial-core
plan: 00
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - src/app/globals.css
  - src/lib/auth/editorial-v3.ts
  - src/lib/auth/__tests__/editorial-v3.test.ts
  - src/app/(dashboard)/layout.tsx
autonomous: true
requirements: [D-01, D-02, D-04, D-05]
user_setup: []

must_haves:
  truths:
    - "A new scope class `.theme-editorial-v3` exists in globals.css carrying the full new editorial token system (light) plus a charcoal-warm dark palette"
    - "The legacy `.theme-editorial` block (and its interleaved global helpers) is byte-identical after this plan — Conversaciones v2 live in Somnio renders exactly as before"
    - "Dark mode is wired via the DESCENDANT selector `.dark .theme-editorial-v3` so it matches next-themes `.dark` on `<html>`"
    - "A per-workspace flag `ui_editorial_v3.enabled` (default OFF, fails closed) gates the new scope, applied at the dashboard `<main>` wrapper so the sidebar is structurally excluded"
    - "The flag resolver has a unit test proving it fails closed to false on error/null/missing key"
  artifacts:
    - path: "src/app/globals.css"
      provides: "Appended .theme-editorial-v3 light block + .dark .theme-editorial-v3 dark block + all .mx-* / mx-tag--* / table.dict / .kcard / .btn / .chip / .tabs / inbox / kanban component rules under v3 scope"
      contains: ".theme-editorial-v3"
    - path: "src/lib/auth/editorial-v3.ts"
      provides: "getIsEditorialV3Enabled(workspaceId) reading workspaces.settings.ui_editorial_v3.enabled, fails closed"
      exports: ["getIsEditorialV3Enabled"]
    - path: "src/lib/auth/__tests__/editorial-v3.test.ts"
      provides: "Unit test for fail-closed behavior (D-04)"
      contains: "getIsEditorialV3Enabled"
    - path: "src/app/(dashboard)/layout.tsx"
      provides: "isEditorialV3 resolution + theme-editorial-v3 class on the <main> content wrapper"
      contains: "isEditorialV3"
    - path: "package.json"
      provides: "pixelmatch + pngjs devDependencies for the Wave 3 harness"
      contains: "pixelmatch"
  key_links:
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/lib/auth/editorial-v3.ts"
      via: "import getIsEditorialV3Enabled + await with activeWorkspaceId"
      pattern: "getIsEditorialV3Enabled"
    - from: "src/app/(dashboard)/layout.tsx"
      to: ".theme-editorial-v3 in globals.css"
      via: "className gate isEditorialV3 && 'theme-editorial-v3' on the <main> wrapper"
      pattern: "isEditorialV3 && 'theme-editorial-v3'"
---

<objective>
Build the isolation foundation for the editorial v3 reskin: install the two screenshot-diff devDependencies, author the entire new `.theme-editorial-v3` token + component CSS block (light + dark) APPENDED to globals.css without touching the frozen legacy block, clone the per-workspace flag resolver, and wire the flag + scope class at the dashboard `<main>` wrapper (excluding the sidebar per D-06).

Purpose: Everything the three per-screen ports render against (tokens, `.mx-*`, `mx-tag--*`, `table.dict`, `.kcard`, `.btn`, `.chip`, `.tabs`, inbox/kanban rules) must exist under the new scope BEFORE any screen can be ported or visually verified. This plan also satisfies the two cross-cutting must-haves: Regla 6 (legacy block byte-frozen) and Regla 5 (zero migration — JSONB sub-key on the existing column).

Output: a green field for Wave 2 — new scoped CSS, a fail-closed flag, and the wired scope class.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-core/CONTEXT.md
@.planning/standalone/ui-redesign-editorial-core/RESEARCH.md
@.planning/standalone/ui-redesign-editorial-core/UI-SPEC.md

<interfaces>
<!-- Flag resolver pattern to clone (byte-for-byte structural clone). -->
From src/lib/auth/inbox-v2.ts and src/lib/auth/dashboard-v2.ts:

    import { createClient } from '@/lib/supabase/server'
    export async function getIsInboxV2Enabled(workspaceId: string): Promise<boolean> {
      if (!workspaceId) return false
      try {
        const supabase = await createClient()
        const { data, error } = await supabase
          .from('workspaces').select('settings').eq('id', workspaceId).single()
        if (error || !data) return false
        const settings = (data.settings as Record<string, unknown> | null) ?? {}
        const ns = settings.ui_inbox_v2 as Record<string, unknown> | undefined
        return ns?.enabled === true
      } catch { return false }
    }

From src/app/(dashboard)/layout.tsx (current shape — line numbers approximate):
- line 7: `import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'`
- lines 33-35: `const isDashboardV2 = activeWorkspaceId ? await getIsDashboardV2Enabled(activeWorkspaceId) : false`
- lines 48-56: `<div className={cn(ebGaramond.variable, inter.variable, jetbrainsMono.variable, 'flex h-screen', isDashboardV2 && 'theme-editorial')}>`
- lines 63-65: `<main className="flex-1 flex flex-col overflow-hidden">{children}</main>`

CRITICAL: the legacy `.theme-editorial` scope is applied on the SHELL ROOT div (line 54), which cascades into the Sidebar. For v3 we apply `theme-editorial-v3` on the `<main>` wrapper instead (Pitfall 6 / D-06 — structurally excludes the deferred sidebar).
</interfaces>

<canonical-source>
<!-- Token source-of-truth = the inline <style> .theme-editorial{…} block in this mock (HANDOFF §1, most complete). -->
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html
.planning/standalone/ui-redesign-editorial-core/handoff/colors_and_type.css  <!-- reference; mock inline block WINS where they differ (UI-SPEC §0/§4) -->
</canonical-source>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install pixelmatch + pngjs via pnpm</name>
  <read_first>
    - package.json (devDependencies section — confirm neither dep present; confirm @playwright/test ^1.59.1 already there)
    - RESEARCH.md §Standard Stack + Pitfall 7 (pnpm-only mandate; 4 broken deploys from npm install)
  </read_first>
  <action>
    Repo is pnpm-only. Run EXACTLY: `pnpm add -D pixelmatch pngjs`. NEVER `npm install` (Pitfall 7 — a prior npm install desynced pnpm-lock.yaml and broke 4 Vercel deploys). These are devDependencies used only by the Wave 3 screenshot-diff harness — they ship nothing to users. Do not pin to a stale major; let pnpm resolve current (pixelmatch ^6.x, pngjs ^7.x per RESEARCH A1). After install, confirm both appear under `devDependencies` in package.json and pnpm-lock.yaml updated.
  </action>
  <verify>
    <automated>grep -q '"pixelmatch"' package.json && grep -q '"pngjs"' package.json && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` devDependencies contain `pixelmatch` and `pngjs`
    - `pnpm-lock.yaml` was modified by this install (NOT package-lock.json — no npm artifact created)
    - No `package-lock.json` or `node_modules/.package-lock.json` churn introduced by npm
  </acceptance_criteria>
  <done>Both devDeps installed via pnpm; lockfile is pnpm-lock.yaml; no npm lockfile created.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Clone the per-workspace flag resolver + fail-closed unit test</name>
  <read_first>
    - src/lib/auth/inbox-v2.ts (the resolver to clone — copy structure verbatim)
    - src/lib/auth/dashboard-v2.ts (second analog)
    - src/lib/auth/__tests__/request-auth.test.ts (existing test style in this dir — mock shape, vitest conventions)
    - RESEARCH.md §Pattern 2 + §Code Examples "Flag resolver" + Pitfall 5 (no migration — JSONB sub-key on workspaces.settings)
  </read_first>
  <behavior>
    - Returns false when workspaceId is empty string
    - Returns false when supabase returns an error
    - Returns false when data.settings is null
    - Returns false when settings.ui_editorial_v3 key is missing
    - Returns false when settings.ui_editorial_v3.enabled is not strictly === true (e.g. "true" string, 1, undefined)
    - Returns true ONLY when settings.ui_editorial_v3.enabled === true (strict boolean)
    - Never throws — wraps the supabase call in try/catch and returns false on any thrown error
  </behavior>
  <action>
    Create `src/lib/auth/editorial-v3.ts` exporting `async function getIsEditorialV3Enabled(workspaceId: string): Promise<boolean>`, a byte-for-byte STRUCTURAL clone of `getIsInboxV2Enabled` — same imports (`import { createClient } from '@/lib/supabase/server'`), same try/catch, same fails-closed-to-false contract — but reading JSONB sub-key `settings.ui_editorial_v3` instead of `settings.ui_inbox_v2`. The full JSONB path is `workspaces.settings.ui_editorial_v3.enabled`. Add a header comment citing D-04 + Regla 5 (no migration: the flag is a sub-key on the existing `workspaces.settings` column that already holds `ui_inbox_v2`/`ui_dashboard_v2`). Activation is a manual post-QA SQL: `UPDATE workspaces SET settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{ui_editorial_v3,enabled}','true'::jsonb,true) WHERE id='<uuid>';`.

    Create `src/lib/auth/__tests__/editorial-v3.test.ts` (Vitest) covering every case in <behavior>. Mock `@/lib/supabase/server` `createClient` to return a stub whose `.from().select().eq().single()` chain yields the data/error pairs per case. This is D-04's automated gate.
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/auth/__tests__/editorial-v3.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/auth/editorial-v3.ts` exports `getIsEditorialV3Enabled`
    - The file reads JSONB path `ui_editorial_v3` (grep: `settings.ui_editorial_v3` present)
    - The file imports from `@/lib/supabase/server` (NOT `createAdminClient`, NOT `@supabase/supabase-js` directly)
    - `src/lib/auth/__tests__/editorial-v3.test.ts` exists and references `getIsEditorialV3Enabled`
    - `pnpm vitest run src/lib/auth/__tests__/editorial-v3.test.ts` passes all cases including the missing-key and non-strict-true cases returning false
  </acceptance_criteria>
  <done>Resolver clones the inbox-v2 pattern, reads ui_editorial_v3, fails closed; unit test green covering all fail-closed cases.</done>
</task>

<task type="auto">
  <name>Task 3: Author the .theme-editorial-v3 CSS block (light + descendant dark) appended to globals.css</name>
  <read_first>
    - src/app/globals.css — READ THE WHOLE FILE. Note: the legacy `.theme-editorial` scope is NOT a contiguous range. Its rules + interleaved GLOBAL helpers (`.kcard` line 927, `.scrollbar-overlay` line 954, `@keyframes mx-pulse`, `.theme-editorial .mx-skeleton`, `@media (prefers-reduced-motion)` `.theme-editorial *`) run from line 134 down to ~line 1011, immediately before `@layer base` at line 1013. APPEND the new block AFTER line 1011 (after the legacy reduced-motion `@media` block) and BEFORE `@layer base`. Do NOT edit any line at or above 1011.
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html — the inline `<style>.theme-editorial{…}` block is the TOKEN SOURCE OF TRUTH (HANDOFF §1). It declares `--fs-display:44px`, `.mx-display{font-weight:800}`, the compound `.theme-editorial.dark{…}` at line 252, and the logo rule at line 259.
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/pedidos/pedidos-editorial.html — kanban `.kcol`/`.kcard`/`.kcol-head`/`.dot`/`.kempty`/`.board`/`.pipes` rules + dark block.
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html — inbox `.inbox`/`.conv`/`.av`/`.msg`/`.ficha`/`.ped-card`/`.composer`/`.chip` rules + dark block.
    - .planning/standalone/ui-redesign-editorial-core/handoff/colors_and_type.css — reference for the 5 `mx-tag--*` variants (the crm mock inline block omits `verdigris`); where this file and the mock differ, the MOCK inline block wins (UI-SPEC §0/§4).
    - UI-SPEC.md §3 (spacing), §4 (typography — mock-winning values), §5 (color — light + §5.3 dark), §7 (mx-tag), §8 (chrome) — the locked token values.
    - RESEARCH.md §Code Examples (isolation CSS structure + dark selector) + Pitfall 1 (NEVER nest @theme) + Pitfall 2 (descendant dark) + Pitfall 4 (frozen legacy block).
  </read_first>
  <action>
    APPEND a single new CSS block under `.theme-editorial-v3` after line ~1011 of globals.css (before `@layer base`). The block is the canonical mock's inline `.theme-editorial{…}` system with the selector renamed 1:1 from `.theme-editorial X` to `.theme-editorial-v3 X`. Use PLAIN CSS custom-property declarations inside `.theme-editorial-v3 { … }` — NEVER `@theme` nested (Pitfall 1: Tailwind v4 forbids nested @theme; `@theme` stays top-level only, exactly as the legacy block does).

    LIGHT token scope `.theme-editorial-v3 { … }` (verbatim from UI-SPEC §5.1, mock-winning):
    - `color-scheme: light dark;` (v3 supports both; legacy was light-only)
    - Backgrounds: `--bg-app: oklch(0.996 0.0008 95)`; `--bg-sidebar: var(--bg-app)`; `--paper-0: oklch(1 0 0)`; `--paper-1: oklch(0.998 0.0006 85)`; plus `--paper-2/--paper-3/--paper-4` per mock.
    - Ink: `--ink-1: oklch(0.18 0.02 60)`; `--ink-2: 0.32`; `--ink-3: 0.48`; `--ink-4: 0.62`; `--ink-5: 0.78` (full oklch values per mock).
    - Rubric: `--rubric-2: oklch(0.55 0.10 30)`; `--rubric-1: oklch(0.45 0.09 28)`.
    - Color-ink accents: `--accent-verdigris: oklch(0.52 0.035 180)`; `--accent-gold: oklch(0.68 0.055 80)`; `--accent-indigo: oklch(0.42 0.045 260)`. Semantics per UI-SPEC §5.1.
    - Borders/rule: `--border: oklch(0.80 0.025 72)`; `--border-strong`/`--rule` = ink.
    - shadcn semantic mapping (CRITICAL, verbatim UI-SPEC §5.1): `--primary: var(--ink-1)` (NOT rubric); `--primary-foreground: var(--paper-0)`; `--background: var(--paper-1)`; `--card: var(--paper-0)`; `--secondary`/`--muted: var(--paper-2)`; `--muted-foreground: var(--ink-3)`; `--accent: var(--paper-3)`; `--border`/`--input: oklch(0.80 0.025 72)`; `--ring: var(--ink-1)`; `--destructive: var(--rubric-2)`; `--radius: var(--radius-3)`.
    - Type families (UI-SPEC §1.1): `--font-display`, `--font-serif`, `--font-sans`, `--font-mono`, `--font-small-caps` (reuse the already-loaded `--font-ebgaramond`/`--font-inter`/`--font-jetbrains-mono` vars — D-03, no new font work).
    - Font sizes (UI-SPEC §4, mock-winning): `--fs-display:44px; --fs-h1:32px; --fs-h2:26px; --fs-h3:24px; --fs-h4:20px; --fs-body:16px; --fs-body-sm:14px; --fs-caption:12px; --fs-micro:10px;` plus line-heights `--lh-tight:1.08; --lh-display:1.05; --lh-heading:1.20; --lh-body:1.55; --lh-long:1.70;`.
    - Spacing (UI-SPEC §3): `--space-1:4px` through `--space-9:96px`. Radii: `--radius-0:0; --radius-1:2px; --radius-2:3px; --radius-3:4px; --radius-pill:999px`.
    - `--paper-grain: none;` (texture DEFERRED per UI-SPEC §5.4 — background-color only; do not author grain on the root this round).
    - `background-color: var(--bg-app); font-family: var(--font-sans);` (sans base; serif applied explicitly via `.mx-*` — legacy lesson).

    COMPONENT rules under `.theme-editorial-v3 X` (port 1:1 from the mock inline blocks, selector-renamed). MUST author at minimum:
    - Typography utilities: `.mx-display` (`font-family:var(--font-display); font-weight:800; font-size:var(--fs-display); line-height:var(--lh-display); letter-spacing:-0.02em; color:var(--ink-1)` — WEIGHT 800, mock-winning, NOT 700), `.mx-h1` (700), `.mx-h2` (font-display 600), `.mx-h3` (600), `.mx-h4` (600), `.mx-body` (serif 400 ink-2), `.mx-body-long` (1.70), `.mx-caption` (serif italic), `.mx-smallcaps` (10px 600 uppercase 0.12em ink-3), `.mx-rubric` (Inter 10px 600 uppercase 0.08em rubric-2), `.mx-ui` (Inter 14px 500), `.mx-mono` (JetBrains 13px 500).
    - Rules/ornaments: `.mx-rule` (1px ink-2), `.mx-rule-double` (3px double), `.mx-rule-thick` (2px ink).
    - Tag system (UI-SPEC §7 — ALL 5 variants, color-mix over tokens, NEVER hardcoded oklch): `.mx-tag` base + `.mx-tag--rubric`, `.mx-tag--gold`, `.mx-tag--indigo`, `.mx-tag--verdigris` (author this one even though the crm mock omits it — needed for Mayorista/Recompra/WPP, take recipe from colors_and_type.css), `.mx-tag--ink`. Optionally `.mx-tag--success` (color-mix over `--semantic-success`) per UI-SPEC §7 kanban note.
    - Chrome (UI-SPEC §8): `.btn` (+`.btn.pri`), `.chip` (+`.chip.on`), `.icon-btn`, `.tabs`/tab active underline, `.search`/inputs, `.eye` eyebrow (Inter 11px 600 uppercase 0.14em rubric-2), `.vtoggle`, `.pager`, `.pipes`/`.pp`.
    - Contactos: `table.dict` (outer `1px solid var(--ink-1)` frame, `thead th` Inter 10px 600 uppercase ink-3 with `1px solid var(--ink-1)` bottom, `td` Inter 13px ink-1 `1px solid var(--border)` bottom, row hover paper-2), cell variants `.entry`/`.ph`/`.city`/`.date`.
    - Conversaciones: `.inbox` grid `340px 1fr 300px`, `.conv` (+`.conv.on` paper-3 + 2px rubric left spine via `::before`), `.av`/`.av-lg`, `.msg` family `'Helvetica Neue', Helvetica, Arial, var(--font-sans)` 14px/1.45 with `.msg.in`/`.msg.out`/`.msg.out.agent` + `border-bottom-left/right-radius:1px` tail, `.tm`/`.tmpl`/`.daysep`, `.ficha`/`.sect`/`.ped-card`/`.note`/`.composer`/`.field`.
    - Pedidos kanban: `.board` (flex, horizontal scroll), `.kcol` (flex-basis 246px, `border-left:1px solid var(--border)`, `.kcol:first-child` no left border — hairlines NOT boxes), `.kcol-head`/`.dot` (+stage color classes `.agend`/`.web`/`.nuevo`/`.info`/`.conf`/`.ok`), the loose kanban card (paper-0 + border + shadow-card, hover ink-3 border) authored as `.theme-editorial-v3 .kcard` so the v3-scoped rule wins via specificity — NOTE the GLOBAL legacy `.kcard` at line 927 stays UNTOUCHED, `.kempty` (serif italic "Sin pedidos" ink-4).

    DARK scope — author as the DESCENDANT selector `.dark .theme-editorial-v3 { … }` (NOT the mock's compound `.theme-editorial-v3.dark`). RESOLUTION (locked, overrides UI-SPEC §2.4): next-themes is configured `attribute="class"` at src/app/layout.tsx:34, which toggles `.dark` on `<html>` (a global ANCESTOR), never on the scoped element — so the compound selector would NEVER match in this codebase (Pitfall 2). The descendant form mirrors the proven `.dark .theme-editorial` block at globals.css:309 and Tailwind v4's `@custom-variant dark (&:is(.dark *))` at globals.css:4. The PALETTE VALUES are verbatim from UI-SPEC §5.3 / the mock — only the selector FORM changes:

        .dark .theme-editorial-v3 {
          --bg-app:oklch(0.215 0.006 60); --bg-sidebar:oklch(0.215 0.006 60);
          --paper-0:oklch(0.255 0.006 60); --paper-1:oklch(0.235 0.006 60);
          --paper-2:oklch(0.285 0.007 60); --paper-3:oklch(0.315 0.008 60); --paper-4:oklch(0.355 0.009 60);
          --ink-1:oklch(0.95 0.006 85); --ink-2:oklch(0.86 0.008 85); --ink-3:oklch(0.70 0.010 80);
          --ink-4:oklch(0.56 0.010 75); --ink-5:oklch(0.42 0.010 70);
          --border:oklch(0.37 0.008 70); --rubric-2:oklch(0.64 0.11 30); --rubric-1:oklch(0.72 0.10 30);
          --paper-grain:none; background-color:var(--bg-app);
        }
        .dark .theme-editorial-v3 .wm img{mix-blend-mode:screen;filter:invert(1) hue-rotate(180deg)}
        .theme-editorial-v3 .wm img{mix-blend-mode:multiply}

    (The `.wm` logo rule is authored for correctness even though the sidebar is deferred D-06.) Do NOT author ANY compound `.theme-editorial-v3.dark` rule anywhere.
  </action>
  <verify>
    <automated>grep -q '\.theme-editorial-v3 \.mx-display' src/app/globals.css && grep -q '\.dark \.theme-editorial-v3' src/app/globals.css && ! grep -q '\.theme-editorial-v3\.dark' src/app/globals.css && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `globals.css` contains `.theme-editorial-v3 .mx-display` and that rule has `font-weight:800` (mock-winning value per UI-SPEC §4 — NOT 700)
    - `globals.css` contains the descendant dark selector `.dark .theme-editorial-v3`
    - `globals.css` does NOT contain any compound `.theme-editorial-v3.dark` rule (grep returns nothing)
    - `globals.css` contains `--fs-display:44px` (or `--fs-display: 44px`) and `--primary: var(--ink-1)` under the v3 scope (NOT rubric)
    - `globals.css` contains all 5 tag variants: `.theme-editorial-v3 .mx-tag--rubric`, `--gold`, `--indigo`, `--verdigris`, `--ink`
    - `globals.css` contains `.theme-editorial-v3 .kcol` with `flex-basis: 246px` and `.theme-editorial-v3 .kcol:first-child` clearing the left border (hairlines-not-boxes)
    - `globals.css` contains `.theme-editorial-v3 .kempty` (the "Sin pedidos" empty state)
    - `globals.css` contains `.theme-editorial-v3 .msg` with `'Helvetica Neue'` in its font-family
    - NO nested `@theme` appears inside any `.theme-editorial-v3` rule (grep: no `@theme` in the appended block)
    - REGLA 6 GATE: `git diff -U0 src/app/globals.css` shows ONLY appended lines after line 1011 — every hunk's `@@ -L,N +M,K @@` old-side must start at a line > 1011. Zero hunks touch lines 1–1011 (legacy `.theme-editorial` block + interleaved global helpers byte-frozen).
    - App builds: `pnpm typecheck` (and ideally `pnpm build`) completes with no @theme / CSS error
  </acceptance_criteria>
  <done>New `.theme-editorial-v3` light + descendant-dark block appended; legacy block byte-identical; mx-display weight 800; all tag variants + kanban hairlines + Helvetica bubbles present; no compound dark selector; no nested @theme.</done>
</task>

<task type="auto">
  <name>Task 4: Wire the flag + scope class at the dashboard layout (sidebar excluded)</name>
  <read_first>
    - src/app/(dashboard)/layout.tsx (full — current isDashboardV2 resolution + className on shell root + the <main> wrapper)
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx lines 152-156 (proof that legacy `.theme-editorial` is applied at a SEPARATE site gated by `v2`/ui_inbox_v2 — DO NOT TOUCH this file; it stays the legacy live path)
    - RESEARCH.md §Pattern 1 + §Code Examples "layout.tsx gating" + Pitfall 6 (blast-radius — apply on a wrapper inside <main> to exclude the deferred sidebar D-06)
  </read_first>
  <action>
    In `src/app/(dashboard)/layout.tsx`:
    1. Add import: `import { getIsEditorialV3Enabled } from '@/lib/auth/editorial-v3'`.
    2. Resolve the flag next to the existing `isDashboardV2`: `const isEditorialV3 = activeWorkspaceId ? await getIsEditorialV3Enabled(activeWorkspaceId) : false` (fails closed to false — Regla 6).
    3. Apply the scope class on the `<main>` CONTENT wrapper, NOT the shell root (Pitfall 6 / D-06 — this structurally excludes the Sidebar so the deferred sidebar chrome stays shadcn and renders unchanged when the flag is on). Keep the existing shell-root `<div>` className exactly as-is (do NOT add `theme-editorial-v3` there). Change the `<main>` line to:
       `<main className={cn('flex-1 flex flex-col overflow-hidden', isEditorialV3 && 'theme-editorial-v3')}>`
       (`cn` is already imported in the file). The font `--font-*` variables are already on the shell root div (lines 50-52) and cascade into `<main>`, so the v3 scope still resolves the fonts — no font work needed (D-03).
    4. Do NOT remove or alter the legacy `isDashboardV2 && 'theme-editorial'` on the shell root — the two systems coexist by distinct class name (D-05). v3 is additive and independent.
  </action>
  <verify>
    <automated>grep -q "getIsEditorialV3Enabled" "src/app/(dashboard)/layout.tsx" && grep -q "isEditorialV3 && 'theme-editorial-v3'" "src/app/(dashboard)/layout.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `(dashboard)/layout.tsx` imports `getIsEditorialV3Enabled` from `@/lib/auth/editorial-v3`
    - `(dashboard)/layout.tsx` resolves `isEditorialV3` fails-closed (`activeWorkspaceId ? await … : false`)
    - `(dashboard)/layout.tsx` contains `isEditorialV3 && 'theme-editorial-v3'` on the `<main>` wrapper className
    - The shell-root `<div>` still carries `isDashboardV2 && 'theme-editorial'` UNCHANGED (legacy path preserved — grep confirms both classes coexist)
    - `theme-editorial-v3` is NOT applied on the shell-root `<div>` (sidebar excluded — Pitfall 6)
    - `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` is unchanged (git diff empty)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Flag resolved fails-closed; `theme-editorial-v3` applied only on `<main>` (sidebar excluded); legacy `theme-editorial` path untouched; typecheck green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server (RSC) | Workspace flag is resolved server-side from `activeWorkspaceId` (server-derived), never from a client-supplied workspace id |
| DB JSONB → CSS scope | Flag value is a trusted server-read boolean; no user input enters the CSS or class name |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-editorial-01 | Information disclosure | Cross-workspace flag leakage | mitigate | `getIsEditorialV3Enabled` reads from server-resolved `activeWorkspaceId` only (clone of `getIsInboxV2Enabled`); no client-controlled workspace id reaches the resolver |
| T-editorial-02 | Availability | Regla 6 production regression (operational) | mitigate | Class-name isolation (`.theme-editorial-v3` ≠ legacy `.theme-editorial`) + frozen legacy block (git-diff gate) + fail-closed flag default OFF |
| T-editorial-03 | Tampering | Malformed/missing settings JSONB | accept | Resolver wraps in try/catch and returns false on any error/null/missing key — low risk, fails to safe (current UI) |
</threat_model>

<verification>
- `pnpm vitest run src/lib/auth/__tests__/editorial-v3.test.ts` green (D-04 fail-closed)
- `git diff -U0 src/app/globals.css` shows only appended hunks below line 1011 (D-05 / Regla 6 byte-frozen legacy block)
- `grep '.theme-editorial-v3.dark' src/app/globals.css` returns NOTHING; `grep '.dark .theme-editorial-v3'` returns the dark block (D-02 descendant selector resolution)
- `pnpm typecheck` green (layout wiring compiles)
</verification>

<success_criteria>
- pixelmatch + pngjs installed via pnpm (no npm lockfile churn)
- `.theme-editorial-v3` light + descendant-dark CSS block appended; legacy block byte-identical
- `getIsEditorialV3Enabled` clones the inbox-v2 pattern, reads `ui_editorial_v3`, fails closed, unit-tested
- Flag + scope class wired at `<main>` (sidebar excluded); legacy `theme-editorial` path untouched
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-core/00-SUMMARY.md`
</output>
