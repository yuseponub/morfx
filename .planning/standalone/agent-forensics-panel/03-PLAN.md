---
phase: agent-forensics-panel
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/lib/agent-specs/README.md
  - src/lib/agent-specs/somnio-sales-v3.md
  - src/lib/agent-specs/somnio-recompra-v1.md
  - src/lib/agent-specs/godentist.md
  - src/lib/agent-forensics/load-agent-spec.ts
  - src/lib/agent-forensics/__tests__/load-agent-spec.test.ts
  - src/lib/agent-forensics/load-session-snapshot.ts
  - src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts
  - src/app/actions/observability.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx
autonomous: true

decisions_addressed: [D-01, D-06, D-07]

must_haves:
  truths:
    - "4 archivos markdown creados en `src/lib/agent-specs/`: README.md (edition guide + schema scope) + 3 spec files (somnio-sales-v3.md, somnio-recompra-v1.md, godentist.md) siguiendo el template de RESEARCH.md §Open Items §1 (lineas 866-960)"
    - "Cada spec file incluye: header (agent ID + runtime module + last updated), Scope (PUEDE/NO PUEDE from agent-scope.md), Arquitectura (pipeline + archivos clave), Intents habilitados, Comportamiento esperado por intent (con pointers file:line), Transiciones clave, Contratos con otros modulos, Observability events emitidos (tabla categoria|label|cuando|archivo), Tests que codifican contrato, Rebuild notes"
    - "Spec de somnio-recompra-v1 consolida: agent-scope.md §Somnio Recompra Agent + standalone somnio-recompra-template-catalog + standalone somnio-recompra-crm-reader + response-track.ts TEMPLATE_LOOKUP_AGENT_ID + __tests__/"
    - "Spec de somnio-sales-v3 consolida: agent-scope.md scope section (si existe, o derivar de constantes/transitions) + src/lib/agents/somnio-v3/ + retoma/ofi-inter patterns"
    - "Spec de godentist consolida: agent-scope.md (si tiene entry) + src/lib/agents/godentist/ + horarios por sede referencia desde godentist_horarios_sedes"
    - "Funcion `loadAgentSpec(agentId)` en `src/lib/agent-forensics/load-agent-spec.ts` — resuelve via `fs.readFile(path.join(process.cwd(), 'src/lib/agent-specs', '<id>.md'))` + whitelist 3 IDs + throws 'Unknown agent spec' para ids fuera del whitelist (D-07)"
    - "Funcion `loadSessionSnapshot(conversationId)` en `src/lib/agent-forensics/load-session-snapshot.ts` — usa `createRawAdminClient()` (anti-recursion), join `agent_sessions` on `conversation_id` + `is_active=true` + `order by created_at desc limit 1`, devuelve raw JSON sin proyeccion (D-06 no filtering)"
    - "Server action `getSessionSnapshotAction(conversationId)` en `src/app/actions/observability.ts` — super-user gated + wraps loadSessionSnapshot, returns `{ snapshot: unknown; sessionId: string | null }`"
    - "Componente `session-snapshot.tsx` usa READ-ONLY `@uiw/react-json-view` con theme light/dark (next-themes pattern) + hand-rolled fetch + fallback 'no session' cuando snapshot es null"
    - "`forensics-tab.tsx` reemplaza el placeholder de snapshot con `<SessionSnapshot conversationId={conversationId} />`"
    - "Tests verde: `load-agent-spec.test.ts` (path resolution + unknown throws) + `load-session-snapshot.test.ts` (raw admin client mock + no projection shape)"
  artifacts:
    - path: "src/lib/agent-specs/README.md"
      provides: "Edition guide — como editar specs, scope, relacion con auditor (D-07)"
      contains: "REGLA DE SCOPE"
    - path: "src/lib/agent-specs/somnio-sales-v3.md"
      provides: "Spec del bot somnio-sales-v3 consolidada"
      contains: "Agent ID"
    - path: "src/lib/agent-specs/somnio-recompra-v1.md"
      provides: "Spec del bot somnio-recompra-v1 consolidada desde 4 fuentes"
      contains: "somnio-recompra-v1"
    - path: "src/lib/agent-specs/godentist.md"
      provides: "Spec del bot godentist"
      contains: "godentist"
    - path: "src/lib/agent-forensics/load-agent-spec.ts"
      provides: "Async file loader con whitelist + sin cache en module scope (Vercel lambda cold-start)"
      contains: "readFile"
    - path: "src/lib/agent-forensics/load-session-snapshot.ts"
      provides: "Async Supabase reader del session_state via createRawAdminClient + join"
      contains: "loadSessionSnapshot"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx"
      provides: "React component con @uiw/react-json-view READ-ONLY + theme + fetch"
      contains: "SessionSnapshot"
  key_links:
    - from: "loadAgentSpec function"
      to: "src/lib/agent-specs/<id>.md"
      via: "fs.readFile(path.join(process.cwd(), 'src/lib/agent-specs', '<id>.md'))"
      pattern: "path\\.join\\(process\\.cwd"
    - from: "loadSessionSnapshot function"
      to: "session_state Supabase table"
      via: "createRawAdminClient().from('agent_sessions').select('id').eq('conversation_id', id)...then from('session_state').select('*')"
      pattern: "createRawAdminClient"
    - from: "SessionSnapshot component"
      to: "getSessionSnapshotAction server action"
      via: "hand-rolled useEffect + mountedRef pattern"
      pattern: "getSessionSnapshotAction"
    - from: "forensics-tab.tsx snapshot area"
      to: "<SessionSnapshot conversationId />"
      via: "replaces the placeholder div"
      pattern: "<SessionSnapshot"
    - from: "next.config.ts outputFileTracingIncludes"
      to: "3 .md files created in this plan"
      via: "Plan 01 Task 8 pre-registered the glob"
      pattern: "src/lib/agent-specs"
---

<objective>
Wave 1 — Panel forensics tab #2: specs per-bot + session snapshot. Crea los 3 archivos markdown que el auditor va a leer en Plan 04 (consolidando fuentes fragmentadas en `.claude/rules/agent-scope.md`, standalone phases previas, response-track.ts, __tests__/), el loader pure `loadAgentSpec`, el loader de Supabase `loadSessionSnapshot`, el componente React que renderiza el snapshot JSON con `@uiw/react-json-view`, y conecta el componente al placeholder que Plan 02 dejo en `forensics-tab.tsx`.

Purpose: (a) D-07 — single source of truth por bot, user-editable, fuente para el auditor. (b) D-06 — full snapshot sin filtering del session_state. (c) D-01 — 3 bots en scope: somnio-sales-v3 + somnio-recompra-v1 + godentist.

Output: 4 archivos markdown nuevos + 2 TS lib modules + 2 test files + 1 React component + 2 archivos modificados (observability.ts extendida, forensics-tab.tsx con SessionSnapshot conectado).

