# DISCUSSION-LOG — debounce-v2-interrupt-reprocess

**Standalone:** `debounce-v2-interrupt-reprocess`
**Fecha apertura:** 2026-05-26
**Status:** discuss-phase **COMPLETO** (D-01..D-09 lockeadas). Listo para `/gsd:research-phase`.

---

## Contexto del problema

Durante el inicio del standalone hermano `debounce-v2-sandbox-integration`, leyendo el código que shippeó el padre `debounce-interruption-system-v2` se descubrió que el comportamiento real en interrupción de Path A NO procesa la combinación — la persiste como `_v3:pendingUserMessage` y retorna en silencio. El combinado se drena recién en el **siguiente mensaje inbound del cliente** (o un timer L1/L2).

### El bug exacto

`src/lib/agents/engine/v4-production-runner.ts:143-182, :330-372, :444-491` — todos los handlers Path A del runner hacen:

```typescript
const combinedMessage = [...pending.map(p => p.content), input.message].join('\n')
await this.adapters.storage.saveState(session.id, {
  datos_capturados: {
    ...,
    '_v3:pendingUserMessage': combinedMessage,
  },
})
return { success: true, messages: [], sessionId, messagesSent: 0 }
```

Mismo pattern en `somnio-v4-agent.ts:137-156, :335-355` y `sub-loop/index.ts:113-120` (vía helper `ckptInSubLoop`).

`webhook-handler.ts:381` confirma: `console.log('[interruption-v2] follower path — no Inngest dispatch for msg ${msg.id}')` — el FOLLOWER NO dispara su propio Inngest, sólo se mete en `pending:*` y escribe `interrupt:*`.

### Consecuencia UX

Si el cliente manda **exactamente 2 mensajes** y para de tipear, el bot **se queda mudo** hasta que el cliente mande un msg3 o un timer L1/L2 de silencio dispare auto-respuesta. Esto **NO** es lo que el diseño debería hacer; es deuda heredada de Phase 31 que el v2 no arregló.

### El diseño correcto (verbatim del usuario)

> "si manda 2 mensajes debe ir enviando y procesando... si se para procesamiento uno y se une 1+2, entonces ahi debe empezar a procesar, ya si luego llega un 3er mensaje vuelve a pasar lo mismo, se debe parar procesamiento de 1+2 y combinarlo con 3"
>
> "otro ej seria si se esta procesando msg1 y llega msg2, y mientras se para el procesamiento de ms1 llega msg3, entonces en el waitlist esta msg2+msg3 esperando a msg1 a ver que hace, si ya envio algo que procesan esos 2 y si no se envio nada se suma a msg2+msg3"

**Mecánica:** al detectar interrupt en cualquier checkpoint, NO retornar silente. En su lugar:
- Path A (no sends en este turn): drenar `pending` + combinar con `input.message` → **RE-INICIAR el procesamiento** en la MISMA lambda con `effectiveMessage = combined`. Repetir el ciclo si más interrupts llegan durante el restart.
- Path B (ya envió ≥1 template): abortar resto de sends. Si hay pending: drenar pending + RE-INICIAR procesamiento en la MISMA lambda con `effectiveMessage = pending solo` (SIN msg1, porque msg1 ya tuvo respuesta parcial).

---

## Decisiones lockeadas (D-XX)

### D-01: Path B scope (waitlist procesa SOLO pending, sin msg1)
**Decisión:** Cuando msg1 ya envió ≥1 template y se detecta interrupt con pending no vacío, el restart procesa **EXCLUSIVAMENTE** `pending` (msg2+msg3+...) como un `effectiveMessage` nuevo. msg1 NO se re-incluye porque ya tuvo respuesta parcial.
**Razón:** Evita duplicados (bot re-respondiendo a msg1). msg1 queda "cerrado parcial" — el cliente ya tiene templates del intent de msg1; el restart procesa solo lo que faltó atender.
**Implicación:** El restart de Path B re-corre comprehension con `effectiveMessage = [msg2, msg3].join('\n')`. NO se re-corre con `[msg1, msg2, msg3]`.

