---
phase: somnio-recompra-crm-reader
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql
autonomous: false

must_haves:
  truths:
    - "`npm run test` ejecuta `vitest run` sin pedir instalar nada"
    - "vitest + @vitest/ui instalados como devDependencies (lockfile sincronizado via pnpm)"
    - "Archivo de migracion SQL con INSERT del flag `somnio_recompra_crm_reader_enabled=false` creado en supabase/migrations/"
    - "Migracion aplicada en Supabase production ANTES de cualquier push de codigo (Regla 5)"
    - "Query `SELECT value FROM platform_config WHERE key='somnio_recompra_crm_reader_enabled'` devuelve `false` en produccion"
    - "`getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` invocado desde nodo local devuelve `false` (fail-open ya da el mismo valor por seguridad)"
  artifacts:
    - path: "package.json"
      provides: "script `test` + devDep vitest + @vitest/ui"
      contains: "\"test\": \"vitest run\""
    - path: "supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql"
      provides: "Data seed idempotente del feature flag (default false) + GRANTs explicitos a service_role (LEARNING 1 Phase 44.1)"
      contains: "somnio_recompra_crm_reader_enabled"
  key_links:
    - from: "supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql"
      to: "platform_config table (Supabase production)"
      via: "INSERT ... ON CONFLICT DO NOTHING + GRANT ALL TO service_role"
      pattern: "INSERT INTO platform_config.*somnio_recompra_crm_reader_enabled.*false"
---

<objective>
Wave 0 — Test infrastructure + feature flag seed. Habilita `vitest` como test runner (hoy el repo tiene 6+ `.test.ts` sin runner declarado) y crea la migracion de data-seed del flag `somnio_recompra_crm_reader_enabled` con default `false`. La migracion DEBE aplicarse en produccion ANTES de cualquier push de codigo que referencie el flag (Regla 5 + Regla 6 — el feature queda OFF por default hasta activacion manual del usuario).

Purpose: Desbloquear los planes subsecuentes. Plans 02-06 asumen que `npm run test` funciona y que `getPlatformConfig('somnio_recompra_crm_reader_enabled', false)` devuelve el valor real de DB (no solo el fallback). El patron sigue Phase 44.1 LEARNING 1: migration file con GRANTs explicitos para que entornos futuros no reproduzcan el bug de permission denied.

Output: 1 migracion SQL en git, 1 modificacion a `package.json`, flag seed aplicado en produccion.

**CRITICAL — Regla 5:** La migracion aplica ANTES del push de Plan 02+. El Task 2 es checkpoint humano bloqueante — el usuario corre el SQL en Supabase SQL Editor y confirma antes de avanzar.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — constraints Regla 5 + Regla 6 (feature flag default off)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Runtime State Inventory, §Environment Availability, §Pitfall 6 (env var warm-cache), §Pitfall 9 (Regla 6 rollout), §Validation Architecture
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 0 — Test Infrastructure + Feature Flag Seed
@.planning/phases/44.1-crm-bots-config-db/LEARNINGS.md — LEARNING 1 (GRANTs explicitos en migration)
@CLAUDE.md §Regla 5 (migracion antes de deploy), §Regla 6 (proteger agente en produccion)
@src/lib/domain/platform-config.ts — consumer del flag (verificar nombre key exacto)
@package.json — estado actual (no scripts.test, no vitest devDep)

<interfaces>
<!-- From src/lib/domain/platform-config.ts:96-154 (consumer signature) -->
export async function getPlatformConfig<T>(key: string, fallback: T): Promise<T>
// Devuelve fallback si row no existe, value del row si existe.
// Cache TTL 30s per lambda. Fail-open on error → fallback.

