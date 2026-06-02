# PATTERNS — somnio-v4-rag-generative

**Standalone:** somnio-v4-rag-generative
**Generated:** 2026-05-16
**Files mapped:** 31 (4 KB infra + 18 KB docs + 7 sub-loop + 1 SQL migration + 1 SQL routing rule + tests cross-cut)
**Source CONTEXT/DISCUSSION/RESEARCH:** consumed verbatim. Planner consumes this map to assign analog excerpts to each plan.

---

## Index by Plan

| Plan | Files | Wave | autonomous | Notes |
|---|---|---|---|---|
| 01 — KB schema update | `knowledge-base/parser.ts`, `knowledge-base/sync.ts`, `knowledge-base/coherence-check.ts`, migración SQL `{ts}_somnio_v4_kb_schema_rag_generative.sql`, RPC `match_knowledge_base` update | 1 | **false** (Regla 5 PAUSE) | Apply SQL en prod ANTES de cualquier push |
| 02 — Reescribir 18 KBs | 18 archivos en `src/lib/agents/somnio-v4/knowledge/**/*.md` | 2 | true | **ATOMIC DEPLOY UNIT con Plan 03** |
| 03 — Sub-loop split + borrar canonical | `sub-loop/index.ts` (refactor), `sub-loop/output-schema.ts` (refactor), `sub-loop/prompt.ts` (refactor), `sub-loop/tooling-call.ts` (NEW), `sub-loop/generation-call.ts` (NEW), `sub-loop/safe-output.ts` (NEW), `sub-loop/tone-base.ts` (NEW), `sub-loop/kb-search-tool.ts` (potential update — RPC RETURNS shape changed in Plan 01) | 2 | true | **ATOMIC DEPLOY UNIT con Plan 02 (D-24)** |
| 04 — Few-shots calibración | `sub-loop/few-shots.ts` (NEW), `sub-loop/prompt.ts` (update — inyecta few-shots) | 3 | true | Aplica M1-M4 de RESEARCH |
| 05 — Smoke A | `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (NEW) o `scripts/somnio-v4-rag-smoke-judge.ts` (NEW) + `SMOKE-A-RESULTS.md` | 4 | true | 17 casos + LLM-as-judge automation |
| 06 — Smoke B | `src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` (NEW) + `SMOKE-B-RESULTS.md` | 4 | true | 10 casos regression (paths no-migrados) |
| 07 — HOLD | — (placeholder; abrir solo si Smoke A < 15/17 PASS o ≥1 invención) | — | — | No abrir si smokes pasan |
| 08 — Flip productivo | SQL `INSERT INTO routing_rules` (NO archivo en repo — usuario ejecuta en Supabase Studio) | 5 | **false** (Regla 6 manual user action) | Genera SQL pre-formado para que usuario corra |

---

## Files (categorized)

### Categoría 1 — KB infra (Plan 01)

#### `src/lib/agents/somnio-v4/knowledge-base/parser.ts` (MODIFY)

- **Plan:** 01
- **Rol:** Parse frontmatter YAML + extract 6 new sections del body markdown.
- **Análogo origen:** sí mismo (estado actual, `src/lib/agents/somnio-v4/knowledge-base/parser.ts:1-110`).
- **Excerpt actual a EXTENDER (líneas 7-15 — FrontmatterSchema):**
  ```ts
  export const FrontmatterSchema = z.object({
    topic: z.string().min(1),
    keywords: z.array(z.string()),
    category: z.enum(['product', 'policies', 'edge-cases', 'faqs-no-templated']),
    last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'last_reviewed debe ser YYYY-MM-DD'),
    reviewed_by: z.string().min(1),
    escalate_if: z.array(z.string()).optional(),
    related_topics: z.array(z.string()).optional(),
  })
  ```
- **Excerpt actual a REEMPLAZAR (líneas 19-110 — sections + parseSections):**
  ```ts
  export interface ParsedKbDoc {
    frontmatter: Frontmatter
    body: string
    sections: {
      canonica?: string       // <- borrar
      alternativa?: string    // <- borrar
      nuncaDecir: string[]
      sources?: string        // <- borrar
    }
  }
  // parseSections() actualmente reconoce 4 headers:
  //   'Respuesta canónica' | 'Si el cliente insiste' | 'NUNCA decir' | 'Sources'
  // → reemplazar por 5 headers nuevos (D-01).
  ```
- **Pattern NUEVO de RESEARCH § KB Template Structure (líneas 947-958):**
  - Frontmatter agrega: `tone_override: z.string().nullable().optional()` (D-05).
  - `ParsedKbDoc.sections` shape nuevo:
    ```ts
    sections: {
      hechosDelProducto: string        // D-01 #2
      posicionDelNegocio: string       // D-01 #3
      debeContener: string[]           // D-01 #4 (items con prefijo [SIEMPRE] / [SI APLICA])
      nuncaDecir: string[]             // D-01 #5 (mantenido del actual)
      cuandoEscalar: string[]          // D-01 #6
    }
    ```
  - `parseSections` reconoce 5 headers:
    - `## Hechos del producto`
    - `## Posición del negocio` (defensive: aceptar `Posicion` sin tilde)
    - `## Debe contener la respuesta` o `## Debe contener`
    - `## NUNCA decir` (no cambia)
    - `## Cuándo escalar a humano` o `## Cuándo escalar`
  - Headers deprecated (ignorar silenciosamente si aparecen): `Respuesta canónica`, `Si el cliente insiste`, `Sources`.
  - `debeContener` se parsea como bullets `- item` (igual lógica que `nuncaDecir`).
- **Pattern a COPIAR del propio file (NO TOCAR):**
  - `normalizeFrontmatterDates` (líneas 59-65) — sigue manejando YAML date auto-parse.
  - `matter()` de `gray-matter` (línea 1) — sigue siendo el frontmatter parser.

---

#### `src/lib/agents/somnio-v4/knowledge-base/sync.ts` (MODIFY)

- **Plan:** 01
- **Rol:** Upsert KB doc parseado → tabla `agent_knowledge_base` con embedding (skip si body_hash sin cambios).
- **Análogo origen:** sí mismo (`src/lib/agents/somnio-v4/knowledge-base/sync.ts:1-77`).
- **Excerpt actual a EXTENDER (líneas 51-68 — upsertPayload):**
  ```ts
  const upsertPayload = {
    workspace_id: SOMNIO_WORKSPACE_ID,
    agent_id: SOMNIO_V4_AGENT_ID,
    topic: parsed.frontmatter.topic,
    keywords: parsed.frontmatter.keywords,
    category: parsed.frontmatter.category,
    embedding,
    canonical_response: parsed.sections.canonica ?? null,  // <- DEPRECATED: dejar null o eliminar
    nunca_decir: parsed.sections.nuncaDecir,                // ← mantener
    escalate_triggers: parsed.frontmatter.escalate_if ?? [],
    related_topics: parsed.frontmatter.related_topics ?? [],
    source_md_path: filePath,
    body_hash: bodyHash,
    last_reviewed_at: parsed.frontmatter.last_reviewed,
    reviewed_by: parsed.frontmatter.reviewed_by,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  ```
- **Pattern NUEVO (Plan 01):**
  - Agregar al upsertPayload las 4 columnas nuevas:
    ```ts
    hechos_del_producto: parsed.sections.hechosDelProducto,
    posicion_del_negocio: parsed.sections.posicionDelNegocio,
    debe_contener: parsed.sections.debeContener,
    cuando_escalar: parsed.sections.cuandoEscalar,
    tone_override: parsed.frontmatter.tone_override ?? null,
    ```
  - `canonical_response`: dejar `null` (RESEARCH líneas 877-881 dice "DEPRECATED para somnio-v4. Otros agentes pueden seguir usándolo" → la columna queda en la tabla pero somnio-v4 deja de poblarla).
- **Pattern a NO TOCAR:**
  - El skip por body_hash (líneas 42-50) — mantiene la lógica existente.
  - `createAdminClient` (línea 31) — el sync corre como script local (no en runtime agente), NO viola Regla 3 (la regla protege mutaciones del runtime, scripts de sync KB son admin).

