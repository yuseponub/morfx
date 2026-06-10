# Standalone: somnio-v4-consolidation — Research

**Researched:** 2026-06-10
**Domain:** Refactor interno TypeScript (extract-core + adapters) sobre el agente somnio-sales-v4 — cero librerías nuevas
**Confidence:** HIGH (investigación 95% interna: lectura de primera mano de los 2 archivos fuente completos + greps verificados en esta sesión)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Alcance y timing**

- **D-01: Scope = Wave 1 + Wave 2.** Wave 1 = limpieza de código muerto + docs (M-1..M-8). Wave 2 = core de turno unificado prod↔sandbox (S-5), que INCLUYE la factorización del boilerplate de checkpoints (helper + tabla declarativa de colocaciones) porque hacerla después duplicaría trabajo. El split de `V4AgentOutput` contract/debug y la superficie de escalación única (W3) quedan DIFERIDOS.
- **D-02: Timing = ANTES del flip productivo del RAG (Plan 08 de somnio-v4-rag-generative).** Racional: v4 DORMANT = riesgo cero en prod durante el refactor, y los smokes obligatorios del flip se corren UNA sola vez sobre el código ya consolidado. **Condición de revisita:** si el usuario necesita flipear urgente por negocio, se invierte el orden y la consolidación pasa a post-flip (en ese caso Wave 2 requiere validación más estricta por estar v4 vivo).

**Diseño del core unificado (Wave 2)**

- **D-03: Ubicación `src/lib/agents/somnio-v4/core/`** (junto al agente, NO en `engine/`). El mecanismo es específico de v4 hoy; si otro agente lo adopta en el futuro, se promueve a shared en su propio standalone. Archivos sugeridos: `turn-orchestrator.ts` (restart loop + Path A/B), `restart-context.ts` (struct de acumuladores: effectiveMessage, totalTokens, carryState, accumulatedSentContents), `drain.ts` (`drainPendingAndCombine()` — consolida los 5 drain-sites), `checkpoint-gate.ts` (helper + tabla de colocaciones). Nombres finales a discreción del planner.
- **D-04: Dirección de absorción: el core se EXTRAE del runner de producción** (`v4-production-runner.ts` es la fuente de verdad — es el lado más completo: CKPT-6a pending-templates cross-turn, crash-recovery `_v3:pendingUserMessage`, no-repetición). `engine-v4.ts` se REESCRIBE para consumir el core. El runner queda como wrapper delgado: threading de lock fields desde EngineInput + adapters de producción.
- **D-05: Interfaz de adapters mínima y agnóstica.** El core NO importa nada de WhatsApp ni de NDJSON. Adapters: envío (con hook per-unidad para CKPT-7.N), persistencia de estado/sesión, emisión debug/stream, timing. Producción inyecta V4MessagingAdapter+SessionManager+Supabase; sandbox inyecta onMessage NDJSON+memoria+simulateProdTimingMs.
- **D-06: Checkpoints — factorizar boilerplate, NO mover colocaciones.** Los 8 CKPT mantienen exactamente su posición y semántica actual. Lo que cambia: el patrón repetido de ~25 líneas (skip-gate por lock fields + lostLock throw + interrupted return con discriminator) se extrae a un helper único; las colocaciones del core (CKPT-0/6a/6b) se expresan como tabla declarativa. CKPT-1/2 (agente) y CKPT-3/4/5 (sub-loop) se quedan donde están, usando el helper.
- **D-07: INTERRUPTION-PARITY.md se reduce y re-titula.** Deja de ser contrato de paridad de mecanismo (el mecanismo pasa a ser código único) y documenta SOLO las diferencias legítimas de adapters (envío real vs stream, DB vs memoria, timing real vs simulado, CKPT-6a que el sandbox no necesita).

**Política de re-validación**

- **D-08: Baseline lock ANTES de tocar nada** (patrón Wave 0): correr suite completa v4 + Smoke A + Smoke B y guardar resultados en `BASELINE.md` del standalone. Todo gate posterior compara contra ese baseline.
- **D-09: Gate por commit:** typecheck + suite v4 completa (~209 tests) verde. Los tests NO se modifican en sus asserts de comportamiento — solo se permiten cambios de imports/setup/mocks por la reorganización de archivos. Un assert que necesite cambiar = señal de regresión, parar y evaluar.
- **D-10: Gate de fin de wave (W1 y W2):** re-correr Smoke A (17 casos) y Smoke B (10, con sus SKIP documentados). Criterio de equivalencia: mismos PASS/FAIL que el baseline 2026-06-05 (Smoke A 15/17, Smoke B 1/3 + 7 SKIP), mismos templates deterministas emitidos, mismos outcomes del sub-loop (generated/no_match/handoff) y mismas decisiones de gates. NO se exige byte-equality del texto generativo (LLM no determinista por diseño).
- **D-11: Gate Regla 6:** los grep-gates del CLAUDE.md + los 3 tests dedicados de no-regresión v3 siguen verdes; el diff fuera de `somnio-v4/`, `engine/v4-production-runner.ts`, `engine-adapters/production/v4-messaging-adapter.ts`, `interruption-system-v2/` y docs debe ser CERO.

**Código muerto y desconexiones (Wave 1)**

- **D-12 (M-1):** Borrar el plumbing `isCrmMutation`/`casReject`: params siempre-false en `slots.ts:118/152` + `somnio-v4-agent.ts:414-415`, ramas inalcanzables en `escalation.ts:54-56`, y reducir el union `V4AgentOutput.subLoopReason` (:1224) a los valores que el path del agente puede producir. **OJO:** el `SubLoopReason` del sub-loop (`output-schema.ts`) NO se toca — `crm_mutation`/`cas_reject` siguen vivos allí porque el crm-gate los usa vía `runCrmSubLoop`.
- **D-13 (M-2):** Borrar `shouldCreateOrder` (y `orderData` si existe) de `V4AgentOutput` + sus ~10 asignaciones. Nadie lo consume desde el big-bang D-06 del crm-subloop (verificado: 1 hit en runner y es comentario).
- **D-14 (M-3):** Borrar el branch fallback del runner (`:949-961`, envío de `output.messages` sin templates — el adapter lo dropea y desde el pseudo-template `rag:*` ningún caso llega ahí). Reemplazar por un warning a observability si `output.messages.length > 0 && !output.templates` — nunca debería ocurrir; si ocurre queremos verlo, no un envío silenciosamente fallido. Esto mata también el bug G-3 (log que registra texto no enviado).
- **D-15 (M-4, condicional):** Campo `confidence` 0-100 legacy de comprehension: QUITAR del schema y de `intentInfo` SI el grep de consumidores muestra ≤2 usos fuera del agente (mapear a `intent_confidence*100` donde haga falta). Si hay más consumidores (dashboards/queries de observability), degradar a deprecación con comentario y diferir el borrado. El executor resuelve con el grep.
- **D-16 (M-5):** Labels de observabilidad sin NINGÚN emisor en código (`follower_woke`, `lock_force_acquired_after_ttl_expiry`, y `heartbeat_renewed` si el grep confirma que no tiene emisor condicional): borrar del union `LockEventLabel` y de los gates de validación del CLAUDE.md (actualizar el conteo de 14). El union tipado debe reflejar la realidad; re-agregarlos en el futuro es barato.
- **D-17 (M-6 + M-7):** Rename `runLegacySubLoop` → `runCrmMutationSubLoop` (está VIVO — es el motor del crm-gate; "legacy" invita a borrarlo por error). Sincronizar docs: `ARCHITECTURE.md` (quitar `invocations.ts` que ya no existe, cerrar G-1/G-2/G-3, actualizar tabla de archivos y pipeline §2.0 al flujo real post-híbrido con slot resolver y crm-gate), `INTERRUPTION-PARITY.md §6` (caveat RAG-send obsoleto), y la corrección en `AUDIT-2026-06-10.md`.
- **D-18 (M-8):** CONSERVAR el crash-recovery `_v3:pendingUserMessage` del runner (es funcional — edge de interrupt con pending vacío y 0 sends). Añadir comentario: por qué existe, y que es borrable cuando v3 muera (D-38).

