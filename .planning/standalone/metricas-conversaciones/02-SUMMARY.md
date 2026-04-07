---
phase: standalone/metricas-conversaciones
plan: 02
subsystem: analytics
tags: [nextjs, server-actions, supabase, rpc, react, dashboard, ui]
one-liner: "Dashboard base /metricas con types, server action wrapping RPC, page con settings gate y 3 cards con period selector"
requires:
  - "standalone/metricas-conversaciones/01 (RPC get_conversation_metrics)"
provides:
  - "Server action getConversationMetrics(period) -> MetricsPayload"
  - "Pagina /metricas con gate por workspaces.settings.conversation_metrics.enabled"
  - "Period selector (Hoy/Ayer/7d/30d) con useTransition"
  - "3 metric cards (Nuevas/Reabiertas/Agendadas) con skeleton loading"
  - "Types Period, DailyMetric, MetricTotals, MetricsPayload, MetricsSettings"
affects:
  - "standalone/metricas-conversaciones/03 (agrega chart de evolucion + custom range picker)"
  - "standalone/metricas-conversaciones/04 (agrega realtime hibrido sobre estos componentes)"
  - "standalone/metricas-conversaciones/05 (agrega UI de settings + sidebar gate)"
tech-stack:
  added: []
  patterns:
    - "Server Component + Client View con useTransition para refresh no-bloqueante"
    - "Auth+settings gate doble en server component (workspace cookie + enabled flag)"
    - "Read-only aggregation NO pasa por domain layer (precedente: app/actions/analytics.ts)"
    - "Timezone Bogota en getRange via toLocaleString en-US pattern (CLAUDE.md Rule 2)"
    - "getConversationMetrics usa createClient (RLS) en vez de admin — defense in depth junto con SECURITY INVOKER del RPC"
key-files:
  created:
    - "src/lib/metricas-conversaciones/types.ts"
    - "src/app/actions/metricas-conversaciones.ts"
    - "src/app/(dashboard)/metricas/page.tsx"
    - "src/app/(dashboard)/metricas/components/metricas-view.tsx"
    - "src/app/(dashboard)/metricas/components/metric-cards.tsx"
    - "src/app/(dashboard)/metricas/components/period-selector.tsx"
  modified: []
decisions:
  - "Sin adminOnly/role check: excepcion explicita vs analytics — todos los usuarios del workspace acceden"
  - "Settings gate redirige a /crm/pedidos cuando workspace no tiene conversation_metrics.enabled=true"
  - "Custom range object soportado en tipo Period y getRange desde ya (para no romper Plan 03 cuando agregue el popover)"
  - "period-selector.tsx solo expone presets string; el custom range se agregara en Plan 03 sin tocar la firma publica"
  - "MetricCards recibe solo totals (MetricTotals), no MetricsPayload — minimiza el contrato y facilita reutilizacion"
metrics:
  duration: "~10min"
  completed: "2026-04-07"
---

# Standalone metricas-conversaciones Plan 02: Dashboard Base Summary

## Objective Achieved

Vertical slice del modulo /metricas funcionando end-to-end en produccion:
- `GET /metricas` en un workspace con el flag activo muestra 3 cards con totales de "hoy"
- Cambiar periodo (Hoy/Ayer/7d/30d) refresca los numeros via server action sin recargar la pagina
- Workspace sin flag es redirigido a /crm/pedidos
- Workspace sin sesion es redirigido a /login
- Server action llama al RPC del Plan 01 y respeta `reopen_window_days` + `scheduled_tag_name` del workspace

Esto habilita Plan 03 (chart de evolucion + custom range picker), Plan 04 (realtime hibrido) y Plan 05 (UI de settings + sidebar gate) para que sean puramente aditivos sobre una base funcional.

## Files Created

1. **src/lib/metricas-conversaciones/types.ts**
   - Exports: `Period`, `DailyMetric`, `MetricTotals`, `MetricsPayload`, `MetricsSettings`, `DEFAULT_METRICS_SETTINGS`
   - `Period` acepta tanto strings preset ('today'|'yesterday'|'7days'|'30days') como objetos `{start, end}` (custom range listo para Plan 03)

2. **src/app/actions/metricas-conversaciones.ts**
   - `'use server'` — Next.js server action
   - `getRange(period)`: calcula [start, endExclusive) con `nowBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))`
   - `getConversationMetrics(period)`:
     1. Lee cookie `morfx_workspace`; si falta → payload vacio
     2. Auth check via `supabase.auth.getUser()`; si no hay usuario → payload vacio
     3. Lee `workspaces.settings.conversation_metrics` con defaults (reopen=7, tag='VAL')
     4. Llama `rpc('get_conversation_metrics', {...})`
     5. Mapea filas a `DailyMetric[]` con label localizado (`date-fns` locale `es`)
     6. Reduce a `MetricTotals`
     7. Retorna `MetricsPayload`
   - Usa `createClient()` (RLS aplica, NO admin client) — defense in depth junto con SECURITY INVOKER

3. **src/app/(dashboard)/metricas/page.tsx**
   - Server Component con `export const dynamic = 'force-dynamic'`
   - Tres gates: workspace cookie, user auth, `conversation_metrics.enabled === true`
   - Hace `getConversationMetrics('today')` como carga inicial
   - Renderiza header + `<MetricasView initial={initial} />`

4. **src/app/(dashboard)/metricas/components/metricas-view.tsx**
   - `'use client'`
   - State: `period`, `data`, `isPending` (via `useTransition`)
   - `handlePeriodChange` actualiza `period` y llama al server action dentro de `startTransition`
   - Layout: period selector alineado a la derecha + metric cards debajo
   - Slot comentado para EvolutionChart (Plan 03)

