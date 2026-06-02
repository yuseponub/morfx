---
phase: somnio-sales-v3-pw-confirmation
plan: 05
type: execute
wave: 2
depends_on: [03]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts
  - src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts
  - src/lib/agents/somnio-pw-confirmation/comprehension.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "comprehension-schema.ts exporta `MessageAnalysisSchema` (Zod) con campos: intent (enum de los 22 PW intents), confidence (number 0-1), datos_extraidos (object opcional con shipping fields), notas (string optional)"
    - "comprehension-prompt.ts exporta `buildPwConfirmationPrompt({state, history, crmContext})` que retorna string del system prompt — incluye seccion CRM context cuando esta disponible (D-05 BLOQUEANTE)"
    - "comprehension.ts exporta `analyzeMessage({message, state, history, crmContext})` que invoca Haiku via `generateObject` con `MessageAnalysisSchema`"
    - "El prompt incluye seccion explicita 'cliente YA hizo un pedido — NO eres prospect agent' (post-purchase context — diferenciador clave vs sales-v3)"
    - "El prompt instruye D-26: respuesta afirmativa en estado 'awaiting_confirmation' → confirmar_pedido (sin consultar messages.template_name)"
    - "Haiku model literal: 'claude-haiku-4-5' (mismo que sales-v3 / recompra)"
    - "Tokens output cap: 512"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts"
      provides: "Zod schema MessageAnalysis"
      contains: "MessageAnalysisSchema"
      min_lines: 40
    - path: "src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts"
      provides: "Builder del system prompt con CRM section conditional"
      contains: "buildPwConfirmationPrompt"
      min_lines: 80
    - path: "src/lib/agents/somnio-pw-confirmation/comprehension.ts"
      provides: "analyzeMessage entry — Haiku call con generateObject"
      contains: "analyzeMessage"
      min_lines: 50
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/comprehension.ts"
      to: "ai SDK generateObject + MessageAnalysisSchema"
      via: "structured output via Zod"
      pattern: "generateObject"
    - from: "src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts"
      to: "session_state.datos_capturados._v3:crm_context"
      via: "crmContext arg pasado por caller"
      pattern: "crmContext"
---

<objective>
Wave 2 (parallel con Plans 04 + 06) — Crear los 3 archivos de comprehension del agente: schema (Zod), prompt builder (con CRM context section), y entry function (Haiku call).

Purpose: D-25 lockea state-machine pura (NO AI SDK loop). Solo 1 Haiku call por turno para clasificar intent + extraer datos. El prompt es post-purchase (NO prospect — diferenciador clave vs sales-v3). D-26: estado de la maquina es el guard del "si", NO `messages.template_name`. D-05: el agente recibe `_v3:crm_context` populated en sesión (Plan 09 garantiza via Inngest 2-step).

Output: 3 archivos en `src/lib/agents/somnio-pw-confirmation/`.

Dependencias: Plan 03 (config + types). NO depende de Plan 04 (constants) — los 22 intents van duplicados en el schema (single source of truth para Zod enum). Si Plan 04 termino primero, comprehension.ts puede importar `PW_INTENT_VALUES` desde schema.ts pero NO desde constants.ts (acoplamiento minimo).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-05, §D-25, §D-26
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.6 (estructura comprehension de v3), §B (CRM reader bloqueante)
@src/lib/agents/somnio-recompra/comprehension-schema.ts — patron Zod
@src/lib/agents/somnio-recompra/comprehension-prompt.ts — patron prompt CRM section conditional
@src/lib/agents/somnio-recompra/comprehension.ts — patron generateObject Haiku
@src/lib/agents/somnio-v3/comprehension-prompt.ts — referencia adicional
@src/lib/agents/somnio-pw-confirmation/types.ts (Plan 03)

<interfaces>
<!-- MessageAnalysis (Zod inferred) -->
interface MessageAnalysis {
  intent: 'saludo' | 'precio' | ... | 'fallback'  // 22 valores
  confidence: number  // 0-1
  datos_extraidos?: { nombre?, apellido?, telefono?, direccion?, ciudad?, departamento? }
  notas?: string
}

