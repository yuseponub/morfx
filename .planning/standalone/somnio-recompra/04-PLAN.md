---
phase: somnio-recompra
plan: 04
type: execute
wave: 4
depends_on: ["somnio-recompra-03"]
files_modified:
  - src/lib/agents/engine/types.ts
  - src/lib/agents/engine/v3-production-runner.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/inngest/functions/agent-timers-v3.ts
  - src/app/api/sandbox/process/route.ts
autonomous: true

must_haves:
  truths:
    - "is_client contacts route to recompra agent instead of being skipped"
    - "V3ProductionRunner routes to somnio-recompra processMessage when agentModule is 'somnio-recompra'"
    - "Timer function routes to recompra processMessage based on session state agent_module"
    - "Sandbox can test recompra agent via somnio-recompra-v1 agentId"
    - "Data from last delivered order is preloaded into session state on first message"
    - "v3 agent behavior is UNCHANGED for non-client contacts"
  artifacts:
    - path: "src/lib/agents/engine/types.ts"
      provides: "agentModule union type includes 'somnio-recompra'"
      contains: "'somnio-recompra'"
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "Recompra branch in processMessage routing"
      contains: "somnio-recompra"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "is_client routing to recompra instead of skip"
      contains: "somnio-recompra"
    - path: "src/inngest/functions/agent-timers-v3.ts"
      provides: "Timer routing for recompra sessions"
      contains: "somnio-recompra"
    - path: "src/app/api/sandbox/process/route.ts"
      provides: "Sandbox dispatch for recompra-v1"
      contains: "somnio-recompra-v1"
  key_links:
    - from: "webhook-processor.ts"
      to: "v3-production-runner.ts"
      via: "creates V3ProductionRunner with agentModule='somnio-recompra'"
      pattern: "agentModule.*somnio-recompra"
    - from: "v3-production-runner.ts"
      to: "somnio-recompra/somnio-recompra-agent.ts"
      via: "dynamic import for processMessage"
      pattern: "import.*somnio-recompra.*somnio-recompra-agent"
    - from: "agent-timers-v3.ts"
      to: "somnio-recompra/somnio-recompra-agent.ts"
      via: "dynamic import for timer-triggered processMessage"
      pattern: "import.*somnio-recompra"
    - from: "webhook-processor.ts"
      to: "orders table"
      via: "loadLastOrderData query for data preloading"
      pattern: "shipping_name.*shipping_address"
---

<objective>
Integrate the somnio-recompra agent into the production and sandbox systems: webhook routing, production runner, timer routing, sandbox dispatch, and data preloading.

Purpose: The agent module is complete but isolated. This plan wires it into the 5 integration points: webhook-processor.ts (contact routing), v3-production-runner.ts (processMessage dispatch), agent-timers-v3.ts (timer routing), sandbox process route (testing), and engine/types.ts (type safety). Also implements data preloading from last delivered order.

Output: Recompra agent fully operational in both production and sandbox environments.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra/CONTEXT.md
@.planning/standalone/somnio-recompra/RESEARCH.md
@.planning/standalone/somnio-recompra/03-SUMMARY.md

