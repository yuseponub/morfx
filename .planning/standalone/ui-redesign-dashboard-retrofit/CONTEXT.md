---
phase: ui-redesign-dashboard-retrofit
type: standalone-retrofit
status: ready-to-execute
created: 2026-04-23
base_commit: c1d841e  # post ui-redesign-dashboard SHIPPED (flag OFF)
driver: La mega-fase `ui-redesign-dashboard` shipped 2026-04-23 con fidelidad ~35% al mock de Claude Design (UI-REVIEW BLOCK verdict). Los executors aplicaron tokens sobre shadcn primitives en vez de restructurar JSX a raw HTML semántico como los mocks demandan. Esta fase retrofit corrige el drift módulo por módulo con pilot-first approach.
predecessor: ui-redesign-dashboard (SHIPPED 2026-04-23, flag OFF, `.planning/standalone/ui-redesign-dashboard/UI-REVIEW.md`)
---

# CONTEXT — UI Redesign Dashboard Retrofit

## Por qué

`ui-redesign-dashboard` quedó con ~35% fidelity al mock. Los 7 módulos usan primitives shadcn (Card/Sheet/Tabs/DataTable) con tokens editorial sobreimpuestos. El mock NO usa esas primitives — usa `<section>`, `<article>`, `<aside>`, `<details>/<summary>`, `<table class="dict">` raw con paddings/radii/shadows específicos que NO se pueden lograr sobreescribiendo classNames de shadcn.

El usuario requiere **near-pixel-perfect match** al Claude Design handoff v2.1: distribuciones, líneas, fonts, localizaciones, paddings, radii y box-shadows idénticos. No "tokens aplicados", sino **estructura JSX que refleje el HTML del mock**.

Adicional: el sidebar actual tiene 11 items planos; el usuario curó intencionalmente 8 items agrupados en 3 categorías + 6 extras que quiere re-categorizar (no eliminar).

## Proceso corregido

Las 5 reglas duras que NO se violan en ningún plan del retrofit:

**R-RETRO-01 — Raw HTML semantic, NO shadcn primitives en el v2 path.** El branch v2 de cada componente usa `<section>`, `<article>`, `<aside>`, `<details>/<summary>`, `<table>`, `<ul>/<li>` raw con clases CSS del mock. Cero `<Card>`, `<Sheet>`, `<Tabs>`, `<DataTable>`, `<Dialog>`, `<Select>` en los editorial branches. Los shadcn primitives se preservan SOLO en el `!v2` branch (legacy).

**R-RETRO-02 — Port mock CSS classes a globals.css bajo `.theme-editorial`.** Cada módulo extrae el bloque `<style>` de su mock HTML, lo transcribe a `globals.css` scoped bajo `.theme-editorial .classname`, y los JSX usan las clases directas (`<table class="dict">`, `<span class="tg red">`, etc.). NO inline Tailwind arbitrary values que emulan el mock — clases reales.

**R-RETRO-03 — Mock-coverage checklist explícito.** Cada PLAN.md incluye una sección `mock_coverage` con CADA sección del mock HTML × status (implemented/deferred/waived + razón). El executor no puede crear SUMMARY.md sin marcar el estado de cada fila. Deferred requiere justificación (ej. "endpoint no existe" o "feature producto post-MVP").

**R-RETRO-04 — Fresh file rewrite, not retrofit over shadcn.** Cada componente editorial vive en un archivo nuevo: `page-v2.tsx`, `contacts-table-v2.tsx`, etc. Los originales se preservan intactos. El ternary `v2 ? <ComponentV2/> : <ComponentLegacy/>` vive en el page/parent.

**R-RETRO-05 — Human visual checkpoint entre cada módulo.** El piloto (CRM) cierra cuando el usuario valida visualmente `/crm/contactos` con flag ON en un workspace de QA vs el mock HTML renderizado side-by-side. Sin visto bueno humano, el plan siguiente (Pedidos) no arranca.

## Scope

### IN (fase completa — se ejecuta módulo por módulo con checkpoint)

