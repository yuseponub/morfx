// ============================================================================
// Phase 19: AI Automation Builder - Tool Definitions
// AI SDK tool definitions for the builder agent. Each tool provides
// server-side resource lookup or automation CRUD via createAdminClient.
// ============================================================================

import { z } from 'zod'
import { tool } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BuilderToolContext,
  AutomationPreviewData,
  ResourceValidation,
  DiagramData,
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
// Cycle Detection
// ============================================================================

/**
 * Builds an adjacency graph from existing automations.
 * Maps trigger_type -> set of trigger_types that could be caused by its actions.
 *
 * For example, an automation triggered by "order.created" with action "change_stage"
 * could produce "order.stage_changed" events.
 */
const ACTION_TO_TRIGGER_MAP: Record<string, string[]> = {
  assign_tag: ['tag.assigned'],
  remove_tag: ['tag.removed'],
  change_stage: ['order.stage_changed'],
  update_field: ['field.changed'],
  create_order: ['order.created'],
  duplicate_order: ['order.created'],
  create_task: [], // task.created doesn't exist in catalog
  send_whatsapp_template: ['whatsapp.message_received'], // could trigger message_received on reply
  send_whatsapp_text: ['whatsapp.message_received'],
  send_whatsapp_media: ['whatsapp.message_received'],
  webhook: [],
}

/**
 * Detects cycles in the automation graph using DFS.
 * Returns true if adding an automation with the given trigger/actions
 * would create a cycle with existing automations.
 */
function detectCycles(
  newTriggerType: string,
  newActions: { type: string }[],
  existingAutomations: { trigger_type: string; actions: { type: string }[]; is_enabled: boolean }[]
): boolean {
  // Build adjacency graph: triggerType -> set of triggerTypes it can produce
  const graph = new Map<string, Set<string>>()

  // Add existing enabled automations to the graph
  for (const auto of existingAutomations) {
    if (!auto.is_enabled) continue

    const producedTriggers = new Set<string>()
    for (const action of auto.actions) {
      const triggers = ACTION_TO_TRIGGER_MAP[action.type] || []
      for (const t of triggers) {
        producedTriggers.add(t)
      }
    }
    if (producedTriggers.size > 0) {
      const existing = graph.get(auto.trigger_type) || new Set()
      for (const t of producedTriggers) {
        existing.add(t)
      }
      graph.set(auto.trigger_type, existing)
    }
  }

  // Add the new automation to the graph
  const newProduced = new Set<string>()
  for (const action of newActions) {
    const triggers = ACTION_TO_TRIGGER_MAP[action.type] || []
    for (const t of triggers) {
      newProduced.add(t)
    }
  }
  if (newProduced.size > 0) {
    const existing = graph.get(newTriggerType) || new Set()
    for (const t of newProduced) {
      existing.add(t)
    }
    graph.set(newTriggerType, existing)
  }

  // DFS cycle detection from newTriggerType
  const visited = new Set<string>()
  const recStack = new Set<string>()

  function dfs(node: string): boolean {
    visited.add(node)
    recStack.add(node)

    const neighbors = graph.get(node) || new Set()
    for (const neighbor of neighbors) {
      if (recStack.has(neighbor)) return true // Cycle found
      if (!visited.has(neighbor) && dfs(neighbor)) return true
    }

    recStack.delete(node)
    return false
  }

  // Check cycle starting from each trigger type that the new automation produces
  for (const produced of newProduced) {
    visited.clear()
    recStack.clear()
    recStack.add(newTriggerType) // The new trigger is in the stack
    if (dfs(produced)) return true
  }

  return false
}

// ============================================================================
// Resource Validation
// ============================================================================

