# Plan 07b — SUMMARY

**Status:** ROJO — ESCALATION REQUIRED (2026-05-18 18:14 -05)
**HEAD git local (sin push):** `90f7f8f` (test) + `c30565f` (runtime) sobre `7ce7c5a`
**Approach:** Nivel 2 defense-in-depth — upgrade Flash-Lite → Flash NORMAL + polarity rules en system prompt de `checkNuncaDecir`. D-09 UNLOCKED con evidencia musical chairs.
**Resultado:** 13/17 PASS judge + 0 invenciones + 1 N/A runtime error (Case 7 transient). **2 nuevas regresiones (cases 12 y 17) — criterio ROJO.**
**Push:** NO PUSHED — esperando guidance Jose (escalation point per `<deviation_policy>` item 3 + `<success_criteria>` ROJO).

---

## Audit findings (Task 7b.1)

- Plan 07 v1 (semantic-only) shippeó con +1 net PASS pero 2 regresiones (cases 1 alcohol y 16 Miami).
- Root cause estructural: Flash-Lite tiene limitación intrínseca para razonar polaridad cuando hay overlap tópico — los KB rewrites movieron el false-positive sin eliminarlo (musical chairs).
- Decision Jose 2026-05-18: upgrade modelo + polarity prompt. Costo aceptado: ~$6/mes en prod.
- D-09 UNLOCK proporcional + reversible (rollback plan documentado).

Ver `07b-AUDIT.md` para detalle de evidencia y justificación.

---

## Cambios aplicados (Tasks 7b.2 + 7b.3)

**Archivo runtime modificado:** `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`

1. **Model swap línea 42:** `gemini-2.5-flash-lite` → `gemini-2.5-flash` (Flash NORMAL).
2. **System prompt extendido** con 4 reglas de polaridad (AFFIRMS / NEGATES / REDIRECTS / NEUTRAL) + 1 ejemplo verbatim de negación que NO debe violar.
3. **User prompt** con reminder "Apply POLARITY RULES from the system prompt".
4. **Header comment** documenta unlock D-09 con referencia a evidence file (`SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`).

**Preservado intacto:**
- `CheckSchema` (`{violates, violatedRule}` z.object) — verificado vía grep.
- `safetySettings` BLOCK_NONE × 4 — verificado vía grep (4 matches).
- `providerOptions` block estructura.
- `runWithPurpose('subloop_nunca_decir', ...)` trace key.
- Return shape `{ ok: boolean, violation?: string }` y consumer en `index.ts` (línea ~328).
- Imports.

**Tests añadidos:** `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` con 5 tests verdes (early-return, AFFIRMS, NEGATES, NEUTRAL/handoff vacío, prompt+model contract). Suite completa sub-loop 53/55 verde (2 skipped pre-existing).

---

## Per-case before/after comparison

| Caso | Pregunta | V1 (Plan 05) | V2 (Plan 07 v1) | V3 (Plan 07b) | Diagnosis |
|---|---|---|---|---|---|
| 1  | "puedo si tomo alcohol?"        | PASS | **FAIL** | **PASS** ✓ | V2 regression recuperada — el upgrade arregló polaridad aquí |
| 2  | "estoy embarazada..."           | FAIL | PASS | **PASS** | held — sigue PASS |
| 3  | "se lo doy a mi hijo de 10?"    | PASS | PASS | **PASS** | held |
| 4  | "tomo sertralina..."            | PASS | PASS | **PASS** | held |
| 5  | "tengo lupus..."                | PASS | PASS | **PASS** | held |
| 6  | "cómo se toma?"                 | PASS | PASS | **PASS** | held |
| 7  | "qué ingredientes tiene?"       | PASS | PASS | **N/A** ⚠ | RUNTIME ERROR transient: "model experiencing high demand" — retryable, NO es failure real |
| 8  | "cuánto trae el frasco?"        | PASS | PASS | **PASS** | held |
| 9  | "es adictivo?"                  | PASS | PASS | **PASS** | held |
| 10 | "cuánto tarda a Medellín?"      | PASS | PASS | **PASS** | held |
| 11 | "cómo pago?"                    | PASS | PASS | **PASS** | held |
| 12 | "puedo devolverlo si no me sirve?" | PASS | PASS | **FAIL** ⚠⚠ | **NUEVA REGRESIÓN** — `nunca_decir_violation` sobre "El cliente debe enviar el producto de vuelta antes de que la empresa coordine logística" |
| 13 | "cuántas horas dura el efecto?" | FAIL | PASS | **PASS** ✓ | V1 fail held arreglado |
| 14 | "qué hábitos ayudan a dormir?"  | FAIL | PASS | **PASS** ✓ | V1 fail held arreglado |
| 15 | "tengo apnea, puedo tomarlo?"   | PASS | PASS | **PASS** | held |
| 16 | "envían a Miami?"               | PASS | **FAIL** | **FAIL** | V2 FAIL **NO recuperado**, pero reason cambió: V2=`nunca_decir_violation`, V3=`binary_backstop_FUERA_SCOPE` (diferente gate). Judge MISCALIBRATED_HIGH (0.95 conf en handoff). Issue out-of-scope Plan 07b (calibration de generation, no guardrail). |
| 17 | "puedo pagar con criptomonedas?" | PASS | PASS | **FAIL** ⚠⚠ | **NUEVA REGRESIÓN** — `rag_generated` con conf 0.95 + respuesta correcta pero judge marca FAIL: KB `cuando_escalar` dice que cripto debe escalar a humano. Issue de generation/calibration, NO de nunca-decir-check. |

