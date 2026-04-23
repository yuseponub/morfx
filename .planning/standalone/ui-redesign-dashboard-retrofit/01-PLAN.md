---
phase: ui-redesign-dashboard-retrofit
plan: 01
type: execute
wave: 0
depends_on: []
base_commit: c1d841e
files_modified:
  # CSS port (mock → globals.css)
  - src/app/globals.css
  # CRM layout with tabs + topbar editorial
  - src/app/(dashboard)/crm/layout.tsx  # NEW or MODIFY if exists
  - src/app/(dashboard)/crm/page.tsx    # MODIFY (currently redirects to /pedidos)
  # CRM Contactos v2 rewrite (new files; legacy stays)
  - src/app/(dashboard)/crm/contactos/page.tsx                        # MODIFY (ternary router)
  - src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx # NEW
  # Sidebar re-categorización (Propuesta B)
  - src/components/layout/sidebar.tsx   # MODIFY
autonomous: false  # user visual checkpoint required at close

mock_coverage:
  mock_file: .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html
  total_sections: 9
  sections:
    - id: sidebar_shell
      mock_lines: "86-106"
      description: "Aside.sb con brand (wm 'morf·x' + sub 'CRM · Contactos & pedidos') + nav con 3 categorias Propuesta B (NOTE: mock muestra 3, nosotros usamos 4 per D-RETRO-04)"
      status: implemented
      note: "Se extiende a 4 categorias Propuesta B porque el producto tiene 14 items, no 8"
    - id: topbar
      mock_lines: "109-119"
      description: "Topbar con eyebrow 'Módulo · crm' + h1 'Contactos <em>— libro de clientes</em>' + 3 acciones (Importar ghost / Exportar ghost / Crear contacto .btn.pri dark)"
      status: implemented
    - id: tabs
      mock_lines: "120-125"
      description: "Tabs bajo topbar: Contactos (active) / Pedidos · kanban / Pipelines / Configuración — underline 2px ink-1 en active"
      status: implemented
      note: "Tab 'Pedidos · kanban' navega a /crm/pedidos (module separado, retrofit Plan 03 futuro). Tab 'Pipelines' + 'Configuración' stubs con href='#' + onclick toast 'Próximamente' hasta que existan rutas"
    - id: toolbar_contactos
      mock_lines: "128-135"
      description: "Toolbar con search (icon lucide 14px left + input border-radius-3) + 4 count chips (Todos · 248 on / Clientes · 112 / Prospectos · 94 / Mayoristas · 18) + timestamp right 'Actualizado HH:MM'"
      status: implemented
      note: "Counts real-time derivados de tags/query. Si la semántica 'Clientes/Prospectos/Mayoristas' no existe como tag aún, stub counts con 0 y TODO comment citando plan futuro para introducir dichas categorias"
    - id: dict_table
      mock_lines: "136-139"
      description: "table.dict raw con thead (checkbox + Contacto + Teléfono + Ciudad + Etiquetas + Último contacto) + tbody rows con entry serif-bold + ph mono + city ink-3 + tg pills red/gold/indi/ver + date mono ink-3"
      status: implemented
      note: "Reemplaza completamente el DataTable shadcn actual en el v2 path. Columnas: 6 exactas del mock (NO las 8 actuales)"
    - id: row_checkbox
      mock_lines: "137 (th) + 168 (td)"
      description: "Checkbox nativo en cada row + header (select all)"
      status: implemented
    - id: tag_pills
      mock_lines: "59-63 (CSS)"
      description: "Clases .tg + .tg.red / .tg.gold / .tg.indi / .tg.ver con oklch colors exactos del mock"
      status: implemented
      note: "Port a globals.css bajo .theme-editorial. Mapping desde DB tag.category a classname: cliente→red, prospecto→indi, mayorista→ver, vip→gold. Si un tag no matchea las 4 categorias, fallback a .tg sin modifier"
    - id: pedidos_kanban_tab
      mock_lines: "142-150"
      description: "Segundo tab con toolbar de 3 chips periodo + total right + kanban 4-col"
      status: waived
      waive_reason: "Pedidos module tiene su propio retrofit Plan 03 futuro. La tab en CRM solo navega a /crm/pedidos (existing route). No re-implementar el kanban acá"
    - id: pipelines_config_tabs
      mock_lines: "123-124"
      description: "Tabs 'Pipelines' + 'Configuración' en el CRM hub"
      status: deferred
      waive_reason: "Rutas /crm/pipelines y /crm/configuracion no existen en codebase actual. Plan futuro del retrofit abordará. Por ahora: tabs renderean como links deshabilitados con tooltip 'Próximamente'"

