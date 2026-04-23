---
phase: agent-forensics-panel
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agent-forensics/condense-timeline.ts
  - src/lib/agent-forensics/__tests__/condense-timeline.test.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx
  - src/app/actions/observability.ts
autonomous: true

decisions_addressed: [D-02, D-04, D-05]

must_haves:
  truths:
    - "Funcion `condenseTimeline(detail, respondingAgentId)` existe en `src/lib/agent-forensics/condense-timeline.ts` con whitelist de 16 categorias core + mecanismo AI calls whitelist — queries EXCLUIDAS totalmente (D-05)"
    - "Funcion retorna `CondensedTimelineItem[]` sorted por sequence, cada item con `{kind, sequence, recordedAt, category?, label?, summary, raw}` (D-04)"
    - "Server action `getForensicsViewAction(turnId, startedAt, respondingAgentId)` existe en `src/app/actions/observability.ts` con `assertSuperUser()` gate + discriminated result { status: 'disabled'|'ok' }"
    - "Panel raiz `index.tsx` envuelve el right-pane en un `<Tabs>` shadcn con 3 tabs: Forensics (default) / Raw (TurnDetailView existente sin cambios) / Auditor (placeholder — Plan 04 lo llena)"
    - "`ForensicsTab` renderiza header con `{responding}` + counters + body con `<CondensedTimeline items>` + placeholder `<SessionSnapshot>` (Plan 03 lo conecta)"
    - "`CondensedTimeline` usa hand-rolled fetch + mountedRef pattern (matches turn-detail.tsx precedent); shows 'Turno vacio' fallback si items=[]"
    - "NO tocar `turn-detail.tsx` — se reutiliza tal cual como el body del Raw tab (preserva flow de debugging actual)"
    - "Tests unit en vitest: whitelist coverage (16 categorias matcheadas) + queries-hidden-by-default (D-05) + mechanism AI calls filter + sequence ordering + summary generation per category"
    - "Pitfall 5 mitigado: whitelist vive en UN archivo editable sin redeploy complicado; raw view sigue disponible 1 click away"
  artifacts:
    - path: "src/lib/agent-forensics/condense-timeline.ts"
      provides: "Pure function + exported CORE_CATEGORIES set + CondensedTimelineItem type"
      contains: "condenseTimeline"
    - path: "src/lib/agent-forensics/__tests__/condense-timeline.test.ts"
      provides: "Unit tests — 6+ cases covering whitelist, D-05 query exclusion, mechanism AI filter, summary shapes"
      contains: "describe('condenseTimeline"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx"
      provides: "Tabs wrapper con 3 panels"
      contains: "TabsTrigger"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx"
      provides: "Forensics tab shell — header + CondensedTimeline + snapshot placeholder"
      contains: "ForensicsTab"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx"
      provides: "Row renderer for CondensedTimelineItem[]"
      contains: "CondensedTimeline"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx"
      provides: "Panel root con Tabs integrados (forensics default)"
      contains: "<Tabs defaultValue=\"forensics\""
    - path: "src/app/actions/observability.ts"
      provides: "getForensicsViewAction server action (super-user gated)"
      contains: "getForensicsViewAction"
  key_links:
    - from: "ForensicsTab component"
      to: "getForensicsViewAction"
      via: "hand-rolled useEffect fetch + mountedRef"
      pattern: "getForensicsViewAction\\(turnId"
    - from: "getForensicsViewAction"
      to: "condenseTimeline pure function"
      via: "await getTurnDetail + condenseTimeline(detail, respondingAgentId)"
      pattern: "condenseTimeline\\(detail"
    - from: "index.tsx Tabs"
      to: "TurnDetailView (unchanged)"
      via: "<TabsContent value=\"raw\"><TurnDetailView .../></TabsContent>"
      pattern: "value=\"raw\""
    - from: "condensed-timeline.tsx row"
      to: "CondensedTimelineItem.summary precomputed"
      via: "item.summary rendered directly (no inline JSON.stringify)"
      pattern: "item\\.summary"
---

<objective>
Wave 1 — Panel forensics tab #1: condensed timeline + tabs scaffold. Crea la logica pura de filtrado (`condenseTimeline`), el server action super-user-gated (`getForensicsViewAction`), la estructura de 3 tabs (Forensics/Raw/Auditor) en el panel raiz, y el renderer del timeline condensado. El tab Auditor queda placeholder — Plan 04 lo completa. El tab Forensics tiene el timeline pero aun NO el session snapshot — Plan 03 lo conecta.

Purpose: (a) D-04 — mostrar solo eventos relevantes al mecanismo (16 categorias core + mecanismo AI calls), hiding SQL queries completamente (D-05). (b) D-02 — keep user en la misma ruta (`/whatsapp/...`), wrap existing panel con Tabs en vez de crear ruta nueva. (c) Preservar el flow actual de debugging (Raw tab = TurnDetailView intacto, 1 click away).

Output: 5 archivos nuevos (condense-timeline.ts + 4 componentes UI) + 2 modificados (index.tsx wrapping, actions extendidas) + 1 test file nuevo.

