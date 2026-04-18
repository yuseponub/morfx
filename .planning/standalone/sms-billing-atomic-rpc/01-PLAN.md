---
phase: sms-billing-atomic-rpc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260417XXXXXX_sms_atomic_rpc.sql
autonomous: false

must_haves:
  truths:
    - "Existe UN solo archivo de migracion `supabase/migrations/20260417{HHMMSS}_sms_atomic_rpc.sql` que contiene las TRES definiciones (insert_and_deduct_sms_message + deduct_sms_balance patch + backfill_sms_message)"
    - "El RPC `insert_and_deduct_sms_message` envuelve INSERT en sms_messages + UPDATE de sms_workspace_config + INSERT en sms_balance_transactions en UNA sola transaccion plpgsql con FOR UPDATE lock"
    - "El RPC `insert_and_deduct_sms_message` rechaza con `RAISE EXCEPTION ... USING ERRCODE = 'P0001'` cuando p_amount (resuelto via COALESCE) es <= 0 (D-06)"
    - "El RPC `deduct_sms_balance` (existente, patched via CREATE OR REPLACE) rechaza con `RAISE EXCEPTION ... USING ERRCODE = 'P0001'` cuando p_amount es <= 0 (D-05)"
    - "El RPC `backfill_sms_message(p_sms_message_id, p_expected_cost_cop)` repara UN row huerfano atomicamente (UPDATE sms_messages.cost_cop + UPDATE sms_workspace_config.balance_cop + INSERT sms_balance_transactions con type='sms_deduction_backfill') y es idempotente (early-return si cost_cop ya > 0)"
    - "El RPC `backfill_sms_message` NO incrementa total_sms_sent (Pitfall 7 — el deduct original ya lo incremento aunque cost_cop quedara en 0)"
    - "Las 3 funciones tienen GRANT EXECUTE a authenticated y service_role"
    - "Las 3 funciones usan SECURITY DEFINER y LANGUAGE plpgsql"
    - "La migracion fue aplicada en Supabase produccion via SQL Editor (manual humano — Regla 5) y verificada con queries de test"
    - "Las 3 verification queries (guard deduct, guard insert, happy path con BEGIN/ROLLBACK) corrieron y arrojaron los resultados esperados"
  artifacts:
    - path: "supabase/migrations/20260417XXXXXX_sms_atomic_rpc.sql"
      provides: "Migracion SQL con las 3 RPCs nuevas/modificadas"
      contains: "CREATE OR REPLACE FUNCTION insert_and_deduct_sms_message"
      min_lines: 200
  key_links:
    - from: "RPC insert_and_deduct_sms_message"
      to: "tablas sms_messages + sms_workspace_config + sms_balance_transactions"
      via: "INSERT + UPDATE + INSERT en transaccion plpgsql con FOR UPDATE lock sobre sms_workspace_config"
      pattern: "FOR UPDATE.*INSERT INTO sms_messages.*UPDATE sms_workspace_config.*INSERT INTO sms_balance_transactions"
    - from: "RPC backfill_sms_message"
      to: "RPC insert_and_deduct_sms_message"
      via: "Misma migracion SQL — ambas se aplican atomicamente (Pitfall 8)"
      pattern: "CREATE OR REPLACE FUNCTION backfill_sms_message"
---

<objective>
Crear UN unico archivo de migracion SQL que define/modifica TRES RPCs Postgres y aplicarlo en produccion ANTES de cualquier push de codigo (Regla 5):

1. **`insert_and_deduct_sms_message`** (NUEVO) — RPC atomico que reemplaza el patron actual de "INSERT + RPC separados" (Defect B raiz). Incluye guard p_amount<=0 (D-06).
2. **`deduct_sms_balance`** (PATCH via CREATE OR REPLACE) — Anade guard p_amount<=0 (D-05). Resto del cuerpo identico al original.
3. **`backfill_sms_message`** (NUEVO) — RPC atomico para reparar UN row huerfano (cost_cop=0). Idempotente. Sera consumido por Plan 04 (script de backfill).

