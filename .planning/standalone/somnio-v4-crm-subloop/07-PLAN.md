---
phase: somnio-v4-crm-subloop
plan: 07
type: execute
wave: 4
depends_on: [01, 02, 03, 04, 05, 06]
files_modified:
  - src/lib/agents/somnio-v4/__tests__/transitions.test.ts
  - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md
  - .planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md
  - .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md
requirements: [D-05, D-06, D-07, D-15, D-16, D-18, D-19, D-21, D-22]
autonomous: true
must_haves:
  truths:
    - "Los tests de transitions cubren D-15/D-18 (confirmar->confirmar_orden) y D-19 (L3->recordar_promo / L4->recordar_confirmacion)"
    - "Existe evidencia Regla 6: el diff usa el BASELINE del standalone (6e0a8d1a), NO main (la rama esta adelante de main con trabajo debounce-v2 ajeno)"
    - "grep prueba que v3/godentist/godentist-fb-ig/recompra/pw-confirmation no fueron tocados (byte-identicos) en el diff baseline-scoped"
    - "La suite completa v4 + shared-tools + domain pasa verde"
    - "INTERRUPTION-PARITY.md §6 documenta el caveat CRM (prod escribe DB, sandbox simula, ambos registran en el ledger en el mismo punto)"
    - "ACTIVATION-STEPS.md documenta los pasos manuales pre-activacion (config /agentes/crm-tools, env vars Vercel incl SOMNIO_VENTAS_PIPELINE_UUID, v4 DORMANT rollback)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/__tests__/transitions.test.ts"
      provides: "casos nuevos D-15/D-18/D-19"
      contains: "confirmar_orden"
    - path: ".planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md"
      provides: "evidencia grep de no-regresion de los 5 agentes (baseline-scoped)"
      contains: "Regla 6"
    - path: "src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md"
      provides: "caveat CRM en §6"
      contains: "CRM"
    - path: ".planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md"
      provides: "pasos manuales pre-activacion"
      contains: "crm-tools"
  key_links:
    - from: "REGLA6-EVIDENCE.md greps"
      to: "5 sibling agents untouched"
      via: "git diff baseline-scoped (6e0a8d1a) + grep behavioral"
      pattern: "godentist|recompra|pw-confirmation|somnio-v3"
---

<objective>
Cierre del standalone: verificacion goal-backward + Regla 6 + paridad + pasos operacionales.

1. **Tests de transitions (D-15/D-18/D-19):** extender `transitions.test.ts` para cubrir el rediseño
   del lifecycle: confirmar+datosCriticos+pack -> `confirmar_orden` (no `crear_orden`); L3 ->
   `recordar_promo`; L4 -> `recordar_confirmacion`; mostrar_confirmacion sin cambio.
2. **Evidencia Regla 6 (D-06/D-16):** documento con greps que prueban que los 5 agentes no-v4
   (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-sales-v3-pw-confirmation) NO fueron
   tocados (git diff vacio en sus dirs) ni comportamiento filtrado. El diff se hace contra el BASELINE
   del standalone (HEAD `6e0a8d1a` — el commit anterior al primer commit de este standalone), NO contra
   `main`: la rama `exec/debounce-v2-wave6` esta muchos commits adelante de main con trabajo debounce-v2
   AJENO que tocaria archivos sibling de ramas previas y produciria un falso Regla-6 violation (o
   enmascararia uno real). v4 DORMANT en prod (0 workspaces).
3. **Suite completa:** v4 + crm-mutation-tools + crm-query-tools + domain contacts verde.
4. **Paridad CRM (D-22):** documentar en INTERRUPTION-PARITY.md §6 el caveat CRM extendiendo el caveat
   RAG-send: prod escribe DB, sandbox simula in-memory, AMBOS registran la accion en el ledger en el
   MISMO punto del flujo (Pitfall 7 parity).
5. **Pasos operacionales pre-activacion (D-21/D-16):** documento (NO codigo) con: (a) operador
   configura active-stages de Somnio en `/agentes/crm-tools` (D-21, resuelve config_not_set); (b) set
   de env vars de stage UUID + pipeline en Vercel (SOMNIO_CONFIRMADO_STAGE_UUID,
   SOMNIO_NUEVO_PEDIDO_STAGE_UUID, SOMNIO_VENTAS_PIPELINE_UUID); (c) v4 sigue DORMANT — activacion
   per-workspace via UPDATE workspace_agent_config; rollback = no activar.

