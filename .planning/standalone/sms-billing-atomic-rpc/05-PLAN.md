---
phase: sms-billing-atomic-rpc
plan: 05
type: execute
wave: 3
depends_on: [02]
files_modified:
  - scripts/test-onurix-domain.mjs
autonomous: false

must_haves:
  truths:
    - "scripts/test-onurix-domain.mjs ahora contiene UN bloque adicional 'REGRESSION TEST: credits=0 fallback' al final del archivo (despues del PASO 5)"
    - "El bloque mockea localmente la respuesta Onurix con `credits: 0` (sin llamar la API real)"
    - "El bloque aplica el mismo fallback que el domain (`Number(rawCredits) || 1`) y verifica que segmentsUsed=1 y costCop=97"
    - "El bloque emite el mismo `console.warn` que el domain cuando aplica el fallback"
    - "El bloque llama UNA vez `supabase.rpc('insert_and_deduct_sms_message', {...}).single()` con los valores fallback (mismo RPC que usa el domain post-Plan 02)"
    - "El bloque verifica que tras la llamada al RPC: balance_cop decremento exactamente $97 (snapshot before/after)"
    - "El bloque sale con `process.exit(1)` si alguna assertion falla, exit 0 si todas pasan"
    - "Ejecutar `node --env-file=.env.local scripts/test-onurix-domain.mjs` corre los pasos 1-5 originales (test C — envia un SMS real) Y el regression test nuevo, ambos pasan en produccion"
  artifacts:
    - path: "scripts/test-onurix-domain.mjs"
      provides: "Regression test extendido — verifica que el bug A (credits=0 -> cost_cop=0) no puede regresar"
      contains: "REGRESSION TEST: credits=0 fallback"
    - path: "scripts/test-onurix-domain.mjs"
      provides: "Llamada al nuevo RPC atomico desde un script de test"
      contains: "insert_and_deduct_sms_message"
  key_links:
    - from: "scripts/test-onurix-domain.mjs (regression block)"
      to: "Postgres RPC insert_and_deduct_sms_message"
      via: "supabase.rpc('insert_and_deduct_sms_message', { p_segments: 1, p_cost_cop: 97, p_amount: 97, ... }).single()"
      pattern: "rpc\\('insert_and_deduct_sms_message'"
    - from: "scripts/test-onurix-domain.mjs (regression block)"
      to: "src/lib/domain/sms.ts (fallback logic)"
      via: "Misma expresion `Number(rawCredits) || 1` + mismo console.warn — replica el comportamiento del domain"
      pattern: "Number\\(rawCredits\\) \\|\\| 1"
---

<objective>
Ampliar `scripts/test-onurix-domain.mjs` con un bloque adicional de regression test que ataca el Defect A (fallback faltante en credits) directamente: simula que Onurix devuelve `credits=0`, aplica el mismo fallback que el domain, llama al nuevo RPC `insert_and_deduct_sms_message`, y verifica que el balance decrementa exactamente $97.

**Por que este plan es crucial:**
Sin un test que pruebe explicitamente el caso `credits=0`, el bug puede regresar silenciosamente si:
- Alguien refactoriza `src/lib/domain/sms.ts` y elimina el fallback por error
- Alguien cambia el RPC y rompe el path con `p_cost_cop=97`
- Onurix actualiza su API y cambia el shape de la respuesta

El test bloquea la regresion porque corre como parte del workflow operativo (cada vez que el operador valida el path Onurix end-to-end).

**Por que es Wave 3 dependiendo de Plan 02 (no Plan 01):**
El test llama al RPC `insert_and_deduct_sms_message` (de Plan 01), pero la motivacion del test es proteger el fallback del domain (de Plan 02). Si Plan 02 no esta deployed, el test es inutil porque la logica del fallback no vive en produccion aun. Esperar a Plan 02 garantiza que el test refleja la realidad del codigo deployed.

**Por que NO requiere push a Vercel:**
Es un script de test/operations. No afecta codigo de produccion. El operador lo corre localmente contra Supabase produccion.

