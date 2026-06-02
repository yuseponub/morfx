---
phase: somnio-sales-v3-pw-confirmation
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/index.ts
  - src/lib/agents/somnio-pw-confirmation/config.ts
  - src/lib/agents/somnio-pw-confirmation/types.ts
  - src/app/(dashboard)/agentes/routing/editor/page.tsx
  - src/lib/agents/production/webhook-processor.ts
  - .claude/rules/agent-scope.md
autonomous: true

requirements: []

must_haves:
  truths:
    - "Directorio `src/lib/agents/somnio-pw-confirmation/` existe con stubs `index.ts`, `config.ts`, `types.ts` (los demas archivos vienen en Plans 04-11)"
    - "`config.ts` exporta `SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const` (D-01) + `somnioPwConfirmationConfig: AgentConfig` con states/initialState/tools/validTransitions stub minimal"
    - "`index.ts` self-registers `somnioPwConfirmationConfig` en `agentRegistry` (importando desde `../registry`) — el side-effect import garantiza que el agente aparece en el dropdown"
    - "`types.ts` exporta los tipos del agente (placeholder mínimo para que Plans 04-11 los expandan)"
    - "`src/app/(dashboard)/agentes/routing/editor/page.tsx` agrega el import side-effect `import '@/lib/agents/somnio-pw-confirmation'` (D-02 — agente aparece como opcion seleccionable en el dropdown)"
    - "`src/lib/agents/production/webhook-processor.ts` agrega el pre-warm import `import('../somnio-pw-confirmation')` al `Promise.all([...])` (LEARNING B-001 agent-lifecycle-router — evita race condition en cold lambdas)"
    - "`.claude/rules/agent-scope.md` agrega seccion `### Somnio Sales v3 PW-Confirmation Agent` con PUEDE / NO PUEDE / Validacion / Workspace (D-17, D-18, D-19) — bloqueante para merge per agent-scope.md §OBLIGATORIO al Crear un Agente Nuevo"
    - "`npm run typecheck` no introduce errores nuevos en los archivos creados/modificados"
    - "El agente NO procesa mensajes todavia — ni `processMessage` ni `engine-pw-confirmation.ts` existen aun (vienen en Plans 04-11). Pero el dropdown lo muestra y el self-register funciona (verificable con un dev-server local + visita a /agentes/routing-editor)"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/index.ts"
      provides: "Self-registration del agente en agentRegistry — side-effect import"
      contains: "agentRegistry.register(somnioPwConfirmationConfig)"
      min_lines: 10
    - path: "src/lib/agents/somnio-pw-confirmation/config.ts"
      provides: "AgentConfig stub + agent_id literal exportado"
      contains: "SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation'"
      min_lines: 50
    - path: "src/lib/agents/somnio-pw-confirmation/types.ts"
      provides: "Tipos placeholder del agente — TipoAccion, AgentState, V3AgentInput, V3AgentOutput, etc. (expandidos en Plans 04+)"
      contains: "export type"
      min_lines: 20
    - path: ".claude/rules/agent-scope.md"
      provides: "Seccion del nuevo agente (PUEDE/NO PUEDE/Validacion/Workspace) — bloqueante para merge"
      contains: "Somnio Sales v3 PW-Confirmation Agent"
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/index.ts"
      to: "src/lib/agents/registry.ts:117 (agentRegistry.register)"
      via: "import + register call"
      pattern: "agentRegistry\\.register\\(somnioPwConfirmationConfig\\)"
    - from: "src/app/(dashboard)/agentes/routing/editor/page.tsx"
      to: "src/lib/agents/somnio-pw-confirmation/index.ts"
      via: "side-effect import (forces module load → self-register fires)"
      pattern: "import '@/lib/agents/somnio-pw-confirmation'"
    - from: "src/lib/agents/production/webhook-processor.ts"
      to: "src/lib/agents/somnio-pw-confirmation/index.ts"
      via: "pre-warm dynamic import in Promise.all"
      pattern: "import\\('\\.\\./somnio-pw-confirmation'\\)"
---

<objective>
Wave 1 (parallel con Plan 02) — Scaffold del modulo agent + registro en routing-editor + pre-warm webhook-processor + scope en agent-scope.md.

Purpose: D-02 lockea que el agente debe aparecer como opcion en el dropdown del routing-editor (el usuario configura la regla manualmente despues). Esto requiere 4 cosas:
1. Modulo del agente con `index.ts` que self-registers en `agentRegistry`.
2. Import side-effect en `routing/editor/page.tsx` para que se cargue cuando el usuario abre el editor.
3. Pre-warm en `webhook-processor.ts` para evitar el bug B-001 de cold lambdas (LEARNING agent-lifecycle-router).
4. Seccion en `.claude/rules/agent-scope.md` con PUEDE / NO PUEDE / Validacion / Workspace (bloqueante per la regla agent-scope §OBLIGATORIO).

