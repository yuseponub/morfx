# Standalone ui-agent-content-editor — Learnings

**Fecha:** 2026-06-02
**Duracion:** 7 planes (Wave 0 → Wave 5), ~1 dia
**Plans ejecutados:** 7 (01 serializer/Wave0, 02 migraciones+re-embed, 03 domain templates, 04 domain KB, 05 server actions, 06 UI, 07 evidencia+learnings)

> Standalone que llevo la edicion de contenido de agentes (templates por intent + KBs del RAG) de "solo SQL en Supabase Studio" a una UI bajo `/agentes/content-editor`. Solo `somnio-sales-v4` (DORMANT) es editable; el resto read-only. Toca Regla 3 (domain nuevo), Regla 5 (migracion antes de deploy) y Regla 6 (proteger agente en produccion).

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevencion |
|-----|-------|-----|------------|
| Hint `includes('## NUNCA decir\n\n## Cuándo escalar')` (2 newlines) en el test del serializer no matcheaba la salida real (3 newlines) | Aritmetica de newlines mal calculada en el plan-spec: header de seccion vacia deja `\n`, luego el separador `\n\n` une al siguiente header → 3 newlines | Se corrigio el hint a 3 newlines; el serializer (lockeado primero con `toBe` exacto) nunca estuvo mal | El test exacto `toBe` del fixture A es la verdad; los hints `includes` son secundarios. Lockear el serializer ANTES que cualquier consumidor (Plan 01 Wave 0) |
| `getKbTopic(ctx, kbId)` sin filtro `agent_id` (signature del plan) | La tabla `agent_knowledge_base` NO tiene RLS → el filtro del domain es el UNICO guard de aislamiento (Pitfall 2) | Se amplio a `getKbTopic(ctx, kbId, agentId)` con `.eq('id').eq('workspace_id').eq('agent_id')` | En tablas sin RLS, TODA query (incluso reads de una sola fila) debe cargar workspace_id + agent_id explicitos. Rule 2 (missing critical scoping) |
| Grep gate `it.todo == 0` fallaba por un comentario que contenia `it.todo` | El comentario describia la conversion RED→GREEN y contenia el token literal | Se reworded el comentario; sin cambio de comportamiento | Las gates `grep -c` son sensibles a comentarios. Redactar comentarios evitando el token exacto que la gate cuenta (paso 3 veces en este standalone: `it.todo`, `embedding`, `createAdminClient`) |
| Gate `grep -c "DROP TABLE|..." == 0` no pasa literalmente sobre la migracion de versions | El `grep -c` cuenta la linea de ROLLBACK COMENTADA (`--   DROP TABLE ...`) | Documentado honestamente: ops destructivas EJECUTABLES = 0 (`grep -vE "^\s*--"` antes del match). Cero destruccion real | Las gates de "0 ops destructivas" deben excluir comentarios. Reportar el match crudo Y el filtrado para no silenciar ni inflar |

---

## Decisiones Tecnicas

| Decision | Alternativas Descartadas | Razon |
|----------|-------------------------|-------|
| DB como fuente de verdad del KB (D-01) + guard en `knowledge:sync` | Mantener `.md` como SoT con round-trip DB→`.md` | Vercel no escribe al repo en runtime. El `.md` pasa a seed/export. El guard (`shouldAbortSync(count>0, !force)`) evita que un re-seed pise ediciones de UI silenciosamente |
| Serializer canonico compartido `buildContentToEmbed` (Plan 01) | Re-implementar el string-a-embeber en cada consumidor (migracion + UI) | La byte-equivalence con el `sync.ts` legacy es imposible de garantizar si hay 2+ implementaciones. Una sola funcion pura + test `toBe` exacto + re-embed one-time bajo agente dormant es el diseño honesto |
| `scope_summary` migrado a columna DB + 18 backfills SQL (D-10) | Dejarlo solo en frontmatter `.md` | D-01 hace la DB el SoT; el `upsertPayload` del sync NO persistia `scope_summary`. Sin columna, la UI no podia editar el lever de retrieval |
| Tabla dedicada `agent_knowledge_base_versions` (D-01b) | Columna JSONB de historial en la fila caliente | Buscar versiones previas es trivial con WHERE/ORDER BY; mantiene los snapshots fuera de la fila que carga el `vector(1536)`. NO se almacena el vector (restore re-embebe) |
| Constante LOCAL `CONTENT_EDITOR_AGENTS` en la UI | Extender el `AGENT_CATALOG` compartido | `config-panel.tsx` + `agent-config-slider.tsx` iteran `AGENT_CATALOG.map()` directo → extenderlo filtraria los 2 agentes Somnio extra a TODOS los dropdowns de config de prod (regresion Regla 6) |
| Re-embed SINCRONO en la server action (D-06) | Re-embed async via Inngest | Volumen bajo (~1-2s aceptable); sin estado intermedio "texto nuevo / embedding viejo". Si OpenAI falla, la action devuelve error sin escritura parcial |

