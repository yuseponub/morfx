---
phase: standalone/action-fields-audit
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/domain/orders.ts
  - src/lib/automations/action-executor.ts
autonomous: true

must_haves:
  truths:
    - "duplicate_order respects copyContact, copyProducts, and copyValue flags"
    - "When copyContact is false, the duplicated order has no contact_id"
    - "When copyProducts is false, no products are copied to the new order"
    - "When copyValue is false, total_value is not recalculated from source products"
  artifacts:
    - path: "src/lib/domain/orders.ts"
      provides: "DuplicateOrderParams with optional copy flags"
      contains: "copyContact"
    - path: "src/lib/automations/action-executor.ts"
      provides: "executeDuplicateOrder passes copy flags to domain"
      contains: "copyContact.*copyProducts.*copyValue"
  key_links:
    - from: "action-executor.ts executeDuplicateOrder"
      to: "domainDuplicateOrder"
      via: "copyContact, copyProducts, copyValue params"
      pattern: "copyContact|copyProducts|copyValue"
---

<objective>
Fix the duplicate_order broken toggles. Currently the domain function always copies contact, products, and value regardless of what the user configures. Add optional flags to DuplicateOrderParams and respect them in the domain function.

Purpose: Users configure copyContact/copyProducts/copyValue toggles in the UI but they have zero effect. This makes the toggles actually work.
Output: Updated domain/orders.ts with conditional copy logic + updated executor to pass the flags.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/action-fields-audit/PHASE.md
@.planning/standalone/action-fields-audit/RESEARCH.md
@src/lib/domain/orders.ts (DuplicateOrderParams + duplicateOrder function)
@src/lib/automations/action-executor.ts (executeDuplicateOrder function)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add copy flags to DuplicateOrderParams and respect them in domain</name>
  <files>src/lib/domain/orders.ts</files>
  <action>
1. Update `DuplicateOrderParams` interface (line ~80) to add optional copy flags. Default behavior when flags are undefined should be TRUE (copy everything) to preserve backward compatibility for all callers that don't pass these flags:

```typescript
export interface DuplicateOrderParams {
  sourceOrderId: string
  targetPipelineId: string
  targetStageId?: string | null
  /** Copy contact_id from source? Default: true */
  copyContact?: boolean
  /** Copy products from source? Default: true */
  copyProducts?: boolean
  /** Copy total_value from source? Default: true */
  copyValue?: boolean
}
```

2. Update the `duplicateOrder` function body (starting at line ~580). Modify the insert to conditionally include fields:

Replace the insert call (lines ~618-634) with:
```typescript
const shouldCopyContact = params.copyContact !== false  // default true
const shouldCopyProducts = params.copyProducts !== false  // default true
const shouldCopyValue = params.copyValue !== false  // default true

// Create new order with source_order_id reference
const { data: newOrder, error: createError } = await supabase
  .from('orders')
  .insert({
    workspace_id: ctx.workspaceId,
    contact_id: shouldCopyContact ? sourceOrder.contact_id : null,
    pipeline_id: params.targetPipelineId,
    stage_id: targetStageId,
    source_order_id: params.sourceOrderId,
    description: sourceOrder.description,
    shipping_address: sourceOrder.shipping_address,
    shipping_city: sourceOrder.shipping_city,
    shipping_department: sourceOrder.shipping_department,
    carrier: sourceOrder.carrier,
    tracking_number: sourceOrder.tracking_number,
    custom_fields: sourceOrder.custom_fields || {},
  })
  .select('id')
  .single()
```

