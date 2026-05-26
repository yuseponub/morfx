# debounce-interruption-system-v2 — Handoff State

Last updated: 2026-05-26 (post Plan 00 ship)

## Quick start next session

```
/clear
/gsd-execute-phase debounce-interruption-system-v2 --wave 1
```

The orchestrator finds `00-SUMMARY.md` → skips Plan 00 → starts Plan 01.

If the orchestrator stumbles on standalone discovery (this phase is in
`.planning/standalone/` not `.planning/phases/`), point it manually at
`.planning/standalone/debounce-interruption-system-v2/01-PLAN.md` and
let `gsd-executor` take it from there.

## Where Plan 00 left things (snapshot)

### Commits on main (most recent → oldest)

| SHA      | Subject                                                                                              |
|----------|------------------------------------------------------------------------------------------------------|
| 3972ea70 | docs(debounce-v2 plan-00): SUMMARY.md — Wave 0 foundation complete                                   |
| c8466447 | docs(debounce-v2 plan-00): backfill keepTtl verdict + Multi-Zone defer + WSL latency probe          |
| 79d49a25 | chore(probe): sync pnpm-lock.yaml with @upstash/redis dep (fix preview build)                       |
| 2ac81729 | docs(debounce-v2 plan-00): wave 0 measurements — dedup audit + sub-loop baseline + v4 dormancy      |
| 5fa4515f | chore(debounce-v2 plan-00): install @upstash/redis 1.38.0 + document env vars                       |

All pushed to `origin/main`.

### Infrastructure state

- **Upstash Redis** (sa-east-1, São Paulo):
  - `morfx-interruption-prod` → `excited-dogfish-66405.upstash.io` (Pay-as-you-go, single-zone)
  - `morfx-interruption-dev`  → `deep-gator-136538.upstash.io` (Free tier)
- **Vercel** project `morfx` env vars (4 total):
  - Production env: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (PROD creds)
  - Preview env:    `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (DEV creds — Pitfall 5 isolation)
- **`.env.local`**: UPSTASH_REDIS_REST_URL/TOKEN pointing at DEV DB.
- **`.env.example`** (line ~38): UPSTASH block documented (committed).
- **`@upstash/redis@1.38.0`** in both `package.json` and `pnpm-lock.yaml`.

### Locked decisions / constants

| Constant            | Locked value | Source                                                                                      |
|---------------------|--------------|---------------------------------------------------------------------------------------------|
| `LOCK_TTL_S`        | 45 seconds   | DISCUSSION-LOG D-09; Task 0.1 N=0 → fallback rule (00-MEASUREMENTS.md §Sub-loop)             |
| `HEARTBEAT_MS`      | 5000         | RESEARCH A1 ratio (~9x against TTL); preserved by `{ keepTtl: true }` per W7 verdict        |
| `keepTtl` SDK option| SUPPORTED    | Task 0.5b empirical probe (00-MEASUREMENTS.md §REVISION W7)                                 |
| WhatsApp dedup      | COVERED      | `messages_wamid_unique UNIQUE (wamid)` — Task 0.4 (00-MEASUREMENTS.md §Messages dedup)      |
| `agent_id` for prod | `'somnio-v3'`| Task 0.1 discovery — NOT `'somnio-sales-v3'` (plan text was inaccurate). Apply to Plans 04-07. |

### Risks deferred (forward-looking)

1. **Multi-Zone HA**: not activated at provisioning ($200/mo declined). Re-evaluate at v4 flip-to-active. Single-zone tolerated while v4 dormant.
2. **FB/IG inbound dedup**: `messages` table lacks UNIQUE on FB/IG message ID. v4 serves WhatsApp only today; gap closes whenever v4 onboards FB/IG (separate standalone). Plan 03 SUMMARY re-affirms acceptance.
3. **In-region Vercel→Upstash latency unvalidated**: Vercel Auth team-level gated the preview probe; WSL-local pivot captured upper-bound numbers only. Plan 05 E2E smoke + Phase 42.1 observability will close this.
4. **Orphan Claude-Code worktrees**: ~14 stale `.claude/worktrees/agent-*` debris (one had `main` checked out + locked, blocked our checkout flow this session — used `update-ref` workaround). Out of scope for this standalone; consider a cleanup pass before resuming heavy parallel execution.

## Plans 01–07 dependency graph (from plan frontmatter)

```
Wave 0 → 00 ✅ DONE
Wave 1 → 01 (depends on: 00)   ← NEXT
Wave 2 → 02 (depends on: 01)
Wave 3 → 03 (depends on: 02)
Wave 4 → 04 (depends on: 03)
Wave 5 → 05 (depends on: 04)
       └ 06 (depends on: 01, 02, 04, 05)
Wave 6 → 07 (depends on: 04, 05, 06)  ← autonomous: false (Tasks 7.3 + 7.4 are human checkpoints)
```

Wave 5 (Plan 05 + Plan 06) can run in parallel because Plan 06 only depends on 01/02/04/05, NOT on 05's intra-wave siblings — wait, 06 DOES depend on 05. So 05 first, then 06. Probably both serially in Wave 5 unless parallelizable safe.

## Files Plan 01 will create (per its frontmatter)

When Plan 01 runs, expect commits adding `src/lib/locks/lock.ts` (or similar). The
`LOCK_TTL_S = 45` constant should land with an inline comment citing
`.planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md`
§Sub-loop latency baseline as the rationale.

## Useful commands when resuming

```bash
# Confirm phase state
ls .planning/standalone/debounce-interruption-system-v2/

# Verify env wiring is still alive (after possible Vercel redeploys)
vercel env ls | grep UPSTASH        # → expect 4 rows (URL/TOKEN × Production/Preview)
grep UPSTASH .env.local              # → expect 2 rows (DEV creds)

# Verify @upstash/redis still installed
node -e "require('@upstash/redis')"  # → exit 0

# Smoke-test Upstash reachability before Plan 01 starts
node -e "
import('dotenv').then(d => d.config({ path: '.env.local' })).then(async () => {
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  const t0 = performance.now();
  await r.set('handoff-smoke', '1', { ex: 5 });
  await r.del('handoff-smoke');
  console.log('Upstash round-trip ms:', performance.now() - t0);
});
"
```

## Pointers to authoritative artifacts

- **What was built (per task)**: `00-SUMMARY.md` ← in same directory.
- **Measurements and decisions**: `00-MEASUREMENTS.md` ← in same directory.
- **Locked discussions (30 D's)**: `DISCUSSION-LOG.md` ← in same directory.
- **Research and pitfalls**: `RESEARCH.md` ← in same directory.
- **Plan files**: `01-PLAN.md` through `07-PLAN.md` ← in same directory.
