# Somnio v4 — Architecture Deep-Dive (Post-Iter 7h)

**Date:** 2026-05-15
**Status:** Plan 07 Smoke A iterando — calibración funciona, sub-loop dispara correctamente, KB consultada, PERO hits incorrectos por category misuse del modelo.
**HEAD:** `b0b2fd9` (Iter 7h embed.ts fallback)

Este doc captura el estado mecánico actual del agente y las **preguntas arquitectónicas abiertas** que necesitamos resolver para que v4 funcione armoniosamente. Sirve como punto de re-entrada post-compact.

---

## 1. Resumen ejecutivo

Después de 8 sub-iteraciones (7a→7h) en esta sesión, llegamos al punto donde:

- ✅ Comprehension calibra bien (Gemini con framing template-fit, no pattern matching)
- ✅ Escalation dispara sub-loop con triggers correctos (low_confidence más usado)
- ✅ Sub-loop ejecuta GPT-4o mini sin errors fatales (wraps + key fallback shipped)
- ✅ KB consultada vía RPC `match_knowledge_base` con HNSW
- ❌ **El modelo elige category equivocada → KB filtra topics relevantes → emite canonical INCORRECTO** (el bug actual)

Necesitamos decidir cómo abordar el último bug **antes** de seguir iterando, porque hay 2 caminos divergentes (mantener vs quitar category filter) y cada uno tiene implicaciones de arquitectura.

---

## 2. Bug chain de esta sesión (iter por iter)

Cada bug que encontramos reveló algo del diseño. La cadena en orden:

### Iter 7a — Alcohol calibration (commit `dbddb7d`)
**Bug:** few-shot `"puedo si tomo licor?" → 0.92 (cubierto por KB interaccion_alcohol)` era contradictorio arquitecturalmente: 0.92 ≥ threshold 0.70 → no dispara sub-loop → KB nunca consultado → "cubierto por KB" imposible.
**Fix:** licor → 0.30 + variantes alcohol/cerveza/trago/vino.
**Lección:** Few-shots con comments aspiracionales pueden vivir años sin ser ejecutados (anchor sin sentido).

### Iter 7b — destructure outside try/catch (commit `89dfe6e`)
**Bug:** `const { output } = subLoopResult` estaba fuera del try/catch. El getter `.output` puede throw `AI_NoOutputGeneratedError`; sin wrap, propaga raw al outer catch.
**Fix:** mover destructure dentro del try.
**Lección:** AI SDK v6 los getters lazy son trampas de error handling. Wrappar TODO acceso a `.output`.

### Iter 7c — Peek subLoopResult fields (commit `b8808c1`)
**Bug:** `AI_NoOutputGeneratedError` NO carga `finishReason`/`text` en sí mismo. Vivían en `result`. Diagnostic wrap leía del error y veía todo "no-X".
**Fix:** declarar `subLoopResult` antes del try, peek-ear sus campos en catch.
**Lección:** Errores AI SDK v6 tienen poco contexto. El context vive en el result object — captúralo ANTES de que el getter throw.

### Iter 7d — stopWhen + prompt + v6 names (commit `a2afb45`)
**Bug:** GPT-4o mini con KB sin hits loopeaba 4x kb_search hasta agotar stopWhen=4. Además el diagnostic wrap usaba `args/result` (v5 names) en lugar de `input/output` (v6 names).
**Fix:** stopWhen 4→6 + prompt "max 2 búsquedas → no_match" + v6 property names.
**Lección:** AI SDK v6 cambió `tc.args` → `tc.input` y `tr.result` → `tr.output`. RTFM after upgrades.

### Iter 7e — kb_search logging + TS strict (commits `f3f7e30` + `9eb0fb0`)
**Bug 1:** sin observability en sandbox path (collector null), no podíamos ver kb_search runtime.
**Bug 2:** TypeScript strict implicit `any` en `hits.map((h) => ...)` rompió build.
**Fix:** console.log + anotación `h: KbHit`.
**Lección:** Sandbox NO escribe a `agent_observability_events` (solo prod path lo hace). Sin observability persistente, debugging vive en console.log + Vercel logs.

