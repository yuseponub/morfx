// ============================================================================
// Phase 17: CRM Automations Engine — Automation Runner
// Inngest durable functions that listen for trigger events, evaluate conditions,
// and execute action sequences with durable execution guarantees.
//
// When a trigger event fires (emitted by trigger-emitter.ts), Inngest invokes
// the matching runner. The runner loads all enabled automations for that trigger
// type and workspace, evaluates conditions, and executes actions sequentially
// using step.run() and step.sleep().
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateConditionGroup } from '@/lib/automations/condition-evaluator'
import { executeAction } from '@/lib/automations/action-executor'
import { buildTriggerContext } from '@/lib/automations/variable-resolver'
import { MAX_CASCADE_DEPTH } from '@/lib/automations/constants'
import { getPlatformConfig } from '@/lib/domain/platform-config'
import type {
  Automation,
  TriggerType,
  TriggerConfig,
  TriggerContext,
  ConditionGroup,
  AutomationAction,
  ActionLog,
} from '@/lib/automations/types'

// ============================================================================
// Types
// ============================================================================

/** Inngest event-to-trigger-type mapping */
const EVENT_TO_TRIGGER: Record<string, TriggerType> = {
  'automation/order.stage_changed': 'order.stage_changed',
  'automation/tag.assigned': 'tag.assigned',
  'automation/tag.removed': 'tag.removed',
  'automation/contact.created': 'contact.created',
  'automation/order.created': 'order.created',
  'automation/field.changed': 'field.changed',
  'automation/whatsapp.message_received': 'whatsapp.message_received',
  'automation/whatsapp.keyword_match': 'whatsapp.keyword_match',
  'automation/task.completed': 'task.completed',
  'automation/task.overdue': 'task.overdue',
  'automation/shopify.order_created': 'shopify.order_created',
  'automation/shopify.draft_order_created': 'shopify.draft_order_created',
  'automation/shopify.order_updated': 'shopify.order_updated',
  // Robot triggers (Phase 23: Inngest Orchestrator + Callback API)
  'automation/robot.coord.completed': 'robot.coord.completed',
  // Robot OCR triggers (Phase 27: Robot OCR de Guias)
  'automation/robot.ocr.completed': 'robot.ocr.completed',
  // Robot Guide Lookup triggers (buscar guias coord)
  'automation/robot.guide_lookup.completed': 'robot.guide_lookup.completed',
  // Robot Guide Generation triggers (generar guias inter/bogota/envia)
  'automation/robot.guide_gen.completed': 'robot.guide_gen.completed',
}

// ============================================================================
// Trigger Config Matching
// ============================================================================

/**
 * Check if the event data matches the automation's trigger_config filters.
 *
 * Each trigger type has optional filters (pipeline, stage, tag, field, keywords).
 * An empty filter means "match all". A configured filter must match exactly.
 */
function matchesTriggerConfig(
  triggerType: TriggerType,
  triggerConfig: TriggerConfig,
  eventData: Record<string, unknown>
): boolean {
  switch (triggerType) {
    case 'order.stage_changed': {
      // Pipeline filter
      if (triggerConfig.pipelineId && triggerConfig.pipelineId !== eventData.pipelineId) {
        return false
      }
      // Stage filter (target stage)
      if (triggerConfig.stageId && triggerConfig.stageId !== eventData.newStageId) {
        return false
      }
      return true
    }

    case 'tag.assigned':
    case 'tag.removed': {
      // Tag filter
      if (triggerConfig.tagId && triggerConfig.tagId !== eventData.tagId) {
        return false
      }
      return true
    }

    case 'order.created': {
      // Pipeline filter
      if (triggerConfig.pipelineId && triggerConfig.pipelineId !== eventData.pipelineId) {
        return false
      }
      // Stage filter
      if (triggerConfig.stageId && triggerConfig.stageId !== eventData.stageId) {
        return false
      }
      return true
    }

    case 'field.changed': {
      // Field name filter
      if (triggerConfig.fieldName && triggerConfig.fieldName !== eventData.fieldName) {
        return false
      }
      return true
    }

    case 'whatsapp.keyword_match': {
      // Keywords filter — event already matched a keyword (keywordMatched field present)
      // The trigger-emitter only fires this event when a keyword matches,
      // but we still verify it's one of the configured keywords
      if (triggerConfig.keywords && triggerConfig.keywords.length > 0) {
        const matched = String(eventData.keywordMatched || '').toLowerCase()
        const configKeywords = triggerConfig.keywords.map(k => k.toLowerCase())
        if (!configKeywords.includes(matched)) {
          return false
        }
      }
      return true
    }

    // These triggers have no config filters
    case 'contact.created':
    case 'whatsapp.message_received':
    case 'task.completed':
    case 'task.overdue':
    // Shopify triggers have no config filters (configFields empty)
    case 'shopify.order_created':
    case 'shopify.draft_order_created':
    case 'shopify.order_updated':
    // Robot triggers have no config filters (Phase 23, Phase 27)
    case 'robot.coord.completed':
    case 'robot.ocr.completed':
    case 'robot.guide_lookup.completed':
    case 'robot.guide_gen.completed':
      return true

    default:
      return true
  }
}

