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

## 6. Caveat conocido (al 2026-05-28)

El runner de producción solo **envía** por el path de **templates** (donde vive el
manejo de interrupción). El modo **RAG-generativo** de v4 produce un mensaje suelto
(`output.messages` sin `templates`) que el runner **todavía no envía** — gap de
wiring del standalone `somnio-v4-rag-generative` (en progreso), **no del sistema de
interrupción**. La lógica de interrupción ya está completa y correcta en ambos
lados; para que importe en vivo, ese standalone debe terminar de cablear el envío
de la respuesta RAG. Como v4 está DORMANT, no afecta a clientes hoy.

---

## Referencias

- Módulo + scope completo: `CLAUDE.md` §"Module Scope: interruption-system-v2".
- Standalones que construyeron esto:
  - `.planning/standalone/debounce-interruption-system-v2/` (base: lock + checkpoints + observability).
  - `.planning/standalone/debounce-v2-interrupt-reprocess/` (restart in-lambda para Path A).
  - `.planning/standalone/debounce-v2-sandbox-integration/` (paridad sandbox).
- Deuda relacionada: `docs/analysis/04-estado-actual-plataforma.md` P1-3 (fallback Gemini).
