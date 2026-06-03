---
phase: whatsapp-crm-read-latency
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - src/lib/auth/request-auth.ts
  - src/lib/auth/__tests__/request-auth.test.ts
  - src/app/get-query-client.ts
  - src/components/providers/query-provider.tsx
  - src/app/(dashboard)/layout.tsx
  - src/lib/cache/reference-data.ts
  - package.json
autonomous: true
requirements: [L1, L4, L3-foundation]
must_haves:
  truths:
    - "getRequestAuth() resuelve identidad+workspace una vez por request via getClaims() local (sin round-trip a GoTrue)"
    - "getRequestAuth() devuelve null cuando no hay claims O no hay cookie morfx_workspace (preserva comportamiento not-authed de los call sites)"
    - "El QueryClientProvider esta montado en el layout del dashboard sin migrar ningun consumidor todavia"
    - "Las funciones cacheadas de datos de referencia existen pero aun no estan cableadas a ningun call site"
    - "middleware.ts byte-identico (D-04 intacto)"
  artifacts:
    - path: "src/lib/auth/request-auth.ts"
      provides: "getRequestAuth() cacheado con React cache() + getClaims; contract { userId, email, workspaceId }"
      exports: ["getRequestAuth", "RequestAuth"]
      contains: "cache("
    - path: "src/lib/auth/__tests__/request-auth.test.ts"
      provides: "Tests del contract + ramas null + aislamiento cross-workspace"
    - path: "src/app/get-query-client.ts"
      provides: "QueryClient singleton (server fresh / browser reuse)"
      exports: ["getQueryClient"]
    - path: "src/components/providers/query-provider.tsx"
      provides: "'use client' QueryClientProvider wrapper"
      exports: ["QueryProvider"]
    - path: "src/lib/cache/reference-data.ts"
      provides: "unstable_cache wrappers para pipelines/products/tags por workspace (sin cablear aun)"
      exports: ["getCachedActiveProducts", "getCachedTagsForScope", "getCachedPipelines"]
  key_links:
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/components/providers/query-provider.tsx"
      via: "<QueryProvider> envuelve {children}"
      pattern: "QueryProvider"
    - from: "src/lib/auth/request-auth.ts"
      to: "supabase.auth.getClaims"
      via: "verificacion JWT local"
      pattern: "getClaims"
---

<objective>
Fundacion de la Ola 0 — crear la infraestructura SIN cambiar comportamiento de ningun flujo existente. Tres piezas nuevas que aun no tienen consumidores (riesgo cero):

1. **Capa 1:** helper `getRequestAuth()` (D-01/D-02/D-03) — resuelve `{ userId, email, workspaceId }` una vez por request con `getClaims()` local (verificacion JWT ES256 sin round-trip a GoTrue) + cookie `morfx_workspace`, envuelto en React `cache()`.
2. **Capa 4 (provider only):** instalar `@tanstack/react-query` (D-08), crear el `QueryClient` singleton y montar el provider en el layout del dashboard. NO migrar consumidores aun.
3. **Capa 3 (definicion only):** funciones `unstable_cache` para datos de referencia (pipelines/products/tags) por workspace (D-07). NO cablear a call sites aun.

Purpose: Aislar todo el riesgo de la fundacion en una ola sin cambio de comportamiento. Las olas siguientes solo cablean estas piezas. El helper es drop-in y TypeScript es la red de seguridad (D-09).

Output: 5 archivos nuevos + 1 edit al layout + dependencia instalada. Cero cambios en flujos de usuario.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/CONTEXT.md
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Code Examples 1, 4, 5 (firmas exactas verbatim); Call-Site Audit (contract = `{ userId, email, workspaceId }`); Common Pitfalls 1, 2, 5, 6, 8.
- `CLAUDE.md` Regla 3 (mutaciones via domain — aqui son lecturas), Regla 6 (no romper prod).
</read_first>

<interfaces>
<!-- getClaims shape (verificado en @supabase/auth-js@2.95.2 GoTrueClient.d.ts:601-613) -->
<!-- getClaims() devuelve { data: { claims: JwtPayload } | null, error } -->
<!-- claims.sub = userId ; claims.email = email -->
<!-- IMPORTANTE: hay rama { data:null, error:null } (sin sesion) ademas de la rama de error -->

From src/lib/supabase/server.ts:
```typescript
export async function createClient(): Promise<SupabaseClient> // arma cliente con cookies
```

From src/app/actions/orders.ts:88 (getAuthContext DUPLICADO — la forma objetivo ya es {workspaceId,userId}):
```typescript
// hoy: { workspaceId: string; userId: string } | { error: string }
```

