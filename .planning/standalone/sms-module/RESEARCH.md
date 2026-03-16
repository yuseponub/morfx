# Standalone: SMS Module - Research

**Researched:** 2026-03-16
**Domain:** SMS messaging via Onurix API, credit system, automation integration
**Confidence:** HIGH

## Summary

This research covers the implementation of a complete SMS module for MorfX clients. The module replaces the existing Twilio-based `send_sms` automation action with Onurix as the provider, adds a credit/balance system per workspace, a dashboard with usage metrics, and an admin panel for managing balances globally.

The codebase already has a well-established pattern for this type of integration: there is an existing `send_sms` action in the automation engine (currently Twilio-based), an `sms_messages` table, and a Twilio status callback webhook. The new module follows these exact patterns but swaps the provider to Onurix, adds credit management, and builds a dedicated SMS page in the dashboard.

Key recommendation: The existing `sms_messages` table and `send_sms` action serve as the foundation. The migration path is: (1) create new DB tables for SMS credits, (2) create `src/lib/sms/` provider module for Onurix API, (3) create domain function `sendSMS()`, (4) replace the Twilio send_sms action with Onurix, (5) add delivery verification via Inngest delayed checks, (6) build the SMS dashboard page, (7) add super-admin SMS balance management.

**Primary recommendation:** Build the SMS module as `src/lib/sms/` with a clean provider abstraction (Onurix), domain function `src/lib/domain/sms.ts`, and replace the existing Twilio `send_sms` action in the automation engine.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Inngest | (already installed) | Delayed delivery verification checks | Already used for all async workflows in MorfX |
| recharts | ^3.7.0 (already installed) | SMS usage charts in dashboard | Already used in Analytics page |
| Supabase | (already installed) | DB for sms_messages, sms_credits tables | Already the DB layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (already installed) | SMS icon (`MessageSquareText` or `Phone`) for sidebar | Already used for all icons |

### No New Dependencies Required
The SMS module requires NO new npm packages. All needed libraries (Inngest, recharts, Supabase, lucide-react) are already installed. The Onurix API is a simple HTTP REST API called via native `fetch()`.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── sms/
│   │   ├── client.ts          # Onurix API client (send, verify status)
│   │   ├── types.ts           # OnurixConfig, SmsRecord, SmsStatus types
│   │   └── constants.ts       # SMS_PRICE_COP, MAX_SMS_LENGTH, etc.
│   ├── domain/
│   │   └── sms.ts             # sendSMS(), getSMSBalance(), adjustBalance()
├── app/
│   ├── (dashboard)/
│   │   └── sms/
│   │       ├── page.tsx        # SMS dashboard page (server component)
│   │       └── components/
│   │           ├── sms-dashboard.tsx      # Main client component
│   │           ├── sms-balance-card.tsx   # Current balance display
│   │           ├── sms-metrics-cards.tsx  # Sent today/week/month, delivery %
│   │           ├── sms-usage-chart.tsx    # recharts AreaChart (like analytics)
│   │           ├── sms-history-table.tsx  # Paginated SMS log table
│   │           └── sms-settings.tsx       # Toggle block-on-zero, activate SMS
│   ├── super-admin/
│   │   └── sms/
│   │       └── page.tsx        # Global SMS balance management
│   └── actions/
│       └── sms.ts              # Server actions for SMS data/settings
├── inngest/
│   └── functions/
│       └── sms-delivery-check.ts  # Delayed delivery verification
```

### Pattern 1: Domain Layer SMS Function
**What:** All SMS sending MUST go through `src/lib/domain/sms.ts` — the same pattern as contacts, orders, messages.
**When to use:** Any code path that sends SMS (automation action, domain function calls from other modules, scripts).
**Example:**
```typescript
// Source: Existing domain pattern from src/lib/domain/contacts.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'
import { sendOnurixSMS, checkOnurixStatus } from '@/lib/sms/client'

export interface SendSMSParams {
  phone: string           // Format: 57XXXXXXXXXX
  message: string
  /** Source identifier for history tracking */
  source?: string         // 'automation' | 'domain-call' | 'script'
  /** Automation execution ID for linking */
  automationExecutionId?: string
}

