---
phase: godentist-fbig-meta-direct-cutover
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified: []
autonomous: false
requirements: [D-04, D-05, D-06, D-08, OQ-1, Pitfall-1, Pitfall-2, Pitfall-5]
must_haves:
  truths:
    - "GoDentist Valoraciones receives FB + IG via Meta Direct (workspace_meta_accounts rows exist)"
    - "messenger_provider + instagram_provider = meta_direct for f0241182-...; whatsapp_provider UNCHANGED (360dialog)"
    - "godentist-fb-ig responds to a real FB and a real IG DM via Meta transport (verified live)"
    - "ManyChat page + IG of Valoraciones disconnected; manychat keys deleted from settings (D-06)"
  artifacts:
    - path: "(runtime) workspace_meta_accounts"
      provides: "FB + IG connection rows for f0241182-..."
    - path: "(runtime) workspaces.messenger_provider / instagram_provider"
      provides: "meta_direct flip for Valoraciones"
  key_links:
    - from: "Meta webhook subscription"
      to: "processMessengerWebhook / processInstagramWebhook → agent dispatch (Plan 02)"
      via: "page subscribed in Meta App"
      pattern: "meta_direct"
---

<objective>
THE CUTOVER RUNBOOK + D-08 SAFETY CHECKPOINT (operational, autonomous:false). This plan moves GoDentist Valoraciones FB + IG from ManyChat to Meta Direct, verifies `godentist-fb-ig` responds LIVE via Meta, and is the explicit gate that MUST pass before any Block B code deletion (Plans 04-06).

This is a runbook of operator + verification steps. Block A code (Plans 01 + 02) MUST already be DEPLOYED to Vercel production before starting — the provider-aware key patches (Plan 01) prevent the bot going mute, and the inbound wire (Plan 02) makes the agent respond via Meta.

**Rollback before this checkpoint completes:** re-flip providers to `manychat` + reconnect ManyChat (Block B code is still alive). **After this checkpoint:** the manychat rollback no longer applies — Block B deletions are the deliberate point of no return (D-08).

Reference values (HANDOFF.md):
- Workspace: `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`
- Verify token (prod env META_WEBHOOK_VERIFY_TOKEN): `morfx_meta_60b065195e017e50c14d77e9f913c417`
- Webhook URL: `https://www.morfx.app/api/webhooks/meta` (www, NOT apex)
- Agent: `godentist-fb-ig` (routing rule priority 100, channel in [facebook,instagram] — already exists)
- Rollback: re-flip providers to manychat + reconnect ManyChat

