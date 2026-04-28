---
phase: agent-forensics-panel
plan: 06
type: execute
wave: 5
depends_on: [05]
files_modified:
  - .planning/standalone/agent-forensics-panel/LEARNINGS.md
  - docs/analysis/04-estado-actual-plataforma.md
  - docs/architecture/
autonomous: true

decisions_addressed: []

must_haves:
  truths:
    - "`.planning/standalone/agent-forensics-panel/LEARNINGS.md` creado documentando bugs encontrados (si alguno), patterns aprendidos, Pitfalls confirmados o no, decisiones que resultaron buenas/malas post-implementacion (CLAUDE.md Regla 0 requirement)"
    - "`docs/analysis/04-estado-actual-plataforma.md` actualizado — agregar seccion o actualizar existente sobre observability/debug panel reflejando la nueva forensics layer (CLAUDE.md Regla 4)"
    - "Si `docs/architecture/` tiene pagina de observability/debug, actualizada con referencia a `src/lib/agent-specs/` + mecanismo del auditor + endpoint POST `/api/agent-forensics/audit`"
    - "Suite test completa verde: `npm test` exits 0 (o solo fails preexistentes no relacionados con esta fase)"
    - "Typecheck limpio: `npx tsc --noEmit` sin errores"
    - "Build exitoso: `npm run build` completa sin errores (verifica Pitfall 3 — outputFileTracingIncludes correctamente funcionando)"
    - "Git log muestra la fase como coherente: 7 (P01) + 4 (P02) + 4 (P03) + 4 (P04) + 1 (P05 docs) = ~20 commits, todos con prefix `(agent-forensics-panel)`, Co-Authored-By consistent"
  artifacts:
    - path: ".planning/standalone/agent-forensics-panel/LEARNINGS.md"
      provides: "Bugs + patterns + retrospective de la fase (Regla 0 + Regla 4)"
      contains: "Plan 01"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Estado actualizado de observability + debug panel"
      contains: "forensics"
  key_links:
    - from: "LEARNINGS.md"
      to: "todos los 4 SUMMARY.md de los plans previos"
      via: "cross-reference synthesis"
      pattern: "01-SUMMARY|02-SUMMARY|03-SUMMARY|04-SUMMARY"
    - from: "docs/analysis/04-estado-actual-plataforma.md"
      to: "nueva forensics capability"
      via: "adicion de seccion describiendo el panel + auditor + specs"
      pattern: "agent-forensics|auditor AI"
---

<objective>
Wave 4 — Cierre formal de la fase. Sincroniza docs (CLAUDE.md Regla 4), escribe LEARNINGS.md (CLAUDE.md Regla 0), corre full test suite + typecheck + build final, y cierra con commit atomico + push.

Purpose: (a) Regla 4 — docs y codigo sincronizados. (b) Regla 0 — documentar bugs y patterns en LEARNINGS.md de la fase. (c) Gate final de calidad antes de dar la fase por cerrada.

Output: 1 LEARNINGS.md nuevo + 1 doc file modificado + (opcional) 1-2 docs de arquitectura actualizados.

**Dependency:** Plan 04 shipped + checkpoint humano aprobado (auditor responde + pointers validos).

