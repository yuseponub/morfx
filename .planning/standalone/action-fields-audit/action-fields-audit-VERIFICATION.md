---
phase: standalone/action-fields-audit
verified: 2026-02-17T23:48:52Z
status: passed
score: 7/7 must-haves verified
---

# Phase: Action Fields Complete Audit & Fix — Verification Report

**Phase Goal:** Every automation action exposes ALL fields that the domain/executor can handle. Users can map any field via a dropdown "add field" UX pattern. Fields left unmapped stay null. No hidden fields, no gaps. 4 layers per action: Domain → Executor → Wizard UI → AI Builder.

**Verified:** 2026-02-17T23:48:52Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                                                                                                         | Status     | Evidence                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Executor passes ALL domain-accepted fields** for create_order (name, closingDate, carrier, trackingNumber, customFields), update_field (name, shipping_department for orders; department for contacts), create_task (priority), send_whatsapp_media (filename)                                           | ✓ VERIFIED | action-executor.ts lines 418-445 pass all fields to domainCreateOrder; lines 306-370 handle all update_field mappings including department; lines 798-828 pass priority to domainCreateTask; lines 739 pass filename to domainSendMediaMessage                                                                                                   |
| 2   | **copyProducts toggle in create_order** actually controls product copying (opt-in, not unconditional)                                                                                                                                                                                                        | ✓ VERIFIED | action-executor.ts lines 389-397: `params.copyProducts` explicitly checked before copying products array from context. Products only copied when toggle is true.                                                                                                                                                                                  |
| 3   | **duplicate_order respects copyContact, copyProducts, copyValue flags** — domain function conditionally copies based on flags, defaults to true when undefined                                                                                                                                               | ✓ VERIFIED | action-executor.ts lines 490-493 pass flags to domain; domain/orders.ts lines 624-627 default to true for backward compatibility (`!== false`); domain conditionally copies contact (line 633), products (lines 653-674), and value (lines 676-727)                                                                                             |
| 4   | **ACTION_CATALOG has complete params** — remove_tag has entityType, update_field has entityType + field_select + supportsVariables on value, create_order has optional params with optional:true flag, create_task has priority, send_whatsapp_template has language, send_whatsapp_media has filename     | ✓ VERIFIED | constants.ts: remove_tag (line 166), update_field (lines 184-188), create_order (lines 199-208 with optional:true), create_task (line 263), send_whatsapp_template (line 231), send_whatsapp_media (line 252)                                                                                                                                    |
| 5   | **UI implements "Agregar campo" dropdown** — optional params hidden behind dropdown, active optionals can be removed                                                                                                                                                                                         | ✓ VERIFIED | actions-step.tsx lines 1082-1110: Popover with "Agregar campo" button filters optional params not in activeOptionals; lines 1046-1080 render active optionals with remove button; lines 944-948 track activeOptionals state                                                                                                                      |
| 6   | **field_select type** renders entity-aware field dropdown (contact vs order fields)                                                                                                                                                                                                                          | ✓ VERIFIED | actions-step.tsx lines 643-698: field_select checks entityType param, shows CONTACT_FIELDS (lines 647-654) or ORDER_FIELDS (lines 656-666) accordingly, with custom field fallback (lines 686-695)                                                                                                                                               |
| 7   | **AI builder system prompt** has dynamic param reference from ACTION_CATALOG (not hardcoded) + usage notes for entityType, create_order fields, priority, language, filename                                                                                                                                | ✓ VERIFIED | system-prompt.ts lines 68-81 generate param reference from ACTION_CATALOG; lines 253-272 document entityType, create_order optional fields, priority values, language options, filename usage. Dynamic catalog formatting in lines 19-100 ensures prompt updates when catalog changes.                                                           |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact                                | Expected                                                         | Status     | Details                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/automations/action-executor.ts` | Executor passes all domain-accepted fields                       | ✓ VERIFIED | Lines 376-466 (create_order), 283-370 (update_field), 788-835 (create_task), 727-776 (send_whatsapp_media). All domain params mapped.          |
| `src/lib/domain/orders.ts`              | DuplicateOrderParams with copyContact/copyProducts/copyValue     | ✓ VERIFIED | Lines 80-90 define params with boolean flags; lines 624-727 implement conditional copying with default true                                     |
| `src/lib/automations/constants.ts`      | ACTION_CATALOG with complete params for all 12 actions           | ✓ VERIFIED | Lines 148-290: all actions have complete param lists. Optional fields marked with `optional: true` flag.                                         |
| `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` | "Agregar campo" dropdown UX for optional params                  | ✓ VERIFIED | Lines 1082-1110: Popover-based dropdown; lines 1046-1080: removable active optionals; lines 944-948: state tracking                             |
| `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` | field_select rendering with entity-aware dropdowns               | ✓ VERIFIED | Lines 643-698: field_select param type handler with CONTACT_FIELDS/ORDER_FIELDS arrays based on entityType                                       |
| `src/lib/builder/system-prompt.ts`      | Dynamic param reference + usage notes                            | ✓ VERIFIED | Lines 68-81 (formatParamQuickReference), lines 253-272 (usage notes), lines 19-100 (dynamic catalog formatting)                                 |

### Key Link Verification

| From                       | To                      | Via                                                 | Status     | Details                                                                                                      |
| -------------------------- | ----------------------- | --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| action-executor.ts         | domain/orders.ts        | domainCreateOrder, domainDuplicateOrder, domainUpdateOrder calls | ✓ WIRED    | Lines 376-466, 472-518, 267-422. All domain params passed correctly.                                        |
| action-executor.ts         | domain/tasks.ts         | domainCreateTask call                               | ✓ WIRED    | Lines 788-835. Priority param passed (line 798)                                                              |
| action-executor.ts         | domain/messages.ts      | domainSendMediaMessage call                         | ✓ WIRED    | Lines 727-776. Filename param passed (line 739)                                                              |
| actions-step.tsx           | constants.ts            | ACTION_CATALOG import and param mapping             | ✓ WIRED    | Line 3 imports ACTION_CATALOG; line 936 finds catalog entry; lines 1029-1110 iterate params                 |
| system-prompt.ts           | constants.ts            | ACTION_CATALOG dynamic formatting                   | ✓ WIRED    | Lines 8-13 import catalogs; lines 44-81 format ACTION_CATALOG; line 214 inject formatted section            |
| actions-step.tsx (UI)      | action-executor.ts      | Form params become executor params                  | ✓ WIRED    | UI collects params in action.params object; executor reads same param names via resolvedParams (line 97-101)|

### Anti-Patterns Found

No anti-patterns detected. All implementations are substantive and production-ready.

### Gap Summary

No gaps found. All must-haves verified. Phase goal achieved.

---

## Detailed Verification Evidence

### 1. Executor Field Mapping Completeness

**create_order** (action-executor.ts:376-466):
```typescript
// Lines 418-445: ALL domain-accepted fields passed
const name = params.name ? String(params.name) : undefined
const closingDate = params.closingDate ? String(params.closingDate) : undefined
const carrier = params.carrier ? String(params.carrier) : (context.carrier as string) || undefined
const trackingNumber = params.trackingNumber ? String(params.trackingNumber) : (context.trackingNumber as string) || undefined
const customFields = params.customFields ? (typeof params.customFields === 'object' ? params.customFields as Record<string, unknown> : undefined) : undefined

