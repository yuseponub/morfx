---
phase: godentist-blast-sms-experiment
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - .planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql
autonomous: false
requirements:
  - D-09
  - D-13.2
  - D-13.3

must_haves:
  truths:
    - "Existe row en sms_workspace_config con workspace_id=36a74890-aad6-4804-838c-57904b1c9328"
    - "balance_cop = 450000 (suficiente para 4.142 × $97 = $401k + 12% margen)"
    - "is_active = true para workspace GoDentist"
    - "Plan 04 podrá llamar sendSMS exitosamente sin error 'SMS no activado en este workspace'"
  artifacts:
    - path: ".planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql"
      provides: "SQL idempotente que CREA/UPDATEa la fila sms_workspace_config para GoDentist"
      contains: "INSERT INTO sms_workspace_config"
  key_links:
    - from: "sms_workspace_config row GoDentist"
      to: "src/lib/domain/sms.ts:101-127 (balance check + is_active gate)"
      via: "SELECT en sendSMS"
      pattern: "balance_cop"
---

<objective>
Crear la fila `sms_workspace_config` para workspace GoDentist con saldo inicial $450.000 COP y `is_active=true`. Verificado 2026-04-28: GoDentist NO tiene fila (solo Somnio con $17.990). Sin esta fila el `sendSMS` (Plan 04) falla inmediatamente con error "SMS no activado en este workspace. Configure el servicio SMS primero." (sms.ts:107-111).

Purpose: Cumplir D-13.2 (saldo morfx ≥ $428k) + D-13.3 (is_active=true) + D-09 (domain layer billing requiere fila configurada).

Output:
- Archivo `.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql` (idempotente, INSERT...ON CONFLICT)
- Fila aplicada en producción Supabase (manual via SQL editor o psql)
- Verificación post-INSERT de row presente con valores correctos

**Regla 5 (CLAUDE.md): NO aplica** — esto es seed data del workspace, NO un schema migration. La tabla `sms_workspace_config` ya existe en producción (creada en migration `20260316100000_sms_onurix_foundation.sql`). Estamos solo INSERTeando una fila — no hay schema change.

Cumple D-09 (sendSMS requiere fila), D-13.2 (saldo ≥ $428k), D-13.3 (is_active=true).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-blast-sms-experiment/CONTEXT.md
@.planning/standalone/godentist-blast-sms-experiment/RESEARCH.md
@src/lib/domain/sms.ts
@CLAUDE.md
</context>

<interfaces>
<!-- Schema sms_workspace_config (verified RESEARCH.md from migration 20260316100000_sms_onurix_foundation.sql) -->

```sql
CREATE TABLE sms_workspace_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  balance_cop DECIMAL(12,2) NOT NULL DEFAULT 0,
  allow_negative_balance BOOLEAN NOT NULL DEFAULT false,
  total_sms_sent INTEGER NOT NULL DEFAULT 0,
  -- + audit cols
);
```

`sendSMS` reads this row at sms.ts:101-127:
- 107-111: row absent → `success: false, error: 'SMS no activado en este workspace.'`
- 114-115: `is_active=false` → `success: false, error: 'Servicio SMS desactivado para este workspace'`
- 122-126: `balance_cop < SMS_PRICE_COP=$97` → `success: false, error: 'Saldo SMS insuficiente'`
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo SQL idempotente</name>
  <read_first>
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-13.2 saldo $450k)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Pre-flight 2 schema reference)
    - src/lib/domain/sms.ts:101-127 (gates que la fila debe pasar)
  </read_first>
  <files>.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql</files>
  <action>
Crear el archivo `.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql` con:

```sql
-- ============================================================================
-- godentist-blast-sms-experiment / Plan 02
-- Setup balance + activación SMS para workspace GoDentist
--
-- Decisiones de referencia:
--   D-09: sendSMS requiere fila en sms_workspace_config con is_active=true
--   D-13.2: saldo inicial >= $428k (4.142 SMS × $97 + 12% margen = $450k)
--   D-13.3: is_active = true desde el inicio
--
-- Idempotente via ON CONFLICT — re-correr es seguro.
-- NO requiere schema migration (la tabla ya existe en prod desde
-- 20260316100000_sms_onurix_foundation.sql).
-- ============================================================================

-- 1. INSERT con ON CONFLICT — idempotente
INSERT INTO sms_workspace_config (
  workspace_id,
  is_active,
  balance_cop,
  allow_negative_balance,
  total_sms_sent
)
VALUES (
  '36a74890-aad6-4804-838c-57904b1c9328',  -- GoDentist
  true,
  450000.00,
  false,
  0
)
ON CONFLICT (workspace_id) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  balance_cop = GREATEST(sms_workspace_config.balance_cop, EXCLUDED.balance_cop),  -- never reduce existing balance
  allow_negative_balance = EXCLUDED.allow_negative_balance;

-- 2. Verificación post-INSERT (no muta — solo lee)
SELECT
  workspace_id,
  is_active,
  balance_cop,
  allow_negative_balance,
  total_sms_sent,
  created_at,
  updated_at
FROM sms_workspace_config
WHERE workspace_id = '36a74890-aad6-4804-838c-57904b1c9328';
```