**NO cambios de codigo en src/** — solo docs y planning. Ningun impacto en prod beyond el deploy que Plan 04 ya empujo.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-forensics-panel/CONTEXT.md, DISCUSSION-LOG.md, RESEARCH.md, PATTERNS.md — input material
@.planning/standalone/agent-forensics-panel/01-SUMMARY.md, 02-SUMMARY.md, 03-SUMMARY.md, 04-SUMMARY.md — outputs de cada plan (creados al cierre)
@CLAUDE.md §Regla 0 (LEARNINGS.md al completar fase), §Regla 4 (docs siempre actualizadas)
@docs/analysis/04-estado-actual-plataforma.md — doc a actualizar si tracks observability/debug
@docs/architecture/ — si existen paginas relevantes a observability o debug panel
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear `LEARNINGS.md` de la fase consolidando retrospectiva + patterns + bugs</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/01-SUMMARY.md (si existe)
    - .planning/standalone/agent-forensics-panel/02-SUMMARY.md
    - .planning/standalone/agent-forensics-panel/03-SUMMARY.md
    - .planning/standalone/agent-forensics-panel/04-SUMMARY.md
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Assumptions Log (cuales se validaron, cuales no)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Common Pitfalls (cuales se encontraron en prod)
    - git log --oneline desde el commit inicial de la fase (primer commit de Plan 01) hasta el ultimo (Plan 04 Task 4)
    - CLAUDE.md §Regla 0 (format de LEARNINGS esperado)
    - Ejemplos de LEARNINGS.md previos: `find .planning -name "LEARNINGS.md" -type f | head -3`
  </read_first>
  <action>
    **Paso 1 — Revisar SUMMARYs y extraer insights:**

    ```bash
    cat .planning/standalone/agent-forensics-panel/01-SUMMARY.md 2>/dev/null
    cat .planning/standalone/agent-forensics-panel/02-SUMMARY.md 2>/dev/null
    cat .planning/standalone/agent-forensics-panel/03-SUMMARY.md 2>/dev/null
    cat .planning/standalone/agent-forensics-panel/04-SUMMARY.md 2>/dev/null
    git log --oneline --grep "agent-forensics-panel" | head -30
    ```

    **Paso 2 — Buscar un LEARNINGS.md previo bien hecho como referencia:**

    ```bash
    find .planning -name "LEARNINGS.md" -type f -exec wc -l {} \; | sort -rn | head -5
    ```

    Leer uno reciente (ej. el de somnio-recompra-template-catalog si existe) para matchear el estilo.

    **Paso 3 — Crear `.planning/standalone/agent-forensics-panel/LEARNINGS.md`:**

    Estructura obligatoria:

    ```markdown
    # LEARNINGS — Agent Forensics Panel (Standalone)

    **Fase:** `agent-forensics-panel`
    **Completada:** YYYY-MM-DD
    **Plans:** 5 (01 migration + 02 timeline + 03 specs + 04 auditor + 05 polish)
    **Commits:** ~20 commits atomicos
    **Usuario:** Jose Romero
    **Contexto:** Panel forensics + Claude Sonnet 4.6 auditor sobre observability production pipeline (Phase 42.1)

    ## Resumen ejecutivo

    Se construyo una capa forensics sobre el debug panel existente, con 3 piezas acopladas:
    1. Fix del bug de etiquetado (todas las turns de recompra se mostraban como `somnio-v3`) via schema change `responding_agent_id` + backfill cascading + runtime capture en 3 branches de webhook-processor.
    2. Timeline condensado (filtra 18 categorias core + mechanism AI calls, oculta SQL queries) con tabs Forensics/Raw/Auditor.
    3. Auditor AI con prompt assembly from bot-specific markdown specs, streaming via Claude Sonnet 4.6, output markdown con file:line pointers pegable a Claude Code.

    ## Bugs encontrados y resueltos

    ### Bug #1 — Agent label mislabeling (CONTEXT.md <sub-bug>)

    **Sintoma:** Todas las turns de conversaciones de clientes (is_client=true) se etiquetaban como `somnio-v3` en el panel, aunque el runner que respondio fue `somnio-recompra-v1` (y analogamente para godentist).

    **Root cause:** El `ObservabilityCollector` se inicializa UNA vez al arrancar la Inngest function con el `conversational_agent_id` del workspace. Cuando `webhook-processor.ts` ruteaba a un runner diferente (recompra / godentist), nunca actualizaba el collector. El schema tampoco distinguia "entry agent" de "responding agent".

    **Fix (Plan 01):** Schema Opcion B — columna `responding_agent_id TEXT NULL` + setter mutable `setRespondingAgentId` en el collector + captura antes de `runner.processMessage` en 3 branches + backfill cascading en 4 criterios (pipeline_decision events + fallback agent_id).

    **Pitfall 1 descubierto:** Naive fix fallo en replays de Inngest — el valor mutado dentro de `step.run` se perdia porque ALS no sobrevive cross-boundary. Fix: encode `respondingAgentId` en el `__obs` return payload y mergear en el outer collector (mirror del Phase 42.1 Plan 07 events/queries/aiCalls pattern).

    ### Bug #N — [otros si surgieron durante ejecucion]

    [Agregar si hubo bugs adicionales descubiertos en Plans 02-04]

    ## Patterns aprendidos

    ### Pattern 1 — Schema change ritual (Regla 5 strict)

    Cada vez que se agrega una columna a una tabla particionada de Supabase:
    1. Crear archivo de migracion con BEGIN/COMMIT + ALTER + INDEX + backfill.
    2. Commit LOCAL primero (no push).
    3. Checkpoint humano — usuario aplica SQL en Supabase SQL Editor + corre query de verificacion + reporta output.
    4. SOLO con aprobacion explicita, continuar con los code changes que usan la columna.
    5. Push atomico del codigo + migracion commit al final.

    **Clave:** la migracion SQL commit y el codigo que la usa viajan juntos en git pero la aplicacion SQL en prod precede al deploy. Reusa el patron de `somnio-recompra-template-catalog` Plan 05.

    ### Pattern 2 — Collector setter mid-turn (Regla 6 defensive)

    Cuando un field del collector necesita mutacion despues de la construccion:
    1. Declarar el field como mutable (NO readonly).
    2. Exponer setter con try/catch swallow (never-throw Regla 6).
    3. Idempotencia same-value: silent ignore.
    4. Different-value: silent ignore (preserve first-write audit trail).
    5. Inngest step boundaries: encode en step return + merge en outer (Pitfall 1).

    ### Pattern 3 — Bundled markdown via outputFileTracingIncludes

    Para que `fs.readFile('src/lib/X/*.md')` funcione en Vercel lambda:
    ```typescript
    // next.config.ts
    outputFileTracingIncludes: {
      '/api/your-endpoint': ['./src/lib/X/**/*.md'],
    }
    ```
    Registrar el include AUN antes de que los archivos existan (glob matchea despues). Alternativa `import raw-loader` no recomendada.

    ### Pattern 4 — AI SDK v6 streaming route canonical

    Template `/api/agent-forensics/audit` es clone casi verbatim de `/api/builder/chat/route.ts`:
    - `await assertSuperUser()` primero.
    - `Promise.all([loadA, loadB, loadC])` para context parallel.
    - `streamText({ model: anthropic('...'), system, messages, temperature, maxOutputTokens })`.
    - `return result.toUIMessageStreamResponse()`.
    - Client: `useChat({ transport: new DefaultChatTransport({ api, body }) })`.

    ### Pattern 5 — Whitelist-based filtering con placeholder extensibility

    `condenseTimeline` tiene un whitelist de 18 categorias. Pitfall 5 (whitelist too aggressive) se mitiga con:
    - Raw view 1 click away (preservar full data).
    - Whitelist en UN solo archivo, editable en 1 PR.
    - Test cases describen el whitelist + exclusions → evolucion es safe.

    ## Assumptions validadas (RESEARCH.md §Assumptions Log)

    | # | Claim | Validation |
    |---|-------|-----------|
    | A1 | ALTER TABLE on parent cascades to partitions | VALIDATED — migration applied sin errores en prod |
    | A2 | Backfill criterion covers >95% | [fill post-deploy con stats reales] |
    | A3 | outputFileTracingIncludes funciona | [VALIDATED/INVALIDATED post-deploy de Plan 04] |
    | A4 | claude-sonnet-4-6 stable | VALIDATED — auditor responde OK |
    | A5 | react-markdown 10.x sin peer-dep issues | VALIDATED — npm install limpio |
    | A6 | 18-category whitelist buen signal-to-noise | TBD — iterar con feedback usuario |
    | A7 | loadSessionSnapshot = current state (no historico) | KNOWN LIMITATION — documentado |
    | A8 | file:line format parsed by Claude Code | VALIDATED — smoke test Plan 04 |

    ## Tests agregados

    | Test file | Tests | Covers |
    |-----------|-------|--------|
    | collector.responding.test.ts | 7 | D-10 setter + mergeFrom |
    | flush.responding.test.ts | 2 | D-10 INSERT shape |
    | get-display-agent-id.test.ts | 4 | D-12 fallback |
    | condense-timeline.test.ts | 7 | D-04 + D-05 |
    | load-agent-spec.test.ts | 5 | D-07 + Pitfall 3 |
    | load-session-snapshot.test.ts | 4 | D-06 no projection |
    | auditor-prompt.test.ts | 7 | D-09 + D-13 |
    | route.test.ts | 6 | D-08 + auth |

    **Total: ~42 tests nuevos, 100% verde.**

    ## Costo de tokens auditor

    [Medicion real de Plan 04 smoke test — ej. input ~8K tokens (spec + condensed + snapshot + turn metadata) + output ~2K tokens → ~$0.01-$0.03 por auditoria con Sonnet 4.6]

    ## Tips para el futuro

    1. **Quieres extender a mas bots?** Agregar el bot ID al whitelist de `loadAgentSpec`, crear el `.md` file, + 3 setRespondingAgentId calls en webhook-processor si el bot tiene branch nuevo.
    2. **Quieres agregar persistencia de auditor output?** Nueva tabla `agent_forensics_audits` + save en `onFinish` del streamText.
    3. **Quieres auto-trigger auditor?** Flip D-03 — agregar un useEffect en AuditorTab que llame runAudit() al mount. Watch out for token cost.
    4. **Pointer file:line sigue siendo texto (no clickable)** — futura feature: `vscode://file/path:line` linkification en react-markdown custom renderer.
    5. **Ajustes al whitelist** → editar `src/lib/agent-forensics/condense-timeline.ts`, agregar tests, re-deploy.

    ## Cambios a docs (Regla 4)

    - `docs/analysis/04-estado-actual-plataforma.md` — agregada seccion de forensics panel (Plan 05).
    - `.claude/rules/agent-scope.md` — NO modificado (spec de bots vive en `src/lib/agent-specs/`).
    - CLAUDE.md — NO modificado.
    ```

    **Paso 4 — Commit atomico:**
    ```bash
    git add .planning/standalone/agent-forensics-panel/LEARNINGS.md
    git commit -m "docs(agent-forensics-panel): Plan 05 Task 1 — LEARNINGS.md final (Regla 0)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-forensics-panel/LEARNINGS.md</automated>
    <automated>grep -q "Bugs encontrados" .planning/standalone/agent-forensics-panel/LEARNINGS.md</automated>
    <automated>grep -q "Patterns aprendidos" .planning/standalone/agent-forensics-panel/LEARNINGS.md</automated>
    <automated>grep -q "responding_agent_id" .planning/standalone/agent-forensics-panel/LEARNINGS.md</automated>
    <automated>grep -q "Pitfall 1" .planning/standalone/agent-forensics-panel/LEARNINGS.md</automated>
    <automated>grep -q "Tests agregados" .planning/standalone/agent-forensics-panel/LEARNINGS.md</automated>
    <automated>wc -l .planning/standalone/agent-forensics-panel/LEARNINGS.md | awk '{print $1}' | xargs test 50 -lt</automated>
  </verify>
  <acceptance_criteria>
    - `LEARNINGS.md` existe con >50 lineas.
    - Incluye secciones: Resumen ejecutivo, Bugs encontrados, Patterns aprendidos, Assumptions validadas, Tests agregados, Costo tokens, Tips futuro, Cambios a docs.
    - Referencia los 4 SUMMARYs de plans previos.
    - Documenta el bug de etiquetado (fuente de la fase) y Pitfall 1 (descubierto en Plan 01).
    - Commit local.
  </acceptance_criteria>
  <done>
    - Retrospectiva escrita. Futuros devs entienden que decisiones fueron buenas/malas.
  </done>
