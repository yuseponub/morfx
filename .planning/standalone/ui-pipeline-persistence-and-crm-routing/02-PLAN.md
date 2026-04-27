---
phase: ui-pipeline-persistence-and-crm-routing
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/crm/page.tsx
  - src/components/layout/sidebar.tsx
autonomous: true
requirements_addressed: [ROUTING-01, ROUTING-02, ROUTING-03]
user_setup: []

must_haves:
  truths:
    - "Click en `CRM` del sidebar v2 lleva directamente a `/crm/pedidos` (no a `/crm/contactos`) — ROUTING-01 + D-07."
    - "Sidebar v2 (`navCategoriesV2[0].items`) ya NO tiene el item `Pedidos` con icon Package — ROUTING-02 + D-08. Categoria 'Operación' queda con 5 items: CRM, WhatsApp, Tareas, Confirmaciones, SMS."
    - "Sidebar legacy (`navItems[]` lineas 44-122) y el render block legacy quedan byte-identical — ROUTING-03 + D-10 + Regla 6 spirit (D-13). Verificable via `git diff src/components/layout/sidebar.tsx`."
    - "El `import` de `lucide-react` (sidebar.tsx linea 6) ya NO incluye `Package` — esta solo era referenciado en linea 146 que se borra (RESEARCH §Open Questions Q3 + verified grep). El proyecto tiene TS strict, asi que dejar el import unused dispararia warning."
    - "El JSDoc de `crm/page.tsx` (lineas 5-15) refleja el cambio: v2 ahora redirige a `/crm/pedidos` (no a `/crm/contactos`). El comentario explica que Contactos sigue accesible via `<CrmTabs/>` rendered por `crm/layout.tsx` (D-09)."
    - "La rama legacy `redirect('/crm/pedidos')` (linea 25) y el bloque de detection v2 (lineas 17-20) quedan byte-identical (D-10 + Regla 6 spirit)."
    - "Build local pasa: `npm run lint && npm run build`."
  artifacts:
    - path: "src/app/(dashboard)/crm/page.tsx"
      provides: "Server component que redirige a /crm/pedidos en BOTH branches (v2=true y fall-through). Solo cambia el target de la rama v2 (linea 23) y su JSDoc."
      contains: "redirect('/crm/pedidos')"
    - path: "src/components/layout/sidebar.tsx"
      provides: "Sidebar v2 sin item duplicado de Pedidos. navCategoriesV2[0].items con 5 items (CRM, WhatsApp, Tareas, Confirmaciones, SMS)."
      contains: "navCategoriesV2"
  key_links:
    - from: "Click en sidebar v2 'CRM' (sidebar.tsx:144)"
      to: "redirect a /crm/pedidos (crm/page.tsx:23 inside if v2 branch)"
      via: "Next.js Link href='/crm' → server-side redirect"
      pattern: "redirect\\('/crm/pedidos'\\)"
    - from: "navCategoriesV2[0].items"
      to: "5 items renderizados (CRM, WhatsApp, Tareas, Confirmaciones, SMS) — sin Pedidos duplicado"
      via: "static config consumed by sidebar v2 render block"
      pattern: "navCategoriesV2"
    - from: "git diff src/components/layout/sidebar.tsx"
      to: "exactamente 2 cambios visibles (linea 6 import + linea 146 item) y nada mas"
      via: "Regla 6 byte-identical verification"
      pattern: "navItems\\[\\]"
---

<objective>
Wave 1 — CRM landing redirect + sidebar v2 cleanup. Cubre ROUTING-01, ROUTING-02, ROUTING-03.

Purpose: arreglar estructuralmente la duplicidad de navegacion CRM en v2 (sidebar tiene "CRM" Y "Pedidos" apuntando al mismo destino logico) y hacer que el destino sea consistente con la nueva expectativa del usuario (kanban es la surface principal de CRM en v2).

Output: 2 archivos modificados con diffs minimos:
- `crm/page.tsx`: 1 linea de redirect (lineas 23) + JSDoc rewrite (lineas 5-15).
- `sidebar.tsx`: 1 linea borrada (linea 146 item Pedidos) + 1 linea editada (linea 6 import sin Package).

