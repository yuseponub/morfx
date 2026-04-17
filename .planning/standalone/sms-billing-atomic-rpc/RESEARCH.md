# SMS Billing Atomic RPC — Research

**Researched:** 2026-04-17
**Domain:** Postgres transactional RPC (plpgsql) + Supabase JS client + Node scripts (idempotent backfill)
**Confidence:** HIGH (arquitectura ya decidida en CONTEXT.md D-01..D-13; esta research cierra gaps concretos de implementacion)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Atomicidad (Defect B):**
- **D-01:** Nuevo RPC `insert_and_deduct_sms_message` que envuelve INSERT en `sms_messages` + UPDATE de balance + INSERT en `sms_balance_transactions` en una sola transaccion plpgsql con `FOR UPDATE` lock sobre `sms_workspace_config`.
- **D-02:** El RPC recibe todos los campos de `sms_messages` + `p_amount` + `p_description`. Retorna `TABLE(success BOOLEAN, sms_message_id UUID, new_balance DECIMAL, error_message TEXT)`.
- **D-03:** Refactor `src/lib/domain/sms.ts:132-185` a una sola `supabase.rpc('insert_and_deduct_sms_message', {...})`. Si `success=false`, logear ERROR critico y retornar DomainResult exitoso con `smsMessageId='unpersisted'` (SMS ya se fue por Onurix).
- **D-04:** Mantener `deduct_sms_balance` existente (path recargas/super-admin), solo anadir guard.

**Guards (Defect C):**
- **D-05:** `deduct_sms_balance`: `RAISE EXCEPTION 'Invalid amount: p_amount must be > 0, got %', p_amount` si `p_amount <= 0`.
- **D-06:** Mismo guard en el nuevo RPC.

**Fallback defensivo (Defect A):**
- **D-07:** `const segmentsUsed = Number(onurixResponse.data.credits) || 1` (alineado con `scripts/test-onurix-domain.mjs:78`).
- **D-08:** `console.warn('[SMS] Onurix returned invalid credits, falling back to 1', { raw, phone })` cuando aplica el fallback.

**Backfill + Audit:**
- **D-09:** `scripts/audit-sms-zero-cost.mjs` read-only: lista `sms_messages WHERE provider='onurix' AND cost_cop=0 AND created_at >= '2026-04-16'`.
- **D-10:** `scripts/backfill-sms-zero-cost.mjs` idempotente con UPDATE cost_cop=97/segments=1 + INSERT sms_balance_transactions + UPDATE sms_workspace_config.
- **D-11:** `--dry-run` default, `--apply` explicito, mostrar impacto total antes de escribir.

**Regression test:**
- **D-12:** Ampliar `scripts/test-onurix-domain.mjs` con caso `credits=0` → verifica `cost_cop=97`, balance decrementa $97, console.warn disparado.
- **D-13:** (Opcional, deferred) pgTAP tests — no hay harness instalado, queda fuera.

### Claude's Discretion

- Ubicacion y estructura interna de scripts
- Si el backfill va en RPC plpgsql o directamente desde Node (research recomienda: **Node con un mini-RPC `backfill_sms_message` para atomicidad por row**, ver seccion "Backfill: RPC vs Node")
- Texto exacto de `RAISE EXCEPTION`
- Nombre interno de variables en el nuevo RPC
- Orden de commits en execute-phase (sugerido: migracion SQL → domain refactor → scripts audit/backfill → regression test)
- Si warnings se extienden a otros campos Onurix (research dice: solo `credits` por ahora; el resto son strings no usados en billing)
- Formato output audit (research recomienda: tabla humana en stdout + opcional `--json` flag)
- `deduct_sms_balance` existente: no deprecated, mantener como API publica (lo llama el path de recargas desde super-admin)

### Deferred Ideas (OUT OF SCOPE)

- Monitoring proactivo de `cost_cop=0` post-fix (alerta diaria)
- Auditoria analoga del path WhatsApp/Meta billing
- Idempotency key end-to-end (Onurix `provider_message_id` unique)
- Retry automatico de SMS fallidos
- Tests pgTAP para RPCs
- Refactor del harness `test-onurix-*.mjs`

</user_constraints>

---

## Summary

Esta fase cierra un bug P2 confirmado en produccion (2 SMS con `cost_cop=0` tras cutover Onurix, 2026-04-16/17). El root cause es un defecto compuesto en `src/lib/domain/sms.ts`: (a) el `credits` de Onurix se usa sin fallback → si Onurix devuelve `0/null/undefined`, el INSERT registra `cost_cop=0` y el RPC decrementa `0`; (b) el INSERT a `sms_messages` y el RPC `deduct_sms_balance` son dos calls separadas sin transaccion → manejo de error asimetrico permite rows sin decremento o decrementos sin rows.

La arquitectura ya esta decidida: un nuevo RPC atomico `insert_and_deduct_sms_message` que fusiona las dos operaciones en una sola transaccion plpgsql con `FOR UPDATE` lock. No hay alternativas a investigar — solo validar skeletons, listar pitfalls, y producir material listo para planificar.

**Primary recommendation:** seguir el patron establecido de `deduct_sms_balance` (mismo file, mismas convenciones) + el patron de `increment_robot_job_counter` (GRANT EXECUTE explicito, `RAISE EXCEPTION` idiomatico). Usar `Number(onurixResponse.data.credits) || 1` con warning en domain layer. Scripts estilo `migrate-twilio-automations-to-onurix.mjs` (dry-run default, `--apply` para escribir, workspace filter siempre).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Atomic INSERT + balance decrement + transaction log | Postgres (plpgsql RPC) | — | Solo Postgres garantiza atomicidad real via MVCC + FOR UPDATE lock. No puede vivir en Node. |
| Fallback defensivo `credits || 1` | Domain layer (`src/lib/domain/sms.ts`) | — | Regla 3: toda mutacion por domain. El fallback debe correr ANTES de que el valor viaje al RPC. |
| Structured logging del fallback | Domain layer | Vercel Logs | `console.warn` captura con stack en Vercel; no hay libreria de structured logging en el stack. |
| Emision Inngest delivery-check | Domain layer (post-RPC) | — | No puede ir dentro del RPC (Postgres no puede emitir eventos). Queda fuera de la transaccion por diseno. |
| Audit read-only (reporting) | Script Node + Supabase admin client | — | Sin escritura, sin RPC. Query directo a `sms_messages`. |
| Backfill idempotente (reparacion de data) | Script Node + RPC `backfill_sms_message` (por row) | — | La atomicidad POR ROW la da un mini-RPC; el loop y el dry-run viven en Node (UX/CLI). |
| Guard `p_amount > 0` (fail-loud) | Postgres (plpgsql) en ambos RPCs | — | Defensa en profundidad — aunque domain ya no llama con 0 post-fix, el guard protege contra futuras regresiones. |

---

## Phase Requirements

(CONTEXT.md no usa IDs REQ-XX — los 6 entregables del `<domain>` son los requirements de facto.)

| # | Entregable | Research Support |
|---|------------|------------------|
| R1 | RPC `insert_and_deduct_sms_message` atomico | Seccion "Code Examples: plpgsql skeleton", patron `deduct_sms_balance` existente + `increment_robot_job_counter` |
| R2 | Guard `p_amount <= 0` en ambos RPCs | Seccion "Code Examples: RAISE EXCEPTION idiom", patron `robot_job_atomic_counters.sql:51` |
| R3 | Refactor domain a una sola call RPC | Seccion "Code Examples: domain call shape", tipos de retorno Supabase JS v2 |
| R4 | Fallback `Number(credits) || 1` + warn | Patron ya probado en `test-onurix-domain.mjs:78` |
| R5 | Scripts audit + backfill | Seccion "Code Examples: script skeleton", patron `migrate-twilio-automations-to-onurix.mjs` |
| R6 | Regression test para `credits=0` | Seccion "Code Examples: regression test skeleton" |

---

## Project Constraints (from CLAUDE.md)

Directivas obligatorias que el planner y los agents de execute-phase DEBEN respetar:

- **Regla 0 (GSD completo):** sin atajos, sin saltar pasos. Aplicado: research → plan → execute.
- **Regla 1 (push a Vercel):** tras cambios de codigo, commit + push antes de pedir pruebas al usuario. Aplicar tras cada wave.
- **Regla 2 (timezone Colombia):** los timestamps en SQL usan `timezone('America/Bogota', NOW())`. El nuevo RPC debe seguir el patron (ver lineas 18, 192 de la migracion existente).
- **Regla 3 (domain layer mandatory):** toda mutacion de datos via `src/lib/domain/`. El nuevo RPC se llama EXCLUSIVAMENTE desde `src/lib/domain/sms.ts`. Ningun otro caller tiene permiso directo.
- **Regla 4 (docs sincronizadas):** tras completar la fase, actualizar `docs/analysis/04-estado-actual-plataforma.md` §SMS (deuda `cost_cop=0` resuelta) y `LEARNINGS.md` de la fase.
- **Regla 5 (migracion ANTES de deploy):** **BLOQUEANTE.** El archivo de migracion se crea en Wave 1 pero el plan DEBE incluir un paso explicito "Pausar: aplicar migracion en produccion Supabase Dashboard" ANTES del push del refactor de domain. El codigo que llama al nuevo RPC NO puede mergearse antes de que el RPC exista en produccion.
- **Regla 6 (proteger agente en produccion):** los agentes de automatizacion llaman `sendSMS()`. El refactor mantiene la firma publica intacta → cumple Regla 6 automaticamente. Verificar en plan-check: signature `sendSMS(ctx, params)` → `Promise<DomainResult<SendSMSResult>>` no cambia.
- **`.claude/rules/code-changes.md`:** plan aprobado requerido; commits atomicos por tarea.
- **`.claude/rules/gsd-workflow.md`:** plan antes de codigo.