// ============================================================================
// Build TriggerContext from event data
// ============================================================================

/**
 * Build a TriggerContext object from the flat Inngest event data.
 * This context is used for condition evaluation and variable resolution.
 */
function buildContextFromEvent(
  eventData: Record<string, unknown>
): TriggerContext {
  return {
    workspaceId: String(eventData.workspaceId || ''),
    // Order context
    orderId: eventData.orderId as string | undefined,
    orderValue: eventData.orderValue as number | undefined,
    previousStageId: eventData.previousStageId as string | undefined,
    previousStageName: eventData.previousStageName as string | undefined,
    newStageId: eventData.newStageId as string | undefined,
    newStageName: eventData.newStageName as string | undefined,
    pipelineId: eventData.pipelineId as string | undefined,
    pipelineName: eventData.pipelineName as string | undefined,
    // Contact context
    contactId: eventData.contactId as string | undefined,
    contactName: eventData.contactName as string | undefined,
    contactPhone: (eventData.contactPhone ?? eventData.phone) as string | undefined,
    contactEmail: (eventData.contactEmail ?? eventData.email) as string | undefined,
    contactCity: eventData.contactCity as string | undefined,
    contactDepartment: eventData.contactDepartment as string | undefined,
    contactAddress: eventData.contactAddress as string | undefined,
    // Tag context
    tagId: eventData.tagId as string | undefined,
    tagName: eventData.tagName as string | undefined,
    // WhatsApp context
    conversationId: eventData.conversationId as string | undefined,
    messageContent: eventData.messageContent as string | undefined,
    // Task context
    taskId: eventData.taskId as string | undefined,
    taskTitle: eventData.taskTitle as string | undefined,
    // Shopify context (pass through for action enrichment)
    products: eventData.products as unknown[] | undefined,
    shippingAddress: eventData.shippingAddress as string | undefined,
    shippingCity: eventData.shippingCity as string | undefined,
    shippingDepartment: eventData.shippingDepartment as string | undefined,
    orderName: eventData.orderName as string | undefined,
    shopifyOrderNumber: eventData.shopifyOrderNumber as string | undefined,
    shopifyOrderId: eventData.shopifyOrderId as number | undefined,
  }
}

// ============================================================================
// Delay helper
// ============================================================================

/**
 * Convert a delay config to a sleep duration string for Inngest step.sleep().
 * Returns a human-readable duration string like "5m", "2h", "1d".
 */
function delaySleepDuration(delay: { amount: number; unit: string }): string {
  switch (delay.unit) {
    case 'seconds':
      return `${delay.amount}s`
    case 'minutes':
      return `${delay.amount}m`
    case 'hours':
      return `${delay.amount}h`
    case 'days':
      return `${delay.amount}d`
    default:
      return `${delay.amount}m`
  }
}

// ============================================================================
// Core Runner Logic
// ============================================================================

/**
 * Process a single automation against the trigger event data.
 * Returns execution metadata for logging.
 */
