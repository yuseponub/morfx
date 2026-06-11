# Standalone: gemini-fallback-haiku - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Sistema de fallback súper responsivo Gemini → Anthropic (Haiku como techo) para los call-sites Gemini de somnio-v4. Gemini 2.5 Flash falla frecuente con "This model is currently experiencing high demand" (AI_RetryError tras 3 retries lentos del AI SDK — deuda P1-3); en los smokes del gate de somnio-v4-consolidation tumbó casos de forma persistente (evidencia: GATE-W2.md). v4 está DORMANT en prod pero el flip RAG (somnio-v4-rag-generative Plan 08) está próximo y NO se puede activar con el generador cayéndose. El sandbox v4 SÍ está en uso activo — el fallback aplica también ahí (mismo core, adapters distintos).

**Entregables:** detección rápida (sin esperar retries del SDK) + circuit-breaker con cooldown y probe + paridad de contrato de salida + observability del switch + tests deterministas.

**Fuera de scope:** v3/godentist/recompra/pw-confirmation (Anthropic directo, Regla 6 — NO se tocan), tooling-call (GPT-4.1-mini, no es Gemini), calibración de gates borderline (hermano `v4-smoke-stability`).

</domain>

<decisions>
## Implementation Decisions

### Alcance y granularidad
- **D-01 — Los 4 call-sites Gemini de v4 entran** (el usuario confirmó incluir compliance-check, que no estaba en el brief original):
  1. `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` — generador RAG (Output.object + responseConfidence)
  2. `src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` — verifier nunca_decir
  3. `src/lib/agents/somnio-v4/comprehension.ts` — comprehension v4
  4. `src/lib/agents/media/image-classifier.ts` — classifier de visión (v4-gated)
  `tooling-call.ts` (GPT-4.1-mini) queda explícitamente fuera.
- **D-02 — Fallback POR NIVELES según la función, no un modelo único.** Hoy los 4 call-sites usan `gemini-2.5-flash`. El fallback se elige por call-site: generation (redacción RAG, la más exigente) → `claude-haiku-4-5`; funciones simples (comprehension = clasificar intent, compliance = check binario, visión = clasificar imagen) → research evalúa el candidato MÁS barato que conserve ~99% de eficacia (ej: Haiku 3.5 es más barato que Haiku 4.5). **Techo absoluto: Haiku 4.5 — NUNCA Sonnet/Opus** (restricción de costo deliberada). El plan fija el mapping final por call-site con la recomendación del research.
- **D-03 — Visión hace fallback a Haiku con visión** (Haiku 4.5 clasifica imágenes). El fail-safe handoff actual (D-07 del standalone v4-media-audio-image) queda como ÚLTIMO recurso si el fallback también falla — el cliente no debe percibir la falla ni recibir handoff innecesario.
- **D-04 — Módulo acotado a v4, no shared.** Vive junto a v4 (helper/lib pequeña), wirea solo los 4 call-sites. Generalizar a otros agentes sería standalone futuro. Cambios al mecanismo del turno → SOLO en `src/lib/agents/somnio-v4/core/` (ambos wrappers heredan); wiring de provider → en los call-sites (regla de mantenimiento post-consolidación).

### Parámetros de detección y switch
- **D-05 — N=1: el PRIMER fallo de saturación en una llamada dispara el fallback en esa misma llamada.** Sin esperar reintentos: `maxRetries: 0` en el AI SDK para los call-sites Gemini. El cliente no paga la latencia acumulada de 3 retries.
- **D-06 — Timeout guard informado por P95:** research mide latencias reales por call-site (hay observability con purpose labels `subloop_generation`, `subloop_compliance`, `comprehension`) y fija timeout ~2-3x P95 por call-site. Colgue sin error → abort + fallback inmediato.
- **D-07 — Circuit-breaker con cooldown de 30 SEGUNDOS:** tras abrir (primer fallo), las llamadas siguientes van directo al fallback sin intentar Gemini durante 30s. Recuperación rápida a Gemini (más barato) priorizada sobre minimizar probes fallidos.
- **D-08 — Probe half-open con tráfico real:** la 1ª llamada tras vencer el cooldown intenta Gemini; si falla → fallback inmediato en esa misma llamada (cliente no nota) y el circuito re-abre otros 30s. Cero tráfico sintético, cero infra extra.

