---
phase: standalone-whatsapp-inbox-reliability
plan: 06
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, reconciliation, softRefetch, coalesce, scroll-freeze, banner]
requires:
  - "05 (softRefetchPage1 merge-by-id D-14 + virtualización + mountedRef — este plan se construye encima)"
provides:
  - "Timer del safety-net COALESCIDO (D-15): un fire por ventana de 10s, los eventos NO re-arman"
  - "Handler realtime de orders quirúrgico (D-16): refresca SOLO el contacto del payload"
  - "Política freeze de scroll (D-18/D-19): frozenRef + buffer de reorders diferidos + applyPendingOrder"
  - "Banner sticky 'N conversaciones con actividad — volver arriba' en la lista virtualizada"
affects:
  - "Wave 3 gates (case4/case4b) + push — los corre el orquestador"
  - "07+ (W4 F-7) — el contrato freeze/banner queda establecido"
tech-stack:
  added: []
  patterns:
    - "Coalescing timer: early-return si armado, el timeout se auto-desarma (D-15)"
    - "Freeze policy: la LISTA es dueña del scroll (frozenRef), el HOOK es dueño de los datos — los handlers realtime leen el ref y difieren re-sorts a un Set deduplicado por id"
    - "softRefetch frozen-aware: merge in-place preservando orden; filas nuevas/reordenadas → banner (delta diferido, nunca perdido — T-wir-13)"
key-files:
  created: []
  modified:
    - src/hooks/use-conversations.ts
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
decisions:
  - "Umbral del freeze = 1× clientHeight del contenedor (D-18, discreción de Claude per CONTEXT)"
  - "bannerCount = tamaño del Set de ids pendientes (dedupe) — N updates de la misma conversación cuentan 1, no N"
  - "El cleanup del effect realtime ANULA el ref del timer tras clearTimeout — con coalescing, un ref stale bloquearía todo schedule futuro (bug introducido por la semántica nueva, corregido en el mismo task)"
  - "softRefetchPage1 frozen: filas de página 1 nuevas O con sort-key movida (comparación por epoch) van al banner; el resto mergea datos en su posición actual"
metrics:
  duration: "~12 min"
  completed: "2026-06-11"
  tasks: "2/2 automatizadas (gate robot de T3 pendiente del orquestador)"
  tests: "15/15 conversations-page (regresión) + tsc 0 errores"
  commits: 2
---

# Phase standalone-whatsapp-inbox-reliability Plan 06: F-4 Coalescing + F-5 Scroll-Freeze Summary

**One-liner:** Safety-net coalescido a un solo fire por ventana de 10s + orders realtime quirúrgico por contacto (F-4, mata el autorefresh perceptible) y política freeze de scroll con banner "N conversaciones con actividad — volver arriba" sobre el virtualizador (F-5, mata el shift de contenido bajo el viewport por construcción).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | F-4 — coalescing timer + surgical orders handler | `8ac2aed3` | use-conversations.ts |
| 2 | F-5 — scroll-freeze + activity banner | `03c93893` | use-conversations.ts, conversation-list.tsx |

## What Was Built

### Task 1 — F-4 (D-14/D-15/D-16)
- **softRefetchPage1 ya existía** (plan 05, deviation Rule 2) y cumple D-14 verbatim: merge-by-id de página 1, latest wins, sin `isLoading`, sin replace, guard `mountedRef`, error silencioso. No se duplicó nada — solo se construyó encima.
- **Coalescing (D-15):** `scheduleSafetyRefetch` hace early-return `if (safetyRefetchTimer.current) return` — los eventos ya NO re-arman el timer. El timeout se auto-anula (`safetyRefetchTimer.current = null`) antes de llamar `softRefetchPage1()`. Antes: cada evento corría clear+re-arm → con tráfico continuo de Somnio el deadline se empujaba siempre y el "debounce" degeneraba en refetch perpetuo.
- **Fix derivado del coalescing:** el cleanup del effect realtime hacía `clearTimeout` SIN anular el ref. Con la semántica vieja (clear+re-arm) era inocuo; con early-return, un ref stale habría bloqueado todo schedule futuro tras cambio de workspace/remount. Corregido en el mismo commit.
- **Orders quirúrgico (D-16):** el handler de `orders` lee `contact_id` de `payload.new ?? payload.old`; si no está en la ventana cargada → ignora; si está → `getOrdersForContacts([contactId])` + `setOrdersByContact(prev => new Map(prev).set(contactId, …))`. Fin del re-run completo sobre ~50-150 contactos (storm de 4.5s) ante cualquier cambio de stage en el workspace.