Patron unstable_cache existente (src/app/actions/bold.ts:208):
```typescript
unstable_cache(fn, keyParts: string[], { revalidate, tags })
```

Bodies actuales a cachear (verbatim, para clonar la query dentro del wrapper):
- getActiveProducts (products.ts:69-96): from('products').select('*').eq('workspace_id', ws).eq('is_active', true).order('title')
- getTagsForScope (tags.ts:245-282): from('tags').select('id, name, color, applies_to').eq('workspace_id', ws).order('name'); scope 'orders' → .in('applies_to', ['orders','both']); scope 'whatsapp' → .in('applies_to', ['whatsapp','both'])
- getPipelines (orders.ts:99-132): from('pipelines').select('*, stages:pipeline_stages(*)').eq('workspace_id', ws).order('name'); luego ordena stages por position en JS
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Crear getRequestAuth() helper + tests (Capa 1)</name>
  <files>src/lib/auth/request-auth.ts, src/lib/auth/__tests__/request-auth.test.ts</files>
  <behavior>
    - Test 1: con claims validos {sub:'u1', email:'a@b.com'} + cookie morfx_workspace='ws1' → devuelve { userId:'u1', email:'a@b.com', workspaceId:'ws1' }
    - Test 2: getClaims devuelve { data:null, error:null } (sin sesion) → devuelve null (Pitfall 2)
    - Test 3: getClaims devuelve { data:null, error:AuthError } → devuelve null (Pitfall 2)
    - Test 4: claims validos pero SIN cookie morfx_workspace → devuelve null
    - Test 5: claims.email ausente → email:null (no rompe; usa ?? null)
    - Test 6 (aislamiento cross-workspace — gate de seguridad CONTEXT): workspaceId SIEMPRE viene de la cookie, NUNCA de un argumento/body; un workspaceId pasado como input es ignorado (la firma no acepta input de workspace)
  </behavior>
  <action>
Crear `src/lib/auth/request-auth.ts` EXACTAMENTE segun RESEARCH Code Example 1 (verbatim):

```typescript
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export interface RequestAuth {
  userId: string
  email: string | null
  workspaceId: string
}

/**
 * Per-request auth resolution. Wrapped in React cache() so multiple Server
 * Actions in the SAME request share ONE local JWT verification + cookie read.
 * Uses getClaims() (local ES256 verify against cached JWKS — no network round-trip)
 * instead of getUser() (network round-trip to GoTrue).
 *
 * Refresh + revocation remain the middleware's job (D-04). RLS is enforced by
 * the JWT the anon client sends to Postgres, not by this helper.
 *
 * Returns null when unauthenticated OR no workspace selected — callers preserve
 * their existing not-authed behavior ([] / null / { error }).
 */
export const getRequestAuth = cache(async (): Promise<RequestAuth | null> => {
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null // cubre {data:null,error:null} Y la rama de error (Pitfall 2)

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return {
    userId: claims.sub,
    email: claims.email ?? null,
    workspaceId,
  }
})
```

Tests en `src/lib/auth/__tests__/request-auth.test.ts` (vitest, environment node — ya es el default). Mockear `@/lib/supabase/server` (createClient → objeto con `auth.getClaims`) y `next/headers` (cookies → objeto con `.get`). Cubrir los 6 casos del bloque <behavior>. NOTA: como `getRequestAuth` esta envuelto en `cache()`, cada test debe re-importar el modulo fresco (vi.resetModules + dynamic import) o mockear por-test, porque `cache()` memoiza dentro del mismo request-context — verificar que el patron de mock no comparta estado entre tests.

NO migrar ningun call site en este plan. El helper queda sin consumidores (riesgo cero — D-09 Wave 0).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/auth/__tests__/request-auth.test.ts</automated>
  </verify>
  <done>
    - `grep -n "getRequestAuth" src/lib/auth/request-auth.ts` muestra export + `cache(`
    - `grep -n "getClaims" src/lib/auth/request-auth.ts` retorna match (NO getUser, NO getSession)
    - `grep -c "getUser\|getSession" src/lib/auth/request-auth.ts` retorna 0
    - Interface `RequestAuth` exporta exactamente `{ userId, email, workspaceId }`
    - 6 tests pasan; tsc verde
  </done>
  <acceptance_criteria>
    - `grep -n "export interface RequestAuth" src/lib/auth/request-auth.ts` existe con campos userId/email/workspaceId
    - `grep -c "getUser\|getSession" src/lib/auth/request-auth.ts` == 0
    - `grep -c "morfx_workspace" src/lib/auth/request-auth.ts` >= 1
    - `npx vitest run src/lib/auth/__tests__/request-auth.test.ts` → 6/6 pass
    - `git diff --stat src/lib/supabase/middleware.ts` vacio (no se toco — D-04)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Instalar React Query + QueryClient singleton + montar provider en layout (Capa 4 fundacion)</name>
  <files>package.json, src/app/get-query-client.ts, src/components/providers/query-provider.tsx, src/app/(dashboard)/layout.tsx</files>
  <action>