Esta plan NO crea logica de mensajes (ni `comprehension.ts`, ni `state.ts`, ni `transitions.ts`, etc.) — esos vienen en Plans 04-11. El agente esta listo para aparecer como opcion pero AUN si lo seleccionas en una regla, NO procesara mensajes (porque no hay branch en `webhook-processor` ni `v3-production-runner` que lo invoque — eso lo agrega Plan 11).

Output: 3 archivos nuevos en `src/lib/agents/somnio-pw-confirmation/` + 3 ediciones (editor page, webhook-processor pre-warm, agent-scope.md).

**No depende de Plan 02 ni de los stage UUIDs** — solo necesita el agent_id literal (D-01, ya en CONTEXT). Por eso Plan 02 y Plan 03 son paralelizables (Wave 1) tras Plan 01 audit.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-01, §D-02, §D-17, §D-18, §D-19
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §H.1 (pasos atomicos para que aparezca en dropdown)
@.planning/standalone/agent-lifecycle-router/07-SUMMARY.md — LEARNING B-001 cold lambda race + pre-warm fix
@.claude/rules/agent-scope.md — patron de scope sections (estudiar Recompra y Reader/Writer secciones para imitar formato)
@src/lib/agents/registry.ts — AgentConfig type + agentRegistry.register signature
@src/lib/agents/somnio-recompra/index.ts — patron exacto a clonar (single-line side-effect register)
@src/lib/agents/somnio-recompra/config.ts — AgentConfig shape de referencia
@src/app/(dashboard)/agentes/routing/editor/page.tsx — donde agregar el import (lineas 23-29)
@src/lib/agents/production/webhook-processor.ts — donde agregar el pre-warm (lineas 226-230)

<interfaces>
<!-- AgentConfig shape (canonical from src/lib/agents/registry.ts) -->
interface AgentConfig {
  id: string                  // literal — used in routing rules + agentRegistry validation
  name: string
  description: string
  states: string[]            // valid session states for this agent
  initialState: string        // state for new sessions
  tools: string[]             // declarative tool names (NOT AI SDK tools — declarative)
  validTransitions: Record<string, string[]>
  intentDetector?: { ... }    // optional Haiku config
  orchestrator?: { ... }      // optional orchestrator config
}

<!-- agentRegistry.register signature -->
function register(config: AgentConfig): void
// Stores config keyed by config.id for later lookup by routing engine + dropdown population.

<!-- Recompra index.ts pattern (clonar) -->
// File: src/lib/agents/somnio-recompra/index.ts (15 lines)
import { agentRegistry } from '../registry'
import { somnioRecompraConfig, SOMNIO_RECOMPRA_AGENT_ID } from './config'

agentRegistry.register(somnioRecompraConfig)

export { SOMNIO_RECOMPRA_AGENT_ID } from './config'
export { processMessage } from './somnio-recompra-agent'  // Plans 04+ create this
export type { V3AgentInput, V3AgentOutput } from './types'

