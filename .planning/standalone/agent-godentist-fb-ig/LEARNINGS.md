# LEARNINGS — agent-godentist-fb-ig

**Standalone:** agent-godentist-fb-ig
**Shipped:** 2026-05-05
**Habilitado por:** standalone `routing-channel-fact` (shipped 2026-05-04, commit `c410085`)
**Pattern padre:** `somnio-sales-v3-pw-confirmation` (shipped 2026-04-28)
**Final HEAD at ship:** `7d5505a` on `main` (= `origin/main`)

---

## D-20 Reusable Pattern: Agente Sibling para Canal Alterno

Este standalone es el **primer caso de uso real del fact `channel`** (shipped 2026-05-04). Documentamos el pattern como template reusable para futuros standalones que necesiten diferenciar comportamiento de un agente segun el canal de entrada (FB/IG vs WhatsApp vs web chat, etc).

### Cuando aplicar este pattern

Aplicar cuando se cumplen TODAS estas condiciones:

1. **Existe un agente productivo (e.g., godentist) que atiende un canal default (e.g., WhatsApp).**
2. **Se requiere diferenciar saludo o comportamiento del primer turno para un canal alterno (e.g., FB/IG).**
3. **El resto del pipeline (state machine, intents, comprehension model) es identico o casi identico.**
4. **El catalog de templates puede clonarse del agente original con UNA modificacion (saludo o un par de templates).**
5. **Se quiere preservar al agente original SIN modificar (Regla 6 obliga este aislamiento).**

Si alguna de estas condiciones no se cumple, considerar alternativas:
- Si el pipeline diverge mucho → standalone "agente nuevo" en lugar de sibling.
- Si solo cambia 1 template y la diferenciación puede ser por workspace_id (no por agent_id) → considerar `agent_templates.workspace_id IS NOT NULL` override (no aplica a este caso porque el catalog de godentist es global con `workspace_id IS NULL`).
- Si el cambio es comportamental sin saludo distinto → considerar feature flag dentro del agente original (NO recomendado si modifica producción — Regla 6).

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
| Response-track | clonado + 1 cambio crítico: TEMPLATE_LOOKUP_AGENT_ID al sibling | igual |
| Helper nuevo | `lead-capture.ts` (~30 LOC, puro testeable) | -- |
| Tests | 6 archivos en `__tests__/` (transitions/comprehension/response/sales/lead-capture/agent) | godentist sin tests (intact) |

### Receta paso-a-paso (recipe future siblings can follow)

Cuando crear un sibling nuevo (e.g., `somnio-fb-ig`):

#### Wave 0 — Audit produccion (Plan 01)

1. **Q-A row count baseline:** `SELECT COUNT(*) FROM agent_templates WHERE agent_id='<original>' AND workspace_id IS NULL`. Define el target de la migration.
2. **Q-B canal poblado:** `SELECT DISTINCT channel FROM conversations WHERE workspace_id='<target>' LIMIT 5` — confirmar que el routing-channel-fact ya está produciendo `channel` con el valor esperado para ese workspace.
3. **Q-C content_types safe:** `SELECT DISTINCT content_type FROM agent_templates WHERE agent_id='<original>'` — verificar si hay rows `imagen`/`video` que requerirían soporte adicional para FB/IG (Meta tiene restricciones distintas que WhatsApp).
4. **Q-D priorities:** `SELECT priority, name FROM routing_rules WHERE workspace_id='<target>' AND active=true ORDER BY priority` — pre-validar que existe gap libre para la nueva regla del sibling (Pitfall 4).

Documentar resultados en `01-SNAPSHOT.md` con verdict GO/NO-GO por columna. Ahorra horas de debug en Waves 1+.

#### Wave 1 — Verbatim clone + adapted files (Plans 02-03)

