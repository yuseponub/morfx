---
plan: 07
wave: 4.5
phase: standalone-somnio-v4-rag-generative
depends_on: [05]
files_modified:
  # 18 KBs (los 17 archivados + 1 que pudo no haberse auditado todavía — el ejecutor confirma al inicio):
  - src/lib/agents/somnio-v4/knowledge/edge-cases/insomnio_largo_plazo.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_medicamentos.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_ninos.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/precio_comparativo.md
  - src/lib/agents/somnio-v4/knowledge/policies/devoluciones.md
  - src/lib/agents/somnio-v4/knowledge/policies/envio.md
  - src/lib/agents/somnio-v4/knowledge/policies/pago.md
  - src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md
  - src/lib/agents/somnio-v4/knowledge/product/contenido.md
  - src/lib/agents/somnio-v4/knowledge/product/contraindicaciones.md
  - src/lib/agents/somnio-v4/knowledge/product/dependencia.md
  - src/lib/agents/somnio-v4/knowledge/product/efectividad.md
  - src/lib/agents/somnio-v4/knowledge/product/formula.md
  - src/lib/agents/somnio-v4/knowledge/product/registro_sanitario.md
  # Artifacts del propio plan (creados por el ejecutor, NO por el planner):
  - .planning/standalone/somnio-v4-rag-generative/07-AUDIT.md
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md
  - .planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md
  - .planning/standalone/somnio-v4-rag-generative/STATUS.md
  - .planning/standalone/somnio-v4-rag-generative/STATE.md
autonomous: false  # Task 7.2.1 es gate Jose (revisa AUDIT antes de aplicar rewrites)
requirements: []
user_setup:
  - service: supabase-prod
    why: "`pnpm knowledge:sync` repuebla 18 filas de `agent_knowledge_base` con embeddings nuevos para el workspace Somnio."
    env_vars:
      - name: SUPABASE_SERVICE_ROLE_KEY
        source: ".env.local (ya configurada — usada por Plan 02)"
      - name: OPENAI_API_KEY
        source: ".env.local (usada por embeddings text-embedding-3-small)"
      - name: GOOGLE_GENERATIVE_AI_API_KEY
        source: ".env.local (paid tier — usada por Smoke A re-run)"
    dashboard_config: []

must_haves:
  truths:
    - "Los items del array `nunca_decir` en los 18 KBs cumplen las 3 propiedades del molde NLI: declarativos en sentido afirmativo, una sola proposición, paráfrasis-tolerante."
    - "El sub-loop `nuncaDecirCheck` deja de disparar false-positives cuando la respuesta NEGA o REDIRIGE — la naturaleza declarativa del item lo convierte en una NLI implícita."
    - "Smoke A re-run (V2) sobre los mismos 17 casos arroja ≥16/17 PASS judge OVERALL + 0/17 invenciones — los 3 FAILs originales (cases 2, 13, 14) flipean a PASS."
    - "v4 sigue dormant en prod (`active_v4_rules = 0`) — Plan 07 NO toca `routing_rules`."
    - "Cero cambios de código en `src/lib/agents/somnio-v4/sub-loop/**` — D-09 honored (Flash-Lite intocado). Cero cambios de schema KB. Cero cambios en `comprehension-schema.ts`, `output-schema.ts`, `prompt.ts`, `few-shots.ts`, `tone-base.ts`, `kb-search-tool.ts`, `tooling-call.ts`, `generation-call.ts`, `safe-output.ts`, `index.ts`, `nunca-decir-check.ts`."
    - "Migración Big-bang en un solo commit por KB rewrite + un commit de sync + un commit de smoke results — atomic per-task per Rule 1 (`code-changes.md`)."
  artifacts:
    - path: ".planning/standalone/somnio-v4-rag-generative/07-AUDIT.md"
      provides: "Tabla por KB de items actuales `nunca_decir` + flag de propiedad violada + propuesta de reescritura. Gate Jose."
      min_lines: 80
    - path: ".planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md"
      provides: "Re-run completo de los 17 casos del Smoke A post-rewrite. Mismo formato verbatim que `SMOKE-A-RESULTS.md`."
      min_lines: 700
    - path: ".planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md"
      provides: "Audit findings, items cambiados con before/after diff de los 3 FAILs originales, results V2, decisión (close vs iter), pitfalls, qué unblock Plan 08."
      min_lines: 150
    - path: "src/lib/agents/somnio-v4/knowledge/**/*.md (18 archivos)"
      provides: "KBs con sección `## NUNCA decir` reescrita siguiendo el molde NLI (excepto items que ya conforman)."
      contains: "## NUNCA decir"
  key_links:
    - from: "src/lib/agents/somnio-v4/knowledge/**/*.md (sección `## NUNCA decir`)"
      to: "tabla `agent_knowledge_base.nunca_decir` (columna TEXT[]) en Supabase Somnio workspace"
      via: "`pnpm knowledge:sync` (scripts/knowledge-sync.ts) parsea cada .md, hace `upsert` y regenera embeddings vía OpenAI text-embedding-3-small"
      pattern: "knowledge:sync"
    - from: "agent_knowledge_base.nunca_decir (DB)"
      to: "`KbHit.nuncaDecirRules` en sub-loop"
      via: "RPC `match_knowledge_base` retorna `nunca_decir` array → kb-search-tool propaga a tooling → `result.nuncaDecirRules` → `checkNuncaDecir({ candidateText, nuncaDecirRules })`"
      pattern: "nuncaDecirRules"
    - from: "checkNuncaDecir (Flash-Lite LLM judge)"
      to: "decisión `{ ok: bool, violation?: string }` que disparara `no_match handoff` o continúa a generación"
      via: "`src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` — NO SE TOCA"
      pattern: "checkNuncaDecir"
---

<objective>
**Iter post-Smoke A — refinamiento semántico del array `nunca_decir` en los 18 KBs.**

Smoke A (Plan 05) corrió 17 casos. 14/17 PASS judge, **0/17 invenciones**, 3 FAILs (cases 2 embarazo, 13 duracion_efecto, 14 habitos sueno). Los 3 FAILs comparten el MISMO root cause: el guardrail `nuncaDecirCheck` (Gemini Flash-Lite) emite **false-positives cuando la respuesta NIEGA o REDIRIGE la acción prohibida**. El judge LLM se confunde entre **mención tópica** y **violación**.

