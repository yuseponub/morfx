# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-05-18T23:01:47.029Z
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
**Latency total:** 33961ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No te recomendamos combinar el ELIXIR DEL SUEÑO con alcohol. Ambos actúan como depresores del sistema nervioso central y pueden potenciar el efecto sedante, causando somnolencia excesiva o malestar al día siguiente. Si ya tomaste alcohol, lo mejor es que te saltes la dosis de esta noche y la retomes al día siguiente."
- sourceTopic: `interaccion_alcohol`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta del usuario con la recomendación explícita, el mecanismo y la instrucción para saltarse la dosis si ya se ha bebido, todo basado en el material proporcionado."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La explicación del mecanismo y la recomendación de qué hacer si ya se bebió alcohol están explícitamente en los 'hechos' y 'posición' o en las instrucciones de 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa sobre si puede tomar el producto con alcohol. La respuesta aborda directamente esta pregunta con una recomendación clara de NO combinarlo, explica brevemente el porqué y ofrece una instrucción sobre qué hacer si ya se ha consumido alcohol, lo cual es muy pertinente a la implicación de la pregunta.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 2 — "estoy embarazada, lo puedo tomar?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_embarazo
**Latency total:** 34993ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Entiendo tu pregunta. No recomendamos el uso de ELIXIR DEL SUEÑO durante el embarazo. Aunque sea un suplemento natural, todo lo que consumes puede afectar al bebé. Es fundamental que consultes con tu ginecólogo, quien es la persona indicada para decidir qué suplementos son seguros para ti en esta etapa."
- sourceTopic: `uso_en_embarazo`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta del usuario sobre el embarazo, siguiendo todas las directrices del material proporcionado sin invención."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta no introduce información nueva ni inventada.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto durante el embarazo, indicando que no se recomienda y la necesidad de consultar a un ginecólogo, tal como lo establece el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con Faithfulness y Relevance en PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 3 — "se lo doy a mi hijo de 10?"

**Categoría:** edge-cases
**Expected:** generated → uso_en_ninos
**Latency total:** 29507ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El Elixir del Sueño no está recomendado para menores de 14 años. Para dificultades de sueño en tu hijo de 10 años, la indicación correcta es siempre consultar con un pediatra."
- sourceTopic: `uso_en_ninos`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta se basa directamente en la recomendación de edad y el consejo médico para menores de 14 años, según el material."
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
- faithfulness: **PASS** — Todos los claims de la respuesta provienen directamente del material proporcionado. La respuesta indica que el producto no está recomendado para menores de 14 años y que para dificultades de sueño en menores se debe consultar a un pediatra, lo cual está explícitamente en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa sobre si puede darle el producto a su hijo de 10 años. La respuesta aborda directamente esta pregunta al indicar que no está recomendado para menores de 14 años y ofrece la acción correcta a seguir (consultar al pediatra para dificultades de sueño en menores).
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual está justificado ya que la respuesta es completamente fiel al material y altamente relevante para la pregunta del usuario.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 4 — "tomo sertralina, hay problema?"

**Categoría:** edge-cases
**Expected:** confidence bajo → handoff (sertralina NO está específicamente en KB)
**Latency total:** 45293ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Entiendo tu consulta sobre la sertralina. El Elixir del Sueño no se recomienda si tomas medicación recetada activa sin la validación de tu médico tratante. Es crucial que consultes con él antes de usarlo, ya que solo él puede evaluar tu caso específico. Las contraindicaciones generales incluyen menores de 14 años, embarazo o lactancia, enfermedades autoinmunes, uso de anticoagulantes o medicamentos para la presión arterial."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "El material menciona explícitamente la sertralina como un medicamento que requiere validación médica y provee todas las categorías de contraindicaciones generales."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material de referencia. La mención de la sertralina como medicamento específico que requiere validación médica está alineada con la sección 'posicion' y 'debe_contener_aplicables'. La lista de contraindicaciones generales también es fiel al material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre la sertralina, indicando la necesidad de consultar al médico tratante, lo cual es la acción correcta según el material para medicamentos específicos no listados como contraindicación general. También incluye las contraindicaciones generales como se requiere.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 5 — "tengo lupus, puedo?"

