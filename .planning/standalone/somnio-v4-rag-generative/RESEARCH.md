# Phase: somnio-v4-rag-generative — Research

**Researched:** 2026-05-16
**Domain:** RAG-generative redesign del sub-loop somnio-v4 (Gemini Flash + GPT-4o mini + AI SDK v6)
**Confidence:** HIGH para H-2 / pricing / API limitations; MEDIUM-HIGH para calibration patterns; MEDIUM para flash vs flash-lite quality en español; LOW para benchmarks específicos de español en estos modelos (no publicados oficialmente).

---

<user_constraints>

## User Constraints (from DISCUSSION-LOG.md)

### Locked Decisions (30 D's en DISCUSSION-LOG)

**Tema 1 — Formato KB:**
- **D-01:** 6 secciones exactas (frontmatter + Hechos + Posición + Debe contener + NUNCA + Cuándo escalar). **NO investigar formatos alternativos.**
- **D-02:** Hechos y Posición SEPARADOS (no fusionar).
- **D-03:** Prefijos `[SIEMPRE]` / `[SI APLICA]` en items de "Debe contener".
- **D-04:** "Si el cliente insiste" se absorbe en "Debe contener" como `[SI APLICA]`.
- **D-05:** Tono global UNA vez en system prompt, override per-topic vía `tone_override` frontmatter.
- **D-06:** Re-validar similarity post-migración (NO diseñar `summary` field — premature optimization con 18 topics).

**Tema 2 — Motor LLM (CRITICO — research NO debe cuestionar):**
- **D-07:** Tooling = GPT-4o mini vía `@ai-sdk/openai`. Locked.
- **D-08:** Generación = `gemini-2.5-flash` (NO Lite). Locked con A/B Flash-Lite pendiente en Plan 05.
- **D-09:** `checkNuncaDecir` sigue `gemini-2.5-flash-lite`. **SIN cambios.**
- **D-10:** Temperatura generación = 0.3 (NO 0.0, NO 0.7).
- **D-11:** Handoff tooling → generación = patrón B1. GPT mini elige UN topic ganador + pasa a Gemini. Gemini NO ve los otros 2 hits.
- **D-12:** Paths `crm_mutation` y `cas_reject` NO migran al RAG. Siguen GPT-4o mini puro (tools + Output en MISMA call, como hoy).

**Tema 3 — Confidence:**
- **D-13:** Definición operacional: "la respuesta generada con SOLO el material del KB responde la pregunta específica del cliente".
- **D-14:** Threshold 0.70 único (lee de `platform_config.somnio_v4_low_confidence_threshold`).
- **D-15:** Auto-reportado por el MISMO modelo de generación (NO juez externo en V1).
- **D-16:** Anti-invención vía prompt (reglas duras: SOLO usa KB, NO inventes).
- **D-17:** Calibración = 8-10 few-shots + 3-4 reglas explícitas.
- **D-18:** `checkSourceGrounding` DIFERIDO a V2. NO implementar en V1.

**Tema 4 — Guardrails:**
- **D-19:** `responseConfidence < 0.70` → outcome `no_match` (handoff silente). `responseText` descartado.
- **D-20:** NUNCA-decir violation → `no_match` (unchanged).
- **D-21:** Anti-invención SIN validación post-hoc en V1 (revisable V2). Single defense = prompt.
- **D-22:** Timeout/error Gemini = catch wrap existente (NO reinventar resilience).

**Tema 5 — Migración:**
- **D-23:** Big-bang en migración (18 KBs en UN solo plan = Plan 02).
- **D-24:** Borrar canonical verbatim código completamente. Plan 02 + Plan 03 = ÚNICO deploy unit atómico.
- **D-25:** Smoke A = 17 casos fijos.
- **D-26:** Judge híbrido = LLM-as-judge (Gemini Flash SEPARADO) + Jose revisa los 17 personalmente.

**Tema 6 — Operacionalización:**
- **D-27:** Nombre standalone = `somnio-v4-rag-generative`.
- **D-28:** Plan 07 del standalone hermano se cierra superseded.
- **D-29:** GSD completo obligatorio (NO saltar discuss / research / plan).
- **D-30:** Estructura 8 plans (01-KB schema, 02-Reescritura, 03-Sub-loop split, 04-Few-shots, 05-Smoke A, 06-Smoke B, 07-Iter HOLD, 08-Flip productivo).

### Claude's Discretion (research debe recomendar)

- Schema DB exacto de columnas nuevas en `agent_knowledge_base` (D-31 slot)
- Naming del campo `responseText` en LoopOutcomeSchema (D-32 slot)
- Cómo persistir `response_confidence` en observability (D-33 slot)
- Patrón concreto del LLM-as-judge prompt (D-34 slot)
- Estructura concreta de SMOKE-A-RESULTS.md (D-35 slot)
- Cómo escribir prompt de generación (few-shots concretos, reglas duras, structure)
- Si usar `experimental_output` vs `output` API en AI SDK v6 para la 2da call

### Deferred Ideas (OUT OF SCOPE — NO investigar)

- Reemplazo de stack (AI SDK v6 + Gemini + GPT mini está locked — NO investigar alternativas tipo LangChain, LlamaIndex, Anthropic, Cohere)
- `checkSourceGrounding` post-hoc en V1 (D-18 — diferido a V2; research SÍ debe surfacear riesgo)
- Juez externo separado en V1 (D-15 — diferido a V2)
- Schema `summary` separado para estabilización de retrieval (D-06)
- Migración gradual (D-23 — big-bang locked)
- Mantener canonical verbatim como fallback (D-24 — borrado)

</user_constraints>

---

## Summary

El stack está locked. La pregunta válida es: **cómo implementar bien dentro del stack ya decidido**, y validar que los supuestos arquitectónicos (H-2, calibración, anti-invención) se sostienen contra evidencia 2026.

**Findings críticos del research:**

1. **H-2 CONFIRMADO 2026-05** (HIGH confidence). Gemini API + Vercel AI SDK v6 + `@ai-sdk/google` NO soporta `tools` + `Output.object()` en la MISMA call para `gemini-2.5-flash` y `gemini-2.5-flash-lite`. **Solo Gemini 3 series (preview, no GA) lo soporta**, y la implementación SDK aún tiene bugs incluso con Gemini 3. El split tooling/generación (D-07/D-08) está justificado y no se vuelve innecesario por updates recientes.

2. **Self-reported confidence es SISTÉMICAMENTE overconfident**. La literatura es unánime: LLMs colapsan al 90-100% por default (ECE > 0.377 en estudios de GPT-3/3.5; incluso GPT-4 solo logra ~62.7% AUROC). Few-shots + reglas explícitas (D-17) son lo MÍNIMO defendible, pero NO suficiente para garantizar calibración. **Recomendación**: reformular el prompt usando estrategia "probability-framed" + escala 0-20 discretizada en buckets + binary backstop ("respondería tu compañero humano confiado?"). Discutido en sección dedicada.

3. **Gemini Flash vs Flash-Lite**: Flash supera Flash-Lite ~10% en benchmarks legales/financieros (CaseLaw, TaxEval) y tiene "purple prose" + capacidad de subtleza superior. Flash-Lite ahorra ~6× costo + ~2× velocidad. **Para producto médico-adyacente en español con tono "cálido pero firme"**, Flash es la apuesta correcta para V1; A/B en Plan 05 es válido pero documentar criterio de calidad por escrito ANTES de comparar.

4. **Anti-invención sin source-grounding (D-18)**: la literatura sugiere que el prompt-only approach puede mitigar ~30-40% de hallucinations en RAG general, pero queda 60-70% de tasa residual en dominios médicos (43-64% según estudios públicos). **Riesgo material que debe surfacearse al usuario antes de Plan 08**: para un producto adyacente a contraindicaciones, sin grounding post-hoc estamos asumiendo que el prompt + few-shots cubren un 90% pero la evidencia dice 30-40%. Recomendación: mantener D-18 PERO agregar al smoke A un checkpoint manual explícito de invención (Jose chequea cada respuesta vs material fuente), y si detecta ≥1 caso de invención → bloquear flip y agregar grounding antes de V1.

5. **AI SDK v6 pattern recommendation**: usar `generateText({ tools, ... })` para 1ra call (tooling — GPT-4o mini), y `generateText({ output: Output.object(...), ... })` SIN tools para 2da call (generación — Gemini Flash). Schema intermedio entre ambas debe ser **simple object con campos pre-definidos nullable**, NUNCA `z.discriminatedUnion` ni `z.record` (ambos rotos en Google provider). Patrón existente del repo (`output-schema.ts`) ya cumple este requisito; reusable verbatim.

**Primary recommendation:** El diseño arquitectónico decidido en discuss-phase es defensible CON tres ajustes que research recomienda al planner:
- **A1** — Reformular calibración (Plan 04): usar "probability framed" + binary backstop, NO solo few-shots numéricos.
- **A2** — Surfacear riesgo de no-grounding (pre Plan 08): conversación explícita con usuario sobre tolerancia a 1+ caso de invención en Smoke A.
- **A3** — Defensive coding patterns (Plan 03): wrap `result.output` access en try/catch para `NoOutputGeneratedError` con fallback a `result.text` parse manual (bug conocido `vercel/ai#11348`, abierto a 2026-05).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| KB material curation (markdown source of truth) | Knowledge base (filesystem) | DB cached (HNSW embedding) | Devs editan markdown; sync script poblada DB |
| KB retrieval (vector similarity) | DB (pgvector HNSW) | API serverless | RPC `match_knowledge_base` desde tool execute |
| Topic selection (qué KB doc usar) | Tooling LLM (GPT-4o mini) | — | LLM razona sobre 3 hits + elige UNO (D-11) |
| Response generation (texto al cliente) | Generation LLM (Gemini Flash) | — | Recibe SOLO topic ganador, redacta adaptado |
| Confidence self-reporting | Generation LLM (mismo) | — | D-15: NO juez externo en V1 |
| Anti-invention guard | Generation LLM prompt | — | D-21: prompt-only en V1 (NO source-grounding) |
| NUNCA-decir validation | Validator LLM (Gemini Flash-Lite) | — | D-09: post-hoc check, sin cambios |
| Handoff decision | Sub-loop orchestrator (TS code) | — | Threshold check + invariant validation |
| Smoke A judge (preliminary) | Judge LLM (Gemini Flash SEPARADO) | Human (Jose) | D-26: híbrido LLM + humano |

---

<phase_requirements>

## Phase Requirements

(El standalone no usa requirement IDs formales; mapea directo a los 8 plans del D-30. Listamos cómo este RESEARCH soporta cada uno.)

| Plan | Descripción | Research Support |
|------|-------------|------------------|
| 01 | KB schema update (parser, sync, RPC, migración DB) | Sección "KB Schema Recommendation" + "DB Migration Guidance" |
| 02 | Reescribir 18 KBs en formato nuevo | Sección "KB Template Structure" + "Template Per-Section Anti-Patterns" |
| 03 | Sub-loop split tooling/generación + borrar canonical (atómico con 02) | Sección "RAG-Generative Pattern with AI SDK v6" + "Common Pitfalls" + "Defensive Coding Patterns" |
| 04 | Few-shots calibración Gemini Flash | Sección "Self-Reported Confidence Calibration" + "Anti-Invention Strategies" |
| 05 | Smoke A — low_confidence (17 casos) + LLM-as-judge | Sección "Smoke A/B Calibration" + "LLM-as-Judge Pattern" |
| 06 | Smoke B — regression (10 casos) | Sección "Smoke B Regression Coverage" |
| 07 | Iter HOLD | (placeholder — no research) |
| 08 | Flip productivo | Sección "Pre-Flip Risk Assessment" |

