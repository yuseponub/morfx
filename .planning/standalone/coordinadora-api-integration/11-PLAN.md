---
phase: coordinadora-api-integration
plan: 11
type: execute
wave: 4
depends_on: [10]
files_modified:
  - .planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md
autonomous: false
requirements: []
must_haves:
  truths:
    - "SMOKE-RUNBOOK.md exists documenting smoke 2-7 procedures for Wave 4 execution"
    - "Smoke 2 (OAuth) — documented commands, expected outputs, troubleshooting"
    - "Smoke 3 (cotizar nacional) — documented payload + expected response shape"
    - "Smoke 4 (createGuia Estándar nivelServicio=1) — documented body + verification"
    - "Smoke 5 (createGuia RCE nivelServicio=22 + valorRecaudar) — documented body + verification"
    - "Smoke 6 (imprimirEtiqueta base64) — documented input + base64 output validation"
    - "Smoke 7 (≥5 real webhooks received) — observation procedure + SQL verification"
    - "Each smoke has a CHECKBOX in the runbook for the executor to fill when D-37 credentials arrive"
    - "D-37 dependency is explicitly called out — this plan is NOT autonomous-executable today"
  artifacts:
    - path: ".planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md"
      provides: "Step-by-step runbook for smokes 2-7, to be executed when credentials arrive from Coordinadora"
---

<objective>
Document the procedures for smokes 2-7 in a runbook. This plan is BLOCKED on D-37 — Coordinadora's commercial team must deliver `client_id`, `client_secret`, `idProceso`, `divisionCliente`, `tipoCuenta`, `tipoProducto`, and the exact `/guias/*` POST path before the runbook can be EXECUTED.

This plan PRODUCES the runbook NOW so when credentials arrive (any future date — could be days or weeks), the executor (Claude or human) follows the runbook precisely without re-deriving payloads or commands.

**This plan is NOT autonomous-executable in the same Wave 4 as it appears in the dependency graph.** The runbook authoring IS autonomous; the EXECUTION of the runbook against real Coordinadora sandbox is gated on credentials. Execute-phase should mark Wave 4 as "blocked-on-external-event" until D-37 unblocks it.

Per D-31: each smoke must be committed individually when executed (so smoke evidence is part of git history).

