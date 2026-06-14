# v4-handoff-soft-signal — Context

**Gathered:** 2026-06-13
**Status:** Ready for planning (discuss capturado en conversación 2026-06-13; ver `<code_context>`)
**Type:** Standalone (no roadmap phase — mismo patrón que `v4-gate-confidence-fixes`, `v4-dual-intent-query-split`)

<domain>
## Phase Boundary

Refactor **aditivo** del agente `somnio-sales-v4` (DORMANT en prod) que **separa la SEÑAL de handoff de la DECISIÓN de handoff**. Hoy v4 toma una decisión DURA (apaga el bot vía `storage.handoff` → `handoffSession`) en cada punto donde determina handoff. Esto es visión de túnel: v4 ve 1 mensaje (o 2 combinados) y no debería tomar una decisión irreversible de apagar el bot.

Este standalone hace 3 cosas, todas en la superficie "qué hace/escribe v4 ante un outcome de handoff":

**EN SCOPE:**
1. **Handoff duro → señal blanda (`handoff_suggested`):** en los puntos donde v4 hoy determina handoff, en vez de apagar el bot, emite una señal estructurada (`reason` + `gate` + `topic`) y **el bot sigue**. La decisión dura del apagado la tomará un **handoff agent** futuro (ver `.planning/standalone/handoff-agent/FUTURE-CONTEXT.md`). Gateado por flag (Regla 6).
2. **Razón de handoff visible en el inbox (por ahora):** surface la razón en la conversación como una **sugerencia** ("⚠ sugerencia de handoff — motivo: X"), NO como "bot apagado". Nota interna (`direction:'outbound'`), NO se envía al cliente (insert directo, igual que el `[ERROR AGENTE]` actual).
3. **Limpieza del falso positivo zombie:** `V4_ZOMBIE_LAMBDA_EXIT` en `ckpt_0_post_acquire` deja de escribirse como `[ERROR AGENTE]` en el inbox (es benigno — verificado: siempre `at_step=ckpt_0` + `turn_completed=true`, el lambda ganador completa). El evento `zombie_lambda_exit` SIGUE en observability; los zombies en checkpoint posterior o turnos sin completar SÍ siguen visibles (red de seguridad).

**NO ES ESTA FASE (deferidos):**
- El **handoff agent** en sí (milestone futuro — ver FUTURE-CONTEXT.md). Este standalone solo PRODUCE la señal que ese agente consumirá.
- Re-entrada / anti-oscilación (¿el bot vuelve tras apagarse?) — se decide cuando se construya el agente.
- Persistencia estructurada de la razón en `agent_sessions` + badge UI (Opción C) — diferido; por ahora solo nota en inbox + observability.

**Regla 6:** v4 sigue DORMANT; cero cambio para v3/godentist/recompra/pw-confirmation/varixcenter. El handoff duro queda detrás de un flag para poder volver al comportamiento anterior.
</domain>

<decisions>
## Implementation Decisions

### D-01 — La señal = puntos de determinación de handoff REALES (deterministas, no agregados difusos)
- **Decisión:** la señal `handoff_suggested` se emite EXACTAMENTE donde v4 hoy determina handoff. NO se usan métricas difusas (conteo de turnos de baja confianza, sentimiento) — eso quedaría para el handoff agent si lo necesita, pero el contrato base es el evento determinista.
- **Mapa de puntos (capa comprehension — `somnio-v4-agent.ts`):**
  - Guards R0/R1 (escape intents: asesor, queja, cancelar…) — `:494-518` (`decisionInfo.action='handoff'`).
  - Visión (imagen producto/página): error o no_match — `:224-339` (edge D-07).
- **Mapa de puntos (capa sub-loop — `sub-loop/index.ts`, todos via `emitRagHandoff(...)` salvo no-KB):**
  - No encuentra KB (sin hits / sin topic) — `:187`, `:637-645`.
  - Baja confianza (`responseConfidence < RESPONSE_CONFIDENCE_THRESHOLD`) — `:447` reason `low_response_confidence`.
  - Binary backstop (`FALTA_INFO`/`FUERA_SCOPE`) — `:460` reason `binary_backstop_*`.
  - Compliance escalation (cuando_escalar match) — `:528` reason `escalation_trigger_match: <trigger>`.
  - Nunca-decir violation — `:504-525` reason `nunca_decir_violation: <regla>`.

### D-02 — NO emitir señal en los `no_match` por INTERRUPCIÓN (no son handoff)
- **Decisión:** los outcomes `status:'no_match'` con `reason` que empieza con `interrupted_at_ckpt_` (`sub-loop/index.ts:433`, `:491`, y los ckpt_3) son artefactos del **mecanismo de interrupción** (el turno combinado siguiente los maneja), NO decisiones de contenido. NO emiten `handoff_suggested`.
- **Razón:** mezclarlos contaminaría la señal con ruido del lock/zombie. Ya están separados por el discriminador `reason`/`interrupted_at_ckpt_N` → filtrar es trivial.

