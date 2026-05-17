---
phase: standalone-somnio-v4-rag-generative
plan: 04
subsystem: sub-loop
tags: [somnio-v4, rag, sub-loop, calibration, few-shots, gemini-flash]

# Dependency graph
requires:
  - plan: 03
    provides: buildGenerationPrompt + FewShot type + GenerationOutputSchema con binary backstop
provides:
  - FEW_SHOTS const (10 calibration examples del corpus REAL)
  - buildGenerationPrompt cableado con FEW_SHOTS by default (M1+M2+M3+M4 wired)
  - few-shots.test.ts (19 tests structure + integration)
affects:
  - Plan 05 (Smoke A) — runtime usa FEW_SHOTS by default cuando v4 dispara sub-loop
  - Plan 06 (Smoke B) — regression suite usa el prompt completo (no cambios necesarios)
  - Plan 07 (HOLD) — si Smoke A muestra <15/17 OK, iterar few-shots aquí

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Few-shots calibration block en system prompt (M4 RESEARCH A1): 10 examples derivados del corpus REAL (18 KBs Plan 02 + 17 casos Smoke A STATUS.md), 2 por cada uno de los 5 buckets discretos."
    - "M2 escala discretizada strict: confidence ∈ {0.20, 0.40, 0.60, 0.80, 0.95} — test rechaza fluidos."
    - "M3 binary backstop con mapping deterministic: 0.95→RESPONDE_BIEN, 0.40→FALTA_INFO, 0.20→FUERA_SCOPE, 0.60 contextual."
    - "Don't Hand-Roll RESEARCH: idioma español verbatim del corpus, NO traducir."
    - "Tono Somnio en respuestas: 'tú' (NO 'usted'), 2-4 oraciones, sin emojis, sin 'te derivo/asesor humano'."

key-files:
  created:
    - "src/lib/agents/somnio-v4/sub-loop/few-shots.ts"
    - "src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts"
    - ".planning/standalone/somnio-v4-rag-generative/04-SUMMARY.md"
  modified:
    - "src/lib/agents/somnio-v4/sub-loop/prompt.ts (import FEW_SHOTS + default arg = FEW_SHOTS + block renderer + JSDoc updates)"

key-decisions:
  - "D-13 honored: 18 KBs del corpus Plan 02 son la única fuente de material. Sin invenciones."
  - "D-15 honored: responseConfidence sigue siendo auto-reportado por Gemini — los few-shots calibran el target."
  - "D-17 honored: 10 few-shots (M4) cubren los 5 buckets discretos (M2). Mínimo defendible."
  - "RESEARCH A1 M1 honored: prompt PROBABILIDAD framing presente (ya desde Plan 03, no duplicado)."
  - "RESEARCH A1 M2 honored: SOLO 5 valores discretos en few-shots {0.20, 0.40, 0.60, 0.80, 0.95}."
  - "RESEARCH A1 M3 honored: binary enum presente en cada few-shot + reinforced en prompt body."
  - "RESEARCH A1 M4 honored: 2 few-shots por bucket — cobertura del rango completo evita anchoring."
  - "Pre-existing dirty files NO tocados (config.json, CLAUDE.md, messages, etc.)."

patterns-established:
  - "Few-shots como bloque renderizado en system prompt: cada FewShot se formatea como 5-line block (pregunta + material + respuesta + responseConfidence + rationale + binary), separado por '\\n\\n'. Pattern reusable para futuros agentes calibrados."
  - "Plan 04 layer pattern: la calibración LIVE en módulo separado (few-shots.ts) — el prompt builder los acepta como param. Permite A/B testing futuro (Plan 07 HOLD: swappear FEW_SHOTS_V2 sin tocar prompt.ts)."
  - "Default parameter pattern: `fewShots: FewShot[] = FEW_SHOTS` — call sites no necesitan pasar el array, pero pueden override en tests (Test 13 con `[]` explícito)."
  - "Don't Hand-Roll discipline: cada respuesta del few-shot fue revisada vs el KB markdown correspondiente para verificar tono Somnio (tú/sin emojis/sin asesor humano) + fidelidad al material disponible."

requirements-completed: []

# Metrics
duration: ~45min (3 task commits + 1 SUMMARY + 1 STATUS/STATE commit)
completed: 2026-05-17
---

