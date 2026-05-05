---
phase: agent-godentist-fb-ig
plan: 07
type: execute
wave: 5
depends_on: [01, 06]
files_modified:
  - supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql
autonomous: false
requirements: [GFB-03]

must_haves:
  truths:
    - "Existe el archivo `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql` con migration idempotente que clona ~75 templates del godentist a agent_id='godentist-fb-ig' usando INSERT...SELECT con CASE para reemplazar el saludo por el texto D-05 verbatim"
    - "El SQL incluye sanity check DO block que valida `godentist_count = sibling_count` post-INSERT (RAISE EXCEPTION si difiere)"
    - "El SQL es idempotente: `BEGIN; DELETE FROM agent_templates WHERE agent_id='godentist-fb-ig'; INSERT...SELECT; COMMIT;` — re-runnable sin errores"
    - "El usuario aplico la migration en produccion via Supabase SQL Editor manualmente (Regla 5 BLOCKING)"
    - "Post-apply: SELECT COUNT(*) FROM agent_templates WHERE agent_id='godentist-fb-ig' coincide con el target row count documentado en 01-SUMMARY.md (Q-A) — sanity check del DO block pasa"
    - "Post-apply: SELECT content FROM agent_templates WHERE agent_id='godentist-fb-ig' AND intent='saludo' AND priority='CORE' retorna el texto D-05 con goBot 🤖 + Habeas Data inline"
  artifacts:
    - path: "supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql"
      provides: "Migration SQL idempotente para clonar catalog godentist a sibling con saludo D-05"
      contains: "godentist-fb-ig"
      min_lines: 50
  key_links:
    - from: "supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql"
      to: "agent_templates table (production DB)"
      via: "INSERT...SELECT desde agent_id='godentist' con CASE WHEN intent='saludo' AND priority='CORE'"
      pattern: "INSERT INTO agent_templates"
    - from: "Plan 09 SQL pre-formado para routing rule"
      to: "operador en /agentes/routing/editor"
      via: "documentacion del workspace UUID + priority slot recomendado en 01-SUMMARY.md"
      pattern: "godentist-fb-ig"
---

<objective>
Wave 5 — [BLOCKING] Crear el archivo de migration SQL + APLICAR en produccion via Supabase SQL Editor con PAUSE esperando confirmacion del usuario. Regla 5 obligatoria: SQL apply ANTES de push del codigo que usa el catalog (Plan 08).

Purpose: El sibling necesita su propio catalog de templates con saludo D-05 lead-capture. El catalog se crea via INSERT...SELECT desde godentist con CASE para reemplazar el saludo (D-08). El apply en produccion DEBE ocurrir antes del push del codigo en Plan 08 — sin templates, response-track retorna empty selection y el agente falla silenciosamente.

**Regla 5 obligatoria del proyecto (CLAUDE.md):**
> TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa.
> Workflow obligatorio:
> 1. Crear archivo de migracion en supabase/migrations/
> 2. PAUSAR — pedir al usuario que aplique la migracion en produccion
> 3. ESPERAR confirmacion explicita del usuario
> 4. Solo entonces pushear el codigo que depende del nuevo schema

**Pattern validado en somnio-sales-v3-pw-confirmation 13-DEPLOY-NOTES.md (2026-04-28):** SQL apply via Supabase SQL Editor manual + PAUSE + push posterior.

**Critico:** Si el push del Plan 08 ocurre ANTES del apply, el sibling estara registrado pero `templateManager.getTemplatesForIntents('godentist-fb-ig', ...)` retornara empty Map → response-track emitira fallback con `emptyReason: 'templates_not_found_in_catalog'` → cliente FB/IG NO recibe respuesta del bot.

Output:
- 1 archivo SQL en `supabase/migrations/`
- 1 confirmacion del usuario (chat) que aplico la migration
- 1 verificacion post-apply via SELECT que el row count coincide y el saludo D-05 se renderiza
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md
@CLAUDE.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md
@supabase/migrations/20260318100000_godentist_templates.sql
@supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql

<interfaces>
<!-- Migration filename pattern -->
TIMESTAMP_FORMAT = 'YYYYMMDDHHMMSS'
EXAMPLE_TIMESTAMP = '20260505100000'  // ajustar al dia efectivo del execute-phase
TIMESTAMP_LATEST_AT_RESEARCH = '20260501100400'  // 20260501100400_somnio_v4_match_knowledge_base_rpc.sql

