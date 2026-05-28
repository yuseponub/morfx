# LEARNINGS — debounce-v2-sandbox-integration

**Shipped:** 2026-05-28
**Plans:** 01-05 (5 plans, 4 waves) + serie de bug-fixes post-plan (esta sesión)
**Sibling:** debounce-v2-interrupt-reprocess (shipped 2026-05-26)
**Parent:** debounce-interruption-system-v2 (shipped 2026-05-26)

---

## Reusable patterns

1. **Distributed-lock wiring into existing engines** — extender el Input con 5
   campos OPCIONALES (lockHandle, lockChannel, lockIdentifier, ownPendingEntryJson,
   sandboxSessionId), envolver el cuerpo en `while (shouldRestart)`, espejar el
   restart-loop del sibling. Cuando los 5 campos están ausentes (callers legacy),
   el engine se comporta byte-idéntico al pre-wiring → migración incremental sin
   riesgo.

2. **D-02 Option C lock-key shape** — cuando D-15 prohíbe cambiar el módulo pero
   necesitás un namespace de aislamiento nuevo, prefijá el identifier en vez de
   extender la union LockChannel. `lock:{ws}:whatsapp:sandbox-{id}` aísla del
   WhatsApp real sin tocar el módulo shipped.

3. **HOLDER/FOLLOWER sync (sandbox) vs async Inngest (prod)** — el FOLLOWER del
   sandbox espera vía long-poll de una key Redis (`sandbox-result:{id}`) que el
   HOLDER escribe ANTES del release en `finally` (Pitfall 5 — orden). Sirve para
   1-2 tabs; NO escala a tráfico productivo (prod usa dispatch Inngest).

4. **Per-tab runtime session id (NO localStorage)** — D-09 exige tabs del mismo
   workspace independientes. `useState(() => generateSessionId())` da un id por
   tab que sobrevive renders pero se regenera al recargar. localStorage queda solo
   para el historial (concern separado del lock id).

5. **Collector wrap es obligatorio o los eventos desaparecen en silencio** —
   Pitfall 3. Sin `runWithCollector(collector, () => engine.processMessage(...))`,
   `getCollector()` retorna null en `emitLockEvent` y cada evento es solo
   `console.log`. La pestaña Interruption lee la DB, no la consola → queda vacía.
   Síntoma: el bot funciona, la pestaña está vacía. Siempre envolver + pasar
   `conversationId` al collector.

6. **Regla 6 anti-leak tests como contratos CI** — los tests R6..R9 espían
   `acquireLock` y asertan CERO llamadas cuando `agentId !== 'somnio-sales-v4'`.
   Envolver el handler en `try { ... } catch { /* expected */ }` para que la
   aserción sea robusta ante fallos del mock del engine no-v4 (engine-success y
   Regla-6-enforcement son claims SEPARADOS).

7. **El stale-closure de React captura el session-id viejo** — `handleSendMessage`
   con `useCallback` no incluía `sandboxLockSessionId` en sus deps → tras "+Nueva"
   el POST mandaba el id viejo mientras la pestaña consultaba el nuevo (pestaña en
   blanco). Fix: `sandboxLockSessionIdRef` sincronizado por useEffect y leído en el
   POST. Patrón: cualquier valor que cambie fuera de las deps de un useCallback y
   se use en un fetch debe ir por ref.

---

## Gotchas (descubiertos durante los smokes — NO estaban en Plans 01-04)

- **`readAndClearPending` NO borra la interrupt key** → loop infinito Path A. La
  key tiene TTL 60s; tras drenar la lista, el siguiente checkpoint la re-leía,
  re-entraba Path A con pending vacío, y giraba ~65 restarts/seg hasta que el TTL
  expiraba (~70s de stall). Fix: helper `clearInterrupt` llamado en TODOS los
  sitios Path A (3 sandbox + 4 prod). Los autores del parent CONOCÍAN el riesgo
  (nota de diseño en restart-loop.test.ts S3) pero solo lo evitaban en tests; el
  bug era latente en producción también. **Lección: un riesgo "evitado en tests"
  no es un riesgo arreglado en el código.** (commit 47152c28)

- **El holder apila su PROPIO mensaje en pending → "hola" fantasma** — el route/
  webhook hace push del inbound del holder a la lista (para crash-recovery). Todos
  los sitios de drenado Path A corren ANTES del primer envío (donde el adapter haría
  el LREM-self), así que al drenar volvía la entrada propia y se combinaba consigo
  misma (`"hola\nhola\n…"`). Fix: `dropOwnEntry` filtra por `entry_uuid` (parseado
  de `ownPendingEntryJson`). **Producción tenía el MISMO bug latente** en el combine
  Path A — el adapter solo hace `removeOwnEntry` post-primer-envío, que no cubre los
  combines pre-envío. (commit 73eb0762)

- **El reproceso Path B re-saludaba** — al contestar el mensaje que interrumpe, la
  iteración nueva se sembraba con el estado ORIGINAL (intents vacíos) → la
  response-track creía que el saludo nunca se mandó. Fix: `carryState` arrastra el
  estado resultante de la iteración previa (intents + templates enviados) solo en
  Path B; en Path A queda null (combine re-corre desde el estado original, a
  propósito). (commit 73eb0762)