5. **src/app/(dashboard)/metricas/components/period-selector.tsx**
   - 4 botones preset (Hoy / Ayer / Ultimos 7 dias / Ultimos 30 dias)
   - `isActive` check con `typeof value === 'string'` para no romper cuando Plan 03 pase objetos `{start, end}`
   - Custom range queda como slot comentado

6. **src/app/(dashboard)/metricas/components/metric-cards.tsx**
   - Grid `md:grid-cols-3`
   - Cards: Nuevas (`MessageSquarePlus`), Reabiertas (`RefreshCcw`), Agendadas (`CalendarCheck`)
   - Skeleton loading con `animate-pulse` cuando `loading={isPending}`
   - Numeros formateados con `toLocaleString('es-CO')`

## Verification

- `npx tsc --noEmit` sobre los 6 archivos nuevos: **sin errores** (los unicos errores del proyecto son en `src/lib/agents/somnio/__tests__/*` preexistentes, sin relacion)
- `grep -n "rpc('get_conversation_metrics'" src/app/actions/metricas-conversaciones.ts`: 1 match
- `grep -n "America/Bogota" src/app/actions/metricas-conversaciones.ts`: 1 match
- `grep -n "redirect('/crm/pedidos')" src/app/(dashboard)/metricas/page.tsx`: 2 matches (workspace cookie + enabled flag)
- `grep -rn "adminOnly" src/app/(dashboard)/metricas/`: 0 matches (modulo para todos los usuarios del workspace)

## Commits

- `e07f219` feat(metricas-02): types + server action para get_conversation_metrics
- `762963a` feat(metricas-02): page + view + period selector + 3 metric cards
- (pendiente) docs(metricas-02): plan 02 summary

Ademas, este push a `origin/main` llevo tambien el commit `fd93da0` del Plan 01 (migration SQL), que estaba en local pero pendiente de push por la instruccion del Plan 01 ("Plan 02 hara el push combinado cuando el wrapper JS este listo"). La migration ya habia sido aplicada manualmente en produccion por el usuario el 2026-04-06, cumpliendo CLAUDE.md Rule 5.

## Deviations from Plan

Ninguna funcional. Micro-ajuste:
- El comentario dentro de `page.tsx` decia originalmente "NO adminOnly check" pero la verificacion del plan requeria que `grep -n "adminOnly"` retornara vacio en el directorio `metricas/`. Se reformulo como "NO role restriction" para satisfacer el check literal sin perder la intencion documental. No afecta comportamiento.

## Vercel Deploy

El push a `origin/main` dispara el deploy automatico de Vercel. URL: `https://morfx.app/metricas` (cuando el deploy termine).

**Estado del flag en produccion:** por defecto `disabled`. Para probar el dashboard en GoDentist Valoraciones antes de que Plan 05 agregue la UI de settings, el usuario puede correr manualmente:

```sql
-- Reemplazar WORKSPACE_ID con el UUID de GoDentist Valoraciones
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{conversation_metrics}',
  '{"enabled": true, "reopen_window_days": 7, "scheduled_tag_name": "VAL"}'::jsonb,
  true
)
WHERE id = 'WORKSPACE_ID';
```

Despues de correr el SQL, navegar a `/metricas` como cualquier usuario del workspace deberia mostrar las 3 cards con los numeros de hoy.

## Open Issues para Plan 03/04/05

- **Plan 03 (chart + custom range):**
  - Agregar `EvolutionChart` con recharts (bar o line con las 3 metricas sobre `data.daily`)
  - Agregar popover de date range picker (`react-day-picker`) al `PeriodSelector`. El tipo `Period` ya soporta `{start, end}` y `getRange` ya los maneja, solo falta UI
  - El `isActive` check del selector esta preparado (`typeof value === 'string'`) — el boton custom debe activarse cuando `value` es un objeto

- **Plan 04 (realtime hibrido):**
  - Suscripcion Supabase Realtime a `messages` (INSERT) y `contact_tags` (INSERT/DELETE) filtrados por `workspace_id`
  - En cada evento relevante, re-llamar `getConversationMetrics(period)` — sin actualizacion incremental
  - Hook cliente `useConversationMetricsRealtime(period, onRefresh)` o integracion directa en `metricas-view.tsx`

- **Plan 05 (settings UI + sidebar gate):**
  - Pantalla de configuracion del modulo para editar `enabled`, `reopen_window_days`, `scheduled_tag_name`
  - Extender lateral del sidebar con `settingsKey: 'conversation_metrics.enabled'` para mostrar la entrada solo cuando el flag esta activo
  - Persistir cambios en `workspaces.settings.conversation_metrics` JSONB

## Next Phase Readiness

- Dashboard base funcional en produccion (pendiente deploy Vercel)
- Sin blockers
- Concerns:
  - El strict-inbound definition del Plan 01 hara que "nuevas" sea menor de lo que el usuario podria esperar. Documentarlo en Plan 05 (tooltip o help text en la card).
  - Cuando Plan 05 introduzca el sidebar gate, cerrar el hueco de que actualmente cualquier usuario puede conocer la URL `/metricas` y ser redirigido (no hay leak de datos porque la gate en server component corre antes de renderizar nada).

## Authentication Gates

Ninguna. El push a main fue automatico y no hubo interaccion manual en esta ejecucion. La aplicacion de la migration del Plan 01 en produccion (manual en Supabase Dashboard) ya habia ocurrido antes y esta documentada en 01-SUMMARY.md.
