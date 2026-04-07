---
phase: standalone/metricas-conversaciones
plan: 05
subsystem: analytics
tags: [nextjs, sidebar, server-actions, supabase, domain-layer, settings, admin-ui]
one-liner: "Sidebar gate via settingsKey + /metricas/settings admin UI + domain layer para conversation_metrics settings JSONB"
requires:
  - "standalone/metricas-conversaciones/02 (types MetricsSettings + DEFAULT_METRICS_SETTINGS + dashboard base)"
provides:
  - "Mecanismo generico settingsKey en NavItem (reutilizable por futuros modulos gated por workspaces.settings)"
  - "Nav item /metricas visible solo cuando conversation_metrics.enabled === true"
  - "/metricas/settings pagina admin-only con form (enabled / reopen_window_days / scheduled_tag_name)"
  - "updateMetricsSettings server action con auth + rol (owner/admin)"
  - "Domain function updateConversationMetricsSettings (merge JSONB preservando siblings)"
  - "Entrada del modulo en docs/analysis/04-estado-actual-plataforma.md"
affects:
  - "Futuros modulos que quieran gating por workspaces.settings JSONB (reusan el patron settingsKey)"
tech-stack:
  added: []
  patterns:
    - "Sidebar NavItem extendido con settingsKey opcional '<namespace>.<key>' — gate generico sobre workspaces.settings JSONB"
    - "Domain layer (src/lib/domain/workspace-settings.ts) como unico punto de mutacion de workspaces.settings (CLAUDE.md Regla 3)"
    - "Merge preserva siblings: spread {...currentRoot, conversation_metrics: merged} para no clobberar hidden_modules/whatsapp_*"
    - "Defaults aplicados server-side: caller puede pasar Partial<MetricsSettings> y la domain function completa con DEFAULT_METRICS_SETTINGS"
    - "Dual-gate admin UI: dashboard abierto a todos, settings page redirige agents a /metricas"
    - "revalidatePath('/', 'layout') tras guardar para refrescar sidebar sin recarga manual"
key-files:
  created:
    - "src/lib/domain/workspace-settings.ts"
    - "src/app/actions/metricas-conversaciones-settings.ts"
    - "src/app/(dashboard)/metricas/settings/page.tsx"
    - "src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx"
  modified:
    - "src/components/layout/sidebar.tsx"
    - "docs/analysis/04-estado-actual-plataforma.md"
decisions:
  - "morfx no tiene rol 'manager' — los roles reales son owner/admin/agent. El check del plan ('manager role') se implemento como owner OR admin, que es el mismo patron usado en src/hooks/use-permissions.ts y el sidebar mismo (isManager = owner || admin)"
  - "Nav item colocado inmediatamente despues de /analytics (ambos son 'dashboards') pero SIN adminOnly — excepcion explicita del modulo segun CONTEXT.md"
  - "settingsKey es un mecanismo generico, NO hardcoded a conversation_metrics. Futuros modulos pueden gated con settingsKey: 'mi_modulo.enabled' sin tocar la logica del sidebar"
  - "Domain function aplica defaults cuando el caller omite campos Y el workspace no tiene valores previos — permite llamadas minimas tipo updateConversationMetricsSettings(ws, { enabled: true }) que siembran el objeto completo"
  - "Validacion reopen_window_days 1-90 en domain (no en server action) — la validacion vive con la mutacion, no con la capa de transporte"
  - "Server action sincroniza state del form desde la respuesta del servidor tras guardar (cubre casos donde el usuario envio un partial y el server completo con defaults)"
  - "toast success incluye hint de 'Recarga la pagina para ver el item en el sidebar' — revalidatePath('/', 'layout') cubre navegaciones, pero no el DOM del sidebar actualmente montado"
  - "Doc de plataforma: nuevo modulo agregado como sub-seccion de '6. Analytics' (no como seccion nueva) para mantener numeracion estable del resto del documento"
metrics:
  duration: "~15min"
  completed: "2026-04-07"
---

# Standalone metricas-conversaciones Plan 05: Sidebar + Settings UI Summary

## Objective Achieved

