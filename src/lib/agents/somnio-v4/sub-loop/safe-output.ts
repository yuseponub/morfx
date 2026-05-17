/**
 * Defensive wrapper alrededor de `result.output` para escapar el bug vercel/ai#11348
 * (`NoObjectGeneratedError` thrown aunque haya JSON válido en `result.text`).
 *
 * Standalone somnio-v4-rag-generative Plan 03 (A3).
 * Source: RESEARCH § Pattern 3: Defensive output access (líneas 388-422).
 * Bug ticket: github.com/vercel/ai/issues/11348 (abierto 2025-12, sin fix a 2026-05).
 *
 * Uso:
 *   const result = await generateText({ output: Output.object({ schema }), ... })
 *   const parsed = safeAccessOutput(result, schema)  // siempre devuelve T válido o throwea con diagnostic
 *
 * `result` se tipa como `unknown` para evitar TS variance issues con
 * `GenerateTextResult<ToolSet, Output<...>>` (cada call inferencia un shape distinto
 * por sus tools/output generics, no asignable al default ToolSet del type).
 * El wrapper accede defensivamente por property name — no requiere type narrowing.
 */
import { NoObjectGeneratedError } from 'ai'
import { z } from 'zod'

export function safeAccessOutput<T>(
  result: unknown,
  schema: z.ZodSchema<T>,
): T {
  try {
    return (result as any).output as T
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err) && (result as any).text) {
      try {
        const parsed = JSON.parse((result as any).text)
        return schema.parse(parsed)
      } catch (parseErr) {
        throw new Error(
          `[safeAccessOutput] Got NoObjectGeneratedError + manual parse also failed: ` +
          `${(parseErr as Error).message} | text="${String((result as any).text).slice(0, 200)}"`,
        )
      }
    }
    throw err
  }
}
