# Somnio v4 RAG Generative — DISCUSSION LOG

**Standalone:** `somnio-v4-rag-generative`
**Discuss-phase:** informal en sesión 2026-05-15/16 (transcrito a este log)
**Status:** 26 decisiones locked + slots para nuevas (research-phase + plan-phase pueden agregar)

---

## Cómo funciona este log

Cada decisión tiene formato:
```
### D-XX — <título corto>
**Tema:** <de qué tema>
**Status:** locked | revisable | open
**Decisión:** <decisión concreta>
**Por qué:** <razón explícita>
**Implica:** <consecuencias / restricciones>
```

Las decisiones `locked` no se revisan sin abrir nueva discusión.
Las `revisable` son pre-research-phase y pueden refinarse cuando research valide o invalide supuestos.
Las `open` son slots para sub-decisiones que la conversación informal no cubrió completo.

---

## Tema 1 — Formato del KB nuevo

### D-01 — Estructura del KB en 6 secciones
**Tema:** Formato del KB
**Status:** locked
**Decisión:** Cada KB doc tiene EXACTAMENTE estas secciones:
1. Frontmatter (metadata YAML)
2. `## Hechos del producto`
3. `## Posición del negocio`
4. `## Debe contener la respuesta`
5. `## NUNCA decir`
6. `## Cuándo escalar a humano`

**Por qué:** El approach RAG necesita material fuente estructurado (no respuesta enlatada). 6 secciones cubren: datos verificables + intención comercial + checklist de respuesta + restricciones + reglas de handoff.

**Implica:** Plan 01 actualiza `parser.ts` con schema nuevo. Plan 02 reescribe los 18 KBs siguiendo esta plantilla.

### D-02 — Hechos y Posición del negocio separados
**Tema:** Formato del KB
**Status:** locked
**Decisión:** `## Hechos del producto` y `## Posición del negocio` son secciones DISTINTAS.

**Por qué:** Los hechos son verificables ("la melatonina potencia el alcohol"). La posición es una decisión comercial ("no recomendamos combinar"). Separarlos hace explícito que la posición se puede modular sin cambiar los hechos.

**Implica:** El modelo de generación lee ambas y las usa según corresponda. Si el cliente pregunta "qué es la melatonina" → usa Hechos. Si pregunta "puedo combinar con alcohol" → usa Hechos + Posición.

### D-03 — Debe contener con prefijos `[SIEMPRE]` / `[SI APLICA]`
**Tema:** Formato del KB
**Status:** locked
**Decisión:** Cada item de `## Debe contener la respuesta` empieza con uno de dos prefijos:
- `[SIEMPRE]` — requirement obligatorio en cualquier respuesta del topic
- `[SI APLICA]` — requirement condicional según el caso del cliente

**Por qué:** Resuelve la tensión entre lista estricta (validable mecánicamente) y guía blanda (adaptable a contexto). Cada item es validable per-item, pero la aplicación es condicional.

**Implica:** El response_confidence se puede auto-calcular: ¿cumplo los [SIEMPRE]? ¿Los [SI APLICA] relevantes están cubiertos? Si algún [SIEMPRE] falla → confidence < 0.70.

### D-04 — Casos específicos absorbidos en Debe contener
**Tema:** Formato del KB
**Status:** locked
**Decisión:** La sección `## Si el cliente insiste` del formato actual NO se mantiene como sección dedicada. Sus sub-escenarios se absorben dentro de `## Debe contener` como items `[SI APLICA]`.

**Por qué:** Evita duplicar información (canonical + casos). Si los sub-escenarios son requirements condicionales, viven naturalmente en "Debe contener".

**Implica:** En la migración (Plan 02), revisar el contenido actual de "Si el cliente insiste" y trasladarlo a items condicionales de "Debe contener".

### D-05 — Tono global, no per-topic
**Tema:** Formato del KB
**Status:** locked
**Decisión:** El tono ("cálido pero firme, sin moralismo, breve") se define UNA vez globalmente en el system prompt del modelo de generación. NO se repite en cada KB. Override solo si un topic realmente lo necesita (ej. `insomnio_largo_plazo` puede requerir más empatía).

**Por qué:** Evita redundancia 18 veces. Cambios de tono son globales por naturaleza.

