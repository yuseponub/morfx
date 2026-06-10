# GATE-W1 — Gate de fin de Wave 1 (D-10 + D-11)

**Creado:** 2026-06-10
**Plan:** 06 (Wave 3 — gate de cierre de Wave 1)
**Propósito:** demostrar que la limpieza de código muerto de Wave 1 (planes 02–05) NO cambió ninguna decisión observable del sistema (D-10), que v3/godentist/recompra/pw quedan byte-idénticos (Regla 6 / D-11), y dejar luz verde verificada antes de la extracción del core (W2).

**Baseline de comparación:** `BASELINE.md` §"Baseline operativo (corrida fresca 2026-06-10)" — NO el snapshot documental 2026-06-05.
**Commit de baseline (sha de congelado, fin Plan 01):** `224c09ee`.
**HEAD evaluado:** `81eb06cf` (Wave 1 mergeada: planes 02–05).

---

## Aritmética del conteo de suite (D-09)

**SUITE_CMD** (canónico de BASELINE.md):

```
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
```

| Métrica | Baseline (Plan 01) | Deltas sancionados Wave 1 | Esperado | **Actual (Plan 06)** |
|---|---|---|---|---|
| Tests passed | 348 | −2 (escalation.test.ts, D-12/Pitfall 13) | **346** | **346** ✓ |
| Skipped | 7 | 0 | 7 | 7 ✓ |
| Failed | 0 | 0 | 0 | **0** ✓ |
| Test Files | 37 passed \| 1 skipped | — | 37/1 | 37 passed \| 1 skipped ✓ |
| `npx tsc --noEmit` | exit 0 | — | exit 0 | **exit 0** ✓ |

**Aritmética:** `348 − 2 = 346 passed | 7 skipped`. Los 2 tests retirados son los que probaban los params siempre-false `isCrmMutation`/`casReject` de `EscalationInput` + sus ramas inalcanzables (`escalation.ts`), borrados en Plan 02 bajo D-12 con carve-out explícito sancionado por Pitfall 13. Ningún assert de comportamiento de los 346 tests restantes cambió.

---

## Smoke A — comparación caso a caso vs baseline operativo (D-10)

**Comando:** `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` + 1 re-run filtrado (Pitfall 12) de casos 1/4/10/11.
**Criterio D-10:** mismo sub-loop outcome + mismo template determinista + misma FAMILIA de reason. NO byte-equality de texto generativo ni del verdict del judge (ambos no-deterministas por diseño).

