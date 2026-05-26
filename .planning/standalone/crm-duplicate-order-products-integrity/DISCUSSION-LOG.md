# Standalone: CRM Duplicate Order Products Integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Standalone:** crm-duplicate-order-products-integrity
**Areas discussed:** Rollback strategy, Retry strategy, Backfill retroactivo, Caso Doralba, UI limpieza flag, UI info badge

---

## Rollback strategy

**Question:** Cuando el INSERT de productos falla, ¿qué hacemos con la order destino que ya se creó?

| Option | Description | Selected |
|--------|-------------|----------|
| Rollback total (Recomendado) | Borrar la order del Logística para que quede como si nada hubiera pasado. La automation reporta error y el operador ve la falla. | |
| Mantener vacía + marcar error en UI | Dejar la order huérfana en el Kanban con un badge rojo 'sin productos — error de duplicación', operador completa manualmente. | ✓ |
| Mantener vacía + notificar Slack | Dejar huérfana pero disparar Inngest event para alertar al operador. Sin badge en UI. | |

**User's choice:** Mantener vacía + marcar error en UI
**Notes:** Conservar la order huérfana mantiene la trazabilidad y el link al source order via `source_order_id`. El badge en UI da visibilidad inmediata sin requerir infraestructura adicional (Slack/email).

---

## Retry strategy

**Question:** ¿Reintentamos el INSERT antes de fallar?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 retry para errores transient (Recomendado) | Si el error code es transient (08000 connection, 40001 serialization, 53300 too many connections, 57014 timeout), reintentar 1 vez con backoff 200ms. Si es lógico (FK/CHECK/NOT NULL), fail directo. | |
| Sin retry — fail fast | Cualquier error mata la operación. Más simple y predecible. | ✓ |
| 3 retries con backoff exponencial | Más resiliente a hipo de red, pero alarga la latencia del peor caso (~1.5s). | |

**User's choice:** Sin retry — fail fast
**Notes:** Simplicidad sobre resiliencia. Si el error es transient, el operador puede reintentar manualmente desde la UI. Discriminar entre transient/lógico añade complejidad sin beneficio claro.

---

## Backfill retroactivo

**Question:** Los 41 casos histórico que quedaron vacíos en abril-mayo, ¿qué hacemos?

| Option | Description | Selected |
|--------|-------------|----------|
| Script auto-copy si dst no fue editado (Recomendado) | Script idempotente: para cada uno de los 41 casos, si `dst.updated_at == dst.created_at` (nadie lo tocó), copiar productos del source. Si fue editado: skip + listar para revisión manual. | |
| Solo reportar — operador decide | Generar CSV con los 41 casos y entregarlo al equipo Somnio. Sin mutar nada automático. | |
| Skip backfill — solo fix forward | No tocar las 41 históricas. Asumir que ya están resueltas operativamente. | ✓ |

**User's choice:** Skip backfill — solo fix forward
**Notes:** Las 41 orders ya completaron su ciclo operacional. Auto-fix podría sobrescribir decisiones legítimas del operador. Solo fix forward para futuras duplicaciones.

---

## Caso Doralba

**Question:** El caso específico de Doralba ($169.900 erróneo, guía Coordinadora ya generada), ¿lo incluimos en este standalone?

| Option | Description | Selected |
|--------|-------------|----------|
| Sí — plan dedicado de corrección manual + cliente | Incluir un Plan que documente la decisión final con Doralba + actualizar la order en DB. | |
| No — se resuelve operacionalmente fuera del standalone | El equipo Somnio lo arregla con Doralba directamente (llamada/Whatsapp), sin tocar este standalone. | ✓ (free text: "ese lo arreglamos manualmente") |

**User's choice:** No — operacional fuera del standalone
**Notes:** Decisión comercial con la cliente — no técnica.

---

## UI: limpieza del flag

**Question:** ¿Cómo desaparece el badge de error una vez que el operador completa la order?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto: al agregar el 1er producto manualmente (Recomendado) | Trigger DB: cuando se inserta un row en order_products de una order con duplicate_error, limpia el flag automáticamente. | |
| Manual: botón 'Marcar resuelto' en la card | Operador agrega productos y luego clickea botón para limpiar el badge. Da control explícito pero añade fricción. | ✓ |
| Nunca se limpia (sólo informativo) | El badge queda como historial permanente — 'esta order tuvo error de duplicación'. | |

**User's choice:** Manual — botón "Marcar resuelto"
**Notes:** Auto-clear sería peligroso — un operador podría agregar productos erróneos sin verificar. Botón explícito fuerza verificación visual antes de limpiar.

---

## UI: información en el badge

**Question:** ¿Qué información mostramos al hacer hover/click sobre el badge de error?

| Option | Description | Selected |
|--------|-------------|----------|
| Productos que fallaron copiar + botón 'Copiar ahora' (Recomendado) | Lista lo que el source tenía + botón para re-intentar el copy en 1 click. | |
| Solo timestamp + error code | Mínimo: '2026-05-25 09:27 — FK violation'. Operador busca info por su cuenta. | |
| Productos + link al source order (sin botón) | Muestra la info pero el operador copia manualmente o navega al source con el link. | ✓ |

**User's choice:** Productos + link al source order (sin botón)
**Notes:** Botón "Copiar ahora" sería attractive nuisance — si el source tenía datos inválidos (causa del fallo inicial), el botón seguiría fallando. Link + lista visible obliga al operador a entender contexto.

---

## Claude's Discretion

- Estructura interna del fix en `duplicateOrder` (try/catch, flujo de control, naming).
- Diseño visual exacto del badge (color, icono, tamaño) — seguir tokens del editorial inbox v2.
- Estructura del popover (Radix Tooltip vs HoverCard vs Popover — el que ya use la card).
- Nombre exacto de la server action (`clearOrderDuplicateError` vs alternativa).
- Si el reporte CSV de los 41 casos históricos se commitea al repo o se entrega out-of-band.

## Deferred Ideas

- **Bug colateral de timezone en `order_stage_history.changed_at`** — Causa raíz: `DEFAULT timezone('America/Bogota', NOW())` en columna `timestamptz`. Standalone aparte recomendado: `crm-timezone-stage-history-fix`.
- **Auditoría sistémica de `await ... insert(...)` sin error check** — Otros callers similares en el domain layer pueden tener el mismo bug. Standalone aparte: `domain-error-handling-audit`.
- **Alerta operacional en tiempo real (Slack/email)** — Considerado pero usuario decidió que con UI badge + automation_executions.error_message es suficiente.
- **Backfill retroactivo de los 41 casos vacíos** — Considerado pero usuario decidió skip.
- **Caso Doralba — corrección en código** — Out of scope, resuelto operacionalmente.
