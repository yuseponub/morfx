# Phase 5: Contacts Extended - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Extender el módulo de contactos con campos personalizados, importación/exportación CSV, notas internas y historial de actividad. El contacto ya existe (Phase 4), esta fase agrega capacidades avanzadas de gestión.

</domain>

<decisions>
## Implementation Decisions

### Custom Fields
- **Tipos soportados:** Completos — texto, número, fecha, selección (dropdown), checkbox, URL, email, teléfono, moneda, porcentaje, archivo adjunto, relación con otros contactos
- **Quién crea campos:** Owner + Admin pueden definir campos custom
- **Dónde se muestran:** En detalle del contacto siempre + columnas configurables en tabla (usuario elige cuáles mostrar)
- **Obligatoriedad:** Configurable por campo — admin define si un campo es requerido al crear contacto

### Import/Export CSV
- **Mapeo de columnas (import):** Auto-detectar nombres de columnas + usuario confirma o ajusta el mapeo sugerido
- **Contactos duplicados (import):** Preguntar por cada conflicto — mostrar filas con teléfonos existentes y dejar que usuario decida (actualizar, omitir, o crear nuevo)
- **Columnas a exportar:** Usuario elige qué campos incluir en el export (selector de columnas)
- **Alcance del export:** Opción al exportar — "Exportar filtrados" o "Exportar todos"

### Notas internas (contacto)
- **Formato:** Texto plano — simple, sin markdown ni rich text
- **Visualización:** Timeline de notas con autor y fecha de cada entrada
- **Visibilidad:** Todos los miembros del workspace pueden ver todas las notas
- **Edición/eliminación:** Autor, admin u owner pueden editar y eliminar notas

### Historial de actividad
- **Eventos registrados:** CRM completo — creación del contacto, ediciones de campos, notas agregadas, cambios de tags, pedidos vinculados
- **Presentación visual:** Timeline vertical con iconos distintos por tipo de evento
- **Detalle de cambios:** Diff de campos — mostrar "Nombre: Juan → Juan Pérez" para cada edición
- **Filtros:** Toggles para mostrar/ocultar por tipo: Ediciones, Notas, Pedidos, Tags

### Claude's Discretion
- Diseño específico de UI para custom field builder
- Algoritmo de auto-detección de columnas CSV
- Iconografía del timeline de historial
- Paginación/virtualización del historial si crece mucho

</decisions>

<specifics>
## Specific Ideas

- Los campos custom tipo "relación con otros contactos" permiten vincular contactos entre sí (ej: esposo/esposa, referido por)
- El diff de cambios en historial debe ser claro y legible, no técnico
- La importación CSV debe manejar los errores de forma amigable, no abortar todo por una fila mala

</specifics>

<deferred>
## Deferred Ideas

- Integración de historial con WhatsApp (mensajes) — Phase 7/9 cuando WhatsApp esté implementado
- Templates de campos custom predefinidos por industria — post-MVP
- Importación desde otras fuentes (Google Contacts, Excel) — post-MVP

</deferred>

---

*Phase: 05-contacts-extended*
*Context gathered: 2026-01-29*
