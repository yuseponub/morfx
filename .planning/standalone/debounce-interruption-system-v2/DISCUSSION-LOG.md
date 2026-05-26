# DISCUSSION-LOG — Debounce/Interruption System v2

**Standalone:** `debounce-interruption-system-v2`
**Fecha apertura:** 2026-05-25
**Status:** discuss-phase **COMPLETO** (D-01 a D-20 lockeadas). Listo para `/gsd:research-phase`.

---

## Contexto del problema

Sistema actual de interrupciones (Phase 31, v3 + v4 clonado verbatim) tiene gaps críticos:

1. **No hay mutex atómico** — Inngest `concurrency: { key: conversationId, limit: 1 }` es "best effort", el usuario ha visto casos donde 2 respuestas salen en paralelo.
2. **Ventana de detección estrecha** — `hasNewInboundMessage` solo corre entre templates outbound (durante delays artificiales). Si bot envía 1 solo template o `responseSpeed=0`, no hay ventana real.
3. **No protege durante LLM calls** — si cliente manda msg2 mientras Haiku/Gemini está in-flight procesando msg1, el check no corre.
4. **Path A cascade bug** — si Path A dispara turn N y vuelve a disparar turn N+1, se guarda `input.message` (NUEVO), no el `effectiveMessage` combinado → el msg del primer Path A se pierde.
5. **Race entre lambdas paralelas** — si 3 audios entrantes en 2s, 3 lambdas paralelas todas hacen Path A → race en write de `_v3:pendingUserMessage`.

---

## Mecánica deseada (locked desde la conversación con el usuario)

1. Cliente envía msg1 → se activa "señal de procesamiento" desde recepción hasta último template enviado.
2. msg2 llega → revisa la señal. Si activa, msg2 **no se procesa**, queda esperando.
3. Checkpoints distribuidos en TODO el pipeline (comprehension, sub-loop, sales, send, etc.) verifican la señal.
4. Si msg1 detecta interrupción:
   - **No envió nada todavía** → corta limpio, no envía, combina msg1+msg2 en próxima invocación.
   - **Ya envió ≥1 template/mensaje** → corta lo que falta, persiste lo enviado, msg2 procesa **solo**.
5. msg2 espera hasta señal de "puedes proceder" + "este es el effectiveMessage que procesás".

---

## Decisiones lockeadas (D-XX)

### D-01: Store del mutex
**Decisión:** Upstash Redis (REST mode con `@upstash/redis`).
**Razón:** SET NX atómico server-side da garantía dura de exclusión mutua que NO depende de Inngest concurrency hint. Latencia P50 3-8ms en webhook entry y en checkpoints (vs 20-40ms de Supabase). Aislamiento del store principal — caída de Redis no rompe state de sesiones.
**Costo:** ~$3-15/mes para volumen actual. Trivial.
**Alternativas descartadas:**
- Columna en `agent_sessions`: row-level contention con UPDATEs de state.
- Tabla aparte `agent_processing_locks` en Supabase: latencia ~30-80ms por op, menos atómica que SET NX nativo.
- Postgres LISTEN/NOTIFY: requiere conexión persistente, hostil a Vercel serverless.

### D-02: Mecanismo de exclusión mutua
**Decisión:** `SET lock:<wsId>:<channel>:<identifier> <holder_uuid> NX EX 45` como primario.
**Razón:** Atómico server-side. Si 2 lambdas llaman simultáneo, UNA gana, UNA falla. No "best effort", garantía dura.
**Implicación:** NO confiamos en Inngest `concurrency=1` para correctness — puede dejarse a 2-3 o eliminarse para que ambas lambdas dispatchen y arbitren por Redis.

### D-03: Punto más temprano de escritura del lock
**Decisión:** Webhook handler, inmediatamente después de `resolveWorkspaceId()` (T≈35-65ms desde request arrival).
**Razón:** Es el primer punto donde tenemos `(workspaceId, channel, identifier)` — clave suficiente para el lock. NO necesitamos `conversationId` ni `messageId`. ~110-260ms más temprano que la señal actual (que existe solo cuando `messages` row se inserta en T≈175-325ms).
**Detalle de implementación:**
- Si webhook NO logra acquire (otro msg corriendo) → escribe `interrupt:<wsId>:<channel>:<identifier>` + `RPUSH pending:<wsId>:<channel>:<identifier>` con su contenido, responde 200, despacha inngest event con flag `follower=true`.
- msg1 (lock holder) al detectar interrupt en checkpoint, decide Path A (combo) o Path B (solo).

