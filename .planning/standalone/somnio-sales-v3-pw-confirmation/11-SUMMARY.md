---
phase: somnio-sales-v3-pw-confirmation
plan: 11
status: complete
wave: 5
completed: 2026-04-28
duration_minutes: 18
---

# Plan 11 SUMMARY — Wave 5 Orchestration (agent + engine wrapper + runner branch + webhook dispatch)

## Decision agregada

**GO** — 5 archivos editados/creados (4 tasks). typecheck limpio (0 errores TS en todo el repo, no solo en archivos tocados). 4 atomic commits, NO push (Wave 0..6 quedan locales hasta Plan 13 per orchestrator standalone parallel mode).

Esta plan es la integracion final del agente: une los building blocks de Plans 03-10 (config, constants, comprehension, state, transitions, guards, phase, response-track, sales-track, Inngest function, crm-writer-adapter) en un `processMessage` end-to-end + lo expone via V3ProductionRunner + lo dispatcha desde webhook-processor.

## Commits (4 atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `8381d05` | `feat(somnio-sales-v3-pw-confirmation): add somnio-pw-confirmation-agent.ts processMessage entry (orchestrate comprehension + guards + sales-track + crm-writer-adapter mutations + response-track + state persist)` |
| 2    | `de1a438` | `feat(somnio-sales-v3-pw-confirmation): add engine-pw-confirmation wrapper + export processMessage from index` |
| 3    | `1018d33` | `feat(somnio-sales-v3-pw-confirmation): wire V3ProductionRunner branch case 'somnio-pw-confirmation'` |
| 4    | `97788ec` | `feat(somnio-sales-v3-pw-confirmation): wire webhook-processor dispatch pw-confirmation/preload-and-invoke when router decides PW agent (D-05)` |

## Archivos creados / modificados

| Path | Status | LoC | Rol |
|------|--------|-----|-----|
| `src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts` | NEW | 617 | Entry point: `processMessage(input)` orquesta el flow de 11 pasos (state hydrate → CRM context read → degradation guard → init → comprehension → guards → sales-track → CRM mutaciones → response-track → derivePhase → persist → return v3-output) |
| `src/lib/agents/somnio-pw-confirmation/engine-pw-confirmation.ts` | NEW | 37 | Thin pass-through wrapper para sandbox/dev (delegate a `processMessage`); production via V3ProductionRunner directo |
| `src/lib/agents/somnio-pw-confirmation/index.ts` | MOD | +2/-1 | Agregada `export { processMessage } from './somnio-pw-confirmation-agent'` |
| `src/lib/agents/somnio-pw-confirmation/types.ts` | MOD | +146/-45 | Expandidos `V3AgentInput` / `V3AgentOutput` a v3-shape (clonado de recompra/types.ts) — el shape stub del Plan 03 NO era compatible con V3ProductionRunner |
| `src/lib/agents/engine/types.ts` | MOD | +1/-1 | Extendida union `EngineConfig.agentModule` con `'somnio-pw-confirmation'` |
| `src/lib/agents/engine/v3-production-runner.ts` | MOD | +11 | Nueva branch `else if (agentModule === 'somnio-pw-confirmation')` con dynamic import de `'../somnio-pw-confirmation'` |
| `src/lib/agents/production/webhook-processor.ts` | MOD | +128 | Nueva branch ANTES del recompra branch: cuando `routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'` → get/create session + emit observability + `await inngest.send({name:'pw-confirmation/preload-and-invoke',...})` + return success inmediato |

**Total: 7 archivos (3 NEW + 4 MOD), ~942 LoC netas.**

## Diagrama del flow end-to-end

