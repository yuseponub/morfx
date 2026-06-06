# Standalone: ui-redesign-editorial-shell — Research

**Investigado:** 2026-06-06
**Dominio:** Reskin del chrome global (sidebar + mobile-nav + theme toggle placement) + auditoría dark token-por-token, sobre Next.js 16 App Router / React 19 / Tailwind v4 / next-themes, bajo el flag existente `ui_editorial_v3`. Todo ADITIVO + v3-gated (Regla 6).
**Confianza:** ALTA — el mecanismo de aislamiento, la anatomía del sidebar v2, los puntos de inserción del toggle, y los sets de tokens dark están todos verificados contra el código real. Las decisiones de D-01..D-09 ya están lockeadas; esto NO es selección de librería, es disciplina de scope CSS + port verbatim.

## Summary

Este standalone NO agrega librerías ni cambia lógica. Es la continuación del `ui-redesign-editorial-core` (shipped) y revierte deliberadamente la D-06 del core (que excluyó el sidebar del scope v3). El trabajo es 100% chrome + tokens:

1. **Sidebar v3** — branch `if (v3)` nuevo en `sidebar.tsx`, espejando el patrón ya probado del branch `if (v2)` "Propuesta B". El "handoff sidebar.tsx" referenciado en CONTEXT es en realidad una **copia del sidebar legacy** (sin branch v2) — la fuente de verdad visual real del look editorial del sidebar es **el branch v2 Propuesta B existente** (clases `.sb/.brand/.wm/.sub/.cat/.sb-nav`) + los mocks del design-system. El v3 reusa esas mismas building-blocks pero bajo el scope `.theme-editorial-v3`.
2. **Theme toggle** — ya existe (`theme-toggle.tsx`, next-themes). El provisional vive en el topbar v3 del inbox (`inbox-layout.tsx:214`). Hay que **extenderlo** a los topbars v3 de contactos (`contacts-table.tsx:284`, rama `if (v3)`) y pedidos (`orders-view.tsx:951`, rama `if (v3 && !isEmpty)`). NO va en el sidebar (D-04/D-07).
3. **Mobile nav** — `mobile-nav.tsx` (94 líneas) recibe branch v3-gated reskin coexistiendo con su variante actual.
4. **Auditoría dark** — el bloque `.dark .theme-editorial-v3` (globals.css:1363-1373) **ya es byte-idéntico** al bloque dark de los mocks. La auditoría confirmará match para las 3 pantallas y autorizará los tokens dark del NUEVO sidebar/mobile-nav.

**EL problema central (D-03):** hoy `.theme-editorial-v3` se aplica SOLO en `<main>` (`layout.tsx:76`). El sidebar vive como hermano de `<main>`, FUERA del scope. Para que el sidebar v3 resuelva los tokens v3 sin filtrarse al v2/legacy ni alterar el `<main>` ya vivo, **la recomendación es la Opción B: aplicar `.theme-editorial-v3` al `<aside>` del branch v3 del sidebar** (scope propio, gated por la misma prop `v3` que controla el branch). Ver análisis completo abajo.

**Recomendación primaria:** Branch `if (v3)` en `sidebar.tsx` cuyo `<aside>` lleva la clase `theme-editorial-v3` (Opción B). Pasar `v3={isEditorialV3}` desde `layout.tsx`. Portar las building-blocks del branch v2 al v3 (mismas clases `.sb/.brand/.wm/.sub/.cat/.sb-nav`, ya definidas para el scope legacy — hay que **re-autorizarlas bajo `.theme-editorial-v3`** en globals.css). Extender `<ThemeToggle />` a los 2 topbars v3 faltantes. Reskin v3-gated del mobile-nav. Auditoría dark = diff contra el bloque mock (ya matchea) + autorizar tokens dark del sidebar/mobile-nav nuevos. Verificación Regla 6 vía `git diff` de los rangos no-v3.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** MISMO flag `ui_editorial_v3` (NO flag nuevo). v3 ON = todo editorial junto (contenido ya shipeado + sidebar v3 + mobile nav + dark). Default OFF, fail-closed, SIN migración (sub-key JSONB en `workspaces.settings`).
- **D-02:** Branch `if (v3)` NUEVO en `sidebar.tsx` gated por `ui_editorial_v3`, matcheando el look editorial. COEXISTE byte-frozen con v2 "Propuesta B" (`if (v2)`) y legacy. Espeja el patrón inbox v2/v3.
- **D-03:** El sidebar v3 necesita que `.theme-editorial-v3` (o sus tokens) le apliquen. Hoy el scope vive SOLO en `<main>`. Este standalone revierte D-06 del core. **Mecanismo exacto = lo define research** (este documento). Restricción dura: NO cambiar el render de v2 Propuesta B ni legacy, NO alterar el `<main>` content reskin ya vivo.
- **D-04:** Theme toggle vive en el **topbar de cada módulo v3**, NO en el footer del sidebar. El provisional del inbox v3 se conserva + se extiende a `/crm/contactos` y `/crm/pedidos`, estilizado editorial. El toggle aparece en las 3 pantallas v3 reskineadas.
- **D-05:** `mobile-nav.tsx` (94 líneas) entra en scope — reskin editorial v3 gated, coexistiendo con su variante actual.
- **D-06:** Auditoría dark completa token-por-token (aunque "ya se parece"): 3 pantallas (`.dark .theme-editorial-v3`) + sidebar v3 + mobile nav, vs reference. Corregir divergencias sutiles. Dark mantiene textura OFF (core GAP-04).
- **D-07:** Scope del sidebar = brand/wordmark (logo light/dark), workspace switcher, nav items + categorías, footer de usuario. Toggle NO va en el sidebar.
- **D-08:** Activación per-workspace vía el mismo `UPDATE workspaces SET settings=jsonb_set(...,'{ui_editorial_v3,enabled}','true')`. Sin flag nuevo.
- **D-09:** Byte-frozen obligatorio: branch v2 "Propuesta B" + legacy del sidebar; content reskin v3 ya shipeado (3 pantallas) salvo el ADD del toggle (D-04) y fixes de tokens dark (D-06); inbox v2 legacy de Somnio. Todo nuevo es ADITIVO + v3-gated. Verificable vía grep/`git diff`.

### Claude's Discretion
- Mecanismo CSS exacto del scope en el sidebar (D-03) — **resuelto en este research: Opción B**.
- Estilo editorial fino del toggle en el topbar (D-04) — encajarlo con el chrome editorial.
- Orden/categorías de los nav items del sidebar v3 (seguir el handoff o reusar categorías de la v2 Propuesta B si encajan mejor) — **recomendación: reusar `navCategoriesV2` (4 categorías) — ya validadas contra rutas reales (2026-04-23)**.