async function processAutomation(
  automation: Automation,
  eventData: Record<string, unknown>,
  triggerContext: TriggerContext,
  variableContext: Record<string, unknown>,
  cascadeDepth: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step: any,
  // Wave 2 (D-07 actor mapping, Pitfall 10 RESEARCH): plumb automation metadata
  // down to executeChangeStage for order_stage_history.actor_id/actor_label.
  triggerType: TriggerType
): Promise<{
  status: 'success' | 'failed' | 'cancelled'
  actionsLog: ActionLog[]
  errorMessage: string | null
}> {
  const actionsLog: ActionLog[] = []

  // Execute actions sequentially
  for (let i = 0; i < automation.actions.length; i++) {
    const action: AutomationAction = automation.actions[i]

    // Mid-execution disable check: verify automation is still enabled before each action
    const isStillEnabled = await step.run(
      `check-enabled-${automation.id}-action-${i}`,
      async () => {
        const supabase = createAdminClient()
        const { data } = await supabase
          .from('automations')
          .select('is_enabled')
          .eq('id', automation.id)
          .single()
        return data?.is_enabled ?? false
      }
    )

    if (!isStillEnabled) {
      console.log(
        `[automation-runner] Automation ${automation.id} disabled mid-execution at action ${i}`
      )
      // Mark remaining actions as skipped
      for (let j = i; j < automation.actions.length; j++) {
        actionsLog.push({
          index: j,
          type: automation.actions[j].type,
          status: 'skipped',
          duration_ms: 0,
        })
      }
      return { status: 'cancelled', actionsLog, errorMessage: 'Automation disabled mid-execution' }
    }

    // Handle delay before action
    if (action.delay && action.delay.amount > 0) {
      const sleepId = `delay-${automation.id}-action-${i}`
      const duration = delaySleepDuration(action.delay)
      await step.sleep(sleepId, duration)
    }

    // Wave 2 (Pitfall 10 RESEARCH): propagate automation metadata so
    // executeChangeStage can populate order_stage_history.actor_id /
    // actor_label / trigger_event. action-executor.ts consumes this via
    // the 6th arg (automationContext).
    const automationContext = {
      automationId: automation.id,
      automationName: automation.name ?? 'unnamed',
      triggerType,
    }

    // Execute the action in a durable step
    const actionResult = await step.run(
      `action-${automation.id}-${i}-${action.type}`,
      async () => {
        return executeAction(
          action,
          triggerContext,
          automation.workspace_id,
          cascadeDepth,
          variableContext,
          automationContext,
        )
      }
    )

    actionsLog.push({
      index: i,
      type: action.type,
      status: actionResult.success ? 'success' : 'failed',
      result: actionResult.result,
      duration_ms: actionResult.duration_ms,
      error: actionResult.error,
    })

    // Wave 2 (D-22 observability): narrow `stage_changed_concurrently` so a CAS
    // reject is logged distinctly from a generic action failure. This is a
    // warning log (not a bubble-up error) — the automation chain is naturally
    // aborted by the existing `stop on first failure` branch below.
    if (
      !actionResult.success &&
      actionResult.error === 'stage_changed_concurrently'
    ) {
      console.warn(
        `[automation-runner] stage_change_rejected_cas for order ` +
          `${triggerContext.orderId ?? 'unknown'} via automation ${automation.id}`
      )
    }

    // Propagate newly-created entity IDs into context for subsequent actions.
    // Mutations inside step.run don't survive Inngest replays (each replay is
    // a fresh lambda) — this merge must happen in the parent scope using the
    // memoized step return value, which Inngest persists across replays.
    if (actionResult.success && actionResult.result && typeof actionResult.result === 'object') {
      const resultObj = actionResult.result as Record<string, unknown>
      let newOrderId: string | undefined
      if (action.type === 'create_order' && typeof resultObj.orderId === 'string') {
        newOrderId = resultObj.orderId
      } else if (action.type === 'duplicate_order' && typeof resultObj.newOrderId === 'string') {
        newOrderId = resultObj.newOrderId
      }
      if (newOrderId) {
        triggerContext.orderId = newOrderId
        const orden = (variableContext.orden as Record<string, unknown> | undefined) ?? {}
        orden.id = newOrderId
        variableContext.orden = orden
      }
    }

    // Stop on first failure
    if (!actionResult.success) {
      // Mark remaining actions as skipped
      for (let j = i + 1; j < automation.actions.length; j++) {
        actionsLog.push({
          index: j,
          type: automation.actions[j].type,
          status: 'skipped',
          duration_ms: 0,
        })
      }
      return {
        status: 'failed',
        actionsLog,
        errorMessage: actionResult.error || `Action ${action.type} failed`,
      }
    }
  }

  return { status: 'success', actionsLog, errorMessage: null }
}

