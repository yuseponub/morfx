---
phase: agent-lifecycle-router
plan: 04
type: execute
wave: 3                                                  # B-4 wave shift: was 2, now 3 (Plan 03 moved to wave 2)
depends_on: [03]                                          # Plan 03 → Plan 04 (route.ts must exist); transitively gets 02 + 01
files_modified:
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/production/__tests__/webhook-processor-routing.test.ts
  - src/lib/agents/routing/integrate.ts                  # I-2 fix: Approach A — applyRouterDecision helper extracted for testability
  - src/lib/agents/routing/__tests__/integrate.test.ts   # I-2 fix: dedicated unit tests for helper
autonomous: true
requirements_addressed: [ROUTER-REQ-08, ROUTER-REQ-04, ROUTER-REQ-07]
user_setup: []

must_haves:
  truths:
    - "`webhook-processor.ts:174-188` ahora tiene branch: `if (config.lifecycle_routing_enabled) { decision = await routeAgent({ contactId, workspaceId, conversationId, inboundMessageId }); ...handle decision } else { /* legacy if/else INTACTO per D-15 */ }`."
    - "Cuando flag OFF (default per Regla 6), legacy if/else (lineas 174-188) corre INALTERADO — codigo legacy NO se mueve a archivo separado, NO se refactorea (D-15 Phase v1.1 fase posterior)."
    - "Cuando flag ON + reason='matched' → `agent_id` del router ruta al branch downstream (`webhook-processor.ts:443-511` sales-v3 vs godentist vs unified) sin modificar ese branch."
    - "Cuando flag ON + reason='human_handoff' → bot NO responde, log 'human handoff intentional' + `recordEvent('pipeline_decision', 'router_human_handoff', {...})`. Sale del processor con `return { success: true }`."
    - "Cuando flag ON + reason='no_rule_matched' → fallback al `workspace.conversational_agent_id` (preserva comportamiento legacy default — D-16). Log 'fallback used, please add a rule' + `recordEvent('pipeline_decision', 'router_fallback_default_agent', {...})`."
    - "Cuando flag ON + reason='fallback_legacy' (engine.run lanzo) → bypass router, ejecuta legacy if/else completo. Log warning. `recordEvent('pipeline_decision', 'router_failed_fallback_legacy', {...})`."
    - "Tests integration vitest: flag OFF preserva comportamiento legacy (snapshot del flow de webhook-processor con flag=false vs HEAD pre-Plan-04 son identicos), flag ON + matched routes correcto, flag ON + human_handoff returns success sin tocar branch downstream, flag ON + no_rule_matched cae a conversational_agent_id, flag ON + engine throws cae a legacy."
  artifacts:
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Integration point — gate al router behind lifecycle_routing_enabled flag, preserve legacy if/else inline (D-15)."
      contains: "lifecycle_routing_enabled"
    - path: "src/lib/agents/production/__tests__/webhook-processor-routing.test.ts"
      provides: "5 integration tests — flag OFF parity, flag ON 4 reasons paths."
  key_links:
    - from: "src/lib/agents/production/webhook-processor.ts:~174 (post-Plan-04)"
      to: "src/lib/agents/routing/route.ts (routeAgent)"
      via: "import + invocation gated by globalAgentConfig.lifecycle_routing_enabled"
      pattern: "import.*routeAgent.*from.*'@/lib/agents/routing/route'"
    - from: "router decision reason='matched'"
      to: "webhook-processor.ts:443-511 branch by agent_id (UNCHANGED)"
      via: "agent_id pasa a la variable usada por el branch existente"
      pattern: "decision.agent_id"
    - from: "router decision reason='no_rule_matched'"
      to: "globalAgentConfig.conversational_agent_id fallback"
      via: "set agent_id = config.conversational_agent_id"
      pattern: "conversational_agent_id"
---

<objective>
Wave 2 — Webhook integration. Reemplazar el if/else binario de `webhook-processor.ts:174-188` por una llamada al `routeAgent` GATED por feature flag `lifecycle_routing_enabled` (default false per Regla 6).

Purpose: (1) Habilitar el router en produccion sin afectar el comportamiento del agente Somnio actual hasta que se haga flip explicito (Regla 6). (2) Preservar el legacy if/else INLINE intacto (D-15 — el cleanup es Phase v1.1 posterior). (3) Manejar los 4 outputs del router (matched/human_handoff/no_rule_matched/fallback_legacy) preservando observability via `getCollector()?.recordEvent`. (4) Tests integration que prueben tanto la rama legacy como la rama router.

Output: `webhook-processor.ts` modificado quirurgicamente alrededor de las lineas 174-188, sin tocar lineas 443-511 (branch por agent_id). 1 test file integration con 5 tests.

**CRITICAL — Regla 6:** Default `lifecycle_routing_enabled=false`. El agente Somnio en prod sigue funcionando exactamente igual hasta que se flip explicito en Plan 07. Cualquier code path que cambie el comportamiento default es BLOCKER.

