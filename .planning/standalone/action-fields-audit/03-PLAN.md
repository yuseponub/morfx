---
phase: standalone/action-fields-audit
plan: 03
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - src/lib/automations/constants.ts
  - src/app/(dashboard)/automatizaciones/components/actions-step.tsx
autonomous: true

must_haves:
  truths:
    - "remove_tag has entityType selector (contact/order) in UI"
    - "update_field has entityType selector, dynamic field dropdown by entity type, and variable support on value"
    - "create_order shows required fields always, optional fields behind 'Agregar campo' dropdown"
    - "create_task has priority dropdown in UI"
    - "send_whatsapp_template has language field in UI"
    - "send_whatsapp_media has filename field in UI"
  artifacts:
    - path: "src/lib/automations/constants.ts"
      provides: "Complete ACTION_CATALOG with all missing params"
      contains: "entityType"
    - path: "src/app/(dashboard)/automatizaciones/components/actions-step.tsx"
      provides: "Add field UX pattern + entityType-aware field dropdown for update_field"
      contains: "Agregar campo"
  key_links:
    - from: "constants.ts ACTION_CATALOG remove_tag"
      to: "actions-step.tsx entityType renderer"
      via: "param type=select with options"
      pattern: "entityType.*contact.*order"
    - from: "constants.ts ACTION_CATALOG update_field"
      to: "actions-step.tsx field dropdown"
      via: "dynamic field list based on entityType"
      pattern: "entityType"
    - from: "constants.ts ACTION_CATALOG create_order"
      to: "actions-step.tsx optional field picker"
      via: "optionalGroup in params"
      pattern: "Agregar campo"
---

<objective>
Add all missing fields to ACTION_CATALOG and implement the "Add field" dropdown UX pattern in the wizard UI so users can discover and map optional fields.

Purpose: Users need to see and configure ALL fields the executor/domain support. The current UI hides many optional fields. The "Add field" pattern keeps the UI clean while making everything accessible.
Output: Updated constants.ts with complete catalogs + updated actions-step.tsx with "Add field" dropdown for actions with many optional fields + entityType-aware field dropdown for update_field.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/action-fields-audit/PHASE.md
@.planning/standalone/action-fields-audit/RESEARCH.md
@.planning/standalone/action-fields-audit/01-SUMMARY.md
@.planning/standalone/action-fields-audit/02-SUMMARY.md
@src/lib/automations/constants.ts
@src/app/(dashboard)/automatizaciones/components/actions-step.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update ACTION_CATALOG with all missing params</name>
  <files>src/lib/automations/constants.ts</files>
  <action>
Update ACTION_CATALOG entries to include ALL fields the executor/domain can handle. Add a new `optional` boolean property to param definitions to distinguish required-always-visible from optional-behind-dropdown fields. Also add an `optionalGroup` label for grouping optional fields.

**Changes to make:**

1. **remove_tag** — Add entityType param (like assign_tag already has):
```typescript
{
  type: 'remove_tag',
  label: 'Remover tag',
  category: 'CRM',
  description: 'Remueve un tag de un contacto u orden',
  params: [
    { name: 'tagName', label: 'Tag', type: 'select', required: true },
    { name: 'entityType', label: 'Tipo de entidad', type: 'select', options: ['contact', 'order'], required: false },
  ],
},
```

2. **update_field** — Add entityType and change fieldName to dynamic select:
```typescript
{
  type: 'update_field',
  label: 'Actualizar campo',
  category: 'CRM',
  description: 'Actualiza el valor de un campo de contacto u orden',
  params: [
    { name: 'entityType', label: 'Tipo de entidad', type: 'select', options: ['contact', 'order'], required: true },
    { name: 'fieldName', label: 'Campo', type: 'field_select', required: true },
    { name: 'value', label: 'Valor', type: 'text', required: true, supportsVariables: true },
  ],
},
```
Note: Changed fieldName from `type: 'text'` to `type: 'field_select'` (new type) and made entityType required. Added `supportsVariables: true` to value.

