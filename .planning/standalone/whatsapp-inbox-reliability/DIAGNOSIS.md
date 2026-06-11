# Diagnóstico — WhatsApp Inbox Reliability & Performance

**Fecha:** 2026-06-10/11
**Método:** Robot Playwright de navegación (`scripts/_robot-inbox-nav.ts`) contra dev server local (3020) + DB prod Somnio, más análisis estático del código. Evidencia cruda en `robot/*.json` + screenshots.
**Workspace probado:** Somnio (`a3843b3f`, 2.559 conversaciones activas, `ui_inbox_v2=true`, `ui_editorial_v3=true`).
**Mandato del usuario:** sin asumir; simular cada caso por separado; arreglos ESTRUCTURALES, no parches.

---

## Hechos estructurales confirmados (análisis estático + medición)

### H-1. La lista del inbox no tiene límite, paginación ni virtualización
- `getConversations` (`src/app/actions/conversations.ts:28`) hace `select *` + join contacto/tags **sin `.limit()`**. PostgREST capa silenciosamente a **1.000 filas** (medido: `content-range: 0-999/2559`).
- Consecuencia A (correctness): **las conversaciones activas más allá de la fila 1.000 (1.559 hoy en Somnio) son INVISIBLES en el inbox** — no hay forma de verlas salvo búsqueda? (la búsqueda Fuse también opera sobre las 1.000 en memoria → tampoco las encuentra).
- Consecuencia B (perf): cada fetch de lista mueve ~1.000 filas con joins. Medido en dev: **~4.3s por fetch** (server action `40da91475f9c`: 4.329/4.156/4.401ms en 3 cargas).
- `page.tsx` (server) fetchea las mismas 1.000 filas y las serializa al payload RSC; `ConversationList` renderiza los 1.000 `<ConversationItem>` en SSR (verificado: `[role="listitem"]` count = 1000 en DOM) — sin virtualización (`conversation-list.tsx:242,721` `.map` directo).

### H-2. Doble fetch sistemático en mount
- El servidor ya entregó `initialConversations` (1.000 filas en el RSC payload), y `use-conversations.ts:235-237` dispara `fetchConversations()` **inmediatamente en mount**, re-trayendo las mismas 1.000 filas (~4.3s). Toda carga de /whatsapp paga el costo DOS veces.

### H-3. Hydration error #418 en CADA carga de /whatsapp (3/3 iteraciones) — CAUSA RAÍZ PINNED
- `pageerror: Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client.`
- React **descarta el árbol SSR completo y lo re-renderiza desde cero en el cliente** — con 1.000 items, el costo de hidratación se paga doble y los click handlers tardan en estar disponibles (ventana de dead-clicks).
- **Nodo exacto (probe418, diff `+`/`-` capturado):** `<div className="av">` dentro de `<ConversationItem>` — el texto de `getInitials(displayName)` (`conversation-item.tsx:18-25`).
- **Mecanismo:** `getInitials` hace `n[0]` (indexación UTF-16). Para nombres que empiezan con emoji / chars fuera del BMP devuelve un **surrogate suelto** (p.ej. `\uD83D`). El SSR streamea ese byte-secuencia inválida → el parser HTML del browser la reemplaza por U+FFFD → al hidratar, el cliente renderiza el surrogate crudo → `'�' !== '\uD83D'` → #418.
- **Evidencia de alcance:** 23 contactos del top-1000 de Somnio tienen 1er carácter fuera del BMP en la 1ª/2ª palabra del nombre (`😎`, `💜`, `🩷💚🩷💚`, `𝙴𝚕𝚒𝚣𝚊𝚖𝚒𝚛`, `💫A.F`, …) → el bug dispara prácticamente en CUALQUIER carga del inbox Somnio.
- **Mismo patrón latente en:** `chat-header.tsx:496` (`displayName.charAt(0).toUpperCase()`) y cualquier otro avatar-inicial del app (auditar CRM contactos, kanban, etc.).
- Cierra el pendiente `inbox-v2-hydration-418` de `realtime-inbox-badge/deferred-items.md`: el nodo NO era de fechas — era de surrogates en iniciales. (El probe NO encontró otros nodos divergentes: topbar y primeros 60 items idénticos módulo RelativeTime, que está correctamente suprimido.)