---

## Problemas de Integracion

| Componente A | Componente B | Problema | Solucion |
|--------------|--------------|----------|----------|
| UI re-embed (Plan 04) | `sync.ts` legacy | El embedding debe ser byte-equivalente al que produjo el sync, o el RAG quedaria inconsistente | Ambos importan el mismo `buildContentToEmbed`; el test `toBe` exacto guarda contra drift |
| Migraciones (Plan 02) | Codigo de Waves 2-6 | Regla 5: el codigo no puede deployar antes de la migracion en prod | Plan 02 PAUSO en checkpoint bloqueante; el usuario aplico ambas migraciones + re-embed (18/18) ANTES de Waves 2-6 |
| Suite del standalone (22 tests) | Suite global del repo | La suite global tiene 6 archivos fallidos (crm-bots integration + somnio-v4-rag-generative) en la rama compartida `exec/debounce-v2-wave6` | Verificado: 0 commits de content-editor tocan esos archivos. Registrados en `deferred-items.md`, NO arreglados (scope-boundary) |

---

## Tips para Futuros Agentes

### Lo que funciono bien
- **Wave 0 primero (serializer + stubs `it.todo`):** lockear la funcion pura `buildContentToEmbed` con un test `toBe` exacto ANTES de cualquier consumidor evito drift de embeddings en Planes 02 y 04.
- **Domain layer como unico owner de `createAdminClient`:** las gates grep de Regla 3 son triviales de verificar cuando el patron es estricto desde el dia 1.
- **`assertEditable` centralizado:** un solo gate (`agentId === 'somnio-sales-v4'`) propagado a las 10 mutaciones hace Regla 6 verificable con 2 greps (`EDITABLE_AGENT_ID` + `assertEditable`).

### Lo que NO hacer
- **NO extender catalogos/constantes compartidas** para agregar entradas de una UI nueva — usa una constante LOCAL. Extender `AGENT_CATALOG` habria filtrado agentes a dropdowns de prod (Regla 6).
- **NO confiar en que un `.md` lossy se puede reconstruir byte-a-byte** desde la DB. El parser es one-way/lossy → la unica via honesta es un re-embed one-time bajo agente dormant.
- **NO dejar reads sin scoping en tablas sin RLS.** `agent_knowledge_base` no tiene RLS → cada query (incluso un single-row read) carga `workspace_id` + `agent_id`.
- **NO redactar comentarios con el token exacto que una gate `grep -c` cuenta** (`it.todo`, `embedding`, `createAdminClient`, `DROP TABLE`). Paso 4 veces.

### Patrones a seguir
- **Domain re-targeting de un transform existente (`.md`→DB):** extraer la logica de serializacion a una funcion pura compartida + test `toBe` exacto; consumidores (migracion CLI + server action) la importan, nunca la re-implementan.
- **Versioning-table snapshot-on-save:** tabla dedicada con FK ON DELETE CASCADE + `UNIQUE(kb_id, version_num)`, SIN el vector (restore re-embebe). Bogota timestamp (Regla 2).
- **Content-editor UI gateado por una constante agent id:** `EDITABLE_AGENT_ID` en la UI + `assertEditable` en el domain — doble gate (cliente + servidor) para Regla 6.
- **Guard anti-reseed:** un seed/sync script sin guard revierte silenciosamente una DB-source-of-truth. Gatear con `--force` + chequeo de non-empty (`shouldAbortSync(count>0, !force)`).
- **Regla 5 con OpenAI:** el re-embed NO puede ser SQL puro → separar en un CLI `tsx` post-migracion. La migracion crea la columna; el script la puebla con embeddings.

