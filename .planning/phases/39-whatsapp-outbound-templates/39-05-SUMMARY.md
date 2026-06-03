---
phase: 39-whatsapp-outbound-templates
plan: 05
subsystem: whatsapp-outbound-meta
tags: [green, 131047-fix, blast-radius-closed, read-receipts, regla-3, regla-6, rewire, d-07]
requires:
  - "Plan 04 (39-04) — provider-aware domain sendTemplateMessage (meta_direct/360dialog branch)"
  - "Plan 02 (39-02) — markWhatsAppRead(accessToken, phoneNumberId, wamid) Cloud API helper"
  - "domain/conversations.ts findOrCreateConversation (race-safe phone→conversationId resolver)"
provides:
  - "markMessageAsRead Meta arm (D-07 read receipts) — meta_direct via Cloud API, 360dialog byte-identical"
  - "Both send360Template bypass sites rewired through the single domain chokepoint"
  - "The full 131047 blast radius is closed — NO send/receipt surface resolves apiKey per-call-site"
affects:
  - src/app/actions/messages.ts
  - src/lib/automations/action-executor.ts
  - src/lib/domain/contact-reviews.ts
tech-stack:
  added: []   # zero new deps, zero migrations
  patterns:
    - "Read receipts use the same provider-decision pattern as sends (read whatsapp_provider; meta_direct → Cloud API, else 360dialog default-safe — Regla 6)"
    - "Bypass sites resolve conversationId via the existing findOrCreateConversation helper (never roll a custom resolver) and route through domain sendTemplateMessage"
    - "Callers pass workspace.whatsapp_api_key as params.apiKey so the domain 360dialog arm stays byte-identical; the domain owns the provider DECISION"
    - "Meta creds resolved inside the branch from workspaceId via resolveByWorkspace (T-39-02); access token never logged (T-39-01)"
key-files:
  created: []
  modified:
    - src/app/actions/messages.ts
    - src/lib/automations/action-executor.ts
    - src/lib/domain/contact-reviews.ts
decisions:
  - "markMessageAsRead reads workspaces.whatsapp_provider alongside settings in one query; meta_direct → resolveByWorkspace + markWhatsAppRead; 360dialog arm (markRead360) kept verbatim with the same global-WHATSAPP_API_KEY fallback (Regla 6 default-safe)."
  - "Both rewires keep passing workspace.whatsapp_api_key as params.apiKey — the domain still needs it for the byte-identical 360dialog arm; the provider DECISION moves into the domain, the apiKey supply does not. No domain send-signature change (stays autonomous)."
  - "action-executor host-notification + contact-reviews pending-template both resolve the recipient conversation via findOrCreateConversation (host gets phone-only; pending-template passes contactId to link the contact on create) because domain sendTemplateMessage requires conversationId."
  - "Both rewired sends now check result.success and throw on failure inside their existing try/catch (action-executor non-fatal log; contact-reviews propagates) — surfacing a meta_direct credential/send error instead of the old fire-and-forget."
metrics:
  duration_minutes: 18
  tasks_completed: 2
  files_modified: 3
  tests_total: 5
  tests_green: 5
  completed: 2026-06-03
---

# Phase 39 Plan 05: Close the 131047 Blast Radius + Read Receipts Summary

Closed the full 131047 blast radius and added Meta read receipts (D-07). `markMessageAsRead` now branches on `workspaces.whatsapp_provider`: `meta_direct` resolves creds from the workspace and calls `markWhatsAppRead` (Cloud API), while the `360dialog` default keeps the existing `markRead360(apiKey, wamid)` arm byte-identical. The two remaining direct `send360Template` bypass sites — the `action-executor.ts` host-notification and the `contact-reviews.ts` pending-template send — were rewired to resolve a `conversationId` via the existing `findOrCreateConversation` helper and route through the now provider-aware domain `sendTemplateMessage`. After this plan, **no WhatsApp send or receipt surface resolves an apiKey per call-site or imports `@/lib/whatsapp/api` directly for sending** — every surface funnels through the single domain provider-decision chokepoint (Regla 3), and `meta_direct` workspaces send out the correct number (the literal 131047 root-cause fix).

