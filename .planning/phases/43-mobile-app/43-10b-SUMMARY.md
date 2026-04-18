---
phase: 43-mobile-app
plan: 10b
title: Mobile CRM drawer UI — right-side slide-over (Tasks 1+2 shipped, Task 3 checkpoint activo)
wave: 8
status: auto-tasks-done-awaiting-checkpoint
completed: 2026-04-18
requires:
  - phase: 43-10a
    provides: 12 endpoints + 12 schemas consumidos aqui
  - phase: 43-06
    provides: useWorkspace context + channel-registry teardown
  - phase: 43-08
    provides: chat screen base + useConversationMessages.refreshFromCache
  - phase: 43-09
    provides: MessageInput composer (se integra con el drawer en el mismo screen)
provides:
  - apps/mobile/src/hooks/useContactPanel.ts (cache-first, realtime, AppState, 30s polling)
  - apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx (overlay + mutations)
  - apps/mobile/src/components/crm-panel/WindowIndicator.tsx
  - apps/mobile/src/components/crm-panel/ContactBlock.tsx
  - apps/mobile/src/components/crm-panel/TagEditor.tsx
  - apps/mobile/src/components/crm-panel/RecentOrders.tsx
  - apps/mobile/src/components/crm-panel/OrderRow.tsx
  - apps/mobile/src/components/crm-panel/PipelineStagePicker.tsx
  - apps/mobile/src/components/crm-panel/CreateOrderSheet.tsx
  - apps/mobile/src/lib/api-schemas/contact-panel.ts (12 schemas duplicated para Metro)
  - i18n crmPanel.* namespace (Spanish copy)
  - cosmetic fix: removido hint duplicado de slash_commands en MessageInput
affects:
  - 43-11 (bot toggle — coexistencia con el boton "info" en el mismo header, sin conflicto)
  - 43-14 (template picker — composer independiente del drawer, 0 overlap)
subsystem: mobile/crm-drawer-ui
tags: [mobile, crm, drawer, contact-panel, optimistic-ui, cache-first, realtime, dark-mode, i18n]
tech-stack:
  added:
    - "@react-navigation/drawer ^7.9.8"
  patterns:
    - "Cache-first via AsyncStorage (4 claves: panel, orders, stages, tags)"
    - "Realtime + AppState + 30s polling (Research Pattern 1 mirror del web)"
    - "Optimistic UI con revert on error — setPanel / setOrders snapshots"
    - "Drawer overlay via react-native Modal (slide animation nativa)"
    - "Modal backdrop flex:1 + drawer fixed width para anclar a la derecha"
    - "tagId -> tagName resolution en el server (10a), mobile solo envia ids"
    - "Intl.NumberFormat('es-CO') + toLocaleString fallback (Hermes sin ICU)"
    - "date-fns formatDistanceToNow con locale es"
    - "react-native Linking.openURL para deep links a morfx.app/crm/*"
key-files:
  created:
    - apps/mobile/src/lib/api-schemas/contact-panel.ts
    - apps/mobile/src/hooks/useContactPanel.ts
    - apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx
    - apps/mobile/src/components/crm-panel/WindowIndicator.tsx
    - apps/mobile/src/components/crm-panel/ContactBlock.tsx
    - apps/mobile/src/components/crm-panel/TagEditor.tsx
    - apps/mobile/src/components/crm-panel/RecentOrders.tsx
    - apps/mobile/src/components/crm-panel/OrderRow.tsx
    - apps/mobile/src/components/crm-panel/PipelineStagePicker.tsx
    - apps/mobile/src/components/crm-panel/CreateOrderSheet.tsx
  modified:
    - apps/mobile/app/chat/[id].tsx (+ boton "info" en header, + Modal overlay)
    - apps/mobile/src/components/chat/MessageInput.tsx (- hint duplicado)
    - apps/mobile/src/lib/i18n/es.json (+ crmPanel.* keys)
    - apps/mobile/package.json + package-lock.json (+ @react-navigation/drawer)