- **Plan 01 (piloto): CRM** — `crm/layout.tsx` editorial (topbar + 4 tabs) + `crm/contactos/page.tsx` v2 rewrite (raw dict table + toolbar con 4 count chips + timestamp) + port CSS classes del mock a `globals.css`
- **Plan 02: Sidebar re-categorización** — 14 items en 4 categorías Propuesta B (ver D-RETRO-04 abajo)
- **Plans 03-08 (futuros, tras checkpoint piloto):** Pedidos, Tareas, Agentes, Automatizaciones, Analytics, Configuración — cada uno con su propio PLAN.md siguiendo R-RETRO-01..R-RETRO-05

### OUT (fuera del retrofit)

- **Infra flag + fonts + sidebar editorial wrapper** — ya shipped en `ui-redesign-dashboard/01-SUMMARY.md`. Se reusa tal cual.
- **Componentes v2 actuales** — se MANTIENEN intactos por ahora; el retrofit crea nuevos `-v2.tsx` paralelos. Cuando el retrofit cierre, los componentes v2 viejos se borran (housekeeping).
- **Decisiones producto bloqueantes (Agentes N-catálogo, Automatizaciones flow-canvas)** — se escalan al usuario antes de Plans 06-07. Si el producto no quiere N agentes / flow canvas, se documenta como D-RETRO-EXCEPTION y esos módulos se cierran con fidelity parcial (topbar + tokens pero sin restructuración paradigmática).
- **Agregar features que no existen en backend** (cohort retention, heatmap, top products) — se defieren a fase posterior o se waived en coverage checklist.
- **Dark mode / mobile responsive / microanimaciones** — mismas restricciones que fase previa.

## Decisiones locked (D-RETRO-01..D-RETRO-08)

**D-RETRO-01 — Fresh rewrite.** Los componentes v2 actuales se descartan. Nuevos archivos `-v2.tsx` con raw HTML semantic que copia la estructura del mock. Ternary en el parent.

**D-RETRO-02 — Raw HTML semantic primitives.** Los editorial branches usan solamente:
- `<section>`, `<article>`, `<aside>`, `<header>`, `<main>`, `<nav>`
- `<details>/<summary>` para collapsibles
- `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` raw (NO `<DataTable>`)
- `<ul>/<li>` con roles si navegación
- `<button>`, `<input>`, `<textarea>`, `<select>` nativos cuando suficiente
- Lucide icons son OK (el mock los usa)

Si alguna interacción requiere sofisticación (focus trap, escape key, portal) que el raw HTML no da, se agrega un wrapper mínimo CON JUSTIFICACIÓN en el plan. NO se importan shadcn primitives por default.

**D-RETRO-03 — Port mock CSS a globals.css.** Cada plan extrae el `<style>` block del mock correspondiente y lo transcribe a `src/app/globals.css` dentro del bloque `.theme-editorial`. Las clases mantienen su nombre original del mock (`.card`, `.dict`, `.tg.red`, etc.) para que el JSX sea literalmente el HTML del mock adaptado a React.

Razón: el mock usa box-shadows, paddings y radii específicos que se pierden al traducir a Tailwind arbitrary values en cada componente. Tenerlos en globals.css garantiza consistencia + permite al JSX ser `<table class="dict">` idéntico al mock.

**D-RETRO-04 — Sidebar re-categorización (Propuesta B).** 14 items en 4 categorías:

| Categoría | Items |
|-----------|-------|
| **Operación** | CRM, WhatsApp, Pedidos, Tareas, Confirmaciones, SMS |
| **Automatización** | Automatizaciones, Agentes, Comandos |
| **Análisis** | Analytics, Metricas |
| **Admin** | Sandbox, Equipo, Configuración |

Categorías renderean con `.cat` smallcaps uppercase 10px tracking-0.14em ink-3 divider (per mock). Los items mantienen sus rutas actuales.

