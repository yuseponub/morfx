---
phase: godentist-scraping-structural-v2
plan: 02
type: execute
wave: 0
depends_on: [01]
files_modified:
  - supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql
autonomous: false
requirements:
  - D-10

must_haves:
  truths:
    - "Existe un archivo SQL bajo supabase/migrations/ con timestamp 20260513120100 que inserta la fila platform_config con key='use_new_godentist_scraping' y value=true"
    - "La sentencia usa ON CONFLICT (key) DO UPDATE para ser idempotente (rerun-safe)"
    - "El usuario confirma haber aplicado la migración (fila visible en SELECT desde Dashboard)"
    - "Después de aplicar, getPlatformConfig<boolean>('use_new_godentist_scraping', true) retornaría true sin caer al fallback"
    - "El comentario del SQL documenta la semántica kill-switch (Issue 3 fix Option A): flag=false ABORTA nuevos scrapes con error explícito; NO fallback a paradigma A. Rollback REAL = git revert + redeploy."
  artifacts:
    - path: "supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql"
      provides: "Fila platform_config para feature flag D-10 (default ON, kill-switch semantics)"
      contains:
        - "INSERT INTO platform_config"
        - "use_new_godentist_scraping"
        - "ON CONFLICT (key) DO UPDATE"
        - "Setting to false aborts new scrapes"
        - "git revert"
  key_links:
    - from: "supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql"
      to: "platform_config tabla (consumida por src/lib/domain/platform-config.ts → src/app/actions/godentist.ts Plan 06)"
      via: "INSERT ... ON CONFLICT"
      pattern: "INSERT INTO platform_config.*use_new_godentist_scraping"
---

<objective>
Crear el archivo SQL de migración que inserta la fila `platform_config` con `key='use_new_godentist_scraping'` y `value=true` (D-10 default ON, kill-switch semantics per Issue 3 fix Option A). El helper `getPlatformConfig` ya tiene fallback=true en el código (Plan 06), pero persistir la fila explícitamente en prod permite:

1. **Rollback SOFT en caliente vía SQL** (bloquea nuevos scrapes con error explícito): `UPDATE platform_config SET value='false' WHERE key='use_new_godentist_scraping'` — toma efecto dentro de los 30s del cache TTL del helper. **NO** rutea a paradigma A (Plan 05 lo borró del adapter). **NO** fetchea endpoint legacy (no existe). Simplemente aborta nuevos scrapes con error explícito hasta que se decida el path de rollback REAL.
2. **Rollback REAL a paradigma A:** `git revert HEAD del commit del standalone + git push origin main`. Vercel + Railway redeployan; paradigma A vuelve a main. La fila platform_config sigue persistida (no se borra) — el operador la puede flipear back a true después del revert.
3. **Visibilidad operacional:** la fila aparece en el dashboard del usuario y deja constancia que el flag existe.
4. **Defensa contra fallback divergence:** si en el futuro alguien cambia el fallback en código, la fila persistida sigue siendo source of truth.

Purpose: D-10 mandata "default ON" + rollback rápido. Este plan persiste la fila; Plan 06 lee con `getPlatformConfig<boolean>('use_new_godentist_scraping', true)` Y aplica semántica kill-switch (Issue 3 fix Option A).

Output: 1 archivo SQL nuevo + confirmación del usuario que la fila existe.
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
<!-- Existing platform_config schema (from 20260420000443_platform_config.sql) -->

```sql
CREATE TABLE platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- value is JSONB → boolean stored as `'true'::jsonb` or `'false'::jsonb`
```

<!-- Helper signature (src/lib/domain/platform-config.ts §96-134) -->

```typescript
export async function getPlatformConfig<T = unknown>(
  key: string,
  fallback: T,  // CRITICAL: D-10 mandates fallback=true for use_new_godentist_scraping
): Promise<T>
```

Cache TTL = 30s (per platform-config.ts comments). Rollback SOFT flow (Issue 3 fix Option A):
1. SQL: `UPDATE platform_config SET value = 'false'::jsonb WHERE key = 'use_new_godentist_scraping'`
2. Within ≤30s, all lambdas read the new value (no redeploy needed)
3. server-action `scrapeAppointments` aborta con error explícito ANTES del fetch al robot (no falla silenciosamente con 404 a endpoint inexistente)
4. Operador decide: hotfix paradigma F (re-flipear a true cuando esté listo) o rollback REAL (git revert)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear archivo SQL de migración con INSERT idempotente para use_new_godentist_scraping</name>

  <read_first>
    - supabase/migrations/20260420000443_platform_config.sql (estructura de la tabla + INSERT analog en líneas 14-18)
    - src/lib/domain/platform-config.ts (helper que consumirá la fila — confirmar tipos JSONB ↔ boolean)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-10 (default ON + rollback flow)
  </read_first>

  <files>supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql</files>

  <action>