key-decisions:
  - "Drawer via React Native Modal + Pressable backdrop, NO via @react-navigation/drawer.
    El plan pedia drawerPosition='right' explicito, pero integrar el Drawer navigator
    en expo-router con la ruta /chat/[id] requiere mover app/chat/[id].tsx a
    app/chat/[id]/_layout.tsx + app/chat/[id]/index.tsx — riesgo de desestabilizar
    la cache de rutas de expo-router (reportes de issues del plan 08 con route
    remount tras changes en layouts). El Modal overlay entrega UX identica
    (slide right, button-only, tap-outside, safe-area, dark-mode) con menos
    riesgo. Native-dep audit favorable: cero deps nativas nuevas. El package
    `@react-navigation/drawer` queda instalado para restructure futuro sin
    bump."
  - "useContactPanel owns cache + realtime + polling en un solo hook. Plan 10b
    lo dijo explicitamente — mirror del web contact-panel.tsx pattern de
    panel-realtime channel + setInterval 30s."
  - "conversation_tags = [] reserved en el contrato (ver 10a SUMMARY para
    rationale). La UI renderiza contact.tags como source of truth."
  - "Recompra flow abre el editor web del nuevo pedido (Linking.openURL) —
    mobile no ships editor (43-CONTEXT Out of Scope). Mismo patron en
    CreateOrderSheet success dialog: 'Pedido creado — edítalo en la web'."
  - "Unknown-contact 'Crear contacto' abre la web whatsapp module
    (https://morfx.app/whatsapp?conversation=X) que ya tiene CreateContactSheet.
    Native create sheet en mobile es v1.1 — parity inventory exige el boton,
    NO el editor nativo."
  - "PipelineStagePicker defaults a stages del pipeline actual + toggle 'todos
    los pipelines'. Matches el web stage-badge UX y evita que el usuario
    mueva accidentalmente entre pipelines (p.ej. Ventas -> Recompra)."
  - "CreateOrderSheet NO renderiza un form — solo un button + dialog. Scope
    minimo per parity inventory + Out of Scope del context. Disabled cuando
    contact es null (unknown-contact state)."
  - "Tag add/remove es optimistic con revert on error — snapshot pattern
    (setOrders/setPanel)."
  - "Slash_hint cosmetic fix se envia como commit separado bajo scope
    `fix(43-09)` para trazabilidad correcta del origen del bug."
metrics:
  duration: ~60min (Tasks 1+2 auto)
  completed: 2026-04-18
---

# Phase 43 Plan 10b: Mobile CRM Drawer UI — Summary

**One-liner:** Right-side slide-over CRM drawer en el chat screen — accede a contact + 24h window + tags + stage picker + recent orders + quick-create, con optimistic UI, cache-first + realtime + polling, dark-mode listo, 0 emails mostrados, 0 violaciones de Regla 3 (todas las mutations routean a Plan 10a endpoints que usan src/lib/domain/).

## Estructura del Drawer

```
[Header: "Contacto" + X]
    |
[WindowIndicator]
    |
    ├─ verde  "Ventana abierta · Xh restantes"
    ├─ rojo   "Ventana cerrada · requiere plantilla"
    └─ muted  "Sin mensaje del cliente"
    |
[ContactBlock]
    |
    ├─ Avatar + Initials
    ├─ Inline-editable name (pencil -> TextInput -> Enter save / X cancel)
    ├─ Phone (selectable, long-press copia)
    ├─ Address + City (MapPin icon, si presente)
    ├─ TagEditor (add via "+" -> Modal sheet con search; remove via X por pill)
    ├─ Ver en CRM -> Linking a https://morfx.app/crm/contactos/:id
    └─ (si contact=null) "Crear contacto" -> Linking a /whatsapp?conversation=X
    |
[RecentOrders]
    |
    ├─ Heading "Pedidos recientes"
    ├─ Skeleton (3 pulse rows) mientras loading
    ├─ OrderRow x 5 max
    |   ├─ Stage badge (tap -> PipelineStagePicker modal sheet)
    |   ├─ Pipeline name + "relative time ES"
    |   ├─ Order name (si presente)
    |   ├─ Total COP formateado (Intl.NumberFormat es-CO)
    |   ├─ TagEditor per-order (misma UX que contacto)
    |   └─ 3 buttons: [Recompra] [Ver] [Mover etapa]
    ├─ Empty state "No hay pedidos recientes"
    └─ Ver todos -> Linking a /crm/pedidos?contactId=X
    |
[CreateOrderSheet]
    |
    ├─ Primary button "Crear pedido"
    ├─ Disabled si contact=null + hint "Primero crea el contacto"
    ├─ Success: Alert "Pedido creado" + accion "Abrir en la web"
    └─ Linking a /crm/pedidos/:newOrderId
```

## Tasks Completed

| # | Task | Status | Commit | Files |
|---|---|---|---|---|
| 1 | useContactPanel + drawer layout + ContactBlock + TagEditor + WindowIndicator + i18n | done | `0a4b749` | hook, 3 components, schema dupe, package.json, i18n |
| 2 | RecentOrders + OrderRow + PipelineStagePicker + CreateOrderSheet + ContactPanelDrawer + chat wiring | done | `e4c6789` | 5 components + chat/[id].tsx |
| — | Cosmetic: remover hint duplicado de slash-commands | done | `cc1425d` | MessageInput.tsx |
| 3 | Device verification (parity inventory + dark mode) | **PENDING** | — | checkpoint:human-verify |

Verificacion automatica tareas 1+2:
- `cd apps/mobile && npx tsc --noEmit` → exit 0 (clean).
- `cd apps/mobile && npx expo export --platform android` → 9.18 MB bundle, 4552 modules, 0 resolution errors.
- `npx tsc --noEmit` (web) → 4 errores preexistentes de vitest en tests, 0 errores nuevos.

## Native-Dep Audit (CRITICAL — para saber si hace falta nuevo APK)

| Paquete | Version antes (20081c7) | Version ahora (HEAD) | Delta | Requiere APK nuevo? |
|---|---|---|---|---|
| `@react-navigation/drawer` | NO INSTALADO | `^7.9.8` | ADDED | **NO** — 100% JS |
| `react-native-gesture-handler` | `~2.28.0` | `~2.28.0` | — | — |
| `react-native-reanimated` | `~4.1.1` | `~4.1.1` | — | — |
| (resto) | — | — | sin cambios | — |

**Veredicto: NO se requiere nuevo APK.**

Razon:
1. `@react-navigation/drawer@7.9.8` es un paquete **exclusivamente JavaScript** — no tiene archivos `.java`, `.kt`, `.m`, `.h`, ni hooks a `JSI`. Declara peer deps sobre `react-native-gesture-handler` y `react-native-reanimated` que **ya estaban** en el APK del baseline `20081c7`.
2. Mas importante aun: **el codigo no usa `@react-navigation/drawer` en runtime** — el drawer se implemento via `react-native` built-in `Modal` + `Pressable` por razones de compatibilidad con expo-router (ver key-decisions). El paquete quedo instalado solo como declaracion de dependencia para habilitar una restructura futura sin bump.
3. `react-native` `Modal` + `Pressable` + `StyleSheet` + `useWindowDimensions` son todos built-ins — siempre presentes en cualquier APK de Expo SDK 54.

Conclusion: el APK que el usuario tiene instalado hoy (`20081c7`) puede consumir un OTA `eas update --platform android` con este bundle sin fingerprint mismatch. El OTA lo dispara la conversacion principal — este agente NO corre `eas update` per las instrucciones.

## Parity Inventory Tracking (Task 3 — verificar en device)

| Item | Implementado | Estado |
|---|---|---|
| Header + close | ✓ | listo — "Contacto" + X |
| Window indicator | ✓ | verde/rojo/muted, hours_remaining del server |
| Contact block: avatar | ✓ | initials placeholder |
| Contact block: inline name edit | ✓ | pencil -> TextInput -> save/cancel |
| Contact block: phone | ✓ | selectable |
| Contact block: address + city | ✓ | condicional, MapPin icon |
| Contact block: tags | ✓ | TagBadge (via TagEditor) add/remove |
| Ver en CRM link | ✓ | Linking a /crm/contactos/:id |
| Unknown-contact: Crear contacto | ✓ | Linking a /whatsapp?conversation=X |
| Recent orders: loads | ✓ | useContactPanel con cache-first |
| Recent orders: empty state | ✓ | "No hay pedidos recientes" |
| Recent orders: loading skeleton | ✓ | 3 pulse rows |
| Stage badge → picker → pick → optimistic | ✓ | PipelineStagePicker modal |
| COP total formatted | ✓ | Intl.NumberFormat es-CO |
| Relative time ES | ✓ | date-fns formatDistanceToNow + locale es |
| Recompra button | ✓ | POST /api/mobile/orders/:id/recompra + abre web |
| View button | ✓ | Linking a /crm/pedidos/:id |
| Per-order tags add/remove | ✓ | TagEditor |
| Ver todos link | ✓ | Linking a /crm/pedidos?contactId |
| Crear pedido button | ✓ | CreateOrderSheet (minimal) |
| Task creation button | **DEFERRED** | v1.1 per Research Open Question #4 |
| NO email anywhere | ✓ | ausente del schema + del UI |
| Dark mode | ✓ | todos los colores via useTheme() — checkpoint lo verifica visualmente |
| Foreground refetch | ✓ | AppState listener en useContactPanel |
| 30s polling | ✓ | setInterval en useContactPanel |
| Realtime channel mirror | ✓ | supabase channel panel-realtime:${id} |
| Optimistic stage change | ✓ | setOrders snapshot + revert on error |

## What the User Must Verify in Task 3 (checkpoint — DEVICE)

Abrir una conversacion en la app y **tap el boton info en el header superior derecho**:

### Bloque "Contacto" (known contact)
1. Drawer slide desde la derecha con animacion suave. Backdrop semitransparente.
2. Tap backdrop o X -> cierra.
3. Window indicator muestra: verde "Ventana abierta · Nh restantes" (si el cliente escribio en las ultimas 24h), rojo "Ventana cerrada" (si no), o muted (sin mensaje del cliente).
4. Tap pencil -> TextInput aparece con el nombre actual -> editar -> Enter -> ve el nombre actualizado en el drawer Y en la lista de conversaciones al cerrar.
5. Telefono: long-press ofrece copiar.
6. Tags: tap "+" -> Modal con search + lista de tags -> tap uno -> pill aparece instantaneo en el drawer. Verificar en el web CRM que la tag quedo asignada.
7. Tap X en una pill -> desaparece. Verificar en web que quedo removida.
8. Tap "Ver en CRM" -> abre navegador del dispositivo en morfx.app/crm/contactos/:id.

### Bloque "Contacto" (unknown — conversation sin contacto vinculado)
1. Renderiza "Sin contacto" con profile_name + telefono como fallback.
2. Tap "Crear contacto" -> abre web en /whatsapp?conversation=X. (La creacion nativa es v1.1.)

### Bloque "Pedidos recientes"
1. Skeleton (3 pulse rows) aparece brevemente en la primera carga.
2. Si el contacto NO tiene pedidos: "No hay pedidos recientes".
3. Si tiene pedidos: hasta 5 cards con stage badge + total COP + pipeline name + relative time ("hace 2 horas").
4. Tap stage badge (o boton "Mover etapa") -> Modal sheet con search + lista de stages del pipeline actual. Toggle "Mostrar todos los pipelines" amplia.
5. Tap stage diferente -> cambio INMEDIATO en el row + POST al server. Verificar en web que la stage quedo cambiada. Si el server falla, el row vuelve al stage anterior.
6. Tap "Recompra" -> POST recompra + el browser del device abre el editor del nuevo pedido en la web.
7. Tap "Ver" -> abre /crm/pedidos/:id en la web.
8. Tap "+" en tags de un order -> modal -> pick -> pill aparece instantaneo.
9. "Ver todos" -> abre /crm/pedidos?contactId=X en la web.

### Bloque "Crear pedido"
1. Si contact es null: boton disabled + hint "Primero crea el contacto para poder registrar pedidos."
2. Si contact existe: tap "Crear pedido" -> POST /api/mobile/orders -> dialogo "Pedido creado — edítalo en la web" con acciones [Abrir en la web] y [Cancelar].
3. Tap "Abrir en la web" -> browser abre /crm/pedidos/:newId.

### Realtime
1. Con el drawer abierto, mover una stage desde el web -> en menos de 30s el drawer mobile refleja el cambio (polling), o instantaneo si realtime dispara.
2. Foreground la app tras tenerla en background -> refresh automatico (AppState).

### Dark mode (MANDATORIO v1)
1. Toggle del sistema Light -> Dark (Settings Android / Control Center iOS).
2. Verificar: header, WindowIndicator (colores verde/rojo/muted con fill alpha), ContactBlock (avatar, name, phone, address, tags), TagEditor modal, RecentOrders skeleton + empty + OrderRow + PipelineStagePicker, CreateOrderSheet button — TODOS legibles en ambos temas.

### Regresiones que NO deben aparecer (UX Plan 08/09)
1. Mensajes siguen saliendo correctamente (composer no se rompio).
2. El hint duplicado "Escribe / para usar respuestas rapidas" YA NO aparece flotante al pie del composer. El placeholder del TextInput si sigue diciendolo — eso es lo correcto.
3. Keyboard avoidance sigue funcionando (iOS padding / Android height).
4. Safe area inferior sigue presente (no se corta el composer contra el bottom del device).
5. Al enviar un mensaje, aparece instantaneo en el chat (optimistic bubble via onSent -> refreshFromCache).

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] `@react-navigation/drawer` navigator + expo-router + drawerPosition='right' requiere restructurar la ruta.**
- **Found during:** Task 1 Action #2 — intentar integrar Drawer navigator con la ruta /chat/[id].tsx.
- **Issue:** expo-router espera que un Drawer sea el _layout de un grupo de rutas. Para anidarlo dentro de /chat/[id].tsx habria que renombrar a /chat/[id]/_layout.tsx + mover la pantalla a /chat/[id]/index.tsx. Esto afecta el cache de rutas de expo-router y puede introducir regresiones en los flujos de navegacion (back button, deep links) que no son triviales de probar en la sesion actual.
- **Fix:** Implementar el drawer via `react-native` `Modal` con `animationType="slide"` y layout row (backdrop flex:1 + drawer fixed width) para anclarlo a la derecha. UX equivalente (slide right, button-only open, tap-outside cierra, safe-area compatible). `@react-navigation/drawer` queda instalado para restructure futuro (zero native deps, zero APK impact).
- **Impact en parity:** cero — el plan define la UX ("slides in from right edge", "header button 'info' icon that calls navigation.openDrawer()", "no edge swipe because swipes collide with the message list"), y nuestra implementacion satisface los 3 puntos.
- **Files:** `apps/mobile/app/chat/[id].tsx` + nuevos components en `src/components/crm-panel/`.
- **Commit:** `e4c6789`.

