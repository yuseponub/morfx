---
phase: ui-redesign-editorial-shell
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - .planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md
  - .planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md
autonomous: false
requirements: [D-01, D-08, D-09]

must_haves:
  truths:
    - "Los invariantes Regla 6 del RESEARCH §'Regla 6 — estrategia de verificación' corren limpios: branch v2/legacy del sidebar byte-frozen, legacy de globals.css intacto, sin compound dark, ThemeToggle de orders-view:1348 conservado, contacts-view-v2 intacto, path no-v3 del mobile-nav frozen"
    - "El header.tsx de marketing queda byte-frozen (git diff vacío) — su <MobileNav /> no recibe v3; y el mount nuevo del dashboard está gated v3-only (grep isEditorialV3 && guarda el <MobileNav en layout.tsx), probando que el dashboard no-v3 sigue igual que hoy"
    - "pnpm typecheck pasa en el estado final (todos los plans mergeados)"
    - "La activación per-workspace (D-08) queda documentada como paso post-QA manual (NO auto-ejecutado) — mismo flag ui_editorial_v3, sin migración (D-01)"
    - "Se hace push a origin/main tras los cambios (Regla 1) usando pnpm (nunca npm)"
  artifacts:
    - path: ".planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md"
      provides: "Resultado de cada comando de verificación Regla 6 (D-09) con OK/ALERTA"
      min_lines: 20
    - path: ".planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md"
      provides: "SQL de activación per-workspace (D-08) documentado como paso manual post-QA"
      contains: "ui_editorial_v3"
  key_links:
    - from: ".planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md"
      to: "los branches no-v3 byte-frozen (sidebar v2/legacy, globals.css legacy, mobile-nav no-v3, header.tsx marketing)"
      via: "git diff / grep invariants del RESEARCH"
      pattern: "byte-frozen|git diff"
---

<objective>
Gate final Regla 6 (D-09): correr los invariantes `git diff`/grep del RESEARCH para probar que todo lo no-v3 quedó byte-frozen (incluyendo `header.tsx` marketing + el gate v3-only del mount nuevo del dashboard), confirmar `pnpm typecheck` en el estado final, documentar la activación per-workspace (D-08/D-01) como paso manual post-QA, y hacer push a origin/main (Regla 1, pnpm).

