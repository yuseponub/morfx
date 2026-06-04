---
slug: realtime-inbox-badge
status: diagnose-complete
goal: find_root_cause_only
trigger: realtime inbox no se actualiza; "a veces falla y toca recargar la pagina"
root_cause_found: true
fix_applied: false
updated: 2026-06-03
note: continue 2026-06-03 — V1-V4 corridas en prod (DB limpia, cero correctivos), version @supabase/setAuth resuelta, hallazgo V3 role-based (no causal) anotado. Root cause 100% client-side confirmado. LISTO para /gsd-plan-phase (fix por capas). Solo queda QA empirico post-fix (2d).
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

## ✅ RESULTADOS VERIFICATION (corrido en prod 2026-06-03, sesion continue)

| Check | Resultado | Veredicto |
|---|---|---|
| **V1** publicacion | `contact_tags` PRESENTE (+ conversations, contacts, orders, conversation_tags, messages, agent_sessions, robot_*, teams, team_members) | ✅ Problema 1 NO regreso — no tocar listener |
| **V2** replica identity | conversations/messages/contact_tags/contacts/orders = todas `default(pk)` | ✅ PK en old para UPDATE/DELETE — suficiente |
| **V3** RLS | SELECT de messages/contacts/contact_tags/orders via `is_workspace_member(...)` (evalua JWT) | ✅ **Confirma mecanismo 2a**: JWT vencido → is_workspace_member=false → eventos filtrados se caen en silencio |
| **V4** trigger | `messages_update_conversation` existe, `tgenabled='O'` (habilitado) | ✅ unread_count atomico OK |

**Veredicto global: la DB esta limpia. Ningun paso correctivo requerido. El root cause es 100% client-side (2a/2b/2c/2d). Listo para `/gsd-plan-phase`.**

### 🔎 Hallazgo nuevo en V3 (NO causal, pero contexto para el fix + QA)
`conversations_role_based_select` NO es simple aislamiento por workspace — es **role-based**:
```
is_workspace_member(workspace_id)
AND (is_workspace_manager(workspace_id) OR assigned_to = auth.uid() OR assigned_to IS NULL)
```
→ Un agente **no-manager** solo recibe realtime (postgres_changes) de conversaciones **asignadas a el o sin asignar**. Si una conversacion esta asignada a OTRO usuario, sus UPDATE se filtran por RLS tambien en la capa Realtime. **Esto es DETERMINISTA, no intermitente, y un reload NO lo arregla** → **descartado como causa del "toca recargar"** (sintoma 2 es intermitente + reload lo cura). Implicacion para QA del fix: validar con cuenta **manager** (o conversacion asignada/unassigned) para no confundir el filtro RLS legitimo con un fallo de realtime. Comportamiento correcto de RLS, no bug.

---

## VERIFICATION SQL (correr en prod en la sesion fresca, ANTES y DESPUES del fix)

> No se puede consultar prod desde aqui. Las migraciones pueden NO reflejar el estado real (alguien pudo cambiar RLS/publicacion a mano). Confirmar primero. **(V1-V4 ya corridas 2026-06-03 — ver tabla de resultados arriba.)**

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
- [x] **`contact_tags` SIGUE en la publicacion en prod (V1) — CONFIRMADO 2026-06-03.** Presente. Problema 1 no regreso.
- [x] **RLS SELECT en `messages`/`conversations` (V3) — CONFIRMADO 2026-06-03.** Via `is_workspace_member` (evalua JWT → confirma 2a). Hallazgo extra: `conversations` SELECT es role-based (manager/assigned/unassigned), determinista, no causal — ver tabla resultados.
- [x] **Version exacta de `@supabase/*` + firma de `setAuth` — RESUELTO 2026-06-03 (sesion continue):** instalado `@supabase/supabase-js@2.95.3` + `@supabase/realtime-js@2.95.2` (declarado `^2.93.1` en `package.json`). Firma confirmada en `node_modules/@supabase/realtime-js/dist/main/RealtimeClient.d.ts:221`: **`setAuth(token?: string | null): Promise<void>`** — es **async** (await/`.then`), el token es **opcional** (sin args lee el token actual del auth client; con arg fuerza un JWT explicito). Patron Capa 1: `supabase.auth.onAuthStateChange((event, session) => { if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') void supabase.realtime.setAuth(session?.access_token) })`.
- [ ] Confirmar empiricamente el agujero 2d: tras una falla "toca recargar", revisar consola — si NO aparece un `[realtime:*] status:` nuevo (el canal sigue `SUBSCRIBED`), queda probado que el socket murio en silencio sin transicion.

---

## ⚡ NUEVA EVIDENCIA 2026-06-03 (post-deploy del fix capas 1-3) — el fix NO resolvió el 25s

Usuario reportó: tras deploy + hard refresh + **incógnito**, un mensaje tardó **25s** en mostrarse. Investigación instrumentada desde backend (scripts read-only `scripts/_diag-realtime-*.ts`, NO commiteados):

