# Phase 38 Deferred Items

## Plan 03 — dedicated Meta-retry dedup unit test (deferred)
- Plan 03 Task 3 offered to add ONE test exercising processWebhook twice with the same wamid asserting a single messages row.
- Not added: processWebhook hits Supabase (real DB) — a meaningful dedup test cannot run in vitest without a live DB, and the plan forbids modifying webhook-handler.ts to make it testable. The wamid dedup is the DB constraint messages_wamid_unique (Phase 38 D-10).
- Covered instead by the human-verify smoke criterion 4 (live SELECT count(*) FROM messages WHERE wamid='<wamid>' returns 1).
