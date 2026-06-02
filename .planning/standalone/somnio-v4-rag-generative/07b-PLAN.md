---
plan: 07b
wave: 4.6
phase: standalone-somnio-v4-rag-generative
depends_on: [07]
files_modified:
  # Runtime — ÚNICO archivo de código modificado (D-09 unlocked):
  - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
  # Tests — nuevo archivo (no existe `nunca-decir-check.test.ts` previo en __tests__/):
  - src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts
  # Artifacts del plan (creados por el ejecutor):
  - .planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md
  - .planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md
  - .planning/standalone/somnio-v4-rag-generative/STATUS.md
  - .planning/STATE.md
autonomous: true  # diff pequeño + scope acotado a 1 archivo runtime; sin gates humanos
requirements: []
user_setup:
  - service: google-genai
    why: "Smoke A V3 re-corre 17 casos con paid tier Gemini. El upgrade Flash-Lite → Flash NORMAL en `nunca-decir-check.ts` agrega 1 call de Flash por turn (delta costo ~$6/mes en prod, ya budgetado por Jose 2026-05-18)."
    env_vars:
      - name: GOOGLE_GENERATIVE_AI_API_KEY
        source: ".env.local (paid tier — ya usada por Plan 05 y Plan 07 v1)"
    dashboard_config: []

must_haves:
  truths:
    - "`nunca-decir-check.ts` línea 36 swap `gemini-2.5-flash-lite` → `gemini-2.5-flash` (Flash NORMAL). D-09 UNLOCKED con evidencia empírica del musical chairs Plan 07 v1 — el lock se documenta como D-31 en `DISCUSSION-LOG.md` (deferido al executor del plan)."
    - "System prompt de `checkNuncaDecir` extendido con 4 reglas de polaridad explícitas (AFIRMA / NIEGA / REDIRIGE / NEUTRAL) + 1 ejemplo verbatim de NEGACIÓN que NO viola, sin cambiar `CheckSchema` ni el shape `{ ok: boolean, violation?: string }` del retorno."
    - "Schema `{violates, violatedRule}` PRESERVADO. Bloque `safetySettings` (BLOCK_NONE × 4) PRESERVADO. Sin cambios estructurales — solo model swap + prompt extendido."
    - "Tests unitarios añadidos (3-5) que cubren los 4 escenarios de polaridad con mocks de `generateText` — todos verdes."
    - "Smoke A V3 sobre los mismos 17 casos arroja 17/17 PASS judge OVERALL + 0/17 invenciones + cases 1, 2, 13, 14, 16 todos PASS (los 3 V1-fails que V2 arregló se quedan PASS + los 2 V2-regressions vuelven a PASS)."
    - "v4 sigue dormant en prod (`active_v4_rules = 0`) — Plan 07b NO toca `routing_rules`."
    - "Cero cambios fuera de los 2 archivos runtime+test mencionados. Verificable con `git diff --stat` que el set diff coincide con `files_modified`."
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts"
      provides: "Guardrail post-gen con Gemini Flash NORMAL + reglas de polaridad explícitas en el system prompt. D-09 unlock documentado en file header."
      contains: "gemini-2.5-flash"
    - path: "src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts"
      provides: "Tests unitarios mockeados que validan que el wrapper retorna ok=false SOLO cuando el LLM emite `violates: true` y ok=true en los otros 3 escenarios. Coverage por polaridad."
      min_lines: 80
    - path: ".planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md"
      provides: "Resumen 1-página de la evidencia musical chairs V1→V2 + justificación del upgrade Flash NORMAL + referencia explícita al unlock D-09."
      min_lines: 40
    - path: ".planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md"
      provides: "Re-run completo de los 17 casos post-upgrade. Mismo formato verbatim que `SMOKE-A-RESULTS.md` (V1)."
      min_lines: 700
    - path: ".planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md"
      provides: "Audit findings + comparison V1 vs V2 vs V3 per case + decision (cerrar 07b → next Plan 06 Smoke B / Plan 08 flip) + flag si escala a Plan 07c."
      min_lines: 130
  key_links:
    - from: "src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts"
      to: "`checkNuncaDecir` call-site en `src/lib/agents/somnio-v4/sub-loop/index.ts` línea ~328 (post-generation gate)"
      via: "Función exportada `checkNuncaDecir({ candidateText, nuncaDecirRules })` — interfaz INALTERADA. El consumer no requiere cambios."
      pattern: "checkNuncaDecir"
    - from: "Reglas declarativas de `agent_knowledge_base.nunca_decir` (DB — set en Plan 07 v1)"
      to: "System prompt extendido de Flash NORMAL"
      via: "Las reglas se inyectan textualmente en el user message del LLM (`map((r, i) => \\`${i + 1}. ${r}\\``)). El system prompt ahora le explica al modelo cómo interpretar polaridad antes de evaluar."
      pattern: "Forbidden rules (NUNCA decir)"
    - from: "Smoke A V3 test runner (`smoke-rag-a.test.ts`)"
      to: ".planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md"
      via: "El test escribe a `RESULTS_PATH` (línea ~59-61 de `smoke-rag-a.test.ts`). El ejecutor patchea TEMPORALMENTE esa constante via `sed`/git-stash para que apunte a V3, y revierte el cambio al final del run (no se commitea)."
      pattern: "RESULTS_PATH"
---

<objective>
**Iter post-Plan 07 v1 — cerrar musical chairs con upgrade del guardrail `nuncaDecirCheck` (Nivel 2 defense-in-depth).**

Plan 07 v1 (semantic-only — reescribir items `nunca_decir` en 18 KBs de forma declarativa afirmativa) shippeó con resultado parcial:

| Caso | V1 (Plan 05) | V2 (Plan 07 v1) | Estado |
|---|---|---|---|
| 1 — alcohol (handoff incorrecto) | PASS | **FAIL** ❌ | REGRESIÓN |
| 2 — embarazo | FAIL | **PASS** ✅ | ARREGLADO |
| 13 — duracion_efecto | FAIL | **PASS** ✅ | ARREGLADO |
| 14 — habitos sueno | FAIL | **PASS** ✅ | ARREGLADO |
| 16 — Miami (handoff correcto pero falla calibration) | PASS | **FAIL** ❌ | REGRESIÓN |

Net: 14/17 → 15/17 PASS, **+1 net con 2 regresiones**.

**Evidencia empírica** preservada en `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`: la reescritura de items mueve el false-positive de un caso a otro porque Gemini Flash-Lite tiene limitación intrínseca para razonar polaridad — no distingue consistentemente "respuesta NIEGA la aserción prohibida" de "respuesta AFIRMA la aserción prohibida" cuando hay overlap de palabras tópicas. Los fixes semánticos puros tienen un techo.

**Decisión locked (Jose 2026-05-18):** **Nivel 2 defense-in-depth** — upgrade del modelo + reglas de polaridad explícitas en el prompt. Dos cambios concretos en `nunca-decir-check.ts`:

1. **Model swap** línea 36: `gemini-2.5-flash-lite` → `gemini-2.5-flash` NORMAL.
   - Flash NORMAL razona polaridad ~5x mejor que Flash-Lite (research-backed + Iter 5b lecciones).
   - Costo delta: ~$6/mes en prod (1000 sesiones/día × 10 turns × ~$0.000022/check delta) — Jose aceptó budget.
   - Requiere **UNLOCK D-09** (locked en `DISCUSSION-LOG.md` con razón "es un boolean check, perfecto para Flash-Lite. Ya funciona. No tocar"). El lock se hizo SIN evidencia empírica de polaridad — ahora con musical chairs la condición cambió. Unlock se documenta como D-31 en append-only durante este plan.

2. **System prompt reforzado** con ~15 líneas que cubren explícitamente 4 casos de polaridad (AFIRMA / NIEGA / REDIRIGE / NEUTRAL) + 1 ejemplo verbatim mostrando una negación que NO debe disparar violación.

**Lo que NO toca este plan (anti-scope-creep — explícito):**

- ❌ Refactor de `CheckSchema` (`{violates, violatedRule}` SE QUEDA).
- ❌ Schema cambio con un campo `polarity` o CoT estructurado (Nivel 3 — escalaría a Plan 07c si hace falta).
- ❌ Two-step check (separar topic-mention de polarity en 2 calls) — single call only.
- ❌ Reescribir items KB (Plan 07 v1 ya los dejó declarativos en `main`).
- ❌ Modificar `comprehension-schema.ts`, `tooling-call.ts`, `generation-call.ts`, `output-schema.ts`, `index.ts`, `tone-base.ts`, `safe-output.ts`, `kb-search-tool.ts`, `prompt.ts`, `few-shots.ts`.
- ❌ Modificar `smoke-rag-a.test.ts` permanentemente (sí se permite patch TEMPORAL de `RESULTS_PATH` que se revierte al final).
- ❌ Crear routing rule (v4 sigue dormant — eso es Plan 08).
- ❌ Migraciones SQL.

