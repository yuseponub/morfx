---
phase: ui-redesign-dashboard
type: standalone-mega
status: planned-ready-to-execute
created: 2026-04-23
base_commit: 9642e36  # post-landing-realignment
driver: Completar la coherencia visual editorial end-to-end. Producto (inbox v2) + landing pública ya están editoriales. Faltan 7 módulos del dashboard para cerrar el sistema.
---

# CONTEXT — UI Redesign Dashboard (mega-fase)

## Por qué

Post ship de `ui-redesign-conversaciones` (inbox v2 editorial, flag per-workspace) + `ui-redesign-landing` (morfx.app editorial, sin flag), hay una inconsistencia obvia cuando el usuario del dashboard navega entre módulos:

- **`/whatsapp`** → editorial paper/ink (con flag ON)
- **`/crm`, `/tareas`, `/agentes`, `/automatizaciones`, `/analytics`, `/metricas`, `/configuracion`** → shadcn slate default

Si Somnio (único workspace con `ui_inbox_v2.enabled=true`) cambia entre módulos, la transición visual es jarring. El design handoff v2.1 (`morfx Design System (2).zip`) incluye mocks pixel-perfect de los 7 módulos restantes, así que tenemos fuente de verdad clara.

**Objetivo:** llevar los 7 módulos del dashboard al mismo lenguaje editorial, gated por flag maestro `workspaces.settings.ui_dashboard_v2.enabled` (parelelo a `ui_inbox_v2.enabled`) para poder activarlos juntos en Somnio al final de QA.

## Scope

### IN (7 módulos + infraestructura compartida)

**Infraestructura compartida (Wave 0, pre-requisito para los 7 módulos):**
- `src/lib/auth/dashboard-v2.ts` (NEW) — helper `getIsDashboardV2Enabled(workspaceId)` fail-closed, mismo patrón que `getIsInboxV2Enabled`
- `src/app/(dashboard)/fonts.ts` (NEW) — loader de 3 fuentes (EB Garamond + Inter + JetBrains Mono) aplicable al segment completo del dashboard
- `src/app/(dashboard)/layout.tsx` (MODIFY) — aplicar font variables + conditional `theme-editorial` class wrapper basado en el flag (SSR via await)
- `src/components/layout/sidebar.tsx` (MODIFY) — re-skin editorial del sidebar (el chrome global del dashboard — paper-1 bg + smallcaps section headings + ink-1 border + wordmark morf·x en collapsed/expanded states)
- `src/components/layout/header.tsx` / topbar (MODIFY si existe) — editorial treatment
- `src/components/layout/dashboard-v2-context.tsx` (NEW) — `DashboardV2Provider` + `useDashboardV2()` hook para propagación sin prop drilling (análogo a `InboxV2Provider`)

**7 módulos (Waves 1–4 paralelos):**

1. **CRM** (`src/app/(dashboard)/crm/`) — page.tsx + contactos/ + pedidos/ + productos/ + sus components. Mock: `crm.html`. Patrones clave: dictionary-table look para listados (paper-0 bg + border ink-1 + column headers smallcaps rubric-2 + row serif body), tags `.mx-tag--*`, detail drawer paper-2 con ledger-style rows.

2. **Pedidos** (`src/app/(dashboard)/crm/pedidos/`) — ya vive dentro de CRM pero tiene su propio mock `pedidos.html`. Patrones: status pill editorial, timeline de estados con rule ornaments, detail sheet con ledger legal data.

3. **Tareas** (`src/app/(dashboard)/tareas/`) — page.tsx + components/. Mock: `tareas.html`. Kanban 4-col con cards paper-0 + border ink-1; detail sheet con timeline + checklist; toggle lista/kanban.

4. **Agentes** (`src/app/(dashboard)/agentes/`) — page.tsx + config-panel + metrics-dashboard. Mock: `agentes.html`. Pattern: agent cards con header nombre+status dot + model meta + stats grandes 847 turnos/94% auto/1.8s; editor de prompts con `font-mono` serif-respiro editorial.

5. **Automatizaciones** (`src/app/(dashboard)/automatizaciones/`) — page.tsx + builder/ + components/. Mock: `automatizaciones.html`. Canvas con nodes bordered ink-1 paper-0 + mini-icons; inspector paper-2 + lista lateral.

6. **Analytics + Métricas** (`src/app/(dashboard)/analytics/` + `src/app/(dashboard)/metricas/`) — dashboards con metric cards + charts. Mock: `analytics.html`. Charts styled editorial (axes ink-3, grid-lines ink-4, series rubric-2+accent-*); cards paper-0 border ink-1 con numbers grandes serif.

7. **Configuración** (`src/app/(dashboard)/configuracion/`) — integraciones + whatsapp + tareas + users. Mock: `configuracion.html`. Settings pages con `<LegalSection>`-like pattern (marginalia + body-long); integration cards paper-2 + status badges editorial.

### OUT (NO TOUCH)

