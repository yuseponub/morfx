---
phase: ui-redesign-landing
plan: '02'
subsystem: marketing-ui
tags: [editorial, tailwind-v4, theme-editorial, marketing, legal-pages, marginalia, next-intl]
requires:
  - '.theme-editorial' scope + tokens (paper-*, ink-*, rubric-*) en globals.css (shipped en ui-redesign-conversaciones Plan 01)
  - '.mx-*' utilities (marginalia, h2, h3, body-long, smallcaps, display) en globals.css
  - Plan 01 (ui-redesign-landing): marketing layout + fonts + theme-editorial root div aplicado
provides:
  - LegalSection editorial reutilizable (marginalia + body-long + rule ornament) con API
    backward-compatible extendida con props sectionNumber, subtitle, showOrnament
  - Terms page editorial (14 secciones § 1..§ 14 con marginalia)
  - Privacy page editorial (4 secciones § 1..§ 4 con marginalia)
  - Pattern TOC editorial con marginalia inline (para páginas legales futuras)
affects:
  - src/components/marketing/legal/**
  - src/app/(marketing)/[locale]/terms/**
  - src/app/(marketing)/[locale]/privacy/**
  - NO afecta src/app/(dashboard)/** (Regla NO-TOUCH)
  - NO afecta src/lib/**, src/hooks/**, src/messages/** (copy intacto — D-LND-06)
  - NO afecta src/app/globals.css (tokens + utilities ya definidos)
  - NO afecta Plan 01 files (landing/header/footer/layout/fonts intactos)
tech-stack:
  added: []
  patterns:
    - LegalSection grid md:grid-cols-[6rem_1fr] con aside marginalia sticky top-24
    - Subsection editorial: nivel 0 → .mx-h3, nivel 1+ → .mx-smallcaps (en lugar de h3/h4 genéricos)
    - TOC editorial con marginalia inline para numeración de secciones (§ N en columna izquierda)
    - Rule ornament — ❦ — como separador entre secciones (toggleable via showOrnament;
      false en la última sección para evitar duplicado con footer border-t)
    - fontFamily explícito style={{ fontFamily: 'var(--font-sans)' / 'var(--font-mono)' }}
      en UI labels y metadata para romper herencia serif (pattern de Plan 01)
    - Numeración derivada del idx del map (§ ${idx + 1}) para mantener sync con SECTION_KEYS
      sin tocar i18n messages
key-files:
  created: []
  modified:
    - src/components/marketing/legal/legal-section.tsx
    - src/app/(marketing)/[locale]/terms/page.tsx
    - src/app/(marketing)/[locale]/privacy/page.tsx
decisions:
  - D-LND-05 → aplicada en legales: las 2 páginas legales reciben el tratamiento editorial
    coherente con la home
  - D-LND-06 → aplicada: cero cambios de copy. Todas las llamadas t(...) (pageTitle,
    lastUpdated, preamble, toc, seePrivacy/seeTerms, backToLanding) preservadas byte-exact.
    Los section numbers "§ N" se generan client-side desde el idx, no vienen de i18n
  - D-LND-09 → aplicada: marginalia column md:grid-cols-[6rem_1fr] con numero § N en
    .mx-marginalia (serif italic ink-3), body en .mx-body-long, subheadings en .mx-h3 /
    .mx-smallcaps, rule ornament — ❦ — entre secciones
  - D-LND-11 → aplicada: responsive editorial — marginalia hidden en mobile (<md), single
    column; visible en ≥md con sticky scrolling
  - D-LND-12 → diferido a Plan 03: sin push intermedio
metrics:
  duration: ~25min
  completed: '2026-04-22'
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 3
  commits: 3
---

# Phase ui-redesign-landing Plan 02: Legal Pages Editorial Summary

**One-liner:** Re-skin editorial (marginalia serif italic + body-long + rule ornaments) aplicado a las 2 páginas legales públicas (terms + privacy) vía refactor backward-compatible del componente `LegalSection`, preservando byte-exact el copy de i18n.

## Tareas completadas

| Task | Nombre                                                                          | Commit    | Archivos                                               |
| ---- | ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| T1   | LegalSection editorial con marginalia + body-long + rule ornament               | `715bbfd` | `src/components/marketing/legal/legal-section.tsx`     |
| T2   | terms editorial — marginalia section numbers + body-long + ornament             | `3b340ed` | `src/app/(marketing)/[locale]/terms/page.tsx`          |
| T3   | privacy editorial — marginalia section numbers + body-long + ornament           | `0404aa6` | `src/app/(marketing)/[locale]/privacy/page.tsx`        |

Total: 3 commits atómicos, 0 archivos creados, 3 archivos modificados.

## Resumen de cambios por archivo

### `src/components/marketing/legal/legal-section.tsx`

Refactor del componente preservando API backward-compatible:

**API previa (preservada):** `{ id, heading, paragraphs, bullets, subsections, children }`

**API extendida (nuevas props opcionales):**
- `sectionNumber?: string` — número de sección (ej. `"§ 1"`) renderizado en columna marginalia
- `subtitle?: string` — subtítulo opcional bajo el heading, en `.mx-smallcaps` ink-3
- `showOrnament?: boolean` — default `true`. Si `false`, omite el rule ornament — ❦ — al cerrar

**Layout editorial aplicado:**
- `<section>` root con grid `md:grid-cols-[6rem_1fr]` + gap 10 (mobile: single column)
- `<aside>` marginalia sticky top-24 con `.mx-marginalia` (serif italic ink-3), `aria-hidden`,
  hidden en mobile (<md), visible en ≥md
- Header: h2 `.mx-h2` text-[1.5rem]/[1.875rem] ink-1 + optional subtitle `.mx-smallcaps`
- Body column: max-w-[42rem] para readability editorial
- Paragraphs → `.mx-body-long` text-[1rem] leading-[1.7] ink-2
- Bullets → `.mx-body-long` con marker:ink-4
- Subsections recursivas: nivel 0 → `.mx-h3` ink-1; nivel 1+ → `.mx-smallcaps` ink-2
  (reemplaza el h3/h4 genérico previo)
- Border de recursión subsections: `border-[var(--paper-4)]` (reemplaza `border-border`)
- Rule ornament centrado `— ❦ —` en `.mx-smallcaps text-[12px] tracking-[0.12em] ink-4`

Zero slate tokens remanentes. TypeScript clean.

### `src/app/(marketing)/[locale]/terms/page.tsx`

Re-skin editorial completo del scaffold outer sin tocar la lista `SECTION_KEYS` ni las
llamadas a `t.raw(key)`:

- **Outer wrapper:** `bg-[var(--paper-0)]` en `<div>`; `<article>` max-w-[64rem] (más ancho
  que antes para acomodar columna marginalia) con padding `px-6 py-16 md:px-8 md:py-24`
- **Page header:**
  - Eyebrow "MORFX S.A.S." → `.mx-smallcaps text-[11px] tracking-[0.12em] var(--rubric-2)` con
    `fontFamily: 'var(--font-sans)'` explícito
  - H1 → `.mx-display text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]` leading-[1.02]
    tracking-[-0.02em] ink-1
  - lastUpdated → `text-[12px] tracking-[0.02em] ink-3` con `fontFamily: 'var(--font-mono)'`
  - Border-b `var(--paper-4)` pb-10 (reemplaza `border-border`)
- **Preamble:** `.mx-body-long leading-[1.7]` ink-2 max-w-[42rem]
- **TOC editorial:** `border-l-2 var(--ink-2) bg-[var(--paper-1)] p-6`, heading
  `.mx-smallcaps` ink-3, cada `<li>` con `§ N` en `.mx-marginalia` ink-4 + link
  `underline-offset-[3px]` hover ink-1 underline
- **Secciones:** cada `<LegalSection>` recibe `sectionNumber={`§ ${idx + 1}`}` derivado del
  map; `showOrnament={idx < sections.length - 1}` suprime el ornament en la última sección
  para evitar duplicado con el footer border-t
- **Footer nav:** `border-t var(--paper-4)` + links ink-2→ink-1 con underline-offset editorial

**Copy intacto:** 6 llamadas `t(...)` preservadas byte-exact: `pageTitle`, `lastUpdated`,
`preamble`, `toc`, `seePrivacy`, `backToLanding`. Las strings literales "MORFX S.A.S." y los
"§ N" son generados (no venían de i18n en el original — el literal "MORFX S.A.S." ya estaba
hardcoded en el archivo previo).

### `src/app/(marketing)/[locale]/privacy/page.tsx`

Misma transformación byte-exact que terms, adaptada a las 4 secciones de privacy
(`section7`, `section8`, `sectionContact`, `sectionEffective`):

- Mismo outer wrapper `bg-[var(--paper-0)]` + article max-w-[64rem]
- Mismo page header (eyebrow + display + lastUpdated mono)
- Mismo preamble body-long
- Mismo TOC editorial con `§ 1..§ 4` marginalia
- 4 `<LegalSection>` con `sectionNumber="§ 1"..."§ 4"` derivado del idx; `showOrnament`
  false en la última
- Footer nav apunta a `/terms` (link cruzado) y `/`

**Copy intacto:** 6 llamadas `t(...)` preservadas byte-exact: `pageTitle`, `lastUpdated`,
`preamble`, `toc`, `seeTerms`, `backToLanding`.

## Verificación de Success Criteria (Plan 02)

| Check | Descripción                                                                                                     | Result                         |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1     | `npx tsc --noEmit` clean en los 3 archivos scope                                                                | **PASS** (0 errores globales)  |
| 2     | `grep -q "mx-marginalia" src/components/marketing/legal/legal-section.tsx`                                      | **PASS**                       |
| 3     | `grep -q "mx-display" src/app/(marketing)/[locale]/terms/page.tsx`                                              | **PASS**                       |
| 4     | `grep -q "mx-display" src/app/(marketing)/[locale]/privacy/page.tsx`                                            | **PASS**                       |
| 5     | `grep -rE "bg-background\|text-foreground\|border-border"` en los 3 archivos scope                              | **PASS** (0 matches)           |
| 6     | `grep -rE "hsl\(var\(--"` en los 3 archivos scope                                                               | **PASS** (0 matches)           |
| 7     | Copy intacto: todas las `t(...)` preservadas byte-exact                                                         | **PASS** (12 calls total, 6 por página, sin adiciones ni removals) |
| 8     | 02-SUMMARY.md committed                                                                                         | **PASS** (commit separado al final) |

## Decisiones aplicadas (tabla completa)

| Decisión | Estado | Aplicación concreta |
| -------- | ------ | ------------------- |
| D-LND-05 páginas coherentes | Aplicada | Terms y privacy reciben el mismo tratamiento editorial que la home |
| D-LND-06 copy intacto | **PASS** | Las 12 llamadas `t(...)` (6 en terms + 6 en privacy) preservadas byte-exact. Los "§ N" son client-side generados, no vienen de i18n |
| D-LND-09 marginalia legal pages | Aplicada | Grid `md:grid-cols-[6rem_1fr]` con § N en `.mx-marginalia` ink-3, body `.mx-body-long`, subheadings `.mx-h3/.mx-smallcaps`, rule ornament `— ❦ —` entre secciones |
| D-LND-11 responsive breakpoints | Aplicada | Marginalia `hidden md:block`; display text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] |
| D-LND-12 push único | Diferido a Plan 03 | Ningún push intermedio ejecutado |

## Desviaciones del plan

### Auto-fixes aplicados

**1. [Rule 2 - Font inheritance fix] fontFamily explícito en UI labels y metadata.**

- **Found during:** T2 (terms)
- **Issue:** Bajo `.theme-editorial` el root font es serif. Labels UI ("MORFX S.A.S.", TOC
  heading) y metadata mono (lastUpdated) requieren font-family explícito para romper la
  herencia serif — pattern documentado en LEARNINGS del Plan 01 (serif-inherit pitfall).
- **Fix:** `style={{ fontFamily: 'var(--font-sans)' }}` en eyebrow + TOC heading;
  `style={{ fontFamily: 'var(--font-mono)' }}` en lastUpdated.
- **Files modified:** terms/page.tsx, privacy/page.tsx (idéntico en ambos).
- **Commits:** T2 (`3b340ed`), T3 (`0404aa6`).

**2. [Rule 2 - Ornament duplication avoidance] showOrnament=false en última sección.**

- **Found during:** T2 (terms)
- **Issue:** Si cada `<LegalSection>` renderea su rule ornament por default, la última
  sección produce un ornament `— ❦ —` justo antes del `<footer>` que también tiene border-t.
  Visualmente es ruido redundante.
- **Fix:** Pasar `showOrnament={idx < sections.length - 1}` — true para todas menos la
  última. Requirió agregar la prop opcional `showOrnament` al componente en T1 (diseñada
  precisamente para este caso).
- **Files modified:** terms/page.tsx, privacy/page.tsx, legal-section.tsx (prop definition).
- **Commits:** T1 (`715bbfd`), T2, T3.

**3. [Rule 2 - Subsection hierarchy] nivel 1+ switch a mx-smallcaps en lugar de h4 genérico.**

- **Found during:** T1 refactor
- **Issue:** La versión previa usaba h3 para level 0 y h4 para level 1+ con la misma clase
  `text-base font-semibold`. En contexto editorial con `.mx-body-long` serif para párrafos,
  un h4 semi-bold serif genérico queda visualmente indistinguible del body. Necesita un
  tratamiento distinto.
- **Fix:** Level 0 usa `.mx-h3` (text-[1.25rem] ink-1 serif); level 1+ usa `.mx-smallcaps`
  text-[12px] tracking-[0.12em] ink-2 uppercase. Semánticamente sigue siendo h4, pero el
  styling lo separa visualmente como rubric editorial.
- **Files modified:** legal-section.tsx.
- **Commit:** T1 (`715bbfd`).

### Items fuera de scope detectados

Ninguno. Plan 02 scope se respetó estrictamente:
- `src/components/marketing/legal/legal-section.tsx` ✓
- `src/app/(marketing)/[locale]/terms/page.tsx` ✓
- `src/app/(marketing)/[locale]/privacy/page.tsx` ✓

Cero cambios en `src/app/(dashboard)/`, `src/lib/`, `src/hooks/`, `src/messages/`,
`src/app/globals.css`, ni en los 8 archivos de Plan 01.

## Auth gates

Ninguno. Ejecución 100% autónoma dentro del worktree.

## Patterns descubiertos (input para LEARNINGS de Plan 03)

1. **Marginalia sticky para documentos largos:** En `.theme-editorial`, el patrón revista
   tradicional de "números de sección en el margen" se implementa con grid
   `md:grid-cols-[6rem_1fr]` + aside `sticky top-24 self-start`. El number acompaña el scroll
   mientras el cuerpo avanza — UX editorial coherente con revistas impresas.

2. **Section number derivation del idx:** En lugar de agregar una nueva llave al JSON de
   i18n (ej. `section1.number: "§ 1"`), derivarlo del idx del map es: (a) evita tocar copy
   (D-LND-06), (b) automático cuando se reordenan secciones, (c) localizable trivialmente si
   se quiere "§ N" en ES y "Art. N" en EN (aplicar `locale === 'es' ? '§' : 'Art.'`).

3. **Ornament suppression pattern:** `showOrnament={idx < sections.length - 1}` en map de
   secciones evita el ruido visual del ornament duplicado antes del footer. Si `LegalSection`
   se usa suelto (ej. dentro de otro layout), `showOrnament` default true es el fallback
   correcto.

4. **TOC editorial con marginalia inline:** La TOC como lista de `§ N ∣ heading` con el `§ N`
   en `.mx-marginalia` ink-4 + link con `underline-offset-[3px]` hover ink-1 replica el
   feeling de índice impreso. `border-l-2 ink-2 bg paper-1` lo separa visualmente del body
   sin usar box-shadow (anti-editorial).

5. **Subsection hierarchy adaptation:** En contexto editorial, h3/h4 genéricos no son
   suficientes — el contraste visual serif-vs-sans separa mejor los niveles. `.mx-h3` para
   level 0 (subtítulos substanciales) + `.mx-smallcaps` para level 1+ (rubrics internos)
   funciona mejor que h3/h4 uniformes.

## Self-Check

### Commits existen en git log
- `715bbfd` (T1 legal-section editorial) → verificado con `git log --oneline`
- `3b340ed` (T2 terms editorial) → verificado
- `0404aa6` (T3 privacy editorial) → verificado

### Archivos modificados persisten con contenido esperado
- `src/components/marketing/legal/legal-section.tsx` → contiene `mx-marginalia`, `mx-h2`,
  `mx-body-long`, `mx-smallcaps`, `— ❦ —`
- `src/app/(marketing)/[locale]/terms/page.tsx` → contiene `mx-display`, `mx-marginalia`,
  `§ ${idx + 1}`, `LegalSection` con `sectionNumber` prop
- `src/app/(marketing)/[locale]/privacy/page.tsx` → contiene `mx-display`, `mx-marginalia`,
  `§ ${idx + 1}`, `LegalSection` con `sectionNumber` prop

### Out-of-scope check (Regla NO-TOUCH)
- Cero cambios en `src/app/(dashboard)/`
- Cero cambios en `src/lib/`, `src/hooks/`, `src/messages/`
- Cero cambios en `src/app/globals.css` (D-LND scope)
- Cero cambios en archivos de Plan 01 (landing/header/footer/layout/fonts)

### DoD greps
- `grep -q "mx-marginalia" legal-section.tsx` → PASS
- `grep -q "mx-display" terms/page.tsx` → PASS
- `grep -q "mx-display" privacy/page.tsx` → PASS
- Slate tokens en 3 archivos scope → 0
- hsl() antipattern en 3 archivos scope → 0
- mx-* utility usage count en 3 archivos scope → 19

### TypeScript
- `npx tsc --noEmit` → 0 errores globales

## Self-Check: PASSED
