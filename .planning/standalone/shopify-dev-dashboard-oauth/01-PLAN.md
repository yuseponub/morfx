---
phase: shopify-dev-dashboard-oauth
plan: 01
title: Preflight — Dev Dashboard app + env vars + assumptions
wave: 0
depends_on: []
files_modified: []
autonomous: false
estimated_minutes: 25
requirements_addressed: []
must_haves:
  truths:
    - "Shopify Dev Dashboard tiene una app llamada 'MorfX' con los 3 scopes (read_orders, read_customers, read_draft_orders) y las 2 redirect URLs (prod + localhost) registradas verbatim sin trailing slash"
    - "Vercel project tiene SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_OAUTH_STATE_SECRET configurados en Production + Preview + Development scopes"
    - ".env.local del repo local tiene las 3 vars (para dev en puerto 3020)"
    - "SHOPIFY_OAUTH_STATE_SECRET tiene >=32 chars (verificable: `echo -n $SHOPIFY_OAUTH_STATE_SECRET | wc -c`)"
    - "Vercel function timeout del project soporta >=10s (confirmado por usuario contra su plan)"
  artifacts:
    - path: ".env.local"
      provides: "Dev env vars (no commit)"
      contains: "SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_OAUTH_STATE_SECRET"
  key_links:
    - from: "Dev Dashboard app config"
      to: "Vercel env vars"
      via: "Manual copy-paste of Client ID + Client Secret"
      pattern: "values match byte-for-byte"
---

<objective>
Preflight: el usuario crea la app "MorfX" en Shopify Dev Dashboard, registra las dos redirect URLs exactas, y carga las 3 env vars en Vercel + `.env.local`. **BLOQUEANTE de Wave 1+.** Sin estas credenciales, ninguna línea de código tiene sentido.

Purpose: aislar las acciones humanas no-automatizables (crear app en Shopify, copiar secrets a Vercel) antes de que Claude empiece a escribir código. Esto materializa D-01 y A1/A2/A3 de RESEARCH.md.