<!-- analyzeMessage signature -->
async function analyzeMessage(input: {
  message: string
  state: unknown
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
  crmContext?: string  // _v3:crm_context (D-05)
}): Promise<MessageAnalysis>
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `comprehension-schema.ts` con Zod MessageAnalysisSchema</name>
  <read_first>
    - src/lib/agents/somnio-recompra/comprehension-schema.ts LINEAS COMPLETAS
    - src/lib/agents/somnio-pw-confirmation/types.ts (Plan 03)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts` con: (1) export `PW_INTENT_VALUES` array de 22 strings literales (14 informacionales + 7 sales + 1 fallback per Plan 04 sets); (2) export `DatosExtraidosSchema` con campos `nombre`, `apellido`, `telefono`, `direccion`, `ciudad`, `departamento` (todos `z.string().nullish()`); (3) export `MessageAnalysisSchema` con `intent: z.enum(PW_INTENT_VALUES)`, `confidence: z.number().min(0).max(1)`, `datos_extraidos: DatosExtraidosSchema.nullish()`, `notas: z.string().nullish()`; (4) export `MessageAnalysis` y `DatosExtraidos` types via `z.infer<typeof ...>`.

    Cada campo del schema debe tener `.describe(...)` con instrucciones para el LLM (esto mejora structured output de Haiku).

    Para `telefono`, describe explicitamente "normalizar a formato 573XXXXXXXXX (10 digitos despues de 57)".
    Para `direccion`, describe "shippingAddress — solo el texto de la direccion (NO incluir ciudad/depto)".

    Commit: `feat(somnio-sales-v3-pw-confirmation): add comprehension Zod schema (22 intents + datos_extraidos shape)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "PW_INTENT_VALUES" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "MessageAnalysisSchema" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "DatosExtraidosSchema" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'confirmar_pedido'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'cancelar_pedido'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'esperar'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'cambiar_direccion'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'editar_items'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'agendar'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'pedir_humano'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "'fallback'" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>grep -q "z.infer<typeof MessageAnalysisSchema>" src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "comprehension-schema" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - Schema existe con 22 intent values literales en PW_INTENT_VALUES.
    - DatosExtraidos shape incluye los 6 campos shipping (nombre, apellido, telefono, direccion, ciudad, departamento).
    - Cada campo Zod tiene `.describe(...)` con instrucciones para Haiku.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Schema listo para que comprehension.ts (Task 3) y tests (Plan 12) lo importen.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear `comprehension-prompt.ts` con buildPwConfirmationPrompt (post-purchase context + CRM section)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/comprehension-prompt.ts LINEAS COMPLETAS (~10KB — patron CRM section conditional)
    - src/lib/agents/somnio-v3/comprehension-prompt.ts LINEAS COMPLETAS
    - src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts (creado Task 1)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-26
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts` que exporte `buildPwConfirmationPrompt({state, history, crmContext})` retornando string del system prompt. El prompt debe tener 7 secciones separadas por `---`:

    1. **Producto**: ELIXIR DEL SUEÑO (melatonina + magnesio, 90 comprimidos), precios ($77,900/$109,900/$139,900), pago contraentrega, envíos gratis nacional, tiempos de entrega varían por ciudad, registro Invima / PHARMA SOLUTIONS SAS.

    2. **Tu rol**: Asistente de Somnio para clientes que YA HICIERON UN PEDIDO (NO prospect). Stages: NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR. 7 acciones que puede tomar (CONFIRMAR, CAPTURAR datos, ACTUALIZAR direccion, RESPONDER preguntas, ESCALAR humano, MOVER a FALTA CONFIRMAR, PREGUNTAR agendar).

    3. **Intent list** (22): Informacionales (14: saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario, tiempo_entrega) + Sales (7: confirmar_pedido, cancelar_pedido, esperar, cambiar_direccion, editar_items, agendar, pedir_humano) + Fallback. Cada intent con descripcion breve (e.g. "confirmar_pedido → cliente confirma con si/dale/ok/listo/correcto/confirmo").

    4. **Extraccion de datos**: instrucciones para `datos_extraidos`. Incluir: NO inventar datos, telefono debe normalizarse a 573XXXXXXXXX, direccion solo el texto (NO ciudad/depto separados).

    5. **Estado actual**: imprimir `state.phase` si existe. Incluir nota explicita: "Si el estado es 'awaiting_confirmation' o 'awaiting_confirmation_post_data_capture', una respuesta afirmativa (si/dale/ok/etc) DEBE clasificarse como confirmar_pedido (D-26). NO requiere validar el ultimo template enviado — el estado de la maquina es el guard."

    6. **Contexto del pedido (CRM)**: si `crmContext && crmContext.trim().length > 0`, imprimir `crmContext.trim()`. Si NO disponible, imprimir mensaje de degradacion: "(No disponible — error o timeout del CRM reader. Procede con cautela; pide al cliente que confirme su numero de pedido o nombre completo si necesitas datos.)".

    7. **Conversacion reciente**: ultimos 6 turnos del history formateados como `Cliente: ...` / `Bot: ...`.

    Final: instruccion explicita de devolver JSON con campos intent, confidence, datos_extraidos, notas.

    Commit: `feat(somnio-sales-v3-pw-confirmation): add comprehension prompt builder (post-purchase context + CRM section conditional + D-26 state guard instruction)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "export function buildPwConfirmationPrompt" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "ELIXIR DEL SUEÑO" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "YA HICIERON UN PEDIDO" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "awaiting_confirmation" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "D-26" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "crmContext" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "PHARMA SOLUTIONS SAS" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "confirmar_pedido" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>grep -q "573XXXXXXXXX" src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "comprehension-prompt" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - Funcion `buildPwConfirmationPrompt` exportada con signature `({state, history, crmContext}) => string`.
    - Prompt incluye las 7 secciones documentadas.
    - Producto info menciona ELIXIR DEL SUEÑO + precios + INVIMA.
    - Rol section explicita "post-purchase, NO prospect".
    - Intent list incluye los 22 intents con descripciones breves.
    - Estado actual section incluye nota D-26 (state-machine como guard).
    - CRM section condicional (con/sin crmContext).
    - History section limita a ultimos 6 turnos.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Prompt builder listo para Task 3 (comprehension.ts) y tests (Plan 12).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Crear `comprehension.ts` con analyzeMessage (generateObject + Haiku)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/comprehension.ts LINEAS COMPLETAS (~140 lineas — patron generateObject + error handling)
    - src/lib/agents/somnio-v3/comprehension.ts LINEAS COMPLETAS
    - src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts (creado Task 1)
    - src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts (creado Task 2)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/comprehension.ts` que exporte `async function analyzeMessage({message, state, history, crmContext}): Promise<MessageAnalysis>`. La funcion:

    1. Construye system prompt: `const systemPrompt = buildPwConfirmationPrompt({state, history, crmContext})`.
    2. Invoca `generateObject` (de `'ai'` package) con:
       - `model: anthropic('claude-haiku-4-5')` (mismo que recompra/v3)
       - `system: systemPrompt`
       - `prompt: message` (el user message)
       - `schema: MessageAnalysisSchema`
       - `maxOutputTokens: 512` (mismo que recompra/v3)
       - `temperature: 0.1` (deterministic)
    3. Si `generateObject` throws, log error + retornar `{intent: 'fallback', confidence: 0, notas: 'Comprehension error: ' + err.message}` (degradacion graceful).
    4. Si success, retornar `result.object` (typed as MessageAnalysis).

    Importar:
    - `generateObject` de `'ai'`
    - `anthropic` de `'@ai-sdk/anthropic'`
    - `MessageAnalysisSchema` y `MessageAnalysis` de `'./comprehension-schema'`
    - `buildPwConfirmationPrompt` de `'./comprehension-prompt'`
    - `createModuleLogger` de `'@/lib/audit/logger'` (logger 'somnio-pw-confirmation-comprehension')

    Emitir telemetry/observability event opcional `comprehension:result` con metrics (durationMs, intent, confidence) — clonar el patron exacto de `src/lib/agents/somnio-recompra/comprehension.ts` (cuya integracion con observability ya esta resuelta).

    Commit: `feat(somnio-sales-v3-pw-confirmation): add comprehension entry — Haiku call via generateObject + degradation fallback`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -q "export async function analyzeMessage" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -q "generateObject" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -q "MessageAnalysisSchema" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -q "buildPwConfirmationPrompt" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -q "claude-haiku-4-5" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -q "maxOutputTokens: 512\|maxTokens: 512" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>grep -qE "intent: 'fallback'" src/lib/agents/somnio-pw-confirmation/comprehension.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/comprehension\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add comprehension entry"</automated>
  </verify>
  <acceptance_criteria>
    - `analyzeMessage` exportada con la signature exacta documentada.
    - `generateObject` invocado con MessageAnalysisSchema + Haiku model + maxOutputTokens 512.
    - Error path retorna `{intent: 'fallback', confidence: 0}` gracefully.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Plan 11 (engine) puede invocar `analyzeMessage(...)` con confianza.
    - Plan 12 puede testear (mock generateObject).
  </done>
</task>

</tasks>

<verification>
- 3 archivos creados (schema + prompt + entry function).
- Schema con 22 intents Zod enum.
- Prompt con CRM section conditional + D-26 instruction.
- Entry function con generateObject + degradation fallback.
- typecheck OK.
- 3 commits atomicos, NO pusheados.
</verification>

<success_criteria>
- Plan 11 (engine) puede invocar `analyzeMessage(...)` con `crmContext` del session state.
- Plan 12 puede testear (mock `ai.generateObject`).
- D-26 implementado en el prompt (instruccion clara al LLM).
- D-05 honrado (CRM context section conditional).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/05-SUMMARY.md` documenting:
- 3 commit hashes (uno por task).
- LoC de cada archivo.
- Quote de la seccion "Estado actual" del prompt (verificar D-26).
- Quote de la seccion "CRM context" del prompt (verificar D-05).
- typecheck output.
</output>
</content>
</invoke>