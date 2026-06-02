---
plan: 08
wave: 5
phase: standalone-somnio-v4-rag-generative
depends_on: [05, 06, 07]
files_modified:
  - .planning/standalone/somnio-v4-rag-generative/LEARNINGS.md
  - .planning/standalone/somnio-v4-rag-generative/STATUS.md
autonomous: false  # Regla 6 + RESEARCH A2 risk conversation
requirements: []
user_setup:
  - service: supabase
    why: "Activación productiva de v4 vía routing rule manual (Regla 6 — no automatizar mutaciones de routing_rules)"
    dashboard_config:
      - task: "Pre-checks SQL + INSERT INTO routing_rules en Supabase Studio (workspace Somnio)"
        location: "Supabase Studio SQL Editor (proyecto morfx production)"

must_haves:
  truths:
    - "Smoke A Jose review confirmado ≥15/17 OK + 0 invenciones detectadas (Jose) (CONTEXT.md criterios de éxito)."
    - "Smoke B Jose review confirmado ≥9/10 OK."
    - "RESEARCH A2 risk conversation completada con usuario: 'Smoke A 0 invenciones detectadas. Para activar v4 sin grounding asumimos tasa residual ≤5%. Rollback vía SQL routing_rules preparado. ¿Aceptás riesgo?'"
    - "LEARNINGS.md escrito con: patrones que funcionaron, pitfalls descubiertos, comparación expected vs. real, deuda técnica creada (ej. tone_override no usado en V1)."
    - "SQL pre-formado de routing rule emitido en bloque markdown DENTRO del task (NO archivo en supabase/migrations/)."
    - "Usuario ejecutó el SQL en Supabase Studio (manual — Regla 6)."
    - "Post-flip: v4 ACTIVO en producción para el workspace Somnio con las conditions definidas."
    - "Rollback SQL documentado y preparado en caso de necesidad."
    - "STATUS.md final: standalone shipped + HEAD post-flip + nota de monitoreo recomendado primeras 24-48h."
  artifacts:
    - path: ".planning/standalone/somnio-v4-rag-generative/LEARNINGS.md"
      provides: "Patrones + pitfalls + decisiones aprendidas del standalone"
      contains: "## Patterns that worked"
    - path: ".planning/standalone/somnio-v4-rag-generative/STATUS.md"
      provides: "Estado final: standalone shipped"
      contains: "Plan 08 done"
  key_links:
    - from: "Usuario (manual SQL)"
      to: "routing_rules table (Supabase production)"
      via: "Supabase Studio SQL Editor — INSERT INTO routing_rules"
      pattern: "somnio-sales-v4"
---

<objective>
Wave 5 — Flip productivo: activación de v4 en producción vía SQL manual del usuario (Regla 6 — no automatizar mutaciones de `routing_rules`).

Este plan NO escribe archivos en `supabase/migrations/` — el SQL se emite en bloque markdown dentro del Task 8.3 para que el usuario lo copie y pegue en Supabase Studio. Esto sigue el patrón verbatim de Godentist FB/IG sibling D-15 manual SQL (`.claude/rules/agent-scope.md:200-238`).

**3 pre-conditions BLOQUEANTES:**
1. Smoke A Jose review ≥15/17 OK + 0 invenciones (verificable en SMOKE-A-RESULTS.md aggregate).
2. Smoke B Jose review ≥9/10 OK (verificable en SMOKE-B-RESULTS.md aggregate).
3. RESEARCH A2 risk conversation con usuario completada — explícito sobre riesgo residual sin grounding (D-18).

Output:
- 1 archivo nuevo: `LEARNINGS.md`.
- STATUS.md actualizada con shipped status.
- SQL pre-formado emitido en task (NO archivo en repo).
- Usuario ejecuta SQL manualmente — confirma cuándo lo aplicó.
- v4 ACTIVO en producción.