### D-04: Scope inicial de agentes
**Decisión:** Solo `somnio-sales-v4` (dormant en producción).
**Razón:** v4 está dormant — testbed seguro, cero impacto en clientes reales. Tras validación, se puede extender a v3/godentist/recompra/pw-confirmation con commits separados.

### D-05: Profundidad de cola de espera
**Decisión:** Lista RPUSH ilimitada (acumula msg2, msg3, msg4... sin límite).
**Razón:** Cierra el gap del Path A cascade actual donde se pierden mensajes en escenarios de cascada. RPUSH es O(1), no hay penalty de performance.

### D-06: Semántica del combo
**Decisión:** Concat literal con `\n` (status quo del Phase 31).
**Razón:** Simple, sin overhead de LLM call extra. El comprehension Haiku ya tolera multi-msg en una sola entrada. Si en métricas vemos que falla, se reevalúa a "concat con separador explícito" o "síntesis semántica" en v2.1.

### D-07: Rollout
**Decisión:** Big bang en agente dormant (v4) — sin feature flag.
**Razón:** v4 está dormant en prod (sin tráfico real). No hay riesgo de impactar clientes. Si en sandbox y smoke todo OK, ship directo. Feature flag se considera si v3 se migra después (cuando sí hay tráfico real).

### D-08: Phase 31 fate
**Decisión:** Migración completa en v4 — eliminar Phase 31 (`hasNewInboundMessage` + Path A/B logic actual) del path de v4. Phase 31 se mantiene intacto en v3/godentist/recompra/pw-confirmation hasta que se migren (no en este standalone).
**Razón:** Limpia, sin código muerto en v4. Los agentes en prod siguen con Phase 31 hasta su propia migración futura.

### D-09: Robustez multi-capa
**Decisión:** 3 capas prácticas:
1. **try/finally**: webhook handler + runner SIEMPRE hacen `DEL lock` al final del flujo (success o error).
2. **Heartbeat + TTL**: cada 5 segundos, msg1 hace `EXPIRE lock 45`. Si lambda muere, no extiende → expira en máx 40-45s (heartbeat-miss + TTL).
3. **Cleanup cron**: Inngest cron cada 5min sweeppea locks "colgados" comparando con `agent_sessions` activas (defensa contra silly bugs).

### D-10: Lock granularity
**Decisión:** `lock:<wsId>:<channel>:<identifier>` donde `identifier = phone` (WhatsApp) o `external_subscriber_id` (FB/IG).
**Razón:** Disponible en T≈35-65ms. Funciona porque 1 persona = 1 conversación por canal. NO usamos `conversationId` porque está disponible más tarde (~145ms) y no aporta nada para el lock.

### D-11: Observability
**Decisión:** Tres canales combinados:
1. **Eventos `pipeline_decision:*`** en tabla `agent_observability_events` (granular, persistente, queryable).
2. **Logs estructurados** (console.log + Vercel logs) con `lockHolderUuid`, `msgId`, `wsId`, `phone` para debugging post-deploy.
3. **Sandbox debug panel** — tab nuevo "Interruption" que muestra lifecycle del lock por turno (acquire/release timestamps, pending list, abort point, combo result).
**Lista exacta de eventos:** PEND-17 (próxima tanda).

### D-12: Canales cubiertos
**Decisión:** WhatsApp + FB/IG (todos los canales inbound). Sistema vive en webhook-handler layer común — cubre cualquier canal automáticamente.
**Implicación:** Aunque v4 (donde shipea primero) solo atiende WhatsApp, el lock infrastructure ya cubre FB/IG para cuando godentist-fb-ig o futuro v4-FB se migren.

### D-13: No side-channel polling durante LLM calls
**Decisión:** No usar `setInterval` + `AbortController.signal` para cancelar LLM calls mid-stream. Solo checkpoints discretos entre steps del pipeline.
**Razón:** Simplicidad de código mayor (cero AbortController plumbing, cero race entre abort y finish). Trade-off aceptado: worst-case reactividad conventional path ~1-1.5s, sub-loop ~5-17s. Sub-loop es ~10-15% de turnos. Costo Redis baja a ~$3-5/mes.
**Implicación:** LLM calls (Haiku, gpt-4.1-mini, Gemini Flash) siempre corren hasta completar. msg1 detecta interrupt SOLO en checkpoints discretos entre llamadas.

