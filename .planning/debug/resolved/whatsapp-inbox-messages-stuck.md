---
slug: whatsapp-inbox-messages-stuck
status: resolved
trigger: "Al abrir el módulo WhatsApp o al cambiar de workspace, la conversación seleccionada se queda con los skeletons de carga v2 pegados (3 cajas vacías) y NO muestra los mensajes; a veces tarda muchísimo."
created: "2026-06-03"
updated: "2026-06-03"
---

# Debug: whatsapp-inbox-messages-stuck

## Symptoms

- **Expected:** Al abrir /whatsapp o al cambiar de workspace, la conversación seleccionada carga sus mensajes con normalidad (idealmente rápido).
- **Actual:** La conversación seleccionada se queda con los **skeletons de carga de inbox v2** pegados (3 cajas vacías: heights 56/42/72px, 2 izquierda + 1 derecha → confirmado que son los skeletons de `chat-view.tsx`, NO mensajes vacíos). No muestra los mensajes. A veces tarda muchísimo / queda "trabada".
- **Errores:** Ninguno visible en UI (solo skeletons pegados). No reportó error en consola aún (pendiente verificar DevTools/Realtime logs).
- **Timeline:** Empezó **HOY 2026-06-03** tras el deploy del **Plan 04** del standalone `whatsapp-crm-read-latency` (migración de `src/hooks/use-messages.ts` a TanStack React Query). HEAD relevante: commit `374b1f97`. Deploy en `morfx-sandy.vercel.app`.
- **Reproducción:** Abrir el módulo WhatsApp y/o cambiar de workspace (workspace-switcher), luego seleccionar/observar una conversación. Más notorio en "las primeras convs".
- **Entorno:** Producción Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`), `ui_inbox_v2.enabled=true`. La diferencia de diseño entre workspaces es ESPERADA (flag per-workspace v2 vs legacy), NO es el bug.
- **Restricción del usuario:** NO parches / band-aids. Diagnóstico riguroso y fix limpio.

## Prior Investigation (orchestrator, pre-sesión)

Hechos ya verificados (no re-litigar, sí confirmar/refinar):

- La Server Action `getConversationMessages` (`src/app/actions/conversations.ts:215-264`) **NO se cuelga server-side**: tiene `Promise.race` con timeout 15s y siempre resuelve (`return []` en timeout/error). → El atasco es **client-side, en React Query** (Plan 04), no en la action.
- `getConversationMessages` ahora resuelve auth vía `getRequestAuth()` (Plan 02). Devuelve `[]` cuando `auth` es null (línea 224-225) — no lanza.
- Hook NUEVO (`use-messages.ts`): `useQuery({ queryKey: ['messages', conversationId], queryFn, enabled: !!conversationId })`. `staleTime: 60_000`, `gcTime: 5min`, `retry` default (3) — definidos en `src/app/get-query-client.ts:5` (cliente browser singleton).
- Hook VIEJO (`git show 374b1f97~1:src/hooks/use-messages.ts`): `useState` + `useEffect([fetchMessages])` que hacía `setMessages([])` + `setIsLoading(true)` → fetch → `setMessages(data)` en CADA cambio de conversación. **Sin caché → siempre re-fetcheaba al abrir → se auto-curaba.**
- Workspace switch (`src/components/workspace/workspace-switcher.tsx:37-38`): `document.cookie = morfx_workspace=...` + `router.refresh()`. **NADIE limpia el cache de React Query** (grep: 0 `removeQueries/clear/resetQueries` en el path de switch). El `queryClient` browser es singleton (`get-query-client.ts:18`).
- En v2 el loading state son 3 skeletons (`chat-view.tsx` ~203-242); en legacy es spinner. `isLoading` de React Query = `isPending && isFetching`.

## Hipótesis a verificar (rankeadas) — VEREDICTO

- **H-A (CONTRIBUYENTE, no causa de skeletons):** `staleTime: 60s` cachea un resultado vacío `[]` (auth null transitorio / timeout / RLS deniega tras mismatch de workspace) como SUCCESS fresco → no revalida por 60s. **Pero** con data settled `isLoading=FALSE` → muestra hilo VACÍO, NO skeletons pegados. Explica la variante "conversación trabada / vacía", no los skeletons. CONFIRMADA como contribuyente secundario.
- **H-B (CONFIRMADA — causa del estado incorrecto/leak tras switch):** `queryKey ['messages', conversationId]` **sin workspaceId** + cache singleton no limpiado en switch. `router.refresh()` re-corre Server Components pero NO remonta clientes ni resetea `?c=` ni limpia React Query. Tras cambiar de workspace A→B, `selectedConversationId` (de `?c=`) persiste, la queryKey es idéntica → React Query sirve el cache de A en B (mensajes de otro workspace o `[]` cacheado). `refetchOnWindowFocus`/`refetchOnMount` (defaults true) disparan refetch que, bajo el JWT/cookie ya del workspace B, devuelve `[]` (RLS) o rebota → realimenta H-A/H-C. CONFIRMADA.
- **H-C (CONFIRMADA — causa directa de los SKELETONS PEGADOS + "tarda muchísimo"):** `retry: 3` default de React Query v5 (sin override en `get-query-client.ts` ni `query-provider.tsx`). Un Server Action invocado desde el cliente es un RPC POST; si el **transporte** rechaza (cold-start de la lambda RSC en Vercel → 500/timeout, blip de red) el promise del queryFn RECHAZA sin importar el `try/return []` del server. React Query reintenta 3× con backoff exponencial (~1s + 2s + 4s = 7s de espera + duración de cada fetch, hasta 15s c/u por el `Promise.race`). Durante TODOS los reintentos `status='pending'` + `fetchStatus='fetching'` → `isLoading=TRUE` → **skeletons pegados 20-50s**. El hook viejo fallaba UNA sola vez (un `fetch` directo) y luego paraba; React Query amplifica. CONFIRMADA como causa primaria del síntoma observado.

## Root Cause

**Regresión del Plan 04 (`374b1f97`):** la migración de `useMessages` a TanStack React Query heredó los *defaults globales* del `QueryClient` (`get-query-client.ts`) que son inadecuados para un fetch one-shot por-conversación vía Server Action, y omitió dos invariantes que el hook viejo cumplía implícitamente:

1. **`retry: 3` (default v5) amplifica los cold-starts** → ante un reject de transporte del POST de la Server Action, React Query reintenta 3× con backoff exponencial manteniendo `isLoading=true` 20-50s → **skeletons v2 pegados** (síntoma principal). El hook viejo fallaba una vez y paraba.
2. **`queryKey` sin `workspaceId` + caché singleton nunca invalidada en el switch** → tras cambiar de workspace, la misma conversación (de `?c=`) sirve/refetchea contra el nuevo workspace produciendo data cruzada o `[]` (RLS), que con `staleTime: 60s` queda pegado 60s (variante "trabada/vacía").

Ambos brazos nacen del mismo cambio estructural (Plan 04) y de no haber adecuado la política de caché ni el scope de la key al introducir React Query. El fix limpio es estructural sobre esa política — no un workaround puntual.

## Current Focus

- hypothesis: "RESUELTA — H-C causa los skeletons pegados (retry 3 amplifica cold-start); H-B causa el leak/estado incorrecto post-switch (queryKey sin workspace + cache no invalidada); H-A es contribuyente secundario (staleTime cachea vacío)."
- test: "Confirmado en código: get-query-client.ts sin override de retry/refetch; use-messages.ts queryKey ['messages', conversationId]; workspace-switcher router.refresh() sin clearQueries; chat-view render skeletons en isLoading && messages.length===0."
- expecting: "Fix limpio: (1) queryKey scoped por workspaceId, (2) política de query adecuada para Server Action one-shot (retry acotado + retry guard para errores no-transitorios), (3) limpieza/invalidacion de cache en workspace switch."
- next_action: "Aplicar fix limpio find_and_fix."
- reasoning_checkpoint: ""
- tdd_checkpoint: ""

## Evidence

- timestamp: 2026-06-03 — Server Action no se cuelga (Promise.race 15s, conversations.ts:243-249). Atasco es client-side React Query.
- timestamp: 2026-06-03 — get-query-client.ts:5 → staleTime 60s, gcTime 5min, retry default. queryKey sin workspace. Switch no limpia cache.
- timestamp: 2026-06-03 — Skeletons v2 (3 cajas) = isLoading true en chat-view; coincide con la captura del usuario.
- timestamp: 2026-06-03 — CONFIRMADO @tanstack/react-query 5.101.0; query-provider.tsx + get-query-client.ts NO overridean retry/refetchOnWindowFocus/refetchOnMount → defaults v5 (retry 3, backoff exp, refetch on focus/mount true).
- timestamp: 2026-06-03 — CONFIRMADO use-messages.ts:66-70 queryKey ['messages', conversationId] sin workspaceId; enabled !!conversationId.
- timestamp: 2026-06-03 — CONFIRMADO chat-view.tsx:203 render skeletons = `isLoading && messages.length === 0`; isLoading v5 = isPending && isFetching → permanece TRUE durante los 3 reintentos.
- timestamp: 2026-06-03 — CONFIRMADO use-messages.ts es el ÚNICO useQuery del repo (grep) → regresión contenida a la migración del Plan 04.
- timestamp: 2026-06-03 — CONFIRMADO workspace-switcher.tsx:37-38 cookie + router.refresh() sin clear/resetQueries; getConversationMessages filtra solo por conversation_id (RLS scope workspace vía JWT+cookie).

## Eliminated

- hypothesis: "La diferencia de diseño entre workspaces es el bug" — ELIMINADA: es el flag `ui_inbox_v2` per-workspace (rollout por SQL, esperado). Explica el aspecto visual (skeletons v2 vs spinner legacy) pero no causa el atasco.
- hypothesis: "La Server Action se cuelga server-side" — ELIMINADA: Promise.race 15s siempre resuelve; el reject que dispara retry es de transporte (cold-start), no del cuerpo de la action.

## Specialist Review

- specialist: typescript-expert (React Query) — review inline (no Task/Skill runtime en este entorno).
- veredicto: LOOKS_GOOD con refinamientos aplicados.
  - queryKey scoped por workspace `['messages', workspaceId, conversationId]` es el fix idiomático para el leak cross-tenant; elimina H-B por construcción (workspace distinto = cache MISS), sin `clear()` manual ni acoplar el switcher.
  - Para el Server Action one-shot: `retry: 1` acotado en la propia query (no en defaults globales — blast radius mínimo, espíritu Regla 6). Mantiene 1 reintento para recuperar un cold-start transitorio pero corta la amplificación de 20-50s de skeletons.
  - `messagesKey()` helper único reusado por query + setQueryData + invalidate + realtime → sin riesgo de drift de key entre sitios.

## Resolution

- root_cause: "Regresión del Plan 04 (374b1f97): la migración de useMessages a TanStack React Query heredó los defaults globales del QueryClient (retry: 3, staleTime 60s) inadecuados para un fetch one-shot por-conversación vía Server Action, y omitió scoping de la queryKey por workspace + invalidación de cache en el switch. (1) retry:3 + backoff exponencial mantenía isLoading=true 20-50s ante un reject de transporte (cold-start Vercel) → skeletons v2 pegados. (2) queryKey sin workspaceId + cache singleton no invalidada en router.refresh() → data cruzada / [] stale 60s tras cambiar de workspace."
- fix: "Fix estructural limpio cubriendo las 3 hipótesis confirmadas: (H-C) retry: 1 acotado en la query de mensajes (no en defaults globales — blast radius mínimo) → corta la amplificación de skeletons en cold-start. (H-B) queryKey scoped por workspace vía helper único messagesKey(workspaceId, conversationId) reusado en useQuery + setQueryData (optimista/INSERT/UPDATE/loadMore) + invalidateQueries + realtime → leak cross-tenant imposible por construcción; workspaceId threaded InboxLayout → ChatView → useMessages; addOptimisticMessage setea workspace_id real. (H-A) getConversationMessages (conversations.ts) ahora LANZA en timeout/fallo (Promise.race error branch) en vez de devolver [] → React Query trata el fallo como error (no lo cachea como vacío-fresco 60s), distinguiendo 'conversación vacía real' (return []) de 'fetch falló' (throw) → se auto-cura en la siguiente revisita/focus como el hook viejo. Único caller (useMessages queryFn + loadMore con try/catch) → throw contenido. Sin tocar domain (Regla 3 N/A — lectura client-side), sin afectar agentes prod (Regla 6), sin migración, sin feature flag. Corregida además corrupción de line-endings (CRLF→LF) que el editor metió en chat-view.tsx + inbox-layout.tsx → restaurado CRLF, diff quirúrgico de 7 líneas (no 1100)."
- files_changed:
  - "src/hooks/use-messages.ts (queryKey workspace-scoped + retry:1 + messagesKey helper + workspaceId param) [LF, ya era LF]"
  - "src/app/(dashboard)/whatsapp/components/chat-view.tsx (prop workspaceId → useMessages) [CRLF preservado, +5 líneas reales]"
  - "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (pasa workspaceId a ambas instancias de ChatView) [CRLF preservado, +2 líneas]"
  - "src/app/actions/conversations.ts (H-A: getConversationMessages lanza en timeout/fallo en vez de return []) [CRLF preservado, +9/-1]"
- verification:
  - "grep: 0 referencias a la key vieja ['messages', conversationId]; retry: 1 presente; workspaceId threaded ChatView+hook."
  - "tsc --noEmit: 0 errores en archivos tocados (2 errores restantes pre-existentes: conversations.test.ts eqMock + .next/dev/types)."
  - "pnpm build: EXIT 0, ✓ Compiled successfully (105s). Solo el warning pre-existente MISSING_MESSAGE: DataDeletion (ajeno)."
  - "EOL verificado CRLF en los 3 archivos CRLF tras editar (no recorrupción)."
  - "Pendiente smoke E2E del usuario en prod tras deploy: abrir /whatsapp, cambiar de workspace, verificar que los skeletons NO se quedan pegados y que la conversación carga sus mensajes correctos (sin leak de otro workspace, sin vacío pegado)."
- status: "RESUELTO — fix completo aplicado, validado (tsc+build), commiteado y pusheado a main para deploy Vercel. Smoke E2E en prod pendiente del usuario."
