---
phase: sms-billing-atomic-rpc
plan: 01
status: complete
completed: 2026-04-17
---

# Plan 01 Summary — Atomic SMS billing migration

## What was built

Single SQL migration file adding 3 Postgres RPCs to close Defect B (non-atomicity), Defect C (missing guards), and provide the backfill tool for Plan 04:

- **File:** `supabase/migrations/20260418011321_sms_atomic_rpc.sql` (275 lines)
- **Commit:** `d2cf2b3` — `feat(sms-billing-atomic-rpc-01): add atomic SMS billing migration` (local only, not pushed yet)

### Functions

1. **`insert_and_deduct_sms_message`** (NEW) — atomic INSERT `sms_messages` + UPDATE `sms_workspace_config` + INSERT `sms_balance_transactions` in one plpgsql transaction with `FOR UPDATE` lock. Guard on `p_amount <= 0`. Implements D-01, D-02, D-06.
2. **`deduct_sms_balance`** (PATCH via CREATE OR REPLACE) — guard `p_amount <= 0` added; body otherwise unchanged. Kept per D-04 for top-up / super-admin paths. Implements D-05.
3. **`backfill_sms_message`** (NEW) — idempotent per-row repair for orphan rows with `cost_cop=0`. Does NOT increment `total_sms_sent` (Pitfall 7). Implements D-10.

All three: `SECURITY DEFINER`, `LANGUAGE plpgsql`, `GRANT EXECUTE` to `authenticated` + `service_role`.

## Verification gates (automated)

| Check | Expected | Actual |
|---|---|---|
| `CREATE OR REPLACE FUNCTION` count | 3 | 3 |
| `GRANT EXECUTE` count | 6 | 6 |
| `RAISE EXCEPTION` count (code) | 2 | 2 |
| `FOR UPDATE` count | 3 | 3 |
| `SECURITY DEFINER` count | 3 | 3 |
| `LANGUAGE plpgsql` count | 3 | 3 |
| File size (lines) | >180 | 275 |

## Checkpoint — human apply in Supabase production

**migracion aplicada** — confirmed by user 2026-04-17.

User pasted the migration into Supabase Dashboard SQL Editor (production project), ran it, and ran the 3 verification queries:

1. **`pg_proc` query** — 3 rows returned (all 3 functions exist).
2. **Guard test `deduct_sms_balance(ws, 0, ...)`** — RAISE EXCEPTION with `Invalid amount: p_amount must be > 0, got 0` (✅ guard active).
3. **Guard test `insert_and_deduct_sms_message(ws, ..., p_amount=0)`** — same error (✅ guard active).
4. **Happy path with `BEGIN; ... ROLLBACK;`** — `success=true`, `sms_message_id` non-null, balance decremented by 97, `error_message=NULL` (✅ atomic path works).

## Decisions implemented

D-01, D-02, D-04 (kept deduct_sms_balance), D-05, D-06, D-10.

## Next

- Plan 02 pre-flight unlocked (this summary + "migracion aplicada" marker present).
- The commit `d2cf2b3` is still local; push happens at Plan 02 Task 2 checkpoint so both Plan 01 + Plan 02 go to Vercel together (CLAUDE.md Regla 1).
