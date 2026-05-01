---
plan: 11
phase: somnio-sales-v4
wave: 5
depends_on: [04, 09]
files_modified:
  - src/lib/agents/somnio-v4/knowledge/product/formula.md
  - src/lib/agents/somnio-v4/knowledge/product/contenido.md
  - src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md
  - src/lib/agents/somnio-v4/knowledge/product/dependencia.md
  - src/lib/agents/somnio-v4/knowledge/product/contraindicaciones.md
  - src/lib/agents/somnio-v4/knowledge/product/registro_sanitario.md
  - src/lib/agents/somnio-v4/knowledge/product/efectividad.md
  - src/lib/agents/somnio-v4/knowledge/policies/envio.md
  - src/lib/agents/somnio-v4/knowledge/policies/pago.md
  - src/lib/agents/somnio-v4/knowledge/policies/devoluciones.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/insomnio_largo_plazo.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_medicamentos.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_ninos.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/precio_comparativo.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md
addresses_decisions: [D-04, D-12, D-13, D-23, D-45, D-47, D-48, D-49, D-50, D-52, D-55, D-59]
addresses_research_pitfalls: []
autonomous: false
estimated_tasks: 4
must_haves:
  truths:
    - "Estructura de carpetas product/, policies/, edge-cases/, faqs-no-templated/ existe (D-47)"
    - "≥12 archivos .md curados con frontmatter válido (D-45 7 fields) y body D-49 (4 secciones)"
    - "Cada .md pasa parseKbDoc() sin lanzar (frontmatter válido, category=carpeta, secciones reconocibles)"
    - "pnpm knowledge:sync corre sin errores end-to-end y cuenta total = archivos creados"
    - "Edge-cases (insomnio_largo_plazo, embarazo, niños, alcohol, interaccion_medicamentos) explícitamente escalan a humano via 'NUNCA decir' o escalate_if"
    - "Operador (usuario) revisó y aprobó el contenido (D-52 — checkpoint humano antes del push)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/knowledge/"
      provides: "12-18 .md docs curados en 4 categorías"
  key_links:
    - from: "pnpm knowledge:sync"
      to: "agent_knowledge_base rows con embedding"
      via: "syncKbDoc por archivo"
      pattern: "syncKbDoc"
    - from: "kb-search-tool en sub-loop (Plan 05)"
      to: "agent_knowledge_base via match_knowledge_base RPC"
      via: "embedding cosine similarity"
      pattern: "match_knowledge_base"
---

<objective>
Wave 4 — corpus inicial de Knowledge Base.

D-12 obliga infra completa día 1 — esto incluye contenido inicial. RESEARCH §Open Questions item 5 sugiere ≥12-20 docs cubriendo: product, policies, edge-cases, faqs-no-templated.

Cada doc cumple D-45 (frontmatter 7 fields) y D-49 (body con secciones canónica / si insiste / NUNCA decir / Sources).

D-52 obliga PR review humano — por eso este plan tiene HALT antes del push (checkpoint:human-verify): el usuario revisa el contenido propuesto antes de mergear.

Output: 12-18 archivos `.md` + sync local + verificación post-sync + commit con HALT antes del push.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@src/lib/agents/somnio-v4/knowledge-base/parser.ts
@src/lib/agents/somnio-v4/knowledge-base/sync.ts
@scripts/knowledge-sync.ts
</context>

<interfaces>
<!-- Frontmatter schema (D-45 — 7 fields) -->
```yaml
---
topic: <slug-único>                              # required
keywords: [<sinónimos cliente>]                  # required
category: product|policies|edge-cases|faqs-no-templated   # required
last_reviewed: YYYY-MM-DD                        # required
reviewed_by: <username>                          # required
escalate_if: [<señales>]                         # opcional
related_topics: [<topic-slugs>]                  # opcional
---
```

<!-- Body sections (D-49) -->
```markdown
## Respuesta canónica
[Texto literal por default. 50-200 palabras.]

## Si el cliente insiste
[Opcional. Variante contextual.]

## NUNCA decir
- prohibición 1
- prohibición 2

## Sources / Notas
[Opcional. NO se cita al cliente.]
```

