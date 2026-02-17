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
    orderValue: eventData.totalValue as number | undefined,
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
  step: any
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

    // Execute the action in a durable step
    const actionResult = await step.run(
      `action-${automation.id}-${i}-${action.type}`,
      async () => {
        return executeAction(action, triggerContext, automation.workspace_id, cascadeDepth, variableContext)
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
  return inngest.createFunction(
    {
      id: `automation-${triggerType.replace(/\./g, '-')}`,
      retries: 2,
      concurrency: [{ key: 'event.data.workspaceId', limit: 5 }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { event: eventName as any },
    async ({ event, step }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventData = (event as any).data as Record<string, unknown>
      const workspaceId = String(eventData.workspaceId || '')
      const cascadeDepth = Number(eventData.cascadeDepth ?? 0)

      // Check cascade depth
      if (cascadeDepth >= MAX_CASCADE_DEPTH) {
        console.warn(
          `[automation-runner] Cascade depth ${cascadeDepth} >= MAX (${MAX_CASCADE_DEPTH}). ` +
          `Skipping ${triggerType} for workspace ${workspaceId}`
        )
        return { skipped: true, reason: 'cascade_depth_exceeded' }
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
        (triggerType === 'order.created' || triggerType === 'order.stage_changed') &&
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
                id, pipeline_id, stage_id, total_value,
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
              orderName: order.description || `Orden #${order.id.slice(0, 8)}`,
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
          step
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
// Create All 13 Runners
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
]
