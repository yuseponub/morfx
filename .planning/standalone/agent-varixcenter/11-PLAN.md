---
phase: agent-varixcenter
plan: 11
type: execute
wave: 6
depends_on: [07, 08, 09, 10]
files_modified:
  - .claude/rules/agent-scope.md
  - CLAUDE.md
  - .planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md
autonomous: false
requirements: [VARIX-REGISTER]

must_haves:
  truths:
    - "El scope del agente varixcenter (PUEDE/NO PUEDE/Validación/Consumidores) está documentado en .claude/rules/agent-scope.md (BLOQUEANTE antes de mergear)"
    - "Existe el SQL pre-formado de la routing rule (WA+FB+IG por fact channel) con priority libre del workspace"
    - "El código del agente fue pusheado a Vercel DESPUÉS del apply SQL (Regla 5)"
    - "El operador creó la routing rule (activación 100% manual — Regla 6 / D-02)"
    - "La fase está verificada end-to-end (6 grep gates + suites verdes + Regla 6)"
  artifacts:
    - path: ".claude/rules/agent-scope.md"
      provides: "scope explícito de varixcenter (OBLIGATORIO al crear agente nuevo)"
      contains: "varixcenter"
    - path: ".planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md"
      provides: "SQL pre-formado de la routing rule + rollback"
  key_links:
    - from: "routing rule (fact channel)"
      to: "dispatch branch agentId === 'varixcenter'"
      via: "INSERT routing_rules con event agent_id='varixcenter'"
      pattern: "varixcenter"
---

<objective>
Wave 6 — Cierre: documentar el scope del agente (BLOQUEANTE Regla agent-scope.md "OBLIGATORIO al Crear un Agente Nuevo"), generar el SQL pre-formado de la routing rule (Pitfall 3 — priority collision), pushear a Vercel DESPUÉS del apply SQL (Regla 5), y activar vía routing rule manual (Regla 6 / D-02).

Purpose: Hacer el agente descubrible/documentado y activable. La activación es 100% manual del operador (sin tráfico hasta que cree la regla — Regla 6).
Output: scope en agent-scope.md + CLAUDE.md + doc de routing rule + push + activación.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@.planning/standalone/agent-varixcenter/RESEARCH.md
@.planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md
@.claude/rules/agent-scope.md
@CLAUDE.md

