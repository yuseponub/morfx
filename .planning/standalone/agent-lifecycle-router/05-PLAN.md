---
phase: agent-lifecycle-router
plan: 05
type: execute
wave: 3                    # B-4 wave shift: was 2, now 3 (Plan 03 moved to wave 2)
depends_on: [03]            # Plan 03 routeAgent + buildEngine; transitively 02 + 01
files_modified:
  - src/lib/agents/routing/dry-run.ts
  - src/lib/agents/routing/__tests__/dry-run.test.ts
autonomous: true
requirements_addressed: [ROUTER-REQ-05, ROUTER-REQ-11]
user_setup: []

must_haves:
  truths:
    - "`dryRunReplay({ workspaceId, candidateRules, daysBack })` evalua candidate rules contra los ultimos N dias de mensajes inbound (default daysBack=7) usando facts AS-OF-NOW (D-14 — NO event-time replay)."
    - "Dry-run NO escribe en `routing_audit_log`. Si por accidente una regla candidate emite agent_id null y el codigo sigue, NO debe haber llamadas a `recordAuditLog`. Verificable: el modulo NO importa `recordAuditLog`."
    - "Dry-run reusa `buildEngine` de Plan 03 (NO fork del engine), construye Engine NUEVO con candidateRules en cada conversacion replayed (Pitfall 7 — per-request)."
    - "Output `DryRunResult`: `total_inbound: number`, `decisions: Array<{ conversation_id, contact_id, current_decision: { agent_id, reason } | null, candidate_decision: { agent_id, reason }, changed: boolean }>`, `summary: { changed_count, before: Record<agent_id_or_reason, count>, after: Record<agent_id_or_reason, count> }`."
    - "`current_decision` se obtiene llamando `routeAgent` con las rules ACTIVAS actuales (production cache). `candidate_decision` se obtiene construyendo Engine fresh con candidateRules pasados en parametro. Diff = `current_decision.agent_id !== candidate_decision.agent_id || current_decision.reason !== candidate_decision.reason`."
    - "Tests vitest: dry-run no mutates routing_audit_log, dry-run con same rules → changed_count=0, dry-run con rule nueva que cubre is_client → changed_count > 0 + before/after distribution shift, dry-run con candidateRules invalido (path field) → throws BEFORE replay (validacion via validateRule)."
  artifacts:
    - path: "src/lib/agents/routing/dry-run.ts"
      provides: "`dryRunReplay({ workspaceId, candidateRules, daysBack })` — public API for admin form Plan 06 'Simular cambio' button + Plan 07 parity validation."
      exports: ["dryRunReplay", "DryRunResult", "DryRunInput"]
  key_links:
    - from: "src/lib/agents/routing/dry-run.ts"
      to: "src/lib/agents/routing/route.ts:routeAgent (current decision)"
      via: "import + invoke una vez por (conversation, contact) en window"
      pattern: "routeAgent"
    - from: "src/lib/agents/routing/dry-run.ts"
      to: "src/lib/agents/routing/engine.ts:buildEngine (candidate decision)"
      via: "import + new Engine per conversation con candidate rules"
      pattern: "buildEngine"
    - from: "src/lib/agents/routing/dry-run.ts"
      to: "src/lib/agents/routing/schema/validate.ts:validateRule"
      via: "validate cada candidate rule ANTES de replay (early failure)"
      pattern: "validateRule"
---

<objective>
Wave 2 — Dry-run replay simulator (D-10 mandatory v1 safety net + D-14 as-of-now semantics).

Purpose: Antes de aplicar cualquier cambio de regla en el admin form (Plan 06) O antes de flip flag en Somnio (Plan 07), correr las candidate rules contra los ultimos N dias de mensajes y mostrar (a) cuantas decisiones cambiarian, (b) distribucion before/after por agent/reason, (c) lista de conversaciones afectadas con conversation_id linkable.

