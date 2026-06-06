---
phase: ui-redesign-editorial-shell
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - src/app/globals.css
  - .planning/standalone/ui-redesign-editorial-shell/DARK-AUDIT.md
autonomous: false
requirements: [D-06]

must_haves:
  truths:
    - "Las 5 superficies (3 pantallas de contenido + sidebar v3 + mobile-nav v3) se auditan token-por-token en dark contra el bloque mock .theme-editorial.dark"
    - "El bloque .dark .theme-editorial-v3 (globals.css ~1363-1373) ya matchea el mock — la auditoría lo CONFIRMA, no lo reinventa"
    - "Los acentos no-overrideados en dark (gold/verdigris/indigo/semantic/shadows) se auditan; se agregan overrides dark SOLO donde el contraste/legibilidad falle"
    - "El grain queda OFF en dark en las 5 superficies (--paper-grain:none, --paper-fibers:none, background-image:none)"
  artifacts:
    - path: ".planning/standalone/ui-redesign-editorial-shell/DARK-AUDIT.md"
      provides: "Checklist de la auditoría dark con el resultado por superficie + por acento + las correcciones aplicadas (o 'sin corrección necesaria')"
      min_lines: 25
  key_links:
    - from: ".dark .theme-editorial-v3 en globals.css"
      to: "el <aside> sidebar v3 + <SheetContent> mobile-nav v3 + <main> de las 3 pantallas"
      via: "descendant cascade desde .dark en <html>"
      pattern: ".dark .theme-editorial-v3"
---

<objective>
Auditoría dark completa token-por-token (D-06) de las 5 superficies v3: las 3 pantallas de contenido (Conversaciones/Contactos/Pedidos), el sidebar v3 (Plan 01) y el mobile-nav v3 (Plan 03), contra el bloque mock `.theme-editorial.dark`. Confirmar que el bloque `.dark .theme-editorial-v3` ya matchea; auditar los acentos no-overrideados (gold/verdigris/indigo/semantic/shadows) sobre charcoal; agregar overrides dark SOLO donde el contraste/legibilidad falle (no sobre-ingenierizar). Confirmar grain OFF en dark.

Purpose: el usuario dijo "ya se parece" pero pidió auditoría completa igual (D-06). El RESEARCH verificó que el bloque dark v3 ya es byte-idéntico al mock — así que el trabajo REAL es: (a) confirmar visualmente las 5 superficies en dark, (b) auditar los acentos que NO tienen override dark (que es lo que el "auditemos igual" busca). Este plan tiene un checkpoint humano porque la validación es visual.
Output: `DARK-AUDIT.md` con el resultado + cualquier override dark agregado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/RESEARCH.md

<canonical-mock>
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html  <!-- bloque .theme-editorial.dark ~252-259 = reference dark (los 3 mocks son idénticos) -->
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/pedidos/index.html
</canonical-mock>