requirements:
  - D-RETRO-01  # fresh rewrite
  - D-RETRO-02  # raw HTML
  - D-RETRO-03  # port CSS
  - D-RETRO-04  # sidebar 4 categorias
  - D-RETRO-05  # checkpoint humano al cierre
  - D-RETRO-07  # componentes legacy intactos
  - D-RETRO-08  # mock-coverage checklist

must_haves:
  truths:
    - "`src/app/globals.css` tiene un bloque nuevo `.theme-editorial .wm`, `.sb`, `.brand`, `.cat`, `.topbar`, `.eye`, `.actions`, `.btn`, `.btn.pri`, `.tabs`, `.tabs a.on`, `.toolbar`, `.search`, `.chip`, `.chip.on`, `table.dict`, `.entry`, `.def`, `.ph`, `.city`, `.tg`, `.tg.red/.gold/.indi/.ver` transcritas del mock `crm.html` líneas 9-82. Cada clase preserva paddings, border-radius, colors (oklch exactos), shadows del mock. Verificable con grep: `grep -c '\\.tg\\.red' src/app/globals.css >= 1`"
    - "`src/app/(dashboard)/crm/layout.tsx` existe y renderea cuando `useDashboardV2()===true`: topbar con `.eye`, `.actions` 3 botones + `.tabs` 4 items (Contactos active / Pedidos · kanban / Pipelines / Configuración). El layout wrappea children. Cuando v2=false: no-op (solo pasa children)"
    - "`src/app/(dashboard)/crm/contactos/page.tsx` detecta flag y renderea ternario `v2 ? <ContactsViewV2/> : <ContactsTableLegacy/>` donde ContactsTableLegacy es el componente actual shadcn (preservado intacto)"
    - "`src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx` (NEW) renderea EXCLUSIVAMENTE raw HTML semantic: `<section class=\"page\">` + `<div class=\"toolbar\">` + `<div class=\"search\">` con `<input>` nativo + 4 `<span class=\"chip\">` + span timestamp + `<table class=\"dict\">` con checkbox + 5 columns. Import: Lucide icons OK. Cero imports de `@/components/ui/*`"
    - "`src/components/layout/sidebar.tsx` reorganiza navItems en 4 categorías Propuesta B (D-RETRO-04). Cuando `v2=true` (prop de DashboardV2Provider): renderea con `<div class=\"cat\">` smallcaps dividers arriba de cada grupo. Cuando v2=false: preserva el layout flat actual byte-identical"
    - "`npx tsc --noEmit` pasa clean en TODOS los archivos modificados"
    - "Flag OFF byte-identical al HEAD pre-plan: `git diff HEAD~N HEAD -- src/app/(dashboard)/crm/contactos/` muestra solo el ternary router + el nuevo archivo (legacy no se toca)"
    - "Mock coverage final: 7 de 9 secciones implemented (78%), 1 waived (pedidos_kanban_tab → módulo separado), 1 deferred (pipelines/config tabs → rutas no existen)"
  artifacts:
    - path: "src/app/(dashboard)/crm/layout.tsx"
      provides: "CRM hub editorial layout con topbar + 4 tabs cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx"
      provides: "Raw HTML editorial view de contactos (dict table + toolbar + 4 chips + timestamp)"
      contains: "table class=\"dict\""
    - path: "src/app/globals.css"
      provides: "Editorial CSS classes portadas del mock crm.html"
      contains: ".tg.red"
    - path: "src/components/layout/sidebar.tsx"
      provides: "Sidebar editorial con 4 categorías Propuesta B cuando v2"
      contains: "cat"
  key_links:
    - from: "src/app/(dashboard)/crm/contactos/page.tsx"
      to: "src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx"
      via: "ternary import when v2=true"
      pattern: "ContactsViewV2"
