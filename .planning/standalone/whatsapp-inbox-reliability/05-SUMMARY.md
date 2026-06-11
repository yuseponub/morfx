---
phase: standalone-whatsapp-inbox-reliability
plan: 05
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, pagination, virtualization, keyset, orders, count]
requires:
  - "04 (get_conversations_page RPC + 2 índices keyset — APLICADA en prod, verificado por orquestador: smoke page1+page2 sin overlap, 447ms)"
provides:
  - "getConversationsPage(filters, cursor) — keyset NULL-correcta vía RPC + re-join .in(id) + cursor opaco base64"
  - "use-conversations paginado: loadMore/hasMore/isLoadingMore, seed SSR sin doble fetch (H-2), filtros/búsqueda server-side, mounted-ref D-17"
  - "Lista virtualizada (@tanstack/react-virtual) con React.memo en ConversationItem"
  - "page.tsx SSR solo 50 filas + counts count:'exact' al topbar (D-04)"
affects:
  - "06 (F-4 coalescing + F-5 freeze/banner — se apoyan en softRefetchPage1 y la virtualización de este plan)"
tech-stack:
  added: []
  patterns:
    - "Keyset cursor opaco { sort, sortIsNull, id } con banda NULL explícita (P1)"
    - "Approach A: RPC retorna rows base en orden autoritativo; TS re-hidrata joins con .in(id) y re-ordena"
    - "mounted-ref guard en todo setState tras await (AbortController NO cancela server actions)"
    - "softRefetchPage1: merge-por-id de página 1, nunca reemplaza páginas cargadas (contrato D-14)"
key-files:
  created:
    - src/app/actions/__tests__/conversations-page.test.ts
  modified:
    - src/app/actions/conversations.ts
    - src/lib/whatsapp/types.ts
    - src/hooks/use-conversations.ts
    - src/app/(dashboard)/whatsapp/page.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
decisions:
  - "Safety-net y reconnect pasan a softRefetchPage1 (merge por id) — un replace de página 1 destruiría las páginas cargadas bajo tráfico (Regla 2)"
  - "currentUserId solo participa en el fetchKey cuando filter='mine' — su resolución async no re-fetchea en 'all' (parte del fix H-2)"
  - "Comparador del memo extiende PATTERNS con profile_name + contact.name + showClientBadge (campos display que mutan vía realtime)"
metrics:
  duration: "~30 min"
  completed: "2026-06-11"
  tasks: "3/3 automatizadas (gate humano de T3 pendiente del orquestador)"
  tests: "15 nuevos (conversations-page) + 55 verdes en suites relacionadas"
  commits: 4
---

# Phase standalone-whatsapp-inbox-reliability Plan 05: F-1 Paginación Keyset + Virtualización Summary

**One-liner:** Paginación keyset NULL-correcta vía RPC `get_conversations_page` (50/página, cursor opaco) + lista virtualizada con react-virtual + búsqueda/filtros server-side + counts `count:'exact'` — las 2.559 conversaciones de Somnio quedan alcanzables y el SSR baja de 1000 a 50 items.

## Tasks Completed

| Task | Name | Commit(s) | Files |
| ---- | ---- | --------- | ----- |
| 1 (TDD) | getConversationsPage action + count + unit test | `ae2f9a5a` (RED) + `ad975b83` (GREEN) | conversations.ts, types.ts, conversations-page.test.ts |
| 2 | use-conversations paginado (loadMore, seed SSR, filtros server-side, orders por página, mounted-ref) | `8c8b4c1c` | use-conversations.ts |
| 3 (wiring automatizado A-D) | Virtualización + memo + page.tsx 50 filas + topbar count | `3a98dfa6` | conversation-list.tsx, conversation-item.tsx, page.tsx, inbox-layout.tsx |

## What Was Built

