---
standalone: somnio-sales-v4
status: discuss-complete
created: 2026-05-01
phase_type: new-agent
agent_id: somnio-sales-v4
workspace: Somnio (a3843b3f-c337-4836-92b5-89c58bb98490)
upstream_agent: somnio-sales-v3 (normal, NOT pw-confirmation)
related_agents: somnio-sales-v3, somnio-recompra-v1, somnio-sales-v3-pw-confirmation
---

# Standalone: somnio-sales-v4

## Goal

Construir v4 partiendo de `somnio-sales-v3` normal (no pw-confirmation) como **agente conversacional híbrido**: state machine determinista en happy path + sub-loop AI SDK que escala bajo triggers específicos (CRM mutations, low-confidence, CAS reject, intents ambiguos). Reemplaza el mecanismo actual de creación de pedido (`adapters.orders.createOrder` deferido) por `crm-mutation-tools` directo, agrega `crm-query-tools` para lectura, y construye un loop de aprendizaje continuo (knowledge base curada + `agent_unknown_cases` + UI promoción) desde día 1.

v4 NO toca v3 productivo. Se construye en paralelo, sin tráfico hasta activación manual via routing rule (Regla 6 satisfecha sin feature flag — patrón verificado de pw-confirmation).

## Phase Boundary

- **In scope:** Nuevo agente `somnio-sales-v4` con código independiente bajo `src/lib/agents/somnio-v4/`, schema DB para knowledge base + unknown_cases + platform_config keys, sub-loop low-confidence + CRM mutations + CAS reject, integración con `crm-query-tools` y `crm-mutation-tools` shared modules, UI de promoción de unknown cases, script SQL de clonación de templates, script de flip atómico (close v3 sessions + insert routing rule).
- **Out of scope:** Modificar v3 código en cualquier forma (Regla 6 estricta), tocar pw-confirmation, cleanup/deprecation de v3 (será standalone futuro `somnio-sales-v3-deprecation`), SLA monitoring de handoffs (standalone futuro), aplicación de v4 a workspaces no-Somnio.

## Decisiones lockeadas (D-01..D-79)

### Arquitectura general

#### D-01: Arquitectura híbrida (Opción C)
State machine determinista en happy path + sub-loop AI SDK que escala bajo triggers específicos. NO es full AI SDK loop (Opción A) ni pure state machine (Opción B). Razón: Somnio funnel tiene reglas duras + templates aprobados Meta donde determinismo es crítico, pero también long-tail de preguntas que el state machine no anticipa.

#### D-02: Triggers de escalación al sub-loop
- low-confidence (`intent_confidence < threshold`)
- CRM mutations no triviales
- CAS reject (`stage_changed_concurrently` de domain)
- Intents `razonamiento_libre`/`otro`

#### D-08: Base = somnio-v3 normal (NO pw-confirmation)
v4 hereda lógica conceptual de v3 normal. pw-confirmation solo se usa como punto de comparación arquitectónico (mutaciones inline desde state machine).

#### D-09: Modelo del sub-loop por defecto = Haiku
Scope acotado por trigger (3-5 tools por subloop, no las 20 simultáneas). Latencia ~600ms-1.5s por escalación.

#### D-13: agent_id final = `somnio-sales-v4`
Locked. Aplica a `agentRegistry`, `sessions.agent_id`, `agent_observability_events.agent_id`, `whatsapp_templates.agent_id`, rate-limit bucket.

#### D-24: v4 entidad independiente de v3
Código en `src/lib/agents/somnio-v4/` separado. NO extiende ni hereda de `somnio-v3/`. Cualquier lógica reusable se copia y adapta, no se importa. Razón: cambios en v3 (bug fixes, ajustes Somnio) no deben afectar v4 y viceversa.

### Triggers contract (state machine boundary)

#### D-15: Contract `TriggerKind = 'execute' | 'come_back'`
- `execute` = fire-and-forget, no afecta respuesta del turn, debe ser idempotency-protected
- `come_back` = blocking, resultado se mergea al state, condiciona el siguiente paso