Ejemplos verbatim del run 2026-05-18:
- Case 2 (embarazo): item `"aprobar uso durante embarazo o lactancia"` + respuesta *"No te recomendamos tomar durante el embarazo, consultá con tu ginecólogo"* → judge devolvió `violates=true` (false positive).
- Case 13 (duracion_efecto): item `"prometer un número fijo y garantizado de horas de sueño"` + respuesta *"hasta 7 horas seguidas con variabilidad individual"* → judge devolvió `violates=true`.
- Case 14 (alternativas_naturales): item `"recomendar otros productos consumibles (manzanilla, tilo, hierbas, infusiones, suplementos competidores)"` + respuesta listando hábitos (NO productos consumibles) → judge devolvió `violates=true`.

**Decisión locked (Jose 2026-05-18):** approach **SEMÁNTICO PURO**. No refactorizar `nunca-decir-check.ts` (D-09 honored). No cambiar schema, no upgrade de modelo, no tocar prompt del checker.

**Fix:** reescribir cada item del array `nunca_decir` en los 18 KBs como **proposición declarativa afirmativa** que la respuesta podría potencialmente *afirmar*. Esto convierte el checker en una tarea NLI implícita: una respuesta que NIEGA o REDIRIGE la proposición queda inequívocamente como no-violadora.

**Propiedades obligatorias (research-backed: Constitutional AI, OpenAI Model Spec, Guardrails AI, NeMo Guardrails):**

1. **Forma: oración declarativa afirmativa.** El item describe una proposición que podría afirmarse de la respuesta. NO usar verbos de acción aislados ("aprobar", "minimizar", "prometer", "recomendar") sin un complemento declarativo.
2. **Una sola proposición por item.** Si el item original tenía AND/OR (ej. "seguro Y efectivo"), decomponerlo en items separados.
3. **Especificidad calibrada — paráfrasis-tolerante.** Concreto suficiente para ser testeable, abstracto suficiente para cubrir paráfrasis. Ni "el producto cura el insomnio en 0% de los casos en el primer trimestre" (over-specific) ni "dar info médica" (over-generic).

**Moldes preferidos:**

- **Mold A (indicativo — preferido):** `"<Sujeto> <verbo presente> <complemento>"` → *"El producto es seguro durante el embarazo o la lactancia."*
- **Mold B (infinitivo + cláusula — cuando A suena forzado):** `"Afirmar/Garantizar que <proposición>"` → *"Garantizar que el cliente dormirá un número fijo de horas."*

**Ejemplos verbatim (anchors para el ejecutor):**

| Item ANTES (problemático) | Item DESPUÉS (proposición) |
|---|---|
| `"aprobar uso durante embarazo o lactancia"` | `"El producto es seguro durante el embarazo o la lactancia."` |
| `"prometer un número fijo y garantizado de horas de sueño"` | `"El producto garantiza un número específico de horas de sueño."` |
| `"recomendar otros productos consumibles (manzanilla, tilo, hierbas, infusiones, suplementos competidores)"` | `"Consumir manzanilla, tilo, hierbas, infusiones u otros suplementos competidores es una opción recomendada."` |

**Out of scope (NO tocar — explícito):**

- ❌ Refactorizar `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (D-09 locked).
- ❌ Cambiar schema KB (`parser.ts`, `sync.ts`, `coherence-check.ts`).
- ❌ Tocar `comprehension-schema.ts`, `output-schema.ts`, `prompt.ts`, `few-shots.ts`, `tone-base.ts`, `safe-output.ts`, `kb-search-tool.ts`, `tooling-call.ts`, `generation-call.ts`, `index.ts`.
- ❌ Cambiar el prompt del checker.
- ❌ Migraciones SQL nuevas.
- ❌ Upgrade de modelo (Flash-Lite sigue).
- ❌ Crear `routing_rules` (v4 sigue dormant — Plan 08 lo hará).
- ❌ Crear archivos de código nuevos (solo edición de los 18 .md + artifacts del plan).

**Outcome esperado:** Smoke A V2 con ≥16/17 PASS judge OVERALL + 0/17 invenciones + cases 2/13/14 flipped a PASS. v4 sigue dormant.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/STATUS.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
@.planning/standalone/somnio-v4-rag-generative/05-SUMMARY.md

# Anchor KBs — leer ANTES de auditar los 18
@src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md
@src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md
@src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md
@src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md
@src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md

# Sub-loop guardrail — leer SOLO para comprobar que NO se va a tocar
@src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts

# Smoke A test runner — para Task 7.5 (re-run V2)
@src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts

# Sync script
@scripts/knowledge-sync.ts

<interfaces>
<!-- Contracts que el ejecutor consume sin re-explorar el codebase. -->

From `src/lib/agents/somnio-v4/knowledge/**/*.md` (formato locked en Plan 01):
```markdown
---
topic: <slug>
keywords: [...]
category: edge-cases | product | policies | faqs-no-templated
last_reviewed: YYYY-MM-DD
reviewed_by: <name>
related_topics: [...]
escalate_if: [...]            # opcional
tone_override: null | <str>   # opcional
---

## Hechos del producto
<párrafo libre>

## Posición del negocio
<párrafo libre>

## Debe contener la respuesta
- [SIEMPRE] ...
- [SI APLICA] ...

## NUNCA decir          ← ESTA es la única sección que Plan 07 toca
- <item 1>
- <item 2>
...

## Cuándo escalar a humano
- ...
```

From `scripts/knowledge-sync.ts` (intacto desde Plan 02):
```ts
// Parsea cada .md → upsert a `agent_knowledge_base` con:
//   workspace_id, agent_id='somnio-sales-v4', topic, hechos, posicion,
//   debe_contener_aplicables (string[]), nunca_decir (string[]), cuando_escalar (string[]),
//   canonical_response=null (D-24), embedding (1536-dim regenerado).
// Comando: pnpm knowledge:sync
// Espera 18/18 OK con `updated_with_embedding` en stdout.
```

From `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (intacto, ver D-09):
```ts
// Gemini Flash-Lite LLM judge.
// Input: { candidateText: string, nuncaDecirRules: string[] }
// Output: { ok: boolean, violation?: string }
// Early-return ok=true si rules.length===0.
// Prompt: "Return whether the candidate text violates any of the given rules."
// CADA item del array es evaluado como rule individual.
```

