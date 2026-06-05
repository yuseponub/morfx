# Standalone: ui-redesign-editorial-core — Research

**Researched:** 2026-06-05
**Domain:** UI reskin (CSS theme-isolation + verbatim HTML/JSX port + headless visual verification) on Next.js 16 App Router / React 19 / Tailwind v4 / next-themes
**Confidence:** HIGH (isolation mechanism + dark wiring + flag storage all grounded in real code; Tailwind `@theme` constraint confirmed against official docs)

## Summary

This is NOT a library-selection problem — the stack is fixed and every visual value is already locked in `UI-SPEC.md`. The research question is: **how do we port a NEW editorial token system into `globals.css` without regressing the OLD `.theme-editorial` system that is LIVE in production (Conversaciones v2 in Somnio), and how do we verify the port hit ≥95% fidelity headlessly?**

Both unknowns are now resolved against the real code:

1. **Isolation** — The new system MUST live under a distinct scope class `.theme-editorial-v3` (UI-SPEC §2's proposal is CORRECT and verified). The legacy `.theme-editorial` block (globals.css lines 134–945) stays byte-untouched. This is mechanically sound because the live Conversaciones reads `.theme-editorial` from `whatsapp/components/inbox-layout.tsx:154` (gated by `ui_inbox_v2`), a DIFFERENT application site than the dashboard layout — so the two systems never collide if they use different class names.

2. **Dark mode** — The single highest-risk HOW gap. The mocks author the override as the **compound** selector `.theme-editorial.dark` (dark on the SAME element). But the live app's `next-themes` is configured `attribute="class"` (`app/layout.tsx:34`), which toggles `.dark` on `<html>` — a global ANCESTOR, never the scoped container. **The mock's compound selector would NEVER match in this codebase.** The fix is to author dark as a **descendant** selector `.dark .theme-editorial-v3 { … }`, mirroring the existing, proven `.dark .theme-editorial` defensive block at globals.css:309. No next-themes reconfiguration needed.

3. **Flag storage** — No migration required. The existing flag pattern stores a JSONB sub-key on `workspaces.settings`; a sibling key `ui_editorial_v3.enabled` adds to the same column. Regla 5 is satisfied with zero schema change.

4. **Verification** — Playwright `^1.59` is already installed and configured (`playwright.config.ts`, `e2e/`). `pixelmatch`+`pngjs` are NOT — install them (dev) for the screenshot-diff harness.

**Primary recommendation:** Author a new `.theme-editorial-v3` scoped block (plain CSS vars, NOT `@theme`) + a `.dark .theme-editorial-v3` descendant dark block, gated by a new `ui_editorial_v3.enabled` JSONB flag applied at `(dashboard)/layout.tsx`; leave the entire legacy `.theme-editorial` block untouched; verify per-screen in light+dark with a Playwright + pixelmatch harness against the canonical mocks.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Big-bang adopt the new system from `handoff/colors_and_type.css` / canonical mock inline blocks as the base — NOT token-by-token merge. (Adopted under the NEW scope class, NOT in-place over the legacy block — see Architecture Patterns.)
- **D-02:** Include dark mode this round (light + dark together), with logo rule `.dark .wm img{mix-blend-mode:screen;filter:invert(1) hue-rotate(180deg)}`.
- **D-03:** Fonts already loaded (`(dashboard)/fonts.ts` — EB Garamond / Inter / JetBrains Mono via `next/font`). No new font work; reuse `--font-ebgaramond / --font-inter / --font-jetbrains-mono`.
- **D-04:** Gate with a per-workspace feature flag, default OFF, manual SQL flip after QA — same pattern as `ui_inbox_v2.enabled`.
- **D-05 (CRITICAL):** Conversaciones v2 is LIVE under `.theme-editorial` in Somnio. The new system MUST be isolated so production stays byte-identical until an explicit flip. Research defines the exact mechanism.
- **D-06:** Sidebar deferred (global, affects all 9 modules) — do NOT reskin it this round.
- **D-07:** Only the 3 content areas (Conversaciones, CRM Contactos, CRM Pedidos). Other 6 modules deferred.
- **D-08:** The 16 handoff TSX components are VISUAL reference only — NOT drop-in. Port markup + classes onto REAL components, preserving data/Supabase/server-actions/realtime wiring.
- **D-09:** Use the canonical `*-editorial.html` / `ui_kits/.../index.html` mocks (NOT legacy `design_handoff_morfx/mocks/*.html`). Replace legacy `.tg.*` with official `mx-tag--*` (color-mix over tokens).
- **D-10:** Verify with headless side-by-side screenshots (mock vs render), ≥95% pixel-match per screen, running HANDOFF §5 checklist, before declaring done.

### Claude's Discretion
- Exact theme-isolation mechanics (D-05) — **resolved in this research**: `.theme-editorial-v3` scope class + descendant `.dark` block, both grounded in real code.
- Plan task/wave structure.
- How `next-themes` `theme==='dark'` maps to the scoped container's dark styling — **resolved**: use descendant `.dark .theme-editorial-v3` (no client-side class mirroring needed).

### Deferred Ideas (OUT OF SCOPE)
- Global new sidebar (workspace switcher 84.6px, logo `<img>`, category bullets) — follow-up round.
- Other 6 modules (Agentes, Analytics, Automatizaciones, Configuración, Tareas, Landing).
- Paper textures (`--paper-grain` + `--paper-fibers` multiply at root) — evaluate Safari-retina perf first.
- Full typographic loading/empty/error states for the other modules.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| D-05 | Isolate new system so live Conversaciones v2 stays byte-identical | Architecture Patterns §1 (scope class) + Common Pitfalls 1, 4 — grounded in globals.css:134-945 + inbox-layout.tsx:154 |
| D-02 | Dark mode wired to next-themes | Architecture Patterns §3 + Code Examples — descendant `.dark .theme-editorial-v3` (NOT compound), verified against globals.css:309 + app/layout.tsx:34 |
| D-04 | Per-workspace flag, default OFF, no migration if possible | Architecture Patterns §2 + Don't Hand-Roll — reuse `getIsInboxV2Enabled` pattern, JSONB sub-key, zero migration |
| D-01 | Big-bang adopt new token system | Architecture Patterns §1 — adopt under `.theme-editorial-v3`, NOT in-place |
| D-09 | Official `mx-tag--*` over color-mix | Don't Hand-Roll + Code Examples — `MxTag` component + scoped CSS already exist; re-author under v3 scope |
| D-10 | ≥95% headless pixel verification | Standard Stack + Architecture Patterns §4 — Playwright (installed) + pixelmatch (install) harness |

## Standard Stack

**This is a reskin. Do NOT add libraries beyond the one screenshot-diff dependency. REUSE everything below.**

### Core (fixed — already in repo, do not change)
| Library | Version (verified) | Purpose | Note |
|---------|--------------------|---------|------|
| next | ^16.1.6 | App Router framework | [VERIFIED: package.json]. CLAUDE.md says "Next.js 15" — repo is actually on **Next 16**; App Router semantics unchanged for this reskin. |
| react / react-dom | 19.2.3 | UI runtime | [VERIFIED: package.json] |
| tailwindcss | ^4 | Utility CSS + `@theme` | [VERIFIED: package.json] — v4 `@theme` is TOP-LEVEL ONLY (see Pitfalls) |
| next-themes | ^0.4.6 | Light/dark toggle (`attribute="class"` on `<html>`) | [VERIFIED: package.json + app/layout.tsx:33-38] |
| @playwright/test | ^1.59.1 (playwright ^1.58.2 lib) | Headless browser for screenshot verification | [VERIFIED: package.json + playwright.config.ts] |

### Supporting (the ONE thing to add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pixelmatch | ^6.x | Per-pixel diff between mock and render PNGs | Verification harness only (devDependency). Pair with `pngjs` to decode/encode PNG buffers Playwright captures. |
| pngjs | ^7.x | PNG decode/encode for pixelmatch input/output | Same harness. |

**Installation (verify versions before pinning):**
```bash
pnpm add -D pixelmatch pngjs
npm view pixelmatch version && npm view pngjs version   # confirm current
```
> ⚠️ **Repo is pnpm-only** (MEMORY: "WhatsApp/CRM read latency" learning — an executor installed with `npm` → 4 broken deploys from `pnpm-lock` drift). Use `pnpm add -D`, never `npm install`.

### Reuse — do NOT rebuild these
| Asset | Location | Reuse for |
|-------|----------|-----------|
| Fonts (EB Garamond / Inter / JetBrains Mono) | `(dashboard)/fonts.ts` (exports `ebGaramond/inter/jetbrainsMono` with `--font-*` vars) | Already wired into `(dashboard)/layout.tsx:50-52`. Zero font work (D-03). |
| Flag resolver pattern | `src/lib/auth/inbox-v2.ts` (`getIsInboxV2Enabled`) + `src/lib/auth/dashboard-v2.ts` | Clone to `src/lib/auth/editorial-v3.ts` (`getIsEditorialV3Enabled`). Fails closed to `false`. |
| `mx-tag--*` color-mix tag system | globals.css:485-527 (under `.theme-editorial`) + `MxTag` component `whatsapp/components/mx-tag.tsx` | Re-author the CSS under `.theme-editorial-v3`; the `MxTag` React component is scope-agnostic (just emits classes) — reuse as-is for CRM/Pedidos tags (D-09). |
| `.scrollbar-overlay` thin-scrollbar utility | globals.css:954-982 (NOT scoped to `.theme-editorial`) | Already global — reuse directly for kanban/list scroll (D-08 thin-scrollbars). |
| Playwright config + `e2e/` harness | `playwright.config.ts` (baseURL `localhost:3020`, webServer `pnpm/npm run dev`) | Add a `e2e/visual/` spec; reuse the running-dev-server webServer block. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pixelmatch + pngjs | Playwright built-in `toHaveScreenshot()` | `toHaveScreenshot` compares render-vs-baseline-render (golden snapshots), NOT render-vs-external-mock-PNG. D-10 needs **mock HTML vs real render** comparison, which means rendering BOTH in Playwright and diffing — pixelmatch gives an explicit mismatch ratio (the ≥95% gate number). Recommend pixelmatch for the gate metric; `toHaveScreenshot` can additionally lock regression baselines if desired. |
| pixelmatch | odiff / resemblejs | pixelmatch is the smallest, most widely used, zero-config option and integrates trivially with pngjs buffers. No reason to deviate. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token definitions (`--ink-*`, `--paper-*`, `.mx-*`) | CSS / globals.css | — | Pure styling; scoped by class selector. No JS. |
| Scope-class application (gating) | Frontend Server (RSC) | — | `(dashboard)/layout.tsx` is a Server Component; resolves flag server-side and emits the class (fails closed). |
| Flag resolution | Frontend Server (RSC) | Database (Supabase `workspaces.settings`) | `getIsEditorialV3Enabled` reads JSONB server-side; mirrors `getIsInboxV2Enabled`. |
| Dark-mode toggle | Browser / Client | — | `next-themes` writes `.dark` to `<html>` client-side; CSS cascade does the rest. No new JS for dark. |
| Markup/class port | CSS + JSX (component files) | — | Real components keep their data wiring; only markup + className change (D-08). |
| Fidelity verification | Build/CI tooling (Playwright headless) | — | Out-of-band test harness; not shipped to users. |

## Architecture Patterns

### System Architecture Diagram — the isolation flow

```
                        workspaces.settings (Supabase JSONB)
                          ├─ ui_inbox_v2.enabled      ──┐  (LIVE in Somnio = true)
                          ├─ ui_dashboard_v2.enabled  ──┤  (OFF in Somnio)
                          └─ ui_editorial_v3.enabled  ──┤  (NEW, default false)
                                                        │
                       ┌────────────────────────────────┘
                       ▼  (read server-side, fails closed)
         ┌─────────────────────────────────────────────────────────┐
         │  RESOLVERS (src/lib/auth/*.ts — Server Components only)   │
         │  getIsInboxV2Enabled · getIsDashboardV2Enabled ·         │
         │  getIsEditorialV3Enabled (NEW, clone of inbox-v2)         │
         └─────────────────────────────────────────────────────────┘
                       │                         │
        ┌──────────────┘                         └──────────────┐
        ▼ APPLICATION SITE A                      ▼ APPLICATION SITE B
  whatsapp/inbox-layout.tsx:154            (dashboard)/layout.tsx:54
  className: v2 && 'theme-editorial'       className: isEditorialV3 && 'theme-editorial-v3'
  (LEGACY — UNTOUCHED)                      (NEW scope — gates all 3 content areas this round)
        │                                         │
        ▼                                         ▼
  ── globals.css ────────────────────────────────────────────────────
  .theme-editorial { … }          .theme-editorial-v3 { … }   ← NEW block
  .dark .theme-editorial { … }    .dark .theme-editorial-v3 { … } ← NEW dark
  (lines 134–945, BYTE-FROZEN)    (appended after legacy block)
  ────────────────────────────────────────────────────────────────────
        │                                         │
        ▼                                         ▼
  Renders OLD warm-cream            Renders NEW white-paper editorial
  (Conversaciones v2 live)          (Conversaciones/Contactos/Pedidos v3)

  next-themes ─ toggles `.dark` on <html> (global ancestor) ─ cascades into BOTH scopes
```

**The two systems are isolated by class name, not by flag.** Because the live Conversaciones reads `.theme-editorial` from a SEPARATE application site (`inbox-layout.tsx:154`, gated by `ui_inbox_v2`), and the new system uses `.theme-editorial-v3` from `(dashboard)/layout.tsx`, the two never share a selector. The legacy block is never edited → byte-identical production (Regla 6 satisfied).

### Pattern 1: New scope class `.theme-editorial-v3` (D-05) — VERIFIED
**What:** Author the entire new token system + component rules under `.theme-editorial-v3`, appended AFTER the frozen legacy block in `globals.css`. Selector rename is 1:1 — every mock `.theme-editorial X` becomes `.theme-editorial-v3 X`.
**Why this is correct (grounded):** UI-SPEC §2's proposal is verified against globals.css. The legacy `.theme-editorial` block spans lines 134–945 (tokens, `.dark .theme-editorial` at 309, `.mx-*`, `.sb/.btn/.tg/table.dict/.tabs/.chip`, kanban `.kcard`, `--bg-app/--bg-sidebar` re-opened at 894, `html:has(.theme-editorial) body` at 904). Touching ANY of it risks the live render. A new scope class avoids all of that.
**Critical sub-rule:** the new block uses **plain CSS variable declarations**, NOT `@theme` — Tailwind v4 forbids nested `@theme` (see Pitfalls 1). This mirrors the existing comment at globals.css:126-129 and the legacy block's own approach.

### Pattern 2: Flag resolver clone (D-04) — no migration
**What:** Create `src/lib/auth/editorial-v3.ts` exporting `getIsEditorialV3Enabled(workspaceId)`, a byte-for-byte structural clone of `getIsInboxV2Enabled` reading JSONB path `workspaces.settings.ui_editorial_v3.enabled`. Apply at `(dashboard)/layout.tsx` next to the existing `isDashboardV2` resolution.
**Why no migration:** the flag lives as a sub-key inside the existing `workspaces.settings` JSONB column (already holds `ui_inbox_v2`, `ui_dashboard_v2`). Adding `ui_editorial_v3` writes to the same column — **zero schema change, Regla 5 trivially satisfied.** Activation is a manual `UPDATE workspaces SET settings = jsonb_set(...)` post-QA.
**Fails closed:** any error / null settings / missing key → `false` → user sees current UI (Regla 6).

### Pattern 3: Dark-mode wiring (D-02) — descendant selector, NOT compound — VERIFIED CRITICAL
**What:** Author the dark override as `.dark .theme-editorial-v3 { … }` (descendant: `.dark` ancestor + scoped element), NOT the mock's compound `.theme-editorial-v3.dark`.
**Why (grounded in real code):**
- `next-themes` is configured `attribute="class"` (`app/layout.tsx:34`) → it toggles the `.dark` class on the `<html>` element, a global ancestor of every scoped container.
- The mocks (`crm-editorial.html:252`, `conversaciones/index.html:233`, `pedidos-editorial.html:302`) author dark as compound `.theme-editorial.dark` — dark class on the SAME element as the scope. **In this codebase that element never gets `.dark`** (next-themes puts it on `<html>`), so the compound selector would never match → dark mode silently broken.
- The existing globals.css:309 `.dark .theme-editorial { … }` proves the descendant cascade works: it's the live defensive block that re-asserts light tokens when `<html>.dark` is on. Reuse the SAME selector shape, but for v3 author the FULL dark palette (UI-SPEC §5.3 values) instead of light re-assertion.
- Tailwind v4's `@custom-variant dark (&:is(.dark *))` (globals.css:4) confirms `.dark` is treated as an ancestor-scoped variant.
**Logo rule** ports as `.dark .theme-editorial-v3 .wm img { mix-blend-mode:screen; filter:invert(1) hue-rotate(180deg); }` (descendant form). (Sidebar/`.wm` is deferred D-06 — author the rule for correctness but the sidebar markup isn't reskinned this round.)
**Alternative (NOT recommended):** mirror `resolvedTheme==='dark'` onto the scoped element via a client `useTheme()` wrapper to preserve the literal compound selector. Rejected: adds hydration-flash risk + client JS for zero benefit; the descendant selector is simpler and already proven in this file.

### Pattern 4: Verbatim-port methodology (anti-drift — the 89% vs 35% lesson)
**What:** The concrete process that prevents reinterpretation drift. Derived from MEMORY (CRM retrofit 89% PASS via verbatim port; dashboard 35% BLOCK via reinterpretation onto shadcn).

Per-screen port loop:
1. **Open the canonical mock** (`ui_kits/.../*-editorial.html` or `index.html`) and the **real component** side by side.
2. **Copy the mock's semantic HTML structure** (`<section>/<aside>/<table>/<input>`) and **class names VERBATIM** into the real JSX — do NOT translate to shadcn `<Badge>/<Card>/<Button>` primitives. (The legacy `.theme-editorial .sb/.btn/.tg/table.dict` raw classes at globals.css:546-882 are the precedent — raw classes, not shadcn.)
3. **Rewire only data** — keep existing props, server actions, realtime subscriptions, event handlers. The markup is the mock's; the data is the real component's (D-08).
4. **Swap legacy `.tg.*` → `mx-tag--*`** (D-09) using the existing `MxTag` component.
5. **Screenshot-diff against the mock** (Pattern 4 harness) → iterate until ≥95%.

**The single rule that prevents 35%:** *the mock's class string is the source of truth; if the real component currently uses a shadcn primitive for that element, REPLACE the primitive with the mock's raw markup+class, do not re-style the primitive.* The 35% failure came from "apply tokens onto shadcn" (UI-REVIEW root cause P-1..P-5 in MEMORY).

### Recommended File Structure (additive — nothing deleted)
```
src/
├── app/
│   ├── globals.css                    # APPEND .theme-editorial-v3 block + .dark .theme-editorial-v3 (legacy block FROZEN)
│   └── (dashboard)/
│       ├── layout.tsx                 # add isEditorialV3 resolution + className gate
│       ├── whatsapp/components/**     # port markup+classes (preserve wiring)
│       └── crm/contactos|pedidos/**   # port markup+classes (preserve wiring)
├── lib/auth/
│   └── editorial-v3.ts                # NEW — clone of inbox-v2.ts
e2e/
└── visual/
    └── editorial-fidelity.spec.ts     # NEW — Playwright + pixelmatch harness
```

### Anti-Patterns to Avoid
- **Editing the legacy `.theme-editorial` block** to "share" tokens → instant Somnio regression. NEVER.
- **Nesting `@theme` inside `.theme-editorial-v3`** → Tailwind v4 build constraint violation (Pitfalls 1).
- **Using compound `.theme-editorial-v3.dark`** → never matches under next-themes `attribute="class"` (Pattern 3).
- **Re-styling shadcn primitives instead of porting raw mock markup** → the documented 35% drift.
- **Reintroducing CVA for tags** → `MxTag` deliberately avoids it (mx-tag.tsx comment); keep static classes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Feature-flag plumbing | A new flag table/column/context | Clone `getIsInboxV2Enabled` → JSONB sub-key on `workspaces.settings` | Pattern proven in prod (Somnio), fails closed, zero migration. |
| Tag pills | New badge component / CVA variants / hardcoded oklch | Existing `MxTag` component + `mx-tag--*` color-mix CSS (re-authored under v3) | Already built, scope-agnostic, color-mix over tokens (D-09). |
| Fonts | New `next/font` declarations | `(dashboard)/fonts.ts` exports (already wired into layout) | D-03 — zero font work. |
| Thin scrollbars | Per-component scrollbar CSS | Global `.scrollbar-overlay` utility (globals.css:954) | Already global, not scope-bound. |
| Dark-mode class toggling | A custom client wrapper mirroring theme onto the scope | next-themes' existing `<html>.dark` + descendant CSS selector | No new JS; cascade already reaches scoped elements (proven by globals.css:309). |
| Screenshot diffing | Custom canvas pixel loop | `pixelmatch` + `pngjs` driven by Playwright captures | Standard, gives an explicit mismatch ratio for the ≥95% gate. |

**Key insight:** This standalone's entire risk surface is *isolation discipline* + *port fidelity*, not building anything. Almost every primitive already exists in the repo from the two prior editorial rounds — the job is to clone the flag, append a scoped CSS block, port markup verbatim, and verify.

## Common Pitfalls

### Pitfall 1: Nesting `@theme` inside the scope class
**What goes wrong:** Authoring `.theme-editorial-v3 { @theme { … } }` (or any nested `@theme`) breaks the Tailwind v4 build.
**Why it happens:** The mock CSS uses plain `:root`/class variables, but a porter might reach for `@theme` to "register" tokens.
**How to avoid:** Use plain CSS custom-property declarations inside `.theme-editorial-v3` (exactly as the legacy block does). `@theme` stays top-level only.
**Source:** [CITED: tailwindcss.com/docs/theme] — "Theme variables are also required to be defined top-level and not nested under other selectors or media queries." Confirmed by existing globals.css:126-129 comment. **[VERIFIED: official docs]**
**Warning sign:** build error referencing `@theme`, or tokens not resolving.

### Pitfall 2: Compound `.theme-editorial-v3.dark` dark selector never matches
**What goes wrong:** Dark palette silently does nothing; the scope renders light tokens even when the app is in dark mode.
**Why it happens:** The mocks author dark as compound (`.theme-editorial.dark`), but next-themes (`attribute="class"`, app/layout.tsx:34) puts `.dark` on `<html>`, not the scoped element. The two classes are on different elements → no match.
**How to avoid:** Author dark as descendant `.dark .theme-editorial-v3 { … }` (mirror globals.css:309). **[VERIFIED: app/layout.tsx:34 + globals.css:4,309 + mock crm-editorial.html:252]**
**Warning sign:** toggling dark in the UI changes nothing inside the v3 content areas.

### Pitfall 3: Verbatim-port drift (the 35% failure mode)
**What goes wrong:** Render reaches ~35% fidelity because mock markup was reinterpreted onto shadcn primitives instead of ported 1:1.
**Why it happens:** Executors default to "apply tokens to existing shadcn `<Card>/<Badge>`" rather than replacing markup with the mock's raw semantic HTML + classes.
**How to avoid:** Pattern 4 loop — copy mock class strings verbatim, replace primitives with raw markup, diff per screen ≥95% before declaring done.
**Source:** [VERIFIED: MEMORY — ui-redesign-dashboard 35% BLOCK vs CRM retrofit 89% PASS; UI-REVIEW P-1..P-5].
**Warning sign:** the JSX still imports `Badge`/`Card` where the mock uses `<span class="mx-tag…">`/`<div class="kcard">`.

### Pitfall 4: Leaking new tokens into the live legacy scope
**What goes wrong:** Editing any of globals.css lines 134–945 (e.g. "just updating `--paper-0`") regresses Conversaciones v2 live in Somnio.
**Why it happens:** D-01's "big-bang adopt" misread as "edit the existing block in place."
**How to avoid:** Treat the entire legacy `.theme-editorial` block as byte-frozen. The new system is APPENDED as `.theme-editorial-v3`. A `git diff` on the legacy line range must be empty.
**How to detect (verification gate):** `git diff` shows zero hunks inside the legacy block range; a Playwright regression shot of Somnio's `ui_inbox_v2`-live Conversaciones is byte-identical before/after.
**Warning sign:** any diff touching `.theme-editorial ` (with trailing space) selectors.

### Pitfall 5: Missing flag migration (false alarm — confirmed NOT needed)
**What goes wrong:** A porter assumes the flag needs a new column → adds migration churn, or worse, ships code reading a column that doesn't exist (Regla 5 incident pattern).
**Why it happens:** Over-caution.
**How to avoid:** The flag is a JSONB sub-key on the EXISTING `workspaces.settings` column — no migration. **[VERIFIED: inbox-v2.ts reads `settings.ui_inbox_v2.enabled` from the same column.]**

### Pitfall 6: Blast-radius leak into the sidebar / other modules
**What goes wrong:** Applying `.theme-editorial-v3` too high (e.g., wrapping the whole `(dashboard)` shell including the sidebar) reskins the deferred sidebar (D-06) or the other 6 modules (D-07).
**Why it happens:** The existing `ui_dashboard_v2` applies `.theme-editorial` at the layout root (`layout.tsx:54`), which cascades to everything — a known deuda (dashboard-v2.ts comment). Repeating that for v3 would pull in deferred scope.
**How to avoid:** Two options for the plan: (a) apply `.theme-editorial-v3` at the layout root but ONLY author content-area component rules (sidebar `.sb/.brand/.ws/.cat` rules NOT ported under v3 this round — they stay shadcn); or (b) apply the scope class on a wrapper INSIDE `<main>` so the sidebar is structurally excluded. Plan discretion — but the verification must confirm the sidebar renders unchanged. **The 3 content-area header bands must still visually align to the 84.6px switcher band (UI-SPEC §8) even though the sidebar chrome is untouched.**
**Warning sign:** sidebar fonts/colors change when the flag is on.

### Pitfall 7: pnpm-only install
**What goes wrong:** Installing pixelmatch/pngjs with `npm` desyncs `pnpm-lock.yaml` → broken Vercel deploys.
**How to avoid:** `pnpm add -D pixelmatch pngjs`. **[VERIFIED: MEMORY — whatsapp_crm_read_latency, "repo es pnpm-only", 4 broken deploys.]**

## Code Examples

### Isolation CSS structure (new scoped block coexisting with frozen legacy)
```css
/* globals.css — APPEND after the legacy .theme-editorial block (line ~1011).
 * Legacy .theme-editorial (lines 134–945) stays BYTE-UNTOUCHED.
 * NOTE: plain CSS vars — NEVER @theme here (Tailwind v4 top-level-only). */

.theme-editorial-v3 {
  color-scheme: light dark;            /* v3 supports both (legacy was light-only) */

  /* Light palette — verbatim from canonical mock inline block (UI-SPEC §5.1) */
  --bg-app: oklch(0.996 0.0008 95);
  --paper-0: oklch(1 0 0);             /* pure white paper (differs from legacy 0.995 0.008 85) */
  --paper-1: oklch(0.998 0.0006 85);
  /* … full ink/paper/rubric/accent scale per UI-SPEC §5 … */

  /* shadcn semantic mapping — --primary = ink-1, NOT rubric (UI-SPEC §5.1) */
  --primary: var(--ink-1);
  --primary-foreground: var(--paper-0);
  --background: var(--paper-1);
  --card: var(--paper-0);
  /* … */
  --radius: var(--radius-3);

  background-color: var(--bg-app);
  font-family: var(--font-sans);       /* sans base; serif via explicit .mx-* (legacy lesson, line 270) */
}

/* All component rules ported 1:1 from mock, selector renamed .theme-editorial → .theme-editorial-v3 */
.theme-editorial-v3 .mx-display { font-family: var(--font-display); font-weight: 800; /* … */ }
.theme-editorial-v3 .mx-tag--rubric { background: color-mix(in oklch, var(--rubric-2) 10%, var(--paper-0)); /* … */ }
.theme-editorial-v3 table.dict { /* … */ }
.theme-editorial-v3 .kcard { /* … loose kanban card … */ }
```

### Dark-mode selector (descendant — matches next-themes `<html>.dark`)
```css
/* CORRECT for this codebase — descendant, mirrors globals.css:309 pattern.
 * NOT the mock's compound `.theme-editorial-v3.dark` (would never match here). */
.dark .theme-editorial-v3 {
  --bg-app: oklch(0.215 0.006 60); --bg-sidebar: oklch(0.215 0.006 60);
  --paper-0: oklch(0.255 0.006 60); --paper-1: oklch(0.235 0.006 60);
  --paper-2: oklch(0.285 0.007 60); --paper-3: oklch(0.315 0.008 60); --paper-4: oklch(0.355 0.009 60);
  --ink-1: oklch(0.95 0.006 85); --ink-2: oklch(0.86 0.008 85); --ink-3: oklch(0.70 0.010 80);
  --ink-4: oklch(0.56 0.010 75); --ink-5: oklch(0.42 0.010 70);
  --border: oklch(0.37 0.008 70); --rubric-2: oklch(0.64 0.11 30); --rubric-1: oklch(0.72 0.10 30);
  --paper-grain: none; background-color: var(--bg-app);
}
.dark .theme-editorial-v3 .wm img { mix-blend-mode: screen; filter: invert(1) hue-rotate(180deg); }
/* light logo (descendant, base scope): */
.theme-editorial-v3 .wm img { mix-blend-mode: multiply; }
```
> Values transcribed verbatim from mock `crm-editorial.html:252-259` (UI-SPEC §5.3). Only the selector form differs (descendant vs compound) — this is the one allowed deviation, mandated by the next-themes wiring.

### layout.tsx gating conditional
```tsx
// (dashboard)/layout.tsx — add next to existing isDashboardV2 resolution
import { getIsEditorialV3Enabled } from '@/lib/auth/editorial-v3'

const isEditorialV3 = activeWorkspaceId
  ? await getIsEditorialV3Enabled(activeWorkspaceId)   // fails closed to false
  : false

// in the className (keep existing classes):
className={cn(
  ebGaramond.variable, inter.variable, jetbrainsMono.variable,
  'flex h-screen',
  isDashboardV2 && 'theme-editorial',        // legacy — untouched
  isEditorialV3 && 'theme-editorial-v3',     // NEW
)}
// NOTE (Pitfall 6): if the sidebar must be excluded structurally, apply
// 'theme-editorial-v3' on a wrapper inside <main> instead of the shell root.
```

### Flag resolver (clone of inbox-v2.ts)
```ts
// src/lib/auth/editorial-v3.ts
import { createClient } from '@/lib/supabase/server'

export async function getIsEditorialV3Enabled(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workspaces').select('settings').eq('id', workspaceId).single()
    if (error || !data) return false
    const settings = (data.settings as Record<string, unknown> | null) ?? {}
    const ns = settings.ui_editorial_v3 as Record<string, unknown> | undefined
    return ns?.enabled === true
  } catch { return false }
}
```
**Activation SQL (manual, post-QA — no migration):**
```sql
UPDATE workspaces
SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),
                         '{ui_editorial_v3,enabled}', 'true'::jsonb, true)
WHERE id = '<workspace-uuid>';
-- rollback: same with 'false'
```

### Playwright + pixelmatch fidelity harness (skeleton)
```ts
// e2e/visual/editorial-fidelity.spec.ts
import { test, expect } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const MOCK_DIR = '.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits'
const VIEWPORT = { width: 1440, height: 900 }
const GATE = 0.95   // ≥95% pixel-match (D-10)

async function shoot(page, url: string) {
  await page.setViewportSize(VIEWPORT)
  await page.goto(url, { waitUntil: 'networkidle' })
  return PNG.sync.read(await page.screenshot({ fullPage: false }))
}

function matchRatio(a: PNG, b: PNG) {
  const { width, height } = a
  const diff = new PNG({ width, height })
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 })
  return { ratio: 1 - mismatched / (width * height), diff }
}

for (const screen of [
  { name: 'conversaciones', real: '/whatsapp', mock: `${MOCK_DIR}/conversaciones/index.html` },
  { name: 'contactos',      real: '/crm/contactos', mock: `${MOCK_DIR}/crm/crm-editorial.html` },
  { name: 'pedidos',        real: '/crm/pedidos',   mock: `${MOCK_DIR}/pedidos/pedidos-editorial.html` },
]) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${screen.name} — ${mode} ≥95%`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode })            // drives next-themes system / .dark
      const realPng = await shoot(page, screen.real)            // flag-ON test workspace required
      const mockPng = await shoot(page, `file://${path.resolve(screen.mock)}`)
      const { ratio, diff } = matchRatio(realPng, mockPng)
      if (ratio < GATE) {
        // write diff PNG for human review: PNG.sync.write(diff) → artifact
      }
      expect(ratio, `${screen.name}/${mode} fidelity`).toBeGreaterThanOrEqual(GATE)
    })
  }
}
```
> Practical notes for the planner: (1) the harness needs a **test workspace with `ui_editorial_v3.enabled=true`** and a logged-in session (reuse `e2e/fixtures/`). (2) Mock HTML and real render have different DATA (mocks are static) → expect content text to differ; gate on **layout/color fidelity per region**, or screenshot specific stable regions (topbar, kanban column chrome, tag pills) rather than full content. (3) For dark, `emulateMedia({colorScheme:'dark'})` works only if next-themes is in `system` mode; otherwise set the theme cookie/localStorage to `'dark'` before navigation. (4) Run headless against `localhost:3020` (playwright.config webServer already starts dev).

## Runtime State Inventory

> This is a reskin (CSS + markup), not a rename/migration. No stored data, OS state, or build artifacts carry semantic strings that change.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The flag value lives in `workspaces.settings` JSONB as a NEW sub-key `ui_editorial_v3.enabled`. No existing records reference it (default-absent = false). | Manual SQL `UPDATE` per workspace at activation (post-QA). No backfill. |
| Live service config | None — no external service, cron, or webhook references this UI flag. | None — verified by grep (only `ui_inbox_v2`/`ui_dashboard_v2` flags exist in `src/lib/auth`). |
| OS-registered state | None. | None. |
| Secrets/env vars | None — flag is DB-stored, not env. `PLAYWRIGHT_BASE_URL` already exists for the harness. | None. |
| Build artifacts | None — CSS/JSX only; no compiled package, no egg-info, no image tags. | None. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Playwright | D-10 verification | ✓ | @playwright/test ^1.59.1 | — |
| pixelmatch | D-10 diff ratio | ✗ | — | `pnpm add -D pixelmatch` (no viable fallback for the gate metric) |
| pngjs | D-10 PNG buffers | ✗ | — | `pnpm add -D pngjs` |
| Dev server on :3020 | Playwright webServer | ✓ (config present) | — | — |
| Fonts (EB Garamond/Inter/JetBrains Mono) | All editorial type | ✓ | loaded via next/font | — |
| pnpm | install | ✓ (repo is pnpm-only) | — | NEVER npm (Pitfall 7) |

**Missing dependencies with fallback:** pixelmatch + pngjs — install via pnpm (devDependencies). Blocks the D-10 gate only, not the reskin itself.

## Validation Architecture

> `.planning/config.json` `workflow.nyquist_validation` not confirmed false → section included. This is a UI reskin: the primary validation is the **visual fidelity gate (D-10)**, not unit logic. Existing component logic (data wiring) is preserved untouched (D-08), so behavioral regression risk is low; the testable surface is (a) flag-resolver correctness and (b) screenshot fidelity.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright `@playwright/test` ^1.59.1 (E2E + visual) + Vitest (existing, for the flag resolver unit test) |
| Config file | `playwright.config.ts` (baseURL `localhost:3020`, single worker, chromium) |
| Quick run command | `pnpm test:e2e e2e/visual/editorial-fidelity.spec.ts` |
| Full suite command | `pnpm test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-04 | Flag fails closed to false; reads JSONB sub-key | unit | `pnpm vitest run src/lib/auth/__tests__/editorial-v3.test.ts` | ❌ Wave 0 |
| D-05 | Legacy `.theme-editorial` block byte-unchanged | static gate | `git diff --stat src/app/globals.css` shows only appended lines | ❌ Wave 0 (CI grep) |
| D-10 | Each screen ≥95% pixel-match, light+dark | visual | `pnpm test:e2e e2e/visual/editorial-fidelity.spec.ts` | ❌ Wave 0 |
| D-02 | Dark mode renders charcoal palette under `.dark .theme-editorial-v3` | visual | included in D-10 dark cases | ❌ Wave 0 |
| Regla 6 | Somnio `ui_inbox_v2`-live Conversaciones byte-identical pre/post | visual regression | Playwright shot of `/whatsapp` with `ui_inbox_v2` workspace, diff vs pre-change baseline | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** typecheck + the flag-resolver unit test (fast).
- **Per wave merge:** the per-screen visual fidelity spec for screens touched in that wave.
- **Phase gate:** all 6 visual cases (3 screens × light/dark) ≥95% + the Regla 6 regression shot byte-identical, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `e2e/visual/editorial-fidelity.spec.ts` — covers D-10 (3 screens × 2 modes) + Regla 6 regression
- [ ] `src/lib/auth/__tests__/editorial-v3.test.ts` — covers D-04 fail-closed
- [ ] `e2e/fixtures/` extension — a test workspace with `ui_editorial_v3.enabled=true` + authed session
- [ ] devDeps install: `pnpm add -D pixelmatch pngjs`
- [ ] CI/static gate: `git diff` guard that fails if the legacy `.theme-editorial` line range changed (D-05)