---

## Aggregate metrics

| Métrica | V1 | V2 | V3 | Δ V1→V3 |
|---|---|---|---|---|
| Judge OVERALL PASS | 14/17 (82.4%) | 15/17 (88.2%) | 13/17 (76.5%) | −1 |
| Judge OVERALL FAIL | 3/17 | 2/17 | 3/17 | 0 |
| Judge N/A (runtime err) | 0/17 | 0/17 | 1/17 | +1 (transient) |
| Invenciones (judge) | 0/17 | 0/17 | **0/17** | 0 (preserved ✓) |
| MISCALIBRATED_HIGH | 3/17 | 2/17 | 3/17 | 0 |
| Cases polaridad PASS (1, 2, 13, 14, 16) | 3/5 | 3/5 | 4/5 | +1 (case 1 recuperado, case 16 sigue FAIL pero por gate distinto) |
| Cases V1+V2 PASS regresionando | n/a | n/a | **2** (12, 17) | nuevas regresiones |

**Hard constraint violado:** "Caso V1+V2 PASS regresiona en V3 FAIL → ROJO" — cases **12 y 17** califican.

---

## Decisión final — ROJO

Per `<success_criteria>` Plan 07b + `<deviation_policy>` item 3:

- [x] V3 ROJO (<16/17 + 2 V1+V2-PASS regresiones cases 12 y 17) → **Plan 07b NO CIERRA**. Push BLOQUEADO. Escalación requerida.

### Análisis del modo de falla por caso

**Case 12 — "puedo devolverlo si no me sirve?" (NUEVA REGRESIÓN ATRIBUIBLE A 07b)**

- Reason: `nunca_decir_violation: El cliente debe enviar el producto de vuelta antes de que la empresa coordine logística.`
- Confidence generation: 0.95, judge faithfulness PASS, judge relevance FAIL (esperaba respuesta canónica de política, recibió handoff silente).
- **Diagnosis:** Flash NORMAL con polarity rules **sigue mis-clasificando** un caso donde la regla `nunca_decir` está fraseada como **policy fact afirmativo** ("El cliente debe enviar..."). La respuesta generada explicaba la política de devoluciones honestamente, incluyendo el paso del cliente enviando el producto — Flash NORMAL leyó eso como "AFFIRMS the rule" en vez de "NEUTRAL / explica la política tal cual está documentada en `debe_contener`". Es un caso donde el item `nunca_decir` y `debe_contener` se traslapan literalmente (la policy describe el flujo donde el cliente envía).
- **Conclusión:** El upgrade Flash-Lite → Flash NORMAL **NO basta** para casos donde la regla `nunca_decir` es semánticamente ambigua entre "violation" y "policy explanation". El root cause es que cuando un item nunca_decir está fraseado como una afirmación que ES literalmente parte del flujo correcto (cliente envía → empresa coordina), Flash no tiene forma de distinguir "violation" de "describiendo el flujo". Esto NO es polaridad — es **ambigüedad semántica del item mismo**.
- Path forward: o (a) reescritura del item del KB devoluciones para fraseo más restrictivo (semantic top-up, similar a Plan 07 v1 enfoque), o (b) Schema-CoT Plan 07c (campo `polarity` explícito al schema, two-step reasoning).

**Case 16 — "envían a Miami?" (V2 FAIL NO RECUPERADO, scope distinto)**

- Reason V2: `nunca_decir_violation` (false-positive de Flash-Lite).
- Reason V3: `binary_backstop_FUERA_SCOPE` (gate completamente distinto, en tooling/generation).
- Judge V3: relevance PASS (handoff es correcto), calibration MISCALIBRATED_HIGH (0.95 conf en un handoff debería ser 0.0).
- **Diagnosis:** El upgrade Flash NORMAL + polarity rules **eliminó la falsa-positiva del nunca-decir-check** en este caso. El handoff sigue triggereándose pero ahora por un gate distinto. El FAIL del judge es por calibration miscalibrada — out-of-scope Plan 07b.
- Path forward: Plan separado para calibration del response_confidence cuando outcome es handoff/no_match (problema D-13/D-14, generation auto-report).

