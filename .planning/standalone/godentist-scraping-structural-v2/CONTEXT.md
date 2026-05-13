# godentist-scraping-structural-v2 — Context

**Gathered:** 2026-05-13
**Status:** Ready for research-phase
**Trigger:** Recurrencia productiva del bug del 11-may pese al fix shipped el 12-may (standalone `godentist-scraper-table-refresh-guard`). Tres clientes afectados con patrón más severo (1 paciente con 5 reminders cross-sede; 2 pacientes con sede totalmente equivocada). Adicional: scrape de confirmaciones de hoy 10:02 AM mostró el mismo patrón (EDDY JANNETH cita real en CABECERA, scrape la puso en MEJORAS PUBLICAS; ALVARO/OSCAR/EDDY duplicados 3× cada uno). Evidencia completa en `.planning/debug/godentist-cross-sede-recurrence.md`.

<domain>
## Phase Boundary

Rediseñar **desde 0** el proceso de scraping del robot godentist (`godentist/robot-godentist/src/adapters/godentist-adapter.ts`) de modo que cada cita scrapeada quede etiquetada con la sede que el portal Dentos realmente le atribuye — no con la sede del loop que el robot está iterando. Los dos focos del rediseño son **paginación** y **cambio de sede**, cada uno validado empíricamente con pruebas en vivo contra el portal Dentos real durante research-phase (no asunciones).

El cambio cubre ambos flujos consumidores (`sendConfirmations` envío inmediato + `scheduleReminders` reminders programados via Inngest) ya que comparten el output del scrape. Adicional: rediseñar el tab "Programación de Recordatorios" en la UI dashboard para que muestre el historial de scrapes que dispararon reminders programados (no solo los reminders sueltos), permitiendo al operador hacer post-mortem cuando falle.

**In scope:**
- Reescritura del adapter Playwright (`godentist-adapter.ts`) con nuevo mecanismo de cambio-de-sede + paginación validados en vivo
- Defensa redundante en `clickNextPage` (check `x-item-disabled`) aún cuando el paradigma nuevo lo haga innecesario en teoría
- Capa defensiva en server-action (`src/app/actions/godentist.ts`): dedupe (phone, hora, sede) + detector canary cross-sede (phone, fecha, >1 sede en mismo scrape)
- UI tab "Programación de Recordatorios" agrupado por `scrape_history_id` con metadata del scrape visible
- Feature flag `USE_NEW_GODENTIST_SCRAPING` default ON con rollback rápido vía env var o platform_config
- Smoke E2E mejorado: validator detecta cross-sede globalmente (no solo per-sede) + corridas múltiples para bug timing-dependent

**Out of scope:**
- Cleanup retrospectivo de reminders/confirmaciones ya enviadas (decisión usuario 2026-05-13: "arreglamos de ahora en adelante")
- Migración a API oficial de Dentos si existiera (research opcional, no blocker — el rediseño asume scraping vía portal HTML)
- Cambio de framework (Playwright se mantiene)
- Modificar Inngest functions de reminders más allá del cambio mínimo necesario para consumir el nuevo output

</domain>

<decisions>
## Implementation Decisions

### Estrategia general (D-01..D-06)

- **D-01:** **Rediseño desde 0 del proceso de scraping**, no parches al código actual. El loop `for sucursal → selectSucursal → extractAppointments(sucursal.label)` se desecha. El `extractAppointments` actual etiqueta cada fila con `sucursal: label` basándose en la iteración del loop, NO en lo que el portal Dentos dice — esa es la falla estructural raíz que ningún parche superficial cierra.
  - **Why:** El standalone shipped el 12-may (`godentist-scraper-table-refresh-guard`) atacó UNA capa (waitForSucursalRefresh) y difirió explícitamente otras 2 (clickNextPage disabled-check, server-action dedupe). El bug recurrió con magnitud mayor pese al fix. La causa raíz no es timing — es que el contrato del scraping confía en el filtro del portal sin verificarlo.
  - **How to apply:** Research-phase investiga 2 ó 3 paradigmas alternativos con pruebas en vivo y entrega RESEARCH.md con el ganador empíricamente validado. Plan-phase reescribe el adapter con el paradigma ganador. Cualquier código del adapter actual relacionado a `for sucursal` + `extractAppointments(label)` + `waitForSucursalRefresh` puede borrarse — no es deuda a preservar.

