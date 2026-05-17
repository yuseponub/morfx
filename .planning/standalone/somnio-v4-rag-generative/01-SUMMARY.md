---
phase: standalone-somnio-v4-rag-generative
plan: 01
subsystem: knowledge-base
tags: [somnio-v4, rag, postgres-rpc, pgvector, supabase, parser, zod, vitest]

# Dependency graph
requires:
  - phase: somnio-v4-runtime-wiring
    provides: agent_knowledge_base table + RPC match_knowledge_base (versión canonical-verbatim, ahora superseded)
provides:
  - 5 columnas nuevas en agent_knowledge_base (hechos_del_producto, posicion_del_negocio, debe_contener, cuando_escalar, tone_override)
  - RPC match_knowledge_base con RETURNS shape extendido (12 columnas vs 7 originales)
  - Parser TS reconoce 5 markdown headers nuevos + ignora 3 deprecated silenciosamente
  - Frontmatter Zod schema extendido con tone_override opcional
  - Sync upsertea las 5 columnas nuevas + deja canonical_response = null para somnio-v4
  - Coherence-check valida secciones requeridas + prefijos [SIEMPRE] / [SI APLICA]
  - 32 unit tests verdes (15 parser + 17 coherence-check)
affects:
  - Plan 02 (reescritura de 18 KBs en formato nuevo) — depende de las 5 columnas + parser
  - Plan 03 (sub-loop RAG-generative con Gemini Flash redactando) — depende de RPC shape nuevo
  - Plan 04/05/06 (calibración + smoke A/B)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Big-bang schema migration aplicada manualmente en prod ANTES del push (Regla 5)"
    - "ADD COLUMN IF NOT EXISTS + DROP/CREATE RPC para idempotencia y shape change"
    - "Parser parseSections con includes() defensive (acentos opcionales)"
    - "Frontmatter Zod nullable().optional() para tone_override"
    - "coherence-check con 3-arg signature (filePath, category, sections)"

key-files:
  created:
    - "supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql"
    - ".planning/standalone/somnio-v4-rag-generative/01-SUMMARY.md"
  modified:
    - "src/lib/agents/somnio-v4/knowledge-base/parser.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/sync.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts"
    - ".planning/standalone/somnio-v4-rag-generative/STATUS.md"
    - ".planning/STATE.md"

key-decisions:
  - "D-01: KB format = 1 frontmatter YAML + 5 markdown sections (Hechos / Posición / Debe contener / NUNCA / Cuándo escalar)"
  - "D-03: items de Debe contener prefijados con [SIEMPRE] o [SI APLICA] — enforced por coherence-check"
  - "D-05: tone_override opcional en frontmatter (string | null | undefined) para override per-topic del Tono Somnio global"
  - "D-24: canonical_response = null para somnio-v4 — eliminamos canonical verbatim; RAG generativo redacta desde KB en runtime"
  - "Regla 5 honored: migración aplicada en prod ANTES del push (user confirmó con 4 verify queries 2026-05-16)"
  - "Regla 6 honored: v4 sigue dormant — active_v4_rules = 0 en routing_rules"

patterns-established:
  - "Schema RAG-generative (5 columnas TEXT/TEXT[]) reusable para cualquier agente que migre de canonical-verbatim a RAG generativo"
  - "Parser defensive con acento opcional (includes('posición') || includes('posicion'))"
  - "coherence-check con buildSections helper para tests (DRY, partial overrides)"
  - "Regla 5 checkpoint workflow: archivo SQL → STOP → user apply → 4 verify queries → approved → push"

requirements-completed: []

# Metrics
duration: ~2h (incluyendo Regla 5 PAUSE)
completed: 2026-05-16
---

# Plan 01: KB Schema RAG-generative Summary

**Schema foundation lista: 5 columnas + RPC shape extendido en prod + parser/sync/coherence-check TS refactor — sub-loop RAG (Plans 02/03) unblocked.**

## Performance

- **Duration:** ~2h (incluyendo Regla 5 PAUSE para apply en prod Supabase)
- **Started:** 2026-05-16 ~18:30 UTC
- **Completed:** 2026-05-16 ~20:55 UTC
- **Tasks:** 6/6 (4 + checkpoint + tests + push)
- **Files modified/created:** 7 (3 TS source + 2 TS tests + 1 SQL migration + 1 SUMMARY) + STATUS/STATE updates

## Accomplishments

