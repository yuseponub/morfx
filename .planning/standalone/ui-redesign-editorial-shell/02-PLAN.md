---
phase: ui-redesign-editorial-shell
plan: 02
type: execute
wave: 2
depends_on: [00]
files_modified:
  - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
autonomous: true
requirements: [D-04]

must_haves:
  truths:
    - "Con ui_editorial_v3 ON, el ThemeToggle (light/dark/system) aparece en el topbar v3 de las 3 pantallas: Conversaciones (ya), Contactos, Pedidos"
    - "El ThemeToggle de orders-view.tsx:1348 (rama v2/legacy) NO se mueve ni se borra — se AGREGA uno nuevo en el topbar v3 (línea 951)"
    - "No se toca contacts-view-v2.tsx (rama dashboard-v2) — el topbar v3 de contactos vive en contacts-table.tsx (rama if (v3))"
    - "El comentario 'provisional / irá en el sidebar' del inbox-layout.tsx se corrige (D-04 deja el toggle en el topbar definitivamente)"
  artifacts:
    - path: "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
      provides: "<ThemeToggle /> en el .actions del topbar v3 (rama if (v3))"
      contains: "ThemeToggle"
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      provides: "<ThemeToggle /> NUEVO en el .actions del topbar v3 (if (v3 && !isEmpty), línea 951) — además del existente en 1348"
      contains: "ThemeToggle"
  key_links:
    - from: "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx topbar v3"
      to: "src/components/layout/theme-toggle.tsx"
      via: "import { ThemeToggle } + render en .actions"
      pattern: "ThemeToggle"
    - from: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx topbar v3 (951)"
      to: "src/components/layout/theme-toggle.tsx"
      via: "<ThemeToggle /> en .actions (import ya existe en línea 48)"
      pattern: "ThemeToggle"
---

<objective>
Extender el `<ThemeToggle />` (D-04) a los topbars v3 de Contactos (`contacts-table.tsx`) y Pedidos (`orders-view.tsx`), conservando el provisional ya existente en el inbox y corrigiendo su comentario obsoleto. El toggle vive en el área superior de cada módulo v3 (no en el sidebar — D-04/D-07).

Purpose: el core dejó el toggle provisional solo en el inbox con un comentario que decía "irá en el sidebar". D-04 lo confirma EN EL TOPBAR definitivamente y pide consistencia en las 3 pantallas v3. Pitfall 1 (no tocar contacts-view-v2) y Pitfall 2 (no mover el toggle existente de orders-view) son las trampas a evitar.
Output: toggle visible en los 3 topbars v3; verificado visualmente en QA.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-shell/RESEARCH.md
@.planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md

<interfaces>
From src/components/layout/theme-toggle.tsx:
  export function ThemeToggle()  — dropdown Sun/Moon (next-themes) light/dark/system. SIN props. NO modificar este componente (Regla 6 sobre otros consumidores).
</interfaces>

