---
phase: coordinadora-api-integration
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - .env.local.example
autonomous: false
requirements: []
user_setup:
  - service: coordinadora
    why: "OAuth2 client_credentials + multi-tenant identifiers for outbound REST calls"
    env_vars:
      - name: COORDINADORA_ENV
        source: "Set to 'test' for sandbox or 'prod' for production"
      - name: COORDINADORA_CLIENT_ID
        source: "Coordinadora dashboard / Jenny (D-37 #1) — placeholder OK pre-credentials"
      - name: COORDINADORA_CLIENT_SECRET
        source: "Coordinadora dashboard / Jenny (D-37 #1) — placeholder OK pre-credentials"
      - name: COORDINADORA_ID_PROCESO
        source: "Coordinadora dashboard / Jenny (D-37 #2) — placeholder OK pre-credentials"
      - name: COORDINADORA_DIVISION_CLIENTE
        source: "Coordinadora dashboard / Jenny (D-37 #3) — placeholder OK pre-credentials"
      - name: COORDINADORA_NIT_CLIENTE
        source: "Morfx NIT = 902052328 (already known, not blocked by D-37)"
      - name: COORDINADORA_TIPO_CUENTA
        source: "Coordinadora dashboard / Jenny (D-37 #4) — placeholder OK pre-credentials"
      - name: COORDINADORA_TIPO_PRODUCTO
        source: "Coordinadora dashboard / Jenny (D-37 #4) — placeholder OK pre-credentials"
      - name: COORDINADORA_GUIAS_PATH
        source: "Coordinadora dashboard / Jenny (D-37 #5) — default '/guias/crear' until confirmed"
    dashboard_config: []
must_haves:
  truths:
    - "Vercel env vars are set (placeholders OK) for all 8 COORDINADORA_* keys"
    - ".env.local.example documents all 8 keys for local dev parity"
    - "Code reads process.env at call time (NOT import time) — placeholder values do not crash module load"
  artifacts:
    - path: ".env.local.example"
      provides: "Documentation of all COORDINADORA_* env vars with placeholder values + comments"
      contains: "COORDINADORA_CLIENT_ID="
      contains2: "COORDINADORA_NIT_CLIENTE=902052328"
  key_links:
    - from: ".env.local.example"
      to: "Vercel project env vars dashboard"
      via: "user manually copies keys to Vercel UI"
      pattern: "all 8 keys present in both files"
---

<objective>
Document Coordinadora env vars in `.env.local.example` (canonical source for local + Vercel) and PAUSE for user to set them in Vercel project settings (placeholders OK for D-37-blocked keys per D-15).

Per D-15 and D-37: Code in Wave 1+ reads `process.env.COORDINADORA_*` at CALL time (not import time), so placeholder values do not crash module load — only smoke tests 2-7 in Wave 4 require real credentials.

Per Regla 1 + Regla 5: env vars MUST be set in Vercel BEFORE first push of code that references them (Wave 1+). Otherwise Vercel build succeeds but runtime fails on first call.

