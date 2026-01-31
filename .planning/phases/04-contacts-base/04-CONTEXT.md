# Phase 04: Contacts Base - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Gestión básica de contactos con campos estándar y sistema de tags. Los usuarios pueden ver, crear, editar, eliminar contactos y etiquetarlos. El filtrado por tags permite segmentación.

**Flujo de integración (referencia):**
```
WhatsApp → Sistema busca por TELÉFONO → Contacto (HUB central) → Pedidos
```
- Teléfono es identificador único (normalizado +57XXXXXXXXXX)
- Un contacto puede tener MUCHAS conversaciones WhatsApp
- Un contacto puede tener MUCHOS pedidos
- Tags del contacto se propagan a todos sus registros

**NO incluye (otras fases):**
- Campos custom (Phase 5)
- Import/export CSV (Phase 5)
- Notas e historial de actividad completo (Phase 5)
- Creación automática desde WhatsApp (Phase 7)

</domain>

<decisions>
## Implementation Decisions

### Vista de Lista de Contactos
- **Layout:** Tabla con columnas ajustables, ordenamiento por click en header
- **Columnas por defecto:** Nombre, Teléfono, Ciudad, Tags, Pedidos (count), Último contacto
- **Columnas configurables:** Usuario puede mostrar/ocultar columnas desde la UI
- **Ordenamiento default:** Último contacto primero (actividad reciente arriba)
- **Búsqueda:** Instantánea mientras se escribe (like Notion/Linear)
- **Selección múltiple:** Checkbox por fila, acciones masivas en toolbar superior
- **Acciones masivas:** Agregar/quitar tags, eliminar, exportar selección, asignar a agente
- **Detalle de contacto:**
  - Modal centrado para edición rápida
  - Página dedicada `/contactos/[id]` para vista completa con historial

### Formulario de Contacto
- **Layout:** Una columna, campos apilados verticalmente (responsive)
- **Campos obligatorios:** Solo nombre y teléfono
- **Teléfono:** Normalización automática a +57XXXXXXXXXX
  - Usuario puede escribir: 3001234567, 57 300 123 4567, +57-300-123-4567
  - Sistema siempre guarda: +573001234567
- **Ciudad:** Autocompletado con ciudades de Colombia (escribes y sugiere)
- **Campos opcionales:** Email, dirección completa

### Sistema de Tags
- **Colores:** Paleta predefinida (8-10 colores) + opción de agregar más (hasta por código hex)
- **Alcance:**
  - Tags globales por defecto (sirven para contactos, pedidos, WhatsApp)
  - Opción de crear tags específicos de módulo cuando sea necesario
- **Permisos:** Cualquier usuario puede crear tags nuevos
- **Límite:** Sin límite de tags por contacto

### Estados Vacíos y Feedback
- **Empty state:** Ilustración amigable + botón "Crear primer contacto" + texto explicativo
- **Confirmación eliminar:** Modal de confirmación "¿Eliminar X contacto(s)? Esta acción no se puede deshacer"
- **Feedback de acciones:** Toasts en esquina inferior derecha
  - "Contacto creado", "3 contactos actualizados", etc.
  - Desaparecen automáticamente (3-5 segundos)

### Claude's Discretion
- Diseño exacto de skeleton loaders
- Espaciado y tipografía específica
- Animaciones de transición
- Error states para casos edge

</decisions>

<specifics>
## Specific Ideas

- El contacto es el HUB central que conecta WhatsApp y Pedidos
- La tabla debe sentirse como un CRM moderno (Linear, Notion) no como Excel viejo
- Normalización de teléfono es crítica para matching con WhatsApp
- Debe funcionar bien en móvil (responsive)

</specifics>

<deferred>
## Deferred Ideas

- Import/export CSV — Phase 5
- Campos custom definidos por workspace — Phase 5
- Notas internas en contactos — Phase 5
- Historial de actividad completo — Phase 5
- Creación automática desde WhatsApp — Phase 7
- Vinculación con pedidos — Phase 6

</deferred>

---

*Phase: 04-contacts-base*
*Context gathered: 2026-01-28*