**Por que las 3 en UNA migracion (Pitfall 8):**
Si fueran archivos separados y solo se aplicara el primero a produccion, quedaria `deduct_sms_balance` SIN guard mientras el codigo refactorizado de Plan 02 ya espera el guard. Una sola migracion = un solo CHECKPOINT humano (apply-or-rollback all-or-nothing).

**Por que tiene checkpoint:human-verify (Regla 5):**
Ningun codigo de Plan 02-04 puede pushearse hasta que el usuario aplique manualmente la migracion en Supabase Dashboard SQL Editor de produccion. Se documento en `MEMORY.md` que el bug de "20h de mensajes perdidos" fue causado por codigo desplegado sobre schema inexistente. Esta fase no repite ese error.

**Por que NO usa `supabase db push`:**
Patron operacional establecido del proyecto: el usuario aplica migraciones manualmente en SQL Editor de Dashboard. Pitfall A5 (RESEARCH.md) verificado.

Purpose: Cerrar el Defect B (no atomicidad) por diseño Postgres + cerrar el Defect C (RPC sin guard) en ambos RPCs + crear la herramienta SQL para el backfill (Plan 04).

Output: Archivo `supabase/migrations/20260417{HHMMSS}_sms_atomic_rpc.sql` con ~200+ lineas, commiteado a git, aplicado en produccion, y verificado con 3 SQL queries.
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
@supabase/migrations/20260316100000_sms_onurix_foundation.sql

<interfaces>
<!-- Tablas afectadas (schema ya existente — NO modificar) -->
sms_messages (
  id UUID PK, workspace_id UUID, provider_message_id TEXT, provider TEXT,
  from_number TEXT, to_number TEXT, body TEXT, direction TEXT, status TEXT,
  segments INTEGER, cost_cop DECIMAL, source TEXT,
  automation_execution_id UUID NULL, contact_name TEXT NULL,
  created_at TIMESTAMPTZ
)

sms_workspace_config (
  workspace_id UUID PK, balance_cop DECIMAL, is_active BOOLEAN,
  allow_negative_balance BOOLEAN, total_sms_sent INTEGER, total_credits_used DECIMAL,
  updated_at TIMESTAMPTZ
)

sms_balance_transactions (
  id UUID PK, workspace_id UUID, type TEXT, amount_cop DECIMAL,
  balance_after DECIMAL, description TEXT, sms_message_id UUID NULL,
  created_at TIMESTAMPTZ
)

<!-- RPC existente que se va a reemplazar (CREATE OR REPLACE) -->
deduct_sms_balance(
  p_workspace_id UUID,
  p_amount DECIMAL,
  p_sms_message_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT)

