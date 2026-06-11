---
phase: somnio-v4-consolidation
date: 2026-06-10
depth: standard
files_reviewed: 23
status: issues-found
---

# Code Review — somnio-v4-consolidation

## Resumen

Se revisaron los 17 archivos fuente + 6 suites de tests del standalone (Waves 1-2: limpieza de código muerto + extracción del core de turno único `runTurn` con wrappers prod/sandbox). La arquitectura extraída es fiel al runner viejo en los mecanismos críticos verificados: orden drain→clearInterrupt, heartbeat stop antes del release en el `finally`, `onResultReady` antes del release (OQ1), dual carryState seed/output (Pitfall 6), orden CKPT-0-drain→seed→legacy-combine (Pitfall 7), y dropOwnEntry por entry_uuid. Los cambios de tests son exactamente los carve-outs sancionados (D-16 labels 14→11, Pitfall 13 escalation, A13 specifier de mocks) — cero asserts debilitados fuera de lo sancionado.

Sin embargo, la reescritura del engine sandbox como wrapper (Plan 11) **dropeó dos campos del `V4AgentInput`** que el engine viejo threadeaba (`simulate: true` y `systemEvent`), y la estructura catch-all del core **mató el retry de `VersionConflictError`** (B9) del wrapper prod. Las suites de caracterización no cubrían estos tres caminos (el agente está mockeado en las suites de paridad y no existe test del retry), por eso el gate D-09/D-10 no los detectó. v4 sigue DORMANT en prod, pero el sandbox está en uso activo (smokes) — el hallazgo Critical aplica HOY.

**Conteo:** 1 Critical, 2 High, 2 Medium, 5 Low.

## Hallazgos

### CR-01 [Critical] — El sandbox perdió `simulate: true`: el gate CRM ejecuta mutation-tools REALES contra la DB (D-22 invertido)

**Archivos:** `src/lib/agents/somnio-v4/core/turn-orchestrator.ts:158-180` (build de `V4AgentInput` sin `simulate`), `src/lib/agents/somnio-v4/engine-v4.ts` / `sandbox-adapters.ts` (no lo threadean a ningún lado).

**Problema:** El engine viejo (commit `1af5c49c`, línea ~283) pasaba `simulate: true` al `V4AgentInput`. El agente lo propaga a `runCrmGate` como `simulate: args.simulate ?? false` (`somnio-v4-agent.ts:607`), y `sub-loop/tools.ts:62` lo usa como seam: `ctx.simulate ? createSimulatedMutationTools() : createCrmMutationTools(...)`. Tras el rewrite del Plan 11, el core construye `v4Input` sin el campo → `undefined` → `false` → **una conversación de sandbox que dispare el gate CRM (acción CRM-set, shipping fields, category 'datos') ejecuta `createOrder`/`updateOrder`/`moveOrderToStage`/`addOrderNote`/`updateContact` reales** contra el workspace real (el sandbox corre con `workspaceId` de Somnio). Las suites de paridad no lo detectan porque mockean el agente completo; los smokes pueden no haber pisado el gate con mutación efectiva — pero el contrato D-22 está silenciosamente invertido y el riesgo es escritura real de CRM desde pruebas de sandbox.

**Fix:** Añadir `simulate?: boolean` a `TurnCoreInput` (o a `CoreSeedState`) y threadearlo en el core al `v4Input` (`simulate: input.simulate ?? false`). El wrapper sandbox (`engine-v4.ts`) lo setea `true`; el runner prod no lo setea (default false). Añadir un assert de caracterización: con el agente real o un spy sobre el input, verificar `agentInput.simulate === true` en el path sandbox.

### H-01 [High] — El retry de `VersionConflictError` (B9) es código muerto: el catch-all del core lo convierte a `kind:'error'` antes de que llegue al wrapper

**Archivos:** `src/lib/agents/somnio-v4/core/turn-orchestrator.ts:618-632`, `src/lib/agents/engine/v4-production-runner.ts:104-120`.