- **`/whatsapp` module** — inbox v2 ya shipped en fase `ui-redesign-conversaciones`. Gate es `ui_inbox_v2.enabled` (independiente del flag de esta fase).
- **`/super-admin`** — consola interna, no parte del producto comercial. Queda slate.
- **`/sandbox`** — herramienta de testing interna. Queda slate.
- **`/onboarding`, `/create-workspace`, `/invite`** — flujos one-time de setup que Meta no revisa. Quedan slate.
- **`src/app/globals.css`** — tokens + utilities editorial ya existen desde Plan 01 de `ui-redesign-conversaciones`. Cero cambios.
- **`src/app/(marketing)/`** — landing + legal pages ya editoriales, fase cerrada.
- **`src/lib/**`, `src/hooks/**`, `src/lib/agents/**`, `src/inngest/**`, `src/app/actions/**`, domain layer** — CERO cambios funcionales. Esta es una fase UI-only.
- **`src/messages/{es,en}.json`** — copy preservado. Si un mock tiene texto nuevo, se hardcodea español (mismo trade-off que D-LND-06 en landing; i18n para dashboard queda como deuda posterior).
- **`src/components/ui/*`** (shadcn primitives) — NO tocar salvo por extensiones aditivas BC (igual que `dropdown-menu.tsx` + `popover.tsx` en fase inbox v2 — agregar `portalContainer` prop si hace falta para otros primitives).

## Decisiones locked (D-DASH-01 a D-DASH-18)

**D-DASH-01 — Flag maestro:** `workspaces.settings.ui_dashboard_v2.enabled` (boolean, fail-closed a `false` si ausente). Scope = los 7 módulos (NO `/whatsapp` que tiene su propio flag). Resolver via `getIsDashboardV2Enabled(workspaceId)` — mismo pattern que `getIsInboxV2Enabled`.

**D-DASH-02 — Activación unitaria:** el flag activa los 7 módulos de una vez. NO hay sub-flags por módulo. Razón: la coherencia visual se rompe si solo 3 de 7 módulos se ven editoriales. QA pre-activación debe cubrir los 7.

**D-DASH-03 — Flag separado del inbox:** `ui_dashboard_v2.enabled` es independiente de `ui_inbox_v2.enabled`. Un workspace puede tener uno sin el otro. Caso típico: Somnio hoy tiene `ui_inbox_v2=true` y `ui_dashboard_v2=false`. Post-QA de esta fase, se prende ambos.

**D-DASH-04 — Scope path-based:** la clase `.theme-editorial` se aplica al wrapper del `(dashboard)/layout.tsx` ROOT condicionalmente. Cuando está ON, TODAS las subrutas heredan — incluyendo las que están OUT-OF-SCOPE (super-admin, sandbox, etc.) si el usuario navega a ellas. **Mitigación:** esas rutas pueden romperse visualmente en flag ON — se marcan como no-soportadas en QA; si el usuario necesita super-admin/sandbox con flag ON, se agrega excepción con `[data-theme-override="slate"]` en sus layouts.

**D-DASH-05 — Fuentes: loader per-segment.** `src/app/(dashboard)/fonts.ts` análogo a `(marketing)/fonts.ts` y `(dashboard)/whatsapp/fonts.ts`. Confirmed no hay duplicación en bundle (Next next/font lo optimiza).

**D-DASH-06 — Sidebar global editorial gated.** Sidebar vive en `src/components/layout/sidebar.tsx` y se renderiza en TODO el dashboard. Dos estados visuales coexisten según flag: OFF = shadcn slate actual (byte-identical), ON = editorial (paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state). El wordmark `morf·x` se aplica en ambos estados del flag OFF pero con logo light y en flag ON con typography serif.

**D-DASH-07 — Contacto con DB / realtime / hooks cero.** Esta fase es UI-only. Ninguna query, mutation, hook, o socket se modifica. Solo wrappers JSX y className swaps. Verificable via git diff.

**D-DASH-08 — Mocks como fuente de verdad.** Para cada módulo, el mock HTML respectivo en `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/` es la referencia pixel-perfect. Si el código tiene features no representadas en el mock (ej. bulk actions, advanced filters que el mock no muestra), se preservan como están con adaptación mínima de tokens.

**D-DASH-09 — Shadcn primitives se extienden aditivamente si hace falta.** Como en fase inbox v2 (`dropdown-menu.tsx` + `popover.tsx` ganaron `portalContainer` prop), esta fase puede agregar props opcionales a más primitives (ej. `dialog`, `sheet`, `select`) si hace falta re-root de portales dentro del tema. Backwards compatible siempre.

**D-DASH-10 — Modals/Sheets tema-respetuosos.** Todo primitive de Radix/shadcn que use portal debe re-root dentro del wrapper `.theme-editorial` via `portalContainer` prop. Sin esto, los modales salen fuera del tema y rompen la coherencia. Standard para esta fase.

**D-DASH-11 — Tablas como "dictionary-table" pattern.** La tabla editorial tiene: `<table>` border-collapse, `<th>` smallcaps rubric-2 uppercase 9-11px tracking-0.08em, `<td>` serif 13-14px ink-1/ink-2, border-bottom ink-4/border (not slate), hover paper-1 bg, active row border-left 2px rubric-2. Aplicable en CRM, Pedidos, Tareas list-view, Analytics tables.

