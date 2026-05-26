# DISCUSSION-LOG — debounce-v2-sandbox-integration

**Standalone:** `debounce-v2-sandbox-integration`
**Fecha apertura:** 2026-05-26
**Status:** discuss-phase **MINIMAL** (directriz única del usuario + decisiones derivadas para acotar scope). Listo para `/gsd:research-phase`.

---

## Directriz única del usuario (verbatim)

> "el discuss no veo que necesites de mi, solo ya sabes; que funcione de la misma forma que funcionaria en whatsapp"
>
> "osea lo que quiero es que este sistema funcione en sandbox igual como funcionaria en whatsapp"

**Interpretación operativa:** wirear `interruption-system-v2` (shipped en `debounce-interruption-system-v2` el 2026-05-26) al path sandbox v4 de manera que el comportamiento del lock + checkpoints + observability sea idéntico al path producción WhatsApp/FB/IG. El usuario quiere poder probar el sistema iterativamente desde `/sandbox` sin necesidad de Vercel preview ni 360dialog ni FB/IG real.

---

## Contexto del problema

El standalone padre (`debounce-interruption-system-v2`) shippeó el sistema completo a producción pero **v4 está dormant** (0 workspaces con `conversational_agent_id='somnio-sales-v4'`). Por D-19 línea 185 del padre, dos smokes quedaron deferidos:

- **D-19 Phase 3** (Vercel preview + real WhatsApp): diferido a v4 activation-time per-workspace.
- **D-19 Phase 4** (sandbox visual smoke): **diferido explícitamente a este standalone** (cable lock into SomnioV4Engine so sandbox behaves like WhatsApp real).

El gap concreto:

1. **Path WhatsApp (`webhook-handler.ts` → `V4ProductionRunner` → `somnio-v4-agent` → `sub-loop` → `V4MessagingAdapter`)** tiene los 8 checkpoints wired y `acquireLock`/`releaseLockIfOwner`/`heartbeat` en su lugar.
2. **Path Sandbox (`/api/sandbox/process` → `SomnioV4Engine.processMessage` → `somnio-v4-agent` → `sub-loop`)** comparte el agente y el sub-loop con producción (mismas funciones), por lo que **CKPT-1..5 YA están escritas en el código** desde Plan 05 del padre — pero **nunca disparan en sandbox** porque `lockHandle` nunca se pasa via `V4AgentInput` y los checkpoints tienen skip-guard (`if (!lockHandle) return`).
3. **CKPT-0 + CKPT-6 + heartbeat + try/finally** viven en `V4ProductionRunner` — el sandbox usa el wrapper paralelo `SomnioV4Engine` que NO los tiene.
4. **CKPT-7** vive en `V4MessagingAdapter.shouldAbortBeforeTemplate` — sandbox no manda templates reales por 360dialog, pero sí mapea `output.messages[]` en `SomnioV4Engine.processMessage` → tiene un símil de "send loop" trivial donde aplicar CKPT-7 si quisiéramos paridad estricta.
5. **Interruption debug-panel tab** (shipped Plan 06 del padre, `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx`) ya existe pero lee `agent_observability_events` filtrado por session/conversation — sandbox no genera rows reales en esa tabla con session/conv reales (usa stubs `'sandbox-session'` / `'sandbox-conversation'`).

---

## Decisiones lockeadas (D-XX)

### D-01: Scope de agentes
**Decisión:** Solo `somnio-sales-v4` en sandbox (idéntico al padre D-04).
**Razón:** Padre limitó scope a v4 dormant por seguridad Regla 6. Este standalone no expande scope; solo añade el path sandbox al mismo agente.
**Implicación:** No tocar branches v3/recompra/godentist del route handler.

### D-02: Lock key shape en sandbox
**Decisión:** `lock:{workspaceId}:sandbox:{sandboxSessionId}` — `channel='sandbox'` como literal nuevo agregado al union `LockChannel`.
**Razón:** El usuario quiere que el sandbox actúe como un canal más (paralelo a `whatsapp`/`facebook`/`instagram`). Aislamiento por `sandboxSessionId` para que múltiples tabs del usuario probando en paralelo no se bloqueen entre sí. `workspaceId` real del workspace activo del usuario (no `'sandbox-workspace'` placeholder cuando sea posible).
**Alternativas descartadas:**
- `channel='whatsapp'` reutilizando el canal real: contaminaría keys de prod y rompería el aislamiento.
- `identifier=workspaceId` solo: bloquearía múltiples sandboxes paralelos del mismo workspace.

### D-03: Source de `sandboxSessionId`
**Decisión:** Reutilizar el `sessionId` que el sandbox UI ya gestiona vía `SandboxSession` (path `src/lib/sandbox/sandbox-session.ts`). Si no existe en el payload del request, generar `crypto.randomUUID()` server-side y devolverlo al cliente para que persista.
**Razón:** Cero deuda de schema. El sandbox UI ya tiene sesiones; sólo hay que asegurar que el id viaje al route handler.
**Investigar en research:** confirmar contrato actual del payload `/api/sandbox/process`.

