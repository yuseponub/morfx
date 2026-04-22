// ============================================================================
// Phase 19: AI Automation Builder — Validation Module
// Resource validation, cycle detection, and duplicate finding.
// Pure server-side module — all DB queries use createAdminClient with
// workspace_id filtering for isolation.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { ResourceValidation } from '@/lib/builder/types'
import type { ConditionGroup } from '@/lib/automations/types'

// ============================================================================
// AutoNode shape (shared between cycle DFS + conditionsPreventActivation)
// ============================================================================

/**
 * Automation node shape consumed by build-time cycle detection.
 * Only `conditions` is read by conditionsPreventActivation; the rest are used
 * by `detectCycles` DFS walking.
 */
export type AutoNode = {
  name: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  conditions: unknown
  actions: { type: string; params: Record<string, unknown> }[]
}

// ============================================================================
// conditionsPreventActivation — build-time cycle detection layer 1 (D-07)
// ============================================================================

/**
 * Local condition shape for build-time cycle detection.
 *
 * Uses short operator names (`eq`/`neq`/...) which mirror the Pattern 6 RESEARCH
 * canonical form. Runtime condition evaluation lives in `src/lib/automations/`
 * with the longer names (`equals`/`not_equals`/...) — the build-time validator
 * accepts the short form for D-07 capa 1 and applies conservative fallback when
 * operators aren't recognized (so legacy long-form conditions do not silently
 * miss cycles).
 */
type BuildTimeConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'in'
  | 'not_in'

interface BuildTimeConditionRule {
  field: string
  operator: BuildTimeConditionOperator
  value: unknown
}

interface BuildTimeConditionGroup {
  logic: 'AND' | 'OR'
  conditions: Array<BuildTimeConditionRule | BuildTimeConditionGroup>
}

/**
 * Return true if the target automation's conditions would DEFINITELY prevent
 * activation given the action's params. Return false if conditions allow
 * activation OR the value cannot be determined statically (conservative —
 * let the cycle be detected / reported upstream).
 *
 * Semantics (action=A -> target=T has conditions C; we're asking
 * "would C.evaluate(A.params) be FALSE?"):
 *  - AND group: any child-prevents -> group prevents
 *  - OR  group: all children prevent -> group prevents
 *
 * Key insight (Pattern 6 insight 1): false-positive (warn about a non-cycle)
 * is acceptable; false-negative (miss a real cycle) is NOT. So when data is
 * insufficient, return `false` = does NOT prevent = caller will WARN the user
 * about a potential cycle (safer default).
 *
 * D-07 layer 1 (CONTEXT.md). No feature flag (D-20 — pure function, no I/O,
 * executes only during builder save).
 */
export function conditionsPreventActivation(
  action: { type: string; params: Record<string, unknown> },
  target: AutoNode,
): boolean {
  const conditions = target.conditions as BuildTimeConditionGroup | null

  if (!conditions?.conditions || conditions.conditions.length === 0) return false

  function evalGroup(group: BuildTimeConditionGroup): boolean {
    const childResults = group.conditions.map((child) => {
      if (
        child &&
        typeof child === 'object' &&
        'logic' in child &&
        'conditions' in child
      ) {
        return evalGroup(child as BuildTimeConditionGroup)
      }
      return evalRule(child as BuildTimeConditionRule)
    })

    // AND: any prevents -> group prevents (some r === true)
    // OR : all prevent  -> group prevents (every r === true)
    return group.logic === 'AND'
      ? childResults.some((r) => r === true)
      : childResults.every((r) => r === true)
  }

  function evalRule(rule: BuildTimeConditionRule): boolean {
    if (!rule.field) return false // conservative

    const extracted = extractActionValue(action.type, action.params, rule.field)
    if (extracted === undefined) return false // cannot determine -> conservative

    const value = rule.value

    switch (rule.operator) {
      case 'eq':
        return extracted !== value
      case 'neq':
        return extracted === value
      case 'gt':
        return Number(extracted) <= Number(value)
      case 'gte':
        return Number(extracted) < Number(value)
      case 'lt':
        return Number(extracted) >= Number(value)
      case 'lte':
        return Number(extracted) > Number(value)
      case 'contains':
        return !String(extracted).includes(String(value))
      case 'in':
        return !Array.isArray(value) || !(value as unknown[]).includes(extracted)
      case 'not_in':
        return Array.isArray(value) && (value as unknown[]).includes(extracted)
      default:
        return false // unknown operator -> conservative
    }
  }

  function extractActionValue(
    actionType: string,
    params: Record<string, unknown>,
    field: string,
  ): unknown {
    // Spanish field paths match the runtime automation engine convention
    switch (field) {
      case 'orden.stage_id':
        return params.targetStageId ?? params.stageId
      case 'orden.pipeline_id':
        return params.targetPipelineId ?? params.pipelineId
      case 'tag.nombre':
        return params.tagName
      case 'tag.id':
        return params.tagId
      case 'orden.valor':
      case 'orden.total_value':
        // Actions don't set order value directly -> runtime unpredictable
        return undefined
      case 'contacto.nombre':
      case 'contacto.telefono':
        // Actions don't set contact fields -> runtime unpredictable
        return undefined
      default: {
        // Custom fields via update_field action (e.g., orden.custom_prioridad)
        if (actionType === 'update_field') {
          const normalizedField = field.replace(/^orden\.|^contacto\./, '')
          if (params.fieldName === normalizedField) return params.value
        }
        // Unknown field -> conservative (don't prevent; let cycle be flagged)
        return undefined
      }
    }
  }

  return evalGroup(conditions)
}