**Implica:** El system prompt del modelo de generación incluye el "Tono Somnio" base. Topics con override declaran `tone_override: <texto>` en frontmatter.

### D-06 — Re-validar similarity post-migración
**Tema:** Formato del KB
**Status:** locked
**Decisión:** Después de Plan 02 (reescritura), los embeddings cambian. Aceptamos re-correr smoke completo para validar que las similarities siguen siendo aceptables. NO diseñamos un campo `summary` separado para "estabilizar" la búsqueda.

**Por qué:** Premature optimization. Con 18 topics el ranking top-3 funciona bien sin estabilización adicional. Si en el futuro la KB crece a cientos, podemos agregar `summary` field.

**Implica:** Smoke A (Plan 05) puede revelar que algunas queries que matcheaban antes ya no lo hacen. Eso se considera parte del eval — no bloquea el rediseño.

---

## Tema 2 — Motor de generación

### D-07 — Tooling sigue GPT-4o mini
**Tema:** Motor LLM
**Status:** locked
**Decisión:** El LLM que hace tool calling (`kb_search` en low_confidence/razonamiento_libre, mutaciones en crm_mutation/cas_reject) sigue siendo `gpt-4o-mini` vía `@ai-sdk/openai`.

**Por qué:** GPT-4o mini con AI SDK v6 + tools + Output schema es la combinación que sabemos que funciona en este codebase. La limitación H-2 (Gemini no soporta tools+Output combinados) NO ha cambiado.

**Implica:** `sub-loop/index.ts` mantiene `getOpenAI()('gpt-4o-mini')` para la fase de tool calling. NO migrar tooling a Gemini en este standalone.

### D-08 — Generación con Gemini Flash NORMAL
**Tema:** Motor LLM
**Status:** locked (con A/B comparison pendiente vs Flash-Lite)
**Decisión:** El LLM que genera el texto de respuesta al cliente es `gemini-2.5-flash` (NO Flash-Lite). Sin tools, con Output schema. Llamada separada de la de tooling.

**Por qué:** Generación matizada (tono cálido pero firme, adaptarse a contexto, sub-escenarios) requiere capability superior a clasificación/extracción. Flash > Flash-Lite en redacción.

**Implica:** Plan 03 implementa la 2da call al sub-loop usando Gemini Flash. Costo marginal (~$0.80/día en 1000 turns vs $0.20/día con Flash-Lite).

**A/B comparison pendiente:** Plan 05 incluye corrida con Flash-Lite también. Si Jose juzga indistinguible → downgrade a Flash-Lite en Plan 07.

### D-09 — Validación NUNCA-decir sigue Flash-Lite
**Tema:** Motor LLM
**Status:** locked
**Decisión:** `checkNuncaDecir` (post-generation guardrail) sigue usando `gemini-2.5-flash-lite`. Sin cambios.

**Por qué:** Es un boolean check, perfecto para Flash-Lite. Ya funciona. No tocar.

**Implica:** `sub-loop/nunca-decir-check.ts` no se modifica en este standalone.

### D-10 — Temperatura generación = 0.3
**Tema:** Motor LLM
**Status:** locked
**Decisión:** El modelo de generación corre con `temperature: 0.3`.

**Por qué:** Variación natural sin alucinar. 0.0 = rígido y repetitivo; 0.7+ = riesgo de creatividad indeseada en producto médico-adyacente.

**Implica:** Plan 03 configura esto en la llamada a `generateText`.

### D-11 — Handoff tooling → generación = B1
**Tema:** Motor LLM
**Status:** locked
**Decisión:** GPT-4o mini en tooling phase:
1. Llama `kb_search`
2. Recibe los 3 hits
3. **Selecciona UN topic ganador** (no pasa los 3 a Gemini)
4. Emite `{ topic_seleccionado, hits_relevantes }` a Gemini

Gemini Flash en generación phase recibe SOLO el topic ganador como material. NO ve los otros 2 hits.

**Por qué:** Evita duplicación de razonamiento (que ambos modelos elijan). GPT mini es eficiente en selección + tooling, Gemini es eficiente en redacción.

**Implica:** Schema intermedio bien definido entre las dos calls. Plan 03 implementa este contrato.