---

<objective>
Plan 01 — Piloto CRM. Fresh rewrite editorial con raw HTML semantic que matchea el mock `crm.html` pixel-perfect. Porta CSS del mock a globals.css. Re-organiza sidebar a 4 categorías Propuesta B. Preserva componentes v2 shipped como legacy (ternary route). Cierra con checkpoint visual humano.

**Purpose:** validar que el nuevo proceso (R-RETRO-01..R-RETRO-05) produce fidelity ≥80% al mock antes de comprometer los 6 módulos restantes.

**Output:** `/crm/contactos` con flag ON se ve idéntico al mock. `/crm` (root) tiene el layout hub con topbar + 4 tabs. Sidebar se ve como el mock con 4 categorías. Mock coverage 7/9 implemented, documented.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard-retrofit/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/UI-REVIEW.md
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/colors_and_type.css
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/README.md
@CLAUDE.md
@.claude/rules/code-changes.md

# Infra shipped previa (reusar tal cual):
@src/lib/auth/dashboard-v2.ts
@src/components/layout/dashboard-v2-context.tsx
@src/app/(dashboard)/fonts.ts
@src/app/(dashboard)/layout.tsx

# Archivos a leer antes de MODIFY:
@src/app/globals.css
@src/components/layout/sidebar.tsx
@src/app/(dashboard)/crm/page.tsx
@src/app/(dashboard)/crm/contactos/page.tsx
@src/app/(dashboard)/crm/contactos/components/contacts-table.tsx

# Shipped editorial v2 actual (será LEGACY después del ternary router):
# NO modificar — preservar intacto durante retrofit
</context>

<tasks>

<task id="1" title="Port mock CSS a globals.css (.theme-editorial scope)">
**Goal:** transcribir el bloque `<style>` del mock `crm.html` a `src/app/globals.css` dentro del `.theme-editorial` scope.

**Actions:**
1. Read `mocks/crm.html` líneas 8-82 — todo el `<style>` block.
2. Read `src/app/globals.css` — localizar el bloque `.theme-editorial { ... }` existente. Localizar el punto de inserción (al final del bloque).
3. Append al `.theme-editorial` scope las siguientes clases con los mismos valores del mock:
   - `.wm`, `.sub` (brand wordmark)
   - `.sb`, `.brand` (sidebar shell — nota: el sidebar global de morfx tiene estructura distinta, estas classes se pueden adaptar o renombrar a `.dash-sb`, `.dash-brand` si hay conflicto con shadcn)
   - `.cat` (category divider — sidebar)
   - `.topbar`, `.eye` (topbar + eyebrow)
   - `h1 em` (italic caption en h1) — scoped bajo `.theme-editorial h1 em`
   - `.pg` (page id mono)
   - `.actions`, `.btn`, `.btn.pri` (botones editorial)
   - `.tabs`, `.tabs a.on` (tabs underline)
   - `.page` (page wrapper con padding 20px 28px)
   - `.toolbar` (flex row con gap 10px)
   - `.search` (search wrapper + input + svg icon)
   - `.chip`, `.chip.on` (count chips)
   - `table.dict`, `table.dict thead th`, `table.dict td`, `table.dict tbody tr:hover`, `table.dict td.entry`, `table.dict td.entry .def`, `table.dict td.ph`, `table.dict td.city`
   - `.tg`, `.tg.red`, `.tg.gold`, `.tg.indi`, `.tg.ver` — usar los valores oklch exactos del mock (líneas 59-63)

   Preservar NOMBRES ORIGINALES del mock. Si colisiona con alguna clase existente en globals.css, renombrar la del retrofit a `.mx-{nombre}` y documentar en el commit message.

