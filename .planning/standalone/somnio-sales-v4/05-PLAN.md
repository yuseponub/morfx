---
plan: 05
phase: somnio-sales-v4
wave: 1
depends_on: [01, 02, 04]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts
  - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts
addresses_decisions: [D-01, D-02, D-09, D-13, D-19, D-50, D-51, D-57, D-62]
addresses_research_pitfalls: [Pitfall 2, Pitfall 8]
autonomous: true
estimated_tasks: 5
must_haves:
  truths:
    - "LoopOutcomeSchema (Zod discriminated union) NO contiene variante freeText (D-62 estructural)"
    - "kbSearchTool ejecuta query pgvector cosine y filtra por workspace_id de ctx (NO de input — Pitfall 2)"
    - "kbSearchTool lee `nunca_decir` directamente del RPC `match_knowledge_base` (W-09 — sin parsing del canonical)"
    - "nunca-decir-check.ts hace early-return cuando rules vacías (rules vienen del DB column ahora — typically non-empty cuando el doc tiene la sección)"
    - "runSubLoop usa generateText + Output.object + stopWhen=stepCountIs(4) + toolChoice='auto'"
    - "Cero importaciones de @/lib/agents/somnio-v3/* (D-24)"
    - "Cero `workspaceId` en inputSchemas de tools (Pitfall 2 mutation-tools)"
    - "Plan 05 es PURAMENTE AUTÓNOMO — sin migration files, sin HALT (B-01 fix — RPC migration vive en Plan 02)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/output-schema.ts"
      provides: "LoopOutcomeSchema discriminated union template/canonical/no_match"
      exports: ["LoopOutcomeSchema", "LoopOutcome"]
    - path: "src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts"
      provides: "kbSearchTool factory que retorna AI SDK tool() para pgvector"
      exports: ["kbSearchTool"]
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "runSubLoop entrypoint"
      exports: ["runSubLoop", "SubLoopContext"]
  key_links:
    - from: "runSubLoop output==='canonical'"
      to: "checkNuncaDecir(canonicalText, nuncaDecirRules)"
      via: "post-gen check antes de retornar (D-51) — rules vienen del RPC result"
      pattern: "checkNuncaDecir"
    - from: "kbSearchTool.execute"
      to: "supabase.rpc('match_knowledge_base', ...)"
      via: "RPC retorna nunca_decir TEXT[] como columna directa"
      pattern: "result.nunca_decir"
---

<objective>
Wave 1 (utilidades compartidas — parte 2 de 3). Construir la infraestructura del sub-loop AI SDK v6:

1. `output-schema.ts` — Zod discriminated union sin variante freeText (D-62)
2. `kb-search-tool.ts` — AI SDK tool wrapping pgvector cosine search (RPC `match_knowledge_base` — creado en Plan 02). **W-09:** lee `nunca_decir` desde el RPC result directamente, sin parser de canonical_response.
3. `nunca-decir-check.ts` — segunda llamada Haiku que valida compliance (D-51)
4. `prompt.ts` — system prompts por SubLoopReason
5. `tools.ts` — factory que ensambla tool dict por reason (D-09 — 3-5 tools por scope, no 20)
6. `index.ts` — runSubLoop entrypoint que combina todo

D-07: Las mutation tools que el sub-loop expone se obtienen vía `createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })`. Las query tools vía `createCrmQueryTools(...)`.

**B-01 fix:** Plan 05 es 100% autónomo — la migración del RPC `match_knowledge_base` vive en Plan 02 (Wave 0) bajo el HALT consolidado de migraciones. Plan 05 NO crea archivos SQL ni requiere checkpoints humanos. El push se hace inmediatamente tras los tests.

Output: 6 archivos de código + 2 tests + 1 commit autónomo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@.claude/skills/crm-query-tools.md
@.claude/skills/crm-mutation-tools.md
@src/lib/agents/shared/crm-mutation-tools/index.ts
@src/lib/agents/shared/crm-query-tools/index.ts
</context>

<interfaces>
<!-- LoopOutcomeSchema (RESEARCH §Pattern 2 + PATTERNS sub-loop/output-schema.ts) -->

