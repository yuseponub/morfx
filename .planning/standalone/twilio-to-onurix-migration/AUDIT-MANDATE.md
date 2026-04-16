# Auditoría: Migración Twilio → Onurix

> ## 🛑 EMPIEZA AQUÍ — CONTRATO DE LA AUDITORÍA
>
> 1. **READ-ONLY.** NO modificar código. NO correr migraciones. NO tocar env vars. NO ejecutar scripts que envíen SMS reales (los tests ya pasaron).
> 2. **Output único:** `.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md`.
> 3. **Alcance:** responder las 10 preguntas de la sección 2 con evidencia del código actual (file:line).
> 4. **Verificar antes de asertar** — este documento se escribió el 2026-04-16; la memoria puede estar desactualizada. Comparar cada claim contra el código vivo antes de repetirlo en el reporte.
> 5. **Si encuentras algo bloqueante** (colisión de schema, tráfico activo en webhook Twilio, automatizaciones rotas), pon el hallazgo en la sección "Riesgos" del reporte y PARA — no avances a GSD sin aprobación del usuario.
> 6. **NO arranques `/gsd:discuss-phase`** hasta que el usuario apruebe el reporte.
> 7. **Leer también:** `memory/onurix_twilio_migration.md` para contexto de tests ya corridos.

---

**Fecha captura de contexto:** 2026-04-16
**Trigger:** Onurix SMS aprobado (cuenta paga activa con sender ID `MORFX`)
**Estado del trabajo:** Auditoría pendiente. Siguiente sesión = auditoría completa.

---

## 1. Estado validado de Onurix (2026-04-16)

### Tests corridos y pasaron ✅

| Test | Qué validó | Resultado |
|---|---|---|
| A | `POST /api/v1/sms/send` directo | 200 OK, 919ms, `status=1`, dispatch_id devuelto |
| B | `GET /api/v1/messages-state` a los 10s | Estado `"Enviado"`, 1 crédito consumido |
| C | Flujo domain completo (send + insert `sms_messages` + RPC `deduct_sms_balance`) | Dedujo $97 exactos del saldo del workspace Somnio ($50,000 → $49,903) |

### Datos de la cuenta paga

- **Base URL:** `https://www.onurix.com/api/v1`
- **Env vars (en Vercel + `.env.local`):** `ONURIX_CLIENT_ID=7976`, `ONURIX_API_KEY` (secret)
- **Sender ID:** `MORFX` (aparece al final del mensaje)
- **Sin prefijo demo:** el `ONURIX.COM SMS DEMO:` ya no aparece
- **Formato número:** `57XXXXXXXXXX` (12 dígitos), normalizado por `formatColombianPhone()`
- **Precio al cliente:** $97 COP / segmento (const `SMS_PRICE_COP`)
- **Horario CRC:** 8 AM - 9 PM Colombia, enforced por `isWithinSMSWindow()`

### Scripts de test (mantener para regresión)

- `scripts/test-onurix-sms.mjs` — API directo (tests A + B)
- `scripts/test-onurix-domain.mjs` — flujo domain (test C)
- Ambos corren con `node --env-file=.env.local scripts/...`

### Módulo SMS (Onurix) ya construido

Standalone `sms-module` completado en 4 plans (2026-03-16):
- `src/lib/sms/` — client, utils, constants, types
- `src/lib/domain/sms.ts` — `sendSMS()` con flujo completo
- `src/inngest/functions/sms-delivery-check.ts` — verificación 60s
- `src/app/super-admin/sms/` — dashboard admin con recarga de saldo
- Migración `20260316100000_sms_onurix_foundation.sql` — tablas: `sms_messages`, `sms_workspace_config`, `sms_transactions`. RPCs: `deduct_sms_balance`, `add_sms_balance`

### Workspaces con config SMS (en producción)