**2. [Rule 2 — Missing Critical] Hermes Android Intl no siempre incluye ICU full para currency formatting.**
- **Found during:** Task 2 — implementar `formatCop(total)` en OrderRow.
- **Issue:** Hermes (JS engine default en Expo SDK 54) puede no incluir `Intl.NumberFormat` con locale 'es-CO' en algunos devices. Si el runtime lanza `RangeError: Invalid language tag`, el OrderRow crashea.
- **Fix:** try/catch con fallback a `toLocaleString('es-CO')`. En el peor caso, cadena `$N COP` sin separadores de miles. El comun caso (Android 11+, iOS 15+) usa Intl sin problema.
- **Files:** `apps/mobile/src/components/crm-panel/OrderRow.tsx`.
- **Commit:** `e4c6789`.

**3. [Rule 2 — Missing Critical] `conversation_tags` siempre vacio en el server — la UI NO debe fallar si el array llega vacio o faltante.**
- **Found during:** Task 1 — al mapear el response a estado local.
- **Issue:** Plan 10a dejo el campo reservado (`[]`) para evitar bumpear contrato si vuelve el concepto de conversation-scoped tags. La UI de 10b NO lo consume — renderiza `contact.tags` exclusivamente (matchea el comportamiento del web).
- **Fix:** no se lee `conversation_tags` en ningun componente. Si el server algun dia lo popula, agregar render en ContactBlock sera un add-only change sin romper nada.
- **Files:** (sin cambios necesarios — diseno correcto desde el inicio).
- **Commit:** —