3. **create_order** — Add all 5 missing fields as optional params:
```typescript
{
  type: 'create_order',
  label: 'Crear orden',
  category: 'Ordenes',
  description: 'Crea una nueva orden en un pipeline especifico',
  params: [
    { name: 'pipelineId', label: 'Pipeline', type: 'select', required: true },
    { name: 'stageId', label: 'Etapa', type: 'select', required: false },
    { name: 'description', label: 'Descripcion', type: 'text', required: false, supportsVariables: true },
    { name: 'name', label: 'Nombre de la orden', type: 'text', required: false, supportsVariables: true, optional: true },
    { name: 'closingDate', label: 'Fecha de cierre', type: 'text', required: false, optional: true },
    { name: 'shippingAddress', label: 'Direccion de envio', type: 'text', required: false, supportsVariables: true, optional: true },
    { name: 'shippingCity', label: 'Ciudad de envio', type: 'text', required: false, supportsVariables: true, optional: true },
    { name: 'shippingDepartment', label: 'Departamento de envio', type: 'text', required: false, supportsVariables: true, optional: true },
    { name: 'carrier', label: 'Transportadora', type: 'text', required: false, supportsVariables: true, optional: true },
    { name: 'trackingNumber', label: 'Numero de guia', type: 'text', required: false, supportsVariables: true, optional: true },
    { name: 'copyProducts', label: 'Copiar productos del trigger', type: 'boolean', required: false, optional: true },
    { name: 'copyTags', label: 'Copiar tags del trigger', type: 'boolean', required: false, optional: true },
  ],
},
```

4. **create_task** — Add priority:
```typescript
{
  type: 'create_task',
  label: 'Crear tarea',
  category: 'Tareas',
  description: 'Crea una nueva tarea vinculada al contacto u orden del trigger',
  params: [
    { name: 'title', label: 'Titulo', type: 'text', required: true, supportsVariables: true },
    { name: 'description', label: 'Descripcion', type: 'textarea', required: false, supportsVariables: true },
    { name: 'priority', label: 'Prioridad', type: 'select', options: ['low', 'medium', 'high', 'urgent'], required: false },
    { name: 'dueDateRelative', label: 'Fecha limite (relativa)', type: 'delay', required: false },
    { name: 'assignToUserId', label: 'Asignar a', type: 'select', required: false },
  ],
},
```

5. **send_whatsapp_template** — Add language:
```typescript
{
  type: 'send_whatsapp_template',
  label: 'Enviar template WhatsApp',
  category: 'WhatsApp',
  description: 'Envia un template de WhatsApp aprobado al contacto',
  params: [
    { name: 'templateName', label: 'Template', type: 'select', required: true },
    { name: 'language', label: 'Idioma', type: 'select', options: ['es', 'en', 'pt'], required: false },
    { name: 'variables', label: 'Variables', type: 'key_value', required: false },
  ],
},
```

6. **send_whatsapp_media** — Add filename:
```typescript
{
  type: 'send_whatsapp_media',
  label: 'Enviar media WhatsApp',
  category: 'WhatsApp',
  description: 'Envia una imagen o archivo por WhatsApp',
  params: [
    { name: 'mediaUrl', label: 'URL del archivo', type: 'text', required: true },
    { name: 'caption', label: 'Texto', type: 'text', required: false, supportsVariables: true },
    { name: 'filename', label: 'Nombre del archivo', type: 'text', required: false },
  ],
},
```

IMPORTANT: The `as const` assertion at the end of ACTION_CATALOG stays. The new `optional` and `field_select` properties will need the type to accommodate them. Since this is `as const`, they'll be inferred as literal types.
  </action>
  <verify>Run `npx tsc --noEmit`. Verify that ACTION_CATALOG has the new params by grepping for 'entityType' in remove_tag entry, 'field_select' type, 'priority' in create_task, 'language' in send_whatsapp_template, 'filename' in send_whatsapp_media, and 'optional: true' in create_order.</verify>
  <done>ACTION_CATALOG is complete: every field the executor handles has a corresponding catalog entry. New field types (field_select) and optional grouping are defined.</done>
</task>

<task type="auto">
  <name>Task 2: Implement "Add field" dropdown + field_select type in actions-step.tsx</name>
  <files>src/app/(dashboard)/automatizaciones/components/actions-step.tsx</files>
  <action>
Three changes needed in the UI component:

**A) Add "Agregar campo" dropdown for optional fields.**

In the `ActionCard` component, change how params are rendered. Currently all params are rendered unconditionally (line ~950). Split params into two groups:
- **Always visible:** params where `optional` is NOT true (or `required` is true)
- **Optional (hidden by default):** params where `optional` is explicitly true

