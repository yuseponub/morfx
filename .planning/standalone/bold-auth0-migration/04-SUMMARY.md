---
phase: standalone
plan: bold-auth0-migration / Plan 04
subsystem: bold-checkout-robot
tags: [bold, auth0, playwright, robot, scraping, payments]
requires: []
provides: [Auth0 NUL login flow for Bold Comercio robot, storageState stale clear, telemetry trip points]
affects: [src/app/actions/bold.ts]
tech_added:
  - Auth0 Universal Login (NUL) flow handlers
patterns:
  - storageState verification pre-reuse
  - honeypot visible filter (`input[name="username"]:visible`)
  - waitForURL on screen=login-password as gate (vs waitForSelector race)
  - No frameLocator for Auth0 NUL (DOM directo)
key_files_created:
  - .planning/standalone/bold-auth0-migration/LEARNINGS.md
  - .planning/standalone/bold-auth0-migration/04-SUMMARY.md
key_files_modified:
  - src/app/actions/bold.ts (STEP 0 + STEP 1 + STEP 1.5 reescritos en commits 2de017c, dd660b5 — pre-Plan 04)
decisions:
  - D-01..D-07 (locked in CONTEXT.md, aplicadas o explícitamente diferidas — ver LEARNINGS.md)
metrics:
  duration: "Plan 04 ~30min docs + commit + push"
  completed_date: "2026-05-11"
  smoke_outcome: "PASS (minimal smoke 2026-05-11, induced-down/telemetry-trip deferred)"
---

# Plan 04: LEARNINGS + Standalone Wrap-up Summary

## One-liner

Plan 04 cierra el standalone `bold-auth0-migration` documentando el aprendizaje en `LEARNINGS.md` (~175 líneas, en español, con TL;DR + 3 patterns + 5 anti-patrones + 5 indicadores de regresión + 6 ítems de deuda técnica + sources) y empujando todo a `origin/main`. El robot Bold quedó operativo (smoke mínimo aprobado por el usuario el 2026-05-11) con flujo Auth0 NUL completo reemplazando STEP 0 + STEP 1 + STEP 1.5.

## Tasks ejecutadas (Plan 04)

| Task | Tipo | Resultado |
|------|------|-----------|
| **Task 3** | auto | `LEARNINGS.md` escrito (175 líneas, español, ≥60 requeridas). Greps verificados: `Auth0 NUL`=14 (≥3), `honeypot`=7 (≥1), `storageState`=6 (≥1), `frameLocator`=4 (≥1, todos como anti-patrón), `inngest.send`=2 (≥1), `D-0[1-7]`=7 únicos (todos presentes). |
| **Task 4** | auto cond. | **SKIPEADO** — `docs/analysis/04-estado-actual-plataforma.md` no existe en este repo (el directorio `docs/` no contiene `analysis/`). No-op documentado en el commit body. |
| **Task 5** | auto | Commit final + `git push origin main` (autorizado explícitamente por el usuario para este Plan). |

## Commits del standalone (Plans 01–04)

Cronología completa, orden ascendente:

| SHA | Mensaje | Plan | Contenido |
|-----|---------|------|-----------|
| `fff8c69` | `docs(bold-auth0-migration): create 4 plans across 3 waves` | (preflight) | Crea 4 planes (Wave 0/1/2/3) + CONTEXT.md + RESEARCH.md |
| `2de017c` | `fix(bold-robot): stale session clear en STEP 0 (Auth0 NUL fallback)` | Plan 02 → consolidated to 01 | STEP 0 detecta redirect a `auth.bold.co/u/login` y limpia cookies stale |
| `dd660b5` | `fix(bold-robot): reemplazar STEP 1 + 1.5 con Auth0 NUL flow` | Plan 01 Task 1 | Helpers `auth0NulSubmitIdentifier` + `auth0NulSubmitPassword`, elimina `frameLocator`, honeypot guard, waitForURL transitions |
| `7be7b98` | `docs(bold-auth0-migration): plan 01 summary (Tasks 1+2 done, Task 3 checkpoint)` | Plan 01 SUMMARY | Documenta Tasks 1+2 + estado del checkpoint smoke |
| `<TBD>` | `docs(bold-auth0-migration): LEARNINGS + standalone shipped` | Plan 04 (este) | LEARNINGS.md + 04-SUMMARY.md |

