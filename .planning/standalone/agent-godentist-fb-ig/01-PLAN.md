---
phase: agent-godentist-fb-ig
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql
  - .planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md
autonomous: false
requirements: [GFB-01]

must_haves:
  truths:
    - "01-AUDIT.sql contiene 4 queries SELECT-only contra produccion: (Q-A) inventario completo de templates de godentist (~75 rows) — nombre, intent, visit_type, priority, content_type, first 200 chars de content, delay_s; (Q-B) verificacion conteo de conversations FB/IG en workspace target con channel populated; (Q-C) baseline pre-migration agent_templates WHERE agent_id='godentist-fb-ig' (debe ser 0 rows); (Q-D) verificacion priorities libres en routing_rules para workspace target (D-15 priority collision pre-check)"
    - "01-SNAPSHOT.md contiene los 4 outputs verbatim del Supabase SQL Editor production + decisiones Go/No-Go por query + resolucion de las 3 Open Questions Q1/Q2/Q3 de RESEARCH.md"
    - "Q1 (routing-editor consume catalogo): RESUELTA en este plan via lectura de src/app/(dashboard)/agentes/routing/editor/page.tsx — el editor usa agentRegistry.list() directo (linea 65), NO getAgentsForWorkspace; el sibling auto-aparece en el dropdown via auto-import en lineas 25-30 de page.tsx"
    - "Q2 (content_types FB/IG safe): RESUELTA via Q-A — inventario completo de godentist templates con content_type por intent. Si todos son content_type='texto' (esperado) → safe pasa. Si hay imagen con URL hardcoded WhatsApp → documentar en SNAPSHOT.md como anomalia menor no-bloqueante (D-08 dice ALL templates clonados verbatim, FB/IG soporta imagen)"
    - "Q3 (robot Railway workspace string): RESUELTA via lectura de src/lib/agents/godentist/dentos-availability.ts:50 — workspaceId hardcoded como string literal 'godentist-valoraciones' en el body POST al robot. El sibling clonando dentos-availability.ts verbatim usara la misma string — funciona out-of-the-box"
    - "Si Q-A devuelve <50 rows → BLOCKER: catalogo godentist incompleto en prod, escalar al usuario antes de Wave 1"
    - "Si Q-C devuelve >0 rows → BLOCKER: agent_id='godentist-fb-ig' ya tiene templates pre-existentes (otra ejecucion previa), DELETE antes de Wave 5 Plan 07 obligatorio"
    - "Si Q-D revela priority slot recomendado (libre, gap natural en el priority order de active rules) → documentado en SNAPSHOT.md para que usuario lo use en routing rule manual de Plan 09 post-deploy"
  artifacts:
    - path: ".planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql"
      provides: "4 queries SELECT-only de audit production: inventario templates + conversations FB/IG + baseline agent_templates + priorities libres"
      contains: "godentist"
    - path: ".planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md"
      provides: "Outputs verbatim de las 4 queries + Open Questions Q1/Q2/Q3 resueltas + Go/No-Go por query + priority slot recomendado"
      contains: "Open Questions Resolved"
  key_links:
    - from: ".planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md §Q-A inventario templates"
      to: "supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql (Wave 5 Plan 07)"
      via: "row count target — el INSERT...SELECT debe producir el mismo numero de rows que godentist (sanity check obligatorio en migration DO block)"
      pattern: "godentist_count = sibling_count"
    - from: ".planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md §Q1/Q3 resoluciones"
      to: "src/lib/agents/godentist-fb-ig/dentos-availability.ts (Wave 1 Plan 02) y src/app/(dashboard)/agentes/routing/editor/page.tsx (Wave 3 Plan 05)"
      via: "Q1 confirma que basta con import side-effect; Q3 confirma que el robot acepta el string literal 'godentist-valoraciones' sin mapping nuevo"
      pattern: "import '@/lib/agents/godentist-fb-ig'"
---

<objective>
Wave 0 — Audit production + resolver las 3 Open Questions de RESEARCH.md (Q1, Q2, Q3) ANTES de tocar codigo. Captura datos productivos para que las 8 plans subsecuentes puedan planificar con datos verificados (no asumidos).

Purpose: RESEARCH.md identifica 3 ASSUMED claims (A1, A2, A3) y 3 Open Questions resolvibles en plan-phase. Esta plan los resuelve via lectura del codigo + queries de produccion. Si CUALQUIER assumption falla → fase pausada y escalada al usuario antes de tocar codigo.