NO hay tipo `preload` separado. Pre-carga de contexto CRM (cuando aplique a otros agentes como pw) se resuelve via come-back desde transition específica.

#### D-16: Sin preload de CRM context al iniciar sesión en v4
v4 entra siempre por phase `initial` igual que v3 actual. Las queries CRM se invocan via come-back solo cuando una transition específica las requiere. La pre-carga de CRM context para agentes que la necesitan (como pw-confirmation) es problema de cada agente, fuera del scope de v4.

#### D-17: Routing-level reads
`agent-lifecycle-router` puede usar reads CRM en su propia lógica de routing. Esos reads NO son parte del flujo interno de v4 — v4 asume que ya fue elegido y procede sin recibir CRM context pre-cargado por el router.

#### D-18: Orden de procesamiento del turn
`comprehension → resolveTransition → invocations (come-back blocking, luego execute fire-and-forget) → response`. Sin boot step.

#### D-22: Inngest function v4 separada
`agent-timers-v4.ts` clonada de `agent-timers-v3.ts`, invoca la misma `crm-mutation-tools.createOrder.execute()` que el runner happy path. Una sola integración point con la tool, dos call sites distintos según origen del trigger.

### CRM mutations (set mínimo)

#### D-07: Mutations vía `crm-mutation-tools` directo
NO via `crm-writer-adapter`. Patron coherente con la dirección estratégica del codebase (CLAUDE.md menciona standalone futuro `crm-mutation-tools-pw-confirmation-integration` para migrar pw también).

#### D-19: Set mínimo de 5 mutations + mapeo de triggers

| Tool | Trigger | Por qué |
|---|---|---|
| `createOrder` (3 paths) | come-back | Su success/fail decide qué template se envía |
| `updateOrder` (shipping) | come-back | Validación de dirección puede fallar |
| `moveOrderToStage` (cancelar) | come-back | Cambia phase del state machine; CAS reject debe escalar humano |
| `updateContact` | execute | Correo/cédula opcional; falla no rompe respuesta |
| `addOrderNote` | execute | Nota interna operativa; no afecta cliente |

3 come-back + 2 execute. Crecimiento post-launch basado en data real de `agent_unknown_cases`.

#### D-20: Order de envío en timer-driven creates (FIX vs v3)
En v4, los 3 paths de `createOrder` (happy + 2 timer-driven) ejecutan la mutación ANTES de enviar el template post-creación. Si `createOrder` falla, el template post-success NO se envía — se envía template de error o se escala a humano. Corrige latent risk de v3 donde `pendiente_*` se enviaba sin garantía de orden creada.

#### D-21: Heredar 3 timer levels de v3 sin cambios
- L3 = 10min en `promos_shown` → `crear_orden_sin_promo`
- L4 = 10min en `confirming` → `crear_orden_sin_confirmar`

### Convivencia con v3 productivo