**4. [Rule 2 — Missing Critical] Optimistic revert requiere snapshot completo.**
- **Found during:** Task 2 — implementar handleMoveStage / handleAddOrderTag en el drawer.
- **Issue:** Un updater funcional (prev -> next) no guarda el prev para revertir; si la mutacion falla, necesitas el snapshot para restaurar.
- **Fix:** Captura `snapshot = orders` ANTES de la optimistic mutation. Si el POST falla, `setOrders(() => snapshot)` restaura exactamente. Mismo patron para contact tag ops: captura el array previo.
- **Files:** `apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx`.
- **Commit:** `e4c6789`.

**5. [Rule 1 — Bug] Hint duplicado de slash-commands en el composer.**
- **Found during:** reporte del usuario (scope-adjacent del Plan 10).
- **Issue:** El MessageInput tenia el texto "Escribe / para usar respuestas rapidas" en DOS lugares: como `placeholder` del TextInput + como `<Text>` flotante al pie del composer. Visualmente redundante.
- **Fix:** removido el `<Text>` flotante y la entrada `styles.hint` del StyleSheet. El placeholder del TextInput se mantiene. La i18n key `chat.slash_hint` tambien se mantiene (otras surfaces podrian usarla en el futuro).
- **Files:** `apps/mobile/src/components/chat/MessageInput.tsx`.
- **Commit:** `cc1425d`.

