---
phase: standalone/metricas-conversaciones
plan: 03
subsystem: analytics
tags: [nextjs, react, recharts, react-day-picker, dashboard, ui, shadcn]
one-liner: "Evolution chart (recharts LineChart 3 series) + custom date range popover (react-day-picker via shadcn Calendar wrapper) on /metricas"
requires:
  - "standalone/metricas-conversaciones/02 (dashboard base con metricas-view + period-selector + server action)"
provides:
  - "EvolutionChart component (recharts LineChart con 3 lineas: nuevas/reabiertas/agendadas)"
  - "DateRangePopover component (Calendar mode=range dentro de Popover)"
  - "PeriodSelector integrado con rango custom: cuando value es {start,end} los presets quedan inactivos y el boton del popover se marca como default"
  - "Validacion end >= start en el picker (boton Aplicar deshabilitado si es invalido)"
affects:
  - "standalone/metricas-conversaciones/04 (realtime hibrido refrescara cards + chart juntos)"
  - "standalone/metricas-conversaciones/05 (UI de settings + sidebar gate)"
tech-stack:
  added: []
  patterns:
    - "Recharts LineChart con 3 lineas monotone (nuevas=#6366f1, reabiertas=#f59e0b, agendadas=#10b981) + Legend + Tooltip themed"
    - "shadcn Calendar wrapper (src/components/ui/calendar.tsx) ya soportaba mode=range via pass-through a react-day-picker v9.x — se reutilizo sin cambios"
    - "Draft state en DateRangePopover: seed desde committed value al abrir, reset en cancel, commit solo en Aplicar"
    - "Period selector: isActive check con typeof value === 'string' (ya preparado desde Plan 02)"
key-files:
  created:
    - "src/app/(dashboard)/metricas/components/evolution-chart.tsx"
    - "src/app/(dashboard)/metricas/components/date-range-popover.tsx"
  modified:
    - "src/app/(dashboard)/metricas/components/metricas-view.tsx"
    - "src/app/(dashboard)/metricas/components/period-selector.tsx"
decisions:
  - "Reutilizar el wrapper existente @/components/ui/calendar (DayPicker v9 con classNames shadcn). No se importo DayPicker directo ni se agrego CSS global"
  - "DateRange value shape = {start: ISO YYYY-MM-DD, end: ISO YYYY-MM-DD} — alineado con Period object form aceptado por getRange() desde Plan 02"
  - "Draft se reinicia cada vez que se abre el popover (evita que un usuario que cancelo vea el draft viejo la proxima vez)"
  - "Colores de lineas hardcoded (indigo/amber/emerald) en lugar de usar CSS vars del theme — garantiza legibilidad en 3 series distintas sin depender del theme config"
  - "Task 3 del plan proponia un solo commit combinado, pero se ejecutaron commits atomicos por task siguiendo la instruccion del orquestador"
metrics:
  duration: "~8min"
  completed: "2026-04-07"
---

# Standalone metricas-conversaciones Plan 03: Chart + Date Range Summary

## Objective Achieved

El dashboard `/metricas` ahora muestra:
1. **3 cards** con totales (del Plan 02)
2. **Chart de evolucion** con 3 lineas (nuevas, reabiertas, agendadas) debajo de las cards
3. **Period selector** con 4 presets + un **rango custom** que abre un popover con calendario de 2 meses

Cambiar cualquier preset o elegir un rango custom refresca tanto las cards como el chart via la misma server action (`getConversationMetrics`). El tipo `Period` ya aceptaba `{start, end}` desde Plan 02, por lo que esta fase es puramente aditiva en UI.

## Files Created

