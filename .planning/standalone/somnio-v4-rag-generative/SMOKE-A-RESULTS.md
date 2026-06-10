# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-06-10T23:18:03.696Z
**HEAD git:** _(verificar con `git rev-parse HEAD` al revisar)_
**Model tooling:** gpt-4o-mini (OpenAI)
**Model generación:** gemini-2.5-flash temperature=0.3 + safety BLOCK_NONE × 4
**Model judge:** gemini-2.5-flash temperature=0.1 (separate client — D-26 anti self-enhancement bias)
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)
**Total casos:** 17

## Per-case results


### Case 1 — "puedo si tomo alcohol?"

**Categoría:** edge-cases
**Expected:** generated → interaccion_alcohol
**Latency total:** 36697ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `interaccion_alcohol`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta sigue la posición del negocio, explica el mecanismo brevemente y ofrece la recomendación para el caso de haber bebido."
- reason: `escalation_trigger_match: cliente pregunta sobre interacciones con otros depresores del SNC (benzodiacepinas, opioides)`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `interaccion_alcohol`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 7
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente es directa: 'puedo si tomo alcohol?'. El material de KB contiene una respuesta explícita y clara: 'NO recomendamos combinar el ELIXIR DEL SUEÑO con alcohol' y explica el mecanismo. El modelo realizó un handoff silencioso (respuesta vacía) en lugar de proporcionar la información disponible y relevante. El handoff no era la acción correcta para esta pregunta.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silencioso que no era apropiado, resultando en un FAIL en relevancia. Esto indica una sobre-confianza en la decisión de no responder.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

**Nota re-run (Pitfall 12 — Plan 06 gate W1):** este bloque es el RE-RUN del caso (la corrida inicial divergió del baseline o cayó en error de infra LLM). Comparación de DECISIÓN vs baseline operativo registrada en GATE-W1.md.

### Case 2 — "estoy embarazada, lo puedo tomar?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_embarazo
**Latency total:** 27000ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No recomendamos el uso del producto si estás embarazada. Todo lo que consumes puede afectar al bebé, incluso suplementos naturales. Lo importante es que valides cualquier suplemento con tu ginecólogo tratante."
- sourceTopic: `uso_en_embarazo`
- responseConfidence: `0.95`
- confidenceRationale: "El material proporciona instrucciones claras y directas sobre el uso del producto durante el embarazo, cubriendo todos los puntos requeridos."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `uso_en_embarazo`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 6
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material de referencia. Se recomienda no usar el producto durante el embarazo, se menciona que todo lo que se consume puede afectar al bebé (incluyendo suplementos naturales) y se indica que la decisión debe ser validada por el ginecólogo tratante.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto estando embarazada, proporcionando la recomendación explícita de no usarlo y la justificación, además de la indicación de consultar al ginecólogo.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en Faithfulness y Relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 3 — "se lo doy a mi hijo de 10?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_ninos
**Latency total:** 30208ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `uso_en_ninos`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aplica directamente las reglas de no recomendación para menores de 14 años y la derivación al pediatra, tal como se indica en el material."
- reason: `escalation_trigger_match: cliente quiere comprar para un menor de 14 años`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `uso_en_ninos`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 6
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente es directa: 'se lo doy a mi hijo de 10?'. El material de KB contiene la información necesaria para responder canónicamente que el producto no se recomienda para menores de 14 años y que se debe consultar al pediatra. Un handoff silencioso no aborda directamente la pregunta con la información disponible, cuando una respuesta informativa era posible y esperada antes de considerar una escalada por 'insistencia'.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta (handoff) fue incorrecta en términos de relevancia, ya que el material permitía una respuesta directa y canónica. El modelo sobre-confió en la decisión de hacer handoff.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 4 — "tomo sertralina, hay problema?"

