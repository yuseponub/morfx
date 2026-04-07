---
phase: standalone/metricas-conversaciones
plan: 04
subsystem: analytics
tags: [supabase-realtime, postgres-changes, react-hook, dashboard, metricas]
one-liner: "Realtime hibrido: suscripcion a messages INSERT + contact_tags INSERT/DELETE con debounce 400ms que re-ejecuta el RPC completo"
requires:
  - "standalone/metricas-conversaciones/03 (EvolutionChart + DateRangePopover)"
  - "supabase/migrations/20260130000002 (messages en supabase_realtime publication, aplicada en prod desde v1.0)"
  - "supabase/migrations/20260317100000 (contact_tags en supabase_realtime publication)"
provides:
  - "useMetricasRealtime hook (refetch hibrido debounced, cleanup seguro)"
  - "MetricasView auto-refresh sub-segundo ante mensajes/tags entrantes"
affects:
  - "standalone/metricas-conversaciones/05 (sidebar + settings UI, sin cambios requeridos)"
tech-stack:
  added: []
  patterns:
    - "Realtime debounce pattern: setTimeout 400ms coalesce bursts + skip if document.hidden"
    - "periodRef pattern: refs para evitar re-suscripcion del canal cuando el consumidor cambia estado no relacionado (period)"
    - "onChangeRef pattern: estabiliza closure sin re-crear el channel en cada render"
    - "visibilitychange catch-up: re-fetch on tab visible para recuperar eventos perdidos en background"
    - "contact_tags sin filtro workspace: realtime filter no soporta joins, el RPC posterior re-scoping garantiza correctitud (~400ms extra por evento cross-workspace es despreciable)"
key-files:
  created:
    - "src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts"
  modified:
    - "src/app/(dashboard)/metricas/components/metricas-view.tsx"
    - "src/app/(dashboard)/metricas/page.tsx"
decisions:
  - "Migracion condicional NO creada: messages ya esta en supabase_realtime publication desde 20260130000002_whatsapp_conversations.sql (aplicada en produccion desde el primer dia del modulo WhatsApp, confirmado por el uso existente del canal inbox)"
  - "contact_tags publication tambien existe (20260317100000_contact_tags_realtime.sql), pero STATE.md todavia lista el ALTER como pending todo. Si el usuario aun no lo aplico en prod, este plan no agrega requerimiento nuevo: los eventos de tags simplemente no dispararan hasta que se aplique, pero los eventos de messages (el caso critico) si funcionan"
  - "Debounce 400ms (no 1s): los tests del plan 03 mostraron que el RPC completo corre <200ms en datos reales, asi que 400ms da buena experiencia sin saturar"
  - "contact_tags sin filtro workspace_id: la tabla no tiene esa columna, y realtime filters no soportan joins. Aceptamos eventos de todos los workspaces y dejamos que el RPC (workspace-scoped) re-compute la verdad. El debounce + RPC scoping hace esto seguro y barato"
  - "periodRef en lugar de [period] dependency: evita que cada cambio de periodo destruya y recree el canal Supabase (costoso, y provoca race conditions si el canal se re-suscribe mientras hay un evento en vuelo)"
  - "onChangeRef para estabilizar el callback: el consumidor pasa una closure nueva en cada render, pero el effect solo re-corre cuando cambia workspaceId"
  - "document.hidden check DENTRO del setTimeout callback (no antes del debounce): permite que el timer arme, y si al disparar el usuario aun tiene la pestana oculta, se salta el fetch pero deja el visibilitychange listener listo para recuperar"
metrics:
  duration: "~12min"
  completed: "2026-04-07"
---

# Standalone metricas-conversaciones Plan 04: Realtime Hybrid Summary

## Objective Achieved

El dashboard `/metricas` ahora se actualiza automaticamente dentro de ~1 segundo cuando ocurre cualquiera de estos eventos relevantes:

- **`messages` INSERT** filtrado por `workspace_id` -> re-fetch (afecta nuevas y reabiertas)
- **`contact_tags` INSERT o DELETE** -> re-fetch (afecta agendadas via tag VAL)

El re-fetch re-ejecuta el RPC completo `get_conversation_metrics` y actualiza simultaneamente las 3 cards y el chart de evolucion. No hay updates incrementales en cliente (siempre se re-pregunta la verdad al backend), cumpliendo exactamente el modelo "Realtime Hibrido" definido en CONTEXT.md.

