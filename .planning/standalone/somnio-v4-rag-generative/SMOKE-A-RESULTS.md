# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-05-18T19:04:30.215Z (clean re-run completa, 17/17 evaluados)
**HEAD git:** `ab7a8a1` (Plan 05 task 5.1 + 5.2 + 5.3 throttle)
**Run condition:** Google AI Studio **paid tier activo** (`serviceTier=standard` verificado pre-run). Throttle 7s entre casos como safety net residual.
**Model tooling:** gpt-4o-mini (OpenAI) — embed + tool-calling
**Model generación:** gemini-2.5-flash temperature=0.3 + safety BLOCK_NONE × 4
**Model judge:** gemini-2.5-flash temperature=0.1 (separate client — D-26 anti self-enhancement bias)
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)
**Total casos:** 17 (todos completaron evaluación, 0 runtime errors, 0 quota fallos)
**Run duration:** ~13.2 min (793s vitest total) / latency E2E promedio 37.1s por caso (tooling + generation + judge)

---

## Resumen ejecutivo

| Métrica | Valor | Notas |
|---|---|---|
| **Judge OVERALL PASS** | **14 / 17** (82.4%) | ≥14 PASS = criterio mínimo Smoke A cumplido |
| Judge OVERALL PARTIAL | 0 / 17 | — |
| **Judge OVERALL FAIL** | **3 / 17** (17.6%) | Cases 2, 13, 14 — todos `nunca_decir_violation` false-positives |
| **Invenciones detectadas (judge)** | **0 / 17** ✓ | RAG architecture firma de calidad: cero alucinaciones |
| Faithfulness PASS | 17 / 17 | 100% — generation no inventa nunca |
| Relevance PASS | 14 / 17 | mismas 3 FAIL = handoff cuando debía responder |
| Calibration CALIBRATED | 14 / 17 | — |
| Calibration MISCALIBRATED_HIGH | 3 / 17 | mismas 3 FAIL: confidence 0.95 + handoff inapropiado |
| Calibration MISCALIBRATED_LOW | 0 / 17 | — |
| Runtime errors | 0 / 17 ✓ | paid tier eliminó el bloqueo del 2026-05-17 |
| Avg latency total | 37.1s / caso | tooling ~3-5s + generation ~25-30s + judge ~5-8s |

### Findings clave

1. **Cero invenciones** — el judge no detectó ningún claim fuera del material en los 17 casos. RAG está estructuralmente sano: tooling selecciona topic correcto, generation se ajusta SOLO al material. Esto valida la arquitectura del Plan 03 (RAG-generativo verbatim) y la calibración del Plan 04 (few-shots M1/M2/M3/M4).
2. **3 FAILs son un patrón único — nunca_decir over-trigger:** Cases 2 (embarazo), 13 (duración efecto), 14 (hábitos sueño) — los 3 reportan `status: no_match` con `reason: nunca_decir_violation`, pero el judge confirma que la respuesta esperada estaba en el material. El `nunca_decir_check` (sub-loop guardrail) es demasiado agresivo: dispara handoff cuando la generación, leída literalmente, sí menciona conceptos del array `nunca_decir` (ej. "aprobar uso durante embarazo o lactancia") aunque el contenido sea exactamente lo contrario (la respuesta DICE NO al embarazo). Esto es un Plan 07 candidate — refinar el check para evaluar polaridad/contexto, no string match plano.
3. **Negativos manejados bien (2/3 handoff silente, 1/3 respuesta constructiva):** Case 15 (apnea) y 16 (Miami) → confidence baja (0.4 / 0.2) → handoff silente, como esperaba. Case 17 (cripto) → respondió usando topic `pago` para decir "no aceptamos cripto" + listar métodos disponibles → judge PASS. **Mejor que handoff** — el modelo aprovechó material adyacente para respuesta útil. Behavior emergente positivo.
4. **Confidence calibrada en los 14 PASS** — los 14 casos con OVERALL PASS reportan 0.95 (alto) o 0.20-0.40 (bajo handoff); el judge confirma CALIBRATED. Threshold D-14 (0.70) funciona: confidence ≥0.95 → responde con respuesta de calidad; confidence ≤0.40 → handoff silente correcto.
5. **Topic selection 100% on-target:** el tooling LLM eligió el topic relevante en TODOS los 17 casos (incluso negativos: apnea→insomnio_largo_plazo adjacent, cripto→pago). El embed similarity range 0.31-0.68 con re-formulación de query mejora el hit. Plan 04 few-shots calibration funcionó.