Output:
- 1 archivo SQL (`01-AUDIT.sql`) con 4 queries SELECT-only seguras (cero side-effects en prod)
- 1 archivo snapshot (`01-SNAPSHOT.md`) con outputs verbatim + resolucion explicita de Q1/Q2/Q3
- Decision agregada GO o BLOCKER

**CRITICAL — Regla 5:** Esta plan NO aplica ninguna mutacion en produccion. Solo SELECT. La migration apply ocurre en Wave 5 Plan 07.

**CRITICAL — Bloqueante:** Si Q-A retorna <50 rows o Q-C retorna >0 rows pre-cleanup → PAUSAR fase.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/DISCUSSION-LOG.md
@CLAUDE.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/01-PLAN.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md
@supabase/migrations/20260318100000_godentist_templates.sql
@src/lib/agents/godentist/dentos-availability.ts
@src/app/(dashboard)/agentes/routing/editor/page.tsx
@src/lib/agents/agent-catalog.ts

<interfaces>
<!-- Workspace target LOCKED por D-02 -->
WORKSPACE_GODENTIST_VALORACIONES = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'

<!-- Agent IDs LOCKED por D-03/D-04 -->
SOURCE_AGENT_ID = 'godentist'         // intacto, NO se modifica
TARGET_AGENT_ID = 'godentist-fb-ig'   // sibling nuevo

<!-- Robot Railway: hardcoded literal en dentos-availability.ts:50 -->
ROBOT_WORKSPACE_STRING = 'godentist-valoraciones'   // literal, NO el UUID Supabase

<!-- Source de truth pre-shipped: agent-catalog -->
ROUTING_EDITOR_DATA_SOURCE = 'agentRegistry.list()'  // src/app/(dashboard)/agentes/routing/editor/page.tsx:65
</interfaces>

<security_relevant>
**Habeas Data (Ley 1581/2011):** El audit no toca datos personales (NO consulta `contacts`, `messages.body`, etc.). Solo schema/config. Compliant.

**Workspace isolation:** Todas las queries filtran por workspace_id literal target o NULL (catalog global). Cero leakage cross-workspace.
</security_relevant>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear 01-AUDIT.sql con las 4 queries SELECT-only</name>
  <read_first>
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Open Questions (Q1/Q2/Q3) y §Verification Strategy
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-02 (workspace target) y §D-08 (catalog independiente)
    - supabase/migrations/20260318100000_godentist_templates.sql (template padre — verificar que workspace_id es NULL para catalog global)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/01-PLAN.md (patron audit + snapshot)
  </read_first>
  <action>
Crear el archivo `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql` con el contenido literal siguiente. Este archivo NO se aplica automaticamente — el usuario lo corre manual en Supabase SQL Editor production en Task 2.

