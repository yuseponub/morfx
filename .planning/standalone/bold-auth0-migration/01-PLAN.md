---
phase: bold-auth0-migration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - bold-robot/src/bold-client.js
autonomous: false
requirements: [D-01, D-02, D-03, D-05]

must_haves:
  truths:
    - "El robot ya no usa la landing-page + click 'Iniciar sesión'; navega directo a la BFF login initiator que dispara la cadena Auth0 (D-03)"
    - "Step 1 fill identifier usa cascade Auth0 NUL primary + legacy fallback (input#username → input[name=\"username\"] → input[autocomplete=\"email\"] → input[type=\"email\"] → input[name=\"email\"])"
    - "El robot detecta /u/mfa-* o /mfa/challenge en page.url() y lanza error 'BOLD ahora requiere MFA' SIN intentar automatizar (D-05 escalación)"
    - "Honeypot password input (class=hide, aria-hidden=true) NUNCA se llena — selector restringido con :not(.hide):not([aria-hidden=\"true\"]) (Pitfall 5)"
    - "Si storageState está stale (STEP 0 detecta sesión inválida), el archivo se borra del disco y se navega a /api/auth/logout antes de STEP 1 (Pitfall 1, Pitfall 6)"
    - "Si después de submit password el page.url() sigue en auth.bold.co, lanza 'Login falló — Playwright sigue en auth.bold.co...' (Pitfall sanity check)"
    - "codeInputSelector incluye input[name=\"code\"] y input[autocomplete=\"one-time-code\"] (Auth0 NUL) además de los selectores legacy"
    - "El robot NO usa page.frameLocator (anti-Strategy-A regresión confirmada por probes)"
  artifacts:
    - path: "bold-robot/src/bold-client.js"
      provides: "Auth0 NUL aware login flow (STEP 0 + STEP 1 + STEP 1.5 rewritten)"
      contains: "input#username"
    - path: "bold-robot/src/bold-client.js"
      provides: "MFA escalation throw"
      contains: "BOLD ahora requiere MFA"
    - path: "bold-robot/src/bold-client.js"
      provides: "URL sanity check after password submit"
      contains: "Playwright sigue en auth.bold.co"
  key_links:
    - from: "bold-robot/src/bold-client.js STEP 0"
      to: "STEP 1 (full login)"
      via: "clearSession + logout when storageState stale"
      pattern: "fs\\.unlinkSync\\(STATE_FILE\\)"
    - from: "bold-robot/src/bold-client.js STEP 1"
      to: "Auth0 NUL form"
      via: "page.goto('https://panel.bold.co/api/auth/login?audience=PAYMENTS&redirect=login-redirect')"
      pattern: "panel\\.bold\\.co/api/auth/login"
---

<objective>
Reemplazar el flujo de login del robot BOLD (STEP 0 fallback + STEP 1 entero + STEP 1.5 code waiter) para que funcione contra el nuevo Auth0 New Universal Login (NUL) que BOLD activó entre 2026-05-10 y 2026-05-11. Es el fix primario — sin este plan, el robot está roto en producción.

Strategy B (per D-03 + RESEARCH §Recommended Strategy): navegación directa al BFF `panel.bold.co/api/auth/login` que dispara la cadena de redirects 302 hacia `auth.bold.co/u/login/identifier`, donde Playwright drivea el form con selectores canónicos Auth0 NUL extraídos verbatim de la captura HTML live del probe 3.

Output: `bold-robot/src/bold-client.js` con lines 96-216 reemplazadas por el código verbatim de RESEARCH Examples 1 + 2. STEP 2-6 (post-login) quedan intactos.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bold-auth0-migration/CONTEXT.md
@.planning/standalone/bold-auth0-migration/RESEARCH.md
@bold-robot/src/bold-client.js
@bold-robot/src/code-waiter.js
@CLAUDE.md
</context>

<interfaces>
<!-- Code structure inside bold-client.js that this plan respects -->
<!-- Existing constants (lines 1-25, DO NOT modify): -->
- `BOLD_LOGIN_URL`, `BOLD_NUEVO_LINK_URL`, `STATE_FILE`, `STATE_DIR`, `LOGIN_FIELD_TIMEOUT`, `DEFAULT_TIMEOUT`
- `codeWaiter` is imported from `./code-waiter` — no signature change in this plan