Output: Dev Dashboard configurado + Vercel + `.env.local` listos. Cero código.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Crear app "MorfX" en Shopify Dev Dashboard</name>
  <what-built>Nada — este paso es 100% humano (Claude no tiene acceso a la cuenta Shopify del usuario)</what-built>
  <read_first>
    - CONTEXT.md §Decisions D-01 (UNA app compartida "MorfX")
    - CONTEXT.md §Specifics §App de Shopify a crear (scopes, redirect URLs verbatim)
    - RESEARCH.md §Pitfall 10 (`redirect_uri` MUST match EXACTLY — no trailing slash)
    - https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard
  </read_first>
  <how-to-verify>
    Usuario ejecuta los siguientes pasos en Shopify Dev Dashboard (`https://partners.shopify.com` → Dev Dashboard de su cuenta):

    1. Crear nueva app:
       - Nombre: `MorfX`
       - Distribution: **Custom distribution** (NO Public app — no queremos App Store)
       - URL de la app: `https://morfx-sandy.vercel.app`
       - **CRITICAL (D-13 2026-05-12):** Custom distribution **bloqueará el install en cualquier tienda que no esté autorizada explícitamente** por vos. Inmediatamente después de crear la app, ir a Partner Dashboard → App distribution → MorfX → "Add stores" y autorizar:
         - `6xvhnx-1v.myshopify.com` (tienda dev — Plan 07 smoke test)
         - El dominio `<storename>.myshopify.com` de la tienda $65 USD productiva de Somnio (Plan 08 cutover)
       - **Si una de estas dos no está autorizada al momento del OAuth, Shopify devolverá `application cannot be found` en vez del install prompt.** Es el causante #1 de bugs reportados en foros.

    2. Configuration → API access scopes → marcar exactamente estos 3 (NI UNO MÁS) — **D-14 2026-05-12 (corregidos):**
       - `read_orders`
       - `read_customers`
       - `read_draft_orders`

       **Por qué cambió desde D-05 original:** `write_webhooks` NO existe como scope en Shopify (era error del RESEARCH original). Y `draft_orders/create` webhook (que el código ya procesa) requiere `read_draft_orders` para crearse vía Admin API. Ver D-14 en CONTEXT.md.

    3. Configuration → URLs → **Allowed redirection URLs** — agregar EXACTAMENTE estas 2 (cada una en su línea, **sin trailing slash**):
       - `https://morfx-sandy.vercel.app/api/integrations/shopify/oauth/callback`
       - `http://localhost:3020/api/integrations/shopify/oauth/callback`

    4. Configuration → Save (asegurar que cambios persisten).

    5. Settings → copiar los 2 secrets:
       - `Client ID` (string público, ~32 chars hex)
       - `Client secret` (string privado, ~64 chars hex)

    **Verificación visual:** capturas (mentales o de pantalla) muestran:
    - App name = "MorfX"
    - 3 scopes marcados (no más, no menos)
    - 2 redirect URLs sin trailing slash
    - Client ID + Secret copiados a un buffer temporal (NO commitear a git)
  </how-to-verify>
  <resume-signal>Escribe "app creada" + comparte Client ID (Secret NO en el chat, va directo a env vars en la próxima tarea)</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2 (REVISIÓN D-15 2026-05-12): Aplicar migración platform_config + insertar 3 credenciales OAuth via SQL</name>
  <what-built>Tabla `platform_config` (Phase 44.1) recibe 3 keys nuevas: `shopify_oauth_client_id`, `shopify_oauth_client_secret`, `shopify_oauth_state_secret`. Cero env vars. Cero código fuera del archivo de migración.</what-built>
  <read_first>
    - CONTEXT.md §D-15 (decisión 2026-05-12 de DB-stored credentials)
    - `supabase/migrations/20260420000443_platform_config.sql` (schema base + helper pattern)
    - `src/lib/domain/platform-config.ts` (helper getPlatformConfig + cache 30s)
    - CLAUDE.md Regla 5 (migración aplicada en prod ANTES del code push)
  </read_first>
  <how-to-verify>
    1. **Generar el state secret** (en cualquier terminal local, output a buffer temporal):
       ```bash
       openssl rand -base64 32
       # output ej: "vBN7m...JxQ4=" (44 chars en base64)
       ```

    2. **Verificar archivo de migración existe** (creado por Claude en Plan 01):
       ```bash
       ls supabase/migrations/20260512000000_shopify_oauth_credentials.sql
       cat supabase/migrations/20260512000000_shopify_oauth_credentials.sql
       ```
       El archivo INSERT con placeholders `<REPLACE_*>` para evitar credenciales en git.

    3. **Aplicar migración en Supabase Studio** (PROD) — `https://supabase.com/dashboard/project/expslvzsszymljafhppi/sql/new`:
       - Pegar el contenido del archivo de migración
       - Run → debe insertar 3 rows (o no-op si ya existían vía ON CONFLICT DO NOTHING)
       - Verificar:
         ```sql
         SELECT key, value FROM platform_config WHERE key LIKE 'shopify_oauth_%';
         -- esperado: 3 rows con value="<REPLACE_*>" placeholder
         ```

    4. **Reemplazar placeholders con valores reales** — 3 UPDATE en Supabase Studio:
       ```sql
       UPDATE platform_config
         SET value = '"<CLIENT_ID_REAL_DE_DEV_DASHBOARD>"'::jsonb,
             updated_at = timezone('America/Bogota', NOW())
         WHERE key = 'shopify_oauth_client_id';

       UPDATE platform_config
         SET value = '"<CLIENT_SECRET_REAL_DE_DEV_DASHBOARD>"'::jsonb,
             updated_at = timezone('America/Bogota', NOW())
         WHERE key = 'shopify_oauth_client_secret';

       UPDATE platform_config
         SET value = '"<OUTPUT_DE_OPENSSL_RAND_BASE64_32>"'::jsonb,
             updated_at = timezone('America/Bogota', NOW())
         WHERE key = 'shopify_oauth_state_secret';
       ```

       **NOTA**: el formato JSONB string requiere doble-comillas adentro: `'"valor"'::jsonb`. Sin comillas internas, falla.

    5. **Verificar lectura final**:
       ```sql
       SELECT
         key,
         length(value::text) AS value_length,
         CASE
           WHEN value::text LIKE '%REPLACE%' THEN 'PLACEHOLDER — falta UPDATE'
           ELSE 'OK'
         END AS status
       FROM platform_config
       WHERE key LIKE 'shopify_oauth_%';
       -- esperado: 3 rows todas status='OK', state_secret value_length >= 34 (32 + 2 quotes)
       ```

    6. **Confirmar `NEXT_PUBLIC_APP_URL` ya está en Vercel production** (cero env vars nuevas, pero esta sigue siendo necesaria para construir redirect URLs):
       ```bash
       vercel env ls | grep NEXT_PUBLIC_APP_URL
       # esperado: presente en production = https://morfx-sandy.vercel.app
       ```
  </how-to-verify>
  <resume-signal>Escribe "credenciales en BD" (NO pegar valores en el chat — la última verificación de SQL ya confirma lectura)</resume-signal>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 3: Confirmar Vercel function timeout (Assumption A1) + escoger naming approach para collision (Assumption A6)</name>
  <decision>
    **A1:** ¿El plan de Vercel del proyecto soporta callback OAuth de ~3-5s? (Hobby=10s, Pro=60s, Free=10s).
    **A6 (naming collision):** `src/app/actions/shopify.ts:359` ya exporta `deleteShopifyIntegration`. El domain layer nuevo tendrá el mismo nombre. Escoger ENTRE:
      - **Opción A:** Importar el domain con rename: `import { deleteShopifyIntegration as domainDeleteShopifyIntegration } from '@/lib/domain/integrations'`. Server action mantiene su nombre.
      - **Opción B:** Renombrar el server action a `deleteShopifyIntegrationAction`. Domain mantiene su nombre limpio.
  </decision>
  <context>
    **A1 importa porque:** si el plan es Hobby/Free (timeout 10s), el callback completo (HMAC + JWT + token exchange + connection test + 3 webhooks + domain upsert) puede acercarse al límite en cold start (RESEARCH Pitfall 8: 3-5s cold). Si el budget es ajustado, hay que considerar diferir webhook creation a Inngest (cambio de arquitectura — re-research). Si Pro (60s), no hay riesgo.

    **A6 importa porque:** el server action `deleteShopifyIntegration` ya tiene 2 callers en UI (`shopify-form.tsx` línea ~150 + posible otro). Cambiar su nombre arrastra cambios en clientes. Renombrar el import del domain es menos invasivo. PATTERNS.md §"`src/app/actions/shopify.ts` (MODIFY)" recomienda Opción A.
  </context>
  <options>
    <option id="a1-pro">
      <name>A1: Plan Vercel = Pro (60s timeout)</name>
      <pros>Cero riesgo de timeout, mantenemos arquitectura sincrónica recomendada por RESEARCH</pros>
      <cons>Ninguna — es el caso esperado</cons>
    </option>
    <option id="a1-hobby">
      <name>A1: Plan Vercel = Hobby/Free (10s timeout)</name>
      <pros>Sin costo adicional</pros>
      <cons>Riesgo de timeout en cold start; puede requerir Inngest deferral de webhook creation (refactor)</cons>
    </option>
    <option id="a6-opt-a">
      <name>A6 Opción A: Import del domain con alias (recomendado)</name>
      <pros>Mínima superficie de cambio; server action keeps current name; clientes UI no se tocan</pros>
      <cons>Lectura del código requiere recordar el alias</cons>
    </option>
    <option id="a6-opt-b">
      <name>A6 Opción B: Renombrar server action a `deleteShopifyIntegrationAction`</name>
      <pros>Domain layer name limpio sin alias</pros>
      <cons>Cambia 2+ callers en UI; más superficie de refactor</cons>
    </option>
  </options>
  <resume-signal>Responde con dos picks: ej. "a1-pro + a6-opt-a"</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Usuario humano → Shopify Dev Dashboard | Configuración manual; sin trust crítico hasta que estén las redirect URLs registradas |
