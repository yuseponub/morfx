---
phase: whatsapp-crm-read-latency
plan: 04
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/hooks/use-messages.ts
autonomous: false
requirements: [L4]
must_haves:
  truths:
    - "useMessages usa React Query (useQuery) como cache del load inicial y revisitas de mensajes por conversacion"
    - "Revisitar una conversacion ya vista es instantaneo (cache stale-while-revalidate) en vez de re-fetch fresco con setMessages([])"
    - "El Realtime existente sigue siendo la fuente de deltas: los handlers llaman queryClient.setQueryData (NO refetch) para INSERT/UPDATE"
    - "La reconciliacion de mensajes optimistas (optimistic-*) por body se preserva exactamente"
    - "loadMore (paginacion de mensajes antiguos) sigue funcionando, prepend al cache"
  artifacts:
    - path: "src/hooks/use-messages.ts"
      provides: "useMessages migrado a React Query + bridge Realtime via setQueryData"
      contains: "useQuery"
  key_links:
    - from: "src/hooks/use-messages.ts (Realtime handler)"
      to: "queryClient.setQueryData"
      via: "aplica deltas sin refetch (Pitfall 7)"
      pattern: "setQueryData"
    - from: "src/hooks/use-messages.ts (useQuery)"
      to: "getConversationMessages"
      via: "queryFn"
      pattern: "getConversationMessages"
---

<objective>
Ola 1 (Capa 4, inbox) — migrar `useMessages` a TanStack React Query para que revisitar una conversacion ya vista sea INSTANTANEO (stale-while-revalidate), conservando el Supabase Realtime existente como fuente de deltas via `setQueryData` (no refetch).

Este es el plan de MAYOR riesgo del standalone: `use-messages.ts` tiene logica fina de reconciliacion de mensajes optimistas (reemplazar `optimistic-*` por el mensaje real matcheando por body), updates de status, y paginacion (loadMore). Toda esa logica debe PRESERVARSE exactamente — solo cambia el dueño del estado (de `useState<Message[]>` a la cache de React Query) y la fuente del delta (de `setMessages` a `setQueryData`).

Purpose: completar la Capa 4 para el flujo A (inbox) — revisitas instantaneas. Aislado en su propio plan por riesgo (Regla 6: el inbox atiende clientes reales).

Output: `use-messages.ts` migrado, comportamiento de inbox identico + cache de revisitas.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Pattern 4 (TanStack + Realtime bridge), Code Example 5 (bridge sketch), Pitfall 7 (NO refetch desde Realtime, usar setQueryData inmutable), Pitfall 6 (singleton — ya resuelto en Plan 01).
- `src/hooks/use-messages.ts` COMPLETO — leer todo: fetchMessages (L60), softRefetch (L81), scheduleSafetyRefetch (L102), loadMore (L116), addOptimisticMessage (L145), Realtime INSERT handler (L182-217) con reconciliacion optimista, Realtime UPDATE handler (L218+) para status.
- `src/app/get-query-client.ts` + `src/components/providers/query-provider.tsx` (Plan 01) — provider ya montado en el layout.
</read_first>

<interfaces>
useMessages contract a PRESERVAR (consumido por el inbox):
```typescript
interface UseMessagesReturn {
  messages: Message[]                          // orden cronologico (mas viejo primero)
  isLoading: boolean
  loadMore: () => Promise<void>
  hasMore: boolean
  addOptimisticMessage: (text: string) => void
  scheduleSafetyRefetch: () => void
}
```

queryFn:
```typescript
getConversationMessages(conversationId: string, limit = 50, before?: string): Promise<Message[]>
// devuelve orden cronologico (oldest first) — ya hace .reverse() internamente
```

Logica critica a preservar (de Realtime INSERT handler L196-216):
- outbound text: buscar optimistic-* con mismo body y reemplazarlo; si no hay, append
- inbound / no-text: append
Realtime UPDATE handler (L218+): reemplazar mensaje por id (status changes)

queryKey: ['messages', conversationId]
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrar useMessages a useQuery + bridge Realtime setQueryData</name>
  <files>src/hooks/use-messages.ts</files>
  <action>
Refactor de `useMessages` preservando el contract `UseMessagesReturn` EXACTO. Pasos:

1. Reemplazar `const [messages, setMessages] = useState<Message[]>([])` por:
```tsx
const queryClient = useQueryClient()
const { data: messages = [], isLoading } = useQuery({
  queryKey: ['messages', conversationId],
  queryFn: () => getConversationMessages(conversationId!, limit),
  enabled: !!conversationId,
})
```
   - Esto elimina el `setMessages([])` + re-fetch fresco en cada switch → React Query sirve del cache (stale-while-revalidate). Eliminar `fetchMessages`, el `useState` de isLoading, y el useEffect "Fetch on conversation change" (L139-143) — React Query maneja el fetch al cambiar la queryKey.
   - `hasMore`: mantener como `useState` derivado; setearlo en el `onSuccess`/efecto tras el primer fetch comparando `messages.length >= limit`. (React Query v5 no tiene onSuccess en useQuery; usar un useEffect que observe `messages` + un ref de "ya inicializado por conversacion" para no romper loadMore. Alternativa simple: `hasMore = messages.length >= limit` derivado, salvo que loadMore ya haya tocado fondo — mantener un useState que loadMore baja a false cuando un page viene < limit.)

