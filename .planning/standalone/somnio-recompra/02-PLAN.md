---
phase: somnio-recompra
plan: 02
type: execute
wave: 2
depends_on: ["somnio-recompra-01"]
files_modified:
  - src/lib/agents/somnio-recompra/comprehension-prompt.ts
  - src/lib/agents/somnio-recompra/comprehension.ts
  - src/lib/agents/somnio-recompra/transitions.ts
  - src/lib/agents/somnio-recompra/sales-track.ts
  - src/lib/agents/somnio-recompra/response-track.ts
autonomous: true

must_haves:
  truths:
    - "Comprehension prompt is client-aware: knows datos are preloaded, mentions address confirmation context"
    - "Transition table handles 3 entry scenarios: solo saluda, quiere pedir, datos espontaneos"
    - "Address confirmation gate: 'quiere pedir' scenario must confirm address before promos"
    - "'Si' contextual handling: comprehension checks bot's previous question for confirmar_direccion"
    - "Only L3, L4, L5 timers emitted by transitions"
    - "precio intent sends promos (not 'cual deseas?') and excludes tiempo_efecto_1"
    - "Response track reuses v3 template patterns for promos, confirmation, order creation"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/comprehension-prompt.ts"
      provides: "buildSystemPrompt for Claude Haiku comprehension"
      exports: ["buildSystemPrompt"]
    - path: "src/lib/agents/somnio-recompra/comprehension.ts"
      provides: "comprehend() function calling Claude Haiku"
      exports: ["comprehend"]
    - path: "src/lib/agents/somnio-recompra/transitions.ts"
      provides: "Declarative transition table + resolveTransition"
      exports: ["TRANSITIONS", "resolveTransition", "systemEventToKey"]
    - path: "src/lib/agents/somnio-recompra/sales-track.ts"
      provides: "resolveSalesTrack — WHAT TO DO"
      exports: ["resolveSalesTrack"]
    - path: "src/lib/agents/somnio-recompra/response-track.ts"
      provides: "resolveResponseTrack — WHAT TO SAY"
      exports: ["resolveResponseTrack"]
  key_links:
    - from: "comprehension-prompt.ts"
      to: "comprehension.ts"
      via: "buildSystemPrompt imported in comprehend()"
      pattern: "import.*buildSystemPrompt.*from.*comprehension-prompt"
    - from: "transitions.ts"
      to: "sales-track.ts"
      via: "resolveTransition called by resolveSalesTrack"
      pattern: "import.*resolveTransition.*from.*transitions"
    - from: "sales-track.ts"
      to: "response-track.ts"
      via: "sales-track output feeds response-track in main pipeline"
      pattern: "SalesTrackOutput"
---

<objective>
Create the business logic layer for the somnio-recompra agent: comprehension (Claude Haiku call + prompt), transition table, sales track, and response track.

Purpose: These 5 files implement the two-track decision architecture — comprehension understands the message, sales-track decides WHAT TO DO, response-track decides WHAT TO SAY. The recompra version has a simplified transition table (no data capture phase, no ofi inter) and a client-aware comprehension prompt.

Output: 5 new files completing the agent's decision-making pipeline.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra/CONTEXT.md
@.planning/standalone/somnio-recompra/RESEARCH.md
@.planning/standalone/somnio-recompra/01-SUMMARY.md