**Problema:** `commitTurn` (que llama `storage.updateMode` con optimistic locking, fuente del `VersionConflictError`) corre DENTRO de `loopBody()`. El catch del core solo discrimina `LostLockError`; todo lo demás se convierte a `{ kind: 'error', message, cause }` y `runTurn` retorna sin lanzar. El `catch` del wrapper (`if (error instanceof VersionConflictError && retryCount < 3) → retry`) **nunca se alcanza**: en el runner viejo (`185626db~1:1124`) ese error sí escapaba del loop al catch del runner y se reintentaba hasta 3 veces. Hoy un conflicto de versión en `updateMode` retorna `V4_ENGINE_ERROR` sin retry. Ningún test cubre el retry (grep `VersionConflict` en las suites = 0), por eso el gate no lo vio.

**Fix (mantiene el core agnóstico):** en el wrapper, inspeccionar el resultado:
```typescript
if (result.kind === 'error' && result.cause instanceof VersionConflictError
    && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
  return this.processMessage(input, retryCount + 1)
}
```
El campo `cause` ya existe en `TurnResult` precisamente para esto. (Alternativa: rethrow selectivo en el core, pero acoplaría el core a la capa de persistencia prod — contra D-05.) Nota: el re-entry tras `kind:'error'` ocurre con el lock YA liberado por el finally del core (a diferencia del runner viejo que retryaba bajo el mismo lock) — documentar o re-adquirir; `releaseLockIfOwner` owner-checked hace el doble release del segundo intento un no-op safe.

### H-02 [High] — `systemEvent` perdido en el rewrite del engine: la simulación de timers del sandbox está rota

**Archivos:** `src/lib/agents/somnio-v4/engine-v4.ts:134` (lo pasa a `createSandboxAdapters`), `src/lib/agents/somnio-v4/sandbox-adapters.ts:104` (lo destructura y NUNCA lo usa), `core/turn-orchestrator.ts:158-180` (build de `V4AgentInput` sin `systemEvent`).

**Problema:** El engine viejo pasaba `systemEvent: input.systemEvent` al agente (`1af5c49c:271`), que despacha a `processSystemEvent` cuando `type === 'timer_expired'` (`somnio-v4-agent.ts:131`). Tras el rewrite no hay ningún camino que lleve `systemEvent` del `V4EngineInput` al `V4AgentInput`: un turno de timer simulado en sandbox ahora entra por `processUserMessage` con `message` (probablemente vacío) → comprehension sobre texto vacío en vez del path determinista de timers (retomas simuladas D-21 del sandbox). Prod no se afecta (los timers reales van por `agent-timers-v4.ts` → `processMessage` directo, sin runner).

**Fix:** Threadear `systemEvent` como campo neutral de `TurnCoreInput` (es un struct `{ type, level }`, no tipo de canal — compatible con D-05) → el core lo incluye en `v4Input`. Eliminar de paso el parámetro muerto en `CreateSandboxAdaptersArgs` (ver L-01) o usarlo desde ahí vía `getSeedState`.

### M-01 [Medium] — El early-return de CKPT-6b Path B (pending vacío) cambió de shape: el wrapper expone el output DESCARTADO de msg1 (incl. `newMode`) → handoff fantasma posible

**Archivos:** `core/turn-orchestrator.ts:366-377`, `src/lib/agents/engine/v4-production-runner.ts:548-570` (mapResult), `webhook-processor.ts:1053` (consumidor).

**Problema:** En el runner viejo, el branch "Path B desde CKPT-6b con pending vacío" retornaba `{ success: true, messages: [], sessionId, messagesSent, tokensUsed }` — **sin** `newMode`, sin `orderCreated`, sin los messages de msg1 (cuyo output NO se envió ni se commiteó). El core nuevo retorna `kind:'completed'` con `output` = el output descartado de msg1, y `mapResult` del runner lo mapea completo: `newMode: output.newMode`, `messages: output.messages`, `orderCreated: output.crmResult?.success`. Si el output descartado traía `newMode==='handoff'`, `webhook-processor.ts:1053` ejecutaría el workflow de handoff real (mensaje al cliente + flujo) por un turno que el sistema decidió descartar y no persistir. Camino estrecho (requiere CKPT-6a pending-templates, prod-only), pero es exactamente el tipo de drift de contrato que la consolidación quería impedir.