# Plan 04: Calibración few-shots Gemini Flash (M1+M2+M3+M4) Summary

**10 few-shots calibrados del corpus REAL inyectados en el system prompt de generation-call (Gemini Flash). Aplica las 4 mejoras RESEARCH A1 (M1-M4) sobre la calibración base D-17. v4 sigue dormant en prod. Plan 05 (Smoke A) unblocked, con bloqueo PENDIENTE: usuario debe correr `pnpm knowledge:sync` antes de Plan 05 (Plan 02 Open Debt).**

## Performance

- **Duration:** ~45min (3 task commits + 1 SUMMARY commit + 1 STATUS/STATE commit)
- **Started:** 2026-05-17 ~13:10 UTC
- **Completed:** 2026-05-17 ~13:55 UTC
- **Tasks:** 3 atomic commits ejecutados + 1 SUMMARY pending + 1 STATUS/STATE pending + 1 PUSH
- **Files modified:** 2 nuevos (few-shots.ts + few-shots.test.ts) + 1 editado (prompt.ts)

## Accomplishments

### 1. `few-shots.ts` (NEW) — 10 examples del corpus REAL

Distribución por bucket (M2 + M4 — 2 por cada uno de los 5 buckets discretos):

| Bucket | # | Caso 1 | Caso 2 | Binary mapping |
|---|---|---|---|---|
| **0.95** | 2 | `como_se_toma` ("¿cómo se toma?") | `dependencia` ("¿es adictivo?") | RESPONDE_BIEN |
| **0.80** | 2 | `envio` ("¿cuánto tarda a Medellín?") | `interaccion_alcohol` ("¿puedo si tomo alcohol?") | RESPONDE_BIEN |
| **0.60** | 2 | `alternativas_naturales` ("¿qué hábitos ayudan?") → RESPONDE_BIEN | `insomnio_largo_plazo` ("3 semanas sin dormir...") → FALTA_INFO | mixed |
| **0.40** | 2 | `contraindicaciones` ("tengo lupus") | `interaccion_medicamentos` ("tomo escitalopram") | FALTA_INFO |
| **0.20** | 2 | `envio` ("¿envían a Miami?") | `pago` ("¿criptomonedas?") | FUERA_SCOPE |

**Source de cada material:** verbatim concatenado de las 5 secciones del KB markdown correspondiente post-Plan 02 (`Hechos / Posición / Debe contener / NUNCA decir / Cuándo escalar`), con bracket markers `[Hechos]`, `[Posición]`, `[Debe contener]`, `[NUNCA decir]`, `[Cuándo escalar]` para que Gemini reconozca la estructura — análogo al rendering que hace `buildGenerationPrompt` con el material runtime.

**Source de cada respuesta:** redactada manualmente siguiendo el tono Somnio (cálido pero firme, 2-4 oraciones, "tú", sin emojis, sin "te derivo/te paso/asesor humano"), fiel a los items `[SIEMPRE]` y `[SI APLICA]` listados en el `Debe contener` del KB.

**Source de cada rationale:** 1 frase justificando por qué ese bucket — útil para que Gemini infiera el criterio de discretización.

### 2. `prompt.ts` (EDIT) — wire FEW_SHOTS by default

Cambios mínimos quirúrgicos:

```ts
// Top of file:
import { FEW_SHOTS } from './few-shots'

// Function signature:
export function buildGenerationPrompt(
  material: NonNullable<ToolingOutput['material_del_topic']>,
  toneBase: string = TONE_BASE,
  fewShots: FewShot[] = FEW_SHOTS,  // ← cambio: era `[]`
): string { ... }

// Block renderer (reemplaza placeholder Plan 03):
const fewShotsBlock = fewShots.length === 0
  ? `(sin few-shots — el modelo confía en las reglas duras + M2 buckets discretos arriba)`
  : `EJEMPLOS DE CALIBRACIÓN (few-shots — M4 cobertura del rango completo 0.20-0.95):\n\n` +
    fewShots.map((fs, i) =>
      `### Few-shot ${i + 1}:\n` +
      `Pregunta del cliente: ${fs.pregunta}\n` +
      `Material disponible:\n${fs.material}\n` +
      `Respuesta esperada: ${fs.respuesta || '(handoff silente — responseText vacío)'}\n` +
      `responseConfidence: ${fs.confidence} — ${fs.rationale}\n` +
      `binary: ${fs.binary}`,
    ).join('\n\n')