```
┌───────────────────────────────────────────────────────────────────┐
│ Cliente WhatsApp → Onurix webhook → webhook-processor.ts          │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼  routeAgent (lifecycle-router)
┌───────────────────────────────────────────────────────────────────┐
│ routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'        │
│ (Task 4 branch — D-05 BLOQUEANTE — NO inline runner invoke)       │
│                                                                    │
│   1. Pre-warm import('../somnio-pw-confirmation') anti-B-001       │
│   2. SessionManager: get-or-create con agent_id='somnio-sales-     │
│      v3-pw-confirmation' + initialMode='awaiting_confirmation'     │
│   3. Emit pipeline_decision:pw_confirmation_routed                 │
│   4. AWAIT inngest.send({name:'pw-confirmation/preload-and-       │
│      invoke', data:{sessionId,...,invoker:'somnio-sales-v3-pw-    │
│      confirmation'}})                                              │
│   5. Emit pipeline_decision:crm_reader_dispatched                  │
│   6. Mark inbound messages processed_by_agent                      │
│   7. RETURN {success:true} — webhook responde 200 (<5s SLA)        │
└───────────────────────────────────────────────────────────────────┘
                              │ (Inngest event dispatched)
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ Inngest function 'pw-confirmation-preload-and-invoke' (Plan 09)   │
│   id: 'pw-confirmation-preload-and-invoke'                         │
│   retries: 1                                                       │
│   concurrency: [{key:'event.data.sessionId', limit:1}]             │
│                                                                    │
│   STEP 1 — call-reader-and-persist (BLOQUEANTE, AbortController 25s)│
│     processReaderMessage({invoker, ...}) → CRM lookup              │
│     → updateCapturedData(_v3:crm_context, _v3:crm_context_status, │
│        _v3:active_order)                                           │
│     Error path: status='error' + active_order='{}'                 │
│                                                                    │
│   STEP 2 — invoke-agent                                            │
│     V3ProductionRunner({agentModule:'somnio-pw-confirmation'})     │
│       .processMessage({sessionId, message, ...})                   │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ V3ProductionRunner.processMessage (Task 3 branch)                 │
│   Loads session + datos_capturados (con _v3:crm_context_*)         │
│   Branch: agentModule === 'somnio-pw-confirmation'                 │
│     → const {processMessage} = await import('../somnio-pw-        │
│        confirmation')                                              │
│     → output = await processMessage(v3Input as any)                │
│   Persiste output.datosCapturados (state serializado), envia       │
│   output.templates via WhatsApp adapter, marca templates_enviados, │
│   emite pipeline_decision:agent_routed.                            │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ processMessage (Task 1) — 11 pasos                                │
│   1. deserializeState(input.datosCapturados)                       │
│   2. readCrmContext: lee _v3:crm_context, _v3:crm_context_status,  │
│      _v3:active_order del snapshot (preloaded BLOQUEANTE — sin     │
│      polling, a diferencia de recompra)                            │
│   3. Si status='error' → emit fallback handoff + persist + return  │
│      (degradacion graceful per CONTEXT.md D-05)                    │
│   4. Si phase='nuevo' → createInitialState({activeOrder, contact:  │
│      null, crmContextStatus}) — D-26: phase='awaiting_confirmation'│
│   5. analyzeMessage (Plan 05 Haiku) — never throws                 │
│   6. checkGuards R0/R1 — si blocked: accion='handoff' + persist   │
│      + return                                                      │
│   7. resolveSalesTrack (Plan 08 — pre-merge analysis, delegate     │
│      transitions, post-mutate counters in-place)                   │
│   8. CRM mutaciones via crm-writer-adapter (Plan 10):              │
│      - confirmar_compra → moveOrderToConfirmado                    │
│      - actualizar_direccion → updateOrderShipping (3 fields)       │
│      - mover_a_falta_confirmar → moveOrderToFaltaConfirmar         │
│      Si stage_changed_concurrently (D-06) → handoff override       │
│   9. resolveResponseTrack (Plan 07 — templates con extraContext)   │
│  10. Push accion + derivePhase + persist via SessionManager        │
│  11. buildOutput → V3AgentOutput v3-compatible                     │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ Cliente recibe templates (confirmacion_orden_*, agendar_pregunta, │
│ pedir_datos_post_compra, etc.) via WhatsApp                       │
└───────────────────────────────────────────────────────────────────┘
```

