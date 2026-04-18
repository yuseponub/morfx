---
phase: sms-billing-atomic-rpc
plan: 04
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - scripts/backfill-sms-zero-cost.mjs
autonomous: false

must_haves:
  truths:
    - "Existe `scripts/backfill-sms-zero-cost.mjs` (NUEVO archivo) que repara rows huerfanos llamando al RPC `backfill_sms_message` (deployed en Plan 01) — UNO por row"
    - "El script defaultea a `--dry-run` (sin escribir nada) — solo escribe si recibe el flag `--apply` (D-11)"
    - "El script muestra el impacto monetario AGRUPADO POR WORKSPACE antes de pedir confirmacion"
    - "Cuando recibe `--apply`, el script pide confirmacion textual: el operador debe escribir literalmente `APPLY` (no acepta otra cosa) — segunda capa de proteccion (D-11)"
    - "El script es idempotente: re-correrlo despues de un apply exitoso retorna 0 rows o reporta cada row como SKIP (porque el RPC `backfill_sms_message` skipea rows con cost_cop > 0)"
    - "El script reporta resumen final con conteos `ok / skipped / failed` y exit code 1 si hubo failures"
    - "node --check pasa (sintaxis valida)"
    - "El script fue ejecutado en produccion en modo `--apply` con confirmacion humana, los rows huerfanos quedaron reparados (cost_cop=97), el balance de los workspaces afectados fue decrementado por el monto correspondiente, y `audit-sms-zero-cost.mjs` post-backfill reporta 0 rows"
  artifacts:
    - path: "scripts/backfill-sms-zero-cost.mjs"
      provides: "Backfill idempotente con dry-run default + APPLY confirmation"
      contains: "backfill_sms_message"
      min_lines: 80
  key_links:
    - from: "scripts/backfill-sms-zero-cost.mjs"
      to: "Postgres RPC backfill_sms_message (deployed en Plan 01)"
      via: "supabase.rpc('backfill_sms_message', { p_sms_message_id, p_expected_cost_cop }).single()"
      pattern: "rpc\\('backfill_sms_message'"
    - from: "scripts/backfill-sms-zero-cost.mjs (post-apply)"
      to: "scripts/audit-sms-zero-cost.mjs (verificacion)"
      via: "Sugerencia textual al final del output"
      pattern: "audit-sms-zero-cost"
---

<objective>
Crear `scripts/backfill-sms-zero-cost.mjs`: un script Node standalone que llama al RPC `backfill_sms_message` (deployed en Plan 01) por cada row huerfano detectado por el audit (Plan 03). Doble proteccion: dry-run default + confirmacion textual `APPLY` antes de escribir (Regla 5).

**Por que este plan es Wave 3 dependiendo de Plan 01 + Plan 03:**
- **Depende de Plan 01:** El RPC `backfill_sms_message` debe existir en produccion.
- **Depende de Plan 03:** El operador debe haber visto el alcance del audit antes de correr el backfill (no quiero que se corra a ciegas).
- NO depende de Plan 02 (el refactor del domain): el backfill repara rows VIEJOS — el path runtime de Plan 02 protege solo NUEVOS SMS.

**Por que dry-run default + APPLY confirmation (Regla 5 + D-11):**
- Regla 5 del proyecto: nada escribe a produccion sin preview.
- Capas de defensa contra typos / scripts ejecutados accidentalmente:
  1. Default = dry-run (NO `--apply`)
  2. `--apply` no basta: pide confirmacion textual literal `APPLY`
  3. El RPC `backfill_sms_message` es idempotente: si por error se corre 2 veces, la 2da retorna SKIP por cada row
- Triple capa = imposible reparar accidentalmente

**Por que `autonomous: false`:**
La Task 2 (correr el script con --apply) requiere intervencion humana:
- Confirmar visualmente el preview del impacto
- Escribir literalmente `APPLY` cuando el script lo pida
- Verificar post-backfill via SQL query

**Por que NO requiere push a Vercel:**
Es un script `.mjs` operacional. No afecta runtime. Se commitea + pushea a main (mejor practica) pero el push NO es bloqueante para que el script funcione.