From `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts`:
```bash
# Ejecuta los 17 casos del Smoke A E2E + judge + persiste resultados.
# Path destino para resultados: lo determina el test (default: SMOKE-A-RESULTS.md).
# Para Plan 07 V2 → renombrar manualmente el output o copiar tras run.
npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
# Duración esperada: ~13 min (paid tier Gemini + throttle 7s entre casos).
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 7.1 — Auditar items `nunca_decir` en los 18 KBs</name>
  <files>.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md</files>
  <read_first>
    - `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` (cases 2, 13, 14 verbatim — items que rompieron el judge).
    - Los 18 archivos en `src/lib/agents/somnio-v4/knowledge/**/*.md` — leer SOLO la sección `## NUNCA decir` de cada uno.
    - Objective de este plan (moldes A/B + 3 propiedades + ejemplos verbatim).
  </read_first>
  <action>
    Crear `.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md` con UN bloque por KB (18 bloques). Cada bloque tiene:

    ```markdown
    ### <category>/<topic>.md

    **Items actuales (N):**
    1. `<item verbatim>` — propiedad violada: <P1 | P2 | P3 | ninguna>
    2. `<item verbatim>` — propiedad violada: <...>
    ...

    **Propuestas de reescritura:**
    1. `<item original>` → `<item nuevo>` (mold A | B | KEEP-AS-IS)
    2. ...

    **Notas:**
    - <decisión clave por KB — ej. "items 4-5 son verbos de acción aislados, decomponer"; o "todos los items ya conforman, KEEP-AS-IS">
    ```

    **Propiedades a verificar (de los 3 moldes en `<objective>`):**
    - P1: forma declarativa afirmativa (sujeto + verbo + complemento, o "Afirmar/Garantizar que ..."). VIOLA si el item empieza con verbo de acción aislado: "aprobar", "minimizar", "prometer", "recomendar", "afirmar" sin complemento o sin "que".
    - P2: una sola proposición. VIOLA si tiene AND/OR conectando dos proposiciones independientes.
    - P3: especificidad calibrada. VIOLA si es over-specific (rango numérico estrecho que deja gaps de paráfrasis) o over-generic ("dar información médica" sin objeto).

    **NO REESCRIBIR aún.** Solo auditar + proponer. Es un documento de diseño.

    **Excepción legítima:** si un item *genuinamente* requiere ser un verbo de acción (ej. items de tono como `"usar palabras como 'te derivo', 'te paso', 'asesor humano', 'tomo nota'"` que listan substrings literales a evitar), marcar `KEEP-AS-IS` con nota explicativa. Estos son items de **léxico tabú**, no de **propuesta semántica**, y conviven en el mismo array — el checker LLM los evalúa bien porque son string-match en la respuesta.

    **Casos especiales ya identificados (anchors verbatim para confirmar la propuesta):**
    - `edge-cases/uso_en_embarazo.md` item `"aprobar uso durante embarazo o lactancia"` → propuesta: `"El producto es seguro durante el embarazo o la lactancia."`
    - `faqs-no-templated/duracion_efecto.md` item `"prometer un número fijo y garantizado de horas de sueño"` → propuesta: `"El producto garantiza un número específico de horas de sueño."`
    - `faqs-no-templated/alternativas_naturales.md` item `"recomendar otros productos consumibles (manzanilla, tilo, hierbas, infusiones, suplementos competidores)"` → propuesta: `"Consumir manzanilla, tilo, hierbas, infusiones u otros suplementos competidores es una opción recomendada."`

    **Cerrar el archivo con:**
    - Conteo total: `N items auditados`, `M items proponer rewrite`, `K items KEEP-AS-IS`.
    - Resumen por KB: cuántos items rewrite vs KEEP-AS-IS por archivo.
    - **Decision gate Task 7.2.1 explícito:** "Jose debe leer este AUDIT.md antes de Task 7.2 (aplicar rewrites). Si AUDIT muestra >50% de items requieren rewrite → flag scope concern al usuario antes de proceder."
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/07-AUDIT.md &amp;&amp; grep -c "^### " .planning/standalone/somnio-v4-rag-generative/07-AUDIT.md | tr -d '\n' &amp;&amp; echo " (esperado: 18)"</automated>
  </verify>
  <done>
    07-AUDIT.md existe, tiene 18 bloques (uno por KB), cada bloque tiene items verbatim + propuestas + notas, conteo total al final. Los 3 anchors verbatim (embarazo, duracion_efecto, alternativas_naturales) están con propuesta verbatim del `<objective>`.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 7.2.1 — Jose review del AUDIT</name>
  <what-built>
    `07-AUDIT.md` con 18 bloques, propuestas de reescritura por item, decisión KEEP-AS-IS / mold-A / mold-B / decompose.
  </what-built>
  <how-to-verify>
    1. Abrir `.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md`.
    2. Leer cada bloque (18 KBs). Especial atención a:
       - **uso_en_embarazo.md** (case 2 FAIL): la propuesta es `"El producto es seguro durante el embarazo o la lactancia."` — confirmar que captura la intención.
       - **duracion_efecto.md** (case 13 FAIL): la propuesta es `"El producto garantiza un número específico de horas de sueño."` — confirmar.
       - **alternativas_naturales.md** (case 14 FAIL): la propuesta es `"Consumir manzanilla, tilo, hierbas, infusiones u otros suplementos competidores es una opción recomendada."` — confirmar.
    3. Para cada item con propuesta de rewrite: leer el item original + propuesta + verificar las 3 propiedades.
    4. Para items `KEEP-AS-IS`: confirmar que la justificación tiene sentido (típicamente: items de léxico tabú como `"te derivo", "tomo nota"`).
    5. **Decision gate:** ¿proceder con Task 7.2 (aplicar rewrites)? Si hay >50% de items proponiéndose rewrite o algún rewrite que cambia el significado → discutir antes.
    6. **Counter-check:** asegurarse que NINGUNA propuesta debilita la regla. Ejemplo: si el item dice "minimizar el riesgo de combinar con alcohol", la propuesta `"Combinar el producto con alcohol no representa ningún riesgo."` es la dirección correcta. La propuesta `"El producto es seguro con alcohol en algunos casos."` sería DEBILITAR la regla.
  </how-to-verify>
  <resume-signal>Type "approved" para que el ejecutor proceda con Task 7.2, o describir cambios necesarios al AUDIT.</resume-signal>
</task>

