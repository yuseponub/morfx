# Standalone: UI Agent Content Editor - Discussion Log

> **Audit trail only.** No usar como input de planning/research/execution.
> Las decisiones están en CONTEXT.md — este log preserva las alternativas consideradas.

**Date:** 2026-06-01
**Standalone:** ui-agent-content-editor
**Areas discussed:** KB source-of-truth + versionado, Scope de agentes, Override por workspace + coexistencia SQL, Imagen, Re-embed, Permisos, Alcance CRUD, Guianza de retrieval (scope_summary)

---

## KB — Fuente de verdad (decisión crítica)

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — DB manda + export .md opcional | UI edita DB + re-embebe; .md = seed/export | ✓ |
| C — Round-trip DB↔.md | UI edita DB y reescribe el .md (git como historia) | |
| B — UI read-only para KB | Editar sigue por .md + sync; UI solo muestra | |

**User's choice:** A — la DB es la fuente de verdad.
**Notes:** El usuario pidió **agregar versionado en DB** para cubrir la desventaja de perder el historial de git ("que se pueda buscar una versión anterior si así se desea"). Se constató que la opción C pura es inviable en prod (Vercel no escribe al repo en runtime). → D-01 + D-01b. Consecuencia: proteger `knowledge:sync`.

---

## Scope de agentes (Regla 6)

| Opción | Descripción | Selected |
|--------|-------------|----------|
| 1 — Todos editables con gate de confirmación en producción | Selector con todos; producción requiere confirmación | |
| 2 — Solo somnio-v4 | UI acotada a v4 (dormant, seguro) | ✓ |
| 3 — Todos visibles, producción read-only | Ve todos, muta solo v4 | (fusionado en D-04) |

**User's choice:** Solo v4 editable. + (sub-aclaración) todos los agentes **visibles en lectura**, solo v4 editable.
**Notes:** → D-02 (solo v4 editable) + D-04 (todos visibles read-only, producción marcada). Combina lo seguro de "solo v4" con el objetivo de "entender qué responde cada agente".

---

## Override por workspace + coexistencia con SQL

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — UI edita filas que v4 usa (sin overrides) | Mismo dato, sin selector de workspace | ✓ |
| B — UI expone overrides por workspace | Selector extra + global vs override | |

**User's choice:** A. Además preguntó si se puede editar desde UI **y** SQL a la vez.
**Notes:** Se revisó el código (`template-manager.ts` loadTemplates) y se explicó: `agent_templates` vive solo en DB (sin SoT paralelo) → UI + SQL coexisten libremente (last-write-wins, cache 5 min). KB es distinto: SQL crudo deja embedding stale. → D-03 + D-03b.

---

## Templates de imagen (content_type='imagen')

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — Solo URL | Campo de texto + preview | |
| B — Subida a bucket Supabase | Reusar patrón whatsapp-media | ✓ |

**User's choice:** B.
**Notes:** → D-05. Reusar el patrón existente del builder de WhatsApp (bucket `whatsapp-media`).

---

## Re-embed al guardar KB

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — Síncrono en server action | ~1-2s, sin estado intermedio | ✓ |
| B — Async vía Inngest | Guardado instantáneo + job background | |

**User's choice:** A.
**Notes:** → D-06. Volumen bajo justifica síncrono.

---

## Permisos

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — Admin del workspace | Consistente con resto del CRM | ✓ |
| B — Cualquier miembro | Más abierto | |
| C — Solo super-admin de plataforma | Solo equipo MorfX | |

**User's choice:** A.
**Notes:** → D-07.

---

## Alcance del CRUD — Templates

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — Solo editar contenido | Cambiar content/delay/priority | |
| B completo — incl. crear intents nuevos | CRUD total | |
| B acotado — dentro de intents existentes | Editar+agregar+borrar+reordenar, sin intents nuevos | ✓ |

**User's choice:** B acotado (con la recomendación de Claude).
**Notes:** → D-08. Crear intents nuevos requiere código del agente → fuera de scope.

---

## Alcance del CRUD — KB

| Opción | Descripción | Selected |
|--------|-------------|----------|
| A — Solo editar topics existentes | Sin crear/borrar | |
| B — CRUD completo | Crear/editar/borrar topics | ✓ |

**User's choice:** B completo.
**Notes:** → D-09. Un KB nuevo funciona sin tocar código (kb_search lo encuentra por embedding).

---

## Guianza de retrieval — scope_summary (hallazgo durante discuss)

**User's question:** "¿También hay acceso a la guianza de mini4o para llegar a cada KB (el summary o como sea que se llame)?"

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Exponer scope_summary + keywords editables (migrar a columna DB) | Lever de retrieval editable desde UI | ✓ |
| Dejar scope_summary solo en .md (UI no lo toca) | Read-only/oculto | |

**User's choice:** Exponer y editar (confirmó "dale").
**Notes:** → D-10. Hallazgo verificado: `sync.ts` L40-48 embebe `scope_summary + body`, pero `scope_summary` NO se persiste en DB (no está en `upsertPayload`). Como D-01 hace la DB fuente de verdad, hay que migrar `scope_summary` a columna + backfill desde `.md`. El re-embed de la UI debe reconstruir el texto-a-embeber byte-equivalente al sync. GPT-4o-mini NO recibe lista/summary de KBs — retrieval 100% semántico vía embedding; `scope_summary` + `keywords` son el lever.

## Claude's Discretion
- Ruta/estructura exacta de la UI bajo `/agentes`.
- Forma del versionado KB (tabla dedicada vs JSONB).
- Cómo armar `contentToEmbed` desde columnas estructuradas (byte-equivalente al sync).

## Deferred Ideas
- Editar agentes de producción desde la UI (follow-up).
- Overrides de templates por workspace (follow-up).
- Crear intents nuevos desde la UI (requiere código).
- Export a `.md` desde la UI (nice-to-have).
- Re-embed async vía Inngest (si crece el volumen).