### D-14: Inngest role
**Decisión:** Inngest se mantiene como infraestructura async (dispatch + retries + step.run replay + observability). Su feature `concurrency: { key: conversationId, limit: 1 }` se elimina o sube a `limit: 10` (cap defensivo, no para correctness). Redis SET NX es el ÚNICO mecanismo de correctness para mutex.
**Razón:** Inngest concurrency es "best effort" con races internos documentados. No se puede confiar en él para garantías duras. Redis SET NX es atómico server-side. Inngest sigue valiendo la pena por todo lo demás (retries, observability, step.run).

### D-15: holder_uuid fencing token
**Decisión:** Cada lambda genera `crypto.randomUUID()` al hacer SET NX y lo guarda en memoria. ANTES de cada side-effect crítico (DB write, send template, dispatch inngest event), verifica:
```ts
const currentLock = JSON.parse(await redis.get(lockKey) ?? '{}')
if (currentLock?.holder_uuid !== myUuid) throw new LostLockError()
```
**Razón:** Defensa contra zombie lambdas (lambdas que se cuelgan >TTL, otra lambda toma el lock, original "despierta" y trata de seguir). El fencing token garantiza que NUNCA hay double-write.

### D-16: Pending list persistence + LREM on first send
**Decisión:** Cuando una lambda adquiere el lock, además de procesar, hace `RPUSH pending:<wsId>:<channel>:<identifier> <my_content>` (se incluye a sí misma en la pending list). Cuando manda el primer template (marca `has_sent_anything=true` en lock value), hace `LREM 1 pending:... <my_content>` — se saca a sí misma de la lista.
**Razón:** Resuelve correctamente los 2 sub-casos del zombie lambda:
- Si holder se cuelga ANTES de enviar nada: pending list aún contiene su contenido → next taker hace combo (msg1+msg2). ✓
- Si holder se cuelga DESPUÉS de enviar al menos 1 template: pending list ya NO contiene su contenido → next taker procesa solo (msg2). ✓
**Implicación:** TTL del lock puede expirar y perder el lock value, pero la pending list NO tiene TTL — persiste hasta cleanup explícito.

### D-17: Granularidad de eventos observability
**Decisión:** Full granular — todos los lifecycle events emiten `pipeline_decision:*` a `agent_observability_events`.
**Lista completa de eventos:**
- `lock_acquired` — al SET NX exitoso. Payload: `{ holder_uuid, msg_id, key, ttl, started_at }`
- `lock_acquire_failed_follower` — al SET NX fallido. Payload: `{ existing_holder_uuid, my_msg_id, key }`
- `interrupt_written` — follower escribe interrupt + RPUSH pending. Payload: `{ msg_id, pending_list_length }`
- `interrupt_detected_at_ckpt_N` — holder detecta interrupt. Payload: `{ checkpoint_id, my_holder_uuid, interrupt_msg_id }`
- `msg_aborted_path_a_combined` — abort sin sends, próximo turn = combo. Payload: `{ combined_msg_count, total_chars }`
- `msg_aborted_path_b_solo` — abort post-send, próximo turn = solo. Payload: `{ templates_sent_before_abort }`
- `lock_released_normal` — DEL lock al final exitoso. Payload: `{ holder_uuid, duration_ms, templates_sent }`
- `follower_woke` — follower ve lock vacío y trata acquire. Payload: `{ wait_duration_ms }`
- `lock_force_acquired_after_ttl_expiry` — follower toma lock cuyo TTL expiró. Payload: `{ previous_holder_uuid, expired_ago_estimate_ms }`
- `zombie_lambda_exit` — holder_uuid mismatch detectado, exit limpio. Payload: `{ my_uuid, current_holder_uuid, at_step }`
- `heartbeat_renewed` — EXPIRE renueva TTL. Payload: `{ holder_uuid, new_ttl }` (puede ser opt-out en prod para reducir ruido)
- `pending_list_combined` — holder lee LRANGE al adquirir. Payload: `{ entries_count, total_chars }`
- `redis_unavailable_fallback_failed` — Redis no responde, sistema pausa (no hay fallback en D-08). Payload: `{ error_message }`

