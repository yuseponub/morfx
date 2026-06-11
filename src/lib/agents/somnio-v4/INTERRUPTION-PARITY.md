# Diferencias de adapters producción ↔ sandbox (somnio-v4)

> **Audiencia:** cualquier dev que toque el wrapper de producción
> (`engine/v4-production-runner.ts`), el wrapper del sandbox (`engine-v4.ts`),
> los adapters del sandbox (`sandbox-adapters.ts`), o el módulo de coordinación
> (`interruption-system-v2/`).
>
> **La paridad ya NO es una regla de disciplina — es POR CONSTRUCCIÓN.** Desde el
> standalone `somnio-v4-consolidation` (2026-06), el mecanismo de interrupción y
> restart vive en **código único** en `src/lib/agents/somnio-v4/core/`
> (`turn-orchestrator.ts` / `drain.ts` / `checkpoint-gate.ts` / `restart-context.ts`).
> Producción y sandbox corren el **MISMO** `runTurn()`, parametrizado solo por
> `TurnCoreAdapters`. No hay dos copias del mecanismo que mantener alineadas a mano.
>
> El bug del 2026-05-28 (`dropOwnEntry`/`carryState` que hubo que arreglar **dos
> veces**, una en el runner y otra en el engine) es exactamente la **clase de error
> que esta consolidación eliminó**: hoy ese fix se toca en UN solo lugar (el core) y
> ambos lados lo heredan automáticamente.
>
> **Este doc NO describe el mecanismo** (eso vive en el código del core y en
> `ARCHITECTURE.md §core/`). Este doc describe **solo las diferencias legítimas de
> los adapters** — lo único que difiere entre los dos lados.

---

## 1. Qué problema resuelve (contexto de una línea)

Cuando un cliente manda un mensaje y el bot empieza a responder, el cliente puede
mandar OTRO mensaje antes de que el bot termine. El sistema garantiza que **un solo
turno se procesa a la vez por conversación** y que un mensaje que llega mientras el
bot trabaja **nunca se pierde**: o se combina con el turno en curso (Path A) o se
contesta limpio justo después (Path B).

Solo aplica a **`somnio-sales-v4`**. v3 / godentist / recompra / pw-confirmation
siguen con el polling de Phase 31 (Regla 6 — intactos). v4 está **DORMANT** en
producción (0 workspaces); se activa per-workspace con
`UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`.

El mecanismo completo (lock + fencing, Path A/B, 8 checkpoints, restart loop,
`dropOwnEntry`, `carryState`, drains) vive en `core/` y se documenta en
`ARCHITECTURE.md §core/`. Acá no se repite.

---

## 2. Dónde vive cada cosa (mapa de responsabilidad)

| Capa | Archivo | Rol |
|---|---|---|
| **Mecanismo único** | `somnio-v4/core/turn-orchestrator.ts` (`runTurn`) | Restart loop + Path A/B + heartbeat + finally-release. CÓDIGO COMPARTIDO — corre idéntico en ambos lados. |
| | `somnio-v4/core/drain.ts` (`drainPendingAndCombine`) | Drena la pending list + combina + emite eventos. Único sitio de drain. |
| | `somnio-v4/core/checkpoint-gate.ts` (`runCheckpointGate`) | Helper único del check de lock/interrupt por checkpoint (envuelve `checkpoint()` del módulo). |
| | `somnio-v4/core/restart-context.ts` | Struct de acumuladores cross-iteración + `dropOwnEntry`. |
| **Primitivas** | `interruption-system-v2/` | Lock, pending list, interrupt key, checkpoints, observability. Agnóstico. El core lo consume; ambos lados heredan. |
| **Adapter PROD** | `engine/v4-production-runner.ts` (wrapper) + `engine-adapters/production/v4-messaging-adapter.ts` | Implementa los `TurnCoreAdapters` de producción (DB/WhatsApp/Inngest) + mapea `TurnResult` → `EngineOutput`. |
| **Adapter SANDBOX** | `somnio-v4/engine-v4.ts` (wrapper) + `somnio-v4/sandbox-adapters.ts` | Implementa los `TurnCoreAdapters` de memoria (NDJSON/memoria/timing simulado) + mapea `TurnResult` → `V4EngineOutput`. |

**Consecuencia estructural:** ningún wrapper contiene `while (shouldRestart)`, drains,
checkpoints, heartbeat, ni el finally-release. Eso está SOLO en el core. Los wrappers
solo **inyectan efectos de entorno** vía `TurnCoreAdapters` y **mapean el resultado
neutral** a su shape de salida.

---

## 3. Las diferencias LEGÍTIMAS de adapters (lo único que difiere)

