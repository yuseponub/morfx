# Standalone: whatsapp-crm-read-latency — Context

**Gathered:** 2026-06-02
**Status:** Ready for research
**Type:** Standalone (no roadmap phase) — structural performance fix

<domain>
## Phase Boundary

Arreglo ESTRUCTURAL de la latencia de lectura del módulo WhatsApp/CRM (mandato usuario: "arreglo completo estructural, no parches"). Ataca el patrón de raíz que hace lentos el cambio de conversación en el inbox y el "ojito" de pedidos — NO parchea síntomas individuales.

**En scope:**
- Capa 1: helper `getRequestAuth()` cacheado por request (React `cache()`) con `getClaims()` local, que reemplaza el `auth.getUser()` redundante por-action y centraliza el `getAuthContext` duplicado (6 archivos) + lectura de cookie `morfx_workspace`.
- Capa 2: colapsar las ~5 Server Actions serializadas del "ojito" (view-order-sheet) en UNA.
- Capa 3: Next Data Cache para datos de referencia del workspace (pipelines / active products / order tags) que hoy se re-fetchean en cada apertura.
- Capa 4: caché de cliente (TanStack React Query) para revisitas instantáneas en inbox + ojito.
- Fix de instrumentación: mover el timer `[perf]` para que mida ANTES del auth (hoy es ciego a la parte lenta).
- **Alcance Q2 = hot-path primero:** migrar `conversations.ts` + `orders.ts` (+ las actions del ojito) primero, verificar en prod, y DESPUÉS barrer los otros ~39 archivos en olas follow-up dentro del mismo standalone.

**Fuera de scope:**
- Tocar el `auth.getUser()` del MIDDLEWARE (`src/lib/supabase/middleware.ts`) — es el límite de auth real (refresh + revocación) y se queda intacto.
- Optimizar el hot-path del AGENTE (LLM) — ese es otro problema (el LLM domina, no la DB). Este standalone es solo lecturas de UI.
- Redis como caché — descartado: Upstash REST es HTTP-por-comando; para estas lecturas la caché correcta es cliente/Next Data Cache, no Redis.
- Migrar JWT keys — ya están en asimétricas (ES256), no hace falta.

</domain>

<decisions>
## Implementation Decisions

### Auth helper (Capa 1)
- **D-01:** Crear `getRequestAuth()` — un único helper cacheado por request con React `cache()` que usa `supabase.auth.getClaims()` (verificación LOCAL del JWT, sin round-trip de red). Reemplaza las 190 llamadas a `auth.getUser()` en 41 archivos de Server Actions.
- **D-02:** El helper DEBE preservar el contract que consumen los call sites: exponer `userId` (= `claims.sub`, usado en 22 sitios), `workspaceId` (de cookie `morfx_workspace`), y lo que el audit de research determine (ej. email/app_metadata si algún sitio los usa — `getClaims` devuelve el payload completo del JWT).
- **D-03:** Centralizar el `getAuthContext` hoy DUPLICADO en 6 archivos (orders, agent-config, agent-content-editor, automations, comandos, sms) dentro de este helper.
- **D-04 (PRECAUCIÓN VERIFICADA, no negociable):** NO tocar el `getUser()` del middleware — sigue siendo el gate de refresh + revocación en tiempo real en cada request. El downgrade de revocación por-action (getClaims valida firma local, no detecta revocación hasta expirar el token ~1h) queda cubierto por el middleware.

### JWT keys gate (Q1)
- **D-05:** ✅ RESUELTO — verificado vía JWKS endpoint (`/auth/v1/.well-known/jwks.json`) que el proyecto `expslvzsszymljafhppi` usa llave ASIMÉTRICA ES256 (EC P-256). `getClaims()` es local. SIN migración previa requerida. Gate despejado.

### Ojito / order detail (Capa 2)
- **D-06:** Colapsar las ~5 Server Actions del `view-order-sheet.tsx` (getOrder + getPipelines + getActiveProducts + getTagsForScope + getOrderNotes) que Next.js corre EN SERIE, en UNA sola Server Action / Route Handler que haga el `Promise.all` real del lado servidor (1 auth + paralelismo real DB-side).

### Reference data cache (Capa 3)
- **D-07:** pipelines / active products / order tags son datos de referencia del workspace casi estáticos → cachear con Next Data Cache (`unstable_cache` / `'use cache'`) con invalidación por tag, en vez de re-fetch por click. (Research decide TTL/tag exacto.)

### Client cache (Q3, Capa 4)
- **D-08:** Usar **TanStack React Query** para caché de cliente (revisitas instantáneas en inbox + ojito). Decisión delegada a Claude por el usuario ("la mejor en rendimiento, elige tú"). Razón: stale-while-revalidate + devtools + coordina limpio con el Supabase Realtime existente del inbox (`use-messages.ts`). Nueva dependencia aceptada.