### D-18: Placement exacto de 8 checkpoints en pipeline v4
**Decisión:** 8 checkpoints fijos en orden de ejecución:
- **CKPT-0:** post-acquire en `v4-production-runner.ts:~75` (después de SET NX exitoso, antes de empezar pipeline)
- **CKPT-1:** post-comprehension Haiku call
- **CKPT-2:** post-state-machine (después de guards + transitions, antes de decidir si entra sub-loop)
- **CKPT-3:** post-tooling (solo si sub-loop activo — después de gpt-4.1-mini call)
- **CKPT-4:** post-generation (solo si sub-loop activo — después de Gemini Flash call)
- **CKPT-5:** post-compliance (solo si sub-loop activo — después de compliance verifier)
- **CKPT-6:** pre-send-loop (antes del `for templates` loop)
- **CKPT-7.N:** pre-each-template (antes de mandar template N en el loop)

**Implementación:** función `await checkpoint(ckptId, holderUuid, redisClient)` que:
1. GET lock + parse holder_uuid
2. Si holder_uuid !== myUuid → throw LostLockError (zombie defense via D-15)
3. GET interrupt key
4. Si existe → branch a Path A (CKPT-0..CKPT-6) o Path B (CKPT-7.N con sentAnything=true)
5. Emit `interrupt_detected_at_ckpt_N` event si aplica

**Coverage por path:**
- Conventional (no sub-loop): CKPT-0, 1, 2, 6, 7.N — ~5-7 GETs total
- Sub-loop: CKPT-0, 1, 2, 3, 4, 5, 6, 7.N — ~8-12 GETs total

### D-19: Plan de smoke testing exhaustivo
**Decisión:** 4 fases secuenciales antes de shipping a Vercel prod:

**Fase 1 — Unit tests primitives (Vitest):**
- `lock.ts`: `acquireLock()`, `releaseLock()`, `renewLockTTL()`, `assertHoldsLock()` con mocks de Redis
- `pending.ts`: `pushToPending()`, `removeOwnEntry()`, `readAndClearPending()`
- `checkpoints.ts`: `checkpoint()` con todos los branches (no-interrupt, interrupt+pathA, interrupt+pathB, zombie)
- Fencing token: scenarios donde 2 lambdas modifican lock simultáneo

**Fase 2 — E2E scenarios en sandbox local (puerto 3020):**
- **S1:** msg1 procesa solo, no hay msg2, completa normal. Verificar lock acquire/release lifecycle limpio.
- **S2:** msg1 + msg2 race (mandar 2 mensajes con <500ms de diferencia). Verificar UNA lambda procesa, otra hace combo en próximo turn. Output esperado: 1 sola respuesta combinada.
- **S3:** msg1 hangs simulado (inyectar `await sleep(50000)` en una LLM call mock) → TTL expira → msg2 force-acquire → procesa combo. Verificar `lock_force_acquired_after_ttl_expiry` evento + msg1 zombie exit con `zombie_lambda_exit`.
- **S4:** msg1 envía 1 template → llega msg2 → msg1 aborta Path B → msg2 procesa solo (NO combo). Verificar `msg_aborted_path_b_solo` evento + no se duplica el contenido ya enviado.

**Fase 3 — Deploy a Vercel preview branch:**
- Push branch a Vercel, obtener preview URL.
- Configurar webhook WhatsApp testing (número de testing Somnio) hacia preview URL.
- Repetir S1-S4 con WhatsApp real.

**Fase 4 — Confirmación visual usuario:**
- Mandar 2-3 ráfagas de mensajes desde WhatsApp testing.
- Verificar Sandbox debug panel tab "Interruption" muestra lifecycle correcto.
- Inspeccionar `agent_observability_events` para confirmar eventos esperados.

**Criterio de ship:** las 4 fases pasan sin issues. Si Fase 3 o 4 falla, no se promueve a prod.

### D-20: Pending list entry format
**Decisión:** Cada entry en pending list es `{ entry_uuid: <crypto.randomUUID()>, content: <msg text>, received_at: <ISO timestamp>, msg_id: <original msg id> }` serializado como JSON.
**LREM strategy:** `LREM pending:... 1 <exact_json_string>` — funciona porque cada entry tiene `entry_uuid` único garantizado, no hay colisiones con strings idénticos.
**Razón:** Robusto a serialization edge cases (key order, whitespace) porque cada entry tiene identifier único. El holder al hacer RPUSH también guarda su `entry_uuid` en memoria, y al hacer LREM busca el JSON exacto (que sabe construir porque guardó la misma estructura).

---

## Timings finales lockeados

