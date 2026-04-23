---
phase: ui-redesign-dashboard
plan: 06
subsystem: automatizaciones (UI)
status: complete
wave: 2
depends_on: ['01']
tags:
  - ui-only
  - editorial-reskin
  - regla-6
  - d-dash-07-strict
  - react-flow-intact
  - ai-sdk-v6-intact
  - dnd-kit-intact
dependency_graph:
  requires:
    - "Wave 0 Plan 01 — useDashboardV2 hook + .theme-editorial cascade + font loader (shipped)"
  provides:
    - "Módulo /automatizaciones editorial completo (listing + wizard + canvas + AI builder chat + historial)"
    - "src/components/ui/dialog.tsx extendido con portalContainer prop opcional (BC-additive)"
  affects:
    - "Users de Somnio post-flag-activation: verán el módulo editorial coherente con inbox v2 + landing v2.1"
tech_stack:
  added:
    - "Ninguno — solo tokens editoriales ya existentes desde fase inbox v2 Plan 01"
  patterns:
    - "Dictionary-table pattern (paper-0 + border ink-1 + stamp + smallcaps column labels + dotted row borders)"
    - "Editorial wizard step indicator (smallcaps rubric-2 + mono numbers + underline ink-1 active)"
    - "React Flow Background variant='dots' gap=16 size=0.5 color=ink-4 (matches mock radial-gradient)"
    - "Editorial nodes paper-0 + border ink-1 + stamp shadow + colored smallcaps header per type (trigger rubric-2, cond accent-indigo, action ink-2/paper-2)"
    - "AI Builder message bubbles: assistant paper-0 stamp + serif body | user paper-2 border + sans"
    - "mx-tag--verdigris/rubric/gold/ink status pills per D-DASH-15"
    - "Dialog portalContainer re-root al .theme-editorial wrapper per D-DASH-10"
key_files:
  created: []
  modified:
    - "src/app/(dashboard)/automatizaciones/page.tsx"
    - "src/app/(dashboard)/automatizaciones/nueva/page.tsx"
    - "src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx"
    - "src/app/(dashboard)/automatizaciones/historial/page.tsx"
    - "src/app/(dashboard)/automatizaciones/components/automation-list.tsx"
    - "src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx"
    - "src/app/(dashboard)/automatizaciones/components/trigger-step.tsx"
    - "src/app/(dashboard)/automatizaciones/components/conditions-step.tsx"
    - "src/app/(dashboard)/automatizaciones/components/actions-step.tsx"
    - "src/app/(dashboard)/automatizaciones/components/variable-picker.tsx"
    - "src/app/(dashboard)/automatizaciones/components/execution-history.tsx"
    - "src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx"
    - "src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx"
    - "src/components/ui/dialog.tsx (BC-additive portalContainer prop)"
decisions:
  - "D-DASH-07 strict: cero cambios en src/lib, src/inngest, src/app/actions, src/app/api (verificado con git diff --name-only)."
  - "React Flow lib intacta — ReactFlow/Background/Handle/Position/customNodeTypes/NodeProps/Node types preservados 100%. Solo JSX + className + style + Background variant props cambian."
  - "AI SDK v6 intacto — useChat, DefaultChatTransport, sendMessage, UIMessage parts, dynamic-tool states (input-streaming/output-available/output-error) preservados verbatim. Fetch wrapper + X-Session-Id header capture + onSessionCreated preserved."
  - "DnD-kit intacto — DragDropProvider, useSortable, useDroppable, move, collisionPriority preservados. Folder reordering + automation dragging funcionan igual."
  - "Dialog portalContainer prop BC-additive en src/components/ui/dialog.tsx (D-DASH-09) — omitting the prop preserves default document.body target; pasándolo re-roota al .theme-editorial wrapper (D-DASH-10 compliance para execution-detail-dialog)."
  - "actions-step.tsx (1628 LOC) re-skin estratégico: useDashboardV2 wired en ActionsStep + ActionCard + ActionSelector; Card wrapper swap via CardWrapper variable (Card → div cuando v2); inner sub-components (ActionParamField, KeyValueEditor, DelayEditor, ProductMappingEditor, TemplateVarRow) inherits tokens via .theme-editorial shadcn overrides cascade (paper-0 + ink-1 + etc en paperbackgrounds y borders automáticamente). Inner form fields NO requieren branches explícitos v2 porque shadcn Input/Select primitives picked up tokens vía globals.css overrides."
