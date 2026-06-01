---
phase: ui-agent-content-editor
plan: 06
subsystem: ui
tags: [next, react, server-actions, agent-templates, knowledge-base, image-upload, content-editor]

# Dependency graph
requires:
  - phase: 05
    provides: 14 server actions (6 templates + 8 KB) admin-gated + zod (src/app/actions/agent-content-editor.ts)
  - phase: 03
    provides: domain agent-templates.ts (list/update/add/delete/reorder, D-02/D-08)
  - phase: 04
    provides: domain agent-knowledge-base.ts (CRUD + re-embed + versioning, D-01b/D-06/D-09/D-10)
provides:
  - "/agentes/content-editor tab + RSC page + client shell (selector + Templates/Conocimiento sub-tabs)"
  - "AgentSelector with content-editor-LOCAL CONTENT_EDITOR_AGENTS (7 agents) — shared catalog untouched"
  - "TemplatesPanel: edit/add(existing-intent)/delete/reorder + cache notice (D-08/D-03b)"
  - "ContentImageUploader: upload to whatsapp-media → publicUrl autofill (D-05)"
  - "KnowledgePanel: KB CRUD with scope_summary + keywords (D-09/D-10)"
  - "KbVersionsPanel: version view/search/restore (D-01b)"
affects: [ui-agent-content-editor follow-ups, somnio-v4 content editing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "content-editor-LOCAL constant (CONTENT_EDITOR_AGENTS) instead of mutating shared AGENT_CATALOG — prevents prod config-UI regression"
    - "editability gate = pure constant (agentId === 'somnio-sales-v4') propagated to all panels"
    - "client URL-state via history.replaceState (?agent=) — not router.replace"
    - "image upload publicUrl autofill into content field (content_type='imagen')"
    - "tag input (chips) + bullet editor (one-per-line) → string[] for KB array fields"

key-files:
  created:
    - "src/app/(dashboard)/agentes/content-editor/page.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/ContentEditorShell.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/TemplatesPanel.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/TemplateForm.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/ContentImageUploader.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/KnowledgePanel.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/KbTopicForm.tsx"
    - "src/app/(dashboard)/agentes/content-editor/_components/KbVersionsPanel.tsx"
  modified:
    - "src/app/(dashboard)/agentes/layout.tsx (added Contenido tab — additive)"

key-decisions:
  - "CONTENT_EDITOR_AGENTS local constant — shared agent-catalog.ts NEVER modified (Regla 6 / no prod config-UI regression)"
  - "ContentImageUploader pushes publicUrl up via onUploaded callback (not a draft context) — simpler standalone wiring"
  - "KB array fields use a chips TagInput (keywords/escalate_triggers/related_topics) and a one-per-line BulletEditor (debe_contener/nunca_decir/cuando_escalar)"
  - "eslint-disable-next-line react-hooks/set-state-in-effect on legitimate load-on-mount effects (next build fails on ESLint errors)"

patterns-established:
  - "Local agent list spread from shared catalog to add editor-only entries without polluting prod selectors"
  - "Per-group fixed-intent add (D-08): TemplateForm in add mode receives intent/visit_type from the group, no free-text intent field"

requirements-completed: [D-02, D-04, D-05, D-08, D-09, D-10, D-01b, D-03b]

# Metrics
duration: ~35min
completed: 2026-06-01
---

# Phase ui-agent-content-editor Plan 06: Content Editor UI Summary

**`/agentes/content-editor` UI — 7-agent selector (v4 editable, 6 read-only with PRODUCCIÓN badge), Templates panel (edit/add-into-existing-intent/delete/reorder + image upload autofill) and Knowledge panel (KB CRUD with scope_summary/keywords + version view/search/restore), all wired to Plan 05 admin-gated server actions with zero createAdminClient in the UI.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-01
- **Completed:** 2026-06-01
- **Tasks:** 4 build tasks (Task 5 is the orchestrator-handled visual checkpoint) + 1 blocking-lint fix
- **Files modified:** 10 (9 created + 1 layout edit)

## Accomplishments
- New "Contenido" tab under `/agentes` opening a 7-agent selector (5 from shared AGENT_CATALOG + 2 content-editor-local Somnio agents) — D-04.
- Editability gate: only `somnio-sales-v4` editable; the other 6 render an amber "PRODUCCIÓN — solo lectura" badge + disabled controls (D-02/D-04).
- TemplatesPanel: groups by intent→visit_type, supports edit/delete, reorder (up/down via `reorderTemplatesAction`), and add INTO an existing intent only (intent fixed per group — D-08). Shows the "≤5 min cache" runtime notice (D-03b).
- ContentImageUploader: `content_type='imagen'` uploads JPG/PNG (≤5MB) to the existing `/api/config-builder/templates/upload` endpoint and autofills the returned `publicUrl` into the template content (D-05).
- KnowledgePanel: KB CRUD grouped by category (D-09); KbTopicForm exposes `scope_summary` (labelled "controla a qué consultas llega este KB") + `keywords` plus all body fields (D-10), with a synchronous re-embed spinner "Guardando y regenerando embedding…" (D-06) and verbatim error surfacing.
- KbVersionsPanel: per-topic version list (America/Bogota timestamps), topic search, and restore-with-confirm — view/search/restore (D-01b).
- Shared `src/lib/agents/agent-catalog.ts` left untouched (verified `git status --porcelain` empty); the 2 extra Somnio agents live only in the local `CONTENT_EDITOR_AGENTS` constant — no production config-UI regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: Contenido tab + content-editor-local 7-agent list** — `d39c7e19` (feat)
2. **Task 2: page + ContentEditorShell (selector + sub-tabs + editable gate/badge)** — `fd31d902` (feat)
3. **Task 3: TemplatesPanel + TemplateForm + ContentImageUploader** — `15035df6` (feat)
4. **Task 4: KnowledgePanel + KbTopicForm + KbVersionsPanel** — `35cf202b` (feat)
5. **Blocking-lint fix (Rule 3): silence react-hooks/set-state-in-effect on load-on-mount** — `3b086a48` (fix)

_Task 5 (visual smoke) is a `checkpoint:human-verify` handled by the orchestrator — not a code commit._

## Files Created/Modified
- `src/app/(dashboard)/agentes/layout.tsx` — added `{ href:'/agentes/content-editor', label:'Contenido', icon:FileText }` tab (additive).
- `src/app/(dashboard)/agentes/content-editor/page.tsx` — RSC entry, scroll wrapper + ContentEditorShell.
- `_components/ContentEditorShell.tsx` — client wrapper: selected agent state (URL `?agent=` via history.replaceState), Templates/Conocimiento sub-tabs, propagates `editable`.
- `_components/AgentSelector.tsx` — exports `CONTENT_EDITOR_AGENTS` (local 7-agent list) + `EDITABLE_AGENT_ID`; dropdown + PRODUCCIÓN badge.
- `_components/TemplatesPanel.tsx` — grouped templates, edit/add/delete/reorder, cache notice.
- `_components/TemplateForm.tsx` — create/edit form; add mode has fixed intent (D-08); renders ContentImageUploader for imagen.
- `_components/ContentImageUploader.tsx` — multipart upload → publicUrl autofill (D-05).
- `_components/KnowledgePanel.tsx` — KB list grouped by category + create/edit/delete + versions toggle.
- `_components/KbTopicForm.tsx` — full KB editable fields incl. scope_summary + keywords (D-10) + re-embed UX (D-06).
- `_components/KbVersionsPanel.tsx` — version list/search/restore (D-01b).

## Decisions Made
- Used a content-editor-LOCAL `CONTENT_EDITOR_AGENTS` constant (spread of `AGENT_CATALOG` + 2 Somnio agents) instead of extending the shared catalog — `config-panel.tsx` and `agent-config-slider.tsx` iterate `AGENT_CATALOG.map()` directly, so extending it would leak the extra agents into every workspace's config UI (production regression). Shared catalog verified untouched.
- ContentImageUploader exposes an `onUploaded(publicUrl)` callback (vs. the builder's draft-context coupling) so it is self-contained and the parent TemplateForm owns the content state.
- KB array fields rendered with two input idioms: chip TagInput (keywords / escalate_triggers / related_topics) and a one-item-per-line BulletEditor (debe_contener / nunca_decir / cuando_escalar) — both serialize to `string[]` matching the Plan 05 zod schemas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint `react-hooks/set-state-in-effect` errors would fail `next build`**
- **Found during:** post-Task-4 lint verification.
- **Issue:** Next.js fails the production build on ESLint errors by default (no `eslint.ignoreDuringBuilds` in `next.config`). The legitimate load-on-mount effects (data fetch + spinner) and the one-shot URL hydration in ContentEditorShell tripped the rule, which would block the build/deploy.
- **Fix:** added targeted `// eslint-disable-next-line react-hooks/set-state-in-effect` on the four affected `useEffect`s (ContentEditorShell URL hydration; TemplatesPanel / KnowledgePanel / KbVersionsPanel load-on-mount) — matching the project convention of targeted react-hooks disables (e.g. shopify-form.tsx, confirmaciones-panel.tsx).
- **Files modified:** ContentEditorShell.tsx, TemplatesPanel.tsx, KnowledgePanel.tsx, KbVersionsPanel.tsx
- **Verification:** `npx eslint src/app/(dashboard)/agentes/content-editor/` exits 0 with no output.
- **Committed in:** `3b086a48`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Necessary to keep the production build green. No scope creep — purely a lint-rule annotation on intentional patterns.

## Issues Encountered
- `npx next build` did not finish within the 540s tool timeout (this is a large app; full build is slow). Compile correctness was instead verified via `npx tsc --noEmit` (0 errors in all content-editor files) and `npx eslint` (clean, exit 0). The two unrelated `tsc` errors in the global output (`agent-knowledge-base.test.ts:280` duplicate `topic` key from Plan 04 commit `4725c5d2`, and `conversations.test.ts:16` implicit-any) pre-date Plan 06 and are out of scope — logged to `deferred-items.md`.

## Deferred Issues
See `deferred-items.md`:
- D1: pre-existing tsc duplicate-key in Plan 04's `agent-knowledge-base.test.ts` (not introduced here).
- D2: pre-existing implicit-any in unrelated `conversations.test.ts`.

## User Setup Required
None — the image upload endpoint and `whatsapp-media` bucket already exist; no env/config changes.

## Next Phase Readiness
- UI complete and wired to Plan 05 actions. Awaiting the Task 5 visual smoke (orchestrator-driven): confirm 7-agent list, v4-editable / 6 read-only, no leak of the 2 Somnio agents into `/whatsapp` + config-panel dropdowns, template edit/reorder/image autofill, KB create/edit/version-restore.
- v4 remains DORMANT in prod; this editor only writes `somnio-sales-v4` content, gated by admin role server-side (Plan 05) + the UI editable gate.

## Self-Check: PASSED

- All 9 UI files + SUMMARY.md exist on disk.
- All 5 commits (d39c7e19, fd31d902, 15035df6, 35cf202b, 3b086a48) present in git log.
- `git status --porcelain src/lib/agents/agent-catalog.ts` empty (shared catalog untouched).
- `grep -rc createAdminClient src/app/(dashboard)/agentes/content-editor/` == 0 (Regla 3).
- `npx tsc --noEmit` clean across all content-editor files; `npx eslint` exit 0.

---
*Phase: ui-agent-content-editor*
*Completed: 2026-06-01*
