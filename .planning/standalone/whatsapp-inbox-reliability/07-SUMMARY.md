---
phase: standalone-whatsapp-inbox-reliability
plan: 07
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, selection, derived-state, single-source-of-truth, regression]
requires:
  - "05 (use-conversations paginado + getConversationById en el hook + virtualización)"
  - "06 (freeze/banner + softRefetchPage1 frozen-aware — el contrato de la lista quedó establecido)"
provides:
  - "selectedConversation DERIVADO de selectedConversationId (D-21) — cero estado paralelo que pueda divergir header/contenido"
  - "selection-derivation.ts: módulo puro (deriveSelectedConversation / shouldFetchById / resolveFetchedConversation) testeable en Node sin jsdom"
  - "fetch-by-id reactivo con deps correctas (NO []) — cubre ids deep-linked fuera de la página cargada"
  - "handleConversationCreated nunca deja el objeto seleccionado en null (fix de la familia de bugs D-21)"
affects:
  - "Wave 4 close-out (T2): full robot regression vs baselines + push + docs/LEARNINGS — los corre el ORQUESTADOR"
tech-stack:
  added: []
  patterns:
    - "Single source of truth: el id es estado; el objeto es derivado (const), nunca set en paralelo"
    - "Derivación parent/child: el hook (lista cargada) vive en el child ConversationList; el parent recibe la copia de lista vía push reactivo (onSelectedUpdated) + fetch-by-id como fallback — la copia de lista SIEMPRE gana"
    - "Helper puro extraído para testear el contrato de derivación en el env Node default (evita deps jsdom/testing-library que rompen next build)"
key-files:
  created:
    - src/app/(dashboard)/whatsapp/components/selection-derivation.ts
    - src/app/(dashboard)/whatsapp/components/__tests__/selection-derivation.test.tsx
  modified:
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
decisions:
  - "El plan asumía getConversationById + conversations en el mismo componente que selectedConversation; post-05/06 el hook vive en el CHILD (ConversationList). Se implementó el INTENTO de D-21 (cero estado paralelo) contra la arquitectura real: el parent deriva de listSelectedConversation (copia de lista pusheada por el child) ?? fetchedConversation. La dep equivalente a 'conversations' del plan es 'listSelectedConversation'."
  - "Test del contrato de derivación como módulo PURO en Node — ni jsdom ni @testing-library/react están instalados, y agregarlos por un solo test arriesga romper next build/Vercel (MEMORY: deps de sub-proyectos rompen el deploy)."
  - "El child pushea onSelectedUpdated también en ARRIVAL (id que aterriza en una página supera al objeto fetched), no solo en field-change — satisface el <behavior> 're-deriva al objeto de lista'."
metrics:
  duration: "~25 min"
  completed: "2026-06-11"
  tasks: "1/1 automatizada (T2 = gate robot completo + push + docs/LEARNINGS, del orquestador)"
  tests: "12 nuevos (selection-derivation) + 15 regresión (conversations-page) verdes"
  commits: 2
---

# Phase standalone-whatsapp-inbox-reliability Plan 07: F-7 Selección Derivada Summary

**One-liner:** `selectedConversation` deja de ser `useState` paralelo y pasa a ser un valor DERIVADO de `selectedConversationId` (única fuente de verdad) — la copia de la lista cargada (pusheada por `ConversationList`) gana sobre un fallback `fetch-by-id`, eliminando por construcción la divergencia header/contenido y el bug del objeto-null en `handleConversationCreated` (D-21).

## Tasks Completed

| Task | Name | Commit(s) | Files |
| ---- | ---- | --------- | ----- |
| 1 (TDD) | Derivar selectedConversation + test de derivación | `77b0c633` (RED) + `7018897b` (GREEN) | selection-derivation.ts, selection-derivation.test.tsx, inbox-layout.tsx, conversation-list.tsx |

## What Was Built

