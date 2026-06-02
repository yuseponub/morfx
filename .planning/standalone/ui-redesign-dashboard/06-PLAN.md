---
phase: ui-redesign-dashboard
plan: 06
type: execute
wave: 2
depends_on: ['01']
files_modified:
  - src/app/(dashboard)/automatizaciones/page.tsx
  - src/app/(dashboard)/automatizaciones/nueva/page.tsx
  - src/app/(dashboard)/automatizaciones/historial/page.tsx
  - src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx
  - src/app/(dashboard)/automatizaciones/components/automation-list.tsx
  - src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx
  - src/app/(dashboard)/automatizaciones/components/trigger-step.tsx
  - src/app/(dashboard)/automatizaciones/components/conditions-step.tsx
  - src/app/(dashboard)/automatizaciones/components/actions-step.tsx
  - src/app/(dashboard)/automatizaciones/components/execution-history.tsx
  - src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx
  - src/app/(dashboard)/automatizaciones/components/variable-picker.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx
  - src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx
autonomous: true
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-11
  - D-DASH-14
  - D-DASH-15
  - D-DASH-16

must_haves:
  truths:
    - "Cuando `useDashboardV2()===true`, la lista de automatizaciones (`automation-list.tsx`) renderiza con eyebrow `mx-smallcaps` color `var(--rubric-2)` texto `'Módulo · automatizaciones'` (medium-dot U+00B7), h1 serif 24-26px `'Automatizaciones'`, y filas tipo dictionary-table (paper-2 bg + border ink-1 + smallcaps column headers + serif row body) per D-DASH-08/D-DASH-11 — mock `automatizaciones.html` left panel + topbar"
    - "Cuando `useDashboardV2()===false`, todas las páginas y componentes de automatizaciones renderean byte-identical al main actual (current shadcn slate UI preservado en branch `!v2`)"
    - "El flow canvas (React Flow en `automation-preview.tsx` + `preview-nodes.tsx`) cuando v2 ON: nodos con `border: 1px solid var(--ink-1)`, `background: var(--paper-0)`, `box-shadow: 0 1px 0 var(--ink-1)` (stamp shadow editorial), header del nodo con smallcaps rubric-2 uppercase `font-weight 700 letter-spacing 0.14em font-size 10px`, body con title serif 15px ink-1 + sublabel italic serif 12px ink-3, mini-icons monocromos lucide a 14x14 ink-2 (NO purple/violet/amber dark colors actuales)"
    - "React Flow lib intacta — preservar `<ReactFlow>`, `<Handle>`, `<Position>`, `customNodeTypes` exports, `nodeTypes` mapping, edges/handles/dnd logic. Solo cambian className/style/JSX presentational dentro de `TriggerNode`/`ConditionNode`/`ActionNode` functions"
    - "Edges del React Flow background cuando v2: `Background` color `var(--ink-4)` con `gap=16` `size=0.5` (dotted grid editorial análogo al mock `radial-gradient(circle at 0.5px 0.5px, var(--ink-4) 0.5px, transparent 0.5px)`); edges path stroke ink-2 hairline 2px (overrides default React Flow CSS via inline style en `<ReactFlow>` `defaultEdgeOptions`)"
    - "Inspector panel — el archivo equivalente en este código es `execution-detail-dialog.tsx` (modal de ejecución) + las step pages del wizard que actúan como inspector lateral. Cuando v2: `bg-[var(--paper-2)]`, `border-l border-[var(--ink-1)]`, smallcaps section headings `mx-smallcaps`, fields editorial per D-DASH-14 (label smallcaps 10-11px tracking-0.12em uppercase, input border ink-1 paper-0 bg rounded-[3px]), focus ring ink-1 (no slate)"
    - "Wizard pasos (`automation-wizard.tsx` + `trigger-step.tsx` + `conditions-step.tsx` + `actions-step.tsx`) cuando v2: step headers smallcaps rubric-2 uppercase con número mono + label serif, cards paper-0 + border ink-1, primary CTAs `bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)]` (rubric-2 press pattern landing-confirmed), secondary CTAs ink-1 outline. Lógica de step navigation/state intacta"
    - "Search/filters bar del listado (en `automation-list.tsx`) cuando v2: input `bg-[var(--paper-0)] border border-[var(--border)] rounded-[var(--radius-2)]` con icono Search lucide left-positioned + placeholder serif italic `'Buscar flujo…'` per mock `.al-search`. Filter category buttons (`'Todos'|'CRM'|'WhatsApp'|'Tareas'|'Shopify'`) usan `.mx-tag--*` editorial pills"
    - "Status/state badges (Activa/Pausada/Borrador) cuando v2: usar `.mx-tag--verdigris` (Activa) / `.mx-tag--gold` (Pausada) / `.mx-tag--ink` (Borrador) per D-DASH-15. La dot indicator (8x8 colored dot del mock `.al-item .dot`) en el listing item: `bg-[var(--semantic-success)]` (active) / `bg-[var(--accent-gold)]` (paused) / `bg-[var(--ink-4)]` (draft)"
    - "Empty/loading/error states cuando v2 (per D-DASH-08 + README §10 del handoff): empty list usa `mx-h3` + `mx-caption` + `mx-rule-ornament '· · ·'`; loading usa skeleton paper-2 con `animate-[mx-pulse_1.5s_ease-in-out_infinite]` (keyframes ya en globals.css desde Wave 0 fase inbox); error usa `mx-h4` + texto serif explicativo + botón retry rubric-2 outline"
    - "AI Builder chat (`builder-layout.tsx` + `builder-chat.tsx` + `builder-message.tsx` + `builder-input.tsx` + `session-history.tsx`) cuando v2: chat container `bg-[var(--paper-1)]`, mensajes en cards `bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]` (assistant) vs `bg-[var(--paper-2)] border border-[var(--border)]` (user), input box border ink-1 + paper-0 bg + send button rubric-2 press, session-history sidebar paper-2 + smallcaps section labels. Lógica de useChat / DefaultChatTransport / sendMessage / UIMessage intacta"
    - "Confirmation buttons (`confirmation-buttons.tsx`) cuando v2: primary 'Crear' = rubric-2 press; secondary 'Cancelar' = ink-1 outline; destructive variant si existe = rubric-1 outline (D-DASH-14)"
    - "Cero cambios funcionales (D-DASH-07): NO se modifica `src/lib/automations/**`, `src/inngest/functions/**`, `src/app/actions/automations.ts`, `src/lib/builder/**`, `src/lib/agents/**`, types, schemas, server actions, useChat hooks, DragDropProvider/useSortable, dnd-kit move/sort logic, UnifiedEngine, automation runners, Inngest event dispatch, action enrichment. Verificable con `git diff` sobre estos paths: 0 líneas modificadas"
    - "Página `/automatizaciones/historial/page.tsx` cuando v2 → `execution-history.tsx` muestra timeline editorial (run rows con mono `id` + serif italic `time` + status pill mx-tag) per mock `.run-list`/`.run-row`. `execution-detail-dialog.tsx` (modal) re-rooted via portalContainer al `.theme-editorial` wrapper (D-DASH-09/D-DASH-10) para que el modal herede el tema"
    - "Sub-nav interno del módulo (tabs Flujo/Ejecuciones/Analytics/Versiones/Permisos del mock topbar — actualmente NO existen como navegación, solo el botón 'Historial' va a `/historial`). PRESERVAR existencia actual; SOLO si hay tabs/pills/sub-nav reales en el código (verificar lectura), aplicar D-DASH-16: smallcaps rubric-2 uppercase + underline border ink-1 hover/active. Si no hay tabs, este truth se considera no-aplicable (anotar en SUMMARY)"
    - "Build pasa: `npx tsc --noEmit` clean en los 21 archivos modificados. `git diff --name-only` muestra cambios SOLO en `src/app/(dashboard)/automatizaciones/**`, no en domain/inngest/lib/agents/actions"
  artifacts:
    - path: "src/app/(dashboard)/automatizaciones/page.tsx"
      provides: "Listing page wrapper con eyebrow + h1 editorial cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/automation-list.tsx"
      provides: "Dictionary-table list con folders + filter buttons + search + status dots editorial gated"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx"
      provides: "Wizard 3-step container con step headers smallcaps rubric-2 + cards paper-0 cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/trigger-step.tsx"
      provides: "Trigger selection step con cards editorial + form fields D-DASH-14 cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/conditions-step.tsx"
      provides: "Conditions builder con cond-row pattern del mock (paper-0 border + grid 1fr auto 1fr) cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/actions-step.tsx"
      provides: "Actions builder con form fields editorial + variable picker integration cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/execution-history.tsx"
      provides: "Run list con mono id + serif italic time + status pills cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx"
      provides: "Detail modal con paper-2 inspector treatment + portalContainer re-root cuando v2 (D-DASH-10)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/components/variable-picker.tsx"
      provides: "Picker dropdown con paper-0 bg + ink-1 border + smallcaps category labels cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx"
      provides: "ReactFlow container con Background editorial (ink-4 dots gap 16) cuando v2 — lib intacta, solo style props"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx"
      provides: "TriggerNode/ConditionNode/ActionNode JSX re-skin (ink-1 border, paper-0 bg, smallcaps headers, monocromo icons) cuando v2 — Handle/Position/customNodeTypes export intactos"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx"
      provides: "Builder shell layout con paper-1 bg + sidebar paper-2 cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx"
      provides: "Chat scroll container con mensajes editorial cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx"
      provides: "Message bubbles assistant (paper-0 stamp) vs user (paper-2) cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx"
      provides: "Input box con border ink-1 + paper-0 + rubric-2 send button cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx"
      provides: "Session sidebar con paper-2 + smallcaps labels cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx"
      provides: "Primary rubric-2 press + secondary ink-1 outline cuando v2"
      contains: "useDashboardV2"
  key_links:
    - from: "src/app/(dashboard)/automatizaciones/page.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/automatizaciones/components/automation-list.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook (per-component, since each Node function is a React component)"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx"
      to: "@xyflow/react"
      via: "ReactFlow + Background imports (DO NOT replace)"
      pattern: "ReactFlow|Background|Handle|Position"
    - from: "src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx"
      to: "src/components/ui/dialog.tsx"
      via: "Dialog primitive (extend portalContainer prop si Plan 01 no lo añadió ya)"
      pattern: "Dialog|DialogContent"
