---
phase: coordinadora-api-integration
plan: 10
type: execute
wave: 3
depends_on: [01, 06, 08, 09]
files_modified:
  - supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql
  - .planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md
autonomous: false
requirements: []
must_haves:
  truths:
    - "Feature flag seed migration created with key='coordinadora_api_v2_enabled', value=false"
    - "Migration is idempotent (ON CONFLICT DO NOTHING) and includes explicit GRANTs"
    - "Migration applied in production (Regla 5 PAUSE — user confirms)"
    - "Smoke 1 passes: local curl POST to /api/webhooks/coordinadora/test with empty envelope returns 200 OK (or 400 for invalid shape — both are valid 'webhook reachable' outcomes)"
    - "Smoke 1 passes: real Pub/Sub-shaped envelope returns 200 + row inserted in order_carrier_events (verified via SQL)"
    - "Code deployed to Vercel via git push (Regla 1)"
    - "coordinadora-status-polling standalone marked SUPERSEDED with reference to this standalone"
  artifacts:
    - path: "supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql"
      provides: "Feature flag seed INSERT (idempotent + GRANTs)"
    - path: ".planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md"
      provides: "Marker file documenting D-32 (SOAP polling superseded)"
  key_links:
    - from: "platform_config table"
      to: "Future callers of cotizar/createGuia/imprimirEtiqueta"
      via: "getPlatformConfig('coordinadora_api_v2_enabled', false)"
      pattern: "callers in V1.1 check the flag before invoking outbound APIs"
---

<objective>
Wave 3 — observability + activation + smoke 1.

1. Create the feature flag seed SQL migration `coordinadora_api_v2_enabled` (per D-24, PATTERNS.md verbatim clone of recompra seed)
2. PAUSE for user to apply migration in prod (Regla 5)
3. Push code to Vercel (Regla 1)
4. Run Smoke 1: curl POST to `https://morfx.app/api/webhooks/coordinadora/test` with a Pub/Sub envelope containing PDF page 1 payload — verify 200 OK and DB row inserted
5. Mark `coordinadora-status-polling` standalone as SUPERSEDED (D-32)

Per PATTERNS.md lines 628-657: this seed is a VERBATIM clone of `20260421155713_seed_recompra_crm_reader_flag.sql` with the key swap. Platform-wide (NOT per-workspace V1) because current `platform_config` schema is platform-wide — per-workspace deferred to V2 with `workspace_id` column addition.