Modulo /metricas ahora es **discoverable** (aparece en el sidebar cuando esta activo) y **configurable** (owner/admin puede editar `enabled`, `reopen_window_days`, `scheduled_tag_name` desde `/metricas/settings` en lugar de editar JSONB por SQL).

El mecanismo `settingsKey` en `NavItem` es generico y reutilizable: cualquier futuro modulo que quiera gating por `workspaces.settings` JSONB puede sumarse declarando `settingsKey: 'mi_modulo.flag'` sin tocar la logica del sidebar.

## Files Created / Modified

### Created

1. **src/lib/domain/workspace-settings.ts**
   - Export: `updateConversationMetricsSettings(workspaceId, partial)`
   - Merge en 3 niveles: `partial > currentCm > DEFAULT_METRICS_SETTINGS`
   - Valida `enabled: boolean`, `reopen_window_days: 1-90 int`, `scheduled_tag_name: non-empty string`
   - Preserva siblings del JSONB: `{ ...currentRoot, conversation_metrics: merged }`
   - Usa `createAdminClient()` por convencion del domain layer (caller enforza auth/rol)
   - Retorna `SettingsResult<MetricsSettings>` (`{ok: true, settings}` | `{ok: false, error}`)

2. **src/app/actions/metricas-conversaciones-settings.ts**
   - `'use server'` — Next.js server action
   - Export: `updateMetricsSettings(partial)`
   - Lee cookie `morfx_workspace`, valida `auth.getUser()`, chequea rol owner/admin
   - Delega a `updateConversationMetricsSettings` (CLAUDE.md Regla 3)
   - En success revalida `/metricas`, `/metricas/settings` y `/` (layout) para forzar re-render del sidebar en navegaciones siguientes

3. **src/app/(dashboard)/metricas/settings/page.tsx**
   - Server component con `export const dynamic = 'force-dynamic'`
   - Gates: workspace cookie → `/crm/pedidos`, no auth → `/login`, role != owner/admin → `/metricas`
   - Carga settings actuales mergeadas con `DEFAULT_METRICS_SETTINGS`
   - Renderiza `<MetricsSettingsForm initial={current} />`

4. **src/app/(dashboard)/metricas/settings/components/metrics-settings-form.tsx**
   - Client form con `useState` + `useTransition`
   - `Switch` para `enabled`, `Input type="number"` (min=1, max=90) para `reopen_window_days`, `Input type="text"` para `scheduled_tag_name`
   - `handleSave` llama `updateMetricsSettings` dentro de `startTransition`
   - Toast success/error via `sonner` (patron ya establecido en el resto del dashboard)
   - Sincroniza state del form desde `result.settings` post-guardar (cubre defaults aplicados server-side)

### Modified

5. **src/components/layout/sidebar.tsx**
   - Import nuevo: `TrendingUp` de `lucide-react`
   - `NavItem` type extendido con `settingsKey?: string` + JSDoc explicando el formato `'<namespace>.<key>'`
   - Nuevo entry en `navItems`: `{ href: '/metricas', label: 'Metricas', icon: TrendingUp, settingsKey: 'conversation_metrics.enabled' }` — colocado despues de `/analytics`, **sin** `adminOnly`
   - Filter `filteredNavItems` extendido: split del `settingsKey` por `.`, lectura `settings[ns]?.[key]`, oculta el item si falsy
   - Refactor menor: `settings` extraido a variable local para reusarse entre `hiddenModules` y el nuevo gate

6. **docs/analysis/04-estado-actual-plataforma.md**
   - Nueva sub-seccion `#### Metricas de Conversaciones` bajo `### 6. Analytics`
   - Describe estado, tipo (dashboard read-only con realtime hibrido), metricas calculadas, backend (RPC), selector temporal, activacion (flag JSONB), workspaces activos, permisos (dual-gate), sidebar (settingsKey), configuracion editable, key files, bugs, deuda

## Verification