<!-- Workspace target locked -->
WORKSPACE_GODENTIST_VALORACIONES = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'

<!-- Source agent_id (catalog godentist) -->
SOURCE_AGENT_ID = 'godentist'   // workspace_id IS NULL (catalog global)

<!-- Target agent_id (catalog sibling) -->
TARGET_AGENT_ID = 'godentist-fb-ig'
</interfaces>

<security_relevant>
**Workspace isolation:** La migration corre sobre catalog global (`workspace_id IS NULL`). El sibling se activa solo en workspace target via routing rule manual del usuario (D-15) — la separacion DB esta en routing, NO en agent_templates.

**Habeas Data (D-05/D-06):** El saludo D-05 incluye disclaimer "Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data)." inline. El cliente que envie datos da consentimiento implicito (D-06). Cumple Ley 1581/2011.

**Regla 5 BLOCKING:** Si Claude push antes de SQL apply, `templates_not_found_in_catalog` fallback degrada UX. La PAUSE de este plan es OBLIGATORIA.
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear el archivo de migration SQL idempotente</name>
  <read_first>
    - supabase/migrations/20260318100000_godentist_templates.sql (~351 LOC — patron de migration godentist original)
    - supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql (~517 LOC — patron sibling pw-confirmation reciente)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Template Catalog Migration (full section)
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-05 (saludo verbatim) + §D-08 (catalog independiente)
    - .planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md §Q-A row count (target del sanity check)
  </read_first>
  <action>
**Paso 1 — Determinar timestamp del archivo:**

Revisar el ultimo timestamp de migration en `supabase/migrations/` y usar el dia efectivo del execute-phase:

```bash
ls -t supabase/migrations/ | head -3
```

Usar formato `YYYYMMDDHHMMSS_godentist_fb_ig_template_catalog.sql`. Ejemplo: `20260505100000_godentist_fb_ig_template_catalog.sql` (asumir que el day-of execute es el 2026-05-05; el ejecutor debe ajustar al dia real).

**Paso 2 — Crear el archivo de migration con el contenido literal siguiente:**

```sql
-- ============================================================================
-- GoDentist FB/IG Sibling — Template Catalog Migration
-- Standalone: agent-godentist-fb-ig
--
-- Clones ALL templates from agent_id='godentist' to agent_id='godentist-fb-ig'.
-- Single content change: template `saludo`/CORE uses lead-capture text per D-05.
-- All other templates verbatim (precios, ubicaciones, horarios, escape, follow-ups,
-- english_response, etc.) per D-08.
--
-- Workspace: NULL (catalog global; el sibling solo se activa en workspace
-- 'GoDentist Valoraciones' f0241182-f79b-4bc6-b0ed-b5f6eb20c514 pero el
-- catalog es global accesible via workspace-aware TemplateManager).
--
-- Idempotency: DELETE existing rows for agent_id='godentist-fb-ig' before INSERT.
-- Safe to re-run.
--
-- Rollback: DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';
--
-- Regla 5: Apply MANUALLY in production BEFORE pushing code that references
-- these templates. Plan-phase Plan 07 = SQL apply [BLOCKING], Plan 08 = code push.
-- ============================================================================

BEGIN;

-- Idempotent: clean slate
DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';

-- Clone all templates from godentist with single content swap for saludo CORE
INSERT INTO agent_templates (
  id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
)
SELECT
  gen_random_uuid(),
  'godentist-fb-ig',
  workspace_id,
  intent,
  visit_type,
  priority,
  orden,
  content_type,
  CASE
    WHEN intent = 'saludo' AND priority = 'CORE' THEN
      -- D-05 locked verbatim
      E'\U0001F44B ¡Hola! Soy goBot \U0001F916 de godentist ®️.\n\nTu valoración odontológica es totalmente GRATIS \U0001F9B7✨\nDéjanos estos datos y reservamos tu cita de inmediato:\n\n\U0001F4CC Nombre completo\n\U0001F4CC Celular\n\n\U0001F512 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).\n\nEstás a un paso de comenzar tu nueva sonrisa \U0001F499 ¿Deseas agendar tu cita de valoración GRATIS?'
    ELSE content
  END,
  delay_s
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL;

-- Sanity check: row count post-INSERT must match godentist row count
DO $$
DECLARE
  godentist_count INTEGER;
  sibling_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO godentist_count FROM agent_templates WHERE agent_id = 'godentist' AND workspace_id IS NULL;
  SELECT COUNT(*) INTO sibling_count FROM agent_templates WHERE agent_id = 'godentist-fb-ig';
  IF sibling_count != godentist_count THEN
    RAISE EXCEPTION 'Row count mismatch: godentist=% sibling=% (expected equal)', godentist_count, sibling_count;
  END IF;
  RAISE NOTICE 'Migration OK: % rows cloned from godentist to godentist-fb-ig', sibling_count;
END $$;

-- Sanity check: saludo D-05 was applied
DO $$
DECLARE
  saludo_count INTEGER;
  saludo_has_gobot BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO saludo_count
  FROM agent_templates
  WHERE agent_id = 'godentist-fb-ig'
    AND intent = 'saludo'
    AND priority = 'CORE';
  IF saludo_count = 0 THEN
    RAISE EXCEPTION 'No saludo CORE found for godentist-fb-ig — D-05 not applied';
  END IF;

  SELECT bool_or(content LIKE '%goBot%' AND content LIKE '%Habeas Data%')
  INTO saludo_has_gobot
  FROM agent_templates
  WHERE agent_id = 'godentist-fb-ig'
    AND intent = 'saludo'
    AND priority = 'CORE';
  IF NOT saludo_has_gobot THEN
    RAISE EXCEPTION 'Saludo CORE for godentist-fb-ig does not contain goBot + Habeas Data — D-05 text not applied correctly';
  END IF;

  RAISE NOTICE 'D-05 saludo OK: % CORE row(s) with goBot + Habeas Data inline', saludo_count;
END $$;

COMMIT;
```

