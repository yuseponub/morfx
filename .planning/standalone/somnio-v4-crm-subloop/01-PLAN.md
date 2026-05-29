---
phase: somnio-v4-crm-subloop
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/constants.ts
  - src/lib/agents/somnio-v4/transitions.ts
  - src/lib/agents/somnio-v4/response-track.ts
  - src/lib/agents/somnio-v4/phase.ts
requirements: [D-15, D-17, D-18, D-19]
autonomous: true
must_haves:
  truths:
    - "Existen 3 nuevos TipoAccion: recordar_promo, recordar_confirmacion, confirmar_orden"
    - "El timer L3 emite recordar_promo (NO crear_orden_sin_promo); L4 emite recordar_confirmacion (NO crear_orden_sin_confirmar)"
    - "La transicion R5 (confirmar) emite confirmar_orden (NO crear_orden)"
    - "recordar_promo/recordar_confirmacion NO estan en CRM_ACTIONS ni CREATE_ORDER_ACTIONS (desacople create por timer)"
    - "response-track mapea recordar_promo->pendiente_promo, recordar_confirmacion->pendiente_confirmacion, confirmar_orden->confirmacion_orden_*"
    - "resumen_<pack> sigue ligado a mostrar_confirmacion (sin cambio)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "3 nuevos miembros del union TipoAccion"
      contains: "recordar_promo"
    - path: "src/lib/agents/somnio-v4/constants.ts"
      provides: "CREATE_ORDER_ACTIONS/CRM_ACTIONS sin los recordar_*; confirmar_orden ausente de CREATE_ORDER_ACTIONS"
      contains: "CREATE_ORDER_ACTIONS"
    - path: "src/lib/agents/somnio-v4/transitions.ts"
      provides: "L3->recordar_promo, L4->recordar_confirmacion, R5->confirmar_orden"
      contains: "recordar_promo"
    - path: "src/lib/agents/somnio-v4/response-track.ts"
      provides: "casos recordar_*/confirmar_orden re-apuntados a los mismos templates"
      contains: "recordar_promo"
  key_links:
    - from: "transitions.ts L3/L4"
      to: "response-track.ts cases"
      via: "TipoAccion symbol re-pointed to same template intent"
      pattern: "recordar_(promo|confirmacion)"
---

<objective>
Capa de SÍMBOLOS PUROS del rediseño del lifecycle (D-15/D-17/D-18/D-19). Cero side-effects
CRM aquí — solo se renombran/re-apuntan las TipoAccion de la state-machine y sus templates.

Tres cambios deterministas (aceptados explícitamente por el usuario en discuss 2026-05-29):
1. **D-19 (desacople timer):** los timers L3/L4 hoy emiten `crear_orden_sin_promo` /
   `crear_orden_sin_confirmar` (que crean orden por timer). Pasan a emitir símbolos NUEVOS
   `recordar_promo` / `recordar_confirmacion` que SOLO mapean al mismo template recordatorio
   (`pendiente_promo` / `pendiente_confirmacion`) y NO entran a `CREATE_ORDER_ACTIONS` →
   `shouldCreateOrder=false` en el timer path → el timer ya no crea (el cascarón nace temprano
   en el Plan 06).
2. **D-18 (confirmar→mover):** la transición R5 (`confirmar + datosCriticos + packElegido`)
   emite `confirmar_orden` (NUEVO) en vez de `crear_orden`. El template `confirmacion_orden_*`
   (hoy ligado a `crear_orden`) se re-apunta a `confirmar_orden`. La mutación real
   (`moveOrderToStage(CONFIRMADO)`) la ejecuta el sub-loop en el Plan 06 — aquí solo el símbolo.
3. **D-17 (pack→update):** `mostrar_confirmacion` queda intacto (sigue mapeando a `resumen_<pack>`);
   el `updateOrder` que enriquece el cascarón con el pack lo cablea el gate del Plan 06 cuando
   `accion === 'mostrar_confirmacion'`. Aquí NO se toca `mostrar_confirmacion`.

Purpose: separar la capa de símbolos (este plan, sin riesgo de mutación) de la capa de ejecución
(Plan 06). transitions/response-track/phase producen símbolos puros; NUNCA side-effects (D-04).
Output: 3 TipoAccion nuevos + sets CRM ajustados + transiciones re-apuntadas + templates coherentes.

NO se toca el camino de ejecución CRM. NO se toca el gate. NO se borra invocations.ts (Plan 06).
NO se modifica `mostrar_confirmacion`. v4 DORMANT — Regla 6 satisfecha (todo es archivo somnio-v4-specific).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md