<task type="auto">
  <name>Task 7.2 — Aplicar rewrites a los 18 KBs según el AUDIT</name>
  <files>src/lib/agents/somnio-v4/knowledge/**/*.md (los 18)</files>
  <read_first>
    - `.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md` (post-Jose review en Task 7.2.1).
    - Cada uno de los 18 KBs ANTES de editar (para no romper otras secciones).
  </read_first>
  <action>
    Para cada uno de los 18 KBs:
    1. Leer el archivo completo (preserva frontmatter + Hechos + Posición + Debe contener + Cuándo escalar — NO TOCAR esas secciones).
    2. Localizar la sección `## NUNCA decir`.
    3. Reemplazar cada item según el AUDIT:
       - Items marcados `KEEP-AS-IS` → no se tocan.
       - Items marcados `mold A` o `mold B` → reemplazar verbatim con la propuesta del AUDIT.
       - Items marcados `decompose` → reemplazar el item original con N items nuevos (uno por proposición).
    4. Guardar el archivo. Verificar que el resto del KB queda intacto.

    **Constraints duros:**
    - Cero cambios fuera de la sección `## NUNCA decir`.
    - Cero items eliminados — solo reescritos. Si el AUDIT proponía eliminar un item, eso debe haber sido flagged a Jose en Task 7.2.1 con discusión explícita.
    - Cero items agregados que no estuvieran en el AUDIT (excepto los productos de decompose).
    - Cada item nuevo cumple las 3 propiedades (forma declarativa, una proposición, calibración).

    **Anti-regression check inline (manual mientras editás):**
    - Después de editar cada KB, comparar lado a lado: ¿la intención prohibida del item original queda capturada en la propuesta? Si no → restaurar item original + flag en 07-SUMMARY.md como excepción documentada.

    **NO RUN tests todavía** — se hace en Task 7.3.
  </action>
  <verify>
    <automated>git diff --stat src/lib/agents/somnio-v4/knowledge/ | grep -E "\.md " | wc -l | tr -d '\n' &amp;&amp; echo " archivos modificados (esperado: ≤18, ≥1 si el AUDIT proponía ≥1 rewrite)"</automated>
  </verify>
  <done>
    Los KBs auditados con propuestas de rewrite tienen la sección `## NUNCA decir` actualizada. Los `KEEP-AS-IS` quedan intactos. Resto del KB intacto. `git diff` muestra cambios SOLO en líneas del bloque `## NUNCA decir`.
  </done>
</task>

<task type="auto">
  <name>Task 7.3 — Validar parser + coherence-check sobre los 18 KBs editados</name>
  <files></files>
  <read_first>
    - `src/lib/agents/somnio-v4/knowledge-base/parser.ts` (NO editar — solo confirmar contrato).
    - `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` (NO editar).
  </read_first>
  <action>
    Correr los tests existentes del KB para asegurar que el formato sigue válido post-edits:

    ```bash
    # Si existe __tests__ del knowledge-base (a verificar):
    npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts
    npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts
    ```

    **Si los tests pasan:** continuar a Task 7.4.

    **Si algún test falla:** identificar el KB que rompió + el item específico. Posibles causas:
    - Item con caracteres especiales que el parser markdown YAML mal-interpreta (improbable — son bullet points planos).
    - Item que arranca con whitespace adicional → corregir.
    - Sección `## NUNCA decir` mal-formada por copy-paste error → restaurar bullets `- `.

    Fix el KB roto. Re-correr tests. Iterar hasta verde.

    **NO modificar parser ni coherence-check** — si un fix requiere cambio de código en parsing, ese es scope creep → abortar Plan 07 y escalar.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/ 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    Tests parser + coherence-check verdes. Cero cambios en `parser.ts`, `coherence-check.ts`, `sync.ts`.
  </done>
</task>

<task type="auto">
  <name>Task 7.4 — Sync KBs a Supabase prod (Regla 5 — apply ANTES de smoke)</name>
  <files></files>
  <read_first>
    - `scripts/knowledge-sync.ts` (referencia — no editar).
    - `.env.local` keys: SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY (para embeddings).
  </read_first>
  <action>
    1. Confirmar que `.env.local` está cargada y las keys disponibles:
       ```bash
       grep -E "^(SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY)=" .env.local | wc -l
       # esperado: 2
       ```
    2. Correr el sync:
       ```bash
       pnpm knowledge:sync
       ```
    3. Esperar 18/18 OK con `updated_with_embedding` en stdout. El script tarda ~30s-1min (OpenAI embeddings + Supabase upserts).
    4. Verificar en DB que los nuevos items están populados (smoke check):
       ```sql
       -- Esperado: 18 filas, todas con array nunca_decir no-vacío y embedding presente.
       SELECT topic, array_length(nunca_decir, 1) AS n_items, embedding IS NOT NULL AS has_embedding
       FROM agent_knowledge_base
       WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND agent_id='somnio-sales-v4'
       ORDER BY topic;
       ```

       Correr el SELECT con `psql` o desde Supabase Studio. Reportar resultado en 07-SUMMARY.md como evidence Regla 5.

    **Regla 5 honored:** este sync repuebla prod CON el nuevo material. v4 sigue dormant (sin routing rule) → no afecta tráfico productivo. Pero los datos están listos para Smoke A V2 (Task 7.5) que lee de la misma DB.

    **Si el sync falla en alguna fila:** abortar, leer logs, fix el KB problemático, re-correr. NO push hasta sync verde.
  </action>
  <verify>
    <automated>pnpm knowledge:sync 2>&amp;1 | tee /tmp/07-sync.log | tail -25 &amp;&amp; grep -c "updated_with_embedding" /tmp/07-sync.log | tr -d '\n' &amp;&amp; echo " (esperado: 18)"</automated>
  </verify>
  <done>
    18/18 KBs sincronizados con embeddings nuevos. SELECT en Supabase confirma 18 filas con `array_length(nunca_decir, 1) > 0` y `embedding IS NOT NULL`. Output del SELECT pegado en 07-SUMMARY.md (preview — el SUMMARY se finaliza en Task 7.7).
  </done>
</task>