1. **src/app/(dashboard)/metricas/components/evolution-chart.tsx**
   - `'use client'`
   - Recibe `data: DailyMetric[]` y `loading?: boolean`
   - `ResponsiveContainer` + `LineChart` con 3 `Line` (monotone, strokeWidth=2, dot=false, activeDot r=4)
   - Colores: nuevas `#6366f1`, reabiertas `#f59e0b`, agendadas `#10b981`
   - XAxis usa `dataKey="label"` (ej "lun 6") — la label viene pre-formateada con date-fns locale `es` desde la server action
   - YAxis con `allowDecimals={false}`
   - Tooltip con styling themed (`hsl(var(--background))`, border, borderRadius)
   - Skeleton loading con `animate-pulse` cuando `loading=true`
   - Empty state "Sin datos en el periodo seleccionado." cuando `data.length === 0`
   - Altura fija `h-[320px]`

2. **src/app/(dashboard)/metricas/components/date-range-popover.tsx**
   - `'use client'`
   - Exporta `DateRangeValue = { start: string; end: string }` (ISO `YYYY-MM-DD`)
   - Props: `value: DateRangeValue | null`, `onChange: (range) => void`, `disabled?`
   - Usa `@/components/ui/popover` (radix) + `@/components/ui/calendar` (wrapper shadcn de `react-day-picker`)
   - `Calendar mode="range"` con `numberOfMonths={2}`, `locale={es}`, `initialFocus`
   - Draft state (`useState<DateRange | undefined>`): seed desde `value` al abrir el popover
   - Boton Aplicar deshabilitado si `!from || !to || to < from` (validacion end >= start)
   - Boton Cancelar resetea draft al committed value y cierra el popover
   - Label del trigger: `"{d MMM} - {d MMM}"` cuando hay value, `"Rango personalizado"` cuando no
   - Variant `default` cuando hay rango activo, `outline` cuando no

## Files Modified

3. **src/app/(dashboard)/metricas/components/metricas-view.tsx**
   - Import de `EvolutionChart`
   - Se renderiza `<EvolutionChart data={data.daily} loading={isPending} />` debajo de `<MetricCards>`
   - Reemplazo el slot comentado `{/* EvolutionChart added in Plan 03 */}`

4. **src/app/(dashboard)/metricas/components/period-selector.tsx**
   - Import de `DateRangePopover` + type `DateRangeValue`
   - Layout cambio a `flex flex-wrap items-center gap-2` para alojar los presets + el popover juntos
   - `customRange` derivado con `typeof value === 'object' ? value : null`
   - `<DateRangePopover value={customRange} onChange={(r) => onChange(r)} disabled={disabled} />`
   - Los presets siguen con el check `typeof value === 'string' && value === preset.value` — cuando hay rango custom, ningun preset queda marcado (comportamiento esperado)

## Verification

- `npx tsc --noEmit` sobre los 4 archivos tocados: **sin errores** (los unicos errores del proyecto son en `src/lib/agents/somnio/__tests__/*` preexistentes, sin relacion con este plan)
- `grep -n "DateRangePopover" src/app/(dashboard)/metricas/components/period-selector.tsx`: 2 matches (import + uso)
- `grep -n 'mode="range"' src/app/(dashboard)/metricas/components/date-range-popover.tsx`: 1 match
- `grep -n "EvolutionChart" src/app/(dashboard)/metricas/components/metricas-view.tsx`: 2 matches (import + uso)
- `grep -n "ResponsiveContainer" src/app/(dashboard)/metricas/components/evolution-chart.tsx`: 2 matches (import + tag de apertura/cierre)

## Notes on Calendar Wrapper

**Morfx YA tenia un wrapper Calendar:** `src/components/ui/calendar.tsx`. Es un wrap de `react-day-picker` v9.x con classNames shadcn (range_start, range_end, range_middle, selected, today, etc.). Soporta `mode="range"` via pass-through (`...props`), por lo que no hubo que agregar CSS global ni importar `react-day-picker/dist/style.css`.

El wrapper ya se usaba en 3 archivos con `mode="single"` (`order-form.tsx`, `create-task-button.tsx`, `task-form.tsx`), pero este plan es el **primer uso en modo range** dentro del proyecto. El wrapper funciona correctamente en modo range porque los classNames `range_start/range_middle/range_end` ya estaban definidos.

