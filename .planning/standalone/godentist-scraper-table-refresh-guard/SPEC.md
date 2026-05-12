# Standalone: GoDentist Scraper Table-Refresh Guard — Specification

**Created:** 2026-05-12
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 4 locked

## Goal

El robot GoDentist (`godentist/robot-godentist/src/adapters/godentist-adapter.ts`) deja de extraer filas de la sucursal anterior cuando cambia el filtro a una nueva sucursal — cada batch de appointments por sede en el JSON de respuesta corresponde exclusivamente a esa sede, sin contaminación cruzada entre sedes ni duplicación interna.

## Background

**Incidente productivo 2026-05-11 (workspace godentist `36a74890-aad6-4804-838c-57904b1c9328`):** un scrape multi-sucursal (id `7827ee57-722e-4db5-b832-90d17d1b37d3`, 13:04 UTC, 154 appointments) trajo 12 pacientes triplicados (1 entry con label `FLORIDABLANCA` + 2 entries con label `JUMBO EL BOSQUE`, mismo phone+hora+estado). El JSON alimentó `scheduleReminders` (server-action), que insertó 3 reminders por paciente con sucursal del JSON. El Inngest `godentistReminderSend` envió 3 templates `confirmacion_asist_godentist` por paciente (uno con dirección FLO + dos con dirección JUMBO) y asignó 2 tags (FLO+JUM). 5 pacientes específicos reportados: Juan Carlos Moreno, Johan Alcides Jaime, Diego Ian Riveros, Valery Sofia Garcia, Ivan Enrique Leon.

**Causa raíz confirmada con evidencia dura** (logs Railway del deployment `51521b7c-a026-45f3-aa1e-90d3361aeb5e` + verificación visual del operador en portal Dentos):

1. Los 12 pacientes existen únicamente en FLORIDABLANCA en el portal (verificado visualmente por el operador, 12/12).
2. Cross-reference numérica: 12 entradas únicas `JUMBO EL BOSQUE` × 0 con phone+hora propio (todas coinciden 1:1 con FLO).
3. Logs Railway muestran: tras `Sucursal selected: JUMBO EL BOSQUE`, la tabla DOM no se refrescó (row count = 54 idéntico antes y "después" del cambio de filtro). `getTotalPages()` leyó "2" (residual del estado FLORIDABLANCA que sí tenía 2 pages). `extractAppointments` extrajo las 12 filas de FLO page 2 con label "JUMBO". `clickNextPage()` no avanzó (botón disabled internamente en ExtJS) y `extractAppointments` re-leyó las mismas 12 filas → 24 entradas duplicadas con label JUMBO.

**Bug es timing-dependent / intermitente:** 6 scrapes adyacentes con el MISMO código (8-may, 9-may×2 single-JUMBO, 11-may×1 single-JUMBO, 12-may multi-sucursal triggerado para verificación) salieron limpios. Solo el de 13:04 UTC del 11-may falló — el portal Dentos no alcanzó a recargar la tabla en la ventana de espera del adapter al cambiar de FLO a JUMBO.

**Hoy no hay reminders pendientes** para fecha 12-may o posteriores con duplicación. Los 132 del 11-may ya fueron enviados o cancelados. No hay cleanup retrospectivo en scope.

**Sin tests existentes** para el robot adapter (`godentist/robot-godentist/` no tiene archivos `*.test.ts` ni `*.spec.ts`).

## Requirements

1. **Table-refresh guard antes de extracción**: el adapter detecta que la tabla del portal Dentos cambió tras `selectSucursal` antes de invocar `extractAppointments`.
   - Current: `extractAllPages(sucursal.label)` en línea 1509 invoca directamente `extractAppointments` sin verificar que la tabla refleje la nueva sede. `selectSucursal` (línea 1448) hace click en el combo y un `waitForTimeout(500)` ciego; `clickBuscar` (línea 1470) tiene fallback de Enter sin verificar el resultado.
   - Target: en el loop `for (const sucursal of sucursales)` de `scrapeAppointments` (línea 217), entre `selectSucursal` + `clickBuscar` y `extractAllPages`, el adapter captura un fingerprint de la tabla pre-cambio y hace polling hasta que el fingerprint cambie, con timeout.
   - Acceptance: en un smoke E2E multi-sucursal contra portal Dentos real, los logs del robot incluyen una línea explícita de "tabla refrescada confirmada para sede X" o equivalente para cada sede iterada; el JSON resultante tiene 0 entradas `phone+hora` que se repitan entre dos labels distintos de sucursal.

