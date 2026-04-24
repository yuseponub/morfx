# BRIEF — Refinamiento mock Pedidos (morfx v2.1 editorial retrofit)

**Para:** Claude Design
**De:** equipo morfx + Claude Code (asistente técnico en repo)
**Fecha:** 2026-04-24
**Iteración:** v1 (primera pasada para refinar el `pedidos.html` que ya entregaste en el handoff)

---

## Contexto rápido

El 2026-04-24 shipped el piloto CRM Contactos con **89% functional coverage** vs tu mock `crm.html` (que está en este bundle como `03-crm-validated.html` — úsalo de patrón hermano). El usuario emitió **PASS visual** con 3 ajustes que ya quedaron documentados como D-RETRO-EXCEPTION:

1. **h1 topbar en Inter sans**, NO EB Garamond serif (legibilidad operacional)
2. **Body text default sans**, no serif (shadcn legacy bajo `.theme-editorial` heredaba serif ilegible)
3. **Scrollbar thin overlay** sin track-box (utility `.scrollbar-overlay` ya existe)

Para Pedidos aplicamos la misma filosofía: **raw HTML semantic + clases del mock portadas a globals.css + zero shadcn primitives en el v2 path + legacy preservado byte-identical**.

---

## Archivos en este bundle

| Archivo | Qué es | Cómo usarlo |
|---------|--------|-------------|
| `01-BRIEF.md` (este) | Instrucciones para ti | Léelo entero antes de tocar nada |
| `02-pedidos-baseline.html` | **El mock Pedidos que tú mismo entregaste antes** (425 líneas) | Úsalo como punto de partida. Refínalo según las secciones abajo. |
| `03-crm-validated.html` | Mock CRM Contactos hermano (ya validated en prod) | **Patrón de estilo heredable.** Clases `.topbar`, `.eye`, `.actions`, `.btn`, `.tabs`, `.toolbar`, `.search`, `.chip`, `table.dict`, `.tg.red/.gold/.indi/.ver` vienen de acá. Reutilizarlas en Pedidos mantiene coherencia. |
| `04-colors_and_type.css` | Tokens editorial v2.1 (paper/ink/rubric + fonts) | **Únicos tokens que puedes usar.** Sin Tailwind, sin shadcn. |
| `05-theme-editorial-current.css` | El bloque `.theme-editorial` ACTUAL en morfx globals.css (692 líneas) | **Qué clases ya existen en producción.** Evita redefinir lo que ya está. Si extiendes, agrega nuevas clases — no dupliques las del CRM. |
| `06-schema-pedidos.sql` | Schema real de Supabase (tablas `pipelines`, `pipeline_stages`, `orders`, `order_products`, `order_tags`, `order_notes`, `order_carrier_events`, `order_states`) | **Data model real.** El mock debe poder mappear cada sección a data que existe. Si inventas un campo que no está en schema, márcalo como `[FEATURE REQUEST]` en un comment. |

---

## Qué debe cubrir el mock Pedidos refinado

### A. Estructura macro (hereda del CRM hub)

```
┌───────────────────────────────────────────────────────────┐
│ SIDEBAR (shared, ya implementado)                         │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ TOPBAR (eye + h1 + 3 actions)                       │   │
│ │ TABS (Contactos / Pedidos · kanban [active] / …)    │   │
│ │ KPI STRIP (NEW — 4-5 KPIs horizontales)             │   │
│ │ TOOLBAR (search + pipeline + period chips + sort +  │   │
│ │          view toggle + timestamp)                    │   │
│ │ PIPELINE TABS (secundarias si hay múltiples pips)   │   │
│ │                                                      │   │
│ │ VISTA PRINCIPAL (switch kanban ↔ tabla):            │   │
│ │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                   │   │
│ │   │ STG │ │ STG │ │ STG │ │ STG │  ← horizontal     │   │
│ │   │ ┌─┐ │ │ ┌─┐ │ │ ┌─┐ │ │     │    scroll        │   │
│ │   │ │C│ │ │ │C│ │ │ │C│ │ │     │                   │   │
│ │   │ └─┘ │ │ └─┘ │ │ └─┘ │ │     │                   │   │
│ │   └─────┘ └─────┘ └─────┘ └─────┘                   │   │
│ │                                                      │   │
│ │   [ORDER SHEET lateral aparece al click en card]    │   │
│ └─────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### B. Topbar (idem CRM — reusa clases)

```html
<header class="topbar">
  <div>
    <div class="eye">Módulo · crm</div>
    <h1>Pedidos <em>— libro de ventas</em></h1>
  </div>
  <div class="actions">
    <button class="btn"><svg/>Importar</button>
    <button class="btn"><svg/>Exportar</button>
    <button class="btn pri"><svg/>Crear pedido</button>
  </div>