## Security Domain

> `security_enforcement` not explicitly false → included. This is a client-side visual reskin with one server-side flag read. Minimal attack surface.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth changes; layout already redirects unauthenticated users (`layout.tsx:21`). |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | yes (minor) | Flag read is workspace-scoped via `activeWorkspaceId` resolved server-side — same isolation as existing flags. A user cannot enable v3 for another workspace (no client-controlled workspace id). |
| V5 Input Validation | yes (minor) | Flag value is a server-read boolean from trusted DB JSONB; no user input enters CSS. The reskin renders existing data through new markup — ensure ported JSX keeps existing output escaping (React default). No `dangerouslySetInnerHTML` introduced. |
| V6 Cryptography | no | None. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via ported markup | Tampering/Info-disclosure | Keep React's default escaping; do NOT introduce `dangerouslySetInnerHTML` when porting mock HTML. The mock is static HTML — translate to JSX, never inject as raw string. |
| Cross-workspace flag leakage | Info disclosure | Flag resolved from `activeWorkspaceId` server-side (never from client) — mirrors `getIsInboxV2Enabled`. |
| Regla 6 production regression (operational risk, not security) | Availability | Class-name isolation + frozen legacy block + fail-closed flag + Playwright regression shot. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pixelmatch ^6 / pngjs ^7 are the current major versions | Standard Stack | Low — verify with `npm view` before pinning; API is stable across majors. |
| A2 | The mock data differs from real data, so full-page pixel diff needs region-scoping or stable-chrome targeting to hit a meaningful ≥95% | Code Examples / Validation | Medium — if the planner expects naive full-page diff, the gate may false-fail on content text. Mitigation noted in harness practical notes. The ≥95% gate should be applied to layout/chrome/color regions, with a human reviewing diff PNGs (matches MEMORY's "user visual PASS" precedent). |
| A3 | Applying `.theme-editorial-v3` at the layout root (like the existing `ui_dashboard_v2`) is acceptable as long as sidebar `.sb/*` rules are NOT authored under v3 this round | Pitfall 6 | Medium — if the sidebar shares structural classes that v3 happens to define, it could leak. Plan must confirm sidebar renders unchanged (the deferred-sidebar guard). |

## Open Questions

1. **Scope-class application site: layout root vs `<main>` wrapper (Pitfall 6).**
   - What we know: existing `ui_dashboard_v2` applies `.theme-editorial` at the shell root (`layout.tsx:54`), cascading to sidebar + all modules (known deuda).
   - What's unclear: whether the plan applies v3 at the same root (relying on "don't author sidebar rules under v3") or on a wrapper inside `<main>` (structurally excludes the sidebar).
   - Recommendation: prefer the `<main>` wrapper for clean blast-radius isolation (D-06), UNLESS the content-area header bands need the sidebar's `84.6px` alignment context — verify during planning which gives correct vertical alignment. Either is viable; the verification gate (sidebar unchanged) is the real guard.

2. **Visual-diff gate granularity (A2).**
   - What we know: D-10 mandates ≥95% pixel-match; mocks are static with placeholder data.
   - What's unclear: full-page diff vs region-scoped diff vs human-reviewed diff PNGs.
   - Recommendation: Playwright + pixelmatch produces the ratio + a diff artifact; gate the automated number on stable chrome regions (topbar, tabs, kanban column heads, tag pills, table frame) and have the operator eyeball the diff PNG for content areas — consistent with how prior rounds reached "user visual PASS" (MEMORY: CRM retrofit). The planner should decide the exact region set per screen.

## Sources

### Primary (HIGH confidence)
- `src/app/globals.css` (read in full) — legacy `.theme-editorial` block lines 134–945, `.dark .theme-editorial` at 309, `@custom-variant dark` at 4, `@theme inline` top-level at 6, `--bg-app/--bg-sidebar` + `html:has(.theme-editorial) body` at 894-911, `.scrollbar-overlay` at 954, `.kcard` at 927.
- `src/app/(dashboard)/layout.tsx` — class application site (line 54), flag resolution pattern (line 33).
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx:154` — the SEPARATE `.theme-editorial` application site for live Conversaciones (`ui_inbox_v2`).
- `src/app/layout.tsx:33-38` — next-themes `attribute="class"` config (the dark-wiring crux).
- `src/lib/auth/inbox-v2.ts` + `dashboard-v2.ts` — flag resolver pattern + JSONB storage (no migration).
- `src/components/providers/theme-provider.tsx` + `components/layout/theme-toggle.tsx` — next-themes usage.
- `(dashboard)/fonts.ts` — fonts already loaded (D-03).
- `whatsapp/components/mx-tag.tsx` — reusable `MxTag` component (no CVA).
- `playwright.config.ts` + `e2e/` — installed verification harness.
- Canonical mocks: `ui_kits/crm/crm-editorial.html` (dark block lines 252-259), `conversaciones/index.html:233`, `pedidos-editorial.html:302` — confirm compound `.theme-editorial.dark` mock selector.
- `HANDOFF.md:45-46` — "togglear `dark` en el contenedor raíz … `next-themes` … mapear `theme==='dark'` → clase `dark`."
- `package.json` — verified versions (next ^16.1.6, react 19.2.3, tailwindcss ^4, next-themes ^0.4.6, @playwright/test ^1.59.1).
- [VERIFIED: tailwindcss.com/docs/theme] — `@theme` must be top-level, cannot nest under selectors/media queries.

### Secondary (MEDIUM confidence)
- MEMORY (project) — ui-redesign-dashboard 35% BLOCK vs CRM retrofit 89% PASS (verbatim-port lesson); whatsapp_crm_read_latency (pnpm-only); ui_redesign_inbox_v2 (flag rollout precedent).

### Tertiary (LOW confidence)
- pixelmatch/pngjs current major versions (A1) — assumed from general ecosystem knowledge; verify with `npm view` before pinning.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against package.json; only the (single) new dep needs a version confirm.
- Isolation architecture (D-05): HIGH — grounded in the actual globals.css selectors + two distinct application sites + frozen-block strategy.
- Dark-mode wiring (D-02): HIGH — the compound-vs-descendant pitfall is verified against next-themes config + the existing `.dark .theme-editorial` precedent + the mock's literal selector.
- Flag storage (D-04/Regla 5): HIGH — verified JSONB sub-key reuse, zero migration.
- Tailwind `@theme` constraint (Pitfall 1): HIGH — confirmed by official docs.
- Verification tooling (D-10): MEDIUM-HIGH — Playwright installed; pixelmatch standard; the only soft spot is diff granularity against static mocks (Open Q2 / A2).

**Research date:** 2026-06-05
**Valid until:** ~2026-07-05 (stable stack; re-verify pixelmatch/pngjs versions and next-themes behavior if the dep tree changes)
