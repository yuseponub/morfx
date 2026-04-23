---
phase: somnio-recompra-template-catalog
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-recompra/transitions.ts
autonomous: true

must_haves:
  truths:
    - "La entry de `saludo` en initial fue ELIMINADA de TRANSITIONS (Q#1 resuelto: null fallback en sales-track.ts:88-93 hace que response-track emita saludo templates via INFORMATIONAL_INTENTS branch)"
    - "La entry `quiero_comprar` en initial tiene `action: 'preguntar_direccion'` (D-04) — NO `'ofrecer_promos'`"
    - "La entry `quiero_comprar` en initial tiene `timerSignal.level: 'L5'` (coherente con esperar respuesta del cliente a la pregunta de direccion)"
    - "El comment/description actualizado refleja el nuevo flujo (NO dice 'promos directas')"
    - "`npm run typecheck` pasa exit 0 (sin errores nuevos)"
    - "Ningun cambio empuja a Vercel — Wave 1 queda en local hasta Plan 05"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/transitions.ts"
      provides: "State machine alineada con D-04 (quiero_comprar → preguntar_direccion) + D-05 (saludo no dispara accion)"
      contains: "action: 'preguntar_direccion'"
  key_links:
    - from: "src/lib/agents/somnio-recompra/transitions.ts (entry quiero_comprar)"
      to: "src/lib/agents/somnio-recompra/response-track.ts:336-361 (branch preguntar_direccion)"
      via: "sales-track invoca transition → action='preguntar_direccion' → response-track emite template 'preguntar_direccion_recompra' con direccion_completa"
      pattern: "on: 'quiero_comprar'"
    - from: "src/lib/agents/somnio-recompra/transitions.ts (ausencia de entry saludo)"
      to: "src/lib/agents/somnio-recompra/sales-track.ts:88-93 (fallback null)"
      via: "resolveTransition devuelve null → sales-track retorna sin accion → response-track procesa intent='saludo' como informational"
      pattern: "No transition - response track handles informational"
---

<objective>
Wave 1 (parallel con Plan 02) — Ajustar transitions.ts para implementar D-04 (quiero_comprar dispara preguntar_direccion) y D-05 (saludo NO dispara ofrecer_promos). Resolver Open Q#1 de RESEARCH.md eliminando la entry de saludo completamente — ya verified que sales-track fallback a `null` es safe (src/lib/agents/somnio-recompra/sales-track.ts:88-93 retorna sin action y response-track procesa el intent informational).

Purpose:
- D-04: Cliente dice "sí/quiero comprar" en initial → bot pregunta confirmacion de direccion (usando CRM reader preloaded data + template de Plan 01) → despues de confirmar, van las promos.
- D-05: Cliente solo saluda → bot responde saludo + imagen ELIXIR → espera respuesta del cliente (NO empuja promos en el mismo turno).

Output: 1 archivo modificado (`transitions.ts`). 1 commit atomico. NO push.

**CRITICAL — Regla 5 + D-09:** Este codigo NO pushea a Vercel. Push en Plan 05 Task 2 junto con Plan 02.

**Q#1 resolution documented inline:** En vez de `action: 'silence'` o `action: 'ofrecer_promos'`, eliminar la entry completa. RESEARCH.md §Open Q#1 detalla las 3 opciones; la eleccion aqui es **remove-entry** porque:
1. Leyendo `sales-track.ts:72-93` — cuando `resolveTransition` devuelve `null`, sales-track retorna `{reason: 'No transition - response track handles informational'}` SIN `accion`. No tira error, no cancela el pipeline.
2. `response-track.ts:72` procesa `intent='saludo' ∈ INFORMATIONAL_INTENTS.has('saludo')` (verified constants.ts:67 — `'saludo'` ya esta en el Set) → pushea `'saludo'` a `infoTemplateIntents`.
3. El block composer emite ambas rows (texto orden=0 + imagen orden=1) porque `hasSaludoCombined = false` cuando allIntents=['saludo'] (condicion requiere length > 1) → cae en branch normal de `composeBlock(byIntent, [])` que respeta CORE + COMPLEMENTARIA.
4. Cero riesgo de que `'silence'` cancele timer o bloquee dispatch — esa signal ya se usa en la entry `acknowledgment` (line 54-61) con su propio timerSignal, y aqui no queremos iniciar timer de recompra hasta que el cliente exprese intencion de comprar.

