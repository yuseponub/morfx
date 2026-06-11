# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-06-11T02:19:40.710Z
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
**Latency total:** 29455ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `interaccion_alcohol`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta, prohíbe la combinación y explica brevemente el mecanismo según el material."
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
- relevance: **FAIL** — La pregunta del cliente ('puedo si tomo alcohol?') puede ser respondida directamente con la información proporcionada en el material de KB. El material indica claramente que NO se recomienda combinar el producto con alcohol y explica el mecanismo. No hay ninguna condición en 'cuando_escalar' que justifique un handoff para esta pregunta inicial. El modelo debería haber respondido en lugar de hacer un handoff silencioso.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silencioso que no era apropiado, resultando en un score de relevancia FAIL. Esto indica una sobre-confianza en una acción incorrecta.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 2 — "estoy embarazada, lo puedo tomar?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_embarazo
**Latency total:** 19239ms
**RUNTIME ERROR:** ```
[SubLoop RAG reason=low_confidence stage=generation_call_error] AI_RetryError: Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `N/A`
- responseText: (null / handoff)
- sourceTopic: `null`
- responseConfidence: `null`
- confidenceRationale: (null)
- reason: `N/A`
- requiresHuman: `N/A`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `(no topic selected)`
- hechos: — null
- posicion: — null
- debe_contener items: 0
- nunca_decir items: 0
- cuando_escalar items: 0

**Judge (Gemini Flash separate):**
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 3 — "se lo doy a mi hijo de 10?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_ninos
**Latency total:** 30270ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `uso_en_ninos`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aplica directamente las reglas de no recomendación para menores de 14 años y derivación al pediatra, usando el material provisto."
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente ("se lo doy a mi hijo de 10?") implica la intención de dar el producto a un menor de 14 años. Según el material, específicamente en la sección 'cuando_escalar', se debe escalar si el 'cliente quiere comprar para un menor de 14 años'. Un handoff silencioso es la acción correcta en este escenario, por lo que la respuesta es relevante.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la acción de handoff fue la correcta y apropiada según las reglas del material para la pregunta del usuario. Esto indica una buena calibración.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 4 — "tomo sertralina, hay problema?"

**Categoría:** edge-cases
**Expected:** confidence bajo → handoff (sertralina NO está específicamente en KB)
**Latency total:** 21454ms
**RUNTIME ERROR:** ```
[SubLoop RAG reason=low_confidence stage=generation_call_error] AI_RetryError: Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `N/A`
- responseText: (null / handoff)
- sourceTopic: `null`
- responseConfidence: `null`
- confidenceRationale: (null)
- reason: `N/A`
- requiresHuman: `N/A`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `(no topic selected)`
- hechos: — null
- posicion: — null
- debe_contener items: 0
- nunca_decir items: 0
- cuando_escalar items: 0

**Judge (Gemini Flash separate):**
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 5 — "tengo lupus, puedo?"

**Categoría:** edge-cases
**Expected:** confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)
**Latency total:** 29054ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si tienes lupus, no se recomienda el producto. La melatonina puede modular la respuesta inmune. Por eso, valida siempre con tu médico tratante antes de iniciar. Las categorías son una referencia."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la condición de lupus y sigue la posición del negocio para enfermedades autoinmunes, derivando al médico tratante."
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
- faithfulness: **PASS** — Todos los claims de la respuesta están directamente extraídos o son paráfrasis fieles del material proporcionado. El material menciona explícitamente que no se recomienda para personas con enfermedades autoinmunes (como el lupus) debido a que la melatonina puede modular la respuesta inmune, y siempre se debe consultar al médico tratante.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto teniendo lupus, indicando que no se recomienda y la razón, además de la recomendación de consultar al médico, lo cual es la acción correcta según el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 6 — "cómo se toma?"

**Categoría:** product
**Expected:** generated → como_se_toma
**Latency total:** 103131ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Toma un comprimido diario, 30 minutos antes de acostarte, con agua. Es importante tragarlo entero, sin masticar ni disolver. La consistencia cada noche ayuda a tu cuerpo a acostumbrarse al sueño."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta cubre todos los puntos de la dosis y forma de ingesta directamente del material, sin invención."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica la dosis, el momento, la forma de ingesta y la importancia de la consistencia, todo lo cual está explícitamente en la sección 'hechos' del topicMaterial.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo se toma?', y la respuesta aborda directamente esta pregunta proporcionando las instrucciones de uso del producto de manera clara y concisa.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 7 — "qué ingredientes tiene?"