<task type="auto">
  <name>Task 7.5 — Re-correr Smoke A (V2) sobre los 17 casos</name>
  <files>.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md</files>
  <read_first>
    - `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (entender el destino del output).
    - `SMOKE-A-RESULTS.md` original (para comparar formato + diff de casos 2/13/14).
  </read_first>
  <action>
    1. **Backup del RESULTS original** para evitar overwrite accidental:
       ```bash
       cp .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md \
          .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md.v1.bak
       ```
    2. **Definir output destino para V2.** El test escribe al path hardcoded `SMOKE-A-RESULTS.md` (línea 61 del test). Dos opciones:
       - **A (preferred):** modificar SOLO la constante `RESULTS_PATH` del test temporalmente vía `sed` o un patch git stash para que escriba a `SMOKE-A-RESULTS-V2.md` durante este run. **NO commitear** ese cambio del test — es solo para este run y se revierte al final.
       - **B (fallback):** dejar que escriba a `SMOKE-A-RESULTS.md` y después renombrar el archivo a `SMOKE-A-RESULTS-V2.md` + restaurar el `.v1.bak` como `SMOKE-A-RESULTS.md`.

       Recomendado A — menos error-prone.

    3. **Correr el smoke:**
       ```bash
       npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
       ```
       Duración esperada: ~13 min (paid tier + throttle 7s entre casos × 17 casos).

    4. **Verificar criterios de éxito sobre el output V2:**
       ```bash
       RESULTS=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md
       echo "Judge OVERALL PASS:    $(grep -c 'OVERALL: PASS' $RESULTS)"
       echo "Judge OVERALL FAIL:    $(grep -c 'OVERALL: FAIL' $RESULTS)"
       echo "Invenciones (judge):   $(grep -c 'Y (judge detected' $RESULTS)"
       echo "Runtime errors:        $(grep -c 'RUNTIME ERROR' $RESULTS)"
       ```

       **Criterios:**
       - Judge OVERALL PASS ≥ **16/17**.
       - Invenciones (judge) = **0/17**.
       - Runtime errors = **0/17**.
       - Cases 2, 13, 14 deben aparecer ahora con `OVERALL: PASS` (especialmente verificable buscando los headers `### Case 2 —`, `### Case 13 —`, `### Case 14 —` en el archivo).

    5. **Si criterios cumplidos:** continuar a Task 7.7 (Plan 07 cierra).

    6. **Si <16/17 PASS pero >14:** identificar cuáles ítems del `nunca_decir` rewriteados aún disparan false-positives. Pasar a Task 7.6 (refinamiento individual).

    7. **Si invenciones > 0 en V2 (regresión):** STOP. NO push. Crear note en 07-SUMMARY.md con evidence + flag al usuario. Posible causa: un rewrite debilitó una regla. Restaurar ese KB específico del git history y re-syncear.

    8. **Si Runtime errors > 0:** debugger normal (Gemini quota, network). No relacionado al rewrite.

    9. **Revertir el cambio temporal del test** (si se usó opción A):
       ```bash
       git checkout src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts
       ```
  </action>
  <verify>
    <automated>RESULTS=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md; test -f $RESULTS &amp;&amp; PASS=$(grep -c 'OVERALL: PASS' $RESULTS) &amp;&amp; INV=$(grep -c 'Y (judge detected' $RESULTS) &amp;&amp; echo "PASS=$PASS INV=$INV (criterio: PASS≥16 INV=0)"</automated>
  </verify>
  <done>
    SMOKE-A-RESULTS-V2.md existe. PASS ≥ 16/17, INV = 0/17, RUNTIME = 0. Cases 2, 13, 14 muestran `OVERALL: PASS`. Test file restaurado a estado git original (sin cambio del RESULTS_PATH).
  </done>
</task>

<task type="auto">
  <name>Task 7.6 — Refinamiento individual de items que aún fallan (CONDICIONAL)</name>
  <files>src/lib/agents/somnio-v4/knowledge/**/*.md (subset que rompió)</files>
  <read_first>
    - `SMOKE-A-RESULTS-V2.md` — casos específicos que fallaron.
    - Items `nunca_decir` actuales de los KBs problemáticos.
  </read_first>
  <action>
    **Solo correr si Task 7.5 arrojó <16/17 PASS y los failures siguen siendo `nunca_decir_violation` false-positives.**

    Para cada caso fallado:
    1. Identificar el `violation` específico que disparó (campo `reason: "nunca_decir_violation: <rule>"`).
    2. Localizar ese item en el KB correspondiente.
    3. Aplicar refinamiento **una sola vez** — buscar si el item:
       - Sigue siendo demasiado genérico → más calibración (concretizar).
       - Sigue teniendo verbo de acción aislado → reformular con sujeto/verbo declarativo.
       - Tiene una proposición que el LLM interpreta literalmente cuando la respuesta sí la "menciona" sin "afirmarla" → reformular con cláusula `Afirmar/Garantizar que <prop>` (mold B).
    4. Re-syncear ese KB específico (o todo via `pnpm knowledge:sync` — el script es idempotente).
    5. Re-correr SOLO los casos fallidos (manual: `npx vitest run smoke-rag-a.test.ts -t "Case <N>"` si el test soporta filter, o re-correr completo).

    **Boundary regla:** UN solo ciclo de refinamiento. Si después de un ciclo aún hay <16/17 PASS → **escalar a Jose** (no entrar en loop infinito). Plan 07 documenta el findings y propone Plan 07b o re-research.

    **Items que genuinamente no se pueden reformular como proposición** (ej. lexical taboo lists como `"te derivo", "tomo nota"`) deben quedar `KEEP-AS-IS`. Si uno de esos sigue rompiendo el judge → es señal de otro problema (no del molde) y queda como excepción documentada en 07-SUMMARY.md.
  </action>
  <verify>
    <automated>RESULTS=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md; PASS=$(grep -c 'OVERALL: PASS' $RESULTS); echo "PASS=$PASS (criterio post-refine: ≥16)"</automated>
  </verify>
  <done>
    Smoke A V2 final ≥ 16/17 PASS, o si la boundary se alcanzó sin éxito, escalation flag documentado en 07-SUMMARY.md con propuesta clara.
  </done>
</task>

