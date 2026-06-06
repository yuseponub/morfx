# Auditoría Dark — ui-redesign-editorial-shell (D-06)

**Fecha:** 2026-06-06
**Plan:** 04 (Wave 3) — Task 1 (auto)
**Alcance:** Las 5 superficies v3 en modo oscuro: (1) Conversaciones, (2) Contactos, (3) Pedidos, (4) sidebar v3 (Plan 01), (5) mobile-nav v3 (Plan 03), auditadas token-por-token contra el bloque mock `.theme-editorial.dark`.
**Reference dark:** `handoff/ui_kits/crm/crm-editorial.html` líneas 252-258 (los 3 mocks crm/conversaciones/pedidos son idénticos; no hay otra fuente — design-system y colors_and_type.css son light-only).
**Bloque auditado:** `src/app/globals.css` `.dark .theme-editorial-v3 { ... }` (~1363-1378) + `.wm img` dark (~1379).

---

## 1. Confirmación del bloque base dark (token-por-token vs mock)

El bloque `.dark .theme-editorial-v3` se comparó línea-por-línea contra `.theme-editorial.dark` del mock. Tras los cambios de Plans 01 (sidebar APPEND) y 03 (mobile-nav, 0 APPEND CSS), el bloque base **sigue byte-idéntico** al mock (Plans 01/03 NO tocaron el bloque dark — solo hicieron APPEND de reglas LIGHT del sidebar que heredan estos tokens por cascade).

| Token | globals.css (`.dark .theme-editorial-v3`) | Mock `.theme-editorial.dark` | Veredicto |
|-------|-------------------------------------------|------------------------------|-----------|
| `--bg-app` | `oklch(0.215 0.006 60)` | `oklch(0.215 0.006 60)` | match con mock ✅ |
| `--bg-sidebar` | `oklch(0.215 0.006 60)` | `oklch(0.215 0.006 60)` | match con mock ✅ |
| `--paper-0` | `oklch(0.255 0.006 60)` | `oklch(0.255 0.006 60)` | match con mock ✅ |
| `--paper-1` | `oklch(0.235 0.006 60)` | `oklch(0.235 0.006 60)` | match con mock ✅ |
| `--paper-2` | `oklch(0.285 0.007 60)` | `oklch(0.285 0.007 60)` | match con mock ✅ |
| `--paper-3` | `oklch(0.315 0.008 60)` | `oklch(0.315 0.008 60)` | match con mock ✅ |
| `--paper-4` | `oklch(0.355 0.009 60)` | `oklch(0.355 0.009 60)` | match con mock ✅ |
| `--ink-1` | `oklch(0.95 0.006 85)` | `oklch(0.95 0.006 85)` | match con mock ✅ |
| `--ink-2` | `oklch(0.86 0.008 85)` | `oklch(0.86 0.008 85)` | match con mock ✅ |
| `--ink-3` | `oklch(0.70 0.010 80)` | `oklch(0.70 0.010 80)` | match con mock ✅ |
| `--ink-4` | `oklch(0.56 0.010 75)` | `oklch(0.56 0.010 75)` | match con mock ✅ |
| `--ink-5` | `oklch(0.42 0.010 70)` | `oklch(0.42 0.010 70)` | match con mock ✅ |
| `--border` | `oklch(0.37 0.008 70)` | `oklch(0.37 0.008 70)` | match con mock ✅ |
| `--rubric-2` | `oklch(0.64 0.11 30)` | `oklch(0.64 0.11 30)` | match con mock ✅ |
| `--rubric-1` | `oklch(0.72 0.10 30)` | `oklch(0.72 0.10 30)` | match con mock ✅ |
| `--paper-grain` | `none` | `none` | match con mock ✅ |
| `--paper-fibers` | `none` (superset) | (no declarado) | ✅ superset correcto (apaga la fibra del scope v3 light que el mock no tiene) |
| `background-image` | `none` | (no declarado) | ✅ correcto (anula grain+fibers del scope light v3) |
| `.wm img` dark | `mix-blend-mode:screen;filter:invert(1) hue-rotate(180deg)` | idéntico | match con mock ✅ |

**Conclusión base:** el bloque base dark se CONFIRMA byte-idéntico al mock — no se reinventó nada (RESEARCH §"Auditoría Dark" ya lo había verificado; este plan revalida tras Plans 01/03 y lo ratifica).

---

## 2. Auditoría de acentos NO-overrideados en dark (el delta REAL de D-06)

Estos acentos NO se overridean en el bloque dark, por lo que en dark **heredan sus valores light** del scope `.theme-editorial-v3`. Se evaluó su legibilidad/contraste como tinta sobre el charcoal-warm (`--paper-0` = `oklch(0.255 ...)`, fondo de tag ~L 0.27).

