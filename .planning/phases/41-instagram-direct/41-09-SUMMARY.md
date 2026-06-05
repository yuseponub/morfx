---
phase: 41-instagram-direct
plan: 09
subsystem: meta-instagram-connect
gap_closure: true
requirements: [IG-03]
tags: [meta, instagram, oauth, gap-closure, regla-6, tdd]
dependency_graph:
  requires:
    - "41-08 (dedicated IG FB.login + token-refresh connectInstagramAccount({accessToken}))"
    - "resolveByWorkspace (src/lib/meta/credentials.ts) — reads the workspace's bound facebook row"
    - "getPageToken structure + findPageViaBusinesses (src/lib/meta/messenger-connect.ts) — cloned, not edited"
  provides:
    - "getPageTokenForPage(longLivedUserToken, pageId) — Page token for a SPECIFIC pageId (never data[0])"
    - "connectInstagramAccount rewired to target the workspace's bound facebook page (GAP-41-01 closed)"
    - "no-facebook-row precheck restored ('Primero conecta tu página de Facebook')"
  affects:
    - "Conectar Instagram connect path (Configuración → Integraciones → Instagram) for multi-page operators"
tech_stack:
  added: []
  patterns:
    - "specific-page token resolver (filter /me/accounts by known id + Business Portfolio + direct-node fallback, never data[0])"
    - "read-bound-resource-first precheck before the token chain (restores 41-07 graceful error)"
key_files:
  created: []
  modified:
    - "src/app/actions/__tests__/connect-instagram-oauth.test.ts (RED: multi-page no-retarget + data[0] guard + no-facebook-row precheck)"
    - "src/lib/meta/messenger-connect.ts (added getPageTokenForPage sibling; getPageToken byte-identical)"
    - "src/app/actions/meta-onboarding.ts (connectInstagramAccount precheck + getPageTokenForPage targeting the bound page)"
decisions:
  - "Fix targets the workspace's OWN bound page (resolveByWorkspace) — never getPageToken's first-page (data[0]) heuristic (GAP-41-01 root cause)"
  - "getPageTokenForPage is an ADDED sibling helper; getPageToken stays byte-identical (Regla 6 / D-IG-11 — connectFacebookPage depends on it)"
  - "No-facebook-row precheck restored ('Primero conecta tu página de Facebook') — short-circuits before any token call"
  - "All of 41-08's dedicated-login + token-refresh intent preserved (exchangeForLongLivedUserToken still runs; only WHICH page the token is fetched for changed — D-IG-10/11/12)"
metrics:
  tasks: 3
  commits: 3
  files_changed: 3
  duration_minutes: 12
  completed: "2026-06-05"
---

# Phase 41 Plan 09: connectInstagramAccount targets the workspace's bound page (GAP-41-01 gap-closure) Summary

**One-liner:** Fixed the live multi-page "Conectar Instagram" collision (GAP-41-01) by reading the workspace's already-bound facebook page (`resolveByWorkspace`) and minting the Page token FOR that specific page via a new `getPageTokenForPage` helper — eliminating 41-08's `getPageToken` data[0] heuristic that retargeted multi-page operators to the wrong page_id and tripped the `uq_meta_page` UNIQUE collision (Varixcenter live repro), while keeping `getPageToken` + all UI byte-identical (Regla 6).

## What Was Built

### Task 1 — RED contract (`connect-instagram-oauth.test.ts`)
Extended the 41-08 harness (kept all 7 prior auth-gate / graceful-error / Regla 6 / no-leak guards GREEN):
- Mocked `@/lib/meta/credentials` → `resolveByWorkspace` (happy default → bound `WORKSPACE_PAGE = '714615171734964'`).
- Added `getPageTokenForPage: vi.fn()` to the messenger-connect mock; the existing `getPageToken` stays mocked as a GUARD that proves it is never called from the block (default → a DIFFERENT page `OTHER_PAGE = '528898033801678'`).
- Re-pointed the token-refresh chain assertions at `getPageTokenForPage` + `WORKSPACE_PAGE` (facebook upsert, IG resolve, IG upsert, subscribe).
- New `GAP-41-01 multi-page target (IG-03)` describe with 3 tests: (a) multi-page no-retarget (`getPageTokenForPage('LONG_LIVED_USER_TOKEN', WORKSPACE_PAGE)`, `getPageToken` NOT called, fb upsert pageId = WORKSPACE_PAGE ≠ OTHER_PAGE), (b) data[0] guard (`getPageTokenForPage` rejects → `{success:false}` + NO upsert), (c) no-facebook-row precheck (`resolveByWorkspace`→null → `'Primero conecta tu página de Facebook'`, zero token-chain calls).
- RED-by-signature: the current action still called `getPageToken` and never read `resolveByWorkspace` → 6 assertion failures / 7 GREEN guards (no collection/syntax errors).