</task>

<task type="auto">
  <name>Task 2: Actualizar `docs/analysis/04-estado-actual-plataforma.md` + revisar `docs/architecture/` (Regla 4)</name>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (estructura actual — buscar si tiene seccion de observability / debug panel)
    - ls docs/architecture/ 2>/dev/null (listar archivos — si hay uno de observability / debug / agents, actualizarlo)
    - .planning/standalone/agent-forensics-panel/LEARNINGS.md (POST Task 1 — source de la info a portar)
    - CLAUDE.md §Regla 4 (docs siempre actualizadas — PROHIBIDO merge sin sync)
  </read_first>
  <action>
    **Paso 1 — Leer `docs/analysis/04-estado-actual-plataforma.md` y encontrar donde agregar/actualizar:**

    ```bash
    grep -n "observability\|debug panel\|debug-panel\|forensics" docs/analysis/04-estado-actual-plataforma.md
    grep -n "^## \|^### " docs/analysis/04-estado-actual-plataforma.md | head -30
    ```

    Identificar:
    - ¿Ya hay seccion de observability / debug? Actualizarla.
    - ¿No hay? Agregar una nueva como sub-seccion debajo de la de v4/v5 o "Modulos activos".

    **Paso 2 — Redactar la actualizacion:**

    Si existe seccion de observability, agregar dentro:

    ```markdown
    #### Forensics Panel (2026-04-24 — standalone `agent-forensics-panel`)

    Sobre el debug panel de produccion de agentes existente, se agrego una capa forensics para los 3 bots principales (`somnio-sales-v3`, `somnio-recompra-v1`, `godentist`):

    - **Tabs Forensics / Raw / Auditor** en cada turn del panel.
    - **Timeline condensado** (tab Forensics): filtra 18 categorias core de eventos + mechanism AI calls, oculta SQL queries. Raw completo sigue disponible 1 click away.
    - **Session snapshot:** JSON viewer del `session_state` completo (D-06 — no filtering).
    - **Auditor AI:** boton "Auditar sesion" → Claude Sonnet 4.6 via `/api/agent-forensics/audit` (streaming) → markdown con `file:line` pointers + diagnostico estructurado (Resumen / Evidencia / Discrepancias / Proximos pasos). Pegable directo a Claude Code.
    - **Spec por bot:** 3 archivos markdown en `src/lib/agent-specs/` (editables) son fuente de verdad del comportamiento esperado — el auditor los lee en runtime via `fs.readFile`.
    - **Bug resuelto:** mislabeling de `responding_agent_id` (turns de recompra aparecian como `somnio-v3`). Schema change + backfill + runtime capture en 3 branches de webhook-processor.

    **Files clave:**
    - `src/lib/observability/collector.ts` — `setRespondingAgentId` setter
    - `src/lib/agent-forensics/` — condense-timeline + load-agent-spec + load-session-snapshot + auditor-prompt
    - `src/lib/agent-specs/` — README + 3 bot specs
    - `src/app/api/agent-forensics/audit/route.ts` — streaming endpoint (claude-sonnet-4-6, super-user gated)
    - `src/app/(dashboard)/whatsapp/components/debug-panel-production/` — tabs, forensics-tab, condensed-timeline, session-snapshot, auditor-tab

    **Retrospectiva:** ver `.planning/standalone/agent-forensics-panel/LEARNINGS.md`.
    ```

    Si NO existe seccion de observability, crear una nueva con contenido similar.

    **Paso 3 — Revisar `docs/architecture/`:**

    ```bash
    ls docs/architecture/ 2>/dev/null && echo "has files" || echo "no dir"
    ```

    Si existe y tiene docs de observability / debug / agents, agregar una menciona del nuevo auditor + specs. Si no hay doc relevante, NO crear uno nuevo (no inflar docs sin necesidad).

    **Paso 4 — Verify:**
    ```bash
    grep -q "agent-forensics\|forensics panel" docs/analysis/04-estado-actual-plataforma.md
    ```

    **Paso 5 — Commit atomico:**
    ```bash
    git add docs/analysis/04-estado-actual-plataforma.md
    # si se modifico algun archivo en docs/architecture:
    # git add docs/architecture/<file>
    git commit -m "docs(agent-forensics-panel): Plan 05 Task 2 — sync estado-actual-plataforma con forensics capability (Regla 4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -q "agent-forensics\|forensics panel\|Forensics Panel" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "responding_agent_id\|somnio-recompra-v1" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - `docs/analysis/04-estado-actual-plataforma.md` menciona el nuevo forensics panel con: tabs, auditor, spec files, fix del bug de etiquetado.
    - Referencia a LEARNINGS.md incluida.
    - (Opcional) Docs en `docs/architecture/` actualizados si habia pagina relevante.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Docs sincronizados con codigo (Regla 4).
  </done>
</task>

<task type="auto">
  <name>Task 3: Gate final — full test suite + typecheck + build + push</name>
  <read_first>
    - git log origin/main..HEAD --oneline (confirmar que tenemos Task 1 + Task 2 pendientes de push)
    - CLAUDE.md §Regla 1 (push after code changes antes de pedir tests)
  </read_first>
  <action>
    **Paso 1 — Full test suite:**
    ```bash
    npm test -- --run 2>&1 | tail -20
    ```

    Debe terminar en "all passed" o equivalente. Si hay fails, deben ser preexistentes a esta fase (not related a archivos tocados). Verificar:
    ```bash
    npm test -- --run 2>&1 | grep -E "FAIL|fail" | head -20
    ```

    Si algun fail es en files de esta fase, detener y arreglar. Si todos son preexistentes, documentar en commit message.

    **Paso 2 — Typecheck full:**
    ```bash
    npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
    ```

    Debe estar limpio.

    **Paso 3 — Build exitoso (verifica Pitfall 3 en particular):**
    ```bash
    npm run build 2>&1 | tail -30
    ```

    El build DEBE incluir los .md files — esto verifica que `outputFileTracingIncludes` funciona. Si el build hace warning sobre fs.readFile, investigar.

    Si hay error de build, detener y arreglar. NO pushear con build roto.

    **Paso 4 — Commit atomico del cierre de Plan 05:**
    ```bash
    git log origin/main..HEAD --oneline
    ```

    Mostrar los 2 commits pendientes (Task 1 LEARNINGS + Task 2 docs).

    **Paso 5 — Push atomico:**
    ```bash
    git push origin main
    ```

    Vercel deploy. Esperar ~2-3 min.

    **Paso 6 — Verificar Vercel deploy Ready:**

    Vercel dashboard status = Ready. O `curl -s https://morfx.app/api/health` → 200.

    **Paso 7 — Cierre formal:**

    Crear una nota en CONTEXT.md o agregar al final de LEARNINGS.md:

    ```markdown
    ## Fase cerrada — <fecha>

    Standalone `agent-forensics-panel` shipped a prod. Todo deployed atomicamente. ~20 commits, 42 tests nuevos, 5 plans.
    ```

    Commit + push de esa nota final.
  </action>
  <verify>
    <automated>npm test -- --run 2>&1 | tail -10 | grep -qE "passed|Test Suites"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
    <automated>npm run build 2>&1 | tail -10 | grep -qE "Compiled|Ready|success"</automated>
    <automated>git log origin/main..HEAD --oneline 2>&1 | wc -l | grep -qE "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` verde (o solo fails preexistentes documentados).
    - `npx tsc --noEmit` sin errores.
    - `npm run build` completa sin errores.
    - Pitfall 3 verificado via build exitoso (outputFileTracingIncludes funciona).
    - Todos los commits de Plans 01-05 pusheados (origin/main..HEAD vacio).
    - Vercel deploy Ready.
    - Fase cerrada formalmente con nota en LEARNINGS.md.
  </acceptance_criteria>
  <done>
    - Fase `agent-forensics-panel` SHIPPED a prod, docs sincronizados, LEARNINGS documentadas, tests verdes, build limpio.
  </done>
