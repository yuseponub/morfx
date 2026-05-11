---
phase: shopify-dev-dashboard-oauth
plan: 04
title: Server action startShopifyOauth + naming-collision resolution
wave: 2
depends_on: [3]
files_modified:
  - src/app/actions/shopify-oauth.ts
autonomous: true
estimated_minutes: 25
requirements_addressed: []
must_haves:
  truths:
    - "Existe `src/app/actions/shopify-oauth.ts` con `'use server'` directive + `startShopifyOauth(input: { shopDomain: string }): Promise<{ success: true; redirectUrl: string } | { success: false; error: string }>`"
    - "Auth gate idéntico al de `saveShopifyIntegration` (auth.getUser + cookie morfx_workspace + Owner check) — copy-paste de líneas 184-210"
    - "Domain regex STRICT `/^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$/` aplicado POST-`normalizeShopDomain` (defense in depth, Pitfall 3)"
    - "Envelope shape `{ success, error }` (NO `{ ok }`) — match convención del proyecto"
    - "Redirect URI construido como `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback` (sin trailing slash, Pitfall 10)"
  artifacts:
    - path: "src/app/actions/shopify-oauth.ts"
      provides: "Entry point del flow OAuth — UI llama a esto"
      min_lines: 50
      exports: ["startShopifyOauth"]
  key_links:
    - from: "src/app/actions/shopify-oauth.ts"
      to: "src/lib/shopify/oauth.ts (Plan 03)"
      via: "import { signStateJwt, buildAuthorizeUrl, generateNonce } from '@/lib/shopify/oauth'"
      pattern: "from '@/lib/shopify/oauth'"
    - from: "src/app/actions/shopify-oauth.ts"
      to: "src/lib/shopify/connection-test.ts (existente, sin cambios)"
      via: "import { normalizeShopDomain } from '@/lib/shopify/connection-test'"
      pattern: "normalizeShopDomain"
---

<objective>
Crear `src/app/actions/shopify-oauth.ts` — el server action que la UI llama al click "Conectar con Shopify". Valida auth + Owner + dominio, firma el state JWT, construye la authorize URL, y la retorna al cliente para que haga `window.location.href = redirectUrl`.

Purpose: este es el "side trustworthy" del OAuth — donde verificamos identidad y workspace antes de mandar al usuario a Shopify. **Single source of truth para el dominio inicial** — todo lo demás del callback se valida contra el state JWT firmado aquí.

Output: server action consumible por `shopify-form.tsx` (Plan 06).

**Wave 2 depende de Wave 1 (Plan 03 `oauth.ts`).** Plan 02 no es prerequisite para este plan (no usa domain).
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
@.planning/standalone/shopify-dev-dashboard-oauth/03-SUMMARY.md
@CLAUDE.md
@src/app/actions/shopify.ts
@src/lib/shopify/connection-test.ts
@src/lib/supabase/server.ts

<interfaces>
<!-- From src/app/actions/shopify.ts:184-210 (auth gate) — copy literally with $WORKSPACE error type unchanged. -->

```typescript
// Reuse from existing module:
import { normalizeShopDomain } from '@/lib/shopify/connection-test'
// normalizeShopDomain(input: string): string | null
//   - accepts 'mitienda', 'mitienda.myshopify.com', 'https://mitienda.myshopify.com', 'https://mitienda.myshopify.com/admin/...'
//   - returns 'mitienda.myshopify.com' or null if invalid

// From Plan 03:
import { signStateJwt, buildAuthorizeUrl, generateNonce } from '@/lib/shopify/oauth'

// Target signature (D-03 + project convention):
export async function startShopifyOauth(input: { shopDomain: string }): Promise<
  | { success: true; redirectUrl: string }
  | { success: false; error: string }
>
```

