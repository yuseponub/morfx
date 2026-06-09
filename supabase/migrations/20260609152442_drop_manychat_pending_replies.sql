-- Decommission ManyChat (standalone godentist-fbig-meta-direct-cutover, Plan 06).
-- The only reader (src/app/api/manychat/dynamic-reply/route.ts) was deleted in Plan 05.
-- RESEARCH A2: no remaining reader/writer in the codebase
-- (grep -rln "manychat_pending_replies" src/ == 0 at 2026-06-09).
-- Original CREATE: supabase/migrations/20260327150000_manychat_pending_replies.sql (left intact for history).
DROP TABLE IF EXISTS manychat_pending_replies;
