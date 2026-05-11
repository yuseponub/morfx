# BOLD Auth0 Migration — Standalone

**Gathered:** 2026-05-11
**Status:** Ready for research
**Parent standalone:** `bold-payment-link` (shipped — robot Playwright + integración Next.js)
**Debug session:** `.planning/debug/bold-payment-link-timeout.md`

<domain>
## Phase Boundary

**Restaurar la generación de links de pago BOLD tras la migración upstream a Auth0 Universal Login (2026-05-11).** El robot `bold-robot/src/bold-client.js` rompió porque BOLD movió el login form de `panel.bold.co` (form self-hosted) a `auth.bold.co` (Auth0 OAuth2/OIDC + posible Stytch). Los 6 selectores de email del robot ya no matchean el nuevo widget Auth0.

**Out of scope (clarificación explícita):**
- D-1, D-2, D-3, D-4, D-7 del standalone original `bold-payment-link` permanecen lockeados (ubicación botón, sin imagen, output URL+copiar, creds en `integrations`, Railway aislado).
- NO se cambia la API pública del robot (`POST /api/create-link` con `{ username, password, amount, description }`).
- NO se toca el integration UI `/configuracion/integraciones` tab BOLD.
- NO se decide migración a API oficial BOLD hoy — punteado a backlog.

</domain>

<decisions>
## Implementation Decisions

### Investigación Previa (D-01)
- **D-01:** ANTES de tocar código, ejecutar 3 probes (todos sin acción del usuario):
  1. `curl https://<bold-robot-railway>/api/screenshots` para enumerar screenshots del último fallo. Buscar `01b-login-form*.png` que captura el DOM real cuando Playwright timeouted.
  2. `curl -s https://panel.bold.co/auth/iniciar-sesion` para inspeccionar el HTML servido (probable SPA shell que hidrata Auth0 widget client-side).
  3. `curl -s https://auth.bold.co/authorize?client_id=<discover-from-chunk>&response_type=code&redirect_uri=...` con params válidos para ver si Auth0 monta el form en iframe o como página propia.
- **Why:** Confirmar si Auth0 está en iframe (`page.frameLocator()` requerido) vs página propia (`page.locator()` con selectores nuevos), y si BOLD activó MFA/passwordless (Stytch whitelisted en CSP sugiere posibilidad).
- **How to apply:** Plan 00 RESEARCH del próximo `/gsd-research-phase` debe ejecutar estos probes y documentar findings antes de elegir estrategia técnica.

### Estrategia Técnica del Fix (D-02..D-04)
- **D-02:** **Strategy A primaria — `page.frameLocator('iframe[src*="auth0"], iframe[src*="auth.bold.co"]').locator(emailSelector)`** si el widget Auth0 se monta dentro de iframe (CSP `frame-src *.auth0.com *.auth.bold.co` lo permite).
- **D-03:** **Strategy B fallback — navegación directa a `https://panel.bold.co/auth/iniciar-sesion`** bypaseando el landing + click "Iniciar sesión" (constante JS `LOGIN:"/auth/iniciar-sesion"` confirmada). Combinado con selectores ampliados para Auth0 Lock/Universal Login (`input.auth0-lock-input`, `input[name="email"]` con loader async, `[data-auth0]` attributes).
- **D-04:** **Strategy C deferred — migrar a OAuth2 Resource Owner Password Credentials grant directamente contra `auth.bold.co/oauth/token`**. Solo se considera si A+B fallan y se descubre que `client_id` BOLD está expuesto en JS chunks. Elimina Playwright para login (no para el resto del flow).
- **Why:** Cascade A→B→C minimiza superficie de cambio. A es el fix más barato (1-2 líneas). B es el siguiente nivel (cambia STEP 1 entero). C es rewrite del login pero conserva STEP 2-6.
- **How to apply:** Researcher prueba A primero. Si headless probe confirma iframe Auth0, planner escribe Plan 01 con frameLocator únicamente. Si no, planner escribe Plan 01 con B + opcional Plan 02 con C como contingencia.

### Manejo de MFA/Passwordless Auth0 (D-05)
- **D-05:** Si Auth0 activó MFA obligatorio o passwordless (magic link / SMS code via Stytch), **escalar al usuario INMEDIATAMENTE** — no intentar automatizarlo en este standalone.
- **Why:** El standalone padre D-5 decía "sin 2FA confirmado por usuario". Auth0 default es MFA optional/required según tenant config. El codeWaiter actual (`code-waiter.js`) maneja el código SMS de BOLD self-hosted, pero el widget Auth0 puede usar formato diferente (TOTP, email link, Stytch passcode).
- **How to apply:** Researcher debe probar login manual via curl con creds REALES (las que tiene el robot) y reportar si Auth0 retorna MFA challenge. Si lo retorna, este standalone PARA y abre nuevo standalone `bold-auth0-mfa-handling` con discusión del usuario.

