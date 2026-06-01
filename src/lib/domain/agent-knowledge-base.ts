// ============================================================================
// Domain Layer — Agent Knowledge Base (Regla 3)
// Single source of truth for mutations on `agent_knowledge_base`.
//
// Standalone: ui-agent-content-editor — Plan 04 (Wave 2).
//
// Context:
//   After D-01 the DB is the KB source of truth and the UI re-embeds on save.
//   This domain re-targets the existing sync stack (`generateEmbedding` +
//   sha256 hash-guard, see sync.ts:42-64) from `.md`-driven to DB-column-driven
//   via the canonical serializer locked in Plan 01 (buildContentToEmbed).
//
// Decisions enforced here:
//   - Pitfall 2: agent_knowledge_base has NO RLS — every query MUST carry
//     .eq('workspace_id', ctx.workspaceId).eq('agent_id', agentId). The domain
//     filter is the ONLY cross-workspace / cross-agent isolation guard.
//   - D-02 / Regla 6: ONLY agent_id='somnio-sales-v4' is mutable. Reads are
//     allowed for ANY agent (D-04).
//   - D-06: synchronous re-embed. contentToEmbed is built via the canonical
//     serializer and embedded BEFORE the DB write. On OpenAI failure NOTHING is
//     written (the live row stays untouched) — no partial write (stale embedding
//     paired with new text).
//   - D-01b: every save (update/restore) snapshots the CURRENT row into
//     agent_knowledge_base_versions before overwriting it. Restore is itself
//     reversible (it snapshots current state first).
//   - D-09: createKbTopic embeds then inserts + writes a version_num=1 baseline.
//   - D-10: scope_summary + keywords are editable; scope_summary feeds the
//     serializer so changing it shifts body_hash and forces a re-embed.
//   - Pitfall 5: UI-created rows supply synthetic NOT-NULL values
//     (source_md_path, last_reviewed_at, reviewed_by) since there is no .md file.
// ============================================================================

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'
import {
  buildContentToEmbed,
  type KbContentColumns,
} from '@/lib/agents/somnio-v4/knowledge-base/serialize'
import { generateEmbedding } from '@/lib/agents/somnio-v4/knowledge-base/embed'

// ============================================================================
// Types
// ============================================================================

/**
 * agent_knowledge_base row as edited/listed by the UI. Excludes the `embedding`
 * vector (1536 floats — large, never needed in the editor payload).
 *
 * Mirrors the live schema (RESEARCH §Domain Layer Shape — VERIFIED).
 */
export interface AgentKbRow {
  id: string
  topic: string
  category: string
  keywords: string[]
  scope_summary: string | null
  hechos_del_producto: string | null
  posicion_del_negocio: string | null
  debe_contener: string[]
  nunca_decir: string[]
  cuando_escalar: string[]
  tone_override: string | null
  escalate_triggers: string[]
  related_topics: string[]
  body_hash: string
  last_reviewed_at: string
  reviewed_by: string
  source_md_path: string
  updated_at: string
}

/**
 * agent_knowledge_base_versions row (Plan 02). Snapshot of a KB row's editable
 * fields at a point in time. NO embedding column (versions store source text;
 * embeddings are recomputed on restore via the canonical serializer).
 */
export interface KbVersionRow {
  id: string
  kb_id: string
  workspace_id: string
  agent_id: string
  topic: string
  category: string
  keywords: string[]
  scope_summary: string | null
  hechos_del_producto: string | null
  posicion_del_negocio: string | null
  debe_contener: string[]
  nunca_decir: string[]
  cuando_escalar: string[]
  tone_override: string | null
  escalate_triggers: string[]
  related_topics: string[]
  body_hash: string
  version_num: number
  edited_by: string
  created_at: string
}