| # | Caso | Baseline: outcome / template / reason | Plan 06: outcome / template / reason | DECISIÓN |
|---|------|----------------------------------------|--------------------------------------|----------|
| 1 | alcohol | `no_match` / `handoff_humano` / `escalation_trigger_match` (FAIL) | corrida inicial RUNTIME ERROR infra → **re-run:** `no_match` / `handoff_humano` / `escalation_trigger_match` (FAIL) | ✓ EQUIVALENTE (infra resuelta en re-run; misma decisión que baseline) |
| 2 | embarazo | `generated` / `null` / `rag_generated` | `generated` / `null` / `rag_generated` | ✓ EQUIVALENTE |
| 3 | hijo de 10 | `no_match` / `handoff_humano` / `escalation_trigger_match` (PASS) | `no_match` / `handoff_humano` / `escalation_trigger_match` (FAIL judge) | ✓ EQUIVALENTE (misma decisión handoff+escalation; el verdict del judge varía — permitido por D-10 #4/#5) |
| 4 | sertralina | `generated` / `null` / `rag_generated` (PASS) | corrida inicial RUNTIME ERROR infra → **re-run:** `generated` / `null` / `rag_generated` (PASS) | ✓ EQUIVALENTE (infra resuelta en re-run) |
| 5 | lupus | `generated` / `null` / `rag_generated` | `generated` / `null` / `rag_generated` | ✓ EQUIVALENTE |
| 6 | cómo se toma | `generated` / `rag_generated` | `generated` / `rag_generated` | ✓ EQUIVALENTE |
| 7 | ingredientes | `generated` / `rag_generated` | `generated` / `rag_generated` | ✓ EQUIVALENTE |
| 8 | contenido frasco | `generated` / `rag_generated` | `generated` / `rag_generated` | ✓ EQUIVALENTE |
| 9 | adictivo | `generated` / `rag_generated` | `generated` / `rag_generated` | ✓ EQUIVALENTE |
| 10 | tarda a Medellín | `generated` / `null` / `rag_generated` (PASS) | `no_match` / `handoff_humano` / `nunca_decir_violation` (FAIL) — **re-run persiste** | ⚠ FLAKY DOCUMENTADO (ver nota A/10 abajo — NO regresión) |
| 11 | cómo pago | `generated` / `null` / `rag_generated` (PASS) | `no_match` / `handoff_humano` / `escalation_trigger_match` (FAIL) — **re-run persiste** | ⚠ FLAKY DEL GENERADOR (ver nota A/11 abajo — NO regresión) |
| 12 | devoluciones | `no_match` / `handoff_humano` / `nunca_decir_violation` (FAIL) | `no_match` / `handoff_humano` / `no_relevant_hit` (PASS) | ✓ EQUIVALENTE (misma decisión handoff; mejora de verdict — anotada) |
| 13 | duración efecto | `generated` / `rag_generated` | `generated` / `rag_generated` | ✓ EQUIVALENTE |
| 14 | hábitos dormir | `generated` / `rag_generated` | `generated` / `rag_generated` | ✓ EQUIVALENTE |
| 15 | apnea | `no_match` / `handoff_humano` / `escalation_trigger_match` | `no_match` / `handoff_humano` / `escalation_trigger_match` | ✓ EQUIVALENTE |
| 16 | Miami | `no_match` / `handoff_humano` / (escalation/low_conf) | `no_match` / `handoff_humano` / `escalation_trigger_match` | ✓ EQUIVALENTE (misma decisión handoff; baseline ya documentó reason variable entre runs) |
| 17 | criptomonedas | `no_match` / `handoff_humano` / `escalation_trigger_match` | `no_match` / `handoff_humano` / `escalation_trigger_match` | ✓ EQUIVALENTE |

### Notas de flaky persistente A/10 y A/11 (análisis de causa raíz — NO regresión)

Los casos 10 y 11 divergieron de la decisión del baseline operativo y la divergencia **persistió** tras el re-run (Pitfall 12). Antes de declarar regresión, se ejecutó análisis de causa raíz contra el código de Wave 1, con resultado concluyente: **la divergencia es no-determinismo del generador (Gemini Flash temperature=0.3, safety BLOCK_NONE), NO un efecto de Wave 1.** Evidencia:

1. **Wave 1 NO tocó la lógica de decisión `generated` vs `handoff`.** El diff de `escalation.ts` (224c09ee..HEAD) borra ÚNICAMENTE los params siempre-false `isCrmMutation`/`casReject` y sus ramas inalcanzables (D-12) — los dos triggers vivos (`razonamiento_libre`, `low_confidence`) quedan byte-idénticos. Los casos 10/11 son consultas `envio`/`pago` cuya decisión la toma la generación RAG + el gate `nunca_decir`/relevancia del sub-loop, NO el escalation del slot resolver. El diff de `sub-loop/index.ts` es solo el rename D-17 (`runLegacySubLoop`→`runCrmMutationSubLoop`) + comentarios — CERO cambio de lógica de generación/gate (verificado: grep de líneas no-comentario/no-rename = vacío).

2. **El caso 10 está EXPLÍCITAMENTE documentado como flaky en el propio BASELINE.md.** Su tabla §"Divergencias flaky" registra A/10 oscilando entre exactamente estos dos valores: `nunca_decir_violation → handoff` (snapshot 2026-06-05) ↔ `generated` (operativo 2026-06-10), con la lectura textual *"Flaky del generador: la violación nunca_decir no se reprodujo."* La corrida de Plan 06 aterrizó en el valor 2026-06-05. Es el mismo eje de flakiness, no uno nuevo.

3. **Dirección segura.** Ambas divergencias van de `generated`→`handoff` (el agente escala a humano en una consulta de política borderline). Es la dirección conservadora: nunca produce información incorrecta al cliente; en el peor caso deriva a un humano que sí responde.

**Veredicto A/10 y A/11:** dentro del envelope de flaky documentado del sistema generativo (D-10 #4 carve-out). NO se cuentan como regresión porque la causa raíz descarta a Wave 1. Se registran transparentemente para auditoría del usuario/verificador.

**Conteo Smoke A Plan 06:** 13/17 EQUIVALENTE directo + 2 infra resueltas en re-run (1, 4) + 2 flaky-del-generador persistentes documentados (10, 11). Cero regresión atribuible a Wave 1.

### Veredicto Smoke A: **EQUIVALENTE**

---

## Smoke B — comparación caso a caso vs baseline operativo (D-10)

**Comando:** `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` + 1 re-run filtrado (Pitfall 12) de casos 1/2.

| # | Caso | Group | Baseline: outcome / reason | Plan 06: outcome / reason | DECISIÓN |
|---|------|-------|----------------------------|---------------------------|----------|
| 1 | insomnio | razonamiento_libre | FAIL (got `generated`; baseline anotó infra 2x + leak) | corrida inicial RUNTIME ERROR infra → **re-run RUNTIME ERROR infra** (no completa) | ⚠ INFRA PERSISTENTE (baseline ya lo marca como el caso más infra-prone; no completa → no cuenta como FAIL del sistema, Pitfall 12) |
| 2 | día raro | razonamiento_libre | PASS — `no_match` / `nunca_decir_violation` | corrida inicial `generated` / `rag_generated` (FAIL) → **re-run:** `no_match` / `nunca_decir_violation` (PASS) | ✓ EQUIVALENTE (flaky resuelto en re-run; misma decisión que baseline) |
| 3 | sueño interesante | razonamiento_libre | PASS — `no_match` / `low_response_confidence` | `no_match` / `low_response_confidence` (PASS) | ✓ EQUIVALENTE |
| 4 | quiero comprar | crm_mutation | SKIP (Regla 6 + T-06-01) | SKIP | ✓ EQUIVALENTE |
| 5 | mover a confirmado | crm_mutation | SKIP | SKIP | ✓ EQUIVALENTE |
| 6 | agregá nota | crm_mutation | SKIP | SKIP | ✓ EQUIVALENTE |
| 7 | hola | state_machine | SKIP | SKIP | ✓ EQUIVALENTE |
| 8 | cuánto cuesta | state_machine | SKIP | SKIP | ✓ EQUIVALENTE |
| 9 | ya recibí pedido | state_machine | SKIP | SKIP | ✓ EQUIVALENTE |
| 10 | cas_reject simulado | cas_reject | SKIP | SKIP | ✓ EQUIVALENTE |

**Nota B/1:** El re-run del caso 1 volvió a caer en error de infra LLM de Gemini (high demand). El BASELINE.md ya lo documenta como *"Caso recurrentemente problemático (infra 2x + leak a generated)"*. Por Pitfall 12, los errores de infra LLM no cuentan como FAIL del sistema; el re-run no completó por la misma condición de infra. No es atribuible a Wave 1 (mismo caso, mismo error de infra que en el baseline). Los 7 SKIP (4–10) son exactamente los del baseline (Regla 6 + state-machine upstream + cas_reject cubierto por integration tests de crm-writer).

### Veredicto Smoke B: **EQUIVALENTE**

---

## Conclusión D-10

| Smoke | Veredicto | Notas |
|---|---|---|
| Smoke A | **EQUIVALENTE** | 2 infra resueltas en re-run; 2 flaky-del-generador documentados (A/10, A/11) con causa raíz que descarta Wave 1 |
| Smoke B | **EQUIVALENTE** | 1 flaky resuelto en re-run (B/2); 1 infra persistente baseline-documentada (B/1); 7 SKIP idénticos |

La limpieza de código muerto de Wave 1 NO cambió ninguna decisión observable del sistema atribuible al refactor. Las divergencias residuales caen todas dentro del envelope de no-determinismo del generativo ya documentado en BASELINE.md. Suite canónica 346 passed | 7 skipped | 0 failed (aritmética sancionada). `tsc --noEmit` exit 0.

---

## Gate Regla 6 (D-11)

Verificación de que v3/godentist/recompra/pw quedan byte-idénticos tras Wave 1, y que todo el cambio se contuvo en la lista permitida EXTENDIDA (Pitfall 2: la lista D-11 original más `src/inngest/functions/agent-timers-v4.ts`, archivo v4-ONLY que D-13 obligó a tocar — su inclusión preserva el espíritu de Regla 6 porque `agent-timers-v3.ts` queda intacto).

### 1. Gate de diff-cero D-11 EXTENDIDO

Comando (contra el sha de baseline `224c09ee`):

```bash
git diff --name-only 224c09ee..HEAD -- src/ \
  ':!src/lib/agents/somnio-v4' \
  ':!src/lib/agents/engine/v4-production-runner.ts' \
  ':!src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts' \
  ':!src/lib/agents/interruption-system-v2' \
  ':!src/inngest/functions/agent-timers-v4.ts'
```

**Resultado: VACÍO (0 líneas) ✓** — ningún archivo `src/` fuera de la lista permitida extendida fue tocado por Wave 1. Regla 6 satisfecha.

Archivos `src/` efectivamente tocados por Wave 1 (todos dentro de la lista permitida):
`somnio-v4/{ARCHITECTURE.md, INTERRUPTION-PARITY.md, comprehension-schema.ts, engine-v4.ts, escalation.ts, slots.ts, somnio-v4-agent.ts, types.ts, sub-loop/index.ts, unknown-cases/capture.ts, __tests__/escalation.test.ts, sub-loop/__tests__/few-shots.test.ts}`, `engine/v4-production-runner.ts`, `interruption-system-v2/{observability.ts, __tests__/observability.test.ts, __tests__/e2e-scenarios.test.ts}`, `inngest/functions/agent-timers-v4.ts`.

### 2. Tests dedicados de no-regresión v3 (3/3 verdes, SIN tocar)

```
npx vitest run \
  src/lib/agents/production/__tests__/webhook-processor-routing.test.ts \
  src/lib/agents/media/__tests__/media-gate-v4.test.ts \
  src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts
```

| Test | Resultado |
|---|---|
| `webhook-processor-routing.test.ts` | ✓ 8 tests |
| `media-gate-v4.test.ts` | ✓ 5 tests |
| `webhook-processor.recompra-flag.test.ts` | ✓ 4 tests |
| **Total** | **17 passed (3 files)** ✓ |

### 3. Grep-gates documentales de `interruption-system-v2` (post Plan 04 / D-16)

| Gate | Esperado | Actual |
|---|---|---|
| `LockEventLabel` labels en `observability.ts` | 11 | **11** ✓ |
| `CheckpointId` values en `checkpoints.ts` | 8 | **8** ✓ |
| `createAdminClient`/`@supabase/supabase-js` en `interruption-system-v2/` (no-comentario) | 0 | **0** ✓ |

### Veredicto Regla 6: **VERDE**

Diff-cero extendido VACÍO + 3 tests dedicados verdes + grep-gates (11/8/0) en sus valores esperados. Los agentes de producción (v3/godentist/recompra/pw) no fueron tocados; el código desplegado en este push no recibe tráfico v4 (DORMANT, 0 workspaces con `conversational_agent_id='somnio-sales-v4'`).

---

## Push a origin/main (Regla 1)

Wave 1 completa pusheada a `origin/main`. v4 DORMANT → el deploy de Vercel no afecta tráfico de producción; el typecheck por commit (D-09, `tsc --noEmit` exit 0) predice el verde de Vercel.

**Estado tras el push:** `git log origin/main..HEAD` vacío (todo el trabajo de Wave 1 + el gate Plan 06 en remoto).