### D-03 — Contrato de la señal `handoff_suggested`
- **Decisión:** la señal lleva:
  ```
  { sessionId, conversationId, turnId,
    source: 'somnio-v4',
    layer: 'comprehension' | 'subloop',
    gate: 'guard_r0_r1' | 'vision' | 'no_kb' | 'low_confidence'
        | 'binary_backstop' | 'escalation_trigger' | 'nunca_decir',
    reason: <texto literal — ya existe hoy en decisionInfo.reason / event.reason>,
    topic?: <sourceTopic>,
    createdAt }
  ```
- **Dónde vive (V1):** evento de observability `handoff_suggested` (ya emitimos `handoff_low_confidence_fallback` + `subloop_completed` con la razón — se consolida/renombra al contrato). El handoff agent futuro lo consumirá desde ahí. Persistencia estructurada en sesión = Opción C diferida.

### D-04 — v4 deja de hacer handoff DURO (gateado por flag) — call-site `v4-production-runner.ts:376-382`
- **Decisión:** el bloque `if (output.newMode === 'handoff') { storage.handoff(...) ; clearPendingTemplates(...) }` (`v4-production-runner.ts:376-382`) queda detrás de un flag `platform_config.somnio_v4_soft_handoff`.
  - Flag ON (modo nuevo): NO llama `storage.handoff` (no apaga); emite `handoff_suggested` + (D-05) nota inbox; el bot continúa.
  - Flag OFF (legacy): comportamiento actual (handoff duro). Default a discutir en plan (recomendación: ON para v4 porque está DORMANT — sin tráfico real, sin riesgo; el operador lo controla).
- **Razón / Regla 6:** flag permite volver al comportamiento anterior; v4 dormant → ON no afecta clientes.

### D-05 — Razón de handoff en el inbox como SUGERENCIA (por ahora)
- **Decisión:** cuando se emite `handoff_suggested`, insertar una nota en la conversación tipo `⚠ HANDOFF SUGERIDO — motivo: <reason>` (`direction:'outbound'`, insert directo, NO se envía al cliente — mismo mecanismo que `webhook-handler.ts:546-554`). Texto deja claro que es **sugerencia**, NO "bot apagado".
- **Razón:** el operador necesita ver en el inbox por qué v4 cree que va a humano, sin que el bot se apague. Reencuadre de la "Opción A" original a la luz del modelo señal/decisión.

### D-06 — Limpieza del falso positivo zombie en el inbox
- **Decisión:** `webhook-handler.ts:546-554` deja de escribir `[ERROR AGENTE]` cuando `error.code === 'V4_ZOMBIE_LAMBDA_EXIT'` Y `at_step === 'ckpt_0_post_acquire'` (caso probado-benigno). El evento `zombie_lambda_exit` SIGUE en observability. Zombies en checkpoint posterior o turnos sin `turn_completed` SÍ siguen visibles/alertables.
- **Razón:** verificado en vivo (últimas 10h): todos los zombies salen en `ckpt_0` antes de hacer trabajo + el ganador completa (`turn_completed=true`). Es cosmético, no un error de agente. NO se suprime el mecanismo ni la telemetría.

### D-07 — Regla 6 / aditivo
- **Decisión:** cero archivos de v3/godentist/recompra/pw-confirmation/varixcenter. v4 DORMANT. El handoff duro recuperable vía flag OFF.

### Claude's Discretion / Open Questions (resolver en discuss/plan)
- **Comportamiento INTERINO del bot en un punto de handoff cuando NO apaga** (flag ON, agente futuro aún no existe): ¿el bot responde algo genérico, queda en silencio, o sigue normal? Caso crítico: **no-KB** (hoy manda `handoff_humano` template + pausa) — ¿qué hace ahora? Decisión clave del plan.
- **Default del flag** `somnio_v4_soft_handoff` (recomendación: ON para v4 dormant).
- **Consolidación de eventos**: ¿renombrar `handoff_low_confidence_fallback` → `handoff_suggested`, o emitir uno nuevo y mantener el viejo? (compat con sandbox debug-panel).
- ¿Persistir un flag `handoff_suggested` light en la sesión para que el agente futuro/UI lo lea sin escanear observability? (puente hacia Opción C).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El handoff duro (call-site principal a gatear)
- `src/lib/agents/engine/v4-production-runner.ts` — `:376-382` el `if (output.newMode === 'handoff') storage.handoff(...)`. **Este es el punto donde se decide apagar.** D-04.
- `src/lib/agents/engine-adapters/production/storage.ts` — `:141` `handoff()` → `sessionManager.handoffSession()` (apagado duro de la sesión).

### Puntos de determinación de handoff (emisores de la señal)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — guards R0/R1 `:494-518`; visión `:224-339`. `newMode:'handoff'` + `requiresHuman:true` + `decisionInfo:{action:'handoff', reason}`.
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — `emitRagHandoff` (low_confidence `:447`, binary `:460`, nunca_decir `:504-525`); compliance escalation `:528`; no-KB `:187`/`:637-645`. **EXCLUIR** `interrupted_at_ckpt_*` `:433`/`:491` (D-02).
- `src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` — produce `escalationTrigger` (el match de `cuando_escalar`).

