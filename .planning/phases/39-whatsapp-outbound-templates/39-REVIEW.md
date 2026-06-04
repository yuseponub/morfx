---
phase: 39-whatsapp-outbound-templates
reviewed: 2026-06-04T01:02:50Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/lib/meta/api.ts
  - src/lib/meta/media.ts
  - src/lib/meta/templates.ts
  - src/lib/meta/credentials.ts
  - src/lib/channels/meta-whatsapp-sender.ts
  - src/lib/domain/messages.ts
  - src/lib/domain/whatsapp-templates.ts
  - src/lib/domain/contact-reviews.ts
  - src/app/actions/messages.ts
  - src/app/actions/templates.ts
  - src/app/api/webhooks/meta/route.ts
  - src/lib/whatsapp/webhook-handler.ts
  - src/lib/automations/action-executor.ts
  - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-06-04T01:02:50Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 39 adds the Meta Cloud API outbound path alongside the existing 360dialog path. The architecture is sound: the single provider-decision sits correctly in the domain layer, credential resolution always flows from `ctx.workspaceId` (T-39-02), access tokens are not logged (T-39-01), HMAC gates the webhook before any processing (T-39-04), and the SSRF host-allowlist guard on inbound media is correct (T-39-07). The 360dialog code paths are byte-identical per Regla 6.

Two critical bugs were found:

1. `applyTemplateStatusUpdate` runs a cross-tenant `UPDATE` when `workspaceId` is `null` — a forged (or unrecognized) WABA id in a template-status webhook triggers a status update across **all** workspaces that share the same template name. The HMAC gate prevents arbitrary forged payloads, but a legitimate Meta payload from an unregistered WABA (e.g., a stale account record) can still hit the null path.

2. `sendPendingTemplate` in `contact-reviews.ts` still gates on `workspace.whatsapp_api_key` being non-null before calling `sendTemplateMessage`. For a `meta_direct` workspace that has never set a 360dialog key, this guard silently skips the entire send — no error is thrown, no row is updated, and the contact never receives the pending template.

Three warnings cover a Regla 3 violation in `editTemplate` (direct DB write bypassing domain), a missing `resolveByWabaId` mock that makes the test assert the wrong thing, and a dead `void syncTemplateStatusMeta` no-op that silently swallows the import.

---

## Critical Issues

### CR-01: Cross-tenant status update when workspaceId is null in `applyTemplateStatusUpdate`

**File:** `src/lib/domain/whatsapp-templates.ts:345-357`

**Issue:** `applyTemplateStatusUpdate` builds its `UPDATE whatsapp_templates SET status=? WHERE name=?` query and only appends `.eq('workspace_id', params.workspaceId)` when `params.workspaceId` is truthy. When `resolveByWabaId` returns `null` (unrecognized WABA) the caller sets `workspaceId: null`, and the domain function runs the update with no workspace scope. The result is that any template row in any workspace whose `name` (and optionally `language`) matches gets its status overwritten.

The HMAC gate (line 101 of `route.ts`) blocks unsigned payloads, so random internet callers cannot trigger this. However, a legitimate Meta delivery for a WABA that was deregistered from the platform (old test account, transferred account, stale row) passes HMAC verification and hits the null path. Because template names are not globally unique across tenants (e.g., `saludo`, `confirmacion_orden`), a REJECTED event from one WABA can flip status on every workspace that shares that name.

**Fix:**

```typescript
// src/lib/domain/whatsapp-templates.ts
export async function applyTemplateStatusUpdate(
  params: ApplyTemplateStatusUpdateParams
): Promise<DomainResult<{ updated: boolean }>> {
  // Hard-fail when workspace is unknown. The route handler should ack-and-drop
  // (200 to Meta) but this function must not run a cross-tenant UPDATE.
  if (!params.workspaceId) {
    console.warn('[wa-templates] applyTemplateStatusUpdate called with null workspaceId — aborting')
    return { success: true, data: { updated: false } }
  }

  const supabase = createAdminClient()
  // ... rest unchanged, but the .eq('workspace_id', ...) is now unconditional
  let query = supabase
    .from('whatsapp_templates')
    .update(updatePayload)
    .eq('workspace_id', params.workspaceId) // always applied
    .eq('name', params.name)
  if (params.language) {
    query = query.eq('language', params.language)
  }
  // ...
}
```