**Paso 3 — Validar el SQL syntax (sin aplicar):**

```bash
# Sanity grep que el archivo tiene los componentes criticos:
grep -c "BEGIN" supabase/migrations/*godentist_fb_ig*.sql
# Esperado: 1

grep -c "DELETE FROM agent_templates" supabase/migrations/*godentist_fb_ig*.sql
# Esperado: 1 (idempotency)

grep -c "INSERT INTO agent_templates" supabase/migrations/*godentist_fb_ig*.sql
# Esperado: 1

grep -c "godentist-fb-ig" supabase/migrations/*godentist_fb_ig*.sql
# Esperado: >=4 (DELETE + INSERT + 2 sanity checks)

grep -q "Habeas Data" supabase/migrations/*godentist_fb_ig*.sql
# Esperado: si match (D-05 saludo)

grep -q "RAISE EXCEPTION" supabase/migrations/*godentist_fb_ig*.sql
# Esperado: si match (sanity checks)
```

**Paso 4 — Commit (NO aplicar todavia, NO push):**

```bash
git add supabase/migrations/*godentist_fb_ig_template_catalog.sql
git commit -m "feat(agent-godentist-fb-ig): add migration SQL — clone godentist catalog with D-05 saludo (Wave 5 Plan 07 Task 1)"
```

