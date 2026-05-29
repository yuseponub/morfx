---
phase: somnio-v4-turn-ledger
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql
autonomous: false
requirements: [D-13]
must_haves:
  truths:
    - "Existe una migración idempotente que agrega la columna JSONB turn_ledger_dims a session_state"
    - "La migración fue aplicada en producción ANTES de pushear código que la use (Regla 5)"
    - "La migración solo hace ADD COLUMN idempotente — no DROP / ALTER COLUMN / RENAME"
  artifacts:
    - path: "supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql"
      provides: "columna turn_ledger_dims JSONB DEFAULT '{}'"
      contains: "ADD COLUMN turn_ledger_dims"
  key_links:
    - from: "migración"
      to: "session_state"
      via: "ALTER TABLE idempotente patrón 20260316000000"
      pattern: "ALTER TABLE session_state ADD COLUMN turn_ledger_dims"
---

<objective>
Crear y APLICAR EN PRODUCCIÓN la migración que añade la columna JSONB `turn_ledger_dims`
a `session_state`. Es el gate bloqueante de Regla 5: el código que escribe esta columna
(Plan 03) NO se puede pushear hasta que la columna exista en prod.

Purpose: Habilitar la persistencia first-class de las dims del ledger (D-13). Sin esta
columna, `saveState({ turn_ledger_dims })` haría UPDATE a columna inexistente y Supabase
rechazaría con "Failed to update session state" (P1 del research, verificado en
v4-production-runner.ts:362-365), crasheando el turno.
Output: migración aplicada en prod + confirmada por el usuario.

REGLA 5 BLOQUEANTE: este plan PAUSA y espera confirmación humana antes de continuar.
Aunque v4 esté DORMANT (0 sesiones activas escriben la columna), la regla aplica igual.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-turn-ledger/RESEARCH.md
@.planning/standalone/somnio-v4-turn-ledger/01-SUMMARY.md

<interfaces>
<!-- Patrón EXACTO de migración a copiar -->
Migración precedente idéntica en forma: `supabase/migrations/20260316000000_v3_acciones_ejecutadas_column.sql`
→ `ALTER TABLE session_state ADD COLUMN acciones_ejecutadas JSONB DEFAULT '[]'`.

Constraint dura verificada (v4-production-runner.ts:362-365): Supabase rechaza UPDATE a
columna top-level inexistente. Por eso la columna debe existir ANTES del deploy del código.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear migración idempotente turn_ledger_dims</name>
  <files>supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql</files>
  <action>
    Crear el archivo de migración con el patrón idempotente de `20260316000000` (D-13):
    ```sql
    -- v4-turn-ledger (D-13): columna dedicada JSONB para las dims del Turn Ledger.
    -- UNA columna objeto (no N columnas) → cero migraciones futuras para #2/#3 (solo código).
    -- Patrón first-class deliberado (= acciones_ejecutadas, quick-009). v4-only (DORMANT).
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='session_state' AND column_name='turn_ledger_dims'
      ) THEN
        ALTER TABLE session_state ADD COLUMN turn_ledger_dims JSONB DEFAULT '{}';
      END IF;
    END $$;
    ```
    Una sola columna `turn_ledger_dims` objeto que aloja `{ atendido: [], crmActions: [] }`
    (D-13: más barata de evolucionar que columnas separadas — #2/#3 añadirán dims).
    NO incluir DROP / ALTER COLUMN / RENAME (gate Regla 6 §Q-08 #3).
  </action>
  <verify>
    <automated>grep -E "ADD COLUMN turn_ledger_dims JSONB DEFAULT" supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql && ! grep -E "DROP|ALTER COLUMN|RENAME" supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql && echo "migración idempotente OK"</automated>
  </verify>
  <done>Archivo de migración existe, hace ADD COLUMN idempotente, NO contiene DROP/ALTER COLUMN/RENAME.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <what-built>Migración `supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql` que agrega la columna JSONB `turn_ledger_dims DEFAULT '{}'` a `session_state` (idempotente).</what-built>
  <how-to-verify>
    REGLA 5 (BLOQUEANTE — migración antes de deploy). Aplica la migración en producción ANTES de que se pushee cualquier código que use la columna:

    1. Abre el SQL editor de Supabase (proyecto de producción MorfX).
    2. Ejecuta el contenido de `supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql`.
    3. Verifica que la columna existe:
       ```sql
       SELECT column_name, data_type, column_default
       FROM information_schema.columns
       WHERE table_name='session_state' AND column_name='turn_ledger_dims';
       ```
       Esperado: 1 fila, `data_type='jsonb'`, `column_default = '{}'::jsonb`.
    4. Confirma que NO afectó datos existentes (la columna nace con default `{}` en todas las filas).

    Nota: v4 está DORMANT (0 workspaces) → riesgo de aplicar en prod es mínimo, pero la regla aplica igual.
  </how-to-verify>
  <resume-signal>Escribe "migración aplicada" (o reporta el error si falló). NO se continúa al Plan 03 hasta esta confirmación.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| migración → prod schema | cambio de esquema en tabla viva compartida por todos los agentes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mig-01 | Denial (deploy rompe runtime) | código usa columna inexistente | mitigate | Regla 5: checkpoint bloqueante aplica migración ANTES de pushear código (Plan 03) |
| T-mig-02 | Tampering (datos existentes) | ALTER TABLE | accept | Solo ADD COLUMN con default '{}'; idempotente; no toca columnas existentes (gate §Q-08 #3) |
</threat_model>

<verification>
- Archivo de migración existe con ADD COLUMN idempotente.
- `! grep -E "DROP|ALTER COLUMN|RENAME"` → 0 matches.
- Checkpoint humano confirmado: columna existe en prod (`information_schema.columns`).
</verification>

<success_criteria>
Migración creada (idempotente, solo ADD COLUMN) Y aplicada en producción con confirmación
explícita del usuario. Recién entonces el Plan 03 puede pushear el código que escribe la columna.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-turn-ledger/02-SUMMARY.md` (incluir confirmación de aplicación en prod).
Commit atómico en español: `feat(v4-ledger): migración columna turn_ledger_dims en session_state`
(el push del código que la usa ocurre en Plan 03, tras confirmación del usuario).
</output>
