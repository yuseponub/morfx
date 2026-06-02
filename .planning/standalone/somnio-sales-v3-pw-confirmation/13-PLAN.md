---
phase: somnio-sales-v3-pw-confirmation
plan: 13
type: execute
wave: 7
depends_on: [02, 03, 09, 11, 12]
files_modified:
  - .planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md
autonomous: false

requirements: []

must_haves:
  truths:
    - "Migracion SQL de Plan 02 (`<ts>_pw_confirmation_template_catalog.sql`) APLICADA en Supabase production via SQL Editor manual (Regla 5 strict — Task 1 checkpoint)"
    - "Verificacion post-apply: `SELECT COUNT(*) FROM agent_templates WHERE agent_id='somnio-sales-v3-pw-confirmation'` retorna >=18 rows"
    - "Pre-push: typecheck + test + build pasan localmente sin errors nuevos"
    - "Push de TODOS los commits acumulados (Plans 01-12 que NO pushearon individualmente — Wave 0-6 quedaron locales)"
    - "Vercel deploy succeded (visible en `https://vercel.com/morfxjose/morfx-new/deployments`)"
    - "Smoke test 1: visit `/agentes/routing/editor` en prod (morfx.app) — el dropdown del agent_id muestra 'somnio-sales-v3-pw-confirmation' como opcion seleccionable (D-02 verificado)"
    - "Smoke test 2 (opcional pero recomendado): el usuario crea MANUALMENTE una regla en `/agentes/routing-editor` con: prioridad 700, fact `activeOrderStageRaw` operator `in` value `['NUEVO PAG WEB','FALTA INFO','FALTA CONFIRMAR']` + fact `activeOrderPipeline` equal `'Ventas Somnio Standard'` → event route agent_id `'somnio-sales-v3-pw-confirmation'`. Tras activar, envia un mensaje WhatsApp desde un cliente de prueba con pedido en stage entry → agente responde correctamente."
    - "13-DEPLOY-NOTES.md documenta: deploy timestamp, commit range pusheado, smoke test results, regla de routing creada (con SQL/JSON snippet del usuario), incidencias si las hubo, fecha de activacion en prod"
    - "NO se crea regla en routing_rules automaticamente — la activacion del agente en producción es 100% responsabilidad del usuario via UI (D-02 + Open Q6 resuelto: plan-phase incluye SQL template + instrucciones, pero el usuario decide cuando activar)"
  artifacts:
    - path: ".planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md"
      provides: "Documentacion del deploy + smoke tests + activacion manual"
      contains: "Wave 7"
  key_links:
    - from: ".planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md"
      to: "Vercel deploy URL + Supabase SQL apply timestamp"
      via: "documentacion para auditoria post-deploy"
      pattern: "morfx-new.*deployments"
---

<objective>
Wave 7 — Production rollout. Aplica la migracion SQL en prod (Regla 5 strict ordering: APPLY antes de PUSH del codigo que la consume), pushea todos los commits acumulados a Vercel, verifica smoke tests, documenta para auditoria.

Purpose: Cierra el loop. Los Plans 01-12 quedaron locales (NO push). Plan 13 hace el push atomico de toda la fase + valida que el agente esta listo para que el usuario lo active manualmente desde la UI.

**CRITICAL — Regla 5 strict ordering:**
1. PRIMERO: aplicar SQL de Plan 02 en prod (Task 1 checkpoint humano).
2. SOLO DESPUES: push del codigo (Task 2). Si el orden se invierte, el codigo de Plan 07 (response-track con TEMPLATE_LOOKUP_AGENT_ID='somnio-sales-v3-pw-confirmation') buscaria templates inexistentes → 0 rows → mensajes vacios al cliente.

**NO se crea regla en routing_rules (D-02 + Open Q6):** El plan-phase provee SQL template + instrucciones. La activacion en prod es responsabilidad del usuario (puede esperar a hacer pruebas extensivas en sandbox antes de flipear). Sin regla activa = sin trafico = sin riesgo.

Output: 1 archivo de documentacion (`13-DEPLOY-NOTES.md`) + push atomico de Plans 01-12 commits.

Dependencias: TODAS las plans anteriores deben estar completas (commits locales).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-02 (routing manual)
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §G (estado routing Somnio), §I.6 Wave 5
@.planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md — patron deploy + flip docs
@.planning/standalone/somnio-recompra-template-catalog/05-PLAN.md — patron Wave 5 (apply SQL + push)
@CLAUDE.md §Regla 1 (push a Vercel), §Regla 5 (migracion antes de deploy)
@supabase/migrations/<ts>_pw_confirmation_template_catalog.sql (Plan 02)

