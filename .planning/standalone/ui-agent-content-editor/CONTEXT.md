# Standalone: UI Agent Content Editor - Context

**Gathered:** 2026-06-01
**Status:** Ready for research + planning
**Origin:** Brief del usuario (Jose) — commit `8b58cad7` "prompt para otra instancia". Hoy el contenido que define el comportamiento de cada agente (templates por intent + KBs del RAG) se edita 100% por SQL en Supabase Studio. Jose quiere control desde la UI para **entender y ajustar qué responde cada agente, qué escala a humano, y cómo** — sin tocar SQL.

<domain>
## Phase Boundary

Construir una sección de UI dentro del módulo `/agentes` que permita:

1. **Ver/editar `agent_templates`** (la secuencia de templates que cada intent envía), con **selector de agente**. Todos los agentes visibles en lectura; solo `somnio-sales-v4` editable.
2. **Ver/editar `agent_knowledge_base`** (los 5 campos RAG + `scope_summary` + `keywords` + topic/category), con re-embed síncrono al guardar y versionado en DB.
3. **Domain layer nuevo** para ambas tablas (`src/lib/domain/agent-templates.ts` + `agent-knowledge-base.ts`) — no existen hoy; Regla 3 los exige antes de cualquier mutación de UI.

**En scope:**
- Domain layer para `agent_templates` y `agent_knowledge_base` (lectura + mutación filtrando por workspace, Regla 3).
- Server actions → domain → `revalidatePath`.
- UI lista + editor con selector de agente (todos visibles read-only; v4 editable).
- Templates: editar + agregar + borrar + reordenar dentro de **intents existentes** (D-08).
- KB: CRUD completo de topics (crear/editar/borrar) con re-embed síncrono (D-06, D-09).
- KB: versionado en DB (snapshot por edición + ver/buscar/restaurar) (D-01).
- KB: exponer y editar `scope_summary` + `keywords` (D-10) → migrar `scope_summary` a columna DB + backfill.
- Subida de imagen a bucket Supabase para templates `content_type='imagen'` (D-05).
- Permisos: admin del workspace (D-07).
- Tests + verificación Regla 3 / Regla 6.

**Fuera de scope (decisiones explícitas):**
- ❌ Editar/mutar agentes de **producción** desde la UI (v3, godentist, godentist-fb-ig, recompra, pw-confirmation) — solo lectura en v1 (D-02, D-04). Habilitar edición de producción = follow-up.
- ❌ **Overrides por `workspace_id`** de templates — la UI edita solo las filas que v4 usa (D-03). Override por cliente = follow-up.
- ❌ **Crear intents nuevos** desde la UI — requiere código del agente (state-machine) que reconozca el intent (D-08).
- ❌ Tocar el **envío real de WhatsApp** (`whatsapp_templates` / 360dialog es otro sistema, no `agent_templates`).
- ❌ Rediseñar el RAG, el comprehension o el sistema de no-repetición — solo CRUD de su contenido.
- ❌ Re-embed **async** (se eligió síncrono — D-06).
- ❌ Round-trip automático DB→`.md` en runtime (Vercel no escribe al repo). Export a `.md` queda como nice-to-have opcional (ver Deferred).

</domain>

<decisions>
## Implementation Decisions

### KB — Fuente de verdad y versionado
- **D-01:** La **DB es la fuente de verdad** del KB (Opción A). La UI edita la DB y re-embebe al guardar. Los `.md` pasan a ser seed/export inicial. **Consecuencia obligatoria:** proteger `knowledge:sync` (Inngest `knowledge-sync-v4.ts` + `pnpm knowledge:sync`) para que NO pise ediciones de UI con el `.md` viejo — volverlo "import inicial only" o gatearlo con flag. Si no, el sync revierte ediciones silenciosamente.
- **D-01b (versionado):** Cada guardado de un KB **snapshot-ea la versión anterior** en DB. La UI permite **ver / buscar / restaurar** una versión previa. Esto cubre la pérdida del historial que hoy da git. → schema nuevo (tabla de versiones tipo `agent_knowledge_base_versions` o columna JSONB de historial — research/plan decide la forma) → **migración (Regla 5)**.