**Fix:** Distinguir este return en `TurnResult` (p.ej. flag `outputDiscarded: true` en el branch de `turn-orchestrator.ts:369`, análogo a `wasInterruptedWithZeroSends`) y en `mapResult` del runner suprimir `newMode`/`orderCreated`/`messages` cuando esté seteado, restaurando el shape viejo.

### M-02 [Medium] — `LostLockError` tragado por catches genéricos en agente y sub-loop legacy: la defensa zombie se degrada (pre-existente; el comentario contradice el código)

**Archivos:** `src/lib/agents/somnio-v4/somnio-v4-agent.ts:1014-1036` (catch de `processUserMessage`), `src/lib/agents/somnio-v4/sub-loop/index.ts:780-810` dentro del try cuya catch está en `:811-868`.

**Problema:** (a) El comentario del agente (`:56-64`) afirma "LostLockError is re-thrown so V4ProductionRunner's outer catch can emit zombie_lambda_exit", pero el catch de `:1014` captura TODO y retorna `success:false` con `errorMessage` genérico — un lostLock en CKPT-1/2 (o CKPT-3/4/5 vía `runSubLoop`) no burbujea como `LostLockError`. (b) En el path legacy del sub-loop, el checkpoint combinado (`:781`) está DENTRO del try; su `LostLockError` se re-wrappea como `Error` genérico en `:861` perdiendo el tipo. En ambos casos el discriminador `instanceof LostLockError` del core no matchea → el turno continúa hasta que CKPT-6a/6b re-detecta el lostLock y lanza limpio (la defensa se auto-recupera tarde, con `at_step` incorrecto y trabajo zombie extra: el gate CRM del path (a) ya no corre porque el agente abortó, pero el path (b) ocurre post-mutación). Verificado pre-existente: las colocaciones son idénticas pre-fase (`b10ae95a~1`), y D-06 mandaba no moverlas — no es regresión de esta fase, pero la consolidación era el momento natural de corregirlo y el comentario engañoso queda en el código.

**Fix:** `if (error instanceof LostLockError) throw error` como primera línea de ambos catches (agente `:1014` y sub-loop `:811`), o mover el gate legacy fuera del try. Cero cambio de colocación de checkpoints (D-06 se respeta — solo se corrige la propagación del throw que el diseño original ya prometía).

### L-01 [Low] — Parámetro muerto `systemEvent` en `CreateSandboxAdaptersArgs`

**Archivo:** `src/lib/agents/somnio-v4/sandbox-adapters.ts:67,104`. Se declara y destructura pero no se usa — síntoma de H-02. Eliminar o cablear según el fix de H-02.

### L-02 [Low] — `drain.ts`: `pathBEmitExtra` se spreadea también en el emit de `path_a`

**Archivo:** `src/lib/agents/somnio-v4/core/drain.ts:41,59`. El doc del parámetro dice "extra payload del emit Path B", pero en mode `path_a` también se spreadea dentro de `msg_aborted_path_a_combined` (los callers dependen de esto para `templates_sent_before_abort: 0` — replica los sites viejos). Comportamiento correcto, contrato engañoso: renombrar a `emitExtra` y actualizar el doc, o documentar el doble uso.

### L-03 [Low] — Fallback fail-open de `filterOutbound` descarta los templates sintetizados

**Archivo:** `core/turn-orchestrator.ts:413-415`. Si `filterOutbound` lanza, el fallback resetea `templatesToSend = output.templates ?? []` — si los templates venían de la síntesis sandbox (`sandbox-msg:*`, `output.templates` vacío) se perderían y no se enviaría nada. Hoy inalcanzable (el sandbox no implementa `filterOutbound`), pero es una divergencia latente: el fallback debería ser un snapshot del `templatesToSend` pre-filtro.

### L-04 [Low] — `agent_routed` ahora se emite también desde el sandbox + `agentModule` hardcoded