### Deferred Ideas (OUT OF SCOPE)
- Reskin de los demás módulos de contenido (Tareas, SMS, Analytics, Agentes, Comandos, Confirmaciones, Equipo, Configuración, Sandbox).
- Toggle de tema en headers de módulos NO reskineados (esos no tienen topbar editorial).
- Activación de v3 en producción (Somnio u otros) — decisión de negocio posterior.
</user_constraints>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| D-02 | Branch `if (v3)` en sidebar.tsx, coexiste byte-frozen con v2 | Anatomía del branch v2 (abajo) + Pattern 1 — el branch v2 es la plantilla exacta a clonar |
| D-03 | Mecanismo CSS del scope v3 en el sidebar | **Pregunta crítica resuelta** — Opción B recomendada con pros/cons + verificación next-themes |
| D-04 | Toggle en topbars v3 (3 pantallas) | Puntos de inserción exactos verificados: inbox (ya), contactos `contacts-table.tsx:284`, pedidos `orders-view.tsx:951` |
| D-05 | Reskin v3-gated del mobile-nav | Estructura actual (Sheet shadcn) + estrategia de branch (abajo) |
| D-06 | Auditoría dark token-por-token | Checklist de tokens (abajo) — el bloque dark ya matchea el mock; el delta real es el sidebar/mobile-nav nuevos |
| D-07 | Brand + switcher + nav + footer; toggle fuera del sidebar | Mapeo handoff→prod (abajo) |
| D-09 | Regla 6 byte-frozen verificable | Estrategia grep/`git diff` con comandos concretos (abajo) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolución del flag `ui_editorial_v3` | Frontend Server (RSC) | Database (`workspaces.settings` JSONB) | `getIsEditorialV3Enabled` ya existe y se lee en `layout.tsx`; fail-closed. Sin cambios. |
| Aplicación del scope `.theme-editorial-v3` al sidebar | Frontend Server (RSC) → Client component | — | `layout.tsx` (RSC) resuelve el flag y pasa `v3` al `<Sidebar>` (client). El `<aside>` del branch v3 lleva la clase (Opción B). |
| Tokens del sidebar/mobile-nav v3 | CSS / globals.css | — | Re-autorizar `.sb/.brand/.wm/.sub/.cat/.sb-nav` (y mobile-nav) bajo `.theme-editorial-v3`. Puro styling. |
| Theme toggle (light/dark/system) | Browser / Client | — | `next-themes` escribe `.dark` en `<html>`; el toggle es un componente existente colocado en topbars. Sin JS nuevo. |
| Dark cascade hacia el sidebar scoped | Browser (CSS cascade) | — | `.dark` en `<html>` (ancestro) + `.dark .theme-editorial-v3` descendant → matchea el `<aside>` scoped igual que matchea `<main>`. |
| Mobile-nav render | Client component | — | Sheet shadcn ya client-side; branch v3-gated por la misma prop. |

## Hallazgos clave sobre las referencias (LEER ANTES DE PLANIFICAR)

1. **El "handoff sidebar.tsx" NO es la referencia visual del look v3.** `handoff/src/components/layout/sidebar.tsx` es un **clon literal del sidebar legacy de prod** (mismo markup shadcn `bg-card`, sin branch v2, sin clases `.sb`). NO usarlo como fuente del diseño editorial. `[VERIFIED: diff conceptual contra src/components/layout/sidebar.tsx líneas 130-272 — idénticos salvo el prop v2]`.

2. **La fuente de verdad real del look editorial del sidebar = el branch v2 "Propuesta B"** ya en prod (`sidebar.tsx:220-396`) + los mocks del design-system (`design_handoff_morfx/mocks/*.html`, clases `.sb/.brand/.wm/.sub/.cat`). El v3 reusa esas mismas building-blocks. `[VERIFIED: globals.css:546-616 define `.theme-editorial .sb/.brand/.wm/.sub/.cat/.sb-nav`]`.

3. **CONTEXT menciona `contacts-table.tsx` y `orders-view.tsx` como topbars v3 — correcto, NO `contacts-view-v2.tsx`.** La rama v3 de contactos renderiza `ContactsTable` (con prop `v3`), cuyo topbar v3 está en `contacts-table.tsx:277-284`. `contacts-view-v2.tsx` es la rama v2 (dashboard-v2), NO v3, y NO debe tocarse. `[VERIFIED: contactos/page.tsx:99-112 `if (v3) return <ContactsTable v3 ... />`]`.

4. **El bloque dark v3 (globals.css:1363-1373) ya es byte-idéntico a los 3 bloques mock** (`.theme-editorial.dark` en crm/conversaciones/pedidos — los tres son iguales). La auditoría dark de las 3 pantallas será mayormente CONFIRMACIÓN. El delta real de D-06 es: (a) los tokens dark del sidebar/mobile-nav NUEVOS, (b) verificar que el grain está OFF en dark (ya está: `--paper-grain:none;--paper-fibers:none;background-image:none`). `[VERIFIED: sed diff globals.css:1363-1373 vs ui_kits/crm/crm-editorial.html:252-259]`.

5. **NO existe referencia upstream para el dark de tokens base.** Ni `morfx-editorial-context.html` (`color-scheme:light` únicamente) ni `handoff/colors_and_type.css` tienen bloque dark. El único reference para dark son los bloques compound `.theme-editorial.dark` de los mocks `ui_kits/`. `[VERIFIED: grep dark en ambos archivos = solo color-scheme:light]`.

## D-03 — Mecanismo CSS del scope v3 en el sidebar (PREGUNTA CRÍTICA)

### Estado actual verificado

```
(dashboard)/layout.tsx:
  <div className={cn(..., isDashboardV2 && 'theme-editorial')}>   ← shell root (lleva 'theme-editorial' SOLO si v2)
    <Sidebar v2={isDashboardV2} />                                ← HERMANO de <main>, sin scope v3
    <main className={cn(..., isEditorialV3 && 'theme-editorial-v3')}>  ← scope v3 SOLO aquí
      {children}
    </main>
  </div>
```

- `.theme-editorial-v3` (globals.css:1031) define tokens + `background-color:var(--bg-app)` + `background-image:var(--paper-grain),var(--paper-fibers)` **directamente sobre el elemento que lleva la clase**.
- `.dark .theme-editorial-v3` (globals.css:1363) es **descendant** — `.dark` en `<html>` (next-themes `attribute="class"`, `app/layout.tsx:34`) + el elemento scoped. Matchea cualquier descendiente de `<html>` que tenga `.theme-editorial-v3`, sea `<main>` o `<aside>`. `[VERIFIED]`.
- NO existe `html:has(.theme-editorial-v3) body` (a diferencia del legacy `html:has(.theme-editorial) body` en globals.css:904). Por eso el fondo v3 hoy se pinta solo dentro de `<main>`, no en el `<body>` global. Relevante para la decisión.

### Las tres opciones, comparadas

#### Opción A — clase en el shell root (wrapper que contiene sidebar + main)
Aplicar `theme-editorial-v3` al `<div className="flex h-screen">` cuando `isEditorialV3`.

- **Pros:** un solo punto de aplicación; el fondo + grain cubren toda la pantalla (incluido el gutter entre sidebar y main); el sidebar hereda tokens automáticamente.
- **Cons (BLOQUEANTES):**
  - **Double-application del grain + tokens.** `<main>` YA lleva `theme-editorial-v3` (no se va a quitar, está vivo). Si el root TAMBIÉN la lleva, el `background-image` (grain SVG) se pinta DOS veces (root + main) → posible doble-densidad de textura sobre el área de contenido. Habría que quitar la clase de `<main>` y moverla al root — pero eso **altera el render del `<main>` content reskin ya vivo** (cambia qué elemento pinta el fondo), violando la restricción dura de D-03.
  - **Blast-radius a los 6 módulos diferidos.** El root envuelve TODO el `(dashboard)`, no solo las 3 pantallas. Los módulos NO reskineados (Tareas, SMS, etc.) recibirían los tokens v3 (background blanco-papel, fuentes) sin tener markup editorial → render roto. Esto es exactamente el Pitfall 6 del core RESEARCH (`ui_dashboard_v2` ya tiene esta deuda al aplicar en el root).
  - **Riesgo de colisión con v2.** Si un workspace tuviera v2 Y v3 simultáneamente, el root llevaría ambas clases — comportamiento no contemplado (aunque hoy son flags independientes).
- **Veredicto:** RECHAZADA por double-application del grain + alterar el `<main>` vivo + blast-radius a módulos diferidos.

#### Opción B — clase en el `<aside>` del branch v3 del sidebar (RECOMENDADA)
El `<aside>` del nuevo branch `if (v3)` lleva su propia clase `theme-editorial-v3`. `<main>` mantiene la suya. Cada uno tiene su scope independiente.

