---
slug: realtime-inbox-badge
status: diagnose-complete
goal: find_root_cause_only
trigger: realtime inbox no se actualiza; "a veces falla y toca recargar la pagina"
root_cause_found: true
fix_applied: false
updated: 2026-06-03
---

# Debug: Realtime Inbox — badge + intermitencia ("toca recargar")

> **ESTADO:** Diagnose-complete. Root cause encontrado para AMBOS problemas. **Fix NO aplicado.** Continuar en sesion fresca (ver "Como retomar tras /clear" al final).
>
> **AVISO — este archivo fue reescrito 2026-06-03.** La version anterior (de ~2026-03-02) estaba DESACTUALIZADA por meses: su hipotesis central (contact_tags fuera de la publicacion → binding huerfano) YA fue investigada Y resuelta en marzo (commits `c34fe987` + `f57386ef` + migracion `20260317100000`). El bug que el usuario sigue viendo HOY es de otra naturaleza: **fiabilidad de reconexion del WebSocket de Supabase Realtime**. Detalle abajo.

---

## Sintomas (actualizado 2026-06-03)

1. **Badge / inbox (`inbox:${workspaceId}` en `use-conversations.ts`):** a veces el `unread_count`, el preview y el orden de conversaciones no se actualizan en tiempo real.
2. **Intermitencia "toca recargar la pagina":** falla de forma intermitente y afecta a **AMBOS** canales — el chat (`use-messages.ts`, ahora con React Query) **y** el badge/inbox. Un **reload completo** recupera el realtime. Es el sintoma dominante hoy.
3. **Objetivo del usuario:** *"que NUNCA falle de actualizarse en tiempo real."* → necesitamos robustez de reconexion estructural, no parches.

---

## TL;DR de la causa raiz

| # | Problema | Causa raiz | Confianza |
|---|---|---|---|
| 1 | Badge "no actualiza" (historico, marzo) | Binding huerfano `contact_tags` (estaba en el `.on()` pero NO en la publicacion) desfasaba el matching posicional Phoenix. **YA RESUELTO** (`c34fe987` quito el listener; `f57386ef` lo restauro tras `20260317100000 ALTER PUBLICATION ADD contact_tags`). | Resuelto |
| 2 | Intermitencia "toca recargar" (HOY) | El WebSocket de Realtime queda **silenciosamente muerto** y NO se auto-recupera porque faltan 3 piezas estructurales: **(2a)** no se llama `supabase.realtime.setAuth()` al refrescar el JWT → token expira (~1h) y el server deja de entregar eventos filtrados por RLS, pero el canal sigue en `SUBSCRIBED`; **(2b)** no hay handler `visibilitychange` que reconecte/refetch al volver de tab dormido (Vercel/navegador suspende el socket); **(2c)** no hay handler `online`/`offline` que reconecte tras caida de red. La unica "auto-cura" es el `previousStatus !== 'SUBSCRIBED' → SUBSCRIBED` refetch, que **nunca dispara** cuando el socket muere en silencio (el status se queda en `SUBSCRIBED`, no pasa por `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`). | Alta |
| 3 | Doble UPDATE en `receiveMessage` | Deuda tecnica, NO causa del bug. Genera 2 eventos UPDATE por mensaje (trigger + app). Interactua solo como ruido. | Confirmado (no causal) |

---

## Problema 1 — Badge / binding huerfano contact_tags (HISTORICO, RESUELTO)

### Que decia la version vieja del archivo
"`contact_tags` NO esta en la publicacion pero tiene listener → binding huerfano → desfase posicional Phoenix → todos los eventos del canal `inbox:` se ignoran." Esa hipotesis era **correcta para el estado de marzo-02** y explicaba el "SUBSCRIBED pero sin eventos".

