---
phase: agent-godentist-fb-ig
plan: 09
type: execute
wave: 7
depends_on: [08]
files_modified:
  - .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md
  - .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md
autonomous: false
requirements: [GFB-02, GFB-05, GFB-06]

must_haves:
  truths:
    - "Existe `VERIFICATION.md` con resultados de las 12 grep verifications de RESEARCH.md §Verification Strategy + smoke 1 (dropdown) + smoke 4 (anti-regresion godentist) + decision agregada GO/NO-GO"
    - "Existe `LEARNINGS.md` documentando D-20 reusable pattern 'agente sibling para canal alterno' como template para futuros standalones (e.g., somnio-fb-ig)"
    - "Smoke 1 (dropdown routing-editor) PASS: el dropdown en `/agentes/routing/editor` para workspace target muestra `'GoDentist Valoraciones — FB/IG'` como opcion seleccionable"
    - "Smoke 4 (anti-regresion godentist) PASS: cliente WhatsApp del workspace godentist original recibe respuesta normal (saludo conversacional, NO lead-capture). agent_observability_events confirma `agent='godentist'` (NO 'godentist-fb-ig')"
    - "Smoke 2 + 3 (E2E manual con mensajes reales FB/IG) DEFERIDOS al usuario (D-18 — el usuario hara las pruebas manuales cuando active la routing rule)"
    - "MEMORY.md actualizado con shipped status del standalone + link al LEARNINGS.md"
  artifacts:
    - path: ".planning/standalone/agent-godentist-fb-ig/VERIFICATION.md"
      provides: "12 grep verifications + 2 smoke tests + decision agregada"
      contains: "Decision agregada"
    - path: ".planning/standalone/agent-godentist-fb-ig/LEARNINGS.md"
      provides: "D-20 reusable pattern + lessons learned + 8 pitfalls cubiertos"
      contains: "agente sibling para canal alterno"
  key_links:
    - from: ".planning/standalone/agent-godentist-fb-ig/LEARNINGS.md (D-20 pattern)"
      to: "future siblings standalones (e.g., somnio-fb-ig)"
      via: "documentar 7 patrones + 8 pitfalls + 5 sitios de registracion como template reusable"
      pattern: "agente sibling para canal alterno"
---

<objective>
Wave 7 — Verificacion final automatizada (12 grep checks + 2 smoke tests automatizables) + LEARNINGS.md documentando el pattern reusable D-20. Este es el cierre del standalone.

Purpose: Confirmar que TODOS los gates verificables de RESEARCH.md §Verification Strategy pasan en el codigo deployed. Documentar el pattern "agente sibling para canal alterno" como reusable para futuros standalones (somnio-fb-ig, agent-X-canal-Y) — D-20 obligatorio.

Output:
- `VERIFICATION.md` con 12 grep checks + smoke 1 + smoke 4 + decision GO/NO-GO
- `LEARNINGS.md` con D-20 pattern + 8 pitfalls cubiertos + lecciones aprendidas
- `MEMORY.md` actualizado con shipped status del standalone (commit + link a LEARNINGS)
- Smoke 2 + 3 (E2E manual con mensajes reales) DEFERIDOS al usuario (D-18)

Despues de este plan, el standalone esta SHIPPED. La unica accion pendiente es del usuario: crear la routing rule manual via `/agentes/routing/editor` para activar el sibling.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md
@.planning/standalone/agent-godentist-fb-ig/07-SUMMARY.md
@.planning/standalone/agent-godentist-fb-ig/08-SUMMARY.md
@CLAUDE.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/LEARNINGS.md