**Tareas:**
1. Task 8.1: Verificar pre-conditions (Smoke A + Smoke B Jose pass).
2. Task 8.2: RESEARCH A2 risk conversation con usuario (CHECKPOINT bloqueante).
3. Task 8.3: Escribir LEARNINGS.md.
4. Task 8.4: Emitir SQL pre-formado + PAUSAR para que usuario lo ejecute (CHECKPOINT bloqueante).
5. Task 8.5: Update STATUS.md + commit + push final + monitoreo recomendado.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/somnio-v4-rag-generative/STATUS.md
@.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
@.planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
@.planning/standalone/agent-godentist-fb-ig/09-PLAN.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 8.1: Verificar pre-conditions (Smoke A + Smoke B Jose review pass)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md (aggregate metrics + per-case Jose checkboxes)
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md (aggregate metrics + per-case Jose checkboxes)
  </read_first>
  <action>
    Leer ambos archivos y verificar:

    **Smoke A:**
    - Leé el bloque "Aggregate metrics" al final de `SMOKE-A-RESULTS.md` donde Jose anotó los counts finales (formato esperado: `Jose PASS: N/17`). Si los counts no están escritos, pedile a Jose que los complete antes de avanzar — no inferir de checkboxes per-case porque la convención visual (× / ✅ / ☑ / [x]) no está lockeada y el grep produce falsos negativos.
    - **Criterio:** Jose PASS ≥ 15/17.

    **Invenciones (Smoke A):**
    - Leé la sección "Invenciones detectadas" del Aggregate metrics donde Jose anotó el count (formato esperado: `Invenciones detectadas: N`). Si no está escrito, pedile a Jose que recorra los 17 casos y lo complete.
    - **Criterio:** 0 invenciones marcadas por Jose.

    **Smoke B:**
    - Leé el bloque "Aggregate metrics" al final de `SMOKE-B-RESULTS.md` donde Jose anotó los counts (formato esperado: `Jose PASS: N/10`). Si no están escritos, pedile a Jose que los complete antes de avanzar.
    - **Criterio:** Jose PASS ≥ 9/10.

    **Si CUALQUIER criterio falla:**
    - STOP. Reportar al usuario qué falta.
    - Sugerir abrir Plan 07 (HOLD) con el trigger correspondiente.

    **Si TODOS los criterios pasan:**
    - Anunciar: "Pre-conditions OK. Smoke A: X/17 PASS + 0 invenciones. Smoke B: Y/10 PASS. Avanzando a risk conversation."
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md && test -f .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md && echo "Both result files present — manual review of Jose checkboxes required"</automated>
  </verify>
  <acceptance_criteria>
    - Ambos archivos SMOKE-A-RESULTS.md + SMOKE-B-RESULTS.md existen.
    - Smoke A Jose PASS ≥ 15/17 + 0 invenciones (verificable por executor leyendo aggregate metrics + per-case marcas Jose).
    - Smoke B Jose PASS ≥ 9/10.
    - Si algún criterio falla, executor STOP + reporta + sugiere Plan 07.
  </acceptance_criteria>
  <done>Pre-conditions verificadas. Próximo: risk conversation.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 8.2: RESEARCH A2 risk conversation — confirmar tolerancia a riesgo residual sin grounding</name>
  <decision>
    ¿Aceptás tolerancia a riesgo residual de invención (RESEARCH A2 — D-18 difiere checkSourceGrounding a V2)?
  </decision>
  <context>
    **Literatura (RESEARCH líneas 678-700):**
    > "Medical AI systems show 43%–64% hallucination rates depending on prompt quality."
    > "RAG reduces hallucination rates by 30%–70% across domains."
    >
    > Post-RAG en V1, residual hallucination rate esperado = **15-40%** sin grounding post-hoc.

    **Estado actual:**
    - Smoke A Jose review: 0 invenciones detectadas en 17 casos (verificado Task 8.1).
    - PERO la muestra es pequeña (17 casos). En producción, exposición es 100x-1000x más.
    - D-18 (locked) difiere `checkSourceGrounding` a V2.
    - Mitigaciones existentes en V1: prompt anti-invención duro + M3 binary backstop + NUNCA-decir + Jose review.

    **El usuario debe confirmar explícitamente:**
    > "Smoke A tiene 0 invenciones detectadas en 17 casos. Para activar v4 sin grounding asumimos que la tasa residual ≤ 5% en producción. Si vemos 1 caso real de invención post-flip, el rollback es vía SQL `UPDATE routing_rules SET active=false` (recovery <10s tras cache TTL). ¿Aceptás este nivel de riesgo + tenés disponibilidad para responder rápido a un caso real si emerge?"
  </context>
  <options>
    <option id="accept-and-flip">
      <name>ACCEPT — Riesgo conocido + comprometo monitoreo + flip productivo</name>
      <pros>v4 entra en producción ahora. Monitoreo primeras 24-48h. Rollback rápido si invención emerge real.</pros>
      <cons>Riesgo material residual. Caso de invención puede llegar a cliente real.</cons>
    </option>
    <option id="defer-implement-grounding">
      <name>DEFER — Implementar checkSourceGrounding antes (V2 inline)</name>
      <pros>Mitigación adicional 40% (RESEARCH MEGA-RAG). Riesgo residual ~2-5%. Más seguro.</pros>
      <cons>+500ms-1s latencia por respuesta. 1-2 días implementación + re-Smoke A. Atrasa el flip.</cons>
    </option>
    <option id="defer-explore-more">
      <name>DEFER — Necesito más data antes de decidir</name>
      <pros>Permite explorar Smoke A más a fondo (ej. agregar 10 casos más de invención adversarial), comparar Flash vs Flash-Lite, etc.</pros>
      <cons>Atrasa el flip. Posible "analysis paralysis".</cons>
    </option>
  </options>
  <resume-signal>
    Type uno de: "accept-and-flip", "defer-implement-grounding", "defer-explore-more". Si accept-and-flip → continuar con Task 8.3. Si defer-* → cerrar Plan 08 (no se ejecuta) y abrir Plan 07 con el iter correspondiente.
  </resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 8.3: Escribir LEARNINGS.md</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md + SMOKE-B-RESULTS.md (insights de patrones)
    - .planning/standalone/somnio-v4-rag-generative/01-SUMMARY.md ... 06-SUMMARY.md (qué pasó en cada plan)
    - .planning/phases/44.1-crm-bots-config-db/LEARNINGS.md (ejemplo de estructura LEARNINGS — leer si existe, sino usar template abajo)
  </read_first>
  <action>
    Crear `.planning/standalone/somnio-v4-rag-generative/LEARNINGS.md` siguiendo este template:

    ```markdown
    # Somnio v4 RAG Generative — LEARNINGS

    **Standalone:** somnio-v4-rag-generative
    **Shipped:** YYYY-MM-DD (a completar Task 8.5)
    **HEAD:** <commit-sha-post-flip>
    **Duración total:** Plan 01 → Plan 08 = X días.

    ---

    ## Lo que funcionó

    ### Patterns que dieron buen resultado

    - **Split tooling/generación (D-07/D-08 + A1):** la separación en 2 calls (GPT-4o mini → Gemini Flash) funcionó sin contention. Latencia adicional manejable.
    - **safeAccessOutput wrapper (A3):** capturó X casos de NoObjectGeneratedError sin perder respuestas válidas (ver SMOKE-A-RESULTS.md errores recuperados).
    - **M3 binary backstop:** detectó X casos donde responseConfidence numérico ≥ 0.70 pero binary = FALTA_INFO → handoff correcto.
    - **Big-bang migración (D-23):** 18 KBs reescritos en un solo plan resultó manageable. NO requirió rollback.
    - **Atomic deploy unit Plan 02 + Plan 03 (D-24):** push final atómico previno runtime degradation. Patrón replicable.
    - **safetySettings BLOCK_NONE x4:** sin esto, X casos de Smoke A habrían fallado por safety block (alcohol/embarazo/anticoagulantes).
    - _(agregar más según observación real)_

    ### Decisiones del discuss-phase que se confirmaron acertadas

    - **D-11 (B1 — UN topic ganador):** evitó duplicar razonamiento. Gemini recibió material limpio.
    - **D-25 / D-26 (judge híbrido):** LLM-as-judge aceleró triage; Jose validó ground truth final.
    - _(agregar)_

    ## Lo que NO funcionó / Pitfalls descubiertos

    ### Sorpresas técnicas

    - _(ej. "vercel/ai#11348 efectivamente disparó en X casos del Smoke A — safeAccessOutput salvó el comportamiento")_
    - _(ej. "Gemini Flash overconfidence menor a lo esperado por literatura — M1+M2+M3 calibration funcionó mejor que el pesimismo del RESEARCH")_
    - _(agregar según realidad)_

    ### Decisiones que reconsideraría

    - _(ej. "tone_override en frontmatter — no se usó en V1, agrega complejidad sin valor concreto, considerar deprecar")_
    - _(ej. "Schema intermedio entre las 2 calls — alternativa: que Gemini reciba los 3 hits y elija, evita 'topic ganador' en GPT mini")_
    - _(agregar)_

    ## Deuda técnica creada

    - **`tone_override`** en `agent_knowledge_base.tone_override` + frontmatter parser: agregado pero no usado en V1. Si V2 lo activa, OK; si no, candidato a remoción.
    - **`canonical_response`** marcada DEPRECATED para somnio-v4 pero sigue en tabla. Otros agentes la usan — no remover globalmente. Si en el futuro todos los agentes migran a RAG, eliminar columna.
    - **checkSourceGrounding** diferido a V2 (D-18). Si invención emerge en producción post-flip, abrir nuevo standalone para implementar (RESEARCH líneas 696-700 receta de implementación).
    - **A/B Flash vs Flash-Lite** pendiente — Plan 05 podía incluirlo pero quedó out of scope.
    - _(agregar según realidad)_

    ## Datos cuantitativos

    | Métrica | Valor | Notas |
    |---|---|---|
    | Smoke A Jose PASS | X/17 (Y%) | |
    | Smoke A invenciones | 0/17 | (verificable) |
    | Smoke A MISCALIBRATED_HIGH (judge) | X/17 (Y%) | |
    | Smoke B Jose PASS | X/10 | |
    | Latencia p50 sub-loop | Xs | Target <6s CONTEXT.md |
    | Latencia p95 sub-loop | Xs | Target watching |
    | Plans totales | 7 (+1 hold) | |
    | Commits del standalone | X | |
    | KBs reescritos | 18 | |
    | Tests creados | X (parser + coherence + safe-output + few-shots + smoke-a + smoke-b) | |

    ## Patterns replicables para próximos standalones

    1. **Atomic deploy unit (Plan 02 + Plan 03 con push final único):** patrón cuando 2 planes son interdependientes a nivel runtime. NO pushear primero individualmente — el push del segundo absorbe ambos commits.
    2. **Regla 5 PAUSE con migración SQL en archivo:** Plan 01 patrón verbatim de crm-mutation-tools 01-PLAN.
    3. **Regla 6 manual SQL en bloque markdown (NO archivo):** Plan 08 patrón verbatim de Godentist FB/IG D-15.
    4. **safeAccessOutput wrapper:** reusable en cualquier sub-loop o agent que use AI SDK v6 Output.object — agregar al codebase para uso compartido si se necesita.
    5. **M1+M2+M3+M4 calibration:** patrón replicable para cualquier confidence-based handoff. Discretización + probability framing + binary backstop + cobertura de buckets.
    6. **LLM-as-judge separado:** Flash separado vs Flash-Lite para Smoke evals. Replicable para futuros tests cualitativos.

    ## Para próximos agentes / standalones

    - El módulo `safe-output.ts` puede compartirse — considerar mover a `src/lib/agents/shared/` si otro agente lo necesita.
    - El patrón split tooling/generación es necesario mientras Gemini 2.5 series sea el provider — Gemini 3 GA lo simplifica a 1 call.
    - Re-validar trimestralmente H-2 (`STATUS.md` agregar checkbox 2026-08-16: re-check H-2).

    ## Próximos pasos post-flip

    - Monitoreo primeras 24-48h post-flip — buscar errores `AI_NoOutputGeneratedError` (Pitfall 1), `finishReason='SAFETY'` (Pitfall 6), invenciones reales (RESEARCH A2 risk).
    - Si emerge 1 caso de invención real → rollback inmediato + abrir standalone checkSourceGrounding V2.
    - A/B Flash vs Flash-Lite — pendiente decisión usuario.
    - Re-revisar trimestralmente H-2 (Gemini 3 GA + AI SDK bug fixed).
    ```

    Completar las secciones con datos reales del standalone. Si alguna sección no tiene contenido específico (ej. "Sorpresas técnicas" si todo fue smooth), escribir "_Sin sorpresas técnicas significativas — el research-phase predijo bien el comportamiento real_" en vez de dejar vacío.
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/LEARNINGS.md && grep -c "^## Lo que funcionó\\|^## Lo que NO funcionó\\|^## Deuda técnica creada\\|^## Datos cuantitativos\\|^## Patterns replicables" .planning/standalone/somnio-v4-rag-generative/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists.
    - Tiene las 5 secciones obligatorias: Lo que funcionó, Lo que NO funcionó, Deuda técnica, Datos cuantitativos, Patterns replicables.
    - Tabla de Datos cuantitativos rellenada con valores reales (no placeholders X).
  </acceptance_criteria>
  <done>LEARNINGS.md escrito.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 8.4: PAUSE — Emitir SQL pre-formado + Usuario ejecuta en Supabase Studio (Regla 6)</name>
  <what-built>
    SQL pre-formado para activar v4 en producción Somnio.

    NO es un archivo en `supabase/migrations/` — es una operación de routing manual (Regla 6 — el operador ejecuta directo en Supabase Studio, no via migración del repo).

    Patrón verbatim de Godentist FB/IG D-15 activación manual (`.claude/rules/agent-scope.md:200-238`).
  </what-built>
  <how-to-verify>
    **Pre-checks SQL — ejecutar primero en Supabase Studio SQL Editor:**

    ```sql
    -- Pre-check 1: verificar feature flag del lifecycle router activo en Somnio
    SELECT lifecycle_routing_enabled
    FROM workspace_agent_config
    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
    -- Esperado: true. Si false:
    --   UPDATE workspace_agent_config SET lifecycle_routing_enabled=true
    --   WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';

    -- Pre-check 2: ver el estado actual de routing_rules en Somnio + qué priorities están tomadas
    SELECT priority, name, active, event::text
    FROM routing_rules
    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true
    ORDER BY priority;
    -- Notar qué priority slots están tomados (somnio-recompra-v1, somnio-sales-v3, etc.).
    -- Escoger un priority libre acorde a la prioridad relativa que v4 debe tener.

    -- Pre-check 3: confirmar smokes pasados (mental — ya verificado en Task 8.1)
    -- - SMOKE-A-RESULTS.md aggregate: Jose PASS ≥ 15/17 + 0 invenciones.
    -- - SMOKE-B-RESULTS.md aggregate: Jose PASS ≥ 9/10.
    -- - LEARNINGS.md presente.

    -- Pre-check 4: confirmar el código del Plan 03 está en main
    -- - HEAD de main debe ser el commit del Plan 03 (o posterior — Plan 04/05/06).
    --   Verificable con `git log --oneline -5` en local.

    -- Pre-check 5: confirmar Plan 01 migración aplicada (las 5 columnas existen)
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agent_knowledge_base'
      AND column_name IN ('hechos_del_producto','posicion_del_negocio','debe_contener','cuando_escalar','tone_override')
    ORDER BY column_name;
    -- Esperado: 5 rows.
    ```

    **Activación — ejecutar después de pre-checks OK:**

    ```sql
    -- DECIDIR conditions del rule con el usuario. Ejemplo conservador:
    --   - Activar v4 SOLO para canal WhatsApp (filtrar para no afectar otros canales).
    --   - Activar SOLO cuando el cliente NO esté en flujo de recompra activo.
    -- El usuario decide la condition exacta en el momento del flip.

    INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
    VALUES (
      'a3843b3f-c337-4836-92b5-89c58bb98490',
      'Somnio Sales v4 RAG routing',
      'router',
      <PRIORITY_LIBRE>,  -- ej. 850 si las otras rules están en 100, 200, 900, 1000
      jsonb_build_object(
        'all', jsonb_build_array(
          jsonb_build_object('fact', 'channel', 'operator', 'equal', 'value', 'whatsapp')
          -- agregar más conditions si el usuario decide (ej. NOT is_client, etc.)
        )
      ),
      jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'somnio-sales-v4')),
      true
    );
    ```

    **Rollback (para tener a mano — recovery <10s tras cache TTL):**

    ```sql
    UPDATE routing_rules SET active=false
    WHERE name='Somnio Sales v4 RAG routing'
      AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
    ```

    **Después de ejecutar el INSERT, verificar:**

    ```sql
    SELECT id, name, priority, active, event::text
    FROM routing_rules
    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
      AND name='Somnio Sales v4 RAG routing';
    -- Esperado: 1 row con active=true.
    ```

    Luego escribir "activado" (o "skipped" si decidiste no flipear ahora) para que el executor continúe con Task 8.5.
  </how-to-verify>
  <action>
    STOP. Presentar al usuario:
    1. El bloque SQL completo (pre-checks + activación + rollback) arriba.
    2. Recordatorio: el priority debe ser libre — usuario decide después de leer pre-check 2.
    3. Recordatorio: conditions exactas pueden ajustarse (canal + flags + etc.) — usuario decide.
    4. Recordatorio: rollback es 1 línea SQL — tenerlo a mano.

    Esperar señal "activado" o "skipped".
  </action>
  <verify>
    <automated>echo "blocked-on-user-action"</automated>
  </verify>
  <acceptance_criteria>
    - Usuario tipea "activado" (rule INSERT exitoso) o "skipped" (decidió no flipear ahora — Plan 08 cierra como no-shipped).
    - Si activado: usuario reporta el priority + conditions exactas usadas.
  </acceptance_criteria>
  <done>Usuario confirma acción (activado o skipped).</done>
  <resume-signal>Type "activado" o "skipped" después de ejecutar el SQL en Supabase Studio.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 8.5: Update STATUS.md + commit final + push + monitoreo recomendado</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/STATUS.md (estado actual)
    - CLAUDE.md (Regla 1 push)
  </read_first>
  <action>
    **Si Task 8.4 == "activado":**

    1. Editar STATUS.md sección "Phases":
       - Marcar `[x] Execute-phase plan 08 (flip productivo)`.
       - Marcar `[x] Verify-phase`.
       - Marcar `[x] LEARNINGS.md`.
       - Update encabezado: `**v4 status en prod:** ACTIVO (flipped YYYY-MM-DD por Jose) — monitoreo primeras 24-48h`.

    2. Editar STATUS.md sección "Plans status" — Plan 08 status = "shipped".

    3. Commit + push:

    ```
    git add .planning/standalone/somnio-v4-rag-generative/LEARNINGS.md \
            .planning/standalone/somnio-v4-rag-generative/STATUS.md

    git commit -m "$(cat <<'EOF'
    docs(somnio-v4-rag-generative): plan 08 — standalone SHIPPED (v4 activado en prod)

    - LEARNINGS.md escrito: patterns que funcionaron, pitfalls, deuda técnica, datos cuantitativos.
    - STATUS.md updated: standalone shipped, v4 ACTIVO en producción.
    - SQL routing rule ejecutado manualmente por usuario en Supabase Studio (Regla 6).
    - Pre-conditions cumplidas: Smoke A ≥15/17 + 0 invenciones + Smoke B ≥9/10 + risk conversation A2 aceptada.

    Standalone: somnio-v4-rag-generative Plan 08 (Wave 5 — flip productivo).
    Refs CONTEXT.md métricas de éxito, RESEARCH A2 + Pre-Flip Risk Assessment.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```

    4. **Monitoreo recomendado al usuario:**

    > "Standalone somnio-v4-rag-generative SHIPPED. v4 activo en producción para Somnio.
    >
    > **Monitoreo recomendado primeras 24-48h:**
    > - Revisar logs Vercel para errores `AI_NoOutputGeneratedError` (Pitfall 1 — safeAccessOutput wrapper debería absorber).
    > - Revisar logs Vercel para errores con `finishReason='SAFETY'` (Pitfall 6 — BLOCK_NONE debería prevenir).
    > - Revisar observability `agent_observability_events` filtrando por `agent_id='somnio-sales-v4'`:
    >   - % de outcomes `status='generated'` vs `status='no_match'`.
    >   - Distribución de `responseConfidence`.
    >   - Distribución de `reason` en handoffs (low_response_confidence vs binary_backstop_FALTA_INFO/FUERA_SCOPE vs nunca_decir_violation vs no_relevant_hit).
    > - Revisar manualmente 5-10 conversaciones reales de Somnio post-flip — confirmar 0 invenciones detectadas.
    >
    > **Si emerge 1+ caso de invención real:**
    > - Rollback SQL inmediato: `UPDATE routing_rules SET active=false WHERE name='Somnio Sales v4 RAG routing' AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';`
    > - Recovery <10s tras cache TTL.
    > - Abrir nuevo standalone para implementar checkSourceGrounding (V2).
    >
    > **Backlog post-shipped:**
    > - A/B Flash vs Flash-Lite (Plan 05 lo defería).
    > - Re-revisión trimestral H-2 (2026-08-16).
    > - Considerar deprecar `tone_override` si nunca se usa.
    > "

    **Si Task 8.4 == "skipped":**

    1. Editar STATUS.md notando que Plan 08 quedó pending (no flipeado).
    2. Razón: el usuario decidió diferir el flip.
    3. Commit + push solo LEARNINGS.md + STATUS.md.
    4. NO anunciar "shipped" — el standalone queda completo en código + tests pero NO activo.
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "plan 08\\|standalone SHIPPED\\|standalone deferred" && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - STATUS.md actualizada con estado final (shipped o deferred).
    - LEARNINGS.md committed (de Task 8.3).
    - Push exitoso.
    - Si shipped: usuario notificado del monitoreo recomendado.
    - Si deferred: usuario notificado que el standalone queda completo en código pero v4 sigue dormant — flip pendiente cuando decida.
  </acceptance_criteria>
  <done>Standalone cerrado (shipped o deferred). STATUS.md final.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Usuario → Supabase Studio | SQL INSERT manual a `routing_rules` (Regla 6 — no automatizar) |