```typescript
LoopOutcomeSchema = z.discriminatedUnion('status', [
  { status: 'template',   responseTemplate: string,                          requiresHuman: false, reason: string },
  { status: 'canonical',  canonicalText: string, sourceTopic: string, nuncaDecirRules?: string[], requiresHuman: false, reason: string },
  { status: 'no_match',   responseTemplate: 'handoff_humano',                requiresHuman: true,  reason: string, knowledgeQueried: string[] }
])
```

NO `freeText` variant — D-62 estructural.

<!-- SubLoopReason (D-02) -->
```typescript
type SubLoopReason = 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
```

<!-- AI SDK v6 sub-loop pattern (RESEARCH §Pattern 2) -->
```typescript
const { output } = await generateText({
  model: anthropic('claude-haiku-4-5-20251001'),
  system: buildSubLoopPrompt(reason),
  messages: buildContextMessages(ctx),
  tools,
  toolChoice: 'auto',
  stopWhen: stepCountIs(4),
  output: Output.object({ schema: LoopOutcomeSchema }),
})
```

<!-- Tool subsetting por reason (D-09 + PATTERNS sub-loop/tools.ts) -->
- low_confidence / razonamiento_libre → solo `kb_search`
- crm_mutation → kb_search + getActiveOrderByPhone + (createOrder, updateOrder, moveOrderToStage, addOrderNote, updateContact)
- cas_reject → kb_search + getActiveOrderByPhone + moveOrderToStage

<!-- match_knowledge_base RPC RETURNS shape (creado en Plan 02 Task 3) -->
```typescript
{
  topic: string,
  canonical_response: string | null,
  nunca_decir: string[],         // W-09: alimenta post-gen check
  escalate_triggers: string[],
  related_topics: string[],
  category: string,
  distance: number               // cosine distance, ascending = más similar
}
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: output-schema.ts (Zod discriminated union sin freeText)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/output-schema.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "sub-loop/output-schema.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-50, D-57, D-62)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Pitfall 2)
  </read_first>
  <action>
Crear `src/lib/agents/somnio-v4/sub-loop/output-schema.ts`:

```typescript
import { z } from 'zod'

/**
 * LoopOutcome — output del sub-loop AI SDK v6.
 * D-62: discriminated union SIN variante freeText (anti-hallucination estructural).
 *       Enforced por Output.object() schema, NO por toolChoice — ver RESEARCH §Pattern 2 line 406.
 *       toolChoice='auto' se usa porque 'required' impediría el output estructurado final.
 * D-50: 'canonical' = verbatim del KB Respuesta canónica.
 * D-57: 'no_match' siempre handoff_humano + requiresHuman=true.
 */
export const LoopOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('template'),
    responseTemplate: z.string().describe(
      'Intent de un template existente en agent_templates filtrado por agent_id=somnio-sales-v4'
    ),
    extraContext: z.record(z.string(), z.string()).optional(),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('canonical'),
    canonicalText: z.string().describe(
      'Verbatim de la sección "## Respuesta canónica" del KB doc encontrado.'
    ),
    sourceTopic: z.string().describe('topic del KB doc fuente'),
    nuncaDecirRules: z.array(z.string()).optional().describe(
      'Reglas "NUNCA decir" del KB doc fuente, para validación post-gen (D-51).'
    ),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('no_match'),
    responseTemplate: z.literal('handoff_humano'),
    requiresHuman: z.literal(true),
    reason: z.string(),
    knowledgeQueried: z.array(z.string()).describe(
      'Lista de topics consultados que no resolvieron el caso (D-58 doble logging).'
    ),
  }),
])

export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>

/**
 * SubLoopReason — disparadores D-02.
 */