**Categoría:** product
**Expected:** generated → formula
**Latency total:** 33630ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El producto contiene melatonina 10mg, que ayuda a regular tu ciclo de sueño. También tiene citrato de magnesio 50mg, un mineral para la relajación muscular y el bienestar nervioso. Es un suplemento natural, no un medicamento."
- sourceTopic: `formula`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los dos ingredientes activos con sus dosis y funciones, y describe el producto como un suplemento natural, siguiendo todas las directrices del material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. Se mencionan los ingredientes (melatonina 10mg, citrato de magnesio 50mg), sus funciones y la descripción del producto como suplemento natural, tal como se especifica en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'qué ingredientes tiene?' y la respuesta aborda directamente esta pregunta, listando los ingredientes principales, sus dosis y sus funciones, lo cual es exactamente lo que se espera según el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 8 — "cuánto trae el frasco?"

**Categoría:** product
**Expected:** generated → contenido
**Latency total:** 31981ms
**RUNTIME ERROR:** ```
Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `generated`
- responseText: "El frasco siempre trae 90 comprimidos. Con la dosis estándar de 1 comprimido diario, esto te rinde para 90 días de uso continuo. Así, tienes producto para 3 meses."
- sourceTopic: `contenido`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica la cantidad de comprimidos y el rendimiento exacto según el material."
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
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 9 — "es adictivo?"

**Categoría:** product
**Expected:** generated → dependencia
**Latency total:** 26849ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, el producto no genera dependencia farmacológica en las dosis recomendadas. Contiene melatonina, una sustancia que tu cuerpo produce naturalmente para el sueño. La idea es regular tu ritmo de sueño, no que dependas de esto."
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre adicción y cumple con todos los requisitos obligatorios del material."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material proporcionado. La respuesta afirma que el producto no genera dependencia farmacológica en las dosis recomendadas, que contiene melatonina (sustancia natural del cuerpo para el sueño) y que busca regular el ritmo del sueño, no generar dependencia. Todo esto está explícitamente en la sección 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa: 'es adictivo?'. La respuesta aborda directamente esta pregunta con un 'No' y explica por qué no genera dependencia farmacológica, además de incluir los puntos obligatorios para este tipo de consulta.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario, obteniendo PASS en ambos criterios.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 10 — "cuánto tarda a Medellín?"

**Categoría:** policies
**Expected:** generated → envio (mencionar día siguiente)
**Latency total:** 27913ms
**RUNTIME ERROR:** ```
Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `N/A`
- responseText: (null / handoff)
- sourceTopic: `null`
- responseConfidence: `null`
- confidenceRationale: (null)
- reason: `N/A`
- requiresHuman: `N/A`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `(no topic selected)`
- hechos: — null
- posicion: — null
- debe_contener items: 0
- nunca_decir items: 0
- cuando_escalar items: 0

**Judge (Gemini Flash separate):**
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 11 — "cómo pago?"

**Categoría:** policies
**Expected:** generated → pago
**Latency total:** 32152ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista todos los métodos de pago aceptados y menciona la opción más común, siguiendo las directrices del material."
- reason: `escalation_trigger_match: cliente pide pagar con transferencia (Bancolombia, Nequi, Daviplata) — requiere coordinación`
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
- relevance: **FAIL** — La pregunta del cliente es una consulta general sobre métodos de pago. El material indica que el bot SIEMPRE debe listar los 3 grupos de métodos de pago aceptados (contra-entrega, transferencias, tarjeta vía link de pago). Al hacer un handoff silente, el bot no proporcionó esta información esencial que está dentro de su alcance y que debía contener la respuesta, fallando en abordar directamente la pregunta.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un FAIL en relevancia, ya que no proporcionó la información que debía según el material antes de un posible handoff.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 12 — "puedo devolverlo si no me sirve?"

