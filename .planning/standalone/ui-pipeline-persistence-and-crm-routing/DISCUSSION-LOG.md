# Standalone: UI Pipeline Persistence + CRM Routing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Standalone:** ui-pipeline-persistence-and-crm-routing
**Areas discussed:** Pipeline persistence strategy, Pipeline-not-found edge case, Sidebar v2 structure, Scope (v2 vs legacy)

---

## Pipeline persistence strategy

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage por workspace | Browser-local, simple, funciona offline. Sin shareability. | |
| URL query param (`?pipeline=<id>`) | Shareable, deep-linkable, F5 nativo. Pierde "ultima visita" si entras fresh. | |
| URL + localStorage hibrido | URL gana siempre que esté presente; localStorage cubre "última visita" cuando no hay query. | ✓ |

**User's choice:** "1, decide tú que no se generen bugs" — usuario delegó a Claude. Claude eligió hibrido por cubrir F5 + share + ultima visita simultaneamente.
**Notes:** Se descartó user_preferences en DB porque multi-device sync no es requisito y agregaria complejidad sin valor inmediato.

---

## Pipeline-not-found edge case

| Option | Description | Selected |
|--------|-------------|----------|
| Toast "Pipeline X no existe" + fallback al default | Avisa al usuario que su preferencia se perdio. | |
| Caida silenciosa al default | Sobrescribe la key cuando el usuario haga la siguiente seleccion. | ✓ |

**User's choice:** "silencioso"
**Notes:** Aplica tanto al pipeline de URL (404 logico) como al de localStorage (id stale tras eliminacion).

---

## Sidebar v2 structure post-cambio

| Option | Description | Selected |
|--------|-------------|----------|
| Quitar sublink "Pedidos" duplicado, dejar solo CRM → /crm/pedidos. Contactos via tabs internas. | Una sola entrada al CRM, navegacion interna via `<CrmTabs/>`. | ✓ |
| Reestructurar CRM como item con sublinks visibles (Pedidos / Contactos) en sidebar | Sublinks expanded en sidebar, mas clicks pero descubrible. | |

**User's choice:** "la estructura de crm como esta en el nuevo diseño"
**Notes:** El nuevo diseño v2 ya tiene `<CrmTabs/>` interno con Contactos | Pedidos·kanban | Pipelines | Configuración. La intencion es respetar esa arquitectura: el sidebar lleva al hub CRM, las tabs internas hacen el resto.

---

## Scope (v2 vs legacy)

| Option | Description | Selected |
|--------|-------------|----------|
| Solo v2 (Somnio) | Tocar solo branches `if (v2)` y `navCategoriesV2`. Legacy queda byte-identical. | ✓ |
| Aplicar tambien a sidebar legacy | Cambiar `navItems[0]` y rama `v2=false` del redirect. | |

**User's choice:** "TODO ESTO ES PARA EL DISENO QUE ESTA ACTIVO EN EL WORKSPACE DE SOMNIO, PORQUE EL ANTERIOR UI ERA DIFERENTE"
**Notes:** Regla 6 fail-closed — la rama legacy se mantiene byte-identical para no afectar workspaces que aun corran v1.

---

## Claude's Discretion

- Implementacion exacta del `useEffect` de hidratacion URL ↔ localStorage.
- Si el cambio de pipeline en UI usa `router.replace` (default) o `router.push`.
- Manejo del race condition entre `defaultPipelineId` resuelto en server vs el id de localStorage en client.

## Deferred Ideas

- User-level pipeline preference en DB (`user_preferences`) para multi-device sync.
- Tab "Pipelines" funcional (comingSoon en crm-tabs.tsx).
- Cleanup del sidebar legacy una vez v2 este 100% rolled out.