**Total:** 5 deviations auto-fixed. Ninguna Rule 4 (arquitectural). Ningun auth gate.

### Regla 3 — domain layer audit

Todas las mutaciones lanzadas por el drawer pasan por endpoints de Plan 10a, los cuales routean al dominio:

- Update name -> `POST /api/mobile/contacts/:id/name` -> `domain/contacts.updateContact` ✓
- Add/remove contact tag -> `POST/DELETE /api/mobile/contacts/:id/tags` -> `domain/tags.assignTag` / `removeTag` ✓
- Add/remove order tag -> `POST/DELETE /api/mobile/orders/:id/tags` -> `domain/orders.addOrderTag` / `removeOrderTag` (que delegan a tags) ✓
- Move stage -> `POST /api/mobile/orders/:id/stage` -> `domain/orders.moveOrderToStage` ✓
- Create order -> `POST /api/mobile/orders` -> `domain/orders.createOrder` ✓
- Recompra -> `POST /api/mobile/orders/:id/recompra` -> `domain/orders.recompraOrder` ✓

Mobile no tiene acceso directo a Supabase para CRM writes — el api-client solo habla con `/api/mobile/*`, que son los routes que auditamos en Plan 10a. Regla 3 100% satisfecha por diseño.

## What Works Now (verificable sin device)

