# Standalone gemini-fallback-haiku - Learnings

**Fecha:** 2026-06-11
**Duración:** ~1 día (5 planes en 3 waves: W1 módulo → W2 wiring 3 planes paralelos en worktrees → W3 gate final)
**Plans ejecutados:** 5 (01 módulo · 02 sub-loop · 03 comprehension · 04 vision · 05 gate)

> Fallback súper-responsivo Gemini 2.5 Flash → Anthropic Haiku 4.5 (techo absoluto) para los 4 call-sites Gemini de somnio-v4. N=1 (`maxRetries:0`), circuit-breaker in-memory 30s + probe half-open, paridad de shape, 6 labels de observability. Cierra deuda P1-3 para v4.

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| (Plan 04, Rule 3) `image-classifier.test.ts` happy-path caía a FAIL_SAFE | La migración a `safeAccessOutput` (lee `.output`) dejó sin efecto los mocks que devolvían `{ experimental_output }` | Reemplazo mecánico de las 6 fixtures `experimental_output:` → `output:`; cero cambio de lógica de asserts | Migrar acceso a output del SDK → actualizar EN EL MISMO commit los mocks de los tests que lo consumen |
| (Plan 03, Pitfall #5) re-throw diagnóstico destruía la instancia `APICallError` | El `try/catch` con re-throw `[Comprehension-v4 generateText]` envolvía el `generateText` DENTRO del closure gemini → `APICallError.isInstance` daba `false` y `isGeminiSaturation` nunca detectaba saturación | Reubicar el re-throw diagnóstico FUERA del helper (en el catch que envuelve `callWithGeminiFallback`) → el error de saturación llega crudo al predicado | El closure del provider hace el `generateText` LIMPIO; el wrapping diagnóstico va fuera del helper de fallback |
| (Plan 03, Pitfall #1) Anthropic devolvía 400 con el schema de comprehension | Anthropic rechaza `min`/`max` en JSON Schema (vercel/ai #14342/#13355); Gemini los ignora silenciosamente | `MessageAnalysisSchemaSanitized` (sin bounds) SOLO para el branch Anthropic + `clampConfidence(raw)` 0..1 post-parse contra el schema original con bounds | Schema saneado por branch + clamp post-parse cuando un provider valida JSON Schema más estricto que otro |

## El Punto Ciego de los Mocks (heredado de somnio-v4-consolidation)

La lección central de la fase anterior (`somnio-v4-consolidation/LEARNINGS.md`) se aplicó aquí PREVENTIVAMENTE: los tests de paridad NO mockean el agente completo ignorando su input. La estrategia **helper-direct** (Planes 02/03/04) testea via `callWithGeminiFallback` con closures `gemini`/`anthropic` puras + `*.Schema.parse(result.output)` → asserta el SHAPE real del orquestador, no un mock que ignora lo que recibe. El gate W3 (Plan 05) **lee el diff con ojos de contrato** (Checks 3+4: byte-identidad de los 9 paths críticos), no solo asserts — el único gate que habría atrapado una regresión silenciosa en un agente no-v4.

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Circuit-breaker **in-memory** module-singleton (NO Redis) | Reusar el singleton Upstash de `interruption-system-v2` | N=1 + `maxRetries:0` hace que re-descubrir saturación cueste 1 fallo rápido por lambda fría; el costo de Redis (infra + round-trip) no se justifica (RESEARCH Q4) |
| Tiering colapsado a **un solo modelo** `claude-haiku-4-5` para los 4 call-sites | Haiku 3.5 para funciones simples (comprehension/compliance/visión) | `claude-3-5-haiku` se retiró del plan: un solo fallback Haiku 4.5 simplifica el módulo; techo absoluto Haiku 4.5 NUNCA Sonnet/Opus (restricción de costo del usuario) |
| `maxRetries: 0` en el branch Gemini | Dejar los 3 retries default del SDK | Cambia el error de `AI_RetryError` (envuelto) a `APICallError` crudo → el predicado detecta saturación en N=1; el cliente no paga la latencia acumulada |
| Fallback via `@ai-sdk/anthropic` directo con literal `'claude-haiku-4-5'` | Usar el wrapper `claude-client.ts` | LANDMINE Pitfall #10: `claude-client.ts:29` mapea `claude-haiku-4-5`→Sonnet ("until Haiku 4 available", comentario stale) → caería silenciosamente a Sonnet violando la restricción de costo |
| `NoObjectGeneratedError` / parse errors NO disparan fallback (re-throw) | Tratar cualquier error como saturación | No enmascarar bugs de schema con un switch de provider (Pitfall #4) — el fallback es SOLO para saturación/timeout |
| Schema saneado LOCAL en `comprehension.ts`, NO tocar `comprehension-schema.ts` | Editar el schema compartido | D-25: `comprehension-schema.ts` byte-idéntico (Regla 6 — consumidores legacy) |

## Patrones Reusables

- **Predicado `isGeminiSaturation`:** matchea `APICallError` 503/429/500/504 + mensajes de capacidad ("high demand", "MODEL_CAPACITY_EXHAUSTED"), desenvuelve `RetryError.lastError`, devuelve `false` para parse errors. `isTimeoutError` via `isAbortError` de `@ai-sdk/provider-utils`. Reusable para cualquier fallback de provider.
- **FSM circuit-breaker con `__resetBreakers()`:** module-singleton `Map<CallSite, BreakerEntry>` con estados closed/open/half_open; `effectiveState` promueve open→half_open al vencer el cooldown. `__resetBreakers()` exportado para aislar estado entre tests (Pitfall #3 — state leak en vitest). Tests con fake timers controlando `Date.now()`.
- **`MockLanguageModelV3` (ai/test) — PRIMER USO en el proyecto:** disponible para smoke E2E más profundo (mockear `@ai-sdk/google` + `@ai-sdk/anthropic` a nivel de provider para validar la construcción inline end-to-end). En esta fase NO se necesitó: el helper-direct (closures puras + `Schema.parse`) cubrió la paridad de shape de forma más estable que `vi.mock` de los `@ai-sdk/*`. Queda anotado como referencia para la primera fase que requiera ejercitar la construcción real `google()`/`anthropic()` inline.
- **Schema saneado por branch + clamp post-parse (Pitfall #1):** cuando un provider valida JSON Schema más estricto (Anthropic rechaza `min`/`max`), usar un `Schema.extend` sin bounds SOLO para ese branch + clamp defensivo contra el schema original. Vive local en el call-site, no toca el schema compartido.
- **Factorización de prompt/messages a const compartida entre branches:** garantiza la paridad D-09 (mismo prompt en Gemini y Anthropic) ESTRUCTURALMENTE, no por copy-paste que puede divergir.
- **Typed-union de observability labels** (análogo verbatim de `interruption-system-v2/observability.ts`): 6 labels con dual emission (collector + `console.log` prefijo `[gemini-fallback]`) y payload discipline (solo metadatos, sin PII/keys — T-fb-01).

## Pitfalls Confirmados / Refutados (del RESEARCH)

| Pitfall | Estado | Evidencia |
|---------|--------|-----------|
| #1 Anthropic rechaza min/max en JSON Schema | **CONFIRMADO** | Plan 03 resolvió con `MessageAnalysisSchemaSanitized` + clamp; sin el saneo, Anthropic devolvía 400 |
| #5 re-throw diagnóstico destruye `APICallError` | **CONFIRMADO** | Plan 03 reubicó el re-throw fuera del closure; `APICallError.isInstance` daba `false` con el wrapping interno |
| #7 `safetySettings`/`providerOptions.google` es Gemini-only | **CONFIRMADO** | Los 4 branches Anthropic se construyeron SIN `providerOptions.google` (rompería con Anthropic) |
| #10 `claude-client.ts` mapea Haiku 4.5→Sonnet | **CONFIRMADO (LANDMINE evitado)** | El módulo + 4 call-sites importan `@ai-sdk/anthropic` directo; 0 imports de `claude-client` (gate Check 5) |
| #11 `image-classifier.ts` usa `experimental_output` | **CONFIRMADO** | Plan 04 migró a `safeAccessOutput` para paridad de output entre providers; arrastró fix de mocks (Rule 3) |
| #4 parse errors NO deben disparar fallback | **CONFIRMADO** | `NoObjectGeneratedError` re-throw en el orquestador; cubierto por test |
| #3 state leak del breaker singleton en vitest | **CONFIRMADO** | `__resetBreakers()` en `afterEach` en las 4 suites de fallback |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Wave 2 (3 planes paralelos en worktrees) | main tree | Worktrees no tienen untracked files → el push/smoke imposible dentro de worktree | El gate + push (Plan 05) corre SIN aislamiento en el main tree |
| Sesión GSD | Sesión concurrente (whatsapp-inbox-reliability) en main | HEAD avanzó por commits ajenos durante la fase | Stage explícito por path (NUNCA `git add -A`); gate Regla 6 nominal por archivo; push diferido al checkpoint humano (T-fb-10 accept) |
| Acceptance criteria literal (`grep -c claude-client == 0`) | Comentarios anti-regresión que el plan instruye escribir | El conteo literal nunca era 0 (los comentarios LANDMINE/D-02 contienen el token) | Verificar IMPORTS reales (`from '...claude-client'` == 0), no el token literal; documentado en SUMMARYs 01/02/03 |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Orden W1 (módulo aislado + tests deterministas) → W2 (wiring de los 4 call-sites en paralelo, `files_modified` disjuntos) → W3 (gate de contrato). El módulo testeado ANTES de wirear mitiga el punto ciego de mocks.
- Gate Regla 6 nominal por archivo (9 byte-idénticos) + suite canónica 399 verde como punto de no-retorno antes del push.
- Pasar las deviations de plan en plan vía SUMMARYs (la observación del grep literal de claude-client se documentó en 01 y los 3 siguientes la reconocieron sin re-tropezar).

### Lo que NO hacer
- NO usar el wrapper `claude-client.ts` para el fallback (mapea Haiku 4.5→Sonnet, viola costo).
- NO tratar parse errors como saturación (enmascara bugs de schema).
- NO envolver el `generateText` del closure gemini en try/catch con re-throw (destruye `APICallError`).
- NO dejar `providerOptions.google`/`safetySettings` en el branch Anthropic (Gemini-only).

### Patrones a seguir
- Mantenimiento: cambio al mecanismo del turno → SOLO en `core/`; wiring de provider → en los call-sites (`INTERRUPTION-PARITY.md`).
- Fallback de provider: predicado robusto + breaker in-memory + paridad de shape estructural + observability typed-union.

### Comandos útiles
```bash
# Suite canónica v4 (nuevo baseline post-fase: 399 passed | 7 skipped)
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
# Gate Regla 6: diff de cada agente no-v4 debe ser vacío
git diff <BASE>..HEAD -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/somnio-v4/core/ src/lib/agents/claude-client.ts
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Mapping stale `claude-haiku-4-5`→Sonnet en `claude-client.ts:29` (afecta consumidores legacy, Regla 6) | Media | standalone separado (limpieza claude-client) |
| `tooling-call.ts` (GPT-4.1-mini) sin fallback — no es Gemini, fuera de scope | Baja | solo si OpenAI presenta saturación equivalente |
| Generalizar el módulo `llm-fallback/` a shared para otros agentes | Baja | standalone futuro (D-04 lo acota a v4) |
| P95 reales por call-site para afinar `TIMEOUT_MS` (hoy defaults) | Media | activación de v4 en prod |
| Smoke E2E con saturación real inyectada en /sandbox (Gemini saboteado) | Media | pre-flip RAG / activación v4 (Manual-Only de VALIDATION.md) |
| Confirmar que Haiku 4.5 no rehúsa contenido médico-informativo del KB Somnio (alcohol/embarazo/anticoagulantes) en el branch de fallback | Media | smoke con LLM vivo a la activación de v4 |

## Notas para el Módulo

Información para un agente de documentación de `src/lib/agents/somnio-v4/llm-fallback/`:

- El módulo es **acotado a v4** (D-04), NO shared. Vive junto a v4 y wirea SOLO los 4 call-sites Gemini de v4.
- Entry point: `callWithGeminiFallback<T>({ callSite, gemini, anthropic })` — el módulo no conoce providers; los call-sites inyectan las closures.
- Techo absoluto del fallback: `claude-haiku-4-5` (NUNCA Sonnet/Opus). El literal vive en `config.ts:FALLBACK_MODEL`.
- El breaker es in-memory por lambda; tras N=1 fallo abre 30s; la 1ª llamada tras el cooldown es un probe con tráfico real.
- 6 labels de observability `pipeline_decision` con prefijo `[gemini-fallback]`: `fallback_triggered`, `circuit_opened`, `circuit_closed`, `probe_ok`, `probe_failed`, `fallback_failed`.
- Gate de no-regresión: REGLA6-GATE.md (Plan 05) — los 9 paths byte-idénticos + suite 399 verde.
- v4 sigue DORMANT en prod (0 workspaces) → el fallback no altera el agente activo; se ejercita solo ante saturación real de Gemini.

---
*Generado al completar la fase gemini-fallback-haiku. Input para entrenamiento de agentes de documentación.*
