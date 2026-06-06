---
phase: ui-redesign-editorial-shell
plan: 05
subsystem: ui
tags: [css, editorial, theme, dark-mode, regla-6, next-themes, oklch]

# Dependency graph
requires:
  - phase: ui-redesign-editorial-shell-01
    provides: sidebar v3 branch (Opción B, scope theme-editorial-v3 en el <aside>)
  - phase: ui-redesign-editorial-shell-02
    provides: ThemeToggle en los 3 topbars v3 (Conversaciones/Contactos/Pedidos)
  - phase: ui-redesign-editorial-shell-03
    provides: mobile-nav v3 + mount v3-only md:hidden en el dashboard (D-05b)
  - phase: ui-redesign-editorial-shell-04
    provides: auditoría dark D-06 + override --accent-indigo
provides:
  - Gate estático final Regla 6 (D-09) — 10/10 invariantes OK documentados en REGLA6-GATE.md
  - Documentación de activación per-workspace (D-08/D-01) en ACTIVATION.md, sin migración, paso manual post-QA
  - Push a origin/main de toda la fase (Waves 0-4) — Vercel desplegado, flag default-OFF
affects: [ui-redesign-editorial-core, future-editorial-siblings, regla-6-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate estático Regla 6: byte-frozen via git diff <base> HEAD + grep/proximidad sobre estado final"
    - "Activación documentada como paso manual post-QA (decisión de negocio, NO auto-ejecutada)"

key-files:
  created:
    - .planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md
    - .planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md
  modified: []

key-decisions:
  - "D-01: mismo flag ui_editorial_v3 que el core, sin migración (sub-key JSONB en workspaces.settings)"
  - "D-08: activación per-workspace es paso manual post-QA, NO auto-ejecutado"
  - "D-09: gate Regla 6 corre sobre base 5c4a92a1 (commit pre-código) porque Plans 01-04 ya están commiteados"

patterns-established:
  - "Disciplina de scope CSS: el éxito se mide por lo que NO cambió (10 invariantes byte-frozen) tanto como por lo que sí"
  - "Mount nuevo gated v3-only (isEditorialV3 && + md:hidden) prueba que el dashboard no-v3 sigue idéntico a hoy"

requirements-completed: [D-01, D-08, D-09]

# Metrics
duration: ~18min (incl. checkpoint de aprobación del usuario)
completed: 2026-06-06
---

# Phase ui-redesign-editorial-shell Plan 05: Gate Regla 6 final + activación + push Summary

**Gate estático Regla 6 (10/10 invariantes OK) + doc de activación per-workspace (D-08/D-01, sin migración) + push de toda la fase editorial-shell a origin/main con el flag `ui_editorial_v3` default-OFF (cero cambio de comportamiento en prod).**

## Performance

- **Duration:** ~18 min (incluye el checkpoint de aprobación del usuario para el push)
- **Started:** 2026-06-06 (Tasks 1+2 en sesión previa)
- **Completed:** 2026-06-06
- **Tasks:** 3 (Task 1 gate Regla 6, Task 2 activación, Task 3 checkpoint→push)
- **Files modified:** 2 docs creados (REGLA6-GATE.md, ACTIVATION.md) + push de 15 commits de la fase

## Accomplishments
- **Gate estático Regla 6 (D-09) 10/10 OK** — probado que todo lo no-v3 quedó byte-frozen: sidebar v2/legacy, globals.css legacy, mobile-nav path no-v3, theme-toggle base, contacts-view-v2, header.tsx marketing; y que el mount nuevo del dashboard está gated v3-only (isEditorialV3 && + md:hidden).
- **Activación per-workspace documentada (D-08/D-01)** — SQL `UPDATE workspaces ... jsonb_set('{ui_editorial_v3,enabled}','true')` como paso MANUAL post-QA, sin migración, mismo flag que el core, con rollback y checklist de QA de las 5 superficies en light+dark.
- **Push a origin/main de toda la fase** — `5c125762..96c75973` (Vercel desplegó); flag default-OFF → cero cambio de comportamiento en prod hasta activación explícita del usuario.

## Task Commits

1. **Task 1: Gate Regla 6 (D-09) — 10/10 invariantes OK** - `45535793` (docs)
2. **Task 2: Activación per-workspace (D-08) — paso manual post-QA** - `23134a3e` (docs)
3. **Task 3: Checkpoint aprobado + push a origin/main** - push `5c125762..96c75973` (incluye los 15 commits de la fase editorial-shell Waves 0-4 + el commit GAP-41-08 `96c75973` que ya estaba local)

**Plan metadata:** este 05-SUMMARY.md + STATE.md (commit docs de cierre + push).

## Files Created/Modified
- `.planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md` - Resultado OK/ALERTA de los 10 invariantes Regla 6 (D-09) + gate de tipos
- `.planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md` - SQL de activación per-workspace (D-08) + rollback + checklist QA

## Regla 6 — Verificación (gate D-09)

**Veredicto global: 10/10 OK.** Base de diff usada: `5c4a92a1` (commit pre-código de la fase; los Plans 01-04 ya están commiteados, por eso `git diff HEAD` sale vacío y cada invariante se adapta a `git diff 5c4a92a1 HEAD`).

1. globals.css legacy `.theme-editorial` (sin guion) NO cambió — **OK**
2. Branch v2 "Propuesta B" + return legacy del sidebar byte-frozen (único removal = la firma con la prop `v3` añadida) — **OK**
3. Sin selector compound `theme-editorial-v3.dark` (dark es descendant-only `.dark .theme-editorial-v3`) — **OK**
4. ThemeToggle de orders-view conservado en rama no-v3 + nuevo en topbar v3 (`grep -c`=3) — **OK**
5. contacts-view-v2.tsx NO tocado (diff vacío) — **OK**
6. Todas las adiciones de clases a globals.css bajo `.theme-editorial-v3` (única otra adición = token `--accent-indigo` dentro del bloque dark existente) — **OK**
7. Path no-v3 del mobile-nav byte-frozen (único removal = la firma con prop `v3`) — **OK**
8. theme-toggle.tsx base NO modificado (diff vacío) — **OK**
9. header.tsx marketing byte-frozen (diff vacío; su `<MobileNav />` NO recibe v3) — **OK**
10. Mount del mobile-nav en el dashboard gated v3-only (awk proximidad exit 0 + `md:hidden` MATCH) — **OK**

**Gate de tipos:** `pnpm exec tsc --noEmit` — 0 errores en los archivos de la fase. 4 errores residuales pre-existentes en tests no relacionados (conversations.test.ts, IG/FB webhook-handler.test.ts) documentados como deferidos (fuera de scope, no causados por esta fase).

## Decisiones Made
- **D-09 base de diff = `5c4a92a1`:** como los Plans 01-04 ya estaban commiteados, `git diff HEAD` salía vacío; el gate se corrió contra el commit pre-código de la fase para validar byte-frozen real.
- **Activación NO auto-ejecutada (D-08):** la activación per-workspace es decisión de negocio del usuario; este plan documenta el SQL pero NO toca producción.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm exec tsc --noEmit` en vez de `pnpm typecheck`**
- **Found during:** Task 1 (gate de tipos)
- **Issue:** El script `pnpm typecheck` no existe en este repo.
- **Fix:** Se usó `pnpm exec tsc --noEmit` (equivalente). Mismo patrón aplicado en Plans 00-04.
- **Files modified:** ninguno (solo comando de verificación)
- **Verification:** 0 errores en archivos de la fase.
- **Committed in:** `45535793` (documentado en REGLA6-GATE.md)

---

**Total deviations:** 1 auto-fixed (1 blocking — script inexistente).
**Impact on plan:** Cosmético (nombre de comando). Sin scope creep.

## Issues Encountered
Ninguno. El push fue fast-forward limpio (`5c125762..96c75973`); no hubo non-fast-forward de sesión concurrente.

## Resumen de la fase completa (Waves 0-4)

`ui-redesign-editorial-shell` completa el ecosistema editorial v3 alrededor del core ya shipeado:

- **Plan 00 (Wave 0):** decisiones-only — WAVE0-DECISIONS.md (D-05b mount dashboard, precedencia v3>v2>legacy).
- **Plan 01 (Wave 1):** sidebar v3 branch `if (v3)` con scope `theme-editorial-v3` en el `<aside>` (Opción B/D-03), wordmark tipográfico `morf·x`, sin ThemeToggle (D-07).
- **Plan 02 (Wave 2):** ThemeToggle en los 3 topbars v3 (Conversaciones/Contactos/Pedidos) — D-04, NO en el sidebar.
- **Plan 03 (Wave 2):** mobile-nav v3 + mount NUEVO `md:hidden` v3-only en el dashboard (D-05b); header.tsx marketing byte-frozen.
- **Plan 04 (Wave 3):** auditoría dark token-por-token (D-06) + 1 override `--accent-indigo`; grain OFF; checkpoint humano aprobado.
- **Plan 05 (Wave 4):** gate Regla 6 final 10/10 OK + activación documentada + push.

**Estado en prod:** flag `ui_editorial_v3` default-OFF, fail-closed, sin migración (D-01). Cero cambio de comportamiento hasta activación per-workspace explícita del usuario. Regla 6 probada (Somnio y todos los no-v3 byte-frozen).

## Next Phase Readiness
- Fase **lista para verificación** (manual, modo secuencial — `gsd-sdk`/`gsd-tools` CLI unavailable).
- origin/main up to date; Vercel desplegado.
- Activación per-workspace pendiente de decisión del usuario (ver ACTIVATION.md) — primero QA en workspace de prueba en light+dark de las 5 superficies.

## Self-Check: PASSED

- FOUND: REGLA6-GATE.md
- FOUND: ACTIVATION.md
- FOUND: 05-SUMMARY.md
- FOUND commit: `45535793` (Task 1)
- FOUND commit: `23134a3e` (Task 2)
- Push verificado: `git log origin/main -1` = `96c75973` (origin/main up to date)

---
*Phase: ui-redesign-editorial-shell*
*Completed: 2026-06-06*
