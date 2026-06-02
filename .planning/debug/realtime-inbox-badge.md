# Debug: Realtime Inbox Badge (unread_count)

## Bug

El badge de unread_count en el inbox de WhatsApp no se actualiza en tiempo real. Nada del canal realtime de conversations funciona — ni preview, ni orden, ni badge. Hay que hacer refresh manual.

## Diagnóstico confirmado

### 1. Causa #4 (RESUELTA) — Canal muerto por re-creación

`scheduleSafetyRefetch` estaba en las dependencias del useEffect del canal realtime (`[workspaceId, scheduleSafetyRefetch]`). Cuando `currentUserId` se resolvía de `null` al ID real:

1. `fetchConversations` cambiaba (depende de `[filter, currentUserId]`)
2. `scheduleSafetyRefetch` cambiaba (depende de `[fetchConversations]`)
3. useEffect se re-ejecutaba → teardown del canal → re-creación
4. Segundo intento daba `TIMED_OUT` → canal muerto

**Fix aplicado:** commit `806a64a` — se movió `scheduleSafetyRefetch` a un ref (`scheduleSafetyRefetchRef`), dependencia del useEffect reducida a solo `[workspaceId]`.

**Logs confirmados en producción:**
```
[realtime:inbox] Setting up channel for workspace: a3843b3f-...
[realtime:inbox] channel status: SUBSCRIBED
[realtime:inbox] Tearing down channel (workspaceId or scheduleSafetyRefetch changed)
[realtime:inbox] channel status: CLOSED
[realtime:inbox] Setting up channel for workspace: a3843b3f-...
[realtime:inbox] channel status: TIMED_OUT    ← canal muerto
```

### 2. Causa actual — SUBSCRIBED pero sin eventos

Después del fix del ref, el canal reporta `SUBSCRIBED` una sola vez (sin teardown). Pero NO llega ningún evento de `postgres_changes` para la tabla `conversations`. El canal de messages (`messages:${conversationId}` en `use-messages.ts`) SÍ funciona — los mensajes aparecen en tiempo real.

### 3. Hallazgo crítico — `contact_tags` NO está en la publicación

`contact_tags` NO fue agregada a `supabase_realtime` en ninguna migración, pero SÍ tiene un listener `.on()` en el canal.

**Hipótesis:** el binding huérfano causa desfase posicional en el protocolo Phoenix y corrompe la entrega de eventos de TODO el canal.

Supabase Realtime usa matching posicional de bindings (índice 0 a N). Si el servidor responde con 4 bindings (omitiendo contact_tags) pero el cliente espera 5, los IDs quedan desfasados y los eventos se rutean al callback equivocado o se ignoran silenciosamente.

## Evidencia

### Publicación realtime (verificada en prod)

| Tabla | En publicación | Listener en canal | Filtro | Migración |
|---|---|---|---|---|
| conversations | ✅ | ✅ `event: '*'` | `workspace_id=eq.${workspaceId}` | `20260130000002` |
| conversation_tags | ✅ | ✅ `event: '*'` | ninguno | `20260203000001` |
| **contact_tags** | **❌ NO** | ✅ `event: '*'` | **ninguno** | — |
| contacts | ✅ | ✅ `event: 'UPDATE'` | `workspace_id=eq.${workspaceId}` | `20260221000000` |
| orders | ✅ | ✅ `event: 'INSERT'` | `workspace_id=eq.${workspaceId}` | `20260212000000` |

### Comparación canal que funciona vs canal roto

| Aspecto | `use-messages.ts` (FUNCIONA) | `use-conversations.ts` (NO FUNCIONA) |
|---|---|---|
| Canal | `messages:${conversationId}` | `inbox:${workspaceId}` |
| `.on()` listeners | 2 | 5 |
| Tablas distintas | 1 (messages) | 5 |
| Todas en publicación | ✅ 1/1 | ❌ 4/5 |
| Filtros | Ambos con filtro | 3 con filtro, 2 sin filtro |