/** Editable content fields shared by create / update / restore params. */
export interface KbEditableFields {
  topic: string
  category: string
  keywords: string[]
  scope_summary: string | null
  hechos_del_producto: string | null
  posicion_del_negocio: string | null
  debe_contener: string[]
  nunca_decir: string[]
  cuando_escalar: string[]
  tone_override: string | null
  escalate_triggers: string[]
  related_topics: string[]
}

// Explicit column list reused by every read (NEVER includes `embedding`).
const KB_SELECT_COLUMNS =
  'id, topic, category, keywords, scope_summary, hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar, tone_override, escalate_triggers, related_topics, body_hash, last_reviewed_at, reviewed_by, source_md_path, updated_at'

const VERSION_SELECT_COLUMNS =
  'id, kb_id, workspace_id, agent_id, topic, category, keywords, scope_summary, hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar, tone_override, escalate_triggers, related_topics, body_hash, version_num, edited_by, created_at'

// ============================================================================
// Edit-gate (D-02 / Regla 6) — ONLY somnio-sales-v4 is mutable
// ============================================================================

const EDITABLE_AGENT_ID = 'somnio-sales-v4'

/**
 * Returns a failed DomainResult if the agent is NOT editable, or `null` if it
 * is. Every mutation calls this FIRST, before touching the DB (D-02). Message
 * form matches the sibling Plan 03 (agent-templates.ts) verbatim.
 */
function assertEditable(agentId: string): DomainResult | null {
  return agentId === EDITABLE_AGENT_ID
    ? null
    : { success: false, error: 'Solo somnio-sales-v4 es editable (Regla 6 / D-02).' }
}

/** Today as YYYY-MM-DD in America/Bogota (Regla 2). Used for synthetic last_reviewed_at. */
function todayBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/** Build the canonical embedding text + sha256 hash for a set of content columns. */
function buildEmbedInput(fields: KbContentColumns): { contentToEmbed: string; bodyHash: string } {
  const contentToEmbed = buildContentToEmbed(fields)
  const bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')
  return { contentToEmbed, bodyHash }
}

// ============================================================================
// Read functions (D-04 — allowed for ANY agent, no edit-gate)
// ============================================================================

/**
 * List all KB rows for (workspace_id, agent_id), ordered category→topic.
 * Excludes the embedding vector from the payload (Task 1 — not needed in list).
 *
 * Pitfall 2: agent_knowledge_base has NO RLS — both .eq filters are MANDATORY.
 */
export async function listKbByAgent(
  ctx: DomainContext,
  agentId: string,
): Promise<DomainResult<AgentKbRow[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_knowledge_base')
    .select(KB_SELECT_COLUMNS)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', agentId) // MANDATORY
    .order('category')
    .order('topic')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as unknown as AgentKbRow[] }
}

/**
 * Fetch one KB row by id, scoped by workspace_id + agent_id. Returns an error if
 * not found. Excludes the embedding vector.
 *
 * Pitfall 2: both .eq filters are MANDATORY.
 */
export async function getKbTopic(
  ctx: DomainContext,
  kbId: string,
  agentId: string,
): Promise<DomainResult<AgentKbRow>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_knowledge_base')
    .select(KB_SELECT_COLUMNS)
    .eq('id', kbId)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', agentId) // MANDATORY
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Tema de KB no encontrado.' }
  return { success: true, data: data as unknown as AgentKbRow }
}

// ============================================================================
// Versioning snapshot helper (D-01b)
// ============================================================================

/**
 * Snapshot a KB row's editable fields into agent_knowledge_base_versions with
 * version_num = (current max for kb_id) + 1. Called BEFORE overwriting the live
 * row (update / restore) and once at create-time (version_num=1 baseline).
 *
 * Returns the version_num written, or a DomainResult error on failure.
 */