From `src/app/actions/shopify.ts:184-210` (verbatim auth pattern):
```typescript
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
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `src/app/actions/shopify-oauth.ts` con startShopifyOauth</name>
  <files>src/app/actions/shopify-oauth.ts</files>
  <read_first>
    - PATTERNS.md §"`src/app/actions/shopify-oauth.ts`" — entera (auth + Owner + envelope shape)
    - `src/app/actions/shopify.ts:184-210` (auth gate canónico — copy literal)
    - `src/app/actions/shopify.ts:1-20` (imports `createClient`, `cookies`)
    - `src/lib/shopify/connection-test.ts:136-168` (`normalizeShopDomain` — verificar firma)
    - RESEARCH.md §Code Examples §Example 6 (líneas 682-732) — implementación CON el ajuste `{ ok } → { success, error }` documentado en PATTERNS.md
    - RESEARCH.md §Pitfall 3 (shop injection — STRICT regex)
    - RESEARCH.md §Pitfall 10 (redirect_uri no trailing slash)
    - CONTEXT.md D-01 (env var `SHOPIFY_CLIENT_ID`), D-08 (state JWT con payload)
  </read_first>
  <action>
    Crear `src/app/actions/shopify-oauth.ts` con el siguiente contenido (adaptado de RESEARCH Example 6 con el envelope rename per PATTERNS.md):

    ```typescript
    'use server'

    // ============================================================================
    // Server Action: Start Shopify OAuth (Standalone shopify-dev-dashboard-oauth)
    //
    // Called by src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
    // (Plan 06) when user clicks "Conectar con Shopify".
    //
    // Auth gate: copy of saveShopifyIntegration pattern (shopify.ts:184-210):
    //   1. supabase.auth.getUser()
    //   2. cookie morfx_workspace
    //   3. workspace_members.role === 'owner'
    //
    // Returns redirectUrl; client does window.location.href = redirectUrl (cross-origin).
    // ============================================================================

    import { createClient } from '@/lib/supabase/server'
    import { cookies } from 'next/headers'
    import { normalizeShopDomain } from '@/lib/shopify/connection-test'
    import { signStateJwt, buildAuthorizeUrl, generateNonce } from '@/lib/shopify/oauth'

    /** Strict shop regex (Pitfall 3). normalizeShopDomain ya valida formato; este es defense-in-depth contra injection patterns. */
    const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

    export async function startShopifyOauth(input: { shopDomain: string }): Promise<
      | { success: true; redirectUrl: string }
      | { success: false; error: string }
    > {
      // === Auth gate (copy of shopify.ts:184-210) ===
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
        return { success: false, error: 'Solo el Owner puede conectar integraciones' }
      }

      // === Validate shop domain ===
      const shop = normalizeShopDomain(input.shopDomain)
      if (!shop) {
        return { success: false, error: 'Dominio de tienda invalido' }
      }

      // STRICT regex (Pitfall 3 — anti-injection beyond normalizeShopDomain).
      // Note: this regex accepts shops starting with a digit (e.g., '6xvhnx-1v.myshopify.com'),
      // verified against the user's actual dev store per Assumption A5.
      if (!SHOP_DOMAIN_REGEX.test(shop)) {
        return { success: false, error: 'Dominio de tienda invalido' }
      }

      // === Build authorize URL ===
      // D-08: state JWT con payload { workspaceId, userId, nonce, exp: now+10min }
      let state: string
      try {
        state = await signStateJwt({
          workspaceId,
          userId: user.id,
          nonce: generateNonce(),
        })
      } catch (err) {
        // SHOPIFY_OAUTH_STATE_SECRET missing/short (Assumption A2)
        console.error('[startShopifyOauth] state JWT sign failed:', err)
        return { success: false, error: 'Configuracion OAuth incompleta. Contacta al administrador.' }
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      if (!baseUrl) {
        console.error('[startShopifyOauth] NEXT_PUBLIC_APP_URL not set')
        return { success: false, error: 'Configuracion OAuth incompleta. Contacta al administrador.' }
      }

      // Pitfall 10: NO trailing slash — must match Dev Dashboard config EXACTLY.
      const redirectUri = `${baseUrl}/api/integrations/shopify/oauth/callback`

      let redirectUrl: string
      try {
        redirectUrl = buildAuthorizeUrl({ shop, state, redirectUri })
      } catch (err) {
        // SHOPIFY_CLIENT_ID missing
        console.error('[startShopifyOauth] buildAuthorizeUrl failed:', err)
        return { success: false, error: 'Configuracion OAuth incompleta. Contacta al administrador.' }
      }

      return { success: true, redirectUrl }
    }
    ```

    **Decisiones D referenciadas:**
    - D-01 (env vars desde Vercel: `SHOPIFY_CLIENT_ID` consumido por `buildAuthorizeUrl`, `SHOPIFY_OAUTH_STATE_SECRET` consumido por `signStateJwt`)
    - D-08 (state JWT payload)
    - D-12 (errores en español al cliente — aunque este server action retorna `{success: false, error}` que se muestra como toast en UI)

    **Validaciones del flujo:**
    - `normalizeShopDomain` retorna ya un string en form `xxx.myshopify.com` o null. El regex strict adicional cubre A5 (verificado contra `6xvhnx-1v.myshopify.com`).
    - 3 puntos de falla con env vars: state secret, NEXT_PUBLIC_APP_URL, CLIENT_ID. Cada uno tiene try/catch + log + error genérico al usuario (no leak de qué env var falta).

    **Commit atómico (Regla 1):**
    ```bash
    git add src/app/actions/shopify-oauth.ts
    git commit -m "$(cat <<'EOF'
    feat(shopify-oauth 04): server action startShopifyOauth (D-08, Pitfall 3, Pitfall 10)

    - 'use server' action en src/app/actions/shopify-oauth.ts
    - Auth gate copy de saveShopifyIntegration (auth.getUser + cookie morfx_workspace + Owner check)
    - normalizeShopDomain + STRICT regex /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/ (Pitfall 3)
    - State JWT con payload {workspaceId, userId, nonce, exp 10min} (D-08)
    - redirect_uri sin trailing slash (Pitfall 10)
    - Envelope {success, error} match proyecto (NO {ok})

    Plan 04/Wave 2. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```
  </action>
  <verify>
    <automated>test -f src/app/actions/shopify-oauth.ts && echo "EXISTS"</automated>
    <automated>head -1 src/app/actions/shopify-oauth.ts | grep -F "'use server'"</automated>
    <automated>grep -E "^export async function startShopifyOauth" src/app/actions/shopify-oauth.ts</automated>
    <automated>grep -E "SHOP_DOMAIN_REGEX.*\/\^.*myshopify.*com\\\$\/" src/app/actions/shopify-oauth.ts || grep -E "\/\^\[a-z0-9\]\[a-z0-9-\]\*\\\\\\.myshopify\\\\\\.com\\\$\/" src/app/actions/shopify-oauth.ts</automated>
    <automated>grep -c "success: false, error:" src/app/actions/shopify-oauth.ts</automated>
    <automated>! grep -E "\{ ok:" src/app/actions/shopify-oauth.ts && echo "OK: no {ok} envelope (matches project convention)"</automated>
    <automated>grep -c "role !== 'owner'" src/app/actions/shopify-oauth.ts</automated>
    <automated>grep "NEXT_PUBLIC_APP_URL" src/app/actions/shopify-oauth.ts</automated>
    <automated>! grep "callback/" src/app/actions/shopify-oauth.ts && echo "OK: no trailing slash on callback path"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "shopify-oauth.ts" | head -10</automated>
    <automated>git log --oneline -1 | grep -E "feat\(shopify-oauth 04\)"</automated>
  </verify>
  <done>
    - File creado con `'use server'` en primera línea
    - `startShopifyOauth` exportada con signature en `<interfaces>`
    - Auth gate completo (3 etapas: auth.getUser, cookie, Owner)
    - Domain validation: `normalizeShopDomain` + STRICT regex aplicados ambos
    - `signStateJwt` + `buildAuthorizeUrl` invocados con try/catch
    - Envelope `{success, error}` (NO `{ok}`)
    - `redirect_uri` sin trailing slash (gate explícito)
    - TypeScript compila sin errores
    - Commit creado
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI client → server action | Server action confía en cookie `morfx_workspace` + `auth.getUser()` (re-verificados); el `shopDomain` viene del cliente — debe validarse |
| Server action → state JWT | Server action es la **única fuente** del state JWT firmado; el callback (Plan 05) lo verificará |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-15 | E (Elevation) | Non-Owner inicia OAuth para workspace ajeno | mitigate | Triple gate: `auth.getUser()` → cookie `morfx_workspace` → `workspace_members.role === 'owner'`. Idéntico al pattern existente |
| T-shopify-oauth-16 | S (Spoofing) | Shop injection (e.g., `evil.com@store.myshopify.com`) → leak de client_secret al wire | mitigate | `normalizeShopDomain` + STRICT regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` aplicado ANTES de `buildAuthorizeUrl` |
| T-shopify-oauth-17 | I (Information disclosure) | Error messages revelan qué env var falta (info útil para atacante) | mitigate | Catch en sign/build returns error genérico "Configuracion OAuth incompleta. Contacta al administrador." + console.error con detalle (solo server-side logs) |
| T-shopify-oauth-18 | T (Tampering) | Client posts `shopDomain` con SQL/script | accept | shopDomain solo se usa en string interpolation a URL; no toca BD; el regex strict bloquea cualquier char raro |
</threat_model>

