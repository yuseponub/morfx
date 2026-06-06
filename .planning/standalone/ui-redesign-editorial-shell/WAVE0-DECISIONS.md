# WAVE0-DECISIONS — `ui-redesign-editorial-shell`

**Lockeado:** 2026-06-06 (Plan 00, Wave 0 — decisiones-only, sin código)
**Consumido por:** Plan 01 (sidebar v3), Plan 02 (theme toggle en topbars), Plan 03 (mobile-nav v3 + mount D-05b), Plan 04 (auditoría dark).
**Restricción transversal:** Regla 6 (CLAUDE.md) — todo cambio nuevo es ADITIVO + v3-gated; los paths no-v3 quedan byte-frozen.

Estas decisiones resuelven las 3 Wave 0 Gaps del RESEARCH (§Wave 0 Gaps) + la enmienda D-05b post plan-check. Las waves 1-4 las citan **verbatim**; NO re-investigar.

---

## D-05/D-05b — Mount sites de `<MobileNav />` + threading del flag + mount v3-only en el dashboard

### Sitios de montaje exactos (grep verificado 2026-06-06)

`grep -rn 'MobileNav' src/` → **3 líneas, 2 archivos** (1 definición + 1 import + 1 render):

| # | Archivo:línea | Rol |
|---|---------------|-----|
| 1 | `src/components/layout/mobile-nav.tsx:46` | Definición del componente (`export function MobileNav()`) — hoy NO recibe ninguna prop de flag. |
| 2 | `src/components/layout/header.tsx:4` | ÚNICO import (`import { MobileNav } from './mobile-nav'`). |
| 3 | `src/components/layout/header.tsx:11` | ÚNICO render (`<MobileNav />`). |

`grep -rn '<Header' src/` → **1 sitio:** `src/app/(marketing)/[locale]/layout.tsx:43` (`<Header />`).

**Conclusión:** `<Header />` (que monta `<MobileNav />`) se renderiza **SOLO en el marketing layout**. El `(dashboard)/layout.tsx` **NO renderiza `<Header />` ni `<MobileNav />` en ningún lado** (verificado: `grep -n 'MobileNav\|<Header' (dashboard)/layout.tsx` = 0 matches). El sidebar del dashboard es `hidden md:flex` (desktop-only) → en mobile el dashboard HOY no tiene navegación alguna.

### Mecanismo de threading del flag (LOCKED)

- Agregar prop `v3?: boolean` a `MobileNav` con **default `false`**. El branch reskin editorial se gatea por esa prop: `if (v3) return (<Sheet ...>editorial con SheetContent className="theme-editorial-v3" ...</Sheet>)`. El path no-v3 queda **byte-frozen por early-return** (mismo patrón que `Sidebar.v2` y el inbox v2/v3).
- **NO** se introduce un `EditorialV3Provider` nuevo (over-engineering / Don't Hand-Roll del RESEARCH §Don't Hand-Roll). `isEditorialV3` ya está resuelto en el RSC `(dashboard)/layout.tsx:43-45` y se pasa **directo como prop** al mount nuevo.
- El scope `.theme-editorial-v3` se aplica al `<SheetContent>` del branch v3 (mismo principio Opción B del sidebar) para que los tokens resuelvan; dark cubierto por el descendant `.dark .theme-editorial-v3` global.

### D-05b — mount real v3-only en el dashboard (LOCKED, enmienda post plan-check)

El usuario resolvió la advertencia de reachability del plan-check eligiendo **"cablear un mount real"**. Como el dashboard HOY no monta ningún mobile-nav, el reskin v3 quedaría como **dead-code** sin un mount. Decisión lockeada: agregar en `(dashboard)/layout.tsx` un mount **NUEVO `md:hidden` gated v3-only**:

```tsx
{isEditorialV3 && (
  <div className="md:hidden">
    <MobileNav v3 />
  </div>
)}
```

- `isEditorialV3` ya está resuelto en ese RSC (`layout.tsx:43-45`).
- El gate `isEditorialV3 &&` garantiza que para usuarios **no-v3 el dashboard sigue EXACTAMENTE igual que hoy (sin mobile-nav)** — Regla 6.
- El `md:hidden` lo limita a mobile (donde el sidebar `hidden md:flex` no aparece). Cierra de paso el gap UX preexistente (dashboard sin nav móvil) **solo para v3**.
- El `<MobileNav />` del header de marketing (`header.tsx:11`) queda **byte-frozen** (NO se le pasa `v3`, NO se toca). El `<MobileNav v3 />` del dashboard pasa `v3` para renderizar el reskin editorial.

### Implicaciones para Plan 03

- **Plan 03 implementa:** (a) prop `v3?: boolean` default false en `MobileNav`, (b) el branch v3 con reskin editorial, (c) el mount nuevo `md:hidden` v3-only en `(dashboard)/layout.tsx`.
- **Plan 03 `depends_on` Plan 01:** ambos editan `(dashboard)/layout.tsx` (Plan 01 agrega `v3={isEditorialV3}` al `<Sidebar>` líneas 67-72; Plan 03 agrega el bloque del mount mobile-nav). Se **serializan** para evitar conflictos en el mismo archivo.

**Registrado:** MobileNav SÍ se monta ahora en el dashboard (D-05b, v3-only `md:hidden`). El path marketing (`header.tsx`) sigue sin `v3` = byte-frozen. El reskin v3 es alcanzable vía el mount nuevo.

---

