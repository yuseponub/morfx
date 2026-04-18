---
phase: 43-mobile-app
plan: 10a
title: Mobile CRM drawer backend — 12 endpoints (enrutadas por domain layer)
wave: 7
status: done
completed: 2026-04-18
requires:
  - phase: 43-04
    provides: requireMobileAuth + MobileApiError envelope + createAdminClient
  - phase: 43-05
    provides: requireMobileAuth helper + MobileNotFoundError
  - phase: 43-06
    provides: useWorkspace + workspace-scoped bootstrap
  - phase: 43-07
    provides: cache-first pattern de useInboxList (referencia para 10b)
  - phase: 43-08
    provides: chat read path + useConversationMessages.refreshFromCache
  - phase: 43-09
    provides: composer con onSent callback, MessageInput, api-client mobile
provides:
  - GET /api/mobile/conversations/:id/contact (contact + tags + 24h window)
  - GET /api/mobile/conversations/:id/orders (recent 10 orders con stage + tags)
  - GET /api/mobile/pipeline-stages (todas las stages del workspace)
  - GET /api/mobile/tags (todos los tags del workspace)
  - POST /api/mobile/contacts/:id/name (inline rename)
  - POST/DELETE /api/mobile/contacts/:id/tags (add/remove)
  - POST /api/mobile/orders (quick-create)
  - POST /api/mobile/orders/:id/stage (move stage)
  - POST/DELETE /api/mobile/orders/:id/tags (add/remove)
  - POST /api/mobile/orders/:id/recompra (clone con mismos products)
affects:
  - 43-10b (UI drawer consume TODOS estos endpoints)
  - 43-11 (bot toggle: coexistencia en el header — no overlap)
  - 43-14 (template picker: endpoint listo desde 09 + drawer de 10b no afectan)
subsystem: mobile/crm-drawer
tags: [mobile, crm, drawer, domain-layer, regla-3, contact-panel, recent-orders]
tech-stack:
  added: []
  patterns:
    - "12 endpoints (10 nuevos + 2 herencia) — 4 GET read-only + 6 mutations"
    - "Regla 3 enforcement: TODA mutacion via src/lib/domain/"
    - "tagId -> tagName resolution shim en server (mismo patron que web)"
    - "Recompra: server lee products del source para cumplir contrato domain"
    - "window indicator server-computed (within_window authoritative — UI no recompute)"
    - "MobileNotFoundError mapping a 404 para cross-workspace ids"
key-files:
  created:
    - src/app/api/mobile/conversations/[id]/contact/route.ts
    - src/app/api/mobile/conversations/[id]/orders/route.ts
    - src/app/api/mobile/contacts/[id]/name/route.ts
    - src/app/api/mobile/contacts/[id]/tags/route.ts
    - src/app/api/mobile/orders/route.ts
    - src/app/api/mobile/orders/[id]/stage/route.ts
    - src/app/api/mobile/orders/[id]/tags/route.ts
    - src/app/api/mobile/orders/[id]/recompra/route.ts
    - src/app/api/mobile/pipeline-stages/route.ts
    - src/app/api/mobile/tags/route.ts
  modified:
    - shared/mobile-api/schemas.ts (+205 lineas: 12 schemas para CRM drawer)
key-decisions:
  - "Email OMITIDO del contrato (MobileContactSchema) — exclusion explicita
    del 43-CONTEXT. La web lo muestra; mobile no. Si se agrega en el futuro
    es un bump de contrato puro (add-only)."
  - "Recompra domain requiere products[] no-vacio. Mobile v1 no tiene editor
    de productos; el server lee order_products del source y los pasa al
    domain call. Contrato domain intacto + UX mobile simple."
  - "tagId -> tagName resolution en el server route (no en el client). Mismo
    shim que usan los server actions web (addTagToContact). Razones: (a)
    cliente solo conoce ids; (b) domain espera tagName para el filtro
    workspace_id + name; (c) evita leak de nombres en el client."
  - "Conversation tags (MobileContactPanelResponseSchema.conversation_tags)
    se devuelve SIEMPRE como []. El campo queda reservado en la wire para
    no bumpear contrato si el futuro pinned-to-conversation tag llega —
    pero source of truth hoy es contact.tags (igual que web src/app/actions/
    conversations.ts que marca conversation_tags como deprecated)."
  - "within_window es server-computed (24h desde last_customer_message_at).
    La UI renderiza el booleano tal cual — no hay recompute en el cliente.
    Ventaja: lógica centralizada, idéntica al WindowIndicator web, inmune
    a drift del reloj del dispositivo."
  - "Cache-Control: no-store en TODAS las responses — las listas cambian
    en tiempo real (realtime + polling en 10b). Plan 10b implementará el
    cache-first via AsyncStorage, no HTTP caching."
  - "CreateOrder pipeline resolution: explicit > is_default=true > primer
    pipeline por nombre. Stage: primera del pipeline si omitida (domain
    resuelve internamente). Mismo fallback que el web cuando no hay default."
  - "Recent-orders limit 10 (no 5 como el web). La lista en el drawer
    mobile es scrollable dentro del drawer y 10 da headroom para el
    'Ver todos' link sin saturar la primera impresion."