---

#### `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` (MODIFY)

- **Plan:** 01
- **Rol:** Validar que folder=category + (NEW) cada KB doc tiene las 5 secciones obligatorias.
- **Análogo origen:** sí mismo (`src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts:1-17`).
- **Excerpt actual (líneas 1-17):**
  ```ts
  export function coherenceCheck(filePath: string, frontmatterCategory: string): void {
    const parts = filePath.replace(/\\/g, '/').split('/')
    const folderCategory = parts[parts.length - 2]
    if (frontmatterCategory !== folderCategory) {
      throw new Error(`Coherence fail: ${filePath} folder=${folderCategory} frontmatter.category=${frontmatterCategory}`)
    }
  }
  ```
- **Pattern NUEVO de RESEARCH § Coherence check changes (líneas 961-967):**
  - Extender signature: `coherenceCheck(filePath, frontmatterCategory, sections)` donde `sections` es el nuevo `ParsedKbDoc['sections']`.
  - Validaciones nuevas:
    - `hechos_del_producto` non-empty.
    - `posicion_del_negocio` non-empty.
    - `debe_contener` array non-empty + cada item empieza con `[SIEMPRE]` o `[SI APLICA]` (regex match).
    - `nunca_decir` array (puede ser vacío — topics no-edge-case).
    - `cuando_escalar` array (puede ser vacío).

---

#### `supabase/migrations/{ts}_somnio_v4_kb_schema_rag_generative.sql` (NEW)

- **Plan:** 01
- **Rol:** ALTER TABLE `agent_knowledge_base` agregando 5 columnas para las nuevas secciones + RPC `match_knowledge_base` actualizada RETURNS shape.
- **Análogo origen:** `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql` (tabla original) + `supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql` (RPC existente) + `.planning/standalone/crm-mutation-tools/01-PLAN.md:38-69` (pattern: timestamp Bogota + ALTER + COMMENT + grants).
- **Pattern verbatim de RESEARCH § DB Migration Guidance (líneas 862-885):**
  ```sql
  -- supabase/migrations/{TS}_somnio_v4_kb_schema_rag_generative.sql
  -- Standalone: somnio-v4-rag-generative / Plan 01
  -- Regla 5: usuario aplica manualmente ANTES de pushear código del Plan 02/03.
  -- Regla 6: v4 sigue dormant — no afecta producción hasta Plan 08.

  ALTER TABLE public.agent_knowledge_base
    ADD COLUMN IF NOT EXISTS hechos_del_producto TEXT,
    ADD COLUMN IF NOT EXISTS posicion_del_negocio TEXT,
    ADD COLUMN IF NOT EXISTS debe_contener TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS cuando_escalar TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tone_override TEXT;

  COMMENT ON COLUMN public.agent_knowledge_base.canonical_response IS
    'DEPRECATED para somnio-v4 (RAG-generative, 2026-05-16). Otros agentes pueden seguir usándolo.';

  -- Drop & recreate RPC con nuevas columnas en RETURNS:
  DROP FUNCTION IF EXISTS public.match_knowledge_base(UUID, TEXT, vector(1536), TEXT, INT);

  CREATE OR REPLACE FUNCTION public.match_knowledge_base(
    p_workspace_id UUID,
    p_agent_id TEXT,
    p_query_embedding vector(1536),
    p_category TEXT DEFAULT NULL,
    p_limit INT DEFAULT 3
  ) RETURNS TABLE(
    topic TEXT,
    canonical_response TEXT,
    nunca_decir TEXT[],
    escalate_triggers TEXT[],
    related_topics TEXT[],
    category TEXT,
    -- NUEVAS para RAG-generative:
    hechos_del_producto TEXT,
    posicion_del_negocio TEXT,
    debe_contener TEXT[],
    cuando_escalar TEXT[],
    tone_override TEXT,
    distance NUMERIC
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
    RETURN QUERY
    SELECT
      kb.topic, kb.canonical_response, kb.nunca_decir,
      kb.escalate_triggers, kb.related_topics, kb.category,
      kb.hechos_del_producto, kb.posicion_del_negocio, kb.debe_contener,
      kb.cuando_escalar, kb.tone_override,
      (kb.embedding <=> p_query_embedding)::NUMERIC AS distance
    FROM public.agent_knowledge_base kb
    WHERE kb.workspace_id = p_workspace_id
      AND kb.agent_id = p_agent_id
      AND (p_category IS NULL OR kb.category = p_category)
    ORDER BY kb.embedding <=> p_query_embedding
    LIMIT p_limit;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.match_knowledge_base(UUID, TEXT, vector(1536), TEXT, INT) TO service_role;

  -- ROLLBACK:
  -- (regenerar RPC con shape pre-Plan 01 desde 20260501100400; DROP COLUMN IF EXISTS las 5 nuevas)
  ```
- **Project-specific landmines:**
  - Timestamp pattern: `TS=$(TZ=America/Bogota date +%Y%m%d%H%M%S)` (verbatim de `.planning/standalone/crm-mutation-tools/01-PLAN.md:45`).
  - **NO RLS** (la tabla original ya está creada con GRANTs `service_role` + `authenticated SELECT` desde la migration original; ALTER no requiere nuevas policies).
  - **Idempotencia:** `ADD COLUMN IF NOT EXISTS` para que correr 2 veces no rompa.
  - **`DROP FUNCTION IF EXISTS ... ` antes de `CREATE OR REPLACE`** porque el RETURNS shape cambia (Postgres requiere drop explícito si cambia signature de RETURN TABLE).
- **Regla 5 PAUSE:** Plan 01 `autonomous: false`. Plan task instruye: "Crear archivo migration. PAUSAR. Pedí al usuario que aplique en Supabase prod via Studio. ESPERAR confirmación explícita ANTES de proceder con Plan 02/03."

---

### Categoría 2 — KB docs (Plan 02 — 18 archivos)

#### `src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md` (MODIFY — template completo)

- **Plan:** 02
- **Rol:** KB doc reescrita formato 6 secciones (D-01).
- **Análogo origen:** sí misma en estado actual (`src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md:1-24`).
- **Excerpt actual a BORRAR (líneas 10-23):**
  ```markdown
  ## Respuesta canónica
  Te recomendamos no combinar ELIXIR DEL SUEÑO con alcohol. ...

  ## Si el cliente insiste
  Si dice "¿pero si solo tomé una cerveza?", le respondes...

  ## NUNCA decir
  - aprobar combinación con alcohol
  - ...
  ```
- **Pattern NUEVO de RESEARCH § KB Template Structure (líneas 902-945) — verbatim para este topic:**
  ```markdown
  ---
  topic: interaccion_alcohol
  keywords: [alcohol, trago, cerveza, vino, ron, fiesta, licor]
  category: edge-cases
  last_reviewed: 2026-05-16
  reviewed_by: jose
  related_topics: [como_se_toma, contraindicaciones]
  escalate_if:
    - cliente insiste en combinar tras advertencia
  tone_override: null
  ---

  ## Hechos del producto
  La melatonina puede potenciar el efecto sedante del alcohol y causar somnolencia
  excesiva o malestar al día siguiente. Esto es un mecanismo farmacológico documentado:
  ambos compuestos son depresores del SNC.

  ## Posición del negocio
  NO recomendamos combinar el ELIXIR DEL SUEÑO con alcohol. La empresa prioriza
  seguridad sobre conveniencia. Si el cliente bebió en una ocasión social, la
  recomendación es saltarse la dosis esa noche y retomar al día siguiente.

  ## Debe contener la respuesta
  - [SIEMPRE] Recomendación explícita de NO combinar
  - [SIEMPRE] Mención breve del mecanismo (potencia sedación / depresor SNC)
  - [SI APLICA] Si el cliente menciona "ya bebí" → instruir saltarse dosis esa noche
  - [SI APLICA] Si el cliente pregunta "¿y solo una cerveza?" → reiterar recomendación general sin minimizar
  - [SI APLICA] Si el cliente insiste a pesar de la advertencia → escalar a humano

  ## NUNCA decir
  - aprobar combinación con alcohol
  - minimizar el riesgo ("una cerveza no afecta")
  - recomendar "tomar más para dormir más rápido si bebiste"
  - afirmar que "el alcohol potencia bien el efecto del producto"
  - mencionar valeriana ni cualquier ingrediente que no sea melatonina + citrato de magnesio
  - usar palabras como "te derivo", "te paso", "asesor humano", "tomo nota"

  ## Cuándo escalar a humano
  - cliente insiste en combinar tras la advertencia
  - cliente reporta haber tomado dosis con alcohol y siente malestar
  - cliente pregunta sobre interacciones con otros depresores del SNC (benzodiacepinas, opioides)
  ```
