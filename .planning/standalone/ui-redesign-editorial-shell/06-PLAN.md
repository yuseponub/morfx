---
phase: ui-redesign-editorial-shell
plan: 06
type: execute
gap_closure: true
wave: 0
depends_on: []
files_modified:
  - src/components/layout/sidebar.tsx
  - src/components/workspace/workspace-switcher.tsx
  - src/app/globals.css
autonomous: false
requirements: [D-G1, D-G2, D-G3, D-G4, D-G5]

must_haves:
  truths:
    - "Con ui_editorial_v3 ON, el branch if(v3) del sidebar (sidebar.tsx ~235-411) NO contiene el bloque <GlobalSearch /> — la caja de búsqueda del mock desaparece (D-G1)"
    - "El footer de usuario del branch v3 (avatar inicial + nombre + email + <form action={logout}>) sigue presente y funcional, re-estilizado limpio al scope editorial (D-G2)"
    - "El <WorkspaceSwitcher> del branch v3 sigue cambiando de workspace (dropdown funcional) pero su trigger se ve como el .ws del mock (badge inicial + nombre + caret ▾), sin la caja con borde px-3 py-3 + borderBottom (D-G3)"
    - "El subtítulo del switcher (.ws-plan) usa dato REAL: currentWorkspace.business_type si existe, si no 'CRM' — nunca el literal inventado 'Plan Pro · N agentes' (D-G3)"
    - "El branch v3 muestra el logo como IMAGEN (<Image src=/logo-light.png>) en .wm, no el wordmark de texto morf·x (D-G4)"
    - "globals.css contiene bajo .theme-editorial-v3 las reglas .ws/.ws-badge/.ws-meta/.ws-name/.ws-plan/.ws-caret portadas del mock, más el refinamiento de .cat (bullet rubric-2 + flex) y del a.active (paper-3, sin borde) para fidelidad (D-G5)"
    - "El branch v2 (sidebar.tsx ~418-595) + legacy (~596+) + header.tsx marketing + theme-toggle.tsx + el bloque legacy .theme-editorial (sin guion) de globals.css quedan byte-frozen (Regla 6)"
    - "El import de GlobalSearch se conserva (v2 línea ~459 y legacy ~642 lo siguen usando); no queda huérfano"
  artifacts:
    - path: "src/components/layout/sidebar.tsx"
      provides: "Branch if(v3) sin GlobalSearch, con logo-img, switcher restyled .ws y footer limpio"
      contains: "ws-badge"
    - path: "src/app/globals.css"
      provides: "Reglas .theme-editorial-v3 .ws* (APPEND) + refinamiento .cat/.cat::before/a.active fieles al mock"
      contains: ".theme-editorial-v3 .ws"
  key_links:
    - from: "src/components/layout/sidebar.tsx branch if(v3)"
      to: ".theme-editorial-v3 .ws en globals.css"
      via: "trigger del WorkspaceSwitcher con className='ws' + spans .ws-badge/.ws-meta/.ws-name/.ws-plan/.ws-caret"
      pattern: "ws-badge"
    - from: "src/components/layout/sidebar.tsx branch if(v3) .wm"
      to: ".theme-editorial-v3 .wm img en globals.css (filtro light multiply / dark invert ya existente)"
      via: "<Image src='/logo-light.png' ...> dentro de <div className='wm'>"
      pattern: "logo-light\\.png"
---

<objective>
Cerrar el gap de fidelidad del sidebar v3 contra el mock `crm-editorial.html` (§268-294). El branch `if (v3)` del sidebar hoy es estructuralmente el v2 (caja de search del mock inexistente, switcher genérico en caja con borde, wordmark de texto) y se ve DEFORME en prod (Varixcenter) o "igual + color" (Somnio). Este plan reproduce el mock SOLO en el branch v3 + su CSS `.theme-editorial-v3`:

- D-G1: quitar `<GlobalSearch>` del branch v3.
- D-G2: conservar el footer de usuario (logout funcional), re-estilizado limpio.
- D-G3: re-estilizar el `<WorkspaceSwitcher>` al look `.ws` del mock (badge + nombre + caret), manteniendo el dropdown funcional; subtítulo con `business_type` real.
- D-G4: reemplazar el wordmark de texto por la imagen del logo (`/logo-light.png` con el filtro `.wm img` ya existente para light/dark).
- D-G5: portar (APPEND) las reglas `.ws*` del mock bajo `.theme-editorial-v3` + refinar in-place las reglas `.cat`/`.cat::before`/`a.active` ya existentes del scope v3 para verdadera fidelidad.

