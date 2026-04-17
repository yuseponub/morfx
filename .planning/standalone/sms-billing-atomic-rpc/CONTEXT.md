# SMS Billing Atomic RPC - Context

**Gathered:** 2026-04-17
**Status:** Ready for research/planning
**Type:** Standalone (no phase number)
**Trigger:** Bug P2 encontrado tras cutover Twilio → Onurix — ver `.planning/debug/sms-billing-inconsistency.md`

<domain>
## Phase Boundary

Eliminar la divergencia silenciosa entre SMS enviados y SMS facturados en el path Onurix. Alcance fijo:

1. **Nuevo RPC transaccional** `insert_and_deduct_sms_message` que hace INSERT en `sms_messages` + decremento de `sms_workspace_config.balance_cop` + INSERT en `sms_balance_transactions` en una sola transacción Postgres (all-or-nothing).
2. **Guard en RPC `deduct_sms_balance`**: si `p_amount <= 0`, `RAISE EXCEPTION` (fail-loud). El RPC nunca debe correr con amount 0.
3. **Refactor de `src/lib/domain/sms.ts`**: reemplazar las dos calls separadas (INSERT + `deduct_sms_balance`) por una sola llamada al nuevo RPC. Cerrar el window de error asimétrico actual.
4. **Fallback defensivo en domain**: si `onurixResponse.data.credits` es `0/null/undefined/NaN`, usar `1` como default + `console.warn` explícito (para que quede rastro en logs Vercel si Onurix vuelve a devolver basura).
5. **Audit + backfill de rows huérfanos**: script SQL read-only que lista todos los rows `sms_messages` con `provider='onurix' AND cost_cop=0 AND created_at >= '2026-04-16'`. Luego script de escritura que sana esos rows (setea `cost_cop=97`, `segments=1`) y crea rows compensatorios en `sms_balance_transactions` + ajusta `balance_cop` por workspace.
6. **Regression test**: añadir caso al `scripts/test-onurix-domain.mjs` que simula `credits=0` en la respuesta mock y verifica que el fallback aplica y el balance decrementa.

**Fuera de alcance (deferred):**
- Retry automático de SMS fallidos (el RPC transaccional hace rollback si algo falla, pero no reintenta)
- Monitoring/alerting proactivo para detectar `cost_cop=0` en producción (queda como deuda)
- Auditoría equivalente del path WhatsApp/Meta para el mismo anti-patrón (otra fase)
- Idempotency key end-to-end (el RPC atómico elimina la necesidad a corto plazo)

</domain>

<decisions>
## Implementation Decisions

### Atomicidad (Defect B — raíz estructural)
- **D-01:** **Nuevo RPC `insert_and_deduct_sms_message`** que envuelve INSERT + UPDATE + INSERT en una sola transacción plpgsql con `FOR UPDATE` lock sobre `sms_workspace_config`. Si cualquier paso falla, toda la transacción hace rollback (Postgres default).
- **D-02:** **Firma del RPC:** recibe todos los campos de `sms_messages` + `p_amount` + `p_description`. Retorna `TABLE(success BOOLEAN, sms_message_id UUID, new_balance DECIMAL, error_message TEXT)`.
- **D-03:** **Domain refactor en `src/lib/domain/sms.ts:132-185`:** reemplazar las dos calls separadas por UNA sola `supabase.rpc('insert_and_deduct_sms_message', {...})`. Si retorna `success=false`, el SMS fue enviado por Onurix pero nada se persistió — logear ERROR crítico (no warning) y retornar DomainResult exitoso con `smsMessageId='unpersisted'` para no romper el caller. Este caso queda como deuda visible en logs Vercel.
- **D-04:** **Mantener `deduct_sms_balance` existente** como RPC separado para el path de recargas / super-admin que no necesita INSERT en `sms_messages`. Solo añadir el guard (D-05).