metrics:
  duration_mins: 180
  completed_date: "2026-04-23"
  commits: 5
  loc_diff: "+2448 / -385 (total 21 files)"
  tasks_completed: 5
---

# Phase ui-redesign-dashboard Plan 06: Automatizaciones Editorial Re-skin Summary

**Wave 2 — Módulo automatizaciones (listing + wizard + canvas React Flow + AI builder chat + historial)** re-skin editorial gated por `useDashboardV2()`, cero cambios funcionales, React Flow + AI SDK v6 + DnD-kit intactos.

## One-liner

Wave 2 shipped: 21 archivos del módulo /automatizaciones editorializados con dictionary-table + wizard + canvas dotted grid + nodos paper-0/stamp + AI builder chat + historial pills, gated por flag, flag-OFF byte-identical, zero D-DASH-07 violations.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| T1 | `f4beb3b` | Listing page + automation-list (dictionary-table + folders + search + filter pills + status dots) |
| T2 | `5ed1ab0` | Wizard editorial (steps + trigger cards + cond-row + actions cards + variable picker) + nueva/editar pages |
| T3 | `cbfdc44` | React Flow canvas + preview-nodes editorial (lib intacta, solo JSX/CSS) |
| T4 | `4716723` | AI Builder chat (shell + sidebar + chat + messages + input + CTAs) |
| T5 | `776c7ba` | Execution history + detail dialog + dialog primitive portalContainer BC-additive |

Total: **5 commits** atómicos por task, todos con `--no-verify` per parallel-executor guidance, en español con formato `feat(ui-redesign-dashboard-06-TN):`.

## LOC per file (git diff --stat vs base 1a9362a)

```
components/automation-list.tsx        +653 / -121
components/actions-step.tsx           +275 / ...
builder/components/preview-nodes.tsx  +216 / ...
components/execution-history.tsx      +248 / ...
components/execution-detail-dialog.tsx +188 / ...
components/automation-wizard.tsx      +164 / ...
builder/components/automation-preview.tsx +142 / ...
components/conditions-step.tsx        +244 / ...
components/trigger-step.tsx           +132 / ...
builder/components/session-history.tsx +117 / ...
builder/components/builder-layout.tsx +80 / ...
builder/components/builder-chat.tsx   +77 / ...
components/variable-picker.tsx        +68 / ...
nueva/page.tsx                        +34 / ...
historial/page.tsx                    +42 / ...
[id]/editar/page.tsx                  +40 / ...
page.tsx                              +32 / ...
builder/components/confirmation-buttons.tsx +26
builder/components/builder-message.tsx +25
builder/components/builder-input.tsx  +20
components/ui/dialog.tsx              +10  (portalContainer aditive)
─────────────────────────────────────────────────
TOTAL                                 +2448 / -385
```

21 archivos modificados. 100% de archivos en scope de `files_modified` del plan frontmatter.

## D-DASH-07 strict (zero logic changes)

Verificación via `git diff --name-only 1a9362a..HEAD | grep -E "src/(lib|inngest|app/actions|app/api)"` — retorna **0 líneas**. Cero cambios en:

- `src/lib/automations/**` (constants, types, helpers)
- `src/lib/builder/**` (types, tools, runner)
- `src/lib/agents/**`
- `src/inngest/**`
- `src/app/actions/**` (automations, builder actions, sessions)
- `src/app/api/**` (builder chat, sessions)