</header>
```

`h1` debe ser **Inter sans** (no serif — D-RETRO-EXCEPTION aplicada en CRM piloto, replicar acá).

### C. Tabs CRM hub (reusa)

```html
<nav class="tabs">
  <a href="/crm/contactos">Contactos</a>
  <a href="/crm/pedidos" class="on">Pedidos · kanban</a>
  <a href="#">Pipelines</a>
  <a href="/crm/configuracion">Configuración</a>
</nav>
```

### D. KPI strip (NEW — diseña esto)

4-5 KPI cards horizontales bajo el topbar/tabs, fondo paper-0, border 1px ink-1 o border. Cada KPI:

```
┌─────────────────────┐
│ SMALLCAPS LABEL     │  ← 10px uppercase tracking 0.14em rubric-2
│                     │
│ 2.4M                │  ← 28px sans bold ink-1
│ $ventas hoy         │  ← 12px sans ink-3
└─────────────────────┘
```

Ejemplos de KPIs (derivables del schema, excepto ❓):
- Total pedidos hoy (count orders where created_at ≥ today)
- Valor ventas hoy (sum total_value where created_at ≥ today)
- Ticket promedio (avg total_value)
- Pendientes envío (count where stage.name ilike '%envío%' or carrier is null)
- ❓ Conversion rate (ratio ganado/total en stages terminales)

**Decisión pendiente para ti:** ¿KPIs fijos globales o personalizables por usuario? Propón.

### E. Toolbar (ajustes vs CRM)

```html
<div class="toolbar">
  <div class="search">
    <svg/>
    <input placeholder="Buscar por nombre, tracking, contacto…"/>
  </div>
  <select class="pipeline-select">
    <option>Pipeline principal</option>
    <option>Recompra</option>
  </select>
  <span class="chip on">Hoy · 47</span>
  <span class="chip">7d · 342</span>
  <span class="chip">30d · 1.2k</span>
  <span class="chip">Mes · 580</span>
  <span class="chip">Todos · 3.4k</span>
  <select class="sort"><option>Fecha creación ↓</option>…</select>
  <!-- view toggle Kanban/Tabla -->
  <div class="view-toggle">
    <button class="vt on">▦ Kanban</button>
    <button class="vt">☰ Tabla</button>
  </div>
  <span class="ts">Actualizado 14:32</span>
</div>
```

### F. Kanban board (core — diseña esto bien)

**Estructura:**
```html
<div class="kanban">
  <section class="kstage" data-stage-id="…">
    <header class="kstage-head">
      <span class="dot" style="--dot: #6366f1"></span>
      <h3>Nuevo</h3>
      <span class="count">23</span>
      <span class="wip">Limite: 30</span>  <!-- opcional -->
    </header>
    <div class="kstage-body scrollbar-overlay">
      <article class="kcard">…</article>
      <article class="kcard">…</article>
      …
      <button class="load-more">Cargar más</button>
    </div>
  </section>
  <section class="kstage">…</section>
