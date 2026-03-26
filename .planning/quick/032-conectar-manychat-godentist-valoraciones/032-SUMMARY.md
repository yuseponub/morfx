---
phase: quick-032
plan: 01
subsystem: webhooks
tags: [manychat, multi-workspace, godentist, facebook-messenger]
tech-stack:
  patterns: [multi-workspace-webhook, per-workspace-secret]
key-files:
  modified:
    - src/app/api/webhooks/manychat/route.ts
  created:
    - scripts/setup-godentist-manychat.sql
metrics:
  duration: ~10min
  completed: 2026-03-25
---

# Quick 032: Conectar ManyChat GoDentist Valoraciones Summary

Multi-workspace ManyChat webhook para que GoDentist Valoraciones reciba mensajes de Facebook Messenger sin romper Somnio.

## What Was Done

### Task 1: Multi-workspace webhook resolver + per-workspace secret (b7633d7)
- Refactored `resolveWorkspaceForManyChat` to accept `request` parameter and resolve workspace via 3-tier priority: query param `?workspace=UUID` > env var > DB fallback
- Extracted `validateSecret` as separate function that checks against global `MANYCHAT_WEBHOOK_SECRET` env var OR per-workspace `manychat_webhook_secret` in workspace settings
- Reordered POST handler: parse payload > validate fields > resolve workspace > validate secret > process (secret validation moved after workspace resolution since it needs workspace_id)
- Backward compatible: Somnio continues using env var without any changes

### Task 2: SQL + instrucciones de setup ManyChat (1932ad7)
- Created `scripts/setup-godentist-manychat.sql` with UPDATE query to add `manychat_api_key` and `manychat_webhook_secret` to GoDentist Valoraciones workspace settings
- Included step-by-step ManyChat Flow Builder setup instructions as SQL comments
- Secret placeholder `godentist-mc-secret-CAMBIAR` to be replaced before execution

## Deviations from Plan

None - plan executed exactly as written.

## Pending User Actions

1. **Generate a secure secret:** `openssl rand -hex 16`
2. **Update SQL script:** Replace `godentist-mc-secret-CAMBIAR` with the generated secret
3. **Execute SQL in Supabase:** Run `scripts/setup-godentist-manychat.sql`
4. **Configure ManyChat Flow:** Create External Request step with the webhook URL including workspace ID and secret
5. **Push to Vercel:** Deploy the code changes
6. **Test:** Send a message to GoDentist Facebook page and verify it arrives
