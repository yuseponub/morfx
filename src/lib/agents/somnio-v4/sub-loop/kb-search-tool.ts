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
  /**
   * W-09: viene directo del DB column `nunca_decir TEXT[]` vía RPC `match_knowledge_base`.
   * NO se parsea desde canonical_response — la columna del DB es la única fuente de
   * verdad (ver Plan 04 sync.ts), eliminado todo parser markdown previo.
   */
  nuncaDecirRules: string[]
  relatedTopics: string[]
  category: string
  similarity: number
}

/**
 * AI SDK tool factory para búsqueda en `agent_knowledge_base`.
 *
 * Pitfall 2 (mutation-tools): `workspaceId` viene de `ctx`, NUNCA del input.
 * Pitfall 8 (RESEARCH): pgvector cosine accedido vía RPC `match_knowledge_base`
 *                        (creada en Plan 02, usa HNSW index del Plan 01).
 *
 * W-09: el RPC retorna `nunca_decir TEXT[]` como columna dedicada (Plan 01 schema +
 *       Plan 02 RPC RETURNS). `kbSearchTool` lee este array directamente y lo expone
 *       como `nuncaDecirRules` para que el orquestador del sub-loop lo pase a
 *       `checkNuncaDecir()` en outcome 'canonical' (D-51).
 *
 * Anti-patterns aplicados:
 * - NO cachear resultados en module scope (RESEARCH Anti-pattern; D-19 query-tools).
 * - NO `workspaceId` en `inputSchema` (Pitfall 2).
 * - NO parser markdown de "## NUNCA decir" — la columna DB es la fuente (W-09).
 * - NO imports desde `@/lib/agents/somnio-v3/*` (D-24).
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
      const t0 = Date.now()
      const queryEmbedding = await generateEmbedding(query)
      const tEmbed = Date.now() - t0
      const supabase = createAdminClient()

      // RPC `match_knowledge_base` creada en Plan 02 (Wave 0).
      // RETURNS columns: topic, canonical_response, nunca_decir, escalate_triggers,
      // related_topics, category, distance.
      const tRpc0 = Date.now()
      const { data, error } = await supabase.rpc('match_knowledge_base', {
        p_workspace_id: ctx.workspaceId,
        p_agent_id: SOMNIO_V4_AGENT_ID,
        p_query_embedding: queryEmbedding,
        p_category: category ?? null,
        p_limit: 3,
      })
      const tRpc = Date.now() - tRpc0

      if (error) {
        // Iter 7e: log error case too.
        console.log('[kb_search]', JSON.stringify({
          query, category: category ?? null, error: error.message, tEmbedMs: tEmbed, tRpcMs: tRpc,
        }))
        // Si la RPC falla en runtime, propagamos al sub-loop que decidirá no_match
        // (handoff humano vía D-57). NO fallback a SELECT directo — el HNSW index
        // está diseñado para usarse vía esta RPC.
        throw new Error(`kb_search rpc failed: ${error.message}`)
      }

      // Map RPC rows → KbHit[]. nunca_decir viene del DB column directamente (W-09).
      const hits = (data ?? []).map((row: any) => ({
        topic: row.topic,
        canonicalResponse: row.canonical_response,
        nuncaDecirRules: (row.nunca_decir as string[] | null) ?? [],
        relatedTopics: row.related_topics ?? [],
        category: row.category,
        similarity: 1 - Number(row.distance),
      }))

      // Iter 7e: structured log for Vercel logs grep. Capturamos query + category
      // + cuántos hits volvieron + top 3 con topic+similarity. Asi podemos ver
      // EXACTAMENTE qué llamó GPT-4o mini y qué le devolvio la RPC.
      console.log('[kb_search]', JSON.stringify({
        query,
        category: category ?? null,
        hitCount: hits.length,
        topHits: hits.map((h: KbHit) => ({ topic: h.topic, category: h.category, similarity: Number(h.similarity.toFixed(4)) })),
        tEmbedMs: tEmbed,
        tRpcMs: tRpc,
      }))

      return hits
    },
  })
}