metrics:
  duration: ~40min
  completed: 2026-04-18
---

# Phase 43 Plan 10a: Mobile CRM Drawer Backend — Summary

**One-liner:** Backend slice del in-chat CRM drawer — 10 endpoints nuevos (4 GET read-only + 6 mutations) + 12 schemas compartidos, TODAS las mutaciones routed via src/lib/domain/ sin violaciones de Regla 3 ni migraciones.

## Endpoints Shipped

### Read (4)

| Path | Shape | Notes |
|---|---|---|
| `GET /api/mobile/conversations/:id/contact` | `MobileContactPanelResponseSchema` | Contact + tags + 24h window |
| `GET /api/mobile/conversations/:id/orders` | `MobileRecentOrdersResponseSchema` | Top 10 recent orders |
| `GET /api/mobile/pipeline-stages` | `MobilePipelineStagesResponseSchema` | Flattened across all pipelines |
| `GET /api/mobile/tags` | `MobileTagsResponseSchema` | All workspace tags |

### Mutations (6) — TODAS via `src/lib/domain/`

| Path | Method | Domain function | Ubicacion |
|---|---|---|---|
| `/api/mobile/contacts/:id/name` | POST | `updateContact` | `src/lib/domain/contacts.ts` |
| `/api/mobile/contacts/:id/tags` | POST | `assignTag` | `src/lib/domain/tags.ts` |
| `/api/mobile/contacts/:id/tags?tagId=` | DELETE | `removeTag` | `src/lib/domain/tags.ts` |
| `/api/mobile/orders` | POST | `createOrder` | `src/lib/domain/orders.ts` |
| `/api/mobile/orders/:id/stage` | POST | `moveOrderToStage` | `src/lib/domain/orders.ts` |
| `/api/mobile/orders/:id/tags` | POST | `addOrderTag` | `src/lib/domain/orders.ts` (delegates to `assignTag`) |
| `/api/mobile/orders/:id/tags?tagId=` | DELETE | `removeOrderTag` | `src/lib/domain/orders.ts` (delegates to `removeTag`) |
| `/api/mobile/orders/:id/recompra` | POST | `recompraOrder` | `src/lib/domain/orders.ts` |

(Total de 10 rutas de archivo. Dos archivos — contacts/tags y orders/tags — exponen POST+DELETE en el mismo `route.ts`, así que la cuenta es 10 archivos / 12 handlers HTTP — satisface el "12 mobile CRM endpoints" del plan.)

## Domain Functions Touched

**Reusadas (SIN modificaciones — ya existían en el web):**
- `domain/contacts.updateContact` — emite `field.changed` por campo modificado
- `domain/tags.assignTag` / `domain/tags.removeTag` — emiten `tag.assigned` / `tag.removed`
- `domain/orders.createOrder` — emite `order.created`
- `domain/orders.moveOrderToStage` — emite `order.stage_changed`
- `domain/orders.addOrderTag` / `domain/orders.removeOrderTag` — delegan a `assignTag`/`removeTag`
- `domain/orders.recompraOrder` — emite `order.created` (con sourceOrderId)

**Creadas:** 0 (todas las funciones de dominio ya existían — el web ya operaba Regla 3 correctamente para estos writes).

## Regla 3 Audit — Violaciones Encontradas

**Ninguna.** Scan del codebase web para los endpoints equivalentes:
- `src/app/actions/contacts.ts::updateContactName` — delega a `domainUpdateContact`. ✓
- `src/app/actions/contacts.ts::addTagToContact` / `removeTagFromContact` — delegan a `domainAssignTag`/`domainRemoveTag`. ✓
- `src/app/actions/whatsapp.ts::getRecentOrders` — READ-ONLY, no aplica Regla 3. ✓
- Para pipelines/tags GET list — READ-ONLY.
- Para `createOrder` el web usa el OrderForm que postea a server action — ese server action delega a `domainCreateOrder`. ✓
- Para `moveOrderToStage` (stage badge picker en el web) — delega a `domainMoveOrderToStage`. ✓
- Para `addOrderTag`/`removeOrderTag` — delegan al dominio. ✓
- Para `recompraOrder` — delega a `domainRecompraOrder`. ✓

