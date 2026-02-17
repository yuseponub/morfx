---
phase: standalone/action-fields-audit
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/automations/action-executor.ts
autonomous: true

must_haves:
  truths:
    - "Executor passes ALL domain-accepted fields for create_order, update_field, create_task, send_whatsapp_media"
    - "copyProducts toggle in create_order actually copies products from trigger context order"
  artifacts:
    - path: "src/lib/automations/action-executor.ts"
      provides: "Complete field pass-through for all action types"
      contains: "params.name"
  key_links:
    - from: "action-executor.ts executeCreateOrder"
      to: "domainCreateOrder"
      via: "name, closingDate, carrier, trackingNumber, customFields params"
      pattern: "name.*closingDate.*carrier.*trackingNumber"
    - from: "action-executor.ts executeUpdateField"
      to: "domainUpdateOrder / domainUpdateContact"
      via: "name, shipping_department in standardOrderFields + department in standardContactFields"
      pattern: "shipping_department"
    - from: "action-executor.ts executeCreateTask"
      to: "domainCreateTask"
      via: "priority param"
      pattern: "priority.*params\\.priority"
    - from: "action-executor.ts executeSendWhatsAppMedia"
      to: "domainSendMediaMessage"
      via: "filename param"
      pattern: "filename.*params\\.filename"
---

<objective>
Fix all executor field mapping gaps so every field the domain accepts is actually passed through by the action executor.

Purpose: The executor is the bridge between automation params and domain functions. Missing fields here mean the UI and AI builder can never reach those domain capabilities.
Output: Updated action-executor.ts with complete field pass-through for create_order, update_field, create_task, send_whatsapp_media, and working copyProducts toggle.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/action-fields-audit/PHASE.md
@.planning/standalone/action-fields-audit/RESEARCH.md
@src/lib/automations/action-executor.ts
@src/lib/domain/orders.ts (CreateOrderParams interface)
@src/lib/domain/tasks.ts (CreateTaskParams interface)
@src/lib/domain/messages.ts (SendMediaMessageParams interface)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix executeCreateOrder field pass-through + copyProducts toggle</name>
  <files>src/lib/automations/action-executor.ts</files>
  <action>
In the `executeCreateOrder` function (line ~374):

1. Add missing field pass-through from params to domainCreateOrder call. Currently the function only passes pipelineId, stageId, contactId, products, shippingAddress, shippingCity, shippingDepartment, description. Add these missing fields BEFORE the domainCreateOrder call:

```typescript
const name = params.name ? String(params.name) : undefined
const closingDate = params.closingDate ? String(params.closingDate) : undefined
const carrier = params.carrier
  ? String(params.carrier)
  : (context.carrier as string) || undefined
const trackingNumber = params.trackingNumber
  ? String(params.trackingNumber)
  : (context.trackingNumber as string) || undefined
const customFields = params.customFields
  ? (typeof params.customFields === 'object' ? params.customFields as Record<string, unknown> : undefined)
  : undefined
```

2. Pass them in the domainCreateOrder call object:
```typescript
const result = await domainCreateOrder(ctx, {
  pipelineId,
  stageId,
  contactId,
  products,
  shippingAddress,
  shippingCity,
  shippingDepartment,
  description,
  name,
  closingDate,
  carrier,
  trackingNumber,
  customFields,
})
```

3. Fix copyProducts toggle. Currently the function enriches `products` from `context.products` (trigger context) unconditionally. Change the products logic to respect the `copyProducts` param:

Replace the current products derivation block (lines ~388-395) with:
```typescript
// Copy products from trigger context if copyProducts is enabled and no explicit products in params
const products = params.copyProducts && Array.isArray(context.products)
  ? (context.products as Array<{ sku: string; title: string; quantity: number; price: string }>).map(p => ({
      sku: p.sku || '',
      title: p.title,
      unitPrice: parseFloat(p.price) || 0,
      quantity: p.quantity,
    }))
  : undefined
```

This means products are ONLY copied from trigger context when `copyProducts` is explicitly true (matching the UI toggle intention).
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors in action-executor.ts. Grep for `name,` and `closingDate` and `carrier` and `trackingNumber` and `customFields` within executeCreateOrder function.</verify>
  <done>executeCreateOrder passes all 5 missing fields (name, closingDate, carrier, trackingNumber, customFields) to domain AND copyProducts toggle actually controls product copying behavior.</done>
</task>

<task type="auto">
  <name>Task 2: Fix executeUpdateField, executeCreateTask, and executeSendWhatsAppMedia</name>
  <files>src/lib/automations/action-executor.ts</files>
  <action>
**A) Fix executeUpdateField (line ~283):**

1. Add `name` and `shipping_department` to the `standardOrderFields` array (line 306):
```typescript
const standardOrderFields = ['name', 'shipping_address', 'shipping_department', 'description', 'carrier', 'tracking_number', 'shipping_city', 'closing_date', 'contact_id']
```

2. Add them to the `domainFieldMap` (line 307):
```typescript
const domainFieldMap: Record<string, string> = {
  'name': 'name',
  'shipping_address': 'shippingAddress',
  'shipping_department': 'shippingDepartment',
  'description': 'description',
  'carrier': 'carrier',
  'tracking_number': 'trackingNumber',
  'shipping_city': 'shippingCity',
  'closing_date': 'closingDate',
  'contact_id': 'contactId',
}
```

3. Add `department` to the `standardContactFields` array (line 349):
```typescript
const standardContactFields = ['name', 'phone', 'email', 'address', 'city', 'department']
```

The domain's `updateContact` already accepts `department` as a field.

**B) Fix executeCreateTask (line ~763):**

Add `priority` pass-through. After the `description` line (line 772), add:
```typescript
const priority = params.priority ? String(params.priority) as 'low' | 'medium' | 'high' | 'urgent' : undefined
```

And include it in the domainCreateTask call:
```typescript
const result = await domainCreateTask(ctx, {
  title,
  description,
  priority,
  dueDate,
  contactId: context.contactId || undefined,
  orderId: context.orderId || undefined,
  assignedTo: params.assignToUserId ? String(params.assignToUserId) : undefined,
})
```

**C) Fix executeSendWhatsAppMedia (line ~704):**

Add `filename` pass-through. After the `caption` line (line 715), add:
```typescript
const filename = params.filename ? String(params.filename) : undefined
```

And include it in the domainSendMediaMessage call (line ~739):
```typescript
const result = await domainSendMediaMessage(ctx, {
  conversationId: conversation.id,
  contactPhone: conversation.phone,
  mediaUrl,
  mediaType,
  caption,
  filename,
  apiKey,
})
```
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `shipping_department` in standardOrderFields, `department` in standardContactFields, `priority` in executeCreateTask, and `filename` in executeSendWhatsAppMedia.</verify>
  <done>executeUpdateField maps all order fields (including name, shipping_department) and all contact fields (including department). executeCreateTask passes priority to domain. executeSendWhatsAppMedia passes filename to domain.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. All 5 create_order fields reachable: name, closingDate, carrier, trackingNumber, customFields
3. copyProducts toggle guards product copying (not unconditional)
4. update_field handles name + shipping_department for orders, department for contacts
5. create_task passes priority
6. send_whatsapp_media passes filename
</verification>

<success_criteria>
Every field accepted by domain functions is now mapped in the executor. No field is silently dropped between automation params and domain calls.
</success_criteria>

<output>
After completion, create `.planning/standalone/action-fields-audit/01-SUMMARY.md`
</output>
