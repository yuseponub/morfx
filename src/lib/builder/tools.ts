// ============================================================================
// Phase 19: AI Automation Builder - Tool Definitions
// AI SDK tool definitions for the builder agent. Each tool provides
// server-side resource lookup or automation CRUD via createAdminClient.
// ============================================================================

import { z } from 'zod'
import { tool } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { automationToDiagram } from '@/lib/builder/diagram-generator'
import {
  validateResources,
  detectCycles,
  findDuplicateAutomations,
} from '@/lib/builder/validation'
import type {
  BuilderToolContext,
  AutomationPreviewData,
} from '@/lib/builder/types'
import type { TriggerType, AutomationAction } from '@/lib/automations/types'
import {
  MAX_ACTIONS_PER_AUTOMATION,
  MAX_AUTOMATIONS_PER_WORKSPACE,
} from '@/lib/automations/constants'

// ============================================================================
// Types for tool return values
// ============================================================================

interface PipelineStage {
  id: string
  name: string
  color: string
  position: number
}

interface PipelineWithStages {
  id: string
  name: string
  stages: PipelineStage[]
}

interface TagInfo {
  id: string
  name: string
  color: string
}

interface TemplateInfo {
  name: string
  status: string
  language: string
  components: unknown
  category: string
}

interface AutomationListItem {
  id: string
  name: string
  trigger_type: string
  is_enabled: boolean
  actions_count: number
}

interface AutomationDetail {
  id: string
  name: string
  description: string | null
  trigger_type: string
  trigger_config: Record<string, unknown>
  conditions: unknown
  actions: unknown[]
  is_enabled: boolean
  created_at: string
  updated_at: string
}

