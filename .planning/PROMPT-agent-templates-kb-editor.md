# PROMPT — UI de edición de Templates + KBs por agente (para otra instancia)

> **Cómo usar este prompt:** pásaselo a otra instancia de Claude Code en este repo (`morfx-new`).
> Es una feature NUEVA de UI → **debe ir por GSD completo** (REGLA 0): `discuss-phase → research-phase →
> plan-phase → execute-phase`. NO implementar inline. Este documento es el brief de arranque + los
> hechos ya verificados en código para que el discuss/research no parta de cero.

---

## Objetivo

Crear una sección en el módulo de agentes (`/agentes`) que permita al operador:
1. **Ver y editar los templates** que cada intent envía, **con selector de agente** (cada agente tiene su catálogo).
2. **Ver y (potencialmente) editar los KBs** del agente RAG — para saber qué puede responder el agente, cómo lo responde, y qué escala a humano.

Motivación del usuario (Jose): hoy todo se edita por SQL en Supabase Studio. Quiere control desde la UI para
entender y ajustar el comportamiento del agente — especialmente "qué está handoffeando, qué puede responder y cómo".

---

## Hechos verificados en código (NO re-investigar esto — está confirmado)

### A) Templates — tabla `agent_templates`
- **Migración base:** `supabase/migrations/20260206000000_agent_templates.sql` (+ `20260226000000_block_priorities.sql` añadió `priority`, + `20260303000000_no_repetition_minifrases.sql` añadió `minifrase`).
- **Columnas clave:** `id`, `agent_id` (TEXT), `intent` (TEXT), `visit_type` (CHECK `primera_vez`|`siguientes` — runtime usa solo `primera_vez`), `orden` (INT, 0-indexed dentro del grupo), `content_type` (CHECK `texto`|`template`|`imagen`), `content` (TEXT — texto o URL de imagen), `delay_s` (INT), `priority` (CHECK `CORE`|`COMPLEMENTARIA`|`OPCIONAL`), `workspace_id` (UUID NULL = global; UUID = override por workspace), `minifrase` (TEXT NULL — filtro no-repetición).
- **Unique:** `(agent_id, intent, visit_type, orden, workspace_id)`.
- **NO hay columna de media aparte** — las imágenes van como URL en `content` con `content_type='imagen'`.
- **Lookup runtime:** `TemplateManager` en `src/lib/agents/somnio/template-manager.ts` (`getTemplatesForIntent` L111-157, `loadTemplates` L257-314). Cachea 5 min por `agentId:workspaceId`. **Usa `createAdminClient()` directo — NO hay domain layer.**
- **Agentes (`agent_id` distintos):** `somnio-sales-v1`, `somnio-sales-v3`, `somnio-sales-v4`, `godentist`, `godentist-fb-ig`, `somnio-recompra-v1`, `somnio-sales-v3-pw-confirmation`. Catálogo canónico en `src/lib/agents/agent-catalog.ts` (`AGENT_CATALOG` L19-45). Registry en `src/lib/agents/registry.ts`.
- ⚠️ **`somnio-sales-v4` NO usa templates para todo** — usa el KB/RAG sub-loop. Tiene templates clonados (`20260501100300_somnio_v4_template_clone.sql`) pero su path informacional es RAG. Tener esto en cuenta en la UI (v4 mezcla templates + KB).

### B) KB — tabla `agent_knowledge_base`
- **Migración:** `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql` + `20260516193830_somnio_v4_kb_schema_rag_generative.sql`.
- **Scoping DUAL:** `workspace_id` (NOT NULL) **Y** `agent_id` (NOT NULL). Unique `(topic, agent_id, workspace_id)`. Un editor necesita selector de **(workspace, agente)**.
- **Columnas RAG-generative (las que importan para editar):** `topic`, `keywords` (TEXT[]), `category` (CHECK `product`|`policies`|`edge-cases`|`faqs-no-templated`), `hechos_del_producto` (TEXT), `posicion_del_negocio` (TEXT), `debe_contener` (TEXT[]), `nunca_decir` (TEXT[]), `cuando_escalar` (TEXT[]), `tone_override` (TEXT NULL), `embedding` (vector(1536)), `body_hash` (SHA-256 para skip re-embed), `source_md_path`, `last_reviewed_at`, `reviewed_by`, `hit_count`.
- **`canonical_response` está DEPRECATED** para somnio-v4 (era el modelo viejo verbatim; ahora es RAG generativo).
- **kb_search:** `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` → RPC `match_knowledge_base` (cosine, top-3, sin threshold en el RPC). Embeddings con `text-embedding-3-small` (1536) via `src/lib/agents/somnio-v4/knowledge-base/embed.ts` (keys `OPENAI_API_KEY_SALESV4` → `OPENAI_API_KEY`).
- 🚨 **FUENTE DE VERDAD ACTUAL = archivos `.md`**, no la DB. Los KB viven en `src/lib/agents/somnio-v4/knowledge/**/*.md` (18 docs: product/7, policies/3, edge-cases/5, faqs-no-templated/3). Se sincronizan a la DB con `scripts/knowledge-sync.ts` (`pnpm knowledge:sync`) o el Inngest `src/inngest/functions/knowledge-sync-v4.ts` (flag `platform_config.somnio_v4_kb_sync_enabled`). El parser está en `knowledge-base/parser.ts`; el upsert+embed en `knowledge-base/sync.ts` (`syncKbDoc` L31-102: hashea, si cambió re-embebe, upsert onConflict `topic,agent_id,workspace_id`).

