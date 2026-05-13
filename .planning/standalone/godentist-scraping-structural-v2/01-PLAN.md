---
phase: godentist-scraping-structural-v2
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql
autonomous: false
requirements:
  - D-08
  - D-15

must_haves:
  truths:
    - "Existe un archivo de migración SQL bajo supabase/migrations/ con timestamp 20260513120000 que agrega 3 columnas a godentist_scrape_history: inconsistent BOOLEAN, inconsistency_details JSONB, total_citas INTEGER"
    - "El archivo incluye un índice parcial sobre (workspace_id, created_at DESC) WHERE inconsistent = true"
    - "Todas las sentencias usan IF NOT EXISTS para idempotencia"
    - "El usuario confirma explícitamente haber aplicado la migración a producción ANTES de cualquier código push que referencie las nuevas columnas (REGLA 5 BLOQUEANTE)"
  artifacts:
    - path: "supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql"
      provides: "Schema delta para canary cross-sede (D-08) + audit total_citas"
      contains:
        - "ADD COLUMN IF NOT EXISTS inconsistent BOOLEAN"
        - "ADD COLUMN IF NOT EXISTS inconsistency_details JSONB"
        - "ADD COLUMN IF NOT EXISTS total_citas INTEGER"
        - "idx_godentist_history_inconsistent"
        - "WHERE inconsistent = true"
  key_links:
    - from: "supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql"
      to: "godentist_scrape_history (tabla productiva)"
      via: "ALTER TABLE + CREATE INDEX (manual apply by user per REGLA 5)"
      pattern: "ALTER TABLE godentist_scrape_history ADD COLUMN"
---

<objective>
Crear el archivo SQL de migración que agrega las 3 columnas requeridas por D-08 (`inconsistent` + `inconsistency_details`) + D-15 audit (`total_citas`) a `godentist_scrape_history`, y BLOQUEAR el flujo hasta que el usuario confirme explícitamente haber aplicado la migración a producción.

Purpose: Este es el primer plan porque toda la cadena posterior (server-action Plan 06, UI Plan 09, Inngest Plan 07) referencia estas columnas. CLAUDE.md REGLA 5 mandata que la migración esté aplicada a prod ANTES de pushear cualquier código que las referencie. El incidente histórico de "20h de mensajes perdidos" (citado en REGLA 5) fue causado exactamente por este patrón violado.

Output: 1 archivo SQL nuevo + confirmación verbal del usuario que la migración corre en prod. No hay código TS ni push a Vercel en este plan.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-structural-v2/CONTEXT.md
@.planning/standalone/godentist-scraping-structural-v2/RESEARCH.md
@.planning/standalone/godentist-scraping-structural-v2/PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Analog migration to reference for format/style (existing in repo) -->

From supabase/migrations/20260311100000_godentist_scrape_history.sql (original table — for reference of column types):
```sql
-- godentist_scrape_history defines workspace_id UUID NOT NULL,
-- scraped_date DATE, sucursales TEXT[], appointments JSONB,
-- total_appointments INTEGER, created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
```

From supabase/migrations/20260312100000_godentist_scheduled_reminders.sql (timestamp convention + partial index analog):
```sql
created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())

CREATE INDEX IF NOT EXISTS idx_godentist_reminders_pending
  ON godentist_scheduled_reminders(scheduled_at)
  WHERE status = 'pending';
```

CLAUDE.md REGLA 5 verbatim:
> TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa.
> 1. Crear archivo de migracion en `supabase/migrations/`
> 2. **PAUSAR** -- pedir al usuario que aplique la migracion en produccion
> 3. **ESPERAR** confirmacion explicita del usuario
> 4. Solo entonces pushear el codigo que depende del nuevo schema
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear archivo SQL de migración con las 3 columnas + índice parcial</name>

  <read_first>
    - supabase/migrations/20260311100000_godentist_scrape_history.sql (estructura original de la tabla — para confirmar column names y types)
    - supabase/migrations/20260312100000_godentist_scheduled_reminders.sql (analog para partial index pattern + timestamp default)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §8 DB migration (snippet completo a copiar)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-08 (qué columnas y por qué)
    - CLAUDE.md REGLA 5 (manual apply BEFORE code push)
  </read_first>

  <files>supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql</files>

  <action>
Crear el archivo `supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` con el siguiente contenido EXACTO:

```sql
-- godentist-scraping-structural-v2: D-08 cross-sede canary columns + D-15 audit total_citas
--
-- Per CONTEXT.md D-08: scrapeAppointments (server-action) detecta cuando un (phone, fecha)
-- aparece en >1 sede dentro del mismo scrape — esto significa que el paradigma F tiene
-- una grieta (D-07 invariante violado). El scrape se persiste con flag inconsistent=true,
-- los flujos downstream (sendConfirmations + scheduleReminders) abortan, y se emite un
-- Inngest event 'godentist/scrape.inconsistent' que loguea el incidente para alertar al
-- developer (NO al operador — D-08 mandato).
--
-- Per CONTEXT.md D-15 / RESEARCH.md Wave 0: total_citas adicional para audit comparativo
-- con el toolbar "Total de citas: N" del portal Dentos (sanity check post-scrape).
--
-- Per CLAUDE.md REGLA 5: este archivo DEBE aplicarse a producción ANTES de pushear
-- código que referencia las nuevas columnas. El standalone tiene un paso BLOQUEANTE
-- manual que pausa hasta confirmación explícita del usuario.

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS inconsistent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS inconsistency_details JSONB DEFAULT NULL;

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS total_citas INTEGER DEFAULT NULL;

-- Index parcial para D-08 list view (find recent inconsistent scrapes per workspace).
-- Patrón replicado de 20260312100000_godentist_scheduled_reminders.sql line 26-27
-- (`WHERE status = 'pending'`). Inconsistent scrapes son raros en prod → full index
-- desperdiciaría espacio.
CREATE INDEX IF NOT EXISTS idx_godentist_history_inconsistent
  ON godentist_scrape_history(workspace_id, created_at DESC)
  WHERE inconsistent = true;

COMMENT ON COLUMN godentist_scrape_history.inconsistent IS
  'D-08 cross-sede canary flag. true cuando scrapeAppointments detectó (phone, fecha) en >1 sede. Bloquea sendConfirmations/scheduleReminders.';

COMMENT ON COLUMN godentist_scrape_history.inconsistency_details IS
  'D-08 forensics JSONB: { crossSedePhones: [{ phone, sedes: [] }], detectedAt: ISO, totalAppointments }';

COMMENT ON COLUMN godentist_scrape_history.total_citas IS
  'D-15 audit: total citas parseado del toolbar Dentos "Total de citas: N" (sanity vs total_appointments).';
```

**Verificación post-write:**
- Filename DEBE ser exactamente `20260513120000_godentist_scrape_inconsistent_flag.sql` (timestamp en formato YYYYMMDDHHMMSS).
- Path DEBE ser `supabase/migrations/` (no subdirectorio).
- NO commit aún — el commit se hace en el último plan junto con todo el cambio. O bien staged en este plan pero sin push.

**Style verbatim:**
- Indent 2 espacios para sentencias SQL multi-línea (consistente con migration analog).
- Punto y coma final obligatorio en SQL (a diferencia de TS).
- Comentarios `--` en español (consistente con resto del repo).
  </action>

  <verify>
    <automated>test -f supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql && grep -q "ADD COLUMN IF NOT EXISTS inconsistent BOOLEAN NOT NULL DEFAULT false" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql && grep -q "ADD COLUMN IF NOT EXISTS inconsistency_details JSONB" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql && grep -q "ADD COLUMN IF NOT EXISTS total_citas INTEGER" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql && grep -q "idx_godentist_history_inconsistent" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql && grep -q "WHERE inconsistent = true" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql && echo PASS</automated>
  </verify>

  <acceptance_criteria>
    - El archivo `supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` existe.
    - `grep -c "ADD COLUMN IF NOT EXISTS" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` retorna exactamente `3` (las 3 columnas: inconsistent, inconsistency_details, total_citas).
    - `grep -c "CREATE INDEX IF NOT EXISTS idx_godentist_history_inconsistent" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` retorna `1`.
    - `grep -c "WHERE inconsistent = true" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` retorna `1` (partial index predicate).
    - `grep -c "COMMENT ON COLUMN godentist_scrape_history" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` retorna `3`.
    - Filename matches regex `^20260513120000_godentist_scrape_inconsistent_flag\.sql$` (verificable con `ls supabase/migrations/ | grep -c "^20260513120000_godentist_scrape_inconsistent_flag\.sql$"` retorna `1`).
  </acceptance_criteria>

  <done>
    Archivo SQL creado con las 3 columnas IF NOT EXISTS + índice parcial + 3 COMMENTs. Style verbatim del repo (indent 2, comentarios en español). NO se commitea ni pushea — el commit unificado del standalone se hace al final.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: BLOQUEANTE — Pausar y pedir al usuario que aplique la migración a producción (REGLA 5)</name>

  <what-built>
    El archivo SQL de migración creado en Task 1 contiene 3 ALTER TABLE + 1 CREATE INDEX + 3 COMMENT. El contenido debe correrse contra la base de datos productiva ANTES de pushear cualquier código TS que referencie las nuevas columnas (Plan 06 server-action lee `inconsistent`; Plan 09 UI lee `inconsistent` + `inconsistency_details`).
  </what-built>

  <how-to-verify>
    **Acción requerida al USUARIO (humana — no automatizable per REGLA 5):**

    1. Abrir Supabase Dashboard de producción (proyecto morfx prod): https://supabase.com/dashboard/project/{PROJECT_ID}/sql
    2. Copiar el contenido completo del archivo `supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` al SQL Editor.
    3. Ejecutar (botón "Run") — debe completarse sin errores.
    4. Verificar que las columnas existen ejecutando este SELECT en el mismo SQL Editor:

       ```sql
       SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'godentist_scrape_history'
         AND column_name IN ('inconsistent', 'inconsistency_details', 'total_citas')
       ORDER BY column_name;
       ```

       Esperado: 3 filas, todas con la columna correcta:
       - `inconsistency_details | jsonb     | YES | NULL`
       - `inconsistent          | boolean   | NO  | false`
       - `total_citas           | integer   | YES | NULL`

    5. Verificar que el índice existe:

       ```sql
       SELECT indexname FROM pg_indexes
       WHERE tablename = 'godentist_scrape_history' AND indexname = 'idx_godentist_history_inconsistent';
       ```

       Esperado: 1 fila con `idx_godentist_history_inconsistent`.

    6. Responder en el chat con uno de:
       - **"OK migración aplicada"** → continuar con Plan 02.
       - **"Error: <descripción>"** → detener y debuggear antes de continuar.
       - **"No puedo aplicar ahora"** → detener el standalone hasta que se aplique.

    **CRÍTICO:** Sin esta confirmación verbal, los Plans 06+ NO pueden pushearse porque referencian columnas que no existen en prod — repetiría el incidente histórico de 20h de mensajes perdidos citado en CLAUDE.md REGLA 5.
  </how-to-verify>

  <resume-signal>Type "OK migración aplicada" para continuar al Plan 02. Cualquier otra respuesta requiere debugging antes de continuar.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Filesystem ↔ git | Archivo SQL nuevo bajo `supabase/migrations/` — committed con resto del standalone al final. |