2. **Reintento ante fallo de refresh**: si el guard no detecta refresh dentro del timeout, el adapter reintenta `selectSucursal + clickBuscar` hasta 2 veces (3 intentos totales por sede).
   - Current: el adapter no tiene mecanismo de reintento por sede. Si la tabla no se refresca, simplemente extrae lo que esté en pantalla.
   - Target: tras `selectSucursal + clickBuscar`, si el fingerprint no cambia en el timeout, ejecutar `selectSucursal + clickBuscar` de nuevo (hasta 2 reintentos = 3 intentos totales). Cada intento puede esperar el timeout completo antes de declarar fallo.
   - Acceptance: en simulación o evidencia de logs, una secuencia "selectSucursal → wait → no refresh → selectSucursal retry → wait → refresh → extract" se ejecuta correctamente; el contador de intentos no excede 3.

3. **Abort total del scrape si una sede falla los 3 intentos**: si tras los 3 intentos el guard sigue sin detectar refresh, el adapter aborta el scrape completo y retorna error al server-action.
   - Current: el adapter retorna `{ date, appointments, errors }` donde appointments puede tener contenido contaminado si la tabla nunca se refrescó.
   - Target: si cualquier sede agota sus 3 intentos sin refresh, `scrapeAppointments` (línea 166 del adapter) lanza error o retorna respuesta de error que el endpoint Express `POST /api/scrape-appointments` traduce a HTTP 5xx con mensaje descriptivo. El server-action `scrapeAppointments` (línea 108 de `src/app/actions/godentist.ts`) propaga el error y NO inserta nada en `godentist_scrape_history`, NO triggea `scheduleReminders`.
   - Acceptance: simulando refresh fallido en una sede (vía test o ambiente controlado), el endpoint del robot retorna HTTP 5xx con body JSON tipo `{ status: 'error', message: '...' }`; el server-action retorna `{ error: '...' }` al cliente; la tabla `godentist_scrape_history` no tiene fila nueva para ese intento.

4. **Smoke E2E sin contaminación**: un scrape multi-sucursal (4 sedes, fecha futura con citas en al menos 2 sedes distintas) produce un JSON donde cada sede tiene `phone+hora` únicos dentro de la sede y disjuntos entre sedes.
   - Current: el scrape problemático del 11-may tiene `JUMBO unique=12, ratio=2.00, overlap with FLO=12`. El scrape de prueba del 12-may (sin fix) tiene todos los ratios=1.00 y overlap=0 — pero esto fue afortunado, no garantizado.
   - Target: tras el fix, ejecutar 3 scrapes multi-sucursal consecutivos contra el portal real (sin reiniciar el robot entre ellos) y verificar que los 3 producen JSON limpio.
   - Acceptance: para cada uno de los 3 scrapes consecutivos, `cuenta_total_por_sede / cuenta_unicos_por_sede = 1.00` y `intersección_phone+hora entre cualquier par de sedes = 0`.

## Boundaries