async function validateResources(
  workspaceId: string,
  triggerConfig: Record<string, unknown>,
  actions: { type: string; params: Record<string, unknown> }[]
): Promise<ResourceValidation[]> {
  const supabase = createAdminClient()
  const validations: ResourceValidation[] = []

  // Collect all resource IDs to validate
  const pipelineIds = new Set<string>()
  const stageIds = new Set<string>()
  const tagNames = new Set<string>()
  const templateNames = new Set<string>()
  const userIds = new Set<string>()

  // From trigger config
  if (triggerConfig.pipelineId) pipelineIds.add(triggerConfig.pipelineId as string)
  if (triggerConfig.stageId) stageIds.add(triggerConfig.stageId as string)
  if (triggerConfig.tagId) tagNames.add(triggerConfig.tagId as string) // tagId is actually tag name in some contexts

  // From actions
  for (const action of actions) {
    if (action.params.pipelineId) pipelineIds.add(action.params.pipelineId as string)
    if (action.params.targetPipelineId) pipelineIds.add(action.params.targetPipelineId as string)
    if (action.params.stageId) stageIds.add(action.params.stageId as string)
    if (action.params.targetStageId) stageIds.add(action.params.targetStageId as string)
    if (action.params.tagName) tagNames.add(action.params.tagName as string)
    if (action.params.templateName) templateNames.add(action.params.templateName as string)
    if (action.params.assignToUserId) userIds.add(action.params.assignToUserId as string)
  }

  // Validate pipelines
  if (pipelineIds.size > 0) {
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .in('id', Array.from(pipelineIds))

    for (const pid of pipelineIds) {
      const found = pipelines?.find((p) => p.id === pid)
      validations.push({
        type: 'pipeline',
        name: found?.name || pid,
        found: !!found,
        id: found?.id || null,
        details: found ? null : 'Pipeline no encontrado en el workspace',
      })
    }
  }

  // Validate stages
  if (stageIds.size > 0) {
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, name, pipeline_id')
      .in('id', Array.from(stageIds))

    for (const sid of stageIds) {
      const found = stages?.find((s) => s.id === sid)
      // Also verify the stage's pipeline belongs to the workspace
      if (found) {
        const pipelineValidated = validations.find(
          (v) => v.type === 'pipeline' && v.id === found.pipeline_id && v.found
        )
        const valid = pipelineValidated !== undefined || pipelineIds.size === 0
        validations.push({
          type: 'stage',
          name: found.name,
          found: valid,
          id: found.id,
          details: valid ? null : 'La etapa pertenece a un pipeline fuera del workspace',
        })
      } else {
        validations.push({
          type: 'stage',
          name: sid,
          found: false,
          id: null,
          details: 'Etapa no encontrada',
        })
      }
    }
  }

  // Validate tags
  if (tagNames.size > 0) {
    const { data: tags } = await supabase
      .from('tags')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .in('name', Array.from(tagNames))

    for (const tagName of tagNames) {
      const found = tags?.find((t) => t.name === tagName)
      validations.push({
        type: 'tag',
        name: tagName,
        found: !!found,
        id: found?.id || null,
        details: found ? null : 'Tag no encontrado en el workspace. Debe crearse primero.',
      })
    }
  }

  // Validate templates
  if (templateNames.size > 0) {
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('id, name, status')
      .eq('workspace_id', workspaceId)
      .in('name', Array.from(templateNames))

    for (const tmplName of templateNames) {
      const found = templates?.find((t) => t.name === tmplName)
      let details: string | null = null
      if (!found) {
        details = 'Template no encontrado en el workspace'
      } else if (found.status !== 'APPROVED') {
        details = `Template tiene status "${found.status}". Solo templates APPROVED pueden enviarse.`
      }
      validations.push({
        type: 'template',
        name: tmplName,
        found: !!found,
        id: found?.id || null,
        details,
      })
    }
  }

  // Validate users
  if (userIds.size > 0) {
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('user_id', Array.from(userIds))

    for (const uid of userIds) {
      const found = members?.find((m) => m.user_id === uid)
      validations.push({
        type: 'user',
        name: uid,
        found: !!found,
        id: found ? uid : null,
        details: found ? null : 'Usuario no es miembro del workspace',
      })
    }
  }

  return validations
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
      }),
      execute: async (params): Promise<AutomationPreviewData | { error: string }> => {
        try {
          const supabase = createAdminClient()

          // 1. Validate resources
          const resourceValidations = await validateResources(
            ctx.workspaceId,
            params.trigger_config,
            params.actions
          )

          // 2. Check for duplicate automations
          let duplicateWarning: string | null = null
          const { data: existingAutos } = await supabase
            .from('automations')
            .select('id, name, trigger_type, trigger_config, actions, is_enabled')
            .eq('workspace_id', ctx.workspaceId)

          if (existingAutos) {
            const duplicate = existingAutos.find(
              (a) =>
                a.trigger_type === params.trigger_type &&
                JSON.stringify(a.trigger_config) === JSON.stringify(params.trigger_config)
            )
            if (duplicate) {
              duplicateWarning = `Ya existe una automatizacion con el mismo trigger: "${duplicate.name}" (${duplicate.is_enabled ? 'activa' : 'desactivada'}). Esto puede ser intencional, pero verifica.`
            }
          }

          // 3. Check for cycles
          const existingForCycle = (existingAutos || []).map((a) => ({
            trigger_type: a.trigger_type,
            actions: (Array.isArray(a.actions) ? a.actions : []) as { type: string }[],
            is_enabled: a.is_enabled,
          }))

          const hasCycles = detectCycles(
            params.trigger_type,
            params.actions,
            existingForCycle
          )

          // 4. Generate diagram placeholder (Plan 04 will add real diagram generation)
          const emptyDiagram: DiagramData = {
            nodes: [],
            edges: [],
            validationErrors: [],
          }

          const preview: AutomationPreviewData = {
            name: params.name,
            description: params.description || '',
            trigger_type: params.trigger_type as TriggerType,
            trigger_config: params.trigger_config,
            conditions: params.conditions || null,
            actions: params.actions as AutomationAction[],
            diagram: emptyDiagram,
            resourceValidations,
            hasCycles,
            duplicateWarning,
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
