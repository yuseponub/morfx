# Standalone: somnio-sales-v4 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisiones canónicas en CONTEXT.md — este log preserva las alternativas consideradas.

**Date:** 2026-05-01
**Standalone:** somnio-sales-v4
**Áreas discutidas:** Arquitectura general, Triggers contract, Catálogo de mutaciones CRM, Convivencia con v3 productivo, Estrategia de rollout, Sesiones en curso al flip, Formato del knowledge base .md, Fallback knowledge no resuelve, Confidence calibration, Data calibración pre-launch

---

## Pre-discussion (conversación libre)

Antes del discuss-phase formal, el usuario y Claude exploraron 4 modelos arquitectónicos:

### Modelo evaluados (rejected)

**Opción A — Full AI SDK loop:**
- Reemplaza state machine por `generateText` con tools.
- LLM decide todas las transitions.
- **Rejected:** pierde determinismo del funnel, requiere eval suite grande, costo Sonnet × volumen Somnio prohibitivo, riesgo regresión.

**Opción B — Pure state machine + helpers directos:**
- Mantiene state machine, reemplaza `adapters.orders.createOrder` por `mutationTools.createOrder.execute()` inline.
- **Rejected:** no resuelve el problema de mensajes que NO encajan en transitions (long-tail).

### Modelo elegido (locked como D-01)

**Opción C — Híbrido state machine + AI SDK escalation:**
- State machine determinista en happy path
- Sub-loop AI SDK escala bajo triggers específicos (low-confidence, CRM mutations no triviales, CAS reject, intents ambiguos)
- LoopOutcome estructurado (Zod), nunca freeText al cliente

### Triggers de escalación discutidos

| Trigger | Aceptado? | Notas |
|---|---|---|
| Low-confidence (`confidence < threshold`) | Sí (D-02) | Threshold 0.70 inicial (D-03) |
| CRM mutations | Sí (D-02) | Solo no-triviales que requieren contexto LLM |
| CAS reject (`stage_changed_concurrently`) | Sí (D-02) | Decide handoff vs retry |
| Intents `otro`/`razonamiento_libre` | Sí (D-02) | Sumidero del clasificador |
| Cliente menciona pedido existente | No locked como trigger separado | Se maneja por intent específico + come-back read |

### Knowledge base + observation loop

Patrón discutido (locked como D-04, D-05, D-06, D-12):
- `.md` curados (`knowledge/{product,policies,edge-cases,faqs-no-templated}/`)
- Tabla DB con embeddings (pgvector)
- `agent_unknown_cases` para casos no resueltos
- UI `/agentes/somnio-v4/unknown-cases` con clustering nocturno
- Promoción dual: KB entry o nueva transition

### Threshold confidence inicial

Discutido extensamente:
- **0.70 lockeado como baseline** (D-03)
- Parametrizable vía `platform_config.somnio_v4_low_confidence_threshold` (D-11)
- Calibración post-launch con data real (no shadow logging en v3)
- Plan B (enum mapeado certain/likely/uncertain) como contingency si overconfidence sistémico

---

## Área 1: Catálogo de mutaciones CRM

### Sub-pregunta 1: Cuáles mutaciones (de las 15 disponibles)

| Opción | Description | Selected |
|--------|-------------|----------|
| Set mínimo (5 core) | createOrder + updateOrder + updateContact + moveOrderToStage + addOrderNote | ✓ |
| Set extendido (8) | + createContact + addContactNote + createTask | |
| Set completo (15) | Todas | |
| Diferir a research | Decidir en research-phase | |

**User's choice:** Set mínimo (5 core), "luego exploramos para ir anadiendo mas"
**Notes:** Crecimiento post-launch basado en `agent_unknown_cases`. Locked como D-19.

### Sub-pregunta 2: Cómo se gatillan (mecánica)

| Opción | Description | Selected |
|--------|-------------|----------|
| Híbrido por mutación | createOrder + cancelar = TRANSITIONS; resto = sub-loop CRM | (NO presentada — discusión derivó a triggers genéricos) |
| Todo discreto en TRANSITIONS | 5 acciones nuevas por nombre | |
| Todo via sub-loop CRM | accion='crm:mutate' | |
| Definir en research-phase | | |