<task type="auto">
  <name>Task 7.7 — Crear 07-SUMMARY.md (cierre del plan)</name>
  <files>.planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md</files>
  <read_first>
    - `07-AUDIT.md` (Task 7.1).
    - `SMOKE-A-RESULTS-V2.md` (Task 7.5).
    - `SMOKE-A-RESULTS.md` (V1, para diff de cases 2, 13, 14).
  </read_first>
  <action>
    Crear `07-SUMMARY.md` con esta estructura:

    ```markdown
    # Plan 07 — SUMMARY

    **Status:** SHIPPED 2026-05-18
    **HEAD git:** <sha del último commit del plan>
    **Approach:** Semantic-only fix del array `nunca_decir` en los 18 KBs (D-09 honored — sin tocar `nunca-decir-check.ts`).
    **Resultado:** <una línea — PASS X/17, INV 0/17, cases 2/13/14 flipped a PASS>

    ## Audit findings (Task 7.1)
    - Total items auditados: N
    - Propuestos para rewrite: M
    - KEEP-AS-IS: K (típicamente: items de léxico tabú)
    - KBs con ≥1 item modificado: J / 18

    ## Items cambiados (resumen por KB)
    | KB | Items originales | Items rewriteados | Items KEEP-AS-IS |
    |---|---|---|---|
    | edge-cases/uso_en_embarazo.md | 6 | X | Y |
    | ... (18 filas) | | | |

    ## Before/after diff — los 3 FAILs originales

    ### Case 2 (uso_en_embarazo.md)
    **Antes (V1):** `"aprobar uso durante embarazo o lactancia"`
    **Después (V2):** `"El producto es seguro durante el embarazo o la lactancia."`
    **Smoke A V1 result:** OVERALL FAIL (relevance FAIL, MISCALIBRATED_HIGH)
    **Smoke A V2 result:** OVERALL <PASS|FAIL>

    ### Case 13 (duracion_efecto.md)
    **Antes (V1):** `"prometer un número fijo y garantizado de horas de sueño"`
    **Después (V2):** `"El producto garantiza un número específico de horas de sueño."`
    **V1 result:** OVERALL FAIL
    **V2 result:** OVERALL <...>

    ### Case 14 (alternativas_naturales.md)
    **Antes (V1):** `"recomendar otros productos consumibles (manzanilla, tilo, hierbas, infusiones, suplementos competidores)"`
    **Después (V2):** `"Consumir manzanilla, tilo, hierbas, infusiones u otros suplementos competidores es una opción recomendada."`
    **V1 result:** OVERALL FAIL
    **V2 result:** OVERALL <...>

    ## Smoke A V2 aggregate metrics

    | Métrica | V1 (Plan 05) | V2 (Plan 07) | Δ |
    |---|---|---|---|
    | Judge OVERALL PASS | 14/17 (82.4%) | X/17 | +N |
    | Judge OVERALL FAIL | 3/17 (17.6%) | X/17 | -N |
    | Invenciones (judge) | 0/17 | 0/17 | 0 |
    | MISCALIBRATED_HIGH | 3/17 (17.6%) | X/17 | -N |

    ## Regla 5 honored (DB sync evidence)

    Output del SELECT post-sync:
    ```
    <pegar resultado del query SQL de Task 7.4>
    ```

    18/18 KBs con `nunca_decir` array no-vacío + embedding regenerado.

    ## Decisión final
    - [<x|>] Plan 07 cierra — criterios cumplidos, Plan 06 (Smoke B) unblocked.
    - [<x|>] Plan 07 cierra con excepciones documentadas — ver "Excepciones" abajo.
    - [<x|>] Escalation requerida — Plan 07b o re-research.

    ## Excepciones documentadas (si hay)
    - Item X en KB Y: justificación de por qué KEEP-AS-IS o por qué sigue fallando post-refine.

    ## Pitfalls descubiertos
    - <e.g. "Items con verbo aislado tipo 'minimizar' confunden al checker LLM porque puede match cualquier paráfrasis. Mold A resolvió 100% de los casos auditados.">
    - <e.g. "Items decompose: cuando el original tenía AND, separar en 2 items mejora la testeabilidad SIN incrementar false-positives.">

    ## Qué unblock Plan 08
    - Plan 06 (Smoke B) puede correr ahora con el guardrail estable. Si Smoke B ≥9/10 → Plan 08 (SQL flip routing rule).
    - Si Smoke B reporta nuevos false-positives `nunca_decir`, validar primero que no comparten patrón con los items KEEP-AS-IS de Plan 07 — eso indicaría que un KEEP-AS-IS debió ser rewriteado.

    ## Files modified (commits atómicos)
    - 18 KBs (sección `## NUNCA decir` only — verificable via `git log --oneline -- "src/lib/agents/somnio-v4/knowledge/**/*.md"`)
    - 07-AUDIT.md
    - SMOKE-A-RESULTS-V2.md
    - 07-SUMMARY.md
    - STATUS.md
    - STATE.md

    ## v4 sigue dormant
    ```sql
    SELECT count(*) FROM routing_rules
    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
      AND active=true AND event::text LIKE '%somnio-sales-v4%';
    -- Esperado: 0.
    ```
    Verificado <fecha/hora>.

    ## Next
    - Plan 06 (Smoke B) — 10 casos regression.
    - Plan 08 (flip productivo) si Smoke B ≥9/10.
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md &amp;&amp; wc -l .planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md | awk '{print $1}' | tr -d '\n' &amp;&amp; echo " líneas (esperado: ≥150)"</automated>
  </verify>
  <done>
    07-SUMMARY.md existe con secciones completas. Las 3 tablas before/after de cases 2, 13, 14 están llenas. Aggregate metrics V1 vs V2. Decisión final marcada. Regla 5 honored evidence. v4 dormant check.
  </done>
</task>

<task type="auto">
  <name>Task 7.8 — Update STATUS.md + STATE.md</name>
  <files>.planning/standalone/somnio-v4-rag-generative/STATUS.md, .planning/standalone/somnio-v4-rag-generative/STATE.md</files>
  <read_first>
    - `STATUS.md` actual.
    - `STATE.md` actual (si existe — sino se crea en la próxima iter).
  </read_first>
  <action>
    **STATUS.md:**
    1. Actualizar "Last updated" a fecha actual + nota Plan 07 SHIPPED.
    2. En "PHASES — checklist alto nivel": marcar `[x] **Execute-phase plan 07 (iter — nunca_decir guardrail)**` con resultado.
    3. En tabla "Plans status": fila Plan 07 → `DONE <fecha>` con HEAD sha.
    4. En sección Smoke A: agregar referencia a SMOKE-A-RESULTS-V2.md y actualizar la línea de resumen con los nuevos counts.
    5. Actualizar "Next action AHORA" a "Plan 06 (Smoke B) unblocked — correr `npx vitest run smoke-rag-b.test.ts`".

    **STATE.md (si existe):** actualizar position cursor a "Plan 07 DONE — siguiente Plan 06 Smoke B".

    Si STATE.md no existe, el ejecutor lo crea con format mínimo:
    ```markdown
    # Standalone State

    **Last updated:** YYYY-MM-DD
    **Position:** Plan 07 SHIPPED. Siguiente: Plan 06 (Smoke B).
    **HEAD:** <sha>
    **Blockers:** ninguno.
    ```
  </action>
  <verify>
    <automated>grep -E "Plan 07.*DONE|07.*SHIPPED" .planning/standalone/somnio-v4-rag-generative/STATUS.md | head -3</automated>
  </verify>
  <done>
    STATUS.md tiene Plan 07 marcado DONE con fecha + HEAD. Smoke A section referencia V2 results. Next action es Plan 06.
  </done>
</task>

