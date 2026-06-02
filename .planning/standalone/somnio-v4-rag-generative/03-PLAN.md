---
plan: 03
wave: 2
phase: standalone-somnio-v4-rag-generative
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tooling-call.ts
  - src/lib/agents/somnio-v4/sub-loop/generation-call.ts
  - src/lib/agents/somnio-v4/sub-loop/safe-output.ts
  - src/lib/agents/somnio-v4/sub-loop/tone-base.ts
  - src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts
  - src/lib/agents/somnio-v4/sub-loop/debug-payload.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "El sub-loop split en 2 calls separadas: tooling (GPT-4o mini con kb_search tool) → generation (Gemini Flash con Output.object sin tools)."
    - "Path crm_mutation y cas_reject preservan flujo viejo verbatim (D-12 — single generateText con tools + Output.object en MISMA call)."
    - "Schema LoopOutcomeSchema actualizado: status enum 'generated' / 'template' / 'no_match' (NO 'canonical'); responseText + responseConfidence + confidenceRationale agregados; canonicalText eliminado."
    - "Wrapper safeAccessOutput defensivo presente en TODOS los accesos a result.output del sub-loop nuevo (vercel/ai#11348)."
    - "Generation call usa gemini-2.5-flash con temperature 0.3 + safetySettings BLOCK_NONE para los 4 categorías (Pitfall 6)."
    - "Generation schema incluye field binary: enum ['RESPONDE_BIEN', 'FALTA_INFO', 'FUERA_SCOPE'] para M3 backstop (RESEARCH A1)."
    - "Orchestrator dispara handoff silente si: should_handoff=true | responseConfidence<0.70 | binary in ('FALTA_INFO','FUERA_SCOPE') | nuncaDecir violation."
    - "Tone-base.ts exporta const TONE_BASE = '...' (D-05 tono global Somnio)."
    - "NUNCA-decir check sigue Gemini Flash-Lite sin cambios (nunca-decir-check.ts NO en files_modified) — D-09."
    - "comprehension-schema.ts NO modificado — D-25."
    - "Push final con commits Plan 02 + Plan 03 juntos a origin/main (atomic deploy unit D-24)."
    - "v4 sigue dormant en producción (sin routing rule)."
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/tooling-call.ts"
      provides: "runToolingCall — Call 1 con GPT-4o mini + kb_search tool"
      exports: ["runToolingCall", "ToolingOutput"]
    - path: "src/lib/agents/somnio-v4/sub-loop/generation-call.ts"
      provides: "runGenerationCall — Call 2 con Gemini Flash + Output.object"
      exports: ["runGenerationCall", "GenerationOutput"]
    - path: "src/lib/agents/somnio-v4/sub-loop/safe-output.ts"
      provides: "safeAccessOutput wrapper defensivo (vercel/ai#11348)"
      exports: ["safeAccessOutput"]
    - path: "src/lib/agents/somnio-v4/sub-loop/tone-base.ts"
      provides: "TONE_BASE const global Somnio"
      exports: ["TONE_BASE"]
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "Orchestrator refactor — switch por reason + flow split RAG-generative"
      contains: "runToolingCall"
    - path: "src/lib/agents/somnio-v4/sub-loop/output-schema.ts"
      provides: "LoopOutcomeSchema refactor — status enum nuevo + responseText fields"
      contains: "responseConfidence"
  key_links:
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/tooling-call.ts"
      via: "import + invocation en flujo low_confidence/razonamiento_libre"
      pattern: "runToolingCall"
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/generation-call.ts"
      via: "import + invocation post-tooling success"
      pattern: "runGenerationCall"
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts"
      via: "import + invocation post-generation (sin cambios al archivo, solo al caller)"
      pattern: "checkNuncaDecir"
    - from: "src/lib/agents/somnio-v4/sub-loop/tooling-call.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts"
      via: "tools: { kb_search: kbSearchTool(ctx) }"
      pattern: "kbSearchTool"
---

<objective>
Wave 2 (atomic con Plan 02 — D-24) — Refactor del sub-loop a 2 calls separadas: tooling (GPT-4o mini con kb_search) + generation (Gemini Flash con Output.object), borrando el approach canonical-verbatim. Preserva flujo viejo para `crm_mutation` y `cas_reject` (D-12). Implementa wrappers defensivos (A3 — safeAccessOutput) y calibration backstops (M3 — binary enum). Final task hace push de Plan 02 + Plan 03 commits juntos a origin/main.

Purpose: convertir el sub-loop de respuestas enlatadas verbatim a respuestas redactadas por Gemini Flash con material del KB como insumo. Esta es la pieza arquitectónica central del standalone.

Output:
- 4 archivos NUEVOS: tooling-call.ts, generation-call.ts, safe-output.ts, tone-base.ts.
- 3 archivos REFACTORIZADOS: index.ts, output-schema.ts, prompt.ts.
- 2 archivos LIGHT-EXTENDED: kb-search-tool.ts (campos nuevos del KbHit), debug-payload.ts (2 calls).
- 3 archivos de TESTS actualizados.
- Push final atómico con Plan 02 commit + Plan 03 commit juntos.

**Files que NO se tocan (verificable):**
- `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` (D-09 lock).
- `src/lib/agents/somnio-v4/comprehension-schema.ts` (D-25 lock).
- `src/lib/agents/somnio-v4/sub-loop/tools.ts` (D-12 lock — el reason crm_mutation/cas_reject sigue dándole el tool dict actual).
- `routing_rules` table (Regla 6 — v4 sigue dormant).

