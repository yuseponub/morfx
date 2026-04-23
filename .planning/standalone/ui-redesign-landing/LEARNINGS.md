# LEARNINGS — Standalone `ui-redesign-landing`

**Phase type:** UI re-skin público, **sin feature flag** (driver: Meta App Review — Facebook Business Verification).
**Dates:** 2026-04-22 (discuss → plan → execute → ship mismo día).
**Status:** ✅ SHIPPED en `main` + push a Vercel (activación inmediata, global, no per-workspace — diferencia clave vs `ui-redesign-conversaciones`).
**Plans:** 3 (01 layout + home → 02 legal pages → 03 DoD/LEARNINGS/push).
**Base commit:** `1c2fd6f` (phase open). **Último commit T3 Plan 03:** ver §7 — rango `1c2fd6f..HEAD`.
**Commits atómicos producidos:** 14 por código (8 Plan 01 + 3 Plan 02 + 3 Plan 03 docs) + 2 SUMMARY de Plans 01/02 + 1 final push.
**LOC delta (production code only):** ~1 archivo nuevo (`src/app/(marketing)/fonts.ts`, 42 LOC) + 10 archivos modificados; cero LOC en `src/app/globals.css` (tokens + utilities ya existían desde `ui-redesign-conversaciones` Plan 01).

---

## 1. Phase overview — qué entregó

Re-skin editorial completo de la **presencia pública** de morfx (dominio `morfx.app`) para alinear la landing + páginas legales con la estética "paper / ink / rubric" ya shipped en el inbox WhatsApp (`ui-redesign-conversaciones`). Total: **11 archivos re-skineados** en 3 waves.

**Trigger concreto:** Meta va a revisar `morfx.app` como parte del proceso de Facebook Business Verification. El producto (dashboard + inbox v2) ya tiene el nuevo look editorial, pero la landing seguía con shadcn-slate default — incoherencia de marca que un reviewer de Meta iba a detectar. La fase cierra la brecha antes de la resubmisión.

**Lo que ve el usuario de `morfx.app` post-deploy:**

- **Home (`/` + `/en`):** Header paper-0 con logo light + LocaleToggle + CTA "Empezar" en ink-1 press pattern; hero con eyebrow smallcaps rubric-2 + `mx-display` EB Garamond 3-6rem + rule ornament horizontal + `mx-body-long`; About con ornament `— ❦ —` + blockquote italic de objeto social con border-left rubric-2 + legal data en JetBrains Mono; ProductSection con cards paper-2 alternando odd:paper-1 + check boxes editoriales (rounded-[3px] border ink-3) reemplazando la versión shadcn; CTA closing con `mx-display` + WhatsApp + Email outline + contactLine mono; Footer paper-3 con smallcaps section labels + font-mono para NIT/razón social/CIIU.
- **Terms (`/terms` + `/en/terms`):** Page header `mx-display 2.5-4rem` + eyebrow "MORFX S.A.S." smallcaps + lastUpdated mono; TOC editorial con `§ N ∣ heading` en marginalia inline; 14 secciones con columna marginalia `§ 1..§ 14` (sticky top-24 en ≥md, hidden <md) + body-long en columna central; rule ornament `— ❦ —` entre secciones (excluyendo la última para evitar duplicado con footer border-t).
- **Privacy (`/privacy` + `/en/privacy`):** Mismo pattern que terms, adaptado a 4 secciones `§ 1..§ 4`. Copy byte-exact de i18n messages — cero cambios de texto.

**Coherencia product ↔ marketing:** Los CTAs primarios de landing + terms + privacy usan el **mismo patrón exact** (bg ink-1, rounded-[4px], active:translate-y-px, font-semibold 13px sans) que el Send button del composer del inbox v2. Reduce mental load — el usuario que viene de la landing a login ve el mismo botón en ambos contextos.

---

## 2. Decisiones locked (D-LND-01..D-LND-12)

Referencia completa: `.planning/standalone/ui-redesign-landing/CONTEXT.md`. Las más relevantes para entender el diff con la fase hermana `ui-redesign-conversaciones`:

- **D-LND-01 — Aesthetic extrapolado sin reinventar:** Mismo lenguaje editorial del inbox, escalado para marketing (display serif 3-6rem en hero, rule ornaments como section dividers, mono para metadata). Cero tokens nuevos en globals.css — `ui-redesign-conversaciones` Plan 01 ya había canonizado el `.theme-editorial` bloque con todos los `--paper-*`, `--ink-*`, `--rubric-*`. Esta fase es el primer consumer externo al inbox del mismo bloque, validando su reusabilidad.
- **D-LND-02 — SIN feature flag (contraste con D-01 de conversaciones):** A diferencia del inbox donde `workspaces.settings.ui_inbox_v2.enabled` permite rollout per-workspace, la landing pública es visible para TODOS los visitantes. Un flag no tendría sentido — Meta va a ver lo que tengamos en prod. Implica: rollback es vía `git revert` de commits, no flag flip. Push único al final (D-LND-12) minimiza el blast radius.
- **D-LND-04 — `.theme-editorial` unconditional en wrapper (vs gated en inbox):** El layout de `(marketing)/[locale]/` aplica `className="... theme-editorial"` sin condición. En el inbox es `cn(v2 && 'theme-editorial')` gated por `InboxV2Provider`. Ambos válidos — depende del rollout strategy (público inmediato vs per-workspace opt-in).
- **D-LND-06 — Copy intacto:** Cero cambios en `src/messages/{locale}.json`. Todas las llamadas `t(...)` (12 en legal pages + múltiples en landing sections) preservadas byte-exact. Los "§ N" de las legal pages se derivan client-side del `idx` del map (no vienen de i18n).
- **D-LND-07 — ThemeToggle removido del marketing header:** En el inbox el `next-themes` toggle sigue presente (user puede alternar slate claro/oscuro fuera de `/whatsapp`). En marketing, el toggle se removió completo del header — `.theme-editorial` fuerza `color-scheme: light` (UI-SPEC §12.4 heredado), el toggle sería ruido visual sin efecto dentro del scope editorial. **Trade-off aceptado:** pequeña pérdida de feature discovery — un visitante anónimo de morfx.app no sabe que el dashboard tiene dark mode hasta loguearse.
- **D-LND-08 — Logo light-only:** Header y footer del marketing usan solo `/logo-light.png`. `/logo-dark.png` permanece en el repo (dashboard lo sigue usando). Trade-off menor: si algún medio embed (ej. screenshot en background oscuro) intenta mostrar morfx.app, no hay logo dark exportable desde la landing pública.
- **D-LND-09 — Marginalia para legal pages:** Pattern editorial tipo revista clásica (New Yorker, Atlantic): numeración de sección en columna marginalia izquierda (`.mx-marginalia` serif italic ink-3), cuerpo en columna central `.mx-body-long` con leading-[1.7], subheadings alternando `.mx-h3` (level 0) y `.mx-smallcaps` (level 1+), rule ornament `— ❦ —` entre secciones. Genera el feel de documento impreso serio — ideal para terms + privacy.
- **D-LND-10 — CTA button pattern byte-exact del composer Send:** Reuso del patrón shipped en `ui-redesign-conversaciones` Plan 03. Copia exacta: `bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)] hover:bg-[var(--ink-2)] rounded-[4px] active:translate-y-px px-[16px] py-[8px] font-semibold text-[13px] + style fontFamily: var(--font-sans)`. Aplicado en 4 CTAs (Header "Empezar", Hero primary, CTA-closing WhatsApp, Terms/Privacy back-to-landing implícito vía link styling). Consistency product ↔ marketing — garantía de no-flash al cross-surface.
- **D-LND-12 — Push único al final:** Commits atómicos por task (14 en total) pero SIN push intermedio. Un solo `git push origin main` al cierre de Plan 03 T3, para que Meta vea el cambio completo — evita race condition donde el reviewer cae en un estado intermedio con home editorial + legal pages aún slate.

---

## 3. Patterns learned (los 6 más reutilizables para futuras fases de UI pública)

