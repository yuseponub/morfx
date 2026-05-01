/**
 * D-48: valida que la carpeta padre del archivo coincida con frontmatter.category.
 * E.g. `knowledge/product/foo.md` con frontmatter.category='product' → pass.
 *      `knowledge/product/foo.md` con frontmatter.category='policies' → throw.
 *
 * Se llama desde syncKbDoc antes de embed/upsert.
 */
export function coherenceCheck(filePath: string, frontmatterCategory: string): void {
  // filePath ejemplo: 'src/lib/agents/somnio-v4/knowledge/product/precio_comparativo.md'
  const parts = filePath.replace(/\\/g, '/').split('/')
  const folderCategory = parts[parts.length - 2]
  if (frontmatterCategory !== folderCategory) {
    throw new Error(
      `Coherence fail: ${filePath} folder=${folderCategory} frontmatter.category=${frontmatterCategory}`
    )
  }
}