- **Pros:**
  - **Cero cambios al `<main>` vivo** — la clase de `<main>` queda intacta (restricción dura D-03 satisfecha por construcción).
  - **Cero blast-radius** — solo el `<aside>` del branch v3 recibe los tokens. Los 6 módulos diferidos, el v2 Propuesta B y el legacy NO se tocan (cada uno renderiza su propio `<aside>` sin la clase v3).
  - **Dark cascade correcto** — `.dark .theme-editorial-v3` es descendant de `<html>`, así que matchea el `<aside>` scoped igual que matchea `<main>`. `[VERIFIED: ambos son descendientes de <html>.dark]`. Sin reconfigurar next-themes.
  - **Self-gated** — la clase se aplica DENTRO del branch `if (v3) return <aside className="... theme-editorial-v3">`, así que es estructuralmente imposible que se filtre al branch v2 o legacy (esos retornan ANTES, con su propio `<aside>`). El gating es el mismo `if (v3)` que decide el branch.
  - **Espeja exactamente** cómo el inbox v3 aplica el scope vía `<main>` por pantalla — patrón ya probado.
- **Cons (manejables):**
  - El grain del fondo se pinta sobre el `<aside>` también (no solo `<main>`). Esto es DESEABLE para el sidebar editorial (papel continuo), pero hay que verificar que el sidebar v3 quiera grain. **Mitigación:** si el sidebar editorial debe ser plano (sin grain), agregar en el bloque del sidebar v3 una regla que anule `background-image` para el `.sb` (igual que dark ya hace `background-image:none`). El mock legacy `.sb` usa `background:var(--paper-2)` plano — así que el sidebar v3 debe pintar `.sb { background:var(--paper-2) }` que **sobreescribe** el `background-color:var(--bg-app)` del scope; pero el `background-image` (grain) del scope seguiría aplicando al `<aside>` raíz. Recomendación: en la regla `.theme-editorial-v3 .sb` (o en el `<aside>` mismo) declarar `background-image:none;background:var(--paper-2)` para sidebar plano editorial.
  - El gutter de 1px entre sidebar y main (si lo hubiera) no recibe fondo v3 — irrelevante visualmente (los dos elementos son contiguos `flex`).
- **Veredicto:** **RECOMENDADA.** Aislamiento limpio, cero toque al `<main>` vivo, cero blast-radius, dark correcto, self-gated.

#### Opción C — exponer/duplicar los tokens v3 al sidebar vía una clase scoped separada
Crear una clase auxiliar (ej. `.editorial-v3-sidebar`) que solo re-declare los tokens v3 necesarios para el sidebar, sin el `background-image`/grain.

- **Pros:** control fino sobre qué tokens recibe el sidebar; evita el grain por construcción.
- **Cons:** **duplica la fuente de verdad de los tokens** (light + dark) → deuda de mantenimiento; cualquier cambio futuro en la paleta v3 hay que replicarlo en dos lugares; mayor superficie de error en la auditoría dark (D-06 tendría que auditar dos sets). Innecesario dado que Opción B logra el mismo aislamiento reusando el bloque único.
- **Veredicto:** RECHAZADA por duplicación de tokens / deuda. Opción B logra lo mismo sin duplicar.

### Recomendación final D-03: **Opción B**

Aplicar `theme-editorial-v3` al `<aside>` del branch `if (v3)` del sidebar. Justificación:
1. Es el único que **no toca el `<main>` vivo** (restricción dura).
2. Es el único con **cero blast-radius** a los 6 módulos diferidos.
3. El dark descendant `.dark .theme-editorial-v3` lo cubre sin reconfiguración (verificado).
4. Es **self-gated** por el mismo `if (v3)` — imposible filtrarse a v2/legacy.
5. No duplica tokens.

Detalle de implementación: el `<aside>` del branch v3 debe llevar `className="sb theme-editorial-v3 hidden md:flex ..."` (o equivalente con `cn`). Las reglas `.theme-editorial-v3 .sb`, `.theme-editorial-v3 .brand`, etc. se re-autorizan en globals.css (sección Pattern 2). Para sidebar plano editorial, `.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none }` anula el grain del scope sobre el sidebar.

> **Nota de verificación para el plan:** un único screenshot del `<aside>` v3 en light + dark confirma (a) tokens resuelven, (b) no hay grain doble, (c) dark cascade funciona. Y un `git diff` del branch v2/legacy confirma byte-frozen.

## Architecture Patterns

### Diagrama de flujo — aplicación del scope (Opción B)

```
workspaces.settings.ui_editorial_v3.enabled  (JSONB, default false)
            │ (read server-side, fail-closed)
            ▼
  getIsEditorialV3Enabled(workspaceId)   [src/lib/auth/editorial-v3.ts — SIN cambios]
            │
            ▼
  (dashboard)/layout.tsx  (RSC)
   const isEditorialV3 = ...
            │
   ┌────────┴───────────────────────────────────┐
   ▼ pasa v3={isEditorialV3}                     ▼ aplica en <main> (YA EXISTE, vivo)
  <Sidebar v2={isDashboardV2} v3={isEditorialV3}/>   <main className={... isEditorialV3 && 'theme-editorial-v3'}>
            │                                           │
            ▼ branch resolution (client)                ▼
   if (v3)  return <aside className="sb theme-editorial-v3 ...">   content reskin (3 pantallas) — INTACTO
   if (v2)  return <aside className="sb ...">          (byte-frozen, theme-editorial del root)
   else     return <aside className="... bg-card">     (legacy, byte-frozen)
            │
            ▼
  globals.css:  .theme-editorial-v3 .sb/.brand/.wm/.sub/.cat/.sb-nav { ... }   ← NUEVO, re-autorizado
                .dark .theme-editorial-v3 { tokens dark }                       ← YA EXISTE, cubre el <aside>

  next-themes → .dark en <html> (ancestro) → cascada a AMBOS scopes (<main> y <aside>)
```

### Pattern 1: Branch `if (v3)` en sidebar.tsx — clonar la anatomía del branch v2

El branch v2 "Propuesta B" (`sidebar.tsx:220-396`) es la **plantilla exacta** a clonar. Anatomía verificada:

| Building block | Markup actual (v2) | Clase / fuente de datos |
|----------------|--------------------|--------------------------|
| Gating | `if (v2) { ... return <aside className="sb ...">; }` (early-return ANTES del legacy) | prop `v2?: boolean` (default false). v3 agrega prop `v3?: boolean` paralela. |
| Brand / wordmark | `<div className="brand"><div className="wm">morf<b>·</b>x</div><div className="sub">{workspaceSubline}</div></div>` | `.brand/.wm/.wm b/.sub` (globals.css:552-573). Wordmark tipográfico, NO `<img>`. `<b>` = punto rubric. |
| Workspace switcher | `<div className="px-3 py-3" style={borderBottom}><WorkspaceSwitcher .../></div>` | Componente real `WorkspaceSwitcher` (infra preservada — el mock lo omite pero la app lo requiere). |
| Global search | `<div className="px-3 py-3"><GlobalSearch /></div>` | Componente real `GlobalSearch`. |
| Nav items + categorías | `<nav className="sb-nav">{navCategoriesV2.map(cat => <div className="cat">{cat.label}</div> + <ul>...)}</nav>` | `navCategoriesV2` (4 categorías: Operación/Automatización/Análisis/Admin). Clases `.sb-nav/.cat/li a/.active`. Badge inline (`taskBadgeCount`/`automationFailureCount`). |
| Footer de usuario | `<div className="px-4 py-3" style={borderTop}>{avatar inicial + email split + LogOut form}</div>` | Avatar = `<div>` con inicial (no `<Avatar>` shadcn en v2). `logout` server action. |
| Filtrado | helper `filterItem` local (adminOnly + hidden_modules + settingsKey) | Idéntico al `filteredNavItems` del legacy. |