### D-04: 8 checkpoints — paridad total con WhatsApp
**Decisión:** Wirear los 8 checkpoints en sandbox. CKPT-1..5 ya en código (sólo threading falta). CKPT-0 + CKPT-6 nuevos en `SomnioV4Engine.processMessage`. CKPT-7 nuevo en el loop de mapping `output.messages → result.messages[]` dentro de `SomnioV4Engine`.
**Razón:** Directriz literal del usuario "que funcione igual que WhatsApp". Si saltamos CKPT-0/6/7 en sandbox, el comportamiento divergiría y el sandbox dejaría de ser testbed fiel.
**Implicación:** `SomnioV4Engine.processMessage` debe envolver el bloque actual en `try { acquireLock; CKPT-0; processMessage; CKPT-6; releaseLockIfOwner } catch { LostLockError → fail-soft } finally { releaseLockIfOwner }` — patrón idéntico a `V4ProductionRunner`.

### D-05: Heartbeat en sandbox
**Decisión:** SÍ — `startHeartbeat(handle)` durante el processMessage, stop en `finally`. Idéntico a `V4ProductionRunner`.
**Razón:** Si una llamada Gemini se cuelga 60s+ en sandbox, sin heartbeat el TTL=45s expira y otra invocación podría adquirir lock mientras la primera sigue viva — exactamente el bug que el heartbeat resuelve en prod.
**Implicación:** Sandbox tendrá que importar `startHeartbeat` (ya exportado del módulo padre).

### D-06: Path A / Path B en sandbox
**Decisión:** Implementar el follower path completo (HOLDER + FOLLOWER + fail-open) en el route handler de sandbox, antes de instanciar `SomnioV4Engine`.
**Razón:** El test real del sistema es que el usuario pueda mandar msg1 + msg2 rápido en sandbox y observar que msg2 queda como follower (RPUSH pending), msg1 detecta interrupt en algún CKPT, combina ambos y procesa solo. Sin esto, sólo probamos el happy path (1-msg-aislado).
**Implicación:** El route handler tendrá una rama nueva análoga a `webhook-handler.ts` líneas 200-300 (HOLDER acquires + processes; FOLLOWER pushes to pending + responds 202 immediately).

### D-07: Response del route handler en FOLLOWER path
**Decisión:** En sandbox, cuando la invocación es FOLLOWER, responder JSON `{ success: true, deferred: true, reason: 'follower_appended_to_pending', pendingListLength: N }` con HTTP 200 (no 202). El UI sandbox no espera dispatch async — el HOLDER al detectar interrupt es quien procesa y devuelve.
**Razón:** El sandbox no tiene Inngest dispatch ni jobs background — todo es request/response síncrono. El UI necesita una forma de saber "tu mensaje quedó en cola, espera la respuesta combinada que el HOLDER va a devolver en SU response".
**Implicación nueva en UI:** sandbox UI debe poll-or-stream la respuesta del HOLDER cuando recibe `deferred: true`. **Investigar en research:** mecanismo más simple — quizás un long-poll de 30s sobre el `sandboxSessionId` o un GET `/api/sandbox/pending/:sessionId` que espere hasta que HOLDER libere lock + devuelva el resultado de Path A combo.

### D-08: Interruption debug-panel tab — datos reales
**Decisión:** El sandbox UI ya tiene la pestaña "Interruption" (Plan 06 del padre). La conectaremos pasando el `sandboxSessionId` + `workspaceId` real al tab para que filtre `agent_observability_events` por esos valores. Los eventos `pipeline_decision:lock_*` que emite el módulo `interruption-system-v2/observability.ts` se persisten via collector → DB normal flow.
**Razón:** Reutilizar infra existente. El collector ya graba en `agent_observability_events` (Plan 06 padre). Sólo hay que asegurar que la tabla recibe rows con `session_id=sandboxSessionId` y `conversation_id=sandboxSessionId` (ambos iguales en sandbox; no hay conversation real).
**Investigar en research:** dónde se inicializa el `ObservabilityCollector` en el path sandbox; cómo asegurar que los `conversationId/sessionId` no son los stubs sino el `sandboxSessionId` real.

### D-09: Aislamiento entre sandbox tabs del MISMO workspace
**Decisión:** Cada sandbox session es su propio `sandboxSessionId` → su propia lock key. Tab A y Tab B del mismo usuario en el mismo workspace NO se bloquean.
**Razón:** Workflow real del usuario es tener múltiples conversaciones de prueba abiertas. Si un test largo en Tab A bloquea Tab B, la UX es inutilizable.

### D-10: Aislamiento entre sandbox y producción
**Decisión:** `channel='sandbox'` como literal separado de `'whatsapp'`/`'facebook'`/`'instagram'`. Lock keys de sandbox y prod NUNCA colisionan aunque usen el mismo `workspaceId` real.
**Razón:** Si un cliente real (prod) está siendo procesado para `+57300...` y el operador hace un test en sandbox para el mismo `workspaceId`, los locks deben ser independientes. Distintos canales = distintos keyspaces (el shape `lock:{ws}:{channel}:{id}` ya garantiza esto).