- **D-02:** **Validación con pruebas EN VIVO durante research-phase.** Claude (yo) corro scrapes reales contra el portal Dentos real (Railway service godentist-production o equivalente local), captura screenshots/HTML, inspecciona el DOM del portal. Cada decisión de diseño tiene un comprobante empírico (screenshot, HTML snippet, output JSON), no asunciones.
  - **Why:** Mandato directo del usuario: "comprobantes, no asunciones". El bug recurrente del 12-may existió en parte porque las decisiones del standalone anterior se basaron en hipótesis del comportamiento del portal (e.g., "waitForFunction sobre primer row es suficiente") que en producción no se sostuvieron.
  - **How to apply:** Research-phase ejecuta corridas de Playwright en headless=false contra portal Dentos con credenciales reales (JROMERO/123456) y captura: (a) HTML del combo de sede pre/post-click, (b) HTML de la tabla de citas y del toolbar pre/post-clickBuscar, (c) qué pasa cuando hay 1 página vs 2 páginas, (d) si el portal expone la sede en alguna columna del DOM por fila, (e) qué pasa en el cambio rápido entre sedes consecutivas.

- **D-03:** **Paginación y cambio de sede son los DOS focos del rediseño** — sin ambos validados empíricamente, no se planifica.
  - **Why:** Evidencia productiva muestra que ambos mecanismos están rotos simultáneamente: `clickNextPage` lee páginas falsas (JOSE DELGADO ×4 en FLO 10:00 AM; ALVARO/OSCAR/EDDY ×3 cada uno en MEJORAS) y cambio de sede contamina (JOHANNA/YARINETH de JUMBO etiquetadas como MEJORAS; EDDY de CABECERA etiquetada como MEJORAS).
  - **How to apply:** Research-phase tiene 2 sub-investigaciones obligatorias: (1) paginación robusta + cómo determinar fin-de-páginas sin clicks falsos, (2) cambio de sede atomicidad — opciones: combo readback post-search, espera de marker DOM específico del filtro nuevo, scrape sin filtro leyendo sede por fila si Dentos lo expone.

- **D-04:** **Rediseño del tab "Programación de Recordatorios"** en la UI dashboard — de flat-list de reminders sueltos a **cards-por-scrape replicando el pattern del tab "Historial Confirmaciones"** (`confirmaciones-panel.tsx:680-792`). Mandato usuario verbatim 2026-05-13: "muestre cada scrape por individual aparte de los recordatorios (revisar historial confirmaciones y replicar + ui actual)".

  **Estado actual** (`confirmaciones-panel.tsx:798-880+`): tab "programacion" con date picker + 2 secciones (Pendientes / Historial enviados) + tabla flat de reminders (nombre, teléfono, hora cita, hora envío, sucursal, acción cancelar). Cero agrupación por scrape. Cero metadata del scrape origen.

  **Estado objetivo:**
  - **Card por scrape** (replicar `confirmaciones-panel.tsx:704-756`) mostrando:
    - Timestamp del scrape (`created_at` desde `godentist_scrape_history`)
    - Badge fecha de las citas (`scraped_date`)
    - Badge total reminders programados desde ese scrape
    - Badges de sucursales involucradas
    - Badges de estado agregado: X pendientes / Y sent / Z failed / W cancelled
    - **Badge `inconsistent`** (D-08) si el detector cross-sede disparó — rojo, visible, accionable
    - Botón "Ver detalle" → abre detail view con la tabla flat actual (reusar componente)
  - **Detail view**: tabla actual de reminders por scrape (preserva date picker dentro del detail si conviene, preserva botón cancelar por fila — D-04 "+ ui actual")
  - **Sección "Sin scrape origen"** o equivalente para reminders huérfanos (si los hay por data legacy)

  **Query nueva en server-action**: `getScheduledRemindersGroupedByScrape(workspaceId, dateFilter?)` que retorna array de `{ scrape: ScrapeHistoryEntry, reminders: ScheduledReminderEntry[], stats: { pending, sent, failed, cancelled }, inconsistent: boolean }`.

  **Why:** Hoy `godentist_scheduled_reminders` tiene `scrape_history_id` poblado (`scheduleReminders` línea 709) pero la UI no lo usa — para diagnosticar "por qué este cliente recibió esto" hay que ir a SQL manual (lo que el usuario rechazó explícitamente: "el #2 no lo voy a hacer manual malparido"). Cards-por-scrape habilita post-mortem visual sin SQL.

  **How to apply:** Plan-phase incluye task de UI con:
  - Nueva query server-action (`getScheduledRemindersGroupedByScrape`)
  - Rediseño componente del tab "programacion" en `confirmaciones-panel.tsx` (extraer a sub-componente si pasa de ~200 líneas)
  - Reuso máximo de `HistoryDetail` o pattern equivalente del tab history
  - Badge `inconsistent` consumido del scrape (D-08 garantiza que la columna existe)

