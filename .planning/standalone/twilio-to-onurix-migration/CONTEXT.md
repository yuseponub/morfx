# Twilio → Onurix Migration - Context

**Gathered:** 2026-04-16
**Status:** Ready for research/planning
**Type:** Standalone (no phase number)

<domain>
## Phase Boundary

Retirar completamente Twilio del sistema y consolidar todo el envío SMS por Onurix (ya validado en producción 2026-04-16). Alcance fijo:

1. Migrar 4 automations en DB al action type unificado `send_sms` (3 actuales Twilio `send_sms` + 1 REPARTO `send_sms_onurix`)
2. Eliminar 12 archivos `src/` con referencias Twilio + webhook `/api/webhooks/twilio/status`
3. Retirar dep npm `twilio` (`package.json` + lockfile)
4. Reemplazar la UI de integraciones: tab "Twilio" → tab "SMS" (balance Onurix + link super-admin)
5. Corregir el warning `checkTwilioConfigured` en actions-step (falso positivo hoy) por check real contra `sms_workspace_config.is_active`

**Fuera de alcance (deferred):**
- Backfill de status/cost de los 740 SMS Twilio históricos (30d) — se acepta deuda histórica
- Nuevas features SMS (plantillas, campañas masivas, SMS bidireccional)
- Feature flag de cutover (escala trivial: 4 autos, 1 workspace Somnio)

</domain>

<decisions>
## Implementation Decisions

### Cutover Strategy
- **D-01:** Cutover en **2 fases**, NO single deploy:
  - **Fase A (sin deploy de código):** Script standalone Node.js migra 4 automations en DB (`send_sms`/`send_sms_onurix` → `send_sms` unificado apuntando a Onurix). Validación manual con triggers reales de las 3 automations Twilio — Claude asiste al usuario verificando que el SMS llega vía Onurix (logs + `sms_messages.provider='onurix'`).
  - **Fase B (deploy de código):** PR único elimina 12 archivos `src/` + webhook + dep npm + reemplaza UI. Solo se mergea tras validación manual exitosa de Fase A.
- **D-02:** Migración via **script standalone Node.js** (`scripts/migrate-twilio-automations-to-onurix.mjs` o similar). Usa `createAdminClient()` + `jsonb_set` para actualizar `automations.actions`. Idempotente (rechequea type antes de actualizar). Sin migración SQL — es cambio de datos, no de schema.
- **D-03:** **Sin feature flag.** Justificación: escala trivial (4 autos, 1 workspace), Onurix validado con tests A/B/C + envío real, rollback disponible vía revert git del PR de código + script reverso para automations.
- **D-04:** **Validación manual pre-cutover:** disparar trigger de cada una de las 3 automations Twilio (GUIA TRANSPORTADORA, Inter, template final ultima) con contactos de prueba o datos reales controlados. Claude ayuda al usuario a confirmar que `sms_messages` inserta con `provider='onurix'`, status cambia a "Enviado" vía `sms-delivery-check` Inngest, y el cliente recibe el SMS con sender `MORFX`.

### Action Type Naming
- **D-05:** **Rename** `send_sms_onurix` → `send_sms` (un único action type para SMS). Implica actualizar 4 automations en DB (las 3 Twilio + REPARTO que ya es Onurix), `constants.ts:339-358`, `action-executor.ts:1076-1159`, y cualquier referencia en `automations.ts` / `actions-step.tsx`.
- **D-06:** **Categoría UI 'SMS'** (eliminar categoría 'Twilio'). Label de la acción: `"Enviar SMS"` (sin prefijo de proveedor). Ubicación en el catálogo: mantener categoría existente `SMS` en `actions-step.tsx:85-86`.
- **D-07:** Script de migración **actualiza todas las 4 automations por consistencia** (3 Twilio + REPARTO). Cero registros con `send_sms_onurix` legacy tras el script.

### Webhook + Historical Data
- **D-08:** **Eliminar `/api/webhooks/twilio/status`** en el mismo PR de limpieza. Twilio reintentará 24-48h hasta dejar de llamar. Sin stub intermedio — el webhook lleva roto 30 días sin afectar la app, no necesita graceful shutdown.
- **D-09:** **Sin backfill** de los 740 SMS huérfanos (status inicial + cost_cop NULL). Se acepta deuda histórica. Razón: Twilio se elimina, nadie consultará esos registros post-cutover, y el costo Twilio está visible en la consola Twilio para reconciliación contable si se requiere.
- **D-10:** **Retirar dep npm `twilio` del `package.json`** en el mismo PR. Correr `pnpm install` para actualizar `pnpm-lock.yaml`. Si queda algún import escondido, TS typecheck + build Vercel lo detectan antes del deploy.

