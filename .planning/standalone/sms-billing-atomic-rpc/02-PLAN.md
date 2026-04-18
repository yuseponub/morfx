---
phase: sms-billing-atomic-rpc
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/domain/sms.ts
autonomous: false

must_haves:
  truths:
    - "src/lib/domain/sms.ts:128 ahora aplica el fallback `Number(rawCredits) || 1` antes de calcular costCop (D-07)"
    - "src/lib/domain/sms.ts emite `console.warn('[SMS] Onurix returned invalid credits, falling back to 1', { raw, phone })` cuando `Number(rawCredits)` es falsy (D-08)"
    - "src/lib/domain/sms.ts:132-185 ya NO contiene calls separadas a `.from('sms_messages').insert(...)` ni a `.rpc('deduct_sms_balance', ...)`"
    - "src/lib/domain/sms.ts contiene UNA sola llamada `supabase.rpc('insert_and_deduct_sms_message', { ... }).single()` (D-03)"
    - "Si el RPC retorna `error`, el domain logea `console.error` con dispatchId+phone+code y retorna success=true con smsMessageId='unpersisted' (no rompe al caller — el SMS ya se envio)"
    - "Si el RPC retorna `success=false`, el domain logea `console.error` con error_message+dispatchId+phone y retorna success=true con smsMessageId='unpersisted'"
    - "La firma publica de `sendSMS()` y el shape de `DomainResult<SendSMSResult>` NO cambia — los callers (action-executor, scripts) no se enteran del refactor"
    - "El paso 7 (Inngest emit `sms/delivery.check`) sigue presente y usa el smsMessageId real cuando existe (NO usa 'unpersisted' como id)"
    - "El codigo compila: `npx tsc --noEmit` retorna sin errores"
    - "El codigo fue pusheado a `origin main` (Regla 1) y Vercel hizo deploy exitoso"
    - "El operador envio 1 SMS de prueba post-deploy y verifico que `sms_messages.cost_cop = 97` y `sms_workspace_config.balance_cop` decremento exactamente $97"
  artifacts:
    - path: "src/lib/domain/sms.ts"
      provides: "Domain layer SMS — refactor del paso 5-6 a single atomic RPC + fallback defensivo en credits"
      contains: "insert_and_deduct_sms_message"
    - path: "src/lib/domain/sms.ts"
      provides: "Defensive logging cuando Onurix devuelve credits=0/null/undefined/NaN"
      contains: "Onurix returned invalid credits, falling back to 1"
  key_links:
    - from: "src/lib/domain/sms.ts:sendSMS()"
      to: "Postgres RPC insert_and_deduct_sms_message (deployed en Plan 01)"
      via: "supabase.rpc('insert_and_deduct_sms_message', {...}).single()"
      pattern: "rpc\\('insert_and_deduct_sms_message'"
    - from: "src/lib/domain/sms.ts:sendSMS() fallback path"
      to: "Vercel Logs (telemetry)"
      via: "console.warn con raw credits + phone + tag '[SMS]'"
      pattern: "Onurix returned invalid credits"
---

<objective>
Refactorizar `src/lib/domain/sms.ts` para reemplazar el patron actual de "INSERT separado + RPC deduct_sms_balance separado" (Defect B raiz) por UNA sola llamada al RPC atomico `insert_and_deduct_sms_message` (deployed en Plan 01). Anadir tambien el fallback defensivo en `onurixResponse.data.credits` (Defect A — la causa observable del bug).

**Tres cambios atomicos en un solo archivo:**

1. **Linea 128 — Fallback en credits (D-07):**
   - Antes: `const segmentsUsed = onurixResponse.data.credits` (puede ser 0)
   - Despues: `const rawCredits = onurixResponse.data.credits; const segmentsUsed = Number(rawCredits) || 1`

2. **Linea ~129 — Warning explicito (D-08):**
   - `if (!Number(rawCredits)) console.warn('[SMS] Onurix returned invalid credits, falling back to 1', { raw: rawCredits, phone: formattedPhone })`