export interface SendSMSResult {
  smsLogId: string
  dispatchId: string
  status: 'pending' | 'sent' | 'failed'
  creditsUsed: number
}

export async function sendSMS(
  ctx: DomainContext,
  params: SendSMSParams
): Promise<DomainResult<SendSMSResult>> {
  const supabase = createAdminClient()

  // 1. Check balance (unless workspace allows negative)
  // 2. Calculate credits needed (message length / 160, rounded up)
  // 3. Deduct credits
  // 4. Call Onurix API
  // 5. Log to sms_messages table
  // 6. Schedule delivery verification via Inngest
  // 7. Return result
}
```

### Pattern 2: Onurix API Client (Simple HTTP Fetch)
**What:** Thin wrapper around Onurix REST API. No SDK needed — just `fetch()`.
**When to use:** Called exclusively by domain/sms.ts.
**Example:**
```typescript
// Source: Onurix API documentation (confirmed in CONTEXT.md discussion)
const ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

export async function sendOnurixSMS(params: {
  phone: string    // 57XXXXXXXXXX format
  message: string
}): Promise<OnurixSendResponse> {
  const url = new URL(`${ONURIX_BASE_URL}/sms/send_sms`)
  url.searchParams.set('client', process.env.ONURIX_CLIENT_ID!)
  url.searchParams.set('key', process.env.ONURIX_API_KEY!)
  url.searchParams.set('phone', params.phone)
  url.searchParams.set('sms', params.message)

  const res = await fetch(url.toString(), { method: 'POST' })
  return res.json()
}

// Response format (confirmed by user testing):
// { status: 1, id: "dispatch_id", data: { state, credits, sms, phone } }

export async function checkOnurixStatus(dispatchId: string): Promise<OnurixStatusResponse> {
  const url = new URL(`${ONURIX_BASE_URL}/general/message_state`)
  url.searchParams.set('client', process.env.ONURIX_CLIENT_ID!)
  url.searchParams.set('key', process.env.ONURIX_API_KEY!)
  url.searchParams.set('id', dispatchId)

  const res = await fetch(url.toString())
  return res.json()
}

// Response format (confirmed by user testing):
// [{ state: "Enviado", id, credits, phone, sms, dispatch_id }]
```

### Pattern 3: Automation Action Replacement
**What:** Replace the existing Twilio-based `executeSendSms` in action-executor.ts with Onurix via domain.
**When to use:** When the `send_sms` automation action fires.
**Example:**
```typescript
// In action-executor.ts, replace executeSendSms:
async function executeSendSms(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const body = String(params.body || '')
  if (!body) throw new Error('body is required for send_sms')

  const to = params.to ? String(params.to) : context.contactPhone
  if (!to) throw new Error('No phone number available for SMS')

  // Format phone: ensure 57 prefix
  const formattedPhone = formatColombianPhone(to)

  const ctx: DomainContext = { workspaceId, source: 'automation' }
  const result = await domainSendSMS(ctx, {
    phone: formattedPhone,
    message: body,
    source: 'automation',
  })

  if (!result.success) throw new Error(result.error || 'SMS send failed')
  return result.data
}
```

### Pattern 4: Inngest Delivery Verification
**What:** Two-stage delayed checks: 10s and 60s after sending.
**When to use:** After every SMS is sent, domain/sms.ts emits an Inngest event.
**Example:**
```typescript
// In src/inngest/functions/sms-delivery-check.ts
export const smsDeliveryCheck = inngest.createFunction(
  { id: 'sms-delivery-check', retries: 1 },
  { event: 'sms/delivery.check' as any },
  async ({ event, step }) => {
    const { smsLogId, dispatchId, workspaceId } = event.data

    // First check: 10 seconds after send
    await step.sleep('wait-10s', '10s')
    const firstCheck = await step.run('check-1', async () => {
      return checkOnurixStatus(dispatchId)
    })

    if (firstCheck[0]?.state === 'Enviado') {
      // Update sms_messages status
      await step.run('update-status-delivered', async () => {
        const supabase = createAdminClient()
        await supabase.from('sms_messages')
          .update({ status: 'delivered', delivery_checked_at: new Date().toISOString() })
          .eq('id', smsLogId)
      })
      return { status: 'delivered', checks: 1 }
    }

    // Second check: 60 seconds after send
    await step.sleep('wait-60s', '50s') // 50s more (total 60s from send)
    const secondCheck = await step.run('check-2', async () => {
      return checkOnurixStatus(dispatchId)
    })

    // Update final status
    await step.run('update-final-status', async () => {
      const supabase = createAdminClient()
      const status = secondCheck[0]?.state === 'Enviado' ? 'delivered' : 'failed'
      await supabase.from('sms_messages')
        .update({ status, delivery_checked_at: new Date().toISOString() })
        .eq('id', smsLogId)
    })

    return { status: secondCheck[0]?.state, checks: 2 }
  }
)
```

### Pattern 5: Credit System
**What:** Per-workspace prepaid credit system in COP. Each SMS costs $97 COP.
**When to use:** Checked before every SMS send, modified by admin.
**DB Structure:**
```sql
-- New table for SMS workspace configuration and balance
CREATE TABLE sms_workspace_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  balance_cop DECIMAL(12, 2) NOT NULL DEFAULT 0,
  allow_negative_balance BOOLEAN NOT NULL DEFAULT true,
  total_sms_sent INTEGER NOT NULL DEFAULT 0,
  total_credits_used DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Balance transactions log (recharges, SMS deductions)
