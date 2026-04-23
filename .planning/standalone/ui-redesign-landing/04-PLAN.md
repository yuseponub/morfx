---
phase: ui-redesign-landing
plan: 04
type: execute
wave: 4
depends_on: [01]
autonomous: true
base_commit: 7ac1c5af000fdeed47596a6c255795db441abf47
reason: Plan 01 primer intento no replicó el mock — mock v2.1 apareció en v2 del design handoff después del shipping inicial. Plan 04 re-hace los 7 archivos de landing/shell con el mock como fuente pixel-perfect.
---

# Plan 04 — Landing realignment al mock v2.1 (pixel-perfect)

## Contexto

El Plan 01 original (commits 91c5a8b..2d3d46d) construyó una landing editorial genérica extrapolada. El archivo `landing.html` específico que el usuario esperaba vivía en la versión v2.1 del design handoff (`morfx Design System (2).zip`) que no fue detectada hasta post-ship.

Este plan re-hace los 7 archivos afectados usando el mock `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/landing.html` (868 líneas) como fuente de verdad pixel-perfect.

**Qué NO se toca:**
- `src/app/(marketing)/fonts.ts` (Plan 01 T1 está bien)
- `src/app/(marketing)/[locale]/terms/page.tsx` (Plan 02 T2 está bien)
- `src/app/(marketing)/[locale]/privacy/page.tsx` (Plan 02 T3 está bien)
- `src/components/marketing/legal/legal-section.tsx` (Plan 02 T1 está bien)
- `src/app/globals.css` (tokens ya existen; las clases landing-específicas van inline por componente, no en globals)
- Cualquier archivo fuera de `src/app/(marketing)/[locale]/` y `src/components/marketing/` de la landing/shell scope

## Decisiones delta al CONTEXT.md

- **D-LND-10 CORREGIDA**: primary CTA usa `var(--rubric-2)` (rojo rúbrica) con shadow stamp `box-shadow: 0 1px 0 var(--rubric-1)`. NO `ink-1`. Esto aplica a los botones `pri` del mock. Secondary/default buttons mantienen `ink-1 border + paper-0 bg + shadow 0 1px 0 var(--ink-1)`.
- **D-LND-08 REFINADA**: el header NO usa logo image. Usa wordmark tipográfico `morf<b>·</b>x` (u optionally `MORF<b>X</b>`) con la `x` / `·` en `rubric-2`. El archivo `/public/logo-light.png` sigue en el repo pero ya no se referencia desde marketing.
- **D-LND-06 RELAJADA**: muchas secciones del mock tienen copy que NO existe en `messages/{locale}.json` actual (manifest, flow section, modules bullets, about ledger+objeto social blockquote, footer dark). Decisión: **para ship rápido, hardcodeamos los textos en español dentro de cada componente Server Component**. El i18n completo del landing v2.1 queda como fase posterior dedicada (no bloquea Meta review).
- **D-LND-13 NUEVO**: secciones nuevas no representadas en el código actual se crean como componentes dedicados:
  - `src/components/marketing/landing/manifest.tsx` (NEW)
  - `src/components/marketing/landing/modules-grid.tsx` (NEW — reemplaza product-section.tsx)
  - `src/components/marketing/landing/flow.tsx` (NEW)
- **D-LND-14 NUEVO**: `product-section.tsx` del Plan 01 se REMUEVE (ya no corresponde al mock). Reemplazado por `modules-grid.tsx`.

## Tasks

**T1 — Header wordmark + nav primary + locale box + CTA rubric-2.**

Archivo: `src/components/marketing/header.tsx`

Reemplazar el logo `<Image src="/logo-light.png" />` por wordmark tipográfico:
```tsx
<Link href="/" className="inline-flex items-baseline" aria-label="MORFX">
  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '30px', lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>
    morf<b style={{ color: 'var(--rubric-2)', fontWeight: 800 }}>·</b>x
  </span>
</Link>
```

Agregar nav primary (hidden en mobile `sm:`):
```tsx
<nav className="hidden md:flex gap-7 items-center">
  <a href="#producto" style={{ fontFamily: 'var(--font-sans)' }} className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ink-2)] hover:text-[var(--ink-1)] border-b border-transparent hover:border-[var(--ink-1)] py-1">Producto</a>
  <a href="#como-funciona" ...>Cómo funciona</a>
  <a href="#nosotros" ...>Nosotros</a>
</nav>
```

LocaleToggle: envolver en caja bordered ink-1 con ES/EN items:
- El componente actual `<LocaleToggle />` — leer primero, si es un button toggler, wrapear su render output en el pattern del mock:
  ```
  <div className="inline-flex border border-[var(--ink-1)] rounded-[3px] overflow-hidden text-[11px] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>
    <span className={isActive('es') ? 'bg-[var(--ink-1)] text-[var(--paper-0)] px-[9px] py-[5px]' : 'text-[var(--ink-3)] px-[9px] py-[5px] cursor-pointer'}>ES</span>
    <span ...>EN</span>
  </div>
  ```
