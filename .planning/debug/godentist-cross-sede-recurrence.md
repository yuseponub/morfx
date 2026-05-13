# Godentist Cross-Sede Recurrence — 2026-05-13

**Status:** Active. Bug del 11-may recurrió pese al fix shipped el 12-may.

## Síntoma reportado por usuario

3 clientes recibieron recordatorios con sede(s) incorrecta(s) hoy 2026-05-13:
- Yarineth Castro Arias — `+573204574076`
- Jose Ismael Delgado — `+573162252507`
- Johanna Estupiñan Castillo — `+573165799771`

Usuario verificó en portal Dentos: cada cita aparece SOLO en su sede correcta. El error es del scraping/envío, no del portal.

## Workspace y scrape responsable

- Workspace godentist principal: `36a74890-aad6-4804-838c-57904b1c9328`
- Scrape responsable: `godentist_scrape_history.id = 13e6354a-a8d7-43d5-a989-1028cab4ec42`
- Creado: `2026-05-13 14:03:08.169848+00`
- Para fecha: `2026-05-13`
- Reminders disparados ~14:03:23+10s = 14:03:31 a 14:03:49 UTC (todos `status=sent`)

## Evidencia — qué produjo el scrape para los 3 phones

```
JOSE ISMAEL DELGADO 573162252507 | 10:00 AM | FLORIDABLANCA       (×4)
JOSE ISMAEL DELGADO 573162252507 | 10:00 AM | JUMBO EL BOSQUE     (×1)
JOHANNA ESTUPIÑAN   573165799771 | 10:00 AM | MEJORAS PUBLICAS    (Confirmada)
YARINETH CASTRO     573204574076 | 10:30 AM | MEJORAS PUBLICAS    (Confirmada)
JOHANNA ESTUPIÑAN   573165799771 | 11:00 AM | MEJORAS PUBLICAS    (Confirmada)
```

JOSE DELGADO recibió 5 recordatorios (4 FLO + 1 JUMBO).
JOHANNA recibió 2 recordatorios (MEJORAS).
YARINETH recibió 1 recordatorio (MEJORAS).

## Evidencia comparativa — scrape histórico del día anterior

Scrape `8f70df1a-507d-4cb3-9844-c00780895fc0` (12-may 15:01 UTC, mismo target date 2026-05-13):

```
JOHANNA ESTUPIÑAN | 10:00 AM | JUMBO EL BOSQUE
YARINETH CASTRO   | 10:30 AM | JUMBO EL BOSQUE
JOHANNA ESTUPIÑAN | 11:00 AM | JUMBO EL BOSQUE
```

**Las MISMAS 3 citas migraron de JUMBO EL BOSQUE → MEJORAS PUBLICAS** entre scrapes consecutivos del mismo target date. El portal Dentos no cambió las citas (verificado por usuario); el robot las clasificó mal en el segundo scrape.

Histórico adicional: JOHANNA siempre ha sido scrapeada en JUMBO EL BOSQUE en scrapes anteriores (`5987106b-...` 2026-04-27, `051a3129-...` 2026-04-23, `f961e8f7-...` 2026-05-11, `04d0dc49-...` 2026-05-12 13:29, `3f9950ca-...` 2026-05-12 20:46).

## Análisis estructural

**Bug en cascada — 2 fallas simultáneas:**

**1. Paginación rota (clickNextPage ciego):**
- JOSE DELGADO 10:00 AM aparece 4× idénticas en FLORIDABLANCA. Patrón clásico del bug del 11-may: `clickNextPage()` (godentist-adapter.ts:1818) no verifica `x-item-disabled` antes de clickear. Cuando `getTotalPages()` retorna número inflado, el robot clicka el botón disabled, la tabla no avanza, y `extractAppointments` re-lee la misma fila tantas veces como páginas falsas haya.

**2. Cross-contamination entre sedes (cambio-de-sede rota):**
- 3 citas que pertenecen a JUMBO EL BOSQUE (iter 3 del loop) aparecen etiquetadas como MEJORAS PUBLICAS (iter 4). El portal Dentos no aplica el nuevo filtro a tiempo, el robot lee la tabla anterior, y `extractAppointments(sucursal.label)` etiqueta cada fila con la sede de la iteración actual del loop — NO con la sede del filtro realmente aplicado.

**Por qué el fix del 12-may no protegió:**

`waitForSucursalRefresh` (godentist-adapter.ts:1640) verifica que el primer row `(phone, hora, rowCount)` cambió entre sedes. Premisa frágil:
- Solo monitorea la tabla de citas, NO el combo de sede ni el toolbar de paginación
- Si por casualidad el primer row de la sede nueva es distinto al de la anterior, da false-positive de "refresh OK" aunque el resto de filas pertenecen al filtro anterior
- No detecta el caso donde el portal aplicó el filtro parcialmente (e.g., agregó/quitó algunas filas pero no todas)

## Raíz estructural

El robot etiqueta cada fila con `sucursal: label` basándose en **qué iteración del loop** está corriendo, NO en lo que el portal Dentos dice del filtro aplicado. Cualquier desincronización entre `selectSucursal → clickBuscar → tabla actualizada` causa cross-contamination con esta arquitectura.

## Por qué impactó al cliente más que el bug anterior

El bug del 11-may (memory `godentist-jumbo-floridablanca-dup-scraping`) causó 5 pacientes afectados. Este causó al menos 3 pacientes con patrón más severo:
- 1 paciente con 5 reminders (JOSE DELGADO)
- 2 pacientes con sede totalmente equivocada (JOHANNA + YARINETH en MEJORAS cuando es JUMBO)

Además: no hay capa defensiva en `scheduleReminders` ni `sendConfirmations` (descartada explícitamente en CONTEXT.md D-09 del standalone del 12-may como "out of scope").

## Fix planeado

Standalone nuevo `.planning/standalone/godentist-scraping-structural-v2/`:

1. **Combo readback post-selectSucursal** — verificar que el input del combo muestra el label esperado antes de extraer
2. **`clickNextPage` con check `x-item-disabled`** — diferido en standalone del 12-may, ahora obligatorio
3. **Posiblemente: leer sede del DOM por fila** — si el portal Dentos expone la columna sede en la tabla (research pendiente)
4. **Detector cross-sede en server-action** — si `(phone, fecha)` aparece en >1 sede del mismo scrape, marcar `inconsistent` + bloquear envío automático
5. **Dedupe defensivo** — por `(phone, hora, sede)` antes de programar reminders
6. **Smoke E2E mejorado** — validator que detecte cross-sede globalmente, no solo per-sede
7. **UI tab "Programación Recordatorios"** — agrupar por `scrape_history_id` igual que tab Confirmaciones

## Referencias

- Memory `.claude` (auto-memory): `godentist-jumbo-floridablanca-dup-scraping.md` (root cause original 11-may)
- Standalone shipped 12-may (parcial): `.planning/standalone/godentist-scraper-table-refresh-guard/`
- Smoke E2E de ese standalone (validator falla al re-correrlo HOY): `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/`
- Adapter relevante: `godentist/robot-godentist/src/adapters/godentist-adapter.ts`
- Server-actions afectadas: `src/app/actions/godentist.ts` (`sendConfirmations` línea 170, `scheduleReminders` línea 641)
- Railway: project `2bfb887a-6f5a-4866-8190-070601343233`, service `Godentist`, env `production`