### Por que ya NO aplica (evidencia en codebase)
- **Migracion `supabase/migrations/20260317100000_contact_tags_realtime.sql`** (1 linea):
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;
  ```
- **Commit `c34fe987`** (2026-03-17): `fix(realtime): remove orphan contact_tags binding that broke inbox channel` → aplico la Opcion A (quitar el listener).
- **Commit `f57386ef`** (2026-03-17): `fix(realtime): restore contact_tags listener now that publication exists` → aplico la Opcion B (restaurar el listener una vez la tabla estaba en la publicacion).
- **Codigo actual** `src/hooks/use-conversations.ts:363-390`: el listener de `contact_tags` esta presente y comentado en linea 364: `// Added to supabase_realtime publication in migration 20260317100000`.
- **Referencia cruzada:** `src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts:26` confirma lo mismo: `ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags; -- migration 20260317100000`.

→ **Los 5 bindings del canal `inbox:` (conversations, contact_tags, contacts, orders + el implicito) ahora SI estan todos en la publicacion.** El desfase posicional Phoenix ya no ocurre. **NO tocar esto.** Cualquier "fix" que vuelva a quitar el listener es una regresion de `f57386ef`.

> **PERO** hay que CONFIRMAR contra prod (alguien pudo cambiar la publicacion a mano — ver caveat DB-state). Correr la **VERIFICATION SQL** de abajo ANTES del fix. Si por alguna razon `contact_tags` ya NO esta en la publicacion en prod, re-aplicar la migracion.

---

## Problema 2 — Intermitencia "toca recargar" = fiabilidad de reconexion (CAUSA RAIZ ACTUAL)

El chat (`use-messages.ts`) y el inbox (`use-conversations.ts`) crean cada uno su propio cliente browser con `createClient()` y su propio WebSocket. El cliente NO esta configurado para sobrevivir los 3 eventos que matan un socket en produccion.

### 2a. No se llama `realtime.setAuth()` al refrescar el JWT — CAUSA PRINCIPAL

- `src/lib/supabase/client.ts` crea el cliente con `createBrowserClient(url, anonKey)` y **nada mas** — sin params de realtime, sin wiring de auth-refresh.
  ```ts
  export function createClient() {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  ```
- `grep -rn "realtime.setAuth\|onAuthStateChange\|TOKEN_REFRESHED" src/` → **0 resultados** (el unico `setAuth` que aparece es `setAuthTag` de cifrado en `src/lib/meta/token.ts`, no relacionado).
- **Mecanismo del fallo:** Supabase Realtime autentica el socket con el `access_token` (JWT) en el `phx_join`. El JWT del usuario expira (~1h por defecto). `@supabase/ssr` refresca el JWT para las llamadas HTTP/PostgREST, pero **NO** re-inyecta el token nuevo en el socket de Realtime salvo que la app llame `supabase.realtime.setAuth(newToken)` (tipicamente desde `supabase.auth.onAuthStateChange((event) => { if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') supabase.realtime.setAuth() })`). Como NO se llama: tras la expiracion, el server deja de entregar los eventos `postgres_changes` filtrados por RLS (los filtros `workspace_id=eq...` se evaluan contra el rol del token; token vencido → no autoriza → eventos se dejan caer **en silencio**). El canal **sigue reportando `SUBSCRIBED`** del lado del cliente, por lo que **la auto-cura por reconexion nunca dispara**. → El usuario ve "se quedo pegado, toca recargar".
- Encaja con "**a veces** falla": correlaciona con el TTL del JWT (~1h de sesion abierta) — no con cada accion.

### 2b. No hay reconexion en `visibilitychange` (tab dormido)

- `grep -rn "visibilitychange" src/hooks/` → el unico que lo tiene es **metricas** (`use-metricas-realtime.ts:86-89`), y **solo hace refetch**, no reconecta el canal. Ni `use-conversations.ts` ni `use-messages.ts` escuchan `visibilitychange`.
- **Mecanismo:** cuando la tab pasa a background, el navegador (y Vercel/el proxy) suspende el WebSocket; el heartbeat Phoenix se pierde. Al volver al foreground, si el socket murio durante el sueño, el canal puede quedar `SUBSCRIBED`-stale (mismo problema que 2a) sin disparar reconexion → el usuario regresa a la tab y "esta pegado".