Cero dependencias nuevas: `recharts`, `react-day-picker`, `date-fns` y `@radix-ui/react-popover` ya estaban instalados desde fases anteriores.

## Commits

- `d5c171f` feat(metricas-03): EvolutionChart recharts con 3 lineas
- `3dddd60` feat(metricas-03): date range popover + integracion en period selector
- (siguiente) docs(metricas-03): plan 03 summary

## Deviations from Plan

Ninguna arquitectural. Micro-ajustes:

1. **Colores de tooltip:** El plan no especificaba estilos para `Tooltip`; agregue `contentStyle` con variables del theme (`hsl(var(--background))`, border, borderRadius) para que el tooltip no se vea default blanco en dark mode.

2. **Draft state reset en `onOpenChange`:** El plan no especificaba que pasa con el draft si el usuario abre/cierra sin aplicar. Implemente que el draft se reinicie desde el committed `value` cada vez que se abre el popover. Esto es mas intuitivo que mantener un draft huerfano entre aperturas.

3. **Task 3 split en commits atomicos:** El plan original proponia un solo commit combinado para las 4 archivos. Se ejecutaron 2 commits atomicos (uno por task logico) siguiendo la instruccion del orquestador de "atomic per-task commits". Esto facilita git blame y revert granular.

4. **`canApply` derivado:** Agregue una variable `canApply` separada para el check de validez, en lugar de inline en el `disabled` del boton Aplicar. Mas legible y evita duplicacion con `handleApply`.

## Success Criteria

- [x] `/metricas` muestra cards + chart
- [x] Cambiar presets refresca ambos (ya funcionaba desde Plan 02 para cards; ahora tambien para chart via data.daily)
- [x] Rango custom con start/end valido dispara la server action con shape `{start, end}`
- [x] Rango con end < start es rechazado (boton Aplicar disabled)
- [x] TypeScript compila sin errores nuevos

## Vercel Deploy

Push a `origin/main` dispara el deploy automatico. URL: `https://morfx.app/metricas`. El usuario puede probar:

1. Navegar a `/metricas` (requiere `workspaces.settings.conversation_metrics.enabled=true` en el workspace actual — ver instrucciones en 02-SUMMARY.md para setearlo via SQL mientras Plan 05 no exista)
2. Ver las 3 cards + el chart de evolucion debajo
3. Cambiar periodo con los presets (Hoy / Ayer / 7d / 30d) — ambos elementos se refrescan
4. Clickear el boton "Rango personalizado", elegir 2 fechas en el calendario de 2 meses, clickear Aplicar
5. Verificar que el boton del popover se marca como `default` (con color primary) y los presets quedan todos inactivos
6. Verificar que intentar seleccionar end < start resulta en boton Aplicar deshabilitado

## Open Issues para Plan 04/05

- **Plan 04 (realtime hibrido):** Las suscripciones a `messages` y `contact_tags` deberan llamar a `refresh(period)` que ya existe en `metricas-view.tsx`. Dado que el chart recibe `data.daily` desde el mismo `MetricsPayload`, el refresh automaticamente actualiza ambos.
- **Plan 05 (settings UI + sidebar gate):** Sin cambios necesarios en el picker.

## Next Phase Readiness

- Dashboard con visualizacion completa en produccion (pendiente deploy Vercel)
- Sin blockers
- Concerns:
  - La altura fija del chart (`h-[320px]`) podria ser chica en pantallas grandes. Plan 04 o Plan 05 podrian evaluar hacerlo responsive con `aspect-ratio` o `h-[40vh]`.
  - El `initialFocus` en Calendar puede generar warning de accesibilidad en react-day-picker v9+ (deprecado en algunas versiones). No se observo warning en tsc; si aparece en runtime se removera en un fix menor.

## Authentication Gates

Ninguna. Ejecucion autonoma end-to-end.