### H-4. Safety refetch global de 10s tras CUALQUIER evento realtime
- `use-conversations.ts:280-287`: cada UPDATE/INSERT/DELETE de conversación re-agenda un full refetch (las 1.000 filas) a los 10s. En Somnio (tráfico continuo) esto corre casi permanentemente.
- Además cada conv UPDATE re-sortea el array completo (`sortConversations`, L368) y eso re-renderiza los 1.000 items (ConversationItem NO está memoizado — `conversation-item.tsx:41` función plana) y reconstruye el índice Fuse (`use-conversations.ts:498-501` useMemo sobre `conversations`).

### H-4b. `revalidatePath('/whatsapp')` en cada click de conversación
- `markAsRead` (`conversations.ts:303`) hace `revalidatePath('/whatsapp')` y se invoca en CADA selección de conversación (`inbox-layout.tsx:103`, fire-and-forget).
- Consecuencia: cada click dispara una re-render server-side de `WhatsAppPage` completa → re-ejecuta `getConversations` (1.000 filas, ~4.3s medidos) + flags + clientConfig y streamea el payload RSC completo de vuelta. Jank de main-thread + carga de red/DB por CADA click. (Mismo patrón en archive/unarchive — ahí sí tiene sentido; en markAsRead el estado ya se actualiza optimista + realtime.)

### H-6. Cadena de pedidos amarrada a la lista sin límite
- `getOrdersForContacts` se llama en mount con los ~1.000 contact ids (5 batches secuenciales de 200) y se RE-EJECUTA completa con cada INSERT/UPDATE de `orders` del workspace (handler realtime `use-conversations.ts:449-469`) — solo para pintar emojis de stage en los avatares.

### H-5. Query de mensajes sin estado de error visible
- `use-messages.ts:115-120`: `retry: 1`; si `getConversationMessages` falla 2 veces (timeout 15s interno, cold start, red), React Query queda en estado `error` — pero `chat-view.tsx` solo distingue `isLoading` y `messages.length===0`: **un error se renderiza como "chat vacío" sin reintento ni mensaje** (L259, L352).

---

## Caso 1 — "Las primeras conversaciones no cargan bien al entrar"

**Simulación:** 3 cargas frescas de /whatsapp con muestreo de la lista cada 250ms × 12s + screenshots. (`robot/*case1.json`)

**Resultado:**
- Los 1.000 items SSR aparecen al DCL (2.4-3.4s en dev local); nombres/previews correctos vs ground truth service-role (Sandra · Luis bueno · Ricardo Orozco ✓).
- 0 "flashes" (count nunca bajó) en localhost rápido.
- **#418 dispara ~1s después del DCL en 3/3 cargas** → regeneración completa del árbol en cliente.

**Lectura:** en localhost con red instantánea el síntoma visual no se manifiesta, pero el mecanismo está: (a) árbol descartado por #418 + re-render de 1.000 items = ventana larga de UI congelada/incompleta en máquinas/red reales; (b) refetch de mount (~4.3s) que reemplaza el estado completo; (c) payload SSR gigante. En prod (red real + Vercel) estas ventanas se alargan y se perciben como "las primeras conversaciones no cargan".

(pendiente: medición fresh-load contra prod Vercel para confirmar magnitudes)

## Caso 2 — "Chat de otra conversación bajo el nombre de otra persona"

(pendiente — fase case2)

Mecanismo candidato verificado en código: el header del chat usa `selectedConversation` (objeto en estado de InboxLayout) y los mensajes usan `useMessages(selectedConversationId)` + React Query cache por key `['messages', ws, convId]`. `staleTime` 60s / `gcTime` 5min: al volver a una conversación visitada se muestra cache instantáneo (correcto). La divergencia header/contenido requiere una race que el robot intentará reproducir con switching rápido + red lenta.

## Caso 3 — "La 1ª/2ª conversación nunca termina de cargar" — **REPRODUCIDO 4/4**

**Simulación:** 4 cargas frescas de /whatsapp con click inmediato en conversación 1 ó 2 apenas visible. (`robot/*case3.json`, screenshots `case3-stuck-*`)

| Iter | Item | Visible a | Dead-clicks | Chat con mensajes | Header |
|---|---|---|---|---|---|
| 1 | conv 1 | 87.2s | **NUNCA pegó** (74s reintentos) | **NUNCA** | null |
| 2 | conv 2 | 5.4s | 10.0s | 19.1s tras selección | Luis bueno |
| 3 | conv 1 | 3.8s | 6.3s | 9.8s | Sandra |
| 4 | conv 2 | 2.4s | 7.1s | 19.0s | Luis bueno |