// ============================================================================
// Action -> Trigger Mapping (for cycle detection)
// ============================================================================

/**
 * Maps action types to the trigger types they can produce.
 * Used to build the directed graph for cycle detection.
 */
const ACTION_TO_TRIGGER_MAP: Record<string, string[]> = {
  change_stage: ['order.stage_changed'],
  assign_tag: ['tag.assigned'],
  remove_tag: ['tag.removed'],
  create_order: ['order.created'],
  duplicate_order: ['order.created'],
  create_task: [], // task.completed is indirect, not immediate
  update_field: ['field.changed'],
  send_whatsapp_template: [],
  send_whatsapp_text: [],
  send_whatsapp_media: [],
  send_sms: [],  // SMS doesn't produce any trigger events
  webhook: [],
}

// ============================================================================
// 1. validateResources
// ============================================================================

/**
 * Validate that all resources referenced in an automation exist in the workspace.
 * Checks pipelines, stages, tags, templates, and users.
 *
 * Returns a ResourceValidation[] with found=true/false for each resource.
 * Templates also get a warning if they exist but are not APPROVED by Meta.
 */
export async function validateResources(
  workspaceId: string,
  automation: {
    trigger_type: string
    trigger_config: Record<string, unknown>
    actions: { type: string; params: Record<string, unknown> }[]
  }
): Promise<ResourceValidation[]> {
  try {
    const supabase = createAdminClient()
    const validations: ResourceValidation[] = []

    // Collect all resource references
    const pipelineIds = new Set<string>()
    const stageIds = new Set<string>()
    const tagNames = new Set<string>()
    const tagIds = new Set<string>()
    const templateNames = new Set<string>()
    const userIds = new Set<string>()

    // From trigger config
    if (automation.trigger_config.pipelineId) {
      pipelineIds.add(automation.trigger_config.pipelineId as string)
    }
    if (automation.trigger_config.stageId) {
      stageIds.add(automation.trigger_config.stageId as string)
    }
    if (automation.trigger_config.tagId) {
      tagIds.add(automation.trigger_config.tagId as string)
    }

    // From actions
    for (const action of automation.actions) {
      if (action.params.pipelineId) pipelineIds.add(action.params.pipelineId as string)
      if (action.params.targetPipelineId) pipelineIds.add(action.params.targetPipelineId as string)
      if (action.params.stageId) stageIds.add(action.params.stageId as string)
      if (action.params.targetStageId) stageIds.add(action.params.targetStageId as string)

      if (
        (action.type === 'assign_tag' || action.type === 'remove_tag') &&
        action.params.tagName
      ) {
        tagNames.add(action.params.tagName as string)
      }

      if (action.type === 'send_whatsapp_template' && action.params.templateName) {
        templateNames.add(action.params.templateName as string)
      }

      if (action.type === 'create_task' && action.params.assignToUserId) {
        userIds.add(action.params.assignToUserId as string)
      }
    }

    // ---- Validate Pipelines ----
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
          name: found?.name ?? pid,
          found: !!found,
          id: found?.id ?? null,
          details: found ? null : `No se encontro el pipeline '${pid}' en el workspace`,
        })
      }
    }

    // ---- Validate Stages ----
    if (stageIds.size > 0) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, name, pipeline_id')
        .in('id', Array.from(stageIds))

      for (const sid of stageIds) {
        const found = stages?.find((s) => s.id === sid)
        if (found) {
          // Verify the stage's pipeline belongs to the workspace
          const pipelineIsValid = validations.some(
            (v) => v.type === 'pipeline' && v.id === found.pipeline_id && v.found
          )
          // If we didn't validate the pipeline (not in our set), give benefit of doubt
          const valid = pipelineIsValid || !pipelineIds.has(found.pipeline_id)
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
            details: `No se encontro la etapa '${sid}'`,
          })
        }
      }
    }

    // ---- Validate Tag IDs (from trigger_config) ----
    if (tagIds.size > 0) {
      const { data: tagsById } = await supabase
        .from('tags')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .in('id', Array.from(tagIds))

      for (const tid of tagIds) {
        const found = tagsById?.find((t) => t.id === tid)
        validations.push({
          type: 'tag',
          name: found?.name ?? tid,
          found: !!found,
          id: found?.id ?? null,
          details: found ? null : `No se encontro el tag con ID '${tid}' en el workspace`,
        })
      }
    }

    // ---- Validate Tags (case-insensitive) ----
    if (tagNames.size > 0) {
      const { data: tags } = await supabase
        .from('tags')
        .select('id, name')
        .eq('workspace_id', workspaceId)

      for (const tagName of tagNames) {
        const found = tags?.find(
          (t) => t.name.toLowerCase() === tagName.toLowerCase()
        )
        validations.push({
          type: 'tag',
          name: tagName,
          found: !!found,
          id: found?.id ?? null,
          details: found ? null : `No se encontro el tag '${tagName}' en el workspace`,
        })
      }
    }

    // ---- Validate Templates (existence + approval status) ----
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
          details = `No se encontro el template '${tmplName}' en el workspace`
        } else if (found.status !== 'APPROVED') {
          details = `El template '${tmplName}' no esta aprobado por Meta (status: ${found.status})`
        }

        validations.push({
          type: 'template',
          name: tmplName,
          found: !!found,
          id: found?.id ?? null,
          details,
        })
      }
    }

    // ---- Validate Users (workspace members) ----
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
  } catch (err) {
    console.error('[validation] Error validating resources:', err)
    return []
  }
}

