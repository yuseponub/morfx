# godentist-blast-sms-experiment - Context

**Gathered:** 2026-04-28
**Status:** Ready for research/planning
**Type:** Standalone (no phase number)
**Trigger:** Re-ejecutar campaña `nuevo_numero` sobre lista pacientes 2019-2022 con experimento A/B (50% solo WA, 50% WA+SMS) para medir lift en respuesta del paciente.

<domain>
## Phase Boundary

Ejecutar un blast masivo del template WhatsApp `nuevo_numero` (ya aprobado en producción) sobre la lista de **8.832 pacientes históricos GoDentist 2019-2022**, con un experimento A/B controlado:

- **Grupo A (50% — ~4.416 contactos):** Solo recibe WhatsApp template `nuevo_numero`
- **Grupo B (50% — ~4.416 contactos):** Recibe WhatsApp + SMS Onurix simultáneo (~2s después del WA en mismo loop)

**Objetivo:** Medir si el SMS adicional incrementa el % de respuesta (inbound message en 3 días post-envío) vs WA solo.

**Cadencia:** 1 cron diario lun-vie a 10:30 Bogotá, 1.800 contactos/día (900 grupo A + 900 grupo B), tasa 60/min interna, **4 días completos + día 5 parcial 1.084 (542/542)** total. Lista real post-dedup = **8.284 phones únicos** (no 8.832 — research RESEARCH.md detectó 413 dupes internos + 127 inválidos).

**Workspace target:** GoDentist (`36a74890-aad6-4804-838c-57904b1c9328`).

**Fuera de alcance:**
- UI de campañas (super-admin module) — overkill para one-off
- Dedup vs campaña anterior `nuevo_numero` (17/03-28/03 a 17.149 pacientes 2023-2026) — D-01: re-enviar a todos
- Filtros de calidad de teléfonos antiguos (3-7 años) — D-02: sin filtro adicional
- Asignación retrasada SMS (4h después del WA) — D-08: simultáneo
- Tracking en DB schema (tags/custom_fields/tabla nueva) — D-06: archivo JSON local borrable post-estudio
- Métrica de respuesta basada en agendamiento real Dentos — D-07: inbound message 3d
- SMS sender ID alfanumérico custom — usar default Onurix
- Refactor del script anterior `godentist-send-scheduled.ts` — D-16: nuevo script aparte

</domain>

<decisions>
## Implementation Decisions — LOCKED

### Lista + dedup

- **D-01: Re-enviar a todos sin dedup vs campaña anterior.** Pacientes que ya recibieron `nuevo_numero` en marzo-abril (set 2023-2026) y que también aparezcan en la lista 2019-2022 (overlap probable porque pacientes de 2019 pueden haberse re-activado en 2023+) recibirán el template otra vez. Usuario asume el riesgo de Meta quality drop / paciente molesto a cambio de máxima cobertura.
- **D-02: Sin filtro de calidad adicional.** Mandar a todos los teléfonos válidamente normalizables (Colombian mobile +57 3XX XXX XXXX). No filtrar por presencia de email, fecha_creacion mínima, ni nada más. 8.832 pacientes totales, esperar bounce rate alto (números 4-7 años antiguos).
- **D-03: Parser xlsx con `npm i xlsx`.** Decisión Claude. Razón: 8.832 filas no es manejable manualmente con confiabilidad. Script reproducible en `scripts/parse-godentist-xlsx-2019-2022.ts` que lee `~/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx` → escribe `godentist/pacientes-data/pacientes-2019-2022.json` con shape `{nombre, apellido, celular, email, fecha_creacion}` (mapeando `nom1`→`nombre`, `ape1`→`apellido`).
- **D-04: Reporte CSV de bounces al final.** Generar `godentist/pacientes-data/blast-experiment-skipped.csv` con columnas `numero, nombre, razon_skip` para que GoDentist depure su DB. NO usar tags en CRM ni log local solo. CSV se entrega al equipo GoDentist al cerrar el experimento.