- **Migración procedimiento (D-04):** "Si el cliente insiste" actual → trasladar sub-escenarios a items `[SI APLICA]` de `## Debe contener la respuesta`.
- **Pattern a INVERTIR:** El texto que en el formato actual era prescriptivo ("Te recomendamos no combinar...") ahora se reescribe como Hechos (descriptivo) + Posición (prescriptivo). El modelo Gemini se encarga de redactar al cliente — el KB ya no contiene la respuesta tal cual.

#### Los 17 KB docs restantes — MISMO PATRÓN

Listado exhaustivo de los 18 archivos (Plan 02 los reescribe TODOS verbatim según mismo template):

| # | Path | Categoría DB |
|---|------|---|
| 1 | `knowledge/edge-cases/insomnio_largo_plazo.md` | edge-cases |
| 2 | `knowledge/edge-cases/interaccion_alcohol.md` | edge-cases |
| 3 | `knowledge/edge-cases/interaccion_medicamentos.md` | edge-cases |
| 4 | `knowledge/edge-cases/uso_en_embarazo.md` | edge-cases |
| 5 | `knowledge/edge-cases/uso_en_ninos.md` | edge-cases |
| 6 | `knowledge/faqs-no-templated/alternativas_naturales.md` | faqs-no-templated |
| 7 | `knowledge/faqs-no-templated/duracion_efecto.md` | faqs-no-templated |
| 8 | `knowledge/faqs-no-templated/precio_comparativo.md` | faqs-no-templated |
| 9 | `knowledge/policies/devoluciones.md` | policies |
| 10 | `knowledge/policies/envio.md` | policies |
| 11 | `knowledge/policies/pago.md` | policies |
| 12 | `knowledge/product/como_se_toma.md` | product |
| 13 | `knowledge/product/contenido.md` | product |
| 14 | `knowledge/product/contraindicaciones.md` | product |
| 15 | `knowledge/product/dependencia.md` | product |
| 16 | `knowledge/product/efectividad.md` | product |
| 17 | `knowledge/product/formula.md` | product |
| 18 | `knowledge/product/registro_sanitario.md` | product |

**Patrón aplicado a cada archivo:**
- Frontmatter: mantener `topic`, `keywords`, `category`, `last_reviewed` (update a 2026-05-16), `reviewed_by`, `related_topics`, `escalate_if`. Agregar `tone_override: null` (opcional override D-05).
- Reescribir body con 5 secciones (5 headers `## ` listados arriba).
- `## Hechos del producto`: lo verificable (mecanismo, datos del producto).
- `## Posición del negocio`: la postura/recomendación de Somnio (puede modularse sin cambiar Hechos — D-02).
- `## Debe contener la respuesta`: cada item con prefijo `[SIEMPRE]` (obligatorio) o `[SI APLICA]` (condicional D-03). D-04: absorber "Si el cliente insiste" actual aquí.
- `## NUNCA decir`: copiar verbatim del actual + agregar nuevos si el flujo de revisión revela faltantes.
- `## Cuándo escalar a humano`: derivar del `escalate_if` actual del frontmatter + expandir si necesario.

