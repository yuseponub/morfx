import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseKbDoc } from './parser'
import { coherenceCheck } from './coherence-check'
import { generateEmbedding } from './embed'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from '../config'

export { SOMNIO_WORKSPACE_ID }
export { generateEmbedding }

export interface SyncResult {
  filePath: string
  topic: string
  action: 'inserted' | 'updated_meta_only' | 'updated_with_embedding' | 'skipped_no_change'
}

/**
 * Sincroniza un único archivo .md con la tabla agent_knowledge_base.
 * Hash SHA-256 del body — skip embedding regeneration si hash no cambió (Pitfall 7).
 * Frontmatter changes solamente → re-upsert metadata, embedding cacheado.
 *
 * W-09 / D-51: persiste `parsed.sections.nuncaDecir` en la columna `nunca_decir TEXT[]`
 * (creada por Plan 01). Plan 05 kb-search-tool lee esta columna desde el RPC y la
 * pasa al post-gen check del sub-loop.
 */
export async function syncKbDoc(filePath: string, raw: string): Promise<SyncResult> {
  const parsed = parseKbDoc(raw, filePath)
  coherenceCheck(filePath, parsed.frontmatter.category)

  const bodyHash = createHash('sha256').update(parsed.body).digest('hex')
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('agent_knowledge_base')
    .select('id, body_hash, embedding')
    .eq('topic', parsed.frontmatter.topic)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('workspace_id', SOMNIO_WORKSPACE_ID)
    .maybeSingle()

  let embedding: number[]
  let action: SyncResult['action']
  if (existing && existing.body_hash === bodyHash) {
    embedding = existing.embedding as number[]
    action = 'updated_meta_only' // body sin cambios; metadata puede haber cambiado
  } else {
    embedding = await generateEmbedding(parsed.body)
    action = existing ? 'updated_with_embedding' : 'inserted'
  }

  const upsertPayload = {
    workspace_id: SOMNIO_WORKSPACE_ID,
    agent_id: SOMNIO_V4_AGENT_ID,
    topic: parsed.frontmatter.topic,
    keywords: parsed.frontmatter.keywords,
    category: parsed.frontmatter.category,
    embedding,
    canonical_response: parsed.sections.canonica ?? null,
    nunca_decir: parsed.sections.nuncaDecir, // W-09: alimenta post-gen check (Plan 05)
    escalate_triggers: parsed.frontmatter.escalate_if ?? [],
    related_topics: parsed.frontmatter.related_topics ?? [],
    source_md_path: filePath,
    body_hash: bodyHash,
    last_reviewed_at: parsed.frontmatter.last_reviewed,
    reviewed_by: parsed.frontmatter.reviewed_by,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('agent_knowledge_base')
    .upsert(upsertPayload, { onConflict: 'topic,agent_id,workspace_id' })

  if (error) throw new Error(`upsert failed for ${filePath}: ${error.message}`)

  return { filePath, topic: parsed.frontmatter.topic, action }
}