- **D-05:** **El fix cubre AMBOS flujos** — `sendConfirmations` (envío inmediato del scrape) + `scheduleReminders` (reminders programados via Inngest). Ambos consumen el mismo output del scrape; rediseñar uno sin el otro deja la mitad del bug intacta.
  - **Why:** Evidencia productiva confirma bug en ambos: scrape `13e6354a-...` (14:03 UTC) disparó scheduleReminders con cross-sede; scrape de hoy 10:02 AM disparó sendConfirmations con cross-sede (EDDY) y duplicados (ALVARO/OSCAR/EDDY ×3).
  - **How to apply:** Plan-phase modifica ambos consumers para usar el output del paradigma nuevo. Si el contrato de `GodentistAppointment` cambia, ambos se actualizan en el mismo wave.

- **D-06:** **Dedupe + detector cross-sede son OBLIGATORIOS como capa defensiva en server-action**, independiente del paradigma de scraping.
  - **Why:** Aún con rediseño perfecto, el portal Dentos puede cambiar (HTML, ExtJS version, timing) y romper el robot sin que el operador se entere. La capa defensiva en `scrapeAppointments` (server-action) atrapa inconsistencias antes del envío.
  - **How to apply:** Después de `fetch` al robot y antes del insert a `godentist_scrape_history`, el server-action: (1) deduplica por (phone, hora, sede) — descarta repetidos exactos sin alarma, (2) detector canary cross-sede: si `(phone, fecha)` aparece en >1 sede, escalar (ver D-08).

### Garantía de correctness (D-07..D-08)

- **D-07:** **El rediseño DEBE garantizar correctness por construcción** — la regla "cada cita pertenece a exactamente una sede" se cumple por diseño del paradigma, no por validación post-hoc. Si el paradigma elegido tiene una ruta donde una cita podría ser asignada a sede X mientras pertenece a Y, ese paradigma se rechaza en research-phase.
  - **Why:** Mandato usuario: "se supone que el fix [es] para que eso NO PASE". La capa defensiva (D-06) no es flujo operativo — es safety net contra bugs futuros desconocidos.
  - **How to apply:** En research-phase, cada paradigma candidato pasa el test conceptual: "¿hay alguna ventana de race donde una cita se asigna a sede equivocada?". Si la respuesta es sí, ese paradigma queda fuera (o gana otra capa intra-robot que lo cierre).

