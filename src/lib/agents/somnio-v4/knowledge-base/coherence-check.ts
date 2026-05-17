import type { ParsedKbDoc } from './parser'

/**
 * Coherence-check para KB docs de somnio-v4 (RAG-generative).
 *
 * Validaciones:
 *
 * 1. (D-48) folder padre del archivo coincide con frontmatter.category.
 *    E.g. `knowledge/product/foo.md` con frontmatter.category='product' → pass.
 *         `knowledge/product/foo.md` con frontmatter.category='policies' → throw.
 *
 * 2. (D-01 RAG-generative) las 5 markdown sections obligatorias están pobladas:
 *    - hechosDelProducto: non-empty string (D-01 #2)
 *    - posicionDelNegocio: non-empty string (D-01 #3)
 *    - debeContener: array non-empty (D-01 #4) + cada item empieza con
 *      `[SIEMPRE]` o `[SI APLICA]` (D-03)
 *    - nuncaDecir: array (puede ser vacío en topics no-edge-case)
 *    - cuandoEscalar: array (puede ser vacío)
 *
 * Standalone somnio-v4-rag-generative Plan 01 Task 1.3.
 *
 * Se llama desde syncKbDoc antes de embed/upsert.
 */
export function coherenceCheck(
  filePath: string,
  frontmatterCategory: string,
  sections: ParsedKbDoc['sections'],
): void {
  // 1. Folder vs frontmatter category — validación existente (D-48).
  // filePath ejemplo: 'src/lib/agents/somnio-v4/knowledge/product/precio_comparativo.md'
  const parts = filePath.replace(/\\/g, '/').split('/')
  const folderCategory = parts[parts.length - 2]
  if (frontmatterCategory !== folderCategory) {
    throw new Error(
      `Coherence fail: ${filePath} folder=${folderCategory} frontmatter.category=${frontmatterCategory}`,
    )
  }

  // 2. Validaciones nuevas — secciones requeridas (D-01 RAG-generative).
  if (!sections.hechosDelProducto || sections.hechosDelProducto.trim().length === 0) {
    throw new Error(
      `Coherence fail: ${filePath} — '## Hechos del producto' vacío o ausente`,
    )
  }
  if (!sections.posicionDelNegocio || sections.posicionDelNegocio.trim().length === 0) {
    throw new Error(
      `Coherence fail: ${filePath} — '## Posición del negocio' vacío o ausente`,
    )
  }
  if (!Array.isArray(sections.debeContener) || sections.debeContener.length === 0) {
    throw new Error(
      `Coherence fail: ${filePath} — '## Debe contener la respuesta' vacío o ausente`,
    )
  }

  // D-03 — cada item de debeContener debe empezar con [SIEMPRE] o [SI APLICA].
  const prefijoRegex = /^\[(SIEMPRE|SI APLICA)\]\s+/
  for (let i = 0; i < sections.debeContener.length; i++) {
    const item = sections.debeContener[i]
    if (!prefijoRegex.test(item)) {
      throw new Error(
        `Coherence fail: ${filePath} — '## Debe contener' item ${i} no empieza con [SIEMPRE] ni [SI APLICA]: "${item.slice(0, 80)}"`,
      )
    }
  }

  // nuncaDecir + cuandoEscalar pueden ser arrays vacíos en topics no-edge-case.
  // Validamos solamente que sean arrays.
  if (!Array.isArray(sections.nuncaDecir)) {
    throw new Error(
      `Coherence fail: ${filePath} — '## NUNCA decir' debe ser array (puede ser vacío)`,
    )
  }
  if (!Array.isArray(sections.cuandoEscalar)) {
    throw new Error(
      `Coherence fail: ${filePath} — '## Cuándo escalar a humano' debe ser array (puede ser vacío)`,
    )
  }
}
