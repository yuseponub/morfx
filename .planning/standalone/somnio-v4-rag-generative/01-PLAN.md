---
plan: 01
wave: 1
phase: standalone-somnio-v4-rag-generative
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/knowledge-base/parser.ts
  - src/lib/agents/somnio-v4/knowledge-base/sync.ts
  - src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts
  - src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts
  - src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts
  - supabase/migrations/<ts>_somnio_v4_kb_schema_rag_generative.sql
autonomous: false  # Regla 5 PAUSE for SQL apply to production
requirements: []
user_setup: []

must_haves:
  truths:
    - "Production Supabase agent_knowledge_base tiene 5 nuevas columnas: hechos_del_producto, posicion_del_negocio, debe_contener, cuando_escalar, tone_override."
    - "RPC match_knowledge_base retorna las 5 nuevas columnas en su RETURNS TABLE."
    - "Parser reconoce las 5 nuevas markdown sections (D-01 #2..#6: Hechos del producto, Posición del negocio, Debe contener la respuesta, NUNCA decir, Cuándo escalar a humano) + frontmatter actualizado (D-01 #1, agrega tone_override) — total 6 elementos por KB. Ignora silenciosamente las 3 deprecated (Respuesta canónica, Si el cliente insiste, Sources)."
    - "Frontmatter parser acepta tone_override opcional (D-05)."
    - "Sync emite las 5 columnas nuevas + deja canonical_response = null para somnio-v4 (D-24)."
    - "Coherence-check valida: hechos_del_producto non-empty, posicion_del_negocio non-empty, debe_contener non-empty con cada item prefijado [SIEMPRE] o [SI APLICA], nunca_decir array (puede ser vacío), cuando_escalar array (puede ser vacío)."
    - "v4 sigue dormant en producción (sin routing rule)."
  artifacts:
    - path: "src/lib/agents/somnio-v4/knowledge-base/parser.ts"
      provides: "Schema YAML extendido + parseSections 5-headers nuevos"
      contains: "hechosDelProducto"
    - path: "src/lib/agents/somnio-v4/knowledge-base/sync.ts"
      provides: "upsertPayload con 5 columnas nuevas"
      contains: "hechos_del_producto"
    - path: "src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts"
      provides: "Validaciones nuevas: secciones requeridas + prefijos [SIEMPRE]/[SI APLICA]"
      contains: "SIEMPRE"
    - path: "supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql"
      provides: "ALTER TABLE + DROP/CREATE RPC match_knowledge_base con nuevo RETURNS shape"
      contains: "ADD COLUMN IF NOT EXISTS hechos_del_producto"
  key_links:
    - from: "src/lib/agents/somnio-v4/knowledge-base/parser.ts"
      to: "src/lib/agents/somnio-v4/knowledge-base/sync.ts"
      via: "ParsedKbDoc.sections shape"
      pattern: "sections\\."
    - from: "src/lib/agents/somnio-v4/knowledge-base/sync.ts"
      to: "agent_knowledge_base table"
      via: "upsertPayload con 5 columnas nuevas + RPC RETURNS update"
      pattern: "hechos_del_producto"
---

<objective>
Wave 1 — Schema foundation: actualizar parser/sync/coherence-check TypeScript + crear migración SQL que agrega 5 columnas nuevas al `agent_knowledge_base` + actualiza el RPC `match_knowledge_base` para retornarlas. Incluye Regla 5 PAUSE bloqueante: el usuario aplica la migración a producción Supabase ANTES de pushear cualquier código del Plan 02/03.

Purpose: el sub-loop nuevo (Plan 03) consume las columnas nuevas vía el RPC. Sin esta foundation, los Plans 02/03 fallan en runtime con "column does not exist". Esta es la ÚNICA migración SQL en archivo (`supabase/migrations/`) del standalone — Plan 08 emite SQL en bloque markdown, NO en archivo.

Output:
- 3 archivos TS refactor (parser, sync, coherence-check) + 2 tests actualizados.
- 1 migración SQL nueva en `supabase/migrations/` con ALTER TABLE + DROP/CREATE RPC.
- Migración APLICADA en producción (Task 1.4 PAUSE).
- Commit + push (Task 1.6 — solo después del apply confirmado por usuario).

