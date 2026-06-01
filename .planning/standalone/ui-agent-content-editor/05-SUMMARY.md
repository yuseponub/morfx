---
phase: ui-agent-content-editor
plan: 05
subsystem: server-actions
tags: [server-actions, admin-gate, zod, regla-3, knowledge-sync-guard, somnio-v4]
requires:
  - "agent-templates.ts domain (Plan 03 — listTemplatesByAgent, listIntents, updateTemplateContent, addTemplate, deleteTemplate, reorderTemplates)"
  - "agent-knowledge-base.ts domain (Plan 04 — listKbByAgent, getKbTopic, createKbTopic, updateKbTopic, deleteKbTopic, listKbVersions, searchKbVersions, restoreKbVersion)"
  - "agent-config.ts getAuthContext + isWorkspaceAdmin pattern"
  - "RED stub scripts/__tests__/knowledge-sync-guard.test.ts (Plan 01)"
provides:
  - "src/app/actions/agent-content-editor.ts — 14 server actions (templates + KB), admin-gated, zod-validated, domain-only"
  - "scripts/knowledge-sync.ts guarded against clobbering the DB (shouldAbortSync helper)"
  - "D-01 guard comment on knowledge-sync-v4.ts Inngest function"
affects:
  - "future UI (Plans 06/07) wires the editor to these server actions"
tech-stack:
  added: []
  patterns:
    - "auth+admin boundary in server action, domain delegation only (Regla 3 — 0 createAdminClient)"
    - "zod safeParse on every mutating input BEFORE domain delegation (V5)"
    - "workspaceId from morfx_workspace cookie + session, never from input (T-UICE05-04)"
    - "domain error surfaced verbatim (D-06 OpenAI re-embed failure -> UI 'reintenta')"
    - "pure-decision extract (shouldAbortSync) + CLI-only main() guard for testability"
    - "initial-import-only sync guard with --force override (D-01 / Pitfall 4)"
key-files:
  created:
    - "src/app/actions/agent-content-editor.ts"
  modified:
    - "scripts/knowledge-sync.ts"
    - "scripts/__tests__/knowledge-sync-guard.test.ts"
    - "src/inngest/functions/knowledge-sync-v4.ts"
decisions:
  - "scripts/knowledge-sync.ts retains createAdminClient for the v4-row count query — documented CLI exception (same class as the existing file), NOT an app-layer Regla 3 breach. The app-layer action file has 0 createAdminClient."
metrics:
  duration: "~12min"
  completed: "2026-06-01"
  tasks: 4
  files: 4
---

# Phase ui-agent-content-editor Plan 05: Server Actions + knowledge:sync Guard Summary

Admin-gated, zod-validated, domain-only server-action layer (Regla 3) for the v4 template + KB editor, plus a D-01 guard that stops `knowledge:sync` from silently reverting UI edits with stale `.md`.

## What Was Built

`src/app/actions/agent-content-editor.ts` (14 server actions, `'use server'`, 0 createAdminClient):

- **Template reads (member):** `getTemplatesAction`, `getIntentsAction`.
- **Template mutations (admin only, D-07):** `updateTemplateAction`, `addTemplateAction`, `deleteTemplateAction`, `reorderTemplatesAction`.
- **KB reads (member):** `getKbListAction`, `getKbTopicAction`, `listKbVersionsAction`, `searchKbVersionsAction`.
- **KB mutations (admin only, D-07):** `createKbTopicAction`, `updateKbTopicAction`, `deleteKbTopicAction`, `restoreKbVersionAction`.

Every action calls `getAuthContext()` (session + `morfx_workspace` cookie); every mutating action additionally calls `isWorkspaceAdmin()` (owner/admin) before delegating. Every mutating input is `zod.safeParse`'d before delegation (V5). The DomainContext carries `source:'server-action'` + `actorLabel:'user:'+id`; KB create/update/restore pass `reviewedBy:'user:'+id`. The D-06 OpenAI re-embed failure error from the domain is surfaced verbatim so the UI can show "reintenta".

`scripts/knowledge-sync.ts` — guarded:
- New exported pure helper `shouldAbortSync(existingCount, force)` = `existingCount > 0 && !force`.
- `main()` parses `--force` (or `--seed`), counts v4 rows in `agent_knowledge_base` (scoped to `somnio-sales-v4` + Somnio workspace) BEFORE walking the `.md`, and on `shouldAbortSync` prints a loud D-01 / "fuente de verdad" warning + `process.exit(1)`.
- `--force` with a non-empty DB prints `[knowledge:sync] --force: overwriting DB from .md (D-01 override)` then proceeds.
- `main()` only runs when invoked as a CLI (`process.argv[1]?.endsWith('knowledge-sync.ts')`), so importing the module for the test does not run the sync.

`src/inngest/functions/knowledge-sync-v4.ts` — added a prominent D-01 guard comment above the flag check (gating logic unchanged; it already no-ops when off). Flag key `somnio_v4_kb_sync_enabled` intact.

`scripts/__tests__/knowledge-sync-guard.test.ts` — RED→GREEN, 3 real assertions (no `it.todo`): `(18,false)=true`, `(18,true)=false`, `(0,false)=false`.

## Verification

- `npx vitest run scripts/__tests__/knowledge-sync-guard.test.ts` → 3 passed.
- `grep -c createAdminClient src/app/actions/agent-content-editor.ts` → 0 (Regla 3).
- `grep -c isWorkspaceAdmin src/app/actions/agent-content-editor.ts` → 10 (≥9: 5 template + 4 KB mutating + helper decl).
- `grep -c "--force" scripts/knowledge-sync.ts` → 7 (≥1).
- `npx tsc --noEmit` → clean for all four files.

## Deviations from Plan

None — plan executed as written. One plan-anticipated nuance worth noting: the plan's acceptance for Task 1 requires `grep -c createAdminClient == 0` in the actions file, so the header comment was worded to avoid the literal string ("never instantiates the admin Supabase client") — substance unchanged. The `createAdminClient` in `scripts/knowledge-sync.ts` is the plan-sanctioned CLI exception (D-01 count query), explicitly allowed in the Task 3 action text.

## Threat Model Coverage

- T-UICE05-01 (EoP): `isWorkspaceAdmin` gate on all 8 mutating actions (grep=10).
- T-UICE05-02 (Tampering): `zod.safeParse` on every mutating input.
- T-UICE05-03 (Tampering): `shouldAbortSync` guard, unit-tested; Inngest flag stays false + guard comment.
- T-UICE05-04 (Spoofing): workspaceId from cookie+session, never from input.
- T-UICE05-05 (Tampering): 0 createAdminClient in the action layer.

## Self-Check: PASSED

- FOUND: src/app/actions/agent-content-editor.ts
- FOUND: scripts/knowledge-sync.ts (shouldAbortSync exported)
- FOUND: src/inngest/functions/knowledge-sync-v4.ts (D-01 guard comment)
- FOUND commit 74f2579d (templates actions)
- FOUND commit 8f49fc29 (KB actions)
- FOUND commit 9a10fa5c (sync guard)
- FOUND commit 66a44269 (GREEN test)
