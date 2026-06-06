---
phase: godentist-fbig-meta-direct-cutover
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/engine-adapters/production/messaging.ts
  - src/inngest/functions/agent-timers-v3.ts
  - src/inngest/functions/agent-timers-v4.ts
  - src/lib/domain/messages-send-idempotent.ts
  - src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts
autonomous: true
requirements: [OQ-2, Pitfall-2, D-06]
must_haves:
  truths:
    - "Agent FB/IG send reaches the domain chokepoint when provider=meta_direct even with NO manychat_api_key in settings"
    - "FB/IG send when provider=manychat still requires manychat_api_key (byte-identical to today)"
    - "WhatsApp send path is byte-identical (whatsapp_api_key arm untouched)"
    - "Retake-timer IMAGE follow-ups (sendTimerImage) also send via meta_direct with no manychat key (Pitfall 2 — both send sites guarded)"
  artifacts:
    - path: "src/lib/agents/engine-adapters/production/messaging.ts"
      provides: "Provider-aware getChannelCredentials + meta_direct send guard"
      contains: "messenger_provider"
    - path: "src/inngest/functions/agent-timers-v3.ts"
      provides: "Provider-aware retake-timer key resolution (text AND image send sites)"
      contains: "meta_direct"
    - path: "src/inngest/functions/agent-timers-v4.ts"
      provides: "Provider-aware retake-timer key resolution (text AND image send sites)"
      contains: "meta_direct"
    - path: "src/lib/domain/messages-send-idempotent.ts"
      provides: "Provider-aware mobile-inbox reply key resolution"
      contains: "meta_direct"
  key_links:
    - from: "messaging.ts getChannelCredentials"
      to: "domain sendTextMessage meta_direct arm"
      via: "apiKey=null tolerated when provider=meta_direct"
      pattern: "meta_direct"
---

<objective>
THE HAZARD FIX (RESEARCH Pitfall 2 — the single biggest risk). Patch the outbound send sites that hard-require `settings.manychat_api_key` for FB/IG and `return` early (0 messages sent) if it's missing — so they SKIP the manychat-key requirement when the workspace provider for that channel is `meta_direct`. Without this, the moment GoDentist flips to `meta_direct` and deletes its ManyChat key (D-06), the `godentist-fb-ig` agent goes MUTE (the agent runs, reaches `messaging.ts:184-187`, gets `apiKey:null`, returns `messagesSent:0`).

**There are SIX blocking sites, not four** — the agent adapter (`messaging.ts`), the mobile-inbox idempotent send (`messages-send-idempotent.ts`), AND TWO sites in EACH retake-timer file (`sendTimerMessage` text + `sendTimerImage` image, in both `agent-timers-v3.ts` and `agent-timers-v4.ts`). The image block is easy to miss; if it is left unpatched, retake-timer IMAGE follow-ups go mute after the key deletion.

This plan MUST be deployed BEFORE the cutover (Plan 03) flips providers or deletes any ManyChat key (D-04 ordering, Pitfall 2).

The correct pattern ALREADY exists and is proven in the web inbox action `src/app/actions/messages.ts:147-163` — copy it verbatim. The `manychat` arm stays byte-identical (Regla 6); only the `meta_direct` arm is added (leaves apiKey undefined/null; the domain ignores it and resolves Meta page-token creds via `resolveByWorkspace`).

Purpose: keep the agent + retake timers (text + image) + mobile inbox able to send via Meta after the provider flip.
Output: provider-aware send sites (adapter + idempotent + 4 timer blocks); WhatsApp + manychat arms unchanged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-fbig-meta-direct-cutover/CONTEXT.md
@.planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- The CORRECT provider-aware pattern, ALREADY in the codebase. Copy this shape. -->
From src/app/actions/messages.ts:147-163 (the reference — do NOT change this file):
```typescript
const isMetaDirectFacebook =
  channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct'
const isMetaDirectInstagram =
  channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct'
if (!isMetaDirectFacebook && !isMetaDirectInstagram) {
  if (channel === 'facebook' || channel === 'instagram') {
    apiKey = workspaceSettings?.settings?.manychat_api_key
    if (!apiKey) return { error: 'API key de ManyChat no configurada' }
  } else {
    apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
    if (!apiKey) return { error: 'API key de WhatsApp no configurada' }
  }
}
// meta_direct arm leaves apiKey undefined; the domain ignores it and resolves Meta creds
// (messages.ts:264-267 facebook / 291-294 instagram via resolveByWorkspace).
```