- **D-08:** **Detector cross-sede del D-06 funciona como CANARY de bug, no como workflow operativo.** Si dispara en producción significa que el paradigma nuevo tiene una grieta — debe alertar al developer (Inngest event `godentist/scrape.inconsistent` + log forense con scrape_id + phones afectados + sedes en conflicto), NO al operador para "resolver manualmente". Comportamiento al disparar:
  - El scrape se persiste en `godentist_scrape_history` con flag `inconsistent=true` (audit trail)
  - **Bloquea el envío automático** (sendConfirmations + scheduleReminders abortan si flag activo)
  - Emite Inngest event para alertas
  - **NO** intenta retry automático (la idea de retry asume bug timing-dependent — D-07 rechaza ese frame)
  - **Why:** Filtra dos cosas: (a) que el alert llegue a quien puede arreglarlo (developer no operador), (b) que el operador no se acostumbre a "ah, sale alerta de vez en cuando, normal" — debe ser señal fuerte que algo se rompió.
  - **How to apply:** Migration a `godentist_scrape_history` agrega columna `inconsistent BOOLEAN DEFAULT false` + columna `inconsistency_details JSONB`. Inngest event nuevo `godentist/scrape.inconsistent` con handler que loguea + (futuro) notifica.

### Despliegue (D-09..D-10)

- **D-09:** **Sin cleanup retrospectivo.** Reminders y confirmaciones mal enviados hoy (2026-05-13) se quedan en BD sin tocar. No marcamos los scrapes históricos `13e6354a-...` ni el de 10:02 AM como inconsistent. No enviamos disculpas via WhatsApp. Fix aplica de aquí en adelante.
  - **Why:** Decisión usuario: "SIN CLEANUP ARREGLAMOS DE AHORA EN ADELANTE". Re-enviar mensajes correctivos crea spam adicional y confunde al cliente.
  - **How to apply:** Plan-phase NO incluye tasks de cleanup ni migración correctiva. La data histórica queda preservada para forensics si en algún momento se necesita.

- **D-10:** **Feature flag `USE_NEW_GODENTIST_SCRAPING` con default ON** + rollback rápido via env var o `platform_config`. Paradigma nuevo activo desde el merge a main; flag existe como "kill switch" si el rediseño tiene su propia falla en producción.
  - **Why:** Decisión usuario opción (c). El bug actual es severo (clientes recibiendo info equivocada); activar el fix por default. Pero hay flag de emergencia porque el rediseño es código nuevo y puede tener bugs propios.
  - **How to apply:** Flag se lee en `src/app/actions/godentist.ts:scrapeAppointments` antes del fetch al robot. Si OFF → fetch al endpoint legacy (que el adapter mantiene como `/api/scrape-appointments-legacy` por seguridad de rollback). Si ON → fetch al endpoint nuevo `/api/scrape-appointments` con el paradigma rediseñado. Storage del flag: `platform_config.use_new_godentist_scraping` (default `true`, modificable via SQL para rollback en caliente).

### Mecanismos puntuales obligatorios (D-11..D-13)

- **D-11:** **`clickNextPage` (o equivalente en paradigma nuevo) DEBE chequear `x-item-disabled` antes de clickear.** Si el botón está disabled, NO clickear — terminar paginación. Esto es defensa redundante: D-07 ya garantiza que la paginación es robusta por construcción del paradigma, pero esta capa atrapa el caso patológico donde el portal expone botón disabled de forma inesperada.
  - **Why:** El standalone del 12-may difirió esto explícitamente como "out of scope" bajo la premisa de que el table-refresh-guard lo haría innecesario. La premisa no se sostuvo; el bug volvió. Esta vez se incluye obligatoriamente.
  - **How to apply:** En el adapter nuevo, cualquier función que click-ee botón de paginación verifica `el.classList.contains('x-item-disabled') === false` ANTES del click. Si disabled, sale del loop de páginas limpio.

