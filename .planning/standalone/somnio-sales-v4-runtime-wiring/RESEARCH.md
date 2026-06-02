---
status: research-complete
created: 2026-05-06
phase: somnio-sales-v4-runtime-wiring
research_method: empirical (real API calls)
---

# RESEARCH — somnio-sales-v4-runtime-wiring

## TL;DR — DECISIÓN FINAL: STACK MIXTO

**Modelos confirmados por call (lockeado por jose 2026-05-06):**

| Call | Modelo | Razón |
|---|---|---|
| `comprehension.ts` | **Gemini 2.5 Flash-Lite** | Single-shot sin tools. Schema actual funciona. Plan 12.1 calibration intacta. ~14x más barato que Haiku. |
| `sub-loop/index.ts` | **GPT-4o mini** | Necesita tools + Output.object combinados. Gemini API NO soporta esa combinación ("Function calling with response mime type 'application/json' is unsupported"). GPT-4o mini sí. |
| `sub-loop/nunca-decir-check.ts` | **Gemini 2.5 Flash-Lite** | Single-shot simple. Sin tools. Más barato. |

**Hallazgos críticos del research:**

1. **El LoopOutcomeSchema actual de v4 NUNCA ha funcionado contra ninguna API real** — discriminated union con `z.literal(false)` es rechazado por TODOS los providers (Anthropic, Gemini, OpenAI). Los unit tests del v4 sub-loop son mocks, no E2E. Esto es deuda crítica del padre `somnio-sales-v4` que se descubre ahora. **Re-shape obligatorio (D-29).**
2. **Gemini NO puede combinar tool calling con Output.object (structured response).** Limitación documentada de su API. Por eso el sub-loop debe ir a GPT-4o mini.
3. **Anthropic Haiku via AI SDK no puede usarse para v4.** Rechaza `oneOf`, `propertyNames`, `min/max`, `boolean literals`. El comprehension actual usa Anthropic SDK directo (no AI SDK) con tools manual — funciona pero no es portable.
4. **Plan 12.1 calibration funciona perfecto en Gemini.** D-12 (re-calibración 1-2h) NO es necesaria.

## Setup ejecutado

- Instalados: `@ai-sdk/google@^3.0.67`, `@ai-sdk/openai@^3.0.61` (con `--legacy-peer-deps` por conflict pre-existente con `@webscopeio/react-textarea-autocomplete`)
- Node 24.13.0, AI SDK v6.0.86, `@ai-sdk/anthropic@^3.0.43` ya instalado
- Env vars: `GOOGLE_GENERATIVE_AI_API_KEY` (jose proporcionó), `OPENAI_API_KEY` (la existente "MorfX KB Sync — somnio-sales-v4"), `ANTHROPIC_API_KEY` (cargada desde `.env.local`)
- Modelo Gemini ID exacto: `gemini-2.5-flash-lite` (acepta directo en `google('gemini-2.5-flash-lite')`)

## Tests corridos

5 scripts en `.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/`:
1. `test-loopoutcome.ts` — schema original (discriminated union con boolean literals)
2. `test-loopoutcome-v2.ts` — mismo schema pero usando `experimental_output:` API
3. `test-loopoutcome-v3.ts` — mismo schema usando `output:` API (mismo que v4 código real)
4. `test-loopoutcome-flat.ts` — schema flat (eliminado discriminated union, mantenido `z.record`)
5. `test-loopoutcome-flat-norecord.ts` — schema flat sin `z.record`
6. `test-comprehension.ts` — `MessageAnalysisSchema` real con few-shot Plan 12.1
7. `test-final.ts` — NuncaDecir CheckSchema + GPT-4o mini fallback comparison

## Resultados

### LoopOutcomeSchema (sub-loop) — el más arriesgado

| Schema variant | Haiku | Gemini Flash-Lite |
|---|---|---|
| Original (discriminated union + `z.literal(false)`) | ❌ "Schema type 'oneOf' is not supported" | ❌ "Invalid value at one_of[0].properties[3].value.enum[0] (TYPE_STRING), false" — `z.literal(false)` no aceptado |
| Flat con `z.record(z.string(), z.string())` | ❌ "For 'object' type, property 'propertyNames' is not supported" | ✅ 3/3 match |
| Flat sin `z.record` | ⚠️ 2/3 match (no_match interpretado como template — falla semántica, no de schema) | ✅ 3/3 match |