The domain `sendTextMessage` reads provider itself at the chokepoint (messages.ts:260/287) and resolves Meta creds — so the upstream key check only needs to STOP blocking. `params.apiKey` is unused on the meta_direct branch inside the domain.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Provider-aware getChannelCredentials + send guard in the AGENT adapter (highest priority)</name>
  <read_first>
    - src/lib/agents/engine-adapters/production/messaging.ts (the file being modified — read full; esp. getChannelCredentials L36-62 and send() L182-188)
    - src/app/actions/messages.ts:134-163 (the reference provider-aware pattern to copy)
    - src/lib/domain/messages.ts:257-310 (the chokepoint that resolves Meta creds — confirms apiKey is ignored on meta_direct)
  </read_first>
  <behavior>
    - When channel=facebook + workspaces.messenger_provider='meta_direct': getChannelCredentials returns a result that does NOT block send (apiKey may be null) AND send() proceeds to the domain (does NOT early-return messagesSent:0).
    - When channel=instagram + workspaces.instagram_provider='meta_direct': same.
    - When channel=facebook|instagram + provider='manychat' (or absent): byte-identical to today — requires settings.manychat_api_key; if null, send() returns messagesSent:0.
    - When channel=whatsapp: byte-identical to today (whatsapp_api_key / env).
  </behavior>
  <action>
Modify `getChannelCredentials` (messaging.ts:36-62) to ALSO read the provider columns and to be provider-aware. Change the select from `'settings'` to `'settings, messenger_provider, instagram_provider'`. Then:

```typescript
async function getChannelCredentials(
  workspaceId: string,
  channel: ChannelType
): Promise<{ apiKey: string | null; channel: ChannelType; metaDirect: boolean }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspaces')
    .select('settings, messenger_provider, instagram_provider')
    .eq('id', workspaceId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = data?.settings as any

  if (channel === 'facebook' || channel === 'instagram') {
    // meta_direct FB/IG sends use the Page token (resolved in the domain via
    // resolveByWorkspace) — NOT the ManyChat API key. Regla 6: the manychat
    // facebook + instagram paths still require their key (byte-identical).
    const isMetaDirect =
      (channel === 'facebook' && data?.messenger_provider === 'meta_direct') ||
      (channel === 'instagram' && data?.instagram_provider === 'meta_direct')
    if (isMetaDirect) {
      return { apiKey: null, channel, metaDirect: true }
    }
    return {
      apiKey: settings?.manychat_api_key || null,
      channel,
      metaDirect: false,
    }
  }

  // Default: WhatsApp via 360dialog (byte-identical — Regla 6)
  return {
    apiKey: settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY || null,
    channel: 'whatsapp',
    metaDirect: false,
  }
}
```

Then in `send()` change the early-return guard at messaging.ts:183-188 so it does NOT bail when the channel is meta_direct:

```typescript
    // Get credentials for this channel
    const creds = await getChannelCredentials(wsId, channel)
    if (!creds.apiKey && !creds.metaDirect) {
      logger.error({ workspaceId: wsId, channel }, 'Channel API key not configured')
      return { messagesSent: 0 }
    }
    const apiKey = creds.apiKey ?? '' // meta_direct: empty string; domain ignores it on the meta_direct arm
```