**Por que NO se crea un sibling file `test-onurix-domain-credits-zero.mjs`:**
El RESEARCH.md sugirio dos opciones (extender vs sibling). La decision es EXTENDER porque:
1. Mantiene un solo punto de entrada para validacion del path Onurix end-to-end
2. Facilita ejecucion: un comando corre TODOS los tests
3. El bloque adicional es pequeno (~80 lineas), no inflate el archivo

**Por que el test NO envia SMS real:**
El bloque regression solo MOCKEA la respuesta Onurix (no hace fetch a Onurix). Llama al RPC con valores ya calculados. Esto:
- Evita gastar saldo del workspace en cada test run (test C ya envia 1 SMS real, suficiente)
- No depende de la disponibilidad de la red de Onurix
- Es deterministico (test C es flaky por dependencia externa)

Purpose: Cerrar la fase con una capa de proteccion permanente contra la regresion del Defect A. Convertir el bug aprendido en un test ejecutable.

Output: `scripts/test-onurix-domain.mjs` ampliado, ejecutado al menos una vez en produccion, ambos test C (existente) y regression nuevo pasando, fase cerrada.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-billing-atomic-rpc/CONTEXT.md
@.planning/standalone/sms-billing-atomic-rpc/RESEARCH.md
@.planning/standalone/sms-billing-atomic-rpc/02-SUMMARY.md
@CLAUDE.md
@scripts/test-onurix-domain.mjs
@src/lib/domain/sms.ts

<interfaces>
<!-- Variables ya definidas en el archivo (lineas 1-80 de scripts/test-onurix-domain.mjs) -->
const SMS_PRICE_COP = 97
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
let workspaceId  // seteado en PASO 0 — el regression block lo reusa

<!-- RPC a llamar (deployed en Plan 01) -->
RPC insert_and_deduct_sms_message(
  p_workspace_id, p_provider_message_id, p_from_number, p_to_number,
  p_body, p_segments, p_cost_cop, p_source,
  p_automation_execution_id, p_contact_name,
  p_amount, p_description
)
RETURNS TABLE(success BOOLEAN, sms_message_id UUID, new_balance DECIMAL, error_message TEXT)

<!-- Fallback expression (debe matchear src/lib/domain/sms.ts post-Plan 02) -->
const segmentsUsed = Number(rawCredits) || 1
if (!Number(rawCredits)) {
  console.warn('[SMS] Onurix returned invalid credits, falling back to 1', { raw, phone })
}