Crear el archivo `supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` con el siguiente contenido EXACTO:

```sql
-- godentist-scraping-structural-v2: D-10 feature flag default ON (kill-switch semantics)
--
-- Per CONTEXT.md D-10: el paradigma F nuevo está activo por default desde el merge a main.
-- El flag existe como kill-switch para bloquear nuevos scrapes si el rediseño tiene su
-- propia falla en producción.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- IMPORTANT — FLAG SEMANTICS (Issue 3 fix Option A, revision iteration 1):
--
--   Setting to false aborts new scrapes with an explicit error — does NOT fall
--   back to paradigm A. Paradigm A was REMOVED from the robot adapter in Plan 05
--   of this same standalone (godentist-scraping-structural-v2). The endpoint
--   /api/scrape-appointments-legacy DOES NOT EXIST in server.ts post-Plan 05.
--
--   To revive paradigm A:
--     1. `git revert <HEAD del commit del standalone>` en main del repo morfx.
--     2. `git push origin main` — Vercel + Railway redeployan a paradigma A.
--     3. La fila de este flag NO se borra; el operador puede flipearla back a true
--        después del revert si quiere reactivar paradigma F (no aplicable aquí ya
--        que el revert reactivaría el "old behavior" — pero el statement queda
--        para futuros estándalones que reusen este patrón).
--
--   Rollback SOFT (mientras se diagnostica un bug nuevo de paradigma F):
--     UPDATE platform_config
--        SET value = 'false'::jsonb
--      WHERE key = 'use_new_godentist_scraping';
--
--   Toma efecto en ≤30s (cache TTL del helper getPlatformConfig). El server-action
--   scrapeAppointments retornará el error:
--     "Feature flag use_new_godentist_scraping=false. Paradigm A removed in
--      standalone godentist-scraping-structural-v2. To rollback to paradigm A,
--      git revert the standalone + redeploy."
-- ──────────────────────────────────────────────────────────────────────────────
--
-- Per CONTEXT.md DISC-01: nombre del flag es prerrogativa del planner. Se mantiene el
-- nombre sugerido `use_new_godentist_scraping` por consistencia con otros flags
-- snake_case del repo (ej. somnio_recompra_crm_reader_enabled).
--
-- Per CLAUDE.md REGLA 5: aplicar a prod ANTES de pushear Plan 06 (server-action que
-- consume el flag via getPlatformConfig). Sin esta fila, getPlatformConfig cae al
-- fallback=true del código — comportamiento equivalente PERO sin visibilidad operacional
-- ni rollback path persistido.

INSERT INTO platform_config (key, value)
VALUES ('use_new_godentist_scraping', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();

COMMENT ON COLUMN platform_config.value IS
  '(unchanged) JSONB primitive or object. For use_new_godentist_scraping: true=paradigm F (D-10 default), false=KILL-SWITCH (aborts new scrapes with explicit error; does NOT fall back to paradigm A — that was removed in Plan 05; rollback to paradigm A requires git revert + redeploy).';
```

**Verificación post-write:**
- Filename DEBE ser exactamente `20260513120100_platform_config_use_new_godentist_scraping.sql`.
- Path DEBE ser `supabase/migrations/` (no subdirectorio).
- NO commit aún — commit unificado al final del standalone.