- **Plan 02 (verbatim):** copiar `types.ts`, `comprehension-schema.ts`, `guards.ts`, `phase.ts`, `constants.ts`, `state.ts`, `transitions.ts`, `dentos-availability.ts` (o equivalente) literalmente — sin cambios.
- **Plan 03 (adapted):**
  - `config.ts`: cambiar `<ORIGINAL>_AGENT_ID = '<original>'` → `<SIBLING>_AGENT_ID = '<sibling>'`. Crear `<sibling>Config` análogo al original.
  - `index.ts`: self-register `agentRegistry.register(<sibling>Config)`.
  - `comprehension-prompt.ts`: clonar + agregar 1-2 ejemplos para casos nuevos del flujo (e.g., lead-capture turn 1 con datos parciales).
  - `comprehension.ts`: rename log prefix + observability event names (e.g., `[Comprehension-gd]` → `[Comprehension-gd]` o similar — pueden quedar igual si son agnósticos al agent).
  - `response-track.ts`: **CRITICAL** cambiar `TEMPLATE_LOOKUP_AGENT_ID = '<sibling>'` literal (anti-Pitfall 1).
  - `<sibling>-agent.ts`: clonar `processMessage` con `agent: '<sibling>'` en observability events.

#### Wave 2 — Lead-capture helper + sales-track integration (Plan 04)

- `lead-capture.ts`: helper PURO (sin DB, sin side effects) que recibe slots + turnCount y retorna `{ shouldCapture, missing, action }`. ~30 LOC.
- `sales-track.ts`: clonar + integrar el hook al inicio del resolver (turn 1 trigger).
- Tests para lead-capture deben cubrir boundary turnCount=0/1/2 (Pitfall 5).

#### Wave 3 — Register en 5 sitios (Plan 05)

Cada sibling DEBE registrarse en estos 5 sitios para ser funcional end-to-end. Si falta cualquiera, el agente NO funciona end-to-end:

1. **AgentRegistry** (self-register on import via `agentRegistry.register(config)` en `index.ts` del sibling).
2. **AGENT_CATALOG** (entry en `src/lib/agents/agent-catalog.ts` con `id`, `name`, `description` para dropdown UI del routing-editor).
3. **webhook-processor pre-warm** (`Promise.all([... import('../<sibling>')])` linea ~225-232 — anti-Pitfall 2 / B-001 cold-lambda race).
4. **webhook-processor dispatch branch** (`else if (agentId === '<sibling>')` linea ~765 — paralelo al branch original).
5. **V3ProductionRunner** (`engine/types.ts` union extension + `v3-production-runner.ts` agentModule branch + side-effects extensions como VAL tag check linea 597).

**Sitio adicional 6 (UI):** `src/app/(dashboard)/agentes/routing/editor/page.tsx` lineas ~25-30 (side-effect import — el editor usa `agentRegistry.list()` directo, asi que basta con que el modulo se importe en el bundle del client).

**Verificación de los 5 sitios via grep (anti-Pitfall 2/6/etc.):**
```bash
grep -c "agentRegistry.register" src/lib/agents/<sibling>/index.ts                             # = 1
grep -c "id: '<sibling>'" src/lib/agents/agent-catalog.ts                                       # = 1
grep -c "import('../<sibling>')" src/lib/agents/production/webhook-processor.ts                # >= 2
grep -c "<sibling>" src/lib/agents/engine/types.ts                                              # >= 1
grep -cE "agentModule !== '<original>' && (this\.config\.)?agentModule !== '<sibling>'" src/lib/agents/engine/v3-production-runner.ts  # = 1
```

#### Wave 4 — Test suite (Plan 06)

6 archivos de tests en `src/lib/agents/<sibling>/__tests__/`:

