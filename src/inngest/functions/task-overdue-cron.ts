// ============================================================================
// Phase 18 Plan 09: Task Overdue Cron
// Inngest cron function that runs every 15 minutes to detect overdue tasks
// and emit task.overdue trigger events for automation processing.
//
// This activates the previously "dead" task.overdue trigger.
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitTaskOverdue } from '@/lib/automations/trigger-emitter'

// ============================================================================
// Cron Function
// ============================================================================

/**
 * Scan for overdue tasks and emit task.overdue trigger per task.
 *
 * Runs every 15 minutes. Queries tasks where:
 * - status = 'pending' or 'in_progress' (not completed)
 * - due_date IS NOT NULL
 * - due_date < NOW() (past due)
 * - due_date > NOW() - 24h (within last 24h to avoid re-emitting ancient tasks)
 *
 * The 24h window is a simple deduplication approach: tasks overdue for more
 * than 24 hours are considered already processed. Automation runners handle
 * idempotency on their end.
 */
export const taskOverdueCron = inngest.createFunction(
  {
    id: 'task-overdue-cron',
    retries: 1,
  },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    // Step 1: Query overdue tasks across all workspaces
    const overdueTasks = await step.run('find-overdue-tasks', async () => {
      const supabase = createAdminClient()

      // 24h ago in ISO format for the window filter
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString()

      const { data, error } = await supabase
        .from('tasks')
        .select('id, workspace_id, title, due_date, contact_id, order_id')
        .in('status', ['pending', 'in_progress'])
        .not('due_date', 'is', null)
        .lt('due_date', new Date().toISOString())
        .gt('due_date', twentyFourHoursAgo)
        .limit(200) // Safety cap per cron run

      if (error) {
        console.error('[task-overdue-cron] Failed to query overdue tasks:', error.message)
        return []
      }

      return (data || []) as Array<{
        id: string
        workspace_id: string
        title: string
        due_date: string
        contact_id: string | null
        order_id: string | null
      }>
    })

    if (overdueTasks.length === 0) {
      return { overdue: 0, emitted: 0 }
    }

    // Step 2: Emit task.overdue trigger per task (fire-and-forget)
    let emitted = 0
    for (const task of overdueTasks) {
      await emitTaskOverdue({
        workspaceId: task.workspace_id,
        taskId: task.id,
        taskTitle: task.title,
        dueDate: task.due_date,
        contactId: task.contact_id,
        orderId: task.order_id,
      })
      emitted++
    }

    console.log(
      `[task-overdue-cron] Found ${overdueTasks.length} overdue tasks, emitted ${emitted} triggers`
    )

    return { overdue: overdueTasks.length, emitted }
  }
)