3. **Lineas 131-185 — Reemplazar INSERT + RPC separados por UNA call al nuevo RPC (D-03):**
   - Una sola `supabase.rpc('insert_and_deduct_sms_message', {...}).single()`
   - Manejo de error: PostgrestError → console.error + return success=true unpersisted
   - Manejo de success=false: console.error + return success=true unpersisted
   - Manejo de success=true: extraer smsMessageId del result, usarlo en el Inngest emit

**Por que `success=true` con `smsMessageId='unpersisted'` cuando falla el RPC:**
El SMS YA se envio (Onurix devolvio status 1). No podemos rollback el API call. El caller (action-executor, scripts) no debe ver un error porque desde su perspectiva el SMS llego. La inconsistencia queda visible en Vercel Logs como ERROR critico — deuda futura monitoreable. Mantiene paridad con el comportamiento pre-refactor (linea 159: `smsMessageId: 'unknown'`).

**Por que NO modificar la firma de `sendSMS()`:**
`action-executor.ts:executeSendSms`, `scripts/test-onurix-domain.mjs`, y otros callers no deben enterarse del refactor. El refactor es 100% interno al domain.

**Por que el push a Vercel es REQUERIDO en este plan:**
- CLAUDE.md Regla 1: SIEMPRE pushear despues de cambios de codigo antes de pedir pruebas
- Plan 03 (audit script) y Plan 04 (backfill) corren localmente contra Supabase produccion — no necesitan Vercel
- Plan 05 (regression test) tambien corre localmente — no necesita Vercel
- Pero ESTE plan modifica el path de SMS production runtime — debe estar deployed para que cualquier SMS real use el nuevo flujo

**Pre-requisito BLOQUEANTE:**
Plan 01 (migracion SQL) debe estar APLICADO en produccion. El humano confirmo "migracion aplicada" al cierre del checkpoint de Plan 01. Si no, este plan ABORTA en su Task 1 pre-flight check.

Purpose: Cerrar el Defect A (fallback faltante) y completar el cierre del Defect B (no atomicidad) en el codigo de produccion.

Output: `src/lib/domain/sms.ts` refactorizado, compilando, pusheado a Vercel, deployed, y verificado con 1 SMS real.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-billing-atomic-rpc/CONTEXT.md
@.planning/standalone/sms-billing-atomic-rpc/RESEARCH.md
@.planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md
@CLAUDE.md
@src/lib/domain/sms.ts
@src/lib/domain/types.ts
@src/lib/sms/types.ts
@src/lib/sms/constants.ts

<interfaces>
<!-- Codigo ACTUAL a reemplazar (lineas 124-185 de src/lib/domain/sms.ts) -->

// 4. Call Onurix API to send the SMS
const onurixResponse = await sendOnurixSMS(formattedPhone, params.message)

// Calculate actual cost from Onurix response (credits = actual segments used)
const segmentsUsed = onurixResponse.data.credits   // <-- DEFECT A (puede ser 0)
const costCop = segmentsUsed * SMS_PRICE_COP

// 5. Log message to sms_messages table
const { data: smsRecord, error: insertError } = await supabase
  .from('sms_messages')
  .insert({ ... })                                  // <-- DEFECT B primera mitad
  .select('id')
  .single()

if (insertError || !smsRecord) { ... }              // <-- early return si INSERT falla

// 6. Deduct balance via atomic RPC
const { data: deductResult, error: deductError } = await supabase.rpc(
  'deduct_sms_balance',                              // <-- DEFECT B segunda mitad
  { p_workspace_id, p_amount, p_sms_message_id, p_description }
)

if (deductError) { console.error... }               // <-- manejo asimetrico
else if (deductResult && deductResult.length > 0 && !deductResult[0].success) { console.warn... }

<!-- Codigo NUEVO (extraido de RESEARCH.md lineas 759-871) — REEMPLAZA los bloques anteriores -->

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
  .single()

const result = rpcResult as unknown as {
  success: boolean
  sms_message_id: string | null
  new_balance: string
  error_message: string | null
} | null