### D-12 — crm_mutation y cas_reject sin cambios
**Tema:** Motor LLM
**Status:** locked
**Decisión:** Los paths `crm_mutation` y `cas_reject` del sub-loop NO migran al approach RAG. Siguen con GPT-4o mini puro (tools + Output en MISMA call, como hoy).

**Por qué:** Esos paths no generan texto libre al cliente — emiten templates post-mutación. La generación matizada no aplica. Cambiar algo ahí es riesgo sin beneficio.

**Implica:** En Plan 03, el switch por reason mantiene el flow viejo para mutation/cas_reject. Solo low_confidence y razonamiento_libre cambian.

---

## Tema 3 — response_confidence

### D-13 — Definición operacional del confidence
**Tema:** response_confidence
**Status:** locked
**Decisión:** `response_confidence` se define como:

> "La respuesta que generé usando SOLO el material del KB responde la pregunta específica del cliente"

**Por qué:** Es la única definición objetiva. Otras definiciones (¿mi respuesta es correcta? ¿hay riesgo de daño?) son subjetivas o se cubren con otros mecanismos (NUNCA-decir).

**Implica:** El prompt del modelo de generación instruye al modelo a auto-reportar este confidence reflejando su experiencia generando. El modelo NO calcula un número abstracto — reporta qué tan completa salió su respuesta dado el material disponible.

### D-14 — Threshold = 0.70 único
**Tema:** response_confidence
**Status:** locked
**Decisión:** Si `response_confidence < 0.70` → handoff silente. Threshold único para todas las categorías de KB.

**Por qué:** Simetría con threshold de comprehension (también 0.70 — leído de `platform_config`). Threshold único = más simple, menos calibración. Si edge-cases necesita más estricto, ajustamos en eval.

**Implica:** Plan 04 (calibración) usa 0.70 como cutoff en few-shots. Si en Smoke A vemos demasiados borderline pasando, podemos endurecerlo en Plan 07.

### D-15 — Auto-reporte por el modelo de generación
**Tema:** response_confidence
**Status:** locked
**Decisión:** El response_confidence es emitido por el MISMO LLM que genera la respuesta (Gemini Flash). NO hay un juez externo.

**Por qué:** Simplicidad. Una sola call. Si el modelo es overconfident en la práctica → migramos a opción "juez separado" en V2.

**Implica:** Plan 03 incluye `responseConfidence: z.number()` en el output schema de la llamada de generación.

### D-16 — Anti-invención por instrucción de prompt
**Tema:** response_confidence
**Status:** locked
**Decisión:** El prompt del modelo de generación incluye reglas duras: "SOLO usa info del KB", "NO inventes", "Si te falta info, reflejá en confidence bajo".

**Por qué:** Modelo razona mejor con reglas explícitas. No es validación post-hoc (eso es D-18).

**Implica:** Plan 04 (calibración) incluye few-shots demostrando rechazo a inventar.

### D-17 — Calibración con few-shots + reglas explícitas
**Tema:** response_confidence
**Status:** locked
**Decisión:** El prompt del modelo de generación incluye:
- 8-10 few-shots (pregunta + material + respuesta + confidence + razón)
- 3-4 reglas explícitas de calibración (ej. "si pregunta menciona condición médica NO listada en KB → confidence < 0.70")

**Por qué:** LLMs son notoriamente overconfident por default. Few-shots enseñan rangos. Reglas explícitas cubren casos generales.

**Implica:** Plan 04 es íntegramente sobre esta calibración. Few-shots se iteran en Smoke A si resultados son malos.

### D-18 — checkSourceGrounding diferido a V2
**Tema:** response_confidence
**Status:** locked
**Decisión:** No implementamos validación post-hoc de "cada claim del responseText tiene anchor en el KB" en V1. Confiamos en el prompt para anti-invención.

**Por qué:** Over-engineering pre-evidencia. Si en Smoke A detectamos casos donde el modelo inventó, agregamos check en V2. Sino, vivimos sin él.

**Implica:** Plan 05 (Smoke A) verifica manualmente si hay invención. Si Jose detecta 1+ caso de invención → diferir flip productivo + agregar `checkSourceGrounding` antes de Plan 08.

---