### Comandos utiles
```bash
# Regla 3 gate (cero createAdminClient fuera del domain)
grep -rn "createAdminClient" "src/app/(dashboard)/agentes/content-editor/" | wc -l   # 0
grep -rln "createAdminClient" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts  # ambos

# Regla 6 gate (solo v4 mutable)
grep -c "EDITABLE_AGENT_ID = 'somnio-sales-v4'" src/lib/domain/agent-*.ts   # 1 c/u
grep -c "assertEditable" src/lib/domain/agent-*.ts                          # 5 c/u

# Ops destructivas EJECUTABLES (excluyendo comentarios)
grep -vE "^\s*--" supabase/migrations/2026060110*.sql | grep -cE "DROP TABLE|DELETE FROM|TRUNCATE"  # 0

# Suite del standalone (verde 22/22)
npx vitest run src/lib/domain/__tests__/agent-templates.test.ts \
  src/lib/domain/__tests__/agent-knowledge-base.test.ts \
  src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts \
  scripts/__tests__/knowledge-sync-guard.test.ts

# Verificar que un archivo fallido de la suite global NO es de este standalone
git log --oneline --all -- <archivo.test.ts> | grep -ci "content-editor"  # 0 = ajeno
```

---

## Deuda Tecnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Smokes manuales D-03b (cache TTL runtime), D-04 (dropdown UI), D-05 (upload imagen) | Media | Activacion v4 / sesion de QA en browser `localhost:3020` |
| Export a `.md` desde la UI (snapshot a git ademas del versionado en DB) | Baja | Nice-to-have, follow-up |
| Editar agentes de PRODUCCION desde la UI (v3/godentist/recompra/pw-confirmation) | Baja | Follow-up cuando la UI este probada con v4 (requiere gate de confirmacion fuerte) |
| Overrides de templates por `workspace_id` | Baja | Follow-up si v4 corre en multiples workspaces |
| Re-embed async via Inngest | Baja | Solo si el volumen de edicion crece mucho |
| Crear intents nuevos desde la UI | Baja | Requiere trabajo de codigo en el state-machine del agente |

---

## Notas para el Modulo

Informacion que un agente de documentacion de este modulo necesitaria:

- **Ruta UI:** `/agentes/content-editor` (tab "Contenido" en el layout de `/agentes`).
- **Domain nuevo:** `src/lib/domain/agent-templates.ts` (list/update/add/delete/reorder) + `src/lib/domain/agent-knowledge-base.ts` (CRUD + re-embed + versioning + restore). Ambos son los UNICOS owners de `createAdminClient` para sus tablas.
- **Server actions:** `src/app/actions/agent-content-editor.ts` — admin-gated (`isWorkspaceAdmin`, D-07), zod-validated, 0 `createAdminClient`.
- **Serializer canonico:** `src/lib/agents/somnio-v4/knowledge-base/serialize.ts::buildContentToEmbed` — funcion pura compartida entre la migracion CLI, el sync legacy y la UI. NO re-implementar; el test `toBe` exacto la guarda.
- **Migraciones (aplicadas en prod 2026-06-01):** `20260601100000_kb_scope_summary.sql` (columna + 18 backfills v4) + `20260601100100_kb_versions_table.sql` (tabla de versiones). Re-embed corrido via `scripts/reembed-kb-v4.ts` (18/18 OK).
- **Scope (Regla 6):** SOLO `somnio-sales-v4` editable (gate `EDITABLE_AGENT_ID` UI + `assertEditable` domain). v4 DORMANT en prod. Los 6 agentes de produccion son read-only con badge "PRODUCCION — solo lectura".
- **Guard de `knowledge:sync` (D-01):** `shouldAbortSync` + flag Inngest `platform_config.somnio_v4_kb_sync_enabled` (default false). El sync ya NO pisa ediciones de UI.
- **Cache TemplateManager:** ediciones (UI o SQL) se reflejan en runtime tras ≤5 min.
- **KB sin RLS:** toda query del KB carga `workspace_id` + `agent_id` explicitos — el domain es el unico guard de aislamiento.

---
*Generado al completar el standalone. Input para entrenamiento de agentes de documentacion.*
