---
phase: somnio-recompra-template-catalog
plan: 05
type: execute
wave: 3
depends_on: [04]
files_modified:
  - .claude/rules/agent-scope.md
  - docs/analysis/04-estado-actual-plataforma.md
  - .planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md
  - .planning/debug/resolved/recompra-greeting-bugs.md
autonomous: false

must_haves:
  truths:
    - "Migracion SQL aplicada en Supabase production (Regla 5 — ANTES del push de codigo)"
    - "Query SELECT retorna 4 rows post-migracion bajo agent_id='somnio-recompra-v1': 2 saludo (texto + imagen) + 1 preguntar_direccion_recompra + 1 registro_sanitario"
    - "`git push origin main` ejecutado despues de verificar migracion aplicada"
    - "Vercel deploy OK (build + deploy verde)"
    - "Smoke test end-to-end con contacto Jose Romero (285d6f19-...) confirma: saludo + imagen sin promos; 'sí' dispara preguntar_direccion_recompra; confirmacion dispara promociones; seleccion_pack dispara resumen; confirmar dispara crear_orden"
    - "Debug file `.planning/debug/recompra-greeting-bugs.md` movido a `.planning/debug/resolved/` con status actualizado"
    - "`.claude/rules/agent-scope.md` actualizado con seccion somnio-recompra-v1 (catalogo propio + flujo recompra)"
    - "`docs/analysis/04-estado-actual-plataforma.md` actualizado — deuda 'registro_sanitario gap' eliminada, nota sobre catalogo recompra-v1 independiente"
    - "LEARNINGS.md creado con: patterns aprendidos, Q#2 deuda documentada, commits hash referenciables"
    - "Rollback plan explicito en LEARNINGS (code revert + SQL reverse desde 01-SNAPSHOT.md)"
  artifacts:
    - path: ".planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md"
      provides: "Patterns aprendidos + deuda tecnica Q#2 + rollback plan documentado"
      contains: "Rollback plan"
    - path: ".claude/rules/agent-scope.md"
      provides: "Documentacion oficial del scope del agente somnio-recompra-v1 (catalogo propio, independiente de sales-v3)"
      contains: "somnio-recompra-v1"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Estado actualizado del modulo agentes/recompra"
      contains: "somnio-recompra-v1"
    - path: ".planning/debug/resolved/recompra-greeting-bugs.md"
      provides: "Debug session cerrada con link a esta fase standalone"
      contains: "somnio-recompra-template-catalog"
  key_links:
    - from: "prod Supabase agent_templates"
      to: "prod Vercel response-track.ts runtime"
      via: "query TEMPLATE_LOOKUP_AGENT_ID='somnio-recompra-v1'"
      pattern: "Coherencia temporal: migracion apply ANTES de push (Regla 5)"
    - from: "contacto Jose Romero (285d6f19)"
      to: "sesion recompra en prod"
      via: "smoke test end-to-end via WhatsApp"
      pattern: "turn-0 saludo → turn-1 quiero_comprar → turn-2 confirmar_direccion → turn-3 seleccion_pack → turn-4 confirmar"
---

<objective>
Wave 3 — Deploy a produccion + smoke test + close-out. Este plan materializa toda la Wave 0-2 en prod siguiendo strict Regla 5 ordering:

1. **Aplicar migracion SQL** en Supabase production (bloqueante — usuario corre en SQL Editor).
2. **Verificar post-migracion** con SELECT que devuelva las 4 rows esperadas.
3. **Push codigo** (Plans 02/03/04 commits) a main → Vercel autodeploy.
4. **Smoke test end-to-end** con contacto Jose Romero.
5. **Close-out docs**: mover debug a resolved, update agent-scope.md, update plataforma analysis, LEARNINGS.

Purpose: Cerrar la independizacion arquitectural de recompra. Cliente recibe saludo+imagen ELIXIR sin promos. "Sí" dispara pregunta de direccion con CRM data. Todo bajo catalog propio sin depender de sales-v3. Debug bugs resueltos.

Output: prod en estado nuevo, debug archivado, docs actualizados, LEARNINGS escritos.

**CRITICAL — Regla 5 strict ordering:**
1. Task 1 aplica SQL (checkpoint humano).
2. Task 2 push codigo SOLO despues de Task 1 confirmado.
3. Si Task 1 falla (ej. URL imagen dead, GRANT error), PAUSAR antes de push.