export type SubLoopReason = 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
```

**Anti-pattern:** NO agregar variante `{ status: 'freeText', text: string }`. La schema FUERZA al modelo a comprometerse con uno de los 3 outcomes — sin opción de escape a freeText (D-62).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "z.discriminatedUnion('status'" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "z.literal('template')" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "z.literal('canonical')" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "z.literal('no_match')" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "z.literal('handoff_humano')" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && [ "$(grep -c 'freeText' src/lib/agents/somnio-v4/sub-loop/output-schema.ts)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe
    - 3 variantes (template, canonical, no_match) en discriminatedUnion
    - Cero ocurrencias de literal `freeText` en el archivo
    - `no_match` tiene `responseTemplate: z.literal('handoff_humano')` (D-57)
    - Comentario W-06 explicando por qué `toolChoice='auto'` y D-62 enforcement
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>Schema sub-loop con cero superficie de hallucination.</done>
</task>

<task type="auto">
  <name>Task 2: kb-search-tool.ts (pgvector via AI SDK tool wrapper) — lee nunca_decir del RPC (W-09)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "sub-loop/kb-search-tool.ts")
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (§Pattern 2, Pitfall 8)
    - src/lib/agents/somnio-v4/knowledge-base/embed.ts (generateEmbedding ya creado en Plan 04)
    - src/lib/agents/somnio-v4/config.ts (SOMNIO_V4_AGENT_ID)
    - supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql (Plan 02 — RPC creado y aplicado)
  </read_first>
  <action>
Crear `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts`:

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '../knowledge-base/embed'
import { SOMNIO_V4_AGENT_ID } from '../config'

export interface KbSearchContext {
  workspaceId: string
}

export interface KbHit {
  topic: string
  canonicalResponse: string | null
  nuncaDecirRules: string[]      // W-09: viene directo del RPC, no de parsing
  relatedTopics: string[]
  category: string
  similarity: number
}

/**
 * AI SDK tool factory para búsqueda en agent_knowledge_base.
 * Pitfall 2: workspaceId viene de ctx, NUNCA del input.
 * Pitfall 8: pgvector cosine via RPC `match_knowledge_base` (creado en Plan 02 — usa HNSW index).
 *
 * W-09: el RPC retorna `nunca_decir TEXT[]` como columna dedicada (Plan 01 schema + Plan 02 RPC).
 * `kbSearchTool` lee este array directamente y lo expone como `nuncaDecirRules` para que
 * el orquestador del sub-loop lo pase a `checkNuncaDecir()` en outcome 'canonical' (D-51).
 *
 * Retorna up to 3 hits ordenados por similarity desc (cosine distance asc).
 */
export function kbSearchTool(ctx: KbSearchContext) {
  return tool({
    description:
      'Search the curated Somnio v4 knowledge base via vector similarity. ' +
      'Returns up to 3 hits with topic, canonical response (verbatim text to quote), ' +
      'NUNCA-decir rules (forbidden statements), and similarity score. ' +
      'Use this when the user asks something the state machine cannot resolve.',
    inputSchema: z.object({
      query: z.string().describe('User message or sub-question to look up'),
      category: z
        .enum(['product', 'policies', 'edge-cases', 'faqs-no-templated'])
        .optional()
        .describe('Optional: scope search to a category'),
    }),
    async execute({ query, category }): Promise<KbHit[]> {
      const queryEmbedding = await generateEmbedding(query)
      const supabase = createAdminClient()

      // RPC `match_knowledge_base` creada en Plan 02 (Wave 0, ya aplicada en prod).
      // RETURNS columns: topic, canonical_response, nunca_decir, escalate_triggers,
      // related_topics, category, distance.
      const { data, error } = await supabase.rpc('match_knowledge_base', {
        p_workspace_id: ctx.workspaceId,
        p_agent_id: SOMNIO_V4_AGENT_ID,
        p_query_embedding: queryEmbedding,
        p_category: category ?? null,
        p_limit: 3,
      })

      if (error) {
        // Si la RPC falla en runtime, propagamos al sub-loop que decidirá no_match
        // (handoff humano via D-57). NO fallback a SELECT directo — el HNSW index
        // está diseñado para usarse vía esta RPC.
        throw new Error(`kb_search rpc failed: ${error.message}`)
      }

      // Map RPC rows → KbHit[]. nunca_decir viene del DB column directamente (W-09).
      return (data ?? []).map((row: any) => ({
        topic: row.topic,
        canonicalResponse: row.canonical_response,
        nuncaDecirRules: (row.nunca_decir as string[] | null) ?? [],
        relatedTopics: row.related_topics ?? [],
        category: row.category,
        similarity: 1 - row.distance,
      }))
    },
  })
}
```

