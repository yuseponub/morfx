# Phase 2 Learnings: Workspaces & Roles

## Bugs Encontrados

### 1. React Hooks Order Error en WorkspaceProvider
**Qué falló**: `useMemo changed size between renders` error cuando el workspace cambiaba de null a un valor.

**Por qué**: Se llamaba `usePermissions()` condicionalmente dentro del componente.

**Cómo se arregló**: Mover toda la lógica de permisos DENTRO del useMemo, sin llamar hooks condicionalmente.

**Cómo prevenirlo**: NUNCA llamar hooks dentro de condicionales. Si necesitas lógica condicional, hazla dentro del hook, no alrededor.

```typescript
// MAL
const permissions = workspace ? usePermissions({ role: workspace.role }) : null

// BIEN
const value = useMemo(() => {
  const permissions = workspace ? { /* lógica aquí */ } : null
  return { workspace, permissions }
}, [workspace])
```

### 2. Hydration Mismatch con Fechas
**Qué falló**: Server renderizaba fecha en formato US, client en formato Colombia.

**Por qué**: `toLocaleDateString()` sin parámetros usa el locale del sistema, que difiere entre server y client.

**Cómo se arregló**: Especificar explícitamente locale y timezone.

**Cómo prevenirlo**: SIEMPRE usar formato explícito para fechas:
```typescript
new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
```

### 3. RLS Bloqueaba Vista de Invitación
**Qué falló**: Usuario no autenticado no podía ver detalles de la invitación (nombre del workspace).

**Por qué**: El join con `workspaces` fallaba porque RLS requiere ser miembro para ver workspaces.

**Cómo se arregló**: Crear función RPC `get_invitation_by_token()` con `SECURITY DEFINER` que bypasea RLS.

**Cómo prevenirlo**: Para datos que deben ser públicos (como invitaciones), usar funciones SECURITY DEFINER.

### 4. Join con auth.users Imposible
**Qué falló**: Query para obtener miembros con email fallaba.

**Por qué**: `auth.users` es tabla especial de Supabase, no permite joins directos desde tablas públicas.

**Cómo se arregló**: Crear tabla `profiles` que se sincroniza con `auth.users` via trigger.

**Cómo prevenirlo**: Siempre crear tabla `profiles` para datos de usuario que necesiten joins.

### 5. React Fragment sin Key
**Qué falló**: Warning de React por fragments sin key en loops.

**Por qué**: `<>...</>` no acepta key, hay que usar `<React.Fragment key={...}>`.

**Cómo se arregló**: Cambiar `<>` por `<React.Fragment key={category}>`.

## Decisiones Técnicas

| Decisión | Alternativas | Razón |
|----------|--------------|-------|
| Cookie para workspace activo | localStorage, URL param | Cookies accesibles en server components |
| Tabla profiles separada | Vista sobre auth.users | auth.users no permite joins directos |
| Link de invitación (no email) | Supabase invite email | Límite de 4 emails/hora en plan free |
| SECURITY DEFINER para invitaciones | Política RLS permisiva | Más seguro, control explícito |
| Permisos en código (no BD) | JSONB en BD | Más simple para MVP, migrar después si necesario |

## Problemas de Integración

### Supabase Free Tier
- **Límite de emails**: 4 por hora. No se puede confiar en emails para invitaciones en desarrollo.
- **Solución**: Generar link compartible en lugar de enviar email automático.

### Next.js Server Components + Client State
- **Problema**: Workspace seleccionado en client no se reflejaba en server.
- **Solución**: Usar cookies (accesibles en ambos lados) en lugar de localStorage.

## Tips para Futuros Agentes

### DO (Hacer)
1. Crear tabla `profiles` desde el inicio para cualquier proyecto con Supabase Auth
2. Usar `SECURITY DEFINER` para funciones que necesitan bypasear RLS
3. Especificar locale/timezone explícito en TODAS las fechas
4. Usar cookies para estado que necesite ser leído en server components
5. Reiniciar servidor después de CADA cambio de código durante debugging

### DON'T (No Hacer)
1. NO llamar hooks condicionalmente en React
2. NO intentar hacer joins con `auth.users` directamente
3. NO confiar en el servicio de email de Supabase free tier para desarrollo
4. NO usar `<>` fragments en loops, usar `<React.Fragment key={...}>`
5. NO asumir que el locale del server y client son iguales

### Patrones a Seguir
```typescript
// Patrón para fechas (evita hydration mismatch)
const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })

// Patrón para workspace en cookies
const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value

// Patrón para obtener datos con perfil
const { data: members } = await supabase.from('workspace_members').select('*')
const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
```

## Deuda Técnica

| Item | Prioridad | Cuándo Abordar |
|------|-----------|----------------|
| Edición de permisos custom por miembro | Baja | Phase 10 o post-MVP |
| Envío de emails de invitación | Media | Cuando se configure SMTP |
| Transferencia de ownership | Baja | Post-MVP |
| Workspace settings (editar nombre/slug) | Media | Phase 3 o después |
| Mobile nav con workspace switcher | Media | Phase 3 |

## Reglas Establecidas

Se agregaron reglas al proyecto en `.claude/REGLAS.md`:

1. **Reinicio de servidor**: SIEMPRE reiniciar después de cambios de código
2. **Zona horaria**: SIEMPRE usar America/Bogota (UTC-5) para fechas

---
*Documentado: 2026-01-28*
