---
phase: ui-agent-content-editor
plan: 06
type: execute
wave: 4
depends_on: [05]
files_modified:
  - src/app/(dashboard)/agentes/layout.tsx
  - src/app/(dashboard)/agentes/content-editor/page.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/TemplatesPanel.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/TemplateForm.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/KnowledgePanel.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/KbTopicForm.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/KbVersionsPanel.tsx
  - src/app/(dashboard)/agentes/content-editor/_components/ContentImageUploader.tsx
autonomous: false
requirements: [D-02, D-04, D-05, D-08, D-09, D-10, D-01b, D-03b]

must_haves:
  truths:
    - "A 'Contenido' tab under /agentes opens an agent selector listing all 7 agents (D-04)"
    - "Selecting any non-v4 agent renders read-only with a 'PRODUCCIÓN — solo lectura' badge and disabled inputs (D-02/D-04)"
    - "Selecting somnio-sales-v4 enables editing templates (edit/add into existing intent/delete/reorder) and KB topics (create/edit/delete)"
    - "KB editor exposes scope_summary + keywords as editable fields (D-10) and shows a versions panel with view/search/restore (D-01b)"
    - "content_type='imagen' offers image upload to whatsapp-media; the returned publicUrl autofills the template content (D-05)"
    - "The shared src/lib/agents/agent-catalog.ts is imported but NOT modified — the two extra Somnio agents live in a content-editor-local constant only (no production config-UI regression)"
    - "No createAdminClient anywhere in the UI/components (Regla 3)"
  artifacts:
    - path: "src/app/(dashboard)/agentes/content-editor/page.tsx"
      provides: "Content editor RSC page with agent selector + Templates/Conocimiento sub-tabs"
    - path: "src/app/(dashboard)/agentes/content-editor/_components/KnowledgePanel.tsx"
      provides: "KB CRUD UI with scope_summary/keywords + versions"
    - path: "src/app/(dashboard)/agentes/content-editor/_components/ContentImageUploader.tsx"
      provides: "Image upload → publicUrl autofill for content_type='imagen' (D-05)"
  key_links:
    - from: "content-editor components"
      to: "src/app/actions/agent-content-editor.ts"
      via: "server-action imports (no createAdminClient)"
      pattern: "from '@/app/actions/agent-content-editor'"
    - from: "AgentSelector.tsx"
      to: "src/lib/agents/agent-catalog.ts AGENT_CATALOG"
      via: "imports AGENT_CATALOG read-only, spreads it into a local CONTENT_EDITOR_AGENTS const"
      pattern: "CONTENT_EDITOR_AGENTS"
---

<objective>
Build the `/agentes/content-editor` UI: agent selector (all 7 agents, v4 editable / others read-only with PRODUCCIÓN badge), Templates panel (edit/add/delete/reorder within existing intents + image upload), Knowledge panel (CRUD topics with scope_summary + keywords + a versions view/search/restore). Wire everything to the Plan 05 server actions (Regla 3 — no createAdminClient in the UI).

Purpose: This is the user-facing payoff — Jose edits what each agent responds, what escalates, and how, without SQL. v4 is the only editable agent (D-02/Regla 6); all others are visible read-only (D-04) so he can understand their behavior.

Output: a new tab + 9 UI files, then a PAUSE for visual smoke (D-04/D-05/D-03b are manual-only per VALIDATION.md).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-agent-content-editor/CONTEXT.md
@.planning/standalone/ui-agent-content-editor/RESEARCH.md
@.planning/standalone/ui-agent-content-editor/PATTERNS.md

<interfaces>
Server actions (Plan 05, src/app/actions/agent-content-editor.ts):
- getTemplatesAction(agentId), getIntentsAction(agentId), updateTemplateAction, addTemplateAction, deleteTemplateAction, reorderTemplatesAction
- getKbListAction(agentId), getKbTopicAction(kbId), createKbTopicAction, updateKbTopicAction, deleteKbTopicAction, listKbVersionsAction(kbId), searchKbVersionsAction({agentId,topic}), restoreKbVersionAction({kbId,versionId,agentId})
Each returns { success?, data?, error? }.

Tab bar (src/app/(dashboard)/agentes/layout.tsx:8-14) — add `{ href: '/agentes/content-editor', label: 'Contenido', icon: FileText, exact: false }` to the tabs array.