<interfaces>
<!-- 12 verifications de RESEARCH.md §Verification Strategy -->
VERIFICATION_CHECKS = [
  '1. TypeScript compile: npx tsc --noEmit -> 0 errors',
  '2. Sibling test suite: npx vitest run src/lib/agents/godentist-fb-ig/__tests__/ -> 6 suites',
  '3. Existing routing tests no regression',
  '4. Anti-regression D-08 grep: grep -n GODENTIST_AGENT_ID src/lib/agents/godentist-fb-ig/ -> 0 matches',
  '5. Sibling self-register grep: grep -c agentRegistry.register src/lib/agents/godentist-fb-ig/index.ts -> 1',
  '6. Sibling pre-warm grep: grep -c import(../godentist-fb-ig) webhook-processor.ts -> >=2',
  '7. Catalog entry grep: grep -c id: godentist-fb-ig src/lib/agents/agent-catalog.ts -> 1',
  '8. agentModule union extended: grep -n godentist-fb-ig src/lib/agents/engine/types.ts -> 1',
  '9. VAL tag check extended: grep -E condicion-compuesta v3-production-runner.ts -> 1',
  '10. Regla 3 grep: grep -rn createAdminClient src/lib/agents/godentist-fb-ig/ -> 0',
  '11. Migration row count match (production)',
  '12. Saludo D-05 verbatim contains goBot+Habeas Data (production)'
]

<!-- 2 smoke tests automatizables -->
SMOKE_1 = 'Dropdown del routing-editor muestra GoDentist Valoraciones — FB/IG'
SMOKE_4 = 'Anti-regresion godentist intact (D-04) — observability event agent=godentist'
</interfaces>

<security_relevant>
**Verification scope:** Solo lectura (grep + observability queries + UI inspection). Cero side-effects en codigo o DB.

**D-20 LEARNINGS:** Documentacion de pattern reusable. Sin secrets, sin PII. Public-safe.
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear VERIFICATION.md con 12 grep checks + smoke 1 + smoke 4</name>
  <read_first>
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Verification Strategy (full section)
    - .planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md §Q-A row count
    - .planning/standalone/agent-godentist-fb-ig/07-SUMMARY.md
    - .planning/standalone/agent-godentist-fb-ig/08-SUMMARY.md
  </read_first>
  <action>
**Paso 1 — Correr las 10 verifications grep automatizadas:**

```bash
echo "=== Verification 1: TypeScript compile ==="
npx tsc --noEmit 2>&1 | grep -cE "error TS" || echo "0 errors"

echo "=== Verification 2: Sibling test suite ==="
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/ 2>&1 | grep -E "Test Files|Tests"

echo "=== Verification 3: Existing routing tests no regression ==="
npx vitest run src/lib/agents/routing/__tests__/ 2>&1 | grep -E "Test Files|Tests"

echo "=== Verification 4: Anti-regression D-08 grep (must be 0) ==="
grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/ | wc -l

echo "=== Verification 5: Sibling self-register grep (must be 1) ==="
grep -c "agentRegistry.register" src/lib/agents/godentist-fb-ig/index.ts

echo "=== Verification 6: Sibling pre-warm grep (must be >=2) ==="
grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts

echo "=== Verification 7: Catalog entry grep (must be 1) ==="
grep -c "id: 'godentist-fb-ig'" src/lib/agents/agent-catalog.ts

echo "=== Verification 8: agentModule union extended (must be >=1) ==="
grep -c "godentist-fb-ig" src/lib/agents/engine/types.ts

echo "=== Verification 9: VAL tag check extended (must be 1) ==="
grep -cE "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts

echo "=== Verification 10: Regla 3 grep (must be 0) ==="
grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/ | grep -v "//" | wc -l
```

Capturar todos los outputs.

**Paso 2 — Smoke 4: Anti-regresion godentist intact (D-04):**

Verificar via lectura del codigo que el agente godentist NO fue modificado:

```bash
git log --since="$(git log --oneline | tail -1 | awk '{print $1}')" --name-only -- 'src/lib/agents/godentist/' | grep -v "godentist-fb-ig"
# Esperado: 0 archivos modificados en src/lib/agents/godentist/ desde el inicio del standalone (excluding sibling).
```

Tambien validar que ningun archivo del godentist original aparece en `git diff` desde el branch base:

```bash
git diff origin/main~15 origin/main -- 'src/lib/agents/godentist/' | head -20
# Esperado: vacio o solo el path del comentario del archivo (NINGUN cambio funcional).
```

**Paso 3 — Smoke 1: Dropdown del routing-editor (CRITICAL — manual del usuario via browser):**

Pedir al usuario:
1. Abrir https://morfx.app/agentes/routing/editor (o URL del Vercel preview).
2. Verificar que en el dropdown "Agente" / "agent_id" aparece la opcion `GoDentist Valoraciones — FB/IG`.
3. Pegar screenshot al chat o confirmar via texto.

