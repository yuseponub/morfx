---
phase: somnio-recompra-crm-reader
plan: 07
type: execute
wave: 5
depends_on: [01, 02, 03, 04, 05, 06]
files_modified:
  - .claude/rules/agent-scope.md
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false

must_haves:
  truths:
    - "`.claude/rules/agent-scope.md` §CRM Reader Bot incluye entrada `somnio-recompra-v1` como consumidor in-process documentado (D-17)"
    - "La entrada menciona: invocacion via Inngest function `recompra-preload-context`, invoker propagado, workspace isolation, feature flag `platform_config.somnio_recompra_crm_reader_enabled` default false"
    - "`docs/analysis/04-estado-actual-plataforma.md` tiene entrada en seccion somnio-recompra O seccion CRM Bots actualizada con nota del consumer nuevo + referencia al phase standalone"
    - "Usuario ejecuta QA checkpoint: flip flag=true → smoke test 1 conversacion → confirmar observability events visibles → flip flag=false (si smoke OK avanzar a observacion ampliada, si smoke FAIL revert inmediato)"
    - "Usuario decide estado final del flag post-QA (true=rollout activo, false=no-activar, decision documentada en SUMMARY del plan)"
  artifacts:
    - path: ".claude/rules/agent-scope.md"
      provides: "Scope doc actualizado con consumer nuevo (D-17)"
      contains: "somnio-recompra-v1"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Estado actualizado con integracion shipped (Regla 4)"
      contains: "somnio-recompra-crm-reader"
  key_links:
    - from: ".claude/rules/agent-scope.md"
      to: "this phase (somnio-recompra-crm-reader)"
      via: "explicit consumer entry under §CRM Reader Bot"
      pattern: "somnio-recompra-v1"
---

<objective>
Wave 5 — Docs (Regla 4) + Production QA checkpoint (Regla 6). Cerrar el phase con:
1. **Actualizar `.claude/rules/agent-scope.md`** — agregar `somnio-recompra-v1` como consumer in-process documentado del reader (D-17).
2. **Actualizar `docs/analysis/04-estado-actual-plataforma.md`** — registrar que la integracion se shipped (Regla 4: docs + codigo siempre sincronizados).
3. **Checkpoint humano bloqueante de rollout gradual (Regla 6)** — usuario flippea flag=true, corre smoke test de 1 conversacion real (o testing workspace), confirma que los 5 eventos de observability aparecen, decide si dejar activo o rollback.

Purpose: Sin este plan, el codigo tecnico funciona pero (a) otro agente futuro no sabe que somnio-recompra-v1 usa el reader, (b) nunca se valida en produccion que la integracion end-to-end funciona. Regla 6 EXIGE que el flip del flag lo haga el usuario tras verificar — Claude no puede activarlo autonomamente.

**Regla 6 CRITICAL workflow:**
- Estado inicial (tras Plan 06 deploy): flag=false, produccion byte-identical al pre-fase.
- Usuario flippea flag=true mediante SQL en Supabase (Task 3).
- Usuario dispara 1 conversacion real: cliente existente envia un mensaje, bot saluda, usuario envia turno 1 con intencion de compra.
- Usuario verifica en observability dashboard (Phase 42.1) que los 5 eventos aparecen: `crm_reader_dispatched`, `crm_reader_completed`, `crm_context_used`, ...
- Si OK → usuario decide dejarlo activo (opcional — puede pasarlo OFF si quiere rollout escalonado posterior).
- Si FAIL → usuario flippea flag=false inmediatamente via SQL, reporta problema, NO hace rollback de codigo (codigo con flag=false es inerte).

Output: 2 docs actualizados + QA cerrado + SUMMARY final del phase.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — D-17 (scope doc update)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pitfall 9 (Regla 6 rollout gradual), §Project Constraints (Regla 4)
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 5 — Scope Doc + Docs Regla 4
@.claude/rules/agent-scope.md — seccion §"CRM Reader Bot" existente (a extender)
@docs/analysis/04-estado-actual-plataforma.md — doc de estado vigente a actualizar
@CLAUDE.md §Regla 4 (docs always synced) y §Regla 6 (protect production agent)
@.planning/phases/44.1-crm-bots-config-db/44.1-01-SUMMARY.md — pattern Phase 44.1 de docs update post-ship