### 2c. No hay reconexion en `online`/`offline` (caida de red)

- `grep -rn "addEventListener('online'\|navigator.onLine" src/` → **0 resultados**.
- **Mecanismo:** wifi/red cae y vuelve; el socket puede no recuperarse limpiamente, y de nuevo no hay trigger de refetch/reconnect.

### 2d. La auto-cura existente es insuficiente (por que el reconnect actual no salva)

`use-conversations.ts:445-460` y `use-messages.ts:293-306` ya implementan:
```ts
if (status === 'CHANNEL_ERROR') { /* schedule safety refetch */ }
else if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
  /* reconnected — refetch */
}
```
Esto **solo** se dispara si el socket transiciona por `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` y luego vuelve a `SUBSCRIBED`. En los 3 escenarios de arriba (token expirado, tab dormido, red) el canal **se queda en `SUBSCRIBED` muerto** → nunca hay transicion → nunca refetch. **Ese es el agujero.** El safety-refetch debounced de 10s (`use-conversations.ts:281-286`) solo se re-arma cuando LLEGA un evento; si dejan de llegar eventos, nunca se vuelve a programar → silencio permanente hasta reload.

### 2e. Interaccion con React Query (chat)

- El chat usa React Query (commit `adc07576`, Plan 04). Los handlers de realtime hacen `queryClient.setQueryData` (no refetch) — `use-messages.ts:248,266,284`. Si realtime **pierde** un evento (escenarios 2a-2c), el cache de React Query **no se auto-sana** hasta un `invalidateQueries` (`softRefetch`), que hoy solo se llama desde el safety timer post-envio y desde el reconnect-handler (que no dispara, ver 2d).
- `src/app/get-query-client.ts:5` → `staleTime: 60_000`, sin `refetchOnReconnect`/`refetchOnWindowFocus` explicitos. React Query trae `refetchOnWindowFocus:true` y `refetchOnReconnect:true` por defecto — **pero** (i) solo para queries con observadores montados y stale, y (ii) **el inbox/conversations NO usa React Query** (es `useState` + server action en `use-conversations.ts:135,186`), asi que para el badge esos defaults no ayudan en absoluto. → **El fix de reconexion debe re-sincronizar AMBOS modelos de estado:** el cache de React Query (chat) y el `useState` de conversations (badge).

---

## Problema 3 — Doble UPDATE en receiveMessage (deuda, NO causal)

`src/lib/domain/messages.ts:428-437`: `receiveMessage()` hace un UPDATE a `conversations` (`last_message_at`, `last_message_preview`, `last_customer_message_at`, `is_read=false`) que **NO** toca `unread_count`. El trigger `update_conversation_on_message` (`supabase/migrations/20260130000002_whatsapp_conversations.sql:133-199`, incrementa `unread_count` en linea 181-183) ya cubre lo esencial de forma atomica con el INSERT del mensaje.

→ Resultado: **2 eventos UPDATE de `conversations` por cada mensaje inbound**:
1. UPDATE del trigger (atomico con el INSERT) — incluye `unread_count += 1`.
2. UPDATE de la app (transaccion separada) — NO toca `unread_count`.

**No es causa del bug**, pero (a) duplica trabajo de surgical-update en el cliente y (b) el orden de llegada de los 2 eventos podria, en un cliente con realtime sano, mostrar momentaneamente un estado intermedio. Limpiar como deuda: o el trigger hace todo, o el UPDATE de la app se elimina. Fuera del scope del fix de fiabilidad, pero anotarlo.

---

## Plan de fix por capas (estructural, sin parches) — NO APLICADO

> Objetivo: "que NUNCA falle". El principio es: **el realtime es best-effort para latencia baja; la correctitud la garantiza una reconciliacion fiable disparada por TODOS los eventos que pueden matar el socket.** Una sola fuente de verdad de "re-sincroniza ahora" que re-hidrate tanto el cache de React Query (chat) como el `useState` de conversations (badge).