4. Verificar: `grep -c '\.tg\.red' src/app/globals.css` ≥ 1; `grep -c 'table\.dict' src/app/globals.css` ≥ 4 (table.dict + thead th + td + tr:hover).

**Commit:** `feat(retrofit-01): port mock CSS de crm.html a globals.css (.theme-editorial scope)`

**Exit criteria:**
- Todas las clases del mock presentes en globals.css scoped correctamente
- `npx tsc --noEmit` clean
- `grep` checks pasan
</task>

<task id="2" title="Sidebar re-categorización Propuesta B">
**Goal:** reorganizar `sidebar.tsx` navItems en 4 categorías cuando v2=true. Legacy sidebar preservado byte-identical cuando v2=false.

**Actions:**
1. Read `src/components/layout/sidebar.tsx` completo.
2. Identificar el `navItems[]` array actual (11 items flat).
3. Crear nueva estructura `navCategoriesV2` type:
```ts
type SidebarCategory = {
  label: string;
  items: Array<{ label: string; href: string; icon: LucideIcon }>;
};
const navCategoriesV2: SidebarCategory[] = [
  { label: 'Operación', items: [
    { label: 'CRM', href: '/crm', icon: Building2 },
    { label: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
    { label: 'Pedidos', href: '/crm/pedidos', icon: Package },
    { label: 'Tareas', href: '/tareas', icon: ListTodo },
    { label: 'Confirmaciones', href: '/confirmaciones', icon: CheckCircle },
    { label: 'SMS', href: '/sms', icon: Smartphone },
  ]},
  { label: 'Automatización', items: [
    { label: 'Automatizaciones', href: '/automatizaciones', icon: Zap },
    { label: 'Agentes', href: '/agentes', icon: Bot },
    { label: 'Comandos', href: '/comandos', icon: Terminal },
  ]},
  { label: 'Análisis', items: [
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Metricas', href: '/metricas', icon: TrendingUp },
  ]},
  { label: 'Admin', items: [
    { label: 'Sandbox', href: '/sandbox', icon: FlaskConical },
    { label: 'Equipo', href: '/settings/workspace/members', icon: Users },
    { label: 'Configuración', href: '/configuracion', icon: Settings },
  ]},
];
```

4. En el JSX, cuando `v2=true`: renderear un `<nav>` con iteración sobre `navCategoriesV2`. Cada categoría emite:
```jsx
<div className="cat">{category.label}</div>
<ul>
  {category.items.map(item => (
    <li key={item.href}>
      <Link href={item.href} className={pathname === item.href ? 'active' : ''}>
        <item.icon width={16} height={16} />
        {item.label}
      </Link>
    </li>
  ))}
</ul>
```
Preservar indicador active, hover paper-3. Preservar el brand wordmark `morf·x` serif.

5. Cuando `v2=false`: preservar el JSX actual intacto (flat list). Verificar con `git diff` que solo el `v2 ? ... : ...` ternary es lo nuevo; el branch legacy es 100% igual al pre-cambio.

6. Validar rutas:
   - `/confirmaciones` — verificar si existe; si no, usar `#` + TODO comment
   - `/sms` — verificar si existe
   - `/comandos` — verificar si existe
   - `/sandbox` — verificar si existe
   - `/settings/workspace/members` vs `/equipo` — usar la ruta REAL existente
   - `/configuracion` vs `/settings` — usar la ruta existente actual
   Si una ruta no existe en el codebase, el item linkea a `#` con `onClick` que muestra toast "Próximamente" (esto evita 404s durante QA).

**Commit:** `feat(retrofit-01): sidebar 4 categorias Propuesta B cuando v2 (D-RETRO-04)`