**El v3 reusa todo esto.** La única diferencia vs v2: (1) el `<aside>` lleva ADEMÁS `theme-editorial-v3` (Opción B); (2) los estilos finos pueden ajustarse al look v3 si difieren del v2 (discrecional — pero las clases base `.sb/.brand/...` son las mismas, solo re-autorizadas bajo el scope v3). El theme toggle NO se agrega aquí (D-07).

**Prop signature:**
```ts
// actual:
interface SidebarProps { workspaces?; currentWorkspace?; user?; v2?: boolean }
export function Sidebar({ ..., v2 = false }: SidebarProps) { ... if (v2) return (...); return (legacy); }

// v3 (agregar prop + branch ANTES del v2, o entre v2 y legacy — orden de precedencia a decidir en plan):
interface SidebarProps { workspaces?; currentWorkspace?; user?; v2?: boolean; v3?: boolean }
export function Sidebar({ ..., v2 = false, v3 = false }: SidebarProps) {
  ...
  if (v3) return ( <aside className="sb theme-editorial-v3 hidden md:flex w-64 shrink-0"> ... </aside> )
  if (v2) return ( ... )   // byte-frozen
  return ( ... )           // legacy, byte-frozen
}
```
> **Precedencia:** como los flags son independientes, un workspace podría tener v2 Y v3. Recomendación: `if (v3)` ANTES de `if (v2)` (v3 gana). El plan debe lockear este orden. En la práctica, v3 implica el ecosistema editorial completo, así que tiene precedencia natural.

**Cableado en layout.tsx:** agregar `v3={isEditorialV3}` al `<Sidebar>` (`layout.tsx:67-72`). Una sola línea. NO mover la clase de `<main>` (Opción B).

### Pattern 2: Re-autorizar clases del sidebar bajo `.theme-editorial-v3`

Las clases `.sb/.brand/.wm/.sub/.cat/.sb-nav/.sb-nav li a/.active` están definidas para el scope legacy (`.theme-editorial .sb` etc., globals.css:546-616). Para el v3 hay que **APPEND** las mismas reglas bajo `.theme-editorial-v3 .sb` etc. (NO editar las legacy — Regla 6).

Fuente de verdad de los valores: los mocks `design_handoff_morfx/mocks/*.html` (`.sb/.brand/.wm/.sub/.cat`) que el branch v2 ya portó, o copiar las reglas legacy (globals.css:546-616) renombrando el selector `.theme-editorial` → `.theme-editorial-v3`. Las reglas a portar:

```css
/* APPEND en el bloque .theme-editorial-v3 (después de la línea ~1373) — NUEVO, no editar legacy */
.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none; border-right:1px solid var(--border); display:flex; flex-direction:column }
.theme-editorial-v3 .brand { padding:18px 18px 14px; border-bottom:1px solid var(--ink-1) }
.theme-editorial-v3 .wm { font-family:var(--font-display); font-weight:800; font-size:32px; line-height:1; letter-spacing:-0.02em; color:var(--ink-1) }
.theme-editorial-v3 .wm b { color:var(--rubric-2); font-weight:800 }
.theme-editorial-v3 .sub { font-family:var(--font-sans); font-size:12px; font-weight:500; color:var(--ink-3); margin-top:4px }
.theme-editorial-v3 nav.sb-nav { padding:8px; flex:1; overflow:auto }
.theme-editorial-v3 nav.sb-nav ul { list-style:none; padding:0; margin:0 }
.theme-editorial-v3 nav.sb-nav li a { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:var(--radius-2); font-family:var(--font-sans); font-weight:500; font-size:13px; color:var(--ink-2); text-decoration:none; cursor:pointer }
.theme-editorial-v3 nav.sb-nav li a:hover { background:var(--paper-3); color:var(--ink-1) }
.theme-editorial-v3 nav.sb-nav li a.active { background:var(--paper-0); color:var(--ink-1); border:1px solid var(--ink-1); box-shadow:0 1px 0 var(--border) }
.theme-editorial-v3 nav.sb-nav .cat { font-family:var(--font-sans); font-weight:600; letter-spacing:0.14em; text-transform:uppercase; font-size:10px; color:var(--ink-3); padding:12px 10px 6px }
```
> `.theme-editorial-v3 .sb { background-image:none }` es la clave que evita el grain doble en el sidebar (Opción B con). El `background:var(--paper-2)` plano sobreescribe el `--bg-app` del scope.
> El `.wm img` rule (logo light/dark) YA existe en v3 (globals.css:1176, 1373). Pero el sidebar v3 usa **wordmark tipográfico** (`morf·x` con `<b>`), no `<img>` (igual que v2) — así que la regla `.wm img` es para el caso `<img>` y no aplica si se usa wordmark. Discrecional: el handoff legacy usa wordmark; mantener wordmark.

### Pattern 3: Theme toggle en topbars v3 (D-04)

El componente `ThemeToggle` (`theme-toggle.tsx`) es un dropdown Sun/Moon (light/dark/system). NO necesita cambios funcionales. Solo colocarlo en los 3 topbars v3 dentro de `.actions`. Puntos de inserción verificados:

| Pantalla | Archivo | Estado actual | Acción |
|----------|---------|---------------|--------|
| Conversaciones | `whatsapp/components/inbox-layout.tsx:214` | **YA tiene** `<ThemeToggle />` dentro de `<div className="actions">` (provisional, comentario línea 211-213) | Conservar; quitar el comentario "provisional / irá en el sidebar" que ahora es incorrecto (D-04 lo deja en el topbar). Opcional: estilizar editorial (envolver/clase `.icon-btn`). |
| Contactos | `crm/contactos/components/contacts-table.tsx:284` (rama `if (v3)`, dentro de `<div className="actions">`) | **NO tiene** ThemeToggle (no se importa en contactos) | Importar `ThemeToggle` + insertar en `.actions` del topbar v3 (antes de los botones Importar/Exportar/Crear, o al inicio). |
| Pedidos | `crm/pedidos/components/orders-view.tsx:951` (rama `if (v3 && !isEmpty)`, `<div className="actions">`) | El `<ThemeToggle />` en `orders-view.tsx:1348` está en la rama **NO-v3 / v2** (junto a `ViewToggle` shadcn), NO en el topbar v3 | Insertar `<ThemeToggle />` en el `.actions` del topbar v3 (línea 951). El import ya existe (línea 48). **Verificar también la rama `if (v3 && isEmpty)` (empty state)** — debe tener su propio topbar con toggle si aplica. |

> **Estilo editorial fino (discrecional D-04):** el `ThemeToggle` usa `<Button variant="ghost" size="icon">` shadcn. Dentro de `.actions` (que estiliza `.btn`), puede verse fuera de tono. Opciones para el plan: (a) dejarlo ghost (encaja razonablemente); (b) pasarle `className` para que adopte el look `.icon-btn` editorial (32×32, border `--border`, `--paper-0`). Recomendación: opción (b) para coherencia con el chrome editorial — pero sin tocar el componente `ThemeToggle` base (Regla 6 sobre otros consumidores); usar un wrapper o className.

> **Empty states:** contactos tiene `EmptyState v3` (`contacts-table.tsx:196`) y pedidos tiene rama `if (v3 && isEmpty)`. Verificar en el plan si esos estados muestran topbar (y por tanto necesitan toggle) o no. El inbox no tiene empty-state-sin-topbar.

### Pattern 4: Mobile-nav v3 (D-05)

`mobile-nav.tsx` (94 líneas) es un `<Sheet>` shadcn (side="left", w-64) con `navItems` planos (5 items hardcoded: CRM/WhatsApp/Automatizaciones/Agentes/Configuracion) y logo `<Image>`. Hoy NO recibe ningún flag — es global.