// ============================================================================
// 2. detectCycles
// ============================================================================

/**
 * Detect if adding a new automation would create a cycle in the automation graph.
 *
 * Strategy:
 * 1. Load all existing enabled automations for the workspace
 * 2. Build a directed graph considering trigger_config specificity
 * 3. Compare action params against trigger configs + conditions to determine
 *    if the produced event would actually activate the target automation
 * 4. Classify as: no_cycle, possible_cycle (warning), or inevitable_cycle (blocker)
 *
 * Key insight: A generic trigger_type match is NOT enough. If an action produces
 * an event in pipeline B but the target automation only triggers for pipeline A,
 * there's no cycle. Similarly, conditions that filter by specific resource IDs
 * can break what looks like a cycle at the trigger_type level.
 */
export async function detectCycles(
  workspaceId: string,
  newAutomation: {
    trigger_type: string
    trigger_config: Record<string, unknown>
    conditions?: ConditionGroup | null
    actions: { type: string; params: Record<string, unknown> }[]
  }
): Promise<{ hasCycles: boolean; cyclePath: string[]; severity: 'none' | 'warning' | 'blocker' }> {
  try {
    const supabase = createAdminClient()

    const { data: existingAutos, error } = await supabase
      .from('automations')
      .select('id, name, trigger_type, trigger_config, conditions, actions, is_enabled')
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('[validation] Error loading automations for cycle detection:', error)
      return { hasCycles: false, cyclePath: [], severity: 'none' }
    }

    // Build list of all automations (existing enabled + new one).
    // AutoNode is module-scoped (see top of file) — shared with conditionsPreventActivation.
    const allAutos: AutoNode[] = []

    for (const auto of existingAutos || []) {
      if (!auto.is_enabled) continue
      allAutos.push({
        name: auto.name,
        trigger_type: auto.trigger_type,
        trigger_config: (auto.trigger_config || {}) as Record<string, unknown>,
        conditions: auto.conditions,
        actions: (Array.isArray(auto.actions) ? auto.actions : []) as { type: string; params: Record<string, unknown> }[],
      })
    }

    const newNode: AutoNode = {
      name: '(nueva automatizacion)',
      trigger_type: newAutomation.trigger_type,
      trigger_config: newAutomation.trigger_config || {},
      conditions: newAutomation.conditions,
      actions: newAutomation.actions,
    }
    allAutos.push(newNode)

    // Check if an action could activate a specific automation
    // Returns: 'no' | 'possible' | 'definite'
    function couldActionActivate(
      action: { type: string; params: Record<string, unknown> },
      target: AutoNode
    ): 'no' | 'possible' | 'definite' {
      const producedTriggers = ACTION_TO_TRIGGER_MAP[action.type] || []
      if (!producedTriggers.includes(target.trigger_type)) return 'no'

      // Generic trigger_type match exists. Now check specificity.
      const tc = target.trigger_config
      const ap = action.params

      switch (target.trigger_type) {
        case 'tag.assigned': {
          // If target triggers on a specific tag, check if action assigns THAT tag
          const targetTagId = tc.tagId as string | undefined
          const actionTagId = ap.tagId as string | undefined
          const actionTagName = ap.tagName as string | undefined
          if (targetTagId && actionTagId && targetTagId !== actionTagId) return 'no'
          if (targetTagId && !actionTagId && !actionTagName) return 'possible'
          if (targetTagId && actionTagId && targetTagId === actionTagId) return 'definite'
          return 'possible'
        }

        case 'tag.removed': {
          const targetTagId = tc.tagId as string | undefined
          const actionTagId = ap.tagId as string | undefined
          if (targetTagId && actionTagId && targetTagId !== actionTagId) return 'no'
          return 'possible'
        }

        case 'order.stage_changed': {
          // If target triggers on a specific pipeline/stage, check if action
          // moves to THAT pipeline/stage
          const targetPipelineId = tc.pipelineId as string | undefined
          const targetStageId = tc.stageId as string | undefined
          const actionPipelineId = (ap.targetPipelineId || ap.pipelineId) as string | undefined
          const actionStageId = (ap.targetStageId || ap.stageId) as string | undefined

          if (targetPipelineId && actionPipelineId && targetPipelineId !== actionPipelineId) return 'no'
          if (targetStageId && actionStageId && targetStageId !== actionStageId) return 'no'
          if (targetPipelineId && actionPipelineId && targetPipelineId === actionPipelineId) {
            if (targetStageId && actionStageId && targetStageId === actionStageId) return 'definite'
            return 'possible'
          }
          return 'possible'
        }

        case 'order.created': {
          // duplicate_order/create_order produces order.created
          // If target triggers on a specific pipeline, check if action targets that pipeline
          const targetPipelineId = tc.pipelineId as string | undefined
          const actionPipelineId = (ap.targetPipelineId || ap.pipelineId) as string | undefined
          if (targetPipelineId && actionPipelineId && targetPipelineId !== actionPipelineId) return 'no'
          if (targetPipelineId && actionPipelineId && targetPipelineId === actionPipelineId) return 'definite'
          return 'possible'
        }

        default:
          return 'possible'
      }
    }

    // Note: `conditionsPreventActivation` is now module-scoped (top of file) —
    // D-07 layer 1 expanded to AND/OR recursive + 9 operators + 5+ field namespaces
    // with conservative-false fallback (Pattern 6 RESEARCH, CONTEXT.md §D-20).

    // DFS with specificity-aware edge evaluation
    let worstSeverity: 'none' | 'warning' | 'blocker' = 'none'
    const cyclePath: string[] = []

    function dfs(
      current: AutoNode,
      target: AutoNode,
      visited: Set<string>,
      path: string[]
    ): 'none' | 'warning' | 'blocker' {
      let result: 'none' | 'warning' | 'blocker' = 'none'

      for (const action of current.actions) {
        // Check if this action could re-activate the original target
        const activation = couldActionActivate(action, target)
        if (activation === 'no') continue

        // Check if target's conditions would prevent it
        if (conditionsPreventActivation(action, target)) continue

        // Direct cycle back to target
        if (activation === 'definite') return 'blocker'
        if (activation === 'possible') result = 'warning'

        // Check indirect cycles through other automations
        for (const other of allAutos) {
          if (other === current || other === target) continue
          if (visited.has(other.name)) continue

          const otherActivation = couldActionActivate(action, other)
          if (otherActivation === 'no') continue
          if (conditionsPreventActivation(action, other)) continue

          visited.add(other.name)
          path.push(other.name)
          const indirect = dfs(other, target, visited, path)
          if (indirect === 'blocker') return 'blocker'
          if (indirect === 'warning') result = 'warning'
          path.pop()
          visited.delete(other.name)
        }
      }

      return result
    }

    const visited = new Set<string>([newNode.name])
    const path = [newNode.name]
    worstSeverity = dfs(newNode, newNode, visited, path)

    if (worstSeverity !== 'none') {
      cyclePath.push(...path)
    }

    return {
      hasCycles: worstSeverity !== 'none',
      cyclePath,
      severity: worstSeverity,
    }
  } catch (err) {
    console.error('[validation] Error detecting cycles:', err)
    return { hasCycles: false, cyclePath: [], severity: 'none' }
  }
}