<!-- agent-scope.md pattern (clonar formato Recompra agent seccion) -->
### Somnio Recompra Agent (`somnio-recompra-v1` — webhook WhatsApp inbound)
- **PUEDE:** ...
- **NO PUEDE:** ...
- **Validacion:** ...
- **Consumidor upstream:** ...
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Scaffold modulo `src/lib/agents/somnio-pw-confirmation/` (index.ts + config.ts + types.ts)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/index.ts (LINEAS COMPLETAS — patron a clonar)
    - src/lib/agents/somnio-recompra/config.ts (LINEAS COMPLETAS — referencia AgentConfig shape)
    - src/lib/agents/somnio-recompra/types.ts (LINEAS COMPLETAS — referencia tipos exportados)
    - src/lib/agents/somnio-v3/config.ts (referencia adicional)
    - src/lib/agents/registry.ts (AgentConfig interface + register signature)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-01, §D-20 (set de tools sin crear_orden)
  </read_first>
  <action>
    Crear el directorio + 3 archivos. Los demas archivos del agente (`comprehension.ts`, `state.ts`, `transitions.ts`, `phase.ts`, `guards.ts`, `response-track.ts`, `sales-track.ts`, `engine-pw-confirmation.ts`, `somnio-pw-confirmation-agent.ts`, `delivery-zones-import.ts`) los crean Plans 04-11.

    **Paso 1 — Crear directorio:**
    ```bash
    mkdir -p src/lib/agents/somnio-pw-confirmation
    ```

    **Paso 2 — Crear `src/lib/agents/somnio-pw-confirmation/config.ts`:**

    ```typescript
    /**
     * Somnio Sales v3 — PW Confirmation Agent
     *
     * Agent ID: somnio-sales-v3-pw-confirmation (D-01 LOCKED)
     * Workspace: Somnio (a3843b3f-c337-4836-92b5-89c58bb98490) (D-19)
     * Phase: somnio-sales-v3-pw-confirmation (standalone)
     *
     * Purpose: post-purchase confirmation agent for orders created via web (NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR stages).
     * Reads CRM context BLOCKING via Inngest 2-step (D-05), confirms or escalates per state machine.
     */

    import type { AgentConfig } from '../registry'

    export const SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const

    export const somnioPwConfirmationConfig: AgentConfig = {
      id: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      name: 'Somnio Sales v3 — PW Confirmation',
      description:
        'Atiende clientes Somnio con pedido activo en NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR. ' +
        'Confirma compra, captura datos faltantes, edita direccion via crm-writer, escala handoff humano si cancelan. ' +
        'CRM reader BLOQUEANTE al crear sesion (D-05). NO crea pedidos (scope sales-v3).',
      // States del state machine (Plans 06-08 implementan transitions)
      states: [
        'nuevo',
        'awaiting_confirmation',                  // D-26 estado inicial
        'awaiting_confirmation_post_data_capture', // tras pedir datos faltantes
        'awaiting_data_capture',                   // mientras cliente provee datos
        'awaiting_address_confirmation',           // tras pedir confirmacion direccion
        'awaiting_schedule_decision',              // tras 1er "no" → preguntar agendar
        'confirmed',                               // pedido movido a CONFIRMADO
        'waiting_decision',                        // pedido movido a FALTA CONFIRMAR (D-14)
        'handoff',                                 // handoff stub disparado (D-21)
      ],
      initialState: 'nuevo', // pre-CRM-reader; pasa a 'awaiting_confirmation' tras preload (D-26)
      // Set de tools — D-20: SIN crear_orden y otros tools de creacion de pedidos heredados de sales-v3
      tools: [
        'crm.contact.update',           // actualizar nombre/telefono via crm-writer
        'crm.order.update',             // actualizar shipping_address via crm-writer (D-12)
        'crm.order.move_stage',         // mover a CONFIRMADO (D-10) / FALTA CONFIRMAR (D-14)
        'whatsapp.message.send',        // enviar templates del catalogo propio
        'handoff_human',                // stub D-21 (solo registra evento)
      ],
      // Transiciones validas entre estados (Plan 06 expande el grafo completo)
      validTransitions: {
        'nuevo': ['awaiting_confirmation', 'awaiting_data_capture', 'handoff'],
        'awaiting_confirmation': ['confirmed', 'waiting_decision', 'awaiting_address_confirmation', 'awaiting_schedule_decision', 'awaiting_data_capture', 'handoff'],
        'awaiting_confirmation_post_data_capture': ['confirmed', 'waiting_decision', 'awaiting_schedule_decision', 'handoff'],
        'awaiting_data_capture': ['awaiting_confirmation_post_data_capture', 'handoff'],
        'awaiting_address_confirmation': ['confirmed', 'awaiting_data_capture', 'handoff'],
        'awaiting_schedule_decision': ['waiting_decision', 'handoff'],
        'confirmed': [], // terminal
        'waiting_decision': ['awaiting_confirmation', 'handoff'], // cliente puede volver
        'handoff': [], // terminal — un humano lo maneja
      },
    }
    ```

    **Paso 3 — Crear `src/lib/agents/somnio-pw-confirmation/types.ts`:**

    ```typescript
    /**
     * Type stubs for somnio-sales-v3-pw-confirmation.
     * Expanded in Plans 04-11 with full state, intents, transitions, etc.
     *
     * For Wave 1, only the minimum needed to satisfy index.ts re-exports.
     */

    // Reuse V3-style input/output shapes for compatibility with V3ProductionRunner
    // (Plan 11 wires this in v3-production-runner.ts via agentModule='somnio-pw-confirmation').
    // Concrete shapes are imported from somnio-v3/types in later plans for now.

    export interface V3AgentInput {
      sessionId: string
      conversationId: string
      contactId: string
      message: string
      workspaceId: string
      history: unknown[]
      phoneNumber?: string
      messageTimestamp?: string
    }

    export interface V3AgentOutput {
      messages: unknown[]
      intent?: string
      newPhase?: string
      // Expanded in Plan 06 (state.ts) — placeholder shape for now.
    }

    // TipoAccion: union de acciones que el sales-track puede emitir.
    // Plan 08 (sales-track.ts) expande con todos los casos (D-10, D-11, D-12, D-13, D-14).
    export type TipoAccion =
      | 'confirmar_compra'              // → mover a CONFIRMADO
      | 'pedir_datos_envio'             // → pedir campos faltantes
      | 'actualizar_direccion'          // → invocar crm-writer.updateOrder shipping
      | 'editar_items'                  // → handoff humano en V1 (D-13 deferred)
      | 'cancelar_con_agendar_pregunta' // → 1er "no": preguntar agendar
      | 'cancelar_definitivo'           // → 2do "no": handoff
      | 'mover_a_falta_confirmar'       // → "espera lo pienso" (D-14)
      | 'handoff'                       // → escalada humana (D-21)
      | 'noop'                          // → ignorar turn (e.g. ya procesado)
    ```

    **Paso 4 — Crear `src/lib/agents/somnio-pw-confirmation/index.ts`:**

    ```typescript
    /**
     * Somnio Sales v3 — PW Confirmation Agent
     * Self-register entry point (side-effect on import).
     *
     * Imported by:
     * - src/app/(dashboard)/agentes/routing/editor/page.tsx (dropdown population)
     * - src/lib/agents/production/webhook-processor.ts (pre-warm cold lambdas — LEARNING B-001 agent-lifecycle-router)
     */

    import { agentRegistry } from '../registry'
    import { somnioPwConfirmationConfig, SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'

    agentRegistry.register(somnioPwConfirmationConfig)

    export { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
    // processMessage is added in Plan 11 (engine-pw-confirmation + somnio-pw-confirmation-agent).
    // For Wave 1, only the registration side-effect matters.
    export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
    ```

    **Paso 5 — Verificar typecheck:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-03-01.log
    # Esperado: exit 0 (no errors nuevos en los 3 archivos creados)

    # Sanity check: solo errors en otros archivos pre-existentes son acceptable
    grep -E "src/lib/agents/somnio-pw-confirmation/" /tmp/tc-03-01.log | grep "error TS" || echo "no new errors"
    ```

    **Paso 6 — Commit atomico:**
    ```bash
    git add src/lib/agents/somnio-pw-confirmation/
    git commit -m "feat(somnio-sales-v3-pw-confirmation): scaffold agent module (config + types + index self-register)"
    ```

    NO push.
  </action>
  <verify>
    <automated>test -d src/lib/agents/somnio-pw-confirmation</automated>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/index.ts</automated>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/config.ts</automated>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/types.ts</automated>
    <automated>grep -q "SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const" src/lib/agents/somnio-pw-confirmation/config.ts</automated>
    <automated>grep -q "agentRegistry.register(somnioPwConfirmationConfig)" src/lib/agents/somnio-pw-confirmation/index.ts</automated>
    <automated>grep -q "id: SOMNIO_PW_CONFIRMATION_AGENT_ID" src/lib/agents/somnio-pw-confirmation/config.ts</automated>
    <automated>grep -q "initialState: 'nuevo'" src/lib/agents/somnio-pw-confirmation/config.ts</automated>
    <automated>! grep -q "'crm.order.create'" src/lib/agents/somnio-pw-confirmation/config.ts</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-03-01.log; ! grep -E "src/lib/agents/somnio-pw-confirmation/" /tmp/tc-03-01.log | grep -q "error TS"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): scaffold agent module"</automated>
  </verify>
  <acceptance_criteria>
    - Directorio `src/lib/agents/somnio-pw-confirmation/` existe.
    - 3 archivos creados: `index.ts`, `config.ts`, `types.ts`.
    - `config.ts` exporta `SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const`.
    - `config.ts` exporta `somnioPwConfirmationConfig: AgentConfig` con id, name, description, states (9), initialState='nuevo', tools (5 — sin `crm.order.create`), validTransitions.
    - `index.ts` invoca `agentRegistry.register(somnioPwConfirmationConfig)` (side-effect en import).
    - `index.ts` re-exporta `SOMNIO_PW_CONFIRMATION_AGENT_ID` y los tipos placeholder.
    - `types.ts` exporta `V3AgentInput`, `V3AgentOutput`, `TipoAccion` (union de 9 acciones).
    - `npm run typecheck` no introduce errores nuevos en los 3 archivos.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - 3 archivos creados, typecheck OK, commit atomico.
    - El agente se registra al importar (side-effect) — verificable cuando Plan 03 Task 2 agregue el import en routing-editor page.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Agregar import side-effect en `routing/editor/page.tsx` + pre-warm en `webhook-processor.ts`</name>
  <read_first>
    - src/app/(dashboard)/agentes/routing/editor/page.tsx LINEAS COMPLETAS (verificar lineas 23-29 con los imports actuales de somnio/godentist/etc)
    - src/lib/agents/production/webhook-processor.ts lineas 220-235 (verificar el bloque `Promise.all([...])` con los pre-warm imports)
    - .planning/standalone/agent-lifecycle-router/07-SUMMARY.md (LEARNING B-001 — explicacion del bug + fix exacto)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §H.1 (pasos 3 y 4 — donde agregar)
  </read_first>
  <action>
    **Edit 1 — `src/app/(dashboard)/agentes/routing/editor/page.tsx`:**

    Agregar la linea de side-effect import junto a los demas (alfabetico o al final del bloque):

    OLD (lineas ~23-29):
    ```typescript
    // Trigger agentRegistry side-effects so the editor can populate a dropdown
    // of valid agent_ids (instead of a free-text input that's typo-prone).
    import '@/lib/agents/somnio-recompra'
    import '@/lib/agents/somnio-v3'
    import '@/lib/agents/somnio'
    import '@/lib/agents/godentist'
    import { agentRegistry } from '@/lib/agents/registry'
    ```

    NEW (agregar `somnio-pw-confirmation` antes del cierre del bloque):
    ```typescript
    // Trigger agentRegistry side-effects so the editor can populate a dropdown
    // of valid agent_ids (instead of a free-text input that's typo-prone).
    import '@/lib/agents/somnio-recompra'
    import '@/lib/agents/somnio-v3'
    import '@/lib/agents/somnio'
    import '@/lib/agents/godentist'
    import '@/lib/agents/somnio-pw-confirmation'  // Standalone: somnio-sales-v3-pw-confirmation (D-02)
    import { agentRegistry } from '@/lib/agents/registry'
    ```

    **Edit 2 — `src/lib/agents/production/webhook-processor.ts`:**

    Agregar el dynamic import al `Promise.all([...])` que pre-warmea agentRegistry. Esto evita el bug B-001 documentado en agent-lifecycle-router LEARNINGS (cold lambda → agente no registrado → fallback_legacy).

    OLD (lineas ~225-230):
    ```typescript
    // Pre-warm agentRegistry — router validates emitted agent_id against the
    // registry; in cold lambdas the side-effect imports may not have run yet
    // (LEARNING B-001 agent-lifecycle-router).
    await Promise.all([
      import('../somnio-recompra'),
      import('../somnio-v3'),
      import('../somnio'),
      import('../godentist'),
    ])
    ```

    NEW (agregar `somnio-pw-confirmation`):
    ```typescript
    // Pre-warm agentRegistry — router validates emitted agent_id against the
    // registry; in cold lambdas the side-effect imports may not have run yet
    // (LEARNING B-001 agent-lifecycle-router).
    await Promise.all([
      import('../somnio-recompra'),
      import('../somnio-v3'),
      import('../somnio'),
      import('../godentist'),
      import('../somnio-pw-confirmation'),  // Standalone: somnio-sales-v3-pw-confirmation (D-02)
    ])
    ```

    **Verificacion typecheck:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-03-02.log
    # Esperado: exit 0 (los 2 archivos no deben introducir errores)
    ```

    **Smoke test (opcional pero recomendado):**
    ```bash
    npm run dev &
    DEV_PID=$!
    sleep 8
    # Visit /agentes/routing/editor en browser; el dropdown del agent_id debe listar 'somnio-sales-v3-pw-confirmation'.
    # Mata el dev server tras verificar.
    kill $DEV_PID
    ```

    Skip smoke test si no hay tiempo — el typecheck + commit es suficiente para Wave 1. Plan 13 valida en prod.

    **Commit atomico:**
    ```bash
    git add src/app/(dashboard)/agentes/routing/editor/page.tsx src/lib/agents/production/webhook-processor.ts
    git commit -m "feat(somnio-sales-v3-pw-confirmation): register agent in routing-editor dropdown + pre-warm webhook-processor (D-02, LEARNING B-001)"
    ```

    NO push.
  </action>
  <verify>
    <automated>grep -q "import '@/lib/agents/somnio-pw-confirmation'" src/app/\(dashboard\)/agentes/routing/editor/page.tsx</automated>
    <automated>grep -q "import('../somnio-pw-confirmation')" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-03-02.log; ! grep -E "(routing/editor/page|webhook-processor)" /tmp/tc-03-02.log | grep -q "error TS"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): register agent in routing-editor dropdown + pre-warm webhook-processor"</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/(dashboard)/agentes/routing/editor/page.tsx` contiene exactamente la linea `import '@/lib/agents/somnio-pw-confirmation'` (con el comment de standalone y D-02).
    - `src/lib/agents/production/webhook-processor.ts` contiene `import('../somnio-pw-confirmation')` dentro del `Promise.all([...])` pre-warm block (con comment de D-02).
    - `npm run typecheck` no introduce errores nuevos en estos 2 archivos.
    - Commit atomico.
    - NO push.
  </acceptance_criteria>
  <done>
    - 2 archivos editados con cambios atomicos minimos.
    - El agente aparecera en el dropdown del routing-editor cuando el usuario abra la pagina (verificable en Plan 13 smoke test).
    - El agente quedara pre-warmeado en cold lambdas (anti-B-001).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Agregar seccion del nuevo agente en `.claude/rules/agent-scope.md` (BLOQUEANTE per regla)</name>
  <read_first>
    - .claude/rules/agent-scope.md LINEAS COMPLETAS (es el archivo entero — leer todo para imitar formato exacto, especialmente la seccion 'Somnio Recompra Agent' y los §OBLIGATORIO al final)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-17, §D-18, §D-19, §D-21 (PUEDE / NO PUEDE / Workspace / handoff stub)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §B (CRM reader bloqueante — patron Inngest 2-step), §C (CRM writer adapter)
  </read_first>
  <action>
    Agregar una NUEVA seccion al archivo `.claude/rules/agent-scope.md` despues de la seccion `### Somnio Recompra Agent (...)` (linea ~93-109) y antes de `## OBLIGATORIO al Crear un Agente Nuevo` (linea ~111).

    Contenido literal a INSERTAR:

    ```markdown
    ### Somnio Sales v3 PW-Confirmation Agent (`somnio-sales-v3-pw-confirmation` — webhook WhatsApp inbound, post-purchase)
    - **PUEDE:**
      - Responder a clientes Somnio con pedido activo en stages `NUEVO PAG WEB` / `FALTA INFO` / `FALTA CONFIRMAR` (D-04, pipeline `Ventas Somnio Standard`).
      - Emitir templates del catalogo propio bajo `agent_id='somnio-sales-v3-pw-confirmation'` (D-15): informacionales clonados verbatim de sales-v3 (saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario, tiempo_entrega_*) + sales reestructurados post-compra (confirmacion_orden_*, pedir_datos_post_compra, confirmar_direccion_post_compra, agendar_pregunta, claro_que_si_esperamos, cancelado_handoff, fallback, error_carga_pedido).
      - Invocar **CRM reader** al crear sesion de forma **BLOQUEANTE** (D-05) — patron NUEVO en codebase: webhook responde 200 inmediato, dispatch Inngest 2-step (`pw-confirmation/preload-and-invoke`) primero corre el reader y luego invoca al agente con contexto ya en sesion (sin polling). Diferencia clave vs recompra que es non-blocking.
      - Invocar **CRM writer** (`crm-writer.proposeAction + confirmAction` via adapter `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts`) para:
        - `updateOrder({ shippingAddress, shippingCity, shippingDepartment })` — actualizar direccion del pedido (D-12).
        - `moveOrderToStage(orderId, CONFIRMADO_UUID)` — confirmar pedido (D-10).
        - `moveOrderToStage(orderId, FALTA_CONFIRMAR_UUID)` — cliente pide tiempo (D-14).
      - Detectar handoff a humano (D-21 stub) — NO mutacion CRM, solo emite evento `pipeline_decision:handoff_triggered` + flag `requires_human=true` en sesion (no hay tool real `handoff_human` todavia, se construye en standalone futuro).
    - **NO PUEDE:**
      - Operar fuera del workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) (D-19).
      - Compartir catalogo de templates con `somnio-sales-v3` u otros agentes — catalogo independiente bajo `agent_id='somnio-sales-v3-pw-confirmation'` desde shipped (D-15, leccion recompra-template-catalog 2026-04-23).
      - Crear pedidos nuevos (`crm.order.create` excluido del set de tools — scope sales-v3) (D-18, D-20).
      - Mutar pedidos directamente sin pasar por crm-writer (Regla 3 — toda mutacion via `proposeAction + confirmAction` → domain layer).
      - Crear/editar tags, pipelines, stages, templates, usuarios (recursos base — D-18).
      - Acceder a templates de otros agentes (D-18).
      - Mover pedidos a stages fuera de los 4 contemplados (`NUEVO PAG WEB`, `FALTA INFO`, `FALTA CONFIRMAR`, `CONFIRMADO`) — explicitamente prohibido alcanzar `REPARTO` / `ENTREGADO` / `DEVOLUCION` / etc. (D-18).
      - Editar items del pedido (`updateOrder.products`) en V1 — D-13 deferred a V1.1, en V1 escala a handoff humano si cliente pide.
      - Auto-crear regla en `routing_rules` — la activacion del agente la hace el usuario manualmente desde `/agentes/routing-editor` (D-02).
    - **Validacion:**
      - `SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const` literal en `src/lib/agents/somnio-pw-confirmation/config.ts:NN` (LOCKED por D-01).
      - Tool handlers del agente (cuando existan tools AI SDK en V1.1) importaran EXCLUSIVAMENTE desde `@/lib/agents/crm-writer/two-step.ts` (`proposeAction + confirmAction`) y `@/lib/agents/crm-reader` (`processReaderMessage`) — CERO `createAdminClient` directo en `src/lib/agents/somnio-pw-confirmation/**` (Regla 3).
      - Adapter `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts` (creado en standalone Plan 10) es el UNICO archivo del agente que invoca `proposeAction + confirmAction` — wraps con scope acotado a las 3 operaciones (updateOrder shipping, moveOrderToStage CONFIRMADO/FALTA_CONFIRMAR).
      - State-machine pura (D-25) — sin AI SDK loop / generateText / streamText / tool-calling. Comprehension via single Haiku call (clonado de recompra/v3 pattern).
      - Estado inicial de la maquina = `'awaiting_confirmation'` tras CRM reader (D-26) — el guard de "si" del cliente NO consulta `messages.template_name` sino el estado de la maquina.
      - Agent ID registrado: `'somnio-sales-v3-pw-confirmation'` en `agentRegistry`; observability agentId mismo valor; rate-limit bucket compartido con recompra/v3 si aplica.
      - **Error contract `stage_changed_concurrently` (Standalone `crm-stage-integrity`, D-06):** cuando el adapter recibe este error de `confirmAction`, propaga al agent loop que decide handoff humano (D-21 trigger c) — NO reintenta automaticamente.
    - **Consumidor upstream:** Inngest function `pw-confirmation-preload-and-invoke` (`crm-reader` + agente PW via agent-to-agent in-process) — ver seccion CRM Reader Bot §Consumidores. Webhook `webhook-processor.ts` dispatcha el event `pw-confirmation/preload-and-invoke` cuando el routing decide `agent_id='somnio-sales-v3-pw-confirmation'`.
    - **Consumidor downstream:** CRM Writer Bot — el agente invoca `proposeAction + confirmAction` directo (in-process). Workspace isolation via headers no aplica (in-process); el adapter pasa `workspaceId` explicitamente al domain layer.
    ```

    Tambien actualizar la seccion `### CRM Reader Bot (...)` §Consumidores in-process documentados (line ~43) para agregar el nuevo consumidor:

    ```markdown
      - `somnio-sales-v3-pw-confirmation` (Phase standalone `somnio-sales-v3-pw-confirmation`, shipped <fecha post-Plan 12>):
        - Invoca `processReaderMessage(...)` desde la funcion Inngest `pw-confirmation-preload-and-invoke` (`src/inngest/functions/pw-confirmation-preload-and-invoke.ts`) al crear sesion — **BLOQUEANTE** (a diferencia de recompra non-blocking).
        - Invoker propagado: el dispatch + function pasan `invoker: 'somnio-sales-v3-pw-confirmation'` → reader loggea este valor.
        - Workspace isolation: `workspaceId` del event validado contra el workspace del session_state; reader filtra queries por workspace (Regla 3).
        - Feature flag: NO HAY feature flag — la activacion del agente se controla 100% via routing rules (D-02). Sin regla activa = sin trafico = aislamiento total.
        - Escribe `_v3:crm_context` + `_v3:crm_context_status` + `_v3:active_order` (JSON estructurado) a `session_state.datos_capturados` via `SessionManager.updateCapturedData`.
        - Observability: emite eventos `pipeline_decision:crm_reader_dispatched` (webhook), `crm_reader_completed` / `crm_reader_failed` (Inngest function), `crm_context_used` / `crm_context_missing_proceeding_blind` (agente).
        - Timeout: 25s inner AbortController (mismo que recompra) — D-05 bloqueante asume latencia 5-30s aceptable post-purchase.
        - Retries: 1; concurrency: 1 por `event.data.sessionId`.
        - Consumo HTTP: NO (invocacion in-process dentro del mismo Vercel deployment).
    ```

    **Verificar resultado:**
    ```bash
    grep -c "Somnio Sales v3 PW-Confirmation Agent" .claude/rules/agent-scope.md
    # Expected: 1

    grep -c "somnio-sales-v3-pw-confirmation" .claude/rules/agent-scope.md
    # Expected: >=10 (varias menciones en PUEDE / NO PUEDE / Validacion / Consumidor)
    ```

    **Commit atomico:**
    ```bash
    git add .claude/rules/agent-scope.md
    git commit -m "docs(somnio-sales-v3-pw-confirmation): add agent scope section (PUEDE/NO PUEDE/Validacion/Consumidores) — bloqueante per agent-scope §OBLIGATORIO"
    ```

    NO push.
  </action>
  <verify>
    <automated>grep -q "Somnio Sales v3 PW-Confirmation Agent" .claude/rules/agent-scope.md</automated>
    <automated>test $(grep -c "somnio-sales-v3-pw-confirmation" .claude/rules/agent-scope.md) -ge 10</automated>
    <automated>grep -q "BLOQUEANTE" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "Catalogo independiente bajo \`agent_id='somnio-sales-v3-pw-confirmation'\`\\|catalogo independiente bajo .agent_id='somnio-sales-v3-pw-confirmation'." .claude/rules/agent-scope.md</automated>
    <automated>grep -q "crm-writer-adapter" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "pw-confirmation-preload-and-invoke" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "stage_changed_concurrently" .claude/rules/agent-scope.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(somnio-sales-v3-pw-confirmation): add agent scope section"</automated>
  </verify>
  <acceptance_criteria>
    - `.claude/rules/agent-scope.md` contiene una seccion nueva `### Somnio Sales v3 PW-Confirmation Agent (...)` con PUEDE / NO PUEDE / Validacion / Consumidor upstream / Consumidor downstream.
    - La seccion menciona los 5 puntos clave: D-04 (stages), D-15 (catalogo propio), D-05 (CRM reader BLOQUEANTE), D-12+D-10+D-14 (mutaciones via crm-writer), D-21 (handoff stub), D-13 deferred a V1.1.
    - La seccion del CRM Reader Bot §Consumidores tiene una nueva entrada para `somnio-sales-v3-pw-confirmation` (paralela a la entrada existente de `somnio-recompra-v1`).
    - Commit atomico.
    - NO push.
  </acceptance_criteria>
  <done>
    - Scope documentado correctamente — bloqueante para merge resuelto.
    - Las 3 ediciones (Tasks 1+2+3) estan listas para Wave 2.
  </done>
</task>

</tasks>

<verification>
- 3 archivos creados en `src/lib/agents/somnio-pw-confirmation/` (index.ts + config.ts + types.ts).
- `routing/editor/page.tsx` agrega el side-effect import.
- `webhook-processor.ts` agrega el pre-warm dynamic import.
- `.claude/rules/agent-scope.md` tiene la seccion del nuevo agente + actualizo la seccion del CRM Reader §Consumidores.
- `npm run typecheck` no introduce errores nuevos.
- 3 commits atomicos en git, NO pusheados (Wave 1 queda local hasta Plan 12).
</verification>

<success_criteria>
- El agente self-registra al cargar el modulo (`agentRegistry.register` corre).
- El dropdown del routing-editor mostrara `'somnio-sales-v3-pw-confirmation'` como opcion (verificable en Plan 13 smoke test prod).
- Cold lambdas pre-warmean el modulo (anti-B-001).
- Scope del agente documentado en `.claude/rules/agent-scope.md` — merge desbloqueado per regla §OBLIGATORIO.
- Wave 2 (Plans 04 + 05 + 06) puede empezar: tienen el directorio + config + types listos como base para expansion.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/03-SUMMARY.md` documenting:
- 3 commit hashes (Tasks 1+2+3).
- Verbatim del contenido de `config.ts` (especialmente `states`, `tools`, `validTransitions`).
- Diff de routing/editor/page.tsx + webhook-processor.ts (1 linea agregada en cada uno).
- Confirmacion: scope agregado a `.claude/rules/agent-scope.md` (count menciones >=10).
- Output del typecheck.
- Confirmacion: NO push (Wave 1 queda local hasta Plan 12).
</output>
</content>
</invoke>