---
phase: shopify-dev-dashboard-oauth
plan: 05
title: OAuth callback route handler (nodejs runtime + full 8-step pipeline)
wave: 2
depends_on: [2, 3, 4]
files_modified:
  - src/app/api/integrations/shopify/oauth/callback/route.ts
autonomous: true
estimated_minutes: 55
requirements_addressed: []
must_haves:
  truths:
    - "Existe `src/app/api/integrations/shopify/oauth/callback/route.ts` con `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'`"
    - "Handler valida en orden: (1) zod query schema, (2) HMAC HEX, (3) state JWT, (4) Owner re-check, (5) token exchange, (6) scope drift, (7) connection test, (8) 3 webhooks Promise.allSettled, (9) domain upsert, (10) redirect success"
    - "Cualquier falla redirect a `${NEXT_PUBLIC_APP_URL}/configuracion/integraciones?error=oauth_failed&reason=<denied|hmac_mismatch|state_expired|shopify_error>` (D-12)"
    - "Webhook failures NO fail OAuth (RESEARCH Pattern 4 + Q3)"
    - "Cero `adminSupabase.from('integrations').*` directo — solo via `upsertShopifyIntegration` del domain (Regla 3)"
    - "`access_token` jamás aparece en logs"
    - "Persiste `granted_scope` en config para drift detection futura (Open Question 8)"
  artifacts:
    - path: "src/app/api/integrations/shopify/oauth/callback/route.ts"
      provides: "GET handler que cierra el OAuth flow"
      min_lines: 120
      exports: ["GET", "runtime", "dynamic"]
  key_links:
    - from: "callback/route.ts → src/lib/shopify/oauth.ts"
      via: "verifyOauthCallbackHmac, verifyStateJwt, exchangeCodeForToken, detectScopeDrift, createWebhooksAfterOauth, SHOPIFY_SCOPES"
      pattern: "from '@/lib/shopify/oauth'"
    - from: "callback/route.ts → src/lib/domain/integrations.ts"
      via: "upsertShopifyIntegration({ workspaceId, source: 'oauth-callback' })"
      pattern: "upsertShopifyIntegration"
    - from: "callback/route.ts → src/lib/shopify/connection-test.ts"
      via: "testShopifyConnection (reuse existente, sin cambios)"
      pattern: "testShopifyConnection"
---

<objective>
Crear `src/app/api/integrations/shopify/oauth/callback/route.ts` — el endpoint que Shopify llama tras autorización. Es el corazón cripto-defensivo del flow: valida HMAC HEX, state JWT, scope drift, intercambia code→token, prueba conexión, crea 3 webhooks, persiste vía domain layer. Cada falla redirige con `?error=oauth_failed&reason=...` sin filtrar info al cliente.

Purpose: cierre del round-trip Shopify→MorfX. Después de este punto, la integración existe en BD y la UI muestra "conectado".

Output: route handler funcional, listo para smoke test (Plan 07).

**Wave 2 depende de Plan 02 (domain), Plan 03 (oauth.ts) y Plan 04 (start action shape).** El callback NO depende del start runtime, pero sí del shape del state JWT (sub/iss/payload).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@.planning/standalone/shopify-dev-dashboard-oauth/PATTERNS.md
@.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/02-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/03-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/04-SUMMARY.md
@CLAUDE.md
@src/app/auth/callback/route.ts
@src/app/api/webhooks/shopify/route.ts
@src/lib/shopify/connection-test.ts
@src/lib/shopify/types.ts

<interfaces>
<!-- All consumed from Plans 02 + 03 + existing code. -->

From Plan 03 (`src/lib/shopify/oauth.ts`):
```typescript
export const SHOPIFY_SCOPES: readonly ['read_orders', 'read_customers', 'read_draft_orders']
export function verifyOauthCallbackHmac(params: Record<string, string>, receivedHmac: string, clientSecret: string): boolean
export function verifyStateJwt(token: string): Promise<{ workspaceId: string; userId: string; nonce: string }>  // throws if invalid/expired
export function exchangeCodeForToken(opts: { shop: string; code: string }): Promise<{ accessToken: string; scope: string }>  // throws on non-2xx
export function detectScopeDrift(returnedScope: string, required: readonly string[]): string[]
export function createWebhooksAfterOauth(opts: { shop: string; accessToken: string; webhookUrl: string }): Promise<WebhookCreationResult[]>
```

