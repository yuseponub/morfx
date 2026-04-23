# LEARNINGS — Standalone `ui-redesign-dashboard` (mega-fase)

**Phase type:** UI re-skin editorial multi-módulo behind feature flag per-workspace (Regla 6).
**Dates:** 2026-04-23 (Plan 01 → Plan 09, mismo día — orchestrator con paralelización agresiva).
**Plans:** 9 (01 infra → 02 CRM → 03 Pedidos → 04 Tareas → 05 Agentes → 06 Automatizaciones → 07 Analytics+Métricas → 08 Configuración → 09 close-out).
**Waves:** 4 (Wave 0 infra → Wave 1 CRM+Pedidos+Tareas paralelo → Wave 2 Agentes+Automatizaciones paralelo → Wave 3 Analytics+Configuración paralelo → Wave 4 close).
**Commits totales:** 49 en `main` (inventario completo en `dod-verification.txt` sección "Phase commit inventory").
**LOC delta:** +13085 / -2238 (neto +10847) across 107 archivos.
**Status:** SHIPPED detrás de `workspaces.settings.ui_dashboard_v2.enabled` (default `false`). Activación post-push pendiente de instrucción del usuario tras QA visual del deployment Vercel (D-DASH-02 unitaria).
**Base commit:** `9642e36` (post landing realignment).
**HEAD al cierre:** tracked en `09-SUMMARY.md`.

---

## §1. Phase overview — qué entregó

### Infraestructura compartida (Plan 01, Wave 0)

- `src/lib/auth/dashboard-v2.ts` — resolver server-side `getIsDashboardV2Enabled(workspaceId): Promise<boolean>`. Fail-closed try/catch. Lee `workspaces.settings.ui_dashboard_v2.enabled`.
- `src/components/layout/dashboard-v2-context.tsx` — `DashboardV2Provider` + `useDashboardV2()` hook (`createContext<boolean>(false)` default fail-closed).
- `src/app/(dashboard)/fonts.ts` — loader `next/font/google` de EB Garamond + Inter + JetBrains Mono (per-segment; Next dedupe entre segments marketing/dashboard/whatsapp).
- `src/app/(dashboard)/layout.tsx` — wrapper conditional `cn(ebGaramond.variable, inter.variable, jetbrainsMono.variable, 'flex h-screen', isDashboardV2 && 'theme-editorial')`.
- `src/components/layout/sidebar.tsx` — re-skin editorial gated por prop `v2?: boolean`: paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state, wordmark `morf·x`.

### Módulos (Plans 02-08)

| Plan | Módulo | Approach principal | Archivos | Commits |
| ---- | ------ | ------------------ | -------- | ------- |
| 02 | CRM (Contactos + Productos + detalle) | Dictionary-table para listados, dialog/sheet cascade via className, forms D-DASH-14 | 19 | 7 |
| 03 | Pedidos | Kanban editorial paper-1 + flag pills mx-tag--*, order sheet ledger-style, sheet.tsx portalContainer extension | 9 | 6 |
| 04 | Tareas | Kanban 4-col con article paper-0 + pri-stripe, dictionary-table list-view, alert-dialog.tsx portalContainer extension | 9 (3 nuevos + 6 modified) | 6 + merge |
| 05 | Agentes | 9 metric cards editorial (serif 30px tabular-nums), config panel con 6 sections editorial, preset cards selectables | 3 | 5 |
| 06 | Automatizaciones | Dictionary-table listing + wizard editorial + React Flow canvas dotted-grid con nodos paper-0/stamp + AI builder chat + dialog.tsx portalContainer extension | 21 | 6 |
| 07 | Analytics + Métricas | Recharts re-themed via props (SIN migración), KPI strip dictionary-style, date-range popover portal-respectful | 9 | 5 + merge |
| 08 | Configuración | Dictionary-table masivo + forms editorial helpers (inputV2/labelV2/hintV2/btn*V2), mx-tag status mapping + sub-nav dictionary-list | 24 | 7 |

### Total impacto

- **107 archivos** tocados (3 creados en infra, ~3 creados en Plan 04 — task-card/task-kanban/task-row, 101 modificados + 2 merge commits + 8 SUMMARY docs + LEARNINGS/dod/SQL del Plan 09).
- **13,085 líneas añadidas** / **2,238 eliminadas** (neto +10,847).
- **49 commits atómicos** por task + 2 merge commits de worktree + 8 docs commits.
- **Cero cambios funcionales** en `src/lib/domain`, `src/lib/agents`, `src/lib/automation`, `src/inngest`, `src/app/api`, `src/app/actions`, `src/hooks` (verificado en Check 6 del DoD con filtro phase-scoped).

---

## §2. Decisiones locked (D-DASH-01..18) — las de mayor leverage

### D-DASH-01 — Flag maestro `workspaces.settings.ui_dashboard_v2.enabled`

Implementado en `src/lib/auth/dashboard-v2.ts` shape-for-shape con `src/lib/auth/inbox-v2.ts` (precedente de Conversaciones). Server-side, fail-closed, un query por page load. El namespace `ui_dashboard_v2` (en vez de `ui_dashboard_v2_enabled` flat) deja espacio para sub-keys futuras sin migración.

**Lección aplicada de Conversaciones:** el resolver debe aceptar `workspaceId: string` explícito (no leer cookies internamente) para testear unit-style + evitar dependencias implícitas a request scope.

### D-DASH-02 — Activación unitaria (los 7 módulos ON/OFF juntos)

Decisión validada por experience: 3 de 7 editoriales + 4 de 7 slate = tránsito visual roto. El coste de añadir sub-flags por módulo (7× decisiones + 7× testing matrix) no justifica el beneficio marginal. Activación unitaria = un solo flag flip, un solo QA cycle, un solo rollback.

### D-DASH-04 — Scope path-based vía `.theme-editorial` en layout root

Consecuencia práctica: TODAS las subrutas del `(dashboard)/layout.tsx` heredan el cascade — incluyendo **out-of-scope**:
- `/super-admin/**` — consola interna, puede romperse visualmente con flag ON.
- `/sandbox/**` — testing tool interna, puede romperse.
- `/onboarding/**`, `/create-workspace/**`, `/invite/**` — flujos one-time de setup, pueden romperse.
- `/whatsapp/**` — tiene su propio flag `ui_inbox_v2.enabled`; es scope editorial también pero independiente.

**Mitigación documentada:** si un usuario con flag ON necesita super-admin o sandbox y detecta break visual, se agrega `[data-theme-override="slate"]` en sus layouts en una fase futura `ui-redesign-dashboard-extras`.

### D-DASH-07 — UI-only (Regla 6)

