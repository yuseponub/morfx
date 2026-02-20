---
phase: quick
plan: 004
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/automations/trigger-emitter.ts
  - src/inngest/functions/task-overdue-cron.ts
autonomous: true

must_haves:
  truths:
    - "{{tarea.descripcion}} resolves to actual task description in task.overdue automations"
    - "{{contacto.nombre}} resolves to actual contact name in task.overdue automations"
  artifacts:
    - path: "src/lib/automations/trigger-emitter.ts"
      provides: "emitTaskOverdue with taskDescription and contactName fields"
      contains: "taskDescription"
    - path: "src/inngest/functions/task-overdue-cron.ts"
      provides: "Cron that fetches description from tasks and name from contacts"
      contains: "taskDescription"
  key_links:
    - from: "src/inngest/functions/task-overdue-cron.ts"
      to: "src/lib/automations/trigger-emitter.ts"
      via: "emitTaskOverdue call with taskDescription and contactName"
      pattern: "emitTaskOverdue.*taskDescription"
    - from: "src/lib/automations/trigger-emitter.ts"
      to: "src/lib/automations/variable-resolver.ts"
      via: "sendEvent spreads data into eventData consumed by buildTriggerContext"
      pattern: "eventData\\.taskDescription"
---

<objective>
Fix task.overdue trigger emitter so {{tarea.descripcion}} and {{contacto.nombre}} resolve correctly in automation templates.

Purpose: Currently these variables resolve empty because emitTaskOverdue does not include taskDescription or contactName in its payload. The variable-resolver already handles these fields (lines 150, 202) but the cron never sends them.

Output: Updated trigger-emitter.ts and task-overdue-cron.ts that mirror the emitTaskCompleted pattern.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/automations/trigger-emitter.ts (emitTaskOverdue at line 318, emitTaskCompleted at line 293 as reference)
@src/inngest/functions/task-overdue-cron.ts (full file, 94 lines)
@src/lib/automations/variable-resolver.ts (buildTriggerContext tarea block at line 198-205, contacto block at line 148-158)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing fields to emitTaskOverdue signature</name>
  <files>src/lib/automations/trigger-emitter.ts</files>
  <action>
Add `taskDescription` and `contactName` optional fields to the emitTaskOverdue data parameter type, mirroring emitTaskCompleted (line 293-302).

Current signature (line 318-326):
```typescript
export async function emitTaskOverdue(data: {
  workspaceId: string
  taskId: string
  taskTitle: string
  dueDate: string
  contactId: string | null
  orderId: string | null
  cascadeDepth?: number
}): Promise<void>
```

Add after `taskTitle: string`:
```typescript
  taskDescription?: string | null
```

Add after `contactId: string | null`:
```typescript
  contactName?: string
```

The function body needs NO changes -- it already does `{ ...data, cascadeDepth: depth }` which will spread the new fields into the event payload, and variable-resolver.ts already reads them via `eventData.taskDescription` and `eventData.contactName`.
  </action>
  <verify>Run `npx tsc --noEmit` -- no type errors in trigger-emitter.ts or task-overdue-cron.ts</verify>
  <done>emitTaskOverdue type signature includes taskDescription and contactName, matching emitTaskCompleted pattern</done>
</task>

<task type="auto">
  <name>Task 2: Fetch and pass description + contactName in cron</name>
  <files>src/inngest/functions/task-overdue-cron.ts</files>
  <action>
Update the task-overdue-cron to fetch task.description and contact.name, then pass them to emitTaskOverdue.

**Step A -- Expand the Supabase select (line 48):**

Change:
```typescript
.select('id, workspace_id, title, due_date, contact_id, order_id')
```
To:
```typescript
.select('id, workspace_id, title, description, due_date, contact_id, order_id')
```

Update the type assertion (line 60-67) to include `description: string | null`.

**Step B -- Batch-fetch contact names:**

After `overdueTasks` step and the early-return check (after line 72), add a new step to batch-fetch contact names for all tasks that have a contact_id. This avoids N+1 queries.

```typescript
// Step 2: Batch-fetch contact names for tasks with contact_id
const contactIds = [...new Set(
  overdueTasks
    .map(t => t.contact_id)
    .filter((id): id is string => id !== null)
)]

const contactNameMap: Record<string, string> = {}
if (contactIds.length > 0) {
  const supabase = createAdminClient()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name')
    .in('id', contactIds)

  if (contacts) {
    for (const c of contacts) {
      contactNameMap[c.id] = c.name
    }
  }
}
```

IMPORTANT: This batch fetch should be inside a `step.run('fetch-contact-names', ...)` block for Inngest idempotency. Wrap it like:

```typescript
const contactNameMap = await step.run('fetch-contact-names', async () => {
  const contactIds = [...new Set(
    overdueTasks
      .map(t => t.contact_id)
      .filter((id): id is string => id !== null)
  )]

  if (contactIds.length === 0) return {} as Record<string, string>

  const supabase = createAdminClient()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name')
    .in('id', contactIds)

  const map: Record<string, string> = {}
  if (contacts) {
    for (const c of contacts) {
      map[c.id] = c.name
    }
  }
  return map
})
```

**Step C -- Update the emitTaskOverdue call (line 77-84):**

Rename comment from "Step 2" to "Step 3" and add the new fields:

```typescript
await emitTaskOverdue({
  workspaceId: task.workspace_id,
  taskId: task.id,
  taskTitle: task.title,
  taskDescription: task.description,
  dueDate: task.due_date,
  contactId: task.contact_id,
  contactName: task.contact_id ? contactNameMap[task.contact_id] : undefined,
  orderId: task.order_id,
})
```

Do NOT rename `dueDate` -- variable-resolver has explicit fallback for it (line 204).
  </action>
  <verify>
1. `npx tsc --noEmit` passes with zero errors
2. Grep confirm: `grep -n 'taskDescription\|contactName' src/inngest/functions/task-overdue-cron.ts` shows both fields present
3. Grep confirm: `grep -n 'description' src/inngest/functions/task-overdue-cron.ts` shows it in select and type
  </verify>
  <done>
Task overdue cron fetches task.description and batch-fetches contact.name, passes both to emitTaskOverdue. Variables {{tarea.descripcion}} and {{contacto.nombre}} will now resolve correctly in automation templates triggered by task.overdue.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- zero type errors across the project
2. Confirm emitTaskOverdue signature matches emitTaskCompleted pattern (both have taskDescription and contactName)
3. Confirm cron SELECT includes `description`
4. Confirm cron passes `taskDescription` and `contactName` to emitTaskOverdue
5. Trace the data flow: cron SELECT -> emitTaskOverdue -> sendEvent -> Inngest event -> automation runner -> variable-resolver buildTriggerContext -> tarea.descripcion and contacto.nombre populated
</verification>

<success_criteria>
- emitTaskOverdue type includes taskDescription?: string | null and contactName?: string
- task-overdue-cron.ts fetches description from tasks table
- task-overdue-cron.ts batch-fetches contact names (no N+1)
- Both fields passed through to emitTaskOverdue call
- TypeScript compiles with zero errors
- Data flow from cron to variable-resolver is complete for tarea.descripcion and contacto.nombre
</success_criteria>

<output>
After completion, create `.planning/quick/004-fix-p0-1-task-overdue-variable-mismatches/004-SUMMARY.md`
</output>
