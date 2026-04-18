---
slug: sms-onurix-not-delivered
title: SMS reportado como "sent" con billing correcto, pero no llega al celular
date: 2026-04-17
status: root_cause_identified
severity: P1
related_phase: twilio-to-onurix-migration/04
trigger: manual-report
goal: find_and_fix
tdd_mode: false
---

# SMS enviado según logs pero no recibido en el celular

## Current Focus

**hypothesis:** El SMS fue aceptado por Onurix (`status=1` del endpoint `/sms/send`) y el billing funcionó correctamente (cost_cop=97, RPC atómico OK). Pero **Onurix reportar `status=1` en el send response NO significa entrega al handset** — solo significa "aceptado en cola". La entrega real se valida por el inngest `sms-delivery-check` leyendo `/messages-state`, que actualiza `sms_messages.status` a `delivered` o `failed` ~60s después. **Lo que el action-executor retornó al usuario (`status: "sent"`) es el valor hardcodeado en `domain/sms.ts:223`, NO el estado real final.** El `status` real en la fila DB (columna `status`) podría ser `failed` si el inngest ya corrió, o seguir en `sent` si el inngest no corrió o falló.

**next_action:** Pedir al usuario que ejecute UN SOLO query SQL en Supabase dashboard para extraer el row completo de `sms_messages` id=a5a7ce83-ef45-4c33-a511-d68b6de86c2e. Con esa fila podemos decidir entre 5 hipótesis restantes en un paso.

## Symptoms

El usuario ejecutó una automatización que dispara un SMS al final del flujo. El log de la automatización reporta éxito completo:

**Datos del trigger (automatización):**
- `dispatchId`: 5a6dcf7f-effe-4a94-96db-067f386b2738
- `smsMessageId`: a5a7ce83-ef45-4c33-a511-d68b6de86c2e
- `workspaceId`: a3843b3f-c337-4836-92b5-89c58bb98490
- `contactId`: 73203542-69d0-464c-8b63-638a0fc135fc
- `contactPhone`: +573137549286
- `orderId`: de804174-1551-4428-960f-5136fe980706

**Resultado reportado por la acción SMS:**
```json
{
  "status": "sent",
  "costCop": 97,
  "dispatchId": "5a6dcf7f-effe-4a94-96db-067f386b2738",
  "segmentsUsed": 1,
  "smsMessageId": "a5a7ce83-ef45-4c33-a511-d68b6de86c2e"
}
```

**Observación crítica del usuario:** "la automatizacion dice que se envio el sms pero yo no lo recibi"

## Contexto relevante

1. **Migración Twilio → Onurix validada 2026-04-16** (3 tests pasaron — ver `.planning/standalone/twilio-to-onurix-migration/04-SUMMARY.md`).
2. **Auditoría de 12 archivos Twilio aún pendiente** — mandato en `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md`. Podría haber código Twilio residual activo en paths que no se migraron.
3. **Refactor reciente de sendSMS a RPC atómico** — commits:
   - `fb60c2d` — research (plpgsql RPC patterns)
   - `6051e2f` — 5 plans across 3 waves
   - `d2cf2b3` — migration atomic SMS billing
   - `d422f82` — refactor sendSMS to atomic RPC + defensive fallback
4. **Sesión de debug anterior (`sms-billing-inconsistency`) cerrada root-cause-identified:** el billing usaba insert + RPC no atómicos. El commit `d422f82` fue el fix.
5. **cost_cop=97 en este caso** → significa que `credits=1` en la respuesta de Onurix, y el decremento sí pasó. Billing funciona. El problema es otro.

## Hipótesis iniciales

1. **Onurix aceptó el request pero no entregó al carrier** — el `status='sent'` en Onurix significa "accepted for delivery", no "delivered to handset". El `delivery_check` asíncrono (inngest) todavía no ha corrido o retornó `failed` después de esto.

2. **Número mal formateado a Onurix** — `+573137549286` debería ir sin el `+` (Onurix espera formato `573137549286`). Si llega con `+` Onurix puede rechazar silenciosamente o enviar a un número mal routeado.

