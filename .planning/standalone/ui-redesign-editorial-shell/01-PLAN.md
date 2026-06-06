---
phase: ui-redesign-editorial-shell
plan: 01
type: execute
wave: 1
depends_on: [00]
files_modified:
  - src/components/layout/sidebar.tsx
  - src/app/(dashboard)/layout.tsx
  - src/app/globals.css
autonomous: true
requirements: [D-02, D-03, D-07]

must_haves:
  truths:
    - "Con ui_editorial_v3 ON, el dashboard renderiza un sidebar editorial v3 (wordmark morf·x, workspace switcher, global search, nav por categorías, footer de usuario) bajo el scope .theme-editorial-v3"
    - "El branch v2 'Propuesta B' (sidebar.tsx 220-396) y el legacy (398-591) quedan byte-frozen — git diff solo muestra la prop nueva v3 + el branch if(v3) nuevo"
    - "El <main> de layout.tsx queda intacto (sigue llevando theme-editorial-v3 igual que hoy) — Opción B: el scope lo pone el <aside> del branch v3, NO el root ni un <main> extra"
    - "El sidebar v3 NO tiene ThemeToggle en su footer (D-07) — el toggle vive en los topbars (Plan 02)"
    - "El sidebar v3 es plano (background:var(--paper-2), background-image:none) — sin grain doble"
  artifacts:
    - path: "src/components/layout/sidebar.tsx"
      provides: "Branch if (v3) que clona la anatomía del branch v2 con <aside className='sb theme-editorial-v3 ...'>"
      contains: "if (v3)"
    - path: "src/app/globals.css"
      provides: "Reglas .theme-editorial-v3 .sb/.brand/.wm/.sub/nav.sb-nav re-autorizadas (APPEND, no editar legacy)"
      contains: ".theme-editorial-v3 .sb"
    - path: "src/app/(dashboard)/layout.tsx"
      provides: "Cableado v3={isEditorialV3} al <Sidebar> sin tocar el <main>"
      contains: "v3={isEditorialV3}"
  key_links:
    - from: "src/app/(dashboard)/layout.tsx"
      to: "src/components/layout/sidebar.tsx prop v3"
      via: "<Sidebar v2={isDashboardV2} v3={isEditorialV3} />"
      pattern: "v3=\\{isEditorialV3\\}"
    - from: "src/components/layout/sidebar.tsx branch if (v3)"
      to: ".theme-editorial-v3 .sb en globals.css"
      via: "<aside className='sb theme-editorial-v3 ...'>"
      pattern: "sb theme-editorial-v3"
---

<objective>
Agregar el branch `if (v3)` al sidebar (D-02), aplicar el scope `.theme-editorial-v3` al `<aside>` del branch v3 (D-03, Opción B), cablear `v3={isEditorialV3}` desde `layout.tsx` sin tocar el `<main>`, y APPEND las reglas CSS del sidebar v3 a `globals.css` re-autorizando `.sb/.brand/.wm/.sub/nav.sb-nav` bajo el scope v3. El branch v2 "Propuesta B" y el legacy quedan byte-frozen.

Purpose: hoy el sidebar vive FUERA del scope v3 (el scope vive solo en `<main>`, layout.tsx:76). Este plan revierte deliberadamente la D-06 del core SOLO para el caso v3, vía Opción B (clase en el `<aside>` del branch v3) — el mecanismo que NO toca el `<main>` vivo, NO tiene blast-radius a los 6 módulos diferidos, y es self-gated por el mismo `if (v3)`.
Output: sidebar editorial v3 renderizable bajo el flag, verificado visualmente en Wave 3 (dark audit) + Regla 6 en Wave 4.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/RESEARCH.md
@.planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md