| Production webhook → v4 sub-loop | Post-flip, tráfico real de Somnio entra al sub-loop nuevo |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-08-01 | Elevation of Privilege | SQL INSERT con conditions equivocadas → routing rota | HIGH | mitigate | Pre-check 2 explícito al usuario para escoger priority libre. Rollback SQL preparado (1 línea UPDATE active=false). Recovery <10s. |
| T-08-02 | Tampering | Cliente real recibe respuesta inventada post-flip | HIGH | mitigate | Smoke A invención check (Task 8.1) + RESEARCH A2 risk conversation (Task 8.2) explícita. Monitoreo recomendado primeras 24-48h. Rollback SQL preparado. |
| T-08-03 | Denial of Service | v4 latencia p95 >8s en prod → cliente espera mucho | MEDIUM | mitigate | Webhook responde 200 inmediato (sub-loop async via Inngest). El cliente experimenta latencia pero no timeout. Monitoreo p95 incluido en monitoring recommendation. |
| T-08-04 | Repudiation | Activación sin Smoke pasados (skip risk conversation) | HIGH | mitigate | Tasks 8.1 + 8.2 son bloqueantes. Task 8.4 PAUSE explícito requiere señal usuario. Audit trail via STATUS.md + LEARNINGS.md. |
| T-08-05 | Information Disclosure | LEARNINGS.md contiene info sensible | LOW | accept | Solo patterns técnicos, no info de clientes / pedidos. |
</threat_model>

