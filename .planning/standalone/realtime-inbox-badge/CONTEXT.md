# Standalone: Realtime Inbox Badge / Reconnection Reliability — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning (research = `.planning/debug/realtime-inbox-badge.md`, diagnose-complete + prod-verified)
**Origin:** Bug productivo reportado por usuario — "el inbox/badge a veces no se actualiza en tiempo real y toca recargar la pagina". Diagnosticado via `/gsd-debug` (sesion `realtime-inbox-badge`, diagnose-complete 2026-06-03). Root cause 100% client-side confirmado; DB verificada en prod (V1-V4 limpias, cero correctivos).

<domain>
## Phase Boundary

Hacer que el realtime del inbox (badge / `unread_count` / preview / orden de conversaciones) **y** del chat **NUNCA** se quede pegado sin auto-recuperarse. Hoy el WebSocket de Supabase Realtime puede morir **en silencio** (sigue reportando `SUBSCRIBED` del lado cliente) y la unica cura es un reload manual.

El fix es **estructural por capas**, no parches:

1. **Capa 1 — `realtime.setAuth()` en refresh de JWT (causa principal, 2a).** El JWT del socket expira (~1h); `@supabase/ssr` refresca el token para HTTP/PostgREST pero NO re-inyecta el token nuevo en el socket de Realtime. Tras la expiracion, el server deja caer en silencio los eventos `postgres_changes` filtrados por RLS (las policies usan `is_workspace_member(...)` que evalua el JWT — confirmado en V3). Requiere un **cliente browser singleton** para que un solo punto de `setAuth` afecte a todos los sockets de los hooks.
2. **Capa 2 — Hook compartido `useRealtimeReconnect` (2b + 2c + 2d).** Escucha `visibilitychange` (volver de tab dormido) y `online` (recuperar red) y dispara re-sincronizacion de cada consumidor (`softRefetch` del chat + `fetchConversations` del inbox). Cubre el agujero 2d: el socket muerto-en-`SUBSCRIBED` no transiciona de status, asi que la auto-cura existente (`previousStatus !== 'SUBSCRIBED' → SUBSCRIBED`) nunca dispara.
3. **Capa 3 — Watchdog de staleness (defensa en profundidad para "NUNCA falle").** Timer ligero que, si la tab esta visible y el canal lleva > N seg sin actividad, dispara un re-sync barato. Safety net por si `setAuth` fallara.

**Fuera de scope:**
- **Capa 4 (deuda separada):** limpiar el doble UPDATE de `receiveMessage` (`src/lib/domain/messages.ts:428-437`). NO es causal del bug; es deuda. Mini-plan propio despues, fuera de este standalone.
- Tocar el listener de `contact_tags` (regresion de `f57386ef` — Problema 1 ya resuelto en marzo, `contact_tags` sigue en la publicacion confirmado en V1). NO TOCAR.
- Re-aplicar la migracion `20260317100000` (V1 confirmo que `contact_tags` ya esta en la publicacion).
- Cambiar el comportamiento de los agentes (esto es infra de frontend, no agentes — Regla 6 no aplica directamente, pero ver D-13 rollout).
- Rediseno del filtro RLS role-based de `conversations` (hallazgo V3, comportamiento correcto, no bug).

</domain>

<decisions>
## Implementation Decisions

