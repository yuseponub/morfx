# LEARNINGS — bold-auth0-migration

**Standalone:** `.planning/standalone/bold-auth0-migration/`
**Shipped:** 2026-05-11
**Planes:** 01–04 (4 planes lineales, sin waves paralelas)
**Commits clave:** `fff8c69` (plans), `2de017c` (STEP 0), `dd660b5` (STEP 1+1.5 → NUL), `7be7b98` (Plan 01 SUMMARY), `<LEARNINGS-SHA>` (este commit)
**HEAD pre-LEARNINGS:** `cb86e6e` (origin/main al momento del smoke) → `7be7b98` (local docs Plan 01 SUMMARY) → este commit
**Smoke aprobado:** 2026-05-11 (mínimo: UI button → modal → URL → BOLD checkout $10.000 con descripción "TEST post-auth0 fix"). PASS.

---

## TL;DR

Bold Comercio migró su flujo de login del custom username/password legacy a **Auth0 Universal Login (Lock widget)** servido desde `https://auth.bold.co/u/login/identifier`. El robot Playwright que automatiza la creación de "link de pago" (usado por la UI de MorfX en `/sandbox`/comercial flow) se rompió silenciosamente: la página de login ya no contenía los selectores legacy (`#username`, `#password`, `button[type=submit]`) sino que renderiza un widget Auth0 dentro de un host estable que incluye un **honeypot** (`name="username"` hidden) y campos visibles separados por una transición intermedia (identifier → password).

La solución no fue parchear selectores. Fue **reemplazar STEP 0 + STEP 1 + STEP 1.5 completos** por un flujo Auth0 NUL (Auth0 Universal Login) explícito:

1. STEP 0 ahora limpia `storageState` stale antes de cada intento (cookies de Auth0 expiradas dejaban la sesión en estado zombi que pasaba el detector "ya logueado" pero fallaba en la primera mutación).
2. STEP 1 fue reescrito como `auth0NulSubmitIdentifier()` con espera explícita a la transición a `?state=...&screen=login-password`.
3. STEP 1.5 fue reescrito como `auth0NulSubmitPassword()` y elimina el `frameLocator()` que asumía iframe (Auth0 NUL ya no usa iframe en este tenant — todo es DOM directo bajo `auth.bold.co`).

El smoke mínimo aprobado por el usuario el 2026-05-11 demuestra que la cadena end-to-end vuelve a generar checkouts reales en BOLD. Los smokes D-06 (induced-down) y D-07 (telemetry-trip) quedan **diferidos como deuda técnica** — el usuario priorizó desbloquear producción.

---

## Decisiones lockeadas (CONTEXT.md)

| ID | Decisión | Aplicada en |
|----|----------|-------------|
| **D-01** | Migrar a Auth0 NUL **sin** mantener compat con flujo legacy. Bold ya no expone el flujo viejo — no hay path híbrido que probar. | `src/app/actions/bold.ts` (helpers `auth0NulSubmit*`), Plan 01 |
| **D-02** | NO usar `frameLocator()`. El widget Auth0 en `auth.bold.co` corre como DOM directo (no iframe). Asumir iframe es **anti-patrón** que rompe el robot. | Plan 01 Task 1 (reemplazo de STEP 1.5) |
| **D-03** | Limpiar `storageState` stale en STEP 0 antes de detectar "ya logueado". Cookies Auth0 expiradas (≥7 días) producen falsos positivos. | `2de017c` (STEP 0 fix Auth0 NUL fallback) |
| **D-04** | Esperar la transición a `screen=login-password` por `waitForURL()` con regex sobre el query param, NO por `waitForSelector('#password')`. Auth0 NUL puede repintar el DOM antes de cambiar la URL si el identifier es inválido. | Plan 01 Task 1, helper `auth0NulSubmitIdentifier` |
| **D-05** | Detectar y skipear el **honeypot** `input[name="username"][aria-hidden="true"]`. Llenarlo dispara reCAPTCHA y banea la sesión. Usar `input[name="username"]:visible` con filtro por visibilidad. | Plan 01 Task 1, helper `auth0NulSubmitIdentifier` |
| **D-06** | Smoke "induced-down" (bajar Auth0 a mano vía hosts file + verificar comportamiento de retry/abort) **DIFERIDO** post-ship. El usuario validó el happy path mínimo y aceptó el riesgo. | Smoke 2026-05-11 (skipeado), tech debt |
| **D-07** | Smoke "telemetry-trip" (verificar que un fallo de Auth0 emita `pipeline_decision:bold_auth0_login_failed` con root cause clasificado) **DIFERIDO**. Telemetría sí está instrumentada en código (`inngest.send` async para no bloquear webhook <5s), pero no se ejecutó el escenario forzado. | Smoke 2026-05-11 (skipeado), tech debt |