```

**M1 (PROBABILIDAD framing) ya estaba en Plan 03** — verificación grep:

```
$ grep -c "PROBABILIDAD" src/lib/agents/somnio-v4/sub-loop/prompt.ts
3
$ grep -c "compañero humano experto" src/lib/agents/somnio-v4/sub-loop/prompt.ts
1
```

**M2 (5 buckets discretos) ya estaba en Plan 03** — verificación grep:

```
$ grep -oE "0\.20|0\.40|0\.60|0\.80|0\.95" src/lib/agents/somnio-v4/sub-loop/prompt.ts | sort -u
0.20
0.40
0.60
0.80
0.95
```

**M3 (binary enum) ya estaba en Plan 03 (schema + prompt)** — verificación grep:

```
$ grep -E "RESPONDE_BIEN|FALTA_INFO|FUERA_SCOPE" src/lib/agents/somnio-v4/sub-loop/prompt.ts | wc -l
8
```

**M4 (cobertura) implementado en Plan 04** — el block "EJEMPLOS DE CALIBRACIÓN" renderiza los 10 few-shots con sus 5 buckets cubiertos.

### 3. `few-shots.test.ts` (NEW) — 19 tests

| # | Test | Resultado |
|---|---|---|
| 1 | has 8-10 few-shots total | PASS (10) |
| 2 | covers all 5 confidence buckets | PASS |
| 3 | uses ONLY 5 discrete confidence values | PASS |
| 4 | has at least 2 few-shots per bucket | PASS |
| 5 | has at least 1 of each binary value | PASS |
| 6 | pregunta + material + rationale non-empty | PASS |
| 7 | material has KB section marker | PASS |
| 8 | FUERA_SCOPE → respuesta vacía | PASS |
| 9 | 0.95 → RESPONDE_BIEN sanity | PASS |
| 10 | 0.20 → FUERA_SCOPE sanity | PASS |
| 11 | 0.40 → FALTA_INFO sanity | PASS |
| 12 | prompt contains M1 PROBABILIDAD | PASS |
| 13 | prompt lists 5 buckets | PASS |
| 14 | prompt instructs M3 binary | PASS |
| 15 | prompt includes "EJEMPLOS DE CALIBRACIÓN" + "Few-shot 1" | PASS |
| 16 | prompt renders all 10 few-shots | PASS |
| 17 | prompt includes material sections | PASS |
| 18 | prompt has ANTI-INVENCIÓN + Tono Somnio | PASS |
| 19 | empty fewShots → fallback text | PASS |

```
$ npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts
✓ 19 tests passed (7ms)

$ npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/
Test Files  5 passed (5)
Tests       48 passed | 2 skipped (50)
```

48 = 5 (safe-output) + 15 (output-schema) + 5 (kb-search-tool) + 4 (sub-loop-e2e syntactic) + 19 (few-shots) — sub-loop suite verde sin regresión.

## Commits Plan 04 (3 atomic)

| # | Task | Commit | Type |
|---|------|--------|------|
| 1 | 4.1 — few-shots.ts (10 examples) | `e843d7b` | feat |
| 2 | 4.2 — prompt.ts wire FEW_SHOTS | `1f08501` | feat |
| 3 | 4.3 — few-shots.test.ts (19 tests) | `15f8bbf` | test |
| 4 | 4.6 — SUMMARY + STATUS + STATE | _pending_ | docs |

## Verify Gates — automatizables ALL PASS

```bash
# 1. few-shots.ts existe + estructura correcta:
test -f src/lib/agents/somnio-v4/sub-loop/few-shots.ts && echo OK
grep -c "export const FEW_SHOTS" src/lib/agents/somnio-v4/sub-loop/few-shots.ts
# Resultado: 1 ✓

# 2. 5 buckets cubiertos con 2 entradas cada uno:
for v in 0.20 0.40 0.60 0.80 0.95; do
  echo "$v: $(grep -c "confidence: $v" src/lib/agents/somnio-v4/sub-loop/few-shots.ts)"
