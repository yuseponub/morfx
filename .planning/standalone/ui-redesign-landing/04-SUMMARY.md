---
phase: ui-redesign-landing
plan: 04
subsystem: marketing-landing
tags: [landing, marketing, pixel-perfect, editorial, mock-v2.1]
dependency-graph:
  requires: [01]
  provides: [landing-v2.1-pixel-perfect]
  affects:
    - src/components/marketing/header.tsx
    - src/components/marketing/locale-toggle.tsx
    - src/components/marketing/footer.tsx
    - src/components/marketing/landing/hero.tsx
    - src/components/marketing/landing/manifest.tsx
    - src/components/marketing/landing/modules-grid.tsx
    - src/components/marketing/landing/flow.tsx
    - src/components/marketing/landing/about.tsx
    - src/components/marketing/landing/cta.tsx
    - src/app/(marketing)/[locale]/page.tsx
tech-stack:
  added: []
  patterns:
    - Inline styles para color-mix/transforms/box-shadows compuestos (Tailwind arbitrary no soporta bien)
    - <em> injection via split() sobre i18n headline (preserva i18n key byte-exact, D-LND-06 relajada)
    - ModuleCard primitive con data-num + mod-num + title rubric-em + bullets § + mod-link
    - Writing-mode vertical-rl + rotate(180deg) para section-label editorial
    - Tape corners: 4 spans absolute rotated con accent-gold 35% background
key-files:
  created:
    - src/components/marketing/landing/manifest.tsx
    - src/components/marketing/landing/modules-grid.tsx
    - src/components/marketing/landing/flow.tsx
  modified:
    - src/components/marketing/header.tsx
    - src/components/marketing/locale-toggle.tsx
    - src/components/marketing/footer.tsx
    - src/components/marketing/landing/hero.tsx
    - src/components/marketing/landing/about.tsx
    - src/components/marketing/landing/cta.tsx
    - src/app/(marketing)/[locale]/page.tsx
  deleted:
    - src/components/marketing/landing/product-section.tsx
decisions:
  - D-LND-10 corregido: primary CTAs usan rubric-2 press pattern (bg rubric-2 + border rubric-1 + shadow rubric-1), NO ink-1
  - D-LND-08 refinado: wordmark tipográfico morf·x (punto rubric-2) en header + footer, cero logo-light/logo-dark image refs
  - D-LND-06 relajado: copy nuevo del mock v2.1 hardcoded en español (manifest, modules section heads, flow, ledger, footer dark); copy existente en i18n preservado byte-exact (Hero, About intro/objetoSocial, Header login/contactSales)
  - D-LND-13 nuevo: manifest.tsx + modules-grid.tsx + flow.tsx como componentes dedicados
  - D-LND-14 nuevo: product-section.tsx removido (reemplazado por modules-grid.tsx)
metrics:
  duration: ~50min
  tasks-completed: 8
  files-created: 3
  files-modified: 7
  files-deleted: 1
  commits: 8
  completed-date: 2026-04-22
---

# Plan 04 — Landing realignment al mock v2.1 Summary

**One-liner:** Realineación pixel-perfect de landing + shell al mock `landing.html` v2.1 del design handoff, introduciendo 3 secciones nuevas (Manifest, ModulesGrid, Flow), corrigiendo el primary CTA a rubric-2 press pattern, migrando header a wordmark tipográfico y footer de claro a dark ink-1.

## Motivación

El Plan 01 original (commits 91c5a8b..2d3d46d, shipped 2026-04-19) construyó una landing editorial **extrapolada** sobre el token system v2.0 sin tener acceso al mock HTML específico que el usuario esperaba. El `landing.html` v2.1 vivía en la carpeta `morfx Design System (2).zip` del design handoff — no fue detectado hasta post-ship.

Plan 04 re-hace los 7 archivos afectados + crea 3 componentes nuevos usando el mock `reference/design_handoff_morfx_v2.1/mocks/landing.html` (868 líneas) como **fuente de verdad pixel-perfect**.

## Tareas ejecutadas