<!-- Coherence (D-48): folder name MUST equal frontmatter.category -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear estructura de carpetas + 12 archivos .md (seed corpus)</name>
  <files>(ver lista completa en frontmatter files_modified)</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-45, D-47, D-49, D-50)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "knowledge/**/*.md" — ejemplo verbatim)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (§Open Questions item 5 — sugerencia de corpus inicial)
    - src/lib/agents/somnio-v3/constants.ts (INFORMATIONAL_INTENTS — para alinear topics)
    - src/lib/agents/somnio-v4/knowledge-base/parser.ts (validation reference)
  </read_first>
  <action>
**Crear las 4 carpetas si no existen:**
```bash
mkdir -p src/lib/agents/somnio-v4/knowledge/product
mkdir -p src/lib/agents/somnio-v4/knowledge/policies
mkdir -p src/lib/agents/somnio-v4/knowledge/edge-cases
mkdir -p src/lib/agents/somnio-v4/knowledge/faqs-no-templated
```

**Crear ≥12 archivos `.md`. Cada uno usando `today` = 2026-05-01 + reviewed_by = 'jose' (puede ajustarse al username real del operador).**

**EJEMPLO MAESTRO** (al executor: usar este como template; los demás siguen el mismo shape, contenido apropiado por topic):

```markdown
---
topic: precio_comparativo
keywords: [comparar, mas barato, alternativa, melatonina farmacia, otra marca]
category: faqs-no-templated
last_reviewed: 2026-05-01
reviewed_by: jose
escalate_if: [pregunta sobre marcas competidoras especificas]
related_topics: [precio, formula]
---

## Respuesta canónica
Nuestro ELIXIR DEL SUEÑO combina melatonina + magnesio + valeriana en formulación PHARMA SOLUTIONS SAS optimizada para el sueño profundo. No competimos por precio bajo: competimos por resultados sostenidos en el tiempo. El frasco rinde 90 noches y cuesta menos por dosis que la mayoría de melatoninas en farmacia cuando comparas el precio por mililitro útil.

## Si el cliente insiste
Si pregunta por una marca específica, mantén el foco en la formulación propia: "No te puedo recomendar marcas externas, pero te puedo contar cómo funciona la nuestra en detalle".

## NUNCA decir
- comparativas peyorativas a otras marcas
- afirmar que somos "los mejores" sin sustento
- mencionar precios específicos de competencia
- prometer efectos garantizados

## Sources / Notas
- Formulación PHARMA SOLUTIONS SAS — info de etiqueta
- Standalone v4 D-04: knowledge curado por humano
```

**Lista mínima de 18 archivos a crear (el executor puede ampliar a 20 si lo cree necesario):**

**`product/` (7 archivos):**
- `formula.md` — composición del producto (melatonina + magnesio + valeriana). NUNCA decir: "cura insomnio", "100% efectivo".
- `contenido.md` — frasco rinde 90 noches, presentación gotas. NUNCA: prometer cantidad de noches sin contexto de dosis.
- `como_se_toma.md` — dosis recomendada, momento del día, agua/jugo. NUNCA: dar dosis personalizadas.
- `dependencia.md` — la melatonina natural en estas dosis NO genera dependencia farmacológica. NUNCA: garantizar "cero efectos en cualquier persona".
- `contraindicaciones.md` — embarazo, lactancia, enfermedades autoinmunes — escalar a humano. escalate_if: [embarazo, lactancia, autoinmune].
- `registro_sanitario.md` — registro INVIMA. NUNCA: inventar números si el cliente pide específicos sin contexto.
- `efectividad.md` — la mayoría siente efecto en 7-14 días. NUNCA: prometer efectos en primera noche.

**`policies/` (3 archivos):**
- `envio.md` — días hábiles, cobertura nacional Colombia. NUNCA: prometer fechas exactas; siempre "estimado".
- `pago.md` — métodos disponibles (contraentrega, transferencia, link de pago). NUNCA: pedir datos de tarjeta directo en chat.
- `devoluciones.md` — política. escalate_if: [reclamo formal]. NUNCA: hacer promesas de reembolso sin escalación.