**Estrategia (Regla 6):** el mobile-nav no recibe props de flag actualmente. Para gatear el reskin v3 sin romper el path no-v3:
1. **Threading del flag:** `MobileNav` se renderiza en algún header móvil. Hay que (a) pasarle una prop `v3?: boolean` resuelta donde se monta, o (b) leer el flag vía un context/hook. Verificar dónde se monta `<MobileNav />` (probablemente en un header de página o en el layout). **Pregunta abierta para el plan: el flag se resuelve server-side; `MobileNav` es client. Necesita la prop threaded desde un RSC, igual que `Sidebar` recibe `v2`/`v3` desde `layout.tsx`.** Lo más limpio: renderizar `<MobileNav v3={isEditorialV3} />` donde sea que se monte, y resolver el flag ahí.
2. **Branch v3:** dentro de `MobileNav`, `if (v3) return (<Sheet>... contenido editorial con clase theme-editorial-v3 en SheetContent ...)`. El `<SheetContent>` lleva `theme-editorial-v3` para que los tokens resuelvan (mismo principio Opción B).
3. **Markup editorial:** reusar las clases `.sb-nav/.cat/li a` (o un subset) dentro del Sheet, o un markup simplificado. Considerar usar `navCategoriesV2` para consistencia con el sidebar desktop.
4. **El path no-v3 queda byte-idéntico** (early-return, mismo patrón).

> **Pregunta abierta (alta prioridad para el plan):** localizar TODOS los sitios donde se monta `<MobileNav />` y confirmar que el flag se puede threadear. Si se monta en múltiples páginas, considerar un hook de context (como `useInboxV3`/`DashboardV2Provider` ya existentes) para no repetir la resolución. Hay un `DashboardV2Provider` (`layout.tsx:57`) — evaluar un `EditorialV3Provider` análogo si el threading directo es engorroso.

### Anti-patrones a evitar
- **Aplicar `.theme-editorial-v3` en el shell root** (Opción A) → double-grain + alterar `<main>` vivo + blast-radius. NUNCA.
- **Editar las reglas legacy `.theme-editorial .sb/...`** para "compartir" con v3 → regresión v2 Propuesta B. APPEND bajo `.theme-editorial-v3`, nunca editar el rango legacy.
- **Tocar `contacts-view-v2.tsx`** pensando que es la rama v3 — es la rama v2 (dashboard-v2). La rama v3 es `contacts-table.tsx`.
- **Mover el `<ThemeToggle />` de `orders-view.tsx:1348`** (rama v2/legacy) — eso rompería el toggle de la rama no-v3. AGREGAR uno nuevo en el topbar v3 (línea 951), no mover el existente.
- **Usar el selector compound `.theme-editorial-v3.dark`** en cualquier regla nueva del sidebar/mobile-nav → nunca matchea (next-themes pone `.dark` en `<html>`). Usar siempre descendant `.dark .theme-editorial-v3 ...`.
- **Agregar el toggle al footer del sidebar** → contradice D-04/D-07.
- **Reskin del mobile-nav sin gating** → rompe Regla 6 en el path no-v3.

## Don't Hand-Roll

| Problema | NO construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Theme toggle | Nuevo dropdown light/dark | `theme-toggle.tsx` existente (next-themes) | Ya funcional; solo colocarlo (D-04). |
| Resolución del flag | Nuevo flag/columna/context | `getIsEditorialV3Enabled` existente + prop threading | Ya existe, fail-closed, sin migración (D-01/D-08). |
| Branch coexistencia | Nuevo componente sidebar | Branch `if (v3)` espejando `if (v2)` | Patrón probado (v2 Propuesta B + inbox v2/v3). |
| Tokens dark | Inventar paleta dark nueva | Bloque `.dark .theme-editorial-v3` existente (ya matchea mock) | Ya transcrito verbatim del mock; la auditoría confirma, no reinventa. |
| Categorías nav | Nuevo ordenamiento de items | `navCategoriesV2` (4 categorías validadas) | Ya mapeadas a rutas reales (2026-04-23). |
| Tokens del sidebar | Nuevos custom properties | Re-autorizar `.sb/.brand/.wm/...` bajo `.theme-editorial-v3` | Mismas reglas que legacy/v2, solo renombrar selector. |

**Key insight:** todo el riesgo es disciplina de scope CSS (Opción B) + port verbatim de building-blocks que YA existen en el branch v2. No se construye nada nuevo de fondo.

## Auditoría Dark — checklist token-por-token (D-06)

**Reference de dark:** los bloques compound `.theme-editorial.dark` de los mocks (`ui_kits/{crm,conversaciones,pedidos}/*.html`) — los tres son idénticos. NO hay otra fuente (design-system HTML y colors_and_type.css son light-only).

**Estado actual del bloque `.dark .theme-editorial-v3` (globals.css:1363-1373) vs mock:**

| Token | globals.css:1363-1373 (actual) | Mock `.theme-editorial.dark` | Match? |
|-------|-------------------------------|------------------------------|--------|
| `--bg-app` | `oklch(0.215 0.006 60)` | `oklch(0.215 0.006 60)` | ✅ |
| `--bg-sidebar` | `oklch(0.215 0.006 60)` | `oklch(0.215 0.006 60)` | ✅ |
| `--paper-0..4` | `0.255 / 0.235 / 0.285 / 0.315 / 0.355` (croma 0.006-0.009, hue 60) | idénticos | ✅ |
| `--ink-1..5` | `0.95 / 0.86 / 0.70 / 0.56 / 0.42` (hue 85→70) | idénticos | ✅ |
| `--border` | `oklch(0.37 0.008 70)` | `oklch(0.37 0.008 70)` | ✅ |
| `--rubric-2` | `oklch(0.64 0.11 30)` | `oklch(0.64 0.11 30)` | ✅ |
| `--rubric-1` | `oklch(0.72 0.10 30)` | `oklch(0.72 0.10 30)` | ✅ |
| `--paper-grain` | `none` | `none` | ✅ |
| `--paper-fibers` | `none` (extra vs mock) | (no declarado) | ✅ superset correcto (apaga la fibra del scope v3 light) |
| `background-image` | `none` | (mock no lo declara) | ✅ correcto (anula grain+fibers del scope light) |
| `.wm img` dark rule | `mix-blend-mode:screen;filter:invert(1) hue-rotate(180deg)` | idéntico | ✅ |

**Conclusión de la auditoría de las 3 pantallas:** el bloque dark v3 **YA es fiel** al mock. La auditoría D-06 confirmará esto (no requiere fixes en las 3 pantallas salvo que el screenshot revele algún token NO cubierto por el bloque — ej. `--accent-gold/--accent-verdigris/--accent-indigo/--semantic-*` NO se overridean en dark, heredan los light del scope v3; **verificar si eso se ve bien en dark o necesitan dark-variants**).

**Delta REAL de D-06 (lo que sí requiere trabajo):**
1. **Tokens dark del sidebar v3 nuevo** — como el sidebar usa los mismos tokens del scope (`--paper-*/--ink-*/--border/--rubric-2`), el bloque dark existente los cubre automáticamente (cascade). Verificar por screenshot del `<aside>` en dark.
2. **Tokens dark del mobile-nav v3 nuevo** — idem, cubierto por cascade si el `<SheetContent>` lleva `theme-editorial-v3`.
3. **Acentos no-overrideados en dark** — `--accent-gold/--accent-verdigris/--accent-indigo`, `--semantic-success/warning`, `--paper-shadow`, `--shadow-*` NO tienen override dark. Auditar si en dark se ven bien (los kanban dots, tags gold/indigo/verdigris, sombras). Si algún acento queda ilegible sobre el charcoal, agregar override dark. **Esto es lo que el "ya se parece pero auditemos" del usuario probablemente busca.**
4. **Textura OFF en dark** — ya correcto (`--paper-grain:none;--paper-fibers:none;background-image:none`). Confirmar visualmente.