Resultado esperado: turn-0 saludo → "Buenos dias Jose 😊" + imagen ELIXIR — sin promos, sin timer L3 (timer L5 no se inicia tampoco — es OK: cliente hablara proximamente).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-04, D-05
@.planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Existing Patterns #4 (current vs target state table), §Open Questions Q#1 (resolucion), §Code Examples (Mini-diff transitions.ts)
@.planning/standalone/somnio-recompra-template-catalog/01-PLAN.md (catalogo — depends_on para que el saludo+imagen existan cuando response-track los busque)
@CLAUDE.md §Regla 5 (migracion antes de deploy — NO pushear este plan)
@src/lib/agents/somnio-recompra/transitions.ts (estado actual — leer lineas 63-83 completas antes de editar)
@src/lib/agents/somnio-recompra/sales-track.ts lineas 60-94 (verificar que null fallback es benign — ya verified por Claude en plan-phase)

<interfaces>
<!-- transitions.ts lineas 63-73 (estado actual — DEBE eliminarse) -->
// Escenario 1: saludo → ofrecer promos (response track prepends greeting)
{
  phase: 'initial', on: 'saludo', action: 'ofrecer_promos',
  resolve: () => ({
    timerSignal: { type: 'start', level: 'L3', reason: 'saludo → promos' },
    reason: 'Saludo en initial → greeting + promos',
  }),
  description: 'Escenario 1: saludo → greeting personalizado + promos',
},

<!-- transitions.ts lineas 75-83 (estado actual — DEBE cambiar) -->
// Escenario 2: quiero_comprar → promos directas (recompra: no preguntar direccion en initial)
{
  phase: 'initial', on: 'quiero_comprar', action: 'ofrecer_promos',
  resolve: () => ({
    timerSignal: { type: 'start', level: 'L3', reason: 'quiero_comprar → promos' },
    reason: 'Quiere comprar en initial → promos directas',
  }),
  description: 'Escenario 2: quiero_comprar → promos (sin gate de direccion)',
},

<!-- sales-track.ts lineas 72-93 (VERIFIED — null fallback es safe) -->
const match = resolveTransition(phase, intent, state, gates, changes)
if (match) { ... return { accion: match.action, ... } }
// no match:
return { reason: 'No transition - response track handles informational' }  // sin accion

<!-- Confirmacion: saludo ∈ INFORMATIONAL_INTENTS -->
// constants.ts:67-71 — 'saludo' esta en el Set (verified)
// response-track.ts:72 — if (intent && INFORMATIONAL_INTENTS.has(intent)) { ... infoTemplateIntents.push(intent) }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: transitions.ts — remove saludo entry (D-05, Q#1) + cambiar quiero_comprar a preguntar_direccion (D-04)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/transitions.ts COMPLETO (306 lineas, archivo pequeño — leerlo todo de una vez)
    - src/lib/agents/somnio-recompra/sales-track.ts lineas 40-94 (verificar handling de resolveTransition null — ya documentado en plan objective pero el executor debe re-verificarlo antes de editar)
    - src/lib/agents/somnio-recompra/constants.ts linea 67-71 (confirmar que `'saludo'` YA esta en INFORMATIONAL_INTENTS, pre-condicion para que la eliminacion sea segura)
    - src/lib/agents/somnio-recompra/response-track.ts lineas 72-93 (procesamiento de intent informational — confirma que saludo cae en este branch cuando no hay salesAction)
    - .planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Open Questions Q#1 (las 3 opciones + eleccion remove-entry)
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-04, D-05
  </read_first>
  <behavior>
    - Test 1 (unit, Plan 04): `resolveTransition('initial', 'saludo', state, gates)` retorna `null` (NO hay entry matching — fallback al handler de sales-track).
    - Test 2 (unit, Plan 04): `resolveTransition('initial', 'quiero_comprar', state, gates)` retorna `{action: 'preguntar_direccion', output: {...}}`.
    - Test 3 (integrado, Plan 04): flujo end-to-end con mock de TemplateManager — turn-0 `intent='saludo'` produce mensajes `[{contentType:'texto', content: 'Buenos XXX Jose 😊'}, {contentType:'imagen', content: '<URL>'}]` sin templates de `promociones`.
    - Test 4 (integrado, Plan 04): turn-1 `intent='quiero_comprar'` post-saludo produce mensaje con template `preguntar_direccion_recompra` con `direccion_completa` poblado.
    - Edge: si el cliente dice saludo+quiero_comprar mismo turno (raro), `quiero_comprar` gana (se matchea primero en TRANSITIONS — ya que saludo ya no tiene entry).
    - Edge: si Haiku devuelve `intent='saludo'` con `phase != 'initial'` (ej. 'confirming'), antes tampoco matcheaba porque la entry era `phase: 'initial'` — cambio es no-op para ese caso.
  </behavior>
  <action>
    Abrir `src/lib/agents/somnio-recompra/transitions.ts` y aplicar **2 cambios exactos**:

    **Cambio 1 — Eliminar lineas 63-73 completas (Escenario 1 saludo → ofrecer_promos) [D-05 + Q#1]:**

    OLD (lineas 63-73, eliminar el bloque completo incluyendo el comment):
    ```typescript
      // ======== Initial phase — 3 entry scenarios ========

      // Escenario 1: saludo → ofrecer promos (response track prepends greeting)
      {
        phase: 'initial', on: 'saludo', action: 'ofrecer_promos',
        resolve: () => ({
          timerSignal: { type: 'start', level: 'L3', reason: 'saludo → promos' },
          reason: 'Saludo en initial → greeting + promos',
        }),
        description: 'Escenario 1: saludo → greeting personalizado + promos',
      },
    ```

    NEW (reemplazar por un header comment actualizado — NO entry):
    ```typescript
      // ======== Initial phase — 2 entry scenarios (saludo handled by response-track's INFORMATIONAL_INTENTS branch) ========
      //
      // [D-05 + Q#1 resolved removing the saludo entry] When Haiku returns intent='saludo' in initial phase,
      // resolveTransition returns null → sales-track.ts:88-93 returns without accion → response-track.ts:72
      // processes 'saludo' ∈ INFORMATIONAL_INTENTS (constants.ts:67-71) → block composer emits the 2 rows
      // stored in agent_templates under agent_id='somnio-recompra-v1' intent='saludo' (texto orden=0 + imagen
      // orden=1, seeded by Plan 01 of somnio-recompra-template-catalog). No timer L3 starts — we wait for the
      // client's next message (quiero_comprar, datos, precio, etc.) to advance the conversation.
    ```

    **Cambio 2 — Modificar lineas (antes 75-83, ahora con los comments renumerados) del Escenario 2 [D-04]:**

    OLD (la entry de `quiero_comprar`):
    ```typescript
      // Escenario 2: quiero_comprar → promos directas (recompra: no preguntar direccion en initial)
      {
        phase: 'initial', on: 'quiero_comprar', action: 'ofrecer_promos',
        resolve: () => ({
          timerSignal: { type: 'start', level: 'L3', reason: 'quiero_comprar → promos' },
          reason: 'Quiere comprar en initial → promos directas',
        }),
        description: 'Escenario 2: quiero_comprar → promos (sin gate de direccion)',
      },
    ```

    NEW (reemplazar por):
    ```typescript
      // Escenario 1: quiero_comprar → preguntar_direccion (recompra: confirma direccion con CRM reader preloaded data)
      {
        phase: 'initial', on: 'quiero_comprar', action: 'preguntar_direccion',
        resolve: () => ({
          timerSignal: { type: 'start', level: 'L5', reason: 'quiero_comprar → preguntar direccion' },
          reason: 'Quiere comprar en initial → preguntar confirmacion de direccion (CRM-reader-enabled)',
        }),
        description: 'Escenario 1: quiero_comprar → preguntar_direccion (D-04 — templates cargados desde Plan 01 migration)',
      },
    ```

    **Nota sobre el timer:** Cambio `L3` → `L5` porque:
    - Antes (OLD): `L3` = "promos sin respuesta" (600s) — tenia sentido cuando el bot ya habia enviado promos y esperaba respuesta.
    - Ahora (NEW): el bot envia pregunta "¿Sería para la misma dirección?" y espera respuesta — mas cercano a "silencio despues de pregunta abierta" = `L5` (90s real, 9s rapido). Si el cliente no responde en 90s, el Timer L5 trigger → `timer_expired:5` → resuelve via entry `phase: 'initial', on: 'timer_expired:5'` (linea 243-248 transitions.ts → action `'retoma'`). Cadena coherente.

    **Nota sobre renumeracion de Escenarios:** La enumeracion textual en los `description:` cambia porque la entry Escenario 1 (saludo) fue eliminada. La entry `quiero_comprar` pasa de ser "Escenario 2" a "Escenario 1". Los comments de las entries subsiguientes (`datos`, `confirmar_direccion`, `precio`) pueden mantener su numeracion vieja (Escenario 3, etc.) o re-numerarse — preferir **mantener la numeracion vieja** para minimizar diff (solo cambiar las 2 entries tocadas). Solo actualizar la description de `quiero_comprar` a "Escenario 1" para reflejar la nueva posicion.

    **NO tocar** las entries subsiguientes (Escenario 3 `datos`, Escenario 3 incompleto, `confirmar_direccion`, `precio`, promos_shown, confirming, etc.) — solo hay 2 cambios locales.

    **Verificar post-edicion con typecheck:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-03-01.log
    # Expected: exit 0, sin errors nuevos en transitions.ts.
    ```

    **Smoke del runner (opcional pero util) — correr los tests existentes de recompra:**
    ```bash
    npm run test -- src/lib/agents/somnio-recompra/__tests__/
    # Expected: tests existentes (comprehension-prompt, crm-context-poll) siguen pasando — no tocamos nada relacionado.
    ```

    **Commit atomico:**
    ```bash
    git add src/lib/agents/somnio-recompra/transitions.ts
    git commit -m "feat(somnio-recompra-template-catalog): saludo sin action + quiero_comprar preguntar direccion (D-04, D-05)"
    ```

    **NO push.**
  </action>
  <verify>
    <automated>! grep -qF "on: 'saludo', action: 'ofrecer_promos'" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>! grep -qF "Saludo en initial → greeting + promos" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>grep -q "on: 'quiero_comprar', action: 'preguntar_direccion'" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>! grep -qF "on: 'quiero_comprar', action: 'ofrecer_promos'" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>grep -qF "Quiere comprar en initial → preguntar confirmacion de direccion" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>grep -q "level: 'L5', reason: 'quiero_comprar → preguntar direccion'" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>grep -qF "saludo handled by response-track's INFORMATIONAL_INTENTS branch" src/lib/agents/somnio-recompra/transitions.ts</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-03-01.log; ! grep -F "transitions.ts" /tmp/tc-03-01.log | grep -q "error"</automated>
    <automated>npm run test -- src/lib/agents/somnio-recompra/__tests__/ 2>&1 | tee /tmp/test-03-01.log; grep -qE "Test Files.*passed|PASS" /tmp/test-03-01.log</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-recompra-template-catalog): saludo sin action + quiero_comprar preguntar direccion"</automated>
  </verify>
  <acceptance_criteria>
    - La entry `{phase: 'initial', on: 'saludo', action: 'ofrecer_promos', ...}` fue ELIMINADA completamente de TRANSITIONS (grep verifica absence).
    - La entry `quiero_comprar` en initial tiene ahora `action: 'preguntar_direccion'` (NO `'ofrecer_promos'`).
    - La entry `quiero_comprar` tiene `timerSignal.level: 'L5'` (NO `'L3'`).
    - El header comment arriba de las entries de initial phase menciona "handled by response-track's INFORMATIONAL_INTENTS branch" (documenta Q#1 resolution inline).
    - Ninguna OTRA entry de TRANSITIONS fue modificada (verificar con diff — solo 2 regiones tocadas).
    - `npm run typecheck` no introduce errores nuevos en transitions.ts.
    - `npm run test` (suite completa recompra) sigue passing — no rompimos tests existentes.
    - Commit atomico con mensaje empezando con `feat(somnio-recompra-template-catalog): saludo sin action`.
  </acceptance_criteria>
  <done>
    - Entry saludo eliminada, entry quiero_comprar actualizada.
    - Header comment documenta Q#1 resolution para futuros devs.
    - Typecheck + tests pasan.
    - Commit en git, NO pusheado.
  </done>
</task>

</tasks>

<verification>
- transitions.ts NO tiene entry con `on: 'saludo', action: 'ofrecer_promos'`.
- transitions.ts tiene entry con `on: 'quiero_comprar', action: 'preguntar_direccion'` + `level: 'L5'`.
- Header comment en initial section documenta el fallback null → INFORMATIONAL_INTENTS branch (Q#1 resolution explicita).
- `npm run typecheck` pasa sin errors nuevos.
- Tests existentes pasan (no regresion).
- 1 commit atomico en git, NO pusheado.
</verification>

<success_criteria>
- State machine alineada con D-04 (quiero_comprar → preguntar_direccion) + D-05 (saludo NO accion).
- Plan 04 puede escribir tests unitarios que llamen `resolveTransition('initial', 'saludo', ...)` y `resolveTransition('initial', 'quiero_comprar', ...)` y asserten el comportamiento nuevo.
- Plan 05 push el cambio con confianza — state machine behavior coherente con catalogo poblado.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-template-catalog/03-SUMMARY.md` documenting:
- Commit hash de Task 1 (`feat(...): saludo sin action + quiero_comprar preguntar direccion`)
- Diff exacto de las 2 regiones modificadas (pegar OLD y NEW verbatim del action)
- Output del typecheck y test suite — confirmar 0 errores/fallas
- Justificacion documentada de Q#1 resolution (citar la seccion del objective)
- Confirmacion explicita: "NO pusheado — esperar Plan 05"
</output>
