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
 * (creada por Plan 01 v4). Plan 05 kb-search-tool lee esta columna desde el RPC y la
 * pasa al post-gen check del sub-loop.
 *
 * Standalone somnio-v4-rag-generative Plan 01 (D-24):
 *   - canonical_response = null (deprecated para somnio-v4; otros agentes pueden usarlo).
 *   - Persiste 5 columnas nuevas: hechos_del_producto, posicion_del_negocio,
 *     debe_contener, cuando_escalar, tone_override (D-01 #2..#6 + D-05).
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
    // D-24: canonical-verbatim eliminado para somnio-v4. La columna queda en la tabla
    // por backwards-compat con otros agentes, pero somnio-v4 deja de poblarla.
    canonical_response: null,
    nunca_decir: parsed.sections.nuncaDecir, // W-09: alimenta post-gen check (Plan 05)
    // D-01 #2..#6 (RAG-generative): material fuente que el modelo de generación
    // (Plan 03) consume para redactar respuestas adaptadas.
    hechos_del_producto: parsed.sections.hechosDelProducto,
    posicion_del_negocio: parsed.sections.posicionDelNegocio,
    debe_contener: parsed.sections.debeContener,
    cuando_escalar: parsed.sections.cuandoEscalar,
    // D-05: override opcional del Tono Somnio global (per-topic).
    tone_override: parsed.frontmatter.tone_override ?? null,
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