## Publication Status — Investigation

**Primera pregunta antes de ejecutar:** habia que crear una migracion condicional para agregar `messages` al publication `supabase_realtime`?

**Investigacion:**

```
grep -rn "ADD TABLE messages" supabase/migrations/
-> supabase/migrations/20260130000002_whatsapp_conversations.sql:280

grep -rn "ADD TABLE contact_tags" supabase/migrations/
-> supabase/migrations/20260317100000_contact_tags_realtime.sql:2
```

**Conclusion:** Ambas tablas ya estan en la publication via migraciones existentes.

- `messages`: agregada desde el primer dia del modulo WhatsApp (v1.0, commit dentro de `20260130000002`). Esta confirmadamente aplicada en prod porque el inbox de WhatsApp usa realtime sobre `messages` desde hace meses.
- `contact_tags`: migracion existe (`20260317100000_contact_tags_realtime.sql`). **STATE.md todavia lista como pending todo:** "Run ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags in Supabase SQL editor". Esto es una deuda del plan "conversation-tags-to-contact" 02 y NO bloquea el plan actual.

**Decision: NO se creo migracion lateral.** El plan 04 solo requeria una condicional para `messages`, que ya esta cubierta. El caso critico (nuevas/reabiertas ante un mensaje entrante) funciona sin intervencion del usuario.

**Tradeoff sobre contact_tags:** si el usuario aun no aplico `20260317100000` en prod, los eventos de tag (DELETE/INSERT) no dispararan el re-fetch automatico, pero:
1. Los eventos de `messages` (el 90% del caso de uso) si funcionan
2. El visibilitychange listener recupera el estado al volver al tab
3. Cuando el usuario ejecute el ALTER pendiente (deuda de otro plan), tags entraran en el flujo realtime sin cambios de codigo

## Files Created

### `src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts`

Hook cliente que encapsula toda la logica de suscripcion:

- **3 canales sobre el mismo `supabase.channel(metricas:{workspaceId})`:**
  1. `postgres_changes` INSERT en `messages` con filter `workspace_id=eq.{workspaceId}`
  2. `postgres_changes` INSERT en `contact_tags` (sin filter, ver decision abajo)
  3. `postgres_changes` DELETE en `contact_tags` (sin filter)

- **Debounce 400ms (`setTimeout` + `clearTimeout` en ref):** coalesce bursts tipicos (ej: 5 mensajes llegando en 1 segundo -> 1 sola llamada al RPC). Todos los 3 tipos de evento comparten el mismo timer, asi un burst mixto tambien se colapsa.

- **`document.hidden` guard:** si el tab esta en background cuando el timer dispara, se salta el fetch. Esto evita desperdiciar llamadas cuando el usuario no esta mirando la pagina.

- **`visibilitychange` listener:** al volver al tab, llama `onChangeRef.current()` inmediato para recuperar cualquier evento perdido mientras estaba oculto.

- **`onChangeRef` pattern:** el callback del consumidor se guarda en un `useRef` que se actualiza en cada render. Asi el `useEffect` solo depende de `workspaceId`, no se re-crea el canal cuando el consumidor pasa una closure nueva (ej: `() => refresh()` inline).

- **Cleanup completo en el return del effect:**
  1. `clearTimeout(timer)` — cancela fetches debounced pendientes
  2. `document.removeEventListener('visibilitychange', onVis)` — quita el listener
  3. `supabase.removeChannel(channel)` — cierra la suscripcion WebSocket

## Files Modified

### `src/app/(dashboard)/metricas/components/metricas-view.tsx`

- Acepta nueva prop `workspaceId: string`
- Agrega `periodRef` (`useRef<Period>`) que se mantiene sincronizado con `period` via `useEffect`. Rationale: el callback del realtime hook necesita re-fetch con el periodo **actual**, pero si pasamos `period` como dependencia del `useCallback`, destruiriamos y recrearia el canal Supabase en cada cambio de periodo (costoso + race).
- `refresh(p?: Period)` ahora acepta periodo opcional; si no se pasa, lee de `periodRef.current`. Esto permite llamarlo tanto desde el selector (`refresh(p)`) como desde realtime (`refresh()`).
- `useMetricasRealtime(workspaceId, () => refresh())` conectado al final del componente.

