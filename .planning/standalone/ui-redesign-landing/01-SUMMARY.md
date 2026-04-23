---
phase: ui-redesign-landing
plan: '01'
subsystem: marketing-ui
tags: [editorial, tailwind-v4, theme-editorial, marketing, next-font, i18n]
requires:
  - '.theme-editorial' scope + tokens (paper-*, ink-*, rubric-*) en globals.css (shipped en ui-redesign-conversaciones Plan 01)
  - '.mx-*' utilities (display, h1, body-long, smallcaps, caption, rubric) en globals.css
  - Next.js 15 App Router per-segment font loading
  - next/font/google (EB_Garamond, Inter, JetBrains_Mono)
provides:
  - Marketing layout editorial (fonts + theme-editorial root)
  - Header editorial (paper-0 + ink-1 press CTA)
  - Footer editorial (paper-3 + smallcaps + mono metadata)
  - Home sections editorial (Hero, About, ProductSection, CTA)
  - Patrón reutilizable de CTA button editorial (ink-1 press) para Plan 02 (legal pages)
affects:
  - src/app/(marketing)/** (scope completo del segment)
  - NO afecta src/app/(dashboard)/** (Regla NO-TOUCH)
  - NO afecta src/lib/**, src/hooks/**, src/messages/** (copy intacto)
tech-stack:
  added: []
  patterns:
    - Per-segment font loader (Next 15) para aislar EB Garamond/Inter/JetBrains a rutas de marketing
    - .theme-editorial unconditional en wrapper (diff vs dashboard que lo gate con InboxV2Provider)
    - CTA button editorial ink-1 press con rounded-[4px] + active:translate-y-px (copiado byte-exact del composer Send button del inbox v2)
    - Form controls con style={{ fontFamily: 'var(--font-sans)' }} para romper herencia serif en botones y metadata mono
    - Rule ornaments '— ❦ —' + horizontal rules h-px w-20 como section dividers editoriales
key-files:
  created:
    - src/app/(marketing)/fonts.ts
  modified:
    - src/app/(marketing)/[locale]/layout.tsx
    - src/components/marketing/header.tsx
    - src/components/marketing/footer.tsx
    - src/components/marketing/landing/hero.tsx
    - src/components/marketing/landing/about.tsx
    - src/components/marketing/landing/product-section.tsx
    - src/components/marketing/landing/cta.tsx
decisions:
  - D-LND-01 → aplicada: aesthetic editorial extrapolado del dashboard (mx-display en hero + cta closing, rule ornaments entre secciones)
  - D-LND-03 → aplicada: fonts loader dedicado `src/app/(marketing)/fonts.ts` análogo a whatsapp/fonts.ts
  - D-LND-04 → aplicada: `.theme-editorial` unconditional en wrapper (sin flag)
  - D-LND-06 → aplicada: cero cambios de copy. Todas las llamadas `t(...)` intactas
  - D-LND-07 → aplicada: ThemeToggle removido del marketing header (import + uso eliminados)
  - D-LND-08 → aplicada: logo light-only (`/logo-light.png`); versión `/logo-dark.png` removida de header y footer
  - D-LND-10 → aplicada: CTAs primarios usan el patrón exact del composer Send button (bg-ink-1, border-ink-1, hover-ink-2, active:translate-y-px, rounded-[4px])
metrics:
  duration: ~40min
  completed: '2026-04-22'
  tasks_completed: 8
  tasks_total: 8
  files_created: 1
  files_modified: 7
  commits: 8
---

# Phase ui-redesign-landing Plan 01: Marketing Layout + Home Editorial Summary

**One-liner:** Re-skin editorial (paper/ink + EB Garamond + rule ornaments) aplicado al shell público de marketing (layout + header + footer) y a las 4 secciones de la home (Hero, About, ProductSection, CTA).

## Tareas completadas

| Task | Nombre                               | Commit    | Archivos                                               |
| ---- | ------------------------------------ | --------- | ------------------------------------------------------ |
| T1   | Loader de fuentes marketing          | `91c5a8b` | `src/app/(marketing)/fonts.ts` (NEW, 42 LOC)           |
| T2   | Marketing layout editorial           | `a5486be` | `src/app/(marketing)/[locale]/layout.tsx`              |
| T3   | Header editorial                     | `525dd99` | `src/components/marketing/header.tsx`                  |
| T4   | Footer editorial                     | `b4f5913` | `src/components/marketing/footer.tsx`                  |
| T5   | Hero editorial                       | `0e9addf` | `src/components/marketing/landing/hero.tsx`            |
| T6   | About editorial                      | `6e409b3` | `src/components/marketing/landing/about.tsx`           |
| T7   | Product section editorial            | `00e06d5` | `src/components/marketing/landing/product-section.tsx` |
| T8   | CTA closing editorial                | `c8bcf16` | `src/components/marketing/landing/cta.tsx`             |

Total: 8 commits atómicos, 1 archivo creado, 7 archivos modificados.

## Resumen de cambios por archivo

### `src/app/(marketing)/fonts.ts` (NEW)
Análogo a `src/app/(dashboard)/whatsapp/fonts.ts`. Exporta `ebGaramond`, `inter`, `jetbrainsMono` con variables CSS (`--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`). Weights incluidos para EB Garamond: 400/500/600/700/800 (el mx-display del hero requiere 800).

### `src/app/(marketing)/[locale]/layout.tsx`
- Import añadido: `import { ebGaramond, inter, jetbrainsMono } from '../fonts'`.
- Wrapper div: aplica las 3 variables + `.theme-editorial` unconditional.
- Removido: `bg-background text-foreground` (tokens editoriales lo reemplazan via `.theme-editorial`).

### `src/components/marketing/header.tsx`
- `sticky top-0 z-40 border-b border-[var(--ink-2)] bg-[var(--paper-0)]` (reemplaza backdrop-blur slate).
- Logo: solo `/logo-light.png` (removida la variante dark y las clases `dark:hidden`/`dark:block`).
- Removido: `ThemeToggle` + su import (D-LND-07).
- Login Button: ghost editorial (text-ink-2 → ink-1 hover), font sans vía style.
- "Empezar/Contact Sales" CTA: ink-1 press pattern (D-LND-10).

### `src/components/marketing/footer.tsx`
- `bg-[var(--paper-3)] border-t border-[var(--ink-2)] py-12`.
- Logo light-only.
- Section headings → `mx-smallcaps text-[11px] var(--ink-3)`.
- Links → `text-[13px] var(--ink-2)` con hover ink-1 + underline-offset editorial.
- Contact labels → `mx-smallcaps text-[10px] var(--ink-4)`; contact values → `font-mono text-[12px] var(--ink-2)`.
- Bottom legal bar (NIT, razón social MORFX S.A.S., dirección, CIIU 6201) → `font-mono text-[11px] var(--ink-3)`.

### `src/components/marketing/landing/hero.tsx`
- `bg-[var(--paper-0)] border-b border-[var(--ink-2)]` reemplaza `bg-gradient-to-b`.
- Eyebrow: `mx-smallcaps var(--rubric-2)` (reemplaza pill `rounded-full border`).
- Headline: `mx-display text-[3rem]→[6rem]` responsive, `font-[800]`, `leading-[0.95]`, `tracking-[-0.02em]`, `var(--ink-1)`.
- Rule editorial entre headline y subhead: `<div className="my-8 h-px w-20 bg-[var(--ink-1)]" />`.
- Subhead: `mx-body-long` text-[1.125rem]/[1.25rem] `var(--ink-2)`.
- CTAs: primary `ink-1 press` + secondary outline `ink-1` (ambos con font-sans via style).
- responseTag: `mx-caption var(--ink-3)`.

### `src/components/marketing/landing/about.tsx`
- `bg-[var(--paper-0)] border-b border-[var(--ink-2)]`.
- Rule ornament '— ❦ —' centrado al tope.
- Eyebrow: `mx-smallcaps var(--rubric-2)`.
- Heading: `mx-h1 text-[2rem]→[2.75rem]` `var(--ink-1)`.
- Intro: `mx-body-long leading-[1.7]` `var(--ink-2)`.
- `objetoSocial` blockquote: italic + `border-l var(--rubric-2)` + `leading-[1.7]`.
- `objetoSocialSource`: font-mono text-[11px] ink-3.
- Legal data labels → mx-smallcaps ink-4; values → font-mono text-[13px] ink-1.

### `src/components/marketing/landing/product-section.tsx`
- `bg-[var(--paper-0)] odd:bg-[var(--paper-1)]` (alternancia paper-0/paper-1 entre secciones de producto).
- Icon container: `rounded-[6px] border var(--paper-4) bg var(--paper-0)`, icono `text-[var(--ink-1)] strokeWidth={1.5}`.
- Heading: `mx-h1 text-[2rem]→[2.75rem]` `var(--ink-1)`.
- Description: `mx-body-long leading-[1.7]` `var(--ink-2)`.
- Bullets: check boxes `rounded-[3px] border var(--ink-3)` (reemplaza `rounded-full bg-primary/10`); texto `mx-body var(--ink-2)`.
- Illustration Card: `bg-[var(--paper-2)] border var(--paper-4)` + icono `text-[var(--ink-2)] strokeWidth={1.25}` + label `mx-smallcaps` con font-mono.

### `src/components/marketing/landing/cta.tsx`
- `bg-[var(--paper-1)] border-t var(--paper-4) py-24/32` (reemplaza card rounded-2xl).
- Rule ornament '— ❦ —' al tope.
- Heading: `mx-display text-[2.5rem]→[4rem]` responsive, `leading-[1]` `var(--ink-1)`.
- Description: `mx-body-long max-w-xl` `var(--ink-2)`.
- Primary CTA (WhatsApp): ink-1 press pattern con icono MessageSquare preservado.
- Secondary CTA (Email): outline ink-1 editorial con icono Mail.
- contactLine: `font-mono text-[12px] var(--ink-3)`.

## Verificación de Success Criteria (Plan 01)

| Check | Descripción                                                                             | Result                         |
| ----- | --------------------------------------------------------------------------------------- | ------------------------------ |
| 1     | `npx tsc --noEmit` en los 8 archivos scope                                              | **PASS** (0 errores)           |
| 2     | `grep -q "theme-editorial" layout.tsx`                                                  | **PASS**                       |
| 3     | `grep -rE "bg-background\|text-foreground\|border-border"` en archivos de **Plan 01 scope** | **PASS** (0 matches)       |
| 4     | `grep -rE "hsl\(var\(--"` en marketing/                                                 | **PASS** (0 matches)           |

### Nota sobre Check 3 (out-of-scope)

Un grep global `grep -rE "bg-background|text-foreground|border-border" src/components/marketing/ src/app/(marketing)/` reporta 28 matches remanentes, pero **TODOS viven en archivos de Plan 02 scope**:

- `src/components/marketing/legal/legal-section.tsx` (6 matches)
- `src/app/(marketing)/[locale]/terms/page.tsx` (10 matches)
- `src/app/(marketing)/[locale]/privacy/page.tsx` (12 matches)

Estos archivos se re-skin en Wave 2 (Plan 02). No se tocan en Plan 01 por D-LND-scope del CONTEXT y por el files-modified explícito del PLAN.md (Plan 01 lista solo 8 archivos; Plan 02 lista los 3 legales). El success criteria del PLAN.md dice "0 matches" globales pero eso describe el estado al cierre de **Wave 2**, no Wave 1 — confirmado al releer `.planning/standalone/ui-redesign-landing/PLAN.md` líneas 46-51. La verificación correcta para Plan 01 es grep limitado a los 8 archivos scope, que pasa con 0 matches.

## Decisiones aplicadas (tabla completa)

| Decisión | Estado | Aplicación concreta |
| -------- | ------ | ------------------- |
| D-LND-01 aesthetic editorial extrapolado | Aplicada | `mx-display` en Hero + CTA closing; rule ornaments `— ❦ —` en About + CTA |
| D-LND-02 sin feature flag | Aplicada (no code) | `.theme-editorial` unconditional en layout wrapper |
| D-LND-03 fonts loader marketing | Aplicada | `src/app/(marketing)/fonts.ts` creado |
| D-LND-04 theme-editorial unconditional | Aplicada | `flex min-h-screen flex-col` + `theme-editorial` siempre en wrapper |
| D-LND-05 3 páginas coherentes | N/A en Plan 01 | Legal pages en Plan 02 |
| D-LND-06 copy intacto | **PASS** | `git diff` confirma: cero cambios en strings (solo className/structure/tags) |
| D-LND-07 ThemeToggle removido | Aplicada | Import + uso eliminados de header.tsx |
| D-LND-08 logo light-only | Aplicada | Header y footer usan solo `/logo-light.png` |
| D-LND-09 marginalia legal pages | N/A en Plan 01 | Plan 02 |
| D-LND-10 CTA button pattern | Aplicada | 3 CTAs ink-1 press (Header, Hero primary, CTA primary) + 2 outline (Hero secondary, CTA secondary) |
| D-LND-11 responsive breakpoints | Aplicada | `text-[3rem] sm:[4rem] md:[5.5rem] lg:[6rem]` en hero; otros sections idem |
| D-LND-12 push único al final | Diferido a Plan 03 | Sin push intermedio ejecutado |

## Desviaciones del plan

### Auto-fixes aplicados

**1. [Rule 2 - Typography inheritance fix] Form/CTA buttons con fontFamily explícito via style.**

- **Found during:** T3 (Header)
- **Issue:** Los `<Button>` del shadcn heredan el `font-family` del contexto. Dentro de `.theme-editorial`, el body usa serif (EB Garamond). Sin override, los CTAs como "Contact Sales" se renderizarían en serif pesado, rompiendo la jerarquía editorial (serif para display/headings, sans para UI controls).
- **Fix:** Todos los CTAs añaden `style={{ fontFamily: 'var(--font-sans)' }}` para forzar Inter. Documentado en scope_boundaries como "Form controls inheriting serif pitfall" del CONTEXT del LEARNINGS de ui-redesign-conversaciones.
- **Files modified:** header.tsx (2 buttons), hero.tsx (2 buttons), cta.tsx (2 buttons).
- **Commits:** T3 (`525dd99`), T5 (`0e9addf`), T8 (`c8bcf16`).

**2. [Rule 2 - Font inheritance fix] Metadata mono con fontFamily explícito.**

- **Found during:** T4 (Footer)
- **Issue:** `font-mono` (Tailwind utility) mapea a `--font-mono`, pero `.theme-editorial` override esa variable a JetBrains Mono. Sin el style explícito, algunos elementos metadata (contact values, legal metadata, mono captions) podrían heredar stack serif del root.
- **Fix:** Metadata blocks añaden `style={{ fontFamily: 'var(--font-mono)' }}` para garantizar JetBrains Mono.
- **Files modified:** footer.tsx (bottom legal bar), about.tsx (2 mono blocks: objetoSocialSource + legal data values), cta.tsx (contactLine), product-section.tsx (illustrationLabel).
- **Commits:** T4, T6, T7, T8.

**3. [Rule 1 - Icon weight] Icons con strokeWidth fino.**

- **Found during:** T7 (ProductSection)
- **Issue:** Default strokeWidth de lucide-react es 2, que se ve industrial/moderno. El look editorial usa líneas finas (≈1.25-1.5).
- **Fix:** `<Icon strokeWidth={1.5} />` en el icon container del ProductSection y `strokeWidth={1.25}` en el Card illustration icon. `Check` icon en bullets preserva strokeWidth=2 (símbolo pequeño, legibilidad).
- **Files modified:** product-section.tsx.
- **Commit:** T7 (`00e06d5`).

### Items deferidos a Plan 02

- Legal pages editorial re-skin (terms + privacy + legal-section.tsx): los 28 slate token matches identificados en la verificación viven aquí. Plan 02 los resolverá con pattern marginalia + body-long + rule ornaments (D-LND-09).

## Auth gates

Ninguno. Ejecución 100% autónoma dentro del worktree.

## Patterns descubiertos (input para LEARNINGS de Plan 03)

1. **Per-segment font loader en Next 15 App Router:** `src/app/(marketing)/fonts.ts` vive al nivel del route group, no dentro de `[locale]/`. Se importa desde el `layout.tsx` del `[locale]` segment via `from '../fonts'`. Next preloadea las fuentes solo en rutas del segment.

2. **Editorial aesthetic on marketing vs dashboard diff:** En dashboard el tema está gated por `InboxV2Provider` + feature flag; en marketing es unconditional. La razón: marketing es público y la review de Meta debe ver el look editorial coherente. Implicación: el primer paint del server response ya tiene el tema aplicado — cero flicker.

3. **CTA button editorial pattern (reutilizable):**
   ```
   h-auto px-[16px] py-[10px] text-[13px] font-semibold gap-1.5 active:translate-y-px
   bg-[var(--ink-1)] text-[var(--paper-0)]
   border border-[var(--ink-1)] hover:bg-[var(--ink-2)]
   rounded-[4px]
   + style={{ fontFamily: 'var(--font-sans)' }}
   ```
   Copy byte-exact del composer Send button del inbox v2. Garantiza consistencia visual entre marketing (web) y product (dashboard). Se usa en Plan 02 para CTAs en terms/privacy.

4. **Rule ornament '— ❦ —':** Separador editorial entre secciones. Vive inline como `<div className="flex justify-center mb-8"><span className="mx-smallcaps text-[12px] tracking-[0.12em] text-[var(--ink-3)]">— ❦ —</span></div>`. No requiere utility custom — reutiliza `mx-smallcaps` + letra decorativa + tracking.

5. **Serif-inherit pitfall (documentado):** Dentro de `.theme-editorial`, el root font es serif. Cualquier elemento que necesite sans (buttons, labels) o mono (metadata) DEBE setear `style={{ fontFamily: 'var(--font-sans)' }}` o `var(--font-mono)` explícito. Las utilities Tailwind (`font-sans`, `font-mono`) son suficientes en Tailwind v4 normal, pero bajo `.theme-editorial` el comportamiento es inconsistente — usar style es defensivo y confirma el font-family post-cascade.

## Self-Check

### Archivos creados existen
- `src/app/(marketing)/fonts.ts` → **FOUND**

### Commits existen en git log
- `91c5a8b` (T1) → **FOUND**
- `a5486be` (T2) → **FOUND**
- `525dd99` (T3) → **FOUND**
- `b4f5913` (T4) → **FOUND**
- `0e9addf` (T5) → **FOUND**
- `6e409b3` (T6) → **FOUND**
- `00e06d5` (T7) → **FOUND**
- `c8bcf16` (T8) → **FOUND**

### Out-of-scope check
- `git diff 1c2fd6f -- src/app/\(dashboard\)/` → 0 cambios (Regla NO-TOUCH)
- `git diff 1c2fd6f -- src/lib/ src/hooks/` → 0 cambios
- `git diff 1c2fd6f -- src/app/globals.css` → 0 cambios (D-LND scope)
- `git diff 1c2fd6f -- src/messages/` → 0 cambios (D-LND-06 copy intacto)

## Self-Check: PASSED
