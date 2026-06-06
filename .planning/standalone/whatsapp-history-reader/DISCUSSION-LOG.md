# WhatsApp History Reader — Discussion Log

> **Audit trail only.** No es input para research/plan/execute — las decisiones viven en `CONTEXT.md`.
> Este log preserva las alternativas consideradas.

**Date:** 2026-06-06
**Standalone:** whatsapp-history-reader
**Áreas discutidas:** Alcance de chats, Captura del número real, Estructura de salida, (Robustez/multi-cliente = delegada a Claude)

---

## Selección de áreas

Usuario eligió discutir: Alcance de chats, Captura del número real, Estructura de salida.
Área 4 (Robustez y multi-cliente): **delegada a Claude** con requisito literal — *"el 4 lo eliges tú de forma que no se rompa y si se rompe tenga protocolo de continuo (no repitiendo mismos chats)"*.

---

## Área 1 — Alcance de chats

| Pregunta | Opción elegida |
|----------|----------------|
| ¿Qué tipos de chat? | **Solo individuales** (excluir grupos/comunidades/difusión) ✓ |
| ¿Incluir archivados? | **Sí, incluir archivados** ✓ |
| ¿Profundidad temporal? | **Historial completo** (scroll hasta el primer mensaje) ✓ |

---

## Área 2 — Captura del número real

| Pregunta | Opción elegida |
|----------|----------------|
| ¿Cómo capturar el número? | **Best-effort: DOM/JID primero, abrir perfil si falta** ✓ |
| Si no hay número, ¿qué hacemos? | Guardar con `number=null` + flag — **PERO** el usuario advirtió: *"si pasa con muchos es un bug gigante no aceptable"* → convertido en **gate de calidad D-06** (fail/alert si null-rate alto) |

**Nota:** El número es la identidad para amarrar conversaciones a contactos en la etapa 2 (migrador). Por eso la confiabilidad del número es crítica, no opcional.

---

## Área 3 — Estructura de salida

| Pregunta | Opción elegida |
|----------|----------------|
| ¿Organización de archivos? | **Un JSON por chat + manifest índice** ✓ — con requisito: *"que diferencie el receptor del otro, de forma que el robot de migración para MorfX lo identifique fácilmente"* → D-08 |
| ¿Qué guardar por mensaje? | **Remitente + fecha/hora + texto + tipo** ✓ |
| Mensajes no-texto: ¿dejar rastro? | **Sí, placeholder en su posición** (sin descargar archivos) ✓ |

---

## Claude's Discretion (Área 4 + finos)

- Robustez/reanudación: checkpoint por chat en manifest, escritura atómica, nunca re-scrapear `done`, tandas configurables, fail-safe sin envíos (D-11..D-15).
- Ubicación del código (`robot-whatsapp-reader/` independiente), umbral exacto del gate D-06, defaults de delays/caps, esquema JSON fino, mecánica de extracción del JID — a definir en research/plan.

## Deferred Ideas

- Etapa 2: robot migrador/importador a MorfX (visualización archival en inbox, `source='import'`).
- Captura de media/docs (omitida V1).
- Grupos/comunidades/difusión (excluidos V1).