## D-locks implementados / re-validados

- **D-05 BLOQUEANTE (Plan 11 patron NUEVO):** webhook-processor NO invoca runner inline; solo dispatcha `pw-confirmation/preload-and-invoke` event. La Inngest function 2-step corre reader BLOQUEANTE step 1 + invoca agente step 2. processMessage lee `_v3:crm_context_*` directo del snapshot (sin polling — la garantia BLOQUEANTE elimina la race que recompra mitiga via poll).
- **D-06 stage_changed_concurrently (cross-agent contract crm-stage-integrity):** el adapter (Plan 10) propaga el error code verbatim. processMessage step 8 lo captura → override `accion='handoff'` + `state.requires_human=true` + emit observability `pipeline_decision:stage_changed_concurrently_caught`. NO retry automatico (per agent-scope.md §Somnio Sales V3 PW).
- **D-13 V1 editar_items:** la transition entry #10 (Plan 06) emite `accion='handoff'` directo; el engine PW Plan 11 lo orquesta sin invocar adapter (no hay tool de edit en V1 — diferido a V1.1). Mismo handoff path que pedir_humano.
- **D-15 catalog independiente:** processMessage delega TODO el template lookup a `resolveResponseTrack` (Plan 07) que usa `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3-pw-confirmation'` (Plan 04 constants). Sin compartir catalogo con sales-v3 / recompra.
- **D-18 PW NO crea pedidos:** processMessage SIEMPRE retorna `shouldCreateOrder=false` y `packSeleccionado=null` (V3AgentOutput v3-shape). El runner Plan 11 Task 3 branch NO llama `orders.createOrder` cuando agentModule='somnio-pw-confirmation' — tampoco lo hace cuando recompra/v3 retornan shouldCreateOrder=false (la condicion at v3-production-runner.ts:465 es estricta).
- **D-19 workspace isolation:** session creada con `workspaceId` (parametro requerido del SessionManager). El adapter Plan 10 valida workspace en cada operacion (proposeAction → confirmAction → domain). Sin cross-workspace leak.
- **D-21 trigger c (CRM error) + d (pedir_humano):** ambos triggers manejados:
  - trigger c (mutation failure) en step 8 → override accion='handoff' + requires_human=true.
  - trigger d (pedir_humano) en step 6 (R1 guard) → override accion='handoff' + requires_human=true antes de llegar a sales-track.