**Anti-patterns aplicados:**
- Pitfall 2: workspaceId de ctx, no en inputSchema
- Pitfall 8: dependencia del HNSW index (creado en Plan 01) accedido vía RPC creado en Plan 02
- D-24: cero imports somnio-v3
- RESEARCH Anti-pattern: NO cachear resultados en module scope
- W-09: cero parsing de NUNCA-decir desde markdown — la columna DB es la fuente de verdad

**Nota arquitectural (B-01):** Plan 05 NO crea ninguna migración SQL. La RPC `match_knowledge_base` existe en prod desde Plan 02 (Wave 0 HALT consolidado). Si el executor de Plan 05 encuentra que la RPC no existe en runtime, indica que Plan 02 no se aplicó — pedir al usuario aplicar Plan 02 antes de ejecutar Plan 05.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -q "tool({" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -q "ctx.workspaceId" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -q "row.nunca_decir" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && grep -q "match_knowledge_base" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts && [ "$(grep -E 'inputSchema.*workspaceId|workspaceId.*z\.string' src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts | wc -l)" = "0" ] && [ "$(grep -c 'parseNuncaDecirFromCanonical' src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe e importa `tool` de `'ai'`
    - `inputSchema` NO contiene `workspaceId` (Pitfall 2)
    - `ctx.workspaceId` se usa en el cuerpo
    - Importa `generateEmbedding` desde `../knowledge-base/embed`
    - Usa `supabase.rpc('match_knowledge_base', ...)` (Plan 02 RPC)
    - Lee `row.nunca_decir` directamente del RPC result (W-09 — sin función `parseNuncaDecirFromCanonical`)
    - Cero imports somnio-v3
    - `pnpm typecheck` ok (puede haber warning si rpc no tipada — aceptable)
  </acceptance_criteria>
  <done>kb_search tool listo, lee nunca_decir desde DB column.</done>
</task>

<task type="auto">
  <name>Task 3: nunca-decir-check.ts + prompt.ts</name>
  <files>src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts, src/lib/agents/somnio-v4/sub-loop/prompt.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "sub-loop/nunca-decir-check.ts" — pattern verbatim)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (§Example 5)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-50, D-51, D-62)
  </read_first>
  <action>
**A) `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`** (RESEARCH §Example 5 + PATTERNS sección 14):

```typescript
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'

const CheckSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

/**
 * D-51: post-gen check Haiku que valida si `candidateText` viola alguna regla `NUNCA decir`.
 * D-50: solo se invoca en outcomes 'canonical' del sub-loop (verbatim del KB).
 * Latencia ~150ms.
 *
 * Early-return si rules vacío — no consume tokens innecesarios.
 *
 * W-09: las rules vienen ahora de `result.nunca_decir` del RPC (DB column), no de parsing
 * del canonical. Cuando el doc tiene `## NUNCA decir`, las rules están pobladas y el check
 * se ejecuta con datos reales (vs V1 anterior que retornaba [] siempre y la check era no-op).
 */
export async function checkNuncaDecir(args: {
  candidateText: string
  nuncaDecirRules: string[]
}): Promise<{ ok: boolean; violation?: string }> {
  if (args.nuncaDecirRules.length === 0) return { ok: true }

  const { output } = await runWithPurpose('subloop_nunca_decir', () =>
    generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system:
        'You are a content compliance checker. Return whether the candidate text violates any of the given rules.',
      messages: [
        {
          role: 'user',
          content:
            `Candidate response: """${args.candidateText}"""\n\n` +
            `Forbidden rules (NUNCA decir):\n` +
            args.nuncaDecirRules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
            `\n\nReturn { violates: bool, violatedRule?: string }.`,
        },
      ],
      output: Output.object({ schema: CheckSchema }),
    })
  )

  return output.violates
    ? { ok: false, violation: output.violatedRule }
    : { ok: true }
}
```

**B) `src/lib/agents/somnio-v4/sub-loop/prompt.ts`**:

```typescript
import type { SubLoopReason } from './output-schema'

/**
 * System prompt builder por SubLoopReason (D-02).
 * Cada reason produce un prompt focalizado: pocos tools (D-09 — 3-5 max), instrucción clara,
 * ejemplos de output esperado.
 *
 * Importante: el output SIEMPRE debe ser un LoopOutcome estructurado (D-62) — el prompt lo deja claro.
 */