1. `transitions.test.ts` — state machine valido (clonar shape del original + agregar test específico para `nuevo → captura` cuando turn 1 trae datos).
2. `comprehension.test.ts` — clasificación correcta de los 23 intents + casos lead-capture (e.g., `"Juan Pérez, 3001234567"` → intent=`datos`, slots con nombre+telefono).
3. `response-track.test.ts` — saludo D-05 verbatim en turn 0 + selección de `pedir_datos_parcial` cuando datos parciales. **CRITICAL: incluir aserción anti-regresión `expect(callArgs[0]).not.toBe('<original>')` para asegurar TEMPLATE_LOOKUP_AGENT_ID es el del sibling (Pitfall 1).**
4. `sales-track.test.ts` — D-09 parser + cálculo de campos faltantes.
5. `lead-capture.test.ts` — helper puro testeable independiente.
6. `<sibling>-agent.test.ts` — E2E pipeline: mensaje → comprehension → sales track → response track → output con `pedir_datos_parcial` + `{{campos_faltantes}}` correctos.

**Cobertura objetivo:** 6 suites + ≥50 tests passing. Este standalone shipped con 6 suites + 93 tests.

#### Wave 5 — Migration SQL apply (Plan 07) — Regla 5 BLOCKING

- Crear archivo SQL en `supabase/migrations/<timestamp>_<sibling>_template_catalog.sql` con `INSERT...SELECT` + `CASE WHEN intent='saludo' AND priority='CORE' THEN <new D-05 text> ELSE content END`.
- Idempotencia: `DELETE FROM agent_templates WHERE agent_id='<sibling>'` antes del INSERT (mismo patrón que `20260318100000_godentist_templates.sql`).
- **PAUSAR pre-push (checkpoint:human-action):** pedir al usuario aplicar la migración en producción ANTES del push del código del sibling. Sin templates en DB, el sibling registrado retornaría empty selection y no respondería = `templates_not_found_in_catalog` graceful degradation que confunde debugging. **REGLA 5 BLOCKING.**
- Verificar post-apply (3 SQL checks): row count match (Q-A baseline), saludo verbatim contiene `goBot`+`Habeas Data`+`Ley 1581`, `godentist_count = sibling_count`.
- Documentar outputs en `07-APPLY-EVIDENCE.md`.

#### Wave 6 — Docs + push collective (Plan 08)

4 archivos a actualizar/crear (Regla 4):

1. **`src/lib/agent-specs/<sibling>.md`** (nuevo) — spec completo siguiendo patrón `godentist.md` / `somnio-sales-v3.md`. Secciones: Quick reference (tabla), PUEDE, NO PUEDE, Validacion (gates verificables con grep), Consumidores, Integraciones, Activacion (D-15 SQL pre-formado para operador), Anti-patterns documentados.
2. **`.claude/rules/agent-scope.md`** — agregar sección `### <Sibling> Agent (<sibling> — <channel> inbound)` con scope explícito + workspace UUID literal + SQL pre-formado para routing rule.
3. **`docs/architecture/06-agent-lifecycle-router.md`** — sección "Caso de uso: agente sibling por canal alterno" mencionando este standalone como ejemplo del fact `channel`.
4. **`docs/analysis/04-estado-actual-plataforma.md`** — agregar entry del sibling al overview de agentes con status (shipped, sin tráfico hasta routing rule manual).

Push collective `git push origin main` (Regla 1) → Vercel auto-deploy → user-verify Smoke 1 (dropdown) + anti-regresion estructural.

#### Wave 7 — Verification + LEARNINGS + final push (Plan 09)

- `09-VERIFICATION.md` — 12 grep checks + Smoke 1 + Smoke 4 (anti-regresion godentist).
- `LEARNINGS.md` — D-20 reusable pattern (este documento).
- `09-ROUTING-RULE-USER-ACTION.md` — SQL pre-formado para que el usuario active el sibling cuando decida.
- `09-SUMMARY.md` — phase-level wrap-up.
- Final commit + push.

### 8 Pitfalls cubiertos en este standalone