```sql
-- ============================================================================
-- Audit production for agent-godentist-fb-ig (Wave 0 / Plan 01)
-- ============================================================================
-- Workspace target: GoDentist Valoraciones (f0241182-f79b-4bc6-b0ed-b5f6eb20c514)
-- Source agent_id: 'godentist' (intact, not modified)
-- Target agent_id: 'godentist-fb-ig' (new sibling)
-- Read-only. Safe to run multiple times.

-- ----------------------------------------------------------------------------
-- Query (A) — Inventario completo de templates godentist (catalog global)
-- Esperado: ~75 rows con catalog completo. Si <50 → BLOCKER (catalog incompleto).
-- Open Q2 resolution: si todos los content_type son 'texto' → FB/IG safe.
-- Si hay 'imagen' o 'video' con URL hardcoded WhatsApp-only → documentar como
-- anomalia menor (D-08 dice ALL templates clonados verbatim; FB/IG soporta media).
-- ----------------------------------------------------------------------------
SELECT
  intent,
  visit_type,
  priority,
  orden,
  content_type,
  LEFT(content, 200) AS content_preview,
  delay_s,
  workspace_id
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL  -- Catalog global solamente
ORDER BY intent, priority, orden;

-- ----------------------------------------------------------------------------
-- Query (A-summary) — Conteo agregado por content_type (Open Q2 sanity)
-- ----------------------------------------------------------------------------
SELECT
  content_type,
  COUNT(*) AS row_count
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL
GROUP BY content_type
ORDER BY row_count DESC;

-- ----------------------------------------------------------------------------
-- Query (B) — Conversations FB/IG en workspace target (Pitfall 7 sanity check)
-- Esperado: rows con channel='facebook' o 'instagram'. Si todas tienen
-- channel=NULL → fact `channel` retornara null → reglas con 'in' no matchean →
-- sibling no recibira trafico. Pre-deploy check obligatorio.
-- ----------------------------------------------------------------------------
SELECT
  channel,
  COUNT(*) AS conversation_count,
  MAX(created_at) AS last_seen
FROM conversations
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
GROUP BY channel
ORDER BY conversation_count DESC;

-- ----------------------------------------------------------------------------
-- Query (C) — Baseline agent_templates WHERE agent_id='godentist-fb-ig'
-- Esperado: 0 rows (sibling es greenfield). Si >0 → BLOCKER, limpiar antes
-- de Wave 5 Plan 07 (la migration tiene DELETE inicial idempotente, pero
-- registrar el estado pre-cleanup).
-- ----------------------------------------------------------------------------
SELECT
  id,
  intent,
  visit_type,
  orden,
  content_type,
  LEFT(content, 80) AS content_preview,
  priority,
  workspace_id
FROM agent_templates
WHERE agent_id = 'godentist-fb-ig'
ORDER BY intent, orden;

-- ----------------------------------------------------------------------------
-- Query (D) — Priorities ocupados en routing_rules para workspace target
-- (D-15 priority collision pre-check, Pitfall 4)
-- Esperado: lista de priorities activos. Identificar gap libre para que
-- usuario use en routing rule manual del Plan 09.
-- ----------------------------------------------------------------------------
SELECT
  priority,
  name,
  enabled,
  rule_type,
  conditions,
  event
FROM routing_rules
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
  AND enabled = true
ORDER BY priority;
```

Hacer commit del archivo:
```bash
git add .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql
git commit -m "docs(agent-godentist-fb-ig): add Wave 0 audit SQL — godentist templates inventory + FB/IG conversations + baseline + priorities"
```

