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
  /**
   * DEPRECATED para somnio-v4 (post-Plan 02 RAG-generative). El sub-loop nuevo
   * NO usa canonicalResponse — la respuesta la redacta Gemini Flash usando el
   * material parseado (hechosDelProducto/posicionDelNegocio/debeContener). El
   * field sigue en el DB schema (backwards compat) pero el sub-loop lo ignora.
   */
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
  // NUEVAS columnas RAG-generative (Plan 01 RPC RETURNS update + Plan 02 KB rewrite):
  hechosDelProducto: string | null
  posicionDelNegocio: string | null
  debeContener: string[]
  cuandoEscalar: string[]
  toneOverride: string | null
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
 * Iter 7i (Q1 Opción B): `category` removido del inputSchema. El modelo asignaba
 *   semánticas literales a los enum values (ej. interpretaba `faqs-no-templated`
 *   como "preguntas sin template") y filtraba topics relevantes que vivían en otra
 *   categoría (ej. `interaccion_alcohol` en `edge-cases` quedaba invisible). La
 *   búsqueda ahora siempre escanea todas las categorías; el ranking por similarity
 *   top-3 ya filtra correctamente con 18 topics. `category` se mantiene en DB
 *   schema (D-47/D-48 source organization) y se expone en el output `KbHit.category`
 *   para que el orquestador y los logs lo vean.
 *
 * Anti-patterns aplicados:
 * - NO cachear resultados en module scope (RESEARCH Anti-pattern; D-19 query-tools).
 * - NO `workspaceId` en `inputSchema` (Pitfall 2).
 * - NO `category` en `inputSchema` (Iter 7i Opción B — model misuse).
 * - NO parser markdown de "## NUNCA decir" — la columna DB es la fuente (W-09).
 * - NO imports desde `@/lib/agents/somnio-v3/*` (D-24).
 *
 * Retorna up to 3 hits ordenados por similarity desc (cosine distance asc).
 */
export function kbSearchTool(ctx: KbSearchContext) {
  return tool({
    description:
      'Search the curated Somnio v4 knowledge base via vector similarity across ALL categories. ' +
      'Returns up to 3 hits with topic, canonical response (verbatim text to quote), ' +
      'NUNCA-decir rules (forbidden statements), and similarity score. ' +
      'Use this when the user asks something the state machine cannot resolve.',
    inputSchema: z.object({
      query: z.string().describe('User message or sub-question to look up'),
    }),
    async execute({ query }): Promise<KbHit[]> {
      const t0 = Date.now()
      const queryEmbedding = await generateEmbedding(query)
      const tEmbed = Date.now() - t0
      const supabase = createAdminClient()

      // RPC `match_knowledge_base` creada en Plan 02 (Wave 0).
      // RETURNS columns: topic, canonical_response, nunca_decir, escalate_triggers,
      // related_topics, category, distance.
      // Iter 7i: p_category siempre null — escaneamos todas las categorías.
      const tRpc0 = Date.now()
      const { data, error } = await supabase.rpc('match_knowledge_base', {
        p_workspace_id: ctx.workspaceId,
        p_agent_id: SOMNIO_V4_AGENT_ID,
        p_query_embedding: queryEmbedding,
        p_category: null,
        p_limit: 3,
      })
      const tRpc = Date.now() - tRpc0

      if (error) {
        console.log('[kb_search]', JSON.stringify({
          query, error: error.message, tEmbedMs: tEmbed, tRpcMs: tRpc,
        }))
        // Si la RPC falla en runtime, propagamos al sub-loop que decidirá no_match
        // (handoff humano vía D-57). NO fallback a SELECT directo — el HNSW index
        // está diseñado para usarse vía esta RPC.
        throw new Error(`kb_search rpc failed: ${error.message}`)
      }

      // Map RPC rows → KbHit[]. nunca_decir viene del DB column directamente (W-09).
      // Plan 03 (RAG-generative): 5 columnas nuevas (hechos_del_producto, posicion_del_negocio,
      // debe_contener, cuando_escalar, tone_override) — el RPC RETURNS las expone post-Plan 01.
      const hits = (data ?? []).map((row: any) => ({
        topic: row.topic,
        canonicalResponse: row.canonical_response,
        nuncaDecirRules: (row.nunca_decir as string[] | null) ?? [],
        relatedTopics: row.related_topics ?? [],
        category: row.category,
        similarity: 1 - Number(row.distance),
        // NUEVAS (Plan 01 + Plan 02 schema + reescritura KB markdown):
        hechosDelProducto: row.hechos_del_producto ?? null,
        posicionDelNegocio: row.posicion_del_negocio ?? null,
        debeContener: (row.debe_contener as string[] | null) ?? [],
        cuandoEscalar: (row.cuando_escalar as string[] | null) ?? [],
        toneOverride: row.tone_override ?? null,
      }))

      // Iter 7e: structured log for Vercel logs grep. Capturamos query + cuántos hits
      // volvieron + top 3 con topic+category+similarity. La category sigue en el output
      // (no en el input) para validar qué bucket terminó ganando el ranking.
      console.log('[kb_search]', JSON.stringify({
        query,
        hitCount: hits.length,
        topHits: hits.map((h: KbHit) => ({ topic: h.topic, category: h.category, similarity: Number(h.similarity.toFixed(4)) })),
        tEmbedMs: tEmbed,
        tRpcMs: tRpc,
      }))

      return hits
    },
  })
}
