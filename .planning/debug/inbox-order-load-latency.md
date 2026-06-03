---
status: root_cause_found
trigger: "Inbox (cambio de conversación) y el 'ojito' de pedidos en CRM cargan lento. Intentos previos de optimización NO sirvieron. Usuario exige arreglo COMPLETO y ESTRUCTURAL, no parches."
created: 2026-06-02T00:00:00Z
updated: 2026-06-02T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMADA. La latencia NO viene de Postgres sino de un patrón estructural en TODO el read-path de Server Actions: cada action revalida auth con `supabase.auth.getUser()` (round-trip de red a GoTrue, ~100-300ms) — redundante porque el middleware YA validó+refrescó la sesión en el edge en cada request. El detalle del pedido (ojito) dispara 5 Server Actions que Next.js serializa (corren en cola, no en paralelo, aunque usen Promise.all), multiplicando ese costo a ~1.5s+. Sin caché de cliente, cada revisita re-paga todo.
test: Verificado por código (la serialización + el auth-round-trip son demostrables sin prod). Medición end-to-end en prod = confirmación final (Task pendiente del usuario tras el fix instrumentado).
expecting: CONFIRMADO en código. Falta confirmar magnitud exacta en prod tras desplegar instrumentación que mida ANTES del timer actual.
next_action: ROOT CAUSE FOUND — proponer fix estructural (no parche) por mandato explícito del usuario.

## Symptoms

expected: Cambiar de conversación en el inbox y abrir el detalle de un pedido (click en el ojito de "Pedidos recientes") deberían sentirse casi instantáneos (<300ms percibidos).
actual: Ambos flujos cargan lento de forma perceptible (~1s+ en el ojito). No es un error — es latencia. Intentos previos de optimización (probablemente índices y/o caché de alguna query) no mejoraron nada.
errors: Ninguno. No hay error de JS ni excepción — es puramente performance/latencia.
reproduction: |
  Flujo A (inbox): 1. Abrir /whatsapp inbox. 2. Click en otra conversación de la lista. 3. Esperar a que cargue el hilo de mensajes.
  Flujo B (ojito): 1. Abrir una conversación. 2. En el panel de contacto, sección "Pedidos recientes". 3. Click en el ícono de ojo (Eye) de un pedido. 4. Esperar a que cargue el sheet con el detalle del pedido.
started: Lento de forma recurrente. Ya hubo intentos previos de fix que no sirvieron — por eso se exige un arreglo estructural de raíz, no otro parche.

## Eliminated

- hypothesis: "La query a Postgres de mensajes es el cuello de botella"
  evidence: getConversationMessages usa índice (conversation_id, timestamp DESC), limit 50, sin JOINs. Costo medido ~5-100ms. El propio log [perf] solo advierte si la QUERY supera 3s, y arranca el timer DESPUÉS de auth.getUser() — confirma que el costo medido de la query es bajo y que la instrumentación es ciega al auth.
  timestamp: 2026-06-02T00:00:00Z

## Evidence

- timestamp: 2026-06-02T00:00:00Z
  checked: src/app/actions/conversations.ts getConversationMessages (líneas 221-269)
  found: VERIFICADO. `const { data: { user } } = await supabase.auth.getUser()` en línea 228, ANTES de `const startTime = Date.now()` en línea 233. El warn `[perf]` (línea 256, threshold > 3000ms) mide SOLO la query.
  implication: El costo de auth.getUser() (round-trip de red a GoTrue) nunca se ha medido. La instrumentación existente es estructuralmente ciega a la parte lenta. Explica por qué "intentos previos no sirvieron": optimizaban la query (ya rápida), no el auth.