### Task 2 — F-5 (D-18/D-19)
**División de responsabilidad:** la LISTA es dueña del scroll, el HOOK es dueño de los datos. Coordinan vía `frozenRef` (la lista lo escribe, los handlers lo leen) + `onPendingReorderRef` (el hook notifica el conteo pendiente) + `applyPendingOrder` (la lista lo invoca al volver arriba).

Hook (`use-conversations.ts`):
- `pendingReorderIdsRef: Set<string>` — dedupe por conversación: N updates de la misma fila cuentan 1 en el banner.
- **UPDATE in-window congelado:** el merge de datos aplica IN-PLACE (preview/unread/timestamps se ven al instante) pero SIN re-sort; si la sort-key se movió (comparación por epoch — los formatos de timestamp WAL vs PostgREST difieren), la fila va al banner. El check corre ANTES del `setConversations` (cero side-effects dentro del updater).
- **UPDATE D-07 not-in-window + INSERT congelados:** se difiere el insert completo (prepend movería contenido bajo el viewport) → banner + `scheduleSafetyRefetch`. El delta se recupera en el unfreeze vía soft merge.
- **softRefetchPage1 congelado:** mergea datos de página 1 en las posiciones ACTUALES (`prev.map(c => latestById.get(c.id) ?? c)`); filas nuevas o con sort-key movida → banner. Cubre también el path `useRealtimeReconnect` y el subscribe-reconnect sin tocarlos.
- **applyPendingOrder:** limpia el Set, aplica `sortConversations` UNA vez (settle visual inmediato) y corre `softRefetchPage1()` (ya descongelado → path con sort) para traer las filas cuyo insert se difirió.
- `fetchFirstPage` (cambio de filtro) limpia el Set + resetea el banner — un replace de página 1 invalida lo diferido.

Lista (`conversation-list.tsx`):
- Scroll listener passive en `parentRef` (el contenedor del virtualizador): `isFrozen = scrollTop > clientHeight` (1 viewport, D-18). Cleanup deja `frozenRef.current = false` (nunca dejar el hook congelado tras unmount).
- Banner `position: sticky; top: 0` DENTRO del contenedor de scroll — visible mientras el usuario está abajo (que es exactamente cuándo importa). Wording exacto: `{N} conversaciones con actividad — volver arriba`. Tokens editoriales con fallback (`var(--ink-1, #1f2937)`) para los 3 modos (v3/v2/legacy).
- **Volver arriba aplica solo:** effect `if (!isFrozen && bannerCount > 0) onApplyPending()` — bannerCount solo crece congelado, así que dispara exactamente en la transición de unfreeze.
- **Click en banner:** unfreeze eager + `scrollTo({ top: 0, behavior: 'smooth' })` + apply + reset. Si el smooth-scroll re-congela transitoriamente y llegan eventos, el ciclo converge solo (el effect de unfreeze re-aplica al llegar arriba).
- `bannerCount` vive en el componente exterior (compartido por los paths v3/v2/legacy); ambas instancias de `VirtualizedConversationList` reciben los 3 props nuevos.
- Path NO congelado (usuario en el tope): comportamiento byte-idéntico al plan 05.

## Deviations from Plan

### Reconciliación con la realidad post-plan-05 (per mandato del orquestador)

