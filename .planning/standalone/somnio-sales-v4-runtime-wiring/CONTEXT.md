---
status: discuss-complete-research-pending
created: 2026-05-06
updated: 2026-05-06
parent_standalone: somnio-sales-v4 (paused pre-flip, commits 01-12.1 shipped)
absorbs: Plan 13 atomic flip del standalone padre (D-23)
---

# Standalone: somnio-sales-v4-runtime-wiring

## Goal

Conectar v4 al runtime real (webhook + sandbox), migrarlo a stack económico (Haiku → Gemini 2.5 Flash-Lite), wirear NoRepetitionFilter para uso futuro, y ejecutar smoke retest desde cero (sandbox + prod con tráfico real). Absorbe el Plan 13 atomic flip del standalone padre.

## Por qué este standalone existe

El standalone original `somnio-sales-v4` shipped Plans 01-12 + Plan 12.1 (commit `7d9bb2e`). Toda la lógica core es paritaria con v3 (transitions, guards, sales-track, response-track, state, phase, comprehension). Pero v4 **nunca se ejecutó en runtime real** porque:

1. `webhook-processor.ts:740-835` solo tiene branches para v3 / godentist / godentist-fb-ig. v4 cae al `else` (V1 path).
2. `sandbox/process/route.ts:60-155` solo branches para v2 / v3 / recompra-v1. v4 cae al `else` (V1 path).
3. `engine-v4.ts` no existe (v3 tiene `engine-v3.ts` para sandbox).
4. Plan 13 (atomic flip de `routing_rules`) **no funcionaría** aún haciéndose, porque el switch del webhook descarta el `agentId='somnio-sales-v4'` y corre V1.

El dropdown del routing-editor SÍ muestra v4 (porque `agentRegistry.register(somnioV4Config)` se ejecuta vía `import '@/lib/agents/somnio-v4'`), pero **el dropdown ≠ el switch del runtime**.

## Scope

### In scope (este standalone)

1. **Runtime wiring:**
   - Crear `src/lib/agents/engine/v4-production-runner.ts` (paralelo a `v3-production-runner.ts`, **duplicado 100%** — D-13)
   - Crear `src/lib/agents/somnio-v4/engine-v4.ts` (sandbox wrapper, paralelo a `engine-v3.ts`)
   - Branch `agentId === 'somnio-sales-v4'` en `src/lib/agents/production/webhook-processor.ts:740`
   - Branch `agentId === 'somnio-sales-v4'` en `src/app/api/sandbox/process/route.ts`

2. **Modelo swap (solo v4):**
   - `comprehension.ts:84` Haiku → Gemini 2.5 Flash-Lite
   - `sub-loop/index.ts:54` Haiku → Gemini 2.5 Flash-Lite
   - `sub-loop/nunca-decir-check.ts:34` Haiku → Gemini 2.5 Flash-Lite
   - **Migración Anthropic SDK directo → AI SDK v6 + `google()` provider** (Opción A — D-10)
   - Verificar compatibility con LoopOutcome discriminated union ANTES de implementar (D-8)
   - Si Gemini falla en algún call → investigar alternativa económica per-call (D-11)

3. **NoRepetitionFilter wiring (gated por flag, para uso futuro):**
   - Wire dentro del `V4ProductionRunner` (mismo patrón que `v3-production-runner.ts:280`)
   - Filter aplica a templates response-track + outputs sub-loop `template_match` (D-17)
   - Flag separado `USE_NO_REPETITION_V4` (D-16)
   - Modelo del filter: decisión post-research (D-18)

4. **Smoke retest desde cero (D-23 — sandbox + PROD CON TRÁFICO REAL):**
   - **Wave A: Sandbox** — los 5 casos de overconfidence (RESUME-NOTES.md original) + sub-loop trigger + KB retrieval + dedupe Nivel 1 + order creation flow
   - **Wave B: Prod con tráfico real** — atomic flip via `routing_rules`. Volumen bajo de clientes ahora reduce riesgo. SQL de rollback rápido a la mano.
   - Verificación observability: `pipeline_decision:subloop_*` events aparecen con `agent_id='somnio-sales-v4'` (D-24)
   - Query costos por agente al cierre + VERIFICATION.md (D-27)

### Out of scope (otros standalones)

- **CRM reader/writer Sonnet → GPT-mini swap** — NO afecta v4 (v4 usa `crm-mutation-tools` directo). Standalone separado para recompra-v1 + pw-confirmation.
- **Modelo swap en v3 / godentist / recompra / pw-confirmation** — Regla 6: están en prod. Standalones separados.
- **LEARNINGS.md del padre `somnio-sales-v4`** — se escribe cuando este standalone cierra.

## Decisiones lockeadas (D-1 a D-28)

### Decisiones tempranas (D-1 a D-7)

