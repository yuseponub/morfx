// src/lib/utils/initials.ts
// Grapheme-safe initials. NEVER index UTF-16 (n[0]/charAt(0)) over names — a lone
// surrogate (emoji/astral first char) streamed in SSR becomes U+FFFD on the client →
// React #418 hydration mismatch (whatsapp-inbox-reliability F-2).

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('es', { granularity: 'grapheme' })
    : null

/** First user-perceived grapheme of a string, or '' for empty/whitespace-only. */
export function firstGrapheme(input: string): string {
  const s = (input ?? '').trim()
  if (!s) return ''
  if (segmenter) {
    for (const { segment } of segmenter.segment(s)) return segment
    return ''
  }
  // Fallback: code-point split (never a lone surrogate, unlike s[0]).
  return Array.from(s)[0] ?? ''
}

/** Up to 2 initials from the first two whitespace-separated words, uppercased. */
export function getInitials(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return ''
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map(firstGrapheme)
    .join('')
    .toUpperCase()
}