**Outcome esperado:** Smoke A V3 con **17/17 PASS judge + 0/17 invenciones**, cases 1/2/13/14/16 todos PASS, sin nuevas regresiones. Plan 06 (Smoke B) unblocked.

**Outcome aceptable degradado:** 16/17 PASS con UNA excepción documentada (preferentemente NO en cases 1 o 16). Si <16/17 o si aparece una regresión NUEVA (caso que pasó en V1 Y V2 pero falla en V3) → escalation a Plan 07c con Schema-CoT.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/STATUS.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/05-SUMMARY.md
@.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
@.planning/standalone/somnio-v4-rag-generative/SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md
@.planning/standalone/somnio-v4-rag-generative/07-PLAN.md
@.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md

# Archivo runtime modificado en este plan (lectura obligatoria pre-edit)
@src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts

# Anchor de patrones de test existentes en sub-loop/__tests__/
@src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts

# Smoke runner — el ejecutor patchea RESULTS_PATH temporalmente (no commit)
@src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts

<interfaces>
<!-- Contratos que el ejecutor consume sin re-explorar el codebase. -->

From `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (POST-Plan-07b):

```ts
// EXPORTADA — interfaz INALTERADA. El consumer (`sub-loop/index.ts`) no requiere cambios.
export async function checkNuncaDecir(args: {
  candidateText: string
  nuncaDecirRules: string[]
}): Promise<{ ok: boolean; violation?: string }>

// CheckSchema (zod) PRESERVADO:
const CheckSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

// Cambios internos respecto a HEAD actual (7ce7c5a):
//   1. Línea 36: model: google('gemini-2.5-flash-lite')  →  google('gemini-2.5-flash')
//   2. system prompt: 1 frase  →  bloque con 4 reglas de polaridad + 1 ejemplo
//   3. file header: comment block explicando D-09 unlock 2026-05-18 con referencia
//      a `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`
//   4. safetySettings (BLOCK_NONE × 4): SIN CAMBIOS (sigue requerido — contenido médico)
//   5. providerOptions block: SIN CAMBIOS estructurales
//   6. runWithPurpose('subloop_nunca_decir', ...): SIN CAMBIOS (mismo trace key)
```

From `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` líneas 59-61:

```ts
const RESULTS_PATH = path.resolve(
  process.cwd(),
  '.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md',  // ← V3 patch apunta a SMOKE-A-RESULTS-V3.md
)
// Estrategia preferida en Task 4: `sed -i` temporal + revert con `git checkout` al final.
// NO commitear este patch — el test file se mantiene apuntando a RESULTS.md (V1) en main.
```

From sub-loop/__tests__/ existentes (`safe-output.test.ts`, `few-shots.test.ts`, etc.):
```ts
// Patrón vitest establecido en el standalone:
import { describe, it, expect, vi } from 'vitest'
// Mocks: vi.mock('@ai-sdk/google', () => ({ google: vi.fn(() => 'mock-model') }))
// Helpers: makeMockGenerateTextResult({ output: { violates: bool, violatedRule?: str } })
// Coverage típica: 3-5 tests por unidad chica.
```

From `src/lib/observability.ts`:
```ts
// `runWithPurpose(purposeKey: string, fn: () => Promise<T>): Promise<T>`
// Trace span wrapper — el test mockea pasando el fn directo si no quiere generar spans.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 7b.1 — Crear 07b-AUDIT.md (resumen evidencia + justificación)</name>
  <files>.planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md</files>
  <read_first>
    - `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md` (evidencia empírica completa).
    - `.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md` (Plan 07 v1 audit — para no repetir).
    - `<objective>` de este plan (decisión locked Jose 2026-05-18).
  </read_first>
  <action>
    Crear `.planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md` con esta estructura:

    ```markdown
    # Plan 07b — AUDIT (1-página)

    **Status:** Pre-implementación
    **Approach:** Nivel 2 defense-in-depth — upgrade Flash-Lite → Flash NORMAL + reglas de polaridad
    **D-09 status:** UNLOCKED (documentar como D-31 en `DISCUSSION-LOG.md` durante este plan o post-cierre)

    ## Por qué Plan 07 v1 (semantic-only) no cerró el bug

    Plan 07 v1 reescribió 107 items de `nunca_decir` en 18 KBs como proposiciones declarativas
    afirmativas. Después del re-run Smoke A V2:

    | Caso | V1 result | V2 result | Δ |
    |---|---|---|---|
    | 1  — "puedo si tomo alcohol?"   | PASS | **FAIL** | REGRESIÓN |
    | 2  — "estoy embarazada..."      | FAIL | **PASS** | ARREGLADO |
    | 13 — "cuántas horas dura..."    | FAIL | **PASS** | ARREGLADO |
    | 14 — "qué hábitos ayudan..."    | FAIL | **PASS** | ARREGLADO |
    | 16 — "envían a Miami?"          | PASS | **FAIL** | REGRESIÓN |

    Net: +1 PASS pero con 2 regresiones. Conclusión: **musical chairs** — el fix semántico
    mueve el false-positive de un item/caso a otro.

    ## Root cause estructural (no del item específico)

    Gemini Flash-Lite tiene **limitación intrínseca para razonar polaridad** cuando hay overlap
    de palabras tópicas entre la respuesta y el item prohibido. No distingue consistentemente:

    - "Respuesta AFIRMA la aserción prohibida" → debería violar
    - "Respuesta NIEGA la aserción prohibida" → NO debería violar
    - "Respuesta REDIRIGE al profesional sin afirmar" → NO debería violar
    - "Respuesta es NEUTRAL respecto a la aserción" → NO debería violar

    Ejemplo case 1 V2: respuesta = handoff silente (string vacío), item = "Combinar el producto
    con alcohol es seguro o recomendable." → Flash-Lite emite `violates=true` aunque la
    respuesta esté literalmente vacía. False-positive estructural.

    ## Fix locked (Jose 2026-05-18) — Nivel 2 defense-in-depth

    Dos cambios mínimos en `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`:

    1. **Model swap línea 36:** `gemini-2.5-flash-lite` → `gemini-2.5-flash` (Flash NORMAL).
       - Razón: Flash NORMAL razona polaridad ~5x mejor que Flash-Lite (lección Iter 5b + research).
       - Costo: ~$6/mes delta en prod (1000 ses/día × 10 turns × $0.000022/check). Aceptado.

    2. **System prompt extendido** con 4 reglas de polaridad explícitas + 1 ejemplo verbatim.

    ### Unlock D-09 — justificación con evidencia

    D-09 lockeó "checkNuncaDecir sigue Flash-Lite. Ya funciona. No tocar." en discuss-phase
    inicial (2026-05-15/16) SIN evidencia empírica del musical chairs. Plan 07 v1 generó esa
    evidencia. El lock se condicionó a "funciona"; el musical chairs demuestra que NO funciona
    para razonamiento de polaridad con items declarativos. El unlock es proporcional y
    documentado.

    El ejecutor (o Jose post-plan) appendea D-31 a `DISCUSSION-LOG.md` con:
    - Status: D-09 UNLOCKED
    - Razón: evidencia Plan 07 v1 musical chairs (link al evidence file)
    - Trade-off: +$6/mes en prod, beneficio = arreglar polaridad estructural

    ## Out of scope (anti-scope-creep)

    - Schema refactor (`{violates, violatedRule}` stays).
    - Multi-call / two-step check.
    - KB rewrites (Plan 07 v1 baseline preservado).
    - Otros files runtime del sub-loop.

    ## Decision gate

    Plan 07b cierra exitosamente si Smoke A V3 retorna:
    - 17/17 PASS judge OVERALL
    - 0/17 invenciones
    - Cases 1, 2, 13, 14, 16 todos PASS

    Cierra con excepción aceptable si:
    - 16/17 PASS + 0 invenciones + cases 2/13/14 PASS + UNA falla residual NO en cases 1 ó 16
      (regresión nueva de un caso V1+V2 PASS es show-stopper).

    Escala a Plan 07c (Schema-CoT Nivel 3) si:
    - <16/17 PASS
    - ≥1 invención nueva
    - Cases 1 ó 16 siguen fallando después del upgrade
    ```

    Cerrar el archivo con un footer de "Next" apuntando a Task 7b.2.
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md &amp;&amp; wc -l .planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md | awk '{print $1}' | tr -d '\n' &amp;&amp; echo " líneas (esperado: ≥40)"</automated>
  </verify>
  <done>
    07b-AUDIT.md existe, ≥40 líneas, contiene tabla V1 vs V2, justifica unlock D-09 con evidencia, lista los 2 cambios concretos, define decision gate.
  </done>