**Dependency:** Plan 01 DEBE estar shipped (TurnSummary.respondingAgentId + next.config outputFileTracingIncludes listos). Plan 02 DEBE estar shipped (forensics-tab.tsx con placeholder existe + `observability.ts` con `getForensicsViewAction`). Plan 03 es Wave 2 — depende explicitamente de ambos (Plan 02 crea los archivos `forensics-tab.tsx` y extiende `observability.ts` que este plan modifica de nuevo).

**NO toca comportamiento de los bots** (Regla 6). Solo crea docs + read-only layer.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-forensics-panel/CONTEXT.md — Q7 (spec location decision → D-07), Q6 (snapshot scope → D-06)
@.planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md — D-01, D-06, D-07 locked
@.planning/standalone/agent-forensics-panel/RESEARCH.md §Open Items §1 (template verbatim lineas 866-960 — spec structure), §Pitfall 3 (outputFileTracingIncludes), §Pitfall 6 (PII in snapshot — documentar), §Code Examples (load-agent-spec verbatim lineas 726-751)
@.planning/standalone/agent-forensics-panel/PATTERNS.md §agent-specs NEW (388-418), §load-agent-spec.ts NEW (447-468), §load-session-snapshot.ts NEW (471-501), §session-snapshot.tsx NEW (785-811), §No Analog Found (load-agent-spec.ts)
@.claude/rules/agent-scope.md — source principal para scope PUEDE/NO PUEDE de los 3 bots
@.planning/standalone/somnio-recompra-template-catalog/ — fuente para spec recompra (catalog + transitions)
@.planning/standalone/somnio-recompra-crm-reader/ — contrato con crm-reader
@src/lib/agents/somnio-v3/ — source para spec sales-v3
@src/lib/agents/somnio-recompra/ — source para spec recompra (response-track.ts, transitions.ts, constants.ts, __tests__/)
@src/lib/agents/godentist/ — source para spec godentist
@src/lib/observability/repository.ts — patron createRawAdminClient (lineas 1-17, 67)
@src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx — analog para @uiw/react-json-view usage (lineas 14-27)
@src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx (POST Plan 02) — tiene el placeholder a reemplazar

<interfaces>
<!-- loadAgentSpec signature -->
export async function loadAgentSpec(agentId: string): Promise<string>
// Valid IDs: 'somnio-sales-v3' | 'somnio-recompra-v1' | 'godentist'
// Throws 'Unknown agent spec: <id>' for unknown.

<!-- loadSessionSnapshot signature -->
export async function loadSessionSnapshot(conversationId: string): Promise<{
  snapshot: unknown  // raw JSON from session_state (D-06 no filtering)
  sessionId: string | null  // null if no active session found
}>

<!-- getSessionSnapshotAction signature (added to observability.ts) -->
export async function getSessionSnapshotAction(
  conversationId: string,
): Promise<{ snapshot: unknown; sessionId: string | null }>

<!-- session_state schema reference (VERIFIED from session-manager.ts:181) -->
CREATE TABLE session_state (
  session_id uuid PK,
  datos_capturados jsonb,
  -- ...
)