### UI Cleanup
- **D-11:** **Reemplazar tab "Twilio"** por tab **"SMS"** en `/configuracion/integraciones` (visible a Owner/Admin). Contenido mínimo:
  - Balance actual del workspace (lee `sms_workspace_config.balance_cop`)
  - Precio por segmento ($97 COP)
  - Estado (`is_active`)
  - Link a super-admin para recarga (o instrucción de contactar soporte según scope del rol)
  - Opcional: gráfico de uso últimos 30d adaptado a Onurix (reutilizar layout de `twilio-usage.tsx` pero con queries Onurix)
- **D-12:** **Reemplazar `checkTwilioConfigured` + `twilioWarning`** por un check contra `sms_workspace_config` del workspace (is_active=true AND balance_cop >= $97). Warning amarillo solo si NO configurado. Link del warning lleva al nuevo tab SMS.
- **D-13:** **Adaptar `getSmsUsage` / `getSmsUsageChart`** en `src/app/actions/integrations.ts` a Onurix (queries contra `sms_messages WHERE provider='onurix' AND workspace_id=?` + `sms_transactions` para historial de recargas). Mantener en `integrations.ts` o mover a `src/app/actions/sms.ts` nueva — claude decide durante planning según convenciones del repo.

### Claude's Discretion
- Nombre exacto del script standalone y su ubicación en `scripts/`
- Orden interno del PR de limpieza (commits atómicos por área: domain → UI → deps)
- Manejo del bug R2 (`testTwilioConnection` roto) — se elimina junto con el form, no requiere fix intermedio
- Ajuste del comentario en `bold-form.tsx` (línea que menciona "copy of twilio-form") — editar o eliminar
- Decisión final sobre si el nuevo tab SMS queda en `src/app/actions/integrations.ts` o en un módulo nuevo `src/app/actions/sms.ts`
- Texto exacto del warning UI y copys en ES

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auditoría y contexto del phase
- `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md` — Contrato read-only, preguntas P1-P10, reglas aplicables
- `.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md` — Riesgos R0-R4, inventario de 12 archivos + webhook con decisión por archivo, respuestas a P1-P10 con evidencia file:line

### Reglas del proyecto
- `CLAUDE.md` §Regla 3 — Toda mutación via `src/lib/domain/` (el executor debe llamar `domainSendSMS()`, nunca Onurix client directo)
- `CLAUDE.md` §Regla 5 — Migraciones DB antes de deploy (aplicada ya por `20260316100000_sms_onurix_foundation.sql`; el script de migración de automations es data-only, no schema)
- `CLAUDE.md` §Regla 6 — Proteger agente en producción (740 SMS/30d activos = producción en uso; cutover en 2 fases con validación intermedia)
- `.claude/rules/code-changes.md` — Push a Vercel antes de pedir pruebas
- `.claude/rules/gsd-workflow.md` — Commits atómicos por tarea