- **Solo 1:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`), saldo $49,903 COP, active=true, allowNeg=true

---

## 2. Twilio — scope a auditar

### Archivos con `twilio|Twilio|TWILIO` en `src/` (12)

```
src/app/actions/integrations.ts
src/app/(dashboard)/configuracion/integraciones/page.tsx
src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx
src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx
src/app/(dashboard)/automatizaciones/components/actions-step.tsx
src/app/actions/automations.ts
src/app/api/webhooks/twilio/status/route.ts
src/lib/automations/action-executor.ts
src/lib/automations/constants.ts
src/lib/twilio/client.ts
src/lib/twilio/types.ts
```

Además: `package.json`, `pnpm-lock.yaml`, `package-lock.json` tienen dep `twilio`.
Migración histórica: `supabase/migrations/20260216000000_sms_messages.sql` (de Twilio original — ver si colisiona con la nueva schema de Onurix).

### Preguntas que la auditoría debe responder

**Fase de descubrimiento (read-only):**

1. **¿El action `send_sms` en `action-executor.ts` ya usa el domain `sendSMS()` (Onurix) o todavía pasa por Twilio?** — clave para saber si el reemplazo en automatizaciones ya está hecho o no.
2. **¿La UI de integraciones (`configuracion/integraciones`) muestra sección Twilio?** — decidir si eliminar o reemplazar por "SMS" (configuración apunta a `/super-admin/sms` para admins).
3. **¿El webhook `/api/webhooks/twilio/status` sigue recibiendo tráfico?** — revisar logs Vercel antes de borrar.
4. **¿Las automatizaciones existentes en la DB tienen `action.type === 'send_sms'` apuntando al formato viejo (Twilio params) o al nuevo (Onurix)?** — query Supabase.
5. **¿`src/app/actions/automations.ts` tiene lógica Twilio-específica que haya que retirar?**
6. **¿`constants.ts` tiene categoría/metadata de Twilio que ya debería ser "SMS/Onurix"?** — plan 04 de sms-module dijo que se arregló, verificar.
7. **¿Hay env vars Twilio en Vercel que sigan activas?** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, etc.) — listar para retirar después.
8. **¿La tabla legacy `sms_messages` de Twilio (migración 2026-02-16) es la misma que usa Onurix ahora o son tablas distintas?** — si hay colisión de schema, decidir migración de datos históricos.
9. **¿El módulo `src/lib/twilio/` tiene callers fuera de los 12 archivos listados (tests, scripts, jobs Inngest)?**
10. **¿Hay código dual (fallback Twilio → Onurix) escondido con feature flag?**

**Fase de planeación (después de auditoría):**

- Decidir si se eliminan archivos o se mantienen temporalmente con deprecation notice
- Mapear automatizaciones en producción que disparan SMS — validar que ninguna rompe
- Plan de retirada de env vars Twilio (solo después de 0 tráfico en webhook)
- Feature flag opcional si aún hay incertidumbre (aunque los tests ya pasaron, regla 6 de CLAUDE.md manda proteger producción)

---

## 3. Instrucciones para la próxima sesión

**Cuando el usuario haga `/clear` y regrese:**

1. Leer este archivo (`.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md`).
2. Correr la auditoría **read-only** — NO tocar código aún.
3. Producir un reporte estructurado:
   - **Por archivo** en `src/`: propósito, callers, decisión sugerida (eliminar / migrar / mantener)
   - **Por pregunta** (1–10 arriba): respuesta basada en evidencia del código
   - **Riesgos identificados** para producción
   - **Automatizaciones en producción** que usan send_sms (query a Supabase si aplica)
4. Entregar al usuario para aprobación antes de `/gsd:discuss-phase`.
5. **NO hacer cambios de código en la auditoría.** El output es un reporte; la implementación sale del GSD workflow posterior.

### Ubicación sugerida del reporte

`.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md`

---

## 4. Reglas CLAUDE.md que aplican

- **Regla 0:** GSD completo obligatorio — tras auditoría, flujo `/gsd:discuss-phase` → `/gsd:research-phase` → `/gsd:plan-phase` → `/gsd:execute-phase`
- **Regla 5:** Si se agregan columnas/tablas, migración antes de push
- **Regla 6:** Agente en producción protegido — el action `send_sms` que corre hoy no debe romperse durante el reemplazo. Si el cambio altera comportamiento, feature flag o confirmación explícita
- **Regla 3:** TODA mutación vía `src/lib/domain/` — el action executor debe llamar `sendSMS()` del domain, nunca Onurix client directo