Esta verificacion confirma:
- Vercel deploy exitoso.
- El side-effect import en `page.tsx` corre.
- `agentRegistry.register(godentistFbIgConfig)` ejecuto.
- `agentRegistry.list()` retorna el sibling.

**Paso 4 — Crear `VERIFICATION.md` con todos los outputs:**

```markdown
# Verification Report — agent-godentist-fb-ig

**Verification date:** <YYYY-MM-DD HH:MM America/Bogota>
**Phase:** Wave 7 Plan 09 (cierre del standalone)

## Verification 1 — TypeScript compile

```bash
npx tsc --noEmit
```

Output:
```
<pegar output verbatim>
```

**Result:** [x] PASS (0 errors) / [ ] FAIL

---

## Verification 2 — Sibling test suite

```bash
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/
```

Output:
```
<pegar resumen verbatim — Test Files / Tests / Duration>
```

**Result:** [x] PASS (6 suites, <N>/<N> tests passed) / [ ] FAIL

---

## Verification 3 — Existing routing tests no regression

```bash
npx vitest run src/lib/agents/routing/__tests__/
```

Output:
```
<pegar resumen verbatim>
```

**Result:** [x] PASS (no regression) / [ ] FAIL

---

## Verification 4 — Anti-regression D-08 (Pitfall 1)

```bash
grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/
```

Output: <pegar — esperado vacio>

**Result:** [x] PASS (0 matches) / [ ] FAIL — sibling has GODENTIST_AGENT_ID leak

---

## Verification 5 — Sibling self-register grep

```bash
grep -c "agentRegistry.register" src/lib/agents/godentist-fb-ig/index.ts
```

Output: <pegar — esperado 1>

**Result:** [x] PASS / [ ] FAIL

---

## Verification 6 — Sibling pre-warm grep (anti-Pitfall 2 / B-001)

```bash
grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts
```

Output: <pegar — esperado >=2>

**Result:** [x] PASS (cold-lambda race mitigated) / [ ] FAIL

---

## Verification 7 — Catalog entry grep

```bash
grep -c "id: 'godentist-fb-ig'" src/lib/agents/agent-catalog.ts
```

Output: <pegar — esperado 1>

**Result:** [x] PASS / [ ] FAIL

---

## Verification 8 — agentModule union extended

```bash
grep -c "godentist-fb-ig" src/lib/agents/engine/types.ts
```

Output: <pegar — esperado >=1>

**Result:** [x] PASS / [ ] FAIL

---

## Verification 9 — VAL tag check extended (anti-Pitfall 6)

```bash
grep -cE "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts
```

Output: <pegar — esperado 1>

**Result:** [x] PASS (VAL tag dispara para sibling) / [ ] FAIL — leads FB/IG no contaran en metricas

---

## Verification 10 — Regla 3 grep (no createAdminClient)

```bash
grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/ | grep -v "//"
```

Output: <pegar — esperado vacio>

**Result:** [x] PASS / [ ] FAIL

---

## Verification 11 — Migration row count match (production)

Reference: 07-APPLY-EVIDENCE.md §Verificacion 3.

godentist_count = <N>
sibling_count   = <N>

**Result:** [x] PASS (equal) / [ ] FAIL

---

## Verification 12 — Saludo D-05 verbatim (production)

Reference: 07-APPLY-EVIDENCE.md §Verificacion 2.

Saludo content contains:
- "goBot": [x] SI
- "Habeas Data": [x] SI
- "Ley 1581": [x] SI

**Result:** [x] PASS / [ ] FAIL

---

## Smoke 1 — Dropdown del routing-editor (CRITICAL)

URL tested: <pegar URL Vercel deploy>
Workspace: GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)

Verificacion:
- Dropdown muestra `GoDentist Valoraciones — FB/IG`: [x] SI / [ ] NO

Confirmado por: <usuario via screenshot/chat>

**Result:** [x] PASS / [ ] FAIL

---

## Smoke 4 — Anti-regresion godentist (D-04 intact)

```bash
git diff origin/main~15 origin/main -- 'src/lib/agents/godentist/'
```

Output:
```
<pegar — esperado vacio o solo path metadata>
```

Conclusion: 0 archivos del godentist original modificados durante el standalone.

**Result:** [x] PASS (D-04 honored — godentist intact) / [ ] FAIL — modificaciones leaked

---

## Smoke 2 + 3 — E2E manual mensajes reales FB/IG

**Status:** DEFERIDO al usuario (D-18 — el equipo no mantiene script automatizado contra Meta APIs por costo + flakiness).

**Activacion previa requerida:**
1. Usuario crea routing rule manual en `/agentes/routing/editor` (SQL pre-formado en `agent-scope.md`).
2. Usuario manda mensaje real desde su perfil personal a la pagina FB / perfil IG del workspace target.

**Smoke 2 (saludo D-05):** Bot responde con texto que contiene "goBot 🤖" + "Habeas Data" + "Ley 1581".
**Smoke 3 (lead capture happy path):** Cliente envia "Juan Perez, 3001234567" en turn 1 -> bot responde con `pedir_datos_parcial` + `{{campos_faltantes}}` interpolado pidiendo "Sede de tu preferencia".

Verificacion alternativa via observability:
- `agent_observability_events` debe mostrar `agent='godentist-fb-ig'` + event `pipeline_decision.lead_capture_triggered`.

---

## Decision agregada

- [ ] **Wave 7 PASA — standalone SHIPPED.** Las 12 verifications + smoke 1 + smoke 4 GO; smoke 2/3 deferidos al usuario.
- [ ] **Wave 7 BLOCKER.** Razon: ___
```

