# WhatsApp History Importer — Discussion Log

> **Audit trail only.** Las decisiones canónicas viven en CONTEXT.md.

**Date:** 2026-06-09
**Standalone:** whatsapp-history-importer (Etapa 2 de 2)
**Areas discussed:** Marcador de origen, Chats sin número, Sistema+media, Merge con tráfico vivo, Entrega

---

## Selección de zonas grises

| Zona | Decisión |
|------|----------|
| Marcador de origen | Discutida |
| Merge con tráfico vivo | Discutida |
| Chats sin número | Resuelta directa: alertar y NO importar |
| Sistema + media | Resuelta directa: "por ahora no hay media solo chat" → V1 solo texto |

---

## Marcador de origen

| Opción | Selected |
|--------|----------|
| Solo prefijo wamid `import:<chatId>:<idx>` (cero migración, idempotencia gratis vía UNIQUE existente) | ✓ |
| wamid + columna `imported_at` (migración + pausa Regla 5) | |
| wamid + columna `source` (migración + pausa Regla 5) | |

**Choice:** Solo prefijo wamid. → D-01. No migración → Regla 5 no aplica.

## Chats sin número (`numberMissing=true`)

**Choice:** Alertar y NO importar (reportar). Nunca inventar número. → D-02.

## Sistema + media

**Choice:** "por ahora no hay media solo chat" → V1 solo texto. Media-placeholder → text con body=note (D-03); tipos de sistema → saltar (D-04).

## Merge con tráfico vivo

| Opción | Selected |
|--------|----------|
| No regresar nunca el estado vivo (archival silencioso) | ✓ |
| Solo importar a conversaciones nuevas | |
| Mergear y refrescar inbox | |

**User clarification:** *"la idea es que esté ahí el chat pero se pone vivo si el cliente escribe."*
Se explicó que la Opción A hace exactamente eso: el historial aparece en el hilo; el estado "vivo" (no-leídos, posición en inbox) lo maneja solo el tráfico real; el importador nunca finge actividad nueva. **Confirmado: "Sí, archival silencioso".** → D-05.

## Entrega

| Opción | Selected |
|--------|----------|
| CLI tsx en `scripts/import-whatsapp-history.ts` | ✓ |
| CLI dentro de robot-whatsapp-reader/ | |
| Server action + UI admin | |

**Choice:** CLI tsx en scripts/, dry-run default. → D-06.

## Claude's Discretion

- Nombre/archivo de la función domain nueva, mecánica on-conflict, formato del reporte, batching por chat, validación de muestra.

## Deferred Ideas

- Import de media real (V1.1), server action + UI admin, bandeja "sin número", columna source/imported_at.