<interfaces>
<!-- SQL de routing rule template (NO ejecutar — solo documentar para el usuario) -->
INSERT INTO routing_rules (workspace_id, name, priority, conditions, event, enabled)
VALUES (
  'a3843b3f-c337-4836-92b5-89c58bb98490',
  'Somnio PW Confirmation routing',
  700,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('fact', 'activeOrderStageRaw', 'operator', 'in', 'value', ARRAY['NUEVO PAG WEB','FALTA INFO','FALTA CONFIRMAR']),
      jsonb_build_object('fact', 'activeOrderPipeline', 'operator', 'equal', 'value', 'Ventas Somnio Standard')
    )
  ),
  jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'somnio-sales-v3-pw-confirmation')),
  false  -- enabled=false initially; user flips to true via UI when ready
);
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Checkpoint — Usuario aplica migracion SQL de Plan 02 en Supabase production (Regla 5 strict)</name>
  <read_first>
    - supabase/migrations/<ts>_pw_confirmation_template_catalog.sql (Plan 02)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/02-SUMMARY.md (timestamp + path exacto del archivo)
    - CLAUDE.md §Regla 5
  </read_first>
  <what-built>
    Plan 02 creo el archivo de migracion SQL con ~28 templates bajo `agent_id='somnio-sales-v3-pw-confirmation'`. El archivo esta en git (NO aplicado todavia). Necesitamos que el usuario:
    1. Abra Supabase SQL Editor del proyecto morfx prod.
    2. Copie el contenido del archivo y lo pegue + ejecute.
    3. Valide con queries de verificacion.
    4. Confirme "migracion aplicada" para desbloquear Task 2 (push).

    **Por que este orden:** Si pusheamos primero el codigo y la migracion despues, el response-track buscaria templates en agent_templates con agent_id='somnio-sales-v3-pw-confirmation', encontraria 0 rows, y emitiria mensajes vacios. Aplicar SQL primero garantiza que cuando el codigo aterrice, los templates ya estan ahi.

    Aunque NO hay regla de routing activa todavia (D-02 — el usuario activa manualmente despues), el codigo SI puede ejecutarse en cold lambdas si el routing-editor accidentalmente prueba el agente, o si Inngest reintenta una function antigua. Por eso aplicamos SQL antes — defense-in-depth.
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar la migracion en Supabase production:**

    1. Encontrar el archivo: `ls supabase/migrations/*pw_confirmation_template_catalog.sql`.
    2. Abrir su contenido: `cat supabase/migrations/<ts>_pw_confirmation_template_catalog.sql`.
    3. Abrir https://supabase.com/dashboard → proyecto morfx prod → SQL Editor → New query.
    4. Pegar el contenido COMPLETO y click Run.
    5. Esperado: "Success. No rows returned." (la migracion es idempotente — DO $$ IF NOT EXISTS bloques no fallan si rows ya existen).

    **Paso 2 — Verificar templates insertados:**

    ```sql
    SELECT intent, visit_type, orden, content_type, priority, LEFT(content, 50) AS preview
    FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND workspace_id IS NULL
    ORDER BY intent, orden;
    ```

    Expected: ~28 rows (ver 02-SUMMARY.md para count exacto).

    **Paso 3 — Verificar GRANTs aplicadas:**

    ```sql
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name = 'agent_templates'
      AND grantee IN ('service_role', 'authenticated')
    ORDER BY grantee, privilege_type;
    ```

    Expected: service_role tiene SELECT/INSERT/UPDATE/DELETE; authenticated tiene SELECT.

    **Paso 4 — Spot-check copy clave (D-27):**

    ```sql
    SELECT content
    FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'registro_sanitario';
    ```

    Expected output: contiene `INVIMA` y `PHARMA SOLUTIONS SAS` (D-27 lock).

    ```sql
    SELECT content
    FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'agendar_pregunta';
    ```

    Expected: `¿Deseas agendarlo para alguna fecha futura?` (D-11 lock).

    ```sql
    SELECT content
    FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'claro_que_si_esperamos';
    ```

    Expected: `Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴` (D-14 lock).

    **Paso 5 — Confirmar "migracion aplicada" para desbloquear Task 2.**
  </how-to-verify>
  <acceptance_criteria>
    - Migracion SQL aplicada exitosamente en Supabase production.
    - Query Paso 2 retorna >=18 rows (ideal ~28).
    - GRANTs verificadas (service_role ALL + authenticated SELECT).
    - Spot-checks D-27 (INVIMA), D-11 (agendar_pregunta), D-14 (claro_que_si_esperamos) PASS.
    - Usuario confirma "migracion aplicada".
  </acceptance_criteria>
  <resume-signal>
    Escribe "migracion aplicada" + count de rows insertadas (output de Paso 2 — debe ser >=18) para desbloquear Task 2 push.

    Si la migracion fallo (DO $$ block error, syntax error, etc.), pega el error completo y discutamos antes de pushear codigo.

    Si los spot-checks fallan (copy diferente al locked), PAUSAR y revisar Plan 02 — corregir el SQL antes de avanzar.
  </resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Pre-push validation (typecheck + tests + build) + push atomico de Plans 01-12</name>
  <read_first>
    - git log --oneline | head -30 (ver commits acumulados de Plans 01-12)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/01-12-SUMMARY.md (commits hashes documentados)
    - CLAUDE.md §Regla 1 (push a Vercel)
  </read_first>
  <action>
    **Paso 1 — Pre-push validation:**

    ```bash
    npm run typecheck 2>&1 | tee /tmp/pre-push-tc.log
    # Expected: exit 0, no errors nuevos en src/lib/agents/somnio-pw-confirmation/** o archivos editados

    npm run test -- src/lib/agents/somnio-pw-confirmation 2>&1 | tee /tmp/pre-push-test.log
    # Expected: all 5 suites passed (>=35 tests)

    npm run build 2>&1 | tee /tmp/pre-push-build.log
    # Expected: exit 0, build successful
    ```

    Si alguno falla, FIX antes de pushear (NO pushear codigo broken).

    **Paso 2 — Verificar el commit log a pushear:**

    ```bash
    git log origin/main..HEAD --oneline | tee /tmp/commits-to-push.log
    # Expected: ~25-35 commits de la fase (Plans 01-12 hicieron multiples commits cada uno)
    # Ningun commit pusheado todavia (todos son nuevos vs origin/main)
    ```

    **Paso 3 — Push atomico:**

    ```bash
    git push origin main
    # Vercel detecta + dispara deploy automatico
    ```

    **Paso 4 — Esperar deploy de Vercel:**

    1. Ir a https://vercel.com/morfxjose/morfx-new/deployments
    2. Esperar que el ultimo deploy aparezca como "Ready" (verde, ~2-5 min)
    3. Si el deploy falla, leer el log de Vercel y diagnosticar (build error, lambda size, env var faltante, etc.)

    **Paso 5 — Verificar Inngest sync:**

    1. Ir a https://app.inngest.com (o el dashboard de Inngest configurado)
    2. Buscar la function `pw-confirmation-preload-and-invoke` en la lista de functions registered
    3. Confirmar que `App version` y `Last sync` son recientes (post-deploy timestamp)
  </action>
  <verify>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>npm run test -- src/lib/agents/somnio-pw-confirmation 2>&1 | grep -qE "([0-9]+ passed)"</automated>
    <automated>npm run build 2>&1 | grep -qE "Compiled successfully|BUILD COMPLETE"</automated>
    <automated>git log origin/main..HEAD --oneline 2>&1 | grep -q "somnio-sales-v3-pw-confirmation"</automated>
    <automated>git push origin main 2>&1 | tee /tmp/push.log; grep -qE "Writing objects|Total" /tmp/push.log</automated>
    <automated>git log origin/main..HEAD --oneline | wc -l | awk '$1 == 0 { exit 0 } { exit 1 }'</automated>
  </verify>
  <acceptance_criteria>
    - typecheck OK.
    - Tests pass.
    - Build successful.
    - Push commits to origin/main exitoso.
    - Vercel deploy "Ready".
    - Inngest function registered (visible en dashboard).
  </acceptance_criteria>
  <done>
    - Codigo en producción, agente seleccionable en routing-editor (verificable en Task 3).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Smoke test 1 (dropdown) + Task 4 (opcional, manual rule + WhatsApp test) + crear DEPLOY-NOTES</name>
  <read_first>
    - https://vercel.com (deploy URL)
    - .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md (referencia SQL pattern para routing rule)
  </read_first>
  <what-built>
    Plan 13 Tasks 1+2 aplicaron migracion + pushearon codigo + Vercel desplego. Necesitamos validar:
    1. Smoke test 1 (CRITICAL): el agente aparece como opcion en el dropdown del routing-editor en prod.
    2. Smoke test 2 (OPCIONAL): el usuario crea una regla manualmente + envia mensaje real al WhatsApp del workspace Somnio + verifica respuesta.
    3. Documentar todo en `13-DEPLOY-NOTES.md`.
  </what-built>
  <how-to-verify>
    **Smoke test 1 — Dropdown del routing-editor (CRITICAL):**

    1. Visit https://morfx.app (o el dominio de prod) y login.
    2. Cambiar al workspace Somnio.
    3. Navegar a `/agentes/routing/editor`.
    4. Click en "Crear regla" o equivalente.
    5. En el campo "Agent ID" o dropdown del event params, verificar que `'somnio-sales-v3-pw-confirmation'` aparece como opcion seleccionable.
    6. NO crear la regla aun — solo verificar que la opcion existe.

    - [ ] Dropdown muestra 'somnio-sales-v3-pw-confirmation' (D-02 PASS)
    - [ ] Dropdown NO muestra (D-02 FAIL — verificar webhook-processor pre-warm + index.ts side-effect register + import en editor page)

    **Smoke test 2 — Manual rule + WhatsApp test (OPCIONAL — usuario decide cuando activar):**

    El usuario decide si activar el agente AHORA o despues. Si decide activar:

    1. **Crear regla** (via UI o SQL — ambos OK):

    Via SQL Editor (template proveido):
    ```sql
    INSERT INTO routing_rules (workspace_id, name, priority, conditions, event, enabled)
    VALUES (
      'a3843b3f-c337-4836-92b5-89c58bb98490',
      'Somnio PW Confirmation routing',
      700,
      jsonb_build_object(
        'all', jsonb_build_array(
          jsonb_build_object('fact', 'activeOrderStageRaw', 'operator', 'in', 'value', ARRAY['NUEVO PAG WEB','FALTA INFO','FALTA CONFIRMAR']),
          jsonb_build_object('fact', 'activeOrderPipeline', 'operator', 'equal', 'value', 'Ventas Somnio Standard')
        )
      ),
      jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'somnio-sales-v3-pw-confirmation')),
      true  -- ENABLED=true para activar
    );
    ```

    Via UI: usar el routing-editor y armar la regla con los 2 condicionales + event route → 'somnio-sales-v3-pw-confirmation' + priority 700.

    2. **Test con WhatsApp real:**
       - Identificar un cliente del workspace Somnio con pedido activo en stage 'NUEVO PAG WEB' / 'FALTA INFO' / 'FALTA CONFIRMAR'.
       - Enviar mensaje desde ese cliente al numero de WhatsApp de Somnio (e.g. "hola").
       - Esperar respuesta.

    3. **Verificar:**
       - El agente respondio (no recompra-v1, no sales-v3).
       - La respuesta es coherente al estado del pedido (e.g. saludo + pregunta de confirmacion si shipping completo, o solicitud de datos si faltantes).
       - Inngest dashboard muestra ejecuciones de `pw-confirmation-preload-and-invoke` (steps 1 + 2 ambos exitosos).
       - `agent_id` en `messages` table apunta a 'somnio-sales-v3-pw-confirmation'.
       - Si el cliente confirma "si" + shipping completo, el pedido se mueve a CONFIRMADO en CRM.

    Si algo no funciona como esperado, DESACTIVAR la regla (`UPDATE routing_rules SET enabled=false WHERE name='Somnio PW Confirmation routing'`) y debug.

    - [ ] Test 2 OK (agente activo, respuestas correctas)
    - [ ] Test 2 SKIP (usuario decide activar despues — agente queda listo, sin trafico)
    - [ ] Test 2 FAIL (regla desactivada, debug pendiente)

    **Crear `13-DEPLOY-NOTES.md`:**

    ```markdown
    # Deploy Notes — somnio-sales-v3-pw-confirmation

    **Wave 7 deploy date:** <YYYY-MM-DD HH:MM America/Bogota>

    ## SQL apply (Task 1)

    - **Migration file:** `supabase/migrations/<ts>_pw_confirmation_template_catalog.sql`
    - **Applied at:** <YYYY-MM-DD HH:MM>
    - **Rows inserted:** <N> (esperado >=18)
    - **Spot-checks:** registro_sanitario INVIMA OK, agendar_pregunta OK, claro_que_si_esperamos OK
    - **GRANTs:** service_role ALL OK, authenticated SELECT OK

    ## Code push (Task 2)

    - **Commit range:** `<first-hash>..<last-hash>` (~N commits across 12 plans)
    - **Vercel deploy:** <URL del deployment>
    - **Deploy status:** Ready
    - **Inngest sync:** function `pw-confirmation-preload-and-invoke` registered, App version <X>

    ## Smoke test 1 — Dropdown (Task 3)

    - **URL tested:** https://morfx.app/agentes/routing/editor
    - **Result:** PASS (dropdown muestra 'somnio-sales-v3-pw-confirmation')

    ## Smoke test 2 — End-to-end (Task 4, opcional)

    - **Activacion:** [ ] Activado AHORA / [ ] DEFERIDO al usuario
    - Si activado:
      - **Routing rule SQL:** <pegar verbatim>
      - **Test cliente:** <numero o nombre>
      - **Pedido test:** <orderId, stage>
      - **Respuestas esperadas vs reales:** <pegar conversacion>
      - **Result:** [ ] PASS / [ ] FAIL (rollback ejecutado)

    ## Documentacion actualizada (Regla 4)

    - [ ] `docs/analysis/04-estado-actual-plataforma.md` actualizado con seccion de PW-confirmation
    - [ ] `docs/architecture/` agrega documentacion del nuevo patron CRM reader bloqueante
    - [ ] `MEMORY.md` (auto-memoria) actualizado con referencia al standalone shipped

    ## LEARNINGS (a documentar al cierre del standalone)

    - <bug encontrados durante deploy>
    - <patrones nuevos que vale la pena documentar>
    - <gaps identificados (e.g. D-13 V1 deferred, agendar logic complex)>

    ## Next steps

    - [ ] Cerrar standalone con `LEARNINGS.md` (Plan 13 SUMMARY apunta aqui)
    - [ ] Actualizar `MEMORY.md` con shipped status
    - [ ] V1.1 (futuro): editar items via AI SDK sub-call (D-13)
    - [ ] V1.1 (futuro): tool real handoff_human (D-21 materialization)
    ```

    Commit del DEPLOY-NOTES + push:
    ```bash
    git add .planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md
    git commit -m "docs(somnio-sales-v3-pw-confirmation): add Wave 7 deploy notes (SQL apply + code push + smoke tests)"
    git push origin main
    ```
  </how-to-verify>
  <acceptance_criteria>
    - Smoke test 1 PASS (dropdown muestra el agente).
    - Smoke test 2 ejecutado o explicitamente DEFERIDO (con razon documentada).
    - `13-DEPLOY-NOTES.md` creado con todos los datos requeridos (timestamps, commit range, deploy URL, smoke results).
    - Si test 2 FAIL, rollback ejecutado (UPDATE routing_rules SET enabled=false).
    - Usuario escribe "deploy verificado" para cerrar Plan 13.
  </acceptance_criteria>
  <resume-signal>
    Escribe "deploy verificado" + status de smoke tests (1 PASS + 2 PASS/SKIP/FAIL) para cerrar Plan 13.

    Si smoke 1 FAIL: PAUSAR y debug — verificar webhook-processor pre-warm import, routing-editor page import, y agentRegistry.register esten todos en producción.

    Si smoke 2 FAIL: rollback ejecutado + investigar Inngest logs + Sentry errors.
  </resume-signal>
</task>

</tasks>

<verification>
- Migracion SQL aplicada en prod.
- Codigo pusheado + Vercel deployed.
- Inngest function registered.
- Dropdown del routing-editor muestra agente.
- (Opcional) regla creada + smoke test e2e exitoso.
- 13-DEPLOY-NOTES.md documenta todo.
</verification>

<success_criteria>
- El agente esta listo para uso productivo.
- El usuario puede activar/desactivar el agente cuando quiera (D-02 — control 100% via UI/SQL routing rules).
- LEARNINGS.md puede empezar a redactarse con lo aprendido durante el standalone.
- Standalone cerrado.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/13-SUMMARY.md` documenting:
- Resumen del deploy (commit range, Vercel URL, Inngest sync timestamp).
- Smoke test 1 result (PASS/FAIL).
- Smoke test 2 result (PASS/SKIP/FAIL + razon).
- Link a `13-DEPLOY-NOTES.md`.
- Confirmacion: standalone listo para LEARNINGS.md.
</output>
</content>
</invoke>
