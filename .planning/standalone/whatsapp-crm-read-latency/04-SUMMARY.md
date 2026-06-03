---
phase: whatsapp-crm-read-latency
plan: 04
subsystem: inbox / client cache
tags: [react-query, supabase-realtime, tanstack, inbox, capa-4, latency]
requires:
  - "src/app/get-query-client.ts (QueryClient singleton — Plan 01)"
  - "src/components/providers/query-provider.tsx montado en dashboard layout (Plan 01)"
provides:
  - "useMessages migrado a React Query: revisitas instantaneas (stale-while-revalidate)"
  - "Bridge Realtime → setQueryData (deltas sin refetch)"
affects:
  - "src/app/(dashboard)/whatsapp/components/chat-view.tsx (consumidor — contract intacto, sin cambios)"
tech-stack:
  added: []
  patterns:
    - "TanStack Query owns el cache; Supabase Realtime sigue siendo fuente de deltas via setQueryData (Pitfall 7)"
    - "invalidateQueries SOLO para reconciliacion unica (safety refetch + channel error/reconnect)"
key-files:
  created: []
  modified:
    - "src/hooks/use-messages.ts"
decisions:
  - "softRefetch reimplementado como invalidateQueries (reconciliacion unica) en vez de merge manual — Pitfall 7 permite este caso para el safety/reconnect"
  - "hasMore queda como useState derivado per-conversation (React Query v5 no tiene onSuccess en useQuery); inicializado por una sola vez por conversationId via initializedConvRef para no clobberar loadMore"
metrics:
  duration: "~15 min"
  completed: "2026-06-03"
  tasks: "1/1 auto (checkpoint pendiente)"
  files: 1
  commits: 1
---

# Phase whatsapp-crm-read-latency Plan 04: useMessages a React Query (Capa 4 inbox) Summary

Migracion del hook `useMessages` de `useState<Message[]>` a TanStack React Query (`useQuery(['messages', conversationId])`), de forma que revisitar una conversacion ya vista es instantaneo (servido del cache, stale-while-revalidate) en vez de un re-fetch fresco que limpia la lista con `setMessages([])`. El Supabase Realtime existente sigue siendo la fuente de deltas, ahora bridgeado al cache via `queryClient.setQueryData` (inmutable, sin refetch — Pitfall 7), conservando la reconciliacion de mensajes optimistas por body 1:1.

## What Was Built

**Task 1 — `useMessages` a useQuery + bridge Realtime setQueryData** (commit `374b1f97`):
- **Estado migrado:** `const [messages, setMessages] = useState<Message[]>([])` → `const { data: messages = [], isLoading } = useQuery({ queryKey: ['messages', conversationId], queryFn: () => getConversationMessages(conversationId!, limit), enabled: !!conversationId })`. Eliminados `fetchMessages`, el `useState` de `isLoading`, y el useEffect "Fetch on conversation change" — React Query maneja el fetch al cambiar la queryKey y sirve del cache en revisitas.
- **addOptimisticMessage:** `queryClient.setQueryData<Message[]>(['messages', conversationId], (prev=[]) => [...prev, optimisticMsg])` — mismo objeto `optimisticMsg` que antes (id `optimistic-${Date.now()}`, status `sending`, etc.).
- **Realtime INSERT handler:** `setQueryData` conservando EXACTAMENTE la reconciliacion optimista — outbound text busca `optimistic-*` con mismo body y lo reemplaza por el real (sin duplicar); si no hay match, append; inbound/no-text → append. Inmutable.
- **Realtime UPDATE handler (status):** `setQueryData` con el map por id. Inmutable.
- **loadMore:** prepend al cache via `setQueryData(['messages', conversationId], (prev=[]) => [...older, ...prev])`; `before` sale de `messages[0].timestamp`; `hasMore` baja a false cuando un page viene `< limit`.
- **softRefetch / scheduleSafetyRefetch:** `softRefetch` reescrito como `queryClient.invalidateQueries({ queryKey: ['messages', conversationIdRef.current] })` (reconciliacion unica permitida por Pitfall 7); el timer de 3s (`scheduleSafetyRefetch`) preservado en el contract.
- **Channel error/reconnect:** ambos disparan `softRefetch()` (= invalidateQueries) — single reconciling refetch.
- **Refs/cleanup preservados:** `safetyRefetchTimer`, `conversationIdRef`, cleanup del channel Realtime (`supabase.removeChannel`) sin cambios.
- **hasMore:** `useState` derivado per-conversation; se resetea a `true` al cambiar `conversationId` y se inicializa una sola vez por conversation (via `initializedConvRef`) comparando `messages.length >= limit` cuando la primera pagina settled, para no clobberar `loadMore`.
- **Contract `UseMessagesReturn` sin cambios** → el unico consumidor `chat-view.tsx` quedo byte-identico (verificado: `git diff --stat HEAD` lista solo `use-messages.ts`).

## Verification

- `npx tsc --noEmit`: 0 errores nuevos. Los 2 errores presentes son PRE-EXISTENTES y ajenos (`.next/dev/types/validator.ts` generado + `src/lib/domain/__tests__/conversations.test.ts` `eqMock` implicit any) — documentados en STATE.md Plan 02/03. Ninguno menciona `use-messages.ts`.
- Grep gates (acceptance del plan):
  - `useQuery` = 3 (≥1) ✓
  - `setQueryData` = 7 (≥3: addOptimistic + INSERT replace + INSERT append + UPDATE + loadMore) ✓
  - `setMessages` = 0 ✓ (estado 100% migrado al cache)
  - `optimistic-` = 2 (≥1) ✓ (reconciliacion preservada)
  - `refetch()` = 0 ✓ (handlers Realtime usan setQueryData; solo invalidateQueries en safety/reconnect)
- Consumidor `chat-view.tsx` sin cambios (contract intacto) — `git diff --stat` confirma 1 archivo tocado.

## Deviations from Plan

None — plan ejecutado exactamente como fue escrito. La eleccion de `invalidateQueries` para el safety refetch (en vez de merge manual via setQueryData) era una opcion explicita del plan (paso 6) y es el caso de "reconciliacion unica" que Pitfall 7 permite.

## Self-Check

- File: `src/hooks/use-messages.ts` — FOUND (modificado)
- Commit: `374b1f97` — FOUND (`perf(whatsapp-crm-read-latency): useMessages a React Query...`)
- No deletions in commit (verificado `git diff --diff-filter=D HEAD~1 HEAD` = vacio)

## Self-Check: PASSED

## Checkpoint Status: ✅ APROBADO (2026-06-03)

**Task 2 `checkpoint:human-verify` APROBADO por el usuario en producción.** Deploy verde tras el fix de `pnpm-lock.yaml` (commit `b2457077`). El usuario verificó: revisitas de conversación instantáneas (A→B→A sin spinner), Realtime entrante en tiempo real, mensaje optimista reemplazado sin duplicar, status tick actualiza, loadMore funciona, Regla 6 OK. Plan 04 COMPLETO.

### Detalle original del checkpoint (verificado PASS)
No auto-aprobado (plan `autonomous:false`). Falta:
1. Push a main (deploy Vercel).
2. Verificacion del usuario en prod: revisita instantanea (A→B→A sin spinner), Realtime entrante en tiempo real, mensaje optimista reemplazado sin duplicar, status tick actualiza, loadMore (scroll arriba) funciona, Regla 6 (agente + resto del inbox normal).

Next tras "approved": cierre del standalone / olas siguientes.