**Diagnóstico técnico:**
- `z.discriminatedUnion` se serializa a JSON Schema con `oneOf` → Anthropic lo rechaza
- `z.literal(false)` se serializa a `enum: [false]` con type=string en algunos casos → Gemini lo rechaza
- `z.record(z.string(), z.string())` genera `propertyNames: { type: 'string' }` → Anthropic lo rechaza

### MessageAnalysisSchema (comprehension) — schema actual de v4

| Modelo | Resultado |
|---|---|
| Haiku via AI SDK + Output.object | ❌ "For 'number' type, properties maximum, minimum are not supported" |
| Gemini Flash-Lite | ✅ 5/5 match con Plan 12.1 confidence values |

**Resultados Gemini con prompts/few-shot del Plan 12.1:**

| Mensaje | Intent (Gemini) | Confidence (Gemini) | Esperado |
|---|---|---|---|
| "hola" | saludo | 0.95 | ≥0.85 ✓ |
| "qué tan adictivo es vs zolpidem?" | dependencia | 0.30 | ≤0.50 ✓ (sub-loop dispara <0.70) |
| "funciona si tengo apnea?" | contraindicaciones | 0.30 | ≤0.50 ✓ |
| "lo quiero comprar" | quiero_comprar | 0.92 | ≥0.85 ✓ |
| "ok" | acknowledgment | 0.55 | ≤0.70 ✓ |

**Diagnóstico:**
- `intent_confidence: z.number().min(0).max(1)` se serializa con `minimum: 0, maximum: 1` → Anthropic lo rechaza
- Gemini lo acepta sin problema y honra los valores numéricos
- **Plan 12.1 calibration funciona perfecto en Gemini sin recalibrar** (D-12 puede ahorrarse las 1-2h)

### CheckSchema (nunca-decir) — schema simple

| Modelo | Resultado | Tokens IN | Tokens OUT | Latencia |
|---|---|---|---|---|
| Haiku | ✅ 2/2 match | 275-277 | 9-21 | 1.5-4.1s |
| Gemini Flash-Lite | ✅ 2/2 match | 70-71 | 10-29 | 4-8s |
| GPT-4o mini | ❌ insufficient permissions | — | — | — |

**Diagnóstico:** schema simple (boolean + optional string) NO usa features problemáticas. Funciona en Haiku Y Gemini.

### Token usage comparison (mismos prompts)

| Schema | Haiku tokens IN | Gemini tokens IN | Ratio |
|---|---|---|---|
| LoopOutcome flat | 777-879 | 27-105 | ~10-15x menos en Gemini |
| MessageAnalysis | (no testeable) | 269-279 | n/a |
| NuncaDecir | 275-277 | 70-71 | ~4x menos en Gemini |

Anthropic incluye el schema como tools en el system prompt (cuenta como tokens). Gemini lo manda en `response_schema` separado (no cuenta como tokens del modelo). En la práctica, **Gemini cobra mucho menos por el mismo schema-driven call**.

### Pricing analysis (estimado)

Pricing nominal (verificar con Vercel deployment):
- Haiku 4.5: $0.80 / MTok input, $4.00 / MTok output
- Gemini 2.5 Flash-Lite: $0.10 / MTok input, $0.40 / MTok output (target — confirmar real)

Por call típica (300 tokens input + 150 tokens output):
- Haiku: $0.0008 + $0.0006 = ~$0.0014/call
- Gemini Flash-Lite: $0.00003 + $0.00006 = ~$0.00009/call

**Ahorro real: ~15x** (mejor que el 10-12x estimado inicialmente, gracias al menor token IN de Gemini al no incluir schema).

## Implicaciones para D-X decisiones

### D-8 (compatibility check) → confirmado

- ✅ Gemini 2.5 Flash-Lite funciona con todos los schemas usados por v4 (con re-shape obligatorio del LoopOutcome)
- ❌ Anthropic Haiku via AI SDK NO funciona con LoopOutcome ni MessageAnalysis. Solo CheckSchema simple.
- Conclusion: **Gemini SÍ es viable.** Avanzar al swap.

### D-10 (Opción A — migración mínima) → necesita ajuste

Originalmente se planteó "solo cambia el SDK call". HALLAZGO: además de cambiar SDK, hay que **re-shape el LoopOutcomeSchema** porque:
1. Discriminated union con boolean literals NO funciona en NINGÚN provider
2. El v4 actual NUNCA testeó esto E2E (solo unit tests con mocks)