### El inbox + zombie
- `src/lib/whatsapp/webhook-handler.ts` — `:546-554` insert `[ERROR AGENTE]` en fallo (D-05 nota handoff + D-06 supresión zombie); `:556-570` exception path.
- `src/lib/agents/engine/v4-production-runner.ts` — `:~570` emite `error.code:'V4_ZOMBIE_LAMBDA_EXIT'`.
- `src/lib/agents/interruption-system-v2/checkpoints.ts` — `:117` emite `zombie_lambda_exit` con `at_step`. (NO tocar el mecanismo — solo el display en inbox.)
- `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` — `:43-48` el mensaje "zombie lambda — lost lock at <ckptId>".

### Observability (la razón YA se guarda)
- Eventos `handoff_low_confidence_fallback` (payload `reason` con el trigger literal), `subloop_completed` (`outcome`, `sourceTopic`, `requiresHuman`, `reason`), `decisionInfo.reason` en el output del agente. Tabla `agent_observability_events`.

### Reglas
- `CLAUDE.md` Regla 6 (aditivo, v4 dormant) + Regla 3 (no createAdminClient fuera de domain — el insert del inbox ya vive en webhook-handler, no introducir nuevos) + Regla 1 (push tras cambios).
- `.planning/standalone/handoff-agent/FUTURE-CONTEXT.md` — el consumidor futuro de la señal.
</canonical_refs>

<code_context>
## Existing Code Insights

### Discuss efectivamente completo
Nace de la investigación en vivo 2026-06-13 (sesión que arregló `v4-dual-intent-query-split` + el KB de alcohol). Hallazgos confirmados leyendo código + DB:
- El handoff hoy es DURO: `v4-production-runner.ts:376` llama `storage.handoff` (apaga la sesión) cuando el agente devuelve `newMode:'handoff'`.
- La razón YA existe en observability (verificado: `handoff_low_confidence_fallback.reason = "escalation_trigger_match: ..."`), pero NO en el inbox ni persistida en la sesión.
- El zombie `[ERROR AGENTE]` es falso positivo (verificado: siempre `at_step=ckpt_0_post_acquire` + `turn_completed=true`).

### Reusable / patrón
- La señal blanda reutiliza el `reason` que cada gate YA emite — no hay que inventar razones nuevas.
- El insert de nota en inbox clona el mecanismo existente `webhook-handler.ts:546-554` (insert directo, no envío).
- Flag vía `platform_config` (patrón de `v4-gate-confidence-fixes` D-03 — `RESPONSE_CONFIDENCE_THRESHOLD` tunable).

### Integration points
- Cadena: gate de handoff (agent/sub-loop) → output `newMode='handoff'`/`reason` → runner `:376` (gateado por flag) → emite señal + nota inbox / o handoff duro legacy.
- Sin migración de DB en V1 (señal vive en observability; nota en `messages` ya existe). Persistencia en sesión = diferida (Opción C).

### Constraint (Regla 6)
- v4 DORMANT. Flag permite OFF = comportamiento legacy exacto. Otros agentes intactos.
</code_context>

<specifics>
## Specific Ideas

- Evidencia del falso positivo zombie (10h de datos): 6 turnos con zombie, todos `at_step=ckpt_0_post_acquire`, todos `turn_completed=true`, `response msgs` poblados por el ganador. Cero mensajes perdidos.
- Caso alcohol→SNC (turno `993f9d07`): la compliance escalation disparó handoff duro con `reason="escalation_trigger_match: ...depresores del SNC..."`. Con el modelo señal/decisión, ese caso habría sido una SUGERENCIA que el handoff agent (con contexto global) podría vetear. (El KB de alcohol ya se corrigió aparte; sirve de ejemplo del valor del modelo.)
- async-por-turno: el handoff agent corre después del turno (no bloquea la respuesta) — definido para el FUTURE-CONTEXT, pero la señal debe quedar disponible apenas termina el turno.
</specifics>

<deferred>
## Deferred Ideas

- **Handoff agent** (decisión dura con visión global, async por turno) → `.planning/standalone/handoff-agent/FUTURE-CONTEXT.md`. Este standalone solo produce la señal.
- **Re-entrada / anti-oscilación** (¿el bot vuelve tras apagarse?) — con el agente.
- **Opción C** (persistir `handoff_reason`/`handoff_suggested` en `agent_sessions` + badge/banner UI estructurado) — por ahora solo nota de texto en inbox + observability.
- **Comportamiento interino del bot** en punto de handoff sin apagar (no-KB, etc.) — open question, resolver en plan.
</deferred>

---

*Standalone: v4-handoff-soft-signal*
*Context gathered: 2026-06-13*