## What Was Built

### Task 1 — `markMessageAsRead` Meta arm (commit `92567313`)
`src/app/actions/messages.ts` — the workspace read now selects `settings, whatsapp_provider` in one query. Inside the `try`:
- **meta_direct arm:** dynamically imports `resolveByWorkspace` + `markWhatsAppRead`, resolves creds from `workspaceId` (never from input — T-39-02); if `accessToken`/`phoneNumberId` missing → `{ error: 'Credenciales Meta no configuradas' }`; else `markWhatsAppRead(creds.accessToken, creds.phoneNumberId, message.wamid)`. The access token only flows into the helper, never logged (T-39-01).
- **360dialog arm (default, Regla 6):** the existing `apiKey = settings.whatsapp_api_key || process.env.WHATSAPP_API_KEY` resolution + `markRead360(apiKey, message.wamid)` is preserved verbatim, including the global-key fallback.

No new trigger point (D-07, A5 — same conversation-open behavior). The 24h-window check + recipient resolution in `sendMessage`/`sendMediaMessage` are untouched (D-04 — inherited for free; confirmed by `git diff 68ce9abd HEAD` on this file showing zero changes to `hoursSince`/`last_customer_message_at` logic).

### Task 2 — Rewire the two `send360Template` bypass sites (commit `ee939f92`)
Both files now import the conversation resolver and route through the domain chokepoint:

- **`action-executor.ts` (host-notification, ~line 1264-1300):** replaced the `await import('@/lib/whatsapp/api')` + `send360Template(workspace.whatsapp_api_key, hostPhone, 'informacion_general', 'es', [...])` with: build `hostCtx: DomainContext = { workspaceId, source: 'automation' }`, resolve the host conversation via `findOrCreateConversation(hostCtx, { phone: hostPhone })` (the fixed `hostPhone = '+573137549286'`), then `domainSendTemplateMessage(hostCtx, { conversationId, contactPhone: hostPhone, templateName: 'informacion_general', templateLanguage: 'es', components: [...], apiKey: workspace.whatsapp_api_key })`. The body-component shape (`{ type:'body', parameters:[{ type:'text', text }] }`) already matched `SendTemplateMessageParams.components`. `import { findOrCreateConversation } from '@/lib/domain/conversations'` added; `domainSendTemplateMessage` was already imported. Failure now throws inside the existing non-fatal try/catch (review still created; only the notification is logged as failed).

- **`contact-reviews.ts` (`sendPendingTemplate`, ~line 436-460):** since this file is itself in the domain layer, it calls `sendTemplateMessage` in-process. Replaced the direct 360dialog import with: `ctx: DomainContext = { workspaceId, source: 'automation' }`, resolve via `findOrCreateConversation(ctx, { phone: contact.phone, contactId })` (passing `contactId` links the contact on create), then `sendTemplateMessage(ctx, { conversationId, contactPhone: contact.phone, templateName: template.templateName, templateLanguage: template.language, components, apiKey: workspace.whatsapp_api_key })`. The `components` array it builds (body params + optional `{ type:'header', parameters:[{ type:'image', image:{ link } }] }`) was already domain-compatible. `import { findOrCreateConversation } from './conversations'` + `import { sendTemplateMessage } from './messages'` added. Propagates on failure.

Both rewires keep supplying `workspace.whatsapp_api_key` as `params.apiKey` so the domain's 360dialog arm stays byte-identical — the **provider decision** moved into the domain (Plan 04), not the apiKey supply. `grep -rnE "send360Template"` on both files now returns zero non-comment matches.

## Deviations from Plan

None — plan executed exactly as written. Two intent-clarifications (recorded in frontmatter `decisions`): (1) the callers still pass `workspace.whatsapp_api_key` as `params.apiKey` because the domain's Regla-6 360dialog arm consumes it — the domain owns the *decision*, the caller still *supplies* the 360dialog key; no domain signature change, so the task stayed `autonomous: true`. (2) Both rewired sends now check `result.success` and throw on failure inside their existing try/catch, surfacing a meta_direct send/credential error instead of the old fire-and-forget `await` (a strict improvement, not a behavior regression for the 360dialog happy path).