### Diseño A/B

- **D-05: Asignación determinista hash(phone) split exacto 900/900 por día (días 1-4) + 542/542 día 5.** Para cada día de envío, tomar el slice diario del JSON dedup'd (8.284 phones únicos), ordenar dentro del slice por `hash(phone)` (SHA-256 mod N donde N = tamaño del slice), partir a la mitad: primera mitad = grupo A, segunda mitad = grupo B. Garantiza:
  - Determinista (mismo phone siempre → mismo grupo si re-corres tras crash)
  - Pseudo-randomizado respecto al orden original del xlsx
  - Split diario exacto (días 1-4: 900/900, día 5: 542/542 — total A=4.142, B=4.142)
  - **Día 5 parcial (1.084 contactos)** confirmado por usuario 2026-04-28: split simple 542/542, último día parcial es estadísticamente irrelevante porque ya hay 4 días completos de muestra previa.
- **D-06: Tracking en archivo JSON local, NO en DB.** Crear `godentist/pacientes-data/blast-experiment-assignments.json` con shape:
  ```json
  [{"phone":"+57...","nombre":"...","group":"A|B","sent_wa_at":"ISO","sent_sms_at":"ISO|null","day":1}]
  ```
  Análisis post-estudio: query directa a `messages` table filtrada por phone+timestamp, joineada con este JSON. NO crear migración, NO tags/custom_fields/tabla nueva en DB.
  - **Cleanup obligatorio:** El JSON se BORRA al terminar el estudio (después del análisis final post-3-días-del-último-batch). Documentar fecha esperada de cleanup en el plan.
- **D-07: Métrica = inbound message en 3 días post-envío del WA.** Cualquier mensaje entrante (`messages.direction='inbound'`) del contacto al workspace GoDentist en ventana de 3 días (72h) desde `sent_wa_at`. Análisis intermedio diario (al final de cada día se evalúa el progreso acumulado), análisis final 3 días después del último batch.
- **D-08: SMS sale igual al mismo tiempo del WA, sin short-circuit.** Para grupo B, el loop manda WA primero y SMS ~2s después en la misma iteración. NO hay query intermedia de "ya respondió al WA?" para skipear SMS. Simple, datos limpios para experimento.

### SMS texto + costo

- **D-09: Domain layer billing.** Script invoca `sendSMS(ctx, params)` desde `src/lib/domain/sms.ts` con `ctx.workspaceId='36a74890-aad6-4804-838c-57904b1c9328'`. Esto debita `sms_workspace_config.balance_cop` del workspace GoDentist a $97 COP/segmento (precio interno morfx). Onurix factura wholesale ~$18.75 COP/seg al admin. NO bypass directo a Onurix.
  - Razón: GoDentist es cliente de morfx, debe pagar por el servicio. Audit completa en `sms_messages` table. Margen morfx legítimo del modelo de negocio.
- **D-10: Texto SMS — Opción B (personalizado, sin acentos, sin emojis, con link wa.me, sin precarga):**
  ```
  Hola {nombre}, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603
  ```
  - ~110 chars con nombre promedio "Maria" → **1 segmento GSM-7** ($97 COP debitado a GoDentist, $18.75 COP costo Onurix)
  - Sin emojis (👋🏻 ®️ 😱 📲) y sin acentos (numero/cambio/Clinicas) para forzar GSM-7 y mantener 1 seg
  - Link `wa.me/573016262603` se vuelve tappable en celular del paciente (abre WhatsApp con el número de GoDentist)
  - Sin `?text=Hola` precarga (decisión usuario — paciente escribe libre)
- **D-11: Edge case nombre largo.** Si `Hola {nombre}, GoDentist...` excede 160 chars (e.g. nombre "MARIA DEL CARMEN BUSTAMANTE GOMEZ" → ~143+34=177 chars), fallback automático del script a versión sin personalización:
  ```
  Hola, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603
  ```
  Mantener 1 seg garantizado. Implementar en el script como `template.length + name.length > 160 ? fallback : personalized`.