**Checklist accionable para el plan (cada item → tarea de verificación):**
- [ ] Screenshot dark de las 3 pantallas → confirmar paleta charcoal-warm fiel al mock.
- [ ] Screenshot dark del sidebar v3 → tokens resuelven, sin grain, contraste ink/paper OK.
- [ ] Screenshot dark del mobile-nav v3 (Sheet abierto) → idem.
- [ ] Auditar acentos (gold/verdigris/indigo) sobre charcoal: ¿legibles? Si no, agregar override dark.
- [ ] Auditar `--semantic-success/warning` (badges, dots) en dark.
- [ ] Auditar sombras (`--shadow-card` etc.) en dark — las sombras light pueden desaparecer sobre charcoal; evaluar si necesitan dark-variant.
- [ ] Confirmar grain OFF (visual) + `.wm img` (si se usa `<img>`; el wordmark tipográfico no aplica).

## Common Pitfalls

### Pitfall 1: Confundir `contacts-view-v2.tsx` con la rama v3
**Qué sale mal:** se edita `contacts-view-v2.tsx` para agregar el toggle → no aparece en v3 (esa es la rama dashboard-v2) y se rompe v2.
**Cómo evitar:** la rama v3 de contactos es `contacts-table.tsx` (prop `v3`), topbar en línea 277-284. `[VERIFIED: contactos/page.tsx:99]`.
**Señal de alarma:** el toggle no aparece con `ui_editorial_v3=true` pero sí con `ui_dashboard_v2=true`.

### Pitfall 2: Mover el ThemeToggle existente de orders-view en vez de agregar uno nuevo
**Qué sale mal:** `orders-view.tsx:1348` tiene un `<ThemeToggle />` en la rama v2/legacy. Si se mueve al topbar v3, la rama no-v3 pierde su toggle.
**Cómo evitar:** AGREGAR uno nuevo en el `.actions` del topbar v3 (línea 951), dejar el de 1348 intacto.

### Pitfall 3: Selector dark compound nunca matchea
**Qué sale mal:** una regla nueva del sidebar/mobile-nav escrita como `.theme-editorial-v3.dark .sb {...}` no aplica en dark.
**Por qué:** next-themes pone `.dark` en `<html>`, no en el `<aside>`/`<main>` scoped. `[VERIFIED: app/layout.tsx:34]`.
**Cómo evitar:** siempre descendant `.dark .theme-editorial-v3 .sb {...}`. Pero ojo: los tokens ya los cubre el bloque `.dark .theme-editorial-v3` global — solo escribir reglas dark específicas si un componente del sidebar necesita un valor que NO sea un token (raro).

### Pitfall 4: Double-grain por aplicar el scope en el root (Opción A)
**Qué sale mal:** `background-image` (grain SVG) se pinta dos veces (root + main) → textura doble sobre el contenido; y mover la clase fuera de `<main>` altera el render vivo.
**Cómo evitar:** Opción B (clase en el `<aside>` del branch v3). Para que el sidebar quede plano: `.theme-editorial-v3 .sb { background-image:none; background:var(--paper-2) }`.

### Pitfall 5: Editar el rango legacy en globals.css
**Qué sale mal:** tocar `.theme-editorial .sb/.brand/...` (globals.css:546-616) o el bloque legacy (1..1012) → regresión del v2 Propuesta B (vivo en workspaces dashboard-v2) o del inbox v2 (vivo en Somnio).
**Cómo evitar:** APPEND las reglas v3 después de la línea ~1373. `git diff` del rango legacy debe ser vacío.
**Señal:** cualquier hunk de diff tocando selectores `.theme-editorial ` (con espacio) o `html:has(.theme-editorial)`.

### Pitfall 6: Mobile-nav flag no threadeado
**Qué sale mal:** `MobileNav` es client y hoy no recibe flag; intentar leer el flag server-side dentro de él falla.
**Cómo evitar:** threadear `v3={isEditorialV3}` desde el RSC donde se monta `<MobileNav />`, o usar un context (`EditorialV3Provider` análogo al `DashboardV2Provider`). Localizar todos los sitios de montaje en Wave 0.

### Pitfall 7: Precedencia v2 vs v3 indefinida
**Qué sale mal:** un workspace con ambos flags ON → branch ambiguo.
**Cómo evitar:** lockear el orden `if (v3)` ANTES de `if (v2)` en el plan. v3 gana (ecosistema editorial completo).

### Pitfall 8: SSR/hydration flash del sidebar
**Qué sale mal:** el `<aside>` v3 con tokens claros parpadea a dark (o viceversa) en el primer paint.
**Por qué:** next-themes resuelve el tema client-side; el primer SSR no conoce `.dark`.
**Cómo evitar:** es el mismo comportamiento que ya tiene el `<main>` v3 vivo (sin reportes de flash). El `suppressHydrationWarning` ya está en el `<html>` (patrón next-themes estándar). No introducir nada nuevo; replicar el patrón del `<main>`.

### Pitfall 9: pnpm-only (si por algún motivo se instala algo)
**Qué sale mal:** instalar con `npm` desincroniza `pnpm-lock.yaml` → deploys rotos. `[VERIFIED: MEMORY whatsapp_crm_read_latency — 4 deploys rotos]`.
**Cómo evitar:** este standalone NO debería requerir deps nuevas (solo CSS + JSX). Si surgiera, `pnpm add`.

## Code Examples

### layout.tsx — pasar v3 al sidebar (Opción B, una línea)
```tsx
// (dashboard)/layout.tsx — isEditorialV3 YA se resuelve (líneas 43-45). Solo agregar la prop:
<Sidebar
  workspaces={workspaces}
  currentWorkspace={currentWorkspace}
  user={user}
  v2={isDashboardV2}
  v3={isEditorialV3}   // ← NUEVO. La clase theme-editorial-v3 la pone el <aside> del branch v3 (NO el root, NO <main> extra).
/>
// <main> queda EXACTAMENTE igual (isEditorialV3 && 'theme-editorial-v3') — NO tocar (D-03 restricción dura).
```

### sidebar.tsx — branch v3 (esqueleto, clonando v2)
```tsx
if (v3) {
  // mismo filterItem + workspaceSubline que v2
  return (
    <aside className="sb theme-editorial-v3 hidden md:flex w-64 shrink-0">  {/* ← Opción B: scope en el <aside> */}
      <TooltipProvider>
        <div className="brand">
          <div className="wm">morf<b>·</b>x</div>
          <div className="sub">{workspaceSubline}</div>
        </div>
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <WorkspaceSwitcher workspaces={workspaces} currentWorkspace={currentWorkspace} />
        </div>
        <div className="px-3 py-3"><GlobalSearch /></div>
        <nav className="sb-nav">
          {navCategoriesV2.map(category => { /* idéntico a v2: .cat + <ul> + badges */ })}
        </nav>
        {user && ( /* footer usuario — idéntico a v2, SIN ThemeToggle (D-07) */ )}
      </TooltipProvider>
    </aside>
  )
}
// if (v2) { ... }   ← byte-frozen
// return ( legacy )  ← byte-frozen
```

