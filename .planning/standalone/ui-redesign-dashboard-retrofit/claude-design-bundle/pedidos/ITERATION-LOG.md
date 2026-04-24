# ITERATION LOG — mock Pedidos v2.1 refinement

Track cada pasada del loop `Claude Design ↔ Claude Code ↔ Usuario` acá. El archivo `pedidos.html` en el bundle queda reemplazado en cada iteración; las versiones históricas quedan en git.

---

## v0 — baseline (2026-04-24)

**Entregado por:** Claude Design (handoff v2.1 original)
**Archivo:** `02-pedidos-baseline.html` (425 líneas) — también en `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html`
**Estado:** baseline para refinar. No implementado en codebase. Coverage n/a.

**Highlights baseline (inventario rápido):**
- (pendiente de audit — el usuario decide si hace review manual del baseline antes de enviar a CD o si va directo)

---

## v1 — pendiente (próxima entrega de Claude Design)

**Solicitado:** 2026-04-24 (bundle entregado a CD con `01-BRIEF.md` + 5 archivos de contexto)
**Scope:** primera pasada refinement. CD aplica las decisiones del BRIEF sobre el baseline.
**Expected deliverable:** `pedidos.html` refinado + mock_coverage yaml + decisiones locked inline.

**Feedback de Claude Code:** (pendiente — escribir acá cuando CD entregue)

**Feedback del usuario:** (pendiente)

**Decisión:** (pendiente — keep iterating / approved for implementation)

---

## v2 → vN — (reservar espacio)

(Cada vuelta agregar sección nueva con: fecha, qué cambió, feedback técnico, feedback usuario, decisión.)

---

## Cuando se aprueba

1. Marcar última versión como `APPROVED` en este log.
2. Commit del mock final en `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html`.
3. Arrancar `/gsd-discuss-phase ui-redesign-dashboard-retrofit` en nueva sesión Claude Code.
4. Crear `.planning/standalone/ui-redesign-dashboard-retrofit/02-PLAN.md` con `mock_coverage` frontmatter derivado del yaml del mock.
5. Execute.
