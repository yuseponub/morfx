# Somnio v4 RAG Generative — STATUS (LIVE)

**Last updated:** 2026-05-18 (Plan 05 SHIPPED — Smoke A 17/17 evaluados, 14 PASS / 3 FAIL pattern)
**HEAD git:** pendiente push Plan 04 + Plan 05 (4 commits Plan 05 — 5.1 + 5.2 + 5.3 throttle + 5.6-5.9 docs)
**v4 status en prod:** DORMANT (sin routing rule — `active_v4_rules = 0`)
**v3 status en prod:** ACTIVO (atendiendo clientes — Regla 6 intocado)

> **PLAN 02 OPEN DEBT RESUELTA (2026-05-17 ~17:50):** `pnpm knowledge:sync` ejecutado en prod Supabase, 18 KBs sincronizados con 5 columnas + embeddings regenerados. Smoke A 2026-05-18 corrió contra material populado correctamente — judge confirmó faithfulness 17/17.

> **PLAN 05 SHIPPED 2026-05-18:** Smoke A clean re-run completo (paid tier Gemini, throttle 7s residual). 14/17 PASS, 3/17 FAIL con patrón único `nunca_decir_violation` false-positive (cases 2 embarazo, 13 duracion_efecto, 14 habitos_sueno). **0 invenciones** detectadas por judge en 17/17 casos — RAG architecture sin alucinaciones, faithfulness 100%. Ver `SMOKE-A-RESULTS.md` para detalle + Decision Checklist + análisis Plan 07 recomendado.

---

## PHASES — checklist alto nivel