Purpose: cerrar el ciclo de calidad (must-haves del goal verificados) + dejar listos los gates
manuales que el usuario ejecuta antes de activar v4. Output: tests + evidencia Regla 6 + paridad doc
+ activation steps.

NO toca codigo de produccion de los agentes (solo tests + docs). v4 DORMANT.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md
@.planning/standalone/somnio-v4-crm-subloop/01-PLAN.md
@.planning/standalone/somnio-v4-crm-subloop/06-PLAN.md

<interfaces>
<!-- Contratos verbatim. NO explorar. -->

transitions.test.ts ya existe (cubre el state-machine). Patron: invoca resolveSalesTrack / la tabla
de transiciones con un estado+evento y asserta la `accion` resultante.

Los 5 agentes no-v4 (dirs a probar byte-identicos):
- src/lib/agents/somnio-v3/ (o el dir del v3)
- src/lib/agents/godentist/
- src/lib/agents/godentist-fb-ig/
- src/lib/agents/somnio-recompra/
- src/lib/agents/somnio-pw-confirmation/
Estos NO deben aparecer en el `git diff --name-only` BASELINE-SCOPED de este standalone (salvo si
comparten algun util — en cuyo caso documentar y probar comportamiento). El unico toque a modulo
compartido aprobado es crm-mutation-tools.updateOrder (D-25, Plan 04) + domain/contacts.resolveOrCreateContact
(D-24, Plan 03), ambos aditivos/opcionales (0 consumidores prod de mutation-tools; nueva funcion en contacts).

BASELINE del standalone (clave para FIX 2 — falso positivo Regla 6):
La rama de ejecucion es `exec/debounce-v2-wave6`, que esta MUCHOS commits adelante de `main` con
trabajo debounce-v2 ANTERIOR y AJENO a este standalone. Un `git diff ...main` matchearia archivos
sibling-agent de ese trabajo previo -> falso Regla-6 violation (o enmascara uno real). El standalone
somnio-v4-crm-subloop empieza en HEAD `6e0a8d1a` (commit inmediatamente anterior a su primer commit —
"docs(somnio-v4-crm-subloop): handoff .continue-here..."). TODOS los diffs de evidencia Regla 6 deben
usar `6e0a8d1a` como baseline, NO `main`. (Si al ejecutar el baseline real difiere, capturarlo con
`git rev-parse HEAD` ANTES del primer commit del standalone y usar ese SHA; el valor esperado es
`6e0a8d1a`.)

INTERRUPTION-PARITY.md §6 (caveat conocido): hoy documenta el caveat RAG-send. AGREGAR un parrafo CRM.

Activacion v4 (CLAUDE.md / PARITY §1): `UPDATE workspace_agent_config SET
conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`. v4 DORMANT = 0 workspaces.

config_not_set fix (D-21): operador configura `/agentes/crm-tools` (UI existente) -> pobla
crm_query_tools_config + crm_query_tools_active_stages para Somnio.

Stage + pipeline env vars (Plan 02): SOMNIO_CONFIRMADO_STAGE_UUID=4770a36e...,
SOMNIO_NUEVO_PEDIDO_STAGE_UUID=6be952b0..., SOMNIO_VENTAS_PIPELINE_UUID=a0ebcb1e-d79a-4588-a569-d2bcef23e6b8
(opcional — getPipelineUuid() tiene fallback verificado a ese mismo UUID; documentar para override).