<task type="auto">
  <name>Task 7.9 — Commits atómicos + push a Vercel (Regla 1)</name>
  <files></files>
  <read_first>
    - `git status` para confirmar archivos modified vs untracked.
  </read_first>
  <action>
    Estrategia commit (atomic per chunk — Rule 1 `code-changes.md`):

    1. **Commit 1: AUDIT + KB rewrites** (los 18 KBs + 07-AUDIT.md):
       ```bash
       git add .planning/standalone/somnio-v4-rag-generative/07-AUDIT.md \
               src/lib/agents/somnio-v4/knowledge/
       git commit -m "$(cat <<'EOF'
       feat(somnio-v4-rag): Plan 07 Task 7.1-7.2 — auditoría + rewrite nunca_decir 18 KBs

       Reescribe items del array nunca_decir en los 18 KBs siguiendo molde
       proposicional declarativo afirmativo (mold A/B). Resuelve los 3
       false-positives del guardrail Gemini Flash-Lite detectados en Smoke A
       Plan 05 (cases 2 embarazo, 13 duracion_efecto, 14 habitos sueno).

       D-09 honored: nunca-decir-check.ts intocado.
       v4 sigue dormant (sin routing rule).

       Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
       EOF
       )"
       ```

    2. **Commit 2: DB sync evidence** (si quedó algún archivo log opcional — usualmente cero archivos nuevos, este step se skipea).

    3. **Commit 3: Smoke A V2 results + docs cierre:**
       ```bash
       git add .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md \
               .planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md \
               .planning/standalone/somnio-v4-rag-generative/STATUS.md \
               .planning/standalone/somnio-v4-rag-generative/STATE.md
       git commit -m "$(cat <<'EOF'
       docs(somnio-v4-rag): Plan 07 SHIPPED — Smoke A V2 + summary

       Re-run Smoke A post-rewrite: PASS X/17, INV 0/17. Cases 2/13/14
       flipeados a PASS. Plan 06 (Smoke B) unblocked.

       Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
       EOF
       )"
       ```

    4. **Push a Vercel (Regla 1):**
       ```bash
       git push origin main
       ```

       **NOTA Regla 6:** v4 sigue dormant en prod. El push de Plan 07 es seguro porque:
       - 0 cambios de código (solo `.md` content).
       - El sync.ts ya escribió a DB en Task 7.4 (no requiere re-deploy para tomar efecto).
       - v3 productivo intocado.
       - No hay routing rule activa para v4 → sin tráfico.

    5. **Verificación post-push:**
       ```bash
       git log --oneline -5 origin/main
       ```
       Confirmar que los 2 commits están en HEAD.
  </action>
  <verify>
    <automated>git log --oneline -5 origin/main 2>&amp;1 | head -5 &amp;&amp; git status</automated>
  </verify>
  <done>
    2 commits atómicos en main (rewrites + docs). Push exitoso a origin/main. `git status` clean (excepto posiblemente `.v1.bak` que se ignora — no commitearlo). v4 dormant verificable via SQL.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Items del KB `nunca_decir` (texto markdown) → array `agent_knowledge_base.nunca_decir` (DB) | Atacante teóricamente podría inyectar texto malicioso en un KB para envenenar el guardrail — pero todos los `.md` son repo-tracked y revisados via PR. Riesgo bajo en contexto solo-dev. |
| Array `nunca_decir` (DB) → prompt del Gemini Flash-Lite | El LLM recibe los items como reglas. Un item mal-redactado puede generar false-positives (bug funcional) o false-negatives (que un item débil no atrape una violación real). Plan 07 mitiga via molde declarativo + verificación en Smoke A. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-07-01 | Repudiation | El rewrite debilita una regla original (false-negative cuando antes era true-positive) | HIGH | mitigate | Task 7.2.1 (Jose review del AUDIT) verifica que NINGUNA propuesta cambia la dirección semántica de la regla. Anti-regression check inline en Task 7.2. Smoke A V2 detecta regresiones si una inversión de polaridad permite que la generación afirme algo prohibido — judge marcará invención si pasa. |
| T-07-02 | Tampering | Un commit del Plan 07 toca un archivo fuera del scope (e.g. `sub-loop/*.ts`) por accidente | LOW | mitigate | Task 7.9 hace `git add` SOLO de los paths permitidos (`knowledge/` + `.planning/standalone/somnio-v4-rag-generative/`). `git status` final verifica clean tree fuera de scope. CI typecheck en push detectaría cualquier código roto. |
| T-07-03 | Elevation of Privilege | El sync a prod (Task 7.4) corre sin que v4 esté dormant — repuebla DB que está sirviendo tráfico | LOW | mitigate | Verificación SQL en Task 7.9 + observación: ningún `routing_rule.active=true` con `somnio-sales-v4` en el event. v4 está dormant desde Plan 03 — la DB se puede repoblar sin riesgo de tráfico. |
| T-07-04 | Denial of Service | Smoke A V2 (Task 7.5) re-corre 17 casos × 2 Gemini calls = 34 API calls. Si free-tier, fail. | LOW | accept | Plan 05 ya validó paid-tier Gemini activo. Throttle 7s entre casos es safety net. Si quota fail mid-run, re-correr es idempotente (resultados parciales se persisten incrementalmente). |
| T-07-05 | Information Disclosure | El AUDIT.md contiene items verbatim que pueden contener phrasings de producto médico — no es PII pero es product detail. | LOW | accept | El AUDIT vive en `.planning/standalone/` que es repo-tracked público (para el equipo). No hay exposición externa. |
</threat_model>

<verification>
- [ ] Task 7.1: 07-AUDIT.md existe con 18 bloques (uno por KB).
- [ ] Task 7.2.1: Jose review del AUDIT completado y "approved".
- [ ] Task 7.2: 18 KBs editados SOLO en sección `## NUNCA decir`. Resto intacto verificable via `git diff`.
- [ ] Task 7.3: Tests parser + coherence-check verdes.
- [ ] Task 7.4: `pnpm knowledge:sync` retorna 18/18 OK. SQL SELECT confirma 18 filas con array no-vacío + embedding presente.
- [ ] Task 7.5: SMOKE-A-RESULTS-V2.md existe. PASS ≥16/17, INV = 0/17, RUNTIME = 0. Cases 2, 13, 14 = PASS.
- [ ] Task 7.6 (condicional): si se invocó, single refinement loop completado y boundary respetada.
- [ ] Task 7.7: 07-SUMMARY.md con sections completas, 3 before/after diffs, aggregate V1 vs V2, Regla 5 evidence.
- [ ] Task 7.8: STATUS.md + STATE.md actualizados.
- [ ] Task 7.9: 2 commits atómicos en main, push exitoso, v4 dormant verificado.
- [ ] **`nunca-decir-check.ts`, `output-schema.ts`, `prompt.ts`, `few-shots.ts`, `tone-base.ts`, `safe-output.ts`, `kb-search-tool.ts`, `tooling-call.ts`, `generation-call.ts`, `index.ts`, `comprehension-schema.ts`, `parser.ts`, `sync.ts`, `coherence-check.ts` NO MODIFICADOS** — verificable via `git log --oneline -- <path>` (no debe aparecer commit del Plan 07).
</verification>

