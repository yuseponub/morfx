# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-06-10T21:42:24.387Z
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
**Latency total:** 31181ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `interaccion_alcohol`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta cumple con la recomendación explícita de no combinar alcohol con el producto y explica brevemente el mecanismo de acción según el material."
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
- relevance: **FAIL** — El usuario pregunta si puede tomar el producto si consume alcohol. El material de KB contiene información explícita para responder a esta pregunta, indicando claramente que NO se recomienda combinarlo y explicando el porqué. El modelo realizó un handoff silencioso (respuesta vacía) en lugar de proporcionar la respuesta directa y necesaria que estaba disponible en el material. Por lo tanto, no abordó la pregunta directamente cuando debía hacerlo.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un FAIL en relevancia, ya que no respondió a la pregunta del usuario a pesar de tener la información disponible en el material. Esto indica una sobre-confianza.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 2 — "estoy embarazada, lo puedo tomar?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_embarazo
**Latency total:** 26720ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No recomendamos usar el producto si estás embarazada. Lo que consumes puede afectar al bebé, incluso los suplementos naturales. Lo mejor es que valides cualquier suplemento con tu ginecólogo, él te guiará en este proceso."
- sourceTopic: `uso_en_embarazo`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta cumple con todas las directrices de no recomendación, derivación al médico y advertencia sobre naturales, usando solo el material provisto."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material de referencia. La respuesta no recomienda el uso durante el embarazo, menciona que lo que se consume puede afectar al bebé (incluso suplementos naturales) y aconseja validar con el ginecólogo, todo lo cual está explícitamente en los hechos y en las directrices de lo que debe contener la respuesta.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa: 'estoy embarazada, lo puedo tomar?'. La respuesta aborda directamente esta pregunta al indicar que no se recomienda el uso y proporcionar la información relevante sobre por qué y a quién consultar.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en Faithfulness y Relevance. Esto indica una calibración adecuada.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 3 — "se lo doy a mi hijo de 10?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_ninos
**Latency total:** 30205ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `uso_en_ninos`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta sigue la posición del negocio al no recomendar el producto para menores de 14 años y derivar al pediatra, usando solo el material provisto."
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
- relevance: **PASS** — La pregunta del cliente ('se lo doy a mi hijo de 10?') implica una intención de usar el producto en un menor de 14 años. El material de KB en la sección 'cuando_escalar' indica explícitamente que se debe escalar si el 'cliente quiere comprar para un menor de 14 años'. Un handoff silencioso es la acción correcta en este escenario, ya que evita que el modelo dé cualquier tipo de recomendación o información que pueda ser malinterpretada para un menor de edad, y deriva el caso a un agente humano para una gestión más segura y personalizada.
- calibration: **CALIBRATED** — El reportedConfidence es 0.95 (alto) y tanto Faithfulness como Relevance son PASS. Esto indica que el modelo confió correctamente en su decisión de hacer handoff.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 4 — "tomo sertralina, hay problema?"

**Categoría:** edge-cases
**Expected:** confidence bajo → handoff (sertralina NO está específicamente en KB)
**Latency total:** 32418ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si tomas sertralina, lo mejor es validarlo con tu médico tratante. El producto no se recomienda con medicación recetada activa sin su aprobación. Las categorías generales son una referencia, pero siempre consulta por tu caso específico."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta deriva al médico tratante para una medicación específica mencionada en el material, siguiendo las instrucciones de no aprobar combinaciones."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material. Se menciona la necesidad de validación médica para medicación recetada activa y que las categorías generales son una referencia, lo cual está explícitamente en los hechos y en las instrucciones de lo que debe contener.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre la sertralina, recomendando la consulta médica como indica el material para medicaciones específicas no listadas explícitamente como contraindicación directa pero que caen bajo la categoría de 'medicación recetada activa'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 5 — "tengo lupus, puedo?"

**Categoría:** edge-cases
**Expected:** confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)
**Latency total:** 31286ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si tienes lupus, no te recomendamos el producto. Las enfermedades autoinmunes son una contraindicación porque la melatonina puede modular la respuesta inmune. Lo mejor es que valides siempre con tu médico tratante antes de iniciar cualquier suplemento."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la condición específica del cliente (lupus) bajo la categoría de enfermedades autoinmunes y deriva al médico tratante según el material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. El material especifica que no se recomienda el uso en personas con enfermedades autoinmunes (como el lupus) debido a que la melatonina puede modular la respuesta inmune, y siempre se debe consultar al médico tratante.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto teniendo lupus, explicando la contraindicación específica y recomendando la consulta médica, tal como lo indica el material para casos específicos.
- calibration: **CALIBRATED** — El reportedConfidence es 0.95, lo cual es alto. La respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS, lo que indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 6 — "cómo se toma?"

