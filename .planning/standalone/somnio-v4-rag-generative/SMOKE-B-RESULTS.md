# SMOKE B — Regression Results (paths NO migrados D-12)

**Run date:** 2026-06-11T02:35:20.779Z
**Standalone:** somnio-v4-rag-generative / Plan 06
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)

## Resumen ejecución

- **Casos total:** 10
- **Casos REAL (invocación contra runSubLoop):** 3 (razonamiento_libre)
- **Casos SKIP (verificación manual via sandbox):** 7
  - crm_mutation (3): mutarían producción — Regla 6 + Threat T-06-01
  - state_machine (3): NO entran al sub-loop — template matching upstream
  - cas_reject (1): integration tests crm-writer ya cubren — Threat T-06-04

**Sin LLM-as-judge** — son regresiones estructurales (RESEARCH líneas 870-873).

---

## Per-case results


### Case 1 — "qué pensás del insomnio?"

**Group:** razonamiento_libre
**Expected:** handoff silente (divagación, sin KB)
**Expected status:** `no_match`
**Latency:** 38334ms



**Sub-loop outcome:**

- status: `generated`
- responseText: "Entiendo tu preocupación por el insomnio. El producto es un suplemento natural para acompañar el ritmo del sueño en adultos. No es un medicamento recetado para insomnio crónico. Si llevas meses sin do"
- responseTemplate: `null`
- sourceTopic: `insomnio_largo_plazo`
- responseConfidence: `0.95`
- reason: `rag_generated`
- requiresHuman: `false`


**Auto-check (status match):** ❌ FAIL (got status=`generated`, expected=`no_match`)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 2 — "ayer fue un día raro, no pude dormir"

**Group:** razonamiento_libre
**Expected:** handoff o template empático
**Expected status:** `no_match`
**Latency:** 31878ms

**RUNTIME ERROR:** ```Failed after 3 attempts. Last error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.```

**Sub-loop outcome:**
_(outcome null — runtime error)_

**Auto-check:** ⚠ NO_OUTCOME (runtime error — ver mensaje)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 3 — "el sueño es interesante, no?"

**Group:** razonamiento_libre
**Expected:** handoff silente
**Expected status:** `no_match`
**Latency:** 15218ms



**Sub-loop outcome:**

- status: `generated`
- responseText: "El sueño es fundamental para el bienestar. Nuestro producto busca regular tu ritmo de sueño, no que dependas de él. Contiene melatonina, que tu cuerpo produce naturalmente."
- responseTemplate: `null`
- sourceTopic: `dependencia`
- responseConfidence: `0.95`
- reason: `rag_generated`
- requiresHuman: `false`


**Auto-check (status match):** ❌ FAIL (got status=`generated`, expected=`no_match`)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 4 — "dale, quiero comprar. mi dirección es Calle 1 # 2-3"

**Group:** crm_mutation
**Expected:** createOrder + template post-orden
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** Mutaría pedido real en producción Somnio (Regla 6 + Threat T-06-01). Verificación manual via sandbox.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — Mutaría pedido real en producción Somnio (Regla 6 + Threat T-06-01). Verificación manual via sandbox.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 5 — "movéme el pedido a confirmado"

**Group:** crm_mutation
**Expected:** moveOrderToStage + template
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** Mutaría stage real en producción Somnio (Regla 6 + Threat T-06-01). Verificación manual via sandbox.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — Mutaría stage real en producción Somnio (Regla 6 + Threat T-06-01). Verificación manual via sandbox.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 6 — "agregá una nota: cliente prefiere AM"

**Group:** crm_mutation
**Expected:** addOrderNote + confirmación
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** Agregaría nota real a pedido real (Regla 6 + Threat T-06-01). Verificación manual via sandbox.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — Agregaría nota real a pedido real (Regla 6 + Threat T-06-01). Verificación manual via sandbox.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 7 — "hola"

**Group:** state_machine
**Expected:** saludo template (sin sub-loop — comprehension clasifica → response-track template directo)
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 8 — "cuánto cuesta?"

**Group:** state_machine
**Expected:** precio template (sin sub-loop)
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 9 — "ya recibí el pedido"

**Group:** state_machine
**Expected:** confirmacion template (sin sub-loop)
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---

### Case 10 — "(simulado: race condition createOrder con stage_changed_concurrently)"

**Group:** cas_reject
**Expected:** propaga error verbatim, agent decide handoff
**Expected status:** `SKIP`
**Latency:** 0ms
**SKIPPED:** cas_reject requiere mockear race condition stage_changed_concurrently (createOrder real + concurrent stage move). Integration tests del crm-writer (standalone crm-stage-integrity shipped 2026-04-21) ya cubren este path.


**Sub-loop outcome:**
_(no aplica — caso SKIP, sin invocación al sub-loop)_

**Auto-check:** N/A (SKIP — cas_reject requiere mockear race condition stage_changed_concurrently (createOrder real + concurrent stage move). Integration tests del crm-writer (standalone crm-stage-integrity shipped 2026-04-21) ya cubren este path.)
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---


## Aggregate metrics

| Metric | Count | %  |
|--------|-------|----|
| Total cases | 10 | 100% |
| REAL invocation (razonamiento_libre) | 3 | 30% |
| SKIP (manual via sandbox) | 7 | 70% |
| Auto-check PASS (REAL only — status match) | __ | __% (de 3 REAL) |
| Jose PASS (después de revisión) | __ | __% (de 10) |
| Jose FAIL (bloqueante) | __ | __% |

## Decision Checklist

- [ ] **Runtime errors en REAL cases (razonamiento_libre 1-3):** debe ser 0.
- [ ] **Auto-check PASS en REAL cases:** ≥2/3 (idealmente 3/3 — handoff silente esperado).
- [ ] **Jose review manual SKIP cases (crm_mutation 4-6):** via sandbox aislado verificando que crm-writer adapter sigue funcionando post-Plan 03 refactor.
- [ ] **Jose review manual SKIP cases (state_machine 7-9):** via sandbox verificando que comprehension clasifica intents claros y NO dispara sub-loop.
- [ ] **Jose review SKIP cas_reject (10):** integration tests del crm-writer ya pasaron — confirmar que sub-loop sigue propagando `stage_changed_concurrently` verbatim.

## Criterio de éxito

**≥9/10 OK según Jose** (CONTEXT.md líneas 121-124).

- Si ≥9/10 OK + Smoke A 15/17 PASS → **green light Plan 08** (production flip con notas out-of-scope cases 16+17).
- Si <9/10 → abrir **Plan 07d** antes de Plan 08 para fix specifico de regresión observada.

## Per-case failure analysis

_(completar si hay FAILs en Auto-check de razonamiento_libre o Jose marca FAIL en SKIP cases)_

