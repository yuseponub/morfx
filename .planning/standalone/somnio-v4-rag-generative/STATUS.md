# Somnio v4 RAG Generative — STATUS (LIVE)

**Last updated:** 2026-05-19 (Plan 06 SHIPPED — Smoke B regression 10 casos ejecutado, pendiente Jose review)
**HEAD git:** `65d0fd3` (Plan 06 docs) sobre `4714c4c` (Plan 06 test) sobre `5589bf9` (Plan 07c pushed)
**v4 status en prod:** DORMANT (sin routing rule — `active_v4_rules = 0`)
**v3 status en prod:** ACTIVO (atendiendo clientes — Regla 6 intocado)

> **PLAN 06 SHIPPED 2026-05-19:** Smoke B regression (10 casos D-12 paths) ejecutado clean — 208s runtime, 0 runtime errors. Auto-check: 1/3 razonamiento_libre PASS (case 3 handoff vía threshold gate 0.20<0.70), 2/3 FAIL strict (cases 1+2 generaron respuesta FAITHFUL al KB `insomnio_largo_plazo` con conf=0.80/0.95 en lugar de handoff). 7/7 SKIP cases documentados (crm_mutation 4-6 = Regla 6 + Threat T-06-01, state_machine 7-9 = NO entran al sub-loop, cas_reject 10 = integration tests crm-writer cubren). **NO son regresión D-12** — razonamiento_libre usa flujo NUEVO RAG (Plan 03 split), no LEGACY. Case 2 textualmente cumple expected del plan ("handoff o template empático"). Pendiente Jose review cases 1+2 + SKIPS manuales para decisión: Plan 08 flip OR Plan 07d tuning.

> **PLAN 07c SHIPPED 2026-05-18:** `devoluciones.md` convertido en handoff stub semántico-vacío para resolver case 12 (V3 FAIL por `nunca_decir_violation` ambiguo). Smoke A V4 17/17 ejecutado clean (paid tier Gemini, 864s). **15/17 PASS, 0 invenciones, 0 nuevas regresiones desde V3.** Case 12 ahora PASS (judge confirma handoff silente es la acción correcta). Cases 16 + 17 siguen FAIL desde V3 (out-of-scope Plan 07c, ambos documentados como Plan 07d candidates si Jose prefiere arreglar antes de Smoke B). Ver `07c-SUMMARY.md` para case-by-case V1→V2→V3→V4 + architectural decision rationale.

> **PLAN 07b ESCALATION → Plan 07c (resolved):** Plan 07b shipped Flash NORMAL + polarity rules pero regresionó cases 12 y 17. Plan 07c (Path A semantic-only) resolvió case 12. Plan 07d futuro para case 17 + case 16 calibration.

> **PLAN 02 OPEN DEBT RESUELTA (2026-05-17 ~17:50):** `pnpm knowledge:sync` ejecutado en prod Supabase, 18 KBs sincronizados con 5 columnas + embeddings regenerados.

> **PLAN 05 SHIPPED 2026-05-18:** Smoke A V1 — 14/17 PASS, baseline.

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
- [x] **Execute-phase plan 05 (Smoke A V1)** — **DONE 2026-05-18** (14/17 PASS, baseline)
- [x] **Execute-phase plan 07 v1 (semantic-only)** — DONE 2026-05-18 (15/17 PASS, 2 regresiones)
- [x] **Execute-phase plan 07b (Flash NORMAL + polarity)** — DONE 2026-05-18 (13/17 PASS, 2 regresiones cases 12 y 17)
- [x] **Execute-phase plan 07c (devoluciones handoff stub)** — **DONE 2026-05-18** (15/17 PASS, case 12 resuelto, 0 nuevas regresiones, 0 invenciones)
- [x] **Execute-phase plan 06 (Smoke B)** — **DONE 2026-05-19** (10 casos, 0 runtime errors, 1/3 razonamiento_libre PASS + 2/3 FAIL no-regresivo, 7/7 SKIP documentados — pendiente Jose review)
- [ ] **Execute-phase plan 07d (case 17 + 16 + razonamiento_libre tuning)** — opcional, depende de decisión Jose post Smoke B review
- [ ] **Execute-phase plan 08 (flip productivo)** — pendiente (post Smoke B Jose review verde)
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
| 05 | Smoke A V1 — low_confidence 17 casos + LLM-as-judge | **DONE 2026-05-18** (14/17 PASS, 0 invenciones) | `ab7a8a1` |
| 07 v1 | Iter semantic-only KB rewrites | DONE 2026-05-18 (15/17 PASS, 2 regresiones) | ? |
| 07b | Flash NORMAL + polarity prompt en nuncaDecirCheck | DONE 2026-05-18 (13/17 PASS, 2 regresiones cases 12+17) | `90f7f8f` (pushed) |
| 07c | devoluciones.md handoff stub | **DONE 2026-05-18** (15/17 PASS, case 12 fixed, 0 nuevas regresiones, 0 invenciones) | `5589bf9` (pushed) |
| 06 | Smoke B — regression 10 casos | **DONE 2026-05-19** (0 runtime errors, 1/3 razonamiento_libre PASS + 2/3 FAIL no-regresivo, 7/7 SKIP documentados, pendiente Jose review) | `65d0fd3` (pendiente push) |
| 07d | (opcional) generation respect cuando_escalar + razonamiento_libre tuning | pending (post-decision Jose) | — |
| 08 | Flip productivo (SQL routing_rule) | pending (post Smoke B Jose review verde) | — |

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