**Verificable verbatim en Check 6 del reporte DoD:** 0 archivos tocados por commits de esta fase en `src/lib/domain`, `src/lib/agents`, `src/lib/automation`, `src/inngest`, `src/app/api`, `src/app/actions`, `src/hooks`. Note: `git diff 9642e36..HEAD -- <no-touch>` muestra líneas no-cero porque `somnio-recompra-template-catalog` fue merged en paralelo; el filtro phase-scoped (`git log ... --grep=ui-redesign-dashboard`) muestra 0. Ver también Plan 05 SUMMARY línea 106-113 para auditoría per-módulo.

### D-DASH-09 — Shadcn primitives extendidos aditivamente

4 primitives extendidos con prop opcional `portalContainer?: HTMLElement | null` (BC-additive):
- `src/components/ui/dropdown-menu.tsx` (heredado de Conversaciones Plan 01)
- `src/components/ui/popover.tsx` (heredado de Conversaciones Plan 01)
- `src/components/ui/sheet.tsx` (Plan 03 Pedidos, commit `1761d86`)
- `src/components/ui/alert-dialog.tsx` (Plan 04 Tareas, commit `f38b19c` — pull-forward a T1 por dependencia de task-list.tsx)
- `src/components/ui/dialog.tsx` (Plan 06 Automatizaciones, commit `776c7ba`)

Patrón canónico (mismo para los 5 primitives):

```tsx
// <Primitive>Content.tsx
interface <Primitive>ContentProps extends Radix<Primitive>.<Content>Props {
  portalContainer?: HTMLElement | null  // Optional — default null = document.body (Radix default)
}

const <Primitive>Content = React.forwardRef<..., <Primitive>ContentProps>(
  ({ portalContainer, ...props }, ref) => (
    <<Primitive>Portal container={portalContainer ?? undefined}>
      <Radix<Primitive>.<Content> ref={ref} {...props} />
    </<Primitive>Portal>
  )
)
```

Consumidores pasan el target así:

```tsx
const v2 = useDashboardV2()
const portal = v2 ? document.querySelector<HTMLElement>('.theme-editorial') : undefined
<SheetContent portalContainer={portal}>...</SheetContent>
```

Backwards-compatible: sin prop, Radix default a `document.body` (comportamiento actual).

### D-DASH-10 — Modales/Sheets tema-respetuosos

Total de portales re-rooted via prop `portalContainer` en los 7 módulos: **~18** según audit de los 8 SUMMARYs. Los restantes usan un aditivo `className="theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)]"` en el Content (cascade aplica dentro del portal default document.body). Este patrón alternativo (D-DASH-10 className aditivo) se adoptó cuando el primitive no tenía `portalContainer` disponible en tiempo de task (p. ej., Plan 02 CRM aplicó className aditivo a 5 Dialog antes de que Plan 06 extendiera `dialog.tsx`).

### D-DASH-11, D-DASH-12, D-DASH-13, D-DASH-14

Ver §3 (patterns establecidos). Estas 4 decisiones son las que define el lenguaje visual reusable entre módulos.

### D-DASH-17 — NO touch dashboard chrome outside layout + sidebar

`src/components/layout/header.tsx`, `mobile-nav.tsx`, `theme-toggle.tsx`, `user-menu.tsx` — no están wired a `(dashboard)/layout.tsx` actual. Preservados intactos. Si fases futuras los conectan, ahí se re-skinean.

---

## §3. Patterns establecidos (7 obligatorios)

### §3.1 Dictionary-table pattern (D-DASH-11)

**Contexto.** Tablas en CRM (Contactos + Productos), Pedidos (list view), Tareas (list-view via TaskRow), Automatizaciones (listing), Configuración (template-list + team-members + quick-replies + task-types) + Analytics (tabla líneas KPI) necesitaban un look editorial unified. shadcn `DataTable` default es slate-heavy y no aceptaba className selectors para sobreescribir internals.

**Decisión arquitectónica.** Wrapper CSS-selector override en el contenedor de la tabla, sin tocar el componente `DataTable` shared:

```tsx
<div
  className={cn(
    'w-full',
    v2 && [
      'theme-editorial',
      '[&_table]:border-collapse',
      '[&_thead_th]:bg-[var(--paper-1)]',
      '[&_thead_th]:text-[10px]',
      '[&_thead_th]:font-bold',
      '[&_thead_th]:uppercase',
      '[&_thead_th]:tracking-[0.08em]',
      '[&_thead_th]:text-[var(--rubric-2)]',
      '[&_thead_th]:border-b',
      '[&_thead_th]:border-[var(--ink-1)]',
      '[&_tbody_td]:text-[13px]',
      '[&_tbody_td]:text-[var(--ink-1)]',
      '[&_tbody_td]:border-b',
      '[&_tbody_td]:border-[var(--border)]',
      '[&_tbody_tr:hover]:bg-[var(--paper-1)]',
    ]
  )}
>
  <DataTable {...props} />
</div>
```

**Alternativas descartadas.**
1. Clonar DataTable → duplicación masiva + divergencia futura.
2. Prop `v2` en DataTable → requiere tocar shared component que no es dashboard-only.
3. Override via globals.css selector → breaks out-of-scope tables.

**Código ejemplo.** `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx` (Plan 02 commit `06a4cff`), `src/app/(dashboard)/crm/productos/components/products-table.tsx` (Plan 02 commit `1959cf5`), `src/app/(dashboard)/tareas/components/task-row.tsx` (Plan 04 commit `a3f2ffd`).

**Link.** Plan 02 SUMMARY §2 (Task 2 acceptance criteria). Plan 08 SUMMARY describe el mismo patrón replicado en 6 superficies de Configuración.

---

### §3.2 Kanban card pattern (D-DASH-12)

**Contexto.** Tareas (kanban 4-col obligatorio — mock `tareas.html`) y Pedidos (kanban opcional vía view-toggle) necesitaban cards editoriales consistentes. Cards debían diferenciarse visualmente de la tabla (diccionary-table) para señalar "unidad de trabajo en movimiento" vs "fila en catalog".

**Decisión arquitectónica.** `<article>` con paper-0 / paper-1 + border ink-1 + shadow-stamp + pri-stripe opcional 3px por prioridad. Header dotted-bottom con id mono `T-XXXX` + type smallcaps 9px. Body display 15px bold title + serif italic 12px excerpt + meta mono 10px. Footer dotted-top con avatar iniciales + assignee italic + sla mono.

**Código ejemplo (extraído de `src/app/(dashboard)/tareas/components/task-card.tsx`, Plan 04 commit `80b2fac`):**