#### D-23: Scope = exclusivamente Somnio
v4 se diseña y prueba para workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`). v3 sigue completamente operativo y sin tocar para Somnio (hasta que v4 esté listo + activado por el usuario) y para cualquier otro workspace.

#### D-25: Aislamiento Regla 6 sin feature flag
Mientras v4 no tenga regla activa en `routing_rules` para Somnio, v3 sigue atendiendo el 100% del tráfico Somnio. Mismo patrón que pw-confirmation (D-14).

#### D-26: Templates clonados a catálogo propio
Script SQL de migración duplica todos los templates de `whatsapp_templates.agent_id='somnio-sales-v3'` a registros nuevos con `agent_id='somnio-sales-v4'`, contenido idéntico. v4 SOLO consulta su propio catálogo. Sigue patrón validado post-revert de commit `cdc06d9` (2026-04-23).

#### D-27: Clonación de templates = Plan 01 task
Research mapea el set de templates v3, plan ejecuta SQL. Verifica si templates clonados requieren re-submission a Meta bajo el nuevo agent_id.

#### D-28: `crm_query_tools_config` compartido
Per-workspace, no per-agent. v3 y v4 leen mismos `active_stages` para `getActiveOrderByPhone`. Cambios en `/agentes/crm-tools` afectan ambos agentes simultáneamente.

#### D-29: Pipeline + stages = recursos workspace
v4 los usa por UUID directo (no hardcodea nombres). UUIDs viven en `crm_query_tools_active_stages` o constants similares.

#### D-30: `session_state` global compartido
Cada sesión guarda su `agent_id` para distinguir. v4 NO requiere migración de esta tabla — usa schema actual.

### Rollout strategy

#### D-31: Flip total bajo comando del usuario
Sin shadow, sin A/B gradual. Cuando el usuario decide, se inserta routing rule en `routing_rules` que asigna tráfico Somnio a `agent_id='somnio-sales-v4'` — flip 0→100%.

#### D-32: Pre-flip = sin tráfico productivo
v4 deployable a Vercel sin afectar producción. Aislamiento Regla 6 vía ausencia de routing rule.

#### D-33: Rollback = revertir routing rule
Un solo cambio en `routing_rules` revierte a v3. v3 intacto y operativo. Mecánica simétrica al flip-on.

#### D-34: QA pre-flip se decide en plan-phase
Probable: tests unitarios sobre transitions + integration tests sobre tools + tests E2E del sub-loop + smoke test en `/sandbox`.

#### D-35: Métrica formal post-flip = % sub-loop low-confidence triggered
Loggear `pipeline_decision:subloop_low_confidence_invoked` con `{ confidence, threshold, intent, message_redacted }`. Calibración con data inicial post-flip (sin objetivo numérico pre-fijado).

#### D-36: Conversion rate, % escalation, latencia = NO críticas formales
Pueden monitorearse ad-hoc si surge sospecha de regresión.

#### D-37: Sin alarmas automáticas, decisión humana
v3 está intacto como fallback siempre.

### Sesiones en curso al flip

#### D-38: Close hard de todas las sesiones v3 abiertas
SQL bulk UPDATE marca todas las sesiones con `agent_id='somnio-sales-v3'` y status activo como cerradas. Inngest timers v3 quedan colgados pero inofensivos.

#### D-39: Clientes que vuelven post-flip = sesión nueva en v4
Webhook trata mensaje como nuevo sin sesión activa → routing rule v4 aplica → sesión nueva con `agent_id='somnio-sales-v4'` → cliente entra en `phase=initial`.

#### D-40: Flip = transacción atómica de 2 SQL statements
1. `UPDATE sessions SET closed_at=NOW(), close_reason='v4_flip' WHERE agent_id='somnio-sales-v3' AND closed_at IS NULL AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'`
2. `INSERT INTO routing_rules (...) VALUES (..., agent_id='somnio-sales-v4', ...)`

#### D-41: v3 sigue recibiendo bug fixes si los amerita
Conserva paridad de bug-fixes durante desarrollo de v4 y post-flip.

#### D-42: Cleanup de v3 = standalone futuro
`somnio-sales-v3-deprecation` cuando el usuario decida.

#### D-43: Inngest timers v3 post-flip hacen no-op
Guard defensivo `Check session active` en `agent-timers-v3.ts:261-268` ya existe.

#### D-44: UX cliente con sesión cerrada = "como cliente nuevo"
Sin migración de state parcial entre v3 y v4.

### Knowledge base (`.md` curados)

#### D-04: Storage dual
`.md` curados en `src/lib/agents/somnio-v4/knowledge/` (verdad en git) + tabla `agent_knowledge_base` con embedding (pgvector) + sync script `pnpm knowledge:sync`.

#### D-45: Schema frontmatter mínimo viable (7 campos)
```yaml
---
topic: <slug-único>                  # required, PK
keywords: [<sinónimos-cliente>]      # required, lexical retrieval fallback
category: <enum>                     # required: product/policies/edge-cases/faqs-no-templated
last_reviewed: <YYYY-MM-DD>          # required
reviewed_by: <username>              # required
escalate_if: [<señales>]             # opcional, fuerza handoff
related_topics: [<topic-slugs>]      # opcional, cross-links
---
```