</div>
```

**Card structure:**
```html
<article class="kcard" data-order-id="…">
  <header>
    <span class="product-type-dots">
      <span class="dot" title="Tangible"></span>
      <span class="dot gold" title="Servicio"></span>
    </span>
    <span class="kcard-name">Elixir del sueño — 60 unid</span>
    <span class="kcard-value">$180.000</span>
  </header>
  <div class="kcard-products">
    📦 Elixir del sueño +2 productos más
  </div>
  <div class="kcard-track">
    🚚 <span class="mono">COORD-ABC123</span> <span class="carrier">COORDINADORA</span>
  </div>
  <div class="kcard-tags">
    <span class="tg red">Cliente</span>
    <span class="tg indi">Recompra</span>
  </div>
  <footer>
    <span class="link-indicator" title="Pedido conectado">🔗</span>
    <span class="kcard-time">Hace 2h</span>
    <span class="kcard-actions">
      <button title="Recompra">↻</button>
      <button title="WhatsApp">💬</button>
      <span class="kcard-city">Bucaramanga</span>
    </span>
  </footer>
</article>
```

Decisiones que tienes que tomar (y dejarnos anotadas inline en el mock):
- Color del `.dot` del stage: ¿respetamos el `color` HEX de `pipeline_stages.color` literal, o lo mapeamos a paleta editorial oklch? (recomendación: mapear para coherencia, pero déjanos un fallback para colors custom)
- `product-type` dots: ¿emoji-based o pure-CSS circle con background? (el HTML actual usa colored dots con `style={{ backgroundColor: dotColor }}`)
- Card hover state: ¿shadow + border-color shift, o paper-0 → paper-1 bg shift?
- Drag state visual: la card original opacity 50% + placeholder editorial (recommend dashed border ink-3 con "Moviendo…" ink-3 texto center)
- WIP limit indicator: ¿rubric-2 warning cuando count > wip_limit, o solo text indicator?

### G. Tabla alternativa (view=table)

Reusa `table.dict` del CRM con columnas:
```
[x] | Pedido | Contacto | Productos | Valor | Stage | Tracking | Fecha | •••
```

Mismo pattern de `.entry`, `.def`, `.ph`, `.city`, `.date`, `.tg` variants.

### H. Order Sheet detail (right-side drawer)

```html
<aside class="sheet" data-open="true">
  <header class="sheet-head">
    <h2>Elixir del sueño — 60 unid</h2>
    <span class="eye">#ORD-00123 · Pipeline principal · Nuevo</span>
    <button class="close">×</button>
  </header>
  <nav class="sheet-tabs">
    <a class="on">Info</a>
    <a>Productos (3)</a>
    <a>Notas (2)</a>
    <a>Tracking</a>
    <a>Historial</a>
    <a>Relacionados</a>
  </nav>
  <div class="sheet-body">
    <!-- Info tab: table.dict con Nombre/Contacto/Pipeline/Stage/Valor/Fecha/Descripción/Custom fields -->
    <!-- Productos tab: lista de order_products con title, SKU, qty, price, subtotal -->
    <!-- Notas tab: lista order_notes con author + timestamp + content (pinned arriba) + textarea nueva nota -->
    <!-- Tracking tab: carrier select + tracking input + timeline order_carrier_events -->
    <!-- Historial tab: timeline order_stage_history (fuera del schema básico — feature actual) -->
    <!-- Relacionados tab: linked_order_id + órdenes derivadas -->
  </div>
</aside>
```

Width ~480px. Slide-in desde derecha. Body scrolls internal.

### I. Selection footer (bulk actions)

Cuando el usuario selecciona N cards via checkbox hover:

```html
<footer class="bulk-footer" data-count="3">
  <span>3 pedidos seleccionados</span>
  <div class="bulk-actions">
    <button>Mover</button>
    <button>Editar</button>
    <button>Exportar</button>
    <button class="destructive">Eliminar</button>
  </div>