<facts-already-verified>
- Inbox: `inbox-layout.tsx:214` YA tiene `<ThemeToggle />` dentro de `<div className="actions">`; el comentario provisional está en 211-213.
- Contactos: hay DOS `<div className="actions">`: el del topbar v3 en la rama `if (v3)` (235+), en la línea ~284 (con el botón "Importar" en ~290); y OTRO en ~496 (rama no-v3). El toggle SOLO va en el de la rama v3 (~284). ThemeToggle NO importado ahí.
- Pedidos: topbar v3 en `orders-view.tsx` rama `if (v3 && !isEmpty)`; `<div className="actions">` en línea 951; el `import { ThemeToggle }` YA existe (línea 48); hay OTRO `<ThemeToggle />` en línea 1348 que es la rama v2/legacy (NO tocar).
- Empty-states (Wave 0): NINGUNO renderiza topbar editorial → el toggle va solo en los 3 topbars con datos.
</facts-already-verified>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar ThemeToggle al topbar v3 de Contactos (D-04)</name>
  <read_first>
    - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx (rama `if (v3)` 235+; topbar 277-284; `<div className="actions">` línea 284 con "Importar" en ~290; OJO: hay un SEGUNDO `<div className="actions">` en ~496 que es la rama no-v3 — NO usar ese; bloque de imports 1-27 — NO importa ThemeToggle)
    - src/components/layout/theme-toggle.tsx (componente sin props)
    - RESEARCH §Pattern 3 (tabla de inserción, fila Contactos) + §Code Examples "Topbar v3 — agregar toggle" + §Pitfall 1 (NO tocar contacts-view-v2.tsx)
  </read_first>
  <action>
    En `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx`:
    1. Agregar el import al bloque de imports superior:
       `import { ThemeToggle } from '@/components/layout/theme-toggle'`
    2. Dentro de la rama `if (v3)`, en el PRIMER `<div className="actions">` (el del topbar v3, línea ~284, el que contiene el botón "Importar"), insertar `<ThemeToggle />` como PRIMER hijo (antes del botón "Importar"):
       ```tsx
       <div className="actions">
         <ThemeToggle />
         <button type="button" className="btn" onClick={() => setImportDialogOpen(true)}>Importar</button>
         <CsvExportButton v3 ... />
         <button type="button" className="btn pri" onClick={() => setDialogOpen(true)}>Nuevo contacto ...</button>
       </div>
       ```
    CRÍTICO (positional): el toggle debe quedar en el `.actions` de la rama v3 (~284), NO en el `.actions` no-v3 (~496). Verificable por posición: la PRIMERA aparición de `ThemeToggle` (en el JSX, no el import) debe estar ANTES del segundo `className="actions"` y ANTES del botón "Importar" del topbar v3.
    NO tocar `contacts-view-v2.tsx` (rama dashboard-v2 — Pitfall 1). NO tocar el componente `ThemeToggle` base. El styling editorial fino del toggle es discrecional (RESEARCH §Pattern 3): si el botón ghost shadcn desentona dentro de `.actions`, envolverlo en un `<span>` o pasarle `className` para look `.icon-btn` (32×32, border `--border`) — SIN editar el componente base. Por defecto, dejarlo ghost (encaja razonablemente); el QA visual decide si requiere el wrapper.
  </action>
  <verify>
    <automated>grep -q "import { ThemeToggle }" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && F='src/app/(dashboard)/crm/contactos/components/contacts-table.tsx'; TT=$(grep -n '<ThemeToggle' "$F" | head -1 | cut -d: -f1); A2=$(grep -n 'className="actions"' "$F" | sed -n '2p' | cut -d: -f1); test -n "$TT" && test -n "$A2" && test "$TT" -lt "$A2" && echo "OK-toggle-in-v3-actions" || echo "ALERTA-toggle-mal-ubicado"; pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `contacts-table.tsx` importa `ThemeToggle` desde `@/components/layout/theme-toggle`
    - POSICIONAL (no basta `grep -q ThemeToggle`): la primera aparición de `<ThemeToggle` está ANTES del SEGUNDO `<div className="actions">` (línea ~496, rama no-v3) — i.e. el toggle cayó en el `.actions` del topbar v3 (~284), no en el no-v3. El comando del verify imprime `OK-toggle-in-v3-actions`.
    - El `<ThemeToggle />` aparece como primer hijo del `.actions` v3, antes del botón "Importar"
    - `git diff -- contacts-view-v2.tsx` está VACÍO (Pitfall 1 — no se tocó la rama v2)
    - El componente `theme-toggle.tsx` NO fue modificado (`git diff -- src/components/layout/theme-toggle.tsx` vacío)
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>ThemeToggle en el .actions del topbar v3 de Contactos (posicionalmente antes del segundo .actions no-v3); contacts-view-v2 intacto; componente base intacto; typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 2: Agregar ThemeToggle NUEVO al topbar v3 de Pedidos sin mover el existente (D-04)</name>
  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx (rama `if (v3 && !isEmpty)` 940; `<div className="actions">` línea 951; import `ThemeToggle` YA en línea 48; el `<ThemeToggle />` de la rama v2/legacy en línea 1348)
    - RESEARCH §Pattern 3 (fila Pedidos) + §Pitfall 2 (NO mover el toggle de 1348 — AGREGAR uno nuevo en 951)
  </read_first>
  <action>
    En `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx`:
    - El import ya existe (línea 48) — NO duplicar.
    - En la rama `if (v3 && !isEmpty)`, dentro del `<div className="actions">` del topbar (línea ~951), insertar `<ThemeToggle />` como PRIMER hijo (antes de "Exportar"):
      ```tsx
      <div className="actions">
        <ThemeToggle />
        <button type="button" className="btn" onClick={handleExport}>Exportar</button>
        <button type="button" className="btn pri" onClick={() => setFormSheetOpen(true)}>Crear pedido</button>
      </div>
      ```
    - NO TOCAR el `<ThemeToggle />` de la línea 1348 (rama v2/legacy) — eso rompería el toggle del path no-v3 (Pitfall 2). Solo AGREGAR el del topbar v3.
    - El empty-state de pedidos (`isEmpty`, línea 1176) NO lleva toggle (Wave 0: empty-states sin topbar editorial).
  </action>
  <verify>
    <automated>test "$(grep -c 'ThemeToggle' 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx')" -ge 3 && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'ThemeToggle' orders-view.tsx` devuelve >= 3 (1 import + el existente de 1348 + el nuevo del topbar v3) — confirmando que el de 1348 NO se movió/borró
    - El nuevo `<ThemeToggle />` está dentro del `<div className="actions">` de la rama `if (v3 && !isEmpty)` (topbar ~951)
    - El `<ThemeToggle />` de la línea ~1348 (rama v2/legacy) sigue presente (git diff NO muestra su eliminación)
    - El empty-state (`isEmpty`, 1176) NO lleva ThemeToggle
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>ThemeToggle nuevo en el topbar v3 de Pedidos; el de 1348 intacto; empty-state sin toggle; typecheck verde.</done>
</task>

<task type="auto">
  <name>Task 3: Corregir el comentario obsoleto del toggle provisional en el inbox (D-04)</name>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (topbar v3 196-219; comentario provisional 211-213; `<ThemeToggle />` en 214)
    - RESEARCH §Pattern 3 (fila Conversaciones — conservar + quitar el comentario "provisional / irá en el sidebar")
  </read_first>
  <action>
    En `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx`:
    - CONSERVAR el `<ThemeToggle />` de la línea 214 (ya correcto — vive en el topbar).
    - Reemplazar el comentario obsoleto de las líneas 211-213 (que dice que el toggle "irá en el sidebar en el standalone ui-redesign-editorial-shell") por un comentario correcto que refleje D-04, por ejemplo:
      ```tsx
      {/* Toggle de tema (light/dark/system) — vive en el topbar del módulo
          (D-04 ui-redesign-editorial-shell): consistente en las 3 pantallas v3
          (Conversaciones / Contactos / Pedidos). NO va en el sidebar (D-07). */}
      <ThemeToggle />
      ```
    - NO mover ni cambiar el comportamiento del toggle — solo corregir el comentario. NO tocar el resto del topbar (eyebrow, h1, botón "Nueva conversación").
  </action>
  <verify>
    <automated>grep -q 'ThemeToggle' 'src/app/(dashboard)/whatsapp/components/inbox-layout.tsx' && ! grep -q 'irá en el sidebar' 'src/app/(dashboard)/whatsapp/components/inbox-layout.tsx' && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - El `<ThemeToggle />` sigue presente en el topbar del inbox (no se movió)
    - El comentario "irá en el sidebar" YA NO existe en `inbox-layout.tsx` (grep negativo)
    - El nuevo comentario referencia D-04 (toggle en el topbar) — no contradice D-07
    - `git diff` muestra SOLO cambios de comentario (el `<ThemeToggle />` y el resto del topbar sin cambios funcionales)
    - `pnpm typecheck` pasa
  </acceptance_criteria>
  <done>Comentario del inbox corregido a D-04; toggle conservado; typecheck verde.</done>
</task>

</tasks>

<verification>
- Visual: screenshot de cada topbar v3 (Conversaciones / Contactos / Pedidos) mostrando el toggle — gateado en QA visual.
- Per-commit gate: `pnpm typecheck`.
- Regla 6: contacts-view-v2.tsx intacto; el ThemeToggle de orders-view:1348 intacto; theme-toggle.tsx base intacto.
</verification>

<success_criteria>
- El toggle aparece en los 3 topbars v3 con datos; empty-states sin toggle.
- El path v2/legacy de orders-view conserva su toggle.
- typecheck verde.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-shell/02-SUMMARY.md`
</output>