#### D-46: Adición de campos post-launch = migración versioned
Sin breaking changes a archivos existentes.

#### D-47: Carpetas físicas por categoría
```
src/lib/agents/somnio-v4/knowledge/
  product/
  policies/
  edge-cases/
  faqs-no-templated/
```

#### D-48: Sync script valida coherencia carpeta vs frontmatter
`pnpm knowledge:sync` falla si `category` del frontmatter no coincide con carpeta padre.

#### D-49: Body markdown = híbrido literal + secciones contextuales
Estructura:
```markdown
## Respuesta canónica
[Texto literal por default. 50-200 palabras.]

## Si el cliente insiste
[Opcional. Variante contextual.]

## NUNCA decir
[Lista de prohibiciones explícitas.]

## Sources / Notas
[Opcional. NO se cita al cliente.]
```

#### D-50: Sub-loop prefiere "Respuesta canónica" verbatim
Solo usa secciones "Si el cliente..." con match contextual claro. NUNCA cita "NUNCA decir" ni "Sources" al cliente.

#### D-51: Check Haiku post-generación valida "NUNCA decir"
~150ms extra. Si aparece elemento prohibido en output, fuerza handoff humano. Implementación en sub-loop wrapper.

#### D-52: Versioning = git history + PR review obligatorio
Cualquier cambio a `knowledge/**/*.md` pasa por PR con mínimo 1 aprobador. Sin push directo a main.

#### D-53: Sync DB automático post-deploy
Vercel deploy → Inngest function `knowledge-sync` → re-parsea archivos modificados → upsert a `agent_knowledge_base` con embedding fresh. Sin pasos manuales post-merge.

#### D-54: Sync fail no bloquea deploy
Loggea evento `pipeline_decision:knowledge_sync_failed` + UI banner. Knowledge stale > producción rota.

#### D-55: CLI `pnpm knowledge:sync` disponible
Útil para testing local pre-PR.

#### D-56: Schema tabla `agent_knowledge_base`
Columnas: `id, workspace_id, agent_id, topic, keywords[], category, embedding(1536), canonical_response, escalate_triggers[], related_topics[], source_md_path, last_reviewed_at, reviewed_by, hit_count, promoted_to_transition, created_at, updated_at`. Índices exactos en research+plan.

### Observation loop (unknown cases)

#### D-05: Tabla `agent_unknown_cases` + UI clustering
- `agent_unknown_cases` schema con embedding para clustering
- UI `/agentes/somnio-v4/unknown-cases` con clustering nocturno
- Background job de clustering por similarity HDBSCAN

#### D-06: Promoción a transition = cluster ≥10 cases en 30 días
Regla auto-impuesta para evitar transitions.ts unmaintainable.

#### D-12: Infra completa día 1
KB + unknown_cases + UI desde el inicio, aun cuando low-confidence sea minoritario al inicio. Razón: triggers CRM también consumen knowledge + acumular data desde el primer turn.

### Fallback knowledge no resuelve

#### D-57: `no_match` → handoff humano siempre
Sub-loop emite `LoopOutcome` con `responseTemplate: 'handoff_humano'`, `requiresHuman: true`, `reason: 'low_confidence_no_knowledge_match'`, `knowledgeQueried: [<topics>]`. Cero freeText.

#### D-58: Doble logging
- `agent_unknown_cases` (review humano)
- `agent_observability_events` evento `pipeline_decision:handoff_low_confidence_fallback`

#### D-59: Template `handoff_humano` = template clonado bajo `agent_id='somnio-sales-v4'`
Research-phase valida existencia o flagea creación + Meta approval requerida.

#### D-60: Sesión flagged `requires_human=true`
Inbox UI filtra/destaca. Operador toma. Cuando responde manual, sesión se marca atendida — v4 NO retoma.

#### D-61: Sin re-engagement automático post-handoff
Cliente queda en limbo hasta operador o cliente vuelva a escribir. SLA monitoring = scope futuro (`somnio-handoff-sla-monitoring`).

