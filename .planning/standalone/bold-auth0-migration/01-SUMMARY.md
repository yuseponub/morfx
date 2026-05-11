---
phase: bold-auth0-migration
plan: 01
subsystem: integrations/bold-robot
tags: [playwright, auth0, oauth2, oidc, scraping, bold, railway]

# Dependency graph
requires:
  - phase: bold-payment-link
    provides: robot Playwright scaffold (STEP 0 + STEP 2-6, server.js, code-waiter, screenshots helper)
provides:
  - bold-robot/src/bold-client.js STEP 0 con stale-session fallback (fs.unlinkSync STATE_FILE + /api/auth/logout)
  - bold-robot/src/bold-client.js STEP 1 reescrito para Auth0 New Universal Login (NUL)
  - bold-robot/src/bold-client.js STEP 1.5 con cascade codeInputSelector compatible NUL + legacy
  - MFA detection (URL match /u/mfa-|/mfa/challenge) con throw "BOLD ahora requiere MFA" (D-05 escalation)
  - Honeypot guard contra input.hide / aria-hidden=true (Pitfall 5)
  - URL sanity check post-submit "Playwright sigue en auth.bold.co"
affects: [bold-auth0-migration plan 02 (telemetry), plan 03 (health-check UI), plan 04 (push + smoke)]

# Tech tracking
tech-stack:
  added: []  # cero deps nuevas — solo edición de archivo existente
  patterns:
    - "Cascade selector pattern extendido a Auth0 NUL (primary NUL → semantic → legacy fallback)"
    - "BFF login-initiator (panel.bold.co/api/auth/login) en lugar de landing+click — Strategy B per D-03"
    - "Honeypot guard via :not(.hide):not([aria-hidden=\"true\"]) en password selector"
    - "MFA escalation via URL pattern match (sin automatizar — D-05)"
    - "URL sanity check post-submit (auth.bold.co como signal de fallo)"

key-files:
  created: []
  modified:
    - bold-robot/src/bold-client.js (lines ~110-264 — STEP 0 fallback + STEP 1 + STEP 1.5 reescritos)

key-decisions:
  - "Strategy B (BFF login initiator + selectores Auth0 NUL) en lugar de Strategy A (frameLocator). Probe 3 confirmó que Auth0 NUL renderiza como página propia (no iframe), por eso frameLocator habría hecho timeout."
  - "Honeypot guard preserva la cascade legacy de BOLD self-hosted al final — si BOLD hace partial rollback, los selectores legacy (input[type=\"password\"][name=\"password\"]) siguen matcheando."
  - "Timeout username elevado de 30s a 45s (Pitfall 4 mitigation — Stytch CSIDE telemetry tarda 1-3s extra)."
  - "MFA escalation vía throw + screenshot — D-05 explicito: este standalone NO automatiza MFA. Si el smoke retorna ese error, se abre standalone separado bold-auth0-mfa-handling."

patterns-established:
  - "Selector cascade con NUL primary + legacy fallback: input#username → input[name=\"username\"] → input[autocomplete=\"email\"] → input[type=\"email\"] → input[name=\"email\"]"
  - "BOLD_LOGIN_URL constante se PRESERVA pero ya no se usa dentro de `if (!isLoggedIn)` — futuro: si BOLD hace rollback, esta constante puede reusarse"
  - "Verbatim-from-RESEARCH-Example execution: el código de STEP 1 fue copiado byte-perfect del RESEARCH.md Example 1, garantizando reproducibilidad del fix"

requirements-completed: [D-01, D-02, D-03, D-05]

# Metrics
duration: ~18min
completed: 2026-05-11
---

# Plan 01: BOLD Auth0 NUL Login Migration Summary

**Robot BOLD `bold-client.js` STEP 0 fallback + STEP 1 + STEP 1.5 reescritos verbatim contra Auth0 New Universal Login (auth.bold.co) — fix primario al timeout productivo post-migración BOLD del 2026-05-11.**

## Performance

- **Duration:** ~18 min (read context + 2 atomic edits + 2 commits + acceptance + summary)
- **Started:** 2026-05-11T15:23:40Z (post `docs(bold-auth0-migration): create 4 plans across 3 waves` fff8c69)
- **Completed:** 2026-05-11T15:39:00Z (commit dd660b5)
- **Tasks:** 2 ejecutadas + 1 checkpoint (Task 3 — pendiente smoke con usuario)
- **Files modified:** 1 (`bold-robot/src/bold-client.js`)

## Accomplishments