### Iter 7f — Template-fit framing (commit `7995d5d`)
**Bug arquitectónico:** prompt original con ~80 few-shots hacía nearest-neighbor matching. Phrasings nuevas (`"si tomo alcohol lo puedo tomar?"`) no matcheaban exact few-shot → confidence high → bypass sub-loop. Regla global `"NUNCA ≥0.85"` dejaba gap 0.70-0.84 sin proteger.
**Fix:** Re-framing completo: scope por intent con CUBRE/NO CUBRE explícito derivado del template content real. Removidos los ~80 few-shots. Reemplazados por ~25 anchors.
**Lección crítica:** "intent_confidence" debe medir **template-fit**, NO intent-clarity. La pregunta correcta es "¿el template responde esto?" no "¿es claro el intent?". Few-shots como mecanismo de calibración tienen ceiling bajo por dependencia en cobertura exhaustiva.

### Iter 7g — Cardiac generalization (commit `df4d791`)
**Bug:** "yo tomo anticoagulantes, se puede?" daba 0.25 (no_cubre) cuando debería ser 0.85 (cubre). Solo había anchor negativo ("yo NO tomo"). El modelo pattern-matcheaba la estructura `"yo [tengo/tomo X], se puede"` a NO CUBRE.
**Fix:** Generalizar CUBRE a "medicamentos para el corazón" (anticoagulantes, antihipertensivos, beta-bloqueadores, antiarrítmicos). NO CUBRE explícito de meds no cardíacos (antidepresivos, ansiolíticos, hipnóticos, tiroides, diabetes).
**Lección:** Scope debe ser semánticamente correcto + tener anchors positivos Y negativos. La distinción cardíaco vs no-cardíaco refleja realidad de las contraindicaciones del producto.

### Iter 7h — Embed key fallback (commit `b0b2fd9`)
**Bug raíz silenciado por 3 días:** `embed.ts` requería `process.env.OPENAI_API_KEY` pero Vercel solo tenía `OPENAI_API_KEY_SALESV4`. Cada `kb_search.execute()` throwear en `generateEmbedding` ANTES de llamar la RPC. Modelo recibía tool-error 2x, emitía no_match siguiendo "max 2 búsquedas" regla. **KB JAMÁS se consultó.** Por eso TODOS los tests previos siempre dieron handoff aunque KB tenía contenido correcto.
**Fix:** `OPENAI_API_KEY_SALESV4 ?? OPENAI_API_KEY` con fallback en `embed.ts:getOpenAI()`.
**Lección capital:** Asumimos que el sub-loop estaba "no encontrando hits" pero realmente NUNCA llegaba a la búsqueda. Los wraps diagnósticos captaban el error pero el outcome `no_match` con `reason="low_confidence"` no exponía la falla de la tool. Sin el debug view de la otra instancia (tool calls + KB hits visibility), seguíamos ciegos. **La observability del runtime es prerequisite del debugging confiable.**

### Iter 7i (próxima — sin shipping aún) — Category misuse
**Bug current:** modelo pasa `category: "faqs-no-templated"` a kb_search. Razonamiento del modelo: "la pregunta no es templated → faqs-no-templated". RPC filtra → `interaccion_alcohol` (en `edge-cases`) excluido por construcción. Modelo elige el mejor de los 3 disponibles (`duracion_efecto` 60% similarity) → canonical incorrecto al cliente.
**Pendiente fix:** Opción A (documentar uso) vs Opción B (quitar el parámetro). Ver §6.

---

## 3. Arquitectura as-built (estado mecánico)

### 3.1 Pipeline turn-by-turn (happy path comprehension → template)