<interfaces>
<!-- Contratos verbatim leidos del codebase. NO explorar: usar directamente. -->

TipoAccion union actual (types.ts:322-342): incluye `crear_orden | crear_orden_sin_promo |
crear_orden_sin_confirmar | mostrar_confirmacion | ofrecer_promos | ...`. AGREGAR (no quitar)
`recordar_promo | recordar_confirmacion | confirmar_orden`. NO eliminar los `crear_orden*`
todavia (otros consumidores los referencian; se podan en Plan 06 cuando se trace que ya no
tienen consumer vivo).

Sets actuales (constants.ts:185-200):
- SIGNIFICANT_ACTIONS incluye 'crear_orden','crear_orden_sin_promo','crear_orden_sin_confirmar'.
- CRM_ACTIONS = {'crear_orden','crear_orden_sin_promo','crear_orden_sin_confirmar'}.
- CREATE_ORDER_ACTIONS = {'crear_orden','crear_orden_sin_promo','crear_orden_sin_confirmar'}.

Transiciones (transitions.ts):
- R5 (:261-269): `{ phase:'*', on:'confirmar', action:'crear_orden', condition:(_,g)=>g.datosCriticos && g.packElegido, resolve:()=>({ timerSignal:{type:'cancel',...}, ... }) }`.
- L3 (:337-344): `{ phase:'promos_shown', on:'timer_expired:3', action:'crear_orden_sin_promo', resolve:()=>({ timerSignal:{type:'cancel',...}, ... }) }`.
- L4 (:346-353): `{ phase:'confirming', on:'timer_expired:4', action:'crear_orden_sin_confirmar', resolve:()=>({ timerSignal:{type:'cancel',...}, ... }) }`.

response-track.ts (resolveSalesActionTemplates :278-326):
- `case 'mostrar_confirmacion': case 'cambio':` -> `resumen_<pack>` (NO TOCAR).
- `case 'crear_orden':` -> `confirmacion_orden_same_day | confirmacion_orden_transportadora` (segun delivery-zone).
- `case 'crear_orden_sin_promo':` -> `['pendiente_promo']`.
- `case 'crear_orden_sin_confirmar':` -> `['pendiente_confirmacion']`.

phase.ts derivePhase (:23-39): switch mapea `crear_orden|crear_orden_sin_promo|crear_orden_sin_confirmar -> 'order_created'`.