**Paso 5 — Commit:**

```bash
git add .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md
git commit -m "docs(agent-godentist-fb-ig): VERIFICATION.md — 12 checks + smoke 1 + smoke 4 PASS (Wave 7 Plan 09)"
```

NO push todavia (Task 3 hace push collective con LEARNINGS).
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md</automated>
    <automated>grep -q "Verification 4 — Anti-regression D-08" .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md</automated>
    <automated>grep -q "Verification 9 — VAL tag check extended" .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md</automated>
    <automated>grep -q "Smoke 1 — Dropdown del routing-editor" .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md</automated>
    <automated>grep -q "Smoke 4 — Anti-regresion godentist" .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md</automated>
    <automated>grep -q "Decision agregada" .planning/standalone/agent-godentist-fb-ig/VERIFICATION.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig): VERIFICATION.md"</automated>
  </verify>
  <acceptance_criteria>
    - `VERIFICATION.md` documenta 12 grep verifications + smoke 1 + smoke 4 + decision agregada.
    - 10 grep verifications corridas y outputs pegados verbatim.
    - Verification 11+12 referencian 07-APPLY-EVIDENCE.md (no re-correr).
    - Smoke 1 + 4 PASS confirmados.
    - Smoke 2/3 explicitamente DEFERIDOS al usuario (D-18).
    - Commit atomico exacto. NO push todavia.
  </acceptance_criteria>
  <done>
    - VERIFICATION.md ready. Sibling validated en codigo + DB + UI.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear LEARNINGS.md con D-20 reusable pattern + 8 pitfalls cubiertos</name>
  <read_first>
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-20 (LEARNINGS reusable pattern obligatorio)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Common Pitfalls (8 pitfalls totales) + §Architecture Patterns (7 patterns)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/LEARNINGS.md (referencia de estructura LEARNINGS para sibling)
    - .planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md..08-SUMMARY.md (timeline de plans)
  </read_first>
  <action>
**Paso 1 — Crear `.planning/standalone/agent-godentist-fb-ig/LEARNINGS.md` con el contenido siguiente:**