**Dependency:** Plan 01 DEBE estar shipped (migracion aplicada + TurnSummary.respondingAgentId disponible + getDisplayAgentId helper existente). Sin eso, este plan no tiene data correcta que renderizar.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-forensics-panel/CONTEXT.md — <background> (raw dump demasiado extenso), <sub-bug> (impacto en timeline condensado: "entro a X → ruteo a Y → Y respondio")
@.planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md — D-02, D-04, D-05 locked
@.planning/standalone/agent-forensics-panel/RESEARCH.md §Architecture Diagram (lineas 107-184), §Pattern 3 (server action super-user), §Open Items §2 (whitelist concrete — 16 categorias + excluidos), §Open Items §6 (estructura parallel module), §Code Examples (condense-timeline.ts verbatim lineas 599-721), §Pitfall 5 (whitelist too aggressive mitigation)
@.planning/standalone/agent-forensics-panel/PATTERNS.md §condense-timeline.ts NEW, §tabs.tsx NEW, §forensics-tab.tsx NEW, §condensed-timeline.tsx NEW, §index.tsx MOD, §observability.ts MOD
@src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx — layout actual (left/right split lineas 46-70)
@src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx — header + body pattern (lineas 117-170), merge-by-sequence (lineas 75-94)
@src/app/(dashboard)/whatsapp/components/debug-panel-production/event-row.tsx — EVT row visual anchor (lineas 43-62)
@src/app/actions/observability.ts — patron server action con assertSuperUser (lineas 31-51, 68-74)
@src/lib/observability/types.ts — EventCategory union (21 valores — source of truth para whitelist)
@src/lib/observability/repository.ts — TurnDetail shape (POST Plan 01 ya tiene respondingAgentId)
@components/ui/tabs — shadcn Tabs primitive (verify via grep usage en proyecto)

<interfaces>
<!-- CondensedTimelineItem type (new, exported from condense-timeline.ts) -->
export interface CondensedTimelineItem {
  kind: 'event' | 'ai'
  sequence: number
  recordedAt: string
  category?: string
  label?: string | null
  summary: string
  raw: TurnDetailEvent | { purpose: string; durationMs: number; inputTokens: number; outputTokens: number }
}

<!-- CORE_CATEGORIES whitelist (16 core + RESEARCH §Open Items §2) -->
const CORE_CATEGORIES = new Set<string>([
  'session_lifecycle', 'pipeline_decision', 'mode_transition', 'guard',
  'template_selection', 'tool_call', 'no_repetition', 'handoff',
  'timer_signal', 'comprehension', 'media_gate', 'pre_send_check',
  'interruption_handling', 'retake', 'ofi_inter', 'pending_pool',
  'classifier', 'error',  // + classifier + error = 18 total, conservative
])

<!-- Excluded on purpose (D-05 + noise): -->
// 'char_delay' — render detail
// 'disambiguation' — rarely fires
// 'silence_timer' — plumbing
// 'block_composition' — implied by template_selection
// 'intent' — legacy, superseded by comprehension

<!-- getForensicsViewAction result shape -->
export type GetForensicsViewResult =
  | { status: 'disabled'; flagName: string }
  | { status: 'ok'; turn: TurnSummary; condensed: CondensedTimelineItem[] }

<!-- Tabs structure in index.tsx (replaces TurnDetailView call site) -->
<Tabs defaultValue="forensics" className="h-full flex flex-col">
  <TabsList className="flex-shrink-0">
    <TabsTrigger value="forensics">Forensics</TabsTrigger>
    <TabsTrigger value="raw">Raw</TabsTrigger>
    <TabsTrigger value="auditor">Auditor</TabsTrigger>
  </TabsList>
  <TabsContent value="forensics" className="flex-1 min-h-0"><ForensicsTab .../></TabsContent>
  <TabsContent value="raw" className="flex-1 min-h-0"><TurnDetailView .../></TabsContent>
  <TabsContent value="auditor" className="flex-1 min-h-0">
    <div className="p-4 text-sm text-muted-foreground italic">
      Auditor AI — disponible en Plan 04.
    </div>
  </TabsContent>