done
# Resultado: 0.20=2, 0.40=2, 0.60=2, 0.80=2, 0.95=2 ✓

# 3. 3 binary values presentes:
for b in RESPONDE_BIEN FALTA_INFO FUERA_SCOPE; do
  echo "$b: $(grep -c "binary: '$b'" src/lib/agents/somnio-v4/sub-loop/few-shots.ts)"
done
# Resultado: RESPONDE_BIEN=5, FALTA_INFO=3, FUERA_SCOPE=2 ✓

# 4. prompt.ts wire correct:
grep -c "import { FEW_SHOTS }" src/lib/agents/somnio-v4/sub-loop/prompt.ts
# Resultado: 1 ✓
grep -c "fewShots: FewShot\[\] = FEW_SHOTS" src/lib/agents/somnio-v4/sub-loop/prompt.ts
# Resultado: 2 (1 declaración + 1 mención en JSDoc) ✓

# 5. M1+M2+M3 verificados en prompt body:
grep -c "PROBABILIDAD" src/lib/agents/somnio-v4/sub-loop/prompt.ts        # 3 ✓
grep -c "compañero humano experto" src/lib/agents/somnio-v4/sub-loop/prompt.ts  # 1 ✓
grep -oE "0\.20|0\.40|0\.60|0\.80|0\.95" src/lib/agents/somnio-v4/sub-loop/prompt.ts | sort -u
# 5 unique values ✓
grep -E "RESPONDE_BIEN|FALTA_INFO|FUERA_SCOPE" src/lib/agents/somnio-v4/sub-loop/prompt.ts | wc -l
# 8 ✓

# 6. Tests verdes:
npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts
# 19/19 passed ✓

# 7. TypeScript scope clean:
npx tsc --noEmit -p . 2>&1 | grep -cE "sub-loop/(few-shots|prompt)"
# Resultado: 0 ✓
```

## Sample del prompt resultante (block "EJEMPLOS DE CALIBRACIÓN")

El bloque renderizado por `buildGenerationPrompt` cuando se usa el default `FEW_SHOTS`:

```
CALIBRACIÓN DEL responseConfidence (M1 — RESEARCH A1):

El responseConfidence (0.0 a 1.0) debe ser tu mejor estimación de:

  "¿Cuál es la PROBABILIDAD de que un compañero humano experto en Somnio diría que
   tu respuesta es completa y NO requiere consultarlo con un humano?"

Usá SÓLO estos 5 buckets (M2 — discretizada): 0.20, 0.40, 0.60, 0.80, 0.95.
NO uses valores intermedios tipo 0.42, 0.67, 0.89.

BACKSTOP BINARIO (M3):

Después del confidence numérico, respondé:
- "RESPONDE_BIEN": si tu respuesta usa SOLO material del KB y cubre la pregunta específica.
- "FALTA_INFO": si necesitarías más data (sobre el cliente, el producto, una condición no listada).
- "FUERA_SCOPE": si la pregunta no está en el material en absoluto.

EJEMPLOS DE CALIBRACIÓN (few-shots — M4 cobertura del rango completo 0.20-0.95):

### Few-shot 1:
Pregunta del cliente: ¿cómo se toma?
Material disponible:
[Hechos] ELIXIR DEL SUEÑO se presenta en comprimidos (no gotas, no jarabe). La dosis estándar es 1 comprimido diario, 30 minutos antes de acostarse...
[Posición] La dosis de 1 comprimido diario es estándar para población adulta sana...
[Debe contener] [SIEMPRE] Indicar dosis: 1 comprimido diario, 30 minutos antes de acostarse, pasado con agua...
[NUNCA decir] recomendar dosis distinta a 1 comprimido diario...
[Cuándo escalar] cliente con condición médica preexistente pregunta por dosis específica.
Respuesta esperada: Tomás 1 comprimido cada noche, unos 30 minutos antes de acostarte, pasado con un vaso de agua. Se traga entero, no se mastica ni se disuelve. Lo importante es ser consistente con la hora cada noche para que el cuerpo se vaya acostumbrando al ritmo del sueño.
responseConfidence: 0.95 — El material cubre directo y completo la pregunta: dosis, momento, forma de tragarlo y consistencia están explícitos en [SIEMPRE].
binary: RESPONDE_BIEN

