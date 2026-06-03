---
phase: 39-whatsapp-outbound-templates
plan: 07
subsystem: whatsapp-outbound-meta
tags: [green, meta-cloud-api, templates, d-05, provider-branch, regla-6, wa-08, mig-03, ui]
requires:
  - "Plan 03 (39-03) — meta/templates.ts: editTemplateMeta (D-05 guard) + listTemplatesMeta/deleteTemplateMeta/syncTemplateStatusMeta"
  - "Plan 04 (39-04) — domain whatsapp_provider chokepoint pattern (the shape this action mirrors)"
  - "meta/credentials.ts resolveByWorkspace (existing)"
provides:
  - "actions/templates.ts: provider-aware deleteTemplate + syncTemplateStatuses (meta_direct vs 360dialog)"
  - "actions/templates.ts: NEW editTemplate action — resolves message_template_id from Meta, delegates to editTemplateMeta, surfaces D-05 throws as clean { error }; 360dialog returns 'duplica y recrea'"
  - "template-list.tsx: status-gated edit UI — Edit only for {APPROVED,REJECTED,PAUSED}; PENDING/DISABLED offer 'Duplicar como nuevo'; name/language/category locked; APPROVED 24h/30d warning"
affects: []   # leaf plan — no downstream consumer files in this phase besides the Plan 08 cutover smoke
tech-stack:
  added: []   # zero new deps, zero migrations
  patterns:
    - "readTemplateProviderConfig(supabase, workspaceId) helper — single whatsapp_provider+settings read for all three management actions (mirrors readWhatsappProvider in domain/messages.ts)"
    - "message_template_id resolved at edit-time from Meta via listTemplatesMeta(name+language) — the local whatsapp_templates table does NOT store it"
    - "D-05 surfacing: service editTemplateMeta throws on violation → action try/catch → clean { error } → UI toast (defense in depth across service + action + UI)"
    - "UI status gate set EDITABLE_STATUSES = {APPROVED,REJECTED,PAUSED} byte-matches the service-layer EDITABLE_STATUSES (no unconstrained edit promised)"
key-files:
  created:
    - src/app/actions/__tests__/templates-provider.test.ts
  modified:
    - src/app/actions/templates.ts
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx
decisions:
  - "editTemplate resolves the Meta message_template_id at call-time via listTemplatesMeta (find by name + language), because the local whatsapp_templates row never stored it (Plan 03/04 added no such column). The Graph message_templates edge returns node `id` by default."
  - "The UI edits ONLY the BODY text. category is rendered LOCKED (D-05 A4 — editing category triggers re-classification/re-review; conservative UI sidesteps the ambiguity). name/language are rendered as read-only <p>, never as inputs (D-05 immutable)."
  - "360dialog editTemplate returns { error: 'duplica y recrea' } rather than silently no-op — surfaced in the UI as a toast (RESEARCH D-05 note: 360dialog has no edit endpoint; default stays create-only)."
  - "syncTemplateStatuses normalizes BOTH providers (Meta data[] + 360dialog waba_templates[]) into one { name,status,quality_score,rejected_reason }[] list, then applies the identical provider-agnostic UPDATE tail. syncTemplateStatusMeta kept referenced (void) as the per-name poll fallback per Pattern 3 / WA-09-missed."
metrics:
  duration_minutes: 10
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  tests_total: 8
  tests_green: 8
  completed: 2026-06-03
---

# Phase 39 Plan 07: Provider-Aware Template Management + D-05 Edit Experience Summary

Made the template MANAGEMENT surface (delete / list-sync) provider-aware (WA-08 / MIG-03) and delivered the MANDATORY D-05 edit experience end-to-end: a new `editTemplate` server action that enforces Meta's edit constraints (via `editTemplateMeta`'s service guard, surfaced cleanly) and a `template-list.tsx` UI that reflects reality — no unconstrained "Edit" on approved/disabled/pending templates. The 360dialog management arms stay byte-identical (Regla 6).

## What Was Built

### Task 1 — `actions/templates.ts` provider branch + editTemplate (TDD; RED `d0684164` → GREEN `95afc881`)