**Pitfall a respetar (RESEARCH Pitfall 8 línea 1013):** los embeddings cambian post-reescritura (D-06 acepta esto). Plan 02 debe correr `sync` end-to-end y verificar con un Smoke pequeño (5-6 queries representativas — RESEARCH § Recommendations to Planner #2) que las similarities siguen funcionando.

---

### Categoría 3 — Sub-loop orchestrator + nuevos files (Plan 03 — ATÓMICO con Plan 02)

#### `src/lib/agents/somnio-v4/sub-loop/index.ts` (REFACTOR)

- **Plan:** 03 (deploy unit con Plan 02)
- **Rol:** Orchestrator del sub-loop — split en `runToolingCall()` + `runGenerationCall()`. Borra el flujo canonical verbatim para low_confidence/razonamiento_libre. Mantiene flujo viejo para crm_mutation/cas_reject (D-12).
- **Análogo origen:** sí mismo en estado actual canonical (`src/lib/agents/somnio-v4/sub-loop/index.ts:1-407`).
- **Excerpt actual a BORRAR (líneas 192-217 — single generateText call):**
  ```ts
  let output: LoopOutcome
  let subLoopResult: Awaited<ReturnType<typeof generateText>> | null = null
  try {
    subLoopResult = await runWithPurpose('subloop', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        system: buildSubLoopPrompt(args.reason),
        messages: [...],
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(6),
        output: Output.object({ schema: LoopOutcomeSchema }),
      })
    )
    output = subLoopResult.output
  } catch (genErr) { ... }
  ```
- **Excerpt actual a BORRAR (líneas 335-381 — NUNCA-decir check sobre `output.canonicalText`):**
  - Mantener la llamada `checkNuncaDecir` pero ahora sobre `generation.responseText` (no `output.canonicalText`).
  - Mantener `nuncaDecirRules` pero ahora viene de `tooling.material_del_topic.nunca_decir`.
- **Pattern NUEVO de RESEARCH § Architecture Patterns + Step 4 (líneas 555-630):**
  ```ts
  // Switch por reason — preserva paths viejos D-12
  if (args.reason === 'crm_mutation' || args.reason === 'cas_reject') {
    // FLUJO VIEJO INTACTO — single generateText con tools + Output.object
    // Copy verbatim del bloque actual (líneas 192-217), pero con `tools` filtrado al subset crm_mutation/cas_reject
    return runLegacySubLoop({ reason: args.reason, ctx: args.ctx, tools, onDebug: args.onDebug })
  }

  // FLUJO NUEVO RAG-generative — low_confidence | razonamiento_libre
  const tooling = await runToolingCall({
    reason: args.reason,
    ctx: args.ctx,
    systemPrompt: buildToolingPrompt(args.reason),
  })
  if (tooling.should_handoff || !tooling.topic_seleccionado) {
    return handoffOutcome(tooling.handoff_reason ?? 'no_relevant_hit', { ... })
  }

  const generation = await runGenerationCall({
    systemPrompt: buildGenerationPrompt(tooling.material_del_topic, TONE_BASE, fewShots),
    userMessage: args.ctx.userMessage,
    recentMessages: args.ctx.recentMessages,
  })

  // D-19 threshold check
  if (generation.responseConfidence < 0.70) {
    return handoffOutcome('low_response_confidence', {
      reportedConfidence: generation.responseConfidence,
      rationale: generation.confidenceRationale,
    })
  }

  // M3 binary backstop (RESEARCH § Self-Reported Confidence M3)
  if (generation.binary === 'FALTA_INFO' || generation.binary === 'FUERA_SCOPE') {
    return handoffOutcome(`binary_backstop_${generation.binary}`, { ... })
  }

  // D-09 NUNCA-decir SIN CAMBIOS — solo el origen del texto y de las rules cambia
  const nuncaCheck = await checkNuncaDecir({
    candidateText: generation.responseText,
    nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? [],
  })
  if (!nuncaCheck.ok) return handoffOutcome('nunca_decir_violation', { violation: nuncaCheck.violation })

  return {
    status: 'generated',
    responseText: generation.responseText,
    sourceTopic: tooling.topic_seleccionado,
    responseConfidence: generation.responseConfidence,
    confidenceRationale: generation.confidenceRationale,
    requiresHuman: false,
    reason: 'rag_generated',
    // legacy nullable fields (deprecated path):
    canonicalText: null,    // ← BORRAR del schema en output-schema.ts
    nuncaDecirRules: tooling.material_del_topic.nunca_decir,
    responseTemplate: null,
    knowledgeQueried: [tooling.topic_seleccionado],
  }
  ```
- **Pattern a PRESERVAR del file actual:**
  - `getOpenAI()` lazy singleton (líneas 33-45) — mover a `tooling-call.ts`.
  - `extractStepData()` helper (líneas 104-183) — mover a `tooling-call.ts` y a `generation-call.ts` (cada una con su versión).
  - `onDebug` callback (línea 94 + emisiones líneas 262-273, 314-325, 366-378, 394-403) — extender para soportar 2 calls (tooling debug + generation debug).
  - `validateLoopOutcomeInvariants` (línea 290) — update por nuevo schema (`generated` vs `canonical`).
  - `runWithPurpose` wrap (línea 195) — replicar con `'subloop_tooling'` y `'subloop_generation'` (mismo patrón de comprehension.ts línea 84).
- **D-12 path crm_mutation/cas_reject preservar VERBATIM** — toda la lógica actual de single-call con tools + Output.object queda igual para esos 2 reasons.

---

#### `src/lib/agents/somnio-v4/sub-loop/tooling-call.ts` (NEW)

- **Plan:** 03
- **Rol:** Call 1 — GPT-4o mini con `kb_search` tool + Output.object → emite `{ topic_seleccionado, material_del_topic, should_handoff, handoff_reason }`.
- **Análogo origen:** RESEARCH § Code Examples § Tooling call (líneas 1037-1095) + `src/lib/agents/somnio-v4/sub-loop/index.ts:33-45` (lazy `getOpenAI()` singleton).
- **Pattern verbatim de RESEARCH (líneas 1041-1094) — copiar como base:**
  ```ts
  import { generateText, Output, stepCountIs } from 'ai'
  import { z } from 'zod'
  import { createOpenAI } from '@ai-sdk/openai'
  import { kbSearchTool, type KbHit } from './kb-search-tool'
  import { runWithPurpose } from '@/lib/observability'
  import { safeAccessOutput } from './safe-output'

  const ToolingOutputSchema = z.object({
    topic_seleccionado: z.string().nullable(),
    material_del_topic: z.object({
      hechos: z.string().nullable(),
      posicion: z.string().nullable(),
      debe_contener_aplicables: z.array(z.string()).nullable(),
      nunca_decir: z.array(z.string()).nullable(),
      cuando_escalar: z.array(z.string()).nullable(),
    }).nullable(),
    should_handoff: z.boolean(),
    handoff_reason: z.string().nullable(),
  })

  export type ToolingOutput = z.infer<typeof ToolingOutputSchema>

  // Lazy singleton — MISMO patrón que sub-loop/index.ts:33-45 (mover acá)
  let openaiClient: ReturnType<typeof createOpenAI> | null = null
  function getOpenAI() {
    if (!openaiClient) {
      const apiKey = process.env.OPENAI_API_KEY_SALESV4
      if (!apiKey) throw new Error('OPENAI_API_KEY_SALESV4 not set')
      openaiClient = createOpenAI({ apiKey })
    }
    return openaiClient
  }

  export async function runToolingCall(args: {
    reason: 'low_confidence' | 'razonamiento_libre'
    ctx: { workspaceId: string; userMessage: string; recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> }
    systemPrompt: string
  }): Promise<ToolingOutput> {
    const result = await runWithPurpose('subloop_tooling', () =>
      generateText({
        model: getOpenAI()('gpt-4o-mini'),
        system: args.systemPrompt,
        messages: [
          ...args.ctx.recentMessages,
          { role: 'user' as const, content: args.ctx.userMessage },
        ],
        tools: { kb_search: kbSearchTool({ workspaceId: args.ctx.workspaceId }) },
        toolChoice: 'auto',  // NO 'required' (W-06 — bloquearía output final)
        stopWhen: stepCountIs(4),
        output: Output.object({ schema: ToolingOutputSchema }),
      })
    )
    return safeAccessOutput(result, ToolingOutputSchema)
  }
  ```
- **Pattern landmines verificables:**
  - `toolChoice: 'auto'` NUNCA `'required'` (anti-pattern RESEARCH líneas 429).
  - `stopWhen: stepCountIs(4)` (no 6 como ahora — la 2da call separada absorbe lo que necesitaba más steps).
  - safe-output wrapper SIEMPRE (Pitfall 1 — vercel/ai#11348).

---

#### `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` (NEW)

- **Plan:** 03
- **Rol:** Call 2 — Gemini 2.5 Flash sin tools, solo Output.object → emite `{ responseText, responseConfidence, confidenceRationale, binary }`.
- **Análogo origen:**
  - RESEARCH § Code Examples § Generation call (líneas 1097-1145).
  - `src/lib/agents/somnio-v4/comprehension.ts:64-120` (patrón Gemini Flash-Lite con `Output.object` + safetySettings BLOCK_NONE; el más cercano del codebase — mismo modelo family, mismo provider, mismo pattern de runtime real).
  - `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts:34-66` (Gemini Flash-Lite + safetySettings BLOCK_NONE — patrón verbatim de safetySettings para CORE business médico-adyacente).
- **Pattern verbatim de RESEARCH (líneas 1100-1144):**
  ```ts
  import { generateText, Output } from 'ai'
  import { google } from '@ai-sdk/google'
  import { z } from 'zod'
  import { runWithPurpose } from '@/lib/observability'
  import { safeAccessOutput } from './safe-output'

  const GenerationOutputSchema = z.object({
    responseText: z.string(),
    responseConfidence: z.number(),
    confidenceRationale: z.string(),
    binary: z.enum(['RESPONDE_BIEN', 'FALTA_INFO', 'FUERA_SCOPE']),  // M3 backstop
  })
  export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

  export async function runGenerationCall(args: {
    systemPrompt: string  // includes TONE_BASE + few-shots + material del topic
    userMessage: string
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  }): Promise<GenerationOutput> {
    const result = await runWithPurpose('subloop_generation', () =>
      generateText({
        model: google('gemini-2.5-flash'),
        system: args.systemPrompt,
        messages: [
          ...args.recentMessages.slice(-4),  // history corto
          { role: 'user' as const, content: args.userMessage },
        ],
        temperature: 0.3,  // D-10
        output: Output.object({ schema: GenerationOutputSchema }),
        providerOptions: {
          google: {
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          },
        },
      })
    )
    return safeAccessOutput(result, GenerationOutputSchema)
  }
  ```
- **Patrón a COPIAR del análogo `nunca-decir-check.ts:55-64` verbatim:** los 4 `safetySettings` BLOCK_NONE. CORE business médico-adyacente requiere desactivar safety por Iter 5b learning (RESEARCH Pitfall 6).
- **Patrón a COPIAR del análogo `comprehension.ts:102-119`:** try/catch wrap con diagnostic info (`finishReason`, `text`, `responseBody`, `cause`) para debugging — replicar misma estructura en `generation-call.ts`.

---

#### `src/lib/agents/somnio-v4/sub-loop/safe-output.ts` (NEW)

- **Plan:** 03
- **Rol:** Defensive wrapper alrededor de `result.output` para escapar el bug vercel/ai#11348 (`NoOutputGeneratedError` con JSON válido en `result.text`).
- **Análogo origen:** RESEARCH § Pattern 3: Defensive output access (líneas 388-419). NO existe en el codebase aún.
- **Codebase análogo más cercano:**
  - `src/lib/agents/somnio-v4/comprehension.ts:122-136` (defensive `result.output` access con try/catch + diagnostic) — patrón conceptualmente equivalente pero no implementado como reusable wrapper.
- **Pattern verbatim de RESEARCH (líneas 394-419):**
  ```ts
  import { NoObjectGeneratedError } from 'ai'
  import { z } from 'zod'

  export function safeAccessOutput<T>(
    result: Awaited<ReturnType<typeof import('ai').generateText>>,
    schema: z.ZodSchema<T>,
  ): T {
    try {
      return result.output as T
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err) && result.text) {
        try {
          const parsed = JSON.parse(result.text)
          return schema.parse(parsed)
        } catch (parseErr) {
          throw new Error(
            `[safeAccessOutput] Got NoObjectGeneratedError + manual parse also failed: ` +
            `${(parseErr as Error).message} | text="${result.text.slice(0, 200)}"`
          )
        }
      }
      throw err
    }
  }
  ```

---

#### `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` (REFACTOR)

- **Plan:** 03 (atómico con Plan 02 — runtime rompe si solo uno se aplica)
- **Rol:** `LoopOutcomeSchema` actualizado — status `canonical` → `generated`, `canonicalText` → `responseText`, agregar `responseConfidence` + `confidenceRationale`.
- **Análogo origen:** sí mismo (`src/lib/agents/somnio-v4/sub-loop/output-schema.ts:1-149`).
- **Excerpt actual a BORRAR (líneas 44-90 — status enum + canonical fields):**
  ```ts
  status: z.enum(['template', 'canonical', 'no_match']).describe('...')
  canonicalText: z.string().nullable().describe('Verbatim de "## Respuesta canónica"...')
  sourceTopic: z.string().nullable()
  nuncaDecirRules: z.array(z.string()).nullable()
  responseTemplate: z.string().nullable()
  knowledgeQueried: z.array(z.string()).nullable()
  requiresHuman: z.boolean()
  reason: z.string()
  ```
- **Pattern NUEVO (post-Plan 03 — derivado de RESEARCH § Pattern Schema cambios líneas 644-653):**
  ```ts
  export const LoopOutcomeSchema = z.object({
    status: z.enum(['generated', 'template', 'no_match']).describe(
      "Discriminator del outcome — 'generated' reemplaza 'canonical' (D-24, ya no es verbatim)."
    ),
    // generated fields (nullable cuando status !== 'generated')
    responseText: z.string().nullable().describe(
      "Texto generado por Gemini Flash usando SOLO el material del KB (D-08)."
    ),
    sourceTopic: z.string().nullable(),
    responseConfidence: z.number().nullable().describe(
      "0..1 auto-reportado por el modelo (D-15). Threshold 0.70 → handoff (D-19)."
    ),
    confidenceRationale: z.string().nullable().describe(
      "1 frase razón del confidence — observability."
    ),
    nuncaDecirRules: z.array(z.string()).nullable(),
    // template fields (path crm_mutation/cas_reject D-12 — SIN cambios)
    responseTemplate: z.string().nullable(),
    knowledgeQueried: z.array(z.string()).nullable(),
    // común
    requiresHuman: z.boolean(),
    reason: z.string(),
  })
  ```
- **Pattern a INVERTIR en `validateLoopOutcomeInvariants` (líneas 119-149):**
  - Reemplazar todas las referencias a `status === 'canonical'` por `status === 'generated'`.
  - Agregar validación: `status === 'generated'` → `responseText !== null && sourceTopic !== null && responseConfidence !== null && requiresHuman === false`.
  - **Pattern a PRESERVAR:** invariantes para `template` y `no_match` (líneas 131-147) NO cambian (D-12 — paths sin migrar).
- **Co-modified con Plan 02:** este file PLUS los 18 KBs PLUS sub-loop/index.ts forman el deploy unit atómico.

---

#### `src/lib/agents/somnio-v4/sub-loop/prompt.ts` (REFACTOR)

- **Plan:** 03 (estructura base) + Plan 04 (inyectar few-shots)
- **Rol:** Builders separados por call: `buildToolingPrompt(reason)` + `buildGenerationPrompt(material, toneBase, fewShots)`.
- **Análogo origen:** sí mismo (`src/lib/agents/somnio-v4/sub-loop/prompt.ts:1-72`).
- **Excerpt actual a CONSERVAR PARCIALMENTE — `buildSubLoopPrompt(reason)` con switch por reason (líneas 34-70):**
  - Renombrar a `buildToolingPrompt(reason)`.
  - Mantener cases `crm_mutation` y `cas_reject` SIN CAMBIOS (D-12).
  - Reescribir cases `low_confidence` y `razonamiento_libre` para que el prompt instruya a GPT mini a SELECCIONAR UN topic (D-11) y emitir `material_del_topic`, NO redactar respuesta al cliente.
- **Excerpt actual a BORRAR (líneas 19-32 — el `common` prompt habla de 3 opciones template/canonical/no_match):**
  - Reemplazar por instrucción "Tu trabajo es seleccionar UN topic del KB que mejor responda la pregunta y emitir su material parseado. Si ningún hit es relevante → should_handoff=true".
- **Pattern NUEVO `buildGenerationPrompt`:**
  - Recibe `(material: ToolingOutput['material_del_topic'], toneBase: string, fewShots: FewShot[])`.
  - Compone: `TONE_BASE + REGLAS_DURAS_ANTI_INVENCIÓN (RESEARCH líneas 706-727) + few-shots formateados + MATERIAL DEL TOPIC parseado`.
  - **M1 reformulation (RESEARCH líneas 513-522):** la pregunta de framing del confidence usa "PROBABILIDAD que un compañero humano experto diría que tu respuesta es completa y NO requiere consultarlo con un humano".
  - **M3 binary backstop (líneas 526-533):** instrucción explícita para el `binary` field del output.
- **Pattern a NO TOCAR (D-12):** cases `crm_mutation` y `cas_reject` siguen con el prompt actual exacto.

---

#### `src/lib/agents/somnio-v4/sub-loop/tone-base.ts` (NEW)

- **Plan:** 03
- **Rol:** Constante global `TONE_BASE` con el tono Somnio: "cálido pero firme, sin moralismo, breve" (D-05).
- **Análogo origen:** NO existe en codebase. Patrón es `string const` simple — análogo cercano: `src/lib/agents/somnio-v4/constants.ts:1-50` (otras constantes del agente).
- **Pattern derivado de DISCUSSION-LOG D-05 + RESEARCH § Anti-Invention Prompt (líneas 706-727):**
  ```ts
  /**
   * D-05: tono global Somnio inyectado al system prompt de generation-call.
   * Override per-topic vía frontmatter.tone_override (parsed por parser.ts).
   */
  export const TONE_BASE = `
  Tono Somnio: cálido pero firme. Sin moralismo. Breve (2-4 oraciones máximo
  salvo que el caso justifique más). Usa "tú" (NO "usted"). NO uses emojis salvo en
  cierre de despedida si encaja. NO seas dramático ni alarmista; comunicá hechos
  con calma.
  `.trim()
  ```

---

#### `src/lib/agents/somnio-v4/sub-loop/few-shots.ts` (NEW — Plan 04)

- **Plan:** 04
- **Rol:** 8-10 few-shots de calibración del `responseConfidence` cubriendo rango 0.20-0.95 (M2 RESEARCH).
- **Análogo origen:** NO existe en codebase. Análogo conceptual = `src/lib/agents/somnio-v4/comprehension-prompt.ts` (few-shots de comprehension v4 con escala 0..1 — RESEARCH §M1-M4 menciona que tono y formato siguen ese patrón).
- **Pattern de RESEARCH § Self-Reported Confidence M2-M4 (líneas 524-542):**
  - Escala DISCRETA: solo 5 valores `0.20 / 0.40 / 0.60 / 0.80 / 0.95` (M2 — evita anchoring noise + da buckets claros).
  - Cobertura RANGO COMPLETO (M4):
    - 2 few-shots de 0.95 (cubrimiento total)
    - 2 few-shots de 0.80 (cubrimiento alto con leve adaptación)
    - 2 few-shots de 0.60 (cubrimiento parcial)
    - 2 few-shots de 0.40 (cubrimiento bajo)
    - 2 few-shots de 0.20 (cubrimiento nulo)
  - Estructura por few-shot: `{ pregunta, material, respuesta, confidence (uno de los 5), rationale (1 frase), binary }`.
  - Idioma: español original del corpus real (Pitfall RESEARCH "Don't Hand-Roll" — NO traducir).
- **Source casos:** los 17 casos del Smoke A (D-25) sirven de base para derivar few-shots — usar 8 reales del corpus + 2 nuevos para cubrir gaps.

---

#### `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` (POTENTIAL UPDATE)

- **Plan:** 03 (light touch — solo si shape del RPC cambia con Plan 01)
- **Rol:** AI SDK tool wrapper alrededor de RPC `match_knowledge_base`. Retorna `KbHit[]` enriquecido con las nuevas columnas.
- **Análogo origen:** sí mismo (`src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts:1-119`).
- **Pattern a EXTENDER (líneas 11-23 — `KbHit` interface):**
  ```ts
  export interface KbHit {
    topic: string
    canonicalResponse: string | null   // DEPRECATED para somnio-v4 — leer pero ignorar
    nuncaDecirRules: string[]
    relatedTopics: string[]
    category: string
    similarity: number
    // NUEVAS para RAG-generative (Plan 01 RPC RETURNS update):
    hechosDelProducto: string | null
    posicionDelNegocio: string | null
    debeContener: string[]
    cuandoEscalar: string[]
    toneOverride: string | null
  }
  ```
- **Pattern a EXTENDER (líneas 96-103 — map RPC rows):**
  ```ts
  const hits = (data ?? []).map((row: any) => ({
    topic: row.topic,
    canonicalResponse: row.canonical_response,  // mantener por backwards compat
    nuncaDecirRules: (row.nunca_decir as string[] | null) ?? [],
    relatedTopics: row.related_topics ?? [],
    category: row.category,
    similarity: 1 - Number(row.distance),
    // NUEVAS:
    hechosDelProducto: row.hechos_del_producto,
    posicionDelNegocio: row.posicion_del_negocio,
    debeContener: (row.debe_contener as string[] | null) ?? [],
    cuandoEscalar: (row.cuando_escalar as string[] | null) ?? [],
    toneOverride: row.tone_override,
  }))
  ```
- **Pattern a NO TOCAR:**
  - `inputSchema` (línea 62) — sigue siendo `{ query: z.string() }` (Iter 7i locked — sin category param).
  - `workspaceId` viene de `ctx`, NO del input (Pitfall 2 mutation-tools).
  - Lazy embedding + supabase admin (líneas 67-82).
  - El structured log Iter 7e (líneas 108-114) — agregar campos nuevos al log si útil.

---

#### `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (NO TOCAR — D-09)

- **Plan:** ninguno
- **Rol:** Post-gen NUNCA-decir validation con Gemini Flash-Lite.
- **D-09 / D-20 lock:** este file NO se modifica. Solo el caller (`sub-loop/index.ts`) cambia para pasar `generation.responseText` (no `output.canonicalText`) y `tooling.material_del_topic.nunca_decir` (no `output.nuncaDecirRules`).
- **Anti-pattern crítico:** si algún plan modifica este file, viola D-09. Planner debe NO incluir este path en `files_modified` de ningún plan.

---

#### `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` (UPDATE)

- **Plan:** 03 (light touch)
- **Rol:** Extender `SubLoopDebugPayload` para reflejar las 2 calls separadas.
- **Análogo origen:** sí mismo (`src/lib/agents/somnio-v4/sub-loop/debug-payload.ts:1-94`).
- **Pattern a EXTENDER:**
  - Agregar `toolingCall?: { stepCount, finishReason, output: ToolingOutput }` y `generationCall?: { finishReason, output: GenerationOutput, latencyMs }`.
  - Mantener `kbHits` (viene de la tooling call ahora).
  - Mantener `outcome`, `invariantViolation`, `nuncaDecirViolation` (sin cambios — el orquestador sigue emitiendo).
  - Patrón conservador: si tooling.should_handoff → solo emit `toolingCall`, no `generationCall`. Si no → emit ambos.

---

#### `src/lib/agents/somnio-v4/sub-loop/tools.ts` (NO TOCAR — D-12)

- **Plan:** ninguno
- **Rol:** Factory de tool dict por SubLoopReason. Para low_confidence/razonamiento_libre solo da `kb_search`; para crm_mutation/cas_reject sigue dando set de mutation tools.
- **D-12 lock:** los reasons crm_mutation/cas_reject siguen con flujo viejo, así que el tool dict de esos reasons NO cambia. El reason low_confidence/razonamiento_libre todavía retorna `{ kb_search }`, que es lo que `tooling-call.ts` consume.
- **NO está en files_modified de ningún plan.**

---

### Categoría 4 — Tests (Plan 05 + Plan 06)

#### `src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (NEW — Plan 05) + `scripts/somnio-v4-rag-smoke-judge.ts` (NEW)

- **Plan:** 05
- **Rol:** Correr 17 casos de Smoke A (D-25) end-to-end contra el sub-loop NUEVO + LLM-as-judge automation + generar `SMOKE-A-RESULTS.md` con tabla LLM-Judge | Jose | Notes.
- **Análogos origen:**
  - `src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts:1-60` (patrón Vitest + `describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4)` + 60s timeout + real provider call).
  - RESEARCH § LLM-as-Judge Pattern (líneas 731-849) + § Code Examples § LLM-as-Judge call (líneas 1148-1187).
- **Pattern verbatim del análogo `sub-loop-e2e.test.ts:29-51`:**
  ```ts
  import { describe, it, expect } from 'vitest'
  import { runSubLoop } from '../sub-loop'

  // SMOKE A — gated por env vars de prod
  describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4 || !process.env.GOOGLE_GENERATIVE_AI_API_KEY)(
    'Smoke A (rediseño RAG — 17 casos)',
    () => {
      const cases = [/* 17 D-25 cases */]
      for (const c of cases) {
        it(`${c.category} — ${c.userMessage}`, async () => {
          const outcome = await runSubLoop({ reason: c.reason, ctx: { ... } })
          // capturar outcome + invocar judgeRagOutput(args) — RESEARCH líneas 1169-1186
          // escribir incrementalmente a SMOKE-A-RESULTS.md
        }, 60000)
      }
    }
  )
  ```
- **Pattern para LLM-as-judge — verbatim de RESEARCH líneas 1158-1186:**
  ```ts
  const JudgeOutputSchema = z.object({
    faithfulness_score: z.enum(['PASS', 'PARTIAL', 'FAIL']),
    faithfulness_reason: z.string(),
    faithfulness_invented_claims: z.array(z.string()).nullable(),
    relevance_score: z.enum(['PASS', 'PARTIAL', 'FAIL']),
    relevance_reason: z.string(),
    calibration: z.enum(['CALIBRATED', 'MISCALIBRATED_HIGH', 'MISCALIBRATED_LOW']),
    calibration_reason: z.string(),
    overall: z.enum(['PASS', 'PARTIAL', 'FAIL']),
  })

  export async function judgeRagOutput(args: {
    userMessage: string
    topicMaterial: { hechos, posicion, debe_contener, ... }
    generatedResponse: string
    reportedConfidence: number
  }) {
    const { output } = await generateText({
      model: google('gemini-2.5-flash'),  // FLASH separado, NO Flash-Lite (RESEARCH líneas 744-746)
      system: buildJudgeSystemPrompt(),
      messages: [{ role: 'user', content: JSON.stringify(args) }],
      temperature: 0.1,  // más determinista
      output: Output.object({ schema: JudgeOutputSchema }),
    })
    return output
  }
  ```
- **SMOKE-A-RESULTS.md structure** — verbatim de RESEARCH líneas 784-842. Cada caso tiene secciones: Pregunta / Expected / Tooling output / Generation output / Judge / Jose final / Jose notes / Invención detectada (Y/N).
- **Aggregate metrics tabla** (líneas 821-831) + Decision checklist (líneas 833-837) — copiar verbatim.
- **17 casos a probar (D-25 verbatim):**
  - edge-cases (5): alcohol, embarazo, niños, sertralina, lupus
  - product (4): cómo se toma, ingredientes, frasco, adictivo
  - policies (3): Medellín envío, pago, garantía
  - faqs (2): duración, hábitos
  - negativos (3): apnea, Miami, cripto

---

#### `src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` (NEW — Plan 06)

- **Plan:** 06
- **Rol:** Regression — 10 casos cubriendo paths NO migrados (crm_mutation create/update/move + cas_reject + state machine happy path + razonamiento_libre handoff).
- **Análogo origen:** `src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts:1-60` (mismo patrón Vitest).
- **Cases a cubrir:**
  - 3 crm_mutation: createOrder, updateOrder, moveOrderToStage (path D-12 SIN CAMBIOS — debe seguir funcionando idéntico).
  - 1 cas_reject: mock `stage_changed_concurrently` (path D-12 SIN CAMBIOS).
  - 3 state machine happy path: saludo, precio, promo (NO entran al sub-loop — templates intactos).
  - 2 razonamiento_libre: filosofía → handoff silente. Anécdota cliente → handoff o KB hit.
  - 1 low_confidence happy: pregunta clara con KB obvio → debe pasar.
- **Pattern de pass:** ≥9/10 (D-25 verify CONTEXT.md líneas 121-124).
- **No requiere LLM-as-judge** — Smoke B son regresiones de paths estructurales, no requieren juicio cualitativo.

---

### Categoría 5 — Activación productiva (Plan 08)

#### SQL `INSERT INTO routing_rules` (NO archivo en repo — Plan 08 emite SQL pre-formado)

- **Plan:** 08
- **Rol:** Activar v4 en producción mediante routing rule en tabla `routing_rules` del workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`).
- **Análogo origen verbatim:** `.claude/rules/agent-scope.md:200-238` (Godentist FB/IG sibling Activacion D-15 manual SQL pre-formado).
- **Pattern a COPIAR (template completo):**
  ```sql
  -- Pre-check 1: verificar feature flag del lifecycle router activo en Somnio
  SELECT lifecycle_routing_enabled
  FROM workspace_agent_config
  WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
  -- Esperado: true. Si false:
  -- UPDATE workspace_agent_config SET lifecycle_routing_enabled=true
  -- WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';

  -- Pre-check 2: verificar priority libre + audit del estado actual
  SELECT priority, name, event::text
  FROM routing_rules
  WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true
  ORDER BY priority;
  -- Notar qué priority slots están tomados (somnio-recompra-v1, somnio-sales-v3, etc.).
  -- Escoger un priority libre acorde a la prioridad relativa que v4 debe tener.

  -- Pre-check 3: confirmar smokes pasados + LEARNINGS escrito
  -- (no es SQL — checklist humano: SMOKE-A-RESULTS.md ≥15/17 PASS, SMOKE-B-RESULTS.md ≥9/10 PASS,
  --  0 invenciones detectadas, LEARNINGS.md presente)

  -- Crear la rule (decidir conditions con usuario en Plan 08 task — ej. is_client=false + intent en rango v4):
  INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
  VALUES (
    'a3843b3f-c337-4836-92b5-89c58bb98490',
    'Somnio Sales v4 RAG routing',
    'router',
    NN,  -- priority a definir
    jsonb_build_object(
      'all', jsonb_build_array(
        -- conditions específicas v4 — Plan 08 task las define con usuario
        jsonb_build_object('fact', 'channel', 'operator', 'equal', 'value', 'whatsapp')
      )
    ),
    jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'somnio-sales-v4')),
    true
  );

  -- Para desactivar (rollback rápido — recovery time <10s tras cache TTL):
  -- UPDATE routing_rules SET active=false
  -- WHERE name='Somnio Sales v4 RAG routing'
  --   AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
  ```
- **Regla 6 manual user action:** Plan 08 `autonomous: false`. El plan task instruye al ejecutor a:
  1. Generar el SQL pre-formado en un bloque markdown dentro del plan (NO escribir archivo).
  2. PAUSAR.
  3. Pedir al usuario: "Smokes pasaron. Ejecutá este SQL en Supabase Studio cuando quieras activar v4 en prod. Confirmá cuándo lo aplicaste para que actualice STATUS.md".
  4. Esperar confirmación.
  5. Update STATUS.md + LEARNINGS.md.
- **NO crear el SQL como archivo de migración** — esto NO es una migración. Es una operación de routing manual (Regla 6).
- **Conditions del rule:** Plan 08 task tiene una sub-decisión D-31 (slot abierto en DISCUSSION-LOG líneas 386-394) para definir `conditions` exactas con el usuario. PATTERNS.md no puede pre-decidirlo.

---

## Co-Modification Constraints (CRÍTICO)

### Plan 02 + Plan 03 = ATOMIC DEPLOY UNIT (D-24)

**Files modificados en Plan 02 (18 KB docs):**
- `src/lib/agents/somnio-v4/knowledge/edge-cases/{5 files}.md`
- `src/lib/agents/somnio-v4/knowledge/faqs-no-templated/{3 files}.md`
- `src/lib/agents/somnio-v4/knowledge/policies/{3 files}.md`
- `src/lib/agents/somnio-v4/knowledge/product/{7 files}.md`

**Files modificados en Plan 03 (6 sub-loop files + 1 KB infra):**
- `src/lib/agents/somnio-v4/sub-loop/index.ts` (refactor)
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` (refactor)
- `src/lib/agents/somnio-v4/sub-loop/prompt.ts` (refactor)
- `src/lib/agents/somnio-v4/sub-loop/tooling-call.ts` (NEW)
- `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` (NEW)
- `src/lib/agents/somnio-v4/sub-loop/safe-output.ts` (NEW)
- `src/lib/agents/somnio-v4/sub-loop/tone-base.ts` (NEW)
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` (light extend — nuevas cols del RPC)
- `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` (light extend)

**Sugerencia al planner:**
Plan 02 y Plan 03 se ejecutan back-to-back en Wave 2 con commits separados PERO **push se hace UNA VEZ después de Plan 03** (no entre ambos). Si Plan 02 commitea y Plan 03 falla a mitad de camino, el repo local queda con KB en formato nuevo + sub-loop esperando formato viejo — runtime rompe si alguien pushea. **Mitigación:** ambos planes corren bajo un git worktree único + se hace `git push origin main` solo tras Plan 03 verify-phase. Si Plan 03 falla → rollback Plan 02 con `git reset --hard`.

**Otra opción más conservadora:** un solo commit grande con ambos cambios (18 KBs + 6 sub-loop files). El planner decide según preferencia del usuario en discuss-phase (D-31 slot).

### Plan 01 → Plan 02/03 (Regla 5)

Plan 01 incluye PAUSE manual para apply SQL en prod. Plan 02 y Plan 03 NO pueden empezar hasta que usuario confirme apply. El executor del Plan 01 debe explícitamente bloquearse al final con mensaje del tipo "PAUSADO — esperando que usuario aplique migración en Supabase prod".

### Plan 05 → Plan 08 (D-26 + RESEARCH § Anti-Invention #3)

Plan 08 NO se ejecuta si:
- Smoke A < 15/17 PASS, O
- ≥1 invención detectada en Smoke A (bloqueante per RESEARCH líneas 696-700), O
- Smoke B < 9/10 PASS.

Si alguna condición se rompe → abrir Plan 07 (HOLD) para iter (re-calibrar few-shots, agregar `checkSourceGrounding`, etc.).

---

## Project-Specific Landmines

1. **Regla 5 PAUSE en Plan 01** — `autonomous: false` MANDATORY. El plan task debe terminar con un step explícito "PAUSAR — pedir al usuario que aplique migración en Supabase prod via Studio. ESPERAR confirmación explícita ANTES de avanzar al Plan 02/03". Antecedente verbatim: `.planning/standalone/crm-mutation-tools/01-PLAN.md:15`.

2. **Regla 6 v4 dormant** — Plans 01-07 NO crean rules en `routing_rules` con `somnio-sales-v4`. Solo Plan 08 lo hace, y es manual user action (`autonomous: false`). Antecedente verbatim: `.planning/standalone/agent-godentist-fb-ig/` activación D-15.

3. **No tocar v3/recompra/pw-confirmation/godentist/godentist-fb-ig** — file diff debería estar limitado a:
   - `src/lib/agents/somnio-v4/**` (sub-loop, knowledge, knowledge-base)
   - `supabase/migrations/{ts}_somnio_v4_kb_schema_rag_generative.sql`
   - `.planning/standalone/somnio-v4-rag-generative/**`
   - `src/lib/agents/somnio-v4/__tests__/**` (tests nuevos)
   - `scripts/somnio-v4-rag-smoke-judge.ts` (opcional)
   - Si algún plan toca files fuera de estos paths → STOP, viola Regla 6.

4. **D-09 NUNCA-decir SIN CAMBIOS** — `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` NO debe estar en `files_modified` de ningún plan. Solo el caller cambia argumentos.

5. **D-12 crm_mutation/cas_reject sin cambios** — el path por `reason='crm_mutation'` y `'cas_reject'` del sub-loop preserva flujo viejo verbatim. El refactor del Plan 03 debe agregar un branch `if (reason === 'crm_mutation' || reason === 'cas_reject')` que routea al runLegacySubLoop (extracción del bloque actual). Smoke B Plan 06 verifica regresion.

6. **D-25 comprehension-schema.ts NO TOCAR** — `src/lib/agents/somnio-v4/comprehension-schema.ts` NO está en files_modified de ningún plan. Locked por D-25 del standalone hermano somnio-sales-v4-runtime-wiring + reafirmado en RESEARCH líneas 32-33.

7. **Pitfall 7 (RESEARCH)** — `z.union` o `z.record` rotos en Gemini provider. Plan 03 review check: `grep -rE "z\.union|z\.record" src/lib/agents/somnio-v4/sub-loop/` debe retornar 0 matches. ToolingOutputSchema y GenerationOutputSchema usan solo enum + nullable.

8. **Pitfall 6 BLOCK_NONE safety** — `generation-call.ts` DEBE incluir los 4 safetySettings BLOCK_NONE (verbatim del análogo `nunca-decir-check.ts:57-63`). Sin esto, Gemini puede bloquear silentemente menciones de "alcohol", "embarazo", "anticoagulantes" → texto vacío → `NoOutputGeneratedError`. Iter 5b learning.

9. **Pitfall 4 — nunca mezclar `intent_confidence` con `response_confidence`** — son 2 métricas distintas. Naming en código: `intentConfidence` (del comprehension, decide trigger del sub-loop) vs `responseConfidence` (del generation-call, decide handoff por baja cobertura del KB). Plan 03 review: NO usar variable abreviada como `confidence` solita.

10. **Latencia compound (Pitfall 9)** — 2 calls encadenadas = ~4s LLM + cold boot. El webhook responde 200 inmediato (no critical path), pero p95 sub-loop puede subir a >8s. Métrica de éxito CONTEXT.md líneas 127: p50 <6s. Si Plan 05 / Plan 06 muestran p95 > 8s, considerar A/B downgrade a Flash-Lite (D-08 A/B comparison pendiente).

---

## Pattern Confidence

| Categoría | Confianza | Razón |
|---|---|---|
| KB docs (Plan 02) | **HIGH** | Template claro D-01 + RESEARCH § KB Template Structure verbatim, 18 análogos idénticos (los .md actuales) |
| KB infra (Plan 01) — parser/sync/coherence-check | **HIGH** | Análogos directos en el mismo file, RESEARCH § Parser changes (líneas 947-958) explícito |
| Migración SQL (Plan 01) | **HIGH** | Convención project muy clara (timestamp Bogota + ALTER + COMMENT). Análogo `crm-mutation-tools/01-PLAN.md` + RESEARCH líneas 862-885 verbatim |
| Sub-loop tooling-call (Plan 03) | **HIGH** | RESEARCH § Code Examples líneas 1037-1095 verbatim + `getOpenAI()` lazy singleton del file actual reutilizable |
| Sub-loop generation-call (Plan 03) | **HIGH** | RESEARCH § Code Examples líneas 1097-1145 verbatim + `nunca-decir-check.ts` y `comprehension.ts` son análogos directos del codebase (mismo Gemini provider, mismo Output.object, mismo safetySettings BLOCK_NONE) |
| safe-output wrapper (Plan 03) | **MEDIUM-HIGH** | Sin análogo previo en codebase como reusable wrapper — pero patrón estructural existe en `comprehension.ts:122-136` + RESEARCH líneas 394-419 explícito + bug ticket vercel/ai#11348 documentado |
| Output schema refactor (Plan 03) | **HIGH** | Schema flat ya validado E2E contra GPT-4o mini (`sub-loop-e2e.test.ts`), solo cambia enum value y agrega 2 nullable fields. RESEARCH líneas 644-653 explícito |
| Prompt refactor (Plan 03) | **MEDIUM-HIGH** | Estructura switch-por-reason actual reusable, contenido low_confidence/razonamiento_libre se reescribe pero crm_mutation/cas_reject preserva (D-12 — patrón "preservar legacy switch" es claro) |
| Few-shots calibración (Plan 04) | **MEDIUM** | Sin análogo directo de M1-M4 en codebase (comprehension-prompt.ts tiene few-shots de comprehension v4 pero estructura distinta). RESEARCH § M1-M4 (líneas 509-542) tiene receta concreta — confianza viene de la literatura citada |
| Tone-base (Plan 03) | **MEDIUM** | Sin análogo directo. String const trivial, riesgo bajo |
| Smoke A LLM-as-judge (Plan 05) | **MEDIUM-HIGH** | Patrón nuevo en codebase pero RESEARCH § Code Examples líneas 1148-1186 tiene snippet + rubric (líneas 747-777) verbatim. SMOKE-A-RESULTS.md structure (líneas 784-842) verbatim. Análogo Vitest pattern del `sub-loop-e2e.test.ts` reusable |
| Smoke B regression (Plan 06) | **HIGH** | Solo verifica regresion de paths NO migrados (D-12). Pattern Vitest análogo directo. Sin juicio cualitativo (no necesita LLM-as-judge) |
| Routing rule SQL (Plan 08) | **HIGH** | Template verbatim de `.claude/rules/agent-scope.md:200-238` (Godentist FB/IG sibling D-15 manual SQL pre-formado). Solo cambia workspace_id + agent_id + name |

---

## Notas finales al planner

1. **D-31..D-35 slots abiertos** (DISCUSSION-LOG líneas 386-394) — el planner puede agregar sub-decisiones según los gaps que detecte. Específicamente:
   - D-31 candidato: ¿commit único o 2 commits para Plan 02 + Plan 03? (decidir con usuario en plan task)
   - D-32 candidato: naming exacto de los fields del responseText en LoopOutcomeSchema (PATTERNS sugiere `responseText`, `responseConfidence`, `confidenceRationale`)
   - D-33 candidato: cómo se persiste el `responseConfidence` en `agent_observability_*` tables (recordEvent verbose)
   - D-34 candidato: prompt template exacto del LLM-as-judge (PATTERNS sugiere base de RESEARCH líneas 749-777)
   - D-35 candidato: estructura exacta de SMOKE-A-RESULTS.md (PATTERNS sugiere verbatim de RESEARCH líneas 786-842)

2. **A1/A2/A3 recommendations del RESEARCH** ya están integradas en PATTERNS:
   - A1 (split tooling/generación) → Pattern 1 + tooling-call.ts + generation-call.ts.
   - A2 (M1-M4 calibration) → few-shots.ts + prompt.ts.
   - A3 (safeAccessOutput wrapper) → safe-output.ts.

3. **Tests existentes que NO deben romperse:**
   - `src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts` — verifica schema flat acceptance contra GPT-4o mini real. Plan 03 cambia el schema (status enum + 2 nuevos fields). Plan 03 task debe ACTUALIZAR este test para reflejar nuevo enum (`generated` en vez de `canonical`).
   - `src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts` — Plan 03 update.
   - `src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts` — Plan 03 light update si shape de KbHit cambia.
   - `src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` — Plan 01 update (nuevo schema + nuevas secciones).
   - `src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` — Plan 01 update.