<interfaces>
<!-- Current .claude/rules/agent-scope.md §CRM Reader Bot (lines 27-41) -->
### CRM Reader Bot (`crm-reader` — API `/api/v1/crm-bots/reader`)
- **PUEDE (solo lectura):**
  - `contacts_search` / `contacts_get` — buscar y leer contactos (tags, custom fields, archivados via flag)
  - `orders_list` / `orders_get` — listar y leer pedidos con items
  - `pipelines_list` / `stages_list` — listar pipelines y etapas del workspace
  - `tags_list` — listar tags y entidades asociadas
- **NO PUEDE:**
  - Mutar NADA (...)
  - Enviar mensajes de WhatsApp
  - Inventar recursos inexistentes (retorna `not_found_in_workspace`)
  - Acceder a otros workspaces (workspace_id viene del header `x-workspace-id` ...)
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` ...
  - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
  - Agent ID registrado: `'crm-reader'` en `agentRegistry`; observability agentId mismo valor; ...

<!-- Target addition to §CRM Reader Bot — new bullet "Consumidores in-process documentados" (D-17) -->
// Adjust per PATTERNS.md §Wave 5 shape.

<!-- QA query for SQL flag flip (Task 3) -->
UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';
-- and rollback if needed
UPDATE platform_config SET value = 'false'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Actualizar `.claude/rules/agent-scope.md` con entrada D-17</name>
  <read_first>
    - .claude/rules/agent-scope.md (entero — entender estructura + seccion §CRM Reader Bot existente)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 5 — Scope Doc (shape exacto de la adicion)
    - .planning/standalone/somnio-recompra-crm-reader/CONTEXT.md §D-17 (requerimientos de la entrada)
  </read_first>
  <action>
    Editar `.claude/rules/agent-scope.md`.

    Localizar el final del bloque `### CRM Reader Bot (\`crm-reader\` — API \`/api/v1/crm-bots/reader\`)` — justo DESPUES del ultimo bullet de `**Validacion:**` y ANTES del siguiente `### CRM Writer Bot` header.

    **Agregar** el siguiente bloque como nuevo bullet top-level al final de la seccion CRM Reader Bot:

    ```markdown
    - **Consumidores in-process documentados:**
      - `somnio-recompra-v1` (Phase standalone `somnio-recompra-crm-reader`, shipped 2026-04-20):
        - Invoca `processReaderMessage(...)` desde la funcion Inngest `recompra-preload-context` (`src/inngest/functions/recompra-preload-context.ts`) al crear sesion nueva de recompra.
        - Invoker propagado: agent pasa `invoker: 'somnio-recompra-v1'` → reader loggea este valor.
        - Workspace isolation: `workspaceId` del event validado contra el workspace del session_state; reader filtra queries por workspace como de costumbre (Regla 3).
        - Feature flag: `platform_config.somnio_recompra_crm_reader_enabled` (default `false`, flip manual via SQL — Regla 6).
        - Escribe `_v3:crm_context` + `_v3:crm_context_status` a `session_state.datos_capturados` via `SessionManager.updateCapturedData` (merge-safe).
        - Observability: emite 5 eventos `pipeline_decision:*` (dispatched, completed, failed, used, missing_after_wait).
        - Timeout: 12s inner AbortController; retries=1; concurrency=1 por sessionId.
        - Consumo HTTP: NO (invocacion in-process dentro del mismo Vercel deployment).
    ```

    **IMPORTANTE:**
    - Mantener el indent del bullet (2 espacios) y los sub-bullets (4 espacios) consistente con el resto del archivo.
    - NO modificar ningun otro contenido de la seccion CRM Reader Bot ni de otras secciones (CRM Writer Bot, AI Automation Builder, Sandbox, etc.).
    - La fecha `shipped 2026-04-20` puede ajustarse a la fecha real si el deploy de Plan 06 ocurrio en otro dia — revisar `git log` del Plan 06 para el timestamp correcto.

    Verificar que no rompimos ningun bullet existente:
    ```bash
    grep -c "^### " .claude/rules/agent-scope.md
    # Debe dar el mismo numero antes y despues del edit (headers no cambian).
    ```
  </action>
  <verify>
    <automated>grep -q "Consumidores in-process documentados:" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "somnio-recompra-v1.*Phase standalone.*somnio-recompra-crm-reader" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "recompra-preload-context" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "somnio_recompra_crm_reader_enabled" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "invoker: 'somnio-recompra-v1'" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "NO (invocacion in-process" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `.claude/rules/agent-scope.md` tiene el nuevo bullet "Consumidores in-process documentados" dentro de §CRM Reader Bot.
    - Menciona: invocacion in-process (no HTTP), invoker propagado, workspace isolation, feature flag name literal, sitio donde escribe el state, eventos observability, timeout/retries, concurrency.
    - NO se modifico otra parte del archivo (headers, Writer Bot, etc.).
    - El numero de headers `###` es el mismo antes y despues.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `docs(agent-scope): register somnio-recompra-v1 as in-process consumer of crm-reader (D-17)`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Actualizar `docs/analysis/04-estado-actual-plataforma.md` (Regla 4)</name>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (entero — entender estructura + ubicacion de secciones sobre Somnio Recompra y/o CRM Bots)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 5 — Docs Regla 4
    - .planning/phases/44.1-crm-bots-config-db/44.1-01-SUMMARY.md (como referencia de patron post-ship)
  </read_first>
  <action>
    Editar `docs/analysis/04-estado-actual-plataforma.md`.

    Buscar la seccion mas relevante al phase. Dos candidatas:
    - **Opcion A:** Si existe seccion sobre **Somnio Recompra** — agregar sub-bullet sobre integracion con crm-reader.
    - **Opcion B:** Si existe seccion sobre **CRM Bots (Phase 44)** — agregar sub-bullet sobre nuevos consumers in-process.
    - **Opcion C (preferida si ambas existen):** Agregar en AMBAS secciones cross-referencia minima.

    Localizar primero con:
    ```bash
    grep -n "Somnio Recompra" docs/analysis/04-estado-actual-plataforma.md
    grep -n "CRM Bots" docs/analysis/04-estado-actual-plataforma.md
    ```

    Segun lo que exista, agregar el siguiente snippet adaptado a la ubicacion:

    **En la seccion Somnio Recompra (si existe) — al final de la subseccion o como ultimo bullet del estado:**

    ```markdown
    - **Integracion CRM Reader (shipped 2026-04-20)**: el agente `somnio-recompra-v1` ahora enriquece la sesion con contexto rico del cliente (ultimo pedido con items, tags activos, total de pedidos, direccion reciente) via invocacion async del agente `crm-reader` a traves de la Inngest function `recompra-preload-context`. El saludo del turno 0 NO espera (usa solo `contact.name` — latencia <200ms preservada); el reader corre en paralelo y escribe `_v3:crm_context` al session state para que el comprehension del turno 1+ lo inyecte. Feature flag `platform_config.somnio_recompra_crm_reader_enabled` (default `false`). Standalone phase: `.planning/standalone/somnio-recompra-crm-reader/`.
    ```

    **En la seccion CRM Bots (si existe) — como adicion al ecosistema:**

    ```markdown
    - **Consumidor in-process del reader: `somnio-recompra-v1`** (shipped 2026-04-20, standalone phase `somnio-recompra-crm-reader`): primera integracion agent-to-agent in-process (no HTTP) consumiendo el reader. Usa Inngest background function `recompra-preload-context` para enriquecer session state antes del turno 1+. Feature-flagged via `platform_config.somnio_recompra_crm_reader_enabled` (default `false`). Scope doc actualizado en `.claude/rules/agent-scope.md`.
    ```

    **Si ninguna de las dos secciones existe** (improbable — el doc tiene tracking de todos los modulos), agregar una nueva entrada cronologica al final del archivo bajo un header tipo "## Fase standalone: somnio-recompra-crm-reader (2026-04-20)" con un resumen similar al de arriba (3-4 lineas).

    **Actualizar tambien el footer timestamp del archivo** — si hay una linea tipo `_Last updated: YYYY-MM-DD_`, actualizar a la fecha actual (Phase 44.1 lo hace per su SUMMARY).

    Verificar:
    ```bash
    grep -qc "somnio-recompra-crm-reader" docs/analysis/04-estado-actual-plataforma.md
    ```
  </action>
  <verify>
    <automated>grep -q "somnio-recompra-crm-reader" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -qE "(crm-reader|CRM Reader).*somnio-recompra" docs/analysis/04-estado-actual-plataforma.md || grep -qE "somnio-recompra.*crm-reader" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "somnio_recompra_crm_reader_enabled" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - `docs/analysis/04-estado-actual-plataforma.md` menciona la integracion shipped con referencia al phase standalone.
    - Menciona el flag literal `somnio_recompra_crm_reader_enabled`.
    - Al menos 1 seccion (Somnio Recompra O CRM Bots O entrada nueva) tiene el update.
    - Footer timestamp actualizado (si aplica al archivo).
    - NO se destruyo ninguna otra seccion del archivo (solo additive).
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `docs(analysis): register somnio-recompra-crm-reader integration shipped (Regla 4)`.
    - Push a Vercel del docs update: `git push origin main` (doc-only commit seguro).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Checkpoint humano — Regla 6 QA rollout gradual del feature flag</name>
  <read_first>
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pitfall 9 (Regla 6 rollout — smoke test en 1 sesion)
    - CLAUDE.md §Regla 6 (proteger agente en produccion)
    - Observability dashboard del proyecto (si existe UI en Phase 42.1 — `/observability/production` o similar)
  </read_first>
  <what-built>
    El pipeline tecnico completo esta deployado y funcional (Plans 01-06). En produccion:
    - Migracion aplicada — row `somnio_recompra_crm_reader_enabled=false` en platform_config.
    - Event schema tipado en inngest/events.ts.
    - Inngest function `recompra-preload-context` registrada en Inngest Cloud (via `/api/inngest`).
    - Dispatch en webhook-processor feature-flagged.
    - Agent poll helper listo.
    - Comprehension-prompt inyecta seccion CRM solo cuando status=ok.
    - Docs actualizados (agent-scope.md + 04-estado-actual-plataforma.md).

    Flag sigue en `false` → produccion byte-identical al pre-fase. Este checkpoint es para que el usuario:
    1. Active el flag temporalmente para validar que la integracion funciona end-to-end.
    2. Dispare 1 conversacion real con un contacto cliente.
    3. Observe que los 5 eventos aparecen en observability.
    4. Decida el estado final del flag: ON (rollout activo), OFF (rollback, problema detectado), o mantener OFF para rollout escalonado posterior.

    **PROHIBIDO** que Claude haga el flip del flag. Solo el usuario autenticado contra Supabase Studio puede hacerlo — Regla 6.
  </what-built>
  <how-to-verify>
    **Paso 1 — Confirmar estado inicial (flag=false):**

    Abrir Supabase SQL Editor del proyecto de produccion y correr:

    ```sql
    SELECT key, value FROM platform_config WHERE key = 'somnio_recompra_crm_reader_enabled';
    ```

    Expected: 1 fila, `value = false`.

    Confirmar en logs de Vercel/Inngest dashboard que NO hay runs recientes de la function `recompra-preload-context` (flag off → zero dispatches por Plan 04 gate).

    **Paso 2 — Flippear flag a true:**

    En Supabase SQL Editor:

    ```sql
    UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';
    ```

    Esperar ~30 segundos (TTL del cache per-lambda de `getPlatformConfig`).

    **Paso 3 — Smoke test con 1 conversacion real:**

    Opcion A (preferida): usar un workspace de testing o el workspace del usuario con un contacto dummy marcado is_client=true.
    Opcion B: esperar a que llegue un cliente real (menos control, pero mas realista).

    1. Enviar un mensaje inicial ("hola") desde el lado del cliente (WhatsApp).
    2. Confirmar que el bot saluda con el nombre precargado — el saludo debe salir en <2 segundos (turno 0 NO espera al reader, D-02).
    3. Esperar 3-5 segundos (tiempo para que la Inngest function termine).
    4. Enviar un segundo mensaje con intencion de compra ("quiero llevar 2 frascos" o similar).
    5. Confirmar que el bot responde normalmente.

    **Paso 4 — Validar observability:**

    Opcion A — Via Supabase SQL directo (siempre funciona):

    ```sql
    -- Ver los ultimos eventos pipeline_decision emitidos para somnio-recompra-v1
    SELECT
      started_at,
      agent_id,
      (events) AS events_array
    FROM agent_observability_turns
    WHERE agent_id = 'somnio-recompra-v1'
      AND started_at > NOW() - INTERVAL '10 minutes'
    ORDER BY started_at DESC
    LIMIT 5;

    -- Buscar eventos de la Inngest function (agent_id = 'crm-reader' via conversationId recompra-preload-*)
    SELECT
      started_at,
      conversation_id,
      (events) AS events_array
    FROM agent_observability_turns
    WHERE conversation_id LIKE 'recompra-preload-%'
      AND started_at > NOW() - INTERVAL '10 minutes'
    ORDER BY started_at DESC
    LIMIT 5;
    ```

    Expected — debes ver estos 5 eventos (dispersos entre los 2 queries):
    - `pipeline_decision:crm_reader_dispatched` (en webhook-processor, agent=somnio-recompra-v1)
    - `pipeline_decision:crm_reader_completed` (en Inngest function, agent=crm-reader wrapped)
    - `pipeline_decision:crm_context_used` (en agent Plan 05, turno 1+)
    - (Opcional si timing se alineo mal) `pipeline_decision:crm_context_missing_after_wait` — solo si el reader tardo >3s y el cliente escribio rapido
    - (NO deberia haber) `pipeline_decision:crm_reader_failed` — si aparece, algo salio mal

    Opcion B — Via UI de Observability (si Phase 42.1 esta activa):
    - Abrir https://morfx.app/observability/production (o URL equivalente).
    - Filtrar por agent=`somnio-recompra-v1` ultimos 10min.
    - Expandir el turn del saludo + turn de compra.
    - Confirmar eventos listados.

    **Paso 5 — Validar persistencia:**

    ```sql
    -- Ver el session state de la conversacion de testing, confirmar que crm_context se persistio
    SELECT
      id,
      datos_capturados->>'_v3:crm_context' AS crm_context_text,
      datos_capturados->>'_v3:crm_context_status' AS crm_context_status,
      updated_at
    FROM session_state
    WHERE workspace_id = '<tu workspace id>'
      AND conversation_id = '<id de la conversacion de testing>'
    ORDER BY updated_at DESC
    LIMIT 1;
    ```

    Expected:
    - `crm_context_status = 'ok'` (o `'empty'` si el contacto no tenia pedidos/tags/etc.)
    - `crm_context_text` contiene parrafo generado por el reader con los 4 puntos de D-08 (ultimo pedido, tags, total pedidos, direccion/ciudad).
    - NO `null`, NO cadena vacia (si status=ok).

    **Paso 6 — Decidir estado final del flag:**

    Tres caminos posibles segun el resultado del smoke:

    **Camino A — TODO OK (eventos + persistencia + saludo rapido + comprehension coherente):**
    - Decidir si mantener ON (rollout activo) o volver a OFF temporalmente (observation window).
    - Si ON: la feature empieza a enriquecer todas las sesiones nuevas de recompra automaticamente.
    - Si OFF post-smoke: fase cerrada con capability "disponible pero desactivada", flag se activa cuando se decida full rollout (ej. en una ventana de bajo trafico).

    **Camino B — SMOKE FAIL parcial (ej. events aparecen pero saludo tardo 4s):**
    - Flippear flag=false INMEDIATAMENTE:
      ```sql
      UPDATE platform_config SET value = 'false'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';
      ```
    - Documentar que observaste.
    - El codigo sigue deployado pero inerte — no requiere revert de git.
    - Abrir debug fase para investigar (ej. "feature flag cache mayor de lo esperado", "dispatch bloqueando por mas que no deberia").

    **Camino C — SMOKE FAIL total (ej. bot rompio, 500 errors, saludo no salio):**
    - Flippear flag=false INMEDIATAMENTE (mismo SQL de arriba).
    - Considerar si hay que hacer rollback de codigo (revert de commits del phase) — pero esto es ULTIMO recurso. El codigo con flag=false debe ser inerte; si no lo es, hay un bug que invalidar flag default=false.
    - Reportar al equipo.

    **Paso 7 — Cerrar el checkpoint:**

    Escribir en el resume-signal el estado final:
    - "smoke OK, flag=true" — integracion activa en produccion.
    - "smoke OK, flag=false" — integracion validada, desactivada por decision de rollout posterior.
    - "smoke FAIL parcial: <descripcion>, flag=false" — revisar y planificar siguiente iteracion.
    - "smoke FAIL total: <descripcion>, flag=false + rollback de <commits>" — emergency state, requiere follow-up inmediato.
  </how-to-verify>
  <acceptance_criteria>
    - Usuario confirma haber flippeado flag=true y ejecutado smoke test en 1 conversacion real.
    - Usuario reporta estado de los 5 eventos de observability (cuales aparecieron, cuales no).
    - Usuario reporta estado del session_state.datos_capturados._v3:crm_context + _v3:crm_context_status post-smoke.
    - Usuario decide y comunica el estado final del flag (true / false / true-temp / false-fix-needed).
    - Si hubo flip a true y smoke FAIL → flag revertido a false antes de cerrar el checkpoint.
    - Regla 6 respetada: ningun flip de Claude, todos los flips via usuario en Supabase Studio.
  </acceptance_criteria>
  <resume-signal>
    Escribe uno de:
    - `smoke OK, flag=true` → integracion shipped y activa.
    - `smoke OK, flag=false` → integracion validada, flag desactivado para rollout escalonado posterior (documenta en SUMMARY).
    - `smoke FAIL parcial: <descripcion>` → flag=false, documenta observaciones, se crea fase de debug si aplica.
    - `smoke FAIL total: <descripcion>` → flag=false + descripcion del problema. Claude decide si requiere hotfix inmediato o nueva fase.
    Si surge un caso no cubierto, describe libremente — el planner de follow-up entiende contexto.
  </resume-signal>