### Claude's Discretion

- Nombres finales de archivos/funciones del core (D-03 da sugerencias, no mandatos).
- Orden interno de tareas dentro de cada wave y división en planes.
- Cómo estructurar los tests del core unificado (mover los de engine-v4-lock/restart-loop vs duplicar temporalmente durante la transición).
- Detalle del warning de D-14 (label del evento, payload).

### Deferred Ideas (OUT OF SCOPE)

- Calibración del threshold de confianza (ICLR 2025 "Trust or Escalate") — post-flip.
- Split `V4AgentOutput` contract/debug — W3 diferido.
- Superficie de escalación única al sub-loop — W3 diferido.
- Borrado del runner v3 + Phase 31 polling (S-7) — cuando v3 muera.
- Seed WDK: re-evaluar Vercel Workflows cuando vercel/workflow#301 shippee.
- Promover el core a shared para otros agentes — standalone por agente.
</user_constraints>

<phase_requirements>
## Phase Requirements

No hay REQ-IDs formales — los mandatos son D-01..D-18 del CONTEXT.md. Mapa decisión → soporte de research:

| Decisión | Soporte de research |
|----|---------------------|
| D-03/D-04/D-05 | §Divergence Map (artefacto principal) + §Architecture Patterns (interfaz de adapters derivada del patrón optional-method que el runner YA usa) |
| D-06 | §Code Examples (boilerplate real de CKPT-1 con file:line + diseño del helper) |
| D-08/D-09/D-10 | §Validation Architecture + Pitfall 11 (smoke files escriben sobre los baselines — snapshot primero) + Pitfall 5 (carve-out de asserts sancionado por D-16) |
| D-11 | §Common Pitfalls — Regla 6 leak vectors (P2: `agent-timers-v4.ts` falta en la lista de archivos permitidos) |
| D-12 | Verificado con grep: call sites exactos confirmados + DESCUBRIMIENTO: `mapOutcomeToAgentOutput` entera está muerta (P3) |
| D-13 | Verificado con grep: el claim "nadie lo consume" es INCORRECTO — 3 consumidores reales (P1); análisis de alcanzabilidad incluido |
| D-14 | Verificado: `messaging.ts:169-172` dropea sin templates; runner `:949-961` + `:960` (G-3) confirmados |
| D-15 | **Grep resuelto: >2 consumidores → DEPRECAR, no borrar** (guards.ts R0 es load-bearing — P4) |
| D-16 | Grep resuelto: los 3 labels tienen CERO emisores; 11 labels quedan; tests acoplados identificados (P5) |
| D-17 | Verificado: `runLegacySubLoop` es interno a `sub-loop/index.ts` (+ `runLegacySubLoopRaw` y wrapper en :953/:980); cero refs en tests |
| D-18 | Verificado: sitios `_v3:pendingUserMessage` en runner :281-287, :916-924, :989-1007; ordering constraint documentado (P7) |
</phase_requirements>

## Summary

Este standalone es un refactor de equivalencia conductual, no un feature. La investigación fue 95% interna (lectura completa de `v4-production-runner.ts` 1295 líneas y `engine-v4.ts` 768 líneas + greps verificados) y produjo **cuatro hallazgos que corrigen o refinan los mandatos**:

1. **D-13 tiene 3 consumidores vivos que la auditoría no vio** — `agent-timers-v4.ts:351/434/460` consume `shouldCreateOrder + orderData` (camino timer createOrder, type-coupled aunque conductualmente inalcanzable), `engine-v4.ts:597` lo mapea a `DebugTurn`, y el tipo `DebugTurn` (`src/lib/sandbox/types.ts:143`) está FUERA del scope de diff permitido por D-11. La implementación de D-13 requiere tocar `agent-timers-v4.ts` — archivo v4-only que NO está en la lista D-11.
2. **`mapOutcomeToAgentOutput` (somnio-v4-agent.ts:1217-1450, ~233 líneas) está entera muerta** — cero call sites tras el refactor híbrido. Borrarla en W1 elimina de paso la mención del union de D-12 en `:1224`.
3. **D-15 se resuelve a DEPRECAR, no borrar**: el `confidence` legacy 0-100 es load-bearing en `guards.ts:25` (guard R0 → handoff), se persiste a `agent_turns.confidence` vía runner `:1120`, y alimenta 3 tabs del debug panel. Mapearlo a `intent_confidence*100` cambiaría el comportamiento del guard R0 (escalas auto-reportadas distintas) — violación del invariante absoluto.
4. **D-16 fuerza cambios de asserts sancionados** en `observability.test.ts` (lista exhaustiva de 14 labels) y `e2e-scenarios.test.ts:239/271` (emite y assertea `lock_force_acquired_after_ttl_expiry`). D-09 necesita ese carve-out explícito en el plan.

El artefacto central es el **Divergence Map** (abajo): qué del runner es mecanismo compartido (→ core), qué es prod-only (→ adapter/wrapper) y qué es sandbox-only (→ adapter sandbox), con file:line. La conclusión estructural: el runner YA usa el patrón correcto para features opcionales (métodos opcionales del adapter, ej. `storage.getPendingTemplates?`) — el core debe reusar ese patrón para CKPT-6a, no-repetición y crash-recovery, de modo que el sandbox los "apague" simplemente no implementándolos.

**Primary recommendation:** Ejecutar W1 (limpieza) ANTES de la extracción W2 para que el core nunca contenga código muerto; en W2 NO mover archivos de tests — mantener `engine-v4-lock.test.ts` y `v4-production-runner-*.test.ts` probando por los entry points públicos (que pasan a delegar al core), convirtiéndolos de facto en la suite del core con solo cambios de mocks/imports (máxima conformidad con D-09).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lock/pending/interrupt/checkpoint primitives | `interruption-system-v2/` (módulo, INTACTO salvo D-16) | — | Ya es agnóstico; el core lo consume tal cual |
| Restart loop + Path A/B + drains + carryState | **`somnio-v4/core/` (NUEVO)** | runner + engine como wrappers | Mecanismo compartido — hoy duplicado :237..:885 (runner) y :233..:499 (engine) |
| CKPT-0/6a/6b placements | `somnio-v4/core/` (tabla declarativa D-06) | — | Sitios que viven hoy en runner/engine |
| CKPT-1/2 + CKPT-3/4/5 placements | `somnio-v4-agent.ts` / `sub-loop/index.ts` (NO se mueven, D-06) | helper compartido en core | Solo se factoriza el boilerplate |
| Envío real WhatsApp + CKPT-7.N | Adapter prod (`V4MessagingAdapter` + parent, sin cambios) | core invoca vía contrato `send()` existente | El contrato `{messagesSent, interrupted, interruptedAtIndex}` ya existe |
| Stream NDJSON + CKPT-7.N sintético + pacing | Adapter sandbox (NUEVO — absorbe engine-v4 :404-512) | core invoca el mismo contrato `send()` | La iteración per-template del engine ES el send-adapter sandbox |
| Persistencia sesión/estado/turnos/ledger | Adapter prod (storage existente) vs adapter sandbox (memoria) | core invoca métodos (algunos opcionales) | Patrón optional-method ya establecido en runner |
| Lógica del agente (pipeline del turno) | `somnio-v4-agent.ts` + módulos (NO se toca salvo M-1/M-2 + helper CKPT) | — | Ya compartida hoy entre prod y sandbox |
| Timers v4 | `agent-timers-v4.ts` (Inngest, fuera del core) | — | Llama `processMessage` directo, no pasa por runner ni engine — D-13 lo toca (P1/P2) |

## Standard Stack

Cero librerías nuevas. Todo es reuso de assets in-repo:

### Core (assets existentes que el trabajo consume tal cual)
| Asset | Ubicación | Rol en este standalone |
|---|---|---|
| `interruption-system-v2` | `src/lib/agents/interruption-system-v2/` (lock 209 + pending 214 + checkpoints 154 + observability 85 + lua 36 + redis-client 55 líneas; 48 tests) | El core nuevo importa sus primitives con los MISMOS specifiers `@/lib/agents/interruption-system-v2/*` (crítico para que los vi.mock existentes sigan interceptando — Pitfall 8). Único cambio: union `LockEventLabel` 14→11 (D-16) |
| `checkpoint()` helper | `checkpoints.ts:106-160` | YA es single-source-of-truth del check Redis. El helper nuevo de D-06 envuelve ESTE (skip-gate + lostLock-throw + emit), no lo reemplaza |
| Contrato `send()` del messaging adapter | `messaging.ts:151-161` retorna `{messagesSent, interrupted?, interruptedAtIndex?}` | Es la interfaz de envío del core (D-05) — ya existe, no inventar otra |
| Patrón optional-method de adapters | runner `:580` (`this.adapters.storage.getPendingTemplates?`), `:858`, `:938`, `:944` | El patrón in-repo para features prod-only dentro de un orquestador compartido |
| vitest 1.6.1 (node v24.13.0) | verificado `npx vitest --version` | Runner de tests + smokes |
| `.env.local` con keys LLM | verificado presente | Necesario para Smoke A/B (skipIf sin keys) |

### Verificación de entorno
Verificado en esta sesión [VERIFIED: bash]: vitest 1.6.1 disponible, node v24.13.0, `.env.local` presente con `OPENAI_API_KEY_SALESV4`/keys. No hay dependencias externas nuevas.

## Divergence Map (runner ↔ engine) — ARTEFACTO PRINCIPAL

Lectura completa de ambos archivos 2026-06-10 [VERIFIED: Read de ambos archivos completos].

### A. Mecanismo COMPARTIDO → se extrae al core (D-04: la versión del runner manda)

| # | Mecanismo | Runner (`v4-production-runner.ts`) | Engine (`engine-v4.ts`) | Divergencia a absorber |
|---|---|---|---|---|
| A1 | Derivación `lockCtx` + guard de contrato | :95-106 (throw si lockHandle sin channel/identifier) | :152-154 (sin throw — silencioso null) | Core adopta el throw del runner |
| A2 | Heartbeat lifecycle (start fuera del loop, stop en finally) | :108-111, :1272 | :155-159, :748 | Idéntico |
| A3 | Acumuladores cross-iteración (`totalTokensAcrossRestarts`, `restartIteration`, `effectiveMessage`, `templatesSentCount`) | :125-127, :115 | :160-163 | Idéntico → `RestartContext` struct (D-03) |
| A4 | `ownEntryUuid` parse + `dropOwnEntry` | :139-147 | :180-189 | Idéntico (copy-paste literal) |
| A5 | `carryState` shape | :161-172 (struct propio con `turnLedgerDims`) | :200, :476-490 (`SandboxState`) | Core define UN struct neutral; los wrappers mapean a/desde su shape |
| A6 | `accumulatedSentContents` / `accumulatedSentMessages` | :173 | :169 | Mismo concepto, nombre distinto |
| A7 | Restart loop `while (shouldRestart)` | :190-191 | :216-218 | Idéntico |
| A8 | **Path A drain site — CKPT-0** | :216-269 | :222-255 | Casi idéntico. Nota P7: en el runner el priorMsg de CKPT-0 es `effectiveMessage ?? input.message` (:247) — ANTES del combine legacy `_v3:pendingUserMessage` (:282). El core debe preservar ese orden |
| A9 | **Path A drain site — discriminator del agente** (`errorMessage.startsWith('interrupted_at_ckpt_')`) | :441-478 | :325-352 | Idéntico |
| A10 | **Path A drain site — CKPT-6 (0 sends)** | :648-696 (CKPT-6b branch sentCount===0) | :359-393 (CKPT-6, siempre Path A) | El engine no distingue 6a/6b porque no tiene pending-templates; en el core CKPT-6b con `hasSentAnything: actuallySentIds.length > 0` cubre ambos (sandbox siempre llega con 0) |
| A11 | **Path B — CKPT-6b (≥1 send de pending-templates previos)** | :697-750 (drena, carryState desde SEED, o finish si pending vacío) | N/A (sin 6a no puede llegar con sends) | Prod-only DENTRO del mecanismo: se activa solo si el adapter de storage implementa pending-templates (ver B3) |
| A12 | **Path A/B — interrupt en send-loop / CKPT-7.N** | :856-926 (post-hoc vía `sendResult.interrupted`; Path A si 0 sent :869-884, Path B si ≥1 :885-913, carryState desde OUTPUT) | :424-501 (inline en loop sintético; CKPT-7.0 → Path A :437-457, i>0 → Path B :458-499, carryState desde OUTPUT) | **Resolución estructural:** mover el loop sintético del engine AL send-adapter sandbox; el core maneja `sendResult.interrupted` post-hoc en UN solo lugar (forma del runner). El adapter sandbox retorna el mismo contrato `{messagesSent, interrupted}` y puede lanzar `LostLockError` (igual que el prod) |
| A13 | Invocación del agente + acumulación de tokens | :419-427 (`await import('../somnio-v4')` dinámico) | :279-315 (import estático `'./somnio-v4-agent'`) | Core elige UNA forma (recomendado: estático desde `'../somnio-v4-agent'` relativo al core — el pre-warm B-001 ya ocurre en webhook-processor:858). Los vi.mock de los tests apuntan al specifier viejo → cambio de setup permitido por D-09 |
| A14 | Semántica carryState dual (P6 — LA SUTILEZA MAYOR) | Path B desde CKPT-6b: carry del **SEED** (:726-736, "msg1's output NO se envió"); Path B desde send-loop: carry del **OUTPUT** (:900-911) | Solo Path B desde OUTPUT (:476-490) | El core DEBE codificar ambas variantes (seed-carry vs output-carry) según si lo enviado fue del turno previo o del actual |
| A15 | `if (shouldRestart) continue` post-send sin persistir (Pitfall 8) | :968 | :517 | Idéntico |
| A16 | finally: stopHeartbeat → releaseLockIfOwner → `lock_released_normal` / `redis_unavailable_fallback_failed` | :1259-1293 | :744-766 | Idéntico |
| A17 | LostLockError catch → `zombie_lambda_exit` | :1224-1238 | :666-708 | Mismo mecanismo; el shape de retorno difiere (ver C5) — mapeo en wrapper |
| A18 | Defensive exhaustiveness throw post-while | :1213 | :633-635 | Idéntico |

**Conteo de drain-sites a consolidar en `drainPendingAndCombine()`:** runner = 5 Path A (:237, :452, :549, :669, :861) + 2 Path B (:703, :885); engine = 4 Path A (:233, :333, :372, :437) + 1 Path B (:458). Todos repiten la secuencia `dropOwnEntry(readAndClearPending) → clearInterrupt → restartIteration++ → emitLockEvent ×2 → effectiveMessage = join('\n') → shouldRestart = true`.

### B. PROD-ONLY → queda en wrapper del runner o como capability opcional del adapter