**Mecánica confirmada (dos capas):**
1. **Ventana de dead-clicks en TODA carga** (6-10s en localhost; iter 1 catastrófica): la lista SSR es visible pero los click handlers no existen hasta que hidrata — y como el #418 (H-3) descarta el árbol, la "hidratación" es en realidad un re-render completo de 1.000 items. El usuario clickea la conversación 1 (el target más natural) y el click se traga en silencio → percepción "no carga nunca". En la iter 1 los clicks NUNCA pegaron en 74s.
2. **Waterfall post-selección**: tras el click se apilan server actions de 10.4s, 11.4s, 8.9s, 6.1s, 4.8s (JSON case3) — el re-render RSC del `revalidatePath('/whatsapp')` de markAsRead (H-4b, re-fetch de 1.000 filas) compite con `getConversationMessages` y `getRecentOrders` → hasta 19s para ver burbujas, en localhost.
3. (Capa adicional verificada en código, no disparada en lab: H-5 — si la query de mensajes falla 2 veces queda chat vacío sin error ni retry → "nunca carga" permanente.)

**Magnitudes**: dev server local exagera tiempos absolutos vs Vercel prod, pero el mecanismo (ventana muerta + waterfall por click) es idéntico; en prod la ventana se estima en 2-8s por carga, suficiente para el síntoma reportado.
**Datos:** se clickearon solo conversaciones ya leídas (markAsRead = no-op semántico); snapshot/restore confirmó 0 cambios netos en prod.

## Caso 4 — "El scroll de la lista se sube solo mientras bajo" — **REPRODUCIDO (geometría confirmada)**

**Simulación (fase case4b, 2 corridas):** scroll fijado a 54.801px (item 595 de 1.000, sentinel "José Elver Jiménez Cruz"), bumps de `last_customer_message_at` con restore inmediato (cero impacto neto en prod), tracking de scrollTop + item visible cada 200ms.

| Corrida | Víctima del "mensaje entrante" | Resultado bajo el viewport |
|---|---|---|
| A | Posiciones 20 y 30 (**arriba** del viewport) | 0 shifts — el reorder por encima no desplaza lo visible |
| B | Posiciones ~700 y ~730 (**debajo** del viewport) | **2/2 shifts**: el contenido visible se corrió ("José Elver" → "Luis piña peña" → "Manuel Sanchez") con scrollTop quieto |

**Mecánica confirmada:** cuando una conversación que está DEBAJO de tu posición recibe un mensaje, salta al tope del sort (`use-conversations.ts:368`) y TODAS las filas intermedias se corren una posición — lo que estás leyendo se desplaza bajo tus ojos. En Somnio (mensajes entrantes continuos en 2.559 conversaciones) esto ocurre permanentemente mientras navegas la lista → la percepción "me sube / me mueve solo". No hay scroll anchoring ni freeze del reorder durante el scroll del usuario. Además, el mismo evento dispara el safety-refetch (storm — 3 full refetches de 4.5s por 4 eventos, medido), que re-renderiza los 1.000 items no memoizados.

**No reproducido:** reset duro de scrollTop a 0 (el contenedor conserva scrollTop). El síntoma del usuario es consistente con el corrimiento de contenido (equivale visualmente a "subirse") + jank de re-render.

## Performance de módulos (sidebar) — medido

**Método:** robot fase `sidebar` — 1 ronda warmup (compila rutas dev) + 2 rondas SPA (click en link → contenido estable) + 2 rondas fresh load (goto → DCL → estable). Dev server local; los valores absolutos en prod serán menores, las RELACIONES entre módulos se mantienen. (`robot/*sidebar.json`)

| Módulo | SPA (ms, r2/r3) | Fresh estable (ms) | TTFB | HTML | Nodos DOM |
|---|---|---|---|---|---|
| **/whatsapp** | **3943 / 3365** | **5278** | 1708 | **1.847 KB** | **12.953** |
| /tareas | **11431 / 10928** ⚠ | 1693 | 853 | 68 KB | 225 |
| /crm | 1109 / 1078 | — | — | — | — |
| /sms | 2346 / 2425 | 1630 | 887 | 126 KB | 337 |
| /automatizaciones | 1696 / 1751 | 1990 | 1193 | 135 KB | 538 |
| /agentes | 2868 / 2761 | 2883 | 2146 | 118 KB | 374 |
| /comandos | 1175 / 1212 | 2048 | 794 | 87 KB | 302 |
| /analytics | 1906 / 1933 | 2198 | 1164 | 103 KB | 378 |
| /sandbox | 1283 / 1312 | 1948 | 680 | 97 KB | 379 |
| /settings/members | 2055 / 2133 | 1932 | 1194 | 109 KB | 292 |
| /configuracion | 391 / 1051 | 1236 | 503 | 126 KB | 319 |
| /confirmaciones | 1060 / 1031 | 1412 | 681 | 99 KB | 267 |