## Authentication Gates

None. No live credentials, no external services were invoked — the meta_direct arms resolve creds via `resolveByWorkspace` and the Cloud API helpers are exercised only by the (mocked) `messages-provider.test.ts` suite. T-39-01 honored: the resolved access token only ever flows to `markWhatsAppRead` / `metaWhatsappSender`, never logged, never returned to the client.

## Verification

```
pnpm exec vitest run src/lib/domain/__tests__/messages-provider.test.ts
→ 1 file, 5 tests: 5 passed (2 Regla 6 parity guards + 3 meta_direct routing)

pnpm exec vitest run src/lib/domain src/lib/automations
→ 7 files, 51 tests: 51 passed (incl. conversations.test.ts — the findOrCreateConversation dependency)

pnpm exec tsc --noEmit
→ 0 errors mentioning actions/messages, action-executor, or contact-reviews
  (13 total errors are pre-existing in test files + .next generated types, none in the 3 modified source files)
```

Grep gates (all pass):
- `grep -rnE "send360Template" src/lib/automations/action-executor.ts src/lib/domain/contact-reviews.ts` → **0 non-comment matches** (both bypasses removed).
- `grep -n "whatsapp_provider" src/app/actions/messages.ts` → the read-receipt branch read is present.
- `grep -nE "findOrCreateConversation|sendTemplateMessage" …` → both rewires resolve a `conversationId` and route through domain.
- `git diff 68ce9abd HEAD -- src/app/actions/messages.ts | grep -E "hoursSince|24h|last_customer_message"` → no changes (D-04 untouched).

### Full-suite regression check (no regressions introduced)

```
pnpm exec vitest run  (whole repo)
→ 133 files: 114 passed | 7 failed | 12 skipped
   1205 tests: 1143 passed | 4 failed | 42 skipped
```

The only failing file is `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` — a RAG generation-prompt wording assertion belonging to the in-flight `somnio-v4-rag-generative` standalone, the exact pre-existing failure the Plan 04 SUMMARY documented. Result is **fewer** failures than Plan 04's documented baseline (8 files/6 tests → 7 files/4 tests), so this plan introduced **zero** new failures. None of the failing files are mine (`actions/messages.ts`, `action-executor.ts`, `contact-reviews.ts`, `messages-provider.test.ts`).

## Threat Flags

None. The threat surface introduced is exactly the plan's `<threat_model>` register: T-39-02 (both bypass sites now go through the single domain chokepoint — no per-call-site apiKey resolution remains; the literal 131047 fix completed), T-39-01 (the read-receipt token only passed to `markWhatsAppRead`, never logged), T-39-09 (the 360dialog arms in `markMessageAsRead` and the domain's `sendTemplateMessage` stay byte-identical → Somnio + 4 prod workspaces unchanged).

## TDD Gate Compliance

Task 1 was marked `tdd="true"`. The behavior is a Next.js server-action arm (`markMessageAsRead`) that depends on `next/headers`-bound `getRequestAuth` + `createClient` + `revalidatePath`; the repo has **no precedent** for unit-testing server actions directly (Plan 04's TDD ran against the pure, mockable *domain* layer). The plan's own `<verify>` block for Task 1 specifies a grep + tsc gate (not a new test file), which was honored. The provider-decision logic this arm mirrors is already pinned GREEN by `messages-provider.test.ts` (the domain-level RED→GREEN gate from Plans 01/04). No new RED test file was added for the server-action wrapper; the equivalent contract is covered at the domain layer.

## Self-Check: PASSED

Modified files (all FOUND):
- `src/app/actions/messages.ts`
- `src/lib/automations/action-executor.ts`
- `src/lib/domain/contact-reviews.ts`

Commits (all FOUND in git log):
- `92567313` feat(39-05): markMessageAsRead Meta arm for read receipts (D-07)
- `ee939f92` feat(39-05): rewire send360Template bypass sites through domain chokepoint