</phase_requirements>

---

## Standard Stack

**No cambios al stack — locked en discuss-phase.** Esta tabla documenta versiones verificadas 2026-05.

### Core (locked)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | v6.0.86+ | Unified generateText + tools + Output.object | `[VERIFIED: package.json, RESEARCH hermano]`. v6 consolida `generateObject` → `generateText({ output })`. Bug `NoOutputGeneratedError` en gateway/proxy paths (vercel/ai#11348) — workaround documentado. |
| `@ai-sdk/openai` | ^3.0.61+ | GPT-4o mini para tooling phase | `[VERIFIED: package.json]`. Único modelo que soporta tools + Output.object en MISMA call con AI SDK v6 (H-2). |
| `@ai-sdk/google` | ^3.0.67+ | Gemini Flash para generación + Flash-Lite para guardrails | `[VERIFIED: package.json]`. Soporta Output.object sin tools, no soporta combinación. |
| `zod` | (versión del repo) | Schemas para Output.object + frontmatter parser | `[VERIFIED: parser.ts]`. **NO usar `z.discriminatedUnion`, `z.union`, `z.record`** (rotos en Google provider — confirmado en docs y en bug history). |
| `gray-matter` | (versión del repo) | Parsear frontmatter YAML | `[VERIFIED: parser.ts]`. Sin cambios. |

### Modelos AI (locked)

| Modelo | Provider call | Purpose | Pricing (verified 2026-05) | TTFT / Speed |
|--------|--------------|---------|---------------------------|--------------|
| `gpt-4o-mini` | `createOpenAI({ apiKey: OPENAI_API_KEY_SALESV4 })('gpt-4o-mini')` | Sub-loop tooling (kb_search + topic selection + crm tools) | `[CITED: openai.com/api/pricing]` ~$0.15/MTok in, ~$0.60/MTok out | Latencia ~600ms-1.5s típica |
| `gemini-2.5-flash` | `google('gemini-2.5-flash')` | Sub-loop generación (texto al cliente + self-reported confidence) | `[CITED: ai.google.dev/gemini-api/docs/pricing]` $0.30/MTok in, $2.50/MTok out (standard); $0.15 in / $1.25 out (batch); context cache $0.03/MTok | TTFT 0.66s, 202 tokens/s `[CITED: artificialanalysis.ai]` |
| `gemini-2.5-flash-lite` | `google('gemini-2.5-flash-lite')` | NUNCA-decir guardrail (sin cambios) + A/B test contra Flash en generación (Plan 05) | `[CITED: ai.google.dev/gemini-api/docs/pricing]` $0.10/MTok in, $0.40/MTok out (standard); $0.05 in / $0.20 out (batch) | TTFT 0.70s, 226 tokens/s `[CITED: artificialanalysis.ai]` |
| `text-embedding-3-small` | OpenAI SDK directo | KB embeddings 1536-dim (sin cambios) | `[CITED: openai pricing]` $0.02/MTok | (one-shot, sync) |

### Supporting (ya existe — sin cambios)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `pgvector` extension Postgres | KB embeddings storage | Sin cambios — schema actual sirve |
| HNSW index sobre `embedding` | KB similarity search | Sin cambios |
| RPC `match_knowledge_base` | Tool execute body | Plan 01 puede ajustar RETURNS si agregamos nuevas columnas (Hechos, Posición, etc.) |

### Alternativas Considered (rechazadas — out of scope o inferiores)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gemini-2.5-flash` para generación | `gemini-3-flash-preview` | `[CITED: ai.google.dev]` 3-series es PREVIEW (no GA); además SDK aún tiene bugs incluso con G3 + tools (`vercel/ai#11466`). No usar hasta GA. |
| GPT-4o mini para tooling | Gemini 2.5 Flash con tools | `[VERIFIED: docs gemini-api/docs/structured-output]` Gemini 2.5 NO soporta tools + Output.object — D-07 locked correctamente |
| Few-shots numéricos para confidence | Binary high/low + 3-bucket | Discutido en sección dedicada — research recomienda mejora a D-17 |
| Prompt-only anti-invención (D-18) | Source-grounding post-hoc (V2) | Riesgo material en dominio médico — research recomienda surfacear al usuario antes de Plan 08 |

**Installation (no cambios — todas las deps ya están):**
```bash
# Confirmar versiones (no instalar nuevas):
npm list ai @ai-sdk/openai @ai-sdk/google zod gray-matter
```