3. **Dispatch fue a Twilio (residual), no a Onurix** — algún path de la auditoría pendiente todavía usa Twilio y Twilio falló silenciosamente. Verificar `provider` column del row.

4. **Contenido del SMS marcado como spam por operador** — Claro/Movistar/Tigo filtran SMS que parecen promocionales o con URLs. Ver el body del SMS enviado.

5. **Template o variables sin reemplazar** — el SMS se envió con placeholders literales `{{nombre}}` que el operador rechaza.

6. **Balance insuficiente + `allow_negative_balance=true`** — el RPC decrementó pero Onurix realmente rechazó por crédito insuficiente de nuestro lado en Onurix (cuenta distinta a nuestro balance interno). Improbable porque el status dice 'sent'.

7. **Inngest fire-and-forget del delivery check nunca corrió** — por lo tanto sabemos que Onurix dijo "sent" pero no sabemos si el carrier confirmó. Estado real podría ser `failed` sin actualizar.

## Archivos sospechosos

- `src/lib/domain/sms.ts` — ruta única de insert a `sms_messages` + llamada a RPC atómico.
- `src/lib/sms/client.ts` — cliente Onurix (sendOnurixSMS).
- `src/lib/sms/types.ts` / `src/lib/sms/constants.ts` — formato de números, endpoints.
- `src/inngest/functions/sms-delivery-check.ts` — chequeo asíncrono de delivery status.
- `src/lib/automations/action-executor.ts` — handler `executeSendSms`.
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql` — schema tabla sms_messages.
- `supabase/migrations/2026041*_*.sql` — migración del RPC atómico reciente.
- Los 12 archivos Twilio pendientes de auditoría.

## Evidence

- **2026-04-17 investigation — code trace (read-only):**

- `src/lib/domain/sms.ts:72-231` — `sendSMS(ctx, params)` flow:
  1. `formatColombianPhone(phone)` (line 82) normaliza `+573137549286` a `573137549286` (strips `+`).
  2. Time window check (line 88).
  3. Lee `sms_workspace_config` balance.
  4. **`await sendOnurixSMS(formattedPhone, message)`** (line 125) — llamada síncrona al endpoint Onurix `/api/v1/sms/send`. Si este call devuelve `status != 1`, `sendOnurixSMS` tira error (client.ts:54). Por lo tanto el hecho que llegamos a la línea 125 y NO tiramos error significa que Onurix respondió `status=1` (accepted).
  5. **Calcula `segmentsUsed` = Number(credits) || 1** (line 129). Como cost_cop=97 en el resultado, credits=1. Si Onurix hubiera devuelto credits raros, habría logueado warn `[SMS] Onurix returned invalid credits, falling back to 1`.
  6. RPC atómico `insert_and_deduct_sms_message` inserta `sms_messages` row con **`status='sent'` hardcodeado** (migración 20260418011321 línea 91) y **`provider='onurix'` hardcodeado** (migración línea 90).
  7. **Return hardcodea `status: 'sent' as SmsStatus`** (line 222). Este es el valor que vio el usuario en el log de automatización. NO refleja estado real de entrega.
  8. Dispara inngest `sms/delivery.check` fire-and-forget (línea 204) con try/catch — si falla, loguea pero no rompe el flujo.

- `src/lib/sms/utils.ts:18-38` — `formatColombianPhone` SÍ strippa el `+`. `+573137549286` → `573137549286`. **Hipótesis 2 eliminada.**

- `src/lib/sms/client.ts:23-59` — `sendOnurixSMS` usa form-urlencoded body con `phone=573137549286` (SIN `+`). Tira error si `data.status !== 1`. Por lo tanto en este caso Onurix devolvió `status=1`.

- `src/lib/automations/action-executor.ts:205-210, 1083-1108` — el action handler `executeSendSms` SOLO llama a `domainSendSMS`. NO hay path alternativo. **Hipótesis 3 (dispatch a Twilio) eliminada** — `grep -r "twilio" src/` solo matchea un comentario en `action-executor.ts:1079` (legacy mediaUrl ignorado). NO hay Twilio client activo.

- `src/inngest/functions/sms-delivery-check.ts:18-79` — inngest handler que:
  - Espera 10s → llama `checkOnurixStatus(dispatchId)`.
  - Si `state === 'Enviado'` → `UPDATE sms_messages SET status='delivered', delivery_checked_at=NOW()`.
  - Si no → espera 50s más → re-check.
  - Si en segundo check `state !== 'Enviado'` → `UPDATE sms_messages SET status='failed', delivery_checked_at=NOW()`.
  - Registrado en `src/app/api/inngest/route.ts:28,60` (verificado).

- `supabase/migrations/20260418011321_sms_atomic_rpc.sql:85-94` — RPC hardcodea `provider='onurix'` e `status='sent'` al insertar. Confirma ruta Onurix.

- `grep -r "twilio\\.messages\\.create|TwilioClient|new Twilio" src/` — **0 matches** en código fuente activo. Todo está en `.claude/worktrees/` (docs) o `.planning/` (archivos de planificación).

- **Formato del número:** el número se envía a Onurix como `573137549286` (sin `+`). Onurix confirmó `status=1`. Descartado como causa.

- **Estado inicial del row:** no lo sabemos. Necesitamos leer la fila `sms_messages.id = a5a7ce83-ef45-4c33-a511-d68b6de86c2e` para confirmar:
  - `status` final (`sent` = inngest no corrió; `delivered` = Onurix confirmó; `failed` = Onurix reportó no-Enviado).
  - `delivery_checked_at` (si es NULL, inngest nunca corrió o está pendiente; si tiene timestamp, ya corrió).
  - `provider` (debería ser `'onurix'` — confirmar).
  - `body` (ver si tiene placeholders sin reemplazar estilo `{{nombre}}`).
  - `to_number` (debería ser `573137549286`).

## Eliminated Hypotheses

- **Hipótesis 2 (formato número con `+`)** — `formatColombianPhone` en utils.ts strippa el `+` antes de enviar a Onurix. Onurix recibió `573137549286`.
- **Hipótesis 3 (dispatch fue a Twilio)** — no hay código Twilio activo en `src/`. RPC atómico hardcodea `provider='onurix'`.

## Root Cause

**Onurix `/messages-state` devolvió:** `"Error:1081 msg: Destino inaccesible"` para dispatch_id `5a6dcf7f-effe-4a94-96db-067f386b2738`.

**Traducción:** el carrier destino (Claro/Movistar/Tigo) reportó al gateway Onurix que el número `573137549286` NO fue alcanzable en ese momento. Esto es independiente del contenido del SMS, del sender alfanumérico y del billing — el rechazo ocurrió a nivel de routing carrier antes de cualquier filtro de contenido.

**Evidencia consolidada:**

| Campo | Valor | Interpretación |
|---|---|---|
| `sms_messages.status` | `failed` | Inngest 2º check detectó ≠ 'Enviado' → marcó failed |
| `sms_messages.delivery_checked_at` | 2026-04-18 01:36:31 UTC | ~63s después del envío — flujo inngest OK |
| `sms_messages.provider` | `onurix` | Ruta correcta |
| `sms_messages.to_number` | `573137549286` | Formato correcto |
| `sms_messages.body` | "Tu ELIXIR DEL SUEÑO de SOMNIO... MORFX" | 141 chars, 1 segmento GSM7, sin placeholders |
| Onurix state textual | `"Error:1081 msg: Destino inaccesible"` | Rechazo del carrier |
| Onurix credits (post-fail) | `"0"` (string) | Onurix NO consumió crédito pero nuestro sistema SÍ cobró 97 COP |

**Hipótesis confirmada:** Hipótesis 1 (Onurix aceptó pero carrier rechazó).

**Hipótesis secundaria destapada (P2):** hay una **inconsistencia de billing en envíos fallidos**. Onurix reportó `credits: 0` post-fail, lo que sugiere que NO cobró externamente. Nuestro sistema cobró 97 COP al workspace. La política esperada debería ser:
- Opción A — "pagas por intento": dejar el cobro (el usuario acepta que intentos fallidos cuestan).
- Opción B — "pagas por entrega": refund automático al detectar state ≠ 'Enviado'.

No hay código de refund actualmente. Decisión queda al usuario.

## Causas posibles del error 1081

1. Celular sin señal/apagado en la ventana exacta del envío (más probable dado que es el número del usuario).
2. Trunk Onurix → operador caído en ese momento.
3. Número marcado como DND en el operador.
4. Issue intermitente de routing del gateway Onurix.

**Diagnóstico inmediato:** probar enviar un SMS ahora mismo (con celular prendido y señal) al mismo número. Si llega → era transitorio. Si falla de nuevo con 1081 → problema persistente a investigar con Onurix soporte.

## Resolution

**Fix de observabilidad (Task B):** agregar columnas `provider_state_raw` a `sms_messages` y poblarlas desde `sms-delivery-check.ts` para que los futuros fallos queden con el motivo exacto de Onurix en la base, sin necesidad de scripts ad-hoc.

**Fix de billing (fuera de scope de esta sesión, abrir sesión aparte):** decidir política de cobro en fallas (A o B arriba).

**Acción inmediata:** Task C — enviar SMS de prueba ahora para confirmar si el 1081 fue transitorio.

## Checkpoint — SQL query requerido al usuario

Para eliminar las hipótesis restantes (1, 4, 5, 6, 7) necesitamos ver la fila real en DB. Query a correr en Supabase SQL Editor (workspace Somnio):

```sql
-- QUERY 1: Fila completa del SMS
SELECT
  id,
  provider,
  provider_message_id,
  from_number,
  to_number,
  body,
  direction,
  status,
  segments,
  cost_cop,
  source,
  automation_execution_id,
  delivery_checked_at,
  created_at
