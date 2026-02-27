/**
 * Template Manager Component
 * Phase 14: Agente Ventas Somnio - Plan 03
 *
 * Manages loading, selecting, and processing message templates from database.
 * Handles primera_vez vs siguientes visit types and template tracking.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  AgentTemplate,
  AgentTemplateRow,
  IntentRecord,
  TemplateContentType,
  TemplateVisitType,
} from '../types'
import { isValidTemplateContentType, isValidTemplatePriority, isValidTemplateVisitType } from '../types'
import { substituteVariables, type VariableContext } from './variable-substitutor'
import { paraphraseTemplate } from './template-paraphraser'

// ============================================================================
// Types
// ============================================================================

/** Maximum templates for a repeated intent visit (top 2 by priority) */
const REPEATED_INTENT_MAX_TEMPLATES = 2

/** Priority rank for sorting: lower = higher priority */
const PRIORITY_RANK: Record<string, number> = {
  CORE: 0,
  COMPLEMENTARIA: 1,
  OPCIONAL: 2,
}

/**
 * Result of template selection for an intent.
 */
export interface TemplateSelection {
  /** Templates to send (ordered by 'orden') */
  templates: AgentTemplate[]
  /** Visit type used for selection */
  visitType: TemplateVisitType
  /** Template IDs that were already sent (for tracking) */
  alreadySent: string[]
  /** Whether this is a repeated visit (intent seen before in this conversation) */
  isRepeatedVisit: boolean
}

/**
 * Processed template ready for sending.
 */
export interface ProcessedTemplate {
  /** Template ID */
  id: string
  /** Content after variable substitution */
  content: string
  /** Type of content */
  contentType: TemplateContentType
  /** Delay before sending (seconds) */
  delaySeconds: number
  /** Order in sequence */
  orden: number
  /** Block priority for pre-send check. Phase 31. */
  priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
}

/**
 * Cache entry for templates.
 */
interface TemplateCacheEntry {
  templates: AgentTemplate[]
  timestamp: number
}

// ============================================================================
// Template Manager
// ============================================================================

/**
 * Template Manager for loading and selecting message templates.
 *
 * Features:
 * - Loads templates from agent_templates table with caching
 * - Distinguishes primera_vez vs siguientes visits
 * - Tracks templates already sent to avoid repetition
 * - Processes templates with variable substitution
 */
export class TemplateManager {
  private cache: Map<string, TemplateCacheEntry> = new Map()
  private cacheExpiry: number = 5 * 60 * 1000 // 5 minutes

  /**
   * Create a TemplateManager instance.
   *
   * @param workspaceId - Optional workspace ID for workspace-specific templates
   */
  constructor(private workspaceId?: string) {}