</footer>
```

Sticky bottom dentro del area kanban.

---

## Restricciones técnicas (inamovibles)

1. **Raw HTML semantic ONLY.** Zero `<Card>`, `<Sheet>`, `<Tabs>`, `<DataTable>`, `<Dialog>`, `<Select>` shadcn. Native `<button>`, `<input>`, `<select>`, `<details>/<summary>` siempre que alcance.
2. **Zero Tailwind arbitrary values** (`text-[12px]`, `p-[4px]`, etc.) en tu mock. Todo con clases nombradas que luego portamos a `globals.css`.
3. **Font families:** `var(--font-sans)` (Inter) para body + UI + headers; `var(--font-mono)` (JetBrains) para tracking numbers, SKUs, currency en tablas; `var(--font-display)` (EB Garamond) SOLO para brand wordmark si aparece.
4. **Colors:** paper/ink/rubric/border tokens. Nada de `#hexes` hard-coded excepto en comments "/* mock de `pipeline_stages.color` vendrá del DB */" donde aplique.
5. **Responsive:** asume desktop ≥1280px por ahora. Mobile llega en iteración posterior (actualmente out-of-scope).
6. **Dark mode:** el systemic gap está documentado — `.theme-editorial` no soporta dark-mode todavía. Asume light mode only para el mock.

---

## Outputs esperados

1. **`pedidos.html` refinado** — mock HTML self-contained (con `<style>` embebido como el crm.html actual) que cubre A-I arriba.
2. **Inline comments** explicando decisiones: qué campo del schema representa cada sección, qué es mock-data vs real-derived, qué clases son nuevas vs heredadas del CRM.
3. **Sección al final del HTML** `<!-- MOCK_COVERAGE: -->` con checklist estilo yaml:
```
mock_coverage:
  sections:
    - id: topbar
      status: implemented
      mock_lines: "X-Y"
      notes: "Reusa clases .topbar/.eye/.actions del crm.html"
    - id: kpi_strip
      status: implemented  [new design]
      …
    - id: kanban_board
      status: implemented
      …
```
4. **Decisiones locked**: lista al final con tus recomendaciones para las preguntas pendientes (stage colors, product-type dots, drag affordance, WIP warnings, KPI set).

---

## Cómo iteramos (tú + yo + Claude Code)

1. Tú (Claude Design) entregas v1 del mock refinado.
2. El usuario lo guarda en `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html` reemplazando el baseline.
3. El usuario me pide a Claude Code (acá en repo) que revise el mock: yo verifico coherencia técnica, flag constraints, data-schema match. Respondo con "LGTM to implement" o con preguntas/conflictos.
4. Si hay conflictos: el usuario te escribe de vuelta con las observaciones. Iteras v2.
5. Cuando LGTM: arrancamos `/gsd-discuss-phase ui-redesign-dashboard-retrofit` → `/gsd-plan-phase` → `/gsd-execute-phase` para Plan 02 Pedidos.
6. El user mantiene un `ITERATION-LOG.md` (también en este bundle, vacío inicialmente) con cada versión del mock + decisiones tomadas.

**Iteración recomendada:** cambios pequeños. No reescribas todo de una. Refina 1-2 secciones por vuelta para facilitar validación.

---

## Estado actual conocido del módulo (fuera del retrofit — solo para contexto)

- Flag master: `workspaces.settings.ui_dashboard_v2.enabled` (boolean, fail-closed, default false).
- Legacy implementation: `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` (1139 líneas, shadcn Card/Sheet/DataTable). No se toca.
- Nuevo v2: fresh file `orders-view-v2.tsx` o nombre similar — ternary router en el parent page.
- Drag-drop: `@dnd-kit/core` (no se cambia — solo se re-estiliza).
- Search: `Fuse.js` (no se cambia).
- Custom fields JSONB: orden puede tener campos extra configurables por workspace. Muéstralos en Info tab si existen.

---

Eso es todo. Abre `02-pedidos-baseline.html` y empezá a refinarlo. Gracias 🙏