</task>

<task type="auto">
  <name>Task 7b.2 — Modificar `nunca-decir-check.ts` (model swap + polarity prompt)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts</files>
  <read_first>
    - `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` completo (estado HEAD 7ce7c5a).
    - `<interfaces>` block de este plan (qué se queda intacto).
    - `<objective>` (las 4 reglas de polaridad y el ejemplo verbatim que el prompt debe contener).
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` con estos cambios EXACTOS:

    **Cambio 1 — File header comment** (líneas 11-27 del archivo actual, bloque doc-comment de `checkNuncaDecir`):

    Agregar al final del bloque doc-comment una nueva línea ANTES del cierre `*/`:

    ```
    *
    * D-09 UNLOCKED 2026-05-18 (Plan 07b): model upgrade Flash-Lite → Flash NORMAL +
    * polarity rules en system prompt. Razón: musical chairs evidence post-Plan 07 v1
    * (`SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`). Costo delta ~$6/mes. Unlock documentado
    * como D-31 en `DISCUSSION-LOG.md`.
    ```

    **Cambio 2 — Model swap** (línea 36 actual):

    ```ts
    // ANTES:
    model: google('gemini-2.5-flash-lite'),

    // DESPUÉS:
    model: google('gemini-2.5-flash'),
    ```

    **Cambio 3 — System prompt extendido** (línea 37-38 actual, el string del `system:`):

    Reemplazar:
    ```ts
    system:
      'You are a content compliance checker. Return whether the candidate text violates any of the given rules.',
    ```

    Con:
    ```ts
    system: [
      'You are a content compliance checker for a customer-service response.',
      '',
      'Each forbidden rule is a DECLARATIVE AFFIRMATIVE PROPOSITION that the response',
      'might or might not assert. Your job: decide whether the candidate response',
      'AFFIRMS any of the forbidden propositions.',
      '',
      'POLARITY RULES — apply strictly:',
      '',
      '1. AFFIRMS — Response asserts the forbidden proposition as true.',
      '   → violates = true, violatedRule = <rule that was affirmed>.',
      '',
      '2. NEGATES — Response explicitly says the proposition is FALSE, or denies it,',
      '   or recommends NOT doing what the proposition affirms.',
      '   → violates = false (the response is doing the OPPOSITE of the forbidden act).',
      '',
      '3. REDIRECTS — Response acknowledges the topic but redirects to a professional,',
      '   to a human handoff, or says "consult your doctor" without affirming.',
      '   → violates = false (no assertion of the forbidden proposition).',
      '',
      '4. NEUTRAL — Response does not touch the topic of the rule at all, or is empty',
      '   (silent handoff). Empty/null responses NEVER violate anything.',
      '   → violates = false.',
      '',
      'EXAMPLE — negation that should NOT violate:',
      '  Rule: "El producto es seguro durante el embarazo."',
      '  Response: "No recomendamos el uso durante el embarazo, consultá con tu ginecólogo."',
      '  → violates = false (response NEGATES the rule, not affirms).',
      '',
      'Only mark violates=true when the response EXPLICITLY AFFIRMS the forbidden proposition.',
      'When in doubt, prefer violates=false — false-positives break customer trust.',
    ].join('\n'),
    ```

    **Cambio 4 — User prompt reminder (opcional, recomendado)** (línea 41-47 actual, el `messages[0].content` string):

    Mantener el contenido existente y AGREGAR una línea final antes del `Return { violates: bool, violatedRule?: string }.`:

    ```ts
    content:
      `Candidate response: """${args.candidateText}"""\n\n` +
      `Forbidden rules (NUNCA decir — each is a proposition the response might affirm):\n` +
      args.nuncaDecirRules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
      `\n\nApply POLARITY RULES from the system prompt. ` +
      `Mark violates=true ONLY if the response AFFIRMS one of the rules.\n\n` +
      `Return { violates: bool, violatedRule?: string }.`,
    ```

    **Constraints duros:**

    - `CheckSchema` SE QUEDA exactamente como está (líneas 6-9).
    - `safetySettings` block (BLOCK_NONE × 4) SE QUEDA tal cual (líneas 55-63).
    - `providerOptions` block estructura SE QUEDA.
    - `runWithPurpose('subloop_nunca_decir', ...)` SE QUEDA (mismo trace key).
    - El return `output.violates ? { ok: false, violation: output.violatedRule } : { ok: true }` SE QUEDA.
    - `import` statements SE QUEDAN.
    - Sin formato Prettier override (deja que el editor respete config existente).

    **Verificación inline post-edit:**

    ```bash
    grep -E "gemini-2.5-flash[^-]" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts | wc -l
    # esperado: 1 (la única línea con `gemini-2.5-flash` exact match — `flash-lite` no debe matchear)

    grep -c "POLARITY RULES" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
    # esperado: ≥1

    grep -c "AFFIRMS\|NEGATES\|REDIRECTS\|NEUTRAL" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
    # esperado: ≥4

    # Sanity: CheckSchema sigue intacto
    grep -c "z.object({" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
    # esperado: 1

    grep -c "BLOCK_NONE" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
    # esperado: 4
    ```

    Si typecheck del proyecto rompe (improbable — el cambio es solo strings):

    ```bash
    npx tsc --noEmit -p . 2>&1 | head -20
    ```

    Si hay error, fix antes de continuar.
  </action>
  <verify>
    <automated>grep -c "gemini-2.5-flash[^-]" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts | tr -d '\n' &amp;&amp; echo " (model match — esperado: 1) " &amp;&amp; grep -c "POLARITY RULES" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts | tr -d '\n' &amp;&amp; echo " (polarity rules — esperado: ≥1) " &amp;&amp; grep -c "BLOCK_NONE" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts | tr -d '\n' &amp;&amp; echo " (safety preserved — esperado: 4)"</automated>
  </verify>
  <done>
    `nunca-decir-check.ts` editado. `git diff` muestra cambios SOLO en líneas del header comment, model line, system prompt y user prompt. CheckSchema + safetySettings + return shape intactos. Sin errores de typecheck.
  </done>
</task>

<task type="auto">
  <name>Task 7b.3 — Crear `nunca-decir-check.test.ts` con 5 tests de polaridad</name>
  <files>src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts</files>
  <read_first>
    - `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (post Task 7b.2).
    - `src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts` (patrón de mock vitest + estructura describe/it).
    - `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` (patrón adicional si aplica).
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` con 5 tests
    cubriendo los escenarios de polaridad. El test mockea `generateText` de `ai` y
    `runWithPurpose` para controlar el output del LLM y validar que el wrapper
    `checkNuncaDecir` mapea correctamente al contract `{ ok, violation? }`.

    **Importante — el test valida el WRAPPER, no la decisión del LLM.** El LLM es mockeado.
    Lo que validamos es:
    - early-return cuando `nuncaDecirRules` está vacío (sin llamar al modelo).
    - mapping de `output.violates=true` → `{ ok: false, violation: output.violatedRule }`.
    - mapping de `output.violates=false` → `{ ok: true }`.
    - el `system` prompt enviado al modelo contiene "POLARITY RULES" (sanity check del prompt).
    - el `model` selector usa `gemini-2.5-flash` y NO `gemini-2.5-flash-lite`.

    ```ts
    // ============================================================================
    // Tests for sub-loop/nunca-decir-check.ts — Plan 07b (D-09 unlock).
    //
    // Standalone: somnio-v4-rag-generative / Plan 07b.
    //
    // Coverage:
    //   1. Early-return cuando rules.length === 0 (no llama al modelo).
    //   2. AFFIRMS — output.violates=true → ok=false con violation populated.
    //   3. NEGATES — output.violates=false → ok=true (mock simula que el LLM razonó polaridad).
    //   4. REDIRECTS — idem NEGATES desde el shape (el wrapper no distingue, el LLM sí).
    //   5. NEUTRAL / handoff silente (empty candidateText) — output.violates=false → ok=true.
    //
    // El LLM mockeado: el test NO valida que el LLM razone polaridad correctamente —
    // eso lo valida Smoke A V3 (integración real). Estos tests aseguran que el wrapper
    // de TypeScript mapea correctamente el output del modelo al contract del consumer
    // y que el prompt enviado al modelo contiene las polarity rules.
    // ============================================================================

    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Mock ai SDK ANTES de importar el módulo under test.
    const generateTextMock = vi.fn()

    vi.mock('ai', async () => {
      const actual = await vi.importActual<typeof import('ai')>('ai')
      return {
        ...actual,
        generateText: (...args: unknown[]) => generateTextMock(...args),
      }
    })

    vi.mock('@ai-sdk/google', () => ({
      google: vi.fn((modelId: string) => ({ __mockModelId: modelId })),
    }))

    vi.mock('@/lib/observability', () => ({
      runWithPurpose: <T,>(_purpose: string, fn: () => Promise<T>): Promise<T> => fn(),
    }))

    // Import DESPUÉS de los mocks.
    import { checkNuncaDecir } from '../nunca-decir-check'

    describe('checkNuncaDecir (Plan 07b — D-09 unlock)', () => {
      beforeEach(() => {
        generateTextMock.mockReset()
      })

      it('Test 1: early-return ok=true cuando nuncaDecirRules está vacío (no llama al modelo)', async () => {
        const result = await checkNuncaDecir({
          candidateText: 'cualquier texto',
          nuncaDecirRules: [],
        })
        expect(result).toEqual({ ok: true })
        expect(generateTextMock).not.toHaveBeenCalled()
      })

      it('Test 2: AFFIRMS — output.violates=true mapea a ok=false con violation populated', async () => {
        generateTextMock.mockResolvedValueOnce({
          output: {
            violates: true,
            violatedRule: 'El producto cura el insomnio.',
          },
        })

        const result = await checkNuncaDecir({
          candidateText: 'El Elixir cura el insomnio para siempre.',
          nuncaDecirRules: ['El producto cura el insomnio.'],
        })

        expect(result).toEqual({
          ok: false,
          violation: 'El producto cura el insomnio.',
        })
        expect(generateTextMock).toHaveBeenCalledTimes(1)
      })

      it('Test 3: NEGATES — output.violates=false mapea a ok=true (LLM razonó negación)', async () => {
        generateTextMock.mockResolvedValueOnce({
          output: { violates: false },
        })

        const result = await checkNuncaDecir({
          candidateText:
            'No recomendamos el uso durante el embarazo, consultá con tu ginecólogo.',
          nuncaDecirRules: ['El producto es seguro durante el embarazo.'],
        })

        expect(result).toEqual({ ok: true })
      })

      it('Test 4: NEUTRAL / handoff silente — candidateText vacío y violates=false → ok=true', async () => {
        generateTextMock.mockResolvedValueOnce({
          output: { violates: false },
        })

        const result = await checkNuncaDecir({
          candidateText: '',
          nuncaDecirRules: [
            'Combinar el producto con alcohol es seguro o recomendable.',
            'El envío fuera de Colombia está aprobado por el bot.',
          ],
        })

        expect(result).toEqual({ ok: true })
      })

      it('Test 5: prompt + model contract — system prompt contiene POLARITY RULES y model es gemini-2.5-flash (NO flash-lite)', async () => {
        generateTextMock.mockResolvedValueOnce({
          output: { violates: false },
        })

        await checkNuncaDecir({
          candidateText: 'texto neutral',
          nuncaDecirRules: ['una regla'],
        })

        expect(generateTextMock).toHaveBeenCalledTimes(1)
        const callArgs = generateTextMock.mock.calls[0]?.[0] as {
          model: { __mockModelId: string }
          system: string
        }

        // D-09 unlock: model is Flash NORMAL, not Flash-Lite.
        expect(callArgs.model.__mockModelId).toBe('gemini-2.5-flash')
        expect(callArgs.model.__mockModelId).not.toBe('gemini-2.5-flash-lite')

        // Polarity rules present in system prompt.
        expect(callArgs.system).toContain('POLARITY RULES')
        expect(callArgs.system).toContain('AFFIRMS')
        expect(callArgs.system).toContain('NEGATES')
        expect(callArgs.system).toContain('REDIRECTS')
        expect(callArgs.system).toContain('NEUTRAL')
      })
    })
    ```

    **Constraints:**
    - El test mockea `generateText` y `google` — NO hace network calls.
    - Si el setup vitest del proyecto no expone `vi.importActual` o el shape difiere, el ejecutor ajusta el mock setup respetando los patrones de `safe-output.test.ts` (que está verde en main).
    - Si el path import `@/lib/observability` no resuelve en test environment, ajustar a path relativo `../../../../observability`.
    - Sin `any` casts agresivos — el `as { ... }` cast del callArgs es la única excepción para acceder al mock argument typed.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts &amp;&amp; npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    `nunca-decir-check.test.ts` existe con 5 tests, todos verdes. Mocks aislados de network.
  </done>
</task>

<task type="auto">
  <name>Task 7b.4 — Correr suite sub-loop completa + typecheck</name>
  <files></files>
  <read_first>
    - Lista de archivos en `src/lib/agents/somnio-v4/sub-loop/__tests__/` (5 archivos existentes + 1 nuevo).
  </read_first>
  <action>
    Ejecutar suites para asegurar zero regression:

    ```bash
    # 1. Tests del sub-loop completos (incluye nunca-decir-check.test.ts nuevo)
    npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/

    # 2. Typecheck del proyecto (sanity)
    npx tsc --noEmit -p . 2>&1 | tail -20
    ```

    **Criterios:**
    - Tests del sub-loop 100% verdes (los 5 archivos previos + nunca-decir-check.test.ts).
    - Typecheck: cero errores nuevos atribuibles a Plan 07b.

    **Si rompe algo:**
    - Errores en test files preexistentes (few-shots.test.ts, etc.) → investigar si son pre-existing (corre `git stash` + re-run para confirmar baseline). Si pre-existing y no causados por Plan 07b → documentar en SUMMARY como deuda no-relacionada, continuar.
    - Errores nuevos en `nunca-decir-check.test.ts` → fix mock setup hasta verde.
    - Errores nuevos en typecheck atribuibles a edits de Task 7b.2 → fix.
    - NO modificar ningún otro archivo del sub-loop para "arreglar" tests rotos preexistentes — out of scope.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/ 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    Sub-loop test suite 100% verde con el nuevo test file incluido. Typecheck sin errores nuevos atribuibles a este plan.
  </done>
</task>

<task type="auto">
  <name>Task 7b.5 — Re-correr Smoke A (V3) sobre los 17 casos</name>
  <files>.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md</files>
  <read_first>
    - `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` líneas 55-65 (constante `RESULTS_PATH`).
    - `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md` (qué cases comparar).
    - `SMOKE-A-RESULTS.md` (V1 baseline — para diff de las regresiones que arreglamos).
  </read_first>
  <action>
    1. **Backup defensivo** (NO sobreescribir V1 ni V2 evidence):
       ```bash
       # V1 file ya está en main, no backup necesario.
       # V2 evidence está en SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md (preserved).
       ls -la .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md \
              .planning/standalone/somnio-v4-rag-generative/SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md
       ```

    2. **Patch temporal de `RESULTS_PATH`** (estrategia preferida — `sed -i` + revert al final):

       ```bash
       sed -i "s|SMOKE-A-RESULTS\\.md|SMOKE-A-RESULTS-V3.md|g" \
           src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts

       # Verificar el patch:
       grep "SMOKE-A-RESULTS-V3" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
       # esperado: ≥1 línea (la constante RESULTS_PATH y posiblemente comentarios)
       ```

    3. **Confirmar env loaded** (paid tier Gemini):
       ```bash
       grep -E "^GOOGLE_GENERATIVE_AI_API_KEY=" .env.local | wc -l
       # esperado: 1
       ```

    4. **Correr Smoke A V3:**
       ```bash
       npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
       ```
       Duración esperada: ~13 min (paid tier + throttle 7s × 17 casos).

    5. **Verificar criterios de éxito:**
       ```bash
       RESULTS=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md
       echo "Judge OVERALL PASS:    $(grep -c 'OVERALL: PASS' $RESULTS)"
       echo "Judge OVERALL FAIL:    $(grep -c 'OVERALL: FAIL' $RESULTS)"
       echo "Invenciones (judge):   $(grep -c 'Y (judge detected' $RESULTS)"
       echo "Runtime errors:        $(grep -c 'RUNTIME ERROR' $RESULTS)"
       ```

       **Criterios verde:**
       - Judge OVERALL PASS = **17/17**
       - Invenciones (judge) = **0/17**
       - Runtime errors = **0/17**
       - Cases 1, 2, 13, 14, 16 muestran `OVERALL: PASS` (buscar headers `### Case 1 —`, `### Case 2 —`, etc.)

       **Criterios amarillos (excepción aceptable — single case fail NO en cases 1 ó 16):**
       - 16/17 PASS + 0 invenciones + cases 2/13/14/16/1 todos PASS pero UN caso diferente falla.

       **Criterios rojos (escalation):**
       - <16/17 PASS.
       - ≥1 invención (judge marca `Y`).
       - Caso V1+V2 PASS regresiona en V3 (e.g. case 5 lupus pasó en V1+V2, falla en V3).
       - Cases 1 ó 16 siguen FAIL.

    6. **Revertir el patch temporal** (CRÍTICO — no commitear el sed):
       ```bash
       git checkout src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
       grep "SMOKE-A-RESULTS-V3" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts | wc -l
       # esperado: 0 (revert exitoso)
       grep "SMOKE-A-RESULTS\\.md" src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts | wc -l
       # esperado: ≥1 (path V1 restaurado)
       ```

    7. **Si criterios rojos:** STOP push. Documentar en `07b-SUMMARY.md` el patrón observado y escalar a Plan 07c (Schema-CoT). NO continuar a Task 7b.6.

    8. **Si criterios amarillos:** continuar a Task 7b.6 con la excepción anotada para Task 7b.7 (SUMMARY).

    9. **Si criterios verdes:** continuar a Task 7b.6 (siempre — single refinement opcional o saltar a Task 7b.7).
  </action>
  <verify>
    <automated>RESULTS=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md; test -f $RESULTS &amp;&amp; PASS=$(grep -c 'OVERALL: PASS' $RESULTS) &amp;&amp; INV=$(grep -c 'Y (judge detected' $RESULTS) &amp;&amp; echo "V3 PASS=$PASS / INV=$INV (criterio verde: PASS=17 INV=0; amarillo: PASS=16 INV=0; rojo: PASS&lt;16 or INV&gt;0)"</automated>
  </verify>
  <done>
    SMOKE-A-RESULTS-V3.md existe. Test runner restaurado a su estado original (sin patch sed). Resultado clasificado verde/amarillo/rojo según criterios. Si rojo → escalation flag para Task 7b.7.
  </done>