<!-- agent_sessions schema reference -->
-- Fields relevant: id, conversation_id, agent_id, is_active, created_at
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1a: Crear `src/lib/agent-specs/README.md` + `somnio-recompra-v1.md` (spec mas completo — base del template)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Open Items §1 lineas 866-960 (template MARKDOWN verbatim a seguir)
    - .claude/rules/agent-scope.md (§Somnio Recompra Agent lineas ~115-135)
    - src/lib/agents/somnio-recompra/response-track.ts (TEMPLATE_LOOKUP_AGENT_ID line ~36-39, transitions map, branches de salesAction)
    - src/lib/agents/somnio-recompra/constants.ts (INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP, RECOMPRA_INTENTS)
    - src/lib/agents/somnio-recompra/__tests__/ (4 test suites con 32 tests)
    - src/lib/agents/somnio-recompra/sales-track.ts + comprehension.ts
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md
    - .planning/standalone/somnio-recompra-crm-reader/CONTEXT.md
  </read_first>
  <action>
    **Paso 1 — Crear `src/lib/agent-specs/README.md`:**

    ```markdown
    # Agent Specs — Single Source of Truth por Bot

    Este directorio contiene la **spec de comportamiento** de cada bot en scope del panel forensics.

    ## Bots cubiertos

    | Agent ID (observability) | File | Runtime module |
    |--------------------------|------|----------------|
    | `somnio-sales-v3`        | `somnio-sales-v3.md`    | `src/lib/agents/somnio-v3/` |
    | `somnio-recompra-v1`     | `somnio-recompra-v1.md` | `src/lib/agents/somnio-recompra/` |
    | `godentist`              | `godentist.md`          | `src/lib/agents/godentist/` |

    ## Cuando editar un spec

    Cada vez que el COMPORTAMIENTO ESPERADO de un bot cambia (no cuando cambia la implementacion — eso se captura en los tests). Esto es la version "human readable" que:

    1. **El auditor AI (Plan 04 de `agent-forensics-panel`)** lee en tiempo real via `loadAgentSpec(agentId)` para contrastar con lo que efectivamente ocurrio en un turn.
    2. **El usuario** lee cuando revisa un turn en el panel forensics y quiere recordar "que deberia haber hecho este bot?".

    ## Reglas de edicion

    - **NO es autogenerado.** Se mantiene a mano.
    - **Pointers `file:line` deben ser reales.** Si mueves codigo, actualiza los pointers. El auditor cita literalmente.
    - **No borrar secciones.** Si una seccion no aplica a un bot, poner `(N/A)`.
    - **Consolida fuentes.** Si info esta en `.claude/rules/agent-scope.md` + un `.planning/standalone/` + response-track.ts — copia aqui la version canonica. Este es el single-source-of-truth.

    ## Bundling en Vercel

    Los archivos `.md` de este directorio NO son imports de TypeScript. Se leen en runtime via `fs.readFile` dentro de `/api/agent-forensics/audit`.

    Para que Vercel los incluya en el lambda, `next.config.ts` tiene:

    ```typescript
    outputFileTracingIncludes: {
      '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
    }
    ```

    Si agregas un bot nuevo (un 4to spec file), el glob ya lo captura — no hay que tocar config.

    ## Relacion con `.claude/rules/agent-scope.md`

    `.claude/rules/agent-scope.md` es autoritative para Claude Code (planning time). Los spec files aqui son autoritative para el auditor RUNTIME. Deben mantenerse alineados; si se divergen, esta es la version de verdad para el bot en produccion.

    ## Pitfall 6 — PII

    El auditor recibe el spec + el snapshot completo del session_state (D-06). El snapshot puede contener phone, name, address. Esto va al mismo API de Anthropic que ya procesa data en produccion para los agentes; no hay nuevo vector de fuga. Documentado.
    ```

    **Paso 2 — Crear `src/lib/agent-specs/somnio-recompra-v1.md`** (el mas completo, consolida 4 fuentes):

    Leer fuentes primero:
    ```bash
    cat .claude/rules/agent-scope.md | grep -A 50 "Somnio Recompra Agent"
    cat src/lib/agents/somnio-recompra/constants.ts
    cat src/lib/agents/somnio-recompra/response-track.ts | head -50
    ls .planning/standalone/somnio-recompra-template-catalog/
    ls .planning/standalone/somnio-recompra-crm-reader/
    ls src/lib/agents/somnio-recompra/__tests__/
    ```

    Redactar siguiendo el template de RESEARCH.md §Open Items §1 lineas 866-960. Estructura requerida (rellenar con info real de las fuentes):

    ```markdown
    # Somnio Recompra v1

    **Agent ID:** `somnio-recompra-v1`
    **Runtime module:** `src/lib/agents/somnio-recompra/`
    **Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
    **Last updated:** 2026-04-24 (Plan 03 agent-forensics-panel)

    ## Scope

    ### PUEDE
    - Responder a clientes que reagendan/recompran ELIXIR DEL SUEÑO via WhatsApp inbound.
    - Emitir templates del catalogo propio bajo `agent_id='somnio-recompra-v1'`:
      - **INFORMATIONAL_INTENTS:** saludo, precio, promociones, pago, envio, ubicacion, contraindicaciones, dependencia, tiempo_entrega, registro_sanitario
      - **Sales actions:** resumen_*, confirmacion_orden_*, preguntar_direccion_recompra, pendiente_*, no_interesa, rechazar, retoma_inicial
    - Crear pedido en CRM Somnio via `crear_orden` sales action (llama domain `orders.createOrder`).
    - Preguntar confirmacion de direccion antes de promos cuando el cliente dice "quiero comprar".

    ### NO PUEDE
    - Compartir catalogo con `somnio-sales-v3`. Catalogo independiente bajo `agent_id='somnio-recompra-v1'` desde 2026-04-23 (phase `somnio-recompra-template-catalog`).
    - Auto-disparar promos en saludo inicial. `saludo` cae al fallback null de `resolveTransition` y response-track lo maneja como informational (texto CORE + imagen ELIXIR COMPLEMENTARIA).
    - Acceder a templates de otros agentes (sales-v3, godentist).
    - Escribir en tablas fuera del workspace Somnio.

    ## Arquitectura

    ### Pipeline (orden esperado en un turn)
    1. **Preload context (async):** Inngest `recompra-preload-context` invoca `crm-reader` via agent-to-agent, popula `session_state.datos_capturados._v3:crm_context`.
    2. **Comprehension (Haiku):** intent + confidence.
    3. **Guards (R0 low-confidence, R1 escape intents).**
    4. **Sales Track (state machine):** decide ACCION (ofrecer_promos, preguntar_direccion, crear_orden, etc.).
    5. **Response Track (template engine):** decide QUE DECIR segun TEMPLATE_LOOKUP_AGENT_ID.
    6. **Block composition:** mensaje final (texto + imagen optional).

    ### Archivos clave
    - `src/lib/agents/somnio-recompra/response-track.ts` — `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` (line ~36-39). Branches: preguntar_direccion datosCriticos line ~336-361.
    - `src/lib/agents/somnio-recompra/sales-track.ts` — state machine de acciones.
    - `src/lib/agents/somnio-recompra/transitions.ts` — `resolveTransition(fromIntent, action, state, gates)`.
    - `src/lib/agents/somnio-recompra/constants.ts` — `INFORMATIONAL_INTENTS` (line ~67-71), `RECOMPRA_INTENTS` (line ~18-50), `ACTION_TEMPLATE_MAP` (line ~74-79).
    - `src/lib/agents/somnio-recompra/__tests__/` — 4 test suites (32 tests):
      - `transitions.test.ts` — D-03/D-04/D-05/D-06
      - `response-track.test.ts` — D-12 direccion_completa concat
      - `crm-context-poll.test.ts` — contrato crm-reader
      - `comprehension-prompt.test.ts` — prompt shape

    ## Intents habilitados

    ### Informational (se mapean a templates directos, sin accion de sales)
    `saludo`, `precio`, `promociones`, `pago`, `envio`, `ubicacion`, `contraindicaciones`, `dependencia`, `tiempo_entrega`, `registro_sanitario`

    ### Acciones de sales (mutan estado / crean pedido)
    `ofrecer_promos`, `preguntar_direccion_recompra`, `resumen_1x`/`2x`/`3x`, `confirmacion_orden_same_day`/`transportadora`, `pendiente_promo`/`confirmacion`, `no_interesa`, `rechazar`, `retoma_inicial`, `crear_orden`

    ## Comportamiento esperado por intent

    ### `saludo`
    - **Cuando:** primer mensaje del cliente o tras timer de silencio.
    - **Que responde:** template `saludo` (texto CORE `{{nombre_saludo}} 😊` + imagen ELIXIR COMPLEMENTARIA `URL|Deseas adquirir tu ELIXIR DEL SUEÑO?`).
    - **NO dispara promos automaticamente.** `resolveTransition('initial', 'saludo', ...)` devuelve `null` (D-05 locked en phase somnio-recompra-template-catalog).
    - **Archivo:** `response-track.ts` (branch informational).

    ### `precio` / `pago` / `envio` / `ubicacion` / `contraindicaciones` / `dependencia`
    - **Cuando:** usuario pregunta por el tema.
    - **Que responde:** template correspondiente bajo agent_id='somnio-recompra-v1'.
    - **Archivo:** `response-track.ts` (branch informational).

    ### `promociones` (post quiero-comprar)
    - **Cuando:** usuario dice "quiero comprar" o equivalente tras `preguntar_direccion_recompra`.
    - **Que responde:** template `ofrecer_promos` (3 opciones: 1x, 2x, 3x).
    - **Pre-condicion:** `{{direccion_completa}}` debe estar disponible (D-12 — `[direccion, ciudad, departamento].filter(Boolean).join(', ')`).
    - **Archivo:** `response-track.ts:~346` (branch preguntar_direccion).

    ### `tiempo_entrega`
    - **Cuando:** usuario pregunta "cuando llega".
    - **Que responde:** uno de los 5 templates segun ciudad resuelta: `tiempo_entrega_same_day`, `next_day`, `1_3_days`, `2_4_days`, `sin_ciudad`.
    - **Archivo:** `response-track.ts` (branch tiempo_entrega con `resolveTiempoEntregaVariant`).

    ## Transiciones clave

    | Desde intent | Accion | A intent | Condicion |
    |--------------|--------|----------|-----------|
    | saludo | (null fallback) | — | primer contacto, no dispara promos (D-05) |
    | precio | ofrecer_promos | promociones | cliente dice "quiero comprar" |
    | preguntar_direccion_recompra | (confirma) | promociones | direccion confirmada |

    **Archivo:** `transitions.ts`.

    ## Contratos con otros modulos

    - **CRM Reader** (`crm-reader` API `/api/v1/crm-bots/reader`):
      - Upstream: Inngest function `recompra-preload-context` invoca `processReaderMessage(...)` cuando se crea session_state nueva de recompra.
      - Dispatch pasa `invoker: 'somnio-recompra-v1'`.
      - Escribe `_v3:crm_context` + `_v3:crm_context_status` a `session_state.datos_capturados`.
      - Feature flag: `platform_config.somnio_recompra_crm_reader_enabled` (default `false`).
    - **Templates:** todas las llamadas pasan por `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` en `response-track.ts:36`. Mutar esta constante = apuntar a otro catalogo (regresion commit `cdc06d9` revertido).
    - **Domain layer:** `orders.createOrder(...)` via `crear_orden` action — pasa por `src/lib/domain/orders/`.

    ## Observability events emitidos

    | Categoria | Label | Cuando | Archivo |
    |-----------|-------|--------|---------|
    | `pipeline_decision` | `recompra_routed` | Entry a recompra branch (via webhook-processor is_client check) | `webhook-processor.ts:192` |
    | `pipeline_decision` | `crm_reader_dispatched` | Inngest function dispara | `recompra-preload-context.ts` |
    | `pipeline_decision` | `crm_reader_completed` | Reader termino OK | same |
    | `pipeline_decision` | `crm_reader_failed` | Reader fallo/timeout | same |
    | `pipeline_decision` | `crm_context_used` | Recompra usa context preloaded | runtime |
    | `pipeline_decision` | `crm_context_missing_after_wait` | Recompra arranca sin context | runtime |
    | `comprehension` | `result` | Tras Haiku | comprehension.ts |
    | `guard` | `blocked` / `passed` | Tras R0/R1 | agent.ts |
    | `pipeline_decision` | `sales_track_result` | Tras sales track | sales-track.ts |
    | `template_selection` | `block_composed` | Tras response track | response-track.ts |

    ## Tests que codifican el contrato

    `src/lib/agents/somnio-recompra/__tests__/`:
    - `transitions.test.ts` — 8+ tests cubriendo D-03 (catalogo independiente), D-04 (direccion antes de promos), D-05 (saludo fallback null), D-06 (registro_sanitario)
    - `response-track.test.ts` — 8+ tests D-12 (direccion_completa concat con departamento)
    - `crm-context-poll.test.ts` — contrato con crm-reader
    - `comprehension-prompt.test.ts` — shape del prompt

    ## Rebuild notes para el auditor

    Cuando diagnostiques este bot:
    1. Usa los archivos:lineas citados arriba como pointers validos.
    2. NO inventes archivos/lineas.
    3. Si un comportamiento no esta documentado aqui, di "no hay spec para esto" en vez de inventar.
    4. Eventos de `pipeline_decision · recompra_routed` + responding_agent_id=`somnio-recompra-v1` son la evidencia autoritativa del routing.

    ## Cambios recientes
    - **2026-04-24:** Creado como parte de `agent-forensics-panel` Plan 03.
    - **2026-04-22/23:** phase `somnio-recompra-template-catalog` shipped (5 plans, 22 intents catalog + 3 templates nuevos saludo/preguntar_direccion_recompra/registro_sanitario).
    - **2026-04-21:** phase `somnio-recompra-crm-reader` shipped (Inngest preload context).
    ```

    **Paso 3 — Commit atomico (Task 1a):**
    ```bash
    git add src/lib/agent-specs/README.md src/lib/agent-specs/somnio-recompra-v1.md
    git commit -m "docs(agent-specs): add README + somnio-recompra-v1 spec

Plan 03 Task 1a agent-forensics-panel (D-01, D-07). README establece scope + bundling + edition rules. somnio-recompra-v1.md consolida 4 fuentes (agent-scope.md + 2 standalone phases + runtime modules + __tests__/).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-specs/README.md</automated>
    <automated>test -f src/lib/agent-specs/somnio-recompra-v1.md</automated>
    <automated>grep -q "Agent ID" src/lib/agent-specs/somnio-recompra-v1.md</automated>
    <automated>grep -q "Scope" src/lib/agent-specs/somnio-recompra-v1.md</automated>
    <automated>grep -q "Comportamiento esperado" src/lib/agent-specs/somnio-recompra-v1.md</automated>
    <automated>grep -q "Observability events" src/lib/agent-specs/somnio-recompra-v1.md</automated>
    <automated>grep -q "somnio-recompra-v1" src/lib/agent-specs/somnio-recompra-v1.md</automated>
    <automated>wc -l src/lib/agent-specs/somnio-recompra-v1.md | awk '{print $1}' | xargs test 100 -lt</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agent-specs/README.md` creado con scope, edition rules, bundling via outputFileTracingIncludes, relacion con agent-scope.md.
    - `src/lib/agent-specs/somnio-recompra-v1.md` creado con >100 lineas, consolida 4 fuentes, contiene: Agent ID, Scope PUEDE/NO PUEDE, Arquitectura pipeline + archivos clave con pointers, Intents habilitados, Comportamiento por intent con pointers file:line, Transiciones clave, Contratos con crm-reader + domain + templates, Observability events (tabla), Tests, Rebuild notes, Cambios recientes.
    - Commit local.
  </acceptance_criteria>
  <done>
    - README + recompra spec listos. El template canonica para sales-v3 y godentist queda establecido para Task 1b.
  </done>