From Plan 02 (`src/lib/domain/integrations.ts`):
```typescript
export async function upsertShopifyIntegration(
  ctx: DomainContext,
  params: { shopDomain: string; accessToken: string; apiSecret: string; shopName: string; grantedScope?: string }
): Promise<DomainResult<ShopifyIntegration>>
```

From existing (`src/lib/shopify/connection-test.ts`) — UNCHANGED:
```typescript
export function testShopifyConnection(
  shop: string,
  accessToken: string,
  apiSecret: string
): Promise<{ success: boolean; shopName?: string; error?: string }>
```

From existing (`src/lib/supabase/admin.ts`) — used ONLY for Owner re-check (NOT for `integrations` mutations):
```typescript
export function createAdminClient(): SupabaseClient
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Skeleton + runtime/dynamic declarations + zod schema + fail helper + steps 1-4 (parse, HMAC, state JWT, Owner re-check)</name>
  <files>src/app/api/integrations/shopify/oauth/callback/route.ts</files>
  <read_first>
    - PATTERNS.md §"`src/app/api/integrations/shopify/oauth/callback/route.ts`" — completa
    - `src/app/auth/callback/route.ts:1-19` (redirect-with-error idiom canónico)
    - `src/app/api/webhooks/shopify/route.ts:1-78` (HMAC-first validation discipline)
    - `src/app/api/mobile/conversations/[id]/messages/route.ts:43` (`force-dynamic` precedent)
    - RESEARCH.md §Code Examples §Example 7 (líneas 735-858) — implementación canónica verbatim
    - RESEARCH.md §Pitfall 5 (runtime nodejs obligatorio para node:crypto)
    - RESEARCH.md §Pitfall 6 (RAW values en HMAC message — Plan 03 ya lo encapsuló)
    - CONTEXT.md D-07 (HMAC validation), D-08 (state JWT), D-12 (redirect con reason)
    - PATTERNS.md §"Pattern B — Owner-Only Mutation" §"Recommendation for executor" (Owner re-check post-state JWT)
  </read_first>
  <action>
    Crear `src/app/api/integrations/shopify/oauth/callback/route.ts`:

    ```typescript
    // ============================================================================
    // OAuth Callback Route Handler (Standalone shopify-dev-dashboard-oauth)
    //
    // Receives Shopify's 302 redirect after user authorizes the MorfX app.
    // Pipeline (FAIL FAST — every step short-circuits to redirect on error):
    //   1. zod-parse query params
    //   2. HMAC HEX verify (CRITICAL: separate from webhook HMAC — Pitfall 1)
    //   3. State JWT verify (signature + exp + payload shape)
    //   4. Owner re-check (defense in depth — user could be demoted mid-flow)
    //   5. Token exchange (POST /admin/oauth/access_token)
    //   6. Scope drift detection (Pitfall 2 — user can tamper with scope)
    //   7. Connection test (reuse existing testShopifyConnection)
    //   8. Auto-create 3 webhooks (Promise.allSettled; failures DON'T fail OAuth)
    //   9. Domain upsert (Regla 3 — single source of truth for integrations table)
    //  10. 302 redirect with ?success=oauth_connected
    //
    // Runtime: 'nodejs' (REQUIRED for node:crypto — Pitfall 5).
    // Dynamic: 'force-dynamic' (never cache OAuth callbacks).
    // ============================================================================

    import { NextRequest, NextResponse } from 'next/server'
    import { z } from 'zod'
    import {
      verifyOauthCallbackHmac,
      verifyStateJwt,
      exchangeCodeForToken,
      detectScopeDrift,
      createWebhooksAfterOauth,
      SHOPIFY_SCOPES,
    } from '@/lib/shopify/oauth'
    import { testShopifyConnection } from '@/lib/shopify/connection-test'
    import { upsertShopifyIntegration } from '@/lib/domain/integrations'
    import { createAdminClient } from '@/lib/supabase/admin'

    export const runtime = 'nodejs'         // CRITICAL: node:crypto needs nodejs (Pitfall 5)
    export const dynamic = 'force-dynamic'  // CRITICAL: never cache OAuth callbacks

    const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

    const CallbackQuerySchema = z.object({
      code: z.string().min(1),
      hmac: z.string().min(1),
      shop: z.string().regex(SHOP_REGEX),
      state: z.string().min(1),
      timestamp: z.string().min(1),
      host: z.string().optional(),
    })

    type FailReason = 'denied' | 'hmac_mismatch' | 'state_expired' | 'shopify_error'

    function fail(reason: FailReason, detail?: string): NextResponse {
      if (detail) console.warn(`[oauth-callback] fail ${reason}: ${detail}`)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const url = `${baseUrl}/configuracion/integraciones?error=oauth_failed&reason=${reason}`
      return NextResponse.redirect(url)
    }

    export async function GET(request: NextRequest) {
      const startTime = Date.now()
      const sp = request.nextUrl.searchParams

      // === Step 1: zod-parse query params ===
      // Build a plain object from URLSearchParams (already URL-decoded by Next).
      // RAW (decoded) values needed for HMAC message construction (Pitfall 6).
      const queryObj: Record<string, string> = {}
      sp.forEach((v, k) => { queryObj[k] = v })
      const parsed = CallbackQuerySchema.safeParse(queryObj)
      if (!parsed.success) {
        return fail('shopify_error', `invalid-query: ${parsed.error.message.slice(0, 200)}`)
      }
      const { code, hmac, shop, state } = parsed.data

      const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
      if (!clientSecret) {
        return fail('shopify_error', 'SHOPIFY_CLIENT_SECRET not set')
      }

      // === Step 2: HMAC validation (HEX over sorted params excluding hmac itself) ===
      if (!verifyOauthCallbackHmac(queryObj, hmac, clientSecret)) {
        return fail('hmac_mismatch', `shop=${shop}`)
      }

      // === Step 3: State JWT verification (sig + exp + payload) ===
      let statePayload: { workspaceId: string; userId: string; nonce: string }
      try {
        statePayload = await verifyStateJwt(state)
      } catch (err) {
        return fail('state_expired', String(err).slice(0, 200))
      }

      // === Step 4: Owner re-check (defense-in-depth — user could be demoted mid-flow) ===
      // Pattern B — uses admin client because we don't have a session cookie here (cross-origin).
      const adminSupabase = createAdminClient()
      const { data: member } = await adminSupabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', statePayload.workspaceId)
        .eq('user_id', statePayload.userId)
        .single()
      if (!member || member.role !== 'owner') {
        return fail('denied', `user ${statePayload.userId} no longer owner of workspace ${statePayload.workspaceId}`)
      }

      // ... Steps 5-10 added in Task 2 below ...

      // TEMP placeholder for Task 1 verification — Task 2 replaces this entire tail.
      return fail('shopify_error', 'pipeline incomplete (placeholder — Task 2 to add steps 5-10)')
    }
    ```

    **NO COMMIT en este task** — Task 2 completa el pipeline en el mismo archivo y luego commiteamos.

    Decisiones D referenciadas: D-07, D-08, D-12.
  </action>
  <verify>
    <automated>test -f src/app/api/integrations/shopify/oauth/callback/route.ts && echo "EXISTS"</automated>
    <automated>grep -F "export const runtime = 'nodejs'" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep -F "export const dynamic = 'force-dynamic'" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep -c "verifyOauthCallbackHmac\|verifyStateJwt\|workspace_members\|role !== 'owner'" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep "CallbackQuerySchema" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep "SHOP_REGEX = /\^\[a-z0-9\]\[a-z0-9-\]\*\\\\.myshopify\\\\.com\\\$/" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
  </verify>
  <done>
    - Archivo creado con declaraciones de runtime/dynamic en posición top-level
    - Zod schema + fail helper definidos
    - Steps 1-4 implementados (parse, HMAC, JWT, Owner re-check)
    - Placeholder al final que Task 2 reemplazará
    - **NO commit todavía** (Task 2 finaliza el pipeline)
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Steps 5-10 (token exchange, scope drift, connection test, webhooks, domain upsert, success redirect) + commit</name>
  <files>src/app/api/integrations/shopify/oauth/callback/route.ts</files>
  <read_first>
    - El archivo creado en Task 1 (releer para conocer el estado actual)
    - RESEARCH.md §Code Examples §Example 7 líneas 803-857 (steps 5-10)
    - RESEARCH.md §Pitfall 2 (scope drift → `reason=denied`), §Pitfall 9 (422 = success — ya manejado en oauth.ts Task 3 Plan 03)
    - RESEARCH.md §Pattern 4 (webhook creation sincrónico, failures NO bloquean)
    - RESEARCH.md §Open Question 8 (persist granted_scope)
    - PATTERNS.md §"Pattern G — Test Before Persist"
    - CONTEXT.md D-04 (webhooks creados con URL `${NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`)
    - CONTEXT.md D-09 (mismo storage: access_token en config JSONB)
    - CONTEXT.md D-10 (Regla 3: solo domain layer)
  </read_first>
  <action>
    Reemplazar el placeholder de Task 1 (la línea `return fail('shopify_error', 'pipeline incomplete (placeholder — Task 2 to add steps 5-10)')`) con el resto del pipeline:

    ```typescript
      // === Step 5: Exchange code for token ===
      let tokenResult: { accessToken: string; scope: string }
      try {
        tokenResult = await exchangeCodeForToken({ shop, code })
      } catch (err) {
        return fail('shopify_error', `token-exchange: ${String(err).slice(0, 200)}`)
      }

      // === Step 6: Scope drift detection (Pitfall 2) ===
      const missing = detectScopeDrift(tokenResult.scope, SHOPIFY_SCOPES)
      if (missing.length > 0) {
        return fail('denied', `missing scopes: ${missing.join(',')}`)
      }

      // === Step 7: Verify token works (reuse existing connection-test, unchanged) ===
      const testResult = await testShopifyConnection(shop, tokenResult.accessToken, clientSecret)
      if (!testResult.success) {
        return fail('shopify_error', `connection-test: ${testResult.error ?? 'unknown'}`)
      }

      // === Step 8: Auto-create 3 webhooks (D-04) ===
      // Pattern 4: synchronous, Promise.allSettled, failures DON'T fail OAuth.
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const webhookUrl = `${baseUrl}/api/webhooks/shopify`
      const webhookResults = await createWebhooksAfterOauth({
        shop,
        accessToken: tokenResult.accessToken,
        webhookUrl,
      })
      webhookResults.forEach(r => {
        if (!r.ok) {
          console.warn(`[oauth-callback] webhook ${r.topic} failed: status=${r.status} error=${r.error ?? ''}`)
        } else {
          console.log(`[oauth-callback] webhook ${r.topic} OK (status=${r.status})`)
        }
      })
      // NOTE: continue even if some webhooks failed — user can retry from UI later (RESEARCH Q3)

      // === Step 9: Persist via domain layer (Regla 3, D-10) ===
      // Open Question 8: persist granted_scope for future drift detection.
      const upsertResult = await upsertShopifyIntegration(
        { workspaceId: statePayload.workspaceId, source: 'oauth-callback' },
        {
          shopDomain: shop,
          accessToken: tokenResult.accessToken,
          apiSecret: clientSecret,  // used by webhook HMAC validation (existing inbound webhooks)
          shopName: testResult.shopName ?? shop,
          grantedScope: tokenResult.scope,
        }
      )
      if (!upsertResult.success) {
        return fail('shopify_error', `domain-upsert: ${upsertResult.error ?? 'unknown'}`)
      }

      // === Step 10: Redirect success ===
      const duration = Date.now() - startTime
      console.log(
        `[oauth-callback] success shop=${shop} workspace=${statePayload.workspaceId} ` +
        `webhooks_ok=${webhookResults.filter(r => r.ok).length}/${webhookResults.length} ` +
        `duration=${duration}ms`,
      )

      return NextResponse.redirect(
        `${baseUrl}/configuracion/integraciones?success=oauth_connected`,
      )
    }  // ← closes export async function GET(request)
    ```

    Asegurar:
    - **NO loguear `access_token`** en ningún `console.log` / `console.warn`.
    - El `source: 'oauth-callback'` taxonomy es nuevo (vs `'server-action'`/`'webhook'`). Compatible con `DomainContext.source: string`.
    - Webhook URL no tiene trailing slash.

    **Type-check + commit atómico:**
    ```bash
    npx tsc --noEmit 2>&1 | grep "oauth/callback/route.ts" | head -20
    # esperado: sin errores

    git add src/app/api/integrations/shopify/oauth/callback/route.ts
    git commit -m "$(cat <<'EOF'
    feat(shopify-oauth 05): callback route handler con 10-step pipeline (D-07, D-08, D-12)

    - src/app/api/integrations/shopify/oauth/callback/route.ts NEW (runtime=nodejs, dynamic=force-dynamic)
    - Pipeline: zod -> HMAC HEX -> state JWT -> Owner re-check -> token exchange ->
      scope drift -> testShopifyConnection -> webhooks (allSettled) -> domain upsert -> 302
    - Cero adminSupabase.from('integrations') directo (Regla 3 satisfecha via upsertShopifyIntegration)
    - access_token jamás en logs
    - granted_scope persistido para drift detection futura (RESEARCH Q8)
    - Owner re-check defense-in-depth post-state-JWT (PATTERNS Pattern B recommendation)

    Plan 05/Wave 2. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```
  </action>
  <verify>
    <automated>grep -c "exchangeCodeForToken\|detectScopeDrift\|testShopifyConnection\|createWebhooksAfterOauth\|upsertShopifyIntegration" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep -c "fail('shopify_error'\|fail('denied'\|fail('hmac_mismatch'\|fail('state_expired'" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep "success=oauth_connected" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>! grep -E "from\('integrations'\)\.(insert|update|upsert|delete)" src/app/api/integrations/shopify/oauth/callback/route.ts && echo "OK: Regla 3 satisfecha (no direct mutations on integrations)"</automated>
    <automated>! grep -E "console\.(log|warn|error).*accessToken|access_token.*console" src/app/api/integrations/shopify/oauth/callback/route.ts && echo "OK: access_token jamas en logs"</automated>
    <automated>grep -c "source: 'oauth-callback'" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>grep "grantedScope: tokenResult.scope" src/app/api/integrations/shopify/oauth/callback/route.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "oauth/callback/route.ts" | head -10</automated>
    <automated>git log --oneline -1 | grep -E "feat\(shopify-oauth 05\)"</automated>
  </verify>
  <done>
    - Steps 5-10 implementados
    - 4 reasons posibles de fail cubiertos: `shopify_error`, `denied`, `hmac_mismatch`, `state_expired`
    - Cero `adminSupabase.from('integrations').(insert|update|upsert|delete)` (Regla 3, grep gate)
    - Cero `access_token` en logs (grep gate)
    - `source: 'oauth-callback'` taxonomy
    - `grantedScope` persistido (Open Question 8)
    - Webhook failures NO bloquean (verbo `continue`)
    - TypeScript sin errores
    - Commit atómico
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Shopify HTTPS → callback route | Request es cross-origin sin cookies; auth via state JWT (firmado por nosotros) + HMAC (firmado por Shopify con CLIENT_SECRET) |
| Callback → Shopify Admin API | Outbound usa access_token recién obtenido (TLS) |
| Callback → DB | Solo vía domain layer (`upsertShopifyIntegration`); Owner re-check usa admin client SOLO contra `workspace_members` (SELECT) |
| Callback → Browser (redirect) | Solo redirect URL + query params (`?success=...` o `?error=...&reason=...`); ningún secret en URL |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-19 | T (Tampering) | Atacante reenvía callback con HMAC inválido | mitigate | `verifyOauthCallbackHmac` HEX + timingSafeEqual; fail `hmac_mismatch` |
| T-shopify-oauth-20 | S (Spoofing) | Atacante construye URL con shop arbitrario | mitigate | `SHOP_REGEX` en Zod schema (regex de Zod) — request falla parse antes de cualquier IO |
| T-shopify-oauth-21 | T (Tampering) | State JWT manipulado / expirado | mitigate | `verifyStateJwt` valida sig + exp; fail `state_expired` |
| T-shopify-oauth-22 | E (Elevation) | Owner demoted entre `start` y `callback` | mitigate | Step 4: re-check `workspace_members.role === 'owner'`; fail `denied` |
| T-shopify-oauth-23 | I (Information disclosure) | `access_token` en logs | mitigate | Grep gate verifica que ningún `console.*` contiene `access_token`; mensajes de error truncan a 200 chars |
| T-shopify-oauth-24 | T (Tampering) | Scope drift (Pitfall 2) | mitigate | `detectScopeDrift` → si missing, fail `denied` ANTES de persistir |
| T-shopify-oauth-25 | D (DoS) | Webhook creation hangs callback >60s | accept | Vercel function timeout corta la request; A1 (Plan 01) confirma plan Pro = 60s; futuro: Inngest deferral si plan Hobby |
| T-shopify-oauth-26 | T (Tampering) | Caller bypassea domain (Regla 3) | mitigate | Grep gate explícito: `! grep "from\('integrations'\)\.(insert\|update\|upsert\|delete)" route.ts` |
| T-shopify-oauth-27 | I (Information disclosure) | Error detail al cliente revela info útil | mitigate | `fail(reason, detail)`: `detail` solo va a `console.warn`, NUNCA al `NextResponse.redirect` URL; cliente solo ve `reason` enumerado (4 valores fijos) |
| T-shopify-oauth-28 | S (Spoofing) | Edge runtime crashea crypto silently | mitigate | `export const runtime = 'nodejs'` explícito (Pitfall 5); grep gate |
</threat_model>

<verification>
Verificaciones globales al final del plan:

```bash
# 1. Regla 3 — solo domain mutaciones a integrations (grep en TODA la BASE de código):
grep -rn "from('integrations')\.\(insert\|update\|upsert\|delete\)" src/ \
  --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts'