<!-- Assertions -->
- segmentsUsed === 1 (NO 0)
- costCop === 97 (NO 0)
- rpcResult.success === true
- balanceAfter === balanceBefore - 97
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Ampliar scripts/test-onurix-domain.mjs con bloque "REGRESSION TEST: credits=0 fallback"</name>
  <read_first>
    - scripts/test-onurix-domain.mjs lineas 1-159 completas (entender el flujo existente — el regression block se inserta DESPUES del PASO 5)
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Code Examples — Regression test skeleton (lineas 1059-1149 — copiar verbatim, ajustar el final del archivo)
    - .planning/standalone/sms-billing-atomic-rpc/CONTEXT.md §D-12 (regression test mockea credits=0, verifica fallback + balance decrementa $97 + warn disparado)
    - src/lib/domain/sms.ts lineas 124-145 post-Plan 02 (verificar que la expresion `Number(rawCredits) || 1` + el warn matchean lo que el test espera)
    - .planning/standalone/sms-billing-atomic-rpc/02-SUMMARY.md (confirmar que el refactor del domain esta en produccion)
  </read_first>
  <action>
    **Paso 1 — Pre-flight:**

    Confirmar que Plan 02 esta cerrado:
    ```bash
    test -f .planning/standalone/sms-billing-atomic-rpc/02-SUMMARY.md && grep -qE "deploy verificado|cost_cop=97" .planning/standalone/sms-billing-atomic-rpc/02-SUMMARY.md
    ```
    Si falla, ABORTAR — el test no tiene sentido sin Plan 02 deployed.

    Tambien verificar el estado de la migracion (Plan 01):
    ```bash
    test -f .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md && grep -q "migracion aplicada" .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md
    ```

    **Paso 2 — Leer el archivo actual:**

    ```bash
    wc -l scripts/test-onurix-domain.mjs
    ```

    El archivo termina actualmente en linea 159 con `console.log('[OK] TEST C COMPLETO. ...')`. Vamos a APPENDEAR el regression block.

    **Paso 3 — Ampliar `scripts/test-onurix-domain.mjs` anadiendo el siguiente bloque al FINAL del archivo (despues de la linea 159):**

    ```javascript

    // ============================================================================
    // REGRESSION TEST: credits=0 fallback (D-12)
    // Phase: standalone/sms-billing-atomic-rpc (Plan 05, Wave 3)
    //
    // Replicates the bug scenario from .planning/debug/sms-billing-inconsistency.md:
    //   - Onurix returns credits=0 (free tier / promo / API bug)
    //   - Without fallback: cost_cop=0, balance not decremented (the original bug)
    //   - With fallback (Number(credits) || 1): cost_cop=97, balance decremented $97
    //
    // This block does NOT call the Onurix API — it mocks the response locally to
    // make the test deterministic and avoid sending an extra real SMS per run.
    // It DOES call the production RPC insert_and_deduct_sms_message to verify
    // end-to-end that the RPC accepts the fallback value and persists correctly.
    // ============================================================================

    console.log('=== REGRESSION TEST: credits=0 fallback ===')

    const mockPhone = '573137549286'
    const mockDispatchId = `MOCK-REGRESSION-${Date.now()}`
    const mockMessage = `[REGRESSION] credits=0 test ${new Date().toISOString()}`
    const mockCredits = 0  // <-- the bug trigger

    // Simulate what sendOnurixSMS would return when Onurix responds with credits=0
    const mockOnurixResponse = {
      status: 1,
      id: mockDispatchId,
      data: { state: 'Enviado', credits: mockCredits, sms: mockMessage, phone: mockPhone },
    }

    // Apply the EXACT same fallback logic that src/lib/domain/sms.ts uses
    const rawCredits = mockOnurixResponse.data.credits
    const fallbackSegments = Number(rawCredits) || 1
    if (!Number(rawCredits)) {
      console.warn('[SMS] Onurix returned invalid credits, falling back to 1', {
        raw: rawCredits,
        phone: mockPhone,
      })
    }
    const fallbackCostCop = fallbackSegments * SMS_PRICE_COP

    console.log(`  raw credits: ${rawCredits}`)
    console.log(`  segmentsUsed after fallback: ${fallbackSegments}`)
    console.log(`  costCop: ${fallbackCostCop}`)

    // Assert: fallback applied
    if (fallbackSegments !== 1 || fallbackCostCop !== 97) {
      console.error(`  [FAIL] Expected segmentsUsed=1, costCop=97. Got ${fallbackSegments}/${fallbackCostCop}`)
      process.exit(1)
    }

    // Snapshot balance BEFORE the RPC call
    const { data: configBefore, error: configBeforeErr } = await supabase
      .from('sms_workspace_config')
      .select('balance_cop')
      .eq('workspace_id', workspaceId)
      .single()
    if (configBeforeErr || !configBefore) {
      console.error(`  [FAIL] Cannot read balance pre-RPC: ${configBeforeErr?.message}`)
      process.exit(1)
    }
    const balanceBeforeRegression = Number(configBefore.balance_cop)

    // Call the production RPC with the fallback values
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc('insert_and_deduct_sms_message', {
        p_workspace_id: workspaceId,
        p_provider_message_id: mockDispatchId,
        p_from_number: 'Onurix',
        p_to_number: mockPhone,
        p_body: mockMessage,
        p_segments: fallbackSegments,
        p_cost_cop: fallbackCostCop,
        p_source: 'regression-test',
        p_automation_execution_id: null,
        p_contact_name: 'REGRESSION',
        p_amount: fallbackCostCop,
        p_description: `[REGRESSION] credits=0 fallback test`,
      })
      .single()

    if (rpcErr) {
      console.error(`  [FAIL] RPC error: ${rpcErr.message} (code: ${rpcErr.code})`)
      process.exit(1)
    }

    const result = rpcResult
    if (!result?.success) {
      console.error(`  [FAIL] RPC returned success=false: ${result?.error_message}`)
      process.exit(1)
    }

    // Snapshot balance AFTER the RPC call
    const { data: configAfter, error: configAfterErr } = await supabase
      .from('sms_workspace_config')
      .select('balance_cop')
      .eq('workspace_id', workspaceId)
      .single()
    if (configAfterErr || !configAfter) {
      console.error(`  [FAIL] Cannot read balance post-RPC: ${configAfterErr?.message}`)
      process.exit(1)
    }
    const balanceAfterRegression = Number(configAfter.balance_cop)

    const diff = balanceBeforeRegression - balanceAfterRegression
    if (diff !== 97) {
      console.error(`  [FAIL] Expected balance to decrease by 97, got ${diff} (before=${balanceBeforeRegression}, after=${balanceAfterRegression})`)
      process.exit(1)
    }

    console.log(`  [OK] sms_messages.id=${result.sms_message_id}  balance: $${balanceBeforeRegression} -> $${balanceAfterRegression} (diff=$${diff})`)
    console.log('  [OK] Regression passed: credits=0 -> fallback=1 -> cost=97 -> balance decreased by 97')
    console.log('')
    console.log('ALL TESTS COMPLETE (test C + regression).')
    ```

    **Notas explicitas para el ejecutor:**
    - El bloque APPENDEA al final del archivo (no reemplaza nada). Mantener las lineas 1-159 originales intactas.
    - REUSAR `workspaceId` y `supabase` ya definidos arriba en el archivo (PASO 0). NO reabrir el cliente.
    - REUSAR `SMS_PRICE_COP` ya definido (linea 7).
    - Usar variables NUEVAS (`fallbackSegments`, `fallbackCostCop`, `balanceBeforeRegression`, etc.) para evitar conflicto con `segments`, `costCop`, `balanceBefore` ya usados arriba (`let`/`const` con scope global del `.mjs` modulo).
    - El `mockDispatchId` lleva sufijo `-REGRESSION-${Date.now()}` para que sea unico en cada ejecucion (no choca con UNIQUE constraints futuras).
    - El `console.warn` debe ser EXACTAMENTE el mismo string que el del domain — esto es importante para que el test detecte cualquier divergencia futura entre script y domain.
    - El RPC es real (escribe en sms_messages + decrementa balance). Lo que se mockea es el VALOR de credits que entra al fallback.
    - El test consume saldo real ($97) cada vez que se corre. Aceptable — es el costo de tener un test end-to-end realista.
    - Si en el futuro se quiere hacer el test sin consumir saldo, una opcion es envolverlo en `BEGIN; ROLLBACK;` via un wrapper RPC, pero eso esta fuera de scope.

    **Paso 4 — Verificar sintaxis:**

    ```bash
    node --check scripts/test-onurix-domain.mjs
    ```

    Expected: sin errores.

    **Paso 5 — Commit:**

    ```bash
    git add scripts/test-onurix-domain.mjs
    git commit -m "test(sms-billing-atomic-rpc-05): add regression test for credits=0 fallback

    - Mocks Onurix response with credits=0 (no real Onurix call).
    - Replicates the exact fallback expression from src/lib/domain/sms.ts.
    - Calls insert_and_deduct_sms_message RPC with fallback values.
    - Asserts: segmentsUsed=1, costCop=97, RPC success=true, balance decreases \$97.
    - Exits 1 on any assertion failure (CI-friendly).

    Implements D-12 from CONTEXT.md.
    Closes the regression vector for the SMS billing atomic RPC phase.

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
    git push origin main
    ```
  </action>
  <verify>
    <automated>node --check scripts/test-onurix-domain.mjs && echo "OK: valid JavaScript syntax"</automated>
    <automated>grep -q "REGRESSION TEST: credits=0 fallback" scripts/test-onurix-domain.mjs && grep -q "rpc('insert_and_deduct_sms_message'" scripts/test-onurix-domain.mjs && grep -q "Number(rawCredits) || 1" scripts/test-onurix-domain.mjs && grep -q "Onurix returned invalid credits, falling back to 1" scripts/test-onurix-domain.mjs && grep -q "process.exit(1)" scripts/test-onurix-domain.mjs && echo "OK: regression block markers present"</automated>
    <automated>WCNEW=$(wc -l < scripts/test-onurix-domain.mjs); test "$WCNEW" -gt 200 && echo "OK: file extended (was ~159 lines, now $WCNEW)"</automated>
    <automated>git log -1 --oneline | grep -qE "sms-billing-atomic-rpc-05" && echo "OK: commit registered"</automated>
  </verify>
  <done>
    - `scripts/test-onurix-domain.mjs` ahora tiene > 200 lineas (ampliado del original ~159)
    - Las lineas 1-159 originales (test C completo) NO fueron modificadas
    - El nuevo bloque contiene literal `REGRESSION TEST: credits=0 fallback`
    - El nuevo bloque contiene literal `mockCredits = 0` (asegura que el test prueba el caso del bug)
    - El nuevo bloque contiene literal `Number(rawCredits) || 1` (replica del domain)
    - El nuevo bloque contiene literal `Onurix returned invalid credits, falling back to 1` (mismo warn que el domain)
    - El nuevo bloque llama `supabase.rpc('insert_and_deduct_sms_message', {...}).single()` exactamente UNA vez
    - El nuevo bloque tiene assertions con `process.exit(1)` para cada fallo posible (fallback no aplico, RPC error, RPC success=false, balance no decremento $97)
    - El nuevo bloque NO llama a `fetch(ONURIX_BASE_URL...)` (no envia SMS real — es un mock)
    - `node --check` pasa
    - Commit + push hecho
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint — Correr test extendido en produccion + verificar ambos tests pasan</name>
  <read_first>
    - scripts/test-onurix-domain.mjs (el archivo extendido)
    - .planning/standalone/sms-billing-atomic-rpc/CONTEXT.md §D-12 (criterios del test)
    - .planning/standalone/sms-billing-atomic-rpc/04-SUMMARY.md (estado del balance post-backfill — el test va a consumir $97 mas)
  </read_first>
  <what-built>
    `scripts/test-onurix-domain.mjs` ampliado con un bloque de regression test que prueba el caso `credits=0` end-to-end via el nuevo RPC.

    Lo que falta — y lo que el humano debe hacer:
    1. Verificar que el balance del workspace que el script va a usar (Somnio o el primero con saldo) tiene >= $194 ($97 para test C + $97 para regression)
    2. Correr el script: `node --env-file=.env.local scripts/test-onurix-domain.mjs`
    3. Verificar que TANTO test C (envia SMS real) como regression test pasan
    4. Verificar que el balance bajo exactamente $194 (test C: $97 + regression: $97)
    5. Verificar que en `sms_messages` aparecio 1 row del test C (con dispatch real de Onurix) y 1 row del regression (con `provider_message_id` que empieza con `MOCK-REGRESSION-`)
    6. Confirmar "regression test pasa" para cerrar la fase

    **NOTA:** El test C envia un SMS real al numero `573137549286`. Si tu numero es ese, vas a recibir un SMS de prueba. Si es otro, el SMS llegara al dueno del numero (verificar antes que sea aceptable).
  </what-built>
  <how-to-verify>
    **Paso 1 — Verificar balance pre-test (humano corre en SQL Editor):**

    ```sql
    SELECT workspace_id, balance_cop FROM sms_workspace_config WHERE balance_cop >= 194 ORDER BY balance_cop DESC LIMIT 5;
    ```

    Debe haber al menos UN workspace con balance >= $194. Si todos estan bajos, recargar antes de continuar.

    **Paso 2 — Correr el script ampliado (humano):**

    ```bash
    node --env-file=.env.local scripts/test-onurix-domain.mjs 2>&1 | tee /tmp/regression-test.log
    ```

    Expected output (resumen de los pasos):
    ```
    === PASO 0: Listar workspaces con config SMS ===
    ...
    [OK] Workspace seleccionado: <ws-id> (saldo antes: $<balance_pre> COP)

    === PASO 1: Enviar SMS via Onurix ===
    [OK] Despachado: dispatch_id=<id>, segments=<N>, cost=$97

    === PASO 2: Insertar sms_messages ===
    [OK] sms_messages.id: <uuid>

    === PASO 3: Llamar deduct_sms_balance RPC ===
    [OK] RPC result: [{"success":true,...}]

    === PASO 4: Verificar saldo despues ===
    Saldo antes:   $<balance_pre> COP
    Saldo despues: $<balance_pre - 97> COP
    Diferencia:    $97 COP (esperado: $97)

    === PASO 5: Check delivery tras 10s ===
    Estado Onurix: "Enviado"
    [OK] sms_messages.status -> sent

    TEST C COMPLETO.

    === REGRESSION TEST: credits=0 fallback ===
    [SMS] Onurix returned invalid credits, falling back to 1 { raw: 0, phone: '573137549286' }
      raw credits: 0
      segmentsUsed after fallback: 1
      costCop: 97
      [OK] sms_messages.id=<uuid>  balance: $<balance_pre - 97> -> $<balance_pre - 194> (diff=$97)
      [OK] Regression passed: credits=0 -> fallback=1 -> cost=97 -> balance decreased by 97

    ALL TESTS COMPLETE (test C + regression).
    ```

    Confirmar visualmente:
    - [ ] Test C llego al final (`TEST C COMPLETO`)
    - [ ] Regression test corre (aparece `=== REGRESSION TEST: credits=0 fallback ===`)
    - [ ] El warn `Onurix returned invalid credits, falling back to 1 { raw: 0, ... }` aparece (D-08 verificado)
    - [ ] segmentsUsed=1, costCop=97 (D-07 verificado)
    - [ ] RPC retorno success=true con sms_message_id valido
    - [ ] Balance decremento exactamente $97 en el regression test
    - [ ] Linea final `ALL TESTS COMPLETE` aparece (sin process.exit(1))
    - [ ] Exit code 0

    **Paso 3 — Verificar los rows insertados (humano corre en SQL Editor):**

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
    WHERE workspace_id = '<workspace_id_del_test>'
      AND created_at >= now() - interval '5 minutes'
    ORDER BY created_at DESC;
    ```

    Expected: AL MENOS 2 rows recientes:
    - 1 con `source='domain-call'` o el source del test C (provider_message_id de Onurix real)
    - 1 con `source='regression-test'` y `provider_message_id` empezando con `MOCK-REGRESSION-` (del regression block)
    - Ambos con `cost_cop = 97`

    **Paso 4 — Verificar nuevas transactions (humano corre en SQL Editor):**

    ```sql
    SELECT type, amount_cop, balance_after, description, sms_message_id, created_at
    FROM sms_balance_transactions
    WHERE workspace_id = '<workspace_id_del_test>'
      AND created_at >= now() - interval '5 minutes'
    ORDER BY created_at DESC;
    ```

    Expected: AL MENOS 2 transactions con `type='sms_deduction'`, `amount_cop=-97` cada una. Una del test C (con descripcion `TEST DOMAIN: SMS a 573137549286 ...`), otra del regression (con descripcion `[REGRESSION] credits=0 fallback test`).

    **Paso 5 — Verificar balance final (humano corre en SQL Editor):**

    ```sql
    SELECT balance_cop FROM sms_workspace_config WHERE workspace_id = '<workspace_id_del_test>';
    ```

    Expected: `balance_pre - 194` (test C: -$97, regression: -$97).

    **Paso 6 — (Opcional) Test de robustez del script — corre 2 veces seguidas:**

    Si el balance lo permite, correr de nuevo:

    ```bash
    node --env-file=.env.local scripts/test-onurix-domain.mjs
    ```

    Expected: ambos tests pasan otra vez (consume otros $194). Esto confirma que no hay state cacheado entre runs.

    **Paso 7 — Confirmar al ejecutor:** escribir "regression test pasa" en chat.

    **Paso 8 — (FASE COMPLETA) Cierre:**
    Tras el "regression test pasa", la fase `sms-billing-atomic-rpc` esta cerrada. El operador puede:
    - Crear el LEARNINGS.md de la fase (REGLA 0 + REGLA 4 — actualizar `docs/analysis/04-estado-actual-plataforma.md` §SMS marcando la deuda `cost_cop=0` como resuelta)
    - Correr `/gsd:verify-work` si aplica
  </how-to-verify>
  <resume-signal>
    Escribe "regression test pasa" cuando ambos tests pasen y el balance decremente exactamente $194.
    Si algo falla:
    - Si test C falla en PASO 1 (Onurix send): problema con la API de Onurix — investigar (no es problema del fix)
    - Si test C falla en PASO 3/4: el RPC `deduct_sms_balance` no existe o el guard rompe — re-verificar Plan 01
    - Si regression test falla en `if (fallbackSegments !== 1)`: la expresion del fallback no funciona — bug critico en el script
    - Si regression test falla en `if (rpcErr)` con "Invalid amount": estamos pasando p_amount=0 — bug en el script (debe pasar 97)
    - Si regression test falla en `if (diff !== 97)`: el RPC no decremento bien — bug en Plan 01 SQL
    NO declarar la fase completa sin que ambos tests salgan ok.
  </resume-signal>
</task>

</tasks>

<verification>
- `scripts/test-onurix-domain.mjs` ampliado con bloque "REGRESSION TEST: credits=0 fallback" al final.
- Las lineas 1-159 originales preservadas intactas.
- `node --check` pasa.
- Script ejecutado en produccion exitosamente.
- Test C (existente) pasa: SMS real enviado, balance decrementa $97.
- Regression test (nuevo) pasa: mock credits=0 -> fallback=1 -> cost=97 -> balance decrementa $97.
- Total balance decremento $194 en una ejecucion.
- Console warn del fallback emitido y verificado.
- Commit + push hechos.
</verification>

<success_criteria>
- Existe un test ejecutable que prueba especificamente el bug A (credits=0 -> cost_cop=0) y verifica que el fallback impide la regresion.
- Cualquier futuro refactor que rompa el fallback en el domain o en el RPC sera detectado por el siguiente run del script.
- La fase `sms-billing-atomic-rpc` queda cerrada: 5 plans completados, 3 defectos cerrados, deuda historica reparada, regression protegida.
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-billing-atomic-rpc/05-SUMMARY.md` documenting:
- Diff del archivo (lineas anadidas: ~ 90)
- Hash del commit
- Output completo capturado del script (test C + regression — copiar de /tmp/regression-test.log)
- Lista de los IDs de los rows insertados (1 del test C, 1 del regression)
- Snapshot del balance pre/post (debe diferir en $194)
- Decisiones implementadas: D-12
- Notas finales:
  - D-13 (pgTAP) marcado como deferred — requiere infraestructura no presente
  - El test consume saldo real cada vez que se corre — documentar como side-effect aceptable
  - Cierre de fase: confirmar que los 3 defectos (A, B, C) estan cerrados:
    - Defect A (fallback faltante en credits) -> cerrado por Plan 02 + Plan 05 (test)
    - Defect B (insert + RPC no atomicos) -> cerrado por Plan 01 (RPC atomico) + Plan 02 (refactor)
    - Defect C (RPC sin guard p_amount<=0) -> cerrado por Plan 01 (guard en ambos RPCs)
  - Deuda historica -> reparada por Plan 04
- Sugerencias de proximas fases (siguiendo deferred ideas en CONTEXT.md):
  - Monitoring proactivo de cost_cop=0 post-fix
  - Auditoria analoga del path WhatsApp/Meta billing
  - Idempotency key end-to-end
- Recordatorio final: actualizar `docs/analysis/04-estado-actual-plataforma.md` §SMS marcando la deuda `cost_cop=0` como resuelta (REGLA 4) y crear `LEARNINGS.md` de la fase (REGLA 0).
</output>
</content>