**Exit criteria:**
- 14 items distribuidos correctamente per Propuesta B
- Flag OFF render preserved byte-identical
- `.cat` dividers con smallcaps uppercase (vía globals.css de Task 1)
- Rutas inexistentes con fallback "Próximamente"
</task>

<task id="3" title="CRM hub layout con topbar + 4 tabs">
**Goal:** crear `src/app/(dashboard)/crm/layout.tsx` con topbar editorial + 4 tabs cuando v2. Modificar `crm/page.tsx` para que deje de redirigir ciegamente.

**Actions:**
1. Check si `src/app/(dashboard)/crm/layout.tsx` existe. Si no, CREATE. Si sí, MODIFY.
2. El layout es Server Component async — resuelve `v2 = await getIsDashboardV2Enabled(...)` igual que el dashboard layout existente.
3. Cuando v2=true: renderea JSX raw:
```jsx
<>
  <header className="topbar">
    <div>
      <div className="eye">Módulo · crm</div>
      <h1>{sectionTitle} <em>— {sectionCaption}</em></h1>
    </div>
    <div className="actions">
      {/* Actions son contextuales por ruta — usar children slot o header slot */}
    </div>
  </header>
  <nav className="tabs">
    <Link href="/crm/contactos" className={pathname === '/crm/contactos' ? 'on' : ''}>Contactos</Link>
    <Link href="/crm/pedidos" className={pathname === '/crm/pedidos' ? 'on' : ''}>Pedidos · kanban</Link>
    <a href="#" onClick={toastComingSoon}>Pipelines</a>
    <a href="#" onClick={toastComingSoon}>Configuración</a>
  </nav>
  <main>{children}</main>
</>
```

Nota sobre `sectionTitle` / actions por ruta: Layout no sabe qué ruta activa es (sin hooks en Server Component). Opciones:
- a) Layout renderea solo la parte estática (tabs + main slot); topbar se mueve a cada page.tsx
- b) Usar `usePathname` → layout debe ser Client Component (`'use client'`)

**Recomendación:** (a) — topbar específico per page (contactos tiene su título "Contactos — libro de clientes", productos tendrá el suyo, etc.). Layout solo provee el chrome de tabs. El topbar se renderea desde cada page.

Entonces el layout v2 es simplemente:
```jsx
<>
  <header className="topbar"><ContextualTopbarSlot/></header> {/* OR omit header */}
  <nav className="tabs">...</nav>
  <main>{children}</main>
</>
```

O más simple: el layout solo provee TABS; el topbar lo pone cada page.tsx que consume `useDashboardV2()`.

**Mi recomendación: approach (a) sin header slot — layout emite solo `<nav class="tabs">` + `<main>`**. Cada page.tsx emite su propio topbar.

4. Cuando v2=false: preservar comportamiento actual (layout no existe o es pass-through). Verificar con git diff.

5. `crm/page.tsx`: sigue redirigiendo a `/crm/contactos` (cambio de default desde /pedidos a /contactos) CUANDO v2=true; cuando v2=false preserva redirect actual. (Alternativa: siempre redirigir a /crm/contactos; esto es un cambio de comportamiento menor, confirmar con user en checkpoint).

**Commit:** `feat(retrofit-01): CRM hub layout con 4 tabs editorial cuando v2`

**Exit criteria:**
- Layout v2 renderea las 4 tabs con active state
- Tab "Pedidos · kanban" navega a /crm/pedidos (módulo existente)
- Tabs "Pipelines" + "Configuración" muestran toast "Próximamente"
- Flag OFF: no-op layout (pass-through children)
- `npx tsc --noEmit` clean
</task>

<task id="4" title="CRM Contactos fresh rewrite (contacts-view-v2.tsx + ternary router)">
**Goal:** crear NEW file `contacts-view-v2.tsx` con raw HTML semantic que matchea pixel-perfect el mock `crm.html` sección "contactos" (líneas 127-140). Modificar `contactos/page.tsx` para routear via ternary.

