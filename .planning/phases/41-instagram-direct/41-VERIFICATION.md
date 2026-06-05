---
phase: 41-instagram-direct
verified: 2026-06-05T11:00:00Z
status: gaps_found
score: 8/10 must-haves verified
overrides_applied: 0
gaps:
  - id: GAP-41-01
    severity: blocking
    discovered: 2026-06-05 live test (post-deploy, Varixcenter operator)
    requirement: IG-03
    title: "connectInstagramAccount uses getPageToken's FIRST page (data[0]) instead of the page already bound to the workspace — multi-page operators hit a uq_meta_page UNIQUE(page_id) collision"
    symptom: "Clicking 'Conectar Instagram' returns 'Esta página ya está conectada en otro espacio de trabajo. Una página solo puede pertenecer a una cuenta.' for an operator whose Facebook account manages 2+ pages (Varixcenter 528898033801678 + Pruebas Morfx 714615171734964)."
    root_cause: "Plan 41-08 replaced the old resolveByWorkspace(workspaceId,'facebook') read (which used the page ALREADY bound to the workspace) with a fresh getPageToken(longLivedUserToken). getPageToken (src/lib/meta/messenger-connect.ts:181) does res.data?.find(p => p.access_token) — it returns the FIRST page Meta lists, NOT the workspace's page. The subsequent upsertMetaAccount({ channel:'facebook', pageId }) then retargets the workspace's facebook row (or inserts) to the wrong page_id, colliding with another workspace's facebook row on the uq_meta_page UNIQUE constraint (domain mapWriteError → the Spanish message). The code reviewer flagged this exact risk as IN-03 in 41-REVIEW.md; it was left as debt and reproduced live."
    evidence: "DB shows only 2 facebook rows, no instagram rows — the first upsert (facebook refresh) failed atomically before any IG write, so no DB corruption. getPageToken picks data[0]; old flow never re-picked the page."
    fix_direction: "Target the page already bound to the workspace: read the workspace's existing facebook page_id (resolveByWorkspace), then after the FB.login + exchangeForLongLivedUserToken, fetch the Page token FOR THAT SPECIFIC page_id (filter /me/accounts by the known pageId, or GET /{pageId}?fields=access_token), instead of getPageToken's first-page heuristic. Refresh + resolveInstagramAccount + IG upsert on that exact page. Preserve the clear Spanish 'Primero conecta tu página de Facebook' precheck when the workspace has no facebook row. Add a contract test: multi-page /me/accounts where data[0] != the workspace's page must NOT retarget the FB row and must use the workspace's page_id."
    files_implicated:
      - src/app/actions/meta-onboarding.ts (connectInstagramAccount — the only block to change)
      - src/lib/meta/messenger-connect.ts (may add a getPageTokenForPage(pageId) helper; do NOT change getPageToken's existing callers — Regla 6)
      - src/app/actions/__tests__/connect-instagram-oauth.test.ts (add the multi-page contract test)
    status: fixed (plan 41-09, shipped + live-verified 2026-06-05 — FB row 528898033801678 refreshed at 19:39 UTC)
  - id: GAP-41-02
    severity: blocking
    discovered: 2026-06-05 live test (post 41-09 deploy, Varixcenter)
    requirement: IG-03
    title: "Global uq_meta_page UNIQUE(page_id) blocks the Instagram row from sharing its Facebook Page's page_id"
    symptom: "After 41-09 fixed the page-targeting, 'Conectar Instagram' STILL returns 'Esta página ya está conectada en otro espacio de trabajo'. The facebook upsert now succeeds (FB row updated 2026-06-05 19:39 UTC) and resolveInstagramAccount succeeds (token carries IG scopes), but the channel='instagram' INSERT with page_id = the FB page collides with the existing facebook row on the GLOBAL uq_meta_page UNIQUE(page_id)."
    root_cause: "Phase 37 migration 20260401100000 created uq_meta_page as a table-wide UNIQUE(page_id). Phase 41 stores Instagram as a separate channel='instagram' row reusing the FB page's page_id (the IG sender needs creds.pageId — src/lib/channels/meta-instagram-sender.ts), which the global constraint forbids. No Phase 41 migration relaxed it. resolveByIgAccountId routes IG inbound by ig_account_id (not page_id), and uq_meta_ig keeps IG identity globally unique, so scoping uq_meta_page to channel='facebook' is safe."
    fix: "Migration supabase/migrations/20260605200000_relax_uq_meta_page_facebook_only.sql — DROP CONSTRAINT uq_meta_page; CREATE UNIQUE INDEX uq_meta_page ON workspace_meta_accounts(page_id) WHERE channel='facebook'. Index keeps the name so the domain mapWriteError Spanish mapping still fires on a genuine cross-workspace facebook collision. Applied to prod 2026-06-05 (Regla 5 — code already deployed, migration makes the live code succeed with no redeploy)."
    files_implicated:
      - supabase/migrations/20260605200000_relax_uq_meta_page_facebook_only.sql (the fix — DDL only, no app-code change needed)
    status: migration applied to prod 2026-06-05; awaiting live connect re-test
human_verification:
  - test: "Push Phase 41 commits to Vercel and confirm prod-migration applied (Regla 1 + Regla 5 HARD GATE)"
    expected: "All Phase 41 code is live on morfx.app. Prod Supabase has workspaces.instagram_provider column (DEFAULT 'manychat') and workspace_meta_accounts.ig_username column. SELECT instagram_provider, count(*) FROM workspaces GROUP BY instagram_provider returns a single row 'manychat | N' (zero meta_direct)."
    why_human: "Push has been deliberately withheld pending Regla 5 prod-migration operator confirmation. No code-level check can verify a live Supabase prod schema or confirm the push has occurred."
  - test: "Connect a real Instagram Professional account via the new 'Conectar Instagram' button (IG-03)"
    expected: "A workspace_meta_accounts row appears with channel='instagram', non-null ig_account_id, ig_username, and page_id. If the connected Page has no linked IG account, a clear Spanish error is shown ('vincula una cuenta de Instagram Profesional a tu página de Facebook')."
    why_human: "Requires a live Facebook Page with a linked Instagram Professional account, a browser session, and the Meta Graph API. Cannot be automated from the codebase."
  - test: "A1 linchpin: verify entry.id in the IG webhook payload equals the stored ig_account_id (routing correctness)"
    expected: "Server logs show inbound entry.id EXACTLY equals the ig_account_id stored in the previous step. If they differ, resolveByIgAccountId misses and IG routing is broken — must STOP and report."
    why_human: "Requires a live IG DM, access to server logs on the deployed Vercel instance, and comparing against the DB row. Cannot be verified statically."
  - test: "A2 linchpin: verify an IG DM fires the Meta webhook (subscription coverage)"
    expected: "An IG DM from a personal IG account to the connected IG Professional account arrives in the MorfX inbox. If no webhook fires, the existing Page subscribed_apps is insufficient and a per-account IG subscribe must be added to connectInstagramAccount."
    why_human: "Requires a real IG DM interaction, the Meta App Dashboard confirming 'instagram' webhook product / 'messages' field subscribed to https://www.morfx.app/api/webhooks/meta, and the Vercel logs. Cannot verify from code."
  - test: "Flip ONE test workspace to instagram_provider='meta_direct' and run inbound + outbound live smoke (IG-01, IG-02)"
    expected: "A live IG DM appears in the MorfX inbox as channel='instagram' with the Instagram indicator and a contact keyed on ig-${IGSID}. A human reply (text + image) is delivered in the IG DM thread. Somnio, godentist-fb-ig, and all other workspaces remain on instagram_provider='manychat'."
    why_human: "Requires manual SQL flip, a browser session in the MorfX inbox, a real IG DM thread, and confirmation of outbound delivery. Cannot be tested from the codebase."
  - test: "IG-05 outside-24h window block live verification"
    expected: "On a thread where the last inbound was >24h ago, an attempt to send is BLOCKED with 'Ventana de 24h cerrada. Activa el permiso Human Agent o espera a que el cliente escriba.' (the Spanish message wired in the action-layer gate). No message is delivered."
    why_human: "Requires a real conversation with a >24h gap (or a SQL backdating of last_customer_message_at), then a browser attempt to send. The gate is code-verified (grep + tests) but the live exercise confirms end-to-end behavior."
  - test: "Regla 6 live sanity: godentist-fb-ig and Somnio (manychat-based IG agents) continue to work"
    expected: "No behavior change in godentist-fb-ig or any workspace on instagram_provider='manychat' after the deploy."
    why_human: "Requires live traffic or manual test interaction through the ManyChat/godentist-fb-ig flow. Cannot verify from the codebase."
---

# Phase 41: Instagram Direct — Verification Report

**Phase Goal:** Workspaces can receive and respond to Instagram DMs directly in MorfX with clear visibility of the 24-hour messaging window, completing the tri-channel (WA + FB + IG) direct integration.

**Verified:** 2026-06-05T11:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Context

Phase 41 is at a **human-action cutover gate**. Plans 41-00 through 41-08 are all code-complete (commits on local main, NOT yet pushed). The autonomous portion of Plan 41-07 verified the full suite + Regla 6 byte-identical diff + IG-05 action-layer grep checks (PASS). The human-action portion — push to Vercel, prod-migration confirmation (Regla 5), 1-workspace SQL flip, A1/A2 linchpin smokes, and live IG DM smoke — is outstanding and constitutes human_verification items 1-7 above.

**Deferred by user decision (not gaps):**
- SC #4 visible 24h countdown: DEFERRED per D-IG-09 (V1 blocks with Spanish message only, no countdown).
- SC #5 AI agents on meta_direct IG: DEFERRED per D-IG-01 (V1 is human-inbox only).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | IG DMs received via the unified webhook endpoint are routed to the correct workspace by ig_account_id | ✓ VERIFIED | `resolveByIgAccountId(entry.id)` wired in `route.ts:200`; `processInstagramWebhook` dispatched at `:210`; 6/6 instagram-branch tests GREEN including routing by ig_account_id |
| 2 | Users can send text and images via Graph API from the MorfX inbox | ✓ VERIFIED | `metaInstagramSender.sendText` + `sendImage` + `sendMedia` in `meta-instagram-sender.ts:50-108`; domain chokepoint `readInstagramProvider` in `domain/messages.ts:97-106`; `sendInstagramText`/`sendInstagramImage` in `instagram-api.ts`; 11/11 sender tests + 9/9 domain tests GREEN |
| 3 | IG-scoped user IDs (IGSID) resolve to contacts or create new contacts by ig-${IGSID} identifier | ✓ VERIFIED | `resolveOrCreateContact` with `phoneIdentifier = 'ig-${igsid}'` in `webhook-handler.ts:88`; IGSID kept as STRING (Pitfall 3); name self-heal with `placeholderPrefix:'IG-'`; 8/8 webhook-handler tests GREEN |
| 4 | The inbox shows an "Instagram" channel indicator; conversations land as channel='instagram' | ✓ VERIFIED | `findOrCreateConversation` called with `channel:'instagram'` in `webhook-handler.ts:134`; the channel indicator is pre-existing and reused (verify-only per 41-06); Instagram tab in Configuración → Integraciones renders `ConnectInstagram` at `integraciones/page.tsx:232-252` |
| 5 | Outside-24h send is BLOCKED with a clear Spanish message (IG-05) | ✓ VERIFIED | `resolveMessengerWindowSend` reused at both gate sites in `actions/messages.ts` (6× `channel==='instagram'`; 5× `resolveMessengerWindowSend`; 9× `instagram_provider`); `window-gate.ts` returns `{ blocked: true, error: 'Ventana de 24h cerrada...' }` outside the 24h window; test coverage in `messages-instagram.test.ts` |
| 6 | MIG-02 implemented: per-workspace instagram_provider column separates IG and FB migration independently | ✓ VERIFIED | Migration `20260605120000_add_instagram_provider.sql` exists with `NOT NULL DEFAULT 'manychat'` + CHECK constraint; `readInstagramProvider` in domain; REGLA 5 header present; `ig_username` column added |
| 7 | Regla 6: ManyChat IG path and godentist-fb-ig are byte-identical vs pre-phase baseline | ✓ VERIFIED | `git diff 82d3e91b -- src/lib/channels/registry.ts` = EMPTY; `git diff 82d3e91b -- src/lib/channels/manychat-sender.ts` = EMPTY; `git diff 82d3e91b -- src/lib/agents/godentist-fb-ig/` = EMPTY; `grep -c metaInstagramSender src/lib/channels/registry.ts` = 0; `grep -c FB_LOGIN_SCOPE src/components/settings/connect-instagram.tsx` = 0 |
| 8 | "Conectar Instagram" button runs its OWN FB.login (IG_LOGIN_SCOPE + auth_type:'rerequest') with 3-step token refresh (D-IG-10/11/12) | ✓ VERIFIED | `IG_LOGIN_SCOPE` defined at `connect-instagram.tsx:62`; `auth_type:'rerequest'` at `:139`; `connectInstagramAccount({ accessToken })` runs `exchangeForLongLivedUserToken` → `getPageToken` → facebook-row refresh → `resolveInstagramAccount` → IG-row upsert → subscribe; 10/10 connect-instagram-oauth tests GREEN; `connect-facebook.tsx` git diff EMPTY (D-IG-11) |
| 9 | Live cutover: push to Vercel + prod-migration applied + 1-workspace flipped + A1/A2 smokes PASS | ? HUMAN NEEDED | Deliberately unpushed (Regla 1/5 gate). Requires operator to push, confirm prod migration, flip one workspace, and run live smoke. |
| 10 | Live send/receive + outside-24h block exercised on the test workspace | ? HUMAN NEEDED | Requires live IG DM thread. A1 (entry.id == ig_account_id) and A2 (webhook delivery) are MEDIUM-confidence items from RESEARCH that need live resolution. |

**Score:** 8/10 truths code-verified (2 require human live-smoke)

---

### Deferred Items

Items not yet met but explicitly scoped as deferred by user decision in D-IG-01 / D-IG-09 (documented in 41-CONTEXT.md and ROADMAP Phase 41 Note).

| # | Item | Addressed In | Evidence |
|---|------|-------------|---------|
| 1 | Visible 24h countdown timer in the inbox (ROADMAP SC #4) | Follow-up standalone (unscheduled) | ROADMAP Note: "Success criterion #4's visible 24h *countdown* is DEFERRED — V1 blocks outside-24h with the Spanish window-closed message (no countdown)." D-IG-09 in 41-CONTEXT.md. |
| 2 | AI agents respond to IG DMs via meta_direct (ROADMAP SC #5) | Follow-up standalone (unscheduled) | ROADMAP Note: "Success criterion #5 (AI agents on meta_direct IG) is DEFERRED — V1 is human-inbox only." D-IG-01 in 41-CONTEXT.md. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260605120000_add_instagram_provider.sql` | instagram_provider column + ig_username | ✓ VERIFIED | 19 lines; ADD COLUMN instagram_provider NOT NULL DEFAULT 'manychat' + CHECK; ADD COLUMN ig_username TEXT; REGLA 5 header |
| `src/lib/meta/instagram-api.ts` | IG-02 send payload shapes + getInstagramUserName | ✓ VERIFIED | 174 lines; sendInstagramText/sendInstagramImage/sendInstagramAttachment/getInstagramUserName all implemented |
| `src/lib/channels/meta-instagram-sender.ts` | ChannelSender adapter for IG | ✓ VERIFIED | 112 lines; sendText/sendImage/sendMedia implemented; creds typed {accessToken, pageId}; graceful unsupported type handling |
| `src/lib/meta/instagram-connect.ts` | resolveInstagramAccount | ✓ VERIFIED | 45 lines; resolves instagram_business_account off Page; throws Spanish error if no IG account linked |
| `src/lib/instagram/webhook-handler.ts` | processInstagramWebhook inbound handler | ✓ VERIFIED | 207 lines; IGSID as String; name self-heal with IG- prefix; resolveOrCreateContact; findOrCreateConversation channel='instagram'; human-only (no Inngest dispatch) |
| `src/lib/meta/credentials.ts` | resolveByIgAccountId | ✓ VERIFIED | resolveByIgAccountId(igAccountId) present at line 111; queries workspace_meta_accounts by ig_account_id |
| `src/lib/domain/meta-accounts.ts` | upsertMetaAccount extended with ig_account_id + ig_username | ✓ VERIFIED | igAccountId + igUsername params in both UPDATE and INSERT blocks |
| `src/lib/domain/messages.ts` | readInstagramProvider chokepoint + instagram arm | ✓ VERIFIED | readInstagramProvider at :97-106; instagram arm in sendTextMessage + sendMediaMessage; metaInstagramSender imported domain-direct |
| `src/app/actions/messages.ts` | IG-05 action-layer window gate at both gate sites | ✓ VERIFIED | 6× `channel==='instagram'`; 5× `resolveMessengerWindowSend`; 9× `instagram_provider` |
| `src/app/api/webhooks/meta/route.ts` | object==='instagram' branch routing by ig_account_id | ✓ VERIFIED | branch at :177; resolveByIgAccountId at :200; processInstagramWebhook dispatch at :210 |
| `src/components/settings/connect-instagram.tsx` | ConnectInstagram with dedicated IG FB.login (IG_LOGIN_SCOPE + rerequest) | ✓ VERIFIED | 189 lines; IG_LOGIN_SCOPE at :62; auth_type:'rerequest' at :139; calls connectInstagramAccount({ accessToken }); FB_LOGIN_SCOPE count = 0 |
| `src/app/actions/meta-onboarding.ts` | connectInstagramAccount({ accessToken }) 3-step token refresh | ✓ VERIFIED | 420 lines; exchangeForLongLivedUserToken → getPageToken → facebook-row upsert → resolveInstagramAccount → IG-row upsert → subscribe; owner-gated; never flips instagram_provider |
| `src/app/(dashboard)/configuracion/integraciones/page.tsx` | Instagram Direct tab | ✓ VERIFIED | TabsTrigger value='instagram' at :91; ConnectInstagram imported and rendered at :252 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` object==='instagram' | `processInstagramWebhook` | `resolveByIgAccountId(entry.id)` | ✓ WIRED | `:200` resolves creds by ig_account_id; `:210` dispatches to inbound handler |
| `processInstagramWebhook` | contact `ig-${IGSID}` | `resolveOrCreateContact(phoneIdentifier='ig-${igsid}')` | ✓ WIRED | `webhook-handler.ts:88,148` |
| `domain/messages.ts` instagram arm | `metaInstagramSender` | `readInstagramProvider` chokepoint | ✓ WIRED | `messages.ts:97-106` reads `instagram_provider`; `:295` + `:464` call metaInstagramSender |
| `actions/messages.ts` | IG-05 window gate | `resolveMessengerWindowSend` at 2 gate sites | ✓ WIRED | Both sendMessage and sendMediaMessage have the IG gate; returns `decision.error` on blocked |
| `connect-instagram.tsx` FB.login | `connectInstagramAccount({ accessToken })` | `handleConnect(accessToken)` → server action | ✓ WIRED | `:75-90` + `:139-145` |
| `connectInstagramAccount` | facebook-row Page token refresh | `upsertMetaAccount({ channel:'facebook', ... })` | ✓ WIRED | `meta-onboarding.ts:315` |
| `connectInstagramAccount` | IG-row upsert | `resolveInstagramAccount` → `upsertMetaAccount({ channel:'instagram', ... })` | ✓ WIRED | `meta-onboarding.ts:330,334` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `domain/messages.ts` sendTextMessage instagram arm | `metaInstagramSender.sendText` response | `readInstagramProvider` → `resolveByWorkspace`/`resolveByIgAccountId` → `instagram-api.ts` Graph POST | Yes — calls `POST /{pageId}/messages` Graph API | ✓ FLOWING |
| `instagram/webhook-handler.ts` | `igsid`, `profileName`, conversation + contact | `ev.sender.id` (live webhook payload) → `resolveOrCreateContact` → `receiveMessage` | Yes — DB writes through domain layer | ✓ FLOWING |
| `app/actions/messages.ts` window gate | `instagram_provider`, `last_customer_message_at` | `.select('settings, messenger_provider, instagram_provider')` + conversation data | Yes — reads live DB columns | ✓ FLOWING |
| `connect-instagram.tsx` | `accessToken` (user token) | `window.FB.login` callback → `connectInstagramAccount` | Yes — live OAuth grant from Facebook SDK | ✓ FLOWING (live only) |

---

### Behavioral Spot-Checks

Runnable code spot-checks limited to static grep/structural checks. Live endpoint and FB.login behavior cannot be tested without a running server and Meta app credentials.

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| 6 Phase 41 test files GREEN | `pnpm vitest run` (6 files) | 6 passed / 52 tests | ✓ PASS |
| IGSID stays string | `grep -n "String(ev.sender" webhook-handler.ts` | line 81: `String(ev.sender?.id ?? '')` | ✓ PASS |
| Instagram arm never in channel registry | `grep -c metaInstagramSender src/lib/channels/registry.ts` | 0 | ✓ PASS |
| Regla 6 byte-identical diffs | `git diff 82d3e91b -- registry.ts / manychat-sender.ts / godentist-fb-ig/` | All EMPTY | ✓ PASS |
| IG-05 gate pattern counts | `grep -c channel==='instagram' actions/messages.ts` | 6 (≥2) | ✓ PASS |
| tsc production files | `tsc --noEmit` (0 errors in non-test files) | 0 production errors (confirmed in 41-07) | ✓ PASS |
| Live IG DM inbound → inbox | Requires live webhook + Meta app | N/A | ? SKIP (human) |
| Outbound text+image delivery | Requires browser + IG thread | N/A | ? SKIP (human) |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| IG-01 | 41-01, 41-05, 41-07 | Recibir DMs de Instagram via webhook unificado | ✓ CODE-VERIFIED (live pending) | `object==='instagram'` branch in `route.ts`; `processInstagramWebhook` wired; 6/6 webhook route tests GREEN |
| IG-02 | 41-01, 41-02, 41-04, 41-07 | Enviar texto e imagenes via Graph API | ✓ CODE-VERIFIED (live pending) | `metaInstagramSender.sendText/sendImage/sendMedia`; domain arm wired; 11 sender + 9 domain tests GREEN |
| IG-03 | 41-01, 41-03, 41-05, 41-07, 41-08 | Resolucion IG-scoped user ID → contacto en MorfX | ✓ CODE-VERIFIED (live pending) | `resolveOrCreateContact` with `ig-${IGSID}`; connect chain with `resolveInstagramAccount`; name self-heal `'IG-'`; 8 webhook + 10 OAuth tests GREEN |
| IG-04 | 41-03, 41-04, 41-05, 41-06, 41-07, 41-08 | Inbox en MorfX para conversaciones de Instagram | ✓ CODE-VERIFIED (live pending) | `channel='instagram'` in findOrCreateConversation; Instagram tab in /configuracion/integraciones with ConnectInstagram; channel indicator pre-existing (reused) |
| IG-05 | 41-04, 41-07 | UX clara de "ventana expirada" (hard 24h, sin templates) | ✓ CODE-VERIFIED (live pending) | `resolveMessengerWindowSend` at both action-layer gate sites; returns Spanish BLOCK_MESSAGE outside 24h; manychat path bypasses the gate |
| MIG-02 | 41-00, 41-04 | Feature flag per-workspace instagram_provider ('meta_direct'|'manychat') | ✓ CODE-VERIFIED (prod-apply pending) | Migration authored; `readInstagramProvider` chokepoint in domain; DEFAULT 'manychat' (Regla 6) |

**Note on REQUIREMENTS.md traceability table:** The table still shows IG-01 through IG-03, IG-05, and MIG-02 as "Pending". These are code-complete but awaiting the live cutover. IG-04 is already marked Complete in the table. The table should be updated when the live smoke passes.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/instagram/webhook-handler.ts` | 91, 158, 161, 167 | "placeholder" keyword | ℹ️ Info | These are references to the self-heal pattern (`IG-${igsid}` placeholder name, `healPlaceholderContactName`, `placeholderPrefix:'IG-'`) — not stub code. The logic is complete and functional. |

No blockers found. No stubs. No empty returns in production paths. No `createAdminClient` in Instagram module production files (the one match is `vi.fn()` in a test file).

---

### Human Verification Required

#### 1. Push to Vercel + confirm prod-migration (Regla 1 + Regla 5 HARD GATE)

**Test:** Operator confirms `workspaces.instagram_provider` column is applied in prod Supabase (GROUP BY shows single 'manychat' row, 0 'meta_direct'), then pushes local commits to `origin/main`.

**Expected:** `SELECT instagram_provider, count(*) FROM workspaces GROUP BY instagram_provider` returns `manychat | N` (zero meta_direct). `git log origin/main -1` shows Phase 41 cutover commit after push.

**Why human:** Prod schema cannot be verified from code; push is deliberately withheld (41-08 SUMMARY explicitly states "NOT pushed — Regla 1/5").

#### 2. Conectar Instagram via new UI (IG-03 connect path)

**Test:** In a test workspace whose Facebook Page has a linked IG Professional account, click "Conectar Instagram" in Configuración → Integraciones → Instagram.

**Expected:** `workspace_meta_accounts` row appears with `channel='instagram'`, non-null `ig_account_id` and `ig_username`. If no IG account is linked, the Spanish error "vincula una cuenta de Instagram Profesional a tu página de Facebook" is shown.

**Why human:** Requires real Facebook SDK, Meta OAuth, and a live Supabase insert.

#### 3. A1 linchpin — entry.id == ig_account_id routing check

**Test:** Inspect server logs for the first inbound IG DM after connect. Confirm `entry.id` in the webhook payload EXACTLY equals the `ig_account_id` stored in the previous step.

**Expected:** Match. If mismatch: routing fails (resolveByIgAccountId returns null, IG DM is dropped). STOP if mismatch — this is the single critical routing invariant.

**Why human:** Requires live webhook payload from Meta, server log access, and DB comparison.

#### 4. A2 linchpin — webhook delivery (subscription coverage)

**Test:** Send an IG DM from a personal Instagram account to the connected IG Professional account. Confirm it appears in the MorfX inbox (or server logs show the inbound was received).

**Expected:** IG DM fires the `object==='instagram'` webhook. If NO webhook fires: confirm the Meta App Dashboard has the `instagram` webhook product with `messages` field subscribed to `https://www.morfx.app/api/webhooks/meta`. If still no delivery: add per-account IG subscribe in `connectInstagramAccount` (mirror `subscribeMessengerPage`).

**Why human:** Requires live Meta webhook delivery, App Dashboard config, and server log inspection.

#### 5. Flip 1 workspace + live inbound/outbound smoke (IG-01, IG-02)

**Test:** `UPDATE workspaces SET instagram_provider='meta_direct' WHERE id='<TEST_UUID>'`. Then send a real IG DM and reply from the MorfX inbox (text + image).

**Expected:** IG DM appears in inbox as `channel='instagram'` with Instagram indicator. Reply text delivered in IG thread. Reply image (+ caption) delivered. `SELECT instagram_provider, count(*) FROM workspaces GROUP BY instagram_provider` shows exactly 1 `meta_direct`, all others `manychat` (including godentist-fb-ig workspace `f0241182-...`).

**Why human:** Requires SQL flip, browser session, live IG DM interaction, and outbound delivery confirmation.

#### 6. Outside-24h window block (IG-05)

**Test:** On a thread where `last_customer_message_at` is >24h ago (or backdated via SQL: `UPDATE conversations SET last_customer_message_at = NOW() - INTERVAL '25 hours' WHERE ...`), attempt to send a message with `META_HUMAN_AGENT_ENABLED=false` (default).

**Expected:** Send is BLOCKED with the Spanish message "Ventana de 24h cerrada. Activa el permiso Human Agent o espera a que el cliente escriba." No message is delivered.

**Why human:** Requires a real >24h-old conversation (or SQL backdating) and a browser send attempt. The gate is code-verified but the live exercise confirms the end-to-end block.

#### 7. Regla 6 sanity — godentist-fb-ig and ManyChat IG paths unaffected

**Test:** Confirm a normal ManyChat-based IG interaction (e.g. godentist-fb-ig on workspace `f0241182-...`) still works unchanged after the deploy.

**Expected:** No behavior change. The ManyChat sender remains the active path for all workspaces where `instagram_provider='manychat'`.

**Why human:** Requires live traffic or manual test through the godentist-fb-ig flow.

---

### Gaps Summary

No code-level gaps found. All 8 code-verifiable must-haves PASS. The 2 outstanding items (truths #9 and #10) are live cutover/human-action items that are expected at this stage of the phase lifecycle:

- All Phase 41 production files are substantive (174–420 lines), fully wired, and data-flowing.
- 52/52 tests across 6 files GREEN.
- Regla 6 byte-identical diffs confirmed for all three protected files.
- No stubs, no empty implementations, no createAdminClient in production Instagram module code.
- The "Conectar Instagram" connect path gap (41-08) is fully fixed with a dedicated IG FB.login, 3-step token refresh, and contract tests.
- The remaining work is 100% operator/human action: push to Vercel, confirm prod migration, live smoke.

**When the human verification items pass, phase status upgrades to `passed`.**

---

_Verified: 2026-06-05T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