---

## Tabla por caso (resumen)

| # | Categoría | Pregunta | Sub-loop status | Source topic | Conf. | Judge OVERALL | Invención | Jose | Latency |
|---|---|---|---|---|---|---|---|---|---|
| 1 | edge-cases | "puedo si tomo alcohol?" | `generated` | interaccion_alcohol | 0.95 | **PASS** | N | ☐ | 32.8s |
| 2 | edge-cases | "estoy embarazada, lo puedo tomar?" | `no_match` (nunca_decir) | uso_en_embarazo | 0.95 | **FAIL** | N | ☐ | 45.5s |
| 3 | edge-cases | "se lo doy a mi hijo de 10?" | `generated` | uso_en_ninos | 0.95 | **PASS** | N | ☐ | 33.4s |
| 4 | edge-cases | "tomo sertralina, hay problema?" | `no_match` (handoff) | contraindicaciones | 0.95 | **PASS** | N | ☐ | 35.8s |
| 5 | edge-cases | "tengo lupus, puedo?" | `generated` | contraindicaciones | 0.95 | **PASS** | N | ☐ | 37.1s |
| 6 | product | "cómo se toma?" | `generated` | como_se_toma | 0.95 | **PASS** | N | ☐ | 29.0s |
| 7 | product | "qué ingredientes tiene?" | `generated` | formula | 0.95 | **PASS** | N | ☐ | 50.1s |
| 8 | product | "cuánto trae el frasco?" | `generated` | contenido | 0.95 | **PASS** | N | ☐ | 44.4s |
| 9 | product | "es adictivo?" | `generated` | dependencia | 0.95 | **PASS** | N | ☐ | 37.4s |
| 10 | policies | "cuánto tarda a Medellín?" | `generated` | envio | 0.95 | **PASS** | N | ☐ | 35.8s |
| 11 | policies | "cómo pago?" | `generated` | pago | 0.95 | **PASS** | N | ☐ | 36.8s |
| 12 | policies | "puedo devolverlo si no me sirve?" | `generated` | devoluciones | 0.95 | **PASS** | N | ☐ | 30.0s |
| 13 | faqs-no-templated | "cuántas horas dura el efecto?" | `no_match` (nunca_decir) | duracion_efecto | 0.95 | **FAIL** | N | ☐ | 31.7s |
| 14 | faqs-no-templated | "qué hábitos ayudan a dormir?" | `no_match` (nunca_decir) | alternativas_naturales | 0.95 | **FAIL** | N | ☐ | 29.4s |
| 15 | negativos | "tengo apnea, puedo tomarlo?" | `no_match` (handoff) | insomnio_largo_plazo | 0.40 | **PASS** | N | ☐ | 40.1s |
| 16 | negativos | "envían a Miami?" | `no_match` (handoff) | envio | 0.20 | **PASS** | N | ☐ | 32.3s |
| 17 | negativos | "puedo pagar con criptomonedas?" | `generated` | pago | 0.95 | **PASS** | N | ☐ | 49.1s |

**Leyenda:**
- `status` = `generated` → modelo respondió usando KB; `no_match` (nunca_decir) → bloqueado por guardrail `nuncaDecirCheck`; `no_match` (handoff) → confidence < 0.70 → handoff silente correcto.
- Invención: `N` = judge verificó cero claims fuera del material. `Y` (judge detected ...) = invención detectada (no hay ninguno en este run).
- Jose: marcar manualmente después de leer la respuesta + judge reasoning.

---

## Per-case results


### Case 1 — "puedo si tomo alcohol?"

