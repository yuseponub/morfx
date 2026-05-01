import matter from 'gray-matter'
import { z } from 'zod'

/**
 * D-45: Frontmatter schema (7 fields, 5 required + 2 optional).
 */
export const FrontmatterSchema = z.object({
  topic: z.string().min(1),
  keywords: z.array(z.string()),
  category: z.enum(['product', 'policies', 'edge-cases', 'faqs-no-templated']),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'last_reviewed debe ser YYYY-MM-DD'),
  reviewed_by: z.string().min(1),
  escalate_if: z.array(z.string()).optional(),
  related_topics: z.array(z.string()).optional(),
})

export type Frontmatter = z.infer<typeof FrontmatterSchema>

export interface ParsedKbDoc {
  frontmatter: Frontmatter
  body: string
  sections: {
    canonica?: string
    alternativa?: string
    nuncaDecir: string[]
    sources?: string
  }
}

/**
 * Parsea un .md de knowledge base (D-45 frontmatter + D-49 body sections).
 * Lanza si frontmatter inválido (Zod schema fail).
 */
export function parseKbDoc(raw: string, filePath: string): ParsedKbDoc {
  const { data, content } = matter(raw)
  const parsed = FrontmatterSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(
      `Frontmatter inválido en ${filePath}: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    )
  }
  return {
    frontmatter: parsed.data,
    body: content,
    sections: parseSections(content),
  }
}

/**
 * Extrae secciones por header `## ` (D-49).
 * Headers reconocidos: 'Respuesta canónica', 'Si el cliente insiste', 'NUNCA decir', 'Sources'.
 * Cualquier header desconocido se ignora silenciosamente (extensibilidad D-46).
 * 'NUNCA decir' se parsea como lista bullet `- item` → string[].
 */
function parseSections(body: string): ParsedKbDoc['sections'] {
  const lines = body.split('\n')
  const sections: ParsedKbDoc['sections'] = { nuncaDecir: [] }
  let current: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (!current) return
    const text = buffer.join('\n').trim()
    if (current === 'canonica') sections.canonica = text || undefined
    else if (current === 'alternativa') sections.alternativa = text || undefined
    else if (current === 'sources') sections.sources = text || undefined
    else if (current === 'nuncaDecir') {
      sections.nuncaDecir = buffer
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim())
        .filter(Boolean)
    }
    buffer = []
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush()
      const header = line.slice(3).trim().toLowerCase()
      if (header.includes('respuesta canónica') || header.includes('respuesta canonica')) current = 'canonica'
      else if (header.includes('si el cliente insiste')) current = 'alternativa'
      else if (header.includes('nunca decir')) current = 'nuncaDecir'
      else if (header.includes('sources') || header.includes('notas')) current = 'sources'
      else current = null
    } else if (current) {
      buffer.push(line)
    }
  }
  flush()
  return sections
}
