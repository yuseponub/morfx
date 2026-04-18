---
phase: sms-billing-atomic-rpc
plan: 03
type: execute
wave: 2
depends_on: []
files_modified:
  - scripts/audit-sms-zero-cost.mjs
autonomous: true

must_haves:
  truths:
    - "Existe `scripts/audit-sms-zero-cost.mjs` (NUEVO archivo) que lista todos los rows `sms_messages WHERE provider='onurix' AND cost_cop=0 AND created_at >= '2026-04-16T00:00:00-05:00'`"
    - "El script es READ-ONLY: cero INSERT/UPDATE/DELETE/RPC con efectos secundarios"
    - "El script soporta dos modos de output: tabla humana (default) y JSON (`--json`)"
    - "El output humano agrupa por workspace y muestra el impacto monetario del backfill futuro (`$N COP`)"
    - "El output humano lista los IDs individuales de los rows huerfanos (para que el operador pueda investigar)"
    - "El script termina con sugerencia explicita del comando para correr el backfill (Plan 04)"
    - "El script falla rapido (`process.exit(1)`) si faltan env vars `NEXT_PUBLIC_SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`"
    - "El script usa `createClient()` directo (NO el wrapper `@/lib/supabase/admin` que requiere paths Next — es un script Node standalone)"
    - "node --check pasa (sintaxis valida)"
    - "El script fue ejecutado al menos una vez en produccion para conocer el alcance real (numero de rows huerfanos)"
  artifacts:
    - path: "scripts/audit-sms-zero-cost.mjs"
      provides: "Read-only audit de rows sms_messages con cost_cop=0 post-cutover Onurix"
      contains: "audit-sms-zero-cost"
      min_lines: 60
  key_links:
    - from: "scripts/audit-sms-zero-cost.mjs"
      to: "Supabase tabla sms_messages"
      via: "SELECT con filtros provider='onurix' + cost_cop=0 + created_at >= cutover"
      pattern: "\\.from\\('sms_messages'\\).*\\.eq\\('cost_cop', 0\\)"
    - from: "scripts/audit-sms-zero-cost.mjs (output)"
      to: "scripts/backfill-sms-zero-cost.mjs (Plan 04)"
      via: "Sugerencia textual al final del output del audit"
      pattern: "scripts/backfill-sms-zero-cost.mjs"
---

<objective>
Crear `scripts/audit-sms-zero-cost.mjs`: un script Node standalone READ-ONLY que lista todos los rows huerfanos de `sms_messages` (provider='onurix', cost_cop=0) creados desde el cutover de Onurix (2026-04-16). Es la herramienta de diagnostico que el operador corre ANTES del backfill (Plan 04) para conocer el alcance exacto.

**Por que este plan es Wave 2 sin depender de Plan 01/02:**
- NO necesita el codigo refactorizado (lee la DB directamente)
- NO necesita los nuevos RPCs (no llama ningun RPC, solo SELECT)
- Wave 2 (no Wave 1) por convencion: agruparlo con Plan 02 le da al operador la oportunidad de correrlo "en paralelo" mental con el deploy

**Por que es READ-ONLY estricto:**
- Regla 5 (proyecto): nada escribe a produccion sin preview previo
- El operador necesita VER el alcance antes de tomar decisiones (cuantos rows? que workspaces afectados? cuanto dinero? que numeros telefonicos?)
- Si fuera write-capable, romperia la separacion entre "diagnosticar" y "remediar"

**Por que `autonomous: true`:**
Este script no tiene checkpoints — es un script de diagnostico. El humano lo CORRE manualmente (Task 1 incluye la corrida), pero no requiere bloquear el flujo. Si el output del audit revela algo inesperado (ej: 100 rows en vez de 2), el operador decide en Plan 04 si proceder con el backfill o pausar para investigar.

**Por que NO requiere push a Vercel:**
Es un script `.mjs` operacional, no codigo de runtime. No afecta lo que se ejecuta en Vercel. El operador lo corre localmente contra produccion.

Purpose: Dar al operador visibilidad completa del alcance de la deuda historica antes de remediar.

Output: `scripts/audit-sms-zero-cost.mjs` creado, commiteado, ejecutado al menos una vez en produccion, output capturado.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-billing-atomic-rpc/CONTEXT.md
@.planning/standalone/sms-billing-atomic-rpc/RESEARCH.md
@.planning/debug/sms-billing-inconsistency.md
@CLAUDE.md
@scripts/test-onurix-domain.mjs
@scripts/migrate-twilio-automations-to-onurix.mjs