### globals.css — APPEND reglas sidebar v3 (después de ~línea 1373)
```css
/* ===== Sidebar v3 (standalone ui-redesign-editorial-shell, D-02/D-03) =====
 * APPEND ONLY. Las reglas legacy .theme-editorial .sb/... (546-616) y el
 * bloque legacy (1..1012) quedan BYTE-FROZEN. background-image:none en .sb
 * evita el grain doble del scope (Opción B). */
.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none; border-right:1px solid var(--border); display:flex; flex-direction:column }
.theme-editorial-v3 .brand { padding:18px 18px 14px; border-bottom:1px solid var(--ink-1) }
.theme-editorial-v3 .wm { font-family:var(--font-display); font-weight:800; font-size:32px; line-height:1; letter-spacing:-0.02em; color:var(--ink-1) }
.theme-editorial-v3 .wm b { color:var(--rubric-2); font-weight:800 }
.theme-editorial-v3 .sub { font-family:var(--font-sans); font-size:12px; font-weight:500; color:var(--ink-3); margin-top:4px }
.theme-editorial-v3 nav.sb-nav { padding:8px; flex:1; overflow:auto }
.theme-editorial-v3 nav.sb-nav ul { list-style:none; padding:0; margin:0 }
.theme-editorial-v3 nav.sb-nav li a { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:var(--radius-2); font-family:var(--font-sans); font-weight:500; font-size:13px; color:var(--ink-2); text-decoration:none; cursor:pointer }
.theme-editorial-v3 nav.sb-nav li a:hover { background:var(--paper-3); color:var(--ink-1) }
.theme-editorial-v3 nav.sb-nav li a.active { background:var(--paper-0); color:var(--ink-1); border:1px solid var(--ink-1); box-shadow:0 1px 0 var(--border) }
.theme-editorial-v3 nav.sb-nav .cat { font-family:var(--font-sans); font-weight:600; letter-spacing:0.14em; text-transform:uppercase; font-size:10px; color:var(--ink-3); padding:12px 10px 6px }
/* Dark: cubierto por el bloque .dark .theme-editorial-v3 global (tokens). No requiere reglas extra salvo casos no-token. */
```

### Topbar v3 — agregar toggle (contactos / pedidos)
```tsx
// contacts-table.tsx (rama if (v3), dentro de <div className="actions">, ~línea 284):
import { ThemeToggle } from '@/components/layout/theme-toggle'
// ...
<div className="actions">
  <ThemeToggle />   {/* ← NUEVO (D-04). Opcional: wrapper con look .icon-btn editorial */}
  <button type="button" className="btn" onClick={() => setImportDialogOpen(true)}>Importar</button>
  {/* ... resto ... */}
</div>

// orders-view.tsx (rama if (v3 && !isEmpty), <div className="actions"> ~línea 951):
// import ya existe (línea 48)
<div className="actions">
  <ThemeToggle />   {/* ← NUEVO en el topbar v3 (NO mover el de la línea 1348, que es v2/legacy) */}
  <button type="button" className="btn" onClick={handleExport}>Exportar</button>
  <button type="button" className="btn pri" onClick={() => setFormSheetOpen(true)}>Crear pedido</button>
</div>
```

### Activación (manual, post-QA — sin migración, D-08)
```sql
UPDATE workspaces
SET settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{ui_editorial_v3,enabled}','true'::jsonb,true)
WHERE id = '<workspace-uuid>';
-- rollback: mismo con 'false'.
```

## Runtime State Inventory

> Reskin CSS + markup. No hay rename/migración de datos.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | El flag `ui_editorial_v3.enabled` ya existe como sub-key JSONB en `workspaces.settings` (lo usa el core shipeado). Ningún dato nuevo. | Ninguna — activación manual SQL ya documentada (D-08). |
| Live service config | Ninguna — el flag es DB-stored UI, sin cron/webhook/servicio externo. | Ninguna — verificado: solo `getIsEditorialV3Enabled` lo lee. |
| OS-registered state | Ninguna. | Ninguna. |
| Secrets/env vars | Ninguna. | Ninguna. |
| Build artifacts | Ninguna — CSS/JSX, sin paquete compilado. | Ninguna. |

## Environment Availability

> Phase de código/CSS puro, sin dependencias externas nuevas.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| next-themes | Theme toggle / dark | ✓ | ^0.4.6 | — |
| Fonts (EB Garamond/Inter/JetBrains Mono) | Tipografía editorial | ✓ | next/font (D-03) | — |
| Dev server :3020 | QA visual | ✓ | — | — |
| pnpm | install (si hiciera falta) | ✓ (repo pnpm-only) | — | NUNCA npm |
| Playwright | Screenshot dark (opcional, reuso del harness del core) | ✓ | ^1.59.1 | QA manual con toggle in-app |

**Missing dependencies:** ninguna. Este standalone no agrega librerías.

## Validation Architecture

> `.planning/config.json` no confirma `workflow.nyquist_validation:false`. La validación primaria de este reskin es **visual** (fidelidad del chrome + paleta dark) + **estática** (Regla 6 byte-frozen). No hay lógica nueva testeable más allá del threading del flag (ya cubierto por el core).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright `@playwright/test` ^1.59.1 (visual, reuso del harness del core) + QA visual manual con toggle in-app |
| Config file | `playwright.config.ts` (baseURL `localhost:3020`) |
| Quick run command | `pnpm typecheck` (por commit) |
| Full suite command | QA visual manual de sidebar/mobile-nav/toggle en light+dark + `git diff` gate Regla 6 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-02 | Branch v3 renderiza; v2/legacy byte-frozen | static gate | `git diff` muestra solo branch v3 + APPEND (v2/legacy sin cambios) | ✅ git |
| D-03 | Sidebar v3 resuelve tokens (light+dark), sin filtrar a v2/legacy | visual | Screenshot `<aside>` v3 light+dark + screenshot v2/legacy sin cambios | ❌ QA manual |
| D-04 | Toggle visible en los 3 topbars v3 | visual | Screenshot topbar de cada pantalla v3 con el toggle | ❌ QA manual |
| D-05 | Mobile-nav v3 reskineado; path no-v3 byte-frozen | visual + static | Screenshot Sheet v3 + `git diff` del path no-v3 | ❌ QA manual |
| D-06 | Dark fiel al mock (3 pantallas + sidebar + mobile-nav) | visual | Screenshot dark de las 5 superficies vs mock | ❌ QA manual |
| D-09 | Regla 6: branches no-v3 byte-frozen | static gate | comandos `git diff`/grep abajo | ✅ git |

### Sampling Rate
- **Per task commit:** `pnpm typecheck`.
- **Per wave merge:** screenshots light+dark de las superficies tocadas + `git diff` Regla 6.
- **Phase gate:** las 5 superficies (sidebar, mobile-nav, 3 topbars con toggle) fieles en light+dark + branches no-v3 byte-frozen, antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Localizar todos los sitios de montaje de `<MobileNav />` (threading del flag — Pitfall 6).
- [ ] Confirmar precedencia `if (v3)` vs `if (v2)` en sidebar (Pitfall 7).
- [ ] Decidir si los empty-states (contactos/pedidos v3) muestran topbar (→ toggle).
- [ ] (Opcional) extender el harness Playwright del core a screenshots del chrome v3.
- *(Sin framework nuevo — reuso del existente.)*

## Regla 6 — estrategia de verificación (D-09)

**Branches/superficies que DEBEN quedar byte-frozen** (salvo el ADD del toggle en topbars + tokens dark nuevos):
1. Branch v2 "Propuesta B" del sidebar (`sidebar.tsx:220-396`).
2. Branch legacy del sidebar (`sidebar.tsx:398-591`).
3. Bloque legacy `.theme-editorial` (globals.css 1..1012) + reglas `.theme-editorial .sb/...` (546-616).
4. Content reskin v3 de las 3 pantallas (salvo ADD del toggle + fixes de tokens dark).
5. Inbox v2 legacy de Somnio (`.theme-editorial` vía `ui_inbox_v2`).
6. Path no-v3 del mobile-nav.