</Tabs>
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Crear `src/lib/agent-forensics/condense-timeline.ts` + tests unitarios (D-04 + D-05)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Code Examples — Condensed timeline filter (lineas 599-721 — codigo verbatim reference), §Open Items §2 (whitelist completo + per-bot emphasis)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §condense-timeline.ts NEW (lineas 422-443)
    - src/lib/observability/types.ts (EventCategory union — todos los valores validos)
    - src/lib/observability/repository.ts (TurnDetail / TurnDetailEvent types — source of input)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx (merge-by-sequence precedent lineas 75-94)
    - src/lib/agents/somnio-recompra/__tests__/transitions.test.ts (vitest describe/it shape)
  </read_first>
  <behavior>
    - Test 1: Input TurnDetail con 3 events (1 SQL implicit: irrelevant here, pero un `char_delay` + un `pipeline_decision`) + 1 aiCall `comprehension` → output incluye solo el `pipeline_decision` event + el `comprehension` aiCall. Queries parameter NO existe en TurnDetail — el punto es que events de categorias excluidas se filtran.
    - Test 2: Queries (detail.queries es un array) NUNCA aparecen en el output — independiente de como esten tagged, son 100% excluidas (D-05).
    - Test 3: Events ordenados por sequence ascending en el output (aun si input los trae desordenados).
    - Test 4: AI calls con purpose `'no_rep_l2'`, `'comprehension'`, `'classifier'`, `'orchestrator'`, `'minifrase'`, `'paraphrase'`, `'sticker_vision'` son incluidos; purpose `'prompt_versioning'` o similar NO.
    - Test 5: Summary generation — para `pipeline_decision`, incluye label + JSON slim (action/agentId/reason/intent/toAction). Para `template_selection`, incluye `intents=[...]`. Para `guard`, incluye reason.
    - Test 6: Events con categoria fuera del whitelist (`char_delay`, `silence_timer`, `block_composition`, `intent`, `disambiguation`) → NO aparecen en output.
    - Test 7: `error` events siempre incluidos.
  </behavior>
  <action>
    **Paso 1 — Crear el test FIRST** (RED):

    Crear `src/lib/agent-forensics/__tests__/condense-timeline.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest'
    import { condenseTimeline } from '../condense-timeline'

    // Helper to build a minimal TurnDetail fixture
    function makeDetail(overrides: any = {}) {
      return {
        turn: {
          id: 't1',
          conversationId: 'c1',
          workspaceId: 'w1',
          agentId: 'somnio-v3',
          respondingAgentId: 'somnio-recompra-v1',
          startedAt: '2026-04-24T10:00:00Z',
          finishedAt: '2026-04-24T10:00:01Z',
          durationMs: 1000,
          eventCount: 0,
          queryCount: 0,
          aiCallCount: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          hasError: false,
          triggerKind: 'user_message',
          currentMode: null,
          newMode: null,
        },
        events: [],
        queries: [],
        aiCalls: [],
        ...overrides,
      }
    }

    function makeEvent(sequence: number, category: string, label: string | null, payload: any = {}) {
      return {
        id: `e-${sequence}`,
        sequence,
        recordedAt: `2026-04-24T10:00:0${sequence}Z`,
        category,
        label,
        payload,
        durationMs: null,
      }
    }

    function makeAiCall(sequence: number, purpose: string) {
      return {
        id: `ai-${sequence}`,
        sequence,
        recordedAt: `2026-04-24T10:00:0${sequence}Z`,
        purpose,
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 200,
      }
    }

    describe('condenseTimeline — whitelist + D-05 query exclusion', () => {
      it('includes whitelisted event categories and excludes noisy ones', () => {
        const detail = makeDetail({
          events: [
            makeEvent(1, 'pipeline_decision', 'recompra_routed', { contactId: 'x' }),
            makeEvent(2, 'char_delay', null, {}),  // excluded
            makeEvent(3, 'mode_transition', null, { from: 'a', to: 'b' }),
            makeEvent(4, 'block_composition', null, {}),  // excluded
            makeEvent(5, 'template_selection', 'block_composed', { intents: ['saludo'] }),
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-recompra-v1')
        const categories = out.map(i => i.category)
        expect(categories).toContain('pipeline_decision')
        expect(categories).toContain('mode_transition')
        expect(categories).toContain('template_selection')
        expect(categories).not.toContain('char_delay')
        expect(categories).not.toContain('block_composition')
      })

      it('never includes queries (D-05 strict)', () => {
        const detail = makeDetail({
          events: [makeEvent(1, 'pipeline_decision', 'x')],
          queries: [
            { id: 'q1', sequence: 2, recordedAt: '2026-04-24T10:00:02Z', statement: 'SELECT *', durationMs: 5 },
            { id: 'q2', sequence: 3, recordedAt: '2026-04-24T10:00:03Z', statement: 'UPDATE', durationMs: 10 },
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-v3')
        expect(out.every(i => i.kind !== 'query' as any)).toBe(true)
        expect(out.length).toBe(1)
      })

      it('sorts output by sequence ascending', () => {
        const detail = makeDetail({
          events: [
            makeEvent(5, 'pipeline_decision', 'a'),
            makeEvent(1, 'mode_transition', null, { from: 'x', to: 'y' }),
            makeEvent(3, 'comprehension', 'result', { intent: 'saludo' }),
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-v3')
        const seqs = out.map(i => i.sequence)
        expect(seqs).toEqual([1, 3, 5])
      })

      it('includes only mechanism AI call purposes', () => {
        const detail = makeDetail({
          aiCalls: [
            makeAiCall(1, 'comprehension'),  // include
            makeAiCall(2, 'classifier'),  // include
            makeAiCall(3, 'prompt_versioning'),  // exclude
            makeAiCall(4, 'no_rep_l2'),  // include
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-v3')
        const purposes = out.filter(i => i.kind === 'ai').map(i => (i.raw as any).purpose)
        expect(purposes).toEqual(['comprehension', 'classifier', 'no_rep_l2'])
      })

      it('generates meaningful summaries per category', () => {
        const detail = makeDetail({
          events: [
            makeEvent(1, 'pipeline_decision', 'recompra_routed', { agentId: 'somnio-recompra-v1', reason: 'is_client' }),
            makeEvent(2, 'guard', 'blocked', { reason: 'low_confidence' }),
            makeEvent(3, 'template_selection', 'block_composed', { intents: ['saludo', 'precio'] }),
            makeEvent(4, 'mode_transition', null, { from: 'initial', to: 'ofrecer_promos', reason: 'client' }),
            makeEvent(5, 'comprehension', 'result', { intent: 'precio', confidence: 0.9 }),
            makeEvent(6, 'tool_call', null, { tool: 'contacts_get', status: 'ok' }),
            makeEvent(7, 'session_lifecycle', 'turn_started', {}),
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-v3')
        expect(out.find(i => i.category === 'pipeline_decision')?.summary).toMatch(/recompra_routed/)
        expect(out.find(i => i.category === 'guard')?.summary).toMatch(/low_confidence/)
        expect(out.find(i => i.category === 'template_selection')?.summary).toMatch(/saludo/)
        expect(out.find(i => i.category === 'mode_transition')?.summary).toMatch(/initial.*ofrecer_promos/)
        expect(out.find(i => i.category === 'comprehension')?.summary).toMatch(/precio/)
      })

      it('always includes error events', () => {
        const detail = makeDetail({
          events: [
            makeEvent(1, 'error', 'runner_threw', { message: 'boom' }),
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-v3')
        expect(out.length).toBe(1)
        expect(out[0].category).toBe('error')
      })

      it('keeps handoff/timer_signal/media_gate/pre_send_check/interruption_handling/retake/ofi_inter/pending_pool/classifier whitelist members', () => {
        const detail = makeDetail({
          events: [
            makeEvent(1, 'handoff', 'human_takeover', {}),
            makeEvent(2, 'timer_signal', 'fired', {}),
            makeEvent(3, 'media_gate', 'passthrough', {}),
            makeEvent(4, 'pre_send_check', 'passed', {}),
            makeEvent(5, 'interruption_handling', 'branch', {}),
            makeEvent(6, 'retake', 'retoma_inicial', {}),
            makeEvent(7, 'ofi_inter', 'routed', {}),
            makeEvent(8, 'pending_pool', 'enqueued', {}),
            makeEvent(9, 'classifier', 'text', {}),
          ],
        })
        const out = condenseTimeline(detail as any, 'somnio-recompra-v1')
        expect(out).toHaveLength(9)
        expect(out.every((i) => i.kind === 'event')).toBe(true)
      })
    })
    ```

    Correr (debe fallar — el archivo de impl aun no existe):
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/condense-timeline.test.ts
    ```

    **Paso 2 — Implementar `src/lib/agent-forensics/condense-timeline.ts` literal desde RESEARCH.md §Code Examples lineas 599-721** (con pequeno ajuste — agregar `'error'` al whitelist para que el test 7 pase):

    ```typescript
    // src/lib/agent-forensics/condense-timeline.ts
    // Source: RESEARCH.md §Code Examples + §Open Items §2 whitelist
    import type { TurnDetail, TurnDetailEvent } from '@/lib/observability/repository'

    /**
     * Event categories considered "mechanism-relevant" for the condensed timeline (D-04).
     * Queries are ALWAYS excluded (D-05). AI calls kept only for mechanism purposes.
     */
    export const CORE_CATEGORIES: ReadonlySet<string> = new Set([
      'session_lifecycle',
      'pipeline_decision',
      'mode_transition',
      'guard',
      'template_selection',
      'tool_call',
      'no_repetition',
      'handoff',
      'timer_signal',
      'comprehension',
      'media_gate',
      'pre_send_check',
      'interruption_handling',
      'retake',
      'ofi_inter',
      'pending_pool',
      'classifier',
      'error',  // always show errors
    ])

    export interface CondensedTimelineItem {
      kind: 'event' | 'ai'
      sequence: number
      recordedAt: string
      category?: string
      label?: string | null
      summary: string
      raw: TurnDetailEvent | { purpose: string; durationMs: number; inputTokens: number; outputTokens: number; model?: string }
    }

    const MECHANISM_AI_PURPOSES = new Set([
      'comprehension',
      'classifier',
      'orchestrator',
      'no_rep_l2',
      'no_rep_l3',
      'minifrase',
      'paraphrase',
      'sticker_vision',
    ])

    export function condenseTimeline(
      detail: TurnDetail,
      respondingAgentId: string | null,
    ): CondensedTimelineItem[] {
      const items: CondensedTimelineItem[] = []

      for (const e of detail.events) {
        if (!CORE_CATEGORIES.has(e.category)) continue
        items.push({
          kind: 'event',
          sequence: e.sequence,
          recordedAt: e.recordedAt,
          category: e.category,
          label: e.label,
          summary: summarizeEvent(e),
          raw: e,
        })
      }

      for (const a of detail.aiCalls) {
        if (!MECHANISM_AI_PURPOSES.has(a.purpose)) continue
        items.push({
          kind: 'ai',
          sequence: a.sequence,
          recordedAt: a.recordedAt,
          summary: `AI · ${a.purpose} · ${a.model ?? '—'} · ${a.inputTokens}+${a.outputTokens}tok · ${a.durationMs}ms`,
          raw: {
            purpose: a.purpose,
            durationMs: a.durationMs,
            inputTokens: a.inputTokens,
            outputTokens: a.outputTokens,
            model: a.model,
          },
        })
      }

      // NOTA: respondingAgentId reservado para per-bot label-boosting futuro (RESEARCH §Open Items §2 tabla per-bot).
      // Hoy no se usa el parametro en el filter — mantiene signature estable para Plan 04 auditor.
      void respondingAgentId

      return items.sort((a, b) => a.sequence - b.sequence)
    }

    function summarizeEvent(e: TurnDetailEvent): string {
      const p = (e.payload ?? {}) as Record<string, unknown>
      switch (e.category) {
        case 'pipeline_decision':
          return `${e.label ?? '?'} · ${JSON.stringify(slim(p, ['action', 'agentId', 'agent', 'reason', 'intent', 'toAction']))}`
        case 'template_selection':
          return `${e.label ?? '?'} · intents=[${((p.intents as string[]) || []).join(', ')}]`
        case 'guard':
          return `${e.label ?? '?'} · reason=${p.reason ?? '—'}`
        case 'mode_transition':
          return `${p.from ?? '—'} → ${p.to ?? '—'} · ${p.reason ?? ''}`
        case 'comprehension':
          return `intent=${p.intent ?? '—'} · confidence=${p.confidence ?? '—'}`
        case 'tool_call':
          return `${p.tool ?? e.label ?? '?'} · ${p.status ?? ''}`
        case 'session_lifecycle':
          return e.label ?? 'lifecycle'
        case 'error':
          return `${e.label ?? 'error'} · ${p.message ?? JSON.stringify(slim(p, Object.keys(p).slice(0, 3)))}`
        default:
          return `${e.label ?? ''} ${JSON.stringify(slim(p, Object.keys(p).slice(0, 3)))}`
      }
    }

    function slim(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
      const out: Record<string, unknown> = {}
      for (const k of keys) if (k in obj) out[k] = obj[k]
      return out
    }
    ```

    **Paso 3 — Correr tests (GREEN):**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/condense-timeline.test.ts
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/condense-timeline.ts src/lib/agent-forensics/__tests__/condense-timeline.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 02 Task 1 — condense-timeline con 18 categorias core + mechanism AI whitelist (D-04, D-05)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/condense-timeline.test.ts 2>&1 | grep -qE "7 passed|Test Files.*1 passed"</automated>
    <automated>test -f src/lib/agent-forensics/condense-timeline.ts</automated>
    <automated>grep -q "CORE_CATEGORIES" src/lib/agent-forensics/condense-timeline.ts</automated>
    <automated>grep -q "MECHANISM_AI_PURPOSES" src/lib/agent-forensics/condense-timeline.ts</automated>
    <automated>grep -q "'session_lifecycle'" src/lib/agent-forensics/condense-timeline.ts && grep -q "'pipeline_decision'" src/lib/agent-forensics/condense-timeline.ts && grep -q "'template_selection'" src/lib/agent-forensics/condense-timeline.ts</automated>
    <automated>grep -q "'char_delay'" src/lib/agent-forensics/condense-timeline.ts && exit 1 || exit 0</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "condense-timeline" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `condense-timeline.ts` existe con `CORE_CATEGORIES` export + `MECHANISM_AI_PURPOSES` set + `condenseTimeline(detail, respondingAgentId)` + `summarizeEvent` helper.
    - El whitelist contiene exactamente 18 categorias (los 16 del research §Open Items §2 + classifier + error).
    - El whitelist NO contiene `char_delay`, `disambiguation`, `silence_timer`, `block_composition`, `intent`.
    - 7 tests verde en `condense-timeline.test.ts`.
    - TypeScript compile limpio.
    - Commit atomico local.
  </acceptance_criteria>
  <done>
    - Logica pura de filtrado lista + testeada. Plans 03 y 04 pueden importarla.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extender `src/app/actions/observability.ts` con `getForensicsViewAction` (super-user gated, wraps condenseTimeline)</name>
  <read_first>
    - src/app/actions/observability.ts (patrones existentes: getTurnsByConversationAction 40-51, getTurnDetailAction 68-74)
    - src/lib/observability/repository.ts (getTurnDetail disponible + TurnSummary.respondingAgentId disponible POST Plan 01)
    - src/lib/auth/super-user.ts (assertSuperUser signature — throws 'FORBIDDEN')
    - src/lib/agent-forensics/condense-timeline.ts (POST Task 1 — condenseTimeline + CondensedTimelineItem type disponibles)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 3 (lineas 339-354), §Shared Patterns (lineas 1054-1075 — full example of discriminated result)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §observability.ts MOD (lineas 615-650)
  </read_first>
  <action>
    **Paso 1 — Abrir `src/app/actions/observability.ts`.** Verificar en el top que esta `'use server'` + imports existentes: `assertSuperUser`, `isObservabilityEnabled`, `OBSERVABILITY_FLAG_NAME`, `listTurnsForConversation`, `getTurnDetail`.

    **Paso 2 — Agregar imports nuevos** (al inicio del file, junto con los existentes):

    ```typescript
    import { condenseTimeline, type CondensedTimelineItem } from '@/lib/agent-forensics/condense-timeline'
    import type { TurnSummary } from '@/lib/observability/repository'
    ```

    **Paso 3 — Agregar el type + action al FINAL del archivo** (DESPUES de `getTurnDetailAction`):

    ```typescript
    export type GetForensicsViewResult =
      | { status: 'disabled'; flagName: string }
      | { status: 'ok'; turn: TurnSummary; condensed: CondensedTimelineItem[] }

    /**
     * Returns the condensed forensics view for a single turn: the turn summary
     * (with respondingAgentId) + the filtered timeline items (D-04 + D-05).
     *
     * Gated by super-user (same as other observability actions).
     */
    export async function getForensicsViewAction(
      turnId: string,
      startedAt: string,
      respondingAgentId: string | null,
    ): Promise<GetForensicsViewResult> {
      await assertSuperUser()

      if (!isObservabilityEnabled()) {
        return { status: 'disabled', flagName: OBSERVABILITY_FLAG_NAME }
      }

      const detail = await getTurnDetail(turnId, startedAt)
      const condensed = condenseTimeline(detail, respondingAgentId)
      return { status: 'ok', turn: detail.turn, condensed }
    }
    ```

    **Paso 4 — Verify typecheck:**
    ```bash
    npx tsc --noEmit
    ```

    **Paso 5 — Commit local:**
    ```bash
    git add src/app/actions/observability.ts
    git commit -m "feat(agent-forensics-panel): Plan 02 Task 2 — getForensicsViewAction server action (D-02, D-04)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -q "getForensicsViewAction" src/app/actions/observability.ts</automated>
    <automated>grep -q "GetForensicsViewResult" src/app/actions/observability.ts</automated>
    <automated>grep -q "condenseTimeline(detail, respondingAgentId)" src/app/actions/observability.ts</automated>
    <automated>grep -q "await assertSuperUser" src/app/actions/observability.ts | head -1</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "observability\.ts" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `getForensicsViewAction(turnId, startedAt, respondingAgentId)` exportada.
    - Result type discriminated: `'disabled' | 'ok'`.
    - Llama `assertSuperUser()` primero.
    - Llama `getTurnDetail` + `condenseTimeline(detail, respondingAgentId)`.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Server action lista. UI la consume en Task 4.
  </done>