```markdown
# LEARNINGS — agent-godentist-fb-ig

**Standalone:** agent-godentist-fb-ig
**Shipped:** 2026-XX-XX (ajustar al dia real)
**Habilitado por:** standalone `routing-channel-fact` (shipped 2026-05-04, commit `c410085`)
**Pattern padre:** `somnio-sales-v3-pw-confirmation` (shipped 2026-04-28)

---

## D-20 Reusable Pattern: Agente Sibling para Canal Alterno

Este standalone es el **primer caso de uso real del fact `channel`** (shipped 2026-05-04). Documentamos el pattern como template reusable para futuros standalones que necesiten diferenciar comportamiento de un agente segun el canal de entrada (FB/IG vs WhatsApp vs web chat, etc).

### Cuando aplicar este pattern

Aplicar cuando se cumplen TODAS estas condiciones:

1. **Existe un agente productivo (E.g., godentist) que atiende un canal default (E.g., WhatsApp).**
2. **Se requiere diferenciar saludo o comportamiento del primer turno para un canal alterno (E.g., FB/IG).**
3. **El resto del pipeline (state machine, intents, comprehension model) es identico.**
4. **El catalog de templates puede clonarse del agente original con UNA modificacion (saludo).**
5. **Se quiere preservar al agente original SIN modificar (Regla 6 obliga este aislamiento).**

### Anatomia del pattern

| Capa | Que cambia | Que NO cambia |
|------|-----------|----------------|
| Agent ID | nuevo string `agent-X-canal-Y` | el agent original `agent-X` queda intacto |
| Source dir | nuevo `src/lib/agents/agent-X-canal-Y/` | agent-X dir intacto |
| Catalog templates | clonado verbatim + 1 swap (saludo) via INSERT...SELECT con CASE | godentist catalog intacto |
| State machine | clonado verbatim | igual |
| Comprehension model | igual (Haiku) | igual |
| Comprehension prompt | clonado + 1-2 ejemplos extra para nueva intencion | igual |
| Sales-track | clonado + hook lead-capture (si aplica) | igual |
| Response-track | clonado + 1 cambio: TEMPLATE_LOOKUP_AGENT_ID al sibling | igual |
| Helper nuevo | `lead-capture.ts` (~30 LOC, puro testeable) | -- |
| Tests | 6 archivos en `__tests__/` (transitions/comprehension/response/sales/lead-capture/agent) | godentist sin tests (intact) |

### 5 sitios de registracion

Cada sibling DEBE registrarse en estos 5 sitios para ser funcional end-to-end:

1. **AgentRegistry** (self-register on import via `agentRegistry.register(config)` en `index.ts`).
2. **AGENT_CATALOG** (entry en `src/lib/agents/agent-catalog.ts` para dropdown UI del routing-editor).
3. **webhook-processor pre-warm** (`Promise.all([... import('../<sibling>')])` linea ~225-232 — anti-Pitfall 2 / B-001 cold-lambda race).
4. **webhook-processor dispatch branch** (`else if (agentId === '<sibling>')` linea ~765 — paralelo al branch godentist).
5. **V3ProductionRunner** (`engine/types.ts` union extension + `v3-production-runner.ts` agentModule branch + side-effects extensions como VAL tag check linea 597).

Sitio adicional **6 (UI)**: `src/app/(dashboard)/agentes/routing/editor/page.tsx` lineas 25-30 (side-effect import — el editor usa `agentRegistry.list()` directo, asi que basta con que el modulo se importe).

### 8 Pitfalls cubiertos en este standalone

| # | Pitfall | Severidad | Cubertura en este standalone |
|---|---------|-----------|------------------------------|
| 1 | Catalogo compartido entre siblings (cdc06d9 regression) | ALTA | Anti-regresion grep + test obligatorio en response-track.test.ts; D-08 catalog independiente |
| 2 | Cold-lambda race (B-001) | ALTA | Pre-warm import en webhook-processor:225-232; grep verification (>=2 imports) |
| 3 | Workspace mismatch en routing rule | MEDIA | SQL pre-formado en agent-scope.md con workspace_id literal; documentacion explicita |
| 4 | Routing priority collision | BAJA | SQL pre-check en agent-scope.md (SELECT priorities WHERE active=true) |
| 5 | Lead-capture turn detection off-by-one | MEDIA | Helper puro con comentario explicito + Plan 06 boundary tests turnCount=0/1/2 |
| 6 | VAL tag side-effect omitido para sibling | MEDIA | Extension de check en v3-production-runner:597 + grep verification |
| 7 | Conversacion FB/IG sin canal seteado | BAJA | Pre-deploy SQL check Q-B + fail-safe del fact (retorna null cuando channel=NULL) |
| 8 | VS Code/git case sensitivity | BAJA | Casing locked en CONTEXT.md D-03 (`godentist-fb-ig` lowercase) |

### Activacion: Routing Rule Sin Feature Flag (D-14, D-15)

Este pattern usa el ROUTING ENGINE como CONTROL POINT en lugar de feature flag — Regla 6 satisfecha sin ceremonia de flag adicional:

- **Sin regla en `routing_rules` mencionando el sibling = sin trafico = aislamiento total.**
- El agente original (godentist) sigue siendo el default mientras el sibling no tenga regla activa.
- El operador crea la regla manualmente en `/agentes/routing/editor` cuando decide activar.
- Para rollback rapido: `UPDATE routing_rules SET enabled=false WHERE name='<rule name>'` — efecto inmediato (siguiente lambda invocation lee la regla disabled).

### Patron validado vs alternativas descartadas

| Alternativa considerada | Por que descartada |
|------------------------|---------------------|
| Refactorizar godentist para parametrizar `agent_id` + saludo | Modifica produccion (Regla 6 violation) — refactor introduce riesgo de regresion sobre agente activo |
| Compartir catalog entre godentist y sibling con WHERE workspace_id filter | Pitfall 1 documentado (regresion cdc06d9) — siempre clonar catalog independiente |
| Crear feature flag `enable_godentist_fb_ig` | D-14 descarta por ceremonia inutil — el routing engine ES el control point |
| Insertar la routing rule en la migration | D-15 descarta — el operador escoge priority libre evitando colision (Pitfall 4) |
| Migracion explicita ~75 INSERTs | INSERT...SELECT con CASE es mas DRY (50 LOC vs 300) y auto-sincronizado |

---

## Retrospectiva del proceso (proceso GSD)

### Que funciono bien

1. **Wave 0 audit (Plan 01)** resolvio las 3 Open Questions ANTES de tocar codigo. Ahorro horas de debug en Waves 1+. Patron a repetir.
2. **Plans 02 + 03 paralelos** (skeleton verbatim + adapted files) sin conflicto de files_modified. Buen ejemplo de paralelizacion correcta.
3. **Plan 04 lead-capture como helper puro** separado: testeable independientemente, sin acoplar al sales-track. Pattern valido para futuros agents.
4. **Plan 06 anti-regresion D-08 explicita** en response-track.test.ts: `expect(callArgs[0]).not.toBe('godentist')`. Blindaje contra Pitfall 1 que SOLO se descubre con esta assercion exacta.
5. **Regla 5 BLOCKING (Plan 07)**: PAUSE pre-push obligatorio prevenir el caso `templates_not_found_in_catalog` graceful degradation que confundiria debugging.

### Que se podria mejorar para futuros standalones

1. **Tests del godentist original deberian existir** — actualmente godentist no tiene `__tests__/`. El sibling es el primer agent del subsistema con cobertura. Considerar standalone separado para agregar tests retroactivos al godentist (no urgente — el sibling cubre regression con anti-D-08 grep).
2. **comprehension prompt cambios documentar como `prompt_diff.md`** — futuros siblings que cambien prompt deberian guardar el diff exacto en un archivo aparte para auditoria.
3. **Smoke 1 dropdown automatizado** — actualmente requiere usuario inspecciona browser. Considerar Playwright test que valide el dropdown sin intervencion manual (cost-benefit en futuros siblings).

### Anomalias documentadas durante el deploy

- (Plan 09 update con anomalias del execute-phase reales — pegar aqui)

---

## Referencias

- Standalone padre: `.planning/standalone/agent-godentist-fb-ig/CONTEXT.md` + `RESEARCH.md`
- Pattern padre: `.planning/standalone/somnio-sales-v3-pw-confirmation/`
- Fact `channel` shipped: `.planning/standalone/routing-channel-fact/`
- Spec del agente: `src/lib/agent-specs/godentist-fb-ig.md`
- Scope rules: `.claude/rules/agent-scope.md` §Godentist FB/IG Sibling Agent
- Migration: `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql`

## Para futuros siblings (template)

Cuando crear un sibling nuevo (E.g., `somnio-fb-ig`):

1. **Copiar este LEARNINGS como base** — las decisiones D-01..D-20 y los 8 pitfalls aplican igual.
2. **Wave 0 audit obligatoria** — resolver Q1/Q2/Q3 equivalentes (consume catalog source / content_types safe / robot/external workspace mapping).
3. **5 sitios de registracion + sitio 6 (UI)** — patron ya validado.
4. **Anti-regresion D-08 explicita en response-track.test.ts** — tests SIN esto pasan falsamente.
5. **Lead-capture (si aplica) como helper puro** — Pitfall 5 cubierta solo si tests boundary turnCount=0/1/2 estan presentes.
6. **VAL tag side-effect (o equivalente)** — Pitfall 6: extender el check del runner si el side-effect es agent-specific.
7. **Regla 5 BLOCKING** — SQL apply pre-push obligatorio.
```