### Guards (Defect C — defensa en profundidad)
- **D-05:** **Guard en `deduct_sms_balance`:** si `p_amount <= 0`, `RAISE EXCEPTION 'Invalid amount: p_amount must be > 0, got %', p_amount` al inicio del body. Nunca debería llegar 0 post-fix, pero si lo hace, queremos un error visible en Supabase logs, no un no-op silencioso.
- **D-06:** **Mismo guard en el nuevo RPC `insert_and_deduct_sms_message`** para `p_amount`. Consistencia entre ambos.

### Fallback defensivo (Defect A — causa activa del bug observado)
- **D-07:** **Fallback en `src/lib/domain/sms.ts:128`:** `const segmentsUsed = Number(onurixResponse.data.credits) || 1`. Alinea con `scripts/test-onurix-domain.mjs:78` que ya usa este patrón.
- **D-08:** **Log warning explícito cuando aplica el fallback:** `if (!Number(onurixResponse.data.credits)) console.warn('[SMS] Onurix returned invalid credits, falling back to 1', { raw: onurixResponse.data.credits, phone: formattedPhone })`. Queda trazable en Vercel Logs si Onurix vuelve a comportarse raro.

### Backfill + Audit de deuda histórica
- **D-09:** **Script de audit read-only** `scripts/audit-sms-zero-cost.mjs` que lista todos los rows `sms_messages WHERE provider='onurix' AND cost_cop=0 AND created_at >= '2026-04-16'`. Output: tabla (id, workspace_id, to_number, created_at, status). Sin escritura. Correr ANTES del script de backfill para ver el alcance real.
- **D-10:** **Script de backfill** `scripts/backfill-sms-zero-cost.mjs` idempotente:
  1. Lee los rows del audit
  2. Para cada row: UPDATE `sms_messages SET cost_cop=97, segments=1 WHERE id=?`
  3. Por cada row: INSERT en `sms_balance_transactions` con `type='sms_deduction_backfill'`, `amount_cop=-97`, `description='Backfill post-cutover Onurix 2026-04-17'`
  4. Al final: UPDATE `sms_workspace_config SET balance_cop = balance_cop - (97 * count), total_sms_sent = total_sms_sent + count WHERE workspace_id=?` por cada workspace afectado
  5. Todo dentro de una transacción Supabase o usar un RPC `backfill_sms_message` para atomicidad
- **D-11:** **Validación pre-backfill:** mostrar el impacto total en balance al usuario (ej: "El backfill va a decrementar $194 COP del workspace Somnio por 2 rows") y pedir confirmación explícita antes de escribir. El script tiene flag `--dry-run` (default) vs `--apply`.

### Regression test
- **D-12:** **Ampliar `scripts/test-onurix-domain.mjs`** con un caso adicional que mockea la respuesta Onurix con `credits: 0` y verifica:
  1. El SMS se envía (retorna success)
  2. `sms_messages.cost_cop = 97` (fallback aplicado)
  3. `sms_workspace_config.balance_cop` decrementa exactamente $97
  4. `console.warn` fue llamado con el mensaje esperado
- **D-13:** **Añadir tests Postgres** (opcional, si el proyecto tiene pgTAP u otro harness): unit tests del nuevo RPC con amount=0 (debe fallar con EXCEPTION), con workspace inexistente, con balance insuficiente+allow_negative=false, etc.

### Claude's Discretion
- Ubicación exacta de los scripts (`scripts/audit-sms-zero-cost.mjs` y `scripts/backfill-sms-zero-cost.mjs`) y estructura interna
- Si el backfill va en un RPC plpgsql o se hace directamente desde Node (preferir RPC por atomicidad)
- Texto exacto del `RAISE EXCEPTION` en plpgsql
- Nombre interno de las variables en el nuevo RPC
- Orden de los commits durante execute-phase (sugerido: migración SQL → domain refactor → scripts → tests)
- Si el fallback warning se extiende también a `segments=null/undefined` en otros campos que Onurix pueda devolver mal
- Formato del output del script de audit (JSON vs tabla humana)
- Si `deduct_sms_balance` existente se deja deprecated post-fix o se mantiene como API pública

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contexto del bug
- `.planning/debug/sms-billing-inconsistency.md` — Investigación completa del debug: E1-E9 (evidencia), defectos A/B/C/D, hipótesis eliminadas, root cause confirmado
- `.planning/standalone/twilio-to-onurix-migration/04-SUMMARY.md` §Deuda pendiente — Deuda técnica del SMS Somnio con cost_cop=0 reconocida en Plan 04

