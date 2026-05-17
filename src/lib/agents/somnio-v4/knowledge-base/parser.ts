import matter from 'gray-matter'
import { z } from 'zod'

/**
 * Frontmatter schema (D-45 + D-05 RAG-generative).
 *
 * 5 campos required (topic, keywords, category, last_reviewed, reviewed_by)
 * + 3 opcionales (escalate_if, related_topics, tone_override).
 *
 * `tone_override` (D-05): si está presente, override del Tono Somnio global.
 * Null/ausente → usar TONE_BASE del system prompt.
 */
export const FrontmatterSchema = z.object({
  topic: z.string().min(1),
  keywords: z.array(z.string()),
  category: z.enum(['product', 'policies', 'edge-cases', 'faqs-no-templated']),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'last_reviewed debe ser YYYY-MM-DD'),
  reviewed_by: z.string().min(1),
  escalate_if: z.array(z.string()).optional(),
  related_topics: z.array(z.string()).optional(),
  tone_override: z.string().nullable().optional(),
})

export type Frontmatter = z.infer<typeof FrontmatterSchema>

/**
 * Parsed KB doc shape post somnio-v4-rag-generative Plan 01 (D-01 6 elementos:
 * frontmatter + 5 markdown sections).
 *
 * Headers reconocidos en body (D-01 #2..#6):
 * - `## Hechos del producto`      → hechosDelProducto: string
 * - `## Posición del negocio`     → posicionDelNegocio: string
 * - `## Debe contener la respuesta` → debeContener: string[] (items con prefijo [SIEMPRE]/[SI APLICA])
 * - `## NUNCA decir`              → nuncaDecir: string[]
 * - `## Cuándo escalar a humano`  → cuandoEscalar: string[]
 *
 * Headers DEPRECATED (somnio-v4-rag-generative kills canonical-verbatim):
 * `Respuesta canónica`, `Si el cliente insiste`, `Sources` — ignorados silenciosamente.
 */
export interface ParsedKbDoc {
  frontmatter: Frontmatter
  body: string
  sections: {
    hechosDelProducto: string
    posicionDelNegocio: string
    debeContener: string[]
    nuncaDecir: string[]
    cuandoEscalar: string[]
  }
}

/**
 * Parsea un .md de knowledge base (D-45 frontmatter + D-01 body sections).
 * Lanza si frontmatter inválido (Zod schema fail).
 */
export function parseKbDoc(raw: string, filePath: string): ParsedKbDoc {
  const { data, content } = matter(raw)
  // gray-matter parsea YAML "2026-05-01" como Date automáticamente. Lo normalizamos
  // a string YYYY-MM-DD para que el regex del FrontmatterSchema valide formato.
  const normalized = normalizeFrontmatterDates(data)
  const parsed = FrontmatterSchema.safeParse(normalized)
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
 * Convierte campos Date (auto-parseados por YAML/gray-matter) a string YYYY-MM-DD
 * para que la validación de regex en FrontmatterSchema funcione correctamente.
 * Solo afecta `last_reviewed` por ahora, pero es defensivo para cualquier campo Date.
 */
function normalizeFrontmatterDates(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  if (out.last_reviewed instanceof Date) {
    out.last_reviewed = out.last_reviewed.toISOString().slice(0, 10)
  }
  return out
}

/**
 * Extrae secciones por header `## ` (D-01 RAG-generative).
 *
 * Headers reconocidos (case-insensitive, acentos opcionales para defensive):
 * - 'Hechos del producto'                  → hechosDelProducto (string continuo)
 * - 'Posición del negocio' / 'Posicion'    → posicionDelNegocio (string continuo)
 * - 'Debe contener la respuesta' / 'Debe contener' → debeContener (bullets `- item`)
 * - 'NUNCA decir'                          → nuncaDecir (bullets `- item`)
 * - 'Cuándo escalar a humano' / 'Cuando escalar' → cuandoEscalar (bullets `- item`)
 *
 * Headers DEPRECATED (`Respuesta canónica`, `Si el cliente insiste`, `Sources`)
 * e headers desconocidos: ignorados silenciosamente.
 */
function parseSections(body: string): ParsedKbDoc['sections'] {
  const lines = body.split('\n')
  const sections: ParsedKbDoc['sections'] = {
    hechosDelProducto: '',
    posicionDelNegocio: '',
    debeContener: [],
    nuncaDecir: [],
    cuandoEscalar: [],
  }
  let current: 'hechos' | 'posicion' | 'debeContener' | 'nuncaDecir' | 'cuandoEscalar' | null = null
  let buffer: string[] = []

  const parseBullets = (lines: string[]): string[] =>
    lines
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter(Boolean)

  const flush = () => {
    if (!current) {
      buffer = []
      return
    }
    if (current === 'hechos') {
      sections.hechosDelProducto = buffer.join('\n').trim()
    } else if (current === 'posicion') {
      sections.posicionDelNegocio = buffer.join('\n').trim()
    } else if (current === 'debeContener') {
      sections.debeContener = parseBullets(buffer)
    } else if (current === 'nuncaDecir') {
      sections.nuncaDecir = parseBullets(buffer)
    } else if (current === 'cuandoEscalar') {
      sections.cuandoEscalar = parseBullets(buffer)
    }
    buffer = []
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush()
      const header = line.slice(3).trim().toLowerCase()
      // D-01 #2..#6 — 5 headers nuevos (con defensive sin tilde).
      if (header.includes('hechos del producto')) {
        current = 'hechos'
      } else if (header.includes('posición del negocio') || header.includes('posicion del negocio')) {
        current = 'posicion'
      } else if (header.includes('debe contener')) {
        // Acepta 'Debe contener la respuesta' y 'Debe contener'.
        current = 'debeContener'
      } else if (header.includes('nunca decir')) {
        current = 'nuncaDecir'
      } else if (header.includes('cuándo escalar') || header.includes('cuando escalar')) {
        // Acepta 'Cuándo escalar a humano' y 'Cuándo escalar'.
        current = 'cuandoEscalar'
      } else {
        // Headers deprecated (`Respuesta canónica`, `Si el cliente insiste`, `Sources`)
        // o desconocidos: ignorar silenciosamente.
        current = null
      }
    } else if (current) {
      buffer.push(line)
    }
  }
  flush()
  return sections
}
