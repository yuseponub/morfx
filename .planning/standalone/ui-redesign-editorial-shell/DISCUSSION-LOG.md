# Standalone `ui-redesign-editorial-shell` — Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Standalone:** ui-redesign-editorial-shell (continuation of ui-redesign-editorial-core)
**Areas discussed:** Gating, Scope grouping, Dark level, Sidebar architecture, Theme toggle placement, Mobile nav, Dark audit scope

---

## Pre-locked (decididas en la conversación previa al discuss)

| Decisión | Elección |
|----------|----------|
| Flag | **Mismo `ui_editorial_v3`** (sidebar + dark se encienden con el contenido) |
| Agrupación | **Un solo standalone** (sidebar + dark + toggle) |
| Nivel inicial de dark | "Ya se parece" → revisado por el usuario vía toggle in-app |

## Sidebar — arquitectura vs la v2 "Propuesta B" existente

| Option | Description | Selected |
|--------|-------------|----------|
| Branch v3 nuevo (coexiste) | `if (v3)` gated por ui_editorial_v3, matchea handoff, coexiste con v2 Propuesta B (byte-frozen). Espeja inbox v2/v3 + Regla 6 | ✓ |
| Promover la v2 actual | Tomar la v2 como base del v3 (toca branch v2, riesgo regresión) | |
| Reemplazar v2 por v3 | v3 deprecaría v2 (rompe Regla 6 si hay workspaces dashboard_v2) | |

**User's choice:** Branch v3 nuevo (coexiste).

## Theme toggle — placement definitivo

| Option | Description | Selected |
|--------|-------------|----------|
| Footer del sidebar + quitar provisional | Toggle en footer del sidebar, remover el del topbar | |
| Footer del sidebar + dejar provisional | Dos toggles | |
| En el header del workspace switcher | Arriba, cerca del selector | |
| **(Other) Topbar del módulo** | "en todos los módulos hay un espacio arriba donde hay info general + algunas opciones, lo podemos dejar ahí" | ✓ |

**User's choice (Other):** Dejar el toggle en el **área superior (topbar)** de cada módulo donde está hoy el provisional, y extenderlo consistente a los demás topbars v3. NO en el sidebar.

## Mobile nav

| Option | Description | Selected |
|--------|-------------|----------|
| Diferir a follow-up | mobile-nav fuera de scope | |
| Incluir en scope | Reskin editorial v3 del mobile-nav | ✓ |

**User's choice:** Incluir en scope.

## Dark mode — alcance del refinamiento

| Option | Description | Selected |
|--------|-------------|----------|
| Solo el sidebar nuevo + spot-fixes | Mínimo, dado que "ya se parece" | |
| Auditoría dark completa | Token por token, 3 pantallas + sidebar + mobile nav vs reference | ✓ |

**User's choice:** Auditoría dark completa.

## Claude's Discretion
- Mecanismo CSS del scope v3 en el sidebar (research).
- Estilo editorial fino del toggle en el topbar.
- Orden/categorías de nav items del sidebar v3.

## Deferred Ideas
- Reskin de los demás módulos de contenido.
- Toggle en headers de módulos no reskineados.
- Activación de v3 en producción.