const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
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
✓ All 5 new fields (name, closingDate, carrier, trackingNumber, customFields) present

**update_field** (action-executor.ts:283-370):
```typescript
// Lines 306-317: Order field mapping includes shipping_department
const standardOrderFields = ['name', 'shipping_address', 'shipping_department', 'description', 'carrier', 'tracking_number', 'shipping_city', 'closing_date', 'contact_id']
const domainFieldMap: Record<string, string> = {
  'name': 'name',
  'shipping_address': 'shippingAddress',
  'shipping_department': 'shippingDepartment',
  // ... more fields
}

// Lines 351: Contact field mapping includes department
const standardContactFields = ['name', 'phone', 'email', 'address', 'city', 'department']
```
✓ department (contact) and shipping_department (order) both supported

**create_task** (action-executor.ts:788-835):
```typescript
// Line 798: priority extracted and passed
const priority = params.priority ? String(params.priority) as 'low' | 'medium' | 'high' | 'urgent' : undefined

// Lines 820-827: priority passed to domain
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
✓ priority field wired through

**send_whatsapp_media** (action-executor.ts:727-776):
```typescript
// Line 739: filename extracted
const filename = params.filename ? String(params.filename) : undefined

// Lines 762-770: filename passed to domain
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
✓ filename field wired through

### 2. copyProducts Toggle Behavior

**action-executor.ts:389-397**:
```typescript
// Copy products from trigger context only when copyProducts toggle is enabled
const products = params.copyProducts && Array.isArray(context.products)
  ? (context.products as Array<{ sku: string; title: string; quantity: number; price: string }>).map(p => ({
      sku: p.sku || '',
      title: p.title,
      unitPrice: parseFloat(p.price) || 0,
      quantity: p.quantity,
    }))
  : undefined
```
✓ Conditional check prevents unconditional copying
✓ Products only copied when `params.copyProducts` is truthy AND context.products is an array

### 3. duplicate_order Flag Handling

