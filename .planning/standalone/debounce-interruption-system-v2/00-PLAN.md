---
phase: standalone-debounce-interruption-system-v2
plan: 00
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - .env.local.example
  - .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md
autonomous: false  # Task 0.3 is checkpoint:human-action (Upstash provisioning by user)
requirements:
  - LOCK-01  # depends on @upstash/redis being installed + env vars present
user_setup:
  - service: upstash-redis
    why: "Distributed mutex for atomic SET NX (D-01) — primary correctness mechanism (D-15 fencing)"
    env_vars:
      - name: UPSTASH_REDIS_REST_URL
        source: "Upstash Console -> Database -> REST API"
      - name: UPSTASH_REDIS_REST_TOKEN
        source: "Upstash Console -> Database -> REST API"
    dashboard_config:
      - task: "Provision regional Upstash Redis database in us-east-1 (matches Vercel iad1 per RESEARCH A1)"
        location: "https://console.upstash.com → Create Database → Region: us-east-1 → Type: Regional → Plan: Pay-as-you-go (Prod Pack with Multi-Zone enabled per Pitfall 1)"
      - task: "Provision SECOND database for dev/sandbox (Pitfall 5 isolation — D-19 Fase 2)"
        location: "Same console; second Database, same region, named e.g. `morfx-interruption-dev`"

must_haves:
  truths:
    - "@upstash/redis@^1.38.0 is in package.json dependencies (RESEARCH Standard Stack)."
    - "Production sub-loop P95/P99 latency measured against D-13's 17s budget; if P99 > 25s a TTL adjustment recommendation is documented (RESEARCH A2 → 00-MEASUREMENTS.md)."
    - "Upstash REST P50/P99 from Vercel iad1 → Upstash us-east-1 measured with ≥30 samples (RESEARCH A1)."
    - "REVISION W7: `keepTtl` SET option support verified empirically against the dev Upstash database using @upstash/redis@1.38.0. Verdict recorded in 00-MEASUREMENTS.md as either 'SUPPORTED — Plan 04 V4MessagingAdapter.onFirstSendCompleted uses redis.set(key, value, { keepTtl: true })' OR 'NOT SUPPORTED — Plan 04 uses TTL-read-then-set pattern (read remaining TTL, redis.set with that ex; heartbeat at 5s frequency makes the race window negligible)'."
    - "User has provisioned both Upstash databases (prod + dev) and added UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to .env.local and Vercel prod env (Wave 0 blocking prereq)."
    - "Messages table de-dup constraint inventory completed: documented which constraints exist on the messages table (RESEARCH A8) — wamid UNIQUE confirmed (per existing migration 20260130000002_whatsapp_conversations.sql:82); recommendation captured if (conversation_id, message_id) belt-and-suspenders is missing."
    - "v4 dormancy in Somnio prod verified by querying agent_observability_events for last 7d with agent_id='somnio-sales-v4' returning 0 rows (D-04 + D-07 + Regla 6 compliance gate)."
    - "REVISION W6: Task 0.4 stance aligned with Plan 03 — if FB/IG dedup constraint is missing it is documented as a forward-looking risk (v4 doesn't serve FB/IG today) and does NOT block this phase. The Plan 00 audit produces evidence; Plan 03 SUMMARY records the acceptance."
  artifacts:
    - path: "package.json"
      provides: "@upstash/redis dependency declared"
      contains: '"@upstash/redis":'
    - path: ".env.local.example"
      provides: "Documented env var names so future devs don't break local builds"
      contains: "UPSTASH_REDIS_REST_URL"
    - path: ".planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md"
      provides: "Locked baseline measurements + TTL recommendation + dormancy attestation + REVISION W7 keepTtl verdict"
      contains: "Sub-loop P99"
  key_links:
    - from: "All subsequent plans (01..07)"
      to: "@upstash/redis package + env vars"
      via: "Plan 01 redis-client.ts imports from @upstash/redis and reads process.env.UPSTASH_*"
      pattern: "@upstash/redis"
---

<objective>
Wave 0 — Foundation: install the `@upstash/redis` dependency, measure baselines that anchor the TTL/heartbeat values locked in DISCUSSION-LOG.md (D-09 timings, RESEARCH A1/A2), have the user provision two Upstash databases (prod + dev) and add env vars to `.env.local` and Vercel, then verify v4 dormancy in prod so the "big bang no flag" decision (D-07) is safe under Regla 6.