| Usuario humano → Vercel env vars | Punto único donde el `SHOPIFY_CLIENT_SECRET` entra al sistema de MorfX |
| Vercel env vars → process.env (runtime) | Implicit trust: el código asume que las vars están bien |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-01 | I (Information disclosure) | `SHOPIFY_CLIENT_SECRET` leak via git | mitigate | `.env.local` ya en `.gitignore`; secrets NUNCA aparecen en el chat con Claude (usuario los agrega directo a Vercel/`.env.local`) |
| T-shopify-oauth-02 | T (Tampering) | `SHOPIFY_OAUTH_STATE_SECRET` weak entropy | mitigate | `openssl rand -base64 32` produce 256-bit entropy; helper `getStateSecret()` (Wave 1) throws si <32 chars |
| T-shopify-oauth-03 | S (Spoofing) | Redirect URL injection via wrong Dev Dashboard config | mitigate | Pitfall 10: registrar URLs EXACTAS sin trailing slash; documentado en Task 1 |
| T-shopify-oauth-04 | D (DoS) | Vercel function timeout < callback duration | mitigate | Task 3 confirma plan Vercel; si Hobby, hay que diferir webhook creation a Inngest (re-research) |
</threat_model>

<verification>
Ejecutar al final (manual, por el usuario):