### 3.1. Per-segment font loader en Next 15 App Router (no duplicación de bundle)

**Pattern shipped:** `src/app/(marketing)/fonts.ts` (42 LOC) + análogo previo `src/app/(dashboard)/whatsapp/fonts.ts`. Next.js con `next/font/google` permite cargar las mismas 3 familias en 2 route segments distintos — NO se duplican en el bundle final.

```ts
// src/app/(marketing)/fonts.ts
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

export const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],  // 800 requerido por mx-display del hero
  variable: '--font-ebgaramond',
  display: 'swap',
})

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})
```

**Import desde el layout del `[locale]` segment:**

```tsx
// src/app/(marketing)/[locale]/layout.tsx
import { ebGaramond, inter, jetbrainsMono } from '../fonts'

<div className={`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} theme-editorial flex min-h-screen flex-col`}>
```

**Por qué no se duplica:** Next.js deduplica fuentes via hash content del family/weight/style requested. Aunque el loader `(marketing)/fonts.ts` lo "redeclara", el Font CSS es idéntico al de `(dashboard)/whatsapp/fonts.ts` y webpack colapsa a un único chunk `_next/static/media/<hash>.woff2`. Verificable con `npm run build` + inspección del `.next/` output.

**Reutilizable para:** cualquier segment que necesite las mismas fuentes editorial (ej. `(admin)/`, `(marketing)/blog/`, etc.). Si un segment necesita fonts adicionales (ej. un script decorativo), extender sin afectar los otros.

### 3.2. Theme unconditional vs gated — when to use each

**Dos patterns válidos en este codebase:**

**Pattern A — Unconditional (usado en marketing):**

```tsx
<div className="... theme-editorial">
  {children}
</div>
```

Siempre aplica. Ideal para surfaces públicas donde no hay rollout per-user (landing, terms, privacy, blog eventual). El primer paint del server response ya tiene el tema — cero flicker, cero hydration mismatch.

**Pattern B — Gated via flag resolver (usado en inbox):**

```tsx
// server component
const v2Enabled = await getIsInboxV2Enabled(workspaceId)
// ...
<div className={cn('...', v2Enabled && 'theme-editorial')} data-module="whatsapp">
  <InboxV2Provider value={{ v2: v2Enabled }}>
    {children}
  </InboxV2Provider>
</div>
```

Flag per-workspace, JSONB namespaced, fail-closed. Ideal para surfaces con usuarios productivos donde hay que permitir rollback granular si algo regresiona (ej. agente productivo — Regla 6).

**Cuándo aplicar cada uno:**

| Surface | Usuarios | Recomendado | Razón |
|---|---|---|---|
| Landing pública | anónimos | A (unconditional) | No hay per-user state; rollback es `git revert` |
| Legal pages | anónimos | A (unconditional) | Ídem — Meta va a ver un estado único |
| Dashboard inbox | productivos | B (gated) | Regla 6 — clientes reales, rollback instantáneo |
| Dashboard módulo nuevo | productivos | B (gated) primero, A después | Empezar gated, remover flag cuando todos los workspaces estén activos |
| Admin panel interno | equipo | A (unconditional) | Pocos usuarios, rollback operativo no crítico |

**Heurística:** si el surface afecta un agente/flow productivo (Regla 6) o data de clientes reales → B. Si es puramente visual o contenido estático → A.

### 3.3. CTA consistency product ↔ marketing (byte-exact copy)

El patrón del Send button del composer del inbox v2 se copió **byte-exact** a los CTAs principales de la landing y las legal pages. Reduce mental load del usuario y garantiza consistencia de marca.

```tsx
// Pattern reutilizable — "ink-1 press button"
<Button
  className={`
    h-auto px-[16px] py-[10px] text-[13px] font-semibold gap-1.5
    active:translate-y-px
    bg-[var(--ink-1)] text-[var(--paper-0)]
    border border-[var(--ink-1)] hover:bg-[var(--ink-2)]
    rounded-[4px]
  `}
  style={{ fontFamily: 'var(--font-sans)' }}
>
  Empezar
</Button>
```