</task>

</tasks>

<verification>
- `.claude/rules/agent-scope.md` tiene el nuevo bullet "Consumidores in-process documentados" bajo §CRM Reader Bot (D-17 cumplido).
- `docs/analysis/04-estado-actual-plataforma.md` referencia la fase y el flag (Regla 4).
- Checkpoint humano ejecutado con smoke test + observability check + decision final del flag.
- Si smoke OK, 5 eventos de D-16 aparecen en dashboards.
- Session state tiene `_v3:crm_context` + `_v3:crm_context_status` post-smoke (si flag estuvo en true al menos una vez).
- Estado final del flag documentado en resume-signal + SUMMARY.
- Regla 6 respetada: ningun flip autonomo de Claude.
</verification>

<success_criteria>
- Phase standalone CLOSED:
  - 17 decisiones (D-01 a D-17) implementadas y trazables a commits.
  - 9 pitfalls de RESEARCH.md mitigados (verificable grep post-ejecucion).
  - 5 eventos de observability emitiendo (D-16).
  - Feature flag funciona como kill-switch real via SQL.
  - Scope doc actualizado.
  - Docs de estado actualizados.
  - Smoke validado en produccion (o decision explicita de posponer activacion).
- Regla 6 intacta: bot `somnio-recompra-v1` sigue sirviendo clientes sin regresion detectable.
- LEARNINGS.md creado en el paso post-phase (fuera del scope de este plan, lo hace `/gsd:verify-work`).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/07-SUMMARY.md` documenting:
- Commit hashes de Task 1 (agent-scope) y Task 2 (docs/analysis).
- Rango de commits pusheados a Vercel (deben estar ya todos post Plan 06, pero Task 2 pusheo el doc update final).
- Resumen textual del checkpoint Task 3:
  - Estado flag pre-flip (debia ser false).
  - SQL ejecutado (incluyendo timestamps del flip a true + eventual flip a false).
  - Conversacion de smoke test: workspace_id, conversation_id, contact_id (anonymizados si aplica).
  - Output de los 3 queries SQL (eventos recompra agent + eventos Inngest function + session_state).
  - Los 5 eventos observados: sus timestamps + si aparecieron o no.
  - Contenido abreviado del `_v3:crm_context` persistido (primeras 150 chars).
  - DECISION FINAL del flag: true / false / otro + rationale.
- Si smoke FAIL: descripcion de lo observado + nueva fase o debug a abrir.
- Cierre textual: "Phase somnio-recompra-crm-reader CLOSED (7/7 plans). Próximo paso: `/gsd:verify-work` + LEARNINGS.md consolidation."
</output>
