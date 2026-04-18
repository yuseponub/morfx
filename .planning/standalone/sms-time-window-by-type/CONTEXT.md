# SMS Time Window — Diferenciación Transaccional vs Marketing

**Gathered:** 2026-04-17 21:30 COT
**Decisions locked:** 2026-04-17
**Status:** Ready for research/planning
**Type:** Standalone (no phase number)
**Trigger:** Bloqueo 9:18 PM de SMS transaccional de pipeline logística (debug `sms-onurix-not-delivered`). El guard actual bloquea TODO SMS fuera 8AM-9PM sin distinguir naturaleza.

<domain>
## Phase Boundary

El guard actual en `src/lib/domain/sms.ts:88` aplica `isWithinSMSWindow()` (8 AM - 9 PM Colombia) a **todos** los SMS. Esto es excesivamente restrictivo: la normativa colombiana solo restringe horario a SMS promocionales/publicitarios — los transaccionales están exentos y pueden enviarse 24/7.

**Impacto actual (observado):**
- Automation de pipeline logística "OFI INTER" disparada 9:18 PM (post-ventana) → SMS bloqueado.
- Automation de Shopify "confirmar compra por WhatsApp" → cualquier cliente que compre de noche no recibe el SMS de confirmación.
- Todos los SMS de estatus de envío, guías, OTP, etc. pierden disponibilidad 11 horas al día.

**Objetivo del standalone:**

1. Diferenciar SMS transaccionales (24/7 permitido) vs SMS marketing (sujeto a ventana).
2. Bypass automático del guard para cualquier SMS originado por automations/domain-calls/scripts internos — son inherentemente transaccionales por naturaleza del trigger.
3. Mantener el guard operativo (pero restricto a marketing únicamente) para el día que exista módulo de campañas.
4. Defender la compliance por **contrato** (campo `source` obligatorio en callers) en vez de por **guard genérico** bloqueante.

**Fuera de alcance:**
- Ajustar `isWithinMarketingSMSWindow` a la norma correcta L-V/Sáb/Dom (deferred al día que exista módulo de campañas — por ahora sólo se renombra).
- Segmentación por día (weekday/weekend/festivo) en el guard.
- Cola de retry para marketing bloqueado fuera de ventana.
- Clasificación ML de contenido (innecesaria — la naturaleza viene del origen, no del texto).
- UI de campañas marketing / checkbox "es marketing" (YAGNI — no hay módulo de campañas todavía).
- Task C (test Onurix Error:1081) — standalone aparte.
- Billing refund en fallos — standalone aparte (`sms-refund-on-failure`).
- Auditoría 12 archivos Twilio pendiente — standalone `twilio-to-onurix-migration`.

</domain>

<decisions>
## Implementation Decisions — LOCKED

### D-01: Identificación del tipo (Opción B — derivar de `source`)

- **Regla:** El guard se aplica o no según el campo `source` ya existente en `SendSMSParams` y en `sms_messages`.
- **Mapping autoritativo:**
  - `source IN ('automation', 'domain-call', 'script')` → **transactional** → bypass guard (enviar 24/7).
  - `source IN ('campaign', 'marketing')` → **marketing** → aplica `isWithinMarketingSMSWindow()`.
  - `source IS NULL` o valor desconocido → tratar como **transactional** (ver D-02).
- **Rationale:** El campo `source` ya existe (`sms.ts:37` y migración foundation con default `'automation'`). Cero breaking changes en signature. La naturaleza transactional vs marketing emerge del origen del disparo, no del contenido. Opción A (nuevo param `smsType`) fue descartada por añadir fricción innecesaria; Opción C (quitar guard) descartada porque deja módulo futuro de campañas sin protección.
- **Implementación esperada:** helper `isTransactionalSource(source: string | null | undefined): boolean` en `src/lib/sms/utils.ts`, consumido por el guard en `domain/sms.ts`.

### D-02: Default para source NULL/desconocido (Permisivo + contrato)

- **Regla:** Si `source` es `NULL` o no está en la lista conocida → bypass guard (asumir transactional).
- **Defensa por contrato (no por guard):**
  - Migración: `ALTER TABLE sms_messages ALTER COLUMN source SET NOT NULL` (si no lo está ya) + mantener default `'automation'`.
  - Callers internos ya setean `source` explícitamente (`automation`, `domain-call`, `script`). Se audita en research phase que no hay paths sin `source`.
  - El día que exista módulo campañas, ESE caller DEBERÁ setear `source='campaign'` — el guard se activa entonces por contrato, no por default conservador.