Purpose: live cutover with anti-double-response sequencing (D-04/D-05).
Output: Valoraciones LIVE on Meta Direct; verified; ManyChat disconnected; keys deleted.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-fbig-meta-direct-cutover/CONTEXT.md
@.planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md
@.planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md
@CLAUDE.md
@.claude/rules/agent-scope.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Confirm Block A deployed + prod pre-check lifecycle_routing_enabled (Pitfall 1 + Pitfall 2)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/01-SUMMARY.md (confirm Plan 01 shipped + deployed)
    - .planning/standalone/godentist-fbig-meta-direct-cutover/02-SUMMARY.md (confirm Plan 02 shipped + deployed)
    - .claude/rules/agent-scope.md §Godentist FB/IG Sibling Agent (the SQL pre-check)
  </read_first>
  <what-built>
    Plans 01 (provider-aware key patches) + 02 (inbound wire) — confirm both are committed AND pushed to origin/main (Vercel deployed). This is the hazard guard: if the key patch is NOT live, deleting the manychat key in Task 6 mutes the bot (Pitfall 2).
  </what-built>
  <how-to-verify>
    1. Confirm Plans 01 + 02 are pushed to origin/main and the Vercel deployment for that commit is "Ready". `git log --oneline origin/main -5` should show the Plan 01/02 commits.
    2. Run the prod pre-check SQL (read-only) — RESEARCH A1 says this is already `true`, but re-verify (Pitfall 1):
       ```sql
       SELECT lifecycle_routing_enabled, conversational_agent_id
       FROM workspace_agent_config
       WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       -- Expected: lifecycle_routing_enabled = true, conversational_agent_id = 'godentist'
       ```
       If `lifecycle_routing_enabled` is false → the channel routing rule never fires and FB/IG would fall back to `godentist` (WhatsApp). Enable it:
       ```sql
       UPDATE workspace_agent_config SET lifecycle_routing_enabled = true
       WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       ```
    3. Confirm the routing rule exists + active:
       ```sql
       SELECT name, priority, conditions, event, active FROM routing_rules
       WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514' AND active = true ORDER BY priority;
       -- Expected: a rule with conditions channel in [facebook,instagram] → agent_id godentist-fb-ig
       ```
  </how-to-verify>
  <resume-signal>Type "block-a-live" once both deployments are Ready AND lifecycle_routing_enabled=true confirmed in prod.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Connect Facebook page of GoDentist Valoraciones (Meta Direct)</name>
  <read_first>
    - src/app/actions/meta-onboarding.ts (ConnectFacebook action — connect flow)
    - .planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md (multi-page handling, GAP-41-01/09)
  </read_first>
  <what-built>
    The Connect Facebook flow (meta-onboarding.ts, proven with Varixcenter in Phase 40) creates a `workspace_meta_accounts channel='facebook'` row for the chosen page and subscribes the webhook. No FB row exists for this workspace yet.
  </what-built>
  <how-to-verify>
    1. Log into MorfX in the GoDentist Valoraciones workspace, as a user who is admin of the GoDentist Facebook page.
    2. Go to Configuración → Integraciones → Connect Facebook. Select the CORRECT GoDentist page (multi-page — choose carefully; GAP-41-01/09 handles multi-page).
    3. Verify the row was created (full UUID page-scoped):
       ```sql
       SELECT channel, page_id, ig_account_id FROM workspace_meta_accounts
       WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       -- Expected: one row channel='facebook' with the correct page_id.
       ```
  </how-to-verify>
  <resume-signal>Type "fb-connected" with the page_id once the facebook workspace_meta_accounts row exists.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Connect Instagram of GoDentist Valoraciones (Meta Direct)</name>
  <read_first>
    - src/app/actions/meta-onboarding.ts (ConnectInstagram action)
    - .planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md (IG shares page_id; uq_meta_page partial allows it — GAP-41-02)
  </read_first>
  <what-built>
    Connect Instagram (same panel) creates a `channel='instagram'` row (shares the page_id; the partial unique index permits FB + IG on the same page — GAP-41-02).
  </what-built>
  <how-to-verify>
    1. Same panel → Connect Instagram → select the IG professional account linked to the GoDentist page.
    2. Verify:
       ```sql
       SELECT channel, page_id, ig_account_id FROM workspace_meta_accounts
       WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       -- Expected: now TWO rows — channel='facebook' AND channel='instagram' (with ig_account_id set).
       ```
  </how-to-verify>
  <resume-signal>Type "ig-connected" with the ig_account_id once the instagram row exists.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Flip providers to meta_direct (Regla 5 — apply SQL in prod; WhatsApp UNTOUCHED)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md (grounded facts: whatsapp_provider=360dialog, must NOT change)
    - CLAUDE.md Regla 5 (migración/SQL antes de deploy) + Regla 6 (WhatsApp untouched)
  </read_first>
  <what-built>
    The provider flip redirects OUTBOUND for FB/IG to the Meta sender immediately (the domain chokepoint reads messenger_provider/instagram_provider). The provider-aware key patch (Plan 01) is already live so the agent does not go mute.
  </what-built>
  <how-to-verify>
    1. Apply the flip in prod (Regla 5 — operator runs this SQL directly against prod):
       ```sql
       UPDATE workspaces
       SET messenger_provider = 'meta_direct', instagram_provider = 'meta_direct'
       WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       ```
    2. Verify WhatsApp is UNTOUCHED (Regla 6 — D-10):
       ```sql
       SELECT id, messenger_provider, instagram_provider, whatsapp_provider
       FROM workspaces WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       -- Expected: messenger_provider=meta_direct, instagram_provider=meta_direct, whatsapp_provider=360dialog
       ```
  </how-to-verify>
  <resume-signal>Type "providers-flipped" once messenger+instagram=meta_direct AND whatsapp_provider=360dialog confirmed.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 5: Subscribe the page in the Meta App + verify godentist-fb-ig responds LIVE via Meta (D-04 step 4)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md (verify token, webhook URL)
  </read_first>
  <what-built>
    Webhook URL `https://www.morfx.app/api/webhooks/meta` with verify token `morfx_meta_60b065195e017e50c14d77e9f913c417`. With FB+IG connected, providers flipped, and Plan 02 wire live, an inbound DM should reach `processMessengerWebhook`/`processInstagramWebhook` → agent dispatch → `godentist-fb-ig` reply via the Meta sender.
  </what-built>
  <how-to-verify>
    1. In the Meta App dashboard, confirm the GoDentist page is added to the App with webhook fields `messages` (Messenger) + `messages` (Instagram) subscribed. If not, subscribe it.
    2. From a TEST personal account (not the page), send a FB Messenger DM to the GoDentist page. Confirm:
       - The DM appears in the MorfX inbox (stored).
       - `godentist-fb-ig` replies (lead-capture saludo) — the reply arrives in Messenger via Meta.
    3. Repeat from a test account via Instagram Direct to the GoDentist IG account — confirm the agent replies.
    4. Confirm the reply went via Meta (not ManyChat): check the outbound message row / Meta sender logs. No "Channel API key not configured" log should appear (that would mean Plan 01 is not live — STOP and rollback).
  </how-to-verify>
  <resume-signal>Type "live-verified" once BOTH a FB DM and an IG DM got an agent reply via Meta. If the bot is mute → type "mute" and we rollback (re-flip providers to manychat).</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 6: Disconnect ManyChat for Valoraciones + delete its manychat keys (D-04 step 5, D-05, D-06)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md §Pitfall 5 (overlap double-response)
  </read_first>
  <what-built>
    Immediately after live verification, disconnect ManyChat to close the brief overlap window (Pitfall 5 — ManyChat's own flow could auto-reply). Delete the manychat keys from this workspace's settings (D-06).
  </what-built>
  <how-to-verify>
    1. In the ManyChat dashboard, disconnect the GoDentist Facebook page AND the Instagram account so ManyChat stops receiving/responding to those DMs. Do this within the same maintenance window as Task 5 (immediacy mitigates double-response — D-05).
    2. Delete the manychat keys from the workspace settings (D-06 — run in prod):
       ```sql
       UPDATE workspaces
       SET settings = settings - 'manychat_api_key' - 'manychat_webhook_secret'
       WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       ```
    3. Verify the keys are gone AND whatsapp_api_key remains:
       ```sql
       SELECT settings ? 'manychat_api_key' AS has_mc_key,
              settings ? 'manychat_webhook_secret' AS has_mc_secret,
              settings ? 'whatsapp_api_key' AS has_wa_key
       FROM workspaces WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
       -- Expected: has_mc_key=false, has_mc_secret=false, has_wa_key=true
       ```
    4. Send one more test FB + IG DM and confirm only ONE agent reply (no ManyChat double-reply) and the agent STILL responds (proves Plan 01 patch holds after key deletion).
  </how-to-verify>
  <resume-signal>Type "manychat-disconnected" once ManyChat is disconnected, keys deleted, and a post-deletion test DM still gets exactly one Meta reply.</resume-signal>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 7: D-08 CHECKPOINT — authorize Block B (point of no return)</name>
  <decision>
    Block A cutover of GoDentist Valoraciones is verified LIVE on Meta Direct. Block B (Plans 04-06) deletes all ManyChat code/keys/env/table — this is HARD to revert (D-08 point of no return). Authorize proceeding to Block B, or hold.
  </decision>
  <context>
    Before this point, rollback = re-flip providers to manychat + reconnect ManyChat (code alive). After authorizing Block B, that rollback no longer applies (the manychat code is being deleted deliberately per D-07). The other 3 dormant workspaces (GoDentist 36a74890, Somnio a3843b3f, Pruebas 4b5d84dd) will be re-pointed off manychat in Plan 04 and lose FB/IG-via-ManyChat (user accepted — D-07/D-09; Somnio WhatsApp untouched — D-10).
  </context>
  <options>
    <option id="proceed">
      <name>Proceed to Block B</name>
      <pros>Completes the user's goal (ManyChat out of the codebase); Valoraciones already verified LIVE</pros>
      <cons>Point of no return — manychat rollback no longer available</cons>
    </option>
    <option id="hold">
      <name>Hold / soak</name>
      <pros>Keep manychat rollback available while Valoraciones soaks on Meta for a period</pros>
      <cons>ManyChat code stays in the codebase longer</cons>
    </option>
  </options>
  <resume-signal>Select: "proceed" (authorize Plans 04-06) or "hold" (stop here; resume Block B later).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ManyChat ↔ Meta overlap window | Both transports briefly active for the same DM during cutover (Task 5→6) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cut-07 | Availability/Tampering | Double-response during overlap | mitigate | Provider flip redirects outbound to Meta immediately + immediate ManyChat disconnect (D-04/D-05, Pitfall 5) |
| T-cut-08 | Availability | Bot mute after key deletion | mitigate | Plan 01 deployed BEFORE this plan (Pitfall 2); Task 6 step 4 re-tests after deletion |
| T-cut-09 | Tampering | Wrong page/IG connected (multi-page) | mitigate | SQL verification of page_id/ig_account_id rows (Tasks 2-3) |
</threat_model>

<verification>
- workspace_meta_accounts has facebook + instagram rows for f0241182-...
- workspaces: messenger_provider=meta_direct, instagram_provider=meta_direct, whatsapp_provider=360dialog
- A live FB DM and a live IG DM both get a single godentist-fb-ig reply via Meta
- manychat_api_key + manychat_webhook_secret removed from settings; whatsapp_api_key present
- ManyChat dashboard: GoDentist page + IG disconnected
</verification>

<success_criteria>
- GoDentist Valoraciones FB + IG fully on Meta Direct with the agent responding.
- WhatsApp untouched (360dialog).
- ManyChat disconnected + keys deleted for this workspace.
- D-08 checkpoint authorized (or held).
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-fbig-meta-direct-cutover/03-SUMMARY.md`
</output>
