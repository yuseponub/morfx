---
phase: ui-redesign-dashboard
review_type: retroactive-structural-audit
reviewed: 2026-04-23
reviewer: UI audit (Opus 4.7, 1M ctx)
base_commit: 33b657f..c1d841e  # shipped + rolled back
flag_state: ui_dashboard_v2.enabled = FALSE (production safe — no impact)
verdict: BLOCK — no re-activar flag sin remediation mega-phase
---

# UI-REVIEW — UI Redesign Dashboard (mega-fase)

## Executive Summary

La fase `ui-redesign-dashboard` shipped 7 módulos gated por flag `ui_dashboard_v2.enabled`. El flag fue rolled back el 2026-04-23 porque los módulos implementados **no matchean los mocks HTML** que el design handoff v2.1 define como fuente de verdad (D-DASH-08). El usuario reportó que "no lucen como los mocks" — este audit confirma la observación y cuantifica el drift.

**Fidelidad promedio al mock: ~35%.** Los executors aplicaron tokens editoriales (`var(--paper-*)`, `var(--ink-*)`, `var(--rubric-2)`, serif typography) sobre la **estructura shadcn existente** en vez de restructurar el markup para matchear el layout del mock. Resultado: los módulos *se ven* editoriales (colores, tipografía, borders) pero **no son** los mocks — secciones completas faltan, layouts multi-columna están reemplazados por single-column, features del mock no están implementadas.

**Overall verdict: BLOCK.** No re-activar el flag hasta remediation. El estado actual induciría al usuario a pensar que el redesign está hecho cuando structuralmente no lo está. Mejor flag OFF + nueva mega-phase de retrofit que flag ON con implementación incompleta visible a Somnio.

### Top 5 findings críticos cross-módulo

1. **BLOCK — Sidebar global sin category sections.** Los 7 mocks muestran el sidebar con secciones *"Operación / Automatización / Análisis"* (`.cat` dividers en smallcaps). La implementación (`src/components/layout/sidebar.tsx:44-122`) tiene un array plano `navItems[]` sin agrupar. Además lista 11 items (SMS, Comandos, Sandbox, Confirmaciones, Equipo, Metricas, Configuración) que NO existen en los mocks — los mocks solo muestran 8 items (CRM, WhatsApp, Pedidos, Tareas, Automatizaciones, Agentes, Analytics, Configuración). El sidebar editorial ON actualmente se ve "raro" para Somnio porque todos esos items sin agrupar rompen la jerarquía tipográfica del mock.

2. **BLOCK — Agentes: módulo entero está implementado como algo distinto al mock.** Mock `agentes.html` es un **agents catalog** (grid de agent cards con `.agent-avatar` + stats 4x + status badges + sandbox 3-col al hacer click). Implementación (`src/app/(dashboard)/agentes/page.tsx:1-38` + `components/metrics-dashboard.tsx`) renderea un **metrics dashboard** con cards agregados (conversaciones, handoffs, conversión) para el agente de producción único. Zero grid de agentes, zero agent cards, zero sandbox. Esto **no es drift visual** — es un módulo diferente con la misma ruta.

3. **BLOCK — Automatizaciones: mock es flow canvas 3-col, impl es lista + wizard.** Mock `automatizaciones.html` muestra workspace `grid-template-columns: 280px 1fr 320px` con autolist (sidebar de automatizaciones) + **canvas visual con nodos SVG/edges** + inspector de propiedades. La implementación es un árbol de folders con items (`automation-list.tsx:1-1641`) y edit route va a un **wizard por pasos** (`[id]/editar/page.tsx`). Zero canvas, zero nodos visuales, zero edges drawn — un paradigma UI completamente distinto al mock.

4. **BLOCK — Analytics: 5+ secciones del mock faltan, solo ~20% de fidelidad.** Mock `analytics.html` tiene: KPI strip de 6 cards (Conversaciones, Resueltas por IA, Tiempo respuesta, CSAT, Pedidos, Ingresos), line chart con 3 series + anotaciones, **channel bar list** (WhatsApp orgánico / Shopify checkout / Campañas / Click-to-WhatsApp / QR), **embudo de ventas 5 stages**, y más (heatmap, cohortes, top productos). Implementación (`analytics-view.tsx:1-47`) solo tiene: MetricCards (4 cards, no 6) + SalesChart (recharts area chart) + PeriodSelector. Zero funnel, zero channel bars, zero topbar con eyebrow "Módulo · analytics".

5. **FLAG — Los executors NO restructuraron markup, solo aplicaron tokens al markup shadcn.** Patrón repetido en los 7 módulos: cuando hay un `v2 ? ... : ...` ternario, el branch `v2` reemplaza className + fontFamily pero mantiene la misma jerarquía JSX (Card → CardHeader → CardContent, Sheet → SheetContent, Tabs → TabsList → TabsTrigger, etc.). Los mocks NO usan esas primitivas — usan `<section>`, `<article>`, `<aside>`, `<details>`/`<summary>`, tables raw. La consecuencia: los componentes se ven *con colores editoriales* pero *siguen teniendo las proporciones, paddings, radii y jerarquía de shadcn*, que son las que el mock quiere eliminar. Este es el root cause sistémico.

---

## Por módulo (7 secciones)

### Módulo 1 — CRM (mock `crm.html` + impl `/crm/contactos` + `/crm/productos`)

**Mock structural overview** (`crm.html`:108-152 + CSS 37-82):
- Topbar `eye` (eyebrow "Módulo · crm" en rubric-2) + `h1` "Contactos — libro de clientes" + 3 actions (Importar / Exportar / Crear contacto rojo).
- **Tabs secundarios** (línea 120-125): "Contactos" / "Pedidos · kanban" / "Pipelines" / "Configuración" — el mock trata CRM como un hub multi-view.
- **Toolbar** (línea 128-134): search con icono 14px, 4 count chips (Todos 248 / Clientes 112 / Prospectos 94 / Mayoristas 18), timestamp "Actualizado 21 abr, 14:32".
- **Dictionary-table** (línea 136-139 + CSS 51-58): `table.dict` con 5 columnas — Contacto (bold entry) / Teléfono (mono) / Ciudad (quiet ink-3) / Etiquetas (pills `.tg.red/.gold/.indi/.ver`) / Último contacto (mono ink-3).
- **Second tab** (línea 142-149): toolbar con chips de período (Este mes / Semana / Todos) + "$ 18.420.000 en pedidos abiertos" + kanban grid 4-col (Nuevo 📥 / Confirmado 🍳 / Empacado 📦 / Entregado 🚚) con cards minimalistas.