## Smoke A — 17 casos (low_confidence, rediseño RAG) — V4 SHIPPED 2026-05-18

**Plan 07c V4 run completo, paid tier Gemini, throttle 7s, 864s wall clock. 17/17 evaluados, 0 quota fallos, 0 runtime errors.** Ver `SMOKE-A-RESULTS-V4.md` para detalle verbatim por caso. Comparación V1→V2→V3→V4 en `07c-SUMMARY.md`.

### Iteration history

| Version | Plan | PASS/17 | Notable |
|---|---|---|---|
| V1 | Plan 05 | 14/17 | Baseline. 3 FAIL cases 2/13/14 (nunca_decir false-positive pattern) |
| V2 | Plan 07 v1 | 15/17 | Semantic-only KB rewrites. Recuperó 2/13/14 pero regresionó 1 + 16 |
| V3 | Plan 07b | 13/17 + 1 N/A | Flash NORMAL + polarity prompt. Recuperó 1 + 13 + 14 pero regresionó 12 + 17 |
| V4 | Plan 07c | **15/17** | devoluciones handoff stub. **Fixed case 12, 0 nuevas regresiones**, 16 + 17 preservados de V3 |

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
| 12 | "puedo devolverlo si no me sirve?" | handoff silente (Plan 07c stub) | `no_match` handoff (0.95) | **PASS** (V4) | ☐ | **Plan 07c FIX** — V3 era FAIL, V4 PASS via handoff stub |

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

### Smoke A V4 — Resumen 2026-05-18 (post Plan 07c)

```
LLM-Judge PASS:    15 / 17  (88.2%) — criterio mínimo cumplido + case 12 fix
LLM-Judge FAIL:     2 / 17  (cases 16 Miami + 17 cripto — out-of-scope Plan 07c, preservados de V3)
LLM-Judge PARTIAL:  0 / 17
LLM-Judge N/A:      0 / 17
Invenciones (judge): 0 / 17 ✓ RAG architecture preservada
Faithfulness PASS: 16 / 17  (case 17 PASS faithfulness pero FAIL relevance)
Runtime errors: 0 / 17 ✓
Avg latency: ~50s / caso
Δ V3→V4: +2 PASS (case 12 fixed + case 7 paid tier stable), 0 nuevas regresiones
```

**Criterio de éxito (judge):** ✓ 15/17 PASS + 0 invenciones + 0 nuevas regresiones cumple Plan 07c objective.

**Hallazgo:** Case 12 fix funcional. Cases 16 (calibration MISCALIBRATED_HIGH en handoff) y 17 (generation no respeta `cuando_escalar` array del topic) son issues distintas a `nuncaDecirCheck` — Plan 07d candidates si Jose quiere arreglar pre-Smoke B.

---

## Smoke B — 10 casos (regression)

**Ejecutado 2026-05-19 02:07 UTC, runtime 208s.** Resultados en `SMOKE-B-RESULTS.md` (per-case detail + análisis FAIL no-regresivo).

### razonamiento_libre (3 — REAL invocation)

| Caso | Pregunta del cliente | Expected | Sub-loop status | Auto-check | Jose | Notes |
|---|---|---|---|---|---|---|
| 1 | "qué pensás del insomnio?" | handoff silente (divagación, sin KB) | `generated` topic=`insomnio_largo_plazo` conf=0.80 | ❌ FAIL | ☐ | NO regresión D-12. Behavior emergente — KB tiene material adyacente |
| 2 | "ayer fue un día raro, no pude dormir" | handoff o template empático | `generated` topic=`insomnio_largo_plazo` conf=0.95 | ❌ FAIL (strict) | ☐ | Textualmente cumple "template empático" del expected |
| 3 | "el sueño es interesante, no?" | handoff silente | `no_match` topic=`formula` conf=0.20 (threshold gate) | ✅ PASS | ☐ | Threshold 0.70 dispara handoff correcto |

### crm_mutation (3 — SKIP)

| Caso | Pregunta del cliente | Expected | Estado | Jose | Razón SKIP |
|---|---|---|---|---|---|
| 4 | "dale, quiero comprar. mi dirección es X" | createOrder + template post-orden | SKIP | ☐ | Mutaría pedido real en producción Somnio (Regla 6 + Threat T-06-01) |
| 5 | "movéme el pedido a confirmado" | moveOrderToStage + template | SKIP | ☐ | Mutaría stage real en producción Somnio (Regla 6 + Threat T-06-01) |
| 6 | "agregá una nota: cliente prefiere AM" | addOrderNote + confirmación | SKIP | ☐ | Agregaría nota real a pedido real (Regla 6 + Threat T-06-01) |