**1. [Plan vs realidad] Punto 1 de Task 1 (crear softRefetchPage1) ya estaba hecho**
- **Found during:** Task 1
- **Issue:** El plan fue escrito antes de ejecutar el plan 05; el plan 05 ya construyó `softRefetchPage1` (deviation Rule 2) cumpliendo D-14, y safety-net + reconnect ya lo consumen.
- **Fix:** Verificado contra D-14/D-15 — solo faltaba el coalescing (punto 2) y el orders quirúrgico (punto 3). Nada se duplicó. Nota: el plan pedía "PRESERVE contact/tags joins like the UPDATE handler" — no aplica: `getConversationsPage` re-hidrata los joins server-side (approach A del plan 05), así que latest-wins por fila completa es correcto y trae joins frescos.
- **Commit:** `8ac2aed3`

### Auto-fixed Issues

**2. [Rule 1 - Bug] Cleanup del timer incompatible con coalescing**
- **Found during:** Task 1
- **Issue:** El cleanup del effect realtime hacía `clearTimeout(safetyRefetchTimer.current)` sin anular el ref. Con el early-return nuevo de D-15, un ref stale tras cambio de workspace bloquearía TODOS los schedules futuros (el safety-net moriría en silencio).
- **Fix:** `safetyRefetchTimer.current = null` tras el clearTimeout del cleanup.
- **Files modified:** src/hooks/use-conversations.ts
- **Commit:** `8ac2aed3`

**3. [Rule 2 - Missing critical] softRefetchPage1 frozen-aware**
- **Found during:** Task 2
- **Issue:** El plan gatea los handlers realtime con el freeze, pero el safety timer coalescido también llama `softRefetchPage1` — y su `sortConversations` habría reordenado bajo el viewport a los 10s, rompiendo D-18 por la puerta de atrás (el robot case4b lo habría cazado).
- **Fix:** Branch congelado en `softRefetchPage1`: merge de datos preservando orden actual + filas nuevas/reordenadas al banner. Cubre safety timer, `useRealtimeReconnect` y el reconnect del subscribe de una vez.
- **Files modified:** src/hooks/use-conversations.ts
- **Commit:** `03c93893`

## Known Stubs

None — no hay datos hardcodeados ni placeholders; todos los paths renderizan datos reales.

## Threat Flags

None — no se introdujo superficie nueva fuera del threat model del plan. T-wir-12 (refetch storm) mitigado por coalescing + page-1 merge + orders quirúrgico; T-wir-13 (deltas perdidos congelado) mitigado por merge in-place + banner + soft merge en unfreeze (delta diferido, nunca perdido).

## Verification

- `npx tsc --noEmit` → 0 errores (tras cada task).
- `npx vitest run src/app/actions/__tests__/conversations-page.test.ts` → 15/15 verdes (regresión del contrato que consume softRefetchPage1).
- Gates grep del plan: `softRefetchPage1` ×5 (≥2) ✓; `if (safetyRefetchTimer.current) return` ✓; `fetchConversations()` = 0 ✓; `new Map(prev).set(contactId` ✓; `conversaciones con actividad` en conversation-list ✓; `clientHeight` en la derivación del freeze ✓; handler realtime branchea en el flag congelado ✓; volver arriba/click aplica sort una vez + resetea contador ✓.

## ⏳ Wave 3 gate pending — orchestrator runs case4/case4b + push

La parte humana/robot de Task 3 NO se ejecutó aquí (mandato del orquestador):
1. F-4 gate (D-15): robot `case4` contra dev:3020 → 0 full-refetches >2s tras N updates no-op (baseline: 3 refetches de 4.3-4.6s en 20s).
2. F-5 gate: robot `case4b` → sentinel ("José Elver Jiménez Cruz") quieto con bump bajo el viewport, banner incrementa (baseline corrida B: 2/2 shifts).
3. **Push a origin/main** (Regla 1) — este ejecutor NO hizo push.

## Self-Check: PASSED

- [x] Commit `8ac2aed3` (Task 1) — FOUND en git log
- [x] Commit `03c93893` (Task 2) — FOUND en git log
- [x] `softRefetchPage1` en src/hooks/use-conversations.ts — FOUND
- [x] `conversaciones con actividad` en conversation-list.tsx — FOUND
- [x] tsc 0 errores; 15/15 tests regresión verdes
- [x] Sin push (queda para el orquestador post-gates)