Note: description, shipping info, carrier, tracking, custom_fields are always copied (they're the order identity). Only contact, products, and value are toggleable.

3. Wrap the products copy block (lines ~640-659) with the flag check:
```typescript
// Copy products only if configured
if (shouldCopyProducts) {
  const sourceProducts = sourceOrder.order_products as Array<{
    title: string
    sku: string
    unit_price: number
    quantity: number
    product_id: string | null
  }> | null

  if (sourceProducts && sourceProducts.length > 0) {
    const productsToInsert = sourceProducts.map((p) => ({
      order_id: newOrder.id,
      product_id: p.product_id || null,
      sku: p.sku,
      title: p.title,
      unit_price: p.unit_price,
      quantity: p.quantity,
    }))

    await supabase.from('order_products').insert(productsToInsert)
  }
}
```

4. For the total_value re-read (lines ~662-667), only set it from source if copyValue AND copyProducts:
```typescript
// Set total_value: from products if copied, from source if copyValue, else 0
if (shouldCopyProducts) {
  // Re-read total_value after products insert (DB trigger may recalculate)
  const { data: finalOrder } = await supabase
    .from('orders')
    .select('total_value')
    .eq('id', newOrder.id)
    .single()

  // If NOT copying value, zero it out even though products were copied
  if (!shouldCopyValue) {
    await supabase
      .from('orders')
      .update({ total_value: 0 })
      .eq('id', newOrder.id)
  }

  // Emit trigger with appropriate value
  const totalValue = shouldCopyValue
    ? (finalOrder?.total_value ?? sourceOrder.total_value ?? 0)
    : 0

  await emitOrderCreated({
    workspaceId: ctx.workspaceId,
    orderId: newOrder.id,
    pipelineId: params.targetPipelineId,
    stageId: targetStageId,
    contactId: shouldCopyContact ? (sourceOrder.contact_id ?? null) : null,
    totalValue,
    sourceOrderId: params.sourceOrderId,
    cascadeDepth: ctx.cascadeDepth,
  })
} else {
  // No products copied
  if (shouldCopyValue && sourceOrder.total_value) {
    // Copy value without products (explicit total)
    await supabase
      .from('orders')
      .update({ total_value: sourceOrder.total_value })
      .eq('id', newOrder.id)
  }

  await emitOrderCreated({
    workspaceId: ctx.workspaceId,
    orderId: newOrder.id,
    pipelineId: params.targetPipelineId,
    stageId: targetStageId,
    contactId: shouldCopyContact ? (sourceOrder.contact_id ?? null) : null,
    totalValue: shouldCopyValue ? (sourceOrder.total_value ?? 0) : 0,
    sourceOrderId: params.sourceOrderId,
    cascadeDepth: ctx.cascadeDepth,
  })
}
```
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `copyContact` and `shouldCopyContact` in domain/orders.ts.</verify>
  <done>DuplicateOrderParams accepts copyContact, copyProducts, copyValue flags. Domain function respects all three with backward-compatible defaults (true when undefined).</done>
</task>

<task type="auto">
  <name>Task 2: Pass copy flags from executor to domain</name>
  <files>src/lib/automations/action-executor.ts</files>
  <action>
In the `executeDuplicateOrder` function (line ~452), update the domain call to pass the copy flags from params:

Replace the current domainDuplicateOrder call (lines ~466-470) with:
```typescript
const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
const result = await domainDuplicateOrder(ctx, {
  sourceOrderId,
  targetPipelineId,
  targetStageId,
  copyContact: params.copyContact !== undefined ? !!params.copyContact : undefined,
  copyProducts: params.copyProducts !== undefined ? !!params.copyProducts : undefined,
  copyValue: params.copyValue !== undefined ? !!params.copyValue : undefined,
})
```

This passes the boolean flags from automation params to the domain, while leaving them undefined (triggering default=true) if the user didn't configure them.
  </action>
  <verify>Run `npx tsc --noEmit`. Grep for `copyContact.*copyProducts.*copyValue` in the executeDuplicateOrder function.</verify>
  <done>Executor passes all three copy flags to domain. Toggles in UI will now have real effect through executor -> domain chain.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. DuplicateOrderParams has copyContact, copyProducts, copyValue fields
3. Domain duplicateOrder function conditionally copies contact, products, and value
4. Executor passes the flags from automation params to domain
5. Default behavior (flags undefined) = copy everything (backward compatible)
</verification>

<success_criteria>
duplicate_order toggles actually control behavior: copyContact=false means no contact on new order, copyProducts=false means no products copied, copyValue=false means total_value=0.
</success_criteria>

<output>
After completion, create `.planning/standalone/action-fields-audit/02-SUMMARY.md`
</output>