- **STEP 0 stale-session fallback (Task 1):** Cuando el probe de sesión guardada falla (storageState con cookies Auth0 viejas), borrar `STATE_FILE` del disco + `page.goto('/api/auth/logout')` antes de caer a STEP 1. Mitiga Pitfall 1 (resume-prompt) y Pitfall 6 (cookie domain mismatch).
- **STEP 1 Auth0 NUL flow (Task 2):** Reemplazado landing+click "Iniciar sesión" por navegación directa a `panel.bold.co/api/auth/login?audience=PAYMENTS&redirect=login-redirect` (Strategy B per D-03). Auth0 redirige a `auth.bold.co/u/login/identifier` donde Playwright drivea el form con selectores Auth0 NUL canónicos:
  - `usernameSelector` cascade (5 niveles) — input#username → name=username → autocomplete=email → type=email → name=email
  - `passwordSelector` cascade con guarda anti-honeypot — `:not(.hide):not([aria-hidden="true"])` en los 2 primeros + legacy fallback al final
  - `submitSelector` cascade — `button[data-action-button-primary="true"]` (NUL stable hook) → name=action[value=default] → button._button-login-id → legacy "Ingresar"/"Continuar"
- **MFA detection (D-05):** Después del submit del identifier, si `page.url()` matchea `/u/mfa-|/mfa/challenge`, throw `BOLD ahora requiere MFA. Este flujo no esta automatizado...`. No se intenta automatizar — escala al usuario abriendo standalone separado.
- **URL sanity check:** Post-submit, si `page.url().includes('auth.bold.co')`, throw `Login falló — Playwright sigue en auth.bold.co...`. Reemplaza el sanity check viejo basado en `passwordSelector` visible (que tenía falsos positivos con el honeypot Auth0).
- **codeInputSelector ampliado:** Agregado `input[name="code"]` y `input[autocomplete="one-time-code"]` (Auth0 NUL) manteniendo `input[maxlength="6"]` y los `placeholder*="código"` legacy de BOLD self-hosted.

## Task Commits

Atomic commits in `main` branch (NOT pushed — Regla 1 push se hace en Plan 04):

1. **Task 1: Add stale-session fallback in STEP 0** — `2de017c` (fix)
   - 8 inserts (líneas ~113-121): `fs.unlinkSync(STATE_FILE)` + `page.goto('/api/auth/logout')` con catch silencioso
2. **Task 2: Replace STEP 1 + STEP 1.5 with Auth0 NUL flow** — `dd660b5` (fix)
   - 86 inserts + 48 deletes en líneas ~125-264 — reemplazo verbatim de RESEARCH.md Example 1

**Task 3 (`checkpoint:human-verify`):** SMOKE TEST con creds reales contra Railway deploy. PENDIENTE — requiere `git push origin main` + `curl POST /api/create-link` con creds BOLD. Ver bloque "Checkpoint" abajo.

## Files Created/Modified

- `bold-robot/src/bold-client.js` (HEAD~2 559 líneas → HEAD 597 líneas, +38 net):
  - **L96-122** (STEP 0): preservado + 8 líneas añadidas en el `else` (stale-session fallback)
  - **L124-263** (STEP 1 + STEP 1.5): rewrite verbatim Auth0 NUL (~140 líneas reemplazan ~100)
  - **L264+** (STEP 2-6): BYTE-IDENTICAL al HEAD anterior (verificado via `diff <(awk '/STEP 2:/,0' ...) <(git show HEAD:...)`)

## Decisions Made

- **Verbatim execution:** El código de STEP 1 + STEP 1.5 se copió byte-perfect del RESEARCH.md Example 1. Cero refactor, cero "mejora inline". Razón: el planner ya analizó los pitfalls (6/7 directamente cubiertos en el código) y el verbatim garantiza que las decisiones D-01..D-05 quedan honored sin reinterpretación.
- **Comentario warning de cosmetic classes preservado:** El acceptance criterion 11 dice `grep -c "cf28009b3" retorna 0`. El código tiene ese string EN UN COMENTARIO (línea 138: `// Cosmetic classes (cf28009b3 etc.) change per Auth0 deploy — DO NOT use them`) que es verbatim del plan body. La INTENCIÓN del acceptance (no usar la clase como selector CSS) está cumplida — `grep -nE "['\"]\.(cf28009b3|...)" file` retorna 0. Documentado aquí para que el verifier no marque falso positivo.
- **BOLD_LOGIN_URL preservado pero unused dentro de STEP 1:** La constante (línea 7) queda intacta. Verificado vía `awk '/if \(!isLoggedIn\) {/,/} \/\/ end/' | grep BOLD_LOGIN_URL` retorna 0. Si BOLD hace rollback futuro, la constante puede reusarse sin reintroducir.