CREATE TABLE sms_balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'recharge' | 'sms_deduction' | 'adjustment'
  amount_cop DECIMAL(12, 2) NOT NULL, -- positive for recharge, negative for deduction
  balance_after DECIMAL(12, 2) NOT NULL,
  description TEXT,
  sms_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL,
  created_by UUID, -- admin user for recharges, null for auto-deductions
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

### Anti-Patterns to Avoid
- **Calling Onurix directly from action-executor.ts:** Always go through domain/sms.ts. The domain function handles balance checking, deduction, logging, and delivery verification scheduling.
- **Storing Onurix credentials in DB:** Unlike Twilio (per-workspace credentials in integrations table), Onurix uses a single account for all workspaces. Store in env vars (`ONURIX_CLIENT_ID`, `ONURIX_API_KEY`).
- **Skipping phone format validation:** Onurix requires `57XXXXXXXXXX` format. Always validate and format before sending.
- **Sending SMS outside 8 AM - 9 PM Colombia time:** CRC regulation requires this window. Check before sending and reject with clear error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charts for usage metrics | Custom SVG charts | recharts (already installed, used in Analytics) | Already proven pattern in analytics dashboard |
| Delayed delivery checks | setTimeout or cron | Inngest step.sleep() + step.run() | Durable, survives serverless restarts |
| Phone number formatting | regex replace | Dedicated utility function in `src/lib/sms/utils.ts` | Colombian numbers have edge cases (10-digit without country code, with +57, with 57, etc.) |
| Pagination for SMS history | Custom offset pagination | Supabase range() with count | Already used pattern in CRM tables |

**Key insight:** This module is structurally identical to the existing Twilio SMS integration but with a different provider and added credit system. Follow existing patterns exactly.

## Common Pitfalls

### Pitfall 1: SMS Length and Multi-Segment Billing
**What goes wrong:** SMS messages over 160 characters (or 70 for messages with special characters like accents/tildes) consume multiple segments. User thinks they're sending 1 SMS but gets charged for 2-3.
**Why it happens:** GSM-7 encoding = 160 chars/segment, UCS-2 (accents, emojis) = 70 chars/segment.
**How to avoid:** Calculate segments before sending. Onurix's response includes `credits` which tells actual segments used. Use that for billing, not a guess.
**Warning signs:** `credits` field in Onurix response > 1.

### Pitfall 2: Race Condition on Balance Deduction
**What goes wrong:** Two automations fire simultaneously for the same workspace, both check balance (e.g., $97), both see sufficient funds, both deduct — resulting in double-spend when balance was only enough for one.
**Why it happens:** No transactional lock on balance check + deduction.
**How to avoid:** Use a Supabase RPC function with `FOR UPDATE` lock on the sms_workspace_config row during balance check + deduction. Single atomic operation.
**Warning signs:** Balance going more negative than expected when `allow_negative_balance` is true.

