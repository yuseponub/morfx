---
phase: ui-redesign-editorial-shell
plan: 00
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md
autonomous: true
requirements: [D-03, D-04, D-05]

must_haves:
  truths:
    - "Todos los sitios de montaje de <MobileNav /> están localizados y documentados (gating del flag para D-05)"
    - "La decisión D-05b queda lockeada por escrito: el dashboard HOY no monta mobile-nav; se agrega un mount v3-only md:hidden en (dashboard)/layout.tsx → {isEditorialV3 && <MobileNav v3 />}"
    - "La precedencia if (v3) ANTES de if (v2) en sidebar.tsx queda lockeada por escrito"
    - "Está documentado si los empty-states v3 (contactos/pedidos) renderizan topbar editorial (→ toggle) o no"
  artifacts:
    - path: ".planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md"
      provides: "Decisiones lockeadas que consumen las waves 1-4 (mount sites, D-05b mount v3-only en dashboard, precedencia, empty-states, mecanismo de threading)"
      min_lines: 25
  key_links:
    - from: ".planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md"
      to: "01-PLAN.md (sidebar) + 02-PLAN.md (toggle) + 03-PLAN.md (mobile-nav + mount D-05b)"
      via: "decisiones que las waves posteriores citan literalmente"
      pattern: "MobileNav|precedencia|empty|D-05b"
---

<objective>
Resolver las 3 preguntas abiertas del RESEARCH que gatean las waves posteriores, y dejarlas lockeadas en un documento que las waves 1-4 consumen verbatim. NO toca código — solo investigación dirigida + decisiones por escrito.

Purpose: el RESEARCH marca 3 Wave 0 Gaps (sitios de montaje de `<MobileNav />`, precedencia v3/v2 en el sidebar, empty-states con/sin topbar). Resolverlos ANTES de tocar código evita re-trabajo y bloqueos en paralelo (Pitfall 6 mobile-nav threading, Pitfall 7 precedencia). Tras el plan-check, el usuario resolvió la alcanzabilidad del mobile-nav v3 (D-05b): se cablea un mount real v3-only en el dashboard — esta wave lo lockea como decisión que Plan 03 consume.
Output: `WAVE0-DECISIONS.md` con las decisiones lockeadas.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/RESEARCH.md
@.planning/standalone/ui-redesign-editorial-shell/CONTEXT.md

<facts-already-verified>
<!-- El planner ya corrió estos greps/reads. Confírmalos, NO re-investigues desde cero. -->
- `grep -rn 'MobileNav' src/` → SOLO 2 sitios reales:
  - `src/components/layout/mobile-nav.tsx:46` (la definición del componente).
  - `src/components/layout/header.tsx:4,11` (el ÚNICO import + render: `<MobileNav />`).