Output: `.env.local.example` updated + user confirmation that all 8 env vars exist in Vercel (real or placeholder).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.env.local.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update .env.local.example with COORDINADORA_* keys</name>
  <files>.env.local.example</files>
  <read_first>
    - .env.local.example (current state — see what keys already exist, identify section style)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-15 (lines 53-59 — exact env var names)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-37 (lines 133-139 — which keys are pending Jenny)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Runtime State Inventory lines 1129 (env var list confirmation)
  </read_first>
  <action>
    Append a new section to `.env.local.example` with all 8 COORDINADORA_* keys. Use this exact block (placeholder values; comments documenting D-37 status):

    ```
    # =============================================================================
    # Coordinadora REST API + Webhook (standalone: coordinadora-api-integration)
    # =============================================================================
    # Discriminator: 'test' uses api-test.coordinadora.tech, 'prod' uses api.coordinadora.tech.
    # Hardcoded in src/lib/carriers/coordinadora/client.ts BASE_URLS — env var only chooses the active one.
    COORDINADORA_ENV=test

    # OAuth2 client_credentials (D-37 #1 — pending Jenny @ Coordinadora; placeholder OK for build).
    # Smoke tests 2-7 are blocked until these arrive.
    COORDINADORA_CLIENT_ID=PLACEHOLDER_PENDING_D37
    COORDINADORA_CLIENT_SECRET=PLACEHOLDER_PENDING_D37

    # Process identifier for guide creation (D-37 #2).
    COORDINADORA_ID_PROCESO=PLACEHOLDER_PENDING_D37

    # Division code per client (D-37 #3 — e.g., "01").
    COORDINADORA_DIVISION_CLIENTE=PLACEHOLDER_PENDING_D37

    # Morfx NIT (NOT pending — locked value).
    COORDINADORA_NIT_CLIENTE=902052328

    # Account/product types for guide bodies (D-37 #4).
    COORDINADORA_TIPO_CUENTA=PLACEHOLDER_PENDING_D37
    COORDINADORA_TIPO_PRODUCTO=PLACEHOLDER_PENDING_D37

    # Exact POST path for guide creation (D-37 #5 — default until confirmed).
    COORDINADORA_GUIAS_PATH=/guias/crear
    ```

    Append AFTER existing carrier-related env vars (search for `ENVIA_` or `BOLD_` keys to find the right location; if no carrier section exists, place at the bottom).

    If `.env.local.example` does NOT exist, create it with just this block plus a top-level comment `# .env.local — local development environment variables`.

    Commit message: `chore(coordinadora-api): document env vars in .env.local.example`
  </action>
  <verify>
    <automated>test -f .env.local.example &amp;&amp; grep -c "^COORDINADORA_" .env.local.example | awk '{exit ($1 &gt;= 8 ? 0 : 1)}' &amp;&amp; grep -q "^COORDINADORA_NIT_CLIENTE=902052328$" .env.local.example &amp;&amp; grep -q "^COORDINADORA_ENV=test$" .env.local.example</automated>
  </verify>
  <acceptance_criteria>
    - File `.env.local.example` exists
    - Contains at least 8 lines starting with `COORDINADORA_` (one per key)
    - Exact line `COORDINADORA_NIT_CLIENTE=902052328` present (not a placeholder — D-15 locks this value)
    - Exact line `COORDINADORA_ENV=test` present (sane default — devs flip to `prod` only when ready)
    - Comments reference D-37 status for the 5 pending keys
    - File is committed to git
  </acceptance_criteria>
  <done>`.env.local.example` updated and committed with all 8 COORDINADORA_* keys documented. Devs cloning the repo can copy this file to `.env.local` and have correct shape.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] PAUSE — User sets COORDINADORA_* env vars in Vercel project settings</name>
  <what-built>`.env.local.example` documents the 8 keys, but they are NOT YET SET in Vercel production environment.</what-built>
  <how-to-verify>
    User MUST:

    1. Open Vercel dashboard at https://vercel.com/morfx (or equivalent project URL)
    2. Navigate to **Settings → Environment Variables**
    3. For EACH of the 8 keys below, add a new env var with scope = **Production** AND **Preview** AND **Development** (all 3):

       | Key | Value to set |
       |-----|--------------|
       | `COORDINADORA_ENV` | `test` (will flip to `prod` post-cutover D-26) |
       | `COORDINADORA_CLIENT_ID` | `PLACEHOLDER_PENDING_D37` (overwrite when Jenny responds) |
       | `COORDINADORA_CLIENT_SECRET` | `PLACEHOLDER_PENDING_D37` (overwrite when Jenny responds) — mark as **Secret** in Vercel |
       | `COORDINADORA_ID_PROCESO` | `PLACEHOLDER_PENDING_D37` |
       | `COORDINADORA_DIVISION_CLIENTE` | `PLACEHOLDER_PENDING_D37` |
       | `COORDINADORA_NIT_CLIENTE` | `902052328` (real value — Morfx NIT) |
       | `COORDINADORA_TIPO_CUENTA` | `PLACEHOLDER_PENDING_D37` |
       | `COORDINADORA_TIPO_PRODUCTO` | `PLACEHOLDER_PENDING_D37` |
       | `COORDINADORA_GUIAS_PATH` | `/guias/crear` (placeholder until Jenny confirms exact path) |

       NOTE: `COORDINADORA_CLIENT_SECRET` should be marked as **Sensitive** / **Encrypted** so Vercel hides it from logs and the UI after entry.

    4. After adding all 9 entries (8 keys above + verify NIT is the correct value), verify in Vercel UI that all 8 names appear under Environment Variables.

    5. Once verified, type "envs-set" in this chat to unblock Wave 1.
  </how-to-verify>
  <resume-signal>Type "envs-set" to confirm all 8 COORDINADORA_* env vars exist in Vercel (real value for NIT, placeholders for D-37-pending keys).</resume-signal>
  <done>User has confirmed via "envs-set" signal. Vercel project has all 8 COORDINADORA_* env vars defined. Code in Wave 1+ can safely import + reference `process.env.COORDINADORA_*` without runtime crashes.</done>
</task>

</tasks>

<verification>
- `.env.local.example` updated with all 8 keys (grep passes)
- User confirmed Vercel env vars set (placeholders OK for D-37-pending keys)
</verification>

<success_criteria>
1. `.env.local.example` committed to git with COORDINADORA_* block
2. User has typed "envs-set" confirming Vercel env vars exist
3. Wave 1 is unblocked
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/02-SUMMARY.md` documenting:
- Commit SHA of `.env.local.example` update
- Timestamp user confirmed "envs-set"
- List of 8 keys + which are placeholders vs real values
- Note: D-37 pending keys will be updated in Vercel manually when Jenny responds (no code change)
</output>