- **D-12:** **Server-action `scrapeAppointments` dedupe por `(phone, hora, sede)` antes de persistir.** Si el robot retorna 3× ALVARO 5:00 PM MEJORAS, el server-action persiste 1×. No alarma (es defensa silenciosa) — solo previene programar/enviar 3 mensajes al mismo cliente por el mismo slot.
  - **Why:** Caso real de hoy 10:02 AM: ALVARO/OSCAR/EDDY recibieron 3× la misma confirmación porque el robot duplicó. Aún con paradigma nuevo, dedupe es safety net barato.
  - **How to apply:** Tras `await res.json()` y antes del `admin.from('godentist_scrape_history').insert`, aplicar `Array.from(new Map(data.appointments.map(a => [\`\${a.telefono}|\${a.hora}|\${a.sucursal}\`, a])).values())`.

- **D-13:** **Research-phase es BLOQUEANTE y debe entregar evidencia empírica antes de plan-phase.** RESEARCH.md DEBE incluir:
  - Screenshots del portal Dentos en cada sede (las 4) mostrando estructura de la tabla
  - HTML snippet del combo de sede pre/post-selectSucursal (verificar si el `value` del input cambia y cuándo)
  - HTML snippet del toolbar de paginación pre/post-clickNextPage (verificar `x-item-disabled` y "Displaying A - B of C")
  - **Pregunta resuelta empíricamente**: ¿el portal Dentos expone la sucursal en cada fila de la tabla? (columna, atributo data-, tooltip, etc.) — esto determina si scrape-sin-filtro es viable
  - Output JSON de 3 corridas distintas con paradigma candidato ganador, validado por validator nuevo (ver D-15)
  - Recomendación clara de paradigma ganador con rationale + paradigmas descartados con rationale
  - **Why:** D-02 mandato del usuario: comprobantes no asunciones.
  - **How to apply:** Plan-phase NO arranca hasta que RESEARCH.md tenga todos los artefactos arriba commiteados en `.planning/standalone/godentist-scraping-structural-v2/research-evidence/`.

### Validación (D-14..D-15)

- **D-14:** **Smoke E2E mínimo 5 corridas consecutivas multi-sucursal** (no 3 como standalone anterior). El bug es timing-dependent: 11-may fue 1-de-6 fallos; 13-may fue ≥2-de-N. Tres corridas no dan confianza estadística suficiente.
  - **Why:** Standalone anterior validó con 3 corridas y todas marcaron PASS según validator viejo; sin embargo cuando el validator se re-corre HOY sobre los mismos JSONs, sale FAIL (DELAZCAR duplicado en CABECERA). El bug pasa la validación con baja N.
  - **How to apply:** Plan-phase incluye task de smoke E2E con N=5 mínimo. Si alguna falla, se aborta merge y se vuelve a research o plan.

- **D-15:** **Validator E2E mejorado** detecta 3 invariantes (no 2 como antes):
  - (a) Ratio (total/unique by phone+hora) === 1.0 por sede [conservado del validator viejo]
  - (b) Overlap (phone+hora intersection) === 0 entre pares de sedes [conservado]
  - (c) **NUEVO: ningún `(phone, fecha)` aparece en >1 sede globalmente** [detector cross-sede a nivel validator]
  - **Why:** Bug real de hoy (JOHANNA en MEJORAS cuando es JUMBO; EDDY en MEJORAS cuando es CABECERA) NO se detecta con (a)+(b) solos porque cada sede individualmente parecía consistente. La invariante (c) es la que captura la falla cross-sede del paradigma viejo.
  - **How to apply:** `smoke-e2e/validate.cjs` se reescribe con la invariante adicional. Plan-phase tiene task explícita de validator nuevo.

### Claude's Discretion

