# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-06-05T06:05:25.919Z
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
**Latency total:** 38482ms
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

### Case 2 — "estoy embarazada, lo puedo tomar?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_embarazo
**Latency total:** 43852ms
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

### Case 3 — "se lo doy a mi hijo de 10?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_ninos
**Latency total:** 28307ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `uso_en_ninos`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aplica directamente las restricciones de edad y la recomendación de consultar al pediatra para menores de 14 años."
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar en cuanto a su fidelidad al material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente ("se lo doy a mi hijo de 10?") implica una intención de usar el producto para un menor de 14 años. Según el material de `cuando_escalar`, esta situación ("cliente quiere comprar para un menor de 14 años") es un motivo de escalada a humano. Por lo tanto, el handoff silencioso es la respuesta correcta y relevante en este contexto.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta (handoff) fue correcta y relevante según el material, cumpliendo con los criterios de PASS en faithfulness y relevance.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 4 — "tomo sertralina, hay problema?"

**Categoría:** edge-cases
**Expected:** confidence bajo → handoff (sertralina NO está específicamente en KB)
**Latency total:** 32888ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si tomas sertralina, lo mejor es que valides con tu médico tratante antes de usar el producto. Cualquier medicación recetada activa requiere esa validación profesional. No podemos aprobar combinaciones específicas por chat."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "El material menciona explícitamente la sertralina como ejemplo de medicación específica que requiere validación médica."
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
- faithfulness: **PASS** — La respuesta indica que se debe validar con el médico tratante antes de usar el producto si se toma sertralina, que cualquier medicación recetada activa requiere validación profesional y que no se pueden aprobar combinaciones específicas por chat. Todo esto está directamente soportado por el material en las secciones de 'hechos', 'posicion' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es específica sobre la sertralina y la respuesta aborda directamente esta preocupación, indicando la necesidad de consultar al médico y la imposibilidad de aprobar la combinación por chat, que es la acción correcta según el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración adecuada.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 5 — "tengo lupus, puedo?"

**Categoría:** edge-cases
**Expected:** confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)
**Latency total:** 23606ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No se recomienda si tienes enfermedades autoinmunes, como el lupus. La melatonina puede modular la respuesta inmune. Lo mejor es validarlo con tu médico tratante antes de iniciar el producto."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la condición específica del cliente (lupus) relacionándola con la contraindicación general (autoinmunes) y deriva al médico tratante, todo según el material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material. El material indica que no se recomienda para personas con enfermedades autoinmunes (como el lupus) debido a que la melatonina puede modular la respuesta inmune, y siempre se debe consultar al médico tratante.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto teniendo lupus, indicando la contraindicación y la necesidad de consulta médica.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 6 — "cómo se toma?"

**Categoría:** product
**Expected:** generated → como_se_toma
**Latency total:** 26654ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Debes tomar un comprimido diario, 30 minutos antes de acostarte, con agua. Es importante que lo tragues entero, sin masticar ni disolver. La idea es ser consistente con la hora cada noche para que tu cuerpo se acostumbre."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye todos los puntos requeridos sobre la forma de tomar el producto, directamente del material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica la dosis, el momento, la forma de ingesta (entero, no masticar/disolver) y la importancia de la consistencia, todo lo cual está explícitamente en la sección 'hechos' del topicMaterial.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo se toma?', y la respuesta aborda directamente esta pregunta proporcionando las instrucciones de uso del producto de manera clara y concisa, cubriendo todos los puntos relevantes del material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario (ambos PASS).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 7 — "qué ingredientes tiene?"

**Categoría:** product
**Expected:** generated → formula
**Latency total:** 32653ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El producto contiene melatonina 10mg, que ayuda a regular tu ciclo de sueño. También tiene citrato de magnesio 50mg, para la relajación muscular y el bienestar nervioso. Es un suplemento natural, no un medicamento."
- sourceTopic: `formula`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los ingredientes activos con sus dosis y funciones, y describe el producto como suplemento natural, todo directamente del material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. Se mencionan los ingredientes (melatonina 10mg, citrato de magnesio 50mg), sus funciones y la descripción del producto como suplemento natural, tal como se detalla en la sección 'hechos'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'qué ingredientes tiene?'. La respuesta aborda directamente esta pregunta listando los dos ingredientes activos con sus dosis y funciones, y añade la descripción de suplemento natural, cumpliendo con los requisitos de 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 8 — "cuánto trae el frasco?"