</task>

<task type="auto">
  <name>Task 7b.6 — Refinamiento condicional (1 ciclo MAX)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (potencial) o src/lib/agents/somnio-v4/knowledge/&lt;subset&gt;.md (potencial)</files>
  <read_first>
    - `SMOKE-A-RESULTS-V3.md` — casos específicos fallidos (si los hay).
    - `nunca-decir-check.ts` actual.
    - KB del caso fallido (solo si la decision tree apunta a item rewrite).
  </read_first>
  <action>
    **SOLO correr si Task 7b.5 arrojó criterio amarillo (16/17 con UN caso residual) — NO si rojo (que escala a Plan 07c).**

    **Si Task 7b.5 fue verde (17/17) → SKIP esta task completamente, ir a Task 7b.7.**

    Decision tree (1 ciclo MAX — no looping):

    1. **Identificar el case residual y su `reason`:**
       - Si `reason: nunca_decir_violation: <regla>` → es polaridad residual.
       - Si `reason: low_response_confidence` → es bajo confidence (generación, no guardrail).
       - Si `reason: rag_generated` pero judge marca FAIL → es generación, no guardrail.

    2. **Caso polaridad residual (case fail por `nunca_decir_violation`):**
       - **Si es case 1 o case 16 (los V2-regressions originales)** → diagnosis: el modelo Flash NORMAL + polarity prompt todavía no resuelve este case específico. Probablemente la regla específica del KB necesita micro-rewrite (semantic top-up encima del model upgrade). Localizar el item exacto que disparó la violation. Aplicar UN refinamiento (typically: clarificar la regla con un sujeto/predicado más estrecho). Re-syncear vía `pnpm knowledge:sync`. Re-correr SOLO ese case (o re-correr full smoke si test no soporta filter). **Boundary: 1 ciclo. Si después de 1 ciclo no pasa → escala.**
       - **Si es un case NUEVO (no case 1 ni 16)** → diagnosis: el upgrade introdujo una sensibilidad nueva. Documentar en SUMMARY. NO seguir iterando. Decision: escala a Plan 07c.

    3. **Caso bajo confidence o RAG generation fail:**
       - Out of scope Plan 07b. Estos no son problemas del guardrail.
       - Documentar como deuda separada en SUMMARY.
       - Plan 07b cierra con el resultado actual.

    **Anti-loop guardrail:** UN solo ciclo. Si después del refinamiento el case sigue fallando, documenta y para. No volver a Task 7b.2 / 7b.3 / 7b.5 múltiples veces.

    **Si se hizo refinamiento KB:** `pnpm knowledge:sync` + verificar 18/18 OK (Regla 5).
  </action>
  <verify>
    <automated>RESULTS=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md; PASS=$(grep -c 'OVERALL: PASS' $RESULTS 2>/dev/null || echo 0); echo "Post-refine (si aplicó): PASS=$PASS"</automated>
  </verify>
  <done>
    Si se invocó refinamiento: boundary 1-ciclo respetada, resultado documentado. Si se skipeó (criterio verde): nota en SUMMARY explicando que no fue necesario.
  </done>