interface WorkspaceMember {
  id: string
  email: string
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Creates the set of AI SDK tools for the Automation Builder agent.
 * Each tool uses createAdminClient() with workspace_id filtering for isolation.
 *
 * @param ctx - BuilderToolContext with workspaceId and userId
 * @returns Object of AI SDK tool definitions compatible with streamText()
 */
export function createBuilderTools(ctx: BuilderToolContext) {
  return {
    // ========================================================================
    // 1. listPipelines
    // ========================================================================
    listPipelines: tool({
      description:
        'Lista todos los pipelines del workspace con sus etapas. Usar cuando el usuario mencione pipelines, etapas, o stages.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ pipelines: PipelineWithStages[] } | { error: string }> => {
        try {
          const supabase = createAdminClient()

          const { data: pipelines, error: pError } = await supabase
            .from('pipelines')
            .select('id, name')
            .eq('workspace_id', ctx.workspaceId)
            .order('created_at')

          if (pError) {
            return { error: `Error consultando pipelines: ${pError.message}` }
          }

          if (!pipelines || pipelines.length === 0) {
            return { pipelines: [] }
          }

          const { data: stages, error: sError } = await supabase
            .from('pipeline_stages')
            .select('id, name, color, position, pipeline_id')
            .in(
              'pipeline_id',
              pipelines.map((p) => p.id)
            )
            .order('position')

          if (sError) {
            return { error: `Error consultando etapas: ${sError.message}` }
          }

          const result: PipelineWithStages[] = pipelines.map((p) => ({
            id: p.id,
            name: p.name,
            stages: (stages || [])
              .filter((s) => s.pipeline_id === p.id)
              .map((s) => ({
                id: s.id,
                name: s.name,
                color: s.color,
                position: s.position,
              })),
          }))

          return { pipelines: result }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 2. listTags
    // ========================================================================
    listTags: tool({
      description:
        'Lista todos los tags del workspace. Usar cuando el usuario mencione tags o etiquetas.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ tags: TagInfo[] } | { error: string }> => {
        try {
          const supabase = createAdminClient()

          const { data: tags, error } = await supabase
            .from('tags')
            .select('id, name, color')
            .eq('workspace_id', ctx.workspaceId)
            .order('name')

          if (error) {
            return { error: `Error consultando tags: ${error.message}` }
          }

          return { tags: (tags || []) as TagInfo[] }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 3. listTemplates
    // ========================================================================
    listTemplates: tool({
      description:
        'Lista todos los templates de WhatsApp del workspace con su estado de aprobacion de Meta. Usar cuando el usuario mencione templates o plantillas de WhatsApp.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ templates: TemplateInfo[] } | { error: string }> => {
        try {
          const supabase = createAdminClient()

          const { data: templates, error } = await supabase
            .from('whatsapp_templates')
            .select('name, status, language, components, category')
            .eq('workspace_id', ctx.workspaceId)
            .order('name')

          if (error) {
            return { error: `Error consultando templates: ${error.message}` }
          }

          return { templates: (templates || []) as TemplateInfo[] }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 4. listAutomations
    // ========================================================================
    listAutomations: tool({
      description:
        'Lista todas las automatizaciones del workspace (resumen ligero). Usar cuando el usuario quiera ver sus automatizaciones existentes o modificar una.',
      inputSchema: z.object({}),
      execute: async (): Promise<
        { automations: AutomationListItem[] } | { error: string }
      > => {
        try {
          const supabase = createAdminClient()

          const { data, error } = await supabase
            .from('automations')
            .select('id, name, trigger_type, is_enabled, actions')
            .eq('workspace_id', ctx.workspaceId)
            .order('created_at', { ascending: false })

          if (error) {
            return { error: `Error consultando automatizaciones: ${error.message}` }
          }

          const automations: AutomationListItem[] = (data || []).map((a) => ({
            id: a.id,
            name: a.name,
            trigger_type: a.trigger_type,
            is_enabled: a.is_enabled,
            actions_count: Array.isArray(a.actions) ? a.actions.length : 0,
          }))

          return { automations }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 5. getAutomation
    // ========================================================================
    getAutomation: tool({
      description:
        'Obtiene los detalles completos de una automatizacion por ID o por nombre. Si se busca por nombre y hay multiples coincidencias, retorna todas para que el usuario elija.',
      inputSchema: z.object({
        automationId: z
          .string()
          .optional()
          .describe('UUID de la automatizacion (busqueda exacta)'),
        name: z
          .string()
          .optional()
          .describe('Nombre de la automatizacion (busqueda parcial, case-insensitive)'),
      }),
      execute: async (params): Promise<
        { automations: AutomationDetail[] } | { error: string }
      > => {
        try {
          if (!params.automationId && !params.name) {
            return { error: 'Se requiere automationId o name para buscar' }
          }

          const supabase = createAdminClient()
          let query = supabase
            .from('automations')
            .select(
              'id, name, description, trigger_type, trigger_config, conditions, actions, is_enabled, created_at, updated_at'
            )
            .eq('workspace_id', ctx.workspaceId)

          if (params.automationId) {
            query = query.eq('id', params.automationId)
          } else if (params.name) {
            query = query.ilike('name', `%${params.name}%`)
          }

          const { data, error } = await query

          if (error) {
            return { error: `Error consultando automatizacion: ${error.message}` }
          }

          if (!data || data.length === 0) {
            return { error: 'No se encontro ninguna automatizacion con esos criterios' }
          }

          return { automations: data as AutomationDetail[] }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 6. listWorkspaceMembers
    // ========================================================================
    listWorkspaceMembers: tool({
      description:
        'Lista los miembros del workspace con su email. Necesario para la accion create_task cuando se quiere asignar a un usuario.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ members: WorkspaceMember[] } | { error: string }> => {
        try {
          const supabase = createAdminClient()

          // Get workspace members
          const { data: members, error: mError } = await supabase
            .from('workspace_members')
            .select('user_id')
            .eq('workspace_id', ctx.workspaceId)

          if (mError) {
            return { error: `Error consultando miembros: ${mError.message}` }
          }

          if (!members || members.length === 0) {
            return { members: [] }
          }

          // Get profiles for emails
          const userIds = members.map((m) => m.user_id)
          const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', userIds)

          if (pError) {
            return { error: `Error consultando perfiles: ${pError.message}` }
          }

          const result: WorkspaceMember[] = (profiles || []).map((p) => ({
            id: p.id,
            email: p.email,
          }))

          return { members: result }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 7. generatePreview
    // ========================================================================
    generatePreview: tool({
      description:
        'Genera un preview de la automatizacion con validaciones. Valida que los recursos existan, detecta ciclos y duplicados. Mostrar al usuario ANTES de crear o modificar.',
      inputSchema: z.object({
        name: z.string().describe('Nombre de la automatizacion'),
        description: z.string().optional().describe('Descripcion opcional'),
        trigger_type: z.string().describe('Tipo de trigger (ej: order.stage_changed)'),
        trigger_config: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe('Configuracion del trigger'),
        conditions: z.any().nullable().optional().describe('Condiciones (ConditionGroup o null)'),
        actions: z
          .array(
            z.object({
              type: z.string().describe('Tipo de accion'),
              params: z
                .record(z.string(), z.unknown())
                .default({})
                .describe('Parametros de la accion'),
              delay: z
                .object({
                  amount: z.number(),
                  unit: z.enum(['minutes', 'hours', 'days']),
                })
                .nullable()
                .optional()
                .describe('Delay opcional'),
            })
          )
          .describe('Lista de acciones'),
        existingAutomationId: z
          .string()
          .optional()
          .describe('UUID de la automatizacion existente si se esta modificando (no clonar)'),
      }),
      execute: async (params): Promise<AutomationPreviewData | { error: string }> => {
        try {
          // 1. Validate resources against workspace DB
          const resourceValidations = await validateResources(
            ctx.workspaceId,
            {
              trigger_type: params.trigger_type,
              trigger_config: params.trigger_config,
              actions: params.actions,
            }
          )

          // 2. Detect cycles in the automation graph
          const cycleResult = await detectCycles(
            ctx.workspaceId,
            {
              trigger_type: params.trigger_type,
              actions: params.actions,
            }
          )

          // 3. Find duplicate automations with overlapping triggers
          const duplicateResult = await findDuplicateAutomations(
            ctx.workspaceId,
            {
              trigger_type: params.trigger_type,
              trigger_config: params.trigger_config,
            }
          )

          let duplicateWarning: string | null = null
          if (duplicateResult.isDuplicate && duplicateResult.existing.length > 0) {
            const names = duplicateResult.existing.map((d) => `"${d.name}"`).join(', ')
            duplicateWarning = `Ya existe(n) automatizacion(es) con trigger similar: ${names}. Esto puede ser intencional, pero verifica.`
          }

          // 4. Generate React Flow diagram with validation errors mapped to nodes
          const diagram = automationToDiagram(
            {
              name: params.name,
              trigger_type: params.trigger_type,
              trigger_config: params.trigger_config,
              conditions: params.conditions || null,
              actions: params.actions as AutomationAction[],
            },
            resourceValidations
          )

          const preview: AutomationPreviewData = {
            name: params.name,
            description: params.description || '',
            trigger_type: params.trigger_type as TriggerType,
            trigger_config: params.trigger_config,
            conditions: params.conditions || null,
            actions: params.actions as AutomationAction[],
            diagram,
            resourceValidations,
            hasCycles: cycleResult.hasCycles,
            duplicateWarning,
            ...(params.existingAutomationId ? { existingAutomationId: params.existingAutomationId } : {}),
          }

          return preview
        } catch (err) {
          return { error: `Error generando preview: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    // ========================================================================
    // 8. createAutomation
    // ========================================================================
    createAutomation: tool({
      description:
        'Crea una nueva automatizacion (DESACTIVADA por defecto). SOLO usar despues de que el usuario confirme el preview.',
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe('Nombre de la automatizacion'),
        description: z.string().max(500).optional().describe('Descripcion opcional'),
        trigger_type: z.string().describe('Tipo de trigger'),
        trigger_config: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe('Configuracion del trigger'),
        conditions: z.any().nullable().optional().describe('Condiciones'),
        actions: z
          .array(
            z.object({
              type: z.string(),
              params: z.record(z.string(), z.unknown()).default({}),
              delay: z
                .object({
                  amount: z.number(),
                  unit: z.enum(['minutes', 'hours', 'days']),
                })
                .nullable()
                .optional(),
            })
          )
          .min(1)
          .max(MAX_ACTIONS_PER_AUTOMATION)
          .describe('Lista de acciones (min 1, max ' + MAX_ACTIONS_PER_AUTOMATION + ')'),
      }),
      execute: async (params): Promise<
        { success: true; automationId: string } | { success: false; error: string }
      > => {
        try {
          const supabase = createAdminClient()

          // Check automation limit
          const { count, error: countError } = await supabase
            .from('automations')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)

          if (countError) {
            return { success: false, error: `Error verificando limites: ${countError.message}` }
          }

          if (count !== null && count >= MAX_AUTOMATIONS_PER_WORKSPACE) {
            return {
              success: false,
              error: `Limite alcanzado: maximo ${MAX_AUTOMATIONS_PER_WORKSPACE} automatizaciones por workspace`,
            }
          }

          // Insert automation (always disabled)
          const { data, error } = await supabase
            .from('automations')
            .insert({
              workspace_id: ctx.workspaceId,
              name: params.name,
              description: params.description || null,
              trigger_type: params.trigger_type,
              trigger_config: params.trigger_config,
              conditions: params.conditions || null,
              actions: params.actions,
              created_by: ctx.userId,
              is_enabled: false,
            })
            .select('id')
            .single()

          if (error) {
            return { success: false, error: `Error creando automatizacion: ${error.message}` }
          }

          return { success: true, automationId: data.id }
        } catch (err) {
          return {
            success: false,
            error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    }),

    // ========================================================================
    // 9. updateAutomation
    // ========================================================================
    updateAutomation: tool({
      description:
        'Actualiza una automatizacion existente. SOLO usar despues de que el usuario confirme el preview modificado. No cambia el estado de activacion.',
      inputSchema: z.object({
        automationId: z.string().describe('UUID de la automatizacion a actualizar'),
        name: z.string().min(1).max(100).describe('Nombre de la automatizacion'),
        description: z.string().max(500).optional().describe('Descripcion opcional'),
        trigger_type: z.string().describe('Tipo de trigger'),
        trigger_config: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe('Configuracion del trigger'),
        conditions: z.any().nullable().optional().describe('Condiciones'),
        actions: z
          .array(
            z.object({
              type: z.string(),
              params: z.record(z.string(), z.unknown()).default({}),
              delay: z
                .object({
                  amount: z.number(),
                  unit: z.enum(['minutes', 'hours', 'days']),
                })
                .nullable()
                .optional(),
            })
          )
          .min(1)
          .max(MAX_ACTIONS_PER_AUTOMATION)
          .describe('Lista de acciones'),
      }),
      execute: async (params): Promise<
        { success: true; automationId: string } | { success: false; error: string }
      > => {
        try {
          const supabase = createAdminClient()

          // Verify workspace ownership
          const { data: existing, error: fetchError } = await supabase
            .from('automations')
            .select('id')
            .eq('id', params.automationId)
            .eq('workspace_id', ctx.workspaceId)
            .single()

          if (fetchError || !existing) {
            return {
              success: false,
              error: 'Automatizacion no encontrada o no pertenece a este workspace',
            }
          }

          // Update (do NOT change is_enabled)
          const { error } = await supabase
            .from('automations')
            .update({
              name: params.name,
              description: params.description || null,
              trigger_type: params.trigger_type,
              trigger_config: params.trigger_config,
              conditions: params.conditions || null,
              actions: params.actions,
            })
            .eq('id', params.automationId)
            .eq('workspace_id', ctx.workspaceId)

          if (error) {
            return { success: false, error: `Error actualizando automatizacion: ${error.message}` }
          }

          return { success: true, automationId: params.automationId }
        } catch (err) {
          return {
            success: false,
            error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    }),
  }
}