| Task | Descripción | Commit | Archivos |
|------|-------------|--------|----------|
| T1 | Header wordmark morf·x + nav primary + locale box + CTA rubric-2 | `fc2a802` | header.tsx, locale-toggle.tsx |
| T2 | Hero 2-col con stamp + headline rubric-em + mockup-frame WhatsApp con tape corners | `1a4f3e8` | hero.tsx |
| T3 | Componente Manifest con dashed borders + headline rubric-em (NEW) | `0d75d60` | manifest.tsx |
| T4 | Modules-grid con 5 cards (CRM/Agents/Auto/Int/Channels) + mini-mockups (NEW, -product-section) | `f47e6ae` | modules-grid.tsx, -product-section.tsx, page.tsx |
| T5 | Componente Flow diagram 3-col (origen→hub→destino) (NEW) | `9974351` | flow.tsx |
| T6 | About rehecho con ledger legal + blockquote objeto social | `61889f4` | about.tsx |
| T7 | CTA closing con ornament ❊ + Footer dark 4-col | `78c48fd` | cta.tsx, footer.tsx |
| T8 | page.tsx wire-up final (Hero→Manifest→ModulesGrid→Flow→About→CTA) | `389aefa` | page.tsx |

**Total:** 8 commits atómicos, 8 tareas completas, cero checkpoints.

## Decisiones clave

### D-LND-10 corregido — primary CTA rubric-2 press

El Plan 01 usaba `bg-[var(--ink-1)]` para el primary CTA. El mock v2.1 usa pattern rubric-2 press:

```tsx
border: 1px solid var(--rubric-1);
background: var(--rubric-2);
color: var(--paper-0);
boxShadow: '0 1px 0 var(--rubric-1)';
// hover → rubric-1
```

Aplicado en: Header "Contactar ventas", Hero primary CTA, CTA section primary button.

### D-LND-08 refinado — wordmark tipográfico

Eliminado `<Image src="/logo-light.png" />` del Header y Footer. Reemplazado por:

```tsx
<span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '30px' }}>
  morf<b style={{ color: 'var(--rubric-2)' }}>·</b>x
</span>
```

- Header: punto en `rubric-2`
- Footer dark: punto en `rubric-3` (mock line 335)

### D-LND-06 relajado — copy hardcoded

El mock v2.1 introduce copy que NO existe en `messages/{locale}.json`:
- Manifest eyebrow + headline
- Modules section head ("Cinco módulos, un solo hilo.") + 5 cards descriptions/bullets/link labels
- Flow section head + 4 nodes bodies
- About "Quiénes somos" label + ledger row labels
- CTA headline/paragraph/buttons/contact line
- Footer dark links + tagline

**Decisión pragmática:** hardcodeamos esos textos en español directamente en los Server Components. Los textos existentes en i18n (Hero badge/headline/subhead/primaryCTA/secondaryCTA/responseTag, About intro/objetoSocial, Header login/contactSales) se preservan byte-exact vía `t()`. El i18n full pass del landing v2.1 queda como fase posterior dedicada (no bloquea Meta review).

### D-LND-13 + D-LND-14 — arquitectura de componentes

- **Creados:** `manifest.tsx`, `modules-grid.tsx`, `flow.tsx` como componentes dedicados
- **Removido:** `product-section.tsx` (no corresponde al mock v2.1 — reemplazado por modules-grid con 5 cards asimétricos 12-col)

## Patrones técnicos aplicados

### Injection de `<em>` sobre i18n strings

Para preservar i18n keys byte-exact mientras se añade el italic del mock:

```tsx
function HeadlineWithEm({ text }: { text: string }) {
  const idx = text.indexOf('automatizados');
  if (idx === -1) { /* EN fallback 'automated' */ }
  return (
    <>
      {text.slice(0, idx)}
      <em style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}>automatizados</em>
      {text.slice(idx + 'automatizados'.length)}
    </>
  );
}
```

### Inline styles vs Tailwind arbitrary

Tailwind arbitrary (`[var(--token)]`) usado para colores simples + tipografías. Inline styles para:
- `color-mix(in oklch, ...)` — no soportado bien por Tailwind
- `transform: rotate(Xdeg)` con valores no estándar
- `box-shadow` compuesto multi-layer
- `background: repeating-linear-gradient(...)` dashed borders
- `writing-mode: vertical-rl` section labels
- Tape corners con background + border + rotate coordenados

### ModuleCard primitive

Card pattern compartido para los 5 módulos:
- `<article>` con `position: relative`
- data-num absolute corner
- mod-num mono header
- h3 display con `<em>` rubric-2
- desc serif
- bullets con `§` marker rubric-2
- mod-link uppercase rubric-2 + ArrowRight
- mod-visual container al final con `margin-top: auto`

Grid 12-col con variantes: wide(8) / narrow(4) / half(6) / full(12). Stack a `col-span-12` en mobile.

### Sub-mockups inline

