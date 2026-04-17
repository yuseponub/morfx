---
slug: sms-billing-inconsistency
title: SMS billing inconsistente — solo 1 de 2 SMS descontó balance
date: 2026-04-17
status: root_cause_identified
severity: P2
related_phase: twilio-to-onurix-migration/04
trigger: manual-report
goal: find_and_fix
tdd_mode: false
---

# SMS billing inconsistente post-cutover Onurix

## Current Focus

**Root cause identified:** el path de billing tiene dos defectos que, combinados, explican el síntoma. No hay trigger SQL ni código paralelo; solo `src/lib/domain/sms.ts` escribe `sms_messages` y decrementa balance vía RPC. La inconsistencia viene de (a) falta de fallback en `credits` y (b) insert + RPC no-transaccionales (dos calls separadas sin rollback).

**Next action:** aplicar fix mínimo (fallback `credits || 1`) como hotfix y plan largo plazo consolidar insert+RPC en un único RPC atómico (respeta Regla 3).

## Symptoms (pre-filled 2026-04-17)

Tras cierre del cutover Twilio → Onurix (commit `075d894`), disparé 2 automations ex-Twilio para validar D-04:

**`sms_messages` table:**
```
id                                    to_number     status     provider  cost_cop  created_at
1d992360-3ee8-4de3-837b-b59c6b0b0eea  573137549286  delivered  onurix    0.00      2026-04-17 15:01:46
fd8c23f7-e730-409f-bc36-8e318054a42e  573137549286  delivered  onurix    0.00      2026-04-17 15:00:58
```

**`sms_workspace_config.balance_cop`:**
- Antes: 50000
- Después: 49903 (diferencia: 97 COP = 1 mensaje)

## Discrepancia

- **2 SMS delivered** (ambos registrados, ambos via Onurix)
- **Solo 1 fue descontado** del balance (50000 → 49903)
- **Ambos tienen `cost_cop=0`** en la tabla `sms_messages`

## Hipótesis iniciales

1. **Race condition** — ambos SMS decrementaron balance, pero una de las UPDATEs perdió (optimistic locking sin retry). 48s entre mensajes hace este escenario improbable.
2. **Bug en el path de escritura de `cost_cop`** — el provider adapter `domainSendSMS` (o el wrapper Onurix) no está seteando `cost_cop` al insertar el registro. La segunda llamada podría no haber llegado al decremento de balance.
3. **Doble código de billing** — tal vez `balance_cop` se decrementa en un lugar (trigger SQL o función separada) y `cost_cop` en sms_messages se llena en otro (nunca). La función que decrementa pudo haber fallado en el segundo mensaje por algún flag.
4. **El primer SMS se envió durante una ventana donde el código viejo Twilio aún estaba en memoria** (edge runtime) y registró balance pero no cost_cop. El segundo falló al decrementar. Improbable — ambos llegaron con `provider='onurix'`.

## Archivos sospechosos (original)

- `src/lib/domain/sms/*` — domain layer SMS (creado en Plan 01, Fase A)
- `src/lib/onurix/*` — adapter Onurix
- `src/lib/automations/action-executor.ts` — `executeSendSms` handler (Plan 02)
- `src/app/actions/integrations.ts` — `getSmsUsage` (Plan 02) lee `cost_cop`; si la escritura nunca ocurre, la UI de usage va a mostrar gastos=0
- Trigger/función SQL en Supabase que decrementa `balance_cop` — verificar si existe y si corre para todos los inserts

## Evidence

### E1 — Topología del código (rectificada)

- SMS domain NO es un directorio (`src/lib/domain/sms/`), es un único archivo: `src/lib/domain/sms.ts`.
- Onurix adapter NO está en `src/lib/onurix/`, está en `src/lib/sms/client.ts` + `src/lib/sms/types.ts` + `src/lib/sms/constants.ts`.
- La única ruta de insert a `sms_messages` en runtime es `src/lib/domain/sms.ts:132-150`. `grep sms_messages src/` confirma cero inserts fuera del domain (solo reads + el update de status en `src/inngest/functions/sms-delivery-check.ts` que NO toca `cost_cop`).