### Pitfall 3: Onurix API Endpoint Discovery
**What goes wrong:** Using wrong endpoint path. The CONTEXT.md mentions `/api/v1/sms/send` but official docs show `/api/v1/sms/send_sms`. Similarly, verification endpoint is `/api/v1/general/message_state` not `/api/v1/messages-state`.
**Why it happens:** Discrepancy between user notes and actual API documentation.
**How to avoid:** Use the endpoints confirmed by the official Onurix documentation site: `/api/v1/sms/send_sms` for sending and `/api/v1/general/message_state` for status check. The user confirmed both work during live testing.
**Warning signs:** 404 responses from Onurix API.

### Pitfall 4: Colombia SMS Time Restrictions
**What goes wrong:** SMS sent outside 8 AM - 9 PM Colombia time (CRC regulation) may be blocked by carriers or result in regulatory issues.
**Why it happens:** Automation triggers can fire at any time (e.g., a Shopify order at 11 PM).
**How to avoid:** Check current Colombia time before sending. If outside window, return a clear error that gets logged in the automation execution: "SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)".
**Warning signs:** Failed SMS during nighttime hours.

### Pitfall 5: Existing Twilio SMS Table Reuse
**What goes wrong:** The existing `sms_messages` table has `twilio_sid` as a NOT NULL UNIQUE column. Onurix uses a `dispatch_id` instead.
**Why it happens:** Table was designed specifically for Twilio.
**How to avoid:** Migrate the table: rename `twilio_sid` to `provider_message_id`, make it nullable or always populated. Add a `provider` column ('twilio' | 'onurix'). Add new columns for Onurix-specific data.
**Warning signs:** Insert failures on the `twilio_sid` constraint.

### Pitfall 6: ACTION_CATALOG Category Change
**What goes wrong:** The existing `send_sms` action in ACTION_CATALOG has `category: 'Twilio'`. Changing it to 'SMS' could break existing automations that reference it.
**Why it happens:** The action type `send_sms` is stored in automation records in the database.
**How to avoid:** Keep the action type as `send_sms` (no change). Only change the category label to 'SMS' and description. The action type is what's stored in automation configs — the category is just UI display. Also update the params to remove `mediaUrl` (Onurix doesn't support MMS) and add the `to` phone parameter description.
**Warning signs:** Existing automations stop working after migration.

## Code Examples

### Onurix API Client
```typescript
// src/lib/sms/client.ts
// Source: Onurix API docs (https://docs.onurix.com) + user live testing

const ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

export interface OnurixSendResponse {
  status: number      // 1 = success
  id: string          // dispatch_id for status checks
  data: {
    state: string
    credits: number   // actual segments used (for billing)
    sms: string
    phone: string
  }
}

export interface OnurixStatusItem {
  state: string       // "Enviado" = delivered
  id: string
  credits: number
  phone: string
  sms: string
  dispatch_id: string
}

export async function sendOnurixSMS(phone: string, message: string): Promise<OnurixSendResponse> {
  const url = new URL(`${ONURIX_BASE_URL}/sms/send_sms`)
  url.searchParams.set('client', process.env.ONURIX_CLIENT_ID!)
  url.searchParams.set('key', process.env.ONURIX_API_KEY!)
  url.searchParams.set('phone', phone)
  url.searchParams.set('sms', message)

  const res = await fetch(url.toString(), { method: 'POST' })
  if (!res.ok) throw new Error(`Onurix API error: ${res.status} ${res.statusText}`)
  return res.json()
}

export async function checkOnurixStatus(dispatchId: string): Promise<OnurixStatusItem[]> {
  const url = new URL(`${ONURIX_BASE_URL}/general/message_state`)
  url.searchParams.set('client', process.env.ONURIX_CLIENT_ID!)
  url.searchParams.set('key', process.env.ONURIX_API_KEY!)
  url.searchParams.set('id', dispatchId)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Onurix status check error: ${res.status}`)
  return res.json()
}
```

### Phone Number Formatting
```typescript
// src/lib/sms/utils.ts
/**
 * Format a Colombian phone number for Onurix API (57XXXXXXXXXX).
 * Handles various input formats:
 * - 3137549286     -> 573137549286
 * - +573137549286  -> 573137549286
 * - 573137549286   -> 573137549286
 * - 03137549286    -> 573137549286
 */