**Categoría:** product
**Expected:** generated → como_se_toma
**Latency total:** 30622ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Debes tomar un comprimido diario, 30 minutos antes de acostarte, con agua. Trágalo entero, sin masticar ni disolver. La consistencia con la hora cada noche ayuda a tu cuerpo a acostumbrarse al ritmo del sueño."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye la dosis, forma de ingesta y la importancia de la consistencia, todo directamente del material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica la dosis, el momento, la forma de ingesta y la importancia de la consistencia, tal como se detalla en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente 'cómo se toma?' proporcionando todas las instrucciones necesarias sobre la administración del producto.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 7 — "qué ingredientes tiene?"

**Categoría:** product
**Expected:** generated → formula
**Latency total:** 38332ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El producto contiene melatonina 10mg, que ayuda a regular tu ciclo de sueño. También tiene citrato de magnesio 50mg, que aporta a la relajación muscular y al bienestar nervioso. Es un suplemento natural."
- sourceTopic: `formula`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los dos ingredientes activos con sus dosis y funciones, y describe el producto como un suplemento natural, todo directamente del material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. Se mencionan los ingredientes (melatonina 10mg y citrato de magnesio 50mg), sus funciones y la descripción del producto como suplemento natural, tal como se especifica en la sección 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre los ingredientes del producto, listándolos con sus dosis y funciones, lo cual es el quid de la pregunta.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 8 — "cuánto trae el frasco?"

**Categoría:** product
**Expected:** generated → contenido
**Latency total:** 24597ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El frasco trae 90 comprimidos. Con la dosis estándar de un comprimido diario, esto te rinde para 90 días. Así, tienes producto para 3 meses de uso continuo."
- sourceTopic: `contenido`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica la cantidad de comprimidos y el rendimiento exacto según el material provisto."
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
- faithfulness: **PASS** — Todos los claims de la respuesta están directamente extraídos o son paráfrasis fieles del material proporcionado. Se menciona la cantidad de 90 comprimidos y su rendimiento de 90 días (3 meses) con la dosis estándar, lo cual está explícitamente en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre la cantidad que trae el frasco, especificando los 90 comprimidos y su duración, que es información clave relacionada con la cantidad.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel y relevante. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 9 — "es adictivo?"

**Categoría:** product
**Expected:** generated → dependencia
**Latency total:** 28580ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, el producto no genera dependencia farmacológica en las dosis recomendadas. La melatonina es una sustancia que tu cuerpo produce naturalmente. La idea es regular tu ritmo de sueño, no que dependas de esto."
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre adicción, citando que no genera dependencia farmacológica y explicando el rol natural de la melatonina, todo según el material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta afirma que el producto no genera dependencia farmacológica en las dosis recomendadas, que la melatonina es una sustancia natural del cuerpo y que el producto busca regular el sueño, no generar dependencia, lo cual está explícitamente en la sección 'hechos' y en los 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'es adictivo?' y la respuesta aborda directamente esta cuestión negando la dependencia farmacológica y explicando el propósito del producto en relación con el sueño natural.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de Faithfulness y Relevance en PASS. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 10 — "cuánto tarda a Medellín?"

**Categoría:** policies
**Expected:** generated → envio (mencionar día siguiente)
**Latency total:** 26224ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Si pides el producto a Medellín, la entrega suele ser al día siguiente. Esto aplica también para el área metropolitana. Lo importante es que los tiempos son estimados por la transportadora."
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta ubica la ciudad en el rango de entrega correspondiente y cumple con las restricciones de tono y longitud."
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
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente soportados por el material. El material indica que para Medellín y su área metropolitana la entrega es al día siguiente y que los tiempos son estimados por la transportadora.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre el tiempo de entrega a Medellín, proporcionando la información exacta del material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 11 — "cómo pago?"

**Categoría:** policies
**Expected:** generated → pago
**Latency total:** 39739ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Puedes pagar contra-entrega en efectivo, que es la opción más común. También aceptamos transferencias a Bancolombia, Nequi o Daviplata. Otra forma es con tarjeta débito o crédito usando un link de pago seguro."
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista todos los métodos de pago aceptados y menciona el más común, usando solo el material provisto."
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
- faithfulness: **PASS** — La respuesta utiliza únicamente información presente en el material de referencia. Todos los métodos de pago mencionados (contra-entrega en efectivo, transferencias a Bancolombia, Nequi o Daviplata, y tarjeta débito/crédito vía link de pago seguro) y la afirmación de que contra-entrega es la opción más común, están explícitamente detallados en la sección 'hechos' del topicMaterial.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo pago?', y la respuesta aborda directamente esta cuestión listando de manera clara y concisa todos los métodos de pago aceptados, tal como lo indica el 'debe_contener_aplicables' para listar los 3 grupos de métodos y mencionar la opción más común.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario (ambos PASS).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 12 — "puedo devolverlo si no me sirve?"