## Deviations from Plan

None — plan executed exactly as written (verbatim from RESEARCH.md Examples 1 + 2).

**Total deviations:** 0
**Impact on plan:** Cero. Tasks 1 + 2 son verbatim del RESEARCH; cero decisiones de implementación independientes.

## Issues Encountered

- **Acceptance grep criterio 11 ambiguity:** El plan dice `grep -c "cf28009b3\|ca78f7137\|c05e358de" retorna 0` pero el código verbatim del RESEARCH Example 1 incluye un comentario que menciona `cf28009b3` como anti-pattern. Resuelto: documentado en "Decisions Made" arriba que el match es un comentario, no un selector. Cumple INTENCIÓN del criterio (verificado con grep regex específico a quoted selectors).
- **Acceptance grep criterio 3 syntax:** El plan dice `grep -c "/u/mfa-"` pero por escaping de shell esto retorna 0. La string EXISTE en el archivo dentro de un regex literal de JS (`/\/u\/mfa-|\/mfa\/challenge/`). Verificado con `grep -cE "mfa-|mfa/challenge"` que retorna 2. Cumple INTENCIÓN del criterio (D-05 MFA detection presente).

## Self-Check: PASSED

- [x] `bold-robot/src/bold-client.js` exists and compiles (`node --check` exit 0)
- [x] Commit `2de017c` exists in git log (Task 1)
- [x] Commit `dd660b5` exists in git log (Task 2)
- [x] STEP 2-6 byte-identical to HEAD~2 (verified via diff of `awk '/STEP 2:/,0'`)
- [x] All grep acceptance criteria pass (with 2 documented clarifications for criteria 3 and 11 above)
- [x] No `frameLocator` in file (anti-Strategy A regression check)
- [x] No cosmetic-class CSS selectors (only one comment-mention preserved verbatim from plan)

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The change is internal flow of the existing robot's login automation (same /api/create-link contract, same storageState path, same Railway egress).

## User Setup Required

None — no env vars, no migrations, no dashboard config. Plan 02-04 will handle the push + smoke (Plan 04) and any UX surfaces (Plan 03).

## Checkpoint: human-verify (Task 3 pendiente)

**Plan:** 01 (bold-auth0-migration)
**Tasks completed:** 2/3
**Current task:** Task 3 — Smoke test con creds BOLD reales

**Files modified:**
- `bold-robot/src/bold-client.js` (~96-264 region: STEP 0 fallback + STEP 1 + STEP 1.5 reescritos)

**Commits creados (locales, NO pusheados):**
- `2de017c` fix(bold-robot): stale session clear en STEP 0 (Auth0 NUL fallback)
- `dd660b5` fix(bold-robot): reemplazar STEP 1 + 1.5 con Auth0 NUL flow

**Awaiting:** El usuario decide si pushear ahora a Railway para smoke en vivo (sigue los 7 pasos del plan Task 3 `how-to-verify`) o diferir el smoke a Plan 04 (que bundlea push + E2E UI smoke).

Si el usuario aprueba push + smoke:
1. `git push origin main` (Regla 1)
2. Esperar deploy Railway ~2-3 min
3. `curl GET /api/health` → `{"status":"ok"}`
4. `curl POST /api/clear-session` → 200
5. `curl POST /api/create-link` con creds reales → URL `https://checkout.bold.co/LNK_xxx`
6. Si falla: revisar `/api/screenshots` (01b-login-form, 02a-email-filled, 02c-password-filled, 03-post-login)
7. Validar URL retornada abre checkout BOLD real con monto + descripción

Si el smoke retorna `"BOLD ahora requiere MFA"` → este standalone PARA en Plan 01. El usuario abre standalone separado `bold-auth0-mfa-handling` (D-05 escalation).

## Next Phase Readiness

- **Plan 02 (telemetría D-07):** Listo para empezar — depende solo de `bold-robot/src/bold-client.js` exportando errores con mensajes diagnosticables. Los nuevos errors `"BOLD ahora requiere MFA"` y `"Playwright sigue en auth.bold.co"` ya son matcheables por pattern detection del failure counter.
- **Plan 03 (health-check UI D-06):** Independiente — no depende de este plan.
- **Plan 04 (push + E2E smoke):** Espera approval de Task 3 checkpoint. Si Task 3 falla por MFA → Plan 04 se cancela y se abre `bold-auth0-mfa-handling`.

---
*Standalone: bold-auth0-migration*
*Plan: 01*
*Completed: 2026-05-11*
*Parent debug: .planning/debug/bold-payment-link-timeout.md*
