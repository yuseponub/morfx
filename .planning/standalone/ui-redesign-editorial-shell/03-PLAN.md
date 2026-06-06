---
phase: ui-redesign-editorial-shell
plan: 03
type: execute
wave: 2
depends_on: [00, 01]
files_modified:
  - src/components/layout/mobile-nav.tsx
  - src/app/(dashboard)/layout.tsx
  - src/app/globals.css
autonomous: true
requirements: [D-05]

must_haves:
  truths:
    - "MobileNav recibe una prop v3?: boolean (default false); con v3=true renderiza un Sheet editorial cuyo SheetContent lleva theme-editorial-v3 (los tokens resuelven, mismo principio Opción B)"
    - "El reskin v3 es ALCANZABLE: (dashboard)/layout.tsx monta un mobile-nav v3-only md:hidden → {isEditorialV3 && <div className='md:hidden'><MobileNav v3 /></div>} (D-05b). Para usuarios no-v3 el dashboard sigue sin mobile-nav (Regla 6)"
    - "El path no-v3 de MobileNav queda byte-frozen (early-return v3 → el render actual no cambia cuando v3=false); el <MobileNav /> del header de marketing queda byte-frozen (no recibe v3)"
    - "El branch v3 reusa las clases editoriales del sidebar (.sb-nav/.cat/li a) o navCategoriesV2 para consistencia con el desktop"
    - "Las reglas CSS del mobile-nav v3 que se agreguen van bajo .theme-editorial-v3 (APPEND, sin tocar legacy, sin compound dark)"
  artifacts:
    - path: "src/components/layout/mobile-nav.tsx"
      provides: "prop v3 + branch if (v3) con SheetContent className='theme-editorial-v3 ...' reskin editorial"
      contains: "v3"
    - path: "src/app/(dashboard)/layout.tsx"
      provides: "mount v3-only md:hidden de <MobileNav v3 /> gated por isEditorialV3 (D-05b) — hace alcanzable el reskin"
      contains: "MobileNav"
  key_links:
    - from: "src/app/(dashboard)/layout.tsx mount {isEditorialV3 && <MobileNav v3 />}"
      to: "src/components/layout/mobile-nav.tsx prop v3"
      via: "render condicional v3-only md:hidden en el shell del dashboard"
      pattern: "isEditorialV3 &&"
    - from: "src/components/layout/mobile-nav.tsx branch v3"
      to: ".theme-editorial-v3 (tokens + .sb-nav/.cat) en globals.css"
      via: "<SheetContent className='theme-editorial-v3 ...'> + clases editoriales del nav"
      pattern: "theme-editorial-v3"
---

<objective>
Reskin editorial v3-gated del `mobile-nav.tsx` (D-05) Y cablear un mount REAL v3-only en el dashboard (D-05b) para que el reskin sea ALCANZABLE — no dead-code. Tres tareas: (1) agregar prop `v3?: boolean` (default false) + branch `if (v3)` al componente, cuyo `<SheetContent>` lleva `theme-editorial-v3` (mismo principio Opción B que el sidebar); (2) montar `{isEditorialV3 && <div className="md:hidden"><MobileNav v3 /></div>}` en `(dashboard)/layout.tsx`; (3) APPEND CSS del mobile-nav v3 si hace falta. El path no-v3 del componente y el `<MobileNav />` del header de marketing quedan byte-frozen.

Purpose: D-05 mete el mobile-nav en scope, pero Wave 0 reveló que el dashboard HOY no monta NINGÚN mobile-nav (el sidebar es `hidden md:flex` = desktop-only; en mobile el dashboard no tiene nav). El plan-check marcó esto como reachability warning. El usuario resolvió con D-05b: cablear un mount real v3-only. Así el reskin v3 se renderiza de verdad (no queda como dead-code), y de paso se cierra el gap UX preexistente (dashboard sin nav móvil) SOLO para v3. Regla 6: para no-v3 el dashboard sigue exactamente igual que hoy (sin mobile-nav); el header de marketing no se toca.
Output: branch v3 del mobile-nav renderizable + montado en el dashboard cuando v3 ON; path no-v3 + header marketing byte-frozen.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/RESEARCH.md
@.planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md

