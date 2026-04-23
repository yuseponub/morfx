---
phase: ui-redesign-landing
type: standalone
status: planning
created: 2026-04-22
driver: Meta App Review (Facebook Business Verification) — landing debe verse editorial cuando Meta la revise
---

# CONTEXT — UI Redesign Landing (Editorial)

## Por qué

La landing pública `morfx.app` actualmente usa el look shadcn-slate default. La fase `ui-redesign-conversaciones` (cerrada 2026-04-22, HEAD `eaa701d`) entregó el aesthetic editorial (paper/ink, EB Garamond display, Inter body, JetBrains Mono) en el módulo `/whatsapp` del dashboard, activado para Somnio workspace en prod.

**Trigger:** Meta va a revisar `morfx.app` en su verificación de business. El producto (dashboard + inbox v2) ya tiene el nuevo look, pero la landing sigue slate — incoherencia de marca visible en la review.

**Objetivo:** aplicar el mismo lenguaje editorial a las 3 páginas públicas de `(marketing)` (landing + terms + privacy) + el shell compartido (header + footer + layout), sin cambios de copy, antes de que Meta revise.

## Scope

### IN
- `src/app/(marketing)/[locale]/page.tsx` — landing principal
- `src/app/(marketing)/[locale]/layout.tsx` — marketing shell wrapper + fuentes editoriales + `.theme-editorial` root
- `src/app/(marketing)/[locale]/terms/page.tsx` — términos (página legal larga)
- `src/app/(marketing)/[locale]/privacy/page.tsx` — privacidad (página legal larga)
- `src/components/marketing/landing/hero.tsx`
- `src/components/marketing/landing/about.tsx`
- `src/components/marketing/landing/product-section.tsx`
- `src/components/marketing/landing/cta.tsx`
- `src/components/marketing/legal/legal-section.tsx`
- `src/components/marketing/header.tsx`
- `src/components/marketing/footer.tsx`

Total: **11 archivos** (9 existentes + 2 cuyos componentes ya existen).

### OUT
- `src/app/globals.css` — NO se modifica. Todos los tokens + utilities (`.theme-editorial`, `.mx-*`) ya existen desde Plan 01 de ui-redesign-conversaciones. Aplicamos, no creamos.
- `src/app/(dashboard)/**` — out-of-scope. Esta fase es solo marketing público.
- `src/components/marketing/locale-toggle.tsx` — 42 LOC, componente chico. Reutilizable como está (solo un select). Si hace falta ajuste mínimo de styling, se incluye en la task del header.
- Fonts loader — el archivo `src/app/(dashboard)/whatsapp/fonts.ts` es per-route. Para marketing creamos un archivo análogo `src/app/(marketing)/fonts.ts` — escaneo de buildsize confirma que Next carga las fuentes por segment root, no las duplica.
- Copy — textos/traducciones intactos. Solo estructura, tipografía, color, espaciado.
- Dark mode toggle — se remueve del marketing header. `.theme-editorial` fuerza `color-scheme: light` (UI-SPEC §12.4), el toggle en marketing es ruido visual sin efecto.
- Logo `/logo-dark.png` — en el header de marketing usamos solo `/logo-light.png` (dark mode out-of-scope en editorial). Si querés una versión editorial del logo con treatment especial, sale en otra fase.

## Decisiones locked (D-LND-01..D-LND-12)

**D-LND-01 — Aesthetic: editorial extrapolado.** Mismo lenguaje que ui-redesign-conversaciones pero escalado para marketing: hero con display serif grande (.mx-display o nueva escala .mx-display-xl a definir inline), rule ornaments como section dividers (❦ + smallcaps), mono para metadata.

**D-LND-02 — Sin feature flag.** A diferencia de `/whatsapp` (flag per-workspace), la landing pública es visible para todos. El re-skin es permanente — rollback sería vía revert de commits, no flag flip. Razón: no tiene sentido gating público para Meta review.

**D-LND-03 — Fonts: loader dedicado marketing.** `src/app/(marketing)/fonts.ts` exporta las mismas 3 familias (EB Garamond, Inter, JetBrains Mono) con las mismas variables CSS. Aplicadas al root del marketing layout div.