**Implementación structural overview** (`/crm/contactos/page.tsx` + `/crm/contactos/components/contacts-table.tsx:1-349`):
- Topbar v2 correcto con eyebrow "Módulo · crm" + h1 "Contactos — libro de clientes" (`page.tsx:32-55`).
- **NO hay tabs "Contactos / Pedidos · kanban / Pipelines / Configuración"** — el CRM root redirige a `/crm/pedidos` (`crm/page.tsx:1-5`).
- Toolbar simplificada (`contacts-table.tsx:212-251`): search + Importar + Exportar. **NO hay count chips** (Todos / Clientes / Prospectos / Mayoristas). **NO hay timestamp "Actualizado…"**.
- Tabla uses `DataTable` de shadcn (no `<table>` raw) — styling via tailwind arbitrary selectors `[&_table]:border-collapse [&_thead_th]:...` (`contacts-table.tsx:272-285`). Funciona pero mantiene comportamiento de TanStack Table (sort, pagination, row selection).
- **Columnas: 8 en lugar de 5** (`columns.tsx:61-325`): select / name / phone / address / city / department / tags / updated_at / actions. Mock muestra solo name/phone/city/tags/updated.
- Productos existe como route separada (`/crm/productos`) que el mock ni menciona — pero está dentro del CRM scope.

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Eyebrow "Módulo · crm" + h1 | Sí | PASS | `contactos/page.tsx:36-53` |
| "— libro de clientes" em tagline | Sí | PASS | `contactos/page.tsx:47-51` |
| Tabs Contactos/Pedidos/Pipelines/Configuración | NO (redirect a pedidos) | BLOCK | `crm/page.tsx:4` |
| Count chips (Todos/Clientes/Prospectos/Mayoristas) | NO | BLOCK | `contacts-table.tsx:212+` |
| Timestamp "Actualizado HH:MM" | NO | FLAG | `contacts-table.tsx:212+` |
| 5-column dict table | Parcial — 8 cols con tokens editoriales sobre DataTable | FLAG | `columns.tsx:61-325` |
| Column header smallcaps rubric-2 | Sí (via tailwind escapes) | PASS | `contacts-table.tsx:275` |
| Tag pills `.tg.red/.gold/.indi/.ver` → `.mx-tag--*` | Parcial (usa TagBadge existente, no `.mx-tag--*`) | FLAG | `columns.tsx:243-256` |
| Hover row paper-2 | Sí | PASS | `contacts-table.tsx:275` |
| Kanban-de-pedidos en tab dentro de CRM | Live en ruta separada `/crm/pedidos` | BLOCK (drift estructural — mock lo quiere como tab) | `crm/page.tsx:4` |

**Fidelity estimate: 45%.** Los tokens y topbar están bien, pero el paradigma de "hub de CRM con tabs" del mock no está implementado — el usuario ve la página de contactos aislada, sin los count chips ni el toggle a kanban-de-pedidos que el mock promete.

**Scope del fix:**
- Crear `/crm/layout.tsx` con topbar editorial + 4 tabs (Contactos / Pedidos · kanban / Pipelines / Configuración) — redirect root sí tiene sentido para `/crm` pero el *layout* debe tener la nav horizontal.
- Agregar count chips arriba de la tabla de contactos: requiere server fetch de counts por segmento (clientes, prospectos, mayoristas — hoy no existe esta semántica, decidir si se derivan de tags o se agregan columns a `contacts`).
- Reducir columnas visibles en mobile/default a 5 — esconder address/department via hidden columns toggle.
- Reemplazar `TagBadge` por spans con clases `.mx-tag--rubric/--gold/--indigo/--verdigris` (section 6 README handoff) cuando `v2`.

---

### Módulo 2 — Pedidos (mock `pedidos.html` + impl `/crm/pedidos`)

**Mock structural overview** (`pedidos.html`:172-321 + CSS 41-168):
- Topbar con eyebrow "Módulo · pedidos" + h1 "Tablero de pedidos — Papelería Andina" + 3 actions (Imprimir hoja de ruta / Exportar / **Nuevo pedido rojo `.btn.pri` dark**).
- **KPI strip de 4 cards** (línea 212-233): `grid-template-columns: repeat(4, 1fr)` con Pedidos abiertos 14 / Valor en curso $18.4M / Promedio prep. 2h 14m / Entregados hoy 6/9. Cada KPI tiene label smallcaps + display number + delta (up/down/flat).
- **Toolbar** (línea 236-247): search + 4 chips de período (Hoy · 9 / Esta semana / Mes / Todos) + segment control 3-way (Tablero / Lista / Calendario).
- **Kanban 4-col con right drawer** (línea 250-320): `grid-template-columns: 1fr 420px`. Cada columna tiene dot color indigo/gold/verdigris/success + smallcaps label + count mono + **summary row** ("3 pedidos | $4.080.000") + body con `<article class="card">` cards.
- **Card kanban** (línea 84-101 CSS): id mono (`#0427`) arriba-izq / value mono arriba-der / customer name serif 13.5px / product preview 2-line clamp / **dashed footer** con avatar 20px + date mono + flags pills (late/vip/mayor/pago).
- **Drawer** (línea 253-320): sticky header con id+name+h2+meta (calendar/city/ship) + close button. **Stage-bar** (línea 269-276) con "Estado actual" + chip coloreado por stage + adv buttons (prev/next). Cliente section con avatar 36px ink-1 fondo + nombre/sub + 3 action buttons (WhatsApp/Llamar/Ficha). Líneas del pedido con table `.lines`. Totals con grand total display serif 18px. Notas en serif italic. Activity timeline collapsible.

**Implementación structural overview** (`orders-view.tsx:1-1423` + `kanban-card.tsx:1-366` + `order-sheet.tsx`):
- Topbar v2 correcto (`orders-view.tsx:721-760`) con eyebrow + h1 "Tablero de pedidos" (**NO tiene "— Papelería Andina"** — cotizable porque es dinámico, pero el mock lo muestra).
- **NO hay KPI strip** (`orders-view.tsx` completo — grep confirma zero "KPI/kpi/Pedidos abiertos/Valor en curso"). Gap estructural mayor.
- **NO hay botón "Imprimir hoja de ruta"** — solo Exportar + Nuevo pedido.
- Botón Nuevo pedido es `bg-[var(--ink-1)]` black (correcto al mock línea 207 que dice `.btn.pri` = dark), pero la acción roja `.btn.red` que tiene más jerarquía en otros mocks (tareas) se confunde.
- Toolbar (`orders-view.tsx:763-901`): search + Select "Etapa" + Popover "Filtrar por etiquetas" + Select "Orden" + sort direction button + ViewToggle. **NO hay los 4 chips Hoy/Semana/Mes/Todos** — reemplazados por un stage select. **NO hay option "Calendario"** en ViewToggle (solo kanban/lista — ver `view-toggle.tsx`).
- Kanban cards (`kanban-card.tsx:122-365`): estructura cercana al mock — id mono top-left, value mono top-right, customer name bold, product preview, dashed border-top footer con avatar + date + flags (vip/mayor/late). Esto **está bastante cerca** del mock.
- Column header: **NO tiene dot por stage** del mock (accent-indigo / gold / verdigris / success) — usa `stage.color` custom del DB. **NO tiene summary row "3 pedidos | $4.080.000"** (`kanban-column.tsx:117-320`).
- Drawer (`order-sheet.tsx`): tiene Estado actual + Cliente + Líneas + Actividad — **parcialmente fiel**. Usa `<Sheet>` shadcn en lugar de `<aside class="drawer">` raw. Falta "Notas" section explícita en serif italic.

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Topbar eyebrow + h1 + actions | Sí | PASS | `orders-view.tsx:724-760` |
| "Imprimir hoja de ruta" button | NO | FLAG | `orders-view.tsx:741-758` |
| KPI strip 4 cards (abiertos/valor/prep/entregados) | NO | BLOCK | N/A |
| Chips Hoy/Semana/Mes/Todos | NO (reemplazado por Select stage) | BLOCK | `orders-view.tsx:778-797` |
| Segment Tablero/Lista/Calendario | Parcial (solo kanban/list) | FLAG | `view-toggle.tsx` |
| Kanban 4-col layout | Sí (pero N dinámico por pipeline stages) | PASS | `kanban-board.tsx` |
| Column header con dot color + sum row | NO sum row; dot existe (stage.color) | FLAG | `kanban-column.tsx:117-320` |
| Card id mono + value mono top row | Sí | PASS | `kanban-card.tsx:165-223` |
| Card dashed footer con avatar | Sí (border-t dashed) | PASS | `kanban-card.tsx:287-295` |
| Card flags (late/vip/mayor/pago) pills | Sí (derivadas client-side) | PASS | `kanban-card.tsx:306-320` |
| Drawer Estado actual chip | Sí | PASS | `order-sheet.tsx:345` |
| Drawer Cliente avatar+sub+3btns | Sí | PASS | `order-sheet.tsx` |
| Drawer Líneas del pedido table.lines | Sí (parcial) | PASS | `order-sheet.tsx:566` |
| Drawer Notas section serif italic | Parcial (tiene notas, no en serif italic) | FLAG | `order-sheet.tsx` |
| Drawer Actividad timeline | Sí (básico) | PASS | `order-sheet.tsx:896-905` |
| Drawer Totals grand display 18px | Parcial (existe, pero con shadcn) | FLAG | `order-sheet.tsx` |

