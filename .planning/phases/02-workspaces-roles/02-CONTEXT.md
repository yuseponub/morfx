# Phase 2: Workspaces & Roles - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Usuarios pertenecen a workspaces aislados con control de acceso basado en roles. Un usuario puede pertenecer a múltiples workspaces con diferentes roles. Los datos de cada workspace están completamente aislados mediante Row Level Security (RLS).

**Requirements cubiertos:** WORK-01, WORK-02, WORK-03, WORK-04, WORK-05

</domain>

<decisions>
## Implementation Decisions

### Flujo de creación de workspace

- Workspace es **opcional** pero **muy visible** - usuario puede navegar la app sin workspace
- Banner superior + Card en dashboard incentivan crear workspace (máxima visibilidad)
- Al crear workspace pedir: **Nombre + Tipo de negocio** (selector: e-commerce, servicios, etc.)
- Usuario puede pertenecer a **múltiples workspaces** (como Slack)
- Un usuario puede ser Owner de uno y Agent de otros simultáneamente
- Nota: Al principio haremos setup acompañado con clientes

### Sistema de invitaciones

- **Ambos métodos**: Email directo automático O link copiable para compartir manualmente
- Invitaciones **expiran en 7 días**, luego hay que re-invitar
- **Sin límite de usuarios** inicial, pero arquitectura preparada para límites por plan
- Si invitado ya tiene cuenta: **Pantalla de confirmación** "¿Unirte a [Workspace]?" → Sí/No
- Owner y Admin pueden invitar (según permisos delegados)

### Permisos por rol

**Jerarquía:** Owner → Admin → Agent

**Owner (exclusivo):**
- Eliminar workspace
- Manejar billing/suscripción
- Promover usuarios a Admin
- Eliminar órdenes y conversaciones de WhatsApp
- Habilitar/deshabilitar permisos para Admins

**Admin (por defecto, configurable por Owner):**
- Invitar usuarios
- Configurar workspace
- Ver todo el workspace
- Gestionar contactos, pedidos, conversaciones
- NO puede eliminar (a menos que Owner lo habilite)
- Puede habilitar/deshabilitar permisos para Agents

**Agent (por defecto, configurable por Admin):**
- Editar órdenes y contactos
- Gestionar conversaciones de WhatsApp
- Permisos específicos asignados por Admin

**Sistema de delegación granular:**
- Owner puede activar/desactivar permisos individuales para cada Admin
- Admin puede activar/desactivar permisos individuales para cada Agent
- Cada nivel superior puede delegar sus propios permisos al nivel inferior

### UI del workspace

**Ubicación del workspace activo:**
- En el sidebar, **debajo del logo "morfx"**
- Dropdown integrado para cambiar entre workspaces

**Dropdown del workspace (sidebar):**
- Lista de workspaces del usuario
- Icono de tuerca (⚙️) a la derecha de cada workspace → acceso a Settings de ese workspace
- Al final: "Crear nuevo workspace"

**Sin workspace (estado inicial):**
- Banner superior destacado: "Crea tu workspace para empezar"
- Card grande en dashboard incentivando crear workspace
- Usuario puede navegar las secciones pero están vacías/limitadas

### Claude's Discretion

- Diseño exacto del banner y card de "crear workspace"
- Colores y estilos del dropdown de workspace
- Estructura de la página de Settings del workspace
- UI de la pantalla de confirmación de invitación
- Cómo mostrar el tipo de negocio en el workspace

</decisions>

<specifics>
## Specific Ideas

- El dropdown de workspaces debe ser compacto pero claro, similar a como Slack muestra los workspaces
- La tuerca de settings debe ser sutil pero accesible al hacer hover
- El sistema de permisos granulares debe ser fácil de entender visualmente (checkboxes o toggles)
- Preparar la arquitectura para monetización futura (límites por plan)

</specifics>

<deferred>
## Deferred Ideas

- Límites de usuarios por plan de suscripción — implementar cuando se comercialice
- Billing y gestión de pagos — fase posterior o integración con Stripe
- Auditoría de cambios de permisos — posible feature futuro

</deferred>

---

*Phase: 02-workspaces-roles*
*Context gathered: 2026-01-28*