**In scope:**
- Cambios al archivo `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (table-refresh guard, reintentos, abort en fallo).
- Cambios menores al endpoint Express `POST /api/scrape-appointments` en `godentist/robot-godentist/src/api/server.ts` para propagar el error de scrape como HTTP 5xx si aplica.
- Logs del robot suficientes para diagnosticar futuros incidentes similares (qué sede falló, en qué intento).
- Smoke E2E manual contra portal Dentos real (3 scrapes consecutivos multi-sucursal).
- Deploy del nuevo robot a Railway (servicio `Godentist`, project `2bfb887a-6f5a-4866-8190-070601343233`).

**Out of scope:**
- Cambios a `src/app/actions/godentist.ts` (server-action) — el operador descartó la capa de defensa server-action (dedupe por phone+hora+fecha). La causa raíz es del robot; si el robot deja de contaminar, no hay nada que deduplicar.
- Cambios a `src/inngest/functions/godentist-reminders.ts` (Inngest reminder send) — el flujo Inngest funcionó correctamente dado el input del scrape; no requiere fix.
- Cleanup retrospectivo de reminders ya programados con duplicación — verificado en este standalone: 0 reminders `pending` para fechas futuras (12-may en adelante). Los 132 del 11-may ya fueron `sent` o `cancelled`; no hay vuelta atrás para los enviados.
- Tests unitarios del adapter con mocks de Playwright — el operador eligió smoke E2E real como único método de validación.
- Tests unitarios del server-action o del Inngest reminder — no se tocan esos archivos en este standalone.
- Cambios al portal Dentos — fuera de control del proyecto.
- Fix al bug separado de `clickNextPage` no chequear `x-item-disabled` — aunque está identificado, no es parte de este standalone porque el guard de table-refresh ya elimina la condición que lo gatilla (si la tabla refresca correctamente, `getTotalPages` lee el valor correcto). Puede ser un follow-up standalone si vuelve a manifestarse.

## Constraints

- El robot debe seguir respondiendo dentro del timeout actual del server-action `scrapeAppointments` (línea 118: `fetch(...)` sin `max-time`, pero el cliente Vercel impone ~5 min). Worst case con 2 reintentos × 4 sedes × ~10s = 80s extra de overhead — bien dentro del límite.
- El fix NO debe romper el comportamiento de scrapes single-sucursal que ya funcionan correctamente (5/5 scrapes single-JUMBO recientes salieron limpios sin fix).
- El fix NO debe afectar `confirmAppointment` (línea 240 del adapter) ni `checkAvailability` (línea 333) — esos flujos no iteran sucursales y no exhiben el bug.
- Compatibilidad: Node.js + Playwright versión actual del Dockerfile (Railway service `Godentist`).
- El smoke E2E requiere credenciales del portal (`JROMERO/123456`) y solo se valida con fechas futuras donde hay citas reales en al menos 2 sedes distintas (riesgo: fechas con pocas citas pueden tener todas concentradas en una sede y no validar el caso cross-sede).

## Acceptance Criteria

- [ ] El JSON retornado por el endpoint `POST /api/scrape-appointments` multi-sucursal NO contiene entradas con `(telefono, hora)` repetidas entre labels distintos de sucursal.
- [ ] El JSON retornado por el endpoint `POST /api/scrape-appointments` multi-sucursal NO contiene entradas con `(telefono, hora)` repetidas dentro de la misma sucursal (ratio `total_por_sede / unicos_por_sede = 1.0` para cada sede).
- [ ] Los logs del robot tras un scrape exitoso incluyen una línea por sede que indica que la tabla fue confirmada como refrescada antes de extraer (texto exacto del log queda a discreción de plan-phase, pero debe ser grep-able).
- [ ] Si una sede no logra refrescar la tabla tras 3 intentos, el endpoint retorna HTTP 5xx (no 200 con datos parciales).
- [ ] En modo abort por fallo de sede, `godentist_scrape_history` NO recibe fila nueva (la inserción en `src/app/actions/godentist.ts:148` no ejecuta) y `scheduleReminders` NO se invoca.
- [ ] Smoke E2E real post-deploy: 3 scrapes consecutivos multi-sucursal (`["CABECERA","FLORIDABLANCA","JUMBO EL BOSQUE","MEJORAS PUBLICAS"]`) contra portal Dentos real para una fecha futura con citas en ≥2 sedes, todos 3 con ratio=1.0 por sede + overlap=0 entre todos los pares de sedes.
- [ ] El scrape single-sucursal sigue funcionando (regression check): un scrape con `sucursales=["JUMBO EL BOSQUE"]` retorna ratio=1.0 sin contaminación (no aplica overlap inter-sede por definición).
- [ ] El deploy a Railway tiene status SUCCESS y `/api/health` retorna `{status: 'ok'}` post-deploy.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                |
|--------------------|-------|------|--------|------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Bug raíz confirmado, fix conceptualmente claro       |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Solo robot. Sin server-action ni backfill. Listas explícitas |
| Constraint Clarity | 0.80  | 0.65 | ✓      | 2 reintentos, abort total en fallo, timeout cliente OK |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 7 criterios pass/fail con metrics numéricos          |
| **Ambiguity**      | 0.16  | ≤0.20| ✓      | Gate passed                                          |

## Interview Log

| Round | Perspective       | Question summary                                            | Decision locked                                          |
|-------|-------------------|-------------------------------------------------------------|----------------------------------------------------------|
| —     | Pre-spec context  | Investigation forense del bug del 11-may                    | Causa raíz: tabla DOM no refrescada al cambiar sede     |
| 1     | Boundary Keeper   | ¿Capa robot, server-action, o ambas?                        | Solo capa robot (causa raíz, no defensa)                 |
| 1     | Failure Analyst   | ¿Qué hacer si table-refresh falla tras timeout?             | Reintentar selectSucursal hasta N veces                  |
| 1     | Boundary Keeper   | ¿Dedupe key en server-action?                               | N/A — pertenece a 2da capa descartada                    |
| 1     | Boundary Keeper   | ¿Qué incluye 'done' en testing?                             | Smoke E2E real con robot Railway (sin unit tests)        |
| 2     | Failure Analyst   | Si todos los reintentos fallan, ¿qué?                       | Abortar scrape completo (HTTP 5xx, no parcial)           |
| 2     | Seed Closer       | ¿Cuántos reintentos máximos?                                | 2 reintentos (3 intentos totales) — worst case ~15s/sede |
| 2     | Boundary Keeper   | ¿Backfill de reminders existentes duplicados?               | No — 0 pendientes para futuro, solo prevenir forward     |

---

*Standalone: godentist-scraper-table-refresh-guard*
*Spec created: 2026-05-12*
*Next step: /gsd-discuss-phase godentist-scraper-table-refresh-guard — implementation decisions (cómo capturar fingerprint, qué exactamente se polling, timeout específico, formato de log, etc.)*
