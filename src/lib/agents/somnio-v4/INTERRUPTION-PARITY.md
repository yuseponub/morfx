# Sistema de Interrupción v4 — Contrato de Paridad Producción ↔ Sandbox

> **Audiencia:** cualquier dev que toque el engine del sandbox (`engine-v4.ts`),
> el runner de producción (`engine/v4-production-runner.ts`), o el módulo de
> coordinación (`interruption-system-v2/`).
>
> **Regla de oro:** producción y sandbox **NO comparten código**, pero **DEBEN
> comportarse igual en mecanismo**. Si cambiás cómo funciona la interrupción en
> uno, tenés que reflejar el MISMO comportamiento en el otro. El sandbox existe
> para probar producción — si divergen en mecanismo, el sandbox miente.

---

## 1. Qué problema resuelve

Cuando un cliente manda un mensaje y el bot empieza a responder, el cliente puede
mandar OTRO mensaje antes de que el bot termine. Sin coordinación, dos lambdas
procesarían la misma conversación en paralelo y el bot respondería pisado,
duplicado, o desordenado.

El sistema garantiza que **un solo turno se procesa a la vez por conversación**, y
que un mensaje que llega mientras el bot trabaja **nunca se pierde**: o se combina
con el turno en curso (Path A) o se contesta limpio justo después (Path B).

Solo aplica a **`somnio-sales-v4`**. v3 / godentist / recompra / pw-confirmation
siguen con el polling de Phase 31 (Regla 6 — intactos). v4 está **DORMANT** en
producción (0 workspaces); se activa per-workspace con
`UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`.

---

## 2. El mecanismo (conceptos compartidos — idénticos en ambos lados)

Todo esto vive en `src/lib/agents/interruption-system-v2/` y lo consumen IGUAL
producción y sandbox. Este módulo es la **única fuente de verdad del mecanismo**.

| Concepto | Qué es |
|---|---|
| **Lock** (`lock:{ws}:{channel}:{identifier}`) | Redis `SET NX` + `holder_uuid` (fencing token). El primer lambda que lo toma es **HOLDER**; los demás son **FOLLOWER**. TTL 45s, renovado por heartbeat cada 5s. |
| **Pending list** (`pending:{ws}:{channel}:{identifier}`) | Lista Redis (RPUSH). Cada mensaje inbound se apila aquí, INCLUYENDO el del propio holder (para recuperación ante crash). |
| **Interrupt key** (`interrupt:{ws}:{channel}:{identifier}`) | Señal con TTL 60s que un FOLLOWER setea para avisar "llegó algo nuevo". |
| **Checkpoints** (CKPT-0 … CKPT-7.N) | 8 puntos discretos entre etapas del turno donde el holder pregunta "¿me interrumpieron? / ¿sigo siendo dueño del lock?". |
| **Path A (combinar)** | La interrupción llegó **antes de enviar cualquier mensaje** → se drena la pending list, se combina con el mensaje en curso, y se re-corre el turno desde arriba. |
| **Path B (reprocesar limpio)** | La interrupción llegó **después de enviar ≥1 mensaje** → se DESCARTA el resto de la respuesta vieja y se contesta el/los mensaje(s) nuevo(s) limpio, en el mismo lambda. |
| **Restart loop** (`while (shouldRestart)`) | El turno se re-corre en el MISMO lambda bajo el MISMO lock. Sin re-dispatch. |

### Dos helpers críticos (bug 2026-05-28 — deben existir en AMBOS lados)

- **`dropOwnEntry`** — el holder apila su propio mensaje en la pending list. Al
  drenar (Path A o Path B), hay que **excluir la entrada propia del holder** por
  `entry_uuid` (parseado de `ownPendingEntryJson`), si no el mensaje se combina
  consigo mismo (`"hola\nhola\n…"` = el bug del "hola" fantasma).
- **`carryState`** — en un reproceso Path B, la iteración nueva debe sembrarse
  con el **estado resultante de la iteración previa** (intents vistos + templates
  enviados), si no el bot **re-saluda** y **re-envía** lo que ya mandó. En Path A
  `carryState` queda null (se re-corre desde el estado original, a propósito).

### Acumulación (estructural, no parche)

`readAndClearPending` drena la lista **completa**, y el `while` loop re-corre ante
cada interrupción nueva. Por eso N mensajes apilados (msg2+msg3+msg4) se contestan
juntos, y una interrupción durante el reproceso se agarra en la siguiente vuelta.
No hay casos especiales por cantidad de mensajes.

---

## 3. Mapa lado-a-lado (mismo mecanismo, distinto código)

