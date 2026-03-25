---
phase: somnio-recompra
plan: 03
type: execute
wave: 3
depends_on: ["somnio-recompra-02"]
files_modified:
  - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
  - src/lib/agents/somnio-recompra/config.ts
  - src/lib/agents/somnio-recompra/index.ts
  - src/lib/agents/somnio-recompra/engine-recompra.ts
autonomous: true

must_haves:
  truths:
    - "processMessage() handles both user messages and timer system events"
    - "Agent self-registers in agentRegistry on import via index.ts"
    - "Sandbox engine maps SandboxState to/from recompra V3AgentInput/Output"
    - "Agent exports V3AgentInput and V3AgentOutput types for V3ProductionRunner compatibility"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/somnio-recompra-agent.ts"
      provides: "Main processMessage pipeline"
      exports: ["processMessage"]
    - path: "src/lib/agents/somnio-recompra/config.ts"
      provides: "Agent registry config"
      exports: ["SOMNIO_RECOMPRA_AGENT_ID", "somnioRecompraConfig"]
    - path: "src/lib/agents/somnio-recompra/index.ts"
      provides: "Module entry point with self-registration"
      exports: ["SOMNIO_RECOMPRA_AGENT_ID", "processMessage"]
    - path: "src/lib/agents/somnio-recompra/engine-recompra.ts"
      provides: "Sandbox engine adapter"
      exports: ["SomnioRecompraEngine"]
  key_links:
    - from: "somnio-recompra-agent.ts"
      to: "comprehension.ts + sales-track.ts + response-track.ts"
      via: "imports and calls in sequence"
      pattern: "comprehend.*resolveSalesTrack.*resolveResponseTrack"
    - from: "index.ts"
      to: "agentRegistry"
      via: "agentRegistry.register(somnioRecompraConfig)"
      pattern: "agentRegistry\\.register"
    - from: "engine-recompra.ts"
      to: "somnio-recompra-agent.ts"
      via: "imports processMessage for sandbox"
      pattern: "import.*processMessage.*from.*somnio-recompra-agent"
---

<objective>
Create the main agent pipeline, configuration, module entry point, and sandbox engine for the somnio-recompra agent.

Purpose: These 4 files wire together all foundation and business logic into a working agent. The main agent file orchestrates the pipeline (comprehension → state merge → gates → guards → sales track → response track). The config/index handle agent registration. The sandbox engine enables testing.

Output: Complete, self-contained agent module ready for integration with the production system.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra/CONTEXT.md
@.planning/standalone/somnio-recompra/RESEARCH.md
@.planning/standalone/somnio-recompra/01-SUMMARY.md
@.planning/standalone/somnio-recompra/02-SUMMARY.md