export function buildSubLoopPrompt(reason: SubLoopReason): string {
  const common =
    `Eres el sub-loop del agente conversacional Somnio v4. ` +
    `Tu trabajo es decidir cómo responder al cliente cuando el state machine no pudo. ` +
    `Tienes ESTRICTAMENTE 3 opciones de output (LoopOutcome):\n` +
    `  1) status='template' → seleccionar un template existente del catálogo Somnio v4. ` +
    `Devuelves su intent en responseTemplate.\n` +
    `  2) status='canonical' → consultar el KB con kb_search, encontrar un hit relevante, ` +
    `y devolver canonicalText VERBATIM de la sección "Respuesta canónica" del topic. ` +
    `NUNCA inventes texto: si el hit no aplica, escala a no_match.\n` +
    `  3) status='no_match' → handoff humano. Usar cuando ningún tool resuelve. ` +
    `responseTemplate='handoff_humano' literal.\n\n` +
    `NUNCA generes freeText. NUNCA cites secciones "## NUNCA decir" ni "## Sources". ` +
    `Toda respuesta al cliente o sale de templates aprobados o sale de canonicalText verbatim.`

  switch (reason) {
    case 'low_confidence':
      return (
        common +
        `\n\nReason actual: low_confidence. ` +
        `El comprehension Haiku no pudo clasificar con certeza el mensaje del cliente. ` +
        `Usa kb_search agresivamente (varias queries con sinónimos si hace falta). ` +
        `Si KB no tiene topic relevante, no_match.`
      )
    case 'razonamiento_libre':
      return (
        common +
        `\n\nReason actual: razonamiento_libre. ` +
        `El cliente dijo algo fuera del flujo de venta (filosofía, anécdotas, divagaciones). ` +
        `Si KB tiene topic relevante (ej. preguntas tangenciales sobre el sueño), úsalo. ` +
        `Si no aplica, no_match (handoff suave).`
      )
    case 'crm_mutation':
      return (
        common +
        `\n\nReason actual: crm_mutation. ` +
        `El state machine quiere ejecutar una mutación CRM (createOrder/updateOrder/moveOrderToStage/etc.). ` +
        `Verifica precondiciones con getActiveOrderByPhone si es necesario. ` +
        `Si la mutación falla con stage_changed_concurrently → no_match (handoff). ` +
        `Si succeed → status='template' apuntando al template apropiado (pendiente_*).`
      )
    case 'cas_reject':
      return (
        common +
        `\n\nReason actual: cas_reject. ` +
        `Una mutación moveOrderToStage retornó stage_changed_concurrently (otra fuente movió el pedido). ` +
        `Re-leer el estado del pedido con getActiveOrderByPhone, decidir si re-intentar el move ` +
        `o escalar a humano (no_match). NO reintentes en loop — máximo 1 retry.`
      )
  }
}
```

**Anti-patterns aplicados:**
- D-09: scope acotado por reason — el prompt no le da autonomía amplia
- D-50: "VERBATIM" en mayúsculas; NUNCA cites NUNCA-decir/Sources
- D-62: NUNCA freeText
- Pitfall mutation-tools 1: cas_reject NO retry implícito (max 1)
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && grep -q "args.nuncaDecirRules.length === 0" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && grep -q "Output.object({ schema: CheckSchema })" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && test -f src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -q "buildSubLoopPrompt" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -q "low_confidence" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -q "cas_reject" src/lib/agents/somnio-v4/sub-loop/prompt.ts</automated>
  </verify>
  <acceptance_criteria>
    - `nunca-decir-check.ts` early-return cuando rules vacío
    - Usa `Output.object({ schema: CheckSchema })`
    - Wrap en `runWithPurpose('subloop_nunca_decir', ...)`
    - `prompt.ts` exporta `buildSubLoopPrompt(reason)`
    - Prompt contiene literal "VERBATIM" o "verbatim"
    - Prompt cubre los 4 reasons (low_confidence, razonamiento_libre, crm_mutation, cas_reject)
  </acceptance_criteria>
  <done>NUNCA-decir check + prompts listos.</done>
</task>

<task type="auto">
  <name>Task 4: tools.ts (factory por reason) + index.ts (runSubLoop)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/tools.ts, src/lib/agents/somnio-v4/sub-loop/index.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "sub-loop/tools.ts" + "sub-loop/index.ts")
    - .claude/skills/crm-query-tools.md (factory createCrmQueryTools)
    - .claude/skills/crm-mutation-tools.md (factory createCrmMutationTools)
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts, kb-search-tool.ts, prompt.ts, nunca-decir-check.ts (creados arriba)
    - src/lib/agents/shared/crm-mutation-tools/index.ts (factory shape)
    - src/lib/agents/shared/crm-query-tools/index.ts (factory shape)
  </read_first>
  <action>
**A) `src/lib/agents/somnio-v4/sub-loop/tools.ts`** (PATTERNS sección 13):

```typescript
import { kbSearchTool } from './kb-search-tool'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import type { SubLoopReason } from './output-schema'
import { SOMNIO_V4_AGENT_ID } from '../config'