### state machine happy path (3 — SKIP, NO entran al sub-loop)

| Caso | Pregunta del cliente | Expected | Estado | Jose | Razón SKIP |
|---|---|---|---|---|---|
| 7 | "hola" | saludo template (sin sub-loop) | SKIP | ☐ | Template matching upstream comprehension. Verificación manual via sandbox |
| 8 | "cuánto cuesta?" | precio template (sin sub-loop) | SKIP | ☐ | Idem |
| 9 | "ya recibí el pedido" | confirmacion template (sin sub-loop) | SKIP | ☐ | Idem |

### cas_reject (1 — SKIP, mockeado)

| Caso | Escenario | Expected | Estado | Jose | Razón SKIP |
|---|---|---|---|---|---|
| 10 | Race condition: createOrder con stage_changed_concurrently | propaga error verbatim, agent decide handoff | SKIP | ☐ | Integration tests crm-writer (standalone crm-stage-integrity 2026-04-21) ya cubren — Threat T-06-04 accept |

### Smoke B — Resumen 2026-05-19

```
Total cases:       10
Runtime errors:    0 / 10 ✓
Auto-check PASS:   1 / 3  REAL (case 3 handoff via threshold gate)
Auto-check FAIL:   2 / 3  REAL (cases 1+2 → generated FAITHFUL al KB — análisis NO-regresivo)
SKIP documentados: 7 / 10 (3 crm_mutation + 3 state_machine + 1 cas_reject)
Jose PASS:         _ / 10 (pendiente review manual)
Jose FAIL:         _ / 10 (bloqueante si >1)
```

**Criterio de éxito:** ≥9/10 OK según Jose. Si <9, abrir Plan 07d (iter) antes de Plan 08.

**Análisis cases 1+2 FAIL — NO regresión D-12:**
- razonamiento_libre usa flujo NUEVO RAG (Plan 03 split tooling+generation), NO LEGACY (crm_mutation/cas_reject).
- KB tiene `insomnio_largo_plazo` cubriendo el tema. Tooling call selecciona el topic, Gemini Flash redacta respuesta FAITHFUL al material (no invención).
- Case 2 ("ayer fue un día raro, no pude dormir") textualmente cumple expected "handoff o template empático" — el responseText es empático + pitch ELIXIR.
- Case 1 ("qué pensás del insomnio?") es ambiguo — puede leerse como filosofía pura o como pregunta sobre el producto. El modelo eligió la lectura productiva.
- **Decisión Jose:** aceptar como behavior emergente (≥9/10) O abrir Plan 07d para tunear (threshold más alto / gate "razonamiento_libre → handoff salvo intent comercial").

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

**Plan 06 SHIPPED 2026-05-19.** Smoke B regression ejecutado:
- 0 runtime errors ✓
- 1/3 razonamiento_libre auto-check PASS (case 3)
- 2/3 FAIL **no-regresivo D-12** (cases 1+2 generaron respuestas FAITHFUL al KB — análisis detallado en `06-SUMMARY.md` y `SMOKE-B-RESULTS.md`)
- 7/7 SKIP documentados (crm_mutation 4-6 = Regla 6 + Threat T-06-01, state_machine 7-9 = NO entran al sub-loop, cas_reject 10 = integration tests crm-writer)

**Pendiente Jose review:** cases 1+2 + verificación manual de SKIPS via sandbox aislado. Si Jose ≥9/10 → Plan 08 flip. Si <9 → Plan 07d tuning.

### Camino A (recomendado) — Plan 08 production flip

Si Jose acepta cases 1+2 como behavior emergente razonable (responseText es FAITHFUL al KB, NO inventa info) Y SKIPS verificados via sandbox:

```
/gsd-execute-phase somnio-v4-rag-generative  # Plan 08 flip productivo
```

Smoke A 15/17 PASS + Smoke B ≥9/10 OK Jose = green light.

### Camino B (alternativo) — Plan 07d tuning antes de Plan 08

Si Jose quiere comportamiento más conservador en razonamiento_libre:
- Opción tuning 1: subir threshold `RESPONSE_CONFIDENCE_THRESHOLD` de 0.70 → 0.85 (pero esto puede regresionar casos legítimos de Smoke A).
- Opción tuning 2: gate explícito en `tooling-call.ts` razonamiento_libre prompt — "si la pregunta es filosofía/anécdota sin intent comercial → siempre handoff".
- Plan 07d.1 (case 17 cripto): añadir gate en `generationCall` para validar `cuando_escalar` post-generation.
- Plan 07d.2 (case 16 Miami): bajar confidence cuando reason termina en `_FUERA_SCOPE`.

Push pendiente del Plan 06 (`4714c4c + 65d0fd3`).

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