### Capa 0 — Verificar prod primero (ver VERIFICATION SQL). No tocar codigo hasta confirmar publicacion + RLS + replica identity.

### Capa 1 — `setAuth` en refresh de token (arregla 2a, la causa principal)
- **Donde:** punto unico, idealmente un provider/efecto global montado una vez (p.ej. en el layout del dashboard) usando un cliente browser singleton.
- **Que:** wire `supabase.auth.onAuthStateChange((event, session) => { if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') supabase.realtime.setAuth(session?.access_token) })`. Confirmar la firma exacta de `setAuth` para la version instalada de `@supabase/supabase-js`/`realtime-js` (algunas aceptan token explicito, otras lo leen del auth). **Verificar version antes** (`grep '@supabase' package.json`).
- **Requisito previo:** usar un **cliente browser singleton** (hoy cada hook hace su propio `createClient()` → 12 usos, `grep -rln "from '@/lib/supabase/client'" src/`). Para que `setAuth` afecte a los sockets de los hooks, deben compartir el mismo cliente/cliente-realtime. **Decision de diseño:** convertir `createClient()` en singleton browser (memoizar el cliente como en `get-query-client.ts`), de modo que conversations + messages + metricas + kanban compartan un unico WebSocket multiplexado y un unico punto de `setAuth`.

### Capa 2 — Hook compartido `useRealtimeReconnect` (arregla 2b + 2c + 2d)
- **Nuevo archivo:** `src/hooks/use-realtime-reconnect.ts` (o similar). Expone un registro de callbacks "re-sincroniza ahora".
- **Escucha:** `document.visibilitychange` (cuando `!document.hidden`), `window.online`. En cualquiera de esos eventos: (i) opcionalmente forzar reconexion del socket (`supabase.realtime.disconnect()` + reconnect, o re-subscribe de canales), y (ii) disparar el callback de re-sincronizacion de cada consumidor.
- **Consumidores:**
  - `use-messages.ts` registra `softRefetch` (ya existe, `invalidateQueries` — `use-messages.ts:144-147`).
  - `use-conversations.ts` registra `fetchConversationsRef.current` (ya existe — `use-conversations.ts:173,290`).
- **Beneficio:** cubre el agujero de 2d (socket muerto en `SUBSCRIBED` silencioso) porque la reconciliacion ya NO depende de una transicion de status del canal; depende de eventos del navegador que SI ocurren (volver a la tab, recuperar red).

### Capa 3 — Heartbeat/staleness watchdog (defensa en profundidad, opcional pero recomendado para "NUNCA falle")
- Un timer ligero (p.ej. cada 30-60s) que, si el canal lleva > N segundos sin actividad y la tab esta visible, dispara un `softRefetch`/`fetchConversations` de reconciliacion barato. Es el "safety net" que ataja el caso 2a aun si `setAuth` fallara. Mantener barato (server actions ya existentes). Reusa el patron de `scheduleSafetyRefetch` pero auto-re-armado (no solo on-event).

### Capa 4 — (Opcional, deuda) limpiar doble UPDATE de `receiveMessage`
- Eliminar el UPDATE redundante de `src/lib/domain/messages.ts:428-437` (dejar que el trigger sea la unica fuente) **o** consolidar todo en el UPDATE de la app y simplificar el trigger. Requiere su propio mini-plan + verificar que `last_customer_message_at` quede cubierto por quien quede. Fuera del scope de fiabilidad; hacer despues.

### Archivos/funciones que cambian
| Archivo | Cambio |
|---|---|
| `src/lib/supabase/client.ts` | `createClient()` → singleton browser (memoizado). |
| `src/lib/supabase/` (nuevo o layout) | Provider/efecto global: `onAuthStateChange` → `realtime.setAuth`. |
| `src/hooks/use-realtime-reconnect.ts` (NUEVO) | Hook compartido: `visibilitychange` + `online` → re-sync callbacks (+ opcional watchdog). |
| `src/hooks/use-conversations.ts` | Registrar `fetchConversations` en el hook compartido; remover logging temporal post-fix. |
| `src/hooks/use-messages.ts` | Registrar `softRefetch` en el hook compartido; remover logging temporal post-fix. |
| `src/app/get-query-client.ts` | (Opcional) `refetchOnReconnect: true` explicito para el chat (defensa). |
| `src/lib/domain/messages.ts` | (Capa 4 opcional) limpiar UPDATE redundante 428-437. |

