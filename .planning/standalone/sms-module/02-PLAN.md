---
phase: sms-module
plan: 02
type: execute
wave: 2
depends_on: ["sms-module-01"]
files_modified:
  - src/inngest/functions/sms-delivery-check.ts
  - src/inngest/client.ts
  - src/app/api/inngest/route.ts
  - src/lib/automations/action-executor.ts
  - src/lib/automations/constants.ts
autonomous: true

must_haves:
  truths:
    - "Inngest function checks delivery at 10s and 60s after send"
    - "sms_messages status updated to delivered or failed based on Onurix check"
    - "send_sms automation action uses domain sendSMS instead of Twilio"
    - "Twilio imports removed from action-executor"
    - "ACTION_CATALOG send_sms category changed from Twilio to SMS"
  artifacts:
    - path: "src/inngest/functions/sms-delivery-check.ts"
      provides: "Delayed delivery verification via Inngest"
      exports: ["smsDeliveryCheck"]
    - path: "src/lib/automations/action-executor.ts"
      provides: "Onurix-based executeSendSms"
      contains: "domainSendSMS"
  key_links:
    - from: "src/lib/domain/sms.ts"
      to: "src/inngest/functions/sms-delivery-check.ts"
      via: "inngest.send sms/delivery.check event"
      pattern: "sms/delivery.check"
    - from: "src/lib/automations/action-executor.ts"
      to: "src/lib/domain/sms.ts"
      via: "domainSendSMS import"
      pattern: "sendSMS"
---

<objective>
Wire the SMS delivery verification via Inngest and replace the Twilio-based automation action with the Onurix domain function.

Purpose: Completes the sending pipeline — SMS can be sent via automations and delivery is verified automatically.
Output: Inngest function for delivery checks, updated automation action executor
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-module/CONTEXT.md
@.planning/standalone/sms-module/RESEARCH.md
@.planning/standalone/sms-module/01-SUMMARY.md
@src/inngest/functions/automation-runner.ts
@src/lib/automations/action-executor.ts
@src/lib/automations/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Inngest delivery verification function</name>
  <files>
    src/inngest/functions/sms-delivery-check.ts
    src/inngest/client.ts
    src/app/api/inngest/route.ts
  </files>
  <action>
**src/inngest/functions/sms-delivery-check.ts:**

Create Inngest function following existing patterns (see automation-runner.ts for style):

```
export const smsDeliveryCheck = inngest.createFunction(
  { id: 'sms-delivery-check', retries: 1 },
  { event: 'sms/delivery.check' as any },
  async ({ event, step }) => { ... }
)
```

Logic:
1. Extract { smsMessageId, dispatchId, workspaceId } from event.data
2. step.sleep('wait-10s', '10s')
3. step.run('check-1'): Call checkOnurixStatus(dispatchId) from src/lib/sms/client.ts
4. If firstCheck has state 'Enviado' (delivered): step.run('update-delivered'): update sms_messages set status='delivered', delivery_checked_at=now() where id=smsMessageId. Return { status: 'delivered', checks: 1 }.
5. Otherwise: step.sleep('wait-50s', '50s') (total ~60s from send)
6. step.run('check-2'): Call checkOnurixStatus again
7. step.run('update-final'): Map 'Enviado' to 'delivered', anything else to 'failed'. Update sms_messages. Return { status, checks: 2 }.

Use createAdminClient() for DB updates.

**Register the function:**
- Add import to src/inngest/client.ts (or wherever functions are registered)
- Add to the functions array in src/app/api/inngest/route.ts (check existing pattern for how functions are registered with the serve handler)
  </action>
  <verify>
    - TypeScript compiles
    - smsDeliveryCheck is exported and registered in the Inngest serve handler
    - Function uses step.sleep for durable delayed checks (not setTimeout)
    - Maximum 2 status checks per SMS (10s + 60s)
  </verify>
  <done>Inngest function exists, is registered, and handles 2-stage delivery verification with proper status updates to sms_messages.</done>
</task>

<task type="auto">
  <name>Task 2: Replace Twilio send_sms action with Onurix domain function</name>
  <files>
    src/lib/automations/action-executor.ts
    src/lib/automations/constants.ts
  </files>
  <action>
**action-executor.ts:**
1. Remove Twilio imports: `getTwilioConfig`, `createTwilioClient` from '@/lib/twilio/client'
2. Add import: `import { sendSMS as domainSendSMS } from '@/lib/domain/sms'`
3. Add import: `import { formatColombianPhone } from '@/lib/sms/utils'`
4. Replace the executeSendSms function body:

```typescript
async function executeSendSms(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const body = String(params.body || '')
  if (!body) throw new Error('body is required for send_sms')

  const to = params.to ? String(params.to) : context.contactPhone
  if (!to) throw new Error('No phone number available for SMS — set "to" param or ensure trigger has contactPhone')

  const ctx: DomainContext = { workspaceId, source: 'automation' }
  const result = await domainSendSMS(ctx, {
    phone: to,
    message: body,
    source: 'automation',
    contactName: context.contactName || undefined,
  })

  if (!result.success) throw new Error(result.error || 'SMS send failed')
  return result.data
}
```

Note: formatColombianPhone is called inside domainSendSMS, no need to call it here. The domain function handles all validation.

**constants.ts:**
Update the send_sms entry in ACTION_CATALOG:
- Change category from 'Twilio' to 'SMS'
- Change description to 'Envia un mensaje SMS al contacto'
- Remove mediaUrl param (Onurix doesn't support MMS)
- Keep body and to params as-is

IMPORTANT: Do NOT change the action type key 'send_sms' — it's stored in existing automation configs in the DB.
  </action>
  <verify>
    - TypeScript compiles (no Twilio import errors — confirm Twilio isn't used elsewhere in action-executor.ts)
    - grep for 'twilio' in action-executor.ts returns nothing (or only comments)
    - ACTION_CATALOG send_sms has category 'SMS', no mediaUrl param
    - executeSendSms delegates to domain sendSMS
  </verify>
  <done>
    - Twilio completely removed from action-executor.ts
    - send_sms action goes through domain/sms.ts (balance check, Onurix, logging, delivery verification)
    - ACTION_CATALOG updated with 'SMS' category
  </done>
</task>

</tasks>

<verification>
- Inngest function registered and handles sms/delivery.check events
- action-executor.ts has zero Twilio references
- send_sms automation action works through domain layer
- Delivery verification runs 2 checks maximum (10s + 60s)
</verification>

<success_criteria>
- Complete SMS sending pipeline: automation fires -> domain sendSMS -> Onurix API -> log -> Inngest delivery check -> status update
- No Twilio dependency in the SMS sending path
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-module/02-SUMMARY.md`
</output>
