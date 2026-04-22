---
phase: ui-redesign-conversaciones
plan: 06
type: execute
wave: 3
depends_on: [05]
files_modified:
  - docs/analysis/04-estado-actual-plataforma.md
  - .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md
autonomous: false
requirements:
  - D-03
  - D-04
  - D-05
  - D-12
  - D-19
  - D-20

must_haves:
  truths:
    - "Verificación grep DoD ejecutada: `grep -rE 'oklch\\(' src/app/\\(dashboard\\)/whatsapp/components/*.tsx` retorna SOLO usos dentro de string literals `color-mix(in oklch, ...)` referenciando `var(--*)` — CERO valores OKLCH literales hardcoded en componentes (UI-SPEC §16 DoD)"
    - "Verificación grep DoD: `grep -rE '\\.tg\\.(red|gold|indi|ver)' src/app/\\(dashboard\\)/whatsapp/` retorna 0 resultados (clases legacy `.tg.*` del mock NUNCA usadas — UI-SPEC §7.12)"
    - "Verificación grep DoD: `grep -E 'mx-tag|mx-h[0-9]|mx-body|mx-caption|mx-smallcaps' src/app/\\(dashboard\\)/whatsapp/components/*.tsx` retorna usos confinados al módulo (no leakage a otros directorios)"
    - "Verificación grep DoD: `grep -rE 'mx-tag' src/app/\\(dashboard\\)/crm/ src/app/\\(dashboard\\)/tareas/ src/app/\\(dashboard\\)/automatizaciones/` retorna 0 resultados (CSS scope mantiene aislamiento — Pitfall 8)"
    - "Verificación Regla 6: `git diff main -- src/lib/agents/ src/lib/inngest/ src/app/actions/conversations.ts src/lib/whatsapp/ src/components/layout/sidebar.tsx src/lib/domain/` muestra CERO cambios (lógica del agente productivo intocada)"
    - "Verificación Regla 6: `git diff main -- src/app/\\(dashboard\\)/whatsapp/components/agent-config-slider.tsx src/app/\\(dashboard\\)/whatsapp/components/debug-panel-production/ src/app/\\(dashboard\\)/whatsapp/components/availability-toggle.tsx src/app/\\(dashboard\\)/whatsapp/components/window-indicator.tsx src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx src/app/\\(dashboard\\)/whatsapp/components/new-conversation-modal.tsx src/app/\\(dashboard\\)/whatsapp/components/template-send-modal.tsx src/app/\\(dashboard\\)/whatsapp/components/view-order-sheet.tsx src/app/\\(dashboard\\)/whatsapp/components/create-contact-sheet.tsx src/app/\\(dashboard\\)/whatsapp/components/create-order-sheet.tsx src/app/\\(dashboard\\)/whatsapp/components/media-preview.tsx src/app/\\(dashboard\\)/whatsapp/components/emoji-picker.tsx src/app/\\(dashboard\\)/whatsapp/components/quick-reply-autocomplete.tsx src/app/\\(dashboard\\)/whatsapp/components/template-button.tsx src/app/\\(dashboard\\)/whatsapp/components/template-preview.tsx src/app/\\(dashboard\\)/whatsapp/components/conversation-tag-input.tsx` muestra CERO cambios (D-19 / D-20 NO-TOUCH list verificada)"
    - "Verificación de hooks intocados: `git diff main -- src/hooks/use-conversations.ts src/hooks/use-messages.ts` muestra CERO cambios (D-19)"
    - "Verificación D-12 (Brand lockup OUT-OF-SCOPE): `git diff main -- src/components/layout/sidebar.tsx` muestra CERO cambios + `! grep -rE \"morf·x\\|Brand\" src/app/\\(dashboard\\)/whatsapp/components/` retorna 0 (no se introdujo `<Brand />` ni el lockup `morf·x` en el módulo — sidebar global queda diferida al standalone `ui-redesign-dashboard-chrome`)"
    - "QA visual lado a lado (D-03) ejecutado por usuario: workspace de pruebas con `ui_inbox_v2.enabled=true` capturado en screenshot vs mismo workspace con `ui_inbox_v2.enabled=false` capturado en screenshot — diferencia visual completa, cero regresión funcional (botones funcionan, mensajes se envían, conversaciones se cargan)"
    - "QA Safari retina (Pitfall 6) ejecutado por usuario: scroll en thread + scroll en lista en Safari macOS retina con flag ON — frame rate ≥55fps via DevTools Performance recording. Si <55fps, aplicar fallback `::before` (commented block ya presente en globals.css de Wave 0)"
    - "axe-core scan automatizado: `npx @axe-core/cli http://localhost:3020/whatsapp --tags wcag2a,wcag2aa --exit` con flag ON retorna exit 0 (cero violations serious/critical); si no automatizable, snippet DevTools console con axe-core CDN ejecutado y 0 violations serious/critical en el module scope (UI-SPEC §16 DoD item 9)"
    - "CLS measurement (UI-SPEC §16 DoD item 4): `npx lighthouse http://localhost:3020/whatsapp --only-categories=performance --quiet --chrome-flags='--headless'` reporta CLS < 0.1 en carga inicial con fuentes EB Garamond + Inter + JetBrains Mono cargadas"
    - "Dark mode persistence (UI-SPEC §16 DoD item 11): toggle global del dashboard a dark via next-themes + navegar a /whatsapp con flag ON → inspect DOM del `.theme-editorial` wrapper confirma `color-scheme: light` efectivo y paleta editorial permanece light (override del dark global dentro del scope)"
    - "Responsive breakpoints (UI-SPEC §16 DoD item 12): Chrome DevTools device toolbar prueba en 1280px / 1024px / 768px — cero horizontal overflow (body scrollWidth <= clientWidth), todas las ibtn accesibles (a <768px pueden colapsar a MoreHorizontal dropdown per UI-SPEC §8.3 — verificar funcional)"
    - "`docs/analysis/04-estado-actual-plataforma.md` actualizado (Regla 4 — BLOQUEANTE) con sección sobre el módulo Conversaciones editorial: feature flag `ui_inbox_v2.enabled` documented, lista de 8 componentes re-skineados, referencia a `.planning/standalone/ui-redesign-conversaciones/`, status 'IN ROLLOUT' con instrucción de flip via SQL para activación"
    - "`.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md` creado con: commits ranges Plan 01-05, patrones establecidos (scoped CSS class wrapper Tailwind v4, per-route font preload, DropdownMenu portal container re-rooting, useInboxV2 context vs prop drilling, mock-pixel-perfect vs grid alignment trade-offs from UI-SPEC §5.1, hsl(var(--background)) bug fix), pitfalls evitados (color-mix browser support, Cormorant skip, Cormorant fallback to Times not loaded), drop-candidates de UI-SPEC §6.2 que efectivamente se aplicaron, deferred items (snooze field si no existió [DEFERRED-D18.md], channel error banner si no existió, portal sweep deferrals from Plan 05 Task 4), instrucciones de rollout (SQL UPDATE per workspace), procedimiento de rollback (set flag false → instant revert)"
    - "Push a Vercel ejecutado: `git push origin main` con commits de toda la fase (Plans 01-06) — Regla 1"
  artifacts:
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Section: Conversaciones módulo editorial (v2 flag + componentes + rollout)"
      contains: "ui_inbox_v2"
    - path: ".planning/standalone/ui-redesign-conversaciones/LEARNINGS.md"
      provides: "Phase learnings: patterns, pitfalls, deferred, rollout guide"
  key_links:
    - from: "docs/analysis/04-estado-actual-plataforma.md"
      to: ".planning/standalone/ui-redesign-conversaciones/"
      via: "explicit path reference"
      pattern: "ui-redesign-conversaciones"