### NO hacer
- NO quitar el listener de `contact_tags` (regresion de `f57386ef`).
- NO re-aplicar la migracion `20260317100000` salvo que la VERIFICATION SQL muestre que `contact_tags` ya NO esta en la publicacion en prod.
- NO confiar solo en transiciones de status del canal para auto-cura (el agujero 2d).

---

## VERIFICATION SQL (correr en prod en la sesion fresca, ANTES y DESPUES del fix)

> No se puede consultar prod desde aqui. Las migraciones pueden NO reflejar el estado real (alguien pudo cambiar RLS/publicacion a mano). Confirmar primero.

```sql
-- (V1) Tablas en la publicacion supabase_realtime. Esperado: messages, conversations,
-- conversation_tags, contact_tags, contacts, orders (al menos).
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
-- Si 'contact_tags' NO aparece -> re-aplicar: ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;

-- (V2) REPLICA IDENTITY de las tablas del inbox (necesario para que payload.old traiga PK
-- en UPDATE/DELETE; 'd'=default solo PK, 'f'=full todas las columnas). Para surgical updates
-- por unread_count basta con que las columnas relevantes vengan en NEW; pero DELETE necesita PK.
SELECT c.relname,
       CASE c.relreplident WHEN 'd' THEN 'default(pk)' WHEN 'f' THEN 'full'
            WHEN 'n' THEN 'nothing' WHEN 'i' THEN 'index' END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('conversations','messages','contact_tags','contacts','orders');
-- Si alguna tabla con .on() DELETE/UPDATE tiene 'nothing' -> ALTER TABLE x REPLICA IDENTITY FULL;

-- (V3) RLS en messages y conversations: confirmar que las policies SELECT permiten al rol
-- authenticated leer por workspace (Realtime evalua RLS con el JWT del socket; si el token
-- esta vencido o la policy cambio, los eventos filtrados se caen en silencio -> sintoma 2a).
SELECT schemaname, tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename IN ('messages','conversations','contact_tags','contacts','orders')
ORDER BY tablename, policyname;

-- (V4) Sanity: que el trigger de unread_count exista y este habilitado.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.messages'::regclass
  AND tgname = 'messages_update_conversation';
```

**Despues del fix** (validacion manual E2E, no se puede automatizar desde aqui):
1. Abrir inbox, dejar la tab >65 min (forzar expiracion JWT) sin recargar; enviar un mensaje inbound de prueba al workspace → el badge/preview DEBE actualizarse sin reload (valida Capa 1 setAuth).
2. Minimizar/cambiar de tab varios minutos, volver → realtime sigue vivo o se re-sincroniza en <2s (valida Capa 2 visibilitychange).
3. Desconectar wifi 30s, reconectar → realtime se re-sincroniza sin reload (valida Capa 2 online).
4. Chat: con la tab activa, enviar un mensaje desde otro dispositivo → aparece en tiempo real; repetir tras 65 min de sesion (valida React Query + setAuth).

---

## Logging temporal activo (remover post-fix)

`use-conversations.ts` (commit historico `3cf2548`, parcialmente reescrito):
- `[realtime:inbox] conversation ${eventType}` — `use-conversations.ts:319`
- `[realtime:inbox] status: ${status}` — `use-conversations.ts:448`
- `[realtime:inbox] channel error — scheduling safety refetch` — `use-conversations.ts:452`
- `[realtime:inbox] reconnected — refetching all conversations` — `use-conversations.ts:455`

`use-messages.ts`:
- `New message received:` — `use-messages.ts:242`
- `[realtime:messages] ... status:` — `use-messages.ts:294`
- `[realtime:messages] channel error` / `reconnected` — `use-messages.ts:298,302`

