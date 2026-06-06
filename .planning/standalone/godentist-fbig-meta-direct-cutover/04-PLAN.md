---
phase: godentist-fbig-meta-direct-cutover
plan: 04
type: execute
wave: 3
depends_on: [03]
files_modified: []
autonomous: false
requirements: [D-07, D-09, D-10, OQ-8]
must_haves:
  truths:
    - "GoDentist (36a74890), Somnio (a3843b3f), Pruebas (4b5d84dd) have messenger_provider=meta_direct AND instagram_provider=meta_direct"
    - "WhatsApp provider of all 3 is UNTOUCHED (Somnio is productive — D-10)"
    - "No workspace anywhere has messenger_provider='manychat' or instagram_provider='manychat'"
  artifacts:
    - path: "(runtime) workspaces providers"
      provides: "All 4 ManyChat workspaces re-pointed to meta_direct"
  key_links:
    - from: "re-point SQL"
      to: "OQ-7 enum migration eligibility (Plan 06)"
      via: "no row left on manychat"
      pattern: "meta_direct"
---

<objective>
BLOCK B START — re-point the 3 dormant ManyChat workspaces off `manychat` to `meta_direct` (D-09, OQ-8). Runs only AFTER the D-08 checkpoint (Plan 03 Task 7) authorized Block B. This turns off their inbound-via-ManyChat path. None of the 3 has an FB/IG agent sending, so OUTBOUND does not apply (a human reply attempt would get "Credenciales Meta no configuradas" — acceptable per OQ-8; these have ~0 traffic).

Regla 5: this is a prod data change — operator applies the SQL directly; no code depends on it yet, but it is the precondition for the OQ-7 enum migration (Plan 06). Regla 6 / D-10: WhatsApp provider of all 3 MUST stay untouched (Somnio is a productive workspace; its WhatsApp agents v3/recompra/pw-confirmation/v4 are 360dialog and channel-agnostic).

Workspace UUIDs (RESEARCH A1, grounded in prod):
- GoDentist: `36a74890-aad6-4804-838c-57904b1c9328`
- Somnio: `a3843b3f-c337-4836-92b5-89c58bb98490`
- Pruebas Morfx: `4b5d84dd-1b46-4e8c-8acf-3869c037198f`