---

<objective>
Wave 2 — Re-skin completo del módulo Automatizaciones al lenguaje editorial morfx, gated por `useDashboardV2()`. Cubre 21 archivos: páginas (listing, nueva, historial, editar), componentes del listado/wizard/historial, y todo el builder AI (chat + canvas React Flow + preview nodes). El módulo más grande del dashboard re-skin (Plan 06 del mega-fase) porque el AI builder + flow canvas duplica la superficie visual vs otros módulos.

**Purpose:** Cerrar la coherencia visual del módulo más visible del agent-tier (automation flows = uno de los 4 módulos core del producto). El flow canvas de React Flow es el componente más representado en demos y screenshots, así que su re-skin editorial es alto-impacto. Mantener React Flow library 100% funcional (handles, edges, dnd, custom node types) — solo cambian estilos visuales.

**Output:** Cuando flag ON, todas las superficies de `/automatizaciones/**` se ven editoriales: listing dictionary-table, wizard editorial cards, canvas con dotted grid + nodos paper-0 con stamp shadow + smallcaps headers monocromos, AI builder chat con mensajes editorial. Cuando flag OFF, byte-identical al main actual. Cero cambios al engine/runners/Inngest/domain (D-DASH-07 verifiable via git diff).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/README.md

# Wave 0 outputs (dependencies — Plan 01 must be shipped):
@src/components/layout/dashboard-v2-context.tsx
@src/app/(dashboard)/layout.tsx
@src/lib/auth/dashboard-v2.ts

# Reference patterns from sibling phase ui-redesign-conversaciones (already shipped):
@.planning/standalone/ui-redesign-conversaciones/02-PLAN.md
@.planning/standalone/ui-redesign-conversaciones/05-PLAN.md

# Source files in scope (21 files):
@src/app/(dashboard)/automatizaciones/page.tsx
@src/app/(dashboard)/automatizaciones/nueva/page.tsx
@src/app/(dashboard)/automatizaciones/historial/page.tsx
@src/app/(dashboard)/automatizaciones/components/automation-list.tsx
@src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx
@src/app/(dashboard)/automatizaciones/components/trigger-step.tsx
@src/app/(dashboard)/automatizaciones/components/conditions-step.tsx
@src/app/(dashboard)/automatizaciones/components/actions-step.tsx
@src/app/(dashboard)/automatizaciones/components/execution-history.tsx
@src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx
@src/app/(dashboard)/automatizaciones/components/variable-picker.tsx
@src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx
@src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx
@src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx
@src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx
@src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx
@src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx
@src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx
@src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx

<interfaces>
<!-- From Wave 0 (Plan 01) — already shipped: -->

useDashboardV2 hook (mismo pattern que useInboxV2 de fase inbox v2):
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider
```

`.theme-editorial` CSS scope (already in globals.css desde fase inbox v2):
- Utilities: `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament`, `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}`
- Tokens: `var(--paper-0)` `var(--paper-1)` `var(--paper-2)` `var(--paper-3)`, `var(--ink-1)` `var(--ink-2)` `var(--ink-3)` `var(--ink-4)`, `var(--rubric-1)` `var(--rubric-2)`, `var(--accent-gold)` `var(--accent-indigo)` `var(--accent-verdigris)`, `var(--semantic-success)`, `var(--border)`, `var(--font-display)` `var(--font-sans)` `var(--font-serif)` `var(--font-mono)`, `var(--radius-2)` `var(--radius-3)`
- Keyframes: `mx-pulse` (loading skeleton)
- Shadcn token overrides cuando .theme-editorial activo: --background → paper-1, --primary → ink-1, --border → ink-4

Existing React Flow API (DO NOT MODIFY signatures — preview-nodes.tsx exports):
```typescript
// preview-nodes.tsx exports
export const customNodeTypes = {
  triggerNode: TriggerNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
}

// automation-preview.tsx uses:
import { ReactFlow, Background } from '@xyflow/react'
import { customNodeTypes } from './preview-nodes'
<ReactFlow nodes={...} edges={...} nodeTypes={customNodeTypes} ... >
  <Background />
</ReactFlow>

