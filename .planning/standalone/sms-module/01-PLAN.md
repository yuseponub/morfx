---
phase: sms-module
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/YYYYMMDD_sms_onurix_foundation.sql
  - src/lib/sms/client.ts
  - src/lib/sms/types.ts
  - src/lib/sms/constants.ts
  - src/lib/sms/utils.ts
  - src/lib/domain/sms.ts
autonomous: true
user_setup:
  - service: onurix
    why: "SMS provider API"
    env_vars:
      - name: ONURIX_CLIENT_ID
        source: "Onurix dashboard credentials"
      - name: ONURIX_API_KEY
        source: "Onurix dashboard credentials"

must_haves:
  truths:
    - "sms_workspace_config table exists with balance, is_active, allow_negative_balance"
    - "sms_balance_transactions table logs every balance change"
    - "deduct_sms_balance RPC atomically checks+deducts with FOR UPDATE lock"
    - "sms_messages table supports Onurix (provider_message_id nullable, provider column)"
    - "sendSMS domain function checks balance, calls Onurix, logs message, emits Inngest event"
    - "formatColombianPhone handles 10-digit, +57, 57 prefix formats"
    - "SMS blocked outside 8AM-9PM Colombia time"
  artifacts:
    - path: "supabase/migrations/YYYYMMDD_sms_onurix_foundation.sql"
      provides: "DB tables, RPC, migration of existing sms_messages"
      contains: "deduct_sms_balance"
    - path: "src/lib/sms/client.ts"
      provides: "Onurix API client (send + status check)"
      exports: ["sendOnurixSMS", "checkOnurixStatus"]
    - path: "src/lib/sms/utils.ts"
      provides: "Phone formatting, segment calculation, time window check"
      exports: ["formatColombianPhone", "calculateSMSSegments", "isWithinSMSWindow"]
    - path: "src/lib/domain/sms.ts"
      provides: "Domain sendSMS function"
      exports: ["sendSMS"]
  key_links:
    - from: "src/lib/domain/sms.ts"
      to: "src/lib/sms/client.ts"
      via: "sendOnurixSMS call"
      pattern: "sendOnurixSMS"
    - from: "src/lib/domain/sms.ts"
      to: "deduct_sms_balance RPC"
      via: "supabase.rpc('deduct_sms_balance')"
      pattern: "deduct_sms_balance"
---

<objective>
Create the complete SMS foundation: database tables (sms_workspace_config, sms_balance_transactions, migrate sms_messages), Onurix API client, utility functions, and the domain sendSMS function.

Purpose: Every other plan depends on this foundation. The domain function is the single entry point for all SMS sending.
Output: Migration SQL, src/lib/sms/ module, src/lib/domain/sms.ts
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-module/CONTEXT.md
@.planning/standalone/sms-module/RESEARCH.md
@src/lib/domain/types.ts
@supabase/migrations/20260216000000_sms_messages.sql
@src/lib/sms/ (will be created)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Database migration — new tables, RPC, and sms_messages migration</name>
  <files>supabase/migrations/20260316000000_sms_onurix_foundation.sql</files>
  <action>
Create a single migration file that:

1. **Create sms_workspace_config table:**
   - id UUID PK, workspace_id UUID UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE
   - is_active BOOLEAN DEFAULT false
   - balance_cop DECIMAL(12,2) DEFAULT 0
   - allow_negative_balance BOOLEAN DEFAULT true
   - total_sms_sent INTEGER DEFAULT 0
   - total_credits_used DECIMAL(12,2) DEFAULT 0
   - created_at, updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
   - RLS enabled, SELECT policy for workspace members

2. **Create sms_balance_transactions table:**
   - id UUID PK, workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE
   - type TEXT NOT NULL ('recharge' | 'sms_deduction' | 'adjustment')
   - amount_cop DECIMAL(12,2) NOT NULL (positive for recharge, negative for deduction)
   - balance_after DECIMAL(12,2) NOT NULL
   - description TEXT
   - sms_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL
   - created_by UUID (admin user for recharges, null for auto)
   - created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
   - RLS enabled, SELECT policy for workspace members