### E2 — Constantes y aritmética confirman la escala

- `SMS_PRICE_COP = 97` en `src/lib/sms/constants.ts:7`.
- `50000 - 49903 = 97 = 1 × SMS_PRICE_COP` → exactamente una deducción ocurrió. La discrepancia es real (2 SMS registrados, solo 1 decremento).

### E3 — Ningún trigger SQL en `sms_messages`

- Migración `supabase/migrations/20260316000000_sms_messages.sql` crea la tabla con RLS pero ningún trigger.
- Migración `supabase/migrations/20260316100000_sms_onurix_foundation.sql` añade columnas (`cost_cop`, `provider`, `source`, `contact_name`, `delivery_checked_at`) y crea los RPCs `deduct_sms_balance`/`add_sms_balance`, pero tampoco crea trigger sobre `sms_messages`.
- `grep -r balance_cop supabase/` solo matchea los dos archivos anteriores y no hay función que lea/escriba `balance_cop` fuera de los dos RPCs.
- **Conclusión: el billing NO está en un trigger — vive enteramente en `src/lib/domain/sms.ts` llamando al RPC.** Esto descarta la Hipótesis 3.

### E4 — El flujo domain, leído literal

`src/lib/domain/sms.ts` (orden exacto):
1. Pre-check balance (línea 96-122).
2. `sendOnurixSMS(...)` → retorna `{ status, id, data: { state, credits, sms, phone } }` (línea 125).
3. **Cálculo sin fallback** (línea 128-129):
   ```ts
   const segmentsUsed = onurixResponse.data.credits
   const costCop = segmentsUsed * SMS_PRICE_COP
   ```
4. Insert a `sms_messages` con `cost_cop: costCop` (línea 132-150) — separado, primera operación de DB.
5. `supabase.rpc('deduct_sms_balance', { p_amount: costCop, ... })` (línea 169-177) — separado, segunda operación.
6. Si RPC falla: `console.error` y `console.warn`, sigue adelante (línea 179-185). El SMS ya está enviado, el código asume que es aceptable.
7. Inngest fire-and-forget para delivery check (línea 187-200).

### E5 — Discrepancia vs. el script de prueba

`scripts/test-onurix-domain.mjs:78` usa fallback: `const segments = sendData.data.credits || 1`. El domain NO. Esta divergencia es el smoking gun:
- Si Onurix respondió `credits: 0` (posible: free tier / promocional / error), el script de prueba escribe `cost_cop=97` y decrementa 97; el domain escribe `cost_cop=0` y decrementa 0.
- El domain lo sabíamos a partir del test summary (`.planning/standalone/twilio-to-onurix-migration/04-SUMMARY.md:85`): "cost_cop=0.00 en ambos SMS — decisión explícita del usuario de no bloquear el cierre de Plan 04".
- Ese summary ya identificaba la hipótesis — este debug la confirma: el defecto vive en `src/lib/domain/sms.ts:128-129`.

### E6 — Mecánica del 97 COP decremento

Con cost_cop=0 en ambos rows, `deduct_sms_balance` se llama dos veces con `p_amount=0`. El RPC NO tiene guard contra `p_amount=0`; aún así ejecuta `UPDATE sms_workspace_config SET balance_cop = balance_cop - 0` → no cambia el balance. Por tanto, si ese fuera el único defecto, el balance debería seguir en 50000, no 49903.

**Esto implica que hubo un tercer evento de decremento que no está en los dos rows visibles.** Candidatos:
- Otro SMS enviado entre "Antes: 50000" y "Después: 49903" que el usuario no incluyó en el snapshot (otra automation, otro script, o el mismo script `scripts/test-onurix-domain.mjs` ejecutado en el mismo workspace durante pruebas).
- Una fila en `sms_balance_transactions` con `amount_cop = -97` que no corresponde a un row en `sms_messages` con cost_cop>0 (la constraint `sms_message_id REFERENCES sms_messages(id) ON DELETE SET NULL` permite orfandad).
- Row borrado post-insert (improbable — no hay DELETE en el código de producción sobre `sms_messages`).

### E7 — Lo verificable en producción (SQL de diagnóstico)

