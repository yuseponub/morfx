# AUDIT-REPORT: Migración Twilio → Onurix

**Fecha:** 2026-04-16
**Tipo:** Read-only (sin cambios de código)
**Alcance:** 12 archivos `src/` + webhook + migraciones + action-executor

---

## 🚨 Resumen ejecutivo

La migración Onurix **ya dejó al código Twilio en estado inconsistente** pero Twilio **sigue activo en producción**: 740 SMS últimos 30 días, último enviado hoy. Hay dos bugs schema-breaking rompiendo flujos silenciosamente (740 registros sin status update), y las dos acciones (`send_sms` Twilio + `send_sms_onurix`) coexisten confundiendo la UI.

Recomendación: migrar las 3 automatizaciones activas `send_sms` → `send_sms_onurix` con feature flag o validación explícita (Regla 6), validar envío real, luego retirar código Twilio. **NO es seguro eliminar Twilio en un solo deploy** — hay clientes recibiendo SMS vía Twilio diariamente.

---

## 🔴 Riesgos críticos (bloqueantes para seguir a GSD sin decidir antes)

### R0. TRÁFICO TWILIO ACTIVO EN PRODUCCIÓN (confirmado 2026-04-16)

- **740 SMS Twilio últimos 30 días** (query `sms_messages WHERE provider='twilio'`)
- **183 SMS últimos 7 días** · **Último: hoy 2026-04-16 20:09 UTC**
- Las 3 automatizaciones `send_sms` (P4) están disparando SMS reales a clientes **diariamente**.
- **Implicación #1:** NO se puede eliminar código Twilio ni webhook sin primero migrar las 3 automatizaciones — romper `send_sms` hoy = clientes sin notificación.
- **Implicación #2:** R1 ha estado fallando silenciosamente 30 días → los 740 registros en `sms_messages` tienen `status/price` desactualizado (sin updates del callback).
- **Implicación #3:** Regla 6 CLAUDE.md aplica con fuerza. Migración requiere:
  - Feature flag o confirmación explícita del usuario ANTES de cambiar comportamiento
  - Rollout: primero migrar automatizaciones a `send_sms_onurix` (backfill DB), validar con envío real, LUEGO eliminar código Twilio
  - O: renombrar action type (opción 2) que hace `send_sms` = Onurix en el mismo deploy

### R1. Webhook Twilio está roto desde la migración Onurix (2026-03-16)

- `src/app/api/webhooks/twilio/status/route.ts:54` ejecuta `.eq('twilio_sid', messageSid)`.
- La migración `supabase/migrations/20260316100000_sms_onurix_foundation.sql:45` **RENOMBRÓ** `twilio_sid` → `provider_message_id` (y dropeó el índice/constraint).
- Efecto: cualquier status callback de Twilio matchea cero filas. Los SMS Twilio que se sigan enviando **NO actualizan precio/estado final** en DB.
- Regla 5 CLAUDE.md aplicada al revés: hay código en producción referenciando una columna que **ya no existe**.

### R2. `testTwilioConnection` está roto (inserta a columna inexistente)

- `src/app/actions/integrations.ts:200` inserta con `twilio_sid: message.sid`.
- Misma columna renombrada en R1. El INSERT **falla** — la UI "Probar conexión Twilio" ya no funciona.

### R3. Dos acciones SMS coexisten

- `send_sms` (Twilio SDK directo, `action-executor.ts:1087-1136` — viola Regla 3: NO pasa por domain)
- `send_sms_onurix` (via `domainSendSMS`, `action-executor.ts:1138-1159` — correcto)
- `constants.ts:339` y `:350` ambas registradas en catálogo.
- UI (`actions-step.tsx:85-86`) tiene categorías separadas `Twilio` y `SMS`.
- El executor de `send_sms` Twilio **sí inserta con `provider_message_id`** (línea 1122, schema correcto) — **pero el status callback R1 no la actualiza nunca.**