| Developer ↔ Supabase prod | Aplicación manual del SQL via Dashboard (autenticada con cuenta del usuario). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-01-01 | Tampering | Archivo SQL bajo control de versiones | accept | Git history + branch protection ya garantizan trazabilidad. Sin nueva superficie. |
| T-v2-01-02 | Denial of service | `ADD COLUMN BOOLEAN NOT NULL DEFAULT false` en tabla grande | mitigate | Postgres bool DEFAULT false con NOT NULL no triggerea rewrite full-table en PG 11+ (default es metadata). `godentist_scrape_history` es tabla pequeña (<10K rows). Riesgo bajo. **Mitigación:** si la tabla creciera en el futuro, ejecutar `ALTER TABLE ... ALTER COLUMN inconsistent SET DEFAULT false` antes que `ADD COLUMN` para minimizar lock time. |
| T-v2-01-03 | Information disclosure | `inconsistency_details JSONB` puede almacenar phones de pacientes | mitigate | Acceso a `godentist_scrape_history` requiere `createAdminClient` (service role) — RLS bypass. El payload del JSONB sigue la convención del repo (ya `send_results` JSONB tiene la misma shape). Sin nueva superficie de exposición. |
| T-v2-01-04 | Elevation of privilege | Aplicación manual via Dashboard | accept | Operación realizada por el dueño del proyecto (usuario). Postgres roles + Supabase Dashboard auth ya gateuean. |
</threat_model>

<verification>
- Filename matches regex `^supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag\.sql$`.
- `grep -c "ADD COLUMN IF NOT EXISTS" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` = 3.
- `grep -c "WHERE inconsistent = true" supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` = 1.
- Usuario confirma "OK migración aplicada" verbalmente en chat.
- En prod: `SELECT count(*) FROM information_schema.columns WHERE table_name='godentist_scrape_history' AND column_name IN ('inconsistent','inconsistency_details','total_citas')` = 3.
</verification>

<success_criteria>
- [ ] Archivo SQL creado con timestamp 20260513120000.
- [ ] Las 3 columnas + índice parcial + 3 COMMENTs presentes en el archivo.
- [ ] Usuario aplicó la migración a producción.
- [ ] Usuario confirmó verbalmente "OK migración aplicada".
- [ ] El standalone puede continuar con Plan 02.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/01-SUMMARY.md` con:
- Path absoluto del archivo SQL creado.
- Texto verbatim del SELECT que el usuario corrió para verificar.
- Hora/fecha de confirmación del usuario.
- Nota: "Plans 06, 07, 09 son ahora seguros para pushear código que referencie inconsistent/inconsistency_details/total_citas."
</output>
</content>
</invoke>