### Protocolo Phoenix — matching posicional

Referencia: `realtime-js` source (`RealtimeChannel.ts`):

1. `phx_join` envía TODOS los bindings (las 5 suscripciones)
2. Servidor responde con array de bindings validados con IDs asignados
3. Cliente compara bindings **por posición** (índice 0 = binding 0, etc.)
4. Si TODOS coinciden → `SUBSCRIBED`
5. Si alguno no coincide → `CHANNEL_ERROR`
6. A runtime, eventos llegan con array `ids` indicando qué bindings matchearon
7. Si los IDs del servidor no corresponden a los del cliente → eventos se ignoran

Issue relevante: [supabase/realtime#370](https://github.com/supabase/realtime/issues/370) — canales que reportan "joined" pero sin subscription records.

### Notas adicionales del flujo de escritura

El `receiveMessage()` en `domain/messages.ts:389-397` hace un UPDATE redundante a `conversations` (sets `is_read`, `last_message_at`, etc.) que el trigger `update_conversation_on_message` ya cubre. Esto genera dos eventos UPDATE por cada mensaje entrante:

1. UPDATE del trigger (atómico con INSERT del mensaje) — incluye `unread_count += 1`
2. UPDATE de la aplicación (transacción separada) — NO toca `unread_count`

No es la causa del bug actual, pero es deuda técnica a limpiar.

## Archivos clave

- `src/hooks/use-conversations.ts` — canal realtime del inbox (el roto). Líneas 273-470.
- `src/hooks/use-messages.ts` — canal realtime de mensajes (funciona, referencia). Líneas 140-209.
- `src/lib/domain/messages.ts` — `receiveMessage()` líneas 351-426, UPDATE redundante en 389-397.
- `supabase/migrations/20260130000002_whatsapp_conversations.sql` — trigger `update_conversation_on_message` líneas 133-199.
- `supabase/migrations/20260129000001_contacts_and_tags.sql` — tabla `contact_tags`, RLS habilitado pero **sin publicación realtime**.
- `supabase/migrations/20260203000001_crm_whatsapp_sync.sql` — `conversation_tags` agregada a publicación (línea 127).

## Logging temporal activo

Commit `3cf2548` agregó logs de diagnóstico en `use-conversations.ts`:

- `[realtime:inbox] Setting up channel` — setup del canal
- `[realtime:inbox] channel status:` — status del subscribe (SUBSCRIBED/TIMED_OUT/etc.)
- `[realtime:inbox] Tearing down channel` — cleanup
- `[realtime:inbox] conversations ${eventType}` — cada evento con payload completo (unread_count, is_read, keys)
- `[realtime:inbox] surgical update unread_count:` — before/after del surgical update
- `[realtime:inbox] UPDATE skipped` — cuando la conversación no está en el state local

**TODO:** Remover logging temporal después de confirmar el fix.

## Siguiente paso

ANTES de hacer cualquier cambio, investigar qué funcionalidad depende del listener de `contact_tags`:

1. Buscar todos los lugares donde se modifican `contact_tags` (INSERT/UPDATE/DELETE)
2. Qué efecto visible tiene en la UI del inbox
3. Si nunca funcionó (no estaba en publicación), ¿hay algún bug visible por su ausencia?
4. Alternativa: agregar `contact_tags` a la publicación vs quitar el listener

Después del análisis, el fix más probable es uno de:

- **Opción A:** Quitar el listener de `contact_tags` del canal — elimina el binding huérfano
- **Opción B:** Agregar `contact_tags` a la publicación (`ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags`) — valida el binding

Ambos resolverían el desfase posicional. Elegir después de investigar impacto.

## Commits relacionados

- `3cf2548` — `debug(realtime): logging temporal para diagnosticar bug unread_count`
- `806a64a` — `fix(realtime): canal muerto por re-creación innecesaria en useEffect`