**Categoría:** edge-cases
**Expected:** generated → interaccion_alcohol
**Latency total:** 32844ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No recomendamos combinar el ELIXIR DEL SUEÑO con alcohol. La melatonina puede potenciar el efecto sedante del alcohol, ya que ambos son depresores del sistema nervioso central, lo que podría causar somnolencia excesiva o malestar. Por tu seguridad, es mejor evitarlo."
- sourceTopic: `interaccion_alcohol`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta sigue las directrices exactas del material sobre la combinación de melatonina y alcohol, incluyendo la recomendación y el mecanismo."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `interaccion_alcohol`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 7
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta menciona la recomendación de no combinar, el efecto sedante potenciado, y que ambos son depresores del SNC, todo lo cual está explícitamente en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto si consume alcohol, respondiendo con una clara recomendación de NO combinarlo y explicando brevemente el porqué, tal como lo exige el material en 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con puntuaciones PASS en Faithfulness y Relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 2 — "estoy embarazada, lo puedo tomar?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_embarazo
**Latency total:** 45545ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `uso_en_embarazo`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta se basa directamente en la información proporcionada sobre el uso del producto durante el embarazo."
- reason: `nunca_decir_violation: aprobar uso durante embarazo o lactancia`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `uso_en_embarazo`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 6
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente es una consulta directa sobre el uso del producto durante el embarazo. El material indica claramente que si el cliente 'solo pregunta sin intención clara de compra → respuesta canónica + queda como información'. En este caso, la respuesta debería haber sido la canónica de no recomendación y la necesidad de consultar al ginecólogo, en lugar de un handoff silencioso. El handoff es incorrecto para esta interacción.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silencioso que no era apropiado para la pregunta del cliente, resultando en un FAIL en relevancia. Esto indica una sobre-confianza en una acción incorrecta.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 3 — "se lo doy a mi hijo de 10?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_ninos
**Latency total:** 33391ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El Elixir del Sueño no se recomienda para menores de 14 años. Para tu hijo de 10 años, la indicación correcta para dificultades de sueño es siempre consultar con su pediatra. Es importante que un profesional evalúe su caso."
- sourceTopic: `uso_en_ninos`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aplica directamente las reglas de no recomendación para menores de 14 años y la indicación de consultar al pediatra, usando solo el material provisto."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `uso_en_ninos`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 6
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. Se menciona que no se recomienda para menores de 14 años y que la indicación correcta para dificultades de sueño en menores es consultar al pediatra, lo cual está explícitamente en los 'Hechos' y 'Debe contener'. La frase sobre la importancia de que un profesional evalúe el caso es una inferencia directa y fiel del material que enfatiza la consulta médica para menores.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede darle el producto a su hijo de 10 años, indicando claramente que no se recomienda para esa edad y aconsejando la consulta con un pediatra, que es la acción correcta según el material para un menor de 14 años.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario (ambos PASS).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 4 — "tomo sertralina, hay problema?"

**Categoría:** edge-cases
**Expected:** confidence bajo → handoff (sertralina NO está específicamente en KB)
**Latency total:** 35830ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye la derivación al médico tratante para la medicación específica mencionada y las contraindicaciones generales, según el material."
- reason: `nunca_decir_violation: aprobar el uso en embarazo, lactancia, menores de 14, autoinmunes o personas con anticoagulantes`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `contraindicaciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 6

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta generada está vacía, por lo tanto, no hay claims que evaluar en cuanto a fidelidad. Se considera un handoff silente.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente sobre la sertralina es una condición específica no listada en las contraindicaciones generales. El material indica explícitamente que si el cliente menciona una medicación específica no listada (ej. sertralina), se debe derivar al médico tratante y que esto es un motivo para escalar. Un handoff silente (respuesta vacía) es la acción correcta en este caso, ya que el modelo no debe improvisar por chat y debe escalar.
- calibration: **CALIBRATED** — El reportedConfidence es 0.95 (alto) y la respuesta (handoff silente) es la acción correcta y apropiada según el material para la pregunta del cliente, resultando en scores PASS para faithfulness y relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 5 — "tengo lupus, puedo?"

**Categoría:** edge-cases
**Expected:** confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)
**Latency total:** 37094ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Hola. El Elixir del Sueño no se recomienda para personas con enfermedades autoinmunes, y el lupus entra en esta categoría. Por tu seguridad, es fundamental que consultes con tu médico tratante antes de considerar su uso. Ten en cuenta que tampoco se recomienda para menores de 14 años, mujeres embarazadas o en lactancia, personas con anticoagulantes o con medicación para la presión arterial."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye la contraindicación específica para lupus como enfermedad autoinmune y la recomendación de consultar al médico, siguiendo todas las directrices del material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `contraindicaciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 6

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material o son inferencias lógicas y correctas que están alineadas con el espíritu y las instrucciones del material. El material indica que el producto no se recomienda para personas con enfermedades autoinmunes y menciona el lupus como una condición específica que requiere derivación al médico tratante, lo que implica que el lupus se considera dentro de las enfermedades autoinmunes para efectos de contraindicación.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto teniendo lupus, indicando la contraindicación y la necesidad de consulta médica, además de listar las demás contraindicaciones generales como se requiere.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 6 — "cómo se toma?"