### Paridad de contrato (del brief, locked)
- **D-09 — El modelo de fallback recibe el MISMO prompt y debe producir el MISMO shape de salida estructurada** (ej: `GenerationOutputSchema` con responseText/responseConfidence/confidenceRationale/binary). El resto del pipeline (gates nunca_decir, compliance, threshold 0.70 → handoff) NO se entera de qué provider respondió. Nota: `safetySettings BLOCK_NONE` es Gemini-specific (Pitfall 6) — no aplica al provider Anthropic; research verifica si Anthropic necesita mitigación equivalente para menciones de alcohol/embarazo/anticoagulantes.

### Observability (del brief, locked)
- **D-10 — Eventos `pipeline_decision` del switch:** `fallback_triggered`, `circuit_opened`, `circuit_closed`, `probe_ok` (nombres finales y payload en el plan; patrón typed-union de labels como interruption-system-v2). Objetivo: auditar la frecuencia REAL de saturación de Gemini en prod/sandbox.

### Claude's Discretion (informado por research)
- **Estado del breaker:** in-memory por lambda vs Redis compartido (Upstash singleton existe en `interruption-system-v2/redis-client.ts` — evaluar si se reusa el patrón con cliente propio o si in-memory basta dado N=1 y costo de re-descubrir = 1 fallo rápido por lambda; considerar Fluid Compute reusa instancias).
- **Política de errores:** qué errores además de saturación/timeout disparan fallback (¿safety blocks? ¿parse/NoOutputGeneratedError? — cuidado con enmascarar bugs de schema con un switch de provider).
- **Doble fallo:** si el fallback también falla → comportamiento (propagar el error path actual de cada call-site; en visión = handoff D-07).
- **Knobs:** constantes vs `platform_config` (cooldown, timeouts, modelos). Feature flag: probablemente innecesario (v4 DORMANT en prod = gating natural; sandbox es donde se quiere activo ya) — research/plan confirma.
- Detección del error de saturación: matching del shape del AI_RetryError/APICallError del AI SDK v6 (statusCode 503/429, mensaje "high demand") — research define el predicado exacto.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Evidencia del problema + lecciones de la fase anterior
- `.planning/standalone/somnio-v4-consolidation/GATE-W2.md` — evidencia de saturación Gemini (10/17 casos run1, 4/17 re-run; Pitfall 11/12)
- `.planning/standalone/somnio-v4-consolidation/LEARNINGS.md` — **lección "punto ciego de mocks"** (OBLIGATORIA): al tocar la frontera del core, agregar asserts de threading por cada campo nuevo del input; suite canónica y comandos de gate Regla 6 al final del archivo
- `.planning/standalone/somnio-v4-consolidation/REVIEW-FIX.md` — fixes del review ya aplicados (CR-01/H-01/H-02/M-01)

### Arquitectura v4 + mantenimiento core/adapters
- `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` — regla de mantenimiento: mecanismo → solo `core/`; un lado → solo su adapter/wrapper
- `src/lib/agents/somnio-v4/ARCHITECTURE.md` — mapa del agente v4
- `.planning/standalone/somnio-v4-rag-generative/` — D-08 (Flash normal), D-10 (temp 0.3), D-15 (responseConfidence), D-19 (threshold 0.70) del generador

### Call-sites a modificar
- `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` — generación RAG
- `src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` — verifier
- `src/lib/agents/somnio-v4/comprehension.ts` — comprehension v4
- `src/lib/agents/media/image-classifier.ts` — visión (D-07 fail-safe handoff actual)
- `src/lib/agents/somnio-v4/sub-loop/safe-output.ts` — parse del structured output (la paridad pasa por aquí)