<verification>
- Pre-conditions verificadas (Task 8.1).
- Risk conversation completada (Task 8.2 == "accept-and-flip").
- LEARNINGS.md escrito (Task 8.3).
- SQL ejecutado por usuario (Task 8.4 == "activado").
- STATUS.md final committed + pushed (Task 8.5).
- v4 ACTIVO en producción (verificable post-push):
  - `SELECT count(*) FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true AND event::text LIKE '%somnio-sales-v4%'` ≥ 1.
- Monitoreo recomendado al usuario.
</verification>

<success_criteria>
Plan 08 cerrado cuando:
- [ ] Pre-conditions verificadas (Smoke A + B Jose PASS).
- [ ] Risk conversation completada con usuario.
- [ ] LEARNINGS.md committed.
- [ ] SQL ejecutado por usuario (o deferred).
- [ ] STATUS.md final updated.
- [ ] Push exitoso.
- [ ] Si shipped: usuario notificado monitoring + rollback.
- [ ] Si deferred: usuario notificado standalone completo en código.
</success_criteria>

<rollback>
**Si post-flip emerge caso de invención real o cualquier bug crítico:**

```sql
-- Inmediato (recovery <10s tras cache TTL):
UPDATE routing_rules SET active=false
WHERE name='Somnio Sales v4 RAG routing'
  AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
```