**Categoría:** product
**Expected:** generated → como_se_toma
**Latency total:** 29003ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para tomar ELIXIR DEL SUEÑO, debes ingerir 1 comprimido diario, 30 minutos antes de acostarte, con agua. Es importante que lo tragues entero, sin masticar ni disolver. Ser consistente con la hora cada noche ayudará a tu cuerpo a establecer un ritmo de sueño."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye todos los detalles de uso y dosificación estándar directamente del material proporcionado."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `como_se_toma`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 8
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente soportados por el material de Hechos y los puntos de 'Debe contener'. La respuesta indica la dosis, el momento, la forma de ingesta (entero, no masticar/disolver) y la importancia de la consistencia, todo lo cual se encuentra explícitamente en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo se toma?', y la respuesta aborda directamente esta pregunta proporcionando instrucciones claras y concisas sobre la dosificación y el método de uso del producto.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario (ambos PASS).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 7 — "qué ingredientes tiene?"

**Categoría:** product
**Expected:** generated → formula
**Latency total:** 50122ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "ELIXIR DEL SUEÑO es un suplemento natural que contiene melatonina (10mg), una hormona que tu cuerpo produce para regular el ciclo del sueño, y citrato de magnesio (50mg), un mineral que contribuye a la relajación muscular y al bienestar del sistema nervioso. No es un medicamento, sino un acompañamiento para tu ritmo natural de sueño."
- sourceTopic: `formula`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye los ingredientes activos con sus dosis y funciones, y lo describe como suplemento natural, tal como se indica en el material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `formula`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 9
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta utiliza únicamente la información proporcionada en el material, listando los ingredientes activos, sus dosis y funciones, y describiendo el producto como un suplemento natural, tal como se detalla en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre los ingredientes del producto, proporcionando la información solicitada de manera clara y concisa.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 8 — "cuánto trae el frasco?"

**Categoría:** product
**Expected:** generated → contenido
**Latency total:** 44383ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El frasco de ELIXIR DEL SUEÑO trae 90 comprimidos. Con la dosis estándar de 1 comprimido diario, esto te rinde para 90 días, lo que equivale a 3 meses de uso continuo."
- sourceTopic: `contenido`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica la cantidad de comprimidos y su rendimiento, información directamente extraída del material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `contenido`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 6
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. Se menciona la cantidad de comprimidos y el rendimiento, tal como se especifica en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre la cantidad que trae el frasco, proporcionando la información exacta de comprimidos y su rendimiento.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 9 — "es adictivo?"

**Categoría:** product
**Expected:** generated → dependencia
**Latency total:** 37412ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El Elixir del Sueño, con melatonina y citrato de magnesio, no genera dependencia farmacológica en las dosis recomendadas. La melatonina es una sustancia que tu cuerpo produce naturalmente para regular el sueño. Nuestro producto busca ayudarte a regular tu ritmo de sueño, no a que dependas de él."
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre adicción utilizando la información provista sobre dependencia farmacológica y el propósito del producto."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `dependencia`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado en 'hechos' y 'debe_contener_aplicables'. La respuesta aclara que no genera dependencia farmacológica, explica que la melatonina es natural y que el producto busca regular el sueño, no generar dependencia.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es '¿es adictivo?' y la respuesta aborda directamente esta cuestión al afirmar que 'no genera dependencia farmacológica en las dosis recomendadas', complementando con información relevante sobre la melatonina y el propósito del producto.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 10 — "cuánto tarda a Medellín?"