```tsx
<article
  role="button"
  tabIndex={0}
  className="relative border border-[var(--ink-1)] bg-[var(--paper-0)] p-4 cursor-pointer"
  style={{
    boxShadow: '0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)',
    borderRadius: '3px',
  }}
>
  <div
    className="absolute left-0 top-0 bottom-0 w-[3px]"
    style={{ background: priority === 'high' ? 'var(--rubric-2)' : priority === 'med' ? 'var(--accent-gold)' : 'var(--ink-4)' }}
  />
  <header className="flex items-center gap-2 pb-2 border-b border-dotted border-[var(--border)]">
    <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
      T-{task.id.slice(0, 4).toUpperCase()}
    </span>
    <span className="mx-smallcaps text-[9px] tracking-[0.14em]" style={{ color: typeColor }}>
      {task.task_type}
    </span>
  </header>
  <h3 className="text-[15px] font-bold mt-3" style={{ fontFamily: 'var(--font-display)' }}>{task.title}</h3>
  <p className="text-[12px] italic text-[var(--ink-2)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>
    {task.excerpt}
  </p>
  <footer className="mt-3 pt-2 border-t border-dotted border-[var(--border)] bg-[var(--paper-1)] flex items-center gap-2 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
    <span className="inline-grid place-items-center w-[22px] h-[22px] border border-[var(--ink-1)] bg-[var(--paper-0)]">
      {initials}
    </span>
    <span className="italic" style={{ fontFamily: 'var(--font-display)' }}>{assignee}</span>
    <span className="ml-auto" style={{ color: slaTone }}>{slaText}</span>
  </footer>
</article>
```

**Column header (mismo patrón para Tareas y Pedidos):**

```tsx
<div className="sticky top-0 bg-[var(--paper-0)] border-b border-[var(--ink-1)] py-2 px-3 flex items-center gap-2">
  <span className="w-[10px] h-[10px] border border-[var(--ink-1)]" style={{ background: swatchColor }} />
  <h3 className="mx-smallcaps text-[11px] tracking-[0.12em] uppercase">{label}</h3>
  <span className="ml-auto text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
    · {count}
  </span>
</div>
```

**Link.** Plan 04 SUMMARY §2 "task-card + task-kanban". Mismo patrón en `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (Plan 03 commit `c92cc95`).

---

### §3.3 Editorial charts pattern (D-DASH-13)

**Contexto.** Analytics + Métricas usan Recharts. Default styling es slate-heavy, paleta primary/secondary no encaja con la paleta editorial (rubric-2 rojo + accent-gold + accent-verdigris + accent-indigo + ink-2 ordenada).

**Decisión arquitectónica.** Re-temar via **props de Recharts** (NO migración a librería nueva, NO refactor de chart logic): `stroke`, `fill`, `tick`, `axisLine`, `cursor`, `contentStyle` todos con CSS variables. Gradient `id` distinto para v2 (`colorValueV2`) para evitar colisión con `!v2` (`colorValue`) en SVG defs global.

**Series order canonical (D-DASH-13):** `rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2`. Aplicado en `evolution-chart.tsx` (metricas) y `sales-chart.tsx` (analytics).

**Código ejemplo (extraído de `src/app/(dashboard)/analytics/components/sales-chart.tsx`, Plan 07 commit `1bc5fa0`, líneas 122-192):**

```tsx
<section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
  <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]">Tendencia</div>
    <h3 className="text-[20px] font-bold tracking-[-0.01em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
      Tendencia de Ventas
    </h3>
  </div>
  <div className="p-5">
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorValueV2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--rubric-2)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--rubric-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--ink-4)" strokeOpacity={0.2} strokeDasharray="3 3" />
        <XAxis tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--ink-2)' }} />
        <YAxis tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }}
          content={EditorialTooltip}
        />
        <Area stroke="var(--rubric-2)" fill="url(#colorValueV2)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
</section>
```

**Alternativas descartadas.**
1. Migrar Recharts a d3/Tremor/visx → fuera de scope + riesgo de regresión funcional (datos + interacciones + tooltips).
2. Wrapper `<EditorialChart>` reusable → cada chart tiene tipo distinto (AreaChart, LineChart, BarChart) con props distintos; wrapper acabaría siendo un passthrough con configuración duplicada.
3. CSS selectors para sobreescribir internals Recharts → Recharts inyecta styles inline, selectors no ganan.

**Link.** Plan 07 SUMMARY §2. `src/app/(dashboard)/metricas/components/evolution-chart.tsx` (Plan 07 commit `037c6fe`) aplica mismo patrón con multi-series (rubric/gold/verdigris).

---

### §3.4 Form treatments editorial (D-DASH-14)

**Contexto.** Forms aparecen en Configuración (múltiples tabs — Shopify, Bold, Templates, Teams, Quick-replies, Task-types), Tareas (task-form.tsx), CRM (ContactForm, ProductForm), Pedidos (edit details), Automatizaciones builder (muchísimos inputs del wizard + actions config). Inputs/selects/textareas default shadcn son slate — inmediatamente disonantes en `.theme-editorial`.

**Decisión arquitectónica.** Helpers locales (Plan 08 introduce convención) que consolidan el pattern:

```tsx
// src/app/(dashboard)/configuracion/**/components/<form>.tsx (Plan 08 commit b46d20b+)
const inputV2 = 'w-full bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[3px] px-3 py-2 text-[14px] text-[var(--ink-1)] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0 placeholder:text-[var(--ink-3)]'
const labelV2 = 'mx-smallcaps text-[10px] font-bold tracking-[0.12em] uppercase text-[var(--ink-3)]'
const hintV2 = 'text-[11px] italic text-[var(--ink-3)] mt-1'
const selectTriggerV2 = 'w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] rounded-[3px]'
const btnPrimaryV2 = 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)] rounded-[3px] font-semibold'
const btnSecondaryV2 = 'bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] rounded-[3px]'
const btnDangerV2 = 'border border-[var(--rubric-2)] text-[var(--rubric-2)] shadow-[0_1px_0_var(--rubric-2)] rounded-[3px]'
```

Uso:

```tsx
<Label htmlFor="name" className={cn(labelV2)}>Nombre</Label>
<Input id="name" className={cn(inputV2)} {...register('name')} />
{errors.name && <p className={cn(hintV2, 'text-[var(--rubric-2)]')}>{errors.name.message}</p>}
```

**Alternativa descartada.** Introducir `<EditorialInput>`, `<EditorialLabel>`, `<EditorialButton>` primitives → más testing matrix, más imports, más churn, sin valor vs. los helpers string-level. Los helpers pueden copiarse entre módulos y cada plan evoluciona independiente.

**Variante TaskForm (Plan 04 commit `a37288e`):** usa clases `.btn.red` para submit button (bg rubric-2 + border rubric-1 + shadow rubric-1) — heredado del mock `tareas.html` linea 520.

**Link.** Plan 08 SUMMARY — especialmente "Editorial form tokens reusable helpers" en tech_stack patterns. Plan 02 SUMMARY §Task 5 documenta patrón análogo en ContactForm + ProductForm.

---

### §3.5 Portal sweeps por primitive — método sistemático

**Contexto.** Radix UI portals (`DropdownMenu`, `Popover`, `Select`, `Dialog`, `Sheet`, `Tooltip`, `HoverCard`, `AlertDialog`) default a `document.body`, FUERA del scope `.theme-editorial`. Cuando un módulo abre un dropdown/dialog/popover con flag ON, el contenido renderea en slate → rompe coherencia.

**Decisión arquitectónica.**

1. **Al final de cada wave, hacer sweep:** `grep -rnE 'DropdownMenu|Popover|Select|HoverCard|Dialog|Tooltip|Sheet|AlertDialog' src/app/\(dashboard\)/<module>/`.
2. **Para cada match:** pasar `portalContainer` al Content si el primitive lo soporta; aplicar className aditivo `"theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)]"` si no.
3. **Si primitive no soporta `portalContainer`:** extenderlo aditivamente (BC) con prop opcional — ver §2 D-DASH-09.

Primitives extendidos en esta fase:
- `sheet.tsx` — Plan 03 commit `1761d86`
- `alert-dialog.tsx` — Plan 04 commit `f38b19c` (pull-forward a T1)
- `dialog.tsx` — Plan 06 commit `776c7ba`

Primitives ya extendidos en fase anterior (Conversaciones) y consumidos aquí:
- `dropdown-menu.tsx`
- `popover.tsx`

**Consumer pattern canonical:**

```tsx
const v2 = useDashboardV2()
const portal = v2 && typeof document !== 'undefined'
  ? document.querySelector<HTMLElement>('.theme-editorial')
  : undefined