**D-DASH-12 — Kanban cards.** Para Tareas + Pedidos kanban views: cada card es `<article>` paper-0 + border ink-1 + shadow-stamp (0 1px 0 ink-1), header con nombre/título serif 15px weight 600, body serif 13px ink-2, footer con meta mono 11px ink-3 + tags `.mx-tag--*`. Column headers smallcaps rubric-2 + count mono.

**D-DASH-13 — Charts editorial.** Analytics charts (Recharts o similar): axes ink-3, grid lines ink-4/20%, font sans 11px, series colors en order rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2. Background paper-0 en el chart container + border ink-1 + shadow-stamp.

**D-DASH-14 — Forms editorial.** Inputs/selects/textareas: border ink-1 rounded-[3px] paper-0 bg, focus ring ink-1 (not slate ring), labels smallcaps rubric-2 10-11px tracking-0.12em uppercase, error state border rubric-2. Buttons primary = rubric-2 press pattern (igual que landing), buttons secondary = ink-1 outline, buttons destructive = rubric-1 outline.

**D-DASH-15 — Status/badges.** Reemplazar los badges shadcn (bg-primary, bg-secondary, etc.) con clases `.mx-tag--*` del handoff (`.mx-tag--rubric` para active/on, `.mx-tag--gold` para warning, `.mx-tag--indigo` para info, `.mx-tag--verdigris` para success, `.mx-tag--ink` para neutral). Ya en `globals.css`.

**D-DASH-16 — Navegación interna de módulos.** Tabs, pills, sub-nav dentro de un módulo se ven smallcaps rubric-2 uppercase con underline border ink-1 en hover/active. Pattern del Landing Header nav primary ya establecido.

**D-DASH-17 — NO touch dashboard chrome outside layout + sidebar.** No tocar `breadcrumbs`, `user-menu`, `notifications` si viven en layer superior. Si aparecen y se ven slate dentro del tema editorial, se anotan en DoD como deuda conocida para fase posterior.

**D-DASH-18 — Copy intacto donde existen keys i18n; hardcoded es para nuevos elementos.** Mismo pattern que D-LND-06 relajada. No crear keys nuevas en messages. Si el mock tiene texto nuevo (eyebrows de secciones, labels de mini-mockups decorativos), hardcode en español.

## Constraints técnicos

- Next.js 15 App Router, React 19, Tailwind v4, Supabase, shadcn v4.
- Todos los files dashboard actuales son mix de Server + Client Components. Preservar la separación existente; solo agregar props `v2` o leer `useDashboardV2()` según corresponda.
- Evitar cambios a suspense boundaries, streaming, loading.tsx — son consideraciones de runtime no visuales.

## Regla 6 compliance

La regla 6 aplica porque modificamos módulos del producto, no solo marketing. Mitigación:

- Feature flag per-workspace (`ui_dashboard_v2.enabled`) garantiza que los cambios NO afectan a ningún workspace en producción hasta activación explícita.
- Flag-OFF path byte-identical al current (verificable con diff: si workspace tiene flag OFF, ningún componente renderea diferente).
- NO tocar domain, hooks, agents, inngest, webhooks, actions.
- Cero cambios de schema DB.

## Artefactos esperados al cierre

- `01-SUMMARY.md` (Wave 0 infra) ... `05-SUMMARY.md` (DoD + LEARNINGS + push)
- `LEARNINGS.md` con patterns (dictionary-table, kanban card, editorial charts, form treatments, portal sweeps por primitive)
- `dod-verification.txt` con 7 checks al menos (slate leakage por módulo, hsl antipattern, dark: classes, tsc clean, mx-* count, NO-TOUCH dashboard chrome/agents/lib, flag-OFF byte-identical)
- Commits atómicos por task + push único final a Vercel
- Verificación de activación: SQL snippet para prender `ui_dashboard_v2.enabled=true` en Somnio post-QA

## Mocks disponibles (fuente de verdad)

Todos viven en `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/`:
- `crm.html`
- `tareas.html`
- `pedidos.html`
- `agentes.html`
- `automatizaciones.html`
- `analytics.html`
- `configuracion.html`
- `colors_and_type.css` (referencia de tokens)
- `README.md` (patterns generales + §6 mx-tag classes + §10 loading/empty/error states + §11 lucide version)

## Handoff futuro

Post-cierre de esta fase, si surge:
- **Módulos no cubiertos hoy** (sandbox, super-admin, onboarding, comandos, confirmaciones, sms, settings) en editorial → fase nueva `ui-redesign-dashboard-extras` con alcance explícito.
- **Mobile responsive dashboard** — esta fase se enfoca en ≥1024px. Mobile responsive queda para fase separada (README §9 del handoff tiene breakpoints pero scope completo mobile es grande).
- **Dark mode editorial** — `.theme-editorial` actualmente force light (D-LND equivalent). Si el proyecto necesita dark en dashboard, es otra fase.
- **Sistema de microanimaciones / framer-motion** — mocks son estáticos. Si se quieren transitions, es fase separada.
