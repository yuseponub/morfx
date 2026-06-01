// src/lib/agents/somnio-v4/knowledge-base/serialize.ts
// Canonical KB embedding serializer (standalone ui-agent-content-editor, Plan 01).
// SINGLE source of the embedding text form. Imported by:
//   - the migration re-embed pass (Plan 02 backfill)
//   - src/lib/domain/agent-knowledge-base.ts (Plan 04 — UI re-embed)
// RESEARCH Pitfall 1 / A1: byte-equivalence with legacy .md embeddings is IMPOSSIBLE
// (parser.ts:108-174 parseSections is lossy). This serializer re-embeds all 18 topics
// ONCE during the migration; legacy + future embeddings are then produced by THIS function.

export interface KbContentColumns {
  scope_summary: string | null
  hechos_del_producto: string | null
  posicion_del_negocio: string | null
  debe_contener: string[]
  nunca_decir: string[]
  cuando_escalar: string[]
}

/**
 * Builds the deterministic text fed to the embedding model for a KB topic, FROM DB COLUMNS
 * (never from .md / parser). Form:
 *
 *   [scope_summary + "\n\n"]            (omitted entirely when scope_summary is null/empty)
 *   "## Hechos del producto\n" + hechos_del_producto + "\n\n"
 *   "## Posición del negocio\n" + posicion_del_negocio + "\n\n"
 *   "## Debe contener la respuesta\n" + debe_contener bullets + "\n\n"
 *   "## NUNCA decir\n" + nunca_decir bullets + "\n\n"
 *   "## Cuándo escalar a humano\n" + cuando_escalar bullets
 *
 * Bullets render as "- {item}" joined by "\n". Empty arrays render the header followed
 * by an empty body (header line + nothing). Section text values are used verbatim (no trim
 * beyond what callers store). The trailing section has NO trailing newline.
 */
export function buildContentToEmbed(row: KbContentColumns): string {
  const bullets = (items: string[]): string => items.map((b) => `- ${b}`).join('\n')

  const sections: string[] = [
    `## Hechos del producto\n${row.hechos_del_producto ?? ''}`,
    `## Posición del negocio\n${row.posicion_del_negocio ?? ''}`,
    `## Debe contener la respuesta\n${bullets(row.debe_contener)}`,
    `## NUNCA decir\n${bullets(row.nunca_decir)}`,
    `## Cuándo escalar a humano\n${bullets(row.cuando_escalar)}`,
  ]

  const body = sections.join('\n\n')
  const scope = row.scope_summary && row.scope_summary.length > 0 ? `${row.scope_summary}\n\n` : ''
  return `${scope}${body}`
}