- **D-25 PURE state machine:** processMessage tiene I/O solo en (a) comprehension Haiku (Plan 05), (b) crm-writer-adapter (Plan 10 → two-step → domain layer per Regla 3), (c) SessionManager.updateCapturedData (persistencia). CERO `createAdminClient` directo en `src/lib/agents/somnio-pw-confirmation/**` (verificable con grep — solo el adapter Plan 10 toca DB y solo via two-step).
- **D-26 estado inicial post-reader:** `createInitialState({activeOrder, contact:null, crmContextStatus:'ok'})` setea `phase='awaiting_confirmation'` cuando hay pedido — el primer "si" del cliente cuenta como confirmacion (entry #1 de TRANSITIONS lo guard via `state.phase IN INITIAL_AWAITING_STATES`, NO via `messages.template_name`).

## Decisiones de implementacion (Open issues resueltos)

### types.ts expandido (Rule 3 — blocking issue)

**Problema:** Plan 03 shipped tipos stub (`V3AgentInput { sessionId, conversationId, contactId, message, workspaceId, history, phoneNumber?, messageTimestamp? }`). Pero V3ProductionRunner construye `v3Input` con shape diferente (somnio-v3/types.ts:136-159 — `message, history, currentMode, intentsVistos, templatesEnviados, datosCapturados, packSeleccionado, accionesEjecutadas, turnNumber, workspaceId, sessionId, systemEvent`). El runner llama `processMessage(v3Input as any)` — el cast oculta el mismatch en typecheck pero el runtime fallaria.

**Fix (deviation Rule 3):** Expandi `types.ts` clonando verbatim el shape de `somnio-recompra/types.ts:133-211` (V3AgentInput + V3AgentOutput). El processMessage del PW lee los campos del v3-shape (message, history, datosCapturados, sessionId, workspaceId — los unicos que necesita). Devuelve V3AgentOutput v3-shape con campos PW-specific (siempre `shouldCreateOrder=false`, `packSeleccionado=null`, `timerSignals=[]`). Ahora el runner integration funciona end-to-end.

### EngineConfig.agentModule extension (Plan 09 SUMMARY explicito)

Plan 09 SUMMARY documento literalmente: *"CRITICO: extender `EngineConfig.agentModule` union con `'somnio-pw-confirmation'` en `src/lib/agents/engine/types.ts`. Sin esto, el cast `as unknown as 'somnio-v3'` en step 2 hace que el runner caiga al else default `somnio-v3` y procese el mensaje con el agente equivocado."* Implementado en Task 3.

### messageId pasado vacio (defensa Plan 09 contract)

`PwConfirmationPreloadAndInvokeEvents.data.messageId: string` requerido por events.ts. Pero `ProcessMessageInput` (webhook-processor) NO carga `messageId` (ya documentado en webhook-processor.ts:239-241 para el routing path). Pasamos string vacio. La Inngest function lo echo-back en el result (audit purpose) — funcional sin valor real.

### Session creation upstream del dispatch (D-05 contract)

El Inngest function step 2 necesita `sessionId` para que el runner cargue session_state. Recompra branch crea la session DENTRO del runner (linea 411 webhook-processor `runner.processMessage({sessionId: ''})` — el runner llama `getOrCreateSession`). Para PW, como el runner no se invoca inline, debemos crear la session ANTES del dispatch para tener un sessionId real para el evento. Implementado en Task 4 branch via `SessionManager.getSessionByConversation` + `createSession` (idempotent — recovers de 23505 race).

### newMode mapping (Task 1 buildOutput)

V3ProductionRunner persiste `output.newMode` y dispara handoff path cuando `output.newMode === 'handoff'` (linea 457). Mapeo del PW phase canonico → v3-engine newMode:
- `requires_human === true` → `'handoff'` (siempre tiene precedencia — el runner llama `storage.handoff(...)` que cierra la session)
- `confirmed` → `'orden_creada'` (mismo nombre que recompra usa para cliente recompra completed)
- `closed` → `'cerrado'`
- `capturing_data | awaiting_address | awaiting_schedule_decision | waiting_decision` → mismo nombre (los runner persiste como string libre)
- Default → `'conversacion'`

Esta es la unica concesion: `newMode` es string libre, asi que pasar literales PW-specific como `'capturing_data'` no rompe persistencia, solo se persiste en `agent_sessions.current_mode`.

## Imports — boundary check

| Archivo | Imports |
|---------|---------|
| `somnio-pw-confirmation-agent.ts` | `@/lib/audit/logger`, `@/lib/observability`, `./comprehension`, `./guards`, `./sales-track`, `./response-track`, `./state`, `./phase`, `./constants`, `./types`, `@/lib/agents/engine-adapters/production/crm-writer-adapter`. Dynamic import: `@/lib/agents/session-manager` (in `persistState` helper). |
| `engine-pw-confirmation.ts` | `./somnio-pw-confirmation-agent`, `./types` |
| `index.ts` | `../registry`, `./config`, `./somnio-pw-confirmation-agent` (re-export). |

ZERO `createAdminClient` en cualquiera de los 3 archivos del agente. Cero imports a `@/lib/domain/*` directos. Toda mutacion CRM via crm-writer-adapter (Plan 10) → two-step → domain (Regla 3 cumplida — agent-scope.md validacion).

## Observability events emitidos

Por turn:
- `pipeline_decision:pw_confirmation_routed` (webhook-processor branch — al routear)
- `pipeline_decision:crm_reader_dispatched` (webhook-processor branch — al inngest.send)
- `pipeline_decision:agent_routed` (V3ProductionRunner — al delegar a processMessage)
- `comprehension:result` (Plan 05 — Haiku call result)
- `pipeline_decision:sales_track_result` (Plan 08 sales-track)
- `template_selection:block_composed` o `template_selection:empty_result` (Plan 07 response-track)
- `pipeline_decision:pw_confirmation_turn_complete` (NEW Plan 11 — fin de processMessage)

Por escalation:
- `pipeline_decision:crm_context_missing_proceeding_blind` (Plan 11 — degradation graceful en step 3)
- `pipeline_decision:handoff_triggered` (Plan 11 — guard R0/R1 en step 6)
- `pipeline_decision:stage_changed_concurrently_caught` (Plan 11 — D-06 trigger c en step 8; tambien lo emite el adapter Plan 10)

Por mutacion CRM (del adapter Plan 10):
- `pipeline_decision:crm_writer_propose_emitted`
- `pipeline_decision:crm_writer_confirm_emitted`

## typecheck output

```bash
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
0

$ npx tsc --noEmit 2>&1 | grep -E "(somnio-pw-confirmation|webhook-processor|v3-production-runner|engine/types)" | wc -l
0
```

**0 errores TS** en todo el repo (no solo en archivos tocados). Todos los grep verify del plan pasan al primer intento (modulo 1 fix de type `intentReasoning?: string | null` + `reasoning ?? undefined` en buildOutput — caught and fixed antes de commit Task 1).

## Verify checklist (acceptance_criteria del Plan 11)

### Task 1 (15 grep checks + typecheck)
- [x] file exists
- [x] export async function processMessage
- [x] deserializeState / createInitialState
- [x] analyzeMessage
- [x] checkGuards
- [x] resolveSalesTrack
- [x] resolveResponseTrack
- [x] moveOrderToConfirmado
- [x] updateOrderShipping
- [x] moveOrderToFaltaConfirmar
- [x] stage_changed_concurrently
- [x] _v3:crm_context_status
- [x] serializeState
- [x] typecheck OK
- [x] commit hash matches

### Task 2 (4 checks)
- [x] engine-pw-confirmation.ts existe
- [x] index.ts contiene `processMessage`
- [x] index.ts re-export literal `export { processMessage } from './somnio-pw-confirmation-agent'`
- [x] typecheck OK

### Task 3 (3 checks)
- [x] v3-production-runner.ts contiene `this.config.agentModule === 'somnio-pw-confirmation'`
- [x] v3-production-runner.ts contiene `import('../somnio-pw-confirmation')`
- [x] typecheck OK

### Task 4 (7 checks)
- [x] webhook-processor.ts contiene `routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'`
- [x] webhook-processor.ts contiene event name literal `'pw-confirmation/preload-and-invoke'`
- [x] webhook-processor.ts contiene observability label `pw_confirmation_routed`
- [x] webhook-processor.ts contiene observability label `crm_reader_dispatched`
- [x] inngest.send invocado con `await` (NO fire-and-forget)
- [x] typecheck OK
- [x] commit hash matches

## Desviaciones del plan

1. **types.ts expandido (Rule 3 — blocking issue):** Plan 03 shipped tipos stub no compatibles con V3ProductionRunner. Expandi a v3-shape verbatim de recompra/types.ts. Documentado in-file y en este SUMMARY §"types.ts expandido".

2. **engine/types.ts agentModule union extension:** No estaba listado explicitamente en files_modified del Plan 11, pero Plan 09 SUMMARY lo flagged como CRITICO. Implementado en Task 3 commit. Sin esto el cast en Plan 09 (`as unknown as 'somnio-v3'`) hacia que el runner cayera al default branch.

3. **types.ts en commit de Task 1:** types.ts es prerequisito del agent file (que importa de `./types`). Decidi commit-earlier en mismo commit que Task 1 — el commit message lo documenta explicito (`Tipos expandidos en types.ts a v3-shape...`). Alternativa: commit separado pre-Task-1 — pero seria un 5to commit que el plan no lista.

4. **buildOutput helper interno:** el plan Task 1 esqueleto retorna `{messages, intent, newPhase, acciones, templateIdsSent}` (PW shape stub del Plan 03). Implemente buildOutput que retorna V3AgentOutput v3-compatible — necesario para que V3ProductionRunner pueda hacer state save / send templates / addTurn / handoff. Documentado in-file y en este SUMMARY §"newMode mapping".

5. **persistState helper interno:** el plan dice `await sm.updateCapturedData(...)`. Lo wrappee en `persistState(sessionId, state)` con try-catch (best-effort) porque el runner ALSO persiste state (linea 406 `storage.saveState`). Si nuestra persistencia falla, la del runner cubre — fail-open en lugar de fail-closed.

6. **Webhook-processor branch fail-closed:** si `inngest.send` o `SessionManager.createSession` throwa, el branch retorna `{success: false, error: {code: 'PW_CONFIRMATION_DISPATCH_FAILED'}}` sin caer al recompra branch. Defendiendo el contract: si el router decidio PW pero no podemos dispatcharlo, NO responder con un agente equivocado. Plan no especificaba pero es deduccion necesaria (Rule 2 — auto-add critical functionality).

7. **Mark inbound messages processed (PW dispatch path):** clonado del recompra branch (linea 551). El plan no lo menciona pero sin esto el siguiente Inngest cron retry-ria el mismo mensaje (loop). Rule 2 — critical correctness.

## Threat surface scan

Sin nuevos surfaces — el agente PW reusa:
- Endpoints HTTP existentes (webhook-processor.ts ya en uso por sales-v3, recompra, godentist).
- Inngest function ya registrada en Plan 09 (`pw-confirmation-preload-and-invoke`).
- Domain layer (via crm-writer two-step Plan 10 — auditado en Plan 44 + crm-stage-integrity).
- SessionManager + agent_sessions table (esquema existente, agent_id es columna existente).

No introduce nuevos network endpoints, paths de auth, schema changes, o trust boundaries.

## Implicancias para Plans subsiguientes

### Plan 12 (tests)

processMessage se puede testear con mocks de:
- `analyzeMessage` (Plan 05) — return `{intent, confidence, datos_extraidos, notas}` fixture.
- `resolveSalesTrack` (Plan 08) — pero este NO se mockea: es PURE, mejor usar el real.
- `resolveResponseTrack` (Plan 07) — mock `TemplateManager.getTemplatesForIntents` retornando selectionMap fixture.
- `moveOrderToConfirmado` / `updateOrderShipping` / `moveOrderToFaltaConfirmar` — mock retornando `{status:'executed', actionId:'fixture-uuid'}` o `{status:'failed', error:{code:'stage_changed_concurrently'}}` para D-06 path.
- `SessionManager.updateCapturedData` — mock vi.fn() para assert llamada con shape correcto.

Test cases minimos:
1. **Happy path confirmar_compra:** state phase='awaiting_confirmation' + intent='confirmar_pedido' + shippingComplete=true → moveOrderToConfirmado called + accion='confirmar_compra' + newPhase='confirmed' + newMode='orden_creada'.
2. **D-06 stage_changed_concurrently:** moveOrderToConfirmado returns failed → accion overridden a 'handoff' + state.requires_human=true + newMode='handoff'.
3. **D-05 reader error degradation:** input.datosCapturados['_v3:crm_context_status']='error' → return early con state.requires_human=true + intent='fallback'.
4. **D-21 R1 guard:** intent='pedir_humano' → return early (NO sales-track invocation) con accion='handoff'.
5. **R0 low confidence:** confidence=0.3 + intent='confirmar_pedido' → blocked → return handoff.
6. **D-12 actualizar_direccion:** intent='cambiar_direccion' + datos provided → updateOrderShipping called con 3 fields + newPhase='awaiting_address'.
7. **D-14 mover_a_falta_confirmar:** intent='esperar' → moveOrderToFaltaConfirmar called + newPhase='waiting_decision'.
8. **shouldCreateOrder always false:** assert output.shouldCreateOrder===false en todos los casos (D-18).
9. **timerSignals always empty:** assert output.timerSignals.length===0.
10. **packSeleccionado always null:** assert output.packSeleccionado===null.

### Plan 13 (push + smoke test prod)

- Push de Plans 03-12 commits a main.
- Inngest Cloud auto-registra la function `pw-confirmation-preload-and-invoke` (route.ts:67 spread ya hecho en Plan 09).
- Activacion: el usuario crea regla en `routing_rules` (UI `/agentes/routing/editor`) seleccionando `agent_id='somnio-sales-v3-pw-confirmation'` con condition (e.g. `activeOrderStageRaw IN ['NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR']`). Sin regla = sin trafico (Regla 6 satisfecha sin feature flag — D-02).
- Smoke test: cliente Somnio en stage NUEVO PAG WEB envia "si" → assert (a) inngest event dispatched, (b) reader corre + persiste _v3:crm_context_*, (c) processMessage corre, (d) moveOrderToConfirmado invocado, (e) cliente recibe confirmacion_orden_same_day o _transportadora.

## Self-Check

```bash
=== Files exist ===
FOUND: src/lib/agents/somnio-pw-confirmation/somnio-pw-confirmation-agent.ts (617 LoC)
FOUND: src/lib/agents/somnio-pw-confirmation/engine-pw-confirmation.ts (37 LoC)
FOUND: src/lib/agents/somnio-pw-confirmation/index.ts (modified, 28 LoC)
FOUND: src/lib/agents/somnio-pw-confirmation/types.ts (modified, 191 LoC)
FOUND: src/lib/agents/engine/types.ts (modified, +1 line)
FOUND: src/lib/agents/engine/v3-production-runner.ts (modified, +11 lines)
FOUND: src/lib/agents/production/webhook-processor.ts (modified, +128 lines)

=== Commits exist ===
FOUND: 8381d05 (Task 1 — agent processMessage)
FOUND: de1a438 (Task 2 — engine wrapper + index re-export)
FOUND: 1018d33 (Task 3 — V3ProductionRunner branch)
FOUND: 97788ec (Task 4 — webhook-processor dispatch branch)
Branch: worktree-agent-a20f4dc5d7c55efdf
Base: e6af40b (Plan 10 SUMMARY commit)

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors globales)
```

- [x] 7 archivos editados/creados (3 NEW + 4 MOD).
- [x] processMessage entry point con flow de 11 pasos implementado.
- [x] Lectura BLOQUEANTE de _v3:crm_context (sin polling — D-05).
- [x] Degradacion graceful si crm_context_status='error'.
- [x] Mutaciones CRM via adapter (3 operaciones — D-10, D-12, D-14).
- [x] stage_changed_concurrently → handoff (D-06).
- [x] R0/R1 guards → handoff (D-21).
- [x] Persiste state via SessionManager.updateCapturedData.
- [x] V3ProductionRunner branch agregada con dynamic import.
- [x] EngineConfig.agentModule union extendida.
- [x] Webhook-processor dispatch branch agregada (await inngest.send, NO fire-and-forget).
- [x] Webhook responde 200 inmediato (Vercel <5s SLA).
- [x] Fail-closed si dispatch falla (no cae a recompra branch).
- [x] Mark inbound messages processed (anti retry-loop).
- [x] typecheck OK (0 errores TS introducidos en todo el repo).
- [x] 4 commits atomicos, NO pusheados.
- [x] ZERO `createAdminClient` en archivos del agente (Regla 3 cumplida).

**Self-Check: PASSED**