if (rpcError) {
  console.error('[SMS] Atomic RPC failed — SMS sent but not persisted:', {
    code: rpcError.code,
    message: rpcError.message,
    dispatchId: onurixResponse.id,
    phone: formattedPhone,
  })
  return {
    success: true,
    data: { smsMessageId: 'unpersisted', dispatchId: onurixResponse.id, status: 'sent' as SmsStatus, segmentsUsed, costCop },
  }
}

if (!result || !result.success) {
  console.error('[SMS] Atomic RPC returned success=false — SMS sent but not persisted:', {
    reason: result?.error_message,
    dispatchId: onurixResponse.id,
    phone: formattedPhone,
  })
  return {
    success: true,
    data: { smsMessageId: 'unpersisted', dispatchId: onurixResponse.id, status: 'sent' as SmsStatus, segmentsUsed, costCop },
  }
}

const smsMessageId = result.sms_message_id!  // guaranteed non-null when success=true

// 7. Emit Inngest event for delivery verification (OUTSIDE the transaction — best-effort)
try {
  await (inngest.send as any)({
    name: 'sms/delivery.check',
    data: { smsMessageId, dispatchId: onurixResponse.id, workspaceId: ctx.workspaceId },
  })
} catch (inngestError) {
  console.error('[SMS] Failed to emit delivery check event:', inngestError)
}