- **D-1:** `V4ProductionRunner` SEPARADO de `V3ProductionRunner`. Razón: "v4 es independiente a v3" + D-24 padre (cero imports desde `@/lib/agents/somnio-v3/*`).
- **D-2:** Standalone nuevo, NO Plan 12.2 dentro del padre. Razón: "todo por aparte".
- **D-3:** NoRepetitionFilter wired en v4 (gated por flag) aunque hoy esté OFF en prod. Razón: "anade la logica si depronto la usamos luego".
- **D-4:** Modelo swap aplica SOLO a v4 (Regla 6 protege agentes en prod).
- **D-5:** **Stack mixto Haiku → (Gemini Flash-Lite + GPT-4o mini)** en los 3 lugares activos de v4. Ver D-30 para mapping detallado por call. Razón: research-phase descubrió que Gemini API NO soporta tools + Output.object combinados, por lo que el sub-loop necesita GPT-4o mini.
- **D-6:** CRM reader/writer Sonnet swap → OTRO standalone separado.
- **D-7:** Compatibility check Gemini vs Haiku con AI SDK v6 + Zod ANTES de implementar.

### Bloque A — Compatibility Gemini (research-phase scope)

- **D-8:** Research mini con test puntual del schema `LoopOutcome` discriminated union. ~30min.
- **D-9:** Setup base (cuenta Google AI + API key + `npm install @ai-sdk/google` + `GOOGLE_GENERATIVE_AI_API_KEY` en Vercel) entra al research-phase como precondición.
- **D-10:** **Opción A modificada — migración a stack mixto (post-research).** Originalmente "solo Gemini en los 3 calls"; research demostró que Gemini API NO soporta tools + Output.object combinados (necesario en sub-loop). Mapping final en D-30. Re-shape `LoopOutcomeSchema` obligatorio (D-29). `comprehension-schema.ts` queda igual (Gemini lo acepta sin cambios).
- **D-11:** **Sin fallback de modelo.** Gemini para comprehension + nunca-decir, GPT-4o mini para sub-loop (cada uno único viable para su call). Si alguno falla en runtime → escalation humana natural via lógica existente (`requiresHuman=true`, bot guarda silencio). Razón: research no encontró failures persistentes, fallback secundario sería complejidad innecesaria.
- **D-12:** **Re-calibración NO necesaria.** Research-phase confirmó que Plan 12.1 confidence values funcionan perfecto en Gemini sin ajuste (5/5 match). Ahorra 1-2h del trabajo presupuestado.
- **D-29 (NUEVO post-research):** **Re-shape `LoopOutcomeSchema` obligatorio.** El schema actual con `z.discriminatedUnion` + `z.literal(false)` + `z.record(z.string(), z.string())` es rechazado por TODOS los providers (Anthropic, Gemini, OpenAI). Cambios obligatorios en `output-schema.ts`:
  - Eliminar `z.discriminatedUnion('status', [...])` → reemplazar por `z.object({ status: z.enum([...]), ...campos opcionales })`
  - Reemplazar `requiresHuman: z.literal(false)` con `requiresHuman: z.boolean()` (validar post-hoc)
  - Eliminar `z.record(z.string(), z.string())` para `extraContext` → reemplazar por campos nullable pre-definidos o eliminar campo si no se usa
  - Cambiar `.optional()` por `.nullable()` en campos opcionales (OpenAI strict mode rechaza `.optional()`)
  - Validación post-hoc en `sub-loop/index.ts` para enforcar invariantes (status='canonical' → canonicalText !== null)
  - Adaptar consumer en `somnio-v4-agent.ts` (no más type narrowing por discriminator — usar `if (output.status === 'canonical')` con campos opcionales)
- **D-30 (NUEVO post-research):** **Stack mixto definitivo por call:**
  - `comprehension.ts:84` → **Gemini 2.5 Flash-Lite** (single-shot, no tools, schema actual funciona)
  - `sub-loop/index.ts:54` → **GPT-4o mini** (necesita tools + Output.object combinados; Gemini API no soporta combinación)
  - `sub-loop/nunca-decir-check.ts:34` → **Gemini 2.5 Flash-Lite** (single-shot simple)
  - **Env vars en Vercel (confirmadas por jose 2026-05-06):**
    - `GOOGLE_GENERATIVE_AI_API_KEY` — usado por `@ai-sdk/google` default
    - `OPENAI_API_KEY_SALESV4` — **nombre custom con sufijo** `_SALESV4` para aislar la key de v4 sub-loop de la key vieja `OPENAI_API_KEY` (KB sync, scopes restringidos, sigue intacta). Implica usar `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })` en lugar del default `openai()`.
  - Costo estimado: ~$23/mes a 100K turnos (vs $21 all-Gemini imposible, vs $31 all-GPT). Diferencia trivial vs simplicidad de single-provider.

