---
phase: somnio-sales-v3-pw-confirmation
plan: 04
type: execute
wave: 2
depends_on: [01, 03]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/constants.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "constants.ts existe con exports: PW_CONFIRMATION_INTENTS (Set), INFORMATIONAL_INTENTS (Set), SALES_INTENTS (Set), PW_CONFIRMATION_STAGES (object con 5 UUIDs reales del Plan 01 SNAPSHOT), TEMPLATE_LOOKUP_AGENT_ID literal, ACTION_TEMPLATE_MAP, SHIPPING_REQUIRED_FIELDS, INITIAL_AWAITING_STATES, AFFIRMATIVE_KEYWORDS, NEGATIVE_KEYWORDS, WAIT_KEYWORDS, ADDRESS_CHANGE_KEYWORDS"
    - "PW_CONFIRMATION_STAGES.PIPELINE_ID + .NUEVO_PAG_WEB + .FALTA_INFO + .FALTA_CONFIRMAR + .CONFIRMADO contienen los 5 UUIDs LITERALES copiados de 01-SNAPSHOT.md (Open Q7 resuelto: hardcoded post-audit, NO runtime resolution)"
    - "TEMPLATE_LOOKUP_AGENT_ID === 'somnio-sales-v3-pw-confirmation' (consumed por response-track.ts en Plan 07)"
    - "INFORMATIONAL_INTENTS subset de PW_CONFIRMATION_INTENTS — replica el patron de recompra constants.ts:67-71 con set actualizado per RESEARCH §A.1 + §I.1"
    - "SHIPPING_REQUIRED_FIELDS = ['nombre','apellido','telefono','shippingAddress','shippingCity','shippingDepartment'] (D-06 + RESEARCH §D.3 algoritmo shippingComplete)"
    - "INITIAL_AWAITING_STATES = ['awaiting_confirmation', 'awaiting_confirmation_post_data_capture'] — el guard del 'si' del cliente (D-26)"
    - "AFFIRMATIVE_KEYWORDS / NEGATIVE_KEYWORDS / WAIT_KEYWORDS / ADDRESS_CHANGE_KEYWORDS son arrays de strings normalizados (lowercase, sin tildes) para matching simple en transitions.ts"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/constants.ts"
      provides: "Constantes globales del agente: intents, stages, keywords, mapping de acciones a templates, campos requeridos para envio"
      contains: "SOMNIO_PW_CONFIRMATION_AGENT_ID"
      min_lines: 80
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/constants.ts"
      to: "src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06)"
      via: "PW_CONFIRMATION_STAGES + SHIPPING_REQUIRED_FIELDS imports"
      pattern: "from './constants'"
    - from: "src/lib/agents/somnio-pw-confirmation/constants.ts"
      to: "src/lib/agents/somnio-pw-confirmation/transitions.ts (Plan 06)"
      via: "AFFIRMATIVE_KEYWORDS / NEGATIVE_KEYWORDS / WAIT_KEYWORDS"
      pattern: "AFFIRMATIVE_KEYWORDS"
    - from: "src/lib/agents/somnio-pw-confirmation/constants.ts"
      to: "src/lib/agents/somnio-pw-confirmation/response-track.ts (Plan 07)"
      via: "TEMPLATE_LOOKUP_AGENT_ID + ACTION_TEMPLATE_MAP imports"
      pattern: "TEMPLATE_LOOKUP_AGENT_ID"
---

<objective>
Wave 2 (parallel con Plans 05 + 06) — Crear `constants.ts` del agente con TODAS las constantes que las otras Plans 05-08 consumen: intents (Set), stages (object con UUIDs reales), keywords (arrays), action→template map, required fields para envio.

Purpose: Centralizar las constantes evita drift entre plans. PW_CONFIRMATION_STAGES contiene los UUIDs LITERALES capturados en Plan 01 SNAPSHOT — Plan 08 (sales-track) y Plan 10 (crm-writer-adapter) los usaran para `moveOrderToStage`. INFORMATIONAL_INTENTS es el set que `response-track.ts` (Plan 07) consulta para decidir si emitir templates informacionales (clonado de recompra constants.ts:67-71 pattern). AFFIRMATIVE_KEYWORDS son los strings que `transitions.ts` (Plan 06) usa para detectar el "si" del cliente (D-09 reinterpretado por D-26).

Output: 1 archivo `constants.ts` (~120-150 lineas).

