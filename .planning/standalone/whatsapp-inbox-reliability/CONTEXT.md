# Standalone: WhatsApp Inbox Reliability — Context

**Gathered:** 2026-06-11 (modo `--auto` por delegación explícita del usuario)
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminar las CLASES de bug que causan los 4 síntomas reportados del inbox WhatsApp (`/whatsapp`) en Somnio (2.559 conversaciones activas): conversaciones que "no cargan", chat que "nunca abre", scroll que "se sube solo" y autorefresh perceptible. Implementa los 7 fixes estructurales F-1..F-7 del DIAGNOSIS (causas raíz H-1..H-6, todas con evidencia del robot Playwright) en 4 waves, con el robot como harness de regresión.

**Fuera de scope:** TTFB de `/agentes` (item menor anotado en DIAGNOSIS), cualquier cambio a agentes conversacionales, realtime auth (standalone `realtime-inbox-badge`, ya ejecutado), rediseño visual del inbox.

**Mandato del usuario (delegación 2026-06-11):** Claude decide lo técnico. Reglas: lo MÁS estructural posible, sin fallos, CERO parches, calidad sobre velocidad. Verificación robot obligatoria antes de cualquier push (Somnio atiende clientes reales — Regla 6 espíritu).

</domain>

<decisions>
## Implementation Decisions

### F-1 — Ventana de datos: paginación server-side + virtualización (Wave 2)
- **D-01:** Paginación **keyset (cursor)**, NO offset — con reorden continuo por mensajes entrantes, offset produce filas duplicadas/saltadas entre páginas. Cursor = columna de sort activa (`last_message_at` o `last_customer_message_at` según `sortBy`) + tie-breaker `id`. Research valida la forma exacta del predicado compuesto en PostgREST/Supabase.
- **D-02:** Tamaño de página: **50**. `page.tsx` server-renderiza SOLO la primera página; las siguientes se cargan con infinite scroll.
- **D-03:** Lista virtualizada con **`@tanstack/react-virtual`** (ya en el repo, v3.13.18, usado en mensajes) + `React.memo` en `ConversationItem` con comparador apropiado.
- **D-04:** Contador del topbar = **count agregado server-side** (query `count` separada, sin traer filas), no `length` del array en memoria.
- **D-05:** Búsqueda pasa a **server-side** (sobre nombre de contacto + teléfono, debounced) — reemplaza Fuse client-side, que solo cubre las 1.000 filas en memoria y deja 1.559 conversaciones inencontrables. Research decide `ILIKE` vs índice `pg_trgm`.
- **D-06:** Filtros (unread / mine / unassigned / unanswered / tags / status) se evalúan **server-side** como WHERE de la query paginada — cada combinación de filtros define su propia ventana keyset. La semántica visible de cada filtro NO cambia.
- **D-07:** Realtime + páginas: un INSERT/UPDATE de una conversación **no cargada** → fetch de esa fila por id + merge por id en la posición que dicte el sort (típicamente al tope). Nunca full refetch como reacción a un evento.
- **D-08:** Índice DB para keyset (forma estimada: `(workspace_id, status, last_customer_message_at DESC)` + variante para `last_message_at`; research define la forma final). **Regla 5 estricta:** migración aplicada en prod ANTES de pushear código que la usa — el plan debe incluir PAUSA explícita esperando confirmación del usuario.
- **D-09:** `getOrdersForContacts` recibe SOLO los contact ids de las páginas cargadas (≈50-150, no 1.000).