**Fidelity estimate: 55%.** Kanban cards y drawer están bien reskineados. El KPI strip y el toolbar con chips/calendar view son gaps estructurales grandes — el mock de pedidos promete un **tablero operativo completo** y la impl entrega un kanban bonito pero sin el "resumen ejecutivo" que son las KPIs + los quick-filter chips.

**Scope del fix:**
- Agregar componente `OrderKpis` renderizado entre topbar y toolbar cuando `v2`. Cuatro cards con: Pedidos abiertos (count de orders no cerradas), Valor en curso (sum total_value de las no cerradas), Promedio prep (requiere cálculo de `stage changes` — defer), Entregados hoy (count de orders con stage.is_closed=true + updated_at en hoy). Decidir si fabricar el "Promedio prep" con datos reales o mostrar "—" hasta que haya metric.
- Agregar 4 chips de período arriba del kanban (Hoy / Semana / Mes / Todos) que filtren por `created_at`. Mover el Select de etapa a un secundary filter (no es obvio que el mock tenga ese select — el mock usa chips como filter primario).
- Wire a 3-way view toggle: Tablero / Lista / Calendario. Calendario es feature nuevo (los otros dos existen). Si calendario es post-MVP, documentar como known gap.
- En column header: agregar fila `.sum` con "X pedidos | $Y.YYY.YYY" debajo del header row.
- Agregar "Imprimir hoja de ruta" button (puede ser stub que genere un PDF o a futuro).

---

### Módulo 3 — Tareas (mock `tareas.html` + impl `/tareas`)

**Mock structural overview** (`tareas.html`:283-321 + CSS 26-277):
- Main grid `grid-template-rows: auto auto 1fr` (topbar / tabs-saved-views / workspace 3-col).
- Topbar eyebrow "Módulo · Operación" + h1 "Tareas · 38 abiertas · 6 vencen hoy" + actions (view-toggle 2-way / Filtros ghost / Exportar / **Nueva tarea .btn.red rojo rubric**).
- **Tabs saved views** (línea 49-54 + 323-337): "Todas 38 / Mías 9 / Sin asignar 6 / Vencen hoy 6 / De agentes IA 24 / + Guardar vista" + spacer + chips filtros (Abiertas ✓ / Prioridad · alta+ / Asignado · cualquiera / + Filtro).
- **Workspace 3-col**: `grid-template-columns: 1fr 360px` — board-wrap (kanban 4-col) + detail-panel (right side, persistent).
- **Kanban cards** (línea 87-148): paper-0 bg + ink-1 border + shadow-stamp. **pri-stripe 3px left** colored por priority (rubric-2 urgent / accent-gold high / accent-indigo med / ink-4 low). Task-hd con id mono + type badge coloreado (rubric/indigo/verdigris/ink). Task-body con title display-serif 15px + excerpt serif-italic 12px + labels lbl-chip (devol/logi/ventas/sic/catalogo). Task-foot con avatares encadenados -4px (incluyendo `.av.bot` tinted rubric) + assignee + SLA (danger/warn/ok).
- **Detail panel** (línea 150-234): dp-hd con id+close+title+tagline+labels + dp-actions + dp-meta-grid 2x2 (asignado/sla/pedido/conversación) + dp-sect collapsibles (Actividad/Checklist/Adjuntos) + dp-composer (tabs-sm "Notas internas / Mensaje al cliente" + textarea + row).

**Implementación structural overview** (`task-list.tsx:1-499+` + `task-kanban.tsx:1-142` + `task-card.tsx:1-258` + `task-detail-sheet.tsx`):
- Topbar editorial (`tareas/page.tsx:30-55`) con eyebrow "Módulo · Operación" + h1 "Tareas · N abiertas · M vencen hoy". **PASS** — matchea mock.
- Saved views tabs (`task-list.tsx:424-471`) implementadas: "Todas / Mías / Sin asignar / Vencen hoy" con counts mono. **NO implementa "De agentes IA" ni "+ Guardar vista"**. FLAG.
- **NO implementa filter chips row** (Abiertas / Prioridad alta+ / Asignado / + Filtro). Tiene `TaskFiltersBar` pero con controles shadcn dropdown — no chips editoriales. FLAG.
- Workspace **NO es 3-col persistent** — detail panel es un `Sheet` que abre/cierra como drawer shadcn en lugar de ser un panel persistent 360px en la derecha. FLAG (estructural).
- Kanban cards (`task-card.tsx:88-257`): **muy cerca del mock**. Tiene pri-stripe, task-hd con id+type, task-body con title display + excerpt italic + labels + meta, task-foot con avatares + assignee + SLA. PASS.
- Kanban columns (`task-kanban.tsx:72-141`): sw swatch 10x10 + label smallcaps + count mono. PASS.
- Detail sheet `TaskDetailSheet` usa `<Sheet>` shadcn.

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Topbar eyebrow + h1 + count | Sí | PASS | `tareas/page.tsx:33-55` |
| Actions view-toggle + Filtros ghost + Exportar + Nueva tarea roja | Parcial (sin Exportar ni Filtros ghost) | FLAG | `task-list.tsx:297-344` |
| Saved views tabs (Todas/Mías/Sin/Hoy/IA/+Guardar) | Parcial (4 de 6 tabs) | FLAG | `task-list.tsx:432-469` |
| Filter chips row (Abiertas/Prioridad/Asignado/+Filtro) | NO (usa TaskFiltersBar shadcn) | FLAG | `task-filters.tsx` |
| 3-col persistent workspace (kanban + detail panel) | NO (detail es drawer sheet) | BLOCK | `task-list.tsx` |
| Kanban 4-col layout | Sí (Pendiente/En proceso/En espera/Completada) | PASS | `task-kanban.tsx:31-60` |
| Column swatch + smallcaps + count mono | Sí | PASS | `task-kanban.tsx:86-101` |
| Task card pri-stripe coloreado por priority | Sí | PASS | `task-card.tsx:108-112` |
| Task-hd id + type badge coloreado | Sí | PASS | `task-card.tsx:115-130` |
| Task title display serif 15px | Sí | PASS | `task-card.tsx:134-139` |
| Task excerpt serif italic | Sí | PASS | `task-card.tsx:140-147` |
| Labels lbl-chip (devol/logi/ventas/sic/catalogo) | NO (usa TagBadge básico) | FLAG | `task-card.tsx` (no labels) |
| Task-foot avatares encadenados + SLA | Sí | PASS | `task-card.tsx:200-254` |
| Detail panel dp-meta-grid 2x2 | NO (SheetContent shadcn) | FLAG | `task-detail-sheet.tsx` |
| Detail composer con tabs Notas/Mensaje | TBD (depende de impl) | FLAG | `task-detail-sheet.tsx` |