REVISION W7: a new Task 0.5b (`Verify keepTtl support in @upstash/redis 1.38.0`) runs an empirical test against the dev Upstash database and records the verdict in 00-MEASUREMENTS.md so Plan 04 V4MessagingAdapter.onFirstSendCompleted can pick the right code branch deterministically (no runtime detection).

REVISION W6: Task 0.4 stance aligned with Plan 03 — FB/IG dedup gap (if found) is accepted as forward-looking risk (v4 only serves WhatsApp today). DO NOT STOP on FB/IG gap; document and proceed. The user has already explicitly aligned both plans to this stance.

Purpose: every other plan (01..07) reads from `process.env.UPSTASH_REDIS_REST_URL` and instantiates `new Redis({ ... })`. Without the package installed AND the env vars present, the lock module crashes at import time. This plan is the single hard prerequisite gate.

Output: 4 changes — `package.json` (+ `package-lock.json`), `.env.local.example` updated, a measurements document committed to the standalone dir (now including REVISION W7 keepTtl verdict), and a human checkpoint after Upstash provisioning that BLOCKS Wave 1 until the user confirms `.env.local` and Vercel env are populated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@./.claude/rules/code-changes.md
@./.claude/rules/gsd-workflow.md
@.planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md
@.planning/standalone/debounce-interruption-system-v2/RESEARCH.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 0.1: Measure production sub-loop P95/P99 latency (RESEARCH A2 → TTL anchor)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-13 worst case 17s + Timings table — Lock TTL 45s)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md (lines 890-901 "Latency Assumptions Validated" — Action for plan-phase + Pitfall 7 line 580-590 — TTL adequacy)
    - supabase/migrations/20260408000000_observability_schema.sql (agent_observability_events schema — used to derive query columns)
  </read_first>
  <action>
    Query Supabase (use `npx supabase db query` against production, or run `mcp__supabase__execute_sql` if available, or — fallback — run a `node` snippet that uses `createAdminClient`) for the last 30 days of `agent_observability_events` rows where `category = 'pipeline_decision'` AND `label IN ('subloop_completed', 'subloop_completed_v4', 'subloop_outcome_v4')` AND `agent_id IN ('somnio-sales-v4', 'somnio-v4', 'somnio-sales-v3')` (per RESEARCH A2 — v3 is the production proxy since v4 is dormant).

    From the payload JSONB, extract `latencyMs` (or the equivalent — inspect 5 sample payloads first to confirm the exact key path; common candidates: `payload.latencyMs`, `payload.tooling.latencyMs + payload.generation.latencyMs + payload.compliance.latencyMs`). Compute P50/P95/P99 via SQL `percentile_cont(0.5/0.95/0.99) WITHIN GROUP (ORDER BY latency)`.

    Create `.planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` with sections:

    1. **Sub-loop latency baseline (RESEARCH A2)** — table with P50/P95/P99 ms; sample size N; date range. **DECISION RULE per RESEARCH A2:** if P99 ≤ 17s → keep `LOCK_TTL_S = 45` (D-09 + 2026-05-25 user adjustment). If 17s < P99 ≤ 25s → flag for monitoring but keep 45s. If P99 > 25s → **explicit recommendation to bump `LOCK_TTL_S` to 60s in Plan 01 before any code lands**; cite this row in Plan 01's `lock.ts` constant comment.
    2. **Query used** — verbatim SQL for reproducibility.
    3. **Sample size + caveats** — if N < 50, note that v4 dormancy means the sample comes from v3 as proxy and bump is precautionary.

    If `agent_observability_events` has zero relevant rows (e.g., subloop completion events not yet emitted under those labels), grep `src/lib/agents/somnio-v4/sub-loop/index.ts` for `recordEvent.*subloop` to find the actual label, retry query. If still empty, document `N=0 → keep 45s (conservative default)` and proceed.
  </action>
  <verify>
    <automated>test -f .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md && grep -c "Sub-loop latency baseline" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` succeeds.
    - `grep -c "P99" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1.
    - `grep -c "LOCK_TTL_S" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1 (explicit TTL recommendation present).
    - File mentions either "45s" or "60s" as the locked value with justification.
  </acceptance_criteria>
  <done>Sub-loop P99 measured against D-13 17s budget; TTL recommendation locked.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 0.2: Measure Upstash REST latency from Vercel iad1 (RESEARCH A1 → SLO anchor)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md (lines 890-901 "Latency Assumptions Validated" — A1 claim P50 5-15ms / P99 20-40ms; lines 569-577 Pitfall 6 cold-start)
  </read_first>
  <action>
    **Pre-requisite:** Task 0.3 (Upstash provisioning) MUST complete first to have valid URL+token. Since Task 0.3 is a human checkpoint, this task runs AFTER Task 0.3 unblocks.

    Create a throwaway probe file at `src/app/api/_diagnostics/upstash-latency/route.ts` (Node runtime; we will delete this file at the end of this task — do NOT commit it permanently):

    ```ts
    import { NextResponse } from 'next/server'
    import { Redis } from '@upstash/redis'
    export const runtime = 'nodejs'
    export async function GET() {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
      const samples: number[] = []
      for (let i = 0; i < 30; i++) {
        const k = `probe:${crypto.randomUUID()}`
        const t0 = performance.now()
        await redis.set(k, '1', { ex: 5 })
        const t1 = performance.now()
        await redis.del(k)
        samples.push(t1 - t0)
      }
      samples.sort((a, b) => a - b)
      const p = (q: number) => samples[Math.floor((samples.length - 1) * q)]
      return NextResponse.json({
        n: samples.length,
        p50_ms: p(0.5),
        p95_ms: p(0.95),
        p99_ms: p(0.99),
        min: samples[0],
        max: samples[samples.length - 1],
      })
    }
    ```

    Push to a Vercel preview branch (`git checkout -b probe/upstash-latency`, commit, `git push origin probe/upstash-latency`, Vercel auto-deploys preview). Once preview deploys, `curl https://<preview-url>/api/_diagnostics/upstash-latency` 3 times consecutively (the first call may show cold-start; the second and third are warm). Append the 3 result blocks to `00-MEASUREMENTS.md` under a new `## Upstash REST latency baseline (RESEARCH A1)` section.

    **Validation rule:** if warm P99 > 50ms, raise a concern in the section ("RESEARCH A1 ASSUMPTION VIOLATED — heartbeat at 5s with 45s TTL leaves only ~5x margin instead of 9x; consider reducing heartbeat interval or bumping TTL"). Keep `LOCK_TTL_S` decision unless Task 0.1 also recommended a bump.

    After capturing measurements, DELETE `src/app/api/_diagnostics/upstash-latency/route.ts` and the preview branch (don't merge — only push to remote for preview). The route should NEVER reach main. Verify with `git diff main --stat` showing zero changes to `src/app/api/_diagnostics/**`.
  </action>
  <verify>
    <automated>grep -c "Upstash REST latency baseline" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md && ! test -d src/app/api/_diagnostics</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Upstash REST latency baseline" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1.
    - `grep -c "p50_ms\|p99_ms" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 2.
    - `! test -e src/app/api/_diagnostics/upstash-latency/route.ts` (file deleted; not on main).
    - Document records N=30 per probe run and at least 2 warm runs.
  </acceptance_criteria>
  <done>Real-world Upstash latency measured against RESEARCH A1; SLO confirmed or flagged.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 0.3: USER provisions Upstash databases + adds env vars (D-01 prereq, RESEARCH Open Question 7)</name>
  <what-built>Nothing yet — this is the blocking prerequisite for everything else. The user needs to (a) create two Upstash Redis databases and (b) populate environment variables before Plan 01 can compile.</what-built>
  <how-to-verify>
    USER STEPS (cannot be automated — Upstash account credentials live in user's browser):

    1. Open https://console.upstash.com (sign in).
    2. **Production database:** click "Create Database":
       - Name: `morfx-interruption-prod`
       - Type: **Regional** (NOT Global — RESEARCH "Alternatives Considered" table: Global is read-optimized; we are write-heavy).
       - Region: `us-east-1` (matches Vercel `iad1` default — RESEARCH A1).
       - Enable **Multi-Zone (Prod Pack)** option (RESEARCH Pitfall 1 — failover seconds vs minutes).
       - Plan: Pay-as-you-go (start cheap; spike fine — RESEARCH cost estimate ~$10/mo).
    3. **Dev database:** repeat step 2 with name `morfx-interruption-dev`, same region, Multi-Zone OPTIONAL (cost saving — Pitfall 5 only needs isolation).
    4. From each database's REST API page, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
    5. **Local dev env** — append to `.env.local` (already gitignored):
       ```
       UPSTASH_REDIS_REST_URL=https://<dev-db-host>.upstash.io
       UPSTASH_REDIS_REST_TOKEN=<dev-token>
       ```
    6. **Vercel prod env** — at https://vercel.com/<account>/morfx-new/settings/environment-variables, add for the **Production** environment (not Preview, not Development):
       - `UPSTASH_REDIS_REST_URL = https://<prod-db-host>.upstash.io`
       - `UPSTASH_REDIS_REST_TOKEN = <prod-token>`
    7. **Vercel preview env** — same screen, add for the **Preview** environment using the **DEV** database URL+token (Pitfall 5 — preview branches do NOT touch prod Redis).

    REPORT BACK by typing one of:
    - "approved" if all 4 env-var slots are populated (local `.env.local` + Vercel Production + Vercel Preview — 3 slots × URL+token = 6 values, dev DB shared between local and Vercel Preview = 4 unique values across 3 environments).
    - "issue: <describe>" if blocked.

    Until "approved" is received, do NOT proceed to Task 0.4 or any Wave 1 work.
  </how-to-verify>
  <resume-signal>Type "approved" once .env.local has UPSTASH_REDIS_REST_URL/TOKEN AND Vercel prod+preview env are populated.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 0.4: Verify messages table dedup constraint (RESEARCH A8 belt-and-suspenders audit) — REVISION W6: FB/IG gap is FORWARD-LOOKING RISK, NOT BLOCKER</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md (line 1009 — A8 messages unique constraint claim; lines 491-507 Pitfall 1 — messages unique cited as one of 3 defense layers)
    - supabase/migrations/20260130000002_whatsapp_conversations.sql (line 82 — confirmed `messages_wamid_unique UNIQUE (wamid)` exists)
  </read_first>
  <action>
    RESEARCH A8 claims `(conversation_id, message_id)` is unique. **Empirical check on actual schema** (already done in plan-phase: only `wamid UNIQUE` exists; `(conversation_id, message_id)` does NOT exist). Document this finding:

    1. Run `grep -rn "UNIQUE\|PRIMARY KEY\|UNIQUE INDEX" supabase/migrations/ | grep -i "messages\b\|messages_"` and capture the full output.
    2. From the output identify every unique constraint and unique index on the `messages` table. Confirmed candidates (re-verify):
       - `messages_wamid_unique UNIQUE (wamid)` from `20260130000002_whatsapp_conversations.sql:82`
       - Primary key on `messages.id` (default `gen_random_uuid()`)
    3. Decide whether the existing constraints are sufficient belt-and-suspenders. For WhatsApp inbound (the v4 path), `wamid` IS Meta's `message_id`, so the existing `messages_wamid_unique` constraint DOES catch duplicate inbound dispatches (even though A8's specific claim about `(conversation_id, message_id)` was inaccurate). For FB/IG via ManyChat the column is `external_subscriber_id` + a different ID — verify separately.
    4. Append a new section to `00-MEASUREMENTS.md`:
       ```
       ## Messages dedup constraint inventory (RESEARCH A8 audit)

       Existing constraints:
       - `messages_wamid_unique UNIQUE (wamid)` — file 20260130...whatsapp_conversations.sql:82
       - (any others discovered)

       WhatsApp inbound dedup: COVERED via wamid (Meta's message_id).
       FB/IG (ManyChat) inbound dedup: <state COVERED via X column or GAP — recommend creating UNIQUE constraint Y>.

       Decision: PROCEED (REVISION W6 — FB/IG gap, if present, is accepted as forward-looking risk; v4 only serves WhatsApp today per D-12 implication).
       ```
    5. **REVISION W6 (alignment with Plan 03 Task 3.2):** If FB/IG dedup is a GAP, **DO NOT STOP** — accept as forward-looking risk. Document the gap in 00-MEASUREMENTS.md and surface it in Plan 03 SUMMARY when it ships, NOT as a blocker. v4 currently serves WhatsApp ONLY (per Memory note "v4 sigue DORMANT en prod" + D-12 channel architecture). If v4 begins serving FB/IG traffic in a future standalone, that standalone will revisit and add the dedup constraint via Regla 5 migration.

       **Explicit acceptance criterion:** This Task 0.4 NEVER blocks the phase on FB/IG dedup gap. It documents evidence. Plan 03 SUMMARY (when shipped) records the acceptance per REVISION W6.
  </action>
  <verify>
    <automated>grep -c "Messages dedup constraint inventory" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Messages dedup constraint inventory" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1.
    - Section explicitly lists `messages_wamid_unique` as found (per `20260130000002_whatsapp_conversations.sql:82`).
    - **REVISION W6:** Section ends with explicit "Decision: PROCEED" — NEVER "Decision: BLOCK on Regla 5" for the FB/IG dedup gap. If FB/IG gap exists, it's documented as forward-looking risk + tagged for the future v4-on-FB/IG standalone.
    - `grep -c "REVISION W6\|forward-looking" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1 (alignment stance documented).
  </acceptance_criteria>
  <done>Belt-and-suspenders constraint coverage audited; FB/IG gap (if any) accepted as forward-looking risk per REVISION W6 (does NOT block this phase).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 0.5: Verify v4 dormancy in production (D-04 + D-07 + Regla 6 compliance gate)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-04 "Solo somnio-sales-v4 dormant en producción" + D-07 "Big bang en agente dormant — sin feature flag")
    - ./CLAUDE.md (Regla 6 Proteger Agente en Producción — "Cuando se desarrolla un agente NUEVO o un milestone que modifica el comportamiento de un agente existente: NO desconectar el agente actual")
  </read_first>
  <action>
    Query `agent_observability_events` for the Somnio workspace `a3843b3f-c337-4836-92b5-89c58bb98490` for the last 7 days where `agent_id IN ('somnio-sales-v4', 'somnio-v4')`. Expected: **0 rows** (per Memory: "v4 sigue DORMANT en prod").

    Also query `routing_rules` table for `WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true` and inspect the JSONB `event.params.agent_id` column for any reference to `somnio-sales-v4` or `somnio-v4`. Expected: 0 active routing rules sending traffic to v4.

    Append a new section to `00-MEASUREMENTS.md`:
    ```
    ## v4 dormancy attestation (D-04 + D-07 + Regla 6)

    Query 1 (observability):
    - SQL: SELECT count(*) FROM agent_observability_events WHERE workspace_id='a3843b3f-...' AND agent_id IN ('somnio-sales-v4', 'somnio-v4') AND created_at > now() - interval '7 days';
    - Result: N rows.

    Query 2 (routing rules):
    - SQL: SELECT id, name, event FROM routing_rules WHERE workspace_id='a3843b3f-...' AND active=true;
    - Inspected agent_id references: <list>.

    Conclusion: <DORMANT (proceed with big bang per D-07) | OR ACTIVE (BLOCK; user must confirm rollback strategy or add feature flag overriding D-07)>.
    ```

    **If v4 is NOT dormant**, STOP and surface to the user. D-07 ("big bang no flag") assumed dormancy; if violated, the user must either (a) revoke active routing temporarily, (b) approve a feature flag override of D-07 (which would force re-planning), or (c) accept that this standalone slips until v4 returns to dormant.
  </action>
  <verify>
    <automated>grep -c "v4 dormancy attestation" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "v4 dormancy attestation" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1.
    - Section records both queries with actual row counts.
    - Section ends with "Conclusion: DORMANT" (otherwise plan is BLOCKED and user is notified).
  </acceptance_criteria>
  <done>Regla 6 compliance gate satisfied (v4 dormant ⇒ big bang safe).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 0.5b: REVISION W7 — Verify keepTtl SET option support in @upstash/redis 1.38.0</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md (Standard Stack table — @upstash/redis 1.38.0 confirmed; Code Example 1 shows redis.set options)
    - 00-MEASUREMENTS.md (must already have Task 0.3 "approved" so env vars are populated and Upstash dev DB is reachable)
    - Task 0.6 (Upstash dependency installation) — must run BEFORE this task; otherwise no @upstash/redis available
  </read_first>
  <behavior>
    - A single empirical probe SETs a key with `{ ex: 30 }`, then immediately re-SETs the same key WITH `{ keepTtl: true }`, then reads `redis.ttl(key)`.
    - If keepTtl is SUPPORTED: TTL stays ~30s (or whatever remained from the first SET — proves the option was honored, the new SET didn't reset TTL to none).
    - If keepTtl is NOT SUPPORTED: either the SDK throws on the unknown option, OR it silently ignores it and TTL is dropped (TTL returns -1).
    - The verdict is recorded in 00-MEASUREMENTS.md as a section "REVISION W7 — keepTtl support verdict" with either "SUPPORTED" or "NOT SUPPORTED" + recommended Plan 04 branch.
  </behavior>
  <action>
    1. **Pre-requisite:** Task 0.6 (npm install) AND Task 0.3 (Upstash provisioned + env vars in .env.local) MUST be complete. Confirm `.env.local` has UPSTASH_REDIS_REST_URL/TOKEN.

    2. Create a one-off node script at `scripts/verify-keepttl.ts` (NOT to be committed — delete after):
       ```ts
       /**
        * REVISION W7 — verifies whether @upstash/redis 1.38.0 supports the SET option { keepTtl: true }.
        * Run: npx tsx scripts/verify-keepttl.ts
        * Reads UPSTASH_REDIS_REST_URL/TOKEN from .env.local.
        */
       import 'dotenv/config'
       import { Redis } from '@upstash/redis'

       async function main() {
         const redis = new Redis({
           url: process.env.UPSTASH_REDIS_REST_URL!,
           token: process.env.UPSTASH_REDIS_REST_TOKEN!,
         })

         const key = `revision-w7-probe-${Date.now()}`

         // Initial SET with TTL=30
         await redis.set(key, 'v1', { ex: 30 })
         const ttl1 = await redis.ttl(key)
         console.log('initial TTL after ex:30 set:', ttl1)

         // Wait 2s so TTL is observably < 30
         await new Promise(r => setTimeout(r, 2000))

         // Attempt re-SET with keepTtl
         let setError: string | null = null
         try {
           await redis.set(key, 'v2', { keepTtl: true } as { keepTtl: true })
         } catch (err) {
           setError = err instanceof Error ? err.message : String(err)
         }

         const ttl2 = await redis.ttl(key)
         const value2 = await redis.get(key)

         // Cleanup
         await redis.del(key)

         console.log('Result:', { setError, ttl2_after_keepTtl: ttl2, value2 })

         // Verdict logic:
         //   SUPPORTED: setError=null && ttl2 is between 26 and 29 (kept the ~28s remaining after 2s sleep)
         //   NOT SUPPORTED (silent drop): setError=null && ttl2 === -1 (TTL was reset to none)
         //   NOT SUPPORTED (throw): setError !== null
         let verdict: string
         if (setError) verdict = `NOT SUPPORTED (SDK threw: ${setError})`
         else if (ttl2 === -1) verdict = 'NOT SUPPORTED (SDK silently dropped TTL)'
         else if (ttl2 >= 25 && ttl2 <= 29) verdict = `SUPPORTED (TTL preserved at ${ttl2}s)`
         else verdict = `INDETERMINATE (ttl2=${ttl2})`

         console.log('VERDICT:', verdict)
       }

       main().catch(e => { console.error(e); process.exit(1) })
       ```

    3. Run the script: `npx tsx scripts/verify-keepttl.ts`. Capture the VERDICT line.

    4. Append to 00-MEASUREMENTS.md:
       ```
       ## REVISION W7 — keepTtl support verdict (@upstash/redis 1.38.0)

       Test: SET key with { ex: 30 }, sleep 2s, SET same key with { keepTtl: true }, check TTL.
       Run date: <date>
       Probe script: scripts/verify-keepttl.ts (deleted after test).

       Result: <paste console output>
       VERDICT: <SUPPORTED | NOT SUPPORTED (throw) | NOT SUPPORTED (silent drop)>

       Plan 04 V4MessagingAdapter.onFirstSendCompleted branch decision:
         - If SUPPORTED → use `redis.set(key, newValue, { keepTtl: true } as any)` directly.
         - If NOT SUPPORTED → use `const ttl = await redis.ttl(key); await redis.set(key, newValue, { ex: Math.max(ttl, 5) })` (race-tolerant pattern; heartbeat at 5s frequency makes the window negligible).
       ```

    5. DELETE `scripts/verify-keepttl.ts` (one-off probe). Verify `git status` shows no new files added.
  </action>
  <verify>
    <automated>grep -c "REVISION W7 — keepTtl support verdict" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md && grep -c "VERDICT:" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md && ! test -f scripts/verify-keepttl.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "REVISION W7 — keepTtl support verdict" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1.
    - `grep -cE "VERDICT:\s+(SUPPORTED|NOT SUPPORTED)" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1.
    - `grep -c "Plan 04 V4MessagingAdapter.onFirstSendCompleted branch decision" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1 (records the Plan 04 implementation branch to pick).
    - `! test -f scripts/verify-keepttl.ts` (one-off probe deleted).
  </acceptance_criteria>
  <done>REVISION W7 keepTtl verdict recorded; Plan 04 V4MessagingAdapter.onFirstSendCompleted can pick the right branch deterministically.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 0.6: Install @upstash/redis and update .env.local.example (RESEARCH Standard Stack)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md (lines 93-137 — Standard Stack table + Installation section, lines 1066-1075 Environment Availability)
    - package.json (verify @upstash/redis not yet a dependency)
  </read_first>
  <action>
    1. From repo root, run `npm install @upstash/redis@^1.38.0` — pins the caret range matching RESEARCH ("latest, ~2 weeks old as of research date 2026-05-25"). This updates both `package.json` `dependencies` and `package-lock.json`.

    2. Verify with `grep '"@upstash/redis"' package.json` returns exactly one line under `dependencies`. Confirm the actual installed version with `node -e "console.log(require('@upstash/redis/package.json').version)"`.

    3. Add the two env var declarations to `.env.local.example` (create the file if it doesn't exist; otherwise append):
       ```
       # debounce-interruption-system-v2 (D-01, D-04)
       # Provision two Upstash Redis databases (us-east-1, Multi-Zone for prod) per RESEARCH Pitfall 1 + Pitfall 5.
       # Local dev uses the DEV database; Vercel Production env uses the PROD database; Vercel Preview env uses DEV.
       UPSTASH_REDIS_REST_URL=
       UPSTASH_REDIS_REST_TOKEN=
       ```

    4. Sanity-check that Node ≥18 is the engine in `package.json` `engines.node` (or accept the Vercel default). `crypto.randomUUID()` requires Node ≥14.17 per RESEARCH Standard Stack table — Vercel default 18+ is fine.

    5. Do NOT commit `.env.local` (gitignored). Only `.env.local.example` is tracked.
  </action>
  <verify>
    <automated>grep -c '"@upstash/redis"' package.json && grep -c "UPSTASH_REDIS_REST_URL" .env.local.example</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"@upstash/redis"' package.json` ≥ 1.
    - `grep -E '"@upstash/redis":\s*"\^?1\.' package.json` matches (any 1.x version satisfying ^1.38.0).
    - `grep -c "UPSTASH_REDIS_REST_URL" .env.local.example` ≥ 1.
    - `grep -c "UPSTASH_REDIS_REST_TOKEN" .env.local.example` ≥ 1.
    - `package-lock.json` modified (Bash: `git diff --name-only main -- package-lock.json` lists it).
  </acceptance_criteria>
  <done>Dependency installed and locked; example env file documents the new vars.</done>
