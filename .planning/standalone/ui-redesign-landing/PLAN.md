---
phase: ui-redesign-landing
type: standalone-multi-plan
status: proposed
wave_count: 3
plan_count: 3
files_modified_total: 11
---

# PLAN — UI Redesign Landing

Este archivo es el "plan maestro" de la fase. Cada Plan (01, 02, 03) se ejecuta como unidad atómica con commits por task y SUMMARY.md al final.

## Wave 1 — Layout editorial + Home (Plan 01)

**Objetivo:** Plantar el tema `.theme-editorial` + fuentes en el shell de `(marketing)`, luego re-skinear header, footer, y las 4 secciones de la home.

**Files modified (7):**
- `src/app/(marketing)/fonts.ts` (NEW — EB Garamond + Inter + JetBrains Mono con variables CSS)
- `src/app/(marketing)/[locale]/layout.tsx` (aplicar font variables + `theme-editorial` al root div, remover ThemeToggle de contexto)
- `src/components/marketing/header.tsx` (re-skin editorial: paper-0 bg, ink-1 border-bottom, logo light-only, remove ThemeToggle, CTA ink-1 button)
- `src/components/marketing/footer.tsx` (re-skin editorial: paper-3 bg, rule separator, smallcaps section labels, mono para legal metadata)
- `src/components/marketing/landing/hero.tsx` (eyebrow smallcaps rubric-2, display serif, CTAs editorial ink-1)
- `src/components/marketing/landing/about.tsx` (h2 editorial + rule-ornament divider + body-long)
- `src/components/marketing/landing/product-section.tsx` (cards paper-2 con rule separators internos, specs en mono)
- `src/components/marketing/landing/cta.tsx` (banner paper-2 + editorial CTA)

**Tasks:**

1. **T1 — Loader de fuentes marketing.** Crear `src/app/(marketing)/fonts.ts` análogo a `src/app/(dashboard)/whatsapp/fonts.ts`. Exportar `ebGaramond`, `inter`, `jetbrainsMono` con variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`. Commit: `feat(ui-redesign-landing-01-T1): loader de fuentes editoriales para marketing`.

2. **T2 — Marketing layout editorial.** En `(marketing)/[locale]/layout.tsx`: importar las 3 fuentes del step T1, aplicar `${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} theme-editorial flex min-h-screen flex-col` al wrapper div, eliminar la clase `bg-background text-foreground` (tokens del editorial scope la reemplazan). Preservar `NextIntlClientProvider`, `Header`, `main`, `Footer`. Commit atómico.

3. **T3 — Header editorial.** En `header.tsx`: `bg-[var(--paper-0)] border-b border-[var(--ink-2)]` reemplaza `border-b bg-background/80 backdrop-blur...`. Logo: solo `/logo-light.png` (remover la versión dark). Remover `<ThemeToggle />` (import incluido). LocaleToggle preservado. Botones: `<Button>` login ghost → `mx-smallcaps text-[var(--ink-2)] hover:text-[var(--ink-1)]`; "Empezar" CTA → tratamiento ink-1 (ver D-LND-10 en CONTEXT). Commit atómico.

4. **T4 — Footer editorial.** En `footer.tsx`: `bg-[var(--paper-3)]` reemplaza bg default. `mx-rule` al top del footer. Section headings de footer → `mx-smallcaps text-[11px] tracking-[0.12em] text-[var(--ink-3)]`. Copyright + legal metadata (NIT, razón social) → `font-mono text-[11px] text-[var(--ink-3)]`. Links → `text-[var(--ink-2)] hover:text-[var(--ink-1)] underline-offset-[3px] hover:underline`. Commit atómico.

5. **T5 — Hero editorial.** En `hero.tsx`: eyebrow (`<span>` con `{t('badge')}`) → `mx-smallcaps text-[var(--rubric-2)] text-[12px] tracking-[0.12em]` (reemplaza el `rounded-full border` style). Headline → `mx-display text-[3rem] md:text-[5rem] lg:text-[6rem] leading-[0.95] tracking-[-0.02em] text-[var(--ink-1)]`. Subhead → `mx-body-long text-[1.125rem] md:text-[1.25rem] text-[var(--ink-2)] max-w-[36rem]`. CTAs: primary = editorial ink-1 press button (exacto pattern del composer Send); secondary = `border-[var(--ink-1)] text-[var(--ink-1)] bg-transparent hover:bg-[var(--paper-1)]`. `responseTag` → `mx-caption text-[var(--ink-3)]`. Fondo: `bg-[var(--paper-0)]` + ornament horizontal rule `<hr className="mx-rule my-8 max-w-[8rem]" />` entre headline y subhead. Commit atómico.

6. **T6 — About editorial.** En `about.tsx`: section con `<div class="mx-rule-ornament my-12">` separator al inicio. Heading → `mx-h1 text-[2rem] md:text-[2.75rem] text-[var(--ink-1)]`. Párrafos → `mx-body-long text-[var(--ink-2)]` con `max-w-[42rem]` para readability. Cualquier list existente → `list-style: '❦' inside` via style inline o class nueva `mx-list-floral` (no la creo en globals — inline styles ok para este caso). Commit atómico.

7. **T7 — Product section editorial.** En `product-section.tsx`: cada "product card" envuelta en `<article class="bg-[var(--paper-2)] border border-[var(--paper-4)] rounded-[6px] p-8">`. Card heading → `mx-h3 text-[var(--ink-1)]`. Descripción → `mx-body text-[var(--ink-2)]`. Métricas / specs → `font-mono text-[13px] text-[var(--ink-3)]`. Separador entre cards → `<hr className="mx-rule" />`. Commit atómico.

8. **T8 — CTA closing editorial.** En `cta.tsx`: wrapper `<section class="bg-[var(--paper-1)] py-20 md:py-32 text-center">`. Heading → `mx-display text-[2.5rem] md:text-[4rem] text-[var(--ink-1)]`. CTA button → editorial ink-1 press (igual patrón que Hero primary). Subtext `mx-caption text-[var(--ink-3)]`. Commit atómico.

**Success criteria Plan 01:**
- `npx tsc --noEmit` clean en los 8 archivos nuevos/modificados
- `grep -q "theme-editorial" src/app/\(marketing\)/\[locale\]/layout.tsx` → PASS
- `grep -rE "bg-background|text-foreground|border-border" src/components/marketing/ src/app/\(marketing\)/` → 0 matches (ningún slate remanente en marketing)
- `grep -rE "hsl\(var\(--" src/components/marketing/ src/app/\(marketing\)/` → 0 matches (anti-pattern Tailwind v4 documentado en LEARNINGS de conversaciones)
- Home renderea en `http://localhost:3020` sin errores de hidratación