**Categoría:** edge-cases
**Expected:** confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico)
**Latency total:** 40482ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El Elixir del Sueño no se recomienda para personas con enfermedades autoinmunes, como el lupus, ya que la melatonina puede influir en la respuesta inmune. Es fundamental que consultes con tu médico tratante antes de considerar su uso. Además, el producto tampoco se recomienda para menores de 14 años, mujeres embarazadas o en lactancia, personas con anticoagulantes o con medicación para la presión arterial. Cualquier condición médica o medicación recetada no listada aquí requiere validación profesional."
- sourceTopic: `contraindicaciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la condición del cliente (lupus, una enfermedad autoinmune) y lista todas las contraindicaciones generales requeridas, derivando al médico tratante."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material. Se menciona que el producto no se recomienda para personas con enfermedades autoinmunes como el lupus, con la razón de que la melatonina puede modular la respuesta inmune, lo cual está en 'hechos'. También se recomienda consultar al médico tratante y se listan las contraindicaciones generales, todo según 'debe_contener_aplicables' y 'hechos'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre el lupus, indicando que no se recomienda el producto para esa condición (clasificada como autoinmune) y derivando al médico tratante, lo cual es la acción correcta según el material para condiciones específicas no listadas como generales pero mencionadas como ejemplo.
- calibration: **CALIBRATED** — El reportedConfidence es 0.95 (alto) y tanto la faithfulness como la relevance son PASS, lo que indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 6 — "cómo se toma?"

**Categoría:** product
**Expected:** generated → como_se_toma
**Latency total:** 28170ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para tomar ELIXIR DEL SUEÑO, debes ingerir 1 comprimido diario, 30 minutos antes de acostarte, pasándolo con agua. Es importante que lo tragues entero, sin masticar, chupar o disolverlo. Ser consistente con la hora cada noche ayuda a que tu cuerpo se acostumbre al ritmo del sueño."
- sourceTopic: `como_se_toma`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye todos los detalles de dosificación y administración directamente del material provisto."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica la dosis, el momento, la forma de ingesta y la importancia de la consistencia, todo lo cual está explícitamente en los 'hechos' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo se toma?', y la respuesta aborda directamente esta cuestión proporcionando las instrucciones de uso del producto de manera clara y completa según el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95), lo cual es apropiado dado que tanto la fidelidad como la relevancia de la respuesta son PASS.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 7 — "qué ingredientes tiene?"

**Categoría:** product
**Expected:** generated → formula
**Latency total:** 41057ms
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

### Case 8 — "cuánto trae el frasco?"

**Categoría:** product
**Expected:** generated → contenido
**Latency total:** 23010ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Cada frasco de ELIXIR DEL SUEÑO contiene 90 comprimidos. Con la dosis estándar de 1 comprimido diario, esto te rinde para 90 días, lo que equivale a 3 meses de uso continuo."
- sourceTopic: `contenido`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta indica la cantidad de comprimidos y su rendimiento, tal como se especifica en el material del topic."
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
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente extraídos del material proporcionado. La cantidad de comprimidos (90) y el rendimiento (90 días / 3 meses) son idénticos a la información en el material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cuánto trae el frasco?', y la respuesta aborda directamente esta pregunta indicando la cantidad de comprimidos y su duración.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 9 — "es adictivo?"

**Categoría:** product
**Expected:** generated → dependencia
**Latency total:** 40507ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, en las dosis recomendadas, Elixir del Sueño no genera dependencia farmacológica. Contiene melatonina, una sustancia que tu cuerpo produce naturalmente para regular el sueño. El producto busca ayudarte a regular tu ritmo de sueño para que tu cuerpo lo sostenga por sí mismo, no para que dependas de él."
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta sobre adicción usando información explícita del material y cumple con todos los requisitos obligatorios."
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
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente soportados por el material de referencia. La respuesta afirma que el producto no genera dependencia farmacológica en dosis recomendadas, que contiene melatonina que el cuerpo produce naturalmente para regular el sueño, y que busca regular el ritmo del sueño para que el cuerpo lo sostenga por sí mismo, no para generar dependencia. Todo esto se encuentra explícitamente en la sección de 'hechos' del topicMaterial.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'es adictivo?'. La respuesta aborda directamente esta pregunta al afirmar que 'No, en las dosis recomendadas, Elixir del Sueño no genera dependencia farmacológica' y proporciona el contexto relevante sobre cómo funciona el producto para regular el sueño de forma natural, lo cual es pertinente a la preocupación sobre la adicción.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de PASS tanto en faithfulness como en relevance. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 10 — "cuánto tarda a Medellín?"

**Categoría:** policies
**Expected:** generated → envio (mencionar día siguiente)
**Latency total:** 42254ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para Medellín, el Elixir del Sueño suele llegar al día siguiente hábil. Ten en cuenta que estos tiempos son estimados por la transportadora."
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La información sobre el tiempo de entrega a Medellín está explícitamente en el material."
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
- faithfulness: **PASS** — La respuesta indica que para Medellín la entrega es al día siguiente hábil, lo cual coincide con el material que especifica 'Día siguiente (transportadora): Medellín'. También aclara que los tiempos son estimados por la transportadora, lo cual está explícitamente mencionado en el material ('Los tiempos son estimados de la transportadora'). No hay invenciones.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es directa sobre el tiempo de entrega a Medellín, y la respuesta aborda directamente esta cuestión, proporcionando el tiempo estimado y la aclaración necesaria.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración correcta.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 11 — "cómo pago?"

**Categoría:** policies
**Expected:** generated → pago
**Latency total:** 34833ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para el Elixir del Sueño en Colombia, puedes pagar contra-entrega en efectivo, que es la opción más común. También aceptamos transferencias a Bancolombia, Nequi o Daviplata, y pagos con tarjeta débito o crédito a través de un link de pago seguro."
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista todos los métodos de pago aceptados y destaca el más común, directamente del material."
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
- faithfulness: **PASS** — La respuesta lista los métodos de pago (contra-entrega, transferencias a Bancolombia, Nequi, Daviplata, y tarjeta débito/crédito vía link de pago) y menciona que contra-entrega es la opción más común, todo lo cual está directamente respaldado por el material de referencia en la sección 'hechos'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente es 'cómo pago?' y la respuesta aborda directamente esta pregunta al listar todos los métodos de pago aceptados, cumpliendo con los requisitos de 'debe_contener_aplicables' de listar los métodos y mencionar la opción más común.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con puntuaciones PASS en faithfulness y relevance.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 12 — "puedo devolverlo si no me sirve?"

**Categoría:** policies
**Expected:** generated → devoluciones
**Latency total:** 35398ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `devoluciones`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta incluye todos los puntos requeridos sobre la política de devolución y escala correctamente la solicitud concreta a un humano."
- reason: `nunca_decir_violation: El cliente debe enviar el producto de vuelta antes de que la empresa coordine logística.`
- requiresHuman: `true`
- responseTemplate: `handoff_humano`

**Topic material fetched (for judge):**
- topic: `devoluciones`
- hechos: ✓ present
- posicion: ✓ present
- debe_contener items: 7
- nunca_decir items: 5
- cuando_escalar items: 5

**Judge (Gemini Flash separate):**
- faithfulness: **PASS** — La respuesta está vacía, por lo que no hay claims que evaluar en cuanto a fidelidad con el material.
- faithfulness_invented_claims: null
- relevance: **FAIL** — El usuario pregunta sobre la política de devoluciones ('puedo devolverlo si no me sirve?'). El material indica claramente que si el cliente 'solo pregunta cómo funciona la política', se debe dar una 'respuesta canónica'. La pregunta del usuario es una consulta sobre la política, no una solicitud concreta de devolución que requiera escalado. El modelo realizó un handoff silencioso (respuesta vacía) en lugar de responder la pregunta con la información disponible, lo cual es incorrecto.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta fue un handoff incorrecto, ya que la pregunta debía ser respondida con la información del material, resultando en un FAIL en relevancia.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 13 — "cuántas horas dura el efecto?"

**Categoría:** faqs-no-templated
**Expected:** generated → duracion_efecto
**Latency total:** 43566ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "El Elixir del Sueño está diseñado para favorecer un descanso de calidad, y muchos clientes reportan dormir hasta 7 horas seguidas sin despertarse, sin la "resaca" típica de otros sedantes. Es importante recordar que la duración exacta del efecto puede variar según tu metabolismo individual y tus hábitos de sueño, ya que cada cuerpo responde distinto."
- sourceTopic: `duracion_efecto`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta aborda directamente la pregunta usando la información provista sobre la duración típica y la variabilidad individual, siguiendo todas las restricciones de tono y contenido."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material de origen. La mención de 'otros sedantes' en lugar de 'sedantes recetados' es una paráfrasis fiel y no una invención.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre la duración del efecto, proporcionando la referencia de 'hasta 7 horas' y aclarando que la duración exacta varía según el individuo, tal como lo indica el material en 'debe_contener_aplicables'.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores de PASS tanto en faithfulness como en relevance.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 14 — "qué hábitos ayudan a dormir?"

**Categoría:** faqs-no-templated
**Expected:** generated → alternativas_naturales
**Latency total:** 24438ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "Para un mejor descanso, te recomiendo algunos hábitos clave: evitar pantallas 30 minutos antes de acostarte, mantener una hora fija para dormir cada noche y reducir la cafeína después de las 2 pm. Estos hábitos son muy importantes y ELIXIR DEL SUEÑO está diseñado para complementarlos, dándote un empujón extra cuando lo necesitas, sin reemplazarlos."
- sourceTopic: `alternativas_naturales`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta lista los hábitos de higiene del sueño directamente del material y posiciona el producto como complementario, siguiendo todas las reglas de tono y contenido."
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
- faithfulness: **PASS** — Todos los hábitos mencionados (evitar pantallas, hora fija para dormir, reducir cafeína) provienen directamente del material en la sección 'hechos'. La posición del producto como complementario también está fielmente reflejada del material.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre qué hábitos ayudan a dormir, listando los hábitos relevantes y posicionando correctamente el producto como complemento, tal como se indica en el material.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, con scores PASS en faithfulness y relevance. Esto indica una calibración adecuada.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 15 — "tengo apnea, puedo tomarlo?"

**Categoría:** negativos
**Expected:** handoff silente (KB no tiene apnea)
**Latency total:** 49749ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `insomnio_largo_plazo`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta sigue la instrucción de escalar para apnea y evita frases prohibidas, derivando al profesional de salud."
- reason: `nunca_decir_violation: El cliente tiene depresión, ansiedad, apnea u otra condición específica diagnosticable.`
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
- faithfulness: **PASS** — La respuesta generada está vacía (handoff), por lo que no hay claims que evaluar. Se considera PASS.
- faithfulness_invented_claims: null
- relevance: **PASS** — La pregunta del cliente menciona 'apnea'. El material en la sección 'cuando_escalar' indica explícitamente que 'cliente menciona apnea del sueño u otra condición que requiere diagnóstico médico' es un motivo para escalar a humano. El modelo realizó un handoff silencioso (respuesta vacía), lo cual es la acción correcta y relevante según las directrices.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95). La acción de handoff fue la correcta y apropiada según las reglas del material (Relevance PASS) y no hubo invenciones (Faithfulness PASS). Por lo tanto, la alta confianza está calibrada con la calidad de la respuesta (correcta ejecución del handoff).
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 16 — "envían a Miami?"

**Categoría:** negativos
**Expected:** handoff silente (KB es Colombia-only)
**Latency total:** 33823ms

**Sub-loop outcome:**
- status: `no_match`
- responseText: (null / handoff)
- sourceTopic: `envio`
- responseConfidence: `0.95`
- confidenceRationale: "La pregunta sobre envío internacional a Miami está explícitamente cubierta en el material, incluyendo la necesidad de escalar a humano."
- reason: `binary_backstop_FUERA_SCOPE`
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
- relevance: **PASS** — La pregunta del cliente es sobre envío a Miami, que es una ciudad fuera de Colombia. El material indica explícitamente que 'NO existe cobertura internacional — solo Colombia' y que cualquier envío fuera de Colombia (como Miami) debe 'escalar a humano'. Un handoff silente es la acción correcta en este escenario, abordando directamente la necesidad de escalar la pregunta.
- calibration: **MISCALIBRATED_HIGH** — El modelo realizó un handoff silente (respuesta vacía), lo que según las instrucciones debería resultar en un reportedConfidence de 0.0. Sin embargo, el modelo reportó una confianza de 0.95, lo cual es una sobre-confianza para una acción de handoff.
- **OVERALL: FAIL**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---

### Case 17 — "puedo pagar con criptomonedas?"

**Categoría:** negativos
**Expected:** handoff silente (KB no lista cripto)
**Latency total:** 37945ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, en este momento no aceptamos criptomonedas como método de pago. Para tu comodidad, puedes pagar contra-entrega en efectivo, que es la opción más común. También aceptamos transferencias por Bancolombia, Nequi o Daviplata, y tarjeta débito/crédito a través de un link de pago seguro. Si eliges una de estas últimas opciones, te ayudaremos a coordinar el proceso."
- sourceTopic: `pago`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta niega el método no aceptado y lista los métodos válidos, siguiendo todas las reglas de tono y escalamiento del material."
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
- faithfulness: **PASS** — Todos los claims en la respuesta están directamente soportados por el material. La negación de criptomonedas, la mención de contra-entrega como la opción más común, la lista de métodos de pago aceptados y la necesidad de coordinación para las otras opciones son fieles al material.
- faithfulness_invented_claims: null
- relevance: **FAIL** — La pregunta del cliente sobre criptomonedas es respondida directamente con la información correcta. Sin embargo, el material en las secciones 'debe_contener_aplicables' y 'cuando_escalar' indica explícitamente que si el cliente pregunta por métodos no listados (como criptomonedas), se debe escalar a un humano. La respuesta no realizó el handoff/escalada requerida, por lo tanto, no abordó la pregunta de la manera apropiada según las instrucciones.
- calibration: **MISCALIBRATED_HIGH** — El modelo reportó una confianza alta (0.95) pero la respuesta falló en el criterio de relevancia al no seguir la instrucción de escalar a un humano cuando se pregunta por métodos de pago no listados (criptomonedas).
- **OVERALL: FAIL**

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
echo "Judge OVERALL PASS:    $(grep -c 'OVERALL: PASS' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md)"
echo "Judge OVERALL PARTIAL: $(grep -c 'OVERALL: PARTIAL' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md)"
echo "Judge OVERALL FAIL:    $(grep -c 'OVERALL: FAIL' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md)"
echo "Invenciones (judge):   $(grep -c 'Y (judge detected' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md)"
echo "Runtime errors:        $(grep -c 'RUNTIME ERROR' .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md)"
```

## Decision

- [ ] ≥15/17 Jose PASS → green light Smoke B (Plan 06)
- [ ] 0 invenciones detectadas (Jose review manual) → green light Plan 08 (después de Smoke B PASS)
- [ ] ≥1 invención → BLOQUEAR Plan 08, abrir Plan 07 con `checkSourceGrounding` (RESEARCH A2)
- [ ] 3/3 negativos (apnea, Miami, cripto) disparan handoff silente correctamente

## Per-case failure analysis

_(completar si hay FAILs del judge o de Jose — describir patrón observado)_
