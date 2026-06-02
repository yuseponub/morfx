---
phase: ui-redesign-dashboard
plan: 08
type: execute
wave: 3
depends_on: ['01']
files_modified:
  - src/app/(dashboard)/configuracion/integraciones/page.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
  - src/app/(dashboard)/configuracion/whatsapp/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx
  - src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx
  - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx
  - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx
  - src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx
  - src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx
  - src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx
  - src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx
  - src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx
  - src/app/(dashboard)/configuracion/tareas/page.tsx
  - src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx
autonomous: true
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-11
  - D-DASH-14
  - D-DASH-15
  - D-DASH-16

must_haves:
  truths:
    - "Cuando `useDashboardV2()===true`, todas las pages bajo `/configuracion/**` (integraciones, whatsapp landing, whatsapp/templates, whatsapp/equipos, whatsapp/quick-replies, whatsapp/costos, tareas) renderean header editorial: eyebrow `mx-smallcaps` color `var(--rubric-2)` con la sección padre (Datos / Workspace / Personal según el mock §sec.eye), h1 26-30px serif `mx-display`-style, descripción en `<em>` 15px sans color ink-3 inline al título (mock §panel.h2 em). Save/action buttons usan los button styles editoriales `.btn` + `.btn.pri` definidos en mock §53–58 (translado a Tailwind tokens)."
    - "Cuando `useDashboardV2()===false`, el header current de cada page (h1 + p text-muted-foreground + buttons shadcn) se preserva byte-identical (D-DASH-07: cero cambios funcionales, D-DASH-06 chrome global ya gated en Plan 01)."
    - "Forms editorial (D-DASH-14): inputs/selects/textareas en flag ON usan `bg-[var(--paper-0)] border border-[var(--border)] rounded-[var(--radius-3)] px-[10px] py-[8px] text-[13px] text-[var(--ink-1)]`; focus ring `border-[var(--ink-1)] shadow-[0_0_0_3px_var(--paper-3)]`; labels smallcaps rubric-2 10-11px tracking-0.12em uppercase; error state border rubric-2. shopify-form, bold-form, template-form, team-form, quick-reply-form, task-types-manager forms aplican estos tokens via cn() conditional con `v2`."
    - "Cards editorial: cuando v2, usan `bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] mb-[18px]` con header `border-b border-[var(--border)] px-[18px] py-[14px] flex items-baseline justify-between gap-[10px]` y h3 serif 18px font-display weight 700 letter-spacing -0.01em (mock §.card §.card.hd §.card.hd h3). Reemplaza el shadcn Card pattern conditionally."
    - "Integration cards (D-DASH-15, mock §intg): cuando v2, en `integraciones/page.tsx` los tabs cards (Shopify/SMS/BOLD) y los integration items (sync-status events) usan layout grid `grid-cols-[40px_1fr_auto] gap-[12px] items-center border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-[14px]`. Logo cuadrado 40x40 + título sans 13 weight 600 + descripción sans 11 ink-3 + status badge derecha (`.status.on` = bg-emerald paper-3 + border emerald + uppercase 11px). Estado activo card: bg `oklch(0.98 0.015 150)` + border `oklch(0.75 0.08 150)`. Estado inactivo card neutral."
    - "Status badges (D-DASH-15): cuando v2, los badges de status (`Activo`/`Inactivo`/`Pagado`/`Pendiente`/`Aprobado`/`Pausado`/`En revision`/`Rechazado` para templates, equipos, integraciones, sync-status events) usan clases `.mx-tag` + variante apropiada del handoff: `.mx-tag--verdigris` para success/active/aprobado, `.mx-tag--gold` para warning/pending/en-revision, `.mx-tag--rubric` para error/failed/rechazado, `.mx-tag--ink` para neutral/inactivo, `.mx-tag--indigo` para info/pausado. Reemplaza `<Badge variant=\"...\">` conditionally con `{v2 ? <span className=\"mx-tag mx-tag--verdigris\">...</span> : <Badge variant=\"default\">...</Badge>}`."
    - "Tablas dictionary-table (D-DASH-11): cuando v2, las tablas de team-list (members), template-list (templates), quick-reply-list (quick replies), task-types-manager (types), category-breakdown (categorías de costo), sync-status (eventos webhook) renderean: `<table className=\"w-full border-collapse\">` con `<thead><th>` smallcaps rubric-2 uppercase 10-11px tracking-0.08em color ink-3 border-bottom 1px ink-1 paper-1 bg, `<tbody><td>` serif 13px ink-1 padding-10px border-bottom 1px border, hover row paper-1 bg, last row sin border-bottom (UI-SPEC dictionary-table — pattern del mock §table.t)."
    - "Empty/loading states (D-DASH-16, mock §README §10): cuando v2, listas vacías (sin teams, sin templates, sin quick-replies, sin task-types, sin webhook events, sin sync activa) renderean `mx-h3 'No hay {recurso} todavía.'` + `mx-caption '{breve descripción + CTA}'` + `mx-rule-ornament '· · ·'`. Loading spinners (Loader2) cuando v2 reemplazados por skeleton blocks `bg-[var(--paper-2)] border border-[var(--border)] h-[72px] animate-[mx-pulse_1.5s_ease-in-out_infinite]` o el spinner inline mantenido pero color ink-3."
    - "Sub-nav editorial (D-DASH-16): la navegación interna del módulo `/configuracion/whatsapp/` (las 4 cards-as-links: Templates, Equipos, Quick Replies, Costos) en flag ON renderea como dictionary-table-style links (mock §sec a.it pattern) con icon lucide 15x15 + label sans 13 ink-2 weight 500 + count mono 10 ink-3 right-aligned. Active state border ink-1 + bg paper-0 + shadow-stamp + weight 600 ink-1. La page `/configuracion/whatsapp/page.tsx` swap del grid de cards por una vertical list editorial gated."
    - "NO-TOUCH builder agente (scope rule): `src/app/(dashboard)/configuracion/whatsapp/templates/builder/**` NO se modifica. Esa subruta tiene su propio agente de scope (`config-builder-whatsapp-templates`, ver `.claude/rules/agent-scope.md`). El chrome del wrapper builder ya hereda fonts + `.theme-editorial` del layout root via Plan 01; el chat-pane / preview-pane / template-draft-context / chat-message / image-uploader / whatsapp-bubble / template-builder-layout NO se tocan en esta fase. Verificable con git diff."
    - "Cero cambios funcionales (D-DASH-07): NO se modifica server actions (`@/app/actions/shopify`, `/templates`, `/teams`, `/quick-replies`, `/tasks`, `/integrations`, `/usage`, `/integrations`), ni validators, ni save handlers, ni `createClient`/`createAdminClient` calls, ni `cookies()`/redirect logic, ni `revalidatePath`, ni `useForm`/`useTransition`/`useState`/`useEffect` shapes, ni `Suspense` boundaries. Solo wrappers JSX y className swaps gated por `v2`."
    - "Flag-OFF byte-identical (Regla 6): con `useDashboardV2()===false`, git diff de la rama vs main muestra cambios SOLO en estos 24 archivos in-scope, no en hooks/actions/types/domain/lib. Todas las pages renderean idéntico al state actual de prod. Cero leak en sidebar agentes / agente automatizaciones builder / integration runners."
    - "Build pasa: `npx tsc --noEmit` clean en todos los archivos modificados. `! grep -r 'oklch(' src/app/(dashboard)/configuracion --include='*.tsx'` excepto donde el mock explícitamente lo usa para colored badges (verificable: cualquier oklch() inline debe pertenecer a un `.mx-tag--*` class de globals.css o a la danger zone red preservada del mock)."

  artifacts:
    - path: "src/app/(dashboard)/configuracion/integraciones/page.tsx"
      provides: "Integraciones page editorial con header, tabs editorial, integration cards (D-DASH-15)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx"
      provides: "SMS tab editorial con status badges mx-tag, balance card, usage stats dictionary-table"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx"
      provides: "Sync status editorial: stats cards + events list dictionary-table + status mx-tag"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx"
      provides: "Shopify form editorial: input editorial tokens + select editorial + Switch reskin + status mx-tag"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx"
      provides: "BOLD form editorial: input editorial tokens + Switch reskin"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/page.tsx"
      provides: "WhatsApp settings landing editorial: header + dictionary-list de sub-nav (Templates/Equipos/Quick Replies/Costos)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx"
      provides: "Templates list page editorial: header + actions row + list (delegado a template-list)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx"
      provides: "Template list dictionary-table (D-DASH-11) + status badges mx-tag (template-status-badge gated)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx"
      provides: "Template form editorial: inputs + textarea + select editorial tokens + variable-mapper editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx"
      provides: "Status badge mx-tag-* per status (approved=verdigris, pending=gold, rejected=rubric, paused=indigo)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx"
      provides: "Variable mapper editorial: rows con border-bottom dashed + input editorial tokens"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx"
      provides: "Teams page editorial: header con back-link + members card"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx"
      provides: "Team list editorial dictionary-table (D-DASH-11) con avatar paper-3 + role mx-tag"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx"
      provides: "Team form editorial: input editorial + buttons editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx"
      provides: "Members manager editorial: members dictionary-table + role badges mx-tag"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx"
      provides: "Quick replies page editorial: header + dialog form editorial (Dialog content portal-aware D-DASH-10)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx"
      provides: "Quick replies dictionary-table editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx"
      provides: "Quick reply form editorial: shortcut input mono + textarea editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx"
      provides: "Costos page editorial: header + period-selector editorial + grid de UsageSummary/UsageChart/CategoryBreakdown"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx"
      provides: "Usage summary editorial: stat boxes (mock §wa-status pattern) k-uppercase + v-display + s-mono"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx"
      provides: "Category dictionary-table editorial con bar visual (mock §usage urow pattern)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx"
      provides: "Period selector editorial: tabs underline-only style (gated)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/tareas/page.tsx"
      provides: "Tareas config page editorial: header + cards editorial + future-feature card editorial dimmed"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx"
      provides: "Task types manager: dictionary-table + form editorial (color picker preservado funcional)"
      contains: "useDashboardV2"

  key_links:
    - from: "src/app/(dashboard)/configuracion/integraciones/page.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook (Plan 01 output)"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/configuracion/whatsapp/page.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "all reskinned config components"
      to: ".theme-editorial CSS scope (globals.css from ui-redesign-conversaciones)"
      via: "var(--paper-0|1|2|3) + var(--ink-1|2|3) + var(--rubric-2) + var(--border) tokens + mx-tag, mx-smallcaps, mx-display, mx-h3, mx-caption, mx-mono, mx-rule-ornament utilities"
      pattern: "var\\(--paper-|var\\(--ink-|var\\(--rubric-|mx-tag|mx-smallcaps|mx-display"
    - from: "Dialog primitives (quick-replies/page.tsx, AlertDialog en shopify-form.tsx)"
      to: "theme-editorial wrapper"
      via: "portalContainer prop si el modal sale fuera del tema (D-DASH-10) — verificar con DevTools si hace falta extender shadcn dialog.tsx con portalContainer prop como en Plan 01 inbox v2"
      pattern: "portalContainer"
    - from: "src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx"
      to: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/**"
      via: "NO-TOUCH guard: builder agente preserva su scope; verificar git diff vacío en builder/**"
      pattern: "git diff --stat src/app/\\(dashboard\\)/configuracion/whatsapp/templates/builder/ — debe estar vacío"
---

<objective>
Wave 3 — Re-skin del módulo Configuración (`/configuracion/**`) al lenguaje editorial morfx, gated por `useDashboardV2()`. Cubre: integraciones (Shopify + SMS + BOLD + sync-status), settings WhatsApp (landing + templates list/form/badge/variable-mapper + equipos list/form/members + quick-replies list/form + costos summary/chart/breakdown/period-selector), y tareas (page + task-types-manager). Aplica patterns dictionary-table (D-DASH-11), forms editorial (D-DASH-14), status badges mx-tag-* (D-DASH-15), sub-nav smallcaps (D-DASH-16).

**Purpose:** Cerrar la coherencia visual del 7º módulo del dashboard. Configuración es "back-office" del workspace — donde el owner/admin pasa minutos haciendo tweaks. El contraste actual (slate shadcn vs el resto del producto editorial post-Plan 01..07) es jarring. Esta es la última pieza antes del cierre Wave 4.

**Output:** 24 archivos re-skineados (3 pages + 21 components/sub-pages). Cuando `ui_dashboard_v2.enabled=true` para el workspace, todas las pages bajo `/configuracion/**` (excepto `/templates/builder/**` que es scope agente — NO TOUCH) renderean en lenguaje editorial: paper backgrounds, ink-1 borders, smallcaps eyebrows, serif h1/h2/h3, mx-tag status badges, dictionary-table listings, forms con tokens editoriales. Cuando flag OFF, byte-identical al state actual de prod. Cero cambios funcionales (D-DASH-07).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@.planning/standalone/ui-redesign-dashboard/01-PLAN.md

# Mock de referencia (fuente de verdad pixel-perfect):
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css

# Pattern de referencia (formato + safe-gating):
@.planning/standalone/ui-redesign-conversaciones/02-PLAN.md

# Source files in scope (24 archivos):
# Integraciones (5)
@src/app/(dashboard)/configuracion/integraciones/page.tsx
@src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx
@src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx
@src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
@src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx

# WhatsApp settings landing + templates (5)
@src/app/(dashboard)/configuracion/whatsapp/page.tsx
@src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
@src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx
@src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx
@src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx
@src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx

# Equipos + Quick Replies + Costos (10)
@src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
@src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx
@src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx
@src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx
@src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx
@src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx
@src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx
@src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
@src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx
@src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx
@src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx

# Tareas (2)
@src/app/(dashboard)/configuracion/tareas/page.tsx
@src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx

# Plan 01 outputs (already shipped — usable interfaces):
@src/components/layout/dashboard-v2-context.tsx

<interfaces>
<!-- From Plan 01 (Wave 0) — already shipped. Use these directly: -->

useDashboardV2 hook:
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider
```

`.theme-editorial` CSS scope (in globals.css from ui-redesign-conversaciones, ui-redesign-dashboard Plan 01 mounts the wrapper) provides:
- Tokens: `--paper-0|1|2|3`, `--ink-1|2|3`, `--rubric-1|2`, `--border`, `--accent-gold|verdigris|indigo`, `--font-display` (EB Garamond), `--font-sans` (Inter), `--font-mono` (JetBrains Mono), `--radius-2|3`
- Utilities: `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament`
- Tag utilities: `mx-tag`, `mx-tag--rubric`, `mx-tag--gold`, `mx-tag--indigo`, `mx-tag--verdigris`, `mx-tag--ink`
- shadcn token overrides (CSS cascade): cuando estás dentro de `.theme-editorial`, cualquier shadcn primitive que use `bg-primary`/`bg-muted`/`border` automáticamente toma los tokens editoriales — no necesitas re-skin si solo es color

Existing component interfaces (preserve sin cambios funcionales):
```typescript
// integraciones/page.tsx (Server Component) — preserve auth + workspace cookie + member role redirect logic intact
// shopify-form.tsx — preserve useForm, useTransition, useState, useRouter, toast, all server action calls
// template-list.tsx, team-list.tsx, quick-reply-list.tsx, task-types-manager.tsx — preserve props shapes + sorting + filtering + edit/delete handlers
// usage-summary.tsx, category-breakdown.tsx, usage-chart.tsx — preserve data props (totalMessages, byCategory, dailyData, period)
```

Mock §classes-to-Tailwind translation cheatsheet (used across all 24 files):
- `.btn` → `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--paper-3)]` + `style={{ fontFamily: 'var(--font-sans)' }}`
- `.btn.pri` → adds `!bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)]`
- `.btn.gh` → adds `!border-[var(--border)] !shadow-none !text-[var(--ink-2)] hover:!bg-[var(--paper-2)]`
- `.btn.dn` (danger) → `!border-[oklch(0.75_0.10_28)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)]`
- `.card` → `bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] mb-[18px]`
- `.card .hd` → `px-[18px] py-[14px] border-b border-[var(--border)] flex items-baseline justify-between gap-[10px]`
- `.card .hd h3` → `text-[18px] font-bold tracking-[-0.01em] m-0` + `style={{ fontFamily: 'var(--font-display)' }}`
- `.card .hd p` → `text-[12px] text-[var(--ink-3)] mt-[3px] m-0` + sans
- `.card .bd` → `px-[18px] py-[16px]`
- `.row` (form row) → `grid grid-cols-[180px_1fr] gap-x-[20px] gap-y-[16px] py-[12px] border-b border-dashed border-[var(--border)] [&:last-child]:border-b-0 [&:first-child]:pt-0 [&:last-child]:pb-0`
- `.row .lb` (label) → `text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]` + sans
- `.row .lb .h` (label hint) → `text-[11px] font-normal text-[var(--ink-3)] mt-[3px] tracking-normal`
- `.row .ct` (content cell) → `flex flex-col gap-[6px]`
- input/select/textarea (editorial) → `w-full border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] box-border focus:outline-none focus:border-[var(--ink-1)] focus:shadow-[0_0_0_3px_var(--paper-3)]` + `style={{ fontFamily: 'var(--font-sans)' }}`
- `.intg .i` (integration card) → `border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-[14px] grid grid-cols-[40px_1fr_auto] gap-[12px] items-center`
- `.intg .i.on` → adds `!bg-[oklch(0.98_0.015_150)] !border-[oklch(0.75_0.08_150)]`
- `.intg .i .lg` (logo box) → `w-10 h-10 rounded-[var(--radius-2)] flex items-center justify-center font-extrabold text-[16px] text-[var(--paper-0)]` + display font
- `.status.on` → `inline-block text-[11px] font-semibold uppercase tracking-[0.04em] px-[8px] py-[3px] rounded-full bg-[oklch(0.92_0.05_150)] text-[oklch(0.35_0.10_150)] border border-[oklch(0.75_0.08_150)]` (pero PREFERIBLE: usar `mx-tag mx-tag--verdigris` si visualmente equivale)
- `.status.off` → `inline-block ... bg-[var(--paper-3)] text-[var(--ink-3)] border border-[var(--border)]` (o `mx-tag mx-tag--ink`)
- `table.t thead th` → `text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]` + sans
- `table.t td` → `px-[10px] py-[10px] border-b border-[var(--border)] text-[13px] text-[var(--ink-1)] align-middle [&:last-child]:border-b-0` + sans
- `.av` (small avatar) → `inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--paper-3)] border border-[var(--ink-2)] text-[11px] font-bold text-[var(--ink-1)]` + sans
- `.role.{own,adm,ven,inv}` → mx-tag--gold (own), mx-tag--indigo (adm), mx-tag--verdigris (ven), mx-tag--ink (inv)
- `.tg.{red,gold,indi,ver,ros,sl}` (CRM tag pills) → mx-tag--rubric, mx-tag--gold, mx-tag--indigo, mx-tag--verdigris, mx-tag--rubric (ros = rosa-rojizo, mismo familia rubric), mx-tag--ink (sl = slate)
- `.switch` (toggle) → preservar shadcn `Switch` primitive con override `data-[state=checked]:bg-[oklch(0.58_0.14_150)] data-[state=unchecked]:bg-[var(--paper-3)] data-[state=unchecked]:border-[var(--border)]` cuando v2

Topbar pattern (header común de cada page editorial, mock §panel.topbar):
```tsx
{v2 && (
  <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
        {/* eyebrow categoría: 'Datos' | 'Workspace' | 'Personal' según mock */}
      </div>
      <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
        {/* page title */}
        <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
          — {/* descripción inline */}
        </em>
      </h1>
    </div>
    <div className="flex items-center gap-2">
      {/* action buttons editorial (.btn.pri / .btn / .btn.gh) */}
    </div>
  </div>
)}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin /configuracion/integraciones — page + sms-tab + sync-status (header + tabs editorial + integration cards D-DASH-15 + status badges mx-tag)</name>
  <files>src/app/(dashboard)/configuracion/integraciones/page.tsx, src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx, src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/integraciones/page.tsx (full 184 LOC — header lines 56-64, Tabs+TabsList lines 66-80, ShopifyContent lines 82-165, SMS/BOLD content 167-179)
    - src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx (full 140 LOC — header lines 65-73, status row 75-91, usage block 94-110, attention banner 112-121, footer 123-136)
    - src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx (full file — empty state lines 35-42, stats grid lines 47-50+, events list)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html (§INTEGRACIONES section lines 719-790: §intg .i / .lg / .t / .d / .status.on patterns; §panel topbar lines 46-58; §card lines 64-69)
  </read_first>
  <action>
    Modify the 3 files. The page is a Server Component (await calls), so `useDashboardV2()` must be called from a CLIENT WRAPPER component or via a `'use client'` boundary inside. Strategy: keep the page Server Component and pass `v2={false}` initially — but since this is a Server Component, we cannot call hooks. **Decision: convert the inner JSX block (lines 56-183 of page.tsx) into a client wrapper file `<IntegracionesContent v2={...}>` OR resolve the flag server-side and pass it down.**

    **Step 0 — Server-side flag resolution for page.tsx (preserve Server Component nature):**

    Add at the top of page.tsx imports:
    ```typescript
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    ```

    After the `member` role check passes, before loading integration data, add:
    ```typescript
    const v2 = await getIsDashboardV2Enabled(workspaceId)
    ```

    Then thread `v2` down into the JSX as a prop or via inline conditionals. For the page itself, since it returns JSX directly, use inline `{v2 ? ... : ...}` ternaries. For the client components (`SmsTab`, `SyncStatus`, `ShopifyForm`, `BoldForm`), pass `v2={v2}` as a new prop and have them call `useDashboardV2()` internally as fallback (so they work both as direct children of v2-resolved Server Component and as standalone). The hook `useDashboardV2()` returns `false` outside the provider, so when called from a client component nested inside a server-resolved v2 context, it would return `false` — therefore PREFER passing `v2` as prop from server.

    **Standard for this task:** `v2` resolved server-side in `page.tsx`, then passed as prop `v2={v2}` to all child client components. Inside client components, the prop wins; useDashboardV2 hook is a fallback for components not receiving the prop.

    **Step 1 — page.tsx editorial header + tabs + body wrapper:**

    Replace the block lines 56-64 (current header `<div><h1>Integraciones</h1>...</div>`) with a conditional:

    ```tsx
    return (
      <div className={cn('flex-1 overflow-y-auto', v2 && 'bg-[var(--paper-1)]')}>
        {v2 ? (
          <>
            {/* Editorial topbar */}
            <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  Datos
                </div>
                <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Integraciones
                  <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    — conecta morfx con tus otras herramientas
                  </em>
                </h1>
              </div>
            </div>
            <div className="px-8 py-6 max-w-[1080px]">
              {/* Editorial tabs (replace shadcn TabsList visual but keep Tabs primitive for state) */}
              <Tabs defaultValue="shopify" className="space-y-4">
                <TabsList className="bg-transparent border-b border-[var(--border)] rounded-none p-0 h-auto">
                  <TabsTrigger value="shopify" className="flex items-center gap-2 px-3 py-2 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-[var(--ink-1)] data-[state=active]:text-[var(--ink-1)] data-[state=active]:font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] text-[13px]" style={{ fontFamily: 'var(--font-sans)' }}>
                    <ShoppingBag className="h-4 w-4" />
                    Shopify
                  </TabsTrigger>
                  <TabsTrigger value="sms" /* same editorial classes */>
                    <MessageSquare className="h-4 w-4" />
                    SMS
                  </TabsTrigger>
                  <TabsTrigger value="bold" /* same editorial classes */>
                    <CreditCard className="h-4 w-4" />
                    BOLD
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="shopify" className="space-y-4">
                  {/* Editorial card layout: 2/3 form + 1/3 sync status */}
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
                        <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                          <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                            <ShoppingBag className="h-5 w-5" />
                            Configuración de Shopify
                          </h3>
                          <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                            Conecta tu tienda Shopify para sincronizar pedidos automáticamente. Los pedidos creados en Shopify aparecerán en tu CRM.
                          </p>
                        </div>
                        <div className="px-[18px] py-[16px] max-h-[calc(100vh-300px)] overflow-y-auto">
                          <Suspense fallback={<div className="h-96 animate-pulse bg-[var(--paper-2)] rounded" />}>
                            <ShopifyForm v2={v2} integration={integration} pipelines={pipelines} />
                          </Suspense>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
                        <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                          <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                            <Settings2 className="h-5 w-5" />
                            Estado de Sincronización
                          </h3>
                          <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                            Actividad reciente de webhooks
                          </p>
                        </div>
                        <div className="px-[18px] py-[16px]">
                          <SyncStatus v2={v2} integration={integration} events={webhookData.events} stats={webhookData.stats} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Instructions card editorial (Card -> editorial wrapper) */}
                  <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
                    <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                      <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>
                        Cómo configurar
                      </h3>
                    </div>
                    <div className="px-[18px] py-[16px]">
                      {/* preserve the existing <ol> + steps verbatim — only swap the prose container */}
                      <ol className="list-decimal pl-4 space-y-2 text-[13px] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                        {/* current 6 <li> items intact */}
                      </ol>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="sms" className="space-y-4">
                  <Suspense fallback={<div className="h-64 animate-pulse bg-[var(--paper-2)] rounded" />}>
                    <SmsTab v2={v2} />
                  </Suspense>
                </TabsContent>
                <TabsContent value="bold" className="space-y-4">
                  <Suspense fallback={<div className="h-96 animate-pulse bg-[var(--paper-2)] rounded" />}>
                    <BoldForm v2={v2} />
                  </Suspense>
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          /* CURRENT JSX intact (lines 56-183 byte-identical) */
          <div className="container mx-auto py-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Integraciones</h1>
              <p className="text-muted-foreground">
                Conecta tu tienda con servicios externos para sincronizar datos automáticamente.
              </p>
            </div>
            {/* ... rest of current Tabs block exactly as today, calling <ShopifyForm integration=... pipelines=...> WITHOUT v2 prop */}
          </div>
        )}
      </div>
    )
    ```

    Add `import { cn } from '@/lib/utils'` if not present. The `<SmsTab v2={v2}>`, `<SyncStatus v2={v2}>`, `<ShopifyForm v2={v2}>`, `<BoldForm v2={v2}>` need optional `v2?: boolean` prop added to their interfaces (Task 2 covers shopify/bold; this task covers SmsTab+SyncStatus).

    **Step 2 — sms-tab.tsx editorial:**

    Add `v2?: boolean` to `SmsTab` props (it's currently a Server Component that takes no props — change to `export async function SmsTab({ v2 = false }: { v2?: boolean })`).

    Branch the entire return JSX (lines 63-138) on `v2`:

    ```tsx
    if (v2) {
      return (
        <div className="space-y-4">
          {/* Card editorial: SMS Onurix */}
          <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
            <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
              <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                <MessageSquare className="h-5 w-5" />
                SMS (Onurix)
              </h3>
              <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                Envío de SMS a clientes vía Onurix. Precio por segmento: ${SMS_PRICE_COP.toLocaleString('es-CO')} COP.
              </p>
            </div>
            <div className="px-[18px] py-[16px] space-y-4">
              {/* Status row */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Estado</span>
                {isActive ? (
                  <span className="mx-tag mx-tag--verdigris">Activo</span>
                ) : (
                  <span className="mx-tag mx-tag--ink">Inactivo</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Saldo actual</span>
                <span className="text-[18px] font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  ${balance.toLocaleString('es-CO')} COP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Precio por segmento</span>
                <span className="text-[13px] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-mono)' }}>${SMS_PRICE_COP.toLocaleString('es-CO')} COP</span>
              </div>
              {/* Usage stats — convert the existing block to dictionary-table style (D-DASH-11) */}
              {usage && (
                <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-3 text-[13px] space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    Uso últimos 30 días
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">SMS enviados</span>
                    <span className="font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>{usage.totalSms.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">Gasto total</span>
                    <span className="font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>${usage.totalCostCop.toLocaleString('es-CO')} COP</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[var(--ink-3)]">
                    <span>Entregados / fallidos / pendientes</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{usage.delivered} / {usage.failed} / {usage.pending}</span>
                  </div>
                </div>
              )}
              {/* Attention banner editorial (D-DASH-15 warning state — gold) */}
              {needsAttention && (
                <div className="flex items-start gap-2 border border-[oklch(0.80_0.09_70)] bg-[oklch(0.98_0.04_70)] p-3 text-[13px] text-[oklch(0.32_0.10_70)] rounded-[var(--radius-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    {!isActive
                      ? 'SMS no está activo para este workspace. Contacta al administrador para activarlo.'
                      : `Saldo insuficiente (mínimo ${SMS_PRICE_COP} COP). Contacta al administrador para recargar.`}
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-[var(--border)]">
                {isSuperAdmin ? (
                  <Link href="/super-admin/sms" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--paper-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    <ExternalLink className="h-4 w-4" />
                    Recargar saldo (super-admin)
                  </Link>
                ) : (
                  <p className="text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    Para recargar saldo o activar el servicio, contacta al equipo de soporte.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }
    /* original return JSX intact */
    return (
      <Card>{/* current block lines 64-138 */}</Card>
    )
    ```

    **Step 3 — sync-status.tsx editorial:**

    Add `v2?: boolean` prop:
    ```typescript
    interface SyncStatusProps { /* existing */ v2?: boolean }
    export function SyncStatus({ integration, events, stats, v2 = false }: SyncStatusProps) {
    ```

    Branch:
    ```tsx
    if (!integration) {
      if (v2) {
        return (
          <div className="text-center py-8 text-[var(--ink-3)] flex flex-col items-center gap-3">
            <Activity className="h-8 w-8 opacity-50" />
            <p className="mx-h4">Configura la integración para ver el estado de sincronización.</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        )
      }
      return (
        <div className="text-center py-8 text-muted-foreground">
          {/* current empty state intact */}
        </div>
      )
    }

    if (v2) {
      return (
        <div className="space-y-4">
          {/* Stats grid: 2 boxes editorial */}
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 bg-[var(--paper-1)] border border-[var(--border)] rounded-[var(--radius-3)]">
              <div className="text-[24px] font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>{stats.processed}</div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>Procesados</div>
            </div>
            <div className="text-center p-2 bg-[var(--paper-1)] border border-[var(--border)] rounded-[var(--radius-3)]">
              <div className="text-[24px] font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>{stats.failed}</div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>Fallidos</div>
            </div>
            {/* if more stats exist (pending), add additional box */}
          </div>
          {/* Events list as dictionary-table */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold mb-2 px-1" style={{ fontFamily: 'var(--font-sans)' }}>
              Eventos recientes
            </div>
            <ScrollArea className="h-64 border border-[var(--border)] rounded-[var(--radius-3)] bg-[var(--paper-0)]">
              <table className="w-full border-collapse">
                <tbody>
                  {events.length === 0 ? (
                    <tr><td className="px-3 py-6 text-center text-[var(--ink-3)] text-[13px]" style={{ fontFamily: 'var(--font-sans)' }}>
                      Sin eventos registrados aún. <span className="mx-rule-ornament block mt-2">· · ·</span>
                    </td></tr>
                  ) : (
                    events.map(event => (
                      <tr key={event.id} className="hover:bg-[var(--paper-1)]">
                        <td className="px-3 py-2 border-b border-[var(--border)] [&:last-child]:border-b-0">
                          <div className="flex items-start gap-2">
                            {event.status === 'processed' ? <CheckCircle2 className="h-4 w-4 text-[oklch(0.55_0.14_150)] shrink-0 mt-0.5" /> :
                             event.status === 'failed' ? <XCircle className="h-4 w-4 text-[oklch(0.55_0.18_28)] shrink-0 mt-0.5" /> :
                             <Clock className="h-4 w-4 text-[var(--ink-3)] shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>{event.topic}</div>
                              <div className="text-[10px] text-[var(--ink-3)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>{event.external_id}</div>
                              <div className="text-[10px] text-[var(--ink-3)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: es })}
                              </div>
                              {event.error_message && (
                                <div className="text-[11px] text-[oklch(0.45_0.14_28)] mt-1" style={{ fontFamily: 'var(--font-sans)' }}>{event.error_message}</div>
                              )}
                            </div>
                            <span className={cn(
                              'mx-tag',
                              event.status === 'processed' ? 'mx-tag--verdigris' :
                              event.status === 'failed' ? 'mx-tag--rubric' :
                              'mx-tag--gold'
                            )}>
                              {event.status}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </div>
      )
    }

    /* existing slate JSX intact */
    return (
      <div className="space-y-4">{/* current block lines 45+ */}</div>
    )
    ```

    Note: read full sync-status.tsx first to extract the exact stats keys (processed/failed/pending/total) and event prop shape — adapt JSX to match.

    **DO NOT MODIFY:**
    - Any server action call (`getShopifyIntegration`, `getPipelinesForConfig`, `getWebhookEvents`, `getSmsUsage`)
    - The `cookies()` + `redirect()` + `member` role check logic (lines 21-48 of page.tsx)
    - The `Tabs` primitive's state management (defaultValue, value, onValueChange — none today)
    - The `<ShopifyForm>`, `<BoldForm>` invocation contracts (just add `v2={v2}` prop)
    - `ScrollArea` from shadcn (preserve)
    - `formatDistanceToNow` + `es` locale logic
    - The `MORFX_OWNER_USER_ID` super-admin gating logic
  </action>
  <verify>
    <automated>grep -q "useDashboardV2\|getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/integraciones/page.tsx && grep -q "Datos" src/app/\(dashboard\)/configuracion/integraciones/page.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/configuracion/integraciones/page.tsx && grep -q "v2 = false\|v2?: boolean\|v2: boolean" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx && grep -q "mx-tag" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx && grep -q "v2 = false\|v2?: boolean\|v2: boolean" src/app/\(dashboard\)/configuracion/integraciones/components/sync-status.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/configuracion/integraciones/components/sync-status.tsx && grep -q "getShopifyIntegration\|getWebhookEvents" src/app/\(dashboard\)/configuracion/integraciones/page.tsx && grep -q "createClient\|cookies" src/app/\(dashboard\)/configuracion/integraciones/page.tsx && npx tsc --noEmit 2>&1 | grep -E "configuracion/integraciones" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/integraciones/page.tsx` (server-side flag resolved).
    - `grep -q "Datos" src/app/\(dashboard\)/configuracion/integraciones/page.tsx` (eyebrow categoría per mock).
    - `grep -q "tracking-\[0.14em\]" src/app/\(dashboard\)/configuracion/integraciones/page.tsx` (smallcaps eyebrow).
    - `grep -q "data-\[state=active\]:border-\[var(--ink-1)\]" src/app/\(dashboard\)/configuracion/integraciones/page.tsx` (editorial tabs underline-active).
    - `grep -q "v2?: boolean\|v2 = false" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx` (prop added).
    - `grep -q "mx-tag mx-tag--verdigris\|mx-tag mx-tag--ink" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx` (status badges D-DASH-15).
    - `grep -q "v2?: boolean\|v2 = false" src/app/\(dashboard\)/configuracion/integraciones/components/sync-status.tsx`.
    - `grep -q "var(--paper-0)\|var(--paper-1)" src/app/\(dashboard\)/configuracion/integraciones/components/sync-status.tsx`.
    - All 3 files STILL contain: `getShopifyIntegration`, `getWebhookEvents`, `cookies`, `createClient`, `getSmsUsage` (D-DASH-07: NO functional change verifiable via grep).
    - `! grep "oklch(" src/app/\(dashboard\)/configuracion/integraciones/page.tsx` (page.tsx itself uses tokens; oklch only allowed in attention banners + sync-status status colors via mx-tag classes, so for sync-status.tsx accept oklch in CheckCircle2 + XCircle inline icon colors).
    - `npx tsc --noEmit` reports zero errors in these 3 files.
  </acceptance_criteria>
  <done>Integraciones page tiene editorial header (eyebrow Datos + h1 + descripción em), tabs underline-style cuando v2; sms-tab y sync-status renderean cards editorial con status badges mx-tag (D-DASH-15) y dictionary-table de eventos (D-DASH-11). Cuando v2=false, JSX byte-identical al state actual. Server actions intactas. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin shopify-form + bold-form (forms editorial D-DASH-14: inputs/selects/Switch + status mx-tag)</name>
  <files>src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx, src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx (full 444 LOC — read in chunks; pay attention to: input labels + Input/Select/Switch primitives, test connection button, save button, delete AlertDialog, autoSync toggle, pipeline select)
    - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx (full 210 LOC — similar shape)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html (§form rows lines 71-83, §switch lines 91-100, §card lines 64-69, §btn lines 53-59)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §forms section (if exists; else infer from mock)
  </read_first>
  <action>
    Modify both forms. Both are Client Components ('use client'), so add `useDashboardV2()` hook + accept `v2?: boolean` prop (prop wins; hook is fallback).

    **Step 1 — shopify-form.tsx:**

    Update interface:
    ```typescript
    interface ShopifyFormProps {
      integration: ShopifyIntegration | null
      pipelines: Array<Pipeline & { stages: PipelineStage[] }>
      v2?: boolean
    }
    export function ShopifyForm({ integration, pipelines, v2: v2Prop }: ShopifyFormProps) {
      const v2Hook = useDashboardV2()  // fallback
      const v2 = v2Prop ?? v2Hook
      // ... rest of function intact
    ```

    Add import:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```

    For EACH form field block (Label + Input/Select/Switch), wrap in editorial row when v2:

    Pattern A — text input (e.g. shop_name, shop_url, access_token, api_secret):
    ```tsx
    <div className={cn(
      v2
        ? 'grid grid-cols-[180px_1fr] gap-x-[20px] gap-y-[6px] py-[12px] border-b border-dashed border-[var(--border)] [&:last-child]:border-b-0'
        : 'space-y-2'  // current
    )}>
      <Label
        htmlFor="shop_name"
        className={cn(
          v2 && 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em] m-0'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        Nombre de la tienda
        {/* if there's a hint <p>, render below as ".lb .h" pattern */}
      </Label>
      <div className={cn(v2 && 'flex flex-col gap-[6px]')}>
        <Input
          id="shop_name"
          {...register('shop_name')}
          className={cn(
            v2 && 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        />
      </div>
    </div>
    ```

    Pattern B — Switch (auto-sync toggle):
    ```tsx
    <Switch
      checked={autoSyncOrders}
      onCheckedChange={setAutoSyncOrders}
      className={cn(
        v2 && 'data-[state=checked]:bg-[oklch(0.58_0.14_150)] data-[state=unchecked]:bg-[var(--paper-3)] data-[state=unchecked]:border data-[state=unchecked]:border-[var(--border)]'
      )}
    />
    ```

    Pattern C — Select (pipeline selector):
    ```tsx
    <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
      <SelectTrigger className={cn(
        v2 && 'border border-[var(--border)] bg-[var(--paper-0)] text-[13px] text-[var(--ink-1)] rounded-[var(--radius-3)] focus:border-[var(--ink-1)] focus:ring-0 focus:shadow-[0_0_0_3px_var(--paper-3)]'
      )} style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={cn(
        v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]'
      )}>
        {pipelines.map(p => (
          <SelectItem key={p.id} value={p.id} className={cn(v2 && 'text-[13px] text-[var(--ink-1)] focus:bg-[var(--paper-2)]')} style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    ```

    Pattern D — Buttons (Test Connection / Save / Delete):
    ```tsx
    {/* Test Connection — secondary editorial */}
    <Button
      type="button"
      onClick={handleTest}
      disabled={isTesting}
      className={cn(
        v2 && 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {/* current content (Loader2/Plug/CheckCircle2/XCircle + label) */}
    </Button>

    {/* Save — primary editorial */}
    <Button
      type="submit"
      disabled={isPending}
      className={cn(
        v2 && '!bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] text-[13px] font-semibold'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {/* current */}
    </Button>

    {/* Delete inside AlertDialog — danger editorial */}
    <Button variant="destructive" className={cn(
      v2 && '!border !border-[oklch(0.75_0.10_28)] !bg-transparent !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] text-[13px] font-semibold'
    )}>
      {/* current */}
    </Button>
    ```

    Pattern E — Test result display (success/error):
    ```tsx
    {testResult && (
      <div className={cn(
        v2
          ? cn(
              'border rounded-[var(--radius-3)] p-3 text-[13px] flex items-start gap-2',
              testResult.success
                ? 'border-[oklch(0.75_0.08_150)] bg-[oklch(0.98_0.015_150)] text-[oklch(0.35_0.10_150)]'
                : 'border-[oklch(0.75_0.10_28)] bg-[oklch(0.98_0.02_28)] text-[oklch(0.38_0.14_28)]'
            )
          : /* current classes */
      )} style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}>
        {testResult.success ? <CheckCircle2 .../> : <XCircle .../>}
        <span>{testResult.success ? `Conectado a ${testResult.shopName}` : testResult.error}</span>
      </div>
    )}
    ```

    Pattern F — Status Badge for integration.is_active:
    ```tsx
    {integration && (
      v2 ? (
        <span className={cn('mx-tag', integration.is_active ? 'mx-tag--verdigris' : 'mx-tag--ink')}>
          {integration.is_active ? 'Activa' : 'Inactiva'}
        </span>
      ) : (
        <Badge variant={integration.is_active ? 'default' : 'secondary'}>
          {integration.is_active ? 'Activa' : 'Inactiva'}
        </Badge>
      )
    )}
    ```

    Pattern G — Show/Hide secrets toggle (Eye/EyeOff icon button) — keep button primitive, just adjust hover bg when v2.

    Apply these patterns to ALL form fields in shopify-form.tsx in order: shop_name, shop_url, access_token (with show/hide), api_secret (with show/hide), default_pipeline_id (Select), default_stage_id (if exists, Select), is_active toggle, autoSyncOrders toggle, action buttons row, AlertDialog for delete.

    **DO NOT MODIFY:**
    - `useForm`, `useTransition`, `useState`, `useRouter`, `useEffect` calls
    - Server action invocations: `testConnection`, `saveShopifyIntegration`, `toggleShopifyIntegration`, `deleteShopifyIntegration`, `updateShopifyAutoSync`
    - Toast calls (`toast.success`, `toast.error`)
    - The `register` / `handleSubmit` / `formState` from useForm
    - AlertDialog primitive structure (just className adjustments + portalContainer if needed)
    - Validation logic / error messages from formState.errors

    **Step 2 — bold-form.tsx (210 LOC):**

    Same patterns as shopify-form. The BOLD form is simpler (just merchant_id, integrity_secret, is_active toggle, save button typically). Read the file first, then apply Pattern A (inputs), Pattern B (Switch), Pattern D (buttons), Pattern F (status badge if applicable). Add same `v2?: boolean` prop with `useDashboardV2` fallback + cn() conditionals.

    **DO NOT MODIFY:**
    - Server action calls for BOLD save/test
    - Form state management
    - Validation logic
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && grep -q "v2?: boolean\|v2 = " src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && grep -q "var(--paper-0)\|var(--paper-3)" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && grep -q "border border-\[var(--border)\]" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && grep -q "mx-tag" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx && grep -q "v2?: boolean\|v2 = " src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx && grep -q "saveShopifyIntegration\|testConnection" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && npx tsc --noEmit 2>&1 | grep -E "shopify-form|bold-form" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx` (hook imported).
    - `grep -q "v2?: boolean\|v2 = " src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx` (prop added).
    - `grep -q "var(--paper-0)" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx`.
    - `grep -q "var(--ink-1)" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx`.
    - `grep -q "data-\[state=checked\]:bg-\[oklch" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx` (Switch reskin).
    - `grep -q "mx-tag" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx` (integration status badge D-DASH-15).
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx`.
    - `grep -q "var(--paper-0)" src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx`.
    - Both files STILL contain their respective server action calls and useForm/useTransition logic (verify with grep — `saveShopifyIntegration`, `testConnection`, `useForm`).
    - `npx tsc --noEmit` reports zero errors in both files.
  </acceptance_criteria>
  <done>shopify-form y bold-form renderean con tokens editoriales (paper-0 inputs, ink-1 borders, smallcaps labels, Switch reskin verdigris-on, status mx-tag) cuando v2=true. Cuando v2=false, byte-identical. Server actions + useForm intactos. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin /configuracion/whatsapp landing + templates (page + list + form + status-badge + variable-mapper) — sub-nav editorial D-DASH-16 + dictionary-table D-DASH-11 + status mx-tag</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/page.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/page.tsx (55 LOC, read in full)
    - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx (55 LOC, read in full)
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx (full)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html (§sec a.it lines 38-42 for sub-nav pattern; §table.t lines 106-110 for dictionary-table; §panel topbar lines 46-58)
  </read_first>
  <action>
    **Step 1 — `whatsapp/page.tsx` (settings landing):**

    Server Component currently renders 4 cards as nav links. Convert to dictionary-list when v2:

    Add at top:
    ```typescript
    import { cookies } from 'next/headers'
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    import { cn } from '@/lib/utils'
    ```

    Make function async and resolve flag:
    ```typescript
    export default async function WhatsAppSettingsPage() {
      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value
      const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

      if (!v2) {
        // CURRENT JSX intact — return as before
        return (<div className="flex-1 overflow-auto"><div className="container py-6 px-6">{/* cards grid */}</div></div>)
      }

      return (
        <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
          {/* Editorial topbar */}
          <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                Datos
              </div>
              <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                WhatsApp
                <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  — número, agente y mensajes automáticos
                </em>
              </h1>
            </div>
          </div>
          <div className="px-8 py-6 max-w-[680px]">
            {/* Dictionary list de sub-secciones (mock §sec .list pattern) */}
            <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] p-2">
              {settings.map((setting) => (
                <Link
                  key={setting.href}
                  href={setting.href}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-2)] text-[13px] font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)] transition-colors"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  <setting.icon className="h-[15px] w-[15px]" />
                  <span className="flex-1">{setting.title}</span>
                  <span className="text-[10px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>›</span>
                </Link>
              ))}
            </div>
            {/* Description as caption below */}
            <p className="mt-4 text-[13px] text-[var(--ink-3)] leading-[1.6]" style={{ fontFamily: 'var(--font-sans)' }}>
              Selecciona una sección para configurar tu integración de WhatsApp.
            </p>
          </div>
        </div>
      )
    }
    ```

    Note: the existing `settings` constant is at module scope (lines 5-30). Preserve unchanged. Only change the JSX rendering path.

    **Step 2 — `whatsapp/templates/page.tsx` (templates list page):**

    Server Component. Same flag resolution pattern. Branch the entire JSX:

    ```typescript
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false
    ```

    Editorial branch:
    ```tsx
    if (v2) {
      return (
        <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
          <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                Datos · WhatsApp
              </div>
              <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                Templates
                <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  — plantillas de mensajes para enviar fuera de la ventana de 24h
                </em>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <form action={handleSync}>
                <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold hover:bg-[var(--paper-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  <RefreshCw className="h-4 w-4" />
                  Sincronizar
                </button>
              </form>
              <Link href="/configuracion/whatsapp/templates/nuevo" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                <Plus className="h-4 w-4" />
                Nuevo Template
              </Link>
            </div>
          </div>
          <div className="px-8 py-6">
            <TemplateList templates={templates} v2={v2} />
          </div>
        </div>
      )
    }
    /* Current return JSX intact for v2 === false */
    ```

    **Step 3 — `template-list.tsx` (dictionary-table editorial D-DASH-11):**

    Add `v2?: boolean` prop. Branch the rendering:

    Read the file first to identify: existing data shape (likely `templates: WhatsAppTemplate[]`), how items are rendered (probably a `<Table>` or grid of cards), search/filter inputs, edit/delete actions, status badge usage.

    For v2 branch, use dictionary-table:
    ```tsx
    if (v2) {
      if (templates.length === 0) {
        return (
          <div className="text-center py-12 flex flex-col items-center gap-3">
            <p className="mx-h3">No hay templates todavía.</p>
            <p className="mx-caption">Crea tu primer template para enviar mensajes fuera de la ventana de 24h.</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        )
      }
      return (
        <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Nombre</th>
                <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Categoría</th>
                <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Idioma</th>
                <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Estado</th>
                <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-[var(--paper-1)]">
                  <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-[13px] text-[var(--ink-1)] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>{t.name}</td>
                  <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-[13px] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>{t.category}</td>
                  <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-[12px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>{t.language}</td>
                  <td className="px-[10px] py-[10px] border-b border-[var(--border)]">
                    <TemplateStatusBadge status={t.status} v2={v2} />
                  </td>
                  <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-right">
                    <Link href={`/configuracion/whatsapp/templates/${t.id}`} className="text-[var(--ink-2)] hover:text-[var(--ink-1)]">
                      <Pencil className="h-[13px] w-[13px]" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    /* current rendering intact */
    ```

    Adapt column headers to match actual fields rendered in the existing list (status, category, language, name, last edited). Read the file first to extract the exact prop shape.

    **Step 4 — `template-status-badge.tsx` (mx-tag mapping D-DASH-15):**

    This is a small presentational component. Add `v2?: boolean` prop. Map status to mx-tag variants:

    ```typescript
    interface Props {
      status: TemplateStatus  // 'pending' | 'approved' | 'rejected' | 'paused' | etc.
      v2?: boolean
    }
    export function TemplateStatusBadge({ status, v2: v2Prop }: Props) {
      const v2Hook = useDashboardV2()
      const v2 = v2Prop ?? v2Hook

      if (v2) {
        const mapping: Record<string, string> = {
          'approved': 'mx-tag--verdigris',
          'pending': 'mx-tag--gold',
          'rejected': 'mx-tag--rubric',
          'paused': 'mx-tag--indigo',
          'in_review': 'mx-tag--gold',
          // map all known statuses; default to mx-tag--ink
        }
        const labels: Record<string, string> = {
          'approved': 'Aprobado',
          'pending': 'Pendiente',
          'rejected': 'Rechazado',
          'paused': 'Pausado',
          'in_review': 'En revisión',
        }
        return <span className={cn('mx-tag', mapping[status] ?? 'mx-tag--ink')}>{labels[status] ?? status}</span>
      }
      /* current Badge rendering intact */
      return <Badge variant={...}>{...}</Badge>
    }
    ```

    Read the existing file to extract the exact `TemplateStatus` enum values and mapping logic — preserve those values; only change the visual rendering.

    **Step 5 — `template-form.tsx` (form editorial D-DASH-14):**

    Add `v2?: boolean` prop + useDashboardV2 fallback. Apply form patterns from Task 2 (Patterns A/B/C/D for inputs/selects/buttons). The template form has: name input, category select, language select, body textarea, header (text/image radio + content), footer text, buttons (variable mapper). Apply editorial cn() conditionals to each field group.

    DO NOT MODIFY: useForm/useTransition logic, toast calls, server action invocations (`createTemplate`, `updateTemplate`, `deleteTemplate`, `submitToMeta`, etc.), validation logic, image upload handler (preserve completely, just adjust button styling).

    **Step 6 — `variable-mapper.tsx`:**

    Component lets user map template variables to data sources. Add v2 prop. Apply Pattern A (form rows with grid 180px+1fr) and editorial inputs/selects when v2. Each variable row gets the dashed-border row treatment.
  </action>
  <verify>
    <automated>grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx && grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx && grep -q "Datos · WhatsApp\|Datos$" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx && grep -q "useDashboardV2\|v2?: boolean\|v2 = " src/app/\(dashboard\)/configuracion/whatsapp/templates/components/template-list.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/templates/components/template-status-badge.tsx && grep -q "mx-tag" src/app/\(dashboard\)/configuracion/whatsapp/templates/components/template-status-badge.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/templates/components/template-form.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/configuracion/whatsapp/templates/components/template-form.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/templates/components/variable-mapper.tsx && grep -q "syncTemplateStatuses\|getTemplates" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx && npx tsc --noEmit 2>&1 | grep -E "configuracion/whatsapp" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - All 6 files contain `useDashboardV2` import or `getIsDashboardV2Enabled` call (server pages).
    - `whatsapp/page.tsx`: contains `var(--rubric-2)` (eyebrow color) and editorial dictionary-list pattern.
    - `templates/page.tsx`: editorial topbar with eyebrow "Datos · WhatsApp" + h1 "Templates" + Sincronizar/Nuevo buttons.
    - `template-list.tsx`: dictionary-table pattern with `<thead><th>` smallcaps + `<tbody><td>` serif border-bottom dashed (D-DASH-11).
    - `template-status-badge.tsx`: maps status to `mx-tag mx-tag--verdigris/gold/rubric/indigo/ink` (D-DASH-15).
    - `template-form.tsx`: input editorial tokens (`var(--paper-0)`, `var(--border)`, focus shadow paper-3).
    - `variable-mapper.tsx`: form rows editorial pattern.
    - All files STILL contain server action calls (`syncTemplateStatuses`, `getTemplates` in templates/page.tsx; useForm/etc. in template-form).
    - `npx tsc --noEmit` reports zero errors.
  </acceptance_criteria>
  <done>WhatsApp settings landing renderea como dictionary-list editorial (sub-nav D-DASH-16); templates page tiene topbar editorial; template-list renderea dictionary-table (D-DASH-11); template-status-badge mapea a mx-tag-* (D-DASH-15); template-form + variable-mapper aplican patterns editorial. Cuando v2=false, byte-identical. Server actions intactas. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin equipos (page + team-list + team-form + team-members-manager) + quick-replies (page + list + form) — dictionary-table D-DASH-11 + role badges mx-tag + form editorial + Dialog portal-aware</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx, src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx, src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx, src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx, src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx, src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx, src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx (38 LOC, full)
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx (48 LOC, full)
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx (full)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html (§EQUIPO lines 432-487 for members table pattern: §av .role .who; §quick-reply pattern N/A specific; use §card + §table.t)
  </read_first>
  <action>
    **Step 1 — `equipos/page.tsx`:**

    Server Component. Resolve `v2` via `getIsDashboardV2Enabled(workspaceId)` (cookies → workspaceId → flag). Branch:

    ```tsx
    if (v2) {
      return (
        <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
          <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                Datos · WhatsApp
              </div>
              <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                Equipos
                <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  — organiza agentes en equipos para asignar conversaciones
                </em>
              </h1>
            </div>
            <Link href="/configuracion/whatsapp" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold hover:bg-[var(--paper-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
              <ArrowLeftIcon className="h-4 w-4" />
              Volver
            </Link>
          </div>
          <div className="px-8 py-6 max-w-[880px]">
            <TeamList teams={teams} v2={v2} />
          </div>
        </div>
      )
    }
    /* current return intact */
    ```

    **Step 2 — `team-list.tsx`:**

    Read first to understand its shape (likely Client Component with Dialog for create + edit, list of teams with member counts, action buttons). Add `v2?: boolean` prop + useDashboardV2 fallback.

    Apply card-editorial wrapper + dictionary-table for teams when v2. Render members count + role badges using mx-tag classes per mock §role mapping (own=gold, adm=indigo, ven=verdigris, inv=ink). Reuse the mx-tag mapping cheatsheet from interfaces.

    For Dialog (TeamForm modal trigger): preserve Dialog primitive; if needed, add `portalContainer` prop pointing to the `.theme-editorial` wrapper element (D-DASH-10) — but test first if the Dialog from shadcn already inherits CSS cascade correctly. If yes, no portal change needed.

    Empty state when v2 + 0 teams:
    ```tsx
    <div className="text-center py-12 flex flex-col items-center gap-3">
      <p className="mx-h3">No hay equipos todavía.</p>
      <p className="mx-caption">Crea un equipo para agrupar agentes y asignar conversaciones automáticamente.</p>
      <p className="mx-rule-ornament">· · ·</p>
    </div>
    ```

    **Step 3 — `team-form.tsx`:**

    Form to create/edit team. Add `v2?: boolean` prop. Apply form Pattern A/D from Task 2: name input editorial + description input editorial + buttons editorial (Cancel ghost + Save primary). DO NOT MODIFY: useForm, server action calls (`createTeam`/`updateTeam`/`deleteTeam`), toast calls.

    **Step 4 — `team-members-manager.tsx`:**

    Members list + add member dialog. This is the core dictionary-table per mock §EQUIPO. Add `v2?: boolean` prop.

    For v2:
    ```tsx
    <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden">
      <div className="px-[18px] py-[14px] border-b border-[var(--border)] flex items-baseline justify-between">
        <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Miembros</h3>
        <span className="text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>{members.length} · activos</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Miembro</th>
            <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Rol</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id} className="hover:bg-[var(--paper-1)]">
              <td className="px-[10px] py-[10px] border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--paper-3)] border border-[var(--ink-2)] text-[11px] font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>{getInitials(m.name)}</span>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>{m.name}</div>
                    <div className="text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>{m.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-[10px] py-[10px] border-b border-[var(--border)]">
                <span className={cn('mx-tag', m.role === 'owner' ? 'mx-tag--gold' : m.role === 'admin' ? 'mx-tag--indigo' : 'mx-tag--verdigris')}>{m.role}</span>
              </td>
              <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-right">
                <button onClick={() => handleRemove(m.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[11px] hover:bg-[var(--paper-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  <X className="h-3.5 w-3.5" />
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    ```

    Read the actual member shape and handler names — adapt accordingly.

    DO NOT MODIFY: server action calls for add/remove member, role change handlers, useForm/useTransition.

    **Step 5 — `quick-replies/page.tsx`:**

    Server Component. Resolve flag, branch JSX. The `<Dialog>` for "Nueva Respuesta" is currently inline in the page — preserve Dialog state (DialogTrigger + DialogContent), only re-skin the trigger button + topbar:

    ```tsx
    if (v2) {
      return (
        <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
          <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                Datos · WhatsApp
              </div>
              <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                Respuestas Rápidas
                <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  — atajos para respuestas frecuentes (escribe / en el chat)
                </em>
              </h1>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  <Plus className="h-4 w-4" />
                  Nueva Respuesta
                </button>
              </DialogTrigger>
              <DialogContent className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]">
                <DialogHeader>
                  <DialogTitle className="text-[20px] font-bold tracking-[-0.01em]" style={{ fontFamily: 'var(--font-display)' }}>
                    Crear Respuesta Rápida
                  </DialogTitle>
                </DialogHeader>
                <QuickReplyForm v2={v2} />
              </DialogContent>
            </Dialog>
          </div>
          <div className="px-8 py-6">
            <QuickReplyList quickReplies={quickReplies} v2={v2} />
          </div>
        </div>
      )
    }
    /* current return intact */
    ```

    **Step 6 — `quick-reply-list.tsx`:**

    Add v2 prop. Render dictionary-table when v2: columns "Atajo (mono) | Mensaje (sans serif) | Última edición (mono) | Acciones". Empty state with mx-h3 + mx-caption + mx-rule-ornament.

    DO NOT MODIFY: useState for editing, server action calls for delete/update.

    **Step 7 — `quick-reply-form.tsx`:**

    Add v2 prop. Apply form patterns: shortcut input mono + textarea editorial + buttons. Preserve all useForm + server actions.
  </action>
  <verify>
    <automated>grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/whatsapp/equipos/page.tsx && grep -q "useDashboardV2\|v2?: boolean\|v2 = " src/app/\(dashboard\)/configuracion/whatsapp/equipos/components/team-list.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/equipos/components/team-form.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/equipos/components/team-members-manager.tsx && grep -q "mx-tag" src/app/\(dashboard\)/configuracion/whatsapp/equipos/components/team-members-manager.tsx && grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/whatsapp/quick-replies/page.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx && grep -q "getTeams" src/app/\(dashboard\)/configuracion/whatsapp/equipos/page.tsx && grep -q "getQuickReplies" src/app/\(dashboard\)/configuracion/whatsapp/quick-replies/page.tsx && npx tsc --noEmit 2>&1 | grep -E "configuracion/whatsapp/(equipos|quick-replies)" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - All 7 files have flag detection (`getIsDashboardV2Enabled` for server pages, `useDashboardV2` for client components).
    - `team-members-manager.tsx`: contains `mx-tag` for role badges.
    - `quick-replies/page.tsx`: editorial topbar + Dialog content with editorial styling.
    - All files contain their respective server action calls intact (`getTeams`, `getQuickReplies`, `createTeam`, etc.).
    - `npx tsc --noEmit` reports zero errors.
  </acceptance_criteria>
  <done>Equipos + quick-replies pages renderean editorial cuando v2: topbars con eyebrow + h1 + acciones; team-members-manager dictionary-table con role mx-tag; quick-reply-list dictionary-table; forms editorial. Cuando v2=false, byte-identical. Server actions intactas. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Re-skin costos (page + usage-summary + category-breakdown + period-selector) — stat boxes editorial + dictionary-table breakdown + tabs underline period selector</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx, src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx, src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx, src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx (full 92 LOC — Client Component with useEffect data loading)
    - src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx (full)
    - src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx (full)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html (§wa-status lines 131-136 for stat boxes; §usage lines 154-158 for breakdown bars; §panel topbar)
    - Note: `usage-chart.tsx` is OUT-OF-SCOPE for this task — it's a Recharts component handled in Plan 07 (Analytics) per file_modified scope of that wave-mate plan. If charts here actually overlap with Plan 07's chart treatment, defer to Plan 07's editorial chart pattern documentation. Only re-skin the chart container wrapper here, not the Recharts internals.
  </read_first>
  <action>
    **Step 1 — `costos/page.tsx`:**

    Client Component with `useState`/`useEffect`/`useDashboardV2` works directly. Add `useDashboardV2` hook + `cn` import. Branch the entire return JSX:

    ```tsx
    'use client'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    // ... existing imports

    export default function CostosPage() {
      const v2 = useDashboardV2()
      // ... existing useState/useEffect intact

      if (loading && !summary) {
        if (v2) {
          return (
            <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
              <div className="container py-6 px-6">
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--ink-3)]" />
                </div>
              </div>
            </div>
          )
        }
        /* current loading return intact */
      }

      if (v2) {
        return (
          <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
            {/* Editorial topbar with period selector */}
            <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  Datos · WhatsApp
                </div>
                <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Costos y Uso
                  <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    — estadísticas de mensajes y costos de WhatsApp
                  </em>
                </h1>
              </div>
              <PeriodSelector value={period} onChange={setPeriod} v2={v2} />
            </div>
            <div className="px-8 py-6">
              {summary && (
                <div className="space-y-6">
                  <UsageSummary
                    totalMessages={summary.totalMessages}
                    totalCost={summary.totalCost}
                    byCategory={summary.byCategory}
                    limit={spending?.limit ?? null}
                    percentUsed={spending?.percentUsed ?? null}
                    v2={v2}
                  />
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* UsageChart wrapper editorial — chart internals deferred to Plan 07 */}
                    <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] p-4">
                      <UsageChart data={dailyData} />
                    </div>
                    <CategoryBreakdown data={summary.byCategory} v2={v2} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }

      /* CURRENT return JSX intact */
      return (
        <div className="flex-1 overflow-auto">
          <div className="container py-6 px-6">{/* ... */}</div>
        </div>
      )
    }
    ```

    Note: Pass `v2={v2}` to `<PeriodSelector>`, `<UsageSummary>`, `<CategoryBreakdown>`. Do NOT pass to `<UsageChart>` (out-of-scope for this task; chart wrapper provides the editorial container).

    **Step 2 — `usage-summary.tsx` (stat boxes editorial — mock §wa-status):**

    Add `v2?: boolean` prop. For v2 branch, render stat boxes per mock pattern:

    ```tsx
    if (v2) {
      return (
        <div className="space-y-4">
          {/* Stat boxes grid 3-col like mock §wa-status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Mensajes</div>
              <div className="text-[18px] font-bold tracking-[-0.01em] mt-1 text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>{totalMessages.toLocaleString('es-CO')}</div>
              <div className="text-[11px] text-[var(--ink-3)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>en el período</div>
            </div>
            <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Costo total</div>
              <div className="text-[18px] font-bold tracking-[-0.01em] mt-1 text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>${totalCost.toLocaleString('es-CO')}</div>
              <div className="text-[11px] text-[var(--ink-3)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>COP</div>
            </div>
            {limit !== null && (
              <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Uso del límite</div>
                <div className={cn(
                  "text-[18px] font-bold tracking-[-0.01em] mt-1",
                  (percentUsed ?? 0) >= 80 ? "text-[oklch(0.45_0.14_28)]" : "text-[var(--ink-1)]"
                )} style={{ fontFamily: 'var(--font-display)' }}>{percentUsed?.toFixed(0)}%</div>
                <div className="text-[11px] text-[var(--ink-3)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>${limit.toLocaleString('es-CO')} límite</div>
              </div>
            )}
          </div>
        </div>
      )
    }
    /* current rendering intact */
    ```

    **Step 3 — `category-breakdown.tsx` (dictionary-table + bar pattern — mock §usage):**

    Add v2 prop. For v2:

    ```tsx
    if (v2) {
      return (
        <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
            <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Por categoría</h3>
            <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>Mensajes y gasto por tipo (marketing, utility, authentication, service)</p>
          </div>
          <div className="px-[18px] py-[16px] space-y-3">
            {Object.entries(data).map(([category, stats]) => {
              const pct = totalMessages > 0 ? (stats.count / totalMessages) * 100 : 0
              return (
                <div key={category} className="grid grid-cols-[130px_1fr_80px] gap-2.5 items-center text-[12px]" style={{ fontFamily: 'var(--font-sans)' }}>
                  <span className="text-[var(--ink-2)] capitalize">{category}</span>
                  <div className="h-1.5 bg-[var(--paper-3)] border border-[var(--border)] rounded-full overflow-hidden">
                    <span className="block h-full bg-[var(--ink-1)]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-right text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>{stats.count} · ${stats.cost.toLocaleString('es-CO')}</span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    /* current intact */
    ```

    Read the actual `data` shape of `byCategory` first — adapt key names accordingly.

    **Step 4 — `period-selector.tsx` (tabs underline editorial):**

    Add `v2?: boolean` prop. Currently likely shadcn Tabs or Buttons. For v2, render underline-style tabs:

    ```tsx
    if (v2) {
      return (
        <div className="flex gap-4" role="tablist">
          {(['today', '7days', 'month'] as const).map(p => {
            const labels = { today: 'Hoy', '7days': '7 días', month: 'Mes' }
            const isActive = value === p
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(p)}
                className={cn(
                  'pb-1 text-[13px] transition-colors',
                  isActive
                    ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                    : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {labels[p]}
              </button>
            )
          })}
        </div>
      )
    }
    /* current intact */
    ```

    Verify the `Period` type values from the existing file — adapt accordingly.

    DO NOT MODIFY: data fetching (`getUsageSummary`, `getUsageByDay`, `getSpendingStatus`), useEffect dependencies, the `period` state shape.
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/configuracion/whatsapp/costos/page.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/configuracion/whatsapp/costos/page.tsx && grep -q "v2?: boolean\|useDashboardV2" src/app/\(dashboard\)/configuracion/whatsapp/costos/components/usage-summary.tsx && grep -q "var(--paper-1)" src/app/\(dashboard\)/configuracion/whatsapp/costos/components/usage-summary.tsx && grep -q "v2?: boolean\|useDashboardV2" src/app/\(dashboard\)/configuracion/whatsapp/costos/components/category-breakdown.tsx && grep -q "v2?: boolean\|useDashboardV2" src/app/\(dashboard\)/configuracion/whatsapp/costos/components/period-selector.tsx && grep -q "border-b-2 border-\[var(--ink-1)\]" src/app/\(dashboard\)/configuracion/whatsapp/costos/components/period-selector.tsx && grep -q "getUsageSummary\|getUsageByDay" src/app/\(dashboard\)/configuracion/whatsapp/costos/page.tsx && npx tsc --noEmit 2>&1 | grep -E "configuracion/whatsapp/costos" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `costos/page.tsx` contains `useDashboardV2` and editorial topbar with eyebrow + h1.
    - `usage-summary.tsx` renders stat boxes editorial pattern (var(--paper-1) bg, mock §wa-status).
    - `category-breakdown.tsx` renders bar pattern with `var(--ink-1)` filled bars (mock §usage).
    - `period-selector.tsx` renders underline-tabs pattern when v2.
    - All files preserve their data fetching calls (`getUsageSummary`, `getUsageByDay`, `getSpendingStatus`).
    - `npx tsc --noEmit` reports zero errors.
  </acceptance_criteria>
  <done>Costos page renderea editorial cuando v2: topbar con period-selector inline, stat boxes editorial, dictionary-table de categorías con bar visual, period-selector underline-tabs. Cuando v2=false, byte-identical. Data fetching intacto. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6: Re-skin /configuracion/tareas + task-types-manager (header editorial + cards editorial + dictionary-table de tipos + form editorial + future-feature dimmed card)</name>
  <files>src/app/(dashboard)/configuracion/tareas/page.tsx, src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/tareas/page.tsx (47 LOC, full)
    - src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx (full 451 LOC — focus on: types list rendering, create/edit form, color picker, action buttons, empty state)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html (§card + §form rows for the manager pattern)
  </read_first>
  <action>
    **Step 1 — `tareas/page.tsx`:**

    Server Component. Resolve flag (cookies → workspaceId → `getIsDashboardV2Enabled`). Branch:

    ```tsx
    if (v2) {
      return (
        <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
          <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                Workspace
              </div>
              <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                Tareas
                <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  — personaliza los tipos de tarea y opciones
                </em>
              </h1>
            </div>
          </div>
          <div className="px-8 py-6 max-w-[880px] space-y-[18px]">
            {/* Card: Tipos de Tarea */}
            <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
              <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Tipos de Tarea</h3>
                <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                  Crea y organiza los tipos de tarea para tu equipo. Los tipos ayudan a categorizar tareas como "Llamada", "Seguimiento", "Cobro", etc.
                </p>
              </div>
              <div className="px-[18px] py-[16px]">
                <TaskTypesManager initialTypes={taskTypes} v2={v2} />
              </div>
            </div>

            {/* Future feature card editorial dimmed */}
            <div className="bg-[var(--paper-0)] border border-[var(--border)] rounded-[var(--radius-3)] opacity-60">
              <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Recordatorios</h3>
                <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>Próximamente: configura cuándo recibir notificaciones de tareas.</p>
              </div>
              <div className="px-[18px] py-[16px]">
                <p className="text-[13px] text-[var(--ink-3)] flex items-center gap-2" style={{ fontFamily: 'var(--font-sans)' }}>
                  <Clock className="h-4 w-4" />
                  Esta funcionalidad estará disponible pronto.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
    /* current return intact */
    ```

    Need to add `import { Clock } from 'lucide-react'` if used.

    **Step 2 — `task-types-manager.tsx` (Client Component, 451 LOC):**

    Add `v2?: boolean` prop + useDashboardV2 fallback. Read the file first to understand its structure:
    - Likely has: list of types (with color + name + actions), form to add new (input + color picker + button), edit dialogs/inline.

    Apply patterns conditionally with `v2`:

    For the types list (when v2):
    ```tsx
    if (v2 && types.length === 0) {
      return (
        <div className="text-center py-8 flex flex-col items-center gap-3">
          <p className="mx-h3">No hay tipos de tarea.</p>
          <p className="mx-caption">Crea el primer tipo para empezar a categorizar tareas.</p>
          <p className="mx-rule-ornament">· · ·</p>
        </div>
      )
    }
    ```

    For the list rendering when v2, use dictionary-table:
    ```tsx
    {v2 ? (
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Tipo</th>
            <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Color</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {types.map(t => (
            <tr key={t.id} className="hover:bg-[var(--paper-1)]">
              <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-[13px] text-[var(--ink-1)] font-medium" style={{ fontFamily: 'var(--font-sans)' }}>
                {editingId === t.id ? (
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border border-[var(--border)] bg-[var(--paper-0)] px-[8px] py-[4px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus:outline-none focus:border-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }} />
                ) : (
                  t.name
                )}
              </td>
              <td className="px-[10px] py-[10px] border-b border-[var(--border)]">
                <span className="inline-block w-4 h-4 rounded-full border border-[var(--ink-2)]" style={{ backgroundColor: t.color }} />
              </td>
              <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-right">
                {/* edit/delete buttons editorial */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      /* current rendering intact */
    )}
    ```

    For the create form (typically input + color picker + submit button), wrap in editorial row pattern when v2:
    ```tsx
    {v2 ? (
      <div className="flex items-end gap-3 mt-4 pt-4 border-t border-[var(--border)]">
        <div className="flex-1">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] mb-1" style={{ fontFamily: 'var(--font-sans)' }}>Nuevo tipo</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Ej. Llamada, Seguimiento, Cobro…"
            className="w-full border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus:outline-none focus:border-[var(--ink-1)] focus:shadow-[0_0_0_3px_var(--paper-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          />
        </div>
        {/* color picker — preserve existing primitive, just adjust container styling */}
        <div className="flex flex-col gap-1">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Color</label>
          {/* existing color picker primitive */}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <Plus className="h-4 w-4" />
          Agregar
        </button>
      </div>
    ) : (
      /* current form rendering intact */
    )}
    ```

    Read actual variable names (`newName`, `setNewName`, `handleCreate`, `editingId`, `editName`, `setEditName`) from the file — adapt accordingly.

    DO NOT MODIFY:
    - `useState`/`useTransition`/`useEffect` calls
    - Server action calls (`createTaskType`, `updateTaskType`, `deleteTaskType`)
    - Toast calls
    - Color picker implementation (just wrapping container)
    - Validation logic
  </action>
  <verify>
    <automated>grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/configuracion/tareas/page.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/configuracion/tareas/page.tsx && grep -q "Workspace" src/app/\(dashboard\)/configuracion/tareas/page.tsx && grep -q "useDashboardV2\|v2?: boolean" src/app/\(dashboard\)/configuracion/tareas/components/task-types-manager.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/configuracion/tareas/components/task-types-manager.tsx && grep -q "border-b border-\[var(--border)\]" src/app/\(dashboard\)/configuracion/tareas/components/task-types-manager.tsx && grep -q "getTaskTypes" src/app/\(dashboard\)/configuracion/tareas/page.tsx && npx tsc --noEmit 2>&1 | grep -E "configuracion/tareas" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `tareas/page.tsx` contains `getIsDashboardV2Enabled`, eyebrow "Workspace", editorial topbar.
    - `tareas/page.tsx` STILL contains `getTaskTypes` (server data fetch intact).
    - `task-types-manager.tsx` contains `useDashboardV2` and editorial token classes.
    - `task-types-manager.tsx` STILL contains its server action call references (read file to identify exact names like `createTaskType`).
    - `npx tsc --noEmit` reports zero errors.
  </acceptance_criteria>
  <done>Tareas config page renderea editorial cuando v2: topbar con eyebrow Workspace + h1 + descripción em; cards editorial (tipos + future-feature dimmed); task-types-manager dictionary-table + form editorial. Cuando v2=false, byte-identical. Server actions intactas. Color picker preservado funcional. Build clean.</done>
</task>

</tasks>

<verification>
After all 6 tasks:

1. **TypeScript build**: `npx tsc --noEmit 2>&1 | grep -E "configuracion/(integraciones|whatsapp|tareas)" | (! grep -E "error TS")` returns 0.

2. **Manual smoke con flag enabled** (SQL: `UPDATE workspaces SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{ui_dashboard_v2,enabled}', 'true') WHERE id = '<dev-workspace-id>'`):
   - `/configuracion/integraciones`: topbar editorial visible (eyebrow "Datos" + h1 + descripción em); 3 tabs underline-style; Shopify card paper-0 + ink-1 border + shadow-stamp; SMS tab muestra status `mx-tag--verdigris/ink`; sync-status events render como dictionary-table.
   - `/configuracion/whatsapp`: header editorial + dictionary-list de 4 sub-secciones (Templates/Equipos/QuickReplies/Costos) en lugar del grid de cards.
   - `/configuracion/whatsapp/templates`: editorial topbar + dictionary-table de templates con status badges mx-tag.
   - `/configuracion/whatsapp/templates/builder` (NO TOUCH): chrome global hereda fonts/tema de Plan 01, pero chat-pane + preview-pane internos NO modificados (verificable con git diff vacío en builder/**).
   - `/configuracion/whatsapp/equipos`: header editorial + back-link + members table editorial con role mx-tag (own=gold, admin=indigo, vendedor=verdigris).
   - `/configuracion/whatsapp/quick-replies`: header editorial + Dialog "Nueva Respuesta" con title display-font; list editorial.
   - `/configuracion/whatsapp/costos`: topbar editorial + period-selector underline-tabs + 3 stat boxes editorial + category-breakdown con bar pattern + chart wrapper editorial container.
   - `/configuracion/tareas`: header editorial + 2 cards (tipos + future-feature dimmed); task-types-manager dictionary-table + form editorial (color picker funcional preservado).

3. **Flag OFF byte-identical** (`UPDATE workspaces SET settings = jsonb_set(...) WHERE id = '<dev-workspace-id>'` setting to false): visual diff vs current main shows ZERO change in cualquier subruta de `/configuracion`.

4. **Git diff Regla 6 NO-TOUCH**:
   - `git diff --stat src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/` — must be empty (builder agente scope preserved).
   - `git diff --stat src/lib/ src/hooks/ src/inngest/ src/app/actions/` — must be empty (D-DASH-07 verifiable: zero functional changes).
   - `git diff --stat src/components/ui/` — must be empty (no shadcn primitive extension needed unless explicitly required for portalContainer; if any extension, must be aditive BC).
   - `git diff --stat src/lib/agents/config-builder/` — must be empty (config-builder agente scope preserved).

5. **Source action grep** (cada tool/file aún hace su trabajo):
   ```bash
   grep -l "getShopifyIntegration\|saveShopifyIntegration" src/app/\(dashboard\)/configuracion/integraciones/**/*.tsx
   grep -l "syncTemplateStatuses\|getTemplates\|createTemplate" src/app/\(dashboard\)/configuracion/whatsapp/templates/**/*.tsx
   grep -l "getTeams\|createTeam" src/app/\(dashboard\)/configuracion/whatsapp/equipos/**/*.tsx
   grep -l "getQuickReplies\|createQuickReply" src/app/\(dashboard\)/configuracion/whatsapp/quick-replies/**/*.tsx
   grep -l "getUsageSummary\|getUsageByDay" src/app/\(dashboard\)/configuracion/whatsapp/costos/**/*.tsx
   grep -l "getTaskTypes\|createTaskType" src/app/\(dashboard\)/configuracion/tareas/**/*.tsx
   ```
   All must return matches.

6. **No leak de oklch fuera de tags conocidos**: `grep -rn "oklch(" src/app/\(dashboard\)/configuracion --include='*.tsx'` — todo match debe estar dentro de un mx-tag class, danger zone (rubric red), success state (verdigris green), o explicitly approved (warning gold) — verificable que NO hay oklch en form inputs ni headings.

7. **shadcn primitives portal-aware si requerido (D-DASH-10)**: si `<DialogContent>` en quick-replies/page.tsx o `<AlertDialogContent>` en shopify-form.tsx renderean fuera del wrapper editorial (verifiable con DevTools: el portal mount node está fuera de `.theme-editorial`), considerar extender shadcn dialog.tsx con `portalContainer` prop (mismo pattern que dropdown-menu.tsx + popover.tsx en Plan 01 inbox v2). Si ya inherit OK del cascade global, skip.
</verification>

<success_criteria>
- All 6 tasks pass automated verify.
- Build clean: `npx tsc --noEmit` reports zero errors in todos los 24 archivos.
- Con flag ON, todas las pages bajo `/configuracion/**` (excepto `/templates/builder/**`) renderean en editorial: paper backgrounds, ink-1 borders, smallcaps eyebrows, serif h1, mx-tag status badges, dictionary-table listings, forms con tokens editoriales.
- Con flag OFF, byte-identical al state actual de prod.
- D-DASH-07 verificable: git diff stats vacío en server actions, hooks, lib, agents, inngest, domain.
- D-DASH-11 (dictionary-table) aplicado en: sync-status events, template-list, team-members-manager, quick-reply-list, task-types-manager, category-breakdown.
- D-DASH-14 (forms editorial) aplicado en: shopify-form, bold-form, template-form, variable-mapper, team-form, quick-reply-form, task-types-manager (create form).
- D-DASH-15 (status mx-tag) aplicado en: sms-tab status, sync-status event status, shopify-form integration status, template-status-badge, team role badges.
- D-DASH-16 (sub-nav) aplicado en: whatsapp/page.tsx (dictionary-list de sub-secciones), period-selector underline-tabs.
- NO-TOUCH builder agente verificable: git diff stats vacío en `src/app/(dashboard)/configuracion/whatsapp/templates/builder/`.
- Regla 6 cumplida: feature flag aísla cambios; cero impacto en prod hasta activación explícita en Wave 4.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/08-SUMMARY.md` with:
- Commits (atomic, uno por task — 6 commits expected)
- Lista de los 24 archivos re-skineados con LOC delta por archivo
- Pixel-diff vs mock para 3 pages clave (integraciones / whatsapp / costos / tareas) con screenshots si producidos
- Confirmation explícita: builder agente (`templates/builder/**`) NO TOCADO (`git diff --stat` output)
- Confirmation explícita: server actions y domain layer NO TOCADOS (`git diff --stat src/lib/ src/app/actions/` output)
- Confirmation flag-OFF byte-identical (visual diff link o screenshot)
- Lista de patterns reusables descubiertos (e.g., editorial topbar template, dictionary-table snippet, form row pattern, status mx-tag mapping table) para LEARNINGS.md de Plan 09
- Notas de cualquier shadcn primitive extension necesaria (Dialog/AlertDialog portalContainer si aplicable per D-DASH-10) — flag para Plan 09 LEARNINGS
- Handoff a Wave 4: configuración cerrada; resta DoD + LEARNINGS + push
</output>