- **D-12: source='campaign' en sendSMS.** Activa el guard de ventana 8AM-9PM Colombia (CRC Res. 5111/2017). Cron 10:30 cae dentro de ventana. Compliance limpia con `MARKETING_SOURCES = ['campaign', 'marketing']` en `src/lib/sms/constants.ts`.
- **D-13: Pre-flight checks obligatorios antes del primer batch:**
  1. **Balance Onurix wholesale:** Query saldo cuenta Onurix (admin) + verificar >= ~$83.000 COP estimado wholesale (con margen 20%, recargar a ~$100.000 COP si menor). El admin tiene la responsabilidad de tener saldo suficiente.
  2. **Balance morfx GoDentist:** Query `sms_workspace_config.balance_cop` del workspace GoDentist + verificar >= ~$428.000 COP estimado interno (4.142 SMS × $97 ≈ $401k, con margen 12% recargar a ~$450k). **VERIFICADO 2026-04-28: GoDentist NO tiene fila en `sms_workspace_config` — solo Somnio existe ($17.990).** Plan 02 debe **CREAR** la fila (`workspace_id, balance_cop=450000, is_active=true`) antes del primer batch. Recarga via `/super-admin/sms` o INSERT directo.
  3. **`sms_workspace_config.is_active=true`** para workspace GoDentist. Cubierto en step 2 (INSERT con `is_active=true` desde el inicio).
  4. **Test 5 SMS reales:** Antes del primer cron run, mandar 5 SMS a teléfonos del equipo (Jose + 4 más) para verificar:
     - Sender ID renderiza OK (default Onurix)
     - Texto llega completo en 1 segmento (no se corta)
     - Link `wa.me/573016262603` es tappable y abre WhatsApp
     - Personalización `{nombre}` se reemplaza correctamente
     Costo: 5 × $18.75 = $93.75 COP wholesale (~$485 COP interno).
  5. **Template `nuevo_numero` aprobado:** Query 360dialog API o panel para confirmar status `APPROVED` (no `PAUSED` ni `REJECTED`). Si está pausado por mala calidad, blast WA falla en masa. Standalone abort si pausado.

### Cadencia + operativa

- **D-14: Días lun-vie (cron `30 10 * * 1-5`).** **VERIFICADO 2026-04-28: crontab actual tiene 2 entries activas** (`30 10 * * 2-6` + `30 14 * * 2-6` ambas apuntando a `godentist-send-cron.sh` de la campaña anterior). Plan 05 debe **eliminar AMBAS** y agregar la nueva entry única:
  ```
  30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
  ```
  Sin sábado (decisión usuario — odontólogos algunos cierran sábado, menor probabilidad de respuesta inmediata).
- **D-15: 1 cron run diario a 10:30 Bogotá.** Eliminar el cron de 14:30 para este experimento (vs campaña anterior que tenía 2 batches diarios). 1 solo run por día simplifica el split A/B garantizado y reduce complejidad operativa.
  - Run dura ~45 min (10:30 → 11:15) con 2.700 ops a 60/min
  - Termina dentro de ventana legal SMS (8AM-9PM ✓)
- **D-16: Tasa 60/min interna (1 mensaje por segundo, `DELAY_MS=1000`).** Balance entre velocidad y robustez:
  - Run completo en 45 min vs 13 min de campaña anterior (200/min) — más margen para retry/error handling
  - 1.800 WA × 1s = 30 min + 900 SMS × 1s = 15 min adicionales = 45 min total
  - Para grupo B (WA+SMS combo), serial dentro de la misma iteración (~2s entre WA y SMS del mismo paciente)
