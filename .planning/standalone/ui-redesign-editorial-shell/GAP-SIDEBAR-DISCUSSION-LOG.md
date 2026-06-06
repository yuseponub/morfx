# Gap-Closure Sidebar v3 — Discussion Log

> **Audit trail only.** Decisions live in GAP-SIDEBAR-CONTEXT.md.

**Date:** 2026-06-06
**Phase:** ui-redesign-editorial-shell (gap-closure: sidebar v3 fidelity)
**Areas discussed:** GlobalSearch, Footer usuario, Workspace switcher, Logo

---

## GlobalSearch en el sidebar v3

| Option | Description | Selected |
|--------|-------------|----------|
| Quitarla del sidebar (fiel al mock) | El sidebar v3 sin caja de search, igual que el mock | ✓ |
| Mantenerla pero restyling editorial | Conservar la caja restyled | |
| Moverla al topbar | Sacarla del sidebar y montarla en el topbar v3 | |

**User's choice:** Quitarla del sidebar (fiel al mock)

---

## Footer de usuario

| Option | Description | Selected |
|--------|-------------|----------|
| Mantenerlo, restyled editorial | Conservar avatar+email+logout, re-estilizado limpio | ✓ |
| Quitarlo (fiel al mock estricto) | Eliminar el footer, mover logout a otra parte | |

**User's choice:** Mantenerlo, restyled editorial

---

## Workspace switcher

| Option | Description | Selected |
|--------|-------------|----------|
| Restyle a .ws: badge + nombre + 'CRM'/business_type | (1ª pregunta) | |
| Restyle a .ws: badge + nombre solamente | (1ª pregunta) | |
| Mantener el WorkspaceSwitcher genérico actual | (1ª pregunta) | (✓ inicial, aclarado) |
| **Re-estilizar al look .ws del mock (sigue funcional)** | (aclaración) badge+nombre+caret, sin caja con borde, funcional | ✓ |
| Dejarlo exactamente como está (genérico) | (aclaración) | |

**User's choice:** Re-estilizar al look `.ws` del mock manteniéndolo funcional. (La 1ª selección "mantener genérico" se aclaró: el usuario quería conservar la FUNCIÓN del switcher, no su apariencia deforme.)
**Notes:** Subtítulo con dato real (business_type/"CRM"); NO inventar "Plan Pro · N agentes" (sin data en el tipo Workspace).

---

## Logo del brand

| Option | Description | Selected |
|--------|-------------|----------|
| Mantener wordmark de texto morf·x | Direcció n tipográfica editorial | |
| Usar imagen logo-light/dark.png | Más fiel al HTML del mock | ✓ (vía "igual que el de claude design") |

**User's choice (free text):** "igual que el de claude design" → usar la imagen del logo como el mock.

## Claude's Discretion
- Mecanismo del switcher restyled (wrap del trigger vs prop de variante).
- Subtítulo del switcher si business_type viene vacío.
- Patrón light/dark del `<img>` del logo.

## Deferred Ideas
- Reubicar search al topbar (rechazado).
- Exponer plan/agent_count reales para el subtítulo (no existe data hoy).
