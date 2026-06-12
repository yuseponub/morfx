# Standalone: template-builder-suggested-actions — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** standalone/template-builder-suggested-actions
**Areas discussed:** Comportamiento del click, Confirmación final, Chips de arranque, Mecánica merge + persistencia

---

## Pre-locked (conversación de discovery, antes del discuss formal)

| Option | Description | Selected |
|--------|-------------|----------|
| A: chips solo de IA (tool) | Más contextual; frágil (bug-class REGLA CERO) | |
| B: chips solo deterministas | Confiable, cero latencia; menos contextual | |
| C: híbrido | Base determinista + IA añade vía tool opcional | ✓ |

**User's choice:** Opción C + tope de 3-4 chips por ronda TOTAL.

---

## Comportamiento del click

| Option | Description | Selected |
|--------|-------------|----------|
| Mensaje visible | Texto del chip como burbuja del usuario, sendMessage normal | ✓ |
| Silencioso | Sin burbuja; chat limpio pero historial confuso al recargar | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, híbrido con acciones locales | 'Subir imagen' abre file picker; 'Ver mis templates' navega; resto envía mensaje | ✓ |
| No, todo vía mensaje | Uniforme pero más lento | |

---

## Confirmación final

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, cuenta | Click envía 'Confirmo, créalo'; chip solo visible cuando validación pasó | ✓ |
| No, doble paso | Usuario debe tipear 'confirmo' manualmente | |

---

## Chips de arranque

| Option | Description | Selected |
|--------|-------------|----------|
| Set genérico | Confirmación de pedido · Recordatorio de cita · Promoción · Código de verificación | ✓ |
| Set e-commerce + salud | Sin OTP, con seguimiento post-venta | |

| Option | Description | Selected |
|--------|-------------|----------|
| Descripción completa | Prompt pre-armado rico → borrador inmediato | ✓ |
| Frase corta | La IA pregunta detalles | |

---

## Mecánica merge + persistencia

| Option | Description | Selected |
|--------|-------------|----------|
| Determinista manda | Deterministas primero, IA rellena slots restantes | ✓ |
| IA manda | Contextual primero; paso crítico puede quedar fuera | |
| 2 + 2 fijo | Predecible pero rígido | |

| Option | Description | Selected |
|--------|-------------|----------|
| Recalcular todo | Deterministas del draft + IA-chips del tool-result persistido en messages | ✓ |
| Solo deterministas | IA-chips se pierden al recargar | |
| Sin chips tras recarga | Solo en sesión activa | |

---

## Claude's Discretion

- Estilo visual de los chips (seguir design system del builder)
- Texto exacto de chips por etapa y los 4 prompts de arranque
- Schema de la tool `suggestActions` + instrucción en system prompt
- Lógica de detección de etapa desde el draft

## Deferred Ideas

- Portar chips al builder de automatizaciones (follow-up)
- Chips de arranque personalizados por workspace (V2)
- Telemetría de clicks en chips (V2)
