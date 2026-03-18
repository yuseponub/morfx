---
phase: agent-godentist
plan: 05
type: execute
wave: 2
depends_on: ["agent-godentist-01"]
files_modified:
  - src/lib/agents/godentist/response-track.ts
autonomous: true

must_haves:
  truths:
    - "Response track combines sales action templates with informational intent templates"
    - "Sales actions map to correct template intents via ACTION_TEMPLATE_MAP"
    - "Informational intents (precio_servicio) map to service-specific template (e.g., precio_corona)"
    - "Dynamic actions (pedir_datos_parcial, confirmar_cita) inject extraContext with campos_faltantes or datos"
    - "English detection sends english_response template"
    - "Multiple price questions in one message send multiple service templates"
  artifacts:
    - path: "src/lib/agents/godentist/response-track.ts"
      provides: "resolveResponseTrack function for template selection and composition"
      min_lines: 100
  key_links:
    - from: "src/lib/agents/godentist/response-track.ts"
      to: "src/lib/agents/somnio/template-manager.ts"
      via: "TemplateManager for loading templates from DB"
      pattern: "TemplateManager"
    - from: "src/lib/agents/godentist/response-track.ts"
      to: "src/lib/agents/godentist/config.ts"
      via: "GODENTIST_AGENT_ID for template loading"
      pattern: "GODENTIST_AGENT_ID"
---

<objective>
Create the response track for GoDentist — the template engine that decides WHAT TO SAY.

Purpose: The response track combines templates from two independent sources: sales actions (from the sales track) and informational intents (price questions, location info, etc.). It produces the actual messages to send to the customer using templates stored in the database.

Output: Single file implementing the complete template resolution logic for dental appointment responses.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@.planning/standalone/agent-godentist/PLANTILLAS.md
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio/template-manager.ts
@src/lib/agents/somnio/block-composer.ts
@src/lib/agents/godentist/types.ts
@src/lib/agents/godentist/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create response-track.ts</name>
  <files>src/lib/agents/godentist/response-track.ts</files>
  <action>
Create response track following somnio-v3/response-track.ts pattern but adapted for dental appointment flow.

**resolveResponseTrack(input):**

Input:
```typescript
{
  salesAction?: TipoAccion
  intent?: string
  secondaryIntent?: string
  state: AgentState
  workspaceId: string
  idioma?: string  // from comprehension classification
  servicioDetectado?: string  // from comprehension extracted_fields
}
```

Output: `ResponseTrackOutput { messages, templateIdsSent, salesTemplateIntents, infoTemplateIntents }`

**Flow:**

1. **English detection:** If `idioma === 'en'`, return english_response template immediately. Load via TemplateManager.

2. **Sales action templates:**
   Call `resolveSalesActionTemplates(salesAction, state)` which returns `{ intents, extraContext }`.

   Dynamic action resolution:
   - `pedir_datos` -> intents: `['pedir_datos']`
   - `pedir_datos_parcial` -> intents: `['pedir_datos_parcial']`, extraContext: `{ campos_faltantes: camposFaltantes(state).join(', ') }`
   - `pedir_fecha` -> intents: `['pedir_fecha']`, extraContext: `{ nombre: state.datos.nombre }`
   - `mostrar_disponibilidad` -> intents: `['mostrar_disponibilidad']`, extraContext: `{ fecha, sede_preferida, slots_manana, slots_tarde }` — NOTE: slots are placeholders for now (Dentos API integration is a future phase). Use `extraContext.slots_manana = '(Disponibilidad pendiente)'` and same for tarde.
   - `mostrar_confirmacion` -> intents: `['confirmar_cita']`, extraContext: buildResumenContext(state)
   - `agendar_cita` -> intents: `['cita_agendada']`, extraContext: buildResumenContext(state)
   - `invitar_agendar` -> intents: `['invitar_agendar']`
   - `retoma_datos` -> intents: `['retoma_datos']`, extraContext: `{ campos_faltantes: camposFaltantes(state).join(', ') }`
   - `retoma_fecha` -> intents: `['retoma_fecha']`
   - `retoma_horario` -> intents: `['retoma_horario']`
   - `retoma_confirmacion` -> intents: `['retoma_confirmacion']`
   - Others: use ACTION_TEMPLATE_MAP fallback

3. **Informational intent templates:**
   If intent is in INFORMATIONAL_INTENTS:
   - For `precio_servicio`: Map to service-specific template intent. If `servicioDetectado` is provided:
     - Map service enum to template intent: `corona -> precio_corona`, `protesis -> precio_protesis`, etc.
     - Pattern: `precio_${servicioDetectado}` (the template ID in DB matches this pattern)
     - If `servicioDetectado === 'ortodoncia_general'` -> use `precio_ortodoncia_general`
     - If `servicioDetectado === 'otro_servicio'` or null -> use generic `invitar_agendar` (can't determine price)
   - For other info intents: use intent name directly as template intent (e.g., `valoracion_costo`, `financiacion`, `ubicacion`, etc.)
   - Handle secondary intent similarly if it's informational

4. **Combine both sources:** Same pattern as somnio-v3
   - Merge salesTemplateIntents + infoTemplateIntents
   - Load via TemplateManager with GODENTIST_AGENT_ID
   - Process with variable substitution
   - Compose block using composeBlock from somnio/block-composer

5. **Variable context:** Build from state.datos + extraContext. Map sede_preferida to display name.

**SEDE_DISPLAY_NAMES map:**
```typescript
const SEDE_DISPLAY_NAMES: Record<string, string> = {
  cabecera: 'Cabecera',
  mejoras_publicas: 'Mejoras Publicas',
  floridablanca: 'Floridablanca',
  canaveral: 'Canaveral (CC Jumbo El Bosque)',
}
```

**FIELD_LABELS map (for campos_faltantes):**
```typescript
const FIELD_LABELS: Record<string, string> = {
  nombre: 'tu nombre completo',
  telefono: 'tu numero de celular',
  sede_preferida: 'la sede de tu preferencia (Cabecera, Mejoras Publicas, Floridablanca o Canaveral)',
}
```

Import TemplateManager from `@/lib/agents/somnio/template-manager`.
Import composeBlock from `@/lib/agents/somnio/block-composer`.
Import GODENTIST_AGENT_ID from `./config`.
Import buildResumenContext, camposFaltantes from `./state`.
Import INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP from `./constants`.
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "response-track" | head -5` — zero errors.</verify>
  <done>
response-track.ts resolves templates from both sales actions and informational intents.
precio_servicio maps to service-specific template via servicioDetectado.
Dynamic actions inject extraContext for variable substitution.
English messages get english_response template.
Uses TemplateManager and composeBlock from somnio shared code.
  </done>
</task>

</tasks>

<verification>
- File compiles without errors
- All 14 TipoAccion values have template resolution
- precio_servicio maps to all 23 service-specific templates
- Dynamic actions inject correct extraContext
- English detection returns immediately
</verification>

<success_criteria>
- resolveResponseTrack produces correct templates for all sales actions
- precio_servicio + servicioDetectado resolves to service-specific price template
- Variable substitution fills {{nombre}}, {{telefono}}, {{sede_preferida}}, {{campos_faltantes}}
- Block composition limits output to max 3 messages per turn
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/05-SUMMARY.md`
</output>