### Scope de agentes (Regla 6)
- **D-02:** Solo **`somnio-sales-v4` es editable** en v1. v4 está DORMANT en prod (sin tráfico) → seguro por construcción.
- **D-04:** **Todos** los agentes (`somnio-sales-v1/v3/v4`, `godentist`, `godentist-fb-ig`, `somnio-recompra-v1`, `somnio-sales-v3-pw-confirmation`) se ven en **modo lectura** (para entender qué responde cada uno). Los de producción se muestran marcados **"PRODUCCIÓN — solo lectura"**. Editar/guardar solo habilitado en v4.

### Templates — overrides y coexistencia con SQL
- **D-03:** La UI edita **las filas que v4 usa** (las globales / las del scope de v4). **NO expone overrides por `workspace_id`**. Mismo dato, misma fila — solo cambia el lugar de edición vs Supabase Studio. Cero cambio en el comportamiento del runtime.
- **D-03b:** Templates editables desde UI **y** SQL **libremente** — `agent_templates` vive solo en la DB (sin SoT paralelo), last-write-wins. Recordar: el `TemplateManager` cachea 5 min → cualquier edición (UI o SQL) se ve en runtime tras ≤5 min. KB es distinto: camino seguro = UI (re-embebe+versiona) o `knowledge:sync`; SQL crudo en KB deja el `embedding` stale.

### Imagen
- **D-05:** Para `content_type='imagen'`, la UI ofrece **subida a bucket Supabase** (reusar el patrón del builder de WhatsApp, bucket `whatsapp-media`) → autollenar el URL público en `content`. (No solo-URL.)

### Re-embed
- **D-06:** Re-embed **síncrono** en la server action. Volumen bajo, ~1-2s aceptable, sin estado intermedio "texto nuevo / embedding viejo". Si OpenAI falla, la action devuelve error y el usuario reintenta.

### Permisos
- **D-07:** Editar restringido a **admin del workspace**. Consistente con cómo se gatean otras configs del CRM.

### Alcance del CRUD
- **D-08 (templates):** **B acotado** — editar contenido + agregar + borrar + reordenar (`orden`) templates **dentro de intents que ya existen**. NO crear intents nuevos (un intent nuevo requiere que el código del agente lo reconozca → fuera de scope).
- **D-09 (KB):** **B completo** — crear / editar / borrar topics. Un KB nuevo funciona sin tocar código (`kb_search` lo encuentra por embedding). Crear topic = re-embed igual que editar.

### Guianza de retrieval (hallazgo durante discuss)
- **D-10:** El editor de KB **expone `scope_summary` + `keywords` como campos editables** — es el lever que controla "a qué KB llega la query del cliente". Hallazgo verificado en `sync.ts` L40-48: `contentToEmbed = scope_summary + "\n\n" + body` → `scope_summary` se antepone al material y se embebe. **PERO hoy `scope_summary` vive solo en el frontmatter del `.md`, NO es columna DB** (el `upsertPayload` de `sync.ts` no lo incluye). Como D-01 hace la DB fuente de verdad, hay que **migrar `scope_summary` a columna DB** + backfill desde los `.md` actuales → **migración (Regla 5)**. El re-embed de la UI debe reconstruir `contentToEmbed = scope_summary + material estructurado` igual que el sync (research/plan aterriza cómo armar el texto-a-embeber desde las columnas).