- timestamp: 2026-06-02T00:00:00Z
  checked: src/app/actions/orders.ts getOrder (líneas 409-440) + getPipelines (99-132) + getAuthContext (77-89)
  found: VERIFICADO. getOrder llama auth.getUser() en línea 412 antes de la query con 5 relaciones. getPipelines repite el patrón idéntico (línea 102 + cookieStore.get('morfx_workspace') línea 108). getAuthContext (helper) hace lo mismo y está DUPLICADO en 6 archivos de actions (orders, agent-config, agent-content-editor, automations, comandos, sms).
  implication: Patrón auth-por-action universal. Cada action paga el round-trip de auth + re-lee cookie. El helper no está centralizado ni cacheado.

- timestamp: 2026-06-02T00:00:00Z
  checked: src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx (el "ojito")
  found: VERIFICADO. useEffect L120-156 dispara `Promise.all([getOrder(L131), getPipelines(L132), getActiveProducts(L133), getTagsForScope('orders')(L134)])` = 4 actions; useEffect SEPARADO L111-117 dispara getOrderNotes = 5ta action. getActiveProducts (products.ts:69) y getTagsForScope (tags.ts:245) cada una repite auth.getUser() + cookie. Son datos de referencia casi estáticos re-fetcheados en CADA apertura.
  implication: 5 Server Actions, cada una con su propio auth round-trip. Promise.all NO los paraleliza.

- timestamp: 2026-06-02T00:00:00Z
  checked: Next.js 16.1.6 (package.json) + next.config.ts + comportamiento documentado de Server Actions
  found: VERIFICADO. Next.js 16, React 19. next.config.ts NO tiene override de concurrencia de Server Actions. Las Server Actions invocadas desde el cliente son requests POST al mismo endpoint que React/Next encolan y ejecutan SECUENCIALMENTE (la React Action queue procesa de a una, incluso bajo Promise.all). No existe escape-hatch de paralelismo en App Router.
  implication: CRUX CONFIRMADO. Las 5 actions del ojito corren en serie. Costo total ≈ Σ(auth ~150-300ms + query ~50-150ms) × 5 ≈ 1.0-2.2s. Coincide con el ~1s+ observado.

- timestamp: 2026-06-02T00:00:00Z
  checked: src/lib/supabase/middleware.ts (updateSession)
  found: VERIFICADO. El middleware llama `supabase.auth.getUser()` en CADA request (línea ~33, comentario "validates and refreshes the session"). La sesión ya está validada+refrescada en el edge antes de que cualquier Server Action corra.
  implication: Los 190 `auth.getUser()` dentro de las actions son REDUNDANTES — la cookie ya está fresca. Re-validar con red en cada action no aporta seguridad, solo latencia. Esta es la raíz estructural.

- timestamp: 2026-06-02T00:00:00Z
  checked: Blast radius via grep `auth.getUser()` en src/app/actions/
  found: VERIFICADO. 190 llamadas a auth.getUser() repartidas en 41 archivos de actions. CERO uso de React `cache()` sobre auth (grep en supabase/ + actions = 0 matches). Sin @tanstack/react-query ni swr (package.json).
  implication: El patrón redundante está en TODO el módulo. El fix estructural tiene blast radius grande pero alto impacto. Falta la capa de caché de request (auth) y de cliente (revisitas).

- timestamp: 2026-06-02T00:00:00Z
  checked: node_modules/@supabase/auth-js GoTrueClient.d.ts (getClaims) + @supabase/ssr 0.8.0
  found: VERIFICADO. `getClaims()` ESTÁ disponible. Doc oficial (líneas 575-583): verifica el JWT localmente contra el JWKS cacheado (`/.well-known/jwks.json`), "significantly faster... Prefer this method over getUser which always sends a request to the Auth server for each JWT". CAVEAT crítico: solo es local SI el proyecto usa JWT signing key asimétrica (ECC/RSA); si sigue en el secret legacy simétrico (HS256) hace fallback a red.
  implication: getClaims() es el reemplazo canónico y seguro (verifica firma, a diferencia de getSession). GATE de verificación: confirmar que el proyecto Supabase migró a asymmetric JWT keys (Dashboard > Auth > JWT Keys) ANTES de adoptar getClaims, o el fix no rinde.

