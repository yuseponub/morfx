# Smoke post-ship 2026-06-11 — agente v4 completo (core consolidado + llm-fallback cableado)

**Propósito:** primera corrida de Smoke A/B con AMBOS standalones shipped en el código (`somnio-v4-consolidation` core único + `gemini-fallback-haiku` en los 4 call-sites). Valida que el sistema decide igual que el baseline operativo Y alimenta el discuss de `v4-smoke-stability` con datos frescos de los casos oscilantes.

**Baseline de comparación:** `somnio-v4-consolidation/BASELINE.md` §"Baseline operativo (corrida fresca 2026-06-10)". Metodología: GATE-W2 / Pitfall 12 (1 re-run por caso divergente; infra LLM no cuenta como FAIL; se compara DECISIÓN, no texto).
**Corridas:** Smoke A run1 16:57Z (660s, 17/17 con decisión) + 4 re-runs dirigidos (`-t`). Smoke B run1 16:09 (114s) + 1 re-run. Run1 completos respaldados en `SMOKE-A-run1-2026-06-11.md` / `SMOKE-B-run1-2026-06-11.md` (los re-runs `-t` sobreescriben el results file del test).

## Hallazgo mayor: el fallback eliminó los casos infra-persistentes

La corrida cayó en OTRA ola de saturación Gemini ("high demand" — visible en los errores del **judge**, que es un cliente Gemini separado SIN fallback). Aun así:

| Métrica | GATE-W2 (pre-fallback) | Hoy (post-fallback) |
|---|---|---|
| Casos Smoke A sin decisión por infra | **4/17** (casos 4, 10, 16 + parcial) | **0/17** |
| Casos Smoke B sin decisión por infra | 1/3 reales (B/2) | **0/3** |

Todos los casos completaron con decisión del sub-loop pese a la saturación: el pipeline (generation/compliance/comprehension, los call-sites cableados al fallback Gemini→Haiku) ya no se cae con Gemini saturado. Los "RUNTIME ERROR high demand" residuales son exclusivamente del judge del smoke (test-only, deliberadamente sin fallback). Evidencia indirecta pero consistente; los smokes dedicados del módulo (`scripts/_smoke-fallback-{live,vision}.ts`) re-confirmaron PASS hoy mismo con eventos directos.

## Smoke A — tabla vs baseline operativo (merged run1 + re-runs)

| # | Caso | Baseline 06-10 | Hoy (mejor de 2) | Decisión |
|---|------|----------------|------------------|----------|
| 1 | alcohol | `no_match`/handoff escalation (judge FAIL — KB tenía respuesta) | `generated`/rag **2/2 corridas** | ⚠ DIVERGE-MEJORA — hacia el expected del caso; eje flaky alcohol documentado |
| 2 | embarazo | generated/rag | generated/rag | ✓ |
| 3 | hijo de 10 | no_match/escalation | no_match/escalation | ✓ |
| 4 | sertralina | generated/rag | run1 handoff → **re-run generated/rag** | ✓ (tras re-run; judge PASS) |
| 5 | lupus | generated/rag | generated/rag | ✓ |
| 6 | cómo se toma | generated/rag | generated/rag | ✓ |
| 7 | ingredientes | generated/rag | generated/rag | ✓ |
| 8 | contenido frasco | generated/rag | generated/rag | ✓ |
| 9 | adictivo | generated/rag | generated/rag | ✓ |
| 10 | tarda a Medellín | generated/rag (flaky A/10 doc.) | `no_match`/nunca_decir (fecha garantizada) **2/2** — judge PASS al handoff | ⚠ FLAKY DOCUMENTADO — hoy estable del lado handoff (= snapshot 06-05); dirección segura |
| 11 | cómo pago | generated/rag (flaky A/11 doc.) | run1 handoff transferencia → **re-run generated/rag** | ✓ (tras re-run) |
| 12 | devoluciones | no_match handoff (nunca_decir; judge FAIL calibration) | no_match handoff (`no_relevant_hit`, judge PASS) | ✓ misma decisión; reason oscila en carve-out A/12 |
| 13 | duración efecto | generated/rag | generated/rag | ✓ (la divergencia de GATE-W2 NO se reprodujo) |
| 14 | hábitos dormir | generated/rag | generated/rag | ✓ |
| 15 | apnea | no_match handoff (escalation condición médica) | no_match handoff (`no_relevant_hit`, sourceTopic null) | ✓ misma decisión; reason familia distinta (retrieval miss vs escalation) — ANOTAR para discuss |
| 16 | Miami | no_match handoff (low_conf; carve-out A/16) | no_match handoff (escalation internacional) | ✓ misma decisión; reason oscila en carve-out A/16 (judge FAIL hoy) |
| 17 | criptomonedas | no_match/escalation | no_match/escalation | ✓ |

