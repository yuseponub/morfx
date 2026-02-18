// ============================================================================
// Phase 17: CRM Automations Engine — Constants & Catalogs
// ZERO imports from other project files (prevents circular deps).
// Phase 18 AI Builder reads these programmatically.
// ============================================================================

// ============================================================================
// Limits
// ============================================================================

export const MAX_CASCADE_DEPTH = 3
export const MAX_ACTIONS_PER_AUTOMATION = 10
export const MAX_AUTOMATIONS_PER_WORKSPACE = 50
export const MAX_DELAY_DAYS = 30
export const WEBHOOK_TIMEOUT_MS = 10_000
export const WEBHOOK_MAX_RETRIES = 3
export const WEBHOOK_RATE_LIMIT_PER_HOUR = 100

// ============================================================================
// Trigger Catalog
// ============================================================================

export const TRIGGER_CATALOG = [
  {
    type: 'order.stage_changed',
    label: 'Orden cambia de etapa',
    category: 'CRM',
    description: 'Se dispara cuando una orden se mueve a otra etapa del pipeline',
    configFields: [
      { name: 'pipelineId', label: 'Pipeline', type: 'select', required: false },
      { name: 'stageId', label: 'Etapa destino', type: 'select', required: false },
    ],
    variables: ['orden.id', 'orden.nombre', 'orden.valor', 'orden.stage_anterior', 'orden.stage_nuevo', 'orden.pipeline', 'orden.direccion_envio', 'orden.ciudad_envio', 'orden.departamento_envio', 'orden.descripcion', 'contacto.nombre', 'contacto.telefono', 'contacto.ciudad'],
  },
  {
    type: 'tag.assigned',
    label: 'Tag asignado',
    category: 'CRM',
    description: 'Se dispara cuando se asigna un tag a un contacto, orden o conversacion',
    configFields: [
      { name: 'tagId', label: 'Tag especifico', type: 'select', required: false },
    ],
    variables: ['tag.nombre', 'tag.color', 'entidad.tipo', 'entidad.id', 'contacto.nombre', 'contacto.telefono'],
  },
  {
    type: 'tag.removed',
    label: 'Tag removido',
    category: 'CRM',
    description: 'Se dispara cuando se remueve un tag',
    configFields: [
      { name: 'tagId', label: 'Tag especifico', type: 'select', required: false },
    ],
    variables: ['tag.nombre', 'entidad.tipo', 'entidad.id', 'contacto.nombre'],
  },
  {
    type: 'contact.created',
    label: 'Contacto creado',
    category: 'CRM',
    description: 'Se dispara cuando se crea un nuevo contacto',
    configFields: [],
    variables: ['contacto.id', 'contacto.nombre', 'contacto.telefono', 'contacto.email', 'contacto.ciudad'],
  },
  {
    type: 'order.created',
    label: 'Orden creada',
    category: 'CRM',
    description: 'Se dispara cuando se crea una nueva orden',
    configFields: [
      { name: 'pipelineId', label: 'Pipeline', type: 'select', required: false },
      { name: 'stageId', label: 'Etapa', type: 'select', required: false },
    ],
    variables: ['orden.id', 'orden.nombre', 'orden.valor', 'orden.pipeline', 'orden.stage', 'orden.direccion_envio', 'orden.ciudad_envio', 'orden.departamento_envio', 'orden.descripcion', 'contacto.nombre', 'contacto.telefono'],
  },
  {
    type: 'field.changed',
    label: 'Campo cambia de valor',
    category: 'CRM',
    description: 'Se dispara cuando un campo especifico de contacto u orden cambia',
    configFields: [
      { name: 'fieldName', label: 'Campo', type: 'text', required: true },
    ],
    variables: ['campo.nombre', 'campo.valor_anterior', 'campo.valor_nuevo', 'entidad.tipo', 'entidad.id'],
  },
  {
    type: 'whatsapp.message_received',
    label: 'Mensaje de WhatsApp recibido',
    category: 'WhatsApp',
    description: 'Se dispara con cualquier mensaje entrante de WhatsApp',
    configFields: [],
    variables: ['mensaje.contenido', 'mensaje.telefono', 'conversacion.id', 'contacto.nombre', 'contacto.telefono'],
  },
  {
    type: 'whatsapp.keyword_match',
    label: 'Palabra clave en WhatsApp',
    category: 'WhatsApp',
    description: 'Se dispara cuando un mensaje contiene palabras clave especificas',
    configFields: [
      { name: 'keywords', label: 'Palabras clave', type: 'tags', required: true },
    ],
    variables: ['mensaje.contenido', 'mensaje.keyword_matched', 'mensaje.telefono', 'contacto.nombre'],
  },
  {
    type: 'task.completed',
    label: 'Tarea completada',
    category: 'Tareas',
    description: 'Se dispara cuando una tarea se marca como completada',
    configFields: [],
    variables: ['tarea.id', 'tarea.titulo', 'tarea.descripcion', 'contacto.nombre', 'orden.id'],
  },
  {
    type: 'task.overdue',
    label: 'Tarea vencida',
    category: 'Tareas',
    description: 'Se dispara cuando una tarea pasa su fecha limite sin completarse',
    configFields: [],
    variables: ['tarea.id', 'tarea.titulo', 'tarea.fecha_limite', 'contacto.nombre', 'orden.id'],
  },
  {
    type: 'shopify.order_created',
    label: 'Orden de Shopify creada',
    category: 'Shopify',
    description: 'Se dispara cuando llega una orden nueva desde Shopify',
    configFields: [],
    variables: ['shopify.order_number', 'shopify.total', 'shopify.financial_status', 'shopify.email', 'shopify.phone', 'shopify.note', 'shopify.productos', 'shopify.direccion_envio', 'shopify.ciudad_envio', 'shopify.departamento_envio', 'shopify.tags', 'contacto.nombre', 'contacto.telefono'],
  },
  {
    type: 'shopify.draft_order_created',
    label: 'Borrador de Shopify creado',
    category: 'Shopify',
    description: 'Se dispara cuando se crea un borrador de orden en Shopify',
    configFields: [],
    variables: ['shopify.order_number', 'shopify.total', 'shopify.status', 'shopify.email', 'shopify.phone', 'shopify.note', 'shopify.productos', 'shopify.direccion_envio', 'contacto.nombre', 'contacto.telefono'],
  },
  {
    type: 'shopify.order_updated',
    label: 'Orden de Shopify actualizada',
    category: 'Shopify',
    description: 'Se dispara cuando una orden existente de Shopify se actualiza',
    configFields: [],
    variables: ['shopify.order_number', 'shopify.total', 'shopify.financial_status', 'shopify.fulfillment_status', 'shopify.email', 'shopify.phone', 'shopify.note', 'shopify.productos', 'shopify.direccion_envio', 'shopify.ciudad_envio', 'shopify.departamento_envio', 'shopify.tags', 'contacto.nombre', 'contacto.telefono'],
  },
] as const