**CRITICAL — Regla 6 spirit (D-10 + D-13):** Aunque Regla 6 literal aplica solo a agentes, el principio byte-identical fail-closed se respeta para la rama legacy. Concretamente:
- `crm/page.tsx`: SOLO cambiar la linea 23 (target del `redirect()` dentro de `if (v2) {...}`) y los lineas 5-15 (JSDoc). El bloque de detection v2 (lineas 17-20) y el fall-through linea 25 (`redirect('/crm/pedidos')`) quedan byte-identical.
- `sidebar.tsx`: SOLO tocar la linea 146 (item Pedidos en `navCategoriesV2[0].items`) y la linea 6 (import — quitar `Package`). El array `navItems[]` (lineas 44-122) y el render block legacy quedan byte-identical.

**CRITICAL — Validation post-edit:** `git diff src/components/layout/sidebar.tsx` debe mostrar EXACTAMENTE 2 cambios (1 deletion en linea 146, 1 modification en linea 6). Si aparece un cambio en otra linea, REVERTIR y reintentar — significa que se toco codigo fuera de scope.

**CRITICAL — Package import removal (RESEARCH §Open Questions Q3):** Verificado por grep que `Package` SOLO aparece en linea 6 (import) y linea 146 (item Pedidos). Despues de borrar la linea 146, `Package` queda unused. Removerlo del import es OBLIGATORIO porque el proyecto tiene TS strict mode + ESLint que warning sobre unused imports.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md  # decisiones D-07 (redirect target), D-08 (delete item), D-09 (Contactos via CrmTabs), D-10 (sidebar legacy NO se toca), D-13 (Regla 6 spirit)
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md  # §Code Examples "crm/page.tsx — D-07 single-line change" (lineas 661-697) + "sidebar.tsx — D-08 delete one line" (lineas 699-734); §Open Questions Q3 (Package import removal)
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/PATTERNS.md  # Pattern Map para crm/page.tsx + sidebar.tsx (analog: el archivo mismo, edit recipes); §Pattern F (v2 vs legacy fail-closed branching)
@CLAUDE.md  # Regla 0 (GSD complete), Regla 1 (push a Vercel post-cambios), Regla 6 spirit (proteger comportamiento legacy)
@src/app/(dashboard)/crm/page.tsx  # archivo a modificar — 26 lineas hoy
@src/components/layout/sidebar.tsx  # archivo a modificar — 593 lineas, lineas 6 import + 140-151 navCategoriesV2[0]
@src/app/(dashboard)/crm/layout.tsx  # NO se toca, solo lectura — render `<CrmTabs/>` cuando v2=true. Confirma D-09 (Contactos sigue accesible via tabs)
@src/app/(dashboard)/crm/components/crm-tabs.tsx  # NO se toca, solo lectura — Contactos | Pedidos·kanban | Pipelines | Configuración tabs editoriales

<interfaces>
<!-- Estado actual de crm/page.tsx (VERIFIED, 26 lineas) -->
import { redirect } from 'next/navigation'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

/**
 * CRM hub root redirect.
 *
 * - v2=false: preserve current behavior (redirect to `/crm/pedidos`).
 * - v2=true:  redirect to `/crm/contactos` — the first tab of the
 *   editorial CRM hub (mock crm.html line 121, `<a class="on">
 *   Contactos`). This matches the mock's default landing tab.
 *
 * Regla 6 byte-identical fail-closed: any error or missing workspace
 * falls through to `/crm/pedidos`.
 */
export default async function CRMPage() {
  const activeWorkspaceId = await getActiveWorkspaceId()
  const v2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false

  if (v2) {
    redirect('/crm/contactos')   // ← LINE 23: change to '/crm/pedidos'
  }
  redirect('/crm/pedidos')        // ← LINE 25: byte-identical (D-10)
}

<!-- Estado actual de sidebar.tsx linea 6 (VERIFIED) -->
import { Building2, MessageSquare, MessageSquareText, Settings, Users, LogOut, ListTodo, BarChart3, Bot, Zap, Sparkles, Terminal, CalendarCheck, TrendingUp, Package, FlaskConical } from 'lucide-react'
//                                                                                                                                                                              ^^^^^^^ remove