NO push. Wave 0 queda local hasta cierre del standalone.
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql</automated>
    <automated>grep -q "f0241182-f79b-4bc6-b0ed-b5f6eb20c514" .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql</automated>
    <automated>grep -q "godentist-fb-ig" .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql</automated>
    <automated>grep -q "agent_templates" .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql</automated>
    <automated>grep -q "routing_rules" .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql</automated>
    <automated>grep -q "conversations" .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql</automated>
    <automated>grep -cE "^SELECT|^-- Query" .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql | awk '$1 >= 5 { exit 0 } { exit 1 }'</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig): add Wave 0 audit SQL"</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql` existe y contiene las 4 queries SELECT (A, B, C, D) + 1 summary auxiliar (A-summary).
    - Workspace UUID literal `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` aparece en Q-B, Q-D.
    - Agent IDs literales `'godentist'` (Q-A) y `'godentist-fb-ig'` (Q-C) aparecen en queries correctas.
    - Cada query tiene comentario explicativo + criterio Go/No-Go.
    - Commit atomico con mensaje exacto. NO push.
  </acceptance_criteria>
  <done>
    - Archivo SQL listo para que el usuario lo ejecute en Supabase SQL Editor production.
    - Commit atomico en git, NO pusheado (Wave 0 queda local hasta cierre del standalone).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint humano — Usuario corre las 4 queries en prod + Claude crea SNAPSHOT con resolucion de Q1/Q2/Q3</name>
  <read_first>
    - .planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql (creado en Task 1)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Open Questions (Q1, Q2, Q3) — leer texto completo de las 3 preguntas
    - src/app/(dashboard)/agentes/routing/editor/page.tsx (especificamente lineas 20-90 — agentRegistry.list() en linea 65)
    - src/lib/agents/godentist/dentos-availability.ts (especificamente linea 50 — workspaceId hardcoded literal)
    - src/lib/agents/agent-catalog.ts (verificar getAgentsForWorkspace regex `^(.+)-v\d+$`)
  </read_first>
  <what-built>
    Claude creo `01-AUDIT.sql` con 4 queries SELECT-only para production. Necesitamos:
    1. Que el usuario abra Supabase SQL Editor del proyecto morfx production.
    2. Pegue cada query y ejecute (puede ser todas juntas).
    3. Pegue los outputs verbatim al chat (o los suba como archivo).
    4. Claude lea los 3 archivos source-of-truth en paralelo (page.tsx + dentos-availability.ts + agent-catalog.ts) para resolver Q1/Q2/Q3 desde el codigo (NO requiere ejecucion en prod).
    5. Claude cree `01-SNAPSHOT.md` con outputs verbatim + decision Go/No-Go por query + resolucion explicita de Q1/Q2/Q3.

    **Criticidad:** Stage de migration en Wave 5 Plan 07 depende de:
    - Q-A row count (sanity check `godentist_count = sibling_count` en DO block)
    - Q-C cero rows (idempotencia clean state)
    - Q1 resolucion (decide si extender getAgentsForWorkspace en Wave 3)
    - Q3 resolucion (decide si dentos-availability.ts requiere ajuste)
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar las 4 queries en Supabase SQL Editor production:**

    1. Abrir https://supabase.com/dashboard → proyecto morfx prod → SQL Editor → New query.
    2. Copiar el contenido de `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql`.
    3. Pegar y correr todas (cada query SELECT termina con `;`).
    4. Para cada query, copiar el output completo (sin truncar para Q-A si hace falta) y pegarlo al chat.

    **Paso 2 — Decision Go/No-Go por query:**

    | Query | Go (avanzar a Wave 1) | No-Go (PAUSAR + escalar) |
    |-------|------------------------|---------------------------|
    | (A) Templates godentist | ≥50 rows con catalog completo | <50 rows (catalog incompleto en prod) |
    | (A-summary) content_type | mayoria 'texto'; image/video con URLs Meta-compatible | image/video con URL WhatsApp-only hardcoded → documentar anomalia |
    | (B) Conversations FB/IG | rows con channel='facebook' o 'instagram' | todas con channel=NULL → fact channel siempre retorna null → escalar |
    | (C) agent_templates baseline | 0 rows | >0 rows → DELETE manual antes de Plan 07 |
    | (D) Priorities | lista con gap libre identificable | sin gap → usuario debera reordenar |

    **Paso 3 — Claude lee codigo para resolver Q1/Q2/Q3 en paralelo:**

    Q1 — `src/app/(dashboard)/agentes/routing/editor/page.tsx` lineas 20-90:
    - Si linea 65 = `const agents = agentRegistry.list().map(...)` → **Q1 RESUELTA: editor usa agentRegistry directo, NO getAgentsForWorkspace; sibling auto-aparece via `import '@/lib/agents/godentist-fb-ig'` en lineas 25-30**.
    - Si linea ~65 usa `getAgentsForWorkspace(...)` → Q1 INVALIDADA: Wave 3 Plan 05 debe extender el helper. Ajustar el plan.

    Q2 — output Q-A-summary:
    - Si todos `content_type='texto'` → **Q2 RESUELTA: safe**.
    - Si hay `'imagen'`/`'video'` con URL hardcoded → revisar URL: si dominio Meta-compatible (facebook.com, instagram.com, supabase storage publico) → **Q2 RESUELTA: safe** (Meta soporta imagen/video en FB/IG). Si dominio WhatsApp-only → documentar anomalia menor (D-08 dice ALL templates clonados verbatim; el sibling enviara el URL — Meta lo aceptara o no segun caso, fallback graceful).

    Q3 — `src/lib/agents/godentist/dentos-availability.ts` linea 50:
    - Si `workspaceId: 'godentist-valoraciones'` (string literal hardcoded) → **Q3 RESUELTA: el sibling clonando el archivo verbatim usa la misma string; ambos agentes apuntan al mismo robot. Funciona out-of-the-box**.
    - Si `workspaceId: <expresion dinamica>` → Q3 INVALIDADA: extender mapping. Documentar el cambio requerido.

    **Paso 4 — Claude crea `01-SNAPSHOT.md` con el siguiente template:**

    ```markdown
    # Snapshot Audit Production — agent-godentist-fb-ig

    **Fecha captura:** <YYYY-MM-DD HH:MM America/Bogota>
    **Workspace target:** GoDentist Valoraciones (f0241182-f79b-4bc6-b0ed-b5f6eb20c514)
    **Source:** outputs verbatim de las 4 queries en `01-AUDIT.sql` + lectura del codigo para Q1/Q2/Q3.
    **Proposito:** desbloquear Wave 1 con datos productivos verificados (no asumidos).

    ## Query (A) — Inventario templates godentist

    **Total rows:** <N>
    **Decision:** [ ] GO (≥50 rows) / [ ] NO-GO (<50 — escalar)

    Sample of rows (top 20):

    | intent | visit_type | priority | orden | content_type | content_preview | delay_s |
    |--------|-----------|----------|-------|--------------|-----------------|---------|
    | <pegar output verbatim — primeras 20 rows> |

    **Target row count para sanity check del migration DO block (Wave 5 Plan 07):** <N>

    ## Query (A-summary) — content_type breakdown (Q2 resolution)

    | content_type | row_count |
    |--------------|-----------|
    | <pegar output verbatim> |

    **Q2 RESOLUTION:** [ ] SAFE (mayoria texto, sin URLs WhatsApp-only) / [ ] ANOMALIA documentada: <descripcion>

    ## Query (B) — Conversations FB/IG en workspace target

    | channel | conversation_count | last_seen |
    |---------|--------------------|-----------|
    | <pegar output verbatim> |

    **Decision:** [ ] GO (rows con facebook|instagram) / [ ] NO-GO (todas NULL — escalar)

    ## Query (C) — Baseline agent_templates godentist-fb-ig

    | <esperado: vacio> |

    **Decision:** [ ] GO (0 rows — greenfield) / [ ] NO-GO (>0 — DELETE manual antes de Plan 07)

    ## Query (D) — Priorities ocupados en routing_rules workspace target

    | priority | name | rule_type |
    |----------|------|-----------|
    | <pegar output verbatim> |

    **Priority slot recomendado para routing rule manual del Plan 09:** <numero gap>
    Razon: <gap natural entre N y N+gap, sin colision con UNIQUE INDEX uq_routing_rules_priority>

    ## Open Questions Resolved

    ### Q1: routing-editor consume agent catalog filtrado o directo?

    **Hallazgo:** `src/app/(dashboard)/agentes/routing/editor/page.tsx:65` invoca `agentRegistry.list().map(...)` directo. NO usa `getAgentsForWorkspace`.

    **Implicacion:** El sibling auto-aparece en el dropdown del routing-editor cuando agreguemos `import '@/lib/agents/godentist-fb-ig'` en lineas 25-30 de page.tsx (registrar side-effect). NO requiere extender `getAgentsForWorkspace`.

    **Plan 05 Wave 3:** agregar 1 linea de import en page.tsx (lista de Wave 3 task 1).

    **Q1 Status:** [x] RESUELTA — sin trabajo adicional.

    ### Q2: content_types FB/IG safe para clonado verbatim?

    **Hallazgo:** Q-A-summary muestra: <pegar breakdown>.
    
    **Implicacion:** <SAFE/ANOMALIA>. La migracion `INSERT...SELECT` con CASE WHEN intent='saludo' ELSE content END clonara verbatim. <Si anomalia: documentar templates afectados; D-08 dice ALL clonados, el sibling enviara las URLs — Meta acepta imagen/video en FB/IG generalmente; degradacion graceful si una URL falla>.

    **Q2 Status:** [x] RESUELTA — <safe / con anomalia documentada>.

    ### Q3: robot Railway acepta string 'godentist-valoraciones' para sibling?

    **Hallazgo:** `src/lib/agents/godentist/dentos-availability.ts:50` hardcodea `workspaceId: 'godentist-valoraciones'` como string literal en el body POST. El sibling clonara el archivo verbatim (Wave 1 Plan 02 listing) → usa la misma string → ambos agentes hablan al mismo robot Railway con misma credencial JROMERO/123456.

    **Implicacion:** Funciona out-of-the-box. El robot NO discrimina por agent_id (es solo workspace + sucursal). NO requiere ajustar dentos-availability.ts del sibling.

    **Q3 Status:** [x] RESUELTA — clone verbatim sin ajustes.

    ## Decision agregada

    - [ ] **Wave 0 PASA — desbloquear Wave 1.** Todas las decisions GO + las 3 Qs RESUELTAS.
    - [ ] **Wave 0 BLOCKER — pausar fase.** Razon: ___

    ## Datos locked para Waves 1-7

    - **Q-A row count:** <N> (target del sanity check en Plan 07 DO block)
    - **Priority slot recomendado para Plan 09:** <numero>
    - **Q1 plan adjustment:** ninguno — page.tsx solo necesita 1 import line
    - **Q3 plan adjustment:** ninguno — dentos-availability.ts clonado verbatim
    ```

    **Paso 5 — Claude commit:**

    ```bash
    git add .planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md
    git commit -m "docs(agent-godentist-fb-ig): add Wave 0 production snapshot — templates inventory + Q1/Q2/Q3 resolved"
    ```
  </how-to-verify>
  <acceptance_criteria>
    - Usuario corrio las 4 queries en Supabase SQL Editor production y pego outputs al chat.
    - Claude leyo los 3 archivos source-of-truth (page.tsx + dentos-availability.ts + agent-catalog.ts).
    - `.planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md` existe con: outputs verbatim de las 4 queries + resolucion explicita de Q1/Q2/Q3 (cada una marcada [x] RESUELTA con hallazgo + implicacion + plan adjustment).
    - Q-A row count documentado (target sanity check Plan 07).
    - Q-C row count = 0 confirmado o cleanup documentado.
    - Priority slot recomendado para Plan 09 routing rule documentado.
    - Decision agregada marcada como GO. Si BLOCKER → escalar al usuario, NO avanzar.
    - Commit atomico con mensaje exacto. NO push.
  </acceptance_criteria>
  <resume-signal>
    Escribe "audit aprobado" (4/4 queries OK + Q1/Q2/Q3 resueltas + decisions GO) para desbloquear Wave 1 (Plans 02 + 03 paralelizables).

    Si Q-A devuelve <50 rows o Q-B muestra todas conversations con channel=NULL:
    - Pega el output al chat.
    - Discutamos accion correctiva (re-aplicar migration godentist? backfill conversations.channel?) ANTES de proceder.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Supabase SQL Editor → production DB | Solo SELECT queries, cero side-effects. Habeas Data NO compromised (no acceso a contacts/messages.body). |