</task>

<task type="auto">
  <name>Task 7b.7 — Crear 07b-SUMMARY.md (cierre del plan)</name>
  <files>.planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md</files>
  <read_first>
    - `07b-AUDIT.md` (Task 7b.1).
    - `SMOKE-A-RESULTS-V3.md` (Task 7b.5).
    - `SMOKE-A-RESULTS.md` (V1 — Plan 05).
    - `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md` (V2 baseline).
  </read_first>
  <action>
    Crear `.planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md`:

    ```markdown
    # Plan 07b — SUMMARY

    **Status:** SHIPPED YYYY-MM-DD (fill in actual)
    **HEAD git:** <sha del último commit del plan>
    **Approach:** Nivel 2 defense-in-depth — upgrade Flash-Lite → Flash NORMAL + polarity rules en system prompt de `checkNuncaDecir`. D-09 UNLOCKED con evidencia musical chairs.
    **Resultado:** <una línea — PASS X/17, INV 0/17, cases 1/2/13/14/16 all PASS>

    ## Audit findings (Task 7b.1)
    - Plan 07 v1 (semantic-only) shippeó con +1 net PASS pero 2 regresiones (cases 1 alcohol y 16 Miami).
    - Root cause: Gemini Flash-Lite tiene limitación intrínseca para razonar polaridad cuando hay overlap tópico — los KB rewrites movieron el false-positive sin eliminarlo (musical chairs).
    - Decision Jose 2026-05-18: upgrade modelo + polarity prompt. Costo aceptado: ~$6/mes en prod.

    ## Cambios aplicados

    **Archivo runtime modificado:** `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`

    1. **Model swap línea 36:** `gemini-2.5-flash-lite` → `gemini-2.5-flash` (Flash NORMAL).
    2. **System prompt extendido** con 4 reglas de polaridad (AFFIRMS / NEGATES / REDIRECTS / NEUTRAL) + 1 ejemplo verbatim de negación que NO debe violar.
    3. **User prompt** con reminder "Apply POLARITY RULES from the system prompt".
    4. **Header comment** documenta unlock D-09 con referencia a evidence file.

    **Preservado intacto:**
    - `CheckSchema` (`{violates, violatedRule}` z.object).
    - `safetySettings` BLOCK_NONE × 4 (contenido médico).
    - `providerOptions` block estructura.
    - `runWithPurpose('subloop_nunca_decir', ...)` trace key.
    - Return shape `{ ok: boolean, violation?: string }` y consumer en `index.ts`.

    **Tests añadidos:** `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` con 5 tests (early-return, AFFIRMS, NEGATES, NEUTRAL/handoff vacío, prompt+model contract).

    ## D-09 unlock — append D-31 a DISCUSSION-LOG.md

    El ejecutor (o Jose post-plan) appendea a `DISCUSSION-LOG.md`:

    ```markdown
    ### D-31 — Unlock D-09 (Flash-Lite → Flash NORMAL en nunca-decir-check)
    **Tema:** Motor LLM
    **Status:** locked (UNLOCKED D-09 + new lock para Flash NORMAL)
    **Decisión:** `checkNuncaDecir` migra de `gemini-2.5-flash-lite` a `gemini-2.5-flash` NORMAL,
    con system prompt extendido con polarity rules explícitas.

    **Por qué:** D-09 lockeó Flash-Lite SIN evidencia. Plan 07 v1 generó evidencia musical
    chairs (ver `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`) que demuestra que Flash-Lite no
    razona polaridad consistentemente. Plan 07b shippea fix.

    **Implica:** Costo delta ~$6/mes (1000 ses/día × 10 turns × $0.000022/check). Latencia
    delta esperada +50-200ms por check.

    **Validación:** Smoke A V3 — 17/17 PASS judge, 0 invenciones, cases 1+2+13+14+16 PASS.
    ```

    ## Per-case before/after comparison

    | Caso | Pregunta | V1 (Plan 05) | V2 (Plan 07 v1) | V3 (Plan 07b) |
    |---|---|---|---|---|
    | 1  | "puedo si tomo alcohol?"        | PASS | **FAIL** | <PASS|FAIL> |
    | 2  | "estoy embarazada..."           | FAIL | PASS | <PASS|FAIL> |
    | 3  | "se lo doy a mi hijo de 10?"    | PASS | PASS | <...> |
    | 4  | "tomo sertralina..."            | PASS | PASS | <...> |
    | 5  | "tengo lupus..."                | PASS | PASS | <...> |
    | 6  | "cómo se toma?"                 | PASS | PASS | <...> |
    | 7  | "qué ingredientes tiene?"       | PASS | PASS | <...> |
    | 8  | "cuánto trae el frasco?"        | PASS | PASS | <...> |
    | 9  | "es adictivo?"                  | PASS | PASS | <...> |
    | 10 | "cuánto tarda a Medellín?"      | PASS | PASS | <...> |
    | 11 | "cómo pago?"                    | PASS | PASS | <...> |
    | 12 | "puedo devolverlo si no me sirve?" | PASS | PASS | <...> |
    | 13 | "cuántas horas dura el efecto?" | FAIL | PASS | <...> |
    | 14 | "qué hábitos ayudan a dormir?"  | FAIL | PASS | <...> |
    | 15 | "tengo apnea, puedo tomarlo?"   | PASS | PASS | <...> |
    | 16 | "envían a Miami?"               | PASS | **FAIL** | <PASS|FAIL> |
    | 17 | "puedo pagar con criptomonedas?" | PASS | PASS | <...> |

    ## Aggregate metrics

    | Métrica | V1 | V2 | V3 | Δ V1→V3 |
    |---|---|---|---|---|
    | Judge OVERALL PASS | 14/17 (82.4%) | 15/17 (88.2%) | X/17 | +N |
    | Judge OVERALL FAIL | 3/17 (17.6%) | 2/17 (11.8%) | X/17 | -N |
    | Invenciones (judge) | 0/17 | 0/17 | 0/17 | 0 (preserved) |
    | MISCALIBRATED_HIGH | 3/17 | 2/17 | X/17 | -N |
    | Cases polaridad PASS (1, 2, 13, 14, 16) | 3/5 | 3/5 | X/5 | +N |

    ## Decisión final

    - [ ] V3 verde (17/17 PASS) → Plan 07b CIERRA. Plan 06 (Smoke B) unblocked. Plan 08 (flip) post-Smoke-B.
    - [ ] V3 amarillo (16/17 con excepción NO en cases 1/16) → Plan 07b CIERRA con excepción documentada. Plan 06 unblocked.
    - [ ] V3 rojo (<16/17 o regresión nueva) → Plan 07b NO CIERRA. Escala a Plan 07c (Schema-CoT Nivel 3).

    ## Excepciones documentadas (si hay)

    <Si V3 amarillo, listar el case residual + justificación + plan de seguimiento>

    ## Pitfalls descubiertos

    - <e.g. "Flash NORMAL latencia delta +180ms p50 vs Flash-Lite — dentro del presupuesto sub-loop p50 6s">
    - <e.g. "Costo per-check ~$0.000026 — match estimación Jose ±10%">

    ## v4 sigue dormant

    ```sql
    SELECT count(*) FROM routing_rules
    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
      AND active=true AND event::text LIKE '%somnio-sales-v4%';
    -- Esperado: 0.
    ```
    Verificado <fecha/hora>.

    ## Rollback plan (si post-push aparece regresión)

    ```bash
    # Revert los 3 commits de Plan 07b:
    git revert <commit-3-sha> --no-edit
    git revert <commit-2-sha> --no-edit
    git revert <commit-1-sha> --no-edit
    git push origin main

    # Estado post-revert: HEAD vuelve a Plan 07 v1 baseline (KBs declarativos, Flash-Lite check).
    # v4 sigue dormant → cero impacto productivo.
    # Cero DB rollback necesario (Plan 07b NO toca DB).
    ```

    ## Files modified (commits atómicos)

    - `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (runtime)
    - `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` (nuevo test)
    - `.planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md`
    - `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md`
    - `.planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md`
    - `.planning/standalone/somnio-v4-rag-generative/STATUS.md`
    - `.planning/STATE.md`

    ## Next

    - Si V3 verde/amarillo: Plan 06 (Smoke B) — 10 casos regression.
    - Si V3 rojo: Plan 07c (Schema-CoT — agregar campo `polarity` al CheckSchema con CoT estructurado).
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md &amp;&amp; wc -l .planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md | awk '{print $1}' | tr -d '\n' &amp;&amp; echo " líneas (esperado: ≥130)"</automated>
  </verify>
  <done>
    07b-SUMMARY.md existe ≥130 líneas. Tabla per-case completa V1/V2/V3. Aggregate metrics filled. D-31 text listo para append. Decision marked.
  </done>