Dependencias:
- Plan 01 SNAPSHOT (UUIDs reales) — bloqueante.
- Plan 03 directorio + config.ts (re-importa SOMNIO_PW_CONFIRMATION_AGENT_ID).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-04, §D-09, §D-10, §D-14, §D-26
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.1 (intents sales-v3 — heredar set), §A.6 (V3_INTENTS pattern), §D.3 (SHIPPING_REQUIRED_FIELDS algorithm), §I.1 (full template list)
@.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md §Stage UUIDs locked (REQUIRED — copiar verbatim los 5 UUIDs)
@src/lib/agents/somnio-recompra/constants.ts — patron exacto (4812 bytes, ~150 lineas) — clonar shape
@src/lib/agents/somnio-v3/constants.ts — referencia adicional (V3_INTENTS, ACTION_TEMPLATE_MAP)
@src/lib/agents/somnio-pw-confirmation/config.ts (creado en Plan 03 — re-importa SOMNIO_PW_CONFIRMATION_AGENT_ID)

<interfaces>
<!-- Schema de constants.ts (esperado export pattern) -->
export const SOMNIO_PW_CONFIRMATION_AGENT_ID = ... // re-export del config.ts

export const TEMPLATE_LOOKUP_AGENT_ID = SOMNIO_PW_CONFIRMATION_AGENT_ID

export const PW_CONFIRMATION_INTENTS: ReadonlySet<string> = new Set([...])
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([...])
export const SALES_INTENTS: ReadonlySet<string> = new Set([...])

export const PW_CONFIRMATION_STAGES = {
  PIPELINE_ID: '<uuid>',
  NUEVO_PAG_WEB: '<uuid>',
  FALTA_INFO: '<uuid>',
  FALTA_CONFIRMAR: '<uuid>',
  CONFIRMADO: '<uuid>',
} as const

export const INITIAL_AWAITING_STATES = ['awaiting_confirmation', 'awaiting_confirmation_post_data_capture'] as const

export const SHIPPING_REQUIRED_FIELDS = [...] as const

export const ACTION_TEMPLATE_MAP: Record<TipoAccion, string[]> = {...}

export const AFFIRMATIVE_KEYWORDS = [...] as const
export const NEGATIVE_KEYWORDS = [...] as const
export const WAIT_KEYWORDS = [...] as const
export const ADDRESS_CHANGE_KEYWORDS = [...] as const
export const ITEMS_CHANGE_KEYWORDS = [...] as const
export const HUMAN_HANDOFF_KEYWORDS = [...] as const

