// ============================================================================
// Phase 17: CRM Automations Engine — Variable Resolver
// Mustache-style {{variable}} template resolver for automation action params.
// Pure functions with no external dependencies beyond types.
// ============================================================================

// ============================================================================
// Nested Value Access
// ============================================================================

/**
 * Access a nested value in an object using dot notation.
 * e.g., getNestedValue({ orden: { id: '123' } }, 'orden.id') => '123'
 * Returns undefined if any intermediate value is null/undefined.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

// ============================================================================
// String Variable Resolution
// ============================================================================

/**
 * Replace {{path}} placeholders in a template string with values from context.
 *
 * - Finds all {{path}} patterns using regex
 * - Looks up each path in context via dot notation
 * - If value found: replaces with String(value)
 * - If value is null/undefined: replaces with empty string
 * - If path not found in context: leaves the original {{path}} unchanged
 *
 * @example
 * resolveVariables('Hola {{contacto.nombre}}!', { contacto: { nombre: 'Juan' } })
 * // => 'Hola Juan!'
 */
export function resolveVariables(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, rawPath: string) => {
    const path = rawPath.trim()
    const value = getNestedValue(context, path)

    // Value found but is null/undefined: replace with empty string
    if (value === null || value === undefined) {
      // Distinguish between "path exists but value is null" and "path doesn't exist"
      // For both cases where the path resolves to null/undefined, replace with empty string
      // Only leave {{path}} unchanged if the top-level key doesn't exist at all
      const topKey = path.split('.')[0]
      if (topKey in context) {
        return ''
      }
      // Path not found at all: leave original placeholder
      return `{{${rawPath}}}`
    }

    return String(value)
  })
}

// ============================================================================
// Recursive Object Resolution
// ============================================================================

/**
 * Recursively walk an object and resolve {{path}} variables in all string values.
 *
 * - String values: apply resolveVariables
 * - Objects: recurse into properties
 * - Arrays: map over items and resolve each
 * - Other types (number, boolean, null): return as-is
 */
export function resolveVariablesInObject(
  obj: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveValue(value, context)
  }

  return result
}

/**
 * Resolve a single value — dispatches by type.
 */
function resolveValue(
  value: unknown,
  context: Record<string, unknown>
): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return resolveVariables(value, context)
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context))
  }

  if (typeof value === 'object') {
    return resolveVariablesInObject(
      value as Record<string, unknown>,
      context
    )
  }

  // number, boolean, etc. — return as-is
  return value
}

// ============================================================================
// Trigger Context Builder
// ============================================================================

/**
 * Build the nested variable namespace from flat event data.
 * Maps event data keys to the Spanish variable paths used in VARIABLE_CATALOG.
 *
 * This ensures {{contacto.nombre}}, {{orden.stage_nuevo}}, etc. resolve correctly
 * when automation templates use them.
 *
 * @example
 * buildTriggerContext({ contactName: 'Juan', orderId: 'abc-123' })
 * // => { contacto: { nombre: 'Juan' }, orden: { id: 'abc-123' } }
 */
export function buildTriggerContext(
  eventData: Record<string, unknown>
): Record<string, unknown> {
  const context: Record<string, unknown> = {}

  // --- contacto ---
  const contacto: Record<string, unknown> = {}
  if (eventData.contactName !== undefined) contacto.nombre = eventData.contactName
  if (eventData.contactId !== undefined) contacto.id = eventData.contactId
  if (eventData.contactPhone !== undefined) contacto.telefono = eventData.contactPhone
  if (eventData.contactEmail !== undefined) contacto.email = eventData.contactEmail
  if (eventData.contactCity !== undefined) contacto.ciudad = eventData.contactCity
  if (Object.keys(contacto).length > 0) context.contacto = contacto

  // --- orden ---
  const orden: Record<string, unknown> = {}
  if (eventData.orderId !== undefined) orden.id = eventData.orderId
  if (eventData.orderName !== undefined) orden.nombre = eventData.orderName
  if (eventData.orderValue !== undefined) orden.valor = eventData.orderValue
  if (eventData.previousStageName !== undefined) orden.stage_anterior = eventData.previousStageName
  if (eventData.newStageName !== undefined) orden.stage_nuevo = eventData.newStageName
  if (eventData.pipelineName !== undefined) orden.pipeline = eventData.pipelineName
  if (eventData.stageName !== undefined) orden.stage = eventData.stageName
  if (Object.keys(orden).length > 0) context.orden = orden

  // --- tag ---
  const tag: Record<string, unknown> = {}
  if (eventData.tagName !== undefined) tag.nombre = eventData.tagName
  if (eventData.tagColor !== undefined) tag.color = eventData.tagColor
  if (Object.keys(tag).length > 0) context.tag = tag

  // --- mensaje ---
  const mensaje: Record<string, unknown> = {}
  if (eventData.messageContent !== undefined) mensaje.contenido = eventData.messageContent
  if (eventData.messagePhone !== undefined) mensaje.telefono = eventData.messagePhone
  if (eventData.keywordMatched !== undefined) mensaje.keyword_matched = eventData.keywordMatched
  if (Object.keys(mensaje).length > 0) context.mensaje = mensaje

  // --- conversacion ---
  const conversacion: Record<string, unknown> = {}
  if (eventData.conversationId !== undefined) conversacion.id = eventData.conversationId
  if (Object.keys(conversacion).length > 0) context.conversacion = conversacion

  // --- tarea ---
  const tarea: Record<string, unknown> = {}
  if (eventData.taskId !== undefined) tarea.id = eventData.taskId
  if (eventData.taskTitle !== undefined) tarea.titulo = eventData.taskTitle
  if (eventData.taskDescription !== undefined) tarea.descripcion = eventData.taskDescription
  if (eventData.taskDueDate !== undefined) tarea.fecha_limite = eventData.taskDueDate
  if (Object.keys(tarea).length > 0) context.tarea = tarea

  // --- campo (field.changed) ---
  const campo: Record<string, unknown> = {}
  if (eventData.fieldName !== undefined) campo.nombre = eventData.fieldName
  if (eventData.fieldPreviousValue !== undefined) campo.valor_anterior = eventData.fieldPreviousValue
  if (eventData.fieldNewValue !== undefined) campo.valor_nuevo = eventData.fieldNewValue
  if (Object.keys(campo).length > 0) context.campo = campo

  // --- entidad (generic entity for tag/field triggers) ---
  const entidad: Record<string, unknown> = {}
  if (eventData.entityType !== undefined) entidad.tipo = eventData.entityType
  if (eventData.entityId !== undefined) entidad.id = eventData.entityId
  if (Object.keys(entidad).length > 0) context.entidad = entidad

  return context
}