The route handler at `route.ts:156-176` already handles the case by logging a warning and calling `applyTemplateStatusUpdate` anyway — just change that call-site too to skip the domain call when `workspaceId` is null:

```typescript
// src/app/api/webhooks/meta/route.ts  (~line 158)
if (name && value.event) {
  if (!workspaceId) {
    console.warn('[meta-webhook] unknown WABA, skipping template-status update:', wabaId)
  } else {
    try {
      await applyTemplateStatusUpdate({ workspaceId, name, language: value.message_template_language, event: value.event, reason: value.reason ?? null })
    } catch (err) {
      console.error('[meta-webhook] template-status update failed:', err)
    }
  }
}
```

---

### CR-02: `sendPendingTemplate` silently skips send for `meta_direct` workspaces

**File:** `src/lib/domain/contact-reviews.ts:390-398`

**Issue:** The refactored `sendPendingTemplate` kept the original guard `if (!workspace?.whatsapp_api_key) throw new Error(...)`. A `meta_direct` workspace that was migrated without a legacy 360dialog key will have `whatsapp_api_key = null`, causing this guard to throw before `sendTemplateMessage` is reached. The function exits with an unhandled error (caught upstream in `sendPendingContactReview`) meaning the contact never receives the template and no success path is logged. The domain `sendTemplateMessage` already resolves credentials from `ctx.workspaceId` for `meta_direct` workspaces — the legacy key guard is now a dead block for those workspaces.

**Fix:**

```typescript
// src/lib/domain/contact-reviews.ts  (~line 388)
const { data: workspace } = await supabase
  .from('workspaces')
  .select('whatsapp_api_key, whatsapp_provider')
  .eq('id', workspaceId)
  .single()

// For meta_direct workspaces, credentials are resolved inside sendTemplateMessage
// from ctx.workspaceId — no legacy apiKey required.
const isMeta = workspace?.whatsapp_provider === 'meta_direct'
if (!isMeta && !workspace?.whatsapp_api_key) {
  throw new Error('Workspace has no WhatsApp API key')
}

// ... (continue to build components + call sendTemplateMessage)
// Pass apiKey as empty string (safe — domain ignores it for meta_direct)
await sendTemplateMessage(ctx, {
  ...
  apiKey: workspace?.whatsapp_api_key ?? '',
})
```

---

## Warnings

### WR-01: Regla 3 violation — `editTemplate` writes directly to `whatsapp_templates` without domain layer

**File:** `src/app/actions/templates.ts:531-535`

**Issue:** After the successful `editTemplateMeta` call, `editTemplate` writes `status: 'PENDING'` directly from the server action layer:

```typescript
await supabase
  .from('whatsapp_templates')
  .update({ status: 'PENDING', updated_at: new Date().toISOString() })
  .eq('id', params.id)
  .eq('workspace_id', workspaceId)
```

Regla 3 mandates that all mutations pass through `src/lib/domain/`. The domain already has `applyTemplateStatusUpdate` which performs exactly this update. Using the action layer for this write means the status transition bypasses any future domain-layer hooks (audit events, automation triggers on status change).

**Fix:** Replace the direct write with a domain call:

```typescript
// src/app/actions/templates.ts  (after the editTemplateMeta call succeeds)
await applyTemplateStatusUpdate({
  workspaceId,
  name: template.name,
  language: template.language,
  event: 'PENDING',
  reason: null,
})
```

Import `applyTemplateStatusUpdate` from `@/lib/domain/whatsapp-templates`. Remove the raw `supabase.from('whatsapp_templates').update(...)` block.

---

### WR-02: `resolveByWabaId` not mocked in `template-status.test.ts` — test asserts incorrect behavior

**File:** `src/app/api/webhooks/meta/__tests__/template-status.test.ts:35-37`

**Issue:** The credentials mock covers only `resolveByPhoneNumberId`:

```typescript
vi.mock('@/lib/meta/credentials', () => ({
  resolveByPhoneNumberId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
}))
```