</task>

</tasks>

<verification>
1. `grep -c '"@upstash/redis"' package.json` ≥ 1
2. `test -f .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md`
3. `grep -c "Sub-loop latency baseline\|Upstash REST latency baseline\|Messages dedup constraint inventory\|v4 dormancy attestation\|REVISION W7 — keepTtl support verdict" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 5 (REVISION W7 adds the 5th required section)
4. Bash: `node -e "require('@upstash/redis')"` exits 0.
5. Both Vercel envs (Production + Preview) have UPSTASH_REDIS_REST_URL/TOKEN populated (verified by user in Task 0.3 checkpoint).
6. REVISION W6: Task 0.4 documents FB/IG gap as forward-looking risk, not blocker (`grep -c "PROCEED" .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md` ≥ 1 in the dedup section).
</verification>

<success_criteria>
- Dependency installed and locked.
- Latency baselines (sub-loop + Upstash) captured with explicit TTL recommendation.
- REVISION W7: keepTtl verdict recorded so Plan 04 can pick the right onFirstSendCompleted branch.
- v4 dormancy attested for Regla 6 + D-07.
- REVISION W6: FB/IG dedup gap (if any) accepted as forward-looking risk; Plan 03 SUMMARY records the acceptance when it ships.
- User confirmed Upstash provisioned and env vars populated across 3 environments.
- 00-MEASUREMENTS.md committed to standalone dir as the audit trail for Wave 1+ to reference.
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/00-SUMMARY.md` documenting: P50/P95/P99 sub-loop and Upstash measurements, final TTL recommendation (45s vs 60s), dormancy attestation result, REVISION W7 keepTtl verdict + Plan 04 branch decision, REVISION W6 FB/IG dedup verdict (PROCEED stance), any GAPS surfaced (messages dedup, FB/IG coverage), and the user's "approved" timestamp from Task 0.3.
</output>
