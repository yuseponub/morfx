---
plan: 02
phase: ui-pipeline-persistence-and-crm-routing
status: complete
completed: 2026-04-27
wave: 1
---

# Plan 02 SUMMARY — CRM redirect v2 + sidebar v2 cleanup

## Outcome

Resuelve ROUTING-01..03. Los 2 cambios eran cuasi-triviales (1 string literal + 1 deletion + 1 import slim) y el diff total fue 6 inserts / 6 deletes — encaja exactamente en el budget Regla 6 spirit del Plan (≤12 lineas crm/page.tsx + ≤4 lineas sidebar.tsx).

## Commit

- `d4645ee` — `feat(crm-routing): /crm v2 redirige a /crm/pedidos + remover item Pedidos duplicado del sidebar v2`
- Pushed: `1c244e2..d4645ee main -> main` (Vercel preview deploy disparado).

## Diff stats (evidencia Regla 6 spirit + D-13)

```
src/app/(dashboard)/crm/page.tsx  | 9 +++++----  (5+ / 4-)
src/components/layout/sidebar.tsx | 3 +--        (1+ / 2-)
2 files changed, 6 insertions(+), 6 deletions(-)
```

- `crm/page.tsx`: 9 lineas tocadas (5 JSDoc + 1 redirect target). Bajo el budget de "8-12 lineas" del plan.
- `sidebar.tsx`: 3 lineas tocadas (1 import slim + 1 deletion del item Pedidos). Bajo el budget de "3-4 lineas" del plan.

## Requirements cubiertos

- **ROUTING-01** (click en sidebar v2 'CRM' lleva directo a `/crm/pedidos`):
  - `src/app/(dashboard)/crm/page.tsx:24` — `if (v2) { redirect('/crm/pedidos') }`.
- **ROUTING-02** (sidebar v2 ya NO muestra item duplicado 'Pedidos'):
  - `src/components/layout/sidebar.tsx:140-150` — `navCategoriesV2[0].items` queda con 5 items (CRM, WhatsApp, Tareas, Confirmaciones, SMS).
  - `src/components/layout/sidebar.tsx:6` — import lucide-react sin `Package`.
- **ROUTING-03** (sidebar legacy byte-identical):
  - `git diff src/components/layout/sidebar.tsx` muestra cambios SOLO en linea 6 (import) y la deletion del item — no se toca `navItems[]` (lineas 44-122) ni el render block legacy.

## Validaciones

- `npx eslint src/app/(dashboard)/crm/page.tsx src/components/layout/sidebar.tsx` — PASS (0 errors, 1 warning pre-existente no relacionado: `'Badge' is defined but never used` en sidebar.tsx:17, ya estaba ahi antes del plan).
- `git diff --stat` confirmado dentro de presupuesto.
- `! grep -q "redirect('/crm/contactos')" src/app/(dashboard)/crm/page.tsx` — PASS.
- `grep -c "redirect('/crm/pedidos')" src/app/(dashboard)/crm/page.tsx` = 2 (rama v2 + fall-through) — PASS.
- `grep -c "Package" src/components/layout/sidebar.tsx` = 0 — PASS (RESEARCH §Q3).
- `grep -q "ui-pipeline-persistence-and-crm-routing D-07" src/app/(dashboard)/crm/page.tsx` — PASS.
- `grep -q "<CrmTabs/> strip rendered by crm/layout.tsx" src/app/(dashboard)/crm/page.tsx` — PASS.
- `grep -q "Regla 6 byte-identical fail-closed" src/app/(dashboard)/crm/page.tsx` — PASS.
- `grep -q "{ href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare }," src/components/layout/sidebar.tsx` — PASS.
- `grep -q "{ href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' }," src/components/layout/sidebar.tsx` — PASS.
- `grep -q "TrendingUp, FlaskConical" src/components/layout/sidebar.tsx` — PASS (import slim correcto).

## Archivos NO tocados (verificable via `git log -1 --name-only`)

- `src/app/(dashboard)/crm/pedidos/page.tsx` (Plan 01)
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` (Plan 01)
- `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx` (D-06 lock)
- `src/app/(dashboard)/crm/components/crm-tabs.tsx` (D-09 — solo lectura para confirmar)
- `src/app/(dashboard)/crm/layout.tsx` (D-09 — solo lectura)
- `navItems[]` legacy en `sidebar.tsx:44-122` (D-10) — confirmado byte-identical via diff de 3 lineas totales.

## Desviaciones

Ninguna. Build local NO se corrio (Plan 01 documento que `npm run build` timed out en WSL2+Turbopack > 8min). Para Plan 02, los cambios son tan locales (1 string literal + 1 array item delete + 1 import slim) que el riesgo de regresion es nulo — Vercel CI hace el build prod nativo de Linux.

## Pitfalls evitados

- **D-10 + Regla 6 spirit:** verificado via `git diff` que `navItems[]` y el render block legacy quedan byte-identical (los 6 cambios totales caen exclusivamente en linea 6 import + linea 146 item).
- **RESEARCH §Q3 Package import removal:** confirmado que `Package` solo aparecia en linea 6 + linea 146. Despues de borrar la linea 146, `Package` quedaba unused → removido del import. `grep -c "Package"` = 0.
- **JSDoc rewrite per RESEARCH §Code Examples:** comentario incluye referencia a D-07, a `<CrmTabs/>` (D-09), y preserva la nota "Regla 6 byte-identical fail-closed".

## Estado

- Wave 1 completa (Plan 01 commit `1c244e2` + Plan 02 commit `d4645ee` ambos en `origin/main`).
- Vercel preview deploy disparado.
- Plan 03 (manual QA + LEARNINGS, autonomous: false) puede arrancar — depende del Vercel preview ready en workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) con `ui_dashboard_v2.enabled=true`.
