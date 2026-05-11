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
    - "Shopify Dev Dashboard tiene una app llamada 'MorfX' con los 3 scopes (read_orders, read_customers, write_webhooks) y las 2 redirect URLs (prod + localhost) registradas verbatim sin trailing slash"
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
       - URL de la app: `https://morfx.app`
       - **CRITICAL (D-13 2026-05-12):** Custom distribution **bloqueará el install en cualquier tienda que no esté autorizada explícitamente** por vos. Inmediatamente después de crear la app, ir a Partner Dashboard → App distribution → MorfX → "Add stores" y autorizar:
         - `6xvhnx-1v.myshopify.com` (tienda dev — Plan 07 smoke test)
         - El dominio `<storename>.myshopify.com` de la tienda $65 USD productiva de Somnio (Plan 08 cutover)
       - **Si una de estas dos no está autorizada al momento del OAuth, Shopify devolverá `application cannot be found` en vez del install prompt.** Es el causante #1 de bugs reportados en foros.

    2. Configuration → API access scopes → marcar exactamente estos 3 (NI UNO MÁS):
       - `read_orders`
       - `read_customers`
       - `write_webhooks`

    3. Configuration → URLs → **Allowed redirection URLs** — agregar EXACTAMENTE estas 2 (cada una en su línea, **sin trailing slash**):
       - `https://morfx.app/api/integrations/shopify/oauth/callback`
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
  <name>Task 2: Generar SHOPIFY_OAUTH_STATE_SECRET (>=32 chars) y agregar 3 env vars a Vercel + .env.local</name>
  <what-built>Variables de entorno cargadas en 4 lugares: Vercel Production, Vercel Preview, Vercel Development, y `.env.local` (local dev en puerto 3020). Cero código.</what-built>
  <read_first>
    - CONTEXT.md §Code Context §Integration Points §Env vars NUEVAS
    - RESEARCH.md §Standard Stack §Installation block (líneas 121-128 — comando `openssl rand -base64 32`)
    - RESEARCH.md §Code Examples §Example 1 líneas 444-450 (`getStateSecret()` throws si <32 chars — A2)
    - CLAUDE.md Regla 5 (env vars no son migraciones de DB pero sí son prerequisito antes del push)
  </read_first>
  <how-to-verify>
    1. Generar el secret state (en cualquier terminal local):
       ```bash
       openssl rand -base64 32
       # output: ej. "vBN7m...JxQ4=" (44 chars en base64)
       ```
       Guardar el output. **Debe tener >=32 chars** (base64 de 32 bytes son 44 chars siempre, así que OK).

    2. Vercel CLI o Dashboard — agregar las 3 env vars en **los 3 environments** (Production, Preview, Development):
       ```
       SHOPIFY_CLIENT_ID          = <Client ID de Dev Dashboard>
       SHOPIFY_CLIENT_SECRET      = <Client Secret de Dev Dashboard>
       SHOPIFY_OAUTH_STATE_SECRET = <output de openssl rand>
       ```

       Via Vercel CLI (recomendado):
       ```bash
       vercel env add SHOPIFY_CLIENT_ID production
       vercel env add SHOPIFY_CLIENT_ID preview
       vercel env add SHOPIFY_CLIENT_ID development
       # repetir para SHOPIFY_CLIENT_SECRET y SHOPIFY_OAUTH_STATE_SECRET
       ```

       Via Dashboard: Project Settings → Environment Variables → Add → marcar los 3 scopes.

    3. `.env.local` (NO commitear, ya está en `.gitignore`) — agregar las mismas 3 vars para dev en `localhost:3020`:
       ```
       SHOPIFY_CLIENT_ID=...
       SHOPIFY_CLIENT_SECRET=...
       SHOPIFY_OAUTH_STATE_SECRET=...
       ```

    4. Verificar longitud del state secret (en .env.local):
       ```bash
       grep '^SHOPIFY_OAUTH_STATE_SECRET=' .env.local | cut -d= -f2- | tr -d '\n' | wc -c
       # debe imprimir >= 32
       ```

    5. **Confirmar `NEXT_PUBLIC_APP_URL` ya está configurado** (existe en proyecto desde antes):
       ```bash
       vercel env ls | grep NEXT_PUBLIC_APP_URL
       # esperado: presente en production = https://morfx.app
       ```
       Si no está, el callback no podrá construir URLs absolutas — agregarlo.
  </how-to-verify>
  <resume-signal>Escribe "env vars listas" (no compartir secrets en el chat)</resume-signal>
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
   - App "MorfX" creada con scopes `read_orders, read_customers, write_webhooks`
   - Redirect URLs: 2 entries, sin trailing slash, EXACTOS como CONTEXT.md
2. Vercel:
   - `vercel env ls` lista las 3 nuevas vars en Production + Preview + Development
3. Local:
   - `grep -c '^SHOPIFY_' .env.local` retorna `3`
   - `grep '^SHOPIFY_OAUTH_STATE_SECRET=' .env.local | cut -d= -f2- | tr -d '\n' | wc -c` retorna `>= 32`
4. Decisiones A1 + A6 registradas en el plan como ADRs (anota en el resume signal).
</verification>

<success_criteria>
- [ ] App "MorfX" creada en Dev Dashboard con scopes y redirect URLs exactos
- [ ] 3 env vars cargadas en Vercel × 3 environments (9 entries totales)
- [ ] 3 env vars en `.env.local` (dev)
- [ ] `SHOPIFY_OAUTH_STATE_SECRET` tiene >=32 chars
- [ ] `NEXT_PUBLIC_APP_URL` confirmado presente en Vercel production
- [ ] A1 decidido (plan Vercel) + A6 decidido (naming approach)
- [ ] Resume signal del usuario recibido para los 3 checkpoints

**Wave 1+ NO PUEDE iniciar hasta que este plan esté 100% completo.** El executor de Plan 02/03 dependerá de leer las env vars en runtime (Plan 03 las usa en `getStateSecret()`, `buildAuthorizeUrl`, etc.).
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md` con:
- Confirmación de las 3 env vars cargadas (sin pegar los valores)
- Decisión A1 + A6 registrada
- Cualquier deviation del plan original
</output>