**`edge-cases/` (5 archivos):**
- `insomnio_largo_plazo.md` — escalate_if: [>3 meses sin dormir, depresión asociada]. NUNCA: hacer diagnóstico.
- `interaccion_medicamentos.md` — escalate_if: [cualquier medicamento mencionado]. NUNCA: dar consejo sin médico.
- `uso_en_ninos.md` — escalate_if: [<14 años]. Producto recomendado adultos.
- `uso_en_embarazo.md` — escalate_if: [embarazo, lactancia]. NUNCA: aconsejar uso.
- `interaccion_alcohol.md` — recomendar evitar combinación. NUNCA: minimizar riesgos.

**`faqs-no-templated/` (3 archivos):**
- `precio_comparativo.md` — el ejemplo maestro de arriba.
- `alternativas_naturales.md` — manzanilla, valeriana, hábitos. NUNCA: descartar otras opciones, NUNCA: prometer.
- `duracion_efecto.md` — 6-8 horas. NUNCA: prometer despertar sin alarma.

**Para cada archivo, el executor escribe contenido apropiado siguiendo el ejemplo maestro:**
- Frontmatter exacto (7 fields)
- `## Respuesta canónica` 50-200 palabras
- `## Si el cliente insiste` 1-2 frases (opcional)
- `## NUNCA decir` 3-5 bullets
- `## Sources / Notas` 1-2 líneas

**Tiempo estimado de redacción:** ~20 min por archivo × 18 = ~6 horas. El executor puede paralelizar abriendo varios archivos en buffer.

**REGLAS DURAS (D-50, RESEARCH Anti-pattern):**
- NO incluir copy de marketing o hipérbole en la canónica — el sub-loop la quotea verbatim
- NO afirmaciones médicas absolutas ("cura", "garantizado", "100%") en cualquier sección
- Las reglas `NUNCA decir` deben ser específicas y testeables, no abstractas
  </action>
  <verify>
    <automated>test -d src/lib/agents/somnio-v4/knowledge/product && test -d src/lib/agents/somnio-v4/knowledge/policies && test -d src/lib/agents/somnio-v4/knowledge/edge-cases && test -d src/lib/agents/somnio-v4/knowledge/faqs-no-templated && [ "$(find src/lib/agents/somnio-v4/knowledge -name '*.md' | wc -l)" -ge "12" ]</automated>
  </verify>
  <acceptance_criteria>
    - 4 carpetas creadas
    - ≥12 archivos `.md` (idealmente 18 — listados arriba)
    - Cada archivo tiene frontmatter `topic:`, `keywords:`, `category:`, `last_reviewed:`, `reviewed_by:`
    - Cada archivo tiene al menos `## Respuesta canónica` y `## NUNCA decir`
    - Carpeta name = frontmatter.category (D-48)
  </acceptance_criteria>
  <done>Corpus inicial redactado.</done>
</task>

<task type="auto">
  <name>Task 2: Smoke test pnpm knowledge:sync local</name>
  <files>(ningún archivo modificado — verificación)</files>
  <read_first>
    - scripts/knowledge-sync.ts
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts
  </read_first>
  <action>
1. Verificar que cada `.md` parsea sin errores:
```bash
pnpm knowledge:sync
```

Output esperado:
```
[knowledge:sync] root: /mnt/c/.../knowledge
[knowledge:sync] processing 18 files
[knowledge:sync] ✓ src/lib/agents/somnio-v4/knowledge/product/formula.md → inserted
... (1 línea por archivo)
[knowledge:sync] done: ok=18 fail=0
```

2. Si algún archivo falla:
   - Leer el mensaje de error (parser.ts lanza con detalles del Zod issue)
   - Corregir el frontmatter o el folder placement
   - Re-correr `pnpm knowledge:sync`
   - Iterar hasta `fail=0`

3. Verificar en Supabase Studio que las filas se crearon:
```sql
SELECT topic, category, body_hash IS NOT NULL AS has_body, source_md_path
FROM agent_knowledge_base
WHERE agent_id = 'somnio-sales-v4'
ORDER BY topic;
-- expect: 18 rows
```

