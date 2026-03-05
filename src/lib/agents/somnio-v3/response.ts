/**
 * Somnio Sales Agent v3 — Response Composition (Capa 7)
 *
 * 1. Map v3 templateIntents → v1 DB intent names
 * 2. Load templates from DB via TemplateManager (fallback to v1 templates)
 * 3. Process templates with variable substitution
 * 4. Compose block via block-composer (max 3)
 * 5. Return composed messages ready for sending
 */

import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import { V3_TO_V1_INTENT_MAP } from './constants'
import { SOMNIO_V3_AGENT_ID } from './config'
import type { AgentState, Decision, ProcessedMessage, ResponseResult } from './types'

// ============================================================================
// Response Pipeline
// ============================================================================

/**
 * Compose response from decision + state.
 *
 * @param decision - Decision from Capa 6
 * @param state - Current agent state
 * @param workspaceId - Workspace ID for template loading
 * @returns ResponseResult with messages and tracking data
 */
export async function composeResponse(
  decision: Decision,
  state: AgentState,
  workspaceId: string,
): Promise<ResponseResult> {
  const templateIntents = decision.templateIntents ?? []
  if (templateIntents.length === 0) {
    return emptyResult()
  }

  // 1. Map v3 templateIntents → v1 DB intent names
  const v1Intents: string[] = []
  for (const v3Intent of templateIntents) {
    const mapped = V3_TO_V1_INTENT_MAP[v3Intent]
    if (mapped) {
      v1Intents.push(...mapped)
    } else {
      v1Intents.push(v3Intent)
    }
  }

  // 2. Load templates — try v3 agent first, fallback to v1
  const templateManager = new TemplateManager(workspaceId)

  const intentsVistos: IntentRecord[] = state.intentsVistos.map((intent, i) => ({
    intent,
    orden: i,
    timestamp: new Date().toISOString(),
  }))

  // Try v3 templates first
  let selectionMap = await templateManager.getTemplatesForIntents(
    SOMNIO_V3_AGENT_ID,
    v1Intents,
    intentsVistos,
    state.templatesMostrados,
  )

  // Fallback to v1 templates if v3 has none
  const hasAnyTemplates = Array.from(selectionMap.values()).some(s => s.templates.length > 0)
  if (!hasAnyTemplates) {
    selectionMap = await templateManager.getTemplatesForIntents(
      'somnio-sales-v1',
      v1Intents,
      intentsVistos,
      state.templatesMostrados,
    )
  }

  // 3. Process templates with variable substitution
  const variableContext: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
    ),
    ...decision.extraContext,
    pack: state.pack ?? undefined,
  }

  const allProcessed: PrioritizedTemplate[] = []

  for (const [intentName, selection] of selectionMap) {
    if (selection.templates.length === 0) continue

    const processed = await templateManager.processTemplates(
      selection.templates,
      variableContext,
      false,
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

  // 4. Compose block (max 3 templates)
  const byIntent = new Map<string, PrioritizedTemplate[]>()
  for (const t of allProcessed) {
    const existing = byIntent.get(t.intent) ?? []
    existing.push(t)
    byIntent.set(t.intent, existing)
  }

  const composed = composeBlock(byIntent, [])

  // 5. Build response
  const messages: ProcessedMessage[] = []
  const templateIdsSent: string[] = []

  for (const t of composed.block) {
    messages.push({
      templateId: t.templateId,
      content: t.content,
      contentType: t.contentType === 'imagen' ? 'imagen' : 'texto',
      delayMs: 0, // Will be computed by messaging adapter (char-delay)
      priority: t.priority,
    })
    templateIdsSent.push(t.templateId)
  }

  // 6. Track what was shown
  const mostradoUpdates: string[] = []
  for (const v3Intent of templateIntents) {
    if (v3Intent === 'promociones' || v3Intent === 'quiero_comprar') {
      mostradoUpdates.push('ofrecer_promos')
    }
    if (v3Intent.startsWith('resumen')) {
      mostradoUpdates.push('mostrar_confirmacion')
    }
    if (v3Intent === 'pedir_datos') {
      mostradoUpdates.push('pedir_datos')
    }
  }

  return {
    messages,
    templateIdsSent,
    mostradoUpdates,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function emptyResult(): ResponseResult {
  return {
    messages: [],
    templateIdsSent: [],
    mostradoUpdates: [],
  }
}