export interface SubLoopToolsContext {
  workspaceId: string
  conversationId: string
  sessionId: string
}

/**
 * Factory de tool dict por SubLoopReason (D-09 — 3-5 tools por scope).
 * Plan-local: instancia las factories CADA llamada (RESEARCH Anti-pattern: no module-scope cache).
 */
export function buildSubLoopTools(reason: SubLoopReason, ctx: SubLoopToolsContext) {
  const queryTools = createCrmQueryTools({
    workspaceId: ctx.workspaceId,
    invoker: SOMNIO_V4_AGENT_ID,
  })
  const mutationTools = createCrmMutationTools({
    workspaceId: ctx.workspaceId,
    invoker: SOMNIO_V4_AGENT_ID,
  })

  switch (reason) {
    case 'low_confidence':
    case 'razonamiento_libre':
      return {
        kb_search: kbSearchTool({ workspaceId: ctx.workspaceId }),
      }

    case 'crm_mutation':
      // D-19 set mínimo de 5 mutations + 1 query relevante
      return {
        kb_search: kbSearchTool({ workspaceId: ctx.workspaceId }),
        getActiveOrderByPhone: queryTools.getActiveOrderByPhone,
        createOrder: mutationTools.createOrder,
        updateOrder: mutationTools.updateOrder,
        moveOrderToStage: mutationTools.moveOrderToStage,
        addOrderNote: mutationTools.addOrderNote,
        updateContact: mutationTools.updateContact,
      }

    case 'cas_reject':
      return {
        kb_search: kbSearchTool({ workspaceId: ctx.workspaceId }),
        getActiveOrderByPhone: queryTools.getActiveOrderByPhone,
        moveOrderToStage: mutationTools.moveOrderToStage,
      }
  }
}
```

**B) `src/lib/agents/somnio-v4/sub-loop/index.ts`** (RESEARCH §Pattern 2 + PATTERNS sub-loop/index.ts):

```typescript
import { generateText, Output, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { LoopOutcomeSchema, type LoopOutcome, type SubLoopReason } from './output-schema'
import { buildSubLoopTools, type SubLoopToolsContext } from './tools'
import { buildSubLoopPrompt } from './prompt'
import { checkNuncaDecir } from './nunca-decir-check'
import { SOMNIO_V4_AGENT_ID } from '../config'

export interface SubLoopContext extends SubLoopToolsContext {
  /** Mensaje actual del cliente. */
  userMessage: string
  /** Últimos N turnos para contexto del modelo (recomendado 4-6). */
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Entrypoint del sub-loop.
 * D-01: solo se invoca bajo triggers D-02. NO es el path por defecto.
 * D-09: Haiku, 3-5 tools, stopWhen=stepCountIs(4), latencia objetivo ~600ms-1.5s.
 * D-62: output ESTRICTAMENTE LoopOutcome (template/canonical/no_match) — sin freeText.
 *       D-62 enforced por Output.object() schema, NO por toolChoice — see RESEARCH §Pattern 2 line 406.
 * D-51: si outcome canonical, post-gen NUNCA-decir check (latencia +150ms).
 *       W-09: rules vienen de `output.nuncaDecirRules` que el LLM copió del kb_search hit.nuncaDecirRules
 *       (que a su vez vienen del DB column nunca_decir vía RPC match_knowledge_base).
 */
export async function runSubLoop(args: {
  reason: SubLoopReason
  ctx: SubLoopContext
}): Promise<LoopOutcome> {
  const tools = buildSubLoopTools(args.reason, args.ctx)

  const { output } = await runWithPurpose('subloop', () =>
    generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: buildSubLoopPrompt(args.reason),
      messages: [
        ...args.ctx.recentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: args.ctx.userMessage },
      ],
      tools,
      // D-62 enforced by Output.object() schema, not toolChoice — see RESEARCH §Pattern 2 line 406.
      // 'required' would block the structured output final step.
      toolChoice: 'auto',
      stopWhen: stepCountIs(4),     // 1 KB search + 1 CRM call + 1 final → margen 4
      output: Output.object({ schema: LoopOutcomeSchema }),
    })
  )

  // D-51: post-gen NUNCA-decir check solo en canonical
  if (output.status === 'canonical') {
    const rules = output.nuncaDecirRules ?? []
    const check = await checkNuncaDecir({
      candidateText: output.canonicalText,
      nuncaDecirRules: rules,
    })
    if (!check.ok) {
      // Forzar handoff humano (D-51)
      const escalated: LoopOutcome = {
        status: 'no_match',
        responseTemplate: 'handoff_humano',
        requiresHuman: true,
        reason: `nunca_decir_violation: ${check.violation ?? 'unspecified'}`,
        knowledgeQueried: [output.sourceTopic],
      }
      getCollector()?.recordEvent('pipeline_decision', 'subloop_nunca_decir_violation', {
        agent: SOMNIO_V4_AGENT_ID,
        reason: args.reason,
        sourceTopic: output.sourceTopic,
        violation: check.violation ?? null,
      })
      return escalated
    }
  }

  // Observability D-58 (D-2 family)
  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    outcome: output.status,
    sourceTopic: output.status === 'canonical' ? output.sourceTopic : null,
    requiresHuman: output.requiresHuman,
  })

  return output
}
```

**Anti-patterns aplicados:**
- NO `generateObject` (deprecated AI SDK v6) — usamos `generateText + Output.object()`
- NO `toolChoice: 'required'` — bloquea el structured output final (W-06 — comentario explícito)
- NO `stopWhen` > 4 — D-09 scope acotado
- D-24: cero imports somnio-v3
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/tools.ts && test -f src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "buildSubLoopTools" src/lib/agents/somnio-v4/sub-loop/tools.ts && grep -q "createCrmQueryTools" src/lib/agents/somnio-v4/sub-loop/tools.ts && grep -q "createCrmMutationTools" src/lib/agents/somnio-v4/sub-loop/tools.ts && grep -q "stopWhen: stepCountIs(4)" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "Output.object({ schema: LoopOutcomeSchema })" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "checkNuncaDecir" src/lib/agents/somnio-v4/sub-loop/index.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/ | wc -l)" = "0" ]    <automated>test -f src/lib/agents/somnio-v4/sub-loop/tools.ts && test -f src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "buildSubLoopTools" src/lib/agents/somnio-v4/sub-loop/tools.ts && grep -q "stopWhen: stepCountIs(4)" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "Output.object({ schema: LoopOutcomeSchema })" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "checkNuncaDecir" src/lib/agents/somnio-v4/sub-loop/index.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/ | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - `tools.ts` switch sobre 4 reasons con tool subsets distintos
    - `tools.ts` usa `invoker: SOMNIO_V4_AGENT_ID`
    - `index.ts` usa `generateText + Output.object + stopWhen=stepCountIs(4) + toolChoice='auto'`
    - `index.ts` invoca `checkNuncaDecir` solo en canonical
    - Cero imports somnio-v3
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>runSubLoop entrypoint funcional.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Tests output-schema + kb-search-tool + commit + push (autónomo, B-01 fix)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts, src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
    - src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-62)
  </read_first>
  <behavior>
    output-schema.test.ts:
    - Test 1: válido template → parses ok
    - Test 2: válido canonical con sourceTopic → parses ok
    - Test 3: válido no_match con responseTemplate=handoff_humano → parses ok
    - Test 4: no_match con responseTemplate≠handoff_humano → throws (D-57 literal)
    - Test 5: payload con `freeText:'foo'` → throws (D-62 — sin variante)
    - Test 6: canonical con requiresHuman=true → throws (canonical es false estructural)

    kb-search-tool.test.ts:
    - Test 1: tool() retornado tiene description, inputSchema, execute
    - Test 2: inputSchema NO acepta workspaceId (Pitfall 2)
    - Test 3: factory invocado con ctx={workspaceId:'foo'} captura ese valor en cierre
    - Test 4 (W-09): mock RPC retorna fila con `nunca_decir: ['regla 1', 'regla 2']` → KbHit.nuncaDecirRules === ['regla 1', 'regla 2']
    - Test 5 (W-09): mock RPC retorna fila con `nunca_decir: null` → KbHit.nuncaDecirRules === [] (fallback)
  </behavior>
  <action>
1. Crear los tests (vitest). Mock supabase admin client + generateEmbedding.

2. Ejecutar:
```bash
pnpm vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/
pnpm typecheck
```

3. Commit + push (PUSH INMEDIATO — Plan 05 es autónomo, B-01 fix):
```bash
git add src/lib/agents/somnio-v4/sub-loop/
git commit -m "feat(somnio-v4): plan-05 — sub-loop infra (output schema + kb_search + nunca-decir + runSubLoop)

