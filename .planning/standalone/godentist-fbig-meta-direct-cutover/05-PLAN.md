---
phase: godentist-fbig-meta-direct-cutover
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - src/lib/domain/messages.ts
  - src/lib/channels/registry.ts
  - src/lib/channels/types.ts
  - src/lib/channels/manychat-sender.ts
  - src/lib/manychat/webhook-handler.ts
  - src/lib/manychat/api.ts
  - src/app/api/webhooks/manychat/route.ts
  - src/app/api/manychat/dynamic-reply/route.ts
  - middleware.ts
  - src/lib/domain/__tests__/messenger-provider.test.ts
  - src/lib/domain/__tests__/messages-instagram.test.ts
  - src/lib/meta/messenger-api.ts
  - src/lib/domain/conversations.ts
  - src/lib/whatsapp/types.ts
  - src/app/actions/meta-onboarding.ts
autonomous: true
requirements: [D-07, OQ-6, Pitfall-4]
must_haves:
  truths:
    - "No ManyChat code remains in src/ (handler, api, sender, routes, dynamic-reply)"
    - "The domain send chokepoint has no manychat else-branch for facebook/instagram"
    - "typecheck + build are green after EACH commit (Pitfall 4 ordering)"
    - "The /api/manychat middleware bypass is removed (route gone)"
  artifacts:
    - path: "src/lib/channels/registry.ts"
      provides: "Registry with no manychat senders (whatsapp-only or meta-aware)"
    - path: "src/lib/domain/messages.ts"
      provides: "FB/IG send arms with meta_direct only (no manychat else)"
  key_links:
    - from: "messages.ts send arms"
      to: "channels/registry"
      via: "getChannelSender no longer called for facebook/instagram"
      pattern: "getChannelSender"
---

<objective>
BLOCK B — delete ALL ManyChat code from the codebase (D-07, OQ-6). Runs only after Plan 04 (no workspace on manychat). The delete ORDER is load-bearing (Pitfall 4): rewire the registry + remove the domain `manychat` else-branches BEFORE deleting `manychat-sender.ts`, or typecheck/build breaks. Each task ends with `pnpm tsc --noEmit` green so every commit is shippable.

Precondition (verify at task start): `SELECT COUNT(*) FROM workspaces WHERE messenger_provider='manychat' OR instagram_provider='manychat'` = 0 (Plan 04). With no workspace on manychat, the domain `manychat` else-branches are dead code and safe to remove.

WhatsApp paths are UNTOUCHED throughout (Regla 6). The OQ-7 enum migration is a SEPARATE plan (06).

Purpose: ManyChat fully out of the codebase per the user's explicit request.
Output: manychat files deleted; domain + registry rewired; comments updated; tests green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- messages.ts has EXACTLY 6 getChannelSender CALL sites (plus the import at L26): -->
<!--   TEXT  arm: facebook L277, instagram L304, (final/fallback) L313 -->
<!--   MEDIA arm: facebook L443, instagram L475, (final/fallback) L489 -->
<!-- Read messages.ts and re-confirm the current line numbers before editing — they may drift. -->
<!-- Each of the 6 sits inside the `else { ... getChannelSender(channel) ... }` manychat arm. -->
<!-- The `if (mp/ip === 'meta_direct') { metaXSender ... }` block STAYS; the manychat else is removed. -->
<!-- registry.ts maps facebook/instagram → manychat senders; getChannelSender is called ONLY by these 6 domain manychat else-branches. -->
<!-- ChannelType = 'whatsapp' | 'facebook' | 'instagram' (types.ts:7) — KEEP facebook/instagram (still valid channels, now meta_direct-only). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewire registry + remove ALL 6 domain getChannelSender (manychat) call sites (Pitfall 4 — do this FIRST)</name>
  <read_first>
    - src/lib/domain/messages.ts (re-confirm the 6 getChannelSender call sites: TEXT facebook L277 / instagram L304 / fallback L313; MEDIA facebook L443 / instagram L475 / fallback L489; plus the import at L26)
    - src/lib/channels/registry.ts (maps facebook/instagram → manychat senders)
    - src/lib/channels/types.ts (ChannelType union + ChannelSender interface)
    - src/lib/domain/__tests__/messenger-provider.test.ts (mocks getChannelSender for the manychat parity arm)
    - src/lib/domain/__tests__/messages-instagram.test.ts (same)
  </read_first>
  <action>