| # | Feature | Líneas runner | Mecanismo recomendado |
|---|---|---|---|
| B1 | Fetch de sesión por iteración + `setSessionId` del timer adapter | :194-202 | Adapter persistencia: `getSeedState()` invocado per-iteración (sandbox devuelve `input.state` de memoria) |
| B2 | Crash-recovery `_v3:pendingUserMessage` (D-18 CONSERVAR + comentar) | :280-287 (lectura iter-1), :916-924 (`wasInterruptedWithZeroSends`), :989-1007 (rollback + save pending) | Capability opcional del adapter persistencia (`getLegacyPendingMessage?` / `savePathARollback?`); sandbox no la implementa → ramas saltadas |
| B3 | CKPT-6a + envío de pending-templates de turno previo | :529-637 | Ya gated en `storage.getPendingTemplates?` (:580) — el core conserva el gate; adapter sandbox no lo implementa (paridad actual exacta: sandbox sin 6a, D-07) |
| B4 | Preload data + `_v3:agent_module` marker | :396-416 | Capability opcional (`preloadOnce?`) o queda en wrapper antes de invocar core |
| B5 | No-repetition filter (`USE_NO_REPETITION_V4`) + registry + minifrases | :754-810 | Capability opcional de envío (`filterOutbound?`) provista solo por prod (requiere conversationId + DB) |
| B6 | Filtro `rag:*` fuera de `templates_enviados` (T-7) | :835-843 | Va AL CORE (es mecanismo, no I/O — el sandbox lo necesita igual vía `output.templatesEnviados`) — verificar contra engine que hoy lo hereda del agente |
| B7 | Post-send commit: saveState + emisión ledger (kb_topic_registered / crm_action_recorded / turn_ledger_committed) + templates_enviados + state_committed + updateMode + timer signals + addTurn user/assistant + handoff | :977-1167 | Adapter persistencia prod (el bloque más grande). El sandbox construye `SandboxState` en su lugar (C2). El core expone el resultado del turno comprometido; el wrapper/adapter persiste |
| B8 | Debug adapter records (recordIntent/recordTokens/...) | :1169-1180 | Adapter debug prod (ya existe `this.adapters.debug`) |
| B9 | `VersionConflictError` retry recursivo (máx 3) | :1240-1243 | Wrapper del runner ALREDEDOR del core (re-entra con el mismo lockHandle; el release doble es safe — `releaseLockIfOwner` es owner-checked) |
| B10 | **Branch fallback messages-sin-templates (D-14 BORRAR)** | :949-961 | Se borra en W1 ANTES de extraer; el warning de reemplazo va donde quede el send-prep (runner en W1 → core en W2) |
| B11 | Shape `EngineOutput` + evento `agent_routed` | :480-487, :1187-1207 | Wrapper runner mapea TurnResult del core → EngineOutput |

### C. SANDBOX-ONLY → adapter sandbox / wrapper engine

| # | Feature | Líneas engine | Mecanismo recomendado |
|---|---|---|---|
| C1 | `simulateProdTimingMs` — sleep post-CKPT-0 (solo iter 0, :267-273) + pacing per-template (:411-422) | :267-273, :411-422 | Adapter timing/envío sandbox (el sleep per-template vive dentro del send-adapter sandbox; el "thinking sleep" puede ser hook `beforeAgentInvoke?` del adapter) |
| C2 | Build de `SandboxState` + limpieza keys `_v3:` stale | :521-541 | Wrapper engine (mapea TurnResult del core → V4EngineOutput) |
| C3 | Build de `DebugTurn` completo (intent/tokens/orchestration/subLoop/...) | :547-629 | Wrapper engine |
| C4 | `sandbox-result:{id}` write a Redis ANTES del release (Pitfall 5 del standalone sandbox-integration) | :645-657, :696-706 | Wrapper engine — DEBE ocurrir antes del finally del core. Diseño: el core acepta un hook `onResultReady?` o el wrapper escribe tras recibir el resultado pero el release vive en el core → **el core debe exponer el resultado ANTES de liberar el lock** (hook `beforeRelease?` o el wrapper posee el finally). Decisión de diseño para el planner — es el único acople de orden entre wrapper y finally del core |
| C5 | Contrato de error divergente: catch no-lock devuelve `success: true` + mensaje `[Error v4] ...` (UX sandbox) vs prod `success: false` + code | :714-742 vs runner :1245-1257 | Divergencia INTENCIONAL → wrappers mapean; el core retorna un resultado discriminado neutral |
| C6 | `onMessage` progressive reveal callback | :509-511 | Va dentro del send-adapter sandbox (post-CKPT-7.N por unidad) |

### D. Lo que NO se mueve

- `somnio-v4-agent.ts` (CKPT-1 :347-378, CKPT-2 :524-555 — solo adoptan el helper D-06 + borrado M-1/M-2).
- `sub-loop/index.ts` (CKPT-3/4/5 — solo helper + rename D-17).
- `V4MessagingAdapter` + `ProductionMessagingAdapter` (CKPT-7.N prod :78-111 + onFirstSendCompleted :129-184 — intactos).
- `interruption-system-v2/` (salvo union D-16).
- Integration points: `webhook-processor.ts:847-931` (instancia runner — verificado, cambio interno al runner) y `app/api/sandbox/process/route.ts` (instancia engine).

## Architecture Patterns

### Patrón de refactor: Branch-by-Abstraction acotado + tests de caracterización por el seam público

**Qué:** No se construye un core paralelo "desde cero" ni se hace switch gradual con flag — con v4 DORMANT (cero tráfico) el riesgo de big-bang interno es aceptable y el flag sobraría. La disciplina que SÍ se adopta de la literatura de refactoring [ASSUMED — Fowler "Branch By Abstraction"/"Parallel Change", Feathers "Working Effectively with Legacy Code"; conceptos estables, no verificados online en esta sesión]:

1. **Characterization tests primero (= D-08 baseline lock):** la suite existente + smokes definen el comportamiento observable; cualquier assert que "necesite" cambiar es una regresión detectada (D-09), salvo los carve-outs sancionados (Pitfall 5).
2. **Test por el seam estable:** los tests de paridad (`engine-v4-lock.test.ts`, `v4-production-runner-restart/pathb.test.ts`, `restart-loop.test.ts`) prueban por los entry points públicos `runner.processMessage` / `engine.processMessage`. **Recomendación (discreción ejercida): NO mover ni duplicar esos archivos.** Cuando ambos entry points deleguen al core, esas suites SE CONVIERTEN en la suite del core sin tocar un assert — solo cambian paths de vi.mock si cambia el specifier del agente (A13). Una suite unitaria del core (drain/RestartContext) puede AÑADIRSE después como complemento, nunca como reemplazo.
3. **Orden W1 → W2 estricto:** limpiar dead code ANTES de extraer, para que el core nunca contenga las ramas muertas (D-14 en runner primero; la extracción copia código ya limpio).

### Orden de extracción recomendado para W2 (de menor a mayor blast radius)

1. **`checkpoint-gate.ts`** (helper D-06) — adoptarlo primero en agente + sub-loop + runner + engine SIN mover nada más. Cada adopción es un commit con suite verde. Es el cambio más mecánico y reduce el cuerpo del runner antes de extraerlo.
2. **`drain.ts`** (`drainPendingAndCombine()`) — consolida los 9 drain-sites (5+2 runner, 4+1 engine) en el sitio donde están (todavía sin core). Firma sugerida abajo (§Code Examples).
3. **`restart-context.ts`** — struct de acumuladores + `applyCarryState()`.
4. **`turn-orchestrator.ts`** — extraer el while-loop del RUNNER usando 1-3, con la interfaz de adapters; el runner queda wrapper. Suite runner verde = el core reproduce prod.
5. **Reescribir `engine-v4.ts`** como wrapper del core + send-adapter sandbox (absorbe el loop sintético C1/C6). Suite engine verde = paridad estructural lograda.
6. **D-07:** reducir INTERRUPTION-PARITY.md a diferencias de adapters.

### Interfaz de adapters (D-05) — derivada del código real, no inventada

El contrato de envío YA existe (`messaging.send → {messagesSent, interrupted?, interruptedAtIndex?}` + throws LostLockError). El patrón para capabilities prod-only YA existe (métodos opcionales: runner :580/:858/:938). La interfaz mínima del core:

```typescript
// Sugerencia para el planner — nombres a discreción (D-03)
interface TurnCoreAdapters {
  // ENVÍO (obligatorio). Prod: delega a V4MessagingAdapter (CKPT-7.N interno).
  // Sandbox: loop sintético CKPT-7.N + pacing + onMessage (absorbe engine-v4.ts:404-512).
  send(block: SendBlock): Promise<{ messagesSent: number; interrupted?: boolean; interruptedAtIndex?: number }>
  // PERSISTENCIA (obligatorio el seed; el resto opcional = prod-only)
  getSeedState(): Promise<CoreSeedState>            // prod: fetch sesión per-iteración; sandbox: input.state
  commitTurn?(result: CommittedTurn): Promise<void>  // prod: bloque :977-1167; sandbox: no-op (wrapper construye SandboxState)
  getPendingTemplates?(): Promise<PendingTemplate[]> // prod-only → habilita CKPT-6a + 5h-pre
  savePendingTemplates?/clearPendingTemplates?(...)
  getLegacyPendingMessage?(): string | undefined     // D-18 prod-only
  savePathARollback?(msg: string): Promise<void>     // D-18 prod-only (wasInterruptedWithZeroSends)
  filterOutbound?(templates: ProcessedMessage[]): Promise<ProcessedMessage[]>  // no-rep prod-only
  // TIMING (opcional, sandbox-only)
  beforeAgentInvoke?(iteration: number): Promise<void>  // simulateProdTimingMs sleep
  // RESULTADO (sandbox-only — sandbox-result write antes del release, C4)
  onResultReady?(result: TurnResult): Promise<void>
}
```

El core NO importa WhatsApp ni NDJSON (D-05): importa solo `interruption-system-v2/*`, el agente (`processMessage`), y tipos.

### Anti-Patterns a evitar

- **Mover colocaciones de checkpoints "ya que estamos"** — D-06 lo prohíbe explícitamente; la posición ES el contrato.
- **Unificar el contrato de error prod/sandbox** — la divergencia C5 (`success:true + [Error v4]` en sandbox) es intencional para UX del sandbox; unificarla rompería el route/UI.
- **Cambiar el specifier de import de `interruption-system-v2`** en el core (rompe los vi.mock de 6+ suites — Pitfall 8).
- **Reescribir `ProductionMessagingAdapter`/`messaging.ts`** — compartido con v3/godentist/recompra/pw (Regla 6, D-11).

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|---|---|---|---|
| Check de lock + interrupt en cada CKPT | un segundo checker | `checkpoint()` de `checkpoints.ts:106` tal cual | Ya es single-source-of-truth con fail-open; el helper D-06 lo ENVUELVE |
| Per-template abort en prod | re-implementar el loop de envío | `V4MessagingAdapter.shouldAbortBeforeTemplate` + parent send | Intacto por D-11; el core consume el contrato `send()` |
| Capability gating prod-vs-sandbox | flags booleanos de config en el core | métodos opcionales del adapter (patrón runner :580) | Patrón ya validado en el propio runner; "no implementado" = "apagado" sin condicionales por entorno |
| Baseline de validación | criterio nuevo | patrón Wave 0 baseline-lock (agent-godentist-fb-ig) + D-10 equivalencia de decisiones | Ya definido en CONTEXT |
| Mapeo estado sandbox | nuevo formato de estado | `SandboxState` existente (wrapper engine lo sigue produciendo) | El debug panel y el route lo consumen |
| Discriminador de interrupt | boolean tipado nuevo | prefix string `interrupted_at_ckpt_*` en `errorMessage` | R-04: greppable en logs Vercel; los tests lo assertean |

## Runtime State Inventory

(Fase de refactor — auditoría explícita de estado runtime:)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **Ninguno** — no cambian keys Redis (`lock:`/`pending:`/`interrupt:`), ni namespaces `_v3:`/`_v4:` de `session_state`, ni columnas. Los 3 labels D-16 nunca emitieron → 0 filas históricas en `agent_observability_events` que queden huérfanas [VERIFIED: grep emitters = 0] | ninguna |
| Live service config | **Ninguno** — v4 DORMANT (0 workspaces con `conversational_agent_id='somnio-sales-v4'`); flags `USE_NO_REPETITION_V4`, `somnio_v4_kb_sync_enabled`, threshold en `platform_config` quedan intactos | ninguna |
| OS-registered state | Ninguno — verificado por naturaleza del cambio (solo módulos TS dentro de Vercel/Next) | ninguna |
| Secrets/env vars | Ninguno cambia — `OPENAI_API_KEY_SALESV4`, Upstash, Supabase quedan con los mismos nombres | ninguna |
| Build artifacts | Ninguno — `tsc --noEmit` + `next build` regeneran; recordar regla de memoria del proyecto: sub-proyectos/tests con type-errors rompen el build de Vercel → typecheck por commit es el gate (D-09) | typecheck per-commit |

## Common Pitfalls

### Pitfall 1 (CRÍTICO — corrige D-13): `shouldCreateOrder`/`orderData` SÍ tienen consumidores
**Qué:** El claim de D-13 ("nadie lo consume; 1 hit en runner y es comentario") es incorrecto. Consumidores verificados [VERIFIED: grep]:
- `src/inngest/functions/agent-timers-v4.ts:351` (log), `:434` (`if (output.shouldCreateOrder && output.orderData)` → `createTimerOrderV4`), `:460` (return). El timer path del agente (`processSystemEvent`, somnio-v4-agent.ts:1177-1183) lo setea con `isCreateOrder`.
- `engine-v4.ts:597` → `debugTurn.orchestration.shouldCreateOrder` → tipo `DebugTurn` en `src/lib/sandbox/types.ts:143` (FUERA del scope D-11) → renderizado en `pipeline-tab.tsx:47/205/395`.

**Análisis de alcanzabilidad:** conductualmente el consumidor del timer es inalcanzable — ninguna transición `timer_expired:*` produce acciones de `CREATE_ORDER_ACTIONS` (`{crear_orden, crear_orden_sin_promo, crear_orden_sin_confirmar}`; las acciones timer son retoma*/recordar_*/ofrecer_promos/ask_ofi_inter/silence — verificado en `transitions.ts:316-414` + `constants.ts:204-210` nota D-19). Pero está TYPE-coupled: borrar el campo rompe typecheck en `agent-timers-v4.ts`.

**Cómo implementar D-13 sin romper:** (a) borrar campo+`orderData` de `V4AgentOutput` y las ~12 asignaciones del agente; (b) en `agent-timers-v4.ts` borrar el bloque consumidor (:432-452) + refs en log/return + el helper `createTimerOrderV4` si queda sin usos; (c) en `engine-v4.ts:597` poblar `shouldCreateOrder: false` literal (el campo de `DebugTurn` NO se toca — está fuera de scope); (d) NO tocar `sandbox/types.ts` ni `pipeline-tab.tsx`.
**Warning sign:** typecheck rojo en `agent-timers-v4.ts` tras tocar types.ts = recordatorio de este pitfall.

### Pitfall 2 (CRÍTICO — gap en D-11): `agent-timers-v4.ts` no está en la lista de diff permitido
La lista D-11 (`somnio-v4/`, `engine/v4-production-runner.ts`, `engine-adapters/production/v4-messaging-adapter.ts`, `interruption-system-v2/`, docs) omite `src/inngest/functions/agent-timers-v4.ts`, que D-13 obliga a tocar (Pitfall 1). El archivo es v4-ONLY (creado dedicado precisamente para no compartir runtime con v3 — `agent-timers-v3.ts` queda intacto), así que el espíritu de Regla 6 se preserva. **El plan debe declarar explícitamente la extensión de la lista D-11 con este archivo** (y solo este), y el gate de diff-cero debe excluirlo nominalmente.