| Plan files (markdown) → developer | Snapshot incluye row counts + content_preview (200 chars) — sin PII. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-01-01 | Information Disclosure | Q-A content_preview LEFT(content, 200) | accept | Templates son catalog publico (no PII); 200 chars suficientes para verificar contenido sin filtrar URLs sensibles |
| T-gfb-01-02 | Tampering | SQL audit aplicado por usuario manualmente | accept | Solo SELECT — sin riesgo. Usuario tiene acceso productivo legitimo. |
| T-gfb-01-03 | Spoofing | snapshot.md datos pegados verbatim | mitigate | Usuario pega outputs literales del SQL Editor; Claude no inventa rows. Verificable via re-run de queries. |
</threat_model>

<verification>
- `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql` existe con 4 queries SELECT-only (A, A-summary, B, C, D).
- `.planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md` existe con outputs verbatim del usuario + resolucion Q1/Q2/Q3.
- Q1 [x] RESUELTA — page.tsx usa agentRegistry.list() directo.
- Q2 [x] RESUELTA — content_type breakdown documentado, decision SAFE/ANOMALIA.
- Q3 [x] RESUELTA — dentos-availability.ts clone verbatim sin ajustes.
- Decision agregada GO (todas las queries Go + las 3 Qs resueltas).
- 2 commits atomicos en git, NO pusheados (Wave 0 queda local hasta cierre).
</verification>

<success_criteria>
- Plan 07 (migration SQL) puede usar el target row count de Q-A para el sanity check del DO block (`godentist_count = sibling_count`).
- Plan 09 (routing rule guidance) puede sugerir un priority slot libre concreto al usuario.
- Plans 02-08 pueden asumir Q1/Q2/Q3 resueltas (sin re-investigar).
- Si la audit revela un blocker, la fase se pausa SIN tocar codigo (cero side-effects).
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md` documenting:
- Commit hash de Task 1 (audit SQL file)
- Commit hash de Task 2 (snapshot file)
- Resultado agregado: GO con razon.
- Q-A row count (target del sanity check Plan 07).
- Q-C row count (esperado 0 — confirma greenfield).
- Q1/Q2/Q3 status [x] RESUELTAS con 1-linea de hallazgo cada una.
- Priority slot recomendado para Plan 09.
- Confirmacion: ningun ajuste a Wave 3 (page.tsx solo agrega import line) ni a Wave 1 (dentos-availability.ts clonado verbatim).
</output>