</task>

<task type="auto">
  <name>Task 7b.8 — Update STATUS.md + STATE.md</name>
  <files>.planning/standalone/somnio-v4-rag-generative/STATUS.md, .planning/STATE.md</files>
  <read_first>
    - `STATUS.md` actual (líneas 14-30 — checklist + tabla Plans status).
    - `.planning/STATE.md` actual (si existe; sino el ejecutor lo crea con format mínimo).
  </read_first>
  <action>
    **STATUS.md:**

    1. **Last updated:** YYYY-MM-DD + nota "Plan 07b SHIPPED — Smoke A V3 X/17 PASS".
    2. **PHASES — checklist alto nivel:** agregar línea entre Plan 07 y Plan 06:
       ```
       - [x] **Execute-phase plan 07b (iter — Flash NORMAL + polarity rules)** — DONE YYYY-MM-DD (Smoke A V3 X/17 PASS, D-09 unlocked)
       ```
    3. **Plans status table:** agregar fila Plan 07b entre Plan 07 y Plan 06:
       | 07b | Iter Flash NORMAL + polarity prompt | **DONE YYYY-MM-DD** (X/17 PASS) | `<sha>` |
    4. **Sección Smoke A:** agregar referencia a SMOKE-A-RESULTS-V3.md + tabla comparison V1/V2/V3 abreviada.
    5. **Next action AHORA:** "Plan 06 (Smoke B) unblocked — correr `npx vitest run smoke-rag-b.test.ts`" (asumiendo verde/amarillo).

    **STATE.md:** Actualizar:
    ```markdown
    # Standalone State

    **Last updated:** YYYY-MM-DD
    **Position:** Plan 07b SHIPPED. Siguiente: Plan 06 (Smoke B).
    **HEAD:** <sha>
    **Blockers:** ninguno.
    **v4 status:** DORMANT (sin routing rule).
    ```

    Si STATE.md no existe, crearlo con ese formato.

    Si el resultado fue ROJO en Task 7b.5, ajustar:
    - STATUS.md "Next action": "Plan 07c (Schema-CoT) requerido — ver 07b-SUMMARY.md decision tree".
    - STATE.md "Blockers": "Plan 07b ROJO — escalation a Plan 07c pendiente decisión Jose".
  </action>
  <verify>
    <automated>grep -E "Plan 07b.*DONE|07b.*SHIPPED" .planning/standalone/somnio-v4-rag-generative/STATUS.md | head -3</automated>
  </verify>
  <done>
    STATUS.md tiene Plan 07b en checklist + tabla. STATE.md updated. Next action reflejo del outcome (verde/amarillo/rojo).
  </done>
</task>