3. **Migrate sms_messages table:**
   - ALTER twilio_sid: rename to provider_message_id, DROP NOT NULL, DROP UNIQUE constraint
   - ADD COLUMN provider TEXT DEFAULT 'onurix' (for new messages; existing get 'twilio')
   - UPDATE existing rows SET provider = 'twilio'
   - ADD COLUMN delivery_checked_at TIMESTAMPTZ (for Inngest delivery verification tracking)
   - ADD COLUMN cost_cop DECIMAL(12,2) (per-message cost in COP)
   - ADD COLUMN source TEXT DEFAULT 'automation' ('automation' | 'domain-call' | 'script')
   - ADD COLUMN contact_name TEXT (denormalized for quick display in history)
   - Create index on (workspace_id, created_at DESC) if not exists

4. **Create deduct_sms_balance RPC function:**
   Follow RESEARCH.md pattern exactly — LANGUAGE plpgsql, SECURITY DEFINER, FOR UPDATE lock on sms_workspace_config row. Parameters: p_workspace_id UUID, p_amount DECIMAL, p_sms_message_id UUID DEFAULT NULL, p_description TEXT DEFAULT 'SMS enviado'. Returns TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT). Checks is_active, checks allow_negative_balance, deducts, logs transaction.

5. **Create add_sms_balance RPC function** (for admin recharges):
   Similar structure. Parameters: p_workspace_id UUID, p_amount DECIMAL, p_created_by UUID, p_description TEXT DEFAULT 'Recarga manual'. FOR UPDATE lock, adds to balance, logs transaction with type='recharge'.

Use IF EXISTS / IF NOT EXISTS for idempotent DDL where possible.
  </action>
  <verify>Review SQL file for syntax correctness. Confirm all tables, indexes, RLS policies, and RPC functions are present. Confirm sms_messages migration handles existing twilio_sid column safely.</verify>
  <done>Migration file exists with all 5 components. twilio_sid renamed to provider_message_id with nullable constraint. Both RPC functions use FOR UPDATE locking.</done>
</task>

<task type="auto">
  <name>Task 2: Onurix client, utilities, and domain sendSMS function</name>
  <files>
    src/lib/sms/client.ts
    src/lib/sms/types.ts
    src/lib/sms/constants.ts
    src/lib/sms/utils.ts
    src/lib/domain/sms.ts
  </files>
  <action>
**src/lib/sms/types.ts:**
- OnurixSendResponse: { status: number, id: string, data: { state: string, credits: number, sms: string, phone: string } }
- OnurixStatusItem: { state: string, id: string, credits: number, phone: string, sms: string, dispatch_id: string }
- SmsStatus: 'pending' | 'sent' | 'delivered' | 'failed'

**src/lib/sms/constants.ts:**
- SMS_PRICE_COP = 97
- SMS_GSM7_SEGMENT_LENGTH = 160
- SMS_UCS2_SEGMENT_LENGTH = 70
- ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

**src/lib/sms/client.ts:**
CRITICAL: Use the LIVE-TESTED endpoints, NOT the research file's guesses:
- sendOnurixSMS: POST to `${ONURIX_BASE_URL}/sms/send` with form-urlencoded body (NOT query params, NOT JSON). Use `new URLSearchParams({ client, key, phone, sms })` as the fetch body with Content-Type 'application/x-www-form-urlencoded'. Return OnurixSendResponse.
- checkOnurixStatus: GET `${ONURIX_BASE_URL}/messages-state` with query params (client, key, id). Return OnurixStatusItem[].
- Both functions throw on non-ok responses with descriptive error messages.