### D-02: Re-comprehension nueva en cada restart
**Decisión:** Cada restart del loop hace una llamada NUEVA a Haiku (o el modelo de comprehension que esté activo) con el `effectiveMessage` combinado. NO reusar la comprehension del intento previo.
**Razón:** El intent detectado puede cambiar drásticamente al combinar mensajes (ej. msg1="hola" → saludo; msg1+msg2="hola\nprecio" → precio o multi-intent). Reusar la comprehension vieja causaría que el bot ignore el intent del nuevo mensaje.
**Costo:** ~$0.001 USD por restart adicional. Trivial vs el beneficio de respuesta correcta.

### D-03: Sin cap de restarts (confiar en quietud natural)
**Decisión:** El restart loop NO tiene contador artificial ni timeout. Sigue hasta que CKPT-0 (o cualquier CKPT temprano del restart) NO detecte interrupt — momento en que el lambda procesa hasta el final y envía respuesta.
**Razón:** Cada restart es barato (~1-2s: Haiku call + drain + reset state). Cuando el cliente para de tipear ~2s, el siguiente CKPT no ve interrupt y el lambda completa. Sin cap, sin contador. El lock HEARTBEAT (5s, TTL 45s) renueva mientras la lambda está viva — el lock NO expira durante el loop.
**Edge case:** cliente troll mandando 50 msgs en 30s → 50 restarts secuenciales (~100s total). Vercel/Inngest aguanta hasta 15min via `step.run`. Si esto pasa en prod, se evalúa cap en v2.1.

### D-04: El restart pasa en la MISMA lambda del HOLDER
**Decisión:** El restart loop ocurre **dentro de la lambda actual del HOLDER (msg1)** — NO se re-dispara un Inngest event nuevo, NO se invoca otra lambda. El lock permanece adquirido durante todo el restart.
**Razón:** Latencia mínima (no hay overhead de Inngest dispatch + cold-start). El lock + heartbeat ya garantiza exclusión durante todo el procesamiento. Re-dispatch sería complicar sin ganancia.
**Implicación de implementación:** El runner + agent + sub-loop necesitan un loop `while (shouldRestart) { ... }` envolviendo el flujo actual, con `shouldRestart = false` por default y `shouldRestart = true` cuando un CKPT devuelve `interrupted` con pending no vacío.

### D-05: Triggers del restart (TODOS los CKPTs 0..6)
**Decisión:** Cualquier CKPT del 0 al 6 que detecte `interrupted` dispara restart:
- **CKPT-0** (post-acquire) → siempre Path A → restart con `effectiveMessage = pending + input.message`
- **CKPT-1** (post-comprehension) → siempre Path A → restart
- **CKPT-2** (post-state-machine) → siempre Path A → restart
- **CKPT-3** (post-tooling) → siempre Path A → restart
- **CKPT-4** (post-generation) → siempre Path A → restart
- **CKPT-5** (post-compliance) → siempre Path A → restart
- **CKPT-6a** (pre-send-loop pending templates) → Path A si `actuallySentIds.length === 0`, Path B si > 0
- **CKPT-6b** (pre-send-loop main) → Path A o Path B según el contador

**CKPT-7.N** (per-template inside the send loop) NO dispara restart — sigue el comportamiento actual (abortar el send pendiente, persistir lo enviado, salir del send loop, llegar al try/finally del runner → libera lock). El restart-loop **no aplica dentro del send loop** porque eso significaría descartar lo que ya se envió, lo cual es inconsistente con Path B.

**Razón:** Los CKPTs 0..6 son ANTES del primer send (CKPT-6a/b) o en el camino al primer send. Mientras `actuallySentIds.length === 0`, restart es lossless (no se descarta nada enviado). Una vez que entra al send loop (CKPT-7.N), ya hay templates enviados y no podemos "rebobinar" el envío.

### D-06: Scope = v4 only (idéntico al padre)
**Decisión:** El fix aplica EXCLUSIVAMENTE al path v4 (`somnio-sales-v4`). v3, godentist, recompra, pw-confirmation siguen con Phase 31 (sin restart loop) hasta que se migren en standalones futuros.
**Razón:** v4 está dormant en prod (0 workspaces) — testbed seguro. Regla 6 preservada (cero impacto en agentes activos). Mismo gate `if (lockHandle && lockChannel && lockIdentifier)` que ya existe en código actual sigue aplicando — código v3 jamás entra a la nueva lógica de restart.