Output: 1 archivo `dry-run.ts` + 1 archivo de tests. Funcion publica `dryRunReplay` que el admin form (Plan 06) llama, y que Plan 07 usa para parity validation Somnio.

**CRITICAL — D-14 semantics:** Facts evaluados AS-OF-NOW, no as-of-event-time. Reasoning RESEARCH.md:
1. No tenemos event sourcing — `orders.stage_id` es current pointer.
2. La pregunta operativa real es: "si deploy estas rules HOY, que decidirian para LOS contactos en su estado ACTUAL".
3. NO disclaimer en UI (D-14 — el editor del form se asume informado).

**CRITICAL — D-10 safety:** Dry-run NUNCA escribe a `routing_audit_log`. Verificable via grep: `grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts` debe retornar VACIO.

**CRITICAL — Pitfall 7:** Cada conversation replay construye `new Engine()` con las candidate rules. NO singleton. NO compartir Engine entre conversations.

**CRITICAL — Pitfall 4 + Pitfall 5:** Dry-run valida candidateRules con `validateRule` ANTES de replay. Si una rule es invalida (path field, schema_version != v1, etc.), throws con error claro antes de hacer cualquier DB read.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # D-10 (dry-run mandatory v1), D-14 (as-of-now)
@.planning/standalone/agent-lifecycle-router/RESEARCH.md  # §Architecture Patterns Pattern 4 lineas 443-485 (dry-run replay loop code) + §Validation Architecture lineas 990-995 (test requirements)
@src/lib/agents/routing/route.ts  # creado Plan 03 — public routeAgent
@src/lib/agents/routing/engine.ts  # creado Plan 03 — buildEngine factory
@src/lib/agents/routing/schema/validate.ts  # creado Plan 02 — validateRule
@src/lib/domain/routing.ts  # creado Plan 02 — types RoutingRule
@src/lib/domain/messages.ts  # source de getLastInboundsForLastDays (CREAR si no existe — read-only domain function)

<interfaces>
<!-- Public API shape -->
export interface DryRunInput {
  workspaceId: string
  candidateRules: RoutingRule[]   // las rules a evaluar (sin commit aun)
  daysBack: number                 // default 7 (D-10)
  limit?: number                   // optional cap on conversations to replay (default 500)
}

export interface DryRunDecisionRow {
  conversation_id: string
  contact_id: string
  inbound_message_at: string  // historical timestamp (informational only — D-14)
  current_decision: { agent_id: string | null; reason: string; lifecycle_state: string } | null
  candidate_decision: { agent_id: string | null; reason: string; lifecycle_state: string }
  changed: boolean
}

export interface DryRunResult {
  total_inbound: number
  decisions: DryRunDecisionRow[]
  summary: {
    changed_count: number
    before: Record<string, number>  // key = `${reason}:${agent_id ?? 'null'}` o agent_id si reason=matched
    after: Record<string, number>
  }
}