### F-2 — Iniciales grapheme-safe (Wave 1; mata el #418)
- **D-10:** Un único util compartido en `src/lib/utils` (p.ej. `firstGrapheme` / `getInitials`) usando `Intl.Segmenter('es', { granularity: 'grapheme' })` con fallback `Array.from` — NUNCA indexación UTF-16 (`n[0]` / `charAt(0)`) sobre nombres.
- **D-11:** Migrar los **9 call sites** del inventario del DIAGNOSIS: `conversation-item.tsx:18` (el #418 activo), `chat-header.tsx:496`, `contact-panel.tsx`, `tareas/task-card.tsx:35`, `settings/members-content.tsx:78`, `user-menu.tsx`, `sidebar.tsx`, `workspace-switcher.tsx`, `team-members-manager.tsx`. Mantener la semántica de fallback existente de cada call site para nombre vacío/null.
- **D-12:** Gates verificables: robot `probe418` → 0 pageerrors de hidratación en 3 cargas; grep → 0 `charAt(0)`/`[0]` sobre nombres en componentes de avatar.

### F-3 + F-4 — Contrato de reconciliación de la lista (Waves 1 y 3)
- **D-13:** Quitar `revalidatePath('/whatsapp')` de `markAsRead` (Wave 1). Contrato documentado en el action: "mutaciones de estado de lectura NO invalidan rutas; reconcilian via estado optimista local + realtime". `archive`/`unarchive` SÍ conservan revalidatePath (cambian el conjunto visible).
- **D-14:** Safety-net de la lista (Wave 3) = **softRefetch de SOLO la primera página + merge por id** — espejo del patrón ya validado en `src/hooks/use-messages.ts:167` (merge 2026-06-04). Sin `isLoading=true`, sin reemplazo total del array.
- **D-15:** Coalescing del timer del safety-net: UN timer fijo; los eventos NO re-agendan (hoy cada evento re-agenda 10s → con tráfico continuo corre siempre). Gate: re-correr `case4`-A del robot → 0 full-refetches >2s tras N updates no-op.
- **D-16:** Handler realtime de `orders` deja de re-ejecutar `getOrdersForContacts` completo: actualiza solo el pedido/contacto afectado por el evento (merge puntual).
- **D-17:** Efectos async del inbox se cancelan al desmontar (AbortController / mounted guard) — elimina los fetches zombie que aterrizan en `/tareas` y `/crm` (medido: 11s SPA en /tareas por esto).

### F-5 — Estabilidad de scroll (Wave 3)
- **D-18:** Mientras `scrollTop > umbral` (~1 viewport — valor exacto a discreción del planner): CONGELAR el re-sort. Los UPDATEs actualizan datos in-place (preview, unread count, timestamps); las conversaciones nuevas/reordenadas se acumulan en un **banner "N conversaciones con actividad — volver arriba"** al tope de la lista (patrón inbox estándar). Al volver al tope o click en el banner se aplica el orden real de una vez.
- **D-19:** Con F-1 el anchor de scroll lo maneja el virtualizador; F-5 es la política de UX de CUÁNDO reordenar. F-5 se construye sobre F-1 (Wave 3 después de Wave 2).

### F-6 — Estado de error explícito del chat (Wave 1)
- **D-20:** `useMessages` expone `isError` + `refetch`; `chat-view` distingue **3 estados**: cargando (skeleton) / error (mensaje en es-CO + botón "Reintentar" + auto-retry con backoff) / vacío real. Un fallo de red nunca más se renderiza como "chat vacío para siempre".

### F-7 — Selección con una sola fuente de verdad (Wave 4)
- **D-21:** `selectedConversation` deja de ser estado paralelo: se **DERIVA** de `selectedConversationId` (lookup en la lista cargada + fetch por id si no está, como efecto reactivo con deps correctas — no `[]`). Elimina por construcción la familia de divergencias header/contenido (incl. `handleConversationCreated` que hoy deja el objeto en null).

### Secuencia, verificación y despliegue
- **D-22:** 4 waves exactamente como el DIAGNOSIS: **W1** = F-2 + F-3 + F-6 (quick structural wins, sin migración) → **W2** = F-1 (la cirugía; necesita research) → **W3** = F-4 + F-5 (se apoyan en F-1) → **W4** = F-7 + re-corrida completa del robot como regresión.
- **D-23:** El robot `scripts/_robot-inbox-nav.ts` es el **harness de verificación obligatorio**: cada wave re-corre las fases pertinentes (probe418/case1/case3/case4/flow/sidebar) y compara contra los JSON baseline en `robot/` ANTES de cualquier push. Gates por wave definidos en D-12/D-15 + los del DIAGNOSIS.
- **D-24:** **Sin feature flag nuevo.** Son correcciones de comportamiento roto (1.559 conversaciones invisibles, #418 en cada carga), no comportamiento nuevo de agente; el rollback es `git revert` por wave (cada wave = push independiente verificado, Regla 1).
- **D-25:** Gotcha del robot (de memoria del proyecto): funciones nombradas dentro de `page.evaluate` rompen con tsx/esbuild (`__name is not defined`) — inlinear.

### Claude's Discretion
- Wording exacto del banner F-5, umbral exacto del freeze, forma del skeleton/error de F-6, nombre y firma exacta del util de iniciales, estructura del cursor keyset (los valida research). Mandato del usuario: Claude decide lo técnico con calidad sobre velocidad.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diagnóstico y evidencia (la fuente de verdad de este standalone)
- `.planning/standalone/whatsapp-inbox-reliability/DIAGNOSIS.md` — Causas raíz H-1..H-6 con evidencia medida, fixes F-1..F-7, waves, gates. LEER COMPLETO antes de planificar.
- `.planning/standalone/whatsapp-inbox-reliability/robot/` — JSONs baseline + screenshots del robot (comparación de regresión).
- `scripts/_robot-inbox-nav.ts` — Robot Playwright harness (fases case1/case2/case3/case4b/flow/sidebar/probe418/ssrdiff).

### Patrones a espejar
- `src/hooks/use-messages.ts` (softRefetch L167, merge L201) — patrón merge-por-id validado que F-4 replica para la lista.
- `.planning/standalone/realtime-inbox-badge/deferred-items.md` — el deferred `inbox-v2-hydration-418` que F-2 cierra; contexto del fix realtime ya ejecutado (singleton + setAuth).

### Código a tocar (inventario del DIAGNOSIS)
- `src/app/actions/conversations.ts` — `getConversations` (L28, sin limit), `markAsRead` (L303, revalidatePath).
- `src/hooks/use-conversations.ts` — doble fetch mount (L235), safety refetch (L280), sort (L368), orders handler (L449), Fuse (L498).
- `src/app/(dashboard)/whatsapp/` — `page.tsx`, `components/conversation-item.tsx`, `conversation-list.tsx`, `chat-view.tsx`, `chat-header.tsx`, `inbox-layout.tsx`.

### Reglas del proyecto que aplican
- `CLAUDE.md` Regla 1 (push tras cambios), Regla 5 (migración DB ANTES de push — aplica a D-08), Regla 2 (TZ Bogotá en cualquier formateo).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@tanstack/react-virtual` v3.13.18 ya instalado (usado en la vista de mensajes) — F-1 lo reutiliza para la lista.
- `softRefetch` + merge por id en `use-messages.ts:167-216` — patrón probado en prod que F-4 espeja.
- Robot `scripts/_robot-inbox-nav.ts` — harness completo ya construido con baselines en `robot/`.

### Established Patterns
- React Query v5 (`@tanstack/react-query`) para mensajes; la lista de conversaciones hoy es estado manual en `use-conversations.ts` — research decide si F-1 migra la lista a React Query infinite o mantiene el hook manual con páginas.
- Realtime ya autentica correctamente (standalone `realtime-inbox-badge` ejecutado: singleton browser client + setAuth) — F-4/D-07 pueden confiar en que los eventos llegan.
- Server actions con `getRequestAuth()` + filtro `workspace_id` (Regla 3 para lecturas via `createClient` RLS).

### Integration Points
- `getConversations(filters)` es la única fuente de la lista (page.tsx SSR + use-conversations client) — la paginación cambia su firma; ambos consumidores se actualizan juntos.
- `getOrdersForContacts` alimenta solo los emojis de stage en avatares — D-09/D-16 lo desacoplan de la lista completa.

</code_context>

<specifics>
## Specific Ideas

- "Arreglos ESTRUCTURALES, no parches" — cada fix elimina la CLASE de bug (mandato literal del usuario).
- Banner de reorder estilo inbox estándar (Gmail/Slack: "N conversaciones con actividad — volver arriba").
- El robot queda como harness PERMANENTE de regresión del inbox, no solo para este standalone.

</specifics>

<deferred>
## Deferred Ideas

- TTFB 2.1s de `/agentes` (segundo módulo más lento) — revisar su query server-side en un item futuro propio (anotado en DIAGNOSIS §sidebar lectura 3).
- Caso 2 (header/contenido divergente) no fue reproducido en lab; F-7 elimina la clase candidata por construcción. Si reaparece post-W4, abrir diagnose dedicado.
- Auditoría de avatar-iniciales en módulos NO listados en el inventario D-11 (CRM kanban u otros futuros) — el util compartido D-10 deja el fix a un import de distancia.

</deferred>

---

*Phase: standalone/whatsapp-inbox-reliability*
*Context gathered: 2026-06-11 (modo --auto, delegación del usuario)*