**Archivo:** `core/turn-orchestrator.ts:212-219`. El engine viejo NO emitía `agent_routed` (grep en `1af5c49c` = 0); al vivir en el core, cada turno de sandbox lo emite ahora a `agent_observability_events`, lo que puede contaminar conteos/dashboards que asumen que `agent_routed` = tráfico prod. Además el payload hardcodea `agentModule: 'somnio-v4'` donde el runner viejo usaba `this.config.agentModule ?? 'somnio-v4'`. Opciones: marcar el origen en el payload (p.ej. `sandbox: true` cuando `onResultReady` está implementado) o mover el emit a `recordDebug`/capability prod.

### L-05 [Low] — Fixture de test conserva el campo borrado `shouldCreateOrder`

**Archivo:** `src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts:141`. `agentOut()` sigue seteando `shouldCreateOrder: false` (borrado de `V4AgentOutput` por D-13); el cast `as V4AgentOutput` oculta la excess property. Limpiar para que el fixture refleje el contrato real.

## Notas

- **Concurrencia/lock — verificado OK:** heartbeat start fuera del loop y stop en `finally` antes de `releaseLockIfOwner` (A2/A16); `onResultReady` dentro del try externo ANTES del release con try/catch propio (OQ1/T-cons-13); `readAndClearPending` → `clearInterrupt` SIEMPRE en ese orden (bug-fix 2026-05-28); fencing por `runCheckpointGate` en los 8 sites con `lostLockLabel` byte-exactos; carryState dual seed/output con unión dedup de 3 fuentes en el send-loop. No se encontró riesgo de doble-envío en los paths de interrupt.
- **Regla 3 / seguridad — verificado OK:** 0 `createAdminClient`/`@supabase` en `somnio-v4/core/`, `sandbox-adapters.ts` e `interruption-system-v2/` (el de `unknown-cases/capture.ts` y `agent-timers-v4.ts` es pre-existente y fuera del scope de la regla del módulo). `workspaceId` siempre viene del config/input del runner, nunca del payload del agente. La emisión nueva `v4_messages_without_templates` solo incluye preview de 120 chars de contenido outbound (sin PII inbound). Los `console.log` con contenido completo del mensaje del usuario (`Path A accumulation`, `rollback persisted`) son byte-copy del runner viejo — pre-existentes; considerar truncado en un standalone futuro.
- **Tests:** los únicos cambios fueron los carve-outs sancionados (D-16 en `observability.test.ts`/`e2e-scenarios.test.ts`, Pitfall 13 en `escalation.test.ts`, A13 specifier en `pathb`/`restart-loop`). `drain.test.ts` (7 tests aditivos) cubre bien las invariantes del helper. Gap de cobertura que explica CR-01/H-01/H-02: las suites de paridad mockean el agente completo (no asertan campos del `V4AgentInput` como `simulate`/`systemEvent`) y no existe test del retry de `VersionConflictError`. Recomendado añadir: (1) assert sobre el input del agente mockeado en la suite del engine, (2) test del retry B9 en la suite del runner.
- **Type honesty:** los any-casts en la frontera pending-templates (`pending.map((p: any))` en el core, `unknown[]` en el contrato) y el doble cast `as unknown as SandboxResultPayload` del engine son pragmáticos y están documentados; aceptables como están. Sugerencia futura: interface mínima `PendingTemplateLike` en `core/types.ts`.
- **No reportado (sancionado/documentado en SUMMARYs):** import de `LostLockError` desde el messaging-adapter (Plan 07/09 deviation), 12 drain-sites → 10 llamadas físicas (Plan 08), síntesis de templates `sandbox-msg:*` en el core (Plan 11 deviation 2), at_step `ckpt_6_pre_send_loop` sin sufijo `_main` (Plan 11 deviation 3), unión dedup carryState (Plan 11 deviation 4), `getSeedState(carry)` + `visionContext` (Plan 10 deviations 1-2), skip de `commitTurn` en el early-return CKPT-6b Path B (byte-equivalente al runner viejo — verificado contra `185626db~1`).

---

_Revisado: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