### Reglas del proyecto
- `CLAUDE.md` §Regla 3 — Toda mutación via `src/lib/domain/` (el nuevo RPC es llamado desde el domain layer, no desde callers directos)
- `CLAUDE.md` §Regla 5 — Migración DB antes de deploy. El nuevo RPC + guard + posible `backfill_sms_message` RPC deben aplicarse en producción ANTES de pushear el código que los llama. Pausar explícitamente para que el usuario aplique la migración.
- `CLAUDE.md` §Regla 1 — Push a Vercel después de cambios de código antes de pedir pruebas
- `.claude/rules/code-changes.md` — Plan aprobado requerido; commits atómicos por tarea
- `.claude/rules/gsd-workflow.md` — Commits atómicos, plan antes de código

### Código SMS actual (pre-fix)
- `src/lib/domain/sms.ts` — Domain layer completo:
  - `src/lib/domain/sms.ts:125` — Call a `sendOnurixSMS()`
  - `src/lib/domain/sms.ts:128` — Defect A (fallback faltante en `credits`)
  - `src/lib/domain/sms.ts:132-166` — Defect B primera mitad (INSERT separado con return-early en error)
  - `src/lib/domain/sms.ts:168-185` — Defect B segunda mitad (RPC separado con solo `console.warn` en error — manejo asimétrico)
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql` — Schema + RPCs:
  - Líneas 149-201 — Definición actual de `deduct_sms_balance` (falta guard `p_amount <= 0`)
  - Líneas 207+ — `add_sms_balance` para referencia de patrón plpgsql
  - Tablas `sms_messages`, `sms_workspace_config`, `sms_balance_transactions` — schema completo

### Patrón de fallback correcto existente
- `scripts/test-onurix-domain.mjs:78` — Usa `Number(credits) || 1` correctamente (referencia de patrón para D-07)
- `scripts/test-onurix-sms.mjs` — Tests A+B de Onurix API directo, mantener como regresión

### Onurix API client
- `src/lib/sms/client.ts` — `sendOnurixSMS()` — verificar shape de `onurixResponse.data` para documentar qué puede venir mal
- `src/lib/sms/types.ts` — Tipos de respuesta Onurix
- `src/lib/sms/constants.ts` — `SMS_PRICE_COP = 97`

### Fase previa (contexto histórico)
- `.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md` — Inventario completo de la migración, razón de por qué el bug pasó desapercibido hasta 2026-04-17
- `.planning/standalone/twilio-to-onurix-migration/CONTEXT.md` — Decisiones D-01 a D-13 de la migración (contexto de por qué el path actual existe)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`deduct_sms_balance` RPC**: patrón plpgsql con `FOR UPDATE` lock + `RETURN QUERY` sirve como plantilla para el nuevo `insert_and_deduct_sms_message`
- **`DomainContext` + `DomainResult`** (`src/lib/domain/types.ts`): contratos ya establecidos, el refactor no cambia la firma pública de `sendSMS()`
- **`console.warn` + `console.error` patrón**: usado consistentemente en `sms.ts:155,180,183,198` — mantener convención
- **Scripts de test existentes** (`scripts/test-onurix-*.mjs`): precedente de cómo se arma un script standalone con `createAdminClient`

### Established Patterns
- **RPCs con `SECURITY DEFINER`**: bypass RLS con validación explícita de `workspace_id` — aplica al nuevo RPC
- **Retorno `TABLE(success, new_balance, error_message)`**: patrón del deduct actual, el nuevo RPC lo extiende con `sms_message_id`
- **Migraciones en `supabase/migrations/`**: nombre timestamped `{YYYYMMDDHHMMSS}_{slug}.sql` — la nueva migración seguirá el mismo patrón
- **Domain layer como single source of truth**: todos los callers (action-executor, scripts, otros domain) llaman `sendSMS()` — el refactor interno es transparente para ellos

### Integration Points
- **Action executor** (`src/lib/automations/action-executor.ts:executeSendSms`): llama `sendSMS()` del domain, no necesita cambios
- **Inngest `sms-delivery-check`**: emite evento DESPUÉS del INSERT+RPC atómico (paso 7 del flujo). Best-effort, no bloqueante, no cambia
- **Super-admin SMS dashboard**: lee `sms_workspace_config.balance_cop` directamente — tras el fix, el balance será consistente con `sms_messages.cost_cop` sumado
- **`getSmsUsage` / `getSmsUsageChart`** (`src/app/actions/integrations.ts`): lee `cost_cop` de `sms_messages`. Tras el backfill, los 2 rows huérfanos mostrarán $97 cada uno (no $0)

### Pitfalls a evitar en research/planning
- **No tocar el behavior actual de `deduct_sms_balance`** más allá del guard — hay otros callers (recargas, tests) que ya dependen del patrón `RETURN QUERY SELECT`
- **No meter Inngest.send dentro del RPC**: Postgres no puede emitir eventos; la emisión queda fuera de la transacción por diseño (aceptamos que delivery-check es eventually consistent)
- **No romper la firma de `sendSMS()` del domain**: el action executor y otros callers no deben enterarse del refactor interno
- **Manejar el caso "SMS sent by Onurix but RPC failed"**: hoy retorna success con smsMessageId='unknown'. Mantener comportamiento análogo con el nuevo RPC — el SMS ya se fue, no podemos rollback el API call a Onurix

</code_context>

<specifics>
## Specific Ideas

- Usuario pidió: "hagamos el fix estructural" (2026-04-17) — opta por raíz estructural en vez de hotfix mínimo, priorizando correctitud > velocidad.
- Usuario delegó las decisiones técnicas: "no entiendo nada de esto, decidelo tu y que sea robusto" — Claude aplica defaults recomendados en todas las gray areas + documenta el reasoning.
- El bug se manifestó con 2 SMS, pero el fix atómico + guard + fallback es defensa en profundidad: cierra 3 defectos distintos aunque solo uno haya disparado hoy.
- El backfill debe ser `--dry-run` por default + confirmación explícita (Regla 5 + agentes operacionales conservadores): nada escribe a producción sin ver el alcance primero.

</specifics>

<deferred>
## Deferred Ideas

- **Monitoring proactivo**: alerta (Inngest cron o check diario) que detecte `sms_messages WHERE cost_cop=0` post-fix y notifique al super-admin. Deuda técnica documentable pero fuera de scope.
- **Auditoría análoga del path WhatsApp/Meta billing**: ¿existe el mismo anti-patrón (escritura + decremento separados) en el módulo de mensajería WhatsApp? Otra fase.
- **Idempotency key end-to-end**: si Onurix devuelve el mismo `provider_message_id` en un retry, evitar doble INSERT. El RPC atómico reduce la ventana pero no elimina el riesgo si el caller reintenta. Otra fase.
- **Retry automático de SMS**: si Onurix API falla, hoy retornamos error. Feature: reintentar con backoff — fuera de scope.
- **Tests pgTAP**: harness de tests unitarios en Postgres para RPCs. Infra no existe, añadirla es otra fase.
- **Limpiar `scripts/test-onurix-sms.mjs`**: acumula deuda (hardcoded credentials, env-dependent). Refactor a un harness de tests unificado — otra fase.

</deferred>

---

*Project: sms-billing-atomic-rpc (standalone)*
*Context gathered: 2026-04-17*
*Related debug: .planning/debug/sms-billing-inconsistency.md*
*Related phase: .planning/standalone/twilio-to-onurix-migration/*