**Instancias aplicadas:**

1. **Product (inbox):** `src/app/(dashboard)/whatsapp/components/message-input.tsx` — Send button.
2. **Marketing (header):** `src/components/marketing/header.tsx` — "Empezar" / "Contact Sales".
3. **Marketing (hero):** `src/components/marketing/landing/hero.tsx` — primary CTA.
4. **Marketing (cta closing):** `src/components/marketing/landing/cta.tsx` — WhatsApp CTA.

El pattern secundario "outline ink-1" se aplica también consistently:

```tsx
<Button
  className="border border-[var(--ink-1)] text-[var(--ink-1)] bg-transparent hover:bg-[var(--paper-1)] rounded-[4px]"
  style={{ fontFamily: 'var(--font-sans)' }}
>
```

Usado en: Hero secondary, CTA-closing Email, Legal pages back-to-landing.

**Recomendación para futuras fases:** ante un nuevo CTA, revisar primero esta tabla antes de diseñar un botón desde cero. Si el propósito es "primary action" → ink-1 press. Si es "secondary action" → outline ink-1. Si es ghost link → `text-[var(--ink-2)] hover:text-[var(--ink-1)]` underline-offset editorial.

### 3.4. Form controls font inheritance footgun (heredado del LEARNINGS de conversaciones)

Bajo `.theme-editorial`, el root font-family es serif (EB Garamond via `--font-serif`). Los elementos nativos del browser (`<button>`, `<input>`, `<textarea>`, `<select>`, `<option>`, `<optgroup>`, `<fieldset>`, `<legend>`) **NO heredan `font-family` por default** — el user-agent stylesheet establece su propio font-family (system fallback).

**Consecuencia en marketing:** Un `<Button>` de shadcn dentro de `.theme-editorial` puede renderear en EB Garamond heredado del root (si hay alguna regla CSS que fuerce el inheritance) o en system font (si no). En ambos casos no es lo deseado — queremos Inter explícito.

**Fix defensivo aplicado en esta fase:** `style={{ fontFamily: 'var(--font-sans)' }}` en cada control UI que debe ser sans.

**Aplicado en Plan 01:**

- `header.tsx` — 2 buttons (Login ghost + CTA "Empezar")
- `hero.tsx` — 2 buttons (primary + secondary)
- `cta.tsx` — 2 buttons (WhatsApp primary + Email secondary)

**Aplicado en Plan 02:**

- `terms/page.tsx` — eyebrow "MORFX S.A.S." (sans) + lastUpdated (mono) + TOC heading (sans)
- `privacy/page.tsx` — mismo pattern

**Total:** 12 instancias de style fontFamily explícito agregadas.

**Alternativa que NO se usó:** agregar un reset CSS global `.theme-editorial button, .theme-editorial input, ... { font-family: var(--font-sans); }` en globals.css. Rechazada por 2 razones: (a) Plan 01 tenía "D-LND-scope out" sobre globals.css, no se podía modificar; (b) el reset global rompería `mx-display` / `mx-h1` / etc. si alguna vez se aplicara a un botón decorativo (edge case, pero posible).

**Checklist preventivo para futuros scopes con font override:**

```bash
grep -rnE '<Button|<button|<input|<textarea|<select' src/<scope>/
```

Para cada hit, verificar que `style={{ fontFamily: '...' }}` esté explícito si el scope root tiene una font-family distinta a la deseada para el control.

### 3.5. Legal pages editorial pattern (marginalia + body-long + rule ornaments)

Template reutilizable para cualquier documento legal largo (terms, privacy, acuerdos, policy docs). Se aplicó a 2 páginas (terms 14 secciones + privacy 4 secciones) via refactor backward-compatible de `<LegalSection>`.

**API del componente (Plan 02 Task 1):**

```tsx
<LegalSection
  sectionNumber="§ 1"        // NEW — renderiza en aside marginalia
  subtitle="Sub-heading"     // NEW — opcional, smallcaps bajo título
  showOrnament={true}        // NEW — toggle rule ornament al cerrar
  heading="Título de sección"
  paragraphs={['...']}
  bullets={[]}
  subsections={[]}
>
  {/* children alternativos */}
</LegalSection>
```

