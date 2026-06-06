# Gap-Closure: Sidebar v3 fiel al mock — Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Type:** gap_closure (post-ship QA feedback del usuario sobre la fase `ui-redesign-editorial-shell` ya shipeada + verificada 22/22)

<domain>
## Phase Boundary

Cerrar el gap de **fidelidad visual del branch `if (v3)` del sidebar** (`src/components/layout/sidebar.tsx:235-411`) contra el mock de Claude Design (`.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html:268-294`), y arreglar la **deformación** observada en producción.

**Diagnóstico raíz:** la fase original ejecutó la decisión del RESEARCH de *clonar la anatomía del sidebar v2 "Propuesta B"* en vez de reproducir el mock. Resultado real en prod:
- **Somnio** (`ui_editorial_v3` ON): "se ve igual que antes + color nuevo" — el v3 es estructuralmente el v2, solo cambió el fondo a paper plano.
- **Varixcenter** (ya tenía v3 ON): sidebar "más limpio pero DEFORME" — el `<WorkspaceSwitcher>` genérico (en caja con borde) + la caja de `<GlobalSearch>` se renderizan grandes/desalineados en el `w-64` editorial.

**Causa técnica concreta:** el CSS del switcher limpio del mock (`.ws/.ws-badge/.ws-meta/.ws-name/.ws-plan/.ws-caret`) **nunca se portó** a `.theme-editorial-v3` en `globals.css`; el sidebar v3 reusa el componente genérico viejo + una caja de search que el mock no tiene.

**En scope:** SOLO el branch `if (v3)` del sidebar + el CSS `.theme-editorial-v3` correspondiente. NADA fuera del sidebar v3.
**Fuera de scope:** topbars, mobile-nav, dark audit (ya shipeados), cualquier pantalla de contenido, mover features a otros lugares (la search NO se reubica a topbar — se quita).
</domain>

<decisions>
## Implementation Decisions

### Anatomía del sidebar v3 (fiel al mock)
- **D-G1 (Búsqueda):** QUITAR `<GlobalSearch>` del branch v3 del sidebar — el mock no tiene caja de search. No se reubica (la búsqueda de conversaciones/contactos ya vive dentro de cada pantalla). Borrar el bloque `<div className="px-3 py-3"><GlobalSearch /></div>` (sidebar.tsx ~275-277) SOLO del branch v3. El import de `GlobalSearch` se conserva si el v2/legacy aún lo usan (verificar; si queda huérfano, removerlo sin romper v2/legacy).
- **D-G2 (Footer usuario):** MANTENER el footer de usuario (avatar inicial + nombre + email + logout) — el mock no lo muestra pero el logout es funcional crítico. Re-estilizarlo limpio al scope editorial (sin perder el `<form action={logout}>`). NO eliminarlo.
- **D-G3 (Workspace switcher):** El `<WorkspaceSwitcher>` DEBE seguir funcional (cambia de workspace). Re-estilizar su APARIENCIA al look `.ws` del mock: badge con inicial del workspace + nombre + caret ▾, SIN la caja con borde actual (`px-3 py-3` + `borderBottom`). Subtítulo (línea `.ws-plan` del mock): usar dato REAL — `currentWorkspace.business_type` si existe, si no "CRM" (o sin subtítulo). **NO inventar "Plan Pro · N agentes"** — el tipo `Workspace` NO tiene `plan` ni `agent_count`.
- **D-G4 (Logo):** Usar la IMAGEN del logo (`public/logo-light.png` + `public/logo-dark.png`) en `.wm`, igual que Claude Design / el mock (que usa `<img class="wm">`). El CSS `.theme-editorial-v3 .wm img{mix-blend-mode:multiply}` + el dark `.dark .theme-editorial-v3 .wm img{...invert...}` YA existen. Reemplazar el wordmark de texto `morf<b>·</b>x` del branch v3 por `<img src="/logo-light.png" ...>` (o el patrón light/dark que use el resto del app). Mantener el `.sub` (subtítulo "X · CRM") debajo si encaja con el mock; si el mock no lo tiene bajo el logo, moverlo al switcher (D-G3).