</task>

<task type="auto">
  <name>Task 1b: Crear `src/lib/agent-specs/somnio-sales-v3.md` + `godentist.md` (siguiendo el template de Task 1a)</name>
  <read_first>
    - src/lib/agent-specs/somnio-recompra-v1.md (POST Task 1a — template canonica a seguir)
    - src/lib/agent-specs/README.md (POST Task 1a — edition rules)
    - .claude/rules/agent-scope.md (buscar scope de sales-v3 y godentist)
    - src/lib/agents/somnio-v3/ — listar + grep retake, ofi_inter
    - src/lib/agents/godentist/ — listar + tests
    - MEMORY.md y CLAUDE.md para context de godentist_horarios_sedes
  </read_first>
  <action>
    **Paso 1 — Crear `src/lib/agent-specs/somnio-sales-v3.md`** siguiendo template de Task 1a:

    Leer fuentes:
    ```bash
    grep -r "somnio-v3\|somnio-sales-v3" .claude/rules/agent-scope.md
    ls src/lib/agents/somnio-v3/
    grep -n "retake\|ofi_inter" src/lib/agents/somnio-v3/
    ```

    Estructura similar a recompra, llenar con info real. Focus areas:
    - `retake` / `retoma_*` handling (somnio-v3 specific per RESEARCH §Open Items §2 per-bot emphasis)
    - `ofi_inter` (office hour / international routing)
    - Relacion con somnio-recompra (same workspace, different agent_id for clients vs new)
    - Sales track + comprehension + no_repetition L2/L3

    Si `.claude/rules/agent-scope.md` NO tiene entry explicita de somnio-sales-v3, derivar de: constants.ts + transitions.ts + tests + CLAUDE.md menciones.

    **Paso 2 — Crear `src/lib/agent-specs/godentist.md`** siguiendo mismo template:

    Leer fuentes:
    ```bash
    ls src/lib/agents/godentist/
    grep -rn "godentist" .claude/rules/agent-scope.md
    ls src/lib/agents/godentist/__tests__/ 2>/dev/null
    ```

    Focus areas:
    - Agendamiento de valoraciones (appointment_decision, availability_lookup)
    - Templates (`confirmacion_asist_godentist` 5 vars: nombre, sucursal, fecha, hora, direccion)
    - 4 sucursales (CABECERA, FLORIDABLANCA, JUMBO EL BOSQUE, MEJORAS PUBLICAS)
    - Robot GoDentist integration (Railway — `godentist-production.up.railway.app`)
    - Credentials: JROMERO/123456

    **Paso 3 — Commit atomico (Task 1b):**
    ```bash
    git add src/lib/agent-specs/somnio-sales-v3.md src/lib/agent-specs/godentist.md
    git commit -m "docs(agent-specs): add somnio-sales-v3 + godentist specs

Plan 03 Task 1b agent-forensics-panel (D-01, D-07). Sigue template de somnio-recompra-v1.md (Task 1a). Fuentes consolidadas: agent-scope.md + src/lib/agents/{somnio-v3,godentist}/ + tests + memory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-specs/somnio-sales-v3.md</automated>
    <automated>test -f src/lib/agent-specs/godentist.md</automated>
    <automated>grep -q "somnio-sales-v3\|somnio-v3" src/lib/agent-specs/somnio-sales-v3.md</automated>
    <automated>grep -q "godentist" src/lib/agent-specs/godentist.md</automated>
    <automated>grep -q "Scope" src/lib/agent-specs/somnio-sales-v3.md</automated>
    <automated>grep -q "Scope" src/lib/agent-specs/godentist.md</automated>
    <automated>grep -q "Observability events" src/lib/agent-specs/somnio-sales-v3.md</automated>
    <automated>grep -q "Observability events" src/lib/agent-specs/godentist.md</automated>
  </verify>
  <acceptance_criteria>
    - somnio-sales-v3.md y godentist.md siguen misma estructura que Task 1a recompra spec.
    - Cubren Scope PUEDE/NO PUEDE, Arquitectura, Intents, Comportamiento por intent, Observability events, Tests, Rebuild notes.
    - Commit local.
  </acceptance_criteria>
  <done>
    - 4 specs consolidadas en disco (README + 3 bots). Auditor de Plan 04 las lee via loadAgentSpec.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Crear `load-agent-spec.ts` + tests (fs.readFile + whitelist + throws) — Pitfall 3 requires no module-scope cache</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Code Examples (load-agent-spec verbatim lineas 726-751), §Pitfall 3 (outputFileTracingIncludes requirement — Plan 01 Task 8 ya lo hizo)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §load-agent-spec.ts NEW (447-468 — single source)
    - src/lib/agent-specs/ (POST Task 1a + 1b — 4 files deben existir: README + 3 specs)
    - src/lib/agents/somnio-recompra/__tests__/ (mock fs pattern references)
  </read_first>
  <behavior>
    - Test 1: `loadAgentSpec('somnio-recompra-v1')` resuelve al contenido del file (mock readFile para evitar depender de fs real en tests).
    - Test 2: `loadAgentSpec('somnio-sales-v3')` resuelve.
    - Test 3: `loadAgentSpec('godentist')` resuelve.
    - Test 4: `loadAgentSpec('unknown-bot')` throws con mensaje que incluye `'Unknown agent spec'` y el ID dado.
    - Test 5: No module-scope cache — dos llamadas con mismo ID invocan readFile dos veces (verifica Pitfall 3 mitigation — cold-start friendly).
  </behavior>
  <action>
    **Paso 1 — Test FIRST (RED):**

    Crear `src/lib/agent-forensics/__tests__/load-agent-spec.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const mockReadFile = vi.fn()
    vi.mock('node:fs/promises', () => ({
      readFile: mockReadFile,
    }))

    import { loadAgentSpec } from '../load-agent-spec'

    describe('loadAgentSpec — whitelist + no cache (D-07, Pitfall 3)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('resolves somnio-recompra-v1 spec content', async () => {
        mockReadFile.mockResolvedValue('# Somnio Recompra v1\n...')
        const content = await loadAgentSpec('somnio-recompra-v1')
        expect(content).toBe('# Somnio Recompra v1\n...')
        expect(mockReadFile).toHaveBeenCalledWith(
          expect.stringContaining('src/lib/agent-specs/somnio-recompra-v1.md'),
          'utf-8',
        )
      })

      it('resolves somnio-sales-v3 spec content', async () => {
        mockReadFile.mockResolvedValue('# Somnio Sales v3\n...')
        const content = await loadAgentSpec('somnio-sales-v3')
        expect(content).toBe('# Somnio Sales v3\n...')
      })

      it('resolves godentist spec content', async () => {
        mockReadFile.mockResolvedValue('# GoDentist\n...')
        const content = await loadAgentSpec('godentist')
        expect(content).toBe('# GoDentist\n...')
      })

      it('throws for unknown agent ID', async () => {
        await expect(loadAgentSpec('unknown-bot')).rejects.toThrow(/Unknown agent spec.*unknown-bot/)
        expect(mockReadFile).not.toHaveBeenCalled()
      })

      it('has no module-scope cache (Pitfall 3 — Vercel cold-start friendly)', async () => {
        mockReadFile.mockResolvedValue('content')
        await loadAgentSpec('godentist')
        await loadAgentSpec('godentist')
        expect(mockReadFile).toHaveBeenCalledTimes(2)
      })
    })
    ```

    Correr — debe fallar:
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/load-agent-spec.test.ts
    ```

    **Paso 2 — Crear `src/lib/agent-forensics/load-agent-spec.ts`** (verbatim from RESEARCH.md §Code Examples lineas 726-751):

    ```typescript
    // src/lib/agent-forensics/load-agent-spec.ts
    // Source: RESEARCH.md §Code Examples lines 726-751
    import { readFile } from 'node:fs/promises'
    import path from 'node:path'

    /**
     * Load a bot's behavior spec from disk. Files live at
     * `src/lib/agent-specs/{id}.md` and are included in the Vercel lambda bundle
     * via `next.config.ts` `outputFileTracingIncludes` (Pitfall 3).
     *
     * NO module-scope caching (Pitfall 3) — Vercel lambdas cold-start per
     * invocation and a cache wouldn't help. Spec files are <10KB; overhead
     * trivial. Spec changes reflect immediately (no redeploy).
     *
     * Valid agent IDs: 'somnio-sales-v3' | 'somnio-recompra-v1' | 'godentist'.
     * Throws for unknown.
     */
    const SPEC_IDS = new Set<string>([
      'somnio-sales-v3',
      'somnio-recompra-v1',
      'godentist',
    ])

    export async function loadAgentSpec(agentId: string): Promise<string> {
      if (!SPEC_IDS.has(agentId)) {
        throw new Error(`Unknown agent spec: ${agentId}`)
      }
      const filePath = path.join(process.cwd(), 'src/lib/agent-specs', `${agentId}.md`)
      return readFile(filePath, 'utf-8')
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/load-agent-spec.test.ts
    npx tsc --noEmit
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/load-agent-spec.ts src/lib/agent-forensics/__tests__/load-agent-spec.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 03 Task 3 — loadAgentSpec fs.readFile + whitelist (D-07, Pitfall 3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/load-agent-spec.test.ts 2>&1 | grep -qE "5 passed|Test Files.*1 passed"</automated>
    <automated>test -f src/lib/agent-forensics/load-agent-spec.ts</automated>
    <automated>grep -q "SPEC_IDS" src/lib/agent-forensics/load-agent-spec.ts</automated>
    <automated>grep -q "'somnio-sales-v3'" src/lib/agent-forensics/load-agent-spec.ts && grep -q "'somnio-recompra-v1'" src/lib/agent-forensics/load-agent-spec.ts && grep -q "'godentist'" src/lib/agent-forensics/load-agent-spec.ts</automated>
    <automated>grep -q "readFile" src/lib/agent-forensics/load-agent-spec.ts</automated>
    <automated>grep -q "const cache\|let cache\|Map<" src/lib/agent-forensics/load-agent-spec.ts && exit 1 || exit 0</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "load-agent-spec" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `load-agent-spec.ts` existe, exporta `loadAgentSpec(agentId: string): Promise<string>`.
    - Whitelist de 3 IDs + throws para otros.
    - Usa `path.join(process.cwd(), 'src/lib/agent-specs', '<id>.md')` + `readFile(..., 'utf-8')`.
    - NO tiene cache a module-scope (ni Map ni let cache).
    - 5 tests verde.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Loader listo. Plan 04 auditor lo usa.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Crear `load-session-snapshot.ts` + tests (createRawAdminClient + join + no projection)</name>
  <read_first>
    - src/lib/observability/repository.ts (patron createRawAdminClient lineas 1-17, listTurnsForConversation shape 63-98)
    - src/lib/supabase/admin.ts (verificar que createRawAdminClient existe y no usa observability wrapper)
    - src/lib/agents/session-manager.ts (linea ~181 — como se escribe session_state)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Assumptions A7 (freshest state) — documentar limitation
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §load-session-snapshot.ts NEW (471-501 — source material)
    - src/inngest/functions/__tests__/recompra-preload-context.test.ts (admin client mock shape)
  </read_first>
  <behavior>
    - Test 1: `loadSessionSnapshot('conv-uuid')` con session activa existente → retorna `{ snapshot: <json>, sessionId: 'session-uuid' }`.
    - Test 2: `loadSessionSnapshot('conv-uuid')` sin session activa → retorna `{ snapshot: null, sessionId: null }`.
    - Test 3: La query filtra por `conversation_id = ?` + `is_active = true` + `order by created_at desc limit 1` usando `createRawAdminClient` (NO `createAdminClient` — anti-recursion).
    - Test 4: NO hay filtering/projection del snapshot (D-06 — retorna el JSON completo tal cual).
  </behavior>
  <action>
    **Paso 1 — Test FIRST:**

    Crear `src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Mock createRawAdminClient BEFORE importing load-session-snapshot
    const mockSessionsSelect = vi.fn()
    const mockStateSelect = vi.fn()
    const mockSessionsChain = {
      select: vi.fn(() => mockSessionsChain),
      eq: vi.fn(() => mockSessionsChain),
      order: vi.fn(() => mockSessionsChain),
      limit: vi.fn(() => mockSessionsChain),
      maybeSingle: mockSessionsSelect,
      single: mockSessionsSelect,
    }
    const mockStateChain = {
      select: vi.fn(() => mockStateChain),
      eq: vi.fn(() => mockStateChain),
      maybeSingle: mockStateSelect,
      single: mockStateSelect,
    }
    const mockFrom = vi.fn((table: string) => {
      if (table === 'agent_sessions') return mockSessionsChain
      if (table === 'session_state') return mockStateChain
      throw new Error(`unexpected table: ${table}`)
    })

    vi.mock('@/lib/supabase/admin', () => ({
      createRawAdminClient: () => ({ from: mockFrom }),
    }))

    import { loadSessionSnapshot } from '../load-session-snapshot'

    describe('loadSessionSnapshot — createRawAdminClient + no projection (D-06)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
        mockSessionsChain.select = vi.fn(() => mockSessionsChain)
        mockSessionsChain.eq = vi.fn(() => mockSessionsChain)
        mockSessionsChain.order = vi.fn(() => mockSessionsChain)
        mockSessionsChain.limit = vi.fn(() => mockSessionsChain)
        mockStateChain.select = vi.fn(() => mockStateChain)
        mockStateChain.eq = vi.fn(() => mockStateChain)
      })

      it('returns full session_state JSON when active session exists', async () => {
        mockSessionsSelect.mockResolvedValue({
          data: { id: 'session-uuid-1' },
          error: null,
        })
        mockStateSelect.mockResolvedValue({
          data: {
            session_id: 'session-uuid-1',
            datos_capturados: { nombre: 'Jose', phone: '+57...', _v3: { crm_context: {} } },
            updated_at: '2026-04-24T10:00:00Z',
          },
          error: null,
        })

        const result = await loadSessionSnapshot('conv-uuid-1')

        expect(result.sessionId).toBe('session-uuid-1')
        expect(result.snapshot).toEqual({
          session_id: 'session-uuid-1',
          datos_capturados: { nombre: 'Jose', phone: '+57...', _v3: { crm_context: {} } },
          updated_at: '2026-04-24T10:00:00Z',
        })
      })

      it('returns null snapshot when no active session', async () => {
        mockSessionsSelect.mockResolvedValue({
          data: null,
          error: null,
        })

        const result = await loadSessionSnapshot('conv-uuid-no-session')

        expect(result.sessionId).toBeNull()
        expect(result.snapshot).toBeNull()
      })

      it('queries agent_sessions by conversation_id + is_active + orders by created_at desc', async () => {
        mockSessionsSelect.mockResolvedValue({ data: { id: 'x' }, error: null })
        mockStateSelect.mockResolvedValue({ data: {}, error: null })

        await loadSessionSnapshot('conv-123')

        expect(mockFrom).toHaveBeenCalledWith('agent_sessions')
        expect(mockSessionsChain.eq).toHaveBeenCalledWith('conversation_id', 'conv-123')
        expect(mockSessionsChain.eq).toHaveBeenCalledWith('is_active', true)
        expect(mockSessionsChain.order).toHaveBeenCalledWith('created_at', { ascending: false })
        expect(mockSessionsChain.limit).toHaveBeenCalledWith(1)
      })

      it('does NOT filter or transform the snapshot (D-06 — raw JSON)', async () => {
        const rawState = {
          session_id: 'x',
          datos_capturados: { nested: { deep: { structure: true } }, array: [1, 2, 3] },
          internal_field: 'should still appear',
        }
        mockSessionsSelect.mockResolvedValue({ data: { id: 'x' }, error: null })
        mockStateSelect.mockResolvedValue({ data: rawState, error: null })

        const result = await loadSessionSnapshot('c')

        expect(result.snapshot).toEqual(rawState)
      })
    })
    ```

    Correr (RED):
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts
    ```

    **Paso 2 — Crear `src/lib/agent-forensics/load-session-snapshot.ts`:**

    ```typescript
    // src/lib/agent-forensics/load-session-snapshot.ts
    // Source: RESEARCH.md §Architecture + PATTERNS.md §load-session-snapshot.ts
    import { createRawAdminClient } from '@/lib/supabase/admin'

    /**
     * Load the current session_state snapshot for a conversation.
     *
     * Resolution: find the most recent ACTIVE agent_session for the conversation,
     * then read the full session_state row.
     *
     * D-06: no filtering/projection — returns the raw JSON (may contain PII).
     * Documented in src/lib/agent-specs/README.md §Pitfall 6.
     *
     * A7 LIMITATION (RESEARCH.md): session_state is mutated in-place by the agent.
     * For a turn being analyzed NOW, this is accurate. For a HISTORICAL turn, this
     * is the CURRENT state (possibly mutated by later turns). UI should label this
     * "snapshot actual, no historico".
     *
     * Uses createRawAdminClient to avoid re-entering the observability fetch wrapper
     * (Pitfall 1 avoidance — same rationale as repository.ts).
     */
    export async function loadSessionSnapshot(
      conversationId: string,
    ): Promise<{ snapshot: unknown; sessionId: string | null }> {
      const supabase = createRawAdminClient()

      // Step 1: find most recent active session for this conversation
      const { data: session, error: sessionErr } = await supabase
        .from('agent_sessions')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sessionErr) {
        // Don't throw — return empty so UI can show "error loading snapshot"
        return { snapshot: null, sessionId: null }
      }
      if (!session) {
        return { snapshot: null, sessionId: null }
      }

      // Step 2: read full session_state row (no projection — D-06)
      const { data: state, error: stateErr } = await supabase
        .from('session_state')
        .select('*')
        .eq('session_id', session.id)
        .maybeSingle()

      if (stateErr) {
        return { snapshot: null, sessionId: session.id }
      }

      return { snapshot: state ?? null, sessionId: session.id }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts
    npx tsc --noEmit
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/load-session-snapshot.ts src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 03 Task 4 — loadSessionSnapshot raw admin + no projection (D-06)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts 2>&1 | grep -qE "4 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "createRawAdminClient" src/lib/agent-forensics/load-session-snapshot.ts</automated>
    <automated>grep -q "is_active" src/lib/agent-forensics/load-session-snapshot.ts</automated>
    <automated>grep -q "order.*created_at.*false" src/lib/agent-forensics/load-session-snapshot.ts</automated>
    <automated>grep -q "session_state" src/lib/agent-forensics/load-session-snapshot.ts</automated>
    <automated>grep -q "select\('\*'\)" src/lib/agent-forensics/load-session-snapshot.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "load-session-snapshot" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `load-session-snapshot.ts` existe con `loadSessionSnapshot(conversationId)`.
    - Usa `createRawAdminClient` (NO createAdminClient).
    - Join 2-step: first `agent_sessions` con conversation_id + is_active + order desc + limit 1, then `session_state` con session_id.
    - Usa `.select('*')` — no projection (D-06).
    - Returns `{ snapshot, sessionId }` sin transformacion.
    - 4 tests verde.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Snapshot loader listo. Server action + UI consumen en siguientes tasks.
  </done>
</task>

<task type="auto">
  <name>Task 5: Agregar `getSessionSnapshotAction` a `observability.ts` + crear componente `session-snapshot.tsx` + conectar en `forensics-tab.tsx`</name>
  <read_first>
    - src/app/actions/observability.ts (POST Plan 02 Task 2 — ya tiene getForensicsViewAction)
    - src/lib/agent-forensics/load-session-snapshot.ts (POST Task 4 de este plan)
    - src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx (pattern @uiw/react-json-view lineas 14-27)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/event-row.tsx (READ-ONLY JsonView pattern lineas 20-23, 40-41)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx (hand-rolled fetch pattern — simpler variant sin setInterval)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx (POST Plan 02 — placeholder a reemplazar)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §session-snapshot.tsx NEW, §Shared Patterns §Super-user-gated server action
  </read_first>
  <action>
    **Paso 1 — Extender `src/app/actions/observability.ts`:**

    Agregar al final:

    ```typescript
    import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'

    /**
     * Returns the full session_state JSON snapshot for a conversation.
     * Super-user gated.
     *
     * D-06: no filtering / no projection. PII documented in
     * src/lib/agent-specs/README.md §Pitfall 6.
     */
    export async function getSessionSnapshotAction(
      conversationId: string,
    ): Promise<{ snapshot: unknown; sessionId: string | null }> {
      await assertSuperUser()
      return loadSessionSnapshot(conversationId)
    }
    ```

    NOTA: Si `loadSessionSnapshot` ya se importo globalmente en el archivo, ajustar. Verificar import deduplication.

    **Paso 2 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx`** (READ-ONLY json view con hand-rolled fetch):

    ```typescript
    'use client'
    import { useEffect, useRef, useState } from 'react'
    import JsonView from '@uiw/react-json-view'
    import { darkTheme } from '@uiw/react-json-view/dark'
    import { lightTheme } from '@uiw/react-json-view/light'
    import { useTheme } from 'next-themes'
    import { getSessionSnapshotAction } from '@/app/actions/observability'

    interface Props {
      conversationId: string
    }

    type SnapshotState =
      | { kind: 'loading' }
      | { kind: 'empty' }
      | { kind: 'error'; message: string }
      | { kind: 'data'; snapshot: unknown; sessionId: string }

    export function SessionSnapshot({ conversationId }: Props) {
      const [state, setState] = useState<SnapshotState>({ kind: 'loading' })
      const mountedRef = useRef(true)
      const { resolvedTheme } = useTheme()
      const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme

      useEffect(() => {
        mountedRef.current = true
        setState({ kind: 'loading' })
        let cancelled = false

        ;(async () => {
          try {
            const result = await getSessionSnapshotAction(conversationId)
            if (cancelled || !mountedRef.current) return
            if (!result.sessionId || result.snapshot == null) {
              setState({ kind: 'empty' })
            } else {
              setState({ kind: 'data', snapshot: result.snapshot, sessionId: result.sessionId })
            }
          } catch (err) {
            if (cancelled || !mountedRef.current) return
            setState({
              kind: 'error',
              message: err instanceof Error ? err.message : String(err),
            })
          }
        })()

        return () => {
          cancelled = true
          mountedRef.current = false
        }
      }, [conversationId])

      if (state.kind === 'loading') {
        return <div className="p-3 text-xs text-muted-foreground italic">Cargando snapshot…</div>
      }
      if (state.kind === 'empty') {
        return (
          <div className="p-3 text-xs text-muted-foreground italic">
            No hay session activa para esta conversation.
          </div>
        )
      }
      if (state.kind === 'error') {
        return (
          <div className="p-3 text-xs text-destructive">Error cargando snapshot: {state.message}</div>
        )
      }

      return (
        <div className="p-3">
          <div className="text-xs text-muted-foreground mb-2 font-mono">
            Snapshot session_state · session {state.sessionId.slice(0, 8)}…
            <span className="ml-2 italic">(estado actual, no historico — A7 RESEARCH)</span>
          </div>
          <div className="text-xs">
            <JsonView
              value={state.snapshot as object}
              style={jsonStyle as Record<string, unknown>}
              collapsed={2}
              displayDataTypes={false}
              enableClipboard={true}
            />
          </div>
        </div>
      )
    }
    ```

    **Paso 3 — Modificar `forensics-tab.tsx`** para reemplazar el placeholder del snapshot:

    Buscar el bloque:
    ```typescript
    {/* Snapshot placeholder — Plan 03 lo reemplaza con <SessionSnapshot conversationId=... /> */}
    <div className="border-t mt-2 px-3 py-3 text-xs text-muted-foreground italic">
      Snapshot de session_state — disponible en Plan 03 (conversationId={conversationId.slice(0, 8)}…).
    </div>
    ```

    Reemplazar con:
    ```typescript
    {/* Session state snapshot (D-06 — full, no filtering) */}
    <div className="border-t mt-2">
      <SessionSnapshot conversationId={conversationId} />
    </div>
    ```

    Agregar import al top:
    ```typescript
    import { SessionSnapshot } from './session-snapshot'
    ```

    **Paso 4 — Verify + tests:**
    ```bash
    npx tsc --noEmit
    npm test -- --run src/lib/agent-forensics 2>&1 | tail -10
    ```

    **Paso 5 — Commit local:**
    ```bash
    git add src/app/actions/observability.ts \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/session-snapshot.tsx \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/forensics-tab.tsx
    git commit -m "feat(agent-forensics-panel): Plan 03 Task 5 — getSessionSnapshotAction + SessionSnapshot component + wire in forensics-tab (D-06)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```

    **Paso 6 — Push atomico del Plan 03:**
    ```bash
    npm test -- --run 2>&1 | tail -10
    git push origin main
    ```
  </action>
  <verify>
    <automated>grep -q "getSessionSnapshotAction" src/app/actions/observability.ts</automated>
    <automated>grep -q "loadSessionSnapshot" src/app/actions/observability.ts</automated>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx"</automated>
    <automated>grep -q "SessionSnapshot" "src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx"</automated>
    <automated>grep -q "@uiw/react-json-view" "src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx"</automated>
    <automated>grep -q "import { SessionSnapshot }" "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx"</automated>
    <automated>grep -q "<SessionSnapshot conversationId={conversationId}" "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx"</automated>
    <automated>grep -q "disponible en Plan 03" "src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx" && exit 1 || exit 0</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
    <automated>npm test -- --run 2>&1 | tail -5 | grep -qE "passed|Test Suites"</automated>
    <automated>git log origin/main..HEAD --oneline 2>&1 | wc -l | grep -qE "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `observability.ts` exporta `getSessionSnapshotAction(conversationId)` super-user-gated.
    - `session-snapshot.tsx` existe con `SessionSnapshot` component, usa READ-ONLY JsonView, theme light/dark via useTheme(), hand-rolled fetch + mountedRef, 4 estados (loading/empty/error/data).
    - `forensics-tab.tsx` reemplazo completamente el placeholder de Plan 03 con `<SessionSnapshot conversationId={conversationId} />`.
    - No queda string "disponible en Plan 03" en forensics-tab.
    - TypeScript compile limpio.
    - Suite test full verde.
    - 5 commits del Plan 03 pusheados a origin/main (Task 1a + 1b + 3 + 4 + 5).
  </acceptance_criteria>
  <done>
    - Snapshot visible en el panel forensics. Plan 04 (auditor) recibira este snapshot por server action.
  </done>