### Claude's Discretion
- Estructura/ruta exacta de la UI dentro de `/agentes` (ej. `/agentes/content-editor`, o sub-tabs templates/KB). Reusar estructura de `/configuracion/whatsapp/templates/` como referencia de patrón list+form.
- Forma concreta del versionado KB (tabla dedicada vs JSONB) — decidir en research/plan con criterio de simplicidad + Regla 5.
- Cómo reconstruir `contentToEmbed` desde columnas estructuradas en el path UI (debe quedar byte-equivalente a lo que produce `sync.ts` para no invalidar embeddings existentes).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reglas del proyecto (CLAUDE.md)
- `CLAUDE.md` — Regla 3 (domain layer obligatorio), Regla 5 (migración antes de deploy), Regla 6 (proteger agente en producción), sección "OBLIGATORIO al Crear un Agente Nuevo" (no aplica directo — esto es UI, no agente nuevo, pero define el espíritu de scope).

### Templates — schema y runtime
- `supabase/migrations/20260206000000_agent_templates.sql` — schema base de `agent_templates` (columnas, unique `(agent_id, intent, visit_type, orden, workspace_id)`, RLS `workspace_id IS NULL OR is_workspace_member`).
- `supabase/migrations/20260226000000_block_priorities.sql` — columna `priority` (CORE/COMPLEMENTARIA/OPCIONAL).
- `supabase/migrations/20260303000000_no_repetition_minifrases.sql` — columna `minifrase`.
- `supabase/migrations/20260501100300_somnio_v4_template_clone.sql` — clone de v4 desde v3 (preserva `workspace_id` del origen).
- `src/lib/agents/somnio/template-manager.ts` — `getTemplatesForIntent` (L111-157) + `loadTemplates` (L257-314). Lookup runtime: trae globales (`workspace_id IS NULL`) + las del workspace si hay; merge por `orden`; cache 5 min por `agentId:workspaceId`. **Usa `createAdminClient()` directo — NO hay domain layer (lo crea este standalone).**

### KB — schema, sync, embed, retrieval
- `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql` — schema base KB.
- `supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql` — columnas RAG-generative (`hechos_del_producto`, `posicion_del_negocio`, `debe_contener`, `nunca_decir`, `cuando_escalar`, `tone_override`, `embedding vector(1536)`, `body_hash`, `source_md_path`, etc.). Unique `(topic, agent_id, workspace_id)`. **`canonical_response` DEPRECATED para v4.** ⚠️ `scope_summary` NO es columna — solo frontmatter `.md`.
- `src/lib/agents/somnio-v4/knowledge-base/sync.ts` — `syncKbDoc` (L31-102). `contentToEmbed = scope_summary + "\n\n" + body`; hashea (SHA-256); si cambió re-embebe; upsert `onConflict topic,agent_id,workspace_id`. **`upsertPayload` NO persiste `scope_summary`** (clave para D-10).
- `src/lib/agents/somnio-v4/knowledge-base/embed.ts` — `generateEmbedding` (OpenAI `text-embedding-3-small` 1536; keys `OPENAI_API_KEY_SALESV4` → `OPENAI_API_KEY`).
- `src/lib/agents/somnio-v4/knowledge-base/parser.ts` — parser del `.md` (frontmatter + secciones). Define qué campos existen y cómo se serializan.
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` — tool `kb_search`: input solo `query` (sin `category` desde Iter 7i); RPC `match_knowledge_base` (cosine top-3). GPT-4o-mini NO recibe lista/summary de KBs — retrieval 100% semántico.
- `src/inngest/functions/knowledge-sync-v4.ts` — Inngest sync (flag `platform_config.somnio_v4_kb_sync_enabled`). **Hay que protegerlo (D-01).**
- `scripts/knowledge-sync.ts` — `pnpm knowledge:sync` (mismo sync, manual).
- `src/lib/agents/somnio-v4/knowledge/**/*.md` — los 18 KBs actuales (product/7, policies/3, edge-cases/5, faqs-no-templated/3). Seed para el backfill de `scope_summary`.

### Catálogo de agentes
- `src/lib/agents/agent-catalog.ts` — `AGENT_CATALOG` (L19-45): lista canónica de agentes para el selector.
- `src/lib/agents/registry.ts` — registry de agentes.

### Patrones reusables (domain + server action + UI + upload)
- `src/lib/domain/whatsapp-templates.ts` — patrón domain `createTemplate` (modelo para los domain nuevos).
- `src/app/actions/templates.ts` — patrón server action.
- `src/app/(dashboard)/configuracion/whatsapp/templates/` — UI list + form + builder (estructura a copiar) + patrón de subida de imagen a bucket `whatsapp-media` (para D-05).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TemplateManager` (`src/lib/agents/somnio/template-manager.ts`) — define la forma de los datos de `agent_templates` y el lookup; el domain nuevo debe ser consistente con lo que este lee.
- `generateEmbedding` + `syncKbDoc` (`knowledge-base/embed.ts` + `sync.ts`) — reutilizar para el re-embed síncrono de la UI (D-06). El texto-a-embeber debe quedar byte-equivalente al del sync.
- `AGENT_CATALOG` (`agent-catalog.ts`) — alimenta el selector de agente (D-04).
- Builder de WhatsApp templates (`/configuracion/whatsapp/templates/`) — patrón de subida a bucket `whatsapp-media` (D-05) + estructura list/form a copiar.
- `whatsapp-templates.ts` domain + `actions/templates.ts` — plantilla del patrón domain → server action → revalidatePath (Regla 3).