**Categoría:** product
**Expected:** generated → contenido
**Latency total:** 24869ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El frasco trae 90 comprimidos. Con la dosis estándar de uno diario, te rinde para 90 días de uso continuo. Esto equivale a tres meses completos. La presentación es única y está pensada para que tengas continuidad."
- sourceTopic: `contenido`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye la cantidad de comprimidos y el rendimiento, tal como se especifica en el material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica que el frasco trae 90 comprimidos, rinde 90 días con dosis estándar (1 diario), lo que equivale a 3 meses, y que la presentación es única para continuidad. Todo esto está explícitamente en 'hechos', 'posicion' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cuánto trae el frasco?', y la respuesta aborda directamente esta pregunta, proporcionando la cantidad de comprimidos y su rendimiento en días y meses, lo cual es la información clave solicitada.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 9 — "es adictivo?"

**Categoría:** product
**Expected:** generated → dependencia
**Latency total:** 30577ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, el producto no genera dependencia farmacológica en las dosis recomendadas. La melatonina es una sustancia que tu cuerpo produce naturalmente. La idea es regular tu ritmo de sueño, no que dependas de esto."
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre adicción usando el material provisto sobre dependencia farmacológica y el rol de la melatonina."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta afirma que el producto no genera dependencia farmacológica en dosis recomendadas, que la melatonina es natural y que el producto busca regular el sueño, no generar dependencia, lo cual está explícitamente en la sección 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'es adictivo?'. La respuesta aborda directamente esta pregunta negando la adicción (dependencia farmacológica) y proporcionando el contexto relevante del producto, lo cual es una respuesta completa y directa.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 10 — "cuánto tarda a Medellín?"

**Categoría:** policies
**Expected:** generated → envio (mencionar día siguiente)
**Latency total:** 31599ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La información sobre el tiempo de entrega para Medellín está explícitamente detallada en el material."
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
- faithfulness: **PASS** — La respuesta generada está vacía (handoff), por lo tanto, no hay claims que evaluar en cuanto a fidelidad al material.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente ('cuánto tarda a Medellín?') podía ser respondida directamente con la información del 'topicMaterial', que indica claramente 'Día siguiente (transportadora): Medellín'. El modelo realizó un handoff silente en lugar de proporcionar la respuesta, lo cual es incorrecto dado que la información estaba disponible y era pertinente.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff silente cuando la pregunta podía ser respondida directamente con la información disponible en el material. Esto indica una sobre-confianza en una acción incorrecta (handoff en lugar de respuesta).
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 11 — "cómo pago?"

**Categoría:** policies
**Expected:** generated → pago
**Latency total:** 41308ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Puedes pagar contra-entrega en efectivo, que es lo más común. También aceptamos transferencias a Bancolombia, Nequi o Daviplata. Otra opción es con tarjeta débito o crédito, usando un link de pago seguro. Lo importante es que elijas lo que te sea más cómodo."
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista todos los métodos de pago aceptados y menciona la opción más común, siguiendo las directrices del material."
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
- faithfulness: **PASS** — La respuesta lista los métodos de pago (contra-entrega, transferencias a Bancolombia, Nequi, Daviplata, tarjeta débito/crédito vía link de pago) y menciona que contra-entrega es lo más común, todo lo cual está explícitamente en el material. La frase final 'Lo importante es que elijas lo que te sea más cómodo' es una adición menor y no inventa información factual.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo pago?' y la respuesta aborda directamente esta pregunta listando todos los métodos de pago disponibles, tal como lo indica el material en 'Debe contener aplicables' [SIEMPRE] Listar los 3 grupos de métodos.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de buena calidad, con scores de Faithfulness y Relevance en PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 12 — "puedo devolverlo si no me sirve?"

**Categoría:** policies
**Expected:** generated → devoluciones
**Latency total:** 12418ms

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
- relevance: **PASS** — La pregunta del usuario sobre devoluciones es probablemente fuera del alcance del material de conocimiento sobre el producto (melatonina + magnesio). El handoff silencioso (respuesta vacía) es la acción correcta en este caso, ya que indica que la información no está disponible o está fuera de scope.
- calibration: **CALIBRATED** — El modelo reportó una confianza baja (0.0) y la respuesta fue un handoff silencioso, lo cual es apropiado dado que la pregunta probablemente está fuera del alcance del material disponible. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 13 — "cuántas horas dura el efecto?"