### Pitfall 3 (descubrimiento — amplía D-12): `mapOutcomeToAgentOutput` entera está muerta
`somnio-v4-agent.ts:1217-1450` (~233 líneas) no tiene NINGÚN call site [VERIFIED: grep — solo 3 comentarios + definición; tsconfig sin `noUnusedLocals`, por eso compila]. Quedó huérfana cuando el refactor híbrido reemplazó el early-return de escalación por el slot resolver (`resolveLowSlot` maneja hoy los outcomes inline). Borrarla completa en W1: (a) cumple el espíritu de D-12; (b) elimina la mención `:1224` del union; (c) borra de paso las refs en comentarios del runner :435 y engine :323 (actualizar comentario, el mecanismo discriminator sigue vivo vía `resolveLowSlot`). El union `V4AgentOutput.subLoopReason` en `types.ts:283` se reduce a `'low_confidence' | 'razonamiento_libre' | null` (lo único que el slot resolver emite — verificado :980, :492, :880).

### Pitfall 4 (CRÍTICO — resuelve el condicional D-15): `confidence` legacy es load-bearing → DEPRECAR, no borrar
El grep que D-15 pedía [VERIFIED]: consumidores fuera del agente =
1. **`guards.ts:25` — DECISIÓN DE COMPORTAMIENTO:** R0 `if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') → handoff`. Sustituir por `intent_confidence*100` cambiaría el guard (son dos auto-reportes distintos del mismo modelo con calibraciones distintas) → violación del invariante absoluto (mecanismo 5).
2. `v4-production-runner.ts:1120` → `storage.addTurn({confidence})` → columna DB `agent_turns.confidence`.
3. `engine-v4.ts:556` → `DebugTurn.intent.confidence` → UI tabs (`classify-tab.tsx:95-108`, `pipeline-tab.tsx:61`, `debug-v3.tsx`).
4. Evento `comprehension_completed` (`comprehension.ts:149`).

Son >2 consumidores → por la propia cláusula condicional de D-15: **degradar a deprecación** (`@deprecated` + comentario en `comprehension-schema.ts:36` y `intentInfo.confidence` en `types.ts`), diferir el borrado. Cero cambios de comportamiento.

### Pitfall 5 (D-16 vs D-09): el borrado de labels FUERZA cambios de asserts — sancionarlos en el plan
[VERIFIED: grep] Los 3 labels (`follower_woke`, `lock_force_acquired_after_ttl_expiry`, `heartbeat_renewed`) tienen CERO emisores en código no-test. Union pasa de 14 → 11. Acoplamientos:
- `observability.test.ts` — lista exhaustiva de los 14 labels + describe "typed 14-label emitter" → asserts DEBEN cambiar (14→11). Excepción sancionada por D-16; el plan debe declararla para no disparar el freno de D-09.
- `e2e-scenarios.test.ts:239/271` — EMITE `lock_force_acquired_after_ttl_expiry` vía `emitLockEvent` (simulación) y lo assertea → typecheck roto al reducir el union → ese bloque se elimina/ajusta (sancionado).
- `restart-loop.test.ts:709-711` y `engine-v4-lock.test.ts:696` — solo comparaciones string en filtros (`e.label === 'heartbeat_renewed'`) sobre labels que nunca ocurren; no rompen typecheck; pueden quedarse o limpiarse como setup.
- `interruption-tab.tsx` (sandbox UI, FUERA de scope D-11) — usa su propio array `as const` local SIN importar el union [VERIFIED: lectura del archivo] → cero diff forzado; sus entradas quedan stale pero inofensivas (string-compare sobre labels que jamás llegan). Documentar en D-17 docs-sync.
- CLAUDE.md gate: actualizar el grep de 14 labels a 11 (quitar los 3 del regex y el conteo).

### Pitfall 6 (mecanismo — la sutileza nº1 de la extracción): DOS semánticas de carryState en Path B
El runner tiene dos variantes que el core debe distinguir: (1) Path B desde CKPT-6b (:726-736): lo enviado fue del TURNO PREVIO (pending templates), el output de msg1 NO se envió → carry del **seed** (no marcar intents de msg1 como vistos); (2) Path B desde send-loop (:900-911): el output de msg1 SÍ se envió parcialmente → carry del **output** (no re-saludar, no re-enviar). El engine solo tiene la variante (2) (:476-490). Si el core colapsa ambas en una, el reprocess tras pending-templates re-registraría/perdería efectos del ledger (P3 del turn-ledger). Los tests `v4-production-runner-pathb.test.ts` cubren esto — si un assert "pide" cambiar aquí, ES regresión (D-09 aplica con todo su peso).

### Pitfall 7 (ordering — crash-recovery D-18): CKPT-0 drena ANTES del combine legacy
En el runner, el drain de CKPT-0 usa `effectiveMessage ?? input.message` (:247) y el combine con `_v3:pendingUserMessage` ocurre DESPUÉS (:282). Si la extracción reordena (p.ej. computando `turnEffectiveMessage` antes de CKPT-0), un interrupt en CKPT-0 con pendingUserMessage presente combinaría doble. Preservar el orden exacto: CKPT-0 → fetch seed → legacy combine → resto.

### Pitfall 8 (test-mock coupling): los vi.mock interceptan por specifier de módulo
Las suites de paridad mockean `@/lib/agents/interruption-system-v2/{pending,checkpoints,lock,observability}` y el módulo del agente. Regla para el core: **importar los primitives con los MISMOS specifiers absolutos `@/lib/agents/interruption-system-v2/*`** → los mocks existentes siguen interceptando sin tocar tests. El import del agente sí puede cambiar de specifier (runner usa `'../somnio-v4'` dinámico, engine usa `'./somnio-v4-agent'` estático) → al unificar, los `vi.mock` de esas suites necesitan actualizar SU path (cambio de setup permitido por D-09, declararlo en el plan).

### Pitfall 9 (Regla 6 leak vectors): archivos compartidos en riesgo de toque accidental
- `engine-adapters/production/messaging.ts` (parent adapter, compartido v3/godentist/recompra/pw) — D-14 es runner-side; NO tocar el gate `:169-172` del parent.
- `src/lib/sandbox/types.ts` (`DebugTurn`/`SandboxState`) — compartido con sandbox v3; mantener shapes, poblar con literales/casts desde el wrapper engine (precedente: cast de frontera ya existente engine-v4 :486, :529).
- `src/lib/observability` (collector) — solo consumo.
- Gate verificable por plan: `git diff --name-only` ∩ (todo fuera de {`somnio-v4/`, `engine/v4-production-runner.ts`, `engine-adapters/production/v4-messaging-adapter.ts`, `interruption-system-v2/`, `inngest/functions/agent-timers-v4.ts` (P2), docs, `.planning/`}) = ∅.

### Pitfall 10 (D-14): el warning de reemplazo y el doble destino W1→W2
El branch :949-961 se borra en W1 (runner). El warning (`output.messages.length > 0 && !output.templates`) emitido a observability con un label NUEVO requiere decidir el canal: NO añadirlo a `LockEventLabel` (es del pipeline, no del lock) — usar `getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {...})` (mismo patrón que `agent_routed` :480). En W2 ese warning viaja al core con el send-prep. También elimina G-3: ya no se hace `sentMessageContents.push(...output.messages)` (:960) de texto jamás enviado.

### Pitfall 11 (baseline D-08): los smokes ESCRIBEN sobre los archivos de baseline
`smoke-rag-a.test.ts` persiste resultados incrementalmente en `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` (y B en `SMOKE-B-RESULTS.md`) [VERIFIED: header del test + path en :54]. Re-correr smokes para el baseline SOBRESCRIBE el baseline 2026-06-05. El plan de Wave 0: (1) copiar SMOKE-A/B-RESULTS.md actuales a `somnio-v4-consolidation/BASELINE.md` (o snapshot git) ANTES de re-correr; (2) correr suite + smokes; (3) registrar resultados frescos como el baseline operativo. Nota: git status muestra esos archivos ya modificados sin commitear — resolver ese estado sucio primero.

### Pitfall 12 (smokes vivos): no-determinismo LLM en el gate D-10
Smoke A/B usan LLMs vivos (cargan `.env.local`, `describe.skipIf` sin keys). El criterio D-10 es equivalencia de DECISIONES (PASS/FAIL, templates deterministas, outcomes, gates), no de texto. El historial registra flakiness conocida (audit D-10) — el plan debe permitir 1 re-run de un caso flaky antes de declarar regresión, comparando contra la decisión del baseline, y dejar el criterio escrito ANTES de correr.