2. **addOptimisticMessage** → `queryClient.setQueryData<Message[]>(['messages', conversationId], (old=[]) => [...old, optimisticMsg])` (mismo objeto optimisticMsg que hoy).

3. **Realtime INSERT handler** (L182-217): reemplazar los `setMessages(prev => ...)` por `queryClient.setQueryData<Message[]>(['messages', conversationId], (prev=[]) => ...)` conservando EXACTAMENTE la logica de reconciliacion optimista (buscar optimistic-* por body en outbound text → reemplazar; si no, append; inbound/no-text → append). Inmutable (Pitfall 7). NO llamar refetch.

4. **Realtime UPDATE handler** (status changes): igual, `setQueryData` con el map por id. Inmutable.

5. **loadMore**: en vez de `setMessages(prev => [...older, ...prev])`, hacer `queryClient.setQueryData<Message[]>(['messages', conversationId], (prev=[]) => [...older, ...prev])`. El `before` sale de `messages[0].timestamp` como hoy. Mantener el manejo de `hasMore`.

6. **softRefetch / scheduleSafetyRefetch**: softRefetch ya no limpia con setMessages([]); reescribir para que haga `queryClient.setQueryData` con el merge actual (mantener la heuristica de "no cambiar si last id coincide") O simplemente `queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })` (un refetch reconciliador unico — aceptable para el safety refetch post-send). Elegir invalidateQueries para el safety refetch (es exactamente el caso de "reconciliacion unica" que Pitfall 7 permite). Preservar `scheduleSafetyRefetch` (timer 3s) en el contract.

7. **On channel error/reconnect**: si el handler de status del channel detecta error/reconexion, `queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })` (Pitfall 7 — reconciliacion unica permitida).

8. Mantener TODOS los refs/cleanup existentes (safetyRefetchTimer, conversationIdRef). El cleanup del channel Realtime no cambia.

CRITICO (Regla 6): el comportamiento observable del inbox debe ser identico salvo "mas rapido en revisitas". La reconciliacion optimista por body es la pieza fragil — clonarla 1:1. Probar manualmente en el checkpoint.

Commit atomico: `perf(whatsapp-crm-read-latency): useMessages a React Query + bridge Realtime setQueryData (Capa 4 inbox)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "useQuery\|setQueryData" src/hooks/use-messages.ts</automated>
  </verify>
  <done>
    - useMessages usa useQuery(['messages', conversationId]) como cache
    - Realtime INSERT/UPDATE handlers usan setQueryData (NO refetch); reconciliacion optimista preservada
    - loadMore prepend via setQueryData; safety refetch via invalidateQueries
    - El contract UseMessagesReturn no cambia
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "useQuery" src/hooks/use-messages.ts` >= 1
    - `grep -c "setQueryData" src/hooks/use-messages.ts` >= 3 (addOptimistic + INSERT + UPDATE + loadMore)
    - `grep -c "setMessages" src/hooks/use-messages.ts` == 0 (estado migrado a la cache)
    - `grep -c "optimistic-" src/hooks/use-messages.ts` >= 1 (reconciliacion preservada)
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    useMessages migrado a React Query con bridge Realtime. Deploy a main (Vercel prod). El inbox ahora cachea revisitas y aplica deltas via setQueryData.
  </what-built>
  <how-to-verify>
    1. Push a main + esperar deploy Vercel.
    2. **Revisita instantanea:** abrir /whatsapp, abrir conversacion A (carga), cambiar a B, volver a A → A debe aparecer INSTANTANEA (de cache) sin spinner de carga completa.
    3. **Realtime entrante:** con una conversacion abierta, que entre un mensaje nuevo del cliente (o enviar desde otro dispositivo) → debe aparecer en tiempo real (Realtime INSERT → setQueryData).
    4. **Mensaje optimista:** escribir y enviar un mensaje de texto → debe aparecer instantaneo (optimista) y luego ser reemplazado por el real sin duplicarse (reconciliacion por body).
    5. **Status:** el tick de estado del mensaje enviado debe actualizarse (Realtime UPDATE → setQueryData).
    6. **loadMore:** scroll arriba en una conversacion larga → cargar mensajes antiguos sigue funcionando (prepend).
    7. **Regla 6:** el agente y el resto del inbox funcionan normal.
  </how-to-verify>
  <resume-signal>Escribe "approved" si revisitas son instantaneas y el Realtime/optimista/status/loadMore funcionan identico, o describe el problema (mensaje duplicado / no llega en tiempo real / loadMore roto / etc.).</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` verde
- `grep -c "setMessages" src/hooks/use-messages.ts` == 0
- `grep -c "refetch()" src/hooks/use-messages.ts` == 0 en los handlers de Realtime (Pitfall 7 — solo invalidateQueries en safety/reconnect)
- Suite existente verde: `npx vitest run`
- Checkpoint humano: revisitas instantaneas + Realtime/optimista/status/loadMore identicos
</verification>

<success_criteria>
- Revisitar una conversacion ya vista es instantaneo (cache React Query)
- Realtime sigue siendo la fuente de deltas via setQueryData (sin doble-fetch)
- Reconciliacion optimista, status y loadMore preservados exactamente
- Inbox sin regresiones (Regla 6)
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/04-SUMMARY.md`
</output>