Note on observability event taxonomy (D-27): the canonical event name `coordinadora_webhook_processed` is already emitted by Plan 09's Inngest function. Additional event names (`webhook_received`, `webhook_drop_no_match`, `webhook_drop_invalid_envelope`, `api_token_refreshed`, `api_token_cache_hit`, `api_call_succeeded:*`, `api_call_failed:*`) are mentioned in CONTEXT D-27 but are scope deferred to V1.1 (downstream business-logic plan). The webhook receiver + Inngest processor cover the MUST-HAVE truths of this standalone.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql
@.planning/standalone/coordinadora-status-polling/RESEARCH-API.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create feature flag seed migration</name>
  <files>supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql</files>
  <read_first>
    - supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql (verbatim template — 19 lines)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-24 (line 95 — locked key name + default false)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 628-657 (seed pattern + Option A platform-wide)
  </read_first>
  <action>
    Create `supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql` with this content (clone of recompra seed):

    ```sql
    -- Seed feature flag for coordinadora-api-integration standalone.
    -- Default: false (Regla 6 — protect production agent until explicit user activation).
    -- Consumer: src/lib/domain/platform-config.ts via getPlatformConfig<boolean>('coordinadora_api_v2_enabled', false).
    --
    -- D-24: per-workspace was requested but platform_config schema is currently
    -- platform-wide (no workspace_id column). Per-workspace nuance is deferred to
    -- V2 (alongside the workspace_id column addition in platform_config). V1 has a
    -- single tenant (Somnio) so platform-wide is functionally equivalent.
    --
    -- Idempotent: re-runs leave state unchanged (ON CONFLICT DO NOTHING).
    -- Activation: UPDATE platform_config SET value='true'::jsonb WHERE key='coordinadora_api_v2_enabled';
    -- Rollback:   UPDATE platform_config SET value='false'::jsonb WHERE key='coordinadora_api_v2_enabled';

    INSERT INTO platform_config (key, value)
    VALUES ('coordinadora_api_v2_enabled', 'false'::jsonb)
    ON CONFLICT (key) DO NOTHING;

    -- GRANTs explicitos (defensive — LEARNING from earlier Supabase migrations).
    GRANT ALL    ON TABLE platform_config TO service_role;
    GRANT SELECT ON TABLE platform_config TO authenticated;
    ```

    Commit message: `feat(coordinadora-api): seed coordinadora_api_v2_enabled feature flag`
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql &amp;&amp; grep -q "INSERT INTO platform_config" supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql &amp;&amp; grep -q "coordinadora_api_v2_enabled" supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql &amp;&amp; grep -q "ON CONFLICT (key) DO NOTHING" supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql` exists
    - Contains `INSERT INTO platform_config (key, value)` exactly once
    - Contains the literal value pair `'coordinadora_api_v2_enabled'` and `'false'::jsonb`
    - Contains `ON CONFLICT (key) DO NOTHING` for idempotency
    - Contains GRANT statements for service_role + authenticated
    - Filename timestamp `20260526100000` is later than migration in Plan 01 (`20260526000000`)
  </acceptance_criteria>
  <done>Seed migration committed. Ready for prod apply (Task 2).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] PAUSE — User applies feature flag seed in production (Regla 5)</name>
  <what-built>Seed migration `20260526100000_seed_coordinadora_api_v2_flag.sql` is committed but NOT YET APPLIED in production.</what-built>
  <how-to-verify>
    User MUST:

    1. Open Supabase Studio → SQL Editor for the production project
    2. Copy and run the ENTIRE content of `supabase/migrations/20260526100000_seed_coordinadora_api_v2_flag.sql`
    3. Verify the row was created:

       ```sql
       SELECT key, value FROM platform_config WHERE key = 'coordinadora_api_v2_enabled';
       -- Expected: 1 row with value=false
       ```

    4. Once verified, type "seed-applied" in this chat.
  </how-to-verify>
  <resume-signal>Type "seed-applied" to confirm the platform_config row exists with value=false.</resume-signal>
  <done>User confirmed via "seed-applied". Feature flag exists in production (default false). Future callers of cotizar/createGuia/imprimirEtiqueta will check this flag.</done>
</task>

<task type="auto">
  <name>Task 3: Push to Vercel (Regla 1)</name>
  <files>(no file modifications — git push only)</files>
  <read_first>
    - CLAUDE.md §Regla 1 (push to Vercel after code changes before user testing)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-26 (cutover prod ≥ 8-jun-2026; sandbox deploys are unblocked)
  </read_first>
  <action>
    Verify all Wave 0-2 commits are pushed to origin main. If not, push them now:

    ```bash
    git status                # confirm clean
    git log --oneline origin/main..HEAD  # confirm what's about to push
    git push origin main
    ```

    Wait for Vercel build to complete (visit Vercel dashboard or wait ~3-5min). If build fails:
    - Inspect Vercel build logs
    - Most likely cause: missing env vars (Plan 02 should have prevented this — verify all 8 COORDINADORA_* keys are set)
    - Second cause: TypeScript error (run `npx tsc --noEmit` locally to reproduce)

    Once Vercel reports successful deployment, the webhook endpoint at `https://morfx.app/api/webhooks/coordinadora/test` is live (responds to POST).

    Verify deployment is live:

    ```bash
    curl -i -X POST https://morfx.app/api/webhooks/coordinadora/staging \
      -H "Content-Type: application/json" \
      -d '{}'
    # Expected: HTTP 404 (invalid env — proves route is deployed)
    ```

    A 404 from this URL confirms the route file is deployed. If you get a 500 or generic Vercel "not found" page, deployment did not pick up the route.

    Commit message: (no new commit — only push existing)
  </action>
  <verify>
    <automated>curl -s -o /dev/null -w "%{http_code}" -X POST https://morfx.app/api/webhooks/coordinadora/staging -H "Content-Type: application/json" -d '{}' | grep -q "404"</automated>
  </verify>
  <acceptance_criteria>
    - `git log origin/main..HEAD` shows no commits remaining (everything pushed)
    - Vercel build status = Ready (visible in dashboard)
    - `curl POST https://morfx.app/api/webhooks/coordinadora/staging` returns HTTP 404 (proves D-06 env validation is deployed)
  </acceptance_criteria>
  <done>Code is live on Vercel. Smoke 1 can now run against production URL.</done>
</task>