Los 7 IDs (D-01..D-07) están todos aplicados o explícitamente diferidos. Ningún decision quedó sin trazabilidad.

---

## Patterns nuevos en codebase

### P-1: Auth0 NUL identifier→password transition (helper canónico)

Cuando un tercero migra a Auth0 Universal Login con flujo "Identifier First", el patrón correcto es:

```ts
// Patrón Auth0 NUL — usar este molde para cualquier robot futuro contra tenant Auth0
async function auth0NulSubmitIdentifier(page: Page, email: string) {
  // 1. Honeypot guard (D-05): NO escribir en el input hidden
  const visibleEmail = page.locator('input[name="username"]:visible').first();
  await visibleEmail.waitFor({ state: 'visible', timeout: 10000 });
  await visibleEmail.fill(email);

  // 2. Submit + esperar transición de URL (D-04)
  await Promise.all([
    page.waitForURL(/screen=login-password/, { timeout: 15000 }),
    page.locator('button[type="submit"]:visible').click(),
  ]);
}

async function auth0NulSubmitPassword(page: Page, password: string) {
  // 3. NO frameLocator (D-02) — DOM directo bajo auth.bold.co
  const pwd = page.locator('input[name="password"]:visible').first();
  await pwd.waitFor({ state: 'visible', timeout: 10000 });
  await pwd.fill(password);
  await Promise.all([
    page.waitForURL(/comercio\.bold\.co/, { timeout: 20000 }),
    page.locator('button[type="submit"]:visible').click(),
  ]);
}
```

**Aplica a:** cualquier futuro robot contra un tenant Auth0 NUL (no exclusivo de Bold). El módulo `agent-godentist` también podría migrar a este patrón si Dentos algún día rota a Auth0.

### P-2: `storageState` clear como primer paso de cualquier robot legacy con sesión persistida

Cuando un robot persiste `storageState` para reusar login, **siempre** verificar primero que las cookies no estén expiradas antes de asumir "ya logueado":

```ts
// STEP 0 corregido (2de017c)
async function step0VerifySession(page: Page): Promise<'logged_in' | 'needs_login'> {
  // Intentar abrir la URL protegida
  await page.goto('https://comercio.bold.co/dashboard', { timeout: 15000 });

  // Si el dashboard renderiza, OK. Si redirige a auth.bold.co/u/login,
  // las cookies storageState están stale → limpiar y forzar re-login.
  if (page.url().includes('auth.bold.co')) {
    await page.context().clearCookies();
    return 'needs_login';
  }
  return 'logged_in';
}
```

**Por qué no chequear el TTL de la cookie directamente:** Auth0 rota tokens internos sin reflejar el cambio en `expires`. La verificación empírica (hacer un GET a una URL protegida y mirar si redirige) es más confiable que confiar en cookie metadata.

### P-3: Telemetry trip con `inngest.send` async (no bloquear webhook)

Cuando el robot reporta un fallo de auth, **no** bloquear la respuesta de la server action. En su lugar:

```ts
// Patrón Vercel serverless + Inngest
catch (err) {
  // FIRE-AND-FORGET con await — Vercel cierra la lambda al return,
  // si NO esperas el send, Inngest descarta el evento (lección Memory entry).
  await inngest.send({
    name: 'bold/auth0_login_failed',
    data: { rootCause: classifyAuth0Error(err), workspace_id, ... }
  });
  throw new BoldAuth0Error(err); // El caller decide retry/handoff
}
```

Lección reusada del Phase 36 (`B-007 inngest fire-and-forget`): `inngest.send` siempre con `await`, nunca dispatch-and-forget en Vercel.

---

## Pitfalls encontrados (anti-patrones)

### Anti-patrón 1: `frameLocator()` para Auth0 NUL

**Síntoma:** El robot no encontraba `#password` después del submit del identifier.

**Causa raíz:** El código legacy asumía que Auth0 servía el form dentro de un iframe (cierto para la versión Classic Universal Login pre-2020). Auth0 NUL renderiza el widget como DOM directo en el host `auth.bold.co`. Usar `page.frameLocator('iframe')` apuntaba a un iframe que no existe.

**Fix:** Eliminar TODO `frameLocator()` del archivo. Usar `page.locator(...)` directo.

**Anti-regresión:** Si en el futuro hay que volver a interactuar con un widget Auth0, **primero** verificar manualmente con DevTools si hay iframe. En 2026, ya no hay.

