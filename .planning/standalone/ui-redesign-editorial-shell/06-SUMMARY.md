---
phase: ui-redesign-editorial-shell
plan: 06
subsystem: ui
tags: [sidebar, workspace-switcher, css, editorial-v3, gap-closure, react]

# Dependency graph
requires:
  - phase: ui-redesign-editorial-shell-01
    provides: branch `if (v3)` del sidebar (clases .sb/.brand/.wm/nav.sb-nav/.cat/a.active) + flag ui_editorial_v3 threaded
  - phase: ui-redesign-editorial-core-00
    provides: filtro CSS `.theme-editorial-v3 .wm img` (multiply light / invert dark) reusado por el logo-img
provides:
  - Sidebar v3 fiel al mock crm-editorial.html (§268-294)
  - GlobalSearch removido del branch v3 (D-G1)
  - Logo como imagen <Image src=/logo-light.png> en .wm (D-G4)
  - WorkspaceSwitcher con look .ws funcional via prop opt-in `editorial` + subtítulo business_type real (D-G3)
  - Footer de usuario limpio (logout intacto, borde suave editorial) (D-G2)
  - Reglas CSS .theme-editorial-v3 .ws* (APPEND) + refinamiento .cat/.cat::before/a.active/.wm (D-G5)
affects: [ui-redesign-editorial-shell verify-work, futuros siblings sidebar editorial]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prop opt-in `editorial?: boolean` (default false) en WorkspaceSwitcher: cambia SOLO el render del trigger, callers v2/legacy byte-idénticos (Regla 6)"
    - "Logo-img v3 reusa el filtro CSS .wm img existente (una sola <Image>, sin duplicar light/dark)"

key-files:
  created:
    - .planning/standalone/ui-redesign-editorial-shell/06-SUMMARY.md
  modified:
    - src/components/layout/sidebar.tsx
    - src/components/workspace/workspace-switcher.tsx
    - src/app/globals.css

key-decisions:
  - "D-G1: GlobalSearch fuera del branch v3 (mock no tiene caja de búsqueda en el sidebar); import conservado (v2 + legacy lo usan)"
  - "D-G2: footer de usuario re-estilizado limpio (borderTop var(--border), nombre font-sans) — logout 100% intacto"
  - "D-G3: switcher .ws via prop `editorial`; subtítulo = business_type || 'CRM' (dato real, nunca el literal 'Plan Pro · N agentes')"
  - "D-G4: wordmark de texto morf·x reemplazado por <Image src=/logo-light.png> apoyándose en el filtro .wm img existente"
  - "D-G5: .ws* portadas verbatim del mock (APPEND); .cat/.cat::before/a.active/.wm refinadas in-place a fidelidad bajo .theme-editorial-v3"
  - "Regla 1 (decisión usuario): push ahora + verificación visual en Vercel/prod (en vez del checkpoint local Task 5)"

patterns-established:
  - "Opt-in editorial prop: la fidelidad visual del componente compartido vive detrás de un flag de render que los callers no-v3 nunca activan → Regla 6 sin duplicar el componente"

requirements-completed: [D-G1, D-G2, D-G3, D-G4, D-G5]

# Metrics
duration: ~45min (incl. sesión previa de los 3 commits de código)
completed: 2026-06-06
---

# Phase ui-redesign-editorial-shell Plan 06: Gap-closure sidebar v3 fiel al mock — Summary

**Sidebar v3 alineado al mock crm-editorial.html: GlobalSearch fuera, logo como imagen, workspace switcher con look .ws funcional (prop opt-in `editorial`) + subtítulo business_type real, footer limpio con logout intacto, y CSS .ws* + bullets de categoría + active limpio portados/refinados — todo gateado a `.theme-editorial-v3`, no-v3 byte-frozen.**

## Performance

- **Duration:** ~45 min (los 3 commits de código en sesión previa; esta sesión = push + SUMMARY + STATE)
- **Started (esta sesión):** 2026-06-06
- **Completed:** 2026-06-06
- **Tasks:** 5 ejecutadas (Tasks 1-4 código + gate; Task 5 checkpoint satisfecho por verificación-en-prod; Task 6 push + docs)
- **Files modified:** 3 código + 2 docs (SUMMARY + STATE)