### Módulo SMS (Onurix) ya construido — foundation
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql` — Schema `sms_messages` (renombró `twilio_sid` → `provider_message_id`, añadió `provider`, `cost_cop`, `source`, `contact_name`, `delivery_checked_at`), tablas `sms_workspace_config` + `sms_transactions`, RPCs `deduct_sms_balance` / `add_sms_balance`
- `src/lib/domain/sms.ts` — `sendSMS()` con flujo completo (admin client + workspace filter + balance RPC + Inngest event)
- `src/lib/sms/` — client Onurix, utils (`formatColombianPhone`, `isWithinSMSWindow`), constants (`SMS_PRICE_COP=97`), types
- `src/inngest/functions/sms-delivery-check.ts` — Verificación de estado a los 60s
- `src/app/super-admin/sms/` — Dashboard super-admin con recarga de saldo (plantilla de UI para el nuevo tab SMS)
- `scripts/test-onurix-sms.mjs` — Tests A+B (API directo, 200 OK + estado Enviado) — mantener como regresión
- `scripts/test-onurix-domain.mjs` — Test C (flujo domain, dedujo $97 exactos) — mantener como regresión

### Código Twilio a retirar (inventario completo)
Ver `AUDIT-REPORT.md` §Inventario por archivo (12 + webhook). Resumen:
- `src/lib/twilio/client.ts`, `src/lib/twilio/types.ts` — Eliminar
- `src/app/api/webhooks/twilio/status/route.ts` — Eliminar
- `src/app/actions/integrations.ts` — Retirar funciones Twilio (`saveTwilioIntegration`, `testTwilioConnection`, `getTwilioIntegration`). Adaptar `getSmsUsage` / `getSmsUsageChart` a Onurix
- `src/app/(dashboard)/configuracion/integraciones/page.tsx` — Tab Twilio → tab SMS
- `src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx` — Eliminar
- `src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx` — Eliminar o renombrar/reescribir como `sms-usage.tsx` (Claude decide)
- `src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx` — Solo comentario a editar
- `src/lib/automations/action-executor.ts:1076-1159` — Retirar `executeSendSmsTwilio` + imports Twilio, renombrar `executeSendSmsOnurix` → handler de `send_sms`
- `src/lib/automations/constants.ts:339-358` — Eliminar entry `send_sms` (Twilio), renombrar `send_sms_onurix` → `send_sms` con category `SMS`
- `src/app/actions/automations.ts:944-964` — Eliminar `checkTwilioConfigured`
- `src/app/(dashboard)/automatizaciones/components/actions-step.tsx:52,85-86,1532` — Retirar categoría Twilio, reemplazar `twilioWarning` por check sobre `sms_workspace_config.is_active`
- `package.json:84` + `pnpm-lock.yaml` — Retirar dep `twilio`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`sendSMS()` domain layer** (`src/lib/domain/sms.ts`): action executor ya puede rutar todo ahí. Cero cambios en domain layer para esta migración.
- **`sms-delivery-check` Inngest function**: reemplaza el webhook Twilio con polling de estado a los 60s contra `GET /api/v1/messages-state` de Onurix. Ya funciona para los SMS validados.
- **Super-admin SMS dashboard** (`src/app/super-admin/sms/`): plantilla para el nuevo tab SMS en integraciones (queries, layout, UX de recarga) — adaptar a scope workspace admin.
- **`formatColombianPhone()`**: normaliza números a `57XXXXXXXXXX`. Ya usado por Onurix, no requiere cambios.

### Established Patterns
- **Action handlers** en `action-executor.ts`: función por action type, toma `action.params` + `context`, retorna `ActionResult`. El nuevo handler de `send_sms` sigue el patrón existente de `executeSendSmsOnurix`.
- **Categorías de acciones** en `constants.ts`: array con `{ type, label, category, paramsSchema }`. Cambio = editar entry + actualizar UI que agrupa por `category`.
- **Script standalone** en `scripts/`: convención `scripts/{nombre}.mjs` con `import { createClient } from '@supabase/supabase-js'` + env vars. Precedente: `scripts/test-onurix-domain.mjs`.
- **Tests de regresión**: invocados via `node --env-file=.env.local scripts/...`. Mantener vigentes post-migración para detectar regresiones Onurix.

### Integration Points
- **Supabase `automations` table**: `actions` es `jsonb` array. Rename action type requiere `jsonb_set(actions, '{i,type}', '"send_sms"')` por cada elemento donde `type IN ('send_sms','send_sms_onurix')`. Workspace filter obligatorio (Regla 3) aunque todas las 4 autos estén en Somnio.
- **Vercel env vars**: `ONURIX_CLIENT_ID` + `ONURIX_API_KEY` ya configurados. Confirmar en Vercel dashboard si hay `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` sobrantes — retirar post-cutover (P7 auditoría).
- **Webhook Twilio endpoint**: tras eliminar ruta, Twilio seguirá POSTeando hasta que retiremos el endpoint URL en la consola Twilio (acción manual del usuario, post-deploy).

</code_context>

<specifics>
## Specific Ideas

- "La idea es eliminar Twilio sin más" (usuario, 2026-04-16) — rutaje de decisiones favorece simplicidad y consolidación (1 action type, 1 categoría UI, 1 proveedor).
- REPARTO usando `send_sms_onurix` fue una sorpresa para el usuario — investigar en research-phase si fue configurado por el usuario o por un proceso anterior. No bloqueante para migrar.
- Cutover en 2 fases replica el patrón de Regla 6: data migration + validación humana asistida + deploy de código solo tras go/no-go del usuario.

</specifics>

<deferred>
## Deferred Ideas

- **Backfill histórico de 740 SMS Twilio**: si en algún momento se necesitan métricas/reportes que incluyan estos registros, crear phase separado con script que consume Twilio API (requiere mantener dep temporalmente).
- **Retirada de env vars Twilio en Vercel**: acción manual del usuario tras deploy — no requiere código. Listar en LEARNINGS al cerrar la fase.
- **Plantillas SMS, campañas masivas, SMS bidireccional**: features nuevas fuera de scope de la migración.
- **Tab SMS en workspaces que NO tienen `sms_workspace_config`**: hoy solo Somnio. Flujo de alta de SMS para nuevos workspaces (onboarding) queda para phase posterior.
- **Test E2E de action `send_sms` via automation**: no existe hoy. Tests A/B/C cubren API y domain pero no el full path desde trigger → action-executor. Agregar en phase de hardening posterior.

</deferred>

---

*Project: twilio-to-onurix-migration (standalone)*
*Context gathered: 2026-04-16*