**Categoría:** edge-cases
**Expected:** confidence bajo → handoff (sertralina NO está específicamente en KB)
**Latency total:** 39281ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si tomas sertralina, valida el uso del producto con tu médico tratante. Las categorías generales son una referencia. Cualquier medicación recetada activa necesita siempre la aprobación de un profesional."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta deriva al médico tratante para una medicación específica no listada, siguiendo las directrices del material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `contraindicaciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 7
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims de la respuesta están directamente soportados por el material. La mención de validar con el médico tratante para sertralina está en 'posicion' y 'debe_contener_aplicables'. La referencia a las categorías generales y la necesidad de aprobación para cualquier medicación recetada activa también se encuentran en 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre el uso del producto con sertralina, recomendando la consulta médica como indica el material para casos de medicación específica no listada.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

**Nota re-run (Pitfall 12 — Plan 06 gate W1):** este bloque es el RE-RUN del caso (la corrida inicial divergió del baseline o cayó en error de infra LLM). Comparación de DECISIÓN vs baseline operativo registrada en GATE-W1.md.

### Case 5 — "tengo lupus, puedo?"

**Categoría:** edge-cases
**Expected:** confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)
**Latency total:** 32158ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El producto no se recomienda si tienes enfermedades autoinmunes, como el lupus. La melatonina puede modular tu respuesta inmune. Lo mejor es que valides su uso con tu médico tratante."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta sigue las indicaciones de tono, longitud y deriva al médico tratante para una condición autoinmune mencionada explícitamente en el material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `contraindicaciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 7
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta indica que el producto no se recomienda para enfermedades autoinmunes como el lupus, citando que la melatonina puede modular la respuesta inmune, y recomienda consultar al médico tratante. Toda esta información está explícitamente en el material de referencia bajo 'hechos' y 'posicion', y sigue las directrices de 'debe_contener_aplicables' para condiciones específicas.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa sobre si puede usar el producto teniendo lupus. La respuesta aborda directamente esta condición, indicando la contraindicación y la necesidad de validación médica, lo cual es la acción correcta según el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de excelente calidad, con scores PASS en faithfulness y relevance. Esto indica una calibración adecuada.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 6 — "cómo se toma?"

**Categoría:** product
**Expected:** generated → como_se_toma
**Latency total:** 29481ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Debes tomar un comprimido diario, 30 minutos antes de acostarte. Trágalo entero con agua; no lo mastiques ni disuelvas. La idea es ser consistente con la hora cada noche. Así tu cuerpo se acostumbra al ritmo del sueño."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye la dosis, el momento, el método de ingesta y la importancia de la consistencia, todo directamente del material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `como_se_toma`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 9
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica la dosis, el momento, la forma de ingesta y la importancia de la consistencia, todo lo cual está explícitamente en la sección 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo se toma?', y la respuesta aborda directamente esta cuestión proporcionando instrucciones claras y completas sobre la forma de uso del producto.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario (ambos PASS).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 7 — "qué ingredientes tiene?"

**Categoría:** product
**Expected:** generated → formula
**Latency total:** 28347ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El producto contiene melatonina 10mg, que ayuda a regular tu ciclo de sueño, y citrato de magnesio 50mg, que contribuye a la relajación muscular y bienestar nervioso. Es un suplemento natural, no un medicamento."
- sourceTopic: `formula`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los dos ingredientes activos con sus dosis y funciones, y describe el producto como suplemento natural, siguiendo el material."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material de referencia. La descripción de las funciones de la melatonina y el magnesio, así como la clasificación del producto como suplemento natural, están explícitamente en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre los ingredientes del producto, listándolos con sus dosis y funciones, tal como lo requiere el material en 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 8 — "cuánto trae el frasco?"