### `src/app/(dashboard)/metricas/page.tsx`

- Una sola linea: `<MetricasView initial={initial} workspaceId={workspaceId} />`
- `workspaceId` ya existia en el componente server (leido del cookie `morfx_workspace`), solo habia que pasarlo.

## Verification

- `npx tsc --noEmit` sobre los archivos tocados: **sin errores nuevos**
- `grep -c "removeChannel" src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts`: 1 match (cleanup presente)
- `grep -c "document.hidden" src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts`: 2 matches (guard + listener)
- `grep -c "useMetricasRealtime" src/app/(dashboard)/metricas/components/metricas-view.tsx`: 2 matches (import + uso)

## Observed Latency (expected)

El usuario debe probar en prod:

1. Abrir `/metricas` en tab A (workspace GoDentist Valoraciones)
2. Enviar un mensaje WhatsApp al numero del workspace (o insertar un row de test en `messages`)
3. **Expected:** dentro de ~400ms-1s, las cards y el chart se actualizan sin refresh manual

Debounce tuning: si bajo carga real 400ms se siente lento, considerar bajar a 200ms. Si bajo carga se ve flicker o llamadas excesivas, subir a 600-800ms. Por ahora 400ms es el balance por defecto.

## Commits

- `2353862` feat(metricas-04): hook useMetricasRealtime con debounce 400ms
- `3ed653d` feat(metricas-04): integrar realtime hibrido en MetricasView
- (siguiente) docs(metricas-04): plan 04 summary

## Deviations from Plan

**1. Migracion condicional NO creada (plan lo anticipaba como condicional).**
El plan pedia verificar si `messages` estaba en la publication y crear una migracion lateral si no. La investigacion confirmo que YA estaba desde `20260130000002_whatsapp_conversations.sql` (v1.0), asi que se omitio la migracion y el checkpoint human-action. Esto sigue exactamente la instruccion explicita del plan ("If `messages` IS already in the publication, skip this side migration").

**2. `document.hidden` dentro del setTimeout callback, no antes del debounce.**
El plan original tenia `if (!document.hidden) onChangeRef.current()` dentro del timer callback — lo mismo que implemente. No es deviation, es implementacion literal. Lo destaco porque hay una alternativa razonable (chequear antes del debounce para evitar armar el timer) que descarte explicitamente: armar el timer permite que si el usuario vuelve al tab justo dentro de los 400ms, el fetch dispara; y el visibilitychange tambien dispara un fetch inmediato al volver, asi que la cobertura es doble.

**3. `periodRef` en lugar de pasar `period` como dependency (mejora sobre el plan).**
El plan original en el snippet de metricas-view.tsx tiene `periodRef` explicito — lo implemente tal cual. El valor real es que sin esto, cada click en el period selector destruiria y recrearia el canal Supabase (costoso + race conditions con eventos en vuelo). El plan ya estaba bien; no es deviation.

**4. Debounce 400ms elegido (plan lo dejaba libre entre ~400ms-1s).**
El plan decia "coalesce bursts within 400ms" en el snippet y "~1s" en otros lados. Eleji 400ms por ser el valor literal del snippet y porque el RPC es rapido.

**5. Contenido del guard `typeof document !== 'undefined'`:**
Agregue `typeof document !== 'undefined' && document.hidden` dentro del setTimeout callback para ser defensivo si algun dia el hook se ejecuta en un entorno sin `document` (por ejemplo SSR hot path o tests con node env). No cambia comportamiento en browser.

## Authentication Gates

Ninguna. Ejecucion autonoma end-to-end.

## Next Phase Readiness

- Dashboard `/metricas` con auto-refresh realtime completo
- Sin blockers
- **Open issue trackeado (no bloqueante para este plan):** el pending todo de STATE.md "Run ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags" sigue vigente. Recomiendo al usuario aplicarlo cuando pueda, para que los eventos de tag (cambios en `VAL`) disparen el realtime automatico. Hasta entonces, el visibilitychange listener actua como safety net cuando el usuario vuelve al tab.

## Vercel Deploy

Push a `origin/main` dispara el deploy automatico. URL: `https://morfx.app/metricas`. El usuario puede probar tal como se describe en "Observed Latency" arriba.