// ============================================================================
// Exported Helpers (Wave 2 — CRM Stage Integrity)
// ============================================================================

/**
 * Kill-switch query — checks if an order has had > threshold non-manual stage
 * changes in the last windowMs milliseconds. Fail-open: query error returns
 * shouldSkip=false (Pattern 5 RESEARCH). Exported for unit testing (WARNING 3).
 *
 * D-07 layer 2 + D-20. Reads from `order_stage_history` filtering out `manual`
 * rows (human Kanban drags don't count against the runaway-automation quota).
 */
export async function checkKillSwitch(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  threshold = 5,
  windowMs = 60_000,
): Promise<{ shouldSkip: boolean; recentChanges: number }> {
  const sinceIso = new Date(Date.now() - windowMs).toISOString()
  const { count, error } = await admin
    .from('order_stage_history')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .neq('source', 'manual')
    .gt('changed_at', sinceIso)
  if (error) {
    console.error('[kill-switch] query failed:', error.message)
    return { shouldSkip: false, recentChanges: 0 } // fail-open
  }
  const recentChanges = count ?? 0
  return { shouldSkip: recentChanges > threshold, recentChanges }
}

/**
 * Cascade cap audit — writes a row to `order_stage_history` marking where a
 * cascade was truncated (source='cascade_capped'). Makes the bug VISIBLE in the
 * ledger post-hoc. D-07 layer 3 + D-18. Exported for unit testing (WARNING 3).
 */
export async function logCascadeCap(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    orderId: string
    workspaceId: string
    prevStageId: string | null
    newStageId: string | null
    cascadeDepth: number
    triggerType: string
  },
): Promise<void> {
  await admin.from('order_stage_history').insert({
    order_id: params.orderId,
    workspace_id: params.workspaceId,
    previous_stage_id: params.prevStageId,
    new_stage_id: params.newStageId ?? params.prevStageId ?? '',
    source: 'cascade_capped',
    actor_id: null,
    actor_label: `Cascade capped at depth ${params.cascadeDepth}`,
    cascade_depth: params.cascadeDepth,
    trigger_event: params.triggerType,
  })
}

// ============================================================================
// Factory: Create Automation Runner Function
// ============================================================================

/**
 * Factory that creates an Inngest function for a specific trigger type.
 *
 * Each runner:
 * 1. Loads all enabled automations for the trigger type and workspace
 * 2. For each automation: checks trigger config, evaluates conditions
 * 3. Executes actions sequentially with step.run() and step.sleep()
 * 4. Logs execution to automation_executions table
 */