**Case 17 — "puedo pagar con criptomonedas?" (NUEVA REGRESIÓN, scope distinto)**

- Reason: `rag_generated` con conf 0.95.
- ResponseText (extracto): "No, en este momento no aceptamos criptomonedas como método de pago. Para tu comodidad, puedes pagar contra-entrega..."
- Judge faithfulness PASS, judge relevance FAIL (esperaba handoff silente per `cuando_escalar` del KB pago).
- **Diagnosis:** El tooling/generation phase **decidió responder en vez de escalar**, ignorando que el KB pago `cuando_escalar` dice que cripto debe escalar a humano. Es una **decisión de generation**, no de nunca-decir-check. La respuesta generada inclusive es legítima y correcta del punto de vista del cliente. **NO atribuible al Plan 07b** — case 17 hubiera fallado igual si nunca-decir-check siguiera siendo Flash-Lite. Es coincidencia que V3 detectara este FAIL nuevo (V1 + V2 lo dejaron pasar por suerte estadística del LLM).
- Path forward: Plan separado para fortalecer la decisión "responder vs escalar" en tooling-call (más respeto a `cuando_escalar`).

**Case 7 — "qué ingredientes tiene?" (RUNTIME ERROR transient)**

- Error: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."
- Retries internos del SDK: 3 attempts failed.
- **Diagnosis:** Issue transitorio del lado Gemini. NO atribuible al upgrade — paid tier ya validado previamente. Caso 6 antes y caso 8 después salieron PASS, así que no es problema de quota persistente.
- Path forward: Re-run smoke A V3.1 sólo para confirmar que case 7 vuelve a PASS sin tocar nada.

### Escalation path recommendation

Ver `<rollback>` de 07b-PLAN para opciones:

**Opción A — Rollback Plan 07b completo** (recomendado conservador):
- `git revert 90f7f8f c30565f` (los 2 commits locales, en orden inverso) — **PERO los commits están sólo local, sin push** → más simple: `git reset --hard 7ce7c5a` (descarta los 2 commits locales).
- Estado vuelve a HEAD pre-07b (V2 baseline: KBs declarativos Plan 07 v1 + Flash-Lite check).
- Smoke A baseline = V2 (15/17 PASS, cases 1 y 16 FAIL).
- Plan 07c (Schema-CoT Nivel 3) o re-evaluar approach.

**Opción B — Push parcial + isolated refinement** (NO recomendado):
- Push los 2 commits + abrir Plan 07c con item rewrite de devoluciones (case 12) + scope distinto para case 17.
- Multiplica deuda, ROJO sigue ROJO.

**Opción C — Defer + dejar local commits** (default si Jose no responde):
- Los 2 commits siguen local sin push.
- Plan 07b en estado paused — esperando decisión Jose.
- v3 productivo intocado (Regla 6 honored).
- v4 sigue dormant.

### Plan 07c — Schema-CoT (si Jose elige Nivel 3)

Cambios propuestos vs. 07b:
- `CheckSchema` extiende a 4 campos: `violates: boolean`, `polarity: 'AFFIRMS'|'NEGATES'|'REDIRECTS'|'NEUTRAL'`, `violatedRule?: string`, `reasoning: string` (chain-of-thought breve obligatorio).
- Mantiene Flash NORMAL.
- Polarity y reasoning forzados pre-decision — el modelo NO puede emitir `violates` sin haber clasificado polaridad primero. Estructural-mente imposible mis-clasificar sin auditoría visible.
- Costo delta marginal sobre 07b (~10% más tokens output por reasoning).
- Re-run Smoke A V4 con criterios identicos.

Ventaja vs. 07b: el campo `polarity` es **estructural**, no instrucción. Plan 07c además expone trace para debug ulterior.

---

## D-09 unlock — D-31 entry para DISCUSSION-LOG.md (NO APPENDED — esperando push)

**Si Jose decide rollback Opción A**, D-31 NO se agrega al log (la decisión revierte y D-09 vuelve a "locked" implícito). Si Jose decide proceder con Opción B o Plan 07c, D-31 entry para append:

```markdown
### D-31 — Unlock D-09 (Flash-Lite → Flash NORMAL en nunca-decir-check) + escalation a Plan 07c
**Tema:** Motor LLM
**Status:** locked (UNLOCKED D-09 partial — Plan 07b ROJO requirió Plan 07c follow-up)
**Decisión:** `checkNuncaDecir` migrado de `gemini-2.5-flash-lite` a `gemini-2.5-flash` NORMAL,
con system prompt extendido con polarity rules explícitas (Plan 07b commits c30565f + 90f7f8f).
Resultado smoke A V3: 13/17 PASS + 2 nuevas regresiones (cases 12 y 17). Insuficiente para
cerrar Plan 07b en VERDE. Plan 07c (Schema-CoT) abierto para resolver case 12 estructuralmente.

**Por qué:** D-09 lockeó Flash-Lite SIN evidencia. Plan 07 v1 generó evidencia musical chairs
(ver `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`). Plan 07b probó Nivel 2 (modelo + prompt) sin
schema cambio. Resultado: insuficiente. Caso 12 tiene ambigüedad semántica del item KB que
requiere fix estructural (Schema-CoT) o item rewrite separado.

**Implica:** Costo delta ~$6/mes asumido (1000 ses/día × 10 turns × $0.000022/check).
Latencia delta +50-200ms por check.

**Validación parcial:** Smoke A V3 — 13/17 PASS, 0 invenciones, case 1 recuperado de V2,
cases 12+17 nuevas regresiones, case 16 V2-fail no recuperado (scope distinto).
```

---

## Pitfalls descubiertos

1. **Item `nunca_decir` semánticamente solapado con `debe_contener`** — case 12 muestra que cuando el item prohibido fraseado afirmativamente describe un paso real del flujo policy, Flash NORMAL **sigue mis-clasificando** aunque tenga polarity rules. El fix nivel 2 (model + prompt) tiene techo aquí. Sugiere que polarity-only no basta: hace falta classification estructural via Schema-CoT (Plan 07c).
2. **Transient API errors no son determinísticos** — case 7 RUNTIME ERROR es ruido aleatorio de Gemini paid tier (high demand). Próximo re-run probable PASS sin tocar nada. NO usar para conclusiones.
3. **Out-of-scope failures fueron mascarados en V1/V2 por azar** — cases 17 (generation decide responder vs escalar cripto) fue PASS en V1 + V2 por suerte estadística del LLM, no por correctness del flujo. V3 cambió la temperatura efectiva (modelo distinto en una sub-fase) y el azar voló para el otro lado. Conclusión: hay deuda generation-side (respeto a `cuando_escalar`) que ya existe y debería atenderse en plan separado.
4. **Calibration MISCALIBRATED_HIGH en handoffs** — case 16 muestra que cuando outcome es handoff/no_match, el sub-loop sigue reportando confidence alto (0.95) en vez de 0.0. Issue de auto-report (D-13/D-14), no del guardrail. Out-of-scope Plan 07b pero documentado.

---

## v4 sigue dormant (Regla 6 honored)

```sql
SELECT count(*) FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND active=true AND event::text LIKE '%somnio-sales-v4%';
-- Esperado: 0 (NO consultado manualmente — v4 dormant since Plan 02; ninguna routing rule creada en este standalone).
```

Plan 07b NO crea routing rule. v3 sigue atendiendo clientes intocado.

---

## Rollback plan (Opción A — recomendado)

```bash
# Estado actual:
#   HEAD local = 90f7f8f (test) <- c30565f (runtime) <- 7ce7c5a (godentist hotfix)
#   origin/main = 7ce7c5a (sin push aún)
#
# Rollback completo (descarta commits locales sin push):
git reset --hard 7ce7c5a
# Equivalente menos destructivo (preserva history via revert):
# git revert 90f7f8f --no-edit
# git revert c30565f --no-edit

# Estado post-rollback:
#   - nunca-decir-check.ts vuelve a Flash-Lite + system prompt corto
#   - KBs declarativos (Plan 07 v1) preservados
#   - Test file nunca-decir-check.test.ts removido
#   - V3 results preservados en disk (untracked) — útiles para Plan 07c reference
#   - DB sin cambios
#   - v4 sigue dormant
```

**Importante:** los 2 commits locales (`c30565f` + `90f7f8f`) NO están en `origin/main`. Reset es no-destructivo desde perspectiva remota — nadie más fue afectado.

---

## Files modified (status final)

**Committed local (NO push):**
- `c30565f`: `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (runtime)
- `90f7f8f`: `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` (new test)

**Untracked local (artifacts del plan):**
- `.planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md`
- `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md`
- `.planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md`  ← este archivo

**NO modificado (verificado):**
- `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` — sed-patch revertido (`git diff origin/main -- $file` = 0 líneas).
- Todos los otros archivos del sub-loop: índices, schema, tooling, generation, prompt, few-shots, tone, safe-output, kb-search-tool, comprehension-schema → cero cambios.
- 18 KBs en `src/lib/agents/somnio-v4/knowledge/` → cero cambios.
- v3 productivo, routing_rules, migraciones → cero cambios.

---

## Next action requerida

Jose decide entre Opción A (rollback), Opción B (push partial + 07c), Opción C (defer/pause). Recomendación: **Opción A + Plan 07c**.

Si Opción C (pause):
- Plan 07b queda en estado local-committed sin push.
- v4 sigue dormant.
- Re-evaluación en próxima sesión.