**Step 1 — messages.ts (remove the manychat else-branches at ALL 6 getChannelSender call sites; keep meta_direct + WhatsApp arms).**

There are SIX `getChannelSender(channel)` calls to eliminate (verify exact lines first — they may have drifted):
- TEXT facebook arm ~L277
- TEXT instagram arm ~L304
- TEXT final/fallback ~L313
- MEDIA facebook arm ~L443
- MEDIA instagram arm ~L475
- MEDIA final/fallback ~L489

In `sendTextMessage` facebook arm (the block containing the ~L277 call): keep the `if (mp === 'meta_direct') { ... }` block. The `else { ... getChannelSender ... }` becomes unreachable (no manychat workspace). Replace the else with a defensive Meta-creds path instead of calling getChannelSender:
```typescript
    } else if (channel === 'facebook') {
      // ManyChat decommissioned — facebook is meta_direct only now.
      const creds = await resolveByWorkspace(ctx.workspaceId, 'facebook')
      if (!creds?.accessToken || !creds.pageId) {
        return { success: false, error: 'Credenciales Meta no configuradas' }
      }
      const resp = await metaFacebookSender.sendText(
        { accessToken: creds.accessToken, pageId: creds.pageId },
        params.contactPhone,
        params.messageBody,
        params.tag
      )
      wamid = resp.externalMessageId
```
(Remove the `readMessengerProvider` call here only if it becomes unused elsewhere — KEEP `readMessengerProvider`/`readInstagramProvider` if the window-gate or other code still imports them; check imports. The simplest safe edit: keep the provider read but drop the `else getChannelSender` branch, replacing it with the meta error. If you keep the `if (mp==='meta_direct')` guard, the non-meta path returns the Meta-creds error — also fine. Prefer collapsing to meta-only as shown.)

Do the SAME for the instagram text arm (the ~L304 call) with `metaInstagramSender`, and the TEXT final/fallback (~L313).

For the MEDIA arms (facebook ~L443, instagram ~L475, fallback ~L489): keep the `if (mp/ip === 'meta_direct') { metaXSender.sendMedia(...) }` block; replace the manychat `else if (params.mediaType === 'image') { getChannelSender(...) }` + final `else` with the meta-creds path / unsupported-type error (no getChannelSender). Keep the WhatsApp arms. Since ChannelType is only whatsapp|facebook|instagram, the final/fallback `else` (~L313 / ~L489) is unreachable; replace its body with `return { success: false, error: 'Canal no soportado' }` (no getChannelSender call).

After this step, `getChannelSender` is no longer called anywhere in messages.ts — ALL 6 call sites gone. Verify: `grep -c getChannelSender src/lib/domain/messages.ts` == 0. Remove the now-unused `import { getChannelSender }` from messages.ts (L26).