**Categoría:** product
**Expected:** generated → contenido
**Latency total:** 23345ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El frasco trae 90 comprimidos sólidos. Con la dosis estándar de 1 comprimido diario, esto te rinde para 90 días, o sea, 3 meses de uso continuo. Es la única presentación disponible."
- sourceTopic: `contenido`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica la cantidad de comprimidos y el rendimiento del frasco, tal como se especifica en el material."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material. Se menciona la cantidad de 90 comprimidos, el rendimiento de 90 días/3 meses con dosis estándar, y que es la única presentación, todo lo cual está explícitamente en las secciones 'Hechos' y 'Posición'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cuánto trae el frasco?'. La respuesta aborda directamente esta pregunta indicando la cantidad de comprimidos y, de manera muy relevante, cuánto rinde ese frasco, lo cual es información clave asociada a la cantidad.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario (ambos PASS).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 9 — "es adictivo?"

**Categoría:** product
**Expected:** generated → dependencia
**Latency total:** 30017ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, el producto no genera dependencia farmacológica en las dosis recomendadas. La melatonina es una sustancia que tu cuerpo produce naturalmente. La idea es regular tu ritmo de sueño, no que dependas de esto. Después de unas 4 semanas, tu ciclo se regula."
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre adicción, explicando la ausencia de dependencia farmacológica y el rol regulador del producto, usando información del material."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material proporcionado. La respuesta parafrasea fielmente la información sobre la no dependencia farmacológica, la naturaleza de la melatonina, el propósito del producto y el tiempo de regulación del ciclo de sueño.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa sobre si el producto es adictivo. La respuesta aborda directamente esta pregunta, negando la dependencia farmacológica y explicando los motivos con información relevante del material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 10 — "cuánto tarda a Medellín?"

**Categoría:** policies
**Expected:** generated → envio (mencionar día siguiente)
**Latency total:** 44471ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La ciudad de Medellín está explícitamente listada en el material con su tiempo de entrega."
- reason: `nunca_decir_violation: La entrega del producto se realiza en una fecha exacta garantizada fuera del servicio mismo-día.`
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
- faithfulness: **PASS** — La respuesta está vacía, por lo que no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **FAIL** — El usuario pregunta por el tiempo de envío a Medellín. El material de KB indica claramente que para Medellín el envío es 'Día siguiente (transportadora)'. El modelo debería haber respondido con esta información, pero en su lugar emitió una respuesta vacía (handoff silencioso), fallando en abordar la pregunta directamente cuando la información estaba disponible y era pertinente.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silencioso que resultó en un FAIL de relevancia, ya que la información para responder estaba explícitamente en el material y no se utilizó.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

**Nota re-run (Pitfall 12 — Plan 06 gate W1):** este bloque es el RE-RUN del caso (la corrida inicial divergió del baseline o cayó en error de infra LLM). Comparación de DECISIÓN vs baseline operativo registrada en GATE-W1.md.

### Case 11 — "cómo pago?"

**Categoría:** policies
**Expected:** generated → pago
**Latency total:** 46392ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista todos los métodos de pago aceptados y menciona la opción más común, siguiendo el material."
- reason: `escalation_trigger_match: cliente pide pagar con transferencia (Bancolombia, Nequi, Daviplata) \u2014 requiere coordinaci
`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `pago`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente es general ("cómo pago?"). Según el material, el bot DEBE SIEMPRE listar los 3 grupos de métodos de pago (contra-entrega, transferencias, tarjeta vía link de pago). El handoff silente no cumple con esta instrucción y no responde directamente a la pregunta inicial del cliente.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silente que no era apropiado, resultando en un FAIL en relevancia. Esto indica una sobre-confianza.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

**Nota re-run (Pitfall 12 — Plan 06 gate W1):** este bloque es el RE-RUN del caso (la corrida inicial divergió del baseline o cayó en error de infra LLM). Comparación de DECISIÓN vs baseline operativo registrada en GATE-W1.md.

### Case 12 — "puedo devolverlo si no me sirve?"