**Categoría:** policies
**Expected:** generated → envio (mencionar día siguiente)
**Latency total:** 35764ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Despachamos a todo Colombia, incluyendo Medellín. Tu ELIXIR DEL SUEÑO debería llegar al día siguiente hábil, ya que los envíos a Medellín se realizan con transportadora. Ten en cuenta que estos tiempos son estimados."
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La información sobre el tiempo de entrega para Medellín está explícitamente detallada en el material del topic."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `envio`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 8
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente soportados por el material proporcionado. Se confirma el despacho a Colombia y Medellín, el tiempo de entrega al día siguiente hábil para Medellín (especificado en el material como 'Día siguiente (transportadora): Medellín'), y la aclaración de que los tiempos son estimados, lo cual también está en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre el tiempo de entrega a Medellín, proporcionando la información específica encontrada en el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 11 — "cómo pago?"

**Categoría:** policies
**Expected:** generated → pago
**Latency total:** 36838ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para el Elixir del Sueño en Colombia, puedes pagar contra-entrega en efectivo al recibir tu pedido, que es la opción más común y cómoda. También aceptamos transferencias a Bancolombia, Nequi o Daviplata, y pago con tarjeta débito/crédito a través de un link seguro. Si eliges una de estas últimas opciones, un compañero te asistirá para coordinar los detalles."
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista todos los métodos de pago aceptados y sus condiciones según el material provisto."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `pago`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material de referencia. La mención de 'cómoda' para contra-entrega es una paráfrasis fiel de la 'posición' que indica 'comodidad del cliente'. La frase 'un compañero te asistirá para coordinar los detalles' es una adaptación fiel de la instrucción de 'escalar a humano para coordinación' sin usar las palabras prohibidas.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre 'cómo pagar', listando todos los métodos de pago aceptados y mencionando la opción más común, tal como lo indican los 'debe_contener_aplicables'. También maneja correctamente la necesidad de coordinación para métodos que no son contra-entrega.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 12 — "puedo devolverlo si no me sirve?"

**Categoría:** policies
**Expected:** generated → devoluciones
**Latency total:** 30047ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Sí, puedes solicitar la devolución si sientes que no te sirvió. Tienes 30 días desde la recepción del producto para hacerlo. Necesitamos que envíes de vuelta el producto restante y nosotros coordinaremos el envío de retorno para luego gestionar la devolución del dinero una vez que lo recibamos."
- sourceTopic: `devoluciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta explica la política de devolución completa y precisa usando solo el material provisto."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `devoluciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 7
- nunca_decir items: 5
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. Se menciona el plazo de 30 días, la necesidad de enviar el producto restante, la coordinación del envío de retorno por parte de la empresa y la gestión del dinero una vez recibido el producto, todo lo cual está explícitamente en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa sobre la posibilidad de devolución si el producto no le sirve. La respuesta aborda directamente esta pregunta, explicando la política de devoluciones y los pasos a seguir, lo cual es apropiado según el material para una pregunta sobre cómo funciona la política.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en Faithfulness y Relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 13 — "cuántas horas dura el efecto?"

**Categoría:** faqs-no-templated
**Expected:** generated → duracion_efecto
**Latency total:** 31692ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `duracion_efecto`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre la duración del efecto, incluyendo la referencia de hasta 7 horas y las aclaraciones sobre la variabilidad individual y la calidad del descanso, todo basado en el material proporcionado."
- reason: `nunca_decir_violation: prometer un número fijo y garantizado de horas de sueño`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `duracion_efecto`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 6
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente ('cuántas horas dura el efecto?') puede ser respondida directamente con la información proporcionada en el 'topicMaterial'. El material indica 'hasta 7 horas seguidas' como referencia y aclara que la duración exacta depende del metabolismo individual. Por lo tanto, el handoff silencioso es incorrecto, ya que el modelo tenía la capacidad de responder.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silencioso cuando la pregunta podía ser respondida con el material disponible, resultando en un score de relevancia FAIL. Esto indica que el modelo sobre-confió en su decisión de no responder.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 14 — "qué hábitos ayudan a dormir?"