### D-11: Cron sweep en sandbox
**Decisión:** El cron `v2-lock-cleanup-cron` (shipped Plan 06 padre) ya sweeppea TODOS los locks `lock:*` comparando contra `agent_sessions.status='active'`. Si una sandbox session queda colgada (lock vivo sin agent_session activo), el cron lo sweeppeará — pero el sandbox NO crea rows en `agent_sessions` (es path paralelo).
**Implicación:** Investigar en research cómo evitar falsos positivos del cron sweeping locks de sandbox sesiones legítimas en curso. Opciones:
- (a) Sandbox crea row temporal en `agent_sessions` con `status='active'` durante el turn y la marca `closed` al final → cron la respeta.
- (b) Cron extendido para reconocer `channel='sandbox'` y usar un proxy alternativo (ej: Redis key `sandbox:session:active:{sessionId}` con TTL renovado por heartbeat).
- (c) Sandbox no se preocupa por cron sweep (TTL=45s + heartbeat es suficiente; si el turn supera 5min y muere, sweep limpia y siguiente turn re-acquire).
**Decisión preliminar:** opción (c) — sandbox vive con el comportamiento default del cron, sin special-casing. Si en testing surge problema real, se reevalúa.

### D-12: Sin migración DB
**Decisión:** Cero migraciones SQL en este standalone.
**Razón:** El módulo `interruption-system-v2` no tiene tablas propias (Redis-only). El collector ya escribe a `agent_observability_events` (table existente del Plan 06 padre). El sandbox session id se persiste client-side; si necesitamos row temporal en `agent_sessions` (D-11 opción a, descartada) ya existe la tabla.

### D-13: Sin feature flag
**Decisión:** Sin flag — el wiring del sandbox es opt-in por naturaleza (sólo se ejecuta cuando `agentId === 'somnio-sales-v4'` en `/api/sandbox/process`, branch que el usuario elige conscientemente en el UI dropdown).
**Razón:** El sandbox no afecta prod (Regla 6 ya satisfecha por D-04 padre + D-01 aquí). El usuario ya está haciendo testing manual al entrar a `/sandbox` → no hay riesgo de "activación accidental para clientes reales".

### D-14: Tests
**Decisión:** Unit tests para lock acquisition/release/checkpoint dispatch en sandbox engine (paralelos a los del runner producción). E2E manual via UI `/sandbox` con escenario S1 (1 msg lock+release happy path) + S2 (msg1 + msg2 rápido — Path A combo) + S3 (msg1 + msg2 después de bot ya envió 1 template — Path B msg2 solo).
**Razón:** El estándar de testing del padre fue 73 vitest green + manual smoke deferido. Este standalone reusa el módulo testeado; sólo añade el threading + entry/exit en sandbox engine. Tests unitarios mínimos pero el valor real está en smoke manual del usuario.

### D-15: Out of scope
- **No tocar webhook handlers** (`whatsapp/webhook-handler.ts`, `manychat/webhook-handler.ts`) — ya shipped.
- **No tocar `V4ProductionRunner`** — ya shipped.
- **No tocar `V4MessagingAdapter`** — ya shipped.
- **No tocar módulo `interruption-system-v2/`** — primitive stable.
- **No extender a v3/godentist/recompra/pw-confirmation** — esos siguen Phase 31 polling (D-04 padre).
- **No tocar cron `v2-lock-cleanup-cron`** — D-11 opción (c) ya decidida.

---

## Open questions para research-phase

1. **OQ-1:** ¿`SandboxSession` ya emite un `sessionId` persistente que viaja al route handler? Si no, ¿cuál es el mecanismo más limpio para que el client genere/persista uno?
2. **OQ-2:** ¿El collector observability en sandbox actualmente recibe `conversationId/sessionId` reales o stubs? Si stubs, ¿dónde se inicializa y cómo lo cambiamos sin romper prod?
3. **OQ-3:** ¿Hay un mecanismo de polling/streaming ya implementado en sandbox que podamos reusar para D-07 (FOLLOWER waiting for HOLDER's combined response)? O necesitamos construir uno.
4. **OQ-4:** ¿Algún test existente en `src/app/api/sandbox/process/__tests__/` (si existe) que cubra el branch v4? Punto de partida para añadir tests.
5. **OQ-5:** El cron sweep verifica `agent_sessions.status='active'` — confirmar que el sandbox v4 path NO crea rows ahí (de lo contrario D-11 cambia).

---

## Hand-off al research

`/gsd:research-phase debounce-v2-sandbox-integration` debe entregar `RESEARCH.md` cubriendo:

- Mapa exacto del data flow sandbox → SomnioV4Engine → agent → sub-loop (líneas de archivo).
- Resolución de OQ-1..OQ-5.
- Identificación de los 8 sites de checkpoint en sandbox path (CKPT-0..7).
- Estrategia concreta para el FOLLOWER waiting (D-07) — polling vs streaming vs SSE.
- Lista de archivos a tocar con LOC estimado por archivo.
- Pitfalls esperados (clone-from-prod hazards, `lockHandle` nullability gates).

Sin nuevas decisiones a lockear — `/gsd:plan-phase` arranca directo tras research si todo OQ resuelve sin sorpresas.
