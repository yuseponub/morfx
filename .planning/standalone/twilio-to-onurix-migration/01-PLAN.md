---
phase: twilio-to-onurix-migration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/migrate-twilio-automations-to-onurix.mjs
autonomous: false

must_haves:
  truths:
    - "Script scripts/migrate-twilio-automations-to-onurix.mjs exists and supports --apply flag"
    - "Dry-run prints expected diff: 4 automations change type to 'send_sms' (3 from 'send_sms', 1 from 'send_sms_onurix')"
    - "Script only touches workspace Somnio (a3843b3f-c337-4836-92b5-89c58bb98490) and only the 4 whitelisted IDs"
    - "Re-running the script after --apply produces '0 automations will be modified' (idempotent)"
    - "After --apply, SQL verification shows all 4 Somnio automations have actions[i].type='send_sms' uniformly, with zero 'send_sms_onurix' references"
  artifacts:
    - path: "scripts/migrate-twilio-automations-to-onurix.mjs"
      provides: "Idempotent standalone migration script (dry-run default, --apply writes)"
      contains: "TARGET_IDS"
  key_links:
    - from: "scripts/migrate-twilio-automations-to-onurix.mjs"
      to: "automations table (Supabase)"
      via: "createClient(SUPABASE_SERVICE_ROLE_KEY) + .eq('workspace_id', SOMNIO) + .in('id', TARGET_IDS)"
      pattern: "workspace_id.*a3843b3f"
---

<objective>
Fase A — Data migration (sin deploy de código). Crear un script standalone Node.js que migra las 4 automations de workspace Somnio al action type unificado `send_sms`. El script es idempotente (dry-run por defecto, `--apply` escribe). Tras correrlo, Claude asiste al usuario a validar con SQL que las 4 filas quedaron uniformes.

Purpose: Esta es la PRIMERA mitad del cutover de 2 fases (D-01). Normaliza los datos en DB de forma reversible ANTES de tocar código. El código Twilio sigue vivo en producción durante Fase A — las 3 automations "Twilio" siguen enviando SMS vía `executeSendSmsTwilio` hasta que Fase B mergee (ver RESEARCH.md §Pitfall 4 y §Pitfall 5).

Output: Script versionado en git, 4 automations con `actions[i].type='send_sms'` en DB, validación SQL confirmada por humano.

**CRITICAL — Fase A NO es un test de Onurix.** En Fase A el código sigue ejecutando Twilio cuando ve `type='send_sms'`. La validación de "SMS sale por Onurix" es DESPUÉS de Fase B (ver Plan 04). Fase A solo valida el CAMBIO DE DATOS.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/twilio-to-onurix-migration/CONTEXT.md — D-01 (2-fase cutover), D-02 (script .mjs), D-05 (rename), D-07 (4 automations consistentes)
@.planning/standalone/twilio-to-onurix-migration/RESEARCH.md — §Pattern 2 (script template), §Pitfall 4+5 (race y validación ambigua), §Example 1-3 (comandos esperados)
@.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md — P4 (tabla con 4 IDs + workspace Somnio)
@scripts/test-onurix-domain.mjs — script template de referencia (convención del repo)
@CLAUDE.md — Regla 3 (workspace filter obligatorio), Regla 6 (protección agente producción)

<interfaces>
<!-- From scripts/test-onurix-domain.mjs (pattern de referencia) -->
Run convention: `node --env-file=.env.local scripts/<name>.mjs`
Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
Import: `import { createClient } from '@supabase/supabase-js'`
Client init: `createClient(url, serviceKey, { auth: { persistSession: false } })`