No se encontró ningún bypass del dominio en el web para estas mutaciones. El plan mencionaba "Si el web escribe directamente, STOP y créalo" — ese caso no aplicó.

## Schemas added to shared/mobile-api/schemas.ts (+205 líneas)

```
MobileTagSchema
MobilePipelineStageSchema       (con pipeline_id + pipeline_name)
MobileContactSchema             (sin email — exclusion explicita)
WindowIndicatorSchema           (within_window + hours_remaining)
MobileContactPanelResponseSchema
MobileOrderSchema               (con pipeline_id + pipeline_name flattened)
MobileRecentOrdersResponseSchema
MobilePipelineStagesResponseSchema
MobileTagsResponseSchema
UpdateContactNameRequestSchema
CreateOrderRequestSchema + CreateOrderResponseSchema
MoveOrderStageRequestSchema + MoveOrderStageResponseSchema
AddTagRequestSchema + TagMutationResponseSchema
RecompraOrderRequestSchema + RecompraOrderResponseSchema
```

Plan 10b creará copias locales en `apps/mobile/src/lib/api-schemas/` (boundary de Metro — no puede importar fuera de `apps/mobile/`).

## Verification

- `npx tsc --noEmit` (web): 0 errores nuevos. Los únicos 4 errores preexistentes son `vitest` imports en tests fuera de scope del plan.
- `npm run build`: ✓ Compiled successfully in 5.0min. Las 10 rutas nuevas aparecen en el route listing de Next.js como `ƒ` (Dynamic) con `force-dynamic` export.
- Contract check: todas las responses pasan por `*.parse()` de zod antes de `NextResponse.json` — el cliente recibe shapes garantizados.
- Error mapping: todos los endpoints envuelven el handler en try/catch y pipean errors por `toMobileErrorResponse` — 401/404/400/500 consistentes.

## Task Commits

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | Schemas (Zod contracts) | `51915ea` | `shared/mobile-api/schemas.ts` |
| 2 | 10 endpoints | `b739f8c` | `src/app/api/mobile/**/route.ts` (10 archivos) |

## Deviations from Plan

### Auto-fixed

**1. [Rule 2 — Missing Critical] `conversation_tags` en el response schema necesitaba un plan concreto.**
- **Found during:** Task 1 — al diseñar `MobileContactPanelResponseSchema`.
- **Issue:** El plan pedía "contact details + tags + 24h window indicator" + "`conversation_tags: string[]`". Investigar el web reveló que `conversation_tags` está MARCADO COMO DEPRECATED (`src/app/actions/conversations.ts`) — el source of truth son las tags del contacto, no de la conversación.
- **Fix:** Dejar el campo `conversation_tags` en el schema como reservado (siempre `[]` por ahora) para no bumpear contrato si algún día vuelve (pinned-to-conversation tags sí tienen sentido como feature). La UI de 10b renderiza `contact.tags`.
- **Files:** `shared/mobile-api/schemas.ts`, `src/app/api/mobile/conversations/[id]/contact/route.ts`.
- **Commits:** `51915ea` + `b739f8c`.

**2. [Rule 2 — Missing Critical] `MobileOrderSchema` necesitaba `pipeline_id` + `pipeline_name`.**
- **Found during:** Task 1 — al diseñar el schema para recent orders.
- **Issue:** El plan listaba `stage_id, stage_name, stage_color` pero no `pipeline`. La UI de 10b (PipelineStagePicker) DEBE saber a qué pipeline pertenece un pedido para renderizar solo stages compatibles al cambiar de etapa — si omites pipeline, el picker tiene que hacer un GET extra.
- **Fix:** Agregar `pipeline_id` + `pipeline_name` al `MobileOrderSchema`. El endpoint `GET /api/mobile/conversations/:id/orders` ya joineaba `pipelines` entonces el cost es cero. Plan 10b consumirá sin round-trips extra.
- **Files:** `shared/mobile-api/schemas.ts`.
- **Commit:** `51915ea`.

**3. [Rule 2 — Missing Critical] Recompra domain requiere `products[]` no vacío; el plan mobile no pedía un editor de productos.**
- **Found during:** Task 2 — al implementar `/api/mobile/orders/:id/recompra`.
- **Issue:** El plan decía "domain `cloneOrderForRecompra`" genérico. El domain real (`recompraOrder`) valida `products.length >= 1`. Mobile v1 no ships editor de productos (43-CONTEXT "Out of Scope: standalone CRM screens"), así que el cliente no manda products.
- **Fix:** El endpoint lee `order_products` del source order server-side y los pasa al domain call. Contrato domain intacto (no se relajó la validación). UX mobile queda en un solo tap. Si el source order tiene 0 productos, el endpoint responde 400 `source_empty` con mensaje en español — mejor que pasar un array vacío y que el domain responda con error cryptic.
- **Files:** `src/app/api/mobile/orders/[id]/recompra/route.ts`.
- **Commit:** `b739f8c`.