| Medición | Método | Resultado | Veredicto |
|---|---|---|---|
| Backend insert (WhatsApp→DB) | `_diag-realtime-latency.ts` (service-role) | p90 **3.1s**, 0/30 ≥10s | ✅ sano |
| Delivery infra (RLS bypass) | `_diag-realtime-delivery.ts` (service-role sub) | p50 **0.6s** | ✅ sano |
| Delivery autenticado (JWT real, sin filtro) | `_diag-realtime-authed.ts` (mint sesión via admin generateLink+verifyOtp) | p50 **0.6s**, capturó msgs del cel del usuario a 3 ws | ✅ sano |
| **Delivery canal EXACTO del navegador** (4 bindings + `filter:workspace_id=eq` + RLS) | `_diag-realtime-bisect.ts` canal C | **12 eventos, <1s** | ✅ **la suscripción NO es el bug** |
| **Navegador real headless** (deploy `morfx-sandy.vercel.app`, sesión inyectada via cookies ssr `base64-`+chunks, `morfx_workspace`=Somnio) | `_diag-browser-repro.ts` (Playwright) | canal `SUBSCRIBED` 18:24:30 → mensaje a DB 18:26:03 (93s idle) → **navegador NO recibió el evento**. Además `React error #418` (hydration mismatch) | 🔴 **socket SUBSCRIBED-pero-mudo tras idle** |

### Causa raíz REAL (revisada)
**El socket realtime del navegador se queda MUDO tras ~30-90s de inactividad** (sigue `SUBSCRIBED`, deja de entregar). NO es backend, NI infra, NI RLS, NI el patrón de suscripción (filtro/multi-binding) — todo eso entrega <1s probado en Node con el JWT real (canal C). Es muerte silenciosa del socket por **idle/heartbeat**, la versión rápida del hueco 2d.

### Por qué el fix desplegado (capas 1-3) NO basta
- Capa 1 `setAuth`: arregla expiración de JWT (~1h), NO el idle de 30-90s.
- Capa 2/3 `useRealtimeReconnect` (visibilitychange/online/watchdog 45s): **enmascara** con `fetchConversations`/`softRefetch` — pone al día la UI pero **no revive ni mantiene vivo el socket**. El usuario sigue viendo el refetch (10-45s), no realtime. Además el watchdog está gated en `!document.hidden`.

### Direcciones de fix candidatas (para el próximo standalone/plan)
1. **Keepalive real del socket:** ping/heartbeat activo o forzar `supabase.realtime` reconnect cuando lleva > N s sin actividad — REVIVIR el socket, no solo refetch.
2. **Recovery más agresivo:** bajar watchdog de 45s y/o detectar staleness por "tiempo sin evento" y re-suscribir el canal (`removeChannel`+re-subscribe) en vez de refetch.
3. **Investigar `React #418`** (hydration mismatch) en `/whatsapp` — puede ser ruido del headless o un bug real que degrada el cliente. Confirmar en navegador real.
4. **Confirmar que el deploy del fix está LIVE** (build de Vercel) — parte del 25s podría ser que el usuario probó sobre bundle viejo cacheado.

### ✅ CAUSA RAIZ CONFIRMADA 2026-06-03 (no era idle — es token-en-socket)
Protocolo controlado (usuario envió p1..p6 a Somnio, `_diag-protocol.ts`): el servidor emitió los 8 mensajes (ground truth) pero el **navegador headless recibió 0 eventos `[realtime:inbox]`**, incluidos p1/p2/p3 con socket fresco+caliente. → **NO es muerte por idle: realtime está muerto en el navegador, constante.**

A/B confirmatorio (`_diag-token-order.ts`):
- **FASE A (suscribir canal con token ANONIMO, sin setAuth): recibidos 0 / emitidos 2.** ✔ CONFIRMA el mecanismo: suscribir sin JWT → RLS descarta TODO en silencio → `SUBSCRIBED`-pero-mudo.
- Fase B/C sin tráfico (0/0) → inconclusas; Fase C re-suscribe dio `TIMED_OUT` (re-suscribir on-the-fly es frágil).

**CAUSA RAIZ:** los canales realtime del navegador (`use-conversations` inbox + `use-messages`) se **suscriben antes de que el JWT del usuario esté aplicado al socket de realtime** (queda con el token anónimo de @supabase/ssr). RLS evalúa el token → con anónimo `is_workspace_member(auth.uid())` = false → server dropea todos los `postgres_changes` en silencio. Es el hueco **2a pero al INICIO de cada sesión, no tras 1h**. Continuo → coincide con "seguido". Constante adicional: `React #418` hydration mismatch en `/whatsapp` (cada carga).

**Por qué el fix desplegado (capas 1-3) NO sirve:** `RealtimeAuthProvider` llama `setAuth` DESPUÉS de que los canales ya se suscribieron, y `setAuth` no revive confiablemente un canal ya suscrito (Fase B/C). Mal sincronizado. El singleton + setAuth no introdujeron el bug (es pre-existente a @supabase/ssr+RLS) pero no lo arreglan.

