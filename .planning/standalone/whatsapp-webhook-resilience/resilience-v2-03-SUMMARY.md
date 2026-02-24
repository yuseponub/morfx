---
phase: standalone/whatsapp-webhook-resilience
plan: 03
subsystem: whatsapp-resilience
tags: [replay, cli-script, dead-letter, dotenv, tsx]
dependency-graph:
  requires: [resilience-v2-01, resilience-v2-02]
  provides: [replay-cli-script, scripts-tsconfig]
  affects: []
tech-stack:
  added: [dotenv]
  patterns: [dotenv-first-import, scripts-tsconfig-with-path-aliases, sequential-rate-limited-processing]
key-files:
  created:
    - scripts/replay-failed-webhooks.ts
    - scripts/tsconfig.json
  modified:
    - package.json
    - package-lock.json
decisions:
  - id: rv2-03-01
    decision: "dotenv/config as first import before any app imports"
    rationale: "Env vars must be loaded before createAdminClient or any module reads process.env"
  - id: rv2-03-02
    decision: "Script manages status updates directly via its own Supabase client"
    rationale: "Script is responsible for retry_count tracking and dead_letter escalation, not the processing pipeline"
  - id: rv2-03-03
    decision: "2-second delay between events for rate limiting"
    rationale: "Prevents overwhelming WhatsApp API and Supabase during batch replay"
metrics:
  duration: ~9min
  completed: 2026-02-24
---

# Standalone resilience-v2 Plan 03: Replay Script + Dead Letter Summary

CLI replay script for failed webhook events with sequential FIFO processing, 3-retry dead-letter escalation, dotenv-based env loading, and scripts/tsconfig.json for @/* path alias resolution.

## What Was Done

### Task 1: Create scripts/tsconfig.json
- Created TypeScript config that extends root tsconfig.json
- Overrides `paths` to point `@/*` to `../src/*` (relative from scripts/)
- Includes both `./**/*.ts` and `../src/**/*.ts` for full type resolution
- Required because root tsconfig.json excludes `scripts/` directory
- Run command: `npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts`
- Commit: 61081dc

### Task 2: Add dotenv as devDependency
- Installed dotenv@17.3.1 as devDependency
- Added to package.json devDependencies (alphabetically sorted)
- Updated package-lock.json
- Needed because scripts run outside Next.js (via `npx tsx`), where .env.local is not auto-loaded
- WSL2 NTFS filesystem issue required `--legacy-peer-deps` and `--package-lock-only` approach
- Commit: 9b80d01

### Task 3: Create scripts/replay-failed-webhooks.ts
- Full implementation of CLI replay script (127 lines)
- Loads env vars via `import 'dotenv/config'` as first import
- Validates NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before proceeding
- Creates its own Supabase client (service role key for admin access)
- Queries `whatsapp_webhook_events` with `status='failed' AND retry_count < 3`
- Orders by `created_at ASC` (FIFO -- oldest events first)
- For each event:
  - Calls `replayWebhookPayload(payload, workspace_id, phone_number_id)` from Plan 02
  - On success: updates status to 'reprocessed', increments retry_count, sets reprocessed_at
  - On failure with retry_count < 3: keeps status 'failed', increments retry_count, updates error_message
  - On failure with retry_count >= 3: sets status to 'dead_letter'
  - 2-second delay between events (rate limiting)
- Prints per-event progress and final summary (reprocessed/still-failed/dead-lettered/total)
- No hardcoded credentials (explicit contrast with existing backfill-is-client.ts pattern)
- Commit: 98ce1ee

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] WSL2 NTFS filesystem error during npm install**
- **Found during:** Task 2
- **Issue:** `npm install --save-dev dotenv` failed with ENOTDIR on date-fns rename due to WSL2 NTFS filesystem limitations
- **Fix:** Used `--legacy-peer-deps` flag for initial install, then `--package-lock-only` to update lockfile separately. Manually added dotenv to package.json devDependencies.
- **Files modified:** package.json, package-lock.json
- **Commit:** 9b80d01

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| rv2-03-01 | dotenv/config as first import | Env vars must be loaded before any module reads process.env |
| rv2-03-02 | Script manages status updates directly | Retry tracking and dead-letter escalation are script responsibilities |
| rv2-03-03 | 2-second delay between events | Rate limiting prevents overwhelming WhatsApp API during batch replay |

## Verification Results

All checks passed:
- scripts/tsconfig.json exists and extends root tsconfig
- scripts/replay-failed-webhooks.ts imports replayWebhookPayload (not processWebhook)
- dotenv/config is first import (line 16)
- dotenv@17.3.1 installed as devDependency
- Script compiles without errors under scripts/tsconfig.json
- Main project compilation unaffected (scripts/ excluded by root tsconfig)
- No hardcoded credentials in script

## Commits

| Hash | Message |
|------|---------|
| 61081dc | chore(resilience-v2-03): create scripts/tsconfig.json for @/* path aliases |
| 9b80d01 | chore(resilience-v2-03): add dotenv as devDependency for CLI scripts |
| 98ce1ee | feat(resilience-v2-03): create CLI replay script for failed webhook events |

## Phase Complete

With Plan 03, the WhatsApp Webhook Resilience v2 standalone phase is complete:
- **Plan 01:** DB migration (retry_count, reprocessed_at, expanded status CHECK, partial index)
- **Plan 02:** Code changes (conditional HTTP response, replayWebhookPayload export, expanded status types)
- **Plan 03:** CLI replay script (this plan) for manual incident recovery

The full resilience pipeline:
1. Webhook arrives -> payload stored BEFORE processing (Plan 02)
2. If processing fails: HTTP 200 returned (payload is safe), event marked 'failed' (Plan 02)
3. If storage fails: HTTP 500 returned, 360dialog retries (Plan 02)
4. After incident: `npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts` replays failed events (Plan 03)
5. Events that fail 3 times are escalated to 'dead_letter' for manual investigation (Plan 03)