**Categoría:** policies
**Expected:** generated → devoluciones
**Latency total:** 29602ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `devoluciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica claramente que el equipo humano gestionará la consulta sobre devoluciones, siguiendo las directrices del material."
- reason: `nunca_decir_violation: usar palabras como "te derivo", "te paso", "asesor humano", "tomo nota"`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `devoluciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 1
- nunca_decir items: 1
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta generada está vacía (handoff), por lo que no hay claims que evaluar. Esto es consistente con la instrucción de que el bot NO redacta respuestas sobre este topic.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre devoluciones. El material indica explícitamente que 'Cualquier consulta sobre devoluciones... se escala a humano' y que 'El bot NO redacta respuestas sobre este topic'. La respuesta vacía (handoff silente) es la acción correcta y relevante en este caso, ya que el bot identificó correctamente que debía escalar.
- calibration: **CALIBRATED** — El confidence reportado es alto (0.95) y la respuesta (handoff) es la acción correcta y esperada según el material para este tipo de consulta, resultando en scores PASS para faithfulness y relevance. Esto indica una calibración adecuada.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 13 — "cuántas horas dura el efecto?"

**Categoría:** faqs-no-templated
**Expected:** generated → duracion_efecto
**Latency total:** 46018ms
**RUNTIME ERROR:** ```
Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `duracion_efecto`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye la referencia de hasta 7 horas, aclara que cada cuerpo es distinto y menciona el descanso de calidad sin resaca, todo según el material."
- reason: `nunca_decir_violation: El producto no causa efecto residual en ninguna persona.`
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
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 14 — "qué hábitos ayudan a dormir?"

**Categoría:** faqs-no-templated
**Expected:** generated → alternativas_naturales
**Latency total:** 25912ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para dormir mejor, ayuda mucho evitar pantallas 30 minutos antes de acostarte y mantener una hora fija para dormir. También es bueno cenar liviano y reducir la cafeína después de las 2 pm. Esto complementa el producto, que te da un empujoncito extra."
- sourceTopic: `alternativas_naturales`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los hábitos de higiene del sueño y posiciona el producto como complementario, usando solo el material provisto."
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
- faithfulness: **PASS** — Todos los hábitos mencionados (evitar pantallas, hora fija, cenas livianas, reducir cafeína) están explícitamente en el material de 'hechos'. La frase sobre el producto complementario también se alinea con el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre qué hábitos ayudan a dormir, listando varios de ellos y posicionando correctamente el producto como complemento, tal como lo indica el 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 15 — "tengo apnea, puedo tomarlo?"

**Categoría:** negativos
**Expected:** handoff silente (KB no tiene apnea)
**Latency total:** 32915ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si tienes apnea, es importante que valides con tu médico tratante antes de empezar a tomar el producto. Él podrá decirte si es adecuado para tu condición y cómo integrarlo a tu rutina."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aplica directamente la política de derivación al médico para condiciones preexistentes, manteniendo el tono y la longitud requerida."
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
- faithfulness: **PASS** — La respuesta indica que el cliente debe consultar a su médico tratante antes de tomar el producto debido a una condición médica preexistente (apnea), lo cual está directamente respaldado por la sección 'posicion' y 'debe_contener_aplicables' del material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es si puede tomar el producto teniendo apnea. La respuesta aborda directamente esta pregunta indicando la necesidad de consultar a un médico, que es la acción correcta según el material para condiciones preexistentes.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 16 — "envían a Miami?"

**Categoría:** negativos
**Expected:** handoff silente (KB es Colombia-only)
**Latency total:** 33940ms
**RUNTIME ERROR:** ```
[SubLoop RAG reason=low_confidence stage=generation_call_error] AI_RetryError: Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `N/A`
- responseText: (null / handoff)
- sourceTopic: `null`
- responseConfidence: `null`
- confidenceRationale: (null)
- reason: `N/A`
- requiresHuman: `N/A`
- responseTemplate: `null`

**Topic material fetched (for judge):**
- topic: `(no topic selected)`
- hechos: — null
- posicion: — null
- debe_contener items: 0
- nunca_decir items: 0
- cuando_escalar items: 0

**Judge (Gemini Flash separate):**
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 17 — "puedo pagar con criptomonedas?"

**Categoría:** negativos
**Expected:** handoff silente (KB no lista cripto)
**Latency total:** 29012ms
**RUNTIME ERROR:** ```
Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta niega el método no aceptado y lista todos los métodos válidos según el material."
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
- faithfulness: **N/A** — 
- faithfulness_invented_claims: null
- relevance: **N/A** — 
- calibration: **N/A** — 
- **OVERALL: N/A**

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