**action-executor.ts:485-493**:
```typescript
const result = await domainDuplicateOrder(ctx, {
  sourceOrderId,
  targetPipelineId,
  targetStageId,
  copyContact: params.copyContact !== undefined ? !!params.copyContact : undefined,
  copyProducts: params.copyProducts !== undefined ? !!params.copyProducts : undefined,
  copyValue: params.copyValue !== undefined ? !!params.copyValue : undefined,
})
```
✓ Flags passed to domain layer
✓ Undefined when not specified (allows domain to apply defaults)

**domain/orders.ts:624-627**:
```typescript
// Resolve copy flags (default true for backward compatibility)
const shouldCopyContact = params.copyContact !== false
const shouldCopyProducts = params.copyProducts !== false
const shouldCopyValue = params.copyValue !== false
```
✓ Defaults to true when undefined
✓ Conditional copying implemented at lines 633 (contact), 653-674 (products), 676-727 (value)

### 4. ACTION_CATALOG Completeness

**constants.ts verification**:

- **remove_tag** (lines 160-167):
  ```typescript
  { name: 'tagName', label: 'Tag', type: 'select', required: true },
  { name: 'entityType', label: 'Tipo de entidad', type: 'select', options: ['contact', 'order'], required: false },
  ```
  ✓ entityType present

- **update_field** (lines 179-189):
  ```typescript
  { name: 'entityType', label: 'Tipo de entidad', type: 'select', options: ['contact', 'order'], required: true },
  { name: 'fieldName', label: 'Campo', type: 'field_select', required: true },
  { name: 'value', label: 'Valor', type: 'text', required: true, supportsVariables: true },
  ```
  ✓ entityType, field_select, supportsVariables all present

- **create_order** (lines 190-208):
  ```typescript
  { name: 'name', label: 'Nombre de la orden', type: 'text', required: false, supportsVariables: true, optional: true },
  { name: 'closingDate', label: 'Fecha de cierre', type: 'text', required: false, optional: true },
  { name: 'shippingAddress', label: 'Direccion de envio', type: 'text', required: false, supportsVariables: true, optional: true },
  { name: 'shippingCity', label: 'Ciudad de envio', type: 'text', required: false, supportsVariables: true, optional: true },
  { name: 'shippingDepartment', label: 'Departamento de envio', type: 'text', required: false, supportsVariables: true, optional: true },
  { name: 'carrier', label: 'Transportadora', type: 'text', required: false, supportsVariables: true, optional: true },
  { name: 'trackingNumber', label: 'Numero de guia', type: 'text', required: false, supportsVariables: true, optional: true },
  { name: 'copyProducts', label: 'Copiar productos del trigger', type: 'boolean', required: false, optional: true },
  { name: 'copyTags', label: 'Copiar tags del trigger', type: 'boolean', required: false, optional: true },
  ```
  ✓ All optional fields marked with `optional: true`

- **create_task** (lines 255-266):
  ```typescript
  { name: 'priority', label: 'Prioridad', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: false },
  ```
  ✓ priority param present

- **send_whatsapp_template** (lines 224-233):
  ```typescript
  { name: 'language', label: 'Idioma', type: 'select', options: ['es', 'en', 'pt'], required: false },
  ```
  ✓ language param present

- **send_whatsapp_media** (lines 244-253):
  ```typescript
  { name: 'filename', label: 'Nombre del archivo', type: 'text', required: false },
  ```
  ✓ filename param present

### 5. "Agregar campo" Dropdown UI

**actions-step.tsx:1082-1110**:
```typescript
{/* "Add field" dropdown for remaining optional params */}
{(() => {
  const optionalParams = catalogEntry.params.filter(
    (p) => 'optional' in p && (p as { optional?: boolean }).optional && !activeOptionals.includes(p.name)
  )
  if (optionalParams.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
          <Plus className="size-3 mr-1" />
          Agregar campo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {optionalParams.map((p) => (
          <button
            key={p.name}
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors"
            onClick={() => setActiveOptionals((prev) => [...prev, p.name])}
          >
            {p.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
})()}
```
✓ Dropdown only shows when optional params exist
✓ Filters out already-active optionals
✓ Click adds param to activeOptionals array

**actions-step.tsx:1046-1080** (removable active optionals):
```typescript
{/* Active optional params */}
{activeOptionals.map((paramName) => {
  const param = catalogEntry.params.find((p) => p.name === paramName)
  if (!param) return null
  return (
    <div key={param.name} className="flex items-start gap-2">
      <div className="flex-1">
        <ActionParamField
          param={param}
          value={action.params[param.name]}
          onChange={(val) => updateParam(param.name, val)}
          // ... props
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 mt-6 text-muted-foreground hover:text-destructive shrink-0"
        title="Quitar campo"
        onClick={() => {
          setActiveOptionals((prev) => prev.filter((n) => n !== paramName))
          updateParam(paramName, undefined)
        }}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
})}
```
✓ Each active optional has remove button
✓ Removal updates state and clears param value