<!-- Existing function entry (line ~29, DO NOT change signature): -->
```javascript
async function createPaymentLink({ username, password, amount, description, imageUrl })
```

<!-- STEP 0 outer shape (lines 96-114) is preserved; only the failure-fallback block (around line 113) gets the new clearSession + logout lines added (Example 2) -->
<!-- STEP 1 + STEP 1.5 (lines 116-216) get FULLY replaced with Example 1 from RESEARCH.md -->
<!-- STEP 2-6 (lines 218+) are NOT touched -->
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add stale-session fallback in STEP 0 (Pitfall 1 + 6 mitigation)</name>
  <read_first>
    - `bold-robot/src/bold-client.js` lines 96-114 (current STEP 0 logic — entry + the saved-session-expired warning at line 112)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 2 — Stale-session fallback in STEP 0" (lines 694-711)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Pitfall 1: Stale storageState shows 'resume session' instead of fresh form" (lines 444-452)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Pitfall 6: storageState cookie domain mismatch after migration" (lines 494-502)
    - `.planning/standalone/bold-auth0-migration/CONTEXT.md` §"D-02..D-04 Estrategia Técnica del Fix" + Pitfall 1 evidence in Probe 1
  </read_first>
  <files>bold-robot/src/bold-client.js</files>
  <action>
    Modificar `bold-robot/src/bold-client.js` para que cuando `STEP 0` detecte que la sesión guardada está expirada (línea 112, justo después del `console.log` "saved session expired..."), **antes** de caer al bloque `if (!isLoggedIn)` de STEP 1, ejecute el código verbatim de RESEARCH Example 2:

    ```javascript
          // Existing line 112 (already present):
          console.log(`[bold] saved session expired (landed on ${currentUrl}), falling back to full login`)
          // NEW LINES (add immediately after the console.log above):
          try {
            fs.unlinkSync(STATE_FILE)
            console.log('[bold] deleted stale storageState file to ensure clean login')
          } catch (err) {
            console.warn(`[bold] could not delete storageState: ${err.message}`)
          }
          // Also navigate to BFF logout to clear Auth0 SSO cookies on .bold.co
          await page.goto('https://panel.bold.co/api/auth/logout', { waitUntil: 'networkidle' }).catch(() => {})
          // existing flow continues (the closing `} else {` of the if (hasSavedState) block)
    ```

    Reglas:
    - El bloque se inserta DENTRO del `else` (cuando session probe falló) — NO en el `if (currentUrl.includes('/link-de-pago/nuevo/agregar-monto'))` branch (sesión válida).
    - `STATE_FILE` ya está definido en líneas 11-12 — NO redeclarar.
    - El `fs` ya está importado al inicio del archivo (línea 1-3) — NO añadir import.
    - Si `STATE_FILE` no existe, `fs.unlinkSync` lanza — el `try/catch` con `console.warn` lo absorbe.
    - El `.catch(() => {})` en el `page.goto('/api/auth/logout', ...)` es intencional: si el endpoint logout retorna 404 o error, seguimos al STEP 1 igual.

    Mantener este task atómico: 0 cambios fuera del rango líneas ~112-115. NO tocar STEP 1 (es Task 2). NO refactorizar.
  </action>
  <acceptance_criteria>
    - `grep -n "deleted stale storageState file" bold-robot/src/bold-client.js` retorna 1 match en STEP 0 region (cerca de L113)
    - `grep -n "panel.bold.co/api/auth/logout" bold-robot/src/bold-client.js` retorna 1 match
    - `grep -c "fs.unlinkSync(STATE_FILE)" bold-robot/src/bold-client.js` retorna ≥1
    - `node -c bold-robot/src/bold-client.js` (syntax check) exit 0
  </acceptance_criteria>
  <verify>
    <automated>node --check bold-robot/src/bold-client.js</automated>
  </verify>
  <done>El archivo compila syntácticamente y los 3 greps de acceptance criteria pasan.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Replace STEP 1 + STEP 1.5 with Auth0 NUL flow (verbatim from RESEARCH Example 1)</name>
  <read_first>
    - `bold-robot/src/bold-client.js` lines 116-216 (current STEP 1 + STEP 1.5 — the block that gets fully replaced)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 1 — New STEP 1 in `bold-robot/src/bold-client.js`" (lines 546-692)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Anti-Patterns to Avoid" (lines 415-424)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Auth0 NUL selectors (verbatim from probe)" table (lines 237-247)
    - `.planning/standalone/bold-auth0-migration/CONTEXT.md` D-02, D-03, D-05
    - `bold-robot/src/code-waiter.js` (existing API — `codeWaiter.startWaiting(timeoutMs)` returns Promise<string>; no signature change)
  </read_first>
  <files>bold-robot/src/bold-client.js</files>
  <action>
    Reemplazar EL BLOQUE ENTERO de líneas 116-216 (`if (!isLoggedIn) { ... } // end if (!isLoggedIn)`) en `bold-robot/src/bold-client.js` con el código verbatim de RESEARCH Example 1 (que ya empieza con la misma línea `if (!isLoggedIn) {` y termina con `} // end if (!isLoggedIn)`):

    ```javascript
        if (!isLoggedIn) {
          // ===== STEP 1: LOGIN via Auth0 New Universal Login =====
          // Post-2026-05-11 BOLD migrated to Auth0 NUL.
          // The BFF (panel.bold.co/api/auth/login) emits the OAuth2 authorize redirect.
          // Playwright follows the full chain as a top-level navigation:
          //   panel.bold.co/api/auth/login → auth.bold.co/authorize → auth.bold.co/u/login/identifier
          console.log('[bold] navigating to BFF login initiator...')
          await page.goto(
            'https://panel.bold.co/api/auth/login?audience=PAYMENTS&redirect=login-redirect',
            { waitUntil: 'networkidle' }
          )
          await page.waitForTimeout(1500) // allow Auth0 NUL JS to attach validation hooks
          await saveScreenshot(page, '01b-login-form')

          // Auth0 NUL canonical selectors. Cosmetic classes (cf28009b3 etc.) change per
          // Auth0 deploy — DO NOT use them. The cascade keeps legacy BOLD selectors at the
          // end so a partial rollback by BOLD doesn't break us.
          const usernameSelector = [
            'input#username',                              // Auth0 NUL primary
            'input[name="username"]',                      // Auth0 NUL alias
            'input[autocomplete="email"]',                 // Semantic
            'input[type="email"]',                         // Legacy BOLD form fallback
            'input[name="email"]',                         // Legacy BOLD form fallback
          ].join(', ')

          // Honeypot guard: Auth0 NUL identifier page has <input class="hide" type="password"
          // aria-hidden="true">. Our cascade must NOT match it. We restrict to elements with
          // type="password" AND not aria-hidden AND not class="hide".
          const passwordSelector = [
            'input#password:not(.hide):not([aria-hidden="true"])',
            'input[name="password"]:not(.hide):not([aria-hidden="true"])',
            'input[autocomplete="current-password"]',
            // Legacy BOLD form fallback (no honeypot existed there)
            'input[type="password"][name="password"]',
          ].join(', ')

          // Auth0 NUL submit. data-action-button-primary is the stable hook.
          const submitSelector = [
            'button[data-action-button-primary="true"]',
            'button[name="action"][value="default"]',
            'button._button-login-id',
            // Legacy BOLD form fallback
            'button[type="submit"]:has-text("Ingresar")',
            'button:has-text("Continuar")',
          ].join(', ')

          // Step 1a: fill identifier (email or username)
          // Wait longer than LOGIN_FIELD_TIMEOUT because Auth0 NUL hydration includes
          // device-fingerprinting (CSIDE + Stytch telemetry.js) which adds 1-3s.
          await page.waitForSelector(usernameSelector, { timeout: 45_000, state: 'visible' })
          await page.fill(usernameSelector, username)
          await saveScreenshot(page, '02a-email-filled')

          // Step 1b: submit identifier → Auth0 routes to /u/login/password
          await Promise.all([
            page.waitForLoadState('networkidle').catch(() => {}),
            page.click(submitSelector),
          ])
          await page.waitForTimeout(1500)
          await saveScreenshot(page, '02b-password-page')

          // Sanity check: if we hit MFA at this point (rare per probe — current account
          // has no MFA enrolled — but tenant supports it per discovery doc), escalate.
          if (page.url().match(/\/u\/mfa-|\/mfa\/challenge/)) {
            await saveScreenshot(page, 'error-mfa-required')
            throw new Error(
              'BOLD ahora requiere MFA. Este flujo no esta automatizado. ' +
              'Configura el agente sin MFA o contacta a BOLD para deshabilitarlo.'
            )
          }

          // Step 2a: fill password
          await page.waitForSelector(passwordSelector, { timeout: 30_000, state: 'visible' })
          await page.fill(passwordSelector, password)
          await saveScreenshot(page, '02c-password-filled')

          // Step 2b: submit password → Auth0 redirects to /api/auth/callback?code=...
          // BFF exchanges code → sets session cookie → final redirect to /misventas.
          await Promise.all([
            page.waitForLoadState('networkidle').catch(() => {}),
            page.click(submitSelector),
          ])
          await page.waitForTimeout(2500) // post-login redirect chain
          await saveScreenshot(page, '03-post-login')

          // ===== STEP 1.5: HANDLE VERIFICATION CODE CHALLENGE (Auth0 NUL or legacy) =====
          // BOLD's old form used a custom 6-digit input. Auth0 NUL uses input[name="code"]
          // with autocomplete="one-time-code". Cascade covers both.
          const codeInputSelector = [
            'input[name="code"]',                          // Auth0 NUL primary
            'input[autocomplete="one-time-code"]',         // Auth0 NUL alias
            'input[maxlength="6"]',                        // Legacy BOLD form
            'input[placeholder*="código" i]',              // Legacy BOLD form
            'input[placeholder*="codigo" i]',
            'input[name*="code" i]',
            'input[aria-label*="código" i]',
          ].join(', ')

          const codeInput = await page.$(codeInputSelector)
          if (codeInput && (await codeInput.isVisible().catch(() => false))) {
            console.log('[bold] verification code screen detected — waiting for /api/submit-code...')
            await saveScreenshot(page, '02d-code-screen')

            const code = await codeWaiter.startWaiting(10 * 60 * 1000)
            console.log(`[bold] code received (${code.length} digits), submitting...`)

            await page.fill(codeInputSelector, code)
            await saveScreenshot(page, '02e-code-filled')

            await Promise.all([
              page.waitForLoadState('networkidle').catch(() => {}),
              page.click(submitSelector),
            ])
            await page.waitForTimeout(2500)
            await saveScreenshot(page, '02f-post-code')
          }

          await dismissNpsPopup(page)

          // Sanity check: should be back on panel.bold.co, not still on auth.bold.co
          if (page.url().includes('auth.bold.co')) {
            await saveScreenshot(page, 'error-still-on-auth0')
            throw new Error(
              'Login falló — Playwright sigue en auth.bold.co después de submit. ' +
              'Credenciales incorrectas o Auth0 muestra error.'
            )
          }

          // Persist the session state so future requests skip login entirely
          try {
            if (!fs.existsSync(STATE_DIR)) {
              fs.mkdirSync(STATE_DIR, { recursive: true })
            }
            await context.storageState({ path: STATE_FILE })
            console.log(`[bold] session state saved to ${STATE_FILE}`)
          } catch (err) {
            console.warn(`[bold] could not save session state: ${err.message}`)
          }
        } // end if (!isLoggedIn)
    ```

    Reglas (anti-regresión):
    - **NUNCA** introducir `page.frameLocator(...)` — Strategy A invalidada por probe 3 (RESEARCH §Anti-Patterns).
    - **NUNCA** usar las cosmetic classes (`cf28009b3`, `ca78f7137`, `c05e358de`, `c65fc0268`, etc.) — cambian en cada deploy Auth0.
    - **NUNCA** llenar `input.hide` o `input[aria-hidden="true"]` — es honeypot (Pitfall 5). El `passwordSelector` ya tiene `:not(.hide):not([aria-hidden="true"])`.
    - **NUNCA** hardcodear `https://auth.bold.co/u/login/identifier` — siempre navegar via `panel.bold.co/api/auth/login` y dejar que Auth0 route.
    - Conservar el `dismissNpsPopup(page)` después del code waiter (NPS popup sigue existiendo post-login per probe).
    - Conservar el `context.storageState({ path: STATE_FILE })` al final — crítico para que STEP 0 funcione en runs siguientes.
    - El timeout del username selector es **45_000 ms** (no 30_000) — Auth0 hydration con CSIDE + Stytch tarda 1-3s extra (Pitfall 4 mitigation).

    Mantener este task atómico: SOLO el bloque líneas 116-216. NO tocar STEP 0 (es Task 1). NO tocar STEP 2-6 (líneas 218+ — quedan intactas).
  </action>
  <acceptance_criteria>
    - `grep -c "input#username" bold-robot/src/bold-client.js` retorna ≥1
    - `grep -c "data-action-button-primary" bold-robot/src/bold-client.js` retorna ≥1
    - `grep -c "/u/mfa-" bold-robot/src/bold-client.js` retorna ≥1 (MFA detection per D-05)
    - `grep -c "BOLD ahora requiere MFA" bold-robot/src/bold-client.js` retorna ≥1 (D-05 escalation message)
    - `grep -c "Playwright sigue en auth.bold.co" bold-robot/src/bold-client.js` retorna ≥1 (URL sanity check)
    - `grep -c ':not(.hide):not(\[aria-hidden="true"\])' bold-robot/src/bold-client.js` retorna ≥2 (honeypot guard on password selector)
    - `grep -c "frameLocator" bold-robot/src/bold-client.js` retorna 0 (anti-Strategy-A regression)
    - `grep -c "panel.bold.co/api/auth/login?audience=PAYMENTS" bold-robot/src/bold-client.js` retorna ≥1 (Strategy B BFF login initiator)
    - `grep -c "input\[name=\\\"code\\\"\]" bold-robot/src/bold-client.js` retorna ≥1 (Auth0 NUL code input)
    - `grep -c "input\[autocomplete=\\\"one-time-code\\\"\]" bold-robot/src/bold-client.js` retorna ≥1
    - `grep -c "cf28009b3\|ca78f7137\|c05e358de" bold-robot/src/bold-client.js` retorna 0 (NO cosmetic classes)
    - `grep -c "BOLD_LOGIN_URL" bold-robot/src/bold-client.js` ≥1 (the constant is preserved for STEP 0 / future use, BUT it should NO LONGER appear inside the `if (!isLoggedIn)` block — STEP 1 now uses the direct BFF URL)
    - `node --check bold-robot/src/bold-client.js` exit 0
  </acceptance_criteria>
  <verify>
    <automated>node --check bold-robot/src/bold-client.js</automated>
  </verify>
  <done>
    - Syntax check passa
    - Todos los acceptance_criteria pasan
    - Diff vs HEAD muestra cambios concentrados en líneas ~116-216 (más las 6 líneas del Task 1 en ~L113)
    - STEP 0 outer shape (líneas 96-114) preservado salvo el insert del Task 1
    - STEP 2-6 (líneas 218+) BYTE-IDENTICAS al HEAD original (`git diff HEAD -- bold-robot/src/bold-client.js` no muestra cambios fuera del rango ~96-216)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Smoke test — verify login fix works against live BOLD account</name>
  <what-built>
    - Robot `bold-client.js` con STEP 0 fallback de stale-session (Task 1) + STEP 1 Auth0 NUL completo (Task 2).
    - Cambios commiteados pero AÚN NO pusheados a `origin main`.
    - Railway deploya automáticamente del repo `morfx` con root `bold-robot/` — el push es la activación.
  </what-built>
  <how-to-verify>
    Pasos secuenciales:

    1. **Build local syntax check** (Claude lo corre antes de pedir al user):
       ```bash
       node --check bold-robot/src/bold-client.js
       ```
       Esperado: exit 0.

    2. **User pushes & waits for Railway deploy** (Regla 1):
       ```bash
       git push origin main
       ```
       Esperar ~2-3 min a que Railway redeployee. Verificar en dashboard Railway que el deploy esté green.

    3. **Health check post-deploy** (Claude lo corre):
       ```bash
       curl -s https://morfx-production-9b7a.up.railway.app/api/health
       ```
       Esperado: `{"status":"ok","service":"bold-robot",...}`.

    4. **Clear stale session ANTES del primer test** (Claude lo corre — anti Pitfall 1):
       ```bash
       curl -X POST https://morfx-production-9b7a.up.railway.app/api/clear-session
       ```
       Esperado: 200 OK con `{cleared:true}` o similar.

    5. **Test real con credenciales BOLD reales** (User provee creds, Claude corre):
       ```bash
       curl -X POST https://morfx-production-9b7a.up.railway.app/api/create-link \
         -H "Content-Type: application/json" \
         -d '{
           "username": "<EMAIL_REAL_BOLD>",
           "password": "<PASSWORD_REAL_BOLD>",
           "amount": 10000,
           "description": "TEST morfx auth0-migration"
         }'
       ```
       Esperado en ~30-45s: `{"url":"https://checkout.bold.co/LNK_xxx"}`.

    6. **Si falla**: abrir https://morfx-production-9b7a.up.railway.app/api/screenshots y revisar:
       - `01b-login-form.png` — debe mostrar el form Auth0 NUL (no resume-prompt) tras Task 1.
       - `02a-email-filled.png` — debe mostrar el username llenado.
       - `02c-password-filled.png` — debe mostrar el password page (Auth0 NUL).
       - `03-post-login.png` — debe estar en `panel.bold.co/misventas/...`.

    7. **Verify URL devuelto** (User abre en browser):
       - Click la URL retornada
       - Debe cargar el checkout real de BOLD con monto $10.000 y descripción "TEST morfx auth0-migration".

    Si los pasos 1-7 pasan → APPROVE. Si el robot devuelve "BOLD ahora requiere MFA" → este standalone NO continúa con Plan 02-04; el user abre un standalone separado `bold-auth0-mfa-handling` (D-05 escalation). Si el robot timeout en `01b-login-form` → revisar screenshot y reportar.
  </how-to-verify>
  <resume-signal>Type "approved" if smoke passes (real URL openable in browser), "mfa-blocked" if MFA detected (D-05 escalation), or describe the failure.</resume-signal>
</task>

</tasks>

<verification>
- `node --check bold-robot/src/bold-client.js` exit 0
- Todos los grep de acceptance_criteria de Task 1 + Task 2 pasan
- Post-deploy: `curl POST /api/create-link` con creds reales retorna URL `https://checkout.bold.co/...` válida en <60s
- URL abre checkout real BOLD con monto + descripción correctos
- Screenshots `01b-login-form.png`, `02a-email-filled.png`, `02c-password-filled.png`, `03-post-login.png` muestran flow Auth0 NUL exitoso (no más timeout en `01b`)
- Si el primer test devuelve error MFA → escalar (D-05 fired) y abrir standalone separado
</verification>

<success_criteria>
El robot BOLD vuelve a generar links de pago contra el panel real post-Auth0 migration. `curl POST /api/create-link` con creds válidas retorna `{url: "https://checkout.bold.co/LNK_xxx"}` consistentemente, y el URL abre el checkout real con monto + descripción correctos.
</success_criteria>

<output>
Después de completar (smoke approved), crear `.planning/standalone/bold-auth0-migration/01-SUMMARY.md` con:
- Lines modified: ~96-216 de `bold-robot/src/bold-client.js`
- Commits creados (lista de SHAs)
- Resultado del smoke (URL retornada por curl, screenshot del checkout)
- Pitfalls que se observaron en producción (si alguno)
</output>