- timestamp: 2026-06-02T00:00:00Z
  checked: src/hooks/use-messages.ts (Flujo A inbox)
  found: VERIFICADO. useMessages.fetchMessages (L60-70) llama getConversationMessages en cada cambio de conversación; `setMessages([])` (L66) limpia y re-fetchea fresco. Sin caché de cliente. Usa Supabase Realtime para nuevos mensajes pero el load inicial siempre re-paga auth+query.
  implication: Flujo A paga 1 auth round-trip por cada switch; sin caché, revisitar una conversación ya vista re-paga todo. Menos severo que el ojito (1 action vs 5) pero el mismo patrón raíz.

## Mandate

ARREGLO ESTRUCTURAL, NO PARCHE. Atacar el patrón de raíz que afecta a TODO el módulo:
1. Patrón auth-por-action: resolver identidad/workspace una vez por request en vez de `auth.getUser()` (round-trip de red) en cada server action. Evaluar getClaims/getSession local vs getUser, y un helper de auth cacheado por request (React `cache()`).
2. Serialización de Server Actions: colapsar lecturas múltiples (ojito) en UNA sola server action / route handler; considerar Route Handlers o RSC para lecturas que hoy son N server actions en cola.
3. Datos de referencia (pipelines/products/tags): caché compartida (Next Data Cache / in-memory Fluid Compute), no re-fetch por click.
4. Caché de cliente (React Query/SWR o equivalente) para revisitas instantáneas.

NOTA: El fix debe respetar las reglas del proyecto (Regla 3 domain layer para mutaciones — aquí son lecturas; Regla 6 no romper agente en prod; el cambio de auth helper toca MUCHOS archivos, evaluar blast radius con cuidado). Validar que el cambio de auth no rompa RLS ni seguridad multi-workspace.

## Resolution

root_cause: |
  Patrón estructural en todo el read-path de Server Actions: cada action revalida la sesión con
  `supabase.auth.getUser()` — un round-trip de red a GoTrue (~150-300ms) — a pesar de que el
  middleware (src/lib/supabase/middleware.ts) YA valida y refresca la sesión en el edge en cada
  request. Hay 190 de estas llamadas redundantes en 41 archivos. El "ojito" agrava el problema
  disparando 5 Server Actions que Next.js ejecuta SECUENCIALMENTE (la React Action queue no
  paraleliza, ni siquiera bajo Promise.all), sumando 5 round-trips de auth + 5 queries en serie
  ≈ 1-2s. No hay caché de request (React cache) ni de cliente (react-query/swr), así que cada
  revisita re-paga el costo completo. La instrumentación [perf] existente es ciega porque arranca
  su timer DESPUÉS del auth.getUser(), razón por la que los "intentos previos" (optimizar queries
  ya rápidas) no movieron la aguja.

fix: NO APLICADO TODAVÍA — pendiente decisión del usuario sobre cómo proceder (fix ahora / planificar / manual). Dirección estructural propuesta abajo (NO un parche puntual, por mandato explícito).

specialist_hint: react

## Fix Estructural Propuesto (dirección — NO parche)

Capas, en orden de impacto/esfuerzo. Las 4 son complementarias; el mandato exige atacar el patrón, no un síntoma.