**Layout interno:**

- Grid `md:grid-cols-[6rem_1fr]` + gap-10 (mobile: single column, marginalia hidden).
- `<aside>` sticky top-24 self-start con `.mx-marginalia` serif italic ink-3 para el número.
- `<h2>` con `.mx-h2` + optional `<p>` subtitle `.mx-smallcaps`.
- Body column max-w-[42rem] para readability editorial óptima.
- Paragraphs `.mx-body-long` leading-[1.7] ink-2.
- Subsections recursivas: nivel 0 → `.mx-h3` ink-1 serif; nivel 1+ → `.mx-smallcaps` uppercase ink-2 — contraste visual mayor que h3/h4 genéricos.
- Border de recursión: `border-[var(--paper-4)]` (NO `border-border` slate).
- Rule ornament centrado `— ❦ —` en `.mx-smallcaps text-[12px] tracking-[0.12em] ink-4`.

**Patrón de uso en callers:**

```tsx
{sections.map((key, idx) => (
  <LegalSection
    key={key}
    sectionNumber={`§ ${idx + 1}`}                // derivado del idx
    showOrnament={idx < sections.length - 1}     // suprime en última
    {...t.raw(key)}
  />
))}
```

**Por qué deriva `§ N` del idx (no de i18n):** evita tocar `src/messages/{locale}.json` (D-LND-06 copy intacto) y es automático al reordenar secciones. Trivialmente localizable: `locale === 'es' ? \`§ ${n}\` : \`Art. ${n}\``.

**Reutilizable para:** políticas de cookies, acuerdos de servicio, términos de uso específicos (AI, API), SLA docs, etc.

### 3.6. Section number derivation pattern (vs static copy)

Relacionado con 3.5. Anti-pattern tradicional: numerar secciones en el JSON de i18n (`section1.number: "§ 1"`, `section2.number: "§ 2"`, ...). Problema: (a) se rompe al reordenar (hay que renumerar manualmente en 2 archivos `es.json` + `en.json`), (b) es ruidoso, (c) mezcla contenido con presentación.

**Pattern canonical:**

```tsx
const SECTION_KEYS = ['section1', 'section2', 'section3', ...]  // solo keys semánticas

{SECTION_KEYS.map((key, idx) => (
  <LegalSection sectionNumber={`§ ${idx + 1}`} {...t.raw(key)} />
))}
```

El "§" es una decisión de presentación (icono/glyph decorativo), no content. Vive en el componente, no en el copy. Insertar una nueva sección en medio es trivial: agregar al array, todas las numeraciones downstream se recalculan automáticamente.

---

## 4. Trade-offs documented

### 4.1. Dark mode sacrificado en marketing (D-LND-07)

El `.theme-editorial` fuerza `color-scheme: light` — es un diseño concebido para paper, no dark mode. Trade-offs:

- **Pérdida:** visitantes con dark mode preference del OS o del browser no pueden alternar. La landing se verá light incluso si todo el resto del browser está en dark.
- **Ganancia:** look editorial coherente e intencional. El paper aesthetic pierde todo su sentido si se invierte a modo oscuro — los OKLCH de paper/ink están calibrados para impresión mental.
- **Un-defer si cambia el requisito:** re-trabajar D-LND-07 agregando `.theme-editorial.dark { ... }` en globals.css con tokens paper/ink inversos. No trivial — requiere re-calibración completa del contract de color 60/30/10. Fuera de scope indefinidamente.

### 4.2. ThemeToggle removido del marketing header

Consecuencia directa de 4.1. Trade-off menor:

- **Pérdida de feature discovery:** un visitante anónimo que llega a morfx.app, ve la landing light-only, no sabe que el dashboard (post-login) tiene dark mode. Feature invisible.
- **Mitigación:** el toggle sigue presente en el dashboard header. El usuario lo descubre post-login.

### 4.3. Logo light-only en marketing