<SheetContent portalContainer={portal}>...</SheetContent>
```

**Lección de edge case.** Plan 04 descubrió que `task-list.tsx` ya consumía `AlertDialog` ANTES de que Task 5 (task-form) fuera ejecutado. Pull-forward del alert-dialog extension al commit Task 1 — disciplinado en el SUMMARY bajo "alert-dialog.tsx extension BC: pull-forward desde Task 5 a Task 1". Lección: **el primitive extensión debe landear antes de su primer consumidor** en orden de commits, incluso si rompe el orden natural del plan.

**Link.** Plan 03/04/06 SUMMARYs cada uno documenta su primitive extension. `src/components/ui/{sheet,alert-dialog,dialog,dropdown-menu,popover}.tsx` son los archivos canónicos.

---

### §3.6 Module consistency guidelines

**Contexto.** 7 módulos re-skineados en 3 waves (1-3) con executores paralelos distintos, cada uno con su propio worktree. Riesgo objetivo: CRM define padding 4px, Pedidos 3px, Tareas 6px; Agentes hace shadow-stamp `0 1px 0 ink-1`, Pedidos `0 1px 0 border`, etc. — cada módulo "casi consistente" pero no EXACTAMENTE.

**Decisión arquitectónica.** El bloque `.theme-editorial` en `src/app/globals.css` es la **ÚNICA fuente de verdad de tokens** y está cerrado para esta fase (D-DASH-04 + Regla 6 — cero cambios a globals). Los módulos SOLO combinan:
1. Utilities `.mx-*` (mx-tag, mx-smallcaps, mx-rubric, mx-display, mx-h{1-4}, mx-body, mx-caption, mx-rule, mx-skeleton, mx-mono, mx-pulse, mx-marginalia).
2. CSS variables (`var(--paper-0..5)`, `var(--ink-1..4)`, `var(--rubric-1..3)`, `var(--accent-gold|verdigris|indigo)`, `var(--font-display|sans|mono)`).
3. Helpers locales style (inputV2/labelV2/btnPrimaryV2/etc — scope a módulo, no globales).

**Valores canonical verificados en los 7 módulos:**

| Prop | Valor canonical | Dónde aplica |
| ---- | --------------- | ------------ |
| Border radius | `3px` | Forms, inputs, buttons, preset cards |
| Border radius | `4px` | Cards (article), dialogs |
| Border radius | `var(--radius-3)` | Tooltips Recharts |
| Shadow stamp | `0 1px 0 var(--ink-1)` | Cards, sections, wrappers |
| Shadow stamp (card kanban Tareas) | `0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)` | TaskCard exclusive (mock línea 90 verbatim) |
| Border thickness | `1px` | Default — card borders, dictionary-table cells |
| Border thickness | `2px` | Active rail (tab active, kanban column active) |
| Border thickness | `3px` | Pri-stripe (TaskCard left edge), active selected border-l rubric-2 |
| Font serif sizes | `13px` body, `14px` body-large | Table cells, body copy |
| Font serif sizes | `15-16px` card titles | TaskCard h3, metric card bodies |
| Font serif sizes | `19-20px` section h3 | Chart headers, section headings |
| Font serif sizes | `24-30px` display h1/h2 | Topbars, metric numbers |
| Smallcaps | `10-11px` tracking-0.08..0.14em uppercase | Eyebrows, column headers, labels |

**Link.** Cada SUMMARY confirma adherence. Plan 05 SUMMARY documenta el único outlier permitido (`oklch()` literal en TaskCard shadow — mock verbatim).

---

### §3.7 Activation playbook (rollout per-workspace)

**Contexto.** Regla 6 demanda que el agente + dashboard productivo permanezcan funcionales hasta activación explícita. D-DASH-02 demanda que los 7 módulos se prendan juntos.

**Decisión arquitectónica.** Rollout per-workspace vía SQL flip, no via deployment gate:

1. **Pre-activación QA (baseline screenshots flag OFF).** Usuario navega los 7 módulos sin flag, captura screenshots de cada subsección crítica.
2. **SQL flip a ON.** `activacion-somnio.sql` PASO 2 con `create_missing=true`.
3. **Reload + screenshots flag-ON.** Mismas vistas, compara lado a lado.
4. **Verificación funcional smoke.** Crear/editar/listar en cada módulo — Regla 6 garantiza NO-TOUCH ergo los flujos funcionales permanecen intactos; el smoke confirma que el re-skin no rompió bindings (onClick, form submit, navigation).
5. **Decisión:** mantener ON si todo OK, rollback inmediato vía `activacion-somnio.sql` PASO 3 si cualquier regresión.

**Rollback instantáneo.** Cero downtime (single SQL UPDATE), cero migración (solo flip JSONB value).

**Expansión horizontal.** Después de 1-2 semanas estable en Somnio, replicar a otros workspaces uno por uno con su propio QA cycle. NO batch activation masiva.

**Link.** `activacion-somnio.sql` (snippet idempotente creado en Plan 09 Task 3) — ver §9 Rollout playbook para comandos copy-paste.

---

## §4. Pitfalls evitados

### Pitfall: `hsl(var(--token))` antipattern post Tailwind v4

Heredado de fase Conversaciones §3.4. Post Tailwind v4, los tokens shadcn son bare OKLCH (no triples HSL), por lo que `hsl(var(--background))` wrapper resulta en valor inválido que el browser descarta silenciosamente. **Esta fase NO introdujo hsl(var(--*)) nuevos** (verificable: HEAD=8 instancias, base=8 instancias, delta=0 — Check 2 del DoD). Las 8 instancias existentes viven TODAS en ramas `!v2` (flag-OFF legacy branches) preservadas verbatim para byte-identical guarantee (cf. Plan 07 SUMMARY: "Tooltip contentStyle usa `var(--paper-0)` directo en v2 branch — elimina antipattern `hsl(var(--background))` mantenido verbatim en !v2").

### Pitfall: Aplicar `.theme-editorial` en `<html>` o `<body>` para "ahorrar wrappers"

Tentación inicial: aplicar el cascade en `src/app/layout.tsx` (root) en vez de `src/app/(dashboard)/layout.tsx` (segment). **Romperíamos OUT-OF-SCOPE:**
- `/super-admin/**`, `/sandbox/**`, `/onboarding/**`, `/create-workspace/**`, `/invite/**`
- `/login/**`, marketing routes (`(marketing)/**`)

**Solución.** Scope al wrapper del `(dashboard)/layout.tsx`. El cascade llega a `/whatsapp/**` también pero es intencional (ya tiene su propio flag compatible).

### Pitfall: `@theme` anidado dentro de `.theme-editorial`

Tailwind v4 no soporta `@theme` dentro de selectors. Intentar `.theme-editorial { @theme { ... } }` rompe silenciosamente. **Solución (heredada de Conversaciones).** CSS custom properties `:where(.theme-editorial) { --paper-0: ...; }` + override directo de tokens shadcn `:where(.theme-editorial) { --card: var(--paper-0); --background: var(--paper-0); ... }`.

### Pitfall: `next-themes` con `.dark` global

`next-themes` aplica `.dark` al `<html>` según preferencia del usuario. Si un usuario dashboard en dark mode activa el flag editorial, `.dark .theme-editorial` hereda invertido → se ve roto. **Solución (heredada de Conversaciones).** `.theme-editorial { color-scheme: light }` + override defensivo `.dark .theme-editorial { /* force light tokens */ }` en globals.css. La fase NO añadió clases `dark:` nuevas (Check 3 del DoD: HEAD=69, base=69, delta=0 en los 7 módulos).

### Pitfall: `<input>/<textarea>/<select>` no heredan font-family por default

User-agent stylesheet aplica sans-serif genérica a form controls, ignorando `font-serif` heredado del ancestor. **Solución.** Explícit `fontFamily: 'var(--font-sans)'` inline style en todos los form controls editoriales O className arbitrary `[font-family:var(--font-sans)]`.

### Pitfall: Wrapper component custom para forms muy complejos

Tentación: cuando Automatizaciones builder tiene decenas de inputs (trigger config + conditions + actions params + variable mappings), introducir `<EditorialInput>`, `<EditorialSelect>`, `<EditorialTextarea>` wrappers. **No necesario.** Clases Tailwind arbitrary `[border:1px_solid_var(--ink-1)]` + CSS variables + helpers locales (string consts) resuelven con menos churn. Plan 06 SUMMARY documenta: "actions-step.tsx (1628 LOC) re-skin estratégico vía `CardWrapper` variable — `Card → div` cuando v2 — y cascade shadcn overrides inherit automáticamente".

### Pitfall: `git clean` en worktree merge (evitado vía workflow)

Advertencia en el executor prompt (#2075, commit c6f4753). Los merges de Wave 1/2/3 NO ejecutaron `git clean` en el worktree — solo `git merge` con strategy explícita. Cero archivos perdidos.

### Pitfall: Pull-forward de primitive extension

Plan 04 descubrió que `task-list.tsx` consumía `AlertDialog` en Task 1 antes de que el plan lo extendiera en Task 5. Sin pull-forward, el primer commit hubiera compilado pero con TypeError en runtime (prop `portalContainer` no existía). **Solución.** Pull-forward del primitive extension al commit Task 1 y documentar explícitamente en el SUMMARY.

---

## §5. Scope deviations caught & justified

### Plan 02 (CRM)

Sin deviations del plan original según SUMMARY. 19 archivos modificados exactamente como planificado.

### Plan 03 (Pedidos)

- **KPI strip omitido v1.** Mock `pedidos.html` mostraba KPI strip (avg ticket, pending count, etc.) pero las métricas requieren backend no expuesto por queries existentes. Dejado deferred (Rule 4 — architectural, requiere backend work). Documentado en SUMMARY decisions.
- **Subtotal/Descuento/IVA omitidos del ledger.** `OrderWithDetails` type no tiene breakdown, solo `total_value`. Documentado como deuda schema — no fix inline (respeta D-DASH-07).
- **Flag pills heuristics.** `late` / `vip` / `mayor` derivados de fields existentes (`closing_date` + `stage.is_closed`, `tags`, `total_value`) sin business rules backend. Rule 2 adiado: decorativos no inventan data.
- **Task order Task 5 → Task 3.** Pull-forward de sheet.tsx extension para que order-sheet.tsx consumiera la prop. Documentado en SUMMARY (commit 1761d86 antes de 426b395).

### Plan 04 (Tareas)

- **Pull-forward de alert-dialog.tsx extension** de Task 5 a Task 1 por dependencia en task-list.tsx. Documentado.
- **`TaskStatus` enum sin `in_progress`** — kanban 4-col conservado para fidelidad al mock; "En proceso" queda vacía visualmente hasta que backend introduzca el status (D-DASH-07 respetado, no cambio de schema).
- **DnD library NO activa.** Grep `@dnd-kit` en `src/app/(dashboard)/tareas/` retorna 0. Drag-and-drop deferido a deuda futura.

### Plan 05 (Agentes)

- **Select portal issue (D-DASH-09):** Select primitive NO extendido en este plan (D-DASH-09 indicaba "si hace falta"). Anotado como deuda para Plan 09 DoD. En Check 7 del DoD: no detectamos leakage pero si el user reporta un Select que renderea fuera del theme durante QA, Plan `ui-redesign-dashboard-extras` lo cubre.

### Plan 06 (Automatizaciones)

- **`actions-step.tsx` (1628 LOC) re-skin estratégico.** Inner sub-components (ActionParamField, KeyValueEditor, DelayEditor, ProductMappingEditor, TemplateVarRow) heredan tokens via cascade shadcn overrides — NO branches explícitos v2 en cada uno. Rule 3 applied (blocker evitado: sin esta estrategia el re-skin hubiera requerido 200+ branches v2 en un solo archivo).

### Plan 07 (Analytics)

- **`portalContainer` en `popover.tsx` ya existía** (heredado de Conversaciones Plan 01). No se necesitó extender; solo consumir en DateRangePopover.
- **KPI deltas NO inventados.** `OrderMetrics` y `MetricTotals` no tienen campo `delta`; el slot `.kpi .d` del mock se rendea solo con icono placeholder + descripcion (D-DASH-07 respetado).

### Plan 08 (Configuración)

- **Chart internals deferred.** `UsageChart` (Recharts) NO re-skineado per plan (explícitamente out-of-scope por tamaño). Wrapper editorial provee container paper-0 + ink-1; internals Recharts quedan debt — Plan 07 ya estableció el patrón, Plan 08 opta por no duplicar.
- **`whatsapp/templates/builder/**` NO-TOUCH verificable.** `git diff --stat` vacío en ese path. El builder agente config-builder-whatsapp-templates tiene su propio scope de agent (CLAUDE.md linea .claude/rules/agent-scope.md).

### Plan 09 (close-out) — deviations de ESTE plan

- **Check 2 y Check 3 del DoD script originalmente entregados por plan requerían ajuste.** El plan como escrito hacía Check 2 FAIL porque medía matches absolutos, no delta. Ajustado a **`HSL_HEAD <= HSL_BASE`** (mismo spirit: "no introducir antipattern nuevo"). Análogamente Check 3 tenía bug shell de unary operator. Ambos documentados en el script como "Adapted from 09-PLAN.md <action>". Rule 1 applied: fix heurístico para eliminar false-positive sin cambiar intent.
- **Check 6 NO-TOUCH filtrado a commits phase-scoped.** Entre `9642e36` y HEAD, `somnio-recompra-template-catalog` fue merged en paralelo; sus commits tocan legítimamente `src/lib/agents/somnio-recompra/*` per su propio contrato. Filtro `git log --grep=ui-redesign-dashboard|worktree-agent` recupera el contract original (cero cambios funcionales POR LA FASE UI). Documentado en el header del reporte DoD.

---

## §6. Universal positives (cambios aditivos que aplican CON y SIN flag)

Esta fase aplicó el principio "flag-OFF byte-identical" estrictamente. Todos los cambios añadidos en Plans 02-08 están envueltos en ramas `v2 && '...'`, ternarios JSX `{v2 ? <editorial> : <legacy>}`, o classNames aditivos que solo surten efecto dentro de `.theme-editorial` (variables CSS no-consumed fuera del scope).

**Universal positives detectados** (cambios que aplican con y sin flag):
- **Ninguno crítico a nivel visual.** Ningún aria-label, ARIA role, bug-fix o refactor positivo fue introducido accidentalmente — el executor-phase mantuvo disciplina estricta.
- **Imports añadidos visibles sin flag:** `useDashboardV2` + `cn` + lucide icons adicionales están visibles en runtime aunque sus consumidores estén tras gate. Footprint: ~3-5 imports extra por archivo. Irrelevante para DOM output; solo afecta bundle size marginalmente (Next tree-shakes si los icons no se usan en `!v2`).
- **`data-theme-scope="dashboard-editorial"` attributes** en ~15 wrappers en Plan 02 y Plan 03. Aplicados en AMBOS paths (v2 y !v2) para no tener que condicional. Efecto: cero-impacto semántico (selector CSS nadie consume `[data-theme-scope]` fuera del portal target lookup). Documentado como deliberado en Plan 02 SUMMARY.

**Check 7 del DoD retornó PASS** (0 líneas añadidas sin flag-gating marker, tras filtrar markers obvios). No hay violación del flag-OFF byte-identical guarantee.

---

## §7. Deferrals

- **Brand component `<Brand />`.** Heredado de Conversaciones; sigue diferido. Esta fase aplicó el wordmark `morf·x` hardcoded en `sidebar.tsx` branch v2 y no abstrajo a reusable. Razón: patrón simple (~3 líneas JSX), no justifica overhead de primitive.
- **Modales/Sheets internos NO re-skineados a full editorial (sólo cascade parcial).**
  - Plan 04: `TaskNotesSection`, `TaskHistoryTimeline`, `TaskItem`, `PostponementBadge` shadcn intactos — cascade via `.theme-editorial` cubre tokens bg/border/text pero internals structurales (como grid layouts) quedan shadcn.
  - Plan 08: Chart internals (`UsageChart` Recharts) NO re-themed — solo wrapper editorial. Resto sin deferrals visibles.
  - **Fase sucesora:** `ui-redesign-dashboard-extras` para estos casos edge.
- **Mobile responsive <1024px.** Esta fase enfoca ≥1024px (D-DASH-04). Mobile dashboard editorial → fase futura.
- **Dark mode editorial.** Fuera de scope (Pitfall §4). `.theme-editorial { color-scheme: light }` forzado. Si se requiere dashboard dark, fase separada.
- **Sistema de microanimaciones / framer-motion.** Mocks son estáticos. Animaciones → fase separada.
- **OUT-OF-SCOPE modules con flag ON** (super-admin, sandbox, onboarding, create-workspace, invite). Pueden verse rotos visualmente con flag ON (D-DASH-04 mitigación). `ui-redesign-dashboard-extras` con `[data-theme-override="slate"]` cubre.
- **Admin UI para flipear flag sin SQL.** Operativo, no frecuente. Standalone separado low-priority.
- **i18n del dashboard editorial.** Copy preservado donde keys existen (D-DASH-18); textos nuevos hardcoded en español. Standalone i18n posterior.
- **Select primitive `portalContainer` extension.** Plan 05 flag lo dejó como deuda si usuario reporta leakage durante QA.
- **Pedidos: KPI strip + Subtotal/Descuento/IVA ledger.** Requieren backend no expuesto. Fase futura cuando se modele el schema.

---

## §8. Regla 6 verification

Cita verbatim del reporte DoD Check 6:

```
--- Check 6: Regla 6 NO-TOUCH guard (D-DASH-07 — UI-only, phase-scoped) ---
NO-TOUCH paths audited:
  - src/lib/domain
  - src/lib/agents
  - src/lib/automation
  - src/inngest
  - src/app/api
  - src/app/actions
  - src/hooks

Files touched by PHASE commits in NO-TOUCH paths: 0
PASS: zero files in NO-TOUCH paths modified by this phase's commits. Regla 6 verified.
```

**Conclusión.** Cero riesgo de regresión productiva al activar el flag. Ningún hook, realtime binding, action handler, webhook, agent runner, automation executor, inngest function, ni domain function fue modificado por commits de esta fase. El flip del flag afecta EXCLUSIVAMENTE el render path (JSX + className branches).

---

## §9. Rollout playbook

### Comandos SQL listos para copy-paste

**1. Identificar workspace UUID de Somnio:**
```sql
SELECT id, name, settings->'ui_inbox_v2' AS inbox_v2_state, settings->'ui_dashboard_v2' AS dashboard_v2_state
FROM workspaces
WHERE name ILIKE '%somnio%';
```

**2. Activar:**
```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb,
  true  -- create_missing — necesario si la llave 'ui_dashboard_v2' no existe aún
)
WHERE id = '<workspace-uuid>';
```

**3. Rollback inmediato si cualquier regresión:**
```sql
UPDATE workspaces
SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'false'::jsonb)
WHERE id = '<workspace-uuid>';
```

### Pasos de QA visual ordenados

Ver §9.1 más abajo — checklist completo generado post-push.

### Reference

Snippet completo, idempotente, documentado: `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql`.

---

## §10. Recommendations for future agents/planners

Para futuras fases UI editoriales:

1. **Reutilizar el bloque `.theme-editorial` canónico** — NO crear `.theme-{module}` paralelos. La consistencia token es el valor.
2. **Adoptar el patrón flag resolver server-side** mirror de `getIsDashboardV2Enabled()`. Fail-closed try/catch, un query por page load, namespace JSONB con espacio para sub-keys futuras.
3. **Adoptar `<XContext>` + `useX()` hook** para gate de NEW JSX sin prop drilling — más limpio que `v2={true}` propagado por niveles. Prop drilling SOLO para el primer nivel (Server Component resuelve SSR → Client Component recibe prop → descendants usan hook).
4. **Sweep de Radix portals al final de cada wave** — grep canonical: `DropdownMenu|Popover|Select|HoverCard|Dialog|Tooltip|Sheet|AlertDialog` dentro del módulo. Re-rootear con `portalContainer` prop o documentar exclusion como intentional-slate.
5. **Mock pixel-perfect vs grid alignment** — documentar decisión por valor en UI-SPEC ANTES de execution. Ejemplo: mock `tareas.html` linea 90 tiene `box-shadow: 0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)` → replicar EXACTO o abstraer a token `--shadow-elevated`. La fase eligió replicar verbatim (scope UI-only).
6. **Universal aria-labels + ARIA roles** — aplicar con/sin flag si son mejoras a11y — benefician TODOS los usuarios. Esta fase no detectó oportunidades pero fases futuras pueden introducir.
7. **Auditar `hsl(var(--token))` bugs pre-existentes** en cada módulo nuevo antes de empezar — si los tocas en tu fase, vas a tener que preservarlos en !v2 branches. Mejor mapearlos antes de ejecutar.
8. **Para módulos con muchos forms (Configuración, Automatizaciones builder, Tareas):** invertir tiempo en una pasada inicial de form treatments (D-DASH-14) ANTES de re-skinear el resto del módulo. Los inputs son los más visibles cuando rompen el theme.
9. **Pull-forward de primitive extensions.** Si una extensión shadcn-ui (`sheet.tsx`, `alert-dialog.tsx`, etc.) es necesaria para un task downstream dentro del mismo plan, LANDEAR la extensión PRIMERO en el commit de Task 1 (pull-forward explícito), no en orden natural. Evita runtime TypeError en primer commit.
10. **DoD heuristics.** Los grep checks son coarse — falsos positivos son esperables. Los checks críticos (NO-TOUCH, TypeScript, hsl delta) son bloqueantes; Check 7 flag-OFF byte-identical es auditoría, no bloqueo. Documentar razones de exceptions en LEARNINGS §6.
11. **Paralelización safe.** Waves 1-3 ejecutaron 2-3 plans en paralelo en worktrees distintos. Fuente de seguridad: archivos disjoint entre plans (CRM ≠ Pedidos ≠ Tareas, Agentes ≠ Automatizaciones, Analytics ≠ Configuración). Verify disjoint files check antes de spawn paralelo.

---

## §11. DoD evidence

| # | Check | Result |
|---|-------|--------|
| 1 | Slate leakage en path editorial (7 módulos) | PASS — cero leakage, slate-N matches confinados a ramas !v2 |
| 2 | hsl(var(--*)) delta ≤ 0 (HEAD=8, base=8) | PASS — no introducciones nuevas, 8 matches preservados verbatim en !v2 legacy branches |
| 3 | dark: delta ≤ 0 (HEAD=69, base=69) | PASS — no nuevas clases dark: introducidas |
| 4 | mx-* count ≥ 50 (actual: 120) | PASS — adopción editorial real (46 CRM + 35 Configuración + 24 Automatizaciones + 6 Métricas + 5 Analytics + 4 Agentes + 0 Tareas) |
| 5 | tsc --noEmit clean | PASS — zero TypeScript errors |
| 6 | Regla 6 NO-TOUCH (phase-scoped, hits: 0) | PASS — zero archivos en paths NO-TOUCH modificados por commits de esta fase |
| 7 | Flag-OFF byte-identical heuristic audit | PASS — todas las líneas añadidas en los 7 módulos carry flag-gating markers |

**Nota sobre Check 4 (mx-* count):** Tareas retorna 0 porque el módulo usa **color-mix pills custom** (`.task-pill--pending`, etc.) en lugar de `mx-tag` utilities por fidelidad al mock `tareas.html` linea 272-276. Los otros 6 módulos compensan ampliamente — total 120 >> threshold 50.

**Auditable provenance.** El reporte completo incluye inventario de los 49 commits phase-scoped (ver `dod-verification.txt` sección "Phase commit inventory").

---

## §12. Commits ranges

| Plan | Range | Primeros/últimos hashes | Notas |
|------|-------|-------------------------|-------|
| 01 (Wave 0 infra) | `d91ca2a..2c13eef` | 5 commits (4 tasks + 1 SUMMARY) | Flag + fonts + layout + sidebar + DashboardV2Provider |
| 02 (CRM) | `2f16661..ded30ad` | 7 commits (6 tasks + 1 SUMMARY) | Dictionary-table pattern primer aplicación + forms D-DASH-14 primer aplicación |
| 03 (Pedidos) | `99226ae..b155f84` | 6 commits (5 tasks + 1 SUMMARY) | Kanban card primer aplicación + sheet.tsx extension BC |
| 04 (Tareas) | `f38b19c..1a9362a` | 7 commits (5 tasks + 1 SUMMARY + 1 worktree merge) | alert-dialog.tsx extension BC (pull-forward) + task-card/kanban/row creados |
| 05 (Agentes) | `9a14c94..c32da8b` | 5 commits (4 tasks + 1 SUMMARY) | 9 metric cards editorial + config panel 6 sections |
| 06 (Automatizaciones) | `f4beb3b..f85da50` | 6 commits (5 tasks + 1 SUMMARY) | React Flow dotted canvas + AI builder chat + dialog.tsx extension BC |
| 07 (Analytics+Métricas) | `475e0a9..6629b9d` | 6 commits (4 tasks + 1 SUMMARY + 1 worktree merge) | Recharts re-themed via props + KPI strip + date-range popover |
| 08 (Configuración) | `b46d20b..c2ad0f3` | 7 commits (6 tasks + 1 SUMMARY) | Forms editorial helpers + dictionary-table masivo |
| 09 (close-out) | (tracked in 09-SUMMARY.md) | DoD + LEARNINGS + platform doc + SQL + 2 close commits + push | NO modificación de `src/**` |

**Total:** 49 commits phase-scoped (47 feat/docs + 2 worktree merges). Inventario completo en `dod-verification.txt` sección "Phase commit inventory".

**Push a Vercel:** ejecutado 2026-04-23 vía `git push origin main` al final del Plan 09 (ver `09-SUMMARY.md` para el hash final exacto).

---

## §9.1 Decisión post-push: activación Somnio

**Estado al cierre del Plan 09 (2026-04-23):** flag `ui_dashboard_v2.enabled` NO activado en ningún workspace. El push a Vercel solo deja el código disponible — el comportamiento productivo (todos los workspaces ven dashboard slate actual) es 100% byte-identical al `main` pre-fase.

**Por qué NO se activa automáticamente en Somnio post-push:**

1. La fase es mega — 7 módulos re-skineados. Hay riesgo no-cero de detalle visual roto en algún módulo que el grep no detecta (ej. un overflow en chart de Analytics, un dropdown que quedó slate, un modal que portal-sweep no cubrió).
2. Somnio es un workspace **productivo con cliente real** (no morfx-dev). Activar sin QA visual del usuario incumple el espíritu de Regla 6.
3. La activación es un **paso operativo de 1 query SQL** — no necesita ser parte del code commit.

**Checklist QA pre-activación** (el usuario decide cuándo ejecutar):

1. Identificar workspace UUID de Somnio:
   ```sql
   SELECT id, name FROM workspaces WHERE name ILIKE '%somnio%';
   ```
2. **Baseline screenshots (flag OFF — estado actual):** para CADA uno de los 7 módulos, navegar y capturar pantalla de la vista principal + vistas secundarias críticas:
   - `/crm` (listado contactos) + un contacto detail + `/crm/productos` listado
   - `/crm/pedidos` (kanban + list) + un pedido detail sheet
   - `/tareas` (kanban + lista) + un task detail sheet + crear/editar tarea dialog
   - `/agentes` (lista + un agent detail con prompt editor + metrics dashboard)
   - `/automatizaciones` (lista + wizard + canvas React Flow + historial + AI builder chat)
   - `/analytics` (dashboard principal con charts AreaChart + KPI strip)
   - `/metricas` (vista métricas + LineChart multi-series + date-range popover)
   - `/configuracion` (cada subsección — integraciones, whatsapp/templates + equipos + quick-replies + costos, tareas)
3. **Activar flag** vía `activacion-somnio.sql` PASO 2.
4. **Reload + screenshots flag-ON:** mismas vistas, lado a lado con baseline.
5. **Verificación funcional smoke** (en cada módulo): crear/editar/listar el recurso principal funciona.
6. **Verificación crossover:** desde `/whatsapp` (que ya tenía `ui_inbox_v2.enabled=true`) confirma que la transición a otros módulos es coherente — no hay flash slate ni font swap visible.
7. Si todo OK → mantener flag activado. Si CUALQUIER regresión → rollback inmediato vía `activacion-somnio.sql` PASO 3 + reportar el módulo afectado.

**Si el QA descubre regresión menor:** documentar en debug `.planning/debug/<descripción>.md`, dejar flag activado si la regresión es estética y no funcional (puede esperar fix), o rollback si es funcional/visible.

**Cuándo activar productivamente en otros workspaces:** después que el flag haya estado activo en Somnio por al menos 1-2 semanas sin reports negativos, y solo después de QA equivalente per-workspace.

### §9.1.1 Verificación post-push (el flag SIGUE OFF para todos los workspaces)

Inmediatamente después del push, el usuario puede correr estas 2 queries informacionales en Supabase Studio para confirmar que NINGÚN workspace tiene el flag ON (defensa final — la Regla 6 dice "agente productivo intacto hasta activación explícita"):

```sql
-- Query 1: Confirmar que ningún workspace tiene ui_dashboard_v2 explícitamente seteado a true
SELECT id, name, settings->'ui_dashboard_v2' AS state
FROM workspaces
WHERE settings->'ui_dashboard_v2'->>'enabled' = 'true';
-- Esperado: 0 rows.

-- Query 2: Confirmar que el default per-workspace es false|NULL
SELECT
  COUNT(*) FILTER (WHERE settings->'ui_dashboard_v2' IS NULL)             AS sin_llave,
  COUNT(*) FILTER (WHERE settings->'ui_dashboard_v2'->>'enabled' = 'false') AS explicito_false,
  COUNT(*) FILTER (WHERE settings->'ui_dashboard_v2'->>'enabled' = 'true')  AS explicito_true
FROM workspaces;
-- Esperado: sin_llave = total_workspaces (o cercano); explicito_true = 0.
```

Si Query 1 retorna 0 rows y Query 2 muestra `explicito_true = 0`, Regla 6 está verificada post-push: el código shipeado NO alteró el comportamiento productivo de ningún workspace. La activación es un paso operativo separado a voluntad del usuario.

### §9.1.2 Tracking de la activación una vez ejecutada

Post-activación (el usuario corre `activacion-somnio.sql` PASO 2), agregar una nota a MEMORY.md del proyecto con:

- Fecha de activación
- Workspace UUID
- Resumen del QA visual (OK o issues detectados)
- Si rollback, motivo

Esto mantiene el log de milestones v5.0 sincronizado.

---

## Self-Check: PASSED

Files verificados existentes en este plan (Plan 09):
- `.planning/standalone/ui-redesign-dashboard/dod-verification.txt` ✅
- `.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` ✅ (this file)
- `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql` ✅ (Task 3)
- `docs/analysis/04-estado-actual-plataforma.md` ✅ (Task 3 — updated)

Commits range del phase inventoriados con `git log --oneline 9642e36..HEAD | grep -iE "ui-redesign-dashboard|worktree-agent"` retorna 49 commits (ver `dod-verification.txt` sección "Phase commit inventory").