### D-07: Sin feature flag
**Decisión:** Sin flag — el restart loop es comportamiento default cuando v4 está activo.
**Razón:** v4 dormant en prod. Sin riesgo de rollout. Si se quisiera hacer A/B post-activación, se reevalúa.

### D-08: Sin migración DB
**Decisión:** Cero migraciones SQL.
**Razón:** El fix es 100% lógica de control flow en runner + agent + sub-loop. No cambia ninguna columna ni tabla. El `_v3:pendingUserMessage` queda en datos_capturados como antes pero su uso cambia (ya NO se persiste durante interrupt; se mantiene solo para compatibilidad con sesiones v3 legacy que migran a v4 al flip).

### D-09: Tests
**Decisión:** Unit tests vitest para 3 escenarios:
1. **S1 (happy path):** 1 msg → no interrupt → responde normal. No regresión.
2. **S2 (Path A restart):** msg1 entra, msg2 llega antes de CKPT-1 → CKPT-1 detecta interrupt → restart con `effectiveMessage = "msg2\nmsg1"` → completa sin interrupts → responde combinado.
3. **S3 (Path A restart con múltiples interrupts):** msg1 + msg2 → restart #1 → msg3 llega antes de CKPT-2 del restart → CKPT-2 detecta interrupt → restart #2 con `effectiveMessage = "msg2\nmsg1\nmsg3"` → completa.
4. **S4 (Path B post-send):** msg1 → bot envía template_1 (CKPT-6 OK) → entra al send loop → CKPT-7.1 detecta interrupt → aborta resto del send → libera lock. msg2+msg3 quedan en pending para drenarse en próximo inbound (Path B = NO restart loop, comportamiento actual conservado).
5. **S5 (Regla 6):** v3 runner byte-idéntico a pre-fix — restart loop NO se activa en path v3.

E2E manual en sandbox queda diferido al standalone hermano `debounce-v2-sandbox-integration` (que se reanuda tras shippear este).

---

## Out of scope (explícito)

- No tocar `interruption-system-v2/` módulo (primitive estable; el restart loop pasa fuera, en runner+agent+sub-loop).
- No tocar `V4MessagingAdapter` ni CKPT-7.N (D-05 — el send loop preserva comportamiento actual).
- No tocar webhook handlers (FOLLOWER sigue sin Inngest dispatch — D-03 padre).
- No tocar cron `v2-lock-cleanup-cron`.
- No tocar v3/godentist/recompra/pw-confirmation (D-06).
- No agregar UI nueva — los eventos de observability del restart loop usan los 14 labels existentes (`msg_aborted_path_a_combined` ahora significa "restart triggered" en lugar de "abort silente"). El standalone hermano sandbox-integration mostrará estos eventos en la pestaña Interruption.

---

## Hand-off al research

`/gsd:research-phase debounce-v2-interrupt-reprocess` debe entregar `RESEARCH.md` cubriendo:

- Mapa exacto de los 7 sites de interrupt-detection actuales (CKPT-0, 1, 2, 3, 4, 5, 6a, 6b) y el shape del refactor del runner para envolver con `while (shouldRestart)`.
- Estrategia para el restart en agent + sub-loop: el agent.processMessage actualmente retorna `errorMessage: 'interrupted_at_ckpt_N'` — ¿el runner detecta este discriminator y restart, o el agent maneja su propio restart internamente?
- Manejo del estado entre restarts: ¿reset completo (intentsVistos vacío, datosCapturados como llegó) o conservar lo capturado del intento anterior? Lock down en research basándose en lectura del código.
- Pitfalls: re-entrancia del state machine, tokens contados doble, observability events duplicados, llamadas a tools/Gemini que dejan side-effects (KB writes, etc).
- File touch list con LOC estimado.
- Confirmación de que CKPT-7.N (send loop) NO se toca (D-05).

Sin nuevas decisiones a lockear — research → plan → execute.