| Cosa | Valor |
|---|---|
| Lock TTL inicial | **45s** (D-09 + ajuste user 2026-05-25) |
| Heartbeat | cada **5s**, renueva TTL a 45s |
| Polling msg1 durante LLM call | **N/A** — no side-channel (D-13) |
| Polling msg1 entre checkpoints | **event-driven** — GET al final de cada step, sin rate |
| Polling follower (msg2 esperando release) | cada **300ms** |
| Timeout follower antes de force acquire | **60s** (heredado: si TTL expiró pero nadie liberó, follower toma) |
| Cleanup cron Inngest | cada **5min** |

---

## Bugs/gaps del sistema actual que este redesign DEBE cerrar

| # | Gap | Cómo cerrar |
|---|---|---|
| G1 | Path A cascade pierde msgs | RPUSH list permite acumular msg1+msg2+msg3, no se sobreescriben (D-05 + D-16) |
| G2 | Race entre lambdas paralelas en write de `_v3:pendingUserMessage` | SET NX garantiza solo 1 holder (D-02) + holder_uuid fencing (D-15) |
| G3 | Detección lenta (5-15s entre templates) | Checkpoints densos en pipeline (D-13) ~event-driven |
| G4 | Sin protección durante LLM calls | Checkpoint discreto post-LLM-call (D-13) cubre 80% — sub-loop 17s peor caso aceptado |
| G5 | "2 respuestas paralelas" reportado por usuario | Mutex atómico hard via SET NX (D-02) — imposible by design |

---

## Sistema actual que reusamos

- **`pending_templates` table** (Path B) — sigue funcionando para resumir partial sends.
- **`messages` table como ground truth** — Redis es coordinator/signal, DB sigue siendo source of truth.

---

## Files a tocar (estimado pre-research)

### Nuevos
- `src/lib/agents/interruption-system-v2/redis-client.ts` — wrapper @upstash/redis
- `src/lib/agents/interruption-system-v2/lock.ts` — acquire/release/heartbeat/fencing primitives
- `src/lib/agents/interruption-system-v2/checkpoints.ts` — `assertHoldsLock(uuid)` helper
- `src/lib/agents/interruption-system-v2/pending.ts` — RPUSH/LREM/LRANGE operations
- `src/inngest/functions/v2-lock-cleanup-cron.ts` — sweep cron cada 5min
- `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx` — nueva tab

### Modificados
- `src/lib/whatsapp/webhook-handler.ts` — escribir lock + early acquire/follower logic
- `src/app/api/webhooks/manychat/route.ts` o equivalente FB/IG — mismo patrón
- `src/lib/agents/engine/v4-production-runner.ts` — checkpoints + reemplazo Phase 31
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — checkpoints post-LLM
- `src/lib/agents/engine-adapters/production/messaging.ts` — eliminar `hasNewInboundMessage` (solo en v4 path)
- `src/inngest/functions/agent-production.ts` — relajar `concurrency` setting
- `package.json` — agregar `@upstash/redis`
- `.env.local` + Vercel env vars — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

---

## Pre-research notes

Investigar antes de plan-phase:
- ¿`@upstash/redis` REST mode tiene la latencia P50 que afirmamos (3-8ms)? Confirmar con benchmark desde Vercel function en región IAD/SFO.
- ¿Upstash region más cercana a Vercel deployment? Co-locar para latencia mínima.
- ¿Hay precedente de uso de Redis en el codebase? (probablemente no — greenfield para nosotros).
- ¿Inngest concurrency: si lo eliminamos por completo vs limit=10, cambia algo del comportamiento de retries?
- AI SDK v6: ¿LLM calls (Anthropic, OpenAI gpt-4.1-mini, Google Gemini Flash) cumplen los timings P50/P99 que asumimos en el "peor caso 17s" de D-13? Validar con telemetría existente del sub-loop.
- ¿`@upstash/redis` soporta atómicamente `GET + LREM + EXPIRE` en una sola Lua script call? Si sí, podemos simplificar `removeOwnEntryAndMarkSentAnything()` a 1 round-trip.
- Identificar línea exacta de cada checkpoint (D-18) — pre-research debe leer `v4-production-runner.ts` + `somnio-v4/sub-loop/index.ts` actuales y marcar números de línea exactos para plan-phase.
- Confirmar que el webhook handler de Meta Direct (`src/app/api/webhooks/meta/route.ts` o equivalente) también acepta el patrón de escritura early del lock (mismo flow de WhatsApp 360dialog).

---

*Última actualización: 2026-05-25 — discuss-phase COMPLETO (D-01 a D-20 lockeadas). Listo para `/gsd:research-phase debounce-interruption-system-v2`.*