### Few-shot 2:
Pregunta del cliente: ¿es adictivo?
Material disponible:
[Hechos] ELIXIR DEL SUEÑO contiene melatonina (10mg)...
...
binary: RESPONDE_BIEN

... (continúa con Few-shot 3..10 cubriendo los 5 buckets — ver few-shots.ts) ...

MATERIAL DEL TOPIC SELECCIONADO:

[Hechos del producto]
{material.hechos del topic ganador runtime}
...
```

## Deviations from Plan

**Ninguna desviación material.** Plan 04 ejecutado verbatim según 04-PLAN.md:

- **Task 4.1** completada: `few-shots.ts` con 10 entradas, 2 por bucket, 3 binary values, idioma español verbatim del corpus.
- **Task 4.2** completada: `prompt.ts` con import + default param + block renderer; M1+M2+M3 ya estaban en Plan 03 (verificados, no duplicados).
- **Task 4.3** completada: `few-shots.test.ts` con 19 tests (más que las 11 propuestas en el plan; cobertura extra de structure + mapping).

**Auto-fixes Rule 1-3:** ninguno necesario — los gates de Task 4.1 + 4.2 + 4.3 pasaron a la primera. TypeScript scope clean. Tests verdes.

**Choices no anticipadas en el plan:**

1. **Bucket 0.60 binary mapping:** el plan dice "RESPONDE_BIEN o FALTA_INFO según caso" — opté por:
   - `alternativas_naturales` ("¿qué hábitos ayudan?") → **RESPONDE_BIEN** porque el material lista hábitos generales que el experto Somnio aprobaría como respuesta razonable sin escalar.
   - `insomnio_largo_plazo` ("3 semanas sin dormir, ¿qué me recomiendas?") → **FALTA_INFO** porque la respuesta requiere extrapolar entre agudo (semanas) y crónico (meses) — el experto humano querría revisar.
   
   Documentado en cada `rationale` field del FewShot.

2. **Material formatting con markers `[Hechos]`, `[Posición]`, etc.:** elegí usar bracket markers para que el material del few-shot sea estructuralmente similar al rendering que hace `buildGenerationPrompt` con el material runtime. Eso ayuda a Gemini a aprender el patrón.

3. **Test extra (Test 13 "empty fewShots fallback"):** agregué un test que valida que `buildGenerationPrompt(mat, undefined, [])` renderiza un texto fallback breve (`"(sin few-shots — el modelo confía en las reglas duras + M2 buckets discretos arriba)"`) y NO el placeholder antiguo de Plan 03. Eso previene regresión si alguien re-introduce el placeholder.

## Locks verificados

- ✅ `nunca-decir-check.ts` NO modificado (D-09).
- ✅ `comprehension-schema.ts` NO modificado (D-25).
- ✅ `output-schema.ts` NO modificado (Plan 03 cubrió el schema; Plan 04 solo wired few-shots).
- ✅ `generation-call.ts` NO modificado (Plan 03 fijó schema + safety settings; Plan 04 solo cambia el system prompt vía buildGenerationPrompt).
- ✅ `tooling-call.ts` NO modificado.
- ✅ `kb-search-tool.ts` NO modificado.
- ✅ `index.ts` orchestrator NO modificado.
- ✅ Pre-existing dirty files (CLAUDE.md, .planning/config.json, messages/*.json, etc.) NO tocados.

## Open debt — DB sync deferred (Plan 02 Task 2.4) — STILL BLOCKING para Plan 05

**Sin cambios desde 03-SUMMARY.** Plan 02 Task 2.4 (`pnpm knowledge:sync`) sigue deferred por auth-gate Vercel. Plan 04 NO requiere DB sync (todo es codigo + tests unit). Pero **Plan 05 (Smoke A) lo requiere bloqueante** porque corre el sub-loop end-to-end contra prod DB.

### ⚠ BLOQUEANTE para Plan 05

Antes de correr `/gsd-execute-phase somnio-v4-rag-generative --wave 4`:

```bash
# 1. Asegurar .env.local tiene las keys necesarias (descargar de Vercel si vercel env pull no las decrypta):
#    OPENAI_API_KEY_SALESV4=sk-...
#    GOOGLE_GENERATIVE_AI_API_KEY=AIza...
#    SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 2. Correr sync end-to-end:
pnpm knowledge:sync