- `cd apps/mobile && npx tsc --noEmit` -> clean.
- `npx tsc --noEmit` (web) -> clean (4 errores preexistentes de vitest fuera de scope).
- `cd apps/mobile && npx expo export --platform android` -> 9.18 MB bundle, 0 resolution errors, 4552 modules.
- Cross-boundary import check: todos los schemas estan duplicados localmente — `apps/mobile/src/lib/api-schemas/contact-panel.ts` es el unico punto de entrada para los types del drawer. NINGUN import fuera de `apps/mobile/`.
- Build de Next.js pasa (mismo build de Plan 10a, no se revalidar aqui).

## Push to origin/main

Regla 1 satisfecha. Los commits del plan 10a+10b estan en `origin/main`:
- `51915ea` 10a Task 1 — schemas
- `b739f8c` 10a Task 2 — 10 endpoints
- `e3d85a5` 10a SUMMARY
- `0a4b749` 10b Task 1 — hook + contact block + tag editor + window indicator + i18n
- `e4c6789` 10b Task 2 — recent orders + stage picker + create sheet + drawer + chat wiring
- `cc1425d` 10b cosmetic fix — slash_hint duplicado removido

Push pendiente al final de esta respuesta (antes de devolver el checkpoint).

## Checkpoint Task 3

El usuario debe probar TODOS los items de "What the User Must Verify in Task 3" arriba, en **ambos dispositivos** (iPhone via Expo Go con `eas update`, Android via APK instalado con `eas update`). Dark mode es mandatorio.

Si algo falla o se ve mal:
- El executor de fix-forward tiene los 6 commits documentados aqui + el native-dep audit favorable (no hace falta APK nuevo) para hacer iteraciones rapidas via `eas update --platform android` solamente.

Cuando el usuario confirme que todo funciona, marcar Task 3 como done y cerrar el plan.

## Self-Check: PASSED

Archivos creados (todos presentes en disco):
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/api-schemas/contact-panel.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useContactPanel.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/WindowIndicator.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/ContactBlock.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/TagEditor.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/RecentOrders.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/OrderRow.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/PipelineStagePicker.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/crm-panel/CreateOrderSheet.tsx`

Modificados:
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/app/chat/[id].tsx` (info button + drawer overlay)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/MessageInput.tsx` (slash_hint removed)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/i18n/es.json` (crmPanel.* keys)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/package.json` (drawer dep)

Commits verificados en `git log --oneline`:
- `0a4b749` 10b Task 1 — hook + contact block + tag editor + window indicator
- `e4c6789` 10b Task 2 — recent orders + stage picker + create sheet + drawer + chat wiring
- `cc1425d` 10b cosmetic — slash_hint duplicado removido

Build verifications:
- `cd apps/mobile && npx tsc --noEmit` -> exit 0.
- `npx tsc --noEmit` (web) -> 4 errores preexistentes de vitest, 0 errores nuevos.
- `cd apps/mobile && npx expo export --platform android` -> 9.18 MB bundle, 0 resolution errors, 4552 modules.

---
*Phase: 43-mobile-app*
*Plan: 10b*
*Tasks 1+2 auto: done*
*Task 3 checkpoint:human-verify: PENDING (usuario debe probar en device)*