1. Instalar dependencia (D-08): `npm install @tanstack/react-query@5.101.0`. (Opcional dev: `npm install -D @tanstack/react-query-devtools@5.101.0` — incluir solo si el executor lo lazy-loadea; default: omitir para mantener bundle limpio.)

2. Crear `src/app/get-query-client.ts` (RESEARCH Code Example 5 verbatim — Pitfall 6 singleton):
```typescript
import { isServer, QueryClient } from '@tanstack/react-query'
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: 5 * 60_000 } },
  })
}
let browserQueryClient: QueryClient | undefined
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  return (browserQueryClient ??= makeQueryClient())
}
```

3. Crear `src/components/providers/query-provider.tsx`:
```tsx
'use client'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/app/get-query-client'
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

4. Editar `src/app/(dashboard)/layout.tsx`: importar `QueryProvider` y envolver con el el arbol existente. Colocar `<QueryProvider>` como el wrapper MAS EXTERNO del return (envolviendo `<WorkspaceProvider>`) para que cualquier hijo del dashboard pueda usar React Query. NO tocar la logica de auth/workspace del layout (el `getUser()` del layout es del Server Component, distinto del per-action; queda igual en este plan — su migracion no es parte del scope del hot-path y el layout corre 1 vez, no por-action).

NO migrar ningun hook/consumidor a useQuery en este plan. Solo montar el provider (riesgo cero).
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "@tanstack/react-query\"" package.json</automated>
  </verify>
  <done>
    - `@tanstack/react-query@5.101.0` en package.json dependencies
    - `getQueryClient` exportado en src/app/get-query-client.ts
    - `<QueryProvider>` envuelve {children} en el layout del dashboard
    - tsc verde; build no rompe
  </done>
  <acceptance_criteria>
    - `grep "@tanstack/react-query" package.json` muestra `5.101.0`
    - `grep -n "QueryProvider" src/app/(dashboard)/layout.tsx` retorna match (import + uso)
    - `grep -n "isServer\|browserQueryClient" src/app/get-query-client.ts` retorna match (patron singleton correcto)
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Definir wrappers unstable_cache de datos de referencia (Capa 3, sin cablear)</name>
  <files>src/lib/cache/reference-data.ts</files>
  <action>
Crear `src/lib/cache/reference-data.ts` con 3 funciones que envuelven las queries de referencia en `unstable_cache`, recibiendo `workspaceId` como ARGUMENTO (Pitfall 5 — NUNCA `cookies()` dentro del callback). Patron clonado de bold.ts + RESEARCH Code Example 4.

Usar `createAdminClient()` dentro del callback cacheado (RLS no aplica dentro de unstable_cache porque no hay cookie; el filtro `workspace_id` explicito + workspaceId server-derivado es la garantia — RESEARCH Example 4 nota). Importar tipos `Product`, `Tag`, `PipelineWithStages`, `PipelineStage` de sus modulos existentes.

```typescript
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Product } from '@/lib/products/types'   // ajustar path real
import type { Tag } from '@/lib/tags/types'            // ajustar path real
import type { PipelineWithStages, PipelineStage } from '@/lib/orders/types'

export const getCachedActiveProducts = (workspaceId: string): Promise<Product[]> =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('products').select('*')
        .eq('workspace_id', workspaceId).eq('is_active', true)
        .order('title', { ascending: true })
      return (data ?? []) as Product[]
    },
    ['active-products', workspaceId],
    { revalidate: 300, tags: [`ref:products:${workspaceId}`] },
  )()

export const getCachedTagsForScope = (
  workspaceId: string,
  scope?: 'whatsapp' | 'orders',
): Promise<Tag[]> =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      let q = supabase.from('tags')
        .select('id, name, color, applies_to')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (scope === 'whatsapp') q = q.in('applies_to', ['whatsapp', 'both'])
      else if (scope === 'orders') q = q.in('applies_to', ['orders', 'both'])
      const { data } = await q
      return (data ?? []) as Tag[]
    },
    ['tags-scope', workspaceId, scope ?? 'all'],
    { revalidate: 300, tags: [`ref:tags:${workspaceId}`] },
  )()

