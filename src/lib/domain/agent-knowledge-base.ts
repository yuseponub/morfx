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