- **Rationale:** Hoy el 100% de SMS enviados son transaccionales (no existe UI de campañas). El riesgo real de falso-negativo (bloquear un transaccional válido — ya pasó el 17/04 21:18) supera al riesgo teórico de falso-positivo (marketing fuera de horario — imposible hoy porque no hay canal que lo origine).
- **Trade-off aceptado:** Si alguien en el futuro agrega un envío de marketing sin setear `source='campaign'`, el guard no lo bloqueará. Esto se mitiga con code review de nuevos callers + tipado estricto.

### D-03: UI en automation builder (Implícito — sin checkbox)

- **Regla:** No se agrega checkbox "este SMS es marketing" al automation builder en este standalone.
- **Rationale:** No existe módulo de campañas hoy. Agregar UI ahora sería YAGNI. Todo lo que pasa por el builder es transaccional por definición del contexto de disparo (pipeline stage change, Shopify order, OTP, etc.).
- **Para el futuro:** Cuando se implemente módulo de campañas, ESE módulo tendrá su propia UI con `source='campaign'` por contrato. El builder actual queda intacto.

### D-04: Rename `isWithinSMSWindow` (Parcial — solo rename, no lógica)

- **Rename:** `isWithinSMSWindow()` → `isWithinMarketingSMSWindow()` en `src/lib/sms/utils.ts`.
- **Lógica SIN cambios en este standalone:** sigue retornando `colombiaHour >= 8 && colombiaHour < 21`.
- **Deferred (NO en este standalone):** ajustar a norma real (L-V 7AM-9PM, Sáb 8AM-8PM, Dom/festivos prohibido). Se hace cuando exista módulo de campañas — antes es dead code tuneado.
- **Rationale:** El rename deja claro cuál es el único caso de uso y evita que callers futuros la usen para bypass-incorrecto. Ajustar la lógica day-of-week hoy es prematuro — se optimizaría código que nadie ejecuta.

### D-05: Backfill de rows con `source` NULL

- **Regla:** Query exploratoria al inicio de research phase:
  ```sql
  SELECT COUNT(*) FROM sms_messages WHERE source IS NULL;
  ```
- **Si count = 0:** skip backfill, solo agregar NOT NULL constraint.
- **Si count > 0:** `UPDATE sms_messages SET source='automation' WHERE source IS NULL;` (todos los rows pre-feature fueron transaccionales — ya vimos el comportamiento en producción), luego NOT NULL.
- **Rationale:** La migración `20260316100000_sms_onurix_foundation.sql:94` ya definió default `'automation'`, así que probablemente count=0. Pero se confirma antes de tocar schema para respetar Regla 5 (migración antes de código).

### Claude's Discretion

- Nombre exacto del helper (`isTransactionalSource` vs `shouldBypassSMSWindow` vs otro).
- Lugar físico del helper (en `utils.ts` junto a `isWithinMarketingSMSWindow` o en `constants.ts`).
- Formato exacto del error message cuando un SMS marketing se bloquee (puede quedar igual al actual).
- Tests unitarios específicos a cubrir (el planner lo atomizará basado en research).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents DEBEN leer estos antes de planear/implementar.**

### Regulación Colombia
- `.planning/standalone/sms-time-window-by-type/CONTEXT.md §regulatory_context` — Tabla CRC Resolución 5111/2017 + Ley 1581/2012 (transactional vs marketing).

### Código actual a modificar
- `src/lib/domain/sms.ts:72-231` — función `sendSMS`, guard en líneas 87-93.
- `src/lib/domain/sms.ts:31-42` — `SendSMSParams` (campo `source?: string` ya existe).
- `src/lib/sms/utils.ts:56-66` — `isWithinSMSWindow()` a renombrar.

### Migraciones relevantes
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql:94` — `sms_messages.source` default `'automation'`.
- `supabase/migrations/20260418011321_sms_atomic_rpc.sql` — RPC atómico actual (no tocar, pero entender contrato).
- `supabase/migrations/20260418030000_sms_provider_state_raw.sql` — última migración aplicada (ordenamiento para nueva migración NOT NULL).

### Reglas de proyecto aplicables
- `CLAUDE.md` §"Regla 3: Domain Layer" — TODA mutación pasa por `src/lib/domain/`.
- `CLAUDE.md` §"Regla 5: Migración Antes de Deploy" — migración NOT NULL debe aplicarse en prod ANTES del push de código.
- `CLAUDE.md` §"Regla 1: Push a Vercel" — tras cambios de código.

### Standalones hermanos (contexto — no scope)
- `.planning/standalone/sms-billing-atomic-rpc/` — standalone reciente (completado).
- `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md` — auditoría pendiente (puede revelar paths de envío adicionales).
- `.planning/debug/sms-onurix-not-delivered.md` — debug que originó este standalone.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SendSMSParams.source?: string` en `src/lib/domain/sms.ts:37` — ya existe, solo hay que consumirlo en el guard.
- `sms_messages.source` columna con default `'automation'` — backing store listo.
- `formatColombianPhone` y `calculateSMSSegments` en `utils.ts` — patrón establecido para utilities en ese archivo (donde va `isTransactionalSource`).