### FIX correcto (para el próximo plan)
Garantizar que el **JWT esté en el socket ANTES de suscribir cualquier canal**. Opciones (research-phase elige):
1. **Opción `accessToken`** del cliente supabase-js v2.95 (`createBrowserClient(url, key, { accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null })`) → realtime SIEMPRE usa el token actual. Verificar compat con @supabase/ssr.
2. Gatear `.subscribe()` de los hooks detrás de "auth-ready" + `await realtime.setAuth()` antes de suscribir.
3. Re-suscribir canales tras `setAuth` (frágil — Fase C TIMED_OUT; evitar como primario).
+ Investigar/arreglar `React #418` en `/whatsapp` (probable mismatch de timestamp/locale SSR vs cliente en la lista).

**Verificación OBLIGATORIA antes de re-desplegar:** usar el harness headless (`scripts/_diag-protocol.ts` / `_diag-browser-repro2.ts`) contra `pnpm dev` LOCAL → confirmar que el navegador recibe `[realtime:inbox]` <1s ANTES de pushear. No volver a desplegar a ciegas.

---

## RESEARCH DECISION 2026-06-03 (research-phase completo)
`RESEARCH.md` en `.planning/standalone/realtime-inbox-badge/` (HIGH confidence, leyó el source instalado de supabase):
- ❌ **Opción `accessToken` DESCARTADA** — `@supabase/supabase-js@2.95.3` reemplaza `supabase.auth` por un Proxy que LANZA excepción; `@supabase/ssr` fuerza auth nativo por cookies. Tumbaría los 4 forms de auth + el `getUser()` de use-conversations. Es third-party-auth-only.
- ✅ **FIX ELEGIDO = Opción 2 (ordering):** `realtime-js@2.95.2` (`RealtimeClient.js:551-566` `_onConnOpen`) YA espera `setAuth()` antes de flushear los joins. El bug es puro race: el `.subscribe()` del hook corre antes de que el token esté en el socket. Fix: prime `realtime.setAuth()` (NO-ARG, preserva auto-refresh) al crear el singleton + exponer `whenRealtimeAuthReady()`; en cada hook `await getSession()` + `setAuth(token)` ANTES de `.subscribe()`. Sin deps, sin migración.
- ✅ **`RealtimeAuthProvider` + `useRealtimeReconnect` se QUEDAN** (refresh 1h + recuperación red; nunca fueron el bug). Anti-regresión D-10/D-14 intactas.
- 🔍 **`React #418` INDEPENDIENTE** del realtime — NO es la lista (`RelativeTime` ya es hydration-safe). Candidato: `format(...,'HH:mm')` TZ-sensible en `message-bubble.tsx:168`. Reproducir local + leer stack.
- ✅ **Verificación:** adaptar `scripts/_diag-browser-repro2.ts` a `localhost:3020` (`secure:false`) vs `pnpm dev`. **PASS = navegador loggea `[realtime:inbox] conversation` <2s tras ground-truth en carga fresca** (estado roto actual: GT>0, browser=0).
- ⚠️ Pitfall: `setAuth` con token EXPLÍCITO pasa el cliente a modo manual y suprime auto-refresh → en `client.ts` usar NO-ARG; explícito solo defensivo en el hook.

## ▶ Como retomar tras /clear — PRÓXIMO PASO

- **slug:** `realtime-inbox-badge` (standalone en `.planning/standalone/realtime-inbox-badge/`, NO roadmap)
- **Estado:** diagnose-complete + root-cause CONFIRMADO + CONTEXT.md + RESEARCH.md listos. Falta PLAN + EXECUTE del fix.
- **Comando de retoma:** `/gsd-plan-phase realtime-inbox-badge`
  - Es standalone (no roadmap) → si el init no lo encuentra, tratarlo como standalone: leer `CONTEXT.md` + `RESEARCH.md` del dir y spawnear gsd-planner directo (mismo patrón que se usó para crear los planes capas 1-3).
  - El plan DEBE incluir: (1) fix Opción 2 en `client.ts` + `use-conversations.ts` + `use-messages.ts`, (2) fix `React #418`, (3) **gate de verificación headless LOCAL obligatorio** (`scripts/_diag-browser-repro2.ts` vs `pnpm dev`, PASS = browser recibe `[realtime:inbox]` <2s) ANTES de pushear — exigencia explícita del usuario: NO más deploys a ciegas.
- **Para ver el diagnóstico:** `/gsd-debug continue realtime-inbox-badge` (este archivo).
- **Harness de verificación (en disco, sobreviven /clear):** `scripts/_diag-protocol.ts`, `scripts/_diag-browser-repro2.ts`, `scripts/_diag-token-order.ts` (+ `_diag-realtime-{latency,delivery,authed,bisect}.ts`). Inyectan sesión via admin generateLink+verifyOtp + cookies @supabase/ssr.
- **Capas 1-3 desplegadas en main** (commits `8ad59d9e`, `77eab8ae`/`b7daf662`, `0c4e9379`/`e3dde79b`/`2cd9417d`) — NO sirven solas pero se quedan (research dice keep). El fix Opción 2 las complementa.
