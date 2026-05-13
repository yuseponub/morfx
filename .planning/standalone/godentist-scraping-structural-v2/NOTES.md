# Standalone godentist-scraping-structural-v2 — Notas Iniciales

**Created:** 2026-05-13
**Status:** Awaiting discuss-phase

## Por qué este standalone

Bug del 11-may (memory `godentist-jumbo-floridablanca-dup-scraping`) recurrió hoy 2026-05-13 con patrón MÁS severo. El standalone shipped el 12-may (`godentist-scraper-table-refresh-guard`) atacó UNA capa (table-refresh guard) y difirió explícitamente otras 2 (clickNextPage disabled-check, server-action dedupe). El bug volvió porque la premisa "si la tabla refresca bien, getTotalPages lee correcto" no se sostuvo.

Evidencia completa en `.planning/debug/godentist-cross-sede-recurrence.md`.

## Síntomas en producción HOY

3 clientes afectados con scrape `13e6354a-a8d7-43d5-a989-1028cab4ec42` (workspace `36a74890-aad6-4804-838c-57904b1c9328`):
- JOSE ISMAEL DELGADO 573162252507 — recibió 5 reminders (4 FLO + 1 JUMBO) cuando debía ser 1 sede sola
- JOHANNA ESTUPIÑAN 573165799771 — recibió 2 reminders en MEJORAS cuando su cita histórica es JUMBO
- YARINETH CASTRO 573204574076 — recibió 1 reminder en MEJORAS cuando debía ser JUMBO

## Raíz estructural a atacar

El robot etiqueta cada fila con `sucursal: sucursal.label` basándose en **qué iteración del loop** está corriendo, NO en lo que el portal Dentos dice del filtro aplicado. Cualquier desincronización entre `selectSucursal → clickBuscar → tabla actualizada → paginación` causa cross-contamination.

`extractAppointments(sucursal)` no lee la sede del DOM — la asume del argumento. Es la falla estructural.

## Scope candidato

### Robot Railway (`godentist/robot-godentist/src/adapters/godentist-adapter.ts`)
1. **Combo readback post-selectSucursal**: verificar que el input del combo muestra el label esperado antes de extraer
2. **`clickNextPage` con check `x-item-disabled`**: diferido en standalone del 12-may, ahora obligatorio
3. **`getTotalPages` con validación contra "Displaying A - B of C"**: dos fuentes de verdad antes de decidir cuántas páginas hay
4. **Leer sede del DOM por fila si Dentos lo expone (RESEARCH)**: si la tabla tiene columna sede, leer directo y NO confiar en el filtro

### Server-action (`src/app/actions/godentist.ts`)
5. **Detector cross-sede en scrapeAppointments**: si `(phone, fecha)` aparece en >1 sede del mismo scrape, marcar el scrape como `inconsistent` + bloquear envío automático
6. **Dedupe en `sendConfirmations` y `scheduleReminders`**: por `(phone, hora, sede)` antes de procesar

### UI dashboard
7. **Tab "Programación Recordatorios"**: query `godentist_scheduled_reminders` JOIN `godentist_scrape_history` ON `scrape_history_id`; mismo pattern visual del tab "Historial Confirmaciones"
8. **Badge alerta `inconsistent`**: si el detector cross-sede marcó el scrape, mostrar warning en ambos tabs

### Smoke E2E (mejorar validator)
9. **Validator que detecte cross-sede globalmente**: además de `ratio=1.0 per sede` + `overlap=0 between sedes`, agregar `(phone, hora) en >1 sede` como FAIL hard
10. **Acumular múltiples corridas para detectar bug intermitente**: el bug es timing-dependent (1-de-6 en el 11-may; al menos 2-de-N en el 13-may); 3 corridas no son suficientes

## Decisiones críticas para `/gsd:discuss-phase`

1. **Paradigma de scraping** — opciones:
   - A) Mantener loop `for sucursal` + capas defensivas (combo readback + paginación + dedupe + detector cross-sede)
   - B) Scrape sin filtro de sede + leer sede del DOM por fila (si Dentos lo permite)
   - C) Hybrid: probar B; si no funciona, fallback a A reforzada

2. **Detector cross-sede** — opciones:
   - Hard abort del scrape (HTTP 5xx, no se persiste)
   - Soft flag `inconsistent=true` + bloquear envío automático + manual review
   - Soft flag + retry automático del scrape

3. **Dedupe scope** — opciones:
   - Solo `(phone, hora, sede)` (mismo scrape, mismo "slot")
   - `(phone, fecha)` (paciente única por día) — más agresivo, podría descartar citas legítimas múltiples
   - `(phone, hora, sede)` + alerta si `(phone, fecha)` en >1 sede

4. **UI tab "Programación Recordatorios"** — opciones:
   - Nuevo componente desde cero
   - Refactor del tab Confirmaciones para que ambos compartan base

5. **Smoke E2E** — opciones:
   - Mantener 3 corridas pero validator más estricto
   - Aumentar a N corridas (10+) para mayor confianza estadística
   - Smoke programado nightly con alertas si falla

6. **Modo de despliegue** — opciones:
   - Feature flag para activar paradigma nuevo (Regla 6 — proteger agente en producción)
   - Sin flag (es una corrección de bug, no un agente nuevo)

7. **Cleanup retrospectivo** — opciones:
   - Marcar reminders ya enviados de hoy como `inconsistent` para auditoría
   - No tocar (es histórico, ya se enviaron)

## Referencias

- Debug: `.planning/debug/godentist-cross-sede-recurrence.md`
- Standalone anterior (parcial): `.planning/standalone/godentist-scraper-table-refresh-guard/`
- Memory original: `godentist-jumbo-floridablanca-dup-scraping`
- Adapter: `godentist/robot-godentist/src/adapters/godentist-adapter.ts:1576..1836`
- Server-actions: `src/app/actions/godentist.ts`
- Railway: project `2bfb887a-6f5a-4866-8190-070601343233`, service `Godentist`