| # | Pitfall | Severidad | Cubertura en este standalone |
|---|---------|-----------|------------------------------|
| 1 | Catalogo compartido entre siblings (regresión `cdc06d9`) | ALTA | `TEMPLATE_LOOKUP_AGENT_ID = 'godentist-fb-ig'` literal en `response-track.ts`; anti-regresión grep + test obligatorio en `response-track.test.ts` (`expect(callArgs[0]).not.toBe('godentist')`); D-08 catalog independiente con migration INSERTs propios. **Verificación V4** = 0 matches. |
| 2 | Cold-lambda race (B-001) | ALTA | Pre-warm import en `webhook-processor.ts` lineas ~225-232 (`Promise.all([... import('../godentist-fb-ig')])`). **Verificación V6** = 2 matches (pre-warm + dispatch). |
| 3 | Workspace mismatch en routing rule | MEDIA | SQL pre-formado en `agent-scope.md` con workspace_id literal `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`; Plan 09 también provee SQL en `09-ROUTING-RULE-USER-ACTION.md`. |
| 4 | Routing priority collision | BAJA | Plan 01 audit Q-D pre-validó que workspace tiene 0 rules activas → priority 100 recomendado libre. SQL pre-formado incluye comentario `SELECT priority FROM routing_rules WHERE workspace_id='...' AND active=true` para futuros casos donde sí haya rules. |
| 5 | Lead-capture turn detection off-by-one | MEDIA | `lead-capture.ts` helper PURO con comentario explícito sobre turnCount semantics + Plan 06 boundary tests turnCount=0/1/2. **Verificación V2** = 16 lead-capture tests pass. |
| 6 | VAL tag side-effect omitido para sibling | MEDIA | Extension de check en `v3-production-runner.ts:597` con compound `agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'`. **Verificación V9** = 1 match. Sin esto, leads FB/IG no contarían en metricas dashboard (silent break). |
| 7 | Conversacion FB/IG sin canal seteado | BAJA | Pre-deploy SQL check Q-B confirmó que `channel` se está poblando para conversaciones FB/IG en el workspace target. Fail-safe del fact (retorna `null` cuando channel=NULL) protege contra rules estrechas. |
| 8 | VS Code/git case sensitivity | BAJA | Casing locked en `CONTEXT.md` D-03 (`godentist-fb-ig` lowercase, sin variantes `GoDentist-FB-IG`). Todos los grep gates usan literal lowercase. |

### Activacion: Routing Rule Sin Feature Flag (D-14, D-15)

Este pattern usa el ROUTING ENGINE como CONTROL POINT en lugar de feature flag — Regla 6 satisfecha sin ceremonia de flag adicional:

- **Sin regla en `routing_rules` mencionando el sibling = sin trafico = aislamiento total.**
- El agente original (godentist) sigue siendo el default mientras el sibling no tenga regla activa.
- El operador crea la regla manualmente en `/agentes/routing/editor` cuando decide activar (D-15 — control humano + permite escoger priority libre evitando colisión Pitfall 4).
- Para rollback rápido: `UPDATE routing_rules SET active=false WHERE workspace_id='...' AND event->>'params'->>'agent_id'='godentist-fb-ig'` — efecto inmediato (siguiente lambda invocation lee la regla disabled).

### Patron validado vs alternativas descartadas

| Alternativa considerada | Por que descartada |
|------------------------|---------------------|
| Refactorizar godentist para parametrizar `agent_id` + saludo | Modifica produccion (Regla 6 violation). Refactor introduce riesgo de regresion sobre agente activo que ya atiende clientes reales. |
| Compartir catalog entre godentist y sibling con WHERE workspace_id filter | Pitfall 1 documentado (regresion `cdc06d9` revertida en somnio-recompra). Siempre clonar catalog independiente con `agent_id` distinto. |
| Crear feature flag `enable_godentist_fb_ig` | D-14 descarta por ceremonia inutil — el routing engine ES el control point natural. Agregar flag duplica el control. |
| Insertar la routing rule en la migration | D-15 descarta — el operador escoge priority libre evitando colisión (Pitfall 4) y mantiene control humano sobre activación. |
| Migracion explicita ~75 INSERTs verbatim | INSERT...SELECT con CASE es más DRY (50 LOC vs 300) y auto-sincronizado: si el catalog original gana templates, una re-aplicación de la migración los recoge. |
| Splitear desde el inicio en `godentist-fb` + `godentist-ig` | D-deferred — hoy el comportamiento esperado es idéntico para FB e IG. Si en el futuro divergen, splitear es otro standalone trivial (clonar este sibling con un cambio de scope). |

