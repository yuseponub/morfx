# Regla 6 — Gate estático final (D-09)

**Standalone:** ui-redesign-editorial-shell · **Plan:** 05 · **Fecha:** 2026-06-06

**Base de diff usada:** `5c4a92a1` (commit `docs(ui-redesign-editorial-shell-00)`, justo antes del primer
cambio de código de esta fase). Como los planes 01–04 ya están COMMITEADOS, `git diff HEAD -- <file>`
sale vacío; por eso cada invariante del RESEARCH §"Regla 6 — estrategia de verificación (D-09)" se
adapta a `git diff 5c4a92a1 HEAD -- <file>` (byte-frozen/append checks). Los invariantes de grep/proximidad
sobre el estado final (3, 4, 10) se corren tal cual sobre el árbol de trabajo (= HEAD).

**Veredicto global: 10/10 OK.** Todo lo no-v3 quedó byte-frozen; todas las adiciones son ADITIVAS y
v3-gated. El plan NO está bloqueado.

---

## Resultado por invariante

### 1. globals.css legacy `.theme-editorial` (sin guion) NO cambió — **OK**
Comando: `git diff 5c4a92a1 HEAD -- src/app/globals.css | grep -E '^\+' | grep -E '\.theme-editorial[^-]'`
→ **VACÍO**. Ninguna línea añadida toca un selector legacy `.theme-editorial ` (con espacio) ni
`html:has(.theme-editorial)`. El bloque legacy (1..1012) y las reglas `.theme-editorial .sb/...` (546-616)
quedan intactos. (OK-legacy)

### 2. Branch v2 "Propuesta B" + return legacy del sidebar byte-frozen — **OK**
Comando: `git diff 5c4a92a1 HEAD -- src/components/layout/sidebar.tsx`
- Hunks: solo 2 — `@@ -189,9 +189,20 @@` (interface) y `@@ -212,6 +223,193 @@` (inserción del branch).
- Líneas REMOVIDAS (no `---`): **1** sola → la firma `export function Sidebar({ ..., v2 = false })`
  reemplazada por `({ ..., v2 = false, v3 = false })` (adición de prop, default `false`).
- Lo demás es 100% ADICIÓN: el JSDoc de la prop `v3?` + el bloque nuevo `if (v3) { ... return <aside
  className="sb theme-editorial-v3 ..."> }` insertado ANTES del branch v2 (precedencia v3 > v2, D-03).
- El branch `if (v2)` (antiguas 220-396) y el return legacy (398-591) NO tienen ningún hunk → byte-frozen.
  Inspección dirigida confirma: el único `-` es la firma; cero `-` dentro de los rangos v2/legacy.
(OK-sidebar-v2-legacy-frozen)

### 3. Sin selector compound `theme-editorial-v3.dark` — **OK**
Comando: `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` → **VACÍO**. Dark es descendant-only
(`.dark .theme-editorial-v3`), correcto para next-themes (`.dark` en `<html>`, Pitfall 3). (OK-no-compound)

### 4. ThemeToggle de orders-view conservado (rama no-v3) + nuevo en topbar v3 — **OK**
Comando: `grep -c 'ThemeToggle' 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` → **3**
(import + el de la rama v2/legacy línea ~1348 conservado + el nuevo del topbar v3 línea ~951). ≥3.
No se MOVIÓ el toggle de la rama no-v3; se AGREGÓ uno nuevo (Pitfall 2 evitado). (OK-toggle-1348)

### 5. contacts-view-v2.tsx NO tocado — **OK**
Comando: `git diff 5c4a92a1 HEAD -- 'src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx'`
→ **VACÍO**. La rama v2 (dashboard-v2) intacta; el toggle v3 fue a `contacts-table.tsx` (la rama v3
real), no a este archivo (Pitfall 1 evitado). (OK-contacts-v2-frozen)

### 6. Todas las adiciones de clases a globals.css están bajo `.theme-editorial-v3` — **OK**
Comando: `git diff 5c4a92a1 HEAD -- src/app/globals.css | grep -E '^\+\.' | grep -v 'theme-editorial-v3'`
→ **VACÍO**. Cada selector de clase nuevo (`.sb/.brand/.wm/.sub/nav.sb-nav/...`) está prefijado por
`.theme-editorial-v3`. La única otra adición es el token `--accent-indigo:oklch(0.62 0.07 260)` DENTRO
del bloque dark existente `.dark .theme-editorial-v3` (hunk `@@ -1365,6 +1365,12 @@`, D-06 auditoría
dark — aclara el indigo para legibilidad sobre charcoal). No es una clase nueva → no rompe el invariante.
(OK-todo-bajo-v3)