- `npx tsc --noEmit` → sin errores en los 6 archivos (los unicos errores preexistentes del proyecto estan en `src/lib/agents/somnio/__tests__/*`, sin relacion)
- `grep -n "settingsKey" src/components/layout/sidebar.tsx` → 4 matches (JSDoc, type def, nav entry, filter logic)
- `grep -n "'/metricas'" src/components/layout/sidebar.tsx` → 1 match
- Verificado manualmente: el nuevo entry de `/metricas` NO tiene `adminOnly: true` adyacente
- `grep -n "updateConversationMetricsSettings" src/lib/domain/workspace-settings.ts` → 1 match (export)
- `grep -n "updateConversationMetricsSettings" src/app/actions/metricas-conversaciones-settings.ts` → 2 matches (import + call)
- `grep -n "createAdminClient" src/lib/domain/workspace-settings.ts` → 2 matches (import + call) — cumple convencion del domain layer
- `grep -n "Metricas de Conversaciones" docs/analysis/04-estado-actual-plataforma.md` → 1 match
- `grep -n "GoDentist Valoraciones" docs/analysis/04-estado-actual-plataforma.md` → 1 match en la nueva seccion

## Must-Haves Checklist

- [x] Sidebar muestra el item 'Metricas' solo cuando `settings.conversation_metrics.enabled === true`
- [x] Item visible a **todos** los usuarios del workspace (sin `adminOnly`)
- [x] Usuario con rol admin/owner puede editar `reopen_window_days`, `scheduled_tag_name` y `enabled` desde UI
- [x] Settings writes pasan por `src/lib/domain/workspace-settings.ts` (no directo a Supabase)
- [x] Tipos `MetricsSettings` y `DEFAULT_METRICS_SETTINGS` reutilizados del plan 02
- [x] Artifacts creados: `sidebar.tsx` con `settingsKey`, `settings/page.tsx`, `metrics-settings-form.tsx`, action `updateMetricsSettings`, domain `updateConversationMetricsSettings`
- [x] Docs de plataforma actualizada (CLAUDE.md Regla 4)

**Pendiente bootstrap:** activar el flag en GoDentist Valoraciones. Ver seccion "Bootstrap SQL" abajo.

## Commits

- `011bdd7` feat(metricas-05): sidebar settingsKey gate + Metricas nav item
- `04eb7e0` feat(metricas-05): domain workspace-settings + server action
- `c69819b` feat(metricas-05): /metricas/settings admin page + form UI
- `8ce9a9e` docs(metricas-05): documentar modulo Metricas de Conversaciones
- (pendiente) docs(metricas-05): complete sidebar + settings plan (este SUMMARY)

## Deviations from Plan

**1. [Rule 3 - Blocking → resuelto auto] El plan referencia un rol "manager" que no existe en morfx**

- **Encontrado durante:** Task 2 (implementacion del server action)
- **Issue:** El plan decia "A user with manager role can edit..." y `grep -rn "role.*manager" src/` devolvio 0 matches en codigo real. Los roles en morfx son **`owner`, `admin`, `agent`** (confirmado en `src/hooks/use-permissions.ts`, `src/app/actions/task-notes.ts`, y el propio `sidebar.tsx` donde `isManager = role === 'owner' || role === 'admin'`).
- **Fix:** El check del server action y de la settings page usa `role === 'owner' || role === 'admin'`. El plan ya tenia esta misma semantica como fallback (`['manager','owner','admin']`) asi que el comportamiento es identico al intencionado. En morfx, "manager" == "owner OR admin".
- **Files modified:** `src/app/actions/metricas-conversaciones-settings.ts`, `src/app/(dashboard)/metricas/settings/page.tsx`
- **Commits:** `04eb7e0`, `c69819b`

**2. [Nota operacional] No se ejecuto el SQL de bootstrap ni se "activo" el flag en GoDentist Valoraciones desde esta ejecucion**

- **Motivo:** Este agente no tiene acceso a Supabase. El plan explicitamente delegaba esto al usuario o a la UI. Ver seccion "Bootstrap SQL" abajo.
- **Impacto:** El modulo esta **completamente implementado y desplegable**, pero el item del sidebar aparecera en GoDentist Valoraciones solo despues de que alguien corra el SQL de bootstrap O despues de que un admin navegue directamente a `/metricas/settings` (URL directa, sin pasar por sidebar) y active el toggle.