v3 vuelve a recibir tráfico (sigue ACTIVO sin interrupción — Regla 6 v3 nunca se tocó).

**Si querés rollback completo (revertir código):**

1. `git revert <plan-03-sha>` (sub-loop refactor) — esto deja v4 técnicamente roto, pero como está inactive no afecta nada.
2. Re-aplicar versión vieja del KB (Plan 02 commit revert) si querés que sync local vuelva al formato viejo.
3. Migration Plan 01 NO necesita revert — las 5 columnas nuevas siguen en tabla pero no se leen.

**Si querés re-flipear post-fix:**

1. Fix del bug en un nuevo standalone o como hotfix.
2. Re-correr Smoke A + Smoke B.
3. Si pasan, repetir Plan 08 (re-INSERT SQL en `routing_rules`).
</rollback>

<output>
After completion, `.planning/standalone/somnio-v4-rag-generative/08-SUMMARY.md` consolida el standalone entero:
- Resumen ejecutivo (qué se logró).
- HEAD final del push.
- Estado de v4 (shipped o deferred).
- Confirmación de monitoreo recomendado entregado al usuario.
- Refs a LEARNINGS.md para detalles técnicos.
- Cierre del standalone.

Y STATUS.md refleja el estado final: standalone completo, v4 activo (o pending) en producción.
</output>