export function formatColombianPhone(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '')

  // Already has 57 prefix and correct length
  if (digits.startsWith('57') && digits.length === 12) {
    return digits
  }

  // 10-digit Colombian mobile (3XX...)
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`
  }

  // 10-digit with leading 0
  if (digits.length === 11 && digits.startsWith('0')) {
    return `57${digits.slice(1)}`
  }

  throw new Error(`Invalid Colombian phone number: ${phone}`)
}

/**
 * Calculate SMS segments based on message content.
 * GSM-7: 160 chars per segment
 * UCS-2 (accents, special chars): 70 chars per segment
 */
export function calculateSMSSegments(message: string): number {
  const isGSM7 = /^[\x20-\x7E\n\r]*$/.test(message) // ASCII only
  const charsPerSegment = isGSM7 ? 160 : 70
  return Math.ceil(message.length / charsPerSegment)
}

/**
 * Check if current time is within Colombia SMS sending window (8 AM - 9 PM).
 */
export function isWithinSMSWindow(): boolean {
  const now = new Date()
  const colombiaHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })
  )
  return colombiaHour >= 8 && colombiaHour < 21
}
```

### Balance Check with Atomic Deduction (Supabase RPC)
```sql
-- Migration: RPC for atomic balance deduction
CREATE OR REPLACE FUNCTION deduct_sms_balance(
  p_workspace_id UUID,
  p_amount DECIMAL,
  p_sms_message_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
BEGIN
  -- Lock the row for atomic read-check-update
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'SMS no activado en este workspace'::TEXT;
    RETURN;
  END IF;

  IF NOT v_config.is_active THEN
    RETURN QUERY SELECT false, v_config.balance_cop, 'Servicio SMS desactivado'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - p_amount;

  -- Check if negative balance allowed
  IF NOT v_config.allow_negative_balance AND v_new_balance < 0 THEN
    RETURN QUERY SELECT false, v_config.balance_cop, 'Saldo SMS insuficiente'::TEXT;
    RETURN;
  END IF;

  -- Deduct balance
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_sms_sent = total_sms_sent + 1,
      total_credits_used = total_credits_used + p_amount,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  -- Log transaction
  INSERT INTO sms_balance_transactions (workspace_id, type, amount_cop, balance_after, description, sms_message_id)
  VALUES (p_workspace_id, 'sms_deduction', -p_amount, v_new_balance, p_description, p_sms_message_id);

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;
```

### Sidebar Navigation Addition
```typescript
// Add to navItems array in src/components/layout/sidebar.tsx
// Place after WhatsApp, before Tareas
{
  href: '/sms',
  label: 'SMS',
  icon: MessageSquareText, // from lucide-react
}
```