**D-LND-04 — Theme scope: `.theme-editorial` unconditional en marketing layout.** A diferencia del inbox (`v2 && 'theme-editorial'`), aquí es siempre editorial. `InboxV2Provider` NO se usa en marketing — es específico del inbox.

**D-LND-05 — Tres páginas coherentes.** Landing + terms + privacy reciben todas el tratamiento editorial. Decisión del usuario 2026-04-22 (sobre opción "sí — las 3 páginas coherentes").

**D-LND-06 — Copy intacto.** Cero cambios de texto en i18n messages. Solo wrappers/classes/structure.

**D-LND-07 — ThemeToggle removido del marketing header.** Vive solo en dashboard header. Justificación: editorial es light-only por diseño (UI-SPEC §12.4).

**D-LND-08 — Logo: light only en marketing.** `/logo-light.png` unconditional. `/logo-dark.png` se deja en el repo (lo usa el dashboard header probablemente).

**D-LND-09 — Legal pages: marginalia para section numbers.** Terms y privacy son largos (141-151 LOC). Patrón editorial tipo revista: números de sección en marginalia izquierda (`.mx-marginalia`), cuerpo en columna central con `.mx-body-long` + leading editorial. Subheadings en `.mx-smallcaps`. Rule ornament (❦) entre secciones mayores.

**D-LND-10 — CTA button pattern.** Botones primarios usan el mismo tratamiento editorial que el Send button del composer: `bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)] hover:bg-[var(--ink-2)] rounded-[4px] active:translate-y-px px-[16px] py-[8px] font-semibold text-[13px]` — consistencia product ↔ marketing.

**D-LND-11 — Responsive breakpoints.** Mantener los breakpoints actuales (sm, md, lg). Escalas editoriales (display, h1-h4, body) se adaptan per-breakpoint: display ≥5rem en ≥md, ≥3.5rem en <md. CLS <0.1 target.

**D-LND-12 — Deploy: push único al final.** Commits atómicos por task, pero SIN push intermedio. Un git push al cierre de la fase (después de DoD + TS clean) para que Meta vea el cambio completo.

## Constraints técnicos

- **Next.js 15 App Router:** Server Components por default en marketing. Todos los files actuales son server components. Mantener.
- **i18n:** `next-intl` via `[locale]` segment. Todas las translations live en `src/messages/{locale}.json`. No tocamos.
- **Tailwind v4:** tokens bare OKLCH, utilities via `@layer`. `.theme-editorial` ya existe en globals.css.
- **Vercel edge:** no SSG issues con fonts next/font (funciona en edge).

## Éxito / Regla 6 compliance

- Regla 6 no aplica (marketing no es un agente productivo — es una landing pública). Pero mantenemos atención a NO tocar archivos fuera del scope:
  - Cero cambios en `src/app/(dashboard)/` (incluye el inbox v2 ya shipped).
  - Cero cambios en `src/lib/`, `src/hooks/`, domain, hooks, agentes.
  - Cero cambios en `globals.css` (tokens ya definidos).
  - Cero cambios en `messages/{locale}.json` (copy intacto).

## Artefactos esperados al cierre

- `01-SUMMARY.md`, `02-SUMMARY.md`, `03-SUMMARY.md` (uno por plan)
- `LEARNINGS.md` — patterns de adaptar editorial de dashboard a marketing
- `dod-verification.txt` — grep checks + TS clean + responsive smoke
- Commits atómicos + push único al final
- Vercel live deploy visible en `morfx.app` (todas las locales) antes de Meta review

## Handoff futuro

Si más adelante se pide:
- **Dark mode en marketing:** re-trabajar D-LND-07 + añadir shadcn-dark variants bajo `.theme-editorial.dark { ... }` en globals.css. No trivial — el aesthetic editorial está diseñado para paper, no dark.
- **Animaciones / micro-interacciones:** fuera de scope. Motion library (framer-motion) no se agrega aquí.
- **Re-copywriting:** fuera de scope. Separar en su propia fase con input del equipo marketing.
