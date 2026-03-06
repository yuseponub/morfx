---
phase: quick-008
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260306000001_seed_cod_coverage.sql
  - src/app/actions/comandos.ts
autonomous: true

must_haves:
  truths:
    - "1,180 COD-eligible cities have supports_cod=true in carrier_coverage"
    - "Orders with esRecaudoContraentrega=true to non-COD cities are rejected with a clear error message before being sent to the robot"
    - "Orders with esRecaudoContraentrega=false (P/A or zero-value) are NOT affected by this validation"
    - "The rejection appears in the subirOrdenes return value so the UI shows it to the user"
  artifacts:
    - path: "supabase/migrations/20260306000001_seed_cod_coverage.sql"
      provides: "UPDATE statement setting supports_cod=true for 1,180 RCE cities"
    - path: "src/app/actions/comandos.ts"
      provides: "COD validation logic between city validation and robot job creation"
  key_links:
    - from: "src/app/actions/comandos.ts"
      to: "carrier_coverage.supports_cod"
      via: "CityValidationItem.supportsCod already flows from validateCities"
      pattern: "supportsCod"
---

<objective>
Implement COD (contra-entrega) city validation for the Coordinadora robot.

Purpose: Prevent orders marked as COD from being submitted to cities that don't support cash-on-delivery collection. Currently all 1,489 cities have supports_cod=false. The Excel "Poblaciones RCE" lists 1,180 cities that DO support COD. Orders to the remaining ~309 cities must be prepaid only.

Output: A SQL migration seeding the COD flag + validation logic in the dispatch flow.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@supabase/migrations/20260222000001_coordinadora_coverage.sql (carrier_coverage schema + seed data)
@src/app/actions/comandos.ts (subirOrdenes server action -- dispatch flow)
@src/lib/domain/carrier-coverage.ts (validateCities returns CityValidationItem with supportsCod)
@src/lib/logistics/constants.ts (PedidoInput type + department mapping)
</context>

<tasks>

<task type="auto">
  <name>Task 1: SQL migration to set supports_cod=true for 1,180 RCE cities</name>
  <files>supabase/migrations/20260306000001_seed_cod_coverage.sql</files>
  <action>
    Create a SQL migration file that UPDATEs carrier_coverage SET supports_cod = true WHERE city_coordinadora IN (...) for all 1,180 cities from the "Poblaciones RCE" Excel.

    The Excel format has CIUDAD column with values like "MEDELLIN (ANT)", "BOGOTA (C/MARCA)", etc. These match the city_coordinadora column exactly.

    Structure the migration as:
    1. A comment header explaining this seeds COD coverage from Coordinadora's RCE list
    2. A single UPDATE statement with IN clause listing all 1,180 city_coordinadora values
    3. A verification SELECT at the end: `SELECT COUNT(*) as cod_cities FROM carrier_coverage WHERE supports_cod = true AND carrier = 'coordinadora';` (expected: 1180)

    The city list must be extracted from the Excel file. Read the Excel or find the list of 1,180 cities. If the Excel is not directly readable, use the carrier_coverage seed data (all 1,489 cities are already in the migration file) and mark the 1,180 that appear in the RCE list.

    IMPORTANT: This is a DATA update only (no schema change). The supports_cod column already exists. This migration is safe to apply at any time.
  </action>
  <verify>
    Run: `grep -c "'" supabase/migrations/20260306000001_seed_cod_coverage.sql` to verify ~1,180 city entries are present.
    The SQL should be syntactically valid (no trailing commas, proper quoting of apostrophes in city names).
  </verify>
  <done>Migration file exists with UPDATE for exactly 1,180 COD-eligible cities. No schema changes, only data.</done>
</task>