### Anti-patrón 2: Llenar el honeypot `name="username"` hidden

**Síntoma:** Después de "login exitoso" del robot, Bold respondía con HTTP 200 pero la siguiente request mutativa (crear link de pago) caía con 401 + "session invalidated by suspicious activity".

**Causa raíz:** Auth0 incluye un input `<input name="username" aria-hidden="true" tabindex="-1">` como honeypot anti-bot. El selector `input[name="username"]` lo agarra **antes** que el campo visible. Al llenarlo, Auth0 marca la sesión como bot y la invalida silenciosamente.

**Fix:** Usar `input[name="username"]:visible` con `.first()`. Verificar visualmente que el input agarrado NO tenga `aria-hidden="true"`.

**Anti-regresión:** Si en algún tenant Auth0 el campo es `input[type="email"]:visible` o tiene placeholder específico, anclar por ese atributo más estable que `name=`.

### Anti-patrón 3: Confiar en `storageState` sin verificar

**Síntoma:** Bug productivo intermitente: el robot reportaba "ya logueado" pero la siguiente mutación fallaba con 401.

**Causa raíz:** Auth0 expira cookies después de un período variable (7-30 días según refresh policy). El `storageState.json` persistido contenía cookies stale. STEP 0 las cargaba alegremente sin verificar y declaraba la sesión válida.

**Fix:** STEP 0 ahora hace un `goto()` a `comercio.bold.co/dashboard`; si redirige a `auth.bold.co/u/login`, limpia cookies y procede con Auth0 NUL flow.

### Anti-patrón 4: `waitForSelector('#password')` post-submit identifier

**Síntoma:** Race condition — a veces el robot encontraba `#password` antes de que el form estuviera listo y `fill()` no escribía nada.

**Causa raíz:** Auth0 NUL hace una transición client-side que reordena el DOM antes de cambiar la URL. El selector existía en el DOM viejo pero apuntaba a un input que iba a ser destruido en el repaint.

**Fix:** Usar `page.waitForURL(/screen=login-password/)` como gate. La URL solo cambia DESPUÉS de que el nuevo screen está montado.

### Anti-patrón 5: No esperar el redirect post-password a `comercio.bold.co`

**Síntoma:** Tras el submit de password, el robot inmediatamente intentaba ir al dashboard pero seguía en `auth.bold.co/u/login/identifier?state=...` (loop).

**Causa raíz:** Submit exitoso en Auth0 NUL devuelve 302 con cadena de redirects (`auth0.com/authorize/resume` → `bold.co/auth/callback` → `comercio.bold.co/dashboard`). Si el robot no espera el último hop, las cookies de sesión final no están aún en `page.context()`.

**Fix:** `waitForURL(/comercio\.bold\.co/, { timeout: 20000 })` después del submit.

---

## Indicadores de regresión (qué monitorear)

Si alguno de estos indicadores se dispara, **el flujo está roto**:

1. **`pipeline_decision:bold_auth0_login_failed`** con `rootCause=identifier_screen_timeout` → la transición a `screen=login-password` no ocurre. Posible cambio en query param de Auth0 (verificar `/u/login/identifier` URL).
2. **`pipeline_decision:bold_auth0_login_failed`** con `rootCause=password_field_not_visible` → reapareció iframe o cambió selector. Inspeccionar `auth.bold.co/u/login` manualmente.
3. **HTTP 401 en POST `/api/comercio/checkout`** después de login "exitoso" → cookies de sesión no se persisten. Probablemente honeypot fue llenado o redirect final no se esperó.
4. **Robot timeout en 30s+ haciendo login** → reCAPTCHA disparado. Mirar screenshot del fallo, si hay challenge visible, la sesión fue marcada como bot.
5. **`storageState.json` crece sin parar (>500KB)** → STEP 0 no está limpiando cookies stale. Verificar que el `clearCookies()` se ejecute.

Sugerencia: agregar alarma Vercel/Sentry para `bold_auth0_login_failed > 3 en 1h`.

---

## Deuda técnica registrada

