---
phase: agent-varixcenter
plan: 08
type: execute
wave: 4
depends_on: [06, 07]
files_modified:
  - src/lib/agents/varixcenter/__tests__/transitions.test.ts
  - src/lib/agents/varixcenter/__tests__/comprehension.test.ts
  - src/lib/agents/varixcenter/__tests__/response-track.test.ts
  - src/lib/agents/varixcenter/__tests__/sales-track.test.ts
  - src/lib/agents/varixcenter/__tests__/varixcenter-agent.test.ts
autonomous: true
requirements: [VARIX-CLONE, VARIX-TEMPLATES]

must_haves:
  truths:
    - "Las transiciones del diseño §7 están cubiertas por tests"
    - "El comprehension reconoce los 24 intents en tests"
    - "response-track.test.ts incluye el assert anti-Pitfall 1: expect(callArgs[0]).not.toBe('godentist')"
    - "La suite varixcenter pasa verde y tsc --noEmit = 0"
  artifacts:
    - path: "src/lib/agents/varixcenter/__tests__/response-track.test.ts"
      provides: "tests de selección de template + assert anti-cdc06d9"
      contains: "not.toBe('godentist')"
    - path: "src/lib/agents/varixcenter/__tests__/transitions.test.ts"
      provides: "tests de la máquina §7"
  key_links:
    - from: "response-track.test.ts"
      to: "anti-Pitfall 1"
      via: "expect(callArgs[0]).not.toBe('godentist')"
      pattern: "not.toBe\\('godentist'\\)"
---

<objective>
Wave 4 — Tests del agente (espejo de godentist-fb-ig/__tests__, 6-7 suites/93 tests como referencia de cobertura). Incluye el test anti-regresión CRÍTICO: que response-track llama getTemplatesForIntents con 'varixcenter' y NUNCA 'godentist' (anti-cdc06d9).

Purpose: Probar que la lógica conversacional clonada se comporta según el diseño §7 + que no hay fuga de catálogo. tsc=0 predice deploy verde (MEMORY: build_subprojects_break_next_build).
Output: 5 suites de test en src/lib/agents/varixcenter/__tests__/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts
@src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts
@src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts
@src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts
@src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts

<interfaces>
Framework: Vitest (`npx vitest run src/lib/agents/varixcenter/__tests__/`)
Mock pattern (response-track.test.ts líneas 26-42): vi.hoisted para mock functions visibles a vi.mock factories + vi.mock('@/lib/agents/somnio/template-manager', ...)
Anti-Pitfall 1 assert: tras procesar, el primer arg a getTemplatesForIntents debe ser 'varixcenter' -> expect(callArgs[0]).not.toBe('godentist') y expect(callArgs[0]).toBe('varixcenter')
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: transitions.test.ts + sales-track.test.ts</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts (analog — estructura de tests de transición)
    - src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts (analog)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §7 (las 42 transiciones — casos a cubrir)
    - src/lib/agents/varixcenter/transitions.ts + sales-track.ts (lo que se testea)
  </read_first>
  <files>src/lib/agents/varixcenter/__tests__/transitions.test.ts, src/lib/agents/varixcenter/__tests__/sales-track.test.ts</files>
  <action>
    Clonar la estructura de los analogs y adaptar a las transiciones del diseño §7. Casos mínimos a cubrir (verbatim del diseño §7):
    - initial + quiero_agendar + !datosCriticos -> pedir_datos (L1)
    - initial + datos con datosCriticos + !fechaElegida -> pedir_fecha (L3)
    - initial + info intent (precio_valoracion) -> silence (L2, response track responde)
    - capturing_data + datos completando críticos -> pedir_fecha
    - capturing_data + timer_expired:L1 -> retoma_datos
    - capturing_fecha + datos con fechaElegida -> mostrar_disponibilidad (L4)
    - showing_availability + seleccion_horario -> mostrar_confirmacion (L5)
    - confirming + confirmar + datosCompletos -> agendar_cita (cancel)
    - confirming + rechazar -> no_interesa
    - escape (asesor/queja/reagendamiento/cancelar_cita/paciente_antiguo) en cualquier fase -> handoff
    - rechazar fuera de confirming -> no_interesa
    sales-track.test.ts: probar que dado un estado + análisis, sales-track produce la acción esperada (espejo del analog).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/varixcenter/__tests__/transitions.test.ts src/lib/agents/varixcenter/__tests__/sales-track.test.ts 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - transitions.test.ts cubre al menos: pedir_datos, pedir_fecha, mostrar_disponibilidad, mostrar_confirmacion, agendar_cita, handoff, no_interesa, retoma_datos
    - Tests pasan verde (`npx vitest run ...transitions.test.ts ...sales-track.test.ts` exit 0)
  </acceptance_criteria>
  <done>Transiciones del diseño §7 y sales-track cubiertos y verdes.</done>