**D-RETRO-05 — CRM piloto primero, checkpoint visual humano antes de continuar.** Plan 01 = CRM (layout con tabs + contactos rewrite + port CSS). Tras commit + push, Claude para. Usuario navega `/crm/contactos` con flag ON en QA workspace + abre `mocks/crm.html` en el navegador + compara side-by-side. Si matchea suficientemente, apruebas. Si no, gap-closure inline antes de Plans siguientes.

**D-RETRO-06 — Flag reuse `ui_dashboard_v2.enabled`.** Misma infra que `ui-redesign-dashboard` shipped:
- `getIsDashboardV2Enabled(workspaceId)` — sin cambios
- `DashboardV2Provider` + `useDashboardV2()` — sin cambios
- `.theme-editorial` wrapper en `(dashboard)/layout.tsx` — sin cambios
- Fonts loader — sin cambios

El retrofit se suma al mismo flag. Activación (post-QA) actualiza el mismo JSONB field.

**D-RETRO-07 — Componentes v2 actuales preservados durante retrofit.** Los archivos v2 editoriales shipped por `ui-redesign-dashboard` (ej. `contacts-table.tsx` con branch v2 shadcn-tokens) NO se tocan. Nuevos archivos con sufijo `-v2.tsx` renderean el editorial correcto. Ternary en el parent: `v2 ? <ContactsTableV2/> : <ContactsTableLegacy/>`. Cuando los 7 módulos del retrofit cierren, los archivos v2 viejos se borran en housekeeping final.

**D-RETRO-08 — Mock-coverage checklist obligatorio en cada plan.** Cada PLAN.md de este retrofit incluye:
```yaml
mock_coverage:
  mock_file: path/to/mockN.html
  sections:
    - id: topbar
      mock_lines: "109-119"
      description: "Eyebrow + h1 + 3 actions"
      status: implemented | deferred | waived
      waive_reason: "..." # required if deferred/waived
    - id: toolbar
      mock_lines: "128-135"
      ...
```
El executor actualiza este checklist conforme implementa. SUMMARY.md al cierre cita el coverage ratio (implemented / total).

## Constraints técnicos

- Next.js 15 App Router, React 19, Tailwind v4, Supabase.
- Preservar separación Server/Client Components existente. Raw HTML funciona en ambos — esto no bloquea SSR.
- Lucide icons se importan normalmente (ya en uso via `next/font/google` shipped en Plan 01 de fase anterior).
- Shadcn primitives (`@/components/ui/*`) permanecen en el codebase — solo se evita su uso en los editorial branches.
- `globals.css` ya tiene el bloque `.theme-editorial` desde `ui-redesign-conversaciones`; se AMPLÍA con las clases nuevas del mock, no se reescribe.

## Regla 6 compliance

- Flag `ui_dashboard_v2.enabled` defaults false por workspace. NO activar en Somnio durante el retrofit — solo en un workspace QA dedicado (crear si no existe) o con rollback immediato entre tests.
- Cada fresh-rewrite component preserva el legacy branch intacto cuando `v2=false` (mismo pattern que ya funciona — flag OFF byte-identical al HEAD pre-fase).
- Cero cambios a `src/lib/domain/**`, `src/hooks/**`, `src/lib/agents/**`, `src/inngest/**`, `src/app/actions/**` (D-DASH-07 heredado).

## Artefactos esperados

Por cada módulo del retrofit:
- `NN-PLAN.md` con mock_coverage checklist + tasks atomicos
- `NN-SUMMARY.md` con coverage ratio + evidencia de matching (grep de classes CSS usadas + screenshots opcionales)
- Port incremental de CSS a `globals.css` (un commit separado por plan)
- Visual checkpoint aprobado por usuario antes del siguiente plan

Al cierre del retrofit completo:
- `UI-REVIEW-v2.md` — re-audit con los 7 módulos target >80% fidelity
- `LEARNINGS.md` — qué cambió en el proceso vs la fase original
- Housekeeping commit: remover archivos v2 viejos (contacts-table.tsx branch shadcn-tokens, etc.)
- Activación en Somnio solo tras el retrofit completo + QA side-by-side aprobado