Purpose: que el sidebar v3 termine idéntico al mock de Claude Design (limpio, no deforme, light + dark), sin tocar nada fuera del branch v3 (Regla 6).
Output: branch v3 fiel al mock, verificado visualmente en Somnio + Varixcenter (light + dark) y pusheado a prod.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/GAP-SIDEBAR-CONTEXT.md
@.planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md
@.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html

<interfaces>
<!-- Datos/tipos reales que el branch v3 usa. No requiere exploración del codebase. -->
WorkspaceWithRole extends Workspace (src/lib/types/database.ts):
  - name: string
  - business_type: string | null   ← subtítulo del switcher (NO existe plan ni agent_count)
  - role: WorkspaceRole

WorkspaceSwitcher (src/components/workspace/workspace-switcher.tsx):
  - props: { workspaces: WorkspaceWithRole[]; currentWorkspace?: WorkspaceWithRole | null }
  - hoy renderiza un <Button variant="outline" className="w-full justify-between"> como trigger del
    <DropdownMenuTrigger asChild>. El dropdown (DropdownMenuContent + items) NO se toca.
  - mecanismo del cambio de workspace: handleSelect → setea cookie morfx_workspace + router.refresh().

Mock (crm-editorial.html §272-279) — trigger objetivo .ws:
  <button class="ws" type="button">
    <span class="ws-badge">D</span>
    <span class="ws-meta">
      <span class="ws-name">Distribuidora Andina</span>
      <span class="ws-plan">Plan Pro · 12 agentes</span>   ← NO copiar este literal; usar business_type||'CRM'
    </span>
    <span class="ws-caret">▾</span>
  </button>