  /**
   * Get templates for a specific intent.
   *
   * Determines visit type based on intent history, filters by agent/intent/visit,
   * and excludes already sent templates.
   *
   * @param agentId - Agent ID (e.g., 'somnio-sales-v1')
   * @param intent - Intent name (e.g., 'precio', 'hola+precio')
   * @param intentsVistos - History of visited intents
   * @param templatesSent - IDs of templates already sent
   * @returns TemplateSelection with ordered templates
   */
  async getTemplatesForIntent(
    agentId: string,
    intent: string,
    intentsVistos: IntentRecord[],
    templatesSent: string[]
  ): Promise<TemplateSelection> {
    // Load all templates for this agent
    const allTemplates = await this.loadTemplates(agentId)

    // Phase 34: Always use primera_vez (siguientes rows deleted in migration)
    const isFirst = this.isFirstVisit(intent, intentsVistos)
    const isRepeatedVisit = !isFirst

    // Filter templates for this intent — always primera_vez
    let templates = allTemplates.filter(
      t => t.intent === intent && t.visit_type === 'primera_vez'
    )

    // Filter out already sent templates (by ID and by content)
    const sentContents = allTemplates
      .filter(t => templatesSent.includes(t.id))
      .map(t => t.content)
    templates = templates.filter(t => !templatesSent.includes(t.id) && !sentContents.includes(t.content))

    // Sort by orden
    templates.sort((a, b) => a.orden - b.orden)

    // Phase 34: For repeated intents, cap at top 2 by priority (CORE first)
    // Feature flag: USE_NO_REPETITION=true to enable (disabled by default)
    if (process.env.USE_NO_REPETITION === 'true' && isRepeatedVisit && templates.length > REPEATED_INTENT_MAX_TEMPLATES) {
      // Sort by priority rank (CORE=0 < COMP=1 < OPC=2), then by orden
      const byPriority = [...templates].sort((a, b) => {
        const rankDiff =
          (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
        if (rankDiff !== 0) return rankDiff
        return a.orden - b.orden
      })
      templates = byPriority.slice(0, REPEATED_INTENT_MAX_TEMPLATES)
    }

    return {
      templates,
      visitType: 'primera_vez',
      alreadySent: templatesSent,
      isRepeatedVisit,
    }
  }

  /**
   * Process templates with variable substitution and optional paraphrasing.
   *
   * Applies context values to {{variable}} patterns in template content.
   * When isRepeated=true, paraphrases each template's content via Claude
   * AFTER variable substitution to keep all factual data intact.
   *
   * @param templates - Templates to process
   * @param context - Variable context for substitution
   * @param isRepeated - Whether this is a repeated intent visit (triggers paraphrasing)
   * @returns ProcessedTemplates ready for sending
   */
  async processTemplates(
    templates: AgentTemplate[],
    context: VariableContext,
    isRepeated: boolean = false
  ): Promise<ProcessedTemplate[]> {
    const processed: ProcessedTemplate[] = []

    for (const template of templates) {
      let content = substituteVariables(template.content, context)

      // Phase 34: Paraphrase content for repeated intents
      // Feature flag: USE_NO_REPETITION=true to enable (disabled by default)
      if (process.env.USE_NO_REPETITION === 'true' && isRepeated) {
        content = await paraphraseTemplate(content)
      }

      processed.push({
        id: template.id,
        content,
        contentType: template.content_type,
        delaySeconds: template.delay_s,
        orden: template.orden,
        priority: template.priority ?? 'CORE',
      })
    }

    return processed
  }

  /**
   * Check if this is the first visit to an intent.
   *
   * @param intent - Intent name to check
   * @param intentsVistos - History of visited intents
   * @returns True if intent not in history
   */
  isFirstVisit(intent: string, intentsVistos: IntentRecord[]): boolean {
    return !intentsVistos.some(record => record.intent === intent)
  }

  /**
   * Invalidate the template cache.
   * Call this when templates are updated in the database.
   */
  invalidateCache(): void {
    this.cache.clear()
  }

  /**
   * Get templates for multiple intents at once.
   * Useful for fetching templates for combination intents.
   *
   * @param agentId - Agent ID
   * @param intents - Array of intent names
   * @param intentsVistos - History of visited intents
   * @param templatesSent - IDs of templates already sent
   * @returns Map of intent to TemplateSelection
   */
  async getTemplatesForIntents(
    agentId: string,
    intents: string[],
    intentsVistos: IntentRecord[],
    templatesSent: string[]
  ): Promise<Map<string, TemplateSelection>> {
    const result = new Map<string, TemplateSelection>()

    // Fetch all at once (templates are cached)
    for (const intent of intents) {
      const selection = await this.getTemplatesForIntent(
        agentId,
        intent,
        intentsVistos,
        templatesSent
      )
      result.set(intent, selection)
    }

    return result
  }

  /**
   * Load templates from database with caching.
   *
   * @param agentId - Agent ID to load templates for
   * @returns Array of AgentTemplate
   */
  private async loadTemplates(agentId: string): Promise<AgentTemplate[]> {
    const cacheKey = `${agentId}:${this.workspaceId ?? 'global'}`
    const cached = this.cache.get(cacheKey)

    // Check cache validity
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.templates
    }

    // Query database
    const supabase = createAdminClient()

    // Build query for templates:
    // - Match agent_id
    // - workspace_id IS NULL (global) OR workspace_id = this.workspaceId
    let query = supabase
      .from('agent_templates')
      .select('*')
      .eq('agent_id', agentId)
      .order('intent')
      .order('visit_type')
      .order('orden')

    if (this.workspaceId) {
      // Validate workspaceId format (UUID) for defense-in-depth before interpolation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(this.workspaceId)) {
        console.error('[TemplateManager] Invalid workspaceId format:', this.workspaceId)
        return []
      }
      // Include both global and workspace-specific templates
      query = query.or(`workspace_id.is.null,workspace_id.eq.${this.workspaceId}`)
    } else {
      // Only global templates
      query = query.is('workspace_id', null)
    }

    const { data, error } = await query

    if (error) {
      console.error('[TemplateManager] Error loading templates:', error)
      return []
    }

    // DEBUG: Log template loading result for production diagnostics
    console.log(`[TemplateManager] Loaded ${data?.length ?? 0} templates for agent=${agentId}, workspaceId=${this.workspaceId ?? 'NULL'}`)

    // Transform database rows to typed AgentTemplate
    const templates = (data as AgentTemplateRow[]).map(row => this.rowToTemplate(row))

    // Update cache
    this.cache.set(cacheKey, {
      templates,
      timestamp: Date.now(),
    })

    return templates
  }

  /**
   * Transform database row to AgentTemplate type.
   */
  private rowToTemplate(row: AgentTemplateRow): AgentTemplate {
    return {
      id: row.id,
      agent_id: row.agent_id,
      intent: row.intent,
      visit_type: isValidTemplateVisitType(row.visit_type)
        ? row.visit_type
        : 'primera_vez',
      orden: row.orden,
      content_type: isValidTemplateContentType(row.content_type)
        ? row.content_type
        : 'texto',
      content: row.content,
      delay_s: row.delay_s,
      priority: isValidTemplatePriority(row.priority) ? row.priority : 'CORE',
      workspace_id: row.workspace_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}
