---
phase: agent-godentist-fb-ig
plan: 08
type: execute
wave: 6
depends_on: [07]
files_modified:
  - src/lib/agent-specs/godentist-fb-ig.md
  - .claude/rules/agent-scope.md
  - docs/architecture/06-agent-lifecycle-router.md
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false
requirements: [GFB-06]

must_haves:
  truths:
    - "Existe `src/lib/agent-specs/godentist-fb-ig.md` con scope completo del sibling siguiendo patron de `src/lib/agent-specs/godentist.md` y `somnio-sales-v3.md` (PUEDE / NO PUEDE / Validacion / Consumidores / Integraciones)"
    - "`.claude/rules/agent-scope.md` tiene seccion nueva `### Godentist FB/IG Sibling Agent (godentist-fb-ig — webhook FB/IG inbound)` con scope explicito + workspace_id literal `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` + SQL pre-formado de routing rule (D-15 manual + Pitfall 3 mitigation)"
    - "`docs/architecture/06-agent-lifecycle-router.md` actualizado mencionando el sibling como primer caso de uso real del fact `channel` (D-20 reusable pattern)"
    - "`docs/analysis/04-estado-actual-plataforma.md` actualizado con seccion del sibling (estado: shipped, sin trafico hasta usuario active routing rule)"
    - "Push a Vercel ejecutado: `git push origin main` exitoso (Regla 1)"
    - "Vercel deploy auto-triggered (verificable post-push en Vercel dashboard)"
  artifacts:
    - path: "src/lib/agent-specs/godentist-fb-ig.md"
      provides: "Spec completo del sibling agent — onboarding doc para futuros mantenedores"
      contains: "godentist-fb-ig"
      min_lines: 100
    - path: ".claude/rules/agent-scope.md"
      provides: "Scope del sibling con SQL routing rule pre-formado para usuario"
      contains: "Godentist FB/IG Sibling Agent"
    - path: "docs/architecture/06-agent-lifecycle-router.md"
      provides: "Mencion del sibling como primer uso real del fact channel"
      contains: "godentist-fb-ig"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Status del sibling en plataforma overview"
      contains: "godentist-fb-ig"
  key_links:
    - from: ".claude/rules/agent-scope.md (SQL pre-formado)"
      to: "operador en /agentes/routing/editor (Plan 09 manual activation)"
      via: "Documentacion explicita workspace_id literal + condition channel in [facebook, instagram] + event params agent_id godentist-fb-ig"
      pattern: "f0241182-f79b-4bc6-b0ed-b5f6eb20c514"
    - from: "src/lib/agent-specs/godentist-fb-ig.md"
      to: "future siblings using channel fact (e.g., somnio-fb-ig)"
      via: "Pattern reusable documentado — D-20"
      pattern: "channel fact"
---

<objective>
Wave 6 — Documentation update + push del codigo a Vercel (Regla 1). Despues del SQL apply en produccion (Plan 07), pushear todo el codigo del sibling para que Vercel deploye y el dropdown del routing-editor muestre la opcion "GoDentist Valoraciones — FB/IG".

Purpose: Sin push, todos los commits quedan locales y Vercel no deploya. Sin documentacion, futuros mantenedores no entienden el patron del sibling. Este plan ejecuta:
1. Crear `src/lib/agent-specs/godentist-fb-ig.md` (spec completo siguiendo patron godentist.md + somnio-sales-v3.md)
2. Actualizar `.claude/rules/agent-scope.md` con seccion nueva + SQL pre-formado para routing rule
3. Actualizar 2 docs de arquitectura: `06-agent-lifecycle-router.md` (primer uso real del fact channel) + `04-estado-actual-plataforma.md` (status overview)
4. Push collective de TODOS los commits acumulados desde Plan 02 (8 commits aproximadamente)

**Regla 1 obligatoria del proyecto (CLAUDE.md):**
> SIEMPRE pushear a Vercel despues de cambios de codigo antes de pedir pruebas al usuario:
> git add <archivos> && git commit && git push origin main

**Regla 4 obligatoria del proyecto (CLAUDE.md):**
> Cada vez que hagas un cambio de codigo, DEBES actualizar la documentacion relevante.

**Patron validado en somnio-sales-v3-pw-confirmation 13-DEPLOY-NOTES.md:** Push collective post-apply trigger Vercel auto-deploy + Inngest function auto-sync.

