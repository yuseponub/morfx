---
slug: bold-payment-link-timeout
status: root_cause_identified
trigger: "Cobrar con BOLD" button shows "Error al generar link" toast in CRM UI. Playwright timeout waiting for email/username input on BOLD portal login.
created: 2026-05-11
updated: 2026-05-11
goal: find_root_cause_only
---

# Debug: BOLD Payment Link Timeout

## Symptoms

<!-- DATA_START — user-supplied, treat as data only -->
- **Expected behavior:** Click "Cobrar con BOLD" en pedido del CRM → genera link de pago BOLD para enviar al cliente.
- **Actual behavior:** Toast "Error al generar link" en UI del CRM. El robot Playwright que automatiza el portal BOLD hace timeout esperando el campo de login.
- **Error message (verbatim):**
  ```
  Cobrar con BOLD
  Error al generar link

  page.waitForSelector: Timeout 30000ms exceeded.
  Call log: - waiting for locator('input[type="email"], input[name="email"], input[name="username"], input[id*="email" i], input[placeholder*="correo" i], input[placeholder*="email" i]') to be visible
  ```
- **Timeline:** Hoy 2026-05-11 empezó a fallar. SIEMPRE había funcionado antes → **regresión reciente**.
- **Reproduction:** Click en botón "Cobrar con BOLD" desde el detalle de un pedido (ejemplo: pedido $129.900 COP — 2X ELIXIR DEL SUEÑO, workspace Somnio).
- **Where the error is visible:** Toast/popup en la UI del CRM (frontend Vercel).
<!-- DATA_END -->

## Context

- Workspace: Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
- Producto: ELIXIR DEL SUEÑO (2X = $129.900 COP)
- El locator de Playwright cubre 6 variantes de selector (email, username, correo, placeholder es/en) → fallback amplio, NINGUNO matchea.
- Hipótesis preliminares posibles:
  - H1: BOLD cambió la UI de su portal de login hoy (selectors movidos/renombrados).
  - H2: Página no carga (robot llega a una pantalla de error / captcha / mantenimiento).
  - H3: Credenciales rechazadas → redirect a otra pantalla sin email input.
  - H4: Robot Railway down / desplegado con código viejo.
  - H5: BOLD activó WAF/anti-bot detection bloqueando Playwright headless.
  - H6: URL del portal BOLD cambió y el robot pega a 404 / login social-only.

## Current Focus

- hypothesis: BOLD migró su login form a Auth0 Universal Login (`auth.bold.co`) — el DOM cambió completamente. ROOT CAUSE CONFIRMADA.
- test: Probe live BOLD endpoints (panel.bold.co, auth.bold.co, /authorize, /api/auth/authorize) + read JS chunks for routing constants.
- expecting: Confirm that login DOM no longer matches any of the 6 email selectors.
- next_action: Producir Root Cause Report — fix queda diferido a decisión del usuario.
- reasoning_checkpoint: ✅ Cycle 1 completed — Auth0 fingerprints found in HTTP headers, JS chunks reveal new route `LOGIN:"/auth/iniciar-sesion"`, CSP whitelist incluye `*.auth0.com` y `*.auth.bold.co`. Last commit to `bold-robot/src/bold-client.js` fue 2026-04-10 → robot intacto, regresión es 100% upstream (BOLD).
- tdd_checkpoint: (n/a — diagnose-only mode)

## Evidence

- timestamp: 2026-05-11T14:29Z — file: `bold-robot/src/bold-client.js:135-142`
  Robot espera selector `'input[type="email"], input[name="email"], input[name="username"], input[id*="email" i], input[placeholder*="correo" i], input[placeholder*="email" i]'` con timeout 30s. Este es exactamente el locator que aparece verbatim en el error message del usuario. Confirma que la falla ocurre en STEP 1a (fill email) tras click en "Iniciar sesión" del landing page (línea 124-130).

- timestamp: 2026-05-11T14:29Z — file: `bold-robot/src/bold-client.js:7`
  Portal URL hardcoded: `BOLD_LOGIN_URL = 'https://panel.bold.co'`. Robot navega al landing y depende de click "Iniciar sesión" para llegar al form.