**CRITICAL — D-15:** El legacy if/else SE QUEDA INLINE en el `else { ... }` del flag. NO mover a `legacyRouter.ts`. NO refactorear. NO renombrar variables. Hacer ESCEM(eclipsa el menor cambio posible) — un wrap, no un rewrite. El cleanup esta scope-out a Phase v1.1.

**CRITICAL — Pitfall 4:** El router puede emitir `reason='fallback_legacy'` por engine errors. Cuando eso pase, el code path debe caer al MISMO legacy if/else (no a un comportamiento distinto). Garantiza que un router crash NO afecta el comportamiento productivo.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # D-15 (legacy inline preservation), D-16 (3 outputs + fallback)
@.planning/standalone/agent-lifecycle-router/RESEARCH.md  # §Architecture Patterns Pattern 1 lineas 220-313 + §Pitfalls 4 (engine.run try/catch fallback)
@CLAUDE.md  # Regla 6 (proteger agente prod) + Regla 3 (no createAdminClient en webhook-processor mas alla del existente)
@src/lib/agents/production/webhook-processor.ts  # archivo a modificar — lineas 174-188 son el integration point exacto
@src/lib/agents/production/agent-config.ts  # interface AgentConfig — agregar la nueva columna lifecycle_routing_enabled al tipo
@src/lib/agents/routing/route.ts  # creado en Plan 03 — funcion routeAgent
@src/lib/agents/registry.ts  # agentRegistry — el branch downstream (lineas 443-511) consulta esto

<interfaces>
<!-- Estado actual webhook-processor.ts:160-188 (verified pre-Plan-04) -->
const { data: contactData } = await supabase.from('contacts').select('is_client')...
const globalAgentConfig = await getWorkspaceAgentConfig(workspaceId)
const recompraEnabled = globalAgentConfig?.recompra_enabled ?? true

if (contactData?.is_client) {
  if (!recompraEnabled) {
    // Skip bot
    return { success: true }
  }
  // Route to recompra agent — long block lines 190-360 (typing indicator, runner, audit collector...)
}
// Else: continues to non-client v3 flow at line 360+

<!-- Cambio esperado post-Plan-04 — wrap del block legacy en condicional flag -->
const globalAgentConfig = await getWorkspaceAgentConfig(workspaceId)
const recompraEnabled = globalAgentConfig?.recompra_enabled ?? true
const routerEnabled = globalAgentConfig?.lifecycle_routing_enabled ?? false  // NEW

if (routerEnabled) {
  // NEW BRANCH (Plan 04):
  // Call router, handle 4 reasons, set agentId, jump to relevant downstream branch
  const decision = await routeAgent({ contactId, workspaceId, conversationId, inboundMessageId: input.messageId })
  if (decision.reason === 'fallback_legacy') {
    logger.warn({ ... }, 'router engine threw — fallback to legacy if/else')
    getCollector()?.recordEvent('pipeline_decision', 'router_failed_fallback_legacy', { ... })
    // FALL THROUGH to legacy if/else below — set a flag and jump
  } else if (decision.reason === 'human_handoff') {
    logger.info({ ... }, 'router emitted human handoff — bot stays silent')
    getCollector()?.recordEvent('pipeline_decision', 'router_human_handoff', { ... })
    return { success: true }
  } else if (decision.reason === 'no_rule_matched') {
    logger.info({ ... }, 'router no rule matched — using conversational_agent_id default')
    getCollector()?.recordEvent('pipeline_decision', 'router_fallback_default_agent', { ... })
    // Set agent_id to conversational_agent_id and continue to existing branch downstream
  } else if (decision.reason === 'matched') {
    logger.info({ ... }, `router matched — agent_id=${decision.agent_id}`)
    getCollector()?.recordEvent('pipeline_decision', 'router_matched', { ... })
    // Continue to existing branch downstream
  }
}

// Legacy if/else INTACTO (D-15) — corre cuando routerEnabled=false O cuando router emitio fallback_legacy
if (contactData?.is_client) {
  // ... unchanged
}