AGENT_CATALOG (src/lib/agents/agent-catalog.ts:19-45) — shared, READ-ONLY here. Entry shape is `AgentCatalogEntry { id: string; name: string; description: string }`. Two production consumers iterate it DIRECTLY (no workspace filter): config-panel.tsx:214 and agent-config-slider.tsx:244 both do `AGENT_CATALOG.map(...)`. Adding Somnio agents to the shared array would surface them as selectable conversational agents in EVERY workspace's config UI (incl. GoDentist) → production regression. So the 7-agent list for the content editor is built LOCALLY (CONTENT_EDITOR_AGENTS), not by mutating the shared catalog.

Image upload endpoint (reuse as-is): POST /api/config-builder/templates/upload (multipart 'file') → { storagePath, publicUrl, mimeType }. Client analog: builder/components/image-uploader.tsx (sonner toasts, client MIME/size validation).

content_type enum: 'texto'|'template'|'imagen'. priority enum: 'CORE'|'COMPLEMENTARIA'|'OPCIONAL'. KB category enum: 'product'|'policies'|'edge-cases'|'faqs-no-templated'.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Contenido tab + content-editor-LOCAL 7-agent list (D-04, no shared-catalog mutation)</name>
  <read_first>
    - src/app/(dashboard)/agentes/layout.tsx (tabs array + icon imports)
    - src/lib/agents/agent-catalog.ts (AGENT_CATALOG entries L19-45 + AgentCatalogEntry interface — note the `{ id, name, description }` shape; import ONLY, do NOT modify)
    - src/app/(dashboard)/agentes/components/config-panel.tsx (line ~214 iterates `AGENT_CATALOG.map(...)` directly — proof the shared catalog must NOT gain Somnio agents)
    - src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx (line ~244 iterates `AGENT_CATALOG.map(...)` directly — same proof)
    - CLAUDE.md (agent IDs: somnio-recompra-v1, somnio-sales-v3-pw-confirmation)
  </read_first>
  <action>
