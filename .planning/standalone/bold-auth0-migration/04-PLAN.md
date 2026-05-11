---
phase: bold-auth0-migration
plan: 04
type: execute
wave: 3
depends_on: ["01", "02", "03"]
files_modified:
  - .planning/standalone/bold-auth0-migration/LEARNINGS.md
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false
requirements: [Regla 1, Regla 4, D-07 smoke]

must_haves:
  truths:
    - "git push origin main completado — Vercel auto-deploys Next.js (plans 02 + 03), Railway auto-deploys bold-robot (plan 01)"
    - "Smoke end-to-end PASS: curl POST /api/create-link contra robot prod retorna URL real de checkout.bold.co (D-02/D-03 verificado en runtime)"
    - "Visual verify D-06: con robot down (induced), el botón en UI queda disabled <90s después con tooltip correcto"
    - "Smoke D-07 telemetry: con creds inválidas x3, evento Inngest 'bold-robot/upstream-broken' aparece en dashboard + fila en agent_observability_events"
    - "LEARNINGS.md del standalone existe en .planning/standalone/bold-auth0-migration/ con: (a) Auth0 NUL selector hardness pattern (b) honeypot Pitfall 5 (c) stale storageState Pitfall 1 (d) cosmetic-classes anti-pattern (e) inngest.send await Pitfall 8"
    - "docs/analysis/04-estado-actual-plataforma.md actualizado si tiene sección BOLD (sino N/A registrado)"
  artifacts:
    - path: ".planning/standalone/bold-auth0-migration/LEARNINGS.md"
      provides: "Lecciones del standalone para reuso anti-regresión"
      min_lines: 60
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Updated BOLD module status (post-Auth0 migration)"
      contains: "Auth0"
  key_links:
    - from: "git push origin main"
      to: "Vercel + Railway"
      via: "auto-deploy webhooks"
      pattern: "vercel.app.*morfx|railway"
---

<objective>
Verificar end-to-end que los 3 planes anteriores entregan el outcome real (robot funciona contra BOLD post-Auth0, UX degrada gracefully, telemetría dispara), push a producción (Regla 1), y documentar lecciones (Regla 4) para que el próximo standalone que toque robots de scraping no repita los pitfalls que descubrimos.

Este plan es **manual + checkpoint-heavy** porque la verificación requiere credenciales reales BOLD que solo el user tiene + browser real para D-06 visual.