**Comandos concretos:**
```bash
# 1. El bloque legacy de globals.css NO cambió (rango 1..1012):
git diff HEAD -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]' && echo "ALERTA: tocaste legacy" || echo "OK legacy frozen"
# (las adiciones legítimas son .theme-editorial-v3 — con guion; el grep busca .theme-editorial SIN guion seguido)

# 2. El branch v2 del sidebar no cambió (líneas ~220-396). Inspección dirigida:
git diff HEAD -- src/components/layout/sidebar.tsx
#   → verificar que los hunks sean SOLO: nueva prop v3, nuevo branch if(v3), y NADA dentro del if(v2) ni del return legacy.

# 3. No hay selectores dark compound nuevos (.theme-editorial-v3.dark):
grep -n 'theme-editorial-v3\.dark' src/app/globals.css && echo "ALERTA: compound dark" || echo "OK descendant-only"

# 4. El ThemeToggle de orders-view línea ~1348 (rama v2/legacy) sigue ahí (no se movió):
grep -c 'ThemeToggle' src/app/\(dashboard\)/crm/pedidos/components/orders-view.tsx
#   → debe ser >= 2 tras agregar el del topbar v3 (el original + el nuevo).

# 5. contacts-view-v2.tsx (rama dashboard-v2) NO se tocó:
git diff HEAD -- 'src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx'
#   → vacío.

# 6. Las adiciones a globals.css son TODAS bajo .theme-editorial-v3 (sidebar/mobile-nav):
git diff HEAD -- src/app/globals.css | grep -E '^\+\.' | grep -v 'theme-editorial-v3' && echo "ALERTA: regla fuera de scope v3" || echo "OK todo bajo v3"
```

**Prueba conductual:** un workspace con `ui_dashboard_v2=true` (sin v3) renderiza el sidebar v2 Propuesta B exactamente igual que antes; un workspace sin flags renderiza legacy igual. Verificar por screenshot before/after.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El sidebar v3 debe usar wordmark tipográfico (`morf·x` con `<b>`), igual que v2, NO `<img>` | Pattern 1/2 | Bajo — el handoff legacy y el v2 usan wordmark; si el usuario quisiera logo `<img>`, la regla `.wm img` ya existe en v3. Discrecional confirmable en QA. |
| A2 | `navCategoriesV2` (4 categorías) es el ordenamiento deseado para el sidebar v3 | Discretion D | Bajo — ya validadas contra rutas reales; el usuario dio discreción. Si prefiere flat, trivial de cambiar. |
| A3 | El grain debe estar OFF en el sidebar v3 (sidebar plano `--paper-2`) | D-03 / Pattern 2 | Bajo — el mock legacy `.sb` es plano; pero si se desea grain continuo, quitar `background-image:none`. Confirmable en QA visual. |
| A4 | Los acentos no-overrideados en dark (gold/verdigris/indigo/semantic) se ven aceptables o requieren fix puntual | Auditoría Dark | Medio — el bloque dark actual NO los overridea; el screenshot dark dirá si necesitan dark-variants. Esto es precisamente lo que la auditoría D-06 debe resolver. |
| A5 | `<MobileNav />` se puede threadear el flag desde su(s) sitio(s) de montaje | Pattern 4 / Pitfall 6 | Medio — depende de dónde se monte; Wave 0 debe localizarlo. Si se monta en muchos sitios, un context resuelve. |

## Open Questions

1. **Sitios de montaje de `<MobileNav />` y threading del flag.**
   - Lo que sabemos: `MobileNav` es client, no recibe flag hoy; el flag se resuelve server-side.
   - Lo que falta: dónde se monta exactamente (header de página, layout móvil) y cuántos sitios.
   - Recomendación: Wave 0 — `grep -rn 'MobileNav' src/` para localizar; threadear `v3={isEditorialV3}` o introducir `EditorialV3Provider` (análogo a `DashboardV2Provider` ya existente en `layout.tsx:57`).

2. **Precedencia v2 vs v3 en el sidebar.**
   - Lo que sabemos: flags independientes; un workspace podría tener ambos.
   - Recomendación: `if (v3)` antes de `if (v2)`. Lockear en el plan.

3. **Empty-states con topbar (toggle).**
   - Lo que sabemos: contactos (`EmptyState v3`) y pedidos (`if (v3 && isEmpty)`) tienen ramas vacías.
   - Lo que falta: si esas ramas muestran topbar editorial (y por tanto deben llevar el toggle).
   - Recomendación: verificar en el plan; si muestran topbar, agregar toggle ahí también.

4. **Acentos en dark (auditoría D-06).**
   - Lo que sabemos: el bloque dark no overridea gold/verdigris/indigo/semantic/shadows.
   - Recomendación: screenshot dark de kanban (dots) + tags + sombras; agregar dark-variants solo donde haya problema de contraste/legibilidad. NO sobre-ingenierizar si "ya se ve bien".

## Sources

### Primary (HIGH confidence)
- `src/components/layout/sidebar.tsx` (leído completo) — branch v2 Propuesta B (220-396), legacy (398-591), prop `v2`, `navItems`, `navCategoriesV2`.
- `src/components/layout/mobile-nav.tsx` (completo) — Sheet shadcn, 5 navItems planos, sin flag.
- `src/components/layout/theme-toggle.tsx` (completo) — dropdown next-themes light/dark/system.
- `src/app/(dashboard)/layout.tsx` (completo) — resolución `isEditorialV3` (43-45), `<main>` scope (76), `<Sidebar v2=.../>` (71).
- `src/app/globals.css` — bloque v3 (1031-1373), dark v3 (1363-1373), legacy `.theme-editorial .sb/...` (546-616), `html:has(.theme-editorial) body` (904), `.bg-app/.bg-sidebar` legacy (900-901).
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx:196-219` — topbar v3 con `<ThemeToggle />` provisional (214).
- `src/app/(dashboard)/crm/contactos/page.tsx:84-112` — gating v3 → `<ContactsTable v3/>`.
- `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:235-302` — topbar v3 (277-284), sin ThemeToggle.
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:940-959` (topbar v3) + 1348 (ThemeToggle en rama v2/legacy).
- `src/app/layout.tsx:33-38` + `theme-provider.tsx` — next-themes `attribute="class" defaultTheme="system" enableSystem`.
- Mocks dark: `handoff/ui_kits/{crm,conversaciones,pedidos}/*.html` (bloques `.theme-editorial.dark` idénticos, 252-259 / 233-240 / 302-309).
- `.planning/design-system/morfx-editorial-context.html` — light-only (`color-scheme:light`), tokens base.
- `handoff/colors_and_type.css` — light-only, sin bloque dark.
- `.planning/standalone/ui-redesign-editorial-core/RESEARCH.md` — mecanismo de aislamiento, descendant dark, flag sin migración (heredado).

### Secondary (MEDIUM confidence)
- MEMORY (project) — ui_redesign_editorial_core (shipped + QA-passed, flag `ui_editorial_v3` default-OFF), ui_redesign_dashboard_retrofit (origen v2 Propuesta B), whatsapp_crm_read_latency (pnpm-only).
- `handoff/HANDOFF.md` — `.brand height:84.6px`, orden de categorías del sidebar, regla logo dark.

## Metadata

**Confidence breakdown:**
- D-03 mecanismo (Opción B): ALTA — verificado contra `layout.tsx`, el bloque v3, y la cascada dark descendant.
- Anatomía sidebar v2 + mapeo a v3: ALTA — branch v2 leído completo, clases en globals.css confirmadas.
- Puntos de inserción del toggle: ALTA — los 3 topbars v3 localizados con líneas exactas.
- Auditoría dark: ALTA en el diagnóstico (bloque ya matchea el mock), MEDIA en los acentos no-overrideados (requiere screenshot para decidir fixes).
- Mobile-nav threading: MEDIA — la estrategia es clara pero el sitio de montaje exacto es Wave 0.

**Research date:** 2026-06-06
**Valid until:** ~2026-07-06 (stack estable; re-verificar si cambian `sidebar.tsx`, `globals.css` v3 block, o la config next-themes)

## RESEARCH COMPLETE