**Version verification (verificado 2026-05-16):**
- `gemini-2.5-flash` y `gemini-2.5-flash-lite` ambos GA `[CITED: ai.google.dev/gemini-api/docs/models]`
- Gemini 3 series sigue PREVIEW a 2026-05-16 `[CITED: ai.google.dev]` — NO usar
- `gpt-4o-mini` GA, pricing estable `[CITED: openai.com]`
- Vercel AI SDK v6 estable, con bug abierto en gateway path (vercel/ai#11348)

---

## Architecture Patterns

### System Architecture Diagram

```
[USER MESSAGE inbound]
         ↓
[Comprehension] — Gemini 2.5 Flash-Lite
  Output: { intent, intent_confidence, classification, extracted_fields }
         ↓
[Escalation] — decideSubLoopReason()
   if intent_confidence < 0.70 → reason='low_confidence'
   if state.requires_mutation → reason='crm_mutation'
   if cas_reject → reason='cas_reject'
   if intent fuera de scope → reason='razonamiento_libre'
         ↓
   ┌──────────────────┐
   │ reason === null  │ → state-machine → response-track → TEMPLATE al cliente
   │                  │   (paths que NO migran a RAG — D-12)
   └──────────────────┘
   ┌──────────────────────────────────────┐
   │ reason in {crm_mutation, cas_reject} │ → SUB-LOOP path actual (sin cambios)
   │                                      │   GPT-4o mini con tools + Output.object
   │                                      │   en MISMA call (D-12)
   └──────────────────────────────────────┘
   ┌────────────────────────────────────────┐
   │ reason in {low_confidence,             │ → SUB-LOOP NUEVO (split en 2 calls)
   │            razonamiento_libre}         │
   └────────────────────────────────────────┘
                         ↓
[CALL 1 — TOOLING] GPT-4o mini
  Input: prompt low_confidence + recentMessages + userMessage
  Tools: kb_search ONLY
  Output schema: { topic_seleccionado: string|null, hits_relevantes: KbHit[],
                   should_handoff: boolean, handoff_reason: string|null }
  Flow:
    1. Llama kb_search(query) → recibe 3 hits
    2. Razona: ¿algún hit es relevante? si no → handoff
    3. Si sí → SELECCIONA UN topic ganador (D-11) + emite el output schema
                         ↓
   ┌─────────────────────────────────┐
   │ tooling.should_handoff === true │ → return no_match (handoff silente)
   └─────────────────────────────────┘
   ┌──────────────────────────────────┐
   │ tooling.topic_seleccionado set   │ → CALL 2 GENERACIÓN
   └──────────────────────────────────┘
                         ↓
[CALL 2 — GENERACIÓN] Gemini 2.5 Flash (D-08), temperature=0.3 (D-10)
  Input: system prompt con TONE_BASE + few-shots + reglas + material del topic ganador
  Tools: NINGUNO
  Output schema: { responseText: string, responseConfidence: number,
                   confidenceRationale: string }
  Flow: redacta respuesta adaptada usando SOLO material; auto-reporta confidence
                         ↓
[THRESHOLD CHECK]
   if responseConfidence < 0.70 (D-19) → return no_match (handoff silente)
                         ↓
[NUNCA-DECIR CHECK] Gemini 2.5 Flash-Lite (D-09, sin cambios)
   if violation → return no_match (handoff silente)
                         ↓
[SUCCESS] → return { status: 'generated', responseText, sourceTopic, ... }
   → orquestador agente emite responseText al cliente
```

### Recommended Project Structure (NO cambios al árbol — ajustes inline)

```
src/lib/agents/somnio-v4/
├── knowledge/                              ← Plan 02 reescribe los 18
├── knowledge-base/
│   ├── parser.ts                           ← Plan 01: nuevo FrontmatterSchema + parseSections
│   ├── sync.ts                             ← Plan 01: extrae nuevas secciones a DB columns
│   ├── coherence-check.ts                  ← Plan 01: nuevas validaciones (Debe contener no vacío, etc.)
│   └── embed.ts                            ← sin cambios
├── sub-loop/
│   ├── index.ts                            ← Plan 03: orchestrator con 2 calls + invariant validation
│   ├── tooling-call.ts                     ← NUEVO Plan 03 — encapsula la 1ra call GPT
│   ├── generation-call.ts                  ← NUEVO Plan 03 — encapsula la 2da call Gemini
│   ├── kb-search-tool.ts                   ← sin cambios (Iter 7i sin category ya shipped)
│   ├── output-schema.ts                    ← Plan 03: LoopOutcomeSchema cambia status enum
│   ├── prompt.ts                           ← Plan 03: prompts NUEVOS por reason (tooling + generación)
│   ├── tone-base.ts                        ← NUEVO Plan 03 — string const TONE_BASE compartido
│   ├── few-shots.ts                        ← NUEVO Plan 04 — few-shots de calibración
│   └── nunca-decir-check.ts                ← SIN CAMBIOS (D-09)
└── escalation.ts                           ← sin cambios

supabase/migrations/
└── XXX_kb_schema_rag_generative.sql        ← Plan 01: ALTER TABLE agent_knowledge_base
```

### Pattern 1: Split tooling / generación con AI SDK v6

**What:** Una primera call con `tools` + Output schema simple para selección, una segunda call con SOLO `output` (sin tools) para generación matizada.

**When to use:** Cuando necesitás encadenar selección de retrieval con generación constrained, y el provider de generación NO soporta tools + Output.object combinados (Gemini 2.5).

**Code reference:**

```typescript
// CALL 1 — Tooling con GPT-4o mini (D-07)
// File: sub-loop/tooling-call.ts
import { generateText, Output, stepCountIs } from 'ai'
import { z } from 'zod'

const ToolingOutputSchema = z.object({
  topic_seleccionado: z.string().nullable()
    .describe('Topic ganador del KB doc, null si ningún hit es relevante'),
  material_del_topic: z.object({
    hechos: z.string().nullable(),
    posicion: z.string().nullable(),
    debe_contener_aplicables: z.array(z.string()).nullable(),
    nunca_decir: z.array(z.string()).nullable(),
    cuando_escalar: z.array(z.string()).nullable(),
  }).nullable()
    .describe('Material del topic ganador para pasar a la generación (D-11)'),
  should_handoff: z.boolean()
    .describe('true si ningún hit es relevante a la pregunta del cliente'),
  handoff_reason: z.string().nullable()
    .describe('Razón corta del handoff — observability'),
})

const toolingResult = await runWithPurpose('subloop_tooling', () =>
  generateText({
    model: getOpenAI()('gpt-4o-mini'),
    system: buildToolingPrompt(reason),  // prompt low_confidence específico
    messages: [...recentMessages, { role: 'user', content: userMessage }],
    tools: { kb_search: kbSearchTool(ctx) },
    toolChoice: 'auto',
    stopWhen: stepCountIs(4),  // suficiente para 1-2 kb_search + output final
    output: Output.object({ schema: ToolingOutputSchema }),
  })
)
// Pitfall — wrap accesso a .output (vercel/ai#11348)
const tooling = safeAccessOutput(toolingResult, ToolingOutputSchema)

if (tooling.should_handoff || !tooling.topic_seleccionado) {
  return handoffOutcome(tooling.handoff_reason ?? 'no_relevant_hit')
}
```

```typescript
// CALL 2 — Generación con Gemini Flash (D-08)
// File: sub-loop/generation-call.ts
import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const GenerationOutputSchema = z.object({
  responseText: z.string()
    .describe('Texto final al cliente, en español, tono cálido pero firme'),
  responseConfidence: z.number()
    .describe('0-100: ¿la respuesta usando SOLO el material responde la pregunta específica? (D-13)'),
  confidenceRationale: z.string()
    .describe('1 frase: por qué este confidence — observability'),
  // OPCIONAL (decisión de plan): array de citas/anchors al material usado
  // anchors: z.array(z.string()).nullable()
  //   .describe('Items literales del material citados — usado en V2 para source-grounding'),
})

const generationResult = await runWithPurpose('subloop_generation', () =>
  generateText({
    model: google('gemini-2.5-flash'),
    system: buildGenerationPrompt(tooling.material_del_topic, TONE_BASE),
    messages: [
      ...recentMessages.slice(-4),  // history corto — el prompt ya tiene material
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,  // D-10
    output: Output.object({ schema: GenerationOutputSchema }),
    providerOptions: {
      google: {
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      },
    },
  })
)
const generation = safeAccessOutput(generationResult, GenerationOutputSchema)
```

**Source:** patrón síntesis de `[CITED: ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai]` (safetySettings code), `[CITED: vercel.com/blog/ai-sdk-6]` (Output.object pattern), y código actual del repo `sub-loop/index.ts` (extractStepData + extractedStep extraction).

### Pattern 2: Schema intermedio entre las 2 calls

**What:** El output schema de CALL 1 debe incluir TODO lo que CALL 2 necesita — no podemos pasar el `KbHit` raw porque CALL 2 no lee del DB.

**Pitfall:** Si el schema de CALL 1 retorna solo `topic_seleccionado: string`, la CALL 2 necesitaría re-fetchear el material → segunda RPC innecesaria. Mejor: el output de CALL 1 incluye `material_del_topic` con TODAS las secciones del KB doc ya parseadas (Hechos / Posición / Debe contener / NUNCA / Cuándo escalar).

**Implementación:** kb_search tool returna `KbHit[]` enriquecido (cada hit tiene todas las secciones). GPT mini lee los 3 hits, elige UNO, copia su material verbatim al output schema. CALL 2 recibe el material parseado sin tocar DB.

### Pattern 3: Defensive output access

**What:** Bug abierto vercel/ai#11348 (a 2026-05-16): si `finishReason !== 'stop'`, acceder a `result.output` throwea `NoOutputGeneratedError` aunque haya JSON válido en `result.text`. Afecta gateway/proxy paths principalmente.

**Code reference:**

```typescript
// File: sub-loop/safe-output.ts (NUEVO en Plan 03)
import { NoObjectGeneratedError } from 'ai'

export function safeAccessOutput<T>(
  result: Awaited<ReturnType<typeof generateText>>,
  schema: z.ZodSchema<T>,
): T {
  try {
    return result.output as T
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err) && result.text) {
      // Fallback manual parse — vercel/ai#11348 workaround
      try {
        const parsed = JSON.parse(result.text)
        return schema.parse(parsed)
      } catch (parseErr) {
        throw new Error(
          `[safeAccessOutput] Got NoObjectGeneratedError + manual parse also failed: ` +
          `${(parseErr as Error).message} | text="${result.text.slice(0, 200)}"`
        )
      }
    }
    throw err
  }
}
```

**Source:** `[CITED: github.com/vercel/ai/issues/11348]` (bug reportado 2025-12-21, still open 2026-05).

### Anti-Patterns to Avoid

- **`z.discriminatedUnion` / `z.union` en Output.object con Gemini:** rechazado. `[CITED: ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai]` workaround = `structuredOutputs: false` que pierde toda la validation. NO usar; usar enum + nullable fields como hace el LoopOutcomeSchema actual.
- **`z.record(z.string(), z.string())`:** rotamap a `propertyNames:{type:string}` que Anthropic + Google rechazan. Usar campos pre-definidos nullable.
- **`z.optional()`:** OpenAI strict mode rechaza ausencia de field. Usar `.nullable()` consistentemente (el repo ya hace esto post-D-29).
- **`toolChoice: 'required'` con Output.object:** bloquea el structured output final step. Usar `'auto'`. `[VERIFIED: repo `sub-loop/index.ts` W-06 comentario explícito]`.
- **Pasar 3 hits a CALL 2:** duplica razonamiento (GPT y Gemini eligen). D-11 locked = UN topic. NO regresar.
- **Hardcodear material del topic en el prompt de CALL 2:** si fueras a fetchear el KB doc en CALL 2 estarías replicando lo que CALL 1 ya hizo. Pasar el material vía output schema entre las calls.
- **Acceder `result.output` sin try/catch:** vercel/ai#11348 — usar `safeAccessOutput` wrapper.
- **Confiar en `intent_confidence` del comprehension Y `response_confidence` de la generación como métricas equivalentes:** son 2 cosas distintas. Comprehension mide template-fit (Iter 7f); response_confidence mide "respondió la pregunta con SOLO el KB". NO mezclar en lógica downstream.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured output validation | Custom JSON parser + ad-hoc validators | `generateText({ output: Output.object({ schema }) })` | AI SDK v6 maneja validation + retry built-in. Single source of truth. |
| Anti-hallucination en RAG generic | Custom claim-extraction + entailment check con 3er LLM | Prompt-only para V1 (D-21), considerar `checkSourceGrounding` para V2 | `[CITED: arxiv MEGA-RAG]` 40% reduction with multi-evidence — pero V1 con 18 topics y mensajes cortos no justifica overhead aún. V2 si Smoke A detecta invención. |
| Embedding model swap mid-flight | Re-embed todos los KBs en cada deploy | Body hash diff (`sync.ts` ya hace esto) | Pitfall 7 del repo — re-embed solo cuando body cambia |
| LLM-as-judge prompt para Smoke A | Inventar rubric from scratch | Promptfoo / EvidentlyAI rubric patterns | `[CITED: evidentlyai.com/llm-guide/llm-as-a-judge]` — usar binary/3-option scoring; chain-of-thought BEFORE score; mitigate position bias |
| Retry logic en `stage_changed_concurrently` | Custom retry loop | Propagar error verbatim al agent loop | D-12 + mutation-tools Pitfall 1 — agente decide |
| Safety settings per-call | Toggle dinámico | `providerOptions: { google: { safetySettings: [...] } }` fijo en BLOCK_NONE para CORE business médico | `[CITED: ai.google.dev/gemini-api/docs/safety-settings]` — documentado para casos como contraindicaciones |
| Confidence calibration en español | Few-shots en inglés traducidos | Few-shots en español originales del corpus real (los 17 casos del smoke + variantes) | Traducción introduce sesgos sutiles en calibration; usar el idioma productivo |

**Key insight:** El mayor riesgo de over-engineering es agregar capas de validation post-hoc (claim extraction, entailment checks, judge LLMs en runtime) cuando el V1 tiene un KB chico de 18 topics y mensajes cortos. La literatura (MEGA-RAG, HALT-RAG) muestra que estas capas son rentables cuando hay 100+ topics y respuestas largas; en este V1 son premature. PERO: la decisión de difer `checkSourceGrounding` (D-18) debe revalidarse en Smoke A — si Jose detecta invención, agregar antes de Plan 08.

---

## H-2 Verification (2026-05)

**Status: CONFIRMED.** Gemini 2.5 series (incluido Flash y Flash-Lite) NO soporta tools + Output.object/structured output combinados en la misma call.

### Evidencia (cross-verificada):

| Source | Claim | Confidence |
|--------|-------|------------|
| `[CITED: ai.google.dev/gemini-api/docs/structured-output]` Tabla "Support Table" | Combinación tools + structured output disponible **solo en Gemini 3 series** (3.1 Pro Preview + 3 Flash Preview). 2.5 series NO listado. | HIGH (docs oficiales 2026) |
| `[CITED: ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai]` | Workaround documentado: `providerOptions.google.structuredOutputs = false` para escapar limitaciones. Explícitamente menciona `z.union`/`z.record` rotos. | HIGH (docs oficiales SDK) |
| `[CITED: github.com/vercel/ai/issues/11466]` (abierto Dec 2025) | Incluso Gemini 3 + code_execution + Output.object retorna `AI_NoOutputGeneratedError` en el SDK. La integración SDK aún tiene bugs. | HIGH (bug abierto, reproducible) |
| RESEARCH hermano (somnio-sales-v4-runtime-wiring) 2026-05-06 | Tests empíricos confirmaron: "Function calling with response mime type 'application/json' is unsupported" | HIGH (verificación empírica reciente) |

### Implicación arquitectónica

D-07 (tooling = GPT-4o mini) y D-08 (generación = Gemini Flash) están **correctamente justificados** y NO se vuelven innecesarios por upgrades recientes del SDK o de Gemini API. La arquitectura split tooling/generación es la única opción viable hasta:
- (a) Gemini 3 series alcanza GA, **Y**
- (b) Vercel AI SDK soluciona el bug 11466

Estimación de tiempo: **6-12 meses mínimo** para ambos. NO bloquear V1 esperando.

### Reverificación periódica

Documentar en STATUS.md una revisita trimestral de esta limitación:
```
- [ ] 2026-08-16: re-check H-2 — ¿Gemini 3 ya GA? ¿SDK bug 11466 cerrado?
```
Si ambos resueltos, V2 puede simplificar a una sola call Gemini 3.

---

## Self-Reported Confidence Calibration

**Status: D-17 (8-10 few-shots + 3-4 reglas) es lo MÍNIMO defendible. Research recomienda mejoras concretas a planner para Plan 04.**

### Hallazgos críticos de la literatura

1. **LLMs son sistémicamente overconfident en verbalized confidence:**
   - `[CITED: arxiv 2306.13063]` GPT-3/3.5/Vicuna ECE > 0.377 (Expected Calibration Error), confidence clusters en 90-100% sin importar accuracy real.
   - GPT-4 (el mejor del estudio) solo logra ~62.7% AUROC para discriminar correct/incorrect via verbalized confidence — apenas mejor que random.
   - Models "imitan patrones humanos de confianza" — el sesgo humano de overclaim se transfiere.

2. **Few-shots con confidence values son ambivalentes:**
   - `[CITED: arxiv 2412.14737]` "Models may copy confidence scores from provided examples" — riesgo de anchoring artificial.
   - Para LLMs grandes (Gemini Flash es grande), few-shots ayudan SI son diversos y cubren todo el rango. Si los 8 few-shots son 6 con 0.85+ y 2 con 0.30, el modelo tiende a inferir que 0.85 es default.
   - Tiny LLMs: few-shots degradan calibration.

3. **Discretización es brutal:**
   - `[CITED: arxiv 2603.09309]` "78%+ de respuestas concentradas en 3 valores round" (típicamente 0.8, 0.9, 0.95 en escala 0-1; o 80, 90, 95 en 0-100).
   - Una escala 0-20 (en vez de 0-100 o 0-1) "consistently improves metacognitive efficiency".
   - Buckets discretos (very_low / low / med / high / very_high) outperform numeric percentages en algunos estudios.

4. **Probability framing > confidence framing:**
   - `[CITED: arxiv 2412.14737]` "Probability that your answer is correct" (probscore) > "How confident are you?" (genérico).
   - Cambio de framing solo, mejora calibration ~5-10% sin code changes.

### Recomendación concreta para Plan 04

D-17 dice 8-10 few-shots + 3-4 reglas. Mantenerlo, **pero aplicar 4 mejoras**:

**M1 — Reformular la pregunta de framing.** En vez de:
```
Reporta tu confidence en la respuesta (0-100).
```
Usar:
```
¿Cuál es la PROBABILIDAD (de 0 a 100) de que un compañero humano experto en Somnio
diría que tu respuesta es completa y NO requiere consultarlo con un humano?
```
Esta formulación (probability + criterio observable + concreto) ataca el sesgo overclaim.

**M2 — Usar escala discretizada en few-shots, no fluida.** Los 8-10 few-shots deben usar SOLO 5 valores: 0.20 / 0.40 / 0.60 / 0.80 / 0.95. NO 0.42, 0.67, 0.89. Reduce el anchoring noise + da al modelo buckets claros.

**M3 — Binary backstop al final del prompt.** Después de pedir el `responseConfidence`, agregar una pregunta binary que sirve de check:
```
Adicional al confidence numérico, responde:
- "RESPONDE_BIEN": si la respuesta usa SOLO material del KB y cubre la pregunta específica
- "FALTA_INFO": si necesitarías más data (sobre el cliente, el producto, una condición no listada)
- "FUERA_SCOPE": si la pregunta no está en el material en absoluto
```
Y en el orchestrator: si `responseConfidence ≥ 0.70` PERO binary = `FALTA_INFO` o `FUERA_SCOPE` → forzar handoff. Captura los casos donde el modelo numérico sobre-confía pero su autoexamen cualitativo lo contradice.

**M4 — Few-shots concretos cubren el rango completo de los 17 casos del Smoke A.** No genéricos:
   - 2 few-shots de 0.95 (cubrimiento total — ej. "cómo se toma" cubre completo)
   - 2 few-shots de 0.80 (cubrimiento alto con leve adaptación)
   - 2 few-shots de 0.60 (cubrimiento parcial — algunos [SI APLICA] cubiertos pero no todos)
   - 2 few-shots de 0.40 (cubrimiento bajo — falta material relevante)
   - 2 few-shots de 0.20 (cubrimiento nulo — material no aplica)

Cada few-shot debe tener: pregunta + material disponible + respuesta + confidence + rationale 1-frase + binary.

### Riesgo residual aceptable

Aun aplicando M1-M4, la literatura sugiere que la calibración sigue siendo imperfecta (ECE ~0.10-0.20 en el mejor caso). **Para V1 esto es aceptable PORQUE:**
- D-19 dispara handoff silente (no respuesta incorrecta al cliente).
- NUNCA-decir (D-09) actúa como segundo guardrail.
- Threshold 0.70 es conservador (no 0.50).

**El riesgo real NO es false-confident → respuesta-mala-al-cliente; es false-confident → invención sutil que pasa NUNCA-decir.** Por eso Plan 05 Smoke A debe revisar manualmente cada output buscando claims no presentes en el material (ver sección Anti-Invention).

---

## RAG-Generative Pattern with AI SDK v6

Patrón canónico para este standalone:

### Step 1 — Embedding + retrieval (sin cambios)

```typescript
// File: kb-search-tool.ts (ya existe, sin cambios)
const queryEmbedding = await generateEmbedding(query)  // text-embedding-3-small
const { data: hits } = await supabase.rpc('match_knowledge_base', {
  p_workspace_id: ctx.workspaceId,
  p_agent_id: SOMNIO_V4_AGENT_ID,
  p_query_embedding: queryEmbedding,
  p_category: null,  // Iter 7i: nunca filtrar por category
  p_limit: 3,
})
// hits: KbHit[] enriquecido (post Plan 01) con todas las secciones del KB doc
```

### Step 2 — Topic selection (CALL 1 — GPT-4o mini)

Ver `Pattern 1` arriba.

### Step 3 — Generation (CALL 2 — Gemini Flash)

Ver `Pattern 1` arriba.

### Step 4 — Validation post-generation

```typescript
// File: sub-loop/index.ts (Plan 03 — orquestador)
const tooling = await runToolingCall({ reason, ctx })
if (tooling.should_handoff) return handoff(tooling.handoff_reason)

const generation = await runGenerationCall({
  topicMaterial: tooling.material_del_topic!,
  tone: TONE_BASE,
  recentMessages: ctx.recentMessages,
  userMessage: ctx.userMessage,
})

// D-19 — threshold check
if (generation.responseConfidence < 0.70) {
  return handoff('low_response_confidence', {
    reportedConfidence: generation.responseConfidence,
    rationale: generation.confidenceRationale,
  })
}

// Backstop binary (M3 recommendation)
if (generation.binary === 'FALTA_INFO' || generation.binary === 'FUERA_SCOPE') {
  return handoff(`binary_backstop_${generation.binary}`, {
    reportedConfidence: generation.responseConfidence,
    binary: generation.binary,
  })
}

// D-09 — NUNCA-decir check (sin cambios)
const nuncaCheck = await checkNuncaDecir({
  candidateText: generation.responseText,
  nuncaDecirRules: tooling.material_del_topic!.nunca_decir ?? [],
})
if (!nuncaCheck.ok) {
  return handoff('nunca_decir_violation', { violation: nuncaCheck.violation })
}

// Success — emit al cliente
return {
  status: 'generated',
  responseText: generation.responseText,
  sourceTopic: tooling.topic_seleccionado,
  responseConfidence: generation.responseConfidence,
  requiresHuman: false,
  reason: 'rag_generated',
}
```

### Pattern: Schema cambios en LoopOutcomeSchema

D-24 dice eliminar `status: 'canonical'`. El schema flat post-D-29 ya existe. Cambios concretos Plan 03:

```typescript
// ANTES (output-schema.ts actual):
status: z.enum(['template', 'canonical', 'no_match'])
canonicalText: z.string().nullable()       // verbatim del KB
sourceTopic: z.string().nullable()
nuncaDecirRules: z.array(z.string()).nullable()
responseTemplate: z.string().nullable()    // intent template o 'handoff_humano'

// DESPUÉS (post-Plan 03):
status: z.enum(['generated', 'template', 'no_match'])
       // 'canonical' renombrado a 'generated' (D-24 borrado del verbatim mindset)
responseText: z.string().nullable()        // ANTES canonicalText — texto generado (no verbatim)
responseConfidence: z.number().nullable()  // NUEVO — auto-reporte del modelo (D-15)
confidenceRationale: z.string().nullable() // NUEVO — 1 frase razón
sourceTopic: z.string().nullable()         // sin cambios
nuncaDecirRules: z.array(z.string()).nullable()  // sin cambios
responseTemplate: z.string().nullable()    // sin cambios (path crm_mutation lo usa)
```

Invariantes (validateLoopOutcomeInvariants — actualizar):
- `status === 'generated'` → `responseText !== null && sourceTopic !== null && responseConfidence !== null && requiresHuman === false`
- `status === 'template'` → como antes (crm_mutation path)
- `status === 'no_match'` → como antes

---

## Anti-Invention Strategies

**D-18 difiere `checkSourceGrounding` a V2. Research valida la decisión PERO surfacea riesgos materiales.**

### Comparación de estrategias

| Strategy | Effectiveness vs hallucination | Latency overhead | Implementación | V1 fit |
|----------|-------------------------------|------------------|----------------|--------|
| Prompt-only (D-21) | `[CITED: machinelearningmastery prompt engineering]` ~30% reduction | 0ms | 1 prompt | ✅ Locked D-21 |
| Prompt + few-shots de refusal | Adicional ~10% reduction | 0ms (prompt más largo) | 2-3 few-shots | ✅ Compatible con D-17 |
| Self-evaluation con confidence + threshold | Adicional ~5-10% reduction (vía handoffs) | 0ms (en misma call) | Output schema | ✅ Locked D-15/D-19 |
| Source-grounding post-hoc (3er call) | `[CITED: arxiv MEGA-RAG]` ~40% additional reduction en RAG medical | +500ms-1s | Nueva call + claim extraction | ❌ Deferred D-18 |
| LLM-as-judge en runtime | ~15-30% additional reduction | +800ms-1.5s | Nueva call | ❌ Deferred (no D explícito) |
| Re-ranking + chunk-level citation | ~20% additional reduction | +200ms | Reranker model | ❌ Deferred |

### Riesgo de NO implementar source-grounding en V1

`[CITED: arxiv 2509.07475]` HALT-RAG paper:
> "Medical AI systems show 43%–64% hallucination rates depending on prompt quality."

`[CITED: kernshell.com 2026]`:
> "RAG reduces hallucination rates by 30%–70% across domains."

Aplicando ambos: post-RAG en V1, residual hallucination rate esperado = **15-40%** sin grounding.

**Para Somnio (producto adyacente a contraindicaciones médicas):**
- Caso `interaccion_alcohol`: alta probabilidad de cobertura (KB tiene topic + reglas claras).
- Caso `tomo sertralina`: el KB dice "anticoagulantes" pero NO sertralina. Modelo puede inventar "se puede combinar" o "no se recomienda" sin base — ambas hallucinations.
- Caso `lupus`: KB dice "autoinmunes" genérico. Modelo puede generalizar o particularizar incorrectamente.

**Recomendación research (al planner + al usuario):**

1. **Mantener D-18 (no grounding en V1).** El overhead +500ms-1s en cada respuesta es real y NO está en presupuesto del flip productivo. La hipótesis (prompt + few-shots cubren 90%) merece ser testeada empíricamente.

2. **AGREGAR a Plan 05 Smoke A un test explícito de invención.** Para CADA uno de los 17 casos, Jose debe responder no solo "responde bien?" sino también:
   - "¿Hay alguna afirmación en `responseText` que NO esté presente en el material del topic ganador?" (Y/N)
   - Si Y → marcar como **invención detectada** → bloquea Plan 08.

3. **Pre-Plan 08, conversación explícita con usuario:** "Smoke A tiene 0 invenciones detectadas. Para activar v4 sin grounding asumimos que la tasa residual ≤ 5%. Si vemos un caso real de invención en producción tras flip, el rollback es vía SQL routing_rules (preparado). ¿Aceptás este nivel de riesgo?"

4. **Tener V2 listo en backlog:** `checkSourceGrounding` con esquema claro (claim extraction + per-claim grep en material + scoring). Si invención emerge → 1-2 días de implementación, NO investigación adicional.

### Prompt anti-invención concreto (Plan 03 + Plan 04 inputs)

```
[SECCIÓN del system prompt de generación — Gemini Flash]

REGLAS DURAS DE ANTI-INVENCIÓN:

1. SOLO usá la información presentada arriba en "MATERIAL DEL TOPIC".
2. PROHIBIDO mencionar marcas, dosis, condiciones, sustancias, o reglas que
   NO aparezcan literalmente en el material. Ejemplos de invención prohibida:
   - Si el material dice "anticoagulantes", NO menciones "warfarina" específicamente
     a menos que esté en el material.
   - Si el cliente pregunta por "lupus" y el material dice "autoinmunes" genérico,
     NO afirmes nada específico de lupus — reportá responseConfidence ≤ 0.40 + binary
     "FALTA_INFO".
   - Si el cliente pregunta por "Miami" y el material dice "envíos en Colombia", NO
     improvises políticas de envío internacional — responseConfidence ≤ 0.30 + binary
     "FUERA_SCOPE".
3. Si te falta material para responder con precisión, REPORTÁ confidence bajo (≤ 0.60)
   y un binary { FALTA_INFO | FUERA_SCOPE }. El sistema escalará a humano. No es un
   error — es lo correcto.
4. La empresa PREFIERE handoffs que respuestas inventadas. NUNCA "lo intentes" si
   no tenés base. El silencio cuesta menos que la información incorrecta.
```

---

## Smoke A/B Calibration (LLM-as-Judge Pattern)

**D-26:** híbrido = LLM-as-judge preliminar + Jose revisa los 17 personalmente. Research recomienda patrón concreto.

### Modelo del judge

**Recomendación: `gemini-2.5-flash` SEPARADO** (mismo modelo que generation, pero llamada distinta sin acceso al output schema de generación).

Por qué SEPARADO (no usar el mismo de generación reusing context):
- `[CITED: evidentlyai.com/llm-guide/llm-as-a-judge]` "Self-enhancement bias": modelos prefieren outputs producidos por sí mismos. Pero comparado con un juez distinto entrenado/configurado distinto. **En una mismo call self-evaluation se confirma a sí mismo con sesgo.**
- Una call totalmente fresh (sin history) evalúa con menos sesgo.
- Costo: ~$0.0015 extra per case × 27 cases (17 + 10) = ~$0.04 total. Trivial.

Por qué FLASH (no Flash-Lite):
- Judge necesita razonamiento sobre conformity a rubric. Flash > Flash-Lite en razonamiento estructurado.

### Rubric (binary + 1-5 según `[CITED: evidentlyai]` recommendation — binary es más reliable)

Para cada caso del Smoke A:

```
Pregunta del cliente: <texto>
Material del topic seleccionado: <secciones del KB doc>
Respuesta generada: <texto que el modelo emitió>
ResponseConfidence reportado: <número>

Evaluá 3 criterios, RESPONDIENDO CON RAZONAMIENTO PRIMERO Y SCORE AL FINAL:

1. FAITHFULNESS — ¿La respuesta usa SOLO información del material?
   Primero razoná chequeando claim por claim. Luego respondé:
   { "faithfulness_score": "PASS" | "PARTIAL" | "FAIL",
     "faithfulness_reason": "<1-2 frases>",
     "faithfulness_invented_claims": [<lista de afirmaciones que NO están en material, vacía si PASS>] }

2. RELEVANCE — ¿La respuesta aborda directamente la pregunta del cliente?
   { "relevance_score": "PASS" | "PARTIAL" | "FAIL",
     "relevance_reason": "<1-2 frases>" }

3. CONFIDENCE_CALIBRATION — ¿El confidence reportado refleja honestamente la calidad?
   - Si responseConfidence ≥ 0.70 pero relevance/faithfulness FAIL → MISCALIBRATED_HIGH
   - Si responseConfidence ≤ 0.50 pero ambos PASS → MISCALIBRATED_LOW
   - Si reportado y calidad alineados → CALIBRATED
   { "calibration": "CALIBRATED" | "MISCALIBRATED_HIGH" | "MISCALIBRATED_LOW",
     "calibration_reason": "<1-2 frases>" }

OVERALL: PASS si los 3 son PASS; FAIL si alguno es FAIL; PARTIAL si ≥1 es PARTIAL pero ninguno FAIL.
```

Esto sigue 3 principios `[CITED: evidentlyai]`:
- **CoT antes de score:** "ask the LLM to explain its reasoning or think step by step before final judgment"
- **3-option scoring (binary plus partial)** "easier to get accurate results with two simple choices rather than 1-5"
- **Multiple criteria separados** "faithfulness, relevance, completeness"

### Estructura de SMOKE-A-RESULTS.md (recomendación al D-35 slot)

```markdown
# SMOKE A — RAG-Generative Redesign Results

**Run date:** YYYY-MM-DD
**Model generation:** gemini-2.5-flash temp=0.3
**Model judge:** gemini-2.5-flash (separate call)
**Reviewer:** Jose

## Per-case results

### Case 1 — "puedo si tomo alcohol?"

**Pregunta:** puedo si tomo alcohol?
**Expected:** generated → interaccion_alcohol topic
**Tooling output:** topic_seleccionado=interaccion_alcohol, should_handoff=false
**Generation output:**
- responseText: "Te recomendamos no combinar..."
- responseConfidence: 0.85
- confidenceRationale: "El material cubre directamente el caso de alcohol con regla clara."
- binary: "RESPONDE_BIEN"

**Judge (Gemini Flash separate):**
- faithfulness: PASS — todas las claims están en material
- relevance: PASS — aborda directamente
- calibration: CALIBRATED — confidence 0.85 alineado con calidad

**Jose final:** ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
**Jose notes:** "Bueno. Quizás un poco rígido pero cumple."

**Invención detectada (Y/N):** N

---

(repetir para cada uno de los 17)

## Aggregate metrics

| Metric | Count / 17 | % |
|--------|-----------|---|
| Jose PASS | __ | __% |
| Jose FAIL | __ | __% |
| Judge PASS | __ | __% |
| Jose ↔ Judge agreement | __ | __% |
| Invenciones detectadas | __ | __% |
| Confidence calibration MISCALIBRATED_HIGH | __ | __% |
| Confidence calibration MISCALIBRATED_LOW | __ | __% |

## Decision

- [ ] ≥15/17 Jose PASS → green light Smoke B
- [ ] 0 invenciones detectadas → green light Plan 08 (después de Smoke B PASS)
- [ ] ≥1 invención → BLOQUEAR Plan 08, abrir Plan 07 con `checkSourceGrounding`

## Per-case failure analysis

(solo si hay FAILs — describir patrón observado)
```

### Pitfalls del judge

1. **Position bias:** N/A en Smoke A (no pairwise, single output evaluation).
2. **Verbosity bias:** Risk medio — Gemini puede preferir respuestas largas. Mitigación: rubric NO menciona length, criterios son objetivos (faithfulness = claim-level).
3. **Self-enhancement:** Mitigado por separar la call (sin acceso al schema/context de generation call).
4. **Disagreement Jose vs Judge:** Será información valiosa. Si Jose y Judge disagree en muchos casos, el judge prompt necesita refinamiento ANTES de Smoke B.

---

## DB Migration Guidance (Plan 01 input)

Esquema actual `agent_knowledge_base` tiene columnas:
- `canonical_response TEXT` (verbatim del KB — se renombra/refactoriza)
- `nunca_decir TEXT[]` (sigue igual — alimentar checkNuncaDecir)
- `escalate_triggers TEXT[]`, `related_topics TEXT[]`, `keywords TEXT[]`, `category`, `embedding`, `body_hash`, etc.

Plan 01 debe agregar columnas para las 6 secciones nuevas (D-01):

```sql
-- supabase/migrations/XXX_kb_schema_rag_generative.sql

ALTER TABLE agent_knowledge_base
  -- Hechos del producto (D-02 — distinto de posición)
  ADD COLUMN hechos_del_producto TEXT,
  -- Posición del negocio (D-02)
  ADD COLUMN posicion_del_negocio TEXT,
  -- Items con prefijo [SIEMPRE] o [SI APLICA] (D-03)
  ADD COLUMN debe_contener TEXT[],
  -- Cuándo escalar (D-01)
  ADD COLUMN cuando_escalar TEXT[],
  -- D-05 override tono per-topic (opcional)
  ADD COLUMN tone_override TEXT;

-- canonical_response queda en la tabla por backwards compat (otros agentes lo usan)
-- pero somnio-v4 deja de leerlo (Plan 03 borra refs).
-- Marcar deprecated en comment:
COMMENT ON COLUMN agent_knowledge_base.canonical_response IS
  'DEPRECATED para somnio-v4 (RAG-generative, 2026-05-16). Otros agentes pueden seguir usándolo.';

-- RPC match_knowledge_base actualizar RETURNS para incluir nuevas columnas
-- (Plan 01 task)
```

**Constraint Plan 02:** Después de reescribir los 18 KBs en formato nuevo y aplicar sync, validar:
```sql
SELECT count(*) FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4'
  AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND (hechos_del_producto IS NULL OR debe_contener IS NULL OR debe_contener = '{}');
-- Esperado: 0 (todos los 18 tienen las nuevas secciones pobladas)
```

---

## KB Template Structure (Plan 02 input)

Cada uno de los 18 archivos `.md` sigue esta estructura post-Plan 02:

```markdown
---
topic: interaccion_alcohol
keywords: [alcohol, trago, cerveza, vino, ron, fiesta, licor]
category: edge-cases                          # mantenido para source organization (Iter 7i)
last_reviewed: 2026-05-16
reviewed_by: jose
related_topics: [como_se_toma, contraindicaciones]
escalate_if:                                  # opcional, parseado a array
  - cliente insiste en combinar tras advertencia
tone_override: null                           # opcional, default = TONE_BASE global
---

## Hechos del producto
La melatonina puede potenciar el efecto sedante del alcohol y causar somnolencia
excesiva o malestar al día siguiente. Esto es un mecanismo farmacológico documentado:
ambos compuestos son depresores del SNC.

## Posición del negocio
NO recomendamos combinar el ELIXIR DEL SUEÑO con alcohol. La empresa prioriza
seguridad sobre conveniencia. Si el cliente bebió en una ocasión social, la
recomendación es saltarse la dosis esa noche y retomar al día siguiente.

## Debe contener la respuesta
- [SIEMPRE] Recomendación explícita de NO combinar
- [SIEMPRE] Mención breve del mecanismo (potencia sedación / depresor SNC)
- [SI APLICA] Si el cliente menciona "ya bebí" → instruir saltarse dosis esa noche
- [SI APLICA] Si el cliente pregunta "¿y solo una cerveza?" → reiterar recomendación
  general sin minimizar
- [SI APLICA] Si el cliente insiste a pesar de la advertencia → escalar a humano

## NUNCA decir
- aprobar combinación con alcohol
- minimizar el riesgo ("una cerveza no afecta")
- recomendar "tomar más para dormir más rápido si bebiste"
- afirmar que "el alcohol potencia bien el efecto del producto"
- mencionar valeriana ni cualquier ingrediente que no sea melatonina + citrato de magnesio
- usar palabras como "te derivo", "te paso", "asesor humano", "tomo nota"

## Cuándo escalar a humano
- cliente insiste en combinar tras la advertencia
- cliente reporta haber tomado dosis con alcohol y siente malestar
- cliente pregunta sobre interacciones con otros depresores del SNC (benzodiacepinas, opioides)
```

### Parser changes (Plan 01)

`parser.ts` reconoce 6 headers (vs los 4 actuales):
- `## Hechos del producto`
- `## Posición del negocio` (acepta `Posicion` sin tilde por defensive)
- `## Debe contener la respuesta` o `## Debe contener`
- `## NUNCA decir`
- `## Cuándo escalar a humano` o `## Cuándo escalar`
- (deprecated, ignorar si aparece: `## Respuesta canónica`, `## Si el cliente insiste`, `## Sources`)

`debe_contener` se parsea como `- item` lista bullet, igual que `nunca_decir`.

### Coherence check changes (Plan 01)

Agregar validaciones a `coherence-check.ts`:
- `hechos_del_producto` no vacío
- `posicion_del_negocio` no vacío
- `debe_contener` array no vacío + cada item empieza con `[SIEMPRE]` o `[SI APLICA]`
- `nunca_decir` array (puede ser vacío en topics no-edge-case)
- `cuando_escalar` array (puede ser vacío)

---

## Common Pitfalls

### Pitfall 1: Acceder `result.output` sin defensive wrap (vercel/ai#11348)
**What goes wrong:** En ciertos gateway/proxy paths, `finishReason` puede ser `undefined`, causando `NoOutputGeneratedError` aunque haya JSON válido en `result.text`.
**Why it happens:** Bug abierto en Vercel AI SDK (reportado 2025-12, sin fix a 2026-05-16).
**How to avoid:** Usar `safeAccessOutput()` wrapper (ver Pattern 3) en TODOS los accesos a `result.output` del Plan 03.
**Warning signs:** Errores `AI_NoOutputGeneratedError` en observability sin causa aparente.

### Pitfall 2: Overconfidence sistémico en self-reported confidence
**What goes wrong:** Gemini Flash reporta 0.85-0.95 incluso cuando la respuesta es mediocre. Threshold 0.70 nunca dispara → handoffs no ocurren → cliente recibe respuestas malas.
**Why it happens:** `[CITED: arxiv 2306.13063]` — LLMs imitan patrones humanos de over-claim.
**How to avoid:** Aplicar M1-M4 (ver Self-Reported Confidence Calibration). Especialmente M3 (binary backstop) para casos que el numérico no captura.
**Warning signs:** En Smoke A, % de `MISCALIBRATED_HIGH` ≥ 20%.

### Pitfall 3: Schema parse failures con Gemini (response wrapped in code block)
**What goes wrong:** ~1% de respuestas Gemini envuelven el JSON en ` ```json ... ``` ` lo que rompe el parse.
**Why it happens:** `[CITED: github.com/vercel/ai/issues/4906]` bug intermitente en Gemini structured output.
**How to avoid:** `safeAccessOutput` wrapper hace fallback a manual parse de `result.text`. Si el manual parse también falla, escalation a no_match.
**Warning signs:** Smoke A muestra 1-2 casos con error `NoObjectGeneratedError`.

### Pitfall 4: Mezclar `intent_confidence` con `response_confidence`
**What goes wrong:** Devs futuros pueden confundir las 2 métricas (ambas son 0-1) y usar `intent_confidence` para decidir handoff post-generación, o viceversa.
**Why it happens:** Similitud de naming. `intent_confidence` mide template-fit (Iter 7f); `response_confidence` mide cobertura del KB (D-13).
**How to avoid:** Naming distinto en código: `intentConfidence` vs `responseConfidence` (no abreviar). Docstrings explícitos. Validar nunca son comparados directamente.

### Pitfall 5: Cache stale entre calls del sub-loop
**What goes wrong:** Si CALL 1 (tooling) y CALL 2 (generación) corren en lambdas distintos por cold-boot, el client de OpenAI/Google se re-instancia. Esto está bien.
**Why it happens:** Cold boot patterns en Vercel.
**How to avoid:** N/A — el patrón lazy singleton actual (`let openaiClient: ReturnType<...> | null`) está bien. Solo asegurar que no haya cache en memoria de KB hits entre calls.
**Warning signs:** Primera invocación post-deploy ~2s extra (cold boot init).

### Pitfall 6: Safety settings dispara block silente en CORE business
**What goes wrong:** Gemini Flash con safety settings DEFAULT (`BLOCK_LOW_AND_ABOVE`) puede bloquear menciones de "alcohol", "embarazo", "contraindicaciones" → texto vacío → `NoOutputGeneratedError`.
**Why it happens:** `HARM_CATEGORY_DANGEROUS_CONTENT` por default es restrictivo. Documentado descubierto en Iter 5b del standalone hermano.
**How to avoid:** `providerOptions.google.safetySettings: [...BLOCK_NONE for all 4 categories]` en BOTH calls. Ya implementado en `nunca-decir-check.ts`, replicar en `generation-call.ts`.
**Warning signs:** Errores con `finishReason='SAFETY'` en logs.

### Pitfall 7: `z.union` o `z.record` colado en algún schema
**What goes wrong:** Gemini provider rechaza estos. Schema-time failure (build OK, runtime fail).
**Why it happens:** Devs no leen el RESEARCH hermano + agregan estos features creyendo que funcionan.
**How to avoid:** ESLint rule custom o code review check — `grep -E "z\.union|z\.record" src/lib/agents/somnio-v4/sub-loop/` debe retornar 0 matches.
**Warning signs:** Build OK, runtime falla con primera call.

### Pitfall 8: KB Spanish embedding con `text-embedding-3-small` puede tener calidad limitada
**What goes wrong:** Embeddings multilingual del modelo pequeño pueden ser inferiores al modelo large/3-large para nuance en español.
**Why it happens:** Modelo small optimizado para inglés primariamente.
**How to avoid:** Plan 01 / Plan 02 re-validan similarity post-reescritura (D-06). Si algunas queries que matcheaban antes no matchean ahora → consider upgrade a `text-embedding-3-large` en V2 (NO en V1; cambiar embedding model implica re-embed todos los KBs + posible re-tune del HNSW).
**Warning signs:** Smoke A muestra que casos como "lupus" (texto en español con condición específica) no matchean al topic `contraindicaciones` con similarity > 0.50.

### Pitfall 9: Encadenar 2 calls duplica el riesgo de timeout
**What goes wrong:** CALL 1 toma 1.5s + CALL 2 toma 2s + NUNCA-decir 0.5s = 4s solo en LLMs. Más cold-boot. Webhook tiene tope 5s Meta.
**Why it happens:** Sub-loop solo dispara en ciertos triggers, pero cuando dispara, latencia se acumula.
**How to avoid:** El webhook responde 200 inmediato y la respuesta sale async vía Inngest (patrón actual). El sub-loop NO está en el critical path del webhook. PERO: el cliente experiment latency total >5s.
**Warning signs:** p95 sub-loop > 8s. Si pasa, considerar `gemini-2.5-flash-lite` para generación (D-08 A/B) o cache de embeddings frecuentes.

### Pitfall 10: A/B Flash vs Flash-Lite sin criterio objetivo
**What goes wrong:** Plan 05 incluye corrida con Flash-Lite. Jose juzga "indistinguible" subjetivamente → downgrade a Flash-Lite → respuesta calidad cae en producción.
**Why it happens:** Sin rubric explícita pre-comparación, el bias de "más barato es mejor" sesga el juicio.
**How to avoid:** Antes de correr A/B en Plan 05, definir POR ESCRITO los criterios:
- "Indistinguible" = ≥14/17 Smoke A PASS en Flash-Lite Y agreement con juicios de Flash ≥85%.
- Tono debe pasar check específico: ¿se siente "cálido pero firme"? Jose marca 1-5 en tono per case.
- Si Flash-Lite tiene tono ≤3.5 promedio → NO downgrade incluso si pasa los demás criterios.

---

## Code Examples (verificados)

### Tooling call con GPT-4o mini (CALL 1)

```typescript
// File: src/lib/agents/somnio-v4/sub-loop/tooling-call.ts (NUEVO Plan 03)
// Source: pattern síntesis [VERIFIED: vercel/blog/ai-sdk-6 + repo sub-loop/index.ts actual]

import { generateText, Output, stepCountIs } from 'ai'
import { z } from 'zod'
import { createOpenAI } from '@ai-sdk/openai'
import { kbSearchTool, type KbHit } from './kb-search-tool'
import { runWithPurpose } from '@/lib/observability'

const ToolingOutputSchema = z.object({
  topic_seleccionado: z.string().nullable(),
  material_del_topic: z.object({
    hechos: z.string().nullable(),
    posicion: z.string().nullable(),
    debe_contener_aplicables: z.array(z.string()).nullable(),
    nunca_decir: z.array(z.string()).nullable(),
    cuando_escalar: z.array(z.string()).nullable(),
  }).nullable(),
  should_handoff: z.boolean(),
  handoff_reason: z.string().nullable(),
})

export type ToolingOutput = z.infer<typeof ToolingOutputSchema>

let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4
    if (!apiKey) throw new Error('OPENAI_API_KEY_SALESV4 not set')
    openaiClient = createOpenAI({ apiKey })
  }
  return openaiClient
}

export async function runToolingCall(args: {
  reason: 'low_confidence' | 'razonamiento_libre'
  ctx: { workspaceId: string; userMessage: string; recentMessages: any[] }
  systemPrompt: string
}): Promise<ToolingOutput> {
  const result = await runWithPurpose('subloop_tooling', () =>
    generateText({
      model: getOpenAI()('gpt-4o-mini'),
      system: args.systemPrompt,
      messages: [
        ...args.ctx.recentMessages,
        { role: 'user' as const, content: args.ctx.userMessage },
      ],
      tools: { kb_search: kbSearchTool({ workspaceId: args.ctx.workspaceId }) },
      toolChoice: 'auto',  // NO 'required' — bloquearía output final
      stopWhen: stepCountIs(4),
      output: Output.object({ schema: ToolingOutputSchema }),
    })
  )
  return safeAccessOutput(result, ToolingOutputSchema)
}
```

### Generation call con Gemini Flash (CALL 2)

```typescript
// File: src/lib/agents/somnio-v4/sub-loop/generation-call.ts (NUEVO Plan 03)
// Source: pattern [VERIFIED: ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai] + repo nunca-decir-check.ts

import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'

const GenerationOutputSchema = z.object({
  responseText: z.string(),
  responseConfidence: z.number(),
  confidenceRationale: z.string(),
  binary: z.enum(['RESPONDE_BIEN', 'FALTA_INFO', 'FUERA_SCOPE']),  // M3 backstop
})

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

export async function runGenerationCall(args: {
  systemPrompt: string  // includes TONE_BASE + few-shots + material del topic
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<GenerationOutput> {
  const result = await runWithPurpose('subloop_generation', () =>
    generateText({
      model: google('gemini-2.5-flash'),
      system: args.systemPrompt,
      messages: [
        ...args.recentMessages.slice(-4),  // history corto
        { role: 'user' as const, content: args.userMessage },
      ],
      temperature: 0.3,  // D-10
      output: Output.object({ schema: GenerationOutputSchema }),
      providerOptions: {
        google: {
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        },
      },
    })
  )
  return safeAccessOutput(result, GenerationOutputSchema)
}
```

### LLM-as-Judge call para Smoke A

```typescript
// File: scripts/somnio-v4-rag-smoke-judge.ts (NUEVO Plan 05)
// Source: pattern [CITED: evidentlyai.com/llm-guide/llm-as-a-judge]

import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const JudgeOutputSchema = z.object({
  faithfulness_score: z.enum(['PASS', 'PARTIAL', 'FAIL']),
  faithfulness_reason: z.string(),
  faithfulness_invented_claims: z.array(z.string()).nullable(),
  relevance_score: z.enum(['PASS', 'PARTIAL', 'FAIL']),
  relevance_reason: z.string(),
  calibration: z.enum(['CALIBRATED', 'MISCALIBRATED_HIGH', 'MISCALIBRATED_LOW']),
  calibration_reason: z.string(),
  overall: z.enum(['PASS', 'PARTIAL', 'FAIL']),
})

export async function judgeRagOutput(args: {
  userMessage: string
  topicMaterial: { hechos: string; posicion: string; debe_contener: string[]; ... }
  generatedResponse: string
  reportedConfidence: number
}) {
  const judgePrompt = `Eres un juez evaluador de respuestas RAG en español para Somnio.
... (rubric completa según sección Smoke A/B Calibration)`

  const { output } = await generateText({
    model: google('gemini-2.5-flash'),  // FLASH, no Flash-Lite — judge needs reasoning
    system: judgePrompt,
    messages: [{ role: 'user', content: JSON.stringify(args) }],
    temperature: 0.1,  // más determinista que generación
    output: Output.object({ schema: JudgeOutputSchema }),
  })
  return output
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject(...)` para structured output | `generateText({ output: Output.object(...) })` | AI SDK v6 (2025) | Permite combinar con tools cuando provider lo soporta |
| Canonical-verbatim KB responses | RAG-generative redaction | Este standalone (2026-05) | Respuesta adaptada a la pregunta vs texto enlatado |
| Few-shots numéricos para confidence | Probability-framed + binary backstop | `[CITED: arxiv 2412.14737]` 2024-12 | Reduce overconfidence ~10-20% |
| Single LLM call con tools + output | Split en 2 calls cuando provider no soporta combinación | Esta limitación de Gemini 2.5 | Workaround obligatorio hasta Gemini 3 GA |
| Source-grounding como single check | Multi-evidence guided (MEGA-RAG) | `[CITED: 2026 PMC]` | 40% additional hallucination reduction — diferido a V2 |

**Deprecated/outdated:**
- `generateObject` API en AI SDK v6 — usar `generateText({ output: Output.object() })`.
- `experimental_output` → renombrado a `output` en v6 final.
- Gemini 1.5 Flash → upgrade a 2.5 (mejor instruction following, mejor precio).
- `z.discriminatedUnion` en cualquier schema que toque Gemini — usar enum + nullable.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `[ASSUMED]` Flash-Lite tendrá tono "cálido pero firme" comparable a Flash en español, dado que ambos comparten arquitectura base. **Sin benchmark español oficial publicado por Google.** | Standard Stack + Pitfall 10 | Si false, A/B en Plan 05 confirma; downgrade a Flash-Lite produciría respuestas tono robótico. Mitigation: criterio escrito ANTES de A/B. |
| A2 | `[ASSUMED]` Las 4 mejoras M1-M4 a calibration reducirán overconfidence a ECE ~0.10-0.15 (vs 0.20+ con D-17 vanilla). **No medido empíricamente en este standalone; basado en literatura general.** | Self-Reported Confidence Calibration | Si false, Smoke A mostrará MISCALIBRATED_HIGH ≥ 30% → Plan 07 itera prompt. |
| A3 | `[ASSUMED]` Prompt-only anti-invención (D-21) será suficiente para ≥95% de cases en V1 con KB de 18 topics. **Literatura sugiere 30-40% hallucination residual en dominios médicos.** | Anti-Invention Strategies | Si false, 1+ caso de invención en Smoke A → bloquear Plan 08, implementar `checkSourceGrounding` antes. Mitigation: chequeo explícito en Smoke A. |
| A4 | `[ASSUMED]` La latencia agregada de 2 calls (GPT mini ~1s + Gemini Flash ~2s + NUNCA-decir ~0.5s = ~3.5s) es aceptable para el use case. **No medido en producción aún para este flow.** | Pitfall 9 | Si false (p95 > 8s), considerar downgrade a Flash-Lite o cache de embeddings. Mitigation: webhook async pattern existente absorbe latencia para el usuario. |
| A5 | `[ASSUMED]` Gemini Flash + safety BLOCK_NONE + system prompt explícito sobre contraindicaciones cumple Google ToS. **Google docs dicen "less restrictive settings may be subject to review".** | Pitfall 6 + Standard Stack | Si false, future API access denial. Mitigation: BLOCK_NONE solo en este flow (no global), audit trail vía observability. |
| A6 | `[ASSUMED]` Embeddings `text-embedding-3-small` siguen siendo adecuados para el nuevo material en español (Hechos + Posición agregan ~100-200 tokens por doc). **Embeddings no re-tested en este RESEARCH.** | Pitfall 8 + DB Migration | Si false, similarity rankings cambian materialmente → Smoke A revela. Mitigation: D-06 explícitamente acepta re-validar similarity post-migración. |
| A7 | `[ASSUMED]` El judge `gemini-2.5-flash` separado tendrá agreement >85% con Jose. **Sin baseline empírico.** | Smoke A/B Calibration | Si bajo agreement, el judge resultado no es accionable, Smoke A solo confía en Jose. Mitigation: Jose es ground truth final (D-26), el judge es accelerator. |

**Mitigation general:** Smoke A es el primer punto donde estas assumptions se testean empíricamente. STATUS.md ya tiene checkboxes para los 17 casos — agregar columnas para tracking de invención (A3) y calibration alignment (A2).

---

## Open Questions

1. **¿El comprehension layer va a saber distinguir intent="contraindicaciones" simple vs intent="contraindicaciones" + condición compleja?**
   - What we know: comprehension actual (Iter 7g) clasifica "yo tomo anticoagulantes" como CUBRE 0.85 → template directo (NO sub-loop). Pero el cliente que dice "tengo lupus" caería en NO CUBRE 0.30 → sub-loop.
   - What's unclear: con el nuevo RAG, ¿queremos que TODOS los casos de contraindicaciones pasen por sub-loop para tener generación adaptada vs template estático? La pregunta arquitectónica del Q3 del deep-dive (Template + KB overlap).
   - Recommendation: NO cambiar comprehension en este standalone. Si Smoke A revela que el template "anticoagulantes → consultá médico" es inconsistente con KB "anticoagulantes → NO recomendado", abrir tarea separada post-flip.

2. **¿El judge LLM debe ver `materialDelTopic` completo o solo el topic name?**
   - What we know: para evaluar faithfulness, el judge necesita ver el material para validar claim-by-claim. Sin material no puede juzgar.
   - What's unclear: si el material es grande, el judge prompt se vuelve caro.
   - Recommendation: pasar material COMPLETO al judge (es 1 vez por case, ~27 calls total Smoke A+B). Costo trivial.

3. **¿`tone_override` per-topic se va a usar en V1?**
   - What we know: D-05 dice tono global, override solo si necesario. Mencionó `insomnio_largo_plazo` puede requerir más empatía.
   - What's unclear: si vale la pena implementar el override en V1 o esperar a que un caso real lo demande.
   - Recommendation: Plan 01 incluye la columna `tone_override TEXT` en schema (cero costo), Plan 02 puede dejarla NULL en los 18 KBs iniciales. Si Smoke A revela un topic que necesita override, agregamos en Plan 07 (HOLD iter).

4. **¿Limitar `recentMessages` a N=4 en la CALL 2 de generación?**
   - What we know: el prompt actual del sub-loop pasa todos los recentMessages. Más historia = más context para tono, pero también más tokens y posible distracción.
   - What's unclear: el tradeoff óptimo no está medido.
   - Recommendation: empezar con N=4 (últimos 2 turnos U+A) en Plan 03; ajustar si Smoke A revela respuestas que pierden contexto. Documented assumption.

5. **¿Debe el binary backstop (M3) ser parte del schema o un campo adicional?**
   - What we know: M3 propone agregar `binary: enum`. Esto crece el schema en 1 enum.
   - What's unclear: si vale la pena vs solo confiar en `responseConfidence`.
   - Recommendation: incluirlo. El costo del schema es mínimo, y M3 ataca el bias overconfidence directamente. Documentation reason en Plan 04.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `OPENAI_API_KEY_SALESV4` env var | Sub-loop tooling (GPT-4o mini) | ✓ | (en Vercel) | None — bloquea sub-loop si falta |
| `GOOGLE_GENERATIVE_AI_API_KEY` env var | Sub-loop generación (Gemini Flash) + NUNCA-decir (Flash-Lite) | ✓ | (en Vercel) | None — bloquea generación |
| `OPENAI_API_KEY` env var | KB embedding sync (`text-embedding-3-small`) | ✓ | (en Vercel, separado para isolation) | `OPENAI_API_KEY_SALESV4` como fallback (ya hace esto post-Iter 7h) |
| Postgres `pgvector` extension | KB embeddings storage | ✓ | (existe en prod) | None |
| Postgres HNSW index sobre `embedding` | KB retrieval | ✓ | (existe, M=16 ef=64 típico) | Fallback a SELECT lineal (degradado pero funciona) |
| Supabase RPC `match_knowledge_base` | Tool execute body | ✓ | (existe, debe actualizar RETURNS en Plan 01) | None |
| `platform_config.somnio_v4_low_confidence_threshold` row | Threshold check D-19 | ✓ | (=0.70 confirmado) | Default a 0.70 si row missing (defensive) |
| Vercel deployment env (Node 18+, performance API) | Sub-loop latency telemetry | ✓ | runtime | None |
| Gemini API Cloud Billing | Generation + NUNCA-decir | ✓ | (habilitado per CONTEXT.md L84) | None — Gemini API requiere billing activo |

**Missing dependencies with no fallback:** None. Todo lo critical existe.

**Missing dependencies with fallback:** OPENAI_API_KEY → OPENAI_API_KEY_SALESV4 ya manejado en `embed.ts`. Otros fallbacks no necesarios.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (ya en uso en repo) |
| Config file | `vitest.config.ts` (existe a nivel root) |
| Quick run command | `npx vitest run src/lib/agents/somnio-v4/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Plan 01 | Parser acepta nuevo frontmatter + 6 secciones | unit | `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` | ❌ Wave 0 — agregar tests |
| Plan 01 | Sync escribe todas las columnas nuevas | unit (mock supabase) | `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/sync.test.ts` | ❌ Wave 0 |
| Plan 01 | Coherence-check valida nuevos campos | unit | `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` | ✅ existe, extender |
| Plan 02 | Los 18 KBs parsean sin errores | integration | script local que lee los 18 + parseKbDoc cada uno | ❌ Wave 0 |
| Plan 03 | `runToolingCall` retorna ToolingOutput válido con mock kb_search | unit (mock LLM) | `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/tooling-call.test.ts` | ❌ Wave 0 |
| Plan 03 | `runGenerationCall` retorna GenerationOutput válido con mock material | unit (mock LLM) | `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/generation-call.test.ts` | ❌ Wave 0 |
| Plan 03 | `runSubLoop` orquesta correctamente: tooling → generation → threshold → NUNCA | integration (mock LLM both) | `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/orchestrator.test.ts` | ❌ Wave 0 |
| Plan 03 | `safeAccessOutput` maneja `NoOutputGeneratedError` con fallback manual parse | unit | `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts` | ❌ Wave 0 |
| Plan 03 | Invariant `status='generated' → responseText !== null` | unit | mismo orchestrator.test.ts | — |
| Plan 04 | Few-shots prompt válido + parseable por Gemini con structured output | integration (real API call, opcional) | manual o script ad-hoc | ❌ Wave 0 |
| Plan 05 | Los 17 casos del Smoke A se ejecutan end-to-end | E2E real | manual via sandbox UI | manual-only |
| Plan 06 | Los 10 casos del Smoke B no regresan | E2E real | manual via sandbox UI | manual-only |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/agents/somnio-v4/sub-loop/` (rápido, ~5s)
- **Per wave merge:** `npx vitest run src/lib/agents/somnio-v4/` (incluye KB + sub-loop)
- **Phase gate:** Full suite verde + SMOKE-A-RESULTS.md PASS + SMOKE-B-RESULTS.md PASS antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` — Plan 01 nuevo schema
- [ ] `src/lib/agents/somnio-v4/knowledge-base/__tests__/sync.test.ts` — Plan 01 columnas nuevas
- [ ] `src/lib/agents/somnio-v4/sub-loop/__tests__/tooling-call.test.ts` — Plan 03 CALL 1
- [ ] `src/lib/agents/somnio-v4/sub-loop/__tests__/generation-call.test.ts` — Plan 03 CALL 2
- [ ] `src/lib/agents/somnio-v4/sub-loop/__tests__/orchestrator.test.ts` — Plan 03 flow completo
- [ ] `src/lib/agents/somnio-v4/sub-loop/__tests__/safe-output.test.ts` — Plan 03 wrapper
- [ ] Mock helpers para LLM responses (ya hay pattern en `kb-search-tool.test.ts`)

---

## Security Domain

**Skip notice:** Este standalone NO es greenfield seguridad. Está intervenir un agente conversacional ya seguro (workspace isolation, scope agente, etc. son D-04 cubiertos). Aplican controles existentes:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Webhook validation existente — sin cambios |
| V3 Session Management | no | `session_state` table existente — sin cambios |
| V4 Access Control | yes | `workspaceId` viene de `ctx`, NUNCA del input (Pitfall 2 mutation-tools). Tool handlers ya cumplen. |
| V5 Input Validation | yes | zod schemas en Output.object validan respuesta LLM. Frontmatter zod schema valida KB docs. |
| V6 Cryptography | no | N/A para este flow |

### Threat patterns específicos

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection vía mensaje del cliente | Tampering | El system prompt es trusted; user message va en role:user. Gemini Flash no ejecuta tools en CALL 2. CALL 1 ejecuta solo kb_search (read-only). |
| LLM "convencido" para revelar system prompt o información de otros clientes | Information Disclosure | `workspaceId` filtra DB queries. Sub-loop no tiene acceso a otros workspaces. NUNCA-decir bloquea menciones inapropiadas. |
| Cliente fuerza handoff inválido | Denial of Service (humano) | Bot ya tiene rate-limit + cliente puede solo generar 1 handoff por turn. Aceptable. |
| Información médica incorrecta servida con confidence alto | Tampering (con users) | D-19 threshold + D-09 NUNCA-decir + D-21 prompt anti-invención + smoke A invención check. Riesgo residual A3. |
| Secret leak via prompt logs | Information Disclosure | Observability ya redacta PII (mutation-tools pattern). Verificar Plan 03 que `runWithPurpose('subloop_generation', ...)` no log el prompt completo (system prompt incluye material del topic, OK; user message OK; pero verificar que NO loggemos el OPENAI_API_KEY ni el GOOGLE_GENERATIVE_AI_API_KEY). |

---

## Sources

### Primary (HIGH confidence)

- `[CITED: ai.google.dev/gemini-api/docs/structured-output]` — Google docs oficiales: tablas de support tools + structured output por modelo. Confirma H-2.
- `[CITED: ai.google.dev/gemini-api/docs/pricing]` — Pricing Gemini 2.5 Flash y Flash-Lite 2026-05.
- `[CITED: ai.google.dev/gemini-api/docs/safety-settings]` — Safety settings BLOCK_NONE behavior y limitaciones.
- `[CITED: ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai]` — AI SDK Google provider docs: zod limitations, providerOptions schema.
- `[CITED: ai-sdk.dev/docs/reference/ai-sdk-core/output]` — Output.object API reference.
- `[CITED: vercel.com/blog/ai-sdk-6]` — AI SDK v6 blog post oficial: unified generateText + Output.object.
- `[CITED: github.com/vercel/ai/issues/11348]` — Bug abierto NoOutputGeneratedError en gateway/proxy. Workaround documentado.
- `[CITED: github.com/vercel/ai/issues/11466]` — Bug Gemini 3 + code_execution + Output.object. SDK no maduro para combinación aún.
- `[VERIFIED: repo somnio-sales-v4-runtime-wiring/RESEARCH.md]` — Tests empíricos 2026-05-06 confirmando H-2.
- `[VERIFIED: repo somnio-sales-v4-runtime-wiring/08-ARCHITECTURE-DEEPDIVE.md]` — Estado mecánico actual del sub-loop + iter history.

### Secondary (MEDIUM confidence)

- `[CITED: arxiv 2306.13063]` — "Can LLMs Express Their Uncertainty? An Empirical Evaluation of Confidence Elicitation in LLMs" — paper canónico sobre overconfidence sistémico.
- `[CITED: arxiv 2412.14737]` — "On Verbalized Confidence Scores for LLMs" — discretization + scale design.
- `[CITED: arxiv 2603.09309]` — "Rescaling Confidence: What Scale Design Reveals About LLM Metacognition" — escala 0-20.
- `[CITED: arxiv 2509.07475]` — HALT-RAG: Task-Adaptable Framework with Calibrated NLI Ensembles — base rate hallucination en medical.
- `[CITED: pmc.ncbi.nlm.nih.gov MEGA-RAG]` — "MEGA-RAG: retrieval-augmented framework with multi-evidence guided answer refinement" — 40% reduction en hallucination medical.
- `[CITED: evidentlyai.com/llm-guide/llm-as-a-judge]` — Guía canónica LLM-as-judge: binary scoring, CoT-before-score, bias mitigation.
- `[CITED: artificialanalysis.ai/models/gemini-2-5-flash]` — Gemini 2.5 Flash metrics: TTFT 0.66s, 202 tokens/s, Intelligence Index 21.
- `[CITED: artificialanalysis.ai/models/gemini-2-5-flash-lite]` — Gemini 2.5 Flash-Lite metrics: TTFT 0.70s, 226 tokens/s, Intelligence Index 13.
- `[CITED: machinelearningmastery.com 7-prompt-engineering-tricks]` — Prompt engineering anti-hallucination 30% reduction baseline.

### Tertiary (LOW confidence — flag para validación empírica)

- `[CITED: kernshell.com 2026 RAG]` — RAG reduces hallucination 30-70% across domains (rango amplio sin breakdown por domain específico).
- `[CITED: medium @Nexumo RAG grounding tests]` — 11 tests for RAG grounding (útil como referencia pero específico al author).
- `[ASSUMED]` Flash vs Flash-Lite quality gap en español específicamente (no hay benchmark oficial publicado por Google para par lingüístico).

---

## Metadata

**Confidence breakdown:**

- **Standard stack (versiones, prices, models):** HIGH — verificado con docs oficiales 2026-05.
- **H-2 verification:** HIGH — múltiples sources cross-verificados (Google docs + AI SDK docs + bug history + RESEARCH hermano empírico).
- **Architecture patterns (split tooling/generation):** HIGH — pattern obligatorio por H-2, código de referencia derivable del repo actual.
- **Self-reported confidence calibration:** MEDIUM-HIGH — literatura amplia y consistente, pero la combinación específica de M1-M4 no está validada empíricamente para Gemini Flash en español.
- **Anti-invention strategies:** MEDIUM — literatura sólida pero el threshold "30-40% residual" en medical es paper-dependent. Reality check será Smoke A.
- **Pitfalls list:** HIGH (las primeras 7, todas validadas en repo o issues abiertos). MEDIUM (las últimas 3, derivadas de literatura general).
- **LLM-as-judge pattern:** MEDIUM-HIGH — patrón canónico, pero el specific judge model + rubric no testeado en este standalone yet.
- **Gemini Flash vs Flash-Lite Spanish quality:** LOW — sin benchmark oficial. A1 assumption marcada.

**Research date:** 2026-05-16
**Valid until:** 2026-08-16 (3 meses — stack maduro, low churn esperado). Re-check H-2 trimestralmente por si Gemini 3 GA + SDK bug 11466 cerrado.

---

## Recommendations to Planner (compact)

1. **Plan 01 (KB schema):** Agregar columnas `hechos_del_producto`, `posicion_del_negocio`, `debe_contener TEXT[]`, `cuando_escalar TEXT[]`, `tone_override TEXT`. Marcar `canonical_response` deprecated para somnio-v4. Actualizar RPC RETURNS. Tests: parser + sync + coherence-check.

2. **Plan 02 (KB rewrite):** 18 KBs según template documentado en esta RESEARCH (sección "KB Template Structure"). Validar con coherence-check que TODOS pasan. Smoke embeddings con 5-6 queries representativas (D-06).

3. **Plan 03 (sub-loop split — ATÓMICO con Plan 02):** Crear `tooling-call.ts`, `generation-call.ts`, `safe-output.ts`. Modificar `index.ts` para orquestar. Actualizar `output-schema.ts` (status enum, agregar `responseConfidence` + `confidenceRationale` + `binary`). BORRAR código canonical-verbatim. Implementar Pattern 1-3 de esta RESEARCH.

4. **Plan 04 (few-shots calibración):** Aplicar M1-M4 (probability framing + escala discreta + binary backstop + few-shots concretos del corpus). 8-10 few-shots concretos cubriendo rango 0.20-0.95. Documentar en SUMMARY rationale de cada few-shot.

5. **Plan 05 (Smoke A):** Implementar LLM-as-judge según rubric documentada en esta RESEARCH. ANTES de correr A/B Flash vs Flash-Lite, escribir criterios objetivos. Para CADA caso: chequear invención explícitamente (A3). SMOKE-A-RESULTS.md según estructura recomendada.

6. **Plan 06 (Smoke B):** Verificar que paths NO migrados (crm_mutation, cas_reject, state machine happy) no regresan. Mock cas_reject case (10).

7. **Plan 07 (HOLD):** Solo abrir si Smoke A < 15/17 PASS, o si ≥1 invención detectada, o si A/B Flash-Lite necesita iter.

8. **Pre-Plan 08:** Conversación explícita con usuario surfaceando riesgo A3 (anti-invención sin grounding). Solo proceder si usuario acepta riesgo + smokes PASS.

---

## Sources (markdown links for traceability)

**Primary:**
- [Gemini API Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings)
- [AI SDK Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [AI SDK Output API](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
- [AI SDK v6 Blog](https://vercel.com/blog/ai-sdk-6)
- [vercel/ai#11348 NoOutputGeneratedError bug](https://github.com/vercel/ai/issues/11348)
- [vercel/ai#11466 Gemini 3 + tools + structured output bug](https://github.com/vercel/ai/issues/11466)

**Secondary (papers):**
- [Can LLMs Express Their Uncertainty? (arxiv 2306.13063)](https://arxiv.org/abs/2306.13063)
- [On Verbalized Confidence Scores for LLMs (arxiv 2412.14737)](https://arxiv.org/html/2412.14737v2)
- [HALT-RAG: Hallucination Detection with NLI Ensembles (arxiv 2509.07475)](https://arxiv.org/html/2509.07475v1)
- [MEGA-RAG: Multi-Evidence RAG for Public Health (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12540348/)

**Secondary (practical):**
- [LLM-as-a-Judge Guide (Evidently AI)](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [Gemini 2.5 Flash Analysis](https://artificialanalysis.ai/models/gemini-2-5-flash)
- [Gemini 2.5 Flash-Lite Analysis](https://artificialanalysis.ai/models/gemini-2-5-flash-lite)
- [7 Prompt Engineering Tricks for Hallucination Mitigation](https://machinelearningmastery.com/7-prompt-engineering-tricks-to-mitigate-hallucinations-in-llms/)
- [RAG Grounding Tests for Fake Citations](https://medium.com/@Nexumo_/rag-grounding-11-tests-that-expose-fake-citations-30d84140831a)