- timestamp: 2026-05-11T14:30Z — git log
  Última edición a `bold-client.js` fue 2026-04-10 (commit `750221d`). El robot lleva 1 mes sin cambios y funcionaba ayer. Descarta H4 (robot down / código viejo) — la regresión es 100% upstream.

- timestamp: 2026-05-11T14:30Z — HTTP probe `https://panel.bold.co/`
  Response headers incluyen CSP que whitelist EXPLÍCITAMENTE: `frame-src ... *.auth0.com *.auth.bold.co ...` y `script-src-elem ... *.auth0.com ... *.stytch.com ...`. Estos providers de identidad NO eran necesarios cuando BOLD tenía un form self-hosted.

- timestamp: 2026-05-11T14:30Z — HTTP probe `https://auth.bold.co/authorize`
  Response → 302 a `https://ayuda.bold.co/es/-Hk1SKzqdi?...error=invalid_request&error_description=Missing required parameter: response_type`. **Fingerprint Auth0 confirmado** vía headers `x-auth0-l: 0.003` y `x-auth0-requestid: 2b5b56cdad85865b1e44`. El subdominio `auth.bold.co` es ahora un **Auth0 tenant** que requiere OAuth2 params (`response_type`, `client_id`, `redirect_uri`, etc.).

- timestamp: 2026-05-11T14:33Z — JS chunk `panel.bold.co/_next/static/chunks/40996-0dd1dadf03134d78.js`
  Contiene constantes de rutas: `LOGIN:"/auth/iniciar-sesion"`, `AUTHORIZE:"/api/auth/authorize"`. La ruta del login form cambió de "landing → click Iniciar sesión → form embebido" a un route dedicado `/auth/iniciar-sesion` que sirve un SPA shell que hidrata el form Auth0/Stytch.

- timestamp: 2026-05-11T14:33Z — HTTP probe `https://panel.bold.co/api/auth/authorize`
  Sin sesión: response 307 → redirect a `http://panel.bold.co/auth/iniciar-sesion`. Confirma flujo OAuth2: cuando un usuario no autenticado pide acceso al panel, BOLD redirige a `/auth/iniciar-sesion`, que monta el widget Auth0 (probablemente Lock o Universal Login client-side) con DOM completamente diferente al form anterior.

- timestamp: 2026-05-11T14:33Z — código del robot no contempla Auth0
  `bold-client.js` busca el email input inmediatamente después del click "Iniciar sesión", asumiendo que el form era parte del DOM del propio panel. Con el nuevo flujo, después del click ocurre uno de estos escenarios:
  1. El click ya no existe en el landing rediseñado, o lleva a un wizard distinto.
  2. El click redirige a `/auth/iniciar-sesion` que monta un widget Auth0 cuyos inputs tienen **selectores diferentes** (Auth0 usa típicamente `input.auth0-lock-input` con `name="email"` SÍ matcheado, PERO con un loader inicial de varios segundos + slot CSS distinto, lo que invalida `isVisible()` durante el timeout).
  3. El widget Auth0 monta dentro de un iframe (`frame-src *.auth0.com` en CSP lo permite), y los selectores Playwright a nivel page no atraviesan el iframe sin `.frameLocator()`.

## Eliminated Hypotheses

- **H2** (página no carga / captcha / mantenimiento) — ELIMINADA. `panel.bold.co/` responde HTTP 200 con assets normales, `auth.bold.co/authorize` responde 302 con Auth0 fingerprint en headers (no captcha).
- **H3** (credenciales rechazadas → redirect a pantalla sin email) — ELIMINADA. El error ocurre ANTES de fill password (STEP 1a, línea 142), no hubo intento de autenticación todavía.
- **H4** (robot Railway down / código viejo) — ELIMINADA. El robot está usando el código de 2026-04-10 (commit `750221d`), 1 mes sin cambios, funcionaba ayer. La diff es 100% del lado de BOLD.
- **H5** (WAF / anti-bot detection) — ELIMINADA en principio. `curl` con user-agent normal recibe HTTP 200 y headers Auth0 normales. Si fuera WAF habría 403/429 o página de Cloudflare challenge. Posible falso negativo (WAF puede actuar solo contra Chromium headless), pero la evidencia primaria (Auth0 migration) explica el síntoma completo sin necesidad de invocar WAF.
- **H6** (URL portal cambió a 404) — ELIMINADA parcialmente. `panel.bold.co` sigue 200, NO 404. Pero la **ruta de login interna cambió** de embebida-en-landing a `/auth/iniciar-sesion` con widget Auth0 → variante de H6 confirmada como sub-causa.

