# Shopify Dev Dashboard OAuth — Pattern Map

**Mapped:** 2026-05-11
**Standalone:** `shopify-dev-dashboard-oauth`
**Files analyzed:** 7 (4 new + 3 modified)
**Analogs found:** 6 / 7 with strong codebase precedent; 1 file (OAuth callback) has **only partial precedent** — see "No Analog Found" section. The `jose` library is in `package.json@6.1.3` but **never imported anywhere in `src/`** — the OAuth standalone introduces it.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/shopify/oauth.ts` (NEW) | utility (module) | request-response (HTTP-out) | `src/lib/shopify/hmac.ts` + `src/lib/shopify/connection-test.ts` | role-match (HMAC primitives present, JWT signing is new) |
| `src/lib/domain/integrations.ts` (NEW) | service (domain layer) | CRUD | `src/lib/domain/whatsapp-templates.ts` + `src/lib/domain/tags.ts` | exact (canonical Regla 3 pattern) |
| `src/app/api/integrations/shopify/oauth/callback/route.ts` (NEW) | route handler (GET) | request-response (redirect-based) | `src/app/auth/callback/route.ts` (Supabase OAuth callback) | role-match (redirect+error-param idiom; new path is full validation pipeline) |
| `src/app/actions/shopify-oauth.ts` (NEW server action) | controller (server action) | request-response | `src/app/actions/shopify.ts` lines 184-210 (auth + Owner check) | exact |
| `src/app/actions/shopify.ts` (MODIFY) | controller (server action) | CRUD | self — refactor to call `src/lib/domain/integrations.ts` | exact (Regla 3 refactor) |
| `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` (MODIFY — total replacement) | component (client) | request-response | self (delete form; OrdersView for `useSearchParams` toast UX) | partial (no existing OAuth-redirect form analog) |
| `src/app/(dashboard)/configuracion/integraciones/page.tsx` (MODIFY) | page (RSC) | request-response | self (no structural change — only consumer of toast inside form) | exact |

---

## Pattern Assignments

### `src/lib/shopify/oauth.ts` (utility, request-response)

**Analog 1 — HMAC primitive style:** `src/lib/shopify/hmac.ts:1-63` (entire file)
**Analog 2 — HTTP-fetch + error parsing:** `src/lib/shopify/connection-test.ts:31-124`
**Analog 3 — JWT (jose) — no codebase precedent.** RESEARCH.md Example 1 is canonical; follow RESEARCH verbatim.

**Imports pattern** (copy literal style from `src/lib/shopify/hmac.ts:1`):
```typescript
import crypto from 'crypto'           // NOT 'node:crypto' — match existing idiom in hmac.ts
// jose imports are NEW for this codebase — only this file should reference jose:
import { SignJWT, jwtVerify } from 'jose'
```
**Adaptation note:** `src/lib/shopify/hmac.ts:1` uses `import crypto from 'crypto'` (not `'node:crypto'`). RESEARCH.md Example 1 shows `'node:crypto'` — either works on Node, but **match the existing project idiom (`'crypto'`) for stylistic consistency** across the shopify module. The webhook hmac file uses this style and Vercel runs Node.

**HMAC primitive pattern** (copy structure from `src/lib/shopify/hmac.ts:37-63`):
```typescript
// src/lib/shopify/hmac.ts:37-63 — webhook HMAC (BASE64 over raw body)
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string,
  apiSecret: string
): boolean {
  const generatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64')                       // <-- BASE64

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedHmac),
      Buffer.from(hmacHeader)
    )
  } catch {
    return false                            // <-- mismatched buffer length safety
  }
}
```
**Adaptation note for the NEW `verifyOauthCallbackHmac`:**
- Keep the **outer shape identical** (createHmac → update → digest → timingSafeEqual in try/catch).
- Change `.digest('base64')` → `.digest('hex')` (RESEARCH Pitfall 1 — CRITICAL).
- The message is **sorted query params joined `key=value&...`** (raw decoded values, no URL encoding), NOT a raw body. See RESEARCH Example 2 lines 511-542.
- Add `Buffer.from(computed, 'hex')` / `Buffer.from(receivedHmac, 'hex')` for timingSafeEqual since both inputs are hex strings (RESEARCH Example 2 lines 534-537).
- Document the **DIFFERENCE from `verifyShopifyHmac`** in a JSDoc comment so future maintainers don't mix them up (RESEARCH Q4 explicitly calls this critical).

**External-API fetch + error envelope** (copy structure from `src/lib/shopify/connection-test.ts:48-123`):
```typescript
// src/lib/shopify/connection-test.ts:48-77 — fetch + status-based error map
try {
  const shopResponse = await fetch(`${baseUrl}/shop.json`, { headers })

  if (!shopResponse.ok) {
    const status = shopResponse.status
    if (status === 401) {
      return { success: false, error: 'Access Token invalido o expirado' }
    }
    if (status === 404) {
      return { success: false, error: 'Tienda no encontrada. Verifica el dominio.' }
    }
    // ...
  }
```
**Adaptation note for `exchangeCodeForToken` (RESEARCH Example 4 lines 598-617):** the new module **throws** instead of returning `{ success, error }`. That is correct — the callback route handler catches and maps to `fail('shopify_error', ...)`. Do not refactor `connection-test.ts` to throw; keep its existing `{success,error}` envelope (consumers depend on it).

---

### `src/lib/domain/integrations.ts` (service, CRUD)

**Analog (closest):** `src/lib/domain/whatsapp-templates.ts:1-180` + `src/lib/domain/tags.ts:1-120`
**Why these:** They are the canonical Regla 3 domain modules — both use `createAdminClient()`, accept `DomainContext` as first param, return `DomainResult<T>`, and filter every query by `workspace_id`. Whatsapp-templates is the closer match because it also handles a "config JSONB" entity with upsert semantics + create-vs-update branching (lines 78-90 uniqueness check; lines 142+ upsert).

**File header pattern** (copy structure from `src/lib/domain/whatsapp-templates.ts:1-21`):
```typescript
// ============================================================================
// Domain Layer — Shopify Integrations (Standalone shopify-dev-dashboard-oauth, D-10)
// Single source of truth for mutations on `integrations` WHERE type='shopify' (Regla 3).
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Read existing row by (workspace_id, type='shopify') to preserve config
//      fields the OAuth callback should NOT overwrite (pipeline_id, stage_id,
//      product_matching, enable_fuzzy_matching, auto_sync_orders)
//   3. INSERT or UPDATE based on existence
//   4. Return DomainResult<ShopifyIntegration>
//
// Callers:
//   - src/app/api/integrations/shopify/oauth/callback/route.ts (NEW)
//   - src/app/actions/shopify.ts (REFACTORED — delete/get paths)
// ============================================================================
```

**Imports pattern** (copy from `src/lib/domain/whatsapp-templates.ts:23-33`):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'
import type { ShopifyConfig, ShopifyIntegration } from '@/lib/shopify/types'
```

**DomainContext + DomainResult shape** (from `src/lib/domain/types.ts:15-40` — DO NOT redefine, import):
```typescript
// src/lib/domain/types.ts:15-27
export interface DomainContext {
  workspaceId: string
  source: string  // 'server-action' | 'webhook' | etc.
  cascadeDepth?: number
  actorId?: string | null
  actorLabel?: string | null
  triggerEvent?: string | null
}

// src/lib/domain/types.ts:36-40
export interface DomainResult<T = void> {
  success: boolean
  data?: T
  error?: string
}
```

**Upsert pattern with config-preservation** (copy structure from `src/app/actions/shopify.ts:238-300`):
```typescript
// src/app/actions/shopify.ts:238-259 — read existing config, preserve auto_sync_orders
const { data: existing } = await adminSupabase
  .from('integrations')
  .select('id, config')
  .eq('workspace_id', workspaceId)
  .eq('type', 'shopify')
  .single()

const existingConfig = existing?.config as Record<string, unknown> | undefined
const config: ShopifyConfig = {
  shop_domain: normalizedDomain,
  access_token: formData.access_token,
  api_secret: formData.api_secret,
  default_pipeline_id: formData.default_pipeline_id,
  default_stage_id: formData.default_stage_id,
  enable_fuzzy_matching: formData.enable_fuzzy_matching ?? false,
  product_matching: formData.product_matching ?? 'sku',
  ...(existingConfig?.auto_sync_orders !== undefined && {
    auto_sync_orders: existingConfig.auto_sync_orders as boolean,
  }),
}
```
**Adaptation note for `upsertShopifyIntegration`:** RESEARCH Example 8 (lines 876-934) covers this exactly. The key difference vs the legacy `saveShopifyIntegration` is that the OAuth callback does **NOT** have `default_pipeline_id` / `default_stage_id` to write — those must be **preserved from the existing row** (and defaulted to `''` on first connect; the user fills them via the connected-state UI). Follow RESEARCH Example 8 lines 891-901 — preserve **everything** in existing `config` except `shop_domain`/`access_token`/`api_secret`/`shopName`.

**Error-handling pattern** (copy idiom from `src/lib/domain/tags.ts:88-94`):
```typescript
const { data, error } = await supabase.from('integrations').update({...}).eq(...).select().single()
if (error) return { success: false, error: error.message }
return { success: true, data: updated as ShopifyIntegration }
```

**Adaptation note — barrel export:** Add `export * from './integrations'` to `src/lib/domain/index.ts:6-18` (the barrel). Currently no `integrations` line exists there. Follow the existing comment style (e.g. `// Standalone shopify-dev-dashboard-oauth`).

---

### `src/app/api/integrations/shopify/oauth/callback/route.ts` (route handler, request-response with redirect)

**Analog 1 — Redirect-with-query-error idiom:** `src/app/auth/callback/route.ts:1-19` (entire file — the Supabase auth callback)
**Analog 2 — `force-dynamic` declaration:** `src/app/api/mobile/conversations/[id]/messages/route.ts:43`
**Analog 3 — HMAC-first then process flow:** `src/app/api/webhooks/shopify/route.ts:21-78` (validate before parsing/persisting)

**The full pipeline (Zod → HMAC → state JWT → token exchange → scope drift → test → webhooks → domain upsert → redirect) has NO single-file analog in the codebase.** Follow RESEARCH.md Example 7 (lines 735-858) verbatim. The patterns below cover the pieces.

**Redirect-with-error-param pattern** (copy from `src/app/auth/callback/route.ts:1-19`):
```typescript
// src/app/auth/callback/route.ts:1-19 — Supabase OAuth callback, EXACT shape to mirror
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/crm'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login with error if code exchange fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
```
**Adaptation notes:**
- The Shopify OAuth callback is **structurally larger** (8 steps vs 2) but the **redirect-on-error idiom is identical**: every failure path returns `NextResponse.redirect('.../integraciones?error=oauth_failed&reason=<code>')`. RESEARCH Example 7 line 769 implements this via a `fail(reason, detail)` helper — keep that helper inline at the top of the route file (don't factor it out — used only once).
- **Use `process.env.NEXT_PUBLIC_APP_URL`** for the redirect base instead of `origin` from the request URL — the request comes in from `morfx.app` but in dev/preview the cookie domain and `NEXT_PUBLIC_APP_URL` must match. RESEARCH Example 7 line 769 uses this; the auth-callback analog uses `origin` because it's same-origin to its caller.

**Runtime + dynamic declarations** (copy idiom — analog `src/app/api/mobile/conversations/[id]/messages/route.ts:43`):
```typescript
// src/app/api/mobile/conversations/[id]/messages/route.ts:43
export const dynamic = 'force-dynamic'
```
**Adaptation note — `export const runtime = 'nodejs'`:** **No `route.ts` in this codebase currently declares `export const runtime = 'nodejs'`** (the existing webhook route at `src/app/api/webhooks/shopify/route.ts` relies on the implicit Node default). This standalone introduces the **explicit declaration** because (a) `node:crypto.timingSafeEqual` + `crypto.createHmac` are not available in Edge runtime (RESEARCH Pitfall 5), and (b) it's documentation for future maintainers. Place BOTH declarations at the top:
```typescript
export const runtime = 'nodejs'         // node:crypto required (Pitfall 5)
export const dynamic = 'force-dynamic'  // never cache OAuth callbacks
```

**HMAC-first validation flow** (copy structural ordering from `src/app/api/webhooks/shopify/route.ts:21-78`):
```typescript
// src/app/api/webhooks/shopify/route.ts:21-78 — validate headers FIRST, then HMAC, THEN parse/process
const rawBody = await request.text()
const hmacHeader = request.headers.get('X-Shopify-Hmac-SHA256')
// ... header presence checks ...

// Step 4: Verify HMAC (line 71-78)
const isValid = verifyShopifyHmac(rawBody, hmacHeader, apiSecret)
if (!isValid) {
  console.warn(`Invalid HMAC for shop: ${shopDomain}`)
  return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
}
// Step 5: ONLY now parse JSON
```
**Adaptation note:** Mirror this **early-validation discipline** in the OAuth callback. Sequence per RESEARCH Example 7:
1. Zod-parse query params (lines 780-783)
2. HMAC validate (lines 792-794) — **before** any DB/network work
3. State JWT verify (lines 798-802)
4. Token exchange (lines 806-810)
5. Scope drift check (lines 813-816)
6. Connection test (lines 819-822) — reuse existing `testShopifyConnection`
7. Webhook auto-creation (lines 826-834) — `Promise.allSettled`, never fails the route
8. Domain upsert (lines 838-850) — last mutation

**Logging idiom** (from `src/app/api/webhooks/shopify/route.ts:116-117`):
```typescript
const duration = Date.now() - startTime
console.log(`Shopify webhook [${topic}] processed in ${duration}ms: ${result.success ? 'success' : 'failed'}`)
```
**Adapt to:** `console.log(\`[oauth-callback] success shop=${shop} workspace=${workspaceId} duration=${duration}ms\`)` (RESEARCH Example 7 line 853).

---

### `src/app/actions/shopify-oauth.ts` (NEW server action — controller)

**Analog (closest):** `src/app/actions/shopify.ts:179-303` (`saveShopifyIntegration`) — the **auth + Owner check + workspace cookie** pattern.

**Auth + Owner check pattern** (copy literally from `src/app/actions/shopify.ts:184-210`):
```typescript
// src/app/actions/shopify.ts:184-210 — auth gate idiom
const supabase = await createClient()

const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  return { success: false, error: 'No autenticado' }
}

const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value
if (!workspaceId) {
  return { success: false, error: 'No hay workspace seleccionado' }
}

const { data: member } = await supabase
  .from('workspace_members')
  .select('role')
  .eq('workspace_id', workspaceId)
  .eq('user_id', user.id)
  .single()

if (!member || member.role !== 'owner') {
  return { success: false, error: 'Solo el Owner puede configurar integraciones' }
}
```
**Adaptation notes for `startShopifyOauth` (RESEARCH Example 6 lines 691-732):**
- **Return envelope shape:** RESEARCH Example 6 uses `{ ok: true | false }` but the existing project idiom is `{ success: true | false, error?: string }` (see `src/app/actions/shopify.ts:151`, `:179-183`, `:303`, `:359`). **Pick ONE convention before executing.** **Recommendation:** keep `{ success, error }` to match the rest of `shopify.ts` so the form component doesn't juggle two shapes. Update RESEARCH Example 6's caller (Example 9 line 1008) accordingly.
- Reuse `normalizeShopDomain` from `src/lib/shopify/connection-test.ts:136-168` for the input domain — already covers `https://`, trailing slash, paths, store-name-only inputs.
- Layer a **stricter post-normalize regex** `/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/` (RESEARCH Pitfall 3) to block injection patterns `normalizeShopDomain` doesn't catch (e.g. embedded user-info `evil.com@store.myshopify.com`).

---

### `src/app/actions/shopify.ts` (MODIFY — refactor to call domain)

**Analog:** self. The file already has the correct auth/Owner skeleton (lines 184-210); only the **mutation lines** change.

**Lines to refactor:**
- **Delete** `testConnection`, `saveShopifyIntegration` (these become unused; the OAuth callback owns the test+save path now). **Verify with grep before delete** that no other consumer imports them — RESEARCH Q1 doesn't mandate full removal, but D-03 says "el form viejo se elimina", so the actions become dead code.
- **Keep + refactor** `deleteShopifyIntegration` (lines 359-402): replace lines 390-394 (direct `adminSupabase.from('integrations').delete()`) with a call to `domain.deleteShopifyIntegration({ workspaceId, source: 'server-action' })`. Keep auth gate identical (lines 366-388).
- **Keep** `getShopifyIntegration` (lines 24-44), `getWebhookEvents` (lines 50-111), `getPipelinesForConfig` (lines 117-141), `toggleShopifyIntegration` (lines 309-352), `getIntegrationStatus` (lines 408-461) — read-only or non-config mutations, untouched by this standalone (Regla 3 applies to **mutations**; reads can stay).

**Pre-refactor snippet to replace** (`src/app/actions/shopify.ts:389-394`):
```typescript
const { error } = await adminSupabase
  .from('integrations')
  .delete()
  .eq('workspace_id', workspaceId)
  .eq('type', 'shopify')

if (error) {
  console.error('Error deleting integration:', error)
  return { success: false, error: 'Error al eliminar integracion' }
}
```

**Post-refactor target:**
```typescript
const result = await deleteShopifyIntegration(    // <-- domain layer (renamed import)
  { workspaceId, source: 'server-action' }
)
if (!result.success) {
  console.error('Error deleting integration:', result.error)
  return { success: false, error: 'Error al eliminar integracion' }
}
```
**Adaptation note — naming collision:** `src/app/actions/shopify.ts:359` already exports a function called `deleteShopifyIntegration`. The new domain function has the **same name**. Import with rename:
```typescript
import { deleteShopifyIntegration as domainDeleteShopifyIntegration } from '@/lib/domain/integrations'
```

---

### `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` (MODIFY — total replacement)

**Analog 1 — Existing component scaffold (states, useTransition, toast):** `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx:51-120` (the file being replaced — preserve the connected-state branch).
**Analog 2 — `useSearchParams` for query-param-driven UX:** `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:143-189`.
**Analog 3 — Pattern for `useEffect` + toast on query-param error:** **NO existing analog in codebase.** RESEARCH Example 9 lines 982-999 introduces this pattern. Follow verbatim.

**`useSearchParams` import + read pattern** (copy from `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:143-154`):
```typescript
// src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:143-154
const router = useRouter()
const searchParams = useSearchParams()
// ...
const defaultContactId = searchParams.get('contact_id')
```

**Adaptation note — Suspense boundary:** `useSearchParams` requires a Suspense boundary in Next 16. The parent `page.tsx` already wraps the form in `<Suspense fallback={...}>` at line 99-104 — **no change needed**, just verify the boundary still exists post-refactor.

**Existing useTransition + toast pattern** (preserve from `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx:51-113`):
```typescript
// src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx:53,98-113
const [isPending, startTransition] = useTransition()
// ...
const handleTestConnection = async () => {
  setIsTesting(true)
  setTestResult(null)
  const formData = watch()
  const result = await testConnection(formData)
  setTestResult(result)
  setIsTesting(false)
  if (result.success) {
    toast.success(`Conexion exitosa con ${result.shopName}`)
  } else {
    toast.error(result.error || 'Error de conexion')
  }
}
```
**Adaptation note — disconnected branch (NEW per D-03):**
- The form is split into **two branches** by `if (!integration)`:
  - **Disconnected (NEW):** single `Input` for `shop_domain` + `Button` "Conectar con Shopify" → calls `startShopifyOauth` server action → on success `window.location.href = result.redirectUrl` (top-level navigation, NOT `router.push`, because we're going off-origin to Shopify).
  - **Connected (PRESERVE):** the existing pipeline/stage selectors + delete button. Extract to a `ConnectedShopifyView` subcomponent or inline — both fine. **Delete** the `access_token` / `api_secret` inputs (lines that use `register('access_token')` / `register('api_secret')`). Keep `register('default_pipeline_id')` / etc.
- Follow RESEARCH Example 9 lines 1016-1043 verbatim for the new disconnected branch.

**Query-param toast effect** (NEW pattern — no codebase analog; copy from RESEARCH Example 9 lines 982-999):
```typescript
// RESEARCH.md Example 9 lines 982-999 — surface oauth_failed / oauth_connected
useEffect(() => {
  const error = searchParams.get('error')
  const reason = searchParams.get('reason')
  const success = searchParams.get('success')

  if (error === 'oauth_failed' && reason) {
    const messages: Record<string, string> = {
      denied: 'Permisos denegados. Es necesario aceptar todos los permisos solicitados.',
      hmac_mismatch: 'Error de seguridad al conectar (HMAC invalido). Intenta de nuevo.',
      state_expired: 'La conexion expiro. Intenta de nuevo.',
      shopify_error: 'Shopify devolvio un error. Verifica el dominio de tu tienda e intenta de nuevo.',
    }
    toast.error(messages[reason] ?? 'Error al conectar con Shopify')
  } else if (success === 'oauth_connected') {
    toast.success('Tienda Shopify conectada exitosamente')
  }
}, [searchParams])
```
**Adaptation note — URL cleanup after toast:** After firing the toast, **clear the query params** with `router.replace('/configuracion/integraciones', { scroll: false })` so a page refresh doesn't re-fire the toast. RESEARCH Example 9 omits this — add it after the `toast.*()` call. Use `router.replace` (Next router) rather than `window.history.replaceState` here because we **want** a re-render (the connected-state branch should now show). Compare with the `pedidos` view (line 185) which uses `replaceState` precisely because it does NOT want a re-fetch — opposite case here.

---

### `src/app/(dashboard)/configuracion/integraciones/page.tsx` (MODIFY — minor)

**Analog:** self.

**Changes:**
- **Remove** the "Como configurar" instructions card (lines 133-164) — those instructions describe the legacy `shpat_` flow that's being deleted. Replace with a brief paragraph: "Conecta tu tienda con 1 click via OAuth." Optional — RESEARCH and CONTEXT don't mandate removal, but D-03 says "Reemplazo TOTAL del form" which arguably includes the now-stale instructions.
- **No other structural change.** The form is already wrapped in `<Suspense>` (line 99) — that boundary covers `useSearchParams` in the new shopify-form.tsx.

---

## Shared Patterns

### Pattern A — Domain Layer (Regla 3)
**Source:** `src/lib/domain/types.ts:15-40` + `src/lib/domain/whatsapp-templates.ts:71-180` + `src/lib/domain/tags.ts:61-160`
**Apply to:** `src/lib/domain/integrations.ts` (NEW)
**Rule:** Every mutation function:
1. Accepts `(ctx: DomainContext, params: P)` as signature.
2. Uses `createAdminClient()` (bypasses RLS).
3. Filters EVERY query by `ctx.workspaceId`.
4. Returns `DomainResult<T>` discriminated on `success`.
5. Catches errors and converts to `{ success: false, error: string }` — NEVER throws.

**Validation gate (executor must verify):**
```bash
grep -rn "createAdminClient\|@supabase/supabase-js" src/app/api/integrations/shopify/ src/app/actions/shopify-oauth.ts
# Expected: 0 matches (callers MUST go through domain layer)
```

### Pattern B — Owner-Only Mutation (server actions + callback)
**Source:** `src/app/actions/shopify.ts:184-210` (canonical) + `src/app/actions/shopify.ts:316-338` (toggle) + `:366-388` (delete)
**Apply to:**
- `src/app/actions/shopify-oauth.ts` startShopifyOauth — full pattern (cookie + auth.getUser() + workspace_members.role check).
- `src/app/api/integrations/shopify/oauth/callback/route.ts` — **DOES NOT use cookies** (cross-origin redirect). Instead, the `workspaceId` + `userId` come from the **verified state JWT payload** (RESEARCH Example 7 line 799). **Owner re-check inside callback is optional** but recommended for defense-in-depth — if implemented, query `workspace_members` by the `userId` from the JWT.

**Recommendation for executor:** Add Owner re-check in callback as a 9th step between JWT verify and token exchange:
```typescript
// After state JWT verify, before token exchange
const supabase = createAdminClient()
const { data: member } = await supabase
  .from('workspace_members')
  .select('role')
  .eq('workspace_id', statePayload.workspaceId)
  .eq('user_id', statePayload.userId)
  .single()
if (!member || member.role !== 'owner') {
  return fail('denied', 'user no longer owner')
}
```
This protects against the rare case where the user was demoted between starting OAuth and the callback.

### Pattern C — Server Action Return Envelope
**Source:** `src/app/actions/shopify.ts` (consistent across all 6 mutation actions): `{ success: boolean; error?: string; integration?: ShopifyIntegration }`
**Apply to:** `src/app/actions/shopify-oauth.ts` startShopifyOauth → use `{ success: boolean; error?: string; redirectUrl?: string }` to match.
**RESEARCH Example 6 deviation:** Example 6 uses `{ ok: true | false }` — **rename to `success`** when implementing.

### Pattern D — Route Handler Runtime + Dynamic Declaration
**Source:** `src/app/api/mobile/conversations/[id]/messages/route.ts:43` (force-dynamic precedent)
**Apply to:** `src/app/api/integrations/shopify/oauth/callback/route.ts`
**Note:** `export const runtime = 'nodejs'` is **NEW to this codebase** (no existing route declares it). Document inline why with a comment referencing RESEARCH Pitfall 5.

### Pattern E — Redirect-with-Query-Error UX
**Source:** `src/app/auth/callback/route.ts:13-18` (Supabase auth callback redirect-on-error idiom)
**Apply to:** `src/app/api/integrations/shopify/oauth/callback/route.ts` — every failure path returns `NextResponse.redirect('...?error=oauth_failed&reason=X')`, NEVER throws JSON.
**Toast consumer:** `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` (new useEffect — RESEARCH Example 9).

### Pattern F — HMAC Validation Discipline (separate functions for OAuth vs webhook)
**Source:** `src/lib/shopify/hmac.ts:37-63` (webhook, BASE64 over body)
**Apply to:** `src/lib/shopify/oauth.ts` — `verifyOauthCallbackHmac` is a **NEW SEPARATE FUNCTION** (HEX over sorted query params). RESEARCH Q4 + Pitfall 1 mandate they live in different files with explicit JSDoc warnings.
**Anti-pattern guard:** Do NOT refactor `verifyShopifyHmac` to share code with `verifyOauthCallbackHmac` — they have different algorithms; sharing risks future maintainer breaking one when fixing the other.

### Pattern G — Test Before Persist (existing convention)
**Source:** `src/app/actions/shopify.ts:227-236` (`testShopifyConnection` is called before insert/update)
**Apply to:** `src/app/api/integrations/shopify/oauth/callback/route.ts` — call `testShopifyConnection(shop, accessToken, clientSecret)` (RESEARCH Example 7 line 819) after token exchange, before domain upsert.
**Reuse:** `src/lib/shopify/connection-test.ts:31-124` — **no change needed.** The function works identically with OAuth offline tokens (per D-09 — same `X-Shopify-Access-Token` header).

---

## No Analog Found

The following patterns have **no precedent in the morfx codebase**. The executor should follow `RESEARCH.md` verbatim:

| New Item | Why No Analog | Reference |
|---|---|---|
| JWT signing with `jose` (`SignJWT` + `jwtVerify`) | `jose` is in `package.json@6.1.3` but **never imported in `src/`** (verified via grep). Supabase middleware uses `jose` transitively but no first-party JWT code exists. | RESEARCH Example 1 (lines 435-484) |
| HMAC over sorted query params (hex digest) | Codebase only has webhook HMAC (base64 over body). OAuth HMAC algorithm is genuinely different (RESEARCH Q4). | RESEARCH Example 2 (lines 486-543) |
| OAuth Authorization Code Grant flow (any provider) | Only `src/app/auth/callback/route.ts` exists, and it's the Supabase **client-side** OAuth (using `exchangeCodeForSession` on the Supabase client), not a hand-rolled code-for-token exchange. The Meta integration uses encrypted long-lived tokens (`src/lib/meta/credentials.ts`), not OAuth code grant. | RESEARCH Example 7 (lines 735-858) |
| `export const runtime = 'nodejs'` | No route handler in `src/app/api` currently declares this (only `force-dynamic` exists). | RESEARCH Pitfall 5; declare at top of new callback route |
| Scope drift detection (compare returned scope vs requested) | New concept — `connection-test.ts:69-94` checks scopes via a separate `/oauth/access_scopes.json` call **after** save, not in the OAuth callback path. | RESEARCH Example 4 lines 619-625, Pitfall 2 |
| `useEffect` + `useSearchParams` + `toast` for query-param error surfacing | `useSearchParams` is used in 4 dashboard files for state-driven UX (orders kanban pipeline tab, contacts table filters, etc.) but **never** for "show toast on redirect-back error". | RESEARCH Example 9 lines 982-999 |
| Webhook auto-creation via Shopify Admin API REST POST | The codebase **receives** Shopify webhooks (`src/app/api/webhooks/shopify/route.ts`) but never **creates** them programmatically. | RESEARCH Example 5 (lines 628-679) |

---

## Cross-Reference Map (for the planner)

| Plan-likely topic | Files affected | Primary patterns to copy |
|---|---|---|
| **Wave 0** — env vars + migration check | (no source changes) | — |
| **Wave 1** — domain layer + oauth.ts primitives | `src/lib/domain/integrations.ts` (NEW), `src/lib/domain/index.ts` (barrel +1 line), `src/lib/shopify/oauth.ts` (NEW) | Pattern A, F; `src/lib/domain/whatsapp-templates.ts` + `src/lib/shopify/hmac.ts` |
| **Wave 2** — server action + route handler | `src/app/actions/shopify-oauth.ts` (NEW), `src/app/api/integrations/shopify/oauth/callback/route.ts` (NEW) | Pattern B, C, D, E, G; `src/app/actions/shopify.ts` (auth gate) + `src/app/auth/callback/route.ts` (redirect idiom) |
| **Wave 3** — UI refactor + actions refactor | `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` (MODIFY total), `src/app/(dashboard)/configuracion/integraciones/page.tsx` (MODIFY minor), `src/app/actions/shopify.ts` (MODIFY delete path) | Pattern E (toast consumer); existing shopify-form.tsx connected-state branch (preserve) |
| **Wave 4** — verification + smoke | n/a | n/a |

---

## Metadata

**Analog search scope:**
- `src/lib/shopify/` (5 files read in full or scanned)
- `src/lib/domain/` (4 files sampled — whatsapp-templates, tags, platform-config, messages-send-idempotent; plus `types.ts` + `index.ts` in full)
- `src/lib/meta/credentials.ts` (alternate-integration analog, partial read)
- `src/app/actions/shopify.ts` (full read)
- `src/app/api/webhooks/shopify/route.ts` (full read)
- `src/app/auth/callback/route.ts` (full read)
- `src/app/api/mobile/conversations/[id]/messages/route.ts` (header read for `dynamic` precedent)
- `src/app/(dashboard)/configuracion/integraciones/page.tsx` (full read)
- `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` (partial — first 120 lines)
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` (partial — lines 130-189 for useSearchParams)

**Searched for (zero results):**
- `from 'jose'` or `from "jose"` in `src/**` — confirmed `jose` is unused first-party
- `oauth/access_token` exchange POST — confirmed no existing OAuth code-grant flow
- `export const runtime = 'nodejs'` in `src/app/**` — confirmed no precedent (only `force-dynamic` exists)

**Files scanned:** ~12
**Pattern extraction date:** 2026-05-11
