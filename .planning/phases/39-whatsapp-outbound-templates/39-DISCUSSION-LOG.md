# Phase 39: WhatsApp Outbound + Templates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 39-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 39-whatsapp-outbound-templates
**Areas discussed:** Secuencia, Primer cutover, Ventana 24h, Templates

---

## Secuencia / alcance del build

| Option | Description | Selected |
|--------|-------------|----------|
| Slice fino primero | Texto + switch de provider para que un número responda end-to-end, luego media/templates/interactivos | |
| Todo antes del cutover | Construir todo (texto+media+templates+interactivos+read-receipts) y recién ahí migrar | ✓ |

**User's choice:** Todo antes del cutover.

---

## Primer cutover (validación real)

| Option | Description | Selected |
|--------|-------------|----------|
| Número de prueba (Pruebas Morfx) | El que activamos hoy; riesgo cero a Somnio | ✓ |
| Un cliente real chico | Bajo volumen real, algo de riesgo | |
| Somnio | Máxima señal, máximo riesgo | |

**User's choice:** Número de prueba (Pruebas Morfx).

---

## Ventana 24h (re-engagement / 131047)

**Nota:** la primera vez el usuario no conocía el concepto ("ese reengagement no se de que hablas").
Se explicó: regla de WhatsApp (24h para texto libre tras mensaje del cliente; luego solo templates).
Se verificó que MorfX YA lo maneja hoy (`actions/messages.ts`: "Ventana de 24h cerrada. Usa un template.")
y que se hereda gratis para Meta. Se re-preguntó con contexto correcto.

| Option | Description | Selected |
|--------|-------------|----------|
| Dejar como está (bloquear + avisar) | Comportamiento actual, hereda gratis, cero trabajo nuevo | ✓ |
| Auto-template de re-engagement | NUEVO: enviar template aprobado automático para reabrir | |

**User's choice:** Dejar como está (bloquear + avisar). Auto-template → Deferred.

---

## Templates (WA-08/09)

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar tabla/UI, provider-aware | Misma whatsapp_templates + UI, CRUD/status provider-aware | (base) |
| Solo enviar templates primero | Diferir CRUD Meta a ola posterior | |
| CRUD nuevo separado | Tabla/flujo aparte para Meta | (parcial) |

**User's choice (free text):** "todo super completo" — funcionalidad total (crear, editar, eliminar,
status), research-driven para tener TODAS las features; usar el builder existente como base aunque
posiblemente flujo aparte para entender todo el ciclo de creación. → Capturado como D-05 con research
obligatorio sobre las restricciones de edición de Meta (no se editan templates aprobados).

---

## Claude's Discretion
- Threading de credenciales Meta en el sender, implementación media CDN, read-receipt trigger, builder interactivo.

## Deferred Ideas
- Auto-template de re-engagement; flip de Somnio/clientes a meta_direct; cambiar default global a meta_direct; FB Messenger (40); Instagram (41).
