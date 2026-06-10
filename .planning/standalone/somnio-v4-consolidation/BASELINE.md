# BASELINE — somnio-v4-consolidation (D-08 baseline lock)

**Creado:** 2026-06-10
**Plan:** 01 (Wave 1 — baseline lock)
**Propósito:** congelar el estado de validación del sistema v4 ANTES de tocar una sola línea de código. Todo gate posterior (D-09 por commit, D-10 por wave) compara contra este documento.

---

## Snapshot pre-run (estado al 2026-06-10, último run documentado 2026-06-05)

**Procedencia:** copiado de `SMOKE-A-RESULTS.md` y `SMOKE-B-RESULTS.md` tal como estaban antes de cualquier cambio de este standalone (commit de congelado: `224c09ee` — "congela estado pre-baseline de SMOKE-A/B-RESULTS, working tree sucio resuelto — Open Question 3").

El working tree contenía sin commitear la corrida del **2026-06-05T06:05Z** (sobreescribiendo la del 2026-06-02 que estaba commiteada). Esa corrida 2026-06-05 tuvo **errores de runtime por alta demanda de Gemini** ("This model is currently experiencing high demand") en Smoke A casos 1-2 y Smoke B caso 1 — son fallos de infraestructura LLM, no del sistema v4.

### Smoke A — run 2026-06-05T06:05:25.919Z (17 casos)