S3 del RESEARCH (inventario de 10 consumidores) confirma: sacar recordar_* de CREATE_ORDER_ACTIONS
es el corazon del desacople (somnio-v4-agent.ts:927 timer path lee CREATE_ORDER_ACTIONS.has()).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar 3 TipoAccion nuevos + ajustar los 3 sets CRM en constants</name>
  <read_first>
    src/lib/agents/somnio-v4/types.ts (union TipoAccion :322-342)
    src/lib/agents/somnio-v4/constants.ts (SIGNIFICANT_ACTIONS/CRM_ACTIONS/CREATE_ORDER_ACTIONS :185-200)
    RESEARCH.md §S3 (los 10 consumidores + por que recordar_* fuera de CREATE_ORDER_ACTIONS)
  </read_first>
  <action>
    1. En `src/lib/agents/somnio-v4/types.ts`, al union `TipoAccion` (:322-342), AGREGAR tres miembros
       (no quitar nada): `| 'recordar_promo' | 'recordar_confirmacion' | 'confirmar_orden'`. Comentar
       referenciando D-18/D-19: `// somnio-v4-crm-subloop D-19: recordar_* = solo template, NO crean (fuera de CREATE_ORDER_ACTIONS). D-18: confirmar_orden = senal de moveOrderToStage(CONFIRMADO), ejecuta el sub-loop.`
    2. En `src/lib/agents/somnio-v4/constants.ts`:
       - `SIGNIFICANT_ACTIONS` (:185-190): NO agregar `recordar_*` (per S3 recomendacion — el
         recordatorio NO cambia la fase de venta; mantenerlos fuera evita alterar derivePhase. El
         doble-recordatorio ya lo previene `timerSignal:{type:'cancel'}` de L3/L4). SÍ agregar
         `'confirmar_orden'` (es significativa — la confirmacion mueve a CONFIRMADO).
       - `CRM_ACTIONS` (:193-195): AGREGAR `'confirmar_orden'` (toca CRM via moveOrderToStage).
         NO agregar `recordar_*` (no tocan CRM). NO quitar los `crear_orden*` (se podan en Plan 06).
       - `CREATE_ORDER_ACTIONS` (:198-200): NO agregar NINGUNO de los 3 nuevos. `confirmar_orden`
         NO crea (mueve), y `recordar_*` no crea. Este set debe quedar SOLO con los `crear_orden*`
         legacy (que el Plan 06 desactiva via gate, pero el set en si no se toca aqui).
       Comentar cada set citando D-18/D-19 + S3.
  </action>
  <acceptance_criteria>
    - `grep -E "recordar_promo|recordar_confirmacion|confirmar_orden" src/lib/agents/somnio-v4/types.ts` retorna los 3 miembros.
    - `grep -A3 "CREATE_ORDER_ACTIONS" src/lib/agents/somnio-v4/constants.ts | grep -E "recordar_|confirmar_orden"` retorna VACIO (ninguno de los 3 esta en CREATE_ORDER_ACTIONS).
    - `grep -A3 "CRM_ACTIONS:" src/lib/agents/somnio-v4/constants.ts | grep "confirmar_orden"` retorna match; `grep -A3 "CRM_ACTIONS:" src/lib/agents/somnio-v4/constants.ts | grep "recordar_"` retorna VACIO.
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "somnio-v4/(types|constants)\.ts"` retorna VACIO.
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "somnio-v4/(types|constants)\.ts" || echo "ok no type errors"</automated>
  </verify>
  <done>Los 3 TipoAccion existen; recordar_* fuera de los 3 sets; confirmar_orden en SIGNIFICANT+CRM pero NO en CREATE_ORDER_ACTIONS; compila.</done>
</task>

<task type="auto">
  <name>Task 2: Re-apuntar transiciones L3/L4/R5 a los nuevos simbolos</name>
  <read_first>
    src/lib/agents/somnio-v4/transitions.ts (R5 :261-269, L3 :337-344, L4 :346-353)
    RESEARCH.md §S3 (mecanismo de desacople timer) + §S2/SUP-6 (confirmar_orden)
  </read_first>
  <action>
    En `src/lib/agents/somnio-v4/transitions.ts`:
    1. R5 (:261-269): cambiar `action: 'crear_orden'` -> `action: 'confirmar_orden'`. Mantener
       `condition: (_, gates) => gates.datosCriticos && gates.packElegido` y el `resolve` (timerSignal
       cancel) sin cambios. Actualizar el `reason` a algo como `'Confirmacion -> mover a CONFIRMADO (pedido ya existe)'`.
       Comentar `// D-18: el pedido nace temprano (cascaron); confirmar ya no crea, mueve a CONFIRMADO via sub-loop.`
    2. L3 (:337-344): cambiar `action: 'crear_orden_sin_promo'` -> `action: 'recordar_promo'`. Mantener
       el `timerSignal: { type:'cancel', ... }` (previene doble-recordatorio). Actualizar reason.
       Comentar `// D-19: timer solo RECUERDA, no crea (cascaron ya existe).`
    3. L4 (:346-353): cambiar `action: 'crear_orden_sin_confirmar'` -> `action: 'recordar_confirmacion'`.
       Mantener `timerSignal: { type:'cancel', ... }`. Actualizar reason. Mismo comentario D-19.
    NO tocar la transicion `mostrar_confirmacion` (:240-248) ni ninguna otra.
  </action>
  <acceptance_criteria>
    - `grep -n "action: 'confirmar_orden'" src/lib/agents/somnio-v4/transitions.ts` retorna 1 match en la fila `on: 'confirmar'`.
    - `grep -n "action: 'recordar_promo'" src/lib/agents/somnio-v4/transitions.ts` retorna 1 match en la fila `timer_expired:3`.
    - `grep -n "action: 'recordar_confirmacion'" src/lib/agents/somnio-v4/transitions.ts` retorna 1 match en la fila `timer_expired:4`.
    - `grep -n "action: 'crear_orden'" src/lib/agents/somnio-v4/transitions.ts` retorna VACIO (R5 ya no emite crear_orden).
    - `grep -c "type: 'cancel'" src/lib/agents/somnio-v4/transitions.ts` >= 3 (timerSignals cancel preservados en R5/L3/L4).
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep "somnio-v4/transitions.ts" || echo "ok"</automated>
  </verify>
  <done>R5 emite confirmar_orden; L3 emite recordar_promo; L4 emite recordar_confirmacion; mostrar_confirmacion intacto; timerSignals cancel preservados.</done>
</task>

