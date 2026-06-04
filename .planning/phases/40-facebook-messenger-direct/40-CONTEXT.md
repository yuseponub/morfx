# Phase 40: Facebook Messenger Direct - Context

**Gathered:** 2026-06-04
**Status:** Ready for research

<domain>
## Phase Boundary

Workspaces can connect their Facebook Page and **receive + send Messenger conversations directly through MorfX via Meta Graph API**, replacing the ManyChat workaround with a native inbox.

**Scope narrowed during discuss (D-12):** Phase 40 delivers the **HUMAN inbox only** — connect Page, receive Messenger messages into the inbox, and let human agents reply (text + image). **AI-agent routing on meta_direct Messenger is OUT of scope** (deferred to a later phase). Instagram Direct is Phase 41. The per-workspace `messenger_provider` migration flag IS in scope (MIG-02).

Requirements: SIGNUP-04, FB-01, FB-02, FB-03, FB-04, MIG-02.
</domain>

<decisions>
## Implementation Decisions

### Connection flow (SIGNUP-04)
- **D-01:** **Separate buttons** — "Conectar Facebook" ships in Phase 40; "Conectar Instagram" ships in Phase 41. Independent connect so businesses without IG aren't forced through an IG flow, and either channel can be reconnected without touching the other.
- **D-02:** The "Conectar Facebook" Embedded Signup requests `pages_messaging` **AND the Instagram messaging scope (forward-compat)**. The IG scope is granted only if the business has an IG account linked to the Page (graceful no-op otherwise). Phase 40 only *wires/uses* Messenger; the granted IG permission pre-authorizes Phase 41 so the customer does not re-authorize.
- **D-03:** Reuse the Phase 38 Embedded Signup infrastructure (`meta/embedded-signup.ts`, `actions/meta-onboarding.ts`, `domain/meta-accounts.ts`). Store the **Page Access Token + page_id** for the workspace.

### PSID → contact resolution (FB-04)
- **D-04:** **Create-or-get contact idempotently by `(page_id, PSID)`.** The PSID is the channel identity. **No fuzzy-match** to phone/email contacts (avoids duplicates + false positives). Fetch the display name (and profile pic if the scope allows) from the Graph API user profile for the contact/conversation.
- **D-05:** If a customer later provides a phone/email, merging into an existing CRM contact is a **manual operator action** — never automatic.

### Inbound routing + inbox (FB-01, FB-02)
- **D-06:** Extend the **same unified Meta webhook** (`src/app/api/webhooks/meta/route.ts`) with a branch for `object === 'page'` (Messenger). Today it hard-rejects non-`whatsapp_business_account`. Route to the correct workspace **by `page_id`**. One Meta app, one callback URL.
- **D-07:** Conversations display a **"Messenger" channel indicator** in the inbox.

### Outbound send (FB-03)
- **D-08:** New **`metaFacebookSender`** implementing the existing `ChannelSender` interface (sibling of `whatsappSender` / `metaWhatsappSender`). Sends **text + image** via the Graph API Messenger Send API.
- **D-09:** **24h window shown in the inbox.** Inside the window → free text + image. **Outside the window → support Meta message tags where policy-compliant**, specifically the **`HUMAN_AGENT` tag (7-day window for human responses)** IF the workspace has the human-agent feature/permission granted. If no valid tag/permission applies → **block the send with a clear explanation**. Must comply with ALL Meta messaging policies (user decision: "si tenemos el permiso, hacerlo, cumpliendo todas las políticas"). Researcher to confirm the available/compliant tag set + the `human_agent` permission requirements.

### Provider migration + coexistence (MIG-02, Regla 6)
- **D-10:** Per-workspace **`messenger_provider` flag (`'meta_direct' | 'manychat'`), default `'manychat'`**. Mirrors the `whatsapp_provider` pattern from Phase 39. The **single provider decision lives in the domain/channel layer (Regla 3)**, never per-call-site.
- **D-11:** **Regla 6** — the existing ManyChat Facebook path (`manychatFacebookSender`) and the `godentist-fb-ig` production agent stay **byte-identical**. Only workspaces explicitly flipped to `meta_direct` use the new Meta path. **`godentist-fb-ig` is NOT migrated** in this phase.

### Scope (AI agents)
- **D-12:** Phase 40 = **human inbox only** for meta_direct Messenger (send/receive by human agents). AI-agent routing on meta_direct Messenger is **deferred** to a later phase. Existing ManyChat-based agents are unaffected.