<interfaces>
<!-- Patron del repo (Pitfall A6 verificado) — los scripts .mjs NO usan @/* paths -->
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

<!-- Filtro principal del audit -->
.from('sms_messages')
.select('id, workspace_id, to_number, status, segments, cost_cop, created_at, provider_message_id')
.eq('provider', 'onurix')
.eq('cost_cop', 0)
.gte('created_at', '2026-04-16T00:00:00-05:00')
.order('created_at', { ascending: true })

<!-- Convencion de ejecucion -->
node --env-file=.env.local scripts/audit-sms-zero-cost.mjs            # tabla humana
node --env-file=.env.local scripts/audit-sms-zero-cost.mjs --json     # JSON para procesamiento programatico
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear scripts/audit-sms-zero-cost.mjs + correr en produccion</name>
  <read_first>
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Script skeleton: scripts/audit-sms-zero-cost.mjs (lineas 873-948) — CODIGO COMPLETO listo para copiar
    - .planning/standalone/sms-billing-atomic-rpc/CONTEXT.md §D-09 (linea 46) — requirements del audit
    - .planning/debug/sms-billing-inconsistency.md (las 2 IDs conocidas — el audit DEBERIA listar al menos esas 2)
    - scripts/test-onurix-domain.mjs lineas 1-30 (patron de inicializacion del cliente Supabase en scripts standalone — confirmar que NO se usa el wrapper @/lib/supabase/admin)
    - scripts/migrate-twilio-automations-to-onurix.mjs (otro script standalone de referencia — patron de output humano + manejo de errores)
  </read_first>
  <action>
    **Paso 1 — Verificar patron del repo:**

    ```bash
    head -30 scripts/test-onurix-domain.mjs
    ```

    Confirmar que el patron es:
    - `import { createClient } from '@supabase/supabase-js'` (NO `@/lib/supabase/admin`)
    - Lectura de env vars con `process.env.*` directo
    - `createClient(url, serviceKey, { auth: { persistSession: false } })`

    **Paso 2 — Crear `scripts/audit-sms-zero-cost.mjs`:**

    Verificar que el archivo NO existe aun:
    ```bash
    test -f scripts/audit-sms-zero-cost.mjs && echo "ERROR: ya existe — investigar antes de sobreescribir" || echo "OK: archivo no existe, proceder a crear"
    ```

    Crear el archivo con el contenido EXACTO del skeleton de RESEARCH.md (lineas 873-948), copiandolo verbatim. Estructura:

    ```javascript
    // scripts/audit-sms-zero-cost.mjs
    // Run: node --env-file=.env.local scripts/audit-sms-zero-cost.mjs [--json]
    // READ-ONLY audit of sms_messages rows with cost_cop=0 post-Onurix cutover.
    // Safe to run at any time. Does NOT modify any data.
    //
    // Phase: standalone/sms-billing-atomic-rpc (Plan 03)
    // Implements D-09 from CONTEXT.md.

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
      console.log(`  ${ws} (${w?.name || '?'}): ${list.length} rows -> impacto backfill: $${list.length * 97} COP`)
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

    **Paso 3 — Verificar sintaxis:**

    ```bash
    node --check scripts/audit-sms-zero-cost.mjs
    ```

    Expected: sin errores.

    **Paso 4 — Verificar que es READ-ONLY (defense in depth):**

    ```bash
    grep -E "\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(" scripts/audit-sms-zero-cost.mjs
    ```

    Expected: 0 matches. Si match: ABORTAR — el script ya no es read-only.

    **Paso 5 — Correr el script en produccion (modo humano):**

    ```bash
    node --env-file=.env.local scripts/audit-sms-zero-cost.mjs 2>&1 | tee /tmp/audit-output.log
    ```

    Capturar el output completo en `/tmp/audit-output.log` (sera incluido en el SUMMARY de este plan).

    **Resultado esperado segun el debug:**
    - `Rows found: 2` (al menos — los 2 conocidos del workspace Somnio)
    - Pueden ser MAS si hubo SMS adicionales en la ventana de 24h post-cutover

    Si `Rows found: 0`:
    - Posible: Plan 02 ya esta deployed y los nuevos SMS persisten con cost_cop=97 — los 2 viejos del debug deberian seguir ahi (los rows huerfanos no se "auto-curan")
    - Si literalmente hay 0, alguien YA hizo backfill manual antes de este plan — investigar git log + sms_balance_transactions con type='sms_deduction_backfill'

    Si `Rows found > 100`:
    - El alcance es mucho mayor que lo esperado — investigar con queries adicionales antes de Plan 04
    - Anotar en el SUMMARY para que el operador decida

    **Paso 6 — Tambien correr en modo JSON (verificar segundo path):**

    ```bash
    node --env-file=.env.local scripts/audit-sms-zero-cost.mjs --json | head -50
    ```

    Expected: JSON valido con `count` y `rows[]`. Si rompe: investigar.

    **Paso 7 — Commit + push (push aqui es seguro porque es solo un script — no afecta runtime):**

    ```bash
    git add scripts/audit-sms-zero-cost.mjs
    git commit -m "feat(sms-billing-atomic-rpc-03): add read-only audit script for orphan SMS rows

    Lists sms_messages rows with provider='onurix' AND cost_cop=0 AND
    created_at >= 2026-04-16 (start of Onurix cutover window). Output formats:

      - Default: human-readable table grouped by workspace, with monetary
        impact preview and individual row IDs for investigation
      - --json: machine-readable JSON for programmatic consumption

    READ-ONLY by design (defense-in-depth): zero INSERT/UPDATE/DELETE/RPC
    calls. Safe to run at any time without operator confirmation.

    Operator runs this BEFORE the backfill script (Plan 04) to know the
    real scope (CONTEXT.md D-09).

    Implements D-09 from CONTEXT.md.

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f scripts/audit-sms-zero-cost.mjs && echo "OK: file exists"</automated>
    <automated>node --check scripts/audit-sms-zero-cost.mjs && echo "OK: valid JS syntax"</automated>
    <automated>test "$(grep -cE '\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(' scripts/audit-sms-zero-cost.mjs)" = "0" && echo "OK: read-only confirmed"</automated>
    <automated>grep -q "provider', 'onurix'" scripts/audit-sms-zero-cost.mjs && grep -q "cost_cop', 0" scripts/audit-sms-zero-cost.mjs && grep -q "2026-04-16" scripts/audit-sms-zero-cost.mjs && echo "OK: filters present"</automated>
    <automated>grep -q "JSON_OUTPUT" scripts/audit-sms-zero-cost.mjs && grep -q "argv.includes('--json')" scripts/audit-sms-zero-cost.mjs && echo "OK: --json flag supported"</automated>
    <automated>grep -q "backfill-sms-zero-cost" scripts/audit-sms-zero-cost.mjs && echo "OK: next-step suggestion present"</automated>
    <automated>WC=$(wc -l < scripts/audit-sms-zero-cost.mjs); test "$WC" -gt 50 && echo "OK: file size $WC lines"</automated>
    <automated>git log -1 --oneline | grep -qE "sms-billing-atomic-rpc-03" && echo "OK: commit registered"</automated>
    <automated>test -f /tmp/audit-output.log && grep -q "SMS Zero-Cost Audit" /tmp/audit-output.log && echo "OK: script ran and produced output"</automated>
  </verify>
  <done>
    - `scripts/audit-sms-zero-cost.mjs` creado con sintaxis valida
    - 0 calls a operaciones de escritura (read-only confirmado)
    - Soporta dos modos: humano (default) + JSON (`--json`)
    - Ejecutado en produccion al menos una vez con output capturado en /tmp/audit-output.log
    - Numero exacto de rows huerfanos conocido (input critico para Plan 04)
    - Commit + push hechos
  </done>
</task>

</tasks>

<verification>
- `scripts/audit-sms-zero-cost.mjs` creado con ~60-80 lineas.
- `node --check` pasa.
- Script es estrictamente read-only (verificado por grep).
- Soporta modo humano + JSON.
- Output sugiere proximo paso (backfill script).
- Ejecutado en produccion, output capturado.
- Commit + push hechos.
</verification>

<success_criteria>
- El operador conoce el alcance exacto de la deuda historica antes de remediar.
- Plan 04 (backfill) tiene el numero exacto de rows que va a procesar.
- Hay una herramienta reusable de diagnostico para el futuro (si vuelven a aparecer rows con cost_cop=0).
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-billing-atomic-rpc/03-SUMMARY.md` documenting:
- Hash del commit local + remoto
- Output completo del run en produccion (copiar `/tmp/audit-output.log`)
- Numero exacto de rows huerfanos encontrados + lista de workspaces afectados + impacto monetario total
- Decisiones implementadas: D-09
- IDs especificos de los rows huerfanos (de los 2 documentados en debug + cualquier adicional)
- NEXT: Plan 04 (backfill) puede iniciar — el operador conoce el alcance
- Notas:
  - Si rows > 2: documentar la sorpresa, decidir si Plan 04 procede o se pausa para investigacion adicional
  - Si rows == 0: investigar (puede que alguien hizo manual cleanup)
  - Si rows == 2: alcance esperado, Plan 04 procede normal
</output>
</content>