// ============================================================================
// 3. findDuplicateAutomations
// ============================================================================

/**
 * Find existing automations that may conflict with a new/updated automation.
 *
 * Compares by trigger_type and trigger_config fields:
 * - order triggers: same pipelineId + stageId
 * - tag triggers: same tagId
 * - keyword_match: overlapping keywords
 * - others: same trigger_type alone is enough to warn
 *
 * If excludeId is provided (for updates), that automation is excluded.
 */
export async function findDuplicateAutomations(
  workspaceId: string,
  automation: {
    trigger_type: string
    trigger_config: Record<string, unknown>
  },
  excludeId?: string
): Promise<{ isDuplicate: boolean; existing: { id: string; name: string }[] }> {
  try {
    const supabase = createAdminClient()

    let query = supabase
      .from('automations')
      .select('id, name, trigger_type, trigger_config')
      .eq('workspace_id', workspaceId)
      .eq('trigger_type', automation.trigger_type)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data: existing, error } = await query

    if (error) {
      console.error('[validation] Error finding duplicates:', error)
      return { isDuplicate: false, existing: [] }
    }

    if (!existing || existing.length === 0) {
      return { isDuplicate: false, existing: [] }
    }

    // Filter for meaningful overlap based on trigger type
    const duplicates = existing.filter((auto) => {
      const existingConfig = (auto.trigger_config || {}) as Record<string, unknown>
      const newConfig = automation.trigger_config

      switch (automation.trigger_type) {
        case 'order.stage_changed': {
          // Same pipeline + stage = strong duplicate
          const samePipeline =
            !newConfig.pipelineId ||
            !existingConfig.pipelineId ||
            newConfig.pipelineId === existingConfig.pipelineId
          const sameStage =
            !newConfig.stageId ||
            !existingConfig.stageId ||
            newConfig.stageId === existingConfig.stageId
          return samePipeline && sameStage
        }

        case 'order.created': {
          const samePipeline =
            !newConfig.pipelineId ||
            !existingConfig.pipelineId ||
            newConfig.pipelineId === existingConfig.pipelineId
          return samePipeline
        }

        case 'tag.assigned':
        case 'tag.removed': {
          const sameTag =
            !newConfig.tagId ||
            !existingConfig.tagId ||
            newConfig.tagId === existingConfig.tagId
          return sameTag
        }

        case 'whatsapp.keyword_match': {
          // Check for overlapping keywords
          const newKeywords = (newConfig.keywords || []) as string[]
          const existingKeywords = (existingConfig.keywords || []) as string[]

          if (newKeywords.length === 0 || existingKeywords.length === 0) {
            return true // Broad match = potential conflict
          }

          const newSet = new Set(newKeywords.map((k) => k.toLowerCase()))
          return existingKeywords.some((k) => newSet.has(k.toLowerCase()))
        }

        case 'field.changed': {
          const sameField =
            !newConfig.fieldName ||
            !existingConfig.fieldName ||
            newConfig.fieldName === existingConfig.fieldName
          return sameField
        }

        default:
          // For other trigger types (contact.created, message_received, task.*),
          // same trigger_type alone is enough to warn
          return true
      }
    })

    return {
      isDuplicate: duplicates.length > 0,
      existing: duplicates.map((d) => ({ id: d.id, name: d.name })),
    }
  } catch (err) {
    console.error('[validation] Error finding duplicates:', err)
    return { isDuplicate: false, existing: [] }
  }
}