- **D-17: Nuevo script `scripts/godentist-blast-experiment.ts`.** Copiar el patrón de `scripts/godentist-send-scheduled.ts` extendido con:
  - Parser xlsx → JSON al primer run (idempotente — si JSON existe, skip parser)
  - Asignación A/B determinista hash(phone) por slice diario
  - Llamada a `sendSMS` (domain) para grupo B después del WA
  - JSON tracking de assignments incremental (append por día)
  - CSV de bounces incremental
  - Mismo state file pattern (`send-state.json` adaptado a `blast-experiment-state.json`)
  - **NO contamina el script anterior** — vive en archivo nuevo, no toca el existing.
  - Wrapper sh: `scripts/godentist-blast-experiment-cron.sh`

### Claude's Discretion (planning phase decide)

- Estructura exacta del JSON tracking (campos opcionales, formato de timestamps)
- Lib específica para hashing determinista (built-in Node `crypto.createHash('sha256')`)
- Implementación del fallback de nombre largo (regex vs length check)
- Manejo de errores específicos (Onurix 4xx vs 5xx, retry strategy)
- Logging por run (reusar pattern del script anterior — `cron_YYYY-MM-DD_HHMM.log` en `godentist/pacientes-data/logs/`)
- Cleanup automático del JSON tracking post-3-días-último-batch o manual
- Reporte de análisis intermedio diario (script aparte vs query SQL ad-hoc)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Campaña anterior (referencia obligatoria del patrón)
- `scripts/godentist-send-scheduled.ts` — Patrón base del script (lectura JSON pacientes, batch processing, dedup vía contacts table, error handling, log por run, state file para resumen). Reusar pero NO contaminar.
- `scripts/godentist-send-cron.sh` — Wrapper bash para crontab (NVM load, log redirection, timestamp con TZ Bogotá).
- `scripts/godentist-send-nuevo-numero.ts` — Variante manual del script (primer batch de 2.000). Útil para entender el contract con 360dialog.
- `godentist/pacientes-data/send-state.json` — Ejemplo del formato state file con history.
- `godentist/pacientes-data/all-pacientes.json` — Ejemplo del formato JSON pacientes (5 campos: nombre, apellido, celular, email, fecha_creacion).

### SMS infrastructure (Onurix + domain layer)
- `src/lib/domain/sms.ts` — Función `sendSMS(ctx, params)` que el script DEBE llamar (D-09 domain layer billing).
- `src/lib/sms/client.ts` — Cliente Onurix `sendOnurixSMS(phone, message)` (no se llama directo desde el script, se llama vía domain).
- `src/lib/sms/utils.ts` — `formatColombianPhone()` (normalizar +57 3XX XXX XXXX), `calculateSMSSegments()` (verificar 1 seg para texto), `isWithinMarketingSMSWindow()` (validar 8AM-9PM Colombia).
- `src/lib/sms/constants.ts` — `SMS_PRICE_COP=97`, `MARKETING_SOURCES=['campaign','marketing']`.
- `.planning/standalone/sms-module/CONTEXT.md` §"Costo real" — Confirma costo Onurix wholesale (verificado por usuario: $37.500 / 2.000 créditos = **$18.75 COP/seg**, NO $6.9 como dice el doc original).
- `.planning/standalone/sms-time-window-by-type/CONTEXT.md` — D-01 mapping `source IN ('campaign','marketing')` → marketing → aplica guard de ventana legal CRC.

### WhatsApp infrastructure (360dialog directo)
- `src/lib/whatsapp/api.ts` — Cliente domain layer (NO se usa, el script bypassea como hace `godentist-send-scheduled.ts`).
- `scripts/godentist-send-scheduled.ts` líneas 55-78 — Función `send360Template()` que el nuevo script debe replicar (D360-API-KEY header, payload `{messaging_product, recipient_type, to, type, template:{name, language:{code}, components}}`).
- Template `nuevo_numero` — Aprobado en producción 360dialog para workspace GoDentist (`whatsapp_api_key` en `workspaces.settings`). Lenguaje `es`, 1 variable body `{{1}}=nombre`.