## Accomplishments
- **D-G1** — `<GlobalSearch>` removido del branch `if (v3)` del sidebar; import conservado (v2 + legacy lo siguen usando, `grep -c GlobalSearch sidebar.tsx` = 3).
- **D-G4** — Logo como imagen `<Image src="/logo-light.png">` dentro de `.wm`, apoyándose en el filtro CSS `.theme-editorial-v3 .wm img` (multiply light / invert dark) ya existente; sin duplicar imgs light/dark.
- **D-G3** — `WorkspaceSwitcher` re-estilizado al look `.ws` del mock (badge inicial + nombre + caret ▾) via prop opt-in `editorial?: boolean` (default false); dropdown 100% funcional (handleSelect/DropdownMenuContent sin tocar); subtítulo `.ws-plan` = `business_type || 'CRM'` (dato real — `grep` de "Plan Pro" y "agentes" = 0).
- **D-G2** — Footer de usuario re-estilizado limpio (borderTop suave `var(--border)`, nombre `font-sans` weight 600); `<form action={logout}>` + LogOut + Tooltip "Cerrar sesión" intactos.
- **D-G5** — 7 reglas `.theme-editorial-v3 .ws*` portadas verbatim del mock (APPEND); `.cat` (flex + bullet rubric-2 `::before`), `a.active` (paper-3, sin borde/sombra) y `.wm` (contenedor de imagen `height:28px`) refinadas in-place bajo `.theme-editorial-v3`.

## Task Commits

Los 3 cambios de código fueron commiteados atómicamente (sesión previa, en `main`):

1. **Task 1: GlobalSearch fuera del v3 + logo-img (D-G1, D-G4)** — `06d08310` (fix)
2. **Task 2: switcher look .ws funcional + footer limpio (D-G2, D-G3)** — `0260dd52` (fix)
3. **Task 3: portar .ws* + refinar .cat/active/.wm (D-G5)** — `e45d3a33` (style)
4. **Task 4: gate Regla 6 10/10 + tsc limpio** — sin commit de código (solo verificación)

**Push:** `git push origin main` fast-forward `5ef9cf8e..0b02a18c` (incluye estos 3 commits + commits interleaved de la sesión concurrente Fase 41). origin/main UP TO DATE → Vercel desplegó.

**Plan metadata:** este SUMMARY + STATE.md (docs commit + push).

## Files Created/Modified
- `src/components/layout/sidebar.tsx` — branch v3: sin GlobalSearch, logo-img en `.wm`, switcher con prop `editorial` sin caja-con-borde, footer limpio (logout intacto). v2 (~418-595) + legacy (~596+) byte-frozen.
- `src/components/workspace/workspace-switcher.tsx` — prop `editorial?: boolean` (default false) que renderiza el trigger `.ws` (badge/meta/name/plan/caret) solo cuando es true; subtítulo `business_type || 'CRM'`. Dropdown + handleSelect + bloque length===0 sin cambios.
- `src/app/globals.css` — APPEND de 7 reglas `.theme-editorial-v3 .ws*` + refinamiento in-place de `.cat`/`.cat::before`/`a.active`/`.wm`. Legacy `.theme-editorial` (sin guion) intacto; sin compound `.theme-editorial-v3.dark`.

## Gate Regla 6 — 10/10 OK (base diff `adfc85cf`)