Ninguna deviacion funcional ni arquitectonica del plan.

## Bootstrap SQL (paso manual para el usuario)

El modulo esta **desactivado por defecto** en todos los workspaces. Para activarlo en GoDentist Valoraciones hay **dos caminos**:

**Camino A — Una vez via SQL (recomendado para el primer workspace):**

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{conversation_metrics}',
  '{"enabled": true, "reopen_window_days": 7, "scheduled_tag_name": "VAL"}'::jsonb,
  true
)
WHERE name = 'GoDentist Valoraciones';
```

Despues del UPDATE, cualquier usuario del workspace que recargue veera el item "Metricas" en el sidebar, y los owners/admins podran seguir editando los valores desde `/metricas/settings`.

**Camino B — Via UI (una vez que el usuario conozca la URL):**

Un owner/admin de GoDentist Valoraciones navega directamente a `https://morfx.app/metricas/settings`, activa el toggle "Modulo activo" y guarda. No necesita pasar por el sidebar (el item no aparece hasta que el flag esta activo).

> **Bootstrap problem documentado:** el sidebar es el descubrimiento natural del modulo pero esta gated por el mismo flag que se esta tratando de activar. Por eso la primera activacion de un workspace siempre requiere conocer la URL directa o correr el SQL. Para workspaces adicionales en el futuro, cualquiera de los dos caminos sirve igual.

## Estado final de GoDentist Valoraciones

**No modificado por esta ejecucion** — el SQL de bootstrap queda como paso pendiente para el usuario. Una vez aplicado, el estado del JSONB sera:

```json
{
  "conversation_metrics": {
    "enabled": true,
    "reopen_window_days": 7,
    "scheduled_tag_name": "VAL"
  }
}
```

(mas cualquier otro sibling previo como `hidden_modules`, `whatsapp_*`, etc., preservado por el `COALESCE + jsonb_set`).

## Vercel Deploy

El push de los 4 commits de codigo + este SUMMARY dispara el deploy automatico de Vercel. Tras el deploy:

1. Navegar a `/metricas/settings` como owner/admin de GoDentist Valoraciones → el form carga con defaults (enabled=false, 7, VAL)
2. Toggle enabled → Save → toast success
3. Recargar cualquier pagina → sidebar muestra "Metricas" con el icono `TrendingUp`
4. Click en el nuevo item → dashboard carga con las 3 cards y el chart del plan 03
5. Agent (rol no-admin) debe ver el item en el sidebar y poder abrir `/metricas` pero ser redirigido a `/metricas` cuando intente `/metricas/settings`

## Authentication Gates

Ninguna durante la ejecucion. El push a main fue automatico. La activacion del flag en produccion queda como paso manual del usuario (Supabase SQL o UI), documentada en "Bootstrap SQL" arriba.

## Next Phase Readiness

- Plan 05 es el ultimo del standalone metricas-conversaciones segun el wave graph (wave 4 depende solo de plan 02)
- Plan 04 (realtime hibrido) corre en paralelo a este plan y fue coordinado tocando archivos disjuntos: plan 04 opera sobre `metricas-view.tsx` + `hooks/`, plan 05 opera sobre `sidebar.tsx` + `settings/**` + `domain/workspace-settings.ts` + `actions/metricas-conversaciones-settings.ts` + docs
- Sin blockers
- Concerns:
  - El SQL de bootstrap debe correrse una vez en prod para que GoDentist Valoraciones vea el modulo. Mientras no se corra, el modulo existe pero es invisible en todos los workspaces (no es un bug, es el comportamiento deseado: gate estricto por flag).
  - El sidebar filtra del lado cliente leyendo `currentWorkspace.settings`. Si el `WorkspaceProvider` no refresca `currentWorkspace` tras cambiar settings, el item puede tardar en aparecer hasta la proxima navegacion. El `revalidatePath('/', 'layout')` del server action cubre la mayoria de los casos (el sidebar se re-rendera en la proxima navegacion server-side), pero si el usuario se queda en `/metricas/settings` sin navegar, necesita un refresh manual. Documentado en el toast del form.