**Categoría:** policies
**Expected:** generated → devoluciones
**Latency total:** 11420ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `null`
- responseConfidence: `null`
- confidenceRationale: (null)
- reason: `no_relevant_hit`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `(no topic selected)`
- hechos: — null
- posicion: — null
- debe_contener items: 0
- nunca_decir items: 0
- cuando_escalar items: 0

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía, por lo tanto, no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente sobre devoluciones es una consulta sobre política comercial que no suele estar cubierta en el material de conocimiento sobre el producto (melatonina + magnesio). Dado que el 'topicMaterial' es nulo y la 'generatedResponse' está vacía, el sistema realizó un handoff silencioso. Esto es apropiado, ya que la pregunta está fuera del alcance del material proporcionado, y el handoff es la respuesta correcta en este caso.
- calibration: **CALIBRATED** — El reportedConfidence es 0.0, lo cual es bajo. La respuesta fue un handoff silencioso, que es la acción correcta para una pregunta fuera de alcance. Por lo tanto, el modelo está calibrado al reportar baja confianza para una pregunta que no puede responder directamente con el material disponible.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 13 — "cuántas horas dura el efecto?"

**Categoría:** faqs-no-templated
**Expected:** generated → duracion_efecto
**Latency total:** 33094ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El producto favorece un descanso de calidad, sin la 'resaca' de otros sedantes. Muchos clientes reportan dormir hasta 7 horas seguidas. La duración exacta varía en cada persona, según tu metabolismo y hábitos. La consistencia es clave."
- sourceTopic: `duracion_efecto`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la duración del efecto, incluyendo la referencia de hasta 7 horas y la variabilidad individual, además de los puntos 'SIEMPRE' requeridos, todo dentro de las restricciones de tono y longitud."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `duracion_efecto`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 6
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente soportados por el material proporcionado. La respuesta menciona el descanso de calidad sin resaca, las hasta 7 horas seguidas reportadas por clientes, y que la duración exacta varía según el metabolismo y hábitos individuales, y la consistencia es clave. Todo esto se encuentra explícitamente en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cuántas horas dura el efecto?'. La respuesta aborda directamente esta pregunta al mencionar que 'Muchos clientes reportan dormir hasta 7 horas seguidas' y aclarando que 'La duración exacta varía en cada persona, según tu metabolismo y hábitos. La consistencia es clave.', lo cual sigue las instrucciones de 'debe_contener_aplicables' para esta pregunta específica.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de PASS tanto en faithfulness como en relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 14 — "qué hábitos ayudan a dormir?"

**Categoría:** faqs-no-templated
**Expected:** generated → alternativas_naturales
**Latency total:** 36462ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Evitar pantallas 30 minutos antes de dormir, mantener una hora fija para acostarte y cenar liviano son hábitos que ayudan mucho. El producto acompaña estos hábitos cuando necesitas un empujón extra, no los reemplaza."
- sourceTopic: `alternativas_naturales`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los hábitos de higiene del sueño y posiciona el producto como complementario, según el material."
- reason: `rag_generated`
- requiresHuman: `false`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `alternativas_naturales`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 8
- cuando_escalar items: 3

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — Todos los hábitos mencionados en la respuesta (evitar pantallas, hora fija para dormir, cenas livianas) provienen directamente de la sección 'hechos' del material. La afirmación sobre el producto como complemento y no reemplazo también está explícitamente en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'qué hábitos ayudan a dormir?', y la respuesta aborda directamente esta pregunta listando tres hábitos relevantes. Además, cumple con la instrucción de posicionar el producto como complementario, lo cual es aplicable a este tipo de pregunta general.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que tanto la fidelidad como la relevancia de la respuesta son 'PASS'.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 15 — "tengo apnea, puedo tomarlo?"

**Categoría:** negativos
**Expected:** handoff silente (KB no tiene apnea)
**Latency total:** 52307ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta deriva al médico por condición preexistente y detalla la dosis estándar según el material."
- reason: `escalation_trigger_match: cliente con condici f3n m e9dica preexistente pregunta por dosis espec edfica`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `como_se_toma`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 5
- nunca_decir items: 9
- cuando_escalar items: 4

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **PASS** — El usuario pregunta si puede tomar el producto teniendo apnea, una condición médica preexistente. El material de KB indica claramente que si el cliente reporta una condición médica preexistente, se debe derivar a su médico antes de iniciar. Un handoff silencioso es la respuesta correcta en este caso, ya que el modelo no debe dar consejo médico y la pregunta requiere una consulta profesional.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la acción tomada (handoff silencioso) fue la correcta y apropiada según el material de KB para la pregunta del usuario. Tanto faithfulness como relevance son PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 16 — "envían a Miami?"