- **DISC-01:** Naming del flag y del endpoint legacy (`USE_NEW_GODENTIST_SCRAPING` + `/api/scrape-appointments-legacy` son sugerencias — Claude decide en plan-phase si convienen otros nombres por consistency con el codebase).
- **DISC-02:** Estructura interna del paradigma nuevo (qué helpers Playwright crear, cómo modularizar) — research-phase recomienda, plan-phase formaliza.
- **DISC-03:** Si el research descubre que Dentos NO expone sede por fila → Claude elige entre (a) combo readback robusto + marker DOM por sede, (b) scrape secuencial con verificación de identidad por fila vía algún otro campo, (c) otra opción emergida del research. Decisión en research-phase con evidencia.
- **DISC-04:** UI del tab "Programación de Recordatorios": componente nuevo desde 0 vs refactor compartido con "Historial Confirmaciones" vs reusar al 100%. Decisión en plan-phase tras leer el código actual del tab confirmaciones.
- **DISC-05:** Migration de `godentist_scrape_history`: cuándo aplicar (Plan 01 vs Plan N) y exactamente qué columnas (`inconsistent BOOLEAN`, `inconsistency_details JSONB` son mínimo — Claude decide si agrega más).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (research-phase, plan-phase) MUST read these antes de planificar o implementar.**

### Evidencia del bug actual (forensics)
- `.planning/debug/godentist-cross-sede-recurrence.md` — Forensics completo: scrape `13e6354a-...` (reminders 14:03 UTC), scrape de 10:02 AM (confirmaciones), comparativa histórica, raíz estructural
- Memory `.claude` auto-memory: `godentist-jumbo-floridablanca-dup-scraping.md` — Root cause original del 11-may con logs Railway

### Standalone anterior (lecciones aprendidas)
- `.planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md` — Decisiones del fix del 12-may. **D-08/D-09 difirieron clickNextPage check y server-action dedupe — esos diferimientos fallaron**
- `.planning/standalone/godentist-scraper-table-refresh-guard/SPEC.md` — Requirements lockeados del fix anterior (4 reqs) — para entender qué se intentó y qué quedó fuera
- `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` — Validator viejo (a renovar en D-15)
- `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_1.json` y `smoke_single.json` — Evidence de que validator viejo NO detectaba cross-sede (smokes "PASS" originalmente pero FAIL al re-correrlos hoy)

### Código del adapter actual (legado a reemplazar)
- `godentist/robot-godentist/src/adapters/godentist-adapter.ts` — Adapter completo (~1900 líneas). Funciones clave:
  - §240-301 `scrapeAppointments` (loop por sede + waitForSucursalRefresh)
  - §1448-1470 `selectSucursal` + `clickBuscar`
  - §1576-1620 `captureFingerprint` (fingerprint actual de la tabla)
  - §1640-1740 `waitForSucursalRefresh` (guard shipped el 12-may — insuficiente, ver evidencia)
  - §1749-1813 `extractAllPages` + `getTotalPages`
  - §1818-1836 `clickNextPage` (**falta check x-item-disabled** — D-11)
  - §1840+ `extractAppointments(sucursal)` (asigna `sucursal: label` hardcoded — falla raíz)
- `godentist/robot-godentist/src/api/server.ts` §27 — Express handler `POST /api/scrape-appointments` (a duplicar como legacy + nuevo)
- `godentist/robot-godentist/src/types/index.ts` — Types del adapter (ScrapeAppointmentsRequest, Appointment, etc.)

### Server-actions consumidoras (a modificar)
- `src/app/actions/godentist.ts`:
  - §108-167 `scrapeAppointments` (server-action) — agregar feature flag (D-10) + dedupe (D-12) + detector cross-sede (D-08)
  - §170-310 `sendConfirmations` — bloquear si scrape flag `inconsistent` (D-08)
  - §641-790 `scheduleReminders` — bloquear si scrape flag `inconsistent`
  - §835+ `getFollowupPreview` — patrón de query agrupada por scrape_history_id (referencia para D-04 UI)
- `src/inngest/functions/godentist-reminders.ts` — Consumer del evento `godentist/reminder.send`; verificar si necesita cambios (probablemente no, ya que recibe data del reminder no del scrape)