### Triage UX Mientras Está Roto (D-06)
- **D-06:** Cuando el robot retorna error de login (cualquier error 5xx o timeout del endpoint `/api/create-link`), el botón "Cobrar con BOLD" muestra **tooltip "Temporalmente no disponible — BOLD actualizando login"** y queda **disabled visualmente** (opacity 0.5 + cursor not-allowed).
- **Why:** Sin esto, cada operador que intente generar link verá toast "Error al generar link" sin contexto → reportes recurrentes al usuario. Patrón estándar de degradación graceful.
- **How to apply:** Plan implementa health-check del robot: server action `checkBoldRobotHealth()` que hace `GET <robot>/api/health` cada 5min con stale-while-revalidate. UI lee el flag y deshabilita botón si robot down O si último intento falló <60s atrás. Cero acción del operador necesaria — es defensa pasiva.

### Telemetría / Detección Temprana (D-07)
- **D-07:** Cuando el robot falla 3+ veces consecutivas con error que matchea pattern `Timeout.*waiting for locator|Login falló` (sintoma de cambio upstream BOLD), emit evento Inngest `bold-robot/upstream-broken` que envía notificación al usuario via WhatsApp template + log a `agent_observability_events`.
- **Why:** Hoy el usuario se enteró por reporte de cliente. Telemetría reactiva = enterarse <5min después del primer fallo, no 24h después.
- **How to apply:** Plan implementa contador en Redis (o tabla `bold_robot_failures`) con TTL 10min. Server action que dispara el robot incrementa contador en fallo y resetea en éxito. >= 3 consecutivos → fire Inngest event. Plan separado si esto resulta >2 horas de trabajo.

### Claude's Discretion
- Versión exacta del selector Auth0 (`.auth0-lock-input` vs `[data-test="email-input"]` etc.) — researcher decide via probe del DOM real.
- Timeout exacto para Auth0 widget (probablemente 45s vs 30s actual — el widget tarda en montar).
- Si el codeWaiter actual se modifica vs se crea un `auth0-code-waiter.js` separado — planner decide según overlap real del flow.
- Si el health-check (D-06) usa `revalidatePath` en server action o un endpoint dedicado — implementador decide.
- Si el contador de fallos (D-07) usa Redis Upstash (ya disponible) o tabla nueva en Supabase — researcher decide según cardinalidad esperada.

### Folded Todos
None — esta es regresión productiva urgente, no había todos relacionados en backlog.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Debug session (origen de root cause)
- `.planning/debug/bold-payment-link-timeout.md` — Root cause documentado con 8 evidence entries: Auth0 fingerprints en headers, CSP whitelist `*.auth0.com` + `*.stytch.com`, constante JS `LOGIN:"/auth/iniciar-sesion"`, OAuth2 error `Missing required parameter: response_type`. Eliminated hypotheses H2, H3, H4, H5, H6.

### Standalone padre (decisiones lockeadas que NO se tocan)
- `.planning/standalone/bold-payment-link/CONTEXT.md` — D-1..D-8 originales (botón, sin imagen, output, creds, Railway aislado).
- `.planning/standalone/bold-payment-link/01-PLAN.md` — Plan original del robot.
- `.planning/standalone/bold-payment-link/02-PLAN.md` — Plan original integración Next.js.
- `.planning/standalone/bold-payment-link/bold-02-SUMMARY.md` — SUMMARY del Plan 02.

### Código del robot a modificar
- `bold-robot/src/bold-client.js` — 552 líneas. Funciones clave:
  - L7-9 constantes URL (`BOLD_LOGIN_URL`, `BOLD_NUEVO_LINK_URL`)
  - L11-12 STATE_FILE para storageState persistido
  - L29-516 `createPaymentLink({ username, password, amount, description, imageUrl })`
  - L96-216 STEP 0 (saved session probe) + STEP 1 (login form) + STEP 1.5 (code waiter)
  - L134-142 los 6 selectores email que ya no matchean (LOCUS DEL FIX)
  - L167-190 codeWaiter para MFA via SMS (revisar si Auth0 lo invalida)
- `bold-robot/src/code-waiter.js` — Mecánica `startWaiting(timeout)` + `/api/submit-code` endpoint
- `bold-robot/src/screenshots.js` — Helper `saveScreenshot(page, name)` (no cambia)
- `bold-robot/server.js` — Express routes (`/api/health`, `/api/create-link`, `/api/screenshots`)
- `bold-robot/Dockerfile` — `mcr.microsoft.com/playwright:v1.58.2-noble` (verificar si requiere bump por Playwright iframe API)

