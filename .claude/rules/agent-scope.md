# REGLA DE SCOPE DE AGENTES

## Principio

Cada agente AI (builder, sandbox, etc.) SOLO puede operar dentro de su modulo asignado.
Un agente NO puede crear, modificar ni eliminar recursos fuera de su scope.

## Regla General

Cuando un agente necesita un recurso que NO existe (tag, pipeline, etapa, template, contacto, pedido, etc.):
1. **ADVERTIR** al usuario que el recurso no existe
2. **NUNCA** crearlo automaticamente
3. **SUGERIR** que el usuario lo cree manualmente desde el modulo correspondiente
4. **BLOQUEAR** la operacion hasta que el recurso exista

## Scopes por Agente

### AI Automation Builder (`/automatizaciones/builder`)
- **PUEDE:** Crear, modificar, clonar y explicar automatizaciones
- **NO PUEDE:** Crear tags, pipelines, etapas, templates de WhatsApp, contactos, pedidos, tareas, usuarios
- **Validacion:** Antes de referenciar un recurso en una automatizacion, verificar que existe en el workspace

### Sandbox / Agentes CRM (`/sandbox`, `/agentes`)
- **PUEDE:** Ejecutar herramientas definidas en su tool set
- **NO PUEDE:** Salirse de las herramientas asignadas ni crear recursos de otros modulos

## Implementacion

En el system prompt de cada agente:
- Listar explicitamente que PUEDE y que NO PUEDE hacer
- Incluir instruccion: "Si un recurso no existe, avisa al usuario. NUNCA lo crees automaticamente."
- Incluir instruccion: "Tu scope es [modulo]. No operes fuera de el."

En las tool definitions:
- Solo exponer tools relevantes al scope del agente
- No incluir herramientas de creacion de recursos externos
