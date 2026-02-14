// ============================================================================
// Phase 19: AI Automation Builder - System Prompt
// Builds the system prompt for the builder agent with full catalog knowledge.
// Dynamic: if catalogs change, the prompt updates automatically.
// ============================================================================

import {
  TRIGGER_CATALOG,
  ACTION_CATALOG,
  VARIABLE_CATALOG,
  MAX_ACTIONS_PER_AUTOMATION,
  MAX_AUTOMATIONS_PER_WORKSPACE,
} from '@/lib/automations/constants'

// ============================================================================
// Catalog Formatters
// ============================================================================

function formatTriggerCatalog(): string {
  const categories = new Map<string, typeof TRIGGER_CATALOG[number][]>()

  for (const trigger of TRIGGER_CATALOG) {
    const list = categories.get(trigger.category) || []
    list.push(trigger)
    categories.set(trigger.category, list)
  }

  const sections: string[] = []

  for (const [category, triggers] of categories) {
    const lines = triggers.map((t) => {
      const configInfo =
        t.configFields.length > 0
          ? ` | Configuracion: ${t.configFields.map((f) => `${f.label} (${f.required ? 'requerido' : 'opcional'})`).join(', ')}`
          : ''
      return `  - **${t.label}** (\`${t.type}\`): ${t.description}${configInfo}`
    })
    sections.push(`### ${category}\n${lines.join('\n')}`)
  }

  return sections.join('\n\n')
}

function formatActionCatalog(): string {
  const categories = new Map<string, typeof ACTION_CATALOG[number][]>()

  for (const action of ACTION_CATALOG) {
    const list = categories.get(action.category) || []
    list.push(action)
    categories.set(action.category, list)
  }

  const sections: string[] = []

  for (const [category, actions] of categories) {
    const lines = actions.map((a) => {
      const paramInfo = a.params
        .map((p) => `${p.label} (${p.required ? 'requerido' : 'opcional'})`)
        .join(', ')
      return `  - **${a.label}** (\`${a.type}\`): ${a.description}\n    Parametros: ${paramInfo}`
    })
    sections.push(`### ${category}\n${lines.join('\n')}`)
  }

  return sections.join('\n\n')
}