---

## Standard Stack

### Core (ya existente — NO agregar nuevas dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.93.1 | Cliente Postgres + RPC invocation | Ya en uso en todo el proyecto; `createAdminClient()` bypassa RLS |
| `next` | ^16.1.6 | Framework + App Router | Stack del proyecto |
| `typescript` | ^5 | Tipado estricto | Contratos domain + tipos Onurix |
| Postgres (Supabase) | 15+ | plpgsql functions, MVCC, FOR UPDATE lock | Donde vive la atomicidad real |
| Node `--env-file` | 20+ | Carga de `.env.local` en scripts | Patron existente de `test-onurix-*.mjs` |

### Supporting (ya existente)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `inngest` | existente | Emision `sms/delivery.check` fuera de la transaccion | Solo para el delivery-check post-send (no tocar) |

### Alternatives Considered

| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| plpgsql RPC atomico | 2 calls + reconciliation async via Inngest | Rechazado en DISCUSSION-LOG §Area 1 — mas complejidad, no elimina el defect |
| plpgsql RPC atomico | Idempotency key end-to-end | Rechazado — queda como deferred. El RPC atomico reduce el riesgo a corto plazo |
| `\|\| 1` silent fallback | `Math.ceil(message.length / 160)` | Rechazado en DISCUSSION-LOG §Area 4 — duplica logica de Onurix, puede divergir |
| `\|\| 1` silent fallback | Return error, fail the domain call | Rechazado — el SMS ya se envio, no podemos rollback Onurix |

**Installation:** NONE — todo el stack existe, **esta fase NO instala paquetes npm nuevos.**

### Version verification

