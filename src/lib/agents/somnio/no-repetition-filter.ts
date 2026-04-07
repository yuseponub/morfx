/**
 * No-Repetition Filter — 3-Level Escalating Check
 * Phase 34: No-Repetition System - Plan 02, Task 2
 *
 * Prevents the bot from sending information that was already communicated
 * (by templates, human agents, or AI responses) in the same conversation.
 *
 * Level 1 (ID lookup): Instant, $0. Checks templates_enviados array.
 * Level 2 (minifrase Haiku): ~200ms, ~$0.0003. Compares thematic minifrases.
 * Level 3 (full context Haiku): ~1-3s. Deep check for PARCIAL cases only.
 *
 * Strategy: FAIL-OPEN. On any error, the template is allowed through (ENVIAR).
 * It's better to occasionally repeat than to suppress useful information.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { createInstrumentedAnthropic } from '@/lib/observability/anthropic-instrumented'
import { runWithPurpose } from '@/lib/observability'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import type { PrioritizedTemplate } from './block-composer'
import type {
  OutboundEntry,
  NoRepFilterResult,
  NoRepLevel2Decision,
} from './no-repetition-types'

const logger = createModuleLogger('no-repetition-filter')

// ============================================================================
// Prompts
// ============================================================================

const LEVEL2_PROMPT = `Eres un detector de repeticion para un bot de ventas de WhatsApp.

Te doy la MINIFRASE de una plantilla que el bot quiere enviar, y las MINIFRASES de todo lo que ya se envio en esta conversacion (por bot, humano, o IA).

Tu tarea: determinar si la plantilla agrega informacion NUEVA o si ya fue cubierta.

Responde SOLO con un JSON:
{
  "decision": "ENVIAR" | "NO_ENVIAR" | "PARCIAL",
  "razon": "breve explicacion"
}

Reglas:
- ENVIAR: La plantilla tiene informacion que NO aparece en ningun mensaje previo
- NO_ENVIAR: La informacion de la plantilla ya fue cubierta completamente
- PARCIAL: Parte de la informacion fue cubierta, parte es nueva (necesita check mas profundo)
- Compara TEMAS, no palabras exactas. "precio 77900 con envio gratis" y "el costo es 77900 envio incluido" son el MISMO tema.
- Si la plantilla agrega un ANGULO DIFERENTE del mismo tema (ej: plantilla habla de severidad del insomnio, previo habla de efectividad general), es PARCIAL.`

const LEVEL3_PROMPT = `Eres un detector de repeticion PROFUNDO para un bot de ventas de WhatsApp.

Te doy el CONTENIDO COMPLETO de una plantilla que el bot quiere enviar, y los CONTENIDOS COMPLETOS de mensajes previos que tienen tematica similar.

Tu tarea: decidir si la plantilla aporta suficiente VALOR NUEVO para justificar enviarla.

Responde SOLO con un JSON:
{
  "decision": "ENVIAR" | "NO_ENVIAR",
  "razon": "breve explicacion"
}

Reglas:
- ENVIAR: La plantilla tiene datos, angulos, o informacion que NO estan en los mensajes previos. Aunque el tema sea similar, si agrega detalles nuevos, ENVIAR.
- NO_ENVIAR: Los mensajes previos ya cubren la misma informacion con el mismo nivel de detalle. Enviar seria redundante.
- Presta atencion a datos facticos (precios, tiempos, cantidades, ingredientes). Si la plantilla agrega un dato factico nuevo, es ENVIAR.
- En caso de duda, ENVIAR (preferimos repetir a omitir informacion util).`

// ============================================================================
// NoRepetitionFilter Class
// ============================================================================

export class NoRepetitionFilter {
  private client: Anthropic
  private minifraseCache: Map<string, string> = new Map()

  constructor(private workspaceId?: string) {
    this.client = createInstrumentedAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  /**
   * Filter a block of templates through the 3-level no-repetition check.
   *
   * For each template in the block:
   * - Level 1: Check if template ID is in templatesEnviados (instant, $0)
   * - Level 2: Compare minifrase against outbound registry via Haiku
   * - Level 3: Full content comparison (only for PARCIAL results)
   *
   * @param block - Templates to filter (from BlockComposer)
   * @param outboundRegistry - All outbound messages in the conversation
   * @param templatesEnviados - Template IDs already sent (from session_state)
   * @returns NoRepFilterResult with surviving and filtered arrays
   */
  async filterBlock(
    block: PrioritizedTemplate[],
    outboundRegistry: OutboundEntry[],
    templatesEnviados: string[]
  ): Promise<NoRepFilterResult> {
    // Edge case: empty block or empty registry
    if (block.length === 0) {
      return { surviving: [], filtered: [] }
    }

    const surviving: PrioritizedTemplate[] = []
    const filtered: NoRepFilterResult['filtered'] = []

    // Process templates sequentially (short-circuit at each level)
    for (const template of block) {
      // -------------------------------------------------------------------
      // Level 1: ID lookup (0ms, $0)
      // -------------------------------------------------------------------
      if (templatesEnviados.includes(template.templateId)) {
        filtered.push({
          template,
          level: 1,
          reason: `ID "${template.templateId}" already in templates_enviados`,
        })
        logger.info(
          { templateId: template.templateId, level: 1 },
          'Template filtered: ID already sent'
        )
        continue
      }

      // If no outbound registry entries have minifrases, skip L2/L3 (nothing to compare)
      const registryWithTema = outboundRegistry.filter((e) => e.tema.length > 0)
      if (registryWithTema.length === 0) {
        surviving.push(template)
        logger.debug(
          { templateId: template.templateId },
          'Template survives: no registry minifrases to compare against'
        )
        continue
      }

      // -------------------------------------------------------------------
      // Level 2: Minifrase comparison via Haiku (~200ms, ~$0.0003)
      // -------------------------------------------------------------------
      const candidateMinifrase = await this.getTemplateMinifrase(template.templateId)
      if (!candidateMinifrase) {
        // No minifrase available for this template — fail-open
        surviving.push(template)
        logger.warn(
          { templateId: template.templateId },
          'Template survives: no minifrase found (fail-open)'
        )
        continue
      }

      const level2Decision = await this.checkLevel2(candidateMinifrase, registryWithTema)

      if (level2Decision === 'NO_ENVIAR') {
        filtered.push({
          template,
          level: 2,
          reason: 'Content covered by previous messages (minifrase comparison)',
        })
        logger.info(
          { templateId: template.templateId, level: 2 },
          'Template filtered: minifrase comparison says covered'
        )
        continue
      }

      if (level2Decision === 'ENVIAR') {
        surviving.push(template)
        logger.debug(
          { templateId: template.templateId, level: 2 },
          'Template survives: adds new information (minifrase comparison)'
        )
        continue
      }

      // -------------------------------------------------------------------
      // Level 3: Full context check (only for PARCIAL, ~1-3s)
      // -------------------------------------------------------------------
      const level3Decision = await this.checkLevel3(template, outboundRegistry)

      if (level3Decision === 'NO_ENVIAR') {
        filtered.push({
          template,
          level: 3,
          reason: 'Full context confirms content already covered',
        })
        logger.info(
          { templateId: template.templateId, level: 3 },
          'Template filtered: full context confirms coverage'
        )
        continue
      }

      // ENVIAR (or fail-open on error)
      surviving.push(template)
      logger.debug(
        { templateId: template.templateId, level: 3 },
        'Template survives: full context confirms new value'
      )
    }

    logger.info(
      {
        total: block.length,
        surviving: surviving.length,
        filtered: filtered.length,
        filteredByLevel: {
          l1: filtered.filter((f) => f.level === 1).length,
          l2: filtered.filter((f) => f.level === 2).length,
          l3: filtered.filter((f) => f.level === 3).length,
        },
      },
      'Block filtering complete'
    )

    return { surviving, filtered }
  }

  // ==========================================================================
  // Level 2: Minifrase Comparison
  // ==========================================================================

  /**
   * Compare a candidate template's minifrase against all outbound registry minifrases.
   * Returns ENVIAR, NO_ENVIAR, or PARCIAL.
   * Fail-open: returns ENVIAR on any error.
   */
  private async checkLevel2(
    candidateMinifrase: string,
    registryWithTema: OutboundEntry[]
  ): Promise<NoRepLevel2Decision> {
    try {
      const registryMinifrases = registryWithTema
        .map((e) => `- [${e.tipo}] ${e.tema}`)
        .join('\n')

      const userMessage = `MINIFRASE DE PLANTILLA CANDIDATA:
${candidateMinifrase}

MINIFRASES DE MENSAJES YA ENVIADOS:
${registryMinifrases}`

      const response = await runWithPurpose('no_rep_l2', () =>
        this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: LEVEL2_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        })
      )

      const text = this.extractText(response.content)
      return this.parseLevel2Response(text)
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Level 2 check failed, defaulting to ENVIAR (fail-open)'
      )
      return 'ENVIAR'
    }
  }

  /**
   * Parse Level 2 Haiku response. Expects JSON with decision field.
   * Fail-open: defaults to ENVIAR on parse failure.
   */
  private parseLevel2Response(text: string): NoRepLevel2Decision {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const decision = parsed.decision as string
        if (decision === 'ENVIAR' || decision === 'NO_ENVIAR' || decision === 'PARCIAL') {
          return decision
        }
      } catch {
        // Fall through to default
      }
    }

    logger.warn(
      { text: text.substring(0, 200) },
      'Could not parse Level 2 response, defaulting to ENVIAR'
    )
    return 'ENVIAR'
  }

  // ==========================================================================
  // Level 3: Full Context Check
  // ==========================================================================

  /**
   * Deep comparison: full template content vs relevant outbound entry contents.
   * Only runs when Level 2 returned PARCIAL.
   * Returns 'ENVIAR' or 'NO_ENVIAR'. Fail-open: returns 'ENVIAR' on error.
   */
  private async checkLevel3(
    template: PrioritizedTemplate,
    outboundRegistry: OutboundEntry[]
  ): Promise<'ENVIAR' | 'NO_ENVIAR'> {
    try {
      // Collect full contents from outbound entries that have them
      const previousContents = outboundRegistry
        .filter((e) => e.fullContent && e.fullContent.trim().length > 0)
        .map((e) => `[${e.tipo}]: ${e.fullContent}`)
        .join('\n\n')

      // If no full content available for comparison, fail-open
      if (!previousContents) {
        return 'ENVIAR'
      }

      const userMessage = `CONTENIDO COMPLETO DE LA PLANTILLA CANDIDATA:
${template.content}

CONTENIDOS COMPLETOS DE MENSAJES PREVIOS CON TEMATICA SIMILAR:
${previousContents}`

      const response = await runWithPurpose('no_rep_l3', () =>
        this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: LEVEL3_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        })
      )

      const text = this.extractText(response.content)
      return this.parseLevel3Response(text)
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), templateId: template.templateId },
        'Level 3 check failed, defaulting to ENVIAR (fail-open)'
      )
      return 'ENVIAR'
    }
  }

  /**
   * Parse Level 3 Haiku response. Expects JSON with decision field.
   * Fail-open: defaults to ENVIAR on parse failure.
   */
  private parseLevel3Response(text: string): 'ENVIAR' | 'NO_ENVIAR' {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const decision = parsed.decision as string
        if (decision === 'ENVIAR' || decision === 'NO_ENVIAR') {
          return decision
        }
      } catch {
        // Fall through to default
      }
    }

    logger.warn(
      { text: text.substring(0, 200) },
      'Could not parse Level 3 response, defaulting to ENVIAR'
    )
    return 'ENVIAR'
  }

  // ==========================================================================
  // Template Minifrase Lookup
  // ==========================================================================

  /**
   * Get the minifrase for a template from agent_templates DB.
   * Results are cached within the filter instance to avoid repeated queries.
   *
   * @param templateId - The template ID to look up
   * @returns The minifrase string, or null if not found
   */
  private async getTemplateMinifrase(templateId: string): Promise<string | null> {
    // Check cache first
    if (this.minifraseCache.has(templateId)) {
      return this.minifraseCache.get(templateId) ?? null
    }

    try {
      const supabase = createAdminClient()

      let query = supabase
        .from('agent_templates')
        .select('minifrase')
        .eq('id', templateId)

      // Filter by workspace: null (global) OR matching workspace
      if (this.workspaceId) {
        query = query.or(`workspace_id.is.null,workspace_id.eq.${this.workspaceId}`)
      }

      const { data, error } = await query.single()

      if (error) {
        logger.warn(
          { templateId, error: error.message },
          'Failed to query template minifrase'
        )
        this.minifraseCache.set(templateId, '')
        return null
      }

      const minifrase = data?.minifrase ?? ''
      this.minifraseCache.set(templateId, minifrase)

      if (!minifrase) {
        logger.warn(
          { templateId },
          'Template has no minifrase set'
        )
        return null
      }

      return minifrase
    } catch (error) {
      logger.error(
        { templateId, error: error instanceof Error ? error.message : String(error) },
        'Error fetching template minifrase'
      )
      return null
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Extract text from Claude response content blocks.
   */
  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }
}