### Rollout (Q4 — Regla 6)
- **D-09:** **Migración incremental verificable, SIN feature flag.** El helper es drop-in (preserva el contract userId/workspaceId), TypeScript atrapa cualquier mismatch en compile-time, el middleware queda intacto. Commits atómicos por archivo/grupo con typecheck en cada uno. Empezar por el hot-path (conversations + orders + ojito), verificar, luego barrer el resto.
- **D-10:** Mover el timer `[perf]` de `getConversationMessages` (y similares) para que envuelva el auth, no que arranque después — para que la instrumentación deje de ser ciega a la parte lenta (causa de por qué fixes previos no detectaron el problema).

### Claude's Discretion
- Estructura interna del helper, nombres exactos, forma del Route Handler vs Server Action para el ojito, TTL/tags del Next Data Cache, integración fina de React Query con el hook `use-messages` (Realtime). Research + plan deciden.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Root cause (research base — LEER PRIMERO)
- `.planning/debug/inbox-order-load-latency.md` — sesión de debug con status root_cause_found. Evidencia completa por código: 190 getUser redundantes, serialización de Server Actions, instrumentación ciega, gate JWT, los 4 riesgos verificados.

### Código afectado (hot-path)
- `src/app/actions/conversations.ts` — getConversationMessages (L221-269) + 17 getUser. Timer [perf] ciego (L228 auth antes de L233 startTime).
- `src/app/actions/orders.ts` — getOrder (L409-440), getPipelines (L99-132), getAuthContext helper (L77-89, DUPLICADO).
- `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` — el "ojito": 5 actions serializadas (useEffect L111-156).
- `src/app/actions/products.ts` (getActiveProducts L69) + `src/app/actions/tags.ts` (getTagsForScope L245) + `src/app/actions/order-notes.ts` (getOrderNotes, 2 queries secuenciales).
- `src/hooks/use-messages.ts` — Flujo A inbox (fetchMessages L60-70, sin caché de cliente, usa Realtime).

### Auth / seguridad (NO TOCAR / contract)
- `src/lib/supabase/middleware.ts` — updateSession con getUser() (refresh + revocación). INTACTO (D-04).
- `src/middleware.ts` — matcher (cubre todas las rutas de app → refresh ocurre en cada request).
- `src/lib/supabase/server.ts` — createClient (RLS viene del token en cookie, no de getUser).
- `node_modules/@supabase/auth-js` — getClaims() API (JwtPayload con `sub`).

### Reglas del proyecto
- `CLAUDE.md` Regla 3 (domain layer — aquí son lecturas, pero las actions de mutación migradas en olas follow-up deben respetarla), Regla 5 (migración antes de deploy — N/A, sin migración DB), Regla 6 (no romper prod → D-09 incremental verificable).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createClient()` (src/lib/supabase/server.ts) — ya arma el cliente con cookies; el helper nuevo lo envuelve.
- Supabase Realtime en `use-messages.ts` + `use-conversations.ts` — React Query debe coexistir (cache inicial + Realtime para deltas).
- `unstable_cache` ya usado en `src/app/actions/bold.ts` — patrón Next Data Cache existe en el repo.

### Established Patterns
- Patrón auth-por-action universal (190×) — ES la deuda a eliminar, no a replicar.
- Server Actions invocadas desde cliente se SERIALIZAN (React Action queue) — no usar Promise.all de N actions esperando paralelismo (D-06).

### Integration Points
- Helper nuevo: probablemente `src/lib/auth/request-auth.ts` (nuevo) consumido por los 41 archivos de actions.
- Ojito: nueva action/route handler única reemplazando las 5 en view-order-sheet.tsx.
- React Query provider: en el layout del dashboard.

</code_context>

<specifics>
## Specific Ideas

- Verificación JWT vía JWKS endpoint público (curl a `/auth/v1/.well-known/jwks.json`) — método reusable para futuros chequeos de tipo de llave sin Dashboard.
- El usuario fue explícito: cautela ante breakage de los 190 sitios → TypeScript-como-red-de-seguridad + incremental atómico es la respuesta estructural a esa preocupación.

</specifics>

<deferred>
## Deferred Ideas

- Barrido de los ~39 archivos de actions restantes (fuera del hot-path) — olas follow-up DENTRO de este standalone tras verificar el hot-path. No es scope creep, es secuenciación.
- Redis cross-instance cache — descartado para este caso (HTTP-por-comando de Upstash); sería para estado compartido entre lambdas, otro problema.
- Optimización del hot-path del agente (LLM / prompt caching) — problema separado, el LLM domina esa latencia, no la DB.

</deferred>

---

*Standalone: whatsapp-crm-read-latency*
*Context gathered: 2026-06-02*
