---
phase: 39-whatsapp-outbound-templates
fixed_at: 2026-06-04T01:15:39Z
review_path: .planning/phases/39-whatsapp-outbound-templates/39-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-06-04T01:15:39Z
**Source review:** .planning/phases/39-whatsapp-outbound-templates/39-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, IN-03)
- Fixed: 6
- Skipped: 0
- Deferred (out of scope): IN-01, IN-02

## Fixed Issues

### CR-01: Cross-tenant status update when workspaceId is null

**Files modified:** `src/lib/domain/whatsapp-templates.ts`, `src/app/api/webhooks/meta/route.ts`
**Commit:** 11bb2058
**Applied fix:** `applyTemplateStatusUpdate` now hard-aborts (returns a `{ updated: false }` no-op + warning) when `params.workspaceId` is null/missing, before any DB call. The `.eq('workspace_id', params.workspaceId)` filter is now unconditional (workspaceId is guaranteed truthy past the guard). The Meta webhook route ack-and-drops (logs + returns 200) without invoking the domain when the WABA does not resolve to a workspace. Verified: the UPDATE can never run without a tenant scope.

### CR-02: sendPendingTemplate silently skips meta_direct workspaces

**Files modified:** `src/lib/domain/contact-reviews.ts`
**Commit:** c3a4f4cf
**Applied fix:** The workspace read now also selects `whatsapp_provider`. The `if (!workspace?.whatsapp_api_key) throw` guard is provider-aware: it only fires for non-`meta_direct` workspaces. For `meta_direct`, the send proceeds and `sendTemplateMessage` resolves Meta creds via `ctx.workspaceId`; `apiKey` is passed as `?? ''` (ignored by the meta path). Regla 6: 360dialog behavior is byte-identical (real apiKey still required and forwarded).

### WR-01: Regla 3 violation — editTemplate direct DB write

**Files modified:** `src/app/actions/templates.ts`
**Commit:** 249d2638
**Applied fix:** Replaced the direct `supabase.from('whatsapp_templates').update({ status: 'PENDING' })` write with a domain call `applyTemplateStatusUpdate({ workspaceId, name: template.name, language: template.language, event: 'PENDING', reason: null })`. Imported `applyTemplateStatusUpdate` from `@/lib/domain/whatsapp-templates`. workspace_id scope is applied inside the domain function. No action-layer direct table write for status remains.

### WR-02: test gap for CR-01 (resolveByWabaId not mocked)

**Files modified:** `src/app/api/webhooks/meta/__tests__/template-status.test.ts`, `src/app/actions/__tests__/templates-provider.test.ts`
**Commit:** be3e25aa
**Applied fix:** Added `resolveByWabaId` to the credentials mock (returns `{ workspaceId: 'WS_1' }`) so the happy-path APPROVED/REJECTED cases exercise the real workspace-scoped UPDATE. The Supabase admin mock is now a chainable thenable so the full `.update().eq('workspace_id').eq('name').eq('language')` chain resolves; both happy-path cases assert `templatesEq` was called with `('workspace_id', 'WS_1')`. Added a new case for the unknown-WABA path (`resolveByWabaId` → `null`) asserting `templatesUpdate` is NOT called (CR-01 ack-and-drop), keeping the HMAC forged/unsigned cases green. Also exposed `applyTemplateStatusUpdate` in the `templates-provider.test.ts` domain mock (now used by editTemplate via WR-01).

### WR-03: dead void no-op

**Files modified:** `src/app/actions/templates.ts`
**Commit:** 249d2638 (committed together with WR-01 — same file, overlapping import edits)
**Applied fix:** Removed the `void syncTemplateStatusMeta` line and the accompanying misleading comment. Removed `syncTemplateStatusMeta` from the `@/lib/meta/templates` import (it was not used elsewhere in the file). Remaining meta imports (`listTemplatesMeta`, `deleteTemplateMeta`, `editTemplateMeta`) confirmed still used. tsc clean.

### IN-03: Edit button shown for 360dialog workspaces (UX)

**Files modified:** `src/app/actions/templates.ts` (action), `src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx`, `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx`
**Commit:** 249d2638 (server action `getWorkspaceWhatsappProvider`), 0792417d (page + list UI)
**Applied fix:** Added a `getWorkspaceWhatsappProvider` server action (reuses `readTemplateProviderConfig`, defaults to `'360dialog'`). The page resolves the provider and passes it to `TemplateList`. `TemplateList` now takes an optional `provider` prop; the Edit button only renders when `provider === 'meta_direct'` AND the status is editable — otherwise the Duplicate button shows, regardless of status. 360dialog workspaces no longer see an Edit button that would always fail with the D-05 error.

## Deferred Issues (out of scope)

### IN-01: double DB query per meta_direct send
**File:** `src/lib/domain/messages.ts:380-398`
**Reason:** Deferred per fix instructions (non-trivial perf optimization, not a correctness issue). Merging `readWhatsappProvider` + `resolveByWorkspace` into one query is a follow-up.

### IN-02: TemplateStatus union missing FLAGGED
**File:** `src/lib/whatsapp/types.ts` + `src/lib/domain/whatsapp-templates.ts`
**Reason:** Deferred per fix instructions. Minor type-consistency gap; DB column accepts any string and functional behavior is correct.

## Verification

- `pnpm exec tsc --noEmit`: no errors in any changed source file. The only errors reported are pre-existing in `src/lib/domain/__tests__/conversations.test.ts` (untouched, implicit-any in a test mock).
- `pnpm exec vitest run` on affected suites:
  - `template-status.test.ts` — 5/5 pass (incl. new CR-01 ack-and-drop + workspace_id scope assertions)
  - `templates-provider.test.ts` — 8/8 pass
  - `messages-provider.test.ts` — 5/5 pass
  - `meta/__tests__/templates.test.ts` — 9/9 pass
  - `agent-templates.test.ts` — 8/8 pass
- Regla 6: 360dialog path unaffected (provider-aware guards leave the non-meta arm byte-identical; webhook route only changed the template-status branch).
- No contact-reviews test file exists; CR-02 verified via Tier-1 (re-read) + Tier-2 (tsc).
- gsd-sdk CLI is not installed — commits made with plain `git commit` (conventional `fix(39): ...` format). Only the 8 changed files were staged (no `git add -A`).

---

_Fixed: 2026-06-04T01:15:39Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