<!-- Domain function necesaria — agregar si no existe en messages.ts -->
export async function getInboundConversationsLastNDays(
  workspaceId: string,
  daysBack: number,
  limit: number = 500,
): Promise<Array<{ conversation_id: string; contact_id: string; inbound_message_at: string }>>
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: dry-run.ts (replay loop, validacion candidate, summary diff) + tests</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Architecture Patterns Pattern 4 lineas 443-485 (dry-run code template)
    - src/lib/agents/routing/route.ts (creado Plan 03 — RouteDecision shape + routeAgent signature)
    - src/lib/agents/routing/engine.ts (creado Plan 03 — buildEngine signature)
    - src/lib/agents/routing/schema/validate.ts (creado Plan 02 — validateRule)
    - src/lib/domain/messages.ts (verificar si tiene query para inbound conversations en window — agregar si no)
  </read_first>
  <behavior>
    - Test 1: candidateRules con `path` field → `dryRunReplay` THROWS con mensaje "schema validation failed" ANTES de leer DB (validacion early).
    - Test 2: candidateRules igual al cache de production (same rules) → `summary.changed_count = 0`, todas las `decisions[].changed = false`.
    - Test 3: candidateRules NUEVO que rutea is_client a 'somnio-postsale-v1' (no existe hoy) → `summary.changed_count > 0` para conversations de clients, `summary.before` shows actual production reasons, `summary.after` shows new reasons.
    - Test 4: dry-run NUNCA invoca `recordAuditLog` (mock recordAuditLog y assert no called).
    - Test 5: limit (default 500) respetado — si hay 1000 inbound conversations en window, solo 500 se replayean.
    - Test 6: candidate `agent_id` que no esta en agentRegistry → en candidate_decision el throw del routeAgent emerges como `reason: 'fallback_legacy'` (no rompe el dry-run total). El conversation aparece en results con flag `candidate_decision.reason='fallback_legacy'`.
    - Test 7: shape exacta de output (total_inbound, decisions, summary) — typed.
  </behavior>
  <action>
    **Paso 1 — Verificar que `getInboundConversationsLastNDays` esta disponible** (B-4 fix: Plan 02 Task 3 ya la creo en `src/lib/domain/messages.ts`).

    ```bash
    grep -q "export async function getInboundConversationsLastNDays" src/lib/domain/messages.ts
    ```

    Si falla -> Plan 02 Task 3 incompleto, BLOCKER. NO proceder. Plan 05 SOLO importa, no extiende domain.

    **Paso 2 — Crear `src/lib/agents/routing/__tests__/dry-run.test.ts`** (RED). Mocks:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { validClassifierRule, validRouterRule, ruleWithPathField, makeRule } from './fixtures'

    const mockRouteAgent = vi.fn()
    vi.mock('../route', () => ({
      routeAgent: (input: any) => mockRouteAgent(input),
    }))

    const mockBuildEngine = vi.fn()
    vi.mock('../engine', () => ({
      buildEngine: (input: any) => mockBuildEngine(input),
    }))

    const mockGetConversations = vi.fn()
    vi.mock('@/lib/domain/messages', () => ({
      getInboundConversationsLastNDays: (...args: any[]) => mockGetConversations(...args),
    }))

    const mockRecordAuditLog = vi.fn()
    vi.mock('@/lib/domain/routing', async () => {
      const actual = await vi.importActual<any>('@/lib/domain/routing')
      return { ...actual, recordAuditLog: (...args: any[]) => mockRecordAuditLog(...args) }
    })

    import { dryRunReplay } from '../dry-run'

    beforeEach(() => {
      vi.clearAllMocks()
      mockGetConversations.mockResolvedValue([
        { conversation_id: 'c1', contact_id: 'ct1', inbound_message_at: '2026-04-25T10:00:00-05:00' },
        { conversation_id: 'c2', contact_id: 'ct2', inbound_message_at: '2026-04-24T10:00:00-05:00' },
      ])
      mockRouteAgent.mockResolvedValue({
        agent_id: 'somnio-recompra-v1',
        reason: 'matched',
        lifecycle_state: 'in_transit',
        fired_classifier_rule_id: 'cls-1',
        fired_router_rule_id: 'rt-1',
        latency_ms: 5,
        facts_snapshot: {},
      })
      // Mock candidate engine to also return matched 'somnio-recompra-v1' (= same as production → no change)
      const mockEngine = {
        run: vi.fn().mockResolvedValue({ events: [], results: [], almanac: { factValue: vi.fn().mockResolvedValue('in_transit') } }),
        addRule: vi.fn(),
        addFact: vi.fn(),
        stop: vi.fn(),
      }
      mockBuildEngine.mockReturnValue(mockEngine)
    })

    describe('dryRunReplay', () => {
      const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'

      it('throws BEFORE replay if a candidate rule has path field (Pitfall 2)', async () => {
        await expect(
          dryRunReplay({ workspaceId: ws, candidateRules: [ruleWithPathField as any], daysBack: 7 }),
        ).rejects.toThrow(/schema|path|validation/i)
        expect(mockGetConversations).not.toHaveBeenCalled()
      })

      it('NEVER writes to routing_audit_log (D-10 safety)', async () => {
        const goodRule = makeRule({ rule_type: 'lifecycle_classifier' })
        await dryRunReplay({ workspaceId: ws, candidateRules: [goodRule], daysBack: 7 })
        expect(mockRecordAuditLog).not.toHaveBeenCalled()
      })

      it('returns shape { total_inbound, decisions, summary }', async () => {
        const goodRule = makeRule({ rule_type: 'lifecycle_classifier' })
        const result = await dryRunReplay({ workspaceId: ws, candidateRules: [goodRule], daysBack: 7 })
        expect(result.total_inbound).toBe(2)
        expect(result.decisions.length).toBe(2)
        expect(result.summary).toHaveProperty('changed_count')
        expect(result.summary).toHaveProperty('before')
        expect(result.summary).toHaveProperty('after')
      })

      it('respects limit cap (default 500)', async () => {
        // Mock domain to return 1000 conversations
        const many = Array.from({ length: 1000 }, (_, i) => ({
          conversation_id: `c${i}`,
          contact_id: `ct${i}`,
          inbound_message_at: '2026-04-25T10:00:00-05:00',
        }))
        mockGetConversations.mockResolvedValue(many)
        const goodRule = makeRule()
        const result = await dryRunReplay({ workspaceId: ws, candidateRules: [goodRule], daysBack: 7, limit: 500 })
        // domain function should be called with limit=500
        expect(mockGetConversations).toHaveBeenCalledWith(ws, 7, 500)
      })

      it('changed_count=0 when candidate rules produce same agent_id as current', async () => {
        // Both production routeAgent and candidate engine return same somnio-recompra-v1 matched
        const goodRule = makeRule({ rule_type: 'agent_router', event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } } })
        const result = await dryRunReplay({ workspaceId: ws, candidateRules: [goodRule], daysBack: 7 })
        // candidate should produce same as current → no changes
        expect(result.summary.changed_count).toBeLessThanOrEqual(2)  // depends on mock specifics
      })
    })
    ```

    **Paso 3 — Crear `src/lib/agents/routing/dry-run.ts`** (GREEN):

    ```typescript
    /**
     * Dry-run replay simulator — D-10 mandatory v1 safety net.
     *
     * D-14 semantics: facts AS-OF-NOW (not as-of-event-time). Replays the inbound
     * conversations of the last N days using the contact's CURRENT state through
     * candidate rules. Reports a diff vs. production routing.
     *
     * D-10 safety: NEVER writes to routing_audit_log. Pure read + compute + return.
     *
     * Reuses buildEngine from Plan 03 (Pitfall 7 — new Engine per conversation).
     * Reuses validateRule from Plan 02 (Pitfall 5 — early validation of candidates).
     */

    import type { RoutingRule, RoutingReason } from '@/lib/domain/routing'
    import { getInboundConversationsLastNDays } from '@/lib/domain/messages'
    import { routeAgent, type RouteDecision } from './route'
    import { buildEngine } from './engine'
    import { validateRule } from './schema/validate'

    export interface DryRunInput {
      workspaceId: string
      candidateRules: RoutingRule[]
      daysBack?: number
      limit?: number
    }

    export interface DryRunDecisionSlim {
      agent_id: string | null
      reason: RoutingReason | 'matched' | 'human_handoff' | 'no_rule_matched' | 'fallback_legacy'
      lifecycle_state: string
    }

    export interface DryRunDecisionRow {
      conversation_id: string
      contact_id: string
      inbound_message_at: string
      current_decision: DryRunDecisionSlim | null
      candidate_decision: DryRunDecisionSlim
      changed: boolean
    }

    export interface DryRunResult {
      total_inbound: number
      decisions: DryRunDecisionRow[]
      summary: {
        changed_count: number
        before: Record<string, number>
        after: Record<string, number>
      }
    }

    function bucketKey(d: DryRunDecisionSlim | null): string {
      if (!d) return 'unknown'
      if (d.reason === 'matched' && d.agent_id) return d.agent_id
      return d.reason
    }

    export async function dryRunReplay(input: DryRunInput): Promise<DryRunResult> {
      const daysBack = input.daysBack ?? 7
      const limit = input.limit ?? 500

      // 1. Validate candidate rules BEFORE any DB work (Pitfall 5 + Pitfall 2)
      for (const rule of input.candidateRules) {
        const v = validateRule(rule)
        if (!v.ok) {
          throw new Error(`schema validation failed for candidate rule "${rule.name}": ${v.errors.join('; ')}`)
        }
      }

      // 2. Fetch unique conversations in window (deduped by conversation_id in domain layer)
      const conversations = await getInboundConversationsLastNDays(input.workspaceId, daysBack, limit)
      const total_inbound = conversations.length

      const splitCandidate = {
        classifierRules: input.candidateRules.filter(r => r.rule_type === 'lifecycle_classifier'),
        routerRules: input.candidateRules.filter(r => r.rule_type === 'agent_router'),
      }

      const decisions: DryRunDecisionRow[] = []
      const before: Record<string, number> = {}
      const after: Record<string, number> = {}
      let changed_count = 0

      for (const conv of conversations) {
        // Production decision
        let current: DryRunDecisionSlim | null = null
        try {
          const prod: RouteDecision = await routeAgent({
            contactId: conv.contact_id,
            workspaceId: input.workspaceId,
          })
          current = { agent_id: prod.agent_id, reason: prod.reason, lifecycle_state: prod.lifecycle_state }
        } catch {
          current = { agent_id: null, reason: 'fallback_legacy', lifecycle_state: 'unknown' }
        }

        // Candidate decision — fresh Engines, NEVER touch the production cache or audit log
        const candidate = await runCandidatePipeline({
          workspaceId: input.workspaceId,
          contactId: conv.contact_id,
          classifierRules: splitCandidate.classifierRules,
          routerRules: splitCandidate.routerRules,
        })

        const changed =
          current === null ||
          current.agent_id !== candidate.agent_id ||
          current.reason !== candidate.reason

        if (changed) changed_count++
        before[bucketKey(current)] = (before[bucketKey(current)] ?? 0) + 1
        after[bucketKey(candidate)] = (after[bucketKey(candidate)] ?? 0) + 1

        decisions.push({
          conversation_id: conv.conversation_id,
          contact_id: conv.contact_id,
          inbound_message_at: conv.inbound_message_at,
          current_decision: current,
          candidate_decision: candidate,
          changed,
        })
      }

      return { total_inbound, decisions, summary: { changed_count, before, after } }
    }

    async function runCandidatePipeline(input: {
      workspaceId: string
      contactId: string
      classifierRules: RoutingRule[]
      routerRules: RoutingRule[]
    }): Promise<DryRunDecisionSlim> {
      let lifecycleState = 'new_prospect'
      let agentId: string | null = null
      let reason: 'matched' | 'human_handoff' | 'no_rule_matched' | 'fallback_legacy' = 'no_rule_matched'

      try {
        // Layer 1: Classifier
        const e1 = buildEngine({
          contactId: input.contactId,
          workspaceId: input.workspaceId,
          rules: [],
        })
        for (const r of input.classifierRules) {
          e1.addRule({
            conditions: r.conditions as any,
            event: r.event as any,
            priority: r.priority,
            name: r.name,
            onSuccess: (event: any) => {
              if (event?.params?.lifecycle_state) lifecycleState = event.params.lifecycle_state
              e1.stop()
            },
          })
        }
        await e1.run({})

        // Layer 2: Router
        const e2 = buildEngine({
          contactId: input.contactId,
          workspaceId: input.workspaceId,
          rules: [],
          runtimeFacts: { lifecycle_state: lifecycleState },
        })
        let firedRouter = false
        for (const r of input.routerRules) {
          e2.addRule({
            conditions: r.conditions as any,
            event: r.event as any,
            priority: r.priority,
            name: r.name,
            onSuccess: (event: any) => {
              firedRouter = true
              if ('agent_id' in (event?.params ?? {})) agentId = event.params.agent_id
              e2.stop()
            },
          })
        }
        await e2.run({})

        if (firedRouter && agentId !== null) reason = 'matched'
        else if (firedRouter && agentId === null) reason = 'human_handoff'
        else reason = 'no_rule_matched'
      } catch (err) {
        console.warn('[routing.dry-run] candidate pipeline threw:', err)
        reason = 'fallback_legacy'
      }

      return { agent_id: agentId, reason: reason as any, lifecycle_state: lifecycleState }
    }
    ```

    **Paso 4 — Run tests + verificar safety**:
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/dry-run.test.ts
    # Verificar que dry-run.ts NO importa recordAuditLog:
    ! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts
    # Verificar que NO importa createAdminClient (Regla 3):
    ! grep -q "createAdminClient" src/lib/agents/routing/dry-run.ts
    ```

    **Paso 5 — Commit**:
    ```bash
    git add src/lib/agents/routing/dry-run.ts src/lib/agents/routing/__tests__/dry-run.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 05 — dry-run replay (D-10 + D-14 as-of-now) + 7 tests"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/routing/dry-run.ts</automated>
    <automated>grep -q "export async function dryRunReplay" src/lib/agents/routing/dry-run.ts</automated>
    <automated>grep -q "validateRule" src/lib/agents/routing/dry-run.ts</automated>
    <automated>grep -q "buildEngine" src/lib/agents/routing/dry-run.ts</automated>
    <automated>! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts</automated>
    <automated>! grep -q "createAdminClient" src/lib/agents/routing/dry-run.ts</automated>
    <automated>npx tsc --noEmit src/lib/agents/routing/dry-run.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/dry-run.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `dryRunReplay({ workspaceId, candidateRules, daysBack, limit? })` exportada.
    - Validacion candidate rules con `validateRule` ANTES de DB read (early throw).
    - NO escribe a audit log: grep `recordAuditLog` retorna VACIO.
    - NO toca Supabase directo: grep `createAdminClient` retorna VACIO en dry-run.ts.
    - Output shape exacta: `{ total_inbound, decisions[], summary: { changed_count, before, after } }`.
    - 7 tests pasan, incluyendo el test "NEVER writes to routing_audit_log".
  </acceptance_criteria>
  <done>
    - Dry-run listo para Plan 06 admin form (boton "Simular cambio") y Plan 07 parity validation.
  </done>
</task>

</tasks>

<verification>
- 1 archivo dry-run.ts + 1 archivo de test creados.
- 7 tests pasan.
- Safety verificada: dry-run NUNCA escribe (audit log + supabase direct).
- Pitfall 2 + 5 + 7 mitigations en codigo (validateRule early + per-conversation Engine + schema rejects path field).
</verification>

<success_criteria>
- Plan 06 admin form puede invocar `dryRunReplay` desde un Server Action al click "Simular cambio".
- Plan 07 puede invocar `dryRunReplay` con las Somnio parity rules contra ultimos 30 dias para verificar 100% match antes de flip flag.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/05-SUMMARY.md` documentando:
- API publica `dryRunReplay`.
- Output shape literal.
- Safety verifications (no audit log writes, no createAdminClient).
- Hooks para Plan 06 (Simular button) y Plan 07 (parity validation).
</output>
