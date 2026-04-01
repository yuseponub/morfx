---
phase: 37-meta-app-setup-foundation
plan: 02
subsystem: meta-api-client
tags: [meta, graph-api, aes-256-gcm, encryption, credentials]

dependency_graph:
  requires: ["37-01"]
  provides: ["meta-graph-api-client", "token-encryption", "credential-resolution"]
  affects: ["38-embedded-signup", "39-whatsapp-outbound", "40-facebook-messenger", "41-instagram-direct"]

tech_stack:
  added: []
  patterns: ["aes-256-gcm-token-encryption", "version-pinned-api-client", "credential-resolution-by-identifier"]

files:
  created:
    - src/lib/meta/constants.ts
    - src/lib/meta/types.ts
    - src/lib/meta/token.ts
    - src/lib/meta/api.ts
    - src/lib/meta/credentials.ts
  modified: []

decisions:
  - id: "37-02-D1"
    decision: "Pack encrypted token as base64(iv + authTag + ciphertext) in single TEXT column"
    rationale: "Simple storage, no need for separate IV column. Standard pattern for AES-GCM."
  - id: "37-02-D2"
    decision: "Explicit select() in credential queries instead of select('*')"
    rationale: "Only fetch needed columns. Avoids leaking unnecessary data."
  - id: "37-02-D3"
    decision: "Helper rowToCredentials() for snake_case to camelCase mapping"
    rationale: "Single place to map DB row to TypeScript interface. DRY across 4 resolve functions."

metrics:
  duration: "~5 minutes"
  completed: "2026-04-01"
---

# Phase 37 Plan 02: Meta API Client Module Summary

**One-liner:** Typed Graph API v22.0 client with AES-256-GCM token encryption and credential resolution from workspace_meta_accounts

## What Was Done

### Task 1: Constants, Types, Token Encryption (3 files)

- **constants.ts**: `META_GRAPH_API_VERSION='v22.0'` and `META_BASE_URL` — zero imports, prevents circular deps
- **types.ts**: `MetaGraphApiError` class with `isAuthError`, `isRateLimitError`, `isPermissionError` getters. `MetaCredentials` interface and `MetaChannel` type
- **token.ts**: AES-256-GCM `encryptToken`/`decryptToken` with random IV per call. Key validation enforces exactly 32 bytes from base64

### Task 2: Graph API Client + Credential Resolution (2 files)

- **api.ts**: `metaRequest<T>` generic typed client. Convenience methods: `sendWhatsAppText`, `sendWhatsAppTemplate`, `verifyToken`. Throws `MetaGraphApiError` on non-ok responses with parsed error codes
- **credentials.ts**: 4 resolve functions using `createAdminClient()` (bypass RLS):
  - `resolveByPhoneNumberId` — inbound WhatsApp webhook routing
  - `resolveByPageId` — inbound Messenger webhook routing
  - `resolveByIgAccountId` — inbound Instagram DM routing
  - `resolveByWorkspace` — outbound sends by workspace + channel

### Task 3: Encryption Verification

All 4 test vectors passed:
1. Round-trip with fake token
2. Round-trip with empty string
3. Two encryptions produce different ciphertexts (random IV confirmed)
4. Tampered ciphertext rejected (auth tag verification)

Full module compiles with zero TypeScript errors.

## Commits

| Commit | Description |
|--------|-------------|
| `d0dd0d4` | feat(37-02): create meta module foundation (constants, types, token encryption) |
| `b8a316b` | feat(37-02): add Graph API client and credential resolution |

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **Pack format base64(iv+authTag+ciphertext)**: Single TEXT column storage. Standard AES-GCM pattern. No separate IV column needed.
2. **Explicit select() in credential queries**: Only fetch the 8 columns needed for MetaCredentials mapping. Avoids `select('*')`.
3. **rowToCredentials() helper**: Centralizes snake_case to camelCase mapping. All 4 resolve functions use it.

## Next Phase Readiness

The `src/lib/meta/` module is complete and ready for Phase 38 (Embedded Signup + WhatsApp Inbound). Phase 38 will:
- Import `metaRequest` for token exchange during Embedded Signup
- Import credential resolve functions for webhook routing
- Import `encryptToken` to store new tokens after signup flow

**No blockers.** All 5 files compile. Zero new npm dependencies.