### R4. Comentarios engañosos en action-executor

- `action-executor.ts:1076-1086` dice "SMS Action — via Onurix domain layer" pero la función `executeSendSmsTwilio` debajo usa Twilio client directo.
- Riesgo: quien lea el archivo creerá que ya migró. **No migró.**

---

## 📋 Respuestas a las 10 preguntas del mandato

### P1. ¿`action-executor` usa domain `sendSMS()` Onurix o Twilio?

**Ambas.** Hay dos action types:
- `send_sms` → `executeSendSmsTwilio` (línea 1087) — usa `getTwilioConfig` + `createTwilioClient` + `client.messages.create` (no pasa por domain).
- `send_sms_onurix` → `executeSendSmsOnurix` (línea 1138) — llama `domainSendSMS()` correctamente.

### P2. ¿UI de integraciones muestra sección Twilio?

**Sí.** `src/app/(dashboard)/configuracion/integraciones/page.tsx:73-76` tiene tab `Twilio` con `<TwilioForm />` y `<TwilioUsage />`. Aún visible para Owner/Admin.

### P3. ¿Webhook `/api/webhooks/twilio/status` sigue recibiendo tráfico?

**Vercel API no expone logs runtime históricos** (solo live tail, Hobby/Pro). Proxy via Supabase ejecutado 2026-04-16:

| Métrica | Valor |
|---|---|
| SMS Twilio últimos 30 días | **740** |
| SMS Twilio últimos 7 días | **183** |
| Último SMS Twilio | **2026-04-16 20:09 UTC (hoy)** |

**Twilio está ACTIVO en producción.** El webhook está recibiendo tráfico real, pero el status callback falla silenciosamente (R1) → los 740 registros tienen `status/price` desactualizado. Ver R0 para implicaciones de migración.

Query ejecutada:
```sql
SELECT
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS twilio_msgs_30d,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS twilio_msgs_7d,
  MAX(created_at) AS last_twilio_msg
FROM sms_messages
WHERE provider = 'twilio';
```

### P4. ¿Automatizaciones en DB usan `send_sms` (Twilio) o `send_sms_onurix`?

**Query ejecutada 2026-04-16. Resultado: 4 automatizaciones, todas en workspace Somnio.**

| Automatización | ID | Tipo actual |
|---|---|---|
| GUIA TRANSPORTADORA | `f77bff5b-eef8-4c12-a5a7-4a4127837575` | `send_sms` (Twilio) |
| Inter | `24005a44-d97e-406e-bdac-f74dbb2b5786` | `send_sms` (Twilio) |
| template final ultima | `71c4f524-2c8b-4350-a96d-bbc8a258b6ff` | `send_sms` (Twilio) |
| REPARTO | `c24cde89-2f91-493c-8d5b-7cd7610490e8` | `send_sms_onurix` |

**3 automatizaciones pendientes de migrar.** Volumen trivial — opción 1 (backfill UPDATE en DB) es viable y limpia. Ambas acciones toman `body` + `to`, params compatibles.

Query original ejecutada:
```sql
SELECT id, name, workspace_id,
  (SELECT jsonb_agg(a->>'type') FROM jsonb_array_elements(actions::jsonb) a WHERE a->>'type' IN ('send_sms','send_sms_onurix'))
FROM automations
WHERE actions::text LIKE '%send_sms%';
```

### P5. ¿`src/app/actions/automations.ts` tiene lógica Twilio específica?

**Sí, una función:** `checkTwilioConfigured()` en línea 944-964 — verifica `integrations.type='twilio' AND is_active=true`. Llamada desde `actions-step.tsx:52,1532` para mostrar el warning amarillo.

Nota: este check se dispara cuando el usuario elige `send_sms_onurix` (categoría `SMS`), lo cual es **incorrecto** — Onurix no usa la tabla `integrations`, usa `sms_workspace_config`. El warning muestra falso positivo.