**Conteo:** 5 commits totales en el chain bold-auth0-migration (incluyendo el preflight de planes y este final).

**Rango:** `fff8c69..<LEARNINGS-SHA>` (todos en branch `main`).

## Smoke E2E (Plan 01 Task 2 checkpoint)

- **Fecha:** 2026-05-11
- **Tipo:** minimal smoke (decidido por el usuario en lugar del smoke completo D-06+D-07)
- **Pasos ejecutados:**
  1. Usuario abrió UI sandbox/comercial → button "Generar link Bold"
  2. Modal abrió correctamente
  3. URL del checkout generada por el robot (Auth0 NUL flow: login → dashboard → POST /checkout)
  4. URL abierta → BOLD checkout cargó con **$10.000** + descripción **"TEST post-auth0 fix"**
- **Resultado:** PASS. Cadena end-to-end funcional contra el ambiente real de Bold.
- **HEAD SHA al momento del smoke:** `cb86e6e` (origin/main pre-LEARNINGS).
- **Smokes diferidos (tech debt — ver LEARNINGS § Deuda Técnica TD-01 + TD-02):**
  - D-06 induced-down: NO ejecutado (qué pasa si `auth.bold.co` cae).
  - D-07 telemetry-trip: NO ejecutado (no se forzó un fallo para verificar que el evento `pipeline_decision:bold_auth0_login_failed` llegue a `agent_observability_events`).

## Deuda técnica registrada (extracto de LEARNINGS)

| Ítem | Severidad | Descripción corta |
|------|-----------|-------------------|
| TD-01 | P2 | Smoke D-06 induced-down skipeado |
| TD-02 | P2 | Smoke D-07 telemetry-trip skipeado |
| TD-03 | P3 | Retry counter en memoria, no scoped por workspace_id |
| TD-04 | P2 | Sin alerta WhatsApp template para `bold_auth_failed` |
| TD-05 | **P1 (security)** | Credenciales Bold sin cifrar en `workspace_settings` |
| TD-06 | P3 | Robot single-tenant — paralelizar con pool de browsers |

**Recomendación:** abrir standalone `bold-resilience-smokes` para cubrir TD-01 + TD-02 antes de extender el robot a más workspaces.

## Decisiones locked (D-01..D-07)

Las 7 decisiones del CONTEXT.md están aplicadas o explícitamente diferidas. Ver LEARNINGS.md § "Decisiones lockeadas" para el detalle por ID. Resumen:

- **D-01..D-05:** aplicadas en código (commits `2de017c` + `dd660b5`).
- **D-06, D-07:** diferidas como tech debt (smokes adicionales no ejecutados — usuario decidió priorizar shipping del happy path).

## MEMORY.md update sugerido

Agregar a `~/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/MEMORY.md` bajo "Current State":

```markdown
- [Bold Auth0 migration shipped 2026-05-11](bold_auth0_migration.md) — Bold Comercio migró login a Auth0 Universal Login (NUL). Robot reescrito: STEP 0 limpia storageState stale, STEP 1 usa waitForURL(screen=login-password), STEP 1.5 sin frameLocator(). Honeypot input[name="username"]:visible filter. Smoke mínimo PASS (UI → modal → URL → BOLD checkout $10.000 + descripción correcta). D-06 induced-down + D-07 telemetry-trip diferidos. Commits fff8c69..<LEARNINGS-SHA>. Tech debt: TD-05 (creds sin cifrar, P1 security).
```

(El operador agrega manualmente; este Plan 04 NO escribe en MEMORY.md.)

## Self-Check

Verificación de claims después de escribir SUMMARY:

- [x] `LEARNINGS.md` creado en `.planning/standalone/bold-auth0-migration/` (175 líneas, español).
- [x] Greps requeridos: todos satisfechos (Auth0 NUL ≥3=14, honeypot ≥1=7, storageState ≥1=6, frameLocator ≥1=4, inngest.send ≥1=2, D-01..D-07 todos=7).
- [x] `04-SUMMARY.md` creado en este path.
- [x] `docs/analysis/04-estado-actual-plataforma.md` confirmado NO existente (directorio `docs/` sin `analysis/`) — Task 4 SKIPPED legítimamente, documentado en commit body.
- [x] Push autorizado por usuario para Plan 04 Task 5.

Self-check completado al hacer commit + push (`git rev-parse HEAD == git rev-parse origin/main`).