```
[user message]
    ↓
[Comprehension] — Gemini 2.5 Flash-Lite
  - Input: system prompt (con scope per intent) + history(6) + msg
  - Output: { intent, intent_confidence (0..1), classification, extracted_fields }
  - File: src/lib/agents/somnio-v4/comprehension.ts
  - Prompt: comprehension-prompt.ts (con CONFIDENCE_FEW_SHOT template-fit framing)
    ↓
[Escalation] — decideSubLoopReason(input)
  - 4 triggers en orden: cas_reject / crm_mutation / razonamiento_libre / low_confidence
  - low_confidence dispara si intent_confidence < platform_config.somnio_v4_low_confidence_threshold (0.70)
  - File: src/lib/agents/somnio-v4/escalation.ts
    ↓
  ┌─────────────────────────┐
  │ Sub-loop reason = null  │  → State machine path (sales-track → response-track)
  │ (happy path templates)  │  → Templates CORE + COMPLEMENTARIA por intent
  │                         │  → Cliente recibe respuesta automática
  └─────────────────────────┘
  ┌─────────────────────────┐
  │ Sub-loop reason ≠ null  │  → SUB-LOOP path
  └─────────────────────────┘
                                    ↓
[Sub-loop] — GPT-4o mini con AI SDK v6
  - Input: prompt per reason + recentMessages + userMessage + tools por reason
  - Output: LoopOutcome { status: template/canonical/no_match, responseTemplate, canonicalText, ... }
  - File: src/lib/agents/somnio-v4/sub-loop/index.ts
  - stopWhen: stepCountIs(6)
  - toolChoice: 'auto'
  - Output enforcement: Output.object({ schema: LoopOutcomeSchema })
    ↓
[Outcome dispatch]
  - status='canonical' → emit canonicalText verbatim al cliente (post-NUNCA-decir check D-51)
  - status='template' → emit template existente por responseTemplate intent
  - status='no_match' → handoff silente (NO emit nada al cliente, requires_human=true)
```

### 3.2 Tools del sub-loop por reason (current)

| reason | Tools disponibles |
|---|---|
| `low_confidence` | `kb_search` only |
| `razonamiento_libre` | `kb_search` only |
| `crm_mutation` | `kb_search` + `getActiveOrderByPhone` + 5 mutations (createOrder, updateOrder, moveOrderToStage, addOrderNote, updateContact) |
| `cas_reject` | `kb_search` + `getActiveOrderByPhone` + `moveOrderToStage` |

### 3.3 KB schema actual

- Tabla: `agent_knowledge_base`
- Embedding: `text-embedding-3-small` 1536-dim (HNSW index)
- RPC: `match_knowledge_base(workspace_id, agent_id, embedding, category=null, limit=3)`
- Categorías (CHECK constraint): `product / policies / edge-cases / faqs-no-templated`
- 18 topics totales para somnio-sales-v4

### 3.4 Templates schema actual

- Tabla: `agent_templates`
- Priority: `CORE` (siempre se envía) + `COMPLEMENTARIA` (se envía si aplica)
- 38 templates para somnio-sales-v4 (intents informacionales + sales actions)
- Algunos intents NO tienen template — son transition triggers (quiero_comprar, tiempo_entrega)

---

## 4. Lo que aprendimos sobre la arquitectura (insights duros)

### 4.1 La confidence es un proxy de "template fit", no de "intent clarity"

La pregunta correcta NO es "¿estás seguro del intent?" sino "¿el template puede responder ESTA pregunta?". Confundir esto produce calibración brittle (Iter 7f).

### 4.2 Pattern matching no escala

Few-shots con phrasings literales requieren cobertura exhaustiva. Imposible. Mejor: dar al modelo el CONTENIDO real del template + qué cubre/no cubre. El modelo razona, no copia.

### 4.3 Errors silenciosos son los más peligrosos

El bug 7h (OPENAI_API_KEY missing) vivió 3 días porque:
- El throw se convertía en tool-error
- El tool-error producía no_match
- El no_match producía handoff silente (UX intencional)
- Cliente no se quejaba (sandbox)
- Logs nunca llegaron al console.log (throw ocurría antes)
- Outcome reason="low_confidence" no mencionaba el tool-error

**Conclusión:** cada layer debe emitir telemetría de su propia salud. Si un tool falla, debe emit error a un canal observable, no convertirse en "no_match silencioso".

### 4.4 LLM tool descriptions son contratos críticos

El modelo NO infiere intención del diseñador. Si `category` tiene 4 valores enum sin documentación de qué significa cada uno, el modelo asignará semánticas propias. El JSON schema NO es suficiente — necesita `describe()` con definiciones o reglas.

### 4.5 Sandbox vs Production tienen paths divergentes

- Production: webhook → Inngest → agent → escribe `agent_observability_*` tables
- Sandbox: server action → agent → in-memory collector (null en sandbox)

Esto rompe debugging porque sandbox NO persiste observability. Workarounds usados:
- console.log → Vercel logs (works but slow to query)
- Debug payload en V4AgentOutput → renderizado en inspector UI (works pero requires wiring)

### 4.6 El debug view del sub-loop fue clave para descubrir Iter 7h

Sin el sub-loop debug tab que muestra `toolCalls` + `toolResults` + `kbHits`, no habríamos visto que kb_search retornaba "pending" → llevándonos a investigar la env var. **Inversión de tiempo en observability = ROI alto en debugging time.**