**Categoría:** policies
**Expected:** generated → devoluciones
**Latency total:** 32943ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `devoluciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica que el equipo humano coordinará la consulta sobre devoluciones, siguiendo la posición del negocio y los requisitos de contenido."
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre devoluciones. El material de KB indica explícitamente que 'Cualquier consulta sobre devoluciones (sea pregunta general o solicitud concreta) se escala a humano' y que el bot 'NO redacta respuestas sobre este topic'. El handoff silente es la acción correcta y relevante en este caso.
- calibration: **MISCALIBRATED_HIGH** — El modelo realizó un handoff silente (respuesta vacía), pero reportó una confianza de 0.95. Según las instrucciones, el 'reportedConfidence' debe ser 0 si hay handoff. Por lo tanto, el modelo sobre-confió en su capacidad de manejar la consulta con una respuesta directa, cuando la acción correcta era escalar con confianza 0.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 13 — "cuántas horas dura el efecto?"

**Categoría:** faqs-no-templated
**Expected:** generated → duracion_efecto
**Latency total:** 26684ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Muchos clientes reportan dormir hasta 7 horas seguidas. Lo importante es que la duración exacta del efecto varía. Cada cuerpo responde distinto, y esto depende de tu metabolismo y hábitos de sueño."
- sourceTopic: `duracion_efecto`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta usa el material para indicar la duración típica y la variabilidad individual, siguiendo las reglas de tono y longitud."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material de referencia. La frase 'Muchos clientes reportan' es una paráfrasis fiel de 'La mayoría de clientes satisfechos reporta'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre la duración del efecto, proporcionando la referencia de 'hasta 7 horas seguidas' y aclarando que la duración exacta varía según el metabolismo y los hábitos, tal como lo indica el material en 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 14 — "qué hábitos ayudan a dormir?"

**Categoría:** faqs-no-templated
**Expected:** generated → alternativas_naturales
**Latency total:** 29581ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para dormir mejor, evita pantallas 30 minutos antes de acostarte, mantén una hora fija para dormir y reduce la cafeína después de las 2 pm. El producto acompaña estos hábitos cuando necesitas un empujón extra, no los reemplaza."
- sourceTopic: `alternativas_naturales`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los hábitos de higiene del sueño y posiciona el producto como complemento, siguiendo las directrices del material."
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
- faithfulness: **PASS** — La respuesta utiliza únicamente información presente en el material de referencia, mencionando hábitos específicos y la relación del producto con ellos. Todos los claims provienen directamente de la sección 'hechos'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre hábitos para dormir y cumple con las directrices de posicionamiento del producto como complementario, no como reemplazo.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 15 — "tengo apnea, puedo tomarlo?"

**Categoría:** negativos
**Expected:** handoff silente (KB no tiene apnea)
**Latency total:** 39680ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta deriva al médico por condición preexistente y cumple con todos los requisitos de información obligatoria del producto."
- reason: `escalation_trigger_match: cliente con condición médica preexistente pregunta por dosis específica`
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
- faithfulness: **PASS** — La respuesta generada está vacía, por lo tanto, no hay claims que evaluar en cuanto a fidelidad. Se considera un handoff silencioso.
- faithfulness_invented_claims: null
- relevance: **PASS** — El usuario pregunta si puede tomar el producto teniendo apnea, una condición médica preexistente. El material de KB indica claramente que si el cliente reporta una condición médica preexistente, se debe derivar a su médico antes de iniciar y que es un caso para escalar. La respuesta vacía (handoff silencioso) es la acción correcta y relevante en este escenario, ya que el modelo no debe dar consejo médico y debe escalar.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la acción tomada (handoff silencioso) fue la correcta y apropiada según el material de KB para una pregunta sobre una condición médica preexistente. Tanto la fidelidad como la relevancia son PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 16 — "envían a Miami?"

**Categoría:** negativos
**Expected:** handoff silente (KB es Colombia-only)
**Latency total:** 41257ms
**Nota re-run (Pitfall 12):** en la corrida completa 2026-06-10 este caso terminó en RUNTIME ERROR de infra Gemini (`AI_RetryError ... high demand` en `generation_call_error`). Se aplicó la política de 1 re-run por caso flaky (`npx vitest run ... smoke-rag-a.test.ts -t "16. negativos"`, mismo día) y este bloque es el resultado del re-run: PASS. El bloque original con el error quedó registrado en BASELINE.md.

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.4`
- confidenceRationale: "La respuesta indica la falta de cobertura internacional, pero el material sugiere escalar para opciones especiales no cubiertas por el bot."
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
- faithfulness: **PASS** — La respuesta está vacía (handoff), por lo tanto, no hay claims que evaluar y no hay invenciones.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es sobre envío a Miami, que es una ciudad fuera de Colombia. El material indica explícitamente que las preguntas sobre envíos internacionales o ciudades fuera de Colombia (como Miami) deben escalar a un humano. El handoff silente es la acción correcta en este caso, ya que el bot no puede responder directamente y requiere intervención humana.
- calibration: **CALIBRATED** — El reportedConfidence es 0.4, que es bajo (<0.70). La respuesta fue un handoff silente, que es la acción correcta y esperada según el material para una pregunta sobre envío internacional. Por lo tanto, el modelo reportó una confianza baja para una acción correcta (handoff), lo cual es calibrado.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 17 — "puedo pagar con criptomonedas?"

**Categoría:** negativos
**Expected:** handoff silente (KB no lista cripto)
**Latency total:** 31172ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta niega el método no aceptado y lista los métodos disponibles según el material."
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