Purpose: este standalone es una disciplina de scope CSS — el éxito se mide por lo que NO cambió tanto como por lo que sí. D-05b agregó un mount real en el dashboard, así que el gate ahora también prueba: (a) que `header.tsx` (mobile-nav de marketing) quedó byte-frozen, y (b) que el mount del dashboard está gated v3-only (no rompe el dashboard no-v3). Este plan cierra con la prueba estática de Regla 6 + el doc de activación (sin migración, sin flag nuevo). El push se hace al final para que el usuario pueda probar en Vercel/preview.
Output: `REGLA6-GATE.md` (resultado de los invariantes) + `ACTIVATION.md` (SQL D-08); push a main.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/RESEARCH.md
@.planning/standalone/ui-redesign-editorial-shell/CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Correr los invariantes Regla 6 + pnpm typecheck y documentar el resultado (D-09)</name>
  <read_first>
    - RESEARCH §"Regla 6 — estrategia de verificación (D-09)" (los comandos concretos)
    - src/components/layout/sidebar.tsx (verificar que solo el branch v3 + prop v3 cambiaron; v2 220-396 y legacy 398-591 intactos)
    - src/app/globals.css (verificar que solo se hizo APPEND bajo .theme-editorial-v3)
    - src/components/layout/header.tsx (verificar byte-frozen — el <MobileNav /> de marketing NO recibe v3)
    - src/app/(dashboard)/layout.tsx (verificar que el mount nuevo del mobile-nav está gated isEditorialV3 && — D-05b)
  </read_first>
  <action>
    Correr los comandos de verificación del RESEARCH §"Regla 6" y registrar el resultado (OK/ALERTA) de cada uno en `REGLA6-GATE.md`:
    1. Legacy de globals.css NO cambió:
       `git diff HEAD -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]'` → debe estar VACÍO (OK legacy frozen).
    2. Branch v2 del sidebar sin cambios: `git diff HEAD -- src/components/layout/sidebar.tsx` → los hunks deben ser SOLO: prop nueva `v3`, branch `if (v3)`, y NADA dentro del `if (v2)` (220-396) ni del return legacy (398-591). Inspección dirigida documentada.
    3. Sin compound dark: `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` → VACÍO (OK descendant-only).
    4. ThemeToggle de orders-view:1348 conservado: `grep -c 'ThemeToggle' 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` → >= 3 (import + 1348 + topbar v3 nuevo).
    5. contacts-view-v2.tsx NO tocado: `git diff HEAD -- 'src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx'` → VACÍO.
    6. Todas las adiciones a globals.css bajo .theme-editorial-v3:
       `git diff HEAD -- src/app/globals.css | grep -E '^\+\.' | grep -v 'theme-editorial-v3'` → VACÍO (OK todo bajo v3).
    7. Path no-v3 del mobile-nav frozen: inspeccionar `git diff HEAD -- src/components/layout/mobile-nav.tsx` → el return no-v3 (50-93) sin cambios; solo prop + branch v3 nuevos.
    8. `theme-toggle.tsx` base NO modificado: `git diff HEAD -- src/components/layout/theme-toggle.tsx` → VACÍO.
    9. **header.tsx marketing byte-frozen (D-05b):** `git diff HEAD -- src/components/layout/header.tsx` → VACÍO. El `<MobileNav />` del header de marketing NO recibe `v3` y el archivo no se tocó — el path no-v3/marketing del mobile-nav queda intacto.
    10. **Mount del dashboard gated v3-only (D-05b):** verificar por proximidad (portable, sin grep -Pz que aquí es ugrep) que el `<MobileNav` del dashboard está guardado por un `isEditorialV3 &&` cercano:
       `awk '/isEditorialV3 *&&/{g=NR} /<MobileNav/{if(g>0&&NR-g<=6)f=1} END{exit f?0:1}' 'src/app/(dashboard)/layout.tsx'` → exit 0 (OK-mount-gated): el `<MobileNav` del dashboard aparece ≤6 líneas después de un `isEditorialV3 &&`, probando que el dashboard no-v3 no monta mobile-nav = igual que hoy. Además `grep -q 'md:hidden' 'src/app/(dashboard)/layout.tsx'` → MATCH (mobile-only).
    Cerrar con `pnpm typecheck` (debe pasar). Si CUALQUIER invariante falla (ALERTA), documentar el archivo/hunk culpable y NO continuar al push — el plan se considera bloqueado hasta corregir.
  </action>
  <verify>
    <automated>git diff HEAD -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]' && echo "ALERTA-legacy" || echo "OK-legacy"; grep -n 'theme-editorial-v3\.dark' src/app/globals.css || echo "OK-no-compound"; test "$(grep -c ThemeToggle 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx')" -ge 3 && echo "OK-toggle-1348"; test -z "$(git diff HEAD -- src/components/layout/header.tsx)" && echo "OK-header-frozen" || echo "ALERTA-header"; awk '/isEditorialV3 *&&/{g=NR} /<MobileNav/{if(g>0&&NR-g<=6)f=1} END{exit f?0:1}' 'src/app/(dashboard)/layout.tsx' && echo "OK-mount-gated" || echo "ALERTA-mount-ungated"; pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `REGLA6-GATE.md` registra OK para los 10 invariantes (legacy frozen, v2/legacy sidebar frozen, sin compound dark, toggle 1348 conservado, contacts-view-v2 intacto, adiciones bajo v3, mobile-nav no-v3 frozen, theme-toggle base intacto, header.tsx marketing frozen, mount dashboard gated v3-only)
    - El comando combinado del verify imprime `OK-legacy`, `OK-no-compound`, `OK-toggle-1348`, `OK-header-frozen`, `OK-mount-gated` y `pnpm typecheck` pasa
    - Si algún invariante diera ALERTA, está documentado con el hunk culpable y el plan queda marcado como bloqueado (no se pasa al push)
  </acceptance_criteria>
  <done>Los 10 invariantes Regla 6 registrados en REGLA6-GATE.md (todos OK, incluyendo header.tsx frozen + mount dashboard gated v3-only); typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 2: Documentar la activación per-workspace post-QA (D-08/D-01) — sin auto-ejecutar</name>
  <read_first>
    - RESEARCH §"Activación (manual, post-QA — sin migración, D-08)" (el SQL exacto)
    - CONTEXT.md D-01 (mismo flag ui_editorial_v3, sin migración) + D-08 (activación per-workspace)
  </read_first>
  <action>
    Crear `ACTIVATION.md` documentando que la activación es un paso MANUAL post-QA del usuario (NO se auto-ejecuta — D-08 es decisión de negocio, RESEARCH §Deferred "Activación de v3 en producción"). Incluir el SQL verbatim:
    ```sql
    -- Activar editorial v3 (chrome + contenido + dark) en un workspace.
    -- Mismo flag que el core (D-01) — sin migración, sub-key JSONB.
    UPDATE workspaces
    SET settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{ui_editorial_v3,enabled}','true'::jsonb,true)
    WHERE id = '<workspace-uuid>';
    -- Rollback: mismo UPDATE con 'false'::jsonb.
    ```
    Documentar: el flag es el MISMO que ya activa el contenido editorial (las 3 pantallas del core); este standalone hace que, al activarlo, el chrome (sidebar v3 + mobile-nav v3 alcanzable en mobile + toggle + dark) aparezca JUNTO. NO crear flag nuevo, NO migración (D-01). Recomendar correr primero en un workspace de prueba, validar las 5 superficies en light+dark (sidebar desktop, mobile-nav en viewport mobile, toggle en los 3 topbars, contenido dark), y solo entonces decidir activación en producción.
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md && grep -q 'ui_editorial_v3' .planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md && grep -q 'jsonb_set' .planning/standalone/ui-redesign-editorial-shell/ACTIVATION.md && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `ACTIVATION.md` existe y contiene el `UPDATE workspaces ... jsonb_set(...,'{ui_editorial_v3,enabled}','true'...)` + el rollback
    - El doc deja claro que es paso MANUAL post-QA (NO auto-ejecutado), mismo flag, sin migración (D-01/D-08)
    - El doc menciona validar el mobile-nav v3 en viewport mobile (D-05b) entre las superficies a QA
    - NO se ejecutó ningún UPDATE contra la DB (este plan no toca producción)
  </acceptance_criteria>
  <done>ACTIVATION.md documenta el SQL de activación per-workspace como paso manual post-QA; sin migración; sin auto-ejecución.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Checkpoint — aprobar push a origin/main (Regla 1, pnpm)</name>
  <what-built>
    Sidebar v3 (Plan 01), toggle en 3 topbars (Plan 02), mobile-nav v3 + mount v3-only en el dashboard (Plan 03 / D-05b), auditoría dark (Plan 04), e invariantes Regla 6 limpios (Task 1, incl. header.tsx frozen + mount gated). Todo v3-gated; branches no-v3 byte-frozen; typecheck verde.
  </what-built>
  <how-to-verify>
    Antes de pushear (Regla 1 — push a Vercel antes de pedir pruebas), confirmar:
    1. El checkpoint visual dark (Plan 04 Task 2) fue "approved".
    2. `REGLA6-GATE.md` muestra los 10 invariantes en OK (incl. header.tsx frozen + mount dashboard gated v3-only).
    3. `pnpm typecheck` pasa (NUNCA usar npm — repo pnpm-only; npm rompe pnpm-lock y deploys).
    Si todo OK, autorizar el commit + push a origin/main. Commits atómicos en español, co-authored Claude (regla code-changes.md).
  </how-to-verify>
  <resume-signal>Escribe "approved" para hacer commit + push a origin/main, o describe qué corregir antes.</resume-signal>
</task>

</tasks>

<verification>
- Gate estático: los 10 invariantes Regla 6 del RESEARCH (D-09) + header.tsx frozen + mount dashboard gated v3-only (D-05b).
- Gate de tipos: `pnpm typecheck`.
- Activación documentada (D-08/D-01) sin auto-ejecución.
- Push a origin/main con pnpm (Regla 1), tras aprobación del checkpoint.
</verification>

<success_criteria>
- Regla 6 probada: todo lo no-v3 byte-frozen (incl. header.tsx marketing); el mount nuevo del dashboard gated v3-only; solo additive v3-gated.
- typecheck verde; activación documentada; push a main aprobado.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/05-SUMMARY.md`
</output>
