---
status: complete
phase: 09-crm-whatsapp-sync + 09.1-order-states-config
source: 09-01 to 09-07 SUMMARY.md, 09.1-01 to 09.1-03 SUMMARY.md
started: 2026-02-03T21:30:00Z
updated: 2026-02-03T21:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Indicador de pedido en conversación
expected: En la lista de conversaciones de WhatsApp, si el contacto tiene un pedido activo, aparece un emoji indicador en la esquina del avatar (estilo Callbell)
result: pass

### 2. Tags duales en panel de contacto
expected: En el panel derecho del chat, se muestran dos secciones: "Etiquetas de chat" (tags de conversación) y "Etiquetas de contacto" (tags heredados, con 60% opacidad)
result: pass

### 3. Agregar tag a conversación
expected: En el header del chat hay un componente para agregar tags. Al hacer clic aparece un selector con tags disponibles (scope whatsapp/both). Al seleccionar, el tag se agrega a la conversación.
result: pass

### 4. Quitar tag de conversación
expected: Al pasar el mouse sobre un tag en el header del chat, aparece una X. Al hacer clic, el tag se elimina de la conversación.
result: pass

### 5. Sección WhatsApp en CRM
expected: En el detalle de un contacto CRM (/crm/contactos/[id]), en la pestaña Info, hay una sección "WhatsApp" que muestra las conversaciones del contacto con link para abrir el chat.
result: pass

### 6. Realtime de indicadores
expected: Si cambias el stage de un pedido en el Kanban, el indicador en WhatsApp se actualiza sin recargar la página.
result: pass

### 7. Config estados de pedido - Crear
expected: En /crm/configuracion/estados-pedido puedes crear un nuevo estado con nombre y emoji. Aparece en la lista.
result: pass

### 8. Config estados de pedido - Reordenar
expected: Puedes arrastrar los estados de pedido para reordenarlos. El orden se guarda.
result: pass

### 9. Config estados de pedido - Asignar stages
expected: Al editar un estado, puedes asignar stages del pipeline. Los stages asignados a otros estados aparecen deshabilitados.
result: pass

### 10. Emoji personalizado en WhatsApp
expected: Si asignas un stage a un estado con emoji personalizado, el indicador en WhatsApp muestra ese emoji en lugar del default.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