FROM sms_messages
WHERE id = 'a5a7ce83-ef45-4c33-a511-d68b6de86c2e';

-- QUERY 2: Transacción de billing (confirmar el debit)
SELECT
  id, type, amount_cop, balance_after, description, created_at
FROM sms_balance_transactions
WHERE sms_message_id = 'a5a7ce83-ef45-4c33-a511-d68b6de86c2e';

-- QUERY 3: Estado actual del saldo
SELECT
  workspace_id, balance_cop, total_sms_sent, total_credits_used, is_active, allow_negative_balance, updated_at
FROM sms_workspace_config
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
```

**Qué esperamos de cada query:**

- **Query 1 — la más crítica.** Columnas clave:
  - `status`:
    - `sent` → inngest NO corrió o está pendiente (< 60s desde creación, o el inngest crashó). **Hipótesis 7 se confirma.**
    - `delivered` → Onurix confirmó entrega al carrier, **pero el operador/handset no lo mostró** (spam filter, buzón lleno, operador con delay). **Hipótesis 4 se activa.**
    - `failed` → segundo check de inngest no vio `state='Enviado'`. **Hipótesis 1 confirmada.**
  - `delivery_checked_at`: NULL = inngest no terminó. Timestamp = confirma cuándo.
  - `provider`: debería ser `onurix`. Si es otra cosa, alarma.
  - `body`: ver si contiene `{{` o `}}` literales → hipótesis 5.
  - `to_number`: debería ser `573137549286` (sin `+`, 12 dígitos).

- **Query 2:** confirma que el debit de billing ocurrió (hay transacción `sms_deduction` con `amount_cop=-97`).

- **Query 3:** ver balance actual y cuántos SMS se han enviado en total desde el workspace.

**Adicional:** abrir Vercel dashboard → Logs → buscar por `dispatchId=5a6dcf7f-effe-4a94-96db-067f386b2738` o `smsMessageId=a5a7ce83-ef45-4c33-a511-d68b6de86c2e` alrededor de las 20:35 COT del 2026-04-17. Buscar:

- Logs de Inngest del job `sms-delivery-check` (si no aparecen → inngest nunca recibió el evento).
- Warns/errors del tipo `[SMS] Onurix returned invalid credits` o `[SMS] Failed to emit delivery check event`.
- El raw response del send (no lo guardamos en DB, solo usamos `onurixResponse.id` y `onurixResponse.data.credits`). Si el log tiene el body JSON, es oro.