`resolveByWabaId` is not in the mock factory, so it receives `undefined` when called. The route calls `resolveByWabaId(wabaId)` to resolve `workspaceId`, gets back `undefined`, and `workspaceId` stays `null`. The test then passes because the Supabase mock returns `{error: null}` unconditionally — but it asserts `templatesUpdate.toHaveBeenCalledTimes(1)` without verifying the `workspace_id` filter was actually applied. The test would still pass after the CR-01 fix (which makes the function a no-op when `workspaceId` is null), giving a false-green result.

**Fix:**

```typescript
vi.mock('@/lib/meta/credentials', () => ({
  resolveByPhoneNumberId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
  resolveByWabaId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
}))
```

Add a companion test for the unknown-WABA path that asserts `templatesUpdate` is NOT called (the ack-and-drop behavior added by CR-01).

---

### WR-03: `void syncTemplateStatusMeta` is a misleading dead-code no-op

**File:** `src/app/actions/templates.ts:385`

**Issue:**

```typescript
void syncTemplateStatusMeta
```

This evaluates the function reference and discards it — it is not a call. The comment says it "keeps the import live for single-row reconciliation callers," but no such call-site exists in this file. The pattern is confusing: a future reader might expect it to do something, and linters may flag it. The import of `syncTemplateStatusMeta` should either be used by a real call or removed.

**Fix:** Remove the `void syncTemplateStatusMeta` line and remove `syncTemplateStatusMeta` from the import if it is not used elsewhere in the file. If a future reconciliation call-site is planned, add a `// TODO(WA-08): call syncTemplateStatusMeta for per-row poll fallback` comment instead of the misleading void expression.

---

## Info

### IN-01: `sendTemplateMessage` performs two sequential DB queries per send for `meta_direct` workspaces

**File:** `src/lib/domain/messages.ts:380-398`

**Issue:** For every template send on a `meta_direct` workspace, the domain makes two separate DB round-trips: first `readWhatsappProvider` (SELECT from `workspaces`), then `resolveByWorkspace` (SELECT from `workspace_meta_accounts`). Both queries are for the same workspace and could be combined into a single JOIN or a single cached lookup per request. This is not a correctness issue, but at scale it doubles the credential-lookup cost per send.

**Suggestion:** Merge the provider read and credential resolve into a single helper that returns `{ provider, creds }` in one query, or cache the provider value (already read inside `readWhatsappProvider`) and pass it through to avoid the second lookup.

---

### IN-02: `TemplateStatus` type does not include `FLAGGED`

**File:** `src/lib/whatsapp/types.ts:587` and `src/lib/domain/whatsapp-templates.ts:330-332`

**Issue:** `TemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'`. The new `applyTemplateStatusUpdate` domain function handles `FLAGGED` as a negative event (line 332) and maps it to `rejected_reason`. However the type union does not include `FLAGGED`, so if Meta sends a `FLAGGED` event, the status stored in DB would be the string `'FLAGGED'` which TypeScript types would not recognize. This is a minor type-consistency gap; functionally the DB column likely accepts any string.

**Suggestion:** Add `'FLAGGED'` to the `TemplateStatus` union:

```typescript
export type TemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'FLAGGED'
```

---

### IN-03: Edit button shown for PAUSED/REJECTED in `template-list.tsx` on 360dialog workspaces — misleading UX

**File:** `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx:147-160`

**Issue:** `EDITABLE_STATUSES` gates the Edit button for `APPROVED`, `REJECTED`, and `PAUSED`. The button is shown without checking whether the workspace is `meta_direct`. For a 360dialog workspace, clicking Edit on an APPROVED/REJECTED/PAUSED template opens the dialog, the user edits the body, submits, and receives `"Este template no se puede editar directamente en 360dialog. Duplica y recrea el template."`. The D-05 contract is enforced, but the Edit button should not be offered in the first place for 360dialog workspaces.

**Suggestion:** Pass the workspace's `whatsapp_provider` value down to `TemplateList` and suppress the Edit button (show the Duplicate button instead) when `provider !== 'meta_direct'`, regardless of status.

---

_Reviewed: 2026-06-04T01:02:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