Mock CSS .ws* (crm-editorial.html <style> §178-184) — fuente verbatim a portar (prefijar .theme-editorial-v3):
  .ws{display:flex;align-items:center;gap:10px;width:calc(100% - 16px);height:51px;box-sizing:border-box;margin:0 8px;padding:0 10px;background:var(--paper-0);border:1px solid var(--border);border-radius:var(--radius-3);cursor:pointer;text-align:left}
  .ws:hover{background:var(--paper-2);border-color:var(--ink-3)}
  .ws-badge{flex:none;width:24px;height:24px;border-radius:var(--radius-2);background:var(--ink-1);color:var(--paper-0);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:13px;line-height:1}
  .ws-meta{min-width:0;flex:1}
  .ws-name{display:block;font-family:var(--font-sans);font-weight:600;font-size:13px;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}
  .ws-plan{display:block;font-family:var(--font-sans);font-size:11px;color:var(--ink-3);line-height:1.2;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ws-caret{flex:none;color:var(--ink-3);font-size:11px;line-height:1}

Mock CSS .cat + a.active (crm-editorial.html <style> §189-191) — refinamiento de fidelidad:
  nav.sb-nav li a.active{background:var(--paper-3);color:var(--ink-1);font-weight:600;border:0;box-shadow:none}
  nav.sb-nav .cat{display:flex;align-items:center;gap:7px;font-family:var(--font-sans);font-weight:600;letter-spacing:0.14em;text-transform:uppercase;font-size:11.2px;color:var(--ink-3);padding:12px 10px 6px}
  nav.sb-nav .cat::before{content:"";width:5px;height:5px;border-radius:999px;background:var(--rubric-2);flex:none}

Patrón de logo ya usado en ESTE archivo (sidebar.tsx legacy §620-621) y en auth pages:
  <Image src="/logo-light.png" className="block dark:hidden h-8 w-auto" alt="morfx" width={85} height={32} />
  <Image src="/logo-dark.png" className="hidden dark:block h-8 w-auto" alt="morfx" width={135} height={32} />
  NOTA: para el .wm v3 existe ADEMÁS el filtro CSS `.theme-editorial-v3 .wm img{mix-blend-mode:multiply}`
  (globals.css:1176) + `.dark .theme-editorial-v3 .wm img{...invert...}` (globals.css:1379). Ver Task 3 para
  la decisión light/dark (una sola img + filtro existente).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Quitar GlobalSearch del branch v3 + reemplazar wordmark de texto por logo-img (D-G1 + D-G4)</name>
  <read_first>
    - src/components/layout/sidebar.tsx §235-411 (branch if(v3) COMPLETO — el ÚNICO a tocar)
    - src/components/layout/sidebar.tsx §620-621 (patrón de logo light/dark ya usado en legacy de ESTE archivo)
    - src/app/globals.css §1175-1177 (.wm img mix-blend-mode multiply) + §1379 (.dark .theme-editorial-v3 .wm img invert) — filtro YA existente
    - GAP-SIDEBAR-CONTEXT.md D-G1 + D-G4
  </read_first>
  <action>
    En `src/components/layout/sidebar.tsx`, SOLO dentro del branch `if (v3)` (§235-411):

    1. **D-G1 — Quitar GlobalSearch:** borrar el bloque (líneas ~275-277):
       ```tsx
       <div className="px-3 py-3">
         <GlobalSearch />
       </div>
       ```
       NO tocar el import de `GlobalSearch` (línea 15) — sigue usado por el branch v2 (~459) y legacy (~642).
       Verificar con grep antes de tocar el import: `grep -c "GlobalSearch" src/components/layout/sidebar.tsx`
       debe quedar en 3 (import + v2 + legacy) tras borrar la línea del v3. Si quedara en 1 (huérfano),
       removerlo; en este repo NO queda huérfano, así que el import se conserva intacto.

    2. **D-G4 — Logo como imagen:** reemplazar el wordmark de texto del `.wm` (líneas ~254-257):
       ```tsx
       <div className="brand">
         <div className="wm">
           morf<b>·</b>x
         </div>
         <div className="sub">{workspaceSubline}</div>
       </div>
       ```
       por la IMAGEN del logo. Usar UNA sola `<Image src="/logo-light.png">` apoyándose en el filtro CSS
       `.theme-editorial-v3 .wm img` (light: multiply / dark: invert) que YA existe en globals.css (1176 +
       1379) — ese filtro es justo para este caso y evita duplicar imgs. Resultado:
       ```tsx
       <div className="brand">
         <div className="wm">
           <Image src="/logo-light.png" alt="morfx" width={96} height={28} priority />
         </div>
         <div className="sub">{workspaceSubline}</div>
       </div>
       ```
       - `Image` ya está importado (línea 3). Altura razonable y estática (NO copiar el easter-egg del mock
         de 120px overflow + drag — el mock tiene `position:absolute;top:-14;left:-14;height:120px;cursor:grab`;
         eso NO se porta; usar un logo estático sano. El Task 3 ajusta `.theme-editorial-v3 .wm` a un alto
         contenido sin overflow).
       - `width`/`height` son el intrínseco del asset para Next/Image; el CSS de `.wm` controla el render.
       - Mantener el `.sub` (subtítulo `workspaceSubline`) debajo del logo como hoy — encaja con el mock
         (el mock no lo muestra pero el .sub ya es scope v3 válido; conservarlo da el contexto "X · CRM").

    NO tocar el branch v2 (~418-595) ni el legacy (~596+).
  </action>
  <verify>
    <automated>grep -c "GlobalSearch" src/components/layout/sidebar.tsx</automated>
  </verify>
  <acceptance_criteria>
    - El branch v3 NO contiene `<GlobalSearch`/ (grep dentro del rango v3 = 0; el conteo global queda en 3: import + v2 + legacy)
    - El branch v3 contiene `<Image src="/logo-light.png"` dentro de `<div className="wm">`
    - El branch v3 ya NO contiene el wordmark de texto `morf<b>·</b>x`
    - El `.sub` con `{workspaceSubline}` se conserva debajo del logo
    - `git diff adfc85cf -- src/components/layout/sidebar.tsx` NO muestra cambios fuera del rango del branch v3
    - `pnpm exec tsc --noEmit 2>&1 | grep sidebar` está VACÍO
  </acceptance_criteria>
  <done>GlobalSearch fuera del branch v3; logo como imagen en .wm; import conservado; v2/legacy intactos; tsc limpio en sidebar.</done>
</task>

<task type="auto">
  <name>Task 2: Re-estilizar WorkspaceSwitcher al look .ws (funcional) + footer de usuario limpio en el branch v3 (D-G3 + D-G2)</name>
  <read_first>
    - src/components/workspace/workspace-switcher.tsx COMPLETO (trigger = <Button> dentro de <DropdownMenuTrigger asChild>; v2/legacy del sidebar lo llaman SIN variante)
    - src/components/layout/sidebar.tsx §261-273 (wrapper actual del switcher en caja con borde) + §327-407 (footer de usuario actual)
    - Mock §272-279 (.ws trigger objetivo) — ver <interfaces>
    - GAP-SIDEBAR-CONTEXT.md D-G2 + D-G3 + Claude's Discretion
  </read_first>
  <action>
    Mecanismo elegido (el menos invasivo que NO rompe v2/legacy callers): **agregar una prop opcional
    `editorial?: boolean` al `WorkspaceSwitcher`** que cambia SOLO el render del trigger (no el dropdown).
    Los callers v2/legacy del sidebar NO pasan la prop → render byte-idéntico (default `false`).

    **Parte A — `src/components/workspace/workspace-switcher.tsx`:**
    1. En la interface `WorkspaceSwitcherProps` agregar: `editorial?: boolean`.
    2. En la firma: `export function WorkspaceSwitcher({ workspaces, currentWorkspace, editorial = false }: WorkspaceSwitcherProps)`.
    3. Dentro del `<DropdownMenuTrigger asChild>`, cuando `editorial === true`, renderizar el trigger del mock
       en vez del `<Button variant="outline">`. El subtítulo usa dato REAL (NUNCA "Plan Pro · N agentes"):
       ```tsx
       <DropdownMenuTrigger asChild>
         {editorial ? (
           <button type="button" className="ws" aria-expanded={open}>
             <span className="ws-badge">
               {displayWorkspace.name?.charAt(0).toUpperCase() || 'W'}
             </span>
             <span className="ws-meta">
               <span className="ws-name">{displayWorkspace.name}</span>
               <span className="ws-plan">{displayWorkspace.business_type || 'CRM'}</span>
             </span>
             <span className="ws-caret" aria-hidden="true">▾</span>
           </button>
         ) : (
           <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
             {/* ...trigger actual SIN cambios... */}
           </Button>
         )}
       </DropdownMenuTrigger>
       ```
       - NO tocar `handleSelect`, ni el `<DropdownMenuContent>`, ni el bloque `workspaces.length === 0`
         (Crear workspace) — el dropdown sigue 100% funcional.
       - El branch `editorial` reusa el MISMO `open`/`setOpen` y el MISMO `<DropdownMenu>` wrapper → el
         click en `.ws` abre el dropdown y `handleSelect` cambia el workspace igual que hoy.
       - El render del `.ws-plan` con `business_type || 'CRM'` satisface D-G3 (dato real; "CRM" como fallback,
         decisión Claude por consistencia con el subtítulo histórico del sidebar).

    **Parte B — `src/components/layout/sidebar.tsx`, branch v3:**
    4. **D-G3 — switcher sin caja:** reemplazar el wrapper actual (líneas ~261-273):
       ```tsx
       <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
         <WorkspaceSwitcher workspaces={workspaces} currentWorkspace={currentWorkspace} />
       </div>
       ```
       por el switcher SIN caja con borde, pasando `editorial`:
       ```tsx
       <WorkspaceSwitcher workspaces={workspaces} currentWorkspace={currentWorkspace} editorial />
       ```
       (El margen/altura del trigger los da la clase `.ws` portada en Task 3 — `margin:0 8px;height:51px`.
       No envolver en `px-3 py-3` ni borderBottom; el mock no los tiene.)

    5. **D-G2 — footer limpio:** mantener el footer de usuario (avatar inicial + nombre + email +
       `<form action={logout}>` con LogOut) — NO removerlo, NO quitar el logout. Re-estilizarlo limpio al
       scope editorial dentro del branch v3 (§327-407):
       - Cambiar el `borderTop: '1px solid var(--ink-1)'` (línea ~331) por `borderTop: '1px solid var(--border)'`
         (borde suave editorial, no la línea dura ink-1).
       - El nombre (línea ~356-368): cambiar `fontFamily: 'var(--font-serif)'` por `'var(--font-sans)'`,
         `fontWeight: 600`, mostrar `{user.email?.split('@')[0]}` igual.
       - Mantener avatar inicial (ink-1 bg / paper-0 fg), email en mono ink-3, y el `<form action={logout}>`
         con el botón LogOut + Tooltip "Cerrar sesión" EXACTAMENTE como están (logout es crítico).
       - Mantener el padding `px-4 py-3` y el layout flex actual.

    NO tocar el branch v2 (~418-595) ni legacy (~596+).
  </action>
  <verify>
    <automated>grep -q 'editorial = false' src/components/workspace/workspace-switcher.tsx && grep -q 'className="ws"' src/components/workspace/workspace-switcher.tsx && grep -q 'editorial />' src/components/layout/sidebar.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `workspace-switcher.tsx` tiene `editorial?: boolean` en la interface y `editorial = false` en la firma
    - El trigger editorial usa `className="ws"` + spans `ws-badge`/`ws-meta`/`ws-name`/`ws-plan`/`ws-caret`
    - El `.ws-plan` renderiza `displayWorkspace.business_type || 'CRM'` — NO aparece el literal "Plan Pro" ni "agentes" en el archivo (grep `Plan Pro` = 0, grep `agentes` = 0)
    - El `<DropdownMenuContent>`, `handleSelect` y el bloque `workspaces.length === 0` quedan SIN cambios (git diff no los toca)
    - El branch v3 del sidebar llama `<WorkspaceSwitcher ... editorial />` sin el wrapper `px-3 py-3` + `borderBottom`
    - El footer de usuario del branch v3 conserva `<form action={logout}>` + `<LogOut` + Tooltip "Cerrar sesión"
    - `git diff adfc85cf -- src/components/layout/sidebar.tsx` NO muestra cambios fuera del branch v3; v2 (~418-595) y legacy (~596+) byte-frozen
    - `pnpm exec tsc --noEmit 2>&1 | grep -E 'sidebar|workspace-switcher'` está VACÍO
  </acceptance_criteria>
  <done>Switcher con look .ws (prop editorial) funcional, subtítulo business_type real; footer de usuario limpio con logout intacto; v2/legacy frozen; tsc limpio.</done>
</task>

<task type="auto">
  <name>Task 3: APPEND reglas .ws* del mock + refinar .cat/.cat::before/a.active/.wm a fidelidad bajo .theme-editorial-v3 (D-G5)</name>
  <read_first>
    - src/app/globals.css §1385-1395 (bloque sidebar v3 actual: .sb/.brand/.wm/.sub/nav.sb-nav/.cat/a.active — refinamiento in-place permitido SOLO aquí)
    - src/app/globals.css §1175-1177 (.wm img multiply) + §1379 (.dark .theme-editorial-v3 .wm img invert)
    - crm-editorial.html <style> §178-184 (.ws*) + §189-191 (a.active/.cat/.cat::before) — fuente verbatim
    - GAP-SIDEBAR-CONTEXT.md D-G5
  </read_first>
  <action>
    En `src/app/globals.css`, dos cambios — ambos bajo `.theme-editorial-v3`, NUNCA tocar el legacy
    `.theme-editorial` (sin guion), NUNCA usar compound `.theme-editorial-v3.dark`:

    **A — APPEND (reglas nuevas .ws*):** insertar el siguiente bloque JUSTO DESPUÉS de la línea
    `.theme-editorial-v3 nav.sb-nav .cat { ... }` (línea ~1395, fin del bloque sidebar v3 actual) y ANTES
    de `@layer base {` (línea ~1397). Reglas del mock §178-184 prefijadas `.theme-editorial-v3`:
    ```css
    /* ===== Sidebar v3 — workspace switcher .ws* (gap-closure 06, D-G5) =====
     * APPEND ONLY. Portadas verbatim del mock crm-editorial.html §178-184. */
    .theme-editorial-v3 .ws { display:flex; align-items:center; gap:10px; width:calc(100% - 16px); height:51px; box-sizing:border-box; margin:0 8px; padding:0 10px; background:var(--paper-0); border:1px solid var(--border); border-radius:var(--radius-3); cursor:pointer; text-align:left }
    .theme-editorial-v3 .ws:hover { background:var(--paper-2); border-color:var(--ink-3) }
    .theme-editorial-v3 .ws-badge { flex:none; width:24px; height:24px; border-radius:var(--radius-2); background:var(--ink-1); color:var(--paper-0); display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-weight:800; font-size:13px; line-height:1 }
    .theme-editorial-v3 .ws-meta { min-width:0; flex:1 }
    .theme-editorial-v3 .ws-name { display:block; font-family:var(--font-sans); font-weight:600; font-size:13px; color:var(--ink-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2 }
    .theme-editorial-v3 .ws-plan { display:block; font-family:var(--font-sans); font-size:11px; color:var(--ink-3); line-height:1.2; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .theme-editorial-v3 .ws-caret { flex:none; color:var(--ink-3); font-size:11px; line-height:1 }
    ```

    **B — REFINAR IN-PLACE (reglas v3 ya existentes, NO legacy):** editar las tres reglas actuales del
    bloque sidebar v3 (§1387, §1394, §1395) para alinearlas al mock §189-191:
    1. `.theme-editorial-v3 .wm` (línea ~1387): cambiar la regla de wordmark-de-texto por una de contenedor
       de logo-img sano (sin el overflow/drag del mock):
       ```css
       .theme-editorial-v3 .wm { display:block; height:28px }
       ```
       (El filtro light/dark de la `<img>` ya lo dan §1176 + §1379. Eliminar las props de wordmark
       font-display/font-size:32px/letter-spacing/color que ya no aplican a una imagen. Mantener
       `.theme-editorial-v3 .wm b` en línea ~1388 — es inocuo aunque ya no haya `<b>`.)
    2. `.theme-editorial-v3 nav.sb-nav li a.active` (línea ~1394): reemplazar el estilo actual
       (`background:var(--paper-0); border:1px solid var(--ink-1); box-shadow:0 1px 0 var(--border)`) por el
       del mock:
       ```css
       .theme-editorial-v3 nav.sb-nav li a.active { background:var(--paper-3); color:var(--ink-1); font-weight:600; border:0; box-shadow:none }
       ```
    3. `.theme-editorial-v3 nav.sb-nav .cat` (línea ~1395): alinear al mock (flex + gap + tamaño) y AGREGAR
       el `::before` bullet rubric-2:
       ```css
       .theme-editorial-v3 nav.sb-nav .cat { display:flex; align-items:center; gap:7px; font-family:var(--font-sans); font-weight:600; letter-spacing:0.14em; text-transform:uppercase; font-size:11.2px; color:var(--ink-3); padding:12px 10px 6px }
       .theme-editorial-v3 nav.sb-nav .cat::before { content:""; width:5px; height:5px; border-radius:999px; background:var(--rubric-2); flex:none }
       ```

    NO tocar `.theme-editorial` legacy (sin guion). NO crear `.theme-editorial-v3.dark`. El dark del sidebar
    lo cubre el bloque `.dark .theme-editorial-v3` global (tokens) + el `.dark .theme-editorial-v3 .wm img`
    ya existente — NO escribir reglas dark nuevas salvo que un screenshot revele un fallo.
  </action>
  <verify>
    <automated>grep -q '.theme-editorial-v3 .ws-badge' src/app/globals.css && grep -q '.theme-editorial-v3 nav.sb-nav .cat::before' src/app/globals.css && grep -q 'background:var(--paper-3); color:var(--ink-1); font-weight:600; border:0; box-shadow:none' src/app/globals.css</automated>
  </verify>
  <acceptance_criteria>
    - `globals.css` contiene las 7 reglas `.theme-editorial-v3 .ws` / `.ws:hover` / `.ws-badge` / `.ws-meta` / `.ws-name` / `.ws-plan` / `.ws-caret`
    - `globals.css` contiene `.theme-editorial-v3 nav.sb-nav .cat::before` con `background:var(--rubric-2)`
    - `.theme-editorial-v3 nav.sb-nav li a.active` ahora usa `background:var(--paper-3)` + `border:0` + `box-shadow:none` (ya NO `border:1px solid var(--ink-1)`)
    - `.theme-editorial-v3 .wm` es contenedor de imagen (`display:block; height:28px`), sin font-size:32px
    - `git diff adfc85cf -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]'` está VACÍO (ninguna regla legacy sin guion tocada)
    - `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` está VACÍO (sin compound dark)
    - Toda línea `+` con selector empieza por `.theme-editorial-v3`
    - `pnpm exec tsc --noEmit 2>&1 | grep globals` está VACÍO
  </acceptance_criteria>
  <done>Reglas .ws* portadas (APPEND) + .cat/.cat::before/a.active/.wm refinadas a fidelidad bajo v3; legacy intacto; sin compound dark.</done>
</task>

<task type="auto">
  <name>Task 4: Gate Regla 6 — re-correr invariantes byte-frozen vs HEAD pre-gap-closure (plain git/grep)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md (los 10 invariantes originales)
    - CLAUDE.md Regla 6
  </read_first>
  <action>
    Base de diff = HEAD pre-gap-closure `adfc85cf` (capturado al inicio de este plan; si los Tasks 1-3 ya
    están commiteados, usar `git diff adfc85cf <file>`). Correr y CONFIRMAR cada invariante (todos deben
    pasar; si alguno falla, corregir el código del branch v3 antes de continuar):

    1. **Branch v2 + legacy del sidebar byte-frozen** (solo cambia el branch v3):
       `git diff adfc85cf -- src/components/layout/sidebar.tsx`
       → los únicos hunks deben caer dentro del rango del branch `if (v3)` (~235-411). Inspección dirigida:
       cero `-`/`+` dentro del `if (v2)` (~418-595) ni del return legacy (~596+).

    2. **header.tsx marketing byte-frozen:**
       `git diff adfc85cf -- src/components/layout/header.tsx` → VACÍO.

    3. **theme-toggle.tsx byte-frozen:**
       `git diff adfc85cf -- src/components/layout/theme-toggle.tsx` → VACÍO.

    4. **globals.css legacy `.theme-editorial` (sin guion) NO tocado:**
       `git diff adfc85cf -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]'` → VACÍO.

    5. **Sin compound dark:**
       `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` → VACÍO.

    6. **Toda adición de clase en globals.css bajo .theme-editorial-v3:**
       `git diff adfc85cf -- src/app/globals.css | grep -E '^\+\.' | grep -v 'theme-editorial-v3'` → VACÍO.

    7. **Import GlobalSearch conservado (no huérfano):**
       `grep -c 'GlobalSearch' src/components/layout/sidebar.tsx` → 3 (import + v2 + legacy).

    8. **WorkspaceSwitcher: callers v2/legacy sin la prop editorial (render byte-idéntico):**
       `git diff adfc85cf -- src/components/workspace/workspace-switcher.tsx` → solo ADICIÓN de la prop
       `editorial` + el branch ternario del trigger; el `<DropdownMenuContent>`, `handleSelect` y el bloque
       `length === 0` sin `-`.

    9. **Gate de tipos:**
       `pnpm exec tsc --noEmit 2>&1 | grep -E 'sidebar|workspace-switcher|globals'` → VACÍO.
       (Los 4 errores residuales pre-existentes en `__tests__` documentados en REGLA6-GATE.md NO bloquean —
       confirmar que NO aumentaron y que ninguno cae en archivos de este plan.)

    10. **Flag + sin migración:** confirmar que el flag sigue siendo `ui_editorial_v3` (sin cambios de
        gating) y que este plan NO crea ninguna migración (`git status --porcelain supabase/migrations/`
        → sin archivos nuevos de este plan).

    Documentar el resultado (10/10 OK esperado) en el `06-SUMMARY.md` del Task final.
  </action>
  <verify>
    <automated>git diff adfc85cf -- src/components/layout/header.tsx src/components/layout/theme-toggle.tsx | grep -c '^' ; grep -c 'GlobalSearch' src/components/layout/sidebar.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `git diff adfc85cf -- src/components/layout/header.tsx` y `... theme-toggle.tsx` ambos VACÍOS
    - `git diff adfc85cf -- src/app/globals.css | grep '^\+' | grep '\.theme-editorial[^-]'` VACÍO
    - `grep 'theme-editorial-v3\.dark' src/app/globals.css` VACÍO
    - `grep -c 'GlobalSearch' src/components/layout/sidebar.tsx` == 3
    - El diff del sidebar.tsx solo toca el branch v3; v2 (~418-595) y legacy (~596+) sin cambios
    - `pnpm exec tsc --noEmit 2>&1 | grep -E 'sidebar|workspace-switcher|globals'` VACÍO; sin errores nuevos
    - Sin migraciones nuevas; flag sigue `ui_editorial_v3`
  </acceptance_criteria>
  <done>10/10 invariantes Regla 6 OK; no-v3 byte-frozen; tsc limpio en archivos del plan; sin migración.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Branch v3 del sidebar fiel al mock: sin caja de GlobalSearch (D-G1), logo como imagen (D-G4), workspace
    switcher con look .ws funcional + subtítulo business_type real (D-G3), footer de usuario limpio con
    logout intacto (D-G2), y CSS .ws* + bullets de categoría + active limpio portados/refinados (D-G5).
    Regla 6 verificada 10/10 (Task 4). Cambios SOLO en el branch v3 + CSS .theme-editorial-v3.
  </what-built>
  <how-to-verify>
    1. Asegurar que `ui_editorial_v3` está ON en al menos un workspace de prueba. Si hace falta correr el
       app localmente: `pnpm dev` (puerto 3020) y abrir el dashboard del workspace con el flag ON.
       (Alternativa: verificar tras el push en el preview/prod de Vercel — ver paso final.)
    2. **Somnio** (workspace con v3 ON): el sidebar debe verse como el mock:
       - Logo como IMAGEN arriba (no el texto morf·x), bien alineado, sin overflow ni recorte.
       - Switcher tipo .ws: badge con la inicial del workspace + nombre + caret ▾, SIN la caja con borde
         grande de antes. Click en el switcher ABRE el dropdown y permite cambiar de workspace.
       - Subtítulo del switcher = business_type del workspace (o "CRM"), NUNCA "Plan Pro · N agentes".
       - Encabezados de categoría (CRM / Agentes / Análisis) con bullet rojo (rubric-2) a la izquierda.
       - NO hay caja de búsqueda en el sidebar.
       - Footer de usuario limpio (avatar + nombre + email + botón Cerrar sesión funcional).
       - El sidebar NO se ve deforme ni desalineado.
    3. **Varixcenter** (ya tenía v3 ON, antes "limpio pero DEFORME"): confirmar que el switcher y el logo
       ya NO se ven grandes/desalineados — ahora compactos como el mock.
    4. Repetir 2-3 en **modo CLARO y modo OSCURO** (toggle del topbar): logo legible (invert en dark),
       switcher y bullets con buen contraste, nada roto en dark.
    5. Confirmar que un workspace SIN el flag (v2/legacy) se ve EXACTAMENTE igual que antes (Regla 6).
  </how-to-verify>
  <resume-signal>
    Escribe "aprobado" si el sidebar v3 luce como el mock (limpio, no deforme) en Somnio + Varixcenter,
    light y dark, y el no-v3 quedó intacto. Si hay algo deforme/roto, describe el problema (workspace,
    light/dark, screenshot) para corregir antes de pushear.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 6: (Gated tras aprobación) Commits atómicos + push a origin/main + 06-SUMMARY.md (Regla 1)</name>
  <read_first>
    - CLAUDE.md Regla 1 (push a Vercel) + reglas de commit (español + Co-Authored-By)
    - .planning/standalone/ui-redesign-editorial-shell/05-PLAN.md (formato del SUMMARY del repo, si existe 05-SUMMARY.md)
  </read_first>
  <action>
    SOLO ejecutar tras "aprobado" en el checkpoint Task 5. Repo pnpm-only — NUNCA `npm`.

    1. Si los Tasks 1-3 NO se commitearon individualmente durante la ejecución, commitear ahora de forma
       atómica (un commit por tarea), todos en español + footer Co-Authored-By:
       - `git add src/components/layout/sidebar.tsx && git commit` →
         `fix(ui-redesign-editorial-shell-06): quitar GlobalSearch del sidebar v3 + logo como imagen (D-G1, D-G4)`
       - `git add src/components/workspace/workspace-switcher.tsx src/components/layout/sidebar.tsx && git commit` →
         `fix(ui-redesign-editorial-shell-06): switcher look .ws funcional + footer limpio en sidebar v3 (D-G2, D-G3)`
       - `git add src/app/globals.css && git commit` →
         `style(ui-redesign-editorial-shell-06): portar .ws* + refinar .cat/active/.wm a fidelidad del mock (D-G5)`
       Cada mensaje termina con:
       ```
       Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
       ```
       (Si ya estaban commiteados durante ejecución secuencial, saltar este paso.)
    2. `git pull --rebase origin main` (alinear con remoto antes de push — main = deploy).
    3. `git push origin main`.
    4. Crear `.planning/standalone/ui-redesign-editorial-shell/06-SUMMARY.md` documentando: qué se cambió por
       decisión (D-G1..D-G5), el mecanismo del switcher (prop `editorial`), el resultado del gate Regla 6
       (10/10), el commit final / HEAD pusheado, y el resultado del checkpoint visual (Somnio + Varixcenter,
       light + dark). Commitear el SUMMARY: `docs(ui-redesign-editorial-shell-06): summary gap-closure sidebar v3` + push.
  </action>
  <verify>
    <automated>git log --oneline -5 | grep -c 'editorial-shell-06'</automated>
  </verify>
  <acceptance_criteria>
    - Los cambios de código están commiteados en español con footer Co-Authored-By (Claude Opus 4.8 (1M context))
    - `git push origin main` ejecutado con éxito (HEAD local == origin/main)
    - `06-SUMMARY.md` existe y documenta D-G1..D-G5 + gate Regla 6 10/10 + checkpoint visual aprobado
    - El push se hizo SOLO tras "aprobado" en Task 5
  </acceptance_criteria>
  <done>Cambios commiteados (español + Co-Authored-By), pusheados a origin/main (Vercel deploy), 06-SUMMARY.md creado y commiteado.</done>
</task>

</tasks>

<verification>
- Fidelidad visual del sidebar v3 (light + dark, Somnio + Varixcenter) gateada por el checkpoint humano (Task 5).
- Per-commit gate: `pnpm exec tsc --noEmit` (NO existe script `pnpm typecheck` en este repo; NUNCA `npm`).
- Regla 6 (Task 4): branch v2 (~418-595) + legacy (~596+) + header.tsx + theme-toggle.tsx + globals.css legacy `.theme-editorial` (sin guion) byte-frozen; sin compound `.theme-editorial-v3.dark`; import GlobalSearch conservado; callers v2/legacy de WorkspaceSwitcher sin la prop `editorial`.
- Sin migración (Regla 5 N/A aquí); flag sigue `ui_editorial_v3`.
- Push (Task 6) gated tras aprobación del checkpoint (Regla 1, pnpm-only).
</verification>

<success_criteria>
- Con `ui_editorial_v3` ON, el sidebar v3 luce como el mock: logo-imagen, switcher .ws funcional con subtítulo real, bullets de categoría, footer limpio, sin caja de búsqueda — no deforme, en light y dark.
- v2/legacy y todo lo no-v3 renderiza exactamente igual que antes (Regla 6, 10/10).
- `pnpm exec tsc --noEmit` limpio en los archivos del plan; sin compound dark; sin migración.
- Cambios pusheados a origin/main tras aprobación visual del usuario.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/06-SUMMARY.md`
</output>