<facts-already-verified>
- El bloque `.dark .theme-editorial-v3` (globals.css ~1363-1373) es byte-idéntico al mock (RESEARCH §"Auditoría Dark" tabla token-por-token: --bg-app/--paper-0..4/--ink-1..5/--border/--rubric-1..2/--paper-grain/--paper-fibers/background-image/.wm img → TODOS ✅).
- Acentos SIN override dark (heredan los light del scope): --accent-gold, --accent-verdigris, --accent-indigo, --semantic-success, --semantic-warning, --paper-shadow, --shadow-*. ESTOS son el delta real a auditar.
- Sidebar v3 (Plan 01) y mobile-nav v3 (Plan 03) usan tokens del scope → el dark los cubre por cascade (verificar por screenshot).
</facts-already-verified>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auditar tokens dark de las 5 superficies + acentos no-overrideados; agregar overrides dark SOLO donde falle (D-06)</name>
  <read_first>
    - src/app/globals.css (bloque `.dark .theme-editorial-v3` ~1363-1373 + el bloque light `.theme-editorial-v3` ~1031+ donde se definen --accent-gold/--accent-verdigris/--accent-indigo/--semantic-*/--shadow-*)
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html (bloque `.theme-editorial.dark` — reference)
    - RESEARCH §"Auditoría Dark — checklist token-por-token" (la tabla de match + el checklist accionable + el "delta REAL de D-06")
  </read_first>
  <action>
    Auditar y, si hace falta, corregir — en este orden:
    1. **Confirmar el bloque base dark** (`.dark .theme-editorial-v3` ~1363-1373): verificar que sigue byte-idéntico al mock `.theme-editorial.dark` (RESEARCH ya lo confirmó; revalidar tras los cambios de Plans 01/03). NO reinventar — si ya matchea, no tocar.
    2. **Auditar los acentos no-overrideados en dark** sobre el charcoal-warm: `--accent-gold`, `--accent-verdigris`, `--accent-indigo`, `--semantic-success`, `--semantic-warning`, `--paper-shadow`, `--shadow-card`/`--shadow-*`. Para cada uno, evaluar legibilidad/contraste en dark (los kanban dots de pedidos, los tags MxTag gold/indigo/verdigris, las sombras de tarjetas que pueden desaparecer sobre charcoal).
    3. **Agregar overrides dark SOLO donde el contraste/legibilidad falle.** Si un acento se ve bien sobre charcoal, NO agregar override (no sobre-ingenierizar — A4 RESEARCH). Los overrides van como APPEND dentro del bloque `.dark .theme-editorial-v3 { ... }` existente (agregar las custom properties que falten) — SIN crear selector compound, SIN tocar el bloque light, SIN tocar legacy.
       Ejemplo (solo si gold queda ilegible): dentro de `.dark .theme-editorial-v3{ ... }` agregar `--accent-gold:oklch(... ajustado para dark ...);`.
    4. **Confirmar grain OFF** en dark (ya está: `--paper-grain:none;--paper-fibers:none;background-image:none`) — no tocar.
    Documentar cada decisión (token → "OK sin cambio" / "override agregado: valor") en `DARK-AUDIT.md`.
  </action>
  <verify>
    <automated>grep -q '.dark .theme-editorial-v3' src/app/globals.css && grep -n 'theme-editorial-v3\.dark' src/app/globals.css; pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `DARK-AUDIT.md` lista cada token base (--bg-app/--paper-*/--ink-*/--border/--rubric-*) con veredicto "match con mock ✅"
    - `DARK-AUDIT.md` lista cada acento no-overrideado (gold/verdigris/indigo/semantic/shadows) con veredicto "OK sin cambio" o "override agregado: <valor>"
    - Cualquier override dark agregado vive DENTRO del bloque `.dark .theme-editorial-v3 { ... }` (descendant), NO como selector compound `.theme-editorial-v3.dark`
    - `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` está VACÍO
    - `git diff HEAD -- src/app/globals.css | grep '^+' | grep -E '\.theme-editorial[^-]'` está VACÍO (legacy frozen)
    - El bloque dark mantiene `--paper-grain:none;--paper-fibers:none;background-image:none`
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Auditoría dark documentada en DARK-AUDIT.md; overrides dark agregados solo donde el contraste falla (descendant-only); grain OFF confirmado; legacy frozen; typecheck verde.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint — verificación visual dark de las 5 superficies</name>
  <what-built>
    Auditoría dark de las 5 superficies v3 (3 pantallas + sidebar v3 + mobile-nav v3), con overrides dark agregados solo donde el contraste falló. El bloque base `.dark .theme-editorial-v3` ya matchea el mock; los acentos se auditaron sobre charcoal.
  </what-built>
  <how-to-verify>
    Con un workspace que tenga `ui_editorial_v3.enabled=true` (o activarlo vía el SQL de D-08 en un workspace de prueba), en el dev server (`pnpm dev`, puerto 3020):
    1. Activar tema OSCURO con el ThemeToggle del topbar (Conversaciones).
    2. Revisar las 3 pantallas v3 en dark: Conversaciones (burbujas, ficha, tags), Contactos (tabla dict, chips, tags), Pedidos (kanban dots, tarjetas, sombras). Confirmar paleta charcoal-warm fiel al mock; tags gold/indigo/verdigris legibles; sombras visibles o aceptablemente ausentes.
    3. Revisar el SIDEBAR v3 en dark: wordmark `morf·x`, categorías, item activo, footer usuario — tokens resuelven, sin grain, contraste ink/paper OK.
    4. Revisar el MOBILE-NAV v3 en dark (reducir el viewport a móvil o forzar la prop v3): abrir el Sheet — mismo charcoal, nav legible.
    5. Alternar a tema CLARO y confirmar que las 5 superficies siguen fieles (sin regresión light).
    6. Confirmar que el grain está OFF en dark (fondo plano, sin textura SVG).
  </how-to-verify>
  <resume-signal>Escribe "approved" si las 5 superficies son fieles en light+dark, o describe los problemas de contraste/paleta a corregir.</resume-signal>
</task>

</tasks>

<verification>
- Validación primaria VISUAL (checkpoint Task 2) + estática (descendant-only, legacy frozen).
- Per-commit gate: `pnpm typecheck`.
- Regla 6: solo se agregan custom properties dentro del bloque `.dark .theme-editorial-v3`; el bloque light y el legacy quedan intactos.
</verification>

<success_criteria>
- Las 5 superficies fieles al mock en dark (y sin regresión en light), confirmado por el checkpoint humano.
- Overrides dark mínimos (solo donde el contraste falla); grain OFF.
- DARK-AUDIT.md documenta cada token/acento; typecheck verde.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/04-SUMMARY.md`
</output>