**Alcance del backfill:**
Determinado por el output de Plan 03. Si el audit reporto:
- 2 rows (esperado segun debug) → 2 calls al RPC, decremento total ~$194 (depende de los workspaces)
- N rows → N calls al RPC, decremento total `97 * N` distribuido por workspace

El script NO procesa rows fuera del filtro (`provider='onurix' AND cost_cop=0 AND created_at >= 2026-04-16`) — es seguro re-correrlo sin tocar otros rows.

Purpose: Cerrar la deuda historica (rows con cost_cop=0 generados durante la ventana del bug) en una operacion controlada y reversible (auditable via sms_balance_transactions con `type='sms_deduction_backfill'`).

Output: `scripts/backfill-sms-zero-cost.mjs` creado, ejecutado en produccion con `--apply`, rows huerfanos reparados, balance ajustado, audit post-backfill confirma 0 rows.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-billing-atomic-rpc/CONTEXT.md
@.planning/standalone/sms-billing-atomic-rpc/RESEARCH.md
@.planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md
@.planning/standalone/sms-billing-atomic-rpc/03-SUMMARY.md
@CLAUDE.md
@scripts/audit-sms-zero-cost.mjs

<interfaces>
<!-- RPC ya deployed en Plan 01 -->
backfill_sms_message(
  p_sms_message_id UUID,
  p_expected_cost_cop DECIMAL DEFAULT 97
)
RETURNS TABLE(
  success BOOLEAN,
  workspace_id UUID,
  new_balance DECIMAL,
  error_message TEXT
)

<!-- Patron de invocacion desde Node -->
const { data: result, error } = await supabase
  .rpc('backfill_sms_message', { p_sms_message_id: r.id, p_expected_cost_cop: 97 })
  .single()  // RPC retorna TABLE de 1 row, .single() lo desempaca

// result.success: TRUE si reparo, FALSE si error logico (ej: ya estaba reparado, ws config no existe)
// error: PostgrestError (ej: RPC no existe, conexion caida)

<!-- Comportamiento idempotente del RPC -->
- Si v_sms.cost_cop > 0 → RETURN false con error_message='already backfilled (cost_cop > 0)'
- Si v_sms NOT FOUND → RETURN false con error_message='sms_message not found'
- Si v_config NOT FOUND → RETURN false con error_message='workspace config not found'
- Happy path: UPDATE sms_messages.cost_cop=97 + UPDATE balance + INSERT transaction → RETURN true