<task type="auto">
  <name>Task 7b.9 — Commits atómicos + push origin/main (Regla 1)</name>
  <files></files>
  <read_first>
    - `git status` para confirmar set de archivos modificados.
    - `git diff --stat` para verificar SCOPE (cero archivos fuera de files_modified).
  </read_first>
  <action>
    **Pre-commit sanity:**

    ```bash
    # Scope check — files modificados deben ser exactamente los del frontmatter
    git status --short
    git diff --stat
    ```

    Esperado modified/new:
    - `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (M)
    - `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` (??)
    - `.planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md` (??)
    - `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md` (??)
    - `.planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md` (??)
    - `.planning/standalone/somnio-v4-rag-generative/STATUS.md` (M)
    - `.planning/STATE.md` (M or ??)

    **Si aparece otro archivo modificado** (e.g. smoke-rag-a.test.ts del patch sed olvidado): STOP. Ejecutar `git checkout` sobre ese archivo y verificar diff de nuevo.

    **3 commits atómicos:**

    **Commit 1 — Task 7b.2:**
    ```bash
    git add src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
    git commit -m "$(cat <<'EOF'
    feat(somnio-v4-rag 07b): upgrade nunca-decir-check Flash-Lite → Flash NORMAL + polarity rules

    Plan 07 v1 (semantic-only) cerró 3 false-positives del guardrail pero introdujo
    2 regresiones (cases 1 alcohol, 16 Miami) — musical chairs evidence en
    SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md. Root cause: Flash-Lite tiene limitación
    intrínseca razonando polaridad con overlap tópico.

    Nivel 2 defense-in-depth:
    - Model swap línea 36: gemini-2.5-flash-lite → gemini-2.5-flash NORMAL
    - System prompt con 4 polarity rules explícitas (AFFIRMS/NEGATES/REDIRECTS/NEUTRAL)
      + 1 ejemplo verbatim de negación que NO viola
    - User prompt reminder

    D-09 UNLOCKED — documentado como D-31 en DISCUSSION-LOG.md.
    CheckSchema + safetySettings + return shape preservados.
    Costo delta ~\$6/mes en prod (Jose aceptó budget 2026-05-18).
    v4 sigue dormant (sin routing rule).

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
    EOF
    )"
    ```

    **Commit 2 — Task 7b.3:**
    ```bash
    git add src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts
    git commit -m "$(cat <<'EOF'
    test(somnio-v4-rag 07b): añadir tests de polaridad para checkNuncaDecir

    5 tests cubriendo:
    - Early-return cuando rules.length === 0 (no llama al modelo)
    - AFFIRMS → ok=false con violation populated
    - NEGATES → ok=true (mock simula que el LLM razonó polaridad)
    - NEUTRAL / handoff silente (candidateText vacío) → ok=true
    - Prompt + model contract (POLARITY RULES presente, model = gemini-2.5-flash)

    Tests aislan network via vi.mock de 'ai' + '@ai-sdk/google' + '@/lib/observability'.

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
    EOF
    )"
    ```

    **Commit 3 — Tasks 7b.1, 7b.5, 7b.7, 7b.8:**
    ```bash
    git add .planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md \
            .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md \
            .planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md \
            .planning/standalone/somnio-v4-rag-generative/STATUS.md \
            .planning/STATE.md
    git commit -m "$(cat <<'EOF'
    docs(somnio-v4-rag 07b): Smoke A V3 + AUDIT + SUMMARY + STATUS post-plan-07b

    Re-run Smoke A V3 con guardrail upgrade: PASS X/17, INV 0/17.
    Cases 1/2/13/14/16 todos PASS (V1 fails arreglados + V2 regresiones recuperadas).

    07b-AUDIT.md captura evidence musical chairs + justificación unlock D-09.
    07b-SUMMARY.md tiene comparison V1/V2/V3 per case + aggregate metrics + decision.
    STATUS.md marca Plan 07b DONE + Plan 06 unblocked.

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
    EOF
    )"
    ```

    **Push (Regla 1):**
    ```bash
    git push origin main
    ```

    **Verificación post-push:**
    ```bash
    test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" && echo "PUSH OK" || echo "PUSH FAILED"
    git log --oneline -5 origin/main
    ```

    Confirmar que los 3 commits están en HEAD y origin/main matches.

    **NOTA Regla 6:** el push es seguro porque:
    - v4 sigue dormant (sin routing rule activa).
    - El cambio es exclusivamente en código que solo se ejecuta cuando el agente v4 recibe tráfico — y nadie le manda tráfico.
    - v3 productivo intocado.
    - Sin migraciones SQL (Regla 5 N/A).
  </action>
  <verify>
    <automated>test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" &amp;&amp; echo "PUSH OK" || echo "PUSH FAILED" ; git log --oneline -5 origin/main</automated>
  </verify>
  <done>
    3 commits atómicos en main (feat runtime + test + docs). Push exitoso. `git status` clean. HEAD == origin/main. v4 dormant verificable via SQL.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Input al checker (`candidateText` generado por Flash NORMAL en generation-call.ts) → prompt del Flash NORMAL guardrail | El texto candidato puede contener cualquier output del LLM de generación. El guardrail debe ser resiliente a candidate texts adversariales o vacíos (handoff silente). Plan 07b refuerza con polarity rules explícitas. |
| Reglas declarativas (`agent_knowledge_base.nunca_decir`) → user prompt del Flash NORMAL | Las reglas vienen de KBs repo-tracked + populadas por `pnpm knowledge:sync` en Plan 07 v1. Cero superficie de injection externa. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-07b-01 | Repudiation | Flash NORMAL razona la polaridad PEOR que Flash-Lite en algún case que V1+V2 pasaba (regresión nueva) | HIGH | mitigate | Task 7b.5 verifica criterios rojos explícitamente — si un case V1+V2 PASS regresa V3 FAIL, NO push y escala a Plan 07c. Smoke A V3 corre los mismos 17 casos verbatim que V1 y V2 — comparison es directa. |
| T-07b-02 | Tampering | El patch temporal de `RESULTS_PATH` queda commiteado por accidente y rompe el path por defecto en main | HIGH | mitigate | Task 7b.5 step 6 ejecuta `git checkout` del test file ANTES del commit set en Task 7b.9. Task 7b.9 pre-commit sanity verifica que `smoke-rag-a.test.ts` NO esté en el set modificado. Si aparece, STOP. |
| T-07b-03 | DoS | Flash NORMAL paid tier excede quota durante Smoke A V3 (17 cases × ~3 calls = ~50 calls) | LOW | accept | Paid tier ya validado en Plan 05 + Plan 07 v1 (17 + 17 = 34 runs previos sin quota fail). Throttle 7s entre cases es safety net. Si quota fail mid-run, vitest persiste resultados incrementalmente — re-correr es no-destructive. |
| T-07b-04 | Information Disclosure | `nunca-decir-check.test.ts` con mocks o fixtures expone strings de items prohibidos | LOW | accept | Los items son product policy (no PII, no creds). Ya viven en repo en `src/lib/agents/somnio-v4/knowledge/**/*.md`. Tests con strings literales no agregan superficie. |
| T-07b-05 | Elevation of Privilege | Latencia Flash NORMAL +200ms vs Flash-Lite hace que p50 sub-loop exceda 6s budget (Smoke A presupuesto) | MEDIUM | mitigate | Task 7b.5 reporta latencia por case en SMOKE-A-RESULTS-V3.md. Si p50 V3 excede 6s consistentemente, documentar en 07b-SUMMARY.md como pitfall pero NO bloquear cierre (latencia no era criterio gate — calidad sí). Si excede 10s, escalar. |
</threat_model>

<verification>
- [ ] Task 7b.1: `07b-AUDIT.md` existe ≥40 líneas con tabla V1 vs V2 + justificación unlock D-09 + decision gate.
- [ ] Task 7b.2: `nunca-decir-check.ts` editado. `grep "gemini-2.5-flash[^-]"` = 1 match. `grep "POLARITY RULES"` ≥ 1. `grep "BLOCK_NONE"` = 4 (preserved). CheckSchema + return shape intactos.
- [ ] Task 7b.3: `nunca-decir-check.test.ts` existe con 5 tests, todos verdes vía `npx vitest run`.
- [ ] Task 7b.4: Suite sub-loop completa 100% verde. Typecheck sin errores nuevos.
- [ ] Task 7b.5: `SMOKE-A-RESULTS-V3.md` existe. PASS ≥16/17 (verde 17/17, amarillo 16/17), INV = 0, RUNTIME = 0. Test runner restaurado a estado main (no patch sed commit).
- [ ] Task 7b.6 (condicional): si invocó refinamiento, 1-cycle boundary respetada.
- [ ] Task 7b.7: `07b-SUMMARY.md` existe ≥130 líneas con tabla per-case V1/V2/V3 + aggregate metrics + decision + D-31 text para append.
- [ ] Task 7b.8: `STATUS.md` con checklist Plan 07b + tabla updated. `STATE.md` updated/created.
- [ ] Task 7b.9: 3 commits atómicos. `git rev-parse HEAD == git rev-parse origin/main`. `git status` clean. Scope respetado (cero archivos fuera de `files_modified`).
- [ ] **Archivos NO MODIFICADOS** verificable via `git log --oneline -- <path>` (cero commits Plan 07b sobre estos):
  - `src/lib/agents/somnio-v4/sub-loop/comprehension-schema.ts`
  - `src/lib/agents/somnio-v4/sub-loop/tooling-call.ts`
  - `src/lib/agents/somnio-v4/sub-loop/generation-call.ts`
  - `src/lib/agents/somnio-v4/sub-loop/output-schema.ts`
  - `src/lib/agents/somnio-v4/sub-loop/index.ts`
  - `src/lib/agents/somnio-v4/sub-loop/tone-base.ts`
  - `src/lib/agents/somnio-v4/sub-loop/safe-output.ts`
  - `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts`
  - `src/lib/agents/somnio-v4/sub-loop/prompt.ts`
  - `src/lib/agents/somnio-v4/sub-loop/few-shots.ts`
  - `src/lib/agents/somnio-v4/knowledge/**/*.md` (KBs Plan 07 v1 baseline preservado)
  - `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (patch sed temporal revertido)