### C) Lo que YA existe vs lo que FALTA
- **Existe:** `/configuracion/whatsapp/templates` (es el manager de templates de WhatsApp Business / 360dialog — tabla `whatsapp_templates`, **NO** `agent_templates`). `/agentes` (métricas). `/agentes/config` (sliders). `/agentes/routing/editor`. `/agentes/somnio-v4/unknown-cases` (revisión de casos que el agente no supo responder — lo más cercano a KB-adjacent). Sandbox debug-panel `subloop-tab.tsx` muestra KB hits.
- **FALTA (todo esto hay que construirlo):**
  - UI para ver/editar filas de `agent_templates` por agente (secuencia por intent, priority, delay, content, workspace-override).
  - UI para ver/editar `agent_knowledge_base` (los 5 campos RAG + topic/category/keywords).
  - **Domain layer** para AMBAS tablas (no existe `src/lib/domain/agent-templates.ts` ni `agent-knowledge-base.ts`) — REGLA 3 obliga a crearlos antes de cualquier mutación UI.
  - Re-embedding al editar un KB (un edit que toque `hechos/posicion/debe_contener/scope` DEBE re-embeber — reusar `generateEmbedding` + actualizar `embedding` + `body_hash`).

---

## Decisiones que el discuss-phase DEBE resolver (gray areas reales)

1. **🔑 KB: ¿fuente de verdad `.md` o DB?** Hoy los `.md` son la fuente y la DB es derivada. Si la UI edita la DB directo, los `.md` quedan stale → divergencia. Opciones:
   - (A) UI edita DB + re-embebe; los `.md` pasan a ser export/seed inicial (la DB manda). Riesgo: el repo deja de reflejar el KB vivo.
   - (B) UI read-only para KB; editar sigue siendo `.md` + sync. Simple pero no cumple "potencialmente editar desde la UI".
   - (C) UI edita DB Y escribe de vuelta el `.md` (round-trip) para mantener ambos sincronizados. Más trabajo, mantiene el repo como SoT.
   - **Recomendación a discutir:** (A) con un "export a .md" opcional, o (C) si se quiere mantener git como historia. Decidir con el usuario.
2. **¿Qué agentes son editables en la UI?** ¿Todos (incluido v3 producción) o solo somnio-v4 al principio? Editar templates de v3 toca al agente que atiende clientes reales (REGLA 6) — ¿se permite o se marca read-only para los de producción?
3. **¿Workspace-override de templates en la UI?** `agent_templates.workspace_id` permite override por workspace. ¿La UI expone esto o solo edita los globales?
4. **¿Edición de `agent_templates.content_type='imagen'`?** ¿Subida de imagen (bucket) o solo URL?
5. **¿Re-embed síncrono o async?** Editar un KB y re-embeber puede tardar ~1s (OpenAI). ¿Server action síncrona o un Inngest job? (síncrono es más simple y el volumen es bajo).
6. **Permisos:** ¿quién puede editar? (rol admin del workspace).

---

## Restricciones (CLAUDE.md)
- **REGLA 3:** toda mutación pasa por `src/lib/domain/*`. Crear `agent-templates.ts` y `agent-knowledge-base.ts` en domain (no existen). La UI llama server action → domain → revalidatePath.
- **REGLA 6:** editar templates/KB de un agente en PRODUCCIÓN (v3, godentist, recompra, pw-confirmation) cambia su comportamiento con clientes reales. La UI debe dejar claro qué es producción y/o requerir confirmación. v4 está DORMANT (seguro).
- **REGLA 5:** si se necesita alguna columna nueva (ej. `agent_templates` audit, o un flag de "editado-desde-UI") → migración aplicada en prod ANTES de pushear código que la use.
- **REGLA 0:** discuss → research → plan → execute. Este prompt alimenta el discuss/research.
- **Stack:** Next.js 15 App Router, React 19, Supabase, Tailwind. UI editorial v2 si aplica (ver memoria `ui_redesign_*`).

## Patrones reusables en el repo
- Server action + domain pattern: ver `src/lib/domain/whatsapp-templates.ts` (`createTemplate`) + `src/app/actions/templates.ts`.
- UI de lista/edición existente para copiar estructura: `/configuracion/whatsapp/templates/` (list + form + builder).
- Re-embed: `src/lib/agents/somnio-v4/knowledge-base/sync.ts` (`syncKbDoc`) + `embed.ts` (`generateEmbedding`).
- Selector de agente: `AGENT_CATALOG` en `src/lib/agents/agent-catalog.ts`.

## Entregable esperado de la otra instancia
1. `discuss-phase` que resuelva las 6 gray areas de arriba (sobre todo la #1, SoT del KB).
2. `research-phase` que valide el re-embed flow + el patrón domain+server-action+UI.
3. `plan-phase` multi-wave: domain layer (templates + KB) → server actions → UI lista+editor con selector de agente → re-embed on KB save → tests + Regla 6/3.
4. Ejecución con commits atómicos.

## Anti-objetivos (NO en esta fase)
- No tocar el envío real de WhatsApp (`whatsapp_templates` / 360dialog es otro sistema).
- No rediseñar el RAG ni el comprehension — solo CRUD de su contenido (templates + KB).
- No construir el sistema de no-repetición (es trabajo aparte del sub-loop).