**Paso 2 — Commit:**

```bash
git add .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md
git commit -m "docs(agent-godentist-fb-ig): LEARNINGS.md — D-20 reusable pattern + 8 pitfalls + retrospectiva (Wave 7 Plan 09 Task 2)"
```

NO push todavia.
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>grep -q "D-20 Reusable Pattern" .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>grep -q "agente sibling para canal alterno" .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>grep -q "5 sitios de registracion" .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>grep -q "8 Pitfalls cubiertos" .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>grep -q "Anti-regresion D-08" .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>grep -q "Para futuros siblings" .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig): LEARNINGS.md"</automated>
  </verify>
  <acceptance_criteria>
    - `LEARNINGS.md` contiene seccion D-20 Reusable Pattern + 8 pitfalls + 5 sitios de registracion + retrospectiva.
    - Documenta cuando aplicar el pattern + anatomia + activacion sin feature flag.
    - Lista alternativas descartadas con razon.
    - Template "Para futuros siblings" con 7 pasos accionables.
    - Commit atomico exacto. NO push todavia.
  </acceptance_criteria>
  <done>
    - LEARNINGS.md ready como template reusable para futuros standalones (somnio-fb-ig, etc).
    - D-20 obligatorio cumplido.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Actualizar MEMORY.md + push collective final</name>
  <read_first>
    - $HOME/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/MEMORY.md (file completo — buscar lista de standalones shipped)
    - .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md (creado en Task 2)
  </read_first>
  <action>