**CRITICAL — Regla 5 PAUSE:** Task 1.4 es checkpoint:human-action bloqueante. NO se puede pushear código del Plan 02/03 hasta que el usuario confirme apply.

**Regla 6 — v4 dormant:** este plan NO toca `routing_rules`. v4 sigue sin tráfico en producción.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/code-changes.md
@./.claude/rules/gsd-workflow.md
@./.claude/rules/agent-scope.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/crm-mutation-tools/01-PLAN.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1.1: Refactor parser.ts — extend FrontmatterSchema + parseSections (5 headers nuevos)</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/parser.ts (estado actual completo, 110 líneas)
    - src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts (tests actuales — para entender estructura de assertion antes de actualizar)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 29-86 (parser MODIFY excerpt — copiar verbatim)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 947-958 (Parser changes section)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-01..D-05 (formato KB + tone_override)
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-v4/knowledge-base/parser.ts` aplicando 3 cambios:

    **Cambio A — FrontmatterSchema:** Agregar `tone_override: z.string().nullable().optional()` al objeto Zod existente. Mantener todos los campos actuales (topic, keywords, category, last_reviewed, reviewed_by, escalate_if, related_topics) sin tocar.

    **Cambio B — ParsedKbDoc.sections shape:** Reemplazar el shape actual `{ canonica?, alternativa?, nuncaDecir, sources? }` por el shape nuevo:

    ```ts
    export interface ParsedKbDoc {
      frontmatter: Frontmatter
      body: string
      sections: {
        hechosDelProducto: string        // D-01 #2
        posicionDelNegocio: string       // D-01 #3
        debeContener: string[]           // D-01 #4 (items con prefijo [SIEMPRE] / [SI APLICA])
        nuncaDecir: string[]             // D-01 #5 (mantenido del actual)
        cuandoEscalar: string[]          // D-01 #6
      }
    }
    ```

    **Cambio C — parseSections function:** Reescribir el reconocedor de headers para que reconozca los 5 nuevos:

    - `## Hechos del producto`
    - `## Posición del negocio` (defensive: aceptar también `Posicion` sin tilde)
    - `## Debe contener la respuesta` o `## Debe contener` (aceptar ambos)
    - `## NUNCA decir` (no cambia)
    - `## Cuándo escalar a humano` o `## Cuándo escalar` (aceptar ambos)

    Headers deprecated (`Respuesta canónica`, `Si el cliente insiste`, `Sources`): ignorar silenciosamente si aparecen (no throwear). El log debe simplemente skipearlos.

    `debeContener`, `nuncaDecir`, `cuandoEscalar` se parsean como bullets `- item` (mismo helper que ya usa `nuncaDecir`). `hechosDelProducto` y `posicionDelNegocio` se parsean como texto continuo (string, no array).

    **Preservar:**
    - `normalizeFrontmatterDates` (líneas 59-65 actuales) — sin cambios.
    - `matter()` de `gray-matter` (línea 1) — sin cambios.

    Si los tests existentes (`__tests__/parser.test.ts`) usan los headers viejos, ACTUALIZARLOS en Task 1.5 — no en este task.
  </action>
  <verify>
    <automated>grep -c "hechosDelProducto" src/lib/agents/somnio-v4/knowledge-base/parser.ts && grep -c "posicionDelNegocio" src/lib/agents/somnio-v4/knowledge-base/parser.ts && grep -c "debeContener" src/lib/agents/somnio-v4/knowledge-base/parser.ts && grep -c "cuandoEscalar" src/lib/agents/somnio-v4/knowledge-base/parser.ts && grep -c "tone_override" src/lib/agents/somnio-v4/knowledge-base/parser.ts && npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/parser" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "hechosDelProducto" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -c "posicionDelNegocio" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -c "debeContener" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -c "cuandoEscalar" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -c "tone_override" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -c "Hechos del producto" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1 (header literal en código)
    - `grep -c "Posici" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1 (header literal, acentuado o no)
    - `grep -c "Debe contener" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -c "Cuándo escalar\\|Cuando escalar" src/lib/agents/somnio-v4/knowledge-base/parser.ts` ≥ 1
    - `grep -E "canonica\\?|alternativa\\?|sources\\?" src/lib/agents/somnio-v4/knowledge-base/parser.ts` retorna 0 matches (shape viejo eliminado)
    - `npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/parser" | wc -l` == 0
  </acceptance_criteria>
  <done>Parser reconoce las 5 markdown sections nuevas (D-01 #2..#6) + frontmatter actualizado con tone_override (D-01 #1) — 6 elementos D-01 totales. Shape viejo eliminado.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.2: Refactor sync.ts — upsertPayload con 5 columnas nuevas (canonical_response = null para somnio-v4)</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (estado actual completo, 77 líneas)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 88-127 (sync MODIFY excerpt)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 877-885 (canonical_response DEPRECATED para somnio-v4)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-24 (borrar canonical verbatim)
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-v4/knowledge-base/sync.ts` agregando al `upsertPayload` (líneas 51-68 actuales) las 5 columnas nuevas:

    ```ts
    hechos_del_producto: parsed.sections.hechosDelProducto,
    posicion_del_negocio: parsed.sections.posicionDelNegocio,
    debe_contener: parsed.sections.debeContener,
    cuando_escalar: parsed.sections.cuandoEscalar,
    tone_override: parsed.frontmatter.tone_override ?? null,
    ```

    Modificar el campo existente `canonical_response`:
    - Cambiarlo a `canonical_response: null` (siempre null para somnio-v4 — D-24 / RESEARCH líneas 877-881).
    - Mantener el campo `nunca_decir: parsed.sections.nuncaDecir` igual (sin cambios).

    Preservar TODOS los otros campos existentes (workspace_id, agent_id, topic, keywords, category, embedding, escalate_triggers, related_topics, source_md_path, body_hash, last_reviewed_at, reviewed_by, last_seen_at, updated_at).

    Preservar también:
    - Skip por body_hash (líneas 42-50) — la lógica existente sigue.
    - `createAdminClient` (línea 31) — sync corre como script local, no viola Regla 3 (admin scripts permitidos).

    No agregar tests para sync ahora — Plan 02 valida sync end-to-end al re-sincronizar los 18 KBs.
  </action>
  <verify>
    <automated>grep -c "hechos_del_producto: parsed.sections.hechosDelProducto" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -c "posicion_del_negocio: parsed.sections.posicionDelNegocio" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -c "debe_contener: parsed.sections.debeContener" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -c "cuando_escalar: parsed.sections.cuandoEscalar" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -c "tone_override: parsed.frontmatter.tone_override" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -c "canonical_response: null" src/lib/agents/somnio-v4/knowledge-base/sync.ts && npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/sync" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - Las 5 columnas nuevas aparecen en `upsertPayload` con la asignación correcta (grep counts arriba).
    - `grep -c "canonical_response: null" src/lib/agents/somnio-v4/knowledge-base/sync.ts` ≥ 1
    - `grep -c "canonical_response: parsed.sections" src/lib/agents/somnio-v4/knowledge-base/sync.ts` == 0 (asignación vieja eliminada)
    - `grep -c "nunca_decir: parsed.sections.nuncaDecir" src/lib/agents/somnio-v4/knowledge-base/sync.ts` ≥ 1 (preservado)
    - `npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/sync" | wc -l` == 0
  </acceptance_criteria>
  <done>Sync escribe las 5 columnas nuevas + deja canonical_response = null. Otros campos preservados.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.3: Refactor coherence-check.ts — validar secciones nuevas + prefijos [SIEMPRE]/[SI APLICA]</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts (estado actual completo, 17 líneas)
    - src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts (tests existentes — para entender estructura antes de actualizar)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 131-154 (coherence-check MODIFY excerpt)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 961-967 (validaciones nuevas)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-03 (prefijos [SIEMPRE]/[SI APLICA])
  </read_first>
  <action>
    Reescribir `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` extendiendo la signature con el parámetro `sections` (typed como `ParsedKbDoc['sections']`):

    ```ts
    import type { ParsedKbDoc } from './parser'

    /**
     * Validate que folder name = frontmatter.category Y que las 5 markdown sections obligatorias
     * (D-01 #2..#6) del formato RAG-generative estén pobladas correctamente.
     *
     * Standalone somnio-v4-rag-generative Plan 01.
     */
    export function coherenceCheck(
      filePath: string,
      frontmatterCategory: string,
      sections: ParsedKbDoc['sections'],
    ): void {
      // Validación existente — folder vs frontmatter category
      const parts = filePath.replace(/\\/g, '/').split('/')
      const folderCategory = parts[parts.length - 2]
      if (frontmatterCategory !== folderCategory) {
        throw new Error(
          `Coherence fail: ${filePath} folder=${folderCategory} frontmatter.category=${frontmatterCategory}`,
        )
      }

      // Validaciones nuevas — secciones requeridas (D-01 / RESEARCH líneas 961-967)
      if (!sections.hechosDelProducto || sections.hechosDelProducto.trim().length === 0) {
        throw new Error(`Coherence fail: ${filePath} — '## Hechos del producto' vacío o ausente`)
      }
      if (!sections.posicionDelNegocio || sections.posicionDelNegocio.trim().length === 0) {
        throw new Error(`Coherence fail: ${filePath} — '## Posición del negocio' vacío o ausente`)
      }
      if (!Array.isArray(sections.debeContener) || sections.debeContener.length === 0) {
        throw new Error(`Coherence fail: ${filePath} — '## Debe contener la respuesta' vacío o ausente`)
      }

      // D-03 — cada item de debeContener debe empezar con [SIEMPRE] o [SI APLICA]
      const prefijoRegex = /^\[(SIEMPRE|SI APLICA)\]\s+/
      for (let i = 0; i < sections.debeContener.length; i++) {
        const item = sections.debeContener[i]
        if (!prefijoRegex.test(item)) {
          throw new Error(
            `Coherence fail: ${filePath} — '## Debe contener' item ${i} no empieza con [SIEMPRE] ni [SI APLICA]: "${item.slice(0, 80)}"`,
          )
        }
      }

      // nuncaDecir + cuandoEscalar pueden ser vacíos en topics no-edge-case (solo validar que sean arrays).
      if (!Array.isArray(sections.nuncaDecir)) {
        throw new Error(`Coherence fail: ${filePath} — '## NUNCA decir' debe ser array (puede ser vacío)`)
      }
      if (!Array.isArray(sections.cuandoEscalar)) {
        throw new Error(`Coherence fail: ${filePath} — '## Cuándo escalar a humano' debe ser array (puede ser vacío)`)
      }
    }
    ```

    IMPORTANTE — actualizar también el call site en `sync.ts` (si existe) para pasar `parsed.sections` como tercer arg. Si `sync.ts` ya importa `coherenceCheck`, agregar el tercer argumento. Si `sync.ts` no importa coherenceCheck (puede ser invocado desde otro script), buscar quién lo llama con `grep -rn "coherenceCheck(" src/lib/agents/somnio-v4/` y actualizar todos los call sites.
  </action>
  <verify>
    <automated>grep -c "sections: ParsedKbDoc\\['sections'\\]" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts && grep -c "hechosDelProducto" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts && grep -c "\\[SIEMPRE\\]\\|\\[SI APLICA\\]" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts && grep -c "prefijoRegex\\|SIEMPRE\\|SI APLICA" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts && npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/(coherence-check|sync)" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "sections: ParsedKbDoc" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` ≥ 1
    - `grep -c "hechosDelProducto" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` ≥ 1
    - `grep -c "posicionDelNegocio" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` ≥ 1
    - `grep -c "debeContener" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` ≥ 1
    - `grep -E "SIEMPRE|SI APLICA" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts | wc -l` ≥ 2 (regex + error message)
    - Call site en sync.ts (si existe) actualizado a tercer arg sections: verificable con `grep -A 2 "coherenceCheck(" src/lib/agents/somnio-v4/knowledge-base/sync.ts | grep -c "parsed.sections"` ≥ 1, O bien si coherenceCheck no se invoca desde sync.ts (puede vivir solo en scripts CLI de sync), verificable con `grep -rn "coherenceCheck(" src/lib/agents/somnio-v4/` mostrando todos los call sites con 3 args.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/(coherence-check|sync)" | wc -l` == 0
  </acceptance_criteria>
  <done>Coherence-check valida las 5 markdown sections nuevas (D-01 #2..#6) + prefijos. Call sites actualizados.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.4: Crear migración SQL `<ts>_somnio_v4_kb_schema_rag_generative.sql` + PAUSAR (Regla 5)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 156-232 (SQL migration verbatim + landmines)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 862-894 (DB Migration Guidance)
    - .planning/standalone/crm-mutation-tools/01-PLAN.md:38-69 (template Regla 5 PAUSE — timestamp Bogota + ADD COLUMN IF NOT EXISTS + COMMENT + ROLLBACK)
    - supabase/migrations/ (listar últimos 3 archivos para asegurar timestamp > max actual: `ls supabase/migrations/ | tail -3`)
  </read_first>
  <action>
    **Paso 1 — Generar timestamp Bogota:**
    ```bash
    TS=$(TZ=America/Bogota date +%Y%m%d%H%M%S)
    ```
    Verificar que `TS` > último timestamp existente: `ls supabase/migrations/ | tail -1`. Si menor, agregar segundos manualmente hasta que sea estrictamente mayor.

    **Paso 2 — Crear archivo `supabase/migrations/${TS}_somnio_v4_kb_schema_rag_generative.sql`** con contenido EXACTO de PATTERNS.md líneas 162-226 (verbatim, incluyendo comentarios de header con referencias a Plan 01 / Regla 5 / Regla 6):

    ```sql
    -- supabase/migrations/<TS>_somnio_v4_kb_schema_rag_generative.sql
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

    -- ROLLBACK manual (NO ejecutar salvo emergencia):
    --   1. ALTER TABLE public.agent_knowledge_base DROP COLUMN IF EXISTS hechos_del_producto, DROP COLUMN IF EXISTS posicion_del_negocio, DROP COLUMN IF EXISTS debe_contener, DROP COLUMN IF EXISTS cuando_escalar, DROP COLUMN IF EXISTS tone_override;
    --   2. Re-aplicar el RPC desde supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql (RETURNS shape original sin las 5 columnas nuevas).
    ```

    **Landmines a respetar:**
    - `ADD COLUMN IF NOT EXISTS` para idempotencia (correr 2 veces no rompe).
    - `DROP FUNCTION IF EXISTS ...` ANTES de `CREATE OR REPLACE` porque el RETURNS shape cambia (Postgres requiere drop explícito si cambia signature de RETURN TABLE).
    - NO RLS policies — la tabla ya tiene GRANTs desde la migración original; ALTER no requiere nuevas policies.
    - NO ejecutar el SQL desde el código — el usuario lo aplica manualmente en Task 1.5.
  </action>
  <verify>
    <automated>ls supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql 2>&1 | head -1 && grep -c "ADD COLUMN IF NOT EXISTS hechos_del_producto" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql && grep -c "DROP FUNCTION IF EXISTS public.match_knowledge_base" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql && grep -c "CREATE OR REPLACE FUNCTION public.match_knowledge_base" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql && grep -c "hechos_del_producto TEXT," supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql</automated>
  </verify>
  <acceptance_criteria>
    - File matches glob `supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql`
    - `grep -c "ADD COLUMN IF NOT EXISTS hechos_del_producto" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "ADD COLUMN IF NOT EXISTS posicion_del_negocio" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "ADD COLUMN IF NOT EXISTS debe_contener" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "ADD COLUMN IF NOT EXISTS cuando_escalar" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "ADD COLUMN IF NOT EXISTS tone_override" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "DROP FUNCTION IF EXISTS public.match_knowledge_base" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "CREATE OR REPLACE FUNCTION public.match_knowledge_base" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - `grep -c "GRANT EXECUTE ON FUNCTION public.match_knowledge_base" supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql` == 1
    - Timestamp del archivo > último timestamp existente en supabase/migrations/.
  </acceptance_criteria>
  <done>Migration file creado, listo para apply manual del usuario en Task 1.5.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1.5: PAUSE — User applies migration to production Supabase (Regla 5)</name>
  <what-built>
    Migration SQL file staged but NOT pushed:
    - `supabase/migrations/<ts>_somnio_v4_kb_schema_rag_generative.sql` (Task 1.4)

    Plans 02 y 03 dependen de que las 5 columnas nuevas (`hechos_del_producto`, `posicion_del_negocio`, `debe_contener`, `cuando_escalar`, `tone_override`) existan en producción + el RPC `match_knowledge_base` retorne shape nuevo. Per Regla 5, esta migration DEBE aplicarse a producción ANTES de pushear el código que la usa (Plan 02 sync va a poblar las columnas; Plan 03 sub-loop va a leerlas via RPC).
  </what-built>
  <how-to-verify>
    Aplicar el SQL en producción Supabase (via Supabase Studio SQL Editor) y verificar con estos 4 queries:

    ```sql
    -- 1. Columnas nuevas existen:
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agent_knowledge_base'
      AND column_name IN ('hechos_del_producto','posicion_del_negocio','debe_contener','cuando_escalar','tone_override')
    ORDER BY column_name;
    -- Esperado: 5 rows.

    -- 2. RPC actualizada — RETURNS shape incluye las 5 nuevas:
    SELECT pg_get_function_result(oid)
    FROM pg_proc
    WHERE proname='match_knowledge_base';
    -- Esperado: el TEXT incluye hechos_del_producto, posicion_del_negocio, debe_contener, cuando_escalar, tone_override.

    -- 3. RPC test con embedding zero (no debe fallar):
    SELECT * FROM public.match_knowledge_base(
      'a3843b3f-c337-4836-92b5-89c58bb98490'::uuid,
      'somnio-sales-v4',
      array_fill(0::real, ARRAY[1536])::vector(1536),
      NULL,
      1
    ) LIMIT 1;
    -- Esperado: 1 row (o 0 si KB vacío, pero sin error de columnas).

    -- 4. v4 sigue dormant:
    SELECT count(*) FROM routing_rules
    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
      AND active=true
      AND event::text LIKE '%somnio-sales-v4%';
    -- Esperado: 0.
    ```

    Luego escribir "approved" para que el executor continúe con Task 1.6 (commit + push).
  </how-to-verify>
  <action>STOP. Presentar el path del archivo SQL al usuario. Esperar señal explícita "approved".</action>
  <verify>
    <automated>echo "blocked-on-user-approval"</automated>
  </verify>
  <acceptance_criteria>
    Usuario tipea "approved" o equivalente confirmando que la migración fue aplicada en producción Supabase. NO se puede pushear a main antes de esta señal.
  </acceptance_criteria>
  <done>Usuario confirma migration aplicada en producción.</done>
  <resume-signal>Type "approved" after applying the SQL file to production Supabase.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 1.6: Actualizar tests parser.test.ts + coherence-check.test.ts</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts (estado actual completo)
    - src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts (estado actual completo)
    - src/lib/agents/somnio-v4/knowledge-base/parser.ts (post-Task 1.1 — referencia de shape nuevo)
    - src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts (post-Task 1.3 — referencia de signature nueva)
  </read_first>
  <action>
    Actualizar los 2 archivos de tests para reflejar el shape/signature nuevos:

    **`__tests__/parser.test.ts`:**
    - Sample markdown de fixture debe usar los 5 headers nuevos (`## Hechos del producto`, `## Posición del negocio`, `## Debe contener la respuesta`, `## NUNCA decir`, `## Cuándo escalar a humano`).
    - Assertions deben verificar `result.sections.hechosDelProducto`, `result.sections.posicionDelNegocio`, `result.sections.debeContener` (array), `result.sections.nuncaDecir` (array), `result.sections.cuandoEscalar` (array).
    - Agregar 1 test que verifica que headers deprecated (`## Respuesta canónica`, `## Si el cliente insiste`, `## Sources`) son ignorados silenciosamente sin throwear.
    - Agregar 1 test que verifica `tone_override` opcional en frontmatter (parse OK cuando ausente, parse OK cuando presente con string).
    - Agregar 1 test que verifica defensive acceptance de `Posicion` sin tilde + `Cuando escalar` sin tilde.

    **`__tests__/coherence-check.test.ts`:**
    - Actualizar signature de calls: ahora `coherenceCheck(filePath, category, sections)` (3 args).
    - Mantener test existente de folder vs category mismatch (sin tocar la assertion principal, solo pasar `sections` dummy válido como tercer arg).
    - Agregar tests nuevos:
      - throw cuando `hechosDelProducto` es string vacío.
      - throw cuando `posicionDelNegocio` es string vacío.
      - throw cuando `debeContener` es array vacío.
      - throw cuando un item de `debeContener` NO empieza con `[SIEMPRE]` ni `[SI APLICA]`.
      - OK cuando `nuncaDecir` y `cuandoEscalar` son arrays vacíos (topics no-edge-case válidos).
      - OK cuando todo está bien poblado.

    Correr los tests al final: `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts`. Todos verdes.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` exit code 0.
    - `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` exit code 0.
    - `grep -c "hechosDelProducto" src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` ≥ 1.
    - `grep -c "SIEMPRE\\|SI APLICA" src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` ≥ 1.
    - `grep -c "tone_override" src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` ≥ 1.
  </acceptance_criteria>
  <done>Tests actualizados y verdes. Schema nuevo cubierto por unit tests.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.7: Commit + push (Regla 1 — migración ya aplicada en Task 1.5)</name>
  <read_first>
    - CLAUDE.md (Regla 1 push, Regla 5 — migración ya aplicada per Task 1.5)
  </read_first>
  <action>
    Stage + commit + push:

    ```
    git add supabase/migrations/*_somnio_v4_kb_schema_rag_generative.sql \
            src/lib/agents/somnio-v4/knowledge-base/parser.ts \
            src/lib/agents/somnio-v4/knowledge-base/sync.ts \
            src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts \
            src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts \
            src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts

    git commit -m "$(cat <<'EOF'
    feat(somnio-v4-rag-generative): plan 01 — KB schema RAG-generative (parser/sync/coherence + migration)

    - Migration agent_knowledge_base ADD COLUMN x5 (hechos_del_producto, posicion_del_negocio,
      debe_contener, cuando_escalar, tone_override) + RPC match_knowledge_base RETURNS update.
    - Parser reconoce 5 headers nuevos (D-01) + tone_override frontmatter (D-05); ignora deprecated silenciosamente.
    - Sync upsertea las 5 columnas nuevas + canonical_response = null para somnio-v4 (D-24).
    - Coherence-check valida secciones requeridas + prefijos [SIEMPRE]/[SI APLICA] (D-03).
    - Tests parser + coherence-check actualizados.

    Standalone: somnio-v4-rag-generative Plan 01 (Wave 1).
    Migration aplicada en producción 2026-XX-XX por usuario (Regla 5).
    v4 sigue dormant (Regla 6).

    Refs D-01, D-02, D-03, D-05, D-24.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "somnio-v4-rag-generative" && git status --short | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --oneline` includes "somnio-v4-rag-generative" + "plan 01".
    - `git status` clean.
    - `git log origin/main..HEAD` empty (push succeeded).
  </acceptance_criteria>
  <done>Plan 01 cierra. Plans 02 + 03 (Wave 2 atomic) unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer → Production Supabase | SQL migration aplicada manualmente vía Supabase SQL Editor (Regla 5 PAUSE) |
| KB sync script → DB | Admin scripts vía createAdminClient (no critical path runtime — corre solo en dev/CI) |
| RPC match_knowledge_base → Sub-loop runtime | Plan 03 consume RPC con shape nuevo |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-01-01 | Tampering | Migration applied to wrong DB / wrong order | LOW | mitigate | Regla 5 PAUSE — user manually applies in production Supabase Editor; verifica con 4 SELECT statements antes de signal "approved". |
| T-01-02 | Denial of Service | RPC `match_knowledge_base` rota tras DROP/CREATE si shape mal definido | MEDIUM | mitigate | Test #3 en Task 1.5 ejecuta el RPC con embedding zero — si falla, usuario sabe rollback ANTES de avanzar. |
| T-01-03 | Information Disclosure | Cross-workspace KB hits | INFO | accept | RPC filtra por `p_workspace_id` (sin cambios respecto a versión actual); v4 sigue dormant entonces no hay tráfico productivo. |
| T-01-04 | Repudiation | Cron sync silently falla a popular columnas nuevas | LOW | mitigate | Plan 02 verifica via SELECT count + Smoke A (Plan 05) detecta empíricamente si retrieval rompe. |
| T-01-05 | Elevation of Privilege | RPC `SECURITY DEFINER` mal grantsada | LOW | mitigate | `GRANT EXECUTE ... TO service_role` explícito en migration; verificable post-apply. |
</threat_model>

<verification>
- Migration SQL aplicada en producción (Task 1.5 user signal).
- Las 5 columnas nuevas existen en `agent_knowledge_base`.
- RPC retorna shape nuevo (test query Task 1.5 #3 OK).
- Parser + coherence-check tests verdes (`npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/`).
- TypeScript clean: `npx tsc --noEmit -p . 2>&1 | grep -E "src/lib/agents/somnio-v4/knowledge-base/" | wc -l` == 0.
- v4 sigue dormant: `SELECT count(*) FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true AND event::text LIKE '%somnio-sales-v4%'` == 0.
</verification>

<success_criteria>
Plan 01 cerrado cuando:
- [ ] Migration committed + aplicada en producción (Task 1.5 approved).
- [ ] Parser + sync + coherence-check refactorizados.
- [ ] Tests verdes.
- [ ] Push exitoso a `origin/main`.
- [ ] Plans 02 + 03 (Wave 2 atomic) unblocked.
- [ ] STATUS.md updated: marcar Plan 01 done + HEAD del commit.
</success_criteria>

<rollback>
Si el migration apply falla a mitad de camino (ej: el DROP FUNCTION ejecuta pero el CREATE no), aplicar a mano en Supabase Studio:

```sql
-- Re-aplicar el bloque DROP/CREATE del archivo migration manualmente.
-- Si las columnas se aplicaron pero el RPC quedó roto:
DROP FUNCTION IF EXISTS public.match_knowledge_base(UUID, TEXT, vector(1536), TEXT, INT);
-- Pegar verbatim el CREATE OR REPLACE FUNCTION del archivo migration.
```

Si el migration apply causa drama inesperado en producción:
1. Re-aplicar versión pre-Plan-01 del RPC desde `supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql`.
2. Las 5 columnas nuevas se pueden DROP COLUMN IF EXISTS (no rompen nada — solo somnio-v4 las usaría y v4 está dormant).
3. NO revertir el commit en git (otros agentes pueden seguir leyendo `canonical_response` — solo afecta a somnio-v4).

Si el push se hizo pero la migración NO se aplicó: ANTI-PATTERN. El executor debió pausar en Task 1.5. Recovery:
1. Aplicar la migración AHORA en Supabase.
2. Verificar con los 4 queries de Task 1.5.
3. Verificar que Plan 02 / 03 todavía no se ejecutaron (si sí, código en main referencia columnas inexistentes — runtime de los 18 KBs falla en sync, pero v4 dormant absorbe el daño).
</rollback>

<output>
After completion, create `.planning/standalone/somnio-v4-rag-generative/01-SUMMARY.md` documentando:
- HEAD del commit final.
- Confirmación apply migration (timestamp + usuario).
- Resultados de los 4 verify queries de Task 1.5.
- Tests passing (snapshot).
- Próximo paso: Plans 02 + 03 atomic en Wave 2.
</output>