<task type="auto">
  <name>Task 2: COD validation in subirOrdenes dispatch flow</name>
  <files>src/app/actions/comandos.ts</files>
  <action>
    Add COD city validation in the `subirOrdenes` function, AFTER city validation (step 6/6b) and BEFORE robot job creation (step 7).

    The validation logic:
    1. For each order in `validCityResults`, check if the order would be COD. An order is COD when:
       - It does NOT have the "P/A" tag (pago anticipado)
       - Its total_value > 0
       (This mirrors the logic in buildPedidoInputFromOrder lines 132 and 150)
    2. If the order IS COD, check `cityResult.supportsCod`
    3. If supportsCod is false, REJECT this order -- remove it from validCityResults and add it to invalidOrders with reason: `"Ciudad ${cityResult.coordinadoraCity} no soporta recaudo contra-entrega (COD). Use pago anticipado (tag P/A) o elija otra transportadora."`
    4. After filtering, if no valid orders remain, return early with the appropriate error

    Insert this as step "6c" between the AI resolution block (6b) and the "Build invalid orders report" block.

    Code pattern:
    ```typescript
    // 6c. COD city validation: reject COD orders to non-COD cities
    const codRejected: typeof invalidOrders = []
    const afterCodFilter: CityValidationItem[] = []

    for (const cityResult of validCityResults) {
      const order = orders.find(o => o.id === cityResult.orderId)
      if (!order) { afterCodFilter.push(cityResult); continue }

      const esPagoAnticipado = order.tags.some(t => t.toUpperCase() === 'P/A')
      const wouldBeCod = !esPagoAnticipado && (order.total_value || 0) > 0

      if (wouldBeCod && !cityResult.supportsCod) {
        codRejected.push({
          orderId: order.id,
          orderName: order.name,
          reason: `Ciudad ${cityResult.coordinadoraCity} no soporta recaudo contra-entrega (COD). Use pago anticipado (tag P/A) o elija otra transportadora.`,
        })
      } else {
        afterCodFilter.push(cityResult)
      }
    }

    // Replace validCityResults with filtered list
    validCityResults = afterCodFilter  // NOTE: validCityResults needs to be `let` not `const`
    ```

    Also update the line `const validCityResults = ...` to `let validCityResults = ...` (it's already mutable for the AI resolution block, verify this).

    Add the codRejected items to the invalidOrders array that gets returned in the result.

    The return type SubirOrdenesResult already has invalidOrders with reason field, so no type changes needed.

    IMPORTANT: Do NOT change buildPedidoInputFromOrder. The COD logic there (esRecaudoContraentrega field) remains as-is. This validation is a GATE that prevents COD orders from reaching the robot at all.
  </action>
  <verify>
    Run: `npx tsc --noEmit` to verify no type errors.
    Grep for "6c" comment in comandos.ts to confirm the validation block exists.
    Grep for "no soporta recaudo" to confirm the error message is present.
  </verify>
  <done>
    COD orders to non-COD cities are filtered out in subirOrdenes and reported as invalid with a clear message.
    P/A (prepaid) orders and zero-value orders pass through regardless of COD support.
    Type check passes.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    1. SQL migration that marks 1,180 cities as COD-eligible
    2. Validation gate in subirOrdenes that rejects COD orders to non-COD cities
  </what-built>
  <how-to-verify>
    1. MIGRATION: User must apply the migration in production Supabase FIRST (REGLA 5)
       - Run the SQL in Supabase SQL editor
       - Verify: `SELECT COUNT(*) FROM carrier_coverage WHERE supports_cod = true;` should return 1180
    2. After migration is confirmed, push code to Vercel
    3. TEST: Try to submit an order with total_value > 0 (no P/A tag) to a city NOT in the RCE list (one of the ~309 non-COD cities). It should be rejected with the COD error message.
    4. TEST: Same city but with P/A tag -- should go through normally.
    5. TEST: COD order to a COD-eligible city (e.g. MEDELLIN, BOGOTA) -- should go through normally.
  </how-to-verify>
  <resume-signal>Type "approved" after migration is applied and tests pass, or describe issues</resume-signal>
</task>

</tasks>

<verification>
- [ ] Migration file has exactly 1,180 city entries
- [ ] `npx tsc --noEmit` passes
- [ ] COD validation sits between city validation and job creation in subirOrdenes
- [ ] P/A orders bypass COD check
- [ ] Zero-value orders bypass COD check
- [ ] Rejected orders appear in invalidOrders with descriptive reason
</verification>

<success_criteria>
- carrier_coverage has 1,180 rows with supports_cod=true after migration
- COD orders to non-COD cities are rejected before reaching the robot
- P/A and zero-value orders are unaffected
- Error message clearly tells the user why and suggests alternatives
</success_criteria>

<output>
After completion, create `.planning/quick/008-validacion-cod-coordinadora/008-SUMMARY.md`
</output>
