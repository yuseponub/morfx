# v4-llm-fallback-resilience — Context

**Gathered:** 2026-06-14
**Status:** Ready for research
**Tipo:** standalone (manual GSD — no `gsd-sdk` en este entorno)

<domain>
## Phase Boundary

Hacer el fallback Gemini→Haiku del agente `somnio-sales-v4` **resiliente a fallos de Gemini que NO son saturación** (créditos agotados + error de schema "union-types"), para que el bot **no se caiga** cuando Gemini deja de responder por esas causas; y **reportar correctamente el agotamiento de créditos** (correo al operador + evento observability) en vez del críptico `[ERROR AGENTE] ...union types...`.

**Origen:** incidente 2026-06-14 — prod se quedó sin créditos de Gemini → la comprehension empezó a fallar con "Schemas contains too many parameters with union types (17 parameters...)" → bot v4 caído. Investigación completa en `.planning/debug/v4-gemini-credits-comprehension-down.md`.

**v4 está LIVE en Somnio (NO dormant)** — atiende clientes reales. Todo cambio cuida producción (Regla 5 migraciones-antes-de-deploy, Regla 6 aislamiento de agente). El módulo de fallback ya está acotado a `somnio-v4` (D-04 del standalone gemini-fallback-haiku); esta fase NO amplía el scope a otros agentes.

### En scope
- Extender el predicado de fallback (`isGeminiSaturation` / la decisión en `index.ts:70-71`) para que créditos-agotados y union-types **también** caigan a Haiku.
- Detección específica de "créditos agotados" → correo al operador + evento observability `llm_credits_depleted`.
- Doble fallo (Gemini Y Haiku) → señal de handoff suave (ya shipeada en `v4-handoff-soft-signal`) + correo urgente.
- Dos severidades de correo (Gemini-sin-créditos = normal; doble-fallo = crítico).

### Fuera de scope
- **Adelgazar el schema (schema-slim)** — era una suposición; la causa real fue créditos. NO se hace en esta fase. (Research SÍ verifica empíricamente si el schema-17 es aceptado por Gemini con créditos — ver D-08.)
- Ampliar el fallback a otros agentes (v3/godentist/recompra/pw-confirmation) — sigue siendo solo somnio-v4.
- Cambiar el modelo de comprehension o el contenido del schema.
- Recargar los créditos de Gemini (acción de operador, independiente del código).

</domain>

<decisions>
## Implementation Decisions