**Fidelity estimate: 55%.** Task CARDS están muy bien, casi pixel-perfect al mock. Pero el paradigma del detail panel persistent 360px vs drawer que abre-cierra es un gap estructural — el mock quiere que el detail siempre esté visible a la derecha cuando seleccionas una tarea, no un sheet modal.

**Scope del fix:**
- Restructurar layout de `task-list.tsx` a un `grid grid-cols-[1fr_360px]` cuando `v2 && selectedTask`. Cuando no hay task seleccionada, detail panel vacío con "Selecciona una tarea para ver detalles" en serif italic.
- Agregar "De agentes IA" tab (filtra por `task.origin.agent IS NOT NULL`).
- Reemplazar `TaskFiltersBar` cuando v2 por chips editoriales "Abiertas ✓" "Prioridad alta+" "Asignado" "+ Filtro" stateful.
- Agregar componente `TaskLabels` que renderee `.lbl-chip` pattern (devol rubric / logi verdigris / ventas indigo / sic ink / catalogo neutral) derivando de task.labels[] o task_type.
- Agregar "Exportar" + "Filtros" ghost buttons en actions row.
- Detail panel dp-meta-grid 2x2: cells con asignado/sla/pedido/conversación — reusa data ya existente.

---

### Módulo 4 — Agentes (mock `agentes.html` + impl `/agentes`)

**Mock structural overview** (`agentes.html`:283-807 + CSS 48-280):
- Vista `agents-view` (default): topbar + tabs + toolbar (search + chips Todos/Activos/Pausados/Borradores + "Ver sandbox" + **.btn.red "Nuevo agente"**) + **grid `agents` con `repeat(auto-fill, minmax(340px, 1fr))` de agent cards**.
- **Agent card** (línea 56-86 + 282-449): paper-0 bg + ink-1 border + shadow. Header con agent-avatar 40x40 serif-display + agent-name display 18px + agent-role smallcaps + **agent-status** badge (on/paused/draft). Desc serif 13px con `em` rubric. agent-body `dl` 2x2 (Modelo/Tono/Canal/Herramientas) con dt smallcaps + dd mono. agent-stats 4-col (Turnos 847 / Conversión 67% / Respuesta 1.2s / CSAT 4.8) con display 22px numbers. agent-foot con "Última act. · hace 5 min" + actions (Editar / Pausar / Probar).
- Vista `detail` (cuando click en card): `grid-template-columns: 320px 1fr 340px` con **cfg panel left** (Identidad/Modelo/Tono/Prompt/Herramientas/Guardrails collapsibles) + **sandbox chat center** (sandbox-hd con modo + persona select + msgs con turns user/agent/trace + composer con prompts-chip + textarea + Enviar red) + **inspector right** (insp-hd + tabs Eventos/Parámetros/Tools/Metrics + insp-body con eventos timeline).

**Implementación structural overview** (`/agentes/page.tsx:1-38` + `layout.tsx:1-131` + `components/metrics-dashboard.tsx:1-331`):
- **Layout tabs** (`layout.tsx:9-12`): solo 2 tabs — "Dashboard" (metrics) + "Configuración" (/config). Mock tiene tabs "Agentes / Sandbox / Historial / Knowledge" pero diferentes de estos dos.
- **Page** (`page.tsx:37`) renderea `<MetricsDashboard initialMetrics={initialMetrics} />` — **zero agent cards, zero grid, zero sandbox**.
- MetricsDashboard (`metrics-dashboard.tsx:1-331`): cards agregados (Conversaciones / Órdenes creadas / Tasa conversión / Handoffs / Sin humano / Tiempo respuesta / Tokens / Ingresos generados / Costo). Pattern: uno-un-agente global en producción, métricas agregadas.
- Configuración route (`/agentes/config`) probablemente tiene el editor real — no auditado en detalle pero definitely no es un grid de agents.

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Topbar editorial v2 | Sí (básico) | PASS | `layout.tsx:25-75` |
| Tabs Agentes/Sandbox/Historial/Knowledge | NO (solo Dashboard/Config) | BLOCK | `layout.tsx:9-12` |
| Toolbar search + chips + sandbox + Nuevo red | NO | BLOCK | N/A |
| Agents grid cards | NO (metrics dashboard en su lugar) | BLOCK | `page.tsx:37` |
| Agent card (avatar/name/role/status/desc/stats/foot) | NO | BLOCK | N/A |
| Status badges (on/paused/draft) | NO | BLOCK | N/A |
| Detail 3-col (cfg/sandbox/inspector) | NO | BLOCK | N/A |
| Prompt preview con serif body | NO (probablemente sí en config, no auditado) | TBD | `/agentes/config` |
| Sandbox chat con turns + trace + composer | NO (existe `/sandbox` route separada) | BLOCK | N/A |
| Inspector con tabs Eventos/Parámetros/Tools | NO | BLOCK | N/A |

**Fidelity estimate: 10%.** El módulo `/agentes` en impl es algo estructuralmente **distinto** al mock. El mock muestra un agents catalog + sandbox. La impl muestra un metrics dashboard del único agente de producción. Esto refleja el estado del producto (hay 1 agente, no N) pero el mock espera N — y el mock es fuente de verdad (D-DASH-08).

**Scope del fix (es el más grande):**
- Decidir si el producto soporta N agentes o 1 agente (blocker negocio/producto, no técnico). Si es 1: el mock no aplica literalmente y hay que documentar por qué se desvía. Si es N (futuro): implementar el grid.
- Si futuro plan: implementar `agents/page.tsx` como grid con agent cards. Cada card requiere: agent avatar, name display, role smallcaps, status badge, desc con em rubric, 4 key-values, 4 stats, foot con last + actions.
- Implementar vista detail 3-col (cfg/sandbox/inspector). Sandbox puede reusar `/sandbox` route component.
- Tabs de agentes: "Agentes" (grid) / "Sandbox" (chat global) / "Historial" (executions) / "Knowledge" (KB manager).