**User's choice:** Pidió clarificación de "gatillan" + propuso modelo de tipos de trigger (`execute` vs `come-back`)
**Notes:** Convirtió la pregunta en una decisión arquitectónica más amplia → contract genérico de triggers (D-15) que aplica a TODAS las invocaciones del state machine, no solo las 5 mutations.

### Sub-pregunta 3: Triggers types

| Opción | Description | Selected |
|--------|-------------|----------|
| 2 tipos (execute / come_back) | Fire-and-forget vs blocking | ✓ |
| 3 tipos (execute / come_back / preload) | Boot step separado al inicio de sesión | |

**User's choice:** 2 tipos. "Para el preload podemos usar las tools por específico en medio del flujo (por ej para el routing que conversaciones que llevan a agente pw ya se hace una query de read para ver la orden que hizo el cliente)"
**Notes:** Locked D-15. Routing-level reads (D-17) son responsabilidad del router, no del agente. v4 no requiere preload (D-16). Para pw-confirmation cuando se migre, evaluamos en su standalone.

### Verificación de codebase requerida

Spawned Explore agent para mapear los 3 paths de createOrder en v3:
- Happy path: `transitions.ts:255-262` → `v3-production-runner.ts:475-493`
- Timer L3: `transitions.ts:331-337` → `agent-timers-v3.ts:410-434`
- Timer L4: `transitions.ts:340-346` → `agent-timers-v3.ts:410-434`

Hallazgo crítico: en timer-driven paths, template `pendiente_*` se envía ANTES de createOrder, lo que es latent risk en v3 si createOrder falla. v4 corrige (D-20).

### Decisiones cerradas (Área 1)
D-15, D-16, D-17, D-18, D-19, D-20, D-21, D-22

---

## Área 2: Convivencia con v3 productivo

### Sub-pregunta 1: Scope de workspaces

| Opción | Description | Selected |
|--------|-------------|----------|
| Solo Somnio | v4 exclusivo workspace Somnio | ✓ |
| Reemplazo genérico | v4 sucesor de v3 para cualquier workspace | |
| Diferir a research | | |

**User's choice:** "Solo somnio. creamos el v4 como entidad totalmente independiente de v3, v3 sigue funcionando hasta que terminemos v4"
**Notes:** Locked D-23, D-24, D-25.

### Sub-pregunta 2: Templates de WhatsApp

| Opción | Description | Selected |
|--------|-------------|----------|
| Catálogo independiente clonado de v3 | SQL clone bajo agent_id='somnio-sales-v4' | ✓ |
| Compartir catálogo con v3 | Query a registros agent_id='somnio-sales-v3' | |
| Híbrido (sólo overrides) | Union query | |
| Diferir a research | | |

**User's choice:** Catálogo independiente clonado de v3
**Notes:** Patrón validado post-revert de commit `cdc06d9` (recompra-template-catalog). Locked D-26, D-27.

### Sub-pregunta 3: crm_query_tools_config

| Opción | Description | Selected |
|--------|-------------|----------|
| Compartir config existente | Per-workspace, no per-agent | ✓ |
| Config separada por agente | Migración a per-agent | |
| Diferir | | |

**User's choice:** Compartir config existente
**Notes:** Locked D-28. Pipeline + stages + session_state también compartidos (D-29, D-30).

### Decisiones cerradas (Área 2)
D-23, D-24, D-25, D-26, D-27, D-28, D-29, D-30

---

## Área 3: Estrategia de rollout

### Sub-pregunta 1: Modelo de rollout

| Opción | Description | Selected |
|--------|-------------|----------|
| Shadow + flip total | 1-2 semanas shadow, luego flip | |
| A/B gradual per-conversation | 5% → 10% → 25% → 50% → 100% | |
| Flip total tras QA sandbox | Flip 0→100% bajo comando | |
| Shadow + A/B gradual | Combina ambos | |

**User's choice:** "sin shadow, solo flip total (a comando mio) y lo empezamos a probar en produccion cuando yo te diga"
**Notes:** Locked D-31, D-32, D-33, D-34.

### Sub-pregunta 2: Métricas post-flip

| Opción | Description | Selected |
|--------|-------------|----------|
| Conversion rate | orders/sesiones, alarma -5% | |
| % escalation a humano | Comparar con v3 baseline | |
| % sub-loop low-confidence triggered | Métrica nueva v4 | ✓ |
| Latencia p50/p95 | Detección regresiones | |

