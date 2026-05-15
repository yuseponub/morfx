import OpenAI from 'openai'

let client: OpenAI | null = null

/**
 * Iter 7h fix: el sub-loop runtime corre en Vercel donde solo existe
 * `OPENAI_API_KEY_SALESV4` (la legacy `OPENAI_API_KEY` no está set en prod).
 * Sin fallback, `kb_search.execute()` throwea ANTES de llamar la RPC → el
 * modelo recibe tool-error y emite no_match aunque KB tenga contenido.
 *
 * Orden de preferencia:
 *   1. OPENAI_API_KEY_SALESV4 (key sandboxed del sub-loop V4)
 *   2. OPENAI_API_KEY (legacy, usada por sync script local)
 *
 * Ambos paths (sync + sub-loop) usan el MISMO embedding model
 * (text-embedding-3-small 1536). Si las keys pertenecen al mismo account
 * OpenAI, los embeddings son intercambiables.
 */
function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4 ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        'No OpenAI key configured (tried OPENAI_API_KEY_SALESV4 then OPENAI_API_KEY)'
      )
    }
    client = new OpenAI({ apiKey })
  }
  return client
}

/**
 * Genera embedding 1536-dim para `text` con OpenAI text-embedding-3-small.
 * Reusable por sync (Plan 04) y kb-search-tool del sub-loop (Plan 05).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const r = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  return r.data[0].embedding
}