- Si LocaleToggle es difícil de customizar desde fuera, MODIFICARLO in-place (este archivo pasa a estar in-scope para T1).

Login CTA (ghost): `variant ghost` + editorial classes.

Primary CTA "Contactar ventas" → rubric-2 press:
```tsx
<a href="https://wa.me/573137549286" target="_blank" rel="noopener" className="inline-flex items-center gap-[7px] text-[13px] font-semibold px-[14px] py-[8px] rounded-[4px] border border-[var(--rubric-1)] bg-[var(--rubric-2)] text-[var(--paper-0)] hover:bg-[var(--rubric-1)] active:translate-y-px" style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--rubric-1)' }}>
  <MessageSquare className="h-4 w-4" />
  {t('Header.primaryCTA') ?? 'Contactar ventas'}
</a>
```

Remover `<Image src="/logo-dark.png">` (si quedaba).

Preservar `<ThemeToggle>` removido del Plan 01 T3.

Commit: `feat(ui-redesign-landing-04-T1): header con wordmark morf·x + nav primary + locale box + CTA rubric-2`.

**T2 — Hero 2-col con tape-framed WhatsApp mockup.**

Archivo: `src/components/marketing/landing/hero.tsx`

Reescribir completo. 2-col grid `grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr)` con gap 16 (64px).

LEFT COLUMN:
- Stamp chip (no más `mx-smallcaps`): inline-flex border-rubric-2 con dot + "MORFX S.A.S. · Empresa colombiana"
- Headline: `clamp(44px, 5.4vw, 68px)` font-display weight 700, con `<em>automatizados</em>` italic color rubric-2
- Subhead: serif 19px `var(--ink-2)` max-w 560px
- CTAs container: primary "Contactar ventas" rubric-2 press (MessageSquare + arrow-right) + secondary "Iniciar sesión" (link to `/login`)
- Meta line: clock icon + "Respuesta en minutos vía WhatsApp · Lunes a viernes, 8:00 a 18:00 (hora Colombia)" italic serif