**src/lib/sms/utils.ts:**
- formatColombianPhone(phone: string): string — strip non-digits, handle 57+12digits, 10-digit starting with 3, 11-digit starting with 0. Throw on invalid.
- calculateSMSSegments(message: string): number — GSM-7 check via /^[\x20-\x7E\n\r]*$/, 160 or 70 chars per segment.
- isWithinSMSWindow(): boolean — 8 AM to 9 PM Colombia time (America/Bogota).

**src/lib/domain/sms.ts:**
Follow DomainContext/DomainResult pattern from src/lib/domain/types.ts.

Export interfaces:
- SendSMSParams: { phone: string, message: string, source?: string, automationExecutionId?: string, contactName?: string }
- SendSMSResult: { smsMessageId: string, dispatchId: string, status: SmsStatus, segmentsUsed: number, costCop: number }

Export function sendSMS(ctx: DomainContext, params: SendSMSParams): Promise<DomainResult<SendSMSResult>>:
1. Validate phone with formatColombianPhone (catch and return error)
2. Check isWithinSMSWindow — if outside, return { success: false, error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)' }
3. Call Onurix sendOnurixSMS — get response with credits (actual segments)
4. Calculate cost: response.data.credits * SMS_PRICE_COP
5. Insert into sms_messages table (workspace_id, provider_message_id=response.id, provider='onurix', from_number='Onurix', to_number=formattedPhone, body=message, status='sent', segments=response.data.credits, cost_cop, source, automation_execution_id, contact_name)
6. Call deduct_sms_balance RPC (p_workspace_id, p_amount=costCop, p_sms_message_id=insertedId). If returns success=false AND the error is "Saldo SMS insuficiente" (meaning blocked), we still sent (Onurix already sent), so log the negative balance but don't fail the SMS. The RPC already handles allow_negative_balance logic.
   IMPORTANT DESIGN DECISION: Actually, check balance BEFORE sending. Call a simple select on sms_workspace_config to check is_active and (allow_negative_balance OR balance_cop >= estimatedCost). If blocked, return error WITHOUT sending. If allowed, send first, then deduct with actual cost from Onurix response.
7. Emit Inngest event 'sms/delivery.check' with { smsMessageId, dispatchId, workspaceId } using `(inngest.send as any)()` pattern (see memory for type assertion).
8. Return success with SendSMSResult.

Import inngest from '@/inngest/client'. Use createAdminClient() for all DB ops.
  </action>
  <verify>
    - TypeScript compiles: `npx tsc --noEmit src/lib/sms/client.ts src/lib/sms/utils.ts src/lib/domain/sms.ts` (or project-wide tsc)
    - All exports present: client has sendOnurixSMS + checkOnurixStatus, utils has formatColombianPhone + calculateSMSSegments + isWithinSMSWindow, domain/sms has sendSMS
    - Domain function uses createAdminClient (not user client)
    - Onurix client uses form-urlencoded for send endpoint (not JSON, not query params)
    - Status check uses /messages-state (not /general/message_state)
  </verify>
  <done>
    - src/lib/sms/ module with 4 files (client, types, constants, utils)
    - src/lib/domain/sms.ts with sendSMS that checks balance, validates phone, checks time window, calls Onurix, logs message, deducts balance, emits Inngest event
    - All TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- Migration SQL is syntactically correct and handles existing sms_messages table migration
- Onurix client uses CORRECT live-tested endpoints: /sms/send (form-urlencoded) and /messages-state (GET)
- Domain sendSMS follows DomainContext/DomainResult pattern
- Balance deduction is atomic (FOR UPDATE lock in RPC)
- Phone formatting handles all Colombian number formats
- Time window check uses America/Bogota timezone
</verification>

<success_criteria>
- All 6 files created and TypeScript compiles
- Migration ready to apply (user will apply before deploy per Regla 5)
- sendSMS domain function is the single entry point for all SMS sending
- No direct Onurix calls outside of src/lib/sms/client.ts
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-module/01-SUMMARY.md`
</output>