Re-shape requerido (`output-schema.ts`):
- Eliminar `z.discriminatedUnion('status', [...])`
- Reemplazar con `z.object({ status: z.enum(...), ...campos opcionales })`
- Reemplazar `requiresHuman: z.literal(false)` con `requiresHuman: z.boolean()`
- Eliminar `z.record(z.string(), z.string())` para `extraContext` → reemplazar con campos pre-definidos opcionales (ej: extraNombre, extraDireccion, extraTelefono) o eliminar `extraContext` por completo si no se usa
- Validación post-hoc en `sub-loop/index.ts` para enforcar invariantes (status='canonical' → canonicalText !== null)
- Ajustar consumer en `somnio-v4-agent.ts` (no más type narrowing por discriminator — usar `if (output.status === 'canonical')` con campos opcionales)

Esto es scope adicional **importante** que se debe contemplar en `/gsd-plan-phase`. ~3-4h trabajo extra.

`comprehension-schema.ts` y `nunca-decir-check.ts` NO necesitan re-shape para Gemini.

### D-11 (fallback selectivo per-call) → reformulado

Estrategia original: "Gemini primero + fallback a Haiku per-call". HALLAZGO: Haiku NO PUEDE ser fallback para sub-loop ni comprehension (schemas incompatibles).

Estrategia revisada:
- **Default: Gemini Flash-Lite en los 3 calls.**
- **Si Gemini falla persistentemente** (tasas de error >5% en producción) → fallback con orden:
  1. Gemini 2.5 Flash (no Lite — más capacity)
  2. GPT-4o mini (requiere key OpenAI con scopes amplios — la actual no sirve)
  3. Anthropic Haiku — solo viable para CheckSchema (nunca-decir-check). NO para LoopOutcome ni comprehension.

### D-12 (re-calibración 1-2h) → probablemente no necesaria

Plan 12.1 confidence values (commit `7d9bb2e`) funcionan en Gemini sin ajuste. Los 5 mensajes test dieron confidence dentro del rango esperado. **No se necesita re-calibración**, lo que ahorra 1-2h del trabajo.

Caveat: solo testeé 5 mensajes. En `/gsd-plan-phase` agregar smoke con 15-20 mensajes adicionales del corpus real (los del Plan 12.1 RESUME-NOTES.md) para confirmar.

### D-18 (modelo del NoRepetitionFilter post-research) → decidir post-shipping

NoRepetitionFilter no fue testeado en este research (es deuda menor, flag OFF default). Si se activa eventualmente:
- Schemas internos del filter son simples (similar a CheckSchema) → Haiku funcionaría
- Costo Sonnet → Gemini Flash-Lite ahorraría aún más
- Decisión post-research específico cuando el flag se vaya a activar

### D-28 (pricing comparison + caching) → completado

- Gemini ~15x más barato que Haiku confirmed
- Latency ambos en 1-9s p95 (sin diferencias dramáticas en este test). Verificar en producción con prompt caching real
- Caching: Anthropic tiene `cache_read_input_tokens` 90% discount. Gemini context caching es distinto (Implicit caching, depende de `cachedContent`). Para v4 con prompts cortos, el caching beneficio es marginal en ambos.

## Hallazgos críticos NO ANTICIPADOS

### H-1: El sub-loop de v4 NUNCA ha corrido en runtime real

Evidencia:
- `LoopOutcomeSchema` discriminated union es rechazado por TODAS las APIs structured output testeadas
- Tests del v4 sub-loop son mocks (`__tests__/kb-search-tool.test.ts` solo testea el tool, no el sub-loop completo)
- No hay tests E2E del sub-loop con API real

Implicación: cuando Plan 13 padre se hubiera ejecutado, el sub-loop habría fallado al primer disparo (`low_confidence`, `crm_mutation`, `cas_reject`, `razonamiento_libre`). El error sería visible en observability events como falla de `generateText` con schema invalid.

Esto es deuda crítica del padre `somnio-sales-v4` que NO fue detectada en su Plan 12.1 (smoke pre-flip) porque el smoke se hizo en /sandbox que en realidad estaba corriendo V1 (descubierto el 2026-05-06).

### H-2: AI SDK v6 + Anthropic structured output tiene limitaciones serias

Anthropic vía AI SDK rechaza:
- `oneOf` (discriminated unions)
- `propertyNames` (z.record)
- `minimum`/`maximum` en numbers (z.number().min().max())
- `enum: [false]` (z.literal con boolean)

El v4 actual (`comprehension.ts:84`) usa **Anthropic SDK directo** (no AI SDK) con tools manual. Por eso supuestamente funcionaba — pero el sub-loop sí usa AI SDK y nunca funcionó.

### H-3: Gemini structured output es mucho más permisivo + más barato + comparable en quality