Ambos lados corren el mismo `runTurn`. Lo que cambia es **qué adapters le inyectan**.
El core gatea las capabilities prod-only con `if (adapters.metodo)` (patrón
optional-method, cero flags de entorno) — el sandbox simplemente NO implementa esos
métodos, así que esas ramas se saltan = paridad actual exacta.

| Aspecto | Producción (runner + adapters prod) | Sandbox (engine + sandbox-adapters) |
|---|---|---|
| **Envío** | `send` delega a `V4MessagingAdapter` — envío real a WhatsApp vía dominio, con CKPT-7.N por template (`shouldAbortBeforeTemplate`, checkpoint Redis real). | `send` corre un loop sintético CKPT-7.N (`runCheckpointGate` con `lostLockLabel: ckpt_7_pre_template_${i}`) + pacing per-template + callback `onMessage` que revela templates al browser por stream NDJSON. NO envía nada real. |
| **Contrato de `send`** | Retorna `{messagesSent, interrupted?, interruptedAtIndex?}`. | Retorna el **MISMO** contrato → el core maneja el interrupt POST-HOC en UN solo lugar (no hay lógica de interrupción duplicada en el adapter). |
| **Persistencia de estado/sesión** | `getSeedState` hace fetch de sesión per-iteración (Supabase); `commitTurn` persiste estado + ledger + turnos (bloque B7). | `getSeedState` lee `input.state` de **memoria**; NO implementa `commitTurn` → el wrapper construye `SandboxState` en su lugar. |
| **Timing** | Real — latencia del LLM + del envío. | Simulado — `beforeAgentInvoke` hace un "thinking sleep" `simulateProdTimingMs` (solo iteration 0) + pacing per-template, para que la ventana de interrupción sea testeable a mano. |
| **CKPT-6a (pending-templates cross-turn)** | Implementa `getPendingTemplates?`/`savePendingTemplates?`/`clearPendingTemplates?` → el core corre CKPT-6a + el envío de templates pendientes de un turno previo. | NO implementa esos métodos → CKPT-6a se salta. El sandbox no arrastra templates entre turnos. |
| **Crash-recovery `_v3:pendingUserMessage`** | Implementa `getLegacyPendingMessage?` + `savePathARollback?` (D-18) → recuperación ante interrupt con pending vacío y 0 sends. | NO los implementa → ramas saltadas. |
| **No-repetición** | Implementa `filterOutbound?` (NoRepetitionFilter, gated `USE_NO_REPETITION_V4` + registry + minifrases). | NO lo implementa → todos los templates pasan. |
| **Resultado del turno** | El wrapper mapea `TurnResult` → `EngineOutput` y persiste. | Implementa `onResultReady?` → escribe `sandbox-result:{id}` a Redis **ANTES** del release del lock (el follower long-poll lo ve antes de poder adquirir); el wrapper usa el MISMO mapper para su retorno. |
| **Contrato de error** | `success: false` + `code` (`V4_ENGINE_ERROR` / `V4_ZOMBIE_LAMBDA_EXIT`). | `success: true` + mensaje `[Error v4] …` — divergencia **INTENCIONAL** (UX del sandbox: el browser muestra el error en línea en vez de cortar el stream). |

Ninguna de estas diferencias cambia **qué decide** el sistema ante una interrupción —
solo **cómo se ejecuta** el envío, la persistencia y el timing. La decisión (Path A
vs Path B, combinar vs reprocesar, cuándo escalar) la toma el core, idéntica para
ambos.

---

## 4. Regla de mantenimiento (la única regla que queda)

1. **Cambio al MECANISMO → SOLO en `core/`.** Si modificás Path A/Path B,
   `dropOwnEntry`, `carryState`, el orden de combinación, o cuándo se dispara un
   checkpoint → editás `core/turn-orchestrator.ts` (o el helper/drain/struct
   correspondiente) y AMBOS lados lo heredan automáticamente. **No hay nada que
   "reflejar" en el otro lado** — es el mismo código.

2. **Cambio a UN solo lado → solo en su adapter/wrapper.** Si tocás envío real,
   persistencia DB, timing, o el mapeo del resultado de producción → `v4-production-runner.ts`
   / adapters prod. Si tocás stream NDJSON, memoria, timing simulado, o el mapeo del
   resultado sandbox → `engine-v4.ts` / `sandbox-adapters.ts`. Un cambio de adapter
   **no** debe filtrarse al core (rompería la paridad).

3. **El módulo `interruption-system-v2` es la fuente de verdad de las primitivas.**
   Lock, pending, interrupt key, checkpoints y observability NO se reimplementan; el
   core los consume con los specifiers `@/lib/agents/interruption-system-v2/*`. Si una
   primitiva debe cambiar, cambiala en el módulo.