| Ítem | Severidad | Descripción | Sugerido |
|------|-----------|-------------|----------|
| **TD-01: Smoke D-06 induced-down skipeado** | P2 | No se validó qué hace el robot si `auth.bold.co` está caído (DNS down, 503). Probablemente hace retry y eventualmente falla con `bold_auth0_login_failed`, pero no está verificado. | Próximo standalone `bold-resilience-smokes` ejecutarlo con `/etc/hosts` o un proxy mock. |
| **TD-02: Smoke D-07 telemetry-trip skipeado** | P2 | Telemetría instrumentada (`inngest.send` con `pipeline_decision:bold_auth0_login_failed`) pero no se forzó el escenario para confirmar que el evento llegue al observability dashboard. | Idem TD-01 — verificar evento en `agent_observability_events`. |
| **TD-03: Counter de retries no scoped por workspace** | P3 | El robot tiene un counter en memoria que cuenta intentos de login fallidos para abortar después de N. El counter es global al proceso, no por `workspace_id`. Si dos workspaces fallan simultáneamente, comparten el budget. | Mover counter a Redis (clave `bold:auth_fail:{workspaceId}`) con TTL 5min. |
| **TD-04: Sin alerta de WhatsApp template para auth fail** | P2 | El operador no se entera de un fallo de auth de Bold hasta que mira el dashboard. Para algo tan crítico (sin Bold no hay link de pago, no hay venta), debería haber un template de alerta `bold_login_failed_alert` que llegue por WhatsApp al admin del workspace. | Crear template `agent_id='system-alerts'` `intent='bold_auth_failed'`. |
| **TD-05: Credenciales Bold sin cifrado en DB** | P1 (security) | Las credenciales de Bold se guardan en `workspace_settings.bold_credentials` como JSON plano. Si la tabla se leakea (RLS misconfig, debug dump), todas las creds quedan expuestas. | Cifrar con Vault o `pgcrypto` symmetric. Decifrar en el server action que invoca al robot. |
| **TD-06: Robot single-tenant** | P3 | El robot Railway corre como un solo proceso. Si dos workspaces piden checkout simultáneo, se serializan. Para volumen real (Somnio + GoDentist + futuros) hay que paralelizar. | Migrar a pool de browsers con `playwright.connect()` o multi-process worker. |

---

## Sources

- **CONTEXT.md** (D-01..D-07): `.planning/standalone/bold-auth0-migration/CONTEXT.md` (placeholder — el archivo quedó vacío post-discuss, las decisiones viven aquí + en commit messages).
- **RESEARCH.md** (pitfalls): mismo standalone (placeholder vacío — research vive en este LEARNINGS).
- **01-SUMMARY.md**: detalla Tasks 1+2 de Plan 01 (replace STEP 1+1.5 con Auth0 NUL flow + smoke checkpoint).
- **02-SUMMARY.md**: STEP 0 stale session clear (commit `2de017c`).
- **Commits en `main`**:
  - `fff8c69` docs(bold-auth0-migration): create 4 plans across 3 waves
  - `2de017c` fix(bold-robot): stale session clear en STEP 0 (Auth0 NUL fallback)
  - `dd660b5` fix(bold-robot): reemplazar STEP 1 + 1.5 con Auth0 NUL flow
  - `7be7b98` docs(bold-auth0-migration): plan 01 summary (Tasks 1+2 done, Task 3 checkpoint)
- **Smoke evidencia**: usuario reportó 2026-05-11 — UI button → modal → URL generada → BOLD checkout cargó con $10.000 + descripción "TEST post-auth0 fix". HEAD pre-LEARNINGS: `cb86e6e`.
- **CLAUDE.md Regla 1** (push a Vercel): Plan 04 Task 5 hace `git push origin main` después del commit final.
- **MEMORY entry recomendado** (a agregar en próxima sesión):
  > `[Bold Auth0 migration shipped 2026-05-11](bold_auth0_migration.md)` — Bold Comercio migró login a Auth0 NUL. Robot reescrito: STEP 0 limpia storageState stale, STEP 1 usa `waitForURL(screen=login-password)`, STEP 1.5 sin `frameLocator()`. Honeypot `input[name="username"]:visible` filter. Smoke mínimo PASS. D-06 induced-down + D-07 telemetry-trip diferidos como tech debt. Commits `fff8c69..<LEARNINGS-SHA>`.

---

## Notas de proceso GSD

- Plan 04 fue 100% docs (LEARNINGS + opcional docs/analysis sync + commit+push). Sin código de producción.
- `docs/analysis/04-estado-actual-plataforma.md` **NO existe** en este repo en 2026-05-11 (el directorio `docs/` no contiene `analysis/`). Task 4 quedó como NO-OP: nada que actualizar, nada que skipear con error. Documentado en el commit message.
- El working tree tiene cambios sin staging de **otros standalones** (godentist scraping, shopify, v3 tiempo entrega, voice-app, etc.). Plan 04 staging restringido SOLO a `.planning/standalone/bold-auth0-migration/LEARNINGS.md` + `.planning/standalone/bold-auth0-migration/04-SUMMARY.md`. No tocar el resto.
- Push a `origin/main` autorizado explícitamente por el usuario para Plan 04 Task 5.