async function snapshotVersion(
  ctx: DomainContext,
  supabase: ReturnType<typeof createAdminClient>,
  kbId: string,
  agentId: string,
  snapshot: KbEditableFields & { body_hash: string },
  editedBy: string,
): Promise<{ ok: true; versionNum: number } | { ok: false; error: string }> {
  // Determine next version_num for this kb_id (scoped — Pitfall 2).
  const { data: maxRow, error: maxErr } = await supabase
    .from('agent_knowledge_base_versions')
    .select('version_num')
    .eq('kb_id', kbId)
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', agentId)
    .order('version_num', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (maxErr) return { ok: false, error: maxErr.message }
  const versionNum = ((maxRow?.version_num as number | undefined) ?? 0) + 1

  const { error: insErr } = await supabase.from('agent_knowledge_base_versions').insert({
    kb_id: kbId,
    workspace_id: ctx.workspaceId,
    agent_id: agentId,
    topic: snapshot.topic,
    category: snapshot.category,
    keywords: snapshot.keywords,
    scope_summary: snapshot.scope_summary,
    hechos_del_producto: snapshot.hechos_del_producto,
    posicion_del_negocio: snapshot.posicion_del_negocio,
    debe_contener: snapshot.debe_contener,
    nunca_decir: snapshot.nunca_decir,
    cuando_escalar: snapshot.cuando_escalar,
    tone_override: snapshot.tone_override,
    escalate_triggers: snapshot.escalate_triggers,
    related_topics: snapshot.related_topics,
    body_hash: snapshot.body_hash,
    version_num: versionNum,
    edited_by: editedBy,
  })

  if (insErr) return { ok: false, error: insErr.message }
  return { ok: true, versionNum }
}

// ============================================================================
// Mutations — create / update (D-02 v4-gated, D-06 re-embed, D-01b versioning)
// ============================================================================

/**
 * Create a new KB topic (D-09). Flow:
 *   1. v4-gate (D-02).
 *   2. Duplicate check on (topic, agent, workspace).
 *   3. Build contentToEmbed via canonical serializer + body_hash.
 *   4. Embed BEFORE the DB write — on OpenAI throw return success:false with NO
 *      insert (D-06: no partial write).
 *   5. INSERT with synthetic NOT-NULL values (Pitfall 5).
 *   6. Snapshot a version_num=1 baseline (D-01b).
 */
export async function createKbTopic(
  ctx: DomainContext,
  params: KbEditableFields & { agentId: string; reviewedBy: string },
): Promise<DomainResult<AgentKbRow>> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate as DomainResult<AgentKbRow>

  const supabase = createAdminClient()

  // Duplicate check — UNIQUE(topic, agent_id, workspace_id) (Pitfall 2 scoping).
  const { data: existing, error: dupErr } = await supabase
    .from('agent_knowledge_base')
    .select('id')
    .eq('topic', params.topic)
    .eq('agent_id', params.agentId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()
  if (dupErr) return { success: false, error: dupErr.message }
  if (existing) return { success: false, error: `Ya existe un tema con topic="${params.topic}".` }

  const cols: KbContentColumns = {
    scope_summary: params.scope_summary,
    hechos_del_producto: params.hechos_del_producto,
    posicion_del_negocio: params.posicion_del_negocio,
    debe_contener: params.debe_contener,
    nunca_decir: params.nunca_decir,
    cuando_escalar: params.cuando_escalar,
  }
  const { contentToEmbed, bodyHash } = buildEmbedInput(cols)

  // Embed BEFORE any write (D-06). On failure NOTHING is inserted.
  let embedding: number[]
  try {
    embedding = await generateEmbedding(contentToEmbed)
  } catch (e) {
    return {
      success: false,
      error: `Re-embed falló (OpenAI). Reintenta. ${(e as Error).message}`,
    }
  }

  const reviewedAt = todayBogota()
  const { data: inserted, error: insErr } = await supabase
    .from('agent_knowledge_base')
    .insert({
      workspace_id: ctx.workspaceId,
      agent_id: params.agentId,
      topic: params.topic,
      category: params.category,
      keywords: params.keywords,
      scope_summary: params.scope_summary,
      hechos_del_producto: params.hechos_del_producto,
      posicion_del_negocio: params.posicion_del_negocio,
      debe_contener: params.debe_contener,
      nunca_decir: params.nunca_decir,
      cuando_escalar: params.cuando_escalar,
      tone_override: params.tone_override,
      escalate_triggers: params.escalate_triggers,
      related_topics: params.related_topics,
      embedding,
      body_hash: bodyHash,
      // D-24: canonical-verbatim deprecated for somnio-v4.
      canonical_response: null,
      // Pitfall 5: synthetic NOT-NULL values (no .md backing the UI row).
      source_md_path: `ui://somnio-v4/${params.topic}`,
      last_reviewed_at: reviewedAt, // Regla 2 — America/Bogota.
      reviewed_by: params.reviewedBy,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(KB_SELECT_COLUMNS)
    .single()

  if (insErr) return { success: false, error: insErr.message }
  const row = inserted as unknown as AgentKbRow

  // D-01b: version_num=1 baseline snapshot of the just-created row.
  const snap = await snapshotVersion(
    ctx,
    supabase,
    row.id,
    params.agentId,
    {
      topic: params.topic,
      category: params.category,
      keywords: params.keywords,
      scope_summary: params.scope_summary,
      hechos_del_producto: params.hechos_del_producto,
      posicion_del_negocio: params.posicion_del_negocio,
      debe_contener: params.debe_contener,
      nunca_decir: params.nunca_decir,
      cuando_escalar: params.cuando_escalar,
      tone_override: params.tone_override,
      escalate_triggers: params.escalate_triggers,
      related_topics: params.related_topics,
      body_hash: bodyHash,
    },
    params.reviewedBy,
  )
  if (!snap.ok) return { success: false, error: `Versión baseline falló: ${snap.error}` }

  return { success: true, data: row }
}

/**
 * Update a KB topic's editable fields in place (D-01b + D-06 + D-10). Flow:
 *   1. v4-gate (D-02).
 *   2. Load current row (must exist).
 *   3. Snapshot the CURRENT row into versions BEFORE writing (D-01b).
 *   4. Recompute contentToEmbed + body_hash from the NEW values. If body_hash is
 *      unchanged keep the embedding (skip OpenAI, mirror sync.ts:58); else embed
 *      BEFORE the UPDATE — on throw return error with NO update (D-06).
 *   5. UPDATE the live row scoped by id + workspace + agent.
 *
 * Note: the version snapshot from step 3 is acceptable even when the embed in
 * step 4 fails — it records the pre-edit state and is reversible (the live row
 * was not modified).
 */
export async function updateKbTopic(
  ctx: DomainContext,
  params: KbEditableFields & { kbId: string; agentId: string; reviewedBy: string },
): Promise<DomainResult<AgentKbRow>> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate as DomainResult<AgentKbRow>

  const current = await getKbTopic(ctx, params.kbId, params.agentId)
  if (!current.success || !current.data) {
    return { success: false, error: current.error ?? 'Tema de KB no encontrado.' }
  }
  const cur = current.data
  const supabase = createAdminClient()

  // D-01b: snapshot the CURRENT row BEFORE overwriting.
  const snap = await snapshotVersion(
    ctx,
    supabase,
    params.kbId,
    params.agentId,
    {
      topic: cur.topic,
      category: cur.category,
      keywords: cur.keywords,
      scope_summary: cur.scope_summary,
      hechos_del_producto: cur.hechos_del_producto,
      posicion_del_negocio: cur.posicion_del_negocio,
      debe_contener: cur.debe_contener,
      nunca_decir: cur.nunca_decir,
      cuando_escalar: cur.cuando_escalar,
      tone_override: cur.tone_override,
      escalate_triggers: cur.escalate_triggers,
      related_topics: cur.related_topics,
      body_hash: cur.body_hash,
    },
    params.reviewedBy,
  )
  if (!snap.ok) return { success: false, error: `Snapshot de versión falló: ${snap.error}` }

  // D-06 + D-10: rebuild embed input from NEW values (scope_summary feeds it).
  const cols: KbContentColumns = {
    scope_summary: params.scope_summary,
    hechos_del_producto: params.hechos_del_producto,
    posicion_del_negocio: params.posicion_del_negocio,
    debe_contener: params.debe_contener,
    nunca_decir: params.nunca_decir,
    cuando_escalar: params.cuando_escalar,
  }
  const { contentToEmbed, bodyHash } = buildEmbedInput(cols)

  const updatePayload: Record<string, unknown> = {
    topic: params.topic,
    category: params.category,
    keywords: params.keywords,
    scope_summary: params.scope_summary,
    hechos_del_producto: params.hechos_del_producto,
    posicion_del_negocio: params.posicion_del_negocio,
    debe_contener: params.debe_contener,
    nunca_decir: params.nunca_decir,
    cuando_escalar: params.cuando_escalar,
    tone_override: params.tone_override,
    escalate_triggers: params.escalate_triggers,
    related_topics: params.related_topics,
    body_hash: bodyHash,
    last_reviewed_at: todayBogota(),
    reviewed_by: params.reviewedBy,
    updated_at: new Date().toISOString(),
  }

  // Hash unchanged → keep embedding (skip OpenAI). Else re-embed BEFORE write.
  if (bodyHash !== cur.body_hash) {
    try {
      updatePayload.embedding = await generateEmbedding(contentToEmbed)
    } catch (e) {
      return {
        success: false,
        error: `Re-embed falló (OpenAI). Reintenta. ${(e as Error).message}`,
      }
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from('agent_knowledge_base')
    .update(updatePayload)
    .eq('id', params.kbId)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', params.agentId) // MANDATORY
    .select(KB_SELECT_COLUMNS)
    .single()

  if (updErr) return { success: false, error: updErr.message }
  return { success: true, data: updated as unknown as AgentKbRow }
}

// ============================================================================
// Delete + version list / search / restore (D-02 v4-gated, D-01b)
// ============================================================================

/**
 * Delete a KB topic. Gated to v4 (D-02). Scoped by id + workspace + agent
 * (Pitfall 2). Version rows cascade via the FK ON DELETE CASCADE (Plan 02).
 */
export async function deleteKbTopic(
  ctx: DomainContext,
  params: { kbId: string; agentId: string },
): Promise<DomainResult> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_knowledge_base')
    .delete()
    .eq('id', params.kbId)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', params.agentId) // MANDATORY

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * List all versions for a KB row, newest first. Scoped by workspace + agent
 * (Pitfall 2). Reads allowed for any agent (no edit-gate).
 */
export async function listKbVersions(
  ctx: DomainContext,
  params: { kbId: string; agentId: string },
): Promise<DomainResult<KbVersionRow[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_knowledge_base_versions')
    .select(VERSION_SELECT_COLUMNS)
    .eq('kb_id', params.kbId)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', params.agentId) // MANDATORY
    .order('version_num', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as unknown as KbVersionRow[] }
}

/**
 * Search versions across all KB rows of an agent by topic substring (ILIKE),
 * newest first. Scoped by workspace + agent (Pitfall 2).
 */
export async function searchKbVersions(
  ctx: DomainContext,
  params: { agentId: string; topic: string },
): Promise<DomainResult<KbVersionRow[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_knowledge_base_versions')
    .select(VERSION_SELECT_COLUMNS)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', params.agentId) // MANDATORY
    .ilike('topic', `%${params.topic}%`)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as unknown as KbVersionRow[] }
}

/**
 * Restore a KB row to a previous version (D-01b + D-06). Flow:
 *   1. v4-gate (D-02).
 *   2. Load the chosen version row + the current live row.
 *   3. Snapshot the CURRENT live row as a NEW version (so restore is reversible).
 *   4. Build contentToEmbed from the version's fields + re-embed BEFORE write
 *      (D-06 coupling — on throw return error, the step-3 snapshot is reversible).
 *   5. UPDATE the live row with the version's editable fields + new embedding +
 *      body_hash, scoped by id + workspace + agent.
 */
export async function restoreKbVersion(
  ctx: DomainContext,
  params: { kbId: string; versionId: string; agentId: string; reviewedBy: string },
): Promise<DomainResult<AgentKbRow>> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate as DomainResult<AgentKbRow>

  const supabase = createAdminClient()

  // Load the chosen version (scoped — Pitfall 2).
  const { data: version, error: verErr } = await supabase
    .from('agent_knowledge_base_versions')
    .select(VERSION_SELECT_COLUMNS)
    .eq('id', params.versionId)
    .eq('kb_id', params.kbId)
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', params.agentId)
    .maybeSingle()
  if (verErr) return { success: false, error: verErr.message }
  if (!version) return { success: false, error: 'Versión no encontrada.' }
  const ver = version as unknown as KbVersionRow

  // Load the current live row.
  const current = await getKbTopic(ctx, params.kbId, params.agentId)
  if (!current.success || !current.data) {
    return { success: false, error: current.error ?? 'Tema de KB no encontrado.' }
  }
  const cur = current.data

  // D-01b: snapshot CURRENT live row as a new version (restore is reversible).
  const snap = await snapshotVersion(
    ctx,
    supabase,
    params.kbId,
    params.agentId,
    {
      topic: cur.topic,
      category: cur.category,
      keywords: cur.keywords,
      scope_summary: cur.scope_summary,
      hechos_del_producto: cur.hechos_del_producto,
      posicion_del_negocio: cur.posicion_del_negocio,
      debe_contener: cur.debe_contener,
      nunca_decir: cur.nunca_decir,
      cuando_escalar: cur.cuando_escalar,
      tone_override: cur.tone_override,
      escalate_triggers: cur.escalate_triggers,
      related_topics: cur.related_topics,
      body_hash: cur.body_hash,
    },
    params.reviewedBy,
  )
  if (!snap.ok) return { success: false, error: `Snapshot pre-restore falló: ${snap.error}` }

  // D-06: re-embed from the version's content via the canonical serializer.
  const cols: KbContentColumns = {
    scope_summary: ver.scope_summary,
    hechos_del_producto: ver.hechos_del_producto,
    posicion_del_negocio: ver.posicion_del_negocio,
    debe_contener: ver.debe_contener,
    nunca_decir: ver.nunca_decir,
    cuando_escalar: ver.cuando_escalar,
  }
  const { contentToEmbed, bodyHash } = buildEmbedInput(cols)

  let embedding: number[]
  try {
    embedding = await generateEmbedding(contentToEmbed)
  } catch (e) {
    return {
      success: false,
      error: `Re-embed falló (OpenAI). Reintenta. ${(e as Error).message}`,
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from('agent_knowledge_base')
    .update({
      topic: ver.topic,
      category: ver.category,
      keywords: ver.keywords,
      scope_summary: ver.scope_summary,
      hechos_del_producto: ver.hechos_del_producto,
      posicion_del_negocio: ver.posicion_del_negocio,
      debe_contener: ver.debe_contener,
      nunca_decir: ver.nunca_decir,
      cuando_escalar: ver.cuando_escalar,
      tone_override: ver.tone_override,
      escalate_triggers: ver.escalate_triggers,
      related_topics: ver.related_topics,
      embedding,
      body_hash: bodyHash,
      last_reviewed_at: todayBogota(),
      reviewed_by: params.reviewedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.kbId)
    .eq('workspace_id', ctx.workspaceId) // MANDATORY — no RLS (Pitfall 2)
    .eq('agent_id', params.agentId) // MANDATORY
    .select(KB_SELECT_COLUMNS)
    .single()

  if (updErr) return { success: false, error: updErr.message }
  return { success: true, data: updated as unknown as AgentKbRow }
}