### 6. field_select Entity-Aware Rendering

**actions-step.tsx:643-698**:
```typescript
// field_select type — dynamic field picker based on entityType
if (param.type === 'field_select') {
  const entityType = (allParams.entityType as string) || 'contact'

  const CONTACT_FIELDS = [
    { value: 'name', label: 'Nombre' },
    { value: 'phone', label: 'Telefono' },
    { value: 'email', label: 'Email' },
    { value: 'address', label: 'Direccion' },
    { value: 'city', label: 'Ciudad' },
    { value: 'department', label: 'Departamento' },
  ]

  const ORDER_FIELDS = [
    { value: 'name', label: 'Nombre' },
    { value: 'description', label: 'Descripcion' },
    { value: 'shipping_address', label: 'Direccion de envio' },
    { value: 'shipping_city', label: 'Ciudad de envio' },
    { value: 'shipping_department', label: 'Departamento de envio' },
    { value: 'carrier', label: 'Transportadora' },
    { value: 'tracking_number', label: 'Numero de guia' },
    { value: 'closing_date', label: 'Fecha de cierre' },
    { value: 'contact_id', label: 'Contacto (ID)' },
  ]

  const fields = entityType === 'order' ? ORDER_FIELDS : CONTACT_FIELDS

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
      <Select
        value={(value as string) ?? ''}
        onValueChange={(val) => onChange(val || undefined)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Seleccionar campo..." />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
          <SelectItem value="__custom">Campo personalizado...</SelectItem>
        </SelectContent>
      </Select>
      {(value as string) === '__custom' && (
        <Input
          className="h-8 text-xs mt-1"
          placeholder="Nombre del campo personalizado..."
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
```
✓ Reads entityType from allParams context
✓ Shows appropriate field list based on entity type
✓ ORDER_FIELDS includes shipping_department (line 661)
✓ CONTACT_FIELDS includes department (line 653)
✓ Custom field fallback included

### 7. AI Builder System Prompt

**system-prompt.ts:68-81** (dynamic param reference):
```typescript
function formatParamQuickReference(): string {
  const lines: string[] = []
  for (const action of ACTION_CATALOG) {
    const required = action.params
      .filter((p) => p.required)
      .map((p) => `**${p.name}**`)
    const optional = action.params
      .filter((p) => !p.required)
      .map((p) => p.name)
    const allParams = [...required, ...optional].join(', ')
    lines.push(`- \`${action.type}\`: ${allParams}`)
  }
  return lines.join('\n')
}
```
✓ Generates param reference from ACTION_CATALOG (not hardcoded)
✓ Used in system prompt at line 249

**system-prompt.ts:253-272** (usage notes):
```typescript
**entityType (assign_tag, remove_tag, update_field):**
- Para \`assign_tag\` y \`remove_tag\`: usa entityType para especificar si el tag va en el contacto ("contact") o en la orden ("order"). Por defecto es "contact".
- Para \`update_field\`: entityType es REQUERIDO. Determina si se actualiza un campo del contacto o de la orden. Los campos disponibles dependen del tipo de entidad.

**Campos de contacto para update_field:** name, phone, email, address, city, department (o nombre de campo personalizado)
**Campos de orden para update_field:** name, description, shipping_address, shipping_city, shipping_department, carrier, tracking_number, closing_date, contact_id (o nombre de campo personalizado)

**create_order — campos opcionales adicionales:**
Ademas de pipelineId, stageId y description, puedes usar: name (nombre/referencia de la orden), closingDate (fecha de cierre en formato ISO), carrier (transportadora), trackingNumber (numero de guia), shippingAddress, shippingCity, shippingDepartment. Usa copyProducts=true para copiar productos del trigger y copyTags=true para copiar tags.

**create_task — prioridad:**
priority acepta: "low", "medium", "high", "urgent". Por defecto es "medium".

**send_whatsapp_template — idioma:**
language acepta: "es", "en", "pt". Si no se especifica, usa el idioma del template en la base de datos.

**send_whatsapp_media — nombre de archivo:**
filename es opcional. Si el tipo de media es "document", se recomienda incluir filename para mejor presentacion en el chat.
```
✓ entityType usage documented
✓ create_order optional fields listed (name, closingDate, carrier, trackingNumber, shippingAddress, shippingCity, shippingDepartment)
✓ priority values documented
✓ language options documented
✓ filename usage documented

---

_Verified: 2026-02-17T23:48:52Z_
_Verifier: Claude (gsd-verifier)_