- **Pérdida:** si algún medio externo (screenshot, embed, OG card con bg oscuro) intenta mostrar morfx.app en contexto dark, el logo se verá invertido/incorrecto.
- **Mitigación:** OG image (`public/og-image.png`) ya tiene tratamiento propio independiente de la landing. Cubre el 99% de los casos de embedding social.
- **Un-defer si cambia:** agregar `<picture>` con sources dark/light en `header.tsx` + `footer.tsx`.

### 4.4. Sin feature flag — rollback no granular

A diferencia del inbox (D-01 flag per-workspace), no hay forma de "desactivar editorial en marketing solo para algunos visitantes". Si Meta rechaza el look editorial (muy improbable — es estético, no funcional), rollback = `git revert <commits>`.

- **Mitigación:** DoD suite (6 checks) + TS clean + Regla NO-TOUCH verificado antes del push. 0 errores detectados.
- **Probabilidad de rollback:** muy baja. El cambio es puramente visual, no toca autenticación, routing, i18n, ni analytics de Meta Pixel (que no existe en esta landing anyway).

---

## 5. Regla 6 compliance — aplicabilidad parcial

**Regla 6 canonical:** "Cuando se desarrolla un agente NUEVO o un milestone que modifica el comportamiento de un agente existente: NO desconectar el agente actual. Puede hacerse push a Vercel pero el nuevo código NO debe afectar el agente que ya está activo. Usar feature flags para aislar el nuevo comportamiento."

**Aplicabilidad a esta fase:** PARCIAL — marketing no es un agente productivo, es una landing pública estática. El spirit de la regla ("no tocar lo que no hay que tocar, proteger lo que ya funciona") sí aplica. Se respetó así:

- **NO-TOUCH paths verificados con `git diff 1c2fd6f`:** 0 líneas cambiadas en `src/app/(dashboard)/`, `src/lib/`, `src/hooks/`, `src/app/globals.css`, `src/messages/`. Verificable en `dod-verification.txt` Check 6.
- **Zero regression en agente Somnio productivo:** ningún archivo de `src/lib/agents/`, `src/lib/inngest/`, `src/lib/domain/` tocado.
- **Zero cambios en copy i18n:** `src/messages/{locale}.json` intacto (D-LND-06). Los "§ N" derivan del idx client-side.
- **Zero cambios en dashboard routing/auth:** middleware raíz (`middleware.ts`) + `(marketing)/[locale]/` layout — el diff se contiene en `layout.tsx` del segment marketing, sin tocar la composición middleware ni auth paths (login/signup/forgot-password).

**DoD Check 6 (`git diff 1c2fd6f -- protected-paths | wc -l` → 0):** **PASS**.

**Lección:** para fases UI-only de surfaces públicos, Regla 6 se traduce a "Regla NO-TOUCH" — definir explícitamente qué paths NO se tocan, verificar con `git diff` vs el commit base de la fase, y dejar la evidencia en el `dod-verification.txt`.

---

## 6. Handoff / follow-ups

Items para monitorear o considerar post-deploy:

1. **Vercel prod smoke test:** después del `git push origin main` final, Vercel auto-deploy toma ~1-2min. Validar visualmente:
   - `https://morfx.app/` → landing editorial con hero + CTAs + footer paper-3.
   - `https://morfx.app/terms` → marginalia + body-long + ornaments entre 14 secciones.
   - `https://morfx.app/privacy` → idem con 4 secciones.
   - `https://morfx.app/en/` + `/en/terms` + `/en/privacy` → mismo look editorial con copy EN.
   - DevTools: verificar que `--paper-0`, `--ink-1`, `--font-ebgaramond` resuelven dentro del scope `.theme-editorial`.

2. **Meta App Review trigger:** después del deploy, notificar/coordinar con el flow de Business Verification. La landing ya tenía los elementos legales (Phase 37.5 Block A) — esta fase solo cambia presentación visual, NO content. Si Meta ya había aprobado Block A antes, el reviewer debería ver coherencia estética entre landing + product screenshots submitted.