- **Path B descartaba el mensaje que interrumpe** — diseño original difería msg2 al
  próximo turno; si el cliente interrumpía y se callaba, msg2 quedaba huérfano en la
  lista pending hasta el TTL. Decisión del usuario: NUNCA dropear. Fix: Path B drena
  + contesta limpio en el mismo lambda (sandbox commit e1af015b; producción c4045c29).

- **El cron barría el lock del sandbox** — `v2-lock-cleanup-cron` compara contra
  `agent_sessions.status='active'`; el lock del sandbox usa un session id sintético
  que nunca está en esa tabla → lo barría mid-turno (zombie_lambda_exit, sin
  respuesta). Fix: el cron salta locks con prefijo `sandbox-` salvo que superen
  MAX_TURN_AGE_S (60s). (commit 179d6725)

- **Acumulación es estructural, no parche** — `readAndClearPending` drena la lista
  COMPLETA + el `while` loop re-corre ante cada interrupción → N mensajes apilados
  (msg2+msg3+…) se contestan juntos, y una interrupción durante el reproceso se
  agarra en la vuelta siguiente. Sin casos especiales por cantidad.

- **El path RAG de v4 no envía por el runner de prod (gap conocido)** — el agente
  RAG-generativo retorna `output.messages` sin `templates`; el runner solo envía por
  el bloque de templates. Gap de wiring del standalone `somnio-v4-rag-generative`,
  NO del sistema de interrupción.

---

## Patrón nuevo y central: paridad producción ↔ sandbox

**Lección principal de este standalone.** Producción (`engine/v4-production-runner.ts`)
y sandbox (`somnio-v4/engine-v4.ts`) NO comparten código pero DEBEN comportarse
igual en mecanismo. Cada bug de esta sesión apareció en el sandbox PERO existía
también (latente) en producción — el sandbox sirvió de detector temprano. Cuando se
arregló el sandbox, hubo que espejar a producción.

Se materializó en un doc dedicado: **`src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md`**
(con punteros en el header de ambos archivos de código + en `.claude/rules/agent-scope.md`).
Regla de oro: *si cambiás el mecanismo en uno, cambialo en el otro y actualizá los
tests de los dos; el sandbox existe para probar producción — si divergen, el sandbox
miente.*

---

## Decisiones honradas (D-01..D-15)

Todas las D-01..D-15 del DISCUSSION-LOG se mantienen verdes (ver per-plan SUMMARYs).
**Enmiendas/cambios de comportamiento de esta sesión** (decisión usuario 2026-05-28):
- **Path B ya NO difiere** el mensaje que interrumpe — lo reprocesa en el mismo
  lambda (cambia el espíritu de D-05 "post-send no restart": ahora SÍ reprocesa para
  contestar el mensaje nuevo, pero NUNCA re-corre msg1 — descarta su resto). El test
  S4 del parent (restart-loop.test.ts) se reescribió a este comportamiento.

---

## Activation path

Este standalone hace el path v4 debuggeable en `/sandbox` y deja el mecanismo de
interrupción completo en prod, pero NO activa v4. Sigue DORMANT (0 workspaces). Para
activar per-workspace:
```sql
UPDATE workspace_agent_config
SET conversational_agent_id = 'somnio-sales-v4'
WHERE workspace_id = '<uuid>';
```
Tras activar: ejecutar parent D-19 Phase 3 (Vercel preview + WhatsApp real). Y cerrar
el gap de envío RAG (standalone `somnio-v4-rag-generative`).

---

## Archivos tocados (incluyendo fixes de esta sesión)

**Plans 01-04 (wiring base):**
- NEW: `src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts`
- NEW: tests `engine-v4-lock.test.ts`, `route-v4-lock.test.ts`, `lock-result/.../route.test.ts`
- EDIT: `somnio-v4/engine-v4.ts`, `app/api/sandbox/process/route.ts`, `sandbox-layout.tsx`, debug-panel tabs, `observability/types.ts`

**Fixes de esta sesión (post-plan):**
- `src/inngest/functions/v2-lock-cleanup-cron.ts` (+ test) — no barrer locks sandbox
- `src/lib/agents/interruption-system-v2/pending.ts` (+ test) — `clearInterrupt`
- `src/lib/agents/somnio-v4/engine-v4.ts` — clearInterrupt + dropOwnEntry + carryState + Path B reprocess
- `src/lib/agents/engine/v4-production-runner.ts` — dropOwnEntry + carryState + Path B reprocess (mirror)
- `src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts` (NEW)
- `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (S4 reescrito)
- `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` (NEW — contrato de paridad)
- `docs/analysis/04-estado-actual-plataforma.md` (P1-3 deuda fallback Gemini)

Módulo `interruption-system-v2/` core UNCHANGED salvo el helper aditivo `clearInterrupt` (D-15 respetado).