#### D-62: Sub-loop NO genera freeText
Respuestas solo via templates aprobados o canónicas literales. Cierra puerta a alucinación by design.

### Confidence calibration

#### D-03: Threshold inicial = 0.70
Parametrizable vía `platform_config.somnio_v4_low_confidence_threshold`.

#### D-10: Comprehension Haiku estructurado extendido con confidence
`intent_confidence: z.number().min(0).max(1)` agregado al schema.

#### D-11: Threshold como `platform_config` key
Tuneable sin redeploy.

#### D-63: Schema = clasificación + confidence post-clasificación
- `intent.primary: z.enum(INTENTS)` — clasificación (lo que Haiku ya hace bien, no se toca)
- `intent_confidence: z.number().min(0).max(1)` — evaluación post-clasificación
- `intent_confidence_reasoning: z.string().optional()` — observability + tuning

#### D-64: Confidence directo de Haiku, calibrado vía few-shot
Sin formula posterior (no gap-penalty). Si Haiku sobrereporta, se cura vía few-shot, no vía cálculo.

#### D-65: Threshold 0.70 sobre `intent_confidence`
Aplica directamente sobre el valor reportado.

#### D-66: Few-shot 6-8 ejemplos
Curados de histórico Somnio v3 real. Research-phase extrae mensajes con `accion=null`/`razonamiento_libre`/`handoff_humano`. Distribución sugerida: 2-3 universal-claros (alto confidence), 2-3 context-dependientes (medio), 1-2 sumidero (bajo).

#### D-67: Plan B (enum mapeado) = contingency
Si distribución sesgada post-launch, pivotar a `confidence_calibration: z.enum(['certain','likely','uncertain'])` mapeado a números.

#### D-68: Observability completa de comprehension
`pipeline_decision:comprehension_completed` con `{ intent.primary, intent_confidence, intent_confidence_reasoning, threshold, scaledToSubLoop }`. Reasoning textual permite tuning iterativo.

#### D-69: Intent `otro` = sumidero por construcción
Few-shot lo modela siempre con `intent_confidence < 0.70`. Sin lógica especial en código; emerge del prompt training.

#### D-70: Few-shot self-contained, sin contexto de phase
Resolución contextual sigue siendo responsabilidad de `resolveTransition()`, NO de comprehension. Preserva separación de responsabilidades de v3.

#### D-71: Intents context-dependientes = ambiguity con confidence 0.50-0.70
Few-shot modela explícitamente la ambigüedad sin contexto. Cuando esos mensajes lleguen sin phase apropiada, sistema escala al sub-loop en vez de procesar transition incorrecta.

#### D-72: Research-phase inventaria intents v3 por categoría
Universal-claro / context-dependent / sumidero. Curación de few-shot se basa en este inventario.

#### D-73: Validación post-launch detecta 3 síntomas de contaminación
1. Confidence alto en mal-clasificados
2. Distribución bimodal extraña (concentración en 0.4-0.5 y 0.9+)
3. Context-dependent con confidence sistemáticamente alto

Si alguno aparece, refactor del few-shot es PR localizado.

#### D-74: System prompt instruye explícitamente NO usar contexto previo
"Tu output es sobre este mensaje individual y su match con un intent universal."

### Data calibración pre-launch

#### D-75: Calibración solo post-flip
Sin shadow logging en v3, sin sandbox golden tests dedicados a calibración. v3 productivo NO se toca (Regla 6 estricta).

#### D-76: Calibración post-flip en 2 ventanas
- **Ventana 1 (semana 1):** Observación pasiva. Sin ajustes.
- **Ventana 2 (semanas 2-4):** Tuning iterativo via `platform_config.somnio_v4_low_confidence_threshold`:
  - >95% turns sobre 0.85 → bajar threshold o pivotar Plan B
  - <2% turns bajo 0.70 → bajar threshold o curar más few-shot bajo
  - 5-15% escalando con outcomes razonables → mantener 0.70