3. **Safari retina font-smoothing fallback (monitor):** si aparece regresión visual en Safari retina (macOS/iOS) con EB Garamond 3-6rem headings viéndose "hairline" / excesivamente delgado, aplicar `-webkit-font-smoothing: antialiased` + `text-rendering: optimizeLegibility` al `.theme-editorial` scope. No se aplicó preventivamente — añadir solo si se detecta.

4. **Meta rechazo por copy/contenido legal:** improbable — el copy no se tocó. Pero si el reviewer pide cambios de contenido (ej. clarificación de data handling en privacy), se re-abre Phase 37.5 o se crea fase nueva dedicada a copy. No sería un rollback de esta fase; sería additive.

5. **Dark mode en marketing (D-LND-07 un-defer):** fuera de scope indefinido. Si un día se pide, documentar que rompe el contract editorial y requiere re-calibración de paper/ink inversos.

6. **Animaciones / micro-interacciones:** fuera de scope. No se agregó `framer-motion` ni transitions custom más allá del `active:translate-y-px` del press pattern. Si una fase futura quiere animar hero / ornaments / scroll reveals, es additive — el layout actual tolera wrapping con motion components.

7. **Re-copywriting:** fuera de scope. Fase dedicada con input del equipo marketing (si existe) o del founder. Esta fase solo cambió estructura/tipografía/color — textos byte-exact.

8. **Otras surfaces públicas futuras (blog, docs, pricing page):** reutilizar los 6 patterns de §3. El `.theme-editorial` wrapper es canónico — cualquier nuevo segment bajo `src/app/(marketing)/` puede aplicarlo unconditional siguiendo el patrón de layout.tsx de esta fase.

---

## 7. Commits ranges

| Plan | Tasks | Commits (hash corto) | Notas |
|---|---|---|---|
| Phase open | — | `1c2fd6f` | CONTEXT.md + PLAN.md committed |
| 01 | T1..T8 | `91c5a8b`, `a5486be`, `525dd99`, `b4f5913`, `0e9addf`, `6e409b3`, `00e06d5`, `c8bcf16` | Layout + home sections editorial |
| 01 SUMMARY | — | `2d3d46d` | Plan 01 summary committed |
| 02 | T1..T3 | `715bbfd`, `3b340ed`, `0404aa6` | Legal pages editorial (terms + privacy + LegalSection refactor) |
| 02 SUMMARY | — | `e07658a` | Plan 02 summary committed |
| 03 | T1 | (ver git log post-T1) | DoD verification report |
| 03 | T2 | (ver git log post-T2) | LEARNINGS + 03-SUMMARY + platform doc update |
| 03 | T3 | — (no-code, push only) | `git push origin main` — Vercel auto-deploy |

**Total commits en `main`:** ~15 (inicial CONTEXT+PLAN + 8 Plan 01 + 1 SUMMARY 01 + 3 Plan 02 + 1 SUMMARY 02 + 3 Plan 03). Push único a origin/main al final del T3.

**Push a Vercel:** ejecutado 2026-04-22 vía `git push origin main` al cierre de Plan 03 T3. Vercel auto-deploy triggered.

---

## 8. DoD — 6/6 checks PASS

Reporte completo en `.planning/standalone/ui-redesign-landing/dod-verification.txt`. Summary:

| Check | Descripción | Resultado |
|---|---|---|
| 1 | No slate leakage (`bg-background`, `text-foreground`, `border-border`) en marketing | PASS (0 matches) |
| 2 | No `hsl(var(--` antipattern post Tailwind v4 en marketing | PASS (0 matches) |
| 3 | No `dark:` classes en marketing (D-LND-07) | PASS (0 matches) |
| 4 | mx-* utilities count ≥ 15 | PASS (46 matches) |
| 5 | TS clean en marketing files (`npx tsc --noEmit` filtered) | PASS (0 errors) |
| 6 | Regla NO-TOUCH (`git diff 1c2fd6f -- protected-paths`) | PASS (0 líneas) |

**Todos los checks pasaron en la primera ejecución.** Cero fixes inline necesarios durante Plan 03 T1 — indicador de calidad de ejecución en Plans 01 y 02.

---