### Reglas del proyecto
- `CLAUDE.md` REGLA 0 — GSD obligatorio (este standalone cumple discuss → research → plan → execute).
- `CLAUDE.md` REGLA 3 — Domain layer obligatorio para mutaciones DB. **Excepción del script:** El script anterior (`godentist-send-scheduled.ts`) bypasea el domain para WhatsApp/contacts/conversations/messages porque es one-off externo al runtime Next. **El nuevo script debe seguir el mismo patrón** (bypass para WA + contacts/conversations/messages) **PERO usar domain para SMS** (D-09) porque SMS tiene billing que requiere RPC atómico.
- `CLAUDE.md` REGLA 5 — Migración antes de deploy: NO aplica a este standalone (sin schema changes).
- `CLAUDE.md` REGLA 6 — Proteger agente godentist en producción: el blast NO interactúa con el agente conversacional (envía templates, no respuestas). Las respuestas de pacientes inbound serán manejadas por el agente godentist normal — eso es el experimento.

### Datos del experimento
- `~/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx` — Lista source: 8.832 pacientes. Schema: `tipos_documento, documento, nom1, ape1, fch_nac, sexo, celular, email, fecha_creacion`. Mapear `nom1→nombre`, `ape1→apellido`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/godentist-send-scheduled.ts`** — Reusar 80% del código: state management, error handling, dedup contacts/conversations, 360dialog template send, log por run. Solo agregar layer A/B + sendSMS para grupo B.
- **`src/lib/domain/sms.ts:sendSMS()`** — Para grupo B, llamar con `ctx={workspaceId, userId:null}` y `params={phone, message:rendered, source:'campaign', contactName:fullName}`. Domain handles balance check + Onurix call + atomic RPC + Inngest delivery check.
- **`src/lib/sms/utils.ts:formatColombianPhone()`** — Normalizar phone antes de llamar sendSMS (`+573165753196` → `573165753196` para Onurix). Pero sendSMS lo hace internamente, así que el script solo debe pasar el phone normalizado del normalizePhone() existente en el script anterior.
- **Logging pattern** `godentist/pacientes-data/logs/cron_YYYY-MM-DD_HHMM.log` — Reusar formato.
- **State file pattern** `godentist/pacientes-data/send-state.json` — Adaptar a `blast-experiment-state.json` con shape extendida (incluye `experiment_progress: {grupo_a_sent, grupo_b_sent, total_sms_sent}`).

### Established Patterns
- **Bypass domain layer para escrituras one-off de scripts:** El script anterior (godentist-send-scheduled.ts) usa `createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)` directo y hace INSERT a `contacts`, `conversations`, `messages` sin domain. Está aceptado para scripts standalone (REGLA 3 excepción tácita por contexto). Mismo patrón aplica al nuevo script EXCEPTO para SMS (D-09 usa domain).
- **dotenv config path absoluto:** `dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })` — patrón para scripts vía cron (relative paths fallan en cron context).
- **Skip Sunday explicit:** El script anterior tiene `if (dayOfWeek === 0) return` además del cron filter. Defense-in-depth aplica también al nuevo script (skip si día no es lun-vie).

### Integration Points
- **Cron host (WSL):** Crontab del usuario edita con `crontab -e`. Entry actual mar-sáb se debe reemplazar (NO comentar — eliminar) con la nueva entry lun-vie. Si el experimento no debe bloquear futuras campañas tipo `nuevo_numero` reusables, considerar usar nombre diferenciado en el wrapper.
- **Workspace `36a74890-aad6-4804-838c-57904b1c9328`** — Workspace ID GoDentist hardcoded en el script.
- **Template ID:** `nuevo_numero` lenguaje `es` con 1 variable body. Mismo template que campaña anterior — debe seguir aprobado en 360dialog.
- **Onurix env vars:** `ONURIX_CLIENT_ID` y `ONURIX_API_KEY` en `.env.local`. Domain layer los lee automáticamente.

</code_context>

<specifics>
## Specific Ideas

- "lo del valor de envio pense que era mucho mas barato" → Confirmado: Onurix wholesale es $18.75/seg ($37.500 / 2.000 créditos). El $97 documentado es precio interno morfx con margen ~417%. Domain layer billing aplica para que GoDentist pague servicio normal a morfx.
- "queremos hacer un experimento... a la mitad queremos enviarle SMS para ver si el % de rta aumenta con el sms" → El experimento mide LIFT del SMS adicional sobre WA solo. Pregunta de negocio: ¿agregar SMS al WA mejora respuesta?
- "yo digo sms al mismo tiempo" → Confirmado D-08, simplifica el experimento (mide WA+SMS combo vs WA solo, no rescate de SMS retrasado).
- "el estudio probablemente lo haremos al final de cada día igual" → Análisis intermedio diario + análisis final 3d después del último batch.
- "se elimine despues de terminar de usarlo (despues del estudio y analisis)" → JSON tracking BORRABLE post-estudio (D-06 cleanup).
- "lo podemos hacer mas corto. tipo: GoDentist: Cambiamos nuestro numero, para cita odontologica o contacto escribenos a Whatsapp(link de whatsapp)" → Inspiró el texto final D-10 (versión personalizada con `{nombre}` + link `wa.me`, 1 segmento garantizado).
- "imbecil, son 1800 envios diarios, solo que a 900 se les envia wpp+sms" → Unidad correcta: 1.800 contactos/día (no 2.700 ops/día). Operaciones API son 2.700 pero conceptualmente la planificación es por contactos.

</specifics>

<deferred>
## Deferred Ideas

- **UI super-admin para campañas:** Módulo `/super-admin/campaigns` con creación de blasts, segmentación por workspace, tracking visual del experimento, dashboard de respuesta. Out of scope — overkill para one-off.
- **Backend Inngest queue para envíos masivos:** Migrar el script cron WSL a Inngest function con concurrency control, retry automático, observability completa. Out of scope — el patrón cron WSL ya funcionó probadamente para 17k envíos.
- **Tabla `campaign_experiment_assignments`:** Schema dedicado en DB para tracking permanente de experimentos A/B. Out of scope — D-06 prefirió JSON local borrable. Si futuros experimentos lo justifican, considerar entonces.
- **Métrica de respuesta = agendamiento real Dentos:** Joinear inbound con creación de cita en pipeline GoDentist. Mejor proxy de valor pero requiere query con join complejo. Out of scope V1 — D-07 simplifica a "inbound message 3d".
- **Sender ID alfanumérico custom "GoDentist":** Investigar si Onurix permite alphanumeric sender registrado, configurar para que paciente vea "GoDentist" en lugar de número desconocido. Out of scope — usar default Onurix.
- **Dedup vs campaña anterior nuevo_numero:** Filtrar phones que recibieron `nuevo_numero` en marzo-abril. Out of scope — D-01 re-enviar a todos.
- **Filtros de calidad teléfonos antiguos:** Solo con email válido / fecha_creacion >= cutoff. Out of scope — D-02 sin filtro.
- **Tags EXP-A/EXP-B en CRM:** Tracking visible en /crm/contactos con filtros. Out of scope — D-06 prefirió JSON.
- **SMS retrasado 4h con check de respuesta:** Rescate inteligente. Out of scope — D-08 simultáneo.
- **Texto SMS con `?text=Hola` precarga:** Mejor UX en WhatsApp inbound. Out of scope — D-10 sin precarga (decisión usuario).
- **2 cron runs diarios (10:30 + 14:30):** Distribución temporal del envío. Out of scope — D-15 1 solo run.

</deferred>

---

*Standalone: godentist-blast-sms-experiment*
*Context gathered: 2026-04-28*