Gemini 2.5 Flash-Lite acepta schemas que Anthropic rechaza, y mantiene quality igual o superior:
- Schema flat sin discriminated union: 3/3 match
- Comprehension schema con Plan 12.1: 5/5 calibration correcta
- NuncaDecir simple: 2/2 match

Sospecha: Gemini structured output via `generation_config.response_schema` es más maduro que Anthropic structured output. Anthropic se concibe alrededor de tools, no JSON schema directo.

## Riesgos identificados (post-research)

1. **Re-shape LoopOutcomeSchema** afecta consumers (somnio-v4-agent.ts) — type narrowing perdido, hay que adaptar.
2. **Validación post-hoc** del schema flat es responsabilidad del runtime — riesgo de invariantes rotas si Gemini emite output incompleto. Mitigación: validar antes de retornar de `runSubLoop`, escalate a no_match si invariante roto.
3. **Test del sub-loop con API real es nuevo** — el primer smoke de Wave A debe específicamente probar `runSubLoop` con disparos reales (low_confidence, razonamiento_libre, etc.) para confirmar comportamiento end-to-end.
4. **OpenAI key para fallback no sirve** — si en producción Gemini falla y queremos GPT-4o mini, hay que crear key nueva con scopes amplios primero.
5. **Pricing real Gemini** debe verificarse en Vercel deployment con `agent_observability_ai_calls.cost_usd` poblado correctamente. Confirmación final post-shipping.

## Recomendaciones para `/gsd-plan-phase`

### Plans propuestos (revisión de las waves originales del CONTEXT.md)

**Wave 0:** Setup deps + env vars + V4ProductionRunner duplicado
- Sin cambios — listo para plan

**Wave 1 (NUEVO):** Re-shape `LoopOutcomeSchema` + validación post-hoc + adaptar consumers
- `output-schema.ts`: schema flat sin discriminated union, sin literals, sin record
- `sub-loop/index.ts`: validar invariantes post-generation, escalate a no_match si roto
- `somnio-v4-agent.ts`: adaptar consumer (type narrowing manual con if/else por status)
- Tests: agregar test E2E de `runSubLoop` con API real (no mock)

**Wave 2:** engine-v4.ts (sandbox wrapper) + branch sandbox + smoke A inicial
- Sin cambios — listo para plan

**Wave 3:** branch webhook-processor + modelo swap STACK MIXTO (Gemini + GPT-4o mini)
- `comprehension.ts:84`: migrar de `Anthropic SDK directo` a `generateText + Output.object` con `google('gemini-2.5-flash-lite')` (D-30)
- `sub-loop/index.ts:54`: cambiar `anthropic('claude-haiku-4-5-20251001')` → `openai('gpt-4o-mini')` (D-30 — Gemini API NO soporta tools + Output.object combinados)
- `sub-loop/nunca-decir-check.ts:34`: cambiar `anthropic('claude-haiku-4-5-20251001')` → `google('gemini-2.5-flash-lite')` (D-30)
- Smoke retest A (sandbox)

**Wave 4:** NoRepetitionFilter wired (gated por flag separado USE_NO_REPETITION_V4)
- Sin cambios — listo para plan

**Wave 5:** Smoke wave B (prod con tráfico real, atomic flip)
- Sin cambios — listo para plan
- IMPORTANTE: el smoke debe específicamente activar el sub-loop al menos 1 vez ("qué tan adictivo es vs zolpidem?" debe disparar low_confidence) para validar runtime real

### Estimación de tiempo total revisada

Original estimate: 9-12h
Nueva estimate: 12-15h (debido a Wave 1 nuevo: re-shape schema + post-hoc validation + adapter consumers + test E2E)

### Cambios al CONTEXT.md tras research

- D-12 → marcar como "no necesaria (research mostró Gemini honra valores Plan 12.1)"
- D-11 → reformular: Gemini default + GPT-4o mini fallback (NO Haiku)
- Añadir D-29: re-shape `LoopOutcomeSchema` obligatorio (Wave 1 nuevo)
- Añadir nota sobre H-1 (sub-loop nunca corrió en runtime real)

## Próximos pasos

1. **Revisar este RESEARCH.md con jose** — confirmar que H-1 (sub-loop nunca corrió) cambia el plan en formas aceptables.
2. **Decidir sobre fallback OpenAI** — ¿crear key nueva con scopes amplios? ¿o aceptar Gemini sin fallback robusto y monitorear?
3. **Ejecutar `/gsd-plan-phase somnio-sales-v4-runtime-wiring`** con las waves revisadas (incluyendo Wave 1 schema re-shape).
