---
plan: 02
wave: 2
phase: standalone-somnio-v4-rag-generative
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/knowledge/edge-cases/insomnio_largo_plazo.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_medicamentos.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md
  - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_ninos.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md
  - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/precio_comparativo.md
  - src/lib/agents/somnio-v4/knowledge/policies/devoluciones.md
  - src/lib/agents/somnio-v4/knowledge/policies/envio.md
  - src/lib/agents/somnio-v4/knowledge/policies/pago.md
  - src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md
  - src/lib/agents/somnio-v4/knowledge/product/contenido.md
  - src/lib/agents/somnio-v4/knowledge/product/contraindicaciones.md
  - src/lib/agents/somnio-v4/knowledge/product/dependencia.md
  - src/lib/agents/somnio-v4/knowledge/product/efectividad.md
  - src/lib/agents/somnio-v4/knowledge/product/formula.md
  - src/lib/agents/somnio-v4/knowledge/product/registro_sanitario.md
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Los 18 archivos .md de knowledge/ están reescritos en el formato nuevo D-01 (frontmatter D-01 #1 con tone_override + 5 markdown sections D-01 #2..#6 — 6 elementos D-01 totales por KB)."
    - "Cada archivo tiene frontmatter actualizado: tone_override: null (default D-05), last_reviewed: 2026-05-16, reviewed_by: jose."
    - "Cada archivo tiene las 5 markdown sections obligatorias D-01 #2..#6 (Hechos del producto, Posición del negocio, Debe contener la respuesta, NUNCA decir, Cuándo escalar a humano)."
    - "Cada item de '## Debe contener la respuesta' empieza con [SIEMPRE] o [SI APLICA] (D-03)."
    - "El contenido de '## Si el cliente insiste' del formato viejo está trasladado como items [SI APLICA] de '## Debe contener' (D-04)."
    - "El contenido de '## NUNCA decir' está preservado verbatim del actual + posibles adiciones."
    - "El script de sync corre limpio contra los 18 archivos: 0 errores de coherence-check, 18 rows pobladas en agent_knowledge_base con las 5 columnas nuevas non-null/non-empty."
    - "Los embeddings re-generados (D-06 acepta cambio post-reescritura)."
    - "NO PUSHEAR este commit hasta que Plan 03 termine — runtime se rompe si KB nuevo va sin sub-loop nuevo."
  artifacts:
    - path: "src/lib/agents/somnio-v4/knowledge/edge-cases/*.md"
      provides: "5 edge-cases topics reescritos"
      contains: "## Hechos del producto"
    - path: "src/lib/agents/somnio-v4/knowledge/product/*.md"
      provides: "7 product topics reescritos"
      contains: "## Posición del negocio"
    - path: "src/lib/agents/somnio-v4/knowledge/policies/*.md"
      provides: "3 policies topics reescritos"
      contains: "## Debe contener la respuesta"
    - path: "src/lib/agents/somnio-v4/knowledge/faqs-no-templated/*.md"
      provides: "3 faqs topics reescritos"
      contains: "## Cuándo escalar a humano"
  key_links:
    - from: "src/lib/agents/somnio-v4/knowledge/**/*.md"
      to: "agent_knowledge_base table (production)"
      via: "sync.ts upsert post-Plan 01"
      pattern: "hechos_del_producto"
---

<objective>
Wave 2 (atomic deploy unit con Plan 03 — D-24) — Reescritura big-bang de los 18 KB docs al formato nuevo D-01 (frontmatter D-01 #1 con tone_override + 5 markdown sections D-01 #2..#6). Borrar `## Respuesta canónica`, `## Si el cliente insiste`, `## Sources`; agregar `## Hechos del producto`, `## Posición del negocio`, `## Debe contener la respuesta` (con items prefijados [SIEMPRE] / [SI APLICA]), `## Cuándo escalar a humano`. Preservar `## NUNCA decir` verbatim.

Purpose: el sub-loop nuevo (Plan 03) consume material parseado del topic ganador (Hechos + Posición + Debe contener + NUNCA + Cuándo escalar). Sin estos 18 archivos en formato nuevo, el sub-loop nuevo recibe `null` en todas las secciones del material → handoff en todos los casos → smoke A falla.

**⚠ CRITICAL — NO PUSHEAR HASTA QUE PLAN 03 TERMINE ⚠**

Plan 02 commit + Plan 03 commit forman un **deploy unit atómico (D-24)**. Si solo Plan 02 va a producción:
- Sub-loop viejo (canonical-verbatim) intenta leer `canonical_response` de los KBs → ya está vacío (sync con canonical_response = null tras Plan 01 Task 1.2) → runtime degradado.
- v4 está dormant entonces el daño práctico es nulo, PERO el principio se respeta para evitar errores futuros.

Por seguridad operacional, el push final del Plan 02 commit lo hace el Plan 03 Task X.Y (commit + push de ambos changesets juntos). Plan 02 termina con commit local + branch protegido, NO push.

Output:
- 18 archivos .md reescritos.
- Sync corrido localmente para validar parseo + DB write (sin push).
- Commit local con los 18 archivos (NO push).
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/code-changes.md
@./.claude/rules/gsd-workflow.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/somnio-v4-rag-generative/01-SUMMARY.md
@src/lib/agents/somnio-v4/knowledge-base/parser.ts
@src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 2.1: Reescribir los 5 archivos `knowledge/edge-cases/*.md` al formato nuevo</name>
  <read_first>
    - Los 5 archivos actuales (leer su contenido entero para preservar Hechos + intent + NUNCA decir):
      - src/lib/agents/somnio-v4/knowledge/edge-cases/insomnio_largo_plazo.md
      - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md
      - src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_medicamentos.md
      - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_embarazo.md
      - src/lib/agents/somnio-v4/knowledge/edge-cases/uso_en_ninos.md
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 238-336 (template verbatim para interaccion_alcohol + procedimiento de migración)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 902-945 (KB Template Structure full example)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-01..D-05 (formato + tone_override) + D-04 (absorber "Si el cliente insiste")
  </read_first>
  <action>
    Para CADA uno de los 5 archivos, reescribir manteniendo el frontmatter (actualizar `last_reviewed: 2026-05-16`, `reviewed_by: jose`, agregar `tone_override: null` después de related_topics) y reemplazando el body con las 5 markdown sections nuevas (D-01 #2..#6).

    **Template a aplicar (basado en `interaccion_alcohol.md` — PATTERNS.md líneas 255-298 verbatim):**

    ```markdown
    ---
    topic: <topic-actual>
    keywords: [<preservar lista actual>]
    category: edge-cases
    last_reviewed: 2026-05-16
    reviewed_by: jose
    related_topics: [<preservar lista actual>]
    escalate_if:
      - <preservar items actuales del escalate_if>
    tone_override: null
    ---

    ## Hechos del producto
    <Lo verificable: mecanismo, datos del producto, info biomédica. DESCRIPTIVO (no prescriptivo). Si el formato actual tiene "Respuesta canónica" mezclando hechos + posición, separá los hechos acá y la posición abajo. NO inventés info que no estaba — si los hechos no estaban, dejá "Sin hechos específicos documentados (referirse a literatura general de melatonina)" o similar honesto.>

    ## Posición del negocio
    <La postura/recomendación de Somnio. Decisión comercial que puede modularse sin cambiar los Hechos (D-02). Si el formato actual tenía "Respuesta canónica" prescriptiva tipo "NO te recomendamos combinar...", trasladá la prescripción acá. Mantené el "NO recomendamos" si era explícito.>

    ## Debe contener la respuesta
    - [SIEMPRE] <Requisito obligatorio para cualquier respuesta de este topic>
    - [SIEMPRE] <Otro requisito obligatorio>
    - [SI APLICA] <Si el cliente dice X → instruir Y> ← AQUÍ TRASLADAR sub-escenarios de "## Si el cliente insiste" del formato viejo (D-04)
    - [SI APLICA] <Otro condicional>
    - [SI APLICA] <Si el cliente insiste a pesar de la advertencia → escalar a humano>

    ## NUNCA decir
    - <copiar verbatim items actuales de '## NUNCA decir'>
    - <agregar si el flujo de revisión revela faltantes>
    - usar palabras como "te derivo", "te paso", "asesor humano", "tomo nota"  ← agregar si NO está ya

    ## Cuándo escalar a humano
    - <derivar de escalate_if del frontmatter + expandir si necesario>
    - <ej. cliente reporta efecto adverso>
    - <ej. cliente pregunta caso fuera del alcance del KB>
    ```

    **Procedimiento por archivo:**

    1. Leer el archivo actual entero.
    2. Identificar Hechos (mecanismo / datos verificables) vs Posición (recomendación). Si el actual mezcla ambos en "Respuesta canónica", separar conscientemente.
    3. Listar sub-escenarios de "Si el cliente insiste" → trasladar a items `[SI APLICA]` de "Debe contener" (D-04).
    4. Listar 3-6 items en "Debe contener" cubriendo lo que la respuesta debe siempre tener y los condicionales más probables.
    5. Copiar "NUNCA decir" verbatim + agregar el item universal "usar palabras como 'te derivo'..." si no está.
    6. Construir "Cuándo escalar" desde `escalate_if` del frontmatter + expandir si la lectura del topic sugiere casos adicionales.
    7. NO inventés información. Si no tenés data para una sección, escribí algo conservador o trasladá lo que había.

    **PATTERNS.md tiene `interaccion_alcohol.md` reescrito verbatim como referencia** (líneas 255-298) — usalo como modelo de tono/profundidad.

    **NO modifiques el campo `category` del frontmatter** — debe seguir matcheando el folder (coherence-check valida esto).
  </action>
  <verify>
    <automated>for f in src/lib/agents/somnio-v4/knowledge/edge-cases/*.md; do grep -q "^## Hechos del producto$" "$f" && grep -q "^## Posición del negocio$" "$f" && grep -q "^## Debe contener la respuesta$" "$f" && grep -q "^## NUNCA decir$" "$f" && grep -q "^## Cuándo escalar a humano$" "$f" && grep -q "tone_override: null" "$f" && echo "OK $f" || echo "MISSING SECTIONS $f"; done | grep -c "^OK "</automated>
  </verify>
  <acceptance_criteria>
    - Los 5 archivos en `knowledge/edge-cases/` tienen las 5 markdown sections nuevas (D-01 #2..#6) + `tone_override` en frontmatter D-01 #1 (verify count == 5).
    - Cada archivo tiene ≥ 3 items en `## Debe contener la respuesta`, cada uno empezando con `[SIEMPRE]` o `[SI APLICA]` (verificable manualmente o con script: `for f in src/lib/agents/somnio-v4/knowledge/edge-cases/*.md; do awk '/^## Debe contener la respuesta$/,/^## NUNCA decir$/' "$f" | grep -E "^- " | grep -cv "^- \[(SIEMPRE|SI APLICA)\]"; done` debe retornar 0 para cada archivo.
    - Ningún archivo contiene `## Respuesta canónica` ni `## Si el cliente insiste` ni `## Sources` (formato viejo eliminado): `grep -l "## Respuesta canónica\\|## Si el cliente insiste\\|## Sources" src/lib/agents/somnio-v4/knowledge/edge-cases/*.md` retorna vacío.
  </acceptance_criteria>
  <done>Los 5 edge-cases reescritos al formato nuevo, validables por grep.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.2: Reescribir los 7 archivos `knowledge/product/*.md` al formato nuevo</name>
  <read_first>
    - Los 7 archivos actuales (leer completos):
      - src/lib/agents/somnio-v4/knowledge/product/como_se_toma.md
      - src/lib/agents/somnio-v4/knowledge/product/contenido.md
      - src/lib/agents/somnio-v4/knowledge/product/contraindicaciones.md
      - src/lib/agents/somnio-v4/knowledge/product/dependencia.md
      - src/lib/agents/somnio-v4/knowledge/product/efectividad.md
      - src/lib/agents/somnio-v4/knowledge/product/formula.md
      - src/lib/agents/somnio-v4/knowledge/product/registro_sanitario.md
    - PATTERNS.md líneas 238-336 (template verbatim)
    - RESEARCH.md líneas 902-945 (KB Template Structure)
  </read_first>
  <action>
    Aplicar mismo procedimiento que Task 2.1 a los 7 archivos de `product/`. category sigue siendo `product`.

    **Notas particulares por archivo:**
    - `contraindicaciones.md`: este es CRÍTICO para Smoke A casos de sertralina + lupus. Asegurate que "Hechos del producto" liste explícitamente las categorías generales (autoinmunes, anticoagulantes, etc.) y que "NUNCA decir" prohíba aprobar combinaciones con medicamentos específicos no listados. "Cuándo escalar" debe incluir "cliente menciona condición médica no listada (ej. lupus, sertralina específica)".
    - `como_se_toma.md`: caso simple, alta probabilidad de cobertura — Hechos cubren completo, Posición es la recomendación clínica, "Debe contener" lista los SIEMPRE (dosis, hora, agua).
    - `dependencia.md`: caso "es adictivo?" del Smoke A — Hechos del producto debe ser claro (melatonina NO genera dependencia química), Posición refuerza, NUNCA decir prohíbe minimizar.

    Mismo template + mismo procedimiento que Task 2.1.
  </action>
  <verify>
    <automated>for f in src/lib/agents/somnio-v4/knowledge/product/*.md; do grep -q "^## Hechos del producto$" "$f" && grep -q "^## Posición del negocio$" "$f" && grep -q "^## Debe contener la respuesta$" "$f" && grep -q "^## NUNCA decir$" "$f" && grep -q "^## Cuándo escalar a humano$" "$f" && grep -q "tone_override: null" "$f" && echo "OK $f" || echo "MISSING SECTIONS $f"; done | grep -c "^OK "</automated>
  </verify>
  <acceptance_criteria>
    - Los 7 archivos en `knowledge/product/` tienen las 5 markdown sections (D-01 #2..#6) + tone_override (verify count == 7).
    - Items de `## Debe contener` empiezan con `[SIEMPRE]` o `[SI APLICA]`.
    - `grep -l "## Respuesta canónica\\|## Si el cliente insiste\\|## Sources" src/lib/agents/somnio-v4/knowledge/product/*.md` retorna vacío.
    - `contraindicaciones.md` explícitamente lista en "Cuándo escalar" alguna mención de "condición médica no listada" o equivalente (defensive para casos lupus/sertralina).
  </acceptance_criteria>
  <done>Los 7 product topics reescritos.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.3: Reescribir los 6 archivos `knowledge/policies/*.md` + `knowledge/faqs-no-templated/*.md`</name>
  <read_first>
    - Los 6 archivos actuales:
      - src/lib/agents/somnio-v4/knowledge/policies/devoluciones.md
      - src/lib/agents/somnio-v4/knowledge/policies/envio.md
      - src/lib/agents/somnio-v4/knowledge/policies/pago.md
      - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/alternativas_naturales.md
      - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/duracion_efecto.md
      - src/lib/agents/somnio-v4/knowledge/faqs-no-templated/precio_comparativo.md
    - PATTERNS.md líneas 238-336 (template) + RESEARCH.md líneas 902-945
  </read_first>
  <action>
    Aplicar mismo procedimiento que Task 2.1/2.2 a los 6 archivos.

    **Notas particulares:**
    - `envio.md`: caso Smoke A "cuánto tarda a Medellín" — Hechos debe incluir cobertura geográfica (Colombia-only, tiempos por ciudad) + Posición es la promesa de SLA. "Cuándo escalar" debe incluir "cliente pide envío internacional" o "Miami" (smoke A negativo case 16).
    - `pago.md`: caso Smoke A "cómo pago" + negativo "criptomonedas" — Hechos liste métodos aceptados (PSE, contra entrega, tarjeta), Posición refuerza preferidos. "Cuándo escalar" incluir "cliente pide método no listado (ej. criptomonedas)".
    - `devoluciones.md`: caso Smoke A "garantía / devolución" — clarito en política.
    - `alternativas_naturales.md`: caso Smoke A "qué hábitos ayudan" — Hechos liste hábitos generales (higiene de sueño, ejercicio, evitar cafeína), Posición conecta con producto sin sermonear.
    - `duracion_efecto.md`: caso Smoke A "cuántas horas dura el efecto" — Hechos da rango, Posición contextualiza.
    - `precio_comparativo.md`: NO está en Smoke A directamente pero podría aparecer en razonamiento_libre — mantener honesto.
  </action>
  <verify>
    <automated>for f in src/lib/agents/somnio-v4/knowledge/policies/*.md src/lib/agents/somnio-v4/knowledge/faqs-no-templated/*.md; do grep -q "^## Hechos del producto$" "$f" && grep -q "^## Posición del negocio$" "$f" && grep -q "^## Debe contener la respuesta$" "$f" && grep -q "^## NUNCA decir$" "$f" && grep -q "^## Cuándo escalar a humano$" "$f" && grep -q "tone_override: null" "$f" && echo "OK $f" || echo "MISSING SECTIONS $f"; done | grep -c "^OK "</automated>
  </verify>
  <acceptance_criteria>
    - Los 6 archivos (3 policies + 3 faqs) tienen las 5 markdown sections (D-01 #2..#6) + tone_override (verify count == 6).
    - `envio.md` "Cuándo escalar" menciona algún equivalente a "internacional" o "Miami" (verificable manual o `grep -i "internacional\\|miami\\|fuera de colombia" src/lib/agents/somnio-v4/knowledge/policies/envio.md`).
    - `pago.md` "Cuándo escalar" menciona algún equivalente a "cripto" o "método no listado".
    - `grep -l "## Respuesta canónica\\|## Si el cliente insiste\\|## Sources" src/lib/agents/somnio-v4/knowledge/policies/*.md src/lib/agents/somnio-v4/knowledge/faqs-no-templated/*.md` retorna vacío.
  </acceptance_criteria>
  <done>Los 6 policies + faqs topics reescritos. Total = 5 + 7 + 3 + 3 = 18.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.4: Correr sync end-to-end + verificar coherence + DB poblada</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (verificar nombre del entry point del CLI / script — probablemente hay un `npm run` o invocación directa)
    - package.json (buscar script tipo `kb:sync`, `sync-kb`, o invocación directa de sync.ts)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 887-894 (constraint SQL post-sync)
  </read_first>
  <action>
    **Paso 1 — Identificar cómo correr el sync.** Probables opciones:
    - `npm run kb:sync` o similar (revisar `package.json` scripts).
    - Invocación directa via `npx tsx src/lib/agents/somnio-v4/knowledge-base/sync.ts` (si sync.ts tiene `if (require.main === module)` o equivalente).
    - Si NO existe entry point: invocar manualmente desde un REPL / scratch script que importe `syncKnowledgeBase` (o el nombre exporto principal de sync.ts) y lo invoque sobre los 18 archivos.

    **Paso 2 — Correr sync.** Esperar:
    - 0 errores de coherence-check (los 18 archivos parseen + validen).
    - 18 upserts (o N "skip body_hash unchanged" si algún hash matchea — unlikely tras la reescritura).
    - Logs OK por archivo.

    **Paso 3 — Verificar DB.** Conectar a Supabase prod (via Studio SQL Editor, no automatizable desde el executor) y correr:

    ```sql
    -- Constraint: los 18 deben tener las 5 columnas nuevas pobladas.
    SELECT count(*) FROM agent_knowledge_base
    WHERE agent_id='somnio-sales-v4'
      AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
      AND (hechos_del_producto IS NULL OR debe_contener IS NULL OR debe_contener = '{}');
    -- Esperado: 0 (todos los 18 tienen las nuevas secciones pobladas)

    -- Confirmar count total:
    SELECT count(*) FROM agent_knowledge_base
    WHERE agent_id='somnio-sales-v4'
      AND workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
    -- Esperado: 18.

    -- Spot-check 1 caso (alcohol):
    SELECT topic, hechos_del_producto IS NOT NULL AS hechos_ok,
           posicion_del_negocio IS NOT NULL AS posicion_ok,
           array_length(debe_contener, 1) AS debe_contener_count,
           array_length(cuando_escalar, 1) AS cuando_escalar_count,
           array_length(nunca_decir, 1) AS nunca_decir_count
    FROM agent_knowledge_base
    WHERE agent_id='somnio-sales-v4' AND topic='interaccion_alcohol';
    -- Esperado: hechos_ok=true, posicion_ok=true, debe_contener_count >= 3, cuando_escalar_count >= 1, nunca_decir_count >= 4.
    ```

    **Paso 4 — Re-validar similarity post-reescritura (D-06).** Correr una query embedding manual para 5-6 casos representativos via psql o Studio (no automatizable acá — el executor lo hace observando logs del propio sync que probablemente emite las top-3 similarities por archivo si el `embed.ts` lo loggea). Si alguna query "obvia" no matchea (ej. "alcohol" no recupera `interaccion_alcohol` en top-3) → reportar al usuario antes de avanzar (puede requerir ajuste de keywords en frontmatter).

    Si Paso 3 o Paso 4 falla → STOP y reportar (NO commitear). Si todo OK → avanzar a commit local.
  </action>
  <verify>
    <automated>echo "Sync verification is manual via Supabase Studio. Executor reports OK/FAIL." && ls src/lib/agents/somnio-v4/knowledge/edge-cases/*.md src/lib/agents/somnio-v4/knowledge/product/*.md src/lib/agents/somnio-v4/knowledge/policies/*.md src/lib/agents/somnio-v4/knowledge/faqs-no-templated/*.md | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - 18 archivos .md totales (verify count == 18).
    - Sync corrió sin error de coherence-check (0 throws).
    - Constraint SQL retorna 0 (todos los 18 tienen las 5 columnas pobladas).
    - Spot-check de `interaccion_alcohol` muestra hechos_ok=true, debe_contener_count >= 3.
    - Si alguna similarity obvia rompe (D-06), executor reporta al usuario y bloquea avance.
  </acceptance_criteria>
  <done>Sync corrido limpio, DB poblada, similarity validada.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2.5: Commit LOCAL (NO push — atomic deploy unit con Plan 03)</name>
  <read_first>
    - CLAUDE.md (Regla 1 push — esta vez NO aplica por D-24 atomic)
    - .planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md D-24 (Plan 02 + Plan 03 = único deploy unit atómico)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 939-963 (Co-Modification Constraints + sugerencia al planner)
  </read_first>
  <action>
    **CRITICAL — NO PUSH ESTE COMMIT.** Plan 03 hace el push final tras refactorizar el sub-loop. Si pushás ahora, runtime degradado (KB nuevo + sub-loop viejo intentando leer canonical_response = null).

    Stage + commit (LOCAL only):

    ```
    git add src/lib/agents/somnio-v4/knowledge/edge-cases/*.md \
            src/lib/agents/somnio-v4/knowledge/product/*.md \
            src/lib/agents/somnio-v4/knowledge/policies/*.md \
            src/lib/agents/somnio-v4/knowledge/faqs-no-templated/*.md

    git commit -m "$(cat <<'EOF'
    feat(somnio-v4-rag-generative): plan 02 — reescritura 18 KBs al formato 5-secciones (RAG-generative)

    Big-bang rewrite (D-23) de los 18 KB docs:
    - 5 edge-cases: interaccion_alcohol, interaccion_medicamentos, uso_en_embarazo,
      uso_en_ninos, insomnio_largo_plazo.
    - 7 product: como_se_toma, contenido, contraindicaciones, dependencia, efectividad,
      formula, registro_sanitario.
    - 3 policies: devoluciones, envio, pago.
    - 3 faqs-no-templated: alternativas_naturales, duracion_efecto, precio_comparativo.

    Cada archivo:
    - Frontmatter actualizado: tone_override: null, last_reviewed: 2026-05-16, reviewed_by: jose.
    - Body con 5 markdown sections nuevas (D-01 #2..#6): Hechos del producto, Posición del negocio,
      Debe contener la respuesta, NUNCA decir, Cuándo escalar a humano.
    - Items de "Debe contener" prefijados [SIEMPRE] / [SI APLICA] (D-03).
    - "Si el cliente insiste" trasladado a items [SI APLICA] (D-04).

    Sync corrido localmente: 18 rows upserteadas con 5 columnas nuevas pobladas.
    Similarity re-validada para casos representativos (D-06 acepta cambio).

    **DO NOT PUSH STANDALONE — atomic deploy unit con Plan 03 (D-24).** Push al cierre del Plan 03.

    Standalone: somnio-v4-rag-generative Plan 02 (Wave 2 — atomic con Plan 03).
    Refs D-01, D-02, D-03, D-04, D-05, D-06, D-23, D-24.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    # NO git push — Plan 03 hace el push final tras refactor sub-loop.
    ```

    Después del commit, anunciar:
    > "Plan 02 commit local listo. NO pushé (D-24 atomic con Plan 03). Avanzando a Plan 03 que refactoriza el sub-loop. El push final lo hace el Plan 03 Task X.Y con ambos changesets."
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "somnio-v4-rag-generative.*plan 02" && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --oneline` incluye "somnio-v4-rag-generative" + "plan 02".
    - `git log origin/main..HEAD --oneline | wc -l` ≥ 1 (al menos 1 commit local NO pushado — el del Plan 02).
    - NO ejecutado `git push` (verificable por: si lo hubiera ejecutado, `git log origin/main..HEAD` sería vacío).
  </acceptance_criteria>
  <done>Plan 02 commit local listo. Plan 03 lo absorberá en el push final atomic.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| KB markdown files → Sync script → DB | Sync corre localmente, escribe a producción Supabase via createAdminClient |
| Plan 02 commit local → Plan 03 push | Atomic deploy unit; runtime broken si solo uno se aplica |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-02-01 | Tampering | Coherence-check valida formato pero contenido factual incorrecto pasa silencio | LOW | mitigate | Plan 05 Smoke A revisa 17 casos manualmente con Jose (D-26). Reescritura preserva contenido original (no inventa). |
| T-02-02 | Information Disclosure | Sync escribe a workspace incorrecto | LOW | accept | sync.ts hardcodea workspace_id Somnio + agent_id somnio-sales-v4. Verificado en sync.ts existente. |
| T-02-03 | Denial of Service | Embeddings cambian, similarity rompe para queries productivas | MEDIUM | mitigate | D-06 acepta re-validar post-migración. Task 2.4 spot-check de 5-6 queries antes de avanzar. Si rompe → bloquea. |
| T-02-04 | Repudiation | Plan 02 pushado sin Plan 03 → runtime degradado en v4 | INFO | mitigate | Plan 02 Task 2.5 explícitamente NO pushea. Plan 03 task de commit/push hace ambos juntos. v4 dormant absorbe daño si falla. |
| T-02-05 | Elevation of Privilege | Sync escribe fuera del scope somnio-v4 | INFO | accept | sync.ts hardcodea agent_id + workspace_id. No tocamos sync's invariantes. |
</threat_model>

<verification>
- Los 18 archivos .md están reescritos: `ls src/lib/agents/somnio-v4/knowledge/**/*.md | wc -l` == 18.
- Cada archivo pasa coherence-check (sync corrió sin error).
- DB poblada: constraint SQL Task 2.4 retorna 0.
- Spot-check de `interaccion_alcohol`: 5 markdown sections (D-01 #2..#6) pobladas correctamente.
- Similarity re-validada (D-06): casos obvios siguen matcheando.
- Commit local existe, NO push.
</verification>

<success_criteria>
Plan 02 cerrado cuando:
- [ ] Los 18 archivos .md reescritos al formato nuevo.
- [ ] Sync corrido limpio + DB poblada + similarity OK.
- [ ] Commit local creado (sin push).
- [ ] Anuncio al usuario: "Plan 02 commit local, push lo hace Plan 03 final".
- [ ] STATUS.md actualizada: Plan 02 done.
</success_criteria>

<rollback>
Si Task 2.4 detecta corruption en DB (constraint SQL retorna > 0):
1. STOP commit.
2. Verificar qué archivos fallaron en parsearse (logs del sync).
3. Corregir el archivo problemático.
4. Re-correr sync sobre el archivo específico (o todo).
5. Re-validar constraint.

Si similarity rompe materialmente (D-06):
1. STOP commit.
2. Identificar qué queries rompieron.
3. Ajustar `keywords` en frontmatter del archivo afectado (puede ser que el cambio de body movió el embedding lejos del intent).
4. Re-correr sync sobre el archivo afectado.
5. Re-validar.

Si después del commit local descubrís un error y AÚN no pasaste a Plan 03:
1. `git reset HEAD~1` (deshace commit, mantiene cambios en working tree).
2. Editar archivos problemáticos.
3. Re-commit.

Si Plan 02 ya commiteó Y se pushó SIN Plan 03 (anti-pattern):
1. v4 dormant absorbe el daño (no hay tráfico que se rompa).
2. Avanzar a Plan 03 inmediatamente; el push del Plan 03 trae el sub-loop nuevo y cierra el gap.
3. Si NO se puede avanzar a Plan 03 rápido, considerar revert del Plan 02 commit en main: `git revert <sha>` + push.
</rollback>

<output>
After completion, create `.planning/standalone/somnio-v4-rag-generative/02-SUMMARY.md` documentando:
- Lista de los 18 archivos reescritos.
- Resultados del sync (counts, errors).
- Constraint SQL retorno.
- Spot-check de interaccion_alcohol.
- HEAD del commit local (sin push).
- Próximo paso: Plan 03 refactoriza el sub-loop + hace el push final atomic.
</output>