- output-schema.ts: Zod discriminated union template/canonical/no_match (D-62 sin freeText)
- kb-search-tool.ts: AI SDK tool wrapping pgvector via match_knowledge_base RPC
  - W-09: lee nunca_decir directamente del RPC result (DB column, sin parsing canonical)
- nunca-decir-check.ts: post-gen Haiku validator con early-return (D-51)
- prompt.ts: 4 system prompts por SubLoopReason (D-02)
- tools.ts: factory por reason — tool subset (D-09)
- index.ts: runSubLoop con generateText + Output.object + stopWhen=stepCountIs(4)
  - W-06: comentario explícito sobre por qué toolChoice='auto' (D-62 enforced by schema)

Tests: 11 unit tests pasando.
D-24 verificado: cero imports desde @/lib/agents/somnio-v3/*
Pitfall 2 verificado: workspaceId NUNCA en inputSchemas

B-01 fix: Plan 05 es 100% autónomo. RPC match_knowledge_base vive en Plan 02 (Wave 0).
W-09 fix: nunca_decir leído del DB column directamente, post-gen check funcional desde día 1.
W-06 fix: comentario explicando D-62 enforcement vs toolChoice.

Standalone: somnio-sales-v4
Decisions: D-01, D-02, D-09, D-13, D-19, D-50, D-51, D-57, D-62

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/ --reporter=basic 2>&1 | grep -E "Test Files.*passed" && git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-05"</automated>
  </verify>
  <acceptance_criteria>
    - 11 tests pasan (6 schema + 5 kb-search-tool incluyendo W-09)
    - Commit local con mensaje plan-05
    - Push completo (no requiere HALT — B-01 fix)
    - Vercel deploy ok
  </acceptance_criteria>
  <done>Sub-loop infra completa y deployada, completamente autónoma.</done>
</task>

</tasks>

<verification>
- LoopOutcomeSchema rechaza payloads con `freeText`
- `match_knowledge_base` RPC existe en prod (creado por Plan 02 Wave 0)
- `kb-search-tool.ts` lee `row.nunca_decir` directamente (W-09 verificable via grep)
- `pnpm typecheck` exits 0
- D-24: cero imports somnio-v3
- Pitfall 2: cero `workspaceId` en inputSchemas
- B-01: Plan 05 sin migration files, sin HALT (verificable via files_modified)
</verification>

<success_criteria>
- Plan 06 (state machine + comprehension) puede llamar `runSubLoop({reason, ctx})` sin scaffolding adicional
- Plan 09 (clustering Inngest) puede consumir `match_knowledge_base` también si decide reusar (no obligatorio)
- Post-gen NUNCA-decir check funciona con datos reales desde día 1 (W-09)
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/05-SUMMARY.md` con:
- Tests output (11/11 passed)
- Hash commit
- Confirmación grep `row.nunca_decir` en kb-search-tool.ts (W-09)
- Confirmación que NO existe `parseNuncaDecirFromCanonical` (W-09 — eliminado)
</output>