### Código Next.js relevante (referencia, no se modifica salvo D-06)
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` — Botón "Cobrar con BOLD" (D-06 health-check disable lives here)
- Server action que invoca el robot — buscar grep `bold-robot` en `src/app/actions/` durante research

### Reglas del proyecto
- `CLAUDE.md` Regla 1 (push a Vercel post-cambios), Regla 4 (docs actualizadas), Regla 6 (proteger agente prod = NO aplica a robots de scraping, pero proteger UX del usuario sí).
- `.claude/rules/code-changes.md` — Plan GSD aprobado antes de tocar código.
- `.claude/rules/agent-scope.md` — N/A (robots no son agentes AI).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **storageState persistido (L11-12, L53-62, L207-215):** El robot ya guarda y reusa session state en volumen Railway. **Esto puede ser nuestro ace-in-the-hole** — si la sesión guardada del último login exitoso (pre-Auth0-migration) sigue válida del lado servidor de BOLD, el robot sigue funcionando hasta que esa sesión expire. Researcher debe `curl <robot>/api/health` Y verificar si el último `/api/create-link` exitoso fue post-migration o pre.
- **Cascade de selectores (patrón establecido):** L134-142 (6 variantes email), L262-263 (5 variantes monto), L138-139 (4 variantes botón Continuar), L339-341 (5 variantes descripción). Patrón "máximo recall, mínimo riesgo de regresión" = aplicar mismo enfoque a Auth0 widget.
- **Estrategias en cascada para extracción URL (L443-496):** 5 estrategias A→B→C→D→E para sacar el checkout URL post-link-creation. **Mismo patrón aplicable al login Auth0** — probar frameLocator primero, fallback a page.locator, fallback a evaluateHandle wildcard.
- **dismissNpsPopup (L522-549):** Helper que limpia popups del panel BOLD. Reusable si Auth0 muestra cookies-banner / consent dialog antes del form.
- **Screenshots debug en cada step (L120, 132, 144, 152, etc.):** `saveScreenshot(page, '01b-login-form')` ya captura el estado al timeout. **Esta es la evidencia primaria que researcher debe extraer** via `/api/screenshots` endpoint.

### Established Patterns
- **Login 2-step (L134-152):** Email → Ingresar → Password → Ingresar. Auth0 puede preservar este patrón o colapsar a single-step. Researcher determina cuál.
- **Code challenge handling (L167-190):** El robot ya maneja 6-digit code via codeWaiter API. **Critical:** verificar si el widget Auth0 usa misma forma de input (`input[maxlength="6"]`) o widget specialized.
- **STATE_DIR mount en Railway:** El volumen persistente al `/app/state` es esencial. Cualquier cambio NO debe romper este path.

### Integration Points
- **Server action existente que invoca robot** (research lo encuentra) — debe seguir invocando `POST <robot>/api/create-link` sin cambio de contrato.
- **Tabla `integrations` con `type='bold'`** — sin cambio de schema.
- **WhatsApp template / mensaje al cliente** — sin cambio.

</code_context>

<specifics>
## Specific Ideas

- **User-provided guidance (literal):** "puedes decidir tu? lo que menos me involucre a mí" → Claude's Discretion ON para detalles técnicos. User solo se involucra si Auth0 MFA bloquea (D-05 escalation) o si las creds en `integrations` están desactualizadas.
- **Path de mínima fricción priorizado:** Cualquier decisión que requiera login manual del usuario, screenshots manuales, o approval comercial = diferida a backlog o escalada explícita.

</specifics>

<deferred>
## Deferred Ideas

- **Migrar robot a API oficial BOLD** (`POST /online/link/v1`): Requiere aprobación comercial humana de BOLD que no llegó después de varios días en el standalone original. Postura: punteado a backlog hasta que (a) BOLD apruebe vía soporte, o (b) el robot rompa 3+ veces en 30 días (señal de fragilidad insostenible). Re-evaluar 2026-06-11.
- **Encriptar credenciales BOLD** (deuda técnica P2 heredada del standalone original).
- **Webhook de pago confirmado de BOLD** (out of scope desde standalone padre).
- **Persistir links generados en BD** (out of scope desde standalone padre).
- **Sesión BOLD multi-tenant** (cada workspace con sus propias creds — actualmente single-tenant per integration row, que ya soporta multi-workspace by design).

### Reviewed Todos (not folded)
None — no había todos relacionados con BOLD en el backlog antes de este standalone.

</deferred>

---

*Standalone: bold-auth0-migration*
*Context gathered: 2026-05-11*
*Parent: bold-payment-link (shipped)*
*Debug origin: .planning/debug/bold-payment-link-timeout.md*