Leave the rest of `send()` untouched. The `apiKey` is threaded to `domainSendTextMessage`/`domainSendMediaMessage` as `params.apiKey`, which the domain ignores on the meta_direct arm (messages.ts:264-282 / 291-310 resolve Meta creds via resolveByWorkspace; the manychat else-branch uses params.apiKey).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "messenger_provider" src/lib/agents/engine-adapters/production/messaging.ts` >= 1
    - `grep -c "metaDirect" src/lib/agents/engine-adapters/production/messaging.ts` >= 3
    - `grep -c "settings, messenger_provider, instagram_provider" src/lib/agents/engine-adapters/production/messaging.ts` == 1
    - `grep -n "whatsapp_api_key" src/lib/agents/engine-adapters/production/messaging.ts` shows the whatsapp arm unchanged (settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY)
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>getChannelCredentials is provider-aware; send() proceeds for meta_direct FB/IG with no manychat key; whatsapp + manychat arms unchanged; typecheck green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Provider-aware key resolution in retake timers (v3 + v4 — BOTH text AND image send sites) and mobile-inbox idempotent send</name>
  <read_first>
    - src/inngest/functions/agent-timers-v3.ts:49-65 (sendTimerMessage TEXT key check) AND :130-145 (sendTimerImage IMAGE key check — error string 'No API key for channel (image)')
    - src/inngest/functions/agent-timers-v4.ts:62-78 (sendTimerMessage TEXT key check) AND :143-158 (sendTimerImage IMAGE key check — error string 'No API key for channel (image)')
    - src/lib/domain/messages-send-idempotent.ts:245-264 (the blocking key check)
    - src/app/actions/messages.ts:147-163 (reference pattern)
  </read_first>
  <behavior>
    - agent-timers-v3 / agent-timers-v4: when conv.channel is facebook/instagram AND that workspace's matching provider is meta_direct → proceed to domainSend with no manychat key (do not early-return false). This applies to BOTH `sendTimerMessage` (text) AND `sendTimerImage` (image) in BOTH files (4 blocks total). manychat + whatsapp paths byte-identical.
    - messages-send-idempotent: same — meta_direct FB/IG does not return 'API key de ManyChat no configurada'; manychat + whatsapp arms byte-identical.
  </behavior>
  <action>
**CRITICAL — there are TWO blocking send sites in EACH timer file, not one.** Each retake-timer file has BOTH a text sender (`sendTimerMessage`) AND an image sender (`sendTimerImage`), and EACH has its own `manychat_api_key` block that early-returns `false` if the key is missing. You MUST patch BOTH blocks in BOTH files (4 blocks total across the two timer files), or `godentist-fb-ig` retake-timer IMAGE follow-ups go MUTE after the D-06 key deletion (Pitfall 2). The image block's error string is `'No API key for channel (image)'` — that string MUST end up behind the new provider guard.

**agent-timers-v3.ts** and **agent-timers-v4.ts** — apply the SAME provider-aware patch to BOTH the TEXT block and the IMAGE block in EACH file:
- v3 TEXT block: `sendTimerMessage` ~L51-65 (select `'settings'` → `'settings, messenger_provider, instagram_provider'`; error `'No API key for channel'`).
- v3 IMAGE block: `sendTimerImage` ~L131-145 (same select swap; error `'No API key for channel (image)'`).
- v4 TEXT block: `sendTimerMessage` ~L64-78 (error `'No API key for channel'`).
- v4 IMAGE block: `sendTimerImage` ~L144-158 (error `'No API key for channel (image)'`).

Read both files to confirm the exact current line numbers before editing. For EACH of the 4 blocks, the select currently reads `'settings'`; change it to `'settings, messenger_provider, instagram_provider'` and make the key + guard provider-aware. The TEXT-block patch is:

```typescript
    const channel = (conv.channel as 'whatsapp' | 'facebook' | 'instagram') || 'whatsapp'
    const { data: ws } = await supabase
      .from('workspaces')
      .select('settings, messenger_provider, instagram_provider')
      .eq('id', workspaceId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ws?.settings as any
    const isMetaDirect =
      (channel === 'facebook' && ws?.messenger_provider === 'meta_direct') ||
      (channel === 'instagram' && ws?.instagram_provider === 'meta_direct')
    // meta_direct FB/IG: the domain resolves the Page token via resolveByWorkspace;
    // no manychat key needed. manychat + whatsapp arms byte-identical (Regla 6).
    const apiKey = isMetaDirect
      ? ''
      : (channel === 'facebook' || channel === 'instagram')
        ? settings?.manychat_api_key
        : settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

    if (!apiKey && !isMetaDirect) {
      logger.error({ workspaceId, channel }, 'No API key for channel')
      return false
    }
```

The IMAGE-block patch is byte-identical EXCEPT the error string keeps its `(image)` suffix (so the image log stays distinguishable):

```typescript
    const channel = (conv.channel as 'whatsapp' | 'facebook' | 'instagram') || 'whatsapp'
    const { data: ws } = await supabase
      .from('workspaces')
      .select('settings, messenger_provider, instagram_provider')
      .eq('id', workspaceId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ws?.settings as any
    const isMetaDirect =
      (channel === 'facebook' && ws?.messenger_provider === 'meta_direct') ||
      (channel === 'instagram' && ws?.instagram_provider === 'meta_direct')
    // meta_direct FB/IG: the domain resolves the Page token via resolveByWorkspace;
    // no manychat key needed. manychat + whatsapp arms byte-identical (Regla 6).
    const apiKey = isMetaDirect
      ? ''
      : (channel === 'facebook' || channel === 'instagram')
        ? settings?.manychat_api_key
        : settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

    if (!apiKey && !isMetaDirect) {
      logger.error({ workspaceId, channel }, 'No API key for channel (image)')
      return false
    }
```

Leave the recipientId resolution + the `domainSend`/`domainSendMedia` call below each block untouched (apiKey is passed through; ignored by the domain meta_direct arm). The `manychat`/`whatsapp` ternary arms stay byte-identical (Regla 6).

**messages-send-idempotent.ts** (L246-264): change the select to include the providers and add the meta_direct skip mirroring `actions/messages.ts:147-163`:

```typescript
  const { data: workspaceSettings } = await admin
    .from('workspaces')
    .select('settings, messenger_provider, instagram_provider')
    .eq('id', ctx.workspaceId)
    .single()

  const settings =
    (workspaceSettings?.settings as Record<string, unknown> | undefined) ?? {}

  const isMetaDirectFacebook =
    channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct'
  const isMetaDirectInstagram =
    channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct'

  let apiKey: string | undefined
  if (!isMetaDirectFacebook && !isMetaDirectInstagram) {
    if (channel === 'facebook' || channel === 'instagram') {
      apiKey = settings.manychat_api_key as string | undefined
      if (!apiKey) return { success: false, error: 'API key de ManyChat no configurada' }
    } else {
      apiKey =
        (settings.whatsapp_api_key as string | undefined) ||
        process.env.WHATSAPP_API_KEY
      if (!apiKey) return { success: false, error: 'API key de WhatsApp no configurada' }
    }
  }
  // meta_direct arm leaves apiKey undefined; the domain ignores it.
```
Leave everything below (recipientId + dispatch) untouched.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - BOTH timer files have BOTH blocks guarded (text site + image site each → `isMetaDirect` appears >= 2 per file): `grep -c "isMetaDirect" src/inngest/functions/agent-timers-v3.ts` >= 2 AND `grep -c "isMetaDirect" src/inngest/functions/agent-timers-v4.ts` >= 2
    - The provider select swap applied to BOTH blocks in EACH file: `grep -c "settings, messenger_provider, instagram_provider" src/inngest/functions/agent-timers-v3.ts` == 2 AND `grep -c "settings, messenger_provider, instagram_provider" src/inngest/functions/agent-timers-v4.ts` == 2
    - The IMAGE-path error string is now BEHIND the provider guard (not a bare `if (!apiKey)`): the only remaining `if (!apiKey` form in each timer file is the provider-aware `if (!apiKey && !isMetaDirect)` — verify `grep -c "if (!apiKey && !isMetaDirect)" src/inngest/functions/agent-timers-v3.ts` == 2 AND `grep -c "if (!apiKey && !isMetaDirect)" src/inngest/functions/agent-timers-v4.ts` == 2, AND `grep -c "if (!apiKey)" src/inngest/functions/agent-timers-v3.ts` == 0 AND `grep -c "if (!apiKey)" src/inngest/functions/agent-timers-v4.ts` == 0
    - The image error string is preserved (still present, now guarded): `grep -c "No API key for channel (image)" src/inngest/functions/agent-timers-v3.ts` == 1 AND `grep -c "No API key for channel (image)" src/inngest/functions/agent-timers-v4.ts` == 1
    - `grep -c "isMetaDirect" src/lib/domain/messages-send-idempotent.ts` >= 2
    - `grep -c "settings, messenger_provider, instagram_provider" src/lib/domain/messages-send-idempotent.ts` == 1
    - All three files still contain the unchanged whatsapp arm: `grep -c "whatsapp_api_key" src/inngest/functions/agent-timers-v3.ts` >= 1
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>All 4 timer send sites (text + image in v3 + v4) plus the idempotent mobile-inbox site are provider-aware; the image-path error string sits behind the provider guard; manychat + whatsapp arms byte-identical; typecheck green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Update v4-messaging-adapter test for the new getChannelCredentials return shape + add meta_direct no-key cases</name>
  <read_first>
    - src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts (the file being modified — read full)
    - src/lib/agents/engine-adapters/production/messaging.ts (the modified send() + getChannelCredentials)
  </read_first>
  <behavior>
    - Existing v4-messaging-adapter tests still pass with the new `{ apiKey, channel, metaDirect }` shape (the workspaces select now returns settings + provider columns — update the mocked supabase row to include messenger_provider/instagram_provider).
    - New case: provider=meta_direct facebook + NO manychat_api_key → send() does NOT early-return messagesSent:0 (it proceeds to the mocked domain send).
    - New case (Regla 6): provider=manychat facebook + NO manychat_api_key → send() returns messagesSent:0 (byte-identical).
  </behavior>
  <action>
Read the existing test to find how it mocks `createAdminClient` / the `workspaces` select. Ensure the mocked workspace row returned for the `workspaces` table includes `messenger_provider` and `instagram_provider` fields (default them to `'manychat'` so existing assertions stay valid). Add two new `it()` cases under a new describe block:

1. `meta_direct facebook proceeds to domain send with no manychat key`: mock the workspaces row with `messenger_provider:'meta_direct'`, `settings:{}` (no manychat_api_key), conversation `channel:'facebook'`, then assert the mocked `domainSendTextMessage` WAS called (i.e. send did not bail) and `messagesSent` >= 1 for a single template.

2. `manychat facebook with no key returns messagesSent:0 (Regla 6)`: mock `messenger_provider:'manychat'`, `settings:{}`, channel `'facebook'`, assert result `{ messagesSent: 0 }` and `domainSendTextMessage` NOT called.

Use the existing mock helpers in the file; do not introduce a live DB call. Keep WhatsApp cases unchanged.
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm vitest run src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` exits 0
    - `grep -c "meta_direct" src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` >= 2
    - Test file contains a case asserting manychat-no-key still returns messagesSent:0: `grep -c "messagesSent" src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` >= 1
  </acceptance_criteria>
  <done>Adapter tests green with the new credential shape; meta_direct no-key + manychat no-key cases asserted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| agent → outbound send | The agent's generated reply crosses into the messaging adapter / domain send; credentials resolved server-side from workspace row (never from agent input) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cut-01 | Tampering | getChannelCredentials provider read | mitigate | Provider read from `workspaces` row by workspaceId (server-side), never from agent/input; meta_direct creds resolved via resolveByWorkspace in domain |
| T-cut-02 | Denial of service | Bot mute after key deletion | mitigate | This plan IS the mitigation — meta_direct path no longer blocks on missing manychat key for text AND image sends (Pitfall 2) |
| T-cut-03 | Spoofing | Cross-tenant send via wrong provider | accept | provider read is workspace-scoped by id; no input-supplied provider; existing isolation preserved |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- `pnpm vitest run src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` exits 0
- `pnpm vitest run src/lib/domain/__tests__/messenger-provider.test.ts` exits 0 (no regression to the chokepoint)
- WhatsApp arm untouched: `git diff src/lib/agents/engine-adapters/production/messaging.ts` shows the whatsapp return path string `settings?.whatsapp_api_key` unchanged
</verification>

<success_criteria>
- All 6 outbound sites — messaging.ts, messages-send-idempotent.ts, and BOTH the text + image send sites in agent-timers-v3 AND agent-timers-v4 — skip the manychat-key requirement when provider=meta_direct.
- manychat + whatsapp arms byte-identical (Regla 6).
- typecheck + adapter + provider tests green.
- This plan is DEPLOYED before any provider flip or key deletion (Plan 03 ordering).
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-fbig-meta-direct-cutover/01-SUMMARY.md`
</output>
</content>
</invoke>