export const READER_TIMEOUT_MS = 25_000  // D-05 bloqueante asume hasta 25s
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `src/lib/agents/somnio-pw-confirmation/constants.ts` con todas las constantes</name>
  <read_first>
    - src/lib/agents/somnio-recompra/constants.ts LINEAS COMPLETAS (~150 lineas — patron de export shape)
    - src/lib/agents/somnio-v3/constants.ts LINEAS COMPLETAS (~217 lineas — referencia para V3_INTENTS + ACTION_TEMPLATE_MAP)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md §Stage UUIDs locked — COPIAR VERBATIM los 5 UUIDs aqui
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.1 (catalogo sales-v3 — fuente del set INFORMATIONAL_INTENTS), §I.1 (sets adaptados PW), §D.3 (SHIPPING_REQUIRED_FIELDS algorithm)
    - src/lib/agents/somnio-pw-confirmation/config.ts (creado Plan 03 — re-import SOMNIO_PW_CONFIRMATION_AGENT_ID)
    - src/lib/agents/somnio-pw-confirmation/types.ts (creado Plan 03 — TipoAccion union)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/constants.ts` con el siguiente contenido:

    ```typescript
    /**
     * Somnio PW-Confirmation — Constants
     *
     * Single source of truth for: intents, stages (UUIDs from prod audit), keywords,
     * action-template mapping, shipping required fields, timeouts.
     *
     * UUIDs of stages are HARDCODED (Open Q7 resolved per audit Plan 01) — they were captured
     * verbatim from prod via `01-AUDIT.sql` Query (a) and locked in `01-SNAPSHOT.md`.
     * If pipeline `Ventas Somnio Standard` is recreated in prod, these UUIDs must be updated.
     */

    import { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
    import type { TipoAccion } from './types'

    /**
     * agent_id used by TemplateManager to look up templates for this agent.
     * MUST match `agent_id` column in `agent_templates` table (see Plan 02 migration).
     */
    export const TEMPLATE_LOOKUP_AGENT_ID = SOMNIO_PW_CONFIRMATION_AGENT_ID
    export { SOMNIO_PW_CONFIRMATION_AGENT_ID }

    /**
     * Stages of the Somnio "Ventas Somnio Standard" pipeline relevant to this agent.
     * UUIDs captured from prod via `01-AUDIT.sql` Query (a) on <Plan 01 capture date>.
     * Source: `.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md`
     */
    export const PW_CONFIRMATION_STAGES = {
      PIPELINE_ID: '<<PEGAR pipeline_uuid de 01-SNAPSHOT.md>>',
      NUEVO_PAG_WEB: '<<PEGAR stage_uuid de 01-SNAPSHOT.md>>',
      FALTA_INFO: '<<PEGAR stage_uuid de 01-SNAPSHOT.md>>',
      FALTA_CONFIRMAR: '<<PEGAR stage_uuid de 01-SNAPSHOT.md>>',
      CONFIRMADO: '<<PEGAR stage_uuid de 01-SNAPSHOT.md>>',
    } as const

    /**
     * Stages where the agent is allowed to operate (entry stages per D-04).
     * Used by routing rule fact `activeOrderStageRaw` (string match in routing-editor).
     */
    export const ENTRY_STAGE_NAMES = ['NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR'] as const

    /**
     * Full set of intents this agent recognizes via Haiku comprehension (Plan 05).
     * Subset of recompra/v3 intents adapted for post-purchase context.
     */
    export const PW_CONFIRMATION_INTENTS: ReadonlySet<string> = new Set([
      // Informational (clonados de sales-v3 / recompra)
      'saludo',
      'precio',
      'promociones',
      'contenido',
      'formula',
      'como_se_toma',
      'pago',
      'envio',
      'ubicacion',
      'contraindicaciones',
      'dependencia',
      'efectividad',
      'registro_sanitario',
      'tiempo_entrega',
      // Post-purchase actions (PW-confirmation specific)
      'confirmar_pedido',          // "si", "dale", "ok", "confirmo", "listo", "correcto"
      'cancelar_pedido',           // "no", "no me interesa", "cancela"
      'esperar',                   // "espera lo pienso", "ya te confirmo", "luego"
      'cambiar_direccion',         // "quiero cambiar la direccion"
      'editar_items',              // "quiero quitar/agregar producto" (V1 → handoff D-13)
      'agendar',                   // respuesta afirmativa a agendar_pregunta
      'pedir_humano',              // "quiero hablar con un asesor", "humano"
      'fallback',                  // intent no clasificable
    ])

    /**
     * Subset that triggers informational template emission (response-track.ts pattern).
     * Cloned from recompra constants.ts:67-71. Includes registro_sanitario per recompra fix.
     */
    export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
      'saludo',
      'precio',
      'promociones',
      'contenido',
      'formula',
      'como_se_toma',
      'pago',
      'envio',
      'ubicacion',
      'contraindicaciones',
      'dependencia',
      'efectividad',
      'registro_sanitario',
      'tiempo_entrega',
    ])

    /**
     * Subset that triggers sales actions (state machine transitions, NOT templates directly).
     */
    export const SALES_INTENTS: ReadonlySet<string> = new Set([
      'confirmar_pedido',
      'cancelar_pedido',
      'esperar',
      'cambiar_direccion',
      'editar_items',
      'agendar',
      'pedir_humano',
    ])

    /**
     * State machine states where an affirmative ("si") counts as confirmation (D-26).
     * D-09 originally said "only if last template was confirmar_compra"; D-26 reinterpreted:
     * the source of truth is the machine state, NOT messages.template_name.
     */
    export const INITIAL_AWAITING_STATES = [
      'awaiting_confirmation',
      'awaiting_confirmation_post_data_capture',
    ] as const

    /**
     * Required fields for shipping (D-06 + RESEARCH §D.3).
     * Algorithm `shippingComplete()` lives in state.ts (Plan 06).
     */
    export const SHIPPING_REQUIRED_FIELDS = [
      'nombre',
      'apellido',
      'telefono',
      'shippingAddress',
      'shippingCity',
      'shippingDepartment',
    ] as const

    export type ShippingFieldName = (typeof SHIPPING_REQUIRED_FIELDS)[number]

    /**
     * Mapping action → template intents to emit (consumed by response-track.ts Plan 07).
     */
    export const ACTION_TEMPLATE_MAP: Record<TipoAccion, string[]> = {
      confirmar_compra: ['confirmacion_orden_same_day'], // OR transportadora — selected by zone in response-track
      pedir_datos_envio: ['pedir_datos_post_compra'],
      actualizar_direccion: ['confirmar_direccion_post_compra'],
      editar_items: ['cancelado_handoff'], // V1: handoff (D-13 deferred)
      cancelar_con_agendar_pregunta: ['agendar_pregunta'],
      cancelar_definitivo: ['cancelado_handoff'],
      mover_a_falta_confirmar: ['claro_que_si_esperamos'],
      handoff: ['cancelado_handoff'],
      noop: [],
    }

    /**
     * Keywords for keyword-based fallback intent detection.
     * Used as a layer ON TOP of Haiku comprehension (defense-in-depth).
     * All strings normalized: lowercase, no accents, no surrounding whitespace.
     */
    export const AFFIRMATIVE_KEYWORDS = [
      'si',
      'sí',
      'sii',
      'siii',
      'siiii',
      'dale',
      'ok',
      'okay',
      'oki',
      'okey',
      'confirmo',
      'confirmado',
      'listo',
      'correcto',
      'asi es',
      'así es',
      'perfecto',
      'va',
      'vale',
      '👍',
      '✅',
    ] as const

    export const NEGATIVE_KEYWORDS = [
      'no',
      'nop',
      'nope',
      'no gracias',
      'cancelar',
      'cancelo',
      'cancelar pedido',
      'cancelado',
      'no quiero',
      'no me interesa',
      'mejor no',
      'ya no',
      '❌',
    ] as const

    export const WAIT_KEYWORDS = [
      'espera',
      'esperame',
      'esperame un momento',
      'lo pienso',
      'ya te confirmo',
      'mas tarde',
      'mas rato',
      'luego',
      'despues',
      'manana',
      'mañana',
      'lo reviso',
      'lo penso',
      'ya te aviso',
      'te aviso',
    ] as const

    export const ADDRESS_CHANGE_KEYWORDS = [
      'cambiar direccion',
      'cambiar dirección',
      'cambiar la direccion',
      'cambiar la dirección',
      'otra direccion',
      'otra dirección',
      'nueva direccion',
      'nueva dirección',
      'cambiar a',
      'mejor a',
      'envialo a',
      'envíalo a',
    ] as const

    export const ITEMS_CHANGE_KEYWORDS = [
      'agregar producto',
      'quitar producto',
      'sumar producto',
      'agregar otro',
      'quitar uno',
      'cambiar producto',
      'cambiar cantidad',
      'mas unidades',
      'menos unidades',
      'editar pedido',
      'editar items',
    ] as const

    export const HUMAN_HANDOFF_KEYWORDS = [
      'asesor',
      'humano',
      'persona',
      'agente humano',
      'hablar con alguien',
      'hablar con un humano',
      'hablar con asesor',
      'operador',
      'reclamo',
      'queja',
      'devolucion',
      'devolución',
    ] as const

    /**
     * CRM Reader timeout (D-05 BLOQUEANTE assumes 5-30s acceptable post-purchase).
     * Inngest function `pw-confirmation-preload-and-invoke` (Plan 09) uses this.
     */
    export const READER_TIMEOUT_MS = 25_000

    /**
     * Inngest event names (canonical, used in dispatch + function trigger).
     */
    export const INNGEST_EVENT_PRELOAD_AND_INVOKE = 'pw-confirmation/preload-and-invoke' as const
    ```

    **Paso 2 — Reemplazar los 5 placeholders `<<PEGAR ... de 01-SNAPSHOT.md>>` con los UUIDs reales** del archivo `.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md` §Stage UUIDs locked seccion. Los 5 UUIDs son:
    - `PIPELINE_ID` = el UUID del pipeline 'Ventas Somnio Standard'
    - `NUEVO_PAG_WEB` = stage_uuid del row con stage_name='NUEVO PAG WEB'
    - `FALTA_INFO` = stage_uuid del row con stage_name='FALTA INFO'
    - `FALTA_CONFIRMAR` = stage_uuid del row con stage_name='FALTA CONFIRMAR'
    - `CONFIRMADO` = stage_uuid del row con stage_name='CONFIRMADO'

    Si el archivo SNAPSHOT no tiene esos UUIDs (el usuario aun no los pego en Plan 01 Task 2), PAUSAR y escalar — Plan 04 depende de ese audit.

    **Paso 3 — Verificar typecheck:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-04-01.log
    ! grep -E "src/lib/agents/somnio-pw-confirmation/constants" /tmp/tc-04-01.log | grep -q "error TS"
    ```

    **Paso 4 — Verificar que NO quedo ningun placeholder:**
    ```bash
    ! grep "<<PEGAR" src/lib/agents/somnio-pw-confirmation/constants.ts
    ```

    **Paso 5 — Commit atomico:**
    ```bash
    git add src/lib/agents/somnio-pw-confirmation/constants.ts
    git commit -m "feat(somnio-sales-v3-pw-confirmation): add constants.ts (intents, stage UUIDs, keywords, action-template map, shipping fields)"
    ```

    NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>! grep -F "<<PEGAR" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "TEMPLATE_LOOKUP_AGENT_ID = SOMNIO_PW_CONFIRMATION_AGENT_ID" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "PW_CONFIRMATION_STAGES = {" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "PIPELINE_ID:" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "NUEVO_PAG_WEB:" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "FALTA_INFO:" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "FALTA_CONFIRMAR:" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "CONFIRMADO:" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -qE "^export const INFORMATIONAL_INTENTS:" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "'registro_sanitario'" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "INITIAL_AWAITING_STATES" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "SHIPPING_REQUIRED_FIELDS" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "ACTION_TEMPLATE_MAP" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "AFFIRMATIVE_KEYWORDS" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "NEGATIVE_KEYWORDS" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "WAIT_KEYWORDS" src/lib/agents/somnio-pw-confirmation/constants.ts && grep -q "ADDRESS_CHANGE_KEYWORDS" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "READER_TIMEOUT_MS = 25_000" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>grep -q "'pw-confirmation/preload-and-invoke'" src/lib/agents/somnio-pw-confirmation/constants.ts</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-04-01.log; ! grep -E "src/lib/agents/somnio-pw-confirmation/constants" /tmp/tc-04-01.log | grep -q "error TS"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add constants.ts"</automated>
  </verify>
  <acceptance_criteria>
    - `constants.ts` existe con >=80 lineas.
    - `PW_CONFIRMATION_STAGES` tiene 5 UUIDs literales (formato 8-4-4-4-12 hex con guiones).
    - NO existen placeholders `<<PEGAR>>` sin reemplazar.
    - Sets `PW_CONFIRMATION_INTENTS`, `INFORMATIONAL_INTENTS`, `SALES_INTENTS` exportados.
    - `INFORMATIONAL_INTENTS` incluye `'registro_sanitario'` (D-27 — copy verbatim de sales-v3 = INVIMA).
    - `SHIPPING_REQUIRED_FIELDS` array de 6 strings (`nombre`, `apellido`, `telefono`, `shippingAddress`, `shippingCity`, `shippingDepartment`).
    - `INITIAL_AWAITING_STATES` array con 2 strings (`awaiting_confirmation`, `awaiting_confirmation_post_data_capture`).
    - `ACTION_TEMPLATE_MAP` cubre las 9 TipoAccion del types.ts (Plan 03).
    - Keywords arrays definidos (afirmativo, negativo, espera, cambio direccion, items, humano).
    - `READER_TIMEOUT_MS = 25_000` exportado.
    - `INNGEST_EVENT_PRELOAD_AND_INVOKE = 'pw-confirmation/preload-and-invoke'` exportado.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - constants.ts listo para que Plans 05-08 lo consuman.
    - Stage UUIDs hardcoded post-audit (Open Q7 resuelto).
  </done>
