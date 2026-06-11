---
phase: standalone-whatsapp-inbox-reliability
plan: 03
subsystem: ui
tags: [whatsapp, inbox, react-query, error-state, chat-view, useMessages]

# Dependency graph
requires:
  - phase: standalone-whatsapp-inbox-reliability/01
    provides: "Wave 1 grapheme-safe initials (#418) — shared push gate"
  - phase: standalone-whatsapp-inbox-reliability/02
    provides: "Wave 1 markAsRead sin revalidate — shared push gate"
provides:
  - "useMessages expone isError + refetch (sin tocar retry: 1 ni el realtime/send)"
  - "chat-view distingue 3 estados: cargando (skeleton) / error (Reintentar) / vacio real"
  - "Un fallo de fetch de mensajes ya nunca se renderiza como 'chat vacio para siempre' (D-20)"
affects: [whatsapp-inbox, chat-view, use-messages, wave-1-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React Query isError + refetch surfaced del hook hacia un estado de error explicito en la UI"
    - "Branch de 3 estados mutuamente excluyentes: error gateado en isError, vacio real gateado en !isLoading && !isError"

key-files:
  created: []
  modified:
    - src/hooks/use-messages.ts
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx

key-decisions:
  - "retry: 1 se mantiene sin cambios (el auto-retry-con-backoff de D-20 antes de mostrar el error)"
  - "Copy es-CO: 'No se pudieron cargar los mensajes.' + boton 'Reintentar'"
  - "Clases mx-caption / mx-btn-ghost (ya presentes en chat-view y globals.css) para consistencia con el resto del inbox"

patterns-established:
  - "Estado de error recuperable: error branch + refetch manual, nunca un vacio indistinguible de un fallo de red"

requirements-completed: [F-6, D-20]

# Metrics
duration: ~10min
completed: 2026-06-11
---

# Standalone WhatsApp Inbox Reliability — Plan 03: Estado de error explicito del chat (F-6 / D-20)

**`useMessages` ahora expone `isError` + `refetch` y `chat-view` distingue 3 estados (cargando / error+Reintentar / vacio real), de modo que un fallo de red del fetch de mensajes nunca mas se renderiza como un chat vacio permanente.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-11
- **Tasks:** 2 automatizadas (T1, T2). T3 = gate robot Wave 1 + push (checkpoint, lo corre el orquestador).
- **Files modified:** 2

## Accomplishments
- `useMessages` destructura `isError` + `refetch` de su `useQuery` y los agrega al tipo `UseMessagesReturn` y al objeto de retorno — sin tocar `retry: 1`, `staleTime`/`gcTime`, el canal realtime, `sendMessage`/`scheduleSafetyRefetch` ni `softRefetch`.
- `chat-view` consume los dos campos nuevos y reemplaza el patron previo de 2 estados (cargando + vacio) por 3 estados mutuamente excluyentes:
  - cargando (skeleton existente, intacto)
  - error: `'No se pudieron cargar los mensajes.'` + boton `Reintentar` cableado a `refetch`
  - vacio real, gateado en `!isLoading && !isError` para que un error nunca se muestre como vacio.
- DIAGNOSIS H-5 (case 3, capa permanent-never-loads) cerrado por construccion: un fallo transitorio (timeout / cold-start / red) es recuperable, no un chat muerto.

## Task Commits

Cada tarea se commiteo atomicamente (solo los archivos de cada tarea staged):

1. **Task 1: useMessages expone isError + refetch** - `10b2a05e` (feat)
2. **Task 2: chat-view con 3 estados cargando/error/vacio** - `161d3b48` (feat)

_Task 3 (checkpoint:human-verify, gate bloqueante) NO ejecutada por este agente — ver "Wave 1 gate pendiente" abajo._

## Files Created/Modified
- `src/hooks/use-messages.ts` — `isError` + `refetch` agregados al destructure del `useQuery`, al tipo `UseMessagesReturn` y al objeto de retorno (10 inserts, 1 delete).
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` — consume `isError`/`refetch`; branch de error con `Reintentar`; estado vacio real re-gateado en `!isLoading && !isError` (20 inserts, 3 deletes).

## Decisions Made
- `retry: 1` se mantiene EXACTAMENTE como estaba (D-20: el reintento automatico ocurre antes de mostrar el estado de error; `refetch` es el reintento manual).
- Copy de error en es-CO segun el plan / PATTERNS.md (`'No se pudieron cargar los mensajes.'`, `'Reintentar'`). No hay formateo de fechas, asi que Regla 2 no aplica mas alla del idioma del texto.
- Se reusaron las clases `mx-caption` / `mx-btn-ghost` (verificadas en `globals.css` y ya usadas en `chat-view`) en vez de redisenar el estado vacio.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit` limpio tras cada tarea (0 errores nuevos). No se anadieron tests vitest en este plan (la suite `initials.test.ts` pertenece al plan 01 de Wave 1; la logica del branch de 3 estados queda cubierta por el gate `case3` del robot en T3).

## Wave 1 gate pendiente (Task 3 — lo corre el orquestador)

**Task 3 es un `checkpoint:human-verify` bloqueante NO ejecutado por este agente sequential.** Cubre el gate del robot + el push consolidado de toda la Wave 1 (planes 01 + 02 + 03):

- Gates robot contra dev server (puerto 3020): F-2 `probe418` x3 (0 pageerrors de hidratacion), F-3 `flow` (sin re-render RSC por click), F-6 `case3` (fallo de fetch -> estado error+Reintentar, no "chat vacio").
- `npx vitest run src/lib/utils/__tests__/initials.test.ts` verde (plan 01).
- `npx tsc --noEmit` -> 0 errores.
- Commit Spanish atomico de los archivos de los 3 planes + `git push origin main` (Regla 1).

**Este agente NO corrio los comandos del robot y NO pusheo** (mandato sequential: solo stagear mis archivos, no push; el orquestador maneja el gate y el push consolidado de Wave 1 tras este retorno). No hay migracion DB en Wave 1 -> sin pausa Regla 5.

## Next Phase Readiness
- F-6 listo y verificable por el harness del robot (gate `case3`).
- Wave 1 completa a nivel de codigo (F-2 plan 01 + F-3 plan 02 + F-6 plan 03); falta unicamente el gate robot + push consolidado (Task 3, orquestador).
- Siguiente: Wave 2 (F-1, la cirugia de paginacion keyset; requiere research + migracion DB con pausa Regla 5).

## Self-Check: PASSED

- FOUND: src/hooks/use-messages.ts
- FOUND: src/app/(dashboard)/whatsapp/components/chat-view.tsx
- FOUND: .planning/standalone/whatsapp-inbox-reliability/03-SUMMARY.md
- FOUND commit: 10b2a05e (Task 1)
- FOUND commit: 161d3b48 (Task 2)

---
*Phase: standalone-whatsapp-inbox-reliability*
*Completed: 2026-06-11*