### UI dashboard (rediseño del tab "programacion" — D-04)
- `src/app/(dashboard)/confirmaciones/page.tsx` — Hosta el panel; no requiere cambios estructurales
- `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` (1409 líneas) — Contiene los 3 tabs:
  - **`Tab = 'scrape' | 'history' | 'programacion'`** (line 26) — tipo del state del tab activo
  - **§680-792 tab `history`** — pattern a REPLICAR para programacion. Cards-por-scrape con timestamp, fecha, total citas, badges sucursales, badge enviado (X/Y), badge seguimiento, botón "Ver" + "Reenviar". `HistoryDetail` component para vista detalle.
  - **§798-880+ tab `programacion`** — código actual a REDISEÑAR. Hoy: date picker + sección "Pendientes" con tabla flat (nombre/teléfono/hora cita/hora envío/sucursal/acción) + sección "Historial enviados" (presumido más abajo). Flat list sin agrupación.
  - **§122-140 `loadReminders`** — query actual `getScheduledReminders(reminderDate)` retorna flat list. Esta es la que se reemplaza por `getScheduledRemindersGroupedByScrape` (D-04).
  - **§704-756 estructura Card** — copy-paste reference para el rediseño del tab programacion (badges, timestamp formatter `es-CO` America/Bogota, botones Ver/Reenviar)

### Migrations DB
- `supabase/migrations/20260312100000_godentist_scheduled_reminders.sql` — Tabla `godentist_scheduled_reminders` (tiene `scrape_history_id` ya — D-04 UI lo usa)
- Migration nueva (Plan TBD) — Agregar `inconsistent BOOLEAN` + `inconsistency_details JSONB` a `godentist_scrape_history` (D-08)

### Convenciones del proyecto
- `CLAUDE.md` REGLA 0 — GSD completo obligatorio
- `CLAUDE.md` REGLA 1 — Push a Vercel tras cambios (aplica al server-action + UI; robot Railway tiene su flow propio via git push origin main)
- `CLAUDE.md` REGLA 5 — Migración aplicada a prod ANTES de pushear código que la usa
- `CLAUDE.md` REGLA 6 — Proteger agente productivo (aplica via feature flag D-10)