### Task 2 — GREEN helper (`messenger-connect.ts`)
Added `getPageTokenForPage(longLivedUserToken, pageId)` DIRECTLY AFTER `getPageToken` (getPageToken untouched). Three-stage resolution, all gated on the KNOWN id:
1. `/me/accounts` → `res.data?.find((p) => p.id === pageId && p.access_token)` (never `.find(p => p.access_token)` alone).
2. Business Portfolio fallback via `findPageViaBusinesses` (reused) — only accepts the matching id.
3. Direct page-node `GET /{pageId}?fields=id,name,access_token` last resort.
If none match → throws the actionable Spanish error `'No pudimos renovar el acceso a tu página de Facebook. Asegúrate de autorizar la misma página en el login.'` — NEVER falls back to data[0]. Returns `pageId` verbatim (no retarget).

### Task 3 — GREEN rewire (`meta-onboarding.ts`)
- Imports: added `getPageTokenForPage` to the messenger-connect named imports; re-added `import { resolveByWorkspace } from '@/lib/meta/credentials'` (dropped by 41-08).
- `connectInstagramAccount`: after the `input.accessToken` check, added the precheck `const fbCreds = await resolveByWorkspace(workspaceId, 'facebook')` → `if (!fbCreds || !fbCreds.pageId) return { success:false, error:'Primero conecta tu página de Facebook' }`; bound `boundPageId`.
- Step 2 of the try changed from `getPageToken(longLivedUserToken)` to `getPageTokenForPage(longLivedUserToken, boundPageId)`. Steps 1 (exchange), 3 (encrypt), 4 (facebook upsert — now UPDATES the existing row, no collision), 5 (resolveInstagramAccount), 6 (IG upsert), 7 (subscribe), 8 (return) unchanged; auth gate + catch VERBATIM. `getPageToken` import kept (connectFacebookPage still uses it).

## Verification

- `pnpm vitest run connect-instagram-oauth.test.ts connect-facebook.test.ts` → **20/20 GREEN** (IG 13/13 incl. the 3 GAP-41-01 tests; FB 7/7 — connectFacebookPage proven untouched).
- `grep -c "resolveByWorkspace(workspaceId, 'facebook')" meta-onboarding.ts` = 1; `grep -c "getPageTokenForPage(" meta-onboarding.ts` = 1.
- **Regla 6 (base `9bb6359e`):** `getPageToken` byte-identical (zero `-` lines in messenger-connect.ts diff; still defined exactly once); `git diff -- connect-instagram.tsx` EMPTY; `git diff -- connect-facebook.tsx` EMPTY; `grep -c FB_LOGIN_SCOPE connect-instagram.tsx` = 0; `git diff -- src/lib/agents/godentist-fb-ig/` EMPTY; meta-onboarding.ts diff confined to the import lines + the connectInstagramAccount block (no protected function signatures, no `instagram_provider`/`messenger_provider` touches).
- `npx tsc --noEmit` → **0 errors mentioning messenger-connect.ts or meta-onboarding.ts** (4 total tsc errors are pre-existing in unrelated test files — see Deferred Issues).
- TDD gate: RED `bff96fcf` (test) → GREEN `80ec2439` (helper) → GREEN `1824525d` (rewire).
- **NOT pushed** (operator's call — Phase 41 already deployed, so the push ships this fix; operator pushes at the 41-07 cutover after confirming the 41-00 prod migration).

## Commits

- `bff96fcf` — test(41-09): pin GAP-41-01 workspace-page-target contract
- `80ec2439` — feat(41-09): add getPageTokenForPage helper (specific-page, never data[0])
- `1824525d` — feat(41-09): connectInstagramAccount targets the workspace's bound page (fix GAP-41-01)

## Deviations from Plan

None — plan executed exactly as written (RED → GREEN-helper → GREEN-rewire, with the plan's commit messages). The optional `'autorizar la misma página'` catch branch was NOT added (plan-discretionary; the data[0]-guard test only requires `{success:false}` + no upsert, which the generic catch already satisfies).

## Deferred Issues

Out-of-scope pre-existing tsc errors (NOT caused by this plan; logged, not fixed per the scope boundary):
- `src/lib/domain/__tests__/conversations.test.ts:16` — `eqMock` implicit-any (TS7022/TS7024).
- `src/lib/instagram/__tests__/webhook-handler.test.ts:87` + `src/lib/messenger/__tests__/webhook-handler.test.ts:83` — `Cannot find module '@/lib/inngest/client'` (TS2307; both suites run GREEN under vitest — a tsc-only module-resolution quirk mirroring the shipped FB sibling).

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/meta/messenger-connect.ts` getPageTokenForPage — FOUND (grep count 1)
- `src/app/actions/meta-onboarding.ts` resolveByWorkspace + getPageTokenForPage — FOUND
- `src/app/actions/__tests__/connect-instagram-oauth.test.ts` — FOUND (13 tests GREEN)
- Commit `bff96fcf` — FOUND
- Commit `80ec2439` — FOUND
- Commit `1824525d` — FOUND