#### D-77: Sandbox tests pre-flip cubren correctness, NO calibración
Tests unitarios de transitions + integration de tools + E2E del sub-loop con knowledge base mock.

#### D-78: Plan B = standalone contingency post 4 semanas
Si v4 no estabiliza tras 4 semanas, plan B (enum mapeado) se activa via standalone separado.

#### D-79: Calidad del few-shot inicial = único insumo pre-launch
Research extrae con cuidado: 2-3 universal-claros, 2-3 context-dependientes, 1-2 sumidero/otro.

### Claude's Discretion

Áreas donde el plan-phase tiene flexibilidad:
- Estructura física exacta de `src/lib/agents/somnio-v4/` (subcarpetas para state-machine, transitions, comprehension, sub-loop, etc.)
- Esquema exacto de `agent_unknown_cases` table (columns extra, índices)
- Estructura de `LoopOutcome` Zod schema interno del sub-loop
- Wave decomposition del plan (cuántos plans, cómo se paralelizan)
- Script exacto de clonación de templates SQL
- Estructura del UI `/agentes/somnio-v4/unknown-cases` (componentes, layout)

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules (read FIRST)
- `CLAUDE.md` — Reglas críticas MORFX (REGLA 0: GSD completo obligatorio, REGLA 3: Domain layer, REGLA 5: Migración antes de deploy, REGLA 6: Proteger agente en producción)
- `.claude/rules/agent-scope.md` — Scopes por agente. Sección "Module Scope: crm-query-tools" + "Module Scope: crm-mutation-tools" describe exactamente qué pueden y NO pueden hacer las tools que v4 usa.
- `.claude/rules/code-changes.md` — Reglas de cambio de código + push a Vercel.
- `.claude/rules/gsd-workflow.md` — Workflow GSD obligatorio.

### Tools modules (descubribles via project skills)
- `.claude/skills/crm-query-tools.md` — 5 read tools, factory pattern, Pitfalls. v4 usará `createCrmQueryTools({ workspaceId, invoker: 'somnio-sales-v4' })`.
- `.claude/skills/crm-mutation-tools.md` — 15 write tools (v4 usa 5), factory pattern, idempotency, Pitfalls. v4 usará `createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })`.

### Standalone references (patterns to follow)
- `.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md` — Patrón de agente nuevo en codebase (catálogo independiente, regla routing, aislamiento Regla 6).
- `.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md` — Investigación referencial sobre v3 (research v4 puede reusar parcialmente).
- `.planning/standalone/somnio-sales-v3-pw-confirmation/LEARNINGS.md` — Lecciones del agente PW (incluye anomalía gsd-executor: worktree isolation drift).
- `.planning/standalone/crm-mutation-tools/CONTEXT.md` — Decisiones D-pre-* y D-* del módulo mutation-tools.
- `.planning/standalone/crm-mutation-tools/SUMMARY.md` — Estado final del módulo (28 commits, tests, migrations).
- `.planning/standalone/crm-query-tools/CONTEXT.md` — Decisiones D-* del módulo query-tools.
- `.planning/standalone/crm-stage-integrity/CONTEXT.md` — Error contract `stage_changed_concurrently` (D-06 cross-agent). v4 propaga verbatim igual que mutation-tools y crm-writer.
- `.planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md` — Lección post-revert de commit `cdc06d9` (catálogo independiente por agente, NO compartir).