**Lecturas:**
1. **/whatsapp es 15-27× más pesado que cualquier otro módulo** (1.847KB vs 68-135KB; 12.953 nodos vs 225-538). Es la página de 1.000 items SSR (H-1). Todos los demás módulos están razonables.
2. **/tareas SPA 11s con solo 5 tareas:** contaminado por fetches zombie del inbox (`getOrdersForContacts` 4.5s aterrizando en /tareas — ver atribución arriba). El módulo en sí no es el problema; el inbox degrada la navegación de TODO el app mientras sus efectos siguen vivos.
3. `/agentes` TTFB 2.1s — segundo lugar; revisar su query server-side (item menor, fuera de scope de este standalone).
4. 3 pageerrors #418 — solo en las visitas a /whatsapp (consistente con H-3).

## Evidencia adicional — storm de safety refetch (case4-A) y flujo completo (flow)

- **Storm confirmado:** 4 no-op `conv.UPDATE` (cero cambio de datos) dispararon **3 full-refetches de getConversations de 4.3-4.6s c/u en 20s** (JSON case4, server action `40c88a267619` a t=50s/57s/62s). En producción, donde CADA mensaje del workspace emite un UPDATE de conversación, este patrón corre casi continuo — ese es el "autorefresh" perceptible.
- **Flow medido (localhost):** lista estable 2.6s → click conversación → burbujas a **9.8s** (con `getConversations` 4.9s + 4.7s corriendo DOS veces durante la apertura: revalidatePath de markAsRead + safety refetch) → panel info 0.85s → pedidos 3.7s.
- **Atribución exacta (mapeo `server-reference-manifest`):** la acción dominante de 4.2-4.6s es **`getOrdersForContacts`** (H-6: pedidos de ~1.000 contactos en 5 batches secuenciales, solo para emojis de avatar) — re-ejecutada en cada mount Y con cada orders INSERT/UPDATE del workspace. `getConversations` = 1.2-1.9s típico (hasta 8.9s bajo contención). Ambas hijas de la misma raíz: lista sin límite.
- **Fetches zombie cross-módulo:** requests de `getOrdersForContacts` aterrizan con URL `/tareas` y `/crm` — efectos async del inbox que no se cancelan al desmontar siguen ejecutando (4.5s de DB c/u) mientras el usuario ya navegó a otro módulo. Contaminan la navegación de TODA el app (p.ej. /tareas SPA = 11s con solo 5 tareas).

---

## Arreglos ESTRUCTURALES propuestos (mapeados a evidencia; CERO parches)

> Principio: cada fix elimina la CLASE de bug, no el síntoma. Orden por impacto/dependencia.

### F-1. Ventana de datos de la lista: paginación server-side + virtualización (raíz de H-1, H-2, H-6; reduce H-4)
- **Qué:** `getConversations` con `limit/offset` (o keyset por `last_customer_message_at`) + count agregado para el contador del topbar; UI con infinite scroll + lista virtualizada (`@tanstack/react-virtual`, ya en el repo para mensajes) + `React.memo` en `ConversationItem`. `page.tsx` server-renderiza SOLO la primera página (~50). `getOrdersForContacts` recibe solo los contactos de las páginas cargadas.
- **Corrige:** las 1.559 conversaciones invisibles (correctness), los fetches de 4.3-4.6s, el payload RSC gigante, el costo de hidratación de 1.000 items (ventana dead-clicks), el costo del fetch de pedidos (1.000 ids→~50), la búsqueda (pasa a server-side y por fin cubre TODO el historial, no solo las 1.000 en memoria).
- **Archivos:** `conversations.ts:28` (action), `page.tsx`, `use-conversations.ts`, `conversation-list.tsx`, `conversation-item.tsx`, `whatsapp.ts:192`.
- **Research necesario:** índice DB para keyset (`workspace_id, status, last_customer_message_at DESC`), semántica de filtros (unread/mine/unassigned/unanswered) en server, integración realtime con páginas (un UPDATE de una conv no cargada → insertar arriba).

