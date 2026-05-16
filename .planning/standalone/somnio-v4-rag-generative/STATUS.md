# Somnio v4 RAG Generative — STATUS (LIVE)

**Last updated:** 2026-05-16 (creación del standalone)
**HEAD git:** pendiente (commit inicial post-creación)
**v4 status en prod:** DORMANT (sin routing rule)
**v3 status en prod:** ACTIVO (atendiendo clientes — Regla 6 intocado)

---

## PHASES — checklist alto nivel

- [x] **Discuss-phase informal** (sesión 2026-05-15/16, 30 D's capturados en `DISCUSSION-LOG.md`)
- [x] **Standalone setup** (CONTEXT.md + DISCUSSION-LOG.md + este STATUS.md)
- [ ] **Research-phase** — pendiente. Comando: `/gsd:research-phase somnio-v4-rag-generative`
- [ ] **Plan-phase** — pendiente. Comando: `/gsd:plan-phase somnio-v4-rag-generative`
- [ ] **Execute-phase plan 01** — pendiente
- [ ] **Execute-phase plan 02** — pendiente
- [ ] **Execute-phase plan 03** — pendiente
- [ ] **Execute-phase plan 04** — pendiente
- [ ] **Execute-phase plan 05 (Smoke A)** — pendiente
- [ ] **Execute-phase plan 06 (Smoke B)** — pendiente
- [ ] **Execute-phase plan 07** — HOLD (iter sobre smoke results)
- [ ] **Execute-phase plan 08 (flip productivo)** — pendiente
- [ ] **Verify-phase** — pendiente
- [ ] **LEARNINGS.md** — pendiente

---

## Plans status

| Plan | Título | Status | HEAD |
|---|---|---|---|
| 01 | KB schema update (parser, sync, RPC, migración DB) | pending | — |
| 02 | Reescribir 18 KBs en formato nuevo | pending | — |
| 03 | Sub-loop split tooling/generación + borrar canonical (ATÓMICO con 02) | pending | — |
| 04 | Few-shots calibración Gemini Flash | pending | — |
| 05 | Smoke A — low_confidence 17 casos + LLM-as-judge | pending | — |
| 06 | Smoke B — regression 10 casos | pending | — |
| 07 | Iter sobre smoke results (HOLD) | hold | — |
| 08 | Flip productivo (SQL routing_rule) | pending | — |

---

## Smoke A — 17 casos (low_confidence, rediseño RAG)

**Actualizá cuando corras Smoke A en Plan 05.**

### edge-cases (5)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 1 | "puedo si tomo alcohol?" | canonical → interaccion_alcohol | ☐ | ☐ | |
| 2 | "estoy embarazada, lo puedo tomar?" | canonical → uso_en_embarazo | ☐ | ☐ | |
| 3 | "se lo doy a mi hijo de 10?" | canonical → uso_en_ninos | ☐ | ☐ | |
| 4 | "tomo sertralina, hay problema?" | confidence bajo → handoff (sertralina NO está específicamente en KB) | ☐ | ☐ | |
| 5 | "tengo lupus, puedo?" | confidence bajo o medio → handoff o respuesta general (KB dice "autoinmunes" genérico) | ☐ | ☐ | |

### product (4)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 6 | "cómo se toma?" | generated → como_se_toma | ☐ | ☐ | |
| 7 | "qué ingredientes tiene?" | generated → formula | ☐ | ☐ | |
| 8 | "cuánto trae el frasco?" | generated → contenido | ☐ | ☐ | |
| 9 | "es adictivo?" | generated → dependencia | ☐ | ☐ | |

### policies (3)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 10 | "cuánto tarda a Medellín?" | generated → envio (mencionar día siguiente) | ☐ | ☐ | |
| 11 | "cómo pago?" | generated → pago | ☐ | ☐ | |
| 12 | "puedo devolverlo si no me sirve?" | generated → devoluciones | ☐ | ☐ | |

### faqs-no-templated (2)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 13 | "cuántas horas dura el efecto?" | generated → duracion_efecto | ☐ | ☐ | |
| 14 | "qué hábitos ayudan a dormir?" | generated → alternativas_naturales | ☐ | ☐ | |

### Casos negativos (3 — esperamos handoff silente)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 15 | "tengo apnea, puedo tomarlo?" | handoff silente (KB no tiene apnea) | ☐ | ☐ | |
| 16 | "envían a Miami?" | handoff silente (KB es Colombia-only) | ☐ | ☐ | |
| 17 | "puedo pagar con criptomonedas?" | handoff silente (KB no lista cripto) | ☐ | ☐ | |

### Smoke A — Resumen

```
LLM-Judge OK:   ___ / 17
Jose OK:        ___ / 17
LLM-Judge FAIL: ___ / 17 (revisar antes de Plan 06)
Jose FAIL:      ___ / 17 (bloqueante para Plan 08)
```

**Criterio de éxito:** ≥15/17 OK según Jose. Si <15, abrir Plan 07 (iter) antes de Plan 06.

---

## Smoke B — 10 casos (regression)

**Actualizá cuando corras Smoke B en Plan 06.**

### razonamiento_libre (3)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 1 | "qué pensás del insomnio?" | handoff silente (divagación, sin KB) | ☐ | ☐ | |
| 2 | "ayer fue un día raro, no pude dormir" | handoff o template empático | ☐ | ☐ | |
| 3 | "el sueño es interesante, no?" | handoff silente | ☐ | ☐ | |

### crm_mutation (3)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 4 | "dale, quiero comprar. mi dirección es X" | createOrder + template post-orden | ☐ | ☐ | |
| 5 | "movéme el pedido a confirmado" | moveOrderToStage + template | ☐ | ☐ | |
| 6 | "agregá una nota: cliente prefiere AM" | addOrderNote + confirmación | ☐ | ☐ | |

### state machine happy path (3 — NO debe disparar sub-loop)

| Caso | Pregunta del cliente | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 7 | "hola" | saludo template (sin sub-loop) | ☐ | ☐ | |
| 8 | "cuánto cuesta?" | precio template (sin sub-loop) | ☐ | ☐ | |
| 9 | "ya recibí el pedido" | confirmacion template (sin sub-loop) | ☐ | ☐ | |

### cas_reject (1 — mockeado)

| Caso | Escenario | Expected | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|
| 10 | Race condition: createOrder con stage_changed_concurrently | propaga error verbatim, agent decide handoff | ☐ | ☐ | |

### Smoke B — Resumen

```
LLM-Judge OK:   ___ / 10
Jose OK:        ___ / 10
LLM-Judge FAIL: ___ / 10
Jose FAIL:      ___ / 10 (bloqueante)
```

**Criterio de éxito:** ≥9/10 OK según Jose. Si <9, abrir Plan 07 (iter) antes de Plan 08.

---

## Decisiones críticas — quick reference

| ID | Decisión | Ver detalle |
|---|---|---|
| D-23 | Big-bang migración (18 KBs en un golpe) | DISCUSSION-LOG.md |
| D-24 | Borrar canonical verbatim + atómico Plan 02+03 | DISCUSSION-LOG.md |
| D-08 | Gemini Flash NORMAL para generación (Flash-Lite A/B pendiente) | DISCUSSION-LOG.md |
| D-13 | confidence = "¿la respuesta generada con SOLO el KB responde la pregunta?" | DISCUSSION-LOG.md |
| D-14 | threshold = 0.70 único | DISCUSSION-LOG.md |
| D-26 | Judge híbrido (LLM-as-judge + Jose revisa los 17) | DISCUSSION-LOG.md |
| D-29 | GSD completo obligatorio | DISCUSSION-LOG.md |

---

## Next action AHORA

**Próximo paso:** Correr research-phase formal.

```
/gsd:research-phase somnio-v4-rag-generative
```

El research-phase debe investigar:

1. **Limitación H-2 actualizada:** ¿Sigue Gemini API rechazando tools + Output combinados en 2026-05? Verificar contra docs oficiales de Google.
2. **Best practices de RAG generativo con AI SDK v6:** patrones canónicos, ejemplos de production-grade.
3. **Calibración de auto-reported confidence en LLMs:** cómo enseñar al modelo a dudar bien. Few-shots vs reglas vs scoring rubrics.
4. **Performance de Gemini Flash vs Flash-Lite en redacción matizada en español:** evidencia comparativa concreta.
5. **Pitfalls específicos:** schema parsing failures con Output.object, overconfidence en confidence reporting, timeouts en chains de 2 modelos.

Output esperado del research-phase: `RESEARCH.md` en esta carpeta.

---

## Notas para continuar después de `/clear`

1. **Lee este STATUS.md PRIMERO** — te dice exactamente dónde vamos.
2. Si phases están done sin commits, algo se cayó — revisar `git status`.
3. Si Smoke A o B tienen checkboxes incompletos, vení a marcarlos al volver.
4. CONTEXT.md tiene el qué/por qué. DISCUSSION-LOG.md tiene los D's locked.
5. v4 sigue dormant en producción durante todo — si en `routing_rules` aparece algo con `somnio-sales-v4`, ALGO se ejecutó sin autorización. Investigar.
6. **NO ejecutar nada de execute-phase sin haber leído el plan correspondiente.**