---

## 5. Preguntas arquitectónicas abiertas (orden de prioridad)

### Q1: Category filter — mantener o quitar?

**Contexto:** el modelo eligió `faqs-no-templated` para "alcohol" porque interpretó literal el nombre. RPC filtró → KB con contenido correcto (en `edge-cases`) quedó invisible.

**Tradeoff:**
- **Mantener** y documentar: depende de que modelo siga reglas. No garantizado.
- **Quitar**: 100% seguro, sacrifica una optimización teórica (que con 18 topics no aporta nada real)

**Mi recomendación inicial:** quitar. Pero la decisión depende de si en el futuro el KB crece a 100+ topics, ahí el scoped search puede valer.

**Subdecisión:** si quitamos, ¿lo eliminamos del schema DB también? Probablemente NO — sigue siendo útil para source organization (D-47/D-48).

### Q2: ¿El sub-loop debería poder emitir `template` outcome?

Actualmente los 3 outcomes son: `template / canonical / no_match`. El `template` outcome existe pero ¿se usa? Cuando el modelo decide `status='template'` con `responseTemplate='X'`, el sistema emite el template de intent X.

Problema potencial: si el modelo emite `template` con un intent que NO se evaluó originalmente, podríamos terminar enviando un template fuera de turno (sin pasar por el state machine).

**Preguntas:**
- ¿Cuándo es legítimo que sub-loop emita `template`?
- ¿Debería el sub-loop respetar la transition actual de la state machine?
- ¿O el sub-loop tiene precedencia absoluta sobre el state machine?

### Q3: Template + KB overlap — ¿quién gana?

Para `contraindicaciones` tenemos:
- Template CORE+COMPLEMENTARIA: "no efectos secundarios. Sin embargo, si tomas anticoagulantes, consultá al médico."
- KB `product/contraindicaciones`: "NO se recomienda en: menores 14, embarazadas, autoinmunes, anticoagulantes."

Estos contradicen un poco:
- Template dice "consultá médico" para anticoagulantes (soft)
- KB dice "NO se recomienda" para anticoagulantes (hard)

**Preguntas:**
- Si el cliente pregunta sobre embarazada → comprehension da NO_CUBRE → sub-loop → KB hit `uso_en_embarazo` → canonical "NO recomendamos durante embarazo". Bien.
- Si el cliente pregunta sobre anticoagulantes → comprehension da CUBRE (template-fit) → template "consultá médico". Pero KB tiene info más estricta que ni se consulta.
- **¿Es correcto que el template responda con info SOFT cuando KB tiene info HARD sobre el mismo tema?**
- **¿Deberíamos hacer que ciertos intents SIEMPRE pasen por sub-loop para KB-first responses?**

### Q4: ¿Cómo se mantiene sync entre templates y scope CUBRE/NO CUBRE?

El prompt actual lista el contenido del template + CUBRE/NO CUBRE. Si alguien cambia el template (Iter 8), tiene que actualizar el scope también. **No hay enforcement automático.**

**Preguntas:**
- ¿Deberíamos generar el scope desde el template content automáticamente?
- ¿O documentar en LEARNINGS que cualquier cambio de template requiere update del prompt?
- ¿Hay un test que falla si template content diverge del prompt scope?

### Q5: Observability persistence en sandbox

Sandbox debugger ya muestra el sub-loop tab con toolCalls + KB hits + outcome. Pero NO persiste en DB. Esto limita:
- Análisis histórico ("¿cuántas veces el sub-loop falló esta semana?")
- Comparación entre runs ("este turn vs el anterior")
- Debugging de bugs intermitentes

**Preguntas:**
- ¿Deberíamos wiring el collector en sandbox path para escribir a `agent_observability_*`?
- O ¿es overkill para sandbox y mejor mantenerlo solo en prod?

### Q6: ¿La arquitectura escala para nuevos casos NO-CUBRE?

Cada vez que el cliente pregunta algo NO listado en KB (ej: "tengo apnea"), sub-loop dispara → no_match → handoff silente. **No tenemos mecanismo para descubrir gaps de KB automáticamente.**

El CONTEXT.md menciona `agent_unknown_cases` table + UI clustering (D-05). ¿Está implementado? ¿Es prioridad?