<!-- Convencion de ejecucion -->
node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs            # dry-run (default)
node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs --apply    # pide APPLY + escribe
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear scripts/backfill-sms-zero-cost.mjs + correr en modo dry-run</name>
  <read_first>
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Script skeleton: scripts/backfill-sms-zero-cost.mjs (lineas 950-1057) — CODIGO COMPLETO listo para copiar
    - .planning/standalone/sms-billing-atomic-rpc/CONTEXT.md §D-10, D-11 (lineas 47-53) — requirements del backfill
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Pitfall 6 (lineas 346-358) — re-auditar al inicio del script porque los datos pueden cambiar entre el audit y el backfill
    - .planning/standalone/sms-billing-atomic-rpc/03-SUMMARY.md — confirmar que Plan 03 corrio y conocer el alcance esperado
    - .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md — confirmar que el RPC `backfill_sms_message` esta deployed
    - scripts/audit-sms-zero-cost.mjs — usar como template de patron de inicializacion
  </read_first>
  <action>
    **Paso 0 — Pre-flight (BLOQUEANTE):**

    ```bash
    test -f .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md && grep -q "migracion aplicada" .planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md
    test -f .planning/standalone/sms-billing-atomic-rpc/03-SUMMARY.md
    test -f scripts/audit-sms-zero-cost.mjs
    ```
    Si cualquiera falla, ABORTAR.

    **Paso 1 — Verificar archivo no existe:**
    ```bash
    test -f scripts/backfill-sms-zero-cost.mjs && echo "ERROR: ya existe" && exit 1 || echo "OK: proceder a crear"
    ```

    **Paso 2 — Crear `scripts/backfill-sms-zero-cost.mjs`:**

    Copiar VERBATIM el skeleton de RESEARCH.md (lineas 950-1057). Estructura:

    ```javascript
    // scripts/backfill-sms-zero-cost.mjs
    // Run: node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs [--apply]
    // Dry-run by default. Idempotent: re-running after --apply is a no-op.
    //
    // For each sms_messages row with cost_cop=0 AND provider='onurix' AND created_at >= 2026-04-16:
    //   1) calls RPC backfill_sms_message(id, 97) — atomic per-row repair
    //   2) RPC is idempotent: skips rows where cost_cop already > 0
    //
    // Regla 5: --dry-run default. Operator must see impact + confirm before --apply.
    //
    // Phase: standalone/sms-billing-atomic-rpc (Plan 04)
    // Implements D-10, D-11 from CONTEXT.md.

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

    // 1) Re-audit at start to avoid stale counts (Pitfall 6)
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
      console.log(`  ${ws}: ${n} rows -> decrementar $${n * SMS_PRICE_COP} COP del balance`)
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

      if (error) {
        console.error(`  [FAIL] ${r.id}: ${error.message}`)
        failed++
        continue
      }
      if (!result?.success) {
        console.log(`  [SKIP] ${r.id}: ${result?.error_message || 'unknown'}`)
        skipped++
        continue
      }
      console.log(`  [OK]   ${r.id}  ws=${result.workspace_id?.slice(0,8)}  new_balance=$${result.new_balance}`)
      ok++
    }

    console.log(`\nDone: ok=${ok}, skipped=${skipped}, failed=${failed}`)
    console.log(`Verify: run scripts/audit-sms-zero-cost.mjs -- should report 0 rows.`)
    if (failed > 0) process.exit(1)
    ```

    **Paso 3 — Verificar sintaxis:**

    ```bash
    node --check scripts/backfill-sms-zero-cost.mjs
    ```

    **Paso 4 — Verificar comportamiento de seguridad:**

    ```bash
    grep -c "process.argv.includes('--apply')" scripts/backfill-sms-zero-cost.mjs
    # Expected: 1 (default es dry-run)

    grep -c "answer.trim() !== 'APPLY'" scripts/backfill-sms-zero-cost.mjs
    # Expected: 1 (confirmacion textual antes de escribir)

    grep -c "rpc('backfill_sms_message'" scripts/backfill-sms-zero-cost.mjs
    # Expected: 1 (la unica llamada de escritura via RPC)

    grep -E "\.from\([^)]+\)\.(insert|update|delete|upsert)" scripts/backfill-sms-zero-cost.mjs
    # Expected: 0 matches (todas las escrituras pasan por el RPC, no directo a la tabla)
    ```

    **Paso 5 — Correr en modo dry-run en produccion:**

    ```bash
    node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs 2>&1 | tee /tmp/backfill-dryrun.log
    ```

    Expected output:
    ```
    === Backfill SMS Zero-Cost (DRY-RUN) ===

    Rows to process: 2  (o el numero que reporto Plan 03)

    Impact preview:
      <workspace_id_somnio>: 2 rows -> decrementar $194 COP del balance

    DRY-RUN -- pass --apply to write changes.
    Next: node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs --apply
    ```

    Confirmar VISUALMENTE:
    - El numero de rows matchea el output de Plan 03 (audit)
    - Los workspaces afectados son los esperados (segun debug + Plan 03)
    - El impacto monetario es razonable
    - El script termina con exit 0 sin escribir nada

    Si algo no matchea: NO continuar a Task 2, investigar.

    **Paso 6 — Commit + push (push aqui es seguro — solo es el script):**

    ```bash
    git add scripts/backfill-sms-zero-cost.mjs
    git commit -m "feat(sms-billing-atomic-rpc-04): add idempotent backfill script for orphan SMS rows

    Repairs sms_messages rows with provider='onurix' AND cost_cop=0 AND
    created_at >= 2026-04-16 by calling the backfill_sms_message RPC
    (deployed in Plan 01) — one call per row, atomic per-row.

    Safety layers (Regla 5):
      1. Default mode is --dry-run (no writes, just shows impact preview)
      2. --apply mode requires typed confirmation: operator must enter 'APPLY'
      3. RPC is idempotent: re-running after success returns SKIP for each row

    Output:
      - Pre-write: impact preview grouped by workspace + monetary total
      - Per-row: [OK] / [SKIP] / [FAIL] with reason
      - Post-write: counts (ok/skipped/failed) + verification suggestion

    Re-audits at start (Pitfall 6) to avoid acting on stale data from a
    prior audit run.

    Implements D-10, D-11 from CONTEXT.md.
    Requires: Plan 01 migration applied (backfill_sms_message RPC deployed).

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f scripts/backfill-sms-zero-cost.mjs && echo "OK: file exists"</automated>
    <automated>node --check scripts/backfill-sms-zero-cost.mjs && echo "OK: valid JS syntax"</automated>
    <automated>grep -q "process.argv.includes('--apply')" scripts/backfill-sms-zero-cost.mjs && echo "OK: --apply flag check"</automated>
    <automated>grep -q "answer.trim() !== 'APPLY'" scripts/backfill-sms-zero-cost.mjs && echo "OK: typed confirmation"</automated>
    <automated>test "$(grep -c "rpc('backfill_sms_message'" scripts/backfill-sms-zero-cost.mjs)" = "1" && echo "OK: 1 RPC call"</automated>
    <automated>test "$(grep -cE "\.from\([^)]+\)\.(insert|update|delete|upsert)" scripts/backfill-sms-zero-cost.mjs)" = "0" && echo "OK: no direct-table writes"</automated>
    <automated>test -f /tmp/backfill-dryrun.log && grep -q "DRY-RUN" /tmp/backfill-dryrun.log && echo "OK: dry-run output captured"</automated>
    <automated>git log -1 --oneline | grep -qE "sms-billing-atomic-rpc-04" && echo "OK: commit registered"</automated>
  </verify>
  <done>
    - `scripts/backfill-sms-zero-cost.mjs` creado con sintaxis valida
    - Defaultea a dry-run, requiere `--apply` + confirmacion `APPLY`
    - 1 sola llamada al RPC `backfill_sms_message` (sin escrituras directas a tablas)
    - Dry-run en produccion exitoso, output capturado en /tmp/backfill-dryrun.log
    - Numero de rows matchea Plan 03
    - Commit + push hechos
    - Listo para Task 2 (apply)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint — Humano corre el backfill con --apply, escribe APPLY, verifica que rows quedaron reparados (Regla 5)</name>
  <read_first>
    - /tmp/backfill-dryrun.log — el output del dry-run para confirmar el alcance
    - .planning/standalone/sms-billing-atomic-rpc/03-SUMMARY.md — el alcance esperado
    - scripts/backfill-sms-zero-cost.mjs (el archivo recien creado)
  </read_first>
  <what-built>
    - `scripts/backfill-sms-zero-cost.mjs` creado, dry-run corrido y verificado
    - El script esta listo para correr con `--apply`, pero NO se ha corrido aun

    **Lo que falta — y SOLO el humano puede hacer:**
    1. Capturar balance + total_credits_used pre-backfill por workspace afectado (snapshot)
    2. Correr el script con `--apply` y escribir literalmente `APPLY` cuando lo pida
    3. Verificar que el output muestra `[OK]` por cada row + `failed=0`
    4. Verificar que los rows huerfanos quedaron con cost_cop=97
    5. Verificar que el balance de cada workspace decremento por el monto esperado
    6. Verificar que aparecieron rows nuevas en sms_balance_transactions con type='sms_deduction_backfill'
    7. Re-correr `audit-sms-zero-cost.mjs` y confirmar 0 rows
    8. Confirmar al ejecutor "backfill aplicado, audit clean"
  </what-built>
  <how-to-verify>
    **Paso 1 — Snapshot pre-backfill (HUMANO corre en SQL Editor):**

    Para cada workspace afectado (segun el dry-run):
    ```sql
    SELECT workspace_id, balance_cop, total_sms_sent, total_credits_used
    FROM sms_workspace_config
    WHERE workspace_id IN ('<ws-id-1>', '<ws-id-2>', ...)  -- de los workspaces del audit
    ORDER BY workspace_id;
    ```

    Anotar los valores actuales — sera el snapshot "BEFORE" del SUMMARY.

    Tambien capturar los rows huerfanos pre-backfill:
    ```sql
    SELECT id, workspace_id, to_number, cost_cop, segments, created_at
    FROM sms_messages
    WHERE provider = 'onurix' AND cost_cop = 0
    AND created_at >= '2026-04-16T00:00:00-05:00'
    ORDER BY created_at;
    ```

    **Paso 2 — Correr el backfill con `--apply` (HUMANO):**

    ```bash
    node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs --apply 2>&1 | tee /tmp/backfill-apply.log
    ```

    El script va a:
    1. Re-auditar (mostrar el numero de rows + impacto)
    2. Pedir: `Type "APPLY" to proceed:`
    3. Si escribes literalmente `APPLY` (mayusculas, sin espacios) → procede
    4. Si escribes cualquier otra cosa → aborta sin escribir

    **Escribir EXACTAMENTE `APPLY` y presionar Enter.**

    Expected output post-confirmacion:
    ```
    [OK]   <uuid-1>  ws=<ws-prefix>  new_balance=$<balance>
    [OK]   <uuid-2>  ws=<ws-prefix>  new_balance=$<balance>
    ...

    Done: ok=<N>, skipped=0, failed=0
    Verify: run scripts/audit-sms-zero-cost.mjs -- should report 0 rows.
    ```

    Confirmar:
    - [ ] Cada row reportada como `[OK]` (no `[SKIP]` ni `[FAIL]`)
    - [ ] `failed=0`
    - [ ] El conteo `ok=N` matchea el numero de rows del dry-run
    - [ ] Exit code 0 (sin error fatal)

    Si hay `[FAIL]`:
    - Capturar el mensaje de error
    - El RPC retorna error si: workspace_config no existe (raro, no deberia pasar) o algo de la conexion
    - Reportar al ejecutor

    Si hay `[SKIP]`:
    - Significa que el row YA tenia cost_cop > 0 cuando se proceso
    - Posible causa: alguien hizo backfill manual entre el dry-run y el apply
    - No es fail, pero documentar

    **Paso 3 — Verificar que los rows huerfanos quedaron reparados (HUMANO):**

    ```sql
    SELECT id, workspace_id, to_number, cost_cop, segments, created_at
    FROM sms_messages
    WHERE id IN (<lista-de-IDs-del-snapshot>)
    ORDER BY created_at;
    ```

    Expected: TODOS los rows con `cost_cop = 97` y `segments = 1` (NO 0).

    **Paso 4 — Verificar que el balance decremento (HUMANO):**

    ```sql
    SELECT workspace_id, balance_cop, total_sms_sent, total_credits_used
    FROM sms_workspace_config
    WHERE workspace_id IN ('<ws-id-1>', '<ws-id-2>', ...)
    ORDER BY workspace_id;
    ```

    Expected vs snapshot pre-backfill:
    - `balance_cop`: decremento exacto de `97 * count_de_rows_de_ese_ws`
    - `total_credits_used`: incremento exacto de `97 * count_de_rows_de_ese_ws`
    - `total_sms_sent`: SIN cambio (Pitfall 7 — backfill_sms_message NO incrementa este contador porque deduct_sms_balance original ya lo hizo)

    Si `total_sms_sent` cambio: ALERTA — el RPC no respeto Pitfall 7. Investigar la migracion.

    **Paso 5 — Verificar transactions registradas (HUMANO):**

    ```sql
    SELECT type, amount_cop, balance_after, description, sms_message_id, created_at
    FROM sms_balance_transactions
    WHERE type = 'sms_deduction_backfill'
      AND created_at >= now() - interval '5 minutes'
    ORDER BY created_at DESC;
    ```

    Expected: 1 row por cada row reparado, con:
    - `type = 'sms_deduction_backfill'`
    - `amount_cop = -97`
    - `description = 'Backfill post-cutover Onurix 2026-04-17'`
    - `sms_message_id` = UUID que matchea uno de los rows huerfanos
    - `balance_after` = el balance del workspace tras esa decrementada

    **Paso 6 — Re-correr el audit (HUMANO):**

    ```bash
    node --env-file=.env.local scripts/audit-sms-zero-cost.mjs
    ```

    Expected: `Rows found: 0` y exit code 0 con `[ok] No orphan rows. Nothing to backfill.`

    Si reporta > 0:
    - Posible: hubo SMS NUEVOS con cost_cop=0 entre el dry-run y el apply (significa que Plan 02 NO esta deployed o el fallback no funciono — investigar)
    - Re-correr con `--apply` para limpiar — pero PRIMERO investigar por que aparecieron nuevos

    **Paso 7 — (Opcional) Test de idempotencia (HUMANO):**

    Re-correr el backfill con `--apply` y `APPLY`:
    ```bash
    node --env-file=.env.local scripts/backfill-sms-zero-cost.mjs --apply
    ```
    (escribe APPLY de nuevo)

    Expected: `Rows to process: 0` y termina sin escribir. (O si hay rows nuevos, los procesa — pero deberia ser 0).

    Confirma idempotencia operacional.

    **Paso 8 — Confirmacion al ejecutor:**

    Escribir literalmente "backfill aplicado, audit clean" cuando:
    - Todos los rows huerfanos quedaron con cost_cop=97
    - El balance decremento por el monto exacto
    - Las transactions de backfill quedaron registradas
    - El audit post-backfill reporta 0 rows
    - (opcional) Re-correr el backfill no escribe nada

    Si algo fallo:
    - "backfill fallo: <log>" → ejecutor revisa los errores
    - "balance no cuadra" → snapshot before/after + diff esperado vs real
    - "audit no esta clean" → reportar el numero de rows residuales
  </how-to-verify>
  <resume-signal>
    Escribe "backfill aplicado, audit clean" cuando los rows huerfanos quedaron reparados, el balance decremento por el monto exacto, y el audit post-backfill reporta 0 rows.

    Si fallo en algo:
    - "ABORTE en confirmacion" → escribiste algo que no era APPLY (no escribiste nada al RPC, safe). Re-correr cuando estes seguro.
    - "RPC dio failed=N" → capturar mensajes y reportar.
    - "balance no decremento" → bug en el RPC backfill_sms_message — revisar Plan 01 SQL.
    - "total_sms_sent cambio" → bug en el RPC (Pitfall 7) — revisar Plan 01.

    NO declarar Plan 04 completo sin que el audit post-backfill reporte 0 rows.
  </resume-signal>
</task>

</tasks>

<verification>
- `scripts/backfill-sms-zero-cost.mjs` existe, sintaxis valida.
- Defaultea a dry-run, requiere `--apply` + confirmacion textual `APPLY`.
- Llama solo `backfill_sms_message` RPC (sin escrituras directas a tablas).
- Dry-run corrido y output capturado.
- Apply corrido en produccion con confirmacion humana.
- Todos los rows huerfanos reparados a cost_cop=97.
- Balance de cada workspace decremento por el monto exacto (97 * N_rows).
- Transactions de backfill registradas con type='sms_deduction_backfill'.
- Audit post-backfill reporta 0 rows.
- Commit + push hechos.
</verification>

<success_criteria>
- La deuda historica (rows huerfanos del bug pre-fix) esta cerrada.
- Los workspaces afectados tienen balance consistente con `sum(cost_cop)` post-backfill.
- Las transactions de backfill son auditables (description explicita + type distintivo).
- El sistema es idempotente: re-correr el backfill no causa double-billing.
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-billing-atomic-rpc/04-SUMMARY.md` documenting:
- Hash del commit local + remoto
- Output completo del dry-run (`/tmp/backfill-dryrun.log`)
- Output completo del apply (`/tmp/backfill-apply.log`)
- Snapshot before vs after por workspace afectado:
  - balance_cop diff (debe ser -97 * count)
  - total_credits_used diff (debe ser +97 * count)
  - total_sms_sent diff (debe ser 0 — Pitfall 7)
- Lista de IDs de rows reparados (de los huerfanos a cost_cop=97)
- Lista de IDs de transactions de backfill (con type='sms_deduction_backfill')
- Output del audit post-backfill (debe ser `Rows found: 0`)
- Decisiones implementadas: D-10, D-11
- Confirmacion humana "backfill aplicado, audit clean" + timestamp
- NEXT: Plan 05 (regression test) puede iniciar — cierre de fase
- Notas:
  - Si en algun momento aparecen rows nuevos con cost_cop=0 post-Plan 02, es BUG de runtime — abrir nuevo debug
  - El script es reusable: si en el futuro vuelven a aparecer huerfanos, correr audit + backfill
</output>
</content>
