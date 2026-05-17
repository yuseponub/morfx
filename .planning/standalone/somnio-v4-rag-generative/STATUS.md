# Somnio v4 RAG Generative — STATUS (LIVE)

**Last updated:** 2026-05-16 (Plan 01 SHIPPED post-Task 1.6)
**HEAD git:** pendiente push (commit final Task 1.7)
**v4 status en prod:** DORMANT (sin routing rule — `active_v4_rules = 0`)
**v3 status en prod:** ACTIVO (atendiendo clientes — Regla 6 intocado)

---

## PHASES — checklist alto nivel

- [x] **Discuss-phase informal** (sesión 2026-05-15/16, 30 D's capturados en `DISCUSSION-LOG.md`)
- [x] **Standalone setup** (CONTEXT.md + DISCUSSION-LOG.md + este STATUS.md)
- [x] **Research-phase** (`RESEARCH.md` shipped)
- [x] **Plan-phase** (planes 01..08 committeados)
- [x] **Execute-phase plan 01** — **DONE 2026-05-16** (6 commits, migración aplicada en prod, 32/32 tests verdes)
- [ ] **Execute-phase plan 02** — NEXT (atómico con 03)
- [ ] **Execute-phase plan 03** — NEXT (atómico con 02)
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
| 01 | KB schema update (parser, sync, RPC, migración DB) | **DONE 2026-05-16** | `b6c6e20` (tests) — final commit Task 1.7 pendiente push |
| 02 | Reescribir 18 KBs en formato nuevo | pending | — |
| 03 | Sub-loop split tooling/generación + borrar canonical (ATÓMICO con 02) | pending | — |
| 04 | Few-shots calibración Gemini Flash | pending | — |
| 05 | Smoke A — low_confidence 17 casos + LLM-as-judge | pending | — |
| 06 | Smoke B — regression 10 casos | pending | — |
| 07 | Iter sobre smoke results (HOLD) | hold | — |
| 08 | Flip productivo (SQL routing_rule) | pending | — |

---

## Plan 01 SHIPPED — resumen

**Migración aplicada en prod Supabase 2026-05-16 (Regla 5).** 5 columnas nuevas + RPC con RETURNS shape extendido. Parser TS reconoce 5 markdown headers nuevos + `tone_override` frontmatter (D-05). Sync upsertea las 5 columnas + `canonical_response = null` para somnio-v4 (D-24). Coherence-check valida secciones + prefijos `[SIEMPRE]/[SI APLICA]` (D-03). 32/32 tests verdes (15 parser + 17 coherence-check).

Commits Plan 01 (6 total + Task 1.7 push):

1. `c55aed4` Task 1.1 — parser.ts
2. `d35f645` Task 1.2 — sync.ts
3. `f7d666b` Task 1.3 — coherence-check.ts
4. `eea5e14` Task 1.4 — migración SQL
5. `b6c6e20` Task 1.6 — tests
6. **(Task 1.7)** docs SUMMARY + STATUS + STATE — final push commit

Ver `01-SUMMARY.md` para detalle completo, los 4 verify queries de Regla 5 y plan de continuación.

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

**Próximo paso:** Ejecutar Plans 02 + 03 atómico (Wave 2).

```
/gsd-execute-phase somnio-v4-rag-generative --wave 2
```

Plans 02 (reescritura de 18 KBs en formato nuevo) y 03 (sub-loop split tooling/generación + borrar canonical) son **atómicos por D-23 + D-24**:
- Plan 03 borra el canonical_response del sub-loop runtime.
- Plan 02 puebla las 5 columnas nuevas con material fuente (Hechos / Posición / Debe contener / NUNCA / Cuándo escalar).
- Push de Plan 03 SIN Plan 02 deja v4 sin nada para generar respuestas — los 18 KBs en prod tienen las 5 columnas nuevas como `null/[]` post-Plan 01.

**Verificaciones disponibles tras Plans 02+03:**

```sql
-- 1. Las 5 columnas pobladas para somnio-v4:
SELECT topic, jsonb_pretty(jsonb_build_object(
  'hechos', hechos_del_producto IS NOT NULL,
  'posicion', posicion_del_negocio IS NOT NULL,
  'debe_contener', array_length(debe_contener, 1) > 0,
  'nunca_decir', array_length(nunca_decir, 1) > 0,
  'cuando_escalar', array_length(cuando_escalar, 1) > 0
))
FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4';
-- Esperado: 18 rows con todos los flags 'true' en hechos/posicion/debe_contener.

-- 2. v4 sigue dormant:
SELECT count(*) FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND active=true AND event::text LIKE '%somnio-sales-v4%';
-- Esperado: 0.
```

---

## Notas para continuar después de `/clear`

1. **Lee este STATUS.md PRIMERO** — te dice exactamente dónde vamos.
2. Si phases están done sin commits, algo se cayó — revisar `git status`.
3. Si Smoke A o B tienen checkboxes incompletos, vení a marcarlos al volver.
4. CONTEXT.md tiene el qué/por qué. DISCUSSION-LOG.md tiene los D's locked.
5. v4 sigue dormant en producción durante todo — si en `routing_rules` aparece algo con `somnio-sales-v4`, ALGO se ejecutó sin autorización. Investigar.
6. **NO ejecutar nada de execute-phase sin haber leído el plan correspondiente.**