---

<objective>
Wave 5 — DoD verification + documentation. Run all the grep checks, accessibility scans, side-by-side QA, CLS measurement, dark-mode persistence check, and responsive breakpoint test from UI-SPEC §16 Definition of Done. Document the phase in LEARNINGS.md and update the platform state doc (Regla 4 BLOQUEANTE).

**Purpose:** Close the standalone phase. After this, the editorial re-skin is shipped behind a flag, the user can flip it per-workspace via SQL, and the documentation reflects the new feature accurately. Full UI-SPEC §16 DoD (12 items) is verified.

**Output:** Verified DoD checklist (all 12 items), updated platform state, LEARNINGS file, push to Vercel. Phase closed.

**This plan is `autonomous: false`** because several checkpoints require user action: D-03 side-by-side QA screenshots, Pitfall 6 Safari retina test, dark-mode toggle inspection, responsive breakpoint functional test.
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
@.planning/standalone/ui-redesign-conversaciones/05-PLAN.md
@docs/analysis/04-estado-actual-plataforma.md
@CLAUDE.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: DoD grep + axe-core verification suite (UI-SPEC §16 — automatable items)</name>
  <files></files>
  <read_first>
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §16 Definition of Done (all 12 items)
  </read_first>
  <action>
    Execute the following verification commands in sequence and capture their output. Each must pass per the criteria below. If ANY fails, fix the underlying violation in the appropriate file BEFORE proceeding to Task 2:

    **Check 1 — No hardcoded OKLCH in component TSX (UI-SPEC §16 DoD item 6):**
    ```bash
    grep -rE 'oklch\(' "src/app/(dashboard)/whatsapp/components/" | grep -v "color-mix" | grep -v "\.test\.tsx" || echo "PASS: no hardcoded OKLCH"
    ```
    EXPECTED: only `PASS: no hardcoded OKLCH` printed, OR every match is inside a comment/string-literal that uses `var(--*)` references via `color-mix(in oklch, ...)`. RAW oklch values like `oklch(0.5 0.1 30)` in a className → FAIL.

    **Check 2 — No legacy `.tg.*` classes (UI-SPEC §16 DoD item 5):**
    ```bash
    grep -rE '\.tg\.(red|gold|indi|ver)' "src/app/(dashboard)/whatsapp/" || echo "PASS: no legacy tg classes"
    ```
    EXPECTED: `PASS: no legacy tg classes` (zero matches).

    **Check 3 — `mx-*` classes confined to /whatsapp (Pitfall 8 — no leakage):**
    ```bash
    grep -rE 'mx-tag|mx-h[0-9]|mx-body|mx-caption|mx-smallcaps|mx-display|mx-rubric|mx-mono' "src/app/(dashboard)/" --include="*.tsx" | grep -v "src/app/(dashboard)/whatsapp/" || echo "PASS: mx-* scoped to whatsapp module"
    ```
    EXPECTED: `PASS: mx-* scoped to whatsapp module` (no matches outside `/whatsapp`).

    **Check 4 — Regla 6 NO-TOUCH (UI-SPEC §16 DoD item 10) — agent productivo intacto:**
    ```bash
    git diff main -- \
      src/lib/agents/ \
      src/lib/inngest/ \
      src/app/actions/conversations.ts \
      src/lib/whatsapp/ \
      src/components/layout/sidebar.tsx \
      src/lib/domain/ \
      src/hooks/use-conversations.ts \
      src/hooks/use-messages.ts \
      src/app/\(dashboard\)/whatsapp/components/agent-config-slider.tsx \
      src/app/\(dashboard\)/whatsapp/components/debug-panel-production/ \
      src/app/\(dashboard\)/whatsapp/components/availability-toggle.tsx \
      src/app/\(dashboard\)/whatsapp/components/window-indicator.tsx \
      src/app/\(dashboard\)/whatsapp/components/bold-payment-link-button.tsx \
      src/app/\(dashboard\)/whatsapp/components/new-conversation-modal.tsx \
      src/app/\(dashboard\)/whatsapp/components/template-send-modal.tsx \
      src/app/\(dashboard\)/whatsapp/components/view-order-sheet.tsx \
      src/app/\(dashboard\)/whatsapp/components/create-contact-sheet.tsx \
      src/app/\(dashboard\)/whatsapp/components/create-order-sheet.tsx \
      src/app/\(dashboard\)/whatsapp/components/media-preview.tsx \
      src/app/\(dashboard\)/whatsapp/components/emoji-picker.tsx \
      src/app/\(dashboard\)/whatsapp/components/quick-reply-autocomplete.tsx \
      src/app/\(dashboard\)/whatsapp/components/template-button.tsx \
      src/app/\(dashboard\)/whatsapp/components/template-preview.tsx \
      src/app/\(dashboard\)/whatsapp/components/conversation-tag-input.tsx \
      | wc -l
    ```
    EXPECTED: `0` (or only whitespace lines). If any of these files has a non-empty diff, FAIL — file MUST be reverted to match main (the change was an accident).

    **Exception:** `src/components/ui/dropdown-menu.tsx` may have ONE additive line (the `DropdownMenuPortal` re-export from Wave 3 Plan 04). Verify the diff is exactly that:
    ```bash
    git diff main -- src/components/ui/dropdown-menu.tsx
    ```
    EXPECTED: only an additive `export { DropdownMenuPortal }` (or similar one-line addition). No other changes.

    **Check 5 — Build clean (no TypeScript errors in modified files):**
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "src/app/\(dashboard\)/whatsapp|src/lib/auth/inbox-v2" | (! grep -E "error TS")
    ```
    EXPECTED: no `error TS####` lines for files in scope.

    **Check 6 — `--primary` mapped to `--ink-1` not `--rubric-2` (UI-SPEC §4 critical note):**
    ```bash
    grep -A 2 "\.theme-editorial" src/app/globals.css | grep -E "^\s*--primary:" | grep "var(--ink-1)" || echo "FAIL: --primary not mapped to --ink-1"
    ```
    EXPECTED: A line matching `--primary: var(--ink-1);`. If FAIL, edit globals.css to fix the mapping.

    **Check 7 — axe-core automated scan (UI-SPEC §16 DoD item 9):**

    First, ensure the dev server is running on http://localhost:3020 with a workspace that has `ui_inbox_v2.enabled=true`. Then:
    ```bash
    npx @axe-core/cli http://localhost:3020/whatsapp --tags wcag2a,wcag2aa --exit
    ```
    EXPECTED: exit code 0 (zero violations serious/critical).

    If the axe-core CLI cannot reach the localhost URL (CORS, auth middleware), fall back to the DevTools console snippet:
    ```javascript
    // Paste into DevTools console at http://localhost:3020/whatsapp (flag ON):
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js';
    s.onload = () => axe.run({ runOnly: ['wcag2a','wcag2aa'] }).then(r => {
      const serious = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      console.log('Violations serious/critical:', serious.length, serious);
    });
    document.head.appendChild(s);
    ```
    EXPECTED: console logs `Violations serious/critical: 0 []` or the `serious` array is empty within the `/whatsapp` module scope.

    If CLI succeeds, capture its output to `.planning/standalone/ui-redesign-conversaciones/axe-report.txt`. If fallback used, paste the console output into that file.

    ---

    Capture all 7 check outputs into a verification report file in `.planning/standalone/ui-redesign-conversaciones/dod-verification.txt`:
    ```bash
    {
      echo "=== DoD Verification Report ==="
      echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo
      echo "--- Check 1: no hardcoded OKLCH ---"
      grep -rE 'oklch\(' "src/app/(dashboard)/whatsapp/components/" | grep -v "color-mix" | grep -v "\.test\.tsx" || echo "PASS"
      echo
      echo "--- Check 2: no legacy .tg.* ---"
      grep -rE '\.tg\.(red|gold|indi|ver)' "src/app/(dashboard)/whatsapp/" || echo "PASS"
      echo
      echo "--- Check 3: mx-* scoped to /whatsapp ---"
      grep -rE 'mx-tag|mx-h[0-9]|mx-body|mx-caption|mx-smallcaps|mx-display|mx-rubric|mx-mono' "src/app/(dashboard)/" --include="*.tsx" | grep -v "src/app/(dashboard)/whatsapp/" || echo "PASS"
      echo
      echo "--- Check 4: Regla 6 NO-TOUCH diff line count ---"
      git diff main -- src/lib/agents/ src/lib/inngest/ src/app/actions/conversations.ts src/lib/whatsapp/ src/components/layout/sidebar.tsx src/lib/domain/ src/hooks/use-conversations.ts src/hooks/use-messages.ts src/app/\(dashboard\)/whatsapp/components/agent-config-slider.tsx src/app/\(dashboard\)/whatsapp/components/debug-panel-production/ src/app/\(dashboard\)/whatsapp/components/availability-toggle.tsx src/app/\(dashboard\)/whatsapp/components/window-indicator.tsx src/app/\(dashboard\)/whatsapp/components/bold-payment-link-button.tsx src/app/\(dashboard\)/whatsapp/components/new-conversation-modal.tsx src/app/\(dashboard\)/whatsapp/components/template-send-modal.tsx src/app/\(dashboard\)/whatsapp/components/view-order-sheet.tsx src/app/\(dashboard\)/whatsapp/components/create-contact-sheet.tsx src/app/\(dashboard\)/whatsapp/components/create-order-sheet.tsx src/app/\(dashboard\)/whatsapp/components/media-preview.tsx src/app/\(dashboard\)/whatsapp/components/emoji-picker.tsx src/app/\(dashboard\)/whatsapp/components/quick-reply-autocomplete.tsx src/app/\(dashboard\)/whatsapp/components/template-button.tsx src/app/\(dashboard\)/whatsapp/components/template-preview.tsx src/app/\(dashboard\)/whatsapp/components/conversation-tag-input.tsx | wc -l
      echo
      echo "--- Check 5: build clean ---"
      npx tsc --noEmit 2>&1 | grep -E "src/app/\(dashboard\)/whatsapp|src/lib/auth/inbox-v2" | grep -E "error TS" || echo "PASS"
      echo
      echo "--- Check 6: --primary maps to --ink-1 ---"
      grep -A 2 "\.theme-editorial" src/app/globals.css | grep -E "^\s*--primary:" | grep "var(--ink-1)" || echo "FAIL"
      echo
      echo "--- Check 7: axe-core scan (see axe-report.txt) ---"
      test -f .planning/standalone/ui-redesign-conversaciones/axe-report.txt && cat .planning/standalone/ui-redesign-conversaciones/axe-report.txt | head -30 || echo "MISSING — run axe-core per instructions"
    } > .planning/standalone/ui-redesign-conversaciones/dod-verification.txt
    ```

    Read the resulting file and confirm all 7 checks PASS. If any FAIL, fix the violation in the relevant component/CSS file before proceeding.
  </action>
  <verify>
    <automated>cat .planning/standalone/ui-redesign-conversaciones/dod-verification.txt && test -f .planning/standalone/ui-redesign-conversaciones/axe-report.txt && grep -q "PASS\|^0$" .planning/standalone/ui-redesign-conversaciones/dod-verification.txt</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/standalone/ui-redesign-conversaciones/dod-verification.txt` exists with all 7 checks recorded.
    - File `.planning/standalone/ui-redesign-conversaciones/axe-report.txt` exists with axe-core output or console snippet results.
    - All 7 checks return PASS or count `0`; axe-core exit 0 or zero serious/critical violations.
    - If any check FAILS in initial run, the violation is fixed in the relevant file and the report is regenerated showing PASS.
  </acceptance_criteria>
  <done>DoD grep + axe-core suite passes. Any violations fixed inline. Reports saved to dod-verification.txt + axe-report.txt for LEARNINGS reference.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Side-by-side QA + Safari retina perf + CLS + dark-mode + responsive (D-03 + Pitfall 6 + UI-SPEC §16 DoD items 4/11/12)</name>
  <what-built>
    - 8 components re-skinned to editorial paper/ink/rubric look behind `ui_inbox_v2.enabled` flag
    - Loading skeletons, snoozed state (or DEFERRED-D18.md), error banner (if signal available), keyboard shortcuts, ARIA roles
    - Universal aria-label improvements on chat-header buttons (apply with or without flag)
    - Pre-existing `hsl(var(--background))` bug fix in chat-view.tsx
    - Portal sweep from Plan 05 Task 4 — in-scope components re-rooted or documented deferred
  </what-built>
  <how-to-verify>
    **Step 1 — Pick a test workspace** (use `morfx-dev` or any internal workspace — NOT a productive customer workspace per Regla 6).

    **Step 2 — Capture flag-OFF screenshot:**
    1. Verify the flag is OFF for the test workspace:
       ```sql
       SELECT settings->'ui_inbox_v2' FROM workspaces WHERE id = '<workspace-uuid>';
       ```
    2. Open `http://localhost:3020/whatsapp` (or production Vercel URL if pushed) with the test workspace selected.
    3. Take a full-page screenshot. Save as `.planning/standalone/ui-redesign-conversaciones/qa-screenshots/flag-off.png`.

    **Step 3 — Enable the flag for the test workspace:**
    ```sql
    UPDATE workspaces
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{ui_inbox_v2,enabled}',
      'true'::jsonb,
      true
    )
    WHERE id = '<workspace-uuid>';
    ```
    Reload `/whatsapp`.

    **Step 4 — Capture flag-ON screenshot:** Save as `.planning/standalone/ui-redesign-conversaciones/qa-screenshots/flag-on.png`.

    **Step 5 — Visual diff comparison.** Open both screenshots side by side. Verify:
    - flag-OFF: current shadcn-slate look, identical to `main` branch.
    - flag-ON: editorial paper/ink/rubric look matching `reference/design_handoff_morfx/mocks/conversaciones.html`.
    - Differences match UI-SPEC §7 patterns (avatar, eyebrows, bubble corners, send button, paper textures).
    - Functional smoke: in flag-ON state, send a message, switch conversations, open contact panel, click an action button — every interaction works without error.

    **Step 6 — Safari retina perf test (Pitfall 6):**
    1. Open `/whatsapp` (flag ON) on Safari macOS retina (M1 or later).
    2. Open Safari DevTools → Timelines → Record frame rate.
    3. Scroll the conversation list rapidly for 5 seconds.
    4. Scroll the thread rapidly for 5 seconds.
    5. Verify avg frame rate ≥ 55 fps. If <55, switch to Pattern B fallback in globals.css (uncomment the `/* PAPER TEXTURE FALLBACK */` block prepared in Wave 0 Task 2 and comment out the root `background-image` line).

    **Step 7 — Functional regression spot-check:**
    - Click an unread conversation → it loads, marks as read, agent's mode (bot/human) is preserved.
    - Send a message via composer → message appears optimistically, status icon updates.
    - Open contact-panel → orders / notes load.
    - Click "Asignar" dropdown → menu appears (in flag-ON: editorial; in flag-OFF: slate).
    - Press `/` → search input gets focus.
    - Press `[` and `]` → previous/next conversation selected.
    - Press `Esc` at <1280px with contact-panel drawer open → closes.

    **Step 8 — CLS measurement (UI-SPEC §16 DoD item 4):**

    Run Lighthouse performance audit against `/whatsapp` (flag ON) and confirm CLS < 0.1:
    ```bash
    npx lighthouse http://localhost:3020/whatsapp \
      --only-categories=performance \
      --quiet \
      --chrome-flags='--headless' \
      --output=json \
      --output-path=.planning/standalone/ui-redesign-conversaciones/lighthouse-flag-on.json
    ```
    Then extract CLS:
    ```bash
    node -e "const r = require('./.planning/standalone/ui-redesign-conversaciones/lighthouse-flag-on.json'); console.log('CLS:', r.audits['cumulative-layout-shift'].numericValue);"
    ```
    EXPECTED: `CLS: <value less than 0.1>`.

    Alternative manual: Open DevTools → Performance → Record → reload `/whatsapp` → stop after idle → inspect "Layout Shifts" lane → sum values < 0.1. Capture screenshot if manual. Fonts (EB Garamond + Inter + JetBrains Mono) MUST be loaded in the Network panel prior to declaring PASS.

    **Step 9 — Dark mode persistence (UI-SPEC §16 DoD item 11):**
    1. Toggle dashboard theme to dark via next-themes (there's typically a toggle in the sidebar or user menu). Confirm `<html class="dark">` appears via DevTools Elements inspector.
    2. Navigate to `/whatsapp` with flag ON.
    3. Inspect the `.theme-editorial` wrapper element in DevTools Elements panel. Confirm:
       - Computed `color-scheme: light` on the wrapper (or its ancestor within scope).
       - The inbox visually renders with paper (light) palette — NOT inverted/dark.
       - Paper-0 background color resolves to the light-mode oklch value.
    4. Toggle dashboard back to light. Confirm `/whatsapp` still renders editorial light (no change).
    5. Expected: dark global class is IGNORED inside `.theme-editorial` scope — inbox is always light per UI-SPEC §8 no-dark-mode decision.

    If the inbox visibly inverts when global dark is active → FAIL. Add an explicit `color-scheme: light;` + override tokens inside `.theme-editorial.dark, .dark .theme-editorial` selector in globals.css and re-verify.

    **Step 10 — Responsive breakpoints (UI-SPEC §16 DoD item 12):**
    1. Open Chrome DevTools → Toggle device toolbar (Cmd+Shift+M).
    2. For each width: **1280px, 1024px, 768px**:
       a. Set viewport width via the "Dimensions" input.
       b. Reload `/whatsapp` (flag ON).
       c. Verify: no horizontal scrollbar on `<body>` (`document.body.scrollWidth <= document.body.clientWidth` via DevTools console).
       d. Verify: all ibtn actions in chat-header are still accessible — either visible directly or collapsed into the `MoreHorizontal` dropdown per UI-SPEC §8.3.
       e. Verify: conversation list + chat view + contact panel are navigable (at <1280px, contact panel becomes a drawer).
       f. Screenshot each width → save as `.planning/standalone/ui-redesign-conversaciones/qa-screenshots/responsive-{1280,1024,768}.png`.
    3. Any horizontal overflow OR inaccessible action → FAIL. Fix the offending component's min-width / overflow-x handling and re-verify.

    **Step 11 — Disable the flag again** (rollback prep):
    ```sql
    UPDATE workspaces
    SET settings = jsonb_set(settings, '{ui_inbox_v2,enabled}', 'false'::jsonb)
    WHERE id = '<workspace-uuid>';
    ```
    Reload `/whatsapp` — verify it returns to slate look immediately. This validates the rollback path.
  </how-to-verify>
  <resume-signal>
    Type `qa approved` if ALL 10 verification steps pass and screenshots match. Type `qa failed: <description>` if any visual, functional, CLS, dark-mode, or responsive regression is found. Type `qa deferred safari: <reason>` if Safari retina test cannot be performed (e.g., no Mac M1 available) — must confirm all OTHER steps passed.
  </resume-signal>
  <acceptance_criteria>
    - flag-off.png + flag-on.png captured under qa-screenshots/
    - responsive-1280.png + responsive-1024.png + responsive-768.png captured
    - lighthouse-flag-on.json exists with CLS < 0.1 recorded
    - Dark-mode persistence verified (or explicit override shipped if failed initial check)
    - Safari retina perf: ≥55fps OR Pattern B fallback applied OR deferred with justification
    - Portal sweep regression check from Plan 05 Task 4: confirm AssignDropdown + any other re-rooted portals still render inside `.theme-editorial` (DevTools DOM inspection)
    - Intentional-slate list updated with Plan 05 portal sweep findings (appended to SUMMARY or LEARNINGS)
    - User confirms with one of the resume signals.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Update docs/analysis/04-estado-actual-plataforma.md (Regla 4)</name>
  <files>docs/analysis/04-estado-actual-plataforma.md</files>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (full file — find the section that documents the WhatsApp / Conversaciones module status)
    - .planning/standalone/ui-redesign-conversaciones/01-PLAN.md (for the artifact list to reference)
  </read_first>
  <action>
    Update `docs/analysis/04-estado-actual-plataforma.md` with a new entry for the editorial Conversaciones re-skin:

    **Step 1 — Find the WhatsApp / Conversaciones section.** It may be a numbered section like "Módulo WhatsApp" or "Conversaciones". Read the file to locate it.

    **Step 2 — Add a sub-section** (or extend the existing one) with this content:

    ```markdown
    ### UI Editorial v2 (in rollout — 2026-04-22)

    **Standalone:** `.planning/standalone/ui-redesign-conversaciones/`
    **Status:** SHIPPED behind feature flag — flag default `false` per workspace (Regla 6).

    **Feature flag:** `workspaces.settings.ui_inbox_v2.enabled` (boolean, JSONB).

    **Activation per workspace (manual, via SQL — admin UI is deferred):**
    ```sql
    UPDATE workspaces
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{ui_inbox_v2,enabled}',
      'true'::jsonb,
      true
    )
    WHERE id = '<workspace-uuid>';
    ```

    **Rollback:**
    ```sql
    UPDATE workspaces
    SET settings = jsonb_set(settings, '{ui_inbox_v2,enabled}', 'false'::jsonb)
    WHERE id = '<workspace-uuid>';
    ```

    **Componentes re-skineados (8):**
    - `inbox-layout.tsx` — wrapper `.theme-editorial` cuando flag ON
    - `conversation-list.tsx` — header eyebrow + display title + tabs underlined + search editorial + `/` shortcut + `[`/`]` shortcuts + empty states (D-15 bandeja, D-16 filter)
    - `conversation-item.tsx` — avatar paper-3, selected rail rubric-2, unread dot, mono timestamp, snoozed Moon icon (o DEFERRED-D18.md)
    - `chat-view.tsx` — DaySeparator editorial, fix bug `hsl(var(--background))` (universal positive)
    - `chat-header.tsx` — avatar ink-1 solido, eyebrow Contacto, mx-h4 nombre, mx-mono meta, aria-labels universales, DropdownMenu portal re-rooting para assign-dropdown
    - `contact-panel.tsx` — paper-2 bg, smallcaps section H3, dl 1fr/1.4fr grid, order-card rounded-xl
    - `message-bubble.tsx` — bubble 10px radius con corner 2px, paper-0/ink-1 fills, ❦ bot eyebrow
    - `message-input.tsx` — composer ink-1 border-top, paper-1 input, ink-1 Send con press affordance, rubric warning banner

    **Componentes nuevos (5):**
    - `src/lib/auth/inbox-v2.ts` — server-side flag resolver `getIsInboxV2Enabled(workspaceId)`
    - `src/app/(dashboard)/whatsapp/fonts.ts` — EB Garamond + Inter + JetBrains Mono via `next/font/google` (per-route preload only on `/whatsapp`)
    - `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` — `useInboxV2()` hook para gate de NEW JSX sin prop drilling
    - `src/app/(dashboard)/whatsapp/components/mx-tag.tsx` — pill editorial wrapper (5 variants: rubric/gold/indigo/verdigris/ink)
    - `src/app/(dashboard)/whatsapp/components/icon-button.tsx` — 32x32 ibtn con aria-label obligatorio
    - `src/app/(dashboard)/whatsapp/components/day-separator.tsx` — separador editorial `— Martes 21 de abril —`

    **Cambios CSS:**
    - `src/app/globals.css` — bloque `.theme-editorial` (~170 líneas) con tokens custom paper/ink/rubric + shadcn token overrides + utilities `mx-*` scoped
    - Preserva `:root` shadcn-slate intacto fuera del scope

    **Out-of-scope (deferred):**
    - Modales y sheets internos (NewConversationModal, TemplateSendModal, ViewOrderSheet, etc.) — fase de seguimiento `ui-redesign-conversaciones-modales`
    - Sidebar global re-skin — standalone `ui-redesign-dashboard-chrome`
    - Dark mode editorial — handoff §8 fuera de scope v1
    - Brand component `<Brand />` — vendrá con sidebar global
    - Refactor estructural de `contact-panel.tsx` (839 LOC) — preservado por D-20
    - D-18 snoozed state si no existió field en type — ver DEFERRED-D18.md
    - D-17 channel-down banner si no existió signal en hooks — ver LEARNINGS

    **Stack additivo cero npm packages.** EB Garamond + Inter + JetBrains Mono se cargan via `next/font/google` (zero install).

    **Reglas verificadas:**
    - Regla 6 (proteger agente productivo): cero cambios en hooks, realtime, action handlers, webhooks, DebugPanelProduction, AgentConfigSlider, AvailabilityToggle, WindowIndicator, BoldPaymentLinkButton, sheets, conversation-tag-input. Verificable via `git diff main` en lista NO-TOUCH.
    - Regla 1 (push a Vercel): commits de Plans 01-06 pusheados.
    - Regla 4 (docs): este documento actualizado.

    **QA D-03 lado a lado:** ejecutado en workspace `<id>` el 2026-XX-XX. Screenshots en `.planning/standalone/ui-redesign-conversaciones/qa-screenshots/`.

    **DoD UI-SPEC §16 (12 items):** verificado — dod-verification.txt + axe-report.txt + lighthouse-flag-on.json + responsive-*.png + qa screenshots.
    ```

    Reemplaza `<workspace-uuid>` con un placeholder o el ID real del workspace de prueba. Reemplaza `<id>` y `2026-XX-XX` con valores reales del Task 2 checkpoint.

    **Step 3 — Actualizar el footer del documento** con la fecha de modificación más reciente al final del file.
  </action>
  <verify>
    <automated>grep -q "ui_inbox_v2" docs/analysis/04-estado-actual-plataforma.md && grep -q "ui-redesign-conversaciones" docs/analysis/04-estado-actual-plataforma.md && grep -q "EB Garamond" docs/analysis/04-estado-actual-plataforma.md && grep -q "Regla 6" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "ui_inbox_v2" docs/analysis/04-estado-actual-plataforma.md` (flag name documented).
    - `grep -q "ui-redesign-conversaciones" docs/analysis/04-estado-actual-plataforma.md` (path reference).
    - `grep -q "EB Garamond" docs/analysis/04-estado-actual-plataforma.md` (font stack documented).
    - `grep -q "Regla 6" docs/analysis/04-estado-actual-plataforma.md` (mentions Regla 6 explicitly).
    - SQL activation snippet present.
    - SQL rollback snippet present.
    - 8 re-skinned components listed.
    - 5+ new files listed.
    - Out-of-scope items listed.
  </acceptance_criteria>
  <done>docs/analysis/04-estado-actual-plataforma.md updated with full editorial Conversaciones section. Regla 4 satisfied.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Create LEARNINGS.md + final commit + push to Vercel</name>
  <files>.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md</files>
  <read_first>
    - .planning/standalone/ui-redesign-conversaciones/dod-verification.txt (output from Task 1)
    - .planning/standalone/ui-redesign-conversaciones/axe-report.txt (output from Task 1)
    - .planning/standalone/ui-redesign-conversaciones/lighthouse-flag-on.json (output from Task 2)
    - .planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md (IF created by Plan 05 Task 2)
    - All SUMMARY files from Plans 01-05
    - .planning/standalone/crm-stage-integrity/LEARNINGS.md (analog learnings format)
  </read_first>
  <action>
    Create `.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md` with comprehensive phase notes. Follow the structure used by other recent standalone LEARNINGS (e.g., `crm-stage-integrity`).

    Sections to include:

    1. **Header:** Phase, dates, # of plans, # of commits, total LOC moved.

    2. **What shipped:** Summary of the 8 components re-skinned + 5 new files + globals.css block.

    3. **Patterns established:**
       - Scoped Tailwind v4 token override via `.theme-editorial` class wrapper (RESEARCH Pattern 1) — verified working with shadcn primitives without rewrites.
       - Per-route font preload via `next/font/google` in module layout (not root) — saves ~150KB on every other dashboard route.
       - Server-side flag helper `getIsInboxV2Enabled(workspaceId)` mirroring `getIsSuperUser()` — fail-closed try/catch.
       - React Context (`InboxV2Provider` + `useInboxV2`) instead of prop drilling for v2 gate (RESEARCH Open Question 2 — Option B).
       - DropdownMenuPortal `container` prop for re-rooting Radix portals inside `.theme-editorial`.
       - `data-module="whatsapp"` attribute as the canonical scope marker for keyboard shortcuts.
       - Universal aria-label additions (apply with or without flag) — improves a11y for ALL users, not just v2.
       - Keyboard shortcut placement: state-local — `[`/`]` in conversation-list (owns the conversations array), `Esc` drawer-close in inbox-layout (owns the drawer state).

    4. **Pitfalls evitados:**
       - Pitfall 1: Never `@theme` inside `.theme-editorial` (top-level only).
       - Pitfall 2: Token leakage — wrapper at div level, NOT body/html. Portal containers re-rooted explicitly. Plan 05 Task 4 sweep confirmed coverage.
       - Pitfall 6: Safari retina paper texture — Pattern A shipped; Pattern B fallback prepared as commented block in globals.css. Status: <result of Task 2 Step 6>.
       - Pitfall 8: `mx-*` classes scoped to `.theme-editorial .mx-*` selector — verified zero leakage to /crm, /tareas, etc.
       - Pre-existing bug: `hsl(var(--background))` in chat-view.tsx — fixed for ALL users (universal positive).

    5. **Drop-candidates aplicados (UI-SPEC §6.2):**
       - Document which drop-candidates were exercised (e.g., `26 → 24px` for h-module, `19 → 20px` for h-contact, `12.5 → 13px` for order desc).

    6. **Excepciones mock-pixel-perfect mantenidas (UI-SPEC §5.2):**
       - List the 6 excepciones that survived: `ibtn 32x32`, `.it.on padding-left 13px`, `search input padding-left 28px`, `message-bubble padding 10x14`, `conversation-item .em emoji 13px`, `mx-tag padding 2x8`.

    7. **Deferred items:**
       - `<Brand />` component (depende de sidebar global re-skin)
       - Snoozed state field — IF `DEFERRED-D18.md` exists, reference it explicitly here with "D-18 deferred; un-defer plumbing in `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md`". IF snooze field was found, skip this bullet.
       - Channel error banner D-17 (si no se encontró señal de connection en hooks)
       - Portal sweep deferrals from Plan 05 Task 4 (if any — list per sweep result table)
       - `ruled paper` thread background (UI-SPEC §7.5 — explícitamente diferido)
       - Cormorant Garamond NO se carga (UI-SPEC §6.3 recomendación + cascade fallback)
       - Modales/sheets re-skin (fase de seguimiento `ui-redesign-conversaciones-modales`)
       - Sidebar global re-skin (standalone `ui-redesign-dashboard-chrome`)

    8. **Rollout playbook:**
       - Ship con flag OFF default (todas las workspaces ven UI actual).
       - Para activar en workspace de pruebas: `UPDATE workspaces SET settings = jsonb_set(...) WHERE id = '<id>';`
       - Para activar productivo: workspace por workspace, después de QA del usuario en cada uno.
       - Rollback inmediato: flip a `false` (cero downtime, cero migración).
       - Future: admin UI para flipear flag (deferred — standalone separado).

    9. **Recommendations for future agents/planners:**
       - Para nuevos módulos del rediseño (Tareas, Pedidos, CRM, etc.): copiar el mismo patrón `.theme-{module}` o reutilizar `.theme-editorial` si la estética es consistente. El bloque CSS de tokens ya está canónico — copiar y solo cambiar overrides shadcn por módulo.
       - Para mock pixel-perfect vs grid alignment: documentar la decisión por valor en UI-SPEC §5.1 ANTES de execution para evitar revisiones.
       - Para Radix portals: SIEMPRE pasar `container` prop si el contenido debe verse en un theme scope custom. Run a sweep grep at the end of any phase that introduces a scoped theme wrapper.

    10. **DoD UI-SPEC §16 — 12 items verification evidence:**
        - Item 1 (flag on vs off): qa-screenshots/flag-on.png + flag-off.png ✅
        - Item 2 (mock vs implementación): side-by-side in Task 2 ✅
        - Item 3 (tokens under scope): DevTools inspection Task 2 ✅
        - Item 4 (CLS < 0.1): lighthouse-flag-on.json ✅
        - Item 5 (pills mx-tag): dod-verification.txt Check 2 ✅
        - Item 6 (no OKLCH): dod-verification.txt Check 1 ✅
        - Item 7 (estados loading/empty/error): Plan 02 + Plan 05 Task 1 ✅
        - Item 8 (keyboard): Plan 02 + Plan 05 Task 3 ✅
        - Item 9 (axe-core 0 serious/critical): axe-report.txt ✅
        - Item 10 (Regla 6): dod-verification.txt Check 4 ✅
        - Item 11 (no dark mode inside /whatsapp): Task 2 Step 9 ✅
        - Item 12 (responsive 1280/1024/768): qa-screenshots/responsive-*.png ✅

    11. **Commits ranges:**
        - Plan 01: `<sha-range>`
        - Plan 02: `<sha-range>`
        - Plan 03: `<sha-range>` (incluye fix de hsl(var(--background)) bug)
        - Plan 04: `<sha-range>`
        - Plan 05: `<sha-range>`
        - Plan 06: `<sha-range>` (este plan)

    Replace `<sha-range>` placeholders with actual commit SHAs from `git log --oneline main..HEAD` filtered per plan.

    12. **Push a Vercel:** `git push origin main` ejecutado el 2026-XX-XX, hash final `<sha>`.

    Then commit:
    ```bash
    git add docs/analysis/04-estado-actual-plataforma.md \
            .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md \
            .planning/standalone/ui-redesign-conversaciones/qa-screenshots/ \
            .planning/standalone/ui-redesign-conversaciones/dod-verification.txt \
            .planning/standalone/ui-redesign-conversaciones/axe-report.txt \
            .planning/standalone/ui-redesign-conversaciones/lighthouse-flag-on.json \
            .planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md 2>/dev/null || true
    git commit -m "docs(ui-redesign-conversaciones): close standalone — DoD verified, LEARNINGS, platform state updated

    Wave 5 cierre de la fase. DoD UI-SPEC §16 (12 items) verificados: grep checks PASS,
    axe-core 0 serious/critical, CLS < 0.1, QA lado a lado D-03 ejecutado,
    Safari retina perf verificado, dark-mode persistence verificado,
    responsive 1280/1024/768 verificado. Regla 4 cumplida (estado-actual-plataforma.md).
    Phase 'ui-redesign-conversaciones' SHIPPED behind ui_inbox_v2.enabled flag,
    default false (Regla 6). Activación per-workspace via SQL.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```

    Then push:
    ```bash
    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md && grep -q "Patterns established" .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md && grep -q "Rollout playbook" .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md && grep -q "Deferred items" .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md && grep -q "DoD UI-SPEC §16" .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md` exists.
    - Contains sections: header, what shipped, patterns established, pitfalls evitados, drop-candidates aplicados, excepciones pixel-perfect mantenidas, deferred items, rollout playbook, recommendations, DoD UI-SPEC §16 verification evidence (12 items), commits ranges, push to Vercel confirmation.
    - Specifically references: scoped Tailwind v4 token override, per-route font preload, getIsInboxV2Enabled, useInboxV2 context, DropdownMenuPortal container, hsl(var(--background)) bug fix, mock pixel-perfect vs grid alignment trade-offs, keyboard shortcut placement rationale.
    - References at least 3 deferred items (including DEFERRED-D18.md IF it was created).
    - Commit ranges populated (not `<sha-range>` placeholders).
    - The final commit was created and the push to Vercel was executed (verify with `git log origin/main` showing the LEARNINGS commit).
  </acceptance_criteria>
  <done>LEARNINGS.md created with full phase context including all 12 DoD items evidence. Final commit + push to Vercel executed (Regla 1). Phase `ui-redesign-conversaciones` formally CLOSED.</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. dod-verification.txt exists with all 7 checks PASS.
2. axe-report.txt + lighthouse-flag-on.json exist with PASS results.
3. Side-by-side QA screenshots captured + visual diff matches mock + Safari perf ≥55fps (or fallback applied) + CLS < 0.1 + dark-mode persistence verified + responsive 1280/1024/768 verified.
4. docs/analysis/04-estado-actual-plataforma.md updated with editorial Conversaciones section.
5. LEARNINGS.md exists with all required sections + UI-SPEC §16 12-item evidence.
6. git push origin main executed.
7. Phase formally closed.
</verification>

<success_criteria>
- DoD §16 checklist (all 12 items) verified: grep PASS for automatable checks, axe-core exit 0, CLS < 0.1, dark-mode persistence, responsive 1280/1024/768, D-03 side-by-side QA, Safari retina.
- docs/analysis/04-estado-actual-plataforma.md reflects new feature.
- LEARNINGS.md captures patterns + pitfalls + deferred + rollout + 12-item DoD evidence.
- Final commit + push to Vercel.
- All Reglas (1, 4, 6) verified.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-conversaciones/06-SUMMARY.md` with:
- Final commits + push hash
- DoD UI-SPEC §16 checklist results inline (12 items)
- Side-by-side QA outcome (approved / failed / deferred)
- Safari retina result + decision (Pattern A kept / Pattern B applied)
- CLS measurement value
- Dark mode persistence result
- Responsive screenshots outcome
- Status: PHASE CLOSED — `ui-redesign-conversaciones` SHIPPED.
- Next: rollout to productive workspaces is OPERATIONAL (not part of this phase) — user flips per-workspace via SQL after each customer's QA.
</output>
</output>