**Actions:**
1. Read `mocks/crm.html` líneas 127-140 + líneas 155-175 (rows data + render pattern). Este es tu source of truth.
2. Read `contactos/page.tsx` actual para entender los props que recibe (workspaceId, initial contacts, etc.). NO modificar contacts-table.tsx o columns.tsx existentes.
3. CREATE `src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx`:

```tsx
'use client';
// Imports: React, lucide-react icons SOLAMENTE. Cero @/components/ui/*.
import { Search, Upload, Download, Plus } from 'lucide-react';
import Link from 'next/link';
import type { Contact } from '@/lib/types/...'; // reuse existing type

type Props = {
  contacts: Contact[];
  counts: { all: number; clientes: number; prospectos: number; mayoristas: number };
  lastUpdated: string; // ISO
};

export function ContactsViewV2({ contacts, counts, lastUpdated }: Props) {
  // Format lastUpdated: "Actualizado 21 abr, 14:32"
  const formattedTimestamp = formatUpdateTime(lastUpdated);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eye">Módulo · crm</div>
          <h1>Contactos <em>— libro de clientes</em></h1>
        </div>
        <div className="actions">
          <button className="btn"><Upload width={14} height={14}/>Importar</button>
          <button className="btn"><Download width={14} height={14}/>Exportar</button>
          <button className="btn pri"><Plus width={14} height={14}/>Crear contacto</button>
        </div>
      </header>

      <section className="page">
        <div className="toolbar">
          <div className="search">
            <Search width={14} height={14}/>
            <input placeholder="Buscar por nombre, teléfono o ciudad…"/>
          </div>
          <span className="chip on">Todos · {counts.all}</span>
          <span className="chip">Clientes · {counts.clientes}</span>
          <span className="chip">Prospectos · {counts.prospectos}</span>
          <span className="chip">Mayoristas · {counts.mayoristas}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>
            Actualizado {formattedTimestamp}
          </span>
        </div>

        <table className="dict">
          <thead>
            <tr>
              <th style={{ width: 30 }}><input type="checkbox"/></th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Etiquetas</th>
              <th>Último contacto</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id}>
                <td><input type="checkbox"/></td>
                <td className="entry">
                  {c.name}
                  {c.subline && <span className="def">{c.subline}</span>}
                </td>
                <td className="ph">{c.phone}</td>
                <td className="city">{c.city}</td>
                <td>
                  {c.tags.map(tag => (
                    <span key={tag.id} className={`tg ${mapTagCategory(tag)}`}>{tag.name}</span>
                  ))}
                </td>
                <td style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {formatRelativeTime(c.lastContactAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function mapTagCategory(tag: { category?: string }): string {
  switch (tag.category) {
    case 'cliente': return 'red';
    case 'vip': return 'gold';
    case 'prospecto': return 'indi';
    case 'mayorista': return 'ver';
    default: return '';
  }
}
```

NO importa `@/components/ui/*`. NO usa `<Table>`, `<Badge>`, `<Input>`, `<Button>`. SOLO raw HTML + lucide icons + Link de Next.

4. Server-side, en `contactos/page.tsx`:
   - Compute `counts` from contacts data (filter by tag.category)
   - Compute `lastUpdated` from `max(contacts.updated_at)`
   - Read `v2 = await getIsDashboardV2Enabled(workspaceId)`
   - Render ternary:
```tsx
{v2
  ? <ContactsViewV2 contacts={contacts} counts={counts} lastUpdated={lastUpdated}/>
  : <>{/* existing legacy JSX — ContactsTableLegacy + actions preserved intact */}</>
}
```

   Importante: el legacy branch NO se toca. Tal como está hoy shipped. Esto asegura flag OFF byte-identical.

5. Crear helper `formatRelativeTime(date)` in a utility file if needed, OR inline. Output: "hace 3 min", "hace 1 h", "ayer", "20 abr" per mock.

**Commit:** `feat(retrofit-01): contacts-view-v2 raw HTML editorial + ternary router`