## Wave 2 — Terms + Privacy editorial (Plan 02)

**Objetivo:** Aplicar tratamiento editorial tipo revista (marginalia + body-long + rule ornaments) a las 2 páginas legales.

**Files modified (3):**
- `src/components/marketing/legal/legal-section.tsx` (wrapper reutilizado por terms/privacy — definir schema editorial)
- `src/app/(marketing)/[locale]/terms/page.tsx`
- `src/app/(marketing)/[locale]/privacy/page.tsx`

**Tasks:**

1. **T1 — LegalSection editorial.** En `legal-section.tsx`: el componente actualmente renderea headings + body. Reescribir para que reciba `sectionNumber`, `title`, `subtitle?`, `children`. Layout con grid `[auto_1fr]` o similar: col izquierda con `.mx-marginalia` para el número (ej. "§ 1" o "I"), col derecha con `.mx-h2` + `.mx-smallcaps` subtitle + `.mx-body-long` children. Rule ornament al bottom: `<hr className="mx-rule-ornament my-8" />`. Props API backward-compatible si posible; si no, actualizamos los callers en T2/T3. Commit atómico.

2. **T2 — terms/page.tsx editorial.** Aplicar `LegalSection` refactor del T1 a cada sección del archivo. Container outer: `bg-[var(--paper-0)] max-w-[64rem] mx-auto px-6 py-20`. Page title: `mx-display text-[2.5rem] md:text-[3.5rem] text-[var(--ink-1)] mb-4`. Page subtitle (fecha de actualización + versión): `mx-caption font-mono text-[var(--ink-3)]`. Todas las secciones via `<LegalSection>`. Commit atómico.

3. **T3 — privacy/page.tsx editorial.** Misma transformación que T2 pero para privacy. Commit atómico.

**Success criteria Plan 02:**
- `npx tsc --noEmit` clean en los 3 archivos
- `grep -q "mx-marginalia" src/components/marketing/legal/legal-section.tsx` → PASS
- `curl -sI http://localhost:3020/es/terms | head -1` → 200 OK
- `curl -sI http://localhost:3020/es/privacy | head -1` → 200 OK
- Visual smoke: los 2 documents renderean con marginalia, body-long con leading editorial, rule ornaments entre secciones