1. **Migración SQL aplicada en producción Supabase** (Regla 5) — usuario confirmó con 4 verify queries: las 5 columnas existen, RPC retorna shape nuevo, smoke embedding=zero retornó 1 row, `active_v4_rules = 0` (v4 sigue dormant).
2. **Parser TS** ahora reconoce los 5 headers RAG-generative (D-01 #2..#6) + frontmatter extendido con `tone_override` (D-05). Headers deprecated (`Respuesta canónica`, `Si el cliente insiste`, `Sources`) se ignoran silenciosamente sin throwear — facilita migración gradual de los 18 KBs en Plan 02.
3. **Sync TS** upsertea las 5 columnas nuevas + `canonical_response: null` para somnio-v4 (D-24). Cuando Plan 02 corre, los 18 KBs se reescriben atómicamente con el shape nuevo.
4. **Coherence-check TS** valida secciones requeridas (D-01) + prefijos `[SIEMPRE]` / `[SI APLICA]` en `debeContener` (D-03). Esto previene KBs malformados en Plan 02.
5. **32 unit tests verdes** (15 parser + 17 coherence-check) — cobertura de happy path, deprecated headers, defensive sin tilde, tone_override opcional/string/null, prefijos válidos/inválidos, arrays vacíos permitidos en topics no-edge-case.

## Task Commits

Cada tarea committeada atómicamente (commits en español, Co-Authored-By Claude):

1. **Task 1.1 — parser.ts** (5 headers nuevos + tone_override) — `c55aed4` (feat)
2. **Task 1.2 — sync.ts** (upsertPayload con 5 columnas + canonical_response=null) — `d35f645` (feat)
3. **Task 1.3 — coherence-check.ts** (5 secciones + prefijos) — `f7d666b` (feat)
4. **Task 1.4 — migración SQL** (`supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql`) — `eea5e14` (feat)
5. **Task 1.5 — Regla 5 PAUSE → user apply migration en prod Supabase** (2026-05-16, user confirmó approved con 4 verify queries)
6. **Task 1.6 — tests parser + coherence-check** — `b6c6e20` (feat)
7. **Task 1.7 — SUMMARY + STATUS + STATE + push** — (commit final + `git push origin main`)

_Nota: Task 1.4 (creación de migración) y Task 1.5 (PAUSE) se ejecutaron como dos pasos del mismo plan-task atómico — la migración se commiteó local, NO se pusheó hasta confirmación del usuario en Task 1.5._

## Regla 5 — Migration Apply Confirmation

**Aplicada en producción Supabase:** 2026-05-16 por Jose (usuario).

### Verify queries — outputs confirmados por usuario

```sql
-- 1. Columnas nuevas existen:
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='agent_knowledge_base'
  AND column_name IN ('hechos_del_producto','posicion_del_negocio','debe_contener','cuando_escalar','tone_override')
ORDER BY column_name;
-- ✅ 5 rows: cuando_escalar, debe_contener, hechos_del_producto, posicion_del_negocio, tone_override
```

```sql
-- 2. RPC actualizada — RETURNS shape:
SELECT pg_get_function_result(oid)
FROM pg_proc WHERE proname='match_knowledge_base';
-- ✅ Incluye hechos_del_producto, posicion_del_negocio, debe_contener, cuando_escalar, tone_override (12 columnas total).
```

```sql
-- 3. RPC smoke con embedding zero:
SELECT * FROM public.match_knowledge_base(
  'a3843b3f-c337-4836-92b5-89c58bb98490'::uuid,
  'somnio-sales-v4',
  array_fill(0::real, ARRAY[1536])::vector(1536),
  NULL,
  1
) LIMIT 1;
-- ✅ 1 row del KB existente `interaccion_alcohol` con las 5 columnas nuevas como null/[]
--    (esperado — Plan 02 las pobla al reescribir los 18 KBs en formato nuevo).
```

```sql
-- 4. v4 dormant en prod:
SELECT count(*) AS active_v4_rules FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND active=true
  AND event::text LIKE '%somnio-sales-v4%';
-- ✅ active_v4_rules = 0 (Regla 6 honored — v4 sin tráfico productivo).
```

## Files Created/Modified

### Created

- **`supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql`** — ALTER TABLE add 5 columns + DROP/CREATE RPC `match_knowledge_base` con RETURNS shape extendido + GRANT EXECUTE a service_role + ROLLBACK manual documentado en comments.

### Modified

- **`src/lib/agents/somnio-v4/knowledge-base/parser.ts`** — `FrontmatterSchema` agrega `tone_override: z.string().nullable().optional()`. `ParsedKbDoc.sections` cambia shape a `{ hechosDelProducto, posicionDelNegocio, debeContener, nuncaDecir, cuandoEscalar }`. `parseSections` reescrito para reconocer 5 headers nuevos (con defensive sin tilde) + ignorar deprecated silenciosamente.
- **`src/lib/agents/somnio-v4/knowledge-base/sync.ts`** — `upsertPayload` agrega 5 columnas nuevas (`hechos_del_producto`, `posicion_del_negocio`, `debe_contener`, `cuando_escalar`, `tone_override`). `canonical_response: null` para somnio-v4 (D-24).
- **`src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts`** — Signature extendida a 3 args `(filePath, frontmatterCategory, sections)`. Valida secciones non-empty + prefijos `[SIEMPRE]/[SI APLICA]` + arrays.
- **`src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts`** — 15 tests cubriendo shape nuevo + deprecated handling + tone_override + defensive acentos + header corto.
- **`src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts`** — 17 tests cubriendo folder vs category + secciones requeridas + prefijos + arrays vacíos + defensive non-array guard.

## Verification

```
npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/

✓ src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts  (17 tests)
✓ src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts           (15 tests)

Test Files  2 passed (2)
     Tests  32 passed (32)
```

```
npx tsc --noEmit -p . 2>&1 | grep -E "knowledge-base/" | wc -l
0
```

## Deviations from Plan

**Ninguna sustantiva.** El plan canónico (`01-PLAN.md`) tenía Tasks 1.1..1.7 (incluyendo 1.5 como checkpoint Regla 5 PAUSE). El executor previo decidió commitear Task 1.4 (creación de migración) en el mismo commit que conceptualmente representa la barrera del PAUSE — esto NO viola ningún criterio del plan: el archivo SQL quedó stagged + committeado local pero NO pusheado hasta la confirmación del usuario (que llegó vía verify queries de Task 1.5).

Renumeración informal en la conversación: el executor previo se refería a Task 1.5 como "PAUSE" y Task 1.6 como "tests" — el plan canónico tiene Task 1.5 = PAUSE y Task 1.6 = tests, así que la numeración coincide.

### Auto-fixed durante Task 1.6 (tests)

- **[Rule 1 - Test bug] Caso-sensitivity en `.toContain`** — primera versión del test "parses valid frontmatter and all 5 RAG sections" usaba `.toContain('producto premium'.toLowerCase())` esperando que match contra "Producto premium" del fixture. `toContain` es case-sensitive en strings, así que fallaba. Fix: usar el string exact-case `'Producto premium'`. **Files modified:** `src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts`. **Commit:** incluido en `b6c6e20` (no commit aparte — fix antes del primer commit del task).

## Known Stubs

Ninguno introducido por este plan. Los 18 KBs en producción tienen las 5 columnas nuevas como `null` / `[]` — eso NO es un stub sino el state-of-the-world post-migración: Plan 02 los rellena al reescribir cada KB en formato nuevo. v4 sigue dormant entonces no hay impacto runtime.

## Next Steps

1. **Plan 02** (reescritura de los 18 KBs en formato RAG-generative) + **Plan 03** (sub-loop split tooling/generación con Gemini Flash redactando + handoff silente por `response_confidence < 0.70`).
   - D-23 + D-24: Plans 02 y 03 son **atómicos** — no se puede pushear uno sin el otro porque borrar `canonical_response` (Plan 03) sin tener material fuente nuevo poblado (Plan 02) deja v4 sin nada para generar respuestas.
   - Comando: `/gsd-execute-phase somnio-v4-rag-generative --wave 2`
2. Tras Plans 02+03 ship, Plans 04 (few-shots calibración) → 05 (Smoke A) → 06 (Smoke B) → 07 (iter HOLD) → 08 (flip productivo en `routing_rules`).

## Self-Check: PASSED

- ✅ `supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql` existe
- ✅ Commit `c55aed4` (Task 1.1) presente en `git log`
- ✅ Commit `d35f645` (Task 1.2) presente en `git log`
- ✅ Commit `f7d666b` (Task 1.3) presente en `git log`
- ✅ Commit `eea5e14` (Task 1.4) presente en `git log`
- ✅ Commit `b6c6e20` (Task 1.6) presente en `git log`
- ✅ Tests verdes (`npx vitest run` → 32/32)
- ✅ TS clean en knowledge-base/
- ✅ Migración aplicada en prod Supabase (4 verify queries confirmados por usuario 2026-05-16)
- ✅ v4 dormant (`active_v4_rules = 0`)