<interfaces>
From src/components/ui/sheet.tsx (shadcn): Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger — ya importados en mobile-nav.tsx.
From src/app/globals.css (autorizadas en Plan 01): .theme-editorial-v3 nav.sb-nav / .cat / li a / li a:hover / li a.active — reusables dentro del Sheet v3.
From src/app/(dashboard)/layout.tsx (Plan 01 ya editó este archivo en Wave 1): `isEditorialV3` resuelto en el RSC (línea 43-45); `<Sidebar ... v3={isEditorialV3} />` (prop v3 agregada por Plan 01). El `<main>` lleva `isEditorialV3 && 'theme-editorial-v3'`. La variable `isEditorialV3` ya existe en el scope del RSC independientemente de Plan 01 (resuelta en 43-45).
</interfaces>

<facts-already-verified>
- `mobile-nav.tsx` (94 líneas): `<Sheet>` shadcn, `navItems` planos (5 hardcoded: CRM/WhatsApp/Automatizaciones/Agentes/Configuracion), logo `<Image>`, SheetContent `className="w-64 p-0"`. NO recibe flag hoy. NO importado en `(dashboard)/layout.tsx` (solo en header.tsx marketing).
- `(dashboard)/layout.tsx`: el shell es `<div className="flex h-screen">` (58-66) con `<Sidebar hidden md:flex>` (67-72) + `<main>` (73-80). `isEditorialV3` resuelto en 43-45. NO monta mobile-nav hoy. Plan 01 (Wave 1) agrega `v3={isEditorialV3}` al `<Sidebar>` — este plan (Wave 2) agrega el mount del mobile-nav; `depends_on [01]` serializa los dos edits del MISMO archivo (no escriben concurrente).
- Plan 01 ya autorizó `.theme-editorial-v3 nav.sb-nav/.cat/li a/...` en globals.css (depends_on [01] garantiza que existen).
- Únicos montajes pre-D-05b: header.tsx (marketing-only, byte-frozen). El dashboard no montaba MobileNav (Wave 0) — este plan introduce el primer mount dashboard, v3-only.
</facts-already-verified>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar prop v3 + branch if (v3) reskin editorial a mobile-nav.tsx (D-05)</name>
  <read_first>
    - src/components/layout/mobile-nav.tsx (componente COMPLETO — Sheet, navItems, SheetContent)
    - src/components/layout/sidebar.tsx branch if (v3) de Plan 01 (referencia de las clases editoriales del nav: .sb-nav, .cat, li a, badges) — reusar el mismo lenguaje visual
    - .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md (mecanismo: prop v3 default false, branch gated, NO provider nuevo; D-05b mount v3-only en el dashboard)
    - RESEARCH §Pattern 4 (estrategia mobile-nav v3) + §Pitfall 6 (threading) + §Pitfall 3 (sin compound dark)
  </read_first>
  <action>
    En `src/components/layout/mobile-nav.tsx`:
    1. Agregar la prop a la firma: `export function MobileNav({ v3 = false }: { v3?: boolean } = {})`. Documentar con un comentario JSDoc breve (flag `ui_editorial_v3`, additive, default false byte-frozen; el header de marketing NO pasa v3 → render actual intacto).
    2. Insertar un branch `if (v3) { return (<Sheet open={open} onOpenChange={setOpen}>...</Sheet>) }` ANTES del return actual. El branch v3:
       - `<SheetTrigger asChild>`: mantener el botón Menu (puede llevar look editorial `.icon-btn` opcional, sin romper accesibilidad — conservar el `<span className="sr-only">`). El trigger es el botón visible en mobile: el `<Sheet>` provee su PROPIO botón trigger, así que el mount del dashboard (Task 2) solo necesita posicionarlo, no proveer un header bar.
       - `<SheetContent side="left" className="theme-editorial-v3 sb w-64 p-0">` — la clase `theme-editorial-v3` hace que los tokens resuelvan (Opción B); `sb` aplica el fondo plano editorial (background:var(--paper-2), background-image:none) ya autorizado en Plan 01.
       - Header: wordmark tipográfico `<div className="brand"><div className="wm">morf<b>·</b>x</div></div>` (consistente con el sidebar v3) en vez del `<Image>` legacy. Si SheetTitle es requerido para a11y, envolver el wordmark en `<SheetTitle>` con la clase `wm` (mantener accesibilidad).
       - Nav: usar un markup `<nav className="sb-nav">` con las clases editoriales `.cat` + `<ul><li><Link className={isActive ? 'active' : ''}>`. Cada `<Link>` mantiene `onClick={() => setOpen(false)}` (cerrar el sheet al navegar). Reusar el `navItems` plano local envuelto en el markup `.sb-nav/li a` editorial, o `navCategoriesV2` si se prefiere paridad de categorías (discrecional — lo load-bearing es el look v3).
    3. El `return` actual (path no-v3, líneas 50-93) queda EXACTAMENTE igual — byte-frozen (Regla 6 / D-05).
    Pitfall 3: NUNCA usar selector compound dark; el dark del Sheet lo cubre `.dark .theme-editorial-v3` global vía cascade (el `<SheetContent>` es descendiente de `<html>.dark`).
  </action>
  <verify>
    <automated>grep -q 'v3' src/components/layout/mobile-nav.tsx && grep -q 'theme-editorial-v3' src/components/layout/mobile-nav.tsx && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `mobile-nav.tsx` define la prop `v3?: boolean` con default `false`
    - Existe un branch `if (v3)` que retorna ANTES del return actual
    - El `<SheetContent>` del branch v3 lleva `theme-editorial-v3` en su className
    - El branch v3 usa clases editoriales del nav (`sb-nav` / `cat` / `active`) — no shadcn `bg-accent` para los items v3
    - Cada `<Link>` del branch v3 conserva `onClick={() => setOpen(false)}`
    - El `return` no-v3 (50-93) queda byte-frozen (git diff NO muestra cambios dentro de ese rango — solo la prop nueva + el branch nuevo arriba)
    - NO hay selector compound `.theme-editorial-v3.dark` introducido
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Branch v3 del mobile-nav (SheetContent scoped + nav editorial) agregado; path no-v3 byte-frozen; typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 2: Cablear el mount v3-only md:hidden de MobileNav en (dashboard)/layout.tsx (D-05b)</name>
  <read_first>
    - src/app/(dashboard)/layout.tsx (shell COMPLETO: `<div className="flex h-screen">` 58-66; `<Sidebar ... v3={isEditorialV3} />` 67-72 tras Plan 01; `<main>` 73-80; `isEditorialV3` resuelto en 43-45). Plan 01 (Wave 1) ya editó este archivo; este edit es aditivo encima.
    - src/components/layout/mobile-nav.tsx (Task 1 — prop v3 ya agregada; el Sheet provee su propio trigger, no requiere header bar externo)
    - .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md (D-05b lockeado: mount v3-only md:hidden)
    - RESEARCH §Pattern 4 + §Pitfall 6 (threading)
  </read_first>
  <action>
    En `src/app/(dashboard)/layout.tsx`:
    1. Agregar el import: `import { MobileNav } from '@/components/layout/mobile-nav'` (junto al import de `Sidebar`).
    2. Montar el mobile-nav v3-only DENTRO del shell `<div className="flex h-screen">`, donde corresponde un trigger móvil. El `<Sheet>` del MobileNav provee su PROPIO botón trigger (`<SheetTrigger>` con el botón Menu), así que NO se necesita un header bar nuevo — basta envolver el `<MobileNav v3 />` en el `<div className="md:hidden">` que lo posiciona en mobile. Colocarlo como PRIMER hijo del `<div className="flex h-screen">` (antes del `<Sidebar>`), de modo que el botón trigger sea visible en la esquina superior izquierda en mobile (el sidebar `hidden md:flex` no aparece ahí). Estructura objetivo:
       ```tsx
       <div className={cn(... 'flex h-screen', isDashboardV2 && 'theme-editorial')}>
         {isEditorialV3 && (
           <div className="md:hidden">
             <MobileNav v3 />
           </div>
         )}
         <Sidebar
           workspaces={workspaces}
           currentWorkspace={currentWorkspace}
           user={user}
           v2={isDashboardV2}
           v3={isEditorialV3}
         />
         <main ...>{children}</main>
       </div>
       ```
       Si al leer el layout el ejecutor determina que el trigger del Sheet necesita un contenedor con posicionamiento (ej. una barra superior fija en mobile para que el botón Menu sea alcanzable sobre el contenido), envolver el `<MobileNav v3 />` en ese wrapper mínimo (siempre dentro del `{isEditorialV3 && ...}` + `md:hidden`). Documentar en el SUMMARY si se usó wrapper plano (`<div className="md:hidden">`) o un header bar con posicionamiento, y por qué. Mantener el wrapper mínimo y editorial (sin chrome shadcn).
    3. RESTRICCIONES DURAS (Regla 6 / D-05b):
       - El gate `isEditorialV3 &&` es OBLIGATORIO: para usuarios no-v3, el dashboard NO debe montar ningún mobile-nav (igual que hoy). Sin el gate, romperías el path no-v3.
       - El `md:hidden` limita el mount a mobile (el sidebar `hidden md:flex` cubre desktop).
       - NO tocar el `<main>` (73-80) ni su clase `isEditorialV3 && 'theme-editorial-v3'` (eso es D-03, Plan 01).
       - NO tocar el `<Sidebar>` ni su prop `v3={isEditorialV3}` (Plan 01).
       - NO pasar `v3` al `<MobileNav />` del header de marketing (`header.tsx`) — ese path queda byte-frozen; este plan NO toca `header.tsx`.
  </action>
  <verify>
    <automated>grep -q "import { MobileNav }" 'src/app/(dashboard)/layout.tsx' && awk '/isEditorialV3 *&&/{g=NR} /<MobileNav/{if(g>0&&NR-g<=6)f=1} END{exit f?0:1}' 'src/app/(dashboard)/layout.tsx' && grep -q 'md:hidden' 'src/app/(dashboard)/layout.tsx' && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `layout.tsx` importa `MobileNav` desde `@/components/layout/mobile-nav`
    - El mount está gated v3-only: existe un bloque `{isEditorialV3 && ( ... <MobileNav ... /> ... )}` (la condición `isEditorialV3 &&` aparece ≤6 líneas antes del `<MobileNav` — verificable con la proximidad awk del verify; OJO: el grep de este repo es ugrep, evitar grep -Pz)
    - El `<MobileNav>` del mount lleva la prop `v3` (`<MobileNav v3 />`)
    - El mount está envuelto en un contenedor `md:hidden` (mobile-only; el sidebar cubre desktop)
    - `git diff -- 'src/app/(dashboard)/layout.tsx'` muestra SOLO el import nuevo + el bloque del mount — el `<main>` (73-80) y la prop `v3={isEditorialV3}` del `<Sidebar>` (de Plan 01) quedan SIN cambios
    - `header.tsx` NO fue tocado (`git diff -- src/components/layout/header.tsx` vacío) — el mobile-nav de marketing no recibe v3
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Mount v3-only md:hidden de <MobileNav v3 /> cableado en layout.tsx (gated isEditorialV3); reskin alcanzable; main/sidebar/header intactos; typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 3: APPEND reglas CSS específicas del mobile-nav v3 a globals.css (solo si el branch usa clases nuevas)</name>
  <read_first>
    - src/app/globals.css (reglas `.theme-editorial-v3 nav.sb-nav/.cat/li a/...` autorizadas en Plan 01 — el mobile-nav las REUSA; el APPEND aquí es solo para clases que el sidebar no cubra, ej. ajustes de `.brand` dentro del Sheet)
    - mobile-nav.tsx branch v3 (Task 1 — para saber qué clases nuevas, si alguna, requieren regla)
    - RESEARCH §Pattern 4 + §Pitfall 5 (no editar legacy) + §Pitfall 3 (descendant-only)
  </read_first>
  <action>
    Si el branch v3 del mobile-nav (Task 1) reusa EXCLUSIVAMENTE clases ya autorizadas en Plan 01 (`.sb`, `.sb-nav`, `.cat`, `li a`, `.brand`, `.wm`), entonces NO se necesita CSS nuevo — documentar "sin APPEND necesario" en el SUMMARY y dejar globals.css sin cambios.
    Si el branch introduce alguna clase específica del mobile-nav (ej. un ajuste de padding del `.brand` dentro del Sheet, o un override `.mnav-*` propio), APPEND esas reglas DESPUÉS del bloque del sidebar v3 (el agregado en Plan 01, antes de `@layer base`), SIEMPRE bajo el selector `.theme-editorial-v3 ...`:
    ```css
    /* ===== Mobile-nav v3 (standalone ui-redesign-editorial-shell, D-05) =====
     * APPEND ONLY. Reusa las clases del sidebar v3; agrega solo overrides
     * especificos del Sheet movil. Descendant-only (sin compound dark). */
    /* (ejemplo, solo si hace falta) .theme-editorial-v3 .sb .brand { padding:16px } */
    ```
    NO editar reglas legacy `.theme-editorial ` (sin guion). NO usar compound dark. Mantener el APPEND mínimo (preferir reuso de las clases del sidebar).
  </action>
  <verify>
    <automated>git diff HEAD -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]' && echo "ALERTA-legacy" || echo "OK-legacy-frozen"; CHANGED=$(git diff HEAD -- src/app/globals.css | grep -E '^\+\.' | grep -v 'theme-editorial-v3'); test -z "$CHANGED" && echo "OK-all-under-v3" || echo "ALERTA-fuera-de-v3"; pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Si se agregó CSS: TODAS las líneas `+` con selector empiezan por `.theme-editorial-v3` (ninguna toca `.theme-editorial ` sin guion)
    - Condicional (solo si globals.css cambió): `git diff HEAD -- src/app/globals.css | grep -E '^\+\.' | grep -v 'theme-editorial-v3'` está VACÍO (todas las reglas nuevas bajo el scope v3)
    - `git diff HEAD -- src/app/globals.css | grep '^+' | grep -E '\.theme-editorial[^-]'` está VACÍO (legacy frozen)
    - `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` está VACÍO (sin compound dark)
    - Si NO se necesitó CSS, el SUMMARY documenta "sin APPEND — reuso total de clases del sidebar v3"
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>CSS del mobile-nav v3 mínimo (o nulo) bajo .theme-editorial-v3; legacy frozen; sin compound dark; typecheck verde.</done>
</task>

</tasks>

<verification>
- Visual: screenshot del Sheet v3 abierto en mobile (light + dark), abierto desde el trigger del mount nuevo en el dashboard — gateado en Plan 04 (dark audit) + QA visual.
- Per-commit gate: `pnpm typecheck`.
- Regla 6: el path no-v3 del mobile-nav byte-frozen; `header.tsx` (mobile-nav de marketing) byte-frozen; el mount del dashboard gated v3-only; reglas legacy de globals.css intactas. Verificado en Plan 05.
</verification>

<success_criteria>
- Con v3=true, el dashboard monta (md:hidden) un mobile-nav editorial alcanzable; con v3=false (default), el dashboard NO monta mobile-nav (igual que hoy) y el componente renderiza byte-idéntico al actual.
- Sin reglas legacy tocadas; sin compound dark; header.tsx intacto.
- typecheck verde.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/03-SUMMARY.md`
</output>