**User's choice:** % sub-loop low-confidence triggered (única métrica formal)
**Notes:** Otras métricas opcionales/ad-hoc. Locked D-35, D-36, D-37.

### Decisiones cerradas (Área 3)
D-31, D-32, D-33, D-34, D-35, D-36, D-37

---

## Área 4: Sesiones en curso al flip

### Sub-pregunta única: Drenaje vs migración

| Opción | Description | Selected (initial) | Selected (revised) |
|--------|-------------|--------------------|--------------------|
| Drenaje natural | v4 solo sesiones nuevas, v3 termina las suyas | ✓ | |
| Drenaje + auto-close 24h | Drenaje + cleanup huérfanas | | |
| Migración hard | State migration v3 → v4 | | |
| Diferir a research | | | |
| **Close hard de todas las sesiones v3** (revisado) | SQL UPDATE bulk al flip + sesión nueva al volver | | ✓ |

**User's choice:** Inicial → "Drenaje natural". Después corrigió: "mejor hacemos flip de todas las sesiones existentes y ya, es decir cerramos todas las sesiones por agente (como close) y si vuelven a escribir se toman como nueva"
**Notes:** Decisión revisada locked como D-38, D-39, D-40, D-41, D-42, D-43, D-44.

### Decisiones cerradas (Área 4)
D-38, D-39, D-40, D-41, D-42, D-43, D-44

---

## Área 5: Formato del knowledge base .md

### Sub-pregunta 1: Schema frontmatter

| Opción | Description | Selected |
|--------|-------------|----------|
| Mínimo viable (7 campos) | topic + keywords + category + last_reviewed + reviewed_by + escalate_if + related_topics | ✓ |
| Extendido (11) | + confidence_floor + max_uses_per_session + deprecated_after + sources | |
| Custom | Define usuario | |
| Diferir a research | | |

**User's choice:** Pidió justificación primero ("por qué recomiendas el mínimo viable?"), Claude explicó regla heurística "no agregar campo si código no lo lee", luego usuario locked mínimo viable.
**Notes:** Locked D-45, D-46.

### Sub-pregunta 2: Organización de carpetas

| Opción | Description | Selected |
|--------|-------------|----------|
| Por categoría | knowledge/{product,policies,edge-cases,faqs-no-templated}/ | ✓ |
| Plano | Todos los .md sueltos | |
| Por tipo de cliente | knowledge/{cliente-nuevo,cliente-recurrente,...}/ | |
| Diferir | | |

**User's choice:** Por categoría
**Notes:** Locked D-47. Sync valida coherencia (D-48).

### Sub-pregunta 3: Tone canónico

| Opción | Description | Selected |
|--------|-------------|----------|
| Híbrido literal+secciones | "Respuesta canónica" verbatim + secciones contextuales + "NUNCA decir" | ✓ |
| Solo literal | Verbatim, escalation si requiere matiz | |
| Solo guideline | LLM genera basado en hechos | |
| Diferir | | |

**User's choice:** Híbrido literal+secciones
**Notes:** Locked D-49, D-50, D-51.

### Sub-pregunta 4: Versioning

| Opción | Description | Selected |
|--------|-------------|----------|
| Git history + PR review | 1 aprobador mínimo | ✓ |
| Git history sin review | Push directo | |
| UI editor en /agentes/knowledge-base | Frontend dedicado | |
| Diferir a research | | |

**User's choice:** Git history + PR review
**Notes:** Locked D-52, D-53, D-54, D-55, D-56.

### Aside: Confusión inicial sobre qué es knowledge base
Usuario preguntó "no entiendo muy bien, que es el knowledge base". Claude respondió con explicación detallada del problema concreto que resuelve + analogía del nuevo empleado de ventas + ejemplo end-to-end. Tras claridad, usuario continuó.

### Decisiones cerradas (Área 5)
D-45, D-46, D-47, D-48, D-49, D-50, D-51, D-52, D-53, D-54, D-55, D-56

---

## Área 6: Fallback knowledge no resuelve

### Sub-pregunta única