| Etapa | Producción | Sandbox |
|---|---|---|
| **Entrada / adquisición del lock** | `webhook-handler.ts` (HOLDER/FOLLOWER, push a pending, set interrupt key) → evento Inngest | `app/api/sandbox/process/route.ts` (mismo HOLDER/FOLLOWER, respuesta NDJSON streaming) |
| **Orquestación del turno + restart loop** | `engine/v4-production-runner.ts` (`processMessage`) | `somnio-v4/engine-v4.ts` (`SomnioV4Engine.processMessage`) |
| **Lógica del agente (comprensión, state machine, sub-loop)** | `somnio-v4/` (mismo código) | `somnio-v4/` (mismo código) |
| **Envío + CKPT-7.N por template** | `V4MessagingAdapter.shouldAbortBeforeTemplate` (checkpoint real, envío async vía dominio) | loop sintético CKPT-7.N en `engine-v4.ts` + callback `onMessage` (no envía a WhatsApp; stream al browser) |
| **Sitios Path A** | CKPT-0, discriminator, CKPT-6a, CKPT-6b (4) | CKPT-0, discriminator, CKPT-6, CKPT-7.0 (4) |
| **Sitios Path B** | send-loop CKPT-7.N + CKPT-6b cross-turn | CKPT-7.N (i>0) |

**Por qué el código difiere (diferencias intencionales — NO son divergencias de mecanismo):**
- Producción envía a WhatsApp async vía adapter + dominio; el sandbox no envía
  nada real, hace stream NDJSON al browser para revelar templates progresivamente.
- Producción persiste estado en DB (Supabase); el sandbox lo devuelve en memoria.
- El sandbox **simula** el timing de producción (`simulateProdTimingMs`, delays
  por template) para que la ventana de interrupción sea testeable a mano — en
  producción ese tiempo es real (latencia del LLM + del envío).
- Producción tiene CKPT-6a (envío de templates pendientes de un turno anterior)
  que el sandbox no necesita (no arrastra templates entre turnos).

Ninguna de esas diferencias cambia **qué decide** el sistema ante una
interrupción — solo **cómo se ejecuta** el envío y la persistencia.

---

## 4. Reglas de paridad (LEER antes de tocar cualquiera de los dos)

1. **Cambio de mecanismo = cambio en ambos.** Si modificás Path A/Path B,
   `dropOwnEntry`, `carryState`, el orden de combinación, o cuándo se dispara un
   checkpoint → aplicalo en `engine-v4.ts` **y** en `v4-production-runner.ts`, y
   actualizá los tests de los dos.

2. **El módulo `interruption-system-v2` es la fuente de verdad.** Lock, pending,
   interrupt key, checkpoints y observability NO se reimplementan; ambos lados los
   consumen. Si un comportamiento debe cambiar para los dos, cambialo en el módulo.

3. **El sandbox debe poder reproducir cualquier escenario de producción.** Si en
   producción aparece un caso (ej: cascada de 3 mensajes, interrupción mid-send),
   el sandbox tiene que poder reproducirlo. Si no puede, falta paridad.

4. **Diferencias permitidas:** solo envío real vs stream, persistencia DB vs
   memoria, y timing real vs simulado. Cualquier otra diferencia es un bug de
   paridad.

5. **Regla 6:** los 5 agentes no-v4 quedan byte-idénticos. El path v4 es el único
   que consume este sistema. No filtrar comportamiento de interrupción a v3.

---

## 5. Cómo verificar la paridad

- **Tests automatizados (deben quedar verdes los dos sets):**
  - Sandbox engine: `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts`
    (E1..E10 — happy, Path A en cada checkpoint, Path B reprocess, fantasma, no-regreet).
  - Runner producción: `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts`
    (combine + fantasma) y `v4-production-runner-pathb.test.ts` (Path B reprocess + acumulación).
  - Módulo: `src/lib/agents/interruption-system-v2/__tests__/` (lock, pending, checkpoints, restart-loop S1..S5, observability).

- **Smoke manual en sandbox** (`/sandbox`, Somnio v4):
  - **Path A:** "hola" + "que precio" *antes* de que aparezca el primer mensaje →
    una sola respuesta combinada, sin "hola" duplicado.
  - **Path B:** "hola" → esperar el primer mensaje → "que precio" → conserva lo
    enviado + contesta precio, sin re-saludar.
  - Pestaña **Interruption**: timeline de eventos (`lock_acquired`,
    `msg_aborted_path_a_combined` / `msg_aborted_path_b_solo`,
    `pending_list_combined`, `lock_released_normal`).

---

## 6. Caveat conocido (al 2026-05-28) — ⚠️ OBSOLETO desde el híbrido

> **OBSOLETO (somnio-v4-consolidation, D-17):** este caveat ya **no aplica**. Desde el
> híbrido del standalone `somnio-v4-rag-generative`, el slot resolver emite
> **pseudo-templates `rag:*`** que viajan por el **path de templates** real — el texto
> RAG-generativo se envía como cualquier template (con su manejo de interrupción). El
> branch fallback sin-templates del runner fue borrado en D-14 (`somnio-v4-consolidation`)
> y reemplazado por un warning `v4_messages_without_templates`. Se conserva el texto de
> abajo como contexto histórico; la reducción completa de este doc es D-07 (Plan 12).

**Histórico (al 2026-05-28):** el runner de producción solo **enviaba** por el path de
**templates** (donde vive el manejo de interrupción). El modo **RAG-generativo** de v4
producía un mensaje suelto (`output.messages` sin `templates`) que el runner **no
enviaba** — gap de wiring del standalone `somnio-v4-rag-generative`, **no del sistema
de interrupción**. Como v4 estaba DORMANT, no afectó a clientes.