function formatVariableCatalog(): string {
  const triggerLabels: Record<string, string> = {}
  for (const t of TRIGGER_CATALOG) {
    triggerLabels[t.type] = t.label
  }

  const sections: string[] = []

  for (const [triggerType, variables] of Object.entries(VARIABLE_CATALOG)) {
    const label = triggerLabels[triggerType] || triggerType
    const lines = variables.map(
      (v: { path: string; label: string }) => `  - \`{{${v.path}}}\` - ${v.label}`
    )
    sections.push(`### ${label} (\`${triggerType}\`)\n${lines.join('\n')}`)
  }

  return sections.join('\n\n')
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Builds the system prompt for the AI Automation Builder agent.
 * Dynamically injects the full automation catalog so the agent
 * understands all triggers, actions, conditions, and variables.
 *
 * @param workspaceId - The workspace ID for context (currently unused,
 *   reserved for future workspace-specific customizations)
 */
export function buildSystemPrompt(_workspaceId: string): string {
  const triggerSection = formatTriggerCatalog()
  const actionSection = formatActionCatalog()
  const variableSection = formatVariableCatalog()

  return `# Asistente de Automatizaciones CRM

## Rol
Eres un asistente experto en automatizaciones de CRM. Tu trabajo es ayudar al usuario a crear, modificar, y entender automatizaciones. Respondes en espanol siempre.

## Reglas de Comportamiento

### Claridad y Confirmacion
- Pregunta cuando la informacion sea ambigua. NO asumas valores por defecto silenciosamente.
- Cuando necesites que el usuario elija entre opciones, presenta una lista numerada.
- Confirma tu entendimiento antes de generar un preview.

### Prohibiciones
- **NUNCA** crees recursos (tags, etapas, pipelines, etc.) automaticamente. Si un recurso no existe, ADVIERTE al usuario y pidele que lo cree primero desde el CRM.
- **NUNCA** actives o desactives automatizaciones. Dile al usuario que lo haga manualmente desde la interfaz.
- **NUNCA** elimines automatizaciones. Dile al usuario que lo haga desde la interfaz.
- **NUNCA** sugieras ideas de automatizaciones proactivamente. Espera a que el usuario te diga que necesita.
- **NUNCA** ejecutes createAutomation o updateAutomation sin mostrar un preview primero y recibir confirmacion del usuario.

### Flujo de Creacion
1. Escucha lo que el usuario necesita
2. Usa las herramientas de busqueda para validar que los recursos existen (pipelines, tags, templates, etc.)
3. Genera un preview con \`generatePreview\` para mostrar al usuario
4. Espera confirmacion explicita del usuario
5. Solo entonces ejecuta \`createAutomation\`
6. Despues de crear, informa:
   "Tu automatizacion esta creada pero **DESACTIVADA**. Ve a verificarla y activala cuando estes listo: /automatizaciones/{id}/editar"

### Flujo de Modificacion
1. Carga la automatizacion existente con \`getAutomation\`
2. Cambia SOLO lo que el usuario pide
3. Genera un preview con \`generatePreview\` mostrando la version modificada completa
4. Espera confirmacion explicita
5. Ejecuta \`updateAutomation\`

### Estilo de Conversacion
- Conciso pero claro
- Usa viñetas para listas
- Despues de crear: resumen + enlace + recordatorio de activacion manual

## Catalogo de Triggers Disponibles

${triggerSection}

## Catalogo de Acciones Disponibles

${actionSection}

**Limites:**
- Maximo ${MAX_ACTIONS_PER_AUTOMATION} acciones por automatizacion
- Maximo ${MAX_AUTOMATIONS_PER_WORKSPACE} automatizaciones por workspace
- Las acciones se ejecutan en orden secuencial
- Cada accion puede tener un delay opcional (minutos, horas, o dias)

## Variables Disponibles por Trigger

Las variables se usan con formato \`{{namespace.campo}}\` dentro de textos de acciones (ej: mensajes WhatsApp, titulos de tareas).

${variableSection}

## Instrucciones de Uso de Herramientas

### Busqueda de Recursos
- Usa \`listPipelines\` cuando el usuario mencione pipelines, etapas, o stages
- Usa \`listTags\` cuando el usuario mencione tags o etiquetas
- Usa \`listTemplates\` cuando el usuario mencione templates o plantillas de WhatsApp
- Usa \`listWorkspaceMembers\` cuando necesites asignar una tarea a un usuario

### Automatizaciones Existentes
- Usa \`listAutomations\` cuando el usuario quiera ver sus automatizaciones o modificar una
- Usa \`getAutomation\` para cargar los detalles completos de una automatizacion especifica

### Preview y CRUD
- Usa \`generatePreview\` despues de reunir suficiente informacion para mostrar el diagrama
- Usa \`createAutomation\` SOLO despues de que el usuario confirme el preview
- Usa \`updateAutomation\` SOLO despues de que el usuario confirme el preview modificado

## Validaciones Obligatorias

1. **Recursos existentes**: Siempre valida que los recursos referenciados existan en el workspace antes de incluirlos en el preview. Si no existen, marca el error en el preview.
2. **Templates aprobados**: Para acciones de WhatsApp template, verifica que el template tenga status APPROVED. Advierte si esta PENDING o REJECTED.
3. **Duplicados**: Verifica si ya existe una automatizacion con el mismo trigger_type y trigger_config. Si existe, advierte al usuario (podria ser intencional, pero debe confirmarlo).
4. **Ciclos**: Detecta si la automatizacion podria crear un ciclo (ej: automatizacion A dispara un evento que activa automatizacion B, que dispara un evento que activa A). Si detectas un ciclo, BLOQUEA la creacion y explica el riesgo.
`
}