### Established Patterns
- Domain layer como single source of truth (Regla 3): toda lógica de guard/validación vive en `src/lib/domain/sms.ts`, no en callers.
- Contract-first para fields sensibles: ver cómo `workspace_id` se valida en cada query del domain layer — mismo enfoque para `source`.
- Migraciones con default value compatible con código viejo (ver `20260418030000_sms_provider_state_raw.sql` para el template).

### Integration Points
- `src/lib/automations/action-executor.ts` — SMS dispatch desde automations (source='automation').
- `src/app/actions/sms.ts` — server actions (si existen, confirmar source='domain-call' o similar).
- `src/inngest/functions/*` — dispatchers async (source=?).
- Research phase DEBE auditar call sites de `domainSendSMS`/`sendSMS` para confirmar que todos setean `source`.

</code_context>

<specifics>
## Specific Ideas

- **Nombre neutro preferido para helper:** algo que exprese intent sin hardcodear lista de sources en el nombre. `isTransactionalSource(source)` es la dirección. La LISTA de sources transactional va como constante exportada en `src/lib/sms/constants.ts` (ya existe ese archivo).
- **Error message para bloqueo marketing:** mantener mensaje actual (`'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)'`) pero solo se dispara cuando `source` es marketing. Aceptable como UX temporal hasta que exista módulo de campañas con su propia UX.
- **Regla conductual crítica:** NUNCA introducir un `source` nuevo sin agregarlo a la lista `TRANSACTIONAL_SOURCES` o a `MARKETING_SOURCES` — código de review debe bloquear PRs que añadan strings literales fuera de esas constantes.

</specifics>

<regulatory_context>
## Contexto Regulatorio (Colombia) — preservado para referencia

**Normativa aplicable:**
- CRC Resolución 5111 de 2017 (modif. por 5372/2018) — regula mensajes comerciales no solicitados.
- Ley 1581 de 2012 (Habeas Data) — consentimiento para comunicaciones comerciales.
- SIC — Superintendencia de Industria y Comercio enforcement.

**Distinción clave:**

| Tipo | Definición | Restricción horaria |
|---|---|---|
| **Transaccional / Utilidad** | Mensaje derivado de una transacción o relación preexistente iniciada por el usuario. Incluye: confirmación de compra, OTPs, notificaciones de despacho/entrega, alertas de seguridad, recordatorios de citas, status de servicio. | **Sin restricción** — 24/7 permitido. El usuario solicitó la relación. |
| **Comercial / Marketing** | Mensaje de promoción, publicidad, oferta no solicitada individualmente. | Lunes-Viernes 7 AM - 9 PM; Sábado 8 AM - 8 PM; Domingo y festivos **prohibido**. |

**Nota sobre la lógica actual:** el código (8 AM - 9 PM todos los días) es incluso más conservador que la norma para marketing — no diferencia sábado ni domingo. Se decidió NO ajustar en este standalone (ver D-04) porque hoy no hay módulo de campañas que consuma la función. Se ajusta el día que exista.

</regulatory_context>

<files_affected>
## Files Affected (tentative — planner lo confirma)

- `src/lib/domain/sms.ts` — modificar guard (líneas 87-93) para condicionar según `isTransactionalSource(params.source)`.
- `src/lib/sms/utils.ts` — rename `isWithinSMSWindow` → `isWithinMarketingSMSWindow` + agregar helper `isTransactionalSource`.
- `src/lib/sms/constants.ts` — exportar constantes `TRANSACTIONAL_SOURCES`, `MARKETING_SOURCES`.
- `src/lib/automations/action-executor.ts` — confirmar que ya pasa `source: 'automation'` (debería).
- `src/app/actions/sms.ts` — auditar, forzar `source='domain-call'` si falta.
- `src/inngest/functions/*` — auditar call sites, forzar source explícito.
- `supabase/migrations/YYYYMMDDHHMMSS_sms_source_not_null.sql` — nueva migración: backfill si aplica + ALTER COLUMN SET NOT NULL.
- **Tests** — unit de `isTransactionalSource` para cada source conocido + NULL + unknown; integration de `sendSMS` con source='automation' fuera de ventana (debe enviarse) y source='campaign' fuera de ventana (debe bloquear).

