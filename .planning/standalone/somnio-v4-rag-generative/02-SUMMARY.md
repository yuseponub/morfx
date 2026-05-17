---
phase: standalone-somnio-v4-rag-generative
plan: 02
subsystem: knowledge-base
tags: [somnio-v4, rag, kb-rewrite, markdown, formato-5-secciones, big-bang]

# Dependency graph
requires:
  - plan: 01
    provides: parser/sync/coherence-check refactor + KB schema migration en prod + 5 columnas nuevas (hechos_del_producto, posicion_del_negocio, debe_contener, cuando_escalar, tone_override)
provides:
  - 18 KB markdown files reescritos al formato RAG-generative (D-01 #2..#6 + tone_override D-05)
  - Items de "Debe contener la respuesta" con prefijos [SIEMPRE]/[SI APLICA] (D-03)
  - "Si el cliente insiste" absorbido en items [SI APLICA] (D-04)
  - "NUNCA decir" preservado verbatim + items "te derivo" universales agregados donde faltaban
  - "Cuándo escalar a humano" expandido desde escalate_if + casos críticos para Smoke A (contraindicaciones: lupus/sertralina; envío: Miami/internacional; pago: criptomonedas)
affects:
  - Plan 03 (sub-loop RAG-generative que consume el material de las 5 columnas nuevas en runtime) — atomic deploy unit (D-24)
  - Plan 04 (calibración few-shots Gemini) — usa la estructura del material como input
  - Plan 05/06 (Smoke A/B) — eval del runtime contra el material poblado

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Big-bang rewrite atómico (D-23) — 18 archivos en 3 task commits agrupados por categoría"
    - "Coherence-check como gate previo a embed/upsert: garantiza shape antes de tocar OpenAI/DB"
    - "Preservación verbatim de 'NUNCA decir' del formato viejo (sin re-escritura semántica)"
    - "Honesty-over-invention: condiciones médicas no listadas en KB → handoff explícito, NO inventar info"

key-files:
  created:
    - ".planning/standalone/somnio-v4-rag-generative/02-SUMMARY.md"
  modified:
    - "src/lib/agents/somnio-v4/knowledge/edge-cases/insomnio_largo_plazo.md"
    - "src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md"
    - "src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_medicamentos.md"
    - "src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md"
    - "src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_ninos.md"
    - "src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md"
    - "src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md"
    - "src/lib/agents/somnio-v4/knowledge/faqs-no-templated/precio_comparativo.md"
    - "src/lib/agents/somnio-v4/knowledge/policies/devoluciones.md"
    - "src/lib/agents/somnio-v4/knowledge/policies/envio.md"
    - "src/lib/agents/somnio-v4/knowledge/policies/pago.md"
    - "src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md"
    - "src/lib/agents/somnio-v4/knowledge/product/contenido.md"
    - "src/lib/agents/somnio-v4/knowledge/product/contraindicaciones.md"
    - "src/lib/agents/somnio-v4/knowledge/product/dependencia.md"
    - "src/lib/agents/somnio-v4/knowledge/product/efectividad.md"
    - "src/lib/agents/somnio-v4/knowledge/product/formula.md"
    - "src/lib/agents/somnio-v4/knowledge/product/registro_sanitario.md"

key-decisions:
  - "D-01 honored: cada archivo tiene frontmatter + 5 markdown sections (Hechos del producto / Posición del negocio / Debe contener la respuesta / NUNCA decir / Cuándo escalar a humano)"
  - "D-02 honored: Hechos y Posición separados — facts descriptivos vs prescripción comercial"
  - "D-03 honored: 100% de items de 'Debe contener' empiezan con [SIEMPRE] o [SI APLICA] (verificado por grep)"
  - "D-04 honored: contenido de 'Si el cliente insiste' del formato viejo absorbido como items [SI APLICA] (no como sección dedicada)"
  - "D-05 honored: tone_override: null agregado a frontmatter de los 18 archivos (default — usar TONE_BASE global)"
  - "D-23/D-24 honored: big-bang en un solo plan, commits locales sin push (Plan 03 absorbe el push final atomic)"

patterns-established:
  - "Plantilla RAG-generative de KB doc reusable: 1 frontmatter + 5 sections numeradas con prefijos validables"
  - "Honest-over-invention guide: si el formato viejo no tiene info para una sección nueva, escribir conservador o derivar al médico tratante; nunca inventar concentraciones, fabricantes, números INVIMA, etc."
  - "Acceptance criteria automatizables via grep — verificación instantánea del shape sin parser"

requirements-completed: []

# Metrics
duration: ~1.5h (3 task commits + sync attempt + verify gates)
completed: 2026-05-16
---

# Plan 02: Reescritura 18 KBs al formato 5-secciones (RAG-generative) Summary

**Los 18 archivos .md del corpus Somnio v4 están reescritos al formato D-01 (frontmatter + 5 markdown sections) y validados localmente por coherence-check. DB sync deferida — ver "Pending — DB sync" abajo.**

## Performance

- **Duration:** ~1.5h (T2.1 + T2.2 + T2.3 + sync attempts + verify gates)
- **Started:** 2026-05-16 ~21:30 UTC
- **Completed:** 2026-05-16 ~22:10 UTC
- **Tasks:** 3 commits ejecutados + 1 task auth-gated (Task 2.4 — sync) + Task 2.5 inherente al SUMMARY
- **Files modified:** 18 KB markdown + 1 SUMMARY

## Accomplishments

1. **18/18 KB markdown files reescritos al formato RAG-generative (D-01)** — frontmatter con `tone_override: null` (D-05) + 5 markdown sections (Hechos del producto, Posición del negocio, Debe contener la respuesta, NUNCA decir, Cuándo escalar a humano).
2. **D-03 enforced**: 100% de items de "Debe contener" empiezan con [SIEMPRE] o [SI APLICA] — validado por grep para los 4 directorios.
3. **D-04 enforced**: el contenido del "Si el cliente insiste" del formato viejo migró a items [SI APLICA] de "Debe contener" — la sección dedicada NO existe en ningún archivo nuevo.
4. **"NUNCA decir" preservado verbatim** del formato viejo en cada KB, + el item universal "usar palabras como 'te derivo'..." agregado en los KBs donde faltaba (mayoría ya lo tenían).
5. **"Cuándo escalar a humano" expandido honestamente** desde el `escalate_if` del frontmatter viejo + casos críticos para Smoke A:
   - `contraindicaciones.md`: cubre explícitamente condiciones médicas no listadas (lupus, fibromialgia, hipotiroidismo) + medicamentos específicos (sertralina, paroxetina, warfarina) — defensive vs Smoke A casos 4 y 5.
   - `envio.md`: cubre envío internacional, Miami, Madrid, México, EEUU, Europa — defensive vs Smoke A caso 16.
   - `pago.md`: cubre criptomonedas, Bitcoin, PayPal, transferencias — defensive vs Smoke A caso 17.
   - `insomnio_largo_plazo.md`: cubre apnea explícitamente — defensive vs Smoke A caso 15.
6. **Coherence-check passed for all 18 KBs**: durante los 3 attempts del sync script, coherence-check (parser + section validation) pasó sin throw en TODOS los 18 archivos. Los fallos del sync ocurrieron downstream en `generateEmbedding()` (auth gate — ver abajo).
7. **Tests verdes**: 32/32 unit tests (parser + coherence-check) corren limpio.

## Task Commits

Cada task committeada atómicamente en español, Co-Authored-By Claude:

1. **Task 2.1 — 5 edge-cases** — `33f3f83` (feat)
2. **Task 2.2 — 7 product KBs** — `7a4ba97` (feat)
3. **Task 2.3 — 3 policies + 3 faqs-no-templated** — `eb825a6` (feat)

Total: 3 commits locales en `main`. **NO PUSH ejecutado** — origin/main sigue en `728ac6a` (Plan 01 SHIPPED).

## Verify Gates — automatizables (grep) ALL PASS

```bash
# 1. Los 18 archivos tienen las 5 secciones + tone_override:
for f in src/lib/agents/somnio-v4/knowledge/**/*.md; do
  grep -q "^## Hechos del producto$" "$f" \
    && grep -q "^## Posición del negocio$" "$f" \
    && grep -q "^## Debe contener la respuesta$" "$f" \
    && grep -q "^## NUNCA decir$" "$f" \
    && grep -q "^## Cuándo escalar a humano$" "$f" \
    && grep -q "tone_override: null" "$f" \
    && echo "OK $f"
done | wc -l
# Resultado: 18/18 ✓

# 2. 0 archivos con headers deprecated:
grep -l "## Respuesta canónica\|## Si el cliente insiste\|## Sources" \
  src/lib/agents/somnio-v4/knowledge/**/*.md
# Resultado: (vacío) ✓

# 3. 0 items de "Debe contener" sin prefijo válido en TODOS los archivos:
for f in src/lib/agents/somnio-v4/knowledge/**/*.md; do
  awk '/^## Debe contener la respuesta$/,/^## NUNCA decir$/' "$f" \
    | grep -E "^- " | grep -cvE "^- \[(SIEMPRE|SI APLICA)\]"
done
# Resultado: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ✓ (todos cero)

# 4. envio.md menciona casos Smoke A 16 (Miami/internacional):
grep -iE "internacional|miami|fuera de colombia" \
  src/lib/agents/somnio-v4/knowledge/policies/envio.md
# Resultado: 4+ matches ✓

# 5. pago.md menciona casos Smoke A 17 (criptomonedas/no listado):
grep -iE "cripto|paypal|bitcoin|no listado" \
  src/lib/agents/somnio-v4/knowledge/policies/pago.md
# Resultado: 3+ matches ✓

# 6. Tests pasan:
npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/
# Resultado: 32/32 PASS ✓
```

## Pending — DB sync (Task 2.4) — DEFERIDO con justificación

**Task 2.4 ("Correr sync end-to-end + verificar coherence + DB poblada") quedó como auth gate.** El script `pnpm knowledge:sync` requiere `OPENAI_API_KEY_SALESV4` (o `OPENAI_API_KEY` legacy) para regenerar embeddings (D-06). El executor intentó:

1. `vercel env pull --environment=production` → el OpenAI key vino como valor vacío `""` (Vercel CLI parece no decryptarlo con los permisos disponibles).
2. Cargar `.env.local` con merge manual → la key efectivamente quedó vacía (root cause Vercel).

**Coherence-check SÍ corrió para los 18 archivos durante el intento de sync** (la ejecución fallida con "No OpenAI key configured" ocurre DESPUÉS del coherence-check + ANTES del embed/upsert — confirmando que los 18 archivos parsean limpio y pasan las validaciones de schema).

**Decisión operacional (Rule 4 — gate vs failure):** la DB sync NO es bloqueante para la atomic deploy unit Plan 02 + Plan 03:
- v4 está dormant en producción (`active_v4_rules = 0` confirmado por Plan 01 verify queries).
- El sub-loop nuevo (Plan 03) consume los datos de DB en runtime — pero runtime sin tráfico = nada que romper.
- Plan 03's executor también necesitará el OpenAI key (para sub-loop tooling) y Google key (para Gemini Flash en generación) — la apply del sync se puede consolidar en su ejecución, o el usuario puede correr `pnpm knowledge:sync` localmente con su `.env.local` productivo.
- El push final atomic (Plan 03) puede coordinar el sync como pre-checkpoint.

**Acción requerida del usuario (cuando ejecute Plan 03 o antes del flip Plan 08):**

```bash
# 1. Asegurar que .env.local local tiene OPENAI_API_KEY_SALESV4 + GOOGLE_GENERATIVE_AI_API_KEY
#    (descargar de Vercel via UI si vercel env pull no los decrypta, o pedirlos al admin).

# 2. Correr sync:
pnpm knowledge:sync

# 3. Verificar en Supabase Studio (prod) que los 18 rows tienen las 5 columnas pobladas:
```

```sql
-- Constraint: 0 rows con columnas críticas null/vacías
SELECT count(*) FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4'
  AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND (hechos_del_producto IS NULL
       OR posicion_del_negocio IS NULL
       OR debe_contener IS NULL
       OR debe_contener = '{}');
-- Esperado: 0

-- Confirmar count total:
SELECT count(*) FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4'
  AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
-- Esperado: 18

-- Spot-check interaccion_alcohol:
SELECT topic, hechos_del_producto IS NOT NULL AS hechos_ok,
       posicion_del_negocio IS NOT NULL AS posicion_ok,
       array_length(debe_contener, 1) AS debe_contener_count,
       array_length(cuando_escalar, 1) AS cuando_escalar_count,
       array_length(nunca_decir, 1) AS nunca_decir_count
FROM agent_knowledge_base
WHERE agent_id='somnio-sales-v4' AND topic='interaccion_alcohol';
-- Esperado: hechos_ok=true, posicion_ok=true, debe_contener_count >= 5,
--           cuando_escalar_count >= 3, nunca_decir_count >= 6.
```

Si el constraint retorna > 0 (alguno de los 5 campos quedó null/vacío), el sync no corrió o falló mid-batch → re-correr `pnpm knowledge:sync` hasta que ok=18, fail=0.

## Files Modified

### Edge-cases (5)
- `src/lib/agents/somnio-v4/knowledge/edge-cases/insomnio_largo_plazo.md`
- `src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md` (template verbatim PATTERNS.md)
- `src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_medicamentos.md`
- `src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md`
- `src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_ninos.md`

### Product (7)
- `src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md`
- `src/lib/agents/somnio-v4/knowledge/product/contenido.md`
- `src/lib/agents/somnio-v4/knowledge/product/contraindicaciones.md` (CRÍTICO Smoke A — lupus/sertralina/warfarina)
- `src/lib/agents/somnio-v4/knowledge/product/dependencia.md`
- `src/lib/agents/somnio-v4/knowledge/product/efectividad.md`
- `src/lib/agents/somnio-v4/knowledge/product/formula.md`
- `src/lib/agents/somnio-v4/knowledge/product/registro_sanitario.md`

### Policies (3)
- `src/lib/agents/somnio-v4/knowledge/policies/devoluciones.md`
- `src/lib/agents/somnio-v4/knowledge/policies/envio.md` (CRÍTICO Smoke A — Miami/internacional)
- `src/lib/agents/somnio-v4/knowledge/policies/pago.md` (CRÍTICO Smoke A — criptomonedas)

### Faqs-no-templated (3)
- `src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md`
- `src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md`
- `src/lib/agents/somnio-v4/knowledge/faqs-no-templated/precio_comparativo.md`

## Deviations from Plan

### Task 2.4 (sync) — Auth gate, deferido

**Tipo:** `human-action` checkpoint deferido por documentación (no se pidió user input inline porque la deferral mantiene la atomic deploy unit semántica con Plan 03 — ver "Pending — DB sync" arriba).

**Razón:** Vercel CLI no decryptó el `OPENAI_API_KEY_SALESV4` durante `vercel env pull --environment=production`. Sin la key real no se pueden regenerar embeddings (D-06). El executor optó por deferir (Rule 4 territory: requiere user) en vez de:
- (a) pedir al usuario la key inline (workflow interruption en el medio de plan execution).
- (b) bypassear el embed step (rompería el contrato de sync — embeddings deben ser válidos para que kb-search funcione cuando v4 flip).

**Mitigación:** documentado en sección "Pending — DB sync" con SQL verificable. Plan 03's executor (o el usuario antes del flip Plan 08) corre `pnpm knowledge:sync` con sus credenciales productivas. v4 dormant absorbe cualquier ventana de DB stale.

### Otros deviations

**Ninguna sustantiva.** Los 18 archivos siguieron el procedimiento plan verbatim:
1. Frontmatter actualizado (tone_override: null, last_reviewed: 2026-05-16, reviewed_by: jose, escalate_if a lista YAML).
2. Body reescrito con las 5 sections obligatorias.
3. "NUNCA decir" preservado verbatim (donde el original lo tenía completo) o expandido con el item universal "te derivo" cuando faltaba.
4. "Cuándo escalar a humano" derivado del escalate_if + expansión defensiva para casos Smoke A.

### Auto-fixed durante Task 2.1-2.3

**Ninguno.** Todos los archivos parsearon limpio en el primer commit. Las 3 verificaciones grep (5 secciones, 0 deprecated, 0 prefijos inválidos) pasaron al primer intento por archivo.

## Known Stubs

**Ninguno introducido por este plan.** Los 18 KBs ahora tienen contenido pleno en las 5 secciones nuevas. La única excepción documentada es `precio_comparativo.md` — su "Hechos del producto" describe estructura de mercado pero no precio específico (intencional: D-comercial — no comunicamos precio comparativo en KB porque cambia con frecuencia, lo maneja el flow de venta directo).

**Pre-existing stub state (no introducido por este plan):** las 18 rows en `agent_knowledge_base` para `somnio-sales-v4` tienen las 5 columnas nuevas como `null/[]` hasta que se corra `pnpm knowledge:sync` (ver "Pending — DB sync"). Esto NO bloquea Plan 03 (sub-loop), ya que v4 dormant en prod — Plan 03 + sync + flip se ejecutan en secuencia controlada por el usuario.

## Threat Flags

**Ninguno nuevo.** No se introdujeron nuevos surfaces de network/auth/file-access/schema. Los cambios son contenido editorial en archivos markdown locales + pendiente DB row update vía sync existente (mismo flow que Plan 01).

## Self-Check: PASSED (CON CAVEAT — sync deferred)

- ✓ Los 18 KB markdown files reescritos al formato RAG-generative D-01.
- ✓ Cada archivo tiene `tone_override: null`, `last_reviewed: 2026-05-16`, `reviewed_by: jose`.
- ✓ Cada archivo tiene las 5 markdown sections en orden correcto.
- ✓ 0 archivos con headers deprecated.
- ✓ Cada item de "Debe contener" prefijado [SIEMPRE] o [SI APLICA].
- ✓ "NUNCA decir" preservado verbatim del original.
- ✓ Casos críticos Smoke A cubiertos defensivamente en "Cuándo escalar" (contraindicaciones / envío / pago / apnea).
- ✓ Tests verdes (32/32 — parser + coherence-check).
- ✓ Coherence-check pasó para los 18 archivos durante intentos de sync (probado: la falla de sync fue downstream en embed step).
- ✓ 3 commits locales en main: `33f3f83`, `7a4ba97`, `eb825a6`.
- ✓ NO PUSH: `git rev-parse origin/main` sigue retornando `728ac6a`.
- ⚠ **CAVEAT — sync DB poblada DEFERIDO**: Plan 03's executor o el usuario antes del flip Plan 08 debe correr `pnpm knowledge:sync` con OpenAI key real + verificar constraint SQL (ver "Pending — DB sync" arriba). v4 dormant absorbe cualquier ventana de DB stale.

## Next Steps

1. **Plan 03 — Sub-loop split tooling/generación con Gemini Flash redactando + borrar canonical** (atomic deploy unit con Plan 02 — D-24). El executor de Plan 03:
   - Refactoriza `src/lib/agents/somnio-v4/sub-loop/index.ts` (2-call: GPT-4o mini tooling + Gemini Flash NORMAL generación).
   - Borra `LoopOutcomeSchema.status: 'canonical'`, deja `'generated' | 'no_match'`.
   - Borra cualquier referencia a `canonical_response`/`canonicalText` en prompts/types.
   - Verifica que pnpm knowledge:sync corre limpio antes de su push final (constraint SQL retorna 0).
   - Push atomic: trae Plans 02 + 03 a `origin/main` en un solo `git push`.
2. Tras Plan 03 ship, Plan 04 (calibración few-shots Gemini) → 05 (Smoke A 17 casos) → 06 (Smoke B regression) → 07 (HOLD iter) → 08 (flip productivo SQL).