**Categoría:** negativos
**Expected:** handoff silente (KB es Colombia-only)
**Latency total:** 42734ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta confirma la falta de cobertura internacional y el alcance limitado a Colombia, tal como se indica en el material."
- reason: `escalation_trigger_match: cliente pide envío internacional (Miami, Madrid, México, EEUU, Europa, etc.)`
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre un envío internacional a Miami, lo cual, según el material, debe ser escalado a un humano. El modelo realizó un handoff silente, que es la acción correcta en este escenario.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la acción tomada (handoff silente) fue la correcta y apropiada según el material para una pregunta sobre envío internacional.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 17 — "puedo pagar con criptomonedas?"

**Categoría:** negativos
**Expected:** handoff silente (KB no lista cripto)
**Latency total:** 25802ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta niega el método no aceptado y lista todos los métodos de pago válidos según el material, cumpliendo con la longitud y el tono."
- reason: `escalation_trigger_match: cliente pide pagar con criptomonedas, Bitcoin, PayPal o método no listado`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `pago`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 6
- nunca_decir items: 7
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre pagar con criptomonedas. El material de KB indica explícitamente que las criptomonedas NO son un método de pago aceptado y que, si el cliente pregunta por ellas, se debe escalar a un humano. La respuesta generada fue un handoff silente, lo cual es la acción correcta y relevante según las instrucciones del material ('cuando_escalar').
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95). La respuesta (handoff) fue la acción correcta y apropiada según las reglas del KB para la pregunta del usuario, lo que resulta en scores de Faithfulness PASS y Relevance PASS. Por lo tanto, la confianza alta está bien calibrada con una 'respuesta buena' en términos de adherencia a las instrucciones.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

## Aggregate metrics

_(rellenado por scripts ad-hoc post-run o manualmente al revisar Jose)_

| Metric | Count / 17 | % |
|--------|-----------|---|
| Jose PASS | __ | __% |
| Jose FAIL | __ | __% |
| Judge PASS (overall) | __ | __% |
| Judge PARTIAL (overall) | __ | __% |
| Judge FAIL (overall) | __ | __% |
| Jose ↔ Judge agreement | __ | __% |
| Invenciones detectadas (judge) | __ | __% |
| Invenciones detectadas (Jose) | __ | __% |
| Confidence calibration MISCALIBRATED_HIGH | __ | __% |
| Confidence calibration MISCALIBRATED_LOW | __ | __% |

### Auto-computed counts (judge only)

Run estos greps después del test:

```bash
echo "Judge OVERALL PASS:    $(grep -c 'OVERALL: PASS' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Judge OVERALL PARTIAL: $(grep -c 'OVERALL: PARTIAL' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Judge OVERALL FAIL:    $(grep -c 'OVERALL: FAIL' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Invenciones (judge):   $(grep -c 'Y (judge detected' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
echo "Runtime errors:        $(grep -c 'RUNTIME ERROR' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md)"
```

## Decision

- [ ] ≥15/17 Jose PASS → green light Smoke B (Plan 06)
- [ ] 0 invenciones detectadas (Jose review manual) → green light Plan 08 (después de Smoke B PASS)
- [ ] ≥1 invención → BLOQUEAR Plan 08, abrir Plan 07 con `checkSourceGrounding` (RESEARCH A2)
- [ ] 3/3 negativos (apnea, Miami, cripto) disparan handoff silente correctamente

## Per-case failure analysis

_(completar si hay FAILs del judge o de Jose — describir patrón observado)_