Per D-26: cutover to prod must wait ≥ 8-jun-2026 (post-ERP migration). Sandbox smokes 2-6 can run any time after credentials arrive. Smoke 7 needs Coordinadora to actually push webhooks, which requires our endpoint URL to be registered with their Pub/Sub topic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@.planning/standalone/coordinadora-api-integration/reference/API Cotizador Nacional.pdf
@.planning/standalone/coordinadora-api-integration/reference/Documentacion Creacion de Guía Estándar y RCE.pdf
@.planning/standalone/coordinadora-api-integration/reference/Servicio etiquetas.pdf
@.planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author SMOKE-RUNBOOK.md with smokes 2-7 procedures</name>
  <files>.planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-31 (smoke definitions, line 114-121)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-37 (blocking dependencies, line 133-139)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Phase Requirements → Test Map (table near end)
    - .planning/standalone/coordinadora-api-integration/reference/API Cotizador Nacional.pdf (cotizar body shape)
    - .planning/standalone/coordinadora-api-integration/reference/Documentacion Creacion de Guía Estándar y RCE.pdf (Estándar + RCE bodies)
    - .planning/standalone/coordinadora-api-integration/reference/Servicio etiquetas.pdf (etiquetas body)
    - .planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf (webhook payload shapes)
  </read_first>
  <action>
    Create `.planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md` with the following content:

    ```markdown
    # Smoke Runbook — Smokes 2-7

    **Standalone:** coordinadora-api-integration
    **Status:** ⏸ **BLOCKED on D-37** (Coordinadora must deliver credentials before any smoke 2-7 can execute)
    **Authored:** 2026-05-26
    **Smoke 1:** ✅ completed in Plan 10 (Wave 3) — webhook stub responds 200 to PDF page 1 envelope

    ## D-37 Blocking Items

    Before running ANY smoke 2-7, verify these 5 items are RECEIVED from Coordinadora:

    - [ ] **Item 1:** `COORDINADORA_CLIENT_ID` + `COORDINADORA_CLIENT_SECRET` (test environment)
    - [ ] **Item 2:** `COORDINADORA_ID_PROCESO`
    - [ ] **Item 3:** `COORDINADORA_DIVISION_CLIENTE`
    - [ ] **Item 4:** `COORDINADORA_TIPO_CUENTA` + `COORDINADORA_TIPO_PRODUCTO`
    - [ ] **Item 5:** Exact `/guias/*` POST path — set as `COORDINADORA_GUIAS_PATH` in Vercel

    Once received:
    1. Update Vercel env vars (overwrite the `PLACEHOLDER_PENDING_D37` values from Plan 02)
    2. Trigger a Vercel redeploy (push an empty commit or use the Vercel dashboard "Redeploy" button) so the new env vars are picked up
    3. Begin smoke 2

    ---

    ## Smoke 2 — OAuth Token Exchange ✅/❌

    **Goal:** `getToken('test')` returns a string from `/oauth/token` with the new credentials.

    **Method:** indirect — there's no direct CLI for getToken. Trigger it via cotizar (Smoke 3 below) OR a one-off Node script:

    **Option A (preferred — exposed via Smoke 3):** run Smoke 3 with the simplest payload. If cotizar returns 200, the token was issued and cached.

    **Option B (direct, manual):**
    ```bash
    # Build the Basic Auth header
    CRED_B64=$(printf '%s:%s' "$COORDINADORA_CLIENT_ID" "$COORDINADORA_CLIENT_SECRET" | base64 | tr -d '\n')

    # POST to /oauth/token (test environment)
    curl -i -X POST 'https://api-test.coordinadora.tech/oauth/token?grant_type=client_credentials' \
      -H "Authorization: Basic ${CRED_B64}" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      -d 'grant_type=client_credentials'
    ```

    **Expected:**
    - HTTP 200
    - JSON body with `access_token` (or `acces_token` if Coordinadora's response uses the PDF-typo key — Pitfall 1)
    - `expires_in` present (string `"3599"` per PDF — IGNORED by our code, we hardcode 55min)

    **Troubleshooting:**
    - 401 → wrong `client_id` / `client_secret` — re-check with Coordinadora
    - 404 → wrong base URL — verify against PDF (`api-test.coordinadora.tech`, NOT `api-devcoordinadora.tech` typo)
    - 5xx → Coordinadora server-side; retry

    **Evidence to commit:** save the JSON response (sanitized — REPLACE `access_token` with `<REDACTED>`) to `.planning/standalone/coordinadora-api-integration/smoke-evidence/smoke-02-oauth.json`. Commit with message `smoke(coordinadora-api): smoke 2 OAuth token PASS`.

    - [ ] Smoke 2 PASS evidence committed

    ---

    ## Smoke 3 — Cotizador Nacional ✅/❌

    **Goal:** `cotizar()` returns a quote for Bogotá → Medellín, 1kg, 50.000 COP declared value.

    **Method:** Use a Vercel-side endpoint that exercises cotizar. Since no UI exists yet, the fastest path is a one-off Inngest function OR direct CLI:

    **Option A — CLI (Bearer token from Smoke 2):**
    ```bash
    TOKEN="<access_token from smoke 2>"

    curl -i -X POST 'https://api-test.coordinadora.tech/cotizador/nacional' \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d '{
        "codigoPais": "170",
        "ciudadOrigen": "11001",
        "ciudadDestino": "05001",
        "pesoTotal": 1,
        "valorDeclarado": 50000,
        "unidades": 1,
        "altoCm": 10,
        "anchoCm": 10,
        "largoCm": 10,
        "tipoCuenta": "<COORDINADORA_TIPO_CUENTA>",
        "tipoProducto": "<COORDINADORA_TIPO_PRODUCTO>"
      }'
    ```

    **Expected:**
    - HTTP 200
    - JSON body with `flete_total`, `dias_entrega`, `tipo_trayecto` populated

    **Troubleshooting:**
    - 400 with field-error → re-read PDF for required field shape (codigoPais=170 for Colombia, ciudad codes are DANE)
    - 401 → token expired; re-run Smoke 2 to get a fresh one (or wait for our 55min cache to expire)

    **Evidence to commit:** save the JSON response to `.planning/standalone/coordinadora-api-integration/smoke-evidence/smoke-03-cotizar.json`. Commit `smoke(coordinadora-api): smoke 3 cotizar PASS`.

    - [ ] Smoke 3 PASS evidence committed

    ---

    ## Smoke 4 — Crear Guía Estándar (`nivelServicio: 1`) ✅/❌

    **Goal:** `createGuia()` creates a real test guide with `nivelServicio=1` (no recaudo). Coordinadora returns an 11-digit `numero_guia`.

    **Method:**
    ```bash
    TOKEN="<access_token from smoke 2>"
    GUIAS_PATH="<COORDINADORA_GUIAS_PATH from D-37 item 5>"

    curl -i -X POST "https://api-test.coordinadora.tech${GUIAS_PATH}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d '{
        "nivelServicio": 1,
        "idProceso": "<COORDINADORA_ID_PROCESO>",
        "divisionCliente": "<COORDINADORA_DIVISION_CLIENTE>",
        "nitCliente": "902052328",
        "tipoCuenta": "<COORDINADORA_TIPO_CUENTA>",
        "tipoProducto": "<COORDINADORA_TIPO_PRODUCTO>",
        "destinatario": { "nombre": "Smoke Test", "telefono": "3000000000" },
        "direccion": { "direccion": "Calle 100 # 50-50", "ciudad": "11001", "departamento": "CUNDINAMARCA" },
        "productos": [{ "descripcion": "Smoke", "cantidad": 1, "pesoUnitario": 0.1, "valorUnitario": 10000 }],
        "pesoTotal": 0.1,
        "valorDeclarado": 10000,
        "unidades": 1,
        "referencia": "SMOKE-4"
      }'
    ```

    **Expected:**
    - HTTP 200 or 201
    - JSON body with `numero_guia` (11-digit string)

    **Save `numero_guia` for Smoke 6.**

    **Troubleshooting:**
    - 400 → re-check field names against PDF (`Documentacion Creacion de Guía Estándar y RCE.pdf` page 3)
    - 404 on the URL → `COORDINADORA_GUIAS_PATH` env var is wrong; ask Coordinadora for the exact path

    **Evidence:** save response to `smoke-evidence/smoke-04-guia-estandar.json`. Commit `smoke(coordinadora-api): smoke 4 createGuia Estándar PASS — numero_guia=<...>`.

    - [ ] Smoke 4 PASS evidence committed
    - `numero_guia` Estándar = `___________` (record here for Smoke 6)

    ---

    ## Smoke 5 — Crear Guía RCE (`nivelServicio: 22`, `valorRecaudar`) ✅/❌

    **Goal:** `createGuia()` creates a Recaudo Contra Entrega guide. Coordinadora returns an 11-digit `numero_guia`.

    **Method:** identical to Smoke 4 but with `nivelServicio: 22` + `valorRecaudar`:

    ```bash
    curl -i -X POST "https://api-test.coordinadora.tech${GUIAS_PATH}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d '{
        "nivelServicio": 22,
        "valorRecaudar": 150000,
        "idProceso": "<COORDINADORA_ID_PROCESO>",
        "divisionCliente": "<COORDINADORA_DIVISION_CLIENTE>",
        "nitCliente": "902052328",
        "tipoCuenta": "<COORDINADORA_TIPO_CUENTA>",
        "tipoProducto": "<COORDINADORA_TIPO_PRODUCTO>",
        "destinatario": { "nombre": "Smoke RCE", "telefono": "3000000001" },
        "direccion": { "direccion": "Carrera 7 # 80-20", "ciudad": "11001", "departamento": "CUNDINAMARCA" },
        "productos": [{ "descripcion": "Smoke RCE", "cantidad": 1, "pesoUnitario": 0.2, "valorUnitario": 150000 }],
        "pesoTotal": 0.2,
        "valorDeclarado": 150000,
        "unidades": 1,
        "referencia": "SMOKE-5"
      }'
    ```

    **Expected:** HTTP 200/201 + `numero_guia` (11-digit string). Save for Smoke 6.

    **Evidence:** `smoke-evidence/smoke-05-guia-rce.json`. Commit `smoke(coordinadora-api): smoke 5 createGuia RCE PASS — numero_guia=<...>`.

    - [ ] Smoke 5 PASS evidence committed
    - `numero_guia` RCE = `___________`

    ---

    ## Smoke 6 — Imprimir Etiquetas (base64 PDF for 2 guías) ✅/❌

    **Goal:** `imprimirEtiqueta()` returns a base64-encoded PDF for both numeros_guia from Smokes 4+5.

    **Method:**
    ```bash
    GUIA_ESTANDAR="<numero_guia from smoke 4>"
    GUIA_RCE="<numero_guia from smoke 5>"

    curl -i -X POST 'https://api-test.coordinadora.tech/etiquetas/imprimir' \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d "{
        \"tipo_etiqueta\": \"55\",
        \"guias\": [\"${GUIA_ESTANDAR}\", \"${GUIA_RCE}\"]
      }"
    ```

    **Expected:**
    - HTTP 200
    - JSON body with `etiqueta_base64` (or similar key) containing a non-empty base64 string

    **Verification — decode and check PDF magic bytes:**
    ```bash
    # Save response to file
    # ... (curl output saved as smoke-06-etiqueta.json) ...

    # Extract base64 and decode
    cat smoke-06-etiqueta.json | jq -r '.etiqueta_base64' | base64 -d > smoke-06.pdf

    # Check magic bytes (should start with %PDF-)
    head -c 5 smoke-06.pdf
    # Expected: %PDF-
    ```

    **Evidence:** save response JSON to `smoke-evidence/smoke-06-etiqueta.json` AND the decoded PDF to `smoke-evidence/smoke-06.pdf`. Commit `smoke(coordinadora-api): smoke 6 imprimirEtiqueta PASS — 2 guías`.

    - [ ] Smoke 6 PASS evidence committed (JSON + decoded PDF)

    ---

    ## Smoke 7 — Real Webhook Reception (≥5 events with codes 2/5/6) ✅/❌

    **Goal:** Coordinadora pushes ≥5 real webhooks to `/api/webhooks/coordinadora/test` after Smokes 4+5 created guides. Status codes 2 (EN_TERMINAL_ORIGEN), 5 (EN_REPARTO), 6 (ENTREGADA) are simulable per CONTEXT D-18.

    **Pre-requisite:** Coordinadora must have our endpoint registered with their Pub/Sub topic. This is a Coordinadora-side configuration — D-37 item 5 implicitly. Confirm with Jenny that webhook URL `https://morfx.app/api/webhooks/coordinadora/test` is wired to receive notifications for guides created under NIT `902052328`.

    **Method:** Passive observation. After Smokes 4+5 created 2 guides, Coordinadora will (over hours/days in sandbox, or immediately if they have a "simulate state change" tool) push events. Monitor:

    ```sql
    -- Check incoming events
    SELECT
      created_at,
      tracking_number,
      codigo,
      codigo_estado,
      env,
      source
    FROM order_carrier_events
    WHERE carrier = 'coordinadora'
      AND env = 'test'
      AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC;
    ```

    Wait until ≥5 events appear with the 2 numeros_guia from Smokes 4+5, ideally spanning at least 3 distinct codigo values (2, 5, 6).

    **Alternative — request simulation from Coordinadora:**
    If passive wait is too slow, ask Jenny to manually trigger state transitions in their test environment for guides created with Smokes 4+5.

    **Verification per event:**
    - Row inserted in `order_carrier_events`
    - Observability row inserted in `agent_observability_events` (event_type='coordinadora_webhook_processed', agent_id='coordinadora-webhook')
    - PII redaction holds (payload.trackingNumberLast4 only, never full)

    **Evidence:** SQL output paste with ≥5 rows + 3+ distinct codigos. Commit `smoke(coordinadora-api): smoke 7 webhook reception PASS — N events`.

    - [ ] Smoke 7 PASS evidence committed (SQL output)

    ---

    ## Wrap-up after all smokes pass

    1. Update CLAUDE.md `Scopes por Agente` to add a new section for `coordinadora-api-integration` module scope (PUEDE / NO PUEDE / Validation / Consumers).
    2. Update MEMORY (or equivalent) with the standalone shipped status.
    3. Flip `COORDINADORA_ENV` from `test` to `prod` in Vercel ONLY when D-26 cutover date (≥8-jun-2026) has passed AND Coordinadora confirms prod credentials are live.
    4. Consider follow-up standalone `coordinadora-api-callers` to wire `cotizar` / `createGuia` / `imprimirEtiqueta` into the existing order-creation flow (currently the Railway robot does this — D-25 coexistence).

    ## Verification — runbook execution checklist (executor fills in)

    | Smoke | PASS/FAIL | Date | Evidence file | Commit SHA |
    |-------|-----------|------|---------------|------------|
    | 2 OAuth | | | smoke-evidence/smoke-02-oauth.json | |
    | 3 cotizar | | | smoke-evidence/smoke-03-cotizar.json | |
    | 4 createGuia Estándar | | | smoke-evidence/smoke-04-guia-estandar.json | |
    | 5 createGuia RCE | | | smoke-evidence/smoke-05-guia-rce.json | |
    | 6 imprimirEtiqueta | | | smoke-evidence/smoke-06-etiqueta.json + smoke-06.pdf | |
    | 7 webhook reception | | | smoke-evidence/smoke-07-sql.txt | |
    ```

    Commit message: `docs(coordinadora-api): author smoke 2-7 runbook (deferred until D-37)`
  </action>
  <verify>
    <automated>test -f .planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md &amp;&amp; grep -c "## Smoke " .planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md | awk '{ exit ($1 == 6 ? 0 : 1) }' &amp;&amp; grep -q "BLOCKED on D-37" .planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md` exists
    - Contains exactly 6 `## Smoke ` section headers (smokes 2 through 7)
    - Contains "BLOCKED on D-37" header text
    - Contains a D-37 checklist with 5 items (matching CONTEXT D-37)
    - Each smoke section has a command block + expected output + evidence commit instructions + acceptance checkbox
    - Smoke 7 references the SQL verification + PII redaction check
    - File committed
  </acceptance_criteria>
  <done>Runbook authored. When credentials arrive (D-37 unblock), executor (Claude or human) can follow this runbook precisely without re-deriving payloads.</done>
</task>

<task type="checkpoint:human-action" gate="non-blocking">
  <name>Task 2: [DEFERRED — Wave 4 execution gate] Execute smokes 2-7 when D-37 credentials arrive</name>
  <what-built>Smoke runbook is authored and ready. Execution is DEFERRED until Coordinadora delivers all 5 D-37 items.</what-built>
  <how-to-verify>
    This task is intentionally LEFT OPEN. When Coordinadora delivers credentials:

    1. Open `.planning/standalone/coordinadora-api-integration/SMOKE-RUNBOOK.md`
    2. Update Vercel env vars with the real values (overwrite the PLACEHOLDER_PENDING_D37 values from Plan 02)
    3. Redeploy Vercel (push an empty commit or use dashboard "Redeploy")
    4. Walk through smokes 2, 3, 4, 5, 6 in order — commit each evidence file as you go
    5. Wait for Coordinadora to push ≥5 webhooks (or request simulation) and confirm Smoke 7

    Once all 6 smokes are committed with PASS evidence, type "smokes-2-7-complete" in this chat (or create a `WRAP-UP-SUMMARY.md` documenting the final state of the standalone).

    NOTE: this task may be open for days, weeks, or months depending on Coordinadora's commercial timeline. That's expected. The blocking dependency is documented in CONTEXT.md D-37 and is OUTSIDE engineering's control.
  </how-to-verify>
  <resume-signal>Type "smokes-2-7-complete" when all 6 smokes have PASS evidence committed. Until then, this task remains open — the standalone is FUNCTIONALLY COMPLETE (Wave 0-3 ship the code; Wave 4 is operational verification).</resume-signal>
  <done>All 6 smokes have PASS evidence committed. The standalone is officially shipped. Update CLAUDE.md scopes section + MEMORY at this point.</done>
</task>

</tasks>

<verification>
- SMOKE-RUNBOOK.md created with all 6 smokes documented
- D-37 blocking checklist embedded in runbook
- Task 2 left open (correct — gated on external event)
</verification>

<success_criteria>
1. Runbook authored and committed
2. Standalone is functionally complete at end of Wave 3 (code works, smoke 1 passes)
3. Wave 4 execution waits for D-37 unblock — runbook ensures zero re-derivation work when that happens
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/11-SUMMARY.md` documenting:
- Confirmation SMOKE-RUNBOOK.md is in place
- Note: Task 2 is OPEN by design (blocked on D-37 — Coordinadora-side dependency)
- Forward link: when smokes complete, executor should append a WRAP-UP-SUMMARY.md documenting the actual smoke outputs and consider the standalone fully shipped
</output>