4. **Regla 6:** los 5 agentes no-v4 quedan byte-idénticos. El path v4 es el único que
   consume este sistema. No filtrar comportamiento de interrupción a v3.

---

## 5. Cómo verificar la paridad

- **Tests automatizados (corren contra el MISMO `runTurn`):**
  - Sandbox engine: `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts`
    (E1..E10 — happy, Path A en cada checkpoint, Path B reprocess, fantasma, no-resaludo).
  - Runner producción: `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts`
    (combine + fantasma) y `v4-production-runner-pathb.test.ts` (Path B reprocess + acumulación).
  - Módulo: `src/lib/agents/interruption-system-v2/__tests__/` (lock, pending, checkpoints, restart-loop, observability).
  - Core: `src/lib/agents/somnio-v4/core/__tests__/` (drain, etc.).

  Ambos sets de tests de paridad (sandbox E1..E10 + runner restart/pathb) ejercen el
  MISMO `runTurn` — pasan juntos por construcción. Un assert de paridad que falle en
  un lado pero no en el otro indicaría que algo se filtró al adapter equivocado.

- **Smoke manual en sandbox** (`/sandbox`, Somnio v4):
  - **Path A:** "hola" + "que precio" *antes* de que aparezca el primer mensaje →
    una sola respuesta combinada, sin "hola" duplicado.
  - **Path B:** "hola" → esperar el primer mensaje → "que precio" → conserva lo
    enviado + contesta precio, sin re-saludar.
  - Pestaña **Interruption**: timeline de eventos (`lock_acquired`,
    `msg_aborted_path_a_combined` / `msg_aborted_path_b_solo`,
    `pending_list_combined`, `lock_released_normal`).

---

## Parity addendum — vision branch (`standalone v4-media-audio-image`, Plan 04)

El branch vision-respond vive en **`processMessage` compartido**
(`somnio-v4-agent.ts:181`), así que producción y sandbox ejercen el branch idéntico
cuando se provee `visionContext`. El core threadea `visionContext` (campo neutral
`descripcion` + `categoria`) vía `CoreSeedState`; cada lado lo resuelve en su
`getSeedState`:

| Aspecto | Producción | Sandbox |
|--------|-----------|---------|
| **Clasificador** | Gemini Vision (`classifyImage`) corre en `agent-production.ts` media-gate; produce `descripcion` + `categoria`. | El clasificador NO corre en sandbox. El caller provee `visionContext.descripcion` directo en el body de la request. |
| **Trigger del branch** | `EngineInput.visionContext` → `getSeedState` lo expone como `CoreSeedState.visionContext` → `v4Input.visionContext`. | `V4EngineInput.visionContext` → `getSeedState` (memoria) lo expone igual. |
| **Código del branch** | `somnio-v4-agent.ts:181` `if (input.visionContext)` — compartido. | Mismo — `processMessage` compartido. |
| **Entrega** | El `send` del core dispara `rag:<sourceTopic>` por el path de templates. | El `send` sintético recoge el `templates` array igual. |

**Regla de paridad:** si el branch de visión cambia (threshold, backstop, shape del
push `rag:`), el cambio vive en `somnio-v4-agent.ts` y ambos lados lo heredan (código
compartido). Solo el clasificador y el mecanismo de entrega difieren (diferencia
legítima de adapter, §3).

**Regla 6:** `V4AgentInput.visionContext`, `EngineInput.visionContext`,
`V4EngineInput.visionContext` y `CoreSeedState.visionContext` son todos `?`
(opcionales). Los 5 agentes no-v4, `v3-production-runner` e `interruption-system-v2`
quedan 0-line-diff vs baseline. CheckpointId count = 8.

---

## Referencias

- **Mecanismo (qué hace, no solo qué difiere):** `ARCHITECTURE.md §core/` (este directorio).
- **Módulo + scope completo:** `CLAUDE.md` §"Module Scope: interruption-system-v2".
- **El core unificado:** `src/lib/agents/somnio-v4/core/` (`turn-orchestrator.ts`,
  `drain.ts`, `checkpoint-gate.ts`, `restart-context.ts`, `types.ts`).
- **Standalones que construyeron esto:**
  - `.planning/standalone/debounce-interruption-system-v2/` (base: lock + checkpoints + observability).
  - `.planning/standalone/debounce-v2-interrupt-reprocess/` (restart in-lambda para Path A).
  - `.planning/standalone/debounce-v2-sandbox-integration/` (paridad sandbox por disciplina — superada por la consolidación).
  - `.planning/standalone/somnio-v4-consolidation/` (**core único — paridad POR CONSTRUCCIÓN**; reduce este doc, D-07).