### Q7: Pipeline ordering — ¿reasoning antes o después de comprehension?

Actualmente comprehension corre primero, después escalation decide si sub-loop. Pero el sub-loop también razona. **¿Por qué tenemos dos LLMs razonando del mismo mensaje?**

Alternativa: un solo LLM call (más caro pero más simple) que decide directamente: ¿template directo? ¿KB lookup? ¿no_match?

Probablemente fuera de scope para Iter 7. Pero anotar para futuras iteraciones.

---

## 6. Decisión inmediata para próxima sesión

**El bug actual (Iter 7i — category misuse) bloquea el smoke A pass.** Hay que decidir entre:

### Opción A (mantener category, documentar)
- Update tool description con definición explícita de cada categoría
- Update sub-loop prompt: "default null. Solo pasar category si query SOLO encaja en un bucket"
- Lista textual de topics por categoría en el prompt
- **Pros:** flexibility futura, optimización válida con KB grande
- **Cons:** depende de model compliance, 30+ líneas de prompt extras

### Opción B (quitar category — recomendada)
- Eliminar `category` del `inputSchema` de la tool
- Mantener `category` en DB para source organization
- Sub-loop nunca filtra — busca en TODAS las categorías siempre
- **Pros:** 100% safe contra misuse, simpler prompt
- **Cons:** pierde optimización scoped (irrelevante con 18 topics)

### Opción C (híbrido — castigar mal uso)
- Mantener parámetro pero la tool internamente:
  - Si `category='faqs-no-templated'` y query menciona keywords de edge-cases (alcohol, embarazada, niño, medicamento) → log warning + ignorar category
  - Else → respetar category
- **Pros:** safety net + flexibility
- **Cons:** complejidad mayor, falsos positivos posibles

---

## 7. Trabajo paralelo concurrente

La **otra instancia** está terminando el sub-loop debug view (commits `84a172e` + `06f931d` ya pushed, plus possibly more). El view ya muestra toolCalls + toolResults + KB hits + outcome. Status:
- ✅ types foundation (debug-payload.ts)
- ✅ onDebug callback hook en runSubLoop
- ⏳ tab UI completo (en progreso o terminado)

Si terminó, el debug view es la herramienta principal para validar los próximos fixes.

---

## 8. Commits chain de esta sesión (cronológico)

```
dbddb7d - Iter 7a: alcohol calibration (lower confidence 0.92 → 0.30)
89dfe6e - Iter 7b: destructure inside try/catch (sub-loop wrap)
b8808c1 - Iter 7c: peek subLoopResult fields for diagnostics
a2afb45 - Iter 7d: stopWhen 4→6 + prompt convergence + v6 names
f3f7e30 - Iter 7e: kb_search logging (broken TS)
9eb0fb0 - Iter 7e fix: TS strict h: KbHit annotation
84a172e - (otra instancia) debug-payload types foundation
06f931d - (otra instancia) runSubLoop onDebug callback
7995d5d - Iter 7f: template-fit framing (re-frame ~80 few-shots → scope per intent)
df4d791 - Iter 7g: cardiac generalization (heart meds CUBRE)
b0b2fd9 - Iter 7h: embed.ts fallback OPENAI_API_KEY_SALESV4
```

---

## 9. Re-entry checklist post-compact

Cuando re-arranquemos:

1. Read this doc completo
2. Decide Q1 (category filter A/B/C) — esa es la decisión crítica que bloquea Iter 7i
3. Si terminó la otra instancia del debug view, ver screenshot del tab funcionando
4. Probar smoke completo: alcohol / embarazo / niños / sertralina / lupus con el debug view activo
5. Si los 5 dan canonical → Iter 7 cerrado, mover a Iter 8 (audit templates) o Plan 08 (flip productivo)
6. Si alguno falla → iterar específicamente sobre ese caso con la observability ahora visible

---

## 10. Critical constants (no cambiar sin razón)

- Workspace Somnio: `a3843b3f-c337-4836-92b5-89c58bb98490`
- threshold prod: `0.70` (`platform_config.somnio_v4_low_confidence_threshold`)
- Sub-loop stopWhen: `stepCountIs(6)` (post-7d)
- Embed model: `text-embedding-3-small` 1536-dim
- HEAD actual: `b0b2fd9`
- v4 status en prod: DORMANT (no routing rule → no traffic to v4 → v3 sigue activo)