<interfaces>
<!-- Componentes reales que el branch v3 reusa tal cual (ya importados en sidebar.tsx). -->
From src/components/layout/sidebar.tsx (ya en el archivo):
  - WorkspaceSwitcher({ workspaces, currentWorkspace })  — switcher de workspace
  - GlobalSearch()                                        — búsqueda global
  - navCategoriesV2: SidebarCategoryV2[]  — 4 categorías (Operación/Automatización/Análisis/Admin), ya validadas vs rutas reales
  - useTaskBadge() → { badgeCount: taskBadgeCount }
  - useAutomationBadge() → { failureCount: automationFailureCount }
  - logout (server action de '@/app/actions/auth')
  - filterItem / workspaceSubline: helpers locales del branch v2 (replicar idénticos en v3)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar prop v3 + branch if (v3) al sidebar clonando la anatomía del v2 (D-02/D-03/D-07)</name>
  <read_first>
    - src/components/layout/sidebar.tsx (branch v2 COMPLETO 220-396 = plantilla exacta a clonar; prop `v2 = false` en 194; legacy 398-591)
    - .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md (precedencia LOCKEADA: if (v3) ANTES de if (v2))
    - RESEARCH §Pattern 1 (anatomía del branch v2 → v3, prop signature, precedencia) + §Code Examples "sidebar.tsx — branch v3"
  </read_first>
  <action>
    En `src/components/layout/sidebar.tsx`:
    1. Agregar la prop `v3` a la interface y a la firma:
       - Interface `SidebarProps`: agregar `v3?: boolean` (con comentario JSDoc breve: flag `ui_editorial_v3`, Opción B — el `<aside>` lleva `theme-editorial-v3`, byte-frozen el resto).
       - Firma: `export function Sidebar({ workspaces = [], currentWorkspace, user, v2 = false, v3 = false }: SidebarProps)`.
    2. Insertar el branch `if (v3)` JUSTO ANTES del `if (v2)` (línea ~220) — precedencia v3>v2 lockeada en Wave 0.
    3. El branch v3 CLONA verbatim la anatomía del v2 (220-396), con UNA diferencia estructural: el `<aside>` lleva ADEMÁS `theme-editorial-v3` (Opción B). Replicar idénticos:
       - `const filterItem = (item: NavItem): boolean => { ... }` (igual que v2:221-230).
       - `const workspaceSubline = currentWorkspace?.name ? \`${currentWorkspace.name} · CRM\` : 'CRM · Contactos & pedidos'` (igual que v2:232-234).
       - `return ( <aside className="sb theme-editorial-v3 hidden md:flex w-64 shrink-0"> ... </aside> )` — la ÚNICA diferencia vs v2 es agregar `theme-editorial-v3` al className del `<aside>` (Opción B / D-03).
       - Dentro: `<TooltipProvider>` + `<div className="brand"><div className="wm">morf<b>·</b>x</div><div className="sub">{workspaceSubline}</div></div>` (wordmark tipográfico, NO `<img>` — A1 RESEARCH).
       - `<div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}><WorkspaceSwitcher workspaces={workspaces} currentWorkspace={currentWorkspace} /></div>`.
       - `<div className="px-3 py-3"><GlobalSearch /></div>`.
       - `<nav className="sb-nav">{navCategoriesV2.map(category => { ... .cat + <ul> + badges ... })}</nav>` — idéntico al map de v2:265-310 (mismo badge inline rubric-2/mono).
       - Footer de usuario `{user && (<div className="px-4 py-3" style={{ borderTop: '1px solid var(--ink-1)', ... }}> avatar inicial + email split + form action={logout} con LogOut </div>)}` — idéntico a v2:312-392. **SIN ThemeToggle (D-07).**
    4. NO tocar el branch `if (v2)` (220-396) ni el return legacy (398-591) — byte-frozen (Regla 6 / D-09).
  </action>
  <verify>
    <automated>grep -q 'if (v3)' src/components/layout/sidebar.tsx && grep -q 'sb theme-editorial-v3' src/components/layout/sidebar.tsx && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `sidebar.tsx` contiene la prop `v3?: boolean` en `SidebarProps` y `v3 = false` en la firma
    - `sidebar.tsx` contiene `if (v3)` ANTES de `if (v2)` (grep del orden: la primera aparición de `if (v3)` precede a la línea de `if (v2)`)
    - El `<aside>` del branch v3 lleva exactamente `className="sb theme-editorial-v3 hidden md:flex w-64 shrink-0"`
    - El branch v3 usa wordmark tipográfico (`<div className="wm">morf<b>·</b>x</div>`), NO `<Image`/`<img`
    - El branch v3 NO contiene `ThemeToggle` (grep de `ThemeToggle` en el rango del branch v3 = 0)
    - El branch v3 usa `navCategoriesV2`, `WorkspaceSwitcher`, `GlobalSearch`, y `logout` (reuso, no reimplementación)
    - `git diff` NO muestra cambios dentro del rango del `if (v2)` (220-396) ni del return legacy (398-591) — solo la prop nueva + el branch nuevo
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Branch if (v3) agregado clonando v2, con el <aside> scoped (Opción B), wordmark tipográfico, sin ThemeToggle; v2/legacy byte-frozen; typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 2: Cablear v3={isEditorialV3} al Sidebar en layout.tsx SIN tocar el <main> (D-03)</name>
  <read_first>
    - src/app/(dashboard)/layout.tsx (resuelve `isEditorialV3` en 43-45; `<Sidebar v2={isDashboardV2} />` en 67-72; `<main className={... isEditorialV3 && 'theme-editorial-v3'}>` en 73-80)
    - RESEARCH §Code Examples "layout.tsx — pasar v3 al sidebar (Opción B, una línea)" + §D-03 restricción dura (NO mover la clase de <main>)
  </read_first>
  <action>
    En `src/app/(dashboard)/layout.tsx`, agregar UNA línea: la prop `v3={isEditorialV3}` al `<Sidebar>` (después de `v2={isDashboardV2}`, línea ~71). Queda:
    ```tsx
    <Sidebar
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      user={user}
      v2={isDashboardV2}
      v3={isEditorialV3}
    />
    ```
    RESTRICCIÓN DURA (D-03): NO tocar el `<main>` (73-80). La clase `isEditorialV3 && 'theme-editorial-v3'` del `<main>` queda EXACTAMENTE igual. NO agregar `theme-editorial-v3` al `<div className="flex h-screen">` root (eso sería Opción A — double-grain + blast-radius, RECHAZADA). El scope del sidebar lo pone el `<aside>` del branch v3 (Task 1), NO el layout.
  </action>
  <verify>
    <automated>grep -q 'v3={isEditorialV3}' 'src/app/(dashboard)/layout.tsx' && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `layout.tsx` contiene `v3={isEditorialV3}` dentro del `<Sidebar ... />`
    - `git diff -- 'src/app/(dashboard)/layout.tsx'` muestra UNA sola línea agregada (la prop v3) — el `<main>` y el `<div className="flex h-screen">` root quedan SIN cambios
    - NO aparece `theme-editorial-v3` agregado al `<div ... 'flex h-screen'>` root (grep: el root NO lleva la clase v3)
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Prop v3 cableada en layout.tsx; <main> y root intactos; typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 3: APPEND reglas CSS del sidebar v3 a globals.css re-autorizando .sb/.brand/.wm/.sub/nav.sb-nav bajo .theme-editorial-v3 (D-02/D-03)</name>
  <read_first>
    - src/app/globals.css líneas 546-616 (reglas legacy `.theme-editorial .sb/.brand/.wm/.sub/.cat/.sb-nav` = fuente de valores; NO editar)
    - src/app/globals.css líneas 1363-1373 (bloque `.dark .theme-editorial-v3` — el APPEND va DESPUÉS de la línea 1373 `.wm img`, ANTES de `@layer base` en 1376)
    - RESEARCH §Pattern 2 + §Code Examples "globals.css — APPEND reglas sidebar v3" (bloque CSS verbatim a copiar)
  </read_first>
  <action>
    En `src/app/globals.css`, INSERTAR (APPEND) el siguiente bloque DESPUÉS de la línea `.dark .theme-editorial-v3 .wm img{...}` (línea 1373) y ANTES de `@layer base {` (línea 1376). NO editar las reglas legacy `.theme-editorial .sb/...` (546-616) ni el bloque legacy (1..1012) — Regla 6 / Pitfall 5. Copiar VERBATIM:
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
    ```
    NOTA: el dark del sidebar lo cubre automáticamente el bloque `.dark .theme-editorial-v3` global (tokens `--paper-*/--ink-*/--border/--rubric-2`) vía cascade — NO escribir reglas dark del sidebar aquí (eso es la auditoría D-06, Plan 04, y solo si un screenshot revela un fallo). NUNCA usar selector compound `.theme-editorial-v3.dark` (Pitfall 3 — nunca matchea).
  </action>
  <verify>
    <automated>grep -q '.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none;' src/app/globals.css && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `globals.css` contiene `.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none;` (el `background-image:none` es la clave anti-grain-doble)
    - `globals.css` contiene `.theme-editorial-v3 nav.sb-nav li a.active` con `border:1px solid var(--ink-1)`
    - `git diff HEAD -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]'` está VACÍO (NO se tocó ninguna regla legacy `.theme-editorial ` sin guion)
    - `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` está VACÍO (sin selector compound dark nuevo)
    - Todas las líneas `+` agregadas con selector empiezan por `.theme-editorial-v3` (ninguna regla fuera de scope v3)
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Reglas del sidebar v3 APPEND bajo .theme-editorial-v3 (con background-image:none anti-grain); legacy byte-frozen; sin compound dark; typecheck verde.</done>
</task>

</tasks>

<verification>
- Fidelidad visual del sidebar v3 (light + dark) se gatea en Wave 3 (Plan 04 dark audit) + QA visual del usuario.
- Per-commit gate: `pnpm typecheck`.
- Regla 6: branch v2 (220-396) + legacy (398-591) byte-frozen; reglas legacy `.theme-editorial .sb/...` (546-616) intactas; `<main>` y root de layout.tsx intactos. Verificado por `git diff` en Plan 05.
</verification>

<success_criteria>
- Con ui_editorial_v3 ON, el dashboard muestra el sidebar editorial v3 (Opción B) bajo `.theme-editorial-v3`.
- v2 "Propuesta B" y legacy renderizan exactamente igual que antes (flags off / v2-only).
- typecheck verde; sin reglas legacy tocadas; sin compound dark.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/01-SUMMARY.md`
</output>
