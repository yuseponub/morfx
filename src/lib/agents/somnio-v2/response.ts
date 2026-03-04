/**
 * Somnio Sales Agent v2 — Response Layer (Capa 4 basica)
 *
 * Basic response pipeline WITHOUT interruption (check-before-send deferred).
 * 1. Map v2 templateIntents → v1 intent names
 * 2. Load templates from DB via TemplateManager (agentId='somnio-sales-v1')
 * 3. Process templates with variable substitution
 * 4. Compose block via block-composer
 * 5. Return composed messages
 */

import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import { V2_TO_V1_INTENT_MAP } from './constants'
import type { AgentState, Decision, ResponseResult } from './types'

// ============================================================================
// Response Pipeline
// ============================================================================

/**
 * Basic response pipeline (no interruption, no no-rep filter).
 *
 * @param decision - Decision from Capa 3
 * @param state - Current agent state
 * @param workspaceId - Workspace ID for template loading
 * @returns ResponseResult with messages and tracking data
 */
export async function respondBasic(
  decision: Decision,
  state: AgentState,
  workspaceId: string,
): Promise<ResponseResult> {
  const templateIntents = decision.templateIntents ?? []
  if (templateIntents.length === 0) {
    return emptyResult()
  }

  // 1. Map v2 templateIntents → v1 DB intent names
  const v1Intents: string[] = []
  for (const v2Intent of templateIntents) {
    const mapped = V2_TO_V1_INTENT_MAP[v2Intent]
    if (mapped) {
      v1Intents.push(...mapped)
    } else {
      // Pass through: templateIntent is already a v1 name (e.g., resumen_2x)
      v1Intents.push(v2Intent)
    }
  }

  // 2. Load templates from DB using v1 agent ID
  const templateManager = new TemplateManager(workspaceId)

  // Build IntentRecord[] for template manager (v1 format)
  const intentsVistos: IntentRecord[] = state.intentsVistos.map((intent, i) => ({
    intent,
    orden: i,
    timestamp: new Date().toISOString(),
  }))

  const selectionMap = await templateManager.getTemplatesForIntents(
    'somnio-sales-v1',
    v1Intents,
    intentsVistos,
    state.templatesEnviados,
  )

  // 3. Process templates with variable substitution
  const variableContext: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
    ),
    ...decision.extraContext,
    pack: state.pack ?? undefined,
  }

  const allProcessed: PrioritizedTemplate[] = []
  const sentTemplateIds: string[] = []

  for (const [intentName, selection] of selectionMap) {
    if (selection.templates.length === 0) continue

    const processed = await templateManager.processTemplates(
      selection.templates,
      variableContext,
      false, // no paraphrasing
    )

    for (const pt of processed) {
      allProcessed.push({
        templateId: pt.id,
        content: pt.content,
        contentType: pt.contentType,
        priority: pt.priority,
        intent: intentName,
        orden: pt.orden,
        isNew: true,
      })
    }
  }

  // 4. Compose block (max 3 templates, priority-ordered)
  const byIntent = new Map<string, PrioritizedTemplate[]>()
  for (const t of allProcessed) {
    const existing = byIntent.get(t.intent) ?? []
    existing.push(t)
    byIntent.set(t.intent, existing)
  }

  const composed = composeBlock(byIntent, [])

  // 5. Build messages from composed block
  const messages: string[] = []
  for (const t of composed.block) {
    messages.push(t.content)
    sentTemplateIds.push(t.templateId)
  }

  // 6. Determine mostrado updates
  const mostradoUpdates: string[] = []
  for (const v2Intent of templateIntents) {
    if (v2Intent === 'promociones' || v2Intent === 'quiero_comprar') {
      mostradoUpdates.push('promos')
    }
    if (v2Intent.startsWith('resumen')) {
      mostradoUpdates.push('resumen')
    }
    if (v2Intent === 'saludo') {
      mostradoUpdates.push('saludo')
    }
  }

  return {
    messages,
    sent: sentTemplateIds,
    pendingTemplates: composed.pending.map(t => t.templateId),
    dropped: composed.dropped.map(t => t.templateId),
    filtered: [],
    mostradoUpdates,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function emptyResult(): ResponseResult {
  return {
    messages: [],
    sent: [],
    pendingTemplates: [],
    dropped: [],
    filtered: [],
    mostradoUpdates: [],
  }
}