### CSS a portar (globals.css, APPEND bajo .theme-editorial-v3)
- **D-G5:** Portar las reglas `.theme-editorial-v3 .ws`, `.ws-badge`, `.ws-meta`, `.ws-name`, `.ws-plan`, `.ws-caret` desde el `<style>` del mock `crm-editorial.html` (extraerlas verbatim y prefijarlas con `.theme-editorial-v3`). APPEND-only; sin tocar legacy; sin compound dark (usar `.dark .theme-editorial-v3 .ws*` si hace falta override dark).

### Claude's Discretion
- El markup exacto del switcher restyled (envolver el trigger del `<WorkspaceSwitcher>` con las clases `.ws/.ws-badge/.ws-meta/...` vs pasar una prop de variante) — el planner/research decide el mecanismo menos invasivo que mantenga la funcionalidad del dropdown.
- Si `business_type` suele venir vacío en prod, Claude decide entre mostrar "CRM" fijo u omitir el subtítulo.
- El patrón light/dark del `<img>` del logo (dos imgs con CSS show/hide, o una sola con el filtro dark ya existente).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Mock (fuente de verdad visual)
- `.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html` §268-294 — el `<aside class="sb">` objetivo: `.brand>.wm>img`, `.ws` (badge+meta+caret), `.sb-nav>ul` con `.cat` inline. El `<style>` del mismo archivo tiene el CSS `.ws*` a portar.

### Código a modificar
- `src/components/layout/sidebar.tsx` §235-411 — branch `if (v3)` (el ÚNICO a tocar; v2 §418-595 y legacy §596+ byte-frozen).
- `src/app/globals.css` §1385-1395 — bloque `.theme-editorial-v3 .sb/.brand/.wm/.sub/sb-nav/.cat` (APPEND `.ws*` aquí); §1379 `.dark .theme-editorial-v3 .wm img`.
- `src/components/workspace/workspace-switcher.tsx` — componente funcional a re-estilizar (no romper el dropdown).

### Reglas
- `CLAUDE.md` Regla 6 (proteger no-v3), Regla 1 (push), Regla 5 (sin migración aquí).
- `.planning/standalone/ui-redesign-editorial-shell/REGLA6-GATE.md` — los 10 invariantes a re-correr tras el fix.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<WorkspaceSwitcher>` (`src/components/workspace/workspace-switcher.tsx`): dropdown funcional de cambio de workspace — re-estilizar, no reemplazar.
- `public/logo-light.png` + `public/logo-dark.png`: assets de logo existentes.
- `.theme-editorial-v3 .wm img` + `.dark .theme-editorial-v3 .wm img`: CSS de logo-img YA definido (light multiply + dark invert).
- Tipo `WorkspaceWithRole extends Workspace { name, slug, business_type, settings, role }` — NO tiene plan/agent_count.

### Established Patterns
- Branches del sidebar: `if (v3)` → `if (v2)` → legacy (precedencia lockeada). Solo el v3 se toca.
- CSS editorial: APPEND-only bajo `.theme-editorial-v3`, descendant dark `.dark .theme-editorial-v3`, sin compound.

### Integration Points
- `src/app/(dashboard)/layout.tsx` pasa `v3={isEditorialV3}` + `currentWorkspace`/`user`/`workspaces` al `<Sidebar>` (sin cambios necesarios).
</code_context>

<specifics>
## Specific Ideas

- "Igual que Claude Design" = el mock `crm-editorial.html` es la referencia literal del sidebar v3.
- Síntomas reportados con screenshots: Somnio (v3) = igual+color; Varixcenter (v3) = limpio pero deforme; ambos deben terminar como el mock.
</specifics>

<deferred>
## Deferred Ideas

- Reubicar GlobalSearch al topbar (rechazado por ahora — se quita del sidebar, no se mueve).
- Exponer `plan`/`agent_count` reales en el tipo Workspace para el subtítulo del switcher (no existe data hoy; futura mejora si se quiere el "Plan Pro · N agentes" real).

None other — discussion stayed within the sidebar v3 fidelity scope.
</deferred>

---

*Phase: ui-redesign-editorial-shell (gap-closure: sidebar v3 fidelity)*
*Context gathered: 2026-06-06*
