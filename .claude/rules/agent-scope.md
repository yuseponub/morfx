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

## OBLIGATORIO al Crear un Agente Nuevo

Cuando se programe CUALQUIER agente nuevo en el sistema, se DEBE:

1. **Definir scope explicitamente** antes de escribir codigo:
   - Listar que modulos/tablas PUEDE tocar
   - Listar que modulos/tablas NO PUEDE tocar
   - Agregar el scope a esta seccion "Scopes por Agente"

2. **System prompt DEBE incluir**:
   - Scope explicito: "Tu scope es [modulo]. No operes fuera de el."
   - Instruccion: "Si un recurso no existe, avisa al usuario. NUNCA lo crees automaticamente."
   - Lista de PUEDE y NO PUEDE

3. **Tool definitions DEBEN**:
   - Solo exponer tools relevantes al scope del agente
   - No incluir herramientas de creacion de recursos externos
   - Validar workspace_id en CADA query

4. **Verificacion en code review**:
   - Confirmar que ningun tool handler escribe fuera del scope
   - Confirmar que las queries NO hacen INSERT/UPDATE en tablas fuera del modulo
   - Confirmar que el system prompt documenta las restricciones

**BLOQUEANTE:** No se puede mergear un agente nuevo sin scope definido en este archivo.