**Paso 1 — Editar `MEMORY.md` (auto-memory):**

Agregar una entry al final de la seccion "Current State" similar al patron de los standalones recientes:

```markdown
- [Agent GoDentist FB/IG sibling shipped 2026-XX-XX](agent_godentist_fb_ig.md) — Standalone shipped (commits `<old-sha>..<new-sha>`). Sibling de godentist para FB Messenger / Instagram Direct workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`. Saludo D-05 lead-capture (nombre+celular upfront + Habeas Data inline). Lead capture turn 1 (D-09 helper puro). Catalog independiente (~75 templates clonados con saludo distinto). Activacion 100% via routing rule manual del usuario (D-15 sin feature flag). 6 test suites + 12 grep verifications + smoke 1 (dropdown) PASS. Smoke 2/3 (E2E con mensajes reales FB/IG) deferidos al usuario. Primer caso de uso real del fact `channel` shipped 2026-05-04 (D-20 reusable pattern). Standalone path: `.planning/standalone/agent-godentist-fb-ig/`.
```

NOTA: el archivo `agent_godentist_fb_ig.md` referenciado puede no existir todavia — es el patron de auto-memory donde futuros mantenedores podrian profundizar. NO crearlo en este plan (out of scope); solo documentar el shipped status en la entry principal.

**Paso 2 — Commit + push collective final:**

```bash
git add /home/jose147/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/MEMORY.md 2>/dev/null || echo "MEMORY.md path may differ — adjust"
# Si la ruta no es addable desde el repo (e.g., en home dir), commit solo desde el repo:
git add .planning/standalone/agent-godentist-fb-ig/
git commit -m "docs(agent-godentist-fb-ig): MEMORY update + standalone closing (Wave 7 Plan 09 Task 3)"
```

```bash
git push origin main
```

**Paso 3 — Verificar push:**

```bash
git log --oneline origin/main..HEAD
# Esperado: 0 lineas (todo pusheado).