### 7. Path no-v3 del mobile-nav byte-frozen — **OK**
Comando: `git diff 5c4a92a1 HEAD -- src/components/layout/mobile-nav.tsx`
- Hunk único: `@@ -43,10 +43,73 @@`.
- Líneas REMOVIDAS (no `---`): **1** sola → la firma `export function MobileNav()` reemplazada por
  `MobileNav({ v3 = false }: { v3?: boolean } = {})` (adición de prop, default `false`).
- Lo demás es ADICIÓN: JSDoc de la prop + el bloque `if (v3) { return <Sheet>...<SheetContent
  className="theme-editorial-v3 sb">... }` (early-return). El return legacy (antiguas 50-93) sin hunks
  → byte-frozen. (OK-mobile-nav-no-v3-frozen)

### 8. theme-toggle.tsx base NO modificado — **OK**
Comando: `git diff 5c4a92a1 HEAD -- src/components/layout/theme-toggle.tsx` → **VACÍO**. El componente
base (next-themes Sun/Moon dropdown) intacto; solo se COLOCA en topbars, no se edita (Regla 6 sobre otros
consumidores). (OK-theme-toggle-frozen)

### 9. header.tsx marketing byte-frozen (D-05b) — **OK**
Comando: `git diff 5c4a92a1 HEAD -- src/components/layout/header.tsx` → **VACÍO**. El `<MobileNav />` del
header de marketing NO recibe `v3` (renderiza el path no-v3 byte-idéntico) y el archivo no se tocó. El
mobile-nav v3 es alcanzable SOLO vía el mount nuevo del dashboard (ver invariante 10). (OK-header-frozen)

### 10. Mount del mobile-nav en el dashboard gated v3-only (D-05b) — **OK**
- Proximidad: `awk '/isEditorialV3 *&&/{g=NR} /<MobileNav/{if(g>0&&NR-g<=6)f=1} END{exit f?0:1}'
  'src/app/(dashboard)/layout.tsx'` → **exit 0** (OK-mount-gated). El `<MobileNav v3 />` (layout.tsx:76)
  está ≤6 líneas después de `isEditorialV3 && (` (línea 74), probando que el dashboard no-v3 NO monta
  mobile-nav → igual que hoy.
- Mobile-only: `grep -q 'md:hidden' 'src/app/(dashboard)/layout.tsx'` → **MATCH** (wrapper
  `<div className="md:hidden fixed top-3 left-3 z-50">`, línea 75). El sidebar es `hidden md:flex`
  (desktop), el mobile-nav `md:hidden` (mobile) — sin solapamiento. (OK-md-hidden)

---

## Gate de tipos: `pnpm exec tsc --noEmit`

> Nota de entorno: el script `pnpm typecheck` NO existe en este repo; se usa `pnpm exec tsc --noEmit`
> (equivalente). El repo es pnpm-only (npm rompe pnpm-lock + deploys de Vercel).

- **Archivos del plan: 0 errores.** `pnpm exec tsc --noEmit 2>&1 | grep -E
  'sidebar|mobile-nav|globals|layout|orders-view|contacts-table|inbox-layout|theme-toggle|header'`
  → **VACÍO** (OK-cero-errores-en-archivos-del-plan). Todos los archivos tocados por esta fase
  (sidebar.tsx, mobile-nav.tsx, globals.css, (dashboard)/layout.tsx, orders-view.tsx, contacts-table.tsx,
  inbox-layout.tsx) typechequean limpio.
- **Errores residuales (4) = pre-existentes y FUERA DE SCOPE.** `tsc` reporta 4 errores, todos en
  archivos de test pre-existentes que esta fase NO tocó:
  - `src/lib/domain/__tests__/conversations.test.ts` (TS7022/TS7024 — `eqMock` sin anotación de tipo)
  - `src/lib/instagram/__tests__/webhook-handler.test.ts` (TS2307 — `@/lib/inngest/client` no existe)
  - `src/lib/messenger/__tests__/webhook-handler.test.ts` (TS2307 — mismo módulo faltante)

  Los 3 archivos existían en el base `5c4a92a1` (verificado con `git show`) y NINGÚN archivo `__tests__`
  fue modificado en esta fase (`git diff --name-only 5c4a92a1 HEAD | grep __tests__` → vacío). Por la
  regla SCOPE BOUNDARY del executor, se documentan como deferidos (ver `deferred-items.md`) y NO se
  corrigen aquí — no son causados por los cambios de este plan.

**Conclusión del gate de tipos:** el estado final de los archivos del plan compila limpio; los 4 errores
residuales son deuda pre-existente en tests no relacionados, no bloqueante para esta fase de CSS/JSX.