**Step 2 — registry.ts: remove manychat sender imports + map entries.**
```typescript
import type { ChannelType, ChannelSender } from './types'
import { whatsappSender } from './whatsapp-sender'

const senders: Partial<Record<ChannelType, ChannelSender>> = {
  whatsapp: whatsappSender,
}

export function getChannelSender(channel: ChannelType): ChannelSender {
  return senders[channel] || senders.whatsapp!
}
```
(facebook/instagram now fall back to whatsappSender, but the domain never calls getChannelSender for them anymore — it's only kept for whatsapp/back-compat. If no caller remains for facebook/instagram, this is dead-but-safe.) Update the file header comment to drop "Facebook/Instagram via ManyChat".

**Step 3 — types.ts: update the header comment** (remove "Facebook/Instagram via ManyChat"; keep the ChannelType union and ChannelSender interface — both still used by whatsapp + meta senders).

**Step 4 — update the two domain tests that mock the manychat getChannelSender arm.**
`messenger-provider.test.ts` + `messages-instagram.test.ts`: the `manychat` (DEFAULT) parity describe blocks asserted that the facebook/instagram arm calls `getChannelSender(...)` and NEVER resolves Meta creds. That arm is gone. Update these tests so:
- The former `manychat` parity cases are REMOVED or converted to assert the new meta-only behavior (provider read no longer gates; facebook/instagram always go meta_direct → resolveByWorkspace).
- Keep the `meta_direct` cases (they now describe the only path).
- Remove the `vi.mock('@/lib/channels/registry', ...)` getChannelSender mock if no longer referenced.
Run them and ensure green.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm vitest run src/lib/domain/__tests__/messenger-provider.test.ts src/lib/domain/__tests__/messages-instagram.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - ALL 6 call sites gone (the real gate): `grep -c "getChannelSender" src/lib/domain/messages.ts` == 0
    - `grep -c "manychat" src/lib/channels/registry.ts` == 0 (case-insensitive: `grep -ci manychat src/lib/channels/registry.ts` == 0)
    - `grep -ci "via ManyChat" src/lib/channels/types.ts` == 0
    - `pnpm tsc --noEmit` exits 0
    - `pnpm vitest run src/lib/domain/__tests__/messenger-provider.test.ts src/lib/domain/__tests__/messages-instagram.test.ts` exits 0
    - WhatsApp arms unchanged: `grep -c "send360Text\|send360Media\|metaWhatsappSender" src/lib/domain/messages.ts` >= 2
  </acceptance_criteria>
  <done>Domain no longer calls getChannelSender for FB/IG at any of the 6 sites; registry has no manychat senders; domain tests green; typecheck green. SAFE to delete the sender next.</done>
</task>

<task type="auto">
  <name>Task 2: Delete manychat-sender.ts + routes + middleware bypass (now unreferenced)</name>
  <read_first>
    - src/lib/channels/manychat-sender.ts (to delete — confirm only registry imported it, now rewired)
    - src/app/api/webhooks/manychat/route.ts (inbound webhook — to delete)
    - src/app/api/manychat/dynamic-reply/route.ts (dynamic-content route — to delete; reads manychat_pending_replies)
    - middleware.ts:55-59 (the /api/manychat bypass — to remove)
    - src/lib/manychat/webhook-handler.ts + src/lib/manychat/api.ts (to delete)
  </read_first>
  <action>
After Task 1, `manychat-sender.ts` has no importers (verify: `grep -rln "manychat-sender" src/` returns 0). Delete in this order, running `pnpm tsc --noEmit` after each deletion group:

1. Delete `src/app/api/webhooks/manychat/route.ts` (uses MANYCHAT_DEFAULT_WORKSPACE_ID, MANYCHAT_WEBHOOK_SECRET; imports processManyChatWebhook).
2. Delete `src/app/api/manychat/dynamic-reply/route.ts` (the only reader of manychat_pending_replies).
3. Delete `src/lib/manychat/webhook-handler.ts` and `src/lib/manychat/api.ts` (whole `src/lib/manychat/` dir).
4. Delete `src/lib/channels/manychat-sender.ts`.
5. Remove the `/api/manychat` bypass block in `middleware.ts` (the "MANYCHAT DYNAMIC CONTENT" section, currently lines 55-59):
   ```typescript
   // ==================== MANYCHAT DYNAMIC CONTENT ====================
   // ManyChat calls this endpoint from Dynamic Content blocks in Flows
   if (pathname.startsWith('/api/manychat')) {
     return NextResponse.next()
   }
   ```
   Delete it entirely (the route is gone). Leave the surrounding `/api/webhooks` and `/api/inngest` bypasses intact.

After all deletions, confirm no dangling imports of the deleted modules anywhere.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `test ! -f src/lib/channels/manychat-sender.ts` (file gone)
    - `test ! -d src/lib/manychat` (directory gone)
    - `test ! -f src/app/api/webhooks/manychat/route.ts` (file gone)
    - `test ! -f src/app/api/manychat/dynamic-reply/route.ts` (file gone)
    - `grep -c "api/manychat" middleware.ts` == 0
    - `grep -rln "@/lib/manychat\|manychat-sender\|processManyChatWebhook" src/` returns 0
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>All manychat code files + routes + middleware bypass removed; no dangling imports; typecheck green.</done>
</task>

<task type="auto">
  <name>Task 3: Clean residual ManyChat references in comments/tests + remove MANYCHAT_ env from .env files</name>
  <read_first>
    - src/lib/meta/messenger-api.ts:82 (comment ref to manychatFacebookSender)
    - src/lib/domain/conversations.ts:52 (comment "ManyChat subscriber ID")
    - src/lib/whatsapp/types.ts:53 (comment "ManyChat subscriber ID")
    - src/app/actions/meta-onboarding.ts:149 (comment "traffic stays on manychat until")
    - src/lib/channels/__tests__/meta-facebook-sender.test.ts (comments mention manychatFacebookSender parity)
    - .env.example / .env.local / .env.test.example (if present — MANYCHAT_ vars)
  </read_first>
  <action>
Update comments only (no behavior change) so no stale ManyChat wording remains:
- `messenger-api.ts:82`: change "image-as-followup parity with manychatFacebookSender" → "image-as-followup parity (caption sent as a separate follow-up text)".
- `conversations.ts:52`: change `/** ManyChat subscriber ID (for FB/IG conversations) */` → `/** External subscriber ID — PSID (Messenger) / IGSID (Instagram) for FB/IG conversations */`. KEEP the field.
- `whatsapp/types.ts:53`: change `// ManyChat subscriber ID (FB/IG)` → `// External subscriber ID — PSID/IGSID (FB/IG)`. KEEP the field.
- `meta-onboarding.ts:149`: update the comment that says traffic stays on manychat (now meta_direct is the only FB/IG transport).
- `meta-facebook-sender.test.ts`: update the two comments mentioning manychatFacebookSender to plain "image-as-followup parity" wording (do not change assertions).

Remove `MANYCHAT_DEFAULT_WORKSPACE_ID`, `MANYCHAT_WEBHOOK_SECRET`, `MANYCHAT_IG_REPLY_TAG_ID`, `MANYCHAT_API_KEY` lines from any `.env.example`, `.env.local`, `.env.test.example` that exist in the repo. (Vercel env var deletion is a separate operator action noted in the SUMMARY — Claude cannot delete Vercel env vars.)

Optionally delete helper scripts `scripts/setup-godentist-manychat.sql`, `scripts/_chk-manychat.ts`, `scripts/godentist-valoraciones-discovery-2.ts` if present (they are read-only diagnostics).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rci "manychat" src/lib/domain/conversations.ts` == 0
    - `grep -rci "manychat" src/lib/whatsapp/types.ts` == 0
    - `grep -rci "manychat" src/lib/meta/messenger-api.ts` == 0
    - `grep -rln "MANYCHAT_" src/` returns 0
    - Remaining `grep -rli manychat src/` matches (if any) are ONLY in test comment strings that were intentionally retained — ideally 0
    - `pnpm tsc --noEmit` exits 0
    - Full suite green: `pnpm vitest run src/lib/domain src/lib/channels src/lib/messenger src/lib/instagram` exits 0
  </acceptance_criteria>
  <done>No ManyChat code or env references remain in src/; comments updated; typecheck + suite green. Operator-only Vercel env deletion noted in SUMMARY.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| code deletion → build integrity | Removing shared modules out of order breaks typecheck/build |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cut-12 | Availability | Broken build from delete order | mitigate | Rewire registry/domain (all 6 getChannelSender sites) BEFORE deleting sender (Pitfall 4); tsc green per task |
| T-cut-13 | Availability | WhatsApp regression from shared-file edits | mitigate | WhatsApp arms untouched; grep gate on send360/metaWhatsapp; suite green |
| T-cut-14 | Spoofing | Forged ManyChat webhook post-decommission | mitigate | Route deleted — endpoint gone entirely |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- `pnpm vitest run` (full suite) green
- `grep -rln "@/lib/manychat\|manychat-sender\|processManyChatWebhook\|MANYCHAT_" src/` returns 0
- `grep -c "getChannelSender" src/lib/domain/messages.ts` == 0 (all 6 call sites removed)
- `git diff` shows zero changes to WhatsApp send arms / whatsapp-sender / 360dialog
</verification>

<success_criteria>
- ManyChat code, routes, sender, middleware bypass, env refs all removed from the repo.
- Domain FB/IG send is meta_direct-only; registry has no manychat senders; all 6 getChannelSender call sites in messages.ts removed.
- typecheck + full suite green; WhatsApp untouched.
- The manychat_pending_replies table drop is deferred to Plan 06 (its only reader, dynamic-reply route, is now deleted).
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-fbig-meta-direct-cutover/05-SUMMARY.md` (note the operator-only Vercel env var deletion: MANYCHAT_DEFAULT_WORKSPACE_ID, MANYCHAT_WEBHOOK_SECRET, MANYCHAT_IG_REPLY_TAG_ID, MANYCHAT_API_KEY).
</output>
</content>
