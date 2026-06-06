# Standalone `ui-redesign-editorial-shell` — Context

**Gathered:** 2026-06-06
**Status:** Ready for research
**Parent:** continuation of `ui-redesign-editorial-core` (shipped 2026-06-06) — the deferred D-06 sidebar + dark fidelity.

<domain>
## Phase Boundary

Reskin del **chrome global** del dashboard al sistema editorial v3, bajo el MISMO flag `ui_editorial_v3` ya existente:
1. **Sidebar editorial v3** (desktop) — branch nuevo gated por el flag, matcheando la referencia Claude design (`handoff/src/components/layout/sidebar.tsx`).
2. **Mobile nav editorial v3** — reskin de `mobile-nav.tsx`.
3. **Theme toggle definitivo** — ubicado en el área superior (topbar) de los módulos v3, consistente.
4. **Dark mode fidelity** — auditoría completa token-por-token de las 3 pantallas ya shipeadas (Conversaciones/Contactos/Pedidos) + el nuevo sidebar + mobile nav, vs el reference del design-system.

**NO incluye:** reskin de módulos de contenido aún no portados (Tareas, SMS, Analytics, Agentes, Comandos, Confirmaciones, Equipo, Configuración, Sandbox) — siguen diferidos. Solo el chrome (sidebar/mobile-nav/toggle) + dark de lo ya existente.
</domain>

<decisions>
## Implementation Decisions

### Flag & activación
- **D-01:** MISMO flag `ui_editorial_v3` (NO flag nuevo). Cuando un workspace tiene `ui_editorial_v3.enabled=true`, ve TODO editorial junto: contenido (ya shipeado) + sidebar v3 + mobile nav + dark refinado. Default OFF, fail-closed, SIN migración (sub-key JSONB en `workspaces.settings`, igual que el core).
- **D-08:** Activación per-workspace vía el mismo `UPDATE workspaces SET settings=jsonb_set(...,'{ui_editorial_v3,enabled}','true')`. Sin nuevo flag que probar.

### Sidebar
- **D-02:** Branch `if (v3)` NUEVO en `src/components/layout/sidebar.tsx`, gated por `ui_editorial_v3`, matcheando `handoff/.../sidebar.tsx`. **COEXISTE** con la v2 "Propuesta B" (branch `if (v2)` gated por `ui_dashboard_v2`) y con el legacy — ambos quedan **byte-frozen** (Regla 6). Espeja el patrón probado inbox v2/v3.
- **D-03:** El sidebar v3 necesita que el scope `.theme-editorial-v3` (o sus tokens) le apliquen. Hoy el scope vive SOLO en `<main>` (core D-06 excluyó el sidebar a propósito). Este standalone **revierte D-06 deliberadamente** para el caso v3. **El mecanismo exacto lo define research** — opciones a investigar: aplicar la clase al shell root cuando v3 ON (sin filtrarse a v2/legacy), o al `<aside>` del branch v3, o exponer los tokens v3 al sidebar. Restricción dura: NO debe cambiar el render de la v2 Propuesta B ni del legacy (Regla 6), y NO debe alterar el `<main>` content reskin ya vivo.
- **D-07:** Scope del sidebar = matchear `handoff/.../sidebar.tsx`: wordmark/brand (logo light/dark), workspace switcher, nav items + categorías, footer de usuario. El **theme toggle NO va en el sidebar** (ver D-04).

### Theme toggle
- **D-04:** El toggle de tema (light/dark/system) vive en el **área superior (topbar) de cada módulo** — el espacio con info general (eyebrow + título) + acciones — NO en el footer del sidebar. Decisión explícita del usuario ("en todos los módulos hay un espacio arriba donde hay info general + algunas opciones, lo podemos dejar ahí"). El placement provisional ya agregado al topbar del inbox v3 (`inbox-layout.tsx`) se **conserva** y se **extiende** consistentemente a los topbars v3 de `/crm/contactos` y `/crm/pedidos`, estilizado editorial para encajar. Implicación: el toggle aparece en las 3 pantallas v3 reskineadas; planning decide si/cómo cubrir módulos no-reskineados (probablemente fuera de scope — esos no tienen topbar editorial).

### Mobile nav
- **D-05:** `src/components/layout/mobile-nav.tsx` (94 líneas) **entra en scope** — reskin editorial v3 gated por el flag, coexistiendo con su variante actual (Regla 6 sobre el path no-v3).

### Dark mode
- **D-06:** **Auditoría dark completa, token por token**, aunque el usuario dijo que "ya se parece". Cubre: las 3 pantallas de contenido ya shipeadas (`.dark .theme-editorial-v3`), el nuevo sidebar v3, y el mobile nav, contra el reference del design-system (`morfx-editorial-context.html` / `handoff/colors_and_type.css`). Corregir divergencias de tokens (bg, ink, paper, border, accents, charcoal-warm) aunque sean sutiles. Dark mantiene textura OFF (regla ya establecida en core GAP-04).

### Regla 6 (no romper lo vivo)
- **D-09:** Byte-frozen obligatorio: branch v2 "Propuesta B" + legacy del sidebar; el content reskin v3 ya shipeado (3 pantallas) salvo el ADD del toggle en sus topbars (D-04) y fixes de tokens `.dark .theme-editorial-v3` (D-06); la inbox v2 legacy de Somnio. Todo cambio nuevo es ADITIVO y v3-gated. Verificable vía grep/`git diff` de los branches no-v3.