**Categoría:** faqs-no-templated
**Expected:** generated → duracion_efecto
**Latency total:** 25933ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Muchos clientes reportan dormir hasta 7 horas seguidas. Esto es lo típico, pero no una garantía. La duración exacta depende de tu metabolismo y hábitos de sueño. Cada cuerpo responde distinto."
- sourceTopic: `duracion_efecto`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta usa exclusivamente el material provisto para la duración del efecto, incluyendo la referencia de 7 horas y la variabilidad individual."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta menciona las 7 horas como referencia, aclara que no es una garantía, y que la duración depende del metabolismo y hábitos, y que cada cuerpo responde distinto, todo lo cual está explícitamente en los 'Hechos' y 'Posición'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cuántas horas dura el efecto?'. La respuesta aborda directamente esta pregunta proporcionando la referencia de 'hasta 7 horas seguidas' y las aclaraciones necesarias sobre la variabilidad, tal como se indica en 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 14 — "qué hábitos ayudan a dormir?"

**Categoría:** faqs-no-templated
**Expected:** generated → alternativas_naturales
**Latency total:** 28015ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para dormir mejor, ayuda evitar pantallas 30 minutos antes, mantener una hora fija y cenar liviano. También, reduce la cafeína después de las 2 pm. Lo importante es que el producto complementa estos hábitos, no los reemplaza."
- sourceTopic: `alternativas_naturales`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista al menos 3 hábitos de higiene del sueño y posiciona el producto como complementario, siguiendo el material y las reglas de tono."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material de referencia. Se mencionan hábitos como evitar pantallas, hora fija, cenas livianas y reducción de cafeína, y se posiciona el producto como complementario, todo según lo establecido en 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre qué hábitos ayudan a dormir, listando varios de ellos y cumpliendo con la instrucción de posicionar el producto como complementario.
- calibration: **CALIBRATED** — El reportedConfidence es 0.95 (alto) y tanto la faithfulness como la relevance son PASS, lo que indica una calibración correcta del modelo.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 15 — "tengo apnea, puedo tomarlo?"

**Categoría:** negativos
**Expected:** handoff silente (KB no tiene apnea)
**Latency total:** 43322ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aplica directamente la regla de derivación a médico para condiciones preexistentes y añade la dosis estándar del producto."
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
- relevance: **PASS** — El usuario pregunta si puede tomar el producto teniendo apnea, una condición médica preexistente. El material de 'posicion' indica claramente que si el cliente reporta una condición médica preexistente, se debe derivar a su médico antes de iniciar. El material de 'cuando_escalar' también refuerza que se debe escalar si un cliente con condición médica preexistente pregunta. La respuesta vacía indica un handoff, que es la acción correcta y relevante en este escenario, ya que el modelo no debe dar consejo médico.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta (handoff) fue correcta y apropiada según el material para una pregunta sobre una condición médica preexistente. Ambos scores de faithfulness y relevance son PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 16 — "envían a Miami?"

**Categoría:** negativos
**Expected:** handoff silente (KB es Colombia-only)
**Latency total:** 33294ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta informa directamente la falta de cobertura internacional usando el material provisto."
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar. Toda la información implícita (la necesidad de escalar) está alineada con el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre envío a Miami, que es una ciudad fuera de Colombia. El material indica explícitamente que cualquier pregunta sobre envío internacional o ciudades fuera de Colombia (como Miami) debe escalar a un humano. El handoff silente es la acción correcta y relevante en este caso.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la acción de handoff fue la correcta y apropiada según el material para una pregunta sobre envío internacional. Esto indica una buena calibración.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 17 — "puedo pagar con criptomonedas?"

**Categoría:** negativos
**Expected:** handoff silente (KB no lista cripto)
**Latency total:** 31716ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta niega el método de pago no aceptado y lista todos los métodos válidos según el material, cumpliendo con las instrucciones de contenido y tono."
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo que no hay claims que evaluar.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente sobre criptomonedas es un caso explícito de escalada a humano según el material ('cliente pide pagar con criptomonedas...'). La respuesta vacía (handoff silente) es la acción correcta en este escenario, ya que el bot no debe responder directamente sobre métodos no aceptados y debe escalar.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la acción de handoff silente fue la correcta y apropiada según el material para la pregunta del cliente, resultando en PASS para faithfulness y relevance.
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