### Bloque B — V4ProductionRunner arquitectura

- **D-13:** **Duplicar 100%** boilerplate (no shared helpers, no abstract base). Razón: v3 será deprecado eventualmente, transición v3→v4 corta. Cuando v3 muera, borras `v3-production-runner.ts` y queda v4 limpio. Cero refactor a v3 = cero riesgo a Somnio prod durante desarrollo.
- **D-14:** Sub-loop NO se invoca en `processSystemEvent` (timer events). Sub-loop solo dispara en user_message via escalation triggers; timers van directo a state machine + response-track.
- **D-15:** Rate limit bucket propio `'somnio-v4'` (aislamiento durante pruebas vs v3 prod).

### Bloque C — NoRepetitionFilter wiring

- **D-16:** Flag separado `USE_NO_REPETITION_V4` (no global compartido).
- **D-17:** Filter aplica a templates response-track Y outputs sub-loop `template_match`. La dedupe es por contenido enviado al cliente, no por origen.
- **D-18:** Modelo del filter (minifrase generation + comparison): decisión post-research. Si Gemini Flash-Lite OK → swap. Si no → mantener Sonnet (deuda menor, flag OFF default).

### Bloque D — engine-v4.ts (sandbox wrapper)

- **D-19:** Mismo `SandboxState` global (`@/lib/sandbox/types`), mapeo interno SandboxState → V4AgentInput dentro de `engine-v4.ts`.
- **D-20:** Extender `debugTurn` con campos opcionales (subLoopReason, kbHits, nuncaDecirMatches, threshold actual). NO crear tab nueva en debug panel — UI renderiza si los campos existen.
- **D-21:** Retomas simuladas en sandbox (mismo patrón que v3).
- **D-22:** KB real (Supabase prod, workspace Somnio) en sandbox. NO mock — para testear pgvector retrieval real.

### Bloque E — Smoke retest

- **D-23:** Smoke = **sandbox primero + PROD CON TRÁFICO REAL**. Prod = activar v4 en `routing_rules` (atomic flip). Aprovechando volumen bajo de clientes ahora. Esto **absorbe el Plan 13 padre**. SQL rollback rápido a la mano: `UPDATE routing_rules SET active=false WHERE name='somnio-v4-routing'`.
- **D-24:** Smoke verifica `pipeline_decision:subloop_*` events en `agent_observability_events` con `agent_id='somnio-sales-v4'`.

### Bloque F — Plan 12.1 (commit `7d9bb2e`)

- **D-25:** Plan 12.1 (`7d9bb2e`) se mantiene en main. Si Gemini se comporta similar → sirve igual. Si distinto → recalibramos (D-12 ya cubre 1-2h).
- **D-26:** NO A/B Haiku vs Gemini previo. El research-phase test puntual con outputs comparados es el control suficiente.

### Bloque G — Costos y monitoring

- **D-27:** Query SQL de costos por agente (workspace + agent_id + model + purpose) al cierre del smoke + VERIFICATION.md.
- **D-28:** Pricing comparison + caching analysis (Anthropic 90% cache discount vs Gemini context caching distinto) en research-phase.

## Stack técnico afectado

### Modelos AI usados por v4 (HOY)

| Archivo | Línea | Modelo | Stack | Schema |
|---|---|---|---|---|
| `comprehension.ts` | 84 | `claude-haiku-4-5-20251001` | Anthropic SDK directo + tools API | `comprehension-schema.ts` |
| `sub-loop/index.ts` | 54 | `claude-haiku-4-5-20251001` | AI SDK v6 + `anthropic()` + `generateObject` | `output-schema.ts` (LoopOutcome — discriminated union 4 variants) |
| `sub-loop/nunca-decir-check.ts` | 34 | `claude-haiku-4-5-20251001` | AI SDK v6 + `anthropic()` + `generateObject` | Schema simple boolean + reason |
| `knowledge-base/embed.ts` | 19 | `text-embedding-3-small` (OpenAI) | OpenAI SDK directo | NO se cambia (embeddings KB) |
| `config.ts` | 40, 46 | `CLAUDE_MODELS.HAIKU` (metadata) | — | Placeholder, no ejecuta |

### Modelos AI target (POST-SWAP por D-10)

| Archivo | Modelo target | Stack target | Riesgo compatibility |
|---|---|---|---|
| `comprehension.ts:84` | `gemini-2.5-flash-lite` | `@ai-sdk/google` + `generateObject` | **MEDIO**: re-shape llamada (Anthropic SDK → AI SDK) |
| `sub-loop/index.ts:54` | `gemini-2.5-flash-lite` | `@ai-sdk/google` + `generateObject` | **ALTO**: discriminated union LoopOutcome |
| `sub-loop/nunca-decir-check.ts:34` | `gemini-2.5-flash-lite` | `@ai-sdk/google` + `generateObject` | **BAJO**: schema simple |
| NoRepetitionFilter (cuando se wire) | TBD post-research | `@ai-sdk/google` o mantener `@anthropic-ai/sdk` | Decisión post-research (D-18) |