Los mini-mockups decorativos (CrmMini, AgMini, AutoMini, IntMini, ChMini) se definen como sub-componentes **dentro del mismo archivo** `modules-grid.tsx`. Razones:
- Son puramente decorativos con data hardcoded fake
- Zero reuso fuera de modules-grid
- Mantienen el archivo como unidad coherente del mock

Archivos separados serían prematuros (YAGNI).

## Deviations from Plan

**Ninguna Rule 1/Rule 2/Rule 4.**

Rule 3 menor aplicada en T4:
- **[Rule 3 - Blocking] Compilación por commit** — El plan indicaba que el wire-up de page.tsx fuera en T8, pero borrar `product-section.tsx` en T4 mientras page.tsx aún lo importaba dejaba commits intermedios rotos (error TS2307). Fix: T4 hace wire-up mínimo de page.tsx para reemplazar los 5 `<ProductSection />` por 1 `<ModulesGrid />`, y T8 añade Manifest + Flow + reordenación. Cada commit queda tsc-clean atómicamente.
- Files afectados: `src/app/(marketing)/[locale]/page.tsx` (split entre T4 y T8)
- Commit asociado: T4 `f47e6ae` + T8 `389aefa`

## Self-Check: PASSED

**Archivos creados verificados:**
- `src/components/marketing/landing/manifest.tsx` — FOUND
- `src/components/marketing/landing/modules-grid.tsx` — FOUND
- `src/components/marketing/landing/flow.tsx` — FOUND

**Archivo removido verificado:**
- `src/components/marketing/landing/product-section.tsx` — DELETED (git mv tracked)

**Commits verificados:**
- `fc2a802` T1 — FOUND
- `1a4f3e8` T2 — FOUND
- `0d75d60` T3 — FOUND
- `f47e6ae` T4 — FOUND
- `9974351` T5 — FOUND
- `61889f4` T6 — FOUND
- `78c48fd` T7 — FOUND
- `389aefa` T8 — FOUND

**Success criteria:**
- [x] 8 tasks, 8 commits atómicos con --no-verify
- [x] `npx tsc --noEmit` clean (cero errores marketing)
- [x] `ls src/components/marketing/landing/*.tsx` = hero/manifest/modules-grid/flow/about/cta (6 archivos), NO product-section
- [x] `grep -rE "^import.*product-section" src/app/ src/components/` = 0 matches
- [x] `grep "rubric-2" header.tsx` = PASS
- [x] `grep "morf" header.tsx` = PASS
- [x] `grep -qE "logo-light|logo-dark" header.tsx` = REMOVED
- [x] `grep "background: 'var(--ink-1)'" footer.tsx` = PASS
- [x] 04-SUMMARY.md committed

## Deferred Items

- **i18n full pass del landing v2.1** — Copy nuevo (manifest, modules bullets, flow bodies, ledger row labels, footer dark links) queda hardcoded en español. Fase posterior dedicada puede extraer a `messages/es.json` + `messages/en.json` con keys tipo `Landing.Manifest.eyebrow`, `Landing.Modules.crmBullet1`, etc. No bloquea Meta review.
- **Visual smoke en producción** — Plan 05 (follow-up automático del 04-PLAN.md) debería hacer `git push origin main` + capturar screenshot morfx.app para validar pixel-perfect post-Vercel-deploy. No incluido en este plan.
- **DoD suite de Plan 03 T1** — Plan 05 re-correrá los checks (slate leakage, hsl antipattern, dark:, mx-*, TS, NO-TOUCH) para verificar que Plan 04 no regresó ningún antipattern.

## Notas para Plan 05 (follow-up)

1. Correr DoD suite actualizada de Plan 03 T1:
   ```bash
   grep -rE "bg-(slate|gray|neutral|zinc|stone)-" src/components/marketing/ src/app/\(marketing\)/ → 0
   grep -rE "hsl\(var\(--" src/components/marketing/ → 0
   grep -rE "\bdark:" src/components/marketing/ src/app/\(marketing\)/ → 0
   grep -rE "mx-(h1|h2|body-long|display|smallcaps|caption)" src/components/marketing/ → preserved
   npx tsc --noEmit → clean
   ```
2. Actualizar LEARNINGS.md con el delta Plan 01 → Plan 04 (mock v2.1 como fuente de verdad tardía, lección de research handoff cuidadoso).
3. Actualizar `docs/analysis/04-estado-actual-plataforma.md` sección Landing → "Landing realineada al mock v2.1 (Plan 04 + Plan 05)".
4. Push final a Vercel: `git push origin main` (Regla 1 — después de Plan 05 cleanup).
