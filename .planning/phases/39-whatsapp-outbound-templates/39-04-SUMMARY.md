---
phase: 39-whatsapp-outbound-templates
plan: 04
subsystem: whatsapp-outbound-meta
tags: [green, chokepoint, provider-branch, regla-3, regla-6, 131047-fix, mig-03]
requires:
  - "Plan 02 (39-02) — metaWhatsappSender { accessToken, phoneNumberId } sender"
  - "Plan 03 (39-03) — createTemplateMeta(creds) + uploadHeaderHandleMeta"
  - "Plan 01 (39-01) — messages-provider.test.ts RED contract + Regla 6 parity"
provides:
  - "The single provider-decision chokepoint in the domain layer (MIG-03 / D-02 — the 131047 root-cause fix)"
  - "domain/messages.ts: whatsapp_provider branch in sendTextMessage/sendMediaMessage/sendTemplateMessage"
  - "domain/whatsapp-templates.ts: whatsapp_provider branch at template create (submit + header handle)"
affects:
  - src/lib/domain/messages.ts
  - src/lib/domain/whatsapp-templates.ts
tech-stack:
  added: []   # zero new deps, zero migrations (MIG-01: whatsapp_provider already in prod)
  patterns:
    - "Single provider decision in the domain layer (Regla 3) — never scattered per call-site (Anti-Pattern #1, the 131047 cause)"
    - "Additive meta_direct branch above the byte-identical 360dialog arm (Regla 6)"
    - "Creds resolve from ctx.workspaceId via resolveByWorkspace, NEVER from params/input (T-39-02)"
    - "readWhatsappProvider() helper centralizes the workspaces.whatsapp_provider read for the three send fns"
key-files:
  created: []
  modified:
    - src/lib/domain/messages.ts
    - src/lib/domain/whatsapp-templates.ts
decisions:
  - "Extracted readWhatsappProvider(supabase, workspaceId) helper in messages.ts so the three send fns share one decision read; default/null → '360dialog' (Regla 6 default-safe)."
  - "Template create resolves Meta creds once at Step 0 and requires accessToken + wabaId (createTemplateMeta needs wabaId); missing → 'Credenciales Meta no configuradas' before any DB write."
  - "Header-handle branch: meta_direct downloads bytes from the whatsapp-media bucket and runs uploadHeaderHandleMeta (Meta wants the resumable handle); 360dialog keeps the public Supabase URL byte-identical."
  - "[Rule 1] The post-error user-facing string was hardcoded '360 Dialog rechazo el template'; made it provider-aware (Meta vs 360 Dialog) so a meta_direct rejection is not mislabeled. The REJECTED status + rejected_reason audit write is unchanged (provider-agnostic)."
metrics:
  duration_minutes: 20
  tasks_completed: 2
  files_modified: 2
  tests_total: 14
  tests_green: 14
  completed: 2026-06-03
---

# Phase 39 Plan 04: Domain Provider Chokepoint (the 131047 fix) Summary

Wired the single provider-decision chokepoint in the domain layer (MIG-03 / D-02). The three send functions in `domain/messages.ts` and the `createTemplate` orchestration in `domain/whatsapp-templates.ts` now read `workspaces.whatsapp_provider` once and branch: `meta_direct` routes through `metaWhatsappSender` / `createTemplateMeta` with creds resolved from `ctx.workspaceId`; `360dialog` (the default — Somnio + all current prod clients) stays byte-identical (Regla 6). This is the literal root-cause fix for the Phase 38 131047 (per-call-site fallback to the global `WHATSAPP_API_KEY`). `messages-provider.test.ts` is now fully GREEN, including the Regla 6 parity assertions.

## What Was Built

### Task 1 — `domain/messages.ts` provider branch (commit `d547b525`)
- Added a `readWhatsappProvider(supabase, workspaceId)` helper — a single `.select('whatsapp_provider').eq('id', workspaceId).single()` that returns `'meta_direct'` or `'360dialog'` (default/null → `'360dialog'`, Regla 6 default-safe). MIG-01: the column already exists in prod (Phase 38) — this only READS it; no migration.
- `sendTextMessage`, `sendMediaMessage`, `sendTemplateMessage`: each now branches on the resolved provider.
  - **meta_direct arm:** `resolveByWorkspace(ctx.workspaceId, 'whatsapp')` (creds from workspaceId, never input — T-39-02); if no `accessToken`/`phoneNumberId` → `{ success: false, error: 'Credenciales Meta no configuradas' }`; else calls the matching `metaWhatsappSender.sendText/sendMedia/sendTemplate` and sets `wamid = resp.externalMessageId`.
  - **360dialog arm:** the existing `send360Text/Media/Template(params.apiKey, …)` calls — byte-identical args (only the surrounding branch wrapper / indentation differs in the diff).
  - **FB/IG arm:** `getChannelSender` path UNCHANGED.
- The DB insert + conversation-update tail of each function is provider-agnostic and reused verbatim.