| Opción | Description | Selected |
|--------|-------------|----------|
| Handoff humano siempre | Cero freeText | ✓ |
| Respuesta genérica + handoff async | "Déjame verificar..." + flag | |
| Híbrido por categoría | Sensible→handoff, trivial→freeText, ambiguo→genérica | |
| FreeText cauto siempre | LLM genera con guardrails | |

**User's choice:** Handoff humano siempre
**Notes:** Reconoce que producto Somnio (consumible con implicaciones de salud) merece máxima prudencia. Locked D-57, D-58, D-59, D-60, D-61, D-62.

### Decisiones cerradas (Área 6)
D-57, D-58, D-59, D-60, D-61, D-62

---

## Área 7: Confidence calibration

### Sub-pregunta 1: Estrategia general

| Opción | Description | Selected (initial) | Reformulada |
|--------|-------------|--------------------|--------------------|
| Prompt + few-shot examples | Schema continuo (0-1) + 6-8 ejemplos | (parcial) | |
| Schema con enum | certain/likely/uncertain mapeado | | |
| Confidence emergente | Sin guidance | | |
| Híbrido A+B | A primero, B si falla | | |

**User's first response:** "ok pero la opcion A seria por cada intent? o en general? porque la idea de lo que yo pienso que debe hacer es ver; esto se identifica con x intent (si tenemos ese intent en la base de intents) y luego revisar el confidence intentando asociarlo con ese intent"

**Claude's first interpretation (rejected):** Confidence comparativo (top-3 candidates con scores + gap penalty). Schema con `intent_candidates: [{ intent, score, reasoning }]`.

**User's correction:** "no espera, no me entendiste. me referia a que la categorizacion de intent haiku la ha hecho bien por el momento. lo que debe hacer es UNA VEZ categoriza el intent debe medir el nivel de confidence (ya teniendo ese intent)"

**Final design:** 2 pasos secuenciales:
1. Clasificación: `intent.primary` (lo que Haiku ya hace bien)
2. Evaluación post-clasificación: `intent_confidence` (auto-evaluación del match)

**Notes:** Locked D-63 (revisada), D-64 (revisada), D-65, D-66, D-67, D-68 (revisada), D-69.

### Sub-pregunta 2: Riesgo de contaminación con intents context-dependientes

**User's concern:** "ok pero hay intents que van con condiciones porque van dentro de un flujo, entonces luego no quiero que estos mini prompt confundan a haiku"

**Claude's response:** Reglas de curación de few-shot:
- Few-shot NO sustituyen contexto del state machine
- Few-shot solo entrenan calibración de confidence, NO clasificación
- Para intents context-dependientes, modelar la ambigüedad inherente con confidence 0.50-0.70

**User's response:** "asi esta bien"

**Notes:** Locked D-70, D-71, D-72, D-73, D-74.

### Decisiones cerradas (Área 7)
D-63, D-64, D-65, D-66, D-67, D-68, D-69, D-70, D-71, D-72, D-73, D-74

---

## Área 8: Data calibración pre-launch

### Sub-pregunta única

| Opción | Description | Selected |
|--------|-------------|----------|
| Sandbox golden tests + post-flip | 30-50 conversaciones golden + tuning post-flip | |
| Shadow logging en v3 | Modificar v3 productivo (no Regla 6) | |
| Confiar en 0.70 + post-flip | Sin sandbox, sin shadow, ajuste post-flip | ✓ |
| Shadow + sandbox máximo | Ambas | |

**User's choice:** "confiamos en el 0.70 + few-shot curado y calibramos solo con data v4 post-flip"
**Notes:** Locked D-75, D-76, D-77, D-78, D-79.

### Decisiones cerradas (Área 8)
D-75, D-76, D-77, D-78, D-79

---

## Claude's Discretion

Áreas donde el plan-phase tiene flexibilidad explícita:
- Estructura física exacta de `src/lib/agents/somnio-v4/` (subcarpetas)
- Esquema exacto de `agent_unknown_cases` table
- Estructura de `LoopOutcome` Zod schema interno
- Wave decomposition del plan
- Script SQL exacto de clonación de templates
- Estructura del UI `/agentes/somnio-v4/unknown-cases`

## Deferred Ideas

Ver sección homónima en CONTEXT.md.

## Decisiones lockeadas: 79 totales (D-01..D-79)

---

*Standalone: somnio-sales-v4*
*Discussion logged: 2026-05-01*