# Files to modify (READ these FIRST):
@src/lib/agents/engine/types.ts
@src/lib/agents/engine/v3-production-runner.ts
@src/lib/agents/production/webhook-processor.ts
@src/inngest/functions/agent-timers-v3.ts
@src/app/api/sandbox/process/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Webhook Routing + Production Runner + Engine Types</name>
  <files>
    src/lib/agents/engine/types.ts
    src/lib/agents/engine/v3-production-runner.ts
    src/lib/agents/production/webhook-processor.ts
  </files>
  <action>
    **engine/types.ts** — Add 'somnio-recompra' to the agentModule union in EngineConfig:
    ```typescript
    agentModule?: 'somnio-v3' | 'godentist' | 'somnio-recompra'
    ```
    This is the ONLY change to this file.

    **v3-production-runner.ts** — Add recompra branch in the processMessage routing (around line 118-127):
    ```typescript
    // 4. Call processMessage — route by agentModule
    let output: V3AgentOutput
    if (this.config.agentModule === 'godentist') {
      const { processMessage } = await import('../godentist/godentist-agent')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    } else if (this.config.agentModule === 'somnio-recompra') {
      const { processMessage } = await import('../somnio-recompra/somnio-recompra-agent')
      output = await processMessage(v3Input) as unknown as V3AgentOutput
    } else {
      const { processMessage } = await import('../somnio-v3/somnio-v3-agent')
      output = await processMessage(v3Input)
    }
    ```
    ALSO: When agentModule is 'somnio-recompra', store `_v3:agent_module` = 'somnio-recompra' in session state on first session creation (via storage.saveState). This is needed for timer routing in Plan 04 Task 2. Check if session is new (version === 0 or state is empty) and if so, save the agent_module metadata.

    **webhook-processor.ts** — Replace the is_client skip logic (around line 157-167):

    BEFORE:
    ```typescript
    if (contactData?.is_client) {
      logger.info({ conversationId, contactId }, 'Contact is a client, skipping agent')
      return { success: true }
    }
    ```

    AFTER:
    ```typescript
    if (contactData?.is_client) {
      // Route to recompra agent — client contacts get personalized recompra flow
      // Tags already filtered at step 1b (WPP, P/W, RECO etc.), so arriving here = safe to process
      logger.info({ conversationId, contactId }, 'Contact is a client, routing to recompra agent')

      // Load last order data for preloading
      const lastOrderData = await loadLastOrderData(contactId, workspaceId)

      await import('../somnio-recompra')
      const { V3ProductionRunner } = await import('../engine/v3-production-runner')
      const { createProductionAdapters } = await import('../engine-adapters/production')

      const agentConfig = await getWorkspaceAgentConfig(workspaceId)
      const adapters = createProductionAdapters({
        workspaceId,
        conversationId,
        phoneNumber: phone,
        responseSpeed: agentConfig?.response_speed,
        agentId: 'somnio-recompra-v1',
        contactId: contactId!,
      })

      const runner = new V3ProductionRunner(adapters, {
        workspaceId,
        agentModule: 'somnio-recompra',
      })

      const engineOutput = await runner.processMessage({
        sessionId: '',
        conversationId,
        contactId: contactId!,
        message: messageContent,
        workspaceId,
        history: [],
        phoneNumber: phone,
        messageTimestamp: input.messageTimestamp,
      })

      // ... same post-processing as v3 path (typing stop, mark sent_by_agent, return result)
      // Copy the exact post-processing block from the existing v3 path below
    }
    ```

    Add `loadLastOrderData` function at the bottom of webhook-processor.ts (or in a separate helper, but keeping it in the same file is simpler):
    ```typescript
    async function loadLastOrderData(contactId: string, workspaceId: string): Promise<Record<string, string>> {
      const supabase = createAdminClient()
      const { data: order } = await supabase
        .from('orders')
        .select('shipping_name, shipping_last_name, shipping_phone, shipping_address, shipping_city, shipping_department')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!order) return {}
      const result: Record<string, string> = {}
      if (order.shipping_name) result.nombre = order.shipping_name
      if (order.shipping_last_name) result.apellido = order.shipping_last_name
      if (order.shipping_phone) result.telefono = order.shipping_phone
      if (order.shipping_address) result.direccion = order.shipping_address
      if (order.shipping_city) result.ciudad = order.shipping_city
      if (order.shipping_department) result.departamento = order.shipping_department
      return result
    }
    ```

    CRITICAL: The preloaded data must be saved into the session state BEFORE the first processMessage call. The V3ProductionRunner.getOrCreateSession flow handles this — when a new session is created for a recompra contact, the preloaded datos must be written to session_state as datos_capturados. This means the V3ProductionRunner needs to accept preloaded data. Add `preloadedData?: Record<string, string>` to EngineConfig, and in V3ProductionRunner, after getOrCreateSession for a new session, call `storage.saveState(session.id, { datos_capturados: preloadedData })`.

    IMPORTANT: The existing v3 path (agentId === 'somnio-sales-v3') must remain COMPLETELY UNCHANGED. The recompra block is a separate `if` that runs BEFORE the agentId resolution (since recompra is contact-level, not workspace-level). After the recompra block returns, it should `return` to skip the normal agent path.
  </action>
  <verify>
    `npx tsc --noEmit src/lib/agents/engine/types.ts src/lib/agents/engine/v3-production-runner.ts src/lib/agents/production/webhook-processor.ts` compiles cleanly.
    Verify webhook-processor.ts no longer returns `{ success: true }` for is_client contacts (now routes to recompra).
    Verify v3-production-runner.ts has 3 branches: godentist, somnio-recompra, somnio-v3 (default).
    Verify the existing v3 agent path is UNCHANGED (diff shows only additions, no modifications to v3 logic).
  </verify>
  <done>
    is_client contacts route to recompra agent with preloaded data. V3ProductionRunner dispatches to recompra processMessage. Engine types include 'somnio-recompra'. V3 agent path completely unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Timer Routing + Sandbox Dispatch</name>
  <files>
    src/inngest/functions/agent-timers-v3.ts
    src/app/api/sandbox/process/route.ts
  </files>
  <action>
    **agent-timers-v3.ts** — Modify the agent routing logic (around line 207):

    BEFORE:
    ```typescript
    const agentModule = agentConfig?.conversational_agent_id === 'godentist' ? 'godentist' : 'somnio-v3'
    ```

    AFTER:
    ```typescript
    // Determine agent module: check session state first (contact-level routing for recompra),
    // then fall back to workspace-level config (godentist vs somnio-v3)
    let agentModule: 'somnio-v3' | 'godentist' | 'somnio-recompra' = 'somnio-v3'
    const sessionAgentModule = session.state?.['_v3:agent_module'] as string | undefined
    if (sessionAgentModule === 'somnio-recompra') {
      agentModule = 'somnio-recompra'
    } else if (agentConfig?.conversational_agent_id === 'godentist') {
      agentModule = 'godentist'
    }
    ```

    Then add the recompra branch in the processMessage dispatch (around line 210-216):
    ```typescript
    let output: V3AgentOutput
    if (agentModule === 'godentist') {
      const { processMessage } = await import('@/lib/agents/godentist/godentist-agent')
      output = await processMessage(v3Input as any) as unknown as V3AgentOutput
    } else if (agentModule === 'somnio-recompra') {
      const { processMessage } = await import('@/lib/agents/somnio-recompra/somnio-recompra-agent')
      output = await processMessage(v3Input) as unknown as V3AgentOutput
    } else {
      const { processMessage } = await import('@/lib/agents/somnio-v3/somnio-v3-agent')
      output = await processMessage(v3Input)
    }
    ```

    IMPORTANT: Only timer levels L3, L4, L5 will actually fire for recompra sessions (because the agent only emits those levels). The timer function itself handles all levels generically, so no level filtering is needed — the existing timer dispatch handles it.

    **sandbox process route** — Add recompra-v1 dispatch (after the somnio-sales-v3 block, around line 108):

    ```typescript
    // ================================================================
    // Recompra Agent: separate engine for returning clients
    // ================================================================
    if (agentId === 'somnio-recompra-v1') {
      const { SomnioRecompraEngine } = await import('@/lib/agents/somnio-recompra/engine-recompra')
      const recompraEngine = new SomnioRecompraEngine()
      const recompraResult = await recompraEngine.processMessage({
        message,
        state,
        history: history ?? [],
        turnNumber: turnNumber ?? 1,
        workspaceId: workspaceId ?? 'sandbox-workspace',
        systemEvent,
      })
      return NextResponse.json(recompraResult)
    }
    ```

    Also add the import for SystemEvent type at the top of the file (if not already generic enough).
  </action>
  <verify>
    `npx tsc --noEmit src/inngest/functions/agent-timers-v3.ts src/app/api/sandbox/process/route.ts` compiles cleanly.
    Verify agent-timers-v3.ts checks `_v3:agent_module` from session state BEFORE workspace-level config.
    Verify sandbox route handles 'somnio-recompra-v1' agentId.
    Verify existing godentist and v3 timer routing is UNCHANGED.
  </verify>
  <done>
    Timer function routes to recompra processMessage for sessions with agent_module='somnio-recompra'. Sandbox dispatches to recompra engine for testing. All existing timer and sandbox behavior unchanged.
  </done>
</task>

</tasks>

<verification>
- All 5 modified files compile with `npx tsc --noEmit`
- `npm run build` succeeds (full Next.js build)
- Webhook processor routes is_client contacts to recompra (not skip)
- V3ProductionRunner has 3-way routing: godentist / somnio-recompra / somnio-v3
- Timer function reads agent_module from session state
- Sandbox handles somnio-recompra-v1 agentId
- V3 agent behavior is COMPLETELY UNCHANGED for non-client contacts
- GoDentist agent behavior is COMPLETELY UNCHANGED
</verification>

<success_criteria>
Full integration complete. The recompra agent is wired into production (webhook routing + runner + timers) and sandbox (process route). Data preloading from last order works. The system correctly routes: new contacts → v3, godentist workspaces → godentist, is_client contacts → recompra. No regressions to existing agents.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra/04-SUMMARY.md`
</output>