<verification>
Smoke test del flow start (manual, opcional en este plan — Plan 07 lo cubre E2E):

1. Owner ya autenticado en `/configuracion/integraciones` (existe esa sesión).
2. Tipear `6xvhnx-1v.myshopify.com` en form (Plan 06 todavía no existe — usar curl o un test scratch).
3. Esperar response `{ success: true, redirectUrl: 'https://6xvhnx-1v.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_orders,read_customers,write_webhooks&redirect_uri=https%3A%2F%2Fmorfx.app%2Fapi%2Fintegrations%2Fshopify%2Foauth%2Fcallback&state=eyJ...' }`.
4. Verificar `state` es un JWT (3 partes separadas por `.`).
5. Decodear el JWT payload con `jose` (o jwt.io) y verificar `{ workspaceId, userId, nonce, exp, sub, iss }`.

**No mandatorio en este plan — Plan 07 cubrirá esto end-to-end.**

```bash
# Gate Regla 3: el server action no toca BD de integrations (solo workspace_members SELECT)
grep -E "from\('integrations'\)" src/app/actions/shopify-oauth.ts
# esperado: 0 matches
```
</verification>

<success_criteria>
- [ ] `src/app/actions/shopify-oauth.ts` creado con `'use server'`
- [ ] `startShopifyOauth(input)` con envelope `{success, error/redirectUrl}` exportada
- [ ] Auth gate triple (auth.getUser + cookie morfx_workspace + Owner)
- [ ] Domain validation: `normalizeShopDomain` + STRICT regex `/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/`
- [ ] State JWT firmado con `signStateJwt` (try/catch + log + error genérico)
- [ ] Authorize URL con `buildAuthorizeUrl` (try/catch + log + error genérico)
- [ ] `redirect_uri` construido como `${NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback` — **sin trailing slash** (gate Pitfall 10)
- [ ] Envelope `{success, error}` (NO `{ok}`) — gate explícito
- [ ] Cero mutaciones a `integrations` table (Regla 3 — este plan no necesita domain layer)
- [ ] TypeScript sin errores
- [ ] Commit atómico
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/04-SUMMARY.md` con:
- Firma final de `startShopifyOauth`
- Verificación grep del envelope shape
- Confirmación: cero refs a `integrations` table (este plan no toca BD)
- Hand-off para Plan 06 (UI): la UI debe llamar `startShopifyOauth({ shopDomain })` y en éxito hacer `window.location.href = result.redirectUrl` (NO `router.push` — es cross-origin)
- Hand-off para Plan 05 (callback): el state JWT que firmamos contiene `{ workspaceId, userId, nonce }` — el callback los necesita para Owner re-check y para llamar `upsertShopifyIntegration({ workspaceId: payload.workspaceId, ... })`
</output>