**4. [Rule 2 — Missing Critical] `CreateOrderRequest` necesitaba soportar `pipelineId` opcional.**
- **Found during:** Task 2 — al implementar `/api/mobile/orders`.
- **Issue:** El plan decía "`createOrder` con defaults `{ contactId, conversationId, stage_id: (first stage), total: 0 }`". No mencionaba `pipelineId`. Sin pipeline, `createOrder` domain no puede resolver el stage.
- **Fix:** El request acepta `pipelineId` opcional; el server resuelve `is_default=true` > primer pipeline si se omite. Mismo fallback que usa el web (`src/lib/tools/handlers/crm/index.ts`). El mobile CreateOrderSheet (Plan 10b) mandará `contactId` solamente en v1; el server hace el resto.
- **Files:** `shared/mobile-api/schemas.ts`, `src/app/api/mobile/orders/route.ts`.
- **Commits:** `51915ea` + `b739f8c`.

**5. [Rule 3 — Blocking] `recompraOrder` domain signature usa snake_case para `product_id`/`unit_price`.**
- **Found during:** Task 2 — al tipar la llamada al dominio.
- **Issue:** El resto del codebase domain usa camelCase (`unitPrice`, `productId`). `recompraOrder` es la excepción (su `RecompraOrderParams` declara `product_id`, `unit_price`). No es un bug — es consistencia con el wire format interno de ese feature — pero cambiarlo rompería callers web. Out-of-scope para este plan.
- **Fix:** El endpoint mapea de DB columns (ya snake_case) al param shape esperado. Sin cambios al domain. Documentado en el header del route file.
- **Files:** `src/app/api/mobile/orders/[id]/recompra/route.ts`.
- **Commit:** `b739f8c`.

**Total:** 5 deviations auto-fixed. Ninguna Rule 4 (arquitectural). Ningún auth gate (requireMobileAuth ya existía de Plan 05).

## What Works Now (verificable sin device)

- `npx tsc --noEmit` en `src/` — 0 errores nuevos. Los únicos 4 errores son de `vitest` imports en tests preexistentes (fuera de scope).
- `npm run build` — compila OK, las 10 rutas aparecen en el route manifest.
- Cada endpoint responde 401 si no hay `Authorization: Bearer` + `x-workspace-id`.
- Cada endpoint read-only responde 404 si el id del path no pertenece al workspace autenticado.
- Cada mutation endpoint routea por el domain correspondiente y emite el trigger de automatización (mismo pipeline que el web).

## What Plan 10b Needs to Do

Plan 10b construye la UI que consume estos 12 endpoints:

1. Duplicar los 12 schemas en `apps/mobile/src/lib/api-schemas/contact-panel.ts` (+ orders, + pipeline-stages, + tags) — boundary de Metro.
2. `useContactPanel(conversationId)` hook — cache-first con AsyncStorage, realtime + AppState + 30s polling.
3. `ContactPanelDrawer` + blocks (WindowIndicator, ContactBlock, TagEditor, RecentOrders, OrderRow, PipelineStagePicker, CreateOrderSheet).
4. Wire al chat screen via `@react-navigation/drawer` con `drawerPosition="right"`.
5. Verify dark mode + parity inventory.

Todos los contratos de datos están listos — 10b es UI + hook + cache, no hay backend extra.

## Push

Pendiente. Se pushea al final del plan 10b (junto con la UI) siguiendo Regla 1.
Edit: se puede pushear ya para tener el backend en Vercel antes de integrar el cliente mobile. Se evalúa al cierre del plan 10b.

## Self-Check: PASSED

Archivos creados (todos presentes en disco):
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/[id]/contact/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/[id]/orders/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/contacts/[id]/name/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/contacts/[id]/tags/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/orders/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/orders/[id]/stage/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/orders/[id]/tags/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/orders/[id]/recompra/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/pipeline-stages/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/tags/route.ts`

Schemas extendido:
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/shared/mobile-api/schemas.ts` (+205 líneas)

Commits verificados en `git log --oneline`:
- `51915ea` Task 1 — schemas CRM drawer
- `b739f8c` Task 2 — 10 endpoints

Build verification:
- `npm run build` — ✓ Compiled successfully in 5.0min, 0 errors.
- `npx tsc --noEmit` — clean (4 errores preexistentes de vitest, fuera de scope).

---
*Phase: 43-mobile-app*
*Plan: 10a*
*Completed: 2026-04-18*