<!-- RPCs nuevos (firmas que Plan 02 y Plan 04 van a invocar) -->
insert_and_deduct_sms_message(
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
  p_amount DECIMAL DEFAULT NULL,
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(success BOOLEAN, sms_message_id UUID, new_balance DECIMAL, error_message TEXT)

backfill_sms_message(
  p_sms_message_id UUID,
  p_expected_cost_cop DECIMAL DEFAULT 97
)
RETURNS TABLE(success BOOLEAN, workspace_id UUID, new_balance DECIMAL, error_message TEXT)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo de migracion SQL con las 3 RPCs</name>
  <read_first>
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Code Examples (lineas 490-757) — TRES bloques SQL listos para copiar (insert_and_deduct + deduct patch + backfill)
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Pitfall 8 (lineas 372-385) — JUSTIFICACION de por que las 3 van en UNA migracion
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Pitfall 7 (lineas 359-371) — backfill NO debe incrementar total_sms_sent
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Migration Filename Convention (lineas 1202-1212) — patron de nombre de archivo
    - supabase/migrations/20260316100000_sms_onurix_foundation.sql lineas 149-201 — CONTENIDO ACTUAL de deduct_sms_balance (el patch de D-05 anade SOLO el guard al inicio, resto identico)
    - .planning/standalone/sms-billing-atomic-rpc/CONTEXT.md §D-01 a D-13 (lineas 28-72) — todas las decisiones implementadas en esta migracion
  </read_first>
  <action>
    **Paso 1 — Determinar nombre del archivo:**

    ```bash
    NOW=$(date -u +"%Y%m%d%H%M%S")
    MIGRATION_FILE="supabase/migrations/${NOW}_sms_atomic_rpc.sql"
    echo "Will create: $MIGRATION_FILE"
    ```

    Verificar que no choca con migraciones existentes:
    ```bash
    ls supabase/migrations/2026041*_sms_atomic_rpc.sql 2>/dev/null
    ```
    Si existe ya un archivo con sufijo `_sms_atomic_rpc.sql` en abril 2026, ABORTAR (alguien ya lo creo) — investigar antes de duplicar.

    **Paso 2 — Crear el archivo de migracion con las 3 RPCs en orden:**

    Estructura del archivo (ESTRICTA):
    ```sql
    -- Migration: ${MIGRATION_FILE}
    -- Phase: standalone/sms-billing-atomic-rpc (Plan 01)
    -- Depends on: 20260316100000_sms_onurix_foundation.sql
    --
    -- This migration introduces atomic SMS billing operations to close 3 defects:
    --   Defect B (non-atomic INSERT + RPC) → new insert_and_deduct_sms_message RPC
    --   Defect C (deduct_sms_balance has no guard) → guard added via CREATE OR REPLACE
    --   Historical orphan rows (cost_cop=0) → backfill_sms_message RPC for repair script
    --
    -- All three functions deploy atomically. Pitfall 8: do NOT split into multiple
    -- migration files; Plan 02 refactor + Plan 04 backfill both depend on this.

    -- ============================================================================
    -- 1. insert_and_deduct_sms_message (NEW) — D-01, D-02, D-06
    --    Atomic INSERT + UPDATE + INSERT in a single plpgsql transaction.
    --    Replaces the current pattern in src/lib/domain/sms.ts:132-185 of separate
    --    INSERT to sms_messages + RPC call to deduct_sms_balance.
    -- ============================================================================
    [PEGAR EL BLOQUE COMPLETO de RESEARCH.md lineas 502-605 — incluye CREATE OR REPLACE FUNCTION + body + GRANTs]

    -- ============================================================================
    -- 2. deduct_sms_balance (PATCH via CREATE OR REPLACE) — D-05
    --    Adds guard p_amount <= 0 → RAISE EXCEPTION. Body otherwise unchanged from
    --    20260316100000_sms_onurix_foundation.sql:149-201.
    --    KEPT (not deprecated) per D-04: future top-up/super-admin paths may use it.
    -- ============================================================================
    [PEGAR EL BLOQUE COMPLETO de RESEARCH.md lineas 614-672 — incluye CREATE OR REPLACE + body + GRANTs]

    -- ============================================================================
    -- 3. backfill_sms_message (NEW) — D-10
    --    Atomic per-row repair tool used by scripts/backfill-sms-zero-cost.mjs (Plan 04).
    --    Idempotent: skips rows where cost_cop already > 0.
    --    Pitfall 7: does NOT increment total_sms_sent (original deduct_sms_balance
    --    already incremented it even though cost_cop ended at 0).
    -- ============================================================================
    [PEGAR EL BLOQUE COMPLETO de RESEARCH.md lineas 682-756 — incluye CREATE OR REPLACE + body + GRANTs]

    -- ============================================================================
    -- END OF MIGRATION
    -- After applying, verify with the queries documented in
    -- .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §RAISE EXCEPTION verification queries
    -- ============================================================================
    ```

    Reglas para el copiado:
    - Pegar VERBATIM los bloques SQL de RESEARCH.md — ya estan validados (verified patterns).
    - NO modificar firmas de funciones (Plan 02 ya espera estas firmas exactas).
    - NO modificar el orden (insert_and_deduct primero, deduct_sms_balance segundo, backfill tercero).
    - Mantener los comentarios separadores `-- ===` para legibilidad operacional en Supabase Dashboard.
    - Asegurar que cada CREATE OR REPLACE termina con sus GRANTs antes del siguiente bloque.

    **Paso 3 — Verificar SQL syntax basica:**

    ```bash
    # Verificar balance de BEGIN/END, $$ delimiters
    grep -c "^CREATE OR REPLACE FUNCTION" "$MIGRATION_FILE"  # Expected: 3
    grep -c "^GRANT EXECUTE" "$MIGRATION_FILE"               # Expected: 6 (2 per function)
    grep -c "RAISE EXCEPTION" "$MIGRATION_FILE"              # Expected: 2 (deduct + insert_and_deduct guards)
    grep -c "FOR UPDATE" "$MIGRATION_FILE"                   # Expected: 3 (one per function — locks sms_workspace_config)
    grep -c "SECURITY DEFINER" "$MIGRATION_FILE"             # Expected: 3
    grep -c "LANGUAGE plpgsql" "$MIGRATION_FILE"             # Expected: 3
    wc -l "$MIGRATION_FILE"                                  # Expected: ~200-280 lines
    ```

    Si cualquier conteo NO matchea lo esperado, REVISAR el archivo y corregir antes de commitear.

    **Paso 4 — Commit (NO push aun — el push lo hara Plan 02 despues del checkpoint):**

    ```bash
    git add "$MIGRATION_FILE"
    git commit -m "feat(sms-billing-atomic-rpc-01): add atomic SMS billing migration

    Introduces three RPC operations in a single migration (Pitfall 8):

    1. insert_and_deduct_sms_message (NEW): atomic INSERT to sms_messages +
       UPDATE sms_workspace_config + INSERT sms_balance_transactions in one
       plpgsql transaction with FOR UPDATE lock. Closes Defect B (non-atomic
       SMS billing) by design. Implements D-01, D-02, D-06.

    2. deduct_sms_balance (PATCH): adds guard p_amount <= 0 → RAISE EXCEPTION.
       Body otherwise unchanged. Kept as separate RPC per D-04 for top-up paths.
       Implements D-05.

    3. backfill_sms_message (NEW): idempotent per-row repair for orphan
       sms_messages with cost_cop=0. Used by Plan 04 backfill script.
       Does NOT increment total_sms_sent (Pitfall 7). Implements D-10.

    All three functions: SECURITY DEFINER, GRANT to authenticated + service_role.

    NEXT: human applies migration in Supabase Dashboard before any code push (Regla 5).

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
    ```

    **NO ejecutar `git push`** — el push se hace en Plan 02 despues de que el humano confirme la migracion aplicada en produccion. Si pusheamos ahora con la migracion sin aplicar, no se rompe nada (no hay codigo aun que dependa de las RPCs), pero por consistencia operacional con Regla 5, mantenemos el commit local hasta el checkpoint.

    **Excepcion:** Si el operador decide pushear inmediatamente para tener backup en remoto, esta OK — el archivo SQL en main no rompe nada por si solo. Plan 02 es quien debe esperar al checkpoint.
  </action>
  <verify>
    <automated>test -f supabase/migrations/2026041*_sms_atomic_rpc.sql && echo "OK: migration file exists"</automated>
    <automated>MIG=$(ls supabase/migrations/2026041*_sms_atomic_rpc.sql | head -1); test "$(grep -c '^CREATE OR REPLACE FUNCTION' "$MIG")" = "3" && echo "OK: 3 functions defined"</automated>
    <automated>MIG=$(ls supabase/migrations/2026041*_sms_atomic_rpc.sql | head -1); test "$(grep -c '^GRANT EXECUTE' "$MIG")" = "6" && echo "OK: 6 grants"</automated>
    <automated>MIG=$(ls supabase/migrations/2026041*_sms_atomic_rpc.sql | head -1); test "$(grep -c 'RAISE EXCEPTION' "$MIG")" = "2" && echo "OK: 2 guards (deduct + insert_and_deduct)"</automated>
    <automated>MIG=$(ls supabase/migrations/2026041*_sms_atomic_rpc.sql | head -1); test "$(grep -c 'FOR UPDATE' "$MIG")" = "3" && echo "OK: 3 row locks"</automated>
    <automated>MIG=$(ls supabase/migrations/2026041*_sms_atomic_rpc.sql | head -1); grep -q "insert_and_deduct_sms_message" "$MIG" && grep -q "backfill_sms_message" "$MIG" && grep -q "deduct_sms_balance" "$MIG" && echo "OK: all 3 function names present"</automated>
    <automated>MIG=$(ls supabase/migrations/2026041*_sms_atomic_rpc.sql | head -1); WC=$(wc -l < "$MIG"); test "$WC" -gt 180 && echo "OK: migration size $WC lines"</automated>
    <automated>git log -1 --oneline | grep -qE "sms-billing-atomic-rpc-01" && echo "OK: commit registered"</automated>
  </verify>
  <done>
    - Archivo `supabase/migrations/2026041{...}_sms_atomic_rpc.sql` existe en disco
    - Contiene 3 CREATE OR REPLACE FUNCTION (insert_and_deduct_sms_message, deduct_sms_balance, backfill_sms_message)
    - Contiene 6 GRANT EXECUTE (2 por funcion: authenticated + service_role)
    - Contiene 2 RAISE EXCEPTION (guards en deduct_sms_balance + insert_and_deduct_sms_message)
    - Commit registrado en git local con prefijo `sms-billing-atomic-rpc-01`
    - NO pusheado aun (espera al checkpoint Task 2)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint — Humano aplica migracion en Supabase produccion + corre 3 verification queries (Regla 5)</name>
  <read_first>
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §RAISE EXCEPTION verification queries (lineas 1151-1198) — los 3 SQL tests que el humano debe correr
    - .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md §Pitfall 10 (lineas 396-411) — race condition durante migration apply (CREATE OR REPLACE es atomic, pero hot traffic durante el apply puede ver brevemente la version vieja)
    - CLAUDE.md §Regla 5 — "NUNCA pushear codigo que referencia columnas/tablas/constraints que no existen en produccion"
    - El archivo recien creado: `supabase/migrations/2026041{...}_sms_atomic_rpc.sql`
  </read_first>
  <what-built>
    El agente creo y commiteo (local) el archivo de migracion `supabase/migrations/2026041{HHMMSS}_sms_atomic_rpc.sql` con TRES RPCs Postgres:

    1. `insert_and_deduct_sms_message` (NUEVO) — atomico INSERT+UPDATE+INSERT
    2. `deduct_sms_balance` (PATCH) — anade guard p_amount<=0
    3. `backfill_sms_message` (NUEVO) — repara rows huerfanos con cost_cop=0

    **Lo que falta — y SOLO el humano puede hacer:**
    - Abrir Supabase Dashboard → proyecto produccion → SQL Editor
    - Ejecutar el contenido del archivo de migracion
    - Verificar que las 3 funciones existen post-apply
    - Correr 3 queries de verificacion (2 guards + 1 happy path con BEGIN/ROLLBACK)
    - Confirmar al ejecutor "migracion aplicada"

    **Por que esto es bloqueante:**
    Plan 02 va a pushear codigo que invoca `insert_and_deduct_sms_message` desde `src/lib/domain/sms.ts`. Si pusheamos ese codigo SIN haber aplicado la migracion en produccion, Vercel deploya y el primer SMS falla con `ERROR: function insert_and_deduct_sms_message(...) does not exist`. La Regla 5 lo prohibe explicitamente porque ya causo un incidente de 20h de mensajes perdidos en el pasado.
  </what-built>
  <how-to-verify>
    **Paso 1 — Localizar el archivo de migracion:**

    ```bash
    ls -lh supabase/migrations/2026041*_sms_atomic_rpc.sql
    cat supabase/migrations/2026041*_sms_atomic_rpc.sql | wc -l
    ```

    Confirmar: el archivo existe, ~200-280 lineas. Copiar la ruta completa.

    **Paso 2 — Aplicar la migracion en Supabase Dashboard (HUMANO):**

    1. Abrir https://supabase.com/dashboard/project/{PROD_PROJECT_REF}/sql/new
    2. Copiar el CONTENIDO COMPLETO del archivo de migracion (todo)
    3. Pegar en el SQL Editor
    4. Click "Run" (o Ctrl+Enter)
    5. Verificar que el resultado dice "Success. No rows returned" (las 3 CREATE OR REPLACE no devuelven rows)
    6. Si hay error: NO continuar, capturar el mensaje completo, reportar al ejecutor

    **Paso 3 — Verificar que las 3 funciones existen (HUMANO corre en SQL Editor):**

    ```sql
    SELECT
      proname,
      pg_get_function_arguments(oid) AS args,
      pg_get_function_result(oid) AS returns
    FROM pg_proc
    WHERE proname IN ('insert_and_deduct_sms_message', 'deduct_sms_balance', 'backfill_sms_message')
    ORDER BY proname;
    ```

    Expected: 3 rows. Cada una con sus args y returns. Si alguna falta, la migracion fallo silenciosamente — re-aplicar.

    **Paso 4 — Test del guard en `deduct_sms_balance` (D-05) (HUMANO corre en SQL Editor):**

    Necesitas un workspace_id real. Para conseguir uno:
    ```sql
    SELECT workspace_id FROM sms_workspace_config WHERE is_active = true LIMIT 1;
    ```

    Luego:
    ```sql
    SELECT * FROM deduct_sms_balance(
      '<el-workspace-id-de-arriba>'::UUID,
      0::DECIMAL,
      NULL::UUID,
      'test guard'
    );
    ```

    Expected output: ERROR rojo en Supabase con mensaje:
    ```
    Invalid amount: p_amount must be > 0, got 0
    ```

    Si retorna un row con `success=false` en vez de error → el guard NO esta. Re-revisar la migracion.

    **Paso 5 — Test del guard en `insert_and_deduct_sms_message` (D-06) (HUMANO corre en SQL Editor):**

    ```sql
    SELECT * FROM insert_and_deduct_sms_message(
      '<el-mismo-workspace-id>'::UUID,
      'TEST-GUARD-001',
      'Onurix',
      '573000000000',
      'test guard',
      1,
      0::DECIMAL,
      'sql-test',
      NULL, NULL,
      0::DECIMAL,
      'test guard'
    );
    ```

    Expected output: MISMO ERROR:
    ```
    Invalid amount: p_amount must be > 0, got 0
    ```

    Si NO da error → el guard del nuevo RPC no se incluyo. Re-revisar.

    **Paso 6 — Test del happy path con BEGIN/ROLLBACK (no deja basura) (HUMANO corre en SQL Editor):**

    ```sql
    BEGIN;
    SELECT * FROM insert_and_deduct_sms_message(
      '<el-mismo-workspace-id>'::UUID,
      'TEST-HAPPY-001',
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
    -- Expected:
    --   success=true
    --   sms_message_id=<uuid no null>
    --   new_balance=<balance previo - 97>
    --   error_message=NULL
    ROLLBACK;  -- IMPORTANTE: no commitear, es un test
    ```

    Verificar: 1 row con success=true, sms_message_id NO null, new_balance positivo o negativo segun el balance real, error_message NULL.

    Si el ROLLBACK falla (improbable), el row de sms_messages se commitea — borrar manualmente:
    ```sql
    DELETE FROM sms_messages WHERE provider_message_id = 'TEST-HAPPY-001';
    -- y restaurar el balance si es necesario:
    UPDATE sms_workspace_config SET balance_cop = balance_cop + 97 WHERE workspace_id = '<ws-id>';
    DELETE FROM sms_balance_transactions WHERE description = 'test happy path';
    ```

    **Paso 7 — (Opcional) Verificar que `backfill_sms_message` existe pero NO ejecutarlo todavia:**

    ```sql
    SELECT proname FROM pg_proc WHERE proname = 'backfill_sms_message';
    -- Expected: 1 row
    ```

    NO correr `backfill_sms_message` aqui — eso es Plan 04 con dry-run y confirmacion explicita.

    **Paso 8 — Confirmacion final al ejecutor:**

    Escribir literalmente "migracion aplicada" en chat. Esto desbloquea:
    - El push del commit de Plan 01 a `origin main` (opcional pero recomendado)
    - Plan 02 (refactor de domain.ts) que va a invocar `insert_and_deduct_sms_message`

    Si en alguno de los pasos algo fallo:
    - Capturar el mensaje completo
    - NO confirmar — reportar el error al ejecutor con el SQL exacto que fallo
  </how-to-verify>
  <resume-signal>
    Escribe "migracion aplicada" cuando:
    - Las 3 funciones existen en pg_proc
    - El guard de deduct_sms_balance arroja "Invalid amount: p_amount must be > 0, got 0" cuando se llama con 0
    - El guard de insert_and_deduct_sms_message arroja el mismo mensaje cuando se llama con p_amount=0
    - El happy path con BEGIN/ROLLBACK retorna success=true y deja el balance restaurado tras el ROLLBACK

    Si algo falla:
    - "error en migracion: <mensaje completo>" — el agente revisara el SQL y propondra fix
    - "guard no funciona" — el agente revisara que el RAISE EXCEPTION este al inicio del body, antes de cualquier RETURN QUERY
  </resume-signal>
</task>

</tasks>

<verification>
- Archivo `supabase/migrations/2026041{HHMMSS}_sms_atomic_rpc.sql` existe en disco con ~200-280 lineas.
- Contiene exactamente 3 CREATE OR REPLACE FUNCTION + 6 GRANT EXECUTE + 2 RAISE EXCEPTION + 3 FOR UPDATE.
- Commit registrado en git local con mensaje `feat(sms-billing-atomic-rpc-01): ...`.
- Migracion aplicada en produccion via Supabase Dashboard SQL Editor.
- Las 3 funciones existen en `pg_proc` post-apply.
- Guard de `deduct_sms_balance` arroja `RAISE EXCEPTION` con `p_amount=0`.
- Guard de `insert_and_deduct_sms_message` arroja `RAISE EXCEPTION` con `p_amount=0`.
- Happy path retorna `success=true` con `sms_message_id` no null y decrementa `new_balance` por 97.
- Humano confirmo "migracion aplicada".
</verification>

<success_criteria>
- Defect C (RPC sin guard) resuelto en `deduct_sms_balance` y prevenido en `insert_and_deduct_sms_message`.
- Infraestructura SQL para Defect B (no atomicidad) lista — Plan 02 puede ahora invocar `insert_and_deduct_sms_message` con confianza.
- Infraestructura SQL para backfill (Plan 04) lista — `backfill_sms_message` esta deployed.
- Regla 5 cumplida: ningun codigo se pushea hasta que el humano aplique la migracion explicitamente.
</success_criteria>

<output>
After completion, create `.planning/standalone/sms-billing-atomic-rpc/01-SUMMARY.md` documenting:
- Nombre exacto del archivo de migracion (con timestamp)
- Hash del commit local (no del remoto si no se pusheo aun)
- Output de los 3 SQL tests del checkpoint:
  - pg_proc query (3 funciones listadas)
  - guard deduct (mensaje de error capturado)
  - guard insert_and_deduct (mensaje de error capturado)
  - happy path (success=true row capturado)
- Decisiones implementadas: D-01, D-02, D-04, D-05, D-06, D-10
- Confirmacion humana "migracion aplicada" + timestamp
- NEXT: Plan 02 puede iniciar (refactor del domain con la nueva RPC)
- Notar: el commit puede pushearse a origin/main ahora (no rompe nada por si solo) o esperar a que Plan 02 lo agrupe en su push (Regla 1)
</output>
</content>