```sql
-- A) ¿Cuántas transacciones de tipo 'sms_deduction' hubo en la ventana 15:00-15:05?
--    Si hay 2 con amount_cop=0 → confirma E5 (credits=0).
--    Si hay 3 (2 con amount_cop=0 + 1 con amount_cop=-97) → hay un tercer SMS fantasma.
--    Si hay 1 con amount_cop=-97 → solo 1 de los 2 RPCs se ejecutó.
select
  id,
  sms_message_id,
  amount_cop,
  balance_after,
  description,
  created_at
from sms_balance_transactions
where workspace_id = '<WORKSPACE_ID>'
  and type = 'sms_deduction'
  and created_at >= '2026-04-17 14:55:00-05'
  and created_at <= '2026-04-17 15:10:00-05'
order by created_at;

-- B) Contador interno: ¿cuántos SMS totales contó el RPC?
select total_sms_sent, total_credits_used, balance_cop
from sms_workspace_config
where workspace_id = '<WORKSPACE_ID>';
-- Si total_credits_used = 97 y total_sms_sent = 2, hay un SMS con cost_cop=97 que
-- sí se deducido pero no está entre los 2 rows visibles (o se sobrescribió a 0).
-- Si total_credits_used = 0 y total_sms_sent = 2, el 97 vino de otra parte (manual
-- adjustment, recharge negativo, o test script que decrementó y no logueó).
```

### E8 — Defectos reales en el código (independiente del 97 mystery)

Estos son defectos verificables en código estático:

**Defecto A — sin fallback en `credits`** (`src/lib/domain/sms.ts:128`):
```ts
const segmentsUsed = onurixResponse.data.credits  // 0/null/undefined → costCop=0
const costCop = segmentsUsed * SMS_PRICE_COP
```
Si Onurix devuelve `credits: 0` (posible por tier gratis, promo, bug de su API), el SMS se envía y se registra con cost_cop=0; el RPC se llama con p_amount=0 y el balance queda intacto. Silencioso.

**Defecto B — insert + RPC no atómicos** (`src/lib/domain/sms.ts:132-150` + `:169-177`):
Son dos calls separadas sin transacción. Cuatro escenarios patológicos:
- Insert OK + RPC network error → row existe con cost_cop=N, balance no decrementado.
- Insert OK + RPC retorna `success=false` (ej. `is_active=false` flipped mid-flight) → mismo resultado, sólo `console.warn`.
- Insert falla (línea 152) → sale early, balance no tocado, Onurix ya cobró externamente. Divergencia contable.
- Edge runtime interrumpido entre las dos calls → cualquier combinación anterior.

**Defecto C — RPC no tiene guard contra `p_amount=0`** (`supabase/migrations/20260316100000_sms_onurix_foundation.sql:149-201`):
- Si `p_amount=0`, el RPC ejecuta un UPDATE no-op pero INSERTA un row en `sms_balance_transactions` con `amount_cop=0`.
- También incrementa `total_sms_sent += 1` y `total_credits_used += 0` → pollute contador.

**Defecto D — `allow_negative_balance` default = true** (migración línea 15):
- Si la RPC falla por balance insuficiente, el domain code solo logea warn. Combinado con `allow_negative_balance=true`, nunca se frena un envío. En producción esto es política, pero amplifica B.

### E9 — Exposición en la UI

- `src/app/actions/integrations.ts:147-149` suma `cost_cop` sobre `sms_messages` filtrado por `provider='onurix'`. Con cost_cop=0 en todas las filas post-cutover, la UI de `getSmsUsage` va a reportar **gasto = $0 COP** indefinidamente mientras `balance_cop` se va erosionando por decrementos fantasma o correctos. Reporte inconsistente: "gasto acumulado 0, saldo bajando".
- `src/app/actions/sms.ts:143` idem para super-admin.
- Dashboard UI: `src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx` y `src/app/(dashboard)/sms/components/sms-history-table.tsx` van a mostrar `$0` o `-` en columna de costo para todos los mensajes post-cutover.

## Eliminated Hypotheses

