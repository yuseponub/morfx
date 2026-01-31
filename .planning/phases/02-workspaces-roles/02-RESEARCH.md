# Phase 2 Research: Workspaces & Roles

## Stack Utilizado

No se requirieron paquetes nuevos - el stack de la Fase 1 fue suficiente:
- Supabase PostgreSQL con RLS
- `@supabase/ssr` para autenticacion
- Custom Access Token Hook para JWT claims con `workspace_id` y `role`

## Patron de Base de Datos

Arquitectura multi-tenant usando base de datos compartida con aislamiento por `workspace_id`:

```sql
-- Tablas creadas
workspaces (id, name, slug, business_type, owner_id, created_at, updated_at)
workspace_members (id, workspace_id, user_id, role, permissions JSONB, created_at, updated_at)
workspace_invitations (id, workspace_id, email, role, token, invited_by, expires_at, accepted_at, created_at)
```

## Puntos Criticos de Seguridad

1. **app_metadata vs user_metadata**: Se debe usar `app_metadata` (NO `user_metadata`) para datos de autorizacion
2. **RLS Policies**: Acceden a claims via `auth.jwt() -> 'app_metadata' ->> 'workspace_id'`
3. **Indices**: Todas las columnas usadas en politicas RLS tienen indices para rendimiento
4. **Funciones SECURITY DEFINER**: Para operaciones atomicas como crear workspace + agregar owner

## Sistema de Invitaciones

Implementado con dos metodos:

1. **Invitacion por email**: Genera token unico, guarda en `workspace_invitations`
2. **Link compartible**: Token de 32 bytes hex, expira en 7 dias

### Flujo de Aceptacion
1. Usuario recibe link `/invite/[token]`
2. Si no esta autenticado, redirige a login con redirect back
3. Verifica que el email del usuario coincide con el de la invitacion
4. Usa funcion `accept_workspace_invitation()` para atomicidad

## Permisos Granulares

### Jerarquia de Roles
```
Owner > Admin > Agent
```

### Permisos por Rol

| Categoria | Owner | Admin | Agent |
|-----------|-------|-------|-------|
| workspace.manage | ✓ | ✓ | - |
| workspace.delete | ✓ | - | - |
| members.invite | ✓ | ✓ | - |
| members.remove | ✓ | ✓ | - |
| members.change_role | ✓ | - | - |
| contacts.* | ✓ | ✓ | ✓ |
| orders.* | ✓ | ✓ | ✓ (sin delete) |
| whatsapp.* | ✓ | ✓ | ✓ |
| settings.view | ✓ | ✓ | ✓ |
| settings.edit | ✓ | ✓ | - |

### Permisos Personalizados
- Almacenados en `workspace_members.permissions` como JSONB
- Permiten delegacion flexible por miembro
- Sobreescriben los permisos por defecto del rol

## Archivos Creados

### Base de Datos
- `supabase/migrations/20260128000001_workspaces_and_roles.sql`
- `supabase/config.toml`

### Tipos
- `src/lib/types/database.ts`

### Server Actions
- `src/app/actions/workspace.ts`
- `src/app/actions/invitations.ts`

### Componentes
- `src/components/workspace/create-workspace-form.tsx`
- `src/components/workspace/workspace-switcher.tsx`
- `src/components/workspace/invite-member-form.tsx`
- `src/components/workspace/permission-matrix.tsx`
- `src/components/workspace/index.ts`

### Paginas
- `src/app/(dashboard)/create-workspace/page.tsx`
- `src/app/(dashboard)/settings/workspace/members/page.tsx`
- `src/app/(dashboard)/settings/workspace/members/members-content.tsx`
- `src/app/(dashboard)/settings/workspace/roles/page.tsx`
- `src/app/invite/[token]/page.tsx`
- `src/app/invite/[token]/accept-button.tsx`

### Utilidades
- `src/lib/permissions.ts`
- `src/hooks/use-permissions.ts`
- `src/components/providers/workspace-provider.tsx`

### Actualizaciones
- `src/app/(dashboard)/layout.tsx` - Agregado WorkspaceProvider
- `src/components/layout/sidebar.tsx` - Agregado WorkspaceSwitcher
- `src/lib/supabase/middleware.ts` - Agregada ruta /invite como publica
- `src/app/(dashboard)/settings/page.tsx` - Navegacion a workspace settings

## Verificacion

1. ✓ Crear workspace → usuario se convierte en Owner
2. ✓ Invitar usuario por email → pueden unirse
3. ✓ Invitar via link → link funciona por 7 dias
4. ✓ Aislamiento RLS → datos de workspace A invisibles para workspace B
5. ✓ Delegacion de permisos → Owner puede otorgar permisos de Admin