### Caveat CRM (standalone `somnio-v4-crm-subloop`, al 2026-05-29)

Extiende el caveat RAG-send con la **paridad CRM** (D-22): en **PRODUCCIÓN** el
sub-loop escribe a la DB vía `crm-mutation-tools → domain` (Regla 3 — createOrder /
updateOrder / moveOrderToStage). En **SANDBOX** las mutaciones CRM se **SIMULAN
in-memory** (`simulate:true` en `buildSubLoopTools`, mutation-tools sintéticas, cero
DB write). **AMBOS lados registran la acción CRM en el ledger** (`crmActions`
origen:`'rag'`) en el **MISMO punto del flujo** (post sub-loop, pre `commitTurn`) —
esto es lo que hace el escenario reproducible (§4.3 "el sandbox debe poder reproducir
cualquier escenario de producción"; §4.4 "DB-vs-memoria es diferencia permitida").

Interrupción **mid-mutation** (CKPT-3 / CKPT-4 / CKPT-5 dentro del sub-loop): en
**producción** el doble-ejecutar está cubierto por la **idempotency key**
`somnio-v4-createOrder-{sessionId}` (re-query fresco de `grounding.activeOrder` +
idempotencia persistente en `crm_mutation_idempotency_keys`) + **CAS** en
`moveOrderToStage` (propaga `stage_changed_concurrently` verbatim, sin retry). En
**sandbox** no se escribe nada real, así que **no hay riesgo de doble-mutación**,
pero se simula el **mismo punto de no-retorno** para que la ventana de interrupción
sea testeable a mano (Pitfall 7 parity — el escenario de interrupción mid-CRM se
reproduce igual en ambos lados, solo difiere si toca DB o memoria).

Como v4 está DORMANT (0 workspaces), nada de esto afecta a clientes hoy. La paridad
queda lista para la activación manual (ver `.planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md`).

---

## Parity addendum — dedicated vision branch (`standalone v4-media-audio-image`, Plan 04)

The vision-respond branch lives in **shared `processMessage`** (`somnio-v4-agent.ts:181`),
so production and sandbox exercise the **identical branch** when `visionContext` is supplied.

| Aspect | Production | Sandbox |
|--------|-----------|---------|
| **Classifier** | Gemini Vision (`classifyImage`) runs in `agent-production.ts` media-gate; produces `descripcion` + `categoria` | Gemini classifier does NOT run in sandbox. Caller supplies `visionContext.descripcion` directly in the request body (or the UI). |
| **Branch trigger** | `EngineInput.visionContext` threaded from `ProcessMessageInput.visionContext` (set by `agent-production.ts` after `vision_respond` gate result) → `v4Input.visionContext` in `v4-production-runner.ts` | `V4EngineInput.visionContext` threaded from sandbox route body destructure → `processMessage({ ..., visionContext })` in `engine-v4.ts` |
| **Branch code** | `somnio-v4-agent.ts:181` `if (input.visionContext)` — shared, identical for both | Same — shared `processMessage` |
| **Grounding** | `runSubLoop(reason:'razonamiento_libre', ctx.userMessage=descripcion)` — kb_search + buildGenerationPrompt + threshold + binary backstop (RQ-1) | Same `runSubLoop` call; sub-loop uses `simulate:true` so KB queries run real but CRM is simulated (D-22 parity rule — §4.4 "DB vs memory is an allowed difference") |
| **Delivery** | Runner's 5h-main send loop dispatches `rag:<sourceTopic>` template (:751/:796/:839) | `engine-v4.ts` collect-messages loop handles the `templates` array from output |
| **Interrupt handling** | `errorMessage.startsWith('interrupted_at_ckpt_')` → Path A restart (same as non-vision turns) | Same discriminator; engine-v4 restart loop handles it identically |

**Parity rule (Rule 1 of §4):** if the vision branch behavior changes (threshold, backstop,
`rag:` push shape), the change lives in `somnio-v4-agent.ts` and both prod and sandbox inherit
it automatically (shared code). Only the classifier and the delivery mechanism differ
(allowed per §4 Rule 4: "classifier-only differs: prod media-gate vs sandbox-supplied descripcion").

**Regla 6:** `V4AgentInput.visionContext`, `EngineInput.visionContext`, and
`V4EngineInput.visionContext` are all `?` (optional). The 5 non-v4 agents, v3-production-runner,
and interruption-system-v2 are 0-line-diff vs baseline `85092058`. CheckpointId count stays 8.

---

## Referencias

- Módulo + scope completo: `CLAUDE.md` §"Module Scope: interruption-system-v2".
- Standalones que construyeron esto:
  - `.planning/standalone/debounce-interruption-system-v2/` (base: lock + checkpoints + observability).
  - `.planning/standalone/debounce-v2-interrupt-reprocess/` (restart in-lambda para Path A).
  - `.planning/standalone/debounce-v2-sandbox-integration/` (paridad sandbox).
- Deuda relacionada: `docs/analysis/04-estado-actual-plataforma.md` P1-3 (fallback Gemini).