### Established Patterns
- **Regla 3:** toda mutación por `src/lib/domain/*`. Crear `agent-templates.ts` + `agent-knowledge-base.ts` (no existen). Cero `createAdminClient` fuera del domain.
- **Cache TemplateManager 5 min:** ediciones (UI o SQL) se reflejan en runtime tras ≤5 min (no instantáneo).
- **RLS `agent_templates`:** `workspace_id IS NULL OR is_workspace_member(workspace_id)` — la UI/domain debe respetar esto (D-03 edita filas globales/scope v4).

### Integration Points
- Nueva ruta bajo `/agentes` (estructura a decisión de Claude — referencia `/configuracion/whatsapp/templates/`).
- Domain nuevo consumido por server actions de la UI.
- Re-embed reusa `generateEmbedding`; sync (`knowledge-sync-v4` + script) debe quedar protegido para no pisar la DB (D-01).
- Bucket `whatsapp-media` para imágenes (D-05).

</code_context>

<specifics>
## Specific Ideas

- "Entender qué está handoffeando, qué puede responder cada agente y cómo" — motiva D-04 (ver TODOS los agentes en lectura) y D-10 (editar `scope_summary`, el lever de retrieval).
- El usuario quiere poder editar tanto desde la UI como seguir pudiendo editar por SQL en Supabase (D-03b) — válido para templates; para KB el camino seguro es la UI/sync por el re-embed.
- El usuario pidió explícitamente versionado del KB ("que se pueda buscar una versión anterior si así se desea") — D-01b.

</specifics>

<deferred>
## Deferred Ideas

- **Editar agentes de producción desde la UI** (v3, godentist, godentist-fb-ig, recompra, pw-confirmation) — follow-up cuando la UI esté probada con v4. Requeriría gate de confirmación fuerte + indicador "PRODUCCIÓN" + respeto a Regla 6.
- **Overrides de templates por `workspace_id`** — follow-up si v4 corre en múltiples workspaces y uno necesita un template propio. Ojo: el runtime hoy SUMA global+override (no reemplaza) — habría que aclararlo/ajustarlo.
- **Crear intents nuevos desde la UI** — requiere trabajo de código en el agente (state-machine). Fuera de scope de una UI de contenido.
- **Export a `.md` desde la UI** (snapshot a git) — nice-to-have opcional para mantener historia en repo además del versionado en DB (D-01). No bloqueante.
- **Re-embed async vía Inngest** — solo si el volumen de edición creciera mucho (no es el caso hoy).

</deferred>

---

*Standalone: ui-agent-content-editor*
*Context gathered: 2026-06-01*