### Task 1 — `getConversationsPage` (action)
- Llama el RPC con los 14 params lockeados por plan 04 / migración `20260611160000` (la migración aplicada es la fuente de verdad — sin discrepancias con el plan).
- Cursor opaco base64 `{ sort, sortIsNull, id }` del último row del RPC; banda NULL correcta (los outbound-only con `last_customer_message_at` NULL son paginables — bug P1 cerrado). Cursor malformado → página 1 (nunca throw sobre input del cliente).
- Re-join approach A: un solo `.in('id', pageIds)` con el select string anidado existente, re-ordenado al orden del RPC; transform compartido `transformConversationRow` extraído de `getConversations` (shape byte-idéntico).
- Seguridad: `p_workspace_id` SIEMPRE de `getRequestAuth` (T-wir-10); `search` solo como param tipado `p_search` (T-wir-09). Test hostil con workspaceId smuggleado en filters lo verifica.
- Count topbar: `getConversationStats` ya provee `count:'exact'` total+unread — sin código nuevo, page.tsx lo consume (Task 3).
- `getConversations` legacy se mantiene exportado (cero callers externos tras este plan, pero el plan manda conservarlo).

### Task 2 — hook paginado
- `fetchFirstPage` (replace) + `loadMore` (append con dedupe por id, P10) + `softRefetchPage1` (merge por id, sin spinner — espejo de `use-messages.softRefetch`, contrato D-14).
- Seed SSR: `initialConversations` ES la página 1; el fetch de mount se SKIPea cuando hay seed (fix H-2). `cursorRef` viene de `initialCursor` (prop nueva) con fallback `btoa` client-side del último row.
- Fuse ELIMINADO; búsqueda debounced 300ms server-side; filtros tag/agente/unanswered/unread/mine/unassigned como params del RPC. `fetchKey` resetea a página 1 ante CUALQUIER cambio de filtro/búsqueda/sort.
- Orders D-09: página inicial usa solo contactos cargados; `loadMore` trae orders SOLO de la página nueva y mergea el Map.
- mounted-ref D-17: 16 guards en todo setState tras await (page fetch, orders, refreshOrders, los 3 handlers realtime async) — mata los zombie fetches que aterrizaban en /tareas y /crm.
- Realtime D-07: UPDATE de conversación no cargada → si ordena por encima del tail cargado (o ya no hay más páginas) `getConversation(id)` + insert por sort; si por debajo, se ignora (vive en página no cargada).

### Task 3 (parte automatizada A-D)
- **A:** `VirtualizedConversationList` interno con `useVirtualizer` (count/getScrollElement/estimateSize/measureElement/overscan 5 — precedente chat-view). Contenedor `overflow-auto` plano: Radix `ScrollArea` removido del path de lista (Q7/P8). Trigger infinito derivado del último virtual item. Sirve los 3 modos (v3 `.conv-list` clase, v2 estimate 88, legacy 100). Filtros tag/agente movidos del useMemo client-side al hook.
- **B:** `ConversationItem` exportado como `memo(ConversationItemBase, comparator)` — comparador de PATTERNS + `profile_name`/`contact?.name`/`showClientBadge`.
- **C:** `page.tsx` hace `getConversationsPage({status:'active', sortBy:'last_customer_message'}, null)` + `getConversationStats()` en el `Promise.all`; pasa `initialCursor`/`initialHasMore`/`totalCount`/`unreadCount`.
- **D:** `inbox-layout` threadea los props nuevos a ambas instancias de `ConversationList`; topbar v3 usa `totalCount`/`unreadCount` del count query (D-04) con fallback a `.length` para callers viejos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Safety-net y reconnect → `softRefetchPage1` (merge), no full refetch**
- **Found during:** Task 2
- **Issue:** El timer de safety-net y `useRealtimeReconnect` llamaban `fetchConversations()` (refetch completo). Con paginación, un replace de página 1 cada 10s bajo tráfico DESTRUIRÍA las páginas cargadas del usuario scrolleado.
- **Fix:** Ambos llaman `softRefetchPage1` — merge por id de página 1 que nunca toca el tail cursor ni las páginas cargadas. El plan ya anticipaba que "the merge contract is established here" (read_first de Task 2). El re-arming del timer queda intacto — el coalescing D-15 es plan 06.
- **Files modified:** src/hooks/use-conversations.ts
- **Commit:** `8c8b4c1c`

**2. [Rule 1 - Bug] Harness de test: once-queues huérfanas con `vi.clearAllMocks`**
- **Found during:** Task 1 (GREEN)
- **Issue:** Páginas vacías no consumen su `mockResolvedValueOnce` del join (la action retorna antes del re-join) y `clearAllMocks` no dropea once-impls → tests posteriores recibían joins vacíos stale. `vi.resetAllMocks` tampoco sirve (borra la implementación factory de `createClient` en esta versión de Vitest).
- **Fix:** `mockReset()` solo sobre los bare mocks en `beforeEach` + primePage solo encola el join cuando hay rows.
- **Files modified:** src/app/actions/__tests__/conversations-page.test.ts
- **Commit:** `ad975b83`