### Módulo puro `selection-derivation.ts`
Tres helpers que encapsulan el contrato D-21 (testeables sin browser):
- `deriveSelectedConversation(listObject, fetchedObject)` → `listObject ?? fetchedObject ?? null`. La copia de la lista SIEMPRE gana (una sola fuente para header + content; un row fresco con merge realtime supera un snapshot fetched stale del mismo id).
- `shouldFetchById(id, listObject)` → `true` solo si hay id real y NO está cubierto por la lista cargada.
- `resolveFetchedConversation(id, listObject, fetchedObject)` → limpia (null) cuando no hay id o cuando la lista ya posee el id; si no, conserva el objeto recién fetched.

### `inbox-layout.tsx` (parent — el dueño del id)
- ELIMINADO el `const [selectedConversation, setSelectedConversation] = useState(...)` paralelo (grep `setSelectedConversation\b` = 0).
- `selectedConversationId` = única fuente de verdad. `listSelectedConversation` (copia de lista, pusheada por el child) + `fetchedConversation` (fallback). `selectedConversation` = `deriveSelectedConversation(...)` — un `const` derivado, nunca `set` directo.
- `handleSelectConversation`: fluye por el id + guarda la copia de lista que pasa el child (chat abre sin round-trip).
- `handleConversationUpdatedFromList`: guarda la copia de lista autoritativa (select + cambios realtime).
- Efecto fetch-by-id con deps `[selectedConversationId, listSelectedConversation]` (NO `[]` — el bug del plan original): fetchea solo ids fuera de las páginas cargadas (deep-link `?c=`), con guard `cancelled` contra set stale en cambios rápidos, y limpia el fallback cuando el id ya está en la lista.
- `refreshSelectedConversation`: refresca la fuente que respalda la selección (lista si presente, si no el fetched) — sigue re-derivando.

### `conversation-list.tsx` (child — el dueño de la lista cargada vía `useConversations`)
- El efecto de sync ahora pushea `onSelectedUpdated` también en **ARRIVAL** (id que estaba deep-linked/fetched y aterriza en una carga de página: `!prev` pero `updated` existe) además del field-change preexistente → el parent re-deriva al objeto de lista y descarta el fetched.
- `handleConversationCreated`: tras `refresh()`, pasa el objeto ya cargado (`getConversationById(id)`) a `onSelect(id, created)` → **nunca deja el objeto en null** (fix D-21). Fallback fetch-by-id + arrival-push cubren el edge si no estuviera en página 1.

## Deviations from Plan

### Reconciliación con la realidad post-05/06 (mandato del quality_bar)

**1. [Plan vs realidad] El hook `useConversations` vive en el CHILD, no donde está `selectedConversation`**
- **Found during:** read_first de Task 1.
- **Issue:** El `<interfaces>` del plan (y PATTERNS 670-690) asumen `getConversationById` + `conversations` accesibles en el mismo componente que declara `selectedConversation`. Post-Plan-05, `useConversations` (y su `getConversationById`) viven en `ConversationList` (el child); `selectedConversation` vive en `inbox-layout` (el parent). El parent NO tiene acceso directo a la lista cargada.
- **Fix (intent over letter):** Se implementó el INTENTO de D-21 (eliminar el estado paralelo que diverge) contra la arquitectura real. El parent deriva de `listSelectedConversation` (la copia de lista que el child ya pushea vía `onSelect`/`onSelectedUpdated`) `??` `fetchedConversation`. La dependencia del efecto fetch-by-id equivalente a la `conversations` del plan es `listSelectedConversation`. El resultado cumple todos los gates del plan (parallel state removido, derivación `const`, deps ≠ `[]`, fetch-by-id cubre ids no cargados, create nunca null).
- **Files modified:** inbox-layout.tsx, conversation-list.tsx
- **Commit:** `7018897b`