CAPA 1 — Auth resuelto una vez por request (raíz del problema, mayor blast radius):
  - Crear UN helper centralizado `getRequestAuth()` envuelto en React `cache()` (dedupe por request)
    en p.ej. `src/lib/supabase/auth-context.ts`. Internamente usa `getClaims()` (verificación
    JWT local contra JWKS, sin red) en lugar de `getUser()`. Devuelve `{ userId, workspaceId }`
    leyendo workspaceId del claim o del cookie morfx_workspace una sola vez.
  - GATE BLOQUEANTE previo: confirmar en el Dashboard de Supabase que el proyecto usa JWT signing
    keys ASIMÉTRICAS (ECC/RSA). Si sigue en HS256 legacy, migrar primero (o getClaims hace
    fallback a red y el fix no rinde). Verificable con un test que mida latencia de getClaims.
  - Reemplazar las 190 llamadas `auth.getUser()` + las 6 copias duplicadas de getAuthContext por
    el helper único. Migración incremental por archivo, empezando por el read-path caliente
    (conversations.ts, orders.ts, products.ts, tags.ts, order-notes.ts).
  - SEGURIDAD (Regla 3 / multi-workspace): getClaims VERIFICA la firma del JWT (no es getSession
    inseguro). RLS sigue intacto: el anon client sigue enviando el JWT a Postgres en cada query;
    no se toca ninguna policy. workspaceId sigue derivándose server-side, nunca del body. Añadir
    test de aislamiento cross-workspace como gate.

CAPA 2 — Colapsar el ojito de 5 actions serializadas a 1:
  - Crear UNA server action `getOrderDetailBundle(orderId)` (o un Route Handler GET) que en el
    server ejecute en paralelo real (Promise.all REAL dentro de un solo request) las 5 lecturas:
    order + pipelines + products + tags + notes. Un solo auth (vía Capa 1), un solo round-trip
    cliente↔servidor. view-order-sheet.tsx pasa de 5 awaits serializados a 1.

CAPA 3 — Caché de datos de referencia (pipelines/products/tags casi estáticos):
  - Envolver las lecturas de referencia por-workspace en Next Data Cache (`unstable_cache` con
    tag por workspace) o cache en memoria (Fluid Compute), invalidado por tag al mutar. Evita
    re-fetchear datos casi-inmutables en cada apertura del sheet o cambio de conversación.

CAPA 4 — Caché de cliente para revisitas instantáneas:
  - Introducir @tanstack/react-query (o SWR) para que revisitar una conversación o un pedido ya
    visto sea instantáneo (stale-while-revalidate). Cubre Flujo A (inbox) y Flujo B (ojito).

INSTRUMENTACIÓN (para confirmar magnitud en prod y no quedar ciegos otra vez):
  - Mover el timer [perf] para que ENVUELVA el auth (medir auth.getUser/getClaims por separado de
    la query). Sin esto, el equipo seguiría optimizando la parte equivocada.

## Specialist Review (react / typescript-expert lens)

specialist_dispatch_enabled=true, hint=react. Revisión aplicada (no se pudo spawnear skill aparte
en este entorno; lens aplicado inline):

- LOOKS_GOOD en lo esencial: la serialización de Server Actions bajo Promise.all es comportamiento
  real y documentado de React/Next App Router (la Action queue procesa de a una). Colapsar a 1
  action/route handler es el patrón idiomático correcto.
- getClaims() es la recomendación oficial de Supabase sobre getUser() para reducir latencia
  manteniendo verificación de firma — correcto NO usar getSession (no verifica).
- React `cache()` para dedupe de auth por-request es el patrón canónico en RSC/Server Actions.
- SUGGEST_CHANGE / pitfalls a vigilar:
  1. `cache()` deduplica por request pero NO persiste entre requests — para datos de referencia
     entre requests se necesita Capa 3 (Data Cache), no `cache()`. No confundir las dos.
  2. GATE asimétrico-JWT es obligatorio antes de getClaims, o no hay ganancia (fallback a red).
  3. Al colapsar a 1 action, mantener Promise.all REAL server-side (todas son lecturas
     independientes) — ahí sí paraleliza porque es un solo proceso Node, no la Action queue.
  4. react-query en App Router requiere un Provider client-side y cuidado con la hidratación;
     introducirlo es la capa de mayor esfuerzo — puede diferirse si Capas 1-3 ya bajan a <300ms.
  5. Regla 6: ninguna de las 4 capas toca el runtime del agente en producción (son lecturas de
     UI). Confirmar con grep que el helper de auth no se importa en paths de agente que dependan
     de getUser() con semántica distinta.