Output:
- `git push origin main` ejecutado, Vercel + Railway deploys green.
- Smoke pass real (no synthetic): URL BOLD generada + cargable.
- LEARNINGS.md commiteado.
- Doc estado-actual-plataforma.md actualizado si tiene sección BOLD.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bold-auth0-migration/CONTEXT.md
@.planning/standalone/bold-auth0-migration/RESEARCH.md
@.planning/standalone/bold-auth0-migration/01-PLAN.md
@.planning/standalone/bold-auth0-migration/02-PLAN.md
@.planning/standalone/bold-auth0-migration/03-PLAN.md
@CLAUDE.md
@docs/analysis/04-estado-actual-plataforma.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Verify all 3 prior plans committed + push to origin main</name>
  <read_first>
    - `git log --oneline -20` para confirmar que los commits de Plans 01/02/03 están presentes
    - `git status` para confirmar que no hay archivos sin commitear de los 3 planes
    - `CLAUDE.md` Regla 1 (push to Vercel + Railway after code changes)
    - `CLAUDE.md` Regla 5 (no aplica aquí — no hay migraciones de DB; `platform_config` ya existe en prod, usado por knowledge-sync-v4)
  </read_first>
  <files></files>
  <action>
    1. Correr `git status` — debe estar clean (todos los cambios de Plans 01/02/03 commiteados).
    2. Correr `git log --oneline -10` — verificar SHAs de los commits del standalone.
    3. Correr `git diff origin/main..HEAD --stat` — listar TODOS los archivos modificados que se van a pushear. Confirmar que la lista incluye:
       - `bold-robot/src/bold-client.js` (Plan 01)
       - `src/app/actions/bold.ts` (Plans 02 + 03 combined)
       - `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx` (Plan 02)
       - `src/lib/bold/client.ts` (Plan 03)
       - `src/inngest/functions/bold-upstream-broken.ts` (Plan 03 — new file)
       - `src/app/api/inngest/route.ts` (Plan 03)
    4. Correr `git push origin main`.
    5. Esperar ~3-5 min para que Railway + Vercel terminen sus deploys.
    6. Verificar Railway dashboard: bold-robot service deploy green.
    7. Verificar Vercel: deploy de morfx.app green.

    Reglas:
    - **NO ejecutar** `git push --force` ni amend. Si algún commit tiene problemas, hablar con el user.
    - **NO desplegar** desde el dashboard manualmente — los pushes son auto-trigger.
    - Si `git push` falla por conflicto remoto: PARAR y reportar al user (no `git pull --rebase` autónomo).
  </action>
  <acceptance_criteria>
    - `git status` retorna clean ("nothing to commit, working tree clean")
    - `git rev-parse HEAD` después del push = mismo SHA que `git rev-parse origin/main`
    - `curl -s https://morfx-production-9b7a.up.railway.app/api/health` retorna 200 + `{"status":"ok",...}` con timestamp post-push (la nueva versión del robot)
    - Vercel deploy log en el commit SHA pusheado muestra "Ready" (no failed)
  </acceptance_criteria>
  <verify>
    <automated>git status --porcelain | wc -l</automated>
  </verify>
  <done>Push pasó, ambos deploys green, robot /api/health responde OK.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: End-to-end smoke — UI flow generates real BOLD checkout URL</name>
  <what-built>
    Plans 01 + 02 + 03 ya desplegados a Vercel + Railway.
    - Plan 01: Robot Auth0 NUL aware (smoke ya pasó en wave 1).
    - Plan 02: Botón con health-poll + disabled state.
    - Plan 03: Failure counter + Inngest event.
  </what-built>
  <how-to-verify>
    **Smoke principal (UI flow):**

    1. User abre el dashboard de morfx.app, login como owner Somnio (workspace `a3843b3f-c337-4836-92b5-89c58bb98490` o el workspace con BOLD configurado).
    2. Ir a `/whatsapp`, abrir cualquier conversación.
    3. Confirmar visualmente: el botón "Cobrar con BOLD" aparece en el header (no oculto, no disabled, no tooltip de error).
    4. Click → modal abre con inputs monto + descripción.
    5. Llenar monto=10000, descripción="TEST post-auth0 fix", click "Generar link".
    6. Esperar 30-60s (Auth0 NUL flow + steps 2-6 del robot) → URL `https://checkout.bold.co/LNK_xxx` aparece en el modal.
    7. Click "Copiar" → verificar que el clipboard tiene la URL.
    8. Abrir la URL en una pestaña nueva → confirmar que carga el checkout REAL de BOLD con monto $10.000 y descripción "TEST post-auth0 fix".

    **Smoke D-06 (induced robot down):**

    9. Claude corre: `curl -X POST https://morfx-production-9b7a.up.railway.app/api/clear-session` para clear state.
    10. User cambia el password en `integrations` BOLD a uno INVÁLIDO temporalmente (SQL UPDATE manual, o vía UI de configuración).
    11. User intenta generar link → modal muestra error legible.
    12. Verificar visualmente en el header: el botón sigue habilitado por ahora (1 failure, counter at 1).

    **Smoke D-07 (telemetry trip):**

    13. User intenta generar link 2 veces más con creds inválidas → en el 3er intento (cumulative 3 failures), el counter alcanza 3.
    14. Claude verifica vía SQL (user provee acceso):
        ```sql
        SELECT * FROM agent_observability_events
        WHERE event_type='bold_robot_upstream_broken'
        ORDER BY created_at DESC LIMIT 1;
        ```
        Esperado: 1 fila con `payload` JSONB que contiene `consecutiveFailures: 3`, `lastErrorMessage` (string), `detectedAt` (ISO).
    15. Claude verifica:
        ```sql
        SELECT value FROM platform_config WHERE key='bold_robot_failure_count';
        ```
        Esperado: `0` (reset post-fire).
    16. Claude verifica en Inngest dashboard (user da link / screenshot): el run de `bold-upstream-broken` aparece en estado "completed".

    **Smoke D-06 recovery:**

    17. User restaura las creds válidas en `integrations`.
    18. User intenta generar link → debería funcionar.
    19. Esperar hasta 90s (60s poll + 30s server cache TTL) y refresh página → botón sigue habilitado.

    **Si todo lo anterior pasa → APPROVE.**

    **Si la URL del paso 8 no abre el checkout real o muestra error de BOLD:** revisar `/api/screenshots` del robot — el cambio de Plan 01 puede tener un edge case que requiere fix iterativo.

    **Si el evento Inngest del paso 14 no dispara:** revisar logs de Vercel para `recordFailureAndMaybeAlert` errors. La firma de error debe matchear uno de los `REGRESSION_SIGNATURES` (incluye "credenciales incorrectas" si el robot lanza ese mensaje? Verificar — si no, agregar el regex en Plan 03 follow-up).
  </how-to-verify>
  <resume-signal>Type "approved" if all 19 steps pass, "partial" with specifics if some pass + some fail, or describe blockers.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Write LEARNINGS.md for the standalone</name>
  <read_first>
    - `.planning/standalone/bold-auth0-migration/CONTEXT.md` (decisiones D-01..D-07)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Common Pitfalls" (lines 442-540)
    - Para template: `.planning/standalone/agent-godentist-fb-ig/LEARNINGS.md` (si existe — patrón de LEARNINGS reusables)
    - O cualquier `.planning/standalone/*/LEARNINGS.md` existente en sibling shipped standalones
  </read_first>
  <files>.planning/standalone/bold-auth0-migration/LEARNINGS.md</files>
  <action>
    Crear `.planning/standalone/bold-auth0-migration/LEARNINGS.md` con la siguiente estructura (en español, en línea con el resto del proyecto):

    ```markdown
    # LEARNINGS — bold-auth0-migration

    **Shipped:** 2026-05-11 (o fecha real cuando se hace el push)
    **Trigger:** BOLD migró `panel.bold.co` login de form self-hosted a Auth0 New Universal Login entre 2026-05-10 y 2026-05-11. El robot dejó de funcionar — los 6 selectores email del cascade no matchearon el nuevo widget.
    **Root cause documentado en:** `.planning/debug/bold-payment-link-timeout.md`
    **Research evidence:** `.planning/standalone/bold-auth0-migration/RESEARCH.md` (probes 1-4 + 7 code examples).

    ## TL;DR

    - El fix fue Strategy B verbatim de RESEARCH (D-03 + Example 1): navegación directa al BFF `panel.bold.co/api/auth/login` + selectores Auth0 NUL canónicos.
    - 4 plans, 3 waves. Plan 01 (login fix) shipped solo restauró el robot a working order. Plans 02 (D-06 UX) y 03 (D-07 telemetry) son defensa-en-profundidad.
    - 0 nuevas dependencias, 0 migraciones DB, 0 env vars nuevas.

    ## Patrones que funcionaron

    ### 1. Selector cascade Auth0 NUL primary + legacy fallback
    Pattern reusable para cualquier robot que driveee un Auth0 form:
    ```
    [id="..." selector, name="..." selector, autocomplete="..." selector, legacy[type=...] fallback]
    ```
    Stable Auth0 hooks: `id="username"`, `id="password"`, `name="action"`, `data-action-button-primary="true"`, `_form-login-id`, `_button-login-id` classes.
    **NUNCA** usar las cosmetic classes (`cf28009b3`, `ca78f7137`, `c05e358de`) — cambian en cada deploy de Auth0.

    ### 2. Honeypot guard en el selector de password
    Auth0 NUL identifier page contiene `<input class="hide" type="password" aria-hidden="true">` como bot-trap. Restringir el selector:
    ```
    input#password:not(.hide):not([aria-hidden="true"])
    ```
    Sin este filtro, naive `input[type="password"]` matchea el honeypot y Auth0 flaggea como sospechoso.

    ### 3. Stale storageState = clear file + logout BFF
    Cuando el robot trae cookies pre-migración, Auth0 muestra "resume session" UI en vez del form fresh. Solución:
    1. `fs.unlinkSync(STATE_FILE)` para borrar el storageState local.
    2. `page.goto('https://panel.bold.co/api/auth/logout')` para clear las SSO cookies en `.bold.co`.
    Después navegar al BFF login limpio.

    ### 4. URL sanity check post-submit
    Después de submit password, verificar `page.url().includes('auth.bold.co')`. Si SÍ, el login falló (Auth0 mostró error pero el page no transitionó). Tirar error específico, no genérico.

    ### 5. unstable_cache para health-checks server-side
    El botón polleó cada 60s desde el cliente, pero el server action `checkBoldRobotHealth` está envuelto en `unstable_cache(..., { revalidate: 30 })`. Resultado: 1 request al robot cada 30s sin importar cuántos operators tengan /whatsapp abierto. Patrón reusable para cualquier health-check UI.

    ### 6. platform_config como counter distribuido simple
    En vez de Redis o tabla nueva, reusamos `platform_config` (singleton key-value JSONB ya existente, usado por knowledge-sync-v4). El counter `bold_robot_failure_count` se incrementa/resetea con `upsert + onConflict: 'key'`. Para contadores con baja cardinalidad (global, single-tenant, no por-workspace), evita migration.

    ### 7. await (inngest.send as any) — siempre awaited
    En Vercel serverless, `inngest.send` sin await se pierde porque la lambda termina antes de la network roundtrip. El cast `as any` es necesario por TS estricto (event names custom). Pattern establecido del codebase (`comandos.ts:419`).

    ## Pitfalls que evitamos (anti-regresión)

    1. **No usar `page.frameLocator`** — el form NO está en iframe. Strategy A fue invalidada por probe 3.
    2. **No hardcodear `https://auth.bold.co/u/login/identifier`** — Auth0 puede cambiar el path bajo `/u/...`.
    3. **No llenar el honeypot** — `input.hide[aria-hidden]` en la identifier page.
    4. **No usar cosmetic classes** — hash-based, cambian per Auth0 deploy.
    5. **No fire-and-forget `inngest.send`** — Vercel termina la lambda.
    6. **No intentar automatizar MFA** — escalar al user (D-05).
    7. **No pursuir Strategy C (RoPC)** — client_secret no disponible para SPA client (Pitfall 10).

    ## Decisiones aplicadas

    | D-XX | Lo que dijo | Cómo se aplicó |
    |------|-------------|----------------|
    | D-01 | Probes antes de tocar código | 4 probes ejecutados en RESEARCH (screenshots + auth.bold.co OIDC + BFF redirect chain + flow detection) |
    | D-02 | Strategy A primaria (frameLocator) | INVALIDADA — probe 3 confirmó top-level nav, no iframe |
    | D-03 | Strategy B fallback (direct nav + new selectors) | **PROMOVIDA A PRIMARIA** — implementada verbatim en Plan 01 |
    | D-04 | Strategy C (RoPC) deferred | Bloqueada por Pitfall 10 — client_secret missing. Documentada como contingency en RESEARCH §"Example 7" |
    | D-05 | MFA = escalación inmediata | Plan 01 throw `"BOLD ahora requiere MFA"` cuando detecta `/u/mfa-...` o `/mfa/challenge` |
    | D-06 | Botón disabled cuando robot down | Plan 02 — `checkBoldRobotHealth` + polling 60s + tooltip "Temporalmente no disponible" |
    | D-07 | Telemetría: 3 fallos consecutivos → alert | Plan 03 — counter en `platform_config` + Inngest event + `agent_observability_events` |

    ## Tech debt aceptado (registrado para futuro)

    1. **Counter global, no por-workspace** (Open Question 3 en RESEARCH) — si en el futuro se soporta multi-account BOLD, refactor a counter por workspace.
    2. **No WhatsApp template alert** — Plan 03 deja TODO comment en `boldUpstreamBroken`. El user puede agregar follow-up cuando defina template `bold_robot_alert`.
    3. **Strategy C archive** — RESEARCH Example 7 documenta el shape de RoPC. Re-evaluar SI BOLD ofrece un confidential client (señal: aprobación comercial para API oficial llega).
    4. **No encriptación de creds** (heredado del standalone padre `bold-payment-link` deuda P2).
    5. **Robot single-tenant** — un `BOLD_ROBOT_URL` global; multi-tenant requiere routing per-workspace o un robot per workspace.

    ## Indicadores para detectar regresión próxima vez

    Si el robot vuelve a romper, los primeros tres lugares a mirar:
    1. **Screenshots `/api/screenshots`** — específicamente `01b-login-form.png` y `02b-password-page.png`. Si el DOM cambió → BOLD actualizó Auth0 NUL o regreó.
    2. **`platform_config.bold_robot_failure_count`** — si está creciendo rápido = upstream cambió.
    3. **`agent_observability_events.event_type='bold_robot_upstream_broken'`** — payload tiene `lastErrorMessage` que indica el step que rompió.

    ## Sources usados durante research

    - Live HTML de `auth.bold.co/u/login/identifier` (probe 3 — verbatim DOM capture)
    - Auth0 OIDC discovery `auth.bold.co/.well-known/openid-configuration`
    - BFF redirect chain trace `panel.bold.co/api/auth/login → /authorize → /u/login/identifier`
    - Screenshots Railway pre/post migración del robot
    - Auth0 NUL public docs (selector stability contract)
    ```

    Reglas:
    - El archivo debe estar en español (consistente con el resto del proyecto).
    - **NO añadir** secrets ni credenciales BOLD reales.
    - Si hay UAT con un screenshot del checkout BOLD funcionando, mencionarlo (sin pegar la URL real con ID de pago).
  </action>
  <acceptance_criteria>
    - `.planning/standalone/bold-auth0-migration/LEARNINGS.md` existe
    - `wc -l .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥60
    - `grep -c "Auth0 NUL" .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥3
    - `grep -c "honeypot" .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥1
    - `grep -c "storageState" .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥1
    - `grep -c "frameLocator" .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥1 (mencionado como anti-pattern)
    - `grep -c "inngest.send" .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥1
    - `grep -c "D-0[1-7]" .planning/standalone/bold-auth0-migration/LEARNINGS.md` retorna ≥7 (todas las decisiones referenciadas)
  </acceptance_criteria>
  <verify>
    <automated>test -f .planning/standalone/bold-auth0-migration/LEARNINGS.md && wc -l .planning/standalone/bold-auth0-migration/LEARNINGS.md</automated>
  </verify>
  <done>LEARNINGS.md creado, todos los grep pasan, contenido en español consistente.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Update docs/analysis/04-estado-actual-plataforma.md if BOLD section exists</name>
  <read_first>
    - `docs/analysis/04-estado-actual-plataforma.md` (full file — check si tiene sección "BOLD" / "Pagos" / "Pagos en línea" / "Integraciones")
    - `CLAUDE.md` Regla 4 (docs siempre actualizadas)
  </read_first>
  <files>docs/analysis/04-estado-actual-plataforma.md</files>
  <action>
    Inspeccionar `docs/analysis/04-estado-actual-plataforma.md`:

    **Si tiene sección BOLD / Pagos / Integraciones que mencione el robot:**
    - Actualizar status: del "BROKEN — Auth0 migration" (si así estaba) a "WORKING — Auth0 NUL aware as of 2026-05-11"
    - Mencionar que ahora hay D-06 health-check UX + D-07 telemetría reactiva
    - Eliminar items de deuda técnica que este standalone resolvió (la migración rota como P0)
    - Agregar items nuevos a deuda técnica si surgieron (counter no-workspace-scoped, no WhatsApp alert)

    **Si NO tiene sección BOLD:**
    - Documentar en el commit message que no hubo cambio aplicable (Regla 4 cumplida porque no había nada que sincronizar).
    - Salir de este task sin modificar el archivo.

    **Si el archivo NO existe:**
    - Reportar — no es bloqueante para este standalone (Regla 4 menciona el archivo pero no es prerequisite).
    - Salir sin tocar nada.

    Reglas:
    - **NO crear** el archivo si no existe — Regla 4 dice "actualizar si afecta", no "crear si no existe".
    - **NO inventar** una sección BOLD si no había — sería trabajo fuera de scope.
    - Si el archivo tiene una tabla "Estado por módulo" o similar, actualizar la fila BOLD/Pagos con el nuevo status.
  </action>
  <acceptance_criteria>
    - Si BOLD section existe: `grep -c "Auth0" docs/analysis/04-estado-actual-plataforma.md` retorna ≥1 (mencionado el fix)
    - Si BOLD section NO existe: el archivo está unmodified (git diff vacío para este file)
    - El task NO crea el archivo si no existe (no `Write` call si no existe)
  </acceptance_criteria>
  <verify>
    <automated>test -f docs/analysis/04-estado-actual-plataforma.md && grep -q -i "bold\|pago" docs/analysis/04-estado-actual-plataforma.md && echo "BOLD section may exist, manual review" || echo "no BOLD section or file missing — skip"</automated>
  </verify>
  <done>Doc actualizado si aplica, o documentado en commit que no aplica.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Final commit (LEARNINGS + docs if updated) and push</name>
  <read_first>
    - `git status` — confirmar que LEARNINGS.md está unstaged
    - `git log --oneline -5` — para inspirar el mensaje de commit en estilo del proyecto
  </read_first>
  <files></files>
  <action>
    1. `git add .planning/standalone/bold-auth0-migration/LEARNINGS.md`
    2. Si docs/analysis/04-estado-actual-plataforma.md cambió: `git add docs/analysis/04-estado-actual-plataforma.md`
    3. `git commit -m "docs(bold-auth0-migration): LEARNINGS + estado-actual sync"` (o equivalente en estilo del proyecto). Mensaje en español, ≤72 chars título, body con bullets de qué se cubrió.
    4. `git push origin main`
    5. Confirmar push exitoso.

    Reglas:
    - **NO usar** `git add -A` ni `git add .` — solo los archivos específicos.
    - El commit puede tener Co-Authored-By Claude per CLAUDE.md convention.
    - NO incluir secrets BOLD en el commit/LEARNINGS.
  </action>
  <acceptance_criteria>
    - `git log --oneline -1` muestra el commit con prefijo `docs(bold-auth0-migration)`
    - `git rev-parse HEAD` == `git rev-parse origin/main` (pushed)
    - `git status` clean
  </acceptance_criteria>
  <verify>
    <automated>git log --oneline -1 | grep -c "bold-auth0-migration"</automated>
  </verify>
  <done>Commit creado, pusheado, working tree clean.</done>
</task>

</tasks>

<verification>
- `git status` clean
- `git rev-parse HEAD == git rev-parse origin/main`
- Smoke E2E del Task 2 PASS aprobado por user
- LEARNINGS.md existe y pasa greps
- docs/analysis actualizado o documentado como no-aplicable
- Robot devuelve URL real, botón degrada gracefully cuando robot down, Inngest event dispara a los 3 fallos consecutivos
</verification>

<success_criteria>
El standalone `bold-auth0-migration` está SHIPPED:
1. Robot BOLD funciona en producción post-Auth0 migration.
2. UX degrada gracefully via D-06 health-check.
3. Telemetría D-07 catch upstream regressions <5min después del primer fallo (vs 24h pre-fix).
4. Lecciones documentadas para próximos robots de scraping.
5. Push a `origin main` confirmado, Vercel + Railway deploys green.
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/bold-auth0-migration/04-SUMMARY.md` con:
- SHAs de los commits del standalone completo
- Smoke E2E resultado (URL ejemplo del checkout, screenshot si user la provee)
- Inngest run ID del smoke D-07 (si se hizo)
- Cualquier follow-up de tech debt registrado
- Actualizar MEMORY.md del usuario (si memory pointer existe) con bullet del shipped
</output>