<!-- Migration pattern canon (LEARNING 1 Phase 44.1) -->
-- 1. Table create OR data insert (aqui es insert only)
-- 2. GRANT ALL ON TABLE platform_config TO service_role
-- 3. GRANT SELECT ON TABLE platform_config TO authenticated
-- Razon: tablas creadas via Studio NO heredan grants automaticos;
--        aplicar grants en migration garantiza que entornos nuevos (replay)
--        no reproduzcan el bug de permission denied.

<!-- package.json actual (no tiene test script, vitest ausente) -->
// Evidencia: grep-verified en RESEARCH.md §Environment Availability.
// Plans downstream asumen `npm run test` funcional.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar vitest + script `test` a package.json (instalar via pnpm)</name>
  <read_first>
    - package.json (estado actual — confirmar que NO existe script `test` y NO existe devDep `vitest`)
    - pnpm-lock.yaml (confirmar que es la fuente de verdad del lockfile; Phase 44.1 hotfix `2d8fd1c` documento que `npm install` desincroniza el lock y rompe el build en Vercel)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Environment Availability (tabla con `vitest` ausente)
    - .planning/phases/44.1-crm-bots-config-db/LEARNINGS.md (patron pnpm para evitar hotfix)
  </read_first>
  <action>
    Instalar `vitest@^1.6.0` y `@vitest/ui@^1.6.0` como devDependencies usando **pnpm** (NO `npm install` — Phase 44.1 hotfix `2d8fd1c` documento que npm desincroniza `pnpm-lock.yaml` y Vercel rechaza el build con `--frozen-lockfile`):

    ```bash
    pnpm add -D vitest@^1.6.0 @vitest/ui@^1.6.0
    ```

    Agregar el script `test` al bloque `scripts` de `package.json`:

    ```json
    "scripts": {
      ...
      "test": "vitest run"
    }
    ```

    NO crear `vitest.config.ts` — el repo no lo requiere para tests en `src/**/*.test.ts` (vitest autodiscover). Si algun test futuro necesita config custom (path aliases, setup files), se agrega entonces.

    Verificar que el lockfile quedo sincronizado corriendo `pnpm install --frozen-lockfile` (debe salir exit 0, sin mensaje "add"/"remove").

    Smoke test del runner ejecutando un test existente del repo (el primer test disponible, por ejemplo):

    ```bash
    npm run test -- src/lib/agents/somnio/__tests__/block-composer.test.ts
    ```

    (exit 0 esperado — si el test ya existe y compila, vitest lo corre OK).

    NO tocar ningun test existente — los tests de Phase 44 (`src/__tests__/integration/crm-bots/{reader,security}.test.ts`) estan rotos post-Phase 44.1 refactor (deuda tecnica documentada en STATE.md 2026-04-20). Si salen errores de esos archivos, IGNORAR y continuar; esos tests NO son el objetivo de smoke test aqui.
  </action>
  <verify>
    <automated>grep -q "\"test\": \"vitest run\"" package.json</automated>
    <automated>grep -q "\"vitest\":" package.json</automated>
    <automated>pnpm install --frozen-lockfile 2>&1 | tee /tmp/pnpm-lock-check.log; grep -q "Lockfile is up to date" /tmp/pnpm-lock-check.log || ! grep -q "ERR_PNPM_OUTDATED_LOCKFILE" /tmp/pnpm-lock-check.log</automated>
    <automated>npm run test -- src/lib/agents/somnio/__tests__/block-composer.test.ts 2>&1 | tee /tmp/vitest-smoke.log; grep -qE "(PASS|Test Files.*passed)" /tmp/vitest-smoke.log</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` contiene exactamente el literal `"test": "vitest run"` dentro del bloque `scripts`.
    - `package.json` contiene `"vitest": "^1.6.0"` y `"@vitest/ui": "^1.6.0"` en `devDependencies`.
    - `pnpm-lock.yaml` actualizado (NO via npm). `pnpm install --frozen-lockfile` sale exit 0 sin errores de lockfile out-of-sync.
    - `npm run test -- <un-test-que-compila>` ejecuta el runner y reporta PASS (smoke).
    - NO se modifico ningun `.test.ts` existente (0 cambios en archivos de test).
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `chore(somnio-recompra-crm-reader): add vitest + test script to package.json`.
    - Lockfile `pnpm-lock.yaml` commiteado en el mismo commit.
    - NO push a Vercel todavia (se hace al final de todo Wave 0 junto con migracion, tras checkpoint humano).
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear migracion de data-seed del feature flag (default false) + GRANTs</name>
  <read_first>
    - supabase/migrations/ (listar para ver el pattern de naming timestamp + mas reciente migration aplicada)
    - .planning/phases/44.1-crm-bots-config-db/LEARNINGS.md (LEARNING 1 — GRANTs explicitos pattern)
    - src/lib/domain/platform-config.ts:96-154 (consumer — confirmar que lee de tabla `platform_config` con columnas `key` (text PK) y `value` (jsonb))
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Runtime State Inventory, §Pitfall 9 (Regla 6 — flag OFF por default)
  </read_first>
  <action>
    Crear el archivo `supabase/migrations/<timestamp>_seed_recompra_crm_reader_flag.sql` con timestamp de HOY (formato `YYYYMMDDHHMMSS`). Generar el timestamp con `date -u +%Y%m%d%H%M%S` O tomar como referencia la migration mas reciente de 44.1 (`ac4b6b8` commit, ver filename exacto con `ls -t supabase/migrations/ | head -5`) y usar timestamp mayor.

    Contenido **literal** del archivo:

    ```sql
    -- Seed feature flag for somnio-recompra-crm-reader integration phase.
    -- Default: false (Regla 6 — protect production agent until explicit user activation).
    -- Consumer: src/lib/domain/platform-config.ts:96-154 via getPlatformConfig<boolean>(key, false).
    --
    -- Idempotent: re-runs leave state unchanged (ON CONFLICT DO NOTHING).
    -- Activation: UPDATE platform_config SET value='true'::jsonb WHERE key='somnio_recompra_crm_reader_enabled';
    -- Rollback: UPDATE platform_config SET value='false'::jsonb WHERE key='somnio_recompra_crm_reader_enabled';

    INSERT INTO platform_config (key, value)
    VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)
    ON CONFLICT (key) DO NOTHING;

    -- GRANTs explicitos (LEARNING 1 Phase 44.1 — tablas creadas via Studio SQL Editor
    -- NO heredan grants automaticos al service_role, el fail-open de getPlatformConfig
    -- ocultaba el 42501 permission denied haciendo imposible que el flag tomara efecto.
    -- Estas grants son no-ops si ya existen (GRANT es idempotente), pero garantizan
    -- que en replay/nuevo entorno el flag funciona desde el primer momento).
    GRANT ALL ON TABLE platform_config TO service_role;
    GRANT SELECT ON TABLE platform_config TO authenticated;
    ```

    NOTAS CRITICAS:
    - NO cambiar el nombre del key — `somnio_recompra_crm_reader_enabled` es el literal que webhook-processor y el Inngest function leeran en Plans 04 y 03.
    - NO cambiar el valor default — `false` es obligatorio por Regla 6.
    - NO remover las GRANTs — cerraron un bug real en 44.1 Plan 01 Task 9 (debug ciclico de flag no disparando).

    Verificar que el archivo existe y tiene el contenido esperado:

    ```bash
    cat supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql
    ```
  </action>
  <verify>
    <automated>ls supabase/migrations/ | grep -E '^[0-9]{14}_seed_recompra_crm_reader_flag\.sql$' | head -1</automated>
    <automated>MIGRATION_FILE=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_seed_recompra_crm_reader_flag\.sql$' | head -1); grep -q "INSERT INTO platform_config" "supabase/migrations/$MIGRATION_FILE" && grep -q "somnio_recompra_crm_reader_enabled" "supabase/migrations/$MIGRATION_FILE" && grep -q "'false'::jsonb" "supabase/migrations/$MIGRATION_FILE" && grep -q "ON CONFLICT (key) DO NOTHING" "supabase/migrations/$MIGRATION_FILE" && grep -q "GRANT ALL ON TABLE platform_config TO service_role" "supabase/migrations/$MIGRATION_FILE" && grep -q "GRANT SELECT ON TABLE platform_config TO authenticated" "supabase/migrations/$MIGRATION_FILE"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_seed_recompra_crm_reader_flag.sql` existe.
    - Contiene el literal `INSERT INTO platform_config (key, value) VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;`.
    - Contiene ambos GRANTs explicitos (`service_role` ALL + `authenticated` SELECT).
    - Archivo commiteado (preparado para aplicar en Task 3).
    - NO se ejecuto el SQL contra produccion todavia — solo se creo el archivo.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra-crm-reader): seed feature flag somnio_recompra_crm_reader_enabled default false`.
    - Archivo existe en git, listo para que usuario ejecute en Supabase SQL Editor (Task 3).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Checkpoint — Usuario aplica migracion en produccion + valida con SQL</name>
  <read_first>
    - supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql (archivo creado en Task 2)
    - CLAUDE.md §Regla 5 (migracion antes de deploy), §Regla 6 (proteger agente en produccion)
    - .planning/phases/44.1-crm-bots-config-db/LEARNINGS.md (LEARNING 1 — verificar grants post-ejecucion)
  </read_first>
  <what-built>
    Se creo el archivo de migracion con el INSERT del flag `somnio_recompra_crm_reader_enabled=false` + GRANTs explicitos, y se habilito vitest como test runner (Task 1+2 completos). Falta que el usuario:
    1. Abra Supabase SQL Editor del proyecto de produccion.
    2. Copie el contenido del archivo de migracion y lo ejecute.
    3. Valide con queries de verificacion que el flag quedo seeded + las GRANTs aplicadas.
    4. Confirme "migracion aplicada" para desbloquear Plans 02+ (que pushearan codigo que referencia el flag).

    **IMPORTANTE:** El codigo que referencia el flag NO se ha pusheado todavia (ningun `getPlatformConfig('somnio_recompra_crm_reader_enabled', ...)` existe en main). Por eso Regla 5 aplica preventivamente: en cuanto Plan 03 pushee la nueva Inngest function y Plan 04 pushee el dispatch en webhook-processor, esos codigos ya tendran la row de platform_config disponible. Si el usuario olvida aplicar la migracion y pushea primero, nada se rompe (fail-open a `false` = comportamiento idempotente pre-cambio), pero seguimos la regla por higiene.
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar la migracion en Supabase production:**

    1. Abrir https://supabase.com/dashboard → proyecto de produccion de morfx → SQL Editor → New query.
    2. Copiar el contenido del archivo `supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql` (exacto, incluyendo los 3 comandos: INSERT + 2 GRANTs).
    3. Pegar en el SQL Editor, click Run.
    4. Esperado: "Success. No rows returned." (los 3 comandos son idempotentes; si el row ya existe ON CONFLICT DO NOTHING; si los grants ya estan, son no-op).

    **Paso 2 — Validar que el row fue insertado (query de lectura):**

    ```sql
    SELECT key, value, updated_at
    FROM platform_config
    WHERE key = 'somnio_recompra_crm_reader_enabled';
    ```

    Expected output:
    - 1 fila.
    - `key = 'somnio_recompra_crm_reader_enabled'`.
    - `value = false` (jsonb boolean).
    - `updated_at` con timestamp reciente.

    **Paso 3 — Validar GRANTs aplicadas (LEARNING 1 Phase 44.1 — este es el check que fue saltado en 44.1 inicialmente y causo el bug de kill-switch):**

    ```sql
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name = 'platform_config'
      AND grantee IN ('service_role', 'authenticated')
    ORDER BY grantee, privilege_type;
    ```

    Expected:
    - `service_role` debe tener al menos: SELECT, INSERT, UPDATE, DELETE (GRANT ALL).
    - `authenticated` debe tener: SELECT.

    **Paso 4 — Smoke funcional del flag (opcional, recomendado):**

    ```sql
    -- Temporalmente activar el flag para verificar que el UPDATE funciona + luego desactivar.
    UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';
    SELECT value FROM platform_config WHERE key = 'somnio_recompra_crm_reader_enabled';
    -- Expected: true

    UPDATE platform_config SET value = 'false'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';
    SELECT value FROM platform_config WHERE key = 'somnio_recompra_crm_reader_enabled';
    -- Expected: false (vuelto a OFF, estado final de Wave 0)
    ```

    El flag DEBE terminar en `false` al cerrar este checkpoint (Regla 6).

    **Paso 5 — Push a Vercel (opcional en este plan, pero recomendado):**

    Ahora que la migracion esta aplicada, el push de Task 1 (vitest + package.json) es seguro:

    ```bash
    git push origin main
    ```

    Esto deploya el `package.json` actualizado + el archivo de migracion en git. Vercel solo corre `pnpm install` + build — NO aplica migrations automaticamente (Supabase migrations no estan wireadas al deploy en este repo).
  </how-to-verify>
  <acceptance_criteria>
    - Usuario confirma haber ejecutado los 3 comandos (INSERT + 2 GRANTs) exitosamente en Supabase SQL Editor de produccion.
    - Query Paso 2 devuelve exactamente 1 fila con `key='somnio_recompra_crm_reader_enabled'`, `value=false`.
    - Query Paso 3 confirma que `service_role` tiene SELECT/INSERT/UPDATE/DELETE sobre `platform_config` y `authenticated` tiene SELECT.
    - Flag final = `false` (re-confirmado por query post-smoke opcional).
    - Usuario escribe "migracion aplicada" o equivalente para resumir el flujo a Plan 02.
  </acceptance_criteria>
  <resume-signal>
    Escribe "migracion aplicada" (flag=false confirmado + grants OK) o describe el error si el SQL fallo (ej. tabla platform_config no existe — improbable post-44.1).
    Si la row ya existia (ON CONFLICT DO NOTHING silencioso), confirma con la query Paso 2 que el valor es `false` (no lo sobreescribe por diseño, pero debe ser false de antes tambien).
  </resume-signal>
</task>

</tasks>

<verification>
- `package.json` tiene `"test": "vitest run"` + `vitest`/`@vitest/ui` en devDependencies.
- `pnpm-lock.yaml` sincronizado.
- Archivo de migracion existe en `supabase/migrations/` con timestamp reciente.
- Migracion aplicada en produccion — row `somnio_recompra_crm_reader_enabled=false` visible.
- GRANTs aplicadas y verificadas.
- Usuario confirmo "migracion aplicada".
</verification>

<success_criteria>
- `npm run test` es comando funcional en el repo (antes no lo era).
- `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` leera el valor `false` real de DB (no solo fallback) en cualquier lambda de produccion dentro de 30s de aplicada la migracion.
- Regla 6 respetada: feature queda OFF, produccion no afectada en absoluto.
- Plans 02-07 desbloqueados — asumen test runner disponible + flag seeded.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/01-SUMMARY.md` documenting:
- Commit hash del Task 1 (`chore(...): add vitest`)
- Commit hash del Task 2 (`feat(...): seed feature flag`)
- Nombre exacto del archivo de migracion creado (con timestamp)
- Timestamp del checkpoint humano (Task 3) cuando el usuario confirmo
- Output de la query Paso 2 (verificacion) copiado verbatim
- Output de la query Paso 3 (GRANTs) copiado verbatim
- Confirmacion explicita: "flag final = false, Regla 6 respetada"
- Si hubo push a Vercel en este plan: commit range pusheado + URL deploy
</output>
