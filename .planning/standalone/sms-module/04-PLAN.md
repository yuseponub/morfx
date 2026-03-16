---
phase: sms-module
plan: 04
type: execute
wave: 2
depends_on: ["sms-module-01"]
files_modified:
  - src/app/super-admin/sms/page.tsx
  - src/app/super-admin/sms/components/sms-admin-dashboard.tsx
  - src/app/super-admin/sms/components/workspace-sms-table.tsx
  - src/app/super-admin/sms/components/recharge-dialog.tsx
  - src/app/super-admin/layout.tsx
  - src/app/actions/sms-admin.ts
autonomous: true

must_haves:
  truths:
    - "Super-admin can see all workspaces' SMS balances in one table"
    - "Super-admin can recharge any workspace's SMS balance"
    - "Super-admin can activate/deactivate SMS for a workspace"
    - "Balance transactions are logged with created_by for audit"
    - "SMS nav link visible in super-admin sidebar"
  artifacts:
    - path: "src/app/super-admin/sms/page.tsx"
      provides: "Super-admin SMS management page"
      min_lines: 15
    - path: "src/app/actions/sms-admin.ts"
      provides: "Admin server actions for SMS management"
      exports: ["getAllWorkspaceSMS", "rechargeWorkspaceBalance", "toggleWorkspaceSMS"]
  key_links:
    - from: "src/app/actions/sms-admin.ts"
      to: "add_sms_balance RPC"
      via: "supabase.rpc('add_sms_balance')"
      pattern: "add_sms_balance"
    - from: "src/app/super-admin/layout.tsx"
      to: "/super-admin/sms"
      via: "nav link"
      pattern: "sms"
---

<objective>
Build the super-admin SMS balance management page where the admin can view all workspaces' SMS status, recharge balances, and activate/deactivate SMS service.

Purpose: Admin can manage SMS credits for all clients from a single dashboard.
Output: /super-admin/sms page with workspace table, recharge dialog, admin server actions
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-module/CONTEXT.md
@.planning/standalone/sms-module/01-SUMMARY.md
@src/app/super-admin/layout.tsx
@src/app/super-admin/workspaces/page.tsx
@src/app/super-admin/costos/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Admin server actions for SMS management</name>
  <files>src/app/actions/sms-admin.ts</files>
  <action>
Create server actions for super-admin SMS management. All actions verify the caller is super-admin (check user role/email).

**getAllWorkspaceSMS():**
- Query sms_workspace_config joined with workspaces to get workspace name
- Also include workspaces WITHOUT sms_workspace_config (LEFT JOIN) to show "not configured" state
- Return array of { workspaceId, workspaceName, isActive, balanceCop, totalSmsSent, totalCreditsUsed, allowNegativeBalance, updatedAt }
- Order by workspace name

**rechargeWorkspaceBalance(workspaceId: string, amount: number, description?: string):**
- Validate amount > 0
- Get current user ID for created_by
- If sms_workspace_config doesn't exist for workspace, create it first (is_active=true, balance=0)
- Call add_sms_balance RPC with p_workspace_id, p_amount=amount, p_created_by=userId, p_description
- revalidatePath('/super-admin/sms')
- Return { success: true, newBalance }

**toggleWorkspaceSMS(workspaceId: string, isActive: boolean):**
- Upsert sms_workspace_config: if exists update is_active, if not create with is_active and defaults
- revalidatePath('/super-admin/sms')
- Return success

**getWorkspaceTransactions(workspaceId: string, page: number = 1, pageSize: number = 20):**
- Query sms_balance_transactions for workspace, ordered by created_at DESC
- Use .range() for pagination
- Return { data: transactions[], total, page, pageSize }

Use createAdminClient() for all queries (admin operations bypass RLS).
  </action>
  <verify>TypeScript compiles. All 4 actions exported. rechargeWorkspaceBalance calls add_sms_balance RPC. Auth check present in each action.</verify>
  <done>Admin server actions with workspace SMS listing, balance recharge via RPC, toggle activation, and transaction history.</done>
</task>

<task type="auto">
  <name>Task 2: Super-admin SMS page and components</name>
  <files>
    src/app/super-admin/sms/page.tsx
    src/app/super-admin/sms/components/sms-admin-dashboard.tsx
    src/app/super-admin/sms/components/workspace-sms-table.tsx
    src/app/super-admin/sms/components/recharge-dialog.tsx
    src/app/super-admin/layout.tsx
  </files>
  <action>
**layout.tsx:**
Add "SMS" nav link to the super-admin sidebar/navigation. Check existing pattern — there should be links to /super-admin/workspaces and /super-admin/costos. Add /super-admin/sms with a MessageSquareText icon (or matching icon style).

**page.tsx (server component):**
Follow super-admin/costos/page.tsx pattern. Fetch getAllWorkspaceSMS() and pass to client component.

**sms-admin-dashboard.tsx (client component):**
Main orchestrator. Shows summary at top:
- Total workspaces with SMS active
- Total SMS sent across all workspaces
- Total revenue (sum of totalCreditsUsed across all workspaces)

Then renders WorkspaceSmsTable.

**workspace-sms-table.tsx:**
Table with columns:
- Workspace (name)
- Estado (Active badge green / Inactive badge gray, clickable to toggle)
- Saldo (COP formatted, color-coded: green > 5000, yellow 1000-5000, red < 1000)
- SMS Enviados (total count)
- Creditos Usados (COP formatted)
- Saldo Negativo (Permitido/Bloqueado badge)
- Acciones: "Recargar" button opens RechargeDialog, "Activar/Desactivar" toggle

Sort by workspace name. If workspace has no SMS config, show "No configurado" in Estado.

**recharge-dialog.tsx:**
Dialog/modal for recharging a workspace:
- Shows workspace name and current balance
- Input field for amount (number, COP)
- Optional description textarea
- "Recargar" button calls rechargeWorkspaceBalance
- Shows new balance on success
- Loading state during submission

Use existing shadcn/ui components (Dialog, Table, Badge, Button, Input).
Spanish labels throughout. COP formatting with Intl.NumberFormat.
  </action>
  <verify>
    - `npm run build` succeeds
    - /super-admin/sms page renders without crash
    - Super-admin nav has SMS link
    - Recharge dialog opens and closes correctly
  </verify>
  <done>
    - Super-admin SMS page shows all workspaces' SMS status
    - Recharge dialog allows adding balance to any workspace
    - Toggle allows activating/deactivating SMS per workspace
    - SMS link in super-admin navigation
  </done>
</task>

</tasks>

<verification>
- Super-admin can view all workspaces' SMS configurations
- Recharge creates balance transaction with created_by audit trail
- Toggle activation works (upserts config if needed)
- COP formatting consistent
- Auth check prevents non-admin access
</verification>

<success_criteria>
- Complete /super-admin/sms page with table and recharge functionality
- All mutations go through server actions with admin auth check
- Balance recharges use the atomic add_sms_balance RPC
- Audit trail: every recharge logged with admin user ID
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-module/04-SUMMARY.md`
</output>