<!-- Critical: el branch downstream (lineas 443-511) consume agent_id var; respeta como esta. -->
<!-- D-15 dice: NO refactorear el legacy if/else. Solamente WRAP. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update interface AgentConfig + integrate.ts helper (I-2 Approach A) + integration point en webhook-processor.ts</name>
  <read_first>
    - src/lib/agents/production/agent-config.ts:17-28 (interface AgentConfig — agregar `lifecycle_routing_enabled: boolean`)
    - src/lib/agents/production/webhook-processor.ts:160-200 (LEER LITERAL los 40 lineas alrededor del integration point para entender el contexto: variables disponibles antes (workspaceId, contactId, conversationId, supabase, contactData, globalAgentConfig, recompraEnabled, logger, getCollector), y como retorna el bloque legacy)
    - src/lib/agents/production/webhook-processor.ts:440-520 (entender el branch downstream — confirmar que consume agent_id de globalAgentConfig.conversational_agent_id en el flujo non-client)
    - src/lib/agents/routing/route.ts (creado Plan 03 — confirmar shape exacto de RouteDecision)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §D-15 (legacy inline preservation)
  </read_first>
  <action>
    **Paso 1 — Agregar `lifecycle_routing_enabled: boolean` al interface AgentConfig** en `src/lib/agents/production/agent-config.ts:17-28`:

    ```typescript
    export interface AgentConfig {
      workspace_id: string
      agent_enabled: boolean
      recompra_enabled: boolean
      lifecycle_routing_enabled: boolean  // NEW Plan 04 — D-15 + Regla 6 default false
      conversational_agent_id: string
      crm_agents_enabled: Record<string, boolean>
      handoff_message: string
      timer_preset: 'real' | 'rapido' | 'instantaneo'
      response_speed: number
      created_at: string
      updated_at: string
    }
    ```

    Tambien agregar al `DEFAULT_AGENT_CONFIG`:
    ```typescript
    export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, 'workspace_id' | 'created_at' | 'updated_at'> = {
      agent_enabled: false,
      recompra_enabled: true,
      lifecycle_routing_enabled: false,  // NEW Plan 04 — Regla 6
      conversational_agent_id: 'somnio-sales-v1',
      // ...
    }
    ```

    **Paso 2 — Modificar `src/lib/agents/production/webhook-processor.ts`** alrededor de lineas 160-188.

    **NO TOCAR** el bloque entero entre lineas 174-360 (el branch del recompra agent — D-15 dice mantener INLINE). Solo se introduce un WRAP previo: si flag ON, intenta router; si decision dice "matched/human_handoff/no_rule_matched", despacha sin entrar al legacy. Si flag OFF o router lanzo, fall through al legacy intacto.

    Insertar ANTES del bloque legacy `if (contactData?.is_client) {`:

    ```typescript
    // ============================================================================
    // Plan 04: agent-lifecycle-router — feature flag-gated routing
    // ============================================================================
    // D-15 strict: legacy if/else (lines below) stays INLINE intact. This block
    // RUNs when lifecycle_routing_enabled=true; otherwise legacy executes as before.
    // Pitfall 4 mitigation: router engine errors fall through to legacy via
    // reason='fallback_legacy' — no behavior change vs flag OFF.
    //
    // import {} added at top of file:
    //   import { routeAgent } from '@/lib/agents/routing/route'

    const routerEnabled = globalAgentConfig?.lifecycle_routing_enabled ?? false
    let routerDecidedAgentId: string | null = null
    let routerHandledMessage = false

    if (routerEnabled && contactId) {
      try {
        const decision = await routeAgent({
          contactId,
          workspaceId,
          conversationId,
          inboundMessageId: input.messageId ?? null,
        })

        switch (decision.reason) {
          case 'matched': {
            logger.info(
              { conversationId, contactId, agentId: decision.agent_id, ruleFired: decision.fired_router_rule_id, lifecycleState: decision.lifecycle_state },
              `router matched — agent_id=${decision.agent_id}`,
            )
            getCollector()?.recordEvent('pipeline_decision', 'router_matched', {
              conversationId,
              contactId,
              agentId: decision.agent_id,
              firedRouterRuleId: decision.fired_router_rule_id,
              firedClassifierRuleId: decision.fired_classifier_rule_id,
              lifecycleState: decision.lifecycle_state,
              latencyMs: decision.latency_ms,
            })
            routerDecidedAgentId = decision.agent_id
            // Note: NO `return` here — flow continues to downstream branch (lines ~443-511)
            // which dispatches by agent_id. Use `routerDecidedAgentId` to override the legacy path.
            break
          }
          case 'human_handoff': {
            logger.info(
              { conversationId, contactId, ruleFired: decision.fired_router_rule_id },
              'router emitted human_handoff — bot stays silent',
            )
            getCollector()?.recordEvent('pipeline_decision', 'router_human_handoff', {
              conversationId,
              contactId,
              firedRouterRuleId: decision.fired_router_rule_id,
              lifecycleState: decision.lifecycle_state,
              latencyMs: decision.latency_ms,
            })
            return { success: true }  // intentional silence
          }
          case 'no_rule_matched': {
            const fallbackAgentId = globalAgentConfig?.conversational_agent_id ?? 'somnio-sales-v1'
            logger.info(
              { conversationId, contactId, fallbackAgentId, lifecycleState: decision.lifecycle_state },
              'router no_rule_matched — using conversational_agent_id default',
            )
            getCollector()?.recordEvent('pipeline_decision', 'router_fallback_default_agent', {
              conversationId,
              contactId,
              fallbackAgentId,
              lifecycleState: decision.lifecycle_state,
              latencyMs: decision.latency_ms,
            })
            routerDecidedAgentId = fallbackAgentId
            break
          }
          case 'fallback_legacy': {
            logger.warn(
              { conversationId, contactId },
              'router engine threw — falling through to legacy if/else (D-15 + Pitfall 4)',
            )
            getCollector()?.recordEvent('pipeline_decision', 'router_failed_fallback_legacy', {
              conversationId,
              contactId,
              latencyMs: decision.latency_ms,
            })
            // routerHandledMessage stays false — falls through to legacy block below
            break
          }
        }

        if (decision.reason === 'matched' || decision.reason === 'no_rule_matched') {
          routerHandledMessage = true
        }
      } catch (routerErr) {
        // Defense-in-depth — if routeAgent itself throws (shouldn't, but...) fall through to legacy
        logger.error(
          { err: routerErr instanceof Error ? routerErr.message : String(routerErr), conversationId, contactId },
          'routeAgent threw uncaught — falling through to legacy if/else',
        )
        getCollector()?.recordEvent('pipeline_decision', 'router_threw_fallback_legacy', {
          conversationId,
          contactId,
        })
      }
    }

    // ============================================================================
    // LEGACY if/else (D-15: stays inline intact — cleanup is Phase v1.1)
    // Runs when:
    //   - lifecycle_routing_enabled === false (default per Regla 6)
    //   - router emitted reason='fallback_legacy' (engine error)
    //   - routeAgent threw uncaught (defense-in-depth)
    // ============================================================================
    if (!routerHandledMessage) {
      // ↓↓↓ EXISTING CODE BLOCK 174-360 STAYS UNCHANGED ↓↓↓
      if (contactData?.is_client) {
        // ... existing recompra branch unchanged ...
      }
      // ... existing non-client v3 branch unchanged ...
    } else if (routerDecidedAgentId) {
      // Router decided — replace the agent_id used by the downstream branch (lines 443-511)
      // by setting a local variable that the downstream branch reads.
      //
      // Implementation: the downstream branch currently reads `globalAgentConfig.conversational_agent_id`.
      // To inject the router's choice MINIMALLY (D-15 — no rewrite), we shadow it locally:
      //   const effectiveAgentId = routerDecidedAgentId ?? globalAgentConfig.conversational_agent_id
      // Then the downstream branch uses `effectiveAgentId` instead of `globalAgentConfig.conversational_agent_id`.
      //
      // The exact code transform:
      //   - In the existing non-client branch (line ~360+) where the V3ProductionRunner is constructed,
      //     replace `agentId: 'somnio-sales-v3'` (or wherever it reads conversational_agent_id) with
      //     `agentId: routerDecidedAgentId ?? globalAgentConfig.conversational_agent_id ?? 'somnio-sales-v1'`.
      //   - Same for the recompra branch if router decided 'somnio-recompra-v1' explicitly.
      //
      // Executor: locate the V3ProductionRunner construction site(s) below this block (lines ~360+),
      // and inject `routerDecidedAgentId ??` as the FIRST option in the chain. Do NOT remove existing fallbacks.
    }
    ```

    **Paso 3 — Locate V3ProductionRunner construction sites + inject `routerDecidedAgentId`**:

    Search for `agentId: 'somnio-sales-v3'`, `agentId: 'somnio-recompra-v1'`, `agentModule: '` in lines 360+ of webhook-processor.ts. For each site, replace the literal string with:
    ```typescript
    agentId: routerDecidedAgentId ?? '<existing-literal>',
    ```

    Example transform:
    ```typescript
    // BEFORE (line ~430):
    const adapters = createProductionAdapters({
      // ...
      agentId: 'somnio-sales-v3',
      // ...
    })

    // AFTER:
    const adapters = createProductionAdapters({
      // ...
      agentId: routerDecidedAgentId ?? 'somnio-sales-v3',
      // ...
    })
    ```

    Same para la recompra branch (`agentId: 'somnio-recompra-v1'` line ~230 — solo si esta dentro del else `!routerHandledMessage`, sino si `routerDecidedAgentId === 'somnio-recompra-v1'` el flow ya entra aqui).

    **Paso 3.5 (I-2 fix — Approach A) — Crear `src/lib/agents/routing/integrate.ts`** que extrae el switch a un helper testeable:

    ```typescript
    /**
     * Bridge entre webhook-processor y router engine (Plan 04 — I-2 fix Approach A).
     *
     * Encapsula el switch sobre los 4 reasons del router para:
     *   1) reducir el blast radius del cambio en webhook-processor.ts (D-15 — minimo cambio).
     *   2) hacer testeable la logica de decision en aislamiento (sin mockear los ~10
     *      modulos que importa webhook-processor).
     *
     * webhook-processor.ts:174-188 invoca esta funcion CUANDO `lifecycle_routing_enabled === true`.
     * Cuando reason === 'fallback_legacy' o el call mismo lanza, el caller debe correr el legacy.
     */

    import type { RouteDecision } from './route'
    import type { RoutingReason } from '@/lib/domain/routing'

    export type RouterDispositionKind =
      | 'use-agent'           // matched o no_rule_matched (con fallback agent_id)
      | 'silence'             // human_handoff — webhook returns success, no runner
      | 'fallback-to-legacy'  // engine threw o reason='fallback_legacy'

    export interface RouterDisposition {
      kind: RouterDispositionKind
      agentId: string | null               // populated when kind='use-agent'
      reason: RoutingReason | 'router_threw'
      lifecycleState: string | null
      collectorEvent: {
        name: 'router_matched' | 'router_human_handoff' | 'router_fallback_default_agent' | 'router_failed_fallback_legacy' | 'router_threw_fallback_legacy'
        firedRouterRuleId: string | null
        firedClassifierRuleId: string | null
        latencyMs: number
      }
    }

    /**
     * Maps a RouteDecision to a RouterDisposition that webhook-processor consumes
     * to decide: continue downstream with which agent_id, return silence, or run legacy.
     */
    export function applyRouterDecision(
      decision: RouteDecision,
      conversationalAgentIdFallback: string,
    ): RouterDisposition {
      const baseEvent = {
        firedRouterRuleId: decision.fired_router_rule_id,
        firedClassifierRuleId: decision.fired_classifier_rule_id,
        latencyMs: decision.latency_ms,
      }
      switch (decision.reason) {
        case 'matched':
          return {
            kind: 'use-agent',
            agentId: decision.agent_id,
            reason: 'matched',
            lifecycleState: decision.lifecycle_state,
            collectorEvent: { ...baseEvent, name: 'router_matched' },
          }
        case 'human_handoff':
          return {
            kind: 'silence',
            agentId: null,
            reason: 'human_handoff',
            lifecycleState: decision.lifecycle_state,
            collectorEvent: { ...baseEvent, name: 'router_human_handoff' },
          }
        case 'no_rule_matched':
          return {
            kind: 'use-agent',
            agentId: conversationalAgentIdFallback,
            reason: 'no_rule_matched',
            lifecycleState: decision.lifecycle_state,
            collectorEvent: { ...baseEvent, name: 'router_fallback_default_agent' },
          }
        case 'fallback_legacy':
        default:
          return {
            kind: 'fallback-to-legacy',
            agentId: null,
            reason: 'fallback_legacy',
            lifecycleState: decision.lifecycle_state,
            collectorEvent: { ...baseEvent, name: 'router_failed_fallback_legacy' },
          }
      }
    }

    /**
     * Disposition for the case where routeAgent itself throws (defense-in-depth — should not happen).
     */
    export function dispositionForRouterThrow(): RouterDisposition {
      return {
        kind: 'fallback-to-legacy',
        agentId: null,
        reason: 'router_threw',
        lifecycleState: null,
        collectorEvent: {
          firedClassifierRuleId: null,
          firedRouterRuleId: null,
          latencyMs: 0,
          name: 'router_threw_fallback_legacy',
        },
      }
    }
    ```

    Note: el switch en webhook-processor.ts (Pasos 2 y 3) ya NO contiene la logica de mapeo: invoca `applyRouterDecision(decision, globalAgentConfig?.conversational_agent_id ?? 'somnio-sales-v1')` y consume `disposition.kind` para decidir.

    **Paso 4 — Add import al top del file**:
    ```typescript
    import { routeAgent } from '@/lib/agents/routing/route'
    import { applyRouterDecision, dispositionForRouterThrow } from '@/lib/agents/routing/integrate'  // I-2 fix
    ```

    **Paso 5 — Verificar tsc**:
    ```bash
    npx tsc --noEmit src/lib/agents/production/webhook-processor.ts src/lib/agents/production/agent-config.ts
    ```

    **Paso 6 — Verificar Regla 6 (default OFF)**:
    ```bash
    grep -q "lifecycle_routing_enabled: false" src/lib/agents/production/agent-config.ts
    grep -q "lifecycle_routing_enabled.*\?\?.*false" src/lib/agents/production/webhook-processor.ts
    ```

    **Paso 7 — Commit atomico**:
    ```bash
    git add src/lib/agents/production/agent-config.ts src/lib/agents/production/webhook-processor.ts \
            src/lib/agents/routing/integrate.ts
    git commit -m "feat(agent-lifecycle-router): Plan 04 Task 1 — webhook-processor router gate (flag default false, legacy inline per D-15) + integrate.ts helper (I-2)"
    ```
  </action>
  <verify>
    <automated>grep -q "lifecycle_routing_enabled: boolean" src/lib/agents/production/agent-config.ts</automated>
    <automated>grep -q "lifecycle_routing_enabled: false" src/lib/agents/production/agent-config.ts</automated>
    <automated>grep -q "import { routeAgent }" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "import.*applyRouterDecision\|import.*dispositionForRouterThrow" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>test -f src/lib/agents/routing/integrate.ts</automated>
    <automated>grep -q "export function applyRouterDecision" src/lib/agents/routing/integrate.ts</automated>
    <automated>grep -q "export function dispositionForRouterThrow\|export.*dispositionForRouterThrow" src/lib/agents/routing/integrate.ts</automated>
    <automated>grep -q "lifecycle_routing_enabled" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "router_matched" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "router_human_handoff" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "router_fallback_default_agent" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "router_failed_fallback_legacy" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "routerDecidedAgentId" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "routerHandledMessage" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - Interface `AgentConfig` tiene `lifecycle_routing_enabled: boolean`. Default false en `DEFAULT_AGENT_CONFIG`.
    - `webhook-processor.ts` importa `routeAgent` desde `@/lib/agents/routing/route`.
    - El gate `if (routerEnabled && contactId) { ... }` ANTES del legacy `if (contactData?.is_client) { ... }`.
    - El legacy if/else COMPLETO (lineas 174-360 del codigo original) sigue presente en el archivo, INTACTO. Verificable: `git diff` muestra ADDS antes del bloque pero NO modificaciones del bloque legacy.
    - Los 4 case del switch (`matched`, `human_handoff`, `no_rule_matched`, `fallback_legacy`) presentes literalmente.
    - Cada case emite `recordEvent` con la naming exacta: `router_matched`, `router_human_handoff`, `router_fallback_default_agent`, `router_failed_fallback_legacy`.
    - Construction sites de V3ProductionRunner inyectan `routerDecidedAgentId ?? '<existing-literal>'`.
    - `tsc --noEmit` exit 0.
    - Commit atomico con mensaje exacto.
  </acceptance_criteria>
  <done>
    - Webhook-processor gateado por flag, default OFF (Regla 6), legacy inline intacto (D-15).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Integration tests (5 tests cubriendo flag OFF + 4 reasons)</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts (post-Task-1 — confirmar nombre exacto de la funcion exportada que recibe el input del webhook)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Validation Architecture lineas 970-1015 (Phase Requirements → Test Map)
  </read_first>
  <behavior>
    - Test 1 (PARITY flag OFF): mock `getWorkspaceAgentConfig` returns `{ lifecycle_routing_enabled: false, recompra_enabled: true, conversational_agent_id: 'somnio-sales-v3' }`. Mock `contactData.is_client = true`. Verify routeAgent NUNCA se invoca, recompra branch ejecuta legacy.
    - Test 2 (matched): flag ON, routeAgent retorna `{ agent_id: 'somnio-recompra-v1', reason: 'matched', ... }`. Verify routerDecidedAgentId = 'somnio-recompra-v1', routerHandledMessage = true, downstream V3ProductionRunner construido con agentId = 'somnio-recompra-v1'.
    - Test 3 (human_handoff): flag ON, routeAgent retorna `{ agent_id: null, reason: 'human_handoff', ... }`. Verify webhook-processor returns `{ success: true }` SIN invocar V3ProductionRunner. Collector recibe `router_human_handoff` event.
    - Test 4 (no_rule_matched): flag ON, routeAgent retorna `{ agent_id: null, reason: 'no_rule_matched', ... }`. Verify routerDecidedAgentId = globalAgentConfig.conversational_agent_id, routerHandledMessage = true.
    - Test 5 (fallback_legacy): flag ON, routeAgent retorna `{ reason: 'fallback_legacy', ... }`. Verify routerHandledMessage = false, legacy if/else ejecuta normalmente, collector recibe `router_failed_fallback_legacy`.
  </behavior>
  <action>
    **Paso 1 — Crear `src/lib/agents/production/__tests__/webhook-processor-routing.test.ts`** con vi.mock para los modulos pesados:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Mocks
    const mockRouteAgent = vi.fn()
    vi.mock('@/lib/agents/routing/route', () => ({
      routeAgent: (input: any) => mockRouteAgent(input),
    }))

    const mockGetCollector = vi.fn()
    vi.mock('@/lib/agents/observability/collector', () => ({
      getCollector: () => mockGetCollector(),
    }))

    const mockGetWorkspaceAgentConfig = vi.fn()
    vi.mock('@/lib/agents/production/agent-config', async () => {
      const actual = await vi.importActual<typeof import('@/lib/agents/production/agent-config')>(
        '@/lib/agents/production/agent-config',
      )
      return {
        ...actual,
        getWorkspaceAgentConfig: (workspaceId: string) => mockGetWorkspaceAgentConfig(workspaceId),
      }
    })

    // V3ProductionRunner mock — capture agentId pasado a createProductionAdapters
    const mockCreateProductionAdapters = vi.fn(() => ({}))
    vi.mock('@/lib/agents/engine-adapters/production', () => ({
      createProductionAdapters: (opts: any) => mockCreateProductionAdapters(opts),
    }))

    const mockRunnerProcessMessage = vi.fn().mockResolvedValue({ success: true, sessionId: 's1', messagesSent: 1 })
    vi.mock('@/lib/agents/engine/v3-production-runner', () => ({
      V3ProductionRunner: vi.fn().mockImplementation(() => ({ processMessage: mockRunnerProcessMessage })),
    }))

    // ... (mocks adicionales para supabase, somnio-recompra dynamic import, etc. — minimum viable)

    import { processIncomingMessage } from '@/lib/agents/production/webhook-processor'  // o el name exacto del export

    describe('webhook-processor — Plan 04 routing integration', () => {
      let collectorEvents: any[]

      beforeEach(() => {
        vi.clearAllMocks()
        collectorEvents = []
        mockGetCollector.mockReturnValue({
          recordEvent: (kind: string, name: string, data: any) => {
            collectorEvents.push({ kind, name, data })
          },
          setRespondingAgentId: vi.fn(),
        })
      })

      const baseInput = {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        phone: '+573001234567',
        messageContent: 'hola',
        messageId: 'msg-1',
        messageTimestamp: '2026-04-25T10:00:00-05:00',
      }

      it('flag OFF → routeAgent NEVER called, legacy executes (parity)', async () => {
        mockGetWorkspaceAgentConfig.mockResolvedValue({
          workspace_id: baseInput.workspaceId,
          agent_enabled: true,
          recompra_enabled: true,
          lifecycle_routing_enabled: false,  // FLAG OFF
          conversational_agent_id: 'somnio-sales-v3',
        })
        // Mock contact lookup, supabase, etc. — set is_client false → goes to v3 branch

        await processIncomingMessage(baseInput as any)

        expect(mockRouteAgent).not.toHaveBeenCalled()
        // Verify the legacy branch was used (createProductionAdapters called with literal agentId, not routed)
      })

      it('flag ON + reason=matched → routerDecidedAgentId injected into runner', async () => {
        mockGetWorkspaceAgentConfig.mockResolvedValue({
          workspace_id: baseInput.workspaceId,
          agent_enabled: true,
          recompra_enabled: true,
          lifecycle_routing_enabled: true,
          conversational_agent_id: 'somnio-sales-v3',
        })
        mockRouteAgent.mockResolvedValue({
          agent_id: 'somnio-recompra-v1',
          reason: 'matched',
          lifecycle_state: 'in_transit',
          fired_classifier_rule_id: 'cls-1',
          fired_router_rule_id: 'rt-1',
          latency_ms: 5,
          facts_snapshot: {},
        })

        await processIncomingMessage(baseInput as any)

        expect(mockRouteAgent).toHaveBeenCalledOnce()
        const matchedEvent = collectorEvents.find(e => e.name === 'router_matched')
        expect(matchedEvent).toBeDefined()
        // Downstream runner should receive routed agent_id
        expect(mockCreateProductionAdapters).toHaveBeenCalledWith(
          expect.objectContaining({ agentId: 'somnio-recompra-v1' }),
        )
      })

      it('flag ON + reason=human_handoff → returns success without runner', async () => {
        mockGetWorkspaceAgentConfig.mockResolvedValue({
          lifecycle_routing_enabled: true,
          conversational_agent_id: 'somnio-sales-v3',
          agent_enabled: true,
          recompra_enabled: true,
          workspace_id: baseInput.workspaceId,
        })
        mockRouteAgent.mockResolvedValue({
          agent_id: null,
          reason: 'human_handoff',
          lifecycle_state: 'blocked',
          fired_classifier_rule_id: null,
          fired_router_rule_id: 'rt-handoff',
          latency_ms: 3,
          facts_snapshot: {},
        })

        const result = await processIncomingMessage(baseInput as any)

        expect(result).toEqual({ success: true })
        expect(mockCreateProductionAdapters).not.toHaveBeenCalled()
        const handoffEvent = collectorEvents.find(e => e.name === 'router_human_handoff')
        expect(handoffEvent).toBeDefined()
      })

      it('flag ON + reason=no_rule_matched → falls back to conversational_agent_id', async () => {
        mockGetWorkspaceAgentConfig.mockResolvedValue({
          lifecycle_routing_enabled: true,
          conversational_agent_id: 'somnio-sales-v3',
          agent_enabled: true,
          recompra_enabled: true,
          workspace_id: baseInput.workspaceId,
        })
        mockRouteAgent.mockResolvedValue({
          agent_id: null,
          reason: 'no_rule_matched',
          lifecycle_state: 'new_prospect',
          fired_classifier_rule_id: null,
          fired_router_rule_id: null,
          latency_ms: 2,
          facts_snapshot: {},
        })

        await processIncomingMessage(baseInput as any)

        expect(mockCreateProductionAdapters).toHaveBeenCalledWith(
          expect.objectContaining({ agentId: 'somnio-sales-v3' }),
        )
        const fallbackEvent = collectorEvents.find(e => e.name === 'router_fallback_default_agent')
        expect(fallbackEvent).toBeDefined()
      })

      it('flag ON + reason=fallback_legacy → legacy if/else executes', async () => {
        mockGetWorkspaceAgentConfig.mockResolvedValue({
          lifecycle_routing_enabled: true,
          conversational_agent_id: 'somnio-sales-v3',
          agent_enabled: true,
          recompra_enabled: true,
          workspace_id: baseInput.workspaceId,
        })
        mockRouteAgent.mockResolvedValue({
          agent_id: null,
          reason: 'fallback_legacy',
          lifecycle_state: 'new_prospect',
          fired_classifier_rule_id: null,
          fired_router_rule_id: null,
          latency_ms: 8,
          facts_snapshot: {},
        })

        await processIncomingMessage(baseInput as any)

        // Legacy executed → createProductionAdapters called with literal (no routing override)
        const legacyEvent = collectorEvents.find(e => e.name === 'router_failed_fallback_legacy')
        expect(legacyEvent).toBeDefined()
        // Verify NO router_matched event (we're in legacy path)
        expect(collectorEvents.find(e => e.name === 'router_matched')).toBeUndefined()
      })
    })
    ```

    NOTE: el test puede requerir mocks adicionales para `supabase` admin client + `somnio-recompra` dynamic import. El executor ajusta los mocks segun los `await import()` que el processor hace dentro de los branches. El acceptance es que los 5 tests pasen (asumir mocks completos).

    **Paso 2 — Run tests**:
    ```bash
    npx vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts
    ```

    **I-2 fix — Approach A committed:** Plan 04 USA Approach A obligatoriamente. El helper `applyRouterDecision` ya esta extraido en `src/lib/agents/routing/integrate.ts` (Task 1). Aqui escribimos:
    1. Tests unitarios al helper en `src/lib/agents/routing/__tests__/integrate.test.ts` (los 5 reasons: matched, human_handoff, no_rule_matched, fallback_legacy, threw → fallback_legacy).
    2. Smoke test minimo en `webhook-processor-routing.test.ts` que confirma:
       - Flag OFF → routeAgent NUNCA invocado, helper NUNCA invocado, comportamiento legacy intacto.
       - Flag ON + matched → helper invocado y retorna routerDecidedAgentId que webhook-processor inyecta a V3ProductionRunner.

    Esto evita la complejidad de mockear ~10 modulos del webhook-processor (somnio-recompra dynamic import, supabase, getCollector, etc.). El helper unit-tested cubre la logica del switch, el smoke test cubre la integracion.

    **Paso 3 — Commit**:
    ```bash
    git add src/lib/agents/production/__tests__/webhook-processor-routing.test.ts \
            src/lib/agents/routing/__tests__/integrate.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 04 Task 2 — integrate.ts unit tests (5 reasons) + webhook-processor smoke test (flag OFF parity, flag ON matched)"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/production/__tests__/webhook-processor-routing.test.ts</automated>
    <automated>npx vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 5 tests definidos cubriendo: flag OFF (parity), matched, human_handoff, no_rule_matched, fallback_legacy.
    - Test "flag OFF" verifica que `routeAgent` NUNCA es invocado.
    - Test "matched" verifica que `createProductionAdapters` recibio agentId del router.
    - Test "human_handoff" verifica que el resultado es `{ success: true }` sin invocar runner.
    - Test "no_rule_matched" verifica que createProductionAdapters recibio `conversational_agent_id` del config.
    - Test "fallback_legacy" verifica que el legacy if/else ejecuta + emite collector event correcto.
    - Todos los 5 tests pasan.
    - **I-2 fix:** archivo `src/lib/agents/routing/integrate.ts` existe (creado en Task 1) y export `applyRouterDecision`. `integrate.test.ts` cubre los 5 reasons en aislamiento.
  </acceptance_criteria>
  <done>
    - Integration tests confirman que flag OFF preserva comportamiento legacy 100% + flag ON cubre los 4 reasons.
  </done>
</task>

</tasks>

<verification>
- Webhook-processor.ts modificado quirurgicamente: bloque legacy 174-360 INTACTO, gate WRAP previo + variable injection en construction sites.
- Default `lifecycle_routing_enabled=false` (Regla 6).
- 4 reasons del router manejados con events distintos en collector.
- 5 integration tests pasan.
</verification>

<success_criteria>
- Plan 07 puede activar el router en Somnio simplemente flippeando `lifecycle_routing_enabled=true` para ese workspace, sin tocar codigo.
- El agente productivo Somnio sigue funcionando exactamente igual con flag OFF.
- Pitfall 4 (engine error) cae graciosamente al legacy.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/04-SUMMARY.md` documentando:
- Cambios exactos en webhook-processor.ts (line ranges + diff summary).
- 5 tests integration pasando.
- Confirmacion D-15 + Regla 6 (legacy inline intacto, default OFF).
- Hooks para Plan 07 (cómo flip el flag para Somnio).
</output>