**3. [Rule 2 - Minor] Footer "N resultados" con sufijo `+`**
- **Found during:** Task 3-A
- **Issue:** El footer derivaba de `.length` del array filtrado — ahora solo cuenta filas CARGADAS y podría sub-contar resultados de búsqueda server-side.
- **Fix:** Muestra `{cargadas}+ resultados` cuando `hasMore` (señal honesta de que hay más server-side). Mismo espíritu D-04 (no derivar totales de `.length`).
- **Commit:** `3a98dfa6`

**4. [Mejora dentro de plan] Comparador del memo extendido**
- El comparador de PATTERNS omitía `profile_name`, `contact?.name` y `showClientBadge` — los tres afectan el render (displayName editable vía `updateProfileName` + realtime). Se añadieron para evitar nombres stale con el memo activo.

## Known Stubs

None — no hay datos hardcodeados ni placeholders. Todos los paths renderizan datos reales del RPC.

## Threat Flags

None — no se introdujo superficie nueva fuera del threat model del plan (T-wir-09/10/11 mitigados según lo planeado: params tipados, workspaceId de auth, SSR 50 filas + count head:true).

## Verification

- `npx vitest run src/app/actions/__tests__/conversations-page.test.ts` → 15/15 verdes (+ suites relacionadas: 55/55).
- `npx tsc --noEmit` → 0 errores (baseline también limpio).
- Gates grep del plan: `rpc('get_conversations_page'` ≥1 ✓; `count: 'exact'` ≥1 ✓; `getConversationsPage` en hook ≥1 ✓; `new Fuse\|fuse` = 0 ✓; `mountedRef.current` = 16 (≥3) ✓; `useVirtualizer` en conversation-list ✓; memo en conversation-item ✓.
- Skip del mount fetch verificado por lectura del efecto (`didConsumeSeedRef` + seed).

## ⏳ Wave 2 gate pending — orchestrator runs it

La parte humana/robot de Task 3 NO se ejecutó aquí (mandato del orquestador):
1. Robot gates contra dev:3020: `case1`, `ssrdiff` (≈50 `[role=listitem]`), `sidebar` (HTML <300KB), reachability de las 2.559 (tail NULL incluido).
2. `REGLA 5 GATE`: re-confirmar migración viva en prod (ya verificada por el orquestador pre-ejecución).
3. **Push a origin/main** (Regla 1) — este ejecutor NO hizo push.

### ⚠️ ANOMALÍA: push parcial arrastrado por sesión concurrente

La sesión Claude concurrente (gemini-fallback-haiku) hizo `git push origin main` para SU trabajo y, al ser rama compartida, **arrastró los commits de Task 1 + Task 2 a origin/main** (`ae2f9a5a`, `ad975b83`, `8c8b4c1c` ya están en remoto → deploy Vercel). El commit de wiring de Task 3 (`3a98dfa6`) sigue SOLO local.

Estado intermedio deployado (evaluado, coherente):
- `page.tsx` en remoto sigue llamando `getConversations` (1000 filas) — el hook nuevo trata esas filas como seed de página 1 con cursor fallback; tsc estaba limpio en `8c8b4c1c` y los consumers compilan.
- El RPC requerido SÍ está aplicado en prod (verificado pre-ejecución) — no hay riesgo Regla 5.
- Riesgo residual: ese estado intermedio NO pasó el robot gate. El orquestador debe correr los gates y pushear `3a98dfa6` cuanto antes (o decidir revert).

## Self-Check: PASSED

- [x] src/app/actions/__tests__/conversations-page.test.ts — FOUND
- [x] getConversationsPage en src/app/actions/conversations.ts — FOUND
- [x] useVirtualizer en conversation-list.tsx — FOUND
- [x] Commits ae2f9a5a / ad975b83 / 8c8b4c1c / 3a98dfa6 — FOUND en git log
- [x] tsc 0 errores nuevos; 15/15 + 55/55 tests verdes
- [x] Este ejecutor no ejecutó ningún push (los 3 primeros commits llegaron a origin vía push de la sesión concurrente — ver anomalía)