### Code anchors (file:line)
- `src/lib/agents/somnio-v3/transitions.ts:30-427` — TRANSITIONS array de v3. v4 clona y adapta.
- `src/lib/agents/somnio-v3/transitions.ts:438-461` — `resolveTransition()` función pure.
- `src/lib/agents/somnio-v3/state.ts:44-200` — AgentState, mergeAnalysis, computeGates.
- `src/lib/agents/somnio-v3/comprehension.ts:51-102` — Single Haiku call estructurado. v4 extiende con confidence.
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts:46-156` — processSystemEvent (timer path).
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts:245-403` — processMessage core.
- `src/lib/agents/somnio-v3/constants.ts:189-191` — CREATE_ORDER_ACTIONS array.
- `src/lib/agents/somnio-v3/constants.ts:214` — Timer levels (L3=L4=600s).
- `src/lib/agents/somnio-v3/response-track.ts:303-313` — Templates `pendiente_promo` / `pendiente_confirmacion`.
- `src/lib/agents/engine/v3-production-runner.ts:475-493` — Order creation deferred (path a reemplazar).
- `src/inngest/functions/agent-timers-v3.ts:204-486` — Timer function (clonar para v4).
- `src/inngest/functions/agent-timers-v3.ts:261-268` — Guard defensivo de session active (D-43).
- `src/inngest/functions/agent-timers-v3.ts:410-434` — Order creation timer-driven (path a reemplazar).
- `src/lib/agents/registry.ts:117` — agentRegistry self-register pattern.
- `src/lib/agents/production/webhook-processor.ts:218-305` — Routing dispatch (Regla 6 verification).
- `src/app/(dashboard)/agentes/routing/editor/page.tsx` — Routing editor UI (importar v4 module).
- `src/lib/agents/shared/crm-query-tools/index.ts:23` — `createCrmQueryTools` factory.
- `src/lib/agents/shared/crm-mutation-tools/index.ts:34` — `createCrmMutationTools` factory.
- `src/lib/agents/shared/crm-mutation-tools/types.ts:58-82` — MutationResult discriminated union.
- `src/lib/agents/shared/crm-mutation-tools/helpers.ts:33-55` — PII redaction (phoneSuffix, emailRedact).

## Code Context

### Reusable Assets
- **`createCrmQueryTools({ workspaceId, invoker })`** — factory de 5 read tools, retorna AI SDK `tool()` objects (también llamables vía `.execute()`). v4 instanciará con `invoker: 'somnio-sales-v4'`.
- **`createCrmMutationTools({ workspaceId, invoker })`** — factory de 15 write tools, retorna AI SDK `tool()` objects. v4 usará 5 de los 15 (set mínimo D-19).
- **`agent_observability_events` table** — observability shared. v4 emite eventos `pipeline_decision:*` con `agentId='somnio-sales-v4'`.
- **`session_state` table** — global compartida (D-30). v4 popula `agent_id='somnio-sales-v4'` en sus filas.
- **`crm_mutation_idempotency_keys` table** — shared idempotency layer. v4 reusa para sus mutations idempotency-eligible.
- **`agentRegistry`** — self-register pattern. v4 registra `'somnio-sales-v4'` con su processMessage.
- **`crm-writer-adapter`** — NO se usa (D-07). Solo referencia conceptual.
- **`whatsapp_templates` table** — shared schema. v4 usa registros con `agent_id='somnio-sales-v4'` (clonados de v3).
- **`crm_query_tools_config` + `crm_query_tools_active_stages`** — shared config (D-28).

### Established Patterns
- **Agente nuevo = catálogo de templates propio** — Lección del revert `cdc06d9`. v4 sigue patrón D-26.
- **Aislamiento Regla 6 vía routing rules** — pw-confirmation validó que ausencia de regla = aislamiento total sin feature flag. v4 hereda (D-25, D-32).
- **Mutations vía shared modules `crm-mutation-tools`** — patrón nuevo del codebase post-`crm-mutation-tools` standalone (2026-04-29). v4 es el primer consumidor productivo (D-07).
- **Timer functions Inngest separadas por agente** — `agent-timers-v3.ts` es plantilla. v4 tendrá su propio `agent-timers-v4.ts` (D-22).
- **Domain layer único punto de mutación** — Regla 3 estricta. Tools NO importan `createAdminClient`; pasan por domain.
- **State machine pura + LLM acotado** — patrón heredado de v3 + extendido con sub-loop (D-01).
- **PII redaction en observability** — `phoneSuffix`, `emailRedact` ya implementados en helpers.ts.