return {
  success: true,
  data: { smsMessageId, dispatchId: onurixResponse.id, status: 'sent' as SmsStatus, segmentsUsed, costCop },
}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactorizar src/lib/domain/sms.ts (fallback + atomic RPC) y commitear</name>
  <read_first>
    - .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md (CONFIRMAR que dice "migracion aplicada" — sin esto este plan no puede correr)
    - src/lib/domain/sms.ts COMPLETO (entender el contexto del paso 1-3 que se mantiene + paso 7 Inngest que se reusa)
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Domain call shape (lineas 759-871) — CODIGO LISTO para copiar
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Pitfall 2 (lineas 302-313) — `.single()` vs sin `.single()` — usar .single() porque RETURN QUERY de un solo SELECT devuelve 1 row
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Pitfall 3 (lineas 314-325) — PostgrestError vs domain success=false (DOS canales de error diferentes — manejarlos por separado)
    - .planning/standalone/sms-billing-atomic-rpc/CONTEXT.md §D-03, D-07, D-08 (lineas 34, 42, 43)
  </read_first>
  <action>
    **Paso 0 — Pre-flight check (BLOQUEANTE):**

    ```bash
    test -f .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md && grep -q "migracion aplicada" .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md
    ```
    Si falla: ABORTAR. El RPC no existe en produccion, deployar este codigo causaria SMS fallidos.

    Tambien verificar que la migracion existe en disco:
    ```bash
    ls supabase/migrations/2026041*_sms_atomic_rpc.sql
    ```

    **Paso 1 — Refactor de `src/lib/domain/sms.ts`:**

    Reemplazar el bloque entre la linea 124 (`// 4. Call Onurix API to send the SMS`) y la linea 200 (cierre del paso 7 Inngest emit + return final), por el bloque del `<interfaces>` arriba (extraido de RESEARCH.md lineas 759-871).

    Cambios PRECISOS:

    a) **Linea 127-128:** Reemplazar:
    ```typescript
    // Calculate actual cost from Onurix response (credits = actual segments used)
    const segmentsUsed = onurixResponse.data.credits
    const costCop = segmentsUsed * SMS_PRICE_COP
    ```
    Por:
    ```typescript
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
    ```

    b) **Lineas 131-185:** Reemplazar todo el bloque "// 5. Log message to sms_messages table" (incluido el `if (insertError || !smsRecord)` early return) Y todo el bloque "// 6. Deduct balance via atomic RPC" (incluido sus dos chequeos asimetricos) por el bloque ATOMICO de RESEARCH.md (con .single() + 2 chequeos de error simétricos):

    ```typescript
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
      .single()

    const result = rpcResult as unknown as {
      success: boolean
      sms_message_id: string | null
      new_balance: string
      error_message: string | null
    } | null

    if (rpcError) {
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
    ```

    c) **Paso 7 (Inngest):** El bloque actual usa `smsRecord.id`. Reemplazar TODAS las referencias a `smsRecord.id` por `smsMessageId` (la nueva variable). El paso 7 queda:
    ```typescript
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
    ```

    d) **Return final:** Reemplazar el return final que usa `smsRecord.id` por:
    ```typescript
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

    e) **Comentario header:** Actualizar el comentario "Pattern" (lineas 7-15) para reflejar el nuevo flujo:
    ```typescript
    // Pattern:
    //   1. createAdminClient() (bypasses RLS)
    //   2. Filter by ctx.workspaceId on every query
    //   3. Validate phone, check time window, check balance
    //   4. Call Onurix API
    //   5. Apply defensive fallback on credits (Number(raw) || 1 + warn)
    //   6. Atomic RPC: INSERT sms_messages + UPDATE balance + INSERT transaction (one transaction)
    //   7. Emit Inngest event for delivery verification (best-effort, outside transaction)
    //   8. Return DomainResult<SendSMSResult>
    ```

    **Paso 2 — Verificar que NO quedan referencias al patron viejo:**

    ```bash
    grep -n "deduct_sms_balance" src/lib/domain/sms.ts
    # Expected: 0 matches (deduct_sms_balance ya no se llama desde el domain)

    grep -n ".from('sms_messages').insert" src/lib/domain/sms.ts
    # Expected: 0 matches (el INSERT vive ahora dentro del RPC)

    grep -n "smsRecord" src/lib/domain/sms.ts
    # Expected: 0 matches (la variable smsRecord ya no existe)

    grep -n "insertError" src/lib/domain/sms.ts
    # Expected: 0 matches (el manejo de insertError ya no existe)

    grep -c "insert_and_deduct_sms_message" src/lib/domain/sms.ts
    # Expected: 1 match (la unica llamada al nuevo RPC)

    grep -c "Onurix returned invalid credits" src/lib/domain/sms.ts
    # Expected: 1 match (el warn del fallback)

    grep -c "smsMessageId: 'unpersisted'" src/lib/domain/sms.ts
    # Expected: 2 matches (manejo de rpcError + manejo de result.success=false)
    ```

    Si CUALQUIERA de estos conteos NO matchea, REVISAR el archivo y completar el refactor antes de continuar.

    **Paso 3 — Verificar TypeScript compila:**

    ```bash
    npx tsc --noEmit 2>&1 | tee /tmp/tsc-output.log
    ```

    Expected: SIN errores. Si hay errores en `src/lib/domain/sms.ts`, REVISAR (probablemente un cast mal hecho, una variable no definida, o un import faltante).

    Si hay errores en OTROS archivos que NO modificamos, capturar los mensajes y reportar — pueden ser pre-existentes (no bloquean si son irrelevantes a este cambio).

    **Paso 4 — Commit (NO push aun — el push lo hace Task 2):**

    ```bash
    git add src/lib/domain/sms.ts
    git commit -m "feat(sms-billing-atomic-rpc-02): refactor sendSMS to atomic RPC + defensive fallback

    Replaces the non-atomic INSERT + RPC pattern in sendSMS() with a single
    call to insert_and_deduct_sms_message (deployed in Plan 01). Eliminates
    Defect B (silent divergence between sms_messages and balance) by design.

    Also adds defensive fallback for Onurix's credits field (D-07, D-08):
      - Replaces 'const segmentsUsed = onurixResponse.data.credits' (which
        could be 0 — the active cause of the production bug) with
        'Number(rawCredits) || 1'
      - Emits console.warn when fallback applies, so future Onurix anomalies
        leave a trace in Vercel Logs

    Behavior changes:
      - On RPC error (PostgrestError): logs ERROR + returns success=true with
        smsMessageId='unpersisted'. SMS already sent by Onurix; cannot rollback.
      - On RPC success=false: same handling. Visible in Vercel Logs as ERROR.
      - On RPC success=true: returns smsMessageId from RPC result, used in
        Inngest delivery-check emit and DomainResult.

    Public sendSMS() signature and DomainResult shape unchanged. Callers
    (action-executor, scripts) require no modification.

    Implements D-03, D-07, D-08.
    Requires: Plan 01 migration applied in production.

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
    ```

    NO ejecutar `git push` aun — Task 2 lo hace junto al commit de la migracion (si Plan 01 no fue pusheado por separado).
  </action>
  <verify>
    <automated>test "$(grep -c 'deduct_sms_balance' src/lib/domain/sms.ts)" = "0" && echo "OK: deduct_sms_balance removed from sms.ts"</automated>
    <automated>test "$(grep -c 'insert_and_deduct_sms_message' src/lib/domain/sms.ts)" = "1" && echo "OK: insert_and_deduct_sms_message called once"</automated>
    <automated>test "$(grep -c 'Onurix returned invalid credits' src/lib/domain/sms.ts)" = "1" && echo "OK: warn message present"</automated>
    <automated>test "$(grep -c "smsMessageId: 'unpersisted'" src/lib/domain/sms.ts)" = "2" && echo "OK: 2 unpersisted-fallback returns (rpcError + success=false)"</automated>
    <automated>test "$(grep -c 'Number(rawCredits) || 1' src/lib/domain/sms.ts)" = "1" && echo "OK: fallback expression"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "src/lib/domain/sms.ts.*error" && echo "FAIL: TS errors in sms.ts" || echo "OK: sms.ts compiles"</automated>
    <automated>git log -1 --oneline | grep -qE "sms-billing-atomic-rpc-02" && echo "OK: commit registered"</automated>
  </verify>
  <done>
    - `src/lib/domain/sms.ts` refactorizado: fallback en credits + atomic RPC + simetric error handling
    - 0 referencias a `deduct_sms_balance` o `.from('sms_messages').insert(...)` en el archivo
    - 1 llamada `supabase.rpc('insert_and_deduct_sms_message', ...).single()`
    - 2 ramas que retornan `smsMessageId: 'unpersisted'` (PostgrestError + success=false)
    - TypeScript compila sin errores en sms.ts
    - Commit local registrado con prefijo `sms-billing-atomic-rpc-02`
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Push a Vercel + humano envia SMS de prueba post-deploy y verifica cost_cop=97 (Regla 1)</name>
  <read_first>
    - .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md
    - El estado actual de git: `git log -2 --oneline` (debe haber 2 commits: Plan 01 + Plan 02)
    - CLAUDE.md §Regla 1 — push a Vercel antes de pedir pruebas
  </read_first>
  <what-built>
    - Plan 01: migracion SQL aplicada en produccion (humano la corrio en Dashboard)
    - Plan 02 Task 1: `src/lib/domain/sms.ts` refactorizado, compila, commiteado local

    **Lo que falta:**
    1. Pushear a `origin main` (esto dispara el deploy de Vercel automaticamente)
    2. Esperar que Vercel termine el deploy (usualmente 60-90s)
    3. HUMANO envia 1 SMS de prueba (via la app produccion o via script existente)
    4. HUMANO verifica en Supabase que el SMS se persistio con `cost_cop=97`, `segments=1`, y que `balance_cop` decremento exactamente $97

    **Por que el push y el test van JUNTOS en este checkpoint:**
    - Si pusheamos sin verificar, podemos romper el path SMS de production en silencio
    - El test es rapido (envio 1 SMS + 2 SQL queries)
    - Es el primer punto de la fase donde hay codigo runtime en produccion — debemos confirmar que funciona end-to-end antes de los siguientes plans
  </what-built>
  <how-to-verify>
    **Paso 1 — Verificar que Plan 01 fue pusheado (o pushearlo ahora):**

    ```bash
    # Ver si el commit de Plan 01 ya esta en remoto
    git log origin/main --oneline -5
    ```

    Si el commit `sms-billing-atomic-rpc-01` NO aparece en origin/main, hay que pushearlo junto con Plan 02. Es seguro porque la migracion ya esta aplicada (humano confirmo).

    **Paso 2 — Push (HUMANO o ejecutor):**

    ```bash
    git push origin main
    ```

    Expected: 1 o 2 commits empujados (Plan 01 si no estaba + Plan 02). Sin errores. Vercel detecta el push y arranca un deploy.

    **Paso 3 — Esperar el deploy de Vercel (HUMANO):**

    1. Abrir https://vercel.com/{team}/{project}/deployments
    2. Esperar que el ultimo deploy pase de "Building" → "Ready" (verde)
    3. Click en el deploy y ver que NO hay errores de build
    4. Si falla el build:
       - Capturar el log
       - Lo mas probable: error de TS que paso `npx tsc --noEmit` local pero falla en Vercel (configuracion strict diferente)
       - Reportar al ejecutor

    **Paso 4 — Capturar balance pre-test (HUMANO corre en SQL Editor Supabase):**

    ```sql
    SELECT workspace_id, balance_cop, total_sms_sent
    FROM sms_workspace_config
    WHERE is_active = true AND balance_cop >= 100
    ORDER BY balance_cop DESC
    LIMIT 3;
    ```

    Anotar: `<workspace_id_test>` y `<balance_pre>`.

    **Paso 5 — Enviar 1 SMS de prueba (HUMANO):**

    Opcion A — Usar la UI de la app:
    1. Loguearse al workspace `<workspace_id_test>` en https://morfx.app
    2. Ir a un contacto + enviar un SMS manual
    3. Confirmar visualmente que la UI dice "SMS enviado"

    Opcion B — Usar el script existente:
    ```bash
    node --env-file=.env.local scripts/test-onurix-domain.mjs
    ```
    Este script invoca `sendOnurixSMS` directamente + RPC viejo `deduct_sms_balance`. NO usa el path refactorizado. SIRVE para validar que el RPC `deduct_sms_balance` SIGUE funcionando con el guard nuevo (D-04 verificado), pero NO valida `insert_and_deduct_sms_message`.

    Opcion C — Disparar via automatizacion:
    1. Crear una automatizacion con accion "send_sms"
    2. Trigger manual
    3. Verificar que llama a `sendSMS` del domain (que ahora usa el nuevo RPC)

    **Recomendado: Opcion A** (camino real de produccion).

    **Paso 6 — Verificar que el SMS se persistio correctamente (HUMANO):**

    ```sql
    SELECT
      id,
      to_number,
      provider,
      provider_message_id,
      cost_cop,
      segments,
      source,
      created_at
    FROM sms_messages
    WHERE workspace_id = '<workspace_id_test>'
      AND created_at >= now() - interval '5 minutes'
    ORDER BY created_at DESC
    LIMIT 3;
    ```

    Expected: 1 row reciente con:
    - `cost_cop = 97` (NO 0 — el bug corregido)
    - `segments = 1` (o el valor real si el mensaje fue largo)
    - `provider = 'onurix'`
    - `source = 'domain-call'` o el source del caller (UI=`'manual'`, automatizacion=`'automation'`)
    - `provider_message_id` populado (no null)

    **Paso 7 — Verificar balance decremento (HUMANO):**

    ```sql
    SELECT balance_cop, total_sms_sent, total_credits_used
    FROM sms_workspace_config
    WHERE workspace_id = '<workspace_id_test>';
    ```

    Expected:
    - `balance_cop = <balance_pre> - 97` (decremento exacto)
    - `total_sms_sent = <pre> + 1`
    - `total_credits_used = <pre> + 97`

    **Paso 8 — Verificar transaction registrada (HUMANO):**

    ```sql
    SELECT type, amount_cop, balance_after, description, sms_message_id, created_at
    FROM sms_balance_transactions
    WHERE workspace_id = '<workspace_id_test>'
      AND created_at >= now() - interval '5 minutes'
    ORDER BY created_at DESC
    LIMIT 3;
    ```

    Expected: 1 row reciente con:
    - `type = 'sms_deduction'`
    - `amount_cop = -97`
    - `balance_after = <balance_pre - 97>`
    - `sms_message_id` populado y matchea el id del Paso 6

    **Paso 9 — (Opcional) Verificar Vercel Logs:**

    En Vercel dashboard → ver logs de la funcion serverless que envio el SMS:
    - Buscar `[SMS] Atomic RPC` — NO debe aparecer (significa que TODO funciono)
    - Buscar `[SMS] Onurix returned invalid credits` — NO debe aparecer (significa que credits>0)

    Si aparece `[SMS] Atomic RPC failed` o `[SMS] Atomic RPC returned success=false` → BUG en el refactor o en el RPC. Capturar el log + investigar.

    Si aparece `[SMS] Onurix returned invalid credits` → la API de Onurix devolvio credits=0/null. El fallback aplico. NO es un fail (el SMS se persistio con cost_cop=97), pero documenta que Onurix sigue mostrando comportamiento erratico — anotar para `LEARNINGS.md`.

    **Paso 10 — Confirmacion al ejecutor:**

    Escribir literalmente "deploy verificado, cost_cop=97" cuando:
    - El deploy de Vercel paso a Ready
    - El SMS se envio exitosamente
    - `sms_messages.cost_cop = 97` (NO 0)
    - `balance_cop` decremento exactamente $97
    - `sms_balance_transactions` tiene 1 row con amount_cop=-97

    Si algo fallo:
    - "deploy fallo: <log>" → ejecutor revisa el error de build
    - "cost_cop sigue en 0" → el fallback no funciono o el RPC no se llamo. Capturar el row + Vercel logs.
    - "balance no decremento" → el RPC no se llamo o retorno success=false. Capturar Vercel logs.
  </how-to-verify>
  <resume-signal>
    Escribe "deploy verificado, cost_cop=97" cuando el SMS de prueba quedo persistido con cost_cop=97, balance decremento $97, y transaction registrada.
    Si algo fallo, describir el error y NO confirmar — el agente revisara el log.
    NO declarar Plan 02 completo sin la verificacion end-to-end (Regla 1: pruebas SIEMPRE despues de push).
  </resume-signal>
</task>

</tasks>

<verification>
- `src/lib/domain/sms.ts` ya NO contiene `deduct_sms_balance` ni `.from('sms_messages').insert(...)`.
- `src/lib/domain/sms.ts` contiene exactamente 1 llamada a `insert_and_deduct_sms_message`.
- `src/lib/domain/sms.ts` aplica `Number(rawCredits) || 1` con `console.warn` cuando el fallback aplica.
- TypeScript compila sin errores (`npx tsc --noEmit`).
- Commit `sms-billing-atomic-rpc-02` en git local.
- Push a `origin main` exitoso.
- Vercel deploy paso a Ready sin errores de build.
- 1 SMS real enviado en produccion con cost_cop=97, balance decremento exacto, transaction registrada.
</verification>

<success_criteria>
- Defect A (fallback faltante en credits) cerrado: cualquier respuesta Onurix con credits=0/null/undefined/NaN ahora resulta en cost_cop=97 + warn en logs.
- Defect B (no atomicidad) cerrado en codigo de produccion: el patron INSERT-RPC separado fue eliminado del path real de produccion.
- Path SMS de produccion deployed y validado end-to-end con 1 SMS real.
- Listo para Plan 03 (audit) y Plan 04 (backfill) que reparan la deuda historica.
- Listo para Plan 05 (regression test) que cementa la proteccion contra regresiones del Defect A.
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-billing-atomic-rpc/02-SUMMARY.md` documenting:
- Diff resumido de `src/lib/domain/sms.ts` (lineas eliminadas: ~50, lineas anadidas: ~70)
- Hash del commit local + remoto
- URL del deploy de Vercel
- ID del SMS de prueba (sms_messages.id) + workspace_id usado
- Snapshot del balance pre/post (debe diferir en exactamente $97)
- Snapshot del row insertado en sms_balance_transactions (sms_message_id + amount_cop=-97)
- Decisiones implementadas: D-03, D-07, D-08
- Confirmacion humana "deploy verificado, cost_cop=97" + timestamp
- Notas relevantes:
  - Si Vercel Logs mostraron `[SMS] Onurix returned invalid credits` durante el test → Onurix sigue devolviendo basura ocasionalmente, anotar para LEARNINGS
  - Si NO aparecio el warn → Onurix devolvio credits=1 o mas, el flujo completo fue happy path
- NEXT: Plan 03 (audit script — read-only) puede iniciar
</output>
</content>