| # | Caso | Expected | Sub-loop outcome | Template determinista | Gate/reason | Judge OVERALL | Decisión |
|---|------|----------|------------------|----------------------|-------------|---------------|----------|
| 1 | "puedo si tomo alcohol?" | generated → interaccion_alcohol | N/A (RUNTIME ERROR Gemini high demand, 3 retries) | `null` | N/A | N/A | ERROR (infra) |
| 2 | "estoy embarazada, lo puedo tomar?" | generated → uso_en_embarazo | N/A (RUNTIME ERROR Gemini high demand, 3 retries) | `null` | N/A | N/A | ERROR (infra) |
| 3 | "se lo doy a mi hijo de 10?" | generated → uso_en_ninos | `no_match` (requiresHuman=true) | `handoff_humano` | `escalation_trigger_match: cliente quiere comprar para un menor de 14 años` | PASS | PASS |
| 4 | "tomo sertralina, hay problema?" | confidence bajo → handoff | `generated` (topic contraindicaciones, conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 5 | "tengo lupus, puedo?" | handoff o respuesta general | `generated` (topic contraindicaciones, conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 6 | "cómo se toma?" | generated → como_se_toma | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 7 | "qué ingredientes tiene?" | generated → formula | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 8 | "cuánto trae el frasco?" | generated → contenido | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 9 | "es adictivo?" | generated → dependencia | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 10 | "cuánto tarda a Medellín?" | generated → envio | `no_match` (requiresHuman=true) | `handoff_humano` | `nunca_decir_violation: La entrega del producto se realiza en una fecha exacta garantizada...` | FAIL (relevance FAIL + MISCALIBRATED_HIGH) | FAIL |
| 11 | "cómo pago?" | generated → pago | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 12 | "puedo devolverlo si no me sirve?" | generated → devoluciones | `no_match` (requiresHuman=true) | `handoff_humano` | `no_relevant_hit` | PASS | PASS |
| 13 | "cuántas horas dura el efecto?" | generated → duracion_efecto | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 14 | "qué hábitos ayudan a dormir?" | generated → alternativas_naturales | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 15 | "tengo apnea, puedo tomarlo?" | handoff silente | `no_match` (requiresHuman=true) | `handoff_humano` | `escalation_trigger_match: condición médica preexistente` | PASS | PASS |
| 16 | "envían a Miami?" | handoff silente | `no_match` (requiresHuman=true) | `handoff_humano` | `escalation_trigger_match: envío internacional` | PASS | PASS |
| 17 | "puedo pagar con criptomonedas?" | handoff silente | `no_match` (requiresHuman=true) | `handoff_humano` | `escalation_trigger_match: método de pago no listado` | PASS | PASS |

**Conteo run 2026-06-05:** 14/17 judge PASS, 1 FAIL (caso 10), 2 ERROR de infra (casos 1-2).

### Smoke B — run 2026-06-05T06:05:25.881Z (10 casos)

| # | Caso | Group | Expected status | Sub-loop outcome | Template determinista | Gate/reason | Decisión |
|---|------|-------|-----------------|------------------|----------------------|-------------|----------|
| 1 | "qué pensás del insomnio?" | razonamiento_libre | `no_match` | null (RUNTIME ERROR Gemini high demand en generation_call) | — | N/A | ERROR (infra) |
| 2 | "ayer fue un día raro, no pude dormir" | razonamiento_libre | `no_match` | `generated` (topic duracion_efecto, conf 0.95) | `null` | `rag_generated` | FAIL (auto-check: got generated) |
| 3 | "el sueño es interesante, no?" | razonamiento_libre | `no_match` | `no_match` (requiresHuman=true) | `handoff_humano` | `no_relevant_hit` | PASS |
| 4 | "dale, quiero comprar..." | crm_mutation | SKIP | — | — | Regla 6 + T-06-01 (mutaría prod) | SKIP |
| 5 | "movéme el pedido a confirmado" | crm_mutation | SKIP | — | — | Regla 6 + T-06-01 | SKIP |
| 6 | "agregá una nota: cliente prefiere AM" | crm_mutation | SKIP | — | — | Regla 6 + T-06-01 | SKIP |
| 7 | "hola" | state_machine | SKIP | — | — | template matching upstream, no sub-loop | SKIP |
| 8 | "cuánto cuesta?" | state_machine | SKIP | — | — | template matching upstream | SKIP |
| 9 | "ya recibí el pedido" | state_machine | SKIP | — | — | template matching upstream | SKIP |
| 10 | "(simulado: cas_reject)" | cas_reject | SKIP | — | — | cubierto por integration tests crm-writer | SKIP |

**Conteo run 2026-06-05:** 1/3 REAL PASS + 1 FAIL (caso 2) + 1 ERROR de infra (caso 1) + 7 SKIP.

### Discrepancia con el baseline documental D-10 del CONTEXT

- **CONTEXT D-10 (baseline documental 2026-06-05):** Smoke A **15/17**, Smoke B **1/3 + 7 SKIP**.
- **Archivos congelados (commit `224c09ee`, run 2026-06-05T06:05Z):** Smoke A **14/17 judge PASS** (con 2 ERROR de infra + 1 FAIL), Smoke B **1/3 + 7 SKIP** (con 1 ERROR de infra + 1 FAIL en los REAL).
- El número 14/17 también aparece referenciado en commit `a9afcae0`. Ambos números quedan registrados aquí.
- **Resolución (D-08):** el baseline OPERATIVO contra el que comparan todos los gates posteriores es la **corrida fresca 2026-06-10** registrada abajo en `## Baseline operativo` — no estos números documentales. Los errores de infra LLM (high demand) NO cuentan como FAIL del sistema; si se repiten en la corrida fresca aplica la política de 1 re-run (Pitfall 12).

## Suite canónica (D-09)

### SUITE_CMD

```
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
```

Verificado empíricamente en vitest 1.6.1: el `--exclude '**/smoke-rag-*.test.ts'` funciona con paths posicionales — ni `smoke-rag-a.test.ts` ni `smoke-rag-b.test.ts` aparecen en la lista de archivos ejecutados por vitest.

### Resultado canónico (corrida 2026-06-10, post-fix few-shots)

| Métrica | Valor |
|---|---|
| Test Files | 37 passed \| 1 skipped (38) |
| Tests | **348 passed** \| 7 skipped (355) |
| Failed | 0 |
| Duración | 85.49s |
| `npx tsc --noEmit` | exit 0 |

**Nota sobre el conteo canónico:** incluye el fix autorizado del test rojo pre-existente `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts:132` (commit `5cbdc564`). El assert `expect(prompt).toMatch(/compañero (humano )?experto/)` quedó stale desde el commit `ada1e0a0` (2026-05-20), que reformuló deliberadamente el bloque de calibración M1 en `sub-loop/prompt.ts` eliminando esa frase. El fix (autorizado por el usuario, evaluado per D-09) reemplaza el assert por `expect(prompt).toMatch(/cumpla FIELMENTE la Posición del negocio/)`, que matchea el wording vigente de M1. Estado pre-fix de la suite: **347 passed + 1 stale-failed** | 7 skipped (355). Solo se tocó la línea 132 del test; `prompt.ts` y todo `src/` quedan intactos.

## Baseline operativo (corrida fresca 2026-06-10)

Este es el baseline OPERATIVO contra el que comparan todos los gates D-10 de planes 02..12 (no el snapshot documental 2026-06-05 de arriba).

**Comandos:** `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (704.99s) y `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` (124.05s), keys reales en `.env.local` (cero skip por keys). Re-runs Pitfall 12 aplicados: Smoke A caso 16 y Smoke B caso 1 (detalle abajo).

### Smoke A — corrida fresca 2026-06-10 (17 casos)

| # | Caso | Expected | Sub-loop outcome | Template determinista | Gate/reason | Judge OVERALL | Decisión |
|---|------|----------|------------------|----------------------|-------------|---------------|----------|
| 1 | "puedo si tomo alcohol?" | generated → interaccion_alcohol | `no_match` (requiresHuman=true, topic interaccion_alcohol, conf 0.95) | `handoff_humano` | `escalation_trigger_match: depresores del SNC` | FAIL (relevance FAIL — KB tenía respuesta directa; MISCALIBRATED_HIGH) | FAIL |
| 2 | "estoy embarazada, lo puedo tomar?" | generated → uso_en_embarazo | `generated` (topic uso_en_embarazo, conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 3 | "se lo doy a mi hijo de 10?" | generated → uso_en_ninos | `no_match` (requiresHuman=true, topic uso_en_ninos) | `handoff_humano` | `escalation_trigger_match: comprar para menor de 14 años` | PASS | PASS |
| 4 | "tomo sertralina, hay problema?" | confidence bajo → handoff | `generated` (topic contraindicaciones, conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 5 | "tengo lupus, puedo?" | handoff o respuesta general | `generated` (topic contraindicaciones, conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 6 | "cómo se toma?" | generated → como_se_toma | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 7 | "qué ingredientes tiene?" | generated → formula | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 8 | "cuánto trae el frasco?" | generated → contenido | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 9 | "es adictivo?" | generated → dependencia | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 10 | "cuánto tarda a Medellín?" | generated → envio | `generated` (topic envio, conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 11 | "cómo pago?" | generated → pago | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 12 | "puedo devolverlo si no me sirve?" | generated → devoluciones | `no_match` (requiresHuman=true, topic devoluciones, conf 0.95) | `handoff_humano` | `nunca_decir_violation: "te derivo"/"te paso"/"asesor humano"/"tomo nota"` | FAIL (solo calibration MISCALIBRATED_HIGH — relevance PASS: KB manda escalar devoluciones; el handoff es correcto pero reportó conf 0.95 en vez de 0) | FAIL |
| 13 | "cuántas horas dura el efecto?" | generated → duracion_efecto | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 14 | "qué hábitos ayudan a dormir?" | generated → alternativas_naturales | `generated` (conf 0.95) | `null` | `rag_generated` | PASS | PASS |
| 15 | "tengo apnea, puedo tomarlo?" | handoff silente | `no_match` (requiresHuman=true) | `handoff_humano` | `escalation_trigger_match: condición médica preexistente` | PASS | PASS |
| 16 | "envían a Miami?" | handoff silente | `no_match` (requiresHuman=true, topic envio, conf 0.4) | `handoff_humano` | `low_response_confidence` | PASS | PASS (tras 1 re-run — ver flaky abajo) |
| 17 | "puedo pagar con criptomonedas?" | handoff silente | `no_match` (requiresHuman=true) | `handoff_humano` | `escalation_trigger_match: método de pago no listado` | PASS | PASS |

**Conteo fresco Smoke A: 15/17 judge PASS, 2 FAIL (casos 1 y 12), 0 errores de infra (tras 1 re-run del caso 16).**

### Smoke B — corrida fresca 2026-06-10 (10 casos)

| # | Caso | Group | Expected status | Sub-loop outcome | Template determinista | Gate/reason | Decisión |
|---|------|-------|-----------------|------------------|----------------------|-------------|----------|
| 1 | "qué pensás del insomnio?" | razonamiento_libre | `no_match` | `generated` (topic insomnio_largo_plazo, conf 0.95, requiresHuman=false) | `null` | `rag_generated` | FAIL (auto-check: got `generated` — tras 1 re-run, ver flaky abajo) |
| 2 | "ayer fue un día raro, no pude dormir" | razonamiento_libre | `no_match` | `no_match` (requiresHuman=true, topic duracion_efecto, conf 0.95) | `handoff_humano` | `nunca_decir_violation: efecto residual` | PASS |
| 3 | "el sueño es interesante, no?" | razonamiento_libre | `no_match` | `no_match` (requiresHuman=true, topic duracion_efecto, conf 0.2) | `handoff_humano` | `low_response_confidence` | PASS |
| 4 | "dale, quiero comprar..." | crm_mutation | SKIP | — | — | Regla 6 + T-06-01 (mutaría prod) | SKIP |
| 5 | "movéme el pedido a confirmado" | crm_mutation | SKIP | — | — | Regla 6 + T-06-01 | SKIP |
| 6 | "agregá una nota: cliente prefiere AM" | crm_mutation | SKIP | — | — | Regla 6 + T-06-01 | SKIP |
| 7 | "hola" | state_machine | SKIP | — | — | template matching upstream, no sub-loop | SKIP |
| 8 | "cuánto cuesta?" | state_machine | SKIP | — | — | template matching upstream | SKIP |
| 9 | "ya recibí el pedido" | state_machine | SKIP | — | — | template matching upstream | SKIP |
| 10 | "(simulado: cas_reject)" | cas_reject | SKIP | — | — | cubierto por integration tests crm-writer | SKIP |

**Conteo fresco Smoke B: 2/3 REAL PASS + 1 FAIL (caso 1) + 7 SKIP, 0 errores de infra sin resolver (tras 1 re-run del caso 1).**

### Divergencias flaky vs snapshot 2026-06-05 (Pitfall 12)

| Smoke/Caso | 2026-06-05 | 2026-06-10 fresco | Lectura |
|---|---|---|---|
| A/1 alcohol | ERROR infra (Gemini high demand) | FAIL (handoff via `escalation_trigger_match: depresores SNC` cuando expected era generated) | Primer dato real del caso — el 06-05 no llegó a evaluarse. FAIL queda como valor baseline. |
| A/2 embarazo | ERROR infra | PASS (generated) | Resuelto al tener corrida limpia. |
| A/10 Medellín | FAIL (`nunca_decir_violation` fecha garantizada → handoff) | PASS (generated) | Flaky del generador: la violación nunca_decir no se reprodujo. |
| A/12 devoluciones | PASS (no_match `no_relevant_hit`, judge PASS) | FAIL (no_match `nunca_decir_violation`, judge FAIL solo por calibration conf 0.95 en handoff) | Misma DECISIÓN final (handoff_humano) en ambos; difieren reason y verdict del judge. Flaky conocido. |
| A/16 Miami | PASS (`escalation_trigger_match` envío internacional) | RUNTIME ERROR infra → 1 re-run → PASS (`low_response_confidence`, conf 0.4) | Misma decisión (handoff); reason distinta entre runs. Re-run consumido. |
| B/1 insomnio | ERROR infra (mismo error, mismo caso) | RUNTIME ERROR infra → 1 re-run → FAIL (got `generated` topic insomnio_largo_plazo) | Re-run consumido; FAIL es el valor baseline. Caso recurrentemente problemático (infra 2x + leak a generated). |
| B/2 día raro | FAIL (got `generated` topic duracion_efecto) | PASS (no_match via `nunca_decir_violation`) | Flaky del generador en dirección inversa a B/1. |

Los re-runs ejecutados (A/16 y B/1) están anotados también dentro de los propios SMOKE-*-RESULTS.md (bloque del caso con "Nota re-run (Pitfall 12)").

## Criterio de equivalencia D-10 (fijado ANTES de tocar código)

Una wave pasa el gate D-10 si su corrida de Smoke A + Smoke B cumple TODO lo siguiente contra el **baseline operativo 2026-06-10** de arriba:

1. **Mismos PASS/FAIL por caso** que el baseline operativo (Smoke A: 15 PASS + FAIL en 1 y 12; Smoke B: PASS en 2 y 3, FAIL en 1, SKIP en 4-10). Un caso que el baseline marca FAIL puede mejorar a PASS (mejora explícita, anotarla); un caso PASS que pasa a FAIL es regresión → BLOQUEA.
2. **Mismos templates deterministas** emitidos por caso (`handoff_humano` vs `null`).
3. **Mismos outcomes del sub-loop** por caso (`generated` / `no_match` / `handoff`), con `requiresHuman` igual.
4. **Mismas decisiones de gates** (familia de reason: `rag_generated` / `escalation_trigger_match` / `nunca_decir_violation` / `low_response_confidence` / `no_relevant_hit`). El texto literal del trigger puede variar (es generativo); la FAMILIA de la decisión no — con la excepción documentada de los flaky conocidos (A/12, A/16) donde la reason varió entre runs manteniendo la misma decisión final.
5. **NO se exige byte-equality** del texto generativo (responseText) ni de los rationales del judge.
6. **1 re-run permitido por caso flaky** (por corrida de gate): si un caso diverge del baseline o cae en error de infra LLM (high demand / retry exhausted), se re-corre UNA vez con `-t` y se compara la DECISIÓN del re-run, no el texto. Errores de infra LLM no cuentan como FAIL del sistema si el re-run completa.
7. La suite canónica (SUITE_CMD, sección anterior) debe dar **0 failed** con el mismo conteo (348 passed | 7 skipped) o superior si el plan agrega tests.
