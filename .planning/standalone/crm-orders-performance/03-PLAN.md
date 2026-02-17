---
phase: standalone/crm-orders-performance
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified: []
autonomous: false

must_haves:
  truths:
    - "Kanban columns scroll properly"
    - "Orders load 20 at a time per column"
    - "Scrolling loads more orders"
    - "Drag and drop works between columns"
    - "List view still works"
    - "No console errors"
  artifacts: []
  key_links: []
---

<objective>
Verify all CRM orders functionality after scroll fix and infinite scroll pagination.

Output: User-verified working orders module with pagination.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-orders-performance/01-SUMMARY.md
@.planning/standalone/crm-orders-performance/02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build and deploy to Vercel</name>
  <files></files>
  <action>
  1. Run `npx tsc --noEmit`
  2. Run `npm run build`
  3. Push to Vercel: `git push origin main`
  </action>
  <verify>
  - Build passes
  - Push succeeds
  </verify>
  <done>Deployed to Vercel.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
  CRM Orders performance optimizations:
  1. Kanban scroll fix (columns now scroll vertically)
  2. Per-stage pagination (20 orders per column)
  3. Infinite scroll (scroll to bottom loads more)
  4. Total count in column headers
  </what-built>
  <how-to-verify>
  **Test 1: Scroll**
  - Open /crm/pedidos en vista Kanban
  - Verificar que las columnas hacen scroll vertical cuando hay muchos pedidos

  **Test 2: Paginacion**
  - Verificar que cada columna muestra maximo ~20 pedidos inicialmente
  - El header de la columna muestra el total real (e.g., "156")
  - Hacer scroll hasta abajo — deben cargarse 20 mas

  **Test 3: Drag and Drop**
  - Arrastrar un pedido de una columna a otra
  - Verificar que se mueve correctamente

  **Test 4: Vista Lista**
  - Cambiar a vista lista — debe funcionar igual que antes

  **Test 5: Busqueda**
  - Buscar un contacto o producto — debe filtrar los pedidos cargados

  **Test 6: Crear pedido**
  - Crear un pedido nuevo — debe aparecer en la columna correcta
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<success_criteria>
- User confirms all tests pass
- No regressions
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-orders-performance/03-SUMMARY.md`
</output>