<!-- IDs target (from AUDIT-REPORT.md §P4) -->
Workspace Somnio: `a3843b3f-c337-4836-92b5-89c58bb98490`
Target automation IDs:
  - `f77bff5b-eef8-4c12-a5a7-4a4127837575` (GUIA TRANSPORTADORA) — current type: send_sms
  - `24005a44-d97e-406e-bdac-f74dbb2b5786` (Inter) — current type: send_sms
  - `71c4f524-2c8b-4350-a96d-bbc8a258b6ff` (template final ultima) — current type: send_sms
  - `c24cde89-2f91-493c-8d5b-7cd7610490e8` (REPARTO) — current type: send_sms_onurix
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear script standalone de migración (dry-run por defecto + --apply)</name>
  <read_first>
    - scripts/test-onurix-domain.mjs (pattern y env-var wiring de referencia)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Pattern 2 (template del script) y §Example 1-3 (comandos esperados)
    - .planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md §P4 (tabla con los 4 IDs)
    - CLAUDE.md §Regla 3 (workspace filter obligatorio en TODA mutación)
  </read_first>
  <action>
    Crear `scripts/migrate-twilio-automations-to-onurix.mjs`. Copiar el template completo de RESEARCH.md §Pattern 2 (líneas 281-354 de RESEARCH.md) con estos ajustes literales:

    **Cabecera + env validation:**
    ```javascript
    // scripts/migrate-twilio-automations-to-onurix.mjs
    // Run: node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs [--apply]
    // Source: scripts/test-onurix-domain.mjs pattern
    // Dry-run by default. Pass --apply to write changes to Supabase.
    // Idempotent: re-running after --apply leaves state unchanged.

    import { createClient } from '@supabase/supabase-js'

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      process.exit(1)
    }

    const APPLY = process.argv.includes('--apply')
    const WORKSPACE_SOMNIO = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    const TARGET_IDS = [
      'f77bff5b-eef8-4c12-a5a7-4a4127837575',  // GUIA TRANSPORTADORA
      '24005a44-d97e-406e-bdac-f74dbb2b5786',  // Inter
      '71c4f524-2c8b-4350-a96d-bbc8a258b6ff',  // template final ultima
      'c24cde89-2f91-493c-8d5b-7cd7610490e8',  // REPARTO
    ]

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
    ```

    **Cuerpo (tres pasos: read → diff → apply):**

    Paso 1 (read) — SELECT con DOBLE filtro por seguridad (Regla 3):
    ```javascript
    const { data: before, error: readErr } = await supabase
      .from('automations')
      .select('id, name, actions, workspace_id')
      .eq('workspace_id', WORKSPACE_SOMNIO)
      .in('id', TARGET_IDS)

    if (readErr) { console.error('Read error:', readErr); process.exit(1) }
    console.log(`Found ${before.length} automations in Somnio (expected 4)`)
    if (before.length !== 4) {
      console.error(`ABORT: Expected 4 automations, got ${before.length}. Review TARGET_IDS.`)
      process.exit(1)
    }
    ```

    Paso 2 (diff) — mapear cada action[].type; cambiar 'send_sms' o 'send_sms_onurix' → 'send_sms'; detectar rows con diff real:
    ```javascript
    const changes = []
    for (const auto of before) {
      const newActions = auto.actions.map((a) => {
        if (a.type === 'send_sms' || a.type === 'send_sms_onurix') {
          return { ...a, type: 'send_sms' }
        }
        return a
      })
      const changed = JSON.stringify(newActions) !== JSON.stringify(auto.actions)
      if (changed) changes.push({ id: auto.id, name: auto.name, oldActions: auto.actions, newActions })
    }

    console.log(`\nDiff: ${changes.length} automations will be modified.`)
    for (const c of changes) {
      const oldTypes = c.oldActions.map(a => a.type).join(', ')
      const newTypes = c.newActions.map(a => a.type).join(', ')
      console.log(`  ${c.id} (${c.name}): [${oldTypes}] -> [${newTypes}]`)
    }
    ```

    Paso 3 (apply) — solo si flag `--apply`; UPDATE con doble filtro (id + workspace_id):
    ```javascript
    if (!APPLY) {
      console.log('\nDRY RUN -- pass --apply to write changes.')
      process.exit(0)
    }

    for (const c of changes) {
      const { error } = await supabase
        .from('automations')
        .update({ actions: c.newActions })
        .eq('id', c.id)
        .eq('workspace_id', WORKSPACE_SOMNIO)  // Regla 3 -- workspace filter always

      if (error) { console.error(`FAILED ${c.id}:`, error); process.exit(1) }
      console.log(`  ok Updated ${c.id}`)
    }

    console.log('\n[ok] Migration complete. Re-run (without --apply) to verify idempotency (expect "Diff: 0").')
    ```

    Notas explícitas:
    - NO borrar el filtro `.eq('workspace_id', WORKSPACE_SOMNIO)` — aplica Regla 3 aunque los IDs ya sean whitelist.
    - NO usar `await` top-level sin manejo — el script debe existir en `process.exit` paths explícitos.
    - Idempotencia: al re-correr, el map re-ejecuta pero devuelve el mismo objeto → `JSON.stringify` compara iguales → `changes.length === 0`.
    - NO añadir lógica para "reverse migration" — si necesita revert, se crea otro script (out of scope).
  </action>
  <verify>
    <automated>test -f scripts/migrate-twilio-automations-to-onurix.mjs && grep -q "TARGET_IDS" scripts/migrate-twilio-automations-to-onurix.mjs && grep -q "a3843b3f-c337-4836-92b5-89c58bb98490" scripts/migrate-twilio-automations-to-onurix.mjs && grep -q "send_sms_onurix" scripts/migrate-twilio-automations-to-onurix.mjs && grep -q "APPLY" scripts/migrate-twilio-automations-to-onurix.mjs</automated>
    <automated>node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs 2>&1 | tee /tmp/migrate-dryrun.log; grep -q "Found 4 automations in Somnio" /tmp/migrate-dryrun.log && grep -q "Diff: 4 automations will be modified" /tmp/migrate-dryrun.log && grep -q "DRY RUN" /tmp/migrate-dryrun.log</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/migrate-twilio-automations-to-onurix.mjs` existe
    - Contiene literal: constante `TARGET_IDS` con los 4 UUIDs exactos del AUDIT-REPORT
    - Contiene literal: constante `WORKSPACE_SOMNIO = 'a3843b3f-c337-4836-92b5-89c58bb98490'`
    - Contiene literal: check `process.argv.includes('--apply')` (flag APPLY)
    - Dry-run (sin `--apply`) imprime "Found 4 automations in Somnio" Y "Diff: 4 automations will be modified" Y "DRY RUN -- pass --apply to write changes"
    - Dry-run muestra las 4 IDs con transformación esperada: 3 mapean `[send_sms] -> [send_sms]` (mismo string pero entran al branch de rename, idempotente); 1 (REPARTO) mapea `[send_sms_onurix] -> [send_sms]`
    - Dry-run sale con exit code 0
    - NO escribe a la DB en dry-run (verificable porque re-ejecución del dry-run vuelve a mostrar el mismo diff de 4)
  </acceptance_criteria>
  <done>
    - Script creado, commiteado como `chore(twilio-migration): add standalone migration script for automations`
    - Dry-run ejecutado exitosamente por el ejecutor y diff capturado en logs
    - NO se ha corrido `--apply` todavía (eso pasa en Task 2 bajo checkpoint humano)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint — Revisar diff dry-run, correr --apply, validar idempotencia + SQL</name>
  <read_first>
    - /tmp/migrate-dryrun.log (output del dry-run capturado en Task 1)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Example 3 (SQL verification post-Fase A) y §Pitfall 5 (qué NO validar en esta fase)
  </read_first>
  <what-built>
    El script `scripts/migrate-twilio-automations-to-onurix.mjs` con dry-run verificado. Falta:
    1. Que el humano revise el diff del dry-run línea por línea.
    2. Correr `--apply` para persistir los cambios en DB.
    3. Re-correr (sin `--apply`) para confirmar idempotencia (0 changes).
    4. Validar vía SQL en Supabase que las 4 automations quedaron con `type='send_sms'` uniformemente.

    **IMPORTANTE:** Tras este checkpoint, el código Twilio sigue vivo en producción. Las 3 automations que antes decían "send_sms Twilio" AHORA dicen "send_sms" pero el executor (aún con código viejo desplegado) sigue ejecutando `executeSendSmsTwilio`. Esto es CORRECTO — el plan contempla la Fase B (plans 02/03/04) para cambiar el código. **NO dispares triggers de prueba esperando ver `provider='onurix'` — eso viene después.**
  </what-built>
  <how-to-verify>
    **Paso 1 — Revisar el diff del dry-run (ejecutor captura output, humano aprueba):**

    El dry-run de Task 1 debió imprimir exactamente 4 líneas de diff, por ejemplo:
    ```
    Found 4 automations in Somnio (expected 4)

    Diff: 4 automations will be modified.
      f77bff5b-eef8-4c12-a5a7-4a4127837575 (GUIA TRANSPORTADORA): [send_sms] -> [send_sms]
      24005a44-d97e-406e-bdac-f74dbb2b5786 (Inter): [send_sms] -> [send_sms]
      71c4f524-2c8b-4350-a96d-bbc8a258b6ff (template final ultima): [send_sms] -> [send_sms]
      c24cde89-2f91-493c-8d5b-7cd7610490e8 (REPARTO): [send_sms_onurix] -> [send_sms]

    DRY RUN -- pass --apply to write changes.
    ```
    Confirma visualmente:
    - [ ] Exactamente 4 filas, con los 4 IDs esperados (copiables del CONTEXT.md).
    - [ ] REPARTO es la única con cambio semántico (`send_sms_onurix` → `send_sms`); las otras 3 entran al map pero resultan idénticas a nivel string (la idempotencia del rename).
    - [ ] NO aparecen IDs fuera de la whitelist.
    - [ ] NO aparece ningún workspace distinto a Somnio.

    **Paso 2 — Ejecutar --apply (desde la raíz del repo):**
    ```bash
    node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs --apply
    ```
    Expected output incluye:
    ```
      ok Updated f77bff5b-...
      ok Updated 24005a44-...
      ok Updated 71c4f524-...
      ok Updated c24cde89-...

    [ok] Migration complete. Re-run (without --apply) to verify idempotency (expect "Diff: 0").
    ```
    Sale exit code 0.

    **Paso 3 — Verificar idempotencia:**
    ```bash
    node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs
    ```
    Expected: `Diff: 0 automations will be modified.` + `DRY RUN -- pass --apply to write changes.` + exit 0.

    **Paso 4 — Verificar en Supabase SQL Editor (source of truth):**
    Corre esta query en Supabase SQL Editor del proyecto de producción:
    ```sql
    SELECT
      id,
      name,
      (SELECT array_agg(DISTINCT a->>'type') FROM jsonb_array_elements(actions) a) AS action_types
    FROM automations
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND id IN (
        'f77bff5b-eef8-4c12-a5a7-4a4127837575',
        '24005a44-d97e-406e-bdac-f74dbb2b5786',
        '71c4f524-2c8b-4350-a96d-bbc8a258b6ff',
        'c24cde89-2f91-493c-8d5b-7cd7610490e8'
      );
    ```
    Expected: 4 filas. Ninguna fila debe contener `send_sms_onurix` dentro de su array `action_types` (p. ej. `{send_sms}` o `{send_sms,send_whatsapp}` son válidos; `{send_sms_onurix}` o `{send_sms,send_sms_onurix}` NO). Contra-query (abajo) debe devolver residual = 0.

    Y contra-query (debe devolver 0):
    ```sql
    SELECT COUNT(*) AS residual
    FROM automations
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND actions::text LIKE '%send_sms_onurix%';
    ```
    Expected: `residual = 0`.

    **Paso 5 — Commit (opcional — el script ya está commiteado en Task 1; aquí solo se registró su ejecución).**

    NO requiere nuevo commit; los cambios en DB no son parte del repositorio git.
  </how-to-verify>
  <acceptance_criteria>
    - Dry-run diff revisado por humano, 4 filas confirmadas, 0 IDs spurios.
    - `--apply` ejecutado, exit code 0, log muestra 4 rows actualizadas.
    - Re-run sin `--apply` imprime "Diff: 0 automations will be modified" (idempotencia demostrada).
    - SQL query en Supabase confirma: 4 automations tienen `send_sms` en `action_types`; contra-query (`send_sms_onurix`) devuelve `residual = 0`.
    - Humano aprueba continuar a Fase B (plans 02-04).
  </acceptance_criteria>
  <resume-signal>
    Escribe "aprobado fase A" (SQL verificado, 0 residuals) o describe el problema si el diff/SQL no cuadra.
    Si hay discrepancia (p. ej. aparece un 5to ID o un workspace distinto), PARAR y no avanzar a Plan 02 — requiere ajuste de TARGET_IDS.
  </resume-signal>
</task>

</tasks>

<verification>
- Script `scripts/migrate-twilio-automations-to-onurix.mjs` existe y está commiteado.
- Dry-run produce exactamente 4 rows diff en Somnio.
- Apply actualiza 4 rows sin errores.
- Re-run sin --apply confirma idempotencia (0 changes).
- SQL en Supabase confirma cero `send_sms_onurix` residuals post-apply en workspace Somnio.
- Humano aprobó explícitamente el pase a Fase B.
</verification>

<success_criteria>
- 4 automations en DB tienen `actions[i].type = 'send_sms'` (la única `send_sms_onurix` que existía — REPARTO — fue renombrada).
- Cero `send_sms_onurix` residuals en workspace Somnio.
- Script versionado en git (reversible vía revert si fuese necesario).
- Checkpoint humano cerrado con "aprobado fase A".
- Estado de producción: código Twilio sigue activo (no rompe), datos están normalizados.
</success_criteria>

<output>
After completion, create `.planning/standalone/twilio-to-onurix-migration/01-SUMMARY.md` documenting:
- Ruta del script creado
- Output capturado del dry-run (4 rows listadas)
- Confirmación de apply + idempotencia
- Resultado de la query SQL de verificación
- Timestamp del checkpoint humano
- Advertencia explícita: "Fase B aún NO desplegada; producción sigue enviando por Twilio hasta merge del Plan 04."
</output>