function createAutomationRunner(triggerType: TriggerType, eventName: string) {
  // D-08 + D-09: extend existing per-workspace limit with a per-orderId
  // serializer for `order.stage_changed` runner ONLY. This collapses
  // concurrent cascades targeting the same order into a 1-at-a-time queue
  // WITHOUT slowing down cross-order or cross-workspace events (Shared
  // Pattern 4 RESEARCH). Inngest's TS types require a fixed-shape mutable
  // tuple ([C] | [C, C]) — branch unions on the literal trigger type so
  // the inferred tuple arity is exact per runner.
  const concurrency: [{ key: string; limit: number }] | [{ key: string; limit: number }, { key: string; limit: number }] =
    triggerType === 'order.stage_changed'
      ? [
          { key: 'event.data.workspaceId', limit: 5 },
          { key: 'event.data.orderId', limit: 1 },
        ]
      : [{ key: 'event.data.workspaceId', limit: 5 }]

  return inngest.createFunction(
    {
      id: `automation-${triggerType.replace(/\./g, '-')}`,
      retries: 2,
      concurrency,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { event: eventName as any },
    async ({ event, step }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventData = (event as any).data as Record<string, unknown>
      const workspaceId = String(eventData.workspaceId || '')
      const cascadeDepth = Number(eventData.cascadeDepth ?? 0)

      // === D-07 Layer 3: cascade_capped history audit ===
      // Make the truncation VISIBLE post-hoc in the `order_stage_history` ledger
      // so users who report "my order bounced back to stage X" can see exactly
      // where the loop was cut. Only for order.stage_changed + orderId present
      // (Pitfall 4 RESEARCH — do not apply to other trigger runners).
      if (cascadeDepth >= MAX_CASCADE_DEPTH) {
        await step.run(`cap-audit-${triggerType}`, async () => {
          if (triggerType !== 'order.stage_changed' || !eventData.orderId) return
          await logCascadeCap(createAdminClient(), {
            orderId: String(eventData.orderId),
            workspaceId,
            prevStageId: eventData.previousStageId
              ? String(eventData.previousStageId)
              : null,
            newStageId: eventData.newStageId ? String(eventData.newStageId) : null,
            cascadeDepth,
            triggerType,
          })
        })
        console.warn(
          `[automation-runner] Cascade depth ${cascadeDepth} >= MAX (${MAX_CASCADE_DEPTH}). ` +
          `Skipping ${triggerType} for workspace ${workspaceId}`
        )
        return { skipped: true, reason: 'cascade_depth_exceeded' }
      }

      // === D-07 Layer 2: runtime kill-switch (flag-gated, fail-open) ===
      // When >5 non-manual stage changes happen on the same order in 60s,
      // skip this automation dispatch entirely. Gated by
      // `crm_stage_integrity_killswitch_enabled` (D-20) — flag OFF by default,
      // so this code is inert until the user flips it (Regla 6). Scoped to
      // order.stage_changed + orderId present (Pitfall 4 RESEARCH).
      if (triggerType === 'order.stage_changed' && eventData.orderId) {
        const killSwitchEnabled = await step.run(
          'kill-switch-flag',
          async () =>
            getPlatformConfig<boolean>(
              'crm_stage_integrity_killswitch_enabled',
              false,
            ),
        )

        if (killSwitchEnabled) {
          const { shouldSkip, recentChanges } = await step.run(
            'kill-switch-check',
            async () =>
              checkKillSwitch(createAdminClient(), eventData.orderId as string),
          )

          if (shouldSkip) {
            // D-22 observability event + D-23 warning log
            console.warn(
              `[kill-switch] order ${eventData.orderId}: ${recentChanges} non-manual changes in 60s. Skipping.`
            )
            return {
              skipped: true,
              reason: 'kill_switch_triggered',
              recentChanges,
            }
          }
        }
      }

      // Step 1: Load matching automations from DB
      const automations = await step.run(
        `load-automations-${triggerType}`,
        async () => {
          const supabase = createAdminClient()
          const { data, error } = await supabase
            .from('automations')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('trigger_type', triggerType)
            .eq('is_enabled', true)

          if (error) {
            console.error(
              `[automation-runner] Failed to load automations for ${triggerType}:`,
              error.message
            )
            return [] as Automation[]
          }

          return (data || []) as Automation[]
        }
      )

      if (automations.length === 0) {
        return { matched: 0, executed: 0 }
      }

      // Step 2: Build contexts
      const triggerContext = buildContextFromEvent(eventData)
      const variableContext = buildTriggerContext(eventData)

      // Context enrichment: load full order + contact data for order/tag triggers
      const needsOrderEnrichment =
        (triggerType === 'order.created' || triggerType === 'order.stage_changed' || triggerType === 'robot.coord.completed' || triggerType === 'robot.ocr.completed' || triggerType === 'robot.guide_lookup.completed' || triggerType === 'robot.guide_gen.completed') &&
        eventData.orderId
      const needsTagOrderEnrichment =
        (triggerType === 'tag.assigned' || triggerType === 'tag.removed') &&
        eventData.entityType === 'order' &&
        eventData.entityId

      if (needsOrderEnrichment || needsTagOrderEnrichment) {
        const lookupId = String(needsOrderEnrichment ? eventData.orderId : eventData.entityId)
        const enriched = await step.run(
          `enrich-order-${lookupId.slice(0, 8)}`,
          async () => {
            const supabase = createAdminClient()
            // Load order with contact join
            const { data: order, error: orderError } = await supabase
              .from('orders')
              .select(`
                id, name, pipeline_id, stage_id, total_value,
                shipping_address, shipping_city, shipping_department, description,
                contacts:contact_id (id, name, phone, email, address, city, department)
              `)
              .eq('id', lookupId)
              .eq('workspace_id', workspaceId)
              .single()

            if (orderError) {
              console.error(`[automation-runner] Enrichment query failed for order ${lookupId}:`, orderError.message)
              return null
            }
            if (!order) return null

            // Load stage and pipeline names
            const [{ data: stage }, { data: pipeline }] = await Promise.all([
              supabase.from('pipeline_stages').select('name').eq('id', order.stage_id).single(),
              supabase.from('pipelines').select('name').eq('id', order.pipeline_id).single(),
            ])

            const contact = Array.isArray(order.contacts) ? order.contacts[0] : order.contacts
            return {
              orderId: order.id,
              orderName: order.name || order.description || `Orden #${order.id.slice(0, 8)}`,
              pipelineId: order.pipeline_id,
              pipelineName: pipeline?.name,
              stageId: order.stage_id,
              stageName: stage?.name,
              orderValue: order.total_value,
              shippingAddress: order.shipping_address,
              shippingCity: order.shipping_city,
              shippingDepartment: order.shipping_department,
              orderDescription: order.description,
              contactId: contact?.id,
              contactName: contact?.name,
              contactPhone: contact?.phone,
              contactEmail: contact?.email,
              contactAddress: contact?.address,
              contactCity: contact?.city,
              contactDepartment: contact?.department,
            }
          }
        )
        if (enriched) {
          // Merge enriched data into both contexts
          Object.assign(triggerContext, enriched)
          Object.assign(variableContext, buildTriggerContext({ ...eventData, ...enriched }))
        }
      }

      // Context enrichment: load task + contact data for task triggers
      const needsTaskEnrichment =
        (triggerType === 'task.completed' || triggerType === 'task.overdue') &&
        eventData.taskId

      if (needsTaskEnrichment) {
        const taskEnriched = await step.run(
          `enrich-task-${String(eventData.taskId).slice(0, 8)}`,
          async () => {
            const supabase = createAdminClient()
            const { data: task, error: taskError } = await supabase
              .from('tasks')
              .select('id, title, description, contact_id, order_id')
              .eq('id', String(eventData.taskId))
              .single()

            if (taskError || !task) return null

            let contactName: string | undefined
            if (task.contact_id) {
              const { data: contact } = await supabase
                .from('contacts')
                .select('name')
                .eq('id', task.contact_id)
                .single()
              contactName = contact?.name ?? undefined
            }

            return {
              taskDescription: task.description,
              contactId: task.contact_id,
              contactName,
              orderId: task.order_id,
            }
          }
        )
        if (taskEnriched) {
          Object.assign(triggerContext, taskEnriched)
          Object.assign(variableContext, buildTriggerContext({ ...eventData, ...taskEnriched }))
        }
      }

      // Step 3: Process each matching automation
      let executed = 0

      for (const automation of automations) {
        // Check trigger config filters
        const configMatch = matchesTriggerConfig(
          triggerType,
          automation.trigger_config,
          eventData
        )

        if (!configMatch) {
          continue
        }

        // Evaluate conditions (null conditions = always match)
        if (automation.conditions) {
          const conditionsMatch = evaluateConditionGroup(
            automation.conditions as ConditionGroup,
            variableContext
          )
          if (!conditionsMatch) {
            continue
          }
        }

        // Create execution record
        const executionId = await step.run(
          `create-execution-${automation.id}`,
          async () => {
            const supabase = createAdminClient()
            const { data, error } = await supabase
              .from('automation_executions')
              .insert({
                workspace_id: workspaceId,
                automation_id: automation.id,
                trigger_event: eventData,
                status: 'running',
                cascade_depth: cascadeDepth,
              })
              .select('id')
              .single()

            if (error) {
              console.error(
                `[automation-runner] Failed to create execution record:`,
                error.message
              )
              return null
            }
            return data?.id ?? null
          }
        )

        // Execute actions
        const result = await processAutomation(
          automation,
          eventData,
          triggerContext,
          variableContext,
          cascadeDepth,
          step,
          triggerType
        )

        // Update execution record with result
        if (executionId) {
          await step.run(
            `update-execution-${automation.id}`,
            async () => {
              const supabase = createAdminClient()
              await supabase
                .from('automation_executions')
                .update({
                  status: result.status,
                  actions_log: result.actionsLog,
                  error_message: result.errorMessage,
                  completed_at: new Date().toISOString(),
                  duration_ms: result.actionsLog.reduce(
                    (sum, a) => sum + a.duration_ms,
                    0
                  ),
                })
                .eq('id', executionId)
            }
          )
        }

        executed++
      }

      return { matched: automations.length, executed }
    }
  )
}

// ============================================================================
// Create All 14 Runners
// ============================================================================

const orderStageChangedRunner = createAutomationRunner(
  'order.stage_changed',
  'automation/order.stage_changed'
)

const tagAssignedRunner = createAutomationRunner(
  'tag.assigned',
  'automation/tag.assigned'
)

const tagRemovedRunner = createAutomationRunner(
  'tag.removed',
  'automation/tag.removed'
)

const contactCreatedRunner = createAutomationRunner(
  'contact.created',
  'automation/contact.created'
)

const orderCreatedRunner = createAutomationRunner(
  'order.created',
  'automation/order.created'
)

const fieldChangedRunner = createAutomationRunner(
  'field.changed',
  'automation/field.changed'
)

const whatsappMessageReceivedRunner = createAutomationRunner(
  'whatsapp.message_received',
  'automation/whatsapp.message_received'
)

const whatsappKeywordMatchRunner = createAutomationRunner(
  'whatsapp.keyword_match',
  'automation/whatsapp.keyword_match'
)

const taskCompletedRunner = createAutomationRunner(
  'task.completed',
  'automation/task.completed'
)

const taskOverdueRunner = createAutomationRunner(
  'task.overdue',
  'automation/task.overdue'
)

// Shopify runners (Phase 20: Integration Automations)
const shopifyOrderCreatedRunner = createAutomationRunner(
  'shopify.order_created',
  'automation/shopify.order_created'
)

const shopifyDraftOrderCreatedRunner = createAutomationRunner(
  'shopify.draft_order_created',
  'automation/shopify.draft_order_created'
)

const shopifyOrderUpdatedRunner = createAutomationRunner(
  'shopify.order_updated',
  'automation/shopify.order_updated'
)

// Robot runners (Phase 23: Inngest Orchestrator + Callback API)
const robotCoordCompletedRunner = createAutomationRunner(
  'robot.coord.completed',
  'automation/robot.coord.completed'
)

// Robot OCR runners (Phase 27: Robot OCR de Guias)
const robotOcrCompletedRunner = createAutomationRunner(
  'robot.ocr.completed',
  'automation/robot.ocr.completed'
)

// Robot Guide Lookup runner (buscar guias coord)
const robotGuideLookupCompletedRunner = createAutomationRunner(
  'robot.guide_lookup.completed',
  'automation/robot.guide_lookup.completed'
)

// Robot Guide Generation runner (generar guias inter/bogota/envia)
const robotGuideGenCompletedRunner = createAutomationRunner(
  'robot.guide_gen.completed',
  'automation/robot.guide_gen.completed'
)

// ============================================================================
// Export
// ============================================================================

/**
 * All automation runner functions for Inngest serve().
 * Register these alongside existing agent functions in route.ts.
 */
export const automationFunctions = [
  orderStageChangedRunner,
  tagAssignedRunner,
  tagRemovedRunner,
  contactCreatedRunner,
  orderCreatedRunner,
  fieldChangedRunner,
  whatsappMessageReceivedRunner,
  whatsappKeywordMatchRunner,
  taskCompletedRunner,
  taskOverdueRunner,
  shopifyOrderCreatedRunner,
  shopifyDraftOrderCreatedRunner,
  shopifyOrderUpdatedRunner,
  robotCoordCompletedRunner,
  robotOcrCompletedRunner,
  robotGuideLookupCompletedRunner,
  robotGuideGenCompletedRunner,
]