<task type="auto">
  <name>Task 4: Run Smoke 1 — POST PDF page 1 envelope to /api/webhooks/coordinadora/test</name>
  <files>(no file modifications — manual smoke test)</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-31 (Smoke 1 definition)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md lines 1182 (Smoke 1 command pattern)
    - .planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf (page 1 payload — entregada)
  </read_first>
  <action>
    Execute Smoke 1 via these commands:

    **Step A — Verify webhook accepts a valid envelope (200):**

    ```bash
    # Build PDF page 1 payload (entregada, no novedad)
    PAYLOAD='{"tracking_number":"99999999901","referencia":"SMOKE1","comment":"ENTREGADA","codigo":"6","codigo_cliente":"SMOKE","fecha":"2026-05-26","hora":"13:51:43.456818","anterior":"","referencia_anterior":""}'

    # Base64 encode the payload (Pub/Sub envelope shape)
    DATA_B64=$(printf '%s' "$PAYLOAD" | base64 | tr -d '\n')

    # POST to production endpoint
    curl -i -X POST https://morfx.app/api/webhooks/coordinadora/test \
      -H "Content-Type: application/json" \
      -d "{\"message\":{\"data\":\"${DATA_B64}\",\"messageId\":\"smoke1-$(date +%s)\"}}"
    ```

    Expected output:
    - HTTP 200 OK
    - JSON body `{"ok":true,"newly_inserted":true}`

    **Step B — Verify row was inserted in order_carrier_events:**

    Open Supabase Studio → SQL Editor and run:

    ```sql
    SELECT id, workspace_id, tracking_number, codigo, source, env, created_at
    FROM order_carrier_events
    WHERE tracking_number = '99999999901'
    ORDER BY created_at DESC
    LIMIT 1;
    ```

    Expected:
    - 1 row
    - workspace_id = `a3843b3f-c337-4836-92b5-89c58bb98490` (Somnio V1 fallback for events without novedad)
    - tracking_number = `99999999901`
    - codigo = `6`
    - source = `webhook:coordinadora`
    - env = `test`

    **Step C — Verify idempotency (re-POST same payload):**

    Run the same curl from Step A again with the SAME `messageId`. Actually use the same `DATA_B64` payload (Pub/Sub may use different messageId on retry, but our idempotency key is (workspace_id, tracking_number, fecha, hora, codigo, codigo_estado) — same).

    Expected output:
    - HTTP 200 OK
    - JSON body `{"ok":true,"newly_inserted":false}`  ← key: `newly_inserted` flips to false
    - DB query from Step B still returns only 1 row (no duplicate)

    **Step D — Verify Inngest function fired (only on the FIRST POST):**

    Run this SQL:

    ```sql
    SELECT event_type, agent_id, payload, created_at
    FROM agent_observability_events
    WHERE agent_id = 'coordinadora-webhook'
      AND created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY created_at DESC
    LIMIT 5;
    ```

    Expected:
    - At least 1 row with event_type='coordinadora_webhook_processed'
    - payload.trackingNumberLast4 = '9901'
    - payload.codigo = '6'
    - payload should NOT contain the full tracking_number '99999999901' anywhere (D-28 PII redaction)

    **Step E — Cleanup (optional — leaves a smoke row for audit):**

    The smoke row can be left in place for audit. If you want to remove it:

    ```sql
    DELETE FROM order_carrier_events WHERE tracking_number = '99999999901';
    DELETE FROM agent_observability_events
    WHERE agent_id = 'coordinadora-webhook'
      AND payload->>'trackingNumberLast4' = '9901';
    ```

    **Document outcome:** copy the curl outputs (Steps A + C) and the SQL results (Steps B + D) into the SUMMARY for this plan. If any step fails, document the failure mode + diagnose root cause before continuing.

    Commit message: (no commit — this is a manual smoke test)
  </action>
  <verify>
    <automated>echo "Manual smoke test — verify completion by reading 10-SUMMARY.md outputs"; test -f .planning/standalone/coordinadora-api-integration/10-SUMMARY.md || echo "SUMMARY not yet written"</automated>
  </verify>
  <acceptance_criteria>
    - Step A returns HTTP 200 + `newly_inserted:true`
    - Step B: SQL returns exactly 1 row with all expected fields
    - Step C: re-POST returns HTTP 200 + `newly_inserted:false` (idempotency confirmed)
    - Step D: at least 1 row in agent_observability_events with PII-redacted payload
    - SUMMARY documents actual outputs (paste exact curl + SQL results)
  </acceptance_criteria>
  <done>Smoke 1 passes. Webhook receiver + domain insert + Inngest dispatch + observability emit are all confirmed working end-to-end in production.</done>
</task>