### Alcance del fallback
- **D-01:** Cuando Gemini falla por **créditos agotados**, el sistema **cae a Haiku** (el bot sigue vivo, Haiku usa billing de Anthropic separado) **PERO siempre avisa** que se quedó sin créditos (correo + evento). No es silencioso.
- **D-02:** El error **"union-types"** (el que vimos al agotarse los créditos) **también dispara fallback a Haiku** como defensa en profundidad, **PERO emite un evento ruidoso/visible** para no enmascararlo en silencio. Haiku usa `ANTHROPIC_COMPREHENSION_JSON_SCHEMA` (saneado, sin el límite) → sí responde.
- **D-09 (discriminación — preserva Pitfall #4):** Solo se agregan disparadores **específicos y nombrados**: créditos-agotados (match del string tipo "prepayment credits are depleted" / billing / quota + statusCode real a verificar) y union-types (match "too many parameters with union types|union type|anyOf"). Los errores **genuinos** de parse/schema (`NoObjectGeneratedError`) **siguen re-lanzando** sin fallback — NO se enmascaran bugs de schema reales. La discriminación es por predicado explícito, no por "cualquier error cae a Haiku".

### Reporte de créditos
- **D-03:** Al detectar créditos agotados, **enviar correo a `joseromerorincon041100@gmail.com`** incluyendo **nombre + id del workspace** afectado.
- **D-04:** **Además del correo, persistir el evento observability `llm_credits_depleted`** (provider=gemini) en `agent_observability_events` — registro durable, visible en el debug panel, y base para **dedup de correos** (no spamear si muchos turnos fallan seguidos). Tapa el gap de que hoy estos crashes no quedan registrados (turns con `con_error=0`).
- **D-05:** El mensaje `[ERROR AGENTE]` del inbox **se mantiene siempre** (decisión del usuario: máxima visibilidad cruda). El valor nuevo viene del correo + evento, NO de suprimir el error. *(Nota para planner: NO suprimir el [ERROR AGENTE]; el handoff/fallback puede coexistir con que el error siga apareciendo.)*

### Doble fallo billing
- **D-06:** Si el fallback también falla (**Gemini Y Haiku caídos** — ej. ambos sin saldo), emitir la **señal de handoff suave** (`handoffSuggested`, ya shipeada en `v4-handoff-soft-signal`) para que un humano atienda + **correo urgente** "AMBOS proveedores caídos". El cliente no queda solo con un error técnico.
- **D-07:** **Dos severidades de correo:** (a) Gemini-sin-créditos = aviso **normal** (bot sigue vivo con Haiku); (b) doble-fallo = **urgente/crítico** (bot NO responde). Asunto + cuerpo distintos para distinguir gravedad de un vistazo.

### Schema (corrección del usuario)
- **D-08:** El **schema-slim queda FUERA de scope**. Fue una suposición; la causa real confirmada fue créditos agotados (el schema-17 corrió ~18h en vivo CON créditos sin un solo error). **Mandato a research:** re-correr `scripts/_repro-gemini-schema.ts` con una key de Gemini **CON créditos** para probar empíricamente si Gemini **acepta o rechaza** el `MessageAnalysisSchema` (17 anyOf) independiente del saldo. — Si lo **acepta** → schema-slim descartado como deuda muerta. — Si lo **rechaza incluso con créditos** → reabrir el tema (pero sería fase aparte). Sin asumir; se verifica con un hecho.

### Claude's Discretion
- Estructura exacta de los archivos del módulo de fallback (nuevo predicado `isBillingError`/`isGeminiSchemaCapacity` vs extender `saturation.ts`) — research/planner deciden siguiendo los patrones existentes.
- Mecanismo de envío de correo (directo desde la función vs vía evento Inngest) — depende de qué infra de correo exista (research lo determina).
- Formato exacto del cuerpo del correo (más allá de incluir workspace name+id y la severidad).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Incidente (origen de la fase)
- `.planning/debug/v4-gemini-credits-comprehension-down.md` — investigación completa, causa raíz confirmada (créditos), FIX 1/FIX 2 + follow-up. **Leer primero.**

### Módulo de fallback (lo que se extiende)
- `src/lib/agents/somnio-v4/llm-fallback/index.ts` — `callWithGeminiFallback`; la decisión de fallback vive en `:67-100` (`isSaturation`/`isTimeout`; el `if (!isSaturation && !isTimeout) throw` de `:70-71` es lo que hoy re-lanza créditos/union-types).
- `src/lib/agents/somnio-v4/llm-fallback/saturation.ts` — `isGeminiSaturation` (`:24-43`), `SATURATION_MSG` regex, `isTimeoutError`. Punto natural para los nuevos predicados.
- `src/lib/agents/somnio-v4/llm-fallback/observability.ts` — `emitFallbackEvent` (dónde añadir el evento de créditos). *(verificar labels existentes)*
- `src/lib/agents/somnio-v4/llm-fallback/breaker.ts` + `config.ts` — circuito + CallSite (4 call-sites consumidores).

### Comprehension (consumidor + origen del error)
- `src/lib/agents/somnio-v4/comprehension.ts` — call + catch diagnóstico (`:184-201`); gemini branch (`:149-169`); anthropic branch (`:170-182`, schema saneado).
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — `MessageAnalysisSchema` (17 nullables → 17 anyOf). NO se modifica en esta fase (D-08).
- `scripts/_repro-gemini-schema.ts` — repro a re-correr con key con saldo (D-08).

### Handoff suave (D-06)
- `.planning/standalone/v4-handoff-soft-signal/CONTEXT.md` + `VERIFICATION.md` — modelo `handoffSuggested`/`handoffSignal` recién shipeado.
- `src/lib/agents/engine/types.ts` — `EngineOutput.handoffSuggested?` + `handoffSignal?`.
- `src/lib/agents/engine/v4-production-runner.ts` + `src/lib/agents/production/webhook-processor.ts` (SOFT path nota inbox `:~1117-1136`).

### Reglas del proyecto
- `CLAUDE.md` — Regla 5 (migración antes de deploy), Regla 6 (proteger agente en prod), Regla 1 (push a Vercel).
- `.claude/rules/agent-scope.md` §interruption-system-v2 / §somnio-v4 — scope del agente v4.

### A investigar (research debe localizar)
- Infra de envío de correo en MorfX (¿Resend / SES / Nodemailer / otro?) — feasibility de D-03/D-06/D-07. **Si no existe, research lo reporta como bloqueante/decisión.**
- Patrón `bold-upstream-broken` (Inngest event + alerta) en `src/inngest/functions/` — referencia de alerta a operador.
- Forma EXACTA del error "credits depleted" en prod (statusCode + message string) — el repro local dio "Your prepayment credits are depleted" pero NO confirmó statusCode.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `callWithGeminiFallback` + breaker + observability ya existen (standalone gemini-fallback-haiku, shipped 2026-06-11). Esta fase **extiende el predicado**, no reconstruye el fallback.
- `isGeminiSaturation` ya tiene la forma de predicado (APICallError statusCode + regex de message/responseBody) — los nuevos disparadores siguen el mismo molde.
- `emitFallbackEvent` ya emite a observability con redacción de PII — el evento `llm_credits_depleted` reusa ese canal.
- Señal de handoff suave (`handoffSuggested`) ya shipeada — D-06 la consume, no la inventa.

### Established Patterns
- **Pitfall #4 (sagrado):** no enmascarar bugs de schema con un switch de provider. Los nuevos disparadores deben ser **nombrados y específicos**, NUNCA "cualquier error → Haiku".
- **Seguridad (T-fb-01):** NUNCA meter contenido del mensaje del usuario ni API keys en payloads de eventos/correos. Solo metadatos (callSite, errorKind, workspace id/name, latency).
- Fallback acotado a `somnio-v4` (D-04 gemini-fallback-haiku) — no tocar otros agentes (Regla 6).

### Integration Points
- 4 call-sites del fallback: `comprehension.ts`, `sub-loop/generation-call.ts`, `sub-loop/compliance-check.ts`, `media/image-classifier.ts` — todos se benefician del predicado extendido. El reporte de créditos cuelga del orquestador `callWithGeminiFallback` (un solo lugar).
- Correo: nuevo punto de integración (a definir según infra existente).

</code_context>

<specifics>
## Specific Ideas

- Correo personal del operador: `joseromerorincon041100@gmail.com`, con **nombre + id del workspace** en el cuerpo.
- Dos severidades de asunto/cuerpo: "Gemini sin créditos (bot vivo con Haiku)" vs "CRÍTICO: ambos proveedores caídos (bot no responde)".
- Dedup de correos vía el evento observability como registro (no spamear N correos por N turnos seguidos del mismo outage).

</specifics>

<deferred>
## Deferred Ideas

- **Schema-slim** (17 anyOf → ~7) — NO en esta fase (D-08). Solo se reabre si research demuestra que Gemini rechaza el schema-17 incluso CON créditos.
- **Ampliar el fallback resiliente a otros agentes** (v3/godentist/recompra/pw-confirmation) — standalone follow-up por agente (igual patrón que el módulo original).
- **Recargar créditos de Gemini** — acción de operador inmediata, sin código (desbloquea el bot sin deploy). No es trabajo de esta fase.
- **Alerta por canales adicionales** (Inngest notification, nota inbox dedicada) — el usuario eligió correo; otros canales quedan como mejora futura.

</deferred>

---

*Phase: v4-llm-fallback-resilience (standalone)*
*Context gathered: 2026-06-14*