### Railway service info
- Project: `2bfb887a-6f5a-4866-8190-070601343233`
- Service: `Godentist`
- Env: `production`
- Root directory: `/godentist/robot-godentist`
- Auto-deploy on push to `origin main`
- Logs CLI: `railway logs -s Godentist <deployment-id> --since X --until Y --json` (cuenta `joseromerorincon041100@gmail.com`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`page.waitForFunction()`** (Playwright) — Native polling con timeout, ya usado en `waitForSucursalRefresh`. Reutilizable en paradigma nuevo si conviene.
- **`page.evaluate()`** — Patrón usado en `getTotalPages`, `clickNextPage`, `captureFingerprint`. El adapter ya tiene experiencia con DOM del portal ExtJS.
- **`scrape_history_id` FK** en `godentist_scheduled_reminders` (ya existe) — Habilita D-04 sin migration adicional para JOIN.
- **`godentist_scrape_history.send_results`** JSONB — Patrón establecido para almacenar resultado del envío (referencia para detector cross-sede en `inconsistency_details`).
- **`platform_config` table** — Patrón usado en otros agentes (somnio recompra, shopify oauth) para feature flags via SQL en caliente. Reusable para D-10.

### Established Patterns
- **Console logging grep-able** — Convención `[GoDentist] ...` en todo el adapter. Mantener en paradigma nuevo para forensics consistente.
- **HTTP status discriminado** — `SedeRefreshFailedError → 502` (shipped el 12-may). Patrón replicable: nuevo `ScrapeInconsistentError → 4xx/5xx` (TBD en research).
- **Server-action gating por `if (!res.ok)`** — Línea 129 de `actions/godentist.ts` ya bloquea downstream cuando robot retorna 5xx. Reusable: si scrape detecta inconsistent, robot puede retornar 4xx/5xx para reusar el gating natural.
- **Soft-flag con audit** — Patrón usado en `crm_bot_actions` (status='expired'/'failed'/'cancelled'). Replicable para `inconsistent` flag en `godentist_scrape_history`.

### Integration Points
- **Endpoint Express `POST /api/scrape-appointments`** — Único entrypoint. Cambiarlo cambia el contrato con server-action. Estrategia D-10: mantener legacy en `/api/scrape-appointments-legacy`, nuevo en endpoint principal.
- **`ROBOT_URL` env var** — Apunta al Railway deployment (`godentist-production.up.railway.app`). No cambia.
- **`godentist_scrape_history` schema** — Migration mínima necesaria (`inconsistent` + `inconsistency_details`). REGLA 5 aplica: migration en prod ANTES de push del código.
- **Inngest function `godentist-reminder-send`** — Consumer pasivo del evento. Probablemente sin cambios; verificar en research-phase.
- **UI tab "Historial Confirmaciones"** — Misma página puede hostear ambos tabs (Confirmaciones + Programación Recordatorios) o split en página dedicada. Decisión DISC-04.

</code_context>

<specifics>
## Specific Ideas

- **Mandato directo del usuario sobre research-phase**: "tu las haces" — Claude (yo) ejecuto las pruebas en vivo, no el usuario. Esto implica que research-phase incluye scripts ejecutables (puede ser node scripts contra Railway endpoint, puede ser local Playwright contra portal Dentos directo, puede ser ambos). El usuario no corre nada manualmente.

- **Tono del usuario sobre el bug**: "que esto NO PASE" (mayúsculas + énfasis) — la garantía de correctness (D-07) no es deseable sino innegociable. Si en research-phase ningún paradigma cumple D-07, se vuelve a discuss-phase con el usuario antes de plan-phase. No "lo mejor que se pueda" — debe ser correcto por construcción.

- **Cross-sede confirmado en sendConfirmations (no solo scheduleReminders)**: Evidencia productiva de hoy 10:02 AM en MEJORAS PUBLICAS — EDDY JANNETH CARRILLO 573167984847 5:45 PM marcada como MEJORAS cuando su cita real es CABECERA. Adicional: ALVARO/OSCAR/EDDY ×3 cada uno (paginación rota). El fix tiene que cubrir AMBOS flujos por diseño, no como dos fixes separados.

- **No re-spamear al cliente**: Decisión usuario explícita "SIN CLEANUP". Aunque hay tentación de enviar "perdón, ignora el mensaje anterior", el usuario considera que crea más confusión que valor. Cleanup retrospectivo queda fuera de scope permanentemente.

</specifics>

<deferred>
## Deferred Ideas

- **API directa de Dentos** (si existiera): research-phase puede investigarlo brevemente como side-quest, pero no es bloqueante. Si el portal ofrece API REST/GraphQL/etc., podría ser un standalone futuro para reemplazar el scraping completo.
- **Migración a otro framework de scraping** (e.g., Puppeteer, headless Chrome custom): out of scope — Playwright se mantiene.
- **UI para configurar credenciales Dentos** (hoy hardcoded JROMERO/123456): TODO documentado pero fuera de este standalone — abrir standalone separado si necesario.
- **Smoke E2E nightly programado con alertas Slack/email**: D-14 manda 5 corridas en plan-phase como gating; un cron nightly sería capa extra de defensa pero queda como TD para futuro standalone.
- **Cleanup retrospectivo de reminders/confirmaciones malos**: Rechazado por decisión usuario D-09. No re-abrir.
- **Detector cross-sede como `bot status` indicator en UI**: D-08 manda alertas via Inngest, pero UI badge "scraping health: OK / WARNING / DEGRADED" sería incremental — futuro standalone si el bug recurre.

</deferred>

---

*Standalone: godentist-scraping-structural-v2*
*Context gathered: 2026-05-13*
*Next step: `/gsd-research-phase godentist-scraping-structural-v2` — research-phase BLOQUEANTE con pruebas en vivo del portal Dentos antes de planificar.*