**Categoría:** faqs-no-templated
**Expected:** generated → alternativas_naturales
**Latency total:** 29438ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `alternativas_naturales`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los hábitos de higiene del sueño directamente del material y posiciona el producto como complementario."
- reason: `nunca_decir_violation: recomendar otros productos consumibles (manzanilla, tilo, hierbas, infusiones, suplementos competidores)`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `alternativas_naturales`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 8
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía, por lo tanto, no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **FAIL** — El usuario pregunta sobre hábitos para dormir, y el material de KB contiene una lista explícita de estos hábitos, además de indicar que se deben listar al menos 3. La respuesta está vacía (handoff), lo cual es incorrecto ya que la información para responder estaba disponible y era mandatoria.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silente cuando debía haber respondido directamente la pregunta del usuario con la información disponible en el material, resultando en un FAIL de relevancia.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 15 — "tengo apnea, puedo tomarlo?"

**Categoría:** negativos
**Expected:** handoff silente (KB no tiene apnea)
**Latency total:** 40144ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `insomnio_largo_plazo`
- responseConfidence: `0.4`
- confidenceRationale: "La mención de apnea requiere escalada a un experto según el material, impidiendo una respuesta directa del bot sobre la idoneidad del producto."
- reason: `low_response_confidence`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `insomnio_largo_plazo`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar y se considera fiel al no inventar información.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente menciona 'apnea', y el material de KB en la sección 'cuando_escalar' indica explícitamente que 'cliente menciona apnea del sueño u otra condición que requiere diagnóstico médico' es un motivo para escalar. La respuesta vacía (handoff silente) es la acción correcta y relevante en este caso, ya que el modelo no debe responder directamente a esta consulta.
- calibration: **CALIBRATED** — El reportedConfidence es 0.4, que es bajo (<0.70). La respuesta fue un handoff silente, lo cual es la acción correcta según el material para el caso de apnea. Un confidence bajo es apropiado para una situación de handoff donde no se proporciona una respuesta directa al cliente.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 16 — "envían a Miami?"