- [x] **Discuss-phase informal** (sesión 2026-05-15/16, 30 D's capturados en `DISCUSSION-LOG.md`)
- [x] **Standalone setup** (CONTEXT.md + DISCUSSION-LOG.md + este STATUS.md)
- [x] **Research-phase** (`RESEARCH.md` shipped)
- [x] **Plan-phase** (planes 01..08 committeados)
- [x] **Execute-phase plan 01** — **DONE 2026-05-16** (6 commits, migración aplicada en prod, 32/32 tests verdes)
- [x] **Execute-phase plan 02** — **DONE 2026-05-16** (3 commits, 18 KBs reescritos, DB sync DEFERIDO — ver 03-SUMMARY "Open debt")
- [x] **Execute-phase plan 03** — **DONE 2026-05-16** (9 commits + 1 docs, sub-loop RAG-generative split, push atómico con 02)
- [x] **Execute-phase plan 04** — **DONE 2026-05-17** (3 commits + 1 docs, FEW_SHOTS calibration wired, 19/19 tests verdes)
- [x] **Execute-phase plan 05 (Smoke A)** — **DONE 2026-05-18** (4 commits, 17/17 evaluados, judge 14 PASS / 3 FAIL same pattern, **0 invenciones**, paid tier Gemini)
- [ ] **Execute-phase plan 07 (iter — nunca_decir guardrail)** — RECOMENDADO antes de Plan 06 (3/3 FAILs son `nunca_decir_violation` false-positives — ver SMOKE-A-RESULTS.md analysis)
- [ ] **Execute-phase plan 06 (Smoke B)** — pendiente (post Plan 07 iter)
- [ ] **Execute-phase plan 08 (flip productivo)** — pendiente (post Plan 06 verde)
- [ ] **Verify-phase** — pendiente
- [ ] **LEARNINGS.md** — pendiente

---

## Plans status

| Plan | Título | Status | HEAD |
|---|---|---|---|
| 01 | KB schema update (parser, sync, RPC, migración DB) | **DONE 2026-05-16** | `728ac6a` |
| 02 | Reescribir 18 KBs en formato nuevo | **DONE 2026-05-16** | `a8313b1` (atomic con Plan 03) |
| 03 | Sub-loop split tooling/generación + borrar canonical (ATÓMICO con 02) | **DONE 2026-05-16** | `a165c8f` (push 2026-05-17) |
| 04 | Few-shots calibración Gemini Flash | **DONE 2026-05-17** | `15f8bbf` (last task commit) |
| 05 | Smoke A — low_confidence 17 casos + LLM-as-judge | **DONE 2026-05-18** (14/17 judge PASS, 0 invenciones, 3 FAILs nunca_decir pattern) | `ab7a8a1` (5.3 throttle) + docs commit |
| 07 | Iter nunca_decir guardrail (refinar `nuncaDecirCheck`) | RECOMENDADO post Smoke A | — |
| 06 | Smoke B — regression 10 casos | pending (post Plan 07) | — |
| 08 | Flip productivo (SQL routing_rule) | pending (post Plan 06) | — |

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

## Smoke A — 17 casos (low_confidence, rediseño RAG) — SHIPPED 2026-05-18

**Run completo, paid tier Gemini, throttle 7s residual. 17/17 evaluados, 0 quota fallos, 0 runtime errors.** Ver `SMOKE-A-RESULTS.md` para detalle verbatim por caso (responseText + judge reasoning + confidenceRationale + topic material populated).

### edge-cases (5)

| Caso | Pregunta del cliente | Expected | Sub-loop status | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|---|
| 1 | "puedo si tomo alcohol?" | generated → interaccion_alcohol | `generated` (0.95) | **PASS** | ☐ | CALIBRATED, sin invenciones |
| 2 | "estoy embarazada, lo puedo tomar?" | generated → uso_en_embarazo | `no_match` nunca_decir | **FAIL** | ☐ | nunca_decir false-positive — Plan 07 candidate |
| 3 | "se lo doy a mi hijo de 10?" | generated → uso_en_ninos | `generated` (0.95) | **PASS** | ☐ | CALIBRATED, sin invenciones |
| 4 | "tomo sertralina, hay problema?" | confidence bajo → handoff | `no_match` handoff (0.95) | **PASS** | ☐ | handoff apropiado (KB no tiene sertralina) |
| 5 | "tengo lupus, puedo?" | confidence bajo o medio → handoff o respuesta general | `generated` (0.95) `contraindicaciones` | **PASS** | ☐ | extrapoló "autoinmunes" → judge PASS |

### product (4)

| Caso | Pregunta del cliente | Expected | Sub-loop status | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|---|
| 6 | "cómo se toma?" | generated → como_se_toma | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |
| 7 | "qué ingredientes tiene?" | generated → formula | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |
| 8 | "cuánto trae el frasco?" | generated → contenido | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |
| 9 | "es adictivo?" | generated → dependencia | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |

### policies (3)

| Caso | Pregunta del cliente | Expected | Sub-loop status | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|---|
| 10 | "cuánto tarda a Medellín?" | generated → envio (mencionar día siguiente) | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |
| 11 | "cómo pago?" | generated → pago | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |
| 12 | "puedo devolverlo si no me sirve?" | generated → devoluciones | `generated` (0.95) | **PASS** | ☐ | CALIBRATED |

### faqs-no-templated (2)

| Caso | Pregunta del cliente | Expected | Sub-loop status | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|---|
| 13 | "cuántas horas dura el efecto?" | generated → duracion_efecto | `no_match` nunca_decir | **FAIL** | ☐ | nunca_decir false-positive ("prometer número fijo") — Plan 07 candidate |
| 14 | "qué hábitos ayudan a dormir?" | generated → alternativas_naturales | `no_match` nunca_decir | **FAIL** | ☐ | nunca_decir false-positive ("recomendar otros consumibles") — Plan 07 candidate |

### Casos negativos (3 — esperamos handoff silente)

| Caso | Pregunta del cliente | Expected | Sub-loop status | LLM-Judge | Jose | Notes |
|---|---|---|---|---|---|---|
| 15 | "tengo apnea, puedo tomarlo?" | handoff silente (KB no tiene apnea) | `no_match` handoff (0.40) | **PASS** | ☐ | Handoff silente correcto |
| 16 | "envían a Miami?" | handoff silente (KB es Colombia-only) | `no_match` handoff (0.20) | **PASS** | ☐ | Handoff silente correcto |
| 17 | "puedo pagar con criptomonedas?" | handoff silente (KB no lista cripto) | `generated` (0.95) `pago` | **PASS** | ☐ | Behavior emergente: respuesta constructiva con material `pago` adyacente |

### Smoke A — Resumen 2026-05-18

```
LLM-Judge PASS:    14 / 17  (82.4%) — criterio mínimo cumplido
LLM-Judge FAIL:     3 / 17  (cases 2, 13, 14 — todos `nunca_decir_violation` false-positive)
LLM-Judge PARTIAL:  0 / 17
Invenciones (judge): 0 / 17 ✓ RAG architecture sin alucinaciones
Faithfulness PASS: 17 / 17  (100% — generation no inventa)
Calibration CALIBRATED: 14 / 17
Calibration MISCALIBRATED_HIGH: 3 / 17 (mismas 3 FAILs)
Runtime errors: 0 / 17 ✓
Avg latency: 37.1s / caso (tooling + generation + judge)
Jose OK:           ___ / 17  (pendiente revisión manual)
Jose FAIL:         ___ / 17  (bloqueante para Plan 08)
```

**Criterio de éxito (judge):** ✓ 14/17 PASS + 0 invenciones cumple criterio mínimo.

**Hallazgo crítico:** Los 3 FAILs comparten patrón único — `nuncaDecirCheck` guardrail dispara false-positive con string match plano que ignora polaridad. Recomendación: **Plan 07 iter para refinar el check ANTES de Plan 06 (Smoke B)**. Si no, Smoke B tendrá los mismos falsos-positivos.

**Negativos:** 2/3 handoff silente correcto (15, 16) + 1/3 respuesta constructiva con material adyacente (17 → pago). Judge confirmó los 3 PASS.

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

**Plan 05 (Smoke A) SHIPPED 2026-05-18.** Resultados completos en `SMOKE-A-RESULTS.md` y `05-SUMMARY.md`.

**Próximo paso recomendado:** Jose revisa los 17 casos manualmente en `SMOKE-A-RESULTS.md` (Jose final ☐ checkbox por caso). Después decidir camino:

### Camino A (recomendado) — Plan 07 iter antes de Plan 06

Si Jose confirma que los 3 FAILs (cases 2, 13, 14) son realmente `nunca_decir_violation` false-positives:

1. Definir el alcance de Plan 07 (opciones A/B/C en `SMOKE-A-RESULTS.md` per-case failure analysis).
2. Discuss + research + plan-phase Plan 07.
3. Ejecutar Plan 07 (refinar `nuncaDecirCheck`).
4. Re-correr Smoke A (espera-se 17/17 PASS post-fix).
5. Después Plan 06 (Smoke B).

### Camino B — si Jose decide que 14/17 es suficiente para Smoke B

```
/gsd-execute-phase somnio-v4-rag-generative --wave 4  # Plan 06
```

Pero los falsos-positivos del nunca_decir van a reaparecer en Smoke B (los 10 casos tocan los mismos topics). Espera más FAILs si no se arregla primero.

### v4 sigue dormant — verificar antes de push

```sql
-- v4 sigue dormant:
SELECT count(*) FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND active=true AND event::text LIKE '%somnio-sales-v4%';
-- Esperado: 0.

-- KB sync sigue válido:
SELECT count(*) FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4'
  AND hechos_del_producto IS NOT NULL
  AND posicion_del_negocio IS NOT NULL;
-- Esperado: 18.
```

---

## Notas para continuar después de `/clear`

1. **Lee este STATUS.md PRIMERO** — te dice exactamente dónde vamos.
2. Si phases están done sin commits, algo se cayó — revisar `git status`.
3. Si Smoke A o B tienen checkboxes incompletos, vení a marcarlos al volver.
4. CONTEXT.md tiene el qué/por qué. DISCUSSION-LOG.md tiene los D's locked.
5. v4 sigue dormant en producción durante todo — si en `routing_rules` aparece algo con `somnio-sales-v4`, ALGO se ejecutó sin autorización. Investigar.
6. **NO ejecutar nada de execute-phase sin haber leído el plan correspondiente.**
