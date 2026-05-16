# Somnio v4 RAG Generative — CONTEXT

**Standalone:** `somnio-v4-rag-generative`
**Created:** 2026-05-16
**Status:** Discuss-phase capturado (informal — formalización pendiente en `DISCUSSION-LOG.md`)
**Live progress:** `STATUS.md` en esta carpeta

---

## El qué

Rediseño arquitectónico del sub-loop de `somnio-sales-v4` para reemplazar el approach **canonical-verbatim** (texto enlatado del KB enviado palabra por palabra al cliente) por un approach **RAG-generative** (el KB pasa a ser material fuente y un LLM redacta respuestas adaptadas a la pregunta específica).

El sub-loop hoy responde a clientes con texto fijo curado por humanos. El sub-loop nuevo va a responder con texto generado por Gemini Flash usando SOLO la info del KB como insumo, con un mecanismo de auto-evaluación: si el modelo siente que el material no cubre la pregunta, dispara handoff silente.

## El por qué

Tres razones convergen:

1. **El approach canonical es brittle.** Dos clientes preguntando lo mismo con phrasings distintos reciben EXACTAMENTE el mismo texto enlatado de 70 palabras, sin importar si la pregunta era específica o genérica. No aprovecha que el sub-loop tiene un LLM razonando.

2. **La rigidez tiene costo conversacional.** Para preguntas chicas el cliente recibe un sermón completo. Para preguntas borderline (lupus en `contraindicaciones` que solo menciona "autoinmunes" genérico) el cliente recibe respuesta diluida.

3. **La limitación técnica H-2 que justificaba GPT-4o mini puro se evapora si separamos tooling de generación.** Gemini Flash no soporta tools + Output schema en MISMA call, pero sí soporta cada uno por separado.

Discusión completa que llevó a esta decisión: ver `08-ARCHITECTURE-DEEPDIVE.md` del standalone hermano `somnio-sales-v4-runtime-wiring`.

## El scope (qué SE TOCA)

```
src/lib/agents/somnio-v4/
├── knowledge/                   ← TODOS los 18 .md cambian de formato
├── knowledge-base/
│   ├── parser.ts                ← schema del frontmatter actualizado
│   ├── sync.ts                  ← extracción de nuevas secciones a DB
│   └── coherence-check.ts       ← validaciones nuevas
├── sub-loop/
│   ├── index.ts                 ← reorganización: tooling con GPT mini + generación con Gemini Flash
│   ├── kb-search-tool.ts        ← potencial ajuste si cambia el RPC retorno
│   ├── output-schema.ts         ← LoopOutcomeSchema cambia de canonical/template/no_match a generated/no_match
│   ├── prompt.ts                ← prompts nuevos para tooling vs generación
│   └── nunca-decir-check.ts     ← SIN CAMBIOS (sigue Gemini Flash-Lite)
└── escalation.ts                ← SIN CAMBIOS

supabase/migrations/             ← nueva migración para columnas del KB schema
```

## Lo que NO SE TOCA (Regla 6 — protección agentes productivos)

```
src/lib/agents/somnio-v3/                 ← agente productivo Somnio
src/lib/agents/somnio-recompra/           ← productivo
src/lib/agents/somnio-pw-confirmation/    ← productivo (con activación diferida)
src/lib/agents/godentist/                 ← productivo
src/lib/agents/godentist-fb-ig/           ← productivo (con activación diferida)
src/lib/agents/somnio-v4/comprehension*   ← funciona, no se toca
src/lib/agents/somnio-v4/state-machine*   ← funciona, no se toca
```

v4 sigue **DORMANT en producción** durante todo este standalone — no hay routing rule. Plan 08 (último plan del standalone) es quien activa con SQL manual.

## Restricciones operacionales

- **No tocar v3 productivo (Regla 6).** v3 sigue atendiendo a clientes de Somnio durante todo este trabajo.
- **No crear routing rule que active v4 hasta Plan 08.** Antes de eso, el código nuevo vive pero no recibe tráfico.
- **No saltar GSD (Regla 0).** discuss-phase formal + research-phase + plan-phase + execute-phase + verify-phase obligatorios.
- **Big-bang en la migración** (D-23, D-24): los 18 KBs + el código del sub-loop cambian en un commit atómico. NO mantenemos canonical verbatim como fallback (decisión consciente — `08-ARCHITECTURE-DEEPDIVE.md` argumentó por simplicidad de código).
- **No tocar `comprehension-schema.ts`** (D-25 del standalone hermano, sigue locked).
- **No usar GPT-4o mini en generación** (decisión arquitectónica D-08: Gemini Flash para generación, GPT mini solo para tooling).