<task type="auto">
  <name>Task 3: Re-apuntar templates en response-track + ajustar phase.ts</name>
  <read_first>
    src/lib/agents/somnio-v4/response-track.ts (resolveSalesActionTemplates :278-326)
    src/lib/agents/somnio-v4/phase.ts (derivePhase switch :23-39)
    RESEARCH.md §S2 tabla de mapeo de templates + §SUP-6
  </read_first>
  <action>
    1. En `src/lib/agents/somnio-v4/response-track.ts` (resolveSalesActionTemplates):
       - `case 'mostrar_confirmacion': case 'cambio':` -> NO TOCAR (sigue `resumen_<pack>`).
       - El `case 'crear_orden':` (:290-314, delivery-zone -> confirmacion_orden_*): re-apuntar el
         CASE a `confirmar_orden` (cambiar la etiqueta del case de `'crear_orden'` a `'confirmar_orden'`).
         La logica interna (lookupDeliveryZone -> confirmacion_orden_same_day|transportadora) queda igual.
       - `case 'crear_orden_sin_promo':` -> renombrar la etiqueta a `case 'recordar_promo':` (mismo
         retorno `['pendiente_promo']`).
       - `case 'crear_orden_sin_confirmar':` -> renombrar a `case 'recordar_confirmacion':` (mismo
         retorno `['pendiente_confirmacion']`).
       Comentar cada cambio citando D-18/D-19/SUP-6. La conversacion de cara al cliente NO cambia:
       resumen -> (confirma) -> confirmacion_orden.
    2. En `src/lib/agents/somnio-v4/phase.ts` (derivePhase switch :23-39):
       - AGREGAR `case 'confirmar_orden': return 'order_created'` (la confirmacion lleva el pedido a
         estado creado/confirmado a nivel de fase). Mantener los `crear_orden*` legacy en el switch
         (no romper si quedaran emitidos por algun path no migrado; el Plan 06 los poda si procede).
       - NO agregar `recordar_*` al switch (per S3: NO deben derivar a order_created; al no estar en
         SIGNIFICANT_ACTIONS quedan ignorados por derivePhase, manteniendo la fase previa). Comentar
         `// D-19: recordar_* NO derivan fase (no estan en SIGNIFICANT_ACTIONS); el timer solo recuerda.`
  </action>
  <acceptance_criteria>
    - `grep -n "case 'confirmar_orden'" src/lib/agents/somnio-v4/response-track.ts` retorna 1 match seguido de la logica de delivery-zone.
    - `grep -n "case 'recordar_promo'" src/lib/agents/somnio-v4/response-track.ts` retorna match con `pendiente_promo`.
    - `grep -n "case 'recordar_confirmacion'" src/lib/agents/somnio-v4/response-track.ts` retorna match con `pendiente_confirmacion`.
    - `grep -n "case 'mostrar_confirmacion'" src/lib/agents/somnio-v4/response-track.ts` sigue presente con `resumen_`.
    - `grep -n "case 'confirmar_orden'" src/lib/agents/somnio-v4/phase.ts` retorna match con `order_created`.
    - `grep -E "recordar_promo|recordar_confirmacion" src/lib/agents/somnio-v4/phase.ts` retorna VACIO.
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/transitions.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>Templates re-apuntados; resumen ligado a mostrar_confirmacion; confirmacion_orden_* a confirmar_orden; pendiente_* a recordar_*; phase.ts mapea confirmar_orden->order_created y recordar_* fuera del switch.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| state-machine symbols → CRM execution (Plan 06) | un simbolo mal clasificado podria disparar/omitir una mutacion |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sym-01 | Tampering (create por timer no deseado) | CREATE_ORDER_ACTIONS membership | mitigate | recordar_* explicitamente FUERA de CREATE_ORDER_ACTIONS (acceptance grep); test en Plan 07 |
| T-sym-02 | Repudiation (fase incoherente) | derivePhase | accept | confirmar_orden->order_created; recordar_* no derivan fase (intencional, S3) |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/transitions.test.ts` verde (extender en Plan 07 con casos D-15/D-18/D-19).
- `npx tsc --noEmit` sin errores nuevos en somnio-v4.
- Greps de acceptance de las 3 tasks pasan.
</verification>

<success_criteria>
3 nuevos TipoAccion; L3/L4 emiten recordar_*; R5 emite confirmar_orden; templates coherentes
(resumen->mostrar_confirmacion, confirmacion_orden->confirmar_orden, pendiente_*->recordar_*);
recordar_* fuera de CRM_ACTIONS/CREATE_ORDER_ACTIONS/derivePhase. Cero ejecucion CRM tocada.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/01-SUMMARY.md`.
Commit: `feat(v4-crm-subloop): capa de simbolos lifecycle (D-15/D-18/D-19) — recordar_*/confirmar_orden + desacople timer`
</output>