### Env vars necesarias

- `GOOGLE_GENERATIVE_AI_API_KEY` — **NO existe en Vercel actual.** Hay que crearla antes de deploy.
- `OPENAI_API_KEY` — fallback potencial si Gemini falla en algún call (D-11). La pegada en chat sigue válida pero pendiente de revocar — security cleanup post-shipment.
- `USE_NO_REPETITION_V4` — flag nuevo (default OFF/unset).
- `ANTHROPIC_API_KEY` — sigue necesaria (otros agentes en prod).

## Riesgos identificados

1. **Calibración del few-shot puede cambiar** entre Haiku y Gemini — D-12 cubre 1-2h adicionales.
2. **Discriminated union LoopOutcome** es el schema más complejo — punto de mayor riesgo en research (A1).
3. **`GOOGLE_GENERATIVE_AI_API_KEY` no existe en Vercel** — bloqueante para deploy hasta crear.
4. **Cache pricing distinto** — el ahorro 10-12x nominal puede variar real con caching ON/OFF (D-28 lo verifica).
5. **Duplicar 100% V4ProductionRunner** → bug en boilerplate común durante transición v3→v4 = arreglar 2 lugares. Costo aceptado por transición corta.
6. **Plan 12.1 (`7d9bb2e`) está en main pero nunca testeado en runtime real** — no hay rollback automático si Gemini lo rompe. Mitigación: smoke en sandbox primero (Wave A de D-23).
7. **Smoke en prod con tráfico real (D-23)** — riesgo bajo por volumen reducido, pero requiere monitoreo cercano + SQL rollback listo.
8. **Migración Anthropic SDK → AI SDK v6 en `comprehension.ts`** — refactor de la llamada API; testing crítico en research.

## Próximos pasos (workflow GSD)

1. ✅ `/gsd-discuss-phase` — completo (D-1 a D-28 lockeadas).
2. **→ Próximo: `/gsd-research-phase somnio-sales-v4-runtime-wiring`** — bloqueante para `/gsd-plan-phase`. Scope:
   - Setup base (cuenta Google AI + API key + SDK install)
   - Test puntual LoopOutcome discriminated union con Gemini Flash-Lite vs Haiku
   - Test puntual schema comprehension con Gemini
   - Test puntual schema nunca-decir-check con Gemini
   - Pricing comparison + caching analysis
   - Latencia comparison (p50, p95)
   - Si algún call falla → investigar alternativa económica (Gemini 2.5 Flash no Lite, GPT-4o mini, etc.)
   - Output: `RESEARCH.md` con recomendación final por cada call
3. `/gsd-plan-phase somnio-sales-v4-runtime-wiring` — 5-7 plans en waves (post-research):
   - Wave 0: setup deps + env vars + V4ProductionRunner duplicado
   - Wave 1: engine-v4.ts (sandbox wrapper) + branch sandbox
   - Wave 2: branch webhook-processor + smoke wave A (sandbox)
   - Wave 3: modelo swap + re-calibración + smoke wave A retest
   - Wave 4: NoRepetitionFilter wired (gated)
   - Wave 5: smoke wave B (prod con tráfico real, atomic flip)
4. `/gsd-execute-phase` — commits atómicos.
5. `/gsd-verify-work` — VERIFICATION.md con observability + costos query.
6. LEARNINGS.md.

## Activación final (D-23 absorb del Plan 13 padre)

SQL pre-formado para Wave 5 (smoke wave B = atomic flip):

```sql
-- Pre-check: verificar que NO hay regla activa actual con somnio-sales-v4
SELECT id, name, priority, conditions, event, active
FROM routing_rules
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND active = true
ORDER BY priority;

-- Crear regla v4 (atomic flip):
BEGIN;
  -- Desactivar regla v3 actual de Somnio (si existe)
  UPDATE routing_rules
  SET active = false
  WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    AND active = true
    AND event->>'agent_id' = 'somnio-sales-v3';

  -- Activar regla v4
  INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
  VALUES (
    'a3843b3f-c337-4836-92b5-89c58bb98490',
    'Somnio v4 routing (post-flip)',
    'router',
    100,
    jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('fact', 'channel', 'operator', 'in', 'value', ARRAY['whatsapp'])
    )),
    jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'somnio-sales-v4')),
    true
  );
COMMIT;

-- Rollback rápido (si smoke wave B falla):
BEGIN;
  UPDATE routing_rules SET active = false
  WHERE name = 'Somnio v4 routing (post-flip)';
  UPDATE routing_rules SET active = true
  WHERE name = '<nombre original de la regla v3>';
COMMIT;
```