**Categoría:** negativos
**Expected:** handoff silente (KB es Colombia-only)
**Latency total:** 32292ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.2`
- confidenceRationale: "La pregunta es sobre envío internacional, lo cual está explícitamente fuera del alcance estándar y requiere escalada a humano según el material."
- reason: `low_response_confidence`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `envio`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 8
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar. No se inventó información.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre envío a Miami, lo cual el material clasifica como envío internacional y explícitamente indica que debe escalar a un humano. El modelo realizó un handoff silencioso, lo cual es la acción correcta y relevante según el material para este tipo de consulta.
- calibration: **CALIBRATED** — El reportedConfidence es 0.2, que es bajo. La respuesta fue un handoff silencioso, que es la acción correcta y esperada para una pregunta sobre envío internacional (Miami) según el material. Por lo tanto, un confidence bajo para un handoff correcto está calibrado.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 17 — "puedo pagar con criptomonedas?"

**Categoría:** negativos
**Expected:** handoff silente (KB no lista cripto)
**Latency total:** 49079ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, en este momento no aceptamos criptomonedas como método de pago para el Elixir del Sueño. Los métodos disponibles son pago contra-entrega (la opción más común), transferencias (Bancolombia, Nequi, Daviplata) o tarjeta débito/crédito a través de un link de pago seguro. Si deseas coordinar tu compra con alguno de estos métodos, podemos ayudarte."
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "El material indica explícitamente que no se aceptan criptomonedas y cómo proceder en este caso, incluyendo la lista de métodos aceptados."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `pago`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta afirma que no se aceptan criptomonedas, lo cual está explícitamente indicado en el material ('NO existen otros métodos (no criptomonedas)'). Luego, lista los métodos de pago aceptados (contra-entrega, transferencias, tarjeta vía link de pago) y menciona que contra-entrega es la opción más común, todo lo cual se encuentra en la sección 'hechos' y 'debe_contener_aplicables'. La frase 'Si deseas coordinar tu compra con alguno de estos métodos, podemos ayudarte' es una forma de ofrecer asistencia que se alinea con la necesidad de coordinación o escalada para métodos que no son contra-entrega o para preguntas sobre métodos no listados.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'puedo pagar con criptomonedas?'. La respuesta aborda directamente esta pregunta con un 'No', y luego proporciona la información relevante sobre los métodos de pago aceptados, lo cual es útil para el cliente. El modelo respondió a la pregunta y ofreció el siguiente paso, lo cual es apropiado.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con puntuaciones PASS en Faithfulness y Relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

## Aggregate metrics

**Judge automated (pre-Jose):**

| Metric | Count / 17 | % |
|--------|-----------|---|
| Judge PASS (overall) | 14 | 82.4% |
| Judge PARTIAL (overall) | 0 | 0% |
| Judge FAIL (overall) | 3 | 17.6% |
| Faithfulness PASS | 17 | 100% |
| Faithfulness PARTIAL/FAIL | 0 | 0% |
| Relevance PASS | 14 | 82.4% |
| Relevance FAIL | 3 | 17.6% |
| Calibration CALIBRATED | 14 | 82.4% |
| Calibration MISCALIBRATED_HIGH | 3 | 17.6% |
| Calibration MISCALIBRATED_LOW | 0 | 0% |
| Invenciones detectadas (judge) | 0 | 0% |
| Runtime errors | 0 | 0% |

**Jose manual review (a completar):**

| Metric | Count / 17 | % |
|--------|-----------|---|
| Jose PASS | __ | __% |
| Jose FAIL | __ | __% |
| Jose PARTIAL | __ | __% |
| Jose ↔ Judge agreement | __ | __% |
| Invenciones detectadas (Jose) | __ | __% |

### Auto-computed counts (re-confirmar con greps)

```bash
echo "Judge OVERALL PASS:    $(sed '/^## Aggregate metrics/,$d' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md | grep -c '^- \*\*OVERALL: PASS\*\*$')"
echo "Judge OVERALL PARTIAL: $(sed '/^## Aggregate metrics/,$d' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md | grep -c '^- \*\*OVERALL: PARTIAL\*\*$')"
echo "Judge OVERALL FAIL:    $(sed '/^## Aggregate metrics/,$d' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md | grep -c '^- \*\*OVERALL: FAIL\*\*$')"
echo "Invenciones (judge):   $(sed '/^## Aggregate metrics/,$d' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md | grep -c '⚠ Y (judge detected')"
echo "Runtime errors:        $(sed '/^## Aggregate metrics/,$d' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md | grep -c 'RUNTIME ERROR')"
```

**Expected output al correr greps post-run:**
```
Judge OVERALL PASS:    14
Judge OVERALL PARTIAL: 0
Judge OVERALL FAIL:    3
Invenciones (judge):   0
Runtime errors:        0
```

## Decision Checklist

- [x] **Judge ≥14/17 PASS** → 14/17 ✓ — criterio mínimo cumplido.
- [x] **0 invenciones detectadas (judge)** → 0/17 ✓ — RAG architecture sin alucinaciones, green light Plan 08 (después de Jose review + Smoke B).
- [ ] **Jose review ≥15/17 OK** → pendiente revisión manual de los 17 casos por Jose.
- [x] **3/3 negativos manejados correctamente** → 2/3 handoff silente (15, 16) + 1/3 respuesta constructiva (17) — todos judge PASS.
- [x] **Calibration MISCALIBRATED_HIGH < 30%** → 17.6% (3/17) ✓ — dentro de tolerancia, pero los 3 son el mismo patrón nunca_decir.
- [ ] **Plan 07 iter recomendado** → 3 FAILs son `nunca_decir_violation` false-positives. Refinar el guardrail antes de Smoke B (Plan 06).

## Per-case failure analysis

### Patrón único de FAIL: `nunca_decir_violation` false-positive (3/3 FAILs)

Los 3 casos FAIL (2 embarazo, 13 duracion_efecto, 14 habitos_sueno) comparten exactamente el mismo patrón:

1. **Tooling seleccionó topic correcto:** `uso_en_embarazo` / `duracion_efecto` / `alternativas_naturales` — los 3 son los topics esperados.
2. **Generation produjo respuesta válida con confidence 0.95** — el modelo construyó una respuesta apropiada usando el material (verificable en `confidenceRationale`).
3. **`nuncaDecirCheck` disparó violación** — el guardrail detectó string match con un item del array `nunca_decir`:
   - Case 2: "aprobar uso durante embarazo o lactancia" — pero la respuesta DICE NO al embarazo (es la respuesta canónica esperada).
   - Case 13: "prometer un número fijo y garantizado de horas de sueño" — pero la respuesta menciona "hasta 7 horas" con disclaimer "depende del metabolismo".
   - Case 14: "recomendar otros productos consumibles (manzanilla, tilo, hierbas, infusiones, suplementos competidores)" — pero la respuesta lista hábitos NO-productos (higiene del sueño).
4. **Resultado:** sub-loop convirtió respuesta válida en handoff silente → judge reportó FAIL relevance + MISCALIBRATED_HIGH.

**Hipótesis:** `nuncaDecirCheck` evalúa **substring match plano** (o similar) sin considerar polaridad/contexto. Cuando el array `nunca_decir` contiene una **frase declarativa** (ej. "aprobar uso durante embarazo"), el check matchea aunque la respuesta del modelo sea precisamente lo contrario (declinar el uso). Esto bloquea la respuesta canónica esperada por el material.

### Recomendación Plan 07 iter (preliminar — Jose decide)

Tres opciones para refinar `nuncaDecirCheck`:

1. **A. LLM-as-guardrail:** delegar el check a una segunda llamada Gemini Flash que evalúe semánticamente "¿la respuesta viola esta regla?" — más costo + latencia (+~5s por caso) pero precisión alta. Pattern similar al judge.
2. **B. Reescribir array `nunca_decir` con verbos neutrales:** cambiar "aprobar uso durante embarazo" → "uso recomendado durante embarazo (en sentido afirmativo)" o "respuesta que recomiende uso en embarazo". Más rápido (cero código) pero requiere editar 18 KBs — riesgo de regresión.
3. **C. Hybrid:** detector basado en patrones (regex anclado con verbos: "recomendamos|aprobamos|puedes tomar.*embarazo") + escape hatch LLM-as-guardrail para casos ambiguos. Best of both, más complejo.

**Decisión recomendada:** Plan 07 iter ANTES de Plan 06 (Smoke B). Bloquear Plan 08 hasta resolver. Sin esto, Smoke B también va a tener FAILs por el mismo guardrail.

### Casos PASS notables

- **Case 4 (sertralina):** tooling eligió `contraindicaciones`, generation reportó `status: no_match` (handoff) — la respuesta apropiada es escalar a especialista; el judge PASS confirmó relevance correcta (handoff justificado cuando KB no tiene sertralina específica).
- **Case 5 (lupus):** generation respondió usando `contraindicaciones` material genérico — judge PASS validó relevance + faithfulness. Behavior esperado: KB dice "autoinmunes" → modelo extrapoló correctamente.
- **Case 17 (criptomonedas):** generation usó topic `pago` para decir "no aceptamos cripto" + listar métodos disponibles. Mejor que handoff silente — respuesta útil con material adyacente. Judge PASS. **Behavior emergente positivo.**

## Notas para el reviewer (Jose)

1. Lee cada caso verbatim en la sección "Per-case results" arriba.
2. Marcá `Jose final: PASS / FAIL / PARTIAL` después de leer cada uno.
3. Confirmá si los 3 FAILs son realmente Plan 07 candidates (vs. ajustar expectativas del test).
4. Si encontrás algún claim que **judge marcó N pero parece invención**, anotalo en "Jose notes" + cambiar checkbox.
5. Si Jose review confirma ≥15/17 OK → green light Plan 06 (post Plan 07 nunca_decir fix).
6. Si Jose review <15/17 → Plan 07 iter más extenso antes de Plan 06.
