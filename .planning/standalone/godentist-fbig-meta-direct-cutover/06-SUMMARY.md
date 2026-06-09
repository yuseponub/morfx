# Plan 06 — SUMMARY: DB decommission (drop orphaned table + enum decision)

**Status:** ✅ COMPLETE
**Completed:** 2026-06-09
**Type:** checkpoint / human-action (autonomous: false, Regla 5)

## Self-Check: PASSED

## Task 1 — DROP manychat_pending_replies (mandatory) — DONE

- Pre-check: `grep -rln "manychat_pending_replies" src/` → **0** (the sole reader, the dynamic-reply route, was deleted in Plan 05; RESEARCH A2 confirms no writer).
- Migration created: `supabase/migrations/20260609152442_drop_manychat_pending_replies.sql` (`DROP TABLE IF EXISTS manychat_pending_replies;`). The original CREATE migration (`20260327150000_manychat_pending_replies.sql`) was left intact for history (not edited).
- Regla 5: operator applied the DROP in prod and confirmed `SELECT to_regclass('public.manychat_pending_replies')` → **NULL** (table gone) BEFORE the migration file was committed.

## Task 2 — OPTIONAL enum/CHECK drop (OQ-7) — DEFERRED (user decision)

The user selected **`defer`** (research-recommended default). The `'manychat'` value remains an allowed-but-unused value in the CHECK constraints on `workspaces.messenger_provider` / `instagram_provider`. This is cosmetic only — no workspace is on `manychat` (Plan 04 verified COUNT=0), so the value is dead. WhatsApp's `whatsapp_provider` CHECK was never in scope.

### Un-defer SQL (for later, if ever wanted)

Verify constraint names first:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid='workspaces'::regclass AND conname LIKE '%provider%';
```
Precondition: `SELECT COUNT(*) FROM workspaces WHERE messenger_provider='manychat' OR instagram_provider='manychat'` = 0 (else ADD CONSTRAINT fails validation). Then:
```sql
ALTER TABLE workspaces DROP CONSTRAINT workspaces_messenger_provider_check;
ALTER TABLE workspaces ADD  CONSTRAINT workspaces_messenger_provider_check
  CHECK (messenger_provider IN ('meta_direct'));
ALTER TABLE workspaces ALTER COLUMN messenger_provider SET DEFAULT 'meta_direct';

ALTER TABLE workspaces DROP CONSTRAINT workspaces_instagram_provider_check;
ALTER TABLE workspaces ADD  CONSTRAINT workspaces_instagram_provider_check
  CHECK (instagram_provider IN ('meta_direct'));
ALTER TABLE workspaces ALTER COLUMN instagram_provider SET DEFAULT 'meta_direct';
-- whatsapp_provider CHECK UNTOUCHED (Regla 6).
```

## Verification

- `to_regclass('public.manychat_pending_replies')` → NULL ✅
- `grep -rln "manychat_pending_replies" src/` → 0 ✅
- WhatsApp schema untouched ✅
- Enum drop decision recorded (deferred, with un-defer SQL) ✅