### P6. ¿`constants.ts` tiene metadata Twilio?

**Sí.** Línea 339-348: `type: 'send_sms', label: 'Enviar SMS (Twilio)', category: 'Twilio'`. El "fix" del plan 04 del sms-module fue **añadir** `send_sms_onurix` (línea 350-358) sin retirar `send_sms`. Los dos conviven.

### P7. ¿Env vars Twilio activas?

- `.env.example`: no contiene referencias Twilio (grep sin matches).
- `.env.local`: no legible desde auditoría.
- Credenciales Twilio viven en tabla `integrations.config` (workspace-level), no en env vars globales. Confirmar en Vercel dashboard si hay `TWILIO_*` sobrantes.

### P8. ¿Schema `sms_messages` Twilio vs Onurix colisiona?

**No hay colisión — es la MISMA tabla, ya transformada.**

Migración `20260316100000_sms_onurix_foundation.sql`:
- `twilio_sid` → **renombrado** a `provider_message_id` (nullable, sin UNIQUE)
- Añade `provider` (default 'onurix', backfill filas viejas a 'twilio')
- Añade `cost_cop`, `source`, `contact_name`, `delivery_checked_at`

**Datos históricos Twilio preservados** (con `provider='twilio'`). No hay migración de datos pendiente. **Pero** el código viejo (R1, R2) sigue apuntando a la columna renombrada.

### P9. ¿Callers de `src/lib/twilio/` fuera de los 12 archivos?

**No.** Grep `from '@/lib/twilio` devuelve solo:
- `src/lib/automations/action-executor.ts:17`
- `src/app/actions/integrations.ts:13-14`

Cero callers en `scripts/`, `inngest/`, tests u otros jobs. Retirada limpia.

### P10. ¿Feature flag dual Twilio/Onurix?

**No.** Grep `USE_ONURIX|USE_TWILIO|SMS_PROVIDER`: cero matches. No hay fallback, feature flag ni env-driven switching. La separación es por `action.type` (`send_sms` vs `send_sms_onurix`) — decisión del usuario al armar la automatización.

---

## 📁 Inventario por archivo (12 + webhook)

| # | Archivo | Propósito | Decisión sugerida |
|---|---------|-----------|-------------------|
| 1 | `src/lib/twilio/client.ts` | `getTwilioConfig` + `createTwilioClient` | **Eliminar** |
| 2 | `src/lib/twilio/types.ts` | `TwilioConfig`, `SmsMessage` (con `twilio_sid` desactualizado) | **Eliminar** |
| 3 | `src/app/api/webhooks/twilio/status/route.ts` | Status callback (R1 **roto**) | **Eliminar** tras confirmar 0 tráfico |
| 4 | `src/app/actions/integrations.ts` (parcial) | `saveTwilioIntegration`, `testTwilioConnection` (R2 **roto**), `getTwilioIntegration`, `getSmsUsage`, `getSmsUsageChart` | **Retirar funciones Twilio**; migrar `getSmsUsage`/`Chart` a Onurix o borrar (duplicado de super-admin SMS) |
| 5 | `src/app/(dashboard)/configuracion/integraciones/page.tsx` | Tab `Twilio` | **Eliminar tab** (mantener Shopify + BOLD) |
| 6 | `src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx` | Form credenciales Twilio | **Eliminar archivo** |
| 7 | `src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx` | Dashboard uso Twilio (USD) | **Eliminar archivo** (dashboard Onurix ya existe en super-admin) |
| 8 | `src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx` | Form BOLD (solo menciona "pattern: copy of twilio-form" en comentario) | **Editar comentario** solamente |
| 9 | `src/lib/automations/action-executor.ts` | Dispatcher + `executeSendSmsTwilio` + import `getTwilioConfig` | **Retirar** case `send_sms`, función `executeSendSmsTwilio`, imports Twilio. Mantener `send_sms_onurix`. |
| 10 | `src/lib/automations/constants.ts` | Catálogo con `send_sms` (Twilio) + `send_sms_onurix` | **Decidir:** eliminar `send_sms` entry (341-348), renombrar `send_sms_onurix` → `send_sms` con category `SMS`, o mantener ambas. Ver "Decisión pendiente" abajo. |
| 11 | `src/app/actions/automations.ts` | `checkTwilioConfigured` | **Eliminar función**; retirar uso en actions-step |
| 12 | `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` | Categoría `Twilio` + `SMS` + `twilioWarning` que chequea integración Twilio para acción Onurix | **Retirar** categoría Twilio, `twilioWarning` (o reemplazar por check de `sms_workspace_config.is_active`) |
| 13 | `package.json:84` | Dep `"twilio": "^5.12.1"` | **Eliminar dep** al final + `pnpm install` |

