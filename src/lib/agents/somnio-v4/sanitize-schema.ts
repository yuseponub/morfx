/**
 * Sanitización estructural de JSON Schema para el branch Anthropic (M-04 gemini-fallback-haiku).
 *
 * Pitfall #1 (RESEARCH): Anthropic via AI SDK devuelve 400 si el JSON Schema lleva
 * `minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` / `multipleOf`
 * (issues vercel/ai #14342, #13355). Gemini los ignora; Anthropic no.
 *
 * ANTES (M-04): el schema saneado de comprehension listaba 2 campos conocidos a mano
 * (intent_confidence / secondary_confidence). Cualquier campo futuro con .min/.max/.int
 * en MessageAnalysisSchema heredaba los bounds → el branch Anthropic rompía con 400 SIEMPRE,
 * y el bug solo se descubría durante el siguiente outage de Gemini (la peor ventana posible).
 *
 * AHORA: se recorre el JSON Schema completo (recursivo sobre properties / items / anyOf /
 * oneOf / allOf / $defs) y se eliminan los keywords numéricos GENÉRICAMENTE — sin lista fija.
 * Se preservan `description` (M-03: los describes son parte del prompt en structured output)
 * y el resto de la estructura (enum, required, type, nullable via anyOf, etc.).
 */

/** Keywords de constraint numérico que Anthropic rechaza con 400 en structured output. */
const NUMERIC_CONSTRAINT_KEYWORDS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
] as const

/**
 * Recorre un JSON Schema y elimina los keywords de constraint numérico en cualquier nivel.
 * Pure: no muta el input, devuelve una copia saneada. Preserva `description` y todo lo demás.
 */
export function stripNumericConstraints(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripNumericConstraints)
  }
  if (node === null || typeof node !== 'object') {
    return node
  }
  const obj = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if ((NUMERIC_CONSTRAINT_KEYWORDS as readonly string[]).includes(key)) {
      // Skip — este keyword rompe Anthropic con 400.
      continue
    }
    out[key] = stripNumericConstraints(value)
  }
  return out
}
