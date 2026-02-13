# Phase 19: AI Automation Builder - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Meta-agente de IA que crea y configura automatizaciones por lenguaje natural. El usuario describe lo que quiere en un chat dedicado, el agente genera un diagrama de flujo visual, valida recursos, y crea la automatizacion tras aprobacion. Tambien puede modificar y explicar automatizaciones existentes.

NO incluye: creacion automatica de recursos faltantes (tags, stages, etc.) — solo avisa. Un robot CRM que cree recursos es fase futura.

</domain>

<decisions>
## Implementation Decisions

### Flujo de conversacion
- Chat en pagina dedicada (/automatizaciones/builder) — no integrado en el wizard existente
- Multiples automatizaciones en una misma sesion de chat
- El agente pregunta lo faltante ante ambiguedad (no infiere defaults silenciosamente)
- Consulta recursos del workspace solo cuando los necesita (no precarga todo al inicio)
- Historial de conversaciones guardado — el usuario puede ver sesiones anteriores
- El agente puede explicar automatizaciones existentes en lenguaje simple
- El agente NO sugiere ideas proactivamente al abrir el builder

### Preview y confirmacion
- Diagrama estilo flowchart (nodos y flechas): trigger -> condicion -> accion
- Diagrama renderizado inline en el chat como mensaje del agente
- Diagrama de solo lectura — cambios solo por chat, no clickeando nodos
- Cada regeneracion muestra diagrama completo nuevo (no diff)
- Nodos con recursos invalidos marcados visualmente (borde rojo / warning icon)
- Confirmacion via botones bajo el diagrama ("Crear automatizacion" / "Modificar") + opcion de escribir en chat
- Automatizacion se crea DESACTIVADA por defecto — el agente avisa al usuario que vaya a verificar y activar manualmente
- Post-creacion: mensaje de confirmacion con link a la automatizacion, el usuario puede seguir pidiendo mas en el mismo chat

### Resolucion de recursos
- Recursos faltantes: solo avisar en diagrama (marca visual) + mensaje. NO auto-crear
- Recursos ambiguos: preguntar cual (listar opciones del workspace)
- El agente lista opciones disponibles cuando el usuario necesita elegir un recurso
- Templates de WhatsApp: valida existencia Y estado de aprobacion por Meta
- Deteccion de ciclos: detectar y BLOQUEAR (no permitir crear hasta resolver)
- Deteccion de duplicados: comparar con automatizaciones existentes y avisar si hay conflicto
- Validacion al generar diagrama (no solo al confirmar) — cada diagrama ya esta validado

### Modificacion de automatizaciones
- El usuario puede describir cual quiere modificar O pedir lista para elegir
- Edicion parcial: solo lo pedido cambia, diagrama completo con cambio aplicado
- Toda modificacion requiere aprobacion con diagrama antes de guardar (sin excepciones)
- NO puede activar/desactivar por chat — solo desde UI manual
- NO puede eliminar por chat — solo desde UI manual
- SI puede clonar una existente como base para nueva (cargar, mostrar diagrama, aplicar cambios)

### Claude's Discretion
- Arquitectura del agente (prompt engineering, tool calling strategy)
- Libreria de diagramas para el flowchart
- Formato exacto de los mensajes del agente
- Estructura de datos interna para representar el diagrama
- Estrategia de caching de recursos del workspace

</decisions>

<specifics>
## Specific Ideas

- El diagrama debe ser estilo flowchart con nodos y flechas — trigger -> condicion(es) -> accion(es)
- Validaciones visuales en el diagrama: rojo para recursos faltantes, warning para potenciales problemas
- Botones de accion debajo del diagrama + opcion de escribir cambios en chat (ambos)
- Despues de crear: "Tu automatizacion esta creada pero desactivada. Ve a verificarla y activala cuando estes listo" con link directo
- Sesion multi-automatizacion: despues de crear una, el usuario puede decir "ahora haz otra" sin salir

</specifics>

<deferred>
## Deferred Ideas

- **Robot CRM para crear recursos**: Un agente que pueda crear tags, stages, etc. cuando el builder los necesite. El builder llamaria a este robot, que devolveria la accion verificada con output. (Fase futura)
- **Sugerencias proactivas**: Al abrir el builder, mostrar 3-4 ejemplos de automatizaciones comunes como inspiracion. (Para version comercial)

</deferred>

---

*Phase: 19-ai-automation-builder*
*Context gathered: 2026-02-13*