Track which optional params are "active" in the ActionCard state. Use a local state:
```typescript
// Inside ActionCard component
const [activeOptionals, setActiveOptionals] = useState<string[]>(() => {
  // Initialize with optional params that already have values
  return catalogEntry.params
    .filter((p) => 'optional' in p && p.optional && action.params[p.name] !== undefined && action.params[p.name] !== null && action.params[p.name] !== '')
    .map((p) => p.name)
})
```

Replace the params rendering section with:
```tsx
{/* Required / always-visible params */}
<div className="space-y-3 border-t pt-3">
  {catalogEntry.params
    .filter((p) => !('optional' in p && p.optional))
    .map((param) => (
      <ActionParamField
        key={param.name}
        param={param}
        value={action.params[param.name]}
        onChange={(val) => updateParam(param.name, val)}
        pipelines={pipelines}
        tags={tags}
        templates={templates}
        triggerType={triggerType}
        allParams={action.params}
        helpText={actionHelpTexts[param.name]}
      />
    ))}

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
            pipelines={pipelines}
            tags={tags}
            templates={templates}
            triggerType={triggerType}
            allParams={action.params}
            helpText={actionHelpTexts[param.name]}
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

  {/* "Add field" dropdown for remaining optional params */}
  {(() => {
    const optionalParams = catalogEntry.params.filter(
      (p) => 'optional' in p && p.optional && !activeOptionals.includes(p.name)
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
</div>
```

**B) Add `field_select` type handler in ActionParamField.**

This is the dynamic field dropdown for update_field that shows different fields depending on the selected entityType.

Add a new handler block in `ActionParamField` BEFORE the generic text handler (before line ~630). Place it after the select type block:

```tsx
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

**C) Add priority select rendering.**

The existing `entityType` select handler (line ~528) checks for `param.name === 'entityType' && 'options' in param`. This same handler should also work for `priority` since both are generic select-with-options. But the labels need to be humanized. Update the generic options select to handle priority labels:

In the entityType select handler, generalize the label rendering to also handle priority options:
```tsx
const OPTION_LABELS: Record<string, string> = {
  'contact': 'Contacto',
  'order': 'Orden',
  'low': 'Baja',
  'medium': 'Media',
  'high': 'Alta',
  'urgent': 'Urgente',
  'es': 'Espanol',
  'en': 'Ingles',
  'pt': 'Portugues',
}
```

Place this constant near the top of the file (with the other constants, around line ~77). Then change the `entityType` select handler to be a GENERIC options handler that works for any param with `options`:

Change the condition from `param.name === 'entityType' && 'options' in param` to just `'options' in param` (but keep it within the `param.type === 'select'` block, and place it AFTER the specific name-based handlers like pipelineId, stageId, tagName, templateName).

Update the option label rendering to use:
```tsx
{OPTION_LABELS[opt] || opt}
```
instead of:
```tsx
{opt === 'contact' ? 'Contacto' : opt === 'order' ? 'Orden' : opt}
```

This handles entityType, priority, and language all with one handler.
  </action>
  <verify>
1. Run `npx tsc --noEmit` to confirm no type errors
2. Run the dev server and navigate to /automatizaciones — add a create_order action and verify that pipelineId/stageId/description show by default, with an "Agregar campo" button for the rest
3. Add an update_field action and verify entityType dropdown appears, selecting "order" shows order-specific fields
4. Add a remove_tag action and verify entityType dropdown appears
5. Add a create_task action and verify priority dropdown shows
  </verify>
  <done>UI shows "Agregar campo" dropdown for optional params. update_field has entityType selector + dynamic field dropdown. remove_tag has entityType selector. create_task has priority. send_whatsapp_template has language. send_whatsapp_media has filename.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. ACTION_CATALOG has all previously missing params
3. UI renders "Agregar campo" for create_order optional fields
4. update_field shows entity-type-aware field dropdown
5. remove_tag shows entityType selector
6. All new fields render correctly in the wizard
</verification>

<success_criteria>
Every field the domain/executor accepts is reachable from the automation wizard UI. Optional fields are behind a clean "Agregar campo" dropdown. update_field has proper entityType-aware field selection with variable support on value.
</success_criteria>

<output>
After completion, create `.planning/standalone/action-fields-audit/03-SUMMARY.md`
</output>