### Claude's Discretion
- "Messenger" channel-indicator visual design.
- Contact display-name / avatar fetch details.
- Page Access Token lifecycle / refresh handling.
- Exact schema for storing page accounts (extend `workspace_meta_accounts` vs new table) — subject to Regla 5 (migration before deploy).
</decisions>

<specifics>
## Specific Ideas

- The whole phase should mirror the **Phase 38 (connect/webhook) + Phase 39 (provider-flag chokepoint, ChannelSender, Regla 6 byte-identical default path)** playbook — that is the proven pattern for this codebase.
- Outbound must be **policy-first**: only send outside the 24h window through a legitimately-granted, compliant message tag (HUMAN_AGENT for human responses). Never bypass Meta policy.
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements
- `.planning/ROADMAP.md` §Phase 40 (goal, 5 success criteria) + §Phase 41 (IG — forward-compat context, NOT this phase)
- `.planning/REQUIREMENTS.md` — SIGNUP-04, FB-01..04, MIG-02

### Proven patterns to mirror (Phase 38 + 39)
- `src/lib/meta/embedded-signup.ts`, `src/app/actions/meta-onboarding.ts`, `src/lib/domain/meta-accounts.ts` — P38 connect flow + token storage (extend for Pages)
- `src/lib/domain/messages.ts` — P39 single provider-decision chokepoint (`readWhatsappProvider` + per-fn branch) — replicate for messenger_provider
- `src/lib/channels/types.ts` (ChannelSender), `src/lib/channels/registry.ts`, `src/lib/channels/whatsapp-sender.ts`, `src/lib/channels/manychat-sender.ts` (`manychatFacebookSender` — the path to keep byte-identical)
- `src/app/api/webhooks/meta/route.ts` — unified Meta webhook (add `object==='page'` branch; today rejects non-WhatsApp at line ~116)
- `src/lib/meta/credentials.ts` — `resolveByWorkspace` / `resolveByWabaId` resolver pattern (add a page-token resolver)

### Project rules
- `CLAUDE.md` — Regla 3 (domain chokepoint), Regla 5 (migration before deploy), Regla 6 (protect production agent)
- `.claude/rules/agent-scope.md` §Godentist FB/IG sibling — the `godentist-fb-ig` scope that MUST stay on ManyChat untouched
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Embedded Signup (P38):** `meta/embedded-signup.ts` + `actions/meta-onboarding.ts` + `domain/meta-accounts.ts` — extend to request `pages_messaging` (+IG scope) and persist Page token + page_id.
- **ChannelSender contract:** `channels/types.ts` + `registry.ts` — add `metaFacebookSender`. `metaWhatsappSender` (P39) is the closest analog (Graph API sender, `{accessToken, ...}` creds, NOT in the channel-keyed map — domain-imported).
- **Unified Meta webhook:** `api/webhooks/meta/route.ts` already does HMAC verify + WhatsApp + template-status branches — add the `object==='page'` Messenger branch alongside.
- **Contact resolution:** domain `resolveOrCreateContact` (used by other external triggers) — extend with a PSID-identity create-or-get.
- **ManyChat path (keep byte-identical):** `channels/manychat-sender.ts` `manychatFacebookSender` + `agents/godentist-fb-ig/*`.

### Established Patterns
- **Provider-flag chokepoint (P39):** single read of the provider column in the domain layer, branch meta_direct vs legacy, default = legacy (Regla 6). `messenger_provider` repeats this exactly.
- **Routing fact `channel`** already exists (`agents/routing/facts.ts`) — relevant later when agents are wired (deferred D-12).

### Integration Points
- Webhook `object==='page'` → workspace by page_id → inbound message → conversation + PSID contact.
- Inbox compose → domain send → messenger_provider branch → `metaFacebookSender` (meta_direct) vs `manychatFacebookSender` (manychat).
- Embedded Signup → store Page token in the meta-accounts store.
</code_context>

<deferred>
## Deferred Ideas

- **AI agents responding on meta_direct Messenger** — deferred to a later phase (D-12). Phase 40 is human-inbox only.
- **Instagram Direct** — Phase 41 (the FB connect pre-authorizes the IG scope per D-02).
- **Fuzzy contact matching / auto-merge of PSID contacts with phone/email contacts** — explicitly rejected for V1 (D-04/D-05); manual merge only.
- **Advanced message tags beyond HUMAN_AGENT** (marketing/utility tags) — out of scope; V1 is human-agent window only (D-09).
- **Migrating `godentist-fb-ig` to meta_direct** — not in this phase (Regla 6, D-11).
</deferred>

---

*Phase: 40-facebook-messenger-direct*
*Context gathered: 2026-06-04*