### SMS Dashboard Page Structure
```typescript
// src/app/(dashboard)/sms/page.tsx
// Follows analytics page pattern exactly
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SMSDashboard } from './components/sms-dashboard'
import { getSMSMetrics, getSMSConfig } from '@/app/actions/sms'

export default async function SMSPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) redirect('/crm/pedidos')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [metrics, config] = await Promise.all([
    getSMSMetrics(),
    getSMSConfig(),
  ])

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">SMS</h1>
          <p className="text-muted-foreground">
            Historial de mensajes, saldo y estadisticas de entrega
          </p>
        </div>
        <SMSDashboard initialMetrics={metrics} initialConfig={config} />
      </div>
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio send_sms action | Onurix via domain/sms.ts | This phase | Lower cost ($6.9 vs ~$50 COP), Colombian provider |
| No credit system | Prepaid COP balance per workspace | This phase | Revenue model for SMS service |
| Twilio status callback (push) | Inngest delayed polling (pull) | This phase | Onurix doesn't push status; we poll at 10s + 60s |
| twilio_sid in sms_messages | provider_message_id (generic) | This phase | Supports both providers if needed in future |

**Key change from Twilio to Onurix:**
- Twilio: SDK-based, per-workspace credentials, push-based status callbacks
- Onurix: REST API (fetch), single account credentials (env vars), pull-based status verification
- Twilio: International, Onurix: Colombia-only (which is all MorfX needs)

## Open Questions

1. **Onurix API Endpoint Confirmation**
   - What we know: Docs site (https://docs.onurix.com) shows `/api/v1/sms/send_sms` and `/api/v1/general/message_state`. User tested both successfully during discussion.
   - What's unclear: The exact error response format when API fails (status != 1). Also unclear if IP whitelisting is required for production (docs mention it).
   - Recommendation: Test error cases during implementation. Confirm IP whitelist with Onurix support if Vercel IPs need whitelisting. Consider using `ONURIX_BASE_URL` env var for flexibility.
   - Confidence: MEDIUM (user-tested but edge cases unknown)

2. **SMS Long Message Handling**
   - What we know: Messages > 160 chars (GSM-7) or > 70 chars (UCS-2) consume multiple segments. Onurix returns `credits` in response showing actual segments.
   - What's unclear: Should the system warn users in the automation builder about message length? Should billing use estimated segments (pre-send) or actual credits (post-send)?
   - Recommendation: Bill using Onurix's reported `credits` from the send response (actual). Show estimated segment count in automation builder UI as a helper but don't enforce limits.

3. **Existing Twilio SMS Data Migration**
   - What we know: There is an `sms_messages` table with Twilio data from existing send_sms automations.
   - What's unclear: Are there active automations using Twilio send_sms in production? If so, migration needs to preserve historical data.
   - Recommendation: Add new columns to existing table (or create new table). Keep `twilio_sid` column but make it nullable. Add `provider` and `provider_message_id` columns.

4. **Super-Admin SMS Page Location**
   - What we know: Super-admin already has `/super-admin/workspaces` and `/super-admin/costos` pages with established patterns.
   - What's unclear: Should SMS balance management be a new top-level page `/super-admin/sms` or integrated into existing workspace detail pages at `/super-admin/workspaces/[id]`?
   - Recommendation: Add a new nav link "SMS" in the super-admin layout, AND add a SMS balance section in the per-workspace detail page. The top-level page shows all workspaces' SMS balances at a glance; the per-workspace page allows recharging.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/lib/automations/action-executor.ts` (existing send_sms action)
- Codebase analysis: `src/lib/automations/constants.ts` (ACTION_CATALOG structure)
- Codebase analysis: `supabase/migrations/20260216000000_sms_messages.sql` (existing table)
- Codebase analysis: `src/lib/twilio/client.ts` (provider pattern to follow)
- Codebase analysis: `src/inngest/functions/automation-runner.ts` (Inngest function patterns)
- Codebase analysis: `src/components/layout/sidebar.tsx` (navigation structure)
- Codebase analysis: `src/app/(dashboard)/analytics/` (dashboard page pattern)
- Codebase analysis: `src/app/super-admin/` (admin panel patterns)
- Codebase analysis: `src/lib/domain/types.ts` (DomainContext/DomainResult pattern)

### Secondary (MEDIUM confidence)
- Onurix API documentation (https://docs.onurix.com) - Endpoints confirmed via WebFetch
- User live testing of Onurix API during discuss phase - Confirmed send + status check work
- CONTEXT.md decisions - API format, pricing, delivery verification approach

### Tertiary (LOW confidence)
- Onurix error handling details - Not found in public docs, needs runtime testing
- IP whitelisting requirement for production - Mentioned in docs but unclear if enforced
- CRC Colombia SMS regulations - Confirmed 8AM-9PM window but specific implementation requirements unclear

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all patterns exist in codebase
- Architecture: HIGH - Directly follows existing domain/automation/Inngest patterns
- Pitfalls: HIGH - Identified from codebase analysis and Onurix API specifics
- Onurix API specifics: MEDIUM - User-tested but error edge cases unknown

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable — no rapidly changing dependencies)