**A1 (RESEARCH) — split tooling/generación:** este plan implementa A1.
**A3 (RESEARCH) — safeAccessOutput wrapper:** este plan crea el wrapper en safe-output.ts.
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
@.planning/standalone/somnio-v4-rag-generative/01-SUMMARY.md
@.planning/standalone/somnio-v4-rag-generative/02-SUMMARY.md
@src/lib/agents/somnio-v4/sub-loop/index.ts
@src/lib/agents/somnio-v4/sub-loop/output-schema.ts
@src/lib/agents/somnio-v4/sub-loop/prompt.ts
@src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts
@src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
@src/lib/agents/somnio-v4/sub-loop/debug-payload.ts
@src/lib/agents/somnio-v4/sub-loop/tools.ts
@src/lib/agents/somnio-v4/comprehension.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 3.1: Crear `safe-output.ts` (wrapper defensivo — A3)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 567-600 (safe-output verbatim de RESEARCH)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 388-422 (Pattern 3: Defensive output access)
    - src/lib/agents/somnio-v4/comprehension.ts líneas 100-140 (defensive try/catch análogo — patrón estructural)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/safe-output.ts` con el wrapper defensivo verbatim de PATTERNS.md líneas 574-599:

    ```ts
    /**
     * Defensive wrapper alrededor de `result.output` para escapar el bug vercel/ai#11348
     * (`NoObjectGeneratedError` thrown aunque haya JSON válido en `result.text`).
     *
     * Standalone somnio-v4-rag-generative Plan 03 (A3).
     * Source: RESEARCH § Pattern 3: Defensive output access (líneas 388-422).
     * Bug ticket: github.com/vercel/ai/issues/11348 (abierto 2025-12, sin fix a 2026-05).
     *
     * Uso:
     *   const result = await generateText({ output: Output.object({ schema }), ... })
     *   const parsed = safeAccessOutput(result, schema)  // siempre devuelve T válido o throwea con diagnostic
     */
    import { NoObjectGeneratedError } from 'ai'
    import type { generateText } from 'ai'
    import { z } from 'zod'

    export function safeAccessOutput<T>(
      result: Awaited<ReturnType<typeof generateText>>,
      schema: z.ZodSchema<T>,
    ): T {
      try {
        return (result as any).output as T
      } catch (err) {
        if (NoObjectGeneratedError.isInstance(err) && (result as any).text) {
          try {
            const parsed = JSON.parse((result as any).text)
            return schema.parse(parsed)
          } catch (parseErr) {
            throw new Error(
              `[safeAccessOutput] Got NoObjectGeneratedError + manual parse also failed: ` +
              `${(parseErr as Error).message} | text="${String((result as any).text).slice(0, 200)}"`,
            )
          }
        }
        throw err
      }
    }
    ```

    NOTAS:
    - El `as any` cast en `(result as any).output` es necesario porque la API de `result.output` varía según el setup del generateText (con vs sin Output.object). Si la importación type-safe no compila, usar el cast.
    - `NoObjectGeneratedError.isInstance` es el método oficial de AI SDK v6 para identificar el error.
    - El fallback hace JSON.parse manual del text + valida con el schema Zod recibido.
    - Si el fallback también falla, throw con error message que incluye los primeros 200 chars del text para debug.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/safe-output.ts && grep -c "export function safeAccessOutput" src/lib/agents/somnio-v4/sub-loop/safe-output.ts && grep -c "NoObjectGeneratedError.isInstance" src/lib/agents/somnio-v4/sub-loop/safe-output.ts && grep -c "schema.parse" src/lib/agents/somnio-v4/sub-loop/safe-output.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/safe-output" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/sub-loop/safe-output.ts` exit 0.
    - `grep -c "export function safeAccessOutput" src/lib/agents/somnio-v4/sub-loop/safe-output.ts` == 1.
    - `grep -c "NoObjectGeneratedError.isInstance" src/lib/agents/somnio-v4/sub-loop/safe-output.ts` == 1.
    - `grep -c "schema.parse" src/lib/agents/somnio-v4/sub-loop/safe-output.ts` == 1.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/safe-output" | wc -l` == 0.
  </acceptance_criteria>
  <done>safe-output.ts creado y type-safe.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.2: Crear `tone-base.ts` (TONE_BASE const global D-05)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 674-692 (TONE_BASE verbatim)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-05 (tono global)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 706-727 (anti-invención prompt section)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/tone-base.ts`:

    ```ts
    /**
     * D-05: tono global Somnio inyectado al system prompt de generation-call.
     * Override per-topic vía frontmatter.tone_override (parsed por parser.ts en Plan 01).
     *
     * Standalone somnio-v4-rag-generative Plan 03.
     */
    export const TONE_BASE = `
    Tono Somnio: cálido pero firme. Sin moralismo. Breve (2-4 oraciones máximo
    salvo que el caso justifique más). Usa "tú" (NO "usted"). NO uses emojis salvo en
    cierre de despedida si encaja. NO seas dramático ni alarmista; comunicá hechos
    con calma.
    `.trim()
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/tone-base.ts && grep -c "export const TONE_BASE" src/lib/agents/somnio-v4/sub-loop/tone-base.ts && grep -c "cálido pero firme" src/lib/agents/somnio-v4/sub-loop/tone-base.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/sub-loop/tone-base.ts` exit 0.
    - `grep -c "export const TONE_BASE" src/lib/agents/somnio-v4/sub-loop/tone-base.ts` == 1.
    - `grep -c "cálido pero firme" src/lib/agents/somnio-v4/sub-loop/tone-base.ts` ≥ 1.
  </acceptance_criteria>
  <done>tone-base.ts creado.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.3: Extender `kb-search-tool.ts` para retornar KbHit enriquecido (5 columnas nuevas)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts (estado actual completo, 119 líneas)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 714-758 (kb-search-tool potential update)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 560-572 (Step 1 — embedding + retrieval sin cambios estructurales)
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` aplicando 2 cambios:

    **Cambio A — Interface `KbHit`:** extender el shape para incluir las 5 columnas nuevas del RPC (post-Plan 01):

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

    **Cambio B — Map de RPC rows:** en el bloque que mapea las rows del RPC a KbHit (líneas 96-103 actuales), agregar los 5 campos nuevos:

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

    **NO TOCAR:**
    - `inputSchema` (línea 62) — sigue siendo `{ query: z.string() }` (Iter 7i locked — sin category param).
    - `workspaceId` viene de `ctx`, NO del input (Pitfall 2 mutation-tools).
    - Lazy embedding + supabase admin (líneas 67-82).
    - El structured log Iter 7e (líneas 108-114) — opcional: agregar campos nuevos al log.
  </action>
  <verify>
    <automated>grep -c "hechosDelProducto: string | null" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -c "posicionDelNegocio: string | null" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -c "debeContener: string\[\]" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -c "cuandoEscalar: string\[\]" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -c "row.hechos_del_producto" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/kb-search-tool" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - 5 campos nuevos en interface KbHit (grep counts arriba).
    - 5 mappings en el map de RPC rows (grep `row.hechos_del_producto`, `row.posicion_del_negocio`, `row.debe_contener`, `row.cuando_escalar`, `row.tone_override`).
    - `inputSchema: z.object({ query: z.string() })` sin cambios (no agregar category).
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/kb-search-tool" | wc -l` == 0.
  </acceptance_criteria>
  <done>KbHit enriquecido con 5 columnas nuevas.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.4: Crear `tooling-call.ts` (Call 1 — GPT-4o mini con kb_search + Output.object)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 439-504 (tooling-call verbatim + landmines)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 1037-1095 (tooling-call code example)
    - src/lib/agents/somnio-v4/sub-loop/index.ts líneas 30-50 (lazy getOpenAI singleton existente — copiar a tooling-call.ts)
    - src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts (KbHit interface post-Task 3.3 para confirmar shape disponible)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/tooling-call.ts` con el código verbatim de PATTERNS.md líneas 446-499:

    ```ts
    /**
     * CALL 1 del sub-loop RAG-generative: GPT-4o mini con kb_search tool + Output.object.
     * Selecciona UN topic ganador del KB (D-11) y emite su material parseado.
     *
     * Standalone somnio-v4-rag-generative Plan 03.
     * Source: RESEARCH § Code Examples § Tooling call (líneas 1037-1095) verbatim.
     */
    import { generateText, Output, stepCountIs } from 'ai'
    import { z } from 'zod'
    import { createOpenAI } from '@ai-sdk/openai'
    import { kbSearchTool } from './kb-search-tool'
    import { runWithPurpose } from '@/lib/observability'  // ajustar import path si difiere
    import { safeAccessOutput } from './safe-output'

    export const ToolingOutputSchema = z.object({
      topic_seleccionado: z.string().nullable()
        .describe('Topic ganador del KB doc, null si ningún hit es relevante.'),
      material_del_topic: z.object({
        hechos: z.string().nullable(),
        posicion: z.string().nullable(),
        debe_contener_aplicables: z.array(z.string()).nullable(),
        nunca_decir: z.array(z.string()).nullable(),
        cuando_escalar: z.array(z.string()).nullable(),
      }).nullable()
        .describe('Material del topic ganador para pasar a la generación (D-11). Null si should_handoff.'),
      should_handoff: z.boolean()
        .describe('true si ningún hit es relevante a la pregunta del cliente.'),
      handoff_reason: z.string().nullable()
        .describe('Razón corta del handoff — observability. Ej: "no_relevant_hit".'),
    })

    export type ToolingOutput = z.infer<typeof ToolingOutputSchema>

    // Lazy singleton — MISMO patrón que sub-loop/index.ts:30-50 (este archivo lo absorbe).
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
      ctx: {
        workspaceId: string
        userMessage: string
        recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
      }
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
        }),
      )
      return safeAccessOutput(result, ToolingOutputSchema)
    }
    ```

    **Landmines verificables:**
    - `toolChoice: 'auto'` (NUNCA `'required'`).
    - `stopWhen: stepCountIs(4)` (NO 6 como el actual — la 2da call separada absorbe lo que necesitaba más steps).
    - safeAccessOutput wrap SIEMPRE.

    **Adjustments si import path difiere:**
    - Si `runWithPurpose` no está en `@/lib/observability`, buscar el path real (`grep -rn "export.*runWithPurpose" src/lib/`) y ajustar.
    - Si `kbSearchTool` requiere otro shape de ctx (revisar `kb-search-tool.ts` post-Task 3.3), ajustar el argumento.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && grep -c "export async function runToolingCall" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && grep -c "export const ToolingOutputSchema" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && grep -c "toolChoice: 'auto'" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && grep -c "stopWhen: stepCountIs(4)" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && grep -c "safeAccessOutput(result, ToolingOutputSchema)" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && grep -cE "z\.union|z\.record" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/tooling-call" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - File exists + exports `runToolingCall` + `ToolingOutputSchema` + `ToolingOutput` type.
    - `toolChoice: 'auto'` (NOT 'required').
    - `stopWhen: stepCountIs(4)`.
    - safeAccessOutput wrap presente.
    - `grep -cE "z\.union|z\.record" src/lib/agents/somnio-v4/sub-loop/tooling-call.ts` == 0 (Pitfall 7 — schemas prohibidos para Gemini, aunque este file es para OpenAI igual mantenemos la convención).
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/tooling-call" | wc -l` == 0.
  </acceptance_criteria>
  <done>tooling-call.ts creado, type-safe, lint-clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.5: Crear `generation-call.ts` (Call 2 — Gemini Flash + Output.object + safetySettings BLOCK_NONE)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 508-563 (generation-call verbatim + COPIAR safetySettings del análogo)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 1097-1145 (generation-call code example) + Pitfall 6 (líneas 1001-1005 — BLOCK_NONE safety mandatory para CORE business médico-adyacente)
    - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts líneas 50-70 (safetySettings BLOCK_NONE patrón verbatim a copiar)
    - src/lib/agents/somnio-v4/comprehension.ts líneas 100-140 (Gemini Output.object + try/catch diagnostic — patrón estructural reference)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` con el código de PATTERNS.md líneas 517-560 verbatim:

    ```ts
    /**
     * CALL 2 del sub-loop RAG-generative: Gemini 2.5 Flash con Output.object SIN tools.
     * Redacta respuesta al cliente usando SOLO el material del topic ganador + auto-reporta
     * responseConfidence (D-15) y binary backstop (M3 RESEARCH A1).
     *
     * Standalone somnio-v4-rag-generative Plan 03.
     * Source: RESEARCH § Code Examples § Generation call (líneas 1097-1145) verbatim.
     * SafetySettings BLOCK_NONE: análogo verbatim de nunca-decir-check.ts (Pitfall 6).
     */
    import { generateText, Output } from 'ai'
    import { google } from '@ai-sdk/google'
    import { z } from 'zod'
    import { runWithPurpose } from '@/lib/observability'  // ajustar path si difiere (mismo que tooling-call.ts)
    import { safeAccessOutput } from './safe-output'

    export const GenerationOutputSchema = z.object({
      responseText: z.string()
        .describe('Texto final al cliente, en español, tono cálido pero firme (D-05).'),
      responseConfidence: z.number()
        .describe('0..1 auto-reportado por el modelo (D-15). Threshold 0.70 → handoff (D-19).'),
      confidenceRationale: z.string()
        .describe('1 frase razón del confidence — observability.'),
      binary: z.enum(['RESPONDE_BIEN', 'FALTA_INFO', 'FUERA_SCOPE'])
        .describe('M3 backstop (RESEARCH A1): RESPONDE_BIEN si cubrís la pregunta con el material; FALTA_INFO si necesitarías más data; FUERA_SCOPE si la pregunta no está en el material en absoluto.'),
    })

    export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

    export async function runGenerationCall(args: {
      systemPrompt: string  // includes TONE_BASE + few-shots + reglas + material del topic
      userMessage: string
      recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
    }): Promise<GenerationOutput> {
      const result = await runWithPurpose('subloop_generation', () =>
        generateText({
          model: google('gemini-2.5-flash'),  // D-08 (NO Lite). A/B Flash-Lite es Plan 05.
          system: args.systemPrompt,
          messages: [
            ...args.recentMessages.slice(-4),  // history corto — el prompt ya tiene material
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
        }),
      )
      return safeAccessOutput(result, GenerationOutputSchema)
    }
    ```

    **CRITICAL — safetySettings BLOCK_NONE x4:** copiar VERBATIM los 4 entries de `nunca-decir-check.ts:55-64`. Sin esto, Gemini bloquea silentemente menciones de "alcohol", "embarazo", "anticoagulantes" → `NoOutputGeneratedError` con `finishReason='SAFETY'`. Iter 5b learning del standalone hermano.

    **NO usar:**
    - `z.union` ni `z.record` (Pitfall 7 — rechazados por Gemini provider).
    - `z.optional()` con OpenAI strict mode — pero aquí es Gemini, igual NO usar; usar `.nullable()` (sigue convención post-D-29).
    - `tools` (Gemini 2.5 NO soporta tools + Output.object — H-2 verificado RESEARCH líneas 453-481).
    - `toolChoice` (sin tools).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -c "export async function runGenerationCall" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -c "export const GenerationOutputSchema" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -c "binary: z.enum" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -c "google('gemini-2.5-flash')" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -c "temperature: 0.3" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -c "BLOCK_NONE" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && grep -cE "z\.union|z\.record|tools:|toolChoice" src/lib/agents/somnio-v4/sub-loop/generation-call.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/generation-call" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - File exists + exports runGenerationCall + GenerationOutputSchema + GenerationOutput.
    - `grep -c "binary: z.enum" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1 (M3 backstop presente).
    - `grep -c "RESPONDE_BIEN" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` ≥ 1 (enum values presente).
    - `grep -c "FALTA_INFO" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` ≥ 1.
    - `grep -c "FUERA_SCOPE" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` ≥ 1.
    - `grep -c "google('gemini-2.5-flash')" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1 (Flash NORMAL, NO Lite).
    - `grep -c "temperature: 0.3" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1.
    - `grep -c "BLOCK_NONE" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 4 (los 4 safetySettings).
    - `grep -cE "z\.union|z\.record" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 0 (Pitfall 7).
    - `grep -cE "^\s*tools:|toolChoice" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 0 (Gemini sin tools — H-2).
    - safeAccessOutput wrap presente.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/generation-call" | wc -l` == 0.
  </acceptance_criteria>
  <done>generation-call.ts creado con M3 backstop + BLOCK_NONE safety + Flash + temp 0.3.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.6: Refactor `output-schema.ts` (status enum + responseText/responseConfidence + invariants)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (estado actual completo)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 604-651 (output-schema refactor verbatim)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 632-658 (Pattern Schema cambios)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-24 (borrar canonical) + D-19 (threshold) + D-15 (auto-report) + D-12 (template path sin cambios)
  </read_first>
  <action>
    Refactorizar `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` aplicando 3 cambios:

    **Cambio A — Status enum:** Reemplazar `z.enum(['template', 'canonical', 'no_match'])` por `z.enum(['generated', 'template', 'no_match'])`. `'canonical'` desaparece, `'generated'` lo reemplaza.

    **Cambio B — Fields del schema:** Eliminar `canonicalText` field. Agregar 3 fields nuevos:
    - `responseText: z.string().nullable()` (reemplaza canonicalText — texto generado por Gemini, NO verbatim).
    - `responseConfidence: z.number().nullable()` (D-15 auto-reportado).
    - `confidenceRationale: z.string().nullable()` (1 frase razón — observability).

    Preservar (sin cambios):
    - `sourceTopic: z.string().nullable()` (sigue indicando el topic ganador).
    - `nuncaDecirRules: z.array(z.string()).nullable()` (sigue alimentando NUNCA-decir check).
    - `responseTemplate: z.string().nullable()` (path crm_mutation/cas_reject lo usa — D-12).
    - `knowledgeQueried: z.array(z.string()).nullable()` (sin cambios).
    - `requiresHuman: z.boolean()` (sin cambios).
    - `reason: z.string()` (sin cambios).

    Resultado final (verbatim de PATTERNS.md líneas 620-644):

    ```ts
    export const LoopOutcomeSchema = z.object({
      status: z.enum(['generated', 'template', 'no_match']).describe(
        "Discriminator del outcome — 'generated' reemplaza 'canonical' (D-24, ya no es verbatim).",
      ),
      // generated fields (nullable cuando status !== 'generated')
      responseText: z.string().nullable().describe(
        "Texto generado por Gemini Flash usando SOLO el material del KB (D-08).",
      ),
      sourceTopic: z.string().nullable(),
      responseConfidence: z.number().nullable().describe(
        "0..1 auto-reportado por el modelo (D-15). Threshold 0.70 → handoff (D-19).",
      ),
      confidenceRationale: z.string().nullable().describe(
        "1 frase razón del confidence — observability.",
      ),
      nuncaDecirRules: z.array(z.string()).nullable(),
      // template fields (path crm_mutation/cas_reject D-12 — SIN cambios)
      responseTemplate: z.string().nullable(),
      knowledgeQueried: z.array(z.string()).nullable(),
      // común
      requiresHuman: z.boolean(),
      reason: z.string(),
    })

    export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>
    ```

    **Cambio C — `validateLoopOutcomeInvariants`:** Actualizar la función de validación:

    - Reemplazar referencias a `status === 'canonical'` por `status === 'generated'`.
    - Cambiar invariant para 'generated': `responseText !== null && sourceTopic !== null && responseConfidence !== null && requiresHuman === false`.
    - Preservar invariants para `template` y `no_match` SIN CAMBIOS (D-12).

    Ejemplo concreto del invariant nuevo:

    ```ts
    if (outcome.status === 'generated') {
      if (outcome.responseText === null) {
        return { ok: false, violation: 'status=generated pero responseText es null' }
      }
      if (outcome.sourceTopic === null) {
        return { ok: false, violation: 'status=generated pero sourceTopic es null' }
      }
      if (outcome.responseConfidence === null) {
        return { ok: false, violation: 'status=generated pero responseConfidence es null' }
      }
      if (outcome.requiresHuman !== false) {
        return { ok: false, violation: 'status=generated pero requiresHuman=true' }
      }
    }
    // ... preservar bloques 'template' y 'no_match'
    ```
  </action>
  <verify>
    <automated>grep -c "z.enum(\\[.generated.,.template.,.no_match.\\])" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -c "responseText: z.string().nullable" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -c "responseConfidence: z.number().nullable" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -c "confidenceRationale: z.string().nullable" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -cE "canonicalText|'canonical'" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -c "status === 'generated'" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/output-schema" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "z.enum.\\[.generated" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1 (status enum nuevo).
    - `grep -c "responseText" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1.
    - `grep -c "responseConfidence" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1.
    - `grep -c "confidenceRationale" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1.
    - `grep -cE "canonicalText|\\bcanonical\\b" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` == 0 (referencias viejas eliminadas EXCEPTO docstrings que pueden mencionar histórico).
    - `grep -c "status === 'generated'" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1 (invariant actualizado).
    - `grep -c "status === 'template'" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1 (invariant template preservado).
    - `grep -c "status === 'no_match'" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` ≥ 1 (invariant no_match preservado).
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/output-schema" | wc -l` == 0.
  </acceptance_criteria>
  <done>output-schema.ts refactorizado. status enum + 3 fields nuevos + invariants actualizados.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.7: Refactor `prompt.ts` (buildToolingPrompt + buildGenerationPrompt — preservar crm_mutation/cas_reject)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/prompt.ts (estado actual completo)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 654-672 (prompt refactor)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 706-727 (anti-invention prompt section) + líneas 509-542 (M1-M4 calibration recommendations)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-11 (handoff tooling→generation B1) + D-12 (crm_mutation/cas_reject sin cambios)
  </read_first>
  <action>
    Refactorizar `src/lib/agents/somnio-v4/sub-loop/prompt.ts` separando builders por call:

    **Cambio A — Renombrar `buildSubLoopPrompt(reason)` a `buildToolingPrompt(reason)`:**

    Mantener el switch por reason. Casos `crm_mutation` y `cas_reject`: **PRESERVAR contenido actual SIN CAMBIOS** (D-12).

    Casos `low_confidence` y `razonamiento_libre`: REESCRIBIR para que el prompt instruya a GPT mini a:
    1. Llamar `kb_search(query)` con la query del cliente.
    2. Razonar sobre los 3 hits recibidos.
    3. **SELECCIONAR UN topic ganador** (D-11) — el que mejor responda la pregunta específica del cliente.
    4. Emitir output schema: `topic_seleccionado` + `material_del_topic` (copiar verbatim Hechos/Posición/Debe contener relevantes/NUNCA decir/Cuándo escalar del topic ganador) + `should_handoff` (false si encontró topic relevante) + `handoff_reason` (corto, observability).

    Si ningún hit es relevante → `should_handoff: true`, `material_del_topic: null`, `topic_seleccionado: null`.

    **CRITICAL — NO redactar respuesta al cliente.** La instrucción al GPT mini debe explícitamente decirle "Tu trabajo NO es redactar la respuesta al cliente, sino seleccionar el topic + emitir el material parseado. La redacción la hace otro modelo después."

    **Cambio B — Crear `buildGenerationPrompt(material, toneBase, fewShots)`:**

    Construye el system prompt para Gemini Flash. Estructura:

    ```
    ${toneBase}

    REGLAS DURAS DE ANTI-INVENCIÓN:

    1. SOLO usá la información presentada arriba en "MATERIAL DEL TOPIC".
    2. PROHIBIDO mencionar marcas, dosis, condiciones, sustancias, o reglas que
       NO aparezcan literalmente en el material. Ejemplos de invención prohibida:
       - Si el material dice "anticoagulantes", NO menciones "warfarina" específicamente
         a menos que esté en el material.
       - Si el cliente pregunta por "lupus" y el material dice "autoinmunes" genérico,
         NO afirmes nada específico de lupus — reportá responseConfidence ≤ 0.40 + binary
         "FALTA_INFO".
       - Si el cliente pregunta por "Miami" y el material dice "envíos en Colombia", NO
         improvises políticas de envío internacional — responseConfidence ≤ 0.30 + binary
         "FUERA_SCOPE".
    3. Si te falta material para responder con precisión, REPORTÁ confidence bajo (≤ 0.60)
       y un binary { FALTA_INFO | FUERA_SCOPE }. El sistema escalará a humano. No es un
       error — es lo correcto.
    4. La empresa PREFIERE handoffs que respuestas inventadas. NUNCA "lo intentes" si
       no tenés base. El silencio cuesta menos que la información incorrecta.

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

    [PLACEHOLDER FEW_SHOTS — Plan 04 inyecta los 8-10 few-shots acá]

    MATERIAL DEL TOPIC SELECCIONADO:

    [Hechos del producto]
    ${material.hechos ?? '(sin Hechos en el material)'}

    [Posición del negocio]
    ${material.posicion ?? '(sin Posición en el material)'}

    [Debe contener la respuesta — items aplicables al caso]
    ${(material.debe_contener_aplicables ?? []).map(item => `- ${item}`).join('\n')}

    [NUNCA decir]
    ${(material.nunca_decir ?? []).map(item => `- ${item}`).join('\n')}

    [Cuándo escalar a humano]
    ${(material.cuando_escalar ?? []).map(item => `- ${item}`).join('\n')}
    ```

    El parámetro `fewShots` puede ser un array vacío en Plan 03 (Plan 04 inyecta los reales). El placeholder `[PLACEHOLDER FEW_SHOTS — Plan 04 inyecta...]` se mantiene como comentario en el código + en runtime se reemplaza por contenido vacío o `'(few-shots aún no calibrados — Plan 04)'`.

    Signature exacta:

    ```ts
    import { TONE_BASE } from './tone-base'
    import type { ToolingOutput } from './tooling-call'

    export type FewShot = {
      pregunta: string
      material: string
      respuesta: string
      confidence: number
      rationale: string
      binary: 'RESPONDE_BIEN' | 'FALTA_INFO' | 'FUERA_SCOPE'
    }

    export function buildToolingPrompt(
      reason: 'low_confidence' | 'razonamiento_libre' | 'crm_mutation' | 'cas_reject',
    ): string {
      switch (reason) {
        case 'crm_mutation':
          return /* preservar verbatim del prompt actual */
        case 'cas_reject':
          return /* preservar verbatim del prompt actual */
        case 'low_confidence':
        case 'razonamiento_libre':
          return /* prompt nuevo: instruir selección de topic + emitir material */
      }
    }

    export function buildGenerationPrompt(
      material: NonNullable<ToolingOutput['material_del_topic']>,
      toneBase: string = TONE_BASE,
      fewShots: FewShot[] = [],
    ): string {
      // Compose tone + reglas + few-shots (placeholder Plan 04) + material
    }
    ```
  </action>
  <verify>
    <automated>grep -c "export function buildToolingPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "export function buildGenerationPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "export type FewShot" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "case 'crm_mutation'" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "case 'cas_reject'" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "case 'low_confidence'" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "REGLAS DURAS DE ANTI-INVENCIÓN" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "PROBABILIDAD" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "RESPONDE_BIEN" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "buildSubLoopPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/prompt" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function buildToolingPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts` == 1.
    - `grep -c "export function buildGenerationPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts` == 1.
    - `grep -c "export type FewShot" src/lib/agents/somnio-v4/sub-loop/prompt.ts` == 1.
    - 4 cases (crm_mutation, cas_reject, low_confidence, razonamiento_libre) en buildToolingPrompt.
    - `grep -c "REGLAS DURAS DE ANTI-INVENCIÓN" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1 (anti-invention prompt en buildGenerationPrompt).
    - `grep -c "PROBABILIDAD" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1 (M1 framing).
    - `grep -c "RESPONDE_BIEN\\|FALTA_INFO\\|FUERA_SCOPE" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 3 (M3 binary backstop).
    - `grep -c "buildSubLoopPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts` == 0 (función vieja eliminada — solo si el orchestrator también se actualiza en Task 3.8).
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/prompt" | wc -l` == 0.
  </acceptance_criteria>
  <done>prompt.ts refactorizado. crm_mutation/cas_reject preservados (D-12). low_confidence/razonamiento_libre con instrucciones para tooling. buildGenerationPrompt con anti-invención + M1/M3.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.8: Refactor `index.ts` orchestrator (switch por reason + split call flow + invariant validation)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (estado actual completo, 407 líneas)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 342-435 (index.ts refactor verbatim + preservar/borrar excerpts)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 555-630 (Steps 2/3/4 — orchestration pattern)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-09 (NUNCA-decir sin cambios) + D-12 (crm_mutation/cas_reject sin cambios) + D-19 (threshold 0.70) + D-20 (NUNCA-decir handoff) + D-22 (catch wrap)
    - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (signature `checkNuncaDecir` — para reusar verbatim, NO modificar)
  </read_first>
  <action>
    Refactorizar `src/lib/agents/somnio-v4/sub-loop/index.ts` con la estructura nueva. Es el archivo más grande del plan — leer ENTERO antes de empezar.

    **Estructura del orchestrator nuevo (verbatim de PATTERNS.md líneas 370-427):**

    ```ts
    import { runToolingCall } from './tooling-call'
    import { runGenerationCall } from './generation-call'
    import { buildToolingPrompt, buildGenerationPrompt } from './prompt'
    import { TONE_BASE } from './tone-base'
    import { checkNuncaDecir } from './nunca-decir-check'  // sin cambios al import
    import { validateLoopOutcomeInvariants, type LoopOutcome } from './output-schema'
    // mantener imports actuales para crm_mutation/cas_reject path

    export async function runSubLoop(args: {
      reason: 'low_confidence' | 'razonamiento_libre' | 'crm_mutation' | 'cas_reject'
      ctx: {
        workspaceId: string
        userMessage: string
        recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
        // ... otros campos del ctx actual
      }
      onDebug?: (payload: SubLoopDebugPayload) => void
      // ... otros params actuales
    }): Promise<LoopOutcome> {
      try {
        // === SWITCH POR REASON ===

        // PRESERVAR FLUJO VIEJO (D-12) — crm_mutation y cas_reject
        if (args.reason === 'crm_mutation' || args.reason === 'cas_reject') {
          return await runLegacySubLoop(args)  // extracción del flujo actual single-call
        }

        // === FLUJO NUEVO RAG-generative — low_confidence | razonamiento_libre ===

        // CALL 1 — Tooling
        const tooling = await runToolingCall({
          reason: args.reason,
          ctx: {
            workspaceId: args.ctx.workspaceId,
            userMessage: args.ctx.userMessage,
            recentMessages: args.ctx.recentMessages,
          },
          systemPrompt: buildToolingPrompt(args.reason),
        })

        args.onDebug?.({ /* emit tooling call debug */ })

        if (tooling.should_handoff || !tooling.topic_seleccionado || !tooling.material_del_topic) {
          const outcome: LoopOutcome = {
            status: 'no_match',
            responseText: null,
            sourceTopic: null,
            responseConfidence: null,
            confidenceRationale: null,
            nuncaDecirRules: null,
            responseTemplate: null,
            knowledgeQueried: tooling.topic_seleccionado ? [tooling.topic_seleccionado] : null,
            requiresHuman: true,
            reason: tooling.handoff_reason ?? 'no_relevant_hit',
          }
          const inv = validateLoopOutcomeInvariants(outcome)
          if (!inv.ok) throw new Error(`Invariant fail post-tooling-handoff: ${inv.violation}`)
          return outcome
        }

        // CALL 2 — Generation
        const generation = await runGenerationCall({
          systemPrompt: buildGenerationPrompt(tooling.material_del_topic, TONE_BASE, /* fewShots — Plan 04 inyecta */ []),
          userMessage: args.ctx.userMessage,
          recentMessages: args.ctx.recentMessages,
        })

        args.onDebug?.({ /* emit generation call debug */ })

        // D-19 — threshold check (lee de platform_config o usa 0.70 default)
        const THRESHOLD = 0.70  // TODO Plan 04 puede leer de platform_config.somnio_v4_low_confidence_threshold
        if (generation.responseConfidence < THRESHOLD) {
          return {
            status: 'no_match',
            responseText: null,
            sourceTopic: tooling.topic_seleccionado,
            responseConfidence: generation.responseConfidence,
            confidenceRationale: generation.confidenceRationale,
            nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? null,
            responseTemplate: null,
            knowledgeQueried: [tooling.topic_seleccionado],
            requiresHuman: true,
            reason: 'low_response_confidence',
          }
        }

        // M3 — binary backstop (RESEARCH A1)
        if (generation.binary === 'FALTA_INFO' || generation.binary === 'FUERA_SCOPE') {
          return {
            status: 'no_match',
            responseText: null,
            sourceTopic: tooling.topic_seleccionado,
            responseConfidence: generation.responseConfidence,
            confidenceRationale: generation.confidenceRationale,
            nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? null,
            responseTemplate: null,
            knowledgeQueried: [tooling.topic_seleccionado],
            requiresHuman: true,
            reason: `binary_backstop_${generation.binary}`,
          }
        }

        // D-09 / D-20 — NUNCA-decir check (sin cambios al archivo nunca-decir-check.ts)
        const nuncaCheck = await checkNuncaDecir({
          candidateText: generation.responseText,
          nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? [],
        })
        if (!nuncaCheck.ok) {
          return {
            status: 'no_match',
            responseText: null,
            sourceTopic: tooling.topic_seleccionado,
            responseConfidence: generation.responseConfidence,
            confidenceRationale: generation.confidenceRationale,
            nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? null,
            responseTemplate: null,
            knowledgeQueried: [tooling.topic_seleccionado],
            requiresHuman: true,
            reason: 'nunca_decir_violation',
          }
        }

        // SUCCESS — status='generated'
        const outcome: LoopOutcome = {
          status: 'generated',
          responseText: generation.responseText,
          sourceTopic: tooling.topic_seleccionado,
          responseConfidence: generation.responseConfidence,
          confidenceRationale: generation.confidenceRationale,
          nuncaDecirRules: tooling.material_del_topic.nunca_decir ?? null,
          responseTemplate: null,
          knowledgeQueried: [tooling.topic_seleccionado],
          requiresHuman: false,
          reason: 'rag_generated',
        }
        const inv = validateLoopOutcomeInvariants(outcome)
        if (!inv.ok) throw new Error(`Invariant fail post-generation: ${inv.violation}`)
        return outcome

      } catch (err) {
        // D-22 — catch wrap existente (mismo patrón actual; extender si se necesitan campos diagnóstico extra)
        // ... preservar shape del catch actual + log diagnostic
        throw err
      }
    }

    // === LEGACY PATH (D-12 — crm_mutation/cas_reject sin cambios) ===

    async function runLegacySubLoop(args: /* same as runSubLoop */): Promise<LoopOutcome> {
      // Mover el bloque actual de líneas 192-403 (single generateText con tools + Output.object)
      // INTACTO acá. Solo cambia el call site: lo invoca el switch arriba en vez de ser el flujo único.
      // ...
    }
    ```

    **Procedimiento detallado:**

    1. Leer index.ts entero.
    2. Identificar el bloque single-call actual (líneas ~192-403 según PATTERNS.md). Es el bloque que va a vivir como `runLegacySubLoop` para crm_mutation/cas_reject.
    3. Cortar ese bloque + envolver en función `runLegacySubLoop(args)`. Output: el mismo `LoopOutcome` (pero con `status='template'` para crm_mutation success, `status='no_match'` para handoffs — convertir si actualmente emite `'canonical'` lo que NO debería para esos paths).
    4. Reescribir el body de `runSubLoop` con la estructura nueva arriba: switch + tooling + handoff checks + generation + threshold + binary backstop + NUNCA-decir + invariants + success.
    5. Mantener `validateLoopOutcomeInvariants` import + call sites.
    6. Mantener `onDebug` callback emisiones — ahora son 2 (tooling debug + generation debug) en lugar de 1.
    7. **Borrar** referencias a `canonicalText`, `status: 'canonical'`, y los prompts del bloque viejo que ya no aplican.

    **Funciones a preservar/mover:**
    - `getOpenAI()` lazy singleton (líneas 30-50 actuales): MOVER a `tooling-call.ts` (ya está en Task 3.4). Eliminar del index.ts.
    - `extractStepData()` helper (líneas 104-183): MOVER a `tooling-call.ts` y/o `generation-call.ts` (cada una con su versión si es necesario).
    - `validateLoopOutcomeInvariants`: ya está en output-schema.ts, solo importar.
    - `runWithPurpose` wraps: replicados en `tooling-call.ts` y `generation-call.ts`.

    **Verificar al final:**
    - `nunca-decir-check.ts` NO está en files_modified de este plan — el archivo NO se toca.
    - El switch arriba route correctamente: crm_mutation/cas_reject → legacy, low_confidence/razonamiento_libre → nuevo.
  </action>
  <verify>
    <automated>grep -c "import { runToolingCall }" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "import { runGenerationCall }" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "import { buildToolingPrompt, buildGenerationPrompt }" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "import { TONE_BASE }" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "runLegacySubLoop" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "args.reason === 'crm_mutation'" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "binary === 'FALTA_INFO'\\|binary === 'FUERA_SCOPE'" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "status: 'generated'" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -cE "canonicalText|status: 'canonical'" src/lib/agents/somnio-v4/sub-loop/index.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/index" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - Imports nuevos presentes: runToolingCall, runGenerationCall, buildToolingPrompt, buildGenerationPrompt, TONE_BASE.
    - `grep -c "runLegacySubLoop" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 2 (declaración + call site del switch).
    - `grep -c "args.reason === 'crm_mutation'" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1 (switch case).
    - `grep -c "binary === 'FALTA_INFO'" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1 (M3 backstop check).
    - `grep -c "binary === 'FUERA_SCOPE'" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1.
    - `grep -c "status: 'generated'" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1 (success branch).
    - `grep -cE "canonicalText|status: 'canonical'" src/lib/agents/somnio-v4/sub-loop/index.ts` == 0 (referencias viejas eliminadas).
    - `grep -c "checkNuncaDecir" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1 (sin cambios al import, solo al argumento).
    - **NO MODIFICAR `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`:** `git diff --name-only` después de Task 3.8 NO debe incluir ese path. Verificable: `git diff --name-only | grep -c "nunca-decir-check"` == 0.
    - **NO MODIFICAR `src/lib/agents/somnio-v4/comprehension-schema.ts`:** `git diff --name-only | grep -c "comprehension-schema"` == 0.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/index" | wc -l` == 0.
  </acceptance_criteria>
  <done>Orchestrator refactorizado. Switch por reason. crm_mutation/cas_reject preservados. Flujo nuevo RAG-generative funcional. NUNCA-decir + comprehension-schema intocados.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.9: Light-extend `debug-payload.ts` para soportar 2 calls (toolingCall + generationCall)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/debug-payload.ts (estado actual completo, 94 líneas)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 770-779 (debug-payload light touch)
    - .planning/standalone/v4-subloop-debug-view (LEARNINGS — patrón onDebug closure capture)
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` agregando 2 campos al type `SubLoopDebugPayload`:

    ```ts
    toolingCall?: {
      stepCount: number
      finishReason: string
      output: import('./tooling-call').ToolingOutput
      latencyMs?: number
    }
    generationCall?: {
      finishReason: string
      output: import('./generation-call').GenerationOutput
      latencyMs?: number
    }
    ```

    Mantener los campos existentes (kbHits, outcome, invariantViolation, nuncaDecirViolation, etc.).

    Patrón: si `tooling.should_handoff === true` → emit solo `toolingCall` debug (no `generationCall`). Si tooling success → emit ambos.
  </action>
  <verify>
    <automated>grep -c "toolingCall?:" src/lib/agents/somnio-v4/sub-loop/debug-payload.ts && grep -c "generationCall?:" src/lib/agents/somnio-v4/sub-loop/debug-payload.ts && grep -c "import('./tooling-call').ToolingOutput\\|ToolingOutput" src/lib/agents/somnio-v4/sub-loop/debug-payload.ts && grep -c "import('./generation-call').GenerationOutput\\|GenerationOutput" src/lib/agents/somnio-v4/sub-loop/debug-payload.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/debug-payload" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `toolingCall?:` field presente.
    - `generationCall?:` field presente.
    - Type ToolingOutput + GenerationOutput importados (inline o top).
    - Campos existentes preservados.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/debug-payload" | wc -l` == 0.
  </acceptance_criteria>
  <done>debug-payload.ts extendido para 2 calls.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.10: Crear tests `safe-output.test.ts` + actualizar `sub-loop-e2e.test.ts` + `output-schema.test.ts`</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts (estado actual completo)
    - src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts (estado actual completo)
    - src/lib/agents/somnio-v4/sub-loop/safe-output.ts (post-Task 3.1 — para entender API)
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (post-Task 3.6 — schema nuevo)
  </read_first>
  <action>
    **Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts`:**

    Tests unit (mock generateText result):
    1. Returns `result.output` cuando no hay error.
    2. Cuando `NoObjectGeneratedError` throw + `result.text` tiene JSON válido → manual parse OK.
    3. Cuando `NoObjectGeneratedError` throw + `result.text` tiene JSON inválido → throw con mensaje diagnostic incluyendo primeros 200 chars del text.
    4. Cuando otro error (no NoObjectGeneratedError) → re-throw sin transformar.

    Mock setup: crear objetos `result` fake con shape `{ output: T | () => throw, text: string }`. Construir NoObjectGeneratedError manualmente o usar el constructor que AI SDK expone.

    **Actualizar `src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts`:**

    - Cambiar assertions sobre `status` para usar el enum nuevo (`'generated'` en lugar de `'canonical'`).
    - Cambiar campo `canonicalText` por `responseText` en assertions.
    - Si el test invoca runSubLoop con un real LLM (`describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4)`), agregar también skip si `!process.env.GOOGLE_GENERATIVE_AI_API_KEY` (necesario para Gemini Flash).
    - Agregar 1-2 nuevos test cases que validen:
      - low_confidence path produce `status='generated'` con responseText non-empty + responseConfidence number + sourceTopic non-null.
      - crm_mutation path produce `status='template'` (preserva D-12 behavior).
      - Cuando responseConfidence < 0.70 (forced via mock o caso real) → outcome es `status='no_match'` con reason='low_response_confidence'.

    **Actualizar `src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts`:**

    - Validar schema nuevo: status enum 'generated'/'template'/'no_match' + nuevos fields nullable.
    - Validar invariants:
      - `status='generated'` con responseText null → throw.
      - `status='generated'` con sourceTopic null → throw.
      - `status='generated'` con responseConfidence null → throw.
      - `status='generated'` con requiresHuman=true → throw.
      - `status='template'` invariants preservadas (sin tocar tests existentes salvo si rompen por refactor).
      - `status='no_match'` invariants preservadas.
    - Test que un outcome con `status='canonical'` (string literal viejo) NO parsea — z.enum rechaza.

    Correr al final: `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/`. Todos verdes (excepto los gated por env vars LLM si no están en CI).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts && npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts` exit 0.
    - `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts` exit code 0.
    - `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts` exit code 0.
    - `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts` exit code 0 si env vars presentes, skip si no (NO error).
  </acceptance_criteria>
  <done>Tests creados + actualizados + verdes.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.11: Commit Plan 03 + PUSH FINAL ATÓMICO (incluye commit Plan 02 — Regla 1 + D-24)</name>
  <read_first>
    - CLAUDE.md Regla 1 (push) + Regla 5 (migración ya aplicada en Plan 01)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-24 (atomic deploy unit)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 939-963 (Co-Modification Constraints)
    - `git log --oneline origin/main..HEAD` (verificar que Plan 02 commit local está presente + el siguiente commit de Plan 03 va arriba)
  </read_first>
  <action>
    **Paso 1 — Verificar pre-condiciones:**

    ```bash
    # Plan 02 commit local existe (no pushado):
    git log origin/main..HEAD --oneline | grep -c "plan 02"
    # Esperado: 1

    # Status clean (todos los archivos de Plan 03 ya commiteados o staged):
    git status --short
    ```

    Si Plan 02 commit NO existe → STOP, algo se rompió en Plan 02. NO continuar.

    **Paso 2 — Stage + commit Plan 03 (separate del Plan 02):**

    ```bash
    git add src/lib/agents/somnio-v4/sub-loop/index.ts \
            src/lib/agents/somnio-v4/sub-loop/output-schema.ts \
            src/lib/agents/somnio-v4/sub-loop/prompt.ts \
            src/lib/agents/somnio-v4/sub-loop/tooling-call.ts \
            src/lib/agents/somnio-v4/sub-loop/generation-call.ts \
            src/lib/agents/somnio-v4/sub-loop/safe-output.ts \
            src/lib/agents/somnio-v4/sub-loop/tone-base.ts \
            src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts \
            src/lib/agents/somnio-v4/sub-loop/debug-payload.ts \
            src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts \
            src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts \
            src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts

    git commit -m "$(cat <<'EOF'
    feat(somnio-v4-rag-generative): plan 03 — sub-loop split tooling/generación + borrar canonical (atomic con plan 02)

    Refactor arquitectónico del sub-loop:
    - NEW tooling-call.ts: Call 1 GPT-4o mini + kb_search + Output.object → selecciona topic ganador + emite material parseado (D-11).
    - NEW generation-call.ts: Call 2 Gemini 2.5 Flash + Output.object SIN tools, temp 0.3, safetySettings BLOCK_NONE x4 (Pitfall 6). Output incluye responseText + responseConfidence + confidenceRationale + binary backstop (M3 RESEARCH A1).
    - NEW safe-output.ts: wrapper defensivo para vercel/ai#11348 (NoObjectGeneratedError + JSON.parse fallback) — RESEARCH A3.
    - NEW tone-base.ts: TONE_BASE const global (D-05).
    - REFACTOR index.ts: switch por reason. crm_mutation/cas_reject preservan flujo viejo verbatim (D-12). low_confidence/razonamiento_libre usan flujo nuevo split. Threshold 0.70 (D-19). M3 binary backstop checks. NUNCA-decir check intacto (D-09).
    - REFACTOR output-schema.ts: status enum 'generated'/'template'/'no_match' (canonical eliminado D-24). responseText + responseConfidence + confidenceRationale agregados. Invariants actualizados.
    - REFACTOR prompt.ts: buildToolingPrompt (4 cases) + buildGenerationPrompt (anti-invención + M1 framing + M3 backstop + material).
    - LIGHT-EXTEND kb-search-tool.ts: KbHit shape incluye 5 columnas nuevas del RPC (post Plan 01).
    - LIGHT-EXTEND debug-payload.ts: toolingCall + generationCall fields.
    - TESTS safe-output.test.ts (NEW) + sub-loop-e2e.test.ts + output-schema.test.ts actualizados al schema nuevo.

    NO TOCADOS (locks):
    - nunca-decir-check.ts (D-09 — sigue Gemini Flash-Lite verbatim).
    - comprehension-schema.ts (D-25 lock standalone hermano).
    - sub-loop/tools.ts (D-12 — tool dict para crm_mutation/cas_reject sin cambios).

    Standalone: somnio-v4-rag-generative Plan 03 (Wave 2 — atomic con Plan 02 D-24).
    Refs D-05, D-07, D-08, D-09, D-10, D-11, D-12, D-15, D-19, D-20, D-22, D-24 + RESEARCH A1, A3 + M1/M2/M3.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"
    ```

    **Paso 3 — PUSH ATÓMICO (Plan 02 + Plan 03 juntos):**

    ```bash
    # Esto pushea ambos commits (Plan 02 + Plan 03) al mismo tiempo:
    git push origin main
    ```

    El push de origin/main absorbe los 2 commits locales (Plan 02 + Plan 03) en una sola operación atómica. Si el push falla, NINGUNO de los 2 commits llega a producción → invariante D-24 preservado.

    **Paso 4 — Verificar:**

    ```bash
    git log origin/main..HEAD --oneline | wc -l
    # Esperado: 0 (todos los commits pushados).

    git log -2 --oneline
    # Esperado: Plan 03 commit (HEAD) + Plan 02 commit (HEAD~1), ambos pushados.
    ```

    Anunciar al usuario: "Plan 03 cerrado. Push atómico de Plan 02 + Plan 03 exitoso. v4 sigue dormant (Regla 6). KB nuevo + sub-loop nuevo coherentes en producción. Próximo: Plan 04 (calibración few-shots) en Wave 3."
  </action>
  <verify>
    <automated>git log -2 --oneline | head && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --oneline` incluye "somnio-v4-rag-generative" + "plan 03".
    - `git log -2 --oneline` muestra Plan 03 (HEAD) + Plan 02 (HEAD~1) consecutivos.
    - `git log origin/main..HEAD --oneline | wc -l` == 0 (todos pushados).
    - `git status` clean.
    - **v4 sigue dormant (Regla 6 — verificable post-push):** `SELECT count(*) FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true AND event::text LIKE '%somnio-sales-v4%'` == 0.
  </acceptance_criteria>
  <done>Plan 03 cerrado. Push atómico Plan 02 + Plan 03 exitoso. v4 dormant. Plan 04 unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sub-loop → OpenAI API (GPT-4o mini) | tooling call, key OPENAI_API_KEY_SALESV4 |
| Sub-loop → Google API (Gemini 2.5 Flash) | generation call, key GOOGLE_GENERATIVE_AI_API_KEY, safetySettings BLOCK_NONE |
| Sub-loop → Supabase RPC (match_knowledge_base) | via kb_search tool, filtered by workspace_id |
| Plan 02 commit + Plan 03 commit → main branch | atomic push (D-24) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-01 | Tampering | Modelo Gemini inventa info no en KB → cliente recibe respuesta falsa | HIGH | mitigate | Prompt anti-invención duro (Task 3.7) + M3 binary backstop (Task 3.5 + 3.8) + Smoke A invención check explícita (Plan 05). Si Smoke A detecta 1+ invención → bloquear Plan 08 + agregar checkSourceGrounding (V2). |
| T-03-02 | Denial of Service | Gemini safetySettings default bloquea menciones "alcohol"/"embarazo" → texto vacío | HIGH | mitigate | BLOCK_NONE x4 en Task 3.5 (verbatim de nunca-decir-check.ts). Pitfall 6 Iter 5b learning. Verificable: `grep -c "BLOCK_NONE" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 4. |
| T-03-03 | Tampering | Gemini overconfidence (responseConfidence > 0.70 falso positivo) → mala respuesta sale al cliente | MEDIUM | mitigate | M3 binary backstop (Task 3.5 enum). Plan 04 calibration (M1-M4). Smoke A calibration_alignment metric (Plan 05). Threshold 0.70 conservador. |
| T-03-04 | Information Disclosure | KbHit con material de otro workspace via RPC mal filtrado | LOW | mitigate | RPC `match_knowledge_base` filtra por `p_workspace_id`; kb-search-tool pasa `ctx.workspaceId` (Pitfall 2 mutation-tools). Sin cambios estructurales. |
| T-03-05 | Denial of Service | NoObjectGeneratedError sin safeAccessOutput wrap → throw runtime | MEDIUM | mitigate | Task 3.1 crea wrapper + Tasks 3.4/3.5 lo usan en ambas calls. Test 3.10 verifica fallback path. |
| T-03-06 | Repudiation | Plan 02 pushado sin Plan 03 (anti-D-24) → runtime degradado | INFO | mitigate | Plan 02 Task 2.5 NO pushea. Plan 03 Task 3.11 push final atómico. Pre-check verifica que Plan 02 commit existe local antes de Plan 03 commit/push. |
| T-03-07 | Elevation of Privilege | nunca-decir-check.ts modificado fuera de D-09 lock | LOW | mitigate | Acceptance criterion Task 3.8: `git diff --name-only | grep -c "nunca-decir-check"` == 0. |
| T-03-08 | Elevation of Privilege | routing_rules modificado fuera de Plan 08 (Regla 6) | LOW | mitigate | Plans 01-07 no tienen `routing_rules` en files_modified. Post-push verify: v4 sigue dormant (SQL count == 0). |
</threat_model>

<verification>
- Los 4 archivos nuevos existen (safe-output, tone-base, tooling-call, generation-call).
- index.ts orquestador refactor: switch por reason, flujo nuevo RAG-generative para low_confidence/razonamiento_libre, flujo viejo verbatim para crm_mutation/cas_reject.
- output-schema.ts: status enum nuevo + 3 fields nullable nuevos + invariants actualizados.
- prompt.ts: buildToolingPrompt + buildGenerationPrompt + FewShot type.
- kb-search-tool.ts: KbHit interface enriquecido + map de RPC rows actualizado.
- debug-payload.ts: 2 calls campos agregados.
- Tests: safe-output.test.ts creado + e2e + output-schema actualizados.
- **NUNCA-decir y comprehension-schema intocados** (verificable git diff).
- TypeScript clean: `npx tsc --noEmit -p . 2>&1 | grep -E "src/lib/agents/somnio-v4/sub-loop" | wc -l` == 0.
- Tests verdes: `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/` exit 0.
- Push atómico Plan 02 + Plan 03 exitoso.
- v4 sigue dormant en producción.
</verification>

<success_criteria>
Plan 03 cerrado cuando:
- [ ] 4 archivos nuevos + 3 refactors + 2 light-extensions + 3 tests actualizados.
- [ ] TypeScript + vitest verdes.
- [ ] Push atómico Plan 02 + Plan 03 exitoso (origin/main).
- [ ] v4 dormant confirmado post-push.
- [ ] STATUS.md actualizada: Plans 02 + 03 done + HEAD del push.
- [ ] LEARNINGS preliminares notados (cualquier descubrimiento o adaptación durante refactor).
- [ ] Plan 04 (Wave 3) unblocked.
</success_criteria>

<rollback>
Si Task 3.11 push falla a mitad de camino:
1. Verificar estado: `git log origin/main..HEAD --oneline` — si ambos commits siguen locales, retry `git push origin main`.
2. Si push parcial (rare con git — git push es atómico): re-sync con `git fetch origin && git status`.
3. Si tras varios retries no funciona: STOP, escalate. NO force-push (Regla 5/Regla 1 safety).

Si tras push se descubre bug crítico en producción:
1. v4 dormant — daño práctico nulo, no hay tráfico.
2. **Si igual querés revertir:**
   - `git revert <plan03-sha> <plan02-sha>` (en ese orden — primero Plan 03 que es el HEAD).
   - `git push origin main`.
   - Resultado: KB vuelve al formato viejo + sub-loop vuelve al canonical. Pero: las columnas nuevas DB siguen (no afecta — quedan no-leídas).
   - El RPC también vuelve a shape viejo solo si re-aplicás migration de Plan 01 → no es necesario en general (RPC retorna las 5 cols nuevas pero el sub-loop viejo las ignora).

Si se descubre que `nunca-decir-check.ts` o `comprehension-schema.ts` fueron tocados (violation D-09/D-25):
1. STOP commit/push si todavía no se hizo.
2. `git checkout HEAD -- src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts src/lib/agents/somnio-v4/comprehension-schema.ts` (revert local).
3. Re-verificar acceptance.
4. Si ya se commiteó pero NO se pushó: `git reset --soft HEAD~1` + re-commit sin esos archivos.
5. Si ya se pushó: revert commit + nuevo commit corrigiendo + push.
</rollback>

<output>
After completion, create `.planning/standalone/somnio-v4-rag-generative/03-SUMMARY.md` documentando:
- 4 archivos nuevos creados.
- Files refactorizados con líneas approx removidas/agregadas.
- Tests resultado.
- HEAD del push final (Plan 02 + Plan 03 atómicos).
- Confirmación post-push v4 dormant.
- LEARNINGS preliminares (qué adaptaciones surgieron durante refactor).
- Próximo paso: Plan 04 calibration few-shots en Wave 3.
</output>