### Integration Points
- **Webhook processor** — `src/lib/agents/production/webhook-processor.ts` despacha al agente vía routing rule. v4 se integra ahí cuando `routing_rules` lo asigna.
- **Routing editor UI** — `src/app/(dashboard)/agentes/routing/editor/page.tsx` debe importar el módulo v4 para que aparezca como opción en dropdown.
- **Inngest events** — eventos `agent/v4.timer.started` (clonados de v3 pattern).
- **AI SDK** — `generateText` para sub-loop (Haiku scope-acotado por trigger).
- **pgvector** — embeddings de `agent_knowledge_base.embedding(1536)`. Migración requiere extension habilitada (verify in research).
- **`agent_unknown_cases`** — nueva tabla, indexada para queries de UI clustering.

## Specifics

### Decisiones que documentan preferencias del usuario
- **Calidad sobre velocidad** — Filosofía GSD del proyecto. v4 sigue proceso completo, no shortcuts.
- **Determinismo en happy path** — Mantener la garantía testeable del state machine de v3. Sub-loop solo donde la flexibilidad agrega valor real.
- **Aislamiento total v3 ↔ v4** — Cero código compartido. Clonar y adaptar > extender. Razón: bug fixes en uno no contaminan el otro.
- **No tocar v3 productivo** — Regla 6 estricta. Cero modificaciones a v3 durante todo el desarrollo de v4.
- **Knowledge base curado por humano** — NO entrenamiento ML, NO RAG agresivo. Cada `.md` revisado por operador. Calidad > volumen.
- **Crecimiento incremental del scope post-launch** — Set mínimo de 5 mutations al inicio. Más mutations cuando data lo justifique.

### Patrones que el usuario explícitamente quiere replicar
- Patrón de coexistencia de pw-confirmation (sin feature flag, vía ausencia de routing rule)
- Patrón de templates clonados de recompra-template-catalog (post-revert)
- Patrón de mutations vía shared modules de crm-mutation-tools standalone

## Deferred Ideas

Ideas que surgieron pero NO entran en este standalone:

- **SLA monitoring de handoffs** — Cuando operador no responde dentro de N minutos, alertar o re-engage. Standalone futuro: `somnio-handoff-sla-monitoring`.
- **Cleanup/deprecation de v3** — Eliminar código v3, registry, Inngest functions, templates v3. Standalone futuro: `somnio-sales-v3-deprecation` cuando v4 esté estable.
- **Migración de pw-confirmation a crm-mutation-tools directo** — CLAUDE.md menciona este standalone pendiente. Independiente de v4.
- **Pivote a Plan B (schema enum confidence)** — Solo si calibración v4 no estabiliza tras 4 semanas. Standalone contingency: `somnio-sales-v4-confidence-schema-pivot`.
- **Aplicación de v4 a workspaces no-Somnio** — Post-launch evaluación. Requiere generalización del agente (no hardcodear pack/templates Somnio).
- **Logits/log-probs como métrica objetiva de confidence** — Out of scope. Anthropic API no expone hoy. Reconsiderar si Anthropic lo agrega.
- **A/B gradual per-conversation entre v3 y v4** — Descartado en D-31 (flip total preferido). Reconsiderable si surge necesidad post-launch.
- **Shadow mode comparativo de decisiones v3 vs v4** — Descartado en D-31 + D-75. Reconsiderable si surge necesidad de validación adicional.
- **Crecimiento del set de mutations a 8 o 15** — Post-launch basado en data de `agent_unknown_cases`. Standalone follow-ups específicos por mutation agregada.
- **UI editor en `/agentes/knowledge-base` (vs git-only)** — Descartado en D-52 (PR review preferido). Reconsiderable si curación se vuelve cuello de botella humano.
- **Re-submission de templates clonados a Meta** — Investigación responsabilidad de research-phase (D-27). Si Meta requiere re-approval bajo nuevo agent_id, plan-phase ajusta.

---

*Standalone: somnio-sales-v4*
*Context gathered: 2026-05-01*
*Total decisiones lockeadas: 79 (D-01..D-79)*
*Status: Ready for /gsd-research-phase somnio-sales-v4*