<success_criteria>
**Plan 07 cierra exitosamente cuando:**

- [ ] 07-AUDIT.md committeado con 18 bloques + Jose-approved.
- [ ] 18 KBs editados SOLO en `## NUNCA decir` siguiendo molde A/B + propiedades P1/P2/P3.
- [ ] `pnpm knowledge:sync` retorna 18/18 OK. DB confirma data populated + embeddings nuevos.
- [ ] Smoke A V2: ≥16/17 PASS judge + 0 invenciones + cases 2, 13, 14 flipped a PASS.
- [ ] 07-SUMMARY.md committeado con audit findings + before/after diffs + Smoke A V2 aggregate + Regla 5 evidence + decisión final.
- [ ] STATUS.md y STATE.md reflejan Plan 07 DONE.
- [ ] 2 commits atómicos en `main` + push a Vercel exitoso.
- [ ] v4 sigue dormant (`active_v4_rules = 0` post-push).
- [ ] Cero cambios de código TypeScript en `src/lib/agents/somnio-v4/**`.
- [ ] Plan 06 (Smoke B) unblocked.

**Plan 07 cierra con excepciones (sub-óptimo pero aceptable):**

- 15/17 PASS (no 16) + cases 2, 13, 14 flipped + 0 invenciones → cerrar con nota en SUMMARY explicando qué caso restante falló por qué.
- 1-2 items KEEP-AS-IS que el AUDIT no anticipó pero post-rewrite descubrió que son intratables — documentar en SUMMARY + dejar como excepción.

**Plan 07 falla (requiere escalation):**

- <15/17 PASS post-refinamiento individual (Task 7.6 boundary alcanzada).
- Aparición de invenciones (judge marca `Y`) post-rewrite → indicador de regla debilitada → STOP push, revertir.
- Smoke A V2 reporta nuevos failure modes que no son `nunca_decir_violation` → no es problema del plan; pero documenta y escala.
</success_criteria>

<rollback>
**Rollback completo del Plan 07** (si Task 7.5 V2 muestra invenciones o Smoke A V2 sale peor que V1):

```bash
# 1. Restaurar KBs originales:
git revert <commit-sha-rewrites> --no-edit

# 2. Re-syncear prod con KBs originales:
pnpm knowledge:sync

# 3. Verificar 18/18 OK con texto original.
# 4. v4 sigue dormant — sin riesgo de tráfico.

# 5. Documentar fail en 07-SUMMARY.md + flag escalation al usuario.
```

**Rollback parcial** (1 KB específico romperse):

```bash
# Restaurar SOLO ese KB:
git checkout HEAD~1 -- src/lib/agents/somnio-v4/knowledge/<path>.md
pnpm knowledge:sync
# Re-correr solo el caso afectado.
```

**Pre-condiciones para rollback safe:**

- v4 sigue dormant ANTES y DESPUÉS de Plan 07. Verificar siempre con SQL en CLAUDE.md/Regla 6.
- v3 productivo intocado — el rollback de Plan 07 no afecta v3.
- Cero migraciones SQL en Plan 07 → no hay schema rollback necesario.
</rollback>

<deviation_policy>
**Casos que el ejecutor puede encontrarse y cómo proceder:**

1. **AUDIT (Task 7.1) revela que NO hay items que requieran rewrite** (false alarm — todos los items ya conformaban):
   - Documentar finding en 07-SUMMARY.md con tabla por KB mostrando que todos los items pasan P1+P2+P3.
   - Saltar Task 7.2 directamente a Task 7.5 (re-run Smoke A V2 para validar que los 3 FAILs no fueron del nunca_decir-check sino de otra cosa).
   - Si Smoke A V2 sin cambios reproduce los 3 FAILs igual → confirmar que el bug NO está en los items, sino en el judge LLM → escalar para revisar `nunca-decir-check.ts` (saldría del scope de Plan 07).

2. **AUDIT revela que >50% de items requieren rewrite** (más de lo esperado):
   - Task 7.1 lo flagea explícitamente.
   - Task 7.2.1 (Jose review) decide si proceder con todo o priorizar solo los items críticos de cases 2/13/14.
   - Si Jose decide proceder con todo → continuar normal.
   - Si Jose decide reducir scope → Plan 07 cubre solo los 3 KBs problemáticos + se documenta el resto como deuda en 07-SUMMARY.md para un Plan 07b futuro.

3. **Smoke A V2 muestra ≥1 invención (regresión por debilitamiento de regla)**:
   - STOP. No push.
   - Identificar cuál item rewriteado permitió que la generación afirme algo nuevo.
   - Restaurar ese item específico via `git checkout HEAD~1 -- <path>`.
   - Re-syncear.
   - Re-correr Smoke A V2.
   - Documentar el ítem problemático en 07-SUMMARY.md (probablemente requiere mold B o reformulación más fuerte).

4. **Un item genuinamente NO se puede reformular como proposición** (ej. una lista lexical de substrings tabú como `"te derivo", "asesor humano", "tomo nota"`):
   - Marcar `KEEP-AS-IS` en AUDIT.
   - Documentar en 07-SUMMARY.md como excepción.
   - Si después de KEEP-AS-IS ese mismo item sigue rompiendo el judge → señal de que el judge tiene otro problema (no del molde) → fuera de scope Plan 07, escalar.

5. **`pnpm knowledge:sync` falla mid-run** (Task 7.4):
   - Revisar logs (probablemente OpenAI quota o Supabase auth).
   - Re-correr (el script es idempotente — upserts por `(workspace_id, agent_id, topic)`).
   - Si persiste, no es scope del plan → escalar.

6. **El test runner Smoke A V2 (Task 7.5) tarda más que esperado** (paid tier Gemini lento):
   - Es esperado: ~13 min para 17 casos con throttle 7s.
   - Si excede 20 min, posible quota throttling → revisar dashboard de Google AI Studio.
</deviation_policy>

<output>
After completion, the executor will have:

1. Modified the 18 KB markdown files (sección `## NUNCA decir` only).
2. Created `.planning/standalone/somnio-v4-rag-generative/07-AUDIT.md`.
3. Created `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS-V2.md`.
4. Created `.planning/standalone/somnio-v4-rag-generative/07-SUMMARY.md`.
5. Updated `.planning/standalone/somnio-v4-rag-generative/STATUS.md`.
6. Updated (or created) `.planning/standalone/somnio-v4-rag-generative/STATE.md`.
7. 2 atomic commits pushed to `origin/main`.
8. v4 sigue dormant en prod (verificable via SQL).
9. Plan 06 (Smoke B) unblocked y listo para correr.
</output>