**TODO:** remover TODO el logging `[realtime:*]` + `New message received:` despues de confirmar el fix en prod. **MANTENER mientras se valida** (sirve para ver si el socket queda en `SUBSCRIBED` muerto: si tras la falla NO hay log de status nuevo, confirma el agujero 2d).

---

## Evidencia / archivos clave (file:line)

- `src/hooks/use-conversations.ts:296-468` — canal `inbox:`, 5 `.on()` listeners (conversations, contact_tags 363-390, contacts, orders), subscribe + reconnect handler 445-460. Estado en `useState` (135), refetch en `fetchConversations` (186), refs reconnect (173, 289-290), safety refetch debounced 10s (281-286).
- `src/hooks/use-messages.ts:223-312` — canal `messages:`, INSERT/UPDATE → `setQueryData`, `softRefetch=invalidateQueries` (144-147), reconnect handler 293-306. React Query owner.
- `src/lib/supabase/client.ts:5-10` — cliente browser sin params realtime ni setAuth (CAUSA 2a). No singleton.
- `src/app/get-query-client.ts:5` — staleTime 60s, sin refetchOnReconnect explicito.
- `src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts:26,86-89` — REFERENCIA: confirma contact_tags en publicacion (mig 20260317100000) + patron visibilitychange→refetch (pero sin reconexion ni setAuth — mismo blind spot 2a).
- `src/lib/domain/messages.ts:428-437` — UPDATE redundante (Problema 3, no causal). Trigger en `supabase/migrations/20260130000002_whatsapp_conversations.sql:133-199` (unread_count 181-183).
- `supabase/migrations/20260317100000_contact_tags_realtime.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags` (cierra Problema 1).

## Commits relacionados (timeline real)
- `806a64a` (2026-03-02) — fix: canal muerto por re-creacion en useEffect (deps → `[workspaceId]`).
- `3cf2548` (2026-03-02) — debug: logging temporal `[realtime:inbox]`.
- `c34fe987` (2026-03-17) — fix: remove orphan contact_tags binding (Opcion A).
- `20260317100000` (2026-03-17) — migracion: ADD TABLE contact_tags a la publicacion.
- `f57386ef` (2026-03-17) — fix: restore contact_tags listener now that publication exists (Opcion B). **Problema 1 cerrado aqui.**
- `9f5c1701` (2026-03-19) — fix: 10s refetch + reconnect handling (auto-cura parcial, insuficiente — agujero 2d).
- `adc07576` (2026-06-03) — chat migrado a React Query (`setQueryData`).

---

## Por confirmar contra prod (hipotesis, NO asumir)
- [ ] `contact_tags` SIGUE en la publicacion en prod (V1). Si no → re-aplicar migracion (regresion posible si alguien la quito a mano).
- [ ] RLS SELECT en `messages`/`conversations` sin cambios manuales que bloqueen al rol del socket (V3).
- [ ] Version exacta de `@supabase/supabase-js`/`realtime-js` para la firma correcta de `realtime.setAuth` (`grep '@supabase' package.json`).
- [ ] Confirmar empiricamente el agujero 2d: tras una falla "toca recargar", revisar consola — si NO aparece un `[realtime:*] status:` nuevo (el canal sigue `SUBSCRIBED`), queda probado que el socket murio en silencio sin transicion.

---

## Como retomar tras /clear

- **slug:** `realtime-inbox-badge`
- **Comando:** `/gsd-debug continue realtime-inbox-badge`
- **Primera accion:** correr la VERIFICATION SQL (V1-V4) en prod para confirmar publicacion + RLS + replica identity + trigger; luego confirmar version de `@supabase/*` en `package.json`. Recien entonces planificar el fix por capas (Capa 1 setAuth singleton → Capa 2 hook reconnect → Capa 3 watchdog), via `/gsd-plan-phase` (Regla 0: NO codigo sin plan aprobado). Capa 4 (doble UPDATE) es deuda separada/opcional.