# esperado AHORA: matches en src/app/actions/shopify.ts (legacy save + delete) — Plan 06 los limpia
# esperado POST-Plan-06: 0 matches

# 2. Callback handler NO importa adminSupabase para integrations:
grep -B2 -A5 "adminSupabase\|createAdminClient" src/app/api/integrations/shopify/oauth/callback/route.ts
# esperado: solo uso para workspace_members (SELECT — Owner re-check), NO para integrations

# 3. Runtime declaration grep gate:
grep "^export const runtime = 'nodejs'" src/app/api/integrations/shopify/oauth/callback/route.ts
# esperado: 1 match

# 4. Force-dynamic gate:
grep "^export const dynamic = 'force-dynamic'" src/app/api/integrations/shopify/oauth/callback/route.ts
# esperado: 1 match

# 5. No `access_token` en logs:
grep -E "console\.(log|warn|error|info).*[\.\[\']access_token" src/app/api/integrations/shopify/oauth/callback/route.ts
# esperado: 0 matches

# 6. 10 steps en el pipeline (busqueda heurística por comentarios "Step N:")
grep -c "Step [0-9]" src/app/api/integrations/shopify/oauth/callback/route.ts
# esperado: >= 9 (steps 1-9 numerados + step 10 'redirect success' opcional)
```
</verification>

<success_criteria>
- [ ] Route handler creado con `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` declarados
- [ ] Pipeline 10 steps en orden: parse → HMAC → state JWT → Owner re-check → token exchange → scope drift → connection test → webhooks → domain upsert → redirect
- [ ] 4 reasons de fail: `shopify_error`, `denied`, `hmac_mismatch`, `state_expired` (D-12)
- [ ] Webhook failures NO bloquean (Promise.allSettled + log + continue)
- [ ] Regla 3 satisfecha: 0 `from('integrations').(insert|update|upsert|delete)` en este archivo
- [ ] `access_token` jamás en logs (grep gate)
- [ ] `granted_scope` persistido (Open Question 8)
- [ ] `source: 'oauth-callback'` taxonomy
- [ ] Owner re-check tras state JWT (defense-in-depth)
- [ ] TypeScript sin errores
- [ ] Commit atómico
- [ ] **NO migration creada** (D-09: schema actual sirve)
- [ ] **NO modifica el handler de webhooks** (Regla 6: agente productivo intocado)
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/05-SUMMARY.md` con:
- Confirmación de cada step (1-10) con línea aproximada
- Output de los grep gates (Regla 3, access_token, runtime, dynamic)
- Hand-off para Plan 06 (UI): callback redirige con `?error=oauth_failed&reason=<X>` o `?success=oauth_connected` — UI debe consumir vía `useSearchParams` + `useEffect` toast
- Hand-off para Plan 07 (smoke): tienda dev `6xvhnx-1v.myshopify.com`, flow completo, debe terminar con (a) row en `integrations` para Somnio workspace con `config.access_token` no-shpat_ y `config.granted_scope='read_orders,read_customers,read_draft_orders'`, (b) 3 webhooks visibles en Shopify Admin del dev store, (c) toast verde "Tienda Shopify conectada exitosamente".
</output>