// ============================================================================
// Action Catalog
// ============================================================================

export const ACTION_CATALOG = [
  {
    type: 'assign_tag',
    label: 'Asignar tag',
    category: 'CRM',
    description: 'Asigna un tag a un contacto u orden',
    params: [
      { name: 'tagName', label: 'Tag', type: 'select', required: true },
      { name: 'entityType', label: 'Tipo de entidad', type: 'select', options: ['contact', 'order'], required: false },
    ],
  },
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
  {
    type: 'change_stage',
    label: 'Cambiar etapa',
    category: 'CRM',
    description: 'Mueve la orden a otra etapa del pipeline',
    params: [
      { name: 'pipelineId', label: 'Pipeline', type: 'select', required: true },
      { name: 'stageId', label: 'Etapa destino', type: 'select', required: true },
    ],
  },
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
  {
    type: 'duplicate_order',
    label: 'Duplicar orden a otro pipeline',
    category: 'Ordenes',
    description: 'Crea una copia de la orden en otro pipeline con source_order_id para referencia bidireccional',
    params: [
      { name: 'targetPipelineId', label: 'Pipeline destino', type: 'select', required: true },
      { name: 'targetStageId', label: 'Etapa destino', type: 'select', required: false },
      { name: 'copyContact', label: 'Copiar contacto', type: 'boolean', required: false },
      { name: 'copyProducts', label: 'Copiar productos', type: 'boolean', required: false },
      { name: 'copyValue', label: 'Copiar valor', type: 'boolean', required: false },
      { name: 'copyTags', label: 'Copiar tags', type: 'boolean', required: false },
    ],
  },
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
  {
    type: 'send_whatsapp_text',
    label: 'Enviar texto WhatsApp',
    category: 'WhatsApp',
    description: 'Envia un mensaje de texto por WhatsApp (requiere ventana de 24h abierta)',
    params: [
      { name: 'text', label: 'Mensaje', type: 'textarea', required: true, supportsVariables: true },
    ],
  },
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
  {
    type: 'webhook',
    label: 'Webhook saliente',
    category: 'Integraciones',
    description: 'Envia POST a URL externa con datos del trigger',
    params: [
      { name: 'url', label: 'URL', type: 'text', required: true },
      { name: 'headers', label: 'Headers', type: 'key_value', required: false },
      { name: 'payloadTemplate', label: 'Payload JSON', type: 'json', required: false, supportsVariables: true },
    ],
  },
  {
    type: 'send_sms',
    label: 'Enviar SMS',
    category: 'Twilio',
    description: 'Envia un mensaje SMS al contacto via Twilio',
    params: [
      { name: 'body', label: 'Mensaje', type: 'textarea', required: true, supportsVariables: true },
      { name: 'to', label: 'Telefono destino (opcional)', type: 'text', required: false, supportsVariables: true },
      { name: 'mediaUrl', label: 'URL de media (MMS)', type: 'text', required: false },
    ],
  },
] as const