1. In `src/app/(dashboard)/agentes/layout.tsx`: import `FileText` from lucide-react and add `{ href: '/agentes/content-editor', label: 'Contenido', icon: FileText, exact: false }` to the `tabs` array (additive — do not reorder/remove existing tabs).
2. Do **NOT** touch `src/lib/agents/agent-catalog.ts`. The shared catalog is READ-ONLY here: `config-panel.tsx:214` and `agent-config-slider.tsx:244` iterate `AGENT_CATALOG.map(...)` directly (no `getAgentsForWorkspace()` filter), so any entry added to the shared array becomes selectable as a conversational agent in EVERY workspace's config UI (including GoDentist) — a production-UI regression. Instead, define a content-editor-LOCAL constant inside the AgentSelector component file. In `src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx`, import the shared catalog and spread it into a local list, appending the two Somnio agents (shape-consistent with `AgentCatalogEntry` — `{ id, name, description }`, ids copied verbatim from CLAUDE.md):
   ```ts
   import { AGENT_CATALOG } from '@/lib/agents/agent-catalog'

   // content-editor-LOCAL — does NOT mutate the shared catalog (config-panel.tsx:214 /
   // agent-config-slider.tsx:244 iterate AGENT_CATALOG.map() directly; extending the shared
   // array would expose these Somnio agents in every workspace's config UI — regression).
   const CONTENT_EDITOR_AGENTS = [
     ...AGENT_CATALOG,
     { id: 'somnio-recompra-v1', name: 'Somnio Recompra', description: 'Agente de recompra/reagendamiento ELIXIR DEL SUEÑO (WhatsApp).' },
     { id: 'somnio-sales-v3-pw-confirmation', name: 'Somnio Sales v3 — Post-Compra', description: 'Confirmación post-compra (pipeline Ventas Somnio Standard).' },
   ] as const
   ```
   The selector (Task 2) feeds its dropdown from `CONTENT_EDITOR_AGENTS` (all 7), not from `AGENT_CATALOG` (5). Keep the two new ids byte-identical to CLAUDE.md so the editability gate (`agentId === 'somnio-sales-v4'`) and the Plan 05 actions' agentId routing stay correct.
  </action>
  <acceptance_criteria>
    - `grep -c "content-editor" "src/app/(dashboard)/agentes/layout.tsx"` >= 1 and `grep -c "FileText" "src/app/(dashboard)/agentes/layout.tsx"` >= 1
    - Shared catalog UNTOUCHED: `git diff --name-only` does NOT include `src/lib/agents/agent-catalog.ts` (and `git status --porcelain src/lib/agents/agent-catalog.ts` is empty)
    - Local list present: `grep -n "CONTENT_EDITOR_AGENTS" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"` returns the local constant
    - Both Somnio agents live in the LOCAL list, not the shared catalog: `grep -c "somnio-recompra-v1\|somnio-sales-v3-pw-confirmation" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"` == 2
    - Selector renders all 7 agents (5 from AGENT_CATALOG spread + 2 local), with only `somnio-sales-v4` editable and the other 6 badged "PRODUCCIÓN — solo lectura" (verified in Task 2's badge + Task 5 manual smoke)
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "CONTENT_EDITOR_AGENTS" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"; git status --porcelain src/lib/agents/agent-catalog.ts | wc -l</automated>
  </verify>
  <done>Contenido tab present; AgentSelector lists all 7 agents via a LOCAL CONTENT_EDITOR_AGENTS constant (D-04); shared agent-catalog.ts untouched (no config-UI regression).</done>
</task>

<task type="auto">
  <name>Task 2: Content-editor page + AgentSelector with v4-editable / others read-only badge</name>
  <read_first>
    - src/app/(dashboard)/agentes/crm-tools/page.tsx + _components (RSC page + co-located components structure)
    - src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx (CONTENT_EDITOR_AGENTS from Task 1)
    - .planning/standalone/ui-agent-content-editor/PATTERNS.md (UI page + tab + components, lines 207-220)
  </read_first>
  <action>
Create `src/app/(dashboard)/agentes/content-editor/page.tsx` (RSC). Render an `AgentSelector` (client) + a panel area with two sub-tabs (Templates | Conocimiento). Default selected agent = `somnio-sales-v4`.

Finish `_components/AgentSelector.tsx` (client): a dropdown fed by `CONTENT_EDITOR_AGENTS` (the content-editor-local list from Task 1 — NOT `AGENT_CATALOG` directly). On change, set the selected agentId (URL search param `?agent=` via `window.history.replaceState` OR a client state lifted to the page wrapper — match the project's URL-state pattern). Compute `const editable = selectedAgentId === 'somnio-sales-v4'`. When NOT editable, render a prominent amber badge "PRODUCCIÓN — solo lectura" (D-04) and pass `editable=false` down to the panels so all inputs/buttons are disabled.

Page must use the dashboard scroll wrapper `<div className="flex-1 overflow-y-auto">` (project convention from MEMORY). No createAdminClient anywhere.
  </action>
  <acceptance_criteria>
    - `test -f "src/app/(dashboard)/agentes/content-editor/page.tsx"` and `test -f "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"`
    - `grep -c "CONTENT_EDITOR_AGENTS" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"` >= 1 (dropdown fed by the local 7-agent list, not the shared catalog)
    - `grep -c "somnio-sales-v4" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"` >= 1 (editability gate)
    - `grep -ci "PRODUCCIÓN — solo lectura\|PRODUCCION — solo lectura\|solo lectura" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"` >= 1 (D-04 badge)
    - `grep -rc "createAdminClient" "src/app/(dashboard)/agentes/content-editor/"` == 0 (Regla 3)
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -ci "solo lectura" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"</automated>
  </verify>
  <done>Page + selector live; editability gate + PRODUCCIÓN badge wired (D-02/D-04).</done>
</task>

<task type="auto">
  <name>Task 3: TemplatesPanel + TemplateForm + ContentImageUploader (D-08/D-05/D-03b)</name>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx + template-form.tsx (list+form structure)
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx (upload flow lines 30-90)
    - src/app/actions/agent-content-editor.ts (template actions — Plan 05)
  </read_first>
  <action>
Create `_components/TemplatesPanel.tsx` (client): on mount call `getTemplatesAction(agentId)` + `getIntentsAction(agentId)`; group templates by intent → visit_type, render ordered by `orden`. Per intent group, when `editable`: an "Agregar template" button that only allows adding INTO that existing intent (D-08 — no free-text new-intent field; the intent is fixed to the group), reorder controls (up/down) that call `reorderTemplatesAction({ agentId, intent, visit_type, orderedIds })`, edit + delete per row. When NOT editable: render rows read-only, no buttons. Show a one-line notice "Los cambios se reflejan en runtime en ≤5 min (cache TemplateManager)" (D-03b / Pitfall 7).

Create `_components/TemplateForm.tsx` (client): fields content (textarea), content_type (select texto/template/imagen), delay_s (number), priority (select), minifrase (text, nullable). On content_type='imagen', render `ContentImageUploader`. Submit calls `updateTemplateAction` (edit) or `addTemplateAction` (add, intent fixed). Surface action `error` via sonner toast.

Create `_components/ContentImageUploader.tsx` (client): clone the image-uploader.tsx flow — client MIME/size validation (jpeg/png ≤5MB), POST multipart to `/api/config-builder/templates/upload`, on success set the form `content` field to the returned `publicUrl` (D-05 — autofill the public URL into content). sonner toasts on error.
  </action>
  <acceptance_criteria>
    - All three files exist under content-editor/_components/
    - `grep -c "reorderTemplatesAction" "src/app/(dashboard)/agentes/content-editor/_components/TemplatesPanel.tsx"` >= 1
    - D-08: no free-text intent creation — `grep -ci "nuevo intent\|crear intent\|new intent" "src/app/(dashboard)/agentes/content-editor/_components/TemplatesPanel.tsx"` == 0 (intent is fixed per group)
    - D-05: `grep -c "publicUrl" "src/app/(dashboard)/agentes/content-editor/_components/ContentImageUploader.tsx"` >= 1 and `grep -c "config-builder/templates/upload" ...` >= 1
    - D-03b notice: `grep -ci "5 min\|≤5\|cache" "src/app/(dashboard)/agentes/content-editor/_components/TemplatesPanel.tsx"` >= 1
    - `grep -rc "createAdminClient" "src/app/(dashboard)/agentes/content-editor/"` == 0
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -c "publicUrl" "src/app/(dashboard)/agentes/content-editor/_components/ContentImageUploader.tsx"; grep -c "reorderTemplatesAction" "src/app/(dashboard)/agentes/content-editor/_components/TemplatesPanel.tsx"</automated>
  </verify>
  <done>Templates panel edits/adds(existing-intent)/deletes/reorders; image upload autofills publicUrl; cache notice shown.</done>
</task>

<task type="auto">
  <name>Task 4: KnowledgePanel + KbTopicForm + KbVersionsPanel (D-09/D-10/D-01b)</name>
  <read_first>
    - src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx (form/state pattern)
    - src/app/actions/agent-content-editor.ts (KB actions — Plan 05)
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§KB Versioning — view/search/restore)
  </read_first>
  <action>
Create `_components/KnowledgePanel.tsx` (client): on mount call `getKbListAction(agentId)`; render topics grouped by category. When `editable`: "Crear topic" button + edit/delete per topic. When NOT editable: read-only list.

Create `_components/KbTopicForm.tsx` (client): editable fields — topic (text), category (select product/policies/edge-cases/faqs-no-templated), **scope_summary (textarea — D-10, labelled "Resumen de alcance — controla a qué consultas llega este KB")**, **keywords (tag input → string[] — D-10)**, hechos_del_producto (textarea), posicion_del_negocio (textarea), debe_contener / nunca_decir / cuando_escalar (multi-line bullet editors → string[]), tone_override (text, nullable), escalate_triggers + related_topics (tag inputs). Submit calls `createKbTopicAction` or `updateKbTopicAction`. Show a saving spinner during the synchronous re-embed (D-06 — "Guardando y regenerando embedding…"); on `error` (incl. OpenAI failure) show a sonner toast "Falló el re-embed, reintenta" and keep the form open.

Create `_components/KbVersionsPanel.tsx` (client): for the selected topic, call `listKbVersionsAction(kbId)`; render versions (version_num, created_at in America/Bogota, edited_by) with a search box wired to `searchKbVersionsAction({ agentId, topic })` and a "Restaurar" button per version → `restoreKbVersionAction({ kbId, versionId, agentId })` (with a confirm dialog noting it re-embeds + snapshots current). Refresh the list + topic after restore.
  </action>
  <acceptance_criteria>
    - All three files exist under content-editor/_components/
    - D-10: `grep -ci "scope_summary\|alcance" "src/app/(dashboard)/agentes/content-editor/_components/KbTopicForm.tsx"` >= 1 and `grep -ci "keywords" ...` >= 1
    - D-01b: `grep -c "listKbVersionsAction\|restoreKbVersionAction\|searchKbVersionsAction" "src/app/(dashboard)/agentes/content-editor/_components/KbVersionsPanel.tsx"` >= 3
    - D-06 UX: `grep -ci "embedding\|regenerando\|reintenta" "src/app/(dashboard)/agentes/content-editor/_components/KbTopicForm.tsx"` >= 1
    - D-09: `grep -c "createKbTopicAction\|updateKbTopicAction\|deleteKbTopicAction" "src/app/(dashboard)/agentes/content-editor/_components/"*.tsx` >= 3 (across panel/form)
    - `grep -rc "createAdminClient" "src/app/(dashboard)/agentes/content-editor/"` == 0
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>grep -ci "scope_summary\|alcance" "src/app/(dashboard)/agentes/content-editor/_components/KbTopicForm.tsx"; grep -c "restoreKbVersionAction" "src/app/(dashboard)/agentes/content-editor/_components/KbVersionsPanel.tsx"</automated>
  </verify>
  <done>KB panel does full CRUD with scope_summary+keywords (D-10) and versions view/search/restore (D-01b); re-embed UX present.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Visual smoke (D-04/D-05/D-03b — manual-only per VALIDATION.md)</name>
  <what-built>
    The full content-editor UI under /agentes/content-editor, wired to the admin-gated server actions. Dev server on port 3020. Note: these behaviors are visual/interaction state that automated tests cannot fully cover (VALIDATION.md Manual-Only table).
  </what-built>
  <how-to-verify>
    1. Run `pnpm dev` (port 3020), log in as a workspace admin, open `/agentes/content-editor`.
    2. D-04: open the agent dropdown — confirm all 7 agents listed (5 from AGENT_CATALOG + somnio-recompra-v1 + somnio-sales-v3-pw-confirmation). Select `godentist` (or any non-v4) → confirm the "PRODUCCIÓN — solo lectura" badge appears and all edit/add/delete/reorder controls are disabled. Switch to `somnio-sales-v4` → controls enabled.
    3. No-regression check: open `/whatsapp` (agent-config-slider) and the agentes config-panel — confirm their conversational-agent dropdowns still list ONLY the original AGENT_CATALOG agents (the two extra Somnio agents must NOT leak there).
    4. Templates: edit a v4 template's content, save → confirm success toast. Reorder two templates in one intent → confirm order persists on reload. Confirm there is NO way to type a brand-new intent (D-08). Confirm the "≤5 min cache" notice is visible (D-03b).
    5. D-05: on a template, set content_type='imagen', upload a JPG/PNG → confirm the public URL autofills into the content field and previews.
    6. KB: create a new topic with scope_summary + keywords filled → confirm the saving/re-embed spinner then success. Edit it → confirm a version appears in the versions panel. Restore the prior version → confirm content reverts and a new version is recorded. Search versions by topic.
    7. Regla 6 sanity: confirm you never edited a non-v4 agent (all were read-only).
  </how-to-verify>
  <resume-signal>Type "UI smoke PASS" or describe issues to fix.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| browser (admin) → server actions | All mutations go through Plan 05 admin-gated, zod-validated actions. |
| browser → upload endpoint | Existing route re-validates MIME/size + membership server-side. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE06-01 | Tampering | UI bypassing the v4 gate by selecting a prod agent and editing | mitigate | editable=(agentId==='somnio-sales-v4') disables controls (D-04); domain also rejects (defense in depth, Plan 03/04). |
| T-UICE06-02 | Tampering | Malicious image upload | mitigate | Reuse existing endpoint with MIME allowlist + 5MB cap + server membership check. |
| T-UICE06-03 | Elevation of privilege | Non-admin reaching mutating actions via UI | mitigate | Server actions enforce isWorkspaceAdmin (Plan 05); UI gating is UX only. |
| T-UICE06-04 | Tampering | createAdminClient leaking into client/RSC (Regla 3) | mitigate | grep gate: 0 createAdminClient under content-editor/. |
| T-UICE06-05 | Tampering | Shared AGENT_CATALOG mutated → Somnio agents leak into prod config UIs | mitigate | Task 1 builds a content-editor-LOCAL CONTENT_EDITOR_AGENTS; grep + git gate proves agent-catalog.ts untouched. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean across new UI files.
- `grep -rc "createAdminClient" "src/app/(dashboard)/agentes/content-editor/"` == 0.
- `git status --porcelain src/lib/agents/agent-catalog.ts` empty (shared catalog untouched).
- Manual smoke PASS for D-04/D-05/D-03b/D-01b restore + no-regression of prod config dropdowns.
</verification>

<success_criteria>
- /agentes/content-editor lists all 7 agents (via content-editor-local list); v4 editable, others read-only with PRODUCCIÓN badge.
- Shared src/lib/agents/agent-catalog.ts is imported but not modified (no production config-UI regression).
- Templates: edit/add(existing-intent)/delete/reorder + image upload autofill.
- KB: CRUD + scope_summary/keywords + versions view/search/restore + re-embed UX.
- No createAdminClient in the UI (Regla 3).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/06-SUMMARY.md`.
</output>
</content>
</invoke>