# 3. Verificar en Supabase Studio (queries en 03-SUMMARY.md "Open debt"):
#    - 0 rows con hechos_del_producto NULL
#    - 18 rows totales bajo agent_id='somnio-sales-v4'
```

## Known Stubs

**Ninguno introducido en Plan 04.** El placeholder antiguo de Plan 03 (`"[FEW_SHOTS PLACEHOLDER — Plan 04 inyectará 8-10 examples calibrados acá]"`) fue REEMPLAZADO en este plan con el block renderer real.

El fallback text `"(sin few-shots — el modelo confía en las reglas duras + M2 buckets discretos arriba)"` solo aparece si un caller pasa `fewShots: []` explícito (path validado por Test 13). En producción runtime, el default `FEW_SHOTS` siempre tiene 10 entradas → el path activo es el block "EJEMPLOS DE CALIBRACIÓN".

## Threat Flags

**Ninguno nuevo.** Los threats del threat model del plan se cubrieron:

- T-04-01 (Information Disclosure — few-shots contienen info de clientes): mitigado — los few-shots son sintéticos derivados del KB material, NO de chats reales. Pregunta + respuesta construidos manualmente.
- T-04-02 (Tampering — anchoring artificial): mitigado por M2 (5 buckets discretos) + M4 (2 por bucket, cobertura del rango completo). El modelo no puede "copiar" un confidence default porque el corpus de ejemplos cubre 0.20 hasta 0.95 con frecuencia uniforme.
- T-04-03 (Repudiation — overconfidence sistémico): aceptado (riesgo residual). Plan 05 Smoke A mide empíricamente.
- T-04-04 (Tampering — confidence fluido): aceptado. Threshold 0.70 + binary backstop + NUNCA-decir actúan como guardrails redundantes si el modelo emite 0.65 en vez de 0.60.

## Self-Check: PASSED

- ✅ few-shots.ts creado con 10 entradas (M4) + 5 buckets cubiertos (M2) + 3 binary values (M3).
- ✅ prompt.ts wire FEW_SHOTS by default + block renderer "EJEMPLOS DE CALIBRACIÓN" + JSDoc actualizado.
- ✅ M1 PROBABILIDAD framing presente (3 mentions + 1 "compañero humano experto").
- ✅ M2 5 buckets listados literalmente en el prompt body (0.20, 0.40, 0.60, 0.80, 0.95).
- ✅ M3 binary backstop instrucción presente (3 enum values mencionados).
- ✅ few-shots.test.ts 19 tests verdes; sub-loop suite total 48 + 2 skipped.
- ✅ TypeScript scope sub-loop: 0 errores.
- ✅ Commits Plan 04: `e843d7b`, `1f08501`, `15f8bbf` — todos en `git log --all`.
- ✅ Pre-existing dirty files NO tocados (verificable con `git diff --name-only origin/main..HEAD` solo lista los 3 archivos del plan + este SUMMARY + STATUS/STATE).
- ✅ Regla 6 honrada: v4 sigue dormant en prod (sin routing rule, `active_v4_rules = 0`).
- ✅ Regla 3 N/A (no mutations introduced).

## Next Steps

1. **Update STATUS.md** — Plan 04 DONE 2026-05-17 + flag "⚠ BLOCKING para Plan 05: `pnpm knowledge:sync` pendiente (Plan 02 Task 2.4 deferred)".
2. **Update STATE.md** — Current position references Plan 04 SHIPPED + next Plan 05 with sync blocker.
3. **Final docs commit** — SUMMARY + STATUS + STATE en 1 commit.
4. **Push** — `git push origin main`.
5. **User action ANTES de Plan 05:** correr `pnpm knowledge:sync` con keys productivas (ver "Open debt" arriba + 03-SUMMARY.md).
6. **Plans 05 + 06 (Wave 4 parallel) — Smoke A/B:** `/gsd-execute-phase somnio-v4-rag-generative --wave 4`.

```bash
# Comando siguiente después de pnpm knowledge:sync:
/gsd-execute-phase somnio-v4-rag-generative --wave 4
```
