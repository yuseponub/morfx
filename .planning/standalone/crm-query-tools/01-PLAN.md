---
plan: 01
wave: 0
phase: standalone-crm-query-tools
depends_on: []
files_modified:
  - package.json
  - playwright.config.ts
  - vitest.config.ts
  - e2e/.gitignore
  - e2e/fixtures/auth.ts
  - e2e/fixtures/seed.ts
autonomous: false  # npm install + browser binary install requires user confirmation
requirements:
  - D-24  # Playwright UI E2E coverage requirement (this plan unblocks Wave 5 E2E tests)
---

<objective>
Bootstrap `@playwright/test` framework in this repo so Wave 5 can ship the D-24 UI ↔ DB ↔ tool E2E test. The repo currently has the `playwright` library (Railway robots use it) but NOT `@playwright/test`. This plan installs the framework, creates `playwright.config.ts` pinned to match `playwright@1.58.2`, scaffolds `e2e/` with `fixtures/auth.ts` and `fixtures/seed.ts` skeletons, adds `test:e2e` and `test:e2e:ui` scripts, and excludes `e2e/**` from Vitest. NO E2E spec yet — that lands in Plan 06. This plan gates on user confirmation before `npm install` runs.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/code-changes.md
@./.claude/rules/gsd-workflow.md
@.planning/standalone/crm-query-tools/CONTEXT.md
@.planning/standalone/crm-query-tools/RESEARCH.md
@.planning/standalone/crm-query-tools/PATTERNS.md
@package.json
@vitest.config.ts
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1.0: User confirmation — npm install @playwright/test + browser binary</name>
  <read_first>
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section: "Standard Stack" → "Installation (Wave 0)" + "Wave 0 Gaps")
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 28 — package.json edit)
    - package.json (verify `playwright@^1.58.2` already present, `@playwright/test` absent)
  </read_first>
  <what-built>
    Plan to install `@playwright/test@1.58.2` (pin matching existing `playwright@1.58.2` per MEMORY: "Docker image version MUST match playwright npm package exactly"). This adds a devDependency and downloads Chromium browser binary (~150MB).
  </what-built>
  <how-to-verify>
    Confirm to the executor:
    1. `@playwright/test` may be added to `devDependencies` (pinned `^1.58.2`).
    2. `npx playwright install chromium` may run (downloads browser binary; alters `~/.cache/ms-playwright/`).
    3. No production package added — devDependencies only.
    Type "approved" to proceed, or "skip-install" if `@playwright/test` is already installed in your environment, or describe alternative.
  </how-to-verify>
  <action>STOP and present the install plan to the user. Wait for explicit "approved" before continuing to Task 1.1.</action>
  <verify>
    <automated>echo "blocked-on-user-approval"</automated>
  </verify>
  <acceptance_criteria>
    User has typed "approved" or equivalent. Continue to Task 1.1 only after that signal.
  </acceptance_criteria>
  <done>User approves the install plan.</done>
  <resume-signal>Type "approved" to install, "skip-install" if already present, or describe alternative.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 1.1: Install @playwright/test + add scripts + exclude e2e from Vitest</name>
  <read_first>
    - package.json (current scripts at lines ~5-11, devDependencies starting line ~93)
    - vitest.config.ts (current `exclude` array, lines ~19-24)
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 17 — playwright.config.ts template; File 28 — package.json edit; File 17 adaptation note about vitest exclude)
  </read_first>
  <action>
    1. Run `npm install --save-dev @playwright/test@^1.58.2` (pin minor matching existing `playwright@^1.58.2` per MEMORY lesson). Verify `npm list @playwright/test` shows `1.58.x`.
    2. Run `npx playwright install chromium` to download the browser binary.
    3. Edit `package.json`:
       - Under `"scripts"` add (between existing `"test"` and any subsequent line):
         ```json
         "test:e2e": "playwright test",
         "test:e2e:ui": "playwright test --ui",
         ```
       - Under `"devDependencies"` confirm `"@playwright/test": "^1.58.2"` is present (npm install added it).
    4. Edit `vitest.config.ts`: add `'e2e/**'` to the `exclude` array so Vitest does NOT pick up Playwright spec files. The current exclude block is at lines ~19-24. Append `'e2e/**'` after the last existing entry. Preserve all existing entries.
    5. NO commit yet — leaves working tree dirty for Task 1.2 to commit together.
  </action>
  <verify>
    <automated>npm list @playwright/test 2>&1 | grep -q "1.58" && grep -q "test:e2e" package.json && grep -q "'e2e/\*\*'" vitest.config.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `npm list @playwright/test` shows version `1.58.x`.
    - `grep -E '"test:e2e"' package.json` returns at least one match.
    - `grep "'e2e/\*\*'" vitest.config.ts` returns one match.
    - `npx playwright --version` outputs a `1.58.x` version.
    - `ls ~/.cache/ms-playwright/chromium-*` (or equivalent on platform) shows browser dir exists.
  </acceptance_criteria>
  <done>Playwright framework installed, scripts added, Vitest excludes `e2e/**`. Working tree dirty (commit deferred to Task 1.4).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.2: Create playwright.config.ts pinned to localhost:3020</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 17 — playwright.config.ts template, lines ~819-845)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section "Standard Stack" + "Open Questions for Planner" #6)
    - CLAUDE.md (Stack Tecnologico — Puerto dev: 3020)
    - package.json (verify `npm run dev` exists and uses port 3020)
  </read_first>
  <action>
    Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/playwright.config.ts` with the EXACT contents below. Pin baseURL fallback to `http://localhost:3020` (CLAUDE.md Regla — port 3020). Use `webServer` to auto-start `npm run dev` in CI. Use single-worker (`workers: 1`) to keep test workspace seed data isolation simple.

    ```typescript
    // playwright.config.ts
    // Bootstrapped in standalone crm-query-tools Wave 0 (Plan 01).
    // Reason: D-24 demands UI ↔ DB ↔ tool E2E coverage; @playwright/test was not installed.
    // Pin matches existing `playwright@1.58.2` library used by Railway robots
    // (MEMORY: "Docker image version MUST match playwright npm package exactly").

    import { defineConfig, devices } from '@playwright/test'

    export default defineConfig({
      testDir: './e2e',
      fullyParallel: false,         // serial — tests share test workspace fixtures
      forbidOnly: !!process.env.CI,
      retries: process.env.CI ? 2 : 0,
      workers: 1,                   // single worker — Supabase test data isolation (RESEARCH Open Q5)
      reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
      ],
      use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3020',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
      },
      projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      ],
      webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3020',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    })
    ```

    Then create `/mnt/c/Users/Usuario/Proyectos/morfx-new/e2e/.gitignore` with EXACT contents:
    ```
    # Playwright artifacts
    playwright-report/
    test-results/
    ```

    Also at repo root: ensure `.gitignore` excludes `playwright-report/` and `test-results/`. Read the file with `Read`; if those entries are absent, append them under a `# Playwright` heading.
  </action>
  <verify>
    <automated>test -f playwright.config.ts && test -f e2e/.gitignore && grep -q "localhost:3020" playwright.config.ts && grep -q "testDir: './e2e'" playwright.config.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `playwright.config.ts` exists at repo root.
    - `grep "baseURL: process.env.PLAYWRIGHT_BASE_URL" playwright.config.ts` returns a match.
    - `grep "workers: 1" playwright.config.ts` returns a match.
    - `e2e/.gitignore` exists with `playwright-report/` and `test-results/`.
    - Repo-root `.gitignore` excludes `playwright-report/`.
  </acceptance_criteria>
  <done>Playwright config committed-ready, ignores set, port 3020 pinned.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.3: Scaffold e2e/fixtures/auth.ts + e2e/fixtures/seed.ts (skeletons only)</name>
  <read_first>
    - .planning/standalone/crm-query-tools/PATTERNS.md (File 19 — auth.ts template ~lines 911-947; File 20 — seed.ts skeleton ~lines 967-1003)
    - .planning/standalone/crm-query-tools/RESEARCH.md (Section "Open Questions for Planner" #5 — test seeding strategy)
    - src/lib/supabase/server.ts (read to confirm cookie naming — RESEARCH/PATTERNS Open Q4 calls this out as needing verification at plan time)
    - src/__tests__/integration/crm-bots/reader.test.ts (lines 1-90 — env-gated TEST_WORKSPACE_ID + TEST_API_KEY pattern)
  </read_first>
  <action>
    Create skeleton fixtures so Wave 5 (Plan 06) can fill in the seed body. Both files must be syntactically valid TypeScript that compiles, but seed/cleanup bodies can be `throw new Error('NOT_IMPLEMENTED — Plan 06 fills this in')` placeholders.

    1. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/e2e/fixtures/auth.ts`:

    ```typescript
    // e2e/fixtures/auth.ts
    // Bootstrapped Wave 0 (Plan 01). Body verified against src/lib/supabase/server.ts cookie convention.
    // Required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD.

    import { type Page } from '@playwright/test'
    import { createClient } from '@supabase/supabase-js'

    /**
     * Logs in via @supabase/supabase-js (anon key) and sets the session cookie
     * on the Playwright page so server components see an authenticated user.
     *
     * Cookie name: sb-<projectRef>-auth-token (Supabase SSR convention).
     * IMPORTANT: Plan 06 (Wave 5) verifies this name against src/lib/supabase/server.ts
     * before first E2E run. If the project customized cookie name, update here.
     */
    export async function authenticateAsTestUser(page: Page): Promise<void> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const email = process.env.TEST_USER_EMAIL
      const password = process.env.TEST_USER_PASSWORD
      if (!url || !anon || !email || !password) {
        throw new Error('e2e auth requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD')
      }

      const supabase = createClient(url, anon)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) throw new Error(`auth failed: ${error?.message ?? 'no session'}`)

      const projectRef = new URL(url).hostname.split('.')[0]
      await page.context().addCookies([
        {
          name: `sb-${projectRef}-auth-token`,
          value: JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }),
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ])
    }
    ```

    2. Create `/mnt/c/Users/Usuario/Proyectos/morfx-new/e2e/fixtures/seed.ts`:

    ```typescript
    // e2e/fixtures/seed.ts
    // Bootstrapped Wave 0 (Plan 01). Body lands in Plan 06 (Wave 5).
    // Pattern derived from src/__tests__/integration/crm-bots/reader.test.ts (env-gated).

    import { createClient, type SupabaseClient } from '@supabase/supabase-js'

    export interface SeededData {
      workspaceId: string
      pipelineId: string
      stageIds: string[]   // [activo1, activo2, terminal1]
      contactId: string
      orderIds: string[]
    }

    function admin(): SupabaseClient {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !srk) {
        throw new Error('seed requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
      }
      return createClient(url, srk)
    }

    export async function seedTestFixture(): Promise<SeededData> {
      // NOT_IMPLEMENTED — Plan 06 fills this body.
      // Will: insert pipeline + 3 stages + contact + 2 orders into TEST_WORKSPACE_ID.
      void admin()
      throw new Error('seed.ts: NOT_IMPLEMENTED — landed in standalone crm-query-tools Plan 06 (Wave 5)')
    }

    export async function cleanupTestFixture(_seeded: SeededData): Promise<void> {
      // NOT_IMPLEMENTED — Plan 06 fills this body.
      void admin()
      throw new Error('seed.ts: NOT_IMPLEMENTED — landed in standalone crm-query-tools Plan 06 (Wave 5)')
    }
    ```

    3. Run `npx tsc --noEmit -p .` to confirm both files type-check cleanly. If errors surface, fix and re-run.
  </action>
  <verify>
    <automated>test -f e2e/fixtures/auth.ts && test -f e2e/fixtures/seed.ts && npx tsc --noEmit -p . 2>&1 | grep -E "(e2e/fixtures|error)" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `e2e/fixtures/auth.ts` exists with `authenticateAsTestUser(page: Page)` exported.
    - `e2e/fixtures/seed.ts` exists with `seedTestFixture` + `cleanupTestFixture` exported.
    - `npx tsc --noEmit -p .` returns zero errors related to `e2e/fixtures/*`.
    - `grep "NOT_IMPLEMENTED — landed in standalone crm-query-tools Plan 06" e2e/fixtures/seed.ts` returns 2 matches (seed + cleanup).
  </acceptance_criteria>
  <done>Fixture skeletons compile. Bodies are intentional placeholders pointing at Plan 06.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.4: Smoke-test Playwright + commit + push (Regla 1)</name>
  <read_first>
    - CLAUDE.md (Regla 1 — push a Vercel post-cambio)
    - .claude/rules/code-changes.md
    - playwright.config.ts (just-created)
  </read_first>
  <action>
    1. Smoke-test the Playwright install by running `npx playwright test --list` from repo root. The output should show "0 tests" or similar (no specs yet) WITHOUT errors. If config errors surface, fix.
    2. Run `npm run test -- --run --passWithNoTests src/__tests__/_smoke.test.ts 2>&1 | head -20` to confirm Vitest still works (does NOT pick up `e2e/**`). If `e2e/**` files trigger Vitest errors, the exclude is wrong.
    3. Stage and commit:
       ```
       git add package.json package-lock.json playwright.config.ts vitest.config.ts e2e/.gitignore e2e/fixtures/auth.ts e2e/fixtures/seed.ts .gitignore
       ```
       Commit message (en español per .claude/rules/code-changes.md):
       ```
       chore(crm-query-tools): bootstrap @playwright/test framework

       - Instala @playwright/test@^1.58.2 (pin matching playwright@1.58.2 per MEMORY).
       - Agrega playwright.config.ts pinned a localhost:3020.
       - Agrega scripts test:e2e + test:e2e:ui.
       - Excluye e2e/** de Vitest.
       - Scaffold e2e/fixtures/auth.ts + seed.ts (cuerpos en Plan 06).

       Standalone: crm-query-tools Plan 01 (Wave 0).
       Refs D-24.

       Co-authored-by: Claude <noreply@anthropic.com>
       ```
    4. Push: `git push origin main`.
  </action>
  <verify>
    <automated>npx playwright test --list 2>&1 | tail -5 && git log --oneline -1 | grep -i "crm-query-tools"</automated>
  </verify>
  <acceptance_criteria>
    - `npx playwright test --list` exits 0 and reports zero specs (no errors).
    - `npm run test --silent -- --reporter=basic 2>&1 | grep -i "e2e/fixtures"` returns no matches (Vitest does NOT try to run those).
    - `git log -1 --oneline` includes "crm-query-tools" and "bootstrap @playwright/test".
    - `git status` shows clean working tree.
    - `git log origin/main..HEAD` is empty (push succeeded).
  </acceptance_criteria>
  <done>Plan 01 committed + pushed. Wave 0 complete. Wave 1 (Plan 02) is unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer machine → npm registry | npm pulls `@playwright/test` package |
| developer machine → Microsoft CDN | `npx playwright install chromium` downloads browser binary |
| Playwright runtime → localhost:3020 | E2E browser drives local Next.js dev server |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-W0-01 | Tampering | npm install of @playwright/test | INFO | mitigate | Pin exact minor `^1.58.2` matching existing `playwright@1.58.2` (MEMORY lesson). Verify via `npm list @playwright/test` post-install. Rely on `package-lock.json` integrity hashes. |
| T-W0-02 | Spoofing | Browser binary download from MS CDN | INFO | accept | Standard Playwright workflow; CDN integrity controlled by Microsoft. No project-side mitigation needed. |
| T-W0-03 | Information Disclosure | `auth.ts` env vars logged | INFO | mitigate | `auth.ts` throws on missing env, never logs values. Plan 06 must verify no `console.log` of `data.session` lands in CI logs. |
| T-W0-04 | Elevation of Privilege | Playwright `webServer` runs `npm run dev` with full file access | LOW | accept | Dev server runs as the developer user; no privilege escalation beyond existing dev environment. CI should isolate via separate runner. |
| T-W0-05 | Denial of Service | Playwright fixture loops bricking dev server | INFO | mitigate | `webServer.timeout: 120_000` caps startup. `workers: 1` prevents concurrent server spawn. Plan 06 specs include explicit `afterAll` cleanup. |
</threat_model>

<verification>
- `npm list @playwright/test` reports `1.58.x`.
- `npx playwright test --list` exits 0 (no errors, zero specs).
- `npm run test` (full Vitest) still passes — does not attempt to run `e2e/**`.
- `npx tsc --noEmit -p .` reports no errors in `e2e/fixtures/**`.
- `git log -1 --oneline` shows the new commit; `git push origin main` succeeded.
</verification>

<must_haves>
truths:
  - "Developer can run `npm run test:e2e` and Playwright finds the e2e dir."
  - "Vitest does NOT try to execute e2e specs (exclude works)."
  - "Playwright config points at localhost:3020 (matches CLAUDE.md port rule)."
  - "Fixture skeletons compile under TypeScript strict mode."
artifacts:
  - path: "playwright.config.ts"
    provides: "Playwright runtime configuration"
    contains: "testDir: './e2e'"
  - path: "e2e/fixtures/auth.ts"
    provides: "Supabase session cookie helper for authenticated Playwright pages"
    exports: ["authenticateAsTestUser"]
  - path: "e2e/fixtures/seed.ts"
    provides: "Seed/cleanup skeletons (bodies fill in Plan 06)"
    exports: ["seedTestFixture", "cleanupTestFixture", "SeededData"]
  - path: "package.json"
    provides: "scripts.test:e2e + scripts.test:e2e:ui + devDependencies['@playwright/test']"
key_links:
  - from: "playwright.config.ts"
    to: "e2e/"
    via: "testDir property"
    pattern: "testDir: './e2e'"
  - from: "vitest.config.ts"
    to: "e2e/"
    via: "exclude array prevents collision"
    pattern: "'e2e/\\*\\*'"
</must_haves>