### Pitfall 13 (D-12 alcance fino): `escalation.test.ts` pierde 2 tests sancionados
Borrar los params `isCrmMutation`/`casReject` de `EscalationInput` + ramas `escalation.ts:51/54` invalida los 2 tests que las prueban (`escalation.test.ts:46-61`) → eliminación sancionada por D-12 (declarar en plan, carve-out D-09). El `SubLoopReason` del sub-loop NO se toca: `crm-gate.ts:338-339` invoca `runCrmSubLoop({reason: 'crm_mutation'})` [VERIFIED] — vivo. El union de retorno de `decideSubLoopReason` se estrecha a `'low_confidence' | 'razonamiento_libre' | null`, lo que SIMPLIFICA los narrowings defensivos de `slots.ts:125-131/156-161` (pueden quedarse o limpiarse — son no-ops correctos).

## Code Examples

### El boilerplate de checkpoint a factorizar (D-06) — patrón real
```typescript
// somnio-v4-agent.ts:347-378 (CKPT-1) — el patrón de ~30 líneas repetido en CKPT-1/2 (agente),
// 3/4/5 (sub-loop, retorna LoopOutcome en vez de V4AgentOutput) y 0/6a/6b (runner/engine):
if (input.lockHandle && input.lockChannel && input.lockIdentifier) {        // (1) skip-gate
  const ck1 = await checkpoint('ckpt_1_post_comprehension', input.lockHandle,
    input.workspaceId, input.lockChannel, input.lockIdentifier)
  if (ck1.lostLock) throw new LostLockError('ckpt_1_post_comprehension')    // (2) zombie throw
  if (!ck1.proceed && ck1.interrupted) {                                    // (3) interrupt
    emitLockEvent('msg_aborted_path_a_combined', { combined_msg_count: 1, total_chars: ... })
    return { success: false, messages: [], errorMessage: 'interrupted_at_ckpt_1_post_comprehension', /* passthrough de input */ }
  }
}
```
Helper sugerido (`checkpoint-gate.ts`): centraliza (1)+(2)+emit y devuelve `'proceed' | { interrupted: ckptId }`; cada módulo conserva SU builder de retorno (el agente retorna V4AgentOutput-passthrough, el sub-loop retorna LoopOutcome `no_match` con reason-discriminator) — así las colocaciones y los shapes de retorno no se mueven (D-06).

### `drainPendingAndCombine()` — consolida la secuencia repetida 9 veces
```typescript
// Patrón real repetido en runner :237-267, :452-477, :549-575, :669-695, :861-884
// y engine :233-254, :333-351, :372-391, :437-456:
const pending = dropOwnEntry(await readAndClearPending(ws, channel, identifier))
await clearInterrupt(ws, channel, identifier)
restartIteration++
emitLockEvent('msg_aborted_path_a_combined', { at_step, combined_msg_count: pending.length + 1, total_chars, restart_iteration })
emitLockEvent('pending_list_combined', { at_step, entries_count: pending.length, total_chars, restart_iteration })
effectiveMessage = [priorMsg, ...pending.map(p => p.content)].join('\n')   // orden cronológico (commit 494d3bb4)
shouldRestart = true
// Firma sugerida: drainPendingAndCombine(ctx: RestartContext, lockCtx, atStep: string,
//   priorMsg: string, mode: 'path_a' | 'path_b_solo') → actualiza ctx + retorna pending.length
// (los sitios Path B emiten msg_aborted_path_b_solo y setean carryState — el modo lo parametriza)
```

### Patrón optional-capability del adapter (ya in-repo — base de B2/B3/B5)
```typescript
// v4-production-runner.ts:580 — así gatea el runner HOY las features prod-only:
if (this.adapters.storage.getPendingTemplates) {
  const pending = await this.adapters.storage.getPendingTemplates(session.id)
  // ... CKPT-6a + 5h-pre solo corren si la capability existe
}
// El core hereda este patrón: el adapter sandbox simplemente no implementa
// getPendingTemplates/getLegacyPendingMessage/filterOutbound → ramas saltadas → paridad actual exacta.
```

### Warning D-14 (detalle a discreción, recomendación)
```typescript
// Reemplazo del branch :949-961 — pipeline_decision (NO LockEventLabel):
if (output.messages.length > 0 && (!output.templates || output.templates.length === 0)) {
  getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {
    sessionId: session.id, messageCount: output.messages.length,
    preview: output.messages[0]?.slice(0, 120) ?? '',
  })
  console.warn('[V4-RUNNER] output.messages sin templates — nunca debería ocurrir (post rag:* passthrough)')
}
// NO push a sentMessageContents (mata G-3), NO send.
```

## State of the Art

| Old Approach (pre-standalone) | Current Approach (post-W2) | Impact |
|---|---|---|
| Paridad por disciplina (INTERRUPTION-PARITY.md, fix doble del bug 2026-05-28) | Paridad por construcción (core único + adapters) | Bug-class eliminada; PARITY.md se reduce a diferencias de adapters (D-07) |
| 9 drain-sites copy-paste | `drainPendingAndCombine()` único | Divergencia futura imposible |
| Checkpoint boilerplate ~30 líneas ×8 sitios | helper + tabla declarativa (colocaciones intactas) | -~200 líneas, semántica idéntica |
| `runLegacySubLoop` (nombre trampa) | `runCrmMutationSubLoop` | Nadie lo borra "por legacy" |
| Union de 14 labels con 3 fantasma | 11 labels reales | El tipo refleja la realidad |

**Deprecated/outdated tras este standalone:** ARCHITECTURE.md §0 tabla ("Mutations CRM: invocations.ts" — archivo ya no existe), §2.0 diagrama (paso 9/10 executeInvocations/createOrder inline — reemplazados por crm-gate), §4.2 G-1/G-2/G-3 (cerrados), tabla de archivos §1 (invocations.ts 283, engine-v4 730→nuevo conteo, somnio-v4-agent 1008→1476 actual), PARITY.md §6 caveat RAG-send (obsoleto — el slot resolver emite `rag:*` por el path de templates desde el híbrido). Todo esto es el contenido de D-17.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Las referencias a Fowler (Branch by Abstraction / Parallel Change) y Feathers (characterization tests) describen correctamente esos patrones | Architecture Patterns | Mínimo — son marco conceptual, no instrucciones; el procedimiento concreto deriva del código leído |
| A2 | El conteo "~209 tests" del audit corresponde a casos ejecutados (mi conteo estático de `it(` da ~309 declaraciones incluyendo `it.each`/skipIf de smokes) — el número EXACTO lo fija el baseline D-08 | Validation Architecture | Ninguno — D-08 establece el número canónico antes de tocar nada |
| A3 | `cas_reject` no tiene hoy ningún productor que invoque el sub-loop con ese reason (el flujo CAS propaga el error sin re-entrar) — no afecta D-12 porque el union del sub-loop no se toca | Pitfall 13 | Bajo — si existiera un productor, igual está fuera del scope de cambios |

**Todo lo demás está [VERIFIED] por lectura directa o grep en esta sesión.**

## Open Questions (RESOLVED)

> Las 3 preguntas quedaron resueltas en los planes: OQ1 → Plan 09 (hook `onResultReady` invocado antes del finally-release), OQ2 → Plan 02 (BORRAR `createTimerOrderV4`, grep de usos como gate), OQ3 → Plan 01 (commitear estado git sucio de SMOKE-*-RESULTS.md antes del snapshot baseline).