</task>

<task type="auto">
  <name>Task 2: comprehension.test.ts + response-track.test.ts (anti-Pitfall 1 CRÍTICO)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts (analog)
    - src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts (analog — mock pattern + assert anti-Pitfall 1 líneas 26-42)
    - src/lib/agents/varixcenter/comprehension-schema.ts + response-track.ts (lo que se testea)
    - .planning/standalone/agent-varixcenter/PLANTILLAS.md (template IDs esperados)
  </read_first>
  <files>src/lib/agents/varixcenter/__tests__/comprehension.test.ts, src/lib/agents/varixcenter/__tests__/response-track.test.ts</files>
  <action>
    **comprehension.test.ts:** Clonar el analog. Probar que el schema valida los 24 intents + que tipo_venas mapea correctamente (arañitas->vasitos, vena gruesa->grandes, las dos->ambas) + que NO existe sede_preferida en el output.

    **response-track.test.ts (CRÍTICO):** Clonar el analog con su mock pattern (vi.hoisted + vi.mock de template-manager). Tests mínimos:
    - **ANTI-PITFALL 1 (obligatorio):** tras procesar un mensaje, capturar el primer argumento de la llamada a getTemplatesForIntents y assert `expect(callArgs[0]).toBe('varixcenter')` Y `expect(callArgs[0]).not.toBe('godentist')`.
    - precio_tratamiento sin tipo_venas -> selecciona template 'triage'.
    - tipo_venas='vasitos' -> selecciona 'info_vasitos'.
    - es_foraneo (ciudad='Cúcuta') -> incluye 'fuera_de_ciudad' como COMP.
    - idioma:'en' -> 'english_response'.
    - acción mostrar_disponibilidad -> 'mostrar_disponibilidad'.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/varixcenter/__tests__/comprehension.test.ts src/lib/agents/varixcenter/__tests__/response-track.test.ts 2>&1 | tail -10; grep -c "not.toBe('godentist')" src/lib/agents/varixcenter/__tests__/response-track.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "not.toBe('godentist')" src/lib/agents/varixcenter/__tests__/response-track.test.ts` >= 1 (anti-Pitfall 1)
    - response-track.test.ts también asserta `toBe('varixcenter')`
    - comprehension.test.ts prueba los mapeos de tipo_venas y ausencia de sede_preferida
    - Ambas suites pasan verde
  </acceptance_criteria>
  <done>Comprehension + response-track testeados; assert anti-cdc06d9 presente y verde.</done>
</task>

<task type="auto">
  <name>Task 3: varixcenter-agent.test.ts + suite completa + tsc</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts (analog — mock del pipeline)
    - src/lib/agents/varixcenter/varixcenter-agent.ts (lo que se testea)
  </read_first>
  <files>src/lib/agents/varixcenter/__tests__/varixcenter-agent.test.ts</files>
  <action>
    Clonar el analog del agent test. Mockear getVarixAvailability + bookVarixAppointment (domain) y probar:
    - mensaje "Hola" -> saludo/triage (silence + response track).
    - acción mostrar_disponibilidad -> llama getVarixAvailability con la fecha.
    - acción agendar_cita con booking ok -> output incluye template cita_agendada.
    - booking retorna slot_taken -> re-consulta availability (no crashea).
    - availability throw -> fail-open (no crashea, cae a sin_disponibilidad/handoff).

    Luego correr la suite COMPLETA del agente + tsc:
    ```bash
    npx vitest run src/lib/agents/varixcenter/__tests__/ 2>&1 | tail -10
    npx tsc --noEmit 2>&1 | tail -5
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/varixcenter/__tests__/ 2>&1 | tail -5; npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"</automated>
  </verify>
  <acceptance_criteria>
    - varixcenter-agent.test.ts mockea domain y prueba availability + booking ok + slot_taken + fail-open
    - La suite COMPLETA `npx vitest run src/lib/agents/varixcenter/__tests__/` pasa verde (5 suites)
    - `npx tsc --noEmit` = 0 errores nuevos (MEMORY: tsc=0 predice deploy verde)
  </acceptance_criteria>
  <done>Suite del agente completa y verde; tsc=0.</done>
</task>

</tasks>

<verification>
- 5 suites existen en src/lib/agents/varixcenter/__tests__/
- `npx vitest run src/lib/agents/varixcenter/__tests__/` verde
- assert anti-Pitfall 1 presente
- tsc --noEmit = 0
</verification>

<success_criteria>
- 5 suites verdes cubriendo transiciones §7, comprehension 24 intents, response-track (anti-cdc06d9), agent write-path
- tsc=0
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/08-SUMMARY.md`
</output>