---

### Módulo 5 — Automatizaciones (mock `automatizaciones.html` + impl `/automatizaciones`)

**Mock structural overview** (`automatizaciones.html`:298-872 + CSS 25-290):
- Topbar eyebrow "Módulo · Automatización" + h1 "Automatizaciones" + actions (view controls + Historial + **.btn.red "Nueva automatización"**).
- Tabs bajo topbar (Activas / Pausadas / Borradores / Historial).
- **Workspace 3-col** `grid-template-columns: 280px 1fr 320px`:
  - **autolist LEFT** (línea 57-76): lista de automatizaciones con al-hd (search + filter) + al-body con al-item por automation. Cada item tiene dot status + name + meta mono + count ejec.
  - **canvas CENTER** (línea 78-205): `<div class="canvas">` con canvas-toolbar (zoom/pan/grid/align) + canvas-zoom (- 100% + + fit) + **canvas-inner 1400x1600px con nodes SVG + edges `<path>`**. Nodes son bloques `.node` con icon+label+meta (trigger = rubric, action = indigo, condition = gold). Edges son path SVG con arrowheads.
  - **inspector RIGHT** (línea 207-290): insp-hd con nombre del nodo seleccionado + tabs (Configuración / Variables / Ejecuciones) + insp-body con form del nodo.

**Implementación structural overview** (`/automatizaciones/page.tsx:1-46` + `components/automation-list.tsx:1-1641` + `[id]/editar/page.tsx` con `AutomationWizard`):
- Topbar v2 editorial (`page.tsx:20-33`) con eyebrow "Módulo · automatizaciones" + h1 "Automatizaciones". PASS.
- **NO hay workspace 3-col**. La listing es single-column con folders tree + automation items. NO autolist + canvas + inspector.
- `AutomationList` (`automation-list.tsx:1-1641`) es un **folders + items tree** con drag-and-drop de @dnd-kit, `Input` search, filters por categoría, bulk actions, stats per item. Zero canvas, zero nodos visuales.
- Edit route (`[id]/editar/page.tsx`): renderea `AutomationWizard` que es un **wizard de pasos**: TriggerStep → ConditionsStep → ActionsStep. Formularios, no canvas.
- **Zero nodes/edges/React Flow** en ningún archivo del módulo (grep PASS: `grep -l "ReactFlow" src/app/(dashboard)/automatizaciones/ → empty`).

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Topbar eyebrow + h1 | Sí | PASS | `page.tsx:20-33` |
| Tabs Activas/Pausadas/Borradores/Historial | Parcial (filters por categoría en automation-list) | FLAG | `automation-list.tsx` |
| Actions "Nueva automatización" red | Parcial (existe pero en AutomationList, tokens ok) | FLAG | `automation-list.tsx` |
| Workspace 3-col 280/1fr/320 | NO (single column) | BLOCK | N/A |
| autolist con al-items | Parcial (folders tree, no al-item spec) | FLAG | `automation-list.tsx` |
| **Canvas con nodes + edges** | NO (usa wizard steps) | BLOCK | `automation-wizard.tsx` |
| Canvas-toolbar zoom/pan | NO | BLOCK | N/A |
| Nodes `.node.trigger/.action/.condition` coloreados | NO | BLOCK | N/A |
| Edges SVG con arrowheads | NO | BLOCK | N/A |
| Inspector right panel | NO (wizard inline fields) | BLOCK | N/A |
| Automation stats (ejec, success rate, last) | Parcial (existe en automation-list item) | PASS | `automation-list.tsx` |

**Fidelity estimate: 20%.** El mock promete un flow editor visual (canvas + nodes + edges + inspector). La impl ofrece un folder tree + wizard. Son paradigmas UI distintos. Los tokens editoriales están aplicados correctamente *dentro del paradigma wizard/tree*, pero el paradigma es ajeno al mock.

**Scope del fix (es el segundo más grande, después de Agentes):**
- Decisión producto: ¿el proyecto quiere migrar de wizard → flow editor? Implementar canvas implica agregar una dependencia tipo ReactFlow o @xyflow/react (~80KB) + reestructurar el modelo de datos de trigger/conditions/actions lineales a un DAG con nodes + edges + positions. **Esto es una mega-phase independiente** — no cabe en un "retrofit UI".
- Si no se migra: documentar explícitamente que la impl actual *es la intención del producto* y el mock automatizaciones.html *no* es el target. En ese caso, re-alinear tokens editoriales a fondo en el wizard + automation-list (eso es el ~20% actual). Un D-DASH-08-EXCEPTION pattern.
- Si se migra: plan separado `ui-automatizaciones-flow-editor-migration` con subplans (1) modelo datos, (2) canvas UI, (3) inspector, (4) migración de autos existentes al nuevo modelo.

---

### Módulo 6 — Analytics + Métricas (mock `analytics.html` + impl `/analytics` y `/metricas`)

**Mock structural overview** (`analytics.html`:219-655 + CSS 45-290):
- Topbar editorial + actions (Exportar / Período picker segment 6-way "7d / 30d / 90d / YTD / 12m / custom") + tabs (Resumen / Ventas / Conversaciones / Agentes / Clientes).
- **KPI strip 6-col** (línea 234-265): Conversaciones 12487 +18.4%, Resueltas IA 91% +3.2pts, Tiempo respuesta 1.9s -0.4s, CSAT 4.72 sin cambio, Pedidos 1284 +24.8%, Ingresos $48.2M +31.6%. Cada KPI: label smallcaps / value display 28px / delta mono coloreada.
- **Section main chart** (línea 268-340): rubric "Volumen diario" + h3 + legend (Conversaciones rubric / Periodo anterior verdigris dashed / Pedidos indigo) + **SVG line chart 900x320** con 3 líneas + area + anotación "mié 16 abr · 587 conv · campaña Día del Niño".
- **Two-col section** (línea 343-445):
  - LEFT: "Entrada por canal" — bar-list con 5 rows (WhatsApp orgánico 7412 59.4%, Shopify 2841 22.8%, Campañas 1287 10.3%, Click-to-WhatsApp 742 5.9%, QR 205 1.6%). Bar con fill rubric/verdigris/indigo/gold/ink.
  - RIGHT: "Embudo de ventas" — funnel con 5 stages (01 Contactos 12487 100% / 02 Cotización 6842 54.8% / 03 Pedido 2108 16.9% / 04 Pago 1487 11.9% / 05 Entregado 1284 10.3%).
- Más secciones abajo: cohortes retención + heatmap hora/día + top productos + top agentes (líneas 450-650).