**Style verbatim:**
- Indent 2 espacios.
- Punto y coma final obligatorio.
- Comentarios `--` en español + sección IMPORTANT in inglés para machine readability.
- `'true'::jsonb` (cast explícito) en vez de `true` plano — JSONB column requiere cast.
  </action>

  <verify>
    <automated>test -f supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && grep -q "INSERT INTO platform_config" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && grep -q "use_new_godentist_scraping" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && grep -q "'true'::jsonb" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && grep -q "ON CONFLICT (key) DO UPDATE" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && grep -q "Setting to false aborts new scrapes" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && grep -q "git revert" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql && echo PASS</automated>
  </verify>

  <acceptance_criteria>
    - El archivo `supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` existe.
    - `grep -c "INSERT INTO platform_config" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna `1`.
    - `grep -c "use_new_godentist_scraping" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna al menos `2` (key literal + en comentarios).
    - `grep -c "'true'::jsonb" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna `1` (cast explícito).
    - `grep -c "ON CONFLICT (key) DO UPDATE" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna `1` (idempotencia).
    - **Issue 3 fix Option A — kill-switch semantics in comment:** `grep -c "Setting to false aborts new scrapes" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna `1`.
    - **Issue 3 fix Option A — git revert path documented:** `grep -c "git revert" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna al menos `2` (cuerpo de comentario + COMMENT ON COLUMN).
  </acceptance_criteria>

  <done>
    Archivo SQL creado con INSERT idempotente y comentario que documenta semántica kill-switch (no fallback a paradigma A). Plan 06 puede leer la fila vía getPlatformConfig. Sin commit todavía.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: BLOQUEANTE — Pausar y pedir al usuario que aplique la migración platform_config a producción</name>

  <what-built>
    Archivo SQL nuevo con INSERT idempotente que persiste el feature flag D-10 en `platform_config`. Sin esta fila, Plan 06 server-action sigue funcionando vía fallback=true en el código, pero pierde:
    1. Visibilidad operacional (no aparece en Dashboard al buscar "feature flags").
    2. Rollback SOFT path persistido (no se puede `UPDATE` lo que no existe).

    NOTA semántica (Issue 3 fix Option A): el flag funciona como **kill-switch**, no como toggle de fallback. Flipear a false NO rutea a paradigma A (que fue borrado en Plan 05); en su lugar, aborta nuevos scrapes con error explícito. Rollback REAL a paradigma A = git revert + redeploy.
  </what-built>

  <how-to-verify>
    **Acción requerida al USUARIO (humana — REGLA 5):**

    1. Abrir Supabase Dashboard de producción → SQL Editor.
    2. Copiar el contenido completo del archivo `supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` al SQL Editor.
    3. Ejecutar — debe completarse sin errores.
    4. Verificar que la fila existe con:

       ```sql
       SELECT key, value, updated_at
       FROM platform_config
       WHERE key = 'use_new_godentist_scraping';
       ```

       Esperado: 1 fila con `key='use_new_godentist_scraping'`, `value=true` (JSONB true).

    5. Responder en el chat con:
       - **"OK platform_config aplicado"** → continuar con Plan 03.
       - **"Error: <descripción>"** → detener y debuggear.

    **NOTA:** Si el usuario quisiera empezar con el flag OFF (bloqueo preventivo de nuevos scrapes mientras hace QA del paradigma F), puede ejecutar `UPDATE platform_config SET value='false'::jsonb WHERE key='use_new_godentist_scraping'` después del INSERT. Decisión del usuario; no bloquea el standalone. Recordar: OFF aborta nuevos scrapes con error explícito (semantica Option A); NO rutea a paradigma A.
  </how-to-verify>

  <resume-signal>Type "OK platform_config aplicado" para continuar al Plan 03.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `platform_config` table ↔ Vercel lambdas | Helper `getPlatformConfig` lee con cache 30s. Cualquier lambda puede leer (RLS bypass via service role). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-02-01 | Tampering | `platform_config.value` JSONB | accept | Tabla `platform_config` solo accesible con service role (per 20260420000443_platform_config.sql §28 comment). Sin nueva superficie de tampering. |
| T-v2-02-02 | Elevation of privilege | Manual SQL en Dashboard | accept | Usuario es dueño del proyecto. Operación documentada (audit trail vía `updated_at`). |
| T-v2-02-03 | Denial of service | Cache TTL 30s | accept | Si alguien hace `UPDATE` malicioso, toma 30s en propagar — ventana corta. La operación es reversible con otro `UPDATE`. |
| T-v2-02-04 | Operational confusion | Operator believes flag OFF reverts to old behavior | mitigate | **Resuelto en Issue 3 fix Option A:** comentario SQL + COMMENT ON COLUMN documentan explícitamente "Setting to false aborts new scrapes — does NOT fall back to paradigm A". Operator playbook claro desde el archivo de migración mismo. |
</threat_model>

<verification>
- `test -f supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` retorna 0.
- `grep -c "ON CONFLICT (key) DO UPDATE" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` = 1.
- `grep -c "Setting to false aborts new scrapes" supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` = 1.
- Usuario confirma "OK platform_config aplicado".
- En prod: `SELECT count(*) FROM platform_config WHERE key='use_new_godentist_scraping' AND value='true'::jsonb` = 1.
</verification>

<success_criteria>
- [ ] Archivo SQL creado con timestamp 20260513120100.
- [ ] INSERT idempotente con ON CONFLICT.
- [ ] Comentario documenta kill-switch semantics (Issue 3 fix Option A): flag OFF aborta nuevos scrapes, NO fallback a paradigma A.
- [ ] Usuario aplicó y confirmó.
- [ ] Fila visible en SELECT verificatorio.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/02-SUMMARY.md` con:
- Path del archivo SQL.
- Output del SELECT verificatorio del usuario.
- Hora/fecha de confirmación.
- Nota: "Plan 06 puede ahora leer el flag vía getPlatformConfig<boolean>('use_new_godentist_scraping', true) con semántica kill-switch (Issue 3 fix Option A): flag OFF = abort con error explícito, NO fetch a endpoint legacy."
</output>
</content>