- **`readTemplateProviderConfig(supabase, workspaceId)`** — a single `.select('whatsapp_provider, settings')` read returning `{ provider, apiKey }` (default/null → `'360dialog'`, Regla 6 default-safe). All three management actions share it (mirrors `readWhatsappProvider` in `domain/messages.ts`).
- **`deleteTemplate`** — branches on provider: `meta_direct` → `resolveByWorkspace(workspaceId,'whatsapp')` then `deleteTemplateMeta({accessToken,wabaId,phoneNumberId}, template.name)`; `360dialog` → the existing `deleteTemplate360(apiKey, name)` call **byte-identical**. Remote delete only runs when `submitted_at` is set; failure falls through to the local DB delete (unchanged behavior).
- **`syncTemplateStatuses`** — `meta_direct` → `listTemplatesMeta(metaCreds)` (creds from workspaceId); `360dialog` → `listTemplates360(apiKey)` unchanged. Both normalize into one list and feed the identical provider-agnostic UPDATE tail. `syncTemplateStatusMeta` kept referenced as the per-name poll fallback (Pattern 3). This remains the manual "Resync" fallback (WA-09 push is primary, Plan 06).
- **NEW `editTemplate({ id, category?, components? })`** — `meta_direct`: loads the local row (name/language/status), resolves the Meta `message_template_id` via `listTemplatesMeta` (find by name+language — the local table stores no id), then calls `editTemplateMeta(metaCreds, { templateId, status, category?, components? })`. The D-05 guard lives in the service (Plan 03); the action wraps the call in try/catch and **surfaces the thrown violation as a clean `{ error }`** — never crashes (T-39-08). `name`/`language` are never forwarded (the params surface omits them). On success it flips the local status to `PENDING` (re-review). For `360dialog` it returns `{ error: 'duplica y recrea' }` (no edit endpoint; no silent fail).
- Creds + workspaceId resolve from the session/ctx, never from input (T-39-02); the access token only ever flows to the meta/* helpers, never logged (T-39-01).

### Task 2 — `template-list.tsx` status-gated edit UI (`716f4e74`)

- **`EDITABLE_STATUSES = {APPROVED, REJECTED, PAUSED}`** (byte-matches the service-layer set). Edit (pencil) is shown ONLY for those statuses. For `PENDING`/`DISABLED` the UI hides Edit and shows a "Duplicar como nuevo" (copy) affordance routing to `/configuracion/whatsapp/templates/nuevo`.
- **Edit dialog** (Radix `Dialog`): renders `name` / `language` / `category` as read-only `<p>` labels ("bloqueado") — never as editable inputs (D-05 immutable). Only the BODY text is editable via a `Textarea` (maxLength 1024). For `APPROVED` it shows the amber warning "Solo se puede editar 1 vez cada 24h, 10 veces cada 30 dias. Editar reenvia el template a revision de Meta (queda PENDING)." Submit wires to `editTemplate`; success toast reflects the PENDING re-review flip; the `{ error }` path (D-05 violation or 360dialog "duplica y recrea") surfaces as an error toast. Delete flow + status badge intact.

## Deviations from Plan

### Auto-fixed / contract-honored

**1. [Rule 3 — Blocking] `editTemplate` resolves `message_template_id` from Meta (not from the local row)**
- **Found during:** Task 1 (designing the editTemplateMeta call).
- **Issue:** `editTemplateMeta` requires the Meta `message_template_id`, but the local `whatsapp_templates` table never stored it (Plans 03/04 added no such column; the Template type has no such field). Without resolving it the action could not call the service.
- **Fix:** The action calls `listTemplatesMeta(metaCreds)` and finds the node by `name` (+ `language`), reading its `id` and current `status`. The Graph `message_templates` edge returns node `id` by default (not gated by the `fields` list). This also re-reads the authoritative Meta status, so the D-05 gate uses fresh state rather than a possibly-stale local row.
- **Files modified:** `src/app/actions/templates.ts`.
- **Commit:** `95afc881`.

**2. [Rule 2 — Critical] Category locked in the edit UI (D-05 A4)**
- **Found during:** Task 2.
- **Issue:** The Meta Update endpoint technically accepts a category change, but RESEARCH A4 + the D-05 table warn it triggers re-classification/re-review and is best avoided. The plan's `<action>` said to lock `name`/`language`/`category` for APPROVED.
- **Fix:** The UI never sends a category change (the dialog renders category read-only for every editable status, not just APPROVED). Only BODY text is editable. The action still accepts an optional `category` param for future use, but the UI does not exercise it.
- **Files modified:** `src/app/(dashboard)/.../template-list.tsx`.
- **Commit:** `716f4e74`.

No other deviations — the provider branch shape, the 360dialog byte-identical arms, and the D-05 gating follow 39-PATTERNS.md + the RESEARCH D-05 table exactly.

## Authentication Gates

None. Pure action + UI implementation against mocked Supabase / mocked meta/* helpers; no live credentials, no external calls. T-39-01 honored — the resolved access token flows only to `deleteTemplateMeta` / `listTemplatesMeta` / `editTemplateMeta`, never logged.

## Verification

```
pnpm exec vitest run src/app/actions/__tests__/templates-provider.test.ts
→ 1 file, 8 tests: 8 passed
  · deleteTemplate: 360dialog→deleteTemplate360 / meta_direct→deleteTemplateMeta (Regla 6 + provider)
  · syncTemplateStatuses: 360dialog→listTemplates360 / meta_direct→listTemplatesMeta
  · editTemplate: meta_direct APPROVED→editTemplateMeta(resolved id); D-05 throw→clean {error};
    name/language never forwarded; 360dialog→'duplica y recrea'

pnpm exec vitest run \
  src/app/actions/__tests__/templates-provider.test.ts \
  src/lib/meta/__tests__/templates.test.ts \
  src/lib/domain/__tests__/messages-provider.test.ts
→ 3 files, 22 tests: 22 passed (adjacent-suite regression)

grep -nE "whatsapp_provider|editTemplateMeta|deleteTemplateMeta|syncTemplateStatusMeta" src/app/actions/templates.ts  → present
grep -nE "APPROVED|PENDING|DISABLED|editTemplate|Duplicar|24h" .../template-list.tsx  → present

pnpm exec tsc --noEmit  → 0 errors mentioning actions/templates, templates-provider.test, or template-list
```

### Pre-existing tsc errors (NOT introduced by this plan, out of scope)
`pnpm exec tsc --noEmit` reports errors in files this plan never touched: `.next/dev/types/validator.ts` (Next codegen), `src/lib/domain/__tests__/conversations.test.ts` (eqMock self-ref), `src/lib/domain/__tests__/messages-provider.test.ts` (DomainContext.source missing — pre-existing per Plan 04 SUMMARY), `src/lib/meta/__tests__/media.test.ts` + `send.test.ts` (unused @ts-expect-error). Zero of these mention my two files. They are documented pre-existing failures, not regressions.

### Regla 6 (360dialog management byte-identical)
`git diff` on `deleteTemplate`/`syncTemplateStatuses`: the `deleteTemplate360(apiKey, name)` and `listTemplates360(apiKey)` call args are unchanged — only the surrounding provider-branch wrapper + indentation differ. Default provider (Somnio + all current prod clients) stays on the 360dialog arms.

## Threat Surface / Mitigations Applied

| Threat ID | Disposition | How |
|-----------|-------------|-----|
| T-39-08 (illegal template edit) | mitigated | D-05 guard in `editTemplateMeta` (service) + action try/catch surfacing + UI status gate {APPROVED,REJECTED,PAUSED} — name/language immutable, defense in depth across all three layers |
| T-39-02 (cross-workspace) | mitigated | workspaceId from `getRequestAuth()`; Meta creds via `resolveByWorkspace(workspaceId, ...)`, never from input |
| T-39-09 (prod regression) | mitigated | 360dialog delete/sync arms byte-identical; default provider unchanged |
| T-39-01 (token disclosure) | mitigated | access token flows only to meta/* helpers, never logged |

No new threat surface beyond the plan's `<threat_model>` register.

## Known Stubs

None. `editTemplate` performs a real Meta edit via the resolved `message_template_id`; the UI edit dialog is fully wired to the action. No placeholder/empty-data paths introduced. (The optional `category` edit param is intentionally not exercised by the UI per D-05 A4 — documented, not a stub.)

## TDD Gate Compliance

Task 1 is `tdd="true"`. RED gate: `test(39-07)` commit `d0684164` (`templates-provider.test.ts`, 6 RED + 2 GREEN-360dialog-default). GREEN gate: `feat(39-07)` commit `95afc881` turns all 8 green. No REFACTOR commit needed. Task 2 is `type="auto"` (verified by grep + tsc + the action tests).

## Self-Check: PASSED

Created/modified files (all FOUND):
- `src/app/actions/__tests__/templates-provider.test.ts`
- `src/app/actions/templates.ts` — contains `whatsapp_provider`, `editTemplateMeta`, `deleteTemplateMeta`, `syncTemplateStatusMeta`
- `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx` — contains `EDITABLE_STATUSES`, `editTemplate`, `Duplicar`, `24h`

Commits (all FOUND in git log on `main`):
- `d0684164` test(39-07): RED scaffold for provider-aware template mgmt + D-05 editTemplate
- `95afc881` feat(39-07): provider-aware delete/sync + editTemplate action with D-05 guard
- `716f4e74` feat(39-07): status-gated edit UI honoring D-05 (no unconstrained edit)