4. Verificar HNSW index funciona (sample query):
```sql
-- Test rough cosine on a known topic
WITH q AS (
  SELECT embedding FROM agent_knowledge_base WHERE topic = 'precio_comparativo'
)
SELECT topic, embedding <=> (SELECT embedding FROM q) AS distance
FROM agent_knowledge_base
ORDER BY embedding <=> (SELECT embedding FROM q)
LIMIT 3;
-- expect: precio_comparativo distance=0, related topics next
```
  </action>
  <verify>
    <automated>pnpm knowledge:sync 2>&1 | grep -E "done: ok=[0-9]+ fail=0"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm knowledge:sync` reporta `fail=0`
    - DB en local-dev (o prod si OPENAI_API_KEY apunta a prod Supabase) tiene los rows nuevos
    - Sample query pgvector retorna resultados ordenados por similarity
  </acceptance_criteria>
  <done>Sync local exitoso.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: HALT — Usuario revisa contenido y aprueba</name>
  <what-built>
    18 archivos .md de knowledge base creados, parseando ok, sincronizables vía pnpm knowledge:sync.
  </what-built>
  <how-to-verify>
**STOP — D-52 BLOQUEANTE.**

D-52 dice "Cualquier cambio a knowledge/**/*.md pasa por PR con mínimo 1 aprobador. Sin push directo a main."

Pasos del usuario:
1. Revisar cada archivo `.md` en `src/lib/agents/somnio-v4/knowledge/`. Foco en:
   - Tono apropiado para clientes Somnio
   - Cero afirmaciones médicas absolutas o garantías
   - Reglas `NUNCA decir` testeables y específicas
   - Edge cases escalan correctamente a humano
2. Si encuentra errores, pedir al asistente que los corrija
3. Iterar hasta aprobación
4. Confirmar al asistente: "knowledge corpus aprobado para push"

NO continuar al Task 4 hasta confirmación explícita.
  </how-to-verify>
  <resume-signal>Usuario escribe "knowledge corpus aprobado"</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Commit + push tras aprobación</name>
  <files>(corpus completo)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
Tras la aprobación del usuario en Task 3:

```bash
git add src/lib/agents/somnio-v4/knowledge/
git commit -m "feat(somnio-v4): plan-11 — knowledge base corpus inicial (18 .md)

- product/ (7): formula, contenido, como_se_toma, dependencia, contraindicaciones, registro_sanitario, efectividad
- policies/ (3): envio, pago, devoluciones
- edge-cases/ (5): insomnio_largo_plazo, interaccion_medicamentos, uso_en_ninos, uso_en_embarazo, interaccion_alcohol
- faqs-no-templated/ (3): precio_comparativo, alternativas_naturales, duracion_efecto

Cada archivo cumple D-45 (frontmatter 7 fields) + D-48 (folder=category) + D-49 (4 secciones).
Edge cases escalan a humano (escalate_if + NUNCA decir).
Curado y revisado por usuario (D-52 PR review).

D-12 cierre: corpus inicial + sync local exit 0.

Standalone: somnio-sales-v4
Decisions: D-04, D-12, D-13, D-23, D-45, D-47, D-48, D-49, D-50, D-52, D-55, D-59

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```

Tras el push, en Vercel deploy:
- Plan 09 instaló la Inngest function `knowledge-sync-v4`. El deploy debería triggear el sync automáticamente — pero esa integración Vercel→Inngest se confirma operativamente en Plan 12.
- Como respaldo, se puede invocar manual via Inngest dashboard: `inngest send somnio-v4/knowledge.sync`.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-11"</automated>
  </verify>
  <acceptance_criteria>
    - Commit + push completados
    - Vercel deploy ok
    - (Opcional manual) Tras deploy, ejecutar `pnpm knowledge:sync` apuntando a prod confirma 18 rows en agent_knowledge_base
  </acceptance_criteria>
  <done>Corpus inicial shipped.</done>
</task>

</tasks>

<verification>
- 18 .md docs creados, parseables, syncables
- D-52 PR-review humano confirmado
- pnpm knowledge:sync exit 0
</verification>

<success_criteria>
- Plan 12 (smoke test sandbox) puede ejecutar v4 con triggers que invoquen kb_search_tool y obtener canonical responses reales
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/11-SUMMARY.md` con:
- Lista de archivos creados
- Output de pnpm knowledge:sync (final ok=18 fail=0)
- Confirmación de PR review (D-52)
- Hash commit
</output>