</task>

</tasks>

<verification>
- `src/lib/agents/somnio-pw-confirmation/constants.ts` existe con todas las exports listadas.
- 5 stage UUIDs literales (no placeholders).
- typecheck OK.
- 1 commit atomico, NO pusheado.
</verification>

<success_criteria>
- Plan 06 (state.ts + transitions.ts) puede importar `INITIAL_AWAITING_STATES`, `AFFIRMATIVE_KEYWORDS`, etc.
- Plan 07 (response-track.ts) puede importar `TEMPLATE_LOOKUP_AGENT_ID`, `INFORMATIONAL_INTENTS`, `ACTION_TEMPLATE_MAP`.
- Plan 08 (sales-track.ts) puede importar `PW_CONFIRMATION_STAGES` para `moveOrderToStage(orderId, PW_CONFIRMATION_STAGES.CONFIRMADO)`.
- Plan 09 (Inngest function) puede importar `READER_TIMEOUT_MS` + `INNGEST_EVENT_PRELOAD_AND_INVOKE`.
- Plan 10 (crm-writer-adapter) puede importar `PW_CONFIRMATION_STAGES`.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/04-SUMMARY.md` documenting:
- Commit hash.
- Total lineas de constants.ts.
- 5 UUIDs literales hardcoded (con stage names).
- Sets exportados (count de cada uno).
- ACTION_TEMPLATE_MAP keys (9 acciones).
- Output del typecheck.
</output>
</content>
</invoke>