### Task 2 — `domain/whatsapp-templates.ts` provider branch (commit `145ab00c`)
- Step 0 reads `workspaces.whatsapp_provider`; `meta_direct` resolves Meta creds once (requires `accessToken` + `wabaId` — `createTemplateMeta` needs the WABA id), failing fast with `'Credenciales Meta no configuradas'` before any DB write.
- **Header-handle step branches:**
  - `meta_direct`: downloads the header bytes from the `whatsapp-media` bucket (`supabase.storage.download`) and runs `uploadHeaderHandleMeta(accessToken, META_APP_ID, bytes, mime)` to obtain Meta's resumable upload handle `"h"`, which is patched into `components[HEADER].example.header_handle[0]`.
  - `360dialog`: keeps the public Supabase URL in `header_handle` — byte-identical (the 360dialog v2 nuance).
- **Submit step branches:** `createTemplateMeta(metaCreds, { name, language, category, components })` for `meta_direct`; `createTemplate360(params.apiKey, …)` (unchanged args) for `360dialog`.
- The uniqueness check, local INSERT `status='PENDING'`, `submitted_at` update, and the REJECTED-on-error audit write are all provider-agnostic and reused verbatim. The user-facing rejection string is now provider-aware (`Meta` vs `360 Dialog`) — a Rule 1 correctness fix so a `meta_direct` rejection is not mislabeled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Provider-mislabeled rejection error string**
- **Found during:** Task 2.
- **Issue:** The post-submit catch returned a hardcoded `360 Dialog rechazo el template: …` even on the new `meta_direct` path, which would mislabel a Meta rejection to operators.
- **Fix:** Compute `const rejector = provider === 'meta_direct' ? 'Meta' : '360 Dialog'` and interpolate it. The REJECTED status + `rejected_reason` DB write (the audit trail) is untouched.
- **Files modified:** `src/lib/domain/whatsapp-templates.ts`.
- **Commit:** `145ab00c`.

No other deviations — the chokepoint shape, the meta_direct/360dialog branch arms, and the Regla 6 byte-identical default arm follow 39-PATTERNS.md "THE CHOKEPOINT" / "MODIFY whatsapp-templates.ts" exactly. No migration added (MIG-01 column already in prod).

## Authentication Gates

None. No live credentials, no external services — the provider read, credential resolution, and Meta sender are all mocked in `messages-provider.test.ts`. T-39-01 honored: the resolved access token only ever flows to `metaWhatsappSender` / `uploadHeaderHandleMeta`, never logged, never returned to the client.

## Verification

```
pnpm exec vitest run src/lib/domain/__tests__/messages-provider.test.ts
→ 1 file, 5 tests: 5 passed (incl. 2 Regla 6 parity guards + 3 meta_direct routing)

pnpm exec vitest run src/lib/meta/__tests__/templates.test.ts
→ 1 file, 9 tests: 9 passed

pnpm exec tsc --noEmit  → 0 errors mentioning domain/messages or whatsapp-templates
```

- `grep -n "whatsapp_provider"` shows the read in both `domain/messages.ts` (helper + 3 call-sites) and `domain/whatsapp-templates.ts` (Step 0).
- `git diff 68ce9abd HEAD` on the 360dialog arms: only the surrounding branch wrapper + indentation added; `send360Text/Media/Template(params.apiKey, …)` and `createTemplate360(params.apiKey, …)` call args are unchanged (Regla 6).

### Full-suite regression check (no regressions introduced)

```
pnpm exec vitest run  (whole repo)
→ 133 files: 113 passed | 8 failed | 12 skipped
   1205 tests: 1141 passed | 6 failed | 42 skipped
```

The 8 failing files / 6 failing tests are **pre-existing and unrelated** to this plan:
- Zero references to `domain/messages`, `domain/whatsapp-templates`, `whatsapp_provider`, `metaWhatsappSender`, or `resolveByWorkspace` anywhere in the failure output.
- The visible failure (`somnio-v4/sub-loop/__tests__/few-shots.test.ts` — a RAG generation-prompt wording assertion) belongs to the in-flight `somnio-v4-rag-generative` standalone.
- **Proof of pre-existence:** checking out the pre-plan (`68ce9abd`) versions of `messages.ts` + `whatsapp-templates.ts` and re-running `few-shots.test.ts` reproduces the identical `1 failed | 18 passed` result. My two files do not affect it.

## Threat Flags

None. The threat surface introduced (the meta_direct send/template branch) is exactly the plan's `<threat_model>` register: T-39-02 (creds from `ctx.workspaceId` via `resolveByWorkspace`, never params — the 131047 fix), T-39-01 (token never logged), T-39-09 (360dialog arm byte-identical → Somnio + 4 prod workspaces untouched, asserted GREEN by the parity test).

## TDD Gate Compliance

This plan (`type: execute`, marked `tdd="true"` per task) is the GREEN half of the Wave-0 RED scaffold. The RED gate (`test(39-01)` commit `cb5d0ad0`) pinned `messages-provider.test.ts` — the 3 `meta_direct` tests were RED, the 2 `360dialog` parity tests GREEN. This plan's two `feat(39-04)` commits (`d547b525`, `145ab00c`) are the GREEN gate that turns all 5 GREEN while keeping the parity tests GREEN. No REFACTOR commit needed.

## Self-Check: PASSED

Modified files (all FOUND):
- `src/lib/domain/messages.ts`
- `src/lib/domain/whatsapp-templates.ts`

Commits (all FOUND in git log):
- `d547b525` feat(39-04): provider branch in domain/messages.ts send chokepoint (MIG-03)
- `145ab00c` feat(39-04): provider branch in domain/whatsapp-templates.ts create (MIG-03)