Output:
- 4 archivos nuevos/modificados (spec + agent-scope + 2 docs arch)
- 1 push exitoso a `origin main` con todos los commits del standalone (Plans 02-08)
- Vercel deploy auto-triggered
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/07-SUMMARY.md
@CLAUDE.md
@src/lib/agent-specs/godentist.md
@src/lib/agent-specs/somnio-sales-v3.md
@.claude/rules/agent-scope.md
@docs/architecture/06-agent-lifecycle-router.md
@docs/analysis/04-estado-actual-plataforma.md

<interfaces>
<!-- Spec template a clonar -->
SPEC_TEMPLATE = 'src/lib/agent-specs/godentist.md'
SPEC_REFERENCE = 'src/lib/agent-specs/somnio-sales-v3.md'  // estructura PUEDE/NO PUEDE/etc

<!-- Workspace literal para routing rule SQL pre-formado -->
WORKSPACE_GODENTIST_VALORACIONES = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'

<!-- Priority slot — viene de 01-SUMMARY.md §Priority slot recomendado -->
RECOMMENDED_PRIORITY = 'see 01-SUMMARY.md (gap libre identificado en Q-D audit)'

<!-- Push command (Regla 1) -->
PUSH_CMD = 'git push origin main'
</interfaces>

<security_relevant>
**Workspace isolation en docs:** El SQL pre-formado para routing rule incluye workspace_id LITERAL `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`. Pitfall 3 (workspace mismatch) mitigada via documentacion explicita.

**Habeas Data:** Spec menciona disclaimer Habeas Data inline en saludo D-05 + razon legal (Ley 1581/2011). Compliant.

**Push security:** Push a `origin main` (Regla 1). NO usar `--force` ni `--no-verify`. Vercel build pipeline corre tests antes de deploy (proteccion adicional).
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear src/lib/agent-specs/godentist-fb-ig.md (spec completo del sibling)</name>
  <read_first>
    - src/lib/agent-specs/godentist.md (file completo, ~252 LOC — patron base para clonar)
    - src/lib/agent-specs/somnio-sales-v3.md (file completo — patron PUEDE/NO PUEDE detallado)
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md (D-01..D-20 todas)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Architectural Responsibility Map
  </read_first>
  <action>
**Paso 1 — Crear `src/lib/agent-specs/godentist-fb-ig.md`** clonando la estructura de `godentist.md` con cambios:

```markdown
# Agent Spec: GoDentist FB/IG Sibling (godentist-fb-ig)

**Status:** Shipped 2026-XX-XX (ajustar fecha real)
**Standalone:** `.planning/standalone/agent-godentist-fb-ig/`
**Workspace target:** GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)
**Channel:** Facebook Messenger + Instagram Direct (D-01)
**Habilitado por:** standalone `routing-channel-fact` (shipped 2026-05-04, commit `c410085`)

---

## Quick reference

| Atributo | Valor |
|----------|-------|
| Agent ID | `godentist-fb-ig` |
| Source dir | `src/lib/agents/godentist-fb-ig/` |
| Webhook entry | `webhook-processor.ts:765-790` (branch `agentId === 'godentist-fb-ig'`) |
| Engine runner | `V3ProductionRunner` con `agentModule: 'godentist-fb-ig'` |
| Comprehension model | Anthropic Haiku (D-12 — igual que godentist) |
| State machine | Idem godentist (D-13) |
| Catalog | `agent_id='godentist-fb-ig'`, ~75 templates clonados con saludo D-05 distinto |

---

## PUEDE

- Atender mensajes inbound de FB Messenger (`channel='facebook'`) e Instagram Direct (`channel='instagram'`) en el workspace target.
- Emitir templates del catalogo propio bajo `agent_id='godentist-fb-ig'`:
  - **Saludo D-05 (lead-capture):** pide nombre+celular upfront + Habeas Data inline (UNICO cambio vs godentist).
  - **Resto:** ~74 templates clonados verbatim del godentist (precios, ubicaciones, horarios por sede, escape, follow-ups, english_response, etc.).
- Procesar el primer mensaje del cliente con LEAD CAPTURE (D-09):
  - Si turn 1 + intent='datos' + datos parciales -> `pedir_datos_parcial` con `{{campos_faltantes}}` (helper puro `lead-capture.ts`).
  - Si turn 1 + intent informational -> sales-track normal (D-07 reusa lógica retoma_*).
- Consultar disponibilidad real en Dentos via robot Railway compartido (mismo robot que godentist, mismas credenciales JROMERO/123456).
- Recibir tag VAL automaticamente cuando completa datos criticos (Pitfall 6 mitigated en runner:597).
- Coexistir con el agente `godentist` original sin afectarlo (D-04: agente original intact, default).

## NO PUEDE

- Atender otros canales fuera de FB/IG (web chat, otros) — D-01.
- Operar en workspace distinto al target — D-02; el routing rule lo acota.
- Compartir catalog con godentist — D-08; tiene `TEMPLATE_LOOKUP_AGENT_ID = 'godentist-fb-ig'` literal en `response-track.ts` (Pitfall 1 prevention).
- Detectar `consentimiento_habeas` como intent — D-10; el consentimiento es implícito (D-06).
- Cambiar el modelo de comprehension — D-12; siempre Haiku.
- Modificar el state machine de godentist — D-13.
- Activarse automaticamente — D-14; sin feature flag, requiere routing rule manual del usuario.
- Auto-crear su routing rule — D-15; el operador la crea via `/agentes/routing/editor`.
- Acceder a otros workspaces — `ctx.workspaceId` viene del execution context, NUNCA del input.
- Importar `createAdminClient` o `@supabase/supabase-js` directamente — Regla 3; toda mutacion via `@/lib/domain/*`.

## Validacion (gates verificables)

- `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` retorna 0 matches no-comentario.
- `grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` retorna 0 matches (anti-regression D-08, Pitfall 1).
- `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna >=2 (pre-warm + dispatch — anti-Pitfall 2).
- `grep -E "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts` retorna match (anti-Pitfall 6 — VAL tag side-effect).
- Suite tests: `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` retorna 6 suites con minimo 50 tests passed.
- DB sanity: `SELECT COUNT(*) FROM agent_templates WHERE agent_id='godentist-fb-ig'` matches `SELECT COUNT(*) FROM agent_templates WHERE agent_id='godentist' AND workspace_id IS NULL`.
- DB sanity: `SELECT content FROM agent_templates WHERE agent_id='godentist-fb-ig' AND intent='saludo' AND priority='CORE'` contiene "goBot" + "Habeas Data" + "Ley 1581".

## Consumidores

- **Webhook FB/IG inbound** — flujo unico: webhook -> routeAgent -> sibling cuando routing rule del usuario emite `agent_id='godentist-fb-ig'` para conversaciones con `channel in ['facebook', 'instagram']`.
- **Sandbox QA** (opcional) — el sandbox del workspace target podria invocar al sibling si el operador lo escoge en el dropdown del sandbox-header. NO bloqueante para producción.

## Integraciones

- **Routing engine** — fact `channel` (shipped 2026-05-04, standalone `routing-channel-fact`); el sibling es el primer caso de uso real del fact (D-20 reusable pattern).
- **TemplateManager** — cache 5min por (agent_id, workspace_id); el sibling tiene su propio bucket separado del godentist.
- **Anthropic Haiku** — comprehension via `runWithPurpose('godentist_fb_ig_comprehension', ...)`; eventos observability con `agent: 'godentist-fb-ig'`.
- **Robot Railway Dentos** — `dentos-availability.ts` clonado verbatim; el robot acepta `workspaceId: 'godentist-valoraciones'` literal (Q3 RESUELTA en Wave 0).
- **VAL tag side-effect** — `applyGodentistValTagIfNeeded` (v3-production-runner.ts:597) ahora cubre ambos agentes; los leads FB/IG cuentan en metricas igual que los WhatsApp.

## Activacion (D-15 manual)

Post-deploy, el operador va a `/agentes/routing/editor` y crea la regla. SQL pre-formado para evitar Pitfall 3 + Pitfall 4 (workspace mismatch + priority collision):

```sql
-- (Plan 09 incluye este SQL pre-formado para que el operador pegue en /routing/editor)
INSERT INTO routing_rules (workspace_id, name, priority, conditions, event, enabled)
VALUES (
  'f0241182-f79b-4bc6-b0ed-b5f6eb20c514',
  'GoDentist FB/IG sibling routing',
  <PRIORITY_SLOT>,  -- ver 01-SUMMARY.md §Priority slot recomendado
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('fact', 'channel', 'operator', 'in', 'value', ARRAY['facebook', 'instagram'])
    )
  ),
  jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'godentist-fb-ig')),
  true
);
```

Para desactivar (rollback rapido):

```sql
UPDATE routing_rules SET enabled=false WHERE name='GoDentist FB/IG sibling routing';
```

---

## Anti-patterns documentados

- **NO modificar src/lib/agents/godentist/** — D-04; el sibling es ADITIVO.
- **NO compartir TEMPLATE_LOOKUP_AGENT_ID** con godentist — Pitfall 1 (regresion cdc06d9).
- **NO crear feature flag** — D-14; activacion via routing rule.
- **NO insertar la routing rule en migration** — D-15; el operador la crea manualmente.
- **NO cambiar modelo Haiku** — D-12; variable confusa para debug.
- **NO olvidar pre-warm import en webhook-processor** — Pitfall 2 (B-001 cold-lambda race).
- **NO olvidar extender VAL tag check** — Pitfall 6 (metricas FB/IG=0 falsamente).
```

**Paso 2 — Validar TypeScript no afectado (es solo markdown):**

```bash
test -f src/lib/agent-specs/godentist-fb-ig.md
```

**Paso 3 — Commit:**

```bash
git add src/lib/agent-specs/godentist-fb-ig.md
git commit -m "docs(agent-godentist-fb-ig): add agent spec (D-19)"
```

NO push (Plan 08 Task 4 es el push collective).
  </action>
  <verify>
    <automated>test -f src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "Agent Spec: GoDentist FB/IG Sibling" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "f0241182-f79b-4bc6-b0ed-b5f6eb20c514" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "lead-capture" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "Habeas Data" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "PUEDE" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "NO PUEDE" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "Validacion" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>grep -q "channel in" src/lib/agent-specs/godentist-fb-ig.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig): add agent spec"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agent-specs/godentist-fb-ig.md` existe con minimo 100 LOC.
    - Secciones obligatorias: Quick reference, PUEDE, NO PUEDE, Validacion, Consumidores, Integraciones, Activacion (D-15), Anti-patterns.
    - Menciona workspace_id literal `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`.
    - Documenta SQL pre-formado de routing rule para el operador.
    - Commit atomico exacto. NO push todavia.
  </acceptance_criteria>
  <done>
    - Spec del sibling listo. Onboarding doc para futuros mantenedores.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Actualizar .claude/rules/agent-scope.md con seccion del sibling</name>
  <read_first>
    - .claude/rules/agent-scope.md (file completo — focus en estructura de las secciones existentes como "Somnio Sales v3 PW-Confirmation Agent")
    - src/lib/agent-specs/godentist-fb-ig.md (creado en Task 1)
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-19
  </read_first>
  <action>
**Paso 1 — Editar `.claude/rules/agent-scope.md`:**

Agregar la siguiente seccion al final del archivo (despues de "Somnio Sales v3 PW-Confirmation Agent" o donde corresponda topologicamente):

```markdown
### Godentist FB/IG Sibling Agent (`godentist-fb-ig` — webhook FB/IG inbound)

- **PUEDE:**
  - Atender mensajes inbound de Facebook Messenger (`channel='facebook'`) e Instagram Direct (`channel='instagram'`) en el workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` ("GoDentist Valoraciones").
  - Emitir templates del catalogo propio bajo `agent_id='godentist-fb-ig'`:
    - Saludo D-05 lead-capture (pide nombre+celular upfront + disclaimer Habeas Data inline) — UNICO cambio vs godentist.
    - ~74 templates clonados verbatim del godentist (precios, sedes, escape, follow-ups, english_response, etc.).
  - Procesar primer mensaje del cliente (turn 1) con LEAD CAPTURE (D-09):
    - Si Haiku clasifica `intent='datos'` + datos parciales → directo a `pedir_datos_parcial` con `{{campos_faltantes}}` (via helper puro `lead-capture.ts`).
    - Si datos criticos completos → sales-track normal (passthrough a `pedir_fecha`/`mostrar_disponibilidad`).
  - Consultar disponibilidad real en Dentos via robot Railway compartido (mismo robot que godentist).
  - Recibir tag `VAL` automaticamente al completar datos criticos (Pitfall 6 mitigated en `v3-production-runner.ts:597` — extension del check `agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'`).
- **NO PUEDE:**
  - Atender otros canales (web chat, etc) — D-01; si surgen requieren standalone separado.
  - Operar fuera del workspace target `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` — D-02; routing rule del usuario lo acota.
  - Compartir catalog con godentist — D-08; tiene su propio `TEMPLATE_LOOKUP_AGENT_ID` constant. Anti-regresion `cdc06d9` (Pitfall 1).
  - Detectar nuevo intent `consentimiento_habeas` — D-10; el consentimiento es implicito al enviar datos (D-06).
  - Cambiar modelo de comprehension — D-12; siempre Haiku.
  - Modificar el state machine de godentist — D-13.
  - Activarse automaticamente — D-14; sin feature flag, requiere routing rule manual del usuario en `/agentes/routing/editor` (D-15).
  - Auto-crear su routing rule — D-15; el operador la crea con priority slot libre (Pitfall 4).
  - Acceder a templates de otros agentes — D-08.
  - Modificar agent godentist original — D-04; el sibling es ADITIVO.
  - Importar `createAdminClient` o `@supabase/supabase-js` directamente — Regla 3.
- **Validacion (gates verificables):**
  - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` retorna 0 matches no-comentario.
  - `grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` retorna 0 matches (anti-regresion D-08).
  - `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna >=2 (pre-warm + dispatch — anti-Pitfall 2 / B-001).
  - Suite tests: `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` 6 suites + minimo 50 tests passed.
  - Project skill descubrible: `src/lib/agent-specs/godentist-fb-ig.md`.
  - Standalone: `.planning/standalone/agent-godentist-fb-ig/` (shipped 2026-XX-XX).
- **Coexistencia con godentist original (D-04):** El agente `godentist` queda intacto y funcionando como default para WhatsApp. El sibling es ADITIVO. Patron identico a `somnio-sales-v3-pw-confirmation` vs `somnio-sales-v3` (shipped 2026-04-28). Cuando usar cada uno:
  - **godentist:** WhatsApp inbound al workspace original. Saludo conversacional clasico.
  - **godentist-fb-ig:** FB Messenger / Instagram Direct inbound al workspace `f0241182-...`. Saludo lead-capture (asegura contacto WhatsApp post-FB/IG donde el cliente puede perderse).
- **Activacion (D-15 manual) — SQL pre-formado:**

  El operador va a `/agentes/routing/editor` y crea la regla. SQL pre-formado para evitar Pitfall 3 (workspace mismatch) + Pitfall 4 (priority collision):

  ```sql
  -- Elegir priority libre via SELECT prep:
  -- SELECT priority FROM routing_rules WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514' AND enabled=true ORDER BY priority;

  INSERT INTO routing_rules (workspace_id, name, priority, conditions, event, enabled)
  VALUES (
    'f0241182-f79b-4bc6-b0ed-b5f6eb20c514',
    'GoDentist FB/IG sibling routing',
    <PRIORITY_GAP>,  -- ver 01-SUMMARY.md §Priority slot recomendado
    jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object('fact', 'channel', 'operator', 'in', 'value', ARRAY['facebook', 'instagram'])
      )
    ),
    jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'godentist-fb-ig')),
    true
  );

  -- Para desactivar (rollback rapido):
  -- UPDATE routing_rules SET enabled=false WHERE name='GoDentist FB/IG sibling routing';
  ```
- **Consumidores upstream:** webhook FB/IG inbound (`webhook-processor.ts:765-790` branch).
- **Consumidores downstream:** TemplateManager + Anthropic Haiku + robot Railway Dentos + VAL tag side-effect runner.
```

**Paso 2 — Commit:**

```bash
git add .claude/rules/agent-scope.md
git commit -m "docs(agent-godentist-fb-ig): add agent-scope rules section + SQL pre-formado para routing rule manual (D-19)"
```

NO push.
  </action>
  <verify>
    <automated>grep -q "Godentist FB/IG Sibling Agent" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "f0241182-f79b-4bc6-b0ed-b5f6eb20c514" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "lead-capture" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "godentist-fb-ig" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "INSERT INTO routing_rules" .claude/rules/agent-scope.md</automated>
    <automated>grep -q "channel.*facebook.*instagram" .claude/rules/agent-scope.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig): add agent-scope rules section"</automated>
  </verify>
  <acceptance_criteria>
    - `.claude/rules/agent-scope.md` contiene seccion `### Godentist FB/IG Sibling Agent`.
    - Workspace UUID literal `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` aparece en la seccion.
    - SQL pre-formado de routing rule incluido (con channel in [facebook, instagram] + agent_id godentist-fb-ig).
    - Validacion gates listed (grep checks anti-Pitfall 1, 2, 6).
    - Commit atomico exacto. NO push todavia.
  </acceptance_criteria>
  <done>
    - agent-scope.md actualizado con scope del sibling + SQL pre-formado.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Actualizar 2 docs de arquitectura (06-agent-lifecycle-router.md + 04-estado-actual-plataforma.md)</name>
  <read_first>
    - docs/architecture/06-agent-lifecycle-router.md (file completo — buscar mencion del fact `channel`)
    - docs/analysis/04-estado-actual-plataforma.md (file completo — buscar seccion de agentes)
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-20 (D-20 reusable pattern documentation)
  </read_first>
  <action>
**Paso 1 — Editar `docs/architecture/06-agent-lifecycle-router.md`:**

Localizar la seccion donde se menciona el fact `channel` (deberia estar referenciado en el contexto del standalone `routing-channel-fact` shipped 2026-05-04). Si no existe seccion explicita, agregar al final del documento o en la seccion "Casos de uso" un bloque:

```markdown
### Caso de uso: agente sibling por canal alterno

**Primer caso real del fact `channel`** (shipped 2026-05-04 standalone `routing-channel-fact`).

El agente `godentist-fb-ig` (standalone shipped 2026-XX-XX) es el primer ejemplo en el codebase de un agente sibling activado 100% via routing rule con condicion `channel in ['facebook', 'instagram']`. Este patron es reusable para futuros siblings por canal:

- **godentist** atiende WhatsApp del workspace GoDentist original (saludo conversacional clasico).
- **godentist-fb-ig** atiende FB Messenger + Instagram Direct del workspace `GoDentist Valoraciones` (saludo lead-capture pidiendo nombre+celular upfront).
- **somnio-fb-ig** (futuro) podria atender FB/IG de Somnio si el patron prueba ser efectivo (D-20 deferred).

**Activacion** del sibling es 100% manual del operador en `/agentes/routing/editor` (D-15). Sin regla = sin trafico = aislamiento Regla 6 sin necesidad de feature flag (D-14). Mismo patron que `somnio-sales-v3-pw-confirmation` (shipped 2026-04-28).

**Documentacion del sibling:** `src/lib/agent-specs/godentist-fb-ig.md` + seccion en `.claude/rules/agent-scope.md`.
```

**Paso 2 — Editar `docs/analysis/04-estado-actual-plataforma.md`:**

Buscar la seccion donde se documenta el estado de los agentes GoDentist. Agregar mencion del sibling:

```markdown
- **godentist-fb-ig** (sibling shipped 2026-XX-XX, sin trafico hasta routing rule manual):
  - Workspace target: GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`).
  - Canal: Facebook Messenger + Instagram Direct.
  - Saludo: lead-capture (pide nombre+celular upfront + disclaimer Habeas Data inline).
  - Pipeline: idem godentist (Haiku comprehension + state machine determinista + 4 sedes Dentos).
  - Activacion: requiere routing rule manual del usuario en `/agentes/routing/editor`. Sin regla = sin trafico = aislamiento.
  - Standalone: `.planning/standalone/agent-godentist-fb-ig/`.
  - Spec: `src/lib/agent-specs/godentist-fb-ig.md`.
```

NOTA: Si el archivo `04-estado-actual-plataforma.md` no existe o tiene estructura distinta, ajustar la insercion al patron real del archivo (priorizar coherencia con el resto).

**Paso 3 — Commit:**

```bash
git add docs/architecture/06-agent-lifecycle-router.md docs/analysis/04-estado-actual-plataforma.md
git commit -m "docs(agent-godentist-fb-ig): document first real use case of channel fact + plataforma overview update (D-20, Regla 4)"
```

NO push.
  </action>
  <verify>
    <automated>grep -q "godentist-fb-ig" docs/architecture/06-agent-lifecycle-router.md</automated>
    <automated>grep -q "godentist-fb-ig" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "channel" docs/architecture/06-agent-lifecycle-router.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig): document first real use case of channel fact"</automated>
  </verify>
  <acceptance_criteria>
    - `docs/architecture/06-agent-lifecycle-router.md` menciona godentist-fb-ig como primer uso real del fact channel.
    - `docs/analysis/04-estado-actual-plataforma.md` documenta status del sibling.
    - Commit atomico exacto. NO push todavia.
  </acceptance_criteria>
  <done>
    - Regla 4 (docs siempre actualizadas) cumplida para los 2 docs criticos.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Push collective a Vercel + verificar deploy auto-trigger (Regla 1)</name>
  <read_first>
    - CLAUDE.md Regla 1
    - .planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md §Code push
  </read_first>
  <what-built>
    Acumulamos commits locales desde Plan 02 (Wave 1) hasta Plan 08 Task 3 (~10-12 commits totales). El SQL ya esta aplicado en produccion (Plan 07 Task 2 confirmed por usuario). Es momento de pushear todo el codigo a Vercel para que el sibling sea funcional end-to-end.

    **Por que Plan 07 BEFORE Plan 08 push:** Sin templates en DB, el sibling registrado retornaria empty selection y no respondería. SQL apply pre-push es REGLA 5.

    **Pre-push validation obligatoria:**
    1. TypeScript compila sin errores (`npx tsc --noEmit`)
    2. Suite tests del sibling pasa (`npx vitest run src/lib/agents/godentist-fb-ig/__tests__/`)
    3. Suite tests routing existentes no regresion (`npx vitest run src/lib/agents/routing/__tests__/`)

    Despues del push, verificar:
    - `git log --oneline origin/main..HEAD` retorna 0 lineas (todos los commits pusheados)
    - Vercel dashboard auto-triggered un nuevo deployment (visible en https://vercel.com/morfxjose/morfx-new/deployments)
  </what-built>
  <how-to-verify>
    **Paso 1 — Pre-push validation (Claude corre):**

    ```bash
    # 1. TypeScript compila
    npx tsc --noEmit 2>&1 | tee /tmp/tsc-output.txt
    grep -cE "error TS" /tmp/tsc-output.txt
    # Esperado: 0
    ```

    Si hay errores TS, debug y fix antes de push.

    ```bash
    # 2. Suite tests del sibling
    npx vitest run src/lib/agents/godentist-fb-ig/__tests__/ 2>&1 | tee /tmp/vitest-sibling.txt
    grep -E "passed|✓" /tmp/vitest-sibling.txt | head -5
    # Esperado: 6 suites passed, ~50-80 tests passed
    ```

    Si tests fallan, debug y fix antes de push.

    ```bash
    # 3. Suite tests routing existentes (no regresion)
    npx vitest run src/lib/agents/routing/__tests__/ 2>&1 | tee /tmp/vitest-routing.txt
    grep -E "passed|✓" /tmp/vitest-routing.txt | head -3
    # Esperado: pasa 100% sin nuevos fails
    ```

    **Paso 2 — Verificar commits locales pendientes de push:**

    ```bash
    git log --oneline origin/main..HEAD
    # Esperado: ~10-12 commits desde Plan 02 hasta Plan 08 Task 3
    ```

    Listar los commits para que el usuario revise:

    ```bash
    git log --oneline -15
    ```

    **Paso 3 — Push a origin main:**

    ```bash
    git push origin main 2>&1 | tee /tmp/push-output.txt
    grep -E "main -> main|new branch" /tmp/push-output.txt
    ```

    Esperado: push exitoso con `<old-sha>..<new-sha>  main -> main`.

    Si push falla:
    - Si por hooks (pre-commit/pre-push), debug el error.
    - Si por divergencia (someone pushed in between), `git pull --rebase origin main` y re-push.
    - NO usar `--force` ni `--no-verify` (CLAUDE.md prohibido).

    **Paso 4 — Verificar Vercel auto-deploy:**

    Pedir al usuario que confirme:
    1. Abrir https://vercel.com/morfxjose/morfx-new/deployments
    2. Verificar que un nuevo deployment apareció (timestamp coincide con el push).
    3. Esperar a que el deployment status pase a "Ready" (o "Error" si hay falla).
    4. Pegar URL del deployment + status al chat.

    **Paso 5 — Si Vercel deploy fails:**

    - Pegar logs del deployment al chat.
    - Discutir accion correctiva (revert? fix-forward? hotfix?).
    - NO escalar al usuario para verificar smoke 1 hasta que el deploy sea Ready.

    **Paso 6 — Claude crea `08-PUSH-EVIDENCE.md`:**

    ```markdown
    # Push Evidence — agent-godentist-fb-ig (Wave 6 Plan 08 Task 4)

    **Push date:** <YYYY-MM-DD HH:MM America/Bogota>

    ## Pre-push validation

    - [x] `npx tsc --noEmit` → 0 errores
    - [x] `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` → <N>/<N> tests passed
    - [x] `npx vitest run src/lib/agents/routing/__tests__/` → no regresion

    ## Commits pushed

    Range: `<old-sha>..<new-sha>` (en main)
    Total commits: <N>

    Lista (relevantes al standalone):
    - <sha> Plan 02 Task 1 — clone verbatim types/comprehension-schema/guards/phase
    - <sha> Plan 02 Task 2 — clone verbatim constants/state/transitions/dentos-availability
    - <sha> Plan 03 Task 1 — adapt config.ts + index.ts
    - <sha> Plan 03 Task 2 — adapt comprehension-prompt + comprehension
    - <sha> Plan 03 Task 3 — adapt response-track + agent
    - <sha> Plan 04 Task 1 — lead-capture.ts pure helper
    - <sha> Plan 04 Task 2 — sales-track adapted + hook
    - <sha> Plan 05 Task 1 — agent-catalog + page.tsx
    - <sha> Plan 05 Task 2 — webhook-processor pre-warm + dispatch
    - <sha> Plan 05 Task 3 — engine types + runner branch + VAL tag
    - <sha> Plan 06 Task 1 — lead-capture.test.ts + transitions.test.ts
    - <sha> Plan 06 Task 2 — sales-track.test.ts + comprehension.test.ts
    - <sha> Plan 06 Task 3 — response-track.test.ts (D-08) + agent.test.ts
    - <sha> Plan 07 Task 1 — migration SQL file
    - <sha> Plan 08 Task 1 — agent spec md
    - <sha> Plan 08 Task 2 — agent-scope rules section
    - <sha> Plan 08 Task 3 — docs architecture + plataforma

    ## Vercel deploy

    URL: <pegar URL del deployment>
    Status: [x] Ready / [ ] Building / [ ] Error
    Build duration: <N>s

    ## Decision

    - [ ] **Wave 6 PASA — desbloquear Plan 09 verification + LEARNINGS.**
    - [ ] **Wave 6 BLOCKER — Vercel deploy failed.** Razon: ___
    ```

    **Paso 7 — Commit final:**

    ```bash
    git add .planning/standalone/agent-godentist-fb-ig/08-PUSH-EVIDENCE.md
    git commit -m "docs(agent-godentist-fb-ig): document push evidence (Wave 6 Plan 08 Task 4)"
    git push origin main
    ```

    Este ultimo push trae el evidence file. Esperado: trivial (1 file added).
  </how-to-verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` retorna 0 errores.
    - `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` pasa 100%.
    - `npx vitest run src/lib/agents/routing/__tests__/` pasa sin nuevos fails.
    - `git push origin main` exitoso con ~10-12 commits del standalone.
    - Vercel deploy auto-triggered y status "Ready" (no "Error").
    - `.planning/standalone/agent-godentist-fb-ig/08-PUSH-EVIDENCE.md` documenta el push + deploy.
    - Final commit del evidence file pusheado.
  </acceptance_criteria>
  <resume-signal>
    Escribe "vercel deploy ready" cuando el deployment este en estado Ready y la URL este accesible. Esto desbloquea Plan 09 (verification final + LEARNINGS).

    Si Vercel deploy falla:
    - Pega logs al chat.
    - Discutamos hotfix antes de proceder.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local git → origin main → Vercel | Push estandar, Vercel build pipeline corre tests; usuario verifica deploy ready |
| Docs markdown → public repo | Spec + agent-scope visible para futuros mantenedores; sin secrets |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-08-01 | Tampering | Push con tests rotos | mitigate | Pre-push validation explicita: tsc + vitest del sibling + vitest routing |
| T-gfb-08-02 | Information Disclosure | Workspace UUID en docs publicos | accept | El UUID por si solo no es secreto; sin RLS bypass |
| T-gfb-08-03 | Denial of Service | Vercel build fails y deploy roto | mitigate | Plan 09 smoke test 1 (dropdown) detecta deploy issue temprano |
| T-gfb-08-04 | Spoofing | SQL pre-formado en docs malicioso | accept | El usuario que copie y ejecute tiene contexto suficiente para revisar; D-15 manual implica revision |
</threat_model>

<verification>
- 4 archivos modificados/creados:
  - `src/lib/agent-specs/godentist-fb-ig.md` (nuevo)
  - `.claude/rules/agent-scope.md` (extendido)
  - `docs/architecture/06-agent-lifecycle-router.md` (extendido)
  - `docs/analysis/04-estado-actual-plataforma.md` (extendido)
- Pre-push: tsc 0 errores + vitest sibling pass + vitest routing no regresion.
- Push: `git push origin main` exitoso.
- Vercel deploy ready (Plan 09 verifica smoke 1 dropdown).
- 4 commits atomicos + push collective + final evidence commit.
</verification>

<success_criteria>
- Plan 09 puede correr smoke 1 (dropdown del routing-editor) inmediatamente — Vercel deploy esta ready.
- El usuario tiene SQL pre-formado en `agent-scope.md` listo para crear la routing rule manual.
- Future siblings (somnio-fb-ig, etc) tienen pattern documentado en docs/architecture (D-20).
- Regla 1 (push despues de cambios) y Regla 4 (docs actualizadas) cumplidas.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/08-SUMMARY.md` documenting:
- Commit hashes de Tasks 1, 2, 3, 4.
- Push range `<old-sha>..<new-sha>` con conteo de commits totales pusheados.
- Vercel deploy URL + status Ready.
- Pre-push validation outputs (tsc 0 errors, vitest pass).
- Status: codigo deployed, sibling visible en routing-editor (pending Plan 09 smoke), routing rule pendiente del operador.
</output>