<!-- Estado actual de sidebar.tsx lineas 140-151 (VERIFIED) -->
const navCategoriesV2: SidebarCategoryV2[] = [
  {
    label: 'Operación',
    items: [
      { href: '/crm', label: 'CRM', icon: Building2 },
      { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { href: '/crm/pedidos', label: 'Pedidos', icon: Package },     // ← LINE 146: DELETE this entire line
      { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
      { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
      { href: '/sms', label: 'SMS', icon: MessageSquareText },
    ],
  },
  // …rest unchanged…
]

<!-- Estado actual de sidebar.tsx lineas 44-122 (VERIFIED — NO touch — D-10 + Regla 6 spirit) -->
const navItems: NavItem[] = [
  { href: '/crm', label: 'CRM', icon: Building2 },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { href: '/sms', label: 'SMS', icon: MessageSquareText },
  // ... (12 items more — todos byte-identical)
]
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Modificar `crm/page.tsx` — cambiar redirect target en rama v2 + actualizar JSDoc (D-07)</name>
  <read_first>
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Code Examples "crm/page.tsx — D-07 single-line change" (lineas 661-697) — copiar verbatim
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md §Decisiones D-07 (target del redirect), §D-09 (Contactos sigue via CrmTabs), §D-10 (legacy queda igual)
    - src/app/(dashboard)/crm/page.tsx (estado actual — 26 lineas con JSDoc actual)
  </read_first>
  <action>
    **Paso 1 — Reemplazar `src/app/(dashboard)/crm/page.tsx` completo** con el contenido literal siguiente. NO paraphrase, NO reordenar imports.

    ```typescript
    import { redirect } from 'next/navigation'
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    import { getActiveWorkspaceId } from '@/app/actions/workspace'

    /**
     * CRM hub root redirect.
     *
     * - v2=false: preserve current behavior (redirect to `/crm/pedidos`).
     * - v2=true:  redirect to `/crm/pedidos` — kanban is the primary CRM
     *   surface in the editorial v2 design (Standalone
     *   ui-pipeline-persistence-and-crm-routing D-07). Contactos remains
     *   accessible via the <CrmTabs/> strip rendered by crm/layout.tsx.
     *
     * Regla 6 byte-identical fail-closed: any error or missing workspace
     * falls through to `/crm/pedidos`.
     */
    export default async function CRMPage() {
      const activeWorkspaceId = await getActiveWorkspaceId()
      const v2 = activeWorkspaceId
        ? await getIsDashboardV2Enabled(activeWorkspaceId)
        : false

      if (v2) {
        redirect('/crm/pedidos')
      }
      redirect('/crm/pedidos')
    }
    ```

    **Paso 2 — Verificar que el diff es minimo:**

    Diferencias vs el archivo actual (verificable via `git diff`):
    - Lineas 8-13 del JSDoc: contenido cambia para describir D-07 + ref a CrmTabs (D-09).
    - Linea 23: `redirect('/crm/contactos')` → `redirect('/crm/pedidos')`.
    - Linea 25: `redirect('/crm/pedidos')` queda byte-identical (D-10).
    - Imports (lineas 1-3) y la signature de `CRMPage` quedan byte-identical.
    - Bloque de v2 detection (lineas 17-20) queda byte-identical.

    El comentario "Regla 6 byte-identical fail-closed" se preserva textual (D-10).

    **Paso 3 — Sanity check del diff:**
    ```bash
    git diff src/app/(dashboard)/crm/page.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}' | wc -l
    ```
    Esperado: ~10 lineas cambiadas (5-7 lineas del JSDoc + 1 linea del redirect target). Si el output es muy mayor (>15), revisar — significa que se toco codigo extra fuera de scope.

    **Paso 4 — Validar TS strict + ESLint:**
    ```bash
    npm run lint -- src/app/(dashboard)/crm/page.tsx
    ```

    **Paso 5 — NO commit todavia.** Este task se commitea junto con Task 2 en Task 3.
  </action>
  <verify>
    <automated>test -f src/app/(dashboard)/crm/page.tsx</automated>
    <automated>! grep -q "redirect('/crm/contactos')" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>test "$(grep -c "redirect('/crm/pedidos')" src/app/(dashboard)/crm/page.tsx)" = "2"</automated>
    <automated>grep -q "ui-pipeline-persistence-and-crm-routing D-07" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>grep -q "<CrmTabs/> strip rendered by crm/layout.tsx" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>grep -q "Regla 6 byte-identical fail-closed" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>grep -q "import { redirect } from 'next/navigation'" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>grep -q "import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>grep -q "import { getActiveWorkspaceId } from '@/app/actions/workspace'" src/app/(dashboard)/crm/page.tsx</automated>
    <automated>git diff src/app/(dashboard)/crm/page.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}' | wc -l | awk '{ if ($1 > 20) exit 1 }'</automated>
  </verify>
  <acceptance_criteria>
    - Linea 23 ahora dice `redirect('/crm/pedidos')` (verificable via `! grep -q "redirect('/crm/contactos')"`).
    - El archivo tiene exactamente 2 ocurrencias de `redirect('/crm/pedidos')` (rama v2 + fall-through legacy).
    - El JSDoc menciona "ui-pipeline-persistence-and-crm-routing D-07" y "<CrmTabs/> strip rendered by crm/layout.tsx" (per RESEARCH §Code Examples).
    - El comentario "Regla 6 byte-identical fail-closed" sigue presente.
    - Los 3 imports (`redirect`, `getIsDashboardV2Enabled`, `getActiveWorkspaceId`) quedan byte-identical.
    - El bloque `const activeWorkspaceId = await getActiveWorkspaceId()` y `const v2 = activeWorkspaceId ? ... : false` queda byte-identical.
    - `git diff` reporta menos de 20 lineas cambiadas (sanity — JSDoc + linea 23 = ~10).
    - `npm run lint` pasa.
  </acceptance_criteria>
  <done>
    - Archivo modificado, NO commit todavia.
  </done>
</task>

<task type="auto">
  <name>Task 2: Modificar `sidebar.tsx` — borrar item Pedidos de navCategoriesV2[0] (D-08) + remover `Package` del import lucide-react (RESEARCH §Q3)</name>
  <read_first>
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Code Examples "sidebar.tsx — D-08 delete one line" (lineas 699-734) — copiar verbatim
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Open Questions Q3 (Package import removal — Yes, remove)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md §Decisiones D-08 (eliminar item), §D-10 (sidebar legacy NO se toca), §D-13 (Regla 6 spirit)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/PATTERNS.md §Sidebar section "Imports edit (line 6)" — diff antes/despues exacto
    - src/components/layout/sidebar.tsx (estado actual, leer lineas 1-160 para confirmar import + navItems + navCategoriesV2[0])
  </read_first>
  <action>
    **Paso 1 — Confirmar via grep que `Package` solo se usa en lineas 6 (import) y 146 (item):**
    ```bash
    grep -n "Package" src/components/layout/sidebar.tsx
    ```
    Esperado: exactamente 2 lineas.
    - Linea 6: `import { ..., Package, ... } from 'lucide-react'`
    - Linea 146: `{ href: '/crm/pedidos', label: 'Pedidos', icon: Package },`

    Si aparecen mas referencias (ej. icono usado en otro item), NO remover del import — solo borrar la linea 146.

    **Paso 2 — Editar la linea 6 (import lucide-react)** para remover `Package`. Cambio antes/despues:

    Antes (linea 6):
    ```typescript
    import { Building2, MessageSquare, MessageSquareText, Settings, Users, LogOut, ListTodo, BarChart3, Bot, Zap, Sparkles, Terminal, CalendarCheck, TrendingUp, Package, FlaskConical } from 'lucide-react'
    ```

    Despues:
    ```typescript
    import { Building2, MessageSquare, MessageSquareText, Settings, Users, LogOut, ListTodo, BarChart3, Bot, Zap, Sparkles, Terminal, CalendarCheck, TrendingUp, FlaskConical } from 'lucide-react'
    ```

    Diferencia: borrar exactamente `Package, ` (con espacio despues de la coma) entre `TrendingUp, ` y `FlaskConical`.

    **Paso 3 — Borrar la linea 146** del archivo. Linea 140-151 actual:

    ```typescript
    const navCategoriesV2: SidebarCategoryV2[] = [
      {
        label: 'Operación',
        items: [
          { href: '/crm', label: 'CRM', icon: Building2 },
          { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
          { href: '/crm/pedidos', label: 'Pedidos', icon: Package },     // ← LINE 146: DELETE
          { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
          { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
          { href: '/sms', label: 'SMS', icon: MessageSquareText },
        ],
      },
      // …rest unchanged…
    ]
    ```

    Despues:
    ```typescript
    const navCategoriesV2: SidebarCategoryV2[] = [
      {
        label: 'Operación',
        items: [
          { href: '/crm', label: 'CRM', icon: Building2 },
          { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
          { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
          { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
          { href: '/sms', label: 'SMS', icon: MessageSquareText },
        ],
      },
      // …rest unchanged…
    ]
    ```

    Categoria 'Operación' queda con 5 items (CRM, WhatsApp, Tareas, Confirmaciones, SMS). El array `navCategoriesV2` (resto despues de linea 151) queda byte-identical.

    **Paso 4 — Sanity check Regla 6 spirit (D-10 + D-13):**

    Verificar via `git diff` que los siguientes bloques quedan byte-identical (no aparecen en el diff):
    - Lineas 24-42: type `NavItem`
    - Lineas 44-122: array `navItems[]` (legacy)
    - Lineas 124-138: type `SidebarCategoryV2` + JSDoc
    - Lineas 152-fin: resto de `navCategoriesV2` + funciones de render + componentes
    
    ```bash
    git diff src/components/layout/sidebar.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}'
    ```
    
    Esperado: 4 lineas (-1 import old, +1 import new, -1 linea 146 old, [no `+` para linea 146 — solo deletion]). Total: 3-4 lineas con prefijo `+` o `-`.

    Si aparecen lineas extras (ej. cambio en `navItems[]`, en types, en funciones de render), REVERTIR y reintentar.

    **Paso 5 — Validar TS strict + ESLint:**
    ```bash
    npm run lint -- src/components/layout/sidebar.tsx
    ```
    
    Si ESLint reporta `'Package' is defined but never used` o similar, significa que el remove del import fallo — verificar Paso 2.
    Si TS reporta `Cannot find name 'Package'`, significa que se removio del import pero quedo una referencia colgante — verificar Paso 3 (que la linea 146 esta borrada).

    **Paso 6 — NO commit todavia.** Este task se commitea junto con Task 1 en Task 3.
  </action>
  <verify>
    <automated>test -f src/components/layout/sidebar.tsx</automated>
    <automated>! grep -q "{ href: '/crm/pedidos', label: 'Pedidos', icon: Package }" src/components/layout/sidebar.tsx</automated>
    <automated>! grep -q "Package," src/components/layout/sidebar.tsx</automated>
    <automated>test "$(grep -c "Package" src/components/layout/sidebar.tsx)" = "0"</automated>
    <automated>grep -q "{ href: '/crm', label: 'CRM', icon: Building2 }," src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "{ href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare }," src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "{ href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' }," src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "{ href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck }," src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "{ href: '/sms', label: 'SMS', icon: MessageSquareText }," src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "TrendingUp, FlaskConical" src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "const navItems: NavItem\[\] = \[" src/components/layout/sidebar.tsx</automated>
    <automated>grep -q "navCategoriesV2: SidebarCategoryV2\[\]" src/components/layout/sidebar.tsx</automated>
    <automated>git diff src/components/layout/sidebar.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}' | wc -l | awk '{ if ($1 > 6) exit 1 }'</automated>
  </verify>
  <acceptance_criteria>
    - El archivo NO contiene mas la linea `{ href: '/crm/pedidos', label: 'Pedidos', icon: Package },` en `navCategoriesV2[0].items`.
    - El conteo total de `Package` en el archivo es 0 (verificable via `grep -c "Package"`).
    - El import lucide-react (linea 6) ya NO incluye `Package` — termina con `... TrendingUp, FlaskConical }`.
    - Los 5 items restantes de `navCategoriesV2[0].items` estan presentes y en orden: CRM, WhatsApp, Tareas, Confirmaciones, SMS.
    - El array `navItems: NavItem[] = [` (legacy, lineas 44-122) sigue presente y byte-identical (verificable via grep + diff line count).
    - `git diff` reporta exactamente 3 o 4 lineas cambiadas (1 deletion linea 146, 1-2 lineas del import). Si reporta mas, revisar — codigo fuera de scope.
    - `npm run lint` pasa sin warnings sobre `Package` unused o undefined.
  </acceptance_criteria>
  <done>
    - 2 cambios aplicados: import limpiado + linea 146 borrada.
    - Resto del archivo byte-identical (D-10 + Regla 6 spirit).
    - NO commit todavia — esto va junto con Task 1 en Task 3.
  </done>
</task>

<task type="auto">
  <name>Task 3: Build local + commit atomico + push a Vercel (Regla 1)</name>
  <read_first>
    - .claude/rules/code-changes.md (commits atomicos en espanol con Co-authored-by Claude)
    - CLAUDE.md §Regla 1 (push a Vercel post-cambios)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Validation Architecture §Sampling Rate
  </read_first>
  <action>
    **Paso 1 — Validar TS strict + ESLint sobre los 2 archivos:**
    ```bash
    npm run lint -- src/app/(dashboard)/crm/page.tsx src/components/layout/sidebar.tsx
    npx tsc --noEmit
    ```

    **Paso 2 — Build local completo:**
    ```bash
    npm run build
    ```

    **Paso 3 — Diff sanity check:** confirmar que SOLO los 2 archivos del plan estan modificados:
    ```bash
    git status --short | grep -E '^M ' | head -10
    ```
    Esperado:
    - `M src/app/(dashboard)/crm/page.tsx`
    - `M src/components/layout/sidebar.tsx`

    Si aparecen otros archivos (ej. `pedidos/page.tsx`, `orders-view.tsx`), pertenecen a Plan 01 — NO incluirlos en este commit. Si no son de Plan 01 ni de este, son contaminacion — escalar.

    **Paso 4 — Verificar Regla 6 spirit con git diff:**

    `crm/page.tsx`:
    ```bash
    git diff src/app/(dashboard)/crm/page.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}' | wc -l
    ```
    Esperado: ~8-12 lineas (JSDoc rewrite + 1 linea del redirect target).

    `sidebar.tsx`:
    ```bash
    git diff src/components/layout/sidebar.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}' | wc -l
    ```
    Esperado: 3-4 lineas (1-2 import + 1 deletion linea 146).

    Si los counts exceden estos limites, codigo fuera de scope — VOLVER a Tasks 1-2.

    **Paso 5 — Stage los archivos:**
    ```bash
    git add src/app/(dashboard)/crm/page.tsx \
            src/components/layout/sidebar.tsx
    ```

    **Paso 6 — Commit atomico (mensaje en espanol con Co-authored-by Claude):**
    ```bash
    git commit -m "$(cat <<'EOF'
    feat(crm-routing): /crm v2 redirige a /crm/pedidos + remover item Pedidos duplicado del sidebar v2

    Resuelve ROUTING-01..03 del standalone ui-pipeline-persistence-and-crm-routing.

    - crm/page.tsx: redirect target en rama v2 cambia de /crm/contactos a
      /crm/pedidos (D-07). Kanban es la surface principal de CRM en el diseno
      editorial v2; Contactos sigue accesible via <CrmTabs/> rendered por
      crm/layout.tsx (D-09). Rama legacy y fall-through quedan byte-identical
      (D-10 + Regla 6 spirit).
    - sidebar.tsx: borrar item duplicado { href: '/crm/pedidos', label: 'Pedidos',
      icon: Package } de navCategoriesV2[0].items (D-08). Categoria 'Operacion'
      queda con 5 items (CRM, WhatsApp, Tareas, Confirmaciones, SMS). Remover
      'Package' del import lucide-react (era el unico consumer). El array
      navItems[] legacy y el render block legacy quedan byte-identical (D-10).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```

    **Paso 7 — Push a Vercel (Regla 1):**
    ```bash
    git push origin main
    ```

    Vercel preview deploy se dispara. Plan 03 (manual QA) corre los 5 test cases una vez Plan 01 + Plan 02 ambos hayan pusheado.
  </action>
  <verify>
    <automated>git log -1 --format=%s | grep -qF "feat(crm-routing): /crm v2 redirige a /crm/pedidos"</automated>
    <automated>git log -1 --name-only | grep -q "src/app/(dashboard)/crm/page.tsx"</automated>
    <automated>git log -1 --name-only | grep -q "src/components/layout/sidebar.tsx"</automated>
    <automated>! git log -1 --name-only | grep -q "src/app/(dashboard)/crm/pedidos/"</automated>
    <automated>! git log -1 --name-only | grep -q "pipeline-tabs.tsx"</automated>
    <automated>! git log -1 --name-only | grep -q "orders-view.tsx"</automated>
    <automated>git log -1 --format=%b | grep -q "Co-Authored-By: Claude"</automated>
  </verify>
  <acceptance_criteria>
    - `npm run lint` pasa sobre los 2 archivos sin errores ni warnings sobre `Package`.
    - `npm run build` pasa sin errores.
    - Commit atomico con mensaje empezando con `feat(crm-routing): /crm v2 redirige`.
    - Commit incluye SOLO los 2 archivos del plan (crm/page.tsx + sidebar.tsx). Verificable via `! git log -1 --name-only | grep -q "pedidos/"` (Plan 01 files no tocados).
    - Mensaje de commit incluye `Co-Authored-By: Claude` (per rules).
    - `git push origin main` exitoso.
  </acceptance_criteria>
  <done>
    - 2 archivos modificados, build pasa, commit en main, pushed a Vercel.
    - Plan 03 (QA manual) puede arrancar una vez Plan 01 tambien haya pusheado.
  </done>
</task>

</tasks>

<verification>
- `crm/page.tsx`: rama `if (v2)` ahora redirige a `/crm/pedidos` (verificable via `! grep "redirect('/crm/contactos')"`). JSDoc actualizado.
- `sidebar.tsx`: `Package` no aparece en el archivo (verificable via `grep -c "Package"` = 0). `navCategoriesV2[0].items` tiene 5 items. `navItems[]` legacy byte-identical.
- `git diff` reporta cambios minimos, dentro del limite Regla 6 spirit.
- `npm run lint && npm run build` pasan localmente.
- Commit atomico en `main` con mensaje en espanol + Co-Authored-By Claude.
- Push a Vercel exitoso (Regla 1).
</verification>

<success_criteria>
- ROUTING-01 cubierto: click en sidebar v2 'CRM' lleva a `/crm/pedidos` directamente.
- ROUTING-02 cubierto: sidebar v2 ya NO muestra item 'Pedidos' duplicado.
- ROUTING-03 cubierto: sidebar legacy `navItems[]` y render block byte-identical (Regla 6 spirit + D-10).
- Plan 01 puede correr en paralelo (archivos disjuntos: pedidos/page.tsx + orders-view.tsx).
- Plan 03 (manual QA) tiene un Vercel preview deploy listo en Somnio para correr los 5 test cases.
</success_criteria>

<output>
Despues de completar, crear `.planning/standalone/ui-pipeline-persistence-and-crm-routing/02-SUMMARY.md` documentando:
- Commit hash del commit atomico de Task 3.
- Diff line count para `crm/page.tsx` (esperado 8-12) y `sidebar.tsx` (esperado 3-4) — evidencia Regla 6 spirit.
- Confirmacion de que `npm run lint && npm run build` pasaron localmente.
- Confirmacion de que `git push origin main` completo (Vercel deploy preview URL si esta disponible).
- Lista de los 3 requirements cubiertos (ROUTING-01..03) con la linea/archivo donde se implementa cada uno.
- Confirmacion de que `pedidos/page.tsx`, `orders-view.tsx`, `pipeline-tabs.tsx` NO fueron tocados en este plan.
- Confirmacion de que `navItems[]` legacy (lineas 44-122) y todo el render block legacy quedan byte-identical (D-10).
</output>