</files_affected>

<pending_from_sms_onurix_not_delivered>
## PENDIENTES heredados del debug original (NO son scope de esta fase)

Mantenidos visibles para tracking. Cada uno es standalone aparte.

### 1. Task C — test directo Onurix (transitory vs persistent)
- **Status:** pending. Script: `scripts/test-onurix-sms.mjs`.
- **Cómo cerrarlo:** correr con celular prendido, confirmar si Error:1081 es único o persistente.
- **Prioridad:** baja — resuelto el guard, este standalone SMS marketing-vs-transactional deja de depender de esa prueba.

### 2. Billing policy para SMS fallidos
- Gap de política: cobro en fallo (pagas intento) vs refund automático.
- **Acción:** abrir standalone `sms-refund-on-failure`. P2.

### 3. Auditoría 12 archivos Twilio pendientes
- **Referencia:** `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md`.
- **Relación:** baja. Si la auditoría revela paths alternos de envío SMS, esos también deben respetar la distinción source-based.

### 4. Columna `provider_state_raw` — **COMPLETADO** (commit `97af3c7`).

### 5. Row huérfano
- `sms_messages.id = a5a7ce83-ef45-4c33-a511-d68b6de86c2e` con `provider_state_raw = NULL`.
- Backfill opcional: `UPDATE sms_messages SET provider_state_raw = 'Error:1081 msg: Destino inaccesible' WHERE id = 'a5a7ce83-ef45-4c33-a511-d68b6de86c2e';`

</pending_from_sms_onurix_not_delivered>

<deferred>
## Deferred Ideas (fuera de scope, capturadas para futuro)

- **Ajustar `isWithinMarketingSMSWindow` a norma real** (L-V 7-9PM, Sáb 8-8, Dom/festivos prohibido) — se hace cuando exista módulo de campañas.
- **Checkbox "es marketing" en automation builder** — cuando exista necesidad real de marketing desde builder.
- **Cola de retry para marketing bloqueado** — cuando exista módulo de campañas con volumen.
- **Módulo de campañas marketing completo** — fuera totalmente de esta fase; es una milestone aparte.
- **Clasificación ML de contenido** — descartada por diseño (la naturaleza viene del origen, no del texto).

</deferred>

<references>
## Referencias

- Debug session que originó este standalone: `.planning/debug/sms-onurix-not-delivered.md`
- Migración SMS Onurix foundation: `supabase/migrations/20260316100000_sms_onurix_foundation.sql`
- Migración billing atomic RPC: `supabase/migrations/20260418011321_sms_atomic_rpc.sql`
- Migración observabilidad state raw: `supabase/migrations/20260418030000_sms_provider_state_raw.sql`
- Domain SMS entry point: `src/lib/domain/sms.ts:72-231` (sendSMS)
- Guard actual a modificar: `src/lib/domain/sms.ts:87-93` + `src/lib/sms/utils.ts:isWithinSMSWindow`
- Standalone hermano (billing atomic): `.planning/standalone/sms-billing-atomic-rpc/`
- Standalone hermano (migración Twilio→Onurix): `.planning/standalone/twilio-to-onurix-migration/`
- CLAUDE.md Regla 5: migración antes de código en producción
- CLAUDE.md Regla 1: push a Vercel tras cambios de código
- CLAUDE.md Regla 3: mutaciones por domain layer

</references>

<next_command>
## Siguiente paso

`/gsd-research-phase sms-time-window-by-type` — investigar:

1. Query de producción: `SELECT source, COUNT(*) FROM sms_messages GROUP BY source` para confirmar universo de values.
2. Grep de todos los call sites de `domainSendSMS`/`sendSMS` — confirmar que cada uno ya setea `source`.
3. Validar que ningún inngest/webhook/script envía SMS sin pasar por `domain/sms.ts`.
4. Confirmar que no hay `source` literal fuera de las constantes.
5. Estado actual de la columna `source` — NOT NULL ya? Default `'automation'` aplicado?

Luego `/gsd-plan-phase sms-time-window-by-type` para atomizar en tareas con commits atómicos.

</next_command>

---

*Standalone: sms-time-window-by-type*
*Context gathered & decisions locked: 2026-04-17*