**Implementación structural overview** (`analytics/page.tsx:1-55` + `components/analytics-view.tsx:1-47` + `components/metric-cards.tsx:1-146` + `components/sales-chart.tsx` + `period-selector.tsx`):
- Page (`analytics/page.tsx:44-53`): topbar PLAIN shadcn `<h1 className="text-2xl font-bold">Analytics</h1>` + p muted-foreground. **NO implementa editorial topbar con eyebrow** cuando v2. El `v2` se pasa al AnalyticsView hijo via context, no al topbar.
- AnalyticsView (`analytics-view.tsx:36-46`): `<div className={cn('space-y-6', v2 && 'theme-editorial')}>` + PeriodSelector (align right) + MetricCards + SalesChart.
- MetricCards (`metric-cards.tsx:22-43`): **4 cards, NO 6**. Campos: Total Pedidos / Valor Total / Tasa Conversión / Ticket Promedio. Mock tiene 6 distintos. Incluso cuando v2, son 4 cards numéricos en un grid 2x2.
- SalesChart: usa recharts `<AreaChart>` con una sola serie. Mock tiene 3 series (actual rubric + anterior verdigris dashed + pedidos indigo) + area fill + anotación.
- **NO hay channel bar list** (grep confirma cero `bar-list|bar-row|bar-fill`).
- **NO hay funnel** (grep confirma cero `funnel|stage-bar|embudo`).
- **NO hay cohortes, heatmap, top productos, top agentes**.
- `/metricas` route (`metricas/page.tsx:44-56`): topbar PLAIN shadcn (zero v2 branch), `<h1>Metricas de conversaciones</h1>` + MetricasView. Módulo independiente con su propio charter (new/reopened conversations). No lo cubre el mock analytics.html directamente.

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Topbar editorial con eyebrow "Módulo · analytics" | NO (plain shadcn h1) | BLOCK | `analytics/page.tsx:44-49` |
| Period selector 6-way (7d/30d/90d/YTD/12m/custom) | Parcial (3-way: 7d/30d/90d o similar) | FLAG | `period-selector.tsx` |
| Tabs (Resumen/Ventas/Conversaciones/Agentes/Clientes) | NO | FLAG | N/A |
| KPI strip 6 cards | Parcial (4 cards) | BLOCK | `metric-cards.tsx:22-43` |
| KPI con delta up/down/flat | NO (solo value + icon) | FLAG | `metric-cards.tsx:82-122` |
| Main line chart 3 series + area + anotación | Parcial (1 serie area, sin anotación) | BLOCK | `sales-chart.tsx` |
| Channel bar list 5 rows | NO | BLOCK | N/A |
| Funnel 5 stages | NO | BLOCK | N/A |
| Cohort retention | NO | BLOCK | N/A |
| Heatmap hora/día | NO | BLOCK | N/A |
| Top productos | NO | BLOCK | N/A |
| Top agentes | NO | BLOCK | N/A |
| /metricas tiene topbar editorial | NO (zero v2 branch) | BLOCK | `metricas/page.tsx:44-57` |

**Fidelity estimate: 15%.** Analytics mock es un dashboard rico con ~8 secciones distintas. La impl tiene ~2 (KPI cards 4 + area chart 1). Además el topbar de `/analytics` no pasa a editorial cuando v2, y `/metricas` no tiene nada editorial. Este es un de los módulos con más gap.

**Scope del fix:**
- Topbar `/analytics/page.tsx:44-49`: agregar branch `if (v2) { editorial topbar }`. Mismo patrón que pedidos/tareas/contactos.
- MetricCards: agregar 2 campos más (Resueltas IA % + Tiempo respuesta s + CSAT) — requiere fetch adicional de getAgentMetrics. Rediseñar cards para delta indicator.
- SalesChart: agregar prev-period data fetch + render como segunda serie dashed. Añadir anotación (punto más alto del periodo actual).
- Implementar componente `ChannelBreakdown` con bar list de canales — requiere agregar aggregation query por `source` en conversations/orders.
- Implementar componente `SalesFunnel` con 5 stages hardcoded (Contactos/Cotización/Pedido/Pago/Entregado) y counts derivados de conversations/orders.
- Cohort, heatmap, top products, top agents: son features nuevas — defer a fase posterior o documentar como known gap.
- `/metricas/page.tsx`: agregar branch v2 con topbar editorial.

---

### Módulo 7 — Configuración (mock `configuracion.html` + impl `/configuracion`)

**Mock structural overview** (`configuracion.html`:150-815 + CSS 25-220):
- **Main grid `grid-template-columns: 248px 1fr`** — secondary sidebar de settings + content panel.
- **Secondary sidebar** (línea 28-42): eyebrow + h1 "Configuración" + workspace card (logo ink-1 + name + plan mono) + lista de settings agrupada por gcat ("General / Mensajería / Integraciones / Facturación / Seguridad") con items editorial `a.it` + count/dot indicators.
- **Content panel** (línea 44+): topbar eyebrow ("Perfil del negocio" para la sección activa) + h2 display 30px + saveline ("Último guardado · hace 2 min") + actions (Deshacer / **Guardar rubric red**).
- Body con cards editoriales: `.card` paper-0 + ink-1 border + shadow. Card .hd con h3 display + p ink-3. Card .bd con rows `grid-template-columns: 180px 1fr` (label left + control right). Forms con inputs editorial + hints mono.
- Toggle-rows para switches de feature flags.
- Sección "Equipo" con tabla miembros. "Integraciones" con cards de providers (Shopify/Bold/Wompi connected status). "Facturación" con plan actual + próximo pago + historial.

**Implementación structural overview** (`/configuracion/` — NO layout.tsx, N páginas por feature):
- **NO hay `/configuracion/layout.tsx`** con secondary sidebar. No existe la navegación 248px + content split del mock.
- Cada sub-route es una página independiente:
  - `/configuracion/integraciones/page.tsx:59-96`: topbar editorial con "Datos" eyebrow (no matchea "Módulo · configuracion" del mock). Tabs Shopify/SMS/BOLD con pattern shadcn+tokens. PASS parcial.
  - `/configuracion/whatsapp/page.tsx:39-81`: topbar editorial. Lista de links a sub-settings (Templates/Equipos/Respuestas rápidas/Costos). PASS parcial.
  - `/configuracion/tareas/page.tsx`: TBD pero probablemente similar pattern.
- Sidebar principal tiene dos items: "Equipo" (`/settings/workspace/members`) + "Configuracion" (`/settings`) — ambos apuntan a `/settings/*` NO `/configuracion/*`. **Inconsistencia de rutas**.
- El sidebar del mock NO muestra "Equipo" como item top-level, está bajo Configuración > Equipo.

**Diff table:**

| Elemento del mock | Implementado | Match level | Archivo:línea |
|---|---|---|---|
| Grid 248px secondary sidebar + content | NO | BLOCK | N/A |
| Secondary sidebar eyebrow + h1 + workspace card | NO | BLOCK | N/A |
| Lista de settings gcat-grouped (General/Mensajería/...) | NO | BLOCK | N/A |
| Topbar con eyebrow + saveline + actions | Parcial por página | FLAG | `integraciones/page.tsx:64-77` |
| Eyebrow "Datos" en integraciones vs mock "Módulo · configuracion" | Drift copy | FLAG | `integraciones/page.tsx:68` |
| Card editorial pattern (paper-0/ink-1/shadow) | Parcial (algunas pages) | FLAG | `integraciones/page.tsx:79-186` |
| Row grid 180px label + 1fr control | NO (usa shadcn forms) | FLAG | Varios forms |
| Toggle-row switches editorial | NO | FLAG | Varios |
| Cards providers con connected status | Parcial (Shopify/Bold sí tienen status) | PASS | `integraciones/page.tsx` |
| Routing `/configuracion/*` vs `/settings/*` sidebar | Inconsistencia | FLAG | `sidebar.tsx:114-122` |

