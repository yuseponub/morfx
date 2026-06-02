# SMOKE A — RAG-Generative Redesign Results

**Run date:** 2026-06-02T22:14:15.616Z
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
**Latency total:** 37637ms

**Sub-loop outcome:**
- status: `generated`
- responseText: "No, no debes combinar el producto con alcohol. Esto puede potenciar la sedación y causar somnolencia excesiva. Si ya bebiste, lo mejor es saltarte la dosis de esta noche y retomar mañana."
- sourceTopic: `interaccion_alcohol`
- responseConfidence: `0.95`
- confidenceRationale: "La respuesta sigue la posición del negocio y los hechos del producto, incluyendo la recomendación explícita y el mecanismo de acción."
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
- faithfulness: **PASS** — Todos los claims en la respuesta provienen directamente del material proporcionado. La respuesta indica no combinar con alcohol, explica que puede potenciar la sedación y somnolencia excesiva, y aconseja saltarse la dosis si ya se bebió, todo lo cual está explícitamente en los 'hechos', 'posición' y 'debe_contener_aplicables'.
- faithfulness_invented_claims: null
- relevance: **PASS** — La respuesta aborda directamente la pregunta del cliente sobre si puede tomar el producto si consume alcohol, proporcionando una negación clara, la razón y una instrucción relevante para el escenario de haber bebido ya.
- calibration: **CALIBRATED** — El modelo reportó una confianza alta (0.95) y la respuesta es de alta calidad, siendo fiel al material y relevante para la pregunta del usuario. Esto indica una calibración adecuada.
- **OVERALL: PASS**

**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

**Invención detectada (Y/N):** N (judge) / ☐ Jose

---