1. **sidebar v2 + legacy byte-frozen** — diff de sidebar.tsx confinado al branch `if (v3)`; v2/legacy sin cambios. OK
2. **header.tsx marketing byte-frozen** — `git diff adfc85cf -- header.tsx theme-toggle.tsx` = 0 líneas. OK
3. **theme-toggle.tsx byte-frozen** — (incluido en #2). OK
4. **globals.css legacy `.theme-editorial` (sin guion) NO tocado** — `git diff | grep '^+' | grep '\.theme-editorial[^-]'` = VACÍO. OK
5. **Sin compound dark** — `grep 'theme-editorial-v3\.dark' globals.css` = VACÍO. OK
6. **Toda adición de clase bajo .theme-editorial-v3** — verificado (todas las `+.` líneas scoped). OK
7. **Import GlobalSearch conservado (no huérfano)** — `grep -c GlobalSearch sidebar.tsx` = 3. OK
8. **callers v2/legacy del switcher sin la prop editorial** — solo ADICIÓN de la prop + branch ternario; DropdownMenuContent/handleSelect/length===0 sin `-`. OK
9. **Gate de tipos** — `pnpm exec tsc --noEmit | grep -E 'sidebar|workspace-switcher|globals'` = VACÍO; sin errores nuevos (los 4 residuales pre-existentes en `__tests__` no relacionados, fuera de scope). OK
10. **Flag + sin migración** — flag sigue `ui_editorial_v3` (sin cambio de gating); este plan NO crea migración. OK

Resultados grep de verificación (esta sesión, post-commits):
- `grep -c GlobalSearch sidebar.tsx` = 3
- `grep 'theme-editorial-v3\.dark' globals.css` = VACÍO
- `grep -c '.theme-editorial-v3 .ws-badge' globals.css` = 1
- `grep -c '.theme-editorial-v3 nav.sb-nav .cat::before' globals.css` = 1
- `grep -c 'editorial = false' workspace-switcher.tsx` = 1; `grep -c 'className="ws"'` = 1
- `grep -c 'Plan Pro' workspace-switcher.tsx` = 0; `grep -c 'agentes'` = 0
- WorkspaceSwitcher v3 en sidebar.tsx (línea 265) pasa la prop `editorial` (multi-línea, línea 268)
- `git diff adfc85cf -- header.tsx theme-toggle.tsx` = 0 líneas
- `git diff adfc85cf -- globals.css | grep '^+' | grep '\.theme-editorial[^-]'` = VACÍO
- `pnpm exec tsc --noEmit` 0 errores en archivos del plan

## Decisions Made
- **Regla 1 (decisión del usuario, esta sesión):** ante el checkpoint visual Task 5, el usuario eligió "Pushear ya y reviso en Vercel" — push primero, verificación visual directamente en prod/Vercel (Somnio + Varixcenter, light + dark) en vez de la verificación local con `pnpm dev`. El checkpoint queda satisfecho por la QA del usuario post-deploy.
- **Mecanismo del switcher (D-G3):** prop opt-in `editorial?: boolean` en `WorkspaceSwitcher` — el camino menos invasivo que NO rompe los callers v2/legacy (que no pasan la prop → render byte-idéntico, default false). Cambia SOLO el render del trigger, reusa el MISMO `open`/`setOpen`/`<DropdownMenu>` → el dropdown sigue 100% funcional.

## Deviations from Plan

None - plan ejecutado tal como está escrito. Única variación de proceso: Task 5 (checkpoint human-verify) se satisfizo con verificación-en-prod post-push por decisión explícita del usuario (Regla 1), en vez de la verificación local pre-push. Los 5 requisitos D-G1..D-G5 se implementaron exactamente como el plan especifica.

## Issues Encountered
None. El push fue fast-forward limpio (`5ef9cf8e..0b02a18c`, 0 commits detrás de origin/main). Los commits interleaved de la sesión concurrente Fase 41 (`0b02a18c`, `da2e3f61`, etc.) son aditivos en archivos separados y no afectan los 3 commits de código de este plan.

## User Setup Required
None - sin configuración de servicios externos. El flag `ui_editorial_v3` se activa per-workspace manualmente (documentado en `ACTIVATION.md` del Plan 05). Este gap-closure mejora la fidelidad del sidebar v3 ya activable.

## Next Phase Readiness
- Sidebar v3 fiel al mock, pusheado a prod (Vercel). **Pendiente:** QA visual del usuario en prod (Somnio + Varixcenter, light + dark) — confirmar logo-imagen alineado, switcher .ws compacto y funcional, bullets de categoría rojos, footer limpio, sin caja de búsqueda, y no-v3 intacto.
- Si la QA en prod pasa → `/gsd:verify-work ui-redesign-editorial-shell` para cerrar la fase completa (Waves 0-4 + este gap-closure 06).
- Si la QA detecta algo deforme/roto → corregir con un follow-up acotado al branch v3.

## Self-Check: PASSED

**Archivos creados/modificados verificados:**
- FOUND: `.planning/standalone/ui-redesign-editorial-shell/06-SUMMARY.md` (este archivo)
- FOUND: `src/components/layout/sidebar.tsx` (GlobalSearch=3, switcher con prop editorial)
- FOUND: `src/components/workspace/workspace-switcher.tsx` (editorial=false, className="ws")
- FOUND: `src/app/globals.css` (.ws-badge=1, .cat::before=1, sin compound dark)

**Commits verificados en origin/main:**
- FOUND: `06d08310` (Task 1 — D-G1, D-G4)
- FOUND: `0260dd52` (Task 2 — D-G2, D-G3)
- FOUND: `e45d3a33` (Task 3 — D-G5)
- Push fast-forward `5ef9cf8e..0b02a18c` confirmado (origin/main UP TO DATE)

---
*Phase: ui-redesign-editorial-shell*
*Completed: 2026-06-06*