### Patrones reusables
- `src/lib/agents/interruption-system-v2/redis-client.ts` — singleton Upstash (patrón si el breaker va a Redis)
- `src/lib/observability/context.ts:99` — `runWithPurpose` (ALS de propósito; NO selecciona modelo)

</canonical_refs>

<code_context>
## Existing Code Insights

### Landmine crítico
- **`src/lib/agents/claude-client.ts:29` mapea `'claude-haiku-4-5'` → `'claude-sonnet-4-20250514'`** (comentario stale "until Haiku 4 available"). Si el fallback usara ese wrapper legacy caería silenciosamente a Sonnet, violando la restricción de costo. El fallback DEBE ir por `@ai-sdk/anthropic` (instalado, `^3.0.43`) con el model id real de Haiku — research verifica los model ids actuales de Anthropic.

### Reusable Assets
- AI SDK v6 (`ai ^6.0.86`) + `@ai-sdk/anthropic ^3.0.43` + `@ai-sdk/google ^3.0.67` ya instalados — no hay deps nuevas.
- `safeAccessOutput(rawResult, schema)` en sub-loop — parse uniforme del structured output; sirve igual con cualquier provider que soporte `Output.object`.
- Patrón contador de fallos en `platform_config` (`bold_robot_failure_count`, BOLD robot) — referencia si el breaker persiste estado.
- Suite canónica v4 (358 passed | 7 skipped) — comando en LEARNINGS de consolidación; gate de no-regresión.

### Established Patterns
- Todos los call-sites Gemini envuelven con `runWithPurpose('<purpose>', ...)` — los labels existentes (`subloop_generation`, `subloop_compliance`, `comprehension`) dan las latencias P95 para D-06.
- `safetySettings BLOCK_NONE` x4 (Pitfall 6) es Gemini-only — el branch Anthropic no lo lleva.
- Observability typed-union de labels (interruption-system-v2) — patrón para los 4 eventos D-10.
- Lección punto ciego de mocks: si se agregan campos a `TurnCoreInput`/frontera del core → assert de threading por campo (patrón tests E11/E12 del fix).

### Integration Points
- Los 4 call-sites son funciones puras async que hoy construyen `model: google('gemini-2.5-flash')` inline — el switch de provider se inyecta ahí (call-site level), NO en el core del turno (el core no sabe de providers).
- Sandbox y prod comparten los call-sites vía core/wrappers — el fallback aplica a ambos sin trabajo extra.
- Otra sesión Claude activa en main: `git pull --rebase` antes de cada push, stage explícito por path, NUNCA `git add -A`. HEAD local al momento del discuss: `ad00c5b3` (2 commits adelante de origin/main `f2fe1fa3` — el push de auth-hardening está pendiente de decisión del usuario, NO pushear sin confirmar).

</code_context>

<specifics>
## Specific Ideas

- "Si la función es muy sencilla intentar ponerle un modelo muy barato pero que cumpla las expectativas" — regla rendimiento/valor del usuario (~99% eficacia al menor costo), alineada con la memoria `token-frugal-delegation`.
- "1 solo fallo triggerea en esa llamada el cambio" — la responsividad es EL requisito: el cliente no debe percibir ni latencia acumulada ni handoff innecesario.

</specifics>

<deferred>
## Deferred Ideas

- **`v4-smoke-stability`** — calibrar gates nunca_decir/confidence en casos borderline. Standalone hermano explícitamente fuera de este scope.
- **Generalizar el fallback a módulo shared** para otros agentes — solo si otro agente lo necesita (D-04 lo acota a v4).
- **Limpiar el mapping stale `claude-haiku-4-5`→Sonnet en `claude-client.ts`** — afecta a consumidores legacy (v3/godentist...); tocarlo viola Regla 6 dentro de este standalone. Anotar como deuda.

</deferred>

---

*Standalone: gemini-fallback-haiku*
*Context gathered: 2026-06-11*