---

## Retrospectiva del proceso (proceso GSD)

### Que funciono bien

1. **Wave 0 audit (Plan 01)** resolvio las 3 Open Questions ANTES de tocar codigo:
   - Q-A: row count baseline (79 templates en godentist).
   - Q-B: canal poblado correctamente para el workspace target.
   - Q-C: content_types safe (sin rows imagen/video que requerirían soporte adicional Meta).
   - Q-D: priority slot libre (workspace target con 0 rules activas, gap libre).
   - Patrón a repetir en futuros siblings — ahorra horas de debug en Waves 1+.

2. **Plans 02 + 03 paralelos** (skeleton verbatim + adapted files) sin conflicto de `files_modified`. Buen ejemplo de paralelizacion correcta cuando el grafo de dependencias lo permite.

3. **Plan 04 lead-capture como helper puro** separado: testeable independientemente (16 tests boundary turnCount=0/1/2), sin acoplar al sales-track. Pattern valido para futuros agents donde la lógica del primer turno necesite ser distinta.

4. **Plan 06 anti-regresion D-08 explicita** en `response-track.test.ts`: `expect(callArgs[0]).not.toBe('godentist')`. Blindaje contra Pitfall 1 que SOLO se descubre con esta assercion exacta. Tests sin esta línea pasan falsamente (el código compila pero TEMPLATE_LOOKUP_AGENT_ID puede haber quedado apuntando al original por copy-paste descuidado).

5. **Regla 5 BLOCKING (Plan 07)**: PAUSE pre-push obligatorio prevenir el caso `templates_not_found_in_catalog` graceful degradation que confundiria debugging si el código aterrizara antes del SQL. Pattern bien establecido tras el incidente de 20h de mensajes perdidos (commit `e9...` 2026-04-XX).

6. **Plan 08 docs collective antes del push** garantizó que la documentación llega a `origin/main` en el mismo HEAD que el código. Sin gap entre código deployado y docs actualizadas (Regla 4).

7. **Plan 09 verification automatizable separado** del manual user-action. 14 gates automatables PASS en CI o local; Smoke 2/3 deferidos al usuario sin bloquear el ship.

### Que se podria mejorar para futuros standalones

1. **Tests del godentist original deberian existir** — actualmente godentist no tiene `__tests__/`. El sibling es el primer agent del subsistema con cobertura. Considerar standalone separado para agregar tests retroactivos al godentist (no urgente — el sibling cubre regression con anti-D-08 grep). Si el godentist refactorea en el futuro, sin tests es difícil garantizar que el sibling no quede desincronizado.

2. **comprehension prompt cambios documentar como `prompt_diff.md`** — futuros siblings que cambien prompt deberían guardar el diff exacto en un archivo aparte (`prompt-diff.md` en el standalone) para auditoría. Esto facilita revisar qué cambió respecto al original sin tener que diffear los archivos completos.

3. **Smoke 1 dropdown automatizado** — actualmente requiere usuario inspeccionar browser. Considerar Playwright test que valide el dropdown sin intervención manual (cost-benefit en futuros siblings — vale la pena si esperamos ≥3 siblings adicionales).