</task>

</tasks>

<verification>
## Plan 05 — Verificacion goal-backward

**Truths observables al cierre de la fase:**

1. **LEARNINGS.md creado** en la fase standalone con secciones requeridas.
2. **docs sincronizados** — `docs/analysis/04-estado-actual-plataforma.md` menciona el forensics panel.
3. **Full suite verde** — `npm test` pasa.
4. **Typecheck limpio** — `npx tsc --noEmit` sin errores.
5. **Build exitoso** — `npm run build` completa (Pitfall 3 verificado).
6. **No hay commits pendientes** — `git log origin/main..HEAD` vacio.
7. **Vercel deploy Ready** — ultimo deploy con todos los plans integrados.
8. **Todos los artefactos de la fase existen:** migration SQL + 3 spec files + condense-timeline + load-agent-spec + load-session-snapshot + auditor-prompt + API route + 5 componentes UI nuevos + 42 tests.
</verification>

<success_criteria>
- Plan 05 cierra la fase formalmente.
- LEARNINGS.md + docs updates committed + pusheados.
- Full suite + typecheck + build todos verde.
- Vercel deploy Ready con todos los plans shipped.
- Usuario puede usar el panel en prod:
  1. Abrir `/whatsapp` + seleccionar conversation + abrir "Debug bot" + seleccionar turn.
  2. Ver 3 tabs (Forensics default).
  3. Click "Auditar sesion" en tab Auditor → recibir markdown con file:line pointers + copiar a Claude Code.
</success_criteria>

<output>
Al cerrar este plan, NO hay SUMMARY.md individual (Plan 05 mismo es el cierre de la fase — LEARNINGS.md cumple este rol). Opcionalmente agregar una linea al top del LEARNINGS.md con timestamp exacto del cierre + hash del ultimo commit pusheado.
</output>