Purpose: remove the last manychat-provider rows so the codebase deletion (Plan 05) + enum drop (Plan 06) are safe.
Output: all 4 ManyChat workspaces on meta_direct; WhatsApp untouched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md
@.planning/standalone/godentist-fbig-meta-direct-cutover/CONTEXT.md
@CLAUDE.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Verify Block B authorized + capture pre-change provider snapshot</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/03-SUMMARY.md (confirm D-08 checkpoint = "proceed")
  </read_first>
  <what-built>
    Confirm Plan 03 Task 7 was authorized ("proceed"). Capture the current provider state of all workspaces so the change is auditable and reversible-if-needed-before-deletion.
  </what-built>
  <how-to-verify>
    Run (read-only, prod):
    ```sql
    SELECT id, name, messenger_provider, instagram_provider, whatsapp_provider
    FROM workspaces
    ORDER BY name;
    ```
    Record the output. Expect Valoraciones already meta_direct (Plan 03); the other 3 still 'manychat' for messenger+instagram; whatsapp varies (do NOT change whatsapp).
  </how-to-verify>
  <resume-signal>Type "snapshot-captured" with the pre-change rows pasted, once D-08 = proceed is confirmed.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Re-point the 3 dormant workspaces to meta_direct (Regla 5 SQL; WhatsApp untouched)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md §RE-POINT (OQ-8) + §OQ-8 answer (meta_direct without creds is graceful)
    - CLAUDE.md Regla 5 + Regla 6 (D-10 Somnio)
  </read_first>
  <what-built>
    A single UPDATE re-points messenger + instagram providers for the 3 dormant workspaces. The domain handles meta_direct-without-creds gracefully (messages.ts:264-267/291-294 returns "Credenciales Meta no configuradas", no crash — RESEARCH OQ-8).
  </what-built>
  <how-to-verify>
    1. Apply in prod (operator runs directly — Regla 5):
       ```sql
       UPDATE workspaces
       SET messenger_provider = 'meta_direct', instagram_provider = 'meta_direct'
       WHERE id IN (
         '36a74890-aad6-4804-838c-57904b1c9328',
         'a3843b3f-c337-4836-92b5-89c58bb98490',
         '4b5d84dd-1b46-4e8c-8acf-3869c037198f'
       );
       -- whatsapp_provider intentionally NOT in the SET list (Regla 6, D-10).
       ```
    2. Verify NO workspace anywhere is still on manychat (the precondition for Plan 06):
       ```sql
       SELECT COUNT(*) AS manychat_rows FROM workspaces
       WHERE messenger_provider = 'manychat' OR instagram_provider = 'manychat';
       -- Expected: 0
       ```
    3. Verify WhatsApp providers of the 3 are unchanged vs the Task 1 snapshot (D-10 — especially Somnio):
       ```sql
       SELECT id, messenger_provider, instagram_provider, whatsapp_provider
       FROM workspaces
       WHERE id IN ('36a74890-aad6-4804-838c-57904b1c9328','a3843b3f-c337-4836-92b5-89c58bb98490','4b5d84dd-1b46-4e8c-8acf-3869c037198f');
       -- Expected: messenger+instagram=meta_direct for all 3; whatsapp_provider matches the snapshot.
       ```
  </how-to-verify>
  <resume-signal>Type "repointed" once manychat_rows=0 AND the 3 WhatsApp providers match the pre-change snapshot.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Regla 6 — confirm no Somnio agent / WhatsApp regression (D-10)</name>
  <read_first>
    - CLAUDE.md §Somnio agents (sales-v3, recompra, pw-confirmation, v4 — all WhatsApp/360dialog)
  </read_first>
  <what-built>
    Somnio is productive. The provider change only touched its (dormant) FB/IG providers. Verify its WhatsApp agents are unaffected.
  </what-built>
  <how-to-verify>
    1. Confirm Somnio `whatsapp_provider` is unchanged (from Task 2 step 3).
    2. Confirm a Somnio WhatsApp conversation still routes/responds normally (send a test WhatsApp message to the Somnio number, or confirm with the operator that the live Somnio WhatsApp agent is unaffected — its routing rules are WhatsApp/channel-based and were not touched).
    3. Confirm Somnio had no active FB/IG routing rule (so nothing depended on the FB/IG provider): 
       ```sql
       SELECT name, conditions, event FROM routing_rules
       WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490' AND active = true;
       -- Expected: only WhatsApp/channel-agnostic rules; no facebook/instagram-only agent rule.
       ```
  </how-to-verify>
  <resume-signal>Type "somnio-clean" once Somnio WhatsApp is confirmed unaffected (D-10 satisfied).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| provider re-point → productive Somnio | A provider change on a productive workspace risks collateral on its live (WhatsApp) agents |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cut-10 | Availability | Somnio WhatsApp regression | mitigate | UPDATE excludes whatsapp_provider; Task 3 verifies Somnio WhatsApp unaffected (D-10) |
| T-cut-11 | Availability | meta_direct without creds crash | accept | Domain returns graceful "Credenciales Meta no configuradas" (RESEARCH OQ-8); 0 traffic on these 3 |
</threat_model>

<verification>
- `SELECT COUNT(*) FROM workspaces WHERE messenger_provider='manychat' OR instagram_provider='manychat'` returns 0
- The 3 workspaces' whatsapp_provider matches the pre-change snapshot (Regla 6 / D-10)
- Somnio WhatsApp unaffected
</verification>

<success_criteria>
- All 4 ManyChat workspaces re-pointed to meta_direct.
- No row left on manychat (precondition for Plan 06 enum migration).
- WhatsApp untouched for all 3 (D-10).
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-fbig-meta-direct-cutover/04-SUMMARY.md`
</output>