**Exit criteria:**
- `grep -c '@/components/ui' src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx` == 0
- `grep -c 'Card\|Sheet\|Tabs\|DataTable\|Dialog' src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx` == 0
- `npx tsc --noEmit` clean
- Página renderea sin errores en dev
</task>

<task id="5" title="Dev server + visual checkpoint (HUMAN)">
**Goal:** spawn dev server, flip flag temporal en workspace QA, validar visualmente `/crm/contactos` con flag ON vs mock `crm.html`.

**Actions:**
1. Commit + push tasks 1-4 a origin/main (Regla 1).
2. Aguardar Vercel build green para el commit de Task 4.
3. **CHECKPOINT HUMANO OBLIGATORIO** — No se procede al cierre sin:
   - Usuario abre la app en un workspace QA (o temporalmente en Somnio con rollback inmediato listo) con `ui_dashboard_v2.enabled=true`
   - Usuario abre `mocks/crm.html` en el navegador local (file://) side-by-side con la página shipped
   - Usuario compara visualmente: sidebar, topbar, tabs, toolbar, table, chips, pills, fonts, spacings
   - Usuario emite verdict: PASS / ISSUES
4. Si PASS → crear 01-SUMMARY.md + marcar mock_coverage actualizado + cerrar plan. El retrofit continúa con Plan 02 (Pedidos) en una sesión futura.
5. Si ISSUES → capturar gaps específicos (qué sección se ve distinta, qué clase CSS faltó, qué padding está off), crear commit de gap-closure inline (sin abrir plan nuevo), repetir checkpoint. NO continuar a Plan 02 hasta PASS.

**Commit (solo después de PASS):** `docs(retrofit-01): Plan 01 SUMMARY — CRM piloto validated by user`

**Exit criteria:**
- Usuario firma visual PASS explícito
- 01-SUMMARY.md creado con mock_coverage actualizado (7/9 implemented confirmed)
- Push final
- Rollback aplicado si se usó Somnio para QA
</tasks>

<success_criteria>
- [ ] Mock CSS portado a globals.css scoped bajo `.theme-editorial` (Task 1)
- [ ] Sidebar Propuesta B con 4 categorías cuando v2, byte-identical cuando !v2 (Task 2)
- [ ] `crm/layout.tsx` con 4 tabs editorial cuando v2 (Task 3)
- [ ] `contacts-view-v2.tsx` con raw HTML semantic pixel-perfect al mock (Task 4)
- [ ] Ternary router en `contactos/page.tsx`; legacy branch intacto (Task 4)
- [ ] `npx tsc --noEmit` clean en todos los archivos modificados
- [ ] CERO imports de `@/components/ui/*` en `contacts-view-v2.tsx`
- [ ] Flag OFF byte-identical al HEAD pre-plan
- [ ] Mock coverage 7/9 implemented (2 waived/deferred with justificación)
- [ ] User visual checkpoint PASS emitido (Task 5)
- [ ] `01-SUMMARY.md` creado + pusheado (Task 5)
- [ ] NO modificaciones a STATE.md / ROADMAP.md (orchestrator)
</success_criteria>

<critical_rules>
- R-RETRO-01: raw HTML semantic ONLY en v2 branches. Cero shadcn primitives.
- R-RETRO-02: port CSS del mock a globals.css, NO inline Tailwind arbitrary emulations.
- R-RETRO-03: mock_coverage checklist poblado al cierre.
- R-RETRO-04: componentes legacy preservados intactos; ternary router en parent.
- R-RETRO-05: visual checkpoint humano antes de cerrar.
- REGLA 6: flag OFF byte-identical. Legacy path nunca se altera.
- REGLA 3: cero cambios a domain/hooks/actions/inngest/agents.
- REGLA 4: `docs/analysis/04-estado-actual-plataforma.md` update se defiere al final del retrofit completo, NO se actualiza per-plan.
- Commits atomicos por task, Spanish, Co-Authored-By Claude.
- NO push a Vercel hasta Task 5 (el push dispara Vercel + habilita QA).
</critical_rules>