---

## ⚠️ Decisión pendiente antes del GSD

**¿Migrar automatizaciones existentes de `send_sms` (Twilio) a `send_sms_onurix`?**

Con 3 automatizaciones a migrar (P4), opción 1 es viable. Tres opciones:
1. **Backfill en DB** ✅ RECOMENDADA — UPDATE `automations` SET `actions` con jsonb_set cambiando `type='send_sms'` → `'send_sms_onurix'` para los 3 IDs. Params compatibles (`body` + `to`).
2. **Renombrar action type** — hacer que `send_sms` ya signifique Onurix. Cero migración de datos. Pero pierdes trazabilidad histórica ("esta automatización corrió Twilio antes de fecha X").
3. **Mantener ambos types, deprecar `send_sms`** — bloquear en UI pero dejar que ejecuten hasta que el usuario migre manualmente.

IDs a migrar si se elige opción 1:
- `f77bff5b-eef8-4c12-a5a7-4a4127837575` (GUIA TRANSPORTADORA)
- `24005a44-d97e-406e-bdac-f74dbb2b5786` (Inter)
- `71c4f524-2c8b-4350-a96d-bbc8a258b6ff` (template final ultima)

---

## ✅ Validación Onurix (contexto del mandato, ya confirmado)

- Domain layer `src/lib/domain/sms.ts` correcto (createAdminClient, workspace filter, balance RPC, Inngest event).
- Scripts `scripts/test-onurix-sms.mjs` + `scripts/test-onurix-domain.mjs` presentes.
- Migración `20260316100000_sms_onurix_foundation.sql` aplicada (tablas + RPCs).
- 1 workspace con SMS activo (Somnio, saldo ~$49,903 COP).

---

## 🎯 Siguiente paso (post-aprobación del reporte)

1. ✅ Query P4 ejecutada — 3 automatizaciones Twilio identificadas (Somnio).
2. ✅ Query P3 ejecutada — 740 SMS/30d confirmados. Twilio ACTIVO en producción.
3. Arrancar `/gsd:discuss-phase` con **foco en Regla 6** (agente en producción protegido). Decisiones a tomar:
   - **Orden del rollout:** ¿migrar automatizaciones primero + validar con 1 SMS real + eliminar Twilio? ¿o rename action type `send_sms` = Onurix en un deploy?
   - **Feature flag:** ¿`USE_ONURIX_FOR_SEND_SMS` env var como switch durante 24-48h? ¿o solo cutover directo tras validación?
   - **Webhook R1:** ¿dejar respondiendo 200 sin hacer nada hasta deleción final? ¿o añadir log de deprecation mientras llegue tráfico?
   - **`twilio-usage.tsx`:** ¿adaptar a Onurix o borrar (super-admin ya tiene dashboard)?
   - **Dep `twilio`:** ¿retirar en mismo phase o después de 1 semana de monitoreo?
4. **NO hacer cambios** hasta aprobación + plan GSD. Twilio corriendo hoy no debe romperse.

---

**Auditoría read-only completada. Cero cambios de código.**
