import OpenAI from 'openai'

let client: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada')
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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
