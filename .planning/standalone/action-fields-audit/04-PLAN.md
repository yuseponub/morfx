---
phase: standalone/action-fields-audit
plan: 04
type: execute
wave: 3
depends_on: ["03"]
files_modified:
  - src/lib/builder/system-prompt.ts
autonomous: true

must_haves:
  truths:
    - "AI builder knows about entityType for remove_tag"
    - "AI builder knows about entityType + field_select for update_field"
    - "AI builder knows about all create_order optional fields (name, closingDate, carrier, trackingNumber)"
    - "AI builder knows about priority for create_task"
    - "AI builder knows about language for send_whatsapp_template"
    - "AI builder knows about filename for send_whatsapp_media"
  artifacts:
    - path: "src/lib/builder/system-prompt.ts"
      provides: "Complete param reference in system prompt"
      contains: "carrier"
  key_links:
    - from: "system-prompt.ts param reference"
      to: "constants.ts ACTION_CATALOG"
      via: "dynamic catalog formatting"
      pattern: "formatActionCatalog"
---

<objective>
Update the AI builder system prompt to reflect ALL available fields for every action type. The prompt's hardcoded "quick reference" section is out of sync with the actual ACTION_CATALOG.

Purpose: The AI builder uses this prompt to know what params to set when creating automations. Missing params = the builder can never suggest those fields.
Output: Updated system-prompt.ts with complete param reference matching the updated ACTION_CATALOG.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/action-fields-audit/PHASE.md
@.planning/standalone/action-fields-audit/RESEARCH.md
@.planning/standalone/action-fields-audit/03-SUMMARY.md
@src/lib/builder/system-prompt.ts
@src/lib/automations/constants.ts (updated ACTION_CATALOG)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update hardcoded param reference in system prompt</name>
  <files>src/lib/builder/system-prompt.ts</files>
  <action>
The system prompt has a hardcoded "Referencia rapida de params por accion" section (lines ~233-246) that lists params per action. This section is OUT OF SYNC with the actual ACTION_CATALOG. Since the dynamic `formatActionCatalog()` function already renders the full catalog, the hardcoded reference is a redundant source of truth that drifts.

**Option A (preferred): Replace the hardcoded reference with a dynamically generated one.**

Add a new function `formatParamQuickReference()` that generates the quick reference from ACTION_CATALOG:

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

Then replace the hardcoded block (lines 233-246) with:
```typescript
${formatParamQuickReference()}
```

This ensures the system prompt ALWAYS matches the ACTION_CATALOG. No more drift.

**Additionally**, update the text around the quick reference to note the new fields, especially:

1. After the quick reference, add a section about `entityType`:
```
**Nota sobre entityType:**
- Para \`assign_tag\` y \`remove_tag\`: usa entityType para especificar si el tag va en el contacto ("contact") o en la orden ("order"). Por defecto es "contact".
- Para \`update_field\`: entityType es REQUERIDO. Determina si se actualiza un campo del contacto o de la orden. Los campos disponibles dependen del tipo de entidad.

**Campos de contacto para update_field:** name, phone, email, address, city, department (o nombre de campo personalizado)
**Campos de orden para update_field:** name, description, shipping_address, shipping_city, shipping_department, carrier, tracking_number, closing_date, contact_id (o nombre de campo personalizado)

**Nota sobre create_order:**
Campos opcionales adicionales: name (nombre de la orden), closingDate (fecha de cierre ISO), carrier (transportadora), trackingNumber (numero de guia). Usa copyProducts=true para copiar productos del trigger y copyTags=true para copiar tags.

**Nota sobre create_task:**
priority acepta: "low", "medium", "high", "urgent". Por defecto es "medium".

**Nota sobre send_whatsapp_template:**
language acepta: "es", "en", "pt". Si no se especifica, usa el idioma del template en la base de datos.

**Nota sobre send_whatsapp_media:**
filename es opcional. Si el tipo de media es "document", se recomienda incluir filename para mejor presentacion en el chat.
```
  </action>
  <verify>Run `npx tsc --noEmit`. Run a quick test: import buildSystemPrompt, call it with a dummy workspaceId, verify the output contains 'carrier', 'trackingNumber', 'priority', 'language', 'filename', 'entityType' for the relevant actions.</verify>
  <done>AI builder system prompt dynamically generates param reference from ACTION_CATALOG. All new fields (entityType for remove_tag/update_field, name/closingDate/carrier/trackingNumber for create_order, priority for create_task, language for template, filename for media) are documented with usage notes.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. System prompt contains dynamic param reference (no hardcoded list)
3. Output includes all new fields with proper documentation
4. Builder would know about entityType, field selection, and all optional create_order fields
</verification>

<success_criteria>
AI builder system prompt is in perfect sync with ACTION_CATALOG. Every field the system accepts is documented with usage notes so the builder can suggest them to users.
</success_criteria>

<output>
After completion, create `.planning/standalone/action-fields-audit/04-SUMMARY.md`
</output>