# Source files to fork from (READ these, do NOT modify them):
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/godentist/config.ts
@src/lib/agents/godentist/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Main Agent Pipeline and Config/Index</name>
  <files>
    src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
    src/lib/agents/somnio-recompra/config.ts
    src/lib/agents/somnio-recompra/index.ts
  </files>
  <action>
    **somnio-recompra-agent.ts** — Fork from somnio-v3/somnio-v3-agent.ts:

    Same two-path structure:
    1. `processMessage(input: V3AgentInput): Promise<V3AgentOutput>` — routes to processUserMessage or processSystemEvent based on input.systemEvent.
    2. `processSystemEvent()` — handles timer_expired (only levels 3, 4, 5). Same pattern as v3: deserialize state → derive phase → compute gates → resolve transition → resolve response → build output.
    3. `processUserMessage()` — Same pipeline as v3:
       - Deserialize state from input
       - Call `comprehend()` (Claude Haiku)
       - Call `mergeAnalysis()` (state merge)
       - Call `computeGates()` (gates)
       - Call `checkGuards()` (R0, R1)
       - Call `resolveSalesTrack()` (WHAT TO DO)
       - Call `resolveResponseTrack()` (WHAT TO SAY)
       - Build V3AgentOutput

    Key differences from v3:
    - No auto:datos_completos event emission (no silent capture).
    - No `enCapturaSilenciosa` logic.
    - Timer signals only L3, L4, L5.
    - Import everything from local `./` (comprehension, state, sales-track, response-track, guards, phase, constants, types).

    **config.ts** — Follow godentist/config.ts pattern:
    ```typescript
    export const SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'
    export const somnioRecompraConfig: AgentConfig = {
      id: SOMNIO_RECOMPRA_AGENT_ID,
      name: 'Somnio Recompra Agent',
      description: 'Agente de recompra para clientes existentes. Pipeline v3 simplificado con datos precargados.',
      intentDetector: { model: CLAUDE_MODELS.HAIKU, systemPrompt: 'PLACEHOLDER', maxTokens: 512 },
      orchestrator: { model: CLAUDE_MODELS.HAIKU, systemPrompt: 'PLACEHOLDER', maxTokens: 512 },
      tools: ['crm.contact.create', 'crm.contact.update', 'crm.contact.get', 'crm.order.create', 'whatsapp.message.send'],
      states: ['nuevo', 'promos', 'confirmacion', 'orden_creada', 'handoff'],
      initialState: 'nuevo',
      validTransitions: {
        nuevo: ['promos', 'handoff'],
        promos: ['confirmacion', 'orden_creada', 'handoff'],
        confirmacion: ['orden_creada', 'promos', 'handoff'],
        orden_creada: ['handoff'],
        handoff: [],
      },
      confidenceThresholds: { proceed: 80, reanalyze: 60, clarify: 40, handoff: 0 },
      tokenBudget: 50_000,
    }
    ```

    **index.ts** — Follow godentist/index.ts pattern:
    - Import `agentRegistry` from `../registry`
    - Import config from local `./config`
    - Call `agentRegistry.register(somnioRecompraConfig)` at module level
    - Re-export: `SOMNIO_RECOMPRA_AGENT_ID`, `processMessage`, `V3AgentInput`, `V3AgentOutput`
  </action>
  <verify>
    `npx tsc --noEmit src/lib/agents/somnio-recompra/somnio-recompra-agent.ts src/lib/agents/somnio-recompra/config.ts src/lib/agents/somnio-recompra/index.ts` compiles cleanly.
    Verify index.ts calls `agentRegistry.register()`.
    Verify somnio-recompra-agent.ts does NOT import from somnio-v3/.
    Verify processMessage handles both user messages and system events.
  </verify>
  <done>
    Main pipeline processes messages through comprehension → merge → gates → guards → sales → response. Config registers agent as 'somnio-recompra-v1'. Index self-registers on import.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sandbox Engine</name>
  <files>
    src/lib/agents/somnio-recompra/engine-recompra.ts
  </files>
  <action>
    **engine-recompra.ts** — Fork from somnio-v3/engine-v3.ts:

    Same pattern: `SomnioRecompraEngine` class with `processMessage(input: V3EngineInput): Promise<V3EngineOutput>`.

    Responsibilities:
    1. Map SandboxState → V3AgentInput (same mapping as v3 engine: currentMode, intentsVistos, templatesEnviados, datosCapturados, packSeleccionado, accionesEjecutadas)
    2. Call local `processMessage()` from `./somnio-recompra-agent`
    3. Map V3AgentOutput → V3EngineOutput (same mapping: messages, newState, debugTurn, timerSignal)

    Interface types:
    ```typescript
    export interface V3EngineInput {
      message: string
      state: SandboxState
      history: { role: 'user' | 'assistant'; content: string }[]
      turnNumber: number
      workspaceId: string
      systemEvent?: SystemEvent
    }

    export interface V3EngineOutput {
      success: boolean
      messages: string[]
      newState: SandboxState
      debugTurn: DebugTurn
      error?: { code: string; message: string }
      timerSignal?: unknown
    }
    ```

    Import SandboxState and DebugTurn from `@/lib/sandbox/types`.
    Import SystemEvent from local `./types`.
    Import processMessage from local `./somnio-recompra-agent`.
  </action>
  <verify>
    `npx tsc --noEmit src/lib/agents/somnio-recompra/engine-recompra.ts` compiles cleanly.
    Verify it imports processMessage from local agent, not from somnio-v3.
    Verify V3EngineInput/Output interfaces match the sandbox expected shape.
  </verify>
  <done>
    Sandbox engine maps between SandboxState and recompra agent I/O. Ready for sandbox process route integration (Plan 04).
  </done>
</task>

</tasks>

<verification>
- All 4 files compile with `npx tsc --noEmit`
- `SOMNIO_RECOMPRA_AGENT_ID` is 'somnio-recompra-v1'
- index.ts registers agent in agentRegistry
- processMessage handles user messages and timer_expired events
- engine-recompra.ts uses local processMessage (not somnio-v3)
- Full module is self-contained: 14 files total in src/lib/agents/somnio-recompra/
</verification>

<success_criteria>
Complete agent module ready. All 14 files exist in somnio-recompra/. The module self-registers, processes messages through the full pipeline, and has a sandbox engine. No dependencies on somnio-v3 files (only on shared somnio/ utilities). Ready for system integration (Plan 04).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra/03-SUMMARY.md`
</output>