git log --oneline -5
```

**Paso 4 — Mensaje final al usuario:**

Resumir el shipped status al usuario:
- Standalone agent-godentist-fb-ig SHIPPED.
- Sibling code deployed en Vercel.
- Migration aplicada en produccion.
- Tests pasan.
- Smoke 1 dropdown PASS.
- Anti-regresion godentist (D-04) intact.
- Para activar: usuario crea routing rule manual via `/agentes/routing/editor` con SQL pre-formado en `agent-scope.md` (Pitfall 3 + 4 mitigated).
- Smoke 2/3 (E2E con mensajes reales FB/IG) DEFERIDOS al usuario para hacerlos cuando active.
  </action>
  <verify>
    <automated>git log -1 --format=%s | grep -qF "docs(agent-godentist-fb-ig)"</automated>
    <automated>git log --oneline origin/main..HEAD | wc -l | awk '$1 == 0 { exit 0 } { exit 1 }'</automated>
  </verify>
  <acceptance_criteria>
    - MEMORY.md (si accesible) actualizado con entry del shipped standalone.
    - Push final exitoso a origin main.
    - `git log origin/main..HEAD` retorna 0 commits pendientes.
    - Mensaje final al usuario con resumen del shipped status + accion pendiente del operador (routing rule manual).
  </acceptance_criteria>
  <done>
    - Standalone agent-godentist-fb-ig SHIPPED. Listo para activacion del usuario.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Verification commands → codebase + DB | Solo grep/SELECT/SELECT — sin side-effects |
| LEARNINGS.md → public docs | D-20 reusable pattern para futuros standalones; sin secrets |
| MEMORY.md → user's auto-memory | Escritura local del shipped status |
| Final push → origin main | Doc + memory entry; sin codigo nuevo (codigo ya pusheado en Plan 08) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-09-01 | Repudiation | Sin auditoria del shipping | mitigate | VERIFICATION.md + LEARNINGS.md + MEMORY.md + git log linkedos |
| T-gfb-09-02 | Information Disclosure | Smoke 2/3 deferidos podrian no correrse | accept | D-18 explicito; el riesgo es del operador; el codigo + DB estan validados independientemente |
| T-gfb-09-03 | Denial of Service | Smoke 1 dropdown depende de Vercel deploy ready | accept | Plan 08 ya verifico Vercel ready; smoke 1 confirma post-deploy |
</threat_model>

<verification>
- 2 archivos creados:
  - `.planning/standalone/agent-godentist-fb-ig/VERIFICATION.md` (12 grep checks + 2 smokes)
  - `.planning/standalone/agent-godentist-fb-ig/LEARNINGS.md` (D-20 pattern + 8 pitfalls + retro)
- MEMORY.md actualizado con shipped entry (si path accesible).
- Decision agregada en VERIFICATION.md = GO.
- Final push a origin main exitoso.
- `git log origin/main..HEAD` = 0 commits pendientes.
</verification>

<success_criteria>
- Standalone SHIPPED. El usuario puede activar el sibling cuando quiera via routing rule manual.
- Anti-regresion godentist (D-04) confirmada: 0 archivos del godentist original modificados.
- 12 verifications + 2 smoke tests automatizables PASS.
- D-20 reusable pattern documentado para futuros standalones.
- Pattern reusable confirmado: el siguiente sibling (e.g., somnio-fb-ig) puede usar este standalone como template.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/09-SUMMARY.md` documenting:
- Commit hashes de Tasks 1, 2, 3.
- Resumen de las 12 verifications + smoke 1 + smoke 4 (PASS / FAIL count).
- Smoke 2/3 explicitly deferidos al usuario.
- Link a LEARNINGS.md D-20 pattern.
- Status final: standalone SHIPPED. Pendiente: usuario activa routing rule.
- Lista de accion items futuros (deferred):
  - Smoke 2 + 3 (E2E manual) cuando el usuario active.
  - Splitear godentist-fb-ig en godentist-fb + godentist-ig si comportamientos divergen (D-deferred).
  - Pattern reusable para somnio-fb-ig si se decide aplicar lead-capture a Somnio.
  - Dashboard comparativa godentist vs godentist-fb-ig (deferred futures).
</output>