**Fidelity estimate: 30%.** Tokens editoriales aplicados en algunas páginas. Pero el paradigma fundamental del mock — el secondary sidebar que hace que configuración "se sienta como un módulo cohesivo" — NO existe. Cada sub-route es una isla.

**Scope del fix:**
- Crear `src/app/(dashboard)/configuracion/layout.tsx` con: secondary sidebar 248px + content area. Sidebar tiene workspace card (fetch getCurrentWorkspace) + lista de sections gcat-grouped (General / Mensajería / Integraciones / Equipo / Facturación) con items que navegan a sub-routes. Content renders `{children}`.
- Consolidar rutas: `/settings/workspace/members` → `/configuracion/equipo/miembros`, `/settings/*` → `/configuracion/*`. Sidebar principal update (`sidebar.tsx:114-122`).
- Alinear eyebrow de cada page a "Módulo · configuracion" + la section name en el h1 (no "Datos" como ahora).
- Cada page: usar `.card` pattern (paper-0 + ink-1 border + shadow) en lugar de `Card` shadcn. Row pattern 180px+1fr para form fields cuando v2. Toggle-row editorial para switches.

---

## Patterns sistémicos (root cause)

### P-1 — Executors aplicaron tokens sobre estructura shadcn, no restructuraron markup

**Evidencia:** 8 archivos revisados tienen patrón `v2 ? className_with_editorial_tokens : className_shadcn` pero mantienen la misma jerarquía JSX (`<Card><CardHeader>...` o `<Sheet><SheetContent>...` o `<Tabs><TabsList><TabsTrigger>`). El mock NO usa esas primitivas — usa `<section class="card">`, `<aside class="drawer">`, `<details><summary>`, tables raw.

**Impacto:** el resultado visual es "editorial-colored shadcn" no "editorial dictionary/paper/Bible". Las proporciones, los paddings defaults (`p-6`), los border-radius (`rounded-lg`), los gaps de shadcn siguen vigentes. El mock quiere paddings granulares (14px, 18px, 32px), radii mínimos (2-4px), borders ink-1 NO paper-4, shadow-stamp (0 1px 0 ink-1) NO default shadow-sm.

**Por qué pasó:** los plans 02-08 (según 01-SUMMARY hasta 09-SUMMARY) tenían must_haves.truths que describían *patterns* editoriales (dictionary-table, kanban-card, form-row) pero los executors los interpretaron como "aplicar tokens". Ningún plan dijo explícitamente "restructurar markup JSX a los elementos `<section>` `<article>` `<aside>` `<details>` raw".

**Remediation rule:** cualquier retrofit debe empezar con una checklist por plan: "para cada componente, el markup usa elementos HTML semánticos del mock (section/article/aside/details/table raw) NO primitivas shadcn (Card/Sheet/Tabs)".

### P-2 — Sidebar categorías + items extras rompen la jerarquía de TODOS los mocks

Todos los 7 mocks muestran el sidebar con 3 categorías (`.cat` divs smallcaps) agrupando 8 items. La impl tiene un flat array de 11 items con items adicionales (SMS, Comandos, Sandbox, Confirmaciones, Equipo, Metricas) que NO aparecen en ningún mock.

**Impacto:** el usuario ve un sidebar "congestionado" con items técnicos (Sandbox, Comandos) intercalados con items comerciales (CRM, WhatsApp). El mock asume una jerarquía limpia. Cuando flag ON, el sidebar editorial se ve mal porque la tipografía serif + spacing amplio NO absorben 11 items planos — están diseñados para 8 items agrupados en 3 secciones.

**Remediation rule:** reagrupar navItems en 3 categorías + mover los 3-4 items "internal tooling" (Comandos, Sandbox, Confirmaciones) a una sección "Admin" collapsible o esconderlos bajo admin role solo.

### P-3 — El paradigma de detail drawer shadcn vs panel persistent del mock

Varios módulos (Tareas, Pedidos, Agentes) tienen mocks con **detail panel persistent a la derecha** (360-420px fijo) que siempre está visible cuando algo está seleccionado. La impl usa `<Sheet>` shadcn que **abre y cierra** como modal overlay.

**Impacto:** cambia el workflow mental del usuario. Panel persistent = "exploro y voy cambiando selección sin cerrar". Sheet overlay = "selecciono, reviso, cierro, selecciono otro, reviso". Más fricción.

**Remediation rule:** cuando el mock muestra un panel persistent, el impl debe usar `grid-template-columns: 1fr 360px` con panel controlado por `selectedItem !== null`. NO Sheet shadcn.

### P-4 — Features faltantes son tratadas como optional, no blocker

Analytics lista 8 secciones en el mock (KPI strip, line chart, channel bars, funnel, cohort, heatmap, top products, top agents). Implementación tiene 2. Plan 07 SUMMARY probablemente describe "KPI cards + line chart" como success — no marca las 6 secciones faltantes como gap.

Pedidos mock tiene KPI strip 4 cards — no implementado. Plan 03 SUMMARY probablemente también omite.

Configuración mock tiene secondary sidebar 248px — no implementado. Plan 08 SUMMARY probablemente omite.

**Remediation rule:** DoD de cada plan debe incluir un "mock coverage check" — tabla explícita con cada sección del mock marcada implemented / deferred / out-of-scope. Sin esto, executors consideran "puse los tokens y las proporciones principales" = done.

### P-5 — D-DASH-08 "mocks como fuente de verdad" no se enforzó en execute

D-DASH-08 dice textual: "Para cada módulo, el mock HTML respectivo es la referencia pixel-perfect. Si el código tiene features no representadas en el mock se preservan con adaptación mínima de tokens". Pero el inverso — si el mock tiene features no en el código, ¿qué pasa? — no se documentó. Los executors optaron por: aplicar tokens donde pudieron, skip features no existentes. El resultado es cosmetic redesign no structural redesign.

**Remediation rule:** update D-DASH-08 (si se hace retrofit) a: "Features del mock que no existen en código DEBEN implementarse (con fixtures tipadas `TODO: conectar con API` cuando no haya endpoint) o documentarse explícitamente en `known-gaps.md` con justificación producto/negocio".

---

## Remediation Plan — recomendación

### Opción A (mínima): Fix inline por módulo

- Scope: ~20-30 commits spread across los 7 módulos. Cada módulo gana un "retrofit commit" que cierra sus top-3 gaps.
- Esfuerzo: ~2-3 días single agent.
- Resultado: fidelity pasa de 35% → ~55%. Los gaps P-1 (markup shadcn) y P-3 (sheet vs persistent panel) persisten.
- Recomendado para: si el usuario acepta "editorial tokens + kanban editorial + topbars editoriales + KPIs estrato" como "editorial enough" y documenta las diferencias.