// ============================================================================
// Variable Catalog (per trigger type)
// ============================================================================

export const VARIABLE_CATALOG = {
  'order.stage_changed': [
    { path: 'orden.id', label: 'ID de la orden' },
    { path: 'orden.nombre', label: 'Nombre de la orden' },
    { path: 'orden.valor', label: 'Valor total' },
    { path: 'orden.stage_anterior', label: 'Etapa anterior' },
    { path: 'orden.stage_nuevo', label: 'Etapa nueva' },
    { path: 'orden.pipeline', label: 'Pipeline' },
    { path: 'orden.direccion_envio', label: 'Direccion de envio' },
    { path: 'orden.ciudad_envio', label: 'Ciudad de envio' },
    { path: 'orden.departamento_envio', label: 'Departamento de envio' },
    { path: 'orden.descripcion', label: 'Descripcion de la orden' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
    { path: 'contacto.email', label: 'Email del contacto' },
    { path: 'contacto.ciudad', label: 'Ciudad del contacto' },
    { path: 'contacto.departamento', label: 'Departamento del contacto' },
    { path: 'contacto.direccion', label: 'Direccion del contacto' },
  ],
  'tag.assigned': [
    { path: 'tag.nombre', label: 'Nombre del tag' },
    { path: 'entidad.tipo', label: 'Tipo de entidad (contact/order)' },
    { path: 'entidad.id', label: 'ID de la entidad' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
    { path: 'orden.pipeline_id', label: 'Pipeline de la orden' },
    { path: 'orden.stage_id', label: 'Etapa de la orden' },
    { path: 'orden.id', label: 'ID de la orden' },
    { path: 'orden.valor', label: 'Valor de la orden' },
    { path: 'orden.nombre', label: 'Nombre de la orden' },
  ],
  'tag.removed': [
    { path: 'tag.nombre', label: 'Nombre del tag' },
    { path: 'entidad.tipo', label: 'Tipo de entidad' },
    { path: 'entidad.id', label: 'ID de la entidad' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'orden.pipeline_id', label: 'Pipeline de la orden' },
    { path: 'orden.stage_id', label: 'Etapa de la orden' },
    { path: 'orden.id', label: 'ID de la orden' },
  ],
  'contact.created': [
    { path: 'contacto.id', label: 'ID del contacto' },
    { path: 'contacto.nombre', label: 'Nombre' },
    { path: 'contacto.telefono', label: 'Telefono' },
    { path: 'contacto.email', label: 'Email' },
    { path: 'contacto.ciudad', label: 'Ciudad' },
    { path: 'contacto.departamento', label: 'Departamento' },
    { path: 'contacto.direccion', label: 'Direccion' },
  ],
  'order.created': [
    { path: 'orden.id', label: 'ID de la orden' },
    { path: 'orden.nombre', label: 'Nombre de la orden' },
    { path: 'orden.valor', label: 'Valor total' },
    { path: 'orden.pipeline', label: 'Pipeline' },
    { path: 'orden.stage', label: 'Etapa' },
    { path: 'orden.direccion_envio', label: 'Direccion de envio' },
    { path: 'orden.ciudad_envio', label: 'Ciudad de envio' },
    { path: 'orden.departamento_envio', label: 'Departamento de envio' },
    { path: 'orden.descripcion', label: 'Descripcion de la orden' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
    { path: 'contacto.email', label: 'Email del contacto' },
    { path: 'contacto.ciudad', label: 'Ciudad del contacto' },
    { path: 'contacto.departamento', label: 'Departamento del contacto' },
    { path: 'contacto.direccion', label: 'Direccion del contacto' },
  ],
  'field.changed': [
    { path: 'campo.nombre', label: 'Nombre del campo' },
    { path: 'campo.valor_anterior', label: 'Valor anterior' },
    { path: 'campo.valor_nuevo', label: 'Valor nuevo' },
    { path: 'entidad.tipo', label: 'Tipo de entidad' },
    { path: 'entidad.id', label: 'ID de la entidad' },
  ],
  'whatsapp.message_received': [
    { path: 'mensaje.contenido', label: 'Contenido del mensaje' },
    { path: 'mensaje.telefono', label: 'Telefono del remitente' },
    { path: 'conversacion.id', label: 'ID de la conversacion' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
  ],
  'whatsapp.keyword_match': [
    { path: 'mensaje.contenido', label: 'Contenido del mensaje' },
    { path: 'mensaje.keyword_matched', label: 'Keyword que matcheo' },
    { path: 'mensaje.telefono', label: 'Telefono' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
  ],
  'task.completed': [
    { path: 'tarea.id', label: 'ID de la tarea' },
    { path: 'tarea.titulo', label: 'Titulo' },
    { path: 'tarea.descripcion', label: 'Descripcion' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'orden.id', label: 'ID de la orden' },
  ],
  'task.overdue': [
    { path: 'tarea.id', label: 'ID de la tarea' },
    { path: 'tarea.titulo', label: 'Titulo' },
    { path: 'tarea.fecha_limite', label: 'Fecha limite' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'orden.id', label: 'ID de la orden' },
  ],
  'shopify.order_created': [
    { path: 'shopify.order_number', label: 'Numero de orden Shopify' },
    { path: 'shopify.total', label: 'Total de la orden' },
    { path: 'shopify.financial_status', label: 'Estado de pago' },
    { path: 'shopify.email', label: 'Email del cliente' },
    { path: 'shopify.phone', label: 'Telefono del cliente' },
    { path: 'shopify.note', label: 'Nota de la orden' },
    { path: 'shopify.productos', label: 'Productos (SKU, cantidad, precio)' },
    { path: 'shopify.direccion_envio', label: 'Direccion de envio' },
    { path: 'shopify.ciudad_envio', label: 'Ciudad de envio' },
    { path: 'shopify.departamento_envio', label: 'Departamento de envio' },
    { path: 'shopify.tags', label: 'Tags de Shopify' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
  ],
  'shopify.draft_order_created': [
    { path: 'shopify.order_number', label: 'Numero del borrador' },
    { path: 'shopify.total', label: 'Total del borrador' },
    { path: 'shopify.status', label: 'Estado del borrador' },
    { path: 'shopify.email', label: 'Email del cliente' },
    { path: 'shopify.phone', label: 'Telefono del cliente' },
    { path: 'shopify.note', label: 'Nota del borrador' },
    { path: 'shopify.productos', label: 'Productos (SKU, cantidad, precio)' },
    { path: 'shopify.direccion_envio', label: 'Direccion de envio' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
  ],
  'shopify.order_updated': [
    { path: 'shopify.order_number', label: 'Numero de orden Shopify' },
    { path: 'shopify.total', label: 'Total de la orden' },
    { path: 'shopify.financial_status', label: 'Estado de pago' },
    { path: 'shopify.fulfillment_status', label: 'Estado de fulfillment' },
    { path: 'shopify.email', label: 'Email del cliente' },
    { path: 'shopify.phone', label: 'Telefono del cliente' },
    { path: 'shopify.note', label: 'Nota de la orden' },
    { path: 'shopify.productos', label: 'Productos (SKU, cantidad, precio)' },
    { path: 'shopify.direccion_envio', label: 'Direccion de envio' },
    { path: 'shopify.ciudad_envio', label: 'Ciudad de envio' },
    { path: 'shopify.departamento_envio', label: 'Departamento de envio' },
    { path: 'shopify.tags', label: 'Tags de Shopify' },
    { path: 'contacto.nombre', label: 'Nombre del contacto' },
    { path: 'contacto.telefono', label: 'Telefono del contacto' },
  ],
} as const

// ============================================================================
// Delay limits
// ============================================================================

export const DELAY_LIMITS = {
  minutes: { min: 1, max: 60 * 24 * MAX_DELAY_DAYS },
  hours: { min: 1, max: 24 * MAX_DELAY_DAYS },
  days: { min: 1, max: MAX_DELAY_DAYS },
} as const

// ============================================================================
// Helper: Convert delay to milliseconds
// ============================================================================

export function delayToMs(delay: { amount: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' }): number {
  const multipliers = { seconds: 1_000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 }
  return delay.amount * multipliers[delay.unit]
}