</task>

<task type="auto">
  <name>Task 3: Crear `tabs.tsx` (3-tab wrapper shadcn) + `condensed-timeline.tsx` (row renderer) + `forensics-tab.tsx` (shell con header + timeline + snapshot placeholder)</name>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx (header 117-155, body list 154-167)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/event-row.tsx (EVT visual anchor 43-62)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx (hand-rolled fetch + mountedRef pattern 48-88)
    - Verify shadcn tabs: `grep -rln "@/components/ui/tabs" src/app/(dashboard)/ | head -3` para confirmar usage pattern
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §tabs.tsx NEW (691-708), §condensed-timeline.tsx NEW (749-782), §forensics-tab.tsx NEW (712-745), §Shared Patterns §Hand-rolled fetch (1078-1101)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Open Items §6 (component tree)
  </read_first>
  <action>
    **Paso 1 — Verificar shadcn Tabs path:**
    ```bash
    ls src/components/ui/tabs.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
    ```

    Si MISSING: instalar con `npx shadcn@latest add tabs` — pero esperamos que exista (es estandar). Documentar si hay que agregarlo.

    **Paso 2 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx`** (wrapper component que abstrae los 3 tabs):

    ```typescript
    'use client'
    import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
    import { ForensicsTab } from './forensics-tab'
    import { TurnDetailView } from './turn-detail'

    interface Props {
      turnId: string
      startedAt: string
      respondingAgentId: string | null
      conversationId: string
    }

    export function DebugPanelTabs({ turnId, startedAt, respondingAgentId, conversationId }: Props) {
      return (
        <Tabs defaultValue="forensics" className="h-full flex flex-col">
          <TabsList className="flex-shrink-0 justify-start border-b rounded-none bg-transparent p-0 h-auto">
            <TabsTrigger value="forensics" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">Forensics</TabsTrigger>
            <TabsTrigger value="raw" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">Raw</TabsTrigger>
            <TabsTrigger value="auditor" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">Auditor</TabsTrigger>
          </TabsList>
          <TabsContent value="forensics" className="flex-1 min-h-0 mt-0">
            <ForensicsTab
              turnId={turnId}
              startedAt={startedAt}
              respondingAgentId={respondingAgentId}
              conversationId={conversationId}
            />
          </TabsContent>
          <TabsContent value="raw" className="flex-1 min-h-0 mt-0">
            <TurnDetailView turnId={turnId} startedAt={startedAt} />
          </TabsContent>
          <TabsContent value="auditor" className="flex-1 min-h-0 mt-0">
            <div className="h-full flex items-center justify-center p-4">
              <div className="text-sm text-muted-foreground italic">
                Auditor AI — disponible en Plan 04.
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )
    }
    ```

    **Paso 3 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx`** (row renderer puro, recibe items ya condensados):

    ```typescript
    'use client'
    import type { CondensedTimelineItem } from '@/lib/agent-forensics/condense-timeline'

    interface Props {
      items: CondensedTimelineItem[]
    }

    export function CondensedTimeline({ items }: Props) {
      if (items.length === 0) {
        return (
          <div className="p-4 text-xs text-muted-foreground italic">
            Turno sin eventos relevantes al mecanismo (vista condensada).
            Abrir tab "Raw" para ver timeline completo.
          </div>
        )
      }

      return (
        <div className="divide-y">
          {items.map((item) => (
            <CondensedRow key={`${item.kind}-${item.sequence}`} item={item} />
          ))}
        </div>
      )
    }

    function CondensedRow({ item }: { item: CondensedTimelineItem }) {
      const anchor = item.kind === 'event' ? 'EVT' : 'AI'
      const anchorColor =
        item.kind === 'event' ? 'text-cyan-600 dark:text-cyan-400' : 'text-purple-600 dark:text-purple-400'

      return (
        <div className="px-3 py-2 hover:bg-muted/50">
          <div className="flex items-start gap-2 text-xs font-mono">
            <span className="text-muted-foreground w-10 shrink-0">{String(item.sequence).padStart(3, '0')}</span>
            <span className={`font-semibold w-8 shrink-0 ${anchorColor}`}>{anchor}</span>
            <div className="flex-1 min-w-0">
              {item.category && (
                <span className="text-foreground font-medium">{item.category}</span>
              )}
              {item.label && (
                <span className="ml-1 text-muted-foreground">· {item.label}</span>
              )}
              <div className="text-muted-foreground whitespace-pre-wrap break-words mt-0.5">
                {item.summary}
              </div>
            </div>
          </div>
        </div>
      )
    }
    ```

    **Paso 4 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx`** (shell con fetch + header + timeline + snapshot placeholder):

    ```typescript
    'use client'
    import { useEffect, useRef, useState } from 'react'
    import { getForensicsViewAction, type GetForensicsViewResult } from '@/app/actions/observability'
    import { CondensedTimeline } from './condensed-timeline'
    import { getDisplayAgentId } from './get-display-agent-id'

    interface Props {
      turnId: string
      startedAt: string
      respondingAgentId: string | null
      conversationId: string
    }

    type ViewState =
      | { kind: 'loading' }
      | { kind: 'disabled'; flagName: string }
      | { kind: 'data'; result: Extract<GetForensicsViewResult, { status: 'ok' }> }
      | { kind: 'error'; message: string }

    export function ForensicsTab({ turnId, startedAt, respondingAgentId, conversationId }: Props) {
      const [view, setView] = useState<ViewState>({ kind: 'loading' })
      const mountedRef = useRef(true)

      useEffect(() => {
        mountedRef.current = true
        setView({ kind: 'loading' })
        let cancelled = false

        ;(async () => {
          try {
            const result = await getForensicsViewAction(turnId, startedAt, respondingAgentId)
            if (cancelled || !mountedRef.current) return
            if (result.status === 'disabled') {
              setView({ kind: 'disabled', flagName: result.flagName })
            } else {
              setView({ kind: 'data', result })
            }
          } catch (err) {
            if (cancelled || !mountedRef.current) return
            setView({
              kind: 'error',
              message: err instanceof Error ? err.message : String(err),
            })
          }
        })()

        return () => {
          cancelled = true
          mountedRef.current = false
        }
      }, [turnId, startedAt, respondingAgentId])

      if (view.kind === 'loading') {
        return <div className="p-4 text-xs text-muted-foreground italic">Cargando vista forensics…</div>
      }
      if (view.kind === 'disabled') {
        return (
          <div className="p-4 text-xs text-muted-foreground">
            Observability deshabilitada (flag: <code>{view.flagName}</code>).
          </div>
        )
      }
      if (view.kind === 'error') {
        return (
          <div className="p-4 text-xs text-destructive">
            Error cargando forensics: {view.message}
          </div>
        )
      }

      const { turn, condensed } = view.result

      return (
        <div className="h-full flex flex-col min-h-0">
          {/* Header */}
          <div className="px-3 py-2 border-b flex-shrink-0 space-y-1">
            <div className="text-sm font-medium">
              {getDisplayAgentId(turn)}
              {turn.agentId !== (turn.respondingAgentId ?? turn.agentId) && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (entry: {turn.agentId})
                </span>
              )}
              {turn.triggerKind && (
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  · {turn.triggerKind}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono flex flex-wrap gap-x-3">
              <span>{turn.durationMs ?? '—'}ms</span>
              <span>{turn.totalTokens}tok</span>
              <span>${turn.totalCostUsd.toFixed(4)}</span>
              <span>{condensed.length} items</span>
              {turn.hasError && <span className="text-destructive font-medium">ERROR</span>}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <CondensedTimeline items={condensed} />

            {/* Snapshot placeholder — Plan 03 lo reemplaza con <SessionSnapshot conversationId=... /> */}
            <div className="border-t mt-2 px-3 py-3 text-xs text-muted-foreground italic">
              Snapshot de session_state — disponible en Plan 03 (conversationId={conversationId.slice(0, 8)}…).
            </div>
          </div>
        </div>
      )
    }
    ```

    **Paso 5 — Verify typecheck:**
    ```bash
    npx tsc --noEmit
    ```

    **Paso 6 — Commit local:**
    ```bash
    git add src/app/\(dashboard\)/whatsapp/components/debug-panel-production/tabs.tsx \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/condensed-timeline.tsx \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/forensics-tab.tsx
    git commit -m "feat(agent-forensics-panel): Plan 02 Task 3 — tabs + condensed-timeline + forensics-tab shell (D-02, D-04)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx"</automated>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx"</automated>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx"</automated>
    <automated>grep -q "DebugPanelTabs" "src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx"</automated>
    <automated>grep -q "defaultValue=\"forensics\"" "src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx"</automated>
    <automated>grep -q "CondensedTimeline" "src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx"</automated>
    <automated>grep -q "getForensicsViewAction" "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx"</automated>
    <automated>grep -q "mountedRef" "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "(tabs|condensed-timeline|forensics-tab)\.tsx" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `tabs.tsx` existe, exporta `DebugPanelTabs` con 3 tabs (Forensics default, Raw que usa TurnDetailView sin cambios, Auditor placeholder).
    - `condensed-timeline.tsx` existe, exporta `CondensedTimeline({ items })` que renderiza rows con sequence + kind anchor + summary.
    - `forensics-tab.tsx` existe, usa `getForensicsViewAction`, hand-rolled fetch + mountedRef, muestra header con `getDisplayAgentId(turn)` + counters + timeline body + snapshot placeholder que menciona Plan 03.
    - TypeScript compile limpio.
    - Commit local atomico.
  </acceptance_criteria>
  <done>
    - 3 componentes UI creados. Integracion con `index.tsx` en Task 4.
  </done>
</task>

<task type="auto">
  <name>Task 4: Integrar `DebugPanelTabs` en `index.tsx` — reemplazar call de TurnDetailView directo con el wrapper de Tabs</name>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx (estructura actual lineas 46-70 — left sidebar + right pane con TurnDetailView)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx (firma del callback onSelectTurn — verifica si pasa respondingAgentId)
    - src/lib/observability/repository.ts (TurnSummary POST Plan 01 ya tiene respondingAgentId)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §index.tsx MOD (lineas 654-687)
  </read_first>
  <action>
    **Paso 1 — Leer `index.tsx`:**
    ```bash
    cat src/app/\(dashboard\)/whatsapp/components/debug-panel-production/index.tsx
    ```

    Identificar:
    - Como `selectedTurn` se setea — se esperara que guarde `{id, startedAt}`. Para los tabs necesitamos tambien `respondingAgentId` y `conversationId`.
    - Firma de `onSelectTurn` en turn-list.

    **Paso 2 — Extender el state selectedTurn + callback:**

    El state actual es algo como `useState<{id, startedAt} | null>(null)`. Extender a:

    ```typescript
    const [selectedTurn, setSelectedTurn] = useState<{
      id: string
      startedAt: string
      respondingAgentId: string | null
    } | null>(null)
    ```

    Verificar en `turn-list.tsx` como se invoca `onSelectTurn`. Probablemente line ~170 con `onSelectTurn(turn.id, turn.startedAt)`. Extender para pasar `respondingAgentId`:

    ```typescript
    onSelectTurn(turn.id, turn.startedAt, turn.respondingAgentId ?? null)
    ```

    Y en la signature del prop en `turn-list.tsx`:
    ```typescript
    onSelectTurn: (id: string, startedAt: string, respondingAgentId: string | null) => void
    ```

    **Paso 3 — En `index.tsx`, reemplazar `<TurnDetailView>` con `<DebugPanelTabs>`:**

    El bloque actual es algo como:

    ```typescript
    <div className="flex-1 min-w-0 min-h-0">
      {selectedTurn ? (
        <TurnDetailView
          key={selectedTurn.id}
          turnId={selectedTurn.id}
          startedAt={selectedTurn.startedAt}
        />
      ) : (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-sm text-muted-foreground italic">
            Selecciona un turno de la lista.
          </div>
        </div>
      )}
    </div>
    ```

    Reemplazar con:

    ```typescript
    <div className="flex-1 min-w-0 min-h-0">
      {selectedTurn ? (
        <DebugPanelTabs
          key={selectedTurn.id}
          turnId={selectedTurn.id}
          startedAt={selectedTurn.startedAt}
          respondingAgentId={selectedTurn.respondingAgentId}
          conversationId={conversationId}
        />
      ) : (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-sm text-muted-foreground italic">
            Selecciona un turno de la lista.
          </div>
        </div>
      )}
    </div>
    ```

    **Paso 4 — Actualizar imports al top de `index.tsx`:**

    Remover (si existe) `import { TurnDetailView } from './turn-detail'` (ya no se importa directo — vive dentro de tabs.tsx). Agregar:

    ```typescript
    import { DebugPanelTabs } from './tabs'
    ```

    **Paso 5 — Actualizar el `onSelectTurn` callback:**

    ```typescript
    onSelectTurn={(id, startedAt, respondingAgentId) =>
      setSelectedTurn({ id, startedAt, respondingAgentId })
    }
    ```

    **Paso 6 — Verify typecheck + run suite:**
    ```bash
    npx tsc --noEmit
    npm test -- --run src/lib/agent-forensics 2>&1 | tail -10
    ```

    **Paso 7 — Manual smoke test local (opcional pero recomendado):**

    Si hay tiempo en dev:
    ```bash
    npm run dev
    ```
    Abrir `http://localhost:3020/whatsapp`, abrir un conversation, abrir "Debug bot", seleccionar un turn. Verificar:
    - Tabs aparecen (Forensics / Raw / Auditor).
    - Default es Forensics; muestra header con agentId + counters, body con timeline condensado (sin queries).
    - Click Raw → muestra TurnDetailView intacto (lista completa raw).
    - Click Auditor → muestra placeholder "Plan 04".

    **Paso 8 — Commit local:**
    ```bash
    git add src/app/\(dashboard\)/whatsapp/components/debug-panel-production/index.tsx \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/turn-list.tsx
    git commit -m "feat(agent-forensics-panel): Plan 02 Task 4 — integrar Tabs en panel root (D-02)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```

    **Paso 9 — Push atomico del plan completo:**

    (Los commits de Task 1, 2, 3, 4 se pushean juntos).

    ```bash
    npm test -- --run 2>&1 | tail -10  # verify nothing broke
    git push origin main
    ```
  </action>
  <verify>
    <automated>grep -q "import { DebugPanelTabs }" "src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx"</automated>
    <automated>grep -q "<DebugPanelTabs" "src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx"</automated>
    <automated>grep -q "respondingAgentId" "src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx"</automated>
    <automated>grep -q "respondingAgentId" "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx"</automated>
    <automated>grep -q "TurnDetailView" "src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx" && exit 1 || exit 0</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
    <automated>npm test -- --run 2>&1 | tail -5 | grep -qE "passed|Test Suites"</automated>
    <automated>git log origin/main..HEAD --oneline 2>&1 | wc -l | grep -qE "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `index.tsx` ya NO importa `TurnDetailView` directamente.
    - `index.tsx` importa `DebugPanelTabs` y lo renderiza en el right pane.
    - `selectedTurn` state incluye `respondingAgentId`.
    - `turn-list.tsx` signature de `onSelectTurn` incluye `respondingAgentId` como 3er parametro.
    - TypeScript compile limpio.
    - Suite test full verde (o solo fails preexistentes).
    - 4 commits de Plan 02 pusheados a origin/main.
  </acceptance_criteria>
  <done>
    - Tab forensics visible en prod, condensed timeline + header funcionando, Raw tab preservado.
    - Auditor tab queda placeholder hasta Plan 04.
    - Snapshot queda placeholder hasta Plan 03.
  </done>
</task>

</tasks>

<verification>
## Plan 02 — Verificacion goal-backward

**Truths observables post-plan:**

1. **Funcional UI:** Abrir un conversation panel en prod, seleccionar turn → aparecen 3 tabs. Default Forensics.
2. **Timeline condensado:** En un turn tipico de 19 events + 22 queries, el tab Forensics muestra aprox 5-10 items (solo mechanism events + mechanism AI calls, cero queries).
3. **Raw intacto:** Click tab Raw → lista completa raw como antes (sin regresion).
4. **Auditor placeholder:** Click tab Auditor → mensaje "disponible en Plan 04".
5. **Header correcto:** Forensics header muestra `getDisplayAgentId(turn)` — para un turn de recompra muestra `somnio-recompra-v1` (entry: somnio-v3) tras Plan 01 fix.
6. **Snapshot placeholder:** Al final del body de Forensics dice "Snapshot — disponible en Plan 03".
7. **Tests verde:** `condense-timeline.test.ts` 7 tests verde.
8. **No regressions:** Turn-list sigue funcionando (muestra responding agent ID correcto), fetch + polling funciona, super-user gate no rota.
</verification>

<success_criteria>
- 4 archivos nuevos (`condense-timeline.ts` + `tabs.tsx` + `condensed-timeline.tsx` + `forensics-tab.tsx`) + 1 test nuevo + 2 archivos modificados (`observability.ts` + `index.tsx` + `turn-list.tsx`).
- `getForensicsViewAction` super-user-gated + wraps condenseTimeline.
- Timeline condensado filtra queries (D-05) + whitelist de 18 categorias (D-04).
- UI tabs en prod con Forensics default (D-02).
- 4 commits pusheados a origin/main (atomicos por task).
- Vercel deploy Ready + smoke test manual pasa.
</success_criteria>

<output>
Al cerrar este plan, crear `.planning/standalone/agent-forensics-panel/02-SUMMARY.md` documentando:
- Numero typico de items condensados vs raw (ej. "turn con 19 events → 7 items condensed").
- Cualquier ajuste al whitelist durante implementacion (si se descubrio que alguna categoria adicional es necesaria — actualizar RESEARCH.md Open Items §2).
- Screenshots (opcional) del tab Forensics vs Raw.
- Notas para Plan 03: conversationId ya se pasa a `ForensicsTab` — Plan 03 solo tiene que crear `SessionSnapshot` y reemplazar el placeholder dentro de `forensics-tab.tsx`.
- Notas para Plan 04: el tab Auditor ya esta en `tabs.tsx` como placeholder — Plan 04 reemplaza el contenido del TabsContent value="auditor".
</output>