### Opción B (recomendada): Mega-phase `ui-redesign-dashboard-retrofit`

- Scope: 5-6 plans nuevos siguiendo la estructura del plan original pero con execute guided específicamente por mock coverage checklists.
- Plans sugeridos:
  - **Plan 01: Chrome global** — sidebar con categorías + filtered to 8 items del mock. Aplica a Regla 6 con feature flag sub-setting `ui_dashboard_v2.sidebar_v2`.
  - **Plan 02: CRM hub layout** — agregar `crm/layout.tsx` con tabs + count chips + timestamp. Reorg `/crm/contactos` bajo el nuevo layout.
  - **Plan 03: Pedidos completar** — KPI strip + period chips + Calendario view + column summary rows.
  - **Plan 04: Tareas workspace 3-col** — restructurar task-list a `grid-cols-[1fr_360px]` persistent. Filter chips editoriales. Labels lbl-chip pattern.
  - **Plan 05: Analytics mock coverage** — 6-card KPI strip + multi-series chart + channel bars + funnel. Defer cohort/heatmap/top-products/top-agents a Plan 06 de esta misma mega-phase o post-MVP.
  - **Plan 06: Configuración secondary sidebar** — layout con 248px sidebar + consolidar `/settings/*` → `/configuracion/*`.
  - **Plan 07: Agentes + Automatizaciones decisión producto** — escalate a user: ¿el producto quiere agents grid y flow canvas o seguimos con el paradigma actual? Si cambio, fase separada grande; si stay, aceptar desviación D-DASH-08-EXCEPTION y cerrar.
  - **Plan 08: DoD mock coverage** — para cada módulo, escribir `MOCK-COVERAGE.md` con tabla de secciones del mock × status (implemented/deferred/waived). Enforce en future work.
- Esfuerzo: ~10-14 días single agent, ~5-7 días con paralelización tipo la mega-phase original.
- Resultado: fidelity pasa de 35% → ~75% (agentes + automatizaciones siguen siendo decisiones producto).

### Opción C (nuclear): Rewrite selecto de los 7 módulos desde scratch

- Scope: borrar los v2 branches actuales, re-implementar cada módulo desde el mock-as-HTML, usando `<section>`, `<article>`, `<aside>`, `<details>` raw markup + tailwind tokens.
- Esfuerzo: ~3-4 semanas.
- Resultado: fidelity ~90%. Pero cost altísimo y el código v1 actual se tira.
- Recomendado solo si negocio reportó pérdida de ventas o queja formal de clientes — no el caso acá (flag está OFF, cero impacto).

### Recomendación del auditor

**Opción B.** El gap es sistémico (P-1 a P-5) y meritea una mega-phase estructurada, no un patch. Los tokens editoriales ya aplicados valen la pena preservar (~30% del trabajo) — la mega-phase de retrofit construye encima de ellos.

Antes de iniciar retrofit: **escalate explícito al usuario** sobre los dos módulos problemáticos — Agentes y Automatizaciones. Sus mocks asumen paradigmas UI (agents grid, flow canvas) que no están en el código. Esas son decisiones producto, no UI. Hay que decidir:
1. ¿El producto quiere soportar N agentes? Si sí, roadmap hacia agents grid en `ui-redesign-dashboard-retrofit Plan 07`. Si no, aceptar que `/agentes` se desvía del mock → documentar en handoff como intentional.
2. ¿El producto quiere flow editor para automatizaciones? Si sí, fase separada grande fuera del retrofit. Si no, aceptar que `/automatizaciones` se desvía del mock → documentar.

Sin esas decisiones, el retrofit queda en limbo para esos 2 módulos.

---

## Files Audited

Mocks (fuente de verdad):
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html` (218 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html` (425 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html` (1073 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/agentes.html` (799 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/automatizaciones.html` (872 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/analytics.html` (655 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/configuracion.html` (815 líneas)
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/colors_and_type.css`
- `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/README.md`

Impl (shipped):
- `src/app/(dashboard)/layout.tsx` (66 líneas)
- `src/app/(dashboard)/fonts.ts` (42 líneas)
- `src/components/layout/sidebar.tsx` (357 líneas)
- `src/app/(dashboard)/crm/page.tsx` (5 líneas, redirect)
- `src/app/(dashboard)/crm/contactos/page.tsx` (82 líneas)
- `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx` (349 líneas)
- `src/app/(dashboard)/crm/contactos/components/columns.tsx` (326 líneas)
- `src/app/(dashboard)/crm/pedidos/page.tsx` (54 líneas)
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` (1423 líneas)
- `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (366 líneas)
- `src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx` (~320 líneas)
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` (~900 líneas, spot-checked)
- `src/app/(dashboard)/tareas/page.tsx` (84 líneas)
- `src/app/(dashboard)/tareas/components/task-list.tsx` (~500+ líneas, spot-checked)
- `src/app/(dashboard)/tareas/components/task-kanban.tsx` (142 líneas)
- `src/app/(dashboard)/tareas/components/task-card.tsx` (258 líneas)
- `src/app/(dashboard)/agentes/page.tsx` (38 líneas)
- `src/app/(dashboard)/agentes/layout.tsx` (131 líneas)
- `src/app/(dashboard)/agentes/components/metrics-dashboard.tsx` (331 líneas, spot-checked)
- `src/app/(dashboard)/automatizaciones/page.tsx` (46 líneas)
- `src/app/(dashboard)/automatizaciones/components/automation-list.tsx` (1641 líneas, spot-checked)
- `src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx` (~60 líneas)
- `src/app/(dashboard)/analytics/page.tsx` (55 líneas)
- `src/app/(dashboard)/analytics/components/analytics-view.tsx` (47 líneas)
- `src/app/(dashboard)/analytics/components/metric-cards.tsx` (146 líneas)
- `src/app/(dashboard)/analytics/components/sales-chart.tsx` (~100 líneas, spot-checked)
- `src/app/(dashboard)/metricas/page.tsx` (58 líneas)
- `src/app/(dashboard)/configuracion/integraciones/page.tsx` (100+ líneas, spot-checked)
- `src/app/(dashboard)/configuracion/whatsapp/page.tsx` (106 líneas)

Phase planning (para contexto, no para evidencia structural):
- `.planning/standalone/ui-redesign-dashboard/CONTEXT.md` (144 líneas)
- `.planning/standalone/ui-redesign-dashboard/PLAN.md` (114 líneas)
- `.planning/standalone/ui-redesign-dashboard/{01..09}-SUMMARY.md` (no leídos en detalle — el audit es retroactivo sobre el código shipped, no sobre la intención).

Screenshots: NOT captured — dev server no estaba corriendo durante audit. Audit es code-only structural diff mock-vs-impl. Visual audit completo requiere rodar `pnpm dev` con flag=true en un workspace de QA y comparar lado a lado — esto complementaría pero no reemplaza los findings estructurales de este doc.

---

**Fin del UI-REVIEW.** Esperando decisión del usuario sobre remediation scope (Opción A / B / C) + escalations de módulos Agentes y Automatizaciones.