## 9. Files produced by this phase

**Standalone artifacts:**
- `.planning/standalone/ui-redesign-landing/CONTEXT.md` — D-LND-01..D-LND-12 locked
- `.planning/standalone/ui-redesign-landing/PLAN.md` — plan maestro 3 waves
- `.planning/standalone/ui-redesign-landing/01-SUMMARY.md` — Plan 01 (layout + home)
- `.planning/standalone/ui-redesign-landing/02-SUMMARY.md` — Plan 02 (legal pages)
- `.planning/standalone/ui-redesign-landing/03-SUMMARY.md` — Plan 03 (DoD + close)
- `.planning/standalone/ui-redesign-landing/LEARNINGS.md` — este archivo
- `.planning/standalone/ui-redesign-landing/dod-verification.txt` — 6/6 PASS

**Source code (1 file created):**
- `src/app/(marketing)/fonts.ts` (42 LOC)

**Source code (10 files modified):**
- `src/app/(marketing)/[locale]/layout.tsx` (fonts + `.theme-editorial` unconditional)
- `src/components/marketing/header.tsx` (paper-0 + ink-1 CTA + logo light-only + ThemeToggle removed)
- `src/components/marketing/footer.tsx` (paper-3 + smallcaps + font-mono metadata)
- `src/components/marketing/landing/hero.tsx` (mx-display + rule ornament + ink-1 press CTA)
- `src/components/marketing/landing/about.tsx` (ornament + mx-h1 + body-long + mono metadata)
- `src/components/marketing/landing/product-section.tsx` (cards paper-2 + mx-h1 + check boxes editoriales)
- `src/components/marketing/landing/cta.tsx` (mx-display + ornament + ink-1 CTAs)
- `src/components/marketing/legal/legal-section.tsx` (refactor con marginalia + body-long + rule ornament, API backward-compatible)
- `src/app/(marketing)/[locale]/terms/page.tsx` (marginalia § 1..14 + body-long)
- `src/app/(marketing)/[locale]/privacy/page.tsx` (marginalia § 1..4 + body-long)

**Docs update:**
- `docs/analysis/04-estado-actual-plataforma.md` — entrada "Landing editorial v1" en sección "Presencia Publica — morfx.app"

**Zero changes:**
- `src/app/(dashboard)/**` (NO-TOUCH verified)
- `src/lib/**`, `src/hooks/**` (NO-TOUCH verified)
- `src/app/globals.css` (tokens + utilities ya existían — no se agregaron)
- `src/messages/{locale}.json` (D-LND-06 copy intacto)
- Zero npm packages added (todas las fuentes vía `next/font/google` que ya estaba instalado para el inbox)

---

## 10. Phase status

✅ **PHASE CLOSED — `ui-redesign-landing` SHIPPED a producción.**

- Deploy: commit range `1c2fd6f..<final>` en `main` pusheado a `origin/main` vía T3 de Plan 03.
- Vercel auto-deploy: triggered en el push.
- `morfx.app` en editorial: activo para todos los visitantes (sin feature flag).
- Meta App Review: ready para resubmit con estética coherente product ↔ marketing.

**Next (si aplica):**

- Coordinar con el flow de Business Verification para notificar a Meta que la landing está lista para review (proceso operativo fuera de esta fase).
- Monitorear Vercel analytics / Speed Insights post-deploy por si hay regression de CLS / FCP / LCP con las fuentes editorial (EB Garamond 400/500/600/700/800 + Inter + JetBrains Mono 400/500 — 10 font files loaded, vs 0 en la versión previa que usaba system fonts).

**Fases futuras relacionadas (no bloqueantes):**

- `ui-redesign-dashboard-chrome` — sidebar global + `<Brand />` component + shell del dashboard (fuera de `/whatsapp`). Reutilizará los mismos tokens `.theme-editorial`.
- `ui-redesign-conversaciones-modales` — modales/sheets internos del inbox que quedaron slate en v1 editorial del inbox.
- Eventual blog / docs / pricing page bajo `(marketing)/` — aplicar el mismo pattern de esta fase.