// Per-node component signature (DO NOT change):
function TriggerNode({ data }: NodeProps<TriggerNodeType>) { ... <Handle type="source" position={Position.Bottom} /> ... }
```

Existing AutomationListProps (preserve):
```typescript
interface AutomationListProps {
  initialAutomations: Automation[]
  initialFolders: AutomationFolder[]
}
```

Existing WizardProps (preserve):
```typescript
export interface WizardProps {
  initialData?: AutomationFormData & { id?: string }
  pipelines: PipelineWithStages[]
  tags: Tag[]
  templates?: Template[]
  products?: Product[]
}
```

DiagramNodeData type (consumed por preview-nodes — DO NOT MODIFY):
```typescript
import type { DiagramNodeData } from '@/lib/builder/types'
// shape includes: label, category, hasError, triggerConfig, etc.
```
</interfaces>

<critical_constraints>
**CONSTRAINTS DE ESTA FASE (D-DASH-07 + Regla 6 + react-flow lib safety):**

1. **UI-only.** Cero cambios en `src/lib/automations/**`, `src/inngest/functions/**`, `src/app/actions/automations.ts`, `src/lib/builder/**`, `src/lib/agents/**`, ni cualquier hook (useChat, useConversations, etc). Verificable con `git diff --name-only | grep -E "^src/(lib|inngest|app/actions)"` retornando 0 líneas.

2. **React Flow lib intacta.** NO reemplazar `<ReactFlow>` con custom canvas. NO modificar `customNodeTypes` mapping. NO cambiar Handle/Position semantics. NO tocar edges/dnd/handles wiring. SOLO cambiar:
   - className/style props internos a TriggerNode/ConditionNode/ActionNode functions
   - Background props (color, gap, size, variant) — ya son props nativos del componente
   - defaultEdgeOptions style si se necesita sobrescribir stroke
   - El JSX dentro de cada Node component function (presentational)

3. **Flag-OFF byte-identical.** Para CADA archivo, el branch `!v2` debe renderear EXACTAMENTE lo mismo que main actual. Pattern obligatorio:
   ```tsx
   const v2 = useDashboardV2()
   return v2 ? <EditorialVersion /> : <CurrentVersion />
   // O bien:
   className={cn(baseClasses, v2 ? 'editorial-classes' : 'current-classes')}
   ```

4. **Shadcn primitives.** NO modificar `src/components/ui/*`. Si Dialog/Sheet/Popover necesitan portalContainer prop para re-root al wrapper editorial (D-DASH-10), Plan 01 ya extendió esos primitives — usar la prop existente. Si Plan 01 no extendió Dialog (solo dropdown-menu/popover en fase inbox), esta fase puede agregar `portalContainer` a Dialog SOLO si es estrictamente necesario y solo aditivamente (BC).

5. **Copy intacto.** No crear keys i18n nuevas. Si el mock tiene texto nuevo (eyebrows, smallcaps decorativos), hardcode en español per D-DASH-18.

6. **Cookie/workspace_id resolution intacta.** `nueva/page.tsx` usa `cookies().get('morfx_workspace')` — preservar verbatim. NO mover a server action ni cambiar cookie name.

7. **DnD-kit intacto.** `automation-list.tsx` usa `DragDropProvider`/`useSortable`/`move` de `@dnd-kit/react` para folder reordering. NO tocar la lógica de drag/drop. SOLO re-skinear los handles/grip icons (lucide GripVertical) y la apariencia de DragOverlay.
</critical_constraints>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin listing page + automation-list.tsx (dictionary-table + folders + search + filter pills + status dots)</name>
  <files>src/app/(dashboard)/automatizaciones/page.tsx, src/app/(dashboard)/automatizaciones/components/automation-list.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/page.tsx (15 LOC — server component wrapper)
    - src/app/(dashboard)/automatizaciones/components/automation-list.tsx (full 1228 LOC — paginar la lectura por bloques: lines 1-100 imports + types, 100-300 utility funcs + filter logic, 300-550 folder/dnd handlers, 551+ component body con render JSX. NO leer todo el archivo de una sola pasada por ser >2000 LOC; usar Grep para localizar bloques específicos: `grep -n "return\|className=\|<Card\|<Badge\|<Input\|<Button" src/app/(dashboard)/automatizaciones/components/automation-list.tsx | head -80`)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 56-76 (al-* classes), lines 322-411 (left list panel structure)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 297-319 (topbar: crumb + h1 + tag-state + actions)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/README.md §6 (mx-tag classes), §10 (loading/empty/error)
  </read_first>
  <action>
    **Step 1 — page.tsx (15 LOC):** Convertir a Client Component shell wrapper o leer flag en server component vía `getIsDashboardV2Enabled(workspaceId)` + pasar prop a `<AutomationList v2={dashV2}>`. PREFERIR la segunda opción para evitar 'use client' en page (el archivo es server component actualmente). Read flag from cookies workspace + dashboard-v2 helper:

    ```tsx
    // src/app/(dashboard)/automatizaciones/page.tsx
    import { cookies } from 'next/headers'
    import { getAutomations, getFolders } from '@/app/actions/automations'
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    import { AutomationList } from './components/automation-list'

    export default async function AutomatizacionesPage() {
      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value
      const dashV2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false
      const [automations, folders] = await Promise.all([getAutomations(), getFolders()])
      return (
        <div className="flex-1 overflow-y-auto">
          <div className={dashV2 ? 'px-6 py-5 space-y-4' : 'container py-6 space-y-6'}>
            {dashV2 && (
              <div className="border-b border-[var(--ink-1)] pb-4">
                <span className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  Módulo · automatizaciones
                </span>
                <h1 className="mt-1 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Automatizaciones
                </h1>
              </div>
            )}
            <AutomationList initialAutomations={automations} initialFolders={folders} />
          </div>
        </div>
      )
    }
    ```

    NOTE: pasar el flag como prop a `AutomationList` también funciona, pero como `automation-list.tsx` ya es Client Component que puede leer el context vía `useDashboardV2()`, NO necesitas prop drilling. Usa el hook directamente dentro de `automation-list.tsx`.

    **Step 2 — automation-list.tsx (1228 LOC):** Add hook + branch render según v2.

    Add at top of imports:
    ```tsx
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```

    Inside `AutomationList` component body (line ~556), add:
    ```tsx
    const v2 = useDashboardV2()
    ```

    **Step 3 — Re-skin search input bar (find with grep `<Input.*placeholder.*[Bb]uscar`):** Wrap className with v2 conditional. The mock pattern (`.al-search`):
    ```tsx
    <div className={cn('relative', v2 ? 'px-0 py-2' : '...current...')}>
      {v2 && <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[var(--ink-3)] pointer-events-none" aria-hidden />}
      <Input
        placeholder={v2 ? 'Buscar flujo…' : '...current placeholder...'}
        className={cn(
          v2
            ? 'w-full bg-[var(--paper-0)] border-[var(--border)] rounded-[var(--radius-2)] py-1.5 pr-3 pl-8 text-[12px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:ring-[var(--ink-1)]'
            : '...preserve current classes byte-identical...'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
    ```

    **Step 4 — Re-skin filter category buttons (find with grep `FilterCategory|setFilter\|'CRM'\|'WhatsApp'\|'Tareas'\|'Shopify'`):**
    ```tsx
    <div className="flex gap-2 flex-wrap">
      {(['all', 'CRM', 'WhatsApp', 'Tareas', 'Shopify'] as const).map((cat) => {
        const isActive = filterCategory === cat
        const labels = { all: 'Todos', CRM: 'CRM', WhatsApp: 'WhatsApp', Tareas: 'Tareas', Shopify: 'Shopify' }
        return v2 ? (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCategory(cat)}
            className={cn(
              'px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors border',
              isActive
                ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                : 'bg-transparent text-[var(--ink-3)] border-[var(--border)] hover:text-[var(--ink-1)] hover:border-[var(--ink-1)]'
            )}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {labels[cat]}
          </button>
        ) : (
          /* preserve current Button/Badge JSX byte-identical for !v2 */
          <Button key={cat} variant={isActive ? 'default' : 'outline'} size="sm" onClick={() => setFilterCategory(cat)}>
            {labels[cat]}
          </Button>
        )
      })}
    </div>
    ```
    Use whatever variable names actually exist in the file (`filterCategory`/`setFilterCategory` may be different — use Grep first).

    **Step 5 — Re-skin folder + automation row rendering (find with grep `<Card\|automation\\.id\|folder\\.id\|grid-cols`):** Apply dictionary-table pattern from D-DASH-11 + mock `.al-item`:
    ```tsx
    {filteredAutomations.map((auto) => (
      v2 ? (
        <div
          key={auto.id}
          onClick={() => router.push(`/automatizaciones/${auto.id}/editar`)}
          className={cn(
            'grid grid-cols-[16px_1fr_auto] gap-3 items-center px-4 py-3 border-b border-dotted border-[var(--border)] cursor-pointer transition-colors',
            'hover:bg-[var(--paper-3)]',
            // selected/active rail if applicable
            // selected && 'bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] pl-[13px]'
          )}
        >
          {/* status dot (mock .al-item .dot) */}
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              auto.is_active ? 'bg-[var(--semantic-success)]' :
              auto.status === 'paused' ? 'bg-[var(--accent-gold)]' :
              'bg-[var(--ink-4)]'
            )}
            aria-label={auto.is_active ? 'Activa' : 'Inactiva'}
          />
          <div className="min-w-0">
            <div
              className="text-[13px] font-semibold text-[var(--ink-1)] leading-tight truncate"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {auto.name}
            </div>
            <div
              className="mt-0.5 text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Trigger: {auto.trigger_type}
            </div>
          </div>
          <div
            className="text-right text-[10px] tabular-nums text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {/* runs count if available */}
            {auto.execution_count ?? '—'}
          </div>
        </div>
      ) : (
        /* preserve current Card/Switch JSX byte-identical for !v2 — current code uses shadcn Card */
        <Card key={auto.id}>...current JSX...</Card>
      )
    ))}
    ```
    Use the actual property names from `Automation` type — read `src/lib/automations/types.ts` if needed (read-only, not modifying). DO NOT remove `Switch` toggle for is_active — keep it functional, just re-skin its visual when v2 (the Switch shadcn primitive will pick up theme via .theme-editorial CSS cascade automatically since Plan 01 set token overrides).

    **Step 6 — Re-skin folder group headers (mock `.al-group`):**
    ```tsx
    {v2 ? (
      <div
        className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {folder.name} · {folderAutomationCount}
      </div>
    ) : (
      /* preserve current folder header JSX */
    )}
    ```

    **Step 7 — Empty state when v2 (D-DASH-08 + README §10):**
    ```tsx
    {filteredAutomations.length === 0 && (
      v2 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
          <p className="mx-h3">No hay automatizaciones aún.</p>
          <p className="mx-caption">Crea la primera para empezar a automatizar flujos.</p>
          <p className="mx-rule-ornament">· · ·</p>
          <Button
            onClick={() => router.push('/automatizaciones/nueva')}
            className="mt-2 bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Crear automatización
          </Button>
        </div>
      ) : (
        /* preserve current empty state */
      )
    )}
    ```

    **Step 8 — Status badges replacement (find with grep `<Badge.*variant\|is_active\|status`):** Replace shadcn Badge with `.mx-tag--*` editorial pills (D-DASH-15) only inside the `v2` branch. Preserve existing Badge JSX in `!v2` branch verbatim.

    **DO NOT MODIFY (D-DASH-07 + Regla 6):**
    - Any function logic: `filterAutomations`, `handleFolderToggle`, drag/drop handlers, `move` from dnd-kit, `useTransition`, `useDroppable`, `useSortable`
    - Server action calls: `createAutomation`, `updateAutomation`, `deleteAutomation`, `reorderFolders`, etc (no se importan aquí, pero verificar grep)
    - Type imports from `@/lib/automations/types`
    - Toast notifications (`sonner`) wiring
    - Router navigation paths
    - `TRIGGER_CATALOG` import or usage
    - DragOverlay rendering logic
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx && grep -q "Módulo · automatizaciones" src/app/\(dashboard\)/automatizaciones/page.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/automatizaciones/page.tsx && grep -q "DragDropProvider\|useSortable\|move" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx && grep -q "TRIGGER_CATALOG" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx && (! grep "oklch(" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx) && npx tsc --noEmit 2>&1 | grep -E "automatizaciones/(page|components/automation-list)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx` PASS.
    - `grep -q "Módulo · automatizaciones" src/app/\(dashboard\)/automatizaciones/page.tsx` PASS (eyebrow with U+00B7 medium dot).
    - `grep -q "var(--rubric-2)" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx` PASS (rubric-2 used for status dots/active states).
    - `grep -q "var(--paper-0)" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx` PASS (editorial paper bg).
    - `grep -q "var(--font-display)" src/app/\(dashboard\)/automatizaciones/page.tsx` PASS (h1 uses display font).
    - `grep -q "DragDropProvider\|useSortable" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx` PASS (dnd-kit logic preserved — Regla 6 NO-TOUCH guard).
    - `grep -q "TRIGGER_CATALOG" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx` PASS (constant import preserved).
    - `! grep "oklch(" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx` PASS (no hardcoded OKLCH — must use var(--*)).
    - `! grep "dark:" src/app/\(dashboard\)/automatizaciones/components/automation-list.tsx | grep -v "// "` should not introduce NEW dark: classes (existing ones OK if part of !v2 branch).
    - `npx tsc --noEmit` reports zero errors in these 2 files.
    - Manual: `git diff src/app/actions/automations.ts src/lib/automations/` returns 0 lines (D-DASH-07 verifiable).
    - Manual smoke (flag ON in dev): listing page renders eyebrow + h1 serif, search input has paper-0 bg + lucide icon, filter category buttons use editorial pill style, automation rows use dictionary-table layout with status dots, folder headers use smallcaps rubric-2 style, drag-and-drop still works, toggling automation active still works.
    - Manual (flag OFF): visual diff vs main is ZERO. All current shadcn Card/Badge/Switch JSX preserved.
  </acceptance_criteria>
  <done>Listing page + automation-list editorial cuando flag ON: eyebrow + h1 + dictionary-table folders/rows + status dots + filter pills + editorial search. Cuando flag OFF, byte-identical al main. DnD-kit drag/drop intacto. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin wizard (automation-wizard.tsx + trigger-step.tsx + conditions-step.tsx + actions-step.tsx + variable-picker.tsx + nueva/page.tsx + [id]/editar/page.tsx)</name>
  <files>src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx, src/app/(dashboard)/automatizaciones/components/trigger-step.tsx, src/app/(dashboard)/automatizaciones/components/conditions-step.tsx, src/app/(dashboard)/automatizaciones/components/actions-step.tsx, src/app/(dashboard)/automatizaciones/components/variable-picker.tsx, src/app/(dashboard)/automatizaciones/nueva/page.tsx, src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx (253 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/components/trigger-step.tsx (360 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/components/conditions-step.tsx (529 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/components/actions-step.tsx (1628 LOC — paginar: lines 1-100 imports, 100-400 sub-components, 400-800 form fields, 800+ component body. Use Grep to locate visual blocks: `grep -n "<Card\|<Input\|<Select\|<Button\|className=" src/app/(dashboard)/automatizaciones/components/actions-step.tsx | head -100`)
    - src/app/(dashboard)/automatizaciones/components/variable-picker.tsx (82 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/nueva/page.tsx (40 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx (69 LOC — full read OK)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 218-265 (.ins-sect, .field, .cond-row, .tpl, .stat-grid)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 705-845 (right inspector panel structure with details/summary, fields, cond-row, stat-grid)
  </read_first>
  <action>
    **Step 1 — nueva/page.tsx + [id]/editar/page.tsx (server components):** Same pattern as Task 1 step 1. Read flag via `getIsDashboardV2Enabled(workspaceId)` and add eyebrow + h1 editorial when v2. Replace the current `<h1 className="text-2xl font-bold">Nueva Automatizacion</h1>` block with conditional editorial header. Both pages use cookie `morfx_workspace` already — preserve verbatim.

    **Step 2 — automation-wizard.tsx (253 LOC):** Add `import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'`. Inside the component body, `const v2 = useDashboardV2()`. Then re-skin the step indicator (find the JSX that renders the 3-step progress bar with numbers + labels) per mock pattern:

    ```tsx
    {v2 ? (
      <div className="flex items-stretch border-b border-[var(--ink-1)] mb-6">
        {(['trigger', 'conditions', 'actions'] as const).map((stepKey, idx) => {
          const isActive = currentStep === stepKey
          const isComplete = stepIndex(stepKey) < stepIndex(currentStep)
          const labels = { trigger: 'Trigger', conditions: 'Condiciones', actions: 'Acciones' }
          return (
            <button
              key={stepKey}
              type="button"
              onClick={() => isComplete && setCurrentStep(stepKey)}
              className={cn(
                'flex-1 px-4 py-3 flex items-center gap-3 transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-[var(--ink-1)] text-[var(--ink-1)]'
                  : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
              )}
              disabled={!isComplete && !isActive}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] tabular-nums',
                  isActive
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                    : isComplete
                      ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]'
                      : 'bg-transparent border-[var(--border)] text-[var(--ink-3)]'
                )}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : (idx + 1).toString().padStart(2, '0')}
              </span>
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-[0.14em]',
                  isActive ? 'text-[var(--rubric-2)]' : ''
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Paso {idx + 1} · {labels[stepKey]}
              </span>
            </button>
          )
        })}
      </div>
    ) : (
      /* preserve current step indicator JSX byte-identical */
    )}
    ```

    Re-skin the wizard primary CTA buttons (Save/Continue/Back) at the bottom. Primary 'Crear automatización' = rubric-2 press; secondary 'Atrás' = ink-1 outline (D-DASH-14). Wrap each Button with v2 conditional className.

    Pass `v2` as a prop to each step (`<TriggerStep v2={v2} ... />` etc) OR have each step call `useDashboardV2()` directly. PREFERIR el segundo (less prop drilling, mismo pattern que useInboxV2 en fase inbox v2). Each step is already a Client Component.

    **Step 3 — trigger-step.tsx (360 LOC):** Add `useDashboardV2`. Re-skin the trigger category cards (`<Card>` blocks for CRM/WhatsApp/Tareas/Shopify) when v2:
    ```tsx
    <button
      onClick={() => selectCategory(cat)}
      className={cn(
        'group flex flex-col items-start gap-2 p-4 transition-all border text-left',
        v2
          ? cn(
              'bg-[var(--paper-0)] border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]',
              isSelected
                ? 'outline-2 outline-offset-2 outline-[var(--rubric-2)]'
                : 'hover:bg-[var(--paper-3)]'
            )
          : '...preserve current shadcn Card classes...'
      )}
    >
      <Icon className={cn('h-5 w-5', v2 ? 'text-[var(--ink-2)]' : '...current...')} />
      <span
        className={cn(v2 ? 'text-[14px] font-semibold text-[var(--ink-1)]' : '...current...')}
        style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
      >
        {label}
      </span>
      <span
        className={cn(v2 ? 'text-[11px] italic text-[var(--ink-3)]' : '...current...')}
        style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
      >
        {description}
      </span>
    </button>
    ```

    Re-skin form fields (Input/Label/Select) per D-DASH-14: when v2, label className `'text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]'`, input className `'border-[var(--border)] bg-[var(--paper-0)] rounded-[var(--radius-2)] focus-visible:ring-[var(--ink-1)]'`, hint text serif italic 11px ink-3.

    **Step 4 — conditions-step.tsx (529 LOC):** Add `useDashboardV2`. Re-skin the condition rows using mock `.cond-row` pattern (grid 1fr auto 1fr):
    ```tsx
    <div className={cn(
      v2
        ? 'grid grid-cols-[1fr_auto_1fr] gap-1.5 items-center p-2 border border-[var(--border)] bg-[var(--paper-0)] mb-1.5'
        : '...current row classes...'
    )}>
      <Select value={field} onValueChange={setField}>
        <SelectTrigger className={cn(v2 ? 'border-[var(--border)] bg-[var(--paper-1)] text-[12px]' : '...')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>...preserve...</SelectContent>
      </Select>
      <span
        className={cn(v2 ? 'text-[11px] text-[var(--ink-3)] text-center px-2' : '...')}
        style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
      >
        {operatorSymbol(operator) /* ≥, =, ≠, etc */}
      </span>
      <Input value={value} onChange={...} className={cn(v2 ? 'border-[var(--border)] bg-[var(--paper-1)] text-[12px]' : '...')} />
    </div>
    ```

    Re-skin the "Add condition" link button per mock `.add-cond` (rubric-2 inline link with plus icon).

    **Step 5 — actions-step.tsx (1628 LOC — LARGEST FILE):** Add `useDashboardV2`. This file has multiple sub-components and many form sections. Strategy:

    1. Read the file in 3 chunks (lines 1-600, 600-1200, 1200-1628) using `Read` with `offset`/`limit`.
    2. Identify the main JSX render blocks: action selector cards, action config forms (per action type — send_message, create_task, change_stage, etc), variable picker integration, conditional rendering blocks.
    3. For EACH visual block, add a `v2 ?` conditional with editorial classes per the same patterns:
       - Action type cards → like trigger cards (Step 3)
       - Form fields → D-DASH-14 (label smallcaps, input border ink-1 paper-0)
       - Section dividers → border-b border-[var(--border)] + smallcaps section labels
       - Variable insertion buttons → editorial pill style (mx-tag--ink with code icon)
    4. Preserve ALL functional logic: action selection state, form validation, variable insertion handlers, template selection, pipeline/stage selection.

    Specifically for the SEND_MESSAGE action type (the most complex one with template selection + variable mapping), apply the inspector-panel-like layout per mock `.ins-sect` (collapsible section pattern with `<details>`/`<summary>` semantics in HTML; in React use existing Collapsible primitive or shadcn Accordion).

    **Step 6 — variable-picker.tsx (82 LOC):** Add `useDashboardV2`. Re-skin the dropdown trigger button + the popover content list:
    ```tsx
    <Button
      variant="outline"
      size="sm"
      onClick={togglePicker}
      className={cn(
        v2
          ? 'border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] text-[11px]'
          : '...current outline button classes...'
      )}
    >
      <Code2 className={cn('h-3.5 w-3.5', v2 ? 'text-[var(--rubric-2)]' : '')} />
      Variables
    </Button>
    ```
    For the popover content (variable list grouped by category), use mock pattern:
    - Category headers: `text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]`
    - Variable items: `font-mono text-[11px]` with hover `bg-[var(--paper-3)]`
    - Variable preview chip: `.mx-tag mx-tag--ink` style

    **DO NOT MODIFY:**
    - State management hooks (useState, useReducer, useTransition)
    - Server action calls (`createAutomation`, `updateAutomation`)
    - Type imports
    - Toast notifications
    - Variable insertion logic (cursor position handling, value updates)
    - TRIGGER_CATALOG iteration logic
    - Template/Pipeline/Tag/Product type usage
    - Form validation logic
    - Conditional rendering based on selected trigger type / action type
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/automation-wizard.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/trigger-step.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/conditions-step.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/variable-picker.tsx && grep -q "Módulo · automatizaciones" src/app/\(dashboard\)/automatizaciones/nueva/page.tsx && grep -q "createAutomation\|updateAutomation" src/app/\(dashboard\)/automatizaciones/components/automation-wizard.tsx && grep -q "TRIGGER_CATALOG" src/app/\(dashboard\)/automatizaciones/components/trigger-step.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/automatizaciones/components/automation-wizard.tsx && (! grep "oklch(" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx) && npx tsc --noEmit 2>&1 | grep -E "automatizaciones/(components|nueva|\\[id\\])" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2"` PASS in all 5 component files (wizard, trigger-step, conditions-step, actions-step, variable-picker).
    - `grep -q "Módulo · automatizaciones"` PASS in nueva/page.tsx AND [id]/editar/page.tsx (eyebrow with U+00B7).
    - `grep -q "createAutomation\|updateAutomation"` PASS in automation-wizard.tsx (server actions preserved).
    - `grep -q "TRIGGER_CATALOG"` PASS in trigger-step.tsx (catalog import preserved).
    - `grep -q "var(--rubric-2)"` PASS in automation-wizard.tsx (primary CTA uses rubric-2).
    - `grep -q "var(--font-display)"` PASS in trigger-step.tsx OR actions-step.tsx (titles use display font).
    - `grep -q "tracking-\[0.12em\]\|tracking-\[0.14em\]"` PASS in conditions-step.tsx (smallcaps labels D-DASH-14).
    - `! grep "oklch(" <each file>` PASS for all 5 files (no hardcoded OKLCH).
    - `! grep "dark:" <each file>` should not introduce new dark: classes.
    - `npx tsc --noEmit` reports zero errors.
    - Manual: `git diff src/app/actions/ src/lib/automations/ src/lib/builder/` returns 0 lines (D-DASH-07).
    - Manual smoke (flag ON): wizard renders 3-step indicator editorial; trigger cards have paper-0 bg + ink-1 border + stamp shadow; condition rows match mock `.cond-row` 3-col grid; action forms use smallcaps labels + paper-0 inputs; variable picker shows editorial dropdown.
    - Manual (flag OFF): visual diff vs main is ZERO across all 7 files.
  </acceptance_criteria>
  <done>Wizard + steps + variable picker editorial cuando flag ON: step indicator smallcaps + cards paper-0 con stamp + condition rows mock-perfect + form fields D-DASH-14 + variable picker editorial. Cuando flag OFF, byte-identical. Server actions/types/state intactos. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin React Flow canvas + preview-nodes (CRITICAL — lib intacta, solo JSX/CSS)</name>
  <files>src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx, src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx (full 169 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx (full 267 LOC — three Node functions: TriggerNode, ConditionNode, ActionNode)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 78-205 (canvas + node + edge styling)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 414-697 (canvas-wrap with toolbar + legend + minimap + nodes + edges)
    - https://reactflow.dev/api-reference/components/background — confirmar Background component props (variant, color, gap, size) — uso ya existe en código vía `<Background />` sin props
  </read_first>
  <action>
    **CRITICAL — Lo que NO se toca:**
    - `import { ReactFlow, Background } from '@xyflow/react'` — preservar exacto
    - `import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'` — preservar exacto
    - `customNodeTypes` mapping export — preservar exacto:
      ```typescript
      export const customNodeTypes = {
        triggerNode: TriggerNode,
        conditionNode: ConditionNode,
        actionNode: ActionNode,
      }
      ```
    - `<Handle type="..." position={Position.Top} />` y `<Handle type="..." position={Position.Bottom} />` JSX — preservar (handles drive edge connections)
    - `NodeProps<TriggerNodeType>` etc signatures
    - `data: DiagramNodeData` shape consumption
    - `<ReactFlow nodes={nodes} edges={edges} nodeTypes={customNodeTypes} ...>` API call — only `defaultEdgeOptions` and `<Background>` props can change

    **Step 1 — automation-preview.tsx:** Add `useDashboardV2` import + hook call inside `AutomationPreview` component. Then conditionally pass editorial props to `<Background>` and `defaultEdgeOptions`:

    ```tsx
    'use client'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // ... existing imports preserved ...

    export function AutomationPreview({ ... }: AutomationPreviewProps) {
      const v2 = useDashboardV2()
      // ... existing logic preserved (nodes, edges, etc) ...

      return (
        <div className={cn(
          'relative h-full',
          v2 ? 'bg-[var(--paper-1)]' : '...current bg classes...'
        )}>
          {/* preserve existing error/loading banners — wrap with v2 conditional className for paper styling */}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={customNodeTypes}
            // ...preserve existing props (fitView, panOnDrag, zoomOnScroll, etc)...
            defaultEdgeOptions={
              v2
                ? {
                    style: { stroke: 'var(--ink-2)', strokeWidth: 2 },
                    type: 'smoothstep',
                  }
                : /* preserve existing defaultEdgeOptions or undefined */ undefined
            }
            proOptions={{ hideAttribution: true }}
          >
            <Background
              {...(v2
                ? {
                    variant: 'dots' as const,
                    color: 'var(--ink-4)',
                    gap: 16,
                    size: 0.5,
                  }
                : {} /* default Background props for !v2 */)}
            />
          </ReactFlow>
        </div>
      )
    }
    ```

    Note: `Background` with `variant="dots"` from @xyflow/react accepts `color`, `gap`, `size` props (verified in React Flow docs). The mock pattern `radial-gradient(circle at 0.5px 0.5px, var(--ink-4) 0.5px, transparent 0.5px)` with `background-size: 16px 16px` corresponds exactly to dots variant gap=16 size=0.5 color=ink-4.

    Re-skin the error/empty banner JSX inside the component (currently shows AlertTriangle/Ban with copy classes). When v2: use `mx-h4` for title + `mx-caption` for description + button rubric-2 outline for retry, wrapped in a centered card with paper-0 bg + ink-1 border + stamp shadow.

    Preserve EVERYTHING ELSE: ConfirmationButtons rendering, Copy icon usage, status string handling, all conditional rendering of UI based on `status` prop.

    **Step 2 — preview-nodes.tsx:** This file has 3 Node functions (TriggerNode, ConditionNode, ActionNode) plus shared sub-components (CategoryBadge, ErrorBanner, ConfigDetail). Each Node function must accept v2 conditional rendering.

    Add at top:
    ```tsx
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```

    For EACH Node function (TriggerNode at line 57, ConditionNode, ActionNode), add `const v2 = useDashboardV2()` inside the function body and conditionally swap classes:

    Pattern for TriggerNode (the others follow same pattern with their accent colors):
    ```tsx
    function TriggerNode({ data }: NodeProps<TriggerNodeType>) {
      const v2 = useDashboardV2()
      const hasError = data.hasError

      // Editorial color scheme per mock .node.trigger
      const editorialBorder = 'border-[var(--ink-1)]'
      const editorialBg = 'bg-[var(--paper-0)]'
      const editorialShadow = 'shadow-[0_1px_0_var(--ink-1),0_8px_22px_-16px_oklch(0.2_0.04_60_/_0.3)]'
      const editorialHeaderBg = hasError
        ? 'bg-[color-mix(in_oklch,var(--rubric-2)_18%,var(--paper-0))]'
        : 'bg-[color-mix(in_oklch,var(--rubric-2)_12%,var(--paper-0))]'
      const editorialHeaderColor = 'text-[var(--rubric-2)]'

      // Current (preserve verbatim for !v2):
      const borderColor = hasError
        ? 'border-red-500'
        : 'border-violet-300 dark:border-violet-700'
      const bgColor = hasError
        ? 'bg-red-50 dark:bg-red-950/30'
        : 'bg-violet-50 dark:bg-violet-950'

      const configEntries = data.triggerConfig
        ? Object.entries(data.triggerConfig).filter(([, v]) => v !== null && v !== undefined && v !== '')
        : []

      if (v2) {
        return (
          <div className={cn('w-[240px] border', editorialBorder, editorialBg, editorialShadow, 'cursor-pointer transition-shadow hover:shadow-[0_1px_0_var(--ink-1),0_12px_28px_-14px_oklch(0.2_0.04_60_/_0.4)]')}>
            <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-[var(--paper-0)] !border-2 !border-[var(--ink-1)]" />
            {/* node header (.nh in mock) */}
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]',
              'text-[10px] font-bold uppercase tracking-[0.14em]',
              editorialHeaderBg,
              editorialHeaderColor
            )} style={{ fontFamily: 'var(--font-sans)' }}>
              <Zap className="h-3.5 w-3.5 text-[var(--rubric-2)]" />
              <span className="flex-1">Trigger · {data.category ?? 'evento'}</span>
              {data.indexLabel && (
                <span className="text-[10px] tabular-nums text-[var(--ink-4)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {data.indexLabel}
                </span>
              )}
            </div>
            {/* node body (.nb in mock) */}
            <div className="px-3 py-2.5">
              <div
                className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)] mb-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {data.label}
              </div>
              {data.description && (
                <div
                  className="text-[12px] italic leading-snug text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {data.description}
                </div>
              )}
              {configEntries.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dotted border-[var(--border)] flex flex-col gap-0.5">
                  {configEntries.slice(0, 3).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="text-[var(--ink-3)]">{k}</span>
                      <span className="text-[var(--ink-1)] font-medium truncate max-w-[140px]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hasError && data.errorMessage && (
                <div className="mt-2 flex items-start gap-1.5 border border-[var(--rubric-2)] bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] px-2 py-1">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--rubric-2)]" />
                  <span className="text-[11px] leading-tight text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    {data.errorMessage}
                  </span>
                </div>
              )}
            </div>
            <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-[var(--rubric-2)] !border-2 !border-[var(--rubric-2)]" />
          </div>
        )
      }

      // !v2 — preserve EXISTING JSX byte-identical:
      return (
        <div className={`rounded-xl border-2 shadow-sm ${borderColor} ${bgColor} min-w-[220px] max-w-[280px] px-4 py-3`}>
          {/* ...all existing JSX (Handles, header, body, error banner, config details)... */}
        </div>
      )
    }
    ```

    Apply the same pattern to **ConditionNode** with editorial accent `var(--accent-indigo)` (mock `.node.cond .nh` uses `color-mix(in oklch, var(--accent-indigo) 12%, var(--paper-0))`) — header icon `GitBranch`, label "Condición · si/no". Handle `type="source"` rendering: condition has TWO sources (yes/no) — preserve existing JSX, just re-skin.

    Apply same pattern to **ActionNode** with editorial accent: ink-2 + paper-2 header (mock `.node.action .nh` uses `background: var(--paper-2); color: var(--ink-2);`) — header icon `Play`, label "Acción · {category}".

    The shared sub-components (CategoryBadge, ErrorBanner, ConfigDetail) — these are only used in the !v2 branch (existing JSX). For v2, the editorial JSX inlines the equivalents (smallcaps category, AlertTriangle banner, mono kv lines). Keep CategoryBadge/ErrorBanner/ConfigDetail functions defined — no need to delete.

    **DO NOT MODIFY:**
    - `Handle`, `Position` imports — preserve verbatim
    - `NodeProps<...>` typing — preserve verbatim
    - `customNodeTypes` export at line 263 — preserve verbatim
    - `data.label`, `data.category`, `data.hasError`, `data.triggerConfig`, `data.errorMessage` consumption — these come from `DiagramNodeData` in `@/lib/builder/types` (D-DASH-07 NO-TOUCH lib/builder)
    - Any external imports from lucide-react — keep all icon imports (Zap, GitBranch, Play, AlertTriangle, Clock)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/automation-preview.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx && grep -q "ReactFlow\|Background" src/app/\(dashboard\)/automatizaciones/builder/components/automation-preview.tsx && grep -q "Handle\|Position" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx && grep -q "customNodeTypes" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx && grep -q "var(--ink-1)" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx && grep -q "variant.*dots\|color.*ink-4" src/app/\(dashboard\)/automatizaciones/builder/components/automation-preview.tsx && (! grep "from '@/lib/builder/types'" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx | xargs -I {} echo "import preserved") && npx tsc --noEmit 2>&1 | grep -E "automation-preview|preview-nodes" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2"` PASS in both files.
    - `grep -q "ReactFlow\|Background"` PASS in automation-preview.tsx (lib usage preserved).
    - `grep -q "Handle\|Position"` PASS in preview-nodes.tsx (handles preserved).
    - `grep -q "customNodeTypes"` PASS in preview-nodes.tsx (export preserved).
    - `grep -c "Handle " src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx` should be ≥ 5 (each Node function has 1-2 handles, total ≥ 5 across 3 nodes — preserve count).
    - `grep -q "from '@xyflow/react'"` PASS in both files (lib import preserved).
    - `grep -q "from '@/lib/builder/types'"` PASS in preview-nodes.tsx (DiagramNodeData type preserved).
    - `grep -q "var(--ink-1)\|var(--paper-0)\|var(--rubric-2)"` PASS in preview-nodes.tsx (editorial tokens used).
    - `grep -q "variant.*dots\|color.*ink-4\|gap.*16"` PASS in automation-preview.tsx (Background editorial config).
    - `! grep "dark:" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx | grep -v "^.*: import\|^.*://"` should not introduce NEW dark: classes outside the !v2 preserved branch (existing dark: in !v2 branch is OK — they were there before).
    - `npx tsc --noEmit` reports zero errors.
    - Manual: `git diff src/lib/builder/ src/lib/automations/` returns 0 lines (D-DASH-07 strict).
    - Manual smoke (flag ON in builder UI): canvas shows dotted ink-4 grid (gap 16); each node shows ink-1 border + paper-0 bg + stamp shadow + smallcaps rubric-2/indigo/ink-2 header per type + serif title body; edges visible with ink-2 stroke; node handles still functional (drag connection between nodes works); zoom/pan still works; no React Flow runtime errors in console.
    - Manual (flag OFF): canvas + nodes render IDENTICAL to current main (rounded-xl violet/amber/blue cards).
  </acceptance_criteria>
  <done>React Flow canvas + nodes editorial cuando flag ON: dotted background ink-4 + nodos editorial paper-0/ink-1/stamp + headers smallcaps colored per type + body serif. Cuando flag OFF, byte-identical. ReactFlow lib + Handle + customNodeTypes intactos. Build clean. Zero changes to lib/builder/types.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin AI Builder chat (builder-layout + builder-chat + builder-message + builder-input + session-history + confirmation-buttons + builder/page.tsx)</name>
  <files>src/app/(dashboard)/automatizaciones/builder/page.tsx, src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx, src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx, src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx, src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx, src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx, src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/builder/page.tsx (10 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx (156 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx (157 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx (277 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx (102 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/session-history.tsx (203 LOC)
    - src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx (45 LOC)
    - .planning/standalone/ui-redesign-conversaciones/05-PLAN.md (chat thread re-skin reference for inbox v2 — same pattern applied here for builder chat)
  </read_first>
  <action>
    **Step 1 — builder/page.tsx (10 LOC):** Likely thin wrapper around `<BuilderLayout>`. Verify and pass through. May or may not need v2 changes if layout is fully driven by builder-layout.tsx.

    **Step 2 — builder-layout.tsx (156 LOC):** Add `useDashboardV2`. The shell layout has 3 zones: top bar (back link + meta), left sidebar (session-history), right main (chat).

    Re-skin shell:
    ```tsx
    const v2 = useDashboardV2()
    return (
      <div className={cn(
        'grid grid-cols-[280px_1fr] h-full',
        v2 ? 'bg-[var(--paper-1)]' : '...current bg...'
      )}>
        <aside className={cn(
          'border-r overflow-y-auto',
          v2 ? 'bg-[var(--paper-2)] border-[var(--border)]' : '...current...'
        )}>
          <SessionHistory ... />
        </aside>
        <main className={cn('flex flex-col overflow-hidden', v2 ? 'bg-[var(--paper-1)]' : '')}>
          {/* topbar — re-skin with v2: border-b border-[var(--ink-1)] + serif title */}
          <div className={cn(
            'flex items-center gap-3 px-5 py-3',
            v2 ? 'border-b border-[var(--ink-1)] bg-[var(--paper-1)]' : 'border-b'
          )}>
            <Link href="/automatizaciones" className={cn(
              v2 ? 'text-[12px] text-[var(--ink-3)] hover:text-[var(--ink-1)]' : '...'
            )} style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}>
              <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />
              Automatizaciones
            </Link>
            <span className={v2 ? 'text-[var(--ink-4)]' : ''}>/</span>
            <span className={cn(
              v2 ? 'text-[14px] font-semibold text-[var(--ink-1)]' : ''
            )} style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}>
              AI Builder
            </span>
            {/* preserve other topbar elements (Plus button, Clock indicator) — wrap with v2 conditional */}
          </div>
          <BuilderChat ... />
        </main>
      </div>
    )
    ```

    Preserve all useState/useCallback/useRef/useEffect logic, useChat/UIMessage/Link wiring.

    **Step 3 — builder-chat.tsx (157 LOC):** Add `useDashboardV2`. Re-skin chat scroll container + message list rendering (BuilderChat likely maps over messages and renders BuilderMessage):
    ```tsx
    <div className={cn(
      'flex-1 overflow-y-auto',
      v2 ? 'bg-[var(--paper-1)] px-6 py-4' : '...'
    )}>
      <div className={cn('max-w-3xl mx-auto', v2 ? 'space-y-4' : 'space-y-3')}>
        {messages.map((msg) => (
          <BuilderMessage key={msg.id} message={msg} />
        ))}
      </div>
    </div>
    ```
    Preserve useChat wiring, sendMessage/DefaultChatTransport calls, scroll behavior, loading states.

    **Step 4 — builder-message.tsx (277 LOC):** Add `useDashboardV2`. Re-skin message bubbles for assistant vs user:

    For assistant message:
    ```tsx
    {v2 ? (
      <div className="flex gap-3">
        <div className="h-7 w-7 rounded-full bg-[var(--paper-3)] border border-[var(--ink-1)] flex items-center justify-center flex-shrink-0">
          <Bot className="h-3.5 w-3.5 text-[var(--rubric-2)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)] mb-1" style={{ fontFamily: 'var(--font-sans)' }}>
            Builder · IA
          </div>
          <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] px-4 py-3">
            <div className="text-[14px] leading-relaxed text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
              {/* render parts (text, tool calls, etc) */}
              {message.parts.map((part, idx) => {
                if (part.type === 'text') return <p key={idx}>{part.text}</p>
                /* preserve tool-call rendering, code blocks, etc — apply editorial styling inline */
                return null
              })}
            </div>
            {/* AutomationPreview integration if present */}
            {previewData && <AutomationPreview ... />}
            {/* ConfirmationButtons if present */}
            {needsConfirmation && <ConfirmationButtons ... />}
          </div>
        </div>
      </div>
    ) : (
      /* preserve current assistant message JSX */
    )}
    ```

    For user message (right-aligned):
    ```tsx
    {v2 ? (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%] bg-[var(--paper-2)] border border-[var(--border)] px-4 py-3">
          <div className="text-[14px] leading-relaxed text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>
            {message.parts.map(...)}
          </div>
        </div>
      </div>
    ) : (
      /* preserve current user message JSX */
    )}
    ```

    Preserve UIMessage type usage, message.parts iteration logic, all tool-call rendering, code highlighting, AutomationPreview integration props.

    **Step 5 — builder-input.tsx (102 LOC):** Add `useDashboardV2`. Re-skin input box + send button:
    ```tsx
    {v2 ? (
      <form onSubmit={handleSubmit} className="border-t border-[var(--ink-1)] bg-[var(--paper-1)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe el flujo que quieres crear…"
            className="flex-1 bg-[var(--paper-0)] border-[var(--ink-1)] rounded-[var(--radius-2)] text-[14px] resize-none min-h-[44px] max-h-[200px] focus-visible:ring-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)' }}
            onKeyDown={...}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] px-4 py-2"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    ) : (
      /* preserve current input form JSX byte-identical */
    )}
    ```
    Preserve handleSubmit/sendMessage/onKeyDown wiring + all event handlers.

    **Step 6 — session-history.tsx (203 LOC):** Add `useDashboardV2`. Re-skin sidebar:
    ```tsx
    {v2 ? (
      <div className="px-3 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)] mb-2 px-2" style={{ fontFamily: 'var(--font-sans)' }}>
          Sesiones
        </div>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => selectSession(s.id)}
            className={cn(
              'w-full text-left px-3 py-2 transition-colors border-b border-dotted border-[var(--border)]',
              isActive
                ? 'bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] pl-[9px]'
                : 'hover:bg-[var(--paper-3)]'
            )}
          >
            <div className="text-[13px] font-semibold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-sans)' }}>
              {s.title}
            </div>
            <div className="text-[11px] italic text-[var(--ink-3)] mt-0.5" style={{ fontFamily: 'var(--font-serif)' }}>
              {formatRelative(s.updated_at)}
            </div>
          </button>
        ))}
      </div>
    ) : (
      /* preserve current session-history JSX */
    )}
    ```
    Preserve session selection logic, server action calls (loadSessions, etc).

    **Step 7 — confirmation-buttons.tsx (45 LOC):** Add `useDashboardV2`. Re-skin per D-DASH-14:
    ```tsx
    {v2 ? (
      <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
        <Button
          onClick={onConfirm}
          disabled={isLoading}
          className="bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] text-[12px] font-semibold uppercase tracking-[0.06em]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Crear automatización
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[12px] font-semibold uppercase tracking-[0.06em]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Cancelar
        </Button>
      </div>
    ) : (
      /* preserve current button JSX */
    )}
    ```
    Preserve onConfirm/onCancel handlers + isLoading state.

    **DO NOT MODIFY:**
    - `useChat` hook wiring + DefaultChatTransport + sendMessage signature usage
    - UIMessage type + message.parts iteration logic
    - AutomationPreview component import/usage in builder-message
    - Server actions for sessions
    - Any data-fetching, loading state, scroll-to-bottom logic
    - Tool call / tool result rendering (this is critical AI SDK v6 plumbing)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/builder-layout.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/builder-chat.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/builder-message.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/builder-input.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/session-history.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/builder/components/confirmation-buttons.tsx && grep -q "useChat\|UIMessage\|sendMessage" src/app/\(dashboard\)/automatizaciones/builder/components/builder-layout.tsx && grep -q "AutomationPreview" src/app/\(dashboard\)/automatizaciones/builder/components/builder-message.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/automatizaciones/builder/components/builder-input.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/automatizaciones/builder/components/confirmation-buttons.tsx && (! grep "oklch(" src/app/\(dashboard\)/automatizaciones/builder/components/builder-message.tsx) && npx tsc --noEmit 2>&1 | grep -E "automatizaciones/builder" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2"` PASS in all 6 builder component files.
    - `grep -q "useChat\|UIMessage\|sendMessage"` PASS somewhere in builder-layout.tsx OR builder-chat.tsx (AI SDK v6 plumbing preserved).
    - `grep -q "AutomationPreview"` PASS in builder-message.tsx (preview integration preserved).
    - `grep -q "var(--rubric-2)"` PASS in builder-input.tsx + confirmation-buttons.tsx (primary CTA rubric-2 press).
    - `grep -q "var(--paper-0)\|var(--paper-1)\|var(--paper-2)"` PASS in builder-layout.tsx (paper hierarchy used).
    - `grep -q "border.*var(--ink-1)"` PASS in at least 4 of 6 files (editorial border).
    - `! grep "oklch(" <each file>` PASS (no hardcoded OKLCH).
    - `! grep "dark:" <each file>` should not introduce new dark: classes.
    - `npx tsc --noEmit` reports zero errors.
    - Manual: `git diff src/lib/builder/ src/app/api/builder/ src/app/actions/builder*` returns 0 lines (D-DASH-07).
    - Manual smoke (flag ON in /automatizaciones/builder): chat shell editorial (paper-1 bg + paper-2 sidebar + ink-1 border topbar); assistant messages have stamp shadow + serif body + smallcaps "Builder · IA" eyebrow; user messages right-aligned in paper-2 cards; input box has paper-0 + ink-1 border + rubric-2 send button; ConfirmationButtons editorial; sending message still works (sendMessage/useChat wiring); AutomationPreview renders editorial nodes inside chat (Task 3 already shipped that).
    - Manual (flag OFF): builder UI byte-identical to main.
  </acceptance_criteria>
  <done>AI Builder chat editorial completo cuando flag ON: shell + sidebar + chat + messages (assistant stamp / user paper-2) + input + confirmation buttons. Cuando flag OFF, byte-identical. useChat/UIMessage/AutomationPreview wiring intacto. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Re-skin execution history + detail dialog (historial/page.tsx + execution-history.tsx + execution-detail-dialog.tsx)</name>
  <files>src/app/(dashboard)/automatizaciones/historial/page.tsx, src/app/(dashboard)/automatizaciones/components/execution-history.tsx, src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/historial/page.tsx (43 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/components/execution-history.tsx (285 LOC — full read OK)
    - src/app/(dashboard)/automatizaciones/components/execution-detail-dialog.tsx (249 LOC — full read OK)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 259-270 (.run-list, .run-row pattern)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html lines 805-820 (run-list inside inspector — apply same pattern to historial page)
    - src/components/ui/dialog.tsx (verify Dialog primitive supports portalContainer prop — Plan 01 may have extended; if not, this task can extend it aditively)
  </read_first>
  <action>
    **Step 1 — historial/page.tsx (43 LOC):** Same pattern as Task 1 step 1: read flag via `getIsDashboardV2Enabled(workspaceId)` from cookies. Add eyebrow + h1 editorial when v2:
    ```tsx
    import { cookies } from 'next/headers'
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    // ...preserve other imports...

    export default async function HistorialPage() {
      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value
      const dashV2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false
      // ...preserve data fetching...

      return (
        <div className="flex-1 overflow-y-auto">
          <div className={dashV2 ? 'px-6 py-5 space-y-4' : 'container py-6 space-y-6'}>
            {dashV2 && (
              <div className="border-b border-[var(--ink-1)] pb-4">
                <span className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  Módulo · automatizaciones · historial
                </span>
                <h1 className="mt-1 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Historial de ejecuciones
                </h1>
              </div>
            )}
            <ExecutionHistory ... />
          </div>
        </div>
      )
    }
    ```

    **Step 2 — execution-history.tsx (285 LOC):** Add `import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'` + `const v2 = useDashboardV2()` inside component. Re-skin run rows per mock `.run-list`/`.run-row`:
    ```tsx
    {v2 ? (
      <div className="border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)]">
        {/* Table-like header */}
        <div className="grid grid-cols-[16px_1fr_120px_100px_80px] gap-3 px-4 py-2 border-b border-[var(--ink-1)] bg-[var(--paper-2)]">
          {['', 'Automatización', 'Inicio', 'Duración', 'Estado'].map((h) => (
            <div key={h} className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
              {h}
            </div>
          ))}
        </div>
        {executions.map((exec) => (
          <button
            key={exec.id}
            onClick={() => openDialog(exec)}
            className="w-full grid grid-cols-[16px_1fr_120px_100px_80px] gap-3 px-4 py-2.5 border-b border-dotted border-[var(--border)] hover:bg-[var(--paper-3)] text-left items-center"
          >
            <span className={cn(
              'h-2 w-2 rounded-full',
              exec.status === 'success' ? 'bg-[var(--semantic-success)]' :
              exec.status === 'failed' ? 'bg-[var(--rubric-2)]' :
              exec.status === 'running' ? 'bg-[var(--accent-gold)] animate-pulse' :
              'bg-[var(--ink-4)]'
            )} aria-label={exec.status} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-sans)' }}>
                {exec.automation_name}
              </div>
              <div className="text-[10px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
                #{exec.id.slice(0, 8)}
              </div>
            </div>
            <span className="text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatRelative(exec.started_at)}
            </span>
            <span className="text-[11px] text-[var(--ink-2)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatDuration(exec.duration_ms)}
            </span>
            <span className={cn(
              'mx-tag text-[10px]',
              exec.status === 'success' ? 'mx-tag--verdigris' :
              exec.status === 'failed' ? 'mx-tag--rubric' :
              exec.status === 'running' ? 'mx-tag--gold' :
              'mx-tag--ink'
            )}>
              {exec.status}
            </span>
          </button>
        ))}
      </div>
    ) : (
      /* preserve current execution-history JSX byte-identical */
    )}
    ```
    Use whatever property names exist in the execution type (read from `src/lib/automations/types.ts` if needed — read-only).

    Empty state:
    ```tsx
    {executions.length === 0 && v2 && (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
        <p className="mx-h3">No hay ejecuciones aún.</p>
        <p className="mx-caption">Cuando una automatización corra aparecerá aquí.</p>
        <p className="mx-rule-ornament">· · ·</p>
      </div>
    )}
    ```

    **Step 3 — execution-detail-dialog.tsx (249 LOC):** Add `useDashboardV2`. This file uses shadcn Dialog. Per D-DASH-10, the modal must re-root via portalContainer prop to the `.theme-editorial` wrapper so it inherits the theme.

    Verify Dialog primitive supports portalContainer:
    ```bash
    grep -n "portalContainer\|DialogPortal" src/components/ui/dialog.tsx
    ```

    If `DialogPortal` accepts a `container` prop (Radix native — it does), pass it from this dialog:
    ```tsx
    const v2 = useDashboardV2()
    const editorialContainer = useEditorialContainerRef() // helper from Plan 01 OR fallback to document.querySelector('.theme-editorial')

    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          v2 ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1),0_8px_22px_-16px_oklch(0.2_0.04_60_/_0.3)]' : '',
          'max-w-2xl'
        )}
        // If shadcn Dialog supports portalContainer prop (added by Plan 01 or earlier inbox v2 phase), pass it; otherwise fall back to default rendering
      >
        {v2 ? (
          <>
            <DialogHeader>
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                Ejecución · {execution?.id?.slice(0, 8)}
              </span>
              <DialogTitle asChild>
                <h2 className="text-[20px] font-bold text-[var(--ink-1)] tracking-[-0.01em]" style={{ fontFamily: 'var(--font-display)' }}>
                  {execution?.automation_name}
                </h2>
              </DialogTitle>
            </DialogHeader>
            {/* Content sections — apply mock .ins-sect pattern with smallcaps headers + dotted borders + serif body */}
            <div className="space-y-4 mt-4">
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)] mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                  Pasos ejecutados
                </h3>
                <div className="border border-[var(--border)] bg-[var(--paper-1)]">
                  {/* preserve existing step list rendering, apply v2 row classes */}
                </div>
              </section>
              {/* ...other sections (input/output/error) — apply same editorial pattern... */}
            </div>
          </>
        ) : (
          /* preserve current dialog content byte-identical */
        )}
      </DialogContent>
    </Dialog>
    ```

    NOTE on Dialog portalContainer: if `src/components/ui/dialog.tsx` does NOT yet expose `portalContainer` (check with grep), this task may add it aditively (BC) per D-DASH-09:
    ```typescript
    // In dialog.tsx, find DialogContent component definition:
    interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
      portalContainer?: HTMLElement | null
    }
    function DialogContent({ portalContainer, ...props }) {
      return (
        <DialogPortal container={portalContainer ?? undefined}>
          <DialogOverlay />
          <DialogPrimitive.Content {...props} />
        </DialogPortal>
      )
    }
    ```
    This is a BC-aditive change — existing usages that don't pass `portalContainer` keep working with default portal target.

    **DO NOT MODIFY:**
    - Dialog open/onOpenChange state management
    - Execution data fetching / type usage
    - formatDuration / formatRelative util imports
    - Step rendering logic (just re-skin visually)
    - Error display logic
    - Any `useEffect` for opening/closing dialog
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/execution-history.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/automatizaciones/components/execution-detail-dialog.tsx && grep -q "Módulo · automatizaciones · historial" src/app/\(dashboard\)/automatizaciones/historial/page.tsx && grep -q "mx-tag--verdigris\|mx-tag--rubric\|mx-tag--gold" src/app/\(dashboard\)/automatizaciones/components/execution-history.tsx && grep -q "var(--font-mono)" src/app/\(dashboard\)/automatizaciones/components/execution-history.tsx && grep -q "var(--ink-1)\|var(--paper-0)" src/app/\(dashboard\)/automatizaciones/components/execution-detail-dialog.tsx && (! grep "oklch(" src/app/\(dashboard\)/automatizaciones/components/execution-history.tsx) && npx tsc --noEmit 2>&1 | grep -E "execution-history|execution-detail-dialog|historial/page" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2"` PASS in execution-history.tsx + execution-detail-dialog.tsx.
    - `grep -q "Módulo · automatizaciones · historial"` PASS in historial/page.tsx (eyebrow with U+00B7).
    - `grep -q "mx-tag--verdigris\|mx-tag--rubric\|mx-tag--gold"` PASS in execution-history.tsx (status pills D-DASH-15).
    - `grep -q "var(--font-mono)"` PASS in execution-history.tsx (mono for ID + duration).
    - `grep -q "var(--ink-1)\|var(--paper-0)"` PASS in execution-detail-dialog.tsx (editorial tokens in modal).
    - `! grep "oklch(" <each file>` PASS (no hardcoded OKLCH).
    - `npx tsc --noEmit` reports zero errors.
    - Manual: `git diff src/app/actions/automations.ts src/lib/automations/` returns 0 lines.
    - Manual smoke (flag ON in /automatizaciones/historial): table-like layout with status dots + smallcaps headers + mono ID + serif italic timestamps + mx-tag status pills; clicking row opens modal editorial (paper-0 + ink-1 border + stamp shadow); modal renders inside theme (no slate leakage).
    - Manual (flag OFF): historial page + dialog byte-identical to main.
  </acceptance_criteria>
  <done>Execution history + detail dialog editorial cuando flag ON: table editorial con status dots/pills + mono IDs + modal con paper-0/ink-1/stamp + sections smallcaps. Cuando flag OFF, byte-identical. Dialog correctamente re-rooted al tema. Build clean.</done>
</task>

</tasks>

<verification>
After all 5 tasks:

1. **TypeScript clean:**
   ```bash
   npx tsc --noEmit 2>&1 | grep -E "automatizaciones/" | (! grep -E "error|Error")
   ```

2. **Logic intact (D-DASH-07 verifiable):**
   ```bash
   git diff --name-only main...HEAD | grep -E "^src/(lib/automations|lib/builder|lib/agents|inngest|app/actions/automations|app/actions/builder)" | wc -l
   # Expected: 0
   ```

3. **All v2 hooks wired:**
   ```bash
   grep -l "useDashboardV2" src/app/\(dashboard\)/automatizaciones/ -r | wc -l
   # Expected: ≥ 15 (all interactive components import the hook)
   ```

4. **React Flow lib intact (CRITICAL for Plan 06):**
   ```bash
   grep -c "ReactFlow\|Handle\|Position\|customNodeTypes\|@xyflow/react" src/app/\(dashboard\)/automatizaciones/builder/components/preview-nodes.tsx src/app/\(dashboard\)/automatizaciones/builder/components/automation-preview.tsx
   # Expected: ≥ 10 across both files (handles preserved)
   ```

5. **No new OKLCH hardcoded values:**
   ```bash
   ! grep -r "oklch(" src/app/\(dashboard\)/automatizaciones/ --include="*.tsx" | grep -v "var(--"
   ```

6. **No new dark: classes in v2 branches:**
   ```bash
   git diff src/app/\(dashboard\)/automatizaciones/ | grep "^+" | grep "dark:" | grep -v "^+++"
   # Expected: empty (existing dark: classes inside !v2 branches are OK if they were there before)
   ```

7. **Manual smoke test (flag ON in dev):**
   - Navigate to `/automatizaciones` → editorial listing with eyebrow + h1 + dictionary-table folders/rows + status dots
   - Navigate to `/automatizaciones/nueva` → editorial wizard with smallcaps step indicator + paper-0 cards
   - Navigate to `/automatizaciones/builder` → editorial AI builder chat + canvas with dotted grid
   - Navigate to `/automatizaciones/historial` → table editorial with status pills
   - Click execution row → modal renders inside .theme-editorial wrapper (no slate)
   - Open existing automation in editor: nodes render editorial in canvas
   - Drag a node in canvas: connections still work (handles intact)
   - Send a chat message in builder: useChat/sendMessage still works (AI SDK v6 intact)

8. **Manual smoke test (flag OFF, same workspace):**
   - Visual diff vs main commit `9642e36` for `/automatizaciones/**` is ZERO change.
   - All current shadcn Card/Badge/Switch/Button JSX preserved in `!v2` branches.
</verification>

<success_criteria>
- All 5 tasks pass automated verify commands.
- Build is clean: `npx tsc --noEmit` zero errors in 21 modified files.
- With flag ON: módulo /automatizaciones es completamente editorial — listing dictionary-table + wizard editorial + canvas React Flow con grid dotted ink-4 + nodos paper-0 stamp con smallcaps colored headers + AI builder chat editorial + historial editorial.
- With flag OFF: byte-identical al main commit `9642e36` (verificable con `git diff` solo dentro de `src/app/(dashboard)/automatizaciones/**`, todos los demás paths intactos).
- React Flow lib 100% funcional: handles, edges, dnd, customNodeTypes mapping preserved.
- DnD-kit (folder reordering) intacto.
- AI SDK v6 (useChat/UIMessage/sendMessage/DefaultChatTransport) intacto.
- D-DASH-07 verifiable: `git diff --name-only` muestra cambios SOLO en `src/app/(dashboard)/automatizaciones/**` (+ posiblemente `src/components/ui/dialog.tsx` si se extendió portalContainer aditivamente). Cero cambios en domain/inngest/lib/agents/actions/types.
- D-DASH-08, D-DASH-11, D-DASH-14, D-DASH-15, D-DASH-16 visibles en cada superficie de UI per acceptance criteria de cada task.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/06-SUMMARY.md` with:
- Commits (one per task — ideally atomic; alternativamente split-commits per archivo si una task tocó >5 archivos)
- LOC modified per file (use `git diff --stat`)
- Confirmation of D-DASH-07 strict (zero diff outside `src/app/(dashboard)/automatizaciones/**` + optionally `src/components/ui/dialog.tsx`)
- Pixel-diff vs mock `automatizaciones.html` (link to screenshots if produced — list, wizard, canvas, builder chat, historial)
- React Flow lib safety confirmation (Handles/edges/dnd/customNodeTypes intactos via grep + manual smoke)
- AI SDK v6 plumbing confirmation (useChat/sendMessage/UIMessage works in builder chat)
- Notes about any state-name discoveries (filter category state, search query state, step navigation state) and any small deviations from the plan
- Note if Dialog primitive needed portalContainer extension and if that extension was BC-aditive
- Handoff to Wave 3: Automatizaciones (Plan 06) shipped together with Plan 05 (Agentes); next waves are Plans 07 (Analytics) + 08 (Configuración) en paralelo
</output>
</content>
</invoke>