## Tema 4 — Guardrails

### D-19 — confidence < 0.70 dispara handoff silente directo
**Tema:** Guardrails
**Status:** locked
**Decisión:** Si el modelo emite `responseConfidence < 0.70`, el sub-loop emite outcome `no_match` (handoff silente). El `responseText` se descarta.

**Por qué:** Mantiene el contrato UX existente: handoff = nada al cliente, `requires_human=true`.

**Implica:** Plan 03 implementa este threshold check en el orchestrator del sub-loop.

### D-20 — NUNCA-decir violation = handoff silente (unchanged)
**Tema:** Guardrails
**Status:** locked
**Decisión:** Si el responseText pasa el confidence pero falla `checkNuncaDecir`, sub-loop emite `no_match`. Sin cambios respecto a hoy.

**Por qué:** Comportamiento UX establecido. Funciona.

**Implica:** `nunca-decir-check.ts` NO se modifica. Plan 03 mantiene la llamada después de la generación.

### D-21 — Anti-invención SIN validación post-hoc en V1
**Tema:** Guardrails
**Status:** locked (revisable en V2)
**Decisión:** No corremos `checkSourceGrounding` en V1. El prompt es la única defensa.

**Por qué:** Ya cubierto en D-18.

**Implica:** Smoke A es el primer punto donde detectaríamos invención. Si pasa limpio → V1 OK.

### D-22 — Timeout/error Gemini = catch wrap existente
**Tema:** Guardrails
**Status:** locked
**Decisión:** Si Gemini Flash (generación) falla por timeout, schema parse error, etc., el catch wrap de `runSubLoop` (que ya existe) lo maneja. Outcome: error propagado, agent-level handler decide.

**Por qué:** No reinventar resilience. Lo existente funciona.

**Implica:** Plan 03 extiende el catch wrap si la nueva call de Gemini necesita campos de diagnóstico extra (ej. response_confidence reportado pre-fallo).

---

## Tema 5 — Migración y eval

### D-23 — Big-bang en migración
**Tema:** Migración
**Status:** locked
**Decisión:** Los 18 KBs se reescriben en UN solo plan (Plan 02). NO migramos gradual (5 + 13).

**Por qué:** v4 está dormant, "riesgo operacional" es teórico. Big-bang es más simple, menos código de coexistencia. Los 18 KBs son chicos (~30 líneas cada uno).

**Implica:** Plan 02 es un plan grande pero atómico. Commit único con los 18 archivos reescritos.

### D-24 — Borrar canonical verbatim + migración atómica (A+C)
**Tema:** Migración
**Status:** locked
**Decisión:** El código de canonical verbatim del sub-loop se BORRA, no se mantiene como fallback. KB schema + sub-loop nuevo cambian en el MISMO commit (atómico).

**Por qué:** Mantener fallback = complejidad permanente + oculta bugs. v4 dormant = sin riesgo operacional. Si Gemini falla → handoff silente (mismo behavior que mantener canonical pero más simple).

**Implica:** Plan 03 elimina:
- `LoopOutcomeSchema.status: 'canonical'` (queda solo `generated` y `no_match`)
- `output.canonicalText` (queda `responseText`)
- Toda referencia a "canonical verbatim" en prompts

Plan 02 + Plan 03 conforman un solo "deploy unit" — si uno se aplica sin el otro, runtime rompe.

### D-25 — Smoke A: 17 casos del rediseño RAG
**Tema:** Eval
**Status:** locked
**Decisión:** Smoke A cubre 17 casos:

```
edge-cases (5):
  - alcohol
  - embarazo
  - niños
  - sertralina
  - lupus

product (4):
  - cómo se toma
  - qué ingredientes tiene
  - cuánto trae el frasco
  - es adictivo

policies (3):
  - cuánto tarda a Medellín
  - cómo pago
  - garantía / devolución

faqs-no-templated (2):
  - cuántas horas dura
  - qué hábitos ayudan

casos negativos (3 — esperamos handoff):
  - tengo apnea
  - envío a Miami
  - pago con criptomonedas
```

**Por qué:** Cobertura representativa de las 4 categorías del KB + casos límite que prueban el handoff por confidence bajo.

