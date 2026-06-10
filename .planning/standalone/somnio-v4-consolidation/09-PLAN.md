---
phase: somnio-v4-consolidation
plan: 09
type: execute
wave: 6
depends_on: ["08"]
files_modified:
  - src/lib/agents/somnio-v4/core/types.ts
  - src/lib/agents/somnio-v4/core/turn-orchestrator.ts
autonomous: true
requirements: [D-03, D-04, D-05]
must_haves:
  truths:
    - "Existe un orquestador de turno ÚNICO extraído del runner de producción (D-04: el runner es la fuente de verdad — CKPT-6a, crash-recovery, no-repetición incluidos como capabilities)"
    - "El core NO importa nada de WhatsApp ni de NDJSON (D-05) — solo interruption-system-v2, el agente, y tipos propios"
    - "Las capabilities prod-only/sandbox-only son métodos OPCIONALES del adapter (patrón optional-method del runner) — cero flags booleanos de entorno"
    - "onResultReady se invoca con el resultado final ANTES del release del lock en finally (Open Question 1 RESUELTA — el follower del sandbox long-pollea sandbox-result y debe verlo antes de poder adquirir)"
    - "El orquestador todavía NO tiene consumidores (el rewire es Plan 10) — typecheck verde, comportamiento del sistema sin cambios"
  artifacts:
    - path: "src/lib/agents/somnio-v4/core/types.ts"
      provides: "contratos: TurnCoreAdapters, TurnCoreInput, TurnResult, CoreSeedState, SendBlock, CommittedTurn"
      exports: ["TurnCoreAdapters", "TurnResult"]
    - path: "src/lib/agents/somnio-v4/core/turn-orchestrator.ts"
      provides: "runTurn() — restart loop + Path A/B + heartbeat + finally release, extraído del runner"
      exports: ["runTurn"]
      min_lines: 300
  key_links:
    - from: "src/lib/agents/somnio-v4/core/turn-orchestrator.ts"
      to: "@/lib/agents/somnio-v4/somnio-v4-agent"
      via: "import estático del agente (A13 — specifier que engine-v4-lock.test.ts ya mockea)"
      pattern: "from '@/lib/agents/somnio-v4/somnio-v4-agent'"
    - from: "src/lib/agents/somnio-v4/core/turn-orchestrator.ts"
      to: "@/lib/agents/interruption-system-v2/lock"
      via: "startHeartbeat + releaseLockIfOwner con specifier absoluto (Pitfall 8)"
      pattern: "releaseLockIfOwner"
---

<objective>
Wave 2, paso 4a: contratos del core (interface-first) + extracción del `turn-orchestrator.ts` desde el while-loop del runner (D-04), repartida en dos tareas (shell del loop + flujo invoke/send/cierre). El orquestador queda compilando SIN consumidores; el rewire del runner es el Plan 10 y el del engine el Plan 11.

Purpose: "el sandbox debe ser producción con adapters falsos" (motivación verbatim del usuario) — este archivo ES el mecanismo único que lo hace cierto por construcción.
Output: core/types.ts + core/turn-orchestrator.ts compilando, con todos los invariantes del Divergence Map codificados.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-03, D-04, D-05)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (§Divergence Map COMPLETO — A1..A18, B1..B11, C1..C6; §Architecture Patterns — interfaz de adapters; Open Question 1; Pitfalls 6, 7, 8)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§turn-orchestrator.ts — código fuente verbatim de lockCtx/heartbeat/finally/LostLockError/discriminator)
@.planning/standalone/somnio-v4-consolidation/08-SUMMARY.md (mapa site→modo→carrySource)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)
</context>

<tasks>