NO push.
  </action>
  <verify>
    <automated>ls supabase/migrations/ | grep godentist_fb_ig_template_catalog | head -1</automated>
    <automated>grep -q "BEGIN" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig'" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "INSERT INTO agent_templates" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "Habeas Data" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "goBot" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "RAISE EXCEPTION" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "Row count mismatch" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -q "COMMIT" supabase/migrations/*godentist_fb_ig*.sql</automated>
    <automated>grep -c "godentist-fb-ig" supabase/migrations/*godentist_fb_ig*.sql | awk '$1 >= 4 { exit 0 } { exit 1 }'</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): add migration SQL"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql` existe.
    - SQL contiene BEGIN/COMMIT (transaccion atomica).
    - SQL contiene DELETE inicial (idempotency) y INSERT...SELECT con CASE para saludo.
    - Saludo CORE contiene "goBot" y "Habeas Data" (D-05 verbatim).
    - 2 sanity checks DO block: row count match + saludo D-05 contains goBot+Habeas Data.
    - Commit atomico exacto. NO push. NO apply en prod todavia.
  </acceptance_criteria>
  <done>
    - Archivo SQL listo para que el usuario lo aplique en Supabase SQL Editor production.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] Usuario aplica la migration en produccion + verificacion post-apply</name>
  <read_first>
    - supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql (creado en Task 1)
    - .planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md §Q-A row count (target esperado)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md (patron sibling: SQL apply -> push)
    - CLAUDE.md Regla 5
  </read_first>
  <what-built>
    Claude creo el archivo de migration `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql` que clona ~75 templates del godentist a `agent_id='godentist-fb-ig'` con saludo D-05 (lead-capture). El SQL es idempotente y tiene 2 sanity checks (row count match + saludo contains goBot+Habeas Data).

    **Regla 5 obligatoria del proyecto:** El usuario debe aplicar este SQL en production ANTES del push del Plan 08 (codigo que usa estos templates). Si Claude push primero, el sibling estara registrado pero TemplateManager retornara empty selection → response-track emitira fallback → cliente FB/IG NO recibe respuesta. Mismo patron que somnio-sales-v3-pw-confirmation 13-DEPLOY-NOTES.

    **Tu responsabilidad:**
    1. Abrir Supabase SQL Editor production
    2. Pegar TODO el contenido del archivo y ejecutar
    3. Confirmar que las 2 RAISE NOTICE finales aparecen sin RAISE EXCEPTION (sanity checks pasan)
    4. Pegar el output al chat
    5. Claude verifica post-apply via 3 SELECTs adicionales y crea `07-APPLY-EVIDENCE.md`
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar la migration:**

    1. Abrir https://supabase.com/dashboard → proyecto morfx prod → SQL Editor → New query.
    2. Copiar TODO el contenido de `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql` (incluyendo BEGIN; ... COMMIT;).
    3. Pegar y correr.
    4. **Verificar output:**
       - Si aparece "Migration OK: <N> rows cloned from godentist to godentist-fb-ig" -> sanity check 1 paso.
       - Si aparece "D-05 saludo OK: <N> CORE row(s) with goBot + Habeas Data inline" -> sanity check 2 paso.
       - Si aparece "ERROR: Row count mismatch" o "ERROR: ... D-05 not applied" -> ROLLBACK automatico (BEGIN/COMMIT atomico). Reportar al chat para debug.
    5. Pegar el output completo al chat.

    **Paso 2 — Verificacion adicional post-apply (Claude corre via Supabase SQL Editor con permiso del usuario, o el usuario corre y pega):**

    ```sql
    -- Verificacion 1: total row count
    SELECT COUNT(*) AS sibling_total
    FROM agent_templates
    WHERE agent_id = 'godentist-fb-ig';

    -- Verificacion 2: saludo D-05 verbatim
    SELECT id, intent, visit_type, priority, content
    FROM agent_templates
    WHERE agent_id = 'godentist-fb-ig'
      AND intent = 'saludo'
      AND priority = 'CORE';

    -- Verificacion 3: comparison row count godentist vs sibling
    SELECT
      (SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'godentist' AND workspace_id IS NULL) AS godentist_count,
      (SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'godentist-fb-ig') AS sibling_count;
    ```

    **Paso 3 — Decision Go/No-Go post-apply:**

    | Verificacion | Go (avanzar a Plan 08) | No-Go (PAUSAR + escalar) |
    |---------------|--------------------------|---------------------------|
    | sibling_total | matches Q-A target en 01-SUMMARY.md (~75) | difiere -> RAISE NOTICE no apareceria, debug |
    | saludo D-05 | content contiene "goBot" + "Habeas Data" verbatim | content no contiene -> CASE WHEN fallo, debug |
    | godentist_count = sibling_count | si | no -> RAISE EXCEPTION ya rollbackeo, fix SQL |

    **Paso 4 — Claude crea `07-APPLY-EVIDENCE.md`:**

    ```markdown
    # Apply Evidence — godentist-fb-ig migration (Wave 5 Plan 07 Task 2)

    **Apply date:** <YYYY-MM-DD HH:MM America/Bogota>
    **Applied by:** <usuario>
    **Migration file:** supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql

    ## Output del SQL Editor

    <pegar output verbatim de la ejecucion>

    Sanity checks:
    - [x] Row count match: godentist_count=<N> == sibling_count=<N>
    - [x] D-05 saludo OK: <N> CORE row(s) with goBot + Habeas Data inline

    ## Verificacion 1 — total row count

    sibling_total = <N>

    Esperado segun 01-SUMMARY.md Q-A: <N>

    Match: [x] SI / [ ] NO

    ## Verificacion 2 — saludo D-05

    Content del saludo CORE:
    ```
    <pegar content verbatim>
    ```

    Contains "goBot": [x] SI / [ ] NO
    Contains "Habeas Data": [x] SI / [ ] NO
    Contains "Ley 1581": [x] SI / [ ] NO

    ## Verificacion 3 — comparison

    godentist_count = <N>
    sibling_count   = <N>

    Equal: [x] SI / [ ] NO

    ## Decision agregada

    - [ ] **Wave 5 PASA — desbloquear Plan 08 push.** Las 3 verificaciones GO.
    - [ ] **Wave 5 BLOCKER — pausar fase.** Razon: ___
    ```

    **Paso 5 — Claude commit:**

    ```bash
    git add .planning/standalone/agent-godentist-fb-ig/07-APPLY-EVIDENCE.md
    git commit -m "docs(agent-godentist-fb-ig): document migration apply evidence (Wave 5 Plan 07 Task 2)"
    ```

    NO push.
  </how-to-verify>
  <acceptance_criteria>
    - Usuario aplico el SQL en Supabase SQL Editor production sin errores.
    - Output del SQL Editor incluye 2 RAISE NOTICE: "Migration OK: ..." + "D-05 saludo OK: ...".
    - Verificacion 1: `sibling_total` matches Q-A target documentado en 01-SUMMARY.md.
    - Verificacion 2: saludo D-05 content contiene "goBot", "Habeas Data", "Ley 1581" verbatim.
    - Verificacion 3: `godentist_count == sibling_count`.
    - `07-APPLY-EVIDENCE.md` documenta los 3 outputs verbatim + decision GO.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <resume-signal>
    Escribe "migration aplicada" (3/3 verificaciones GO) para desbloquear Plan 08 (push del codigo + docs).

    Si alguna verificacion falla:
    - Pega el output al chat.
    - Discutamos accion correctiva (re-run SQL? fix CASE WHEN? rollback DELETE?) ANTES de proceder.
    - NO pushear el codigo del Plan 08 hasta que las 3 verificaciones pasen.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local SQL file → production DB (Supabase SQL Editor manual) | Usuario tiene acceso productivo legitimo; aplica via UI con su credencial |
| Migration → agent_templates table | Solo INSERTs y DELETE filtrado por agent_id; cero modificacion al godentist original |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-07-01 | Tampering | Migration aplicada en wrong env | mitigate | Usuario aplica via UI consciente; el SQL no toca godentist (DELETE filtrado por agent_id='godentist-fb-ig') |
| T-gfb-07-02 | Information Disclosure | Catalog templates expuestos | accept | Templates son content publico (no PII de clientes) |
| T-gfb-07-03 | Tampering | Saludo D-05 con texto incorrecto | mitigate | Sanity check 2 (DO block) RAISE EXCEPTION si content no contiene goBot+Habeas Data |
| T-gfb-07-04 | Denial of Service | Push pre-apply -> bot FB/IG no responde | mitigate | Plan order es BLOCKING: Plan 07 PAUSE -> usuario confirma -> Plan 08 push |
</threat_model>

<verification>
- 1 archivo SQL en `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql`.
- 1 archivo evidencia en `.planning/standalone/agent-godentist-fb-ig/07-APPLY-EVIDENCE.md`.
- Migration aplicada en produccion: 2 RAISE NOTICE finales sin RAISE EXCEPTION.
- Post-apply SELECTs confirman: sibling row count matches godentist + saludo D-05 contiene goBot+Habeas Data.
- 2 commits atomicos en git local. NO push (Plan 08 hace el push collective).
</verification>

<success_criteria>
- Plan 08 puede pushear sabiendo que `templateManager.getTemplatesForIntents('godentist-fb-ig', ...)` retornara templates reales (no empty Map).
- Cliente FB/IG (cuando usuario active la routing rule en Plan 09) recibira el saludo D-05 lead-capture y los demas templates verbatim del godentist.
- Anti-Pitfall 1 (cdc06d9): el sibling NO comparte catalog con godentist — el row count + saludo D-05 distinto confirman aislamiento.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/07-SUMMARY.md` documenting:
- Commit hashes de Task 1 (SQL file) y Task 2 (apply evidence).
- Filename exacto del archivo SQL aplicado (con timestamp real).
- Output verbatim de las 2 RAISE NOTICE de los sanity checks.
- Row count final del sibling catalog.
- Confirmacion de saludo D-05 verbatim (primera linea + ultima linea del content).
- Status: catalog ready en prod, Plan 08 puede proceder a push.
</output>