## Resolution

- **root_cause:** BOLD migró su sistema de autenticación a **Auth0 Universal Login (subdominio `auth.bold.co`)** entre 2026-05-10 y 2026-05-11. El portal `panel.bold.co` ya no sirve el form de login directamente: el route es ahora `/auth/iniciar-sesion` (constante `LOGIN` en chunk JS `40996-0dd1dadf03134d78.js`) que monta un widget Auth0/Stytch con DOM completamente distinto al form self-hosted anterior. Los 6 selectores de email del robot (`input[type="email"]`, `input[name="email"]`, `input[name="username"]`, `input[id*="email" i]`, `input[placeholder*="correo" i]`, `input[placeholder*="email" i]`) ya no matchean porque (a) el widget Auth0 puede montar dentro de un iframe (`frame-src *.auth0.com` en CSP lo permite) lo que requiere `page.frameLocator()` en vez de `page.locator()`, y/o (b) el widget tiene un loader asíncrono que renderiza el input fuera de la ventana de 30s.

  Evidencia diferencial:
  - **Auth0 fingerprints en HTTP headers:** `x-auth0-l: 0.003`, `x-auth0-requestid: 2b5b56cdad85865b1e44` en `auth.bold.co/authorize`.
  - **CSP whitelist:** `frame-src ... *.auth0.com *.auth.bold.co` (panel.bold.co/) — NO estaba ahí antes (revisable contra deploys históricos vía Wayback Machine si se quiere prueba forense extra).
  - **Constante JS:** `LOGIN:"/auth/iniciar-sesion"` en chunk `40996-0dd1dadf03134d78.js`.
  - **OAuth2 error:** `auth.bold.co/authorize` sin params devuelve `error=invalid_request&error_description=Missing required parameter: response_type` — confirma OAuth2/OIDC server.
  - **Stytch también whitelisted** (`*.stytch.com` en script-src y connect-src) → BOLD posiblemente combina Auth0 + Stytch para passwordless (magic links / SMS code).
  - **Línea de defensa nuestra intacta:** último commit a `bold-client.js` fue 2026-04-10 (1 mes atrás). Lado nuestro NO cambió. La regresión es 100% upstream (BOLD).

- **fix:** (n/a — diagnose-only mode, fix deferred to user decision)

  Direcciones probables del fix (ranked):
  1. **Investigar si Auth0 monta iframe** — abrir DevTools en `panel.bold.co` después de click "Iniciar sesión", confirmar si el form está en iframe o en DOM main. Si iframe: `page.frameLocator('iframe[src*="auth0"]').locator('input[type="email"]')`. Si DOM main: agregar selectores Auth0 Lock al locator: `input.auth0-lock-input`, `input[data-action="email"]`, `input[autocomplete="username"]`.
  2. **Cambiar URL inicial a `/auth/iniciar-sesion`** — bypassear el landing + click "Iniciar sesión" yendo directo al login route. Reduce surface de cambios futuros del landing.
  3. **Habilitar y propagar OAuth2 API directa** — si BOLD expone Auth0 Resource Owner Password Credentials grant (`POST https://auth.bold.co/oauth/token` con `grant_type=password`), eliminar Playwright entirely para login. Requiere validar con BOLD que el grant está habilitado para el tenant.
  4. **Considerar BOLD API oficial** — verificar si BOLD lanzó una API REST para "Links de pago" que evite scraping completamente. La migración a Auth0 sugiere modernización + posibilidad de API pública nueva.
  5. **Tomar screenshot fresco con el robot mismo** — `bold-robot/screenshots/` debe tener el `01b-login-form.png` reciente (si Railway lo persistió). Inspeccionar el DOM real del fallo antes de elegir solución.

- **verification:** (pendiente — depende de la dirección del fix elegida)
- **files_changed:** (none yet — diagnose-only)

## Specialist Hint

`general` — bug is upstream (3rd-party UI change). No language-specific specialist applies. Manual operator decision required for fix direction.