<task type="auto">
  <name>Task 1: core/types.ts — contratos del core (interface-first)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (COMPLETO post-Plan-08: qué consume de adapters/storage/messaging/debug, shape de EngineInput/EngineOutput, el bloque commit post-send, el contrato send existente)
    - src/lib/agents/engine-adapters/production/messaging.ts (~:151-161 — el contrato send() retorna {messagesSent, interrupted?, interruptedAtIndex?}: NO inventar otro — D-05/Don't Hand-Roll)
    - src/lib/agents/somnio-v4/engine-v4.ts (qué necesita el lado sandbox del seed state y del resultado)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Architecture Patterns (interfaz TurnCoreAdapters sugerida — base, ajustar a lo observado)
  </read_first>
  <files>src/lib/agents/somnio-v4/core/types.ts</files>
  <action>
    Crear `core/types.ts` con los contratos. Partir de la interfaz sugerida del RESEARCH y ajustar nombres/shapes a lo que el runner real consume (D-03: nombres a discreción; lo NO negociable es el patrón optional-method y la agnosticidad D-05):
    1. `TurnCoreAdapters`:
       - `send(block: SendBlock): Promise<{ messagesSent: number; interrupted?: boolean; interruptedAtIndex?: number }>` — OBLIGATORIO; el contrato YA existente de messaging.ts; puede lanzar LostLockError (CKPT-7.N interno del adapter).
       - `getSeedState(): Promise<CoreSeedState>` — OBLIGATORIO; prod = fetch sesión per-iteración (B1); sandbox = input.state de memoria.
       - Opcionales prod-only: `commitTurn?(result: CommittedTurn): Promise<void>` (B7), `getPendingTemplates?()/savePendingTemplates?()/clearPendingTemplates?()` (B3 — habilitan CKPT-6a), `getLegacyPendingMessage?(): string | undefined` + `savePathARollback?(msg: string): Promise<void>` (B2 — crash-recovery D-18), `filterOutbound?(templates: ...): Promise<...>` (B5 — no-repetición), `preloadOnce?(): Promise<void>` (B4), `recordDebug?(...)` (B8).
       - Opcionales sandbox-only: `beforeAgentInvoke?(iteration: number): Promise<void>` (C1 — thinking sleep), `onResultReady?(result: TurnResult): Promise<void>` (C4 — write sandbox-result ANTES del release).
    2. `TurnCoreInput`: message, workspaceId, lockHandle/lockChannel/lockIdentifier, ownPendingEntryJson, y los campos neutrales que el loop necesita (derivar del EngineInput real, SIN tipos de WhatsApp).
    3. `TurnResult`: resultado discriminado NEUTRAL (C5 — los wrappers mapean): `{ kind: 'completed', ... } | { kind: 'zombie_exit', ckptId, message } | { kind: 'error', message, cause? }` con los datos que ambos wrappers necesitan (output del agente comprometido, templatesSentCount, totalTokens, carry final, etc. — derivar de qué usan runner :postsend y engine :521-629 hoy).
    4. `CoreSeedState`, `SendBlock`, `CommittedTurn`: derivar de los usos reales (SendBlock = lo que el runner pasa hoy a messaging.send; CommittedTurn = los insumos del bloque commit B7).
    5. PROHIBIDO en este archivo: imports de whatsapp/, engine-adapters/, sandbox/, NDJSON, Supabase (D-05). Solo tipos de somnio-v4 (V4AgentOutput etc.), interruption-system-v2 y propios.
    6. Gate: `npx tsc --noEmit` verde. Commit: `feat(somnio-v4-consolidation 09): core/types.ts — contratos TurnCoreAdapters/TurnResult (D-05, interface-first)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "onResultReady\|getLegacyPendingMessage\|filterOutbound\|getPendingTemplates" src/lib/agents/somnio-v4/core/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - core/types.ts exporta TurnCoreAdapters, TurnCoreInput, TurnResult, CoreSeedState, SendBlock, CommittedTurn
    - Las capabilities B2/B3/B5/C1/C4 son métodos con `?:` (`grep -cE "(commitTurn|getPendingTemplates|getLegacyPendingMessage|savePathARollback|filterOutbound|beforeAgentInvoke|onResultReady)\?" src/lib/agents/somnio-v4/core/types.ts` ≥ 7)
    - `grep -cE "from '.*(whatsapp|engine-adapters|sandbox|supabase)" src/lib/agents/somnio-v4/core/types.ts` = 0 (D-05)
    - typecheck verde
  </acceptance_criteria>
  <done>Contratos pinneados — el Plan 10/11 implementa contra esto sin re-interpretar.</done>
</task>

<task type="auto">
  <name>Task 2: core/turn-orchestrator.ts — shell del restart loop (lockCtx + heartbeat + CKPT-0 + seed/legacy/preload)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (COMPLETO post-Plan-08 — ES el material fuente; el orquestador es una extracción, no una invención; para esta tarea: derivación lockCtx, startHeartbeat, restart loop, CKPT-0, fetch de sesión per-iteración, combine legacy D-18, preload)
    - src/lib/agents/somnio-v4/core/types.ts, core/checkpoint-gate.ts, core/drain.ts, core/restart-context.ts
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Divergence Map filas A1-A8 (qué entra al core y con qué variante) + B-table filas B1/B2/B4 (capabilities que esta tarea cablea) + Pitfall 7 (orden CKPT-0 → seed → legacy combine)
    - .planning/standalone/somnio-v4-consolidation/PATTERNS.md §turn-orchestrator.ts (snippets verbatim: lockCtx throw, heartbeat)
  </read_first>
  <files>src/lib/agents/somnio-v4/core/turn-orchestrator.ts</files>
  <action>
    Crear `core/turn-orchestrator.ts` exportando `runTurn(input: TurnCoreInput, adapters: TurnCoreAdapters): Promise<TurnResult>`. Extraer del runner (D-04 — la versión del runner manda en toda divergencia) la PRIMERA MITAD del flujo, con estos invariantes del Divergence Map:
    1. **lockCtx + guard** (A1): derivación con THROW defensivo del runner (`'[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated'`) — NO la versión silenciosa del engine.
    2. **Heartbeat** (A2): `startHeartbeat(input.lockHandle)` fuera del loop; el stop va en el finally (provisional en esta tarea — ver punto 5).
    3. **RestartContext** (A3-A6): `createRestartContext(input.ownPendingEntryJson)`.
    4. **Restart loop** (A7): `while (ctx.shouldRestart) { ctx.shouldRestart = false; ... }` con:
       a. CKPT-0 via runCheckpointGate; en interrupt → drainPendingAndCombine path_a con `priorMsg = ctx.effectiveMessage ?? input.message` + continue. (A8)
       b. `await adapters.getSeedState()` per-iteración (B1) y DESPUÉS el combine legacy: `const legacy = adapters.getLegacyPendingMessage?.()` → si presente, combinar como hoy (B2/D-18). ORDEN Pitfall 7: CKPT-0 → seed → legacy combine. Conservar el comentario D-18 del runner.
       c. `adapters.preloadOnce?.()` (B4) y `adapters.beforeAgentInvoke?.(ctx.restartIteration)` (C1).
    5. **Estado compilable al cierre de esta tarea (decisión explícita del planner):** el cuerpo del loop termina, tras el punto 4c, en un stub claramente marcado `throw new Error('task 3 pending: agent invoke + CKPT-6a/6b + send + commit + finally release')`. Añadir un `try { ... } finally { stopHeartbeat?.() }` PROVISIONAL alrededor del loop (solo stop del heartbeat — la Task 3 lo expande con releaseLockIfOwner verbatim A16 y la estructura completa de OQ1). Con el throw, TypeScript acepta el return type `Promise<TurnResult>` sin implementar aún la construcción del resultado.
    6. SPECIFIERS (Pitfall 8): interruption-system-v2 SOLO con `@/lib/agents/interruption-system-v2/*`. PROHIBIDO importar whatsapp/NDJSON/Supabase (D-05). Aplica desde esta tarea — no introducir imports que la Task 3 tendría que limpiar.
    7. Gate: `npx tsc --noEmit` verde (el archivo compila aunque el orquestador esté incompleto — el stub del punto 5 lo garantiza; sin consumidores, comportamiento del sistema sin cambios). Commit: `feat(somnio-v4-consolidation 09): core/turn-orchestrator.ts — shell del restart loop: lockCtx + heartbeat + CKPT-0 + seed/legacy combine (D-04)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "webhook contract violated" src/lib/agents/somnio-v4/core/turn-orchestrator.ts && grep -c "task 3 pending" src/lib/agents/somnio-v4/core/turn-orchestrator.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function runTurn\|export function runTurn" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 1
    - `grep -c "webhook contract violated" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 1 (throw del runner A1, no el null silencioso del engine)
    - `grep -c "startHeartbeat" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` ≥ 1 (A2)
    - `grep -c "getSeedState" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` ≥ 1 (B1 per-iteración)
    - `grep -c "getLegacyPendingMessage" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` ≥ 1 (B2/D-18, DESPUÉS del seed — orden Pitfall 7)
    - `grep -c "task 3 pending" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 1 (stub marcado del punto 5)
    - typecheck verde
  </acceptance_criteria>
  <done>El shell del loop existe y compila: lock guard A1, heartbeat A2, restart context A3-A6, CKPT-0 A8, seed B1, legacy combine B2 en orden Pitfall 7, preload B4 — listo para que la Task 3 complete invoke/send/cierre.</done>
</task>

<task type="auto">
  <name>Task 3: core/turn-orchestrator.ts — invoke + CKPT-6a/6b + send post-hoc + commit + finally (OQ1)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (COMPLETO post-Plan-08 — para esta tarea: invocación del agente, discriminator, CKPT-6a pending-templates, CKPT-6b, filtro rag:*/warning D-14, send + manejo post-hoc del interrupted, bloque commit post-send, finally release verbatim)
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts (estado dejado por la Task 2 — el stub `task 3 pending` marca dónde continúa la extracción)
    - src/lib/agents/somnio-v4/core/types.ts, core/checkpoint-gate.ts, core/drain.ts, core/restart-context.ts
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Divergence Map filas A9-A18 + B-table filas B3/B5/B6/B7/B8/B10 + Open Question 1
    - .planning/standalone/somnio-v4-consolidation/PATTERNS.md §turn-orchestrator.ts (snippets verbatim: finally, LostLockError catch, discriminator)
  </read_first>
  <files>src/lib/agents/somnio-v4/core/turn-orchestrator.ts</files>
  <action>
    Completar `runTurn` reemplazando el stub `task 3 pending` con la SEGUNDA MITAD del flujo extraído del runner (D-04):
    1. **Invocación del agente** (continuación del loop, sigue al `beforeAgentInvoke` de la Task 2):
       d. Import ESTÁTICO `import { processMessage as runAgentTurn } from '@/lib/agents/somnio-v4/somnio-v4-agent'` (A13 — specifier absoluto que engine-v4-lock.test.ts YA mockea; verificar nombre del export con grep). Acumular tokens en ctx.
       e. Discriminator (A9): `output.success === false && output.errorMessage?.startsWith('interrupted_at_ckpt_')` → throw si !lockCtx + drain path_a + continue.
       f. CKPT-6a + envío de pending-templates de turno previo, GATED en `if (adapters.getPendingTemplates)` (B3 — el sandbox no lo implementa → rama saltada = paridad actual exacta). Path B desde CKPT-6b con pending ≥1 sends → drain path_b_solo + `ctx.carrySource = 'seed'` (A11/A14 — carry desde SEED: el output de msg1 NO se envió).
       g. CKPT-6b via gate (A10): con `hasSentAnything: <sends acumulados> > 0` cubriendo ambos lados (el sandbox siempre llega con 0).
       h. Filtro `rag:*` fuera de templates_enviados (B6 — es mecanismo, va al CORE) + warning D-14 `v4_messages_without_templates` (B10 — viaja aquí desde el runner) + `adapters.filterOutbound?.(...)` (B5).
       i. Send: `const sendResult = await adapters.send(block)` y manejo POST-HOC del interrupted (A12 — forma del runner, UN solo lugar): 0 sent → drain path_a; ≥1 sent → drain path_b_solo + `ctx.carrySource = 'output'` (A14) + `adapters.savePathARollback?.()` en el edge wasInterruptedWithZeroSends (B2). `if (ctx.shouldRestart) continue` SIN persistir (A15).
       j. Commit del turno: `await adapters.commitTurn?.(committedTurn)` (B7) + `adapters.recordDebug?.(...)` (B8). Construir el TurnResult 'completed'.
    2. **Estructura de cierre (Open Question 1 RESUELTA)** — reemplaza el `finally` provisional de la Task 2 con la estructura completa:
    ```typescript
    try {
      let result: TurnResult
      try {
        result = await loopBody()          // todo lo anterior
      } catch (error) {
        if (error instanceof LostLockError) {
          emitLockEvent('zombie_lambda_exit', { my_uuid: ..., current_holder_uuid: 'unknown', at_step: error.ckptId })
          result = { kind: 'zombie_exit', ckptId: error.ckptId, message: error.message }
        } else {
          result = { kind: 'error', message: ..., cause: error }
        }
      }
      await adapters.onResultReady?.(result)   // C4: ANTES del finally-release — el follower long-pollea esto
      return result
    } finally {
      stopHeartbeat?.()
      // releaseLockIfOwner + lock_released_normal / redis_unavailable_fallback_failed (A16, verbatim del runner)
    }
    ```
    3. SPECIFIERS (Pitfall 8): interruption-system-v2 SOLO con `@/lib/agents/interruption-system-v2/*`. PROHIBIDO importar whatsapp/NDJSON/Supabase (D-05).
    4. Lo que NO entra al core (queda para los wrappers en Plan 10/11): VersionConflictError retry (B9), shape EngineOutput + agent_routed (B11), SandboxState/DebugTurn (C2/C3), contrato de error divergente (C5 — el core retorna el TurnResult neutral).
    5. Eliminar el stub `throw new Error('task 3 pending: ...')` — al cierre de esta tarea NO queda ningún placeholder.
    6. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes (el orquestador aún sin consumidores — el comportamiento del sistema no cambia en este plan). Commit: `feat(somnio-v4-consolidation 09): core/turn-orchestrator.ts — invoke + CKPT-6a/6b + send post-hoc + finally OQ1 (D-04)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "interrupted_at_ckpt_" src/lib/agents/somnio-v4/core/turn-orchestrator.ts && grep -c "onResultReady" src/lib/agents/somnio-v4/core/turn-orchestrator.ts && ! grep -q "task 3 pending" src/lib/agents/somnio-v4/core/turn-orchestrator.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "adapters.getPendingTemplates" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` ≥ 1 (capability gate B3, no flag booleano)
    - `grep -cE "if \(.*(isProd|isSandbox|env\.|NODE_ENV)" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 0 (cero gating por entorno)
    - El call a `onResultReady` aparece ANTES (línea menor) que `releaseLockIfOwner` en el archivo
    - `grep -c "carrySource" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` ≥ 2 (seed y output — A14)
    - `grep -cE "from '.*(whatsapp|engine-adapters|ndjson|supabase)" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 0
    - `grep -c "v4_messages_without_templates" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 1 (warning D-14 viaja al core)
    - `grep -c "task 3 pending" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` = 0 (stub de la Task 2 eliminado)
    - typecheck + SUITE_CMD verdes
  </acceptance_criteria>
  <done>El mecanismo único existe completo, codifica A1-A18 con capabilities B1-B8, y compila — listo para sus dos consumidores.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Lock distribuido Redis | El core conserva fencing-token (checkpoint-gate), release owner-checked (Lua) y heartbeat — sin debilitar ninguno |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-12 | E (Elevation) | release del lock sin owner-check al reorganizar el finally | mitigate | finally usa releaseLockIfOwner verbatim (A16); acceptance criteria verifica orden onResultReady→release |
| T-cons-13 | T (Tampering) | doble-respuesta si onResultReady falla y aborta antes del release | mitigate | onResultReady se invoca dentro del try externo; si lanza, el finally IGUAL libera el lock (liveness preservada) — envolver el call en try/catch con console.error como hace el engine hoy |
</threat_model>

<verification>
- `npx tsc --noEmit` + SUITE_CMD verdes (comportamiento sin cambios — core aún sin consumidores).
- `grep -rn "createAdminClient\|@supabase" src/lib/agents/somnio-v4/core/` = 0 (Regla 3).
- Gate D-11: diff = {core/types.ts, core/turn-orchestrator.ts}.
</verification>

<success_criteria>
- Contratos D-05 pinneados con capabilities opcionales (patrón optional-method, cero flags de entorno).
- Orquestador extraído del runner en dos pasos compilables (Task 2 shell con stub marcado, Task 3 completa y elimina el stub) con los 7 invariantes críticos: throw A1, orden Pitfall 7, dual carryState A14, post-hoc send-interrupt A12, continue-sin-persistir A15, finally A16, onResultReady-antes-de-release (OQ1).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/09-SUMMARY.md` (incluye: firma final de runTurn y TurnCoreAdapters — contrato para Planes 10/11).
</output>