orders.total_value (verificado supabase/migrations/20260129000003_orders_foundation.sql:76):
`DECIMAL(12,2) NOT NULL DEFAULT 0`. El cascaron-sin-pack se crea con total_value=0 -> Kanban muestra
**$0** (no null, no NaN). FIX 3: el smoke confirma este render $0 citando el default.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extender transitions.test.ts con casos D-15/D-18/D-19</name>
  <files>src/lib/agents/somnio-v4/__tests__/transitions.test.ts</files>
  <read_first>
    src/lib/agents/somnio-v4/__tests__/transitions.test.ts (patron de assert de accion)
    src/lib/agents/somnio-v4/transitions.ts (R5 confirmar_orden, L3 recordar_promo, L4 recordar_confirmacion — post Plan 01)
    .planning/standalone/somnio-v4-crm-subloop/01-PLAN.md
  </read_first>
  <action>
    AGREGAR a `transitions.test.ts` (no romper los casos existentes):
    1. Test "D-18: confirmar + datosCriticos + packElegido -> confirmar_orden": estado con
       datosCriticos=true, pack elegido, evento 'confirmar' -> accion === 'confirmar_orden' (NO 'crear_orden').
    2. Test "D-19: timer L3 (promos_shown + timer_expired:3) -> recordar_promo": -> accion === 'recordar_promo'.
    3. Test "D-19: timer L4 (confirming + timer_expired:4) -> recordar_confirmacion": -> accion === 'recordar_confirmacion'.
    4. Test "D-17: mostrar_confirmacion sin cambio": seleccion_pack + datosCriticos -> 'mostrar_confirmacion'
       (igual que antes — el updateOrder vive en el gate, no en la transicion).
    5. Test "regresion: confirmar sin pack -> ofrecer_promos" (caso existente sigue verde).
    Espejar el patron de assert de los casos vecinos.
  </action>
  <acceptance_criteria>
    - `grep -c "confirmar_orden\|recordar_promo\|recordar_confirmacion" src/lib/agents/somnio-v4/__tests__/transitions.test.ts` >= 3.
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/transitions.test.ts` verde (nuevos + existentes).
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/transitions.test.ts 2>&1 | tail -15</automated>
  </verify>
  <done>4 casos nuevos D-15/D-17/D-18/D-19 + regresion; suite transitions verde.</done>
</task>

<task type="auto">
  <name>Task 2: Suite completa + evidencia Regla 6 (greps de no-regresion, baseline-scoped)</name>
  <files>.planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md</files>
  <read_first>
    CLAUDE.md (Regla 6 + scopes de los 5 agentes)
    .planning/standalone/somnio-v4-crm-subloop/06-PLAN.md (big-bang)
    src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md §5 (regla 6)
  </read_first>
  <action>
    1. **Capturar/confirmar el BASELINE (FIX 2 — evita falso positivo Regla 6):** la rama
       `exec/debounce-v2-wave6` esta muchos commits adelante de `main` con trabajo debounce-v2 AJENO a
       este standalone, asi que un diff contra `main` matchearia archivos sibling de ese trabajo previo
       (falso Regla-6 violation o enmascara uno real). El baseline correcto es el HEAD inmediatamente
       ANTERIOR al primer commit de este standalone: `6e0a8d1a`. Registrar ese SHA en REGLA6-EVIDENCE.md
       (comando: `BASELINE=$(git rev-parse 6e0a8d1a)` — o el SHA capturado pre-primer-commit si difiere).
       USAR `<baseline>...HEAD` (= `6e0a8d1a...HEAD`) en TODOS los diffs de evidencia, NUNCA `main...HEAD`.
    2. Correr la suite completa y capturar el resultado:
       `npx vitest run src/lib/agents/somnio-v4/ src/lib/agents/shared/crm-mutation-tools/ src/lib/agents/shared/crm-query-tools/ src/lib/domain/__tests__/resolve-or-create-contact.test.ts`.
       Si algo falla -> arreglar antes de continuar (es el phase gate).
    3. CREAR `.planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md` con:
       - El BASELINE registrado (`6e0a8d1a`) + nota explicando por que NO se usa `main` (rama adelante
         con debounce-v2 ajeno).
       - El comando + output de `git diff --name-only 6e0a8d1a...HEAD` mostrando que los unicos archivos
         de agente tocados son `src/lib/agents/somnio-v4/**`, `src/lib/agents/engine/v4-production-runner.ts`
         (v4 path), `src/lib/agents/shared/crm-mutation-tools/orders.ts` (D-25 aditivo) y
         `src/lib/domain/contacts.ts` (D-24 aditivo). NINGUN archivo bajo somnio-v3/godentist/
         godentist-fb-ig/somnio-recompra/somnio-pw-confirmation.
       - Greps de no-regresion (capturar output):
         * `git diff --name-only 6e0a8d1a...HEAD | grep -E "somnio-v3|godentist|recompra|pw-confirmation"`
           -> debe ser VACIO.
         * `grep -rn "GODENTIST_AGENT_ID\|somnio-recompra-v1\|somnio-sales-v3-pw-confirmation"
           src/lib/agents/somnio-v4/ src/lib/agents/somnio-v4/crm-gate.ts src/lib/agents/somnio-v4/crm-grounding.ts`
           -> el codigo v4 nuevo NO referencia constantes de otros agentes.
       - Justificacion de los 2 toques compartidos (D-24/D-25): aditivos/opcionales, 0 consumidores prod
         de crm-mutation-tools, nueva funcion en domain — Regla-6-safe por opcionalidad/aditividad.
       - Nota: v4 DORMANT en prod (0 workspaces); rollback = no activar (D-16, sin feature flag).
  </action>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/ src/lib/agents/shared/crm-mutation-tools/ src/lib/agents/shared/crm-query-tools/` -> suite verde (0 failed).
    - `git diff --name-only 6e0a8d1a...HEAD | grep -E "somnio-v3/|godentist/|godentist-fb-ig/|somnio-recompra/|somnio-pw-confirmation/"` retorna VACIO (diff BASELINE-scoped, NO main).
    - `test -f .planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md` y contiene la palabra "Regla 6", el BASELINE `6e0a8d1a`, y el output de los greps baseline-scoped.
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/ src/lib/agents/shared/crm-mutation-tools/ src/lib/agents/shared/crm-query-tools/ 2>&1 | tail -20</automated>
  </verify>
  <done>Suite completa verde; REGLA6-EVIDENCE.md con BASELINE 6e0a8d1a + git diff baseline-scoped + greps que prueban 5 agentes intactos + justificacion de los 2 toques compartidos aditivos.</done>
</task>

<task type="auto">
  <name>Task 3: Caveat CRM en INTERRUPTION-PARITY.md §6 + ACTIVATION-STEPS.md</name>
  <files>src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md, .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md</files>
  <read_first>
    src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md (§4 reglas, §6 caveat conocido)
    RESEARCH.md §S5 (paridad CRM) + Pitfall 7
    .planning/standalone/somnio-v4-crm-subloop/02-PLAN.md (env vars) + CONTEXT D-21
  </read_first>
  <action>
    1. En `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` §6 (Caveat conocido): AGREGAR un parrafo CRM
       extendiendo el caveat RAG-send. Texto: "CRM mutations (standalone somnio-v4-crm-subloop): en
       PRODUCCION el sub-loop escribe a la DB via crm-mutation-tools -> domain (Regla 3); en SANDBOX las
       mutaciones se SIMULAN in-memory (simulate:true en buildSubLoopTools, mutation-tools sinteticas,
       cero DB write). AMBOS lados registran la accion CRM en el ledger (crmActions origen:'rag') en el
       MISMO punto del flujo (post sub-loop, pre commitTurn) — esto es lo que hace el escenario
       reproducible (§4.3/§4.4: DB-vs-memoria es diferencia permitida). Interrupcion mid-mutation
       (CKPT-3/4/5): prod cubre el doble-ejecutar con idempotency key (somnio-v4-createOrder-{sessionId})
       + CAS; sandbox no escribe asi que no hay riesgo real, pero simula el mismo punto de no-retorno."
    2. CREAR `.planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` (pasos MANUALES
       pre-activacion, NO codigo) con:
       - **Paso 1 (D-21 config_not_set):** operador entra a `/agentes/crm-tools`, selecciona el pipeline
         "Ventas Somnio Standard" y marca como active-stages los pre-confirmacion (NUEVO PEDIDO / FALTA
         INFO / FALTA CONFIRMAR). Esto pobla crm_query_tools_config + crm_query_tools_active_stages para
         Somnio -> Vista A del grounding deja de retornar config_not_set.
       - **Paso 2 (env vars Vercel):** setear ANTES de activar:
         `SOMNIO_CONFIRMADO_STAGE_UUID=4770a36e-5feb-4eec-a71c-75d54cb2797c`,
         `SOMNIO_NUEVO_PEDIDO_STAGE_UUID=6be952b0-0a95-4957-b5f7-62e8fd8eb815`.
         OPCIONAL (tiene fallback verificado): `SOMNIO_VENTAS_PIPELINE_UUID=a0ebcb1e-d79a-4588-a569-d2bcef23e6b8`
         (pipeline "Ventas Somnio Standard"; getPipelineUuid() ya cae a este UUID si la var no esta —
         documentar para override futuro). Fail-closed de los stages: si ausentes, el gate OMITE
         createOrder/moveOrderToStage (no crashea).
       - **Paso 3 (activacion DORMANT->LIVE):** `UPDATE workspace_agent_config SET
         conversational_agent_id='somnio-sales-v4' WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'`
         (Somnio). SIN feature flag (D-16). **Rollback:** revertir el UPDATE (o no activar) — v4 vuelve
         a DORMANT, cero efecto en clientes.
       - **Smoke pre-activacion (sandbox):** en `/sandbox` Somnio v4, verificar que el cascaron se crea
         (simulado) al completar datos, se enriquece con el pack, y confirmar mueve a CONFIRMADO; ver los
         crmActions en el debug panel (simulate:true). **FIX 3 (cosmetico):** confirmar que el cascaron
         sin pack se renderiza como **$0** en el Kanban CRM (NO null/NaN) — `orders.total_value` es
         `DECIMAL(12,2) NOT NULL DEFAULT 0` (verificado supabase/migrations/20260129000003_orders_foundation.sql:76),
         asi que el cascaron nace con total_value=0 -> $0 hasta que el updateOrder del pack lo enriquece.
         v4 DORMANT -> smoke real WhatsApp diferido a la activacion (cuando el usuario decida).
  </action>
  <acceptance_criteria>
    - `grep -n "CRM" src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md | grep -iE "simul|mutation"` retorna match en §6.
    - `grep -n "somnio-v4-createOrder" src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` retorna match (idempotency mencionado).
    - `test -f .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` y contiene "crm-tools", "SOMNIO_CONFIRMADO_STAGE_UUID", "SOMNIO_VENTAS_PIPELINE_UUID", "workspace_agent_config".
    - `grep -n "4770a36e-5feb-4eec-a71c-75d54cb2797c\|6be952b0-0a95-4957-b5f7-62e8fd8eb815\|a0ebcb1e-d79a-4588-a569-d2bcef23e6b8" .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` retorna match (UUIDs verificados en los pasos).
    - `grep -niE "\\\$0|total_value.*0|DEFAULT 0" .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` retorna match (FIX 3 — confirmacion cascaron $0 en Kanban).
  </acceptance_criteria>
  <verify>
    <automated>grep -c "CRM" src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md && test -f .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md && echo "docs ok"</automated>
  </verify>
  <done>INTERRUPTION-PARITY §6 con caveat CRM (DB-vs-simulado + mismo punto de registro + idempotency); ACTIVATION-STEPS.md con los 3 pasos manuales + env var pipeline + smoke sandbox + confirmacion cascaron $0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| big-bang merge → 5 agentes no-v4 | un cambio mal aislado podria filtrarse a un agente en produccion |
| activacion manual → produccion | activar sin config/env vars correctos rompe el grounding |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cl-01 | Tampering (regresion agente prod) | 5 siblings | mitigate | REGLA6-EVIDENCE git diff BASELINE-scoped (6e0a8d1a) vacio + greps; v4 DORMANT |
| T-cl-02 | Denial (activar con grounding ciego) | config_not_set | mitigate | ACTIVATION-STEPS paso 1 obligatorio antes de activar (D-21) |
| T-cl-03 | Tampering (mutaciones sin stage UUID) | env vars | mitigate | fail-closed documentado; paso 2 obligatorio antes de activar |
</threat_model>

<verification>
- Suite completa verde (phase gate): `npx vitest run src/lib/agents/somnio-v4/ src/lib/agents/shared/crm-mutation-tools/ src/lib/agents/shared/crm-query-tools/`.
- `npx tsc --noEmit` sin errores nuevos.
- REGLA6-EVIDENCE.md + ACTIVATION-STEPS.md presentes; greps de no-regresion (baseline-scoped 6e0a8d1a) vacios.
- INTERRUPTION-PARITY §6 con caveat CRM.
</verification>

<success_criteria>
Tests transitions D-15/D-18/D-19 verdes; suite completa verde; evidencia Regla 6 BASELINE-scoped
(6e0a8d1a, NO main; 5 agentes intactos + 2 toques compartidos aditivos justificados); paridad CRM
documentada (§6); pasos manuales de activacion documentados (config + env vars incl pipeline +
DORMANT->LIVE + rollback + confirmacion cascaron $0 en Kanban). Standalone listo para activacion manual del usuario.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/07-SUMMARY.md`.
Commit: `test+docs(v4-crm-subloop): tests lifecycle D-15/D-18/D-19 + evidencia Regla 6 baseline-scoped + paridad CRM + activation steps`
</output>