- **Hipótesis 1 (race condition):** descartada. Los dos mensajes están a 48s. El RPC `deduct_sms_balance` toma `FOR UPDATE` lock (migración línea 165-167) → incluso si fueran concurrentes, se serializarían sin pérdida.
- **Hipótesis 3 (doble código de billing):** descartada. `grep balance_cop supabase/` y `grep deduct_sms_balance /` no retornan triggers ni otros callers en producción; solo `src/lib/domain/sms.ts:169` y el script de diagnóstico `scripts/test-onurix-domain.mjs:112`.
- **Hipótesis 4 (residuo Twilio en memoria):** descartada. `grep -r twilio src/` solo encuentra un comentario en `action-executor.ts:1079`. Cero código Twilio activo. Ambos rows traen `provider='onurix'` consistentemente.

## Hypothesis Retained

- **Hipótesis 2 (bug en path de `cost_cop`)** — confirmada en código: línea 128 del domain no tiene fallback, y el insert + RPC no son atómicos. El `credits=0` de Onurix propaga silenciosamente a cost_cop=0 y a un RPC no-op.

## Root Cause

**Defecto compuesto en `src/lib/domain/sms.ts`:**

1. **`credits` se usa sin fallback** (línea 128). Si Onurix retorna `credits: 0`, el pipeline registra `cost_cop=0` y llama al RPC con `p_amount=0` → balance no decrementa aunque el SMS sí fue enviado y cobrado externamente por Onurix.
2. **Insert + RPC no están envueltos en transacción** (líneas 132-150 vs 169-177). Dos calls separadas con manejo de error asimétrico (insert falla → return early; RPC falla → solo logea). Puede producir rows sin decremento o decrementos sin rows, según qué call falle.

El síntoma reportado (2 rows con cost_cop=0 + balance bajó 97) es consistente con: ambos SMS tuvieron `credits=0` y un tercer evento (SMS no registrado en el snapshot del usuario, o un UPDATE manual, o ejecución del script de prueba) aportó el único decremento visible. Verificar con la query SQL del bloque E7.

**Specialist hint:** `typescript` (el defecto vive en TS server-side; el fix es trivial en la capa de dominio).

## Proposed Fix Direction

**Fix inmediato (hotfix, 1 línea):**

```ts
// src/lib/domain/sms.ts:128
const segmentsUsed = Number(onurixResponse.data.credits) || 1
const costCop = segmentsUsed * SMS_PRICE_COP
```

Justificación: cualquier SMS despachado exitosamente por Onurix consume al menos 1 segmento físicamente; `credits=0` es un error de la API o tier promocional que no debe traducirse a "free" en nuestros reportes. Alinea el domain con el comportamiento probado del script `scripts/test-onurix-domain.mjs:78`.

**Fix estructural (1 migración + 1 refactor del domain):**

1. Crear RPC `insert_and_deduct_sms_message(...)` que wrapee el INSERT a `sms_messages` + el SELECT FOR UPDATE + UPDATE de balance + INSERT a `sms_balance_transactions` en un solo bloque `BEGIN...END` de plpgsql. Retorna `{ sms_message_id, new_balance, success }`.
2. Refactorizar `src/lib/domain/sms.ts` para llamar ese RPC único en lugar de dos calls separadas. Si el RPC retorna `success=false`, el caller puede elegir rollback (pero el SMS ya se envió por Onurix — el real cleanup es un compensating transaction que marca el row con `status='billing_failed'` para reconciliación posterior).
3. Añadir guard `IF p_amount <= 0 THEN RAISE EXCEPTION` en `deduct_sms_balance` para que sirva también como defensa en profundidad.

**Fix de UI/reportes:**

Independiente del fix anterior, considerar si los reportes deberían derivar el costo desde `segments × SMS_PRICE_COP` al vuelo (ignorar `cost_cop` cuando es 0), o hacer un backfill:

```sql
UPDATE sms_messages
SET cost_cop = coalesce(segments, 1) * 97
WHERE provider = 'onurix'
  AND (cost_cop IS NULL OR cost_cop = 0)
  AND status IN ('sent', 'delivered');
```

Esto sana los 2 rows visibles + cualquier otro afectado antes del fix.

## Resolution

<!-- Filled on DEBUG COMPLETE (after user decides on fix path) -->