> Origen: diagnostico `/gsd-debug` + verificacion prod. El usuario delega lo tecnico a Claude (rol builder) con mandato "que NUNCA falle de actualizarse en tiempo real" + Regla 0 (calidad sobre velocidad). Decisiones marcadas (Claude's Discretion) salvo donde el usuario dio direccion explicita.

### Scope y estrategia

- **D-01:** Alcance = Capas 1+2+3 en un solo standalone. Capa 4 (doble UPDATE) queda como deuda separada explicita (fuera de scope). Razon: las capas 1-3 son la cura de fiabilidad acoplada; partirlas dejaria agujeros.
- **D-02 (principio rector):** El realtime es **best-effort** para latencia baja; la **correctitud** la garantiza una reconciliacion fiable disparada por TODOS los eventos que pueden matar el socket. Una sola fuente de verdad de "re-sincroniza ahora" que re-hidrate AMBOS modelos de estado: el cache de React Query (chat, `use-messages.ts`) y el `useState` de conversations (badge, `use-conversations.ts`).

### Capa 1 — Singleton + setAuth (Claude's Discretion)

- **D-03:** Convertir `createClient()` en `src/lib/supabase/client.ts` en **singleton browser memoizado**, espejando el patron EXACTO de `src/app/get-query-client.ts` (`let browserClient; return (browserClient ??= createBrowserClient(...))`). En server (`isServer`) seguir devolviendo un cliente fresco si aplica — pero este modulo es `'use client'`, asi que el browser singleton es seguro. Los 12 consumidores de `@/lib/supabase/client` (4-5 hooks realtime + auth forms + toggles) comparten asi un unico WebSocket multiplexado y un unico punto de `setAuth`.
  - Consumidores actuales (verificado via grep): `use-conversations.ts`, `use-messages.ts`, `use-kanban-realtime.ts`, `use-robot-job-progress.ts`, `use-metricas-realtime.ts`, `chat-view.tsx`, `contact-panel.tsx`, `availability-toggle.tsx`, y 4 auth forms (`login`, `signup`, `forgot-password`, `reset-password`).
  - Riesgo controlado: el singleton es idempotente para los consumidores de auth (solo llaman `.auth.*`); el unico cambio de comportamiento es el socket de Realtime compartido, que es el uso canonico de Supabase.
- **D-04:** Wiring de auth-refresh en **un punto global montado una sola vez** (provider/efecto client-side en el layout del dashboard, NO en cada hook). Patron:
  ```ts
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      void supabase.realtime.setAuth(session?.access_token)
    }
  })
  ```
- **D-05 (firma confirmada 2026-06-03):** Instalado `@supabase/supabase-js@2.95.3` + `@supabase/realtime-js@2.95.2`. Firma: **`setAuth(token?: string | null): Promise<void>`** — es **async** (usar `void` o `await`), token **opcional** (sin arg lee el token actual del auth client; con arg fuerza JWT explicito). Pasar `session?.access_token` explicito.

### Capa 2 — useRealtimeReconnect (Claude's Discretion)

- **D-06:** Nuevo hook compartido `src/hooks/use-realtime-reconnect.ts`. Expone un registro de callbacks "re-sincroniza ahora". Escucha `document` `visibilitychange` (cuando `!document.hidden`) y `window` `online`. En cualquiera de esos eventos, dispara los callbacks registrados (+ opcionalmente forzar reconexion del socket). Patron de registro: cada consumidor registra/des-registra su callback en un `useEffect` con cleanup (evitar leaks + stale closures via refs, igual que el patron `fetchConversationsRef`/`scheduleSafetyRefetchRef` ya presente en `use-conversations.ts:288-290`).
- **D-07:** Consumidores que registran su re-sync:
  - `use-messages.ts` → registra `softRefetch` (ya existe, `invalidateQueries` — `use-messages.ts:144-147`).
  - `use-conversations.ts` → registra `fetchConversations` (ya existe — `use-conversations.ts:284,290`).
  - (Opcional, mismo patron, si es barato) `use-kanban-realtime.ts` + `use-metricas-realtime.ts`. Prioridad: chat + inbox primero (son el sintoma reportado).
- **D-08:** La reconciliacion NO debe depender de una transicion de status del canal (ese es el agujero 2d). Depende de eventos del navegador que SI ocurren (volver a la tab, recuperar red) + Capa 3 watchdog.

### Capa 3 — Watchdog de staleness (Claude's Discretion)

- **D-09:** Timer ligero (cada 30-60s) que, si la tab esta `visible` y el canal lleva > N seg sin actividad realtime, dispara un re-sync barato (reusa server actions existentes / `softRefetch`). Auto-re-armado (a diferencia del `scheduleSafetyRefetch` actual que solo se re-arma on-event). Es el safety net que ataja 2a aun si `setAuth` fallara. Mantener barato.

### No-tocar / anti-regresion (direccion explicita)

- **D-10:** NO quitar el listener de `contact_tags` (`use-conversations.ts:363-390`) — regresion de `f57386ef`. V1 confirmo que sigue en la publicacion.
- **D-11:** NO re-aplicar `20260317100000` ni mutar la publicacion / RLS — DB verificada limpia (V1-V4).
- **D-12:** Capa 4 (doble UPDATE `messages.ts:428-437`) explicitamente DIFERIDA. No tocar en este standalone.

### Logging, QA y rollout

- **D-13 (rollout):** Es un cambio de **infra de frontend** (cliente browser compartido + hooks de reconexion), NO cambia comportamiento de agentes (Regla 6 no aplica al runtime de agentes). Pero afecta a TODOS los usuarios del dashboard. No es feature-flaggeable por-workspace (es codigo cliente). Mitigacion: cambios aditivos + bajo riesgo + reversibles via git; validar en preview de Vercel antes de prod; el singleton es el cambio mas amplio — verificar que auth forms + los 5 hooks realtime siguen funcionando.
- **D-14 (logging):** MANTENER el logging temporal `[realtime:*]` + `New message received:` (en `use-conversations.ts` + `use-messages.ts`) durante la validacion del fix — sirve para confirmar el agujero 2d en vivo (si tras una falla NO aparece un `[realtime:*] status:` nuevo, el socket murio en `SUBSCRIBED` silencioso). Remover TODO el logging `[realtime:*]` SOLO despues de confirmar el fix en prod (tarea de cleanup al final, o follow-up).
- **D-15 (QA — hallazgo V3):** Validar el fix con cuenta **manager** (o conversaciones asignadas/sin-asignar). `conversations_role_based_select` filtra por `is_workspace_member AND (is_workspace_manager OR assigned_to = auth.uid() OR assigned_to IS NULL)` — un agente no-manager legitimamente NO recibe realtime de conversaciones de otros. Es comportamiento correcto de RLS, NO confundir con el bug.

### Claude's Discretion (detalles de implementacion)

- Estructura exacta de waves/plans, nombres de archivos nuevos, forma del provider global (componente vs efecto en layout existente), parametros del watchdog (intervalo, umbral de staleness), y si Capa 2 cubre kanban/metricas en V1 o se difiere.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diagnostico (sirve como RESEARCH.md)
- `.planning/debug/realtime-inbox-badge.md` — diagnostico completo `/gsd-debug`: causa raiz 2a/2b/2c/2d, resultados VERIFICATION V1-V4 en prod, plan de fix por capas, mapa file:line, commits relacionados, timeline. **Es el research de este standalone.**

### Codigo a modificar (estado actual verificado 2026-06-03)
- `src/lib/supabase/client.ts:5-10` — `createClient()` plano, sin singleton, sin params realtime, sin setAuth (Capa 1 / D-03).
- `src/app/get-query-client.ts` — patron singleton memoizado a espejar para D-03 (`browserQueryClient ??= makeQueryClient()`).
- `src/hooks/use-conversations.ts:279-468` — canal `inbox:`, 4 `.on()` (conversations, contact_tags 363-390, contacts, orders), `subscribe` con IIFE closure `previousStatus` 445-460, `scheduleSafetyRefetch` 10s 281-286, refs `fetchConversationsRef`/`scheduleSafetyRefetchRef` 288-290. Estado en `useState`.
- `src/hooks/use-messages.ts:144-312` — canal `messages:`, INSERT/UPDATE → `setQueryData`, `softRefetch=invalidateQueries` 144-147, `scheduleSafetyRefetch` 3s 150-155, `subscribe` reconnect 293-306. React Query owner.

### Referencia de patrones (NO modificar salvo D-07 opcional)
- `src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts:26,86-89` — confirma `contact_tags` en publicacion (mig 20260317100000) + patron `visibilitychange→refetch` (pero sin reconexion ni setAuth — mismo blind spot 2a). Util como referencia para Capa 2.
- `src/hooks/use-kanban-realtime.ts` — otro consumidor realtime del browser client (compartira el singleton).

### Reglas del proyecto
- `./CLAUDE.md` — Regla 0 (GSD completo), Regla 1 (push a Vercel tras cambios), Regla 5 (migracion antes de deploy — N/A aqui, sin migracion), Regla 6 (proteger agente en prod — ver D-13: no aplica a agentes pero rollout cuidadoso).

</canonical_refs>

<specifics>
## Specific Ideas

- Singleton: copiar literalmente la forma de `get-query-client.ts` (`let browserClient: SupabaseClient | undefined; export function createClient() { if (isServer) return make(); return (browserClient ??= make()) }`). Mantener firma `createClient()` para no romper los 12 call-sites.
- `setAuth` es async: usar `void supabase.realtime.setAuth(session?.access_token)` en el handler de `onAuthStateChange`.
- Provider global: montarlo UNA vez (layout del dashboard `(dashboard)`), no por-hook.
- Validacion E2E manual (no automatizable desde aqui), del debug file:
  1. Dejar inbox >65min sin recargar → enviar inbound de prueba → badge actualiza sin reload (valida Capa 1 setAuth).
  2. Cambiar de tab varios min, volver → realtime re-sincroniza <2s (valida Capa 2 visibilitychange).
  3. Desconectar wifi 30s, reconectar → re-sincroniza sin reload (valida Capa 2 online).
  4. Chat: mensaje desde otro dispositivo aparece en tiempo real; repetir tras 65min (valida React Query + setAuth).
  - Hacer QA con cuenta **manager** (D-15).
</specifics>

<deferred>
## Deferred Ideas

- **Capa 4:** limpiar doble UPDATE redundante en `src/lib/domain/messages.ts:428-437` (deuda, no causal). Mini-plan propio.
- Extender Capa 2 (`useRealtimeReconnect`) a kanban + metricas si no se incluye en V1.
- Remover logging temporal `[realtime:*]` despues de confirmar el fix en prod (puede ser la ultima tarea de este standalone o un follow-up).

</deferred>

---

*Standalone: realtime-inbox-badge*
*Context gathered: 2026-06-03 — derivado de /gsd-debug (diagnose-complete + prod-verified)*