- `<Header />` (que monta MobileNav) se renderiza SOLO en `src/app/(marketing)/[locale]/layout.tsx:43` — NO en `(dashboard)/layout.tsx`. El dashboard hoy NO renderiza MobileNav en ningún lado.
- `(dashboard)/layout.tsx` ya resuelve `isEditorialV3` (línea 43-45) y renderiza `<Sidebar v2={isDashboardV2} />` (67-72). El sidebar es `hidden md:flex` (desktop-only) → en mobile el dashboard hoy NO tiene navegación alguna.
- Empty-state contactos v3: `empty-state.tsx:18-62` (`if (v3)`) renderiza una `<section className="page">` CENTRADA, SIN `<header className="topbar">` → no hay topbar → no necesita toggle.
- Empty-state pedidos: `orders-view.tsx:1176-1189` es el bloque legacy shadcn (`isEmpty`), SIN topbar editorial; la rama v3 con topbar es `if (v3 && !isEmpty)` (línea 940). El topbar v3 SOLO existe cuando hay pedidos.
- Sidebar: prop actual `v2 = false` (sidebar.tsx:194); branch `if (v2)` en 220-396; legacy return en 398-591. Los flags `ui_dashboard_v2` y `ui_editorial_v3` son independientes (un workspace podría tener ambos).
</facts-already-verified>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Confirmar mount sites de MobileNav + lockear D-05b (mount v3-only en el dashboard) + mecanismo de threading del flag (D-05/D-05b)</name>
  <read_first>
    - src/components/layout/mobile-nav.tsx (componente completo — 94 líneas, no recibe flag hoy)
    - src/components/layout/header.tsx (monta `<MobileNav />`; SIN acceso al flag; usado solo en marketing layout)
    - src/app/(dashboard)/layout.tsx (resuelve `isEditorialV3` en línea 43-45; renderiza `<Sidebar hidden md:flex>`; NO renderiza Header/MobileNav — sin nav móvil hoy)
    - CONTEXT.md D-05 + D-05b (enmienda post plan-check: mount nuevo md:hidden v3-only en el dashboard)
    - RESEARCH §Pattern 4 + §Pitfall 6 + §Open Questions #1 (threading del flag client/server)
  </read_first>
  <action>
    Confirmar con `grep -rn 'MobileNav' src/` y `grep -rn '<Header' src/` que los sitios de montaje son los ya identificados (mobile-nav.tsx + header.tsx; Header solo en marketing). Documentar el resultado exacto en `WAVE0-DECISIONS.md`.
    Lockear el mecanismo de threading + la decisión D-05b (justificada en el doc):
    - **Mecanismo del componente:** agregar prop `v3?: boolean` a `MobileNav` con default `false`. El branch reskin v3 se gatea por esa prop (`if (v3) return (<Sheet ...>editorial</Sheet>)`); el path no-v3 queda byte-frozen por early-return.
    - **D-05b — mount real v3-only en el dashboard (LOCKED):** el usuario resolvió la advertencia de reachability del plan-check eligiendo "cablear un mount real". El dashboard HOY no monta ningún mobile-nav (el sidebar es `hidden md:flex` = desktop-only), así que el reskin v3 quedaría como dead-code sin un mount. La decisión: agregar en `(dashboard)/layout.tsx` un mount NUEVO `md:hidden` gated v3-only:
      ```tsx
      {isEditorialV3 && (
        <div className="md:hidden">
          <MobileNav v3 />
        </div>
      )}
      ```
      `isEditorialV3` ya está resuelto en ese RSC (línea 43-45). El gate `isEditorialV3 &&` garantiza que para usuarios **no-v3 el dashboard sigue EXACTAMENTE igual que hoy (sin mobile-nav)** — Regla 6. El `md:hidden` lo limita a mobile (donde el sidebar `hidden md:flex` no aparece). El `<MobileNav>` del header de marketing (`header.tsx`) queda **byte-frozen** (NO se le pasa `v3`, NO se toca). El `<MobileNav v3 />` del dashboard pasa `v3` para renderizar el reskin editorial. Plan 03 implementa la prop + branch + este mount; Plan 03 `depends_on` Plan 01 para serializar los dos edits de `layout.tsx`.
    - **NO** se introduce un `EditorialV3Provider` nuevo (over-engineering — Don't Hand-Roll): `isEditorialV3` ya está en el RSC del layout y se pasa directo como prop al mount.
    - Registrar en el doc: "MobileNav SÍ se monta ahora en el dashboard (D-05b, v3-only md:hidden). El path marketing (header.tsx) sigue sin `v3` = byte-frozen. El reskin v3 es alcanzable vía el mount nuevo."
  </action>
  <verify>
    <automated>grep -rn 'MobileNav' src/ | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `WAVE0-DECISIONS.md` lista los sitios de montaje exactos de `<MobileNav />` con archivo:línea (mobile-nav.tsx + header.tsx) y confirma que Header solo vive en el marketing layout
    - El doc lockea el mecanismo: prop `v3?: boolean` default false en MobileNav, branch gated, NO nuevo provider
    - El doc lockea D-05b verbatim: mount NUEVO `md:hidden` v3-only en `(dashboard)/layout.tsx` (`{isEditorialV3 && <div className="md:hidden"><MobileNav v3 /></div>}`), con la implicación de Regla 6 (no-v3 = sin mobile-nav, igual que hoy; header.tsx marketing byte-frozen)
    - El doc indica que el mount del dashboard lo implementa Plan 03 y que Plan 03 `depends_on` Plan 01 (ambos editan `layout.tsx` → se serializan)
    - `grep -rn 'MobileNav' src/ | wc -l` devuelve el conteo (3 líneas pre-implementación: 1 def + 1 import + 1 render marketing) — documentado en el SUMMARY
  </acceptance_criteria>
  <done>Mount sites confirmados + mecanismo de threading (prop v3 default false) + D-05b (mount v3-only md:hidden en dashboard, consumido por Plan 03) lockeados por escrito.</done>
</task>

<task type="auto">
  <name>Task 2: Lockear precedencia v3/v2 en el sidebar + empty-states con/sin topbar (D-03/D-04)</name>
  <read_first>
    - src/components/layout/sidebar.tsx (prop `v2` en 194; branch `if (v2)` en 220-396; legacy return 398-591)
    - src/app/(dashboard)/crm/contactos/components/empty-state.tsx (rama `if (v3)` 18-62 — SIN topbar)
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx (topbar v3 en `if (v3 && !isEmpty)` línea 940; empty legacy 1176-1189 SIN topbar)
    - RESEARCH §Pitfall 7 (precedencia) + §Open Questions #2 y #3
  </read_first>
  <action>
    Lockear en `WAVE0-DECISIONS.md` las dos decisiones:
    1. **Precedencia sidebar (Pitfall 7):** `if (v3)` va ANTES de `if (v2)` y ANTES del return legacy. Justificación: v3 implica el ecosistema editorial completo; gana sobre v2. Documentar la estructura objetivo:
       ```
       export function Sidebar({ ..., v2 = false, v3 = false }) {
         ... // filterItem + workspaceSubline compartidos
         if (v3) { return (<aside className="sb theme-editorial-v3 ...">...</aside>) }   // NUEVO
         if (v2) { return (...) }   // byte-frozen 220-396
         return (...)               // legacy byte-frozen 398-591
       }
       ```
    2. **Empty-states (Open Question #3):** documentar que NINGÚN empty-state v3 renderiza topbar editorial:
       - Contactos: `empty-state.tsx` v3 es una `<section className="page">` centrada → NO topbar → NO toggle.
       - Pedidos: el empty (`isEmpty`, línea 1176) es el bloque legacy shadcn → NO topbar editorial → NO toggle. El topbar v3 (con `.actions`) solo existe en `if (v3 && !isEmpty)`.
       - **Conclusión lockeada:** el toggle (D-04) se agrega SOLO en los 3 topbars con datos: inbox (ya), contactos `if (v3)` topbar, pedidos `if (v3 && !isEmpty)` topbar. Los empty-states quedan FUERA de scope para el toggle.
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md && grep -qi 'precedencia' .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `WAVE0-DECISIONS.md` lockea precedencia `if (v3)` ANTES de `if (v2)` con la estructura objetivo del sidebar
    - El doc documenta que los empty-states v3 (contactos y pedidos) NO renderizan topbar editorial → el toggle va solo en los 3 topbars con datos
    - El doc cita los archivos:líneas que respaldan cada decisión
    - El archivo existe y contiene la palabra "precedencia"
  </acceptance_criteria>
  <done>Precedencia v3>v2 + alcance del toggle (3 topbars con datos, empty-states fuera) lockeados por escrito.</done>
</task>

</tasks>

<verification>
- Sin código tocado en esta wave — solo el doc de decisiones.
- Las 3 Wave 0 Gaps del RESEARCH (§Wave 0 Gaps) quedan resueltas y documentadas, más la decisión D-05b (mount v3-only en el dashboard) lockeada para Plan 03.
</verification>

<success_criteria>
- `WAVE0-DECISIONS.md` existe con: mount sites de MobileNav, mecanismo de threading (prop v3 default false), D-05b (mount v3-only md:hidden en el dashboard), precedencia v3>v2, y alcance del toggle (empty-states fuera).
- Las waves 1-4 pueden arrancar sin preguntas abiertas.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/00-SUMMARY.md`
</output>