| Acento | Valor light heredado | Uso en dark | Veredicto |
|--------|----------------------|-------------|-----------|
| `--accent-gold` | `oklch(0.68 0.055 80)` | tag `--gold` (texto = `color-mix(gold 60%, ink-1=0.95)` → se aclara; dots) | **OK sin cambio** — L=0.68 + el mix con ink-1 claro lo hace legible sobre charcoal. |
| `--accent-verdigris` | `oklch(0.52 0.035 180)` | tag `--verdigris` (texto = `var(--accent-verdigris)` directo) | **OK sin cambio** — L=0.52 sobre fondo ~L 0.27: diferencia ~0.25 con croma bajo; marginal pero legible. No sobre-ingenierizar (A4 RESEARCH). |
| `--accent-indigo` | `oklch(0.42 0.045 260)` | tag `--indigo` (texto = `var(--accent-indigo)` directo) + `--semantic-info` | **override agregado: `oklch(0.62 0.07 260)`** — L=0.42 es demasiado oscuro como tinta sobre charcoal (texto L=0.42 sobre fondo ~L 0.27 → contraste insuficiente). Se aclara a L~0.62 manteniendo hue 260, mismo principio con que el mock aclara `--rubric` en dark (0.55→0.64). |
| `--semantic-success` | `oklch(0.50 0.08 145)` | tag `--success` (texto = `color-mix(success 65%, ink-1=0.95)` → se aclara) | **OK sin cambio** — el mix con ink-1 claro lo eleva por encima del umbral legible. |
| `--semantic-warning` | `oklch(0.58 0.12 65)` | dots/badges sobre charcoal | **OK sin cambio** — L=0.58 + croma alto destaca sobre el charcoal. |
| `--paper-shadow` | `oklch(0.85 0.012 70)` | sombra de papel (light) | **OK sin cambio** — sin uso visual relevante en dark; el mock no lo declara dark. |
| `--shadow-card` / `--shadow-page` / `--shadow-raised` / `--shadow-hair` | colores `oklch(0.25-0.3 0.04 60 / alpha)` | sombras de tarjetas | **OK sin cambio** — sobre charcoal las sombras casi desaparecen, lo cual es ACEPTABLE y esperado en dark: las superficies se separan por los steps `--paper-0..4` + `--border`, no por sombra. El mock NO declara sombras dark (confirma que su ausencia es by-design). |

**Resumen de acentos:** 6 acentos/grupos "OK sin cambio" · 1 override agregado (`--accent-indigo`).

---

## 3. Confirmación del grain OFF en dark

El bloque dark mantiene textura OFF en las 5 superficies (GAP-04 del core):
- `--paper-grain:none;` ✅
- `--paper-fibers:none;` ✅
- `background-image:none;` ✅ (anula el `background-image:var(--paper-grain),var(--paper-fibers)` del scope light)

El sidebar v3 además declara `.theme-editorial-v3 .sb { background-image:none }` (Plan 01) → plano en light y dark. **Grain OFF confirmado.**

---

## 4. Resultado por superficie (cobertura por cascade)

Las 5 superficies llevan la clase `.theme-editorial-v3` (en `<main>` para las 3 pantallas; en el `<aside>` del sidebar v3 — Opción B Plan 01; en el `<SheetContent>` del mobile-nav v3 — Plan 03). El descendant `.dark .theme-editorial-v3` (con `.dark` puesto por next-themes en `<html>`) las cubre a TODAS por cascade — sin reglas dark por-superficie.

| Superficie | Scope dark | Tokens cubiertos | Resultado |
|------------|-----------|------------------|-----------|
| Conversaciones (inbox v3) | `<main>` | base + acentos | charcoal-warm fiel al mock; indigo ahora legible. Pendiente confirmación visual (Task 2). |
| Contactos (`table.dict`, chips, tags) | `<main>` | base + acentos | tags gold/indigo/verdigris legibles tras el fix. Pendiente confirmación visual. |
| Pedidos (kanban dots, tarjetas, sombras) | `<main>` | base + acentos + sombras | dots success/warning OK; sombras ausentes-aceptables; separación por `--paper`/`--border`. Pendiente confirmación visual. |
| Sidebar v3 | `<aside class="sb theme-editorial-v3">` | base (paper/ink/border/rubric) | sin grain (`.sb` plano `--paper-2`); contraste ink/paper OK por cascade. Pendiente confirmación visual. |
| Mobile-nav v3 | `<SheetContent class="theme-editorial-v3 sb">` | base (reuso total clases sidebar) | mismo charcoal del sidebar; nav legible. Pendiente confirmación visual. |

---

## 5. Verificación estática (Regla 6 / D-09)

- `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` → **VACÍO** (descendant-only, sin compound — Pitfall 3).
- `git diff HEAD -- src/app/globals.css | grep '^+' | grep -E '\.theme-editorial[^-]'` → **VACÍO** (legacy frozen — no se tocó `.theme-editorial` sin guion ni el bloque legacy).
- El único cambio en globals.css es el override `--accent-indigo` AGREGADO **dentro** del bloque `.dark .theme-editorial-v3 { ... }` existente (custom property, no selector nuevo). El bloque light `.theme-editorial-v3` (1031+) y las reglas del sidebar v3 light quedan intactos.
- Grain OFF preservado (`--paper-grain:none;--paper-fibers:none;background-image:none`).
- `pnpm exec tsc --noEmit` → 0 errores nuevos en archivos tocados (cambio es CSS puro; no afecta tipos).

---

## 6. Veredicto de la auditoría (estática)

- **Bloque base dark:** CONFIRMADO byte-idéntico al mock (sin cambios, sin regresión por Plans 01/03).
- **Acentos:** 6 OK sin cambio · 1 override mínimo (`--accent-indigo` aclarado para legibilidad como tinta de tag sobre charcoal).
- **Grain:** OFF en las 5 superficies.
- **Regla 6:** override descendant-only dentro del bloque dark; legacy + light frozen.

**Pendiente (Task 2 — checkpoint humano):** validación VISUAL de las 5 superficies en dark + light en el dev server (`pnpm dev`, :3020) con un workspace `ui_editorial_v3.enabled=true`. La auditoría estática autoriza el override; el ojo humano confirma fidelidad y que no quede ningún otro acento ilegible.
