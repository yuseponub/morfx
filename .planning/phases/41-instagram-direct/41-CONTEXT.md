# Phase 41: Instagram Direct - Context

**Gathered:** 2026-06-05
**Status:** Ready for research

<domain>
## Phase Boundary

Workspaces can connect their Instagram Professional account (linked to an already-connected Facebook Page) and **receive + send Instagram DMs directly through MorfX via Meta Graph API**, replacing the ManyChat workaround with a native inbox. Sibling of Phase 40 (Facebook Messenger Direct) — same playbook, IG-specific identity + API surface.

**Scope (D-IG-01, mirrors Phase 40 D-12):** Phase 41 delivers the **HUMAN inbox only** — connect IG, receive DMs into the inbox, and let human agents reply (text + image). **AI-agent routing on meta_direct Instagram is OUT of scope** (deferred to a follow-up, despite ROADMAP success-criterion #5 — user chose human-inbox-only V1 for consistency/lower risk). The per-workspace `instagram_provider` migration flag IS in scope.

Requirements: IG-01, IG-02, IG-03, IG-04, IG-05.
</domain>

<decisions>
## Implementation Decisions

### Scope (V1)
- **D-IG-01:** **Human inbox only** for meta_direct Instagram (send/receive text + image by human agents). AI-agent routing on IG is **deferred** to a follow-up phase. Mirrors Phase 40 D-12. (Note: ROADMAP criterion #5 lists agents — explicitly deferred by user decision 2026-06-05 to ship a focused V1.)

### Provider migration + coexistence (Regla 6)
- **D-IG-02:** **New per-workspace column `instagram_provider` (`'meta_direct' | 'manychat'`), default `'manychat'`.** SEPARATE from `messenger_provider` (NOT reused) so IG and FB migrate **independently** — a workspace can run FB on meta_direct while IG stays on manychat. Mirrors `messenger_provider` / `whatsapp_provider`. Single provider decision in the domain/channel layer (Regla 3), never per-call-site. Requires a migration (Regla 5 — apply to prod before deploying code that reads it).
- **D-IG-03:** **Regla 6** — the existing ManyChat Instagram path (`manychat` sender, `channel='instagram'`) and the `godentist-fb-ig` production agent (which serves IG via ManyChat) stay **byte-identical**. Only workspaces explicitly flipped to `instagram_provider='meta_direct'` use the new Meta path. **`godentist-fb-ig` is NOT migrated.**

### Connection flow
- **D-IG-04:** **Separate "Conectar Instagram" button** (not auto-link). IG has no independent OAuth — it rides on the connected Facebook Page. The button resolves the **`instagram_business_account`** linked to the workspace's connected Page (`GET /{page_id}?fields=instagram_business_account{id,username}` — researcher to confirm exact edge/field), stores the **`ig_account_id` (+ username)** on the meta-account row, and reuses the **Page Access Token** for IG Send/receive. If no IG account is linked to the Page → clear error ("vincula una cuenta de Instagram Profesional a tu página de Facebook"). Reuses the Phase 40 connect infra (`actions/meta-onboarding.ts`, `domain/meta-accounts.ts`).

### IGSID → contact resolution
- **D-IG-05:** **Create-or-get contact idempotently by `(ig_account_id, IGSID)`** — the Instagram-Scoped ID is the channel identity. **No fuzzy-match** to phone/email (avoids duplicates). Identifier prefix `ig-${IGSID}` (mirrors FB `fb-${psid}`). Name resolution via the conversations edge with the **same self-heal pattern shipped in Phase 40** (`getMessengerUserName`-equivalent + `nameResolved` guard + `healPlaceholderContactName` with placeholder prefix `'IG-'`). Researcher to confirm the IG name edge (`/{ig_account_id}/conversations?platform=instagram&user_id={igsid}&fields=participants` or `/{IGSID}?fields=name,username`).

### Inbound routing + inbox
- **D-IG-06:** Extend the **same unified Meta webhook** (`src/app/api/webhooks/meta/route.ts`) with a branch for **`object === 'instagram'`** (IG DMs). Route to the correct workspace **by `ig_account_id`** (add `resolveByIgAccountId` to `meta/credentials.ts`, sibling of `resolveByPageId`). One Meta app, one callback URL. IGSID stays a STRING (never Number-coerced).
- **D-IG-07:** Conversations display an **"Instagram" channel indicator** in the inbox (`channel='instagram'`). The inbox already renders channel indicators (Phase 40 reused the existing component for facebook).

### Outbound send
- **D-IG-08:** New **`metaInstagramSender`** implementing the `ChannelSender` contract (sibling of `metaFacebookSender`). Sends **text + image** via the Graph IG Send API (researcher: confirm `POST /{page_id}/messages` with `recipient:{id: IGSID}` + any `messaging_product`/`platform` requirement). Unsupported types (stickers, voice, etc.) → graceful error (ROADMAP criterion #2). Mirror the media in/out generalization already shipped for FB.
- **D-IG-09:** **24h window — EXACTLY like Facebook (D-09).** Inside the window → free text + image. Outside the window → reuse the `messenger/window-gate.ts` decision (`HUMAN_AGENT` tag behind `META_HUMAN_AGENT_ENABLED`, which is currently OFF → block with the clear Spanish message). **No countdown timer** (user chose to mirror FB — this deliberately deviates from ROADMAP criterion #4 which asked for a visible remaining-time countdown). Researcher to confirm IG's outside-24h tag policy (IG is stricter than FB — verify HUMAN_AGENT applies to IG and there are no IG-specific tag rules).

### Claude's Discretion
- "Instagram" channel-indicator visual (reuse the facebook indicator styling).
- Whether the IG window-gate is the same `window-gate.ts` helper reused, or an IG sibling (if IG policy differs).
- Schema: extend `workspace_meta_accounts` with `ig_account_id` + `ig_username` (vs new table) — Regla 5 (migration before deploy).
- Placeholder name prefix `'IG-'` for the self-heal.
</decisions>

<specifics>
## Specific Ideas

- **Mirror Phase 40 end-to-end** — Phase 40 already shipped (during its live smoke) a battle-tested FB implementation: connect + Business-Portfolio token fallback, unified webhook branch, `metaFacebookSender` with text/image/audio/video/doc, window-gate, IGSID-style identity, AND the **name self-heal** (`healPlaceholderContactName` + `nameResolved`). IG should clone these file-for-file with IG identity swapped in.
- **Policy-first outbound** — never send outside the 24h window except through a legitimately-granted compliant tag. IG is the STRICTEST channel (no templates, 200 msg/hr, 1000-follower minimum for API) — researcher must surface every IG-specific constraint.
- **Reuse, don't re-derive** — the FB sibling files are the canonical analogs; copy their structure and the Regla 6 / Regla 3 / Regla 5 discipline.
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements
- `.planning/ROADMAP.md` §Phase 41 (goal, 5 success criteria — NOTE criterion #4 countdown + #5 agents are deferred per D-IG-01/D-IG-09)
- `.planning/REQUIREMENTS.md` — IG-01..IG-05
- `.planning/phases/40-facebook-messenger-direct/40-CONTEXT.md` — the FB sibling decisions this phase mirrors

### Proven patterns to mirror (Phase 40 — the FB sibling, already shipped + live-verified)
- `src/lib/messenger/webhook-handler.ts` — `processMessengerWebhook` (inbound handler + name self-heal + media mapping) → clone as IG handler
- `src/lib/meta/messenger-api.ts` — `sendMessengerText/Image/Attachment`, `getMessengerUserName` → IG sibling
- `src/lib/channels/meta-facebook-sender.ts` — `metaFacebookSender` (ChannelSender, domain-imported, NOT in the channel-keyed map) → `metaInstagramSender`
- `src/lib/messenger/window-gate.ts` — `resolveMessengerWindowSend` (24h + HUMAN_AGENT behind `META_HUMAN_AGENT_ENABLED`) → reuse/mirror
- `src/lib/domain/messages.ts` — facebook arm in `sendMessage`/`sendMediaMessage` (provider chokepoint `readMessengerProvider`) → add instagram arm reading `instagram_provider`
- `src/lib/meta/credentials.ts` — `resolveByPageId` / `resolveByWorkspace` → add `resolveByIgAccountId`
- `src/app/api/webhooks/meta/route.ts` — unified Meta webhook (`object==='page'` branch) → add `object==='instagram'` branch
- `src/components/settings/connect-facebook.tsx` + `src/app/actions/meta-onboarding.ts` (`connectFacebookPage`, `getPageToken`, Business-Portfolio fallback) → `connect-instagram.tsx` + `connectInstagramAccount`
- `src/lib/domain/contacts.ts` — `healPlaceholderContactName` (channel-agnostic, takes `placeholderPrefix`) → reuse with `'IG-'`
- `src/lib/domain/meta-accounts.ts` — `upsertMetaAccount` (extend for `ig_account_id`/`ig_username`)

### Project rules
- `CLAUDE.md` — Regla 3 (domain chokepoint), Regla 5 (migration before deploy), Regla 6 (protect production agent)
- `.claude/rules/agent-scope.md` §Godentist FB/IG sibling — `godentist-fb-ig` stays on ManyChat untouched

### Memory / live learnings (this session, 2026-06-04/05)
- Name self-heal (first-message race) + `healPlaceholderContactName` — apply to IG from the start
- Meta permissions: `instagram_basic` + `instagram_manage_messages` APPROVED; `HUMAN_AGENT` NOT approved (→ outside-24h = block); no HSM templates on IG
- Webhook callback MUST be `https://www.morfx.app/api/webhooks/meta` (www, apex 307-redirects)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (all from the shipped Phase 40 FB sibling)
- Connect infra + Business-Portfolio token fallback (`meta-onboarding.ts`, `messenger-connect.ts`).
- Unified Meta webhook (HMAC verify + whatsapp + template-status + `object==='page'` branches) — add `object==='instagram'`.
- `ChannelSender` contract + domain-imported Meta senders (`metaWhatsappSender`, `metaFacebookSender`) — add `metaInstagramSender`.
- Provider-flag chokepoint in `domain/messages.ts` (read provider ONCE, branch meta_direct vs manychat, default manychat) — replicate for `instagram_provider`.
- Contact identity create-or-get + name self-heal (`resolveOrCreateContact`, `healPlaceholderContactName`, `findOrCreateConversation` profile_name update).
- Media in/out generalization (text/image + graceful unsupported) already in the FB handler/sender.

### Established Patterns
- Provider-flag chokepoint (P39/P40): single column read in the domain layer, default = legacy (Regla 6).
- Routing fact `channel` already supports `'instagram'` (agents/routing/facts.ts) — relevant when agents are wired (deferred D-IG-01).

### Integration Points
- Webhook `object==='instagram'` → workspace by `ig_account_id` → inbound DM → conversation + IGSID contact (+ name self-heal).
- Inbox compose → domain send → `instagram_provider` branch → `metaInstagramSender` (meta_direct) vs manychat (default).
- "Conectar Instagram" → resolve `instagram_business_account` from connected Page → store `ig_account_id` + reuse Page token.
</code_context>

<deferred>
## Deferred Ideas

- **AI agents responding on meta_direct Instagram** — deferred (D-IG-01); V1 is human-inbox only (ROADMAP criterion #5 deferred).
- **24h-window countdown timer in the inbox** — deferred (D-IG-09); V1 mirrors FB (block only, no visible countdown — ROADMAP criterion #4 deferred).
- **Migrating `godentist-fb-ig` to meta_direct IG** — not in this phase (Regla 6, D-IG-03).
- **Advanced message tags / marketing on IG** — out of scope; V1 is human-agent-window only.
- **Fuzzy contact matching / auto-merge of IGSID contacts with phone/email** — rejected for V1 (mirror FB D-05); manual merge only.
</deferred>

<addendum>
## Addendum — Plan 41-08 (discovered at 41-07 cutover, 2026-06-05)

**Discovered gap (verified, not assumed):** "Conectar Instagram" fails with our Spanish error `vincula una cuenta de Instagram Profesional a tu página de Facebook`. Root cause proven via `scripts/_debug-ig-link.ts` calling the Graph API with the REAL stored Varixcenter Page token:
- The stored Page token can't even read `/me` → `(#100) requires 'pages_read_engagement'`. It was minted in an early Phase 40 smoke.
- `connect-facebook.tsx:66` `FB_LOGIN_SCOPE` = `pages_show_list,pages_messaging,pages_manage_metadata,business_management,pages_read_engagement` — **NO `instagram_basic` / `instagram_manage_messages`** (deliberately deferred in Phase 40 D-02; comment at `:62`).
- **The flawed premise in 41-RESEARCH (lines 217, 350-366):** "IG rides on the SAME Page token" assumed app-level advanced-access approval of `instagram_basic`/`instagram_manage_messages` meant the STORED token carried them. App-level approval ≠ the token being GRANTED those scopes at FB.login time. So `resolveInstagramAccount` (`GET /{pageId}?fields=instagram_business_account`, which needs `instagram_basic`+`pages_read_engagement`+`pages_show_list`) fails even if the IG account IS professional+linked.

### Decisions (locked 2026-06-05)
- **D-IG-10 — Dedicated IG login (Option B), NOT shared FB scope.** "Conectar Instagram" runs its OWN `FB.login` requesting the IG scopes (incremental auth) and refreshes the stored Page token. Rejected: adding `instagram_*` to the shared `FB_LOGIN_SCOPE` (would re-introduce the IG-selection screen for ALL FB connects — the exact thing Phase 40 deferred; blocks FB-only businesses without IG). Consistent with the FB/IG tabs already split in /integraciones (41-06).
- **D-IG-11 — Regla 6 / additive.** 41-08 must NOT break the FB Messenger connect or the FB-only flow. The FB connect (`connect-facebook.tsx`, `connectFacebookPage`) stays byte-identical. Only the IG button + `connectInstagramAccount` change.
- **D-IG-12 — Token refresh path.** The dedicated IG login yields a fresh USER token → reuse Phase 40 helpers (`exchangeForLongLivedUserToken` + page-token helper in messenger-connect.ts) to obtain a Page token that now carries the IG scopes → re-store (update `access_token_encrypted` on the connected facebook row, additive/superset — Messenger keeps working) → `resolveInstagramAccount` → upsert instagram account.
- **Still UNKNOWN (resolves post-deploy):** whether Varixcenter's IG account is actually Professional+linked. The broken token blocked the check. Once 41-08 ships and the user reconnects, `resolveInstagramAccount` gives the definitive verdict.

### Open research questions for 41-08
- Meta incremental-permission mechanics on `FB.login` (does adding scopes union with prior grants? need `auth_type:'rerequest'` for previously-declined scopes?).
- Whether refreshing the Page token via a new login replaces scopes cleanly and whether the long-lived exchange + `/me/accounts` page-token helper returns the IG-scoped Page token.
- Graceful handling when the connected business has NO IG (the button must fail with the clear Spanish error, never block — mirror D-02 intent).
- A2 linchpin: does the existing Page `subscribed_apps` deliver IG DMs, or is a per-IG-account subscribe needed? (deferred-but-document from 41-07.)
</addendum>

---

*Phase: 41-instagram-direct*
*Context gathered: 2026-06-05 (addendum: 41-08 dedicated IG login, 2026-06-05)*