Decisiones del SQL:
- **`ON CONFLICT (workspace_id) DO UPDATE`**: idempotencia — si la fila ya existe (ej. alguien la creó manualmente entre planning y execute), no falla.
- **`GREATEST(existing, 450000)`**: si la fila ya existe con saldo > $450k (ej. recarga manual previa), NO baja el saldo. Solo INSERT/upgrade nunca downgrade.
- **`is_active=true` + `allow_negative_balance=false`**: cumple D-13.3 + comportamiento conservador (sin negativo, falla rápido si se agota).
- **SELECT verificación al final**: ejecuta SQL en una sola transacción que produce el row de verificación.

NO modificar `total_sms_sent` post-existente (otra columna conservada).
  </action>
  <verify>
    <automated>test -f .planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql && grep -c "ON CONFLICT" .planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql | xargs test 1 -le && grep -c "36a74890-aad6-4804-838c-57904b1c9328" .planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql | xargs test 2 -le && grep -c "450000" .planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql | xargs test 1 -le</automated>
  </verify>
  <acceptance_criteria>
    - Archivo SQL existe en `.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql`
    - `grep -c "ON CONFLICT" ...` returns ≥ 1 (idempotencia)
    - `grep -c "36a74890-aad6-4804-838c-57904b1c9328" ...` returns ≥ 2 (INSERT + SELECT)
    - `grep -c "450000" ...` returns ≥ 1 (saldo correcto)
    - `grep -c "is_active" ...` returns ≥ 2 (set en INSERT y en ON CONFLICT update)
    - `grep -c "GREATEST" ...` returns ≥ 1 (conservación de saldo existente)
  </acceptance_criteria>
  <done>SQL idempotente listo para aplicar manualmente. NO ejecutado en producción aún.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Aplicar SQL en producción Supabase</name>
  <what-built>
    Archivo `.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql` con INSERT idempotente para GoDentist.
  </what-built>
  <how-to-verify>
**Pasos manuales:**

1. Abrir Supabase Dashboard → SQL Editor del proyecto producción morfx.
2. Copiar el contenido completo de `.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql`.
3. Pegar y ejecutar (Run).
4. **Validar el output del SELECT final:**
   ```
   workspace_id                          | is_active | balance_cop | allow_negative_balance | total_sms_sent
   36a74890-aad6-4804-838c-57904b1c9328  | t         | 450000.00   | f                      | 0
   ```
5. Confirmar:
   - `is_active` == `t` (true)
   - `balance_cop` ≥ 450000.00 (puede ser mayor si pre-existía con más saldo)
   - `allow_negative_balance` == `f` (false)
6. Si algún campo es incorrecto: STOP. Reportar al usuario.

Por qué `human-action` y no `auto`:
- Esta tarea muta producción Supabase.
- No queremos ejecutar SQL contra prod automáticamente desde el script (REGLA 5 spirit — pause antes de cambios persistentes a prod).
- El usuario debe ver el output del SELECT con sus propios ojos.

Razón de no ser un `migration`:
- La tabla `sms_workspace_config` ya existe (migration `20260316100000_sms_onurix_foundation.sql`).
- Esto es seed data de workspace, no DDL change.
- Por eso vive en `.planning/...` y no en `supabase/migrations/`.
  </how-to-verify>
  <resume-signal>Type "applied" después de ejecutar SQL en prod y confirmar que el SELECT devuelve la fila con balance_cop ≥ 450000 e is_active=true. Si falló o el output es inesperado, type "blocked" + describir el problema.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local SQL file → Supabase prod | Humano copia SQL al SQL editor; no automated path |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-blast-02-01 | Tampering | balance_cop downgrade involuntario | mitigate | `GREATEST(existing, 450000)` en ON CONFLICT — nunca baja saldo si pre-existe mayor |
| T-blast-02-02 | Repudiation | quién aplicó el INSERT | accept | Supabase audit log + checkpoint human-action requiere confirmación explícita |
| T-blast-02-03 | Privilege Escalation | INSERT con elevated privs | accept | Solo super-admin tiene SQL editor access; workspace_id está hardcoded |
</threat_model>

<verification>
- Archivo SQL idempotente creado.
- Ejecutado manualmente en prod Supabase.
- SELECT post-INSERT retorna fila con `balance_cop ≥ 450000`, `is_active=true`, `allow_negative_balance=false`.
</verification>

<success_criteria>
- `sms_workspace_config` row existe para workspace GoDentist con `is_active=true`, `balance_cop ≥ 450000`, `allow_negative_balance=false`
- `sendSMS` (en runtime de Plan 04) NO retornará error "SMS no activado" ni "Saldo insuficiente" para los primeros 4.142 SMS
- Confirmación humana registrada en checkpoint resume-signal
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-blast-sms-experiment/02-SUMMARY.md` registrando:
- Hora exacta del INSERT en prod
- Output del SELECT verificación (workspace_id, is_active, balance_cop)
- Si la fila pre-existía con saldo mayor (en cuyo caso GREATEST evitó downgrade)
- Confirmación que sendSMS pasa los 3 gates (config presente, is_active, balance suficiente)
</output>