</task>

</tasks>

<verification>
## Plan 03 — Verificacion goal-backward

**Truths observables:**

1. **Specs on disk:** `ls src/lib/agent-specs/` muestra 4 archivos (README + 3 bots).
2. **Specs bundling:** `next.config.ts` outputFileTracingIncludes apunta al glob — Plan 04 puede hacer fs.readFile en prod sin ENOENT.
3. **Loader tests verde:** `npx vitest run src/lib/agent-forensics/__tests__/` todos pasan (load-agent-spec + load-session-snapshot + condense-timeline).
4. **UI panel:** abrir un turn en prod, ver tab Forensics → debajo del timeline condensado aparece un JSON viewer con el session_state completo.
5. **Labels correctos:** header muestra `somnio-recompra-v1` para turns de recompra (regresion check Plan 01 aun activa).
6. **Empty state:** para una conversation sin session activa, muestra "No hay session activa" en lugar de crashear.
7. **No projection verified:** el JSON viewer muestra campos como `datos_capturados._v3:crm_context` sin truncar (D-06).
</verification>

<success_criteria>
- 4 archivos markdown + 2 ts libs + 2 test files + 1 React component + 2 modificados.
- Tests nuevos verde: load-agent-spec (5) + load-session-snapshot (4) = 9 tests.
- Super-user gate aplicado a getSessionSnapshotAction.
- Pitfall 3 mitigated (loadAgentSpec sin cache; next.config Plan 01 activo).
- Pitfall 6 documentado (PII en README).
- 5 commits pusheados + Vercel deploy Ready + smoke test panel muestra snapshot.
</success_criteria>

<output>
Al cerrar este plan, crear `.planning/standalone/agent-forensics-panel/03-SUMMARY.md` documentando:
- Cuales fuentes se consolidaron en cada spec (ej. "somnio-recompra-v1 consolida: agent-scope.md §Somnio Recompra Agent + standalone somnio-recompra-template-catalog + __tests__/").
- Pointers file:line incluidos en cada spec (lista — el auditor los cita literalmente).
- Size de cada spec file (KB) para estimar token cost cuando Plan 04 los embebe en el prompt.
- Cualquier gap detectado durante consolidacion (ej. "godentist no tiene entry en agent-scope.md — consolidado desde memory.md y tests").
- Notas para Plan 04: spec files listos + loadAgentSpec listo + loadSessionSnapshot listo + SessionSnapshot component funcionando. Plan 04 solo tiene que crear auditor-prompt.ts + route.ts + auditor-tab.tsx + npm install react-markdown remark-gfm.
</output>