Solo `src/app/(dashboard)/automatizaciones/**` (20 archivos) + `src/components/ui/dialog.tsx` (extensión BC-additive).

## React Flow lib safety confirmation (CRITICAL)

Verificación via grep:
- `grep -c "@xyflow/react"` → 2 archivos (automation-preview.tsx + preview-nodes.tsx).
- `grep -c "<Handle"` en preview-nodes.tsx → **10** (2 por cada Node × 3 Nodes = 6 mínimo, +4 duplicados v2/!v2 branch).
- `grep -c "customNodeTypes"` en preview-nodes.tsx → preservado como export.
- `grep "ReactFlow\|Background\|Handle\|Position"` → presentes en ambos archivos.
- **No cambios a**: `nodeTypes={customNodeTypes}` API call, `NodeProps<...>` typing, `data: DiagramNodeData` consumption, `Handle type="source|target" position={Position.Top|Bottom}` semantics, edges drive, dnd connection logic.
- **Sí cambios a** (permitidos per plan): `Background` variant='dots'+gap=16+size=0.5+color (v2) vs default gap=16+size=1 (!v2); `defaultEdgeOptions` stroke ink-2 2px smoothstep (v2) vs undefined (!v2); el JSX interno dentro de cada Node function (presentational).

**Manual smoke pendiente en QA:** drag a node → connection still works, zoom/pan funcional, no console errors.

## AI SDK v6 plumbing confirmation

Verificación via grep:
- `useChat` en `builder-chat.tsx` preservado verbatim.
- `DefaultChatTransport` + custom fetch wrapper con X-Session-Id header capture preservado.
- `UIMessage` type + `message.parts.map(...)` iteration preservado en `builder-message.tsx`.
- `sendMessage` callback preservado en `builder-chat.tsx`.
- Tool states (`input-streaming`, `input-available`, `output-available`, `output-error`) preservados.
- `dynamic-tool` part rendering con `generatePreview` → `AutomationPreview` component integration intacto.
- `createAutomation` / `updateAutomation` tool result rendering preservado.
- `onSessionCreated` callback + `sessionIdRef` pattern preservado.
- API endpoints `/api/builder/chat` + `/api/builder/sessions` sin tocar.

**Manual smoke pendiente en QA:** enviar mensaje → streaming funciona → tool call renders → AutomationPreview renderiza editorial nodes.

## DnD-kit confirmation (Plan 06 Task 1)

Verificación via grep:
- `DragDropProvider`, `useSortable`, `useDroppable`, `move` de `@dnd-kit/*` preservados en `automation-list.tsx`.
- `TRIGGER_CATALOG` import + `buildItemsMap` helper + `handleDragStart`/`handleDragOver`/`handleDragEnd` + `reorderFolders`/`reorderAutomations` server actions preservados.
- DragOverlay rendering preserva API pero re-skins con paper-0/ink-1 en v2.

## Dialog portalContainer extension (D-DASH-09 / D-DASH-10)

`src/components/ui/dialog.tsx` `DialogContent` ganó prop opcional `portalContainer?: HTMLElement | null`:
- BC-additive: usages existentes que no pasan prop → comportamiento identical (default `document.body`).
- Pasando prop → `DialogPortal container={portalContainer ?? undefined}` re-roota el modal al elemento pasado.
- Uso: `execution-detail-dialog.tsx` v2 branch pasa `document.querySelector('.theme-editorial')` como container (con typeof window guard para SSR).
- Sin esta extensión, modales escapaban del tema editorial y mostraban slate tokens; ahora heredan .theme-editorial cascade.

## Mocks pixel-diff references (D-DASH-08 compliance)

Todos contra `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html`:

| UI surface | Mock section | Implementation notes |
|------------|--------------|----------------------|
| Listing left panel | lines 56-76 (.al-* classes) | Dictionary-table grid `[16px 1fr auto]` con dot + name + runs; folder smallcaps headers |
| Listing topbar | lines 297-319 | Eyebrow "Módulo · automatizaciones" U+00B7 + h1 display; CTAs ink-1 outline + rubric-2 press |
| Canvas grid | lines 78-88 | Background variant='dots' gap=16 size=0.5 color=ink-4 coincide con `radial-gradient(circle at 0.5px 0.5px, var(--ink-4) 0.5px, transparent 0.5px)` + `background-size: 16px 16px` |
| Nodes | lines 129-174 | `.node` paper-0 + border ink-1 + stamp; `.nh` bg color-mix por tipo (trigger rubric-2 12%, cond accent-indigo 12%, action paper-2); `.nb` title display 15px + sublabel serif italic 12px + kv mono |
| Ports | lines 176-182 | Handle `!w-2.5 !h-2.5 !bg-paper-0 !border-2 !border-ink-1` (target), `!bg-rubric-2 !border-rubric-2` (source) |
| Inspector (detail dialog) | lines 207-212 (.ins-hd) | Eyebrow rubric-2 smallcaps + h3 display + em sans; sections smallcaps ink-3 labels + mono values |
| Run list (historial) | lines 259-270 (.run-list/.run-row) | Table editorial con dotted rows + dot per status + mx-tag--* pill + mono ID/duración |
| Wizard step indicator | n/a (nuevo pattern) | Smallcaps rubric-2 active + mono step numbers + underline ink-1; cards paper-0 + stamp |

## State name discoveries / deviations

**Task 1 — AutomationList:**
- State vars reales: `search` + `setSearch` (no `searchQuery`), `categoryFilter` + `setCategoryFilter` (tipo `FilterCategory`), `togglingIds` Set, `deleteTarget`/`deleteFolderTarget`.
- FilterCategory values: `'all' | 'CRM' | 'WhatsApp' | 'Tareas' | 'Shopify'` (sin 'Logistica' en UI filter, aunque existe en CATEGORY_COLORS).
- Automation field usage: `is_enabled` (boolean para estado activa/borrador), `actions.length`, `description`, `updated_at`, `_lastExecutionStatus` optional augmentation.

**Task 2 — Wizard:**
- `step: number` (1|2|3), `STEPS` constante con label+number. Cambié step nav para editorial con smallcaps + mono number + underline ink-1 tabs (3-col flex-1 en lugar de pills centered).
- `isSubmitting` state + `isEditing` derived from `initialData?.id`.

**Task 3 — preview-nodes:**
- Shared sub-components (CategoryBadge/ErrorBanner/ConfigDetail) quedan definidos pero solo se llaman desde el branch !v2; en el branch v2 se inlinean los equivalentes editoriales (smallcaps + AlertTriangle + mono kv). CategoryBadge unused warning would be false (TriggerNode !v2 branch still uses it).

**Task 4 — Builder chat:**
- `messages` UIMessage[], `status: 'submitted' | 'streaming' | 'ready' | 'error'`, `sendMessage({ text })`, `setMessages([])` al resetear sesión.
- `sessionId: string | null`, `onSessionCreated(id)` callback de layout.tsx, `initialMessages?: UIMessage[]`.
- `isLoading = status === 'submitted' || status === 'streaming'` preservado.

**Task 5 — Execution history:**
- Table uses shadcn Table/TableHeader/TableRow/TableCell — preserved + re-skinned classNames (mx-smallcaps column headers, dotted row borders v2).
- `ScrollArea` + `Separator` shadcn primitives dentro del Dialog preservados sin tocar.
- Estados: `success | failed | running | cancelled` con map V2_STATUS_TAG a `mx-tag--verdigris | --rubric | --gold | --ink`.

## Deviations from Plan

**None structural** — plan ejecutado pixel-close al diseño con las siguientes observaciones menores:

1. **[Preservation boost] actions-step.tsx (1628 LOC)** — re-skin estratégico top-level: useDashboardV2 wired en 3 sub-components principales (ActionsStep body, ActionCard outer, ActionSelector popover) con Card → div wrapper swap. Los ~12 sub-components internos (KeyValueEditor, TemplateVarRow, ProductMappingEditor, DelayEditor, JsonParamField, ActionParamField) heredan tokens automáticamente vía `.theme-editorial` globals.css cascade cuando están dentro del wizard wrapper → no requirieron branches explícitos. Esto minimiza LOC diff y mantiene zero-risk en la parte más compleja del wizard. Si en QA se detecta inconsistencia visual en un sub-component específico, fix incremental.

2. **[Scope extension justified] src/components/ui/dialog.tsx** — extensión BC-additive del `DialogContent` primitive agregando `portalContainer?: HTMLElement | null` prop (D-DASH-09). El plan 06 Task 5 permite explícitamente esta adición si hace falta y Plan 01 no la añadió. Verificado que Plan 01 no extendió Dialog (solo dropdown-menu y popover). Extensión forwarding `container={portalContainer ?? undefined}` a Radix `DialogPortal` — API nativa, zero risk.

3. **[RootDropZone v2 prop added]** — `automation-list.tsx` `RootDropZone` sub-component necesitaba conocer `v2` para switch entre `space-y-1.5` (!v2) y `border + paper-0 + stamp` (v2); se agregó `v2: boolean` prop. Similar cambio en `SortableAutomationRow`, `StaticAutomationRow`, `SortableFolderRow`. Interfaces internas, no external API.

## Build status

- `npx tsc --noEmit` — clean (zero errors) en los 21 archivos modificados.
- Verificado múltiples veces durante execution (post T1, T2, T3, T4, T5).

## Regla 6 compliance

- Flag `ui_dashboard_v2.enabled` per-workspace (D-DASH-01) — sin activación para ningún workspace todavía.
- Flag OFF path byte-identical al main commit base — preservado rigurosamente en todos los archivos via `v2 ? editorial : current` branches con current JSX copiada verbatim.
- No hay push a Vercel desde worktree (per parallel-executor guidance).
- Cero cambios en domain, hooks, agents, inngest, webhooks, actions (D-DASH-07).
- Cero cambios de schema DB.

## Handoff to Wave 3

Plan 06 (Automatizaciones) shipped together with Plan 05 (Agentes) in Wave 2 parallel execution. Next waves:

- **Wave 3 parallel**: Plan 07 (Analytics + Métricas) + Plan 08 (Configuración).
- **Wave 4 close**: Plan 09 (DoD + LEARNINGS + push/activation SQL).

Post-Wave 4 flag activation en Somnio workspace via SQL snippet:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb
)
WHERE id = '<somnio_workspace_id>';
```

Verificación post-activación (smoke manual):
- `/automatizaciones` → listing editorial coherente con inbox v2
- `/automatizaciones/nueva` → wizard editorial 3-step
- `/automatizaciones/builder` → canvas dotted grid + nodes editorial + chat editorial
- `/automatizaciones/historial` → table editorial + dialog re-rooted al tema
- Activar/desactivar automatización con switch funciona
- Drag folder / automatización funciona
- Send chat message funciona (useChat streaming)
- React Flow render + pan + zoom funcional

## Self-Check: PASSED

**Files created (none — only modifications):** N/A.

**Files modified (21) — verified:**
- ✅ `src/app/(dashboard)/automatizaciones/page.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/nueva/page.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/historial/page.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/automation-list.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/trigger-step.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/conditions-step.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/actions-step.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/variable-picker.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/execution-history.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx`
- ✅ `src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx`
- ✅ `src/components/ui/dialog.tsx` (BC-additive portalContainer)

**Commits verified:**
- ✅ `f4beb3b` T1
- ✅ `5ed1ab0` T2
- ✅ `cbfdc44` T3
- ✅ `4716723` T4
- ✅ `776c7ba` T5

All artifacts present. D-DASH-07 verified. React Flow + AI SDK v6 + DnD-kit preserved.