4. **Verificación 1 (tsc) tiene errores out-of-scope del routing-channel-fact** — los tests de `conversations.test.ts` tienen 2 errores TS7022/TS7024 que NO son del sibling pero contaminan la salida. Considerar separación de scopes o tipear esos mocks correctamente en un cleanup standalone aparte.

5. **El push collective de Plan 08 pudo haber separado mejor el commit metadata** — los 3 commits (spec, scope rules, arch docs) se podrían haber agrupado en un solo PR/commit chain pero quedaron como 3 separados. Para futuros siblings, considerar si la atomicidad por archivo vale más que un commit unificado de docs.

### Anomalias documentadas durante el deploy

- **Anti-regression godentist gate (Plan 08 gate 3) — user reply "si supongo":** el usuario aceptó el gate por argumento estructural en lugar de verificación explícita. Razonamiento: como el código nunca tocó `src/lib/agents/godentist/**` (verificable post-hoc via `git diff`), regresión es estructuralmente imposible. Plan 09 Smoke 4 reverificó con `git diff` empty del lineage completo. Patron válido cuando el aislamiento es por construcción, no requiere ceremony adicional.

- **Routing tests solo 9 archivos / 98 tests:** vs sibling 6 archivos / 93 tests — la cobertura del routing engine es ligeramente mayor que la del sibling, pero el sibling cubre 100% de su superficie nueva. Métrica a vigilar en futuros siblings: ratio tests / SLOC.

---

## Referencias

- **Standalone padre:** `.planning/standalone/agent-godentist-fb-ig/CONTEXT.md` + `RESEARCH.md`
- **Pattern padre (sibling sin canal):** `.planning/standalone/somnio-sales-v3-pw-confirmation/`
- **Fact `channel` shipped:** `.planning/standalone/routing-channel-fact/`
- **Spec del agente:** `src/lib/agent-specs/godentist-fb-ig.md`
- **Scope rules:** `.claude/rules/agent-scope.md` §Godentist FB/IG Sibling Agent
- **Migration:** `supabase/migrations/20260505000000_godentist_fb_ig_template_catalog.sql` (commit `ba4b300`)
- **Pre-formed routing rule SQL:** `.planning/standalone/agent-godentist-fb-ig/09-ROUTING-RULE-USER-ACTION.md`

## Para futuros siblings (template)

Cuando crear un sibling nuevo (e.g., `somnio-fb-ig`):

1. **Copiar este LEARNINGS como base** — las decisiones D-01..D-20 y los 8 pitfalls aplican igual con cambio de scope.
2. **Wave 0 audit obligatoria** — resolver Q-A/Q-B/Q-C/Q-D equivalentes (consume catalog source / channel populated / content_types safe / priorities free).
3. **5 sitios de registracion + sitio 6 (UI)** — pattern ya validado.
4. **Anti-regresion D-08 explicita en `response-track.test.ts`** — tests SIN esta línea pasan falsamente.
5. **Lead-capture (si aplica) como helper puro** — Pitfall 5 cubierta solo si tests boundary turnCount=0/1/2 estan presentes.
6. **VAL tag side-effect (o equivalente)** — Pitfall 6: extender el check del runner si el side-effect es agent-specific.
7. **Regla 5 BLOCKING** — SQL apply pre-push obligatorio con verificación 3-checks pre-confirmar al usuario.
8. **Final push después de Smoke 1 dropdown** — verifica el cierre end-to-end UI antes de producir LEARNINGS.
9. **Smoke 2/3 deferidos al usuario (D-18)** — el equipo de engineering NO mantiene scripts contra Meta APIs (costo + flakiness).
10. **Documenter el patrón nuevo en este LEARNINGS** — D-20 obliga a que cada sibling actualice este documento si descubre lecciones nuevas no cubiertas aquí.

---

*Authored: 2026-05-05*
*Wave 7 Plan 09 Task 2 — D-20 reusable pattern*
*Standalone agent-godentist-fb-ig SHIPPED*