**Implica:** Plan 05 corre estos 17 casos en sandbox v4. SMOKE-A-RESULTS.md captura veredictos.

### D-26 — Judge híbrido — LLM filtra + Jose revisa los 17
**Tema:** Eval
**Status:** locked
**Decisión:** En Smoke A y B:
1. LLM-as-judge (Gemini Flash separado) emite veredicto preliminar por caso
2. Jose revisa los 17 (Smoke A) + 10 (Smoke B) personalmente
3. Veredicto final = Jose

**Por qué:** LLM-as-judge acelera pero Jose es el dueño del producto. Las dos miradas son complementarias.

**Implica:** Plan 05 incluye prompt para LLM-as-judge + UI o tabla simple donde Jose marque veredictos. SMOKE-A-RESULTS.md tiene ambas columnas.

---

## Tema 6 — Operacionalización

### D-27 — Nombre del standalone
**Tema:** Operacionalización
**Status:** locked
**Decisión:** Nombre = `somnio-v4-rag-generative`.
**Por qué:** Claro, alineado con vocabulario técnico (RAG = Retrieval-Augmented Generation).

### D-28 — Plan 07 actual (Smoke A canonical) se CIERRA
**Tema:** Operacionalización
**Status:** locked
**Decisión:** El Plan 07 del standalone hermano `somnio-sales-v4-runtime-wiring` (Smoke Wave A con approach canonical) se cierra con SUMMARY explicando que fue superseded por este standalone. Plan 08 del hermano (flip productivo) se cancela — el equivalente vive en Plan 08 de este standalone.

**Por qué:** El smoke A actual valida una arquitectura que vamos a borrar. Mantenerlo abierto induce confusión.

**Implica:** Cierre formal pendiente al arrancar — task adicional.

### D-29 — GSD completo, NO saltar discuss-phase
**Tema:** Operacionalización
**Status:** locked
**Decisión:** Aunque la discusión informal ya pasó, el discuss-phase formal queda capturado en este DISCUSSION-LOG.md. Después corre research-phase, plan-phase, execute-phase, verify-phase (Regla 0 CLAUDE.md).

**Por qué:** El proceso protege calidad. Saltar pasos para "ahorrar tokens" está prohibido (Regla 0).

**Implica:** Research-phase es el siguiente paso. Plan-phase produce 8 PLAN.md files. Execute corre por orden.

### D-30 — Estructura de 8 plans
**Tema:** Operacionalización
**Status:** locked
**Decisión:** Plans del standalone:

```
01-PLAN: KB schema update (parser.ts, sync.ts, RPC retorno, migración DB)
02-PLAN: Reescribir 18 KBs en formato nuevo
03-PLAN: Sub-loop nuevo (split tooling/generación) + borrar canonical (atómico)
04-PLAN: Few-shots de calibración del prompt Gemini Flash
05-PLAN: Smoke A — low_confidence (17 casos) + LLM-as-judge automation
06-PLAN: Smoke B — regression (razonamiento_libre + crm_mutation + state machine + cas_reject)
07-PLAN: Iter sobre resultados de ambos smokes (HOLD — placeholder)
08-PLAN: Flip productivo (SQL routing_rule activación v4)
```

**Por qué:** Estructura propuesta cubre arquitectura + ejecución + validación + flip. Plan 07 es hold por si surgen iters.

**Implica:** Plan-phase formaliza cada uno con criterios de éxito, dependencias, deliverables. Plan 02 depende de Plan 01. Plan 03 depende de Plan 02 (deploy unit). Plans 04-06 dependen de Plan 03. Plan 08 depende de smoke A + B passing.

---

## Slots para nuevas decisiones (D-31+)

Research-phase y plan-phase pueden agregar D's aquí. Por ejemplo:
- D-31 (potencial): Schema DB exacto de `agent_knowledge_base` post-migración
- D-32 (potencial): Naming del campo del responseText en el LoopOutcomeSchema
- D-33 (potencial): Cómo se persiste el response_confidence en `agent_observability_*` tables
- D-34 (potencial): Patrón para LLM-as-judge prompt
- D-35 (potencial): Estructura de SMOKE-A-RESULTS.md para máxima legibilidad para Jose

Estos quedan como recordatorios; research-phase los desarrolla.