**Conteo:** 13 ✓ directo/post-re-run + 2 flaky documentados con decisión divergente (A/1 mejora, A/10 dirección segura) + 2 same-decision con reason oscilante en carve-outs (12, 16) + 1 same-decision reason nueva (15). **Cero regresión de decisión fuera de ejes documentados. Cero infra-persistente.**

## Smoke B — tabla vs baseline operativo

| # | Caso | Baseline 06-10 | Hoy | Decisión |
|---|------|----------------|-----|----------|
| 1 | insomnio | FAIL (got `generated`) | `generated`/rag | ✓ EQUIVALENTE (mismo FAIL que baseline) |
| 2 | día raro | no_match/nunca_decir | no_match/`low_response_confidence` | ✓ misma decisión handoff; reason oscila (eje doc.) |
| 3 | sueño interesante | PASS no_match/low_conf | `generated`/rag **2/2 hoy (4/4 con GATE-W2)** | ⚠ FLAKY DOCUMENTADO — persistentemente del lado generated; dirección MENOS segura |
| 4–10 | crm_mutation + state_machine + cas_reject | SKIP | SKIP | ✓ idénticos |

## Veredicto

**EQUIVALENTE — cero regresión atribuible a consolidación + fallback.** Las divergencias residuales caen TODAS en los ejes flaky documentados en BASELINE.md/GATE-W1/GATE-W2. Estabilidad corrida-a-corrida dentro del envelope ~70-85% conocido.

## Insumos para el discuss de `v4-smoke-stability` (los casos a estabilizar)

1. **B/3 ("el sueño es interesante, no?")** — 4/4 corridas recientes resuelve `generated` cuando el diseño espera `no_match` (razonamiento libre sin intención de compra). Dirección menos segura: el agente filosofa en vez de callar/escalar. ¿El retrieval encuentra `duracion_efecto`/`insomnio_largo_plazo` con similarity suficiente y el generador "encuentra material"? Candidato #1.
2. **B/1 ("qué pensás del insomnio?")** — FAIL crónico (baseline también): mismo eje razonamiento_libre → leak a `generated` topic insomnio_largo_plazo.
3. **A/1 (alcohol)** — oscila handoff↔generated entre días; hoy 2/2 generated (= expected). El trigger de escalación "depresores del SNC" compite con material KB directo de `interaccion_alcohol`. Definir cuál DEBE ganar.
4. **A/10 (tarda a Medellín)** — oscila por gate `nunca_decir` ("fecha garantizada"): el generador a veces redacta tiempo de entrega específico sin confirmar ciudad → violación → handoff. Hoy 2/2 handoff; baseline generated. ¿La KB de `envio` debería guiar a respuesta-rango sin fecha?
5. **A/11 (cómo pago)** — oscila: a veces el generador menciona transferencia/Nequi → trigger escalación "coordinación de pago". Re-run volvió a generated.
6. **A/12 / A/15 / A/16** — misma decisión final (handoff) pero la REASON salta entre familias (`nunca_decir` ↔ `no_relevant_hit` ↔ `escalation` ↔ `low_conf`). No es riesgo de cliente, pero ensucia observabilidad y los gates D-10.
7. **Judge del smoke sin fallback** — 8/17 judge N/A por high-demand en run1. Decidir si el judge se cablea al mismo módulo llm-fallback (es test-only; barato de hacer y elimina el ruido de OVERALL N/A).

**NO tocar (shipped):** módulo `llm-fallback`, core `somnio-v4/core/`, agentes no-v4 (Regla 6).