## Wave 3 — DoD + push final (Plan 03)

**Objetivo:** Verificar consistencia del re-skin, pruebas manuales mínimas, commit final con SUMMARY + LEARNINGS, y `git push origin main` para Vercel deploy.

**Files modified (4):**
- `.planning/standalone/ui-redesign-landing/01-SUMMARY.md` (recolectar resultados Plan 01)
- `.planning/standalone/ui-redesign-landing/02-SUMMARY.md` (recolectar resultados Plan 02)
- `.planning/standalone/ui-redesign-landing/03-SUMMARY.md` (meta — cierre de fase)
- `.planning/standalone/ui-redesign-landing/LEARNINGS.md`
- `.planning/standalone/ui-redesign-landing/dod-verification.txt`
- `docs/analysis/04-estado-actual-plataforma.md` (añadir entrada "Landing editorial v1")

**Tasks:**

1. **T1 — DoD grep + TS final.** Ejecutar suite de checks:
   ```bash
   # Check 1: no slate leakage en marketing
   grep -rE "bg-background|text-foreground|border-border/[0-9]+" src/components/marketing/ src/app/\(marketing\)/ || echo "PASS"
   # Check 2: no hsl() antipattern
   grep -rE "hsl\(var\(--" src/components/marketing/ src/app/\(marketing\)/ || echo "PASS"
   # Check 3: no dark: classes en marketing (D-LND-07)
   grep -rE "dark:" src/components/marketing/ src/app/\(marketing\)/ || echo "PASS"
   # Check 4: mx-* utilities usados
   grep -rE "mx-display|mx-h[0-9]|mx-body|mx-caption|mx-smallcaps" src/components/marketing/ src/app/\(marketing\)/ | wc -l   # expected >= 15
   # Check 5: TS clean
   npx tsc --noEmit 2>&1 | grep -E "src/app/\(marketing\)|src/components/marketing" | grep "error TS" || echo "PASS: no TS errors"
   # Check 6: Regla 6 NO-TOUCH (dashboard + lib intactos)
   git diff main -- src/app/\(dashboard\)/ src/lib/ src/hooks/ src/app/globals.css src/messages/ | wc -l   # expected 0
   ```
   Capturar a `dod-verification.txt`. Si cualquier check falla: FIX inline dentro de esta T1, re-verificar. Commit atómico.

2. **T2 — SUMMARY files + LEARNINGS + platform doc update.** Redactar `01-SUMMARY.md` y `02-SUMMARY.md` basado en commits reales de cada plan. Redactar `03-SUMMARY.md` cerrando la fase. Redactar `LEARNINGS.md` con: (a) adaptación editorial dashboard → marketing patterns, (b) fonts loading per-segment decision, (c) removal of theme-toggle rationale, (d) legal pages editorial pattern (marginalia + body-long + rule ornaments). Actualizar `docs/analysis/04-estado-actual-plataforma.md` con entrada nueva en sección marketing/landing. Commit atómico.

3. **T3 — Push final.** Ejecutar `git push origin main`. Reportar commit hashes pushed. Vercel picks up automáticamente. Reportar al usuario que morfx.app va a reflejar el cambio en ~1-2 min.

**Success criteria Plan 03:**
- DoD verification captura 6/6 checks PASS en `dod-verification.txt`
- 3 SUMMARY files committed
- LEARNINGS.md committed con ≥4 patterns documentados
- `docs/analysis/04-estado-actual-plataforma.md` committed con entrada nueva
- `git push origin main` successful
- Vercel deploy triggered

## Ejecución

**Wave 1** se puede ejecutar sequencialmente tarea-por-tarea (8 commits atómicos) en una sola invocación del executor — todas las tasks son sobre archivos distintos, no hay dependencias entre sí (salvo que T2 consume el export de T1). Todas las tasks terminan con TS clean.

**Wave 2** depende de Wave 1 (necesita el layout + tokens aplicados). Sequential 3 tasks en una invocación.

**Wave 3** depende de ambas previas. Final invocación con DoD + SUMMARY + push.

Total estimado: **3 invocaciones de gsd-executor** (una por wave), ~14 commits atómicos + 1 push final.