export const getCachedPipelines = (workspaceId: string): Promise<PipelineWithStages[]> =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('pipelines').select('*, stages:pipeline_stages(*)')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      return ((data ?? []) as PipelineWithStages[]).map(p => ({
        ...p,
        stages: (p.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
      }))
    },
    ['pipelines', workspaceId],
    { revalidate: 300, tags: [`ref:pipelines:${workspaceId}`] },
  )()
```

VERIFICAR los paths reales de los tipos antes de escribir (`grep -rn "export interface Product\|export type Product" src/lib/`; idem Tag). El scope param se incluye en keyParts para no colisionar caches de scopes distintos.

NO cablear estas funciones a ningun call site en este plan (eso es Plan 03). Solo definirlas. NO agregar `revalidateTag` aun (los puntos de invalidacion se agregan en Plan 03 junto al cableado).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - 3 funciones exportadas: getCachedActiveProducts, getCachedTagsForScope, getCachedPipelines
    - Cada una recibe workspaceId como argumento (no lee cookies() dentro del callback)
    - Tags por workspace: ref:products / ref:tags / ref:pipelines
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "cookies()" src/lib/cache/reference-data.ts` == 0 (Pitfall 5)
    - `grep -c "unstable_cache" src/lib/cache/reference-data.ts` == 3
    - `grep -oE "ref:(products|tags|pipelines):" src/lib/cache/reference-data.ts | sort -u | wc -l` == 3
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP request → middleware | Sesion validada+refrescada (getUser) en el edge en cada request — INTACTO (D-04) |
| cookie JWT → Server Action (getRequestAuth) | Verificacion de identidad local (getClaims, firma ES256) — NO es el gate de revocacion |
| anon client JWT → Postgres | RLS se aplica desde el JWT enviado por el cliente anon, NO desde getRequestAuth |
| workspaceId derivacion | Solo de cookie `morfx_workspace`, NUNCA de body/arg |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-WCRL-01 | Spoofing/Tampering | getRequestAuth (getClaims) | mitigate | getClaims verifica firma ES256 via WebCrypto contra JWKS cacheado (NO es getSession inseguro). JWT forjado/alterado se rechaza. |
| T-WCRL-02 | Elevation of Privilege | workspaceId resolution | mitigate | workspaceId SOLO de cookie morfx_workspace; la firma del helper no acepta workspaceId como input. Test 6 (cross-workspace) lo verifica. |
| T-WCRL-03 | Spoofing (revocacion stale) | getClaims local verify | accept | getClaims no detecta revocacion server-side hasta expirar token (~1h). ACEPTADO por D-04: el middleware sigue llamando getUser() en CADA request (matcher cubre todas las rutas) → revocacion se captura en el siguiente navigation. El check per-action NUNCA fue el gate de revocacion. |
| T-WCRL-04 | Info Disclosure | React cache() / unstable_cache | mitigate | React cache() es per-request (no fuga cross-request). unstable_cache esta keyed por workspaceId (no fuga cross-workspace). |
| T-WCRL-05 | (Regla 6) | helper leaking a agente | mitigate | getRequestAuth es SOLO para Server Actions con cookie. Agente/webhooks usan createAdminClient + workspaceId explicito. Gate grep en planes siguientes: helper importado solo bajo src/app/actions/**. |

Confirmacion explicita (constraint del orchestrator): middleware sigue siendo el gate de revocacion; getClaims verifica firma (no es getSession); RLS intacto (viene del token en cookie); sin nuevo vector cross-workspace (workspaceId server-derivado de cookie).
</threat_model>

<verification>
- `npx tsc --noEmit` verde (red de seguridad D-09)
- `npx vitest run src/lib/auth/__tests__/request-auth.test.ts` → 6/6
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- Suite completa existente sigue verde: `npx vitest run` (no debe cambiar ningun test de semantica de auth)
- `grep -rln "getRequestAuth" src/` → SOLO src/lib/auth/request-auth.ts + su test (sin consumidores aun)
</verification>

<success_criteria>
- 5 archivos nuevos creados + layout editado + @tanstack/react-query@5.101.0 instalado
- Cero cambios de comportamiento en flujos de usuario (provider montado pero sin consumidores; cache definido pero sin cablear; helper sin call sites)
- tsc + tests verdes
- middleware.ts byte-identico
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/01-SUMMARY.md`
</output>