## Quién consume esto

**Consumidor downstream (post-flip):** webhook WhatsApp inbound al workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) cuando una routing rule active `agent_id='somnio-sales-v4'`. Por ahora, NADIE — v4 dormant.

**Consumidor upstream:** `webhook-processor.ts` despachará a v4 cuando la routing rule exista. No requiere cambios en el webhook hasta Plan 08.

## Dependencias técnicas confirmadas

- **AI SDK v6** (ya en uso por v4)
- **Anthropic SDK** (no requerido — Gemini Flash + GPT-4o mini cubren todo)
- **`@ai-sdk/google`** (ya en uso para Flash-Lite en comprehension y validación)
- **`@ai-sdk/openai`** (ya en uso para GPT-4o mini en sub-loop tooling)
- **OpenAI API key** `OPENAI_API_KEY_SALESV4` (existe en Vercel)
- **Google Gemini API key** `GOOGLE_GENERATIVE_AI_API_KEY` (existe en Vercel, Cloud Billing habilitado, BLOCK_NONE safety configurado desde Iter 5b)
- **Postgres pgvector + HNSW index** sobre `agent_knowledge_base.embedding` (ya existe del standalone hermano)
- **OpenAI `text-embedding-3-small` 1536-dim** para embeddings (ya en uso)

## Pre-checks que el ejecutor va a verificar

```sql
-- v4 sigue dormant
SELECT count(*) FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND active=true
  AND event::text LIKE '%somnio-sales-v4%';
-- Esperado: 0 (antes de Plan 08)

-- KB existe con 18 topics
SELECT count(*) FROM agent_knowledge_base
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id='somnio-sales-v4';
-- Esperado: 18

-- Threshold productivo configurado
SELECT value FROM platform_config
WHERE key='somnio_v4_low_confidence_threshold';
-- Esperado: 0.70

-- Cloud Billing Gemini habilitado (manual check en Vercel)
-- Esperado: env var GOOGLE_GENERATIVE_AI_API_KEY set, billing OK
```

## Métricas de éxito (verify-phase)

**Smoke A (rediseño RAG — 17 casos):**
- ≥15/17 casos pasan en evaluación Jose
- 3/3 casos negativos (apnea, Miami, cripto) disparan handoff silente correctamente
- 0 casos donde el modelo inventó info fuera del KB (validación manual)

**Smoke B (regression — 10 casos):**
- ≥9/10 casos pasan (estos paths NO migraron, solo se reorganizó código)
- 0 regresiones en state machine happy path (templates intactos)
- crm_mutation create/update/move funciona end-to-end
- razonamiento_libre dispara handoff silente correctamente

**Performance:**
- Latencia p50 sub-loop <6s (vs ~4s actual — esperamos +1-2s por la 2da call de Gemini)
- Costo <$2/día en 1000 turns

**Antes de Plan 08 (flip productivo):**
- Ambos smokes pasan
- LEARNINGS.md capturado
- Migration SQL aplicada en producción (Regla 5)

## Estructura de archivos prevista del standalone

```
.planning/standalone/somnio-v4-rag-generative/
├── CONTEXT.md                        ← este archivo (qué/por qué — estable)
├── DISCUSSION-LOG.md                 ← decisiones D-01..D-XX (append-only)
├── STATUS.md                         ← progreso live (actualizado por cada plan)
├── RESEARCH.md                       ← producido por research-phase
├── 01-PLAN.md ... 08-PLAN.md         ← plans producidos por plan-phase
├── 01-SUMMARY.md ... 08-SUMMARY.md   ← summaries post-execute por plan
├── SMOKE-A-RESULTS.md                ← producido en Plan 05
├── SMOKE-B-RESULTS.md                ← producido en Plan 06
└── LEARNINGS.md                      ← post-verify
```

## Re-entry post-clear

**Si abrís una sesión nueva con `/clear`:**

1. Lee `STATUS.md` PRIMERO — te dice el estado actual exacto
2. Después `CONTEXT.md` (este archivo) para entender qué y por qué
3. Después `DISCUSSION-LOG.md` para ver decisiones locked
4. Después el último plan abierto (cualquiera de los 0X-PLAN.md activos)

Si vas a operar el smoke, todos los casos están con checkboxes en `STATUS.md`. Marcalos a medida que pasan/fallan.