<task type="auto">
  <name>Task 5: Mark coordinadora-status-polling standalone as SUPERSEDED (D-32)</name>
  <files>.planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md</files>
  <read_first>
    - .planning/standalone/coordinadora-status-polling/ (list directory contents to confirm structure)
    - .planning/standalone/coordinadora-status-polling/RESEARCH-API.md (current SUPERSEDED marker — may already exist per CONTEXT D-32)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-32 (canonical wording)
  </read_first>
  <action>
    First, inspect the existing standalone:

    ```bash
    ls .planning/standalone/coordinadora-status-polling/
    head -20 .planning/standalone/coordinadora-status-polling/RESEARCH-API.md
    ```

    If `RESEARCH-API.md` ALREADY contains a `STATUS: superseded` line at the top (matching D-32), this task is a no-op — just verify and skip.

    If NOT, create `.planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md`:

    ```markdown
    # STATUS: SUPERSEDED

    **Superseded by:** `.planning/standalone/coordinadora-api-integration/`
    **Date:** 2026-05-26
    **Decision:** CONTEXT.md D-32 in the superseding standalone

    ## Why

    Coordinadora's modern integration is **webhook push** (Pub/Sub) over **REST**, not
    SOAP polling. The research in this standalone (SOAP `ConsultaEstadoGuia` polling)
    investigated an outdated approach that Coordinadora's commercial team confirmed
    is no longer the preferred integration in 2026 (per D-37 communication thread with
    Jenny @ Coordinadora, 2026-05-26).

    ## Replacement

    See `.planning/standalone/coordinadora-api-integration/` for:
    - OAuth2 client_credentials token cache (`src/lib/carriers/coordinadora/client.ts`)
    - REST wrappers: cotizar, createGuia, imprimirEtiqueta
    - Pub/Sub webhook receiver at `/api/webhooks/coordinadora/[env]`
    - Idempotent persistence via `order_carrier_events` partial UNIQUE INDEX
    - Async downstream via Inngest function `coordinadora-webhook-process`

    ## Status of source materials in this standalone

    All research artifacts in `coordinadora-status-polling/` remain for HISTORICAL
    AUDIT but should NOT be used for any new work. Do not implement SOAP polling
    against Coordinadora — they explicitly recommend the webhook/REST path going
    forward.
    ```

    Additionally, if `RESEARCH-API.md` does NOT have a SUPERSEDED header, prepend this line at the top of the file (via Edit, not Write):

    ```markdown
    > **STATUS: SUPERSEDED by `.planning/standalone/coordinadora-api-integration/` (2026-05-26 per D-32). Do not implement. See STATUS-SUPERSEDED.md.**

    ```

    Commit message: `docs(coordinadora-status-polling): mark SUPERSEDED by coordinadora-api-integration (D-32)`
  </action>
  <verify>
    <automated>test -f .planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md &amp;&amp; grep -q "Superseded by" .planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md &amp;&amp; grep -qE "SUPERSEDED|superseded" .planning/standalone/coordinadora-status-polling/RESEARCH-API.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/standalone/coordinadora-status-polling/STATUS-SUPERSEDED.md` exists
    - Contains link/reference to `coordinadora-api-integration` standalone
    - References D-32 decision
    - `RESEARCH-API.md` has a SUPERSEDED line at the top
  </acceptance_criteria>
  <done>Obsolete artifact marked. Future readers of `coordinadora-status-polling/` immediately see they should not implement that approach.</done>
</task>

</tasks>

<verification>
- Seed migration created + applied in prod (user confirms via "seed-applied")
- Vercel deploy completes
- Smoke 1 passes 4 steps (POST 200, DB row, re-POST 200 newly_inserted:false, observability row)
- coordinadora-status-polling marked SUPERSEDED
</verification>

<success_criteria>
1. Seed migration committed + applied (2 commits, 1 user signal)
2. Code deployed to Vercel
3. Smoke 1 passes all 4 verification steps (outputs documented in SUMMARY)
4. coordinadora-status-polling SUPERSEDED marker committed
5. Wave 4 (smokes 2-7) is the only remaining work, blocked on D-37 credentials
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/10-SUMMARY.md` documenting:
- Migration filename + apply confirmation timestamp
- Vercel deployment commit SHA + build URL
- Smoke 1 outputs (paste raw curl response + SQL results for steps A,B,C,D)
- Confirmation `coordinadora-status-polling` is marked SUPERSEDED
- Note: V1.1 work — additional observability events (api_token_refreshed, api_call_*, webhook_drop_*) when business-logic callers are wired up
</output>