<interfaces>
Patrón de scope (agent-scope.md): la sección "Godentist FB/IG Sibling Agent" tiene el formato completo PUEDE/NO PUEDE/Validación/Consumidores/Activación SQL pre-formado — usarla como plantilla.
Workspace MorfX Varixcenter: c6621640-ba67-43de-9f05-905f09a6dc8f
Routing rule (fact channel, shipped 2026-05-04): conditions con { fact:'channel', operator:'in', value:['whatsapp','facebook','instagram'] } -> event route agent_id='varixcenter'
Priority libre: de 00-WAVE0-AUDIT.md Task 2
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Documentar scope del agente (agent-scope.md + CLAUDE.md) — BLOQUEANTE</name>
  <read_first>
    - .claude/rules/agent-scope.md (sección "Godentist FB/IG Sibling Agent" como plantilla del formato completo)
    - CLAUDE.md (sección "Scopes por Agente" — donde se agrega el módulo)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md (D-01..D-15) + RESEARCH §Project Constraints
  </read_first>
  <files>.claude/rules/agent-scope.md, CLAUDE.md</files>
  <action>
    agent-scope.md — agregar una sección "### Varixcenter Valoraciones Agent (`varixcenter` — webhook WA/FB/IG inbound)" en "Scopes por Agente", usando el formato de la sección godentist-fb-ig:

    - PUEDE:
      - Atender mensajes inbound WhatsApp + Facebook + Instagram (D-02 multi-canal vía fact channel) en el workspace c6621640-ba67-43de-9f05-905f09a6dc8f.
      - Emitir templates del catálogo propio bajo agent_id='varixcenter' (~44 templates).
      - Consultar disponibilidad real en varix-clinic (READ appointments de 2 doctores via domain getVarixAvailability).
      - CREAR patient (nombre/cédula/teléfono) + appointment tipo valoración estado 'programada' en varix-clinic (WRITE via domain bookVarixAppointment — D-04). ÚNICA escritura permitida.
      - Recibir tag VAL al completar datos críticos (nombre+telefono+cedula — D-05, D-10; side-effect runner).
    - NO PUEDE:
      - Tocar pagos, historias clínicas, medias, cierres, ni cualquier tabla de varix-clinic distinta de patients (insert) + appointments (insert valoración). Scope acotado en el domain module.
      - Mutar appointments existentes (reagendar/cancelar) — D-07 handoff a humano.
      - Crear recursos base en MorfX fuera de su workspace.
      - Compartir catálogo con godentist u otros agentes — TEMPLATE_LOOKUP_AGENT_ID='varixcenter' (anti-cdc06d9).
      - Importar createClient/createAdminClient en src/lib/agents/varixcenter/** (Regla 3 — todo va por src/lib/domain/varix-clinic/).
      - Modificar el comportamiento de godentist/godentist-fb-ig/somnio (Regla 6 — aditivo).
      - Activarse automáticamente — sin feature flag; requiere routing rule manual del operador (D-02).
    - Validación (gates verificables):
      - `grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0.
      - `grep -rn "'godentist'" src/lib/agents/varixcenter/` = 0 (anti-cdc06d9).
      - 6 sitios de registro (los 6 grep gates de RESEARCH §Pattern 2).
      - VAL guard: CRITICAL_FIELDS_BY_AGENT['varixcenter']=['nombre','telefono','cedula']; godentist sigue con sede_preferida (cero regresión).
      - Suites: `npx vitest run src/lib/agents/varixcenter/__tests__/ src/lib/domain/varix-clinic/__tests__/` verde.
      - El único createClient de varix-clinic vive en src/lib/domain/varix-clinic/client.ts.
    - Consumidores upstream: webhook-processor.ts branch agentId==='varixcenter' (dispatch in-process).
    - Consumidores downstream: domain varix-clinic (availability READ + booking WRITE) + Supabase de varix-clinic (cross-project, service_role) + Anthropic Haiku (comprehension) + VAL tag side-effect (runner).
    - Activación (D-02 manual) — SQL pre-formado: referenciar el doc 12-ROUTING-RULE-USER-ACTION.md (Task 2).

    CLAUDE.md — agregar una entrada breve en "Scopes por Agente" apuntando a la sección completa en agent-scope.md + skill, igual que las otras entradas resumidas. Mencionar: standalone shipped path, workspace, write a varix-clinic.
  </action>
  <verify>
    <automated>grep -c "varixcenter" .claude/rules/agent-scope.md; grep -c "varixcenter" CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - agent-scope.md contiene una sección "Varixcenter" con PUEDE/NO PUEDE/Validación/Consumidores/Activación
    - El scope lista explícitamente: escritura SOLO patients+appointments en varix-clinic; nada más
    - CLAUDE.md tiene la entrada resumida del módulo
    - `grep -c "varixcenter" .claude/rules/agent-scope.md` >= 10 (sección sustancial)
  </acceptance_criteria>
  <done>Scope documentado (BLOQUEANTE satisfecho); CLAUDE.md actualizado (Regla 4).</done>
</task>

<task type="auto">
  <name>Task 2: SQL pre-formado de routing rule (Pitfall 3) + verificación final</name>
  <read_first>
    - .claude/rules/agent-scope.md (sección godentist-fb-ig "Activación (D-15 manual) — SQL pre-formado" como plantilla)
    - .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md (priority libre + lifecycle_routing_enabled)
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Pattern 2 (los 6 grep gates)
  </read_first>
  <files>.planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md</files>
  <action>
    Crear 12-ROUTING-RULE-USER-ACTION.md con el SQL pre-formado para activar el agente (clonar la estructura de la sección godentist-fb-ig en agent-scope.md), usando el priority libre de 00-WAVE0-AUDIT:

    ```sql
    -- Pre-check 1: lifecycle router activo en el workspace
    SELECT lifecycle_routing_enabled FROM workspace_agent_config
    WHERE workspace_id='c6621640-ba67-43de-9f05-905f09a6dc8f';
    -- Si false: UPDATE workspace_agent_config SET lifecycle_routing_enabled=true WHERE workspace_id='c6621640-...';

    -- Pre-check 2: priorities libres
    SELECT priority, name FROM routing_rules
    WHERE workspace_id='c6621640-ba67-43de-9f05-905f09a6dc8f' AND active=true ORDER BY priority;

    -- Crear la rule (multi-canal D-02, fact channel):
    INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
    VALUES (
      'c6621640-ba67-43de-9f05-905f09a6dc8f',
      'Varixcenter routing (WA+FB+IG)',
      'router',
      <PRIORITY_LIBRE_DE_WAVE0>,
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('fact','channel','operator','in','value',ARRAY['whatsapp','facebook','instagram'])
      )),
      jsonb_build_object('type','route','params',jsonb_build_object('agent_id','varixcenter')),
      true
    );

    -- Rollback rápido (desactivar):
    -- UPDATE routing_rules SET active=false
    -- WHERE name='Varixcenter routing (WA+FB+IG)' AND workspace_id='c6621640-...';
    ```

    Documentar también: que tras crear la regla el agente empieza a recibir tráfico; recovery <10s tras cache TTL; y los smoke tests recomendados (dropdown routing-editor muestra "Varixcenter Valoraciones"; primer mensaje real agenda cita en varix-clinic).

    Verificación final (correr todo y registrar en el SUMMARY):
    ```bash
    grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts
    grep -c "id: 'varixcenter'" src/lib/agents/agent-catalog.ts
    grep -c "import('../varixcenter')" src/lib/agents/production/webhook-processor.ts
    grep -c "agentId === 'varixcenter'" src/lib/agents/production/webhook-processor.ts
    grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts
    grep -cE "agentModule.*!== 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts
    grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/ | wc -l   # = 0
    grep -rn "'godentist'" src/lib/agents/varixcenter/ | wc -l   # = 0
    npx vitest run src/lib/agents/varixcenter/__tests__/ src/lib/domain/varix-clinic/__tests__/ src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/ 2>&1 | tail -10
    npx tsc --noEmit 2>&1 | tail -5
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md && grep -c "c6621640" .planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md; grep -rn "'godentist'" src/lib/agents/varixcenter/ | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - 12-ROUTING-RULE-USER-ACTION.md existe con el SQL pre-formado (workspace c6621640 + fact channel + agent_id varixcenter)
    - Los 6 grep gates pasan
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/` = 0 (anti-cdc06d9)
    - `grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0 (Regla 3)
    - Las 4 suites (varixcenter + varix-clinic + godentist + godentist-fb-ig) verdes
    - tsc --noEmit = 0 (deploy verde)
  </acceptance_criteria>
  <done>SQL de routing rule listo; verificación end-to-end completa (gates + suites + Regla 6).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: CHECKPOINT — Push a Vercel (post-SQL, Regla 5) + activación routing rule + LEARNINGS</name>
  <what-built>
    El código del agente está completo, testeado y verificado (6 gates + suites verdes + Regla 6). La migración de templates ya fue aplicada en prod (Wave 5). Ahora se puede pushear (Regla 5: SQL antes que código — ya cumplido). La activación es manual (Regla 6 / D-02).
  </what-built>
  <how-to-verify>
    Pasos del operador:
    1. **Push a Vercel** (Regla 1 + Regla 5 — la migración YA está en prod):
       ```bash
       git add src/lib/agents/varixcenter/ src/lib/domain/varix-clinic/ src/lib/agents/agent-catalog.ts src/lib/agents/production/webhook-processor.ts src/lib/agents/engine/v3-production-runner.ts supabase/migrations/*varixcenter* .claude/rules/agent-scope.md CLAUDE.md
       git commit -m "feat(varixcenter): agente de valoraciones flebologicas multi-canal con agendamiento real vs varix-clinic"
       git push origin main
       ```
       Esperar a que Vercel despliegue verde.
    2. **Verificar dropdown** en /agentes/routing/editor: debe aparecer "Varixcenter Valoraciones".
    3. **Crear la routing rule** ejecutando el SQL de 12-ROUTING-RULE-USER-ACTION.md (con el priority libre). Esto ACTIVA el agente (empieza a recibir tráfico WA/FB/IG del workspace c6621640-...).
    4. **Smoke real:** enviar un mensaje de prueba al número/canal del workspace y verificar que (a) el bot responde con templates de varixcenter (no godentist), (b) al completar el flujo, la cita aparece en varix-clinic (SELECT en appointments del Supabase de varix-clinic).
    5. **LEARNINGS.md** (Regla 0 GSD + Regla 4): documentar bugs encontrados, el patrón del primer agente MorfX que escribe en DB externa, y cualquier desviación. Actualizar MEMORY del proyecto.
    ⚠️ Si el smoke real falla, NO dejar la routing rule activa — desactivar con el rollback SQL hasta resolver.
  </how-to-verify>
  <resume-signal>Responder "pusheado + routing rule creada + smoke OK" (o describir issues). Confirmar que la cita de prueba apareció en varix-clinic.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operador -> routing_rules | la activación manual controla todo el tráfico hacia el agente |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-varix-11 | Tampering | routing rule con priority colisionado | mitigate | priority libre verificado en Wave 0; UNIQUE INDEX uq_routing_rules_priority lo rechazaría |
| T-varix-12 | Repudiation | agente activado sin pruebas afecta clientes reales | mitigate | activación manual + smoke real + rollback SQL documentado (Regla 6) |
</threat_model>

<verification>
- Scope documentado en agent-scope.md + CLAUDE.md (BLOQUEANTE)
- SQL de routing rule pre-formado con priority libre
- Push post-SQL (Regla 5); routing rule creada (Regla 6 manual)
- Smoke real: cita aparece en varix-clinic
</verification>

<success_criteria>
- Scope del agente documentado (OBLIGATORIO al crear agente nuevo)
- Agente desplegado + activado vía routing rule manual (D-02)
- Cita de prueba agendada end-to-end en varix-clinic
- LEARNINGS.md + MEMORY actualizados
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/11-SUMMARY.md`
</output>