- [ ] v4 sigue dormant en prod: `SELECT count(*) FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true AND event::text LIKE '%somnio-sales-v4%';` retorna 0.
</verification>

<success_criteria>
**Plan 07b cierra exitosamente (VERDE) cuando:**

- [ ] `nunca-decir-check.ts` con model swap + polarity prompt committed.
- [ ] `nunca-decir-check.test.ts` con 5 tests verdes committed.
- [ ] Smoke A V3 = **17/17 PASS judge + 0 invenciones + cases 1, 2, 13, 14, 16 todos PASS**.
- [ ] `07b-AUDIT.md` + `SMOKE-A-RESULTS-V3.md` + `07b-SUMMARY.md` committed.
- [ ] `STATUS.md` y `STATE.md` reflejan Plan 07b DONE.
- [ ] 3 commits atómicos en `main` + push exitoso (HEAD == origin/main).
- [ ] v4 sigue dormant.
- [ ] Cero archivos modificados fuera del `files_modified` declarado.
- [ ] Plan 06 (Smoke B) unblocked.

**Plan 07b cierra con excepción (AMARILLO — sub-óptimo pero aceptable) cuando:**

- 16/17 PASS + 0 invenciones + cases 1, 2, 13, 14, 16 todos PASS, con UNA falla residual NO en estos 5 cases.
- Documentar la excepción explícitamente en `07b-SUMMARY.md` con propuesta de follow-up.

**Plan 07b NO cierra — escalation requerida (ROJO):**

- <16/17 PASS post-refinamiento (Task 7b.6 boundary 1-cycle alcanzada).
- ≥1 invención NUEVA (judge marca `Y` en algún case que V1+V2 era `N`).
- Caso V1+V2 PASS regresiona en V3 FAIL.
- Cases 1 ó 16 siguen FAIL después del upgrade.
- En cualquiera de estos: NO PUSH. Documentar en `07b-SUMMARY.md` con propuesta para Plan 07c (Schema-CoT Nivel 3) y escalar a Jose.
</success_criteria>

<rollback>
**Rollback completo del Plan 07b** (si post-push aparece regresión productiva — improbable porque v4 dormant):

```bash
# 1. Revert los 3 commits (orden inverso):
git revert <commit-3-sha> --no-edit  # docs
git revert <commit-2-sha> --no-edit  # test
git revert <commit-1-sha> --no-edit  # runtime
git push origin main

# 2. Estado post-revert:
#    - nunca-decir-check.ts vuelve a Flash-Lite + system prompt corto (HEAD Plan 07 v1)
#    - KBs declarativos (Plan 07 v1) preservados
#    - Test file nunca-decir-check.test.ts eliminado
#    - DB sin cambios (Plan 07b no tocó DB)
#    - v4 sigue dormant → cero impacto productivo
```

**Rollback parcial** (si el test file rompió suite pero el runtime fix es OK):

```bash
git revert <commit-2-sha> --no-edit  # solo el test
git push origin main
# Runtime + docs siguen vivos. Test file se rehace en seguimiento.
```

**Pre-condiciones rollback safe:**

- v4 sigue dormant ANTES y DESPUÉS de Plan 07b. Verificar siempre con SQL CLAUDE.md/Regla 6.
- v3 productivo intocado — rollback de Plan 07b no afecta v3.
- Cero migraciones SQL → sin schema rollback.
- Cero DB writes (Plan 07b no llamó `pnpm knowledge:sync` — Plan 07 v1 ya sincronizó).
</rollback>

<deviation_policy>
**Casos que el ejecutor puede encontrarse y cómo proceder:**

1. **El test `nunca-decir-check.test.ts` falla con error de mock setup** (e.g. `vi.mock` paths no resuelven, o `vi.importActual` shape difiere):
   - Ajustar el mock setup respetando los patrones de `safe-output.test.ts` (que está verde en main).
   - Si `@/lib/observability` no resuelve, usar path relativo `../../../../observability`.
   - Si el shape de `Output.object` de AI SDK requiere mock más sofisticado, fix el mock pero NO cambiar el código runtime.

2. **Smoke A V3 muestra latencia p50 >6s** (sub-loop budget):
   - Documentar en `07b-SUMMARY.md` como pitfall (no bloquea cierre — calidad era criterio gate).
   - Si p50 V3 >10s consistentemente, escalar a Jose (señal de problema con Flash NORMAL en este workload).

3. **Smoke A V3 muestra una INVENCIÓN nueva** (judge marca `Y` en case que V1+V2 era `N`):
   - STOP. No push. Esto es regresión grave (modelo más capaz podría generar contenido más confidente y arriesgado).
   - Documentar en `07b-SUMMARY.md` y escalar — posible que el Flash NORMAL en el guardrail no sea la causa (sería en `generation-call.ts`, no en `nunca-decir-check.ts`). Diagnóstico: ¿qué case y qué inventó?

4. **Patch sed de `RESULTS_PATH` queda commiteado por accidente:**
   - Task 7b.5 step 6 + Task 7b.9 pre-commit sanity detectan esto.
   - Si se cuela: `git revert <commit-sha>` que tocó `smoke-rag-a.test.ts`, re-aplicar el path V1 correcto, re-push.

5. **D-09 unlock — Jose pide validar antes de implementar:**
   - El plan declara `autonomous: true` porque la decisión locked Jose 2026-05-18 ya cubrió esto.
   - Si el ejecutor sospecha que la decisión no está clara, pausar y pedir confirm — pero esto es excepción, no default.

6. **Algún test del sub-loop preexistente falla post-edits (improbable — Plan 07b solo toca strings de prompt):**
   - Investigar si es pre-existing (corre `git stash` + re-run para confirmar baseline en HEAD).
   - Si es pre-existing → documentar en SUMMARY como deuda no-relacionada, continuar.
   - Si es nuevo y atribuible a Plan 07b → fix antes de continuar.

7. **Cases 1 o 16 siguen fallando después del upgrade (V3 muestra V2 baseline preservado):**
   - Esto valida la hipótesis de Jose: el modelo solo NO basta, los items son ambiguos para Flash NORMAL también.
   - Task 7b.6 considera UN refinamiento del item específico (semantic top-up).
   - Si después de 1 ciclo siguen failing → ROJO, escalar a Plan 07c.

8. **`pnpm knowledge:sync` se invoca por error en Task 7b.6:**
   - Plan 07b normalmente NO toca DB. Si Task 7b.6 hace refinamiento KB, sync ES necesario.
   - Documentar el sync en SUMMARY como evidence Regla 5 (re-popular KB con items refinados).
</deviation_policy>

<output>
After completion, the executor will have:

1. Modified `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (model swap + polarity prompt + header doc D-09 unlock).
2. Created `src/lib/agents/somnio-v4/sub-loop/__tests__/nunca-decir-check.test.ts` con 5 tests verdes.
3. Created `.planning/standalone/somnio-v4-rag-generative/07b-AUDIT.md` (1-pager evidence + justificación).
4. Created `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V3.md` (re-run completo).
5. Created `.planning/standalone/somnio-v4-rag-generative/07b-SUMMARY.md` (cierre + D-31 text + decision).
6. Updated `.planning/standalone/somnio-v4-rag-generative/STATUS.md`.
7. Updated/created `.planning/STATE.md`.
8. 3 atomic commits pushed to `origin/main`.
9. v4 sigue dormant en prod.
10. Plan 06 (Smoke B) unblocked (si verde/amarillo) O escalation a Plan 07c flagged (si rojo).
</output>