RIGHT COLUMN (`mockup-frame`):
- div con `transform: rotate(0.6deg)` + border-ink-1 + box-shadow stamp + shadow 0 24px 48px ink/30%
- 4 tape corners: `<span className="absolute bg-[color:...accent-gold/35%+paper-0] border-gold/60%+ink-3 w-[72px] h-[22px]">` rotated -4deg/5deg/3deg/-4deg, positioned tl/tr/bl/br (-11px)
- Inside: WhatsApp inbox miniature (wa-mock):
  - grid-template-columns 140px 1fr, height 420px
  - aside.wa-list: 5 chat items (Carolina R., Jorge M., Mateo S., Andrea L., Esteban P.) with mock data. Active one has `border-left: 2px solid rubric-2`.
  - div.wa-convo: convo header (avatar "C", name, phone+order#, "Auto" badge rubric-2) + msgs (3 msgs incluyendo una out.ai con `✦ Agente IA` eyebrow rubric-2) + composer (fake-input "Escribe una respuesta…" + suggest chip "✦ Sugerencia")

Usar `aria-hidden="true"` en el mockup-frame porque es decorativo.

Toda la mockup data es HARDCODED string inline (D-LND-06 relajada) — no usa i18n. Son nombres y mensajes de ejemplo en español colombiano.

Commit: `feat(ui-redesign-landing-04-T2): hero 2-col con stamp + headline rubric-em + mockup-frame WhatsApp con tape corners`.

**T3 — Manifest strip.**

Archivo NUEVO: `src/components/marketing/landing/manifest.tsx`

```tsx
export function Manifest() {
  return (
    <section className="relative py-18 md:py-[72px] border-b border-[var(--ink-1)] bg-[var(--paper-2)]">
      {/* dashed top/bottom borders */}
      <div className="absolute left-0 right-0 top-[-2px] h-[4px]" style={{ background: 'repeating-linear-gradient(90deg, var(--ink-1) 0 8px, transparent 8px 16px)' }} aria-hidden />
      <div className="absolute left-0 right-0 bottom-[-2px] h-[4px]" style={{ background: 'repeating-linear-gradient(90deg, var(--ink-1) 0 8px, transparent 8px 16px)' }} aria-hidden />
      <div className="max-w-[920px] mx-auto px-8 text-center">
        <p style={{ fontFamily: 'var(--font-sans)' }} className="text-[11px] font-bold tracking-[0.2em] uppercase text-[var(--rubric-2)]">
          Nuestra tesis
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)' }} className="font-bold text-[clamp(32px,4vw,44px)] leading-[1.15] tracking-[-0.015em] mt-[14px] text-[var(--ink-1)]">
          Un <em className="italic text-[var(--rubric-2)]">sistema</em> para vender, responder y entregar. <br className="hidden md:block"/>No cinco herramientas pegadas con cinta.
        </h2>
      </div>
    </section>
  )
}
```

Luego importar en `page.tsx` y renderizar entre `<Hero />` y `<ProductSection/>` (que será reemplazado por ModulesGrid en T4).

Commit: `feat(ui-redesign-landing-04-T3): nuevo componente Manifest con dashed borders + headline rubric-em`.

**T4 — Modules grid 12-col con 5 cards + mini-mockups.**

Archivo NUEVO: `src/components/marketing/landing/modules-grid.tsx`
Archivo REMOVIDO: `src/components/marketing/landing/product-section.tsx` (git rm, deprecated)

Implementar los 5 módulos del mock:
1. **CRM (wide=8col)** con CRM mini table (4 rows Carolina/Jorge/Mateo/Andrea con teléfono mono, ciudad italic, tag con variantes red/gold/default)
2. **Agentes IA (narrow=4col)** con agent card (claude-4-sonnet · tono formal-cercano + 3 stats 847 turnos / 94% auto / 1.8s respuesta)
3. **Automatizaciones (narrow=4col)** con auto mini (3 nodes: trigger zap "Nuevo pedido Shopify" / cond git-branch "Si ciudad = Bogotá" / action send "Enviar confirmación WA")
4. **Integraciones (half=6col)** con int-mini grid 6 logos (Shopify, WhatsApp, Coordinadora, Inter Rapidísimo — all `.ok`; Claude, GPT — default)
5. **Multi-canal (half=6col)** con ch-mini (4 filas: WhatsApp Business Platform `.on`, Messenger soon, Instagram Direct soon, Correo electrónico explorando)

Section head con vertical `.sec-label` "§ Producto" + h2 "Cinco módulos, un solo hilo." rubric-em.

Module card pattern:
- `<article>` with data-num attr, border-ink-1, bg-paper-0, shadow-stamp
- ::before shows `data-num` content absolute top-right
- Internal structure: mod-num (Módulo 01) / mod-title / mod-desc / mod-bullets (§ markers) / mod-link "Ver módulo CRM →" / mod-visual (mini-mockup container)

Para el CSS que no se puede hacer solo con Tailwind (pseudo-elements, complex sub-mockups), usar `<style jsx>` si es client component o inline styles + `className` con `[&::before]:content-...` Tailwind arbitraries.

**Nota**: este task es el más grande del plan. Estimado ~20-25% del tiempo total.

Commit: `feat(ui-redesign-landing-04-T4): modules-grid nuevo con 5 cards (CRM/agents/auto/int/channels) + mini-mockups inline`.

**T5 — Flow diagram "Cómo funciona".**

Archivo NUEVO: `src/components/marketing/landing/flow.tsx`

3-col grid: Origen (Shopify + WhatsApp nodes) / Hub centro (Agente IA + CRM con lista de 4 steps) / Destino (Coordinadora + Inter Rapidísimo nodes).

Section head con vertical `§ Cómo funciona` + h2 "El recorrido de un pedido, de punta a punta." + sub parágrafo.

Flow nodes con ink-1 border, paper-0 bg, lucide icons (shopping-bag, message-circle, sparkles, truck, package).

Hub node (center) con background paper-2, más alto, tiene lista ol.steps dentro.

Commit: `feat(ui-redesign-landing-04-T5): nuevo componente Flow diagram 3-col (origen→hub→destino)`.

**T6 — About rehecho con ledger legal + blockquote objeto social.**

Archivo: `src/components/marketing/landing/about.tsx` (reemplazar contenido Plan 01 T6)

Section head con vertical `§ Quiénes somos`.

2-col grid:
- LEFT: h2 "Una empresa *colombiana* dedicada a plataformas de IA para empresas." (em rubric-2) + intro paragraph serif 17px + objeto social block (eyebrow rubric-2 sans bold + blockquote serif italic large + source line "— Acta de constitución bajo la Ley 1258 de 2008, República de Colombia.")
- RIGHT: ledger card (bg paper-0, border ink-1, shadow stamp):
  - ledger-hd: título "Datos legales" + "Registro mercantil · 2026"
  - dl.ledger-body con 6 rows:
    - Razón social: MORFX S.A.S.
    - NIT: 902.052.328-5 (mono)
    - Domicilio: Bucaramanga, Santander, Colombia
    - Año de constitución: 2026 (mono)
    - Código CIIU: 6201 (mono)
    - Representante legal: Jose Mario Romero Rincón

Commit: `feat(ui-redesign-landing-04-T6): about rehecho con ledger legal + blockquote objeto social + datos corporativos`.

**T7 — CTA closing + Footer dark.**

Archivos:
- `src/components/marketing/landing/cta.tsx` (reemplazar Plan 01 T8)
- `src/components/marketing/footer.tsx` (reemplazar Plan 01 T4)

**CTA:**
- section bg paper-1
- cta-card wrapper con border ink-1, paper-0, shadow stamp, padding generoso
- "❊ ❊ ❊" ornament centered small rubric-2
- h2 "¿Listo para *empezar?*" (rubric-em)
- paragraph serif
- 2 CTAs: primary rubric-2 press "Escribir por WhatsApp" + secondary ink-1 outline "Enviar un correo"
- contact line con phone link + email link

**Footer DARK:**
- bg `var(--ink-1)` (¡NO paper-3!)
- color `var(--paper-0)` como default
- 4-col grid (1.4fr / 1fr / 1fr / 1.2fr):
  - Col 1: footer-wm `morf·x` (punto rubric-3) + tagline serif 14px
  - Col 2: footer-col "Producto" con links (#crm, #agentes, #automatizaciones, #integraciones)
  - Col 3: footer-col "Legal" con links (Política privacidad, Términos servicio, Iniciar sesión)
  - Col 4: footer-contact con Teléfono + Email + WhatsApp (cada uno con label sans uppercase small)
- Bottom legal strip (mono 11px): © 2026 MORFX S.A.S. · NIT / Carrera 38 # 42 - 17 Apto 1601B, Bucaramanga / CIIU 6201

Commit: `feat(ui-redesign-landing-04-T7): cta closing con ornament ❊ + footer dark 4-col con ledger corporativo`.

**T8 — Layout page.tsx wire-up + marketing layout cleanup.**

Archivos:
- `src/app/(marketing)/[locale]/layout.tsx` — preservar del Plan 01 T2 (aplicación de `.theme-editorial` + font vars). Si hay que ajustar backgrounds, hacer aquí.
- `src/app/(marketing)/[locale]/page.tsx` — actualizar para importar los nuevos componentes:
  ```tsx
  import { Hero } from '@/components/marketing/landing/hero'
  import { Manifest } from '@/components/marketing/landing/manifest'       // NEW T3
  import { ModulesGrid } from '@/components/marketing/landing/modules-grid' // NEW T4
  import { Flow } from '@/components/marketing/landing/flow'                // NEW T5
  import { About } from '@/components/marketing/landing/about'
  import { CTA } from '@/components/marketing/landing/cta'
  ```
  Y renderear en orden: `<Hero /> <Manifest /> <ModulesGrid /> <Flow /> <About /> <CTA />` (dropping `<ProductSection />`).

Verificación final:
```bash
npx tsc --noEmit  # no errors
grep -rE "product-section" src/ || echo "PASS: product-section eliminado"
```

Commit: `feat(ui-redesign-landing-04-T8): page.tsx wire-up con nuevos componentes (Manifest + ModulesGrid + Flow); remove product-section deprecated`.

## Success Criteria

- [ ] 8 tasks, 8 commits atómicos
- [ ] `npx tsc --noEmit` clean en los 8 archivos (modificados + creados)
- [ ] `ls src/components/marketing/landing/*.tsx` lista: `hero.tsx`, `manifest.tsx` (NEW), `modules-grid.tsx` (NEW), `flow.tsx` (NEW), `about.tsx`, `cta.tsx` — NO `product-section.tsx` (removido)
- [ ] `grep -rE "product-section" src/app/ src/components/` → 0 matches
- [ ] Visual smoke: `morfx.app/` muestra 8 secciones en orden: Header + Hero (2-col con tape-mockup) + Manifest + Modules + Flow + About + CTA + Footer(dark)
- [ ] Wordmark `morf·x` con punto rubric-2 (no logo image)
- [ ] Primary CTAs usan `bg-rubric-2` no `bg-ink-1`
- [ ] NO modifications fuera de scope declarado
- [ ] 04-SUMMARY.md commited

## Plan 05 (follow-up automático)

Después de que Plan 04 quede clean:
1. Correr DoD suite de Plan 03 T1 actualizada (checks de slate leakage, hsl antipattern, dark:, mx-*, TS, NO-TOUCH).
2. Actualizar LEARNINGS.md + 03-SUMMARY.md + platform doc con el delta de alinear al mock v2.1.
3. Push final a Vercel.

Este Plan 05 es ligero (~15 min) y cierra definitivamente la fase ui-redesign-landing.