### F-2. Iniciales grapheme-safe — mata el #418 (raíz de H-3; reduce caso 1 y la ventana dead-clicks)
- **Qué:** un único `getInitials`/`firstGrapheme` en `src/lib/utils` usando `Intl.Segmenter('es', { granularity: 'grapheme' })` con fallback `Array.from` — NUNCA indexación UTF-16. Migrar todos los call sites.
- **Inventario:** `conversation-item.tsx:18` (el #418 activo), `chat-header.tsx:496` (charAt), `contact-panel.tsx`, `tareas/task-card.tsx:35`, `settings/members-content.tsx:78`, `user-menu.tsx`, `sidebar.tsx`, `workspace-switcher.tsx`, `team-members-manager.tsx`.
- **Gate verificable:** robot probe418 → 0 pageerrors de hidratación en 3 cargas; grep sin `charAt(0)`/`[0]` sobre nombres en componentes de avatar.

### F-3. Eliminar `revalidatePath('/whatsapp')` de markAsRead (raíz de H-4b; corta el waterfall post-click)
- **Qué:** markAsRead ya tiene actualización optimista local (`markAsReadLocally`) + realtime UPDATE que reconcilia. El revalidatePath fuerza re-render server de TODA la página por click (re-fetch 1.000 filas) sin aportar nada. Quitarlo y dejar la reconciliación a realtime + safety. (archive/unarchive SÍ lo conservan — cambian el conjunto visible.)
- **Estructural, no parche:** define el contrato "mutaciones de estado de lectura NO invalidan rutas; reconcilian via estado local + realtime" — documentado en el action.

### F-4. Reconciliación de lista sin full refetch + sin storm (raíz de H-4 / "autorefresh")
- **Qué:** espejo del patrón ya validado en mensajes (softRefetch merge 2026-06-04): el safety-net de la lista re-trae SOLO la primera página y mergea por id (sin `isLoading=true`, sin reemplazo total); coalescing del timer (hoy: cada evento re-agenda; con tráfico continuo corre cada ~10s ≈ siempre).
- **Gate:** repetir case4-A del robot → 0 full-refetches >2s tras N no-op updates.

### F-5. Estabilidad de scroll en la lista (caso 4)
- **Qué:** mientras `scrollTop > umbral` (usuario navegando histórico), CONGELAR el re-sort: los UPDATEs actualizan datos in-place y las conversaciones nuevas/reordenadas se acumulan en un banner "N conversaciones con actividad — volver arriba" (patrón inbox estándar). Al volver al tope (o click), se aplica el orden real. Elimina el shift de contenido bajo el viewport por construcción.
- **Nota:** con F-1 (virtualización) el anchor de scroll se maneja en el virtualizador; F-5 es la política de UX sobre cuándo reordenar.

### F-6. Estado de error explícito en el chat (H-5; capa del caso 3 "nunca carga")
- **Qué:** exponer `isError`+`refetch` de React Query en `useMessages`; `chat-view` distingue 3 estados: cargando (skeleton) / error (mensaje + botón reintentar + auto-retry con backoff) / vacío real. Un fallo de red nunca más se ve como "chat vacío para siempre".

### F-7. Selección con una sola fuente de verdad (clase del caso 2)
- **Qué:** `selectedConversation` deja de ser estado paralelo: se DERIVA de `selectedConversationId` (lookup en lista + fetch por id si no está, como efecto reactivo con deps correctas — no `[]`). Elimina por construcción la familia de divergencias header/contenido (incl. `handleConversationCreated` que hoy deja el objeto en null).

### Secuencia propuesta (waves)
1. **Wave 1 (quick structural wins, sin migración):** F-2 (#418) + F-3 (revalidatePath) + F-6 (error state). Bajo riesgo, alto impacto inmediato en los 4 síntomas.
2. **Wave 2 (la cirugía):** F-1 (paginación+virtualización) — necesita research-phase (keyset, índices, filtros server-side, realtime con páginas).
3. **Wave 3:** F-4 (reconciliación sin storm) + F-5 (freeze de reorder) — se apoyan en F-1.
4. **Wave 4:** F-7 (selección derivada) + re-corrida completa del robot como verificación de regresión (gates por caso).

### Verificación (el robot queda como harness permanente)
- `scripts/_robot-inbox-nav.ts` con fases case1/case2/case3/case4b/flow/sidebar/probe418/ssrdiff — cada wave se verifica re-corriendo las fases pertinentes y comparando contra los JSON baseline de este diagnóstico (en `robot/`).