**CRITICAL — Regla 6 (D-09 Opcion A sin feature flag):**
Si smoke test revela problema grave, rollback:
- Code: `git revert <range-de-commits-Plans-02-03-04>` + push
- Templates: re-ejecutar los INSERTs del snapshot (01-SNAPSHOT.md) con DELETE previo de las nuevas rows
- Rollback plan completo documentado en LEARNINGS.md Task 5
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-07 (Regla 6), D-08 (Regla 5), D-09 (Opcion A)
@.planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Pitfalls 2 (Regla 5 violation), §Pitfalls 3 (Regla 6 mitigacion), §Validation Architecture (Phase gate + smoke)
@.planning/standalone/somnio-recompra-template-catalog/01-PLAN.md (migracion SQL file + snapshot)
@.planning/standalone/somnio-recompra-template-catalog/02-PLAN.md (revert T2 + direccion_completa + registro_sanitario)
@.planning/standalone/somnio-recompra-template-catalog/03-PLAN.md (transitions state machine D-04/D-05)
@.planning/standalone/somnio-recompra-template-catalog/04-PLAN.md (safety net tests)
@.planning/debug/recompra-greeting-bugs.md (debug origen — mover a resolved/ en Task 4)
@.claude/rules/agent-scope.md (actualizar en Task 4)
@docs/analysis/04-estado-actual-plataforma.md (actualizar en Task 4)
@CLAUDE.md §Regla 1 (push a Vercel), §Regla 4 (docs siempre), §Regla 5 (migracion antes), §Regla 6 (proteger agente prod)
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Checkpoint humano — aplicar migracion SQL en Supabase production + verificar</name>
  <read_first>
    - supabase/migrations/<ts>_recompra_template_catalog.sql (archivo de Plan 01)
    - .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md (estado pre-migracion + auditoria D-11)
    - CLAUDE.md §Regla 5, §Regla 6
  </read_first>
  <what-built>
    Plans 01-04 completaron localmente:
    - Plan 01: archivo SQL creado en git + snapshot JSON capturado + auditoria D-11 passed
    - Plan 02: response-track.ts y constants.ts editados (TEMPLATE_LOOKUP_AGENT_ID revert, direccion_completa+departamento, registro_sanitario, export resolveSalesActionTemplates)
    - Plan 03: transitions.ts editado (remove saludo entry, quiero_comprar→preguntar_direccion con L5)
    - Plan 04: 2 test files nuevos con suite verde

    Ningun commit pusheado todavia. Este Task aplica la migracion SQL en produccion ANTES del push. Task 2 hace el push.
  </what-built>
  <how-to-verify>
    **Paso 1 — Abrir Supabase Production SQL Editor:**

    1. Ir a https://supabase.com/dashboard
    2. Seleccionar proyecto de produccion de morfx (project ref empieza con `expslvzsszymljafhppi` basado en URLs verificadas)
    3. Click "SQL Editor" en el sidebar → "New query"

    **Paso 2 — Copiar el contenido del archivo de migracion:**

    ```bash
    # En la terminal local:
    cat supabase/migrations/<ts>_recompra_template_catalog.sql
    ```

    Copiar TODO el output (desde `BEGIN;` hasta `COMMIT;` inclusive) al SQL Editor.

    **Paso 3 — Ejecutar (click "Run"):**

    Esperado:
    - Success. Rows returned: 0 (los INSERT/DELETE/GRANT devuelven 0).
    - Si error, LEER mensaje. Posibles errores:
      - `permission denied for table agent_templates` → GRANTs defensivos fallaran si el SQL Editor runner no tiene el role. Subir a ownership `postgres`. Documentar.
      - `duplicate key value violates unique constraint` → imposible con el DELETE previo; si ocurre es bug en el SQL (reportar).
      - Timeout → improbable (la migracion es <1s), pero retentar.

    **Paso 4 — Verificar las 4 rows post-migracion:**

    Query en SQL Editor (nueva query):

    ```sql
    SELECT intent, orden, priority, content_type, LEFT(content, 80) AS content_preview, delay_s
    FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND workspace_id IS NULL
      AND intent IN ('saludo', 'preguntar_direccion_recompra', 'registro_sanitario')
    ORDER BY intent, orden;
    ```

    Expected output (4 rows):

    | intent | orden | priority | content_type | content_preview | delay_s |
    |--------|-------|----------|--------------|-----------------|---------|
    | preguntar_direccion_recompra | 0 | CORE | texto | ¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}} | 0 |
    | registro_sanitario | 0 | CORE | texto | Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA... | 0 |
    | saludo | 0 | CORE | texto | {{nombre_saludo}} 😊 | 0 |
    | saludo | 1 | COMPLEMENTARIA | imagen | https://expslvzsszymljafhppi.supabase.co/storage/.../1769960336980_Dise_o_sin... | 3 |

    **Paso 5 — Verificar que la URL de la imagen ELIXIR responde:**

    ```bash
    curl -I "https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg"
    # Expected: HTTP/2 200
    ```

    Si devuelve 404, el asset fue movido/borrado. PAUSAR fase y re-subir el asset ANTES de proceder.

    **Paso 6 — Verificar GRANTs (LEARNING 1 Phase 44.1 pattern):**

    ```sql
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name = 'agent_templates'
      AND grantee IN ('service_role', 'authenticated')
    ORDER BY grantee, privilege_type;
    ```

    Expected:
    - `service_role`: INSERT, SELECT, UPDATE, DELETE (GRANT ALL)
    - `authenticated`: SELECT
  </how-to-verify>
  <acceptance_criteria>
    - Usuario ejecuto la migracion en Supabase production sin errores.
    - Query del Paso 4 devuelve 4 rows EXACTAMENTE con los datos esperados (content_preview matches).
    - URL de la imagen ELIXIR responde HTTP/2 200 (verified via curl).
    - Query del Paso 6 confirma GRANTs aplicadas.
    - Usuario escribe "migracion aplicada" (o equivalente) + pega el output del Paso 4 verbatim en el resume signal para evidencia.
  </acceptance_criteria>
  <resume-signal>
    Escribe "migracion aplicada + 4 rows verified" + pega el output del SELECT de Paso 4 (las 4 filas) + confirma que curl de la URL dio 200.

    Si algo falla:
    - SQL error → describe el error, NO proceder a Task 2, escalar a discuss.
    - URL 404 → re-subir el asset a Supabase Storage antes de proceder.
    - GRANTs missing (row_granted vacia) → agregar grants manualmente en SQL Editor y re-verificar.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 2: Push a Vercel (Plans 01-04 commits) + verificar deploy</name>
  <read_first>
    - git log --oneline -10 (confirmar que los commits de Plans 01-04 estan en main local, NO pusheados)
    - .planning/standalone/somnio-recompra-template-catalog/01-SUMMARY.md, 02-SUMMARY.md, 03-SUMMARY.md, 04-SUMMARY.md (para tener los commit hashes en mente)
    - CLAUDE.md §Regla 1 (push a Vercel despues de cambios)
  </read_first>
  <action>
    **Paso 1 — Verificar que Task 1 fue completada** (checkpoint humano aprobo "migracion aplicada"). Si NO, DETENER.

    **Paso 2 — Verificar commits locales listos para push:**

    ```bash
    git log --oneline origin/main..HEAD
    ```

    Expected: ~5-6 commits (Plan 01 Task 1 + Task 2; Plan 02 Task 1 + Task 2; Plan 03 Task 1; Plan 04 Task 2 combinado). Verificar mensajes con `docs(somnio-recompra-template-catalog)`, `feat(somnio-recompra-template-catalog)`, `refactor(somnio-recompra-template-catalog)`, `fix(somnio-recompra-template-catalog)`, `test(somnio-recompra-template-catalog)`.

    **Paso 3 — Corre suite completa de tests localmente** (final check antes del push):

    ```bash
    npm run test 2>&1 | tee /tmp/test-05-preflight.log
    # Expected: all pass. Si falla CUALQUIER test, NO push — diagnosticar y fixear.
    ```

    **Paso 4 — Typecheck final:**

    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-05-preflight.log
    # Expected: 0 errors nuevos en archivos tocados en Plans 02/03. Errors pre-existentes en otros archivos OK.
    ```

    **Paso 5 — Push a Vercel:**

    ```bash
    git push origin main
    ```

    **Paso 6 — Monitorear Vercel deploy** (background task, usuario confirma en step 7):

    ```bash
    # Opcional: usar Vercel CLI si disponible
    vercel ls --prod | head -5
    # O ver en dashboard https://vercel.com/<team>/morfx-new/deployments
    ```

    Esperar ~2-4 minutos hasta que el nuevo deployment este "Ready" en verde.

    **Paso 7 — Smoke test post-deploy (sin contacto real todavia):**

    ```bash
    # Health check del endpoint de webhook (debe responder 200 aunque sin body valido — 400/401 OK tambien)
    curl -I https://morfx-new.vercel.app/api/webhooks/360dialog || curl -I https://<dominio-real-verificar>/api/webhooks/360dialog
    # Expected: HTTP 200/400/401 (NO 5xx — eso indicaria fallo de build)
    ```

    Si 5xx, ROLLBACK inmediato:

    ```bash
    # Rollback: revert los commits pusheados en este plan
    COMMITS_TO_REVERT=$(git log --oneline origin/main~7..origin/main | grep "somnio-recompra-template-catalog" | awk '{print $1}')
    # Revertir manualmente uno a uno, empezando por el mas reciente
    # git revert <SHA> --no-edit
    # git push origin main
    ```

    Y revertir SQL templates re-ejecutando el INSERT de 01-SNAPSHOT.md (pero PRIMERO DELETE de las 4 nuevas rows).
  </action>
  <verify>
    <automated>git log --oneline origin/main..HEAD 2>/dev/null | wc -l | awk '{exit $1 > 0 ? 1 : 0}'</automated>
    <automated>npm run test 2>&1 | tee /tmp/test-05-final.log; grep -qE "Test Files.*passed" /tmp/test-05-final.log && ! grep -qE "FAIL|failed" /tmp/test-05-final.log</automated>
    <automated>git push origin main 2>&1 | tee /tmp/push-05.log; grep -qE "main -> main|up-to-date" /tmp/push-05.log</automated>
    <automated>git log --oneline origin/main..HEAD 2>/dev/null | wc -l | awk '{exit $1 == 0 ? 0 : 1}'</automated>
  </verify>
  <acceptance_criteria>
    - `npm run test` full suite pasa exit 0.
    - `npm run typecheck` no introduce errores nuevos.
    - `git push origin main` exitoso.
    - Despues del push, `git log --oneline origin/main..HEAD` esta vacio (main sincronizado con origin).
    - Vercel deploy nuevo aparece en dashboard — status "Ready" verde (checkpoint en Task 3 verifica esto + smoke).
    - Ningun endpoint responde 5xx post-deploy (verified via curl).
  </acceptance_criteria>
  <done>
    - Commits pusheados a main.
    - Vercel deploy OK.
    - No regressions basicas en webhook endpoint.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Smoke test end-to-end con contacto Jose Romero en produccion</name>
  <read_first>
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Flujo esperado
    - CONTEXT.md comportamiento esperado lineas 31-37 (saludo → preguntar_direccion → confirmar → promos → pack → resumen → confirmar → crear_orden)
    - MEMORY.md contexto de Jose Romero contacto 285d6f19 (workspace Somnio a3843b3f)
  </read_first>
  <what-built>
    Codigo pusheado + templates aplicados. Ahora hay que validar end-to-end que el comportamiento real coincide con D-03..D-13. El test unitario solo cubre logica pura — aqui validamos con WhatsApp real + cliente real.

    **IMPORTANTE:** Usar el workspace Somnio (a3843b3f-c337-4836-92b5-89c58bb98490) y contacto Jose Romero (285d6f19-...). El agente `somnio-recompra-v1` debe estar activo para este contacto (verificado en MEMORY.md — somnio recompra activo en prod). Si el agente esta pausado, activar temporalmente para el smoke.
  </what-built>
  <how-to-verify>
    **Paso 1 — Preparar la sesion de Jose Romero:**

    En el backend (sandbox UI o SQL directo), cerrar/resetear cualquier sesion activa de recompra del contacto 285d6f19 para forzar el turn-0 saludo. Opciones:

    ```sql
    -- Verificar sesiones activas
    SELECT id, status, current_phase, turn_count
    FROM agent_sessions
    WHERE contact_id = '285d6f19-...' -- reemplazar con full UUID
      AND status = 'active';

    -- Si existe activa, cerrar (soft close, no DELETE)
    UPDATE agent_sessions
    SET status = 'closed', closed_at = NOW()
    WHERE contact_id = '285d6f19-...'
      AND status = 'active';
    ```

    **Paso 2 — Iniciar conversacion (cliente envia saludo):**

    Desde el telefono de Jose Romero (o simular via sandbox UI → send to real WhatsApp), enviar:

    ```
    Hola
    ```

    **Expected response** (D-03 + D-05 integrado):
    1. Mensaje 1 (texto): `"Buenos dias Jose 😊"` (o "Buenas tardes/noches" segun hora Bogota)
    2. Mensaje 2 (imagen): ELIXIR DEL SUEÑO imagen con caption `"Deseas adquirir tu ELIXIR DEL SUEÑO?"`
    3. NO aparece template de promociones (D-05 satisfied).
    4. NO aparece pregunta de cual pack.

    **Paso 3 — Cliente confirma intencion de comprar (D-04):**

    Enviar:
    ```
    sí
    ```

    **Expected response** (D-04 + D-12):
    ```
    ¡Claro que sí! ¿Sería para la misma dirección?
    <direccion preloaded del CRM>, <ciudad>, <departamento>
    ```

    Verificar que los 3 campos aparecen concatenados con ", " (ej. `"Calle 48A #27-85, Bucaramanga, Santander"`).

    **Paso 4 — Cliente confirma direccion:**

    Enviar:
    ```
    Sí, la misma
    ```

    **Expected response:** Haiku clasifica como `confirmar_direccion` → transicion existente dispara `ofrecer_promos` → template `promociones` con 3 packs (1x/2x/3x). Verificar que aparecen los 3 precios.

    **Paso 5 — Cliente selecciona pack:**

    Enviar:
    ```
    Quiero el 2x
    ```

    **Expected response:** intent `seleccion_pack` + pack=2x + datosCriticos=true → action `mostrar_confirmacion` → template `resumen_2x` con datos del cliente + precio $109,900. Verificar que el resumen incluye nombre/apellido/telefono/direccion/ciudad/departamento/pack/precio.

    **Paso 6 — Cliente confirma:**

    Enviar:
    ```
    Sí, confirmo
    ```

    **Expected response:** intent `confirmar` + packElegido=true + datosCriticos=true → action `crear_orden` → template `confirmacion_orden_same_day` O `confirmacion_orden_transportadora` (depende zona de Bucaramanga). La orden debe aparecer en la DB.

    ```sql
    SELECT id, contact_id, status, pack, created_at
    FROM orders
    WHERE contact_id = '285d6f19-...'
    ORDER BY created_at DESC
    LIMIT 1;
    ```

    Expected: 1 row nueva con created_at reciente (dentro del minuto).

    **Paso 7 — Registro sanitario (D-06) smoke separado:**

    En nueva sesion de recompra (resetear primero), enviar:
    ```
    ¿Tiene registro Invima?
    ```

    **Expected response:** Haiku clasifica como `registro_sanitario` → INFORMATIONAL_INTENTS (post-Plan-02) permite match → template `registro_sanitario` se emite: `"Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS."`

    Si responde vacio o con fallback, verificar que Plan 02 fue pusheado correctamente (`grep registro_sanitario src/lib/agents/somnio-recompra/constants.ts` en prod commit).

    **Paso 8 — Verificar observability (opcional):**

    En Supabase/dashboard de observability, buscar los eventos de la sesion:

    ```sql
    SELECT event_type, event_name, payload, created_at
    FROM observability_events
    WHERE payload->>'agent' = 'recompra'
      AND created_at > NOW() - INTERVAL '10 minutes'
    ORDER BY created_at DESC;
    ```

    Buscar eventos:
    - `pipeline_decision:intent_transition` con `action=preguntar_direccion`
    - `template_selection:block_composed` con `hasSaludoCombined=false` en turn-0
    - `template_selection:block_composed` con `infoTemplateIntents=['saludo']` en turn-0 (NO promociones)
  </how-to-verify>
  <acceptance_criteria>
    - Turn-0 saludo: cliente ve 2 mensajes (texto con nombre + imagen ELIXIR), SIN promociones.
    - Turn-1 quiero_comprar: cliente ve pregunta "¿Sería para la misma dirección?\n<direccion completa>" con los 3 campos concatenados.
    - Turn-2 confirmar_direccion: cliente ve promociones (3 packs).
    - Turn-3 seleccion_pack: cliente ve resumen del pedido.
    - Turn-4 confirmar: cliente ve confirmacion_orden + orden creada en DB.
    - Turn separado registro_sanitario: cliente ve el template correspondiente (D-06 satisfied).
    - Usuario (Jose) confirma "smoke OK" con descripcion de cada turn observado.
    - Si CUALQUIER paso falla: ROLLBACK immediato (ver Task 2 Paso 7) y escalar diagnostico.
  </acceptance_criteria>
  <resume-signal>
    Escribe "smoke OK" + breve descripcion de cada turn (7 pasos) si todo funciono correctamente.

    Si hubo problemas:
    - Describe que fallo (turn X respondio Y en vez de Z)
    - PAUSAR — proponer diagnostico o rollback
    - NO avanzar a Task 4 (docs) hasta que prod este funcional
  </resume-signal>
</task>

<task type="auto">
  <name>Task 4: Close-out — mover debug a resolved + update docs (Regla 4) + LEARNINGS</name>
  <read_first>
    - .planning/debug/recompra-greeting-bugs.md (archivo actual — sera movido)
    - .claude/rules/agent-scope.md (buscar seccion existente de somnio-recompra si hay, o agregar nueva)
    - docs/analysis/04-estado-actual-plataforma.md (buscar seccion de agentes o recompra)
    - CLAUDE.md §Regla 4 (docs siempre)
    - .planning/standalone/somnio-recompra-template-catalog/01-SUMMARY.md, 02-SUMMARY.md, 03-SUMMARY.md, 04-SUMMARY.md (para referenciar commits en LEARNINGS)
  </read_first>
  <action>
    **Paso 1 — Mover debug file a resolved:**

    ```bash
    mkdir -p .planning/debug/resolved
    mv .planning/debug/recompra-greeting-bugs.md .planning/debug/resolved/recompra-greeting-bugs.md
    ```

    Editar el frontmatter del archivo movido — cambiar `status: handed_off` a `status: resolved` + agregar `resolved_at: 2026-04-22` + `resolved_in: somnio-recompra-template-catalog` + agregar seccion al inicio del body:

    ```markdown
    ## Resolution (2026-04-22 — standalone `somnio-recompra-template-catalog` shipped)

    Todos los issues identificados en este debug fueron resueltos por la fase standalone `somnio-recompra-template-catalog`:

    - T2 (template lookup apuntaba a sales-v3) — RESUELTO en Plan 02 (revert a `somnio-recompra-v1`) + catalogo poblado en Plan 01 migration.
    - Flujo saludo → promos (contradice producto) — RESUELTO en Plans 01+03: saludo sin accion + imagen ELIXIR, quiero_comprar → preguntar_direccion.
    - Deuda `registro_sanitario` — RESUELTO en Plan 02 (agregado a INFORMATIONAL_INTENTS) + Plan 01 migration (template creado).

    Commits:
    - Plan 01: ver .planning/standalone/somnio-recompra-template-catalog/01-SUMMARY.md
    - Plan 02: 02-SUMMARY.md
    - Plan 03: 03-SUMMARY.md
    - Plan 04: 04-SUMMARY.md
    - Plan 05: 05-SUMMARY.md

    Smoke test en prod con Jose Romero: OK (timestamp en 05-SUMMARY.md).
    ```

    **Paso 2 — Actualizar `.claude/rules/agent-scope.md`:**

    Si ya hay seccion "Somnio Recompra" o "somnio-recompra-v1", editarla para agregar:

    ```markdown
    ### Somnio Recompra (`somnio-recompra-v1`)

    - **PUEDE (runtime):**
      - Dispatchar templates desde su catalogo propio bajo `agent_id='somnio-recompra-v1'` en `agent_templates`
      - Ejecutar state machine de recompra con 2 entry scenarios en initial phase: `quiero_comprar` → `preguntar_direccion` (D-04), `datos` → `ofrecer_promos` (si datosCriticos completo)
      - Responder a `saludo` con el block saludo-texto + ELIXIR-imagen (handled por response-track.ts INFORMATIONAL_INTENTS branch — la entry de transitions fue eliminada en Plan 03 de somnio-recompra-template-catalog, D-05)
      - Responder a `registro_sanitario` (D-06)
    - **NO PUEDE:**
      - Usar templates de `agent_id='somnio-sales-v3'` (los agentes son independientes post D-01)
      - Saltar la pregunta de direccion cuando el cliente dice `quiero_comprar` en initial
    - **Validacion:**
      - `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` hardcoded en `src/lib/agents/somnio-recompra/response-track.ts:39`
      - Entry `saludo` en `transitions.ts` fue ELIMINADA en Plan 03 — verificable con `! grep "on: 'saludo'" src/lib/agents/somnio-recompra/transitions.ts`
    - **Consumidores in-process:**
      - `somnio-recompra-crm-reader` (Phase shipped 2026-04-21) — carga `{{direccion}}`, `{{ciudad}}`, `{{departamento}}` desde CRM para la pregunta de direccion (D-12 concat)
    ```

    Si NO hay seccion existente, agregarla despues del scope de "CRM Writer Bot" (antes de "Config Builder").

    **Paso 3 — Actualizar `docs/analysis/04-estado-actual-plataforma.md`:**

    Buscar la seccion de "Agentes" o "Somnio" o "Recompra". Actualizar:
    - Remover cualquier mencion de "recompra usa templates de sales-v3 como fallback" — ahora es falso.
    - Agregar nota: "Catalogo `somnio-recompra-v1` independiente post 2026-04-22 (standalone `somnio-recompra-template-catalog`)."
    - Si existe deuda tecnica listada "registro_sanitario gap" o similar, ELIMINARLA (P0/P1/P2/P3 per Regla 4).

    Si no se encuentra la seccion exacta, leer el archivo completo primero y ubicar la tabla/lista mas apropiada. Si ambiguo, agregar al final del archivo una entrada nueva con fecha.

    **Paso 4 — Crear LEARNINGS.md:**

    Crear archivo `.planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md` con:

    ```markdown
    # Learnings — somnio-recompra-template-catalog

    **Shipped:** 2026-04-22
    **Commits:** ver 01/02/03/04/05-SUMMARY.md (rangos SHA)

    ## Patterns aprendidos

    1. **Template catalog independiente por agente** — Cuando forkeas un agente (nuevo system prompt, state machine, runner), SIEMPRE crear catalog propio en `agent_templates` bajo `agent_id` nuevo. NO "reutilizar temporalmente" templates del agente original — el debt termina costando mas (ver T2 de recompra-greeting-bugs: fix provisional duro 7 dias + tuvo que revertirse + scope ampliado por deuda acumulada).

    2. **Regla 5 strict ordering valida bajo D-09 Opcion A** — Sin feature flag, la secuencia "migracion → push → smoke" cubre el riesgo siempre que:
       - La migracion sea idempotente (DELETE+INSERT para replaces, DO $$ IF NOT EXISTS para nuevos)
       - El snapshot pre-migration este capturado en git antes de ejecutar
       - El smoke test sea rapido (< 10 min de testing con cliente real)
       Este plan mostro que NO hace falta feature flag para cambios aditivos de templates cuando se sigue la secuencia.

    3. **Q#1 resolution (transitions null fallback)** — Para desconectar una entry de state machine sin romper runtime, verificar PRIMERO el caller de `resolveTransition` (sales-track.ts:88-93). Si el caller maneja `null` de forma segura, la eliminacion es preferible a usar `action: 'silence'` (mas limpio + documenta intent).

    4. **Verificar TemplateManager cache no es long-lived** — Antes de deploy de cambios en el lookup agentId, confirmar que el cache NO sobrevive entre turnos. Verified en response-track.ts:114 (`new TemplateManager(workspaceId)` por turno — cache per-instance, no singleton). Si fuera singleton, un flip de constant requeriría invalidateCache() explicito.

    5. **Audit D-11 pattern (pre-migration SQL sanity check)** — Para cambios scoped (ej. "solo 3 templates de 22 necesitan migrar"), escribir SQL audit que liste los 19 restantes y valide empiricamente su existencia. El audit debio ejecutarse en Plan 01 Task 1 ANTES de generar la migracion. Si falla, escalar a discuss antes de avanzar.

    ## Deuda tecnica abierta (Q#2 Opcion A)

    El template `preguntar_direccion_recompra` (D-12) solo soporta happy path:
    - Branch `gates.datosCriticos === true` (direccion + ciudad + departamento preloaded) → template muestra `{{direccion_completa}}` bien.
    - Branch `!gates.datosCriticos` (preload fallo o datos borrados) → `response-track.ts:352-360` emite `campos_faltantes` pero el template no tiene variable `{{campos_faltantes}}` — el texto sale con `{{direccion_completa}}` literal o string vacio.

    **Rareza:** Para recompra con CRM reader activo, `createPreloadedState` llena siempre los 6 criticos. El branch `!datosCriticos` solo dispararia si:
    - Preload fallo (DB error upstream) → sesion sin datos → cliente ve pregunta rara
    - Cliente borro campos explicitamente → cliente ve pregunta rara (pero es su fault)

    **Mitigacion futura (si ocurre en prod):**
    - Opcion B (descrito en RESEARCH.md §Open Q#2): agregar segunda row orden=1 al mismo intent con `{{campos_faltantes}}` en el content, o crear intent separado `preguntar_direccion_incompleto`. Requiere cambio en response-track.ts branch `!datosCriticos` (lineas 352-360) + migration.

    **Tracking:** No abrir issue formal — documented here. Si aparece en prod con frecuencia, escalar a standalone phase.

    ## Rollback plan (si despues del shipping hay regresion grave)

    ### Code rollback:
    ```bash
    # Identificar range de commits pusheados en este phase
    git log --oneline --grep "somnio-recompra-template-catalog" | head -20

    # Revertir los commits en orden inverso (mas reciente primero)
    git revert <SHA_PLAN_05_DOCS> --no-edit
    git revert <SHA_PLAN_04_TESTS> --no-edit
    git revert <SHA_PLAN_03_TRANSITIONS> --no-edit
    git revert <SHA_PLAN_02_CONSTANTS> --no-edit
    git revert <SHA_PLAN_02_RESPONSE_TRACK> --no-edit
    # NO revertir Plan 01 Task 2 commit (la migracion en git) — queda como historial

    git push origin main
    ```

    ### Template rollback (SQL):

    Ejecutar en Supabase SQL Editor production:

    ```sql
    BEGIN;

    -- 1. Borrar las 4 rows de la migracion
    DELETE FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND workspace_id IS NULL
      AND intent IN ('saludo', 'preguntar_direccion_recompra', 'registro_sanitario');

    -- 2. Re-insertar las rows viejas desde snapshot
    -- Abrir 01-SNAPSHOT.md §Snapshot JSON y construir los INSERT basados en el array serializado.
    -- Ejemplo (reemplazar con data real del snapshot):
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      -- Pegar las rows viejas desde snapshot JSON
      ...;

    COMMIT;
    ```

    El snapshot en `01-SNAPSHOT.md` tiene el JSON completo (`jsonb_pretty` output). Convert a INSERTs con este helper SQL:

    ```sql
    -- Generar INSERT statements desde el JSONB snapshot (guardar output y ejecutar)
    SELECT format(
      'INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s) VALUES (''%s'', ''%s'', %s, ''%s'', ''%s'', ''%s'', %s, ''%s'', %L, %s);',
      id, agent_id,
      COALESCE(quote_literal(workspace_id::text), 'NULL'),
      intent, visit_type, priority, orden, content_type, content, delay_s
    )
    FROM jsonb_to_recordset('<pegar el snapshot_json aqui>'::jsonb)
    AS x(id uuid, agent_id text, workspace_id uuid, intent text, visit_type text,
         priority text, orden int, content_type text, content text, delay_s int);
    ```

    ### Verificacion post-rollback:
    ```sql
    SELECT intent, orden, LEFT(content, 60) FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1' AND workspace_id IS NULL
    ORDER BY intent, orden;
    -- Debe coincidir con el estado pre-migration documentado en 01-SNAPSHOT.md
    ```

    ## Metricas de la fase

    - Scope entregado: 4 rows en agent_templates + 4 cambios de codigo + 2 test files nuevos + 1 archivo migracion SQL
    - Tiempo de ejecucion: <fill in at close-out>
    - Commits totales: <fill in>
    - Bugs encontrados post-shipping: <fill in o "ninguno">
    ```

    **Paso 5 — Commit atomico + push:**

    ```bash
    git add .planning/debug/resolved/recompra-greeting-bugs.md \
            .claude/rules/agent-scope.md \
            docs/analysis/04-estado-actual-plataforma.md \
            .planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md

    # Verificar que el archivo viejo .planning/debug/recompra-greeting-bugs.md ya no existe (movido)
    test ! -f .planning/debug/recompra-greeting-bugs.md

    git commit -m "docs(somnio-recompra-template-catalog): close-out — mover debug a resolved + update docs + LEARNINGS"
    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f .planning/debug/resolved/recompra-greeting-bugs.md && test ! -f .planning/debug/recompra-greeting-bugs.md</automated>
    <automated>grep -q "status: resolved" .planning/debug/resolved/recompra-greeting-bugs.md</automated>
    <automated>grep -q "somnio-recompra-v1" .claude/rules/agent-scope.md</automated>
    <automated>test -f .planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md</automated>
    <automated>grep -q "Rollback plan" .planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md</automated>
    <automated>grep -q "Q#2" .planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(somnio-recompra-template-catalog): close-out"</automated>
    <automated>git log --oneline origin/main..HEAD 2>/dev/null | wc -l | awk '{exit $1 == 0 ? 0 : 1}'</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/debug/resolved/recompra-greeting-bugs.md` existe con status=resolved + seccion de "Resolution".
    - `.planning/debug/recompra-greeting-bugs.md` ya NO existe (movido, no copiado).
    - `.claude/rules/agent-scope.md` tiene seccion documentada de `somnio-recompra-v1` con PUEDE/NO PUEDE + catalogo propio + referencia a esta fase.
    - `docs/analysis/04-estado-actual-plataforma.md` actualizado — deuda `registro_sanitario` eliminada si estaba listada.
    - `LEARNINGS.md` existe con: patterns, Q#2 deuda documentada, rollback plan con SQL ejecutable.
    - Commit atomico + push exitoso.
  </acceptance_criteria>
  <done>
    - Docs sincronizados con el codigo (Regla 4).
    - Debug archivado en resolved/.
    - LEARNINGS disponibles para futuros devs.
    - Main sincronizado con origin/main.
  </done>
</task>

</tasks>

<verification>
- Migracion SQL aplicada en prod (Task 1 checkpoint humano).
- Push completado (Task 2) — Vercel deploy OK.
- Smoke test end-to-end passed (Task 3 checkpoint humano) — 7 pasos OK + registro_sanitario smoke + orden creada en DB.
- Debug file movido a resolved/ con status actualizado.
- Docs actualizados: `.claude/rules/agent-scope.md` + `docs/analysis/04-estado-actual-plataforma.md`.
- LEARNINGS.md creado con patterns + deuda Q#2 + rollback plan.
- Main sincronizado con origin/main (sin commits locales pendientes).
</verification>

<success_criteria>
- Agente `somnio-recompra-v1` en produccion: catalogo propio + flujo redesign funcional.
- Cliente recibe saludo+imagen sin promos (D-03 + D-05).
- "Sí" dispara pregunta de direccion con `direccion_completa` completo (D-04 + D-12).
- `registro_sanitario` responde correcto (D-06).
- Regla 5 respetada (migracion ANTES de push).
- Regla 6 respetada (prod agente funcional durante todo el rollout — aditivo, sin feature flag pero con snapshot + rollback preparado).
- Regla 4 respetada (docs actualizados).
- Fase cerrada — proximo comando sugerido al usuario: `/gsd-verify-work somnio-recompra-template-catalog`.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-template-catalog/05-SUMMARY.md` documenting:
- Timestamp exacto de aplicacion de migracion en prod (Task 1 resume-signal)
- Output del SELECT de verificacion Paso 4 de Task 1 (4 rows confirmadas)
- Commit hashes pusheados (git log origin/main..origin/main~N)
- Timestamp del push (Task 2)
- Resumen del smoke test de Task 3 (7 pasos + registro_sanitario + orden creada)
- Commit hash de Task 4 (close-out docs + LEARNINGS)
- Link a LEARNINGS.md
- Confirmacion explicita: "Fase somnio-recompra-template-catalog CERRADA. Regla 5, 6, 4 respetadas. 4 rows en prod. smoke OK. docs actualizados."
</output>