- `@supabase/supabase-js@2.93.1`: [VERIFIED: package.json line 40]. `.rpc()` retorna `{ data, error }` donde `error: PostgrestError | null`. `PostgrestError` incluye `message`, `code` (SQLSTATE), `details`, `hint`. [CITED: https://supabase.com/docs/reference/javascript/rpc]
- Postgres 15+ soporta `RAISE EXCEPTION '...%', var` con interpolacion. Las excepciones plpgsql se propagan como SQLSTATE `P0001` por default (o custom si se usa `USING ERRCODE`). [CITED: https://docs.postgrest.org/en/v12/references/errors.html]

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────┐
│ action-executor.         │  executeSendSms(params, context, workspaceId)
│ executeSendSms           │
└───────────┬──────────────┘
            │  domainSendSMS(ctx, { phone, message, ... })
            ▼
┌────────────────────────────────────────┐
│  src/lib/domain/sms.ts :: sendSMS      │
│  ┌─────────────────────────────────┐   │
│  │ 1. Validate phone               │   │
│  │ 2. Check time window            │   │
│  │ 3. Pre-check balance            │   │
│  │ 4. sendOnurixSMS() → response   │   │
│  │ 5. FALLBACK: Number(credits)||1 │◄──┼── Defect A fix (D-07, D-08)
│  │    console.warn if fallback     │   │
│  │ 6. rpc('insert_and_deduct_     │◄──┼── Defect B fix (D-01, D-03)
│  │       sms_message', {...})      │   │
│  │ 7. emit Inngest (fuera de tx)   │   │
│  └─────────────────────────────────┘   │
└───────────┬────────────────────────────┘
            │ supabase.rpc('insert_and_deduct_sms_message', {...})
            ▼
┌──────────────────────────────────────────────────┐
│  PG: insert_and_deduct_sms_message(...)          │
│  BEGIN (implicit — RPC is a single tx)           │
│    IF p_amount <= 0 THEN RAISE EXCEPTION (D-06)  │
│    SELECT ... FROM sms_workspace_config          │
│      FOR UPDATE                                  │
│    validate (is_active, balance, allow_neg)      │
│    INSERT INTO sms_messages ... RETURNING id     │
│    UPDATE sms_workspace_config SET balance_cop.. │
│    INSERT INTO sms_balance_transactions ...      │
│    RETURN QUERY SELECT true, id, new_bal, NULL   │
│  END (atomic commit OR full rollback)            │
└──────────────────────────────────────────────────┘

Independiente (para data historica):
┌──────────────────────┐      ┌─────────────────────────┐
│ audit-sms-zero-cost  │─────▶│ SELECT sms_messages     │
│   (read-only)        │      │ WHERE cost_cop=0        │
└──────────────────────┘      └─────────────────────────┘

┌──────────────────────┐      ┌──────────────────────────┐
│ backfill-sms-zero-   │─────▶│ rpc('backfill_sms_       │
│  cost (--dry-run     │      │      message', {...})    │
│  default)            │      │   (atomic per-row)       │
└──────────────────────┘      └──────────────────────────┘
```

### Component Responsibilities

| File | Responsibility | Changes |
|------|---------------|---------|
| `supabase/migrations/{NEW}_sms_atomic_rpc.sql` | Define `insert_and_deduct_sms_message`, `backfill_sms_message`, guard para `deduct_sms_balance` | CREATE |
| `src/lib/domain/sms.ts` | Refactor a una sola call RPC + fallback `credits\|\|1` + warn | MODIFY |
| `src/lib/domain/types.ts` | (No cambia — DomainContext/DomainResult intactos) | — |
| `scripts/audit-sms-zero-cost.mjs` | Read-only list de rows huerfanos | CREATE |
| `scripts/backfill-sms-zero-cost.mjs` | Idempotent repair con dry-run + --apply | CREATE |
| `scripts/test-onurix-domain.mjs` | Ampliar con regression test para `credits=0` | MODIFY |
| `src/lib/automations/action-executor.ts` | (No cambia — llama `domainSendSMS` con signature invariante) | — |
| `src/inngest/functions/sms-delivery-check.ts` | (No cambia — sigue recibiendo evento post-RPC) | — |

### Recommended Project Structure

No hay estructura nueva. Todo cae en directorios existentes:

```
supabase/migrations/
└── {YYYYMMDDHHMMSS}_sms_atomic_rpc.sql    # Nuevo archivo — ver "migration filename convention"

src/lib/domain/
└── sms.ts                                  # Refactor interno

scripts/
├── audit-sms-zero-cost.mjs                 # Nuevo
├── backfill-sms-zero-cost.mjs              # Nuevo
└── test-onurix-domain.mjs                  # Ampliar con regression case
```

### Pattern 1: Atomic RPC (plpgsql transaction)

**What:** Un RPC que agrupa INSERT + UPDATE + INSERT en una sola transaccion Postgres. Si cualquier paso falla (excepcion, constraint violation, lock timeout), Postgres hace rollback automatico de todo.

**When to use:** Siempre que dos o mas mutaciones deban ser consistentes entre si (principio: "all or nothing"). En este caso: no puede haber un row en `sms_messages` sin su transaccion correspondiente en `sms_balance_transactions` y su decremento en `sms_workspace_config`.

**Example:** Ver seccion "Code Examples: plpgsql skeleton" abajo.

### Pattern 2: Domain-layer wrapper sobre RPC

**What:** El domain layer (`sendSMS()`) llama al RPC, interpreta el resultado, y traduce errores a `DomainResult`. La firma publica del domain no cambia.

**When to use:** Siempre — Regla 3 lo manda. El caller (action-executor, otros) no deben saber que internamente es un RPC vs 2 calls.

**Example:** Ver "Code Examples: domain call shape".

### Pattern 3: Idempotent Node script con dry-run default

**What:** Script CLI que por default NO escribe. Imprime el diff. Requiere flag `--apply` para ejecutar. Re-ejecutable sin efectos secundarios duplicados.

**When to use:** Backfills, migraciones de datos, reparaciones. Regla 5 aplica tangencialmente (proteger produccion de escrituras no revisadas).

**Example:** `scripts/migrate-twilio-automations-to-onurix.mjs` (patron ya validado en el repo, ver "Code Examples: script skeleton").

### Anti-Patterns to Avoid

- **Hacer `inngest.send` dentro del RPC plpgsql:** imposible (Postgres no emite eventos) Y seria contraproducente (rompe la atomicidad). El `inngest.send` queda FUERA del RPC, despues de que retorna success (se acepta que delivery-check es eventually consistent).
- **Escribir `sms_messages` desde dos lugares distintos:** hoy solo `src/lib/domain/sms.ts` lo hace [VERIFIED: grep `from\('sms_messages'\)\.insert` retorna 0 matches fuera del domain]. Mantener invariante.
- **Asumir que `deduct_sms_balance` se puede eliminar:** NO — hay callers (recargas super-admin) que lo usan. D-04 lo confirma.
- **Poner el fallback `|| 1` en el plpgsql:** NO — el fallback vive en el domain layer (la logica de "que hacer si el provider responde basura" es responsabilidad del adapter boundary, no del storage).
- **Usar `RETURN NEXT` en vez de `RETURN QUERY SELECT`:** El patron del proyecto es `RETURN QUERY SELECT` (ver `deduct_sms_balance:199`). Mantener consistencia.
- **Olvidar `GRANT EXECUTE` en el nuevo RPC:** aunque `deduct_sms_balance` no lo tiene explicito (y funciona), el patron moderno del repo es granting explicito (ver `increment_robot_job_counter:74-75`). Hacerlo para el nuevo RPC.
- **Cargar `.env.local` manualmente con `dotenv`:** NO — el patron de scripts es `node --env-file=.env.local scripts/...`. No requiere import de dotenv.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction management / rollback | Don't try `try/catch/rollback` en Node | Postgres implicit transaction (el RPC entero es una tx) | MVCC + FOR UPDATE ya lo hace atomicamente |
| Row-level locking (race conditions) | Don't use `SELECT` + compare + `UPDATE` | `SELECT ... FOR UPDATE` dentro del RPC | El FOR UPDATE serializa concurrencia por workspace |
| Optimistic locking con reintentos | Don't | Pessimistic lock via FOR UPDATE + FOR UPDATE dentro del RPC | Escala bien a carga SMS (< 10 tps) y simplifica codigo |
| Parse de errores plpgsql en JS | Don't regex el `message` string | `error.code` (SQLSTATE) + `error.message` del `PostgrestError` | Supabase JS v2 expone el SQLSTATE (P0001 para RAISE EXCEPTION generico) |
| Detectar `credits=0` de Onurix | Don't add monitoring | `console.warn` + Vercel Logs + deferred monitoring | Sufficient para deteccion reactiva; monitoring proactivo es deferred |
| Idempotency de backfill | Don't track "done" en un archivo local | Query filter por `cost_cop=0` (idempotent por construccion) | Re-correr el script sobre rows ya arreglados no matchea (filter no los incluye) |
| JSON CLI parsing (argv flags) | Don't install `yargs`/`commander` | `process.argv.includes('--apply')` + `process.argv.includes('--dry-run')` | Patron del repo (ver `migrate-twilio-automations-to-onurix.mjs:17`) |
| Environment var loading | Don't import dotenv | `node --env-file=.env.local scripts/...` | Patron del repo (ver `test-onurix-*.mjs` header) |

**Key insight:** Postgres y Supabase ya resuelven los problemas dificiles (atomicidad, locking, error propagation). El codigo nuestro es mayormente pegamento — no hay razon para reimplementar ningun primitivo.

---

## Common Pitfalls

### Pitfall 1: RAISE EXCEPTION mata la transaccion COMPLETA

**What goes wrong:** Si el `RAISE EXCEPTION` del guard `p_amount <= 0` dispara, TODA la transaccion del RPC (incluido el INSERT a `sms_messages`) hace rollback. Esto es el comportamiento deseado, pero significa que el caller NO puede asumir que el row fue insertado cuando recibe el error.

**Why it happens:** plpgsql transactions son all-or-nothing. `RAISE EXCEPTION` sin un `BEGIN/EXCEPTION` block anidado aborta todo el bloque.

**How to avoid:** El domain layer debe tratar `error !== null` como "nada se persistio" (ni SMS registrado ni balance decrementado). En ese caso: logear ERROR critico, retornar DomainResult con `smsMessageId='unpersisted'` (segun D-03). NO asumir que puede reintentar el INSERT solo.

**Warning signs:** `error.code === 'P0001'` (SQLSTATE custom raise) en la respuesta de `supabase.rpc()`.

### Pitfall 2: Supabase `.rpc()` con `RETURN QUERY SELECT` retorna un ARRAY, no un objeto

**What goes wrong:** `RETURN QUERY SELECT ... FROM ...` o `RETURN QUERY SELECT true, 'foo'` retorna un set de filas. Desde JS se recibe como **array** de objetos: `deductResult[0].success`, no `deductResult.success`. El codigo existente en `sms.ts:182` ya lo maneja: `deductResult && deductResult.length > 0 && !deductResult[0].success`.

**Why it happens:** `RETURNS TABLE(...)` implica un resultset. Incluso con una sola fila retornada, PostgREST serializa como array.

**How to avoid:** Seguir el patron `const row = result[0]`. Alternativa: usar `.rpc(...).single()` (como `robot-jobs.ts:420`) para forzar a PostgREST a retornar un objeto en vez de array — pero OJO: falla con PGRST116 si el RPC retorna 0 filas. Seguro solo cuando el RPC SIEMPRE retorna exactamente 1 fila.

**Warning signs:** `Cannot read property 'success' of undefined` o `deductResult.success is not a function`.

**Decision for this phase:** usar `.single()` al llamar el nuevo RPC (siempre retorna 1 fila por diseno). Esto simplifica el tipado en TS.

### Pitfall 3: `PostgrestError` vs domain success=false — dos canales de error diferentes

**What goes wrong:** Un `RAISE EXCEPTION` plpgsql llega como `error !== null` en supabase-js. Un `RETURN QUERY SELECT false::BOOLEAN, ...` llega como `data[0].success === false` con `error === null`. El codigo debe distinguir:
- `error !== null` → algo explotó en Postgres (lock timeout, RAISE EXCEPTION, constraint violation, amount invalido). Nada se persistio. Accion: log ERROR, retornar `smsMessageId='unpersisted'`.
- `data[0].success === false` → el RPC corrio hasta el final pero rechazo el request (workspace no existe, is_active=false, saldo insuficiente con allow_negative_balance=false). Tambien nada se persistio (porque los RETURN QUERY tempranos salen antes del INSERT). Accion: log ERROR con `data[0].error_message`.

**Why it happens:** plpgsql permite dos estilos de error: excepciones (rollback) vs retorno explicito (commit pero con flag). Ambos significan "no se persistio" en nuestro caso, pero el plpgsql debe ser consistente.

**How to avoid:** En el nuevo `insert_and_deduct_sms_message`, los casos "workspace no existe / is_active false / balance insuficiente" retornan `success=false` SIN haber hecho INSERT (los `RETURN QUERY SELECT false; RETURN;` tempranos previenen el INSERT). El guard `p_amount<=0` usa RAISE EXCEPTION (truena antes de cualquier query, no hay riesgo de orfandad).

**Warning signs:** Un row en `sms_messages` sin su par en `sms_balance_transactions` post-fix = bug en el plpgsql, no en el domain.

### Pitfall 4: `FOR UPDATE` sobre row inexistente NO lanza excepcion

**What goes wrong:** `SELECT ... FROM sms_workspace_config WHERE workspace_id = p_workspace_id FOR UPDATE` simplemente no matchea y `IF NOT FOUND` es `true`. No hay lock adquirido, no hay error. Si el codigo no verifica `NOT FOUND`, sigue adelante con `v_config` undefined y explota en cualquier acceso a sus campos.

**Why it happens:** Postgres no trata "no hay fila" como error — es un empty resultset valido.

**How to avoid:** Inmediatamente despues del `SELECT ... FOR UPDATE`, siempre verificar `IF NOT FOUND THEN RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, 0::DECIMAL, 'workspace not configured'::TEXT; RETURN;`. Ver `deduct_sms_balance:169-172` como referencia.

**Warning signs:** `NULL value in column ...` o `v_config.is_active is null`.

### Pitfall 5: `RAISE EXCEPTION` dentro de Supabase Dashboard parece "error generico" pero SI propaga al cliente

**What goes wrong:** En testing local contra Supabase, el mensaje de error puede verse como `"new row violates check constraint"` o un wrapper genérico. El desarrollador podria pensar que el mensaje custom `'Invalid amount: p_amount must be > 0, got 0'` se perdio.

**Why it happens:** Cuando hay multiples capas (supabase-js → PostgREST → Postgres), algunos mensajes se re-wrappean. PostgREST 12+ pasa el `message` de `RAISE EXCEPTION` como `error.message` en la respuesta HTTP 400. [CITED: https://docs.postgrest.org/en/v12/references/errors.html]

**How to avoid:** Verificar con un test real del RPC (llamar desde el Supabase Dashboard SQL editor): `SELECT deduct_sms_balance('<ws_id>', 0, NULL, 'test');`. Debe lanzar una excepcion visible con el mensaje completo. Si el mensaje no aparece, revisar la version de PostgREST (Supabase >= 2024 lo soporta).

**Warning signs:** `error.message` es `'unknown error'` o esta vacio.

### Pitfall 6: El audit script corre en horario distinto al backfill — datos cambian entre ambos

**What goes wrong:** El audit muestra 2 rows. El usuario confirma. El backfill corre 10 minutos despues, pero en ese lapso llegaron 3 SMS mas con `cost_cop=0` (porque el deploy del fix aun no se hizo). El backfill ahora afecta 5 rows pero el usuario solo vio 2.

**Why it happens:** Audit y backfill son independientes, sin snapshot.

**How to avoid:**
- El backfill debe re-correr el audit internamente al inicio y mostrar el conteo actual ANTES de pedir confirmacion.
- Idealmente: filtrar por `created_at <= '<timestamp del deploy del fix>'` para no tocar rows nuevos que podrian ser parte de otro bug.
- Documentar en el output: "Rows a modificar: N (timestamp corte: ...)". Si el numero difiere de lo que el usuario vio, PARAR.

**Warning signs:** El count del dry-run del backfill difiere del count del audit standalone.

### Pitfall 7: Backfill de `sms_workspace_config.total_sms_sent` y `total_credits_used` podria double-count

**What goes wrong:** El backfill hace tres cosas por row: (1) UPDATE `sms_messages.cost_cop=97`, (2) INSERT en `sms_balance_transactions` con `amount_cop=-97`, (3) UPDATE `sms_workspace_config.balance_cop -= 97` y `total_sms_sent += 1`. PERO: cuando el SMS se envio originalmente, `deduct_sms_balance` se llamo con `p_amount=0` y DE TODAS FORMAS hizo `total_sms_sent += 1` (ver `deduct_sms_balance:190`). Por lo tanto, incrementar nuevamente en el backfill cuenta el SMS dos veces.

**Why it happens:** `total_sms_sent` se incrementa siempre que `deduct_sms_balance` corre, independientemente del amount. El bug fue que `total_credits_used` se incremento en 0, no que `total_sms_sent` fallo.

**How to avoid:** El backfill NO debe incrementar `total_sms_sent`. Solo debe:
- UPDATE `sms_messages.cost_cop=97, segments=1`
- INSERT `sms_balance_transactions` con `type='sms_deduction_backfill'`, `amount_cop=-97`, `description='Backfill post-cutover Onurix 2026-04-17'`, `sms_message_id=<row.id>`, `balance_after=<balance post-decremento>`
- UPDATE `sms_workspace_config SET balance_cop = balance_cop - 97, total_credits_used = total_credits_used + 97` (OJO: solo `total_credits_used`, NO `total_sms_sent`).

**Warning signs:** Post-backfill, `total_sms_sent` supera el count real en `sms_messages`.

### Pitfall 8: El nuevo RPC y el guard-only change deben ir en la MISMA migracion SQL

**What goes wrong:** Si el guard en `deduct_sms_balance` va en una migracion separada del nuevo RPC, crea un orden de aplicacion fragil. Si el desarrollador aplica solo una de las dos, la produccion queda en estado inconsistente.

**Why it happens:** Regla 5 dice "aplicar migracion ANTES de pushear codigo", pero no dice "aplicar TODAS las migraciones pendientes juntas".

**How to avoid:** Una sola migracion SQL `{YYYYMMDDHHMMSS}_sms_atomic_rpc.sql` que contiene:
1. `CREATE OR REPLACE FUNCTION insert_and_deduct_sms_message(...)` (nuevo)
2. `CREATE OR REPLACE FUNCTION deduct_sms_balance(...)` (reemplazo con guard anadido)
3. `CREATE OR REPLACE FUNCTION backfill_sms_message(...)` (nuevo, usado por el backfill script)
4. `GRANT EXECUTE` para los 3 a `authenticated` + `service_role`

**Warning signs:** Dos archivos de migracion nuevos con timestamps cercanos ambos tocando sms_* — reagrupar.

### Pitfall 9: `sms_balance_transactions.sms_message_id` es `ON DELETE SET NULL`

**What goes wrong:** Si un row de `sms_messages` se borra, el FK en `sms_balance_transactions.sms_message_id` se setea a NULL (no CASCADE). Esto significa que historicamente pueden existir transacciones huerfanas. El audit debe confirmar: "lista rows donde `cost_cop=0` Y tiene `sms_message_id=<id>`". Si alguna transaccion ya tiene NULL ahi, no la vamos a matchear.

**Why it happens:** Diseno de la migracion original (`20260316100000:128` — `sms_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL`).

**How to avoid:** El audit filtra por `sms_messages.cost_cop=0` (no por transactions). El backfill luego INSERTA una transaction NUEVA con el `sms_message_id` correcto — no trata de encontrar una transaccion existente a "reparar". Esto tambien es por que el defecto actual no aparece en `sms_balance_transactions` con amount=0 necesariamente — puede haber una transaccion con amount=0 vinculada, pero no es garantia.

**Warning signs:** Queries tratando de "buscar la transaccion vieja a actualizar" — abandonar ese approach, siempre INSERT NUEVO.

### Pitfall 10: Race condition durante migration apply vs hot traffic

**What goes wrong:** Regla 5 dice "aplicar migracion antes del push del codigo". Durante ese window (minutos o horas), el codigo viejo sigue llamando `deduct_sms_balance` con `p_amount=0` (el bug todavia esta en produccion). Si aplicamos el guard `RAISE EXCEPTION p_amount<=0`, TODOS esos calls empezaran a fallar instantaneamente — el domain viejo no maneja `error.code === 'P0001'` como fatal, asi que va a pasar el error como warning y seguir.

**Why it happens:** El guard es "fail-loud" retroactivamente para codigo que todavia tiene el bug.

**How to avoid:** Orden de ejecucion debe ser:
1. Aplicar la migracion CON el guard (`RAISE EXCEPTION`) — esto no rompe el SMS en si porque Onurix ya envio; solo el `deduct_sms_balance` explota en lugar de no-op. En el domain viejo, el error se logea y el codigo sigue. Impact: mismo cost_cop=0 pero con error visible en Vercel Logs.
2. Inmediatamente pushear el refactor del domain (el nuevo codigo llama `insert_and_deduct_sms_message` y tiene fallback en credits). Ventana aceptable: minutos.
3. Ejecutar audit + backfill (repara los rows historicos).

**Alternative (safer):** aplicar la migracion SIN el guard en `deduct_sms_balance` primero, luego pushear el codigo nuevo, luego aplicar una SEGUNDA migracion que solo anade el guard. Esto parte D-05 en dos pasos. **Trade-off:** mas migraciones, menos ruido en produccion durante la ventana. **Research recomienda: una sola migracion** (mas simple, ventana es corta con push inmediato). Documentar en el plan como "checkpoint bloqueante".

**Warning signs:** Entre migracion-apply y codigo-push, ver `Invalid amount: p_amount must be > 0, got 0` en Vercel Logs. Es esperado y transitorio, no es un bug nuevo.

---

## Runtime State Inventory

**Nota:** esta fase no es un rename/refactor — es un bug fix + repair. Aun asi, hay estado runtime relevante para el backfill:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `sms_messages` rows con `provider='onurix' AND cost_cop=0 AND created_at >= '2026-04-16'` — minimo 2 confirmados en debug, alcance real a determinar via audit | Backfill: UPDATE cost_cop + INSERT transactions + UPDATE balance (ver D-10) |
| Stored data | `sms_workspace_config.balance_cop` del workspace Somnio desalineado con la suma real de `cost_cop` | UPDATE via backfill (decrementar $97 * count de rows huerfanos) |
| Stored data | `sms_balance_transactions` puede tener rows con `amount_cop=0` y `type='sms_deduction'` (del bug original) | **No tocar** — son historico. El backfill INSERTA rows nuevos con `type='sms_deduction_backfill'` para auditabilidad |
| Live service config | Ningun config externo afectado — Onurix no tiene estado del lado nuestro | None |
| OS-registered state | Inngest events registrados en el worker (sms-delivery-check) — no afectados por el refactor | None — la firma del evento `sms/delivery.check` no cambia |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `ONURIX_CLIENT_ID`, `ONURIX_API_KEY` — sin cambios | None |
| Build artifacts / installed packages | `pnpm-lock.yaml` sin cambios (no nuevas deps) | None |
| Deployed code | Vercel tiene el codigo viejo (sin fallback, sin RPC nuevo). Aplicar migracion ANTES del push (Regla 5) | Push Vercel tras aplicar migracion |

**Nothing found in category (explicit):**
- **Triggers SQL sobre `sms_messages`, `sms_workspace_config`, `sms_balance_transactions`:** None — verificado por grep en migraciones (solo las 2 migraciones de SMS existen, ninguna crea triggers sobre estas tablas). Confirmado tambien en debug doc E3.
- **Otros callers de `sendSMS()` del domain:** Solo `src/lib/automations/action-executor.ts:1099` (executeSendSms) — verificado por grep `domainSendSMS|from '@/lib/domain/sms'`.
- **Otros inserts a `sms_messages` fuera del domain:** None — verificado por grep `from('sms_messages').insert` (0 matches fuera del file mismo).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase project (prod) | Migracion + RPCs + runtime | Yes (assumed) | Postgres 15+ | — |
| Node runtime | Scripts audit/backfill | Yes | 20+ (por `--env-file`) | — |
| `.env.local` con creds Supabase admin | Scripts | Yes (patron existente) | — | — |
| `ONURIX_CLIENT_ID` + `ONURIX_API_KEY` | Regression test (hace send real) | Yes | — | Mockear fetch para evitar SMS real en test |
| Vercel (prod) | Deploy del refactor | Yes | — | — |
| psql CLI local | Testear el RPC ad-hoc (opcional) | No (WSL, sin psql instalado) | — | Usar Supabase Dashboard SQL Editor |
| pgTAP | Tests unitarios del RPC | No | — | Solo regression test via `test-onurix-domain.mjs` (deferred per D-13) |

**Missing dependencies with no fallback:** None (pgTAP tiene fallback: el regression test del domain valida end-to-end).

**Missing dependencies with fallback:**
- psql local: usar Supabase Dashboard SQL Editor o exec via `createAdminClient()` en un script Node temporal.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vanilla Node scripts (NO jest/vitest/pgTAP) |
| Config file | None — scripts standalone con `node --env-file=.env.local` |
| Quick run command | `node --env-file=.env.local scripts/test-onurix-domain.mjs` |
| Full suite command | (no hay suite — los scripts son ad-hoc) |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| R1 | RPC atomico: INSERT OK + UPDATE falla → rollback completo | manual (SQL Dashboard) | Ejecutar RPC con workspace_id invalido + verificar 0 rows en sms_messages | Wave 0 — documentar en plan |
| R1 | RPC atomico: todos los 3 campos succeeden atomicamente | e2e via regression test | `node --env-file=.env.local scripts/test-onurix-domain.mjs` | Wave 3 — extend existing |
| R2 | Guard `p_amount <= 0` en `deduct_sms_balance` | manual (SQL Dashboard) | `SELECT * FROM deduct_sms_balance('<ws>', 0, NULL, 'test');` → debe lanzar RAISE EXCEPTION | Wave 0 — documentar en plan |
| R2 | Guard `p_amount <= 0` en nuevo RPC | manual (SQL Dashboard) | `SELECT * FROM insert_and_deduct_sms_message(..., 0, ...);` → RAISE EXCEPTION | Wave 0 — documentar en plan |
| R3 | Refactor domain: signature `sendSMS(ctx, params)` invariante | build check | `pnpm build` debe pasar | Yes — ya existe |
| R3 | Action executor sigue funcionando | manual (disparar automation ex-Twilio de Somnio) | Humano: disparar 1 automation y verificar SMS delivered + balance decrementa $97 | Wave 4 gate (despues del deploy) |
| R4 | Fallback `Number(credits)\|\|1` + warn | e2e via regression test | Extender `test-onurix-domain.mjs` con mock `credits=0` | Wave 3 — extend existing |
| R5 | Audit script lista correctamente | e2e | `node --env-file=.env.local scripts/audit-sms-zero-cost.mjs` — output tabla con los 2 rows conocidos | Wave 2 create |
| R5 | Backfill idempotente (re-correr es no-op) | e2e | `node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs` (dry-run) — output "0 rows to modify" | Wave 2 create |
| R6 | Regression test `credits=0` pasa | unit-ish via script | `node --env-file=.env.local scripts/test-onurix-domain.mjs` — extended case | Wave 3 |

### Sampling Rate
- **Per task commit:** `pnpm build` (TS strict)
- **Per wave merge:** `pnpm build` + manual SQL test del RPC en Supabase Dashboard
- **Phase gate:** audit muestra 0 rows afectados post-backfill + regression test pasa + 1 SMS manual disparado en produccion con balance verificado

### Wave 0 Gaps
- Documentar en el plan SQL snippets para testear cada RPC en el Supabase Dashboard (R1, R2). Lo unico que falta del harness es este set de queries.
- No hay framework de tests a instalar — el proyecto no tiene jest/vitest ni pgTAP por diseno, y el DISCUSSION-LOG los marcó como deferred.

---

## Code Examples

### plpgsql skeleton: `insert_and_deduct_sms_message`

Verified patterns: basado en `deduct_sms_balance` (`20260316100000:149-201`) + `increment_robot_job_counter` (`20260227000000:18-71`).

```sql
-- Migration: supabase/migrations/{YYYYMMDDHHMMSS}_sms_atomic_rpc.sql
-- Depends on: 20260316100000_sms_onurix_foundation.sql

-- ============================================================================
-- 1. insert_and_deduct_sms_message — atomic INSERT + UPDATE + INSERT
-- ============================================================================
CREATE OR REPLACE FUNCTION insert_and_deduct_sms_message(
  p_workspace_id UUID,
  p_provider_message_id TEXT,
  p_from_number TEXT,
  p_to_number TEXT,
  p_body TEXT,
  p_segments INTEGER,
  p_cost_cop DECIMAL,
  p_source TEXT,
  p_automation_execution_id UUID DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_amount DECIMAL DEFAULT NULL,           -- almost always equals p_cost_cop; kept explicit for clarity
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(
  success BOOLEAN,
  sms_message_id UUID,
  new_balance DECIMAL,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
  v_amount DECIMAL;
  v_sms_id UUID;
BEGIN
  -- Resolve effective amount (defaults to cost_cop when caller doesn't pass explicit p_amount)
  v_amount := COALESCE(p_amount, p_cost_cop);

  -- Guard: p_amount must be > 0 (D-06). Fail-loud; aborts entire transaction.
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: p_amount must be > 0, got %', v_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the workspace config row (serializes concurrent SMS sends per workspace)
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, 0::DECIMAL,
      'SMS no activado en este workspace'::TEXT;
    RETURN;
  END IF;

  IF NOT v_config.is_active THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, v_config.balance_cop,
      'Servicio SMS desactivado'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - v_amount;

  -- Check negative balance policy
  IF NOT v_config.allow_negative_balance AND v_new_balance < 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, v_config.balance_cop,
      'Saldo SMS insuficiente'::TEXT;
    RETURN;
  END IF;

  -- 1) INSERT sms_messages
  INSERT INTO sms_messages (
    workspace_id, provider_message_id, provider, from_number, to_number,
    body, direction, status, segments, cost_cop, source,
    automation_execution_id, contact_name
  ) VALUES (
    p_workspace_id, p_provider_message_id, 'onurix', p_from_number, p_to_number,
    p_body, 'outbound', 'sent', p_segments, p_cost_cop, p_source,
    p_automation_execution_id, p_contact_name
  )
  RETURNING id INTO v_sms_id;

  -- 2) UPDATE balance + counters (mirrors deduct_sms_balance)
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_sms_sent = total_sms_sent + 1,
      total_credits_used = total_credits_used + v_amount,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  -- 3) INSERT transaction log
  INSERT INTO sms_balance_transactions (
    workspace_id, type, amount_cop, balance_after, description, sms_message_id
  ) VALUES (
    p_workspace_id, 'sms_deduction', -v_amount, v_new_balance, p_description, v_sms_id
  );

  RETURN QUERY SELECT true::BOOLEAN, v_sms_id, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_and_deduct_sms_message(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, DECIMAL, TEXT, UUID, TEXT, DECIMAL, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_and_deduct_sms_message(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, DECIMAL, TEXT, UUID, TEXT, DECIMAL, TEXT
) TO service_role;
```

### plpgsql patch: guard en `deduct_sms_balance` (replace function)

```sql
-- ============================================================================
-- 2. deduct_sms_balance — patch: add guard p_amount <= 0 (D-05)
-- CREATE OR REPLACE replaces the existing function atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_sms_balance(
  p_workspace_id UUID,
  p_amount DECIMAL,
  p_sms_message_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
BEGIN
  -- NEW: Guard p_amount > 0 (D-05). Fail-loud on invalid input.
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: p_amount must be > 0, got %', p_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- (rest unchanged from 20260316100000_sms_onurix_foundation.sql:149-201)
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, 0::DECIMAL, 'SMS no activado en este workspace'::TEXT;
    RETURN;
  END IF;

  IF NOT v_config.is_active THEN
    RETURN QUERY SELECT false::BOOLEAN, v_config.balance_cop, 'Servicio SMS desactivado'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - p_amount;

  IF NOT v_config.allow_negative_balance AND v_new_balance < 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, v_config.balance_cop, 'Saldo SMS insuficiente'::TEXT;
    RETURN;
  END IF;

  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_sms_sent = total_sms_sent + 1,
      total_credits_used = total_credits_used + p_amount,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  INSERT INTO sms_balance_transactions (workspace_id, type, amount_cop, balance_after, description, sms_message_id)
  VALUES (p_workspace_id, 'sms_deduction', -p_amount, v_new_balance, p_description, p_sms_message_id);

  RETURN QUERY SELECT true::BOOLEAN, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_sms_balance(UUID, DECIMAL, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_sms_balance(UUID, DECIMAL, UUID, TEXT) TO service_role;
```

### plpgsql skeleton: `backfill_sms_message`

```sql
-- ============================================================================
-- 3. backfill_sms_message — atomic repair for a single orphan row
-- Used by scripts/backfill-sms-zero-cost.mjs
-- ============================================================================
CREATE OR REPLACE FUNCTION backfill_sms_message(
  p_sms_message_id UUID,
  p_expected_cost_cop DECIMAL DEFAULT 97
)
RETURNS TABLE(
  success BOOLEAN,
  workspace_id UUID,
  new_balance DECIMAL,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sms sms_messages%ROWTYPE;
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
BEGIN
  -- Load the SMS row
  SELECT * INTO v_sms FROM sms_messages WHERE id = p_sms_message_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, 0::DECIMAL,
      'sms_message not found'::TEXT;
    RETURN;
  END IF;

  -- Idempotency guard: only repair rows still at cost_cop=0
  IF v_sms.cost_cop IS NOT NULL AND v_sms.cost_cop > 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, v_sms.workspace_id, 0::DECIMAL,
      'already backfilled (cost_cop > 0)'::TEXT;
    RETURN;
  END IF;

  -- Lock workspace config
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = v_sms.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, v_sms.workspace_id, 0::DECIMAL,
      'workspace config not found'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - p_expected_cost_cop;

  -- 1) Fix the sms_messages row
  UPDATE sms_messages
  SET cost_cop = p_expected_cost_cop,
      segments = 1
  WHERE id = p_sms_message_id;

  -- 2) Update workspace_config: decrement balance + total_credits_used
  --    (do NOT increment total_sms_sent — original deduct_sms_balance already did, see Pitfall 7)
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_credits_used = total_credits_used + p_expected_cost_cop,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = v_sms.workspace_id;

  -- 3) Log the backfill transaction
  INSERT INTO sms_balance_transactions (
    workspace_id, type, amount_cop, balance_after, description, sms_message_id
  ) VALUES (
    v_sms.workspace_id, 'sms_deduction_backfill', -p_expected_cost_cop, v_new_balance,
    'Backfill post-cutover Onurix 2026-04-17', p_sms_message_id
  );

  RETURN QUERY SELECT true::BOOLEAN, v_sms.workspace_id, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_sms_message(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_sms_message(UUID, DECIMAL) TO service_role;
```

### Domain call shape: refactor de `src/lib/domain/sms.ts:124-185`

```ts
// src/lib/domain/sms.ts (refactored section — replaces lines ~124-185)

// 4. Call Onurix API to send the SMS
const onurixResponse = await sendOnurixSMS(formattedPhone, params.message)

// 5. Defensive fallback on credits (D-07, D-08)
const rawCredits = onurixResponse.data.credits
const segmentsUsed = Number(rawCredits) || 1
if (!Number(rawCredits)) {
  console.warn('[SMS] Onurix returned invalid credits, falling back to 1', {
    raw: rawCredits,
    phone: formattedPhone,
  })
}
const costCop = segmentsUsed * SMS_PRICE_COP

// 6. Atomic: INSERT sms_messages + UPDATE balance + INSERT transaction (D-01, D-03)
const { data: rpcResult, error: rpcError } = await supabase
  .rpc('insert_and_deduct_sms_message', {
    p_workspace_id: ctx.workspaceId,
    p_provider_message_id: onurixResponse.id,
    p_from_number: 'Onurix',
    p_to_number: formattedPhone,
    p_body: params.message,
    p_segments: segmentsUsed,
    p_cost_cop: costCop,
    p_source: params.source || 'domain-call',
    p_automation_execution_id: params.automationExecutionId || null,
    p_contact_name: params.contactName || null,
    p_amount: costCop,
    p_description: `SMS a ${formattedPhone} (${segmentsUsed} segmento${segmentsUsed > 1 ? 's' : ''})`,
  })
  .single()  // RPC always returns exactly 1 row — simplifies typing

// Cast to the known return shape (Supabase JS returns `unknown` for custom RPCs)
const result = rpcResult as unknown as {
  success: boolean
  sms_message_id: string | null
  new_balance: string  // DECIMAL comes back as string
  error_message: string | null
} | null

if (rpcError) {
  // RAISE EXCEPTION fired, or lock timeout, or constraint violation.
  // Nothing persisted. SMS already sent by Onurix (cannot rollback).
  console.error('[SMS] Atomic RPC failed — SMS sent but not persisted:', {
    code: rpcError.code,
    message: rpcError.message,
    dispatchId: onurixResponse.id,
    phone: formattedPhone,
  })
  return {
    success: true,
    data: {
      smsMessageId: 'unpersisted',
      dispatchId: onurixResponse.id,
      status: 'sent' as SmsStatus,
      segmentsUsed,
      costCop,
    },
  }
}

if (!result || !result.success) {
  // RPC returned success=false (e.g. workspace not active, balance insufficient).
  // SMS already sent. Nothing persisted (RPC early-returns before INSERT).
  console.error('[SMS] Atomic RPC returned success=false — SMS sent but not persisted:', {
    reason: result?.error_message,
    dispatchId: onurixResponse.id,
    phone: formattedPhone,
  })
  return {
    success: true,
    data: {
      smsMessageId: 'unpersisted',
      dispatchId: onurixResponse.id,
      status: 'sent' as SmsStatus,
      segmentsUsed,
      costCop,
    },
  }
}

const smsMessageId = result.sms_message_id!  // guaranteed non-null when success=true

// 7. Emit Inngest event for delivery verification (OUTSIDE the transaction — best-effort)
try {
  await (inngest.send as any)({
    name: 'sms/delivery.check',
    data: {
      smsMessageId,
      dispatchId: onurixResponse.id,
      workspaceId: ctx.workspaceId,
    },
  })
} catch (inngestError) {
  console.error('[SMS] Failed to emit delivery check event:', inngestError)
}

return {
  success: true,
  data: {
    smsMessageId,
    dispatchId: onurixResponse.id,
    status: 'sent' as SmsStatus,
    segmentsUsed,
    costCop,
  },
}
```

### Script skeleton: `scripts/audit-sms-zero-cost.mjs`

Based on pattern from `scripts/migrate-twilio-automations-to-onurix.mjs`.

```js
// scripts/audit-sms-zero-cost.mjs
// Run: node --env-file=.env.local scripts/audit-sms-zero-cost.mjs [--json]
// READ-ONLY audit of sms_messages rows with cost_cop=0 post-Onurix cutover.
// Safe to run at any time. Does NOT modify any data.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const JSON_OUTPUT = process.argv.includes('--json')
const CUTOVER_DATE = '2026-04-16T00:00:00-05:00'  // start of Onurix window

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const { data: rows, error } = await supabase
  .from('sms_messages')
  .select('id, workspace_id, to_number, status, segments, cost_cop, created_at, provider_message_id')
  .eq('provider', 'onurix')
  .eq('cost_cop', 0)
  .gte('created_at', CUTOVER_DATE)
  .order('created_at', { ascending: true })

if (error) {
  console.error('Query failed:', error.message)
  process.exit(1)
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ count: rows.length, rows, cutover: CUTOVER_DATE }, null, 2))
  process.exit(0)
}

// Human-readable table
console.log(`\n=== SMS Zero-Cost Audit (post-Onurix cutover ${CUTOVER_DATE}) ===\n`)
console.log(`Rows found: ${rows.length}`)
console.log('')

if (rows.length === 0) {
  console.log('[ok] No orphan rows. Nothing to backfill.')
  process.exit(0)
}

// Group by workspace for impact preview
const byWorkspace = new Map()
for (const r of rows) {
  const list = byWorkspace.get(r.workspace_id) || []
  list.push(r)
  byWorkspace.set(r.workspace_id, list)
}

console.log('By workspace:')
for (const [ws, list] of byWorkspace) {
  const { data: w } = await supabase.from('workspaces').select('name').eq('id', ws).single()
  console.log(`  ${ws} (${w?.name || '?'}): ${list.length} rows → impacto backfill: $${list.length * 97} COP`)
}
console.log('')

console.log('Detail:')
for (const r of rows) {
  console.log(`  ${r.id}  ws=${r.workspace_id.slice(0,8)}  to=${r.to_number}  status=${r.status}  created=${r.created_at}`)
}
console.log('')
console.log(`Next step: node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs            (dry-run)`)
console.log(`           node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs --apply    (write)`)
```

### Script skeleton: `scripts/backfill-sms-zero-cost.mjs`

```js
// scripts/backfill-sms-zero-cost.mjs
// Run: node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs [--apply]
// Dry-run by default. Idempotent: re-running after --apply is a no-op.
//
// For each sms_messages row with cost_cop=0 AND provider='onurix' AND created_at >= 2026-04-16:
//   1) calls RPC backfill_sms_message(id, 97) — atomic per-row repair
//   2) RPC is idempotent: skips rows where cost_cop already > 0
//
// Regla 5: --dry-run default. Operator must see impact + confirm before --apply.

import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const CUTOVER_DATE = '2026-04-16T00:00:00-05:00'
const SMS_PRICE_COP = 97

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// 1) Fetch current orphan rows (re-audit at start to avoid stale counts, see Pitfall 6)
const { data: rows, error: readErr } = await supabase
  .from('sms_messages')
  .select('id, workspace_id, to_number, created_at')
  .eq('provider', 'onurix')
  .eq('cost_cop', 0)
  .gte('created_at', CUTOVER_DATE)
  .order('created_at', { ascending: true })

if (readErr) {
  console.error('Audit read failed:', readErr.message)
  process.exit(1)
}

console.log(`\n=== Backfill SMS Zero-Cost (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`)
console.log(`Rows to process: ${rows.length}`)

if (rows.length === 0) {
  console.log('[ok] Nothing to backfill.')
  process.exit(0)
}

// Impact preview grouped by workspace
const byWs = new Map()
for (const r of rows) {
  byWs.set(r.workspace_id, (byWs.get(r.workspace_id) || 0) + 1)
}
console.log('\nImpact preview:')
for (const [ws, n] of byWs) {
  console.log(`  ${ws}: ${n} rows → decrementar $${n * SMS_PRICE_COP} COP del balance`)
}
console.log('')

if (!APPLY) {
  console.log('DRY-RUN -- pass --apply to write changes.')
  console.log(`Next: node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs --apply`)
  process.exit(0)
}

// Require explicit typed confirmation (Regla 5)
const rl = createInterface({ input, output })
const answer = await rl.question(`\nType "APPLY" to proceed: `)
rl.close()
if (answer.trim() !== 'APPLY') {
  console.log('Aborted (confirmation not matched).')
  process.exit(0)
}

// 2) Per-row atomic repair via RPC
let ok = 0, skipped = 0, failed = 0
for (const r of rows) {
  const { data: result, error } = await supabase
    .rpc('backfill_sms_message', {
      p_sms_message_id: r.id,
      p_expected_cost_cop: SMS_PRICE_COP,
    })
    .single()

  const rowResult = result
  if (error) {
    console.error(`  [FAIL] ${r.id}: ${error.message}`)
    failed++
    continue
  }
  if (!rowResult?.success) {
    console.log(`  [SKIP] ${r.id}: ${rowResult?.error_message || 'unknown'}`)
    skipped++
    continue
  }
  console.log(`  [OK]   ${r.id}  ws=${rowResult.workspace_id?.slice(0,8)}  new_balance=$${rowResult.new_balance}`)
  ok++
}

console.log(`\nDone: ok=${ok}, skipped=${skipped}, failed=${failed}`)
console.log(`Verify: run scripts/audit-sms-zero-cost.mjs — should report 0 rows.`)
if (failed > 0) process.exit(1)
```

### Regression test skeleton: extend `scripts/test-onurix-domain.mjs`

Add a separate test case that does NOT call Onurix (to avoid sending a real SMS during the test), instead mocking the provider response and calling the new RPC directly.

```js
// Append to scripts/test-onurix-domain.mjs (or create a sibling test file
// scripts/test-onurix-domain-credits-zero.mjs — same style, isolated case)

// === REGRESSION TEST (D-12): credits=0 from Onurix → fallback applies ===
console.log('\n=== REGRESSION TEST: credits=0 fallback ===')

const mockPhone = '573137549286'
const mockDispatchId = `MOCK-${Date.now()}`
const mockMessage = `[REGRESSION] credits=0 test ${new Date().toISOString()}`
const mockCredits = 0  // ← the bug trigger

// Simulate what sendOnurixSMS would return when Onurix responds with credits=0
const mockOnurixResponse = {
  status: 1,
  id: mockDispatchId,
  data: { state: 'Enviado', credits: mockCredits, sms: mockMessage, phone: mockPhone },
}

// Apply the same fallback logic the domain will apply
const rawCredits = mockOnurixResponse.data.credits
const segmentsUsed = Number(rawCredits) || 1
if (!Number(rawCredits)) {
  console.warn('[SMS] Onurix returned invalid credits, falling back to 1', {
    raw: rawCredits, phone: mockPhone,
  })
}
const costCop = segmentsUsed * SMS_PRICE_COP

console.log(`  raw credits: ${rawCredits}`)
console.log(`  segmentsUsed after fallback: ${segmentsUsed}`)
console.log(`  costCop: ${costCop}`)

if (segmentsUsed !== 1 || costCop !== 97) {
  console.error(`  [FAIL] Expected segmentsUsed=1, costCop=97. Got ${segmentsUsed}/${costCop}`)
  process.exit(1)
}

// Now call the RPC with the fallback values — verifies the RPC accepts valid input
const balanceBeforeTest = (await supabase
  .from('sms_workspace_config')
  .select('balance_cop')
  .eq('workspace_id', workspaceId)
  .single()).data.balance_cop

const { data: rpcResult, error: rpcErr } = await supabase
  .rpc('insert_and_deduct_sms_message', {
    p_workspace_id: workspaceId,
    p_provider_message_id: mockDispatchId,
    p_from_number: 'Onurix',
    p_to_number: mockPhone,
    p_body: mockMessage,
    p_segments: segmentsUsed,
    p_cost_cop: costCop,
    p_source: 'regression-test',
    p_automation_execution_id: null,
    p_contact_name: 'REGRESSION',
    p_amount: costCop,
    p_description: `[REGRESSION] credits=0 fallback test`,
  })
  .single()

if (rpcErr) {
  console.error(`  [FAIL] RPC error: ${rpcErr.message}`)
  process.exit(1)
}
if (!rpcResult?.success) {
  console.error(`  [FAIL] RPC returned success=false: ${rpcResult?.error_message}`)
  process.exit(1)
}

// Verify balance decremented by exactly 97
const balanceAfterTest = (await supabase
  .from('sms_workspace_config')
  .select('balance_cop')
  .eq('workspace_id', workspaceId)
  .single()).data.balance_cop

const diff = balanceBeforeTest - balanceAfterTest
if (diff !== 97) {
  console.error(`  [FAIL] Expected balance to decrease by 97, got ${diff} (before=${balanceBeforeTest}, after=${balanceAfterTest})`)
  process.exit(1)
}

console.log(`  [OK] sms_messages.id=${rpcResult.sms_message_id}  balance: $${balanceBeforeTest} → $${balanceAfterTest} (diff=$${diff})`)
console.log('  [OK] Regression passed: credits=0 → fallback=1 → cost=97 → balance decreased by 97')
```

### RAISE EXCEPTION verification queries (for Wave 0 documentation)

Run these in Supabase Dashboard SQL Editor after applying the migration:

```sql
-- Verify guard on deduct_sms_balance
SELECT * FROM deduct_sms_balance(
  '<any-real-workspace-id>'::UUID,
  0::DECIMAL,
  NULL::UUID,
  'test guard'
);
-- Expected: ERROR: Invalid amount: p_amount must be > 0, got 0

-- Verify guard on insert_and_deduct_sms_message
SELECT * FROM insert_and_deduct_sms_message(
  '<any-real-workspace-id>'::UUID,
  'TEST-001',
  'Onurix',
  '573000000000',
  'test guard',
  1,
  0::DECIMAL,       -- p_cost_cop
  'sql-test',
  NULL, NULL,
  0::DECIMAL,       -- p_amount (the trigger)
  'test guard'
);
-- Expected: ERROR: Invalid amount: p_amount must be > 0, got 0

-- Verify happy path (use a sandbox workspace or BEGIN/ROLLBACK)
BEGIN;
SELECT * FROM insert_and_deduct_sms_message(
  '<sandbox-ws-id>'::UUID,
  'TEST-002',
  'Onurix',
  '573000000000',
  'happy path test',
  1,
  97::DECIMAL,
  'sql-test',
  NULL, NULL,
  97::DECIMAL,
  'test happy path'
);
-- Expected: success=true, sms_message_id=<uuid>, new_balance=<old-97>, error_message=NULL
ROLLBACK;  -- Don't leave test data in prod
```

---

## Migration Filename Convention

Patron del repo [VERIFIED: ls supabase/migrations/]: `{YYYYMMDDHHMMSS}_{slug}.sql`

Ejemplos recientes:
- `20260415000000_orders_add_email.sql`
- `20260410000000_session_lifecycle_partial_unique.sql`
- `20260227000000_robot_job_atomic_counters.sql`
- `20260316100000_sms_onurix_foundation.sql`

**Para esta fase:** `20260417{HHMMSS}_sms_atomic_rpc.sql` — usar timestamp del momento de creacion. Slug corto: `sms_atomic_rpc`.

## Backfill: RPC vs pure-Node — the chosen approach

CONTEXT.md §Claude's Discretion deja abierto si el backfill va en plpgsql o en Node. Research recomienda **hibrido: RPC por row + Node como orchestrator**:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Todo en Node (3 queries sueltas por row) | Simple | No atomico por row — mismo defecto B que causo el bug | REJECT |
| Todo en plpgsql (una gran funcion que itera sobre toda la tabla) | Atomico | Mas dificil de dry-run, mas dificil de parar en medio, output menos rico | REJECT |
| **Hibrido: `backfill_sms_message(id)` RPC + Node loop** | Atomico POR ROW + CLI/UX rica en Node (dry-run, confirmacion, progress) | +1 funcion plpgsql | **SELECTED** |

El patron hibrido tambien deja la puerta abierta a re-usar `backfill_sms_message` desde el dashboard super-admin en el futuro (deferred) si se necesita reparar rows manualmente.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase PostgREST version soporta `RAISE EXCEPTION ... USING ERRCODE` y propaga el message al cliente | Pitfall 5, Code Examples | Bajo — PostgREST 12+ lo hace, Supabase runs 12+. Verificable con el SQL test del Wave 0. |
| A2 | El alcance del backfill es "pocos rows" (< 50) — no necesita batching | Script skeleton | Bajo — el debug confirmó 2 rows. Si el audit revela > 100, anadir `--batch-size` flag en un follow-up |
| A3 | `sms_workspace_config.total_sms_sent` ya fue incrementado en los rows huerfanos (porque `deduct_sms_balance` siempre incrementa) | Pitfall 7, backfill RPC | MEDIO — si `deduct_sms_balance` tiene un early-return que no alcanza el UPDATE, el incremento no paso. Verificar con query pre-backfill: `SELECT total_sms_sent FROM sms_workspace_config WHERE workspace_id='<somnio>'` y contrastar con `COUNT(sms_messages) WHERE provider='onurix' AND workspace_id=<somnio>`. Si matchean → A3 holds. |
| A4 | Onurix no tiene un segundo callback que actualice `cost_cop` asincrono (es decir, el cost se fija al send-time) | Fix direction | ALTO — si existiera un callback posterior, el fallback forzaria overwrite. Verificado: el unico callback implementado es `sms-delivery-check` que solo actualiza `status` y `delivery_checked_at` (no toca cost_cop). [VERIFIED: grep + read sms-delivery-check.ts] |
| A5 | La migracion se aplica en Supabase Dashboard SQL Editor (no via `supabase db push`) | Regla 5 checkpoint | Bajo — es el flujo operacional establecido |
| A6 | `createAdminClient()` en scripts se inicia con `createClient()` directo (no el wrapper de `@/lib/supabase/admin`) | Script skeleton | HIGH — los scripts Node NO usan el wrapper `createAdminClient()` porque no tienen paths de `@/*` resueltos. Usan `createClient()` directo con env vars. [VERIFIED: scripts/test-onurix-domain.mjs:22, migrate-twilio-automations-to-onurix.mjs:26] |

---

## Open Questions

1. **¿`deduct_sms_balance` existente sigue siendo llamado desde otros places post-refactor?**
   - What we know: Solo `src/lib/domain/sms.ts:169` y `scripts/test-onurix-domain.mjs:112` lo invocan [VERIFIED: grep]. Post-refactor, `sms.ts` ya NO lo llama (usa el nuevo RPC). El script de test sigue llamandolo como "test C" de la integracion original.
   - What's unclear: Si el super-admin dashboard tiene un boton "recargar saldo" que llama `add_sms_balance`, ¿existe tambien un boton "descontar manualmente" que llame `deduct_sms_balance`? Grep `deduct_sms_balance` en `src/app` retorna 0 matches → probablemente no, pero CONTEXT.md D-04 habla de "path de recargas / super-admin" como si fuera activo.
   - Recommendation: el planner DEBE verificar en Wave 0: `grep -r "deduct_sms_balance" src/` y `grep -r "add_sms_balance" src/`. Si son 0 en `src/`, D-04 es incorrecto y se puede deprecar `deduct_sms_balance`. Si son > 0, dejarlo como esta. **Accion segura por default: no deprecar** (regresion zero-risk).

2. **¿El workspace de Somnio tiene rows huerfanos fuera de los 2 conocidos del debug?**
   - What we know: El debug documenta 2 rows con cost_cop=0 entre 2026-04-17 15:00:58 y 15:01:46.
   - What's unclear: Desde 2026-04-16 (cierre de Plan 04, cutover Onurix) hasta el fix actual, ¿hubo mas SMS? La ventana de riesgo es ~24h.
   - Recommendation: correr `audit-sms-zero-cost.mjs` ANTES del fix para capturar el alcance real. Si son los mismos 2, el scope es pequeno. Si son mas, el impacto economico es mayor pero la logica del backfill es identica.

3. **¿El RPC atomico debe manejar el caso "ya existe un row con ese `provider_message_id`"?**
   - What we know: No hay UNIQUE constraint en `provider_message_id` post-Onurix (la migracion dropea `sms_messages_twilio_sid_key`, ver linea 35). Por lo tanto, Onurix puede devolver el mismo `id` dos veces (retry de su lado) y generariamos un duplicate row.
   - What's unclear: ¿Onurix reintenta con el mismo dispatch_id o genera uno nuevo?
   - Recommendation: fuera de scope (idempotency key es deferred). No agregar logic de duplicate detection en esta fase — documentar como riesgo residual en LEARNINGS.md.

---

## Security Domain

**ASVS applicable:**

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No afecta auth — RPC usa SECURITY DEFINER con filtro explicito por workspace_id |
| V4 Access Control | yes | Workspace isolation: el RPC filtra TODAS las queries por `p_workspace_id`. Regla 3 cumple. |
| V5 Input Validation | yes | Guard `p_amount > 0` (D-05, D-06). Tipos estrictos en plpgsql + TS. |
| V6 Cryptography | no | No hay secretos nuevos — Supabase service role key ya existente |

**Threat patterns para este stack:**

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via scripts | Tampering | Supabase JS v2 usa parametros bind, no string concatenation. Los scripts siguen el patron. |
| Privilege escalation via RPC | EoP | `SECURITY DEFINER` + filtro explicito `workspace_id` en cada query. El caller NUNCA pasa `p_workspace_id` desde input de usuario — siempre viene de `ctx.workspaceId` pre-validado. |
| Negative balance abuse | Tampering | `allow_negative_balance=false` + guard `v_new_balance < 0` en RPC. |
| Integer overflow en balance | Tampering | DECIMAL(12,2) provee rango >> realistic balances |
| Backfill abuse (malicious apply) | Tampering | Script pide confirmacion typed "APPLY". Requires Supabase admin key (solo el operador lo tiene). |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2 calls separadas (INSERT + RPC decremento) | 1 call atomica RPC | Esta fase (2026-04-17) | Cierra defect B, elimina clase entera de bugs |
| `onurixResponse.data.credits` sin fallback | `Number(credits) \|\| 1` + warn | Esta fase | Cierra defect A |
| `deduct_sms_balance` sin guard | RAISE EXCEPTION on p_amount<=0 | Esta fase | Cierra defect C (defense-in-depth) |

**Deprecated/outdated:**
- **Twilio SMS path (`@/lib/twilio`)**: eliminado en Plan 04 de `twilio-to-onurix-migration` (2026-04-17, commit 22e096b). El debug report confirma cero codigo Twilio activo [VERIFIED: debug doc E3].

---

## Sources

### Primary (HIGH confidence)
- `src/lib/domain/sms.ts` lineas 120-200 [VERIFIED: Read]
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql` lineas 1-247 completas [VERIFIED: Read]
- `supabase/migrations/20260227000000_robot_job_atomic_counters.sql` — patron `RAISE EXCEPTION` + `GRANT EXECUTE` [VERIFIED: Read]
- `scripts/test-onurix-domain.mjs` lineas 1-159 [VERIFIED: Read, linea 78 confirma patron `credits || 1`]
- `scripts/test-onurix-sms.mjs` — convenciones de script [VERIFIED: Read]
- `scripts/migrate-twilio-automations-to-onurix.mjs` — patron dry-run / --apply [VERIFIED: Read]
- `src/lib/sms/client.ts`, `src/lib/sms/types.ts`, `src/lib/sms/constants.ts` — shape de Onurix response [VERIFIED: Read]
- `src/lib/automations/action-executor.ts:1083-1108` — unico caller de `sendSMS` [VERIFIED: Read]
- `src/lib/supabase/admin.ts` — wrapper vs raw client [VERIFIED: Read]
- `src/inngest/functions/sms-delivery-check.ts` — confirma que cost_cop NO se toca post-insert [VERIFIED: Read]
- `package.json` — versiones confirmadas [VERIFIED: grep]
- `.planning/debug/sms-billing-inconsistency.md` — evidencia completa [VERIFIED: Read]
- CLAUDE.md + `.claude/rules/*.md` [VERIFIED: project instructions]

### Secondary (MEDIUM confidence)
- [Supabase RPC JS docs](https://supabase.com/docs/reference/javascript/rpc) — confirmado error shape PostgrestError [CITED]
- [PostgREST 12 error docs](https://docs.postgrest.org/en/v12/references/errors.html) — RAISE EXCEPTION propagation [CITED]

### Tertiary (LOW confidence)
- None — todas las claims tienen fuente.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stack esta fijo, 0 librerias nuevas, todas las versiones verificadas
- Architecture: HIGH — decisiones locked en CONTEXT.md, skeletons verificados contra codigo existente del repo
- Pitfalls: HIGH — 7 pitfalls derivados de lectura literal del codigo + debug doc + experiencia plpgsql documentada
- Code examples: HIGH — todos los snippets son variantes directas de codigo existente (`deduct_sms_balance`, `increment_robot_job_counter`, `migrate-twilio-automations-to-onurix.mjs`)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 dias — stack estable, sin breaking changes esperados)