# Source files to fork from (READ these, do NOT modify them):
@src/lib/agents/somnio-v3/comprehension-prompt.ts
@src/lib/agents/somnio-v3/comprehension.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/response-track.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Comprehension Prompt and Claude Haiku Call</name>
  <files>
    src/lib/agents/somnio-recompra/comprehension-prompt.ts
    src/lib/agents/somnio-recompra/comprehension.ts
  </files>
  <action>
    **comprehension-prompt.ts** — Fork from somnio-v3/comprehension-prompt.ts with these KEY changes:

    1. `buildSystemPrompt(existingData, recentBotMessages)` — Same signature.

    2. Product info section: SAME as v3 (Somnio, prices, shipping, payment, INVIMA).

    3. Bot context section (recentBotMessages): ENHANCED with recompra-specific rules:
       - Keep all existing v3 context rules ("si" after compra question → quiero_comprar, etc.)
       - ADD: "Si el bot pregunto 'Seria para la misma direccion? [direccion]' y el cliente dice 'si'/'dale'/'esa misma'/'correcto' → intent = confirmar_direccion"
       - ADD: "Si el bot pregunto 'Seria para la misma direccion?' y el cliente dice 'no'/'otra'/'diferente' y da nueva direccion → intent = datos (with new address extracted)"

    4. Extraction rules: Same EXCEPT:
       - Remove rules about contenido, formula, como_se_toma, efectividad (those intents don't exist)
       - Keep entrega_oficina and menciona_inter extraction rules (comprehension detects, agent just won't act on them for now)

    5. Intent list description: Describe only the ~19 RECOMPRA_INTENTS. Key additions:
       - `confirmar_direccion`: "Cliente confirma que la direccion precargada es correcta. Respuestas a '¿Seria para la misma direccion?': si, dale, esa misma, correcto, a la misma"
       - `precio`: In recompra, this still maps to price question but response will include promos directly

    6. ADD new section: "CONTEXTO DE RECOMPRA: Este cliente ya compro antes. Sus datos (nombre, direccion, etc.) ya estan precargados. No necesita capturar datos desde cero, solo confirmar o actualizar."

    **comprehension.ts** — Fork from somnio-v3/comprehension.ts:
    - Same structure: calls Claude Haiku with structured output (AI SDK generateObject)
    - Import `buildSystemPrompt` from local `./comprehension-prompt`
    - Import `MessageAnalysisSchema` from local `./comprehension-schema`
    - Same function signature: `comprehend(message, existingData, history, recentBotMessages)`
    - Same error handling, same token tracking
    - No changes to the Claude call pattern — only the prompt content differs (via buildSystemPrompt)
  </action>
  <verify>
    `npx tsc --noEmit src/lib/agents/somnio-recompra/comprehension-prompt.ts src/lib/agents/somnio-recompra/comprehension.ts` compiles cleanly.
    Verify comprehension-prompt.ts contains "confirmar_direccion" in the intent descriptions.
    Verify comprehension-prompt.ts contains "CONTEXTO DE RECOMPRA" section.
    Verify comprehension.ts imports from LOCAL ./comprehension-prompt and ./comprehension-schema (not from somnio-v3).
  </verify>
  <done>
    Comprehension layer complete. Prompt is client-aware with address confirmation context. Claude call uses same AI SDK pattern. All imports are local to somnio-recompra module.
  </done>
</task>

<task type="auto">
  <name>Task 2: Transition Table, Sales Track, and Response Track</name>
  <files>
    src/lib/agents/somnio-recompra/transitions.ts
    src/lib/agents/somnio-recompra/sales-track.ts
    src/lib/agents/somnio-recompra/response-track.ts
  </files>
  <action>
    **transitions.ts** — Fork from somnio-v3/transitions.ts. COMPLETELY REWRITTEN transition table:

    Import types from local `./types`, state functions from local `./state`. Use `RecompraPhase` instead of `Phase`.

    Same structure: `TransitionEntry[]` with phase, on, action, condition, resolve. Same `resolveTransition()` and `systemEventToKey()` functions.

    Transition entries (simplified from v3's ~30+ to ~15):

    ANY-phase transitions:
    - `*` + no_interesa → no_interesa, cancel timer
    - `*` + rechazar → rechazar, cancel timer
    - `*` + acknowledgment → silence, start L5

    Initial phase:
    - `initial` + saludo → ofrecer_promos (BUT: response track will prepend greeting + address question for "quiere pedir" scenario. The transition itself goes to promos because recompra skips data capture. WAIT — no. For "quiere pedir" (escenario 2), we need address confirmation BEFORE promos.)

    REVISED initial transitions for 3 entry scenarios:
    - `initial` + saludo → ofrecer_promos, start L3. (Escenario 1: greeting + "Deseas adquirir?" + promos. Response track handles greeting by time of day.)
    - `initial` + quiero_comprar + !direccionConfirmada → preguntar_direccion. (Escenario 2: ask about address before promos. Start L5 for address response timeout.)
    - `initial` + quiero_comprar + direccionConfirmada → ofrecer_promos, start L3.
    - `initial` + datos + datosCriticos → ofrecer_promos, start L3. (Escenario 3: spontaneous data with enough info → straight to promos.)
    - `initial` + datos + !datosCriticos → preguntar_direccion. (Escenario 3 incomplete: missing critical fields → ask what's missing.)
    - `initial` + confirmar_direccion → ofrecer_promos, start L3. (Client confirmed address → promos.)
    - `initial` + precio → ofrecer_promos, start L3. (precio in recompra sends promos directly.)

    promos_shown:
    - `promos_shown` + seleccion_pack + datosCriticos → mostrar_confirmacion, start L4.
    - `promos_shown` + seleccion_pack + !datosCriticos → preguntar_direccion. (Edge case: datos were cleared somehow.)
    - `promos_shown` + timer_expired:3 → crear_orden_sin_promo, cancel timer. (L3: 10min no response after promos.)

    confirming:
    - `confirming` + confirmar + packElegido + datosCriticos → crear_orden, cancel timer.
    - `confirming` + confirmar + !packElegido → ofrecer_promos, start L3.
    - `confirming` + datos → cambio, start L4. (Client wants to change data in confirming.)
    - `confirming` + timer_expired:4 → crear_orden_sin_confirmar, cancel timer. (L4: 10min no confirm.)

    ANY-phase pack selection:
    - `*` + seleccion_pack + datosCriticos → mostrar_confirmacion, start L4.
    - `*` + seleccion_pack + !datosCriticos → preguntar_direccion.

    ANY-phase confirmar:
    - `*` + confirmar + datosCriticos + packElegido → crear_orden, cancel timer.
    - `*` + confirmar + !packElegido → ofrecer_promos, start L3.

    Retoma:
    - `initial` + timer_expired:5 → retoma. (L5: silence retoma in initial.)

    Closed fallback:
    - `closed` + * → silence.

    **sales-track.ts** — Fork from somnio-v3/sales-track.ts:
    - Same structure: `resolveSalesTrack(event, state, gates)` returns `SalesTrackOutput`.
    - Uses `resolveTransition()` from local transitions.
    - Same fallback logic for unmatched transitions.
    - Import from local types, transitions, phase.
    - Simpler because no ingest/captura logic. No auto:datos_completos event.

    **response-track.ts** — Fork from somnio-v3/response-track.ts:
    - Same structure: `resolveResponseTrack(intent, salesAction, state, gates, session, workspaceId)` returns `ResponseTrackOutput`.
    - Uses TemplateManager from `@/lib/agents/somnio/` (shared utility, same as v3).
    - Uses `composeBlock` from `@/lib/agents/somnio/block-composer` (shared).
    - Key changes:
      - `preguntar_direccion` action: Template that shows preloaded address + asks "Seria para la misma direccion? [direccion completa]"
      - `ofrecer_promos` in initial: Prepend time-of-day greeting "[Buenos dias/tardes/noches] [nombre]" before promos
      - `precio` intent: Send promos + modo_pago. Exclude tiempo_efecto_1.
      - `mostrar_confirmacion`: Same as v3 — show order summary
      - `crear_orden` / variants: Same as v3
      - `cambio`: Same as v3 — show updated confirmation
      - `retoma`: Same as v3 — "Quedamos pendientes"
    - Add helper: `getGreeting(nombre: string): string` — computes Buenos dias/tardes/noches based on Colombia timezone hour + first name only.
  </action>
  <verify>
    `npx tsc --noEmit src/lib/agents/somnio-recompra/transitions.ts src/lib/agents/somnio-recompra/sales-track.ts src/lib/agents/somnio-recompra/response-track.ts` compiles cleanly.
    Verify transitions.ts does NOT contain 'capturing_data' phase.
    Verify transitions.ts only emits L3, L4, L5 timer levels.
    Verify response-track.ts imports TemplateManager from somnio/ (shared).
    Verify `getGreeting` helper exists in response-track.ts.
  </verify>
  <done>
    Business logic pipeline complete. Transition table handles 3 entry scenarios with address confirmation gate. Sales track routes decisions. Response track generates templates with time-of-day greeting and reuses v3 template patterns.
  </done>
</task>

</tasks>

<verification>
- All 5 files compile with `npx tsc --noEmit`
- Transition table has ~15 entries (vs v3's ~30+)
- No reference to 'capturing_data', 'pedir_datos', ofi inter actions
- Timer signals only use L3, L4, L5
- Comprehension prompt contains 'confirmar_direccion' intent description
- Response track has getGreeting() helper using America/Bogota timezone
- All imports are local to somnio-recompra/ except shared utilities (somnio/normalizers, somnio/block-composer, somnio/TemplateManager)
</verification>

<success_criteria>
Two-track decision architecture complete for recompra. Comprehension understands client context. Transitions handle simplified flow with address confirmation. Response track generates appropriate templates with personalized greetings. Ready for main agent pipeline (Plan 03).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra/02-SUMMARY.md`
</output>