1. **¿Dónde vive el write `sandbox-result:{id}` respecto al release del lock en el core?** (C4)
   - Sabemos: hoy el engine escribe el resultado a Redis ANTES de que su finally libere el lock (Pitfall 5 del standalone sandbox-integration — el follower long-pollea ese key).
   - Gap: si el finally de release pasa al core, el wrapper engine ya no controla el orden.
   - Recomendación: hook `onResultReady?` del adapter invocado por el core después de obtener el resultado y ANTES del finally-release; o que el wrapper posea el try/finally y el core solo el loop. Decisión del planner — dejarla explícita en el plan del core.
2. **¿Borrar también `createTimerOrderV4` en `agent-timers-v4.ts`?** Tras quitar el consumidor (:434-452) el helper queda sin usos. Recomendación: borrarlo en el mismo commit (grep de usos como gate); si el equipo quiere conservar el camino timer-createOrder para el futuro, dejar el helper con `@deprecated` — pero el default es borrar (es re-construible y D-19 del crm-subloop ya desacopló create-por-timer a propósito).
3. **Smoke B baseline "1/3 + 7 SKIP":** los archivos SMOKE-*-RESULTS.md figuran modificados sin commitear en git status. El Wave 0 debe primero decidir/commitear ese estado para que el snapshot del baseline sea reproducible.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | tests/build | ✓ | v24.13.0 | — |
| vitest | suite v4 + smokes | ✓ | 1.6.1 | — |
| `.env.local` con keys LLM (`OPENAI_API_KEY_SALESV4`, Gemini, Supabase) | Smoke A/B (skipIf sin keys) | ✓ | — | smokes saltan (inaceptable para D-08/D-10 — verificar al correr) |
| Upstash Redis env vars | tests de lock usan mocks; smokes/e2e reales pueden requerirlo | ✓ (asumido por smokes previos verdes 2026-06-05) | — | tests unitarios mockean redis |

**Missing dependencies with no fallback:** ninguna.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 1.6.1 |
| Config file | vitest config del repo (raíz) |
| Quick run command | `npx vitest run <archivo>` |
| Full v4 suite command | `npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` |
| Typecheck | `npx tsc --noEmit` (predictor del verde de Vercel — regla de memoria del proyecto) |

### Inventario de suites (it-declarations estáticas; el conteo canónico lo fija D-08)
| Área | Archivos | its | Rol en este standalone |
|---|---|---|---|
| `somnio-v4/__tests__/` | 18 archivos (engine-v4-lock 11, slots 33, somnio-v4-agent 16, transitions 12, smoke-hybrid 10, state 9, crm-* 29, escalation 6, response-track 8, comprehension-* 13, vision 7, smoke-rag-a/b 5) | ~159 | Caracterización del agente + paridad sandbox. `engine-v4-lock` = suite de paridad E1..E10 → de facto suite del core post-W2 |
| `sub-loop/__tests__/` | 7 archivos | ~80 | Intactos (solo rename D-17 → imports/setup) |
| `engine/__tests__/v4-production-runner-{restart,pathb}` | 2 archivos | 8 | Caracterización del lado prod del core (Path A combine/fantasma + Path B/acumulación) |
| `interruption-system-v2/__tests__/` | 6 archivos | 48 | Intactos salvo carve-outs D-16 (observability 6, e2e-scenarios 4 — Pitfall 5) |
| `v4-messaging-adapter.test.ts` | 1 | 14 | Intacto (adapter no se toca) |
| Regla 6 | `webhook-processor-routing.test.ts`, `webhook-processor.recompra-flag.test.ts`, `media-gate-v4.test.ts` (los archivos que referencian "Regla 6"/no-regresión) | — | Gate D-11 — deben quedar verdes sin tocar |

### Requirements → Test Map
| Mandato | Behavior | Test Type | Comando | Existe |
|--------|----------|-----------|---------|--------|
| D-06 helper CKPT | colocaciones intactas, semántica idéntica | unit/parity | `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts` | ✅ |
| D-04/D-05 core | Path A/B prod equivalente | unit | `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts` | ✅ |
| D-04/D-05 core | Path A/B sandbox equivalente | unit | `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` | ✅ |
| D-12/D-13 limpieza | pipeline del agente intacto | unit | `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts src/lib/agents/somnio-v4/__tests__/slots.test.ts` | ✅ (escalation.test pierde 2 casos sancionados — Pitfall 13) |
| D-10 wave gate | RAG end-to-end equivalente | smoke (LLM vivo) | `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (+ `smoke-rag-b`) | ✅ (snapshot baseline primero — Pitfall 11) |
| D-11 Regla 6 | v3/godentist/recompra/pw intactos | unit + grep gates | suites Regla 6 + `git diff --name-only` contra lista permitida (+ extensión P2) | ✅ |

### Sampling Rate
- **Per commit:** `npx tsc --noEmit` + full v4 suite (comando arriba).
- **Per wave (W1 y W2):** + Smoke A (17) + Smoke B (10 con SKIPs) vs baseline (D-10).
- **Phase gate:** suite completa + smokes + Regla 6 diff-cero antes de `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `BASELINE.md` — snapshot de suite + Smoke A/B PRE-cambios (D-08; incluye resolver el estado git sucio de SMOKE-*-RESULTS.md — Pitfall 11 / Open Question 3).
- (Sin gaps de framework — toda la infraestructura de tests existe.)

## Sources

### Primary (HIGH confidence — verificado en esta sesión)
- Lectura completa: `src/lib/agents/engine/v4-production-runner.ts` (1295 líneas), `src/lib/agents/somnio-v4/engine-v4.ts` (768), `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (1476), `escalation.ts`, `slots.ts`, `guards.ts`, `types.ts` (V4AgentOutput), `interruption-system-v2/checkpoints.ts`, `observability.ts`, `v4-messaging-adapter.ts`, `messaging.ts` (send gate), `webhook-processor.ts:847-931`, `agent-timers-v4.ts:330-475`, `transitions.ts` (timer rows), `constants.ts` (CREATE_ORDER_ACTIONS), `interruption-tab.tsx`, `crm-gate.ts` (invocación sub-loop).
- Greps verificados: isCrmMutation/casReject call sites; shouldCreateOrder/orderData consumidores; mapOutcomeToAgentOutput call sites (=0); emisores de los 3 labels D-16 (=0); inventario de emitLockEvent por label; confidence legacy consumidores; runLegacySubLoop refs; tests acoplados a cada ítem.
- `.planning/standalone/somnio-v4-consolidation/CONTEXT.md` + `DISCUSSION-LOG.md`; `.planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md` + `RESTRUCTURE-RESEARCH-2026-06-10.md`; `ARCHITECTURE.md`; `INTERRUPTION-PARITY.md`; SMOKE-A/B-RESULTS baselines.
- Entorno: vitest 1.6.1, node 24.13.0, `.env.local` presente [VERIFIED: bash].

### Secondary
- CLAUDE.md §Module Scope interruption-system-v2 (gates grep a actualizar con D-16).

### Tertiary (LOW — marco conceptual, no instrucciones)
- [ASSUMED] Fowler: Branch by Abstraction / Parallel Change; Feathers: characterization tests — conceptos estables de la literatura de refactoring, no verificados online en esta sesión (la investigación externa era secundaria por mandato; el procedimiento operativo deriva 100% del código leído).

## Metadata

**Confidence breakdown:**
- Divergence Map: HIGH — ambos archivos leídos completos, line refs de esta sesión.
- Dead-code verdicts (D-12..D-18): HIGH — cada uno verificado con grep; tres correcciones a los claims del audit (P1, P3, P4) con evidencia.
- Diseño de adapters/core: MEDIUM-HIGH — la interfaz propuesta deriva de contratos existentes (send(), optional-methods), pero los nombres/particiones finales son discreción del planner (D-03).
- Estrategia de tests: HIGH — acoplamientos de mocks/asserts enumerados por archivo.

**Research date:** 2026-06-10
**Valid until:** mientras no se mergeen cambios a `somnio-v4/`, `v4-production-runner.ts` o `interruption-system-v2/` (los line refs son de HEAD de esta sesión; re-verificar offsets si otra sesión toca esos archivos antes de ejecutar)