**2. [Mejora dentro de plan] Test como módulo PURO en Node, no React-render**
- **Found during:** Task 1 (RED).
- **Issue:** El env vitest default es Node; ni `jsdom` ni `@testing-library/react` están instalados. El plan pide un test que "use the repo's existing test conventions" — y la convención del repo (`vitest.config.ts`) es Node-default; los component tests requerirían opt-in jsdom + deps nuevas.
- **Fix:** Se extrajo la LÓGICA de derivación (que es exactamente lo que D-21 contrata) a `selection-derivation.ts` puro y se testeó en Node. Evita agregar deps de browser por un solo test (MEMORY: deps de sub-proyectos rompen `next build`/Vercel). 12 casos cubren los 5 `<behavior>` del plan.
- **Commit:** `77b0c633` (RED) + `7018897b` (GREEN)

## Known Stubs

None — no hay datos hardcodeados ni placeholders. La derivación renderiza siempre datos reales (copia de lista o fetch-by-id real).

## Threat Flags

None — no se introdujo superficie nueva fuera del threat model del plan. T-wir-14 (cross-workspace id en fetch-by-id) mitigado: `getConversation` corre bajo RLS via `createClient()` + auth de workspace — un id fuera del workspace retorna nada. T-wir-15 (divergencia header/contenido) mitigado por construcción: id único → objeto derivado, sin estado paralelo.

## Verification

- `npx vitest run .../selection-derivation.test.tsx` → 12/12 verdes.
- `npx vitest run .../conversations-page.test.ts` → 15/15 verdes (regresión del contrato de la lista paginada que respalda la derivación).
- `npx tsc --noEmit` → 0 errores en archivos del proyecto (ignorando `.next/dev/types/*`); 0 errores en `inbox-layout`/`conversation-list`/`selection-derivation`.
- Gates grep del plan: `setSelectedConversation\b` = 0 ✓; `selectedConversation` es `const` derivado (no `useState`) ✓; deps del efecto fetch-by-id incluyen `listSelectedConversation` (NO `[]`) ✓.

## ⏳ Wave 4 close-out pendiente — lo corre el ORQUESTADOR (Task 2, checkpoint:human-verify)

Este ejecutor ejecutó SOLO T1 (automatizada). T2 (gate bloqueante) es mandato del orquestador:
1. **Full robot regression** vs baselines en `robot/` (D-23): `probe418 / case1 / case3 / case4 / case4b / flow / sidebar` contra dev:3020 — criterios acumulativos por wave (W1 #418, W2 paginación/sidebar, W3 coalescing/freeze, W4 header/content sin divergir). Somnio LIVE → mandatorio pre-push.
2. **Todos los vitest** tocados verdes (selection-derivation + conversations-page + cualquier otro).
3. `npx tsc --noEmit` → 0 errores (predice Vercel build verde).
4. **Push a origin/main** (Regla 1) — este ejecutor NO hizo push.
5. **Docs (Regla 4):** actualizar `docs/analysis/04-estado-actual-plataforma.md` (módulo inbox: paginación/virtualización/#418/divergencia resueltos) + crear `LEARNINGS.md` del standalone (Regla 0 paso 7): el keyset NULL-drop trap (P1), el mecanismo surrogate→#418, el gotcha mounted-ref vs AbortController-para-server-actions, el patrón freeze-banner, y el patrón derivación parent/child con copia-de-lista-gana.
6. Sin migración DB en Wave 4 → sin pausa Regla 5.

**Nota concurrencia:** la sesión Claude concurrente (agent-varixcenter) commiteó `ae0c5147` entre el RED (`77b0c633`) y el GREEN (`7018897b`) de este plan — ignorado (rama compartida, trabajo ajeno).

## Self-Check: PASSED

- [x] src/app/(dashboard)/whatsapp/components/selection-derivation.ts — FOUND
- [x] src/app/(dashboard)/whatsapp/components/__tests__/selection-derivation.test.tsx — FOUND
- [x] Commit `77b0c633` (RED) — FOUND en git log
- [x] Commit `7018897b` (GREEN) — FOUND en git log
- [x] tsc 0 errores en archivos del proyecto; 12/12 + 15/15 tests verdes
- [x] `setSelectedConversation\b` = 0 en inbox-layout.tsx; derivación es `const`; deps del efecto ≠ `[]`
- [x] Este ejecutor NO hizo push (queda para el orquestador post-gates T2)