1. Dev Dashboard muestra:
   - App "MorfX" creada con scopes `read_orders, read_customers, read_draft_orders`
   - Redirect URLs: 2 entries (morfx-sandy.vercel.app + localhost:3020), sin trailing slash, EXACTOS como CONTEXT.md
   - 2 tiendas autorizadas (Custom distribution): tienda dev `6xvhnx-1v.myshopify.com` + tienda Somnio del $65 USD
2. Supabase prod (`platform_config` table):
   ```sql
   SELECT key, value FROM platform_config WHERE key LIKE 'shopify_oauth_%';
   -- 3 rows, ningún value contiene 'REPLACE', state_secret tiene >=32 chars descomillados
   ```
3. **NO existen env vars Shopify** en Vercel ni `.env.local`:
   - `vercel env ls | grep -i SHOPIFY` retorna 0 lines
   - `grep -c '^SHOPIFY_' .env.local` retorna 0
4. `NEXT_PUBLIC_APP_URL` sigue presente en Vercel production = `https://morfx-sandy.vercel.app`.
5. Decisiones A1 + A6 registradas en el plan como ADRs (anota en el resume signal).
</verification>

<success_criteria>
- [ ] App reusada/creada en Dev Dashboard con scopes y redirect URLs exactos
- [ ] 2 tiendas autorizadas en Custom distribution (dev + Somnio prod)
- [ ] Migración `20260512000000_shopify_oauth_credentials.sql` aplicada en prod (3 rows en `platform_config`)
- [ ] 3 placeholders reemplazados con valores reales via UPDATE en Supabase Studio
- [ ] `state_secret` tiene >=32 chars (verificado con SQL)
- [ ] `NEXT_PUBLIC_APP_URL` confirmado presente en Vercel production (env var pre-existente, no nueva)
- [ ] A1 decidido (plan Vercel = Pro 60s) + A6 decidido (Opción A: import alias)
- [ ] Resume signal del usuario recibido para los 3 checkpoints
- [ ] Cero env vars `SHOPIFY_*` en Vercel ni `.env.local` (D-15)

**Wave 1+ NO PUEDE iniciar hasta que este plan esté 100% completo.** Plan 02 incluirá `getShopifyOAuthConfig()` (helper fail-CLOSED que lee de `platform_config`) — sin las 3 keys persistidas vía Task 2, los executors de Plan 03/04/05 fallarán al construir authorize URL / verificar HMAC / firmar JWT.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md` con:
- Confirmación de las 3 env vars cargadas (sin pegar los valores)
- Decisión A1 + A6 registrada
- Cualquier deviation del plan original
</output>