## D-03 — Precedencia v3/v2 en el sidebar (Pitfall 7)

### Estado actual verificado (sidebar.tsx)

- `SidebarProps` (líneas 176-191) declara `v2?: boolean` (191).
- Firma actual: `export function Sidebar({ workspaces = [], currentWorkspace, user, v2 = false }: SidebarProps)` (línea 194).
- Branch `if (v2) { ... return (...) }` en línea 220 (return en 236).
- Return legacy en línea 398. Total archivo: 591 líneas.
- Los flags `ui_dashboard_v2` (→ prop `v2`) y `ui_editorial_v3` (→ prop `v3` nueva) son **independientes** — un workspace podría tener ambos ON.

### Decisión lockeada: `if (v3)` ANTES de `if (v2)` ANTES del return legacy

Justificación: v3 implica el ecosistema editorial **completo** (sidebar + content + dark + mobile-nav); gana sobre v2 (Propuesta B parcial). Es la precedencia natural. Estructura objetivo del sidebar:

```tsx
interface SidebarProps { workspaces?; currentWorkspace?; user?; v2?: boolean; v3?: boolean }

export function Sidebar({ workspaces = [], currentWorkspace, user, v2 = false, v3 = false }: SidebarProps) {
  // ... filterItem + workspaceSubline compartidos (sin cambios) ...

  if (v3) {                                                  // ← NUEVO (Plan 01)
    return (<aside className="sb theme-editorial-v3 hidden md:flex w-64 shrink-0"> ... </aside>)
  }
  if (v2) { return (...) }   // byte-frozen — branch actual líneas 220-396
  return (...)               // legacy byte-frozen — return actual líneas 398-591
}
```

- El `<aside>` del branch v3 lleva ADEMÁS `theme-editorial-v3` (Opción B del RESEARCH §D-03 — scope propio en el `<aside>`, NO en el root, NO un segundo `<main>`).
- **Regla 6:** los rangos `if (v2)` (220-396) y legacy (398-591) quedan **byte-frozen**; verificable vía `git diff` de esos rangos (deben mostrar 0 cambios; el diff solo agrega el branch v3 + la prop).
- **Cableado en layout.tsx (Plan 01):** agregar `v3={isEditorialV3}` al `<Sidebar>` (líneas 67-72). NO mover la clase de `<main>` (restricción dura D-03 del CONTEXT).

---

## D-04 — Empty-states con/sin topbar editorial → alcance del theme toggle

### Estado actual verificado

| Pantalla | Archivo:línea | Rama | ¿Renderiza topbar editorial? |
|----------|---------------|------|------------------------------|
| Contactos (empty) | `crm/contactos/components/empty-state.tsx:18` `if (v3)` → línea 20 `<section className="page">` | empty-state v3 | **NO** — `<section className="page">` centrada, SIN `<header className="topbar">`. |
| Pedidos (con datos) | `crm/pedidos/components/orders-view.tsx:940` `if (v3 && !isEmpty)` → 944 `<header className="topbar">`, 951 `<div className="actions">` | v3 con datos | **SÍ** — topbar editorial con `.actions`. |
| Pedidos (empty) | `crm/pedidos/components/orders-view.tsx:1176` `{isEmpty ? (...)}` | bloque legacy shadcn | **NO** — sin topbar editorial. El `isEmpty` (742) cae al bloque legacy shadcn. |

### Decisión lockeada: ningún empty-state v3 renderiza topbar editorial → el toggle va SOLO en los 3 topbars con datos

- **Contactos empty:** `<section className="page">` centrada → NO topbar → NO toggle.
- **Pedidos empty:** bloque legacy shadcn (`isEmpty`, línea 1176) → NO topbar editorial → NO toggle. El topbar v3 (`.actions`) SOLO existe en `if (v3 && !isEmpty)` (línea 940).
- **Conclusión:** el theme toggle (D-04) se agrega SOLO en los 3 topbars con datos (Plan 02):
  1. Inbox / Conversaciones — `whatsapp/components/inbox-layout.tsx` (YA tiene el provisional `<ThemeToggle />`; conservar + estilizar).
  2. Contactos — topbar `if (v3)` de `contacts-table.tsx` (~línea 284, dentro de `.actions`).
  3. Pedidos — topbar `if (v3 && !isEmpty)` de `orders-view.tsx` (~línea 951, dentro de `.actions`). NO mover el `<ThemeToggle />` de la rama v2/legacy (línea ~1348) — AGREGAR uno nuevo (Pitfall 2 del RESEARCH).
- Los **empty-states quedan FUERA de scope** para el toggle.

---

## Resumen de gates para las waves posteriores

| Decisión | Lockeada | Wave que la consume |
|----------|----------|---------------------|
| MobileNav mount sites (3 líneas, 2 archivos; Header solo en marketing) | ✅ | Plan 03 |
| Threading: prop `v3?: boolean` default false en MobileNav, sin nuevo provider | ✅ | Plan 03 |
| D-05b: mount NUEVO `md:hidden` v3-only en `(dashboard)/layout.tsx` | ✅ | Plan 03 (depends_on Plan 01) |
| Precedencia `if (v3)` ANTES de `if (v2)` ANTES de legacy en sidebar.tsx | ✅ | Plan 01 |
| Empty-states v3 SIN topbar → toggle SOLO en los 3 topbars con datos | ✅ | Plan 02 |

Las waves 1-4 pueden arrancar **sin preguntas abiertas**.