### Claude's Discretion
- Mecanismo CSS exacto del scope en el sidebar (D-03) — research/planning lo resuelve.
- Estilo editorial fino del toggle en el topbar (D-04) — encajarlo con el chrome editorial.
- Cómo se ordenan/categorizan los nav items del sidebar v3 (seguir el handoff, o reusar las categorías de la v2 Propuesta B si encajan mejor).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de referencia (Claude design)
- `.planning/standalone/ui-redesign-editorial-core/handoff/src/components/layout/sidebar.tsx` — referencia TSX del sidebar (brand logo light/dark, workspace switcher, nav, footer usuario). Fuente de verdad del look del sidebar v3.
- `.planning/standalone/ui-redesign-editorial-core/handoff/colors_and_type.css` — tokens base paper/ink/dark + paper-grain/fibers.
- `.planning/design-system/morfx-editorial-context.html` — reference de dark mode + tokens (para la auditoría dark D-06).

### Código a tocar / extender
- `src/components/layout/sidebar.tsx` — sidebar prod: branch legacy + branch v2 "Propuesta B" (`if (v2)`, clases `.sb/.brand/.wm/.sub/.cat/.sb-nav`). Agregar branch `if (v3)` (D-02).
- `src/components/layout/mobile-nav.tsx` — mobile nav a reskinear (D-05).
- `src/components/layout/theme-toggle.tsx` — componente toggle existente (Sun/Moon dropdown light/dark/system) a colocar en topbars v3 (D-04).
- `src/app/(dashboard)/layout.tsx` — shell: resuelve `isEditorialV3` y aplica `theme-editorial-v3` en `<main>`. Aquí se decide cómo el sidebar recibe el scope v3 (D-03). Renderiza `<Sidebar v2={isDashboardV2} />` — pasar también `v3`.
- `src/app/globals.css` — `.theme-editorial-v3` (light ~1124) + `.dark .theme-editorial-v3` (~1363). Agregar reglas del sidebar v3 + fixes dark (D-06). Legacy `.theme-editorial` (1..1012) byte-frozen.
- `src/lib/auth/editorial-v3.ts` — resolver `getIsEditorialV3Enabled` (reusar; sin cambios).
- Topbars v3 a extender con el toggle (D-04): `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` (ya tiene el provisional), `crm/contactos/.../contacts-table.tsx`, `crm/pedidos/.../orders-view.tsx`.

### Contexto del padre (decisiones heredadas)
- `.planning/standalone/ui-redesign-editorial-core/CONTEXT.md` + `UI-SPEC.md` + `RESEARCH.md` — el mecanismo de aislamiento `.theme-editorial-v3`, dark descendant selector `.dark .theme-editorial-v3`, flag sin migración, Regla 6. D-06 del core (sidebar excluido) se revierte AQUÍ.
- Memoria: [[ui_redesign_editorial_core]] (shipped + QA-passed), [[ui_redesign_dashboard_retrofit]] (origen de la v2 "Propuesta B"), [[ui_redesign_inbox_v2]].
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `theme-toggle.tsx` — ya existe, funcional (next-themes, `defaultTheme="system"`). Solo hay que colocarlo + estilizar editorial.
- Patrón v2/v3 coexistencia probado en el inbox (`if (v3) return` early, `useInboxV3()` default-false) — replicar en el sidebar.
- Resolver `getIsEditorialV3Enabled` listo.

### Established Patterns
- Coexistencia por branch gated + flag JSONB sin migración (inbox v2/v3, sidebar v2 Propuesta B).
- Dark via descendant `.dark .theme-editorial-v3` (next-themes pone `.dark` en `<html>`).
- Regla 6: branches no-target byte-frozen, verificable por grep/git diff.

### Integration Points
- `(dashboard)/layout.tsx` ya resuelve `isEditorialV3` y `isDashboardV2`, y renderiza `<Sidebar v2={...} />` + `<main className={... theme-editorial-v3}>`. Punto único para cablear `v3` al sidebar y decidir el scope (D-03).
</code_context>

<specifics>
## Specific Ideas
- "Exacto como te lo pasé de Claude design" → el sidebar debe matchear `handoff/.../sidebar.tsx` (logo light/dark, Avatar footer, nav).
- El dark "ya se parece" pero el usuario pidió auditoría completa igual (D-06) — refinar lo sutil.
- Toggle en el área superior de los módulos, no en el sidebar (D-04, preferencia explícita).
</specifics>

<deferred>
## Deferred Ideas
- Reskin editorial de los demás módulos de contenido (Tareas, SMS, Analytics, Agentes, Comandos, Confirmaciones, Equipo, Configuración, Sandbox) — futuros standalones.
- Toggle de tema en headers de módulos NO reskineados — fuera de scope (esos no tienen topbar editorial).
- Activación de v3 en producción (Somnio u otros) — decisión de negocio posterior, tras correr el harness ≥95% del core.
</deferred>

---

*Standalone: ui-redesign-editorial-shell*
*Context gathered: 2026-06-